-- Retire budgets (D27, 2026-09-29): Fluent no longer tracks budget envelopes or spend. Hosts bring
-- finance context from the user's own tools. This deletes every saved envelope and spend event.
-- Apply AFTER the Worker without budget code is deployed: earlier Workers query these tables.
-- fluent_write_operations (0035) stays; recipe saves and feedback use it.
DROP INDEX IF EXISTS idx_budget_spend_events_tenant_operation;
DROP INDEX IF EXISTS idx_budget_spend_events_tenant_category_period;
DROP INDEX IF EXISTS idx_budget_spend_events_tenant_created;
DROP TABLE IF EXISTS budget_spend_events;
DROP TABLE IF EXISTS budget_envelopes;
