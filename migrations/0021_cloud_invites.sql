CREATE TABLE IF NOT EXISTS fluent_cloud_waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  review_status TEXT NOT NULL DEFAULT 'pending_review',
  public_state TEXT NOT NULL DEFAULT 'waitlist_pending_review',
  source_system TEXT NOT NULL DEFAULT 'meetfluent-landing',
  source_entry_id TEXT,
  reviewed_at TEXT,
  invited_at TEXT,
  accepted_at TEXT,
  canceled_at TEXT,
  last_invite_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_waitlist_state
  ON fluent_cloud_waitlist_entries(review_status, public_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS fluent_cloud_invites (
  id TEXT PRIMARY KEY,
  waitlist_entry_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'invite_sent',
  send_count INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  last_sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  accepted_user_id TEXT,
  accepted_tenant_id TEXT,
  canceled_at TEXT,
  cancel_reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (waitlist_entry_id) REFERENCES fluent_cloud_waitlist_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_invites_email_state
  ON fluent_cloud_invites(email_normalized, state, expires_at, last_sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_invites_waitlist
  ON fluent_cloud_invites(waitlist_entry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fluent_cloud_access_audit_log (
  id TEXT PRIMARY KEY,
  waitlist_entry_id TEXT,
  invite_id TEXT,
  tenant_id TEXT,
  user_id TEXT,
  email_normalized TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (waitlist_entry_id) REFERENCES fluent_cloud_waitlist_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (invite_id) REFERENCES fluent_cloud_invites(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES fluent_user_identities(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_access_audit_created_at
  ON fluent_cloud_access_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_access_audit_event
  ON fluent_cloud_access_audit_log(event_type, email_normalized, created_at DESC);
