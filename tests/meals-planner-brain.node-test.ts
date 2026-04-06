import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalRuntime } from '../src/local/runtime';
import {
  MealsService,
  summarizeDomainEvents,
  summarizeGroceryPlan,
  summarizeMealPlan,
  summarizeMealPreferences,
} from '../src/domains/meals/service';

const tempRoots: string[] = [];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  try {
    await verifiesHostedPlannerBrainFlows();
    await reschedulesFutureMealWhenCookedEarly();
    await doesNotBindFutureMealWhenLoggingFeedbackEarly();
    await rejectsPlanningWithoutRequiredCalendarContext();
    await rejectsInvalidCalendarContextPayloads();
    await appliesCalendarAwareSlotConstraints();
    await surfacesOptionalCalendarWarnings();
    await scalesRepeatedWeekdayMealPrepToDailyServes();
    await appliesTrainingAwarePlanningBiases();
    await acceptsCandidateAfterUnrelatedHistoryChanges();
    await rejectsStalePlanCandidateAcceptance();
    await rejectsStalePlanCandidateAcceptanceWhenCalendarContextChanges();
    await acceptsStringifiedPreferencesPayload();
    await acceptsStringifiedRecipePayload();
    await acceptsStringifiedPlanPayload();
  } finally {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  }
}

async function reschedulesFutureMealWhenCookedEarly() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-early-cook-reschedule-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-reschedule-thursday-dinner',
        name: 'Planner Brain Thursday Dinner',
        meal_type: 'dinner',
        servings: 2,
        total_time: 35,
        active_time: 20,
        macros: {
          calories: 650,
          fiber_g: 5,
          protein_g: 36,
          sodium_mg: 490,
        },
        cost_per_serving_cad: 7.2,
        ingredients: [{ item: 'chicken thighs', quantity: 4, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the Thursday dinner.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-reschedule-friday-dinner',
        name: 'Planner Brain Friday Dinner',
        meal_type: 'dinner',
        servings: 2,
        total_time: 30,
        active_time: 15,
        macros: {
          calories: 610,
          fiber_g: 6,
          protein_g: 34,
          sodium_mg: 460,
        },
        cost_per_serving_cad: 6.8,
        ingredients: [{ item: 'ground turkey', quantity: 500, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the Friday dinner.' }],
      },
      provenance,
    });

    const weekStart = '2026-04-06';
    await service.upsertPlan({
      plan: {
        id: `meal-plan:${weekStart}:early-cook`,
        weekStart,
        weekEnd: '2026-04-12',
        status: 'approved',
        generatedAt: '2026-04-01T12:00:00.000Z',
        approvedAt: '2026-04-01T12:00:00.000Z',
        summary: { budget_estimate_cad: 28 },
        entries: [
          {
            id: `meal-plan-entry:${weekStart}:thursday`,
            date: '2026-04-09',
            dayLabel: 'thursday',
            mealType: 'dinner',
            recipeId: 'planner-brain-reschedule-thursday-dinner',
            recipeNameSnapshot: 'Planner Brain Thursday Dinner',
            prepMinutes: 20,
            totalMinutes: 35,
            leftoversExpected: false,
            instructionsSnapshot: [],
            notes: null,
            status: 'planned',
          },
          {
            id: `meal-plan-entry:${weekStart}:friday`,
            date: '2026-04-10',
            dayLabel: 'friday',
            mealType: 'dinner',
            recipeId: 'planner-brain-reschedule-friday-dinner',
            recipeNameSnapshot: 'Planner Brain Friday Dinner',
            prepMinutes: 15,
            totalMinutes: 30,
            leftoversExpected: false,
            instructionsSnapshot: [],
            notes: null,
            status: 'planned',
          },
        ],
      },
      provenance,
    });

    const cookedEntry = await service.markMealCooked({
      recipeId: 'planner-brain-reschedule-friday-dinner',
      date: '2026-04-09',
      provenance,
    });

    assert.equal(cookedEntry?.recipeId, 'planner-brain-reschedule-friday-dinner');
    assert.equal(cookedEntry?.date, '2026-04-09');
    assert.equal(cookedEntry?.dayLabel, 'thursday');
    assert.equal(cookedEntry?.status, 'cooked');
    assert.ok(cookedEntry?.cookedAt);

    const thursdayContext = await service.getTodayContext('2026-04-09');
    const fridayContext = await service.getTodayContext('2026-04-10');
    const storedPlan = await service.getPlan(weekStart);

    assert.equal(thursdayContext.entries.length, 1);
    assert.equal(thursdayContext.entries[0]?.recipeId, 'planner-brain-reschedule-friday-dinner');
    assert.equal(thursdayContext.entries[0]?.status, 'cooked');
    assert.equal(fridayContext.entries.length, 1);
    assert.equal(fridayContext.entries[0]?.recipeId, 'planner-brain-reschedule-thursday-dinner');
    assert.equal(fridayContext.entries[0]?.status, 'planned');

    const shiftedThursdayEntry = storedPlan?.entries.find((entry) => entry.recipeId === 'planner-brain-reschedule-thursday-dinner');
    const shiftedFridayEntry = storedPlan?.entries.find((entry) => entry.recipeId === 'planner-brain-reschedule-friday-dinner');

    assert.equal(shiftedThursdayEntry?.date, '2026-04-10');
    assert.equal(shiftedThursdayEntry?.dayLabel, 'friday');
    assert.equal(shiftedFridayEntry?.date, '2026-04-09');
    assert.equal(shiftedFridayEntry?.status, 'cooked');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function doesNotBindFutureMealWhenLoggingFeedbackEarly() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-early-feedback-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-feedback-friday-dinner',
        name: 'Planner Brain Feedback Friday Dinner',
        meal_type: 'dinner',
        servings: 2,
        total_time: 25,
        active_time: 15,
        macros: {
          calories: 590,
          fiber_g: 5,
          protein_g: 31,
          sodium_mg: 430,
        },
        cost_per_serving_cad: 6.4,
        ingredients: [{ item: 'salmon fillet', quantity: 2, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the Friday dinner.' }],
      },
      provenance,
    });

    const weekStart = '2026-04-06';
    await service.upsertPlan({
      plan: {
        id: `meal-plan:${weekStart}:feedback-early`,
        weekStart,
        weekEnd: '2026-04-12',
        status: 'approved',
        generatedAt: '2026-04-01T12:00:00.000Z',
        approvedAt: '2026-04-01T12:00:00.000Z',
        summary: { budget_estimate_cad: 18 },
        entries: [
          {
            id: `meal-plan-entry:${weekStart}:feedback-friday`,
            date: '2026-04-10',
            dayLabel: 'friday',
            mealType: 'dinner',
            recipeId: 'planner-brain-feedback-friday-dinner',
            recipeNameSnapshot: 'Planner Brain Feedback Friday Dinner',
            prepMinutes: 15,
            totalMinutes: 25,
            leftoversExpected: false,
            instructionsSnapshot: [],
            notes: null,
            status: 'planned',
          },
        ],
      },
      provenance,
    });

    const feedback = await service.logFeedback({
      date: '2026-04-09',
      recipeId: 'planner-brain-feedback-friday-dinner',
      taste: 'good',
      provenance,
    });

    assert.equal(feedback.recipeId, 'planner-brain-feedback-friday-dinner');
    assert.equal(feedback.date, '2026-04-09');
    assert.equal(feedback.mealPlanId, null);
    assert.equal(feedback.mealPlanEntryId, null);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function verifiesHostedPlannerBrainFlows() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-node-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    runtime.sqliteDb.sqlite
      .prepare(
        `INSERT INTO meal_brand_preferences (
          id, item_family, brand, preference_strength, evidence_source, evidence_count, last_seen_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'brand-pref:whole-milk',
        'whole milk',
        'Lactantia',
        'high',
        'planner-brain-test',
        3,
        '2026-03-28T00:00:00.000Z',
        JSON.stringify({
          item_key: 'whole_milk',
          preferred_brands: ['Lactantia'],
        }),
      );

    const createdRecipe = await service.createRecipe({
      recipe: {
        id: 'planner-brain-creamy-oats',
        name: 'Planner Brain Creamy Oats',
        meal_type: 'breakfast',
        servings: 2,
        total_time: 10,
        active_time: 5,
        macros: {
          calories: 420,
          fiber_g: 6,
          protein_g: 18,
          sodium_mg: 220,
        },
        cost_per_serving_cad: 3.75,
        ingredients: [
          { item: 'whole milk', quantity: 550, unit: 'ml', ordering_policy: 'flexible_match' },
          { item: 'salt', quantity: 1, unit: 'tsp', ordering_policy: 'pantry_item' },
        ],
        instructions: [{ step_number: 1, detail: 'Stir oats with milk and a pinch of salt.' }],
      },
      provenance,
    });

    assert.equal(createdRecipe.id, 'planner-brain-creamy-oats');

    const updatedPreferences = await service.updatePreferences({
      preferences: {
        version: '1.3-imported',
        profile_owner: 'Shane Rodness',
        core_rules: {
          hard_avoids: ['anchovy'],
        },
        family_constraints: {
          pork_never_for_family: true,
        },
        shopping: {
          budget: {
            price_cap_per_meal_cad: 11,
          },
        },
        inventory: {
          track_quantity: true,
          track_presence: true,
          track_perishability: true,
          long_life_defaults: ['salt'],
        },
      },
      provenance,
      sourceSnapshot: {
        imported_from: 'node-test',
      },
    });

    assert.equal(updatedPreferences.version, '1.3-imported');
    assert.equal(updatedPreferences.raw.profile_owner, 'Shane Rodness');

    const weekStart = '2026-04-06';
    const generation = await service.generatePlan({
      weekStart,
      overrides: {
        breakfastCount: 1,
        dinnerCount: 0,
        lunchCount: 0,
        snackCount: 0,
        includeRecipeIds: [createdRecipe.id],
        maxTrialMeals: 1,
      },
      provenance,
    });

    assert.equal(generation.weekStart, weekStart);
    assert.equal(generation.candidates.length, 1);
    assert.equal(generation.candidates[0]?.recipeIds.includes(createdRecipe.id), true);

    const acceptedPlan = await service.acceptPlanCandidate({
      generationId: generation.id,
      candidateId: generation.candidates[0]!.candidateId,
      inputHash: generation.inputHash,
      provenance,
    });

    assert.equal(acceptedPlan.weekStart, weekStart);
    assert.equal(acceptedPlan.entries.length, 1);

    await service.updateInventory({
      name: 'whole milk',
      status: 'present',
      quantity: 250,
      unit: 'ml',
      brand: 'Lactantia',
      source: 'manual',
      provenance,
    });

    await service.upsertGroceryIntent({
      displayName: 'bananas',
      quantity: 6,
      unit: 'count',
      status: 'pending',
      provenance,
    });

    const groceryPlan = await service.generateGroceryPlan({
      weekStart,
      provenance,
    });

    const storedPlan = await service.getPlan(weekStart);
    const history = await service.listPlanHistory(10);
    const storedPreferences = await service.getPreferences();
    const storedGroceryPlan = await service.getGroceryPlan(weekStart);
    const domainEvents = await service.listDomainEvents({ domain: 'meals', limit: 20 });
    const recipeEvents = await service.listDomainEvents({
      entityType: 'meal_recipe',
      eventType: 'recipe.created',
      limit: 10,
    });

    assert.equal(storedPlan?.id, acceptedPlan.id);
    assert.equal(storedPlan?.entries[0]?.recipeId, createdRecipe.id);
    assert.ok(history.some((entry) => entry.weekStart === weekStart && entry.entryCount === 1));
    assert.equal(storedPreferences.raw.shopping?.budget?.price_cap_per_meal_cad, 11);
    assert.equal(storedGroceryPlan?.weekStart, weekStart);
    assert.equal(groceryPlan.raw.weekStart, weekStart);
    assert.equal(summarizeMealPlan(storedPlan)?.entryCount, 1);
    assert.equal(summarizeMealPreferences(storedPreferences).budgetCadPerMeal, 11);
    assert.equal(summarizeGroceryPlan(groceryPlan)?.itemCount, 2);
    assert.equal(summarizeGroceryPlan(groceryPlan)?.pantryCheckCount, 1);
    assert.ok(summarizeDomainEvents(domainEvents).some((event) => event.patchKeys.includes('version')));

    const milkLine = groceryPlan.raw.items.find((item) => item.normalizedName === 'whole milk');
    assert.ok(milkLine);
    assert.equal(milkLine?.inventoryStatus, 'partial');
    assert.equal(milkLine?.quantity, 300);
    assert.equal(milkLine?.unit, 'ml');
    assert.ok(milkLine?.preferredBrands.includes('Lactantia'));

    const bananaLine = groceryPlan.raw.items.find((item) => item.normalizedName === 'bananas');
    assert.ok(bananaLine);
    assert.equal(bananaLine?.inventoryStatus, 'intent');
    assert.equal(bananaLine?.quantity, 6);

    const saltLine = groceryPlan.raw.items.find((item) => item.normalizedName === 'salt');
    assert.ok(saltLine);
    assert.equal(saltLine?.inventoryStatus, 'check_pantry');
    assert.ok(domainEvents.some((event) => event.eventType === 'preferences.updated'));
    assert.ok(domainEvents.some((event) => event.eventType === 'plan_generation.created'));
    assert.ok(domainEvents.some((event) => event.eventType === 'plan_candidate.accepted'));
    assert.ok(domainEvents.some((event) => event.eventType === 'plan.created' || event.eventType === 'plan.updated'));
    assert.ok(domainEvents.some((event) => event.eventType === 'grocery_plan.generated'));
    assert.ok(recipeEvents.some((event) => event.entityId === createdRecipe.id));
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsPlanningWithoutRequiredCalendarContext() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-required-calendar-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.updatePreferences({
      preferences: {
        ...(await service.getPreferences()).raw,
        calendar_check_required_before_planning: true,
      },
      provenance,
    });

    await assert.rejects(
      service.generatePlan({
        weekStart: '2026-05-04',
        overrides: {
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          snackCount: 0,
        },
        provenance,
      }),
      /Calendar check is required/i,
    );

    await assert.rejects(
      service.generatePlan({
        weekStart: '2026-05-04',
        calendarContext: {
          availability: 'unchecked',
          weekStart: '2026-05-04',
        },
        overrides: {
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          snackCount: 0,
        },
        provenance,
      }),
      /Calendar check is required/i,
    );

    await assert.rejects(
      service.generatePlan({
        weekStart: '2026-05-04',
        calendarContext: {
          availability: 'unavailable',
          weekStart: '2026-05-04',
        },
        overrides: {
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          snackCount: 0,
        },
        provenance,
      }),
      /Calendar check is required/i,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsInvalidCalendarContextPayloads() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-invalid-calendar-context-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await assert.rejects(
      service.generatePlan({
        weekStart: '2026-05-11',
        calendarContext: {
          availability: 'available',
          weekStart: '2026-05-12',
        },
        overrides: {
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          snackCount: 0,
        },
        provenance,
      }),
      /weekStart must match/i,
    );

    await assert.rejects(
      service.generatePlan({
        weekStart: '2026-05-11',
        calendarContext: {
          availability: 'available',
          days: [
            { date: '2026-05-11', blockedMeals: ['lunch'] },
            { date: '2026-05-11', blockedMeals: ['dinner'] },
          ],
          weekStart: '2026-05-11',
        },
        overrides: {
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          snackCount: 0,
        },
        provenance,
      }),
      /duplicate date/i,
    );

    await assert.rejects(
      service.generatePlan({
        weekStart: '2026-05-11',
        calendarContext: {
          availability: 'available',
          days: [{ date: '2026-05-18', blockedMeals: ['lunch'] }],
          weekStart: '2026-05-11',
        },
        overrides: {
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          snackCount: 0,
        },
        provenance,
      }),
      /within the requested planning week/i,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function appliesCalendarAwareSlotConstraints() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-calendar-slot-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-calendar-lunch',
        name: 'Planner Brain Calendar Lunch',
        meal_type: 'lunch',
        servings: 1,
        total_time: 20,
        active_time: 15,
        macros: {
          calories: 500,
          fiber_g: 5,
          protein_g: 28,
          sodium_mg: 380,
        },
        cost_per_serving_cad: 4.2,
        ingredients: [{ item: 'rice', quantity: 120, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook lunch.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-calendar-dinner',
        name: 'Planner Brain Calendar Dinner',
        meal_type: 'dinner',
        servings: 2,
        total_time: 35,
        active_time: 20,
        macros: {
          calories: 720,
          fiber_g: 7,
          protein_g: 42,
          sodium_mg: 540,
        },
        cost_per_serving_cad: 7.5,
        ingredients: [{ item: 'salmon', quantity: 2, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook dinner.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-calendar-dinner-2',
        name: 'Planner Brain Calendar Dinner Two',
        meal_type: 'dinner',
        servings: 2,
        total_time: 30,
        active_time: 20,
        macros: {
          calories: 680,
          fiber_g: 6,
          protein_g: 39,
          sodium_mg: 500,
        },
        cost_per_serving_cad: 6.9,
        ingredients: [{ item: 'chicken thighs', quantity: 4, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook second dinner.' }],
      },
      provenance,
    });

    const weekStart = '2026-05-18';
    const calendarContext = {
      availability: 'available' as const,
      days: [
        { date: '2026-05-21', blockedMeals: ['lunch' as const] },
        { date: '2026-05-18', householdAdultsHome: 1, householdChildrenHome: 0 },
        { date: '2026-05-20', householdAdultsHome: 1, householdChildrenHome: 0 },
        { date: '2026-05-22', blockedMeals: ['dinner' as const], householdAdultsHome: 1, householdChildrenHome: 0 },
      ],
      generatedAt: '2026-03-29T10:00:00.000Z',
      source: 'test-calendar',
      weekStart,
    };
    const generation = await service.generatePlan({
      weekStart,
      calendarContext,
      overrides: {
        breakfastCount: 0,
        lunchCount: 5,
        dinnerCount: 3,
        familyDinnerCount: 2,
        snackCount: 0,
        includeRecipeIds: [
          'planner-brain-calendar-lunch',
          'planner-brain-calendar-dinner',
          'planner-brain-calendar-dinner-2',
        ],
        maxTrialMeals: 0,
      },
      provenance,
    });

    assert.ok(generation.candidates[0]?.warnings.includes('calendar_constraints_reduced_slots'));

    const acceptedPlan = await service.acceptPlanCandidate({
      generationId: generation.id,
      candidateId: generation.candidates[0]!.candidateId,
      inputHash: generation.inputHash,
      calendarContext,
      provenance,
    });

    const lunchEntries = acceptedPlan.entries.filter((entry) => entry.mealType === 'lunch');
    const dinnerEntries = acceptedPlan.entries.filter((entry) => entry.mealType === 'dinner');
    assert.equal(lunchEntries.length, 4);
    assert.equal(dinnerEntries.length, 2);
    assert.equal(lunchEntries.some((entry) => entry.date === '2026-05-21'), false);
    assert.deepEqual(
      dinnerEntries.map((entry) => entry.date),
      ['2026-05-18', '2026-05-20'],
    );
    assert.ok(
      dinnerEntries.every((entry) => (entry.notes as { metadata?: { family_dinner?: boolean } } | null)?.metadata?.family_dinner === false),
    );
    assert.deepEqual(
      (acceptedPlan.sourceSnapshot as { derived_constraints?: { familyEligibleDinnerDates?: string[] } }).derived_constraints
        ?.familyEligibleDinnerDates ?? [],
      [],
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function surfacesOptionalCalendarWarnings() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-calendar-warning-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    const uncheckedGeneration = await service.generatePlan({
      weekStart: '2026-05-25',
      overrides: {
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 0,
        snackCount: 0,
      },
      provenance,
    });
    assert.ok(uncheckedGeneration.candidates[0]?.warnings.includes('calendar_unchecked'));

    const unavailableGeneration = await service.generatePlan({
      weekStart: '2026-05-25',
      calendarContext: {
        availability: 'unavailable',
        weekStart: '2026-05-25',
      },
      overrides: {
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 0,
        snackCount: 0,
      },
      provenance,
    });
    assert.ok(unavailableGeneration.candidates[0]?.warnings.includes('calendar_unavailable'));
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsStalePlanCandidateAcceptance() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-stale-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    const generation = await service.generatePlan({
      weekStart: '2026-04-13',
      overrides: {
        breakfastCount: 1,
        dinnerCount: 0,
        lunchCount: 0,
        snackCount: 0,
      },
      provenance,
    });

    await service.updatePreferences({
      preferences: {
        ...(await service.getPreferences()).raw,
        notes: ['stale-input-change'],
      },
      provenance,
    });

    await assert.rejects(
      service.acceptPlanCandidate({
        generationId: generation.id,
        candidateId: generation.candidates[0]!.candidateId,
        inputHash: generation.inputHash,
        provenance,
      }),
      /stale/i,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsStalePlanCandidateAcceptanceWhenCalendarContextChanges() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-stale-calendar-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    const calendarContext = {
      availability: 'available' as const,
      days: [{ date: '2026-04-14', blockedMeals: ['lunch' as const] }],
      generatedAt: '2026-03-29T11:00:00.000Z',
      source: 'test-calendar',
      weekStart: '2026-04-13',
    };
    const generation = await service.generatePlan({
      weekStart: '2026-04-13',
      calendarContext,
      overrides: {
        breakfastCount: 0,
        dinnerCount: 0,
        lunchCount: 0,
        snackCount: 0,
      },
      provenance,
    });

    await assert.rejects(
      service.acceptPlanCandidate({
        generationId: generation.id,
        candidateId: generation.candidates[0]!.candidateId,
        inputHash: generation.inputHash,
        calendarContext: {
          ...calendarContext,
          days: [{ date: '2026-04-15', blockedMeals: ['lunch' as const] }],
        },
        provenance,
      }),
      /stale/i,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function scalesRepeatedWeekdayMealPrepToDailyServes() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-repeated-weekday-scale-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-weekday-lunch-batch',
        name: 'Planner Brain Weekday Lunch Batch',
        meal_type: 'lunch',
        servings: 5,
        total_time: 30,
        active_time: 20,
        macros: {
          calories: 550,
          fiber_g: 6,
          protein_g: 35,
          sodium_mg: 420,
        },
        cost_per_serving_cad: 4.5,
        ingredients: [{ item: 'chicken breast', quantity: 1000, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the batch lunch.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-weekday-snack-batch',
        name: 'Planner Brain Weekday Snack Batch',
        meal_type: 'snack',
        servings: 5,
        total_time: 10,
        active_time: 10,
        macros: {
          calories: 120,
          fiber_g: 4,
          protein_g: 2,
          sodium_mg: 80,
        },
        cost_per_serving_cad: 1.2,
        ingredients: [{ item: 'carrot sticks', quantity: 500, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Pack snack containers.' }],
      },
      provenance,
    });

    const weekStart = '2026-04-27';
    const generation = await service.generatePlan({
      weekStart,
      overrides: {
        breakfastCount: 0,
        lunchCount: 4,
        dinnerCount: 0,
        snackCount: 5,
        includeRecipeIds: ['planner-brain-weekday-lunch-batch', 'planner-brain-weekday-snack-batch'],
        maxTrialMeals: 0,
      },
      provenance,
    });

    const acceptedPlan = await service.acceptPlanCandidate({
      generationId: generation.id,
      candidateId: generation.candidates[0]!.candidateId,
      inputHash: generation.inputHash,
      provenance,
    });

    const lunchEntries = acceptedPlan.entries.filter((entry) => entry.mealType === 'lunch');
    const snackEntries = acceptedPlan.entries.filter((entry) => entry.mealType === 'snack');
    assert.equal(lunchEntries.length, 4);
    assert.equal(snackEntries.length, 5);
    assert.ok(lunchEntries.every((entry) => entry.serves === 1));
    assert.ok(snackEntries.every((entry) => entry.serves === 1));

    const groceryPlan = await service.generateGroceryPlan({
      weekStart,
      provenance,
    });

    const lunchLine = groceryPlan.raw.items.find((item) => item.normalizedName === 'chicken breast');
    const snackLine = groceryPlan.raw.items.find((item) => item.normalizedName === 'carrot sticks');
    assert.ok(lunchLine);
    assert.ok(snackLine);
    assert.equal(lunchLine?.quantity, 800);
    assert.equal(lunchLine?.unit, 'g');
    assert.equal(snackLine?.quantity, 500);
    assert.equal(snackLine?.unit, 'g');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function appliesTrainingAwarePlanningBiases() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-training-aware-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-training-lunch-protein',
        name: 'Planner Brain Training Lunch Protein Bowl',
        meal_type: 'lunch',
        servings: 1,
        total_time: 15,
        active_time: 10,
        macros: {
          calories: 520,
          fiber_g: 7,
          protein_g: 38,
          sodium_mg: 420,
        },
        tags: ['high protein', 'weekday'],
        cost_per_serving_cad: 5.2,
        ingredients: [{ item: 'chicken breast', quantity: 180, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Assemble the protein lunch bowl.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-training-snack-recovery',
        name: 'Planner Brain Training Greek Yogurt Cup',
        meal_type: 'snack',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 210,
          fiber_g: 3,
          protein_g: 20,
          sodium_mg: 120,
        },
        tags: ['high protein', 'quick'],
        cost_per_serving_cad: 2.8,
        ingredients: [{ item: 'greek yogurt', quantity: 170, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Pack the yogurt cup.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-training-dinner-project',
        name: 'Planner Brain Training Project Lasagna',
        meal_type: 'dinner',
        servings: 2,
        total_time: 75,
        active_time: 45,
        macros: {
          calories: 740,
          fiber_g: 8,
          protein_g: 34,
          sodium_mg: 780,
        },
        tags: ['project'],
        cost_per_serving_cad: 6.5,
        ingredients: [{ item: 'lasagna noodles', quantity: 1, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Bake the project dinner.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-training-dinner-fast',
        name: 'Planner Brain Training Fast Chicken Skillet',
        meal_type: 'dinner',
        servings: 2,
        total_time: 25,
        active_time: 15,
        macros: {
          calories: 610,
          fiber_g: 5,
          protein_g: 43,
          sodium_mg: 510,
        },
        tags: ['quick', 'high protein', 'weekday'],
        cost_per_serving_cad: 14.5,
        ingredients: [{ item: 'chicken thighs', quantity: 4, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the quick chicken skillet.' }],
      },
      provenance,
    });

    const baselineGeneration = await service.generatePlan({
      weekStart: '2026-06-01',
      overrides: {
        breakfastCount: 0,
        lunchCount: 2,
        dinnerCount: 1,
        snackCount: 2,
        includeRecipeIds: [
          'planner-brain-training-lunch-protein',
          'planner-brain-training-snack-recovery',
          'planner-brain-training-dinner-project',
          'planner-brain-training-dinner-fast',
        ],
        maxTrialMeals: 0,
      },
      provenance,
    });

    const baselineDinner = baselineGeneration.candidates[0]?.entries.find((entry) => entry.mealType === 'dinner');
    assert.equal(baselineDinner?.recipeId, 'planner-brain-training-dinner-project');
    assert.equal((baselineGeneration.candidates[0]?.summary as any)?.trainingAlignmentSummary?.trainingContextUsed, false);

    const trainingGeneration = await service.generatePlan({
      weekStart: '2026-06-08',
      overrides: {
        breakfastCount: 0,
        lunchCount: 2,
        dinnerCount: 1,
        snackCount: 2,
        includeRecipeIds: [
          'planner-brain-training-lunch-protein',
          'planner-brain-training-snack-recovery',
          'planner-brain-training-dinner-project',
          'planner-brain-training-dinner-fast',
        ],
        maxTrialMeals: 0,
      },
      trainingContext: {
        goalType: 'fat_loss',
        trainingDays: ['2026-06-08'],
        daysPerWeek: 3,
        sessionLoadByDay: {
          '2026-06-08': 'hard',
        },
        nutritionSupportMode: 'higher_protein',
        weekComplexity: 'high',
      },
      provenance,
    });

    const trainingSummary = (trainingGeneration.candidates[0]?.summary as any)?.trainingAlignmentSummary;
    const trainingDinner = trainingGeneration.candidates[0]?.entries.find((entry) => entry.mealType === 'dinner');
    assert.equal(trainingDinner?.recipeId, 'planner-brain-training-dinner-fast');
    assert.equal(trainingSummary?.trainingContextUsed, true);
    assert.equal(trainingSummary?.nutritionSupportMode, 'higher_protein');
    assert.equal(trainingSummary?.sessionLoadByDay?.['2026-06-08'], 'hard');
    assert.ok(trainingSummary?.planningBiasesApplied.includes('hard_day_simpler_dinners'));
    assert.ok(trainingSummary?.planningBiasesApplied.includes('higher_protein_week'));

    const acceptedPlan = await service.acceptPlanCandidate({
      generationId: trainingGeneration.id,
      candidateId: trainingGeneration.candidates[0]!.candidateId,
      inputHash: trainingGeneration.inputHash,
      trainingContext: {
        goalType: 'fat_loss',
        trainingDays: ['2026-06-08'],
        daysPerWeek: 3,
        sessionLoadByDay: {
          '2026-06-08': 'hard',
        },
        nutritionSupportMode: 'higher_protein',
        weekComplexity: 'high',
      },
      provenance,
    });

    assert.equal(acceptedPlan.trainingAlignmentSummary.trainingContextUsed, true);
    assert.equal(acceptedPlan.trainingAlignmentSummary.nutritionSupportMode, 'higher_protein');
    assert.equal(acceptedPlan.trainingAlignmentSummary.sessionLoadByDay['2026-06-08'], 'hard');
    assert.ok(acceptedPlan.trainingAlignmentSummary.planningBiasesApplied.includes('hard_day_simpler_dinners'));

    const todayContext = await service.getTodayContext('2026-06-08');
    assert.equal(todayContext.trainingAlignmentSummary.trainingContextUsed, true);
    assert.equal(todayContext.trainingAlignmentSummary.weekComplexity, 'high');

    const storedPlan = await service.getPlan('2026-06-08');
    assert.equal(storedPlan?.trainingAlignmentSummary.trainingContextUsed, true);
    assert.ok(summarizeMealPlan(storedPlan)?.trainingAlignmentSummary.planningBiasesApplied.includes('higher_protein_week'));
  } finally {
    runtime.sqliteDb.close();
  }
}

async function acceptsCandidateAfterUnrelatedHistoryChanges() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-history-stability-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-history-stability-breakfast',
        name: 'Planner Brain History Stability Breakfast',
        meal_type: 'breakfast',
        servings: 1,
        total_time: 10,
        active_time: 5,
        macros: {
          calories: 350,
          fiber_g: 4,
          protein_g: 22,
          sodium_mg: 210,
        },
        cost_per_serving_cad: 3.9,
        ingredients: [{ item: 'eggs', quantity: 2, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the eggs.' }],
      },
      provenance,
    });

    const targetWeek = '2026-06-15';
    const generation = await service.generatePlan({
      weekStart: targetWeek,
      overrides: {
        breakfastCount: 1,
        lunchCount: 0,
        dinnerCount: 0,
        snackCount: 0,
        includeRecipeIds: ['planner-brain-history-stability-breakfast'],
        maxTrialMeals: 0,
      },
      provenance,
    });

    await service.upsertPlan({
      plan: {
        id: 'meal-plan:history-stability-other-week',
        weekStart: '2026-06-08',
        weekEnd: '2026-06-14',
        status: 'approved',
        generatedAt: '2026-06-01T12:00:00.000Z',
        approvedAt: '2026-06-01T12:00:00.000Z',
        summary: { budget_estimate_cad: 12 },
        entries: [
          {
            id: 'meal-plan-entry:history-stability-other-week:1',
            date: '2026-06-08',
            dayLabel: 'Monday',
            mealType: 'breakfast',
            recipeId: 'planner-brain-history-stability-breakfast',
            recipeNameSnapshot: 'Planner Brain History Stability Breakfast',
            prepMinutes: 10,
            totalMinutes: 10,
            leftoversExpected: false,
            instructionsSnapshot: [],
            notes: null,
            status: 'planned',
          },
        ],
      },
      provenance,
    });

    const acceptedPlan = await service.acceptPlanCandidate({
      generationId: generation.id,
      candidateId: generation.candidates[0]!.candidateId,
      inputHash: generation.inputHash,
      provenance,
    });

    assert.equal(acceptedPlan.weekStart, targetWeek);
    assert.equal(acceptedPlan.entries.length, 1);
    assert.equal(acceptedPlan.entries[0]?.recipeId, 'planner-brain-history-stability-breakfast');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function acceptsStringifiedPreferencesPayload() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-stringified-preferences-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    const payload = JSON.stringify({
      version: '1.3-imported',
      profile_owner: 'Shane Rodness',
      core_rules: {
        hard_avoids: ['anchovy', 'mussels'],
        preferred_cuisines: ['mediterranean'],
      },
      family_constraints: {
        pork_never_for_family: true,
      },
      shopping: {
        budget: {
          price_cap_per_meal_cad: 12,
        },
        hosted_brand_preferences: ['berries', 'whole milk'],
      },
      hosted_brand_preferences: {
        yogurt: ['Siggi\'s'],
      },
      inventory: {
        long_life_defaults: ['salt', 'pepper'],
      },
    });

    const updated = await service.updatePreferences({
      preferences: payload as unknown as Record<string, unknown>,
      provenance,
    });

    assert.equal(updated.raw.profile_owner, 'Shane Rodness');
    assert.deepEqual(updated.raw.core_rules?.hard_avoids, ['anchovy', 'mussels']);
    assert.equal(updated.raw.shopping?.budget?.price_cap_per_meal_cad, 12);

    const summary = summarizeMealPreferences(await service.getPreferences());
    assert.equal(summary.calendarCheckRequiredBeforePlanning, false);
    assert.deepEqual(summary.hardAvoids, ['anchovy', 'mussels']);
    assert.deepEqual(summary.preferredCuisines, ['mediterranean']);
    assert.deepEqual(summary.dinnerRules, ['pork_never_for_family']);
    assert.equal(summary.budgetCadPerMeal, 12);
    assert.equal(summary.longLifeDefaultsCount, 2);
    assert.equal(summary.hostedBrandPreferenceFamiliesCount, 2);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function acceptsStringifiedRecipePayload() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-stringified-recipe-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    const created = await service.createRecipe({
      recipe: JSON.stringify({
        id: 'planner-brain-stringified-recipe',
        name: 'Planner Brain Stringified Recipe',
        meal_type: 'snack',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 220,
          fiber_g: 3,
          protein_g: 12,
          sodium_mg: 140,
        },
        cost_per_serving_cad: 2.5,
        ingredients: [{ item: 'banana', quantity: 1, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Eat the banana.' }],
      }) as unknown,
      provenance,
    });

    assert.equal(created.id, 'planner-brain-stringified-recipe');
    assert.equal(created.mealType, 'snack');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function acceptsStringifiedPlanPayload() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: 'shane@securebyte.ca',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-stringified-plan-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    const weekStart = '2026-04-20';
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-stringified-plan-recipe',
        name: 'Planner Brain Stringified Plan Recipe',
        meal_type: 'breakfast',
        servings: 1,
        total_time: 5,
        active_time: 5,
        macros: {
          calories: 250,
          fiber_g: 4,
          protein_g: 18,
          sodium_mg: 180,
        },
        cost_per_serving_cad: 3.1,
        ingredients: [{ item: 'oats', quantity: 50, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Assemble and eat.' }],
      },
      provenance,
    });

    const plan = await service.upsertPlan({
      plan: JSON.stringify({
        week_start: weekStart,
        week_end: '2026-04-26',
        status: 'approved',
        profile_owner: 'Shane Rodness',
        summary: { budget_estimate_cad: 9.5 },
        meals: [
          {
            id: `plan:${weekStart}:1`,
            date: '2026-04-20',
            day: 'Monday',
            meal_type: 'breakfast',
            recipe_id: 'planner-brain-stringified-plan-recipe',
            recipe_name: 'Planner Brain Stringified Plan Recipe',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 5,
            total_minutes: 5,
            leftovers_expected: false,
            instructions: ['Open container and eat.'],
          },
        ],
      }) as unknown,
      provenance,
    });

    assert.equal(plan.weekStart, weekStart);
    assert.equal(plan.entries.length, 1);
    assert.equal(plan.entries[0]?.recipeId, 'planner-brain-stringified-plan-recipe');
  } finally {
    runtime.sqliteDb.close();
  }
}

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-planner-brain-'));
  tempRoots.push(root);
  return createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
}
