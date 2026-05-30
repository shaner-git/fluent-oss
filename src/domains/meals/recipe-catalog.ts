import {
  asNonEmptyString,
  asNonNegativeNumber,
  asRecord,
  asStringArray,
  normalizeText,
} from './helpers';
import type {
  MealMemoryRecord,
  MealRecipeRecord,
  RecipeCatalogGapRecord,
  RecipeCatalogItemSummaryRecord,
  RecipeCatalogSummaryRecord,
  RecipePlanningConfidence,
  RecipePlanningLevel,
  RecipePlanningMetadataRecord,
} from './types';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const FRESH_SENSITIVE_TERMS = [
  'avocado',
  'berries',
  'cilantro',
  'fish',
  'fresh herbs',
  'lettuce',
  'salad',
  'salmon',
  'spinach',
];

export function summarizeRecipeCatalog(input: {
  mealType?: string;
  mealMemory?: MealMemoryRecord[];
  recipes: MealRecipeRecord[];
  status?: string;
}): {
  items: RecipeCatalogItemSummaryRecord[];
  summary: RecipeCatalogSummaryRecord;
} {
  const memoryByRecipeId = new Map((input.mealMemory ?? []).map((entry) => [entry.recipeId, entry]));
  const items = input.recipes.map((recipe) =>
    summarizeRecipeForCatalog(recipe, memoryByRecipeId.get(recipe.id) ?? null),
  );
  const byMealType = countBy(items, (item) => item.mealType);
  const byConfidence = {
    proven: 0,
    trial: 0,
    untested: 0,
    retired: 0,
  } satisfies Record<RecipePlanningConfidence, number>;
  const tagCounts: Record<string, number> = {};

  for (const item of items) {
    byConfidence[item.planning.confidence] += 1;
    for (const tag of item.planning.planningTags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  const status = input.status ?? 'active';
  const gaps = status === 'active' ? detectRecipeCatalogGaps(items, input.mealType) : [];
  return {
    items,
    summary: {
      byConfidence,
      byMealType,
      gapCount: gaps.length,
      gaps,
      plannerReadyCount: items.filter((item) => item.planning.confidence !== 'retired').length,
      recipeCount: items.length,
      status,
      tagCounts,
    },
  };
}

export function summarizeRecipeForCatalog(
  recipe: MealRecipeRecord,
  memory: MealMemoryRecord | null,
): RecipeCatalogItemSummaryRecord {
  return {
    id: recipe.id,
    mealType: recipe.mealType,
    name: recipe.name,
    planning: deriveRecipePlanningMetadata(recipe, memory),
    slug: recipe.slug,
    status: recipe.status,
  };
}

export function deriveRecipePlanningMetadata(
  recipe: MealRecipeRecord,
  memory: MealMemoryRecord | null,
): RecipePlanningMetadataRecord {
  const raw = asRecord(recipe.raw) ?? {};
  const tags = normalizedTags(raw);
  const mealJobs = normalizedMealJobs(raw, recipe.mealType, tags);
  const activeMinutes = asNonNegativeNumber(raw.active_time ?? raw.activeTime);
  const totalMinutes = asNonNegativeNumber(raw.total_time ?? raw.totalTime);
  const cleanupLevel = readPlanningLevel(raw.cleanup_burden ?? raw.cleanupLevel ?? raw.cleanup_level) ??
    inferCleanupLevel(raw, activeMinutes, totalMinutes);
  const costLevel = inferCostLevel(asNonNegativeNumber(raw.cost_per_serving_cad ?? raw.costPerServingCad));
  const familyFit = readBoolean(raw.family_fit ?? raw.familyFit ?? raw.kid_friendly) || hasAny(tags, ['family', 'kid friendly', 'kids']);
  const batchFit = readBoolean(raw.batch_fit ?? raw.batchFit ?? raw.leftovers_fit ?? raw.leftoversFit) ||
    hasAny(tags, ['batch', 'leftovers', 'meal prep']) ||
    ((asNonNegativeNumber(raw.servings) ?? 0) >= 4 && recipe.mealType !== 'snack');
  const freezerFit = readBoolean(raw.freezer_friendly ?? raw.freezerFriendly) || hasAny(tags, ['freezer', 'freezer friendly']);
  const lunchFit = recipe.mealType === 'lunch' || hasAny(tags, ['lunch', 'leftovers', 'meal prep']);
  const highProtein = inferHighProtein(raw, recipe.name, tags);
  const pantryHeavy = inferPantryHeavy(raw, tags);
  const freshSensitive = inferFreshSensitive(raw, tags);
  const weeknightFit = readBoolean(raw.weeknight_fit ?? raw.weeknightFit) ||
    hasAny(tags, ['weeknight', 'quick', 'easy']) ||
    (cleanupLevel !== 'high' && (activeMinutes ?? 999) <= 30 && (totalMinutes ?? 999) <= 45);
  const repeatSoonFit = memory?.status === 'proven' || hasAny(tags, ['repeat', 'favorite', 'go-to']);
  const confidence = recipe.status === 'retired' || memory?.status === 'retired'
    ? 'retired'
    : memory?.status === 'proven' || memory?.status === 'trial'
      ? memory.status
      : 'untested';
  const planningTags = Array.from(
    new Set([
      ...tags,
      ...mealJobs,
      weeknightFit ? 'weeknight' : null,
      familyFit ? 'family' : null,
      batchFit ? 'batch' : null,
      freezerFit ? 'freezer-friendly' : null,
      highProtein ? 'high-protein' : null,
      pantryHeavy ? 'pantry-heavy' : null,
      freshSensitive ? 'fresh-sensitive' : null,
      confidence,
    ].filter((value): value is string => Boolean(value))),
  ).sort();

  return {
    activeMinutes,
    batchFit,
    cleanupLevel,
    confidence,
    costLevel,
    familyFit,
    freezerFit,
    freshSensitive,
    highProtein,
    lunchFit,
    mealJobs,
    pantryHeavy,
    planningTags,
    repeatSoonFit,
    totalMinutes,
    weeknightFit,
  };
}

function detectRecipeCatalogGaps(items: RecipeCatalogItemSummaryRecord[], focusMealType?: string): RecipeCatalogGapRecord[] {
  const activeItems = items.filter((item) => item.status === 'active' && item.planning.confidence !== 'retired');
  const gaps: RecipeCatalogGapRecord[] = [];
  const mealTypesToAssess = focusMealType ? [focusMealType] : [...MEAL_TYPES];

  if (activeItems.length === 0) {
    gaps.push({
      id: 'no-active-recipes',
      label: 'No active recipes',
      mealType: null,
      rationale: 'Fluent cannot build a useful meal plan without active recipes.',
      severity: 'high',
      suggestedAction: 'Add or import a few starter recipes before planning the week.',
    });
    return gaps;
  }

  for (const mealType of mealTypesToAssess) {
    const count = activeItems.filter((item) => item.mealType === mealType).length;
    if (count === 0) {
      gaps.push({
        id: `missing-${mealType}-recipes`,
        label: `No ${mealType} recipes`,
        mealType,
        rationale: `The catalog has no active ${mealType} recipes, so ${mealType} planning will be skipped or repetitive.`,
        severity: mealType === 'dinner' || mealType === 'lunch' ? 'high' : 'medium',
        suggestedAction: `Add 2-3 ${mealType} recipes that match normal household routines.`,
      });
    } else if (count < 2 && (mealType === 'dinner' || mealType === 'lunch')) {
      gaps.push({
        id: `thin-${mealType}-recipes`,
        label: `Thin ${mealType} coverage`,
        mealType,
        rationale: `Only ${count} active ${mealType} recipe is available, so plans will have weak variety.`,
        severity: 'medium',
        suggestedAction: `Add or import more ${mealType} recipes before relying on varied weekly plans.`,
      });
    }
  }

  if ((!focusMealType || focusMealType === 'dinner') && activeItems.filter((item) => item.mealType === 'dinner' && item.planning.weeknightFit).length < 2) {
    gaps.push({
      id: 'thin-weeknight-dinners',
      label: 'Thin weeknight dinner coverage',
      mealType: 'dinner',
      rationale: 'The catalog has fewer than two active dinners that look quick enough for a normal weeknight.',
      severity: 'high',
      suggestedAction: 'Add two quick dinners with active time, cleanup, and family-fit metadata.',
    });
  }

  if ((!focusMealType || focusMealType === 'lunch') && activeItems.filter((item) => item.planning.lunchFit).length < 2) {
    gaps.push({
      id: 'thin-lunch-friendly-recipes',
      label: 'Thin lunch-friendly coverage',
      mealType: 'lunch',
      rationale: 'Few recipes are marked or inferred as lunch-friendly, leftover-friendly, or meal-prep friendly.',
      severity: 'medium',
      suggestedAction: 'Add quick lunches or mark leftover-friendly dinners as lunch-capable.',
    });
  }

  if (activeItems.filter((item) => item.planning.batchFit).length === 0) {
    gaps.push({
      id: 'no-batch-recipes',
      label: 'No batch or leftover anchors',
      mealType: null,
      rationale: 'No active recipe looks suitable for batch cooking or planned leftovers.',
      severity: 'medium',
      suggestedAction: 'Add one batch-friendly recipe or mark a reliable dinner as leftover-friendly.',
    });
  }

  if (activeItems.filter((item) => item.planning.confidence === 'proven').length === 0) {
    gaps.push({
      id: 'no-proven-recipes',
      label: 'No proven recipes',
      mealType: null,
      rationale: 'All active recipes are untested or trial recipes, so repeat confidence is low.',
      severity: 'medium',
      suggestedAction: 'Cook and rate a few recipes, or mark known reliable recipes as proven through feedback.',
    });
  }

  return gaps;
}

function normalizedTags(raw: Record<string, unknown>): string[] {
  return Array.from(
    new Set([
      ...asStringArray(raw.tags),
      ...asStringArray(raw.planning_tags ?? raw.planningTags),
    ].map((tag) => normalizeText(tag))),
  ).sort();
}

function normalizedMealJobs(raw: Record<string, unknown>, mealType: string, tags: string[]): string[] {
  const explicitJobs = asStringArray(raw.meal_jobs ?? raw.mealJobs).map((job) => normalizeText(job));
  const jobs = new Set([mealType, ...explicitJobs]);
  if (hasAny(tags, ['weeknight', 'quick'])) jobs.add('weeknight');
  if (hasAny(tags, ['batch', 'leftovers', 'meal prep'])) jobs.add('batch');
  if (hasAny(tags, ['family', 'kid friendly', 'kids'])) jobs.add('family');
  if (hasAny(tags, ['lunch', 'leftovers'])) jobs.add('lunch');
  return Array.from(jobs).sort();
}

function readPlanningLevel(value: unknown): RecipePlanningLevel | null {
  const normalized = asNonEmptyString(value);
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return null;
}

function inferCleanupLevel(raw: Record<string, unknown>, activeMinutes: number | null, totalMinutes: number | null): RecipePlanningLevel {
  const instructionCount = Array.isArray(raw.instructions) ? raw.instructions.length : 0;
  if ((activeMinutes ?? 999) <= 20 && instructionCount <= 4) return 'low';
  if ((activeMinutes ?? 0) > 40 || (totalMinutes ?? 0) > 75 || instructionCount > 8) return 'high';
  return 'medium';
}

function inferCostLevel(cost: number | null): RecipePlanningLevel {
  if (cost == null) return 'unknown';
  if (cost <= 5) return 'low';
  if (cost <= 10) return 'medium';
  return 'high';
}

function inferHighProtein(raw: Record<string, unknown>, recipeName: string, tags: string[]): boolean {
  const macros = asRecord(raw.macros);
  const protein = asNonNegativeNumber(macros?.protein_g ?? macros?.proteinG) ?? 0;
  const name = normalizeText(recipeName);
  return (
    protein >= 25 ||
    hasAny(tags, ['high protein', 'protein']) ||
    ['chicken', 'salmon', 'turkey', 'beef', 'egg', 'eggs', 'greek yogurt', 'tofu'].some((term) =>
      name.includes(term),
    )
  );
}

function inferPantryHeavy(raw: Record<string, unknown>, tags: string[]): boolean {
  if (hasAny(tags, ['pantry', 'pantry heavy', 'shelf stable'])) return true;
  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  if (ingredients.length === 0) return false;
  const pantryCount = ingredients.filter((entry) => {
    const ingredient = asRecord(entry);
    return asNonEmptyString(ingredient?.ordering_policy ?? ingredient?.orderingPolicy) === 'pantry_item';
  }).length;
  return pantryCount / ingredients.length >= 0.5;
}

function inferFreshSensitive(raw: Record<string, unknown>, tags: string[]): boolean {
  if (hasAny(tags, ['fresh sensitive', 'fresh-sensitive'])) return true;
  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  return ingredients.some((entry) => {
    const ingredient = asRecord(entry);
    const name = normalizeText(asNonEmptyString(ingredient?.item) ?? '');
    return FRESH_SENSITIVE_TERMS.some((term) => name.includes(term));
  });
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function hasAny(values: string[], targets: string[]): boolean {
  return targets.some((target) => values.includes(normalizeText(target)));
}

function countBy<T>(items: T[], resolveKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = resolveKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
