-- D26 (2026-09-27): multi-currency budgets and retry-safe writes (next ChatGPT app version).
-- Expand-only: defaulted/nullable columns and a new table. Existing spend rows become CAD, which is
-- what every row is today; no existing data is rewritten.

-- Spend events carry their own currency, an optional host operation id for retry dedupe, and the
-- host's conversion provenance (original amount/currency, rate, source) when the host converted.
ALTER TABLE budget_spend_events ADD COLUMN currency TEXT NOT NULL DEFAULT 'CAD';
ALTER TABLE budget_spend_events ADD COLUMN operation_id TEXT;
ALTER TABLE budget_spend_events ADD COLUMN conversion_json TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_spend_events_tenant_operation
  ON budget_spend_events (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL;

-- Idempotency claims for writes that have no natural key (save_recipe, record_recipe_feedback).
-- A claim is taken before the write; result_ref is filled after it commits.
CREATE TABLE IF NOT EXISTS fluent_write_operations (
  tenant_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  result_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, tool, operation_id)
);
