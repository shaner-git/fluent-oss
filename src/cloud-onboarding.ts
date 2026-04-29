import { getFluentAuthProps } from './auth';
import { issueFluentCloudInviteFromApprovedWaitlist, type FluentCloudInviteActor } from './cloud-invites';
import type { FluentDatabase } from './storage';

export const FLUENT_CLOUD_ONBOARDING_STATES = [
  'waitlisted',
  'invited',
  'invite_accepted',
  'account_created',
  'checkout_required',
  'trialing',
  'active',
  'past_due_grace',
  'limited_access',
  'canceled_retention',
  'suspended',
  'deletion_requested',
  'deleted',
] as const;

export type FluentCloudOnboardingState = (typeof FLUENT_CLOUD_ONBOARDING_STATES)[number];
export type FluentCloudSupportStatus = 'none' | 'recommended' | 'escalated' | 'resolved';
export type FluentCloudOperatorAction =
  | 'waitlist'
  | 'invite'
  | 'accept_invite'
  | 'provision_reviewer_demo'
  | 'mark_checkout_required'
  | 'mark_trialing'
  | 'mark_active'
  | 'mark_past_due_grace'
  | 'mark_limited_access'
  | 'mark_canceled_retention'
  | 'suspend'
  | 'resume'
  | 'request_deletion'
  | 'cancel_deletion'
  | 'delete'
  | 'record_failure'
  | 'clear_failure'
  | 'escalate_support'
  | 'resolve_support';

export interface FluentCloudOnboardingTransitionRule {
  notes: string[];
  requiredTimestamps: string[];
  state: FluentCloudOnboardingState;
  trigger: 'automatic' | 'automatic_or_operator' | 'operator_only';
}

export interface FluentCloudOnboardingDescriptor {
  states: readonly FluentCloudOnboardingState[];
  supportEscalation: {
    automaticRecommendationThreshold: number;
    note: string;
  };
  transitionRules: FluentCloudOnboardingTransitionRule[];
}

export interface FluentCloudOnboardingLookup {
  email?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}

export interface FluentCloudOnboardingRecord {
  accountKind: string | null;
  allowedOperatorActions: FluentCloudOperatorAction[];
  currentState: FluentCloudOnboardingState;
  email: string | null;
  emailNormalized: string;
  failure: {
    code: string | null;
    count: number;
    message: string | null;
    retryAfter: string | null;
    retryBehavior: string;
    stage: string | null;
  } | null;
  firstConnectedClient: {
    id: string | null;
    name: string | null;
  };
  firstDomainId: string | null;
  lastConnectedClient: {
    id: string | null;
    name: string | null;
  };
  metadata: unknown;
  missingTimestamps: string[];
  requiredTimestamps: string[];
  stateSummary: string;
  support: {
    note: string;
    notes: string | null;
    status: FluentCloudSupportStatus;
    tags: string[];
    ticketRef: string | null;
  };
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  tenantId: string | null;
  timestamps: Record<string, string | null>;
  userId: string | null;
}

export interface FluentCloudOnboardingEventRecord {
  actorId: string | null;
  actorLabel: string | null;
  actorType: string;
  createdAt: string;
  emailNormalized: string;
  eventType: string;
  fromState: FluentCloudOnboardingState | null;
  metadata: unknown;
  note: string | null;
  tenantId: string | null;
  toState: FluentCloudOnboardingState | null;
  userId: string | null;
}

type FluentCloudOnboardingRow = {
  account_created_at: string | null;
  account_kind: string | null;
  active_at: string | null;
  canceled_retention_at: string | null;
  checkout_required_at: string | null;
  created_at: string;
  current_state: string;
  deleted_at: string | null;
  deletion_requested_at: string | null;
  email: string | null;
  email_normalized: string;
  email_verified_at: string | null;
  failure_code: string | null;
  failure_count: number | string | null;
  failure_message: string | null;
  failure_stage: string | null;
  first_client_connected_at: string | null;
  first_connected_client_id: string | null;
  first_connected_client_name: string | null;
  first_domain_id: string | null;
  first_domain_selected_at: string | null;
  first_successful_tool_call_at: string | null;
  invite_accepted_at: string | null;
  invited_at: string | null;
  last_connected_client_id: string | null;
  last_connected_client_name: string | null;
  last_failure_at: string | null;
  metadata_json: string | null;
  profile_started_at: string | null;
  limited_access_at: string | null;
  past_due_grace_at: string | null;
  retry_after: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  support_escalated_at: string | null;
  support_notes: string | null;
  support_resolved_at: string | null;
  support_status: string | null;
  support_tags_json: string | null;
  support_ticket_ref: string | null;
  suspended_at: string | null;
  tenant_id: string | null;
  trialing_at: string | null;
  updated_at: string;
  user_id: string | null;
  waitlisted_at: string | null;
};

type OperatorActor = {
  actorId?: string | null;
  actorLabel?: string | null;
  actorType?: 'operator' | 'support' | 'system';
};

type FluentCloudOnboardingEventInput = {
  actorId?: string | null;
  actorLabel?: string | null;
  actorType: string;
  eventType: string;
  metadata?: unknown;
  note?: string | null;
};

const RECOMMENDED_SUPPORT_FAILURE_THRESHOLD = 3;
const STATUS_SEQUENCE: Array<{ state: FluentCloudOnboardingState; timestamp: keyof FluentCloudOnboardingRow }> = [
  { state: 'waitlisted', timestamp: 'waitlisted_at' },
  { state: 'invited', timestamp: 'invited_at' },
  { state: 'invite_accepted', timestamp: 'invite_accepted_at' },
  { state: 'account_created', timestamp: 'account_created_at' },
  { state: 'checkout_required', timestamp: 'checkout_required_at' },
  { state: 'trialing', timestamp: 'trialing_at' },
  { state: 'active', timestamp: 'active_at' },
  { state: 'past_due_grace', timestamp: 'past_due_grace_at' },
  { state: 'limited_access', timestamp: 'limited_access_at' },
  { state: 'canceled_retention', timestamp: 'canceled_retention_at' },
];

const TIMESTAMP_KEYS = STATUS_SEQUENCE.map((entry) => entry.timestamp).concat([
  'email_verified_at',
  'profile_started_at',
  'first_domain_selected_at',
  'first_client_connected_at',
  'first_successful_tool_call_at',
  'suspended_at',
  'deletion_requested_at',
  'deleted_at',
]) as Array<keyof FluentCloudOnboardingRow>;

export function fluentCloudOnboardingDescriptor(): FluentCloudOnboardingDescriptor {
  return {
    states: FLUENT_CLOUD_ONBOARDING_STATES,
    supportEscalation: {
      automaticRecommendationThreshold: RECOMMENDED_SUPPORT_FAILURE_THRESHOLD,
      note: 'Support becomes recommended after repeated failures, or immediately for suspension and deletion flows.',
    },
    transitionRules: [
      {
        notes: ['Created by operator import or explicit operator action.'],
        requiredTimestamps: ['waitlisted_at'],
        state: 'waitlisted',
        trigger: 'automatic_or_operator',
      },
      {
        notes: ['Operator confirms early-access admission and invite delivery readiness.'],
        requiredTimestamps: ['waitlisted_at', 'invited_at'],
        state: 'invited',
        trigger: 'operator_only',
      },
      {
        notes: ['The invited user accepted the live invite with the approved email.'],
        requiredTimestamps: ['invited_at', 'invite_accepted_at'],
        state: 'invite_accepted',
        trigger: 'automatic',
      },
      {
        notes: ['Better Auth account exists and a hosted tenant/profile has been provisioned.'],
        requiredTimestamps: ['account_created_at'],
        state: 'account_created',
        trigger: 'automatic',
      },
      {
        notes: ['Checkout is handled outside ChatGPT through the managed billing flow.'],
        requiredTimestamps: ['account_created_at', 'checkout_required_at'],
        state: 'checkout_required',
        trigger: 'operator_only',
      },
      {
        notes: ['Early-access trial state. Stripe ids may be present in operator views only.'],
        requiredTimestamps: ['account_created_at', 'trialing_at'],
        state: 'trialing',
        trigger: 'automatic_or_operator',
      },
      {
        notes: ['Represents a usable early-access account after account provisioning or an operator activation.'],
        requiredTimestamps: ['account_created_at', 'active_at'],
        state: 'active',
        trigger: 'automatic_or_operator',
      },
      {
        notes: ['Payment failure starts a 7-day grace period with full access while billing is resolved.'],
        requiredTimestamps: ['account_created_at', 'past_due_grace_at'],
        state: 'past_due_grace',
        trigger: 'automatic_or_operator',
      },
      {
        notes: ['After payment grace expires, domain tools are paused while export, deletion, reactivation, and billing management remain available.'],
        requiredTimestamps: ['account_created_at', 'limited_access_at'],
        state: 'limited_access',
        trigger: 'automatic_or_operator',
      },
      {
        notes: ['Canceled or lapsed accounts retain exportable data for 90 days before Fluent domain/account cleanup.'],
        requiredTimestamps: ['account_created_at', 'canceled_retention_at'],
        state: 'canceled_retention',
        trigger: 'automatic_or_operator',
      },
      {
        notes: ['Temporary access block. Resume clears the suspension and restores the latest non-terminal milestone.'],
        requiredTimestamps: ['suspended_at'],
        state: 'suspended',
        trigger: 'operator_only',
      },
      {
        notes: ['Deletion has been requested but not finalized yet.'],
        requiredTimestamps: ['deletion_requested_at'],
        state: 'deletion_requested',
        trigger: 'operator_only',
      },
      {
        notes: ['Terminal state. Access stays blocked and no further lifecycle progression is allowed.'],
        requiredTimestamps: ['deleted_at'],
        state: 'deleted',
        trigger: 'operator_only',
      },
    ],
  };
}

export async function getFluentCloudOnboardingRecord(
  db: FluentDatabase,
  lookup: FluentCloudOnboardingLookup,
): Promise<FluentCloudOnboardingRecord | null> {
  const row = await findOnboardingRow(db, lookup);
  return row ? hydrateOnboardingRecord(row) : null;
}

export async function listFluentCloudOnboardingRecords(
  db: FluentDatabase,
  options: {
    email?: string | null;
    limit?: number;
    state?: FluentCloudOnboardingState | null;
  } = {},
): Promise<FluentCloudOnboardingRecord[]> {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  const normalizedEmail = normalizeOnboardingEmail(options.email);
  if (normalizedEmail) {
    clauses.push('email_normalized = ?');
    bindings.push(normalizedEmail);
  }
  if (options.state) {
    clauses.push('current_state = ?');
    bindings.push(options.state);
  }

  const limit = clampInteger(options.limit, 1, 100, 25);
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db
    .prepare(
      `SELECT *
       FROM fluent_cloud_onboarding
       ${whereClause}
       ORDER BY updated_at DESC, email_normalized ASC
       LIMIT ?`,
    )
    .bind(...bindings, limit)
    .all<FluentCloudOnboardingRow>();

  return (result.results ?? []).map(hydrateOnboardingRecord);
}

export async function listFluentCloudOnboardingEvents(
  db: FluentDatabase,
  lookup: FluentCloudOnboardingLookup,
  limit = 100,
): Promise<FluentCloudOnboardingEventRecord[]> {
  const row = await findOnboardingRow(db, lookup);
  if (!row) {
    return [];
  }

  const boundedLimit = clampInteger(limit, 1, 200, 50);
  const result = await db
    .prepare(
      `SELECT email_normalized, user_id, tenant_id, event_type, from_state, to_state, actor_type, actor_id, actor_label, note, metadata_json, created_at
       FROM fluent_cloud_onboarding_events
       WHERE email_normalized = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(row.email_normalized, boundedLimit)
    .all<{
      actor_id: string | null;
      actor_label: string | null;
      actor_type: string;
      created_at: string;
      email_normalized: string;
      event_type: string;
      from_state: string | null;
      metadata_json: string | null;
      note: string | null;
      tenant_id: string | null;
      to_state: string | null;
      user_id: string | null;
    }>();

  return (result.results ?? []).map((event) => ({
    actorId: event.actor_id,
    actorLabel: event.actor_label,
    actorType: event.actor_type,
    createdAt: event.created_at,
    emailNormalized: event.email_normalized,
    eventType: event.event_type,
    fromState: normalizeState(event.from_state),
    metadata: safeParse(event.metadata_json),
    note: event.note,
    tenantId: event.tenant_id,
    toState: normalizeState(event.to_state),
    userId: event.user_id,
  }));
}

export async function evaluateFluentCloudOnboardingAccess(
  db: FluentDatabase,
  lookup: FluentCloudOnboardingLookup,
): Promise<{
  allowed: boolean;
  denialState: FluentCloudOnboardingState | null;
  record: FluentCloudOnboardingRecord | null;
  statusMessage: string | null;
}> {
  const record = await getFluentCloudOnboardingRecord(db, lookup);
  if (!record) {
    return {
      allowed: false,
      denialState: null,
      record: null,
      statusMessage: null,
    };
  }

  switch (record.currentState) {
    case 'waitlisted':
    case 'suspended':
    case 'deletion_requested':
    case 'deleted':
      return {
        allowed: false,
        denialState: record.currentState,
        record,
        statusMessage: record.stateSummary,
      };
    default:
      return {
        allowed: true,
        denialState: null,
        record,
        statusMessage: record.stateSummary,
      };
  }
}

export async function markFluentCloudInviteAccepted(
  db: FluentDatabase,
  input: {
    email: string | null;
    metadata?: unknown;
    note?: string | null;
    tenantId?: string | null;
    userId?: string | null;
  },
): Promise<FluentCloudOnboardingRecord | null> {
  const before = await ensureOnboardingRowFromLookup(db, input);
  if (!before) {
    return null;
  }

  return finalizeOnboardingChange(db, before, {
    actorLabel: 'hosted-provisioning',
    actorType: 'system',
    eventType: 'cloud_onboarding.invite_accepted',
    metadata: input.metadata,
    note: input.note ?? 'Cloud invite accepted by approved email.',
    updates: {
      current_state: '',
      invite_accepted_at: before.invite_accepted_at ?? firstTimestamp(before.invited_at, before.waitlisted_at),
      invited_at: before.invited_at ?? firstTimestamp(before.waitlisted_at),
      tenant_id: input.tenantId ?? before.tenant_id,
      user_id: input.userId ?? before.user_id,
    },
  });
}

export async function markFluentCloudAccountCreated(
  db: FluentDatabase,
  input: {
    email: string | null;
    metadata?: unknown;
    note?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    tenantId: string;
    userId: string;
  },
): Promise<FluentCloudOnboardingRecord | null> {
  const emailNormalized = normalizeOnboardingEmail(input.email);
  if (!emailNormalized) {
    return null;
  }

  const before = await ensureOnboardingRow(db, {
    email: input.email,
    emailNormalized,
    tenantId: input.tenantId,
    userId: input.userId,
  });
  const timestamp = firstTimestamp(before.waitlisted_at);
  const metadata = mergeMetadata(before.metadata_json, input.metadata);
  const updates = {
    account_created_at: before.account_created_at ?? timestamp,
    current_state: '',
    email: normalizeNullableText(input.email),
    email_verified_at: before.email_verified_at,
    invite_accepted_at: before.invite_accepted_at,
    metadata_json: stringifyJson(metadata),
    stripe_customer_id: normalizeNullableText(input.stripeCustomerId) ?? before.stripe_customer_id,
    stripe_subscription_id: normalizeNullableText(input.stripeSubscriptionId) ?? before.stripe_subscription_id,
    tenant_id: input.tenantId,
    user_id: input.userId,
    waitlisted_at: timestamp,
  } as Record<string, unknown>;
  if (before.failure_stage === 'account_creation') {
    clearFailureFields(updates);
  }

  return finalizeOnboardingChange(db, before, {
    actorLabel: 'hosted-provisioning',
    actorType: 'system',
    eventType: 'cloud_onboarding.account_created',
    note: input.note ?? 'Hosted tenant and profile provisioned.',
    updates,
  });
}

export async function markFluentCloudEmailVerified(
  db: FluentDatabase,
  input: {
    email: string | null;
    note?: string | null;
    tenantId?: string | null;
    userId?: string | null;
  },
): Promise<FluentCloudOnboardingRecord | null> {
  const before = await ensureOnboardingRowFromLookup(db, input);
  if (!before) {
    return null;
  }

  const updates = {
    current_state: '',
    email_verified_at: before.email_verified_at ?? firstTimestamp(before.account_created_at, before.waitlisted_at),
  } as Record<string, unknown>;
  if (before.failure_stage === 'email_verification') {
    clearFailureFields(updates);
  }

  return finalizeOnboardingChange(db, before, {
    actorLabel: 'better-auth-session',
    actorType: 'system',
    eventType: 'cloud_onboarding.email_verified',
    note: input.note ?? 'Hosted session established with a verified email.',
    updates,
  });
}

export async function markFluentCloudClientConnected(
  db: FluentDatabase,
  input: {
    clientId?: string | null;
    clientName?: string | null;
    email?: string | null;
    note?: string | null;
    tenantId?: string | null;
    userId?: string | null;
  },
): Promise<FluentCloudOnboardingRecord | null> {
  const before = await ensureOnboardingRowFromLookup(db, input);
  if (!before) {
    return null;
  }

  const updates = {
    current_state: '',
    first_client_connected_at:
      before.first_client_connected_at ?? firstTimestamp(before.email_verified_at, before.account_created_at, before.waitlisted_at),
    first_connected_client_id: before.first_connected_client_id ?? normalizeNullableText(input.clientId),
    first_connected_client_name: before.first_connected_client_name ?? normalizeNullableText(input.clientName),
    last_connected_client_id: normalizeNullableText(input.clientId),
    last_connected_client_name: normalizeNullableText(input.clientName),
  } as Record<string, unknown>;
  if (before.failure_stage === 'client_connection') {
    clearFailureFields(updates);
  }

  return finalizeOnboardingChange(db, before, {
    actorId: normalizeNullableText(input.clientId),
    actorLabel: normalizeNullableText(input.clientName) ?? 'hosted-client',
    actorType: 'system',
    eventType: 'cloud_onboarding.first_client_connected',
    note: input.note ?? 'Hosted client reached Fluent successfully.',
    updates,
  });
}

export async function markFluentCloudSuccessfulToolCallFromCurrentRequest(
  db: FluentDatabase,
  input: {
    args?: Record<string, unknown>;
    toolName: string;
  },
): Promise<FluentCloudOnboardingRecord | null> {
  const authProps = getFluentAuthProps();
  const email = normalizeNullableText(authProps.email);
  const lookup = {
    email,
    tenantId: normalizeNullableText(authProps.tenantId),
    userId: normalizeNullableText(authProps.userId),
  };
  const before = await ensureOnboardingRowFromLookup(db, lookup);
  if (!before) {
    return null;
  }

  const resolvedDomainId = domainFromToolCall(input.toolName, input.args);
  const profileStarted = input.toolName === 'fluent_update_profile';
  const hadActivationPrerequisite =
    Boolean(before.first_successful_tool_call_at) || Boolean(before.profile_started_at) || Boolean(before.first_domain_selected_at);
  const updates = {
    active_at:
      hadActivationPrerequisite || profileStarted || Boolean(resolvedDomainId)
        ? before.active_at ?? firstTimestamp(before.first_successful_tool_call_at, before.first_client_connected_at, before.account_created_at)
        : before.active_at,
    current_state: '',
    first_domain_id: before.first_domain_id ?? resolvedDomainId,
    first_domain_selected_at:
      resolvedDomainId ? before.first_domain_selected_at ?? firstTimestamp(before.email_verified_at, before.account_created_at) : before.first_domain_selected_at,
    first_successful_tool_call_at:
      before.first_successful_tool_call_at ?? firstTimestamp(before.first_client_connected_at, before.account_created_at, before.waitlisted_at),
    profile_started_at:
      profileStarted ? before.profile_started_at ?? firstTimestamp(before.email_verified_at, before.account_created_at) : before.profile_started_at,
  } as Record<string, unknown>;
  if (before.failure_stage === 'profile_start' && profileStarted) {
    clearFailureFields(updates);
  }
  if (before.failure_stage === 'domain_selection' && resolvedDomainId) {
    clearFailureFields(updates);
  }
  if (before.failure_stage === 'tool_call') {
    clearFailureFields(updates);
  }

  return finalizeOnboardingChange(db, before, {
    actorId: normalizeNullableText(authProps.oauthClientId),
    actorLabel: normalizeNullableText(authProps.oauthClientName) ?? input.toolName,
    actorType: 'system',
    eventType: 'cloud_onboarding.first_successful_tool_call',
    metadata: {
      domainId: resolvedDomainId,
      toolName: input.toolName,
    },
    note: `Successful hosted tool call: ${input.toolName}.`,
    updates,
  });
}

export async function recordFluentCloudOnboardingFailure(
  db: FluentDatabase,
  input: {
    actorId?: string | null;
    actorLabel?: string | null;
    actorType?: string;
    email?: string | null;
    message?: string | null;
    note?: string | null;
    retryAfter?: string | null;
    stage: string;
    tenantId?: string | null;
    ticketRef?: string | null;
    userId?: string | null;
    code: string;
  },
): Promise<FluentCloudOnboardingRecord | null> {
  const before = await ensureOnboardingRowFromLookup(db, input);
  if (!before) {
    return null;
  }

  const nextFailureCount = asCount(before.failure_count) + 1;
  const updates = {
    current_state: '',
    failure_code: normalizeNullableText(input.code),
    failure_count: nextFailureCount,
    failure_message: normalizeNullableText(input.message),
    failure_stage: normalizeNullableText(input.stage),
    last_failure_at: new Date().toISOString(),
    retry_after: normalizeNullableText(input.retryAfter),
    support_status:
      before.support_status === 'escalated' || before.support_status === 'resolved'
        ? before.support_status
        : nextFailureCount >= RECOMMENDED_SUPPORT_FAILURE_THRESHOLD || before.current_state === 'suspended' || before.current_state === 'deletion_requested'
          ? 'recommended'
          : before.support_status,
    support_ticket_ref: normalizeNullableText(input.ticketRef) ?? before.support_ticket_ref,
  } as Record<string, unknown>;

  return finalizeOnboardingChange(db, before, {
    actorId: normalizeNullableText(input.actorId),
    actorLabel: normalizeNullableText(input.actorLabel) ?? 'system',
    actorType: input.actorType?.trim() || 'system',
    eventType: 'cloud_onboarding.failure_recorded',
    metadata: {
      code: input.code,
      retryAfter: input.retryAfter ?? null,
      stage: input.stage,
      ticketRef: input.ticketRef ?? null,
    },
    note: input.note ?? `Failure recorded for ${input.stage}.`,
    updates,
  });
}

export async function applyFluentCloudOperatorAction(
  db: FluentDatabase,
  input: {
    action: FluentCloudOperatorAction;
    code?: string | null;
    email: string;
    message?: string | null;
    metadata?: unknown;
    note?: string | null;
    retryAfter?: string | null;
    stage?: string | null;
    accountKind?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    supportTags?: string[] | string | null;
    ticketRef?: string | null;
  } & OperatorActor,
): Promise<FluentCloudOnboardingRecord> {
  const before = await ensureOnboardingRow(db, {
    email: input.email,
    emailNormalized: requireNormalizedEmail(input.email),
    tenantId: null,
    userId: null,
  });
  const actor = {
    actorId: normalizeNullableText(input.actorId),
    actorLabel: normalizeNullableText(input.actorLabel) ?? 'cloud-operator',
    actorType: input.actorType ?? 'operator',
  };

  switch (input.action) {
    case 'waitlist':
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.waitlisted',
        metadata: input.metadata,
        note: input.note ?? 'Marked as waitlisted.',
        updates: {
          account_kind: normalizeNullableText(input.accountKind) ?? before.account_kind,
          current_state: '',
          invited_at: null,
          support_notes: normalizeNullableText(input.note) ?? before.support_notes,
          support_tags_json: stringifyJson(normalizeSupportTags(input.supportTags, before.support_tags_json)),
          waitlisted_at: before.waitlisted_at ?? new Date().toISOString(),
        },
      });
    case 'invite':
      await issueFluentCloudInviteFromApprovedWaitlist(db, {
        actor: {
          actorId: actor.actorId,
          actorType: toCloudInviteActorType(actor.actorType),
        },
        email: before.email ?? before.email_normalized,
        metadata: {
          ...(asRecord(input.metadata) ?? {}),
          accountKind: normalizeNullableText(input.accountKind) ?? before.account_kind ?? 'early_access',
          supportTags: normalizeSupportTags(input.supportTags, before.support_tags_json),
        },
      });
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.invited',
        metadata: input.metadata,
        note: input.note ?? 'Marked as invited.',
        updates: {
          account_kind: normalizeNullableText(input.accountKind) ?? before.account_kind ?? 'early_access',
          current_state: '',
          invited_at: before.invited_at ?? new Date().toISOString(),
          support_notes: normalizeNullableText(input.note) ?? before.support_notes,
          support_tags_json: stringifyJson(normalizeSupportTags(input.supportTags, before.support_tags_json)),
          waitlisted_at: before.waitlisted_at ?? new Date().toISOString(),
        },
      });
    case 'provision_reviewer_demo':
      await issueFluentCloudInviteFromApprovedWaitlist(db, {
        actor: {
          actorId: actor.actorId,
          actorType: toCloudInviteActorType(actor.actorType),
        },
        email: before.email ?? before.email_normalized,
        metadata: {
          ...(asRecord(input.metadata) ?? {}),
          accountKind: normalizeNullableText(input.accountKind) ?? 'reviewer_demo',
          supportTags: normalizeSupportTags(input.supportTags, before.support_tags_json, ['reviewer-demo']),
        },
        ttlDays: 30,
      });
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.reviewer_demo_invited',
        metadata: input.metadata,
        note: input.note ?? 'Reviewer/demo account path provisioned with an early-access invite.',
        updates: {
          account_kind: normalizeNullableText(input.accountKind) ?? 'reviewer_demo',
          current_state: '',
          invited_at: before.invited_at ?? new Date().toISOString(),
          support_notes: normalizeNullableText(input.note) ?? before.support_notes,
          support_tags_json: stringifyJson(normalizeSupportTags(input.supportTags, before.support_tags_json, ['reviewer-demo'])),
          waitlisted_at: before.waitlisted_at ?? new Date().toISOString(),
        },
      });
    case 'accept_invite':
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.invite_accepted',
        metadata: input.metadata,
        note: input.note ?? 'Invite acceptance recorded.',
        updates: {
          current_state: '',
          invite_accepted_at: before.invite_accepted_at ?? new Date().toISOString(),
          invited_at: before.invited_at ?? new Date().toISOString(),
        },
      });
    case 'mark_checkout_required':
      return operatorStatusChange(db, before, actor, input, 'checkout_required', 'checkout_required_at');
    case 'mark_trialing':
      return operatorStatusChange(db, before, actor, input, 'trialing', 'trialing_at');
    case 'mark_active':
      return operatorStatusChange(db, before, actor, input, 'active', 'active_at');
    case 'mark_past_due_grace':
      return operatorStatusChange(db, before, actor, input, 'past_due_grace', 'past_due_grace_at');
    case 'mark_limited_access':
      return operatorStatusChange(db, before, actor, input, 'limited_access', 'limited_access_at');
    case 'mark_canceled_retention':
      return operatorStatusChange(db, before, actor, input, 'canceled_retention', 'canceled_retention_at');
    case 'suspend':
      assertNotDeleted(before, input.action);
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.suspended',
        note: input.note ?? 'Access suspended.',
        updates: {
          current_state: '',
          suspended_at: before.suspended_at ?? new Date().toISOString(),
          support_status: before.support_status === 'resolved' ? 'resolved' : 'recommended',
        },
      });
    case 'resume':
      if (!before.suspended_at) {
        throw new Error('Only suspended records can be resumed.');
      }
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.resumed',
        note: input.note ?? 'Suspension cleared.',
        updates: {
          current_state: '',
          suspended_at: null,
        },
      });
    case 'request_deletion':
      assertNotDeleted(before, input.action);
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.deletion_requested',
        note: input.note ?? 'Deletion requested.',
        updates: {
          current_state: '',
          deletion_requested_at: before.deletion_requested_at ?? new Date().toISOString(),
          support_status: before.support_status === 'resolved' ? 'resolved' : 'recommended',
        },
      });
    case 'cancel_deletion':
      if (!before.deletion_requested_at) {
        throw new Error('Only deletion-requested records can clear the deletion request.');
      }
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.deletion_canceled',
        note: input.note ?? 'Deletion request canceled.',
        updates: {
          current_state: '',
          deletion_requested_at: null,
        },
      });
    case 'delete':
      if (!before.deletion_requested_at) {
        throw new Error('Deletion must be requested before marking a record deleted.');
      }
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.deleted',
        note: input.note ?? 'Record marked deleted.',
        updates: {
          current_state: '',
          deleted_at: before.deleted_at ?? new Date().toISOString(),
        },
      });
    case 'record_failure':
      if (!input.stage?.trim() || !input.code?.trim()) {
        throw new Error('record_failure requires stage and code.');
      }
      return (await recordFluentCloudOnboardingFailure(db, {
        ...actor,
        code: input.code,
        email: input.email,
        message: input.message,
        note: input.note,
        retryAfter: input.retryAfter,
        stage: input.stage,
        ticketRef: input.ticketRef,
      })) as FluentCloudOnboardingRecord;
    case 'clear_failure':
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.failure_cleared',
        note: input.note ?? 'Failure cleared.',
        updates: clearFailureFields({
          current_state: '',
        }),
      });
    case 'escalate_support':
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.support_escalated',
        note: input.note ?? 'Support escalated.',
        updates: {
          current_state: '',
          support_escalated_at: before.support_escalated_at ?? new Date().toISOString(),
          support_status: 'escalated',
          support_ticket_ref: normalizeNullableText(input.ticketRef) ?? before.support_ticket_ref,
        },
      });
    case 'resolve_support':
      return finalizeOnboardingChange(db, before, {
        ...actor,
        eventType: 'cloud_onboarding.support_resolved',
        note: input.note ?? 'Support issue resolved.',
        updates: {
          current_state: '',
          support_resolved_at: before.support_resolved_at ?? new Date().toISOString(),
          support_status: 'resolved',
          support_ticket_ref: normalizeNullableText(input.ticketRef) ?? before.support_ticket_ref,
        },
      });
    default:
      throw new Error(`Unsupported onboarding operator action: ${String(input.action)}`);
  }
}

async function operatorStatusChange(
  db: FluentDatabase,
  before: FluentCloudOnboardingRow,
  actor: { actorId: string | null; actorLabel: string; actorType: string },
  input: {
    metadata?: unknown;
    note?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    supportTags?: string[] | string | null;
  },
  state: FluentCloudOnboardingState,
  timestampKey: keyof FluentCloudOnboardingRow,
): Promise<FluentCloudOnboardingRecord> {
  assertNotDeleted(before, state);
  return finalizeOnboardingChange(db, before, {
    ...actor,
    eventType: `cloud_onboarding.${state}`,
    metadata: input.metadata,
    note: input.note ?? `Account status changed to ${state}.`,
    updates: {
      current_state: '',
      ...clearAccountStatusTimestampsExcept(timestampKey),
      stripe_customer_id: normalizeNullableText(input.stripeCustomerId) ?? before.stripe_customer_id,
      stripe_subscription_id: normalizeNullableText(input.stripeSubscriptionId) ?? before.stripe_subscription_id,
      support_notes: normalizeNullableText(input.note) ?? before.support_notes,
      support_tags_json: stringifyJson(normalizeSupportTags(input.supportTags, before.support_tags_json)),
      [timestampKey]: before[timestampKey] ?? new Date().toISOString(),
    },
  });
}

export function renderFluentCloudOnboardingOpsPage(input: {
  descriptor: FluentCloudOnboardingDescriptor;
  eventsByEmail: Record<string, FluentCloudOnboardingEventRecord[]>;
  records: FluentCloudOnboardingRecord[];
}): string {
  const stateRows = input.descriptor.transitionRules
    .map(
      (rule) =>
        `<tr><td><code>${escapeHtml(rule.state)}</code></td><td>${escapeHtml(rule.trigger)}</td><td>${escapeHtml(rule.requiredTimestamps.join(', ') || 'none')}</td><td>${escapeHtml(rule.notes.join(' '))}</td></tr>`,
    )
    .join('');
  const recordCards = input.records
    .map((record) => {
      const events = input.eventsByEmail[record.emailNormalized] ?? [];
      const eventRows = events
        .slice(0, 6)
        .map(
          (event) =>
            `<li><strong>${escapeHtml(event.eventType)}</strong> <code>${escapeHtml(event.createdAt)}</code> ${escapeHtml(event.note ?? '')}</li>`,
        )
        .join('');
      return `<section class="card">
  <h2>${escapeHtml(record.email ?? record.emailNormalized)}</h2>
  <p><strong>State:</strong> <code>${escapeHtml(record.currentState)}</code> · ${escapeHtml(record.stateSummary)}</p>
  <p><strong>Kind:</strong> <code>${escapeHtml(record.accountKind ?? 'early_access')}</code> · <strong>Stripe:</strong> <code>${escapeHtml(record.stripeCustomerId ?? 'none')}</code> / <code>${escapeHtml(record.stripeSubscriptionId ?? 'none')}</code></p>
  <p><strong>Tenant:</strong> <code>${escapeHtml(record.tenantId ?? 'pending')}</code> · <strong>User:</strong> <code>${escapeHtml(record.userId ?? 'pending')}</code></p>
  <p><strong>Allowed operator actions:</strong> ${escapeHtml(record.allowedOperatorActions.join(', ') || 'none')}</p>
  <p><strong>Missing timestamps:</strong> ${escapeHtml(record.missingTimestamps.join(', ') || 'none')}</p>
  <p><strong>Failure:</strong> ${escapeHtml(record.failure ? `${record.failure.stage ?? 'unknown'} / ${record.failure.code ?? 'unknown'} / ${record.failure.retryBehavior}` : 'none')}</p>
  <p><strong>Support:</strong> ${escapeHtml(record.support.status)}${record.support.ticketRef ? ` (${escapeHtml(record.support.ticketRef)})` : ''} · ${escapeHtml(record.support.tags.join(', ') || 'no tags')}</p>
  <ul>${eventRows || '<li>No events recorded yet.</li>'}</ul>
</section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fluent Onboarding Ops</title>
  <style>
    :root { color-scheme: light; --bg: #f5f7fb; --card: #ffffff; --ink: #111827; --muted: #475569; --border: #d8e0ec; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; }
    h1, h2 { margin: 0 0 12px; }
    p, li, td, th { line-height: 1.5; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-bottom: 24px; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .grid { display: grid; gap: 16px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 20px; }
    code { background: #eff3f8; border-radius: 6px; padding: 2px 6px; color: var(--ink); }
    ul { margin: 12px 0 0; padding-left: 18px; }
  </style>
</head>
<body>
  <main>
    <h1>Fluent Early-Access Onboarding</h1>
    <p>Inspectable hosted onboarding state machine for operator use. This route is internal and reflects early-access status only.</p>
    <table>
      <thead><tr><th>State</th><th>Trigger</th><th>Required timestamps</th><th>Notes</th></tr></thead>
      <tbody>${stateRows}</tbody>
    </table>
    <div class="grid">${recordCards || '<section class="card"><p>No onboarding records found.</p></section>'}</div>
  </main>
</body>
</html>`;
}

export function renderFluentCloudOnboardingStatusPage(input: {
  callToAction?: string;
  heading?: string;
  message: string;
  state: FluentCloudOnboardingState;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fluent Status</title>
  <style>
    :root { color-scheme: light; --bg: #f8fafc; --card: #ffffff; --ink: #0f172a; --muted: #475569; --border: #dbe4f0; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: radial-gradient(circle at top, rgba(15, 23, 42, 0.06), transparent 42%), var(--bg); font-family: ui-sans-serif, system-ui, sans-serif; color: var(--ink); }
    main { width: 100%; max-width: 720px; background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 32px; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 10px; font-size: clamp(2rem, 5vw, 2.75rem); }
    p { margin: 0 0 16px; line-height: 1.6; color: var(--muted); }
    .eyebrow { margin: 0 0 12px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
    code { background: #edf2f7; border-radius: 6px; padding: 2px 6px; color: var(--ink); }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Fluent · Early Access</p>
    <h1>${escapeHtml(input.heading ?? humanizeState(input.state))}</h1>
    <p>${escapeHtml(input.message)}</p>
    <p><strong>Lifecycle state:</strong> <code>${escapeHtml(input.state)}</code></p>
    ${input.callToAction ? `<p>${escapeHtml(input.callToAction)}</p>` : ''}
  </main>
</body>
</html>`;
}

async function ensureOnboardingRowFromLookup(
  db: FluentDatabase,
  lookup: FluentCloudOnboardingLookup,
): Promise<FluentCloudOnboardingRow | null> {
  const existing = await findOnboardingRow(db, lookup);
  if (existing) {
    return existing;
  }

  const emailNormalized = normalizeOnboardingEmail(lookup.email);
  if (!emailNormalized) {
    return null;
  }

  return ensureOnboardingRow(db, {
    email: lookup.email ?? null,
    emailNormalized,
    tenantId: lookup.tenantId ?? null,
    userId: lookup.userId ?? null,
  });
}

async function ensureOnboardingRow(
  db: FluentDatabase,
  input: {
    email: string | null;
    emailNormalized: string;
    tenantId: string | null;
    userId: string | null;
  },
): Promise<FluentCloudOnboardingRow> {
  const timestamp = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO fluent_cloud_onboarding (
          email, email_normalized, user_id, tenant_id, current_state, metadata_json, waitlisted_at
        ) VALUES (?, ?, ?, ?, 'waitlisted', '{}', ?)`,
      )
      .bind(normalizeNullableText(input.email), input.emailNormalized, input.userId, input.tenantId, timestamp),
    db
      .prepare(
        `UPDATE fluent_cloud_onboarding
         SET email = COALESCE(?, email),
             user_id = COALESCE(?, user_id),
             tenant_id = COALESCE(?, tenant_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE email_normalized = ?`,
      )
      .bind(normalizeNullableText(input.email), input.userId, input.tenantId, input.emailNormalized),
  ]);

  const created = await findOnboardingRow(db, { email: input.email, tenantId: input.tenantId, userId: input.userId });
  if (!created) {
    throw new Error(`Unable to create Fluent onboarding row for ${input.emailNormalized}.`);
  }
  return created;
}

async function findOnboardingRow(
  db: FluentDatabase,
  lookup: FluentCloudOnboardingLookup,
): Promise<FluentCloudOnboardingRow | null> {
  const normalizedEmail = normalizeOnboardingEmail(lookup.email);
  if (normalizedEmail) {
    const byEmail = await db
      .prepare('SELECT * FROM fluent_cloud_onboarding WHERE email_normalized = ? LIMIT 1')
      .bind(normalizedEmail)
      .first<FluentCloudOnboardingRow>();
    if (byEmail) {
      return byEmail;
    }
  }

  const userId = normalizeNullableText(lookup.userId);
  if (userId) {
    const byUser = await db
      .prepare('SELECT * FROM fluent_cloud_onboarding WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1')
      .bind(userId)
      .first<FluentCloudOnboardingRow>();
    if (byUser) {
      return byUser;
    }
  }

  const tenantId = normalizeNullableText(lookup.tenantId);
  if (tenantId) {
    return (
      (await db
        .prepare('SELECT * FROM fluent_cloud_onboarding WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1')
        .bind(tenantId)
        .first<FluentCloudOnboardingRow>()) ?? null
    );
  }

  return null;
}

async function finalizeOnboardingChange(
  db: FluentDatabase,
  before: FluentCloudOnboardingRow,
  input: {
    actorId?: string | null;
    actorLabel?: string | null;
    actorType: string;
    eventType: string;
    metadata?: unknown;
    note?: string | null;
    updates: Record<string, unknown>;
  },
): Promise<FluentCloudOnboardingRecord> {
  const postUpdateState = deriveCurrentState({ ...before, ...coerceRowPatch(input.updates) });
  input.updates.current_state = postUpdateState;
  await updateOnboardingRow(db, before.email_normalized, input.updates);
  const after = await findOnboardingRow(db, { email: before.email_normalized });
  if (!after) {
    throw new Error(`Missing Fluent onboarding row for ${before.email_normalized} after update.`);
  }

  await insertOnboardingEvent(db, after, {
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    actorType: input.actorType,
    eventType: input.eventType,
    metadata: input.metadata,
    note: input.note,
  }, normalizeState(before.current_state), normalizeState(after.current_state));

  return hydrateOnboardingRecord(after);
}

async function updateOnboardingRow(
  db: FluentDatabase,
  emailNormalized: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }

  const sql = `UPDATE fluent_cloud_onboarding
    SET ${entries.map(([key]) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE email_normalized = ?`;
  await db
    .prepare(sql)
    .bind(...entries.map(([, value]) => value), emailNormalized)
    .run();
}

async function insertOnboardingEvent(
  db: FluentDatabase,
  row: FluentCloudOnboardingRow,
  event: FluentCloudOnboardingEventInput,
  fromState: FluentCloudOnboardingState | null,
  toState: FluentCloudOnboardingState | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fluent_cloud_onboarding_events (
        id, email_normalized, user_id, tenant_id, event_type, from_state, to_state, actor_type, actor_id, actor_label, note, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `cloud-onboarding-event:${crypto.randomUUID()}`,
      row.email_normalized,
      row.user_id,
      row.tenant_id,
      event.eventType,
      fromState,
      toState,
      event.actorType,
      normalizeNullableText(event.actorId),
      normalizeNullableText(event.actorLabel),
      normalizeNullableText(event.note ?? null),
      stringifyJson(event.metadata),
    )
    .run();
}

function hydrateOnboardingRecord(row: FluentCloudOnboardingRow): FluentCloudOnboardingRecord {
  const currentState = deriveCurrentState(row);
  const requiredTimestamps = requiredTimestampsForState(currentState);
  const timestamps = Object.fromEntries(TIMESTAMP_KEYS.map((key) => [toPublicTimestampKey(key), normalizeNullableText(row[key])])) as Record<
    string,
    string | null
  >;
  const failureCount = asCount(row.failure_count);
  const supportStatus = deriveSupportStatus(row);

  return {
    accountKind: normalizeNullableText(row.account_kind),
    allowedOperatorActions: allowedOperatorActionsForState(currentState),
    currentState,
    email: normalizeNullableText(row.email),
    emailNormalized: row.email_normalized,
    failure:
      row.failure_stage || row.failure_code || row.failure_message
        ? {
            code: normalizeNullableText(row.failure_code),
            count: failureCount,
            message: normalizeNullableText(row.failure_message),
            retryAfter: normalizeNullableText(row.retry_after),
            retryBehavior: buildRetryBehavior(row.failure_stage, failureCount, row.retry_after),
            stage: normalizeNullableText(row.failure_stage),
          }
        : null,
    firstConnectedClient: {
      id: normalizeNullableText(row.first_connected_client_id),
      name: normalizeNullableText(row.first_connected_client_name),
    },
    firstDomainId: normalizeNullableText(row.first_domain_id),
    lastConnectedClient: {
      id: normalizeNullableText(row.last_connected_client_id),
      name: normalizeNullableText(row.last_connected_client_name),
    },
    metadata: safeParse(row.metadata_json),
    missingTimestamps: requiredTimestamps.filter((key) => !timestamps[key]),
    requiredTimestamps,
    stateSummary: buildStateSummary(currentState, row),
    support: {
      note: buildSupportNote(supportStatus, row.support_ticket_ref),
      notes: normalizeNullableText(row.support_notes),
      status: supportStatus,
      tags: normalizeSupportTags(null, row.support_tags_json),
      ticketRef: normalizeNullableText(row.support_ticket_ref),
    },
    stripeCustomerId: normalizeNullableText(row.stripe_customer_id),
    stripeSubscriptionId: normalizeNullableText(row.stripe_subscription_id),
    tenantId: normalizeNullableText(row.tenant_id),
    timestamps,
    userId: normalizeNullableText(row.user_id),
  };
}

function deriveCurrentState(row: Partial<FluentCloudOnboardingRow>): FluentCloudOnboardingState {
  if (normalizeNullableText(row.deleted_at)) {
    return 'deleted';
  }
  if (normalizeNullableText(row.deletion_requested_at)) {
    return 'deletion_requested';
  }
  if (normalizeNullableText(row.suspended_at)) {
    return 'suspended';
  }

  for (let index = STATUS_SEQUENCE.length - 1; index >= 0; index -= 1) {
    const milestone = STATUS_SEQUENCE[index];
    if (normalizeNullableText(row[milestone.timestamp])) {
      return milestone.state;
    }
  }

  return 'waitlisted';
}

function requiredTimestampsForState(state: FluentCloudOnboardingState): string[] {
  const rule = fluentCloudOnboardingDescriptor().transitionRules.find((entry) => entry.state === state);
  return rule ? [...rule.requiredTimestamps] : [];
}

function allowedOperatorActionsForState(state: FluentCloudOnboardingState): FluentCloudOperatorAction[] {
  switch (state) {
    case 'waitlisted':
      return ['invite', 'provision_reviewer_demo', 'record_failure', 'clear_failure', 'escalate_support', 'resolve_support'];
    case 'invited':
      return ['accept_invite', 'waitlist', 'suspend', 'request_deletion', 'record_failure', 'clear_failure', 'escalate_support', 'resolve_support'];
    case 'invite_accepted':
    case 'account_created':
      return [
        'mark_checkout_required',
        'mark_trialing',
        'mark_active',
        'suspend',
        'request_deletion',
        'record_failure',
        'clear_failure',
        'escalate_support',
        'resolve_support',
      ];
    case 'checkout_required':
    case 'trialing':
    case 'past_due_grace':
    case 'limited_access':
    case 'canceled_retention':
      return [
        'mark_checkout_required',
        'mark_trialing',
        'mark_active',
        'mark_past_due_grace',
        'mark_limited_access',
        'mark_canceled_retention',
        'suspend',
        'request_deletion',
        'record_failure',
        'clear_failure',
        'escalate_support',
        'resolve_support',
      ];
    case 'suspended':
      return ['resume', 'request_deletion', 'record_failure', 'clear_failure', 'escalate_support', 'resolve_support'];
    case 'deletion_requested':
      return ['cancel_deletion', 'delete', 'record_failure', 'clear_failure', 'escalate_support', 'resolve_support'];
    case 'deleted':
      return ['resolve_support'];
    default:
      return ['suspend', 'request_deletion', 'record_failure', 'clear_failure', 'escalate_support', 'resolve_support'];
  }
}

function deriveSupportStatus(row: FluentCloudOnboardingRow): FluentCloudSupportStatus {
  const explicit = normalizeSupportStatus(row.support_status);
  if (explicit === 'escalated' || explicit === 'resolved') {
    return explicit;
  }
  if (explicit === 'recommended') {
    return 'recommended';
  }
  if (asCount(row.failure_count) >= RECOMMENDED_SUPPORT_FAILURE_THRESHOLD) {
    return 'recommended';
  }
  if (deriveCurrentState(row) === 'suspended' || deriveCurrentState(row) === 'deletion_requested') {
    return 'recommended';
  }
  return 'none';
}

function buildStateSummary(state: FluentCloudOnboardingState, row: FluentCloudOnboardingRow): string {
  const base = (() => {
    switch (state) {
      case 'waitlisted':
        return 'This account has requested Fluent early access and is not invited yet.';
      case 'invited':
        return 'This account is invited to Fluent early access and can finish sign-in with the approved email.';
      case 'invite_accepted':
        return 'The invite has been accepted and hosted account provisioning is ready to complete.';
      case 'account_created':
        return 'The Fluent account exists and can continue toward trial or active access.';
      case 'checkout_required':
        return 'This account is waiting for the managed checkout step outside ChatGPT.';
      case 'trialing':
        return 'This Fluent early-access account is trialing.';
      case 'active':
        return 'This Fluent early-access account is active.';
      case 'past_due_grace':
        return 'This account has a payment failure and remains in full access during the 7-day grace period.';
      case 'limited_access':
        return 'This account is in limited access. Export, deletion, reactivation, and billing management remain available while domain tools are paused.';
      case 'canceled_retention':
        return 'This account is canceled or lapsed and remains exportable during the 90-day retention window before Fluent domain/account data cleanup.';
      case 'suspended':
        return 'This Fluent early-access account is suspended until an operator resumes it.';
      case 'deletion_requested':
        return 'Deletion has been requested for this account and access should remain blocked until the request is resolved.';
      case 'deleted':
        return 'This Fluent early-access account has been deleted.';
    }
  })();

  if (row.failure_stage || row.failure_code) {
    return `${base} Current failure: ${row.failure_stage ?? 'unknown-stage'} / ${row.failure_code ?? 'unknown-code'}.`;
  }

  return base;
}

function buildRetryBehavior(stage: string | null, failureCount: number, retryAfter: string | null): string {
  const retryTiming = retryAfter ? `retry after ${retryAfter}` : 'retry immediately';
  if (!stage) {
    return retryTiming;
  }
  if (failureCount >= RECOMMENDED_SUPPORT_FAILURE_THRESHOLD) {
    return `${retryTiming}; support escalation is recommended.`;
  }
  return `${retryTiming}; retry the same onboarding milestone.`;
}

function buildSupportNote(status: FluentCloudSupportStatus, ticketRef: string | null): string {
  switch (status) {
    case 'recommended':
      return ticketRef
        ? `Support follow-up is recommended. Current reference: ${ticketRef}.`
        : 'Support follow-up is recommended before the next retry.';
    case 'escalated':
      return ticketRef ? `Support is engaged. Current reference: ${ticketRef}.` : 'Support is engaged for this onboarding record.';
    case 'resolved':
      return ticketRef ? `Support issue resolved under ${ticketRef}.` : 'Support issue resolved.';
    default:
      return 'No support escalation is currently required.';
  }
}

function domainFromToolCall(toolName: string, args?: Record<string, unknown>): string | null {
  if (toolName.startsWith('meals_')) {
    return 'meals';
  }
  if (toolName.startsWith('style_')) {
    return 'style';
  }
  if (toolName.startsWith('health_')) {
    return 'health';
  }
  if (
    toolName === 'fluent_enable_domain' ||
    toolName === 'fluent_disable_domain' ||
    toolName === 'fluent_begin_domain_onboarding' ||
    toolName === 'fluent_complete_domain_onboarding'
  ) {
    const domainId = args?.domain_id;
    return typeof domainId === 'string' && domainId.trim() ? domainId.trim() : null;
  }
  return null;
}

function clearFailureFields(target: Record<string, unknown>): Record<string, unknown> {
  target.failure_code = null;
  target.failure_count = 0;
  target.failure_message = null;
  target.failure_stage = null;
  target.last_failure_at = null;
  target.retry_after = null;
  if (target.support_status === undefined) {
    target.support_status = 'none';
  }
  return target;
}

function clearAccountStatusTimestampsExcept(keep: keyof FluentCloudOnboardingRow): Record<string, null> {
  const resettable: Array<keyof FluentCloudOnboardingRow> = [
    'checkout_required_at',
    'trialing_at',
    'active_at',
    'past_due_grace_at',
    'limited_access_at',
    'canceled_retention_at',
  ];
  return Object.fromEntries(resettable.filter((key) => key !== keep).map((key) => [key, null])) as Record<string, null>;
}

function mergeMetadata(current: string | null, next: unknown): unknown {
  const currentRecord = asRecord(safeParse(current)) ?? {};
  const nextRecord = asRecord(next) ?? {};
  return {
    ...currentRecord,
    ...nextRecord,
  };
}

function toPublicTimestampKey(key: keyof FluentCloudOnboardingRow): string {
  return key.replace(/_at$/, 'At').replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function coerceRowPatch(updates: Record<string, unknown>): Partial<FluentCloudOnboardingRow> {
  return Object.fromEntries(Object.entries(updates)) as Partial<FluentCloudOnboardingRow>;
}

function normalizeOnboardingEmail(value: string | null | undefined): string | null {
  const normalized = normalizeNullableText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function requireNormalizedEmail(value: string): string {
  const normalized = normalizeOnboardingEmail(value);
  if (!normalized) {
    throw new Error('An email address is required for Fluent onboarding actions.');
  }
  return normalized;
}

function normalizeNullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeState(value: string | null | undefined): FluentCloudOnboardingState | null {
  return FLUENT_CLOUD_ONBOARDING_STATES.includes(value as FluentCloudOnboardingState)
    ? (value as FluentCloudOnboardingState)
    : null;
}

function normalizeSupportStatus(value: string | null | undefined): FluentCloudSupportStatus | null {
  switch ((value ?? '').trim()) {
    case 'none':
    case 'recommended':
    case 'escalated':
    case 'resolved':
      return value as FluentCloudSupportStatus;
    default:
      return null;
  }
}

function normalizeSupportTags(
  value: string[] | string | null | undefined,
  currentJson: string | null,
  defaults: string[] = [],
): string[] {
  const current = safeParse(currentJson);
  const currentTags = Array.isArray(current) ? current.filter((entry): entry is string => typeof entry === 'string') : [];
  const incoming = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return Array.from(
    new Set(
      [...currentTags, ...defaults, ...incoming]
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function firstTimestamp(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = normalizeNullableText(value);
    if (normalized) {
      return normalized;
    }
  }
  return new Date().toISOString();
}

function asCount(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function toCloudInviteActorType(value: string): FluentCloudInviteActor['actorType'] {
  return value === 'system' || value === 'user' ? value : 'operator';
}

function assertNotDeleted(record: FluentCloudOnboardingRow, action: string): void {
  if (normalizeNullableText(record.deleted_at)) {
    throw new Error(`Cannot apply ${action} because the onboarding record is already deleted.`);
  }
}

function humanizeState(state: FluentCloudOnboardingState): string {
  return state
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function safeParse(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
