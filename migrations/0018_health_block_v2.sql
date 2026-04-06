CREATE TABLE IF NOT EXISTS health_training_blocks (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  goal_id TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_weeks INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'active',
  name TEXT NOT NULL,
  training_split TEXT,
  days_per_week INTEGER NOT NULL DEFAULT 3,
  session_length_minutes INTEGER,
  equipment_access TEXT,
  progression_strategy TEXT,
  deload_strategy TEXT,
  summary_json TEXT,
  rationale_json TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, goal_id) REFERENCES health_goals(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_health_training_blocks_status
  ON health_training_blocks(tenant_id, profile_id, status, start_date DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS health_block_sessions (
  tenant_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  id TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  week_pattern TEXT,
  title TEXT NOT NULL,
  session_type TEXT,
  estimated_minutes INTEGER,
  load_hint TEXT,
  notes TEXT,
  details_json TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, block_id) REFERENCES health_training_blocks(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_block_sessions_sequence
  ON health_block_sessions(tenant_id, block_id, sequence_index);

CREATE TABLE IF NOT EXISTS health_block_state (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  active_week_index INTEGER NOT NULL DEFAULT 0,
  next_session_index INTEGER NOT NULL DEFAULT 0,
  last_completed_session_id TEXT,
  last_completed_date TEXT,
  last_completion TEXT,
  paused INTEGER NOT NULL DEFAULT 0,
  deload INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, block_id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, block_id) REFERENCES health_training_blocks(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS health_block_reviews (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  review_date TEXT NOT NULL,
  week_start TEXT,
  week_end TEXT,
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
  FOREIGN KEY (tenant_id, block_id) REFERENCES health_training_blocks(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_block_reviews_block
  ON health_block_reviews(tenant_id, profile_id, block_id, review_date DESC, updated_at DESC);

ALTER TABLE health_workout_logs ADD COLUMN block_id TEXT;
ALTER TABLE health_workout_logs ADD COLUMN block_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_health_workout_logs_block
  ON health_workout_logs(tenant_id, profile_id, block_id, date DESC, created_at DESC);

UPDATE fluent_domains
SET metadata_json = '{"description":"Fitness-first coaching with active training blocks, today resolution, lightweight workout logging, and Meals alignment.","skill":"fluent-health"}',
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'primary' AND domain_id = 'health';
