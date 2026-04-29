ALTER TABLE meal_inventory_items ADD COLUMN canonical_item_key TEXT;
ALTER TABLE meal_inventory_items ADD COLUMN canonical_quantity REAL;
ALTER TABLE meal_inventory_items ADD COLUMN canonical_unit TEXT;
ALTER TABLE meal_inventory_items ADD COLUMN canonical_confidence REAL;

CREATE INDEX IF NOT EXISTS idx_meal_inventory_canonical_item_key
  ON meal_inventory_items(canonical_item_key);
