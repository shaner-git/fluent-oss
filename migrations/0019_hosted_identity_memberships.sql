CREATE TABLE IF NOT EXISTS fluent_user_identities (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL DEFAULT 'better-auth',
  email TEXT,
  email_normalized TEXT,
  display_name TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fluent_user_identities_email
  ON fluent_user_identities(email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS fluent_user_memberships (
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, tenant_id, profile_id),
  FOREIGN KEY (user_id) REFERENCES fluent_user_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fluent_user_memberships_user_status
  ON fluent_user_memberships(user_id, status, created_at);
