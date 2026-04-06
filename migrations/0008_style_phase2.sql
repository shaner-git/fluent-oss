ALTER TABLE style_items ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

UPDATE style_items
SET status = 'active'
WHERE status IS NULL OR TRIM(status) = '';

ALTER TABLE style_item_photos ADD COLUMN kind TEXT;
ALTER TABLE style_item_photos ADD COLUMN source TEXT;
ALTER TABLE style_item_photos ADD COLUMN captured_at TEXT;

UPDATE style_item_photos
SET kind = CASE
    WHEN is_fit = 1 THEN 'fit'
    WHEN LOWER(COALESCE(view, '')) IN ('front', 'back', 'side') THEN 'product'
    WHEN LOWER(COALESCE(view, '')) = 'detail' THEN 'detail'
    WHEN LOWER(COALESCE(view, '')) IN ('fit_front', 'fit_side', 'fit_other') THEN 'fit'
    ELSE 'unknown'
  END
WHERE kind IS NULL;

UPDATE style_item_photos
SET source = CASE
    WHEN url LIKE '/%' THEN 'legacy_reference'
    WHEN imported_from IS NOT NULL AND TRIM(imported_from) <> '' THEN 'imported'
    ELSE 'imported'
  END
WHERE source IS NULL;

UPDATE style_profile
SET raw_json = json_set(
  COALESCE(raw_json, '{}'),
  '$.onboardingPath', CASE
    WHEN json_extract(COALESCE(raw_json, '{}'), '$.importedClosetAt') IS NOT NULL THEN 'seeded'
    ELSE NULL
  END,
  '$.practicalCalibrationConfirmed', json(CASE
    WHEN json_array_length(COALESCE(json_extract(COALESCE(raw_json, '{}'), '$.fitNotes'), '[]')) > 0
      OR json_array_length(COALESCE(json_extract(COALESCE(raw_json, '{}'), '$.sizingPreferences'), '[]')) > 0
      OR json_array_length(COALESCE(json_extract(COALESCE(raw_json, '{}'), '$.hardAvoids'), '[]')) > 0
      OR json_array_length(COALESCE(json_extract(COALESCE(raw_json, '{}'), '$.contextRules'), '[]')) > 0
    THEN 'true' ELSE 'false' END),
  '$.tasteCalibrationConfirmed', json(CASE
    WHEN json_array_length(COALESCE(json_extract(COALESCE(raw_json, '{}'), '$.preferredSilhouettes'), '[]')) > 0
      OR json_array_length(COALESCE(json_extract(COALESCE(raw_json, '{}'), '$.colorDirections'), '[]')) > 0
      OR json_array_length(COALESCE(json_extract(COALESCE(raw_json, '{}'), '$.aestheticKeywords'), '[]')) > 0
      OR json_extract(COALESCE(raw_json, '{}'), '$.formalityTendency') IS NOT NULL
    THEN 'true' ELSE 'false' END),
  '$.closetCoverage', CASE
    WHEN json_extract(COALESCE(raw_json, '{}'), '$.importedClosetConfirmed') = 1 THEN 'current'
    ELSE NULL
  END
),
updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'primary' AND profile_id = 'owner';
