import type { FluentDatabase, FluentPreparedStatement } from './storage';

/**
 * Durable, privacy-safe record of hosted bearer-auth rejections, so "never
 * tried" and "tried and was rejected" are distinguishable in the funnel.
 *
 * Every rejection increments a daily counter keyed only by UTC day, reason
 * category, and coarse route class. Nothing account-scoped is recorded:
 * tokens, token hashes, emails, user/tenant/client ids, IPs, and user agents
 * are never stored or logged here.
 *
 * Rejections include credential-less requests that no rate limiter covers, so
 * recording is decoupled from request volume: counts aggregate in memory per
 * isolate and are written as one bounded batch at most once per flush window.
 * A flush only starts when the caller supplies its request lifetime, and is
 * always registered with it. Recording never awaits the database. Counts are best-effort: an isolate that
 * is evicted before its next flush loses its pending counts.
 */
export type HostedAuthRejectionReason =
  | 'missing_token'
  | 'malformed_authorization'
  | 'invalid_token'
  | 'expired_token'
  | 'wrong_audience'
  | 'wrong_issuer'
  | 'invalid_claims'
  | 'client_revoked'
  | 'client_policy'
  | 'account_access'
  | 'account_deletion'
  | 'verification_error';

export type HostedAuthRouteClass = 'mcp' | 'mcp_root' | 'other';

export interface HostedAuthRejection {
  /** Fixed, non-identifying product code (for example an access-policy code). */
  code?: string | null;
  reason: HostedAuthRejectionReason;
  request: Request;
}

/**
 * The request's execution lifetime (Workers ctx.waitUntil). Every background
 * flush is registered with it; callers without one pass null explicitly, and
 * their counts stay pending until a caller with a lifetime flushes them.
 */
export interface HostedRequestLifetime {
  waitUntil(promise: Promise<unknown>): void;
}

export function hostedRequestLifetime(
  ctx: { waitUntil?: (promise: Promise<unknown>) => void } | null | undefined,
): HostedRequestLifetime | null {
  return ctx && typeof ctx.waitUntil === 'function'
    ? { waitUntil: (promise) => ctx.waitUntil!(promise) }
    : null;
}

/** At most one D1 write (a single batch) per isolate per window. */
const FLUSH_INTERVAL_MS = 60_000;
/** Hard per-isolate cap on distinct pending keys; also the max statements per batch. */
const MAX_PENDING_KEYS = 64;
const OVERFLOW_REASON = 'overflow';

type PendingEntry = {
  count: number;
  day: string;
  firstSeenAt: string;
  lastSeenAt: string;
  reason: string;
  routeClass: HostedAuthRouteClass;
};

let pending = new Map<string, PendingEntry>();
let lastFlushAt = Number.NEGATIVE_INFINITY;
let inFlight: Promise<void> | null = null;
let now = () => Date.now();

export function classifyHostedAuthRoute(request: Request): HostedAuthRouteClass {
  const { pathname } = new URL(request.url);
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    return 'mcp';
  }
  if (pathname === '/') {
    return 'mcp_root';
  }
  return 'other';
}

/** Synchronous and never throws: telemetry must not change or delay the auth response. */
export function recordHostedAuthRejection(
  db: FluentDatabase | null | undefined,
  rejection: HostedAuthRejection,
  lifetime: HostedRequestLifetime | null,
): void {
  try {
    const routeClass = classifyHostedAuthRoute(rejection.request);
    const reason = rejection.code ? `${rejection.reason}:${sanitizeCode(rejection.code)}` : rejection.reason;
    console.log(JSON.stringify({ event: 'auth.bearer_rejected', reason, routeClass }));
    addPending(reason, routeClass, 1, new Date(now()).toISOString());
    // Never start an unregistered flush: Workers may cancel it after the
    // response and lose the counts it already took off the pending map.
    if (db && lifetime && !inFlight && now() - lastFlushAt >= FLUSH_INTERVAL_MS) {
      lifetime.waitUntil(startFlush(db));
    }
  } catch (error) {
    console.warn(JSON.stringify({ event: 'auth.bearer_rejected.record_failed', stage: 'aggregate', errorName: errorName(error) }));
  }
}

/** Writes all pending counts now (after any in-flight flush). For tests and scheduled drains. */
export async function flushHostedAuthRejections(db: FluentDatabase): Promise<void> {
  if (inFlight) {
    await inFlight;
  }
  await startFlush(db);
}

function startFlush(db: FluentDatabase): Promise<void> {
  lastFlushAt = now();
  const batch = pending;
  pending = new Map();
  const flush = writeBatch(db, [...batch.values()])
    .catch((error) => {
      for (const entry of batch.values()) {
        addPending(entry.reason, entry.routeClass, entry.count, entry.firstSeenAt, entry);
      }
      console.warn(JSON.stringify({ event: 'auth.bearer_rejected.record_failed', stage: 'flush', errorName: errorName(error) }));
    })
    .finally(() => {
      if (inFlight === flush) {
        inFlight = null;
      }
    });
  inFlight = flush;
  return flush;
}

async function writeBatch(db: FluentDatabase, entries: PendingEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  const statements: FluentPreparedStatement[] = entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO fluent_cloud_auth_rejections_daily (day, reason, route_class, rejection_count, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, reason, route_class) DO UPDATE SET
           rejection_count = rejection_count + excluded.rejection_count,
           last_seen_at = excluded.last_seen_at`,
      )
      .bind(entry.day, entry.reason, entry.routeClass, entry.count, entry.firstSeenAt, entry.lastSeenAt),
  );
  await db.batch(statements);
}

function addPending(
  reason: string,
  routeClass: HostedAuthRouteClass,
  count: number,
  seenAt: string,
  restored?: PendingEntry,
): void {
  const day = restored?.day ?? seenAt.slice(0, 10);
  let key = `${day}|${reason}|${routeClass}`;
  let effectiveReason = reason;
  if (!pending.has(key) && pending.size >= MAX_PENDING_KEYS - 1 && reason !== OVERFLOW_REASON) {
    // Keep one slot for an overflow bucket so a flood of distinct codes is
    // still counted without growing memory or the batch size.
    effectiveReason = OVERFLOW_REASON;
    key = `${day}|${OVERFLOW_REASON}|${routeClass}`;
    if (!pending.has(key) && pending.size >= MAX_PENDING_KEYS) {
      key = [...pending.keys()].find((existing) => existing.includes(`|${OVERFLOW_REASON}|`)) ?? key;
    }
  }
  const existing = pending.get(key);
  if (existing) {
    existing.count += count;
    if (seenAt > existing.lastSeenAt) existing.lastSeenAt = seenAt;
    if ((restored?.firstSeenAt ?? seenAt) < existing.firstSeenAt) existing.firstSeenAt = restored?.firstSeenAt ?? seenAt;
    return;
  }
  if (pending.size >= MAX_PENDING_KEYS) {
    return;
  }
  pending.set(key, {
    count,
    day,
    firstSeenAt: restored?.firstSeenAt ?? seenAt,
    lastSeenAt: restored?.lastSeenAt ?? seenAt,
    reason: effectiveReason,
    routeClass,
  });
}

function sanitizeCode(code: string): string {
  return code.replace(/[^a-z0-9_.-]/gi, '').slice(0, 64) || 'unknown';
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export const __hostedAuthRejectionTelemetryForTests = {
  pendingKeyCount: () => pending.size,
  reset() {
    pending = new Map();
    lastFlushAt = Number.NEGATIVE_INFINITY;
    inFlight = null;
    now = () => Date.now();
  },
  setNow(next: () => number) {
    now = next;
  },
};
