UPDATE style_items
SET comparator_key = 'oxford_shirt'
WHERE tenant_id = 'primary'
  AND comparator_key = 'dress_shirt'
  AND UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
  AND LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_'), '/', '_')) = 'ocbd';
