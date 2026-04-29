CREATE TABLE IF NOT EXISTS fluent_account_deletion_requests (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  user_id TEXT,
  tenant_id TEXT,
  profile_id TEXT,
  email TEXT,
  email_normalized TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'deletion_requested',
  request_reason TEXT,
  confirmed_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  failed_at TEXT,
  last_error TEXT,
  manual_review_reason TEXT,
  retention_summary_json TEXT,
  client_effects_json TEXT,
  timeline_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fluent_account_deletion_requests_user
  ON fluent_account_deletion_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_account_deletion_requests_email
  ON fluent_account_deletion_requests(email_normalized, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_account_deletion_requests_status
  ON fluent_account_deletion_requests(status, updated_at DESC);
