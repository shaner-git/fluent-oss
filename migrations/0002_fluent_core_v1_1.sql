CREATE TABLE IF NOT EXISTS fluent_profile (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fluent_profile (id, display_name, timezone, metadata_json)
VALUES (
  'owner',
  'Shane Rodness',
  'America/Toronto',
  '{"backend_mode":"hosted","product":"Fluent"}'
);

CREATE TABLE IF NOT EXISTS fluent_domains (
  domain_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'available',
  onboarding_state TEXT NOT NULL DEFAULT 'not_started',
  onboarding_version TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fluent_domains (domain_id, display_name, lifecycle_state, onboarding_state, onboarding_version, metadata_json)
VALUES
  ('meals', 'Meals', 'enabled', 'onboarding_completed', '1', '{"description":"Meal planning, inventory, recipe memory, and grocery support.","skill":"fluent-meals"}'),
  ('style', 'Style', 'available', 'not_started', '1', '{"description":"Style reasoning, wardrobe memory, and outfit support.","skill":"fluent-style"}'),
  ('health', 'Health', 'available', 'not_started', '1', '{"description":"Health tracking and related operational support."}');

CREATE TABLE IF NOT EXISTS domain_events (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  event_type TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  patch_json TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence REAL,
  source_type TEXT,
  actor_email TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_events_domain_created_at ON domain_events(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_entity ON domain_events(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS grocery_intents (
  id TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  target_window TEXT,
  meal_plan_id TEXT,
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

CREATE INDEX IF NOT EXISTS idx_grocery_intents_status ON grocery_intents(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_grocery_intents_name ON grocery_intents(normalized_name, updated_at DESC);

ALTER TABLE meal_feedback ADD COLUMN source_agent TEXT;
ALTER TABLE meal_feedback ADD COLUMN source_skill TEXT;
ALTER TABLE meal_feedback ADD COLUMN session_id TEXT;
ALTER TABLE meal_feedback ADD COLUMN confidence REAL;
ALTER TABLE meal_feedback ADD COLUMN source_type TEXT;

ALTER TABLE meal_plan_reviews ADD COLUMN source_agent TEXT;
ALTER TABLE meal_plan_reviews ADD COLUMN source_skill TEXT;
ALTER TABLE meal_plan_reviews ADD COLUMN session_id TEXT;
ALTER TABLE meal_plan_reviews ADD COLUMN confidence REAL;
ALTER TABLE meal_plan_reviews ADD COLUMN source_type TEXT;

ALTER TABLE meal_grocery_runs ADD COLUMN source_agent TEXT;
ALTER TABLE meal_grocery_runs ADD COLUMN source_skill TEXT;
ALTER TABLE meal_grocery_runs ADD COLUMN session_id TEXT;
ALTER TABLE meal_grocery_runs ADD COLUMN confidence REAL;
ALTER TABLE meal_grocery_runs ADD COLUMN source_type TEXT;
