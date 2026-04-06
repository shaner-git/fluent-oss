UPDATE style_items
SET comparator_key = 'oxford_shirt'
WHERE tenant_id = 'primary'
  AND comparator_key = 'unknown'
  AND UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
  AND LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_'), '/', '_')) = 'ocbd';

UPDATE style_items
SET comparator_key = 'oxford'
WHERE tenant_id = 'primary'
  AND comparator_key = 'unknown'
  AND UPPER(COALESCE(category, '')) = 'SHOE'
  AND LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_'), '/', '_')) = 'oxford_derby';
