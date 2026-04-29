CREATE TABLE IF NOT EXISTS fluent_data_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  delivery_method TEXT NOT NULL DEFAULT 'authenticated-download',
  export_format_version TEXT NOT NULL,
  artifact_id TEXT,
  artifact_r2_key TEXT,
  artifact_mime_type TEXT,
  artifact_size_bytes INTEGER,
  artifact_sha256 TEXT,
  include_binary_artifacts INTEGER NOT NULL DEFAULT 0,
  operator_notes TEXT,
  failure_code TEXT,
  failure_message TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  expires_at TEXT,
  last_downloaded_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES fluent_user_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fluent_data_exports_user_requested
  ON fluent_data_exports(user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_data_exports_tenant_profile_requested
  ON fluent_data_exports(tenant_id, profile_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS fluent_data_export_audit_log (
  id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (export_id) REFERENCES fluent_data_exports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES fluent_user_identities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fluent_data_export_audit_log_export_created
  ON fluent_data_export_audit_log(export_id, created_at ASC);
