ALTER TABLE artifacts ADD COLUMN tenant_id TEXT REFERENCES fluent_tenants(id) ON DELETE CASCADE;

-- Recover ownership for linked Style media first, then for a previously unlinked photo artifact
-- whose immutable metadata still identifies an owned Style item.
UPDATE artifacts
SET tenant_id = (
  SELECT MIN(style_item_photos.tenant_id)
  FROM style_item_photos
  WHERE style_item_photos.artifact_id = artifacts.id
  HAVING COUNT(DISTINCT style_item_photos.tenant_id) = 1
)
WHERE tenant_id IS NULL
  AND domain = 'style';

UPDATE artifacts
SET tenant_id = (
  SELECT MIN(style_items.tenant_id)
  FROM style_items
  WHERE style_items.id = json_extract(artifacts.metadata_json, '$.itemId')
  HAVING COUNT(DISTINCT style_items.tenant_id) = 1
)
WHERE tenant_id IS NULL
  AND domain = 'style'
  AND metadata_json IS NOT NULL
  AND json_valid(metadata_json);

UPDATE artifacts
SET tenant_id = (
  SELECT MIN(fluent_data_exports.tenant_id)
  FROM fluent_data_exports
  WHERE fluent_data_exports.artifact_id = artifacts.id
  HAVING COUNT(DISTINCT fluent_data_exports.tenant_id) = 1
)
WHERE tenant_id IS NULL
  AND entity_type = 'fluent_data_export';

CREATE INDEX IF NOT EXISTS idx_artifacts_tenant_id ON artifacts(tenant_id);

-- This is intentionally an expand-only migration. Keeping tenant_id nullable preserves
-- compatibility with the pre-0029 Worker during rollout and rollback. Current application writes
-- always bind tenant_id; the deploy sequence repeats the idempotent ownership backfill after the
-- new Worker is live to close the old-Worker race window.
