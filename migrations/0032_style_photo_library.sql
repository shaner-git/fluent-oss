-- Presentation choices only. Original photo rows and artifacts remain intact.
CREATE TABLE IF NOT EXISTS style_photo_libraries (
  tenant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, item_id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES style_items(tenant_id, id) ON DELETE CASCADE
);
