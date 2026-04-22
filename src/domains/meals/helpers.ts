import type {
  FeedbackValue,
  GroceryPlanActionRecord,
  GroceryIntentRecord,
  GroceryPlanItemRecord,
  InventoryRecord,
  MealFeedbackRecord,
} from './types';
import type { LogFeedbackInput } from './types-extra';
import { canonicalizeIngredient, getCuratedMatchAliases, normalizeUnit } from './units';

export async function hashStableJson(value: unknown): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest))
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');
}

export function safeParse(value: string | null): unknown {
  if (!value) {
    return null;
  }

  let current: unknown = value;
  for (let depth = 0; depth < 2; depth += 1) {
    if (typeof current !== 'string') {
      break;
    }
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }

  return current;
}

export function stringifyJson(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

export function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return safeParse(value);
}

export function coerceRecordInput(value: unknown, errorMessage: string): Record<string, unknown> {
  const record = asRecord(parseJsonLike(value));
  if (!record) {
    throw new Error(errorMessage);
  }
  return record;
}

export function normalizeDayLabel(value: string | null): string | null {
  return value ? value.trim().toLowerCase() : null;
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

const NAME_MATCH_DROP_TOKENS = new Set([
  'bunch',
  'bunches',
  'clove',
  'cloves',
  'floret',
  'florets',
  'fresh',
  'head',
  'heads',
  'stick',
  'sticks',
]);

const MATCH_ALIAS_METADATA_KEYS = [
  'aliases',
  'match_aliases',
  'matchAliases',
  'ingredient_aliases',
  'ingredientAliases',
  'inventory_aliases',
  'inventoryAliases',
  'satisfies_ingredients',
  'satisfiesIngredients',
];

export function normalizeComparableText(value: string): string {
  return normalizeText(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeNameToken(token: string): string {
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('oes') && token.length > 3) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

export function buildNameMatchKeys(value: string, extraAliases: string[] = []): string[] {
  const variants = new Set<string>();
  const sources = [value, ...extraAliases];

  for (const source of sources) {
    if (!source.trim()) {
      continue;
    }

    variants.add(normalizeText(source));

    const comparable = normalizeComparableText(source);
    if (!comparable) {
      continue;
    }

    variants.add(comparable);

    const tokens = comparable.split(' ').map(singularizeNameToken).filter(Boolean);
    if (tokens.length === 0) {
      continue;
    }

    variants.add(tokens.join(' '));

    const coreTokens = tokens.filter((token) => !NAME_MATCH_DROP_TOKENS.has(token));
    if (coreTokens.length > 0) {
      variants.add(coreTokens.join(' '));
    }
  }

  return Array.from(variants).filter((entry) => entry.length > 0);
}

function extractMatchAliases(metadata: unknown): string[] {
  const record = asRecord(metadata);
  if (!record) {
    return [];
  }

  return MATCH_ALIAS_METADATA_KEYS.flatMap((key) => asStringArray(record[key]));
}

export function normalizeMealPreferences(input: Record<string, unknown> | string): Record<string, unknown> {
  const record = coerceRecordInput(input, 'Meal preferences payload must be an object.');
  return {
    ...record,
  };
}

export function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined));
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function asPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function asNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function clampInt(value: number | null | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeMealPlanDocument(input: unknown): {
  id?: string | null;
  weekStart: string;
  weekEnd: string | null;
  status: string | null;
  generatedAt: string | null;
  approvedAt: string | null;
  profileOwner: string | null;
  requirements: unknown;
  summary: unknown;
  sourceSnapshot: unknown;
  entries: Array<{
    id?: string | null;
    date: string | null;
    dayLabel: string | null;
    mealType: string;
    recipeId: string | null;
    recipeNameSnapshot: string;
    selectionStatus: string | null;
    serves: number | null;
    prepMinutes: number | null;
    totalMinutes: number | null;
    leftoversExpected: boolean;
    instructionsSnapshot: unknown;
    notes: Record<string, unknown> | null;
    status: string | null;
    cookedAt: string | null;
  }>;
} {
  const plan = coerceRecordInput(input, 'Meal plan payload must be an object.');

  const rawEntries = Array.isArray(plan.entries) ? plan.entries : Array.isArray(plan.meals) ? plan.meals : null;
  if (!rawEntries) {
    throw new Error('Meal plan payload must include entries or meals.');
  }

  const weekStart = asNonEmptyString(plan.weekStart ?? plan.week_start);
  if (!weekStart) {
    throw new Error('Meal plan payload must include weekStart.');
  }

  return {
    id: asNonEmptyString(plan.id),
    weekStart,
    weekEnd: asNullableString(plan.weekEnd ?? plan.week_end),
    status: asNullableString(plan.status ?? asRecord(plan.metadata)?.approval_status),
    generatedAt: asNullableString(plan.generatedAt ?? plan.generated_at),
    approvedAt: asNullableString(plan.approvedAt ?? plan.approved_at),
    profileOwner: asNullableString(plan.profileOwner ?? plan.profile_owner),
    requirements: plan.requirements ?? {},
    summary: plan.summary ?? {},
    sourceSnapshot: plan.sourceSnapshot ?? plan.source_snapshot ?? plan.meal_memory_snapshot ?? plan,
    entries: rawEntries.map((entry: unknown, index: number) => normalizeMealPlanEntry(entry, index)),
  };
}

export function normalizeMealPlanEntry(input: unknown, index: number) {
  const entry = asRecord(input);
  if (!entry) {
    throw new Error(`Meal plan entry at index ${index} must be an object.`);
  }

  const mealType = asNonEmptyString(entry.mealType ?? entry.meal_type);
  const recipeNameSnapshot = asNonEmptyString(entry.recipeNameSnapshot ?? entry.recipe_name);
  if (!mealType || !recipeNameSnapshot) {
    throw new Error(`Meal plan entry ${index} must include mealType and recipeNameSnapshot.`);
  }

  const metadata = asRecord(entry.metadata);
  const notes = compactObject({
    mise_en_place: entry.miseEnPlace ?? entry.mise_en_place ?? null,
    prep_notes: entry.prepNotes ?? entry.prep_notes ?? null,
    reheat_guidance: entry.reheatGuidance ?? entry.reheat_guidance ?? null,
    serving_notes: entry.servingNotes ?? entry.serving_notes ?? null,
    metadata: metadata ?? null,
  });

  return {
    id: asNonEmptyString(entry.id ?? metadata?.personal_domains_entry_id),
    date: asNullableString(entry.date),
    dayLabel: asNullableString(entry.dayLabel ?? entry.day),
    mealType,
    recipeId: asNullableString(entry.recipeId ?? entry.recipe_id),
    recipeNameSnapshot,
    selectionStatus: asNullableString(entry.selectionStatus ?? entry.selection_status),
    serves: asPositiveNumber(entry.serves),
    prepMinutes: asNonNegativeNumber(entry.prepMinutes ?? entry.prep_minutes),
    totalMinutes: asNonNegativeNumber(entry.totalMinutes ?? entry.total_minutes),
    leftoversExpected: Boolean(entry.leftoversExpected ?? entry.leftovers_expected),
    instructionsSnapshot: entry.instructionsSnapshot ?? entry.instructions ?? [],
    notes: Object.keys(notes).length > 0 ? notes : null,
    status: asNullableString(entry.status ?? metadata?.status),
    cookedAt: asNullableString(entry.cookedAt ?? metadata?.cooked_at),
  };
}

export function mapInventoryRow(row: {
  id: string;
  name: string;
  normalized_name: string | null;
  canonical_item_key: string | null;
  canonical_quantity: number | null;
  canonical_unit: string | null;
  canonical_confidence: number | null;
  status: string;
  source: string | null;
  confirmed_at: string | null;
  purchased_at: string | null;
  estimated_expiry: string | null;
  perishability: string | null;
  long_life_default: number | null;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  brand: string | null;
  cost_cad: number | null;
  metadata_json: string | null;
}): InventoryRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    canonicalItemKey: row.canonical_item_key,
    canonicalQuantity: row.canonical_quantity,
    canonicalUnit: row.canonical_unit,
    canonicalConfidence: row.canonical_confidence,
    status: row.status,
    source: row.source,
    confirmedAt: row.confirmed_at,
    purchasedAt: row.purchased_at,
    estimatedExpiry: row.estimated_expiry,
    perishability: row.perishability,
    longLifeDefault: Boolean(row.long_life_default),
    quantity: row.quantity,
    unit: row.unit,
    location: row.location,
    brand: row.brand,
    costCad: row.cost_cad,
    metadata: safeParse(row.metadata_json),
  };
}

export function mapGroceryPlanActionRow(row: {
  id: string;
  week_start: string;
  meal_plan_id: string | null;
  item_key: string;
  action_status: GroceryPlanActionRecord['actionStatus'];
  substitute_item_key: string | null;
  substitute_display_name: string | null;
  notes: string | null;
  metadata_json: string | null;
  source_agent: string | null;
  source_skill: string | null;
  session_id: string | null;
  confidence: number | null;
  source_type: string | null;
  created_at: string | null;
  updated_at: string | null;
}): GroceryPlanActionRecord {
  return {
    id: row.id,
    weekStart: row.week_start,
    mealPlanId: row.meal_plan_id,
    itemKey: row.item_key,
    actionStatus: row.action_status,
    substituteItemKey: row.substitute_item_key,
    substituteDisplayName: row.substitute_display_name,
    notes: row.notes,
    metadata: safeParse(row.metadata_json),
    sourceAgent: row.source_agent,
    sourceSkill: row.source_skill,
    sessionId: row.session_id,
    confidence: row.confidence,
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMealFeedbackRow(row: {
  id: string;
  meal_plan_id: string | null;
  meal_plan_entry_id: string | null;
  recipe_id: string;
  date: string;
  taste: FeedbackValue | null;
  difficulty: FeedbackValue | null;
  time_reality: FeedbackValue | null;
  repeat_again: FeedbackValue | null;
  family_acceptance: FeedbackValue | null;
  notes: string | null;
  submitted_by: string | null;
  source_agent: string | null;
  source_skill: string | null;
  session_id: string | null;
  confidence: number | null;
  source_type: string | null;
  created_at: string | null;
}): MealFeedbackRecord {
  return {
    id: row.id,
    mealPlanId: row.meal_plan_id,
    mealPlanEntryId: row.meal_plan_entry_id,
    recipeId: row.recipe_id,
    date: row.date,
    taste: row.taste,
    difficulty: row.difficulty,
    timeReality: row.time_reality,
    repeatAgain: row.repeat_again,
    familyAcceptance: row.family_acceptance,
    notes: row.notes,
    submittedBy: row.submitted_by,
    sourceAgent: row.source_agent,
    sourceSkill: row.source_skill,
    sessionId: row.session_id,
    confidence: row.confidence,
    sourceType: row.source_type,
    createdAt: row.created_at,
  };
}

export function mapGroceryIntentRow(row: {
  id: string;
  normalized_name: string;
  display_name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  status: string;
  target_window: string | null;
  meal_plan_id: string | null;
  metadata_json: string | null;
  source_agent: string | null;
  source_skill: string | null;
  session_id: string | null;
  confidence: number | null;
  source_type: string | null;
  created_at: string | null;
  updated_at: string | null;
}): GroceryIntentRecord {
  return {
    id: row.id,
    normalizedName: row.normalized_name,
    displayName: row.display_name,
    quantity: row.quantity,
    unit: row.unit,
    notes: row.notes,
    status: row.status,
    targetWindow: row.target_window,
    mealPlanId: row.meal_plan_id,
    metadata: safeParse(row.metadata_json),
    sourceAgent: row.source_agent,
    sourceSkill: row.source_skill,
    sessionId: row.session_id,
    confidence: row.confidence,
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeIngredient(
  ingredient: unknown,
  scale: number,
): {
  itemKey: string;
  name: string;
  normalizedName: string;
  canonicalItemKey: string | null;
  canonicalQuantity: number | null;
  canonicalUnit: string | null;
  quantity: number | null;
  unit: string | null;
  orderingPolicy: string;
  preferredBrands: string[];
  avoidBrands: string[];
  allowedSubstituteQueries: string[];
  blockedSubstituteTerms: string[];
} | null {
  const record = asRecord(ingredient);
  const name = asNonEmptyString(record?.item);
  if (!record || !name) {
    return null;
  }

  const quantity = typeof record.quantity === 'number' && Number.isFinite(record.quantity) ? Number(record.quantity) * scale : null;
  const canonical = canonicalizeIngredient({
    canonicalItem: asNullableString(record.canonical_item ?? record.canonicalItem),
    canonicalQuantity:
      typeof record.canonical_quantity === 'number' && Number.isFinite(record.canonical_quantity)
        ? Number(record.canonical_quantity) * scale
        : null,
    canonicalUnit: asNullableString(record.canonical_unit ?? record.canonicalUnit),
    metadata: record,
    name,
    quantity,
    unit: asNullableString(record.unit),
  });
  const unit = asNullableString(record.unit);
  return {
    itemKey: buildGroceryItemKey({
      canonicalItemKey: canonical.canonicalItemKey,
      canonicalUnit: canonical.canonicalUnit,
      normalizedName: normalizeText(name),
      unit,
    }),
    name,
    normalizedName: normalizeText(name),
    canonicalItemKey: canonical.canonicalItemKey,
    canonicalQuantity: canonical.canonicalQuantity,
    canonicalUnit: canonical.canonicalUnit,
    quantity,
    unit,
    orderingPolicy: asNonEmptyString(record.ordering_policy ?? record.orderingPolicy) ?? 'flexible_match',
    preferredBrands: asStringArray(record.brand_bias),
    avoidBrands: asStringArray(record.avoid_brands),
    allowedSubstituteQueries: mergeUniqueStrings(
      asStringArray(record.allowed_substitute_queries),
      getCuratedMatchAliases({
        canonicalItemKey: canonical.canonicalItemKey,
        explicitCanonicalItem: asNullableString(record.canonical_item ?? record.canonicalItem),
        metadata: record,
        name,
      }),
    ),
    blockedSubstituteTerms: asStringArray(record.blocked_substitute_terms),
  };
}

export function buildGroceryItemKey(input: {
  canonicalItemKey: string | null;
  canonicalUnit: string | null;
  normalizedName: string;
  unit: string | null;
}): string {
  if (input.canonicalItemKey && input.canonicalUnit) {
    return `${input.canonicalItemKey}::${normalizeText(input.canonicalUnit)}`;
  }
  if (input.canonicalItemKey) {
    return input.canonicalItemKey;
  }
  return `${input.normalizedName}::${normalizeText(input.unit ?? '')}`;
}

export function findInventoryMatch(
  input: {
    allowedSubstituteQueries?: string[];
    inventory: InventoryRecord[];
    name: string;
    longLifeDefaults?: string[];
    neededCanonicalItemKey?: string | null;
    neededCanonicalQuantity?: number | null;
    neededCanonicalUnit?: string | null;
    neededQuantity: number | null;
    neededUnit: string | null;
    normalizedName: string;
    planningWindowStart?: string | null;
  },
): {
  coverageSource: 'exact' | 'implicit' | null;
  status: GroceryPlanItemRecord['inventoryStatus'];
  missingCanonicalQuantity: number | null;
  missingQuantity: number | null;
  reasons: string[];
  uncertainty: string | null;
  note: string | null;
} {
  const activeInventory = input.inventory.filter((entry) => entry.status !== 'consumed' && entry.status !== 'removed');
  const requestedKeys = new Set(
    buildNameMatchKeys(input.name, [input.normalizedName, ...(input.allowedSubstituteQueries ?? [])]),
  );
  const item =
    (input.neededCanonicalItemKey
      ? activeInventory.find((entry) => entry.canonicalItemKey === input.neededCanonicalItemKey)
      : null) ??
    activeInventory.find((entry) => entry.normalizedName === input.normalizedName) ??
    activeInventory.find((entry) => {
      const entryKeys = buildNameMatchKeys(entry.name, [
        entry.normalizedName ?? '',
        ...extractMatchAliases(entry.metadata),
        ...getCuratedMatchAliases({
          canonicalItemKey: entry.canonicalItemKey,
          metadata: entry.metadata,
          name: entry.name,
        }),
      ]);
      return entryKeys.some((key) => requestedKeys.has(key));
    });

  if (!item) {
    return {
      coverageSource: null,
      status: 'missing',
      missingCanonicalQuantity: input.neededCanonicalQuantity ?? null,
      missingQuantity: input.neededQuantity,
      reasons: ['Missing from inventory'],
      uncertainty: null,
      note: null,
    };
  }

  if (
    input.neededCanonicalItemKey &&
    input.neededCanonicalQuantity != null &&
    input.neededCanonicalUnit &&
    item.canonicalItemKey === input.neededCanonicalItemKey &&
    item.canonicalQuantity != null &&
    item.canonicalUnit &&
    normalizeText(item.canonicalUnit) === normalizeText(input.neededCanonicalUnit)
  ) {
    if (item.canonicalQuantity >= input.neededCanonicalQuantity) {
      return {
        coverageSource: 'exact',
        status: 'sufficient',
        missingCanonicalQuantity: 0,
        missingQuantity: 0,
        reasons: ['Canonical inventory quantity is sufficient'],
        uncertainty: null,
        note: null,
      };
    }

      return {
        coverageSource: 'exact',
        status: 'partial',
      missingCanonicalQuantity: Math.max(0, input.neededCanonicalQuantity - item.canonicalQuantity),
      missingQuantity: Math.max(0, input.neededCanonicalQuantity - item.canonicalQuantity),
      reasons: ['Canonical inventory quantity is below the planned amount'],
      uncertainty: null,
      note: `Inventory has ${item.canonicalQuantity} ${item.canonicalUnit}; plan needs ${input.neededCanonicalQuantity} ${input.neededCanonicalUnit}.`,
    };
  }

  if (input.neededQuantity == null || !input.neededUnit) {
    return {
      coverageSource: null,
      status: 'present_without_quantity',
      missingCanonicalQuantity: input.neededCanonicalQuantity ?? null,
      missingQuantity: input.neededQuantity,
      reasons: ['Inventory present but ingredient quantity is not fully specified'],
      uncertainty: 'ingredient_quantity_unknown',
      note: item.quantity == null ? 'Inventory is tracked by presence only for this item.' : null,
    };
  }

  const implicitCoverage = resolveImplicitCoverageFromRecentPurchase({
    item,
    longLifeDefaults: input.longLifeDefaults ?? [],
    planningWindowStart: input.planningWindowStart ?? null,
    requestedCanonicalItemKey: input.neededCanonicalItemKey ?? null,
    requestedName: input.name,
    requestedNormalizedName: input.normalizedName,
  });
  if (implicitCoverage) {
    return {
      coverageSource: 'implicit',
      status: 'sufficient',
      missingCanonicalQuantity: 0,
      missingQuantity: 0,
      reasons: [implicitCoverage.reason],
      uncertainty: null,
      note: implicitCoverage.note,
    };
  }

  if (item.quantity == null || !item.unit) {
    return {
      coverageSource: null,
      status: 'present_without_quantity',
      missingCanonicalQuantity: input.neededCanonicalQuantity ?? null,
      missingQuantity: input.neededQuantity,
      reasons: ['Inventory is present but quantity is unknown; assume buy to stay safe'],
      uncertainty: 'inventory_quantity_unknown',
      note: 'Inventory quantity is unknown; plan recommends buying the full amount.',
    };
  }

  if (normalizeText(item.unit) !== normalizeText(input.neededUnit)) {
    return {
      coverageSource: null,
      status: 'present_without_quantity',
      missingCanonicalQuantity: input.neededCanonicalQuantity ?? null,
      missingQuantity: input.neededQuantity,
      reasons: ['Inventory unit does not match recipe unit; assume buy to avoid under-ordering'],
      uncertainty: 'inventory_unit_mismatch',
      note: `Inventory unit ${item.unit} did not match required unit ${input.neededUnit}.`,
    };
  }

  if (item.quantity >= input.neededQuantity) {
    return {
      coverageSource: 'exact',
      status: 'sufficient',
      missingCanonicalQuantity: 0,
      missingQuantity: 0,
      reasons: ['Inventory quantity is sufficient'],
      uncertainty: null,
      note: null,
    };
  }

  return {
    coverageSource: 'exact',
    status: 'partial',
    missingCanonicalQuantity: input.neededCanonicalQuantity ?? null,
    missingQuantity: Math.max(0, input.neededQuantity - item.quantity),
    reasons: ['Inventory quantity is below the planned amount'],
    uncertainty: null,
    note: `Inventory has ${item.quantity} ${item.unit}; plan needs ${input.neededQuantity} ${input.neededUnit}.`,
  };
}

const DURABLE_PANTRY_COVERAGE_WINDOW_DAYS = 56;
const FROZEN_COVERAGE_WINDOW_DAYS = 21;
const FRESH_PERISHABILITY_TOKENS = ['fresh', 'produce', 'refrigerated', 'fridge', 'dairy', 'protein', 'meat', 'bread', 'bakery'];
const DURABLE_PANTRY_TOKENS = ['pantry', 'shelf', 'shelf_stable', 'shelf-stable', 'dry', 'condiment', 'spice', 'seasoning'];
const FROZEN_TOKENS = ['frozen', 'freezer'];

function resolveImplicitCoverageFromRecentPurchase(input: {
  item: InventoryRecord;
  longLifeDefaults: string[];
  planningWindowStart: string | null;
  requestedCanonicalItemKey: string | null;
  requestedName: string;
  requestedNormalizedName: string;
}): { note: string; reason: string } | null {
  if (input.item.quantity != null) {
    return null;
  }

  const latestEvidence = latestInventoryEvidenceTimestamp(input.item);
  if (!latestEvidence) {
    return null;
  }

  if (isExpiredBeforePlanningWindow(input.item.estimatedExpiry, input.planningWindowStart)) {
    return null;
  }

  const requestedNameForDefaults =
    input.requestedCanonicalItemKey ?? input.item.canonicalItemKey ?? input.requestedNormalizedName ?? normalizeText(input.requestedName);

  if (
    isDurablePantryItem({
      item: input.item,
      longLifeDefaults: input.longLifeDefaults,
      requestedNameForDefaults,
    }) &&
    isEvidenceWithinWindow(latestEvidence, DURABLE_PANTRY_COVERAGE_WINDOW_DAYS, input.planningWindowStart)
  ) {
    return {
      reason: 'Recent durable pantry confirmation still covers the planned amount',
      note: `Assuming coverage from recent durable inventory confirmation on ${latestEvidence.slice(0, 10)}.`,
    };
  }

  if (
    isFrozenItem(input.item) &&
    isEvidenceWithinWindow(latestEvidence, FROZEN_COVERAGE_WINDOW_DAYS, input.planningWindowStart)
  ) {
    return {
      reason: 'Recent frozen-item confirmation still covers the planned amount',
      note: `Assuming coverage from recent frozen inventory confirmation on ${latestEvidence.slice(0, 10)}.`,
    };
  }

  return null;
}

function latestInventoryEvidenceTimestamp(item: InventoryRecord): string | null {
  const timestamps = [item.confirmedAt, item.purchasedAt]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .sort((left, right) => left.localeCompare(right));
  return timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
}

function isEvidenceWithinWindow(
  timestamp: string,
  windowDays: number,
  planningWindowStart: string | null,
): boolean {
  const evidenceMs = parseTimestampToMs(timestamp);
  if (evidenceMs == null) {
    return false;
  }
  const planningMs = parseTimestampToMs(planningWindowStart);
  const comparisonMs = planningMs ?? Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return comparisonMs - evidenceMs <= windowMs;
}

function isExpiredBeforePlanningWindow(expiry: string | null, planningWindowStart: string | null): boolean {
  if (!expiry) {
    return false;
  }
  const expiryMs = parseTimestampToMs(expiry);
  if (expiryMs == null) {
    return false;
  }
  const planningMs = parseTimestampToMs(planningWindowStart);
  if (planningMs == null) {
    return expiryMs < Date.now();
  }
  return expiryMs < planningMs;
}

function parseTimestampToMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDurablePantryItem(input: {
  item: InventoryRecord;
  longLifeDefaults: string[];
  requestedNameForDefaults: string;
}): boolean {
  if (input.item.longLifeDefault) {
    return true;
  }
  if (matchesLongLifeDefault(input.requestedNameForDefaults, input.longLifeDefaults)) {
    return true;
  }
  const perishability = normalizeText(input.item.perishability ?? '');
  return DURABLE_PANTRY_TOKENS.some((token) => perishability.includes(token));
}

function isFrozenItem(item: InventoryRecord): boolean {
  const perishability = normalizeText(item.perishability ?? '');
  if (FRESH_PERISHABILITY_TOKENS.some((token) => perishability.includes(token))) {
    return false;
  }
  return FROZEN_TOKENS.some((token) => perishability.includes(token));
}

export function matchesLongLifeDefault(normalizedName: string, longLifeDefaults: string[]): boolean {
  const requestedKeys = new Set(buildNameMatchKeys(normalizedName));
  return longLifeDefaults.some((entry) => buildNameMatchKeys(entry).some((key) => requestedKeys.has(key)));
}

export function mergeUniqueStrings(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].filter((value) => value.trim().length > 0)));
}

export function resolveInventoryStatus(
  current: GroceryPlanItemRecord['inventoryStatus'],
  incoming: GroceryPlanItemRecord['inventoryStatus'],
): GroceryPlanItemRecord['inventoryStatus'] {
  const order: Array<GroceryPlanItemRecord['inventoryStatus']> = [
    'missing',
    'partial',
    'present_without_quantity',
    'intent',
    'check_pantry',
    'pantry_default',
    'sufficient',
  ];
  return order.indexOf(incoming) < order.indexOf(current) ? incoming : current;
}

export function upsertGroceryPlanItem(
  aggregate: Map<string, GroceryPlanItemRecord>,
  item: GroceryPlanItemRecord,
) {
  const key = item.itemKey;
  const current = aggregate.get(key);
  if (!current) {
    aggregate.set(key, {
      ...item,
      quantity: item.quantity ?? null,
      preferredBrands: [...item.preferredBrands],
      avoidBrands: [...item.avoidBrands],
      allowedSubstituteQueries: [...item.allowedSubstituteQueries],
      blockedSubstituteTerms: [...item.blockedSubstituteTerms],
      sourceRecipeIds: [...item.sourceRecipeIds],
      sourceRecipeNames: [...item.sourceRecipeNames],
      reasons: [...item.reasons],
    });
    return;
  }

  aggregate.set(key, {
    ...current,
    canonicalQuantity:
      current.canonicalQuantity == null || item.canonicalQuantity == null
        ? current.canonicalQuantity ?? item.canonicalQuantity
        : current.canonicalQuantity + item.canonicalQuantity,
    quantity:
      current.quantity == null || item.quantity == null
        ? current.quantity ?? item.quantity
        : normalizeUnit(current.unit) === normalizeUnit(item.unit)
          ? current.quantity + item.quantity
          : current.canonicalQuantity != null &&
              item.canonicalQuantity != null &&
              current.canonicalUnit &&
              item.canonicalUnit &&
              normalizeText(current.canonicalUnit) === normalizeText(item.canonicalUnit)
            ? current.canonicalQuantity + item.canonicalQuantity
            : current.quantity,
    unit:
      normalizeUnit(current.unit) === normalizeUnit(item.unit)
        ? current.unit ?? item.unit
        : current.canonicalUnit != null &&
            item.canonicalUnit != null &&
            normalizeText(current.canonicalUnit) === normalizeText(item.canonicalUnit)
          ? current.canonicalUnit
          : current.unit ?? item.unit,
    preferredBrands: mergeUniqueStrings(current.preferredBrands, item.preferredBrands),
    avoidBrands: mergeUniqueStrings(current.avoidBrands, item.avoidBrands),
    allowedSubstituteQueries: mergeUniqueStrings(current.allowedSubstituteQueries, item.allowedSubstituteQueries),
    blockedSubstituteTerms: mergeUniqueStrings(current.blockedSubstituteTerms, item.blockedSubstituteTerms),
    sourceRecipeIds: mergeUniqueStrings(current.sourceRecipeIds, item.sourceRecipeIds),
    sourceRecipeNames: mergeUniqueStrings(current.sourceRecipeNames, item.sourceRecipeNames),
    reasons: mergeUniqueStrings(current.reasons, item.reasons),
    uncertainty: current.uncertainty ?? item.uncertainty,
    note: current.note ?? item.note,
    inventoryStatus: resolveInventoryStatus(current.inventoryStatus, item.inventoryStatus),
  });
}

export function deriveMealStatus(currentStatus: string, input: LogFeedbackInput): string {
  const isBadExperience = input.repeatAgain === 'bad' || input.taste === 'bad';
  if (isBadExperience) {
    return 'retired';
  }

  if (currentStatus === 'trial' && input.repeatAgain === 'good') {
    return 'proven';
  }

  return currentStatus;
}

export function mergeNotes(existingNotes: unknown, incomingNote?: string | null): string[] {
  const notes = Array.isArray(existingNotes) ? existingNotes.map(String) : [];
  if (incomingNote?.trim()) {
    notes.push(incomingNote.trim());
  }
  return notes;
}
