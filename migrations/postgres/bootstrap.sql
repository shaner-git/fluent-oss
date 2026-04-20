CREATE TABLE IF NOT EXISTS fluent_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  backend_mode TEXT NOT NULL DEFAULT 'local',
  status TEXT NOT NULL DEFAULT 'active',
  onboarding_state TEXT NOT NULL DEFAULT 'onboarding_completed',
  onboarding_version TEXT NOT NULL DEFAULT '1',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fluent_profile (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id),
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fluent_domains (
  tenant_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'enabled',
  onboarding_state TEXT NOT NULL DEFAULT 'onboarding_completed',
  onboarding_version TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, domain_id),
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fluent_user_identities (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL DEFAULT 'better-auth',
  email TEXT,
  email_normalized TEXT,
  display_name TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fluent_user_identities_email
  ON fluent_user_identities(email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS fluent_user_memberships (
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, tenant_id, profile_id),
  FOREIGN KEY (user_id) REFERENCES fluent_user_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fluent_user_memberships_user_status
  ON fluent_user_memberships(user_id, status, created_at);

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
  confidence DOUBLE PRECISION,
  source_type TEXT,
  actor_email TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_recipes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  servings INTEGER,
  total_time_minutes INTEGER,
  active_time_minutes INTEGER,
  macros_json TEXT,
  cost_per_serving_cad DOUBLE PRECISION,
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
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
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
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meal_inventory_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  source TEXT,
  confirmed_at TEXT,
  purchased_at TEXT,
  estimated_expiry TEXT,
  perishability TEXT,
  long_life_default INTEGER DEFAULT 0,
  canonical_item_key TEXT,
  canonical_quantity DOUBLE PRECISION,
  canonical_unit TEXT,
  canonical_confidence DOUBLE PRECISION,
  quantity DOUBLE PRECISION,
  unit TEXT,
  location TEXT,
  brand TEXT,
  cost_cad DOUBLE PRECISION,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_feedback_json TEXT,
  notes_json TEXT,
  last_used_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_brand_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  item_family TEXT NOT NULL,
  brand TEXT NOT NULL,
  preference_strength TEXT,
  evidence_source TEXT,
  evidence_count INTEGER DEFAULT 0,
  last_seen_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_feedback (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
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
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence DOUBLE PRECISION,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (meal_plan_entry_id) REFERENCES meal_plan_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_plan_reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  meal_plan_id TEXT,
  week_start TEXT NOT NULL,
  summary TEXT,
  worked_json TEXT,
  skipped_json TEXT,
  next_changes_json TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence DOUBLE PRECISION,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meal_grocery_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  meal_plan_id TEXT,
  store TEXT NOT NULL,
  export_artifact_id TEXT,
  report_artifact_id TEXT,
  status TEXT NOT NULL,
  auth_path TEXT,
  cart_start_json TEXT,
  cart_end_json TEXT,
  summary_json TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence DOUBLE PRECISION,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS grocery_intents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  quantity DOUBLE PRECISION,
  unit TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  target_window TEXT,
  meal_plan_id TEXT,
  metadata_json TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence DOUBLE PRECISION,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

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
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  meal_plan_id TEXT,
  raw_json TEXT NOT NULL,
  source_snapshot_json TEXT,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meal_plan_generations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  source_snapshot_json TEXT,
  accepted_candidate_id TEXT,
  accepted_plan_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meal_grocery_plan_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
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
  confidence DOUBLE PRECISION,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meal_confirmed_order_syncs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  retailer TEXT NOT NULL,
  retailer_order_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  status TEXT NOT NULL,
  confirmed_at TEXT,
  synced_at TEXT NOT NULL,
  matched_purchased_count INTEGER NOT NULL DEFAULT 0,
  ordered_extra_count INTEGER NOT NULL DEFAULT 0,
  explicit_skipped_count INTEGER NOT NULL DEFAULT 0,
  missing_planned_count INTEGER NOT NULL DEFAULT 0,
  unresolved_count INTEGER NOT NULL DEFAULT 0,
  payload_summary_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_profile (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_items (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  legacy_item_id INTEGER,
  brand TEXT,
  name TEXT,
  category TEXT,
  subcategory TEXT,
  size TEXT,
  color_family TEXT,
  color_name TEXT,
  color_hex TEXT,
  formality DOUBLE PRECISION,
  comparator_key TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_item_photos (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  legacy_photo_id INTEGER,
  url TEXT NOT NULL,
  source_url TEXT,
  artifact_id TEXT,
  mime_type TEXT,
  view TEXT,
  kind TEXT,
  source TEXT,
  captured_at TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_fit INTEGER NOT NULL DEFAULT 0,
  bg_removed INTEGER NOT NULL DEFAULT 0,
  imported_from TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES style_items(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_item_profiles (
  tenant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  legacy_profile_id INTEGER,
  raw_json TEXT NOT NULL,
  source TEXT,
  method TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, item_id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES style_items(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_item_provenance (
  tenant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  field_evidence_json TEXT,
  technical_metadata_json TEXT,
  source_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, item_id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES style_items(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_import_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_name TEXT,
  source_snapshot_path TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  photo_count INTEGER NOT NULL DEFAULT 0,
  profile_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

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
  target_value DOUBLE PRECISION,
  target_unit TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS health_workout_logs (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  plan_id TEXT,
  plan_entry_id TEXT,
  block_id TEXT,
  block_session_id TEXT,
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
  confidence DOUBLE PRECISION,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS health_body_metrics (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value DOUBLE PRECISION,
  value2 DOUBLE PRECISION,
  unit TEXT,
  notes TEXT,
  source TEXT,
  source_agent TEXT,
  source_skill TEXT,
  session_id TEXT,
  confidence DOUBLE PRECISION,
  source_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS health_weekly_reviews (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  plan_id TEXT,
  summary TEXT,
  worked_json TEXT NOT NULL DEFAULT '[]',
  struggled_json TEXT NOT NULL DEFAULT '[]',
  adjustments_json TEXT NOT NULL DEFAULT '[]',
  next_focus TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

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
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

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
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
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
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_week_start ON meal_plans(tenant_id, week_start);
CREATE INDEX IF NOT EXISTS idx_meal_plans_status ON meal_plans(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_plan_id ON meal_plan_entries(tenant_id, meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_date ON meal_plan_entries(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_inventory_name ON meal_inventory_items(tenant_id, normalized_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_inventory_name_unique ON meal_inventory_items(tenant_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_meal_inventory_canonical_item_key ON meal_inventory_items(canonical_item_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_memory_recipe_id ON meal_memory(tenant_id, recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_feedback_recipe_date ON meal_feedback(tenant_id, recipe_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_feedback_entry ON meal_feedback(meal_plan_entry_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_reviews_week_start ON meal_plan_reviews(tenant_id, week_start);
CREATE INDEX IF NOT EXISTS idx_grocery_intents_status ON grocery_intents(tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_grocery_intents_name ON grocery_intents(tenant_id, normalized_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_grocery_plans_week_start ON meal_grocery_plans(tenant_id, week_start);
CREATE INDEX IF NOT EXISTS idx_meal_plan_generations_week_start ON meal_plan_generations(tenant_id, week_start);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_grocery_plan_actions_unique ON meal_grocery_plan_actions(tenant_id, week_start, item_key);
CREATE INDEX IF NOT EXISTS idx_meal_grocery_plan_actions_week ON meal_grocery_plan_actions(tenant_id, week_start, action_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_confirmed_order_syncs_unique ON meal_confirmed_order_syncs(tenant_id, retailer, retailer_order_id);
CREATE INDEX IF NOT EXISTS idx_meal_confirmed_order_syncs_week ON meal_confirmed_order_syncs(tenant_id, week_start, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_style_items_tenant_category ON style_items(tenant_id, category, subcategory);
CREATE INDEX IF NOT EXISTS idx_style_items_tenant_color ON style_items(tenant_id, color_family);
CREATE INDEX IF NOT EXISTS idx_style_items_tenant_comparator ON style_items(tenant_id, category, comparator_key);
CREATE INDEX IF NOT EXISTS idx_style_item_photos_item ON style_item_photos(tenant_id, item_id, is_primary, created_at);
CREATE INDEX IF NOT EXISTS idx_style_item_photos_artifact ON style_item_photos(tenant_id, artifact_id);
CREATE INDEX IF NOT EXISTS idx_style_import_runs_tenant_created_at ON style_import_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_goals_status ON health_goals(tenant_id, profile_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_training_plans_week ON health_training_plans(tenant_id, profile_id, week_start);
CREATE INDEX IF NOT EXISTS idx_health_training_plan_entries_plan ON health_training_plan_entries(tenant_id, plan_id, date);
CREATE INDEX IF NOT EXISTS idx_health_workout_logs_date ON health_workout_logs(tenant_id, profile_id, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_workout_logs_block ON health_workout_logs(tenant_id, profile_id, block_id, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_body_metrics_type ON health_body_metrics(tenant_id, profile_id, metric_type, date DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_weekly_reviews_week ON health_weekly_reviews(tenant_id, profile_id, week_start);
CREATE INDEX IF NOT EXISTS idx_health_weekly_reviews_updated ON health_weekly_reviews(tenant_id, profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_training_blocks_status ON health_training_blocks(tenant_id, profile_id, status, start_date DESC, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_block_sessions_sequence ON health_block_sessions(tenant_id, block_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_health_block_reviews_block ON health_block_reviews(tenant_id, profile_id, block_id, review_date DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_domain_created_at ON domain_events(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_entity ON domain_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluent_profile_tenant ON fluent_profile(tenant_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_fluent_domains_tenant_state ON fluent_domains(tenant_id, lifecycle_state, domain_id);

INSERT INTO fluent_tenants (
  id,
  slug,
  display_name,
  backend_mode,
  status,
  onboarding_state,
  onboarding_version,
  metadata_json
)
VALUES (
  'primary',
  'primary',
  'Fluent OSS',
  'local',
  'active',
  'onboarding_completed',
  '1',
  '{"product":"Fluent OSS","deployment":"oss","deployment_track":"oss","storage_backend":"postgres-s3"}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fluent_profile (
  tenant_id,
  profile_id,
  display_name,
  timezone,
  metadata_json
)
VALUES (
  'primary',
  'owner',
  'Fluent OSS Owner',
  'America/Toronto',
  '{"backend_mode":"local","product":"Fluent OSS","deployment":"oss","deployment_track":"oss","storage_backend":"postgres-s3"}'
)
ON CONFLICT (tenant_id, profile_id) DO NOTHING;

INSERT INTO fluent_domains (
  tenant_id,
  domain_id,
  display_name,
  lifecycle_state,
  onboarding_state,
  onboarding_version,
  metadata_json
)
VALUES
  ('primary', 'meals', 'Meals', 'enabled', 'onboarding_completed', '1', '{"description":"Meal planning, inventory, recipe memory, and grocery support.","skill":"fluent-meals"}'),
  ('primary', 'style', 'Style', 'enabled', 'onboarding_completed', '1', '{"description":"Style reasoning, wardrobe memory, and outfit support.","skill":"fluent-style"}'),
  ('primary', 'health', 'Health', 'enabled', 'onboarding_completed', '1', '{"description":"Fitness-first coaching with active training blocks, today resolution, lightweight workout logging, and Meals alignment.","skill":"fluent-health"}')
ON CONFLICT (tenant_id, domain_id) DO NOTHING;

INSERT INTO style_profile (
  tenant_id,
  profile_id,
  raw_json
)
VALUES (
  'primary',
  'owner',
  '{"fitNotes":[],"sizingPreferences":[],"hardAvoids":[],"contextRules":[],"preferredSilhouettes":[],"formalityTendency":null,"colorDirections":[],"aestheticKeywords":[],"importedClosetAt":null,"importedClosetConfirmed":false,"importSource":null,"onboardingPath":null,"practicalCalibrationConfirmed":false,"tasteCalibrationConfirmed":false,"closetCoverage":null}'
)
ON CONFLICT (tenant_id, profile_id) DO NOTHING;

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
  '{"version":"1","updated_at":"2026-04-05T00:00:00.000Z","profile_owner":"Fluent OSS Owner","planning_priorities":{},"core_rules":{},"family_constraints":{},"breakfast":{},"lunch":{},"dinner":{},"shopping":{"budget":{}},"inventory":{"track_quantity":false,"track_presence":true,"track_perishability":true,"long_life_defaults":[]}}',
  '{"seed":"migrations/postgres/bootstrap.sql","kind":"default_meal_preferences"}'
)
ON CONFLICT (tenant_id, profile_id) DO NOTHING;
