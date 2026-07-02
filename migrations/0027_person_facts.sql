-- 0027_person_facts.sql
-- Fluent Personal-Context Schema v1 (D18): canonical cross-domain person-level facts.
-- One canonical row per (tenant, profile, path) — "confirmed wins" is a single upsert.
-- History/audit reuses domain_events (recordCoreEvent); only CONSENT decisions are event-sourced here.
-- Greenfield: one-time create, zero backfill.

CREATE TABLE IF NOT EXISTS person_facts (
  tenant_id        TEXT NOT NULL,
  profile_id       TEXT NOT NULL,
  fact_id          TEXT NOT NULL,
  path             TEXT NOT NULL,         -- stable address, e.g. 'dietary.allergies'
  section          TEXT NOT NULL,         -- 'identity' | 'dietary' | 'household' | 'taste'
  kind             TEXT NOT NULL,         -- PersonFactKind
  value_json       TEXT NOT NULL,         -- typed PersonFactValue[kind], app-validated before write
  status           TEXT NOT NULL,         -- 'confirmed' | 'inferred' | 'system'
  confidence       REAL NOT NULL DEFAULT 1.0,
  source_json      TEXT NOT NULL,         -- {origin, domain, detail}
  visibility_json  TEXT NOT NULL,         -- {domains, hosts, derived_only_across}
  annotations_json TEXT NOT NULL DEFAULT '[]',   -- FactAnnotation[]; D16 ledger (cap ~12)
  supersedes       TEXT,                  -- prior fact_id (correction chain → domain_events)
  question_id      TEXT,
  note             TEXT,
  observed_at      TEXT NOT NULL,
  confirmed_at     TEXT,
  stale_after      TEXT,
  schema_version   INTEGER NOT NULL DEFAULT 1,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id, path)
);

CREATE INDEX IF NOT EXISTS idx_person_facts_section ON person_facts(tenant_id, profile_id, section);
CREATE INDEX IF NOT EXISTS idx_person_facts_status  ON person_facts(tenant_id, profile_id, status);

-- The ONE borrowed event-sourced idea: consent decisions only (provable revocation, D8).
-- NOT the fact store. Current visibility = latest event per scope_key, else the fact's seed visibility.
CREATE TABLE IF NOT EXISTS person_consent_events (
  tenant_id       TEXT NOT NULL,
  profile_id      TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  scope_key       TEXT NOT NULL,          -- 'path:<item|ancestor e.g. dietary.allergies.peanuts | dietary.allergies>' | 'section:dietary' | 'category:finance'
  visibility_json TEXT NOT NULL,          -- ConsentVisibility in effect after this event
  source_json     TEXT NOT NULL,
  occurred_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, profile_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_person_consent_scope
  ON person_consent_events(tenant_id, profile_id, scope_key, occurred_at DESC);
