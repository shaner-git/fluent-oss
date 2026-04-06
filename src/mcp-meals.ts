import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildMutationProvenance,
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  requireScope,
} from './auth';
import type { FluentCoreService } from './fluent-core';
import {
  buildMutationAck,
  MealsService,
  summarizeGroceryPlan,
  summarizeMealPlan,
  summarizeMealPreferences,
  summarizePreparedOrder,
} from './domains/meals/service';
import { firstTemplateValue, iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult, writeResponseModeSchema } from './mcp-shared';

const calendarMealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const calendarContextDaySchema = z.object({
  date: z.string(),
  blockedMeals: z.array(calendarMealTypeSchema).optional(),
  householdAdultsHome: z.number().int().min(0).nullable().optional(),
  householdChildrenHome: z.number().int().min(0).nullable().optional(),
  notes: z.array(z.string()).nullable().optional(),
});
const calendarContextSchema = z.object({
  weekStart: z.string(),
  generatedAt: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  availability: z.enum(['available', 'unavailable', 'unchecked']),
  days: z.array(calendarContextDaySchema).optional(),
});
const trainingContextSchema = z.object({
  goalType: z.string().nullable().optional(),
  trainingDays: z.array(z.string()).optional(),
  daysPerWeek: z.number().int().min(0).max(7),
  sessionLoadByDay: z.record(z.string(), z.enum(['light', 'moderate', 'hard'])).optional(),
  nutritionSupportMode: z.enum(['general', 'higher_protein', 'simpler_dinners', 'recovery_support']),
  weekComplexity: z.enum(['low', 'medium', 'high']),
});

function normalizeMealsTrainingContextInput(
  input: z.infer<typeof trainingContextSchema> | undefined,
): import('./domains/meals/types').MealsTrainingContextRecord | null {
  if (!input) return null;
  return {
    goalType: input.goalType ?? null,
    trainingDays: input.trainingDays ?? [],
    daysPerWeek: input.daysPerWeek,
    sessionLoadByDay: input.sessionLoadByDay ?? {},
    nutritionSupportMode: input.nutritionSupportMode,
    weekComplexity: input.weekComplexity,
  };
}

export function registerMealsMcpSurface(server: McpServer, meals: MealsService, fluentCore: FluentCoreService, origin: string) {
  server.registerResource(
    'meals-current-plan',
    'fluent://meals/current-plan',
    {
      title: 'Current Meal Plan',
      description: 'The current approved or active meal plan with entries.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const plan = await meals.getCurrentPlan();
      const executionSupportSummary = await meals.getExecutionSupportSummary();
      return jsonResource(uri.href, plan ? { ...plan, executionSupportSummary } : null);
    },
  );

  server.registerResource(
    'meals-inventory',
    'fluent://meals/inventory',
    {
      title: 'Meal Inventory',
      description: 'Current lightweight meal inventory snapshot.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return jsonResource(uri.href, await meals.getInventory());
    },
  );

  server.registerResource(
    'meals-preferences',
    'fluent://meals/preferences',
    {
      title: 'Meals Preferences',
      description: 'Canonical meal-planning preferences for the current Fluent profile.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return jsonResource(uri.href, (await meals.getPreferences()).raw);
    },
  );

  server.registerResource(
    'fluent-meals-plan-by-week',
    new ResourceTemplate('fluent://meals/plans/{week_start}', { list: undefined }),
    {
      title: 'Meal Plan By Week',
      description: 'A meal plan for a specific week start date.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri, params) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return jsonResource(uri.href, await meals.getPlanByWeek(firstTemplateValue(params.week_start)));
    },
  );

  server.registerResource(
    'fluent-meals-recipe',
    new ResourceTemplate('fluent://meals/recipes/{recipe_id}', { list: undefined }),
    {
      title: 'Meal Recipe',
      description: 'A single meal recipe by recipe ID.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri, params) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return jsonResource(uri.href, await meals.getRecipe(firstTemplateValue(params.recipe_id)));
    },
  );

  server.registerResource(
    'fluent-meals-grocery-plan',
    new ResourceTemplate('fluent://meals/grocery-plan/{week_start}', { list: undefined }),
    {
      title: 'Meal Grocery Plan',
      description: 'Retailer-agnostic grocery planning output for a specific week start date.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri, params) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return jsonResource(uri.href, await meals.getGroceryPlan(firstTemplateValue(params.week_start)));
    },
  );

  server.registerResource(
    'fluent-meals-confirmed-order-sync',
    new ResourceTemplate('fluent://meals/confirmed-order-sync/{retailer}/{retailer_order_id}', { list: undefined }),
    {
      title: 'Confirmed Order Sync',
      description: 'The latest canonical sync summary for a confirmed retailer order.',
      mimeType: 'application/json',
      icons: iconFor(origin),
    },
    async (uri, params) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return jsonResource(
        uri.href,
        await meals.getConfirmedOrderSync(
          firstTemplateValue(params.retailer),
          firstTemplateValue(params.retailer_order_id),
        ),
      );
    },
  );

  server.registerTool(
    'meals_list_tools',
    {
      title: 'List Fluent Tools',
      description:
        'List Fluent MCP tool names and starter workflow groups as a discovery fallback when keyword search, deferred core tools, or tool routing are unclear.',
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async () => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return toolResult(await fluentCore.getToolDirectory());
    },
  );

  server.registerTool(
    'meals_get_plan',
    {
      title: 'Get Meal Plan',
      description: 'Fetch the current approved or active meal plan, or a canonical meal plan for a specific week start date.',
      inputSchema: {
        today: z.string().optional(),
        view: readViewSchema,
        week_start: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ today, view, week_start }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const plan = week_start ? await meals.getPlan(week_start) : await meals.getCurrentPlan(today);
      const executionSupportSummary = await meals.getExecutionSupportSummary(week_start ?? today);
      const summary = summarizeMealPlan(plan);
      return toolResult(plan, {
        textData: view === 'full' ? (plan ? { ...plan, executionSupportSummary } : null) : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'meals_list_plan_history',
    {
      title: 'List Meal Plan History',
      description: 'List recent canonical weekly meal plans.',
      inputSchema: {
        limit: z.number().int().min(1).max(52).optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ limit }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const history = await meals.listPlanHistory(limit);
      return toolResult(history, {
        textData: {
          planCount: history.length,
          preview: history.slice(0, 10).map((plan) => ({
            entryCount: plan.entryCount,
            id: plan.id,
            status: plan.status,
            updatedAt: plan.updatedAt,
            weekStart: plan.weekStart,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_get_day_plan',
    {
      title: 'Get Day Meal Plan',
      description: 'Fetch the meals for a specific date.',
      inputSchema: {
        date: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ date }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const entries = await meals.getDayPlan(date);
      return toolResult(entries, {
        textData: {
          date,
          entryCount: entries.length,
          missingRecipes: entries.filter((entry) => !entry.recipeId).length,
          meals: entries.map((entry) => ({
            id: entry.id,
            mealType: entry.mealType,
            recipeId: entry.recipeId,
            recipeNameSnapshot: entry.recipeNameSnapshot,
            status: entry.status,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_get_today_context',
    {
      title: 'Get Today Context',
      description: 'Fetch today’s meals, linked recipe details, and whether feedback is still missing.',
      inputSchema: {
        date: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ date }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const context = await meals.getTodayContext(date);
      return toolResult(context, {
        textData: {
          date: context.date,
          entryCount: context.entries.length,
          executionSupportSummary: context.executionSupportSummary,
          missingFeedbackRecipeIds: context.missingFeedbackRecipeIds,
          planId: context.plan?.id ?? null,
          plannedMeals: context.entries.map((entry) => ({
            id: entry.id,
            feedbackLogged: entry.feedbackLogged,
            mealType: entry.mealType,
            recipeId: entry.recipeId,
            recipeNameSnapshot: entry.recipeNameSnapshot,
            status: entry.status,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_get_recipe',
    {
      title: 'Get Recipe',
      description: 'Fetch a recipe by recipe ID.',
      inputSchema: {
        recipe_id: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ recipe_id }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const recipe = await meals.getRecipe(recipe_id);
      return toolResult(recipe, {
        textData: recipe
          ? {
              id: recipe.id,
              mealType: recipe.mealType,
              name: recipe.name,
              slug: recipe.slug,
              status: recipe.status,
            }
          : null,
      });
    },
  );

  server.registerTool(
    'meals_create_recipe',
    {
      title: 'Create Recipe',
      description: 'Create a canonical meal recipe from a full recipe document.',
      inputSchema: {
        recipe: z.any(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const created = await meals.createRecipe({
        recipe: args.recipe,
        provenance: buildMutationProvenance(authProps, args),
      });
      const ack = buildMutationAck('meal_recipe', created.id, 'recipe.created', new Date().toISOString(), {
        mealType: created.mealType,
        name: created.name,
        status: created.status,
      });
      return toolResult(created, {
        textData: args.response_mode === 'full' ? created : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'meals_list_recipes',
    {
      title: 'List Recipes',
      description: 'List recipes, optionally filtered by meal type.',
      inputSchema: {
        meal_type: z.string().optional(),
        status: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ meal_type, status }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const recipes = await meals.listRecipes(meal_type, status ?? 'active');
      return toolResult(recipes, {
        textData: {
          mealType: meal_type ?? null,
          recipeCount: recipes.length,
          status: status ?? 'active',
          preview: recipes.slice(0, 12).map((recipe) => ({
            id: recipe.id,
            mealType: recipe.mealType,
            name: recipe.name,
            slug: recipe.slug,
            status: recipe.status,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_get_preferences',
    {
      title: 'Get Meals Preferences',
      description: 'Fetch canonical meal-planning preferences.',
      inputSchema: {
        view: readViewSchema,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ view }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const preferences = await meals.getPreferences();
      const summary = summarizeMealPreferences(preferences);
      return toolResult(preferences.raw, {
        textData: view === 'full' ? preferences.raw : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'meals_update_preferences',
    {
      title: 'Update Meals Preferences',
      description: 'Replace the canonical meal-planning preferences document.',
      inputSchema: {
        preferences: z.any(),
        source_snapshot: z.any().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const updated = await meals.updatePreferences({
        preferences: args.preferences,
        provenance: buildMutationProvenance(authProps, args),
        sourceSnapshot: args.source_snapshot,
      });
      const ack = buildMutationAck(
        'meal_preferences',
        `${updated.tenantId}:${updated.profileId}`,
        'preferences.updated',
        updated.updatedAt,
        {
          version: updated.version,
          summary: summarizeMealPreferences(updated),
        },
      );
      return toolResult(updated.raw, {
        textData: args.response_mode === 'full' ? updated.raw : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'meals_upsert_plan',
    {
      title: 'Upsert Meal Plan',
      description: 'Create or replace a canonical weekly meal plan.',
      inputSchema: {
        plan: z.any(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const plan = await meals.upsertPlan({
        plan: args.plan,
        provenance: buildMutationProvenance(authProps, args),
      });
      const summary = summarizeMealPlan(plan);
      const ack = buildMutationAck('meal_plan', plan.id, 'plan.upserted', plan.updatedAt, {
        weekStart: plan.weekStart,
        status: plan.status,
        entryCount: summary?.entryCount ?? plan.entries.length,
      });
      return toolResult(plan, {
        textData: args.response_mode === 'full' ? plan : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'meals_generate_plan',
    {
      title: 'Generate Meal Plan',
      description: 'Generate compact weekly meal-plan candidate summaries from Fluent planner inputs.',
      inputSchema: {
        week_start: z.string(),
        calendar_context: calendarContextSchema.optional(),
        training_context: trainingContextSchema.optional(),
        overrides: z
          .object({
            breakfastCount: z.number().int().min(0).max(7).optional(),
            lunchCount: z.number().int().min(0).max(7).optional(),
            dinnerCount: z.number().int().min(0).max(7).optional(),
            snackCount: z.number().int().min(0).max(7).optional(),
            familyDinnerCount: z.number().int().min(0).max(7).optional(),
            maxTrialMeals: z.number().int().min(0).max(7).optional(),
            includeRecipeIds: z.array(z.string()).optional(),
            excludeRecipeIds: z.array(z.string()).optional(),
            prioritizeInventory: z.boolean().optional(),
          })
          .optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const generation = await meals.generatePlan({
        calendarContext: args.calendar_context,
        trainingContext: normalizeMealsTrainingContextInput(args.training_context),
        weekStart: args.week_start,
        overrides: args.overrides,
        provenance: buildMutationProvenance(authProps, args),
      });
      return toolResult(generation, {
        textData: {
          candidateCount: generation.candidates.length,
          createdAt: generation.createdAt,
          id: generation.id,
          inputHash: generation.inputHash,
          weekStart: generation.weekStart,
          candidatePreview: generation.candidates.slice(0, 4).map((candidate) => ({
            candidateId: candidate.candidateId,
            dinnerCount: candidate.entries.filter((entry) => entry.mealType === 'dinner').length,
            entryCount: candidate.entryCount,
            recipeNamePreview: candidate.recipeNamePreview,
            warningCount: candidate.warnings.length,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_accept_plan_candidate',
    {
      title: 'Accept Meal Plan Candidate',
      description: 'Accept a generated meal-plan candidate and materialize it into the canonical weekly plan.',
      inputSchema: {
        generation_id: z.string(),
        candidate_id: z.string(),
        input_hash: z.string(),
        calendar_context: calendarContextSchema.optional(),
        training_context: trainingContextSchema.optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const plan = await meals.acceptPlanCandidate({
        generationId: args.generation_id,
        candidateId: args.candidate_id,
        inputHash: args.input_hash,
        calendarContext: args.calendar_context,
        trainingContext: normalizeMealsTrainingContextInput(args.training_context),
        provenance: buildMutationProvenance(authProps, args),
      });
      const summary = summarizeMealPlan(plan);
      const ack = buildMutationAck('meal_plan', plan.id, 'plan_candidate.accepted', plan.updatedAt, {
        weekStart: plan.weekStart,
        status: plan.status,
        entryCount: summary?.entryCount ?? plan.entries.length,
      });
      return toolResult(plan, {
        textData: args.response_mode === 'full' ? plan : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'meals_get_inventory',
    {
      title: 'Get Inventory',
      description: 'Fetch the current meal inventory.',
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async () => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const inventory = await meals.getInventory();
      const byLocation = inventory.reduce<Record<string, number>>((counts, item) => {
        const key = item.location ?? 'unknown';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      const byStatus = inventory.reduce<Record<string, number>>((counts, item) => {
        const key = item.status ?? 'unknown';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      return toolResult(inventory, {
        textData: {
          inventoryCount: inventory.length,
          byLocation,
          byStatus,
          preview: inventory.slice(0, 12).map((item) => ({
            estimatedExpiry: item.estimatedExpiry,
            id: item.id,
            location: item.location,
            name: item.name,
            quantity: item.quantity,
            status: item.status,
            unit: item.unit,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_get_inventory_summary',
    {
      title: 'Get Inventory Summary',
      description: 'Fetch a compact inventory summary including status counts and near-expiry items.',
      inputSchema: {
        today: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ today }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return toolResult(await meals.getInventorySummary(today));
    },
  );

  server.registerTool(
    'meals_get_meal_memory',
    {
      title: 'Get Meal Memory',
      description: 'Fetch meal memory for all recipes or a single recipe.',
      inputSchema: {
        recipe_id: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ recipe_id }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const mealMemory = await meals.getMealMemory(recipe_id);
      return toolResult(mealMemory, {
        textData: {
          memoryCount: mealMemory.length,
          recipeId: recipe_id ?? null,
          preview: mealMemory.slice(0, 12).map((entry) => ({
            lastUsedAt: entry.lastUsedAt,
            recipeId: entry.recipeId,
            status: entry.status,
            updatedAt: entry.updatedAt,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_list_feedback',
    {
      title: 'List Meal Feedback',
      description: 'Fetch recent meal feedback, optionally filtered by recipe or date.',
      inputSchema: {
        date: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        recipe_id: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ date, limit, recipe_id }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const feedback = await meals.listMealFeedback({ date, limit, recipeId: recipe_id });
      return toolResult(feedback, {
        textData: {
          date: date ?? null,
          feedbackCount: feedback.length,
          recipeId: recipe_id ?? null,
          preview: feedback.slice(0, 12).map((entry) => ({
            date: entry.date,
            familyAcceptance: entry.familyAcceptance,
            id: entry.id,
            recipeId: entry.recipeId,
            repeatAgain: entry.repeatAgain,
            taste: entry.taste,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_patch_recipe',
    {
      title: 'Patch Recipe',
      description: 'Apply a JSON Patch mutation to a canonical recipe document and sync the indexed recipe columns.',
      inputSchema: {
        recipe_id: z.string(),
        operations: z.array(
          z.object({
            op: z.enum(['add', 'remove', 'replace']),
            path: z.string(),
            value: z.any().optional(),
          }),
        ),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const recipe = await meals.patchRecipe({
        recipeId: args.recipe_id,
        operations: args.operations,
        provenance: buildMutationProvenance(authProps, args),
      });
      const ack = buildMutationAck('meal_recipe', recipe.id, 'recipe.patched', new Date().toISOString(), {
        operationCount: args.operations.length,
        pathPreview: args.operations.map((operation) => operation.path).slice(0, 8),
      });
      return toolResult(recipe, {
        textData: args.response_mode === 'full' ? recipe : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'meals_log_feedback',
    {
      title: 'Log Feedback',
      description: 'Persist meal feedback and update meal memory status for the recipe.',
      inputSchema: {
        recipe_id: z.string(),
        date: z.string().optional(),
        meal_plan_id: z.string().optional(),
        meal_plan_entry_id: z.string().optional(),
        taste: z.enum(['good', 'okay', 'bad']).optional(),
        difficulty: z.enum(['good', 'okay', 'bad']).optional(),
        time_reality: z.enum(['good', 'okay', 'bad']).optional(),
        repeat_again: z.enum(['good', 'okay', 'bad']).optional(),
        family_acceptance: z.enum(['good', 'okay', 'bad']).optional(),
        notes: z.string().optional(),
        submitted_by: z.string().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.logFeedback({
          recipeId: args.recipe_id,
          date: args.date,
          mealPlanId: args.meal_plan_id,
          mealPlanEntryId: args.meal_plan_entry_id,
          taste: args.taste,
          difficulty: args.difficulty,
          timeReality: args.time_reality,
          repeatAgain: args.repeat_again,
          familyAcceptance: args.family_acceptance,
          notes: args.notes,
          submittedBy: args.submitted_by,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'meals_mark_meal_cooked',
    {
      title: 'Mark Meal Cooked',
      description:
        'Mark a planned meal entry as cooked for the current or specified date, including pulling a later-in-the-week meal forward and refreshing the remaining schedule when needed.',
      inputSchema: {
        meal_plan_entry_id: z.string().optional(),
        recipe_id: z.string().optional(),
        date: z.string().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.markMealCooked({
          mealPlanEntryId: args.meal_plan_entry_id,
          recipeId: args.recipe_id,
          date: args.date,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'meals_update_inventory',
    {
      title: 'Update Inventory',
      description:
        'Create or update pantry, fridge, freezer, or household inventory for one ingredient or grocery item, including quantity, unit, location, and stock state.',
      inputSchema: {
        name: z.string(),
        status: z.string().optional(),
        source: z.string().optional(),
        confirmed_at: z.string().optional(),
        purchased_at: z.string().optional(),
        estimated_expiry: z.string().optional(),
        perishability: z.string().optional(),
        long_life_default: z.boolean().optional(),
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
        location: z.string().optional(),
        brand: z.string().optional(),
        cost_cad: z.number().min(0).optional(),
        metadata: z.any().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.updateInventory({
          name: args.name,
          status: args.status,
          source: args.source,
          confirmedAt: args.confirmed_at,
          purchasedAt: args.purchased_at,
          estimatedExpiry: args.estimated_expiry,
          perishability: args.perishability,
          longLifeDefault: args.long_life_default,
          quantity: args.quantity,
          unit: args.unit,
          location: args.location,
          brand: args.brand,
          costCad: args.cost_cad,
          metadata: args.metadata,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'meals_delete_inventory_item',
    {
      title: 'Delete Inventory Item',
      description:
        'Permanently delete an inventory item by name or inventory key to remove typos, duplicates, test entries, or stale ghost rows from D1.',
      inputSchema: {
        name: z.string(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.deleteInventoryItem({
          name: args.name,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'meals_update_inventory_batch',
    {
      title: 'Update Inventory Batch',
      description:
        'Atomically create or update multiple pantry, fridge, freezer, or household inventory items in one batch for receipt imports or bulk grocery updates.',
      inputSchema: {
        items: z.array(
          z.object({
            name: z.string(),
            status: z.string().optional(),
            source: z.string().optional(),
            confirmed_at: z.string().optional(),
            purchased_at: z.string().optional(),
            estimated_expiry: z.string().optional(),
            perishability: z.string().optional(),
            long_life_default: z.boolean().optional(),
            quantity: z.number().positive().optional(),
            unit: z.string().optional(),
            location: z.string().optional(),
            brand: z.string().optional(),
            cost_cad: z.number().min(0).optional(),
            metadata: z.any().optional(),
          }),
        ),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const result = await meals.updateInventoryBatch({
        items: args.items.map((item) => ({
          brand: item.brand,
          confirmedAt: item.confirmed_at,
          costCad: item.cost_cad,
          estimatedExpiry: item.estimated_expiry,
          location: item.location,
          longLifeDefault: item.long_life_default,
          metadata: item.metadata,
          name: item.name,
          perishability: item.perishability,
          purchasedAt: item.purchased_at,
          quantity: item.quantity,
          source: item.source,
          status: item.status,
          unit: item.unit,
        })),
        provenance: buildMutationProvenance(authProps, args),
      });
      const ack = buildMutationAck(
        'meal_inventory_batch',
        `inventory-batch:${result.itemsProcessed}`,
        'inventory.batch_updated',
        new Date().toISOString(),
        {
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          itemsProcessed: result.itemsProcessed,
          items: result.items,
        },
      );
      return toolResult(result, {
        textData: args.response_mode === 'full' ? result.records : ack,
        structuredContent: args.response_mode === 'full' ? undefined : ack,
      });
    },
  );

  server.registerTool(
    'meals_record_plan_review',
    {
      title: 'Record Plan Review',
      description: 'Persist a short weekly review for a meal plan.',
      inputSchema: {
        meal_plan_id: z.string().optional(),
        week_start: z.string().optional(),
        summary: z.string().optional(),
        worked: z.array(z.string()).optional(),
        skipped: z.array(z.string()).optional(),
        next_changes: z.array(z.string()).optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.recordPlanReview({
          mealPlanId: args.meal_plan_id,
          weekStart: args.week_start,
          summary: args.summary,
          worked: args.worked,
          skipped: args.skipped,
          nextChanges: args.next_changes,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'meals_list_grocery_intents',
    {
      title: 'List Grocery Intents',
      description:
        'Fetch the current grocery-intent queue for upcoming orders, buy-later items, replacement ingredients, and shopping follow-ups.',
      inputSchema: {
        status: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ status }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const intents = await meals.listGroceryIntents(status);
      const byStatus = intents.reduce<Record<string, number>>((counts, intent) => {
        const key = intent.status ?? 'unknown';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      return toolResult(intents, {
        textData: {
          intentCount: intents.length,
          requestedStatus: status ?? null,
          byStatus,
          preview: intents.slice(0, 12).map((intent) => ({
            displayName: intent.displayName,
            id: intent.id,
            quantity: intent.quantity,
            status: intent.status,
            targetWindow: intent.targetWindow,
            unit: intent.unit,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_generate_grocery_plan',
    {
      title: 'Generate Grocery Plan',
      description:
        'Generate and persist a retailer-agnostic grocery shopping plan for a meal-plan week, including items to buy and pantry items to verify before shopping.',
      inputSchema: {
        week_start: z.string().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const plan = await meals.generateGroceryPlan({
        weekStart: args.week_start,
        provenance: buildMutationProvenance(authProps, args),
      });
      const summary = summarizeGroceryPlan(plan);
      const ack = buildMutationAck('meal_grocery_plan', plan.id, 'grocery_plan.generated', plan.generatedAt, {
        weekStart: plan.weekStart,
        itemCount: summary?.itemCount ?? plan.raw.items.length,
        pantryCheckCount: summary?.pantryCheckCount ?? 0,
        unresolvedCount: summary?.unresolvedCount ?? 0,
      });
      return toolResult(plan, {
        textData: args.response_mode === 'full' ? plan : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'meals_get_grocery_plan',
    {
      title: 'Get Grocery Plan',
      description:
        'Fetch a persisted retailer-agnostic grocery shopping plan for a meal-plan week, including buy-list items, pantry checks, substitutions, and resolved grocery actions.',
      inputSchema: {
        week_start: z.string(),
        view: readViewSchema,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ week_start, view }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const groceryPlan = await meals.getGroceryPlan(week_start);
      const summary = summarizeGroceryPlan(groceryPlan);
      return toolResult(groceryPlan, {
        textData: view === 'full' ? groceryPlan : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'meals_prepare_order',
    {
      title: 'Prepare Grocery Order',
      description:
        'Reconcile a grocery plan against current inventory and optional retailer cart items to produce a safe remaining-to-buy order preflight.',
      inputSchema: {
        week_start: z.string(),
        retailer: z.string().nullable().optional(),
        retailer_cart_items: z
          .array(
            z.object({
              title: z.string(),
              quantity: z.number().positive().nullable().optional(),
            }),
          )
          .optional(),
        view: readViewSchema,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ retailer, retailer_cart_items, view, week_start }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const prepared = await meals.prepareOrder({
        retailer,
        retailerCartItems: retailer_cart_items,
        weekStart: week_start,
      });
      const summary = summarizePreparedOrder(prepared);
      return toolResult(prepared, {
        textData: view === 'full' ? prepared : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'meals_list_grocery_plan_actions',
    {
      title: 'List Grocery Plan Actions',
      description:
        'List persisted grocery item actions for a specific meal-planning week, including purchased, skipped, confirmed pantry checks, pantry sufficiency confirmations, substitutions, swaps, replacements, and need-to-buy resolutions.',
      inputSchema: {
        week_start: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ week_start }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const actions = await meals.listGroceryPlanActions(week_start);
      const byStatus = actions.reduce<Record<string, number>>((counts, action) => {
        const key = action.actionStatus ?? 'unknown';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      return toolResult(actions, {
        textData: {
          actionCount: actions.length,
          byStatus,
          weekStart: week_start,
          preview: actions.slice(0, 12).map((action) => ({
            actionStatus: action.actionStatus,
            id: action.id,
            itemKey: action.itemKey,
            substituteDisplayName: action.substituteDisplayName,
            updatedAt: action.updatedAt,
          })),
        },
      });
    },
  );

  server.registerTool(
    'meals_upsert_grocery_plan_action',
    {
      title: 'Upsert Grocery Plan Action',
      description:
        'Persist a grocery item resolution for a grocery-plan line, including mark purchased, skip item, confirm pantry stock, record a pantry sufficiency confirmation, mark need to buy, or substitute, swap, or replace one ingredient with another.',
      inputSchema: {
        week_start: z.string(),
        item_key: z.string(),
        action_status: z.enum([
          'purchased',
          'skipped',
          'substituted',
          'confirmed',
          'needs_purchase',
          'have_enough',
          'have_some_need_to_buy',
          'dont_have_it',
        ]),
        meal_plan_id: z.string().optional(),
        substitute_item_key: z.string().optional(),
        substitute_display_name: z.string().optional(),
        create_substitute_intent: z.boolean().optional(),
        substitute_quantity: z.number().positive().optional(),
        substitute_unit: z.string().optional(),
        intent_notes: z.string().optional(),
        notes: z.string().optional(),
        purchased_at: z.string().optional(),
        metadata: z.any().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const result = await meals.upsertGroceryPlanAction({
        actionStatus: args.action_status,
        createSubstituteIntent: args.create_substitute_intent,
        intentNotes: args.intent_notes,
        itemKey: args.item_key,
        mealPlanId: args.meal_plan_id,
        metadata: args.metadata,
        notes: args.notes,
        purchasedAt: args.purchased_at,
        substituteDisplayName: args.substitute_display_name,
        substituteItemKey: args.substitute_item_key,
        substituteQuantity: args.substitute_quantity,
        substituteUnit: args.substitute_unit,
        weekStart: args.week_start,
        provenance: buildMutationProvenance(authProps, args),
      });
      const ack = buildMutationAck(
        'meal_grocery_plan_action',
        result.action.id,
        args.action_status === 'substituted' ? 'grocery_item.substituted' : 'grocery_plan_action.upserted',
        result.action.updatedAt,
        {
          itemKey: result.action.itemKey,
          actionStatus: result.action.actionStatus,
          substituteDisplayName: result.action.substituteDisplayName,
          substituteIntentId: result.substituteIntent?.id ?? null,
          weekStart: result.action.weekStart,
          groceryPlanItemCount: result.groceryPlan?.raw.items.length ?? null,
          resolvedCount: result.groceryPlan?.raw.resolvedItems.length ?? null,
        },
      );
      return toolResult(result, {
        textData: args.response_mode === 'full' ? result : ack,
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
      });
    },
  );

  server.registerTool(
    'meals_delete_grocery_plan_action',
    {
      title: 'Delete Grocery Plan Action',
      description:
        'Delete a persisted grocery-plan item action for a specific week and item key so a purchased, skipped, pantry-confirmed, pantry-sufficiency, or substituted grocery line returns to the active plan.',
      inputSchema: {
        week_start: z.string(),
        item_key: z.string(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.deleteGroceryPlanAction({
          itemKey: args.item_key,
          weekStart: args.week_start,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'meals_upsert_grocery_intent',
    {
      title: 'Upsert Grocery Intent',
      description:
        'Create or update a grocery intent for the next order, buy list, replacement ingredient, or explicit need-to-buy item.',
      inputSchema: {
        id: z.string().optional(),
        display_name: z.string(),
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
        notes: z.string().optional(),
        status: z.string().optional(),
        target_window: z.string().optional(),
        meal_plan_id: z.string().optional(),
        metadata: z.any().optional(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.upsertGroceryIntent({
          id: args.id,
          displayName: args.display_name,
          quantity: args.quantity,
          unit: args.unit,
          notes: args.notes,
          status: args.status,
          targetWindow: args.target_window,
          mealPlanId: args.meal_plan_id,
          metadata: args.metadata,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );

  server.registerTool(
    'meals_delete_grocery_intent',
    {
      title: 'Delete Grocery Intent',
      description:
        'Soft-delete or remove a grocery intent from the next-order queue when an item no longer needs to be bought.',
      inputSchema: {
        id: z.string(),
        ...provenanceInputSchema,
      },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      return toolResult(
        await meals.deleteGroceryIntent({
          id: args.id,
          provenance: buildMutationProvenance(authProps, args),
        }),
      );
    },
  );
}


