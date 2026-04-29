ALTER TABLE style_items ADD COLUMN comparator_key TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_style_items_tenant_comparator
  ON style_items(tenant_id, category, comparator_key);

UPDATE style_items
SET comparator_key = CASE
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('t_shirt', 'tshirt', 'tee')
      THEN 'tee'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('polo', 'polo_shirt')
      THEN 'polo'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('oxford', 'oxford_shirt', 'button_down', 'buttondown')
      THEN 'oxford_shirt'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('dress_shirt', 'shirt', 'button_up', 'buttonup')
      THEN 'dress_shirt'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('overshirt', 'shirt_jacket', 'shacket')
      THEN 'overshirt'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('sweater', 'jumper', 'crewneck', 'pullover', 'knit')
      THEN 'sweater'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('hoodie', 'hooded_sweatshirt')
      THEN 'hoodie'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) = 'cardigan'
      THEN 'cardigan'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('coat', 'overcoat', 'parka', 'trench', 'raincoat', 'mac')
      THEN 'coat'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('jacket', 'blazer', 'sport_coat', 'bomber')
      THEN 'jacket'
    WHEN UPPER(COALESCE(category, '')) = 'BOTTOM'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('jean', 'jeans', 'denim')
      THEN 'jean'
    WHEN UPPER(COALESCE(category, '')) = 'BOTTOM'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('chino', 'chinos')
      THEN 'chino'
    WHEN UPPER(COALESCE(category, '')) = 'BOTTOM'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('trouser', 'trousers', 'slack', 'slacks', 'pant', 'pants')
      THEN 'trouser'
    WHEN UPPER(COALESCE(category, '')) = 'BOTTOM'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('short', 'shorts')
      THEN 'short'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('sneaker', 'sneakers', 'trainer', 'trainers', 'runner', 'running_shoe')
      THEN 'sneaker'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('loafer', 'loafers')
      THEN 'loafer'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('derby', 'derbies', 'blucher')
      THEN 'derby'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('oxford', 'oxfords', 'cap_toe_oxford')
      THEN 'oxford'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('boot', 'boots', 'chelsea', 'chukka')
      THEN 'boot'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('mule', 'mules', 'clog', 'clogs')
      THEN 'mule'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE(subcategory, '')), ' ', '_'), '-', '_')) IN ('sandal', 'sandals', 'slide', 'slides', 'flip_flop')
      THEN 'sandal'
    ELSE comparator_key
  END
WHERE comparator_key = 'unknown'
  AND subcategory IS NOT NULL
  AND TRIM(subcategory) <> '';

UPDATE style_items
SET comparator_key = CASE
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('t_shirt', 'tshirt', 'tee')
      THEN 'tee'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('polo', 'polo_shirt')
      THEN 'polo'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('oxford', 'oxford_shirt', 'button_down', 'buttondown')
      THEN 'oxford_shirt'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('dress_shirt', 'shirt', 'button_up', 'buttonup')
      THEN 'dress_shirt'
    WHEN UPPER(COALESCE(category, '')) IN ('TOP', 'OUTERWEAR')
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('overshirt', 'shirt_jacket', 'shacket')
      THEN 'overshirt'
    WHEN UPPER(COALESCE(category, '')) = 'BOTTOM'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('trouser', 'trousers', 'slack', 'slacks', 'pant', 'pants')
      THEN 'trouser'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('loafer', 'loafers')
      THEN 'loafer'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('oxford', 'oxfords', 'cap_toe_oxford')
      THEN 'oxford'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('derby', 'derbies', 'blucher')
      THEN 'derby'
    WHEN UPPER(COALESCE(category, '')) = 'SHOE'
      AND LOWER(REPLACE(REPLACE(TRIM(COALESCE((
        SELECT json_extract(raw_json, '$.itemType')
        FROM style_item_profiles
        WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
      ), '')), ' ', '_'), '-', '_')) IN ('sneaker', 'sneakers', 'trainer', 'trainers', 'runner', 'running_shoe')
      THEN 'sneaker'
    ELSE comparator_key
  END
WHERE comparator_key = 'unknown'
  AND EXISTS (
    SELECT 1
    FROM style_item_profiles
    WHERE tenant_id = style_items.tenant_id AND item_id = style_items.id
  );
