import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MealsService } from '../src/domains/meals/service';
import { createLocalRuntime } from '../src/local/runtime';

const tempRoots: string[] = [];
const provenance = {
  actorEmail: 'tester@example.com',
  actorName: 'Shane Rodness',
  confidence: 1,
  scopes: ['meals:write'],
  sessionId: 'meals-order-preflight-test',
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
    await movesFreshlyBoughtItemsToAlreadyCovered();
    await carriesForwardRecentDurableCoverageAcrossWeeks();
    await composesCarryForwardWithPantrySufficiency();
    await excludesItemsAlreadyInRetailerCart();
    await treatsPersistedInCartActionsAsAlreadyInRetailerCart();
    await blocksOrderingForPantryChecks();
    await resolvesPantryChecksWithHaveEnough();
    await resolvesPantryChecksWithDontHaveIt();
    await resolvesPantryChecksWithHaveSomeNeedToBuy();
    await keepsNonPantryUnknownQuantityBlocked();
    await keepsExactPartialMathUnchanged();
    await explicitNeedsPurchaseOverridesDurableCarryForward();
    await carriesForwardSubstitutionDecisions();
  } finally {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  }
}

async function carriesForwardRecentDurableCoverageAcrossWeeks() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-02';
    await service.updateInventory({
      name: 'black pepper',
      status: 'present',
      longLifeDefault: true,
      purchasedAt: '2026-05-20T09:00:00.000Z',
      source: 'receipt',
      provenance,
    });

    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-durable-pepper',
      recipeName: 'Pepper Plan',
      ingredient: { item: 'black pepper', quantity: 1, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    await service.generateGroceryPlan({ weekStart, provenance });
    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(prepared.safeToOrder, true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'black pepper'), false);
    assert.equal(prepared.unresolvedItems.some((item) => item.displayName === 'black pepper'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function composesCarryForwardWithPantrySufficiency() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-16';
    await service.updateInventory({
      name: 'black pepper',
      status: 'present',
      longLifeDefault: true,
      purchasedAt: '2026-06-01T09:00:00.000Z',
      source: 'receipt',
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'order-preflight-composed',
        name: 'Pepper and Beans Plan',
        meal_type: 'dinner',
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
        ingredients: [
          { item: 'black pepper', quantity: 1, unit: 'g', ordering_policy: 'pantry_item' },
          { item: 'black beans', quantity: 2, unit: 'count', ordering_policy: 'pantry_item' },
        ],
        instructions: [{ step_number: 1, detail: 'Cook the recipe.' }],
      },
      provenance,
    });

    await service.upsertPlan({
      plan: {
        week_start: weekStart,
        week_end: weekStart,
        status: 'approved',
        meals: [
          {
            id: `plan:${weekStart}:1`,
            date: weekStart,
            day: 'Monday',
            meal_type: 'dinner',
            recipe_id: 'order-preflight-composed',
            recipe_name: 'Pepper and Beans Plan',
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

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const beansLine = generated.raw.items.find((item) => item.normalizedName === 'black beans');
    assert.ok(beansLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: beansLine!.itemKey,
      actionStatus: 'have_enough',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(prepared.safeToOrder, true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'black pepper'), false);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'black beans'), false);
    assert.equal(prepared.unresolvedItems.some((item) => item.displayName === 'black pepper'), false);
    assert.equal(prepared.alreadyCoveredByInventory.some((item) => item.displayName === 'black beans'), true);
    assert.equal(prepared.unresolvedItems.length, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function movesFreshlyBoughtItemsToAlreadyCovered() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-25';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-milk',
      recipeName: 'Milk Plan',
      ingredient: { item: 'whole milk', quantity: 500, unit: 'ml' },
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    assert.equal(generated.raw.items.some((item) => item.normalizedName === 'whole milk'), true);

    await service.updateInventory({
      name: 'whole milk',
      quantity: 500,
      unit: 'ml',
      status: 'present',
      source: 'manual',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(prepared.safeToOrder, true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'whole milk'), false);
    assert.equal(prepared.alreadyCoveredByInventory.some((item) => item.displayName === 'whole milk'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function excludesItemsAlreadyInRetailerCart() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-01';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-tortillas',
      recipeName: 'Taco Plan',
      ingredient: { item: 'tortillas', quantity: 1, unit: 'count' },
      mealType: 'dinner',
    });

    await service.generateGroceryPlan({ weekStart, provenance });
    const prepared = await service.prepareOrder({
      weekStart,
      retailer: 'voila',
      retailerCartItems: [{ title: 'Compliments Tortillas Original 10-Inch 610 g', quantity: 1 }],
    });

    assert.equal(prepared.safeToOrder, true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'tortillas'), false);
    assert.equal(prepared.alreadyInRetailerCart.some((item) => item.displayName === 'tortillas'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function treatsPersistedInCartActionsAsAlreadyInRetailerCart() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-03';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-in-cart-tortillas',
      recipeName: 'Cart Taco Plan',
      ingredient: { item: 'tortillas', quantity: 1, unit: 'count' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const tortillaLine = generated.raw.items.find((item) => item.normalizedName === 'tortillas');
    assert.ok(tortillaLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: tortillaLine!.itemKey,
      actionStatus: 'in_cart',
      notes: 'Already added to Voila cart.',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(prepared.safeToOrder, true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'tortillas'), false);
    assert.equal(prepared.alreadyInRetailerCart.some((item) => item.displayName === 'tortillas'), true);
    assert.equal(prepared.alreadyInRetailerCart.find((item) => item.displayName === 'tortillas')?.matchedCartTitle, 'tortillas');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function blocksOrderingForPantryChecks() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-08';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-beans',
      recipeName: 'Pantry Bean Plan',
      ingredient: { item: 'black beans', quantity: 2, unit: 'count', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    await service.generateGroceryPlan({ weekStart, provenance });
    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });

    assert.equal(prepared.safeToOrder, false);
    assert.equal(prepared.unresolvedItems.some((item) => item.displayName === 'black beans'), true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'black beans'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function resolvesPantryChecksWithHaveEnough() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-09';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-pantry-enough',
      recipeName: 'Pantry Enough Plan',
      ingredient: { item: 'black beans', quantity: 2, unit: 'count', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const beansLine = generated.raw.items.find((item) => item.normalizedName === 'black beans');
    assert.ok(beansLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: beansLine!.itemKey,
      actionStatus: 'have_enough',
      notes: 'Confirmed enough for the whole week.',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(prepared.safeToOrder, true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'black beans'), false);
    assert.equal(prepared.alreadyCoveredByInventory.some((item) => item.displayName === 'black beans'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function resolvesPantryChecksWithDontHaveIt() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-10';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-pantry-missing',
      recipeName: 'Pantry Missing Plan',
      ingredient: { item: 'dried basil', quantity: 5, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const basilLine = generated.raw.items.find((item) => item.normalizedName === 'dried basil');
    assert.ok(basilLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: basilLine!.itemKey,
      actionStatus: 'dont_have_it',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(prepared.safeToOrder, true);
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'dried basil'), true);
    assert.equal(prepared.unresolvedItems.some((item) => item.displayName === 'dried basil'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function resolvesPantryChecksWithHaveSomeNeedToBuy() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-11';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-pantry-some',
      recipeName: 'Pantry Some Plan',
      ingredient: { item: 'tamari', quantity: 60, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const tamariLine = generated.raw.items.find((item) => item.normalizedName === 'tamari');
    assert.ok(tamariLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: tamariLine!.itemKey,
      actionStatus: 'have_some_need_to_buy',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    const remaining = prepared.remainingToBuy.find((item) => item.displayName === 'tamari');
    assert.equal(prepared.safeToOrder, true);
    assert.ok(remaining);
    assert.equal(remaining?.quantity, 60);
    assert.equal(prepared.unresolvedItems.some((item) => item.displayName === 'tamari'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function keepsNonPantryUnknownQuantityBlocked() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-12';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-tortillas-unknown',
      recipeName: 'Tortilla Plan',
      ingredient: { item: 'flour tortillas', quantity: 8, unit: 'count', ordering_policy: 'flexible_match' },
      mealType: 'dinner',
    });

    await service.generateGroceryPlan({ weekStart, provenance });
    await service.updateInventory({
      name: 'flour tortillas',
      status: 'present',
      source: 'manual',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    const tortillas = prepared.unresolvedItems.find((item) => item.displayName === 'flour tortillas');
    assert.equal(prepared.safeToOrder, false);
    assert.ok(tortillas);
    assert.equal(tortillas?.sufficiencyConfirmationEligible, false);
    assert.equal(tortillas?.sufficiencyConfirmationOptions?.length ?? 0, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function keepsExactPartialMathUnchanged() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-13';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-partial-milk',
      recipeName: 'Partial Milk Plan',
      ingredient: { item: 'whole milk', quantity: 500, unit: 'ml' },
    });

    await service.generateGroceryPlan({ weekStart, provenance });
    await service.updateInventory({
      name: 'whole milk',
      quantity: 200,
      unit: 'ml',
      status: 'present',
      source: 'manual',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    const milk = prepared.remainingToBuy.find((item) => item.displayName === 'whole milk');
    assert.equal(prepared.safeToOrder, true);
    assert.equal(milk?.quantity, 300);
    assert.equal(prepared.unresolvedItems.some((item) => item.displayName === 'whole milk'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function explicitNeedsPurchaseOverridesDurableCarryForward() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-14';
    await service.updateInventory({
      name: 'black pepper',
      status: 'present',
      longLifeDefault: true,
      purchasedAt: '2026-06-01T09:00:00.000Z',
      source: 'receipt',
      provenance,
    });

    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-needs-pepper',
      recipeName: 'Pepper Override Plan',
      ingredient: { item: 'black pepper', quantity: 1, unit: 'g', ordering_policy: 'pantry_item' },
      mealType: 'dinner',
    });

    const generated = await service.generateGroceryPlan({ weekStart, provenance });
    const pepperLine = generated.raw.resolvedItems.find((item) => item.normalizedName === 'black pepper');
    assert.ok(pepperLine);

    await service.upsertGroceryPlanAction({
      weekStart,
      itemKey: pepperLine!.itemKey,
      actionStatus: 'needs_purchase',
      notes: 'User wants to restock this week.',
      provenance,
    });

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(prepared.remainingToBuy.some((item) => item.displayName === 'black pepper'), true);
    assert.equal(prepared.alreadyCoveredByInventory.some((item) => item.displayName === 'black pepper'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function carriesForwardSubstitutionDecisions() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-06-15';
    await createSingleRecipePlan(service, {
      weekStart,
      recipeId: 'order-preflight-substitute',
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

    const prepared = await service.prepareOrder({ weekStart, retailer: 'voila' });
    assert.equal(
      prepared.substitutionDecisions.some(
        (item) => item.requested === 'ground beef' && item.resolvedTo === 'ground turkey',
      ),
      true,
    );
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

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-order-preflight-'));
  tempRoots.push(root);
  return createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
}
