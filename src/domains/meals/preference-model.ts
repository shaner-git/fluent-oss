import {
  asNonEmptyString,
  asNonNegativeNumber,
  asRecord,
  asStringArray,
  normalizeText,
} from './helpers';

export type HouseholdSizeSegment = 'solo' | 'two' | 'three' | 'multi' | 'unknown';

export interface MealsPlanningPreferenceProfile {
  budgetCadPerMeal: number | null;
  budgetSensitivity: string | null;
  cleanupTolerance: string | null;
  cookingCadence: string | null;
  dislikedFoods: string[];
  dietaryConstraints: string[];
  groceryExpectation: string | null;
  hardAvoids: string[];
  householdAdultCount: number | null;
  householdChildCount: number | null;
  householdChildrenEatSameMeals: boolean | null;
  householdLeftoverTargetServings: number | null;
  householdMealParticipation: Record<string, string[]>;
  householdServeTarget: number | null;
  householdSizeSegment: HouseholdSizeSegment;
  likedFoods: string[];
  leftoverPreference: string | null;
  mealRoutine: string | null;
  pantryCheckPolicy: string | null;
  preferredCuisines: string[];
  preferredGroceryBrands: string[];
  preferredGroceryStores: string[];
  spicePreference: string | null;
  shoppingSubstitutionTolerance: string | null;
  targetBreakfastCount: number | null;
  targetLunchCount: number | null;
  targetSnackCount: number | null;
  targetWeeknightDinnerCount: number | null;
  targetFamilyDinnerCount: number | null;
  weeknightTimeLimitMinutes: number | null;
}

export function deriveMealsPlanningPreferenceProfile(
  preferences: Record<string, unknown>,
): MealsPlanningPreferenceProfile {
  const coreRules = asRecord(preferences.core_rules) ?? {};
  const household = asRecord(preferences.household) ?? {};
  const planning = asRecord(preferences.planning) ?? {};
  const shopping = asRecord(preferences.shopping) ?? {};
  const calibration = asRecord(preferences.calibration) ?? {};
  const budget = asRecord(shopping.budget) ?? {};

  const householdText = [
    asNonEmptyString(household.size),
    asNonEmptyString(household.shape ?? preferences.household_shape),
    ...asStringArray(calibration.starterPreferenceNotes),
  ].filter((value): value is string => Boolean(value)).join(' ');

  const structuredServeTarget = deriveStructuredServeTarget(household);
  const householdServeTarget = structuredServeTarget ?? deriveHouseholdServeTarget(householdText);

  return {
    budgetCadPerMeal: asNonNegativeNumber(budget.price_cap_per_meal_cad),
    budgetSensitivity: asNonEmptyString(shopping.budget_sensitivity),
    cleanupTolerance: asNonEmptyString(planning.cleanup_tolerance),
    cookingCadence: asNonEmptyString(planning.cooking_cadence),
    dislikedFoods: normalizeList([
      ...asStringArray(coreRules.dislikes),
      ...asStringArray(coreRules.soft_avoids),
    ]),
    dietaryConstraints: normalizeList(asStringArray(coreRules.dietary_constraints)),
    groceryExpectation: asNonEmptyString(shopping.grocery_expectation),
    hardAvoids: normalizeList([
      ...asStringArray(coreRules.hard_avoids),
      ...asStringArray(coreRules.allergies),
    ]),
    householdAdultCount: asNonNegativeNumber(household.adult_count),
    householdChildCount: asNonNegativeNumber(household.child_count),
    householdChildrenEatSameMeals:
      typeof household.children_eat_same_meals === 'boolean' ? household.children_eat_same_meals : null,
    householdLeftoverTargetServings: asNonNegativeNumber(household.leftover_target_servings),
    householdMealParticipation: normalizeMealParticipation(household.meal_participation),
    householdServeTarget,
    householdSizeSegment: deriveHouseholdSizeSegment(household, householdText, householdServeTarget),
    likedFoods: normalizeList([
      ...asStringArray(coreRules.favorite_foods),
      ...asStringArray(coreRules.liked_foods),
      ...asStringArray(coreRules.likes),
      ...asStringArray(planning.favorite_meals),
    ]),
    leftoverPreference: asNonEmptyString(planning.leftover_preference),
    mealRoutine: asNonEmptyString(planning.meal_routine),
    pantryCheckPolicy: asNonEmptyString(shopping.pantry_check_policy),
    preferredCuisines: normalizeList(asStringArray(coreRules.preferred_cuisines)),
    preferredGroceryBrands: normalizeList(asStringArray(shopping.preferred_brands)),
    preferredGroceryStores: normalizeList(asStringArray(shopping.preferred_stores)),
    spicePreference: asNonEmptyString(coreRules.spice_preference ?? planning.spice_preference),
    shoppingSubstitutionTolerance: asNonEmptyString(shopping.substitution_tolerance),
    targetBreakfastCount: deriveTargetCount(planning.target_breakfast_count),
    targetLunchCount: deriveTargetCount(planning.target_lunch_count),
    targetSnackCount: deriveTargetCount(planning.target_snack_count),
    targetWeeknightDinnerCount:
      deriveTargetCount(planning.target_dinner_count) ?? deriveTargetWeeknightDinnerCount(asNonEmptyString(planning.cooking_cadence)),
    targetFamilyDinnerCount: deriveTargetCount(planning.family_dinner_count),
    weeknightTimeLimitMinutes: asNonNegativeNumber(planning.weeknight_time_limit_minutes),
  };
}

function normalizeMealParticipation(value: unknown): Record<string, string[]> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.entries(record).reduce<Record<string, string[]>>((accumulator, [key, items]) => {
    const normalizedKey = normalizeText(key);
    const normalizedItems = normalizeList(asStringArray(items));
    if (normalizedKey && normalizedItems.length > 0) {
      accumulator[normalizedKey] = normalizedItems;
    }
    return accumulator;
  }, {});
}

export function shouldPlanForLeftovers(profile: MealsPlanningPreferenceProfile): boolean {
  const text = normalizeText([profile.leftoverPreference, profile.mealRoutine].filter(Boolean).join(' '));
  return /\b(leftover|batch|meal prep|cook once|planned lunch)\b/.test(text) && !shouldAvoidLeftovers(profile);
}

export function shouldAvoidLeftovers(profile: MealsPlanningPreferenceProfile): boolean {
  const text = normalizeText([profile.leftoverPreference, profile.mealRoutine].filter(Boolean).join(' '));
  return /\b(no leftovers|avoid leftovers|hate leftovers|fresh each|single serving)\b/.test(text);
}

export function isBudgetSensitive(profile: MealsPlanningPreferenceProfile): boolean {
  const text = normalizeText(profile.budgetSensitivity ?? profile.groceryExpectation ?? '');
  return Boolean(profile.budgetCadPerMeal != null || /\b(budget|cheap|affordable|cost|price|save)\b/.test(text));
}

export function isWeeknightQuickPreference(profile: MealsPlanningPreferenceProfile): boolean {
  const text = normalizeText([profile.cookingCadence, profile.mealRoutine, profile.groceryExpectation].filter(Boolean).join(' '));
  return Boolean(profile.weeknightTimeLimitMinutes != null || /\b(weeknight|quick|simple|low[- ]?effort|busy)\b/.test(text));
}

function normalizeList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean))).sort();
}

function deriveHouseholdSizeSegment(
  household: Record<string, unknown>,
  text: string,
  serveTarget: number | null,
): HouseholdSizeSegment {
  const structuredSegment = normalizeHouseholdSizeSegment(asNonEmptyString(household.size_segment ?? household.sizeSegment));
  if (structuredSegment !== 'unknown') return structuredSegment;
  const target = serveTarget ?? deriveHouseholdServeTarget(text);
  if (target == null) return 'unknown';
  if (target <= 1) return 'solo';
  if (target === 2) return 'two';
  if (target === 3) return 'three';
  return 'multi';
}

function normalizeHouseholdSizeSegment(value: string | null): HouseholdSizeSegment {
  const normalized = normalizeText(value ?? '');
  if (normalized === 'solo' || normalized === 'single' || normalized === 'one') return 'solo';
  if (normalized === 'two' || normalized === 'couple' || normalized === 'pair') return 'two';
  if (normalized === 'three') return 'three';
  if (normalized === 'multi' || normalized === 'family' || normalized === 'group') return 'multi';
  return 'unknown';
}

function deriveStructuredServeTarget(household: Record<string, unknown>): number | null {
  const explicitValue = asNonNegativeNumber(household.default_serve_target ?? household.defaultServeTarget);
  const explicit = explicitValue == null ? null : clampServeTarget(explicitValue);
  if (explicit != null) return explicit;
  const adultCount = asNonNegativeNumber(household.adult_count ?? household.adultCount);
  const childCount = asNonNegativeNumber(household.child_count ?? household.childCount);
  if (adultCount == null && childCount == null) return null;
  return clampServeTarget((adultCount ?? 0) + (childCount ?? 0));
}

function deriveHouseholdServeTarget(text: string): number | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const explicit =
    normalized.match(/\b(?:household|family|home|serves?|servings?)\s+(?:of|for)?\s*(\d+)\b/) ??
    normalized.match(/\b(\d+)\s+(?:people|persons|adults?|kids?|children|diners|eaters)\b/);
  if (explicit?.[1]) {
    return clampServeTarget(Number(explicit[1]));
  }
  if (/\b(solo|one person|just me|single adult)\b/.test(normalized)) return 1;
  if (/\b(couple|two people|two adults|2 adults)\b/.test(normalized)) return 2;
  if (/\b(family of three|three people|3 people|3 diners)\b/.test(normalized)) return 3;
  return null;
}

function deriveTargetCount(value: unknown): number | null {
  const target = asNonNegativeNumber(value);
  if (target == null) return null;
  return Math.max(0, Math.min(7, Math.round(target)));
}

function deriveTargetWeeknightDinnerCount(cadence: string | null): number | null {
  const normalized = normalizeText(cadence ?? '');
  const match = normalized.match(/\b(\d+)\s+(?:weeknight\s+)?(?:dinners?|meals?|nights?)\b/);
  if (!match?.[1]) return null;
  return Math.max(0, Math.min(7, Number(match[1])));
}

function clampServeTarget(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.min(12, Math.round(value)));
}
