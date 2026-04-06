PRAGMA foreign_keys = ON;

ALTER TABLE meal_inventory_items ADD COLUMN quantity REAL;
ALTER TABLE meal_inventory_items ADD COLUMN unit TEXT;
ALTER TABLE meal_inventory_items ADD COLUMN location TEXT;
ALTER TABLE meal_inventory_items ADD COLUMN brand TEXT;
ALTER TABLE meal_inventory_items ADD COLUMN cost_cad REAL;

CREATE TABLE IF NOT EXISTS meal_preferences (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  raw_json TEXT NOT NULL,
  source_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id)
);

CREATE TABLE IF NOT EXISTS meal_grocery_plans (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  meal_plan_id TEXT,
  raw_json TEXT NOT NULL,
  source_snapshot_json TEXT,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_grocery_plans_week_start ON meal_grocery_plans(week_start);

INSERT INTO meal_preferences (
  tenant_id,
  profile_id,
  version,
  raw_json,
  source_snapshot_json
)
VALUES (
  'primary',
  'owner',
  '1',
  '{"version":"1","updated_at":"2026-03-28T00:00:00.000Z","profile_owner":"Shane Rodness","planning_priorities":{},"core_rules":{},"family_constraints":{},"breakfast":{},"lunch":{},"dinner":{},"shopping":{"budget":{}},"inventory":{"track_quantity":false,"track_presence":true,"track_perishability":true,"long_life_defaults":[]},"notes":["Seeded default hosted meals preferences. Replace with imported planning preferences before relying on hosted planning output."]}',
  '{"seed":"0005_hosted_planner_brain.sql","kind":"default_meal_preferences"}'
)
ON CONFLICT(tenant_id, profile_id) DO NOTHING;
