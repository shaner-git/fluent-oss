-- Host-researched product facts are separate from ownership, fit and media.
CREATE TABLE IF NOT EXISTS style_product_references (
  tenant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  operation_id TEXT NOT NULL,
  reference_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, item_id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES style_items(tenant_id, id) ON DELETE CASCADE
);
