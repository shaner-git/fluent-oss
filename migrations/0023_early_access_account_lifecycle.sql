ALTER TABLE fluent_cloud_onboarding ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'early_access';
ALTER TABLE fluent_cloud_onboarding ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN support_tags_json TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN invite_accepted_at TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN checkout_required_at TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN trialing_at TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN past_due_grace_at TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN limited_access_at TEXT;
ALTER TABLE fluent_cloud_onboarding ADD COLUMN canceled_retention_at TEXT;

UPDATE fluent_cloud_onboarding
SET current_state = 'active',
    active_at = COALESCE(active_at, first_successful_tool_call_at, first_client_connected_at, account_created_at)
WHERE current_state IN ('email_verified', 'profile_started', 'first_domain_selected', 'first_client_connected', 'first_successful_tool_call');
