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
  sessionId: 'grocery-canonical-node-test',
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
    await collapsesCanonicalMatchesAcrossConvertibleUnits();
    await collapsesAvocadoCountAndWeightWithCuratedConversion();
    await supportsCuratedSubstitutionsAndComboPacks();
  } finally {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  }
}

async function collapsesCanonicalMatchesAcrossConvertibleUnits() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-04-13';
    await service.createRecipe({
      recipe: {
        id: 'grocery-canonical-milk-ml',
        name: 'Milk Oats ML',
        meal_type: 'breakfast',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 250,
          fiber_g: 3,
          protein_g: 12,
          sodium_mg: 120,
        },
        cost_per_serving_cad: 2.5,
        ingredients: [{ item: 'whole milk', quantity: 250, unit: 'ml', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Use milk.' }],
      },
      provenance,
    });
    await service.createRecipe({
      recipe: {
        id: 'grocery-canonical-milk-l',
        name: 'Milk Oats L',
        meal_type: 'breakfast',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 250,
          fiber_g: 3,
          protein_g: 12,
          sodium_mg: 120,
        },
        cost_per_serving_cad: 2.5,
        ingredients: [{ item: 'whole milk', quantity: 0.25, unit: 'L', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Use more milk.' }],
      },
      provenance,
    });

    await service.upsertPlan({
      plan: {
        week_start: weekStart,
        week_end: '2026-04-19',
        status: 'approved',
        meals: [
          {
            id: `plan:${weekStart}:1`,
            date: '2026-04-13',
            day: 'Monday',
            meal_type: 'breakfast',
            recipe_id: 'grocery-canonical-milk-ml',
            recipe_name: 'Milk Oats ML',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 5,
            total_minutes: 5,
            leftovers_expected: false,
            instructions: ['Use milk.'],
          },
          {
            id: `plan:${weekStart}:2`,
            date: '2026-04-14',
            day: 'Tuesday',
            meal_type: 'breakfast',
            recipe_id: 'grocery-canonical-milk-l',
            recipe_name: 'Milk Oats L',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 5,
            total_minutes: 5,
            leftovers_expected: false,
            instructions: ['Use more milk.'],
          },
        ],
      },
      provenance,
    });

    const groceryPlan = await service.generateGroceryPlan({ weekStart, provenance });
    const milkLines = groceryPlan.raw.items.filter((item) => item.normalizedName === 'whole milk');
    assert.equal(milkLines.length, 1);
    assert.equal(milkLines[0]?.quantity, 500);
    assert.equal(milkLines[0]?.unit, 'ml');
    assert.equal(milkLines[0]?.canonicalQuantity, 500);
    assert.equal(milkLines[0]?.canonicalUnit, 'ml');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function collapsesAvocadoCountAndWeightWithCuratedConversion() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-04-20';
    await service.createRecipe({
      recipe: {
        id: 'grocery-canonical-avocado-count',
        name: 'Avocado Count',
        meal_type: 'lunch',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 320,
          fiber_g: 8,
          protein_g: 4,
          sodium_mg: 20,
        },
        cost_per_serving_cad: 3.2,
        ingredients: [{ item: 'avocado', quantity: 1, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Slice avocado.' }],
      },
      provenance,
    });
    await service.createRecipe({
      recipe: {
        id: 'grocery-canonical-avocado-grams',
        name: 'Avocado Grams',
        meal_type: 'lunch',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 320,
          fiber_g: 8,
          protein_g: 4,
          sodium_mg: 20,
        },
        cost_per_serving_cad: 3.2,
        ingredients: [{ item: 'avocado', quantity: 200, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Mash avocado.' }],
      },
      provenance,
    });

    await service.upsertPlan({
      plan: {
        week_start: weekStart,
        week_end: '2026-04-26',
        status: 'approved',
        meals: [
          {
            id: `plan:${weekStart}:1`,
            date: '2026-04-20',
            day: 'Monday',
            meal_type: 'lunch',
            recipe_id: 'grocery-canonical-avocado-count',
            recipe_name: 'Avocado Count',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 5,
            total_minutes: 5,
            leftovers_expected: false,
            instructions: ['Slice avocado.'],
          },
          {
            id: `plan:${weekStart}:2`,
            date: '2026-04-21',
            day: 'Tuesday',
            meal_type: 'lunch',
            recipe_id: 'grocery-canonical-avocado-grams',
            recipe_name: 'Avocado Grams',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 5,
            total_minutes: 5,
            leftovers_expected: false,
            instructions: ['Mash avocado.'],
          },
        ],
      },
      provenance,
    });

    const groceryPlan = await service.generateGroceryPlan({ weekStart, provenance });
    const avocadoLines = groceryPlan.raw.items.filter((item) => item.normalizedName === 'avocado');
    assert.equal(avocadoLines.length, 1);
    assert.equal(avocadoLines[0]?.itemKey, 'avocado::g');
    assert.equal(avocadoLines[0]?.canonicalUnit, 'g');
    assert.equal(avocadoLines[0]?.quantity, 336);
    assert.equal(avocadoLines[0]?.unit, 'g');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function supportsCuratedSubstitutionsAndComboPacks() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-04-27';
    await service.createRecipe({
      recipe: {
        id: 'grocery-curated-substitution-dinner',
        name: 'Curated Substitution Dinner',
        meal_type: 'dinner',
        servings: 1,
        total_time: 20,
        active_time: 10,
        macros: {
          calories: 500,
          fiber_g: 6,
          protein_g: 30,
          sodium_mg: 300,
        },
        cost_per_serving_cad: 5.5,
        ingredients: [
          { item: 'ground beef', quantity: 500, unit: 'g', ordering_policy: 'flexible_match' },
          { item: 'orange', quantity: 1, unit: 'count', ordering_policy: 'flexible_match' },
          { item: 'carrot sticks', quantity: 1, unit: 'count', ordering_policy: 'flexible_match' },
          { item: 'celery sticks', quantity: 1, unit: 'count', ordering_policy: 'flexible_match' },
        ],
        instructions: [{ step_number: 1, detail: 'Cook everything.' }],
      },
      provenance,
    });

    await service.upsertPlan({
      plan: {
        week_start: weekStart,
        week_end: '2026-05-03',
        status: 'approved',
        meals: [
          {
            id: `plan:${weekStart}:1`,
            date: '2026-04-27',
            day: 'Monday',
            meal_type: 'dinner',
            recipe_id: 'grocery-curated-substitution-dinner',
            recipe_name: 'Curated Substitution Dinner',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 10,
            total_minutes: 20,
            leftovers_expected: false,
            instructions: ['Cook everything.'],
          },
        ],
      },
      provenance,
    });

    await service.updateInventoryBatch({
      items: [
        { name: 'extra lean ground turkey', quantity: 900, unit: 'g', source: 'test' },
        { name: 'clementines', quantity: 3, unit: 'count', source: 'test' },
        { name: 'carrot celery sticks', source: 'test' },
      ],
      provenance,
    });

    const groceryPlan = await service.generateGroceryPlan({ weekStart, provenance });
    assert.deepEqual(
      groceryPlan.raw.items.map((item) => ({
        inventoryStatus: item.inventoryStatus,
        normalizedName: item.normalizedName,
      })),
      [
        { inventoryStatus: 'present_without_quantity', normalizedName: 'carrot sticks' },
        { inventoryStatus: 'present_without_quantity', normalizedName: 'celery sticks' },
      ],
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-grocery-canonical-'));
  tempRoots.push(root);
  return createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
}
