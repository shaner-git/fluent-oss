import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MealsService } from '../src/domains/meals/service';
import { createLocalRuntime } from '../src/local/runtime';
import { buildConfirmedOrderSyncMetadata } from '../plugins/fluent/skills/fluent-meals/scripts/confirmed-order-sync.mjs';

const tempRoots: string[] = [];
const provenance = {
  actorEmail: 'tester@example.com',
  actorName: 'Shane Rodness',
  confidence: 1,
  scopes: ['meals:write'],
  sessionId: 'inventory-batch-node-test',
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
    await supportsMixedCreateAndUpdateBatchWrites();
    await persistsConfirmedOrderSyncFromBatchMetadata();
    await hardDeletesInventoryItems();
    await collapsesDuplicateBatchRowsWithMatchingUnits();
    await rejectsAmbiguousDuplicateUnitsWithoutWriting();
    await rejectsInvalidRowsWithoutWriting();
    await reflectsBatchInventoryUpdatesInGroceryRegeneration();
  } finally {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  }
}

async function hardDeletesInventoryItems() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    await service.updateInventory({
      name: 'jarlic',
      quantity: 1,
      unit: 'count',
      status: 'present',
      provenance,
    });

    const deleted = await service.deleteInventoryItem({
      name: 'jarlic',
      provenance,
    });

    assert.equal(deleted?.normalizedName, 'jarlic');
    const inventory = await service.getInventory();
    assert.equal(inventory.some((item) => item.normalizedName === 'jarlic'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function supportsMixedCreateAndUpdateBatchWrites() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    await service.updateInventory({
      name: 'banana',
      quantity: 1,
      unit: 'count',
      status: 'present',
      source: 'seed',
      provenance,
    });

    const result = await service.updateInventoryBatch({
      items: [
        { name: 'banana', quantity: 2, unit: 'count', status: 'present', source: 'batch' },
        { name: 'whole milk', quantity: 1, unit: 'L', status: 'present', source: 'batch' },
      ],
      provenance,
    });

    assert.equal(result.createdCount, 1);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.itemsProcessed, 2);
    assert.equal(result.records.length, 2);

    const inventory = await service.getInventory();
    assert.equal(inventory.some((item) => item.normalizedName === 'banana'), true);
    assert.equal(inventory.some((item) => item.normalizedName === 'whole milk'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function persistsConfirmedOrderSyncFromBatchMetadata() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const metadata = buildConfirmedOrderSyncMetadata({
      retailer: 'voila',
      retailerOrderId: 'batch-sync-1763107873281',
      status: 'sync_completed',
      syncSummary: {
        confirmedOrder: {
          confirmedAt: '2026-03-30T19:10:00.000Z',
          orderId: 'batch-sync-1763107873281',
          retailer: 'voila',
        },
        counts: {
          explicitSkippedCount: 0,
          matchedPurchasedCount: 0,
          missingPlannedCount: 0,
          orderedExtraCount: 1,
          unresolvedCount: 0,
        },
      },
      weekStart: '2026-03-30',
    });

    await service.updateInventoryBatch({
      items: [
        {
          metadata,
          name: 'Green Grapes 907 g',
          purchased_at: '2026-03-30T19:10:00.000Z',
          source: 'confirmed_order_sync',
          status: 'present',
        },
      ],
      provenance,
    });

    const sync = await service.getConfirmedOrderSync('voila', 'batch-sync-1763107873281');
    assert.ok(sync);
    assert.equal(sync?.status, 'sync_completed');
    assert.equal(sync?.orderedExtraCount, 1);
    assert.equal(sync?.weekStart, '2026-03-30');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function collapsesDuplicateBatchRowsWithMatchingUnits() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const result = await service.updateInventoryBatch({
      items: [
        { name: 'banana', quantity: 1, unit: 'count', status: 'present' },
        { name: 'Banana', quantity: 2, unit: 'count', status: 'present' },
      ],
      provenance,
    });

    assert.equal(result.itemsProcessed, 1);
    assert.equal(result.records[0]?.quantity, 3);
    assert.equal(result.records[0]?.unit, 'count');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsAmbiguousDuplicateUnitsWithoutWriting() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    await assert.rejects(
      service.updateInventoryBatch({
        items: [
          { name: 'banana', quantity: 1, unit: 'count', status: 'present' },
          { name: 'banana', quantity: 250, unit: 'g', status: 'present' },
        ],
        provenance,
      }),
      /Conflicting units/i,
    );

    const inventory = await service.getInventory();
    assert.equal(inventory.length, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsInvalidRowsWithoutWriting() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    await assert.rejects(
      service.updateInventoryBatch({
        items: [
          { name: 'whole milk', quantity: 1, unit: 'L', status: 'present' },
          { name: 'ground beef', quantity: -1, unit: 'g', status: 'present' },
        ],
        provenance,
      }),
      /must be positive/i,
    );

    const inventory = await service.getInventory();
    assert.equal(inventory.length, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function reflectsBatchInventoryUpdatesInGroceryRegeneration() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);

  try {
    const weekStart = '2026-05-11';
    await service.createRecipe({
      recipe: {
        id: 'inventory-batch-smoothie',
        name: 'Inventory Batch Smoothie',
        meal_type: 'breakfast',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 350,
          fiber_g: 5,
          protein_g: 14,
          sodium_mg: 120,
        },
        cost_per_serving_cad: 3.8,
        ingredients: [
          { item: 'whole milk', quantity: 500, unit: 'ml', ordering_policy: 'flexible_match' },
          { item: 'banana', quantity: 3, unit: 'count', ordering_policy: 'flexible_match' },
        ],
        instructions: [{ step_number: 1, detail: 'Blend everything.' }],
      },
      provenance,
    });

    await service.upsertPlan({
      plan: {
        week_start: weekStart,
        week_end: '2026-05-17',
        status: 'approved',
        meals: [
          {
            id: `plan:${weekStart}:1`,
            date: weekStart,
            day: 'Monday',
            meal_type: 'breakfast',
            recipe_id: 'inventory-batch-smoothie',
            recipe_name: 'Inventory Batch Smoothie',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 5,
            total_minutes: 5,
            leftovers_expected: false,
            instructions: ['Blend everything.'],
          },
        ],
      },
      provenance,
    });

    await service.updateInventoryBatch({
      items: [
        { name: 'whole milk', quantity: 0.5, unit: 'L', status: 'present' },
        { name: 'banana', quantity: 2, unit: 'count', status: 'present' },
      ],
      provenance,
    });

    const groceryPlan = await service.generateGroceryPlan({ weekStart, provenance });
    assert.equal(groceryPlan.raw.items.some((item) => item.normalizedName === 'whole milk'), false);

    const bananaLine = groceryPlan.raw.items.find((item) => item.normalizedName === 'banana');
    assert.ok(bananaLine);
    assert.equal(bananaLine?.inventoryStatus, 'partial');
    assert.equal(bananaLine?.quantity, 1);
    assert.equal(bananaLine?.unit, 'count');
  } finally {
    runtime.sqliteDb.close();
  }
}

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-inventory-batch-'));
  tempRoots.push(root);
  return createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
}
