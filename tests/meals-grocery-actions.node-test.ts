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
  actorName: 'Shane Rodness',
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
    await purchasedActionsRefreshFutureInventoryCoverage();
    await purchasedActionsPreserveKnownInventoryQuantity();
    await preservesSubstitutionMetadataInResolvedItems();
    await substitutionFlowAddsIntentAndSummaryPreview();
    await pantryCheckItemsCanBeConfirmedOrPromotedToBuyList();
    await sufficiencyConfirmationsStayOnActivePantryLines();
    await rejectsSufficiencyConfirmationsForNonPantryItems();
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
      /pantry sufficiency confirmation is not supported/i,
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
