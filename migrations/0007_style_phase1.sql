CREATE TABLE IF NOT EXISTS style_profile (
  tenant_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id),
  FOREIGN KEY (tenant_id, profile_id) REFERENCES fluent_profile(tenant_id, profile_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO style_profile (tenant_id, profile_id, raw_json)
VALUES (
  'primary',
  'owner',
  '{"fitNotes":[],"sizingPreferences":[],"hardAvoids":[],"contextRules":[],"preferredSilhouettes":[],"formalityTendency":null,"colorDirections":[],"aestheticKeywords":[],"importedClosetAt":null,"importedClosetConfirmed":false,"importSource":null}'
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
  formality REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_style_items_tenant_category ON style_items(tenant_id, category, subcategory);
CREATE INDEX IF NOT EXISTS idx_style_items_tenant_color ON style_items(tenant_id, color_family);

CREATE TABLE IF NOT EXISTS style_item_photos (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  legacy_photo_id INTEGER,
  url TEXT NOT NULL,
  view TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_fit INTEGER NOT NULL DEFAULT 0,
  bg_removed INTEGER NOT NULL DEFAULT 0,
  imported_from TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES style_items(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_style_item_photos_item ON style_item_photos(tenant_id, item_id, is_primary DESC, created_at ASC);

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

CREATE INDEX IF NOT EXISTS idx_style_import_runs_tenant_created_at ON style_import_runs(tenant_id, created_at DESC);
