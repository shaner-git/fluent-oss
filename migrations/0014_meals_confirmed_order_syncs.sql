CREATE TABLE IF NOT EXISTS meal_confirmed_order_syncs (
  id TEXT PRIMARY KEY,
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_confirmed_order_syncs_unique
  ON meal_confirmed_order_syncs(retailer, retailer_order_id);

CREATE INDEX IF NOT EXISTS idx_meal_confirmed_order_syncs_week
  ON meal_confirmed_order_syncs(week_start, synced_at DESC);
