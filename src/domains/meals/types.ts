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
  id: string;
  slug: string | null;
  name: string;
  mealType: string;
  status: string;
  raw: unknown;
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
  };
}

export interface GroceryPlanSummaryRecord {
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

export interface MutationAckRecord {
  entityId: string;
  entityType: string;
  action: string;
  updatedAt: string | null;
  details?: Record<string, unknown>;
}
