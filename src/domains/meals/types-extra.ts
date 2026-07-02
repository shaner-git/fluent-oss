import type { MutationProvenance } from '../../auth';
import type { JsonPatchOperation } from './recipe-document';
import type {
  ConfirmedOrderSyncStatus,
  FeedbackValue,
  MealsCalibrationContextRecord,
  MealsConfidenceBreakdown,
  MealsReadinessRecord,
  MealsTrainingContextRecord,
  RecipeBookActionId,
  RecipeCatalogSummaryRecord,
} from './types';

export interface LogFeedbackInput {
  recipeId: string;
  date?: string;
  mealPlanId?: string | null;
  mealPlanEntryId?: string | null;
  taste?: FeedbackValue | null;
  difficulty?: FeedbackValue | null;
  timeReality?: FeedbackValue | null;
  repeatAgain?: FeedbackValue | null;
  familyAcceptance?: FeedbackValue | null;
  notes?: string | null;
  provenance: MutationProvenance;
  submittedBy?: string | null;
}

export interface MarkMealCookedInput {
  mealPlanEntryId?: string | null;
  recipeId?: string | null;
  date?: string;
  provenance: MutationProvenance;
}

export interface ApplyRecipeBookActionInput {
  action: RecipeBookActionId;
  note?: string | null;
  provenance: MutationProvenance;
  recipeId: string;
  weekStart?: string | null;
}

export interface UpdateInventoryInput {
  name: string;
  status?: string;
  source?: string | null;
  confirmedAt?: string | null;
  purchasedAt?: string | null;
  estimatedExpiry?: string | null;
  perishability?: string | null;
  longLifeDefault?: boolean;
  quantity?: number | null;
  unit?: string | null;
  location?: string | null;
  brand?: string | null;
  costCad?: number | null;
  metadata?: unknown;
  provenance: MutationProvenance;
}

export interface DeleteInventoryItemInput {
  name: string;
  provenance: MutationProvenance;
}

export interface UpdateInventoryBatchItemInput {
  name: string;
  status?: string;
  source?: string | null;
  confirmedAt?: string | null;
  purchasedAt?: string | null;
  estimatedExpiry?: string | null;
  perishability?: string | null;
  longLifeDefault?: boolean;
  quantity?: number | null;
  unit?: string | null;
  location?: string | null;
  brand?: string | null;
  costCad?: number | null;
  metadata?: unknown;
}

export interface UpdateInventoryBatchInput {
  items: UpdateInventoryBatchItemInput[];
  provenance: MutationProvenance;
}

export interface PlanReviewInput {
  mealPlanId?: string | null;
  weekStart?: string | null;
  summary?: string | null;
  worked?: string[] | null;
  skipped?: string[] | null;
  nextChanges?: string[] | null;
  provenance: MutationProvenance;
}

export interface PatchRecipeInput {
  recipeId: string;
  operations: JsonPatchOperation[];
  provenance: MutationProvenance;
}

export interface ListMealFeedbackFilters {
  recipeId?: string;
  date?: string;
  limit?: number;
}

export interface UpsertGroceryIntentInput {
  id?: string | null;
  displayName: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  status?: string | null;
  targetWindow?: string | null;
  mealPlanId?: string | null;
  metadata?: unknown;
  regenerateGroceryPlan?: boolean | null;
  provenance: MutationProvenance;
}

export interface DeleteGroceryIntentInput {
  id: string;
  provenance: MutationProvenance;
}

export interface UpsertGroceryPlanActionInput {
  weekStart: string;
  itemKey: string;
  actionStatus:
    | 'purchased'
    | 'in_cart'
    | 'skipped'
    | 'substituted'
    | 'confirmed'
    | 'needs_purchase'
    | 'have_enough'
    | 'have_some_need_to_buy'
    | 'dont_have_it';
  mealPlanId?: string | null;
  substituteItemKey?: string | null;
  substituteDisplayName?: string | null;
  createSubstituteIntent?: boolean | null;
  substituteQuantity?: number | null;
  substituteUnit?: string | null;
  intentNotes?: string | null;
  notes?: string | null;
  purchasedAt?: string | null;
  metadata?: unknown;
  provenance: MutationProvenance;
}

export interface ApplyGroceryPlanActionResult {
  action: import('./types').GroceryPlanActionRecord;
  groceryPlan: import('./types').GroceryPlanRecord | null;
  substituteIntent: import('./types').GroceryIntentRecord | null;
}

export type GroceryShoppingResultItemStatus = 'bought' | 'skipped';

export interface ApplyGroceryShoppingResultInput {
  weekStart?: string | null;
  markAllToBuyBought?: boolean;
  boughtItems?: Array<{ itemKey: string; status?: GroceryShoppingResultItemStatus }>;
  provenance: MutationProvenance;
}

export interface ApplyGroceryShoppingResultRecord {
  weekStart: string;
  appliedCount: number;
  planItems: Array<{ itemKey: string; name: string; actionStatus: string }>;
  manualIntents: Array<{ id: string; displayName: string; status: string }>;
  inventoryRefreshed: Array<{ name: string }>;
  skipped: Array<{ itemKey: string; reason: string }>;
}

export interface DeleteGroceryPlanActionInput {
  weekStart: string;
  itemKey: string;
  provenance: MutationProvenance;
}

export interface CreateRecipeInput {
  recipe: unknown;
  provenance: MutationProvenance;
}

export interface UpsertMealPlanInput {
  createNewPlan?: boolean;
  plan: unknown;
  provenance: MutationProvenance;
}

export interface UpdateMealPreferencesInput {
  preferences: Record<string, unknown>;
  provenance: MutationProvenance;
  sourceSnapshot?: unknown;
}

export interface GenerateGroceryPlanInput {
  provenance: MutationProvenance;
  weekStart?: string;
}

export interface RetailerCartItemInput {
  title: string;
  quantity?: number | null;
}

export interface ConfirmedOrderSyncMetadataInput {
  retailer: string;
  retailerOrderId: string;
  weekStart: string;
  status: ConfirmedOrderSyncStatus;
  confirmedAt?: string | null;
  syncedAt?: string | null;
  matchedPurchasedCount?: number | null;
  orderedExtraCount?: number | null;
  explicitSkippedCount?: number | null;
  missingPlannedCount?: number | null;
  unresolvedCount?: number | null;
  payloadSummary?: unknown;
  force?: boolean | null;
}

export interface PrepareOrderInput {
  retailer?: string | null;
  retailerCartItems?: RetailerCartItemInput[] | null;
  weekStart: string;
}

export interface GenerateMealPlanOverrides {
  breakfastCount?: number | null;
  lunchCount?: number | null;
  dinnerCount?: number | null;
  snackCount?: number | null;
  familyDinnerCount?: number | null;
  maxTrialMeals?: number | null;
  includeRecipeIds?: string[] | null;
  excludeRecipeIds?: string[] | null;
  prioritizeInventory?: boolean | null;
  pinnedMeals?: Array<{
    date: string;
    mealType: CalendarMealType;
    recipeId: string;
  }> | null;
}

export type CalendarAvailability = 'available' | 'unavailable' | 'unchecked';
export type CalendarMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface CalendarContextDay {
  date: string;
  blockedMeals?: CalendarMealType[] | null;
  householdAdultsHome?: number | null;
  householdChildrenHome?: number | null;
  notes?: string[] | null;
}

export interface CalendarContext {
  weekStart: string;
  generatedAt?: string | null;
  source?: string | null;
  availability: CalendarAvailability;
  days?: CalendarContextDay[] | null;
}

export interface GenerateMealPlanInput {
  provenance: MutationProvenance;
  weekStart: string;
  overrides?: GenerateMealPlanOverrides | null;
  calendarContext?: CalendarContext | null;
  trainingContext?: MealsTrainingContextRecord | null;
}

export interface AcceptMealPlanCandidateInput {
  generationId: string;
  candidateId: string;
  inputHash: string;
  calendarContext?: CalendarContext | null;
  trainingContext?: MealsTrainingContextRecord | null;
  provenance: MutationProvenance;
}

export interface MealPlanCandidateEntryRecord {
  date: string;
  dayLabel: string;
  mealType: string;
  recipeId: string;
  recipeName: string;
  selectionStatus: string | null;
  serves: number | null;
}

export interface MealPlanCandidateSummaryRecord {
  candidateId: string;
  weekStart: string;
  entryCount: number;
  mealTypes: string[];
  recipeIds: string[];
  recipeNamePreview: string[];
  warnings: string[];
  rationale: string[];
  groceryDeltaSummary: {
    itemCount: number;
    pantryCheckCount: number;
    unresolvedCount: number;
    missingItemCount: number;
  };
  planningBrief: MealPlanningBriefRecord;
  planReview: MealPlanReviewRecord;
  entries: MealPlanCandidateEntryRecord[];
  summary: unknown;
  calibrationContext?: MealsCalibrationContextRecord;
}

export interface MealPlanningBriefRecord {
  weekStart: string;
  readiness?: MealsReadinessRecord;
  confidenceBreakdown?: MealsConfidenceBreakdown;
  recipeCoverage: {
    activeRecipeCount: number;
    activeRecipeCountByMealType: Record<string, number>;
    activeRecipeMemoryCount: number;
    approvedPlanCount: number;
    missingSlotCount: number;
    plannedRecipeCount: number;
    requestedSlotCount: number;
    thinMealTypes: string[];
  };
  contextSignals: {
    calendarAvailability: CalendarAvailability;
    calendarUsed: boolean;
    groceryIntentCount: number;
    inventoryItemCount: number;
    nearExpiryItemPreview: string[];
    preferenceSignals: {
      budgetSensitive: boolean;
      dietaryConstraintCount: number;
      dislikedFoodCount: number;
      householdAdultCount: number | null;
      householdChildCount: number | null;
      householdChildrenEatSameMeals: boolean | null;
      householdMealParticipationTypes: string[];
      householdServeTarget: number | null;
      householdSizeSegment: 'solo' | 'two' | 'three' | 'multi' | 'unknown';
      leftoverPreference: string | null;
      likedFoodCount: number;
      pantryCheckPolicy: string | null;
      preferredCuisineCount: number;
      preferredGroceryBrandCount: number;
      preferredGroceryStoreCount: number;
      shoppingSubstitutionTolerance: string | null;
      targetBreakfastCount: number | null;
      targetFamilyDinnerCount: number | null;
      targetLunchCount: number | null;
      targetSnackCount: number | null;
      targetWeeknightDinnerCount: number | null;
      weeknightTimeLimitMinutes: number | null;
    };
    recentRecipeCount: number;
    trainingContextUsed: boolean;
  };
  evidenceNotes: string[];
  recipeCatalog: RecipeCatalogSummaryRecord;
}

export interface MealPlanReviewRecord {
  headline: string;
  strengths: string[];
  tradeoffs: string[];
  watchouts: string[];
  suggestedSwaps: string[];
  acceptanceChecklist: string[];
}

export interface MealPlanGenerationRecord {
  calibrationContext?: MealsCalibrationContextRecord;
  id: string;
  weekStart: string;
  inputHash: string;
  createdAt: string;
  overrides: GenerateMealPlanOverrides | null;
  calendarContext: CalendarContext | null;
  trainingContext: MealsTrainingContextRecord | null;
  candidates: MealPlanCandidateSummaryRecord[];
}

export interface PersistedMealPlanCandidateRecord {
  candidateId: string;
  plan: unknown;
  summary: MealPlanCandidateSummaryRecord;
}

export interface PersistedMealPlanGenerationRecord {
  id: string;
  weekStart: string;
  inputHash: string;
  createdAt: string;
  overrides: GenerateMealPlanOverrides | null;
  calendarContext: CalendarContext | null;
  trainingContext: MealsTrainingContextRecord | null;
  candidates: PersistedMealPlanCandidateRecord[];
}

export interface ListDomainEventsFilters {
  domain?: string;
  entityId?: string;
  entityType?: string;
  eventType?: string;
  limit?: number;
  since?: string;
  until?: string;
}
