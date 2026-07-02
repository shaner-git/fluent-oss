import type { PersonFact, PersonFactKind } from '../../personal-context';
import { asRecord, normalizeText } from './helpers';

export const TIER1_KIND_TO_CORE_RULES_FIELD = {
  allergy: 'allergies',
  hard_avoid: 'hard_avoids',
  dietary_pattern: 'dietary_constraints',
  anti_favorite: 'dislikes',
  taste_pref: 'favorite_foods',
} as const satisfies Record<Extract<PersonFactKind, 'allergy' | 'hard_avoid' | 'dietary_pattern' | 'anti_favorite' | 'taste_pref'>, string>;

const OWNED_CORE_RULE_FIELDS = Object.values(TIER1_KIND_TO_CORE_RULES_FIELD);

export function overlayPersonFactsOntoCoreRules(
  coreRules: Record<string, unknown>,
  personFacts: PersonFact[],
): Record<string, unknown> {
  const next = { ...coreRules };
  for (const key of Object.keys(next)) {
    if (key.endsWith('_confirmed_at') && isTier1ConfirmedAtKey(key)) {
      delete next[key];
    }
  }
  for (const field of OWNED_CORE_RULE_FIELDS) {
    next[field] = [];
  }

  const rebuilt: Record<(typeof OWNED_CORE_RULE_FIELDS)[number], string[]> = {
    allergies: [],
    hard_avoids: [],
    dietary_constraints: [],
    dislikes: [],
    favorite_foods: [],
  };

  for (const fact of personFacts) {
    if (!isTier1FactKind(fact.kind)) continue;
    if (fact.kind === 'taste_pref' && (fact.value as { polarity?: unknown }).polarity !== 'like') continue;
    const label = asRecord(fact.value)?.label;
    if (typeof label !== 'string' || !label.trim()) continue;
    rebuilt[TIER1_KIND_TO_CORE_RULES_FIELD[fact.kind]].push(label);
  }

  for (const field of OWNED_CORE_RULE_FIELDS) {
    next[field] = stableStringList(rebuilt[field]);
  }

  // Non-owned core_rules fields are left untouched. soft_avoids in particular is merged by the planner into
  // dislikedFoods alongside dislikes (preference-model.ts), but Strategy A only makes the 5 owned fields
  // person_facts-authoritative; everything else stays as legacy core_rules (masked drift, like spice_preference /
  // preferred_cuisines). A still-active anti_favorite label may appear in both dislikes and a legacy soft_avoids
  // entry; preference-model normalizeList dedupes the union, so leaving soft_avoids alone is behavior-neutral and
  // keeps the overlay a clean projection of exactly the fields the clear-list guard enumerates.
  return next;
}

function stableStringList(values: string[]): string[] {
  const byNormalized = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized && !byNormalized.has(normalized)) {
      byNormalized.set(normalized, value.trim());
    }
  }
  return Array.from(byNormalized.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function isTier1FactKind(kind: PersonFactKind): kind is keyof typeof TIER1_KIND_TO_CORE_RULES_FIELD {
  return Object.prototype.hasOwnProperty.call(TIER1_KIND_TO_CORE_RULES_FIELD, kind);
}

function isTier1ConfirmedAtKey(key: string): boolean {
  return (
    key === 'allergies_confirmed_at' ||
    key === 'hard_avoids_confirmed_at' ||
    key === 'dietary_constraints_confirmed_at' ||
    key === 'dislikes_confirmed_at' ||
    key === 'favorite_foods_confirmed_at'
  );
}
