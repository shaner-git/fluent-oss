CREATE TABLE IF NOT EXISTS fluent_entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tenant_id TEXT,
  email TEXT,
  email_normalized TEXT,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  stripe_status TEXT NOT NULL,
  access_state TEXT NOT NULL,
  billing_notice TEXT,
  current_period_end TEXT,
  past_due_started_at TEXT,
  grace_ends_at TEXT,
  access_ends_at TEXT,
  retention_started_at TEXT,
  retention_ends_at TEXT,
  last_stripe_event_id TEXT,
  last_stripe_event_type TEXT,
  last_stripe_event_created_at TEXT,
  raw_subscription_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fluent_entitlements_subscription
  ON fluent_entitlements(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_fluent_entitlements_customer
  ON fluent_entitlements(stripe_customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluent_entitlements_email
  ON fluent_entitlements(email_normalized, updated_at DESC)
  WHERE email_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fluent_entitlements_user
  ON fluent_entitlements(user_id, updated_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_event_log (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  livemode INTEGER NOT NULL DEFAULT 0,
  api_version TEXT,
  stripe_created_at TEXT,
  payload_json TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_event_log_status
  ON stripe_event_log(processing_status, created_at DESC);
