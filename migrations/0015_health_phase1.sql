CREATE TABLE IF NOT EXISTS health_preferences (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS health_goals (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  target_value REAL,
  target_unit TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_goals_status
  ON health_goals(tenant_id, profile_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS health_training_plans (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  name TEXT NOT NULL,
  summary_json TEXT,
  rationale_json TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_training_plans_week
  ON health_training_plans(tenant_id, profile_id, week_start);

CREATE TABLE IF NOT EXISTS health_training_plan_entries (
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  day_label TEXT,
  title TEXT NOT NULL,
  session_type TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  estimated_minutes INTEGER,
  notes TEXT,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, plan_id) REFERENCES health_training_plans(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_training_plan_entries_plan
  ON health_training_plan_entries(tenant_id, plan_id, date);

CREATE TABLE IF NOT EXISTS health_workout_logs (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  plan_id TEXT,
  plan_entry_id TEXT,
  title_snapshot TEXT,
  completion TEXT NOT NULL DEFAULT 'full',
  duration_minutes INTEGER,
  energy_level TEXT,
  soreness_level TEXT,
  notes TEXT,
  raw_json TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence REAL,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, plan_id) REFERENCES health_training_plans(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, plan_entry_id) REFERENCES health_training_plan_entries(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_health_workout_logs_date
  ON health_workout_logs(tenant_id, profile_id, date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS health_body_metrics (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value REAL,
  value2 REAL,
  unit TEXT,
  notes TEXT,
  source TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence REAL,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_body_metrics_type
  ON health_body_metrics(tenant_id, profile_id, metric_type, date DESC, created_at DESC);

UPDATE fluent_domains
SET lifecycle_state = CASE WHEN lifecycle_state = 'disabled' THEN 'available' ELSE lifecycle_state END,
    onboarding_state = CASE
      WHEN onboarding_state IS NULL OR onboarding_state = '' THEN 'not_started'
      ELSE onboarding_state
    END,
    metadata_json = '{"description":"Fitness-first health coaching with goals, weekly training plans, workout logs, and recovery context.","skill":"fluent-health"}',
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'primary' AND domain_id = 'health';
