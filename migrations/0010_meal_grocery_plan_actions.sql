CREATE TABLE IF NOT EXISTS meal_grocery_plan_actions (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  meal_plan_id TEXT,
  item_key TEXT NOT NULL,
  action_status TEXT NOT NULL,
  substitute_item_key TEXT,
  substitute_display_name TEXT,
  notes TEXT,
  metadata_json TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence REAL,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_grocery_plan_actions_unique
  ON meal_grocery_plan_actions(week_start, item_key);

CREATE INDEX IF NOT EXISTS idx_meal_grocery_plan_actions_week
  ON meal_grocery_plan_actions(week_start, action_status);
