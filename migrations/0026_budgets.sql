CREATE TABLE IF NOT EXISTS budget_envelopes (
  tenant_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('style-clothing', 'meals-groceries')),
  monthly_amount_cents INTEGER NOT NULL CHECK (monthly_amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'CAD',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, category)
);

CREATE TABLE IF NOT EXISTS budget_spend_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('style-clothing', 'meals-groceries')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  occurred_on TEXT NOT NULL,
  note TEXT,
  provenance_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budget_spend_events_tenant_category_period
  ON budget_spend_events (tenant_id, category, occurred_on);

CREATE INDEX IF NOT EXISTS idx_budget_spend_events_tenant_created
  ON budget_spend_events (tenant_id, created_at);
