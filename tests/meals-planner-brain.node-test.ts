import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FLUENT_MEALS_READ_SCOPE, FLUENT_MEALS_WRITE_SCOPE, runWithFluentAuthProps } from '../src/auth';
import { createLocalRuntime } from '../src/local/runtime';
import { FluentCoreService } from '../src/fluent-core';
import { FLUENT_OSS_DEFAULT_PROFILE_ID, FLUENT_OSS_DEFAULT_TENANT_ID } from '../src/fluent-identity';
import {
  MealsService,
  summarizeDomainEvents,
  summarizeGroceryPlan,
  summarizeMealPlan,
  summarizeMealPreferences,
} from '../src/domains/meals/service';
import { deriveMealsPlanningPreferenceProfile, shouldAvoidLeftovers } from '../src/domains/meals/preference-model';
import {
  overlayPersonFactsOntoCoreRules,
  TIER1_KIND_TO_CORE_RULES_FIELD,
} from '../src/domains/meals/person-facts-overlay';
import { applyMealsCalibrationResponse } from '../src/domains/meals/onboarding-calibration';
import { recordFluentVNextEvent } from '../src/vnext-write-layer';
import { registerMealsMcpSurface } from '../src/mcp-meals';
import type { PersonFact, PersonFactKind } from '../src/personal-context';

const tempRoots: string[] = [];
const TEST_ACTOR_EMAIL = 'planner@example.com';
const TEST_ACTOR_NAME = 'Test User';
const TIER1_MEALS_PERSON_FACT_KINDS = ['allergy', 'hard_avoid', 'dietary_pattern', 'anti_favorite', 'taste_pref'] as const;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  try {
    await verifiesHostedPlannerBrainFlows();
    await reschedulesFutureMealWhenCookedEarly();
    await doesNotBindFutureMealWhenLoggingFeedbackEarly();
    await updatesExistingRecipeMemoryWhenLoggingFeedback();
    await honorsPinnedMealAssignmentsDuringGeneration();
    await deprioritizesRecipesWithRecentShoppingSubstitutionFriction();
    await rejectsPlanningWithoutRequiredCalendarContext();
    await rejectsInvalidCalendarContextPayloads();
    await appliesCalendarAwareSlotConstraints();
    await surfacesOptionalCalendarWarnings();
    await includesTextFirstPlanningBriefAndReview();
    await classifiesHouseholdSizesForPlanning();
    await appliesConfirmedPreferenceSignalsToPlanning();
    await appliesStructuredOnboardingSignalsToPlanning();
    await appliesMealParticipationSignalsToServingTargets();
    await enforcesDietaryConstraintsDuringPlanning();
    await derivesPlannerTier1DietaryFromPersonFacts();
    await allowsRecipeWhenPersonFactIsRejected();
    await leavesPlannerBehaviorUnchangedWhenPersonFactsReaderIsNull();
    await preservesTier2PreferencesWhenOverlayingPersonFacts();
    await mirrorsTier1DietaryFromVNextCalibrationEvent();
    await mirrorsTier1DietaryFromLegacyCalibrationTool();
    await guardsTier1OverlayClearList();
    await noCoreRulesOnlyTier1DietaryWriterRemainsTripwirePending();
    await excludesAllergenicRecipeFromPersonFactsWithoutCoreRulesSeed();
    await dropsTier1DietaryPreferencePatchCoreRulesWrites();
    await leavesTier1DietaryRejectedSignalsToPersonFacts();
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

async function classifiesHouseholdSizesForPlanning() {
  const examples = [
    ['solo', 'just me, single serving, fresh each night', 'solo', 1],
    ['two', 'couple dinners for two adults', 'two', 2],
    ['three', 'family of 3 with school-night dinners', 'three', 3],
    ['multi', 'household serves 4 with batch-friendly weeknight dinners', 'multi', 4],
  ] as const;

  for (const [name, shape, segment, serveTarget] of examples) {
    const profile = deriveMealsPlanningPreferenceProfile({
      household: { shape },
      planning: { meal_routine: shape },
    });

    assert.equal(profile.householdSizeSegment, segment, name);
    assert.equal(profile.householdServeTarget, serveTarget, name);
  }

  const soloProfile = deriveMealsPlanningPreferenceProfile({
    household: { shape: 'solo' },
    planning: { meal_routine: 'fresh each night' },
  });
  assert.equal(shouldAvoidLeftovers(soloProfile), true);

  const ambiguousFamilyProfile = deriveMealsPlanningPreferenceProfile({
    household: { shape: 'family dinners with kids' },
    planning: { meal_routine: 'family dinners with kids' },
  });
  assert.equal(ambiguousFamilyProfile.householdSizeSegment, 'unknown');
  assert.equal(ambiguousFamilyProfile.householdServeTarget, null);
}

async function appliesConfirmedPreferenceSignalsToPlanning() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-preference-signal-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.recordCalibrationResponse({
      response: {
        preferencePatch: {
          budgetSensitivity: 'budget conscious',
          cleanupTolerance: 'low cleanup on weeknights',
          cookingCadence: '1 weeknight dinner',
          groceryExpectation: 'pantry-aware grocery lists',
          householdShape: 'family of 3',
          leftoverPreference: 'planned leftovers for lunch',
          mealRoutine: 'family of 3 with batch-friendly weeknight dinners',
          preferredCuisines: ['mediterranean'],
          weeknightTimeLimitMinutes: 30,
        },
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-preference-mediterranean-chicken',
        name: 'Mediterranean Chicken Bowls',
        meal_type: 'dinner',
        servings: 2,
        total_time: 30,
        active_time: 20,
        cost_per_serving_cad: 5.5,
        macros: {
          calories: 580,
          fiber_g: 6,
          protein_g: 38,
          sodium_mg: 520,
        },
        family_fit: true,
        batch_fit: true,
        cleanup_level: 'low',
        tags: ['mediterranean', 'weeknight', 'leftovers'],
        ingredients: [{ item: 'chicken', quantity: 500, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the bowls.' }],
      },
      provenance,
    });
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-preference-expensive-long-dinner',
        name: 'Expensive Long Steak Dinner',
        meal_type: 'dinner',
        servings: 3,
        total_time: 85,
        active_time: 55,
        cost_per_serving_cad: 18,
        macros: {
          calories: 820,
          fiber_g: 2,
          protein_g: 42,
          sodium_mg: 680,
        },
        cleanup_level: 'high',
        tags: ['special occasion'],
        ingredients: [{ item: 'steak', quantity: 3, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the steak dinner.' }],
      },
      provenance,
    });

    const generation = await service.generatePlan({
      weekStart: '2026-06-08',
      overrides: {
        breakfastCount: 0,
        lunchCount: 0,
        familyDinnerCount: 1,
        snackCount: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];

    assert.ok(candidate);
    assert.equal(candidate.entries.length, 1);
    assert.equal(candidate.entries[0]?.recipeId, 'planner-brain-preference-mediterranean-chicken');
    assert.equal(candidate.entries[0]?.serves, 3);
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.householdSizeSegment, 'three');
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.householdServeTarget, 3);
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.weeknightTimeLimitMinutes, 30);
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.preferredCuisineCount, 1);
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.targetWeeknightDinnerCount, 1);
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.likedFoodCount, 0);
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.budgetSensitive, true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function appliesStructuredOnboardingSignalsToPlanning() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-structured-onboarding-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.recordCalibrationResponse({
      response: {
        preferencePatch: {
          householdAdultCount: 2,
          householdChildCount: 2,
          householdChildrenEatSameMeals: true,
          householdDefaultServeTarget: 4,
          householdLeftoverTargetServings: 2,
          householdSizeSegment: 'multi',
          planningFamilyDinnerCount: 2,
          planningTargetBreakfastCount: 0,
          planningTargetDinnerCount: 2,
          planningTargetLunchCount: 1,
          planningTargetSnackCount: 0,
          shoppingPantryCheckPolicy: 'check pantry before buying duplicates',
          shoppingPreferredStores: ['No Frills'],
          shoppingSubstitutionTolerance: 'flexible store-brand substitutions',
          weeknightTimeLimitMinutes: 35,
        },
      },
      provenance,
    });

    for (const recipe of [
      {
        id: 'planner-brain-structured-family-chili',
        name: 'Family Bean Chili',
        meal_type: 'dinner',
        servings: 4,
        total_time: 35,
        active_time: 20,
        cost_per_serving_cad: 3.5,
        macros: {
          calories: 520,
          fiber_g: 12,
          protein_g: 20,
          sodium_mg: 640,
        },
        tags: ['family', 'weeknight'],
        ingredients: [{ item: 'beans', quantity: 2, unit: 'can', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the chili.' }],
      },
      {
        id: 'planner-brain-structured-chicken-rice',
        name: 'Chicken Rice Tray',
        meal_type: 'dinner',
        servings: 4,
        total_time: 30,
        active_time: 15,
        cost_per_serving_cad: 4.25,
        macros: {
          calories: 610,
          fiber_g: 4,
          protein_g: 42,
          sodium_mg: 580,
        },
        tags: ['family', 'quick'],
        ingredients: [{ item: 'chicken', quantity: 600, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Bake the tray.' }],
      },
      {
        id: 'planner-brain-structured-leftover-lunch',
        name: 'Lunch Grain Bowl',
        meal_type: 'lunch',
        servings: 2,
        total_time: 10,
        active_time: 10,
        cost_per_serving_cad: 2.75,
        macros: {
          calories: 430,
          fiber_g: 8,
          protein_g: 14,
          sodium_mg: 420,
        },
        tags: ['lunch'],
        ingredients: [{ item: 'farro', quantity: 1, unit: 'cup', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Assemble the bowl.' }],
      },
    ]) {
      await service.createRecipe({ recipe, provenance });
    }

    const generation = await service.generatePlan({
      weekStart: '2026-06-15',
      overrides: {
        maxTrialMeals: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];
    assert.ok(candidate);

    const dinnerEntries = candidate.entries.filter((entry) => entry.mealType === 'dinner');
    const lunchEntries = candidate.entries.filter((entry) => entry.mealType === 'lunch');
    assert.equal(candidate.entries.length, 3);
    assert.equal(dinnerEntries.length, 2);
    assert.equal(lunchEntries.length, 1);
    assert.equal(dinnerEntries.every((entry) => entry.serves === 4), true);
    assert.equal(candidate.planReview.strengths.some((entry) => entry.includes('Includes 2 family dinner slot(s).')), true);

    const signals = candidate.planningBrief.contextSignals.preferenceSignals;
    assert.equal(signals.householdSizeSegment, 'multi');
    assert.equal(signals.householdServeTarget, 4);
    assert.equal(signals.targetBreakfastCount, 0);
    assert.equal(signals.targetLunchCount, 1);
    assert.equal(signals.targetWeeknightDinnerCount, 2);
    assert.equal(signals.targetSnackCount, 0);
    assert.equal(signals.targetFamilyDinnerCount, 2);
    assert.equal(signals.pantryCheckPolicy, 'check pantry before buying duplicates');
    assert.equal(signals.shoppingSubstitutionTolerance, 'flexible store-brand substitutions');
    assert.equal(signals.preferredGroceryStoreCount, 1);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function appliesMealParticipationSignalsToServingTargets() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-meal-participation-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.recordCalibrationResponse({
      response: {
        preferencePatch: {
          householdAdultCount: 1,
          householdChildCount: 3,
          householdChildrenEatSameMeals: false,
          householdDefaultServeTarget: 4,
          householdMealParticipation: {
            breakfast: ['adults'],
            dinner: ['everyone'],
            lunch: ['children'],
          },
          householdSizeSegment: 'multi',
          planningFamilyDinnerCount: 1,
          planningTargetBreakfastCount: 2,
          planningTargetDinnerCount: 1,
          planningTargetLunchCount: 2,
          planningTargetSnackCount: 0,
        },
      },
      provenance,
    });

    for (const recipe of [
      {
        id: 'planner-brain-participation-oats',
        name: 'Adult Prep Oats',
        meal_type: 'breakfast',
        servings: 6,
        total_time: 5,
        active_time: 5,
        cost_per_serving_cad: 1.75,
        macros: {
          calories: 360,
          fiber_g: 8,
          protein_g: 14,
          sodium_mg: 120,
        },
        tags: ['repeatable', 'breakfast'],
        ingredients: [{ item: 'oats', quantity: 1, unit: 'cup', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Prepare oats.' }],
      },
      {
        id: 'planner-brain-participation-kid-lunch',
        name: 'Kid Lunch Box',
        meal_type: 'lunch',
        servings: 6,
        total_time: 10,
        active_time: 10,
        cost_per_serving_cad: 2.25,
        macros: {
          calories: 420,
          fiber_g: 5,
          protein_g: 18,
          sodium_mg: 390,
        },
        tags: ['lunch', 'kids'],
        ingredients: [{ item: 'pita', quantity: 3, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Pack lunches.' }],
      },
      {
        id: 'planner-brain-participation-family-pasta',
        name: 'Family Pasta',
        meal_type: 'dinner',
        servings: 2,
        total_time: 25,
        active_time: 15,
        cost_per_serving_cad: 3.5,
        macros: {
          calories: 560,
          fiber_g: 6,
          protein_g: 24,
          sodium_mg: 520,
        },
        tags: ['family', 'weeknight'],
        ingredients: [{ item: 'pasta', quantity: 450, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook pasta.' }],
      },
    ]) {
      await service.createRecipe({ recipe, provenance });
    }

    const generation = await service.generatePlan({
      weekStart: '2026-06-22',
      overrides: {
        maxTrialMeals: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];
    assert.ok(candidate);

    const breakfastEntries = candidate.entries.filter((entry) => entry.mealType === 'breakfast');
    const lunchEntries = candidate.entries.filter((entry) => entry.mealType === 'lunch');
    const dinnerEntries = candidate.entries.filter((entry) => entry.mealType === 'dinner');
    assert.equal(candidate.entries.length, 5);
    assert.equal(breakfastEntries.length, 2);
    assert.equal(lunchEntries.length, 2);
    assert.equal(dinnerEntries.length, 1);
    assert.equal(breakfastEntries.every((entry) => entry.serves === 1), true);
    assert.equal(lunchEntries.every((entry) => entry.serves === 3), true);
    assert.equal(dinnerEntries.every((entry) => entry.serves === 4), true);

    const signals = candidate.planningBrief.contextSignals.preferenceSignals;
    assert.equal(signals.householdAdultCount, 1);
    assert.equal(signals.householdChildCount, 3);
    assert.equal(signals.householdChildrenEatSameMeals, false);
    assert.deepEqual(signals.householdMealParticipationTypes, ['breakfast', 'dinner', 'lunch']);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function enforcesDietaryConstraintsDuringPlanning() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database, async () => [
    personFact('dietary_pattern', { label: 'vegetarian' }),
    personFact('dietary_pattern', { label: 'gluten-free' }),
    personFact('dietary_pattern', { label: 'dairy-free' }),
  ]);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-dietary-constraint-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.recordCalibrationResponse({
      response: {
        preferencePatch: {
          cookingCadence: '1 weeknight dinner',
          householdShape: 'solo',
          mealRoutine: 'solo weeknight dinners',
          weeknightTimeLimitMinutes: 30,
        },
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-dietary-chicken-pasta',
        name: 'Chicken Pasta',
        meal_type: 'dinner',
        servings: 1,
        total_time: 25,
        active_time: 20,
        cost_per_serving_cad: 6,
        macros: {
          calories: 620,
          fiber_g: 4,
          protein_g: 38,
          sodium_mg: 520,
        },
        tags: ['vegetarian'],
        ingredients: [
          { item: 'chicken breast', quantity: 1, unit: 'count', ordering_policy: 'flexible_match' },
          { item: 'wheat pasta', quantity: 100, unit: 'g', ordering_policy: 'flexible_match' },
        ],
        instructions: [{ step_number: 1, detail: 'Cook chicken pasta.' }],
      },
      provenance,
    });
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-dietary-cheesy-rice',
        name: 'Cheesy Rice Bowl',
        meal_type: 'dinner',
        servings: 1,
        total_time: 25,
        active_time: 15,
        cost_per_serving_cad: 4,
        macros: {
          calories: 480,
          fiber_g: 5,
          protein_g: 18,
          sodium_mg: 360,
        },
        tags: ['vegetarian', 'gluten-free'],
        ingredients: [
          { item: 'rice', quantity: 120, unit: 'g', ordering_policy: 'flexible_match' },
          { item: 'cheese', quantity: 60, unit: 'g', ordering_policy: 'flexible_match' },
        ],
        instructions: [{ step_number: 1, detail: 'Cook cheesy rice.' }],
      },
      provenance,
    });
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-dietary-tofu-rice',
        name: 'Tofu Rice Bowl',
        meal_type: 'dinner',
        servings: 1,
        total_time: 25,
        active_time: 15,
        cost_per_serving_cad: 4,
        macros: {
          calories: 460,
          fiber_g: 7,
          protein_g: 24,
          sodium_mg: 320,
        },
        tags: ['vegetarian', 'gluten-free', 'dairy-free', 'weeknight'],
        ingredients: [
          { item: 'tofu', quantity: 150, unit: 'g', ordering_policy: 'flexible_match' },
          { item: 'rice', quantity: 120, unit: 'g', ordering_policy: 'flexible_match' },
        ],
        instructions: [{ step_number: 1, detail: 'Cook tofu rice.' }],
      },
      provenance,
    });

    const generation = await service.generatePlan({
      weekStart: '2026-06-15',
      overrides: {
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 1,
        snackCount: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];

    assert.ok(candidate);
    assert.equal(candidate.entries.length, 1);
    assert.equal(candidate.entries[0]?.recipeId, 'planner-brain-dietary-tofu-rice');
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.dietaryConstraintCount, 3);
    assert.equal(candidate.planningBrief.contextSignals.preferenceSignals.householdSizeSegment, 'solo');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function derivesPlannerTier1DietaryFromPersonFacts() {
  const runtime = createTempRuntime();
  const core = new FluentCoreService(runtime.env.db, runtime.env);
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database, (input) => core.listPersonFacts(input));
  const provenance = plannerProvenance('planner-brain-person-facts-authority-test');

  try {
    await core.upsertPersonFact(
      {
        kind: 'allergy',
        source: { origin: 'user_confirmed', domain: 'meals', detail: 'test' },
        status: 'confirmed',
        value: { label: 'shellfish', severity: 'avoid' },
        visibility: { domains: 'all', hosts: 'all', derived_only_across: [] },
      },
      provenance,
    );

    await createPlannerDinnerRecipe(service, provenance, {
      id: 'planner-brain-person-facts-shellfish',
      ingredients: ['shellfish', 'rice'],
      name: 'Shellfish Rice',
      tags: ['weeknight'],
    });
    await createPlannerDinnerRecipe(service, provenance, {
      id: 'planner-brain-person-facts-safe-beans',
      ingredients: ['beans', 'rice'],
      name: 'Safe Bean Rice',
      tags: ['weeknight'],
    });

    const generation = await service.generatePlan({
      weekStart: '2026-06-22',
      overrides: {
        breakfastCount: 0,
        dinnerCount: 1,
        includeRecipeIds: ['planner-brain-person-facts-shellfish', 'planner-brain-person-facts-safe-beans'],
        lunchCount: 0,
        snackCount: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];

    assert.ok(candidate);
    assert.equal(candidate.recipeIds.includes('planner-brain-person-facts-shellfish'), false);
    assert.equal(candidate.recipeIds.includes('planner-brain-person-facts-safe-beans'), true);

    const acceptedPlan = await service.acceptPlanCandidate({
      candidateId: candidate.candidateId,
      generationId: generation.id,
      inputHash: generation.inputHash,
      provenance,
    });
    assert.equal(acceptedPlan.entries[0]?.recipeId, 'planner-brain-person-facts-safe-beans');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function allowsRecipeWhenPersonFactIsRejected() {
  const runtime = createTempRuntime();
  const core = new FluentCoreService(runtime.env.db, runtime.env);
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database, (input) => core.listPersonFacts(input));
  const provenance = plannerProvenance('planner-brain-person-facts-replace-test');

  try {
    await core.upsertPersonFact(
      {
        kind: 'allergy',
        source: { origin: 'user_confirmed', domain: 'meals', detail: 'test' },
        status: 'confirmed',
        value: { label: 'peanuts', severity: 'avoid' },
        visibility: { domains: 'all', hosts: 'all', derived_only_across: [] },
      },
      provenance,
    );
    await core.rejectPersonFact({ kind: 'allergy', value: { label: 'peanuts', severity: 'avoid' } }, provenance);

    await createPlannerDinnerRecipe(service, provenance, {
      id: 'planner-brain-person-facts-peanut',
      ingredients: ['peanuts', 'noodles'],
      name: 'Peanut Noodles',
      tags: ['weeknight'],
    });
    await createPlannerDinnerRecipe(service, provenance, {
      id: 'planner-brain-person-facts-safe-pasta',
      ingredients: ['tomato', 'pasta'],
      name: 'Safe Pasta',
      tags: ['weeknight'],
    });

    const generation = await service.generatePlan({
      weekStart: '2026-06-29',
      overrides: {
        breakfastCount: 0,
        dinnerCount: 1,
        includeRecipeIds: ['planner-brain-person-facts-peanut'],
        lunchCount: 0,
        snackCount: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];

    assert.ok(candidate);
    assert.equal(candidate.entries[0]?.recipeId, 'planner-brain-person-facts-peanut');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function leavesPlannerBehaviorUnchangedWhenPersonFactsReaderIsNull() {
  const runtime = createTempRuntime();
  const core = new FluentCoreService(runtime.env.db, runtime.env);
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database, null);
  const provenance = plannerProvenance('planner-brain-person-facts-null-reader-test');

  try {
    await core.upsertPersonFact(
      {
        kind: 'allergy',
        source: { origin: 'user_confirmed', domain: 'meals', detail: 'test' },
        status: 'confirmed',
        value: { label: 'shellfish', severity: 'avoid' },
        visibility: { domains: 'all', hosts: 'all', derived_only_across: [] },
      },
      provenance,
    );
    await createPlannerDinnerRecipe(service, provenance, {
      id: 'planner-brain-null-reader-shellfish',
      ingredients: ['shellfish', 'rice'],
      name: 'Null Reader Shellfish Rice',
      tags: ['weeknight'],
    });

    const generation = await service.generatePlan({
      weekStart: '2026-07-06',
      overrides: {
        breakfastCount: 0,
        dinnerCount: 1,
        includeRecipeIds: ['planner-brain-null-reader-shellfish'],
        lunchCount: 0,
        snackCount: 0,
      },
      provenance,
    });

    assert.equal(generation.candidates[0]?.entries[0]?.recipeId, 'planner-brain-null-reader-shellfish');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function preservesTier2PreferencesWhenOverlayingPersonFacts() {
  const raw = {
    core_rules: {
      allergies: ['shadow shellfish'],
      allergies_confirmed_at: '2026-06-01T00:00:00.000Z',
      dietary_constraints_confirmed_at: '2026-06-01T00:00:00.000Z',
      hard_avoids_confirmed_at: '2026-06-01T00:00:00.000Z',
      liked_foods: ['lentils'],
      likes: ['tacos'],
      preferred_cuisines: ['thai'],
      soft_avoids: ['cilantro', 'overly salty'],
      spice_preference: 'medium',
    },
    household: { shape: 'family of 3' },
    planning: { cooking_cadence: '2 weeknight dinners', grocery_day: 'Sunday' },
    shopping: { grocery_expectation: 'exact list' },
  };
  const planningBefore = JSON.stringify(raw.planning);
  const shoppingBefore = JSON.stringify(raw.shopping);
  const householdBefore = JSON.stringify(raw.household);

  raw.core_rules = overlayPersonFactsOntoCoreRules(raw.core_rules, [
    personFact('anti_favorite', { label: 'cilantro', domain_hint: 'meals' }),
    personFact('taste_pref', { label: 'mushrooms', polarity: 'like' }),
    personFact('taste_pref', { label: 'burnt toast', polarity: 'dislike' }),
    personFact('allergy', { label: 'Shellfish', severity: 'avoid' }),
  ]);

  assert.deepEqual(raw.core_rules.allergies, ['Shellfish']);
  assert.deepEqual(raw.core_rules.dislikes, ['cilantro']);
  assert.deepEqual(raw.core_rules.favorite_foods, ['mushrooms']);
  // soft_avoids is non-owned and left untouched (even though 'cilantro' is also an active anti_favorite dislike);
  // the planner merges dislikes+soft_avoids and dedupes, so the overlay does not cross-mutate non-owned fields.
  assert.deepEqual(raw.core_rules.soft_avoids, ['cilantro', 'overly salty']);
  assert.equal(raw.core_rules.spice_preference, 'medium');
  assert.deepEqual(raw.core_rules.preferred_cuisines, ['thai']);
  assert.deepEqual(raw.core_rules.liked_foods, ['lentils']);
  assert.deepEqual(raw.core_rules.likes, ['tacos']);
  assert.equal(Object.keys(raw.core_rules).some((key) => key.endsWith('_confirmed_at')), false);
  assert.equal(JSON.stringify(raw.planning), planningBefore);
  assert.equal(JSON.stringify(raw.shopping), shoppingBefore);
  assert.equal(JSON.stringify(raw.household), householdBefore);
}

async function mirrorsTier1DietaryFromVNextCalibrationEvent() {
  const runtime = createTempRuntime();
  const core = new FluentCoreService(runtime.env.db, runtime.env);
  const meals = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = plannerProvenance('planner-brain-vnext-tier1-mirror-test');

  try {
    const ack = await recordFluentVNextEvent(
      {
        core: {
          appendPersonConsentEvent: (input, inputProvenance) => core.appendPersonConsentEvent(input, inputProvenance),
          getCapabilities: () => core.getCapabilities(),
          getProfile: () => core.getProfile(),
          listPersonFacts: (input) => core.listPersonFacts(input),
          rejectPersonFact: (input, inputProvenance) => core.rejectPersonFact(input, inputProvenance),
          updateProfile: (input, inputProvenance) => core.updateProfile(input, inputProvenance),
          upsertPersonFact: (input, inputProvenance) => core.upsertPersonFact(input, inputProvenance),
        },
        meals: {
          getOnboardingCalibration: (input) => meals.getOnboardingCalibration(input),
          recordCalibrationResponse: (input) => meals.recordCalibrationResponse(input),
        },
      },
      {
        domain: 'meals',
        event: {
          preference_patch: {
            allergies: ['sesame'],
          },
        },
        eventType: 'meals_calibration_response',
        provenance,
      },
    );

    assert.equal(ack.source, 'meals.recordCalibrationResponse+core.mirrorTier1PersonFacts');
    const facts = await core.listPersonFacts({ consumerDomain: 'meals', host: 'unknown' });
    assert.equal(facts.some((fact) => fact.kind === 'allergy' && factLabel(fact) === 'sesame'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function mirrorsTier1DietaryFromLegacyCalibrationTool() {
  const runtime = createTempRuntime();
  const meals = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const core = new FluentCoreService(runtime.env.db, runtime.env);
  const server = new PlannerFakeMcpServer();
  registerMealsMcpSurface(server as unknown as never, meals, core, 'https://example.test');
  const recordCalibration = server.tools.get('meals_record_calibration_response');
  assert.ok(recordCalibration);

  try {
    await runWithFluentAuthProps(
      {
        profileId: FLUENT_OSS_DEFAULT_PROFILE_ID,
        scope: [FLUENT_MEALS_READ_SCOPE, FLUENT_MEALS_WRITE_SCOPE],
        tenantId: FLUENT_OSS_DEFAULT_TENANT_ID,
      },
      () =>
        recordCalibration({
          preference_patch: {
            hard_avoids: ['mushrooms'],
          },
          response_mode: 'ack',
        }),
    );

    const facts = await core.listPersonFacts({ consumerDomain: 'meals', host: 'unknown' });
    assert.equal(facts.some((fact) => fact.kind === 'hard_avoid' && factLabel(fact) === 'mushrooms'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function guardsTier1OverlayClearList() {
  assert.deepEqual(Object.keys(TIER1_KIND_TO_CORE_RULES_FIELD).sort(), [...TIER1_MEALS_PERSON_FACT_KINDS].sort());
  assert.deepEqual(Object.values(TIER1_KIND_TO_CORE_RULES_FIELD).sort(), [
    'allergies',
    'dietary_constraints',
    'dislikes',
    'favorite_foods',
    'hard_avoids',
  ]);
}

async function noCoreRulesOnlyTier1DietaryWriterRemainsTripwirePending() {
  const root = path.resolve(__dirname, '..');
  const sourceRoot = path.join(root, 'src');
  const tier1Fields = [
    'allergies',
    'hard_avoids',
    'dietary_constraints',
    'dislikes',
    'favorite_foods',
    'allergies_confirmed_at',
    'hard_avoids_confirmed_at',
    'dietary_constraints_confirmed_at',
    'dislikes_confirmed_at',
    'favorite_foods_confirmed_at',
  ];
  const assignmentPattern = new RegExp(
    `(?:coreRules|core_rules|nextCoreRules|next|rebuilt)\\s*(?:\\.\\s*(?:${tier1Fields.join('|')})|\\[\\s*['"](?:${tier1Fields.join(
      '|',
    )})['"]\\s*\\])\\s*=`,
  );
  const matches: string[] = [];

  for (const filePath of listSourceFiles(sourceRoot)) {
    const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!assignmentPattern.test(line)) return;
      if (isAllowedTier1DietaryCoreRulesAssignment(relativePath, line)) return;
      matches.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
  }

  assert.deepEqual(matches, [], `Unexpected Tier-1 dietary core_rules writer(s):\n${matches.join('\n')}`);
}

async function excludesAllergenicRecipeFromPersonFactsWithoutCoreRulesSeed() {
  const runtime = createTempRuntime();
  const core = new FluentCoreService(runtime.env.db, runtime.env);
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database, (input) => core.listPersonFacts(input));
  const provenance = plannerProvenance('planner-brain-sole-source-allergy-test');

  try {
    await core.upsertPersonFact(
      {
        kind: 'allergy',
        source: { origin: 'user_confirmed', domain: 'meals', detail: 'test' },
        status: 'confirmed',
        value: { label: 'cashews', severity: 'avoid' },
        visibility: { domains: 'all', hosts: 'all', derived_only_across: [] },
      },
      provenance,
    );

    await createPlannerDinnerRecipe(service, provenance, {
      id: 'planner-brain-sole-source-cashew-curry',
      ingredients: ['cashews', 'rice'],
      name: 'Cashew Curry',
      tags: ['weeknight'],
    });
    await createPlannerDinnerRecipe(service, provenance, {
      id: 'planner-brain-sole-source-safe-rice',
      ingredients: ['lentils', 'rice'],
      name: 'Safe Lentil Rice',
      tags: ['weeknight'],
    });

    const generation = await service.generatePlan({
      weekStart: '2026-07-13',
      overrides: {
        breakfastCount: 0,
        dinnerCount: 1,
        includeRecipeIds: ['planner-brain-sole-source-cashew-curry', 'planner-brain-sole-source-safe-rice'],
        lunchCount: 0,
        snackCount: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];

    assert.ok(candidate);
    assert.equal(candidate.recipeIds.includes('planner-brain-sole-source-cashew-curry'), false);
    assert.equal(candidate.recipeIds.includes('planner-brain-sole-source-safe-rice'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function dropsTier1DietaryPreferencePatchCoreRulesWrites() {
  const now = '2026-06-20T12:00:00.000Z';
  const raw = applyMealsCalibrationResponse({
    now,
    preferences: {
      raw: {
        core_rules: {
          liked_foods: ['lentils'],
        },
      },
    } as never,
    response: {
      preferencePatch: {
        allergies: ['shellfish'],
        dietaryConstraints: ['vegetarian'],
        dislikes: ['cilantro'],
        favoriteFoods: ['mushrooms'],
        groceryExpectation: 'exact list',
        hardAvoids: ['peanuts'],
        householdAdultCount: 2,
        householdChildCount: 1,
        householdDefaultServeTarget: 3,
        householdShape: 'family of 3',
        planningGroceryDay: 'Sunday',
        planningTargetDinnerCount: 4,
        preferredCuisines: ['thai'],
        shoppingPreferredStores: ['No Frills'],
        shoppingSubstitutionTolerance: 'flexible substitutions',
        spicePreference: 'medium',
      },
    },
  });
  const coreRules = raw.core_rules as Record<string, unknown>;
  const household = raw.household as Record<string, unknown>;
  const planning = raw.planning as Record<string, unknown>;
  const shopping = raw.shopping as Record<string, unknown>;

  for (const key of [
    'allergies',
    'hard_avoids',
    'dietary_constraints',
    'dislikes',
    'favorite_foods',
    'allergies_confirmed_at',
    'hard_avoids_confirmed_at',
    'dietary_constraints_confirmed_at',
    'dislikes_confirmed_at',
    'favorite_foods_confirmed_at',
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(coreRules, key), false, key);
  }
  assert.deepEqual(coreRules.liked_foods, ['lentils']);
  assert.deepEqual(coreRules.preferred_cuisines, ['thai']);
  assert.equal(coreRules.spice_preference, 'medium');
  assert.equal(household.shape, 'family of 3');
  assert.equal(household.adult_count, 2);
  assert.equal(household.child_count, 1);
  assert.equal(household.default_serve_target, 3);
  assert.equal(planning.grocery_day, 'Sunday');
  assert.equal(planning.target_dinner_count, 4);
  assert.equal(shopping.grocery_expectation, 'exact list');
  assert.deepEqual(shopping.preferred_stores, ['No Frills']);
  assert.equal(shopping.substitution_tolerance, 'flexible substitutions');
}

async function leavesTier1DietaryRejectedSignalsToPersonFacts() {
  const raw = applyMealsCalibrationResponse({
    now: '2026-06-20T12:00:00.000Z',
    preferences: {
      raw: {
        core_rules: {
          allergies: ['peanuts'],
          preferred_cuisines: ['thai', 'mexican'],
        },
      },
    } as never,
    response: {
      signals: [
        {
          kind: 'allergy',
          status: 'rejected',
          value: 'peanuts',
        },
        {
          kind: 'preferred_cuisine',
          status: 'rejected',
          value: 'thai',
        },
      ],
    },
  });
  const coreRules = raw.core_rules as Record<string, unknown>;

  assert.deepEqual(coreRules.allergies, ['peanuts']);
  assert.equal(Object.prototype.hasOwnProperty.call(coreRules, 'allergies_confirmed_at'), false);
  assert.deepEqual(coreRules.preferred_cuisines, ['mexican']);
}

function listSourceFiles(root: string): string[] {
  const entries = readdirSync(root).map((entry) => path.join(root, entry));
  const files: string[] = [];
  for (const entry of entries) {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(entry));
    } else if (entry.endsWith('.ts')) {
      files.push(entry);
    }
  }
  return files;
}

function isAllowedTier1DietaryCoreRulesAssignment(relativePath: string, line: string): boolean {
  if (relativePath === 'src/domains/meals/person-facts-overlay.ts') return true;
  return relativePath === 'src/mcp-meals.ts' && /TIER1_DIETARY_CORE_RULE_KEYS|stripTier1DietaryCoreRules|nextCoreRules/.test(line);
}

async function includesTextFirstPlanningBriefAndReview() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-brief-review-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-brief-only-dinner',
        name: 'Planner Brain Brief Only Dinner',
        meal_type: 'dinner',
        servings: 2,
        total_time: 30,
        active_time: 20,
        macros: {
          calories: 520,
          fiber_g: 6,
          protein_g: 31,
          sodium_mg: 420,
        },
        cost_per_serving_cad: 6,
        ingredients: [{ item: 'chicken thighs', quantity: 500, unit: 'g', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook dinner.' }],
      },
      provenance,
    });

    const generation = await service.generatePlan({
      weekStart: '2026-06-01',
      overrides: {
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 3,
        snackCount: 0,
      },
      provenance,
    });
    const candidate = generation.candidates[0];

    assert.ok(candidate);
    assert.equal(candidate.planningBrief.weekStart, '2026-06-01');
    assert.equal(candidate.planningBrief.recipeCoverage.requestedSlotCount, 3);
    assert.equal(candidate.planningBrief.recipeCoverage.missingSlotCount, 2);
    assert.deepEqual(candidate.planningBrief.recipeCoverage.thinMealTypes, ['dinner']);
    assert.equal(candidate.planningBrief.recipeCatalog.gapCount > 0, true);
    assert.equal(
      candidate.planningBrief.recipeCatalog.gaps.some((gap) => gap.id === 'thin-weeknight-dinners'),
      true,
    );
    assert.equal(candidate.planningBrief.readiness?.readinessLevel !== undefined, true);
    assert.equal(candidate.planningBrief.confidenceBreakdown?.planningDecisionConfidence !== undefined, true);
    assert.equal(
      candidate.planningBrief.evidenceNotes.some((note) => /Recipe coverage is thin for: dinner/i.test(note)),
      true,
    );
    assert.equal(candidate.planReview.headline.includes('planned meal slot'), true);
    assert.equal(
      candidate.planReview.watchouts.some((note) => note.includes('requested meal slot')),
      true,
    );
    assert.equal(
      candidate.planReview.suggestedSwaps.some((note) => /more dinner recipes/i.test(note)),
      true,
    );
    assert.equal(
      candidate.planReview.suggestedSwaps.some((note) => /active time, cleanup, and family-fit metadata/i.test(note)),
      true,
    );
    assert.equal(
      candidate.planReview.acceptanceChecklist.some((note) => /canonical weekly meal plan/i.test(note)),
      true,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function reschedulesFutureMealWhenCookedEarly() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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

async function updatesExistingRecipeMemoryWhenLoggingFeedback() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-existing-memory-feedback-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-existing-memory-recipe',
        name: 'Planner Brain Existing Memory Recipe',
        meal_type: 'dinner',
        servings: 2,
        total_time: 30,
        active_time: 20,
        macros: {
          calories: 520,
          fiber_g: 4,
          protein_g: 34,
          sodium_mg: 420,
        },
        cost_per_serving_cad: 5.9,
        ingredients: [{ item: 'salmon fillet', quantity: 2, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Cook the existing-memory recipe.' }],
      },
      provenance,
    });

    runtime.sqliteDb.sqlite
      .prepare(
        `INSERT INTO meal_memory (
          id, tenant_id, recipe_id, status, last_feedback_json, notes_json, last_used_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'legacy-memory-id-for-existing-memory-recipe',
        FLUENT_OSS_DEFAULT_TENANT_ID,
        'planner-brain-existing-memory-recipe',
        'proven',
        JSON.stringify({ taste: 'good', repeat_again: 'good' }),
        JSON.stringify(['Already proven from earlier cooking.']),
        '2026-04-01',
        '2026-04-01T12:00:00.000Z',
      );

    const feedback = await service.logFeedback({
      date: '2026-04-12',
      difficulty: 'okay',
      familyAcceptance: 'good',
      notes: 'Still works well when attached to a plan entry.',
      recipeId: 'planner-brain-existing-memory-recipe',
      repeatAgain: 'good',
      taste: 'good',
      timeReality: 'okay',
      provenance,
    });

    assert.equal(feedback.recipeId, 'planner-brain-existing-memory-recipe');

    const memoryRows = runtime.sqliteDb.sqlite
      .prepare('SELECT id, status, last_feedback_json, notes_json, last_used_at FROM meal_memory WHERE recipe_id = ?')
      .all('planner-brain-existing-memory-recipe') as Array<{
      id: string;
      last_feedback_json: string;
      last_used_at: string;
      notes_json: string;
      status: string;
    }>;

    assert.equal(memoryRows.length, 1);
    assert.equal(memoryRows[0]?.id, 'legacy-memory-id-for-existing-memory-recipe');
    assert.equal(memoryRows[0]?.status, 'proven');
    assert.equal(memoryRows[0]?.last_used_at, '2026-04-12');
    const lastFeedback = JSON.parse(memoryRows[0]!.last_feedback_json) as Record<string, unknown>;
    assert.equal(lastFeedback.taste, 'good');
    assert.equal(lastFeedback.difficulty, 'okay');
    const notes = JSON.parse(memoryRows[0]!.notes_json) as string[];
    assert.equal(notes.includes('Already proven from earlier cooking.'), true);
    assert.equal(notes.includes('Still works well when attached to a plan entry.'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function honorsPinnedMealAssignmentsDuringGeneration() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-pinned-meals-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    const recipes = [
      {
        id: 'planner-brain-pinned-monday',
        name: 'Planner Brain Monday Dinner',
        ingredient: 'chicken thighs',
      },
      {
        id: 'planner-brain-pinned-wednesday',
        name: 'Planner Brain Wednesday Dinner',
        ingredient: 'salmon fillet',
      },
      {
        id: 'planner-brain-pinned-friday',
        name: 'Planner Brain Friday Dinner',
        ingredient: 'lean ground beef',
      },
    ];

    for (const recipe of recipes) {
      await service.createRecipe({
        recipe: {
          id: recipe.id,
          name: recipe.name,
          meal_type: 'dinner',
          servings: 2,
          total_time: 25,
          active_time: 15,
          macros: {
            calories: 600,
            fiber_g: 5,
            protein_g: 32,
            sodium_mg: 420,
          },
          cost_per_serving_cad: 6.5,
          ingredients: [{ item: recipe.ingredient, quantity: 500, unit: 'g', ordering_policy: 'flexible_match' }],
          instructions: [{ step_number: 1, detail: `Cook ${recipe.name}.` }],
        },
        provenance,
      });
    }

    const generation = await service.generatePlan({
      weekStart: '2026-05-18',
      overrides: {
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 3,
        snackCount: 0,
        includeRecipeIds: recipes.map((recipe) => recipe.id),
        pinnedMeals: [
          {
            date: '2026-05-22',
            mealType: 'dinner',
            recipeId: 'planner-brain-pinned-friday',
          },
        ],
      },
      provenance,
    });

    const candidate = generation.candidates[0];
    assert.ok(candidate);
    const fridayDinner = candidate.entries.find((entry) => entry.date === '2026-05-22' && entry.mealType === 'dinner');
    assert.equal(fridayDinner?.recipeId, 'planner-brain-pinned-friday');
    assert.equal(
      candidate.entries.some(
        (entry) => entry.date !== '2026-05-22' && entry.mealType === 'dinner' && entry.recipeId === 'planner-brain-pinned-friday',
      ),
      false,
    );
    assert.equal(candidate.rationale.some((entry) => entry.includes('Pinned 1 meal slot')), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function deprioritizesRecipesWithRecentShoppingSubstitutionFriction() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId: 'planner-brain-shopping-friction-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };

  try {
    await service.createRecipe({
      recipe: {
        id: 'planner-brain-homemade-chickpea-snack',
        name: 'Planner Brain Homemade Chickpea Snack',
        meal_type: 'snack',
        servings: 1,
        total_time: 20,
        active_time: 10,
        macros: {
          calories: 220,
          fiber_g: 6,
          protein_g: 10,
          sodium_mg: 180,
        },
        cost_per_serving_cad: 2.2,
        ingredients: [{ item: 'canned chickpeas', quantity: 2, unit: 'count', ordering_policy: 'flexible_match' }],
        instructions: [{ step_number: 1, detail: 'Roast the chickpeas.' }],
      },
      provenance,
    });

    await service.createRecipe({
      recipe: {
        id: 'planner-brain-premade-chickpea-snack',
        name: 'Planner Brain Premade Chickpea Snack',
        meal_type: 'snack',
        servings: 1,
        total_time: 2,
        active_time: 1,
        macros: {
          calories: 210,
          fiber_g: 5,
          protein_g: 9,
          sodium_mg: 190,
        },
        cost_per_serving_cad: 4.5,
        ingredients: [
          {
            item: 'roasted chickpea snack bag',
            quantity: 1,
            unit: 'count',
            ordering_policy: 'direct_match',
          },
        ],
        instructions: [{ step_number: 1, detail: 'Open the snack bag.' }],
      },
      provenance,
    });

    await service.logFeedback({
      date: '2026-05-07',
      recipeId: 'planner-brain-homemade-chickpea-snack',
      repeatAgain: 'good',
      taste: 'good',
      provenance,
    });

    await service.upsertPlan({
      plan: {
        week_start: '2026-05-11',
        week_end: '2026-05-11',
        status: 'approved',
        meals: [
          {
            id: 'plan:2026-05-11:snack',
            date: '2026-05-11',
            day: 'Monday',
            meal_type: 'snack',
            recipe_id: 'planner-brain-homemade-chickpea-snack',
            recipe_name: 'Planner Brain Homemade Chickpea Snack',
            selection_status: 'proven',
            serves: 1,
            prep_minutes: 10,
            total_minutes: 20,
            leftovers_expected: false,
            instructions: ['Roast the chickpeas.'],
          },
        ],
      },
      provenance,
    });

    const groceryPlan = await service.generateGroceryPlan({
      weekStart: '2026-05-11',
      provenance,
    });
    const cannedChickpeas = groceryPlan.raw.items.find((item) => item.normalizedName === 'canned chickpeas');
    assert.ok(cannedChickpeas);

    await service.upsertGroceryPlanAction({
      weekStart: '2026-05-11',
      itemKey: cannedChickpeas!.itemKey,
      actionStatus: 'substituted',
      substituteDisplayName: 'Three Farmers Roasted Chickpeas',
      provenance,
    });

    const nextWeek = await service.generatePlan({
      weekStart: '2026-05-18',
      overrides: {
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 0,
        snackCount: 1,
        includeRecipeIds: [
          'planner-brain-homemade-chickpea-snack',
          'planner-brain-premade-chickpea-snack',
        ],
      },
      provenance,
    });

    const chosenSnack = nextWeek.candidates[0]?.entries.find((entry) => entry.mealType === 'snack');
    assert.equal(chosenSnack?.recipeId, 'planner-brain-premade-chickpea-snack');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function verifiesHostedPlannerBrainFlows() {
  const runtime = createTempRuntime();
  const service = new MealsService(runtime.sqliteDb as unknown as D1Database);
  const provenance = {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
        profile_owner: TEST_ACTOR_NAME,
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
    assert.equal(updatedPreferences.raw.profile_owner, TEST_ACTOR_NAME);

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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
      profile_owner: TEST_ACTOR_NAME,
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

    assert.equal(updated.raw.profile_owner, TEST_ACTOR_NAME);
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
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
        profile_owner: TEST_ACTOR_NAME,
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

function plannerProvenance(sessionId: string) {
  return {
    actorEmail: TEST_ACTOR_EMAIL,
    actorName: TEST_ACTOR_NAME,
    confidence: 1,
    scopes: ['meals:write'],
    sessionId,
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-meals',
    sourceType: 'test',
  };
}

async function createPlannerDinnerRecipe(
  service: MealsService,
  provenance: ReturnType<typeof plannerProvenance>,
  input: { id: string; ingredients: string[]; name: string; tags?: string[] },
) {
  await service.createRecipe({
    recipe: {
      id: input.id,
      name: input.name,
      meal_type: 'dinner',
      servings: 1,
      total_time: 20,
      active_time: 15,
      cost_per_serving_cad: 4,
      macros: {
        calories: 450,
        fiber_g: 6,
        protein_g: 18,
        sodium_mg: 420,
      },
      tags: input.tags ?? ['weeknight'],
      ingredients: input.ingredients.map((item) => ({ item, quantity: 1, unit: 'count', ordering_policy: 'flexible_match' })),
      instructions: [{ step_number: 1, detail: `Cook ${input.name}.` }],
    },
    provenance,
  });
}

function personFact(kind: PersonFactKind, value: Record<string, unknown>): PersonFact {
  return {
    annotations: [],
    confidence: 1,
    confirmed_at: '2026-06-01T00:00:00.000Z',
    fact_id: `pf:test:${kind}:${String(value.label ?? '')}`,
    kind,
    note: null,
    observed_at: '2026-06-01T00:00:00.000Z',
    path: `test.${kind}.${String(value.label ?? '')}`,
    question_id: null,
    schema_version: 1,
    section: kind === 'allergy' || kind === 'dietary_pattern' ? 'dietary' : 'taste',
    source: { detail: 'test', domain: 'meals', origin: 'user_confirmed' },
    stale_after: null,
    status: 'confirmed',
    supersedes: null,
    value: value as never,
    visibility: { domains: 'all', hosts: 'all', derived_only_across: [] },
  };
}

function factLabel(fact: PersonFact): string {
  const value = fact.value as { label?: unknown };
  return typeof value.label === 'string' ? value.label : '';
}

type PlannerToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

class PlannerFakeMcpServer {
  readonly tools = new Map<string, PlannerToolHandler>();

  registerResource() {
    return undefined;
  }

  registerTool(name: string, _config: unknown, handler: PlannerToolHandler) {
    this.tools.set(name, handler);
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
