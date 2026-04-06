PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meal_plan_generations (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  source_snapshot_json TEXT,
  accepted_candidate_id TEXT,
  accepted_plan_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accepted_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_generations_week_start ON meal_plan_generations(week_start);
