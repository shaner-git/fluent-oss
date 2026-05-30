import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MealsService } from '../src/domains/meals/service';
import { summarizeGroceryPlan } from '../src/domains/meals/summaries';
import { createLocalRuntime } from '../src/local/runtime';

const tempRoots: string[] = [];
const provenance = {
  actorEmail: 'tester@example.com',
  actorName: 'Test User',
  confidence: 1,
  scopes: ['meals:write'],
  sessionId: 'grocery-actions-node-test',
  sourceAgent: 'codex-test',
  sourceSkill: 'fluent-meals',
  sourceType: 'test',
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  try {
    await hidesPurchasedItemsFromDefaultView();
    await hidesInCartItemsFromDefaultView();
    await purchasedActionsRefreshFutureInventoryCoverage();
    await purchasedActionsPreserveKnownInventoryQuantity();
    await purchasedActionsUpdateLegacyInventoryRows();
    await preservesSubstitutionMetadataInResolvedItems();
    await substitutionFlowAddsIntentAndSummaryPreview();
    await planScopedSubstituteIntentsDoNotBleedIntoLaterWeeks();
    await planScopedIntentsDoNotReuseOlderOpenIntentIds();
    await substitutionsPersistRecipeMemorySignals();
    await pantryCheckItemsCanBeConfirmedOrPromotedToBuyList();
    await rejectsOrphanGroceryPlanActions();
    await sufficiencyConfirmationsStayOnActivePantryLines();
    await sufficiencyConfirmationsDoNotUpdateKitchenMemoryByDefault();
    await coverageLifecycleMetadataDoesNotRefreshInventoryWithoutExplicitRememberFlag();
    await coverageActionsRefreshInventoryEvidence();
    await rejectsInventoryActionsWhenGroceryPlanMissingWithoutGenerating();
    await exposesCurrentGroceryListLifecycleState();
    await currentGroceryListDefaultsToMostRecentPastListInsteadOfFuturePlaceholder();
    await regeneratesLegacyGroceryPlanRowsForUpdatedMealPlans();
    await rejectsSufficiencyConfirmationsForNonPantryItems();
    await rejectsInvalidGroceryPlanActionStatus();
  } finally {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  }
}

async function purchasedActionsPreserveKnownInventoryQuantity() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-08';
    await service.updateInventory({
      name: 'whole milk',
      status: 'present',
      quantity: 200,
      unit: 'ml',
      source: 'manual',
      provenance,
    });

    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-milk-receipt',
      recipeName: 'Milk Receipt Plan',
      ingredient: { item: 'whole milk', quantity: 500, unit: 'ml' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const milkLine = generated.raw.items.find((item) => item.normalizedName === 'whole milk');
    assert.ok(milkLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: milkLine!.itemKey,
      actionStatus: 'purchased',
      purchasedAt: '2026-05-08T12:00:00.000Z',
      provenance,
    });

    const refreshedMilk = (await service.getInventory()).find((item) => item.normalizedName === 'whole milk');
    assert.equal(refreshedMilk?.quantity, 200);
    assert.equal(refreshedMilk?.unit, 'ml');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function purchasedActionsUpdateLegacyInventoryRows() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-15';
    await runtime.sqliteDb
      .prepare(
        `INSERT INTO meal_inventory_items (
          id, tenant_id, name, normalized_name, status, source, purchased_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        'inventory:legacy-whole-milk',
        'primary',
        'whole milk',
        'whole milk',
        'present',
        'legacy-import',
        '2026-05-01T09:00:00.000Z',
        '2026-05-01T09:00:00.000Z',
        '2026-05-01T09:00:00.000Z',
      )
      .run();

    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-legacy-inventory',
      recipeName: 'Legacy Inventory Receipt Plan',
      ingredient: { item: 'whole milk', quantity: 500, unit: 'ml' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const milkLine = generated.raw.items.find((item) => item.normalizedName === 'whole milk');
    assert.ok(milkLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: milkLine!.itemKey,
      actionStatus: 'purchased',
      purchasedAt: '2026-05-15T12:00:00.000Z',
      provenance,
    });

    const inventory = await service.getInventory();
    const matchingItems = inventory.filter((item) => item.normalizedName === 'whole milk');
    assert.equal(matchingItems.length, 1);
    assert.equal(matchingItems[0]?.id, 'inventory:legacy-whole-milk');
    assert.equal(matchingItems[0]?.purchasedAt, '2026-05-15T12:00:00.000Z');
    assert.equal(matchingItems[0]?.source, 'legacy-import');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function purchasedActionsRefreshFutureInventoryCoverage() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const purchasedWeek = '2026-05-01';
    const futureWeek = '2026-05-29';

    await createSingleRecipePlan(service, {
      weekStart: purchasedWeek,
      recipeId: 'grocery-actions-pepper-receipt',
      recipeName: 'Pepper Week One',
      ingredient: { item: 'black pepper', quantity: 1, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const firstPlan = await service.generateGroceryPlan({ weekStart: purchasedWeek, provenance });
    const pepperLine = firstPlan.raw.items.find((item) => item.normalizedName === 'black pepper');
    assert.ok(pepperLine);

    await service.upsertGroceryPlanAction({
      weekStart: purchasedWeek,
      itemKey: pepperLine!.itemKey,
      actionStatus: 'purchased',
      purchasedAt: '2026-05-01T12:00:00.000Z',
      notes: 'Bought on the grocery receipt.',
      provenance,
    });

    const refreshedPepper = (await service.getInventory()).find((item) => item.normalizedName === 'black pepper');
    assert.equal(refreshedPepper?.purchasedAt, '2026-05-01T12:00:00.000Z');
    assert.equal(refreshedPepper?.quantity ?? null, null);

    await createSingleRecipePlan(service, {
      weekStart: futureWeek,
      recipeId: 'grocery-actions-pepper-future',
      recipeName: 'Pepper Week Four',
      ingredient: { item: 'black pepper', quantity: 1, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const futurePlan = await service.generateGroceryPlan({ weekStart: futureWeek, provenance });
    assert.equal(futurePlan.raw.items.some((item) => item.normalizedName === 'black pepper'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function hidesPurchasedItemsFromDefaultView() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-04-27';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-milk',
      recipeName: 'Milk Plan',
      ingredient: { item: 'whole milk', quantity: 500, unit: 'ml' },
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const milkLine = generated.raw.items.find((item) => item.normalizedName === 'whole milk');
    assert.ok(milkLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: milkLine!.itemKey,
      actionStatus: 'purchased',
      provenance,
    });

    const actionablePlan = await service.getGroceryPlan(weekStart);
    assert.ok(actionablePlan);
    assert.equal(actionablePlan!.raw.items.some((item) => item.itemKey === milkLine!.itemKey), false);
    const resolvedItem = actionablePlan!.raw.resolvedItems.find((item) => item.itemKey === milkLine!.itemKey);
    assert.equal(resolvedItem?.actionStatus, 'purchased');
    assert.equal(actionablePlan!.raw.actionsAppliedCount, 1);

    await service.deleteGroceryPlanAction({
      weekStart,
      itemKey: milkLine!.itemKey,
      provenance,
    });

    const restoredPlan = await service.getGroceryPlan(weekStart);
    assert.ok(restoredPlan);
    assert.equal(restoredPlan!.raw.items.some((item) => item.itemKey === milkLine!.itemKey), true);
    assert.equal(restoredPlan!.raw.actionsAppliedCount, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function hidesInCartItemsFromDefaultView() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-04-28';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-cart-milk',
      recipeName: 'Cart Milk Plan',
      ingredient: { item: 'whole milk', quantity: 500, unit: 'ml' },
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const milkLine = generated.raw.items.find((item) => item.normalizedName === 'whole milk');
    assert.ok(milkLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: milkLine!.itemKey,
      actionStatus: 'in_cart',
      notes: 'Added to Voila cart.',
      provenance,
    });

    const actionablePlan = await service.getGroceryPlan(weekStart);
    assert.ok(actionablePlan);
    assert.equal(actionablePlan!.raw.items.some((item) => item.itemKey === milkLine!.itemKey), false);
    const resolvedItem = actionablePlan!.raw.resolvedItems.find((item) => item.itemKey === milkLine!.itemKey);
    assert.equal(resolvedItem?.actionStatus, 'in_cart');
    assert.equal(resolvedItem?.note, 'Added to Voila cart.');
    assert.equal(actionablePlan!.raw.actionsAppliedCount, 1);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function preservesSubstitutionMetadataInResolvedItems() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-04';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-beef',
      recipeName: 'Beef Plan',
      ingredient: { item: 'ground beef', quantity: 500, unit: 'g' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const beefLine = generated.raw.items.find((item) => item.normalizedName === 'ground beef');
    assert.ok(beefLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: beefLine!.itemKey,
      actionStatus: 'substituted',
      substituteDisplayName: 'ground turkey',
      provenance,
    });

    const actionablePlan = await service.getGroceryPlan(weekStart);
    assert.ok(actionablePlan);
    assert.equal(actionablePlan!.raw.items.some((item) => item.itemKey === beefLine!.itemKey), false);
    const resolvedItem = actionablePlan!.raw.resolvedItems.find((item) => item.itemKey === beefLine!.itemKey);
    assert.equal(resolvedItem?.actionStatus, 'substituted');
    assert.equal(resolvedItem?.substitute?.displayName, 'ground turkey');
    assert.equal(actionablePlan!.raw.actionsAppliedCount, 1);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function substitutionFlowAddsIntentAndSummaryPreview() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-11';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-beef-intent',
      recipeName: 'Beef Intent Plan',
      ingredient: { item: 'ground beef', quantity: 500, unit: 'g' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const beefLine = generated.raw.items.find((item) => item.normalizedName === 'ground beef');
    assert.ok(beefLine);

    const result = await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: beefLine!.itemKey,
      actionStatus: 'substituted',
      substituteDisplayName: 'ground turkey',
      createSubstituteIntent: true,
      provenance,
    });

    assert.equal(result.substituteIntent?.displayName, 'ground turkey');
    assert.equal(result.substituteIntent?.quantity, 500);
    assert.equal(result.substituteIntent?.unit, 'g');
    assert.ok(result.groceryPlan);
    assert.equal(result.groceryPlan!.raw.items.some((item) => item.normalizedName === 'ground beef'), false);
    const turkeyLine = result.groceryPlan!.raw.items.find((item) => item.normalizedName === 'ground turkey');
    assert.equal(turkeyLine?.inventoryStatus, 'intent');
    assert.equal(turkeyLine?.quantity, 500);
    assert.equal(turkeyLine?.unit, 'g');

    const summary = summarizeGroceryPlan(result.groceryPlan!);
    assert.equal(summary?.resolvedPreview[0]?.name, 'ground beef');
    assert.equal(summary?.resolvedPreview[0]?.actionStatus, 'substituted');
    assert.equal(summary?.resolvedPreview[0]?.substituteDisplayName, 'ground turkey');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function planScopedSubstituteIntentsDoNotBleedIntoLaterWeeks() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const originalWeek = '2026-05-12';
    const laterWeek = '2026-05-19';

    await createSingleRecipePlan(service, {
      weekStart: originalWeek,
      recipeId: 'grocery-actions-origin-beef',
      recipeName: 'Origin Beef Plan',
      ingredient: { item: 'ground beef', quantity: 500, unit: 'g' },
      mealType: 'dinner',
    });

    const originalPlan = await service.generateGroceryPlan({ weekStart: originalWeek, provenance });
    const beefLine = originalPlan.raw.items.find((item) => item.normalizedName === 'ground beef');
    assert.ok(beefLine);

    const substituted = await service.upsertGroceryPlanAction({
      weekStart: originalWeek,
      itemKey: beefLine!.itemKey,
      actionStatus: 'substituted',
      substituteDisplayName: 'ground turkey',
      createSubstituteIntent: true,
      provenance,
    });

    assert.equal(substituted.substituteIntent?.mealPlanId, substituted.groceryPlan?.mealPlanId ?? null);

    await createSingleRecipePlan(service, {
      weekStart: laterWeek,
      recipeId: 'grocery-actions-later-pasta',
      recipeName: 'Later Pasta Plan',
      ingredient: { item: 'spaghetti', quantity: 500, unit: 'g' },
      mealType: 'dinner',
    });

    const laterPlan = await service.generateGroceryPlan({ weekStart: laterWeek, provenance });
    assert.equal(laterPlan.raw.items.some((item) => item.normalizedName === 'ground turkey'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function planScopedIntentsDoNotReuseOlderOpenIntentIds() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const firstWeek = '2026-05-26';
    const secondWeek = '2026-06-02';

    await createSingleRecipePlan(service, {
      weekStart: firstWeek,
      recipeId: 'grocery-actions-first-week-beef',
      recipeName: 'First Week Beef Plan',
      ingredient: { item: 'ground beef', quantity: 500, unit: 'g' },
      mealType: 'dinner',
    });
    const firstPlan = await service.generateGroceryPlan({ weekStart: firstWeek, provenance });
    const firstBeefLine = firstPlan.raw.items.find((item) => item.normalizedName === 'ground beef');
    assert.ok(firstBeefLine);

    const firstResult = await service.upsertGroceryPlanAction({
      weekStart: firstWeek,
      itemKey: firstBeefLine!.itemKey,
      actionStatus: 'substituted',
      substituteDisplayName: 'ground turkey',
      createSubstituteIntent: true,
      provenance,
    });

    await createSingleRecipePlan(service, {
      weekStart: secondWeek,
      recipeId: 'grocery-actions-second-week-beef',
      recipeName: 'Second Week Beef Plan',
      ingredient: { item: 'ground beef', quantity: 500, unit: 'g' },
      mealType: 'dinner',
    });
    const secondPlan = await service.generateGroceryPlan({ weekStart: secondWeek, provenance });
    const secondBeefLine = secondPlan.raw.items.find((item) => item.normalizedName === 'ground beef');
    assert.ok(secondBeefLine);

    const secondResult = await service.upsertGroceryPlanAction({
      weekStart: secondWeek,
      itemKey: secondBeefLine!.itemKey,
      actionStatus: 'substituted',
      substituteDisplayName: 'ground turkey',
      createSubstituteIntent: true,
      provenance,
    });

    assert.notEqual(firstResult.substituteIntent?.id, secondResult.substituteIntent?.id);
    assert.notEqual(firstResult.substituteIntent?.mealPlanId, null);
    assert.notEqual(secondResult.substituteIntent?.mealPlanId, null);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function substitutionsPersistRecipeMemorySignals() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-09';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-homemade-chickpeas',
      recipeName: 'Homemade Roasted Chickpeas',
      ingredient: { item: 'canned chickpeas', quantity: 2, unit: 'count' },
      mealType: 'snack',
    });

    const groceryPlan = await service.generateGroceryPlan({ weekStart, provenance });
    const chickpeaLine = groceryPlan.raw.items.find((item) => item.normalizedName === 'canned chickpeas');
    assert.ok(chickpeaLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: chickpeaLine!.itemKey,
      actionStatus: 'substituted',
      substituteDisplayName: 'Three Farmers Roasted Chickpeas',
      provenance,
    });

    const memory = await service.getMealMemory('grocery-actions-homemade-chickpeas');
    const plannerSignals = (memory[0]?.lastFeedback as { planner_signals?: Record<string, unknown> } | null)
      ?.planner_signals;
    const substitutionSignal = plannerSignals?.shopping_substitution_friction as
      | { originalItemName?: string; substituteDisplayName?: string; weekStart?: string; count?: number }
      | undefined;

    assert.equal(memory[0]?.status, 'observed');
    assert.equal(substitutionSignal?.originalItemName, 'canned chickpeas');
    assert.equal(substitutionSignal?.substituteDisplayName, 'Three Farmers Roasted Chickpeas');
    assert.equal(substitutionSignal?.weekStart, weekStart);
    assert.equal(substitutionSignal?.count, 1);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function regeneratesLegacyGroceryPlanRowsForUpdatedMealPlans() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-29';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-stale-original',
      recipeName: 'Stale Original Plan',
      ingredient: { item: 'carrot sticks', quantity: 1, unit: 'bag' },
      mealType: 'lunch',
    });

    const original = await service.generateGroceryPlan({ weekStart, provenance });
    assert.ok(original.raw.items.some((item) => item.normalizedName === 'carrot sticks'));

    await runtime.sqliteDb
      .prepare(`UPDATE meal_grocery_plans SET id = ? WHERE week_start = ?`)
      .bind('legacy:grocery-plan:2026-06-29', weekStart)
      .run();

    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-fresh-updated',
      recipeName: 'Fresh Updated Plan',
      ingredient: { item: 'chicken breast', quantity: 2, unit: 'count' },
      mealType: 'dinner',
    });

    const regenerated = await service.generateGroceryPlan({ weekStart, provenance });
    assert.equal(regenerated.id, `grocery-plan:primary:${weekStart}`);
    assert.ok(regenerated.raw.items.some((item) => item.normalizedName === 'chicken breast'));
    assert.equal(regenerated.raw.items.some((item) => item.normalizedName === 'carrot sticks'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function createSingleRecipePlan(
  service: MealsService,
  input: {
    weekStart: string;
    recipeId: string;
    recipeName: string;
    ingredient: { item: string; quantity: number; unit: string; ordering_policy?: string };
    mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  },
) {
  await service.createRecipe({
    recipe: {
      id: input.recipeId,
      name: input.recipeName,
      meal_type: input.mealType ?? 'breakfast',
      servings: 1,
      total_time: 5,
      active_time: 5,
      macros: {
        calories: 300,
        fiber_g: 4,
        protein_g: 18,
        sodium_mg: 180,
      },
      cost_per_serving_cad: 3.5,
      ingredients: [{ ...input.ingredient, ordering_policy: input.ingredient.ordering_policy ?? 'flexible_match' }],
      instructions: [{ step_number: 1, detail: 'Cook the recipe.' }],
    },
    provenance,
  });

  await service.upsertPlan({
    plan: {
      week_start: input.weekStart,
      week_end: input.weekStart,
      status: 'approved',
      meals: [
        {
          id: `plan:${input.weekStart}:1`,
          date: input.weekStart,
          day: 'Monday',
          meal_type: input.mealType ?? 'breakfast',
          recipe_id: input.recipeId,
          recipe_name: input.recipeName,
          selection_status: 'proven',
          serves: 1,
          prep_minutes: 5,
          total_minutes: 5,
          leftovers_expected: false,
          instructions: ['Cook the recipe.'],
        },
      ],
    },
    provenance,
  });
}

async function pantryCheckItemsCanBeConfirmedOrPromotedToBuyList() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-18';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-pantry',
      recipeName: 'Pantry Beans Plan',
      ingredient: { item: 'black beans', quantity: 2, unit: 'count', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const beansLine = generated.raw.items.find((item) => item.normalizedName === 'black beans');
    assert.ok(beansLine);
    assert.equal(beansLine?.inventoryStatus, 'check_pantry');

    const summary = summarizeGroceryPlan(generated);
    assert.equal(summary?.itemCount, 0);
    assert.equal(summary?.pantryCheckCount, 1);

    const confirmed = await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: beansLine!.itemKey,
      actionStatus: 'confirmed',
      provenance,
    });
    const confirmedPlan = await service.getGroceryPlan(weekStart);
    assert.ok(confirmed.action);
    assert.ok(confirmedPlan);
    assert.equal(confirmedPlan!.raw.items.some((item) => item.itemKey === beansLine!.itemKey), false);
    assert.equal(
      confirmedPlan!.raw.resolvedItems.find((item) => item.itemKey === beansLine!.itemKey)?.actionStatus,
      'confirmed',
    );

    await service.deleteGroceryPlanAction({
      weekStart,
      itemKey: beansLine!.itemKey,
      provenance,
    });

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: beansLine!.itemKey,
      actionStatus: 'needs_purchase',
      provenance,
    });
    const needsPurchasePlan = await service.getGroceryPlan(weekStart);
    const promotedLine = needsPurchasePlan?.raw.items.find((item) => item.itemKey === beansLine!.itemKey);
    assert.equal(promotedLine?.inventoryStatus, 'missing');
    assert.equal(promotedLine?.actionStatus, 'needs_purchase');

    await service.updateInventory({
      name: 'black beans',
      status: 'present',
      quantity: 2,
      unit: 'count',
      source: 'manual',
      provenance,
    });

    const stockedPlan = await service.generateGroceryPlan({ weekStart, provenance });
    assert.equal(stockedPlan.raw.items.some((item) => item.normalizedName === 'black beans'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function sufficiencyConfirmationsStayOnActivePantryLines() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-25';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-sufficiency',
      recipeName: 'Pantry Sufficiency Plan',
      ingredient: { item: 'tamari', quantity: 60, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const tamariLine = generated.raw.items.find((item) => item.normalizedName === 'tamari');
    assert.ok(tamariLine);
    assert.equal(tamariLine?.inventoryStatus, 'check_pantry');

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: tamariLine!.itemKey,
      actionStatus: 'have_enough',
      notes: 'Enough for the full week.',
      provenance,
    });

    const actionablePlan = await service.getGroceryPlan(weekStart);
    const persistedLine = actionablePlan?.raw.items.find((item) => item.itemKey === tamariLine!.itemKey);
    assert.ok(persistedLine);
    assert.equal(persistedLine?.actionStatus, 'have_enough');
    assert.equal(actionablePlan?.raw.resolvedItems.some((item) => item.itemKey === tamariLine!.itemKey), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsOrphanGroceryPlanActions() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-24';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-orphan-write',
      recipeName: 'Orphan Write Plan',
      ingredient: { item: 'limes', quantity: 4, unit: 'count' },
      mealType: 'dinner',
    });
    await service.generateGroceryPlan({ weekStart, provenance });

    for (const actionStatus of ['needs_purchase', 'confirmed', 'skipped'] as const) {
      await assert.rejects(
        service.upsertGroceryPlanAction({
          weekStart,
          itemKey: 'ghost-lime::count',
          actionStatus,
          provenance,
        }),
        /Could not find grocery-plan item ghost-lime::count/i,
      );
    }

    await assert.rejects(
      service.upsertGroceryPlanAction({
        weekStart,
        itemKey: 'ghost-lime::count',
        actionStatus: 'substituted',
        substituteDisplayName: 'lemons',
        provenance,
      }),
      /Could not find grocery-plan item ghost-lime::count/i,
    );

    assert.equal((await service.listGroceryPlanActions(weekStart)).length, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function coverageActionsRefreshInventoryEvidence() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-27';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-covered-pepper',
      recipeName: 'Covered Pepper Plan',
      ingredient: { item: 'crushed red pepper', quantity: 8, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const pepperLine = generated.raw.items.find((item) => item.normalizedName === 'crushed red pepper');
    assert.ok(pepperLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: pepperLine!.itemKey,
      actionStatus: 'have_enough',
      metadata: {
        fluentLifecycle: {
          action: 'already_have_enough',
          memoryEffect: 'kitchen_memory',
          objectRole: 'living_grocery_list',
          rememberInventory: true,
        },
      },
      provenance,
    });

    const pantryPepper = (await service.getInventory()).find((item) => item.normalizedName === 'crushed red pepper');
    assert.equal(pantryPepper?.status, 'present');
    assert.equal(pantryPepper?.source, 'grocery_plan_action');
    assert.ok(typeof pantryPepper?.confirmedAt === 'string' && pantryPepper.confirmedAt.length > 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function coverageLifecycleMetadataDoesNotRefreshInventoryWithoutExplicitRememberFlag() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-27';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-memory-effect-only',
      recipeName: 'Memory Effect Only Plan',
      ingredient: { item: 'smoked paprika', quantity: 5, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const paprikaLine = generated.raw.items.find((item) => item.normalizedName === 'smoked paprika');
    assert.ok(paprikaLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: paprikaLine!.itemKey,
      actionStatus: 'have_enough',
      metadata: {
        fluentLifecycle: {
          action: 'already_have_enough',
          memoryEffect: 'kitchen_memory',
          objectRole: 'living_grocery_list',
        },
      },
      provenance,
    });

    const pantryPaprika = (await service.getInventory()).find((item) => item.normalizedName === 'smoked paprika');
    assert.equal(pantryPaprika, undefined);
    const prepared = await service.prepareOrder({ weekStart });
    assert.equal(prepared.alreadyCoveredByInventory.some((item) => item.displayName === 'smoked paprika'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function sufficiencyConfirmationsDoNotUpdateKitchenMemoryByDefault() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-28';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-list-only-pepper',
      recipeName: 'List Only Pepper Plan',
      ingredient: { item: 'white pepper', quantity: 4, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const pepperLine = generated.raw.items.find((item) => item.normalizedName === 'white pepper');
    assert.ok(pepperLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: pepperLine!.itemKey,
      actionStatus: 'have_enough',
      provenance,
    });

    const pantryPepper = (await service.getInventory()).find((item) => item.normalizedName === 'white pepper');
    assert.equal(pantryPepper, undefined);
    const prepared = await service.prepareOrder({ weekStart });
    assert.equal(prepared.alreadyCoveredByInventory.some((item) => item.displayName === 'white pepper'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsInventoryActionsWhenGroceryPlanMissingWithoutGenerating() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-29';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-no-implicit-generation',
      recipeName: 'No Implicit Grocery Generation',
      ingredient: { item: 'red onion', quantity: 1, unit: 'count' },
      mealType: 'dinner',
    });

    assert.equal(await service.getGroceryPlan(weekStart), null);
    await assert.rejects(
      service.upsertGroceryPlanAction({
        weekStart,
        itemKey: 'red onion::count',
        actionStatus: 'purchased',
        provenance,
      }),
      /Could not find grocery-plan item/i,
    );
    assert.equal(await service.getGroceryPlan(weekStart), null);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function exposesCurrentGroceryListLifecycleState() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-18';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-current-list-state',
      recipeName: 'Current List State Plan',
      ingredient: { item: 'green onion', quantity: 2, unit: 'count' },
      mealType: 'dinner',
    });

    await service.generateGroceryPlan({ weekStart, provenance });
    await service.upsertGroceryIntent({
      displayName: 'dish soap',
      status: 'pending',
      targetWindow: weekStart,
      provenance,
    });

    const currentList = await service.getCurrentGroceryList({ weekStart, today: '2026-05-09' });
    assert.equal(currentList.objectRole, 'living_grocery_list');
    assert.equal(currentList.listId, 'current-grocery-list:primary');
    assert.equal(currentList.weekRelation, 'future');
    assert.equal(currentList.stale, true);
    assert.ok(currentList.staleReasons.some((reason) => reason.includes('future meal-plan needs')));
    assert.equal(currentList.trustLabel, 'List may be out of date');
    assert.equal(currentList.counts.manualIntentCount, 1);
    assert.ok(currentList.sourceProvenance.some((source) => source.kind === 'accepted_meal_plan'));
    assert.ok(currentList.sourceProvenance.some((source) => source.kind === 'grocery_plan'));
    assert.ok(currentList.sourceProvenance.some((source) => source.kind === 'manual_item'));
    assert.ok(currentList.version.length > 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function currentGroceryListDefaultsToMostRecentPastListInsteadOfFuturePlaceholder() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const pastWeekStart = '2026-04-27';
    const futureWeekStart = '2026-05-11';
    await createSingleRecipePlan(service, {
      weekStart: pastWeekStart,
      recipeId: 'grocery-actions-current-list-past',
      recipeName: 'Past Full Grocery List',
      ingredient: { item: 'salmon fillets', quantity: 640, unit: 'g' },
      mealType: 'dinner',
    });
    await createSingleRecipePlan(service, {
      weekStart: futureWeekStart,
      recipeId: 'grocery-actions-current-list-future',
      recipeName: 'Future Placeholder Grocery List',
      ingredient: { item: 'plain greek yogurt', quantity: 490, unit: 'g' },
      mealType: 'breakfast',
    });

    await service.generateGroceryPlan({ weekStart: pastWeekStart, provenance });
    await service.generateGroceryPlan({ weekStart: futureWeekStart, provenance });

    const currentList = await service.getCurrentGroceryList({ today: '2026-05-09' });
    assert.equal(currentList.weekStart, pastWeekStart);
    assert.equal(currentList.weekRelation, 'past');
    assert.equal(currentList.stale, true);
    assert.equal(
      currentList.selectionReason,
      `No current-week grocery list exists, so Fluent is showing the most recent list from ${pastWeekStart}.`,
    );
    assert.ok(currentList.staleReasons.some((reason) => reason.includes('most recent list')));
    assert.ok(currentList.sourceProvenance.some((source) => source.weekStart === pastWeekStart));
    assert.equal(currentList.groceryPlan?.raw.items.some((item) => item.name === 'salmon fillets'), true);
    assert.equal(currentList.groceryPlan?.raw.items.some((item) => item.name === 'plain greek yogurt'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsSufficiencyConfirmationsForNonPantryItems() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-26';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'grocery-actions-non-pantry-sufficiency',
      recipeName: 'Non Pantry Sufficiency Plan',
      ingredient: { item: 'flour tortillas', quantity: 8, unit: 'count', ordering_policy: 'flexible_match' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const tortillaLine = generated.raw.items.find((item) => item.normalizedName === 'flour tortillas');
    assert.ok(tortillaLine);

    await assert.rejects(
      service.upsertGroceryPlanAction({
        weekStart,
        itemKey: tortillaLine!.itemKey,
        actionStatus: 'have_enough',
        provenance,
      }),
      /at-home sufficiency confirmation is not supported/i,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsInvalidGroceryPlanActionStatus() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    await assert.rejects(
      service.upsertGroceryPlanAction({
        weekStart: '2026-06-30',
        itemKey: 'avocado::g',
        actionStatus: 'not_a_real_status' as never,
        provenance,
      }),
      /Unsupported grocery-plan action status/i,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-grocery-actions-'));
  tempRoots.push(root);
  return createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
}
