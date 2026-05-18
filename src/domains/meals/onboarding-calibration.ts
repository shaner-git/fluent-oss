import { asNonEmptyString, asNonNegativeNumber, asRecord, asStringArray, normalizeText } from './helpers';
import type {
  CurrentGroceryListRecord,
  InventoryRecord,
  MealMemoryRecord,
  MealPlanHistoryRecord,
  MealPlanRecord,
  MealPreferencesRecord,
  MealsCalibrationContextRecord,
  MealsCalibrationPromptRecord,
  MealsCalibrationSignalKind,
  MealsCalibrationSignalRecord,
  MealsCalibrationSignalSource,
  MealsCalibrationSignalStatus,
  MealsConfidenceBreakdown,
  MealsOnboardingCalibrationRecord,
  MealsPantryCalibrationRecord,
  MealsPantryCalibrationStatus,
  MealsReadinessRecord,
  MealsSetupState,
} from './types';

export interface MealsCalibrationResponseInput {
  pantryItems?: Array<{
    itemName: string;
    note?: string | null;
    status: MealsPantryCalibrationStatus;
  }> | null;
  preferencePatch?: {
    allergies?: string[] | null;
    budgetSensitivity?: string | null;
    cookingCadence?: string | null;
    dietaryConstraints?: string[] | null;
    dislikes?: string[] | null;
    groceryExpectation?: string | null;
    hardAvoids?: string[] | null;
    householdShape?: string | null;
    leftoverPreference?: string | null;
    preferredCuisines?: string[] | null;
    weeknightTimeLimitMinutes?: number | null;
  } | null;
  signals?: Array<{
    correctedValue?: string | null;
    kind: MealsCalibrationSignalKind;
    note?: string | null;
    status: Exclude<MealsCalibrationSignalStatus, 'inferred'>;
    value: string;
  }> | null;
  starterPreferenceText?: string | null;
}

export function buildMealsOnboardingCalibration(input: {
  currentGroceryList?: CurrentGroceryListRecord | null;
  currentPlan?: MealPlanRecord | null;
  inventory: InventoryRecord[];
  mealMemory: MealMemoryRecord[];
  planHistory: MealPlanHistoryRecord[];
  preferences: MealPreferencesRecord;
}): MealsOnboardingCalibrationRecord {
  const calibration = readCalibration(input.preferences.raw);
  const excludedPantryNames = new Set(
    calibration.pantryItemCalibration
      .filter((entry) => entry.status === 'stale' || entry.status === 'accidental' || entry.status === 'not_representative')
      .map((entry) => normalizeText(entry.itemName)),
  );
  const usableInventory = input.inventory.filter((item) => isUsablePantryEvidence(item, excludedPantryNames));
  const staleOrExpiredCount = input.inventory.filter((item) => isStaleInventory(item)).length + excludedPantryNames.size;
  const storedConfirmedSignals = confirmedSignalsFromStoredCalibration(calibration.signals);
  const savedPreferenceSignals = confirmedSignalsFromPreferences(input.preferences);
  const confirmedPreferences = mergeMealsCalibrationSignals([...savedPreferenceSignals, ...storedConfirmedSignals])
    .filter((entry) => entry.status !== 'rejected')
    .slice(0, 24);
  const inferredMealSignals = inferMealSignals({
    inventory: usableInventory,
    mealMemory: input.mealMemory,
    planHistory: input.planHistory,
    preferences: input.preferences,
    storedSignals: calibration.signals,
  });
  const preferenceStatus = buildHouseholdPreferenceStatus(confirmedPreferences, input.preferences);
  const groceryListReadiness = {
    currentListPresent: Boolean(input.currentGroceryList),
    groceryExpectationConfirmed: preferenceStatus.groceryExpectationsConfirmed,
    pantryCheckCount: input.currentGroceryList?.counts.checkAtHomeCount ?? 0,
    trustState: input.currentGroceryList?.trustState ?? null,
  };
  const confidenceBreakdown = buildConfidenceBreakdown({
    confirmedPreferences,
    groceryListReadiness,
    inventory: usableInventory,
    mealMemory: input.mealMemory,
    planHistory: input.planHistory,
    preferenceStatus,
    staleOrExpiredCount,
  });
  const recipePlanHistoryCoverage = {
    activeRecipeMemoryCount: input.mealMemory.filter((entry) => entry.status !== 'retired').length,
    approvedPlanCount: input.planHistory.filter((entry) => entry.status === 'approved' || entry.status === 'active').length,
    recentPlanCount: input.planHistory.filter((entry) => entry.updatedAt || entry.approvedAt || entry.generatedAt).slice(0, 4).length,
    totalPlanCount: input.planHistory.length,
  };
  const pantryInventoryCoverage = {
    activeInventoryCount: usableInventory.length,
    excludedCalibrationCount: excludedPantryNames.size,
    hasImportedInventory: input.inventory.some((item) => isImportedPantryItem(item)),
    importedInventoryConfirmed: Boolean(calibration.pantryConfirmedAt),
    staleOrExpiredCount,
  };
  const setupState = deriveSetupState({
    confidenceBreakdown,
    confirmedPreferences,
    inferredMealSignals,
    pantryInventoryCoverage,
    preferences: input.preferences,
    recipePlanHistoryCoverage,
  });
  const mealPlanningReadiness = buildMealPlanningReadiness({
    confidenceBreakdown,
    setupState,
  });
  const groceryReadiness = buildGroceryReadiness({
    confidenceBreakdown,
    groceryListReadiness,
    pantryInventoryCoverage,
    setupState,
  });
  const calibrationPrompts = buildCalibrationPrompts({
    confirmedPreferences,
    inferredMealSignals,
    pantryInventoryCoverage,
    preferenceStatus,
  });
  const unresolvedQuestions = buildUnresolvedQuestions({
    confirmedPreferences,
    pantryInventoryCoverage,
    preferenceStatus,
  });
  const evidenceGaps = buildEvidenceGaps({
    groceryListReadiness,
    pantryInventoryCoverage,
    preferenceStatus,
    recipePlanHistoryCoverage,
  });
  const suggestedNextAction = buildSuggestedNextAction({
    confirmedPreferences,
    evidenceGaps,
    inferredMealSignals,
    pantryInventoryCoverage,
    setupState,
  });

  return {
    calibrationPrompts,
    confidenceBreakdown,
    confirmedPreferences,
    evidenceGaps,
    groceryListReadiness,
    groceryReadiness,
    hostGuidance: {
      answerMode: 'text_first',
      copyGuardrails: [
        'Start Meals setup and confidence-sensitive planning with meals_get_onboarding_calibration.',
        'Pantry ownership is evidence, not preference. Say "your pantry suggests" for pantry-derived patterns.',
        'Meal history and accepted plans can suggest patterns, but do not say "you like" unless the user confirmed it.',
        'Allergies, medical restrictions, and hard avoids require explicit user confirmation.',
        'If evidence is thin, offer a starter plan or grocery list with lower confidence instead of forcing a quiz.',
        'Do not claim a Meals setup widget mounted unless a ui:// resource visibly renders in the active host.',
      ],
      firstTool: 'meals_get_onboarding_calibration',
    },
    householdPreferenceStatus: preferenceStatus,
    inferredMealSignals,
    mealPlanningReadiness,
    pantryInventoryCoverage,
    recipePlanHistoryCoverage,
    setupState,
    suggestedNextAction,
    unresolvedQuestions,
  };
}

export function buildMealsCalibrationContext(
  calibration: MealsOnboardingCalibrationRecord,
): MealsCalibrationContextRecord {
  return {
    basis: calibration.mealPlanningReadiness.basis,
    confidenceBreakdown: calibration.confidenceBreakdown,
    copyGuardrails: calibration.hostGuidance.copyGuardrails,
    groceryReadiness: calibration.groceryReadiness,
    mealPlanningReadiness: calibration.mealPlanningReadiness,
    setupState: calibration.setupState,
  };
}

export function applyMealsCalibrationResponse(input: {
  now?: string;
  preferences: MealPreferencesRecord;
  response: MealsCalibrationResponseInput;
}): Record<string, unknown> {
  const now = input.now ?? new Date().toISOString();
  const nextRaw = cloneRecord(input.preferences.raw);
  const calibration = readCalibration(nextRaw);
  const nextSignals = [...calibration.signals];

  for (const signal of input.response.signals ?? []) {
    validateWritableSignal(signal);
    nextSignals.push(buildMealsCalibrationSignal({
      confidence: 1,
      correctedValue: signal.correctedValue ?? null,
      kind: signal.kind,
      note: signal.note ?? null,
      source: 'user_confirmed',
      status: signal.status,
      updatedAt: now,
      value: signal.value,
    }));
  }

  if (input.response.starterPreferenceText?.trim()) {
    applyPreferencePatch(nextRaw, inferStarterPreferencePatch(input.response.starterPreferenceText), now);
    nextSignals.push(buildMealsCalibrationSignal({
      confidence: 1,
      kind: 'starter_preference',
      note: 'User-provided starter meal preference text.',
      source: 'user_confirmed',
      status: 'confirmed',
      updatedAt: now,
      value: input.response.starterPreferenceText.trim(),
    }));
  }

  const nextPantry = [...calibration.pantryItemCalibration];
  let pantryReviewed = false;
  for (const entry of input.response.pantryItems ?? []) {
    const itemName = entry.itemName.trim();
    if (!itemName) {
      throw new Error('pantry_items.item_name is required when marking pantry evidence.');
    }
    pantryReviewed = true;
    nextPantry.push({
      itemName,
      note: entry.note ?? null,
      source: 'user_confirmed',
      status: entry.status,
      updatedAt: now,
    });
  }

  applyPreferencePatch(nextRaw, input.response.preferencePatch ?? null, now);

  const mergedSignals = mergeMealsCalibrationSignals(nextSignals);
  nextRaw.calibration = {
    ...calibration.raw,
    pantryConfirmedAt: pantryReviewed ? now : calibration.pantryConfirmedAt,
    pantryItemCalibration: mergePantryCalibration(nextPantry),
    signals: mergedSignals,
    starterPreferenceNotes: mergeStringArray(
      asStringArray(asRecord(calibration.raw)?.starterPreferenceNotes),
      input.response.starterPreferenceText?.trim() ? [input.response.starterPreferenceText.trim()] : [],
    ),
    updatedAt: now,
  };

  return nextRaw;
}

export function buildMealsCalibrationSignal(input: {
  confidence?: number | null;
  correctedValue?: string | null;
  kind: MealsCalibrationSignalKind;
  note?: string | null;
  source: MealsCalibrationSignalSource;
  status: MealsCalibrationSignalStatus;
  updatedAt?: string | null;
  value: string;
}): MealsCalibrationSignalRecord {
  const value = input.value.trim();
  return {
    confidence: clampConfidence(input.confidence ?? 0.5),
    correctedValue: input.correctedValue?.trim() || null,
    id: `meals-signal:${input.kind}:${slugSignalValue(value)}`,
    kind: input.kind,
    note: input.note ?? null,
    source: input.source,
    status: input.status,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    value,
  };
}

function readCalibration(raw: Record<string, unknown>): {
  pantryConfirmedAt: string | null;
  pantryItemCalibration: MealsPantryCalibrationRecord[];
  raw: Record<string, unknown>;
  signals: MealsCalibrationSignalRecord[];
} {
  const calibration = asRecord(raw.calibration) ?? {};
  const pantryItemCalibration = Array.isArray(calibration.pantryItemCalibration)
    ? calibration.pantryItemCalibration.reduce<MealsPantryCalibrationRecord[]>((items, entry) => {
        const record = asRecord(entry);
        const itemName = asNonEmptyString(record?.itemName ?? record?.item_name);
        const status = asNonEmptyString(record?.status);
        if (!itemName || !isPantryCalibrationStatus(status)) return items;
        items.push({
          itemName,
          note: asNonEmptyString(record?.note),
          source: normalizeSignalSource(asNonEmptyString(record?.source)) ?? 'user_confirmed',
          status,
          updatedAt: asNonEmptyString(record?.updatedAt ?? record?.updated_at),
        });
        return items;
      }, [])
    : [];
  const signals = Array.isArray(calibration.signals)
    ? calibration.signals.reduce<MealsCalibrationSignalRecord[]>((items, entry) => {
        const signal = normalizeStoredSignal(entry);
        if (signal) items.push(signal);
        return items;
      }, [])
    : [];
  return {
    pantryConfirmedAt: asNonEmptyString(calibration.pantryConfirmedAt ?? calibration.pantry_confirmed_at),
    pantryItemCalibration,
    raw: calibration,
    signals,
  };
}

function confirmedSignalsFromPreferences(preferences: MealPreferencesRecord): MealsCalibrationSignalRecord[] {
  const raw = preferences.raw;
  const coreRules = asRecord(raw.core_rules) ?? {};
  const household = asRecord(raw.household) ?? {};
  const planning = asRecord(raw.planning) ?? {};
  const shopping = asRecord(raw.shopping) ?? {};
  const signals: MealsCalibrationSignalRecord[] = [];
  const updatedAt = preferences.updatedAt;

  pushValues(signals, 'allergy', asStringArray(coreRules.allergies), updatedAt, 'Saved allergy in Meals preferences.');
  pushValues(signals, 'dietary_constraint', asStringArray(coreRules.dietary_constraints), updatedAt, 'Saved dietary constraint in Meals preferences.');
  pushValues(signals, 'disliked_food', asStringArray(coreRules.hard_avoids), updatedAt, 'Saved hard avoid in Meals preferences.');
  pushValues(signals, 'disliked_food', asStringArray(coreRules.dislikes), updatedAt, 'Saved dislike in Meals preferences.');
  pushValues(signals, 'preferred_cuisine', asStringArray(coreRules.preferred_cuisines), updatedAt, 'Saved cuisine preference in Meals preferences.');
  pushSingle(signals, 'household_shape', asNonEmptyString(household.shape ?? raw.household_shape), updatedAt);
  pushSingle(signals, 'cooking_cadence', asNonEmptyString(planning.cooking_cadence), updatedAt);
  const weeknightLimit = asNonNegativeNumber(planning.weeknight_time_limit_minutes);
  if (weeknightLimit != null) pushSingle(signals, 'weeknight_time_limit', `${weeknightLimit} minutes`, updatedAt);
  pushSingle(signals, 'budget_sensitivity', asNonEmptyString(shopping.budget_sensitivity), updatedAt);
  pushSingle(signals, 'leftover_preference', asNonEmptyString(planning.leftover_preference), updatedAt);
  pushSingle(signals, 'grocery_expectation', asNonEmptyString(shopping.grocery_expectation), updatedAt);

  return signals;
}

function pushValues(
  signals: MealsCalibrationSignalRecord[],
  kind: MealsCalibrationSignalKind,
  values: string[],
  updatedAt: string | null,
  note: string,
) {
  for (const value of values) {
    signals.push(buildMealsCalibrationSignal({
      confidence: 1,
      kind,
      note,
      source: 'user_confirmed',
      status: 'confirmed',
      updatedAt,
      value,
    }));
  }
}

function pushSingle(
  signals: MealsCalibrationSignalRecord[],
  kind: MealsCalibrationSignalKind,
  value: string | null,
  updatedAt: string | null,
) {
  if (!value) return;
  signals.push(buildMealsCalibrationSignal({
    confidence: 1,
    kind,
    source: 'user_confirmed',
    status: 'confirmed',
    updatedAt,
    value,
  }));
}

function confirmedSignalsFromStoredCalibration(signals: MealsCalibrationSignalRecord[]): MealsCalibrationSignalRecord[] {
  return signals
    .filter(
      (entry) =>
        entry.source === 'user_confirmed' &&
        (entry.status === 'confirmed' || entry.status === 'corrected' || entry.status === 'rejected'),
    )
    .map((entry) => {
      if (entry.status !== 'corrected' || !entry.correctedValue?.trim()) return entry;
      return {
        ...entry,
        note: entry.note ? `${entry.note} Original inferred value: ${entry.value}.` : `Corrected from inferred value: ${entry.value}.`,
        value: entry.correctedValue.trim(),
      };
    });
}

function inferMealSignals(input: {
  inventory: InventoryRecord[];
  mealMemory: MealMemoryRecord[];
  planHistory: MealPlanHistoryRecord[];
  preferences: MealPreferencesRecord;
  storedSignals: MealsCalibrationSignalRecord[];
}): MealsCalibrationSignalRecord[] {
  const suppressed = new Set(
    input.storedSignals
      .filter((entry) => entry.source === 'user_confirmed')
      .flatMap((entry) => [signalKey(entry.kind, entry.value), entry.correctedValue ? signalKey(entry.kind, entry.correctedValue) : null])
      .filter((entry): entry is string => Boolean(entry)),
  );
  const inferred: MealsCalibrationSignalRecord[] = [];
  const provenCount = input.mealMemory.filter((entry) => entry.status === 'proven').length;
  const trialCount = input.mealMemory.filter((entry) => entry.status === 'trial').length;
  if (provenCount >= 2) {
    inferred.push(buildMealsCalibrationSignal({
      confidence: Math.min(0.72, 0.4 + provenCount * 0.06),
      kind: 'meal_pattern',
      note: `Seen across ${provenCount} recipe memory entries marked proven.`,
      source: 'meal_history_inferred',
      status: 'inferred',
      value: 'repeats proven recipes',
    }));
  }
  if (trialCount > 0) {
    inferred.push(buildMealsCalibrationSignal({
      confidence: Math.min(0.62, 0.34 + trialCount * 0.05),
      kind: 'meal_pattern',
      note: `Seen across ${trialCount} recipe memory entries marked trial.`,
      source: 'meal_history_inferred',
      status: 'inferred',
      value: 'keeps room for trial meals',
    }));
  }
  if (input.planHistory.filter((entry) => entry.status === 'approved' || entry.status === 'active').length >= 2) {
    inferred.push(buildMealsCalibrationSignal({
      confidence: 0.58,
      kind: 'cooking_cadence',
      note: 'Multiple accepted or active meal plans exist.',
      source: 'meal_history_inferred',
      status: 'inferred',
      value: 'weekly planning cadence',
    }));
  }

  const pantryCounts = topCounts(
    input.inventory
      .filter((entry) => entry.longLifeDefault || entry.location === 'pantry')
      .map((entry) => pantryFamily(entry.name))
      .filter(Boolean),
  );
  for (const entry of pantryCounts.slice(0, 3)) {
    if (entry.count < 2) continue;
    inferred.push(buildMealsCalibrationSignal({
      confidence: Math.min(0.64, 0.32 + entry.count * 0.05),
      kind: 'pantry_pattern',
      note: `Pantry evidence includes ${entry.count} item(s) in this family. This is not confirmed preference.`,
      source: 'pantry_inferred',
      status: 'inferred',
      value: entry.value,
    }));
  }

  return mergeMealsCalibrationSignals(inferred)
    .filter((entry) => !suppressed.has(signalKey(entry.kind, entry.value)))
    .slice(0, 12);
}

function buildHouseholdPreferenceStatus(confirmed: MealsCalibrationSignalRecord[], preferences: MealPreferencesRecord) {
  const has = (kind: MealsCalibrationSignalKind) => confirmed.some((entry) => entry.kind === kind && entry.status !== 'rejected');
  const raw = preferences.raw;
  const coreRules = asRecord(raw.core_rules) ?? {};
  return {
    allergiesExplicitlyConfirmed: has('allergy') || Boolean(coreRules.allergies_confirmed_at),
    constraintsExplicitlyConfirmed: has('dietary_constraint') || Boolean(coreRules.dietary_constraints_confirmed_at),
    groceryExpectationsConfirmed: has('grocery_expectation'),
    hardAvoidsExplicitlyConfirmed: has('disliked_food') || Boolean(coreRules.hard_avoids_confirmed_at),
    householdShapeConfirmed: has('household_shape'),
    weeknightTimeLimitConfirmed: has('weeknight_time_limit'),
  };
}

function buildConfidenceBreakdown(input: {
  confirmedPreferences: MealsCalibrationSignalRecord[];
  groceryListReadiness: MealsOnboardingCalibrationRecord['groceryListReadiness'];
  inventory: InventoryRecord[];
  mealMemory: MealMemoryRecord[];
  planHistory: MealPlanHistoryRecord[];
  preferenceStatus: MealsOnboardingCalibrationRecord['householdPreferenceStatus'];
  staleOrExpiredCount: number;
}): MealsConfidenceBreakdown {
  const pantryCoverageConfidence = clampConfidence(
    Math.min(0.82, input.inventory.length * 0.055) -
      Math.min(0.28, input.staleOrExpiredCount * 0.045) +
      (input.inventory.some((entry) => Boolean(entry.confirmedAt)) ? 0.12 : 0),
  );
  const approvedPlanCount = input.planHistory.filter((entry) => entry.status === 'approved' || entry.status === 'active').length;
  const mealHistoryConfidence = clampConfidence(
    Math.min(0.72, approvedPlanCount * 0.1 + input.mealMemory.filter((entry) => entry.status !== 'retired').length * 0.045),
  );
  const requiredSignals = [
    input.preferenceStatus.householdShapeConfirmed,
    input.preferenceStatus.hardAvoidsExplicitlyConfirmed || input.preferenceStatus.allergiesExplicitlyConfirmed,
    input.preferenceStatus.weeknightTimeLimitConfirmed,
    input.preferenceStatus.groceryExpectationsConfirmed,
  ].filter(Boolean).length;
  const preferenceCalibrationConfidence = clampConfidence(
    Math.min(0.9, input.confirmedPreferences.filter((entry) => entry.status !== 'rejected').length * 0.09 + requiredSignals * 0.11),
  );
  const planningDecisionConfidence = clampConfidence(
    preferenceCalibrationConfidence * 0.5 + mealHistoryConfidence * 0.28 + pantryCoverageConfidence * 0.14 + (approvedPlanCount > 0 ? 0.08 : 0),
  );
  const groceryExpectationBoost = input.groceryListReadiness.groceryExpectationConfirmed ? 0.18 : 0;
  const currentListBoost = input.groceryListReadiness.currentListPresent ? 0.12 : 0;
  const groceryDecisionConfidence = clampConfidence(
    pantryCoverageConfidence * 0.42 + mealHistoryConfidence * 0.15 + preferenceCalibrationConfidence * 0.2 + groceryExpectationBoost + currentListBoost,
  );

  return {
    groceryDecisionConfidence,
    mealHistoryConfidence,
    pantryCoverageConfidence,
    planningDecisionConfidence,
    preferenceCalibrationConfidence,
  };
}

function deriveSetupState(input: {
  confidenceBreakdown: MealsConfidenceBreakdown;
  confirmedPreferences: MealsCalibrationSignalRecord[];
  inferredMealSignals: MealsCalibrationSignalRecord[];
  pantryInventoryCoverage: MealsOnboardingCalibrationRecord['pantryInventoryCoverage'];
  preferences: MealPreferencesRecord;
  recipePlanHistoryCoverage: MealsOnboardingCalibrationRecord['recipePlanHistoryCoverage'];
}): MealsSetupState {
  const hasPreferenceDocument = Object.keys(input.preferences.raw).some((key) => key !== 'updated_at');
  if (
    input.confirmedPreferences.length >= 5 &&
    input.confidenceBreakdown.preferenceCalibrationConfidence >= 0.68 &&
    input.confidenceBreakdown.planningDecisionConfidence >= 0.62 &&
    input.confidenceBreakdown.groceryDecisionConfidence >= 0.55
  ) {
    return 'meals_calibrated';
  }
  if (input.confirmedPreferences.length > 0 && input.inferredMealSignals.length > 0) {
    return 'preferences_partially_confirmed';
  }
  if (input.inferredMealSignals.length > 0) {
    return 'preferences_inferred';
  }
  if (
    input.pantryInventoryCoverage.hasImportedInventory &&
    !input.pantryInventoryCoverage.importedInventoryConfirmed &&
    input.pantryInventoryCoverage.activeInventoryCount > 0
  ) {
    return 'pantry_imported_unconfirmed';
  }
  if (input.recipePlanHistoryCoverage.approvedPlanCount > 0 || input.recipePlanHistoryCoverage.activeRecipeMemoryCount > 0) {
    return 'planning_evidence_ready';
  }
  if (input.confirmedPreferences.length > 0) {
    return 'starter_preferences_ready';
  }
  if (hasPreferenceDocument || input.pantryInventoryCoverage.activeInventoryCount > 0) {
    return 'setup_started';
  }
  return 'no_meals_state';
}

function buildMealPlanningReadiness(input: {
  confidenceBreakdown: MealsConfidenceBreakdown;
  setupState: MealsSetupState;
}): MealsReadinessRecord {
  const notes: string[] = [];
  if (input.confidenceBreakdown.preferenceCalibrationConfidence < 0.35) {
    notes.push('Household preferences are thin; use starter-plan language and ask at most a few confirmation questions.');
  }
  if (input.confidenceBreakdown.mealHistoryConfidence > 0 && input.confidenceBreakdown.preferenceCalibrationConfidence < 0.5) {
    notes.push('Meal history can guide suggestions, but it is not confirmed preference.');
  }
  if (input.setupState === 'no_meals_state') {
    return {
      basis: 'no_evidence',
      label: 'I can build a starter plan, but I do not know your household preferences yet.',
      notes: [...notes, 'Ask for 3-5 starter signals or offer a simple weeknight plan.'],
      ready: true,
      readinessLevel: 'provisional',
    };
  }
  if (input.confidenceBreakdown.planningDecisionConfidence >= 0.65) {
    return {
      basis: input.confidenceBreakdown.preferenceCalibrationConfidence >= 0.68 ? 'confirmed_preferences' : 'mixed_evidence',
      label: 'Meals is ready for ordinary planning with visible confidence.',
      notes,
      ready: true,
      readinessLevel: input.confidenceBreakdown.preferenceCalibrationConfidence >= 0.68 ? 'ready' : 'provisional',
    };
  }
  return {
    basis: 'thin_or_inferred_evidence',
    label: 'Meals can plan provisionally, but should explain what it is relying on.',
    notes,
    ready: true,
    readinessLevel: 'provisional',
  };
}

function buildGroceryReadiness(input: {
  confidenceBreakdown: MealsConfidenceBreakdown;
  groceryListReadiness: MealsOnboardingCalibrationRecord['groceryListReadiness'];
  pantryInventoryCoverage: MealsOnboardingCalibrationRecord['pantryInventoryCoverage'];
  setupState: MealsSetupState;
}): MealsReadinessRecord {
  const notes: string[] = [];
  if (input.pantryInventoryCoverage.excludedCalibrationCount > 0) {
    notes.push(`${input.pantryInventoryCoverage.excludedCalibrationCount} pantry item(s) marked stale, accidental, or not representative are excluded from confidence.`);
  }
  if (!input.groceryListReadiness.groceryExpectationConfirmed) {
    notes.push('Grocery-list expectations are not confirmed.');
  }
  if (input.groceryListReadiness.pantryCheckCount > 0) {
    notes.push(`${input.groceryListReadiness.pantryCheckCount} item(s) still need a pantry check before shopping.`);
  }
  if (input.confidenceBreakdown.groceryDecisionConfidence >= 0.62) {
    return {
      basis: 'pantry_and_grocery_expectation',
      label: 'Grocery list generation is ready with pantry confidence visible.',
      notes,
      ready: true,
      readinessLevel: 'ready',
    };
  }
  return {
    basis: input.pantryInventoryCoverage.activeInventoryCount > 0 ? 'pantry_evidence_unconfirmed' : 'no_pantry_evidence',
    label:
      input.pantryInventoryCoverage.activeInventoryCount > 0
        ? 'Grocery lists can use pantry evidence, but should ask the user to verify uncertain items.'
        : 'Grocery lists can be generated from a plan, but pantry coverage is unknown.',
    notes,
    ready: input.setupState !== 'no_meals_state',
    readinessLevel: 'provisional',
  };
}

function buildCalibrationPrompts(input: {
  confirmedPreferences: MealsCalibrationSignalRecord[];
  inferredMealSignals: MealsCalibrationSignalRecord[];
  pantryInventoryCoverage: MealsOnboardingCalibrationRecord['pantryInventoryCoverage'];
  preferenceStatus: MealsOnboardingCalibrationRecord['householdPreferenceStatus'];
}): MealsCalibrationPromptRecord[] {
  const prompts: MealsCalibrationPromptRecord[] = [];
  if (input.confirmedPreferences.length === 0) {
    prompts.push({
      id: 'starter-meals-signals',
      kind: 'starter_signal',
      label: 'Add starter meal signals',
      question: 'Tell me household shape, hard avoids or allergies, cooking cadence, weeknight time, and grocery expectation in one short answer.',
      rationale: 'A few real signals make the first plan useful without a quiz wall.',
      responseOptions: [
        { label: 'Save starter signals', requiresFreeText: 'starter_preference_text', source: 'user_confirmed', status: 'confirmed', value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'meals_record_calibration_response',
    });
  }
  for (const signal of input.inferredMealSignals.slice(0, 3)) {
    prompts.push({
      id: `confirm-${signal.id.replace(/[^a-z0-9:-]+/gi, '-')}`,
      kind: 'confirm_signal',
      label: `Confirm ${signal.kind.replace(/_/g, ' ')}`,
      question: `${signal.source === 'pantry_inferred' ? 'Your pantry suggests' : 'Your meal history suggests'} ${signal.value}. Is that useful, wrong, or just incidental?`,
      rationale: 'Confirming or correcting a Meals pattern turns evidence into calibrated preference.',
      responseOptions: [
        { label: 'Confirm', requiresFreeText: null, source: 'user_confirmed', status: 'confirmed', value: signal.value },
        { label: 'Correct with text', requiresFreeText: 'corrected_value', source: 'user_confirmed', status: 'corrected', value: signal.value },
        { label: 'Not representative', requiresFreeText: null, source: 'user_confirmed', status: 'rejected', value: signal.value },
      ],
      signal: {
        id: signal.id,
        kind: signal.kind,
        source: signal.source,
        value: signal.value,
      },
      toolName: 'meals_record_calibration_response',
    });
  }
  if (!input.preferenceStatus.weeknightTimeLimitConfirmed) {
    prompts.push({
      id: 'weeknight-time-limit',
      kind: 'constraint',
      label: 'Set weeknight limit',
      question: 'What weeknight dinner time limit should Fluent plan around?',
      rationale: 'This changes planning quality more than a long preference quiz.',
      responseOptions: [
        { label: 'Save minutes', requiresFreeText: 'weeknight_time_limit_minutes', source: 'user_confirmed', status: 'confirmed', value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'meals_record_calibration_response',
    });
  }
  if (!input.preferenceStatus.groceryExpectationsConfirmed) {
    prompts.push({
      id: 'grocery-expectation',
      kind: 'grocery_expectation',
      label: 'Set grocery expectation',
      question: 'Should grocery lists assume pantry verification, exact shopping lists, budget sensitivity, or a quick weeknight restock?',
      rationale: 'Grocery-list confidence depends on knowing how strict the list should be.',
      responseOptions: [
        { label: 'Save expectation', requiresFreeText: 'grocery_expectation', source: 'user_confirmed', status: 'confirmed', value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'meals_record_calibration_response',
    });
  }
  if (input.pantryInventoryCoverage.hasImportedInventory && !input.pantryInventoryCoverage.importedInventoryConfirmed) {
    prompts.push({
      id: 'pantry-review',
      kind: 'pantry_review',
      label: 'Review pantry evidence',
      question: 'Anything in the pantry list stale, accidental, or not representative of how you eat?',
      rationale: 'Pantry evidence improves grocery planning, but ownership is not preference.',
      responseOptions: [
        { label: 'Mark pantry item', requiresFreeText: 'pantry_item', source: 'user_confirmed', status: 'confirmed', value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'meals_record_calibration_response',
    });
  }
  if (prompts.length === 0) {
    prompts.push({
      id: 'opportunistic-calibration',
      kind: 'opportunistic',
      label: 'Calibrate while planning',
      question: 'Use Meals normally; Fluent can ask one correction only when a plan depends on an inferred pattern.',
      rationale: 'Meals setup should stay practical and decision-shaped.',
      responseOptions: [{ label: 'Continue with visible confidence', requiresFreeText: null, source: null, status: null, value: null }],
      signal: null,
      toolName: null,
    });
  }
  return prompts.slice(0, 5);
}

function buildUnresolvedQuestions(input: {
  confirmedPreferences: MealsCalibrationSignalRecord[];
  pantryInventoryCoverage: MealsOnboardingCalibrationRecord['pantryInventoryCoverage'];
  preferenceStatus: MealsOnboardingCalibrationRecord['householdPreferenceStatus'];
}): string[] {
  const questions: string[] = [];
  if (!input.preferenceStatus.householdShapeConfirmed) questions.push('Household shape is not confirmed.');
  if (!input.preferenceStatus.hardAvoidsExplicitlyConfirmed && !input.preferenceStatus.allergiesExplicitlyConfirmed) {
    questions.push('Hard avoids and allergies have not been explicitly confirmed.');
  }
  if (!input.preferenceStatus.weeknightTimeLimitConfirmed) questions.push('Weeknight cooking time limit is unknown.');
  if (!input.preferenceStatus.groceryExpectationsConfirmed) questions.push('Grocery-list expectations are unknown.');
  if (input.pantryInventoryCoverage.hasImportedInventory && !input.pantryInventoryCoverage.importedInventoryConfirmed) {
    questions.push('Imported pantry evidence has not been reviewed for stale or accidental items.');
  }
  if (input.confirmedPreferences.length === 0) questions.push('No Meals preference has been explicitly confirmed yet.');
  return questions.slice(0, 5);
}

function buildEvidenceGaps(input: {
  groceryListReadiness: MealsOnboardingCalibrationRecord['groceryListReadiness'];
  pantryInventoryCoverage: MealsOnboardingCalibrationRecord['pantryInventoryCoverage'];
  preferenceStatus: MealsOnboardingCalibrationRecord['householdPreferenceStatus'];
  recipePlanHistoryCoverage: MealsOnboardingCalibrationRecord['recipePlanHistoryCoverage'];
}): string[] {
  const gaps: string[] = [];
  if (input.pantryInventoryCoverage.activeInventoryCount === 0) gaps.push('No usable pantry or inventory evidence.');
  if (input.recipePlanHistoryCoverage.approvedPlanCount === 0) gaps.push('No accepted meal-plan history.');
  if (input.recipePlanHistoryCoverage.activeRecipeMemoryCount === 0) gaps.push('No active recipe memory.');
  if (!input.preferenceStatus.groceryExpectationsConfirmed) gaps.push('Grocery expectation missing.');
  if (input.groceryListReadiness.pantryCheckCount > 0) gaps.push('Current grocery list still has pantry checks.');
  if (input.pantryInventoryCoverage.staleOrExpiredCount > 0) gaps.push('Some pantry evidence is stale, expired, accidental, or not representative.');
  return gaps.slice(0, 6);
}

function buildSuggestedNextAction(input: {
  confirmedPreferences: MealsCalibrationSignalRecord[];
  evidenceGaps: string[];
  inferredMealSignals: MealsCalibrationSignalRecord[];
  pantryInventoryCoverage: MealsOnboardingCalibrationRecord['pantryInventoryCoverage'];
  setupState: MealsSetupState;
}) {
  if (input.setupState === 'no_meals_state' || input.confirmedPreferences.length === 0) {
    return {
      label: 'Save 3-5 starter meal signals or start a simple weeknight plan',
      rationale: 'Household shape, hard avoids or allergies, cadence, weeknight time, and grocery expectation are enough to start, but the user can skip and plan with lower confidence.',
      toolName: input.setupState === 'no_meals_state' ? 'meals_generate_plan' : 'meals_record_calibration_response',
    };
  }
  if (input.inferredMealSignals.length > 0 && input.setupState === 'preferences_inferred') {
    return {
      label: 'Confirm one inferred meal signal',
      rationale: 'One confirmed or corrected pattern is more useful than treating history as taste.',
      toolName: 'meals_record_calibration_response',
    };
  }
  if (input.pantryInventoryCoverage.hasImportedInventory && !input.pantryInventoryCoverage.importedInventoryConfirmed) {
    return {
      label: 'Mark stale or accidental pantry items',
      rationale: 'Pantry confidence should not rise from items that do not represent how the household eats now.',
      toolName: 'meals_record_calibration_response',
    };
  }
  if (input.evidenceGaps.length > 0) {
    return {
      label: 'Resolve one Meals evidence gap',
      rationale: input.evidenceGaps[0] ?? 'A small correction improves plan and grocery confidence.',
      toolName: 'meals_record_calibration_response',
    };
  }
  return {
    label: input.setupState === 'meals_calibrated' ? 'Use Meals normally' : 'Start with a simple weeknight plan',
    rationale: 'Fluent can keep confidence visible and calibrate only when a recommendation depends on uncertain evidence.',
    toolName: input.setupState === 'meals_calibrated' ? null : 'meals_generate_plan',
  };
}

function applyPreferencePatch(
  raw: Record<string, unknown>,
  patch: MealsCalibrationResponseInput['preferencePatch'],
  now: string,
): void {
  if (!patch) return;
  const coreRules = { ...(asRecord(raw.core_rules) ?? {}) };
  const household = { ...(asRecord(raw.household) ?? {}) };
  const planning = { ...(asRecord(raw.planning) ?? {}) };
  const shopping = { ...(asRecord(raw.shopping) ?? {}) };

  if (patch.householdShape?.trim()) household.shape = patch.householdShape.trim();
  if (patch.hardAvoids != null) {
    coreRules.hard_avoids = patch.hardAvoids.length > 0 ? mergeStringArray(asStringArray(coreRules.hard_avoids), patch.hardAvoids) : [];
    coreRules.hard_avoids_confirmed_at = now;
  }
  if (patch.dislikes) coreRules.dislikes = mergeStringArray(asStringArray(coreRules.dislikes), patch.dislikes);
  if (patch.allergies != null) {
    coreRules.allergies = patch.allergies.length > 0 ? mergeStringArray(asStringArray(coreRules.allergies), patch.allergies) : [];
    coreRules.allergies_confirmed_at = now;
  }
  if (patch.dietaryConstraints != null) {
    coreRules.dietary_constraints =
      patch.dietaryConstraints.length > 0 ? mergeStringArray(asStringArray(coreRules.dietary_constraints), patch.dietaryConstraints) : [];
    coreRules.dietary_constraints_confirmed_at = now;
  }
  if (patch.preferredCuisines) {
    coreRules.preferred_cuisines = mergeStringArray(asStringArray(coreRules.preferred_cuisines), patch.preferredCuisines);
  }
  if (patch.cookingCadence?.trim()) planning.cooking_cadence = patch.cookingCadence.trim();
  if (typeof patch.weeknightTimeLimitMinutes === 'number' && Number.isFinite(patch.weeknightTimeLimitMinutes)) {
    planning.weeknight_time_limit_minutes = Math.max(0, Math.round(patch.weeknightTimeLimitMinutes));
  }
  if (patch.leftoverPreference?.trim()) planning.leftover_preference = patch.leftoverPreference.trim();
  if (patch.budgetSensitivity?.trim()) shopping.budget_sensitivity = patch.budgetSensitivity.trim();
  if (patch.groceryExpectation?.trim()) shopping.grocery_expectation = patch.groceryExpectation.trim();

  raw.core_rules = coreRules;
  raw.household = household;
  raw.planning = planning;
  raw.shopping = shopping;
  raw.updated_at = now;
}

function inferStarterPreferencePatch(text: string): MealsCalibrationResponseInput['preferencePatch'] {
  const value = text.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  const patch: NonNullable<MealsCalibrationResponseInput['preferencePatch']> = {};

  const householdMatch =
    lower.match(/\b(?:household|family)\s+of\s+(\d+)\b/) ??
    lower.match(/\b(\d+)\s+(?:people|adults?|kids?|children)\b/);
  if (householdMatch) {
    patch.householdShape = householdMatch[0];
  } else if (/\b(adult|child|kid|family|household|couple)\b/.test(lower)) {
    patch.householdShape = value;
  }

  if (/\bno (?:known )?(?:food )?allerg(?:y|ies)\b/.test(lower)) {
    patch.allergies = [];
  } else {
    const allergyMatch = lower.match(/\ballerg(?:y|ic|ies)?(?:\s+to)?\s+([^.;]+)/);
    if (allergyMatch?.[1]) patch.allergies = splitStarterList(allergyMatch[1]);
  }

  if (/\bno (?:known )?(?:hard )?(?:avoids?|foods? to avoid)\b/.test(lower)) {
    patch.hardAvoids = [];
  } else {
    const avoidMatch = lower.match(/\b(?:avoid|hard avoid|never)\s+([^.;]+)/);
    if (avoidMatch?.[1] && !avoidMatch[1].includes('allerg')) {
      patch.hardAvoids = splitStarterList(avoidMatch[1]);
    }
  }

  const cadenceMatch =
    lower.match(/\b(\d+)\s+(?:weeknight\s+)?(?:dinners?|meals?|nights?)\b/) ??
    lower.match(/\b(?:cook|cooking|dinner)\s+([^.;]*(?:week|night|weekday|weeknight)[^.;]*)/);
  if (cadenceMatch) patch.cookingCadence = cadenceMatch[0];

  const timeMatch = lower.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/);
  if (timeMatch?.[1]) {
    patch.weeknightTimeLimitMinutes = Number(timeMatch[1]);
  }

  if (/\bgrocer(?:y|ies)|shopping list|shop|restock|pantry check|exact list|quantit(?:y|ies)|budget\b/.test(lower)) {
    patch.groceryExpectation = value;
  }
  if (/\bleftovers?\b/.test(lower)) {
    patch.leftoverPreference = value;
  }
  if (/\bbudget|cheap|affordable|price|cost\b/.test(lower)) {
    patch.budgetSensitivity = value;
  }

  const dietWords = ['vegetarian', 'vegan', 'gluten-free', 'gluten free', 'dairy-free', 'dairy free', 'halal', 'kosher', 'pescatarian'];
  const dietaryConstraints = dietWords.filter((word) => lower.includes(word));
  if (dietaryConstraints.length > 0) patch.dietaryConstraints = dietaryConstraints;

  return Object.keys(patch).length > 0 ? patch : null;
}

function splitStarterList(text: string): string[] {
  return text
    .split(/,|\band\b|\bor\b/)
    .map((entry) => entry.trim().replace(/\b(?:for|with|please|but|except)\b.*$/i, '').trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 8);
}

function validateWritableSignal(signal: NonNullable<MealsCalibrationResponseInput['signals']>[number]): void {
  if (!signal.value.trim()) {
    throw new Error('signals.value is required when recording Meals calibration.');
  }
  if (signal.status === 'corrected' && !signal.correctedValue?.trim()) {
    throw new Error('signals.corrected_value is required when status is corrected.');
  }
  if (signal.kind === 'allergy' || signal.kind === 'dietary_constraint' || signal.kind === 'disliked_food') {
    if (signal.status !== 'confirmed' && signal.status !== 'corrected' && signal.status !== 'rejected') {
      throw new Error('Allergies, dietary constraints, and hard avoids require explicit user confirmation or rejection.');
    }
  }
}

function normalizeStoredSignal(value: unknown): MealsCalibrationSignalRecord | null {
  const record = asRecord(value);
  const kind = asNonEmptyString(record?.kind);
  const source = normalizeSignalSource(asNonEmptyString(record?.source));
  const status = normalizeSignalStatus(asNonEmptyString(record?.status));
  const signalValue = asNonEmptyString(record?.value);
  if (!record || !kind || !isSignalKind(kind) || !source || !status || !signalValue) return null;
  return {
    confidence: clampConfidence(asNonNegativeNumber(record.confidence) ?? 0.5),
    correctedValue: asNonEmptyString(record.correctedValue ?? record.corrected_value),
    id: asNonEmptyString(record.id) ?? `meals-signal:${kind}:${slugSignalValue(signalValue)}`,
    kind,
    note: asNonEmptyString(record.note),
    source,
    status,
    updatedAt: asNonEmptyString(record.updatedAt ?? record.updated_at),
    value: signalValue,
  };
}

function mergeMealsCalibrationSignals(signals: MealsCalibrationSignalRecord[]): MealsCalibrationSignalRecord[] {
  const byKey = new Map<string, MealsCalibrationSignalRecord>();
  for (const signal of signals) {
    byKey.set(signalKey(signal.kind, signal.value), signal);
  }
  return [...byKey.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.value.localeCompare(right.value));
}

function mergePantryCalibration(entries: MealsPantryCalibrationRecord[]): MealsPantryCalibrationRecord[] {
  const byName = new Map<string, MealsPantryCalibrationRecord>();
  for (const entry of entries) {
    byName.set(normalizeText(entry.itemName), entry);
  }
  return [...byName.values()].sort((left, right) => left.itemName.localeCompare(right.itemName));
}

function isUsablePantryEvidence(item: InventoryRecord, excludedPantryNames: Set<string>): boolean {
  if (excludedPantryNames.has(normalizeText(item.name))) return false;
  const status = normalizeText(item.status);
  if (status === 'removed' || status === 'deleted' || status === 'stale' || status === 'expired' || status === 'accidental') {
    return false;
  }
  return true;
}

function isStaleInventory(item: InventoryRecord): boolean {
  const status = normalizeText(item.status);
  if (status === 'stale' || status === 'expired' || status === 'accidental') return true;
  const expiry = item.estimatedExpiry;
  if (!expiry) return false;
  return expiry < new Date().toISOString().slice(0, 10);
}

function isImportedPantryItem(item: InventoryRecord): boolean {
  const metadata = asRecord(item.metadata);
  const source = normalizeText(item.source ?? '');
  return source.includes('import') || source.includes('receipt') || source.includes('grocery') || Boolean(metadata?.importedAt ?? metadata?.imported_at);
}

function pantryFamily(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (/\b(oat|granola|cereal)\b/.test(normalized)) return 'breakfast staples';
  if (/\b(bean|lentil|chickpea)\b/.test(normalized)) return 'legumes';
  if (/\b(rice|pasta|noodle|grain)\b/.test(normalized)) return 'grains';
  if (/\b(yogurt|milk|cheese)\b/.test(normalized)) return 'dairy';
  if (/\b(oil|vinegar|sauce|spice|salt|pepper)\b/.test(normalized)) return 'pantry seasonings';
  return normalized;
}

function topCounts(values: string[]): Array<{ count: number; value: string }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ count, value }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function mergeStringArray(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming].map((entry) => entry.trim()).filter(Boolean)));
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function signalKey(kind: MealsCalibrationSignalKind, value: string): string {
  return `${kind}:${slugSignalValue(value)}`;
}

function slugSignalValue(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || crypto.randomUUID();
}

function clampConfidence(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function normalizeSignalSource(value: string | null): MealsCalibrationSignalSource | null {
  return value === 'user_confirmed' ||
    value === 'meal_history_inferred' ||
    value === 'pantry_inferred' ||
    value === 'recipe_metadata' ||
    value === 'grocery_action_inferred' ||
    value === 'fallback'
    ? value
    : null;
}

function normalizeSignalStatus(value: string | null): MealsCalibrationSignalStatus | null {
  return value === 'inferred' || value === 'confirmed' || value === 'corrected' || value === 'rejected' ? value : null;
}

function isSignalKind(value: string): value is MealsCalibrationSignalKind {
  return [
    'household_shape',
    'disliked_food',
    'allergy',
    'dietary_constraint',
    'preferred_cuisine',
    'cooking_cadence',
    'weeknight_time_limit',
    'budget_sensitivity',
    'leftover_preference',
    'grocery_expectation',
    'meal_pattern',
    'pantry_pattern',
    'starter_preference',
  ].includes(value);
}

function isPantryCalibrationStatus(value: string | null): value is MealsPantryCalibrationStatus {
  return value === 'stale' || value === 'accidental' || value === 'not_representative' || value === 'representative';
}
