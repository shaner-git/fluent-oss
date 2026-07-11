import {
  applyFluentCloudOperatorAction,
  getFluentCloudOnboardingRecord,
  listFluentCloudOnboardingRecords,
  type FluentCloudOnboardingRecord,
  type FluentCloudOnboardingState,
} from './cloud-onboarding';
import { purgeCloudAccountData } from './account-purge';
import type { CoreRuntimeBindings, CloudRuntimeEnv } from './config';
import type { FluentDatabase } from './storage';

export const FLUENT_SUBSCRIPTION_GRACE_DAYS = 7;
export const FLUENT_LAPSED_DATA_RETENTION_DAYS = 90;

export const LIMITED_ACCESS_ALLOWED_TOOLS = [
  'fluent_get_account_status',
  'fluent_get_capabilities',
] as const;

export type FluentSubscriptionLifecycleAccess =
  | 'full_access'
  | 'limited_access'
  | 'retention_expired'
  | 'suspended'
  | 'deleted'
  | 'blocked';

export interface FluentSubscriptionLifecycleDecision {
  access: FluentSubscriptionLifecycleAccess;
  currentState: FluentCloudOnboardingState | null;
  graceDeadline: string | null;
  message: string;
  retentionDeadline: string | null;
}

interface CleanupCandidate {
  current_state: string;
  email: string | null;
  email_normalized: string;
  tenant_id: string | null;
  user_id: string | null;
}

export function calculateSubscriptionGraceDeadline(record: FluentCloudOnboardingRecord | null): string | null {
  return addDays(record?.timestamps.pastDueGraceAt ?? null, FLUENT_SUBSCRIPTION_GRACE_DAYS);
}

export function calculateLapsedRetentionDeadline(record: FluentCloudOnboardingRecord | null): string | null {
  return addDays(
    record?.timestamps.canceledRetentionAt ?? record?.timestamps.limitedAccessAt ?? null,
    FLUENT_LAPSED_DATA_RETENTION_DAYS,
  );
}

export function evaluateSubscriptionLifecycle(
  record: FluentCloudOnboardingRecord | null,
  now: Date = new Date(),
): FluentSubscriptionLifecycleDecision {
  if (!record) {
    return {
      access: 'blocked',
      currentState: null,
      graceDeadline: null,
      message: 'Fluent could not find an account lifecycle record for this user.',
      retentionDeadline: null,
    };
  }

  const graceDeadline = calculateSubscriptionGraceDeadline(record);
  const retentionDeadline = calculateLapsedRetentionDeadline(record);
  switch (record.currentState) {
    case 'trialing':
    case 'active':
      return {
        access: 'full_access',
        currentState: record.currentState,
        graceDeadline,
        message: 'Your Fluent account has full access.',
        retentionDeadline,
      };
    case 'past_due_grace':
      if (graceDeadline && now.getTime() > new Date(graceDeadline).getTime()) {
        return {
          access: 'limited_access',
          currentState: record.currentState,
          graceDeadline,
          message:
            'Your Fluent payment grace period has ended. Fluent is limited to export, deletion, reactivation, and billing management until billing is resolved.',
          retentionDeadline: addDays(graceDeadline, FLUENT_LAPSED_DATA_RETENTION_DAYS),
        };
      }
      return {
        access: 'full_access',
        currentState: record.currentState,
        graceDeadline,
        message: `Your Fluent account is in payment grace through ${graceDeadline ?? 'the grace deadline'}.`,
        retentionDeadline,
      };
    case 'limited_access':
    case 'canceled_retention':
      if (retentionDeadline && now.getTime() > new Date(retentionDeadline).getTime()) {
        return {
          access: 'retention_expired',
          currentState: record.currentState,
          graceDeadline,
          message: 'This Fluent account has passed its 90-day data retention window.',
          retentionDeadline,
        };
      }
      return {
        access: 'limited_access',
        currentState: record.currentState,
        graceDeadline,
        message:
          'Your Fluent account is in limited access. You can export your data, request deletion, reactivate, or manage billing during retention.',
        retentionDeadline,
      };
    case 'suspended':
      return {
        access: 'suspended',
        currentState: record.currentState,
        graceDeadline,
        message: 'This Fluent account is suspended or pending deletion. Contact support if you need access restored.',
        retentionDeadline,
      };
    case 'deletion_requested':
      return {
        access: 'suspended',
        currentState: record.currentState,
        graceDeadline,
        message: 'This Fluent account has a deletion request in progress. Contact support if you want to cancel or confirm the request.',
        retentionDeadline,
      };
    case 'deleted':
      return {
        access: 'deleted',
        currentState: record.currentState,
        graceDeadline,
        message: 'This Fluent account has been deleted.',
        retentionDeadline,
      };
    case 'waitlisted':
      return {
        access: 'blocked',
        currentState: record.currentState,
        graceDeadline,
        message: 'This Fluent account is still on the early-access waitlist. There is nothing to fix in ChatGPT yet.',
        retentionDeadline,
      };
    case 'invited':
      return {
        access: 'blocked',
        currentState: record.currentState,
        graceDeadline,
        message: 'Your Fluent invite is waiting for you to accept it before the account can be used.',
        retentionDeadline,
      };
    case 'invite_accepted':
      return {
        access: 'blocked',
        currentState: record.currentState,
        graceDeadline,
        message: 'Your Fluent invite is accepted, but account setup is not finished yet.',
        retentionDeadline,
      };
    case 'account_created':
      return {
        access: 'blocked',
        currentState: record.currentState,
        graceDeadline,
        message: 'Your Fluent account exists, but setup is still being finished.',
        retentionDeadline,
      };
    case 'checkout_required':
      return {
        access: 'blocked',
        currentState: record.currentState,
        graceDeadline,
        message: 'Your Fluent account needs account setup or billing completed on meetfluent.app before the account is available.',
        retentionDeadline,
      };
    default:
      return {
        access: 'blocked',
        currentState: record.currentState,
        graceDeadline,
        message: 'Fluent does not recognize this account state yet. Contact support before relying on account access.',
        retentionDeadline,
      };
  }
}

export function assertToolAllowedForSubscriptionLifecycle(
  record: FluentCloudOnboardingRecord | null,
  toolName: string,
  now: Date = new Date(),
): void {
  const decision = evaluateSubscriptionLifecycle(record, now);
  if (decision.access === 'full_access') {
    return;
  }
  if (decision.access === 'limited_access' && LIMITED_ACCESS_ALLOWED_TOOLS.includes(toolName as never)) {
    return;
  }

  const deadline = decision.retentionDeadline ? ` Retention ends ${decision.retentionDeadline}.` : '';
  throw new Error(`${decision.message}${deadline} Use the account export, deletion, reactivation, or billing routes instead.`);
}

export async function assertCurrentUserToolAllowedForSubscriptionLifecycle(
  db: FluentDatabase,
  input: {
    email?: string | null;
    tenantId?: string | null;
    toolName: string;
    userId?: string | null;
  },
): Promise<void> {
  const record = await getFluentCloudOnboardingRecord(db, {
    email: input.email ?? null,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
  });
  assertToolAllowedForSubscriptionLifecycle(record, input.toolName);
}

export async function transitionExpiredPastDueGrace(
  db: FluentDatabase,
  now: Date = new Date(),
): Promise<number> {
  const records = await listFluentCloudOnboardingRecords(db, { limit: 100, state: 'past_due_grace' });
  let transitioned = 0;
  for (const record of records) {
    const decision = evaluateSubscriptionLifecycle(record, now);
    if (decision.access !== 'limited_access') {
      continue;
    }
    await applyFluentCloudOperatorAction(db, {
      action: 'mark_limited_access',
      actorLabel: 'subscription-lifecycle-cleanup',
      actorType: 'system',
      email: record.email ?? record.emailNormalized,
      metadata: {
        graceDeadline: decision.graceDeadline,
        reason: 'past_due_grace_expired',
      },
      note: 'Payment grace expired; account moved to limited access.',
    });
    transitioned += 1;
  }
  return transitioned;
}

export async function runSubscriptionLifecycleCleanup(
  bindings: Pick<CoreRuntimeBindings, 'artifacts' | 'db'>,
  now: Date = new Date(),
): Promise<{ cleaned: number; transitioned: number }> {
  const transitioned = await transitionExpiredPastDueGrace(bindings.db, now);
  const cutoff = new Date(now.getTime() - FLUENT_LAPSED_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = await bindings.db
    .prepare(
      `SELECT email, email_normalized, user_id, tenant_id, current_state
       FROM fluent_cloud_onboarding
       WHERE current_state IN ('limited_access', 'canceled_retention')
         AND COALESCE(canceled_retention_at, limited_access_at) IS NOT NULL
         AND COALESCE(canceled_retention_at, limited_access_at) <= ?
       ORDER BY updated_at ASC
       LIMIT 100`,
    )
    .bind(cutoff)
    .all<CleanupCandidate>();

  let cleaned = 0;
  for (const candidate of result.results ?? []) {
    await cleanupExpiredLapsedAccount(bindings, candidate, now);
    cleaned += 1;
  }
  return { cleaned, transitioned };
}

export async function reactivateCurrentUserAccount(
  db: FluentDatabase,
  user: { email?: string | null; id: string },
): Promise<{ message: string; state: FluentCloudOnboardingState }> {
  const record = await getFluentCloudOnboardingRecord(db, {
    email: user.email ?? null,
    userId: user.id,
  });
  const decision = evaluateSubscriptionLifecycle(record);
  if (!record || (decision.access !== 'limited_access' && record.currentState !== 'past_due_grace')) {
    throw new Error(decision.message);
  }

  const updated = await applyFluentCloudOperatorAction(db, {
    action: 'mark_active',
    actorLabel: 'self-serve-reactivation',
    actorType: 'system',
    email: record.email ?? record.emailNormalized,
    metadata: {
      previousState: record.currentState,
      retentionDeadline: decision.retentionDeadline,
    },
    note: 'Account reactivated through self-serve lifecycle route.',
  });
  await db
    .prepare(
      `UPDATE fluent_user_memberships
       SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .bind(user.id)
    .run();
  return {
    message: 'Your Fluent account has been reactivated.',
    state: updated.currentState,
  };
}

async function cleanupExpiredLapsedAccount(
  bindings: Pick<CoreRuntimeBindings, 'artifacts' | 'db'>,
  candidate: CleanupCandidate,
  now: Date,
): Promise<void> {
  await recordLifecycleAuditEvent(bindings.db, {
    email: candidate.email,
    eventType: 'subscription_lifecycle.retention_cleanup_started',
    metadata: {
      cleanupAt: now.toISOString(),
      previousState: candidate.current_state,
    },
    tenantId: candidate.tenant_id,
    userId: candidate.user_id,
  });

  await purgeCloudAccountData(bindings, {
    email: candidate.email,
    emailNormalized: candidate.email_normalized,
    tenantId: candidate.tenant_id,
    userId: candidate.user_id,
  });

  await recordLifecycleAuditEvent(bindings.db, {
    email: candidate.email,
    eventType: 'subscription_lifecycle.retention_cleanup_completed',
    metadata: {
      cleanupAt: now.toISOString(),
      stripeRecordsUntouched: true,
    },
    tenantId: candidate.tenant_id,
    userId: candidate.user_id,
  });
}

async function recordLifecycleAuditEvent(
  db: FluentDatabase,
  input: {
    email?: string | null;
    eventType: string;
    metadata?: unknown;
    tenantId?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO domain_events (
         id, domain, entity_type, entity_id, event_type, patch_json,
         source_agent, source_type, actor_email
       ) VALUES (?, 'core', 'subscription_lifecycle', ?, ?, ?, 'fluent-cloud', 'system', ?)`,
    )
    .bind(
      `domain-event:${crypto.randomUUID()}`,
      input.userId ?? input.tenantId ?? input.email ?? 'unknown',
      input.eventType,
      JSON.stringify(input.metadata ?? null),
      input.email ?? null,
    )
    .run();
}

function addDays(value: string | null, days: number): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  });
}
