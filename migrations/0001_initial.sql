PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meal_recipes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  servings INTEGER,
  total_time_minutes INTEGER,
  active_time_minutes INTEGER,
  macros_json TEXT,
  cost_per_serving_cad REAL,
  kid_friendly INTEGER DEFAULT 0,
  instructions_json TEXT,
  mise_en_place_json TEXT,
  prep_notes TEXT,
  reheat_guidance TEXT,
  serving_notes TEXT,
  source_type TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  week_end TEXT,
  status TEXT NOT NULL,
  generated_at TEXT,
  approved_at TEXT,
  profile_owner TEXT,
  requirements_json TEXT,
  summary_json TEXT,
  source_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_week_start ON meal_plans(week_start);
CREATE INDEX IF NOT EXISTS idx_meal_plans_status ON meal_plans(status);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  date TEXT,
  day_label TEXT,
  meal_type TEXT NOT NULL,
  recipe_id TEXT,
  recipe_name_snapshot TEXT NOT NULL,
  selection_status TEXT,
  serves INTEGER,
  prep_minutes INTEGER,
  total_minutes INTEGER,
  leftovers_expected INTEGER DEFAULT 0,
  instructions_snapshot_json TEXT,
  notes_json TEXT,
  status TEXT DEFAULT 'planned',
  cooked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_plan_id ON meal_plan_entries(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_date ON meal_plan_entries(date);

CREATE TABLE IF NOT EXISTS meal_inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  source TEXT,
  confirmed_at TEXT,
  purchased_at TEXT,
  estimated_expiry TEXT,
  perishability TEXT,
  long_life_default INTEGER DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meal_inventory_name ON meal_inventory_items(normalized_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_inventory_name_unique ON meal_inventory_items(normalized_name);

CREATE TABLE IF NOT EXISTS meal_memory (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  last_feedback_json TEXT,
  notes_json TEXT,
  last_used_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_brand_preferences (
  id TEXT PRIMARY KEY,
  item_family TEXT NOT NULL,
  brand TEXT NOT NULL,
  preference_strength TEXT,
  evidence_source TEXT,
  evidence_count INTEGER DEFAULT 0,
  last_seen_at TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS meal_feedback (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT,
  meal_plan_entry_id TEXT,
  recipe_id TEXT NOT NULL,
  date TEXT NOT NULL,
  taste TEXT,
  difficulty TEXT,
  time_reality TEXT,
  repeat_again TEXT,
  family_acceptance TEXT,
  notes TEXT,
  submitted_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (meal_plan_entry_id) REFERENCES meal_plan_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_feedback_recipe_date ON meal_feedback(recipe_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_feedback_entry ON meal_feedback(meal_plan_entry_id);

CREATE TABLE IF NOT EXISTS meal_plan_reviews (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT,
  week_start TEXT NOT NULL,
  summary TEXT,
  worked_json TEXT,
  skipped_json TEXT,
  next_changes_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_reviews_week_start ON meal_plan_reviews(week_start);

CREATE TABLE IF NOT EXISTS meal_grocery_runs (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT,
  store TEXT NOT NULL,
  export_artifact_id TEXT,
  report_artifact_id TEXT,
  status TEXT NOT NULL,
  auth_path TEXT,
  cart_start_json TEXT,
  cart_end_json TEXT,
  summary_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
