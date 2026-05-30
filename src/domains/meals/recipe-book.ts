import {
  asNonEmptyString,
  asNonNegativeNumber,
  asRecord,
  asStringArray,
  normalizeText,
} from './helpers';
import { deriveMealsPlanningPreferenceProfile } from './preference-model';
import { summarizeRecipeCatalog } from './recipe-catalog';
import type {
  InventoryRecord,
  MealMemoryRecord,
  MealPreferencesRecord,
  MealRecipeRecord,
  RecipeBookItemRecord,
  RecipeBookOnboardingRecord,
  RecipeBookSuggestedActionRecord,
  RecipeBookWhyShownRecord,
} from './types';

const RECIPE_BOOK_ACTIONS: RecipeBookSuggestedActionRecord[] = [
  {
    effect: 'Adds recipe-specific trial evidence without saying the household already likes it.',
    evidenceScope: 'recipe_evidence',
    id: 'want_to_try',
    label: 'Want to try',
    toolName: 'meals_apply_recipe_book_action',
  },
  {
    effect: 'Marks this recipe as explicit positive recipe evidence.',
    evidenceScope: 'recipe_evidence',
    id: 'favorite',
    label: 'Favorite',
    toolName: 'meals_apply_recipe_book_action',
  },
  {
    effect: 'Retires this recipe without creating broad hard avoids or allergy claims.',
    evidenceScope: 'recipe_evidence',
    id: 'not_for_us',
    label: 'Not for us',
    toolName: 'meals_apply_recipe_book_action',
  },
  {
    effect: 'Returns a one-week planning intent; it is not saved as a durable food preference.',
    evidenceScope: 'planning_intent',
    id: 'pin_to_week',
    label: 'Pin to week',
    toolName: 'meals_apply_recipe_book_action',
  },
];

const SHELVES = [
  { id: 'weeknight', label: 'Weeknight', matches: (item: RecipeBookItemRecord) => item.planning.weeknightFit },
  { id: 'family', label: 'Family', matches: (item: RecipeBookItemRecord) => item.planning.familyFit },
  { id: 'solo_or_two', label: 'Solo or two', matches: (item: RecipeBookItemRecord) => item.householdFit.some((fit) => fit === 'solo' || fit === 'two') },
  { id: 'lunch', label: 'Lunch', matches: (item: RecipeBookItemRecord) => item.planning.lunchFit },
  { id: 'batch', label: 'Batch', matches: (item: RecipeBookItemRecord) => item.planning.batchFit },
  { id: 'pantry_friendly', label: 'Pantry-friendly', matches: (item: RecipeBookItemRecord) => item.planning.pantryHeavy },
  { id: 'high_protein', label: 'High-protein', matches: (item: RecipeBookItemRecord) => item.planning.highProtein },
  { id: 'low_cleanup', label: 'Low cleanup', matches: (item: RecipeBookItemRecord) => item.planning.cleanupLevel === 'low' },
] as const;

export function buildRecipeBookOnboarding(input: {
  inventory: InventoryRecord[];
  mealMemory: MealMemoryRecord[];
  preferences: MealPreferencesRecord;
  recipes: MealRecipeRecord[];
}): RecipeBookOnboardingRecord {
  const catalog = summarizeRecipeCatalog({
    mealMemory: input.mealMemory,
    recipes: input.recipes,
    status: 'active',
  });
  const profile = deriveMealsPlanningPreferenceProfile(input.preferences.raw);
  const gapMealTypes = new Set(catalog.summary.gaps.map((gap) => gap.mealType).filter((value): value is string => Boolean(value)));
  const pantryNames = new Set(input.inventory.map((item) => normalizeText(item.name)).filter(Boolean));

  const visibleCatalogItems = catalog.items.filter((item) => item.status === 'active' && item.planning.confidence !== 'retired');
  const items = visibleCatalogItems.map<RecipeBookItemRecord>((catalogItem) => {
    const recipe = input.recipes.find((entry) => entry.id === catalogItem.id);
    const raw = asRecord(recipe?.raw) ?? {};
    const householdFit = deriveHouseholdFit(raw, catalogItem.planning.familyFit);
    const whyShown = deriveWhyShown({
      gapMealTypes,
      pantryNames,
      profile,
      raw,
      recipeName: catalogItem.name,
      item: catalogItem,
    });
    const shelfIds = SHELVES
      .filter((shelf) => shelf.matches({
        id: catalogItem.id,
        householdFit,
        learningStatus: catalogItem.planning.confidence,
        mealType: catalogItem.mealType,
        name: catalogItem.name,
        planning: catalogItem.planning,
        shelfIds: [],
        suggestedActions: RECIPE_BOOK_ACTIONS,
        whyShown,
      }))
      .map((shelf) => shelf.id);

    return {
      id: catalogItem.id,
      householdFit,
      learningStatus: catalogItem.planning.confidence,
      mealType: catalogItem.mealType,
      name: catalogItem.name,
      planning: catalogItem.planning,
      shelfIds,
      suggestedActions: RECIPE_BOOK_ACTIONS,
      whyShown,
    };
  });

  const shelves = SHELVES
    .map((shelf) => ({
      id: shelf.id,
      label: shelf.label,
      recipeIds: items.filter((item) => item.shelfIds.includes(shelf.id)).map((item) => item.id).slice(0, 12),
    }))
    .filter((shelf) => shelf.recipeIds.length > 0);

  return {
    actions: RECIPE_BOOK_ACTIONS,
    catalog: catalog.summary,
    generatedAt: new Date().toISOString(),
    hostGuidance: {
      copyGuardrails: [
        'Recipe-book browsing is evidence, not confirmed household preference.',
        'Say "this recipe is marked favorite" only after an explicit favorite action.',
        'Do not turn Not for us into allergies, medical restrictions, or broad hard avoids.',
        'Pin to week is a planning intent for the requested week, not a durable preference.',
      ],
      firstWriteTool: 'meals_apply_recipe_book_action',
      renderMode: 'structured_text',
    },
    items,
    shelves,
    summary: {
      provenCount: items.filter((item) => item.learningStatus === 'proven').length,
      recipeCount: items.length,
      shelfCount: shelves.length,
      trialCount: items.filter((item) => item.learningStatus === 'trial').length,
      untestedCount: items.filter((item) => item.learningStatus === 'untested').length,
    },
  };
}

function deriveHouseholdFit(
  raw: Record<string, unknown>,
  familyFit: boolean,
): RecipeBookItemRecord['householdFit'] {
  const servings = asNonNegativeNumber(raw.servings);
  const fits = new Set<RecipeBookItemRecord['householdFit'][number]>();
  if (servings == null) fits.add('unknown');
  else if (servings <= 1) fits.add('solo');
  else if (servings === 2) fits.add('two');
  else if (servings === 3) fits.add('three');
  else fits.add('multi');
  if (familyFit) {
    fits.add('three');
    fits.add('multi');
  }
  return Array.from(fits).sort();
}

function deriveWhyShown(input: {
  gapMealTypes: Set<string>;
  item: ReturnType<typeof summarizeRecipeCatalog>['items'][number];
  pantryNames: Set<string>;
  profile: ReturnType<typeof deriveMealsPlanningPreferenceProfile>;
  raw: Record<string, unknown>;
  recipeName: string;
}): RecipeBookWhyShownRecord[] {
  const reasons: RecipeBookWhyShownRecord[] = [];
  const recipeText = normalizeText([
    input.recipeName,
    ...asStringArray(input.raw.tags),
    ...asStringArray(input.raw.cuisines),
    asNonEmptyString(input.raw.cuisine),
  ].filter(Boolean).join(' '));

  if (input.profile.preferredCuisines.some((cuisine) => recipeText.includes(cuisine))) {
    reasons.push({ kind: 'confirmed_preference', label: 'Matches a confirmed cuisine preference.' });
  }
  if (input.item.planning.confidence === 'untested') {
    reasons.push({ kind: 'new_trial', label: 'Untested recipe that can become trial evidence.' });
  }
  if (input.gapMealTypes.has(input.item.mealType)) {
    reasons.push({ kind: 'catalog_gap', label: `Helps fill a ${input.item.mealType} recipe-book gap.` });
  }
  if (input.item.planning.pantryHeavy || recipeOverlapsPantry(input.raw, input.pantryNames)) {
    reasons.push({ kind: 'pantry_opportunity', label: 'Can use pantry or likely-on-hand ingredients.' });
  }
  if (input.item.planning.weeknightFit || input.item.planning.familyFit || input.item.planning.batchFit) {
    reasons.push({ kind: 'planner_fit', label: 'Has planning metadata Fluent can use.' });
  }

  return reasons.length > 0 ? reasons.slice(0, 4) : [{ kind: 'planner_fit', label: 'Available for recipe-book calibration.' }];
}

function recipeOverlapsPantry(raw: Record<string, unknown>, pantryNames: Set<string>): boolean {
  if (pantryNames.size === 0 || !Array.isArray(raw.ingredients)) return false;
  return raw.ingredients.some((entry) => {
    const ingredient = asRecord(entry);
    const itemName = normalizeText(asNonEmptyString(ingredient?.item) ?? '');
    return Boolean(itemName && pantryNames.has(itemName));
  });
}
