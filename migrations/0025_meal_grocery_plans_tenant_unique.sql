PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS meal_grocery_plans_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'primary',
  profile_id TEXT NOT NULL DEFAULT 'owner',
  week_start TEXT NOT NULL,
  meal_plan_id TEXT,
  raw_json TEXT NOT NULL,
  source_snapshot_json TEXT,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

INSERT OR REPLACE INTO meal_grocery_plans_v2 (
  id,
  tenant_id,
  profile_id,
  week_start,
  meal_plan_id,
  raw_json,
  source_snapshot_json,
  generated_at,
  created_at,
  updated_at
)
SELECT
  id,
  COALESCE(NULLIF(tenant_id, ''), 'primary'),
  COALESCE(NULLIF(profile_id, ''), 'owner'),
  week_start,
  meal_plan_id,
  raw_json,
  source_snapshot_json,
  generated_at,
  created_at,
  updated_at
FROM meal_grocery_plans;

DROP TABLE meal_grocery_plans;

ALTER TABLE meal_grocery_plans_v2 RENAME TO meal_grocery_plans;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_grocery_plans_tenant_week_unique
  ON meal_grocery_plans(tenant_id, week_start);

CREATE INDEX IF NOT EXISTS idx_meal_grocery_plans_week_start
  ON meal_grocery_plans(tenant_id, week_start);

PRAGMA foreign_keys = ON;
