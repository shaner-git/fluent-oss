// Fluent Personal-Context Schema v1 (D18) — the portable cross-domain person-level fact layer.
// Leaf module: pure types + registry + consent predicate + value validation. No imports from
// fluent-core / vnext layers (avoids circular deps). Storage + D16 enforcement live in the service.
//
// Three tiers (D18): (1) canonical PERSON facts = these rows; (2) domain-OPERATIONAL = domain-local,
// NOT here; (3) cross-domain DERIVED signals = SeamSignal (computed, never stored). Only Tier-1 (per
// consent) and Tier-3 (per contract) cross domains.

// String unions mirror FluentVNextDomain / FluentHostFamily structurally (kept local to stay a leaf).
export type PcDomain = 'shared' | 'meals' | 'style' | 'budgets' | 'wellbeing';
export type PcHost = 'claude' | 'chatgpt_app' | 'codex' | 'openclaw' | 'generic_mcp' | 'unknown';

export type PersonFactSection = 'identity' | 'dietary' | 'household' | 'taste';
export type PersonFactStatus = 'confirmed' | 'inferred' | 'system';

// Slice-1 capture-wired Meals kinds: allergy, hard_avoid, dietary_pattern, anti_favorite,
// taste_pref. Read/planning support is intentionally narrower by kind: hard constraints use
// allergy/hard_avoid, dietary_pattern uses guarded ingredient-class guidance, and soft planning
// signals use anti_favorite/taste_pref.
export type PersonFactKind =
  | 'allergy'
  | 'hard_avoid'
  | 'dietary_pattern'
  | 'anti_favorite'
  | 'taste_pref'
  | 'timezone'
  | 'display_name';

export type DietaryPatternIdentity = 'vegetarian' | 'vegan' | 'pescatarian';

export interface PersonFactValueMap {
  allergy: { label: string; severity: 'avoid' | 'medical' };
  hard_avoid: { label: string };
  dietary_pattern: { label: string; pattern?: DietaryPatternIdentity };
  anti_favorite: { label: string; domain_hint?: 'meals' | 'style' };
  taste_pref: { label: string; polarity: 'like' | 'dislike'; strength?: 'mild' | 'strong' };
  timezone: { iana: string };
  display_name: { text: string };
}

export interface ConsentVisibility {
  domains: PcDomain[] | 'all' | 'asserting_only'; // who may READ the canonical value
  hosts: PcHost[] | 'all'; // host boundary (D8/D10)
  derived_only_across: PcDomain[]; // these consumers get only a SeamSignal, never the raw value
}

export interface PersonFactSource {
  origin: 'user_confirmed' | 'domain_inferred' | 'system' | 'host_observed';
  domain: PcDomain;
  detail: string | null;
}

export interface FactAnnotation {
  observed_value: unknown;
  status: 'inferred';
  source: PersonFactSource;
  confidence: number;
  observed_at: string;
  promotable: boolean;
}

export interface PersonFact<K extends PersonFactKind = PersonFactKind> {
  fact_id: string;
  path: string;
  section: PersonFactSection;
  kind: K;
  value: PersonFactValueMap[K];
  status: PersonFactStatus;
  confidence: number; // INTERNAL — never exposed to hosts; D16 makes confirmed beat inferred regardless
  source: PersonFactSource;
  question_id: string | null;
  note: string | null;
  visibility: ConsentVisibility;
  annotations: FactAnnotation[];
  supersedes: string | null;
  observed_at: string;
  confirmed_at: string | null;
  stale_after: string | null;
  schema_version: number;
}

// Tier-3: a directional, derived, closed-enum signal. Computed on read, never stored, never a PersonFact.
export interface SeamSignal {
  seam_id: string; // 'budgets.meals.grocery_pressure' = producer.consumer.name
  producer: PcDomain;
  consumer: PcDomain;
  value: 'comfortable' | 'tight' | 'no_signal'; // CLOSED codomain — contract guarantee
  freshness: 'current' | 'stale' | 'no_signal';
  caveats: string[];
  hosts: PcHost[] | 'all';
  contract_version: 1;
}

// Server-internal write result. upsertPersonFact returns ONLY this — never raw fact internals — so a
// write can never become an unfiltered read; host-facing read-after-write goes through listPersonFacts.
export interface PersonFactWriteAck {
  factId: string;
  path: string;
  status: PersonFactStatus;
}

export interface PersonFactRejectAck {
  path: string;
  removed: boolean;
}

export const PERSON_FACT_SCHEMA_VERSION = 1;

const SECTION_OF: Record<PersonFactKind, PersonFactSection> = {
  allergy: 'dietary',
  dietary_pattern: 'dietary',
  hard_avoid: 'taste',
  anti_favorite: 'taste',
  taste_pref: 'taste',
  timezone: 'identity',
  display_name: 'identity',
};

// Per-section visibility defaults (codified here, NOT scattered — a wrong default would exfiltrate an
// allergy to another host). Sensitive sections default hosts:'all' per the owner's values decision (D18):
// under-sharing a medical allergy to the user's own assistant is the worse failure.
const SECTION_VISIBILITY_DEFAULTS: Record<PersonFactSection, ConsentVisibility> = {
  identity: { domains: 'all', hosts: 'all', derived_only_across: [] },
  dietary: { domains: 'all', hosts: 'all', derived_only_across: [] },
  taste: { domains: 'all', hosts: 'all', derived_only_across: [] },
  household: { domains: ['meals', 'shared'], hosts: 'all', derived_only_across: [] },
};

export function defaultVisibilityForKind(kind: PersonFactKind): ConsentVisibility {
  const d = SECTION_VISIBILITY_DEFAULTS[SECTION_OF[kind]];
  return { domains: d.domains, hosts: d.hosts, derived_only_across: [...d.derived_only_across] };
}

export function sectionForKind(kind: PersonFactKind): PersonFactSection {
  return SECTION_OF[kind];
}

function slug(value: string): string {
  const s = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (s) return s;
  // Non-empty guarantee: a punctuation-only / non-ASCII label must not collapse to '' (which would
  // make every such fact share one path and overwrite each other). Fall back to a stable short hash.
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return `x-${h.toString(36)}`;
}

function isDietaryPatternIdentity(value: unknown): value is DietaryPatternIdentity {
  return value === 'vegetarian' || value === 'vegan' || value === 'pescatarian';
}

// Singleton kinds occupy a fixed path; list-like kinds get an item-specific path so multiple values
// (e.g. several allergies) each get their own canonical row under the per-path primary key.
export function pathForFact(kind: PersonFactKind, value: PersonFactValueMap[PersonFactKind]): string {
  switch (kind) {
    case 'timezone':
      return 'identity.timezone';
    case 'display_name':
      return 'identity.display_name';
    case 'allergy':
      return `dietary.allergies.${slug((value as PersonFactValueMap['allergy']).label)}`;
    case 'dietary_pattern':
      return `dietary.patterns.${slug((value as PersonFactValueMap['dietary_pattern']).label)}`;
    case 'hard_avoid':
      return `taste.anti_favorites.${slug((value as PersonFactValueMap['hard_avoid']).label)}`;
    // anti_favorite gets its OWN path namespace (not taste.anti_favorites) so a softer `avoid`
    // can never upsert over a confirmed `hard_avoid` of the same label and silently downgrade the
    // surfaced kind (never-serve -> mild-dislike). The two now co-exist as distinct rows.
    case 'anti_favorite':
      return `taste.dislikes.${slug((value as PersonFactValueMap['anti_favorite']).label)}`;
    case 'taste_pref':
      return `taste.preferences.${slug((value as PersonFactValueMap['taste_pref']).label)}`;
  }
}

// App-side validation BEFORE write (the one place a typing/privacy guarantee could silently fail —
// value_json is opaque to SQLite). Throws on malformed input; returns the normalized typed value.
export function validatePersonFactValue<K extends PersonFactKind>(kind: K, raw: unknown): PersonFactValueMap[K] {
  const v = (raw ?? {}) as Record<string, unknown>;
  const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
  switch (kind) {
    case 'allergy': {
      const label = str(v.label);
      if (!label) throw new Error('person_fact allergy requires a non-empty label.');
      const severity = v.severity === 'medical' ? 'medical' : 'avoid';
      return { label, severity } as PersonFactValueMap[K];
    }
    case 'hard_avoid': {
      const label = str(v.label);
      if (!label) throw new Error(`person_fact ${kind} requires a non-empty label.`);
      return { label } as PersonFactValueMap[K];
    }
    case 'dietary_pattern': {
      const label = str(v.label);
      if (!label) throw new Error(`person_fact ${kind} requires a non-empty label.`);
      if (v.pattern === undefined || v.pattern === null || v.pattern === '') {
        return { label } as PersonFactValueMap[K];
      }
      if (!isDietaryPatternIdentity(v.pattern)) {
        throw new Error('person_fact dietary_pattern pattern must be vegetarian, vegan, or pescatarian.');
      }
      return { label, pattern: v.pattern } as PersonFactValueMap[K];
    }
    case 'anti_favorite': {
      const label = str(v.label);
      if (!label) throw new Error('person_fact anti_favorite requires a non-empty label.');
      const domain_hint = v.domain_hint === 'meals' || v.domain_hint === 'style' ? v.domain_hint : undefined;
      return (domain_hint ? { label, domain_hint } : { label }) as PersonFactValueMap[K];
    }
    case 'taste_pref': {
      const label = str(v.label);
      if (!label) throw new Error('person_fact taste_pref requires a non-empty label.');
      const polarity = v.polarity === 'dislike' ? 'dislike' : 'like';
      const strength = v.strength === 'mild' || v.strength === 'strong' ? v.strength : undefined;
      return (strength ? { label, polarity, strength } : { label, polarity }) as PersonFactValueMap[K];
    }
    case 'timezone': {
      const iana = str(v.iana);
      if (!iana) throw new Error('person_fact timezone requires an iana value.');
      return { iana } as PersonFactValueMap[K];
    }
    case 'display_name': {
      const text = str(v.text);
      if (!text) throw new Error('person_fact display_name requires text.');
      return { text } as PersonFactValueMap[K];
    }
    default:
      throw new Error(`Unknown person_fact kind: ${String(kind)}`);
  }
}

// Renderable label invariant (D10 unknown-kind safety): every kind maps to a string a host can render
// even if it doesn't understand the kind.
export function factLabel(fact: Pick<PersonFact, 'kind' | 'value'>): string {
  const v = fact.value as Record<string, unknown>;
  switch (fact.kind) {
    case 'timezone':
      return String((v as PersonFactValueMap['timezone']).iana);
    case 'display_name':
      return String((v as PersonFactValueMap['display_name']).text);
    default:
      return String((v as { label?: unknown }).label ?? '');
  }
}

export interface ConsentEventLite {
  scope_key: string; // 'path:<path>' | 'section:<section>' | 'category:<name>'
  visibility: ConsentVisibility;
  occurred_at: string;
}

// Current effective visibility: most-specific consent scope wins (exact path, then section), else the
// fact's seed visibility. consentEvents must be the rows relevant to this fact, newest-first.
// Ordered consent scope keys for a fact, MOST-SPECIFIC FIRST: every path prefix (item -> collection
// -> top), then the section. So a consent drop on 'path:dietary.allergies' correctly applies to the
// item fact at 'dietary.allergies.peanuts', and 'section:dietary' covers the whole section.
export function consentScopeChain(fact: Pick<PersonFact, 'path' | 'section'>): string[] {
  const segments = fact.path.split('.');
  const keys: string[] = [];
  for (let i = segments.length; i >= 1; i -= 1) {
    keys.push(`path:${segments.slice(0, i).join('.')}`);
  }
  const sectionKey = `section:${fact.section}`;
  if (!keys.includes(sectionKey)) keys.push(sectionKey);
  return keys;
}

export function currentVisibility(fact: PersonFact, consentEvents: ConsentEventLite[] = []): ConsentVisibility {
  for (const key of consentScopeChain(fact)) {
    const ev = consentEvents.find((e) => e.scope_key === key); // events arrive newest-first -> newest wins
    if (ev) return ev.visibility;
  }
  return fact.visibility;
}

// THE consent chokepoint predicate. Every cross-domain/host read filters through this.
export function visibleTo(
  fact: PersonFact,
  consumer: PcDomain,
  host: PcHost,
  consentEvents: ConsentEventLite[] = [],
): boolean {
  if (fact.status === 'inferred') return false; // only confirmed/system facts surface as canonical
  const v = currentVisibility(fact, consentEvents);
  const domainOk =
    v.domains === 'all'
      ? true
      : v.domains === 'asserting_only'
        ? fact.source.domain === consumer
        : v.domains.includes(consumer);
  const hostOk = v.hosts === 'all' || v.hosts.includes(host);
  const notDerivedOnly = !(v.derived_only_across ?? []).includes(consumer);
  return domainOk && hostOk && notDerivedOnly;
}

// Consent inputs are validated before persistence and defensively on read, so a typo'd scope or a
// malformed visibility can neither be stored nor crash visibleTo later.
export function validateConsentScopeKey(scopeKey: string): string {
  if (!/^(path|section|category):.+/.test(scopeKey)) {
    throw new Error(`Invalid consent scope_key (expected 'path:'|'section:'|'category:' prefix): ${scopeKey}`);
  }
  return scopeKey;
}

export function validateConsentVisibility(raw: unknown): ConsentVisibility {
  const v = (raw ?? {}) as Record<string, unknown>;
  const okDomains =
    v.domains === 'all' ||
    v.domains === 'asserting_only' ||
    (Array.isArray(v.domains) && v.domains.every((d) => typeof d === 'string'));
  const okHosts = v.hosts === 'all' || (Array.isArray(v.hosts) && v.hosts.every((h) => typeof h === 'string'));
  const okDerived =
    v.derived_only_across === undefined ||
    (Array.isArray(v.derived_only_across) && v.derived_only_across.every((d) => typeof d === 'string'));
  if (!okDomains || !okHosts || !okDerived) {
    throw new Error('Invalid consent visibility shape.');
  }
  return {
    domains: v.domains as ConsentVisibility['domains'],
    hosts: v.hosts as ConsentVisibility['hosts'],
    derived_only_across: (v.derived_only_across as PcDomain[] | undefined) ?? [],
  };
}
