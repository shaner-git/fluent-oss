-- Tenant isolation for domain_events.
--
-- domain_events was created in 0002 without a tenant column, so every reader
-- (fluent_list_evidence via MealsService.listDomainEvents, HealthService.listDomainEvents)
-- could only filter by entity id. Any caller who knew or guessed another tenant's
-- entity id could read that tenant's before/after JSON. This migration is expand-only:
-- it adds tenant_id, backfills it from the owning rows where the entity still exists,
-- and indexes it. Rows that cannot be attributed stay NULL and are therefore excluded
-- from every tenant-scoped read (fail closed). Code after this migration always writes
-- tenant_id and always filters on it.

ALTER TABLE domain_events ADD COLUMN tenant_id TEXT;

-- Backfill from the owning entity rows. Each statement only touches rows that are
-- still NULL so re-running is safe.
UPDATE domain_events
SET tenant_id = (SELECT r.tenant_id FROM meal_recipes r WHERE r.id = domain_events.entity_id)
WHERE tenant_id IS NULL AND domain = 'meals'
  AND EXISTS (SELECT 1 FROM meal_recipes r WHERE r.id = domain_events.entity_id);

UPDATE domain_events
SET tenant_id = (SELECT p.tenant_id FROM meal_plans p WHERE p.id = domain_events.entity_id)
WHERE tenant_id IS NULL AND domain = 'meals'
  AND EXISTS (SELECT 1 FROM meal_plans p WHERE p.id = domain_events.entity_id);

UPDATE domain_events
SET tenant_id = (SELECT g.tenant_id FROM meal_grocery_plans g WHERE g.id = domain_events.entity_id)
WHERE tenant_id IS NULL AND domain = 'meals'
  AND EXISTS (SELECT 1 FROM meal_grocery_plans g WHERE g.id = domain_events.entity_id);

UPDATE domain_events
SET tenant_id = (SELECT i.tenant_id FROM grocery_intents i WHERE i.id = domain_events.entity_id)
WHERE tenant_id IS NULL AND domain = 'meals'
  AND EXISTS (SELECT 1 FROM grocery_intents i WHERE i.id = domain_events.entity_id);

UPDATE domain_events
SET tenant_id = (SELECT v.tenant_id FROM meal_inventory_items v WHERE v.id = domain_events.entity_id)
WHERE tenant_id IS NULL AND domain = 'meals'
  AND EXISTS (SELECT 1 FROM meal_inventory_items v WHERE v.id = domain_events.entity_id);

UPDATE domain_events
SET tenant_id = (SELECT s.tenant_id FROM style_items s WHERE s.id = domain_events.entity_id)
WHERE tenant_id IS NULL AND domain = 'style'
  AND EXISTS (SELECT 1 FROM style_items s WHERE s.id = domain_events.entity_id);

-- Core events whose entity id is the tenant itself.
UPDATE domain_events
SET tenant_id = entity_id
WHERE tenant_id IS NULL AND domain = 'core'
  AND EXISTS (SELECT 1 FROM fluent_tenants t WHERE t.id = domain_events.entity_id);

-- Account-deletion audit events carry their tenant on the request row.
UPDATE domain_events
SET tenant_id = (SELECT d.tenant_id FROM fluent_account_deletion_requests d WHERE d.id = domain_events.entity_id)
WHERE tenant_id IS NULL AND entity_type = 'fluent_account_deletion_request'
  AND EXISTS (SELECT 1 FROM fluent_account_deletion_requests d WHERE d.id = domain_events.entity_id);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_created_at ON domain_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_entity ON domain_events(tenant_id, entity_type, entity_id, created_at DESC);
