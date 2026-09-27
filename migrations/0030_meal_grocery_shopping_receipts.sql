CREATE TABLE IF NOT EXISTS meal_grocery_shopping_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  list_id TEXT NOT NULL,
  list_version TEXT NOT NULL,
  week_start TEXT NOT NULL,
  subset_json TEXT NOT NULL,
  status TEXT NOT NULL,
  execution_token TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_grocery_shopping_receipts_idempotency
  ON meal_grocery_shopping_receipts(tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_meal_grocery_shopping_receipts_list
  ON meal_grocery_shopping_receipts(tenant_id, list_id, week_start, updated_at DESC);

CREATE TABLE IF NOT EXISTS meal_grocery_shopping_receipt_rows (
  receipt_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  requested_status TEXT NOT NULL,
  outcome TEXT NOT NULL,
  result_json TEXT,
  error_text TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (receipt_id, item_key),
  FOREIGN KEY (receipt_id) REFERENCES meal_grocery_shopping_receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES fluent_tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_grocery_shopping_receipt_rows_outcome
  ON meal_grocery_shopping_receipt_rows(tenant_id, receipt_id, outcome);
