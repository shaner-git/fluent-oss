import { asNonEmptyString, asNonNegativeNumber, asRecord, asStringArray } from './helpers';
import type {
  DomainEventRecord,
  DomainEventSummaryRecord,
  GroceryPlanRecord,
  GroceryPlanSummaryRecord,
  MealPlanRecord,
  MealPlanSummaryRecord,
  MealPreferencesRecord,
  MealPreferencesSummaryRecord,
  PreparedOrderRecord,
  PreparedOrderSummaryRecord,
  MutationAckRecord,
} from './types';

export function summarizeMealPlan(plan: MealPlanRecord | null): MealPlanSummaryRecord | null {
  if (!plan) return null;

  const recipeIds = Array.from(
    new Set(plan.entries.map((entry) => entry.recipeId).filter((value): value is string => Boolean(value))),
  );
  const recipeNamePreview = Array.from(
    new Set(
      plan.entries
        .map((entry) => entry.recipeNameSnapshot)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  ).slice(0, 8);
  const mealTypes = Array.from(
    new Set(
      plan.entries
        .map((entry) => entry.mealType)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  );

  return {
    id: plan.id,
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    status: plan.status,
    generatedAt: plan.generatedAt,
    approvedAt: plan.approvedAt,
    updatedAt: plan.updatedAt,
    profileOwner: plan.profileOwner,
    entryCount: plan.entries.length,
    mealTypes,
    recipeIds,
    recipeNamePreview,
    summary: plan.summary,
    executionSupportSummary: deriveExecutionSupportSummary(plan),
    trainingAlignmentSummary: deriveTrainingAlignmentSummary(plan),
  };
}

export function summarizeMealPreferences(preferences: MealPreferencesRecord): MealPreferencesSummaryRecord {
  const raw = preferences.raw;
  const coreRules = asRecord(raw.core_rules);
  const shopping = asRecord(raw.shopping);
  const inventory = asRecord(raw.inventory);
  const familyConstraints = asRecord(raw.family_constraints);
  const rootBrandPreferences = raw.hosted_brand_preferences;
  const shoppingBrandPreferences = shopping?.hosted_brand_preferences;
  const brandPreferenceFamiliesCount = Array.isArray(rootBrandPreferences)
    ? rootBrandPreferences.length
    : Array.isArray(shoppingBrandPreferences)
      ? shoppingBrandPreferences.length
      : asRecord(rootBrandPreferences)
        ? Object.keys(asRecord(rootBrandPreferences) ?? {}).length
        : 0;

  return {
    version: preferences.version,
    updatedAt: preferences.updatedAt,
    profileOwner: preferences.profileOwner,
    calendarCheckRequiredBeforePlanning: raw.calendar_check_required_before_planning === true,
    hardAvoids: asStringArray(coreRules?.hard_avoids),
    preferredCuisines: asStringArray(coreRules?.preferred_cuisines),
    dinnerRules: Object.entries(familyConstraints ?? {})
      .filter(([, value]) => value === true)
      .map(([key]) => key),
    budgetCadPerMeal: asNonNegativeNumber(asRecord(shopping?.budget)?.price_cap_per_meal_cad),
    longLifeDefaultsCount: asStringArray(inventory?.long_life_defaults).length,
    hostedBrandPreferenceFamiliesCount: brandPreferenceFamiliesCount,
  };
}

export function summarizeGroceryPlan(plan: GroceryPlanRecord | null): GroceryPlanSummaryRecord | null {
  if (!plan) return null;

  const unresolvedCount = plan.raw.items.filter((item) => item.uncertainty !== null).length;
  const pantryCheckCount = plan.raw.items.filter((item) => item.inventoryStatus === 'check_pantry').length;
  return {
    id: plan.id,
    weekStart: plan.weekStart,
    mealPlanId: plan.mealPlanId,
    generatedAt: plan.generatedAt,
    itemCount: plan.raw.items.filter((item) => item.inventoryStatus !== 'check_pantry').length,
    pantryCheckCount,
    notesCount: plan.raw.notes.length,
    unresolvedCount,
    actionsAppliedCount: plan.raw.actionsAppliedCount,
    preferencesVersion: plan.raw.preferencesVersion,
    profileOwner: plan.raw.profileOwner,
    resolvedCount: plan.raw.resolvedItems.length,
    sources: plan.raw.sources,
    resolvedPreview: plan.raw.resolvedItems.slice(0, 10).map((item) => ({
      name: item.name,
      actionStatus: item.actionStatus ?? null,
      substituteDisplayName: item.substitute?.displayName ?? null,
    })),
    itemPreview: plan.raw.items.slice(0, 10).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      inventoryStatus: item.inventoryStatus,
      uncertainty: item.uncertainty,
      preferredBrands: item.preferredBrands,
    })),
  };
}

export function summarizePreparedOrder(order: PreparedOrderRecord | null): PreparedOrderSummaryRecord | null {
  if (!order) return null;

  return {
    weekStart: order.weekStart,
    retailer: order.retailer,
    safeToOrder: order.safeToOrder,
    remainingCount: order.remainingToBuy.length,
    coveredCount: order.alreadyCoveredByInventory.length,
    inCartCount: order.alreadyInRetailerCart.length,
    unresolvedCount: order.unresolvedItems.length,
    substitutionCount: order.substitutionDecisions.length,
    freshness: order.freshness,
    remainingPreview: order.remainingToBuy.slice(0, 10).map((item) => ({
      displayName: item.displayName,
      quantity: item.quantity,
      unit: item.unit,
    })),
    unresolvedPreview: order.unresolvedItems.slice(0, 10).map((item) => ({
      displayName: item.displayName,
      reason: item.reason,
      sufficiencyConfirmationEligible: item.sufficiencyConfirmationEligible,
    })),
    notes: order.notes,
  };
}

export function summarizeDomainEvent(event: DomainEventRecord): DomainEventSummaryRecord {
  return {
    id: event.id,
    domain: event.domain,
    entityType: event.entityType,
    entityId: event.entityId,
    eventType: event.eventType,
    createdAt: event.createdAt,
    sourceAgent: event.sourceAgent,
    sourceSkill: event.sourceSkill,
    sourceType: event.sourceType,
    actorName: event.actorName,
    actorEmail: event.actorEmail,
    patchKeys: event.patch && typeof event.patch === 'object' && !Array.isArray(event.patch) ? Object.keys(event.patch) : [],
  };
}

export function summarizeDomainEvents(events: DomainEventRecord[]): DomainEventSummaryRecord[] {
  return events.map(summarizeDomainEvent);
}

export function buildMutationAck(
  entityType: string,
  entityId: string,
  action: string,
  updatedAt: string | null,
  details?: Record<string, unknown>,
): MutationAckRecord {
  return { entityId, entityType, action, updatedAt, details };
}

export function deriveExecutionSupportSummary(plan: MealPlanRecord | null): MealPlanSummaryRecord['executionSupportSummary'] {
  if (!plan) {
    return {
      mealPlanPresent: false,
      groceryReadiness: 'at_risk',
      executionFriction: 'high',
      proteinSupportConfidence: 'low',
      weeknightComplexity: 'high',
    };
  }

  const weekdayDinnerEntries = plan.entries.filter((entry) => {
    if (!entry.date || entry.mealType !== 'dinner') {
      return false;
    }
    const weekday = new Date(`${entry.date}T12:00:00Z`).getUTCDay();
    return weekday >= 1 && weekday <= 5;
  });
  const grocerySummary = asRecord(asRecord(plan.summary)?.grocerySupportSummary);
  const unresolvedCount = asNonNegativeNumber(grocerySummary?.unresolvedCount) ?? 0;
  const pantryCheckCount = asNonNegativeNumber(grocerySummary?.pantryCheckCount) ?? 0;
  const totalDinnerMinutes =
    weekdayDinnerEntries.reduce((total, entry) => total + (entry.totalMinutes ?? entry.prepMinutes ?? 0), 0) ?? 0;
  const averageDinnerMinutes =
    weekdayDinnerEntries.length > 0 ? totalDinnerMinutes / weekdayDinnerEntries.length : 0;
  const groceryReadiness =
    unresolvedCount === 0 && pantryCheckCount === 0
      ? 'ready'
      : weekdayDinnerEntries.length > 0
        ? 'partial'
        : 'at_risk';
  const weeknightComplexity =
    averageDinnerMinutes >= 45 ? 'high' : averageDinnerMinutes >= 30 ? 'medium' : weekdayDinnerEntries.length > 0 ? 'low' : 'medium';
  const proteinSupportConfidence =
    plan.entries.length >= 10 ? 'high' : plan.entries.length >= 6 ? 'medium' : 'low';
  const executionFriction =
    groceryReadiness === 'at_risk' || weeknightComplexity === 'high'
      ? 'high'
      : groceryReadiness === 'partial' || weeknightComplexity === 'medium'
        ? 'medium'
        : 'low';

  return {
    mealPlanPresent: true,
    groceryReadiness,
    executionFriction,
    proteinSupportConfidence,
    weeknightComplexity,
  };
}

export function deriveTrainingAlignmentSummary(
  plan: MealPlanRecord | null,
): MealPlanSummaryRecord['trainingAlignmentSummary'] {
  if (!plan) {
    return {
      trainingContextUsed: false,
      trainingDays: [],
      sessionLoadByDay: {},
      nutritionSupportMode: null,
      weekComplexity: null,
      planningBiasesApplied: [],
    };
  }

  const summaryAlignment = asRecord(asRecord(plan.summary)?.trainingAlignmentSummary);
  const sourceAlignment = asRecord(asRecord(plan.sourceSnapshot)?.training_alignment_summary);
  const sourceTrainingContext = asRecord(asRecord(plan.sourceSnapshot)?.training_context);
  const alignment = summaryAlignment ?? sourceAlignment;
  const trainingDays = asStringArray(alignment?.trainingDays ?? alignment?.training_days ?? sourceTrainingContext?.trainingDays);
  const rawSessionLoadByDay = asRecord(
    alignment?.sessionLoadByDay ?? alignment?.session_load_by_day ?? sourceTrainingContext?.sessionLoadByDay,
  );
  const sessionLoadByDay = Object.entries(rawSessionLoadByDay ?? {}).reduce<Record<string, 'light' | 'moderate' | 'hard'>>(
    (accumulator, [date, value]) => {
      const normalizedValue = asNonEmptyString(value);
      if (normalizedValue === 'light' || normalizedValue === 'moderate' || normalizedValue === 'hard') {
        accumulator[date] = normalizedValue;
      }
      return accumulator;
    },
    {},
  );
  const planningBiasesApplied = asStringArray(
    alignment?.planningBiasesApplied ?? alignment?.planning_biases_applied,
  );
  const nutritionSupportMode = asNonEmptyString(
    alignment?.nutritionSupportMode ?? alignment?.nutrition_support_mode ?? sourceTrainingContext?.nutritionSupportMode,
  );
  const weekComplexity = asNonEmptyString(
    alignment?.weekComplexity ?? alignment?.week_complexity ?? sourceTrainingContext?.weekComplexity,
  );

  return {
    trainingContextUsed:
      alignment?.trainingContextUsed === true ||
      alignment?.training_context_used === true ||
      trainingDays.length > 0 ||
      Object.keys(sessionLoadByDay).length > 0,
    trainingDays,
    sessionLoadByDay,
    nutritionSupportMode:
      nutritionSupportMode === 'general' ||
      nutritionSupportMode === 'higher_protein' ||
      nutritionSupportMode === 'simpler_dinners' ||
      nutritionSupportMode === 'recovery_support'
        ? nutritionSupportMode
        : null,
    weekComplexity: weekComplexity === 'low' || weekComplexity === 'medium' || weekComplexity === 'high' ? weekComplexity : null,
    planningBiasesApplied,
  };
}
