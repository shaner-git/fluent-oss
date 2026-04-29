import { FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION } from './contract';
import {
  evaluateHostedCloudInviteAccess,
  type HostedCloudProvisioningSource,
} from './cloud-invites';
import {
  type FluentCloudAccessFailureCode,
  evaluateFluentCloudAccess,
} from './cloud-early-access';
import { getFluentCloudOnboardingRecord } from './cloud-onboarding';
import { evaluateSubscriptionLifecycle, type FluentSubscriptionLifecycleAccess } from './subscription-lifecycle';
import { parseAllowedEmails, type CloudRuntimeEnv } from './config';
import type { FluentDatabase } from './storage';

type HostedAccessInput = {
  email?: string | null;
  userId?: string | null;
};

type HostedAccessRow = {
  identity_metadata_json?: string | null;
  membership_status?: string | null;
  onboarding_state?: string | null;
  profile_id?: string | null;
  tenant_id?: string | null;
  tenant_metadata_json?: string | null;
  tenant_status?: string | null;
};

type HostedIdentityRow = {
  metadata_json?: string | null;
};

type OAuthClientRow = {
  clientId?: string | null;
  clientName?: string | null;
  disabled?: number | null;
  metadata?: string | null;
};

export type HostedCloudAccessDecision = {
  allowed: boolean;
  code: FluentCloudAccessFailureCode | null;
  lifecycleAccessMode: FluentSubscriptionLifecycleAccess | null;
  lifecycleMessage: string | null;
  needsProvisioning: boolean;
  profileId: string | null;
  provisioningSource: HostedCloudProvisioningSource | null;
  tenantId: string | null;
};

export type HostedCloudClientDecision = {
  clientName: string | null;
  code: FluentCloudAccessFailureCode | null;
  contractVersion: string | null;
};

export async function resolveHostedCloudAccess(
  db: FluentDatabase,
  env: Pick<
    CloudRuntimeEnv,
    'ALLOW_ALL_CLOUD_EMAILS_FOR_DEV' | 'ALLOWED_EMAIL' | 'ALLOWED_EMAILS' | 'FLUENT_CLOUD_ACCESS_MODE' | 'FLUENT_CLOUD_ENVIRONMENT'
  >,
  input: HostedAccessInput,
): Promise<HostedCloudAccessDecision> {
  const email = input.email?.trim().toLowerCase() || null;
  const allowlist = evaluateFluentCloudAccess({
    accessMode: env.FLUENT_CLOUD_ACCESS_MODE,
    allowAllCloudEmailsForDev: env.ALLOW_ALL_CLOUD_EMAILS_FOR_DEV,
    allowedEmails: parseAllowedEmails(env as CloudRuntimeEnv),
    deploymentEnvironment: env.FLUENT_CLOUD_ENVIRONMENT,
    email,
  });
  const onboardingRecord = await getFluentCloudOnboardingRecord(db, {
    email,
    userId: input.userId ?? null,
  });
  const membership = input.userId ? await lookupHostedMembership(db, input.userId) : null;
  const identity = !membership && email ? await lookupHostedIdentityByEmail(db, email) : null;
  const identityState = normalizeHostedCloudLifecycleState(
    readMetadataValue(membership?.identity_metadata_json ?? identity?.metadata_json ?? null, [
      'cloudAccessState',
      'fluentCloudAccessState',
      'fluent.cloudAccessState',
      'accessState',
    ]),
  );
  const membershipState = normalizeHostedCloudLifecycleState(membership?.membership_status);
  const tenantState = normalizeHostedCloudLifecycleState(
    membership?.tenant_status ??
      readMetadataValue(membership?.tenant_metadata_json ?? null, ['cloudAccessState', 'fluentCloudAccessState', 'fluent.cloudAccessState']),
  );

  if (onboardingRecord?.currentState === 'deleted') {
    return deny('account_deleted', membership, onboardingRecord);
  }
  if (onboardingRecord?.currentState === 'suspended' || onboardingRecord?.currentState === 'deletion_requested') {
    return deny('account_disabled', membership, onboardingRecord);
  }
  if (membershipState === 'account_deleted' || tenantState === 'account_deleted' || identityState === 'account_deleted') {
    return deny('account_deleted', membership);
  }
  if (membershipState === 'account_disabled' || tenantState === 'account_disabled' || identityState === 'account_disabled') {
    return deny('account_disabled', membership);
  }
  if (allowlist.denialReason === 'missing_allowlist') {
    return deny('temporarily_unavailable', membership);
  }
  if (membership && membershipState === 'active') {
    return {
      allowed: true,
      code: null,
      lifecycleAccessMode: 'full_access',
      lifecycleMessage: null,
      needsProvisioning: false,
      profileId: membership.profile_id ?? null,
      provisioningSource: null,
      tenantId: membership.tenant_id ?? null,
    };
  }

  if (onboardingRecord) {
    const lifecycle = evaluateSubscriptionLifecycle(onboardingRecord);
    if (onboardingRecord.currentState === 'waitlisted') {
      return deny('waitlisted_not_invited', membership, onboardingRecord);
    }
    if (onboardingRecord.currentState === 'invited') {
      return {
        allowed: true,
        code: null,
        lifecycleAccessMode: lifecycle.access,
        lifecycleMessage: lifecycle.message,
        needsProvisioning: true,
        profileId: membership?.profile_id ?? null,
        provisioningSource: {
          accessSource: 'cloud_invite',
        },
        tenantId: membership?.tenant_id ?? onboardingRecord.tenantId,
      };
    }
    return {
      allowed: lifecycle.access !== 'blocked' && lifecycle.access !== 'deleted' && lifecycle.access !== 'suspended' && lifecycle.access !== 'retention_expired',
      code: lifecycle.access === 'deleted' ? 'account_deleted' : lifecycle.access === 'full_access' || lifecycle.access === 'limited_access' ? null : 'account_disabled',
      lifecycleAccessMode: lifecycle.access,
      lifecycleMessage: lifecycle.message,
      needsProvisioning: !membership,
      profileId: membership?.profile_id ?? null,
      provisioningSource: membership
        ? null
        : {
            accessSource: 'cloud_invite',
          },
      tenantId: membership?.tenant_id ?? onboardingRecord.tenantId,
    };
  }

  const inviteDecision = await evaluateHostedCloudInviteAccess(db, {
    accessMode: env.FLUENT_CLOUD_ACCESS_MODE,
    allowAllCloudEmailsForDev: env.ALLOW_ALL_CLOUD_EMAILS_FOR_DEV,
    allowedEmails: parseAllowedEmails(env as CloudRuntimeEnv),
    deploymentEnvironment: env.FLUENT_CLOUD_ENVIRONMENT,
    email,
    userId: input.userId ?? null,
  });
  if (inviteDecision.allowed) {
    return {
      allowed: true,
      code: null,
      lifecycleAccessMode: 'full_access',
      lifecycleMessage: null,
      needsProvisioning: Boolean(inviteDecision.provisioningSource),
      profileId: membership?.profile_id ?? null,
      provisioningSource: inviteDecision.provisioningSource,
      tenantId: membership?.tenant_id ?? inviteDecision.accountTenantId,
    };
  }

  if (allowlist.allowed && allowlist.resolvedMode === 'open_dev') {
    return {
      allowed: true,
      code: null,
      lifecycleAccessMode: 'full_access',
      lifecycleMessage: null,
      needsProvisioning: true,
      profileId: null,
      provisioningSource: {
        accessSource: 'open_dev',
      },
      tenantId: null,
    };
  }

  if (identityState === 'waitlisted_not_invited') {
    return deny('waitlisted_not_invited', membership);
  }
  if (identityState === 'invited_not_onboarded') {
    return {
      allowed: true,
      code: null,
      lifecycleAccessMode: 'full_access',
      lifecycleMessage: null,
      needsProvisioning: true,
      profileId: null,
      provisioningSource: {
        accessSource: 'legacy_allowlist',
      },
      tenantId: null,
    };
  }
  switch (inviteDecision.denialReason) {
    case 'waitlist_approved':
      return deny('waitlisted_not_invited', membership);
    case 'invite_canceled':
    case 'invite_expired':
      return deny('waitlisted_not_invited', membership);
    case 'waitlist_declined':
    case 'duplicate_active_account':
      return deny('not_on_waitlist', membership);
    case 'waitlist_pending_review':
      return inviteDecision.waitlistEntry ? deny('waitlisted_not_invited', membership) : deny('not_on_waitlist', membership);
    default:
      return deny('not_on_waitlist', membership);
  }
}

export async function resolveHostedCloudClientDecision(
  db: FluentDatabase,
  request: Request,
  clientId: string | null | undefined,
): Promise<HostedCloudClientDecision> {
  const normalizedClientId = clientId?.trim() || null;
  const requestedContractVersion = readRequestedContractVersion(request);
  if (!normalizedClientId) {
    return {
      clientName: null,
      code: requestedContractVersion && compareFluentContractVersions(requestedContractVersion, FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION) < 0
        ? 'contract_version_unsupported'
        : null,
      contractVersion: requestedContractVersion,
    };
  }

  const client = await lookupOAuthClient(db, normalizedClientId);
  if (!client?.clientId) {
    return {
      clientName: normalizedClientId,
      code: 'client_unsupported',
      contractVersion: requestedContractVersion,
    };
  }

  const metadataClientStatus = normalizeHostedClientStatus(
    readMetadataValue(client.metadata ?? null, ['clientStatus', 'fluent.clientStatus', 'fluentCloudClientStatus']),
  );
  const metadataContractVersion =
    readMetadataValue(client.metadata ?? null, [
      'contractVersion',
      'fluent.contractVersion',
      'fluentContractVersion',
      'minimumContractVersion',
      'fluent.minimumContractVersion',
    ]) ?? null;
  const contractVersion = requestedContractVersion ?? metadataContractVersion;

  if (Number(client.disabled ?? 0) !== 0 || metadataClientStatus === 'client_unsupported') {
    return {
      clientName: client.clientName?.trim() || normalizedClientId,
      code: 'client_unsupported',
      contractVersion,
    };
  }

  if (contractVersion && compareFluentContractVersions(contractVersion, FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION) < 0) {
    return {
      clientName: client.clientName?.trim() || normalizedClientId,
      code: 'contract_version_unsupported',
      contractVersion,
    };
  }

  return {
    clientName: client.clientName?.trim() || normalizedClientId,
    code: null,
    contractVersion,
  };
}

function deny(
  code: FluentCloudAccessFailureCode,
  row: HostedAccessRow | null,
  onboardingRecord: Parameters<typeof evaluateSubscriptionLifecycle>[0] = null,
): HostedCloudAccessDecision {
  const lifecycle = evaluateSubscriptionLifecycle(onboardingRecord);
  return {
    allowed: false,
    code,
    lifecycleAccessMode: lifecycle.access,
    lifecycleMessage: lifecycle.currentState ? lifecycle.message : null,
    needsProvisioning: false,
    profileId: row?.profile_id ?? null,
    provisioningSource: null,
    tenantId: row?.tenant_id ?? null,
  };
}

async function lookupHostedMembership(db: FluentDatabase, userId: string): Promise<HostedAccessRow | null> {
  return db
    .prepare(
      `SELECT
         m.tenant_id,
         m.profile_id,
         m.status AS membership_status,
         t.status AS tenant_status,
         t.onboarding_state,
         t.metadata_json AS tenant_metadata_json,
         i.metadata_json AS identity_metadata_json
       FROM fluent_user_memberships m
       LEFT JOIN fluent_tenants t ON t.id = m.tenant_id
       LEFT JOIN fluent_user_identities i ON i.id = m.user_id
       WHERE m.user_id = ?
       ORDER BY m.created_at ASC
       LIMIT 1`,
    )
    .bind(userId)
    .first<HostedAccessRow>();
}

async function lookupHostedIdentityByEmail(db: FluentDatabase, email: string): Promise<HostedIdentityRow | null> {
  return db
    .prepare(
      `SELECT metadata_json
       FROM fluent_user_identities
       WHERE email_normalized = ?
       LIMIT 1`,
    )
    .bind(email)
    .first<HostedIdentityRow>();
}

async function lookupOAuthClient(db: FluentDatabase, clientId: string): Promise<OAuthClientRow | null> {
  return db
    .prepare(
      `SELECT clientId, name AS clientName, disabled, metadata
       FROM oauthClient
       WHERE clientId = ?
       LIMIT 1`,
    )
    .bind(clientId)
    .first<OAuthClientRow>();
}

function normalizeHostedCloudLifecycleState(value: string | null | undefined): 'active' | FluentCloudAccessFailureCode | null {
  const normalized = (value ?? '').trim().toLowerCase();
  switch (normalized) {
    case '':
      return null;
    case 'active':
    case 'approved':
    case 'granted':
      return 'active';
    case 'waitlisted':
    case 'waitlist':
    case 'pending':
    case 'pending_invite':
    case 'pending-invite':
    case 'not_invited':
      return 'waitlisted_not_invited';
    case 'invited':
    case 'pending_onboarding':
    case 'pending-onboarding':
    case 'onboarding_required':
    case 'not_onboarded':
      return 'invited_not_onboarded';
    case 'disabled':
    case 'suspended':
      return 'account_disabled';
    case 'deleted':
    case 'removed':
      return 'account_deleted';
    default:
      return null;
  }
}

function normalizeHostedClientStatus(value: string | null | undefined): 'client_unsupported' | null {
  const normalized = (value ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'unsupported':
    case 'retired':
    case 'blocked':
    case 'disabled':
      return 'client_unsupported';
    default:
      return null;
  }
}

function readMetadataValue(source: string | null, keys: string[]): string | null {
  if (!source) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  for (const key of keys) {
    const value = readNestedValue(parsed, key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readNestedValue(source: unknown, keyPath: string): unknown {
  if (!source || typeof source !== 'object') {
    return null;
  }
  let current: unknown = source;
  for (const segment of keyPath.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function readRequestedContractVersion(request: Request): string | null {
  for (const headerName of ['x-fluent-contract-version', 'x-fluent-client-contract-version', 'x-fluent-min-contract-version']) {
    const value = request.headers.get(headerName)?.trim();
    if (value) {
      return value;
    }
  }

  const url = new URL(request.url);
  for (const key of ['fluent_contract_version', 'contract_version']) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function compareFluentContractVersions(left: string, right: string): number {
  const parsedLeft = parseFluentContractVersion(left);
  const parsedRight = parseFluentContractVersion(right);
  if (!parsedLeft || !parsedRight) {
    return left.localeCompare(right);
  }
  return (
    parsedLeft.date.localeCompare(parsedRight.date) ||
    parsedLeft.major - parsedRight.major ||
    parsedLeft.minor - parsedRight.minor
  );
}

function parseFluentContractVersion(value: string): { date: string; major: number; minor: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.fluent-core-v(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    date: match[1],
    major: Number(match[2]),
    minor: Number(match[3]),
  };
}
