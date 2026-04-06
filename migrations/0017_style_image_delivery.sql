ALTER TABLE style_item_photos ADD COLUMN artifact_id TEXT;
ALTER TABLE style_item_photos ADD COLUMN source_url TEXT;
ALTER TABLE style_item_photos ADD COLUMN mime_type TEXT;

CREATE INDEX IF NOT EXISTS idx_style_item_photos_artifact ON style_item_photos(tenant_id, artifact_id);

UPDATE style_item_photos
SET source_url = url
WHERE source_url IS NULL AND url IS NOT NULL;
