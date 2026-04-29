import { evaluateFluentCloudAccess } from './cloud-early-access';
import type { FluentDatabase } from './storage';

export const FLUENT_CLOUD_INVITE_TTL_DAYS = 14;

export const FLUENT_CLOUD_PUBLIC_LIFECYCLE_STATES = [
  'waitlist_pending_review',
  'waitlist_approved',
  'waitlist_declined',
  'invite_sent',
  'invite_expired',
  'invite_canceled',
  'invite_accepted',
  'account_onboarding',
  'account_active',
] as const;

export const FLUENT_CLOUD_PUBLIC_LIFECYCLE_EVENTS = [
  'waitlist_submitted',
  'waitlist_reviewed_approved',
  'waitlist_reviewed_declined',
  'invite_created',
  'invite_resent',
  'invite_expired',
  'invite_canceled',
  'invite_accepted',
  'account_onboarding_started',
  'account_activated',
  'account_deleted_before_activation',
] as const;

export type FluentCloudPublicLifecycleState = (typeof FLUENT_CLOUD_PUBLIC_LIFECYCLE_STATES)[number];
export type FluentCloudPublicLifecycleEvent = (typeof FLUENT_CLOUD_PUBLIC_LIFECYCLE_EVENTS)[number];

export type FluentCloudReviewStatus = 'approved' | 'declined' | 'pending_review';
export type FluentCloudInviteState = 'invite_accepted' | 'invite_canceled' | 'invite_expired' | 'invite_sent';
export type HostedCloudAccessSource =
  | 'cloud_invite'
  | 'duplicate_active_account'
  | 'existing_membership'
  | 'legacy_allowlist'
  | 'open_dev';

export interface FluentCloudInviteActor {
  actorEmail?: string | null;
  actorId?: string | null;
  actorType: 'operator' | 'system' | 'user';
}

export interface FluentCloudApprovedWaitlistEntryInput {
  email: string;
  metadata?: unknown;
  reviewedAt?: Date | string | null;
  sourceEntryId?: string | null;
  sourceSystem?: string | null;
}

export interface FluentCloudIssueInviteInput extends FluentCloudApprovedWaitlistEntryInput {
  actor?: FluentCloudInviteActor;
  expiresAt?: Date | string | null;
  ttlDays?: number;
}

export interface FluentCloudInviteMutationInput {
  actor?: FluentCloudInviteActor;
  inviteId: string;
  metadata?: unknown;
  now?: Date | string | null;
  reason?: string | null;
  ttlDays?: number;
}

export interface HostedCloudAccessInput {
  accessMode?: string | null;
  allowAllCloudEmailsForDev?: boolean | string | null;
  allowedEmails: readonly string[];
  deploymentEnvironment?: string | null;
  email: string | null | undefined;
  userId?: string | null;
}

export interface HostedCloudProvisioningSource {
  accessSource: Exclude<HostedCloudAccessSource, 'duplicate_active_account' | 'existing_membership'>;
  acceptedAt?: string | null;
  inviteId?: string | null;
  waitlistEntryId?: string | null;
}

export interface HostedCloudAccessDecision {
  accountTenantId: string | null;
  allowed: boolean;
  denialReason:
    | 'duplicate_active_account'
    | 'invite_canceled'
    | 'invite_expired'
    | 'waitlist_approved'
    | 'waitlist_declined'
    | 'waitlist_pending_review'
    | null;
  invite: FluentCloudInviteRecord | null;
  provisioningSource: HostedCloudProvisioningSource | null;
  publicState: FluentCloudPublicLifecycleState;
  source: HostedCloudAccessSource | null;
  waitlistEntry: FluentCloudWaitlistEntryRecord | null;
}

export interface FluentCloudWaitlistEntryRecord {
  acceptedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  email: string;
  emailNormalized: string;
  id: string;
  invitedAt: string | null;
  lastInviteId: string | null;
  metadata: unknown;
  publicState: FluentCloudPublicLifecycleState;
  reviewStatus: FluentCloudReviewStatus;
  reviewedAt: string | null;
  sourceEntryId: string | null;
  sourceSystem: string;
  updatedAt: string;
}

export interface FluentCloudInviteRecord {
  acceptedAt: string | null;
  acceptedTenantId: string | null;
  acceptedUserId: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  emailNormalized: string;
  expiresAt: string;
  id: string;
  lastSentAt: string;
  metadata: unknown;
  sendCount: number;
  state: FluentCloudInviteState;
  updatedAt: string;
  waitlistEntryId: string;
}

export interface FluentCloudIssueInviteResult {
  accountTenantId: string | null;
  invite: FluentCloudInviteRecord;
  outcome: 'duplicate_active_account' | 'invite_already_accepted' | 'invite_already_open' | 'invite_created';
  waitlistEntry: FluentCloudWaitlistEntryRecord;
}

export interface FluentCloudAcceptInviteResult {
  invite: FluentCloudInviteRecord;
  waitlistEntry: FluentCloudWaitlistEntryRecord;
}

export interface FluentCloudDeletePendingAccountInput {
  actor?: FluentCloudInviteActor;
  now?: Date | string | null;
  reason?: string | null;
  tenantId: string;
}

export interface FluentCloudDeletePendingAccountResult {
  deleted: boolean;
  previousStatus: string;
  tenantId: string;
}

export async function issueFluentCloudInviteFromApprovedWaitlist(
  db: FluentDatabase,
  input: FluentCloudIssueInviteInput,
): Promise<FluentCloudIssueInviteResult> {
  const now = toIsoString(input.reviewedAt) ?? nowIsoString();
  const email = normalizeRequiredEmail(input.email);
  const actor = normalizeActor(input.actor);

  await expireStaleFluentCloudInvites(db, { emailNormalized: email, now });

  const existingAccount = await findActiveCloudAccountByEmail(db, email);
  if (existingAccount) {
    const waitlistEntry = await upsertApprovedWaitlistEntry(db, input, now);
    const invite = (await getLatestInviteByEmail(db, email)) ?? createSyntheticInvite(waitlistEntry.id, email, now);
    await recordFluentCloudAuditEvent(db, {
      actor,
      details: {
        outcome: 'duplicate_active_account',
      },
      emailNormalized: email,
      eventType: 'invite.duplicate_active_account',
      inviteId: invite.id,
      tenantId: existingAccount.tenantId,
      waitlistEntryId: waitlistEntry.id,
    });
    return {
      accountTenantId: existingAccount.tenantId,
      invite,
      outcome: 'duplicate_active_account',
      waitlistEntry,
    };
  }

  const waitlistEntry = await upsertApprovedWaitlistEntry(db, input, now);
  const existingInvite = await getLatestInviteByEmail(db, email);
  if (existingInvite?.state === 'invite_sent' && existingInvite.expiresAt > now) {
    return {
      accountTenantId: null,
      invite: existingInvite,
      outcome: 'invite_already_open',
      waitlistEntry,
    };
  }
  if (existingInvite?.state === 'invite_accepted') {
    return {
      accountTenantId: existingInvite.acceptedTenantId,
      invite: existingInvite,
      outcome: 'invite_already_accepted',
      waitlistEntry,
    };
  }

  const inviteId = `cloud-invite:${crypto.randomUUID()}`;
  const expiresAt = resolveInviteExpiry(now, input.expiresAt, input.ttlDays);
  const metadata = input.metadata ?? null;

  await db
    .prepare(
      `INSERT INTO fluent_cloud_invites (
        id, waitlist_entry_id, email_normalized, state, send_count, expires_at, last_sent_at, metadata_json
      ) VALUES (?, ?, ?, 'invite_sent', 1, ?, ?, ?)`,
    )
    .bind(inviteId, waitlistEntry.id, email, expiresAt, now, stringifyJson(metadata))
    .run();

  await db
    .prepare(
      `UPDATE fluent_cloud_waitlist_entries
       SET public_state = 'invite_sent',
           invited_at = ?,
           last_invite_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(now, inviteId, waitlistEntry.id)
    .run();

  await recordFluentCloudAuditEvent(db, {
    actor,
    details: {
      expiresAt,
      sourceEntryId: waitlistEntry.sourceEntryId,
      sourceSystem: waitlistEntry.sourceSystem,
    },
    emailNormalized: email,
    eventType: 'invite.created',
    inviteId,
    waitlistEntryId: waitlistEntry.id,
  });

  return {
    accountTenantId: null,
    invite: await getInviteById(db, inviteId),
    outcome: 'invite_created',
    waitlistEntry: await getWaitlistEntryById(db, waitlistEntry.id),
  };
}

export async function resendFluentCloudInvite(
  db: FluentDatabase,
  input: FluentCloudInviteMutationInput,
): Promise<FluentCloudInviteRecord> {
  const actor = normalizeActor(input.actor);
  const now = toIsoString(input.now) ?? nowIsoString();
  const invite = await getInviteById(db, input.inviteId);

  if (invite.state === 'invite_accepted') {
    throw new Error(`Invite ${input.inviteId} has already been accepted and cannot be resent.`);
  }
  if (invite.state === 'invite_canceled') {
    throw new Error(`Invite ${input.inviteId} has been canceled and cannot be resent.`);
  }

  const expiresAt = resolveInviteExpiry(now, null, input.ttlDays);
  const metadata = mergeMetadata(invite.metadata, input.metadata);

  await db
    .prepare(
      `UPDATE fluent_cloud_invites
       SET state = 'invite_sent',
           send_count = send_count + 1,
           expires_at = ?,
           last_sent_at = ?,
           metadata_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(expiresAt, now, stringifyJson(metadata), invite.id)
    .run();

  await db
    .prepare(
      `UPDATE fluent_cloud_waitlist_entries
       SET public_state = 'invite_sent',
           invited_at = COALESCE(invited_at, ?),
           last_invite_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(now, invite.id, invite.waitlistEntryId)
    .run();

  await recordFluentCloudAuditEvent(db, {
    actor,
    details: {
      expiresAt,
      sendCount: invite.sendCount + 1,
    },
    emailNormalized: invite.emailNormalized,
    eventType: 'invite.resent',
    inviteId: invite.id,
    waitlistEntryId: invite.waitlistEntryId,
  });

  return getInviteById(db, invite.id);
}

export async function cancelFluentCloudInvite(
  db: FluentDatabase,
  input: FluentCloudInviteMutationInput,
): Promise<FluentCloudInviteRecord> {
  const actor = normalizeActor(input.actor);
  const now = toIsoString(input.now) ?? nowIsoString();
  const invite = await getInviteById(db, input.inviteId);

  if (invite.state === 'invite_accepted') {
    throw new Error(`Invite ${input.inviteId} has already been accepted and cannot be canceled.`);
  }
  if (invite.state === 'invite_canceled') {
    return invite;
  }

  await db
    .prepare(
      `UPDATE fluent_cloud_invites
       SET state = 'invite_canceled',
           canceled_at = ?,
           cancel_reason = ?,
           metadata_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(now, normalizeNullableText(input.reason), stringifyJson(mergeMetadata(invite.metadata, input.metadata)), invite.id)
    .run();

  await db
    .prepare(
      `UPDATE fluent_cloud_waitlist_entries
       SET public_state = 'invite_canceled',
           canceled_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(now, invite.waitlistEntryId)
    .run();

  await recordFluentCloudAuditEvent(db, {
    actor,
    details: {
      reason: normalizeNullableText(input.reason),
    },
    emailNormalized: invite.emailNormalized,
    eventType: 'invite.canceled',
    inviteId: invite.id,
    waitlistEntryId: invite.waitlistEntryId,
  });

  return getInviteById(db, invite.id);
}

export async function expireStaleFluentCloudInvites(
  db: FluentDatabase,
  input: { emailNormalized?: string | null; now?: Date | string | null } = {},
): Promise<number> {
  const now = toIsoString(input.now) ?? nowIsoString();
  const invites = await listExpirableInvites(db, input.emailNormalized ? normalizeRequiredEmail(input.emailNormalized) : null, now);
  for (const invite of invites) {
    await db
      .prepare(
        `UPDATE fluent_cloud_invites
         SET state = 'invite_expired',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(invite.id)
      .run();

    await db
      .prepare(
        `UPDATE fluent_cloud_waitlist_entries
         SET public_state = CASE
           WHEN last_invite_id = ? THEN 'invite_expired'
           ELSE public_state
         END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(invite.id, invite.waitlistEntryId)
      .run();

    await recordFluentCloudAuditEvent(db, {
      actor: SYSTEM_ACTOR,
      details: {
        expiredAt: now,
      },
      emailNormalized: invite.emailNormalized,
      eventType: 'invite.expired',
      inviteId: invite.id,
      waitlistEntryId: invite.waitlistEntryId,
    });
  }

  return invites.length;
}

export async function acceptFluentCloudInviteForHostedUser(
  db: FluentDatabase,
  user: { email: string | null; id: string },
  actor: FluentCloudInviteActor = SYSTEM_ACTOR,
): Promise<FluentCloudAcceptInviteResult> {
  const email = normalizeRequiredEmail(user.email);
  const now = nowIsoString();

  await expireStaleFluentCloudInvites(db, { emailNormalized: email, now });

  const existingAccount = await findActiveCloudAccountByEmail(db, email);
  if (existingAccount && existingAccount.userId !== user.id) {
    throw new Error(`The invited email ${email} is already attached to an active Fluent Cloud account.`);
  }

  const invite = await getLatestInviteByEmail(db, email);
  if (!invite || invite.state !== 'invite_sent' || invite.expiresAt <= now) {
    throw new Error(`The account ${email} does not have a valid Fluent Cloud invite.`);
  }

  await db
    .prepare(
      `UPDATE fluent_cloud_invites
       SET state = 'invite_accepted',
           accepted_at = ?,
           accepted_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(now, user.id, invite.id)
    .run();

  await db
    .prepare(
      `UPDATE fluent_cloud_waitlist_entries
       SET public_state = 'invite_accepted',
           accepted_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(now, invite.waitlistEntryId)
    .run();

  await recordFluentCloudAuditEvent(db, {
    actor,
    details: {
      userId: user.id,
    },
    emailNormalized: email,
    eventType: 'invite.accepted',
    inviteId: invite.id,
    userId: user.id,
    waitlistEntryId: invite.waitlistEntryId,
  });

  return {
    invite: await getInviteById(db, invite.id),
    waitlistEntry: await getWaitlistEntryById(db, invite.waitlistEntryId),
  };
}

export async function evaluateHostedCloudInviteAccess(
  db: FluentDatabase,
  input: HostedCloudAccessInput,
): Promise<HostedCloudAccessDecision> {
  const fallbackAccess = evaluateFluentCloudAccess({
    accessMode: input.accessMode,
    allowAllCloudEmailsForDev: input.allowAllCloudEmailsForDev,
    allowedEmails: input.allowedEmails,
    deploymentEnvironment: input.deploymentEnvironment,
    email: input.email,
  });
  const normalizedEmail = normalizeOptionalEmail(input.email);
  const membershipByUser = input.userId ? await findMembershipByUserId(db, input.userId) : null;
  if (membershipByUser) {
    return {
      accountTenantId: membershipByUser.tenantId,
      allowed: true,
      denialReason: null,
      invite: null,
      provisioningSource: null,
      publicState: 'account_active',
      source: 'existing_membership',
      waitlistEntry: normalizedEmail ? await getWaitlistEntryByEmail(db, normalizedEmail) : null,
    };
  }

  if (fallbackAccess.allowed && fallbackAccess.resolvedMode === 'open_dev') {
    return {
      accountTenantId: null,
      allowed: true,
      denialReason: null,
      invite: null,
      provisioningSource: {
        accessSource: 'open_dev',
      },
      publicState: 'account_onboarding',
      source: 'open_dev',
      waitlistEntry: normalizedEmail ? await getWaitlistEntryByEmail(db, normalizedEmail) : null,
    };
  }

  const existingAccount = normalizedEmail ? await findActiveCloudAccountByEmail(db, normalizedEmail) : null;
  if (existingAccount && input.userId && existingAccount.userId !== input.userId) {
    return {
      accountTenantId: existingAccount.tenantId,
      allowed: false,
      denialReason: 'duplicate_active_account',
      invite: normalizedEmail ? await getLatestInviteByEmail(db, normalizedEmail) : null,
      provisioningSource: null,
      publicState: 'account_active',
      source: 'duplicate_active_account',
      waitlistEntry: normalizedEmail ? await getWaitlistEntryByEmail(db, normalizedEmail) : null,
    };
  }

  if (!normalizedEmail) {
    return {
      accountTenantId: null,
      allowed: false,
      denialReason: 'waitlist_pending_review',
      invite: null,
      provisioningSource: null,
      publicState: 'waitlist_pending_review',
      source: null,
      waitlistEntry: null,
    };
  }

  await expireStaleFluentCloudInvites(db, { emailNormalized: normalizedEmail });
  const waitlistEntry = await getWaitlistEntryByEmail(db, normalizedEmail);
  const invite = await getLatestInviteByEmail(db, normalizedEmail);

  if (invite?.state === 'invite_sent' && invite.expiresAt > nowIsoString()) {
    return {
      accountTenantId: null,
      allowed: true,
      denialReason: null,
      invite,
      provisioningSource: {
        acceptedAt: invite.acceptedAt,
        accessSource: 'cloud_invite',
        inviteId: invite.id,
        waitlistEntryId: invite.waitlistEntryId,
      },
      publicState: 'invite_sent',
      source: 'cloud_invite',
      waitlistEntry,
    };
  }

  if (invite?.state === 'invite_expired') {
    return deniedInviteDecision('invite_expired', invite, waitlistEntry);
  }
  if (invite?.state === 'invite_canceled') {
    return deniedInviteDecision('invite_canceled', invite, waitlistEntry);
  }
  if (invite?.state === 'invite_accepted') {
    return {
      accountTenantId: invite.acceptedTenantId,
      allowed: false,
      denialReason: 'duplicate_active_account',
      invite,
      provisioningSource: null,
      publicState: 'account_active',
      source: 'duplicate_active_account',
      waitlistEntry,
    };
  }

  switch (waitlistEntry?.reviewStatus) {
    case 'approved':
      return deniedInviteDecision('waitlist_approved', invite, waitlistEntry);
    case 'declined':
      return deniedInviteDecision('waitlist_declined', invite, waitlistEntry);
    case 'pending_review':
      return deniedInviteDecision('waitlist_pending_review', invite, waitlistEntry);
    default:
      return deniedInviteDecision('waitlist_pending_review', invite, waitlistEntry);
  }
}

export async function deleteFluentCloudPendingAccount(
  db: FluentDatabase,
  input: FluentCloudDeletePendingAccountInput,
): Promise<FluentCloudDeletePendingAccountResult> {
  const tenant = await db
    .prepare(
      `SELECT id, status, metadata_json
       FROM fluent_tenants
       WHERE id = ?`,
    )
    .bind(input.tenantId)
    .first<{
      id: string;
      metadata_json: string | null;
      status: string;
    }>();

  if (!tenant) {
    throw new Error(`Unknown Fluent tenant ${input.tenantId}.`);
  }
  if (tenant.status === 'active') {
    throw new Error(`Tenant ${input.tenantId} is already active and cannot be deleted through the early-access cleanup path.`);
  }

  const metadata = asRecord(safeParse(tenant.metadata_json));
  const cloudAccess = asRecord(metadata?.cloudAccess);
  const inviteId = typeof cloudAccess?.inviteId === 'string' ? cloudAccess.inviteId : null;
  const waitlistEntryId = typeof cloudAccess?.waitlistEntryId === 'string' ? cloudAccess.waitlistEntryId : null;
  const actor = normalizeActor(input.actor);
  const now = toIsoString(input.now) ?? nowIsoString();
  const reason = normalizeNullableText(input.reason) ?? 'account_deleted_before_activation';

  await db
    .prepare('DELETE FROM fluent_tenants WHERE id = ?')
    .bind(input.tenantId)
    .run();

  if (inviteId) {
    await db
      .prepare(
        `UPDATE fluent_cloud_invites
         SET state = 'invite_canceled',
             canceled_at = ?,
             cancel_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(now, reason, inviteId)
      .run();
  }

  if (waitlistEntryId) {
    await db
      .prepare(
        `UPDATE fluent_cloud_waitlist_entries
         SET public_state = 'waitlist_approved',
             accepted_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(waitlistEntryId)
      .run();
  }

  await recordFluentCloudAuditEvent(db, {
    actor,
    details: {
      reason,
    },
    eventType: 'account.deleted_before_activation',
    inviteId,
    tenantId: input.tenantId,
    waitlistEntryId,
  });

  return {
    deleted: true,
    previousStatus: tenant.status,
    tenantId: input.tenantId,
  };
}

export async function markFluentCloudAccountOnboarding(
  db: FluentDatabase,
  input: { actor?: FluentCloudInviteActor; tenantId: string; waitlistEntryId?: string | null },
): Promise<void> {
  if (input.waitlistEntryId) {
    await db
      .prepare(
        `UPDATE fluent_cloud_waitlist_entries
         SET public_state = 'account_onboarding',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(input.waitlistEntryId)
      .run();
  }

  await recordFluentCloudAuditEvent(db, {
    actor: normalizeActor(input.actor),
    eventType: 'account.onboarding_started',
    tenantId: input.tenantId,
    waitlistEntryId: normalizeNullableText(input.waitlistEntryId),
  });
}

export async function markFluentCloudAccountActive(
  db: FluentDatabase,
  input: { actor?: FluentCloudInviteActor; tenantId: string; waitlistEntryId?: string | null },
): Promise<void> {
  if (input.waitlistEntryId) {
    await db
      .prepare(
        `UPDATE fluent_cloud_waitlist_entries
         SET public_state = 'account_active',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(input.waitlistEntryId)
      .run();
  }

  await recordFluentCloudAuditEvent(db, {
    actor: normalizeActor(input.actor),
    eventType: 'account.activated',
    tenantId: input.tenantId,
    waitlistEntryId: normalizeNullableText(input.waitlistEntryId),
  });
}

function deniedInviteDecision(
  denialReason: HostedCloudAccessDecision['denialReason'],
  invite: FluentCloudInviteRecord | null,
  waitlistEntry: FluentCloudWaitlistEntryRecord | null,
): HostedCloudAccessDecision {
  return {
    accountTenantId: invite?.acceptedTenantId ?? null,
    allowed: false,
    denialReason,
    invite,
    provisioningSource: null,
    publicState: denialReason === 'duplicate_active_account' ? 'account_active' : denialReason ?? 'waitlist_pending_review',
    source: null,
    waitlistEntry,
  };
}

async function upsertApprovedWaitlistEntry(
  db: FluentDatabase,
  input: FluentCloudApprovedWaitlistEntryInput,
  now: string,
): Promise<FluentCloudWaitlistEntryRecord> {
  const email = normalizeRequiredEmail(input.email);
  const existing = await getWaitlistEntryByEmail(db, email);
  const sourceSystem = normalizeNullableText(input.sourceSystem) ?? 'meetfluent-landing';
  const sourceEntryId = normalizeNullableText(input.sourceEntryId);
  const metadata = input.metadata ?? existing?.metadata ?? null;
  const reviewedAt = toIsoString(input.reviewedAt) ?? now;

  if (existing) {
    await db
      .prepare(
        `UPDATE fluent_cloud_waitlist_entries
         SET email = ?,
             review_status = 'approved',
             public_state = CASE
               WHEN public_state IN ('invite_sent', 'invite_accepted', 'account_onboarding', 'account_active') THEN public_state
               ELSE 'waitlist_approved'
             END,
             reviewed_at = ?,
             source_system = ?,
             source_entry_id = COALESCE(?, source_entry_id),
             metadata_json = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(input.email.trim(), reviewedAt, sourceSystem, sourceEntryId, stringifyJson(metadata), existing.id)
      .run();

    return getWaitlistEntryById(db, existing.id);
  }

  const id = `waitlist:${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO fluent_cloud_waitlist_entries (
        id, email, email_normalized, review_status, public_state, reviewed_at, source_system, source_entry_id, metadata_json
      ) VALUES (?, ?, ?, 'approved', 'waitlist_approved', ?, ?, ?, ?)`,
    )
    .bind(id, input.email.trim(), email, reviewedAt, sourceSystem, sourceEntryId, stringifyJson(metadata))
    .run();

  await recordFluentCloudAuditEvent(db, {
    actor: SYSTEM_ACTOR,
    details: {
      sourceEntryId,
      sourceSystem,
    },
    emailNormalized: email,
    eventType: 'waitlist.reviewed_approved',
    waitlistEntryId: id,
  });

  return getWaitlistEntryById(db, id);
}

async function findMembershipByUserId(
  db: FluentDatabase,
  userId: string,
): Promise<{ profileId: string; tenantId: string } | null> {
  const row = await db
    .prepare(
      `SELECT tenant_id, profile_id
       FROM fluent_user_memberships
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .bind(userId)
    .first<{ profile_id: string; tenant_id: string }>();

  if (!row) {
    return null;
  }

  return {
    profileId: row.profile_id,
    tenantId: row.tenant_id,
  };
}

async function findActiveCloudAccountByEmail(
  db: FluentDatabase,
  emailNormalized: string,
): Promise<{ tenantId: string; userId: string } | null> {
  const row = await db
    .prepare(
      `SELECT memberships.tenant_id, memberships.user_id
       FROM fluent_user_memberships AS memberships
       INNER JOIN fluent_user_identities AS identities
         ON identities.id = memberships.user_id
       WHERE memberships.status = 'active'
         AND identities.email_normalized = ?
       ORDER BY memberships.created_at ASC
       LIMIT 1`,
    )
    .bind(emailNormalized)
    .first<{ tenant_id: string; user_id: string }>();

  if (!row) {
    return null;
  }

  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
  };
}

async function getWaitlistEntryByEmail(
  db: FluentDatabase,
  emailNormalized: string,
): Promise<FluentCloudWaitlistEntryRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, email, email_normalized, review_status, public_state, source_system, source_entry_id,
              reviewed_at, invited_at, accepted_at, canceled_at, last_invite_id, metadata_json, created_at, updated_at
       FROM fluent_cloud_waitlist_entries
       WHERE email_normalized = ?
       LIMIT 1`,
    )
    .bind(emailNormalized)
    .first<CloudWaitlistEntryRow>();
  return row ? mapWaitlistEntry(row) : null;
}

async function getWaitlistEntryById(
  db: FluentDatabase,
  id: string,
): Promise<FluentCloudWaitlistEntryRecord> {
  const row = await db
    .prepare(
      `SELECT id, email, email_normalized, review_status, public_state, source_system, source_entry_id,
              reviewed_at, invited_at, accepted_at, canceled_at, last_invite_id, metadata_json, created_at, updated_at
       FROM fluent_cloud_waitlist_entries
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<CloudWaitlistEntryRow>();

  if (!row) {
    throw new Error(`Unknown waitlist entry ${id}.`);
  }
  return mapWaitlistEntry(row);
}

async function getInviteById(db: FluentDatabase, id: string): Promise<FluentCloudInviteRecord> {
  const row = await db
    .prepare(
      `SELECT id, waitlist_entry_id, email_normalized, state, send_count, expires_at, last_sent_at, accepted_at,
              accepted_user_id, accepted_tenant_id, canceled_at, cancel_reason, metadata_json, created_at, updated_at
       FROM fluent_cloud_invites
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<CloudInviteRow>();

  if (!row) {
    throw new Error(`Unknown invite ${id}.`);
  }
  return mapInvite(row);
}

async function getLatestInviteByEmail(
  db: FluentDatabase,
  emailNormalized: string,
): Promise<FluentCloudInviteRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, waitlist_entry_id, email_normalized, state, send_count, expires_at, last_sent_at, accepted_at,
              accepted_user_id, accepted_tenant_id, canceled_at, cancel_reason, metadata_json, created_at, updated_at
       FROM fluent_cloud_invites
       WHERE email_normalized = ?
       ORDER BY last_sent_at DESC, created_at DESC
       LIMIT 1`,
    )
    .bind(emailNormalized)
    .first<CloudInviteRow>();
  return row ? mapInvite(row) : null;
}

async function listExpirableInvites(
  db: FluentDatabase,
  emailNormalized: string | null,
  now: string,
): Promise<FluentCloudInviteRecord[]> {
  const statement =
    emailNormalized == null
      ? db.prepare(
          `SELECT id, waitlist_entry_id, email_normalized, state, send_count, expires_at, last_sent_at, accepted_at,
                  accepted_user_id, accepted_tenant_id, canceled_at, cancel_reason, metadata_json, created_at, updated_at
           FROM fluent_cloud_invites
           WHERE state = 'invite_sent' AND expires_at <= ?`,
        )
      : db.prepare(
          `SELECT id, waitlist_entry_id, email_normalized, state, send_count, expires_at, last_sent_at, accepted_at,
                  accepted_user_id, accepted_tenant_id, canceled_at, cancel_reason, metadata_json, created_at, updated_at
           FROM fluent_cloud_invites
           WHERE state = 'invite_sent' AND email_normalized = ? AND expires_at <= ?`,
        );
  const result =
    emailNormalized == null
      ? await statement.bind(now).all<CloudInviteRow>()
      : await statement.bind(emailNormalized, now).all<CloudInviteRow>();
  return (result.results ?? []).map(mapInvite);
}

async function recordFluentCloudAuditEvent(
  db: FluentDatabase,
  input: {
    actor: FluentCloudInviteActor;
    details?: unknown;
    emailNormalized?: string | null;
    eventType: string;
    inviteId?: string | null;
    tenantId?: string | null;
    userId?: string | null;
    waitlistEntryId?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fluent_cloud_access_audit_log (
        id, waitlist_entry_id, invite_id, tenant_id, user_id, email_normalized, event_type,
        actor_type, actor_id, actor_email, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `cloud-audit:${crypto.randomUUID()}`,
      normalizeNullableText(input.waitlistEntryId),
      normalizeNullableText(input.inviteId),
      normalizeNullableText(input.tenantId),
      normalizeNullableText(input.userId),
      normalizeNullableText(input.emailNormalized),
      input.eventType,
      input.actor.actorType,
      normalizeNullableText(input.actor.actorId),
      normalizeNullableText(input.actor.actorEmail),
      stringifyJson(input.details),
    )
    .run();
}

function createSyntheticInvite(waitlistEntryId: string, emailNormalized: string, now: string): FluentCloudInviteRecord {
  return {
    acceptedAt: null,
    acceptedTenantId: null,
    acceptedUserId: null,
    canceledAt: null,
    cancelReason: null,
    createdAt: now,
    emailNormalized,
    expiresAt: now,
    id: `synthetic:${waitlistEntryId}`,
    lastSentAt: now,
    metadata: null,
    sendCount: 0,
    state: 'invite_canceled',
    updatedAt: now,
    waitlistEntryId,
  };
}

function mapWaitlistEntry(row: CloudWaitlistEntryRow): FluentCloudWaitlistEntryRecord {
  return {
    acceptedAt: row.accepted_at,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    email: row.email,
    emailNormalized: row.email_normalized,
    id: row.id,
    invitedAt: row.invited_at,
    lastInviteId: row.last_invite_id,
    metadata: safeParse(row.metadata_json),
    publicState: normalizePublicState(row.public_state),
    reviewStatus: normalizeReviewStatus(row.review_status),
    reviewedAt: row.reviewed_at,
    sourceEntryId: row.source_entry_id,
    sourceSystem: normalizeNullableText(row.source_system) ?? 'meetfluent-landing',
    updatedAt: row.updated_at,
  };
}

function mapInvite(row: CloudInviteRow): FluentCloudInviteRecord {
  return {
    acceptedAt: row.accepted_at,
    acceptedTenantId: row.accepted_tenant_id,
    acceptedUserId: row.accepted_user_id,
    canceledAt: row.canceled_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    emailNormalized: row.email_normalized,
    expiresAt: row.expires_at,
    id: row.id,
    lastSentAt: row.last_sent_at,
    metadata: safeParse(row.metadata_json),
    sendCount: asNumber(row.send_count),
    state: normalizeInviteState(row.state),
    updatedAt: row.updated_at,
    waitlistEntryId: row.waitlist_entry_id,
  };
}

function normalizeActor(actor: FluentCloudInviteActor | undefined): FluentCloudInviteActor {
  return actor ?? SYSTEM_ACTOR;
}

function normalizeInviteState(value: string | null | undefined): FluentCloudInviteState {
  switch (value) {
    case 'invite_accepted':
    case 'invite_canceled':
    case 'invite_expired':
    case 'invite_sent':
      return value;
    default:
      return 'invite_sent';
  }
}

function normalizePublicState(value: string | null | undefined): FluentCloudPublicLifecycleState {
  switch (value) {
    case 'waitlist_pending_review':
    case 'waitlist_approved':
    case 'waitlist_declined':
    case 'invite_sent':
    case 'invite_expired':
    case 'invite_canceled':
    case 'invite_accepted':
    case 'account_onboarding':
    case 'account_active':
      return value;
    default:
      return 'waitlist_pending_review';
  }
}

function normalizeReviewStatus(value: string | null | undefined): FluentCloudReviewStatus {
  switch (value) {
    case 'approved':
    case 'declined':
    case 'pending_review':
      return value;
    default:
      return 'pending_review';
  }
}

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  const normalized = normalizeNullableText(value)?.toLowerCase() ?? null;
  return normalized && normalized.includes('@') ? normalized : null;
}

function normalizeRequiredEmail(value: string | null | undefined): string {
  const normalized = normalizeOptionalEmail(value);
  if (!normalized) {
    throw new Error('A valid email address is required for Fluent Cloud invites.');
  }
  return normalized;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveInviteExpiry(now: string, explicit: Date | string | null | undefined, ttlDays = FLUENT_CLOUD_INVITE_TTL_DAYS): string {
  if (explicit) {
    const resolved = toIsoString(explicit);
    if (resolved) {
      return resolved;
    }
  }
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + ttlDays);
  return expiresAt.toISOString();
}

function safeParse(value: string | null): unknown {
  if (!value) {
    return null;
  }

  let current: unknown = value;
  for (let depth = 0; depth < 2; depth += 1) {
    if (typeof current !== 'string') {
      break;
    }
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }

  return current;
}

function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function mergeMetadata(current: unknown, patch: unknown): unknown {
  const currentRecord = asRecord(current);
  const patchRecord = asRecord(patch);
  if (currentRecord && patchRecord) {
    return {
      ...currentRecord,
      ...patchRecord,
    };
  }
  return patch === undefined ? current : patch;
}

function asNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function nowIsoString(): string {
  return new Date().toISOString();
}

type CloudWaitlistEntryRow = {
  accepted_at: string | null;
  canceled_at: string | null;
  created_at: string;
  email: string;
  email_normalized: string;
  id: string;
  invited_at: string | null;
  last_invite_id: string | null;
  metadata_json: string | null;
  public_state: string;
  review_status: string;
  reviewed_at: string | null;
  source_entry_id: string | null;
  source_system: string | null;
  updated_at: string;
};

type CloudInviteRow = {
  accepted_at: string | null;
  accepted_tenant_id: string | null;
  accepted_user_id: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  email_normalized: string;
  expires_at: string;
  id: string;
  last_sent_at: string;
  metadata_json: string | null;
  send_count: number | string | null;
  state: string;
  updated_at: string;
  waitlist_entry_id: string;
};

const SYSTEM_ACTOR: FluentCloudInviteActor = {
  actorType: 'system',
};
