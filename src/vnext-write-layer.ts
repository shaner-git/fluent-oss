import { getFluentAuthProps, type MutationProvenance } from './auth';
import { hasDietaryNegationOrHedgeCue, recognizeDietaryPattern, type DietaryPattern } from './domains/meals/dietary-patterns';
import type { BudgetCategory } from './domains/budgets/service';
import { STYLE_ITEM_FIT_FIELDS, type StyleDuplicateCandidate } from './domains/style/service';
import type { MealsCalibrationResponseInput } from './domains/meals/onboarding-calibration';
import { mirrorMealsTier1PersonFacts } from './domains/meals/person-facts-bridge';
import type { JsonPatchOperation } from './domains/meals/recipe-document';
import type {
  ConsentVisibility,
  PcHost,
  PersonFactKind,
  PersonFactRejectAck,
  PersonFactSource,
  PersonFactStatus,
  PersonFactWriteAck,
} from './personal-context';
import type { FluentVNextDomain } from './vnext-contract';
import { enforcePublicWriteRateLimit, type FluentRateLimitBinding } from './rate-limits';
import {
  getFluentVNextCurrentGroceryListItem,
  getFluentVNextItem,
  getFluentVNextPurchaseContext,
  getFluentVNextSharedProfile,
  listFluentVNextItemsPage,
  type FluentVNextItemType,
  type FluentVNextReadServices,
} from './vnext-read-layer';

export type FluentVNextRecipeWriteApproval = 'explicit_user_approved';
export type FluentArchiveItemDisposition =
  | 'returned'
  | 'sold'
  | 'donated'
  | 'gifted'
  | 'worn_out'
  | 'never_purchased'
  | 'duplicate'
  | 'other';
export type FluentVNextWriteKind =
  | 'shared_profile_patch'
  | 'item_upsert'
  | 'item_archive'
  | 'style_item_patch'
  | 'style_item_create'
  | 'style_item_profile_refresh'
  | 'style_item_image_set'
  | 'event_record'
  | 'grocery_list_change'
  | 'grocery_shopping_result'
  | 'meal_plan_save'
  | 'recipe_save'
  | 'recipe_patch'
  | 'recipe_feedback'
  | 'budget_envelope_set'
  | 'budget_spend_log';
type FluentStyleImageType = 'primary' | 'alternate' | 'fit';
export type FluentVNextWriteStatus = 'applied' | 'not_implemented';

export interface FluentVNextWriteServices extends FluentVNextReadServices {
  publicWriteRateLimiter?: FluentRateLimitBinding;
  core: FluentVNextReadServices['core'] & {
    appendPersonConsentEvent: (
      input: { scopeKey: string; visibility: ConsentVisibility },
      provenance: MutationProvenance,
    ) => Promise<void>;
    updateProfile: (
      input: { displayName?: string | null; metadata?: unknown; timezone?: string | null },
      provenance: MutationProvenance,
    ) => Promise<unknown>;
    upsertPersonFact: (
      input: {
        kind: PersonFactKind;
        value: unknown;
        status: PersonFactStatus;
        source: PersonFactSource;
        visibility?: ConsentVisibility;
        note?: string | null;
        questionId?: string | null;
        staleAfter?: string | null;
        confidence?: number;
      },
      provenance: MutationProvenance,
    ) => Promise<PersonFactWriteAck>;
    rejectPersonFact: (
      input: {
        kind: PersonFactKind;
        value: unknown;
      },
      provenance: MutationProvenance,
    ) => Promise<PersonFactRejectAck>;
  };
  budgets?: FluentVNextReadServices['budgets'] & {
    logBudgetSpend?: (input: {
      amount: number;
      category: BudgetCategory;
      note?: string | null;
      occurredOn?: string | null;
      provenance: MutationProvenance;
    }) => Promise<unknown>;
    setBudgetEnvelope?: (input: {
      category: BudgetCategory;
      currency?: string | null;
      monthlyAmount: number;
      provenance: MutationProvenance;
    }) => Promise<unknown>;
  };
  meals?: FluentVNextReadServices['meals'] & {
    createRecipe?: (input: { recipe: unknown; provenance: MutationProvenance }) => Promise<unknown>;
    upsertGroceryIntent?: (input: {
      displayName: string;
      id?: string | null;
      mealPlanId?: string | null;
      metadata?: unknown;
      notes?: string | null;
      provenance: MutationProvenance;
      quantity?: number | null;
      status?: string | null;
      targetWindow?: string | null;
      unit?: string | null;
    }) => Promise<unknown>;
    upsertGroceryPlanAction?: (input: {
      actionStatus:
        | 'purchased'
        | 'skipped'
        | 'substituted'
        | 'confirmed'
        | 'needs_purchase'
        | 'have_enough'
        | 'have_some_need_to_buy'
        | 'dont_have_it';
      createSubstituteIntent?: boolean | null;
      intentNotes?: string | null;
      itemKey: string;
      mealPlanId?: string | null;
      metadata?: unknown;
      notes?: string | null;
      provenance: MutationProvenance;
      purchasedAt?: string | null;
      substituteDisplayName?: string | null;
      substituteItemKey?: string | null;
      substituteQuantity?: number | null;
      substituteUnit?: string | null;
      weekStart: string;
    }) => Promise<unknown>;
    logFeedback?: (input: Record<string, unknown> & { provenance: MutationProvenance }) => Promise<unknown>;
    patchRecipe?: (input: { operations: unknown[]; provenance: MutationProvenance; recipeId: string }) => Promise<unknown>;
    recordCalibrationResponse?: (input: {
      response: MealsCalibrationResponseInput;
      provenance: MutationProvenance;
    }) => Promise<unknown>;
    upsertPlan?: (input: { createNewPlan?: boolean; plan: unknown; provenance: MutationProvenance }) => Promise<unknown>;
    applyGroceryShoppingResult?: (input: {
      boughtItems?: Array<{ itemKey: string; status?: 'bought' | 'skipped' }>;
      markAllToBuyBought?: boolean;
      provenance: MutationProvenance;
      weekStart?: string | null;
    }) => Promise<unknown>;
    archiveInventoryItem?: (input: { name: string; provenance: MutationProvenance }) => Promise<unknown>;
  };
  style?: FluentVNextReadServices['style'] & {
    archiveItem?: (input: {
      itemId?: string | null;
      itemName?: string | null;
      provenance: MutationProvenance;
      sourceSnapshot?: unknown;
    }) => Promise<unknown>;
    updateProfile?: (input: { profile: unknown; provenance: MutationProvenance }) => Promise<unknown>;
    upsertItem?: (input: { item: unknown; provenance: MutationProvenance; sourceSnapshot?: unknown }) => Promise<unknown>;
    upsertItemPhotos?: (input: { itemId: string; photos: unknown; provenance: MutationProvenance }) => Promise<unknown>;
    findDuplicates?: (draft: { brand: string | null; colorFamily: string | null; comparatorKey: string; name: string | null }) => Promise<unknown>;
    createItem?: (input: {
      item: unknown;
      profile?: unknown;
      technicalMetadata?: unknown;
      fieldEvidence?: unknown;
      overallConfidence?: number | null;
      hostModel?: string | null;
      hasImage?: boolean;
      onDuplicate?: 'warn' | 'force' | 'skip';
      clientToken?: string | null;
      batchId?: string | null;
      provenance: MutationProvenance;
      sourceSnapshot?: unknown;
    }) => Promise<unknown>;
    upsertItemProfile?: (input: {
      fieldEvidence?: unknown;
      hasImage?: boolean;
      itemId: string;
      method?: string | null;
      profile: unknown;
      provenance: MutationProvenance;
      source?: string | null;
      sourceSnapshot?: unknown;
    }) => Promise<unknown>;
  };
}

export interface FluentVNextWriteAck {
  object: 'WriteAck';
  domain: FluentVNextDomain;
  durable?: boolean;
  kind: FluentVNextWriteKind;
  status: FluentVNextWriteStatus;
  target: {
    id: string | null;
    type: string | null;
  };
  source: string;
  payload: unknown;
  readAfterWrite: unknown;
  boundaries: string[];
}

export async function setFluentBudgetEnvelope(
  services: FluentVNextWriteServices,
  input: {
    category: BudgetCategory;
    currency?: string | null;
    monthlyAmount: number;
    provenance: MutationProvenance;
  },
): Promise<FluentVNextWriteAck> {
  if (!services.budgets?.setBudgetEnvelope) {
    return notImplementedAck(budgetDomain(input.category), 'budget_envelope_set', {
      category: input.category,
      currency: input.currency ?? 'CAD',
      monthlyAmount: input.monthlyAmount,
    }, {
      id: input.category,
      type: 'budget_envelope',
    });
  }
  const result = await services.budgets.setBudgetEnvelope(input);
  return writeAck({
    domain: budgetDomain(input.category),
    kind: 'budget_envelope_set',
    payload: result,
    readAfterWrite: await getFluentVNextPurchaseContext(services, { category: input.category }),
    source: 'budgets.setBudgetEnvelope',
    target: { id: input.category, type: 'budget_envelope' },
  });
}

export async function logFluentBudgetSpend(
  services: FluentVNextWriteServices,
  input: {
    amount: number;
    category: BudgetCategory;
    note?: string | null;
    occurredOn?: string | null;
    provenance: MutationProvenance;
  },
): Promise<FluentVNextWriteAck> {
  if (!services.budgets?.logBudgetSpend) {
    return notImplementedAck(budgetDomain(input.category), 'budget_spend_log', {
      amount: input.amount,
      category: input.category,
      occurredOn: input.occurredOn ?? null,
    }, {
      id: null,
      type: 'budget_spend_event',
    });
  }
  const result = await services.budgets.logBudgetSpend(input);
  return writeAck({
    domain: budgetDomain(input.category),
    kind: 'budget_spend_log',
    payload: result,
    readAfterWrite: await getFluentVNextPurchaseContext(services, { category: input.category }),
    source: 'budgets.logBudgetSpend',
    target: { id: stringField(result, 'eventId'), type: 'budget_spend_event' },
  });
}

export async function saveFluentVNextRecipe(
  services: FluentVNextWriteServices,
  input: {
    approval: FluentVNextRecipeWriteApproval;
    provenance: MutationProvenance;
    recipe: unknown;
  },
): Promise<FluentVNextWriteAck> {
  await requireExplicitRecipeWriteApproval(services, input.approval);
  if (!services.meals?.createRecipe) {
    return notImplementedAck('meals', 'recipe_save', input.recipe, {
      id: stringField(input.recipe, 'id'),
      type: 'recipe',
    });
  }

  const result = await services.meals.createRecipe({ recipe: input.recipe, provenance: input.provenance });
  const targetId = stringField(result, 'id') ?? stringField(input.recipe, 'id') ?? null;
  return writeAck({
    domain: 'meals',
    kind: 'recipe_save',
    payload: result,
    readAfterWrite: targetId ? await getFluentVNextItem(services, { domain: 'meals', itemId: targetId, itemType: 'recipe' }) : null,
    source: 'meals.createRecipe',
    target: { id: targetId, type: 'recipe' },
  });
}

export async function updateFluentVNextRecipePatch(
  services: FluentVNextWriteServices,
  input: {
    approval: FluentVNextRecipeWriteApproval;
    patch: Record<string, unknown>;
    provenance: MutationProvenance;
    recipeId: string;
  },
): Promise<FluentVNextWriteAck> {
  await requireExplicitRecipeWriteApproval(services, input.approval);
  if (!input.recipeId) {
    throw new Error('fluent_update_recipe_patch requires recipe_id.');
  }
  if (!services.meals?.patchRecipe) {
    return notImplementedAck('meals', 'recipe_patch', input.patch, {
      id: input.recipeId,
      type: 'recipe',
    });
  }

  const operations = recipePatchOperationsFromPatch(input.patch);
  const result = await services.meals.patchRecipe({
    operations,
    provenance: input.provenance,
    recipeId: input.recipeId,
  });
  return writeAck({
    domain: 'meals',
    kind: 'recipe_patch',
    payload: result,
    readAfterWrite: await getFluentVNextItem(services, { domain: 'meals', itemId: input.recipeId, itemType: 'recipe' }),
    source: 'meals.patchRecipe',
    target: { id: input.recipeId, type: 'recipe' },
  });
}

export async function recordFluentVNextRecipeFeedback(
  services: FluentVNextWriteServices,
  input: {
    approval: FluentVNextRecipeWriteApproval;
    feedback: Record<string, unknown>;
    provenance: MutationProvenance;
    recipeId: string;
  },
): Promise<FluentVNextWriteAck> {
  await requireExplicitRecipeWriteApproval(services, input.approval);
  if (!input.recipeId) {
    throw new Error('fluent_record_recipe_feedback requires recipe_id.');
  }
  if (!services.meals?.logFeedback) {
    return notImplementedAck('meals', 'recipe_feedback', input.feedback, {
      id: input.recipeId,
      type: 'recipe_feedback',
    });
  }

  const feedback = asRecord(input.feedback);
  const result = await services.meals.logFeedback({
    date: stringOrNull(feedback.date),
    difficulty: feedback.difficulty ?? null,
    familyAcceptance: feedback.family_acceptance ?? feedback.familyAcceptance ?? null,
    mealPlanEntryId: stringOrNull(feedback.meal_plan_entry_id ?? feedback.mealPlanEntryId),
    mealPlanId: stringOrNull(feedback.meal_plan_id ?? feedback.mealPlanId),
    notes: stringOrNull(feedback.notes),
    provenance: input.provenance,
    recipeId: input.recipeId,
    repeatAgain: feedback.repeat_again ?? feedback.repeatAgain ?? null,
    submittedBy: stringOrNull(feedback.submitted_by ?? feedback.submittedBy),
    taste: feedback.taste ?? null,
    timeReality: feedback.time_reality ?? feedback.timeReality ?? null,
  });
  return writeAck({
    domain: 'meals',
    kind: 'recipe_feedback',
    payload: result,
    readAfterWrite: await getFluentVNextItem(services, { domain: 'meals', itemId: input.recipeId, itemType: 'recipe' }),
    source: 'meals.logFeedback',
    target: { id: input.recipeId, type: 'recipe_feedback' },
  });
}

export async function applyFluentVNextGroceryListChange(
  services: FluentVNextWriteServices,
  input: {
    approval: FluentVNextRecipeWriteApproval;
    change: Record<string, unknown>;
    currentnessConfirmed?: boolean;
    listId?: string | null;
    listVersion?: string | null;
    provenance: MutationProvenance;
    weekStart?: string | null;
  },
): Promise<FluentVNextWriteAck> {
  await requireExplicitRecipeWriteApproval(services, input.approval);
  const change = asRecord(input.change);
  const kind = stringField(change, 'kind');
  if (!kind) {
    throw new Error('fluent_apply_grocery_list_change requires change.kind.');
  }
  if (!services.meals?.getCurrentGroceryList) {
    return notImplementedAck('meals', 'grocery_list_change', input.change, {
      id: input.listId ?? null,
      type: 'grocery_list',
    });
  }

  const currentList = asRecord(await services.meals.getCurrentGroceryList({
    skipCalibrationContext: true,
    weekStart: input.weekStart ?? undefined,
  }) ?? {});
  assertCurrentListMatches(input, currentList);
  if (currentListIsStale(currentList) && kind !== 'add_item' && input.currentnessConfirmed !== true) {
    throw new Error(
      'fluent_apply_grocery_list_change requires currentness_confirmed=true before changing stale or incomplete grocery-list items.',
    );
  }

  let result: unknown;
  let source = 'meals.getCurrentGroceryList';
  let targetId = currentListId(currentList) ?? input.listId ?? 'current_grocery_list';

  switch (kind) {
    case 'add_item': {
      if (!services.meals.upsertGroceryIntent) {
        return notImplementedAck('meals', 'grocery_list_change', input.change, {
          id: targetId,
          type: 'grocery_list',
        });
      }
      const item = asRecord(change.item);
      const displayName =
        stringField(change, 'display_name') ??
        stringField(change, 'displayName') ??
        stringField(change, 'name') ??
        stringField(item, 'display_name') ??
        stringField(item, 'displayName') ??
        stringField(item, 'name');
      if (!displayName) {
        throw new Error('add_item requires display_name.');
      }
      const targetWindow =
        stringOrNull(change.target_window ?? change.targetWindow) ??
        stringOrNull(item?.target_window ?? item?.targetWindow) ??
        currentListWeekStart(currentList);
      assertTargetWindowMatchesReadbackWeek(targetWindow, currentList);
      result = await services.meals.upsertGroceryIntent({
        displayName,
        mealPlanId: stringOrNull(change.meal_plan_id ?? change.mealPlanId),
        metadata: groceryChangeMetadata(kind, input, currentList),
        notes: stringOrNull(change.notes) ?? stringOrNull(item?.notes),
        provenance: input.provenance,
        quantity: numberOrNull(change.quantity) ?? numberOrNull(item?.quantity),
        status: 'pending',
        targetWindow,
        unit: stringOrNull(change.unit) ?? stringOrNull(item?.unit),
      });
      source = 'meals.upsertGroceryIntent';
      targetId = stringField(result, 'id') ?? targetId;
      break;
    }
    case 'mark_plan_item': {
      result = await applyGroceryPlanAction(services, input, currentList, change, {
        actionStatus: publicGroceryStatusToActionStatus(
          requiredString(change, 'status', 'mark_plan_item requires status.'),
        ),
      });
      source = 'meals.upsertGroceryPlanAction';
      targetId = stringField(asRecord(result)?.action, 'id') ?? targetId;
      break;
    }
    case 'substitute_plan_item': {
      const substitute = asRecord(change.substitute);
      const substituteDisplayName =
        stringField(change, 'substitute_display_name') ??
        stringField(change, 'substituteDisplayName') ??
        stringField(substitute, 'display_name') ??
        stringField(substitute, 'displayName') ??
        stringField(substitute, 'name');
      if (!substituteDisplayName) {
        throw new Error('substitute_plan_item requires substitute_display_name.');
      }
      result = await applyGroceryPlanAction(services, input, currentList, change, {
        actionStatus: 'substituted',
        createSubstituteIntent: booleanOrDefault(change.create_substitute_intent ?? change.createSubstituteIntent, false),
        intentNotes: stringOrNull(change.intent_notes ?? change.intentNotes),
        substituteDisplayName,
        substituteItemKey: stringOrNull(change.substitute_item_key ?? change.substituteItemKey),
        substituteQuantity: numberOrNull(change.substitute_quantity ?? change.substituteQuantity) ?? numberOrNull(substitute?.quantity),
        substituteUnit: stringOrNull(change.substitute_unit ?? change.substituteUnit) ?? stringOrNull(substitute?.unit),
      });
      source = 'meals.upsertGroceryPlanAction';
      targetId = stringField(asRecord(result)?.action, 'id') ?? targetId;
      break;
    }
    case 'update_manual_item': {
      if (!services.meals.upsertGroceryIntent) {
        return notImplementedAck('meals', 'grocery_list_change', input.change, {
          id: targetId,
          type: 'grocery_list',
        });
      }
      const intentId =
        stringField(change, 'intent_id') ??
        stringField(change, 'item_id') ??
        stringField(asRecord(change.item), 'id') ??
        stringField(asRecord(change.item), 'intent_id') ??
        stringField(asRecord(change.item), 'item_id');
      if (!intentId) {
        throw new Error('update_manual_item requires intent_id.');
      }
      const existingIntent = findCurrentListIntent(currentList, intentId);
      const displayName =
        stringField(change, 'display_name') ??
        stringField(change, 'displayName') ??
        stringField(existingIntent, 'displayName') ??
        stringField(existingIntent, 'display_name');
      if (!displayName) {
        throw new Error('update_manual_item requires display_name when the intent is not present in the current list readback.');
      }
      const targetWindow =
        stringOrNull(change.target_window ?? change.targetWindow) ??
        stringOrNull(existingIntent?.targetWindow ?? existingIntent?.target_window) ??
        currentListWeekStart(currentList);
      assertTargetWindowMatchesReadbackWeek(targetWindow, currentList);
      result = await services.meals.upsertGroceryIntent({
        displayName,
        id: intentId,
        mealPlanId:
          stringOrNull(change.meal_plan_id ?? change.mealPlanId) ??
          stringOrNull(existingIntent?.mealPlanId ?? existingIntent?.meal_plan_id),
        metadata: {
          ...(asRecord(existingIntent?.metadata) ?? {}),
          ...groceryChangeMetadata(kind, input, currentList),
        },
        notes: stringOrNull(change.notes) ?? stringOrNull(existingIntent?.notes),
        provenance: input.provenance,
        quantity: numberOrNull(change.quantity) ?? numberOrNull(existingIntent?.quantity),
        status: stringField(change, 'status') ?? stringField(existingIntent, 'status') ?? 'pending',
        targetWindow,
        unit: stringOrNull(change.unit) ?? stringOrNull(existingIntent?.unit),
      });
      source = 'meals.upsertGroceryIntent';
      targetId = stringField(result, 'id') ?? intentId;
      break;
    }
    default:
      throw new Error(`Unsupported grocery-list change kind: ${kind}.`);
  }

  return writeAck({
    domain: 'meals',
    kind: 'grocery_list_change',
    payload: result,
    readAfterWrite: await getFluentVNextCurrentGroceryListItem(services, {
      weekStart: input.weekStart ?? currentListWeekStart(currentList),
    }),
    source,
    target: { id: targetId, type: 'grocery_list' },
  });
}

export async function applyFluentVNextGroceryShoppingResult(
  services: FluentVNextWriteServices,
  input: {
    approval: FluentVNextRecipeWriteApproval;
    boughtItems?: Array<{ itemKey: string; status?: 'bought' | 'skipped' }>;
    currentnessConfirmed?: boolean;
    listId?: string | null;
    listVersion?: string | null;
    markAllToBuyBought?: boolean;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
    weekStart?: string | null;
  },
): Promise<FluentVNextWriteAck> {
  await requireExplicitRecipeWriteApproval(services, input.approval);
  const hasExplicit = Array.isArray(input.boughtItems) && input.boughtItems.length > 0;
  if (!hasExplicit && input.markAllToBuyBought !== true) {
    throw new Error(
      'fluent_apply_grocery_shopping_result requires bought_items (non-empty) or mark_all_to_buy_bought=true.',
    );
  }
  if (!services.meals?.getCurrentGroceryList || !services.meals?.applyGroceryShoppingResult) {
    return notImplementedAck('meals', 'grocery_shopping_result', input.boughtItems ?? null, {
      id: input.listId ?? null,
      type: 'grocery_list',
    });
  }

  const currentList = asRecord(await services.meals.getCurrentGroceryList({
    skipCalibrationContext: true,
    weekStart: input.weekStart ?? undefined,
  }) ?? {});
  assertCurrentListMatches(input, currentList);
  if (currentListIsStale(currentList) && input.currentnessConfirmed !== true) {
    throw new Error(
      'fluent_apply_grocery_shopping_result requires currentness_confirmed=true before reconciling a stale or incomplete grocery list.',
    );
  }

  const weekStart = input.weekStart ?? currentListWeekStart(currentList);
  const targetId = currentListId(currentList) ?? input.listId ?? 'current_grocery_list';
  const buildReadAfterWrite = async () => ({
    groceryList: await getFluentVNextCurrentGroceryListItem(services, { weekStart }),
    inventory: groceryShoppingInventorySummary((await services.meals?.getInventory?.()) ?? []),
  });

  if (isAcceptanceTestProvenance(input.provenance)) {
    return writeAck({
      domain: 'meals',
      kind: 'grocery_shopping_result',
      payload: {
        boughtItems: input.boughtItems ?? null,
        durable: false,
        markAllToBuyBought: input.markAllToBuyBought ?? false,
        status: 'acceptance_test_non_durable',
      },
      readAfterWrite: await buildReadAfterWrite(),
      source: 'meals.applyGroceryShoppingResult.acceptance_test_non_durable',
      target: { id: targetId, type: 'grocery_list' },
    });
  }

  const result = await services.meals.applyGroceryShoppingResult({
    boughtItems: input.boughtItems,
    markAllToBuyBought: input.markAllToBuyBought,
    provenance: input.provenance,
    weekStart,
  });

  return writeAck({
    domain: 'meals',
    kind: 'grocery_shopping_result',
    payload: { durable: true, result },
    readAfterWrite: await buildReadAfterWrite(),
    source: 'meals.applyGroceryShoppingResult',
    target: { id: targetId, type: 'grocery_list' },
  });
}

export async function saveFluentVNextMealPlan(
  services: FluentVNextWriteServices,
  input: {
    approval: FluentVNextRecipeWriteApproval;
    plan: unknown;
    provenance: MutationProvenance;
  },
): Promise<FluentVNextWriteAck> {
  await requireExplicitRecipeWriteApproval(services, input.approval);
  const plan = asRecord(input.plan);
  const weekStart = stringField(plan, 'week_start') ?? stringField(plan, 'weekStart');
  if (!weekStart) {
    throw new Error('fluent_save_meal_plan requires plan.week_start.');
  }
  const entries = Array.isArray(plan.entries) ? plan.entries : Array.isArray(plan.meals) ? plan.meals : [];
  if (entries.length === 0) {
    throw new Error('fluent_save_meal_plan requires at least one plan entry.');
  }
  if (!services.meals?.upsertPlan) {
    return notImplementedAck('meals', 'meal_plan_save', input.plan, {
      id: stringField(plan, 'id') ?? weekStart,
      type: 'meal_plan',
    });
  }

  const normalizedPlan = mealPlanForUpsert(plan, entries, weekStart);
  const result = await services.meals.upsertPlan({
    createNewPlan: true,
    plan: {
      ...normalizedPlan,
      sourceSnapshot: {
        ...(objectOrNull(plan.source_snapshot ?? plan.sourceSnapshot) ?? {}),
        planner: 'host_model',
        public_tool: 'fluent_save_meal_plan',
        write_boundary: 'explicit_user_approved',
      },
      status: stringField(plan, 'status') ?? 'approved',
    },
    provenance: input.provenance,
  });
  const targetId = stringField(result, 'id') ?? stringField(plan, 'id') ?? weekStart;
  return writeAck({
    domain: 'meals',
    kind: 'meal_plan_save',
    payload: result,
    readAfterWrite: await getFluentVNextItem(services, { domain: 'meals', itemId: targetId, itemType: 'meal_plan' }),
    source: 'meals.upsertPlan',
    target: { id: targetId, type: 'meal_plan' },
  });
}

function mealPlanForUpsert(
  plan: Record<string, unknown>,
  entries: unknown[],
  weekStart: string,
): Record<string, unknown> {
  return {
    id: stringOrNull(plan.id),
    weekStart,
    weekEnd: stringOrNull(plan.week_end ?? plan.weekEnd),
    generatedAt: stringOrNull(plan.generated_at ?? plan.generatedAt),
    profileOwner: stringOrNull(plan.profile_owner ?? plan.profileOwner),
    requirements: objectOrNull(plan.requirements) ?? {},
    summary: objectOrNull(plan.summary) ?? {},
    entries: entries.map((entry, index) => mealPlanEntryForUpsert(entry, index)),
  };
}

function mealPlanEntryForUpsert(entry: unknown, index: number): Record<string, unknown> {
  const record = objectOrNull(entry);
  if (!record) {
    throw new Error(`fluent_save_meal_plan entry ${index} must be an object.`);
  }
  const mealType = stringOrNull(record.meal_type ?? record.mealType);
  const recipeNameSnapshot =
    stringOrNull(record.recipe_name_snapshot ?? record.recipeNameSnapshot) ??
    stringOrNull(record.recipe_name ?? record.recipeName);
  if (!mealType || !recipeNameSnapshot) {
    throw new Error(`fluent_save_meal_plan entry ${index} requires meal_type and recipe_name.`);
  }
  const notes = objectOrNull(record.notes);
  return {
    id: stringOrNull(record.id),
    date: stringOrNull(record.date),
    dayLabel: stringOrNull(record.day_label ?? record.dayLabel),
    instructionsSnapshot: stringArray(record.instructionsSnapshot ?? record.instructions),
    leftoversExpected: booleanOrDefault(record.leftovers_expected ?? record.leftoversExpected, false),
    mealType,
    notes,
    prepMinutes: nonNegativeIntegerOrNull(record.prep_minutes ?? record.prepMinutes),
    recipeId: stringOrNull(record.recipe_id ?? record.recipeId),
    recipeNameSnapshot,
    selectionStatus: stringOrNull(record.selection_status ?? record.selectionStatus),
    serves: positiveIntegerOrNull(record.serves),
    status: stringOrNull(record.status),
    totalMinutes: nonNegativeIntegerOrNull(record.total_minutes ?? record.totalMinutes),
  };
}

export async function updateFluentVNextSharedProfilePatch(
  services: FluentVNextWriteServices,
  input: {
    domain: FluentVNextDomain;
    host?: PcHost | null;
    patch: unknown;
    provenance: MutationProvenance;
  },
): Promise<FluentVNextWriteAck> {
  await enforcePublicWriteRateLimit(services.publicWriteRateLimiter, getFluentAuthProps());
  const host = input.host ?? 'unknown';
  const rawPatch = asRecord(input.patch);
  const publicFactPatch = publicSharedProfileFactPatch(rawPatch);
  if (publicFactPatch && !isSupportedPublicSharedProfileFact(input.domain, publicFactPatch.kind)) {
    return notImplementedAck(input.domain, 'shared_profile_patch', input.patch, {
      id: null,
      type: `${input.domain}_profile_fact`,
    });
  }
  const patch = publicFactPatch ? expandPublicSharedProfileFactPatch(input.domain, publicFactPatch) : rawPatch;
  if (input.domain === 'shared') {
    const hasDisplayName = Object.prototype.hasOwnProperty.call(patch, 'display_name') || Object.prototype.hasOwnProperty.call(patch, 'displayName');
    const hasMetadata = Object.prototype.hasOwnProperty.call(patch, 'metadata');
    const hasTimezone = Object.prototype.hasOwnProperty.call(patch, 'timezone');
    const result = await services.core.updateProfile(
      {
        displayName: hasDisplayName ? stringOrNull(patch.display_name ?? patch.displayName) : undefined,
        metadata: hasMetadata ? patch.metadata : undefined,
        timezone: hasTimezone ? stringOrNull(patch.timezone) : undefined,
      },
      input.provenance,
    );
    return writeAck({
      domain: 'shared',
      kind: 'shared_profile_patch',
      payload: result,
      readAfterWrite: await getFluentVNextSharedProfile(services, { host }),
      source: 'core.updateProfile',
      target: { id: stringField(result, 'id'), type: 'shared_profile' },
    });
  }

  if (input.domain === 'style' && services.style?.updateProfile) {
    const profilePatch = patch.profile ?? patch;
    const result = await services.style.updateProfile({ profile: profilePatch, provenance: input.provenance });
    return writeAck({
      domain: 'style',
      kind: 'shared_profile_patch',
      payload: result,
      readAfterWrite: await services.style.getProfile?.(),
      source: 'style.updateProfile',
      target: { id: stringField(result, 'profileId'), type: 'style_profile' },
    });
  }

  if (input.domain === 'meals' && services.meals?.recordCalibrationResponse) {
    const response = mealsCalibrationResponseFromPatch(patch);
    const result = await services.meals.recordCalibrationResponse({
      provenance: input.provenance,
      response,
    });
    const personFactInput = personFactInputFromPublicPatch(publicFactPatch);
    const personFactAck = personFactInput
      ? await services.core.upsertPersonFact(personFactInput, input.provenance)
      : null;
    const rejectedPersonFactInput = personFactRejectionFromPublicPatch(publicFactPatch);
    const rejectedPersonFactAck =
      rejectedPersonFactInput && !personFactAck
        ? await services.core.rejectPersonFact(rejectedPersonFactInput, input.provenance)
        : null;
    const mirroredPersonFacts = publicFactPatch
      ? { rejected: 0, upserted: 0 }
      : await mirrorMealsTier1PersonFacts({
          preferencePatch: response.preferencePatch ?? null,
          provenance: input.provenance,
          rejectPersonFact: services.core.rejectPersonFact,
          signals: response.signals ?? null,
          upsertPersonFact: services.core.upsertPersonFact,
        });
    const hasMirroredPersonFacts = mirroredPersonFacts.rejected > 0 || mirroredPersonFacts.upserted > 0;
    return writeAck({
      domain: 'meals',
      kind: 'shared_profile_patch',
      payload:
        personFactAck || rejectedPersonFactAck
          ? { meals: result, personFact: personFactAck ?? rejectedPersonFactAck }
          : hasMirroredPersonFacts
            ? { meals: result, personFacts: mirroredPersonFacts }
          : result,
      readAfterWrite:
        (personFactAck || rejectedPersonFactAck || hasMirroredPersonFacts) && services.core.listPersonFacts
          ? await services.core.listPersonFacts({ consumerDomain: 'meals', host })
          : await services.meals.getOnboardingCalibration?.({ includeCurrentGroceryList: true }),
      source: personFactAck
        ? 'meals.recordCalibrationResponse+core.upsertPersonFact'
        : rejectedPersonFactAck
          ? 'meals.recordCalibrationResponse+core.rejectPersonFact'
          : hasMirroredPersonFacts
            ? 'meals.recordCalibrationResponse+core.mirrorTier1PersonFacts'
          : 'meals.recordCalibrationResponse',
      target: {
        id: personFactAck?.path ?? rejectedPersonFactAck?.path ?? mealsProfileTargetId(result) ?? null,
        type: personFactAck || rejectedPersonFactAck || hasMirroredPersonFacts ? 'person_fact' : 'meal_calibration',
      },
    });
  }

  return notImplementedAck(input.domain, 'shared_profile_patch', input.patch);
}

async function requireExplicitRecipeWriteApproval(
  services: Pick<FluentVNextWriteServices, 'publicWriteRateLimiter'>,
  approval: unknown,
): Promise<void> {
  if (approval !== 'explicit_user_approved') {
    throw new Error('Recipe writes require approval="explicit_user_approved".');
  }
  await enforcePublicWriteRateLimit(services.publicWriteRateLimiter, getFluentAuthProps());
}

function budgetDomain(category: BudgetCategory): FluentVNextDomain {
  return category === 'style-clothing' ? 'style' : 'meals';
}

function recipePatchOperationsFromPatch(patch: Record<string, unknown>): JsonPatchOperation[] {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('fluent_update_recipe_patch requires a patch object.');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'id') || Object.prototype.hasOwnProperty.call(patch, 'recipe_id')) {
    throw new Error('fluent_update_recipe_patch cannot change recipe identity.');
  }
  const operations = Object.entries(patch).map(([field, value]) => {
    return { op: 'replace' as const, path: `/${field}`, value };
  });
  if (operations.length === 0) {
    throw new Error('fluent_update_recipe_patch requires at least one recipe field.');
  }
  return operations;
}

async function applyGroceryPlanAction(
  services: FluentVNextWriteServices,
  input: {
    change: Record<string, unknown>;
    listId?: string | null;
    listVersion?: string | null;
    provenance: MutationProvenance;
    weekStart?: string | null;
  },
  currentList: Record<string, unknown>,
  change: Record<string, unknown>,
  action: {
    actionStatus:
      | 'purchased'
      | 'skipped'
      | 'substituted'
      | 'confirmed'
      | 'needs_purchase'
      | 'have_enough'
      | 'have_some_need_to_buy'
      | 'dont_have_it';
    createSubstituteIntent?: boolean | null;
    intentNotes?: string | null;
    substituteDisplayName?: string | null;
    substituteItemKey?: string | null;
    substituteQuantity?: number | null;
    substituteUnit?: string | null;
  },
) {
  if (!services.meals?.upsertGroceryPlanAction) {
    return notImplementedAck('meals', 'grocery_list_change', input.change, {
      id: currentListId(currentList),
      type: 'grocery_list',
    });
  }
  const weekStart = input.weekStart?.trim() || requiredString(currentList, 'weekStart', 'No current grocery-list week_start is available.');
  const itemKey = requiredString(change, 'item_key', `${String(change.kind)} requires item_key from a current grocery-list read.`);
  return services.meals.upsertGroceryPlanAction({
    actionStatus: action.actionStatus,
    createSubstituteIntent: action.createSubstituteIntent,
    intentNotes: action.intentNotes,
    itemKey,
    mealPlanId: stringOrNull(change.meal_plan_id ?? change.mealPlanId),
    metadata: {
      ...groceryChangeMetadata(stringField(change, 'kind') ?? 'unknown', input, currentList),
      rememberInventory: booleanOrDefault(change.remember_inventory ?? change.rememberInventory, false),
    },
    notes: stringOrNull(change.notes),
    provenance: input.provenance,
    purchasedAt: stringOrNull(change.purchased_at ?? change.purchasedAt),
    substituteDisplayName: action.substituteDisplayName,
    substituteItemKey: action.substituteItemKey,
    substituteQuantity: action.substituteQuantity,
    substituteUnit: action.substituteUnit,
    weekStart,
  });
}

function assertCurrentListMatches(
  input: { listId?: string | null; listVersion?: string | null },
  currentList: Record<string, unknown>,
) {
  const actualListId = currentListId(currentList);
  if (input.listId && actualListId && input.listId !== actualListId) {
    throw new Error(`grocery list mismatch: expected ${input.listId}, got ${actualListId}.`);
  }
  const actualVersion = stringField(currentList, 'version');
  if (input.listVersion && actualVersion && input.listVersion !== actualVersion) {
    throw new Error('grocery list version mismatch; read the current grocery list again before writing.');
  }
}

function currentListId(currentList: Record<string, unknown>): string | null {
  return stringField(currentList, 'listId') ?? stringField(currentList, 'list_id') ?? 'current_grocery_list';
}

function currentListWeekStart(currentList: Record<string, unknown>): string | null {
  return stringOrNull(currentList.weekStart ?? currentList.week_start);
}

function assertTargetWindowMatchesReadbackWeek(targetWindow: string | null, currentList: Record<string, unknown>) {
  const selectedWeekStart = currentListWeekStart(currentList);
  if (!targetWindow || !selectedWeekStart || !isIsoDateString(targetWindow)) {
    return;
  }
  if (targetWindow !== selectedWeekStart) {
    throw new Error(
      `grocery-list target_window ${targetWindow} does not match selected readback week ${selectedWeekStart}; read the target week or omit target_window before writing.`,
    );
  }
}

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function currentListIsStale(currentList: Record<string, unknown>): boolean {
  return Boolean(currentList.stale) || stringField(currentList, 'trustState') !== 'ready_to_shop';
}

function findCurrentListIntent(currentList: Record<string, unknown>, intentId: string): Record<string, unknown> | null {
  const intents = Array.isArray(currentList.intents) ? currentList.intents : [];
  return (intents.find((intent) => stringField(intent, 'id') === intentId) as Record<string, unknown> | undefined) ?? null;
}

function groceryChangeMetadata(kind: string, input: { listId?: string | null; listVersion?: string | null }, currentList: Record<string, unknown>) {
  return {
    fluentLifecycle: {
      kind,
      listId: input.listId ?? currentListId(currentList),
      listVersion: input.listVersion ?? stringField(currentList, 'version'),
      objectRole: stringField(currentList, 'objectRole') ?? stringField(currentList, 'object_role') ?? 'living_grocery_list',
      source: 'fluent_apply_grocery_list_change',
    },
  };
}

function publicGroceryStatusToActionStatus(status: string) {
  switch (status) {
    case 'bought':
      return 'purchased';
    case 'skipped':
    case 'deferred':
      return 'skipped';
    case 'confirmed':
      return 'confirmed';
    case 'needs_purchase':
      return 'needs_purchase';
    case 'already_have_enough':
      return 'have_enough';
    case 'have_some_need_to_buy':
      return 'have_some_need_to_buy';
    case 'dont_have_it':
      return 'dont_have_it';
    default:
      throw new Error(`Unsupported grocery plan item status: ${status}.`);
  }
}

function requiredString(record: Record<string, unknown>, key: string, message: string): string {
  const value = stringField(record, key);
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function nonNegativeIntegerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

type PublicSharedProfileFactPatch = {
  kind:
    | 'allergy'
    | 'hard_avoid'
    | 'dietary_pattern'
    | 'avoid'
    | 'favorite'
    | 'planning_grocery_day'
    | 'weeknight_time_limit_minutes'
    | 'normal_weeknight_cooking_time_minutes'
    | 'shopping_pantry_check_policy'
    | 'routine_note'
    | 'timezone'
    | 'display_name';
  note: string | null;
  pattern?: DietaryPattern;
  questionId: string | null;
  status: 'confirmed' | 'corrected' | 'rejected';
  value: string;
};

function publicSharedProfileFactPatch(patch: Record<string, unknown>): PublicSharedProfileFactPatch | null {
  const kind = stringOrNull(patch.kind);
  const status = stringOrNull(patch.status);
  const value = stringOrNull(patch.value);
  if (!kind || !status || !value) {
    return null;
  }
  if (!isPublicSharedProfileFactKind(kind) || !isPublicSharedProfileFactStatus(status)) {
    return null;
  }
  return {
    kind,
    note: stringOrNull(patch.note),
    ...(kind === 'dietary_pattern' ? optionalPublicDietaryPattern(patch.pattern) : {}),
    questionId: stringOrNull(patch.question_id ?? patch.questionId),
    status,
    value,
  };
}

function optionalPublicDietaryPattern(value: unknown): { pattern: DietaryPattern } | Record<string, never> {
  if (value === 'vegetarian' || value === 'vegan' || value === 'pescatarian') {
    return { pattern: value };
  }
  return {};
}

function isSupportedPublicSharedProfileFact(domain: FluentVNextDomain, kind: PublicSharedProfileFactPatch['kind']): boolean {
  if (domain === 'shared') {
    return kind === 'timezone' || kind === 'display_name';
  }
  if (domain === 'meals') {
    return [
      'allergy',
      'hard_avoid',
      'dietary_pattern',
      'avoid',
      'favorite',
      'planning_grocery_day',
      'weeknight_time_limit_minutes',
      'normal_weeknight_cooking_time_minutes',
      'shopping_pantry_check_policy',
      'routine_note',
    ].includes(kind);
  }
  return false;
}

function personFactInputFromPublicPatch(publicFactPatch: PublicSharedProfileFactPatch | null): {
  kind: PersonFactKind;
  value: unknown;
  status: PersonFactStatus;
  source: PersonFactSource;
} | null {
  if (!publicFactPatch || (publicFactPatch.status !== 'confirmed' && publicFactPatch.status !== 'corrected')) {
    return null;
  }
  // Correction is path-local. Value-keyed kinds derive their path from value, so correcting
  // cilantro -> mushrooms writes a new fact path; the old value must be rejected separately.
  if (publicFactPatch.kind === 'hard_avoid') {
    return {
      kind: 'hard_avoid',
      value: { label: publicFactPatch.value },
      status: 'confirmed',
      source: { origin: 'user_confirmed', domain: 'meals', detail: 'shared_profile_patch' },
    };
  }
  if (publicFactPatch.kind === 'allergy') {
    return {
      kind: 'allergy',
      value: { label: publicFactPatch.value, severity: 'avoid' },
      status: 'confirmed',
      source: { origin: 'user_confirmed', domain: 'meals', detail: 'shared_profile_patch' },
    };
  }
  if (publicFactPatch.kind === 'dietary_pattern') {
    const pattern = publicFactPatch.pattern
      ? (hasDietaryNegationOrHedgeCue(publicFactPatch.value) ? undefined : publicFactPatch.pattern)
      : recognizeDietaryPattern(publicFactPatch.value) ?? undefined;
    return {
      kind: 'dietary_pattern',
      value: pattern ? { label: publicFactPatch.value, pattern } : { label: publicFactPatch.value },
      status: 'confirmed',
      source: { origin: 'user_confirmed', domain: 'meals', detail: 'shared_profile_patch' },
    };
  }
  if (publicFactPatch.kind === 'avoid') {
    return {
      kind: 'anti_favorite',
      value: { label: publicFactPatch.value, domain_hint: 'meals' },
      status: 'confirmed',
      source: { origin: 'user_confirmed', domain: 'meals', detail: 'shared_profile_patch' },
    };
  }
  if (publicFactPatch.kind === 'favorite') {
    return {
      kind: 'taste_pref',
      value: { label: publicFactPatch.value, polarity: 'like' },
      status: 'confirmed',
      source: { origin: 'user_confirmed', domain: 'meals', detail: 'shared_profile_patch' },
    };
  }
  return null;
}

function personFactRejectionFromPublicPatch(publicFactPatch: PublicSharedProfileFactPatch | null): {
  kind: PersonFactKind;
  value: unknown;
} | null {
  if (!publicFactPatch || publicFactPatch.status !== 'rejected') {
    return null;
  }
  if (publicFactPatch.kind === 'hard_avoid') {
    return { kind: 'hard_avoid', value: { label: publicFactPatch.value } };
  }
  if (publicFactPatch.kind === 'allergy') {
    return { kind: 'allergy', value: { label: publicFactPatch.value, severity: 'avoid' } };
  }
  if (publicFactPatch.kind === 'dietary_pattern') {
    return { kind: 'dietary_pattern', value: { label: publicFactPatch.value } };
  }
  if (publicFactPatch.kind === 'avoid') {
    return { kind: 'anti_favorite', value: { label: publicFactPatch.value, domain_hint: 'meals' } };
  }
  if (publicFactPatch.kind === 'favorite') {
    return { kind: 'taste_pref', value: { label: publicFactPatch.value, polarity: 'like' } };
  }
  return null;
}

function expandPublicSharedProfileFactPatch(
  domain: FluentVNextDomain,
  patch: PublicSharedProfileFactPatch,
): Record<string, unknown> {
  if (domain === 'shared') {
    if (patch.kind === 'timezone') {
      return { timezone: patch.status === 'rejected' ? null : patch.value };
    }
    if (patch.kind === 'display_name') {
      return { display_name: patch.status === 'rejected' ? null : patch.value };
    }
  }

  if (domain === 'meals') {
    const preferencePatch = mealsPreferencePatchFromPublicFact(patch);
    return {
      calibration_response: {
        ...(patch.questionId ? { question_id: patch.questionId } : {}),
        ...(Object.keys(preferencePatch).length ? { preference_patch: preferencePatch } : {}),
        signals: [mealsSignalFromPublicFact(patch)],
        starter_preference_text: patch.note ?? `${patch.kind}: ${patch.value}`,
      },
    };
  }

  return patch as unknown as Record<string, unknown>;
}

function mealsPreferencePatchFromPublicFact(patch: PublicSharedProfileFactPatch): Record<string, unknown> {
  if (patch.status === 'rejected') {
    return {};
  }
  switch (patch.kind) {
    case 'allergy':
      return { avoids: [patch.value] };
    case 'hard_avoid':
      return { hard_avoids: [patch.value] };
    case 'avoid':
      return { avoids: [patch.value] };
    case 'favorite':
      return { favorites: [patch.value] };
    case 'planning_grocery_day':
      return { planning_grocery_day: patch.value };
    case 'weeknight_time_limit_minutes':
      return { weeknight_time_limit_minutes: minutesFromPublicFact(patch) };
    case 'normal_weeknight_cooking_time_minutes':
      return { normal_weeknight_cooking_time_minutes: minutesFromPublicFact(patch) };
    case 'shopping_pantry_check_policy':
      return { shopping_pantry_check_policy: patch.value };
    case 'routine_note':
      return { meal_routine: patch.value };
    default:
      return {};
  }
}

function mealsSignalFromPublicFact(patch: PublicSharedProfileFactPatch): Record<string, unknown> {
  const signal: Record<string, unknown> = {
    kind: mealsSignalKindFromPublicFact(patch.kind),
    note: patch.note ?? undefined,
    status: patch.status,
    value: patch.value,
  };
  if (patch.status === 'corrected') {
    signal.corrected_value = patch.value;
  }
  return signal;
}

function mealsSignalKindFromPublicFact(kind: PublicSharedProfileFactPatch['kind']): string {
  switch (kind) {
    case 'allergy':
    case 'hard_avoid':
    case 'avoid':
      return 'disliked_food';
    case 'dietary_pattern':
      return 'dietary_constraint';
    case 'favorite':
      return 'preferred_food';
    case 'weeknight_time_limit_minutes':
    case 'normal_weeknight_cooking_time_minutes':
      return 'weeknight_time_limit';
    case 'shopping_pantry_check_policy':
      return 'pantry_check_policy';
    case 'routine_note':
      return 'meal_routine';
    case 'planning_grocery_day':
    default:
      return 'planning_grocery_day';
  }
}

export async function upsertFluentVNextItem(
  services: FluentVNextWriteServices,
  input: {
    domain: FluentVNextDomain;
    item: unknown;
    itemId?: string | null;
    itemType?: FluentVNextItemType | null;
    operations?: unknown[] | null;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  },
): Promise<FluentVNextWriteAck> {
  if (input.domain === 'style' && services.style?.upsertItem) {
    const result = await services.style.upsertItem({
      item: mergeItemId(input.item, input.itemId),
      provenance: input.provenance,
      sourceSnapshot: input.sourceSnapshot,
    });
    const targetId = stringField(result, 'id') ?? input.itemId ?? null;
    return writeAck({
      domain: 'style',
      kind: 'item_upsert',
      payload: result,
      readAfterWrite: targetId ? await getFluentVNextItem(services, { domain: 'style', itemId: targetId, itemType: 'style_item' }) : null,
      source: 'style.upsertItem',
      target: { id: targetId, type: 'style_item' },
    });
  }

  if (input.domain === 'meals' && services.meals) {
    const recipeId = input.itemId ?? stringField(input.item, 'id') ?? stringField(input.item, 'recipeId');
    if (input.operations?.length && recipeId && services.meals.patchRecipe) {
      const result = await services.meals.patchRecipe({
        operations: input.operations,
        provenance: input.provenance,
        recipeId,
      });
      return writeAck({
        domain: 'meals',
        kind: 'item_upsert',
        payload: result,
        readAfterWrite: await getFluentVNextItem(services, { domain: 'meals', itemId: recipeId, itemType: 'recipe' }),
        source: 'meals.patchRecipe',
        target: { id: recipeId, type: 'recipe' },
      });
    }

    if ((input.itemType === 'recipe' || !input.itemType) && services.meals.createRecipe) {
      const result = await services.meals.createRecipe({ recipe: input.item, provenance: input.provenance });
      const targetId = stringField(result, 'id') ?? recipeId ?? null;
      return writeAck({
        domain: 'meals',
        kind: 'item_upsert',
        payload: result,
        readAfterWrite: targetId ? await getFluentVNextItem(services, { domain: 'meals', itemId: targetId, itemType: 'recipe' }) : null,
        source: 'meals.createRecipe',
        target: { id: targetId, type: 'recipe' },
      });
    }
  }

  return notImplementedAck(input.domain, 'item_upsert', input.item, {
    id: input.itemId ?? stringField(input.item, 'id') ?? null,
    type: input.itemType ?? null,
  });
}

export async function updateFluentStyleItemPatch(
  services: FluentVNextWriteServices,
  input: {
    itemId: string;
    patch: Record<string, unknown>;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  },
): Promise<FluentVNextWriteAck> {
  if (!input.itemId) {
    throw new Error('fluent_update_style_item_patch requires item_id.');
  }
  if (!services.style?.upsertItem) {
    return notImplementedAck('style', 'style_item_patch', input.patch, { id: input.itemId, type: 'style_item' });
  }
  const item = styleItemPatchToUpsertItem(input.itemId, input.patch);
  const sourceSnapshot = {
    ...(objectOrNull(input.sourceSnapshot) ?? {}),
    styleClosetPatch: input.patch,
  };
  if (isAcceptanceTestProvenance(input.provenance)) {
    const readAfterWrite = await getFluentVNextItem(services, {
      domain: 'style',
      itemId: input.itemId,
      itemType: 'style_item',
    });
    return writeAck({
      domain: 'style',
      kind: 'style_item_patch',
      payload: {
        durable: false,
        patch: input.patch,
        status: 'acceptance_test_non_durable',
      },
      readAfterWrite: styleReadAfterWriteProof(readAfterWrite),
      source: 'style.upsertItem.acceptance_test_non_durable',
      target: { id: input.itemId, type: 'style_item' },
    });
  }
  const result = await services.style.upsertItem({
    item,
    provenance: input.provenance,
    sourceSnapshot,
  });
  const readAfterWrite = await getFluentVNextItem(services, {
    domain: 'style',
    itemId: input.itemId,
    itemType: 'style_item',
  });
  return writeAck({
    domain: 'style',
    kind: 'style_item_patch',
    payload: {
      durable: true,
      patch: input.patch,
      result,
      unsupportedProfileFieldsStoredAsProvenance: unsupportedStylePatchFields(input.patch),
    },
    readAfterWrite: styleReadAfterWriteProof(readAfterWrite),
    source: 'style.upsertItem',
    target: { id: input.itemId, type: 'style_item' },
  });
}

export async function createFluentStyleItem(
  services: FluentVNextWriteServices,
  input: {
    item: unknown;
    profile?: unknown;
    technicalMetadata?: unknown;
    fieldEvidence?: unknown;
    fitAssessment?: unknown;
    overallConfidence?: number | null;
    hostModel?: string | null;
    hasImage?: boolean;
    onDuplicate?: 'warn' | 'force' | 'skip';
    clientToken?: string | null;
    batchId?: string | null;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  },
): Promise<FluentVNextWriteAck> {
  if (!services.style?.createItem) {
    return notImplementedAck('style', 'style_item_create', input.item, { id: 'style-item:new', type: 'style_item' });
  }
  // Acceptance-test provenance stays non-durable (mirrors the patch tool).
  if (isAcceptanceTestProvenance(input.provenance)) {
    const itemName = stringField(input.item, 'name');
    return writeAck({
      domain: 'style',
      kind: 'style_item_create',
      payload: {
        createdItemId: null,
        durable: false,
        itemName,
        nextAction:
          'For a live host cleanup audit, retry only after explicit user approval with a non-acceptance source_type, then archive the created item and verify zero active exact-name matches.',
        status: 'acceptance_test_non_durable',
        userMessage:
          'No Style item was created because source_type="acceptance_test" is verifier-only and non-durable. This is not a duplicate; it is an intentional test-write suppression.',
      },
      readAfterWrite: null,
      source: 'style.createItem.acceptance_test_non_durable',
      target: { id: 'style-item:new', type: 'style_item' },
    });
  }
  const generalProfile = stripStyleItemFitFields(objectOrNull(input.profile) ?? {});
  const generalFieldEvidence = stripStyleItemFitFields(
    downgradeStyleItemProfileFieldEvidence(input.fieldEvidence, input.hasImage === true),
  );
  const fitAssessment = buildStyleItemFitAssessment(input.fitAssessment, input.overallConfidence ?? null);
  const composedProfile = {
    ...generalProfile,
    ...(fitAssessment?.profile ?? {}),
  };
  const composedFieldEvidence = {
    ...generalFieldEvidence,
    ...(fitAssessment?.fieldEvidence ?? {}),
  };
  const serviceHasImage = input.hasImage === true || fitAssessment?.hasFitImage === true;
  const result = (await services.style.createItem({
    ...input,
    fieldEvidence: composedFieldEvidence,
    hasImage: serviceHasImage,
    profile: composedProfile,
  })) as {
    duplicateCandidates: StyleDuplicateCandidate[];
    idempotentReplay: boolean;
    item: { id?: string } | null;
    lowConfidenceFields: string[];
    normalizationNotes: string[];
    profileMethod: string;
    status: 'created' | 'duplicate_warning' | 'skipped_duplicate';
  };
  // Only a 'created' status is an actual new/idempotent item write. A 'skipped_duplicate' returns the
  // matched EXISTING item, and 'duplicate_warning' writes nothing — neither is a create, so do not
  // report createdItemId/read-after-write for them (Codex review).
  const created = result.status === 'created';
  const itemId = result.item && typeof result.item === 'object' ? result.item.id ?? null : null;
  const createdId = created ? itemId : null;
  const readAfterWrite = createdId
    ? styleReadAfterWriteProof(await getFluentVNextItem(services, { domain: 'style', itemId: createdId, itemType: 'style_item' }))
    : null;
  return writeAck({
    domain: 'style',
    kind: 'style_item_create',
    payload: {
      createdItemId: createdId,
      matchedItemId: result.status === 'skipped_duplicate' ? itemId : null,
      duplicateCandidates: result.duplicateCandidates,
      durable: created && !result.idempotentReplay,
      idempotentReplay: result.idempotentReplay,
      lowConfidenceFields: result.lowConfidenceFields,
      normalizationNotes: result.normalizationNotes,
      profileMethod: result.profileMethod,
      status: result.status,
    },
    readAfterWrite,
    source: 'style.createItem',
    target: { id: createdId ?? itemId ?? 'style-item:new', type: 'style_item' },
  });
}

export async function refreshFluentStyleItemProfile(
  services: FluentVNextWriteServices,
  input: {
    confidence?: number | null;
    fieldEvidence?: unknown;
    fitAssessment?: unknown;
    hasImage?: boolean;
    hostModel?: string | null;
    itemId: string;
    profile: unknown;
    provenance: MutationProvenance;
    source?: string | null;
    sourceSnapshot?: unknown;
  },
): Promise<FluentVNextWriteAck> {
  if (!input.itemId) {
    throw new Error('fluent_refresh_style_item_profile requires item_id.');
  }
  if (!objectOrNull(input.profile)) {
    throw new Error('fluent_refresh_style_item_profile requires a profile object.');
  }
  const rawProfile = objectOrNull(input.profile) ?? {};
  const reanalyzeSetRequested = rawProfile.reanalyzePending === true;
  const generalProfile = stripStyleItemFitFields(rawProfile);
  const generalFieldEvidence = stripStyleItemFitFields(
    downgradeStyleItemProfileFieldEvidence(input.fieldEvidence, input.hasImage === true),
  );
  const fitAssessment = buildStyleItemFitAssessment(input.fitAssessment, input.confidence ?? null);
  const composedProfile = reanalyzeSetRequested
    ? {
      reanalyzePending: true,
      reanalyzeRequestedAt: new Date().toISOString(),
    }
    : {
      ...generalProfile,
      ...(fitAssessment?.profile ?? {}),
      reanalyzePending: false,
      reanalyzeRequestedAt: null,
    };
  const composedFieldEvidence = reanalyzeSetRequested
    ? {}
    : {
      ...generalFieldEvidence,
      ...(fitAssessment?.fieldEvidence ?? {}),
    };
  const mergedSource = input.source ?? fitAssessment?.source ?? null;
  const serviceHasImage = input.hasImage === true || fitAssessment?.hasFitImage === true;
  const existing = await services.style?.getItem?.(input.itemId);
  if (!existing) {
    throw new Error(`Unknown style item: ${input.itemId}`);
  }
  const sourceSnapshot = {
    ...(objectOrNull(input.sourceSnapshot) ?? {}),
    hostModel: input.hostModel ?? null,
    refreshedVia: 'fluent_refresh_style_item_profile',
  };
  if (!services.style?.upsertItemProfile) {
    return notImplementedAck('style', 'style_item_profile_refresh', {
      profile: composedProfile,
      source: mergedSource,
    }, { id: input.itemId, type: 'style_item' });
  }
  const result = await services.style.upsertItemProfile({
    fieldEvidence: composedFieldEvidence,
    hasImage: serviceHasImage,
    itemId: input.itemId,
    method: styleProfileRefreshMethod(mergedSource, serviceHasImage),
    profile: composedProfile,
    provenance: input.provenance,
    source: mergedSource,
    sourceSnapshot,
  });
  const readAfterWrite = await getFluentVNextItem(services, {
    domain: 'style',
    itemId: input.itemId,
    itemType: 'style_item',
  });
  return writeAck({
    domain: 'style',
    kind: 'style_item_profile_refresh',
    payload: {
      durable: true,
      mergeAudit: objectOrNull(result)?.mergeAudit ?? null,
      result,
      source: mergedSource,
      sourceSnapshot,
    },
    readAfterWrite: styleReadAfterWriteProof(readAfterWrite),
    source: 'style.upsertItemProfile',
    target: { id: input.itemId, type: 'style_item' },
  });
}

export async function setFluentStyleItemImage(
  services: FluentVNextWriteServices,
  input: {
    caption?: string | null;
    imageType?: FluentStyleImageType | null;
    imageUrl: string;
    itemId: string;
    provenance: MutationProvenance;
    sourceSnapshot?: unknown;
  },
): Promise<FluentVNextWriteAck> {
  if (!input.itemId) {
    throw new Error('fluent_set_style_item_image requires item_id.');
  }
  if (!input.imageUrl) {
    throw new Error('fluent_set_style_item_image requires image_url.');
  }
  if (!services.style?.upsertItemPhotos) {
    return notImplementedAck('style', 'style_item_image_set', {
      imageUrl: input.imageUrl,
      imageType: input.imageType ?? 'primary',
    }, { id: input.itemId, type: 'style_item' });
  }
  if (isAcceptanceTestProvenance(input.provenance)) {
    const readAfterWrite = await getFluentVNextItem(services, {
      domain: 'style',
      itemId: input.itemId,
      itemType: 'style_item',
    });
    return writeAck({
      domain: 'style',
      kind: 'style_item_image_set',
      payload: {
        durable: false,
        imageType: input.imageType ?? 'primary',
        newImageUrl: input.imageUrl,
        status: 'acceptance_test_non_durable',
      },
      readAfterWrite: styleImageReadAfterWriteProof(readAfterWrite, input.imageUrl),
      source: 'style.upsertItemPhotos.acceptance_test_non_durable',
      target: { id: input.itemId, type: 'style_item' },
    });
  }
  const before = await services.style.getItem?.(input.itemId);
  const photos = stylePhotosWithNewImage(before, input);
  const result = await services.style.upsertItemPhotos({
    itemId: input.itemId,
    photos,
    provenance: input.provenance,
  });
  const readAfterWrite = await getFluentVNextItem(services, {
    domain: 'style',
    itemId: input.itemId,
    itemType: 'style_item',
  });
  return writeAck({
    domain: 'style',
    kind: 'style_item_image_set',
    payload: {
      caption: input.caption ?? null,
      durable: true,
      imageType: input.imageType ?? 'primary',
      newImageUrl: input.imageUrl,
      result,
      sourceSnapshot: {
        ...(objectOrNull(input.sourceSnapshot) ?? {}),
        hostInspectedImageUrl: input.imageUrl,
      },
    },
    readAfterWrite: styleImageReadAfterWriteProof(readAfterWrite, input.imageUrl),
    source: 'style.upsertItemPhotos',
    target: { id: input.itemId, type: 'style_item' },
  });
}

export async function archiveFluentVNextItem(
  services: FluentVNextWriteServices,
  input: {
    disposition?: FluentArchiveItemDisposition | null;
    domain: FluentVNextDomain;
    itemId?: string | null;
    itemName?: string | null;
    itemType?: FluentVNextItemType | null;
    provenance: MutationProvenance;
    reason?: string | null;
    sourceSnapshot?: unknown;
  },
): Promise<FluentVNextWriteAck> {
  if (input.domain === 'style' && services.style?.archiveItem) {
    const sourceSnapshot = archiveSourceSnapshot(input.sourceSnapshot, input.reason, input.disposition);
    if (isAcceptanceTestProvenance(input.provenance)) {
      const readAfterWrite = input.itemId
        ? await getFluentVNextItem(services, { domain: 'style', itemId: input.itemId, itemType: 'style_item' })
        : null;
      return writeAck({
        domain: 'style',
        kind: 'item_archive',
        payload: {
          durable: false,
          disposition: input.disposition ?? null,
          reason: input.reason ?? null,
          sourceSnapshot,
          status: 'acceptance_test_non_durable',
        },
        readAfterWrite,
        source: 'style.archiveItem.acceptance_test_non_durable',
        target: { id: input.itemId ?? null, type: input.itemType ?? 'style_item' },
      });
    }
    const result = await services.style.archiveItem({
      itemId: input.itemId,
      itemName: input.itemName,
      provenance: input.provenance,
      sourceSnapshot,
    });
    return writeAck({
      domain: 'style',
      kind: 'item_archive',
      payload: {
        ...(asRecord(result) ?? { result }),
        disposition: input.disposition ?? null,
        durable: true,
      },
      readAfterWrite: input.itemId
        ? await getFluentVNextItem(services, { domain: 'style', itemId: input.itemId, itemType: 'style_item' })
        : result,
      source: 'style.archiveItem',
      target: { id: input.itemId ?? null, type: input.itemType ?? 'style_item' },
    });
  }

  if (input.domain === 'meals' && input.itemType === 'inventory_item' && services.meals?.archiveInventoryItem) {
    const inventoryItem = await resolveMealsInventoryArchiveTarget(services, input.itemId, input.itemName);
    const itemName = stringField(inventoryItem, 'name') ?? stringField(inventoryItem, 'displayName') ?? input.itemName;
    if (!itemName) {
      return notImplementedAck('meals', 'item_archive', {
        disposition: input.disposition ?? null,
        itemId: input.itemId,
        itemName: input.itemName,
        reason: input.reason,
        unsupportedReason: 'meals inventory archive requires an inventory item name or resolvable item ID.',
      }, {
        id: input.itemId ?? null,
        type: 'inventory_item',
      });
    }
    const result = await services.meals.archiveInventoryItem({
      name: itemName,
      provenance: input.provenance,
    });
    if (!result) {
      // No matching active row (stale name / already-removed / unresolved exact-match). Do NOT report a
      // durable applied archive for a no-op; surface a not-found ack so the host never tells the user an
      // item was archived when nothing actually changed.
      return notImplementedAck('meals', 'item_archive', {
        disposition: input.disposition ?? null,
        itemId: input.itemId,
        itemName: input.itemName,
        reason: input.reason,
        unsupportedReason: 'meals inventory archive could not resolve a matching active inventory item.',
      }, {
        id: input.itemId ?? null,
        type: 'inventory_item',
      });
    }
    const readAfterWrite = await listFluentVNextItemsPage(services, {
      domain: 'meals',
      itemType: 'inventory_item',
      limit: 10,
      query: itemName,
    });
    return writeAck({
      domain: 'meals',
      kind: 'item_archive',
      payload: {
        disposition: input.disposition ?? null,
        durable: true,
        reason: input.reason ?? null,
        result,
        sourceSnapshot: archiveSourceSnapshot(input.sourceSnapshot, input.reason, input.disposition),
      },
      readAfterWrite,
      source: 'meals.archiveInventoryItem',
      target: { id: input.itemId ?? stringField(result, 'id') ?? null, type: 'inventory_item' },
    });
  }

  if (input.domain === 'meals' && input.itemType === 'recipe' && services.meals?.patchRecipe) {
    const sourceSnapshot = archiveSourceSnapshot(input.sourceSnapshot, input.reason, input.disposition);
    const recipe = await resolveMealsRecipeArchiveTarget(services, input.itemId, input.itemName);
    const recipeId = stringField(recipe, 'id');
    const recipeName = recipeTitle(recipe) ?? input.itemName ?? input.itemId ?? null;
    if (!recipeId) {
      return notImplementedAck('meals', 'item_archive', {
        disposition: input.disposition ?? null,
        itemId: input.itemId,
        itemName: input.itemName,
        reason: input.reason,
        unsupportedReason: 'meals recipe archive could not resolve a matching recipe by id or exact name.',
      }, {
        id: input.itemId ?? null,
        type: 'recipe',
      });
    }

    const result = await services.meals.patchRecipe({
      operations: [{ op: 'add', path: '/status', value: 'archived' }],
      provenance: input.provenance,
      recipeId,
    });
    const readAfterWrite = {
      activeList: await listFluentVNextItemsPage(services, {
        domain: 'meals',
        itemType: 'recipe',
        limit: 10,
        query: recipeName,
      }),
      item: await getFluentVNextItem(services, { domain: 'meals', itemId: recipeId, itemType: 'recipe' }),
    };
    return writeAck({
      domain: 'meals',
      kind: 'item_archive',
      payload: {
        disposition: input.disposition ?? null,
        durable: true,
        reason: input.reason ?? null,
        result,
        sourceSnapshot,
      },
      readAfterWrite,
      source: 'meals.patchRecipe',
      target: { id: recipeId, type: 'recipe' },
    });
  }

  return notImplementedAck(input.domain, 'item_archive', {
    disposition: input.disposition ?? null,
    itemId: input.itemId,
    itemName: input.itemName,
    reason: input.reason,
  }, {
    id: input.itemId ?? null,
    type: input.itemType ?? null,
  });
}

async function resolveMealsInventoryArchiveTarget(
  services: FluentVNextWriteServices,
  itemId: string | null | undefined,
  itemName: string | null | undefined,
): Promise<unknown | null> {
  const inventory = await services.meals?.getInventory?.() ?? [];
  if (itemId) {
    const direct = await getFluentVNextItem(services, {
      domain: 'meals',
      itemId,
      itemType: 'inventory_item',
    });
    if (direct?.payload) {
      return direct.payload;
    }
  }
  const query = itemName ?? itemId ?? null;
  if (!query) {
    return null;
  }
  const normalizedQuery = normalizeArchiveLookup(query);
  if (!normalizedQuery) {
    return null;
  }
  // Archive must match EXACTLY (by id, name, or canonical key). A substring/partial match here is
  // unsafe: "organic bananas" must not resolve to a different stored item named "bananas" and delete it.
  // On no exact match this returns null; the caller then attempts deletion by the RAW requested name,
  // which is still safe because the service deletes only WHERE normalized_name matches exactly (no-op on miss).
  return inventory.find((entry) => {
    const record = asRecord(entry);
    return [
      stringField(record, 'id'),
      stringField(record, 'name'),
      stringField(record, 'displayName'),
      stringField(record, 'normalizedName'),
      stringField(record, 'normalized_name'),
      stringField(record, 'canonicalItemKey'),
      stringField(record, 'canonical_item_key'),
    ].some((candidate) => normalizeArchiveLookup(candidate) === normalizedQuery);
  }) ?? null;
}

async function resolveMealsRecipeArchiveTarget(
  services: FluentVNextWriteServices,
  itemId: string | null | undefined,
  itemName: string | null | undefined,
): Promise<unknown | null> {
  if (itemId) {
    const direct = await services.meals?.getRecipe?.(itemId);
    if (direct) {
      return direct;
    }
  }

  const normalizedName = normalizeArchiveLookup(itemName);
  if (!normalizedName) {
    return null;
  }

  const recipes = await services.meals?.listRecipes?.(undefined, 'active') ?? [];
  return recipes.find((entry) => {
    const record = asRecord(entry);
    const raw = asRecord(record.raw);
    return [
      stringField(record, 'name'),
      stringField(record, 'title'),
      stringField(record, 'displayName'),
      stringField(raw, 'name'),
      stringField(raw, 'title'),
    ].some((candidate) => normalizeArchiveLookup(candidate) === normalizedName);
  }) ?? null;
}

function recipeTitle(value: unknown): string | null {
  const record = asRecord(value);
  const raw = asRecord(record.raw);
  return stringField(record, 'name') ?? stringField(record, 'title') ?? stringField(record, 'displayName') ?? stringField(raw, 'name') ?? stringField(raw, 'title');
}

export async function recordFluentVNextEvent(
  services: FluentVNextWriteServices,
  input: {
    domain: FluentVNextDomain;
    event: unknown;
    eventType?: string | null;
    provenance: MutationProvenance;
    subject?: string | null;
  },
): Promise<FluentVNextWriteAck> {
  if (input.domain === 'meals' && services.meals) {
    const event = asRecord(input.event);
    const eventType = input.eventType ?? stringOrNull(event.event_type ?? event.eventType ?? event.kind);
    if (services.meals.recordCalibrationResponse && isMealsCalibrationEvent(event, eventType)) {
      const response = mealsCalibrationResponseFromEvent(event);
      const result = await services.meals.recordCalibrationResponse({
        provenance: input.provenance,
        response,
      });
      const mirroredPersonFacts = await mirrorMealsTier1PersonFacts({
        preferencePatch: response.preferencePatch ?? null,
        provenance: input.provenance,
        rejectPersonFact: services.core.rejectPersonFact,
        signals: response.signals ?? null,
        upsertPersonFact: services.core.upsertPersonFact,
      });
      const hasMirroredPersonFacts = mirroredPersonFacts.rejected > 0 || mirroredPersonFacts.upserted > 0;
      return writeAck({
        domain: 'meals',
        kind: 'event_record',
        payload: hasMirroredPersonFacts ? { meals: result, personFacts: mirroredPersonFacts } : result,
        readAfterWrite:
          hasMirroredPersonFacts && services.core.listPersonFacts
            ? await services.core.listPersonFacts({ consumerDomain: 'meals', host: 'unknown' })
            : await services.meals.getOnboardingCalibration?.({ includeCurrentGroceryList: true }),
        source: hasMirroredPersonFacts
          ? 'meals.recordCalibrationResponse+core.mirrorTier1PersonFacts'
          : 'meals.recordCalibrationResponse',
        target: {
          id: stringField(result, 'profileId') ?? input.subject ?? null,
          type: hasMirroredPersonFacts ? 'person_fact' : 'meal_calibration',
        },
      });
    }

    if (eventType === 'recipe_feedback' || eventType === 'meal_feedback' || stringField(event, 'recipeId') || stringField(event, 'recipe_id')) {
      if (!services.meals.logFeedback) {
        return notImplementedAck(input.domain, 'event_record', input.event, { id: input.subject ?? null, type: eventType ?? null });
      }
      const recipeId = stringField(event, 'recipeId') ?? stringField(event, 'recipe_id') ?? input.subject;
      if (!recipeId) {
        throw new Error('fluent_record_event for Meals feedback requires recipe_id or subject.');
      }
      const result = await services.meals.logFeedback({
        date: stringOrNull(event.date),
        difficulty: event.difficulty ?? null,
        familyAcceptance: event.family_acceptance ?? event.familyAcceptance ?? null,
        mealPlanEntryId: stringOrNull(event.meal_plan_entry_id ?? event.mealPlanEntryId),
        mealPlanId: stringOrNull(event.meal_plan_id ?? event.mealPlanId),
        notes: stringOrNull(event.notes),
        provenance: input.provenance,
        recipeId,
        repeatAgain: event.repeat_again ?? event.repeatAgain ?? null,
        submittedBy: stringOrNull(event.submitted_by ?? event.submittedBy),
        taste: event.taste ?? null,
        timeReality: event.time_reality ?? event.timeReality ?? null,
      });
      return writeAck({
        domain: 'meals',
        kind: 'event_record',
        payload: result,
        readAfterWrite: await getFluentVNextItem(services, { domain: 'meals', itemId: recipeId, itemType: 'recipe' }),
        source: 'meals.logFeedback',
        target: { id: recipeId, type: 'recipe_feedback' },
      });
    }
  }

  return notImplementedAck(input.domain, 'event_record', input.event, { id: input.subject ?? null, type: input.eventType ?? null });
}

function isMealsCalibrationEvent(event: Record<string, unknown>, eventType: string | null): boolean {
  if (
    eventType === 'meals_calibration_response' ||
    eventType === 'meal_calibration_response' ||
    eventType === 'calibration_response' ||
    eventType === 'meal_preference_confirmation'
  ) {
    return true;
  }
  const response = asRecord(event.response);
  return Boolean(
    response?.preferencePatch ||
      response?.preference_patch ||
      response?.pantryItems ||
      response?.pantry_items ||
      response?.signals ||
      response?.starterPreferenceText ||
      response?.starter_preference_text ||
      event.preferencePatch ||
      event.preference_patch ||
      event.pantryItems ||
      event.pantry_items ||
      event.signals ||
      event.starterPreferenceText ||
      event.starter_preference_text,
  );
}

function mealsCalibrationResponseFromEvent(event: Record<string, unknown>): MealsCalibrationResponseInput {
  const nestedResponse = asRecord(event.response);
  const response = Object.keys(nestedResponse).length ? nestedResponse : event;
  return normalizeMealsCalibrationResponse(response);
}

function mealsCalibrationResponseFromPatch(patch: Record<string, unknown>): MealsCalibrationResponseInput {
  const nestedResponse = asRecord(patch.calibration_response ?? patch.calibrationResponse ?? patch.response);
  return normalizeMealsCalibrationResponse(Object.keys(nestedResponse).length ? nestedResponse : patch);
}

function normalizeMealsCalibrationResponse(response: Record<string, unknown>): MealsCalibrationResponseInput {
  return {
    pantryItems: normalizeMealsPantryItems(response.pantryItems ?? response.pantry_items),
    preferencePatch: normalizeMealsPreferencePatch(response.preferencePatch ?? response.preference_patch ?? response.patch),
    signals: normalizeMealsSignals(response.signals),
    starterPreferenceText: stringOrNull(response.starterPreferenceText ?? response.starter_preference_text),
  };
}

function normalizeMealsPreferencePatch(value: unknown): MealsCalibrationResponseInput['preferencePatch'] {
  const record = objectOrNull(value);
  if (!record) {
    return null;
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    normalized[snakeToCamel(key)] = entry;
  }
  return normalized as MealsCalibrationResponseInput['preferencePatch'];
}

function normalizeMealsSignals(value: unknown): MealsCalibrationResponseInput['signals'] {
  const entries = arrayOrNull(value);
  if (!entries) {
    return null;
  }
  return entries.map((entry) => {
    const record = objectOrNull(entry) ?? {};
    return {
      correctedValue: stringOrNull(record.correctedValue ?? record.corrected_value),
      kind: record.kind,
      note: stringOrNull(record.note),
      status: record.status,
      value: record.value,
    };
  }) as MealsCalibrationResponseInput['signals'];
}

function normalizeMealsPantryItems(value: unknown): MealsCalibrationResponseInput['pantryItems'] {
  const entries = arrayOrNull(value);
  if (!entries) {
    return null;
  }
  return entries.map((entry) => {
    const record = objectOrNull(entry) ?? {};
    return {
      itemName: stringOrNull(record.itemName ?? record.item_name) ?? '',
      note: stringOrNull(record.note),
      status: record.status,
    };
  }) as MealsCalibrationResponseInput['pantryItems'];
}

function mealsProfileTargetId(result: unknown): string | null {
  const tenantId = stringField(result, 'tenantId');
  const profileId = stringField(result, 'profileId');
  if (tenantId && profileId) {
    return `${tenantId}:${profileId}`;
  }
  return profileId;
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isPublicSharedProfileFactKind(value: string): value is PublicSharedProfileFactPatch['kind'] {
  return [
    'allergy',
    'hard_avoid',
    'dietary_pattern',
    'avoid',
    'favorite',
    'planning_grocery_day',
    'weeknight_time_limit_minutes',
    'normal_weeknight_cooking_time_minutes',
    'shopping_pantry_check_policy',
    'routine_note',
    'timezone',
    'display_name',
  ].includes(value);
}

function isPublicSharedProfileFactStatus(value: string): value is PublicSharedProfileFactPatch['status'] {
  return value === 'confirmed' || value === 'corrected' || value === 'rejected';
}

function minutesFromPublicFact(patch: PublicSharedProfileFactPatch): number {
  const value = Number.parseInt(patch.value, 10);
  if (!Number.isFinite(value) || value < 0 || value > 240) {
    throw new Error(`${patch.kind} must be a number of minutes from 0 to 240.`);
  }
  return value;
}

function styleItemPatchToUpsertItem(itemId: string, patch: Record<string, unknown>): Record<string, unknown> {
  const item: Record<string, unknown> = { id: itemId };
  const passthrough = [
    'brand',
    'category',
    'colorHex',
    'colorName',
    'color_hex',
    'color_name',
    'formality',
    'name',
    'size',
    // status is restore-only here (schema accepts 'active'); the service merges it via
    // normalizeStyleItemStatus, preserving the prior status when omitted. Archiving stays on
    // fluent_archive_item (explicit disposition + evidence trail).
    'status',
    'subcategory',
  ];
  for (const key of passthrough) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      item[key] = patch[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
    item.color_family = patch.color;
    item.colorFamily = patch.color;
  }
  const unsupported = unsupportedStylePatchFields(patch);
  if (unsupported.length > 0) {
    item.field_evidence = {
      styleClosetPatch: unsupported.reduce<Record<string, unknown>>((output, key) => {
        output[key] = patch[key];
        return output;
      }, {}),
    };
  }
  return item;
}

function unsupportedStylePatchFields(patch: Record<string, unknown>): string[] {
  const supported = new Set([
    'brand',
    'category',
    'color',
    'colorHex',
    'colorName',
    'color_hex',
    'color_name',
    'formality',
    'name',
    'size',
    'status',
    'subcategory',
  ]);
  return Object.keys(patch).filter((key) => !supported.has(key));
}

function stylePhotosWithNewImage(
  before: unknown,
  input: { caption?: string | null; imageType?: FluentStyleImageType | null; imageUrl: string; itemId: string },
): unknown[] {
  const beforePhotos = arrayOrNull(objectOrNull(before)?.photos) ?? [];
  const imageType = input.imageType ?? 'primary';
  const isFitImage = imageType === 'fit';
  const newPhoto = {
    id: `style-photo:${input.itemId}:${imageType}`,
    imported_from: 'fluent_style_closet_manager',
    is_fit: isFitImage,
    is_primary: imageType === 'primary',
    kind: isFitImage ? 'fit' : 'product',
    note: input.caption ?? null,
    source: 'host_inspected',
    source_url: input.imageUrl,
    url: input.imageUrl,
    view: isFitImage ? 'fit_front' : 'front',
  };
  const existing = beforePhotos
    .map((photo) => objectOrNull(photo))
    .filter((photo): photo is Record<string, unknown> => Boolean(photo))
    .filter((photo) => stringOrNull(photo.id) !== newPhoto.id)
    .map((photo) => {
      const rewritePhoto = markHostInspectedStylePhotoForRewrite(photo);
      if (imageType !== 'primary' || isStyleFitPhotoObject(rewritePhoto)) {
        return rewritePhoto;
      }
      return { ...rewritePhoto, is_primary: false, isPrimary: false };
    });
  return imageType === 'primary' ? [newPhoto, ...existing] : [...existing, newPhoto];
}

function markHostInspectedStylePhotoForRewrite(photo: Record<string, unknown>): Record<string, unknown> {
  const importedFrom = stringOrNull(photo.imported_from ?? photo.importedFrom);
  if (importedFrom !== 'fluent_style_closet_manager') {
    return photo;
  }
  return { ...photo, source: 'host_inspected' };
}

function isStyleFitPhotoObject(photo: Record<string, unknown>): boolean {
  const kind = stringOrNull(photo.kind);
  const view = stringOrNull(photo.view);
  return Boolean(photo.is_fit ?? photo.isFit) || kind === 'fit' || view?.startsWith('fit_') === true;
}

function styleReadAfterWriteProof(readAfterWrite: unknown): unknown {
  const payload = objectOrNull(objectOrNull(readAfterWrite)?.payload);
  if (!payload) {
    return readAfterWrite;
  }
  return {
    ...(readAfterWrite as Record<string, unknown>),
    brand: payload.brand ?? null,
    category: payload.category ?? null,
    color: payload.colorFamily ?? payload.color_family ?? null,
    id: payload.id ?? objectOrNull(readAfterWrite)?.id ?? null,
    name: payload.name ?? null,
    payload,
    size: payload.size ?? null,
    status: payload.status ?? null,
    subcategory: payload.subcategory ?? null,
  };
}

function stripStyleItemFitFields(record: Record<string, unknown>): Record<string, unknown> {
  const stripped = { ...record };
  for (const field of STYLE_ITEM_FIT_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}

function downgradeStyleItemProfileFieldEvidence(fieldEvidence: unknown, hasImage: boolean): Record<string, unknown> {
  const record = objectOrNull(fieldEvidence) ?? {};
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(record)) {
    const evidence = objectOrNull(value);
    const source = stringOrNull(evidence?.source);
    if (!hasImage && evidence && (source === 'host_vision' || source === 'host_visual_inspection')) {
      out[field] = { ...evidence, downgradedReason: 'no_image_supplied', source: 'host_text' };
    } else {
      out[field] = value;
    }
  }
  return out;
}

function buildStyleItemFitAssessment(
  value: unknown,
  defaultConfidence: number | null,
): {
  fieldEvidence: Record<string, { confidence: number | null; source: string | null; value: unknown }>;
  hasFitImage: boolean;
  profile: Record<string, unknown>;
  source: string;
} | null {
  const record = objectOrNull(value);
  if (!record) {
    return null;
  }
  const requestedSource = record.source === 'user' ? 'user' : 'host_fit_vision';
  const hasFitImage = record.has_fit_image === true;
  const source = requestedSource === 'host_fit_vision' && !hasFitImage ? 'host_text' : requestedSource;
  const confidence = typeof record.confidence === 'number' ? record.confidence : defaultConfidence;
  const profile: Record<string, unknown> = {};

  for (const field of STYLE_ITEM_FIT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      profile[field] = record[field];
    }
  }
  if (Object.keys(profile).length === 0) {
    return { fieldEvidence: {}, hasFitImage, profile, source };
  }

  const fieldEvidence: Record<string, { confidence: number | null; source: string | null; value: unknown }> = {};
  for (const [field, fieldValue] of Object.entries(profile)) {
    fieldEvidence[field] = {
      confidence,
      source,
      value: fieldValue,
    };
  }
  return { fieldEvidence, hasFitImage, profile, source };
}

function styleProfileRefreshMethod(source: string | null | undefined, hasImage: boolean | undefined): string | null {
  if (source === 'host_fit_vision') {
    return hasImage === true ? 'host_fit_vision' : 'host_text';
  }
  if (source === 'host_vision' || source === 'host_visual_inspection') {
    return hasImage === true ? 'host_vision' : 'host_text';
  }
  if (source === 'host_text') {
    return 'host_text';
  }
  if (source === 'heuristic_bootstrap' || source === 'inferred') {
    return 'heuristic_bootstrap';
  }
  return source ?? null;
}

function styleImageReadAfterWriteProof(readAfterWrite: unknown, imageUrl: string): unknown {
  const proof = styleReadAfterWriteProof(readAfterWrite);
  const proofRecord = objectOrNull(proof) ?? {};
  return {
    ...proofRecord,
    hasImage: true,
    newImageUrl: imageUrl,
    updatedItem: proof,
  };
}

function archiveSourceSnapshot(
  sourceSnapshot: unknown,
  reason: string | null | undefined,
  disposition: FluentArchiveItemDisposition | null | undefined,
): Record<string, unknown> {
  const archiveEvidenceTrail = {
    disposition: disposition ?? null,
    reason: reason ?? null,
  };
  return {
    ...(asRecord(sourceSnapshot) ?? {}),
    archiveEvidenceTrail,
    archiveReason: reason ?? null,
    disposition: disposition ?? null,
    reason: [disposition ? `disposition:${disposition}` : null, reason ?? null].filter(Boolean).join(' - ') || null,
  };
}

function isAcceptanceTestProvenance(provenance: MutationProvenance): boolean {
  return provenance.sourceType === 'acceptance_test';
}

function groceryShoppingInventorySummary(inventory: unknown[]): {
  totalItems: number;
  present: number;
  sampleNames: string[];
} {
  const items = Array.isArray(inventory) ? inventory : [];
  let present = 0;
  const sampleNames: string[] = [];
  for (const entry of items) {
    const record = asRecord(entry) ?? {};
    if (stringField(record, 'status') === 'present') {
      present += 1;
    }
    if (sampleNames.length < 8) {
      const name = stringField(record, 'name') ?? stringField(record, 'displayName');
      if (name) {
        sampleNames.push(name);
      }
    }
  }
  return { present, sampleNames, totalItems: items.length };
}

function writeAck(input: {
  domain: FluentVNextDomain;
  kind: FluentVNextWriteKind;
  payload: unknown;
  readAfterWrite: unknown;
  source: string;
  target: FluentVNextWriteAck['target'];
}): FluentVNextWriteAck {
  const payloadRecord = objectOrNull(input.payload);
  const durable = typeof payloadRecord?.durable === 'boolean' ? payloadRecord.durable : undefined;
  return {
    object: 'WriteAck',
    domain: input.domain,
    ...(durable == null ? {} : { durable }),
    kind: input.kind,
    status: 'applied',
    target: input.target,
    source: input.source,
    payload: input.payload,
    readAfterWrite: input.readAfterWrite,
    boundaries: [
      'Mutation was routed through the canonical domain service and its validators.',
      'The host model owns the user-facing reasoning; Fluent stores durable state and provenance.',
      'Read-after-write proof is included so hosts can verify the state they will cite.',
    ],
  };
}

function notImplementedAck(
  domain: FluentVNextDomain,
  kind: FluentVNextWriteKind,
  payload: unknown,
  target: FluentVNextWriteAck['target'] = { id: null, type: null },
): FluentVNextWriteAck {
  return {
    object: 'WriteAck',
    domain,
    kind,
    status: 'not_implemented',
    target,
    source: 'fluent_vnext_write_layer',
    payload,
    readAfterWrite: null,
    boundaries: [
      'This vNext write primitive is intentionally narrower than the full legacy surface.',
      'Unsupported domain/item combinations are rejected as not implemented instead of flattening typed state.',
    ],
  };
}

function mergeItemId(item: unknown, itemId: string | null | undefined): unknown {
  if (!itemId || !item || typeof item !== 'object' || Array.isArray(item)) {
    return item;
  }
  return { ...(item as Record<string, unknown>), id: (item as Record<string, unknown>).id ?? itemId };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown, key: string): string | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? stringOrNull((value as Record<string, unknown>)[key]) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeArchiveLookup(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function arrayOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
