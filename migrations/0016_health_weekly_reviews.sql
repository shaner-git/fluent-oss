CREATE TABLE IF NOT EXISTS health_weekly_reviews (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  plan_id TEXT,
  summary TEXT,
  worked_json TEXT NOT NULL DEFAULT '[]',
  struggled_json TEXT NOT NULL DEFAULT '[]',
  adjustments_json TEXT NOT NULL DEFAULT '[]',
  next_focus TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, plan_id) REFERENCES health_training_plans(tenant_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_weekly_reviews_week
  ON health_weekly_reviews(tenant_id, profile_id, week_start);

CREATE INDEX IF NOT EXISTS idx_health_weekly_reviews_updated
  ON health_weekly_reviews(tenant_id, profile_id, updated_at DESC);
