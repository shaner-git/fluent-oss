PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS fluent_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  backend_mode TEXT NOT NULL DEFAULT 'hosted',
  status TEXT NOT NULL DEFAULT 'active',
  onboarding_state TEXT NOT NULL DEFAULT 'not_started',
  onboarding_version TEXT NOT NULL DEFAULT '1',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fluent_tenants (
  id,
  slug,
  display_name,
  backend_mode,
  status,
  onboarding_state,
  onboarding_version,
  metadata_json
)
VALUES (
  'primary',
  'primary',
  'Fluent Hosted',
  'hosted',
  'active',
  'onboarding_completed',
  '1',
  '{"product":"Fluent","deployment":"hosted"}'
);

ALTER TABLE fluent_profile RENAME TO fluent_profile_legacy_v1;

CREATE TABLE fluent_profile (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id),
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

INSERT INTO fluent_profile (
  tenant_id,
  profile_id,
  display_name,
  timezone,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  'primary',
  id,
  display_name,
  timezone,
  metadata_json,
  created_at,
  updated_at
FROM fluent_profile_legacy_v1;

DROP TABLE fluent_profile_legacy_v1;

ALTER TABLE fluent_domains RENAME TO fluent_domains_legacy_v1;

CREATE TABLE fluent_domains (
  tenant_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'available',
  onboarding_state TEXT NOT NULL DEFAULT 'not_started',
  onboarding_version TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, domain_id),
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

INSERT INTO fluent_domains (
  tenant_id,
  domain_id,
  display_name,
  lifecycle_state,
  onboarding_state,
  onboarding_version,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  'primary',
  domain_id,
  display_name,
  lifecycle_state,
  onboarding_state,
  onboarding_version,
  metadata_json,
  created_at,
  updated_at
FROM fluent_domains_legacy_v1;

DROP TABLE fluent_domains_legacy_v1;

CREATE INDEX IF NOT EXISTS idx_fluent_profile_tenant ON fluent_profile(tenant_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_fluent_domains_tenant_state ON fluent_domains(tenant_id, lifecycle_state, domain_id);

PRAGMA foreign_keys = ON;
