ALTER TABLE meal_recipes ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';

CREATE TABLE IF NOT EXISTS meal_feedback_recipe_hold (
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
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence REAL,
  source_type TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'primary',
  profile_id TEXT NOT NULL DEFAULT 'owner'
);

INSERT INTO meal_feedback_recipe_hold (
  id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty,
  time_reality, repeat_again, family_acceptance, notes, submitted_by, created_at,
  source_agent, source_skill, session_id, confidence, source_type, tenant_id, profile_id
)
SELECT
  id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty,
  time_reality, repeat_again, family_acceptance, notes, submitted_by, created_at,
  source_agent, source_skill, session_id, confidence, source_type,
  COALESCE(NULLIF(tenant_id, ''), 'primary'),
  COALESCE(NULLIF(profile_id, ''), 'owner')
FROM meal_feedback;

DROP TABLE meal_feedback;

CREATE TABLE IF NOT EXISTS meal_memory_v2 (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_feedback_json TEXT,
  notes_json TEXT,
  last_used_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tenant_id TEXT NOT NULL DEFAULT 'primary'
);

INSERT INTO meal_memory_v2 (
  id, recipe_id, status, last_feedback_json, notes_json, last_used_at, updated_at, tenant_id
)
SELECT
  id, recipe_id, status, last_feedback_json, notes_json, last_used_at, updated_at,
  COALESCE(NULLIF(tenant_id, ''), 'primary')
FROM meal_memory;

DROP TABLE meal_memory;
ALTER TABLE meal_memory_v2 RENAME TO meal_memory;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_memory_recipe_id
  ON meal_memory(tenant_id, recipe_id);

CREATE TABLE IF NOT EXISTS meal_plan_entries_v2 (
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
  tenant_id TEXT NOT NULL DEFAULT 'primary',
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
);

INSERT INTO meal_plan_entries_v2 (
  id, meal_plan_id, date, day_label, meal_type, recipe_id, recipe_name_snapshot,
  selection_status, serves, prep_minutes, total_minutes, leftovers_expected,
  instructions_snapshot_json, notes_json, status, cooked_at, updated_at, tenant_id
)
SELECT
  id, meal_plan_id, date, day_label, meal_type, recipe_id, recipe_name_snapshot,
  selection_status, serves, prep_minutes, total_minutes, leftovers_expected,
  instructions_snapshot_json, notes_json, status, cooked_at, updated_at,
  COALESCE(NULLIF(tenant_id, ''), 'primary')
FROM meal_plan_entries;

DROP TABLE meal_plan_entries;
ALTER TABLE meal_plan_entries_v2 RENAME TO meal_plan_entries;

CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_tenant_plan
  ON meal_plan_entries(tenant_id, meal_plan_id);

CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_tenant_date
  ON meal_plan_entries(tenant_id, date);

CREATE TABLE IF NOT EXISTS meal_recipes_v2 (
  tenant_id TEXT NOT NULL DEFAULT 'primary',
  id TEXT NOT NULL,
  slug TEXT,
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id)
);

INSERT INTO meal_recipes_v2 (
  tenant_id,
  id,
  slug,
  name,
  meal_type,
  servings,
  total_time_minutes,
  active_time_minutes,
  macros_json,
  cost_per_serving_cad,
  kid_friendly,
  instructions_json,
  mise_en_place_json,
  prep_notes,
  reheat_guidance,
  serving_notes,
  source_type,
  source_url,
  status,
  raw_json,
  created_at,
  updated_at
)
SELECT
  COALESCE(NULLIF(tenant_id, ''), 'primary'),
  id,
  slug,
  name,
  meal_type,
  servings,
  total_time_minutes,
  active_time_minutes,
  macros_json,
  cost_per_serving_cad,
  kid_friendly,
  instructions_json,
  mise_en_place_json,
  prep_notes,
  reheat_guidance,
  serving_notes,
  source_type,
  source_url,
  status,
  raw_json,
  created_at,
  updated_at
FROM meal_recipes;

DROP TABLE meal_recipes;
ALTER TABLE meal_recipes_v2 RENAME TO meal_recipes;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_recipes_tenant_slug_unique
  ON meal_recipes(tenant_id, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meal_recipes_tenant_status_type_name
  ON meal_recipes(tenant_id, status, meal_type, name);

CREATE INDEX IF NOT EXISTS idx_meal_recipes_tenant_type_status_name
  ON meal_recipes(tenant_id, meal_type, status, name);

CREATE TABLE IF NOT EXISTS meal_feedback_v2 (
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
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence REAL,
  source_type TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'primary',
  profile_id TEXT NOT NULL DEFAULT 'owner',
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (meal_plan_entry_id) REFERENCES meal_plan_entries(id) ON DELETE SET NULL
);

INSERT INTO meal_feedback_v2 (
  id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty,
  time_reality, repeat_again, family_acceptance, notes, submitted_by, created_at,
  source_agent, source_skill, session_id, confidence, source_type, tenant_id, profile_id
)
SELECT
  id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty,
  time_reality, repeat_again, family_acceptance, notes, submitted_by, created_at,
  source_agent, source_skill, session_id, confidence, source_type,
  tenant_id,
  profile_id
FROM meal_feedback_recipe_hold;

DROP TABLE meal_feedback_recipe_hold;
ALTER TABLE meal_feedback_v2 RENAME TO meal_feedback;

CREATE INDEX IF NOT EXISTS idx_meal_feedback_tenant_recipe_date
  ON meal_feedback(tenant_id, recipe_id, date);

CREATE INDEX IF NOT EXISTS idx_meal_feedback_entry
  ON meal_feedback(meal_plan_entry_id);
