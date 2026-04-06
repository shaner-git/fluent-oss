UPDATE fluent_domains
SET metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.skill', 'fluent-meals'),
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'primary'
  AND domain_id = 'meals';
