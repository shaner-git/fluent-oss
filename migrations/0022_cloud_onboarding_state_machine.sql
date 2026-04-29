CREATE TABLE IF NOT EXISTS fluent_cloud_onboarding (
  email TEXT,
  email_normalized TEXT PRIMARY KEY,
  user_id TEXT,
  tenant_id TEXT,
  current_state TEXT NOT NULL DEFAULT 'waitlisted',
  metadata_json TEXT,
  failure_stage TEXT,
  failure_code TEXT,
  failure_message TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  retry_after TEXT,
  last_failure_at TEXT,
  support_status TEXT NOT NULL DEFAULT 'none',
  support_ticket_ref TEXT,
  support_notes TEXT,
  support_escalated_at TEXT,
  support_resolved_at TEXT,
  first_connected_client_id TEXT,
  first_connected_client_name TEXT,
  last_connected_client_id TEXT,
  last_connected_client_name TEXT,
  first_domain_id TEXT,
  waitlisted_at TEXT,
  invited_at TEXT,
  account_created_at TEXT,
  email_verified_at TEXT,
  profile_started_at TEXT,
  first_domain_selected_at TEXT,
  first_client_connected_at TEXT,
  first_successful_tool_call_at TEXT,
  active_at TEXT,
  suspended_at TEXT,
  deletion_requested_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES fluent_user_identities(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_onboarding_state
  ON fluent_cloud_onboarding(current_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_onboarding_user
  ON fluent_cloud_onboarding(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_onboarding_tenant
  ON fluent_cloud_onboarding(tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fluent_cloud_onboarding_events (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  user_id TEXT,
  tenant_id TEXT,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  actor_label TEXT,
  note TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email_normalized) REFERENCES fluent_cloud_onboarding(email_normalized) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES fluent_user_identities(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_onboarding_events_email_created
  ON fluent_cloud_onboarding_events(email_normalized, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_cloud_onboarding_events_state
  ON fluent_cloud_onboarding_events(to_state, created_at DESC);
