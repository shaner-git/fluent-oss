import type { CoreRuntimeBindings } from './config';
import type { FluentPreparedStatement } from './storage';

export const TENANT_SCOPED_TABLES = [
  'health_block_reviews',
  'health_block_sessions',
  'health_block_state',
  'health_body_metrics',
  'health_training_blocks',
  'health_goals',
  'health_preferences',
  'health_training_plan_entries',
  'health_training_plans',
  'health_weekly_reviews',
  'health_workout_logs',
  'budget_spend_events',
  'budget_envelopes',
  'meal_confirmed_order_syncs',
  'meal_feedback',
  'meal_grocery_plan_actions',
  'meal_plan_generations',
  'meal_grocery_plans',
  'grocery_intents',
  'meal_grocery_runs',
  'meal_inventory_items',
  'meal_memory',
  'meal_recipes',
  'meal_plan_entries',
  'meal_plans',
  'meal_plan_reviews',
  'meal_preferences',
  'meal_brand_preferences',
  'style_import_runs',
  'style_item_photos',
  'style_item_profiles',
  'style_item_provenance',
  'style_items',
  'style_profile',
  'person_facts',
  'person_consent_events',
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

export interface AccountPurgeSubject {
  email?: string | null;
  emailNormalized?: string | null;
  profileId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}

export type AccountPurgeBindings = Pick<CoreRuntimeBindings, 'artifacts' | 'db'>;

export async function purgeCloudAccountData(
  bindings: AccountPurgeBindings,
  subject: AccountPurgeSubject,
): Promise<void> {
  const userId = normalizeNullableText(subject.userId);
  const tenantId = normalizeNullableText(subject.tenantId);
  const email = normalizeNullableText(subject.email);
  const emailNormalized = normalizeNullableText(subject.emailNormalized) ?? email?.toLowerCase() ?? null;
  const domainEventActorEmail = email ?? emailNormalized;

  const r2Keys = await collectArtifactR2Keys(bindings, { tenantId, userId });
  if (r2Keys.length > 0 && !bindings.artifacts.delete) {
    throw new Error('Account purge cannot remove owned artifact objects because blob deletion is unavailable.');
  }
  for (const key of r2Keys) {
    await bindings.artifacts.delete!(key);
  }

  const statements = [
    tenantId
      ? bindings.db
          .prepare(
            `DELETE FROM artifacts
             WHERE tenant_id = ?
                OR (tenant_id IS NULL AND id IN (
               SELECT artifact_id FROM style_item_photos WHERE tenant_id = ? AND artifact_id IS NOT NULL
             ))`,
          )
          .bind(tenantId, tenantId)
      : null,
    hasExportSubject(userId, tenantId)
      ? bindings.db
          .prepare(
            `DELETE FROM artifacts
             WHERE EXISTS (
               SELECT 1
               FROM fluent_data_exports
               WHERE ((? IS NOT NULL AND user_id = ?) OR (? IS NOT NULL AND tenant_id = ?))
                 AND (artifacts.tenant_id IS NULL OR artifacts.tenant_id = fluent_data_exports.tenant_id)
                 AND (
                   artifacts.id = fluent_data_exports.artifact_id
                   OR (artifacts.entity_type = 'fluent_data_export' AND artifacts.entity_id = fluent_data_exports.id)
                   OR artifacts.r2_key = fluent_data_exports.artifact_r2_key
                 )
             )`,
          )
          .bind(userId, userId, tenantId, tenantId)
      : null,
    hasExportSubject(userId, tenantId)
      ? bindings.db
          .prepare(
            `DELETE FROM fluent_data_export_audit_log
             WHERE (? IS NOT NULL AND user_id = ?)
                OR export_id IN (
                  SELECT id
                  FROM fluent_data_exports
                  WHERE ((? IS NOT NULL AND user_id = ?) OR (? IS NOT NULL AND tenant_id = ?))
                )`,
          )
          .bind(userId, userId, userId, userId, tenantId, tenantId)
      : null,
    hasExportSubject(userId, tenantId)
      ? bindings.db
          .prepare(
            `DELETE FROM fluent_data_exports
             WHERE (? IS NOT NULL AND user_id = ?)
                OR (? IS NOT NULL AND tenant_id = ?)`,
          )
          .bind(userId, userId, tenantId, tenantId)
      : null,
    ...TENANT_SCOPED_TABLES.map((table) =>
      tenantId ? bindings.db.prepare(`DELETE FROM ${table} WHERE tenant_id = ?`).bind(tenantId) : null,
    ),
    tenantId ? bindings.db.prepare('DELETE FROM fluent_domains WHERE tenant_id = ?').bind(tenantId) : null,
    tenantId ? bindings.db.prepare('DELETE FROM fluent_profile WHERE tenant_id = ?').bind(tenantId) : null,
    tenantId ? bindings.db.prepare('DELETE FROM fluent_tenants WHERE id = ?').bind(tenantId) : null,
    domainEventActorEmail || tenantId
      ? bindings.db
          .prepare(
            `DELETE FROM domain_events
             WHERE entity_type <> 'fluent_account_deletion_request'
               AND ((? IS NOT NULL AND actor_email = ?) OR (? IS NOT NULL AND entity_id = ?))`,
          )
          .bind(domainEventActorEmail, domainEventActorEmail, tenantId, tenantId)
      : null,
    userId ? bindings.db.prepare('DELETE FROM oauthAccessToken WHERE userId = ?').bind(userId) : null,
    userId ? bindings.db.prepare('DELETE FROM session WHERE userId = ?').bind(userId) : null,
    userId ? bindings.db.prepare('DELETE FROM account WHERE userId = ?').bind(userId) : null,
    emailNormalized ? bindings.db.prepare('DELETE FROM verification WHERE identifier = ?').bind(emailNormalized) : null,
    userId ? bindings.db.prepare('DELETE FROM fluent_user_memberships WHERE user_id = ?').bind(userId) : null,
    userId ? bindings.db.prepare('DELETE FROM fluent_user_identities WHERE id = ?').bind(userId) : null,
    userId ? bindings.db.prepare('DELETE FROM "user" WHERE id = ?').bind(userId) : null,
    emailNormalized || userId
      ? bindings.db
          .prepare('DELETE FROM fluent_cloud_access_audit_log WHERE email_normalized = ? OR user_id = ?')
          .bind(emailNormalized, userId)
      : null,
    emailNormalized || userId
      ? bindings.db
          .prepare('DELETE FROM fluent_cloud_onboarding_events WHERE email_normalized = ? OR user_id = ?')
          .bind(emailNormalized, userId)
      : null,
    emailNormalized || userId
      ? bindings.db
          .prepare('DELETE FROM fluent_cloud_onboarding WHERE email_normalized = ? OR user_id = ?')
          .bind(emailNormalized, userId)
      : null,
    emailNormalized ? bindings.db.prepare('DELETE FROM fluent_cloud_invites WHERE email_normalized = ?').bind(emailNormalized) : null,
    emailNormalized
      ? bindings.db.prepare('DELETE FROM fluent_cloud_waitlist_entries WHERE email_normalized = ?').bind(emailNormalized)
      : null,
    hasEntitlementSubject(userId, tenantId, emailNormalized)
      ? bindings.db
          .prepare(
            `DELETE FROM fluent_entitlements
             WHERE (? IS NOT NULL AND user_id = ?)
                OR (? IS NOT NULL AND tenant_id = ?)
                OR (? IS NOT NULL AND email_normalized = ?)`,
          )
          .bind(userId, userId, tenantId, tenantId, emailNormalized, emailNormalized)
      : null,
  ].filter(Boolean) as FluentPreparedStatement[];

  await bindings.db.batch(statements);
}

async function collectArtifactR2Keys(
  bindings: AccountPurgeBindings,
  subject: { tenantId: string | null; userId: string | null },
): Promise<string[]> {
  const keys = new Set<string>();

  if (subject.tenantId) {
    const styleRows = await bindings.db
      .prepare(
        `SELECT DISTINCT artifacts.r2_key
         FROM artifacts
         LEFT JOIN style_item_photos ON style_item_photos.artifact_id = artifacts.id
         WHERE (artifacts.tenant_id = ? OR (artifacts.tenant_id IS NULL AND style_item_photos.tenant_id = ?))
           AND artifacts.r2_key IS NOT NULL`,
      )
      .bind(subject.tenantId, subject.tenantId)
      .all<{ r2_key: string | null }>();
    for (const row of styleRows.results ?? []) {
      if (row.r2_key) {
        keys.add(row.r2_key);
      }
    }
  }

  if (hasExportSubject(subject.userId, subject.tenantId)) {
    const exportRows = await bindings.db
      .prepare(
        `SELECT DISTINCT artifact_r2_key AS r2_key
         FROM fluent_data_exports
         WHERE ((? IS NOT NULL AND user_id = ?) OR (? IS NOT NULL AND tenant_id = ?))
           AND artifact_r2_key IS NOT NULL
         UNION
         SELECT DISTINCT artifacts.r2_key
         FROM artifacts
         INNER JOIN fluent_data_exports ON fluent_data_exports.artifact_id = artifacts.id
         WHERE ((? IS NOT NULL AND fluent_data_exports.user_id = ?)
            OR (? IS NOT NULL AND fluent_data_exports.tenant_id = ?))
           AND (artifacts.tenant_id IS NULL OR artifacts.tenant_id = fluent_data_exports.tenant_id)
           AND artifacts.r2_key IS NOT NULL`,
      )
      .bind(
        subject.userId,
        subject.userId,
        subject.tenantId,
        subject.tenantId,
        subject.userId,
        subject.userId,
        subject.tenantId,
        subject.tenantId,
      )
      .all<{ r2_key: string | null }>();
    for (const row of exportRows.results ?? []) {
      if (row.r2_key) {
        keys.add(row.r2_key);
      }
    }
  }

  return [...keys];
}

function hasExportSubject(userId: string | null, tenantId: string | null): boolean {
  return Boolean(userId || tenantId);
}

function hasEntitlementSubject(userId: string | null, tenantId: string | null, emailNormalized: string | null): boolean {
  return Boolean(userId || tenantId || emailNormalized);
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
