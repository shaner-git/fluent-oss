import { FLUENT_SUPPORT_EMAIL, FLUENT_OSS_AVAILABLE_URL, FLUENT_CLOUD_WAITLIST_URL } from './cloud-early-access';
import { getHostedUserMembership, type HostedAuthUser, type HostedIdentityMembership } from './hosted-identity';
import type { FluentDatabase } from './storage';

export const ACCOUNT_DELETION_STATUSES = [
  'deletion_requested',
  'deletion_pending',
  'deletion_completed',
  'deletion_cancelled',
  'manual_review_required',
  'deletion_failed',
] as const;

export type AccountDeletionStatus = (typeof ACCOUNT_DELETION_STATUSES)[number];
export type AccountDeletionSubjectType = 'cloud_account' | 'waitlist_only';
export type AccountDeletionOperatorAction = 'complete' | 'fail' | 'cancel';

export interface AccountDeletionActor extends HostedAuthUser {
  sessionId?: string | null;
}

export interface AccountDeletionRequestRecord {
  id: string;
  subjectType: AccountDeletionSubjectType;
  userId: string | null;
  tenantId: string | null;
  profileId: string | null;
  email: string | null;
  emailNormalized: string | null;
  displayName: string | null;
  status: AccountDeletionStatus;
  requestReason: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  manualReviewReason: string | null;
  retentionSummaryJson: string | null;
  clientEffectsJson: string | null;
  timelineSummary: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AccountDeletionFlow {
  currentRequest: AccountDeletionRequestRecord | null;
  membership: HostedIdentityMembership | null;
  selfServeReady: boolean;
  subjectType: AccountDeletionSubjectType;
}

export interface AccountDeletionPolicySummary {
  connectedClients: string[];
  deletedData: string[];
  expectedTimeline: string;
  retentionExceptions: string[];
}

const WAITLIST_ONLY_TIMELINE =
  'Waitlist-only deletions are attempted immediately after confirmation and should finish in the same browser session.';
const CLOUD_ACCOUNT_TIMELINE =
  'Full Fluent accounts move into operator review after confirmation and should normally be completed within 30 days unless a retention exception or manual incident review applies.';

const WAITLIST_ONLY_DELETED_DATA = [
  'Better Auth sign-in data for the early-access request account, including the Better Auth user row plus its linked sessions, accounts, and opaque access tokens.',
  'Any early-access request, invite, onboarding, and pre-access hosted identity rows that were created before the account was approved.',
];

const CLOUD_ACCOUNT_DELETED_DATA = [
  'The Fluent tenant, profile, domain lifecycle state, and Fluent-hosted identity membership for the confirmed account.',
  'User-authored Fluent domain data across meals, health, and style, plus Fluent-hosted media artifacts tied to the account.',
  'Better Auth sign-in data for the account, including linked sessions, accounts, and access tokens, once deletion is completed.',
];

const RETENTION_EXCEPTIONS = [
  'Fluent retains the deletion request record and minimal audit metadata so operators can prove fulfillment, investigate abuse, and satisfy security or legal obligations.',
  `If a legal, billing, fraud, or safety hold applies, operators may retain only the minimum required metadata and move the request into manual review. Contact ${FLUENT_SUPPORT_EMAIL} for exceptions.`,
];

const CONNECTED_CLIENT_EFFECTS = [
  'Connected MCP clients keep working until a full Fluent account deletion is completed by an operator.',
  'Once deletion is completed, Better Auth sessions and OAuth access are revoked and connected clients must reauthenticate. Completed deletions cannot reconnect to Fluent.',
  'Waitlist-only self-serve deletions revoke the current waitlist account immediately after completion in the same session.',
];

const DEFAULT_RETENTION_SUMMARY_JSON = JSON.stringify(RETENTION_EXCEPTIONS);
const DEFAULT_CLIENT_EFFECTS_JSON = JSON.stringify(CONNECTED_CLIENT_EFFECTS);

export function buildAccountDeletionPolicy(subjectType: AccountDeletionSubjectType): AccountDeletionPolicySummary {
  return {
    connectedClients: [...CONNECTED_CLIENT_EFFECTS],
    deletedData: subjectType === 'waitlist_only' ? [...WAITLIST_ONLY_DELETED_DATA] : [...CLOUD_ACCOUNT_DELETED_DATA],
    expectedTimeline: subjectType === 'waitlist_only' ? WAITLIST_ONLY_TIMELINE : CLOUD_ACCOUNT_TIMELINE,
    retentionExceptions: [...RETENTION_EXCEPTIONS],
  };
}

export async function getAccountDeletionFlow(
  db: FluentDatabase,
  actor: AccountDeletionActor,
): Promise<AccountDeletionFlow> {
  const currentRequest = await findLatestAccountDeletionRequest(db, actor);
  const membership =
    currentRequest?.tenantId && currentRequest?.profileId
      ? {
          profileId: currentRequest.profileId,
          tenantId: currentRequest.tenantId,
        }
      : await getHostedUserMembership(db, actor.id);

  const subjectType = currentRequest?.subjectType ?? (membership ? 'cloud_account' : 'waitlist_only');
  return {
    currentRequest,
    membership,
    selfServeReady: subjectType === 'waitlist_only',
    subjectType,
  };
}

export async function requestAccountDeletion(
  db: FluentDatabase,
  actor: AccountDeletionActor,
  requestReason?: string | null,
): Promise<AccountDeletionFlow> {
  const flow = await getAccountDeletionFlow(db, actor);
  const currentRequest = flow.currentRequest;
  if (currentRequest && isTerminalStatus(currentRequest.status)) {
    const inserted = await insertAccountDeletionRequest(db, actor, flow, requestReason);
    return {
      ...flow,
      currentRequest: inserted,
    };
  }

  if (currentRequest) {
    if (currentRequest.status === 'deletion_requested') {
      return flow;
    }
    const updated = await updateAccountDeletionRequest(db, currentRequest.id, {
      requestReason: normalizeNullableText(requestReason) ?? currentRequest.requestReason,
      status: 'deletion_requested',
    });
    await recordAccountDeletionAuditEvent(db, {
      after: updated,
      before: currentRequest,
      eventType: 'account_deletion.requested',
      provenance: buildUserAuditProvenance(actor),
    });
    return {
      ...flow,
      currentRequest: updated,
    };
  }

  const inserted = await insertAccountDeletionRequest(db, actor, flow, requestReason);
  return {
    ...flow,
    currentRequest: inserted,
  };
}

export async function confirmAccountDeletion(
  db: FluentDatabase,
  actor: AccountDeletionActor,
): Promise<AccountDeletionFlow> {
  const requested = await requestAccountDeletion(db, actor);
  const currentRequest = requested.currentRequest;
  if (!currentRequest) {
    return requested;
  }

  if (currentRequest.status === 'deletion_completed') {
    return requested;
  }

  const now = timestamp();
  if (!requested.selfServeReady) {
    const updated = await updateAccountDeletionRequest(db, currentRequest.id, {
      confirmedAt: currentRequest.confirmedAt ?? now,
      manualReviewReason:
        'Self-serve account deletion for provisioned Fluent tenants is not enabled yet. Operator review is required before domain data and client access are fully removed.',
      status: 'manual_review_required',
      timelineSummary: CLOUD_ACCOUNT_TIMELINE,
    });
    await recordAccountDeletionAuditEvent(db, {
      after: updated,
      before: currentRequest,
      eventType: 'account_deletion.manual_review_required',
      provenance: buildUserAuditProvenance(actor),
    });
    return {
      ...requested,
      currentRequest: updated,
      selfServeReady: false,
      subjectType: 'cloud_account',
    };
  }

  const pending = await updateAccountDeletionRequest(db, currentRequest.id, {
    confirmedAt: currentRequest.confirmedAt ?? now,
    status: 'deletion_pending',
    timelineSummary: WAITLIST_ONLY_TIMELINE,
  });
  await recordAccountDeletionAuditEvent(db, {
    after: pending,
    before: currentRequest,
    eventType: 'account_deletion.pending',
    provenance: buildUserAuditProvenance(actor),
  });

  try {
    await deleteWaitlistOnlyAccountData(db, actor);
    const completed = await updateAccountDeletionRequest(db, currentRequest.id, {
      completedAt: now,
      lastError: null,
      status: 'deletion_completed',
    });
    await recordAccountDeletionAuditEvent(db, {
      after: completed,
      before: pending,
      eventType: 'account_deletion.completed',
      provenance: buildUserAuditProvenance(actor),
    });
    return {
      currentRequest: completed,
      membership: null,
      selfServeReady: true,
      subjectType: 'waitlist_only',
    };
  } catch (error) {
    const manualReviewRequired = await updateAccountDeletionRequest(db, currentRequest.id, {
      lastError: error instanceof Error ? error.message : String(error),
      manualReviewReason:
        'The automatic waitlist-only deletion pass could not finish cleanly. Operator review is required to complete deletion.',
      status: 'manual_review_required',
      timelineSummary: CLOUD_ACCOUNT_TIMELINE,
    });
    await recordAccountDeletionAuditEvent(db, {
      after: manualReviewRequired,
      before: pending,
      eventType: 'account_deletion.manual_review_required',
      provenance: buildUserAuditProvenance(actor),
    });
    return {
      currentRequest: manualReviewRequired,
      membership: null,
      selfServeReady: false,
      subjectType: 'waitlist_only',
    };
  }
}

export async function cancelAccountDeletion(
  db: FluentDatabase,
  actor: AccountDeletionActor,
): Promise<AccountDeletionFlow> {
  const flow = await getAccountDeletionFlow(db, actor);
  const currentRequest = flow.currentRequest;
  if (!currentRequest || isTerminalStatus(currentRequest.status)) {
    return flow;
  }

  const updated = await updateAccountDeletionRequest(db, currentRequest.id, {
    cancelledAt: currentRequest.cancelledAt ?? timestamp(),
    status: 'deletion_cancelled',
  });
  await recordAccountDeletionAuditEvent(db, {
    after: updated,
    before: currentRequest,
    eventType: 'account_deletion.cancelled',
    provenance: buildUserAuditProvenance(actor),
  });
  return {
    ...flow,
    currentRequest: updated,
  };
}

export async function applyOperatorAccountDeletionAction(
  db: FluentDatabase,
  input: {
    action: AccountDeletionOperatorAction;
    failureReason?: string | null;
    operatorName?: string | null;
    requestId: string;
  },
): Promise<AccountDeletionRequestRecord | null> {
  const current = await getAccountDeletionRequestById(db, input.requestId);
  if (!current) {
    return null;
  }

  const now = timestamp();
  let updated: AccountDeletionRequestRecord;
  let eventType: string;
  switch (input.action) {
    case 'complete':
      updated = await updateAccountDeletionRequest(db, current.id, {
        completedAt: current.completedAt ?? now,
        lastError: null,
        status: 'deletion_completed',
      });
      eventType = 'account_deletion.completed';
      break;
    case 'cancel':
      updated = await updateAccountDeletionRequest(db, current.id, {
        cancelledAt: current.cancelledAt ?? now,
        status: 'deletion_cancelled',
      });
      eventType = 'account_deletion.cancelled';
      break;
    case 'fail':
      updated = await updateAccountDeletionRequest(db, current.id, {
        failedAt: current.failedAt ?? now,
        lastError: normalizeNullableText(input.failureReason) ?? current.lastError ?? 'Operator marked the request as failed.',
        status: 'deletion_failed',
      });
      eventType = 'account_deletion.failed';
      break;
    default:
      return current;
  }

  await recordAccountDeletionAuditEvent(db, {
    after: updated,
    before: current,
    eventType,
    provenance: {
      actorEmail: null,
      actorName: normalizeNullableText(input.operatorName) ?? 'Fluent operator',
      sessionId: null,
      sourceAgent: 'fluent-cloud-account-deletion',
      sourceSkill: null,
      sourceType: 'operator',
    },
  });
  return updated;
}

export async function getAccountDeletionRequestById(
  db: FluentDatabase,
  requestId: string,
): Promise<AccountDeletionRequestRecord | null> {
  const row = await db
    .prepare(
      `SELECT
         id,
         subject_type,
         user_id,
         tenant_id,
         profile_id,
         email,
         email_normalized,
         display_name,
         status,
         request_reason,
         confirmed_at,
         completed_at,
         cancelled_at,
         failed_at,
         last_error,
         manual_review_reason,
         retention_summary_json,
         client_effects_json,
         timeline_summary,
         created_at,
         updated_at
       FROM fluent_account_deletion_requests
       WHERE id = ?`,
    )
    .bind(requestId)
    .first<Record<string, unknown>>();

  return row ? mapAccountDeletionRequestRow(row) : null;
}

function buildUserAuditProvenance(actor: AccountDeletionActor) {
  return {
    actorEmail: normalizeNullableText(actor.email),
    actorName: normalizeNullableText(actor.name),
    sessionId: normalizeNullableText(actor.sessionId),
    sourceAgent: 'fluent-cloud-account-deletion',
    sourceSkill: null,
    sourceType: 'user',
  };
}

async function insertAccountDeletionRequest(
  db: FluentDatabase,
  actor: AccountDeletionActor,
  flow: AccountDeletionFlow,
  requestReason?: string | null,
): Promise<AccountDeletionRequestRecord> {
  const now = timestamp();
  const requestId = `account-deletion:${crypto.randomUUID()}`;
  const subjectType = flow.subjectType;
  const requestReasonText = normalizeNullableText(requestReason);
  const membership = flow.membership;
  const displayName = normalizeNullableText(actor.name);
  const email = normalizeNullableText(actor.email);
  const emailNormalized = email?.toLowerCase() ?? null;
  await db
    .prepare(
      `INSERT INTO fluent_account_deletion_requests (
         id, subject_type, user_id, tenant_id, profile_id, email, email_normalized, display_name, status,
         request_reason, confirmed_at, completed_at, cancelled_at, failed_at, last_error, manual_review_reason,
         retention_summary_json, client_effects_json, timeline_summary, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
    )
    .bind(
      requestId,
      subjectType,
      actor.id,
      membership?.tenantId ?? null,
      membership?.profileId ?? null,
      email,
      emailNormalized,
      displayName,
      'deletion_requested',
      requestReasonText,
      DEFAULT_RETENTION_SUMMARY_JSON,
      DEFAULT_CLIENT_EFFECTS_JSON,
      subjectType === 'waitlist_only' ? WAITLIST_ONLY_TIMELINE : CLOUD_ACCOUNT_TIMELINE,
      now,
      now,
    )
    .run();

  const created = await getAccountDeletionRequestById(db, requestId);
  if (!created) {
    throw new Error('Unable to load the new account deletion request.');
  }
  await recordAccountDeletionAuditEvent(db, {
    after: created,
    before: null,
    eventType: 'account_deletion.requested',
    provenance: buildUserAuditProvenance(actor),
  });
  return created;
}

async function findLatestAccountDeletionRequest(
  db: FluentDatabase,
  actor: AccountDeletionActor,
): Promise<AccountDeletionRequestRecord | null> {
  const emailNormalized = normalizeNullableText(actor.email)?.toLowerCase() ?? null;
  const byUserRow = await db
    .prepare(
      `SELECT
         id,
         subject_type,
         user_id,
         tenant_id,
         profile_id,
         email,
         email_normalized,
         display_name,
         status,
         request_reason,
         confirmed_at,
         completed_at,
         cancelled_at,
         failed_at,
         last_error,
         manual_review_reason,
         retention_summary_json,
         client_effects_json,
         timeline_summary,
         created_at,
         updated_at
       FROM fluent_account_deletion_requests
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(actor.id)
    .first<Record<string, unknown>>();
  if (byUserRow) {
    return mapAccountDeletionRequestRow(byUserRow);
  }

  if (!emailNormalized) {
    return null;
  }

  const byEmailRow = await db
    .prepare(
      `SELECT
         id,
         subject_type,
         user_id,
         tenant_id,
         profile_id,
         email,
         email_normalized,
         display_name,
         status,
         request_reason,
         confirmed_at,
         completed_at,
         cancelled_at,
         failed_at,
         last_error,
         manual_review_reason,
         retention_summary_json,
         client_effects_json,
         timeline_summary,
         created_at,
         updated_at
       FROM fluent_account_deletion_requests
       WHERE email_normalized = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(emailNormalized)
    .first<Record<string, unknown>>();

  return byEmailRow ? mapAccountDeletionRequestRow(byEmailRow) : null;
}

async function updateAccountDeletionRequest(
  db: FluentDatabase,
  requestId: string,
  updates: {
    cancelledAt?: string | null;
    clientEffectsJson?: string | null;
    completedAt?: string | null;
    confirmedAt?: string | null;
    failedAt?: string | null;
    lastError?: string | null;
    manualReviewReason?: string | null;
    requestReason?: string | null;
    retentionSummaryJson?: string | null;
    status?: AccountDeletionStatus;
    timelineSummary?: string | null;
  },
): Promise<AccountDeletionRequestRecord> {
  const current = await getAccountDeletionRequestById(db, requestId);
  if (!current) {
    throw new Error(`Unable to reload account deletion request ${requestId} before updating it.`);
  }

  await db
    .prepare(
      `UPDATE fluent_account_deletion_requests
       SET status = COALESCE(?, status),
           request_reason = COALESCE(?, request_reason),
           confirmed_at = COALESCE(?, confirmed_at),
           completed_at = COALESCE(?, completed_at),
           cancelled_at = COALESCE(?, cancelled_at),
           failed_at = COALESCE(?, failed_at),
           last_error = ?,
           manual_review_reason = ?,
           retention_summary_json = COALESCE(?, retention_summary_json),
           client_effects_json = COALESCE(?, client_effects_json),
           timeline_summary = COALESCE(?, timeline_summary),
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      updates.status ?? null,
      updates.requestReason ?? null,
      updates.confirmedAt ?? null,
      updates.completedAt ?? null,
      updates.cancelledAt ?? null,
      updates.failedAt ?? null,
      typeof updates.lastError === 'undefined' ? current.lastError : updates.lastError,
      typeof updates.manualReviewReason === 'undefined' ? current.manualReviewReason : updates.manualReviewReason,
      updates.retentionSummaryJson ?? null,
      updates.clientEffectsJson ?? null,
      updates.timelineSummary ?? null,
      timestamp(),
      requestId,
    )
    .run();

  const updated = await getAccountDeletionRequestById(db, requestId);
  if (!updated) {
    throw new Error(`Unable to reload account deletion request ${requestId}.`);
  }
  return updated;
}

async function deleteWaitlistOnlyAccountData(db: FluentDatabase, actor: AccountDeletionActor): Promise<void> {
  const normalizedEmail = normalizeNullableText(actor.email)?.toLowerCase() ?? null;
  const statements = [
    // Delete waitlist-only lifecycle rows before auth rows so we do not leave recoverable
    // onboarding or invite state behind after the signed-in identity disappears.
    db.prepare('DELETE FROM fluent_cloud_access_audit_log WHERE email_normalized = ? OR user_id = ?').bind(
      normalizedEmail,
      actor.id,
    ),
    db.prepare('DELETE FROM fluent_cloud_onboarding_events WHERE email_normalized = ? OR user_id = ?').bind(
      normalizedEmail,
      actor.id,
    ),
    db.prepare('DELETE FROM fluent_cloud_onboarding WHERE email_normalized = ? OR user_id = ?').bind(normalizedEmail, actor.id),
    db.prepare('DELETE FROM fluent_cloud_invites WHERE email_normalized = ?').bind(normalizedEmail),
    db.prepare('DELETE FROM fluent_cloud_waitlist_entries WHERE email_normalized = ?').bind(normalizedEmail),
    db.prepare('DELETE FROM oauthAccessToken WHERE userId = ?').bind(actor.id),
    db.prepare('DELETE FROM session WHERE userId = ?').bind(actor.id),
    db.prepare('DELETE FROM account WHERE userId = ?').bind(actor.id),
    db.prepare('DELETE FROM verification WHERE identifier = ?').bind(normalizedEmail),
    db.prepare('DELETE FROM fluent_user_memberships WHERE user_id = ?').bind(actor.id),
    db.prepare('DELETE FROM fluent_user_identities WHERE id = ?').bind(actor.id),
    db.prepare('DELETE FROM "user" WHERE id = ?').bind(actor.id),
  ];

  await db.batch(statements);
}

async function recordAccountDeletionAuditEvent(
  db: FluentDatabase,
  input: {
    after: AccountDeletionRequestRecord | null;
    before: AccountDeletionRequestRecord | null;
    eventType: string;
    provenance: {
      actorEmail: string | null;
      actorName: string | null;
      sessionId: string | null;
      sourceAgent: string | null;
      sourceSkill: string | null;
      sourceType: string | null;
    };
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO domain_events (
         id, domain, entity_type, entity_id, event_type, before_json, after_json, patch_json,
         source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `domain-event:${crypto.randomUUID()}`,
      'core',
      'fluent_account_deletion_request',
      input.after?.id ?? input.before?.id ?? null,
      input.eventType,
      stringifyJson(input.before),
      stringifyJson(input.after),
      stringifyJson(
        input.after
          ? {
              status: input.after.status,
              timeline_summary: input.after.timelineSummary,
            }
          : null,
      ),
      input.provenance.sourceAgent,
      input.provenance.sourceSkill,
      input.provenance.sessionId,
      null,
      input.provenance.sourceType,
      input.provenance.actorEmail,
      input.provenance.actorName,
    )
    .run();
}

function mapAccountDeletionRequestRow(row: Record<string, unknown>): AccountDeletionRequestRecord {
  return {
    cancelledAt: asNullableString(row.cancelled_at),
    clientEffectsJson: asNullableString(row.client_effects_json),
    completedAt: asNullableString(row.completed_at),
    confirmedAt: asNullableString(row.confirmed_at),
    createdAt: asNullableString(row.created_at),
    displayName: asNullableString(row.display_name),
    email: asNullableString(row.email),
    emailNormalized: asNullableString(row.email_normalized),
    failedAt: asNullableString(row.failed_at),
    id: String(row.id ?? ''),
    lastError: asNullableString(row.last_error),
    manualReviewReason: asNullableString(row.manual_review_reason),
    profileId: asNullableString(row.profile_id),
    requestReason: asNullableString(row.request_reason),
    retentionSummaryJson: asNullableString(row.retention_summary_json),
    status: normalizeStatus(row.status),
    subjectType: normalizeSubjectType(row.subject_type),
    tenantId: asNullableString(row.tenant_id),
    timelineSummary: asNullableString(row.timeline_summary),
    updatedAt: asNullableString(row.updated_at),
    userId: asNullableString(row.user_id),
  };
}

function normalizeStatus(value: unknown): AccountDeletionStatus {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return ACCOUNT_DELETION_STATUSES.includes(normalized as AccountDeletionStatus)
    ? (normalized as AccountDeletionStatus)
    : 'deletion_requested';
}

function normalizeSubjectType(value: unknown): AccountDeletionSubjectType {
  return value === 'waitlist_only' ? 'waitlist_only' : 'cloud_account';
}

function isTerminalStatus(status: AccountDeletionStatus): boolean {
  return status === 'deletion_completed' || status === 'deletion_cancelled' || status === 'deletion_failed';
}

function stringifyJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function getAccountDeletionSupportLinks(): {
  ossUrl: string;
  supportEmail: string;
  waitlistUrl: string;
} {
  return {
    ossUrl: FLUENT_OSS_AVAILABLE_URL,
    supportEmail: FLUENT_SUPPORT_EMAIL,
    waitlistUrl: FLUENT_CLOUD_WAITLIST_URL,
  };
}
