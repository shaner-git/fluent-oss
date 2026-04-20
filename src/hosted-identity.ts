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
  profileId: string;
  tenantId: string;
}

export interface HostedIdentityMembership {
  profileId: string;
  tenantId: string;
}

export async function ensureHostedUserProvisioned(
  db: FluentDatabase,
  user: HostedAuthUser,
): Promise<HostedProvisioningResult> {
  const existing = await getHostedUserMembership(db, user.id);

  if (existing) {
    await syncHostedIdentityRecord(db, user, existing.tenantId, existing.profileId);
    return {
      created: false,
      profileId: existing.profileId,
      tenantId: existing.tenantId,
    };
  }

  const tenantId = `tenant:better-auth:${user.id}`;
  const profileId = DEFAULT_PROFILE_ID;
  const displayName = normalizeDisplayName(user.name, user.email);
  const email = normalizeNullableText(user.email);
  const metadataJson = JSON.stringify({
    authProvider: 'better-auth',
    seedSource: 'hosted-auth-bootstrap',
    userId: user.id,
  });

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO fluent_tenants (
          id, slug, display_name, backend_mode, status, onboarding_state, onboarding_version, metadata_json
        ) VALUES (?, ?, ?, 'hosted', 'active', 'not_started', '1', ?)`,
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
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(user.id, tenantId, profileId),
  ]);

  return {
    created: true,
    profileId,
    tenantId,
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
