PRAGMA foreign_keys = OFF;

ALTER TABLE meal_plans ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_plans ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE meal_plan_entries ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_inventory_items ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_memory ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_brand_preferences ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_feedback ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_feedback ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE meal_plan_reviews ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_plan_reviews ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE meal_grocery_runs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_grocery_runs ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE grocery_intents ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_grocery_plans ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_grocery_plans ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE meal_plan_generations ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_plan_generations ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE meal_grocery_plan_actions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE meal_confirmed_order_syncs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'primary';

UPDATE meal_plans
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary'),
    profile_id = COALESCE(NULLIF(profile_id, ''), 'owner');

UPDATE meal_plan_entries
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary');

UPDATE meal_inventory_items
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary');

UPDATE meal_memory
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary');

UPDATE meal_brand_preferences
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary');

UPDATE meal_feedback
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary'),
    profile_id = COALESCE(NULLIF(profile_id, ''), 'owner');

UPDATE meal_plan_reviews
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary'),
    profile_id = COALESCE(NULLIF(profile_id, ''), 'owner');

UPDATE meal_grocery_runs
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary'),
    profile_id = COALESCE(NULLIF(profile_id, ''), 'owner');

UPDATE grocery_intents
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary');

UPDATE meal_grocery_plans
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary'),
    profile_id = COALESCE(NULLIF(profile_id, ''), 'owner');

UPDATE meal_plan_generations
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary'),
    profile_id = COALESCE(NULLIF(profile_id, ''), 'owner');

UPDATE meal_grocery_plan_actions
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary');

UPDATE meal_confirmed_order_syncs
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'primary');

DROP INDEX IF EXISTS idx_meal_inventory_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_inventory_name_unique
  ON meal_inventory_items(tenant_id, normalized_name)
  WHERE normalized_name IS NOT NULL;

DROP INDEX IF EXISTS idx_meal_grocery_plan_actions_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_grocery_plan_actions_unique
  ON meal_grocery_plan_actions(tenant_id, week_start, item_key);

DROP INDEX IF EXISTS idx_meal_confirmed_order_syncs_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_confirmed_order_syncs_unique
  ON meal_confirmed_order_syncs(tenant_id, retailer, retailer_order_id);

DROP INDEX IF EXISTS idx_meal_grocery_plans_week_start;
CREATE INDEX IF NOT EXISTS idx_meal_grocery_plans_week_start
  ON meal_grocery_plans(tenant_id, week_start);

DROP INDEX IF EXISTS idx_meal_plans_week_start;
CREATE INDEX IF NOT EXISTS idx_meal_plans_week_start
  ON meal_plans(tenant_id, week_start);

DROP INDEX IF EXISTS idx_meal_plans_status;
CREATE INDEX IF NOT EXISTS idx_meal_plans_status
  ON meal_plans(tenant_id, status);

DROP INDEX IF EXISTS idx_meal_plan_generations_week_start;
CREATE INDEX IF NOT EXISTS idx_meal_plan_generations_week_start
  ON meal_plan_generations(tenant_id, week_start);

DROP INDEX IF EXISTS idx_meal_plan_reviews_week_start;
CREATE INDEX IF NOT EXISTS idx_meal_plan_reviews_week_start
  ON meal_plan_reviews(tenant_id, week_start);

DROP INDEX IF EXISTS idx_meal_inventory_name;
CREATE INDEX IF NOT EXISTS idx_meal_inventory_name
  ON meal_inventory_items(tenant_id, normalized_name);

DROP INDEX IF EXISTS idx_meal_memory_recipe_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_memory_recipe_id
  ON meal_memory(tenant_id, recipe_id);

CREATE INDEX IF NOT EXISTS idx_grocery_intents_tenant_status
  ON grocery_intents(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_meal_feedback_tenant_recipe_date
  ON meal_feedback(tenant_id, recipe_id, date);

CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_tenant_plan
  ON meal_plan_entries(tenant_id, meal_plan_id);

CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_tenant_date
  ON meal_plan_entries(tenant_id, date);

CREATE INDEX IF NOT EXISTS idx_meal_grocery_runs_tenant_created
  ON meal_grocery_runs(tenant_id, created_at DESC);

PRAGMA foreign_keys = ON;
