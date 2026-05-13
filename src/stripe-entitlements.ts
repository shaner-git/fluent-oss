import { createHmac, timingSafeEqual } from 'node:crypto';
import { applyFluentCloudOperatorAction, getFluentCloudOnboardingRecord } from './cloud-onboarding';
import type { CloudRuntimeEnv } from './config';
import type { FluentDatabase } from './storage';

export type FluentEntitlementAccessState =
  | 'full_access'
  | 'billing_notice'
  | 'limited_access'
  | 'canceled_retention';

export type StripeSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused'
  | 'incomplete'
  | 'incomplete_expired'
  | string;

export type StripeSubscriptionLike = {
  id: string;
  customer?: string | { id?: string | null; email?: string | null } | null;
  status?: StripeSubscriptionStatus | null;
  current_period_end?: number | string | null;
  cancel_at?: number | string | null;
  canceled_at?: number | string | null;
  ended_at?: number | string | null;
  pause_collection?: unknown;
  metadata?: Record<string, string | null | undefined> | null;
};

export type StripeCheckoutSessionLike = {
  id?: string | null;
  client_reference_id?: string | null;
  customer?: string | { id?: string | null; email?: string | null } | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string | null | undefined> | null;
  subscription?: string | StripeSubscriptionLike | null;
};

export type StripeInvoiceLike = {
  id?: string | null;
  customer?: string | { id?: string | null; email?: string | null } | null;
  customer_email?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
  subscription?: string | StripeSubscriptionLike | null;
};

export type StripeEventLike = {
  id: string;
  api_version?: string | null;
  created?: number | string | null;
  livemode?: boolean;
  type: string;
  data?: {
    object?: unknown;
  };
};

export type EntitlementDecision = {
  accessEndsAt: string | null;
  accessState: FluentEntitlementAccessState;
  billingNotice: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  onboardingState: 'trialing' | 'active' | 'past_due_grace' | 'limited_access' | 'canceled_retention';
  pastDueStartedAt: string | null;
  retentionEndsAt: string | null;
  retentionStartedAt: string | null;
  stripeStatus: string;
};

export type StripeEventProcessResult = {
  eventId: string;
  processed: boolean;
  reason: 'processed' | 'duplicate' | 'ignored';
};

const PAST_DUE_GRACE_DAYS = 7;
const CANCELED_RETENTION_DAYS = 90;

const STRIPE_SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

const STRIPE_CHECKOUT_EVENTS = new Set(['checkout.session.completed']);
const STRIPE_INVOICE_EVENTS = new Set(['invoice.payment_failed']);

type ExistingEntitlementRow = {
  email: string | null;
  email_normalized: string | null;
  past_due_started_at: string | null;
  retention_started_at: string | null;
  tenant_id: string | null;
  user_id: string | null;
};

export function mapStripeSubscriptionToEntitlement(
  subscription: StripeSubscriptionLike,
  options: {
    existing?: Pick<ExistingEntitlementRow, 'past_due_started_at' | 'retention_started_at'> | null;
    now?: Date;
    stripeEventCreatedAt?: string | null;
  } = {},
): EntitlementDecision {
  const now = options.now ?? new Date();
  const eventTime = parseIsoOrNull(options.stripeEventCreatedAt) ?? now;
  const rawStatus = normalizeText(subscription.status) ?? 'unknown';
  const status = subscription.pause_collection ? 'paused' : rawStatus;
  const currentPeriodEnd = stripeTimestampToIso(subscription.current_period_end);
  const accessEndsAt = stripeTimestampToIso(subscription.ended_at) ?? stripeTimestampToIso(subscription.canceled_at) ?? currentPeriodEnd;

  if (status === 'trialing') {
    return baseDecision(status, 'full_access', 'trialing', currentPeriodEnd, accessEndsAt);
  }
  if (status === 'active') {
    return baseDecision(status, 'full_access', 'active', currentPeriodEnd, accessEndsAt);
  }
  if (status === 'past_due') {
    const pastDueStartedAt = options.existing?.past_due_started_at ?? eventTime.toISOString();
    const graceEndsAt = addDays(pastDueStartedAt, PAST_DUE_GRACE_DAYS);
    const inGrace = Date.parse(graceEndsAt) >= now.getTime();
    return {
      accessEndsAt,
      accessState: inGrace ? 'billing_notice' : 'limited_access',
      billingNotice: inGrace
        ? `Billing is past due. Full access continues until ${graceEndsAt}.`
        : 'Billing is past due and the grace period has ended.',
      currentPeriodEnd,
      graceEndsAt,
      onboardingState: inGrace ? 'past_due_grace' : 'limited_access',
      pastDueStartedAt,
      retentionEndsAt: null,
      retentionStartedAt: null,
      stripeStatus: status,
    };
  }
  if (status === 'canceled') {
    const retentionStartedAt = accessEndsAt ?? options.existing?.retention_started_at ?? eventTime.toISOString();
    return {
      accessEndsAt,
      accessState: 'canceled_retention',
      billingNotice: 'Subscription is canceled. Fluent is in limited access during the retention window.',
      currentPeriodEnd,
      graceEndsAt: null,
      onboardingState: 'canceled_retention',
      pastDueStartedAt: null,
      retentionEndsAt: addDays(retentionStartedAt, CANCELED_RETENTION_DAYS),
      retentionStartedAt,
      stripeStatus: status,
    };
  }
  if (status === 'unpaid' || status === 'paused') {
    return {
      accessEndsAt,
      accessState: 'limited_access',
      billingNotice: `Subscription is ${status}. Fluent is in limited access.`,
      currentPeriodEnd,
      graceEndsAt: null,
      onboardingState: 'limited_access',
      pastDueStartedAt: null,
      retentionEndsAt: null,
      retentionStartedAt: null,
      stripeStatus: status,
    };
  }

  return {
    accessEndsAt,
    accessState: 'limited_access',
    billingNotice: `Subscription is ${status}. Fluent is in limited access.`,
    currentPeriodEnd,
    graceEndsAt: null,
    onboardingState: 'limited_access',
    pastDueStartedAt: null,
    retentionEndsAt: null,
    retentionStartedAt: null,
    stripeStatus: status,
  };
}

export function isLimitedEntitlementAccess(value: string | null | undefined): boolean {
  return value === 'limited_access' || value === 'canceled_retention';
}

export async function processStripeWebhookRequest(
  request: Request,
  env: CloudRuntimeEnv,
  db: FluentDatabase,
): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return json({ error: 'Stripe webhook secret is not configured.' }, 503);
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!(await verifyStripeWebhookSignature(payload, signature, secret))) {
    return json({ error: 'Invalid Stripe webhook signature.' }, 400);
  }

  let event: StripeEventLike;
  try {
    event = JSON.parse(payload) as StripeEventLike;
  } catch {
    return json({ error: 'Invalid Stripe webhook JSON.' }, 400);
  }

  try {
    const result = await processStripeEvent(db, event, payload);
    return json(result);
  } catch (error) {
    console.error('Stripe webhook processing failed.', {
      eventId: event.id ?? null,
      eventType: event.type ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ error: 'Stripe webhook processing failed.' }, 500);
  }
}

export async function processStripeEvent(
  db: FluentDatabase,
  event: StripeEventLike,
  payloadJson = JSON.stringify(event),
  options: { now?: Date } = {},
): Promise<StripeEventProcessResult> {
  if (!event.id?.trim()) {
    throw new Error('Stripe event id is required.');
  }

  const existingEvent = await db
    .prepare('SELECT processing_status FROM stripe_event_log WHERE event_id = ? LIMIT 1')
    .bind(event.id)
    .first<{ processing_status: string | null }>();
  if (existingEvent?.processing_status === 'processed') {
    return { eventId: event.id, processed: false, reason: 'duplicate' };
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO stripe_event_log (
        event_id, event_type, livemode, api_version, stripe_created_at, payload_json, processing_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
    )
    .bind(
      event.id,
      event.type,
      event.livemode ? 1 : 0,
      event.api_version ?? null,
      stripeTimestampToIso(event.created),
      payloadJson,
    )
    .run();

  try {
    if (
      !STRIPE_SUBSCRIPTION_EVENTS.has(event.type) &&
      !STRIPE_CHECKOUT_EVENTS.has(event.type) &&
      !STRIPE_INVOICE_EVENTS.has(event.type)
    ) {
      await markStripeEventProcessed(db, event.id);
      return { eventId: event.id, processed: false, reason: 'ignored' };
    }

    const subscription = extractSubscriptionFromStripeEvent(event);
    if (!subscription?.id) {
      throw new Error(`Stripe event ${event.id} does not contain an expanded subscription object.`);
    }
    await syncStripeSubscriptionEntitlement(db, subscription, {
      event,
      now: options.now,
      rawSubscriptionJson: JSON.stringify(subscription),
    });
    await markStripeEventProcessed(db, event.id);
    return { eventId: event.id, processed: true, reason: 'processed' };
  } catch (error) {
    await db
      .prepare(
        `UPDATE stripe_event_log
         SET processing_status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
         WHERE event_id = ?`,
      )
      .bind(error instanceof Error ? error.message : String(error), event.id)
      .run();
    throw error;
  }
}

function extractSubscriptionFromStripeEvent(event: StripeEventLike): StripeSubscriptionLike | null {
  if (STRIPE_SUBSCRIPTION_EVENTS.has(event.type)) {
    return (event.data?.object as StripeSubscriptionLike | undefined) ?? null;
  }
  if (!STRIPE_CHECKOUT_EVENTS.has(event.type)) {
    if (STRIPE_INVOICE_EVENTS.has(event.type)) {
      return extractSubscriptionFromInvoice(event.data?.object as StripeInvoiceLike | undefined);
    }
    return null;
  }

  const session = event.data?.object as StripeCheckoutSessionLike | undefined;
  const expandedSubscription = session?.subscription;
  const subscriptionId = typeof expandedSubscription === 'string' ? normalizeText(expandedSubscription) : null;
  if (!expandedSubscription || (!subscriptionId && typeof expandedSubscription !== 'object')) {
    return null;
  }

  const sessionMetadata = normalizeMetadataWithEmail(session?.metadata, session?.customer_details?.email ?? session?.customer_email);
  if (subscriptionId) {
    return {
      customer: session?.customer ?? null,
      id: subscriptionId,
      metadata: sessionMetadata,
      status: 'trialing',
    };
  }
  if (typeof expandedSubscription !== 'object') {
    return null;
  }

  const metadata = {
    ...sessionMetadata,
    ...(expandedSubscription.metadata ?? {}),
  };
  const customer = expandedSubscription.customer ?? session.customer ?? null;
  return {
    ...expandedSubscription,
    customer,
    metadata,
  };
}

function extractSubscriptionFromInvoice(invoice: StripeInvoiceLike | undefined): StripeSubscriptionLike | null {
  const invoiceSubscription = invoice?.subscription;
  const subscriptionId =
    typeof invoiceSubscription === 'string' ? normalizeText(invoiceSubscription) : normalizeText(invoiceSubscription?.id);
  if (!subscriptionId) {
    return null;
  }

  const subscriptionObject = typeof invoiceSubscription === 'object' && invoiceSubscription ? invoiceSubscription : null;
  return {
    ...(subscriptionObject ?? {}),
    customer: subscriptionObject?.customer ?? invoice?.customer ?? null,
    id: subscriptionId,
    metadata: {
      ...normalizeMetadataWithEmail(invoice?.metadata, invoice?.customer_email),
      ...(subscriptionObject?.metadata ?? {}),
    },
    status: subscriptionObject?.status ?? 'past_due',
  };
}

export async function syncStripeSubscriptionEntitlement(
  db: FluentDatabase,
  subscription: StripeSubscriptionLike,
  options: {
    event?: Pick<StripeEventLike, 'id' | 'type' | 'created'> | null;
    now?: Date;
    rawSubscriptionJson?: string | null;
  } = {},
): Promise<EntitlementDecision> {
  const stripeSubscriptionId = normalizeText(subscription.id);
  const stripeCustomerId = normalizeStripeCustomerId(subscription.customer);
  if (!stripeSubscriptionId) {
    throw new Error('Stripe subscription id is required.');
  }
  if (!stripeCustomerId) {
    throw new Error(`Stripe customer id is required for subscription ${stripeSubscriptionId}.`);
  }

  const existing = await findExistingEntitlement(db, { stripeCustomerId, stripeSubscriptionId });
  const resolvedIdentity = await resolveEntitlementIdentity(db, subscription, existing);
  const eventCreatedAt = stripeTimestampToIso(options.event?.created) ?? new Date().toISOString();
  const decision = mapStripeSubscriptionToEntitlement(subscription, {
    existing,
    now: options.now,
    stripeEventCreatedAt: eventCreatedAt,
  });

  await upsertEntitlement(db, {
    decision,
    email: resolvedIdentity.email,
    emailNormalized: resolvedIdentity.emailNormalized,
    eventCreatedAt,
    eventId: options.event?.id ?? null,
    eventType: options.event?.type ?? 'manual_reconciliation',
    rawSubscriptionJson: options.rawSubscriptionJson ?? JSON.stringify(subscription),
    stripeCustomerId,
    stripeSubscriptionId,
    tenantId: resolvedIdentity.tenantId,
    userId: resolvedIdentity.userId,
  });

  await syncOnboardingFromEntitlement(db, {
    decision,
    email: resolvedIdentity.email ?? resolvedIdentity.emailNormalized,
    stripeCustomerId,
    stripeSubscriptionId,
  });

  return decision;
}

export async function lookupCurrentEntitlementForUser(
  db: FluentDatabase,
  input: { email?: string | null; tenantId?: string | null; userId?: string | null },
): Promise<{
  accessState: FluentEntitlementAccessState;
  billingNotice: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  retentionEndsAt: string | null;
  stripeStatus: string;
} | null> {
  const userId = normalizeText(input.userId);
  if (userId) {
    const row = await db
      .prepare(
        `SELECT access_state, billing_notice, current_period_end, grace_ends_at, retention_ends_at, stripe_status
         FROM fluent_entitlements
         WHERE user_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .bind(userId)
      .first<any>();
    if (row) return hydrateEntitlement(row);
  }

  const tenantId = normalizeText(input.tenantId);
  if (tenantId) {
    const row = await db
      .prepare(
        `SELECT access_state, billing_notice, current_period_end, grace_ends_at, retention_ends_at, stripe_status
         FROM fluent_entitlements
         WHERE tenant_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .bind(tenantId)
      .first<any>();
    if (row) return hydrateEntitlement(row);
  }

  const emailNormalized = normalizeText(input.email)?.toLowerCase();
  if (emailNormalized) {
    const row = await db
      .prepare(
        `SELECT access_state, billing_notice, current_period_end, grace_ends_at, retention_ends_at, stripe_status
         FROM fluent_entitlements
         WHERE email_normalized = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .bind(emailNormalized)
      .first<any>();
    if (row) return hydrateEntitlement(row);
  }

  return null;
}

export async function verifyStripeWebhookSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header || !secret) {
    return false;
  }
  const parsed = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...value] = part.split('=');
      return [key.trim(), value.join('=').trim()];
    }),
  );
  const timestamp = parsed.t;
  const signature = parsed.v1;
  if (!timestamp || !signature) {
    return false;
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function findExistingEntitlement(
  db: FluentDatabase,
  input: { stripeCustomerId: string; stripeSubscriptionId: string },
): Promise<ExistingEntitlementRow | null> {
  return db
    .prepare(
      `SELECT email, email_normalized, past_due_started_at, retention_started_at, tenant_id, user_id
       FROM fluent_entitlements
       WHERE stripe_subscription_id = ? OR stripe_customer_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .bind(input.stripeSubscriptionId, input.stripeCustomerId)
    .first<ExistingEntitlementRow>();
}

async function resolveEntitlementIdentity(
  db: FluentDatabase,
  subscription: StripeSubscriptionLike,
  existing: ExistingEntitlementRow | null,
): Promise<{ email: string | null; emailNormalized: string | null; tenantId: string | null; userId: string | null }> {
  const metadata = subscription.metadata ?? {};
  const email =
    normalizeText(metadata.email) ??
    normalizeText(metadata.fluent_email) ??
    normalizeStripeCustomerEmail(subscription.customer) ??
    existing?.email ??
    null;
  const emailNormalized =
    normalizeText(metadata.email_normalized)?.toLowerCase() ??
    normalizeText(metadata.fluent_email_normalized)?.toLowerCase() ??
    normalizeText(email)?.toLowerCase() ??
    existing?.email_normalized ??
    null;
  const userId = normalizeText(metadata.user_id) ?? normalizeText(metadata.userId) ?? existing?.user_id ?? null;
  const tenantId = normalizeText(metadata.tenant_id) ?? normalizeText(metadata.tenantId) ?? existing?.tenant_id ?? null;

  if (emailNormalized || userId || tenantId) {
    const onboarding = await getFluentCloudOnboardingRecord(db, {
      email: emailNormalized,
      tenantId,
      userId,
    });
    if (onboarding) {
      return {
        email: onboarding.email ?? email,
        emailNormalized: onboarding.emailNormalized,
        tenantId: onboarding.tenantId ?? tenantId,
        userId: onboarding.userId ?? userId,
      };
    }
  }

  return { email, emailNormalized, tenantId, userId };
}

async function upsertEntitlement(
  db: FluentDatabase,
  input: {
    decision: EntitlementDecision;
    email: string | null;
    emailNormalized: string | null;
    eventCreatedAt: string | null;
    eventId: string | null;
    eventType: string;
    rawSubscriptionJson: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    tenantId: string | null;
    userId: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fluent_entitlements (
        id, user_id, tenant_id, email, email_normalized, stripe_customer_id, stripe_subscription_id,
        stripe_status, access_state, billing_notice, current_period_end, past_due_started_at,
        grace_ends_at, access_ends_at, retention_started_at, retention_ends_at,
        last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, raw_subscription_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stripe_subscription_id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, fluent_entitlements.user_id),
        tenant_id = COALESCE(excluded.tenant_id, fluent_entitlements.tenant_id),
        email = COALESCE(excluded.email, fluent_entitlements.email),
        email_normalized = COALESCE(excluded.email_normalized, fluent_entitlements.email_normalized),
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_status = excluded.stripe_status,
        access_state = excluded.access_state,
        billing_notice = excluded.billing_notice,
        current_period_end = excluded.current_period_end,
        past_due_started_at = excluded.past_due_started_at,
        grace_ends_at = excluded.grace_ends_at,
        access_ends_at = excluded.access_ends_at,
        retention_started_at = excluded.retention_started_at,
        retention_ends_at = excluded.retention_ends_at,
        last_stripe_event_id = excluded.last_stripe_event_id,
        last_stripe_event_type = excluded.last_stripe_event_type,
        last_stripe_event_created_at = excluded.last_stripe_event_created_at,
        raw_subscription_json = excluded.raw_subscription_json,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      `entitlement:${input.stripeSubscriptionId}`,
      input.userId,
      input.tenantId,
      input.email,
      input.emailNormalized,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.decision.stripeStatus,
      input.decision.accessState,
      input.decision.billingNotice,
      input.decision.currentPeriodEnd,
      input.decision.pastDueStartedAt,
      input.decision.graceEndsAt,
      input.decision.accessEndsAt,
      input.decision.retentionStartedAt,
      input.decision.retentionEndsAt,
      input.eventId,
      input.eventType,
      input.eventCreatedAt,
      input.rawSubscriptionJson,
    )
    .run();
}

async function syncOnboardingFromEntitlement(
  db: FluentDatabase,
  input: {
    decision: EntitlementDecision;
    email: string | null;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  },
): Promise<void> {
  if (!input.email) {
    return;
  }
  const action = (() => {
    switch (input.decision.onboardingState) {
      case 'trialing':
        return 'mark_trialing';
      case 'active':
        return 'mark_active';
      case 'past_due_grace':
        return 'mark_past_due_grace';
      case 'limited_access':
        return 'mark_limited_access';
      case 'canceled_retention':
        return 'mark_canceled_retention';
    }
  })();
  await applyFluentCloudOperatorAction(db, {
    action,
    actorLabel: 'stripe-webhook',
    actorType: 'system',
    email: input.email,
    metadata: {
      accessState: input.decision.accessState,
      currentPeriodEnd: input.decision.currentPeriodEnd,
      graceEndsAt: input.decision.graceEndsAt,
      retentionEndsAt: input.decision.retentionEndsAt,
      stripeStatus: input.decision.stripeStatus,
    },
    note: `Stripe subscription ${input.decision.stripeStatus} synchronized.`,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
  });
}

async function markStripeEventProcessed(db: FluentDatabase, eventId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE stripe_event_log
       SET processing_status = 'processed', error_message = NULL, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE event_id = ?`,
    )
    .bind(eventId)
    .run();
}

function baseDecision(
  stripeStatus: string,
  accessState: FluentEntitlementAccessState,
  onboardingState: EntitlementDecision['onboardingState'],
  currentPeriodEnd: string | null,
  accessEndsAt: string | null,
): EntitlementDecision {
  return {
    accessEndsAt,
    accessState,
    billingNotice: null,
    currentPeriodEnd,
    graceEndsAt: null,
    onboardingState,
    pastDueStartedAt: null,
    retentionEndsAt: null,
    retentionStartedAt: null,
    stripeStatus,
  };
}

function hydrateEntitlement(row: Record<string, unknown>) {
  return {
    accessState: row.access_state as FluentEntitlementAccessState,
    billingNotice: typeof row.billing_notice === 'string' ? row.billing_notice : null,
    currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
    graceEndsAt: typeof row.grace_ends_at === 'string' ? row.grace_ends_at : null,
    retentionEndsAt: typeof row.retention_ends_at === 'string' ? row.retention_ends_at : null,
    stripeStatus: typeof row.stripe_status === 'string' ? row.stripe_status : 'unknown',
  };
}

function normalizeStripeCustomerId(value: StripeSubscriptionLike['customer']): string | null {
  if (typeof value === 'string') {
    return normalizeText(value);
  }
  return normalizeText(value?.id);
}

function normalizeStripeCustomerEmail(value: StripeSubscriptionLike['customer']): string | null {
  return typeof value === 'object' && value ? normalizeText(value.email) : null;
}

function stripeTimestampToIso(value: number | string | null | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric * 1000).toISOString();
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return null;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseIsoOrNull(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function normalizeMetadataWithEmail(
  metadata: Record<string, string | null | undefined> | null | undefined,
  email: string | null | undefined,
): Record<string, string | null | undefined> {
  const normalized = { ...(metadata ?? {}) };
  const fallbackEmail = normalizeText(email);
  if (fallbackEmail && !normalizeText(normalized.email) && !normalizeText(normalized.fluent_email)) {
    normalized.email = fallbackEmail;
  }
  return normalized;
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });
}
