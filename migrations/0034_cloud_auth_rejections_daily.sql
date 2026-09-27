-- Privacy-safe daily counters for hosted bearer-auth rejections.
-- No tokens, emails, user ids, client ids, IPs, or user agents are stored here:
-- only the UTC day, a fixed rejection-reason category, and a coarse route class.
-- Account-scoped rejections (where the token proved which account it belongs to)
-- are additionally recorded as cloud_onboarding.auth_rejected events in
-- fluent_cloud_onboarding_events, which the account purge already deletes.
CREATE TABLE IF NOT EXISTS fluent_cloud_auth_rejections_daily (
  day TEXT NOT NULL,
  reason TEXT NOT NULL,
  route_class TEXT NOT NULL,
  rejection_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (day, reason, route_class)
);
