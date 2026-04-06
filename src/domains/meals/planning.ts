import { shiftDateString, weekdayForDateInTimeZone } from '../../time';
import {
  asNonEmptyString,
  asNonNegativeNumber,
  asNullableString,
  asPositiveNumber,
  asRecord,
  asStringArray,
  clampInt,
  compactObject,
  findInventoryMatch,
  matchesLongLifeDefault,
  mergeUniqueStrings,
  normalizeIngredient,
  normalizeText,
  upsertGroceryPlanItem,
} from './helpers';
import type {
  GroceryIntentRecord,
  GroceryPlanItemRecord,
  InventoryRecord,
  MealMemoryRecord,
  MealsNutritionSupportMode,
  MealsSupportLevel,
  MealsTrainingAlignmentSummaryRecord,
  MealsTrainingContextRecord,
  MealsTrainingLoadHint,
  MealPreferencesRecord,
  MealRecipeRecord,
} from './types';
import type {
  CalendarAvailability,
  CalendarContext,
  CalendarContextDay,
  CalendarMealType,
  GenerateMealPlanOverrides,
  MealPlanCandidateSummaryRecord,
  PersistedMealPlanCandidateRecord,
} from './types-extra';

type NormalizedCalendarContext = {
  availability: CalendarAvailability;
  days: CalendarContextDay[];
  generatedAt: string | null;
  source: string | null;
  weekStart: string;
};

type PlanningCalendarConstraints = {
  blockedMealsByDate: Record<string, CalendarMealType[]>;
  calendarAvailability: CalendarAvailability;
  calendarUsed: boolean;
  familyEligibleDinnerDates: string[];
  householdAdultsHomeByDate: Record<string, number>;
  householdChildrenHomeByDate: Record<string, number>;
  warnings: string[];
};

type PlanningTrainingBias = {
  planningBiasesApplied: string[];
  proteinSupportBoost: number;
  recipeComplexityBias: number;
  repeatableMealBoost: number;
};

export interface PlanningSnapshot {
  calendarContext: NormalizedCalendarContext | null;
  groceryIntents: GroceryIntentRecord[];
  inventory: InventoryRecord[];
  mealMemoryByRecipeId: Map<string, MealMemoryRecord>;
  planningConstraints: PlanningCalendarConstraints;
  preferences: MealPreferencesRecord;
  recentRecipeIds: Set<string>;
  recipes: MealRecipeRecord[];
  recipesById: Map<string, Record<string, unknown>>;
  trainingContext: MealsTrainingContextRecord | null;
  timeZone: string;
}

const CALENDAR_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

function isCalendarMealType(value: string): value is CalendarMealType {
  return (CALENDAR_MEAL_TYPES as readonly string[]).includes(value);
}

export function chooseRecipeForPlanning(input: {
  date: string;
  excludeRecipeIds: Set<string>;
  familyDinner: boolean;
  hardAvoids: Set<string>;
  includeRecipeIds: Set<string>;
  inventory: InventoryRecord[];
  mealMemoryByRecipeId: Map<string, MealMemoryRecord>;
  mealType: string;
  porkNeverForFamily: boolean;
  recentRecipeIds: Set<string>;
  recipes: MealRecipeRecord[];
  remainingTrialMeals?: number;
  selectedDinnerRecipeIds: Set<string>;
  trainingContext?: MealsTrainingContextRecord | null;
}): MealRecipeRecord | null {
  const candidates = input.recipes
    .filter((recipe) => recipe.mealType === input.mealType && recipe.status === 'active')
    .filter((recipe) => !input.excludeRecipeIds.has(recipe.id))
    .filter((recipe) => {
      const raw = asRecord(recipe.raw);
      const ingredients = Array.isArray(raw?.ingredients) ? raw.ingredients : [];
      const ingredientNames = ingredients
        .map((entry) => asNonEmptyString(asRecord(entry)?.item))
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeText(value));
      if (ingredientNames.some((value) => input.hardAvoids.has(value))) {
        return false;
      }
      if (input.familyDinner && input.porkNeverForFamily) {
        const containsPork = ingredientNames.some((value) => value.includes('pork')) || normalizeText(recipe.name).includes('pork');
        if (containsPork) {
          return false;
        }
      }
      const memory = input.mealMemoryByRecipeId.get(recipe.id);
      if (memory?.status === 'retired') {
        return false;
      }
      if (input.mealType === 'dinner' && input.selectedDinnerRecipeIds.has(recipe.id)) {
        return false;
      }
      if (memory?.status === 'trial' && (input.remainingTrialMeals ?? 1) <= 0) {
        return false;
      }
      return true;
    });

  const scored = candidates
    .map((recipe) => ({
      recipe,
      score: scoreRecipeForPlanning(recipe, input),
    }))
    .sort((left, right) => right.score - left.score || left.recipe.name.localeCompare(right.recipe.name));

  return scored[0]?.recipe ?? null;
}

function scoreRecipeForPlanning(
  recipe: MealRecipeRecord,
  input: Omit<Parameters<typeof chooseRecipeForPlanning>[0], 'recipes'>,
): number {
  const raw = asRecord(recipe.raw) ?? {};
  const memory = input.mealMemoryByRecipeId.get(recipe.id) ?? null;
  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const expiringInventoryNames = new Set(
    input.inventory
      .filter((entry) => Boolean(entry.estimatedExpiry))
      .sort((left, right) => String(left.estimatedExpiry).localeCompare(String(right.estimatedExpiry)))
      .slice(0, 8)
      .map((entry) => entry.normalizedName ?? normalizeText(entry.name)),
  );

  let score = 0;
  if (input.includeRecipeIds.has(recipe.id)) score += 100;
  if (memory?.status === 'proven') score += 30;
  else if (memory?.status === 'trial') score += 10;
  else score += 18;

  score += input.recentRecipeIds.has(recipe.id) ? -10 : 12;

  if (input.familyDinner) {
    if (raw.kid_friendly === true) score += 8;
    if (asStringArray(raw.tags).some((tag) => normalizeText(tag).includes('family'))) score += 4;
  }

  const overlapCount = ingredients.reduce((count, ingredient) => {
    const itemName = asNonEmptyString(asRecord(ingredient)?.item);
    if (!itemName) return count;
    return expiringInventoryNames.has(normalizeText(itemName)) ? count + 1 : count;
  }, 0);
  score += overlapCount * 4;

  const cost = asNonNegativeNumber(raw.cost_per_serving_cad);
  if (cost != null && cost <= 10) score += 4;
  else if (cost != null) score -= 4;

  const trainingBias = deriveTrainingBiasForSlot({
    date: input.date,
    familyDinner: input.familyDinner,
    mealType: input.mealType,
    trainingContext: input.trainingContext ?? null,
  });
  const complexityScore = scoreRecipeSimplicity(raw);
  const proteinScore = scoreRecipeProteinSupport(raw, recipe);
  const repeatableScore = scoreRecipeRepeatability(raw);

  score += complexityScore * trainingBias.recipeComplexityBias;
  score += proteinScore * trainingBias.proteinSupportBoost;
  score += repeatableScore * trainingBias.repeatableMealBoost;

  return score;
}

export function resolvePlanningCounts(overrides: GenerateMealPlanOverrides | null) {
  return {
    breakfastCount: clampInt(overrides?.breakfastCount, 0, 7, 5),
    lunchCount: clampInt(overrides?.lunchCount, 0, 7, 5),
    dinnerCount: clampInt(overrides?.dinnerCount, 0, 7, 3),
    snackCount: clampInt(overrides?.snackCount, 0, 7, 5),
    familyDinnerCount: clampInt(overrides?.familyDinnerCount, 0, 7, 2),
    maxTrialMeals: clampInt(overrides?.maxTrialMeals, 0, 7, 1),
  };
}

export function normalizeGeneratePlanOverrides(
  input: GenerateMealPlanOverrides | Record<string, unknown> | null | undefined,
): GenerateMealPlanOverrides | null {
  const record = asRecord(input);
  if (!record) return null;

  return compactObject({
    breakfastCount: asNonNegativeNumber(record.breakfastCount),
    lunchCount: asNonNegativeNumber(record.lunchCount),
    dinnerCount: asNonNegativeNumber(record.dinnerCount),
    snackCount: asNonNegativeNumber(record.snackCount),
    familyDinnerCount: asNonNegativeNumber(record.familyDinnerCount),
    maxTrialMeals: asNonNegativeNumber(record.maxTrialMeals),
    includeRecipeIds: asStringArray(record.includeRecipeIds),
    excludeRecipeIds: asStringArray(record.excludeRecipeIds),
    prioritizeInventory: typeof record.prioritizeInventory === 'boolean' ? record.prioritizeInventory : undefined,
  }) as GenerateMealPlanOverrides;
}

export function normalizeCalendarContext(
  input: CalendarContext | Record<string, unknown> | null | undefined,
  weekStart: string,
): NormalizedCalendarContext | null {
  const record = asRecord(input);
  if (!record) return null;

  const contextWeekStart = asNonEmptyString(record.weekStart ?? record.week_start);
  if (!contextWeekStart) {
    throw new Error('calendar_context.weekStart is required when calendar_context is provided.');
  }
  if (contextWeekStart !== weekStart) {
    throw new Error('calendar_context.weekStart must match the requested weekStart.');
  }

  const availability = asNonEmptyString(record.availability);
  if (!availability || !['available', 'unavailable', 'unchecked'].includes(availability)) {
    throw new Error("calendar_context.availability must be one of 'available', 'unavailable', or 'unchecked'.");
  }

  const validDates = new Set(Array.from({ length: 7 }, (_, index) => shiftDateString(weekStart, index)));
  const seenDates = new Set<string>();
  const rawDays = Array.isArray(record.days) ? record.days : [];
  const days = rawDays.map((entry, index) => {
    const day = asRecord(entry);
    if (!day) {
      throw new Error(`calendar_context.days[${index}] must be an object.`);
    }

    const date = asNonEmptyString(day.date);
    if (!date) {
      throw new Error(`calendar_context.days[${index}].date is required.`);
    }
    if (!validDates.has(date)) {
      throw new Error(`calendar_context.days[${index}].date must be within the requested planning week.`);
    }
    if (seenDates.has(date)) {
      throw new Error(`calendar_context.days contains duplicate date entries for ${date}.`);
    }
    seenDates.add(date);

    const rawBlockedMeals = Array.isArray(day.blockedMeals ?? day.blocked_meals)
      ? ((day.blockedMeals ?? day.blocked_meals) as unknown[])
      : [];
    const blockedMeals = rawBlockedMeals.map((value: unknown, blockedIndex: number) => {
      const mealType = asNonEmptyString(value);
      if (!mealType || !isCalendarMealType(mealType)) {
        throw new Error(`calendar_context.days[${index}].blockedMeals[${blockedIndex}] must be a valid meal type.`);
      }
      return mealType;
    });

    return {
      date,
      blockedMeals: Array.from(new Set(blockedMeals)),
      householdAdultsHome:
        asNonNegativeNumber(day.householdAdultsHome ?? day.household_adults_home) ?? null,
      householdChildrenHome:
        asNonNegativeNumber(day.householdChildrenHome ?? day.household_children_home) ?? null,
      notes: asStringArray(day.notes),
    } satisfies CalendarContextDay;
  });

  return {
    availability: availability as CalendarAvailability,
    days,
    generatedAt: asNullableString(record.generatedAt ?? record.generated_at),
    source: asNullableString(record.source),
    weekStart: contextWeekStart,
  };
}

export function normalizeTrainingContext(
  input: MealsTrainingContextRecord | Record<string, unknown> | null | undefined,
): MealsTrainingContextRecord | null {
  const record = asRecord(input);
  if (!record) return null;

  const goalType = asNullableString(record.goalType ?? record.goal_type);
  const trainingDays = Array.from(
    new Set(asStringArray(record.trainingDays ?? record.training_days).filter((value) => value.trim().length > 0)),
  );
  const daysPerWeek = clampInt(
    asNonNegativeNumber(record.daysPerWeek ?? record.days_per_week),
    0,
    7,
    trainingDays.length,
  );
  const rawSessionLoadByDay = asRecord(record.sessionLoadByDay ?? record.session_load_by_day) ?? {};
  const sessionLoadByDay = Object.entries(rawSessionLoadByDay).reduce<Record<string, MealsTrainingLoadHint>>(
    (accumulator, [date, value]) => {
      const normalizedValue = asNonEmptyString(value);
      if (normalizedValue === 'light' || normalizedValue === 'moderate' || normalizedValue === 'hard') {
        accumulator[date] = normalizedValue;
      }
      return accumulator;
    },
    {},
  );
  const nutritionSupportMode =
    asNonEmptyString(record.nutritionSupportMode ?? record.nutrition_support_mode) ?? 'general';
  const weekComplexity = asNonEmptyString(record.weekComplexity ?? record.week_complexity) ?? 'medium';

  return {
    goalType,
    trainingDays,
    daysPerWeek,
    sessionLoadByDay,
    nutritionSupportMode: isNutritionSupportMode(nutritionSupportMode) ? nutritionSupportMode : 'general',
    weekComplexity: isSupportLevel(weekComplexity) ? weekComplexity : 'medium',
  };
}

export function deriveCalendarPlanningConstraints(input: {
  calendarContext: NormalizedCalendarContext | null;
  weekStart: string;
}) {
  const blockedMealsByDate: Record<string, CalendarMealType[]> = {};
  const familyEligibleDinnerDates: string[] = [];
  const householdAdultsHomeByDate: Record<string, number> = {};
  const householdChildrenHomeByDate: Record<string, number> = {};
  const warnings = new Set<string>();

  if (!input.calendarContext) {
    warnings.add('calendar_unchecked');
    return {
      blockedMealsByDate,
      calendarAvailability: 'unchecked',
      calendarUsed: false,
      familyEligibleDinnerDates,
      householdAdultsHomeByDate,
      householdChildrenHomeByDate,
      warnings: Array.from(warnings),
    } satisfies PlanningCalendarConstraints;
  }

  if (input.calendarContext.availability === 'unchecked') {
    warnings.add('calendar_unchecked');
  } else if (input.calendarContext.availability === 'unavailable') {
    warnings.add('calendar_unavailable');
  }

  for (const day of input.calendarContext.days) {
    if (day.blockedMeals && day.blockedMeals.length > 0) {
      blockedMealsByDate[day.date] = day.blockedMeals;
    }
    if (day.householdAdultsHome != null) {
      householdAdultsHomeByDate[day.date] = day.householdAdultsHome;
    }
    if (day.householdChildrenHome != null) {
      householdChildrenHomeByDate[day.date] = day.householdChildrenHome;
    }
    if ((day.householdAdultsHome ?? 0) >= 2 || (day.householdChildrenHome ?? 0) > 0) {
      familyEligibleDinnerDates.push(day.date);
    }
  }

  return {
    blockedMealsByDate,
    calendarAvailability: input.calendarContext.availability,
    calendarUsed: input.calendarContext.availability === 'available',
    familyEligibleDinnerDates,
    householdAdultsHomeByDate,
    householdChildrenHomeByDate,
    warnings: Array.from(warnings),
  } satisfies PlanningCalendarConstraints;
}

function isSupportLevel(value: string): value is MealsSupportLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isNutritionSupportMode(value: string): value is MealsNutritionSupportMode {
  return (
    value === 'general' ||
    value === 'higher_protein' ||
    value === 'simpler_dinners' ||
    value === 'recovery_support'
  );
}

function deriveTrainingLoadForDate(date: string, trainingContext: MealsTrainingContextRecord | null): MealsTrainingLoadHint | null {
  if (!trainingContext) return null;
  return trainingContext.sessionLoadByDay[date] ?? null;
}

function scoreRecipeProteinSupport(raw: Record<string, unknown>, recipe: MealRecipeRecord): number {
  const macros = asRecord(raw.macros);
  const tags = asStringArray(raw.tags).map((tag) => normalizeText(tag));
  const protein = asNonNegativeNumber(macros?.protein_g) ?? 0;
  const name = normalizeText(recipe.name);
  let score = 0;
  if (protein >= 35) score += 4;
  else if (protein >= 25) score += 3;
  else if (protein >= 18) score += 1;

  if (tags.some((tag) => tag.includes('high protein') || tag.includes('protein'))) score += 2;
  if (
    ['chicken', 'salmon', 'turkey', 'beef', 'egg', 'eggs', 'greek yogurt', 'tofu', 'cottage cheese'].some((term) =>
      name.includes(term),
    )
  ) {
    score += 1;
  }
  return score;
}

function scoreRecipeSimplicity(raw: Record<string, unknown>): number {
  const totalTime = asNonNegativeNumber(raw.total_time) ?? 0;
  const activeTime = asNonNegativeNumber(raw.active_time) ?? 0;
  let score = 0;
  if (totalTime > 0 && totalTime <= 25) score += 3;
  else if (totalTime <= 35) score += 2;
  else if (totalTime <= 45) score += 1;
  else if (totalTime >= 60) score -= 2;

  if (activeTime > 0 && activeTime <= 15) score += 2;
  else if (activeTime >= 35) score -= 1;

  return score;
}

function scoreRecipeRepeatability(raw: Record<string, unknown>): number {
  const tags = asStringArray(raw.tags).map((tag) => normalizeText(tag));
  const kidFriendly = raw.kid_friendly === true;
  let score = 0;
  if (kidFriendly) score += 1;
  if (tags.some((tag) => tag.includes('batch') || tag.includes('meal prep') || tag.includes('weekday'))) score += 2;
  if (tags.some((tag) => tag.includes('quick') || tag.includes('simple') || tag.includes('easy'))) score += 1;
  return score;
}

function deriveTrainingBiasForSlot(input: {
  date: string;
  familyDinner: boolean;
  mealType: string;
  trainingContext: MealsTrainingContextRecord | null;
}): PlanningTrainingBias {
  const trainingLoad = deriveTrainingLoadForDate(input.date, input.trainingContext);
  const weekComplexity = input.trainingContext?.weekComplexity ?? 'medium';
  const nutritionSupportMode = input.trainingContext?.nutritionSupportMode ?? 'general';
  const planningBiasesApplied = new Set<string>();

  let proteinSupportBoost = 0;
  let recipeComplexityBias = 0;
  let repeatableMealBoost = 0;

  if (trainingLoad === 'hard') {
    planningBiasesApplied.add('hard_day_support');
    proteinSupportBoost += input.mealType === 'breakfast' ? 1 : 2;
    repeatableMealBoost += 1;
    if (input.mealType === 'dinner') {
      planningBiasesApplied.add('hard_day_simpler_dinners');
      recipeComplexityBias += 2;
      repeatableMealBoost += 1;
    }
  } else if (trainingLoad === 'moderate') {
    planningBiasesApplied.add('moderate_day_support');
    proteinSupportBoost += input.mealType === 'dinner' || input.mealType === 'lunch' || input.mealType === 'snack' ? 1 : 0;
    if (input.mealType === 'dinner') recipeComplexityBias += 1;
  } else if (trainingLoad === 'light') {
    planningBiasesApplied.add('light_day_variety');
    if (input.mealType === 'dinner') recipeComplexityBias -= 1;
  } else if (input.mealType === 'dinner') {
    recipeComplexityBias -= 1;
  }

  if (nutritionSupportMode === 'higher_protein') {
    planningBiasesApplied.add('higher_protein_week');
    proteinSupportBoost += input.mealType === 'dinner' || input.mealType === 'lunch' || input.mealType === 'snack' ? 2 : 1;
  } else if (nutritionSupportMode === 'simpler_dinners') {
    planningBiasesApplied.add('simpler_dinners_week');
    if (input.mealType === 'dinner') recipeComplexityBias += 2;
  } else if (nutritionSupportMode === 'recovery_support') {
    planningBiasesApplied.add('recovery_support_week');
    proteinSupportBoost += input.mealType === 'dinner' || input.mealType === 'lunch' ? 2 : 1;
    repeatableMealBoost += 1;
    if (trainingLoad === 'hard' && input.mealType === 'dinner') recipeComplexityBias += 1;
  }

  if (weekComplexity === 'high') {
    planningBiasesApplied.add('high_complexity_week');
    repeatableMealBoost += 1;
    if (input.mealType === 'dinner') recipeComplexityBias += 1;
  } else if (weekComplexity === 'low' && input.mealType === 'dinner' && trainingLoad == null) {
    planningBiasesApplied.add('low_complexity_allows_variety');
    recipeComplexityBias -= 1;
  }

  if (input.familyDinner && input.mealType === 'dinner') {
    planningBiasesApplied.add('family_dinner_repeatability');
    repeatableMealBoost += 1;
  }

  return {
    planningBiasesApplied: Array.from(planningBiasesApplied),
    proteinSupportBoost,
    recipeComplexityBias,
    repeatableMealBoost,
  };
}

export function deriveTrainingAlignmentSummary(input: {
  entries: Array<Record<string, unknown>>;
  trainingContext: MealsTrainingContextRecord | null;
}): MealsTrainingAlignmentSummaryRecord {
  if (!input.trainingContext) {
    return {
      trainingContextUsed: false,
      trainingDays: [],
      sessionLoadByDay: {},
      nutritionSupportMode: null,
      weekComplexity: null,
      planningBiasesApplied: [],
    };
  }

  const biasSet = new Set<string>();
  for (const entry of input.entries) {
    const date = asNonEmptyString(entry.date);
    const mealType = asNonEmptyString(entry.meal_type);
    if (!date || !mealType) continue;
    const bias = deriveTrainingBiasForSlot({
      date,
      familyDinner: asRecord(entry.metadata)?.family_dinner === true,
      mealType,
      trainingContext: input.trainingContext,
    });
    for (const item of bias.planningBiasesApplied) biasSet.add(item);
  }

  return {
    trainingContextUsed: true,
    trainingDays: input.trainingContext.trainingDays,
    sessionLoadByDay: input.trainingContext.sessionLoadByDay,
    nutritionSupportMode: input.trainingContext.nutritionSupportMode,
    weekComplexity: input.trainingContext.weekComplexity,
    planningBiasesApplied: Array.from(biasSet),
  };
}

export function buildPlanningSlots(
  weekStart: string,
  counts: {
    breakfastCount: number;
    lunchCount: number;
    dinnerCount: number;
    snackCount: number;
  },
  timeZone: string,
  planningConstraints?: PlanningCalendarConstraints | null,
) {
  const weekdayOffsets = [0, 1, 2, 3, 4];
  const dinnerOffsets = [0, 2, 4, 5, 6, 1, 3];
  const slots: Array<{
    date: string;
    dayLabel: string;
    familyEligible: boolean;
    mealType: string;
    slotIndex: number;
  }> = [];
  let reducedByCalendarConstraints = false;

  const isBlocked = (date: string, mealType: CalendarMealType) =>
    (planningConstraints?.blockedMealsByDate[date] ?? []).includes(mealType);

  for (const mealType of ['breakfast', 'lunch', 'snack'] as const) {
    const count = counts[`${mealType}Count`];
    let added = 0;
    for (const offset of weekdayOffsets) {
      if (added >= count) break;
      const date = shiftDateString(weekStart, offset);
      if (isBlocked(date, mealType)) continue;
      slots.push({
        date,
        dayLabel: weekdayForDateInTimeZone(date, timeZone),
        familyEligible: false,
        mealType,
        slotIndex: added,
      });
      added += 1;
    }
    if (added < count) {
      reducedByCalendarConstraints = reducedByCalendarConstraints || Boolean(planningConstraints);
    }
  }

  dinnerOffsets.slice(0, counts.dinnerCount).forEach((offset, index) => {
    const date = shiftDateString(weekStart, offset);
    if (isBlocked(date, 'dinner')) {
      reducedByCalendarConstraints = reducedByCalendarConstraints || Boolean(planningConstraints);
      return;
    }
    const explicitAdultCount = planningConstraints?.householdAdultsHomeByDate[date];
    const explicitChildrenCount = planningConstraints?.householdChildrenHomeByDate[date];
    const familyEligible =
      explicitAdultCount == null && explicitChildrenCount == null
        ? true
        : (explicitAdultCount ?? 0) >= 2 || (explicitChildrenCount ?? 0) > 0;
    slots.push({
      date,
      dayLabel: weekdayForDateInTimeZone(date, timeZone),
      familyEligible,
      mealType: 'dinner',
      slotIndex: index,
    });
  });

  return {
    reducedByCalendarConstraints,
    slots: slots.sort((left, right) => left.date.localeCompare(right.date) || left.mealType.localeCompare(right.mealType)),
  };
}

function resolvePlannedServes(input: {
  mealType: string;
  mealTypeCount: number;
  recipeRaw: Record<string, unknown>;
}) {
  const recipeServings = asPositiveNumber(input.recipeRaw.servings) ?? 1;
  if (input.mealType === 'dinner') {
    return recipeServings;
  }

  // Repeatable weekday meals are planned as one serving consumed per slot.
  // This keeps grocery scaling aligned with the number of planned weekdays
  // instead of multiplying the full batch yield for every repeated entry.
  if (input.mealTypeCount > 1) {
    return 1;
  }

  return recipeServings;
}

export function buildPrimaryPlanCandidate(input: {
  snapshot: PlanningSnapshot;
  overrides: GenerateMealPlanOverrides | null;
  weekStart: string;
}): PersistedMealPlanCandidateRecord {
  const planningCounts = resolvePlanningCounts(input.overrides);
  const slotPlan = buildPlanningSlots(input.weekStart, planningCounts, input.snapshot.timeZone, input.snapshot.planningConstraints);
  const slots = slotPlan.slots;
  const preferences = input.snapshot.preferences.raw;
  const hardAvoids = new Set(asStringArray(asRecord(preferences.core_rules)?.hard_avoids).map((value) => normalizeText(value)));
  const dinnerRules = asRecord(preferences.family_constraints);
  const familyDinnerCount = Math.min(
    planningCounts.familyDinnerCount,
    slots.filter((slot) => slot.mealType === 'dinner' && slot.familyEligible).length,
  );
  let remainingTrialMeals = planningCounts.maxTrialMeals;
  const warnings = new Set<string>(input.snapshot.planningConstraints.warnings);
  if (slotPlan.reducedByCalendarConstraints) {
    warnings.add('calendar_constraints_reduced_slots');
  }
  const rationale = new Set<string>();
  const repeatedRecipeByMealType = new Map<string, MealRecipeRecord>();
  const selectedDinnerRecipeIds = new Set<string>();
  const entries: Array<Record<string, unknown>> = [];
  let familyDinnerSlotsAssigned = 0;

  for (const slot of slots) {
    const familyDinner =
      slot.mealType === 'dinner' &&
      slot.familyEligible &&
      familyDinnerSlotsAssigned < familyDinnerCount;
    const reuseAllowed = slot.mealType !== 'dinner';
    const reused = reuseAllowed ? repeatedRecipeByMealType.get(slot.mealType) ?? null : null;
    const chosen =
      reused ??
      chooseRecipeForPlanning({
        date: slot.date,
        excludeRecipeIds: new Set(asStringArray(input.overrides?.excludeRecipeIds)),
        familyDinner,
        hardAvoids,
        includeRecipeIds: new Set(asStringArray(input.overrides?.includeRecipeIds)),
        inventory: input.snapshot.inventory,
        mealMemoryByRecipeId: input.snapshot.mealMemoryByRecipeId,
        mealType: slot.mealType,
        porkNeverForFamily: dinnerRules?.pork_never_for_family === true,
        recentRecipeIds: input.snapshot.recentRecipeIds,
        remainingTrialMeals,
        recipes: input.snapshot.recipes,
        selectedDinnerRecipeIds,
        trainingContext: input.snapshot.trainingContext,
      });

    if (!chosen) {
      warnings.add(`No ${slot.mealType} recipe matched the current Fluent planner inputs for ${slot.dayLabel}.`);
      continue;
    }

    if (reuseAllowed && !repeatedRecipeByMealType.has(slot.mealType)) repeatedRecipeByMealType.set(slot.mealType, chosen);
    if (slot.mealType === 'dinner') selectedDinnerRecipeIds.add(chosen.id);
    if (familyDinner) familyDinnerSlotsAssigned += 1;

    const memory = input.snapshot.mealMemoryByRecipeId.get(chosen.id) ?? null;
    const selectionStatus = memory?.status === 'proven' || memory?.status === 'trial' ? memory.status : null;
    if (selectionStatus === 'trial') remainingTrialMeals -= 1;

    const recipeRaw = input.snapshot.recipesById.get(chosen.id) ?? {};
    const prepNotes = asNullableString(asRecord(recipeRaw)?.prep_notes);
    const plannedServes = resolvePlannedServes({
      mealType: slot.mealType,
      mealTypeCount: planningCounts[`${slot.mealType}Count` as keyof typeof planningCounts] ?? 1,
      recipeRaw: asRecord(recipeRaw) ?? {},
    });
    entries.push({
      date: slot.date,
      day: slot.dayLabel,
      meal_type: slot.mealType,
      recipe_id: chosen.id,
      recipe_name: chosen.name,
      selection_status: selectionStatus,
      serves: plannedServes,
      prep_minutes: asNonNegativeNumber(asRecord(recipeRaw)?.active_time),
      total_minutes: asNonNegativeNumber(asRecord(recipeRaw)?.total_time),
      leftovers_expected: slot.mealType !== 'dinner',
      instructions: [],
      prep_notes: prepNotes,
      metadata: { family_dinner: familyDinner, generated_by: 'mcp-native-planner', status: 'planned' },
    });
  }

  if (remainingTrialMeals < planningCounts.maxTrialMeals) {
    rationale.add(`Capped trial meals at ${planningCounts.maxTrialMeals} for this generated week.`);
  }

  const nearExpiryNames = input.snapshot.inventory
    .filter((item) => Boolean(item.estimatedExpiry && item.estimatedExpiry <= shiftDateString(input.weekStart, 5)))
    .map((item) => item.name);
  if (nearExpiryNames.length > 0 && input.overrides?.prioritizeInventory !== false) {
    rationale.add(`Prioritized near-expiry inventory where possible: ${nearExpiryNames.slice(0, 4).join(', ')}.`);
  }

  const trainingAlignmentSummary = deriveTrainingAlignmentSummary({
    entries,
    trainingContext: input.snapshot.trainingContext,
  });
  if (trainingAlignmentSummary.trainingContextUsed) {
    rationale.add(
      `Applied training-aware meal bias for ${trainingAlignmentSummary.trainingDays.length} training day(s) with ${trainingAlignmentSummary.nutritionSupportMode ?? 'general'} support.`,
    );
  }

  const candidatePlan = buildCandidatePlanDocument({
    entries,
    profileOwner: input.snapshot.preferences.profileOwner ?? asNullableString(input.snapshot.preferences.raw.profile_owner),
    sourceSnapshot: {
      calendar: input.snapshot.calendarContext,
      derived_constraints: input.snapshot.planningConstraints,
      training_alignment_summary: trainingAlignmentSummary,
      training_context: input.snapshot.trainingContext,
    },
    summary: {
      ...summarizeGeneratedPlan(entries, input.snapshot.recipesById),
      trainingAlignmentSummary,
    },
    weekStart: input.weekStart,
  });
  const groceryDeltaSummary = summarizeCandidateGroceryDelta({
    groceryIntents: input.snapshot.groceryIntents,
    inventory: input.snapshot.inventory,
    plan: candidatePlan,
    preferences,
    recipesById: input.snapshot.recipesById,
  });
  const candidateId = `candidate:${crypto.randomUUID()}`;

  return {
    candidateId,
    plan: candidatePlan,
    summary: {
      candidateId,
      weekStart: input.weekStart,
      entryCount: entries.length,
      mealTypes: Array.from(new Set(entries.map((entry) => String(entry.meal_type)))),
      recipeIds: Array.from(new Set(entries.map((entry) => String(entry.recipe_id)))),
      recipeNamePreview: Array.from(new Set(entries.map((entry) => String(entry.recipe_name)))).slice(0, 10),
      warnings: Array.from(warnings),
      rationale: Array.from(rationale),
      groceryDeltaSummary,
      entries: entries.map((entry) => ({
        date: String(entry.date),
        dayLabel: String(entry.day),
        mealType: String(entry.meal_type),
        recipeId: String(entry.recipe_id),
        recipeName: String(entry.recipe_name),
        selectionStatus: asNullableString(entry.selection_status),
        serves: asPositiveNumber(entry.serves),
      })),
      summary: candidatePlan.summary,
    } as MealPlanCandidateSummaryRecord,
  };
}

export function buildCandidatePlanDocument(input: {
  entries: Array<Record<string, unknown>>;
  profileOwner: string | null;
  sourceSnapshot: Record<string, unknown>;
  summary: Record<string, unknown>;
  weekStart: string;
}) {
  return {
    week_start: input.weekStart,
    week_end: shiftDateString(input.weekStart, 6),
    status: 'draft',
    generated_at: new Date().toISOString(),
    approved_at: null,
    profile_owner: input.profileOwner,
    requirements: {},
    source_snapshot: input.sourceSnapshot,
    summary: input.summary,
    meals: input.entries,
    metadata: {
      approval_status: 'draft',
      generated_by: 'mcp-native-planner',
    },
  };
}

export function summarizeGeneratedPlan(
  entries: Array<Record<string, unknown>>,
  recipesById: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  let totalCalories = 0;
  let totalProtein = 0;
  let totalFiber = 0;
  let totalSodium = 0;
  let budgetEstimate = 0;

  for (const entry of entries) {
    const recipeId = asNonEmptyString(entry.recipe_id);
    const recipe = recipeId ? recipesById.get(recipeId) ?? null : null;
    if (!recipe) continue;
    const macros = asRecord(recipe.macros);
    totalCalories += asNonNegativeNumber(macros?.calories) ?? 0;
    totalProtein += asNonNegativeNumber(macros?.protein_g) ?? 0;
    totalFiber += asNonNegativeNumber(macros?.fiber_g) ?? 0;
    totalSodium += asNonNegativeNumber(macros?.sodium_mg) ?? 0;
    budgetEstimate += asNonNegativeNumber(recipe.cost_per_serving_cad) ?? 0;
  }

  return {
    average_sodium_mg: entries.length > 0 ? Math.round(totalSodium / entries.length) : 0,
    budget_estimate_cad: Number(budgetEstimate.toFixed(2)),
    total_calories: Math.round(totalCalories),
    total_fiber_g: Math.round(totalFiber),
    total_protein_g: Math.round(totalProtein),
  };
}

export function summarizeCandidateGroceryDelta(input: {
  groceryIntents: GroceryIntentRecord[];
  inventory: InventoryRecord[];
  plan: Record<string, unknown>;
  preferences: Record<string, unknown>;
  recipesById: Map<string, Record<string, unknown>>;
}) {
  const aggregated = buildGroceryAggregation({
    brandPreferences: new Map<string, string[]>(),
    groceryIntents: input.groceryIntents,
    inventory: input.inventory,
    planEntries: Array.isArray(input.plan.meals) ? input.plan.meals : [],
    preferences: input.preferences,
    recipesById: input.recipesById,
    weekStart: asNonEmptyString(input.plan.week_start ?? input.plan.weekStart) ?? null,
  });

  return {
    itemCount: aggregated.items.filter((item) => item.inventoryStatus !== 'check_pantry').length,
    pantryCheckCount: aggregated.items.filter((item) => item.inventoryStatus === 'check_pantry').length,
    missingItemCount: aggregated.items.filter((item) => item.inventoryStatus === 'missing').length,
    unresolvedCount: aggregated.items.filter((item) => item.uncertainty !== null).length,
  };
}

export function buildGroceryAggregation(input: {
  brandPreferences: Map<string, string[]>;
  groceryIntents: GroceryIntentRecord[];
  inventory: InventoryRecord[];
  planEntries: unknown[];
  preferences: Record<string, unknown>;
  recipesById: Map<string, Record<string, unknown>>;
  weekStart?: string | null;
}) {
  const longLifeDefaults = asStringArray(asRecord(input.preferences.inventory)?.long_life_defaults);
  const aggregated = new Map<string, GroceryPlanItemRecord>();
  const resolvedItems: GroceryPlanItemRecord[] = [];
  const notes = new Set<string>();

  for (const entry of input.planEntries) {
    const record = asRecord(entry);
    const recipeId = asNonEmptyString(record?.recipe_id);
    if (!record || !recipeId) continue;

    const recipe = input.recipesById.get(recipeId);
    if (!recipe) {
      notes.add(`Recipe ${recipeId} could not be resolved while generating the grocery plan.`);
      continue;
    }

    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const baseServings = asPositiveNumber(recipe.servings) ?? 1;
    const plannedServes = asPositiveNumber(record.serves) ?? baseServings;
    const scale = plannedServes > 0 ? plannedServes / baseServings : 1;

    for (const ingredient of ingredients) {
      const normalized = normalizeIngredient(ingredient, scale);
      if (!normalized) continue;

      const inventoryMatch = findInventoryMatch({
        allowedSubstituteQueries: normalized.allowedSubstituteQueries,
        inventory: input.inventory,
        longLifeDefaults,
        name: normalized.name,
        neededCanonicalItemKey: normalized.canonicalItemKey,
        neededCanonicalQuantity: normalized.canonicalQuantity,
        neededCanonicalUnit: normalized.canonicalUnit,
        neededQuantity: normalized.quantity,
        neededUnit: normalized.unit,
        normalizedName: normalized.normalizedName,
        planningWindowStart: input.weekStart ?? asNonEmptyString(record?.date) ?? null,
      });
      if (inventoryMatch.status === 'sufficient') {
        if (inventoryMatch.coverageSource === 'implicit') {
          resolvedItems.push({
            itemKey: normalized.itemKey,
            name: normalized.name,
            normalizedName: normalized.normalizedName,
            canonicalItemKey: normalized.canonicalItemKey,
            canonicalQuantity: normalized.canonicalQuantity,
            canonicalUnit: normalized.canonicalUnit,
            quantity: normalized.quantity,
            unit: normalized.unit,
            orderingPolicy: normalized.orderingPolicy,
            preferredBrands: mergeUniqueStrings(normalized.preferredBrands, input.brandPreferences.get(normalized.normalizedName) ?? []),
            avoidBrands: normalized.avoidBrands,
            allowedSubstituteQueries: normalized.allowedSubstituteQueries,
            blockedSubstituteTerms: normalized.blockedSubstituteTerms,
            sourceRecipeIds: [recipeId],
            sourceRecipeNames: [asNonEmptyString(recipe.name) ?? recipeId],
            reasons: inventoryMatch.reasons,
            inventoryStatus: 'sufficient',
            uncertainty: null,
            note: inventoryMatch.note,
            actionStatus: null,
            substitute: null,
          });
        }
        continue;
      }

      if (
        normalized.orderingPolicy !== 'pantry_item' &&
        matchesLongLifeDefault(normalized.canonicalItemKey ?? normalized.normalizedName, longLifeDefaults)
      ) {
        continue;
      }

      const pantryCheck =
        normalized.orderingPolicy === 'pantry_item' &&
        (inventoryMatch.status === 'missing' || inventoryMatch.status === 'present_without_quantity');
      const inventoryStatus = pantryCheck ? 'check_pantry' : inventoryMatch.status;
      const reasons = pantryCheck ? ['Pantry item; verify stock before buying'] : inventoryMatch.reasons;
      const note =
        pantryCheck && !inventoryMatch.note
          ? 'Marked as a pantry item, so verify what is on hand before adding it to the cart.'
          : inventoryMatch.note;
      const uncertainty = pantryCheck ? null : inventoryMatch.uncertainty;

      upsertGroceryPlanItem(aggregated, {
        itemKey: normalized.itemKey,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        canonicalItemKey: normalized.canonicalItemKey,
        canonicalQuantity: inventoryMatch.missingCanonicalQuantity ?? normalized.canonicalQuantity,
        canonicalUnit: normalized.canonicalUnit,
        quantity:
          inventoryMatch.missingCanonicalQuantity != null && normalized.canonicalUnit
            ? inventoryMatch.missingCanonicalQuantity
            : inventoryMatch.missingQuantity ?? normalized.quantity,
        unit:
          inventoryMatch.missingCanonicalQuantity != null && normalized.canonicalUnit
            ? normalized.canonicalUnit
            : normalized.unit,
        orderingPolicy: normalized.orderingPolicy,
        preferredBrands: mergeUniqueStrings(normalized.preferredBrands, input.brandPreferences.get(normalized.normalizedName) ?? []),
        avoidBrands: normalized.avoidBrands,
        allowedSubstituteQueries: normalized.allowedSubstituteQueries,
        blockedSubstituteTerms: normalized.blockedSubstituteTerms,
        sourceRecipeIds: [recipeId],
        sourceRecipeNames: [asNonEmptyString(recipe.name) ?? recipeId],
        reasons,
        inventoryStatus,
        uncertainty,
        note,
        actionStatus: null,
        substitute: null,
      });
    }
  }

  for (const intent of input.groceryIntents) {
    upsertGroceryPlanItem(aggregated, {
      itemKey: intent.normalizedName,
      name: intent.displayName,
      normalizedName: intent.normalizedName,
      canonicalItemKey: intent.normalizedName,
      canonicalQuantity: intent.quantity,
      canonicalUnit: intent.unit,
      quantity: intent.quantity,
      unit: intent.unit,
      orderingPolicy: 'flexible_match',
      preferredBrands: input.brandPreferences.get(intent.normalizedName) ?? [],
      avoidBrands: [],
      allowedSubstituteQueries: [],
      blockedSubstituteTerms: [],
      sourceRecipeIds: [],
      sourceRecipeNames: [],
      reasons: ['Requested for the next grocery run'],
      inventoryStatus: 'intent',
      uncertainty: null,
      note: intent.notes,
      actionStatus: null,
      substitute: null,
    });
  }

  return {
    items: Array.from(aggregated.values()).sort((left, right) => left.name.localeCompare(right.name)),
    resolvedItems: resolvedItems.sort((left, right) => left.name.localeCompare(right.name)),
    notes: Array.from(notes),
  };
}
