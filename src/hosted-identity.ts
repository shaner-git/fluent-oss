import {
  acceptFluentCloudInviteForHostedUser,
  type HostedCloudProvisioningSource,
  markFluentCloudAccountOnboarding,
} from './cloud-invites';
import { markFluentCloudAccountCreated, markFluentCloudInviteAccepted } from './cloud-onboarding';
import type { FluentDatabase } from './storage';

const DEFAULT_PROFILE_ID = 'owner';

const DEFAULT_DOMAINS = [
  {
    displayName: 'Meals',
    domainId: 'meals',
    lifecycleState: 'available',
    metadata: { skill: 'fluent-meals' },
  },
  {
    displayName: 'Style',
    domainId: 'style',
    lifecycleState: 'available',
    metadata: { skill: 'fluent-style' },
  },
  {
    displayName: 'Health',
    domainId: 'health',
    lifecycleState: 'available',
    metadata: { skill: 'fluent-health' },
  },
] as const;

export interface HostedAuthUser {
  email: string | null;
  id: string;
  name?: string | null;
}

export interface HostedProvisioningResult {
  created: boolean;
  inviteId: string | null;
  profileId: string;
  tenantId: string;
  waitlistEntryId: string | null;
}

export interface HostedIdentityMembership {
  profileId: string;
  tenantId: string;
}

export async function ensureHostedUserProvisioned(
  db: FluentDatabase,
  user: HostedAuthUser,
  options: {
    cloudAccess?: HostedCloudProvisioningSource | null;
  } = {},
): Promise<HostedProvisioningResult> {
  const existing = await getHostedUserMembership(db, user.id);

  if (existing) {
    await syncHostedIdentityRecord(db, user, existing.tenantId, existing.profileId);
    await markFluentCloudAccountCreated(db, {
      email: user.email ?? null,
      metadata: {
        accessSource: options.cloudAccess?.accessSource ?? 'existing_membership',
      },
      note: 'Hosted provisioning reused an existing active membership.',
      tenantId: existing.tenantId,
      userId: user.id,
    });
    return {
      created: false,
      inviteId: null,
      profileId: existing.profileId,
      tenantId: existing.tenantId,
      waitlistEntryId: null,
    };
  }

  if (!options.cloudAccess) {
    throw new Error('Hosted user provisioning requires a prior Fluent Cloud access decision.');
  }

  const inviteAcceptance =
    options.cloudAccess?.accessSource === 'cloud_invite'
      ? await acceptFluentCloudInviteForHostedUser(db, {
          email: user.email ?? null,
          id: user.id,
        })
      : null;
  if (inviteAcceptance) {
    await markFluentCloudInviteAccepted(db, {
      email: user.email ?? null,
      metadata: {
        inviteId: inviteAcceptance.invite.id,
        waitlistEntryId: inviteAcceptance.waitlistEntry.id,
      },
      tenantId: `tenant:better-auth:${user.id}`,
      userId: user.id,
    });
  }
  const tenantId = `tenant:better-auth:${user.id}`;
  const profileId = DEFAULT_PROFILE_ID;
  const displayName = normalizeDisplayName(user.name, user.email);
  const email = normalizeNullableText(user.email);
  const cloudAccessMetadata = {
    accessSource: options.cloudAccess?.accessSource ?? 'hosted_auth_bootstrap',
    ...(inviteAcceptance
      ? {
          inviteAcceptedAt: inviteAcceptance.invite.acceptedAt,
          inviteId: inviteAcceptance.invite.id,
          publicState: 'account_onboarding',
          waitlistEntryId: inviteAcceptance.waitlistEntry.id,
        }
      : {}),
  };
  const metadataJson = JSON.stringify({
    authProvider: 'better-auth',
    cloudAccess: cloudAccessMetadata,
    seedSource: 'hosted-auth-bootstrap',
    userId: user.id,
  });

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO fluent_tenants (
          id, slug, display_name, backend_mode, status, onboarding_state, onboarding_version, metadata_json
        ) VALUES (?, ?, ?, 'hosted', 'onboarding', 'not_started', '1', ?)`,
      )
      .bind(tenantId, buildTenantSlug(user), displayName, metadataJson),
    db
      .prepare(
        `INSERT OR IGNORE INTO fluent_profile (
          tenant_id, profile_id, display_name, timezone, metadata_json
        ) VALUES (?, ?, ?, 'America/Toronto', ?)`,
      )
      .bind(
        tenantId,
        profileId,
        displayName,
        JSON.stringify({
          authProvider: 'better-auth',
          cloudAccess: cloudAccessMetadata,
          email,
          seededBy: 'hosted-auth-bootstrap',
        }),
      ),
    ...DEFAULT_DOMAINS.map((domain) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO fluent_domains (
            tenant_id, domain_id, display_name, lifecycle_state, onboarding_state, onboarding_version, metadata_json
          ) VALUES (?, ?, ?, ?, 'not_started', '1', ?)`,
        )
        .bind(tenantId, domain.domainId, domain.displayName, domain.lifecycleState, JSON.stringify(domain.metadata)),
    ),
    db
      .prepare(
        `INSERT INTO fluent_user_identities (
          id, auth_provider, email, email_normalized, display_name, metadata_json
        ) VALUES (?, 'better-auth', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          email_normalized = excluded.email_normalized,
          display_name = excluded.display_name,
          metadata_json = excluded.metadata_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        user.id,
        email,
        email?.toLowerCase() ?? null,
        displayName,
        JSON.stringify({
          authProvider: 'better-auth',
          cloudAccess: cloudAccessMetadata,
          seedSource: 'hosted-auth-bootstrap',
        }),
      ),
    db
      .prepare(
        `INSERT INTO fluent_user_memberships (
          user_id, tenant_id, profile_id, role, status
        ) VALUES (?, ?, ?, 'owner', 'active')
        ON CONFLICT(user_id, tenant_id, profile_id) DO UPDATE SET
          role = excluded.role,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(user.id, tenantId, profileId),
  ]);

  if (inviteAcceptance) {
    await db
      .prepare(
        `UPDATE fluent_cloud_invites
         SET accepted_tenant_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(tenantId, inviteAcceptance.invite.id)
      .run();
    await markFluentCloudAccountOnboarding(db, {
      tenantId,
      waitlistEntryId: inviteAcceptance.waitlistEntry.id,
    });
  }
  await markFluentCloudAccountCreated(db, {
    email: user.email ?? null,
    metadata: {
      accessSource: options.cloudAccess?.accessSource ?? 'hosted_auth_bootstrap',
      inviteId: inviteAcceptance?.invite.id ?? null,
      waitlistEntryId: inviteAcceptance?.waitlistEntry.id ?? null,
    },
    note: 'Hosted tenant and profile provisioned.',
    tenantId,
    userId: user.id,
  });

  return {
    created: true,
    inviteId: inviteAcceptance?.invite.id ?? null,
    profileId,
    tenantId,
    waitlistEntryId: inviteAcceptance?.waitlistEntry.id ?? null,
  };
}

export async function getHostedUserMembership(
  db: FluentDatabase,
  userId: string,
): Promise<HostedIdentityMembership | null> {
  const existing = await db
    .prepare(
      `SELECT tenant_id, profile_id
       FROM fluent_user_memberships
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .bind(userId)
    .first<{ tenant_id: string; profile_id: string }>();

  if (!existing) {
    return null;
  }

  return {
    profileId: existing.profile_id,
    tenantId: existing.tenant_id,
  };
}

async function syncHostedIdentityRecord(
  db: FluentDatabase,
  user: HostedAuthUser,
  tenantId: string,
  profileId: string,
): Promise<void> {
  const displayName = normalizeDisplayName(user.name, user.email);
  const email = normalizeNullableText(user.email);

  await db.batch([
    db
      .prepare(
        `UPDATE fluent_user_identities
         SET email = ?, email_normalized = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(email, email?.toLowerCase() ?? null, displayName, user.id),
    db
      .prepare(
        `UPDATE fluent_profile
         SET display_name = COALESCE(?, display_name), updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(displayName, tenantId, profileId),
  ]);
}

function buildTenantSlug(user: HostedAuthUser): string {
  const base = slugify(user.email?.split('@')[0] ?? user.name ?? 'fluent-user');
  const suffix = simpleHash(user.id).slice(0, 8);
  return `${base || 'fluent-user'}-${suffix}`;
}

function normalizeDisplayName(name: string | null | undefined, email: string | null): string {
  return normalizeNullableText(name) ?? normalizeNullableText(email?.split('@')[0]) ?? 'Fluent User';
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (const codePoint of value) {
    hash ^= codePoint.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
}
