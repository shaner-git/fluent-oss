import type { MutationProvenance } from '../../auth';
import type { JsonPatchOperation } from './recipe-document';

export type FeedbackValue = 'good' | 'okay' | 'bad';
export type MealsSupportLevel = 'low' | 'medium' | 'high';
export type MealsGroceryReadiness = 'ready' | 'partial' | 'at_risk';
export type MealsTrainingLoadHint = 'light' | 'moderate' | 'hard';
export type MealsNutritionSupportMode = 'general' | 'higher_protein' | 'simpler_dinners' | 'recovery_support';

export interface MealsTrainingContextRecord {
  goalType: string | null;
  trainingDays: string[];
  daysPerWeek: number;
  sessionLoadByDay: Record<string, MealsTrainingLoadHint>;
  nutritionSupportMode: MealsNutritionSupportMode;
  weekComplexity: MealsSupportLevel;
}

export interface MealsTrainingAlignmentSummaryRecord {
  trainingContextUsed: boolean;
  trainingDays: string[];
  sessionLoadByDay: Record<string, MealsTrainingLoadHint>;
  nutritionSupportMode: MealsNutritionSupportMode | null;
  weekComplexity: MealsSupportLevel | null;
  planningBiasesApplied: string[];
}

export interface MealsExecutionSupportSummaryRecord {
  mealPlanPresent: boolean;
  groceryReadiness: MealsGroceryReadiness;
  executionFriction: MealsSupportLevel;
  proteinSupportConfidence: MealsSupportLevel;
  weeknightComplexity: MealsSupportLevel;
}

export interface MealPlanRecord {
  id: string;
  weekStart: string;
  weekEnd: string | null;
  status: string;
  generatedAt: string | null;
  approvedAt: string | null;
  profileOwner: string | null;
  requirements: unknown;
  summary: unknown;
  sourceSnapshot: unknown;
  createdAt: string | null;
  updatedAt: string | null;
  trainingAlignmentSummary: MealsTrainingAlignmentSummaryRecord;
  entries: MealPlanEntryRecord[];
}

export interface MealPlanEntryRecord {
  id: string;
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
  notes: unknown;
  status: string | null;
  cookedAt: string | null;
  updatedAt: string | null;
}

export interface MealRecipeRecord {
  activeTimeMinutes: number | null;
  id: string;
  slug: string | null;
  name: string;
  mealType: string;
  servings: number | null;
  status: string;
  totalTimeMinutes: number | null;
  raw: unknown;
}

export type RecipePlanningLevel = 'low' | 'medium' | 'high' | 'unknown';
export type RecipePlanningConfidence = 'proven' | 'trial' | 'untested' | 'retired';

export interface RecipePlanningMetadataRecord {
  activeMinutes: number | null;
  batchFit: boolean;
  cleanupLevel: RecipePlanningLevel;
  confidence: RecipePlanningConfidence;
  costLevel: RecipePlanningLevel;
  familyFit: boolean;
  freezerFit: boolean;
  freshSensitive: boolean;
  highProtein: boolean;
  lunchFit: boolean;
  mealJobs: string[];
  pantryHeavy: boolean;
  planningTags: string[];
  repeatSoonFit: boolean;
  totalMinutes: number | null;
  weeknightFit: boolean;
}

export interface RecipeCatalogItemSummaryRecord {
  id: string;
  mealType: string;
  name: string;
  planning: RecipePlanningMetadataRecord;
  slug: string | null;
  status: string;
}

export interface RecipeCatalogGapRecord {
  id: string;
  label: string;
  mealType: string | null;
  rationale: string;
  severity: 'info' | 'medium' | 'high';
  suggestedAction: string;
}

export interface RecipeCatalogSummaryRecord {
  byConfidence: Record<RecipePlanningConfidence, number>;
  byMealType: Record<string, number>;
  gapCount: number;
  gaps: RecipeCatalogGapRecord[];
  plannerReadyCount: number;
  recipeCount: number;
  status: string;
  tagCounts: Record<string, number>;
}

export type RecipeBookActionId = 'want_to_try' | 'favorite' | 'not_for_us' | 'pin_to_week';

export interface RecipeBookWhyShownRecord {
  kind: 'confirmed_preference' | 'inferred_pattern' | 'catalog_gap' | 'pantry_opportunity' | 'new_trial' | 'planner_fit';
  label: string;
}

export interface RecipeBookSuggestedActionRecord {
  id: RecipeBookActionId;
  label: string;
  effect: string;
  evidenceScope: 'recipe_evidence' | 'planning_intent' | 'confirmation_prompt';
  toolName: 'meals_apply_recipe_book_action';
}

export interface RecipeBookItemRecord {
  id: string;
  householdFit: Array<'solo' | 'two' | 'three' | 'multi' | 'unknown'>;
  learningStatus: RecipePlanningConfidence;
  mealType: string;
  name: string;
  planning: RecipePlanningMetadataRecord;
  shelfIds: string[];
  suggestedActions: RecipeBookSuggestedActionRecord[];
  whyShown: RecipeBookWhyShownRecord[];
}

export interface RecipeBookShelfRecord {
  id: string;
  label: string;
  recipeIds: string[];
}

export interface RecipeBookOnboardingRecord {
  actions: RecipeBookSuggestedActionRecord[];
  catalog: RecipeCatalogSummaryRecord;
  generatedAt: string;
  hostGuidance: {
    copyGuardrails: string[];
    firstWriteTool: 'meals_apply_recipe_book_action';
    renderMode: 'structured_text';
  };
  items: RecipeBookItemRecord[];
  shelves: RecipeBookShelfRecord[];
  summary: {
    provenCount: number;
    recipeCount: number;
    shelfCount: number;
    trialCount: number;
    untestedCount: number;
  };
}

export interface RecipeBookActionResultRecord {
  action: RecipeBookActionId;
  confirmationPrompt: string | null;
  evidenceScope: 'recipe_evidence' | 'planning_intent' | 'confirmation_prompt';
  memory: MealMemoryRecord | null;
  planningIntent: {
    args: {
      overrides: {
        includeRecipeIds: string[];
      };
      week_start?: string;
    };
    toolName: 'meals_generate_plan';
  } | null;
  recipeId: string;
  recipeName: string;
  safetyNote: string;
}

export interface MealMemoryRecord {
  recipeId: string;
  status: string;
  lastFeedback: unknown;
  notes: unknown;
  lastUsedAt: string | null;
  updatedAt: string | null;
}

export interface InventoryRecord {
  id: string;
  name: string;
  normalizedName: string | null;
  canonicalItemKey: string | null;
  canonicalQuantity: number | null;
  canonicalUnit: string | null;
  canonicalConfidence: number | null;
  status: string;
  source: string | null;
  confirmedAt: string | null;
  purchasedAt: string | null;
  estimatedExpiry: string | null;
  perishability: string | null;
  longLifeDefault: boolean;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  brand: string | null;
  costCad: number | null;
  metadata: unknown;
}

export interface InventorySummary {
  byStatus: Record<string, number>;
  expiringSoon: InventoryRecord[];
  totalItems: number;
}

export interface MealFeedbackRecord {
  id: string;
  mealPlanId: string | null;
  mealPlanEntryId: string | null;
  recipeId: string;
  date: string;
  taste: FeedbackValue | null;
  difficulty: FeedbackValue | null;
  timeReality: FeedbackValue | null;
  repeatAgain: FeedbackValue | null;
  familyAcceptance: FeedbackValue | null;
  notes: string | null;
  submittedBy: string | null;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sessionId: string | null;
  confidence: number | null;
  sourceType: string | null;
  createdAt: string | null;
}

export interface GroceryIntentRecord {
  id: string;
  normalizedName: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  status: string;
  targetWindow: string | null;
  mealPlanId: string | null;
  metadata: unknown;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sessionId: string | null;
  confidence: number | null;
  sourceType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MealPreferencesRecord {
  profileOwner: string | null;
  raw: Record<string, unknown>;
  tenantId: string;
  profileId: string;
  updatedAt: string | null;
  version: string;
}

export interface MealPlanHistoryRecord {
  id: string;
  weekStart: string;
  weekEnd: string | null;
  status: string;
  generatedAt: string | null;
  approvedAt: string | null;
  updatedAt: string | null;
  entryCount: number;
  summary: unknown;
}

export interface MealPlanSummaryRecord {
  id: string;
  weekStart: string;
  weekEnd: string | null;
  status: string;
  generatedAt: string | null;
  approvedAt: string | null;
  updatedAt: string | null;
  profileOwner: string | null;
  entryCount: number;
  mealTypes: string[];
  recipeIds: string[];
  recipeNamePreview: string[];
  summary: unknown;
  executionSupportSummary: MealsExecutionSupportSummaryRecord;
  trainingAlignmentSummary: MealsTrainingAlignmentSummaryRecord;
}

export interface GroceryPlanItemRecord {
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
  sourceRecipeIds: string[];
  sourceRecipeNames: string[];
  reasons: string[];
  inventoryStatus:
    | 'missing'
    | 'present_without_quantity'
    | 'partial'
    | 'sufficient'
    | 'pantry_default'
    | 'check_pantry'
    | 'intent';
  uncertainty: string | null;
  note: string | null;
  actionStatus?: GroceryPlanActionStatus | null;
  substitute?: {
    itemKey: string | null;
    displayName: string | null;
  } | null;
}

export type GroceryPlanSufficiencyStatus = 'have_enough' | 'have_some_need_to_buy' | 'dont_have_it';

export type GroceryPlanActionStatus =
  | 'purchased'
  | 'in_cart'
  | 'skipped'
  | 'substituted'
  | 'confirmed'
  | 'needs_purchase'
  | GroceryPlanSufficiencyStatus;

export interface GroceryPlanActionRecord {
  id: string;
  weekStart: string;
  mealPlanId: string | null;
  itemKey: string;
  actionStatus: GroceryPlanActionStatus;
  substituteItemKey: string | null;
  substituteDisplayName: string | null;
  notes: string | null;
  metadata: unknown;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sessionId: string | null;
  confidence: number | null;
  sourceType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GroceryPlanRecord {
  id: string;
  weekStart: string;
  mealPlanId: string | null;
  generatedAt: string;
  sourceSnapshot?: unknown;
  raw: {
    generatedAt: string;
    items: GroceryPlanItemRecord[];
    notes: string[];
    actionsAppliedCount: number;
    preferencesVersion: string | null;
    profileOwner: string | null;
    resolvedItems: GroceryPlanItemRecord[];
    sources: {
      groceryIntentCount: number;
      inventoryItemCount: number;
      planId: string | null;
      recipeCount: number;
    };
    weekStart: string;
    calibrationContext?: MealsCalibrationContextRecord;
  };
}

export interface GroceryPlanSummaryRecord {
  calibrationContext?: MealsCalibrationContextRecord;
  id: string;
  weekStart: string;
  mealPlanId: string | null;
  generatedAt: string;
  itemCount: number;
  pantryCheckCount: number;
  notesCount: number;
  unresolvedCount: number;
  actionsAppliedCount: number;
  resolvedCount: number;
  preferencesVersion: string | null;
  profileOwner: string | null;
  sources: GroceryPlanRecord['raw']['sources'];
  resolvedPreview: Array<{
    name: string;
    actionStatus: GroceryPlanActionStatus | null;
    substituteDisplayName: string | null;
  }>;
  itemPreview: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    inventoryStatus: GroceryPlanItemRecord['inventoryStatus'];
    uncertainty: string | null;
    preferredBrands: string[];
  }>;
}

export type CurrentGroceryListObjectRole = 'living_grocery_list';
export type CurrentGroceryListWeekRelation = 'contains_today' | 'future' | 'past' | 'unknown';
export type CurrentGroceryListTrustState =
  | 'ready_to_shop'
  | 'review_before_shopping'
  | 'confirm_what_you_have'
  | 'list_may_be_out_of_date';

export interface CurrentGroceryListSourceRecord {
  kind: 'accepted_meal_plan' | 'draft_meal_plan' | 'manual_item' | 'grocery_plan' | 'inventory' | 'shopping_session';
  id: string | null;
  label: string;
  status?: string | null;
  weekStart?: string | null;
}

export interface CurrentGroceryListRecord {
  calibrationContext?: MealsCalibrationContextRecord;
  objectRole: CurrentGroceryListObjectRole;
  listId: string;
  version: string;
  title: string;
  subtitle: string;
  weekStart: string;
  weekRelation: CurrentGroceryListWeekRelation;
  selectionReason: string | null;
  trustState: CurrentGroceryListTrustState;
  trustLabel: 'Ready to shop' | 'Check before shopping' | 'List may be out of date';
  sourceProvenance: CurrentGroceryListSourceRecord[];
  stale: boolean;
  staleReasons: string[];
  generatedAt: string | null;
  updatedAt: string | null;
  counts: {
    manualIntentCount: number;
    planItemCount: number;
    unresolvedCount: number;
    resolvedCount: number;
    toBuyCount: number;
    checkAtHomeCount: number;
    inCartCount: number;
  };
  groceryPlan: GroceryPlanRecord | null;
  intents: GroceryIntentRecord[];
  preparedOrder: PreparedOrderRecord | null;
}

export interface CurrentGroceryListSummaryRecord {
  calibrationContext?: MealsCalibrationContextRecord;
  objectRole: CurrentGroceryListObjectRole;
  listId: string;
  version: string;
  title: string;
  subtitle: string;
  weekStart: string;
  weekRelation: CurrentGroceryListWeekRelation;
  selectionReason: string | null;
  trustState: CurrentGroceryListTrustState;
  trustLabel: CurrentGroceryListRecord['trustLabel'];
  stale: boolean;
  staleReasons: string[];
  counts: CurrentGroceryListRecord['counts'];
  sourceProvenance: CurrentGroceryListSourceRecord[];
  toBuyPreview: Array<{
    displayName: string;
    quantity: number | null;
    unit: string | null;
  }>;
  checkAtHomePreview: Array<{
    displayName: string;
    reason: string;
  }>;
  manualItemPreview: Array<{
    displayName: string;
    status: string;
  }>;
}

export interface PreparedOrderItemRecord {
  displayName: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
}

export interface PreparedOrderCartItemRecord {
  displayName: string;
  matchedCartTitle: string;
  quantity: number | null;
}

export interface PreparedOrderUnresolvedItemRecord extends PreparedOrderItemRecord {
  reason: string;
  sufficiencyConfirmationEligible?: boolean;
  sufficiencyConfirmationOptions?: GroceryPlanSufficiencyStatus[] | null;
}

export interface PreparedOrderSubstitutionDecisionRecord {
  requested: string;
  resolvedTo: string;
  source: string;
}

export interface PreparedOrderFreshnessRecord {
  generatedAt: string;
  groceryPlanUpdatedAt?: string | null;
  inventoryUpdatedAt?: string | null;
}

export type PreparedOrderMode = 'exact' | 'review_required';

export interface PreparedOrderRecord {
  weekStart: string;
  retailer: string | null;
  safeToOrder: boolean;
  remainingToBuy: PreparedOrderItemRecord[];
  alreadyCoveredByInventory: PreparedOrderItemRecord[];
  alreadyInRetailerCart: PreparedOrderCartItemRecord[];
  unresolvedItems: PreparedOrderUnresolvedItemRecord[];
  substitutionDecisions: PreparedOrderSubstitutionDecisionRecord[];
  freshness: PreparedOrderFreshnessRecord;
  notes: string[];
}

export interface PreparedOrderSummaryRecord {
  weekStart: string;
  retailer: string | null;
  safeToOrder: boolean;
  remainingCount: number;
  coveredCount: number;
  inCartCount: number;
  unresolvedCount: number;
  substitutionCount: number;
  freshness: PreparedOrderFreshnessRecord;
  remainingPreview: Array<{
    displayName: string;
    quantity: number | null;
    unit: string | null;
  }>;
  unresolvedPreview: Array<{
    displayName: string;
    reason: string;
    sufficiencyConfirmationEligible?: boolean;
  }>;
  notes: string[];
}

export type ConfirmedOrderSyncStatus = 'sync_completed' | 'sync_partial' | 'sync_failed';

export type ConfirmedOrderLineClassification =
  | 'matched_purchased'
  | 'ordered_extra'
  | 'retailer_substitution_unresolved'
  | 'non_food_ignored'
  | 'missing_from_confirmed_order'
  | 'explicitly_skipped';

export interface ConfirmedOrderSyncRecord {
  id: string;
  retailer: string;
  retailerOrderId: string;
  weekStart: string;
  status: ConfirmedOrderSyncStatus;
  confirmedAt: string | null;
  syncedAt: string;
  matchedPurchasedCount: number;
  orderedExtraCount: number;
  explicitSkippedCount: number;
  missingPlannedCount: number;
  unresolvedCount: number;
  payloadSummary: unknown;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DomainEventRecord {
  id: string;
  domain: string;
  entityType: string;
  entityId: string | null;
  eventType: string;
  before: unknown;
  after: unknown;
  patch: unknown;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sessionId: string | null;
  confidence: number | null;
  sourceType: string | null;
  actorEmail: string | null;
  actorName: string | null;
  createdAt: string | null;
}

export interface DomainEventSummaryRecord {
  id: string;
  domain: string;
  entityType: string;
  entityId: string | null;
  eventType: string;
  createdAt: string | null;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sourceType: string | null;
  actorName: string | null;
  actorEmail: string | null;
  patchKeys: string[];
}

export interface TodayContext {
  date: string;
  plan: MealPlanRecord | null;
  entries: Array<
    MealPlanEntryRecord & {
      recipe: MealRecipeRecord | null;
      feedbackLogged: boolean;
    }
  >;
  missingFeedbackRecipeIds: string[];
  executionSupportSummary: MealsExecutionSupportSummaryRecord;
  trainingAlignmentSummary: MealsTrainingAlignmentSummaryRecord;
}

export interface MealPreferencesSummaryRecord {
  version: string;
  updatedAt: string | null;
  profileOwner: string | null;
  calendarCheckRequiredBeforePlanning: boolean;
  hardAvoids: string[];
  preferredCuisines: string[];
  dinnerRules: string[];
  budgetCadPerMeal: number | null;
  longLifeDefaultsCount: number;
  hostedBrandPreferenceFamiliesCount: number;
}

export type MealsSetupState =
  | 'no_meals_state'
  | 'setup_started'
  | 'starter_preferences_ready'
  | 'pantry_imported_unconfirmed'
  | 'planning_evidence_ready'
  | 'preferences_inferred'
  | 'preferences_partially_confirmed'
  | 'meals_calibrated';

export type MealsGuidedOnboardingIntent = 'plan_week' | 'recipe_book' | 'grocery' | 'preferences';

export type MealsGuidedOnboardingStep =
  | 'intent'
  | 'household'
  | 'safety'
  | 'rhythm'
  | 'cooking_reality'
  | 'taste'
  | 'groceries'
  | 'recipe_book_seed'
  | 'review'
  | 'first_output';

export type MealsGuidedOnboardingStepStatus = 'not_started' | 'answered' | 'skipped' | 'needs_confirmation';

export interface MealsGuidedOnboardingRecord {
  completedAt: string | null;
  currentStep: MealsGuidedOnboardingStep;
  entryIntent: MealsGuidedOnboardingIntent | null;
  lastUpdatedAt: string | null;
  needsConfirmation: Array<{
    field: string;
    reason: string;
    value: string | number | boolean | null;
  }>;
  nextStepRationale: string;
  skippedSteps: MealsGuidedOnboardingStep[];
  startedAt: string | null;
  steps: Record<MealsGuidedOnboardingStep, MealsGuidedOnboardingStepStatus>;
  version: 'meals-guided-v1';
}

export type MealsCalibrationSignalSource =
  | 'user_confirmed'
  | 'meal_history_inferred'
  | 'pantry_inferred'
  | 'recipe_metadata'
  | 'grocery_action_inferred'
  | 'fallback';

export type MealsCalibrationSignalStatus = 'inferred' | 'confirmed' | 'corrected' | 'rejected';

export type MealsCalibrationSignalKind =
  | 'household_shape'
  | 'disliked_food'
  | 'allergy'
  | 'dietary_constraint'
  | 'preferred_cuisine'
  | 'favorite_food'
  | 'cooking_cadence'
  | 'meal_routine'
  | 'weeknight_time_limit'
  | 'budget_sensitivity'
  | 'cleanup_tolerance'
  | 'leftover_preference'
  | 'grocery_expectation'
  | 'spice_preference'
  | 'meal_pattern'
  | 'pantry_pattern'
  | 'starter_preference';

export interface MealsCalibrationSignalRecord {
  confidence: number;
  correctedValue: string | null;
  id: string;
  kind: MealsCalibrationSignalKind;
  note: string | null;
  source: MealsCalibrationSignalSource;
  status: MealsCalibrationSignalStatus;
  updatedAt: string | null;
  value: string;
}

export type MealsPantryCalibrationStatus = 'stale' | 'accidental' | 'not_representative' | 'representative';

export interface MealsPantryCalibrationRecord {
  itemName: string;
  note: string | null;
  source: MealsCalibrationSignalSource;
  status: MealsPantryCalibrationStatus;
  updatedAt: string | null;
}

export interface MealsConfidenceBreakdown {
  groceryDecisionConfidence: number;
  mealHistoryConfidence: number;
  pantryCoverageConfidence: number;
  planningDecisionConfidence: number;
  preferenceCalibrationConfidence: number;
}

export interface MealsReadinessRecord {
  basis: string;
  label: string;
  notes: string[];
  ready: boolean;
  readinessLevel: 'not_ready' | 'provisional' | 'ready';
}

export interface MealsCalibrationPromptRecord {
  id: string;
  kind: 'starter_signal' | 'confirm_signal' | 'pantry_review' | 'constraint' | 'grocery_expectation' | 'opportunistic';
  label: string;
  question: string;
  rationale: string;
  responseOptions: Array<{
    label: string;
    requiresFreeText: string | null;
    source: MealsCalibrationSignalSource | null;
    status: MealsCalibrationSignalStatus | null;
    value: string | null;
  }>;
  signal: Pick<MealsCalibrationSignalRecord, 'id' | 'kind' | 'source' | 'value'> | null;
  toolName: string | null;
}

export interface MealsOnboardingCalibrationRecord {
  calibrationPrompts: MealsCalibrationPromptRecord[];
  confidenceBreakdown: MealsConfidenceBreakdown;
  confirmedPreferences: MealsCalibrationSignalRecord[];
  evidenceGaps: string[];
  guidedOnboarding: MealsGuidedOnboardingRecord;
  groceryListReadiness: {
    currentListPresent: boolean;
    groceryExpectationConfirmed: boolean;
    pantryCheckCount: number;
    trustState: CurrentGroceryListTrustState | null;
  };
  groceryReadiness: MealsReadinessRecord;
  hostGuidance: {
    answerMode: 'text_first' | 'widget_deferred';
    broadPlanningFirstTool: 'fluent_get_context';
    copyGuardrails: string[];
    firstTool: 'meals_get_onboarding_calibration';
  };
  householdPreferenceStatus: {
    allergiesExplicitlyConfirmed: boolean;
    constraintsExplicitlyConfirmed: boolean;
    groceryExpectationsConfirmed: boolean;
    hardAvoidsExplicitlyConfirmed: boolean;
    householdShapeConfirmed: boolean;
    mealRoutineConfirmed: boolean;
    positiveTasteConfirmed: boolean;
    weeknightTimeLimitConfirmed: boolean;
  };
  inferredMealSignals: MealsCalibrationSignalRecord[];
  mealPlanningReadiness: MealsReadinessRecord;
  pantryInventoryCoverage: {
    activeInventoryCount: number;
    excludedCalibrationCount: number;
    hasImportedInventory: boolean;
    importedInventoryConfirmed: boolean;
    staleOrExpiredCount: number;
  };
  recipePlanHistoryCoverage: {
    activeRecipeMemoryCount: number;
    approvedPlanCount: number;
    recentPlanCount: number;
    totalPlanCount: number;
  };
  setupState: MealsSetupState;
  suggestedNextAction: {
    label: string;
    rationale: string;
    toolName: string | null;
  };
  unresolvedQuestions: string[];
}

export interface MealsCalibrationContextRecord {
  basis: string;
  confidenceBreakdown: MealsConfidenceBreakdown;
  copyGuardrails: string[];
  groceryReadiness: MealsReadinessRecord;
  mealPlanningReadiness: MealsReadinessRecord;
  setupState: MealsSetupState;
}

export interface MutationAckRecord {
  entityId: string;
  entityType: string;
  action: string;
  updatedAt: string | null;
  details?: Record<string, unknown>;
}
