import { createHash } from 'node:crypto';
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
import type { GroceryIntentRecord, GroceryPlanRecord, PreparedOrderRecord } from './domains/meals/service';
import {
  buildRecipeCardMetadata,
  buildRecipeCardStructuredContent,
  buildRecipeCardViewModel,
  getRecipeCardWidgetHtml,
  MEALS_RECIPE_CARD_TEMPLATE_URI,
} from './domains/meals/recipe-card';
import {
  buildEmptyGroceryListViewModel,
  buildGroceryListMetadata,
  buildGroceryListStructuredContent,
  getGrocerySmokeWidgetHtml,
  getGroceryListWidgetHtml,
  MEALS_GROCERY_LIST_TEMPLATE_URI,
  MEALS_GROCERY_SMOKE_TEMPLATE_URI,
  type GroceryListActionViewModel,
  type GroceryListItemViewModel,
  type GroceryListViewModel,
} from './domains/meals/grocery-list';
import { firstTemplateValue, iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult, writeResponseModeSchema } from './mcp-shared';

const calendarMealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
function buildClaudeWidgetDomain(origin: string) {
  return `${createHash('sha256').update(origin).digest('hex').slice(0, 32)}.claudemcpcontent.com`;
}

function buildWidgetMeta(description: string, origin: string) {
  return {
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: [],
    },
    'openai/widgetDescription': description,
    'openai/widgetDomain': origin,
    'openai/widgetPrefersBorder': true,
    ui: {
      csp: {
        connectDomains: [],
        resourceDomains: [],
      },
      domain: buildClaudeWidgetDomain(origin),
      prefersBorder: true,
    },
  } as const;
}
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
  const recipeCardWidgetMeta = buildWidgetMeta(
    'Fluent recipe card for a saved meal recipe, with ingredients, steps, and cook mode.',
    origin,
  );
  const groceryListWidgetMeta = buildWidgetMeta(
    'Fluent grocery checklist for the current week, with To buy, Verify quantity, Check pantry, and quick sync actions.',
    origin,
  );

  server.registerResource(
    'fluent-meals-recipe-card-widget',
    MEALS_RECIPE_CARD_TEMPLATE_URI,
    {
      title: 'Recipe Card Widget',
      description: 'Rich recipe card for a saved Fluent meal recipe.',
      mimeType: 'text/html;profile=mcp-app',
      icons: iconFor(origin),
      _meta: recipeCardWidgetMeta,
    },
    async () => ({
      contents: [
        {
          uri: MEALS_RECIPE_CARD_TEMPLATE_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: getRecipeCardWidgetHtml(),
          _meta: recipeCardWidgetMeta,
        },
      ],
    }),
  );

  server.registerResource(
    'fluent-meals-grocery-list-widget-v2',
    MEALS_GROCERY_LIST_TEMPLATE_URI,
    {
      title: 'Grocery List Widget',
      description: 'Rich grocery checklist for a Fluent meal-planning week.',
      mimeType: 'text/html;profile=mcp-app',
      icons: iconFor(origin),
      _meta: groceryListWidgetMeta,
    },
    async () => ({
      contents: [
        {
          uri: MEALS_GROCERY_LIST_TEMPLATE_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: getGroceryListWidgetHtml(),
          _meta: groceryListWidgetMeta,
        },
      ],
    }),
  );

  const grocerySmokeWidgetMeta = buildWidgetMeta(
    'Static Fluent grocery smoke widget for ChatGPT host verification.',
    origin,
  );

  server.registerResource(
    'fluent-meals-grocery-smoke-widget',
    MEALS_GROCERY_SMOKE_TEMPLATE_URI,
    {
      title: 'Grocery Smoke Widget',
      description: 'Static grocery smoke widget for ChatGPT host verification.',
      mimeType: 'text/html;profile=mcp-app',
      icons: iconFor(origin),
      _meta: grocerySmokeWidgetMeta,
    },
    async () => ({
      contents: [
        {
          uri: MEALS_GROCERY_SMOKE_TEMPLATE_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: getGrocerySmokeWidgetHtml(),
          _meta: grocerySmokeWidgetMeta,
        },
      ],
    }),
  );

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
      description:
        'Fetch today’s meals, linked recipe details, and whether feedback is still missing. Use this only for today-plan questions (e.g., what am I eating today). Do not use this to answer “which recipe is X” or other recipe-disambiguation prompts.',
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
      title: 'Get Recipe Data',
      description:
        'Fetch canonical recipe data by recipe ID. Use this for raw recipe details, ingredient extraction, editing, patching, or hosts that render first-party recipe visuals themselves. In ChatGPT app surfaces and other hosts that support Fluent MCP widgets, if the user wants to show, view, open, or pull up the recipe, prefer meals_render_recipe_card instead of this raw data tool.',
      inputSchema: {
        recipe_id: z.string().optional(),
        id: z.string().optional(),
        slug: z.string().optional(),
        view: readViewSchema,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ id, recipe_id, slug, view }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const resolvedRecipeId = await resolveMealRecipeLookupKey(meals, {
        id,
        recipe_id,
        slug,
      });
      const recipe = resolvedRecipeId ? await meals.getRecipe(resolvedRecipeId) : null;
      const summary = recipe
        ? {
            id: recipe.id,
            mealType: recipe.mealType,
            name: recipe.name,
            slug: recipe.slug,
            status: recipe.status,
          }
        : null;
      if (view === 'summary') {
        return toolResult(recipe, {
          textData: summary,
          structuredContent: summary,
        });
      }

      const viewModel = buildRecipeCardViewModel(recipe);
      return toolResult(recipe, {
        meta: viewModel ? buildRecipeCardMetadata(viewModel) : undefined,
        textData: recipe,
      });
    },
  );

  const renderRecipeCardHandler = async ({
    id,
    recipe_id,
    recipeId,
    slug,
  }: {
    id?: string;
    recipe_id?: string;
    recipeId?: string;
    slug?: string;
  }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const resolvedRecipeId = await resolveMealRecipeLookupKey(meals, {
        id,
        recipe_id,
        recipeId,
        slug,
      });
      const recipe = resolvedRecipeId ? await meals.getRecipe(resolvedRecipeId) : null;
      const viewModel = buildRecipeCardViewModel(recipe);

      if (!viewModel) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Recipe not found for id ${resolvedRecipeId ?? recipe_id ?? recipeId ?? id ?? slug ?? 'unknown'}.`,
            },
          ],
          isError: true,
          structuredContent: {
            code: 'recipe_not_found',
            recipeId: resolvedRecipeId ?? recipe_id ?? recipeId ?? id ?? slug ?? null,
          },
        };
      }

      const structuredContent = buildRecipeCardStructuredContent(viewModel);
      return {
        _meta: buildRecipeCardMetadata(viewModel),
        content: [
          {
            type: 'text' as const,
            text: `Showing the recipe card for ${viewModel.title}.`,
          },
        ],
        structuredContent,
      };
    };

  const registerRenderRecipeCardTool = (
    toolName: 'meals_render_recipe_card' | 'meals_show_recipe',
    options?: { preferredAlias?: boolean },
  ) =>
    server.registerTool(
      toolName,
      {
        title: options?.preferredAlias
          ? 'Show Recipe (ChatGPT/App SDK Widget)'
          : 'Show Recipe Card (ChatGPT/App SDK Widget)',
        description: options?.preferredAlias
          ? 'Show a saved Fluent recipe as a rich Fluent widget only in hosts that support MCP output templates, such as ChatGPT app surfaces. Prefer this for ordinary prompts like "show me the recipe for X", "open this recipe", or "pull up that recipe" in ChatGPT. Do not use this in Claude.ai, Claude Code, or other first-party visual hosts; there, prefer meals_get_recipe and let the host render its own recipe visual or recipe_display_v0.'
          : 'Show a saved Fluent recipe as a rich Fluent widget only in hosts that support MCP output templates, such as ChatGPT app surfaces. Prefer this when the user says show, open, view, or pull up a recipe in those hosts, including prompts like "show me the recipe for X." Do not use this in Claude.ai, Claude Code, or other first-party visual hosts; there, prefer meals_get_recipe and let the host render its own recipe visual or recipe_display_v0.',
        inputSchema: {
          recipe_id: z.string().optional(),
          recipeId: z.string().optional(),
          id: z.string().optional(),
          slug: z.string().optional(),
        },
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
        },
        _meta: {
          ui: {
            resourceUri: MEALS_RECIPE_CARD_TEMPLATE_URI,
          },
          'openai/outputTemplate': MEALS_RECIPE_CARD_TEMPLATE_URI,
          'openai/toolInvocation/invoked': 'Recipe card ready.',
          'openai/toolInvocation/invoking': options?.preferredAlias ? 'Opening recipe…' : 'Opening recipe card…',
        },
      },
      renderRecipeCardHandler,
    );

  registerRenderRecipeCardTool('meals_render_recipe_card');
  registerRenderRecipeCardTool('meals_show_recipe', { preferredAlias: true });

  const registerRenderGroceryListTool = (toolName: 'meals_render_grocery_list' | 'meals_render_grocery_list_v2', options?: { deprecatedAlias?: boolean }) =>
    server.registerTool(
      toolName,
      {
        title: options?.deprecatedAlias
          ? 'Show Grocery Checklist (Legacy ChatGPT/App SDK Alias)'
          : 'Show Grocery Checklist (ChatGPT/App SDK Widget)',
        description: options?.deprecatedAlias
          ? 'Legacy alias for showing the user\'s real Fluent grocery checklist only in hosts that support MCP output templates, such as ChatGPT app surfaces. Do not use this in Claude.ai, Claude Code, or other first-party visual hosts; there, prefer meals_get_grocery_plan and let the host render with its own visualizer. Do not use this for standalone smoke tests, host verification, widget debugging, or standalone widget prompts.'
          : 'Show the user\'s real Fluent grocery checklist for the active week only in hosts that support Fluent MCP output templates, such as ChatGPT app surfaces. Use this for ordinary grocery-list asks when the user wants a rich checklist with To buy, Verify quantity, and Check pantry sections in those hosts. Do not use this in Claude.ai, Claude Code, or other first-party visual hosts; there, prefer canonical grocery data from meals_get_grocery_plan and let the host render with its own visualizer. Do not use this for standalone smoke tests, host verification, widget debugging, or standalone widget prompts.',
        inputSchema: {
          week_start: z.string().optional(),
          weekStart: z.string().optional(),
        },
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
        },
        _meta: {
          ui: {
            resourceUri: MEALS_GROCERY_LIST_TEMPLATE_URI,
          },
          'openai/outputTemplate': MEALS_GROCERY_LIST_TEMPLATE_URI,
          'openai/toolInvocation/invoked': 'Grocery checklist ready.',
          'openai/toolInvocation/invoking': 'Opening grocery checklist…',
          'openai/widgetAccessible': true,
        },
      },
      async ({ week_start, weekStart }) => {
        requireScope(FLUENT_MEALS_READ_SCOPE);
        const resolvedWeekStart = await resolveMealsGroceryWeekStart(meals, week_start ?? weekStart);
        const groceryPlan = await meals.getGroceryPlan(resolvedWeekStart);
        const intents = await meals.listGroceryIntents();
        const prepared = groceryPlan
          ? await meals.prepareOrder({
              weekStart: resolvedWeekStart,
            })
          : null;
        const viewModel = buildGroceryListViewModel({
          groceryPlan,
          intents,
          prepared,
          weekStart: resolvedWeekStart,
        });

        if (!viewModel) {
          const emptyViewModel = buildEmptyGroceryListViewModel(resolvedWeekStart);
          return {
            _meta: buildGroceryListMetadata(emptyViewModel),
            content: [
              {
                type: 'text' as const,
                text: `Your grocery list is empty for the week of ${resolvedWeekStart}.`,
              },
            ],
            structuredContent: {
              ...buildGroceryListStructuredContent(emptyViewModel),
              hasData: false,
            },
          };
        }

        const structuredContent = buildGroceryListStructuredContent(viewModel);
        return {
          _meta: buildGroceryListMetadata(viewModel),
          content: [
            {
              type: 'text' as const,
              text: `Showing the grocery list for the week of ${viewModel.weekStart}.`,
            },
          ],
          structuredContent,
        };
      },
    );

  registerRenderGroceryListTool('meals_render_grocery_list_v2');

  registerRenderGroceryListTool('meals_render_grocery_list', { deprecatedAlias: true });

  server.registerTool(
    'meals_render_grocery_widget_smoke',
    {
      title: 'Render Standalone Grocery Widget',
      description:
        'Render a standalone static grocery widget for ChatGPT host verification. Prefer this for prompts about a standalone grocery widget, grocery widget smoke test, host verification, or widget debugging. Use this instead of the real grocery list whenever the user asks for a standalone or verification widget.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
        _meta: {
          ui: {
            resourceUri: MEALS_GROCERY_SMOKE_TEMPLATE_URI,
          },
          'openai/outputTemplate': MEALS_GROCERY_SMOKE_TEMPLATE_URI,
          'openai/toolInvocation/invoked': 'Standalone grocery smoke widget ready.',
          'openai/toolInvocation/invoking': 'Building standalone grocery smoke widget…',
        },
      },
    async () => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      return {
        _meta: {
          experience: 'grocery_widget_smoke_tool',
          version: 'v1',
        },
        content: [
          {
            type: 'text' as const,
            text: 'Showing the standalone grocery smoke widget.',
          },
        ],
        structuredContent: {
          experience: 'grocery_widget_smoke_tool',
          title: 'Standalone grocery smoke widget',
          version: 'v1',
        },
      };
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
      description:
        'List recipe candidates for discovery, optionally filtered by meal type. Use this for recipe disambiguation (e.g., “which one is X”) and to find recipe IDs and names, then call meals_get_recipe for the actual recipe details.',
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
      const summary = {
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
      };
      return toolResult(recipes, {
        textData: summary,
        structuredContent: summary,
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
            pinnedMeals: z
              .array(
                z.object({
                  date: z.string(),
                  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
                  recipeId: z.string(),
                }),
              )
              .optional(),
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
        'Fetch the underlying grocery-plan document for a meal-plan week, including buy-list items, pantry checks, substitutions, and resolved grocery actions. Prefer this for audit/debugging, when the user explicitly wants the raw plan data, and as the canonical grocery source for Claude.ai, Claude Code, and other hosts that can render first-party checklist visuals. In hosts that explicitly support Fluent MCP widgets, ordinary grocery-list asks can instead use meals_render_grocery_list_v2.',
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
        'Persist a grocery item resolution for a grocery-plan line, including mark purchased, track already in cart, skip item, confirm pantry stock, record a pantry sufficiency confirmation, mark need to buy, or substitute, swap, or replace one ingredient with another.',
      inputSchema: {
        week_start: z.string(),
        item_key: z.string(),
        action_status: z.enum([
          'purchased',
          'in_cart',
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
      _meta: {
        'openai/widgetAccessible': true,
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
        'Delete a persisted grocery-plan item action for a specific week and item key so a purchased, in-cart, skipped, pantry-confirmed, pantry-sufficiency, or substituted grocery line returns to the active plan.',
      inputSchema: {
        week_start: z.string(),
        item_key: z.string(),
        ...provenanceInputSchema,
      },
      _meta: {
        'openai/widgetAccessible': true,
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
      _meta: {
        'openai/widgetAccessible': true,
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

async function resolveMealRecipeLookupKey(
  meals: MealsService,
  input: {
    id?: string;
    recipe_id?: string;
    recipeId?: string;
    slug?: string;
  },
): Promise<string | null> {
  if (input.recipe_id?.trim()) {
    return input.recipe_id.trim();
  }

  if (input.recipeId?.trim()) {
    return input.recipeId.trim();
  }

  if (input.id?.trim()) {
    return input.id.trim();
  }

  if (!input.slug?.trim()) {
    return null;
  }

  const slug = input.slug.trim();
  const recipes = await meals.listRecipes(undefined, 'active');
  const normalizedSlug = slug.toLowerCase();
  const exactMatch = recipes.find((recipe) => {
    const recipeSlug = recipe.slug?.toLowerCase?.() ?? '';
    const recipeId = recipe.id?.toLowerCase?.() ?? '';
    return recipeSlug === normalizedSlug || recipeId === normalizedSlug;
  });
  if (exactMatch) {
    return exactMatch.id;
  }

  const suffixMatches = recipes.filter((recipe) => {
    const recipeSlug = recipe.slug?.toLowerCase?.() ?? '';
    const recipeId = recipe.id?.toLowerCase?.() ?? '';
    return recipeSlug.endsWith(`-${normalizedSlug}`) || recipeId.endsWith(`-${normalizedSlug}`);
  });
  const match = suffixMatches.length === 1 ? suffixMatches[0] : null;
  return match?.id ?? slug;
}

async function resolveMealsGroceryWeekStart(meals: MealsService, explicitWeekStart?: string): Promise<string> {
  if (explicitWeekStart?.trim()) {
    return explicitWeekStart.trim();
  }

  const currentPlan = await meals.getCurrentPlan();
  if (currentPlan?.weekStart) {
    return currentPlan.weekStart;
  }

  return startOfWeekIso(new Date());
}

function startOfWeekIso(date: Date): string {
  const clone = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = clone.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setUTCDate(clone.getUTCDate() + diff);
  return clone.toISOString().slice(0, 10);
}

function buildGroceryListViewModel(input: {
  groceryPlan: GroceryPlanRecord | null;
  intents: GroceryIntentRecord[];
  prepared: PreparedOrderRecord | null;
  weekStart: string;
}): GroceryListViewModel | null {
  const currentPlanId = input.groceryPlan?.mealPlanId ?? null;
  const itemsByKey = new Map<string, GroceryListItemAccumulator>();

  const preparedNeedNames = new Set((input.prepared?.remainingToBuy ?? []).map((entry) => normalizeGroceryListText(entry.displayName)));
  const preparedVerifyNames = new Set((input.prepared?.unresolvedItems ?? []).map((entry) => normalizeGroceryListText(entry.displayName)));
  const preparedCoveredNames = new Set((input.prepared?.alreadyCoveredByInventory ?? []).map((entry) => normalizeGroceryListText(entry.displayName)));

  const registerPlanItem = (
    item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
    initialBucket: GroceryListItemViewModel['bucket'],
  ) => {
    const mergeKey = buildGroceryMergeKey(item.canonicalItemKey ?? null, item.name);
    const existing = itemsByKey.get(mergeKey) ?? createEmptyAccumulator(mergeKey, item.name);
    const bucket = resolvePlanBucket(item, initialBucket, preparedNeedNames, preparedVerifyNames, preparedCoveredNames);
    const actions = buildPlanItemActions(input.weekStart, item, bucket);

    existing.displayName = choosePreferredName(existing.displayName, item.name);
    mergeMeasurement(existing.measurements, item.canonicalQuantity ?? item.quantity ?? null, item.canonicalUnit ?? item.unit ?? null);
    existing.bucket = mergeBucket(existing.bucket, bucket);
    existing.brandHint = chooseBrandHint(existing.brandHint, item.preferredBrands);
    existing.note = mergeSentence(existing.note, item.note ?? null);
    existing.reason = mergeSentence(existing.reason, synthesizePlanReason(item, bucket));
    existing.provenanceLabel = null;
    existing.isManual = false;
    existing.manualIntentId = null;
    existing.actions = actions;
    mergeRecipeSources(existing, item.sourceRecipeIds, item.sourceRecipeNames);

    itemsByKey.set(mergeKey, existing);
  };

  for (const item of input.groceryPlan?.raw.items ?? []) {
    registerPlanItem(item, 'need_to_buy');
  }

  for (const item of input.groceryPlan?.raw.resolvedItems ?? []) {
    registerPlanItem(item, 'covered');
  }

  for (const intent of input.intents) {
    if (!shouldIncludeIntent(intent, input.weekStart, currentPlanId)) {
      continue;
    }

    const mergeKey = buildGroceryMergeKey(null, intent.displayName);
    const existing = itemsByKey.get(mergeKey) ?? createEmptyAccumulator(mergeKey, intent.displayName);
    const bucket = resolveIntentBucket(intent);

    existing.displayName = choosePreferredName(existing.displayName, intent.displayName);
    mergeMeasurement(existing.measurements, intent.quantity, intent.unit ?? null);
    existing.bucket = mergeBucket(existing.bucket, bucket);
    existing.note = mergeSentence(existing.note, intent.notes);
    existing.reason = existing.reason ?? null;
    existing.provenanceLabel = existing.recipes.length > 0 ? null : 'Manual list item';
    existing.isManual = true;
    existing.manualIntentId = intent.id;

    if (existing.recipes.length === 0) {
      existing.actions = buildManualIntentActions(intent, bucket);
    }

    itemsByKey.set(mergeKey, existing);
  }

  const items = Array.from(itemsByKey.values())
    .map(finalizeAccumulator)
    .filter((item) => item.bucket !== null);

  if (items.length === 0) {
    return null;
  }

  const buckets: GroceryListViewModel['buckets'] = [
    {
      id: 'need_to_buy',
      label: 'Need to buy',
      count: items.filter((item) => item.bucket === 'need_to_buy').length,
      items: items.filter((item) => item.bucket === 'need_to_buy'),
    },
    {
      id: 'verify_pantry',
      label: 'Verify pantry',
      count: items.filter((item) => item.bucket === 'verify_pantry').length,
      items: items.filter((item) => item.bucket === 'verify_pantry'),
    },
    {
      id: 'covered',
      label: 'Covered',
      count: items.filter((item) => item.bucket === 'covered').length,
      items: items.filter((item) => item.bucket === 'covered'),
    },
  ];

  return {
    bucketOrder: ['need_to_buy', 'verify_pantry', 'covered'],
    buckets,
    subtitle: `Week of ${input.weekStart} with pantry checks, merged grocery intents, and linked recipe context.`,
    summary: {
      coveredCount: buckets[2].count,
      headline: `${buckets[0].count} item${buckets[0].count === 1 ? '' : 's'} left to buy`,
      needToBuyCount: buckets[0].count,
      verifyCount: buckets[1].count,
    },
    title: 'Grocery List',
    weekStart: input.weekStart,
  };
}

type GroceryListItemAccumulator = {
  actions: GroceryListActionViewModel[];
  bucket: GroceryListItemViewModel['bucket'] | null;
  brandHint: string | null;
  displayName: string;
  isManual: boolean;
  itemKey: string;
  manualIntentId: string | null;
  measurements: GroceryListMeasurement[];
  note: string | null;
  provenanceLabel: string | null;
  reason: string | null;
  recipes: GroceryListItemViewModel['recipes'];
};

type GroceryListMeasurement = {
  quantity: number | null;
  unit: string | null;
};

function createEmptyAccumulator(itemKey: string, displayName: string): GroceryListItemAccumulator {
  return {
    actions: [],
    bucket: null,
    brandHint: null,
    displayName,
    isManual: false,
    itemKey,
    manualIntentId: null,
    measurements: [],
    note: null,
    provenanceLabel: null,
    reason: null,
    recipes: [],
  };
}

function finalizeAccumulator(item: GroceryListItemAccumulator): GroceryListItemViewModel {
  const mergedMeasurement = collapseMeasurements(item.measurements);
  return {
    actions: item.actions,
    brandHint: item.brandHint,
    bucket: item.bucket ?? 'need_to_buy',
    displayName: item.displayName,
    isManual: item.isManual,
    itemKey: item.itemKey,
    manualIntentId: item.manualIntentId,
    note: item.note,
    provenanceLabel: item.provenanceLabel,
    quantity: mergedMeasurement.quantity,
    quantityDisplay: formatMeasurementDisplay(item.measurements),
    reason: item.reason,
    recipes: item.recipes,
    unit: mergedMeasurement.unit,
  };
}

function resolvePlanBucket(
  item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
  fallbackBucket: GroceryListItemViewModel['bucket'],
  preparedNeedNames: Set<string>,
  preparedVerifyNames: Set<string>,
  preparedCoveredNames: Set<string>,
): GroceryListItemViewModel['bucket'] {
  const normalizedName = normalizeGroceryListText(item.name);

  if (preparedNeedNames.has(normalizedName)) {
    return 'need_to_buy';
  }

  if (preparedVerifyNames.has(normalizedName)) {
    return 'verify_pantry';
  }

  if (preparedCoveredNames.has(normalizedName)) {
    return 'covered';
  }

  if (item.actionStatus === 'have_enough' || item.actionStatus === 'confirmed' || item.actionStatus === 'purchased' || item.actionStatus === 'skipped' || item.actionStatus === 'substituted' || item.actionStatus === 'in_cart') {
    return 'covered';
  }

  if (item.actionStatus === 'dont_have_it' || item.actionStatus === 'have_some_need_to_buy' || item.actionStatus === 'needs_purchase') {
    return 'need_to_buy';
  }

  if (item.inventoryStatus === 'check_pantry' || item.uncertainty) {
    return 'verify_pantry';
  }

  if (item.inventoryStatus === 'sufficient' || item.inventoryStatus === 'pantry_default') {
    return 'covered';
  }

  if (
    item.inventoryStatus === 'missing' ||
    item.inventoryStatus === 'partial' ||
    item.inventoryStatus === 'present_without_quantity' ||
    item.inventoryStatus === 'intent'
  ) {
    return 'need_to_buy';
  }

  return fallbackBucket;
}

function buildPlanItemActions(
  weekStart: string,
  item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
  bucket: GroceryListItemViewModel['bucket'],
): GroceryListActionViewModel[] {
  const sufficiencyEligible = item.inventoryStatus === 'check_pantry' || item.orderingPolicy === 'pantry_item' || item.orderingPolicy === 'household_staple';
  if (bucket === 'covered') {
    return [
      {
        id: 'undo',
        label: 'Undo',
        toolName: 'meals_delete_grocery_plan_action',
        args: {
          item_key: item.itemKey,
          week_start: weekStart,
        },
      },
    ];
  }

  if (bucket === 'verify_pantry') {
    return [
      {
        id: 'have_it',
        label: 'Have it',
        toolName: 'meals_upsert_grocery_plan_action',
        args: {
          action_status: sufficiencyEligible ? 'have_enough' : 'confirmed',
          item_key: item.itemKey,
          week_start: weekStart,
        },
      },
      {
        id: 'need_to_buy',
        label: 'Need to buy',
        toolName: 'meals_upsert_grocery_plan_action',
        args: {
          action_status: sufficiencyEligible ? 'dont_have_it' : 'needs_purchase',
          item_key: item.itemKey,
          week_start: weekStart,
        },
      },
    ];
  }

  return [
    {
      id: 'have_it',
      label: 'Have it',
      toolName: 'meals_upsert_grocery_plan_action',
      args: {
        action_status: sufficiencyEligible ? 'have_enough' : 'confirmed',
        item_key: item.itemKey,
        week_start: weekStart,
      },
    },
  ];
}

function shouldIncludeIntent(intent: GroceryIntentRecord, weekStart: string, currentPlanId: string | null): boolean {
  if (intent.status === 'deleted' || intent.status === 'archived') {
    return false;
  }

  if (intent.mealPlanId && currentPlanId && intent.mealPlanId !== currentPlanId) {
    return false;
  }

  if (!intent.targetWindow) {
    return true;
  }

  const normalizedTarget = normalizeGroceryListText(intent.targetWindow);
  return normalizedTarget.includes(normalizeGroceryListText(weekStart));
}

function resolveIntentBucket(intent: GroceryIntentRecord): GroceryListItemViewModel['bucket'] {
  return intent.status === 'completed' ? 'covered' : 'need_to_buy';
}

function buildManualIntentActions(intent: GroceryIntentRecord, bucket: GroceryListItemViewModel['bucket']): GroceryListActionViewModel[] {
  if (bucket === 'covered') {
    return [
      {
        id: 'undo',
        label: 'Undo',
        toolName: 'meals_upsert_grocery_intent',
        args: {
          display_name: intent.displayName,
          id: intent.id,
          meal_plan_id: intent.mealPlanId ?? undefined,
          metadata: intent.metadata,
          notes: intent.notes ?? undefined,
          quantity: intent.quantity ?? undefined,
          status: 'pending',
          target_window: intent.targetWindow ?? undefined,
          unit: intent.unit ?? undefined,
        },
      },
    ];
  }

  return [
    {
      id: 'have_it',
      label: 'Have it',
      toolName: 'meals_upsert_grocery_intent',
      args: {
        display_name: intent.displayName,
        id: intent.id,
        meal_plan_id: intent.mealPlanId ?? undefined,
        metadata: intent.metadata,
        notes: intent.notes ?? undefined,
        quantity: intent.quantity ?? undefined,
        status: 'completed',
        target_window: intent.targetWindow ?? undefined,
        unit: intent.unit ?? undefined,
      },
    },
  ];
}

function synthesizePlanReason(
  item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
  bucket: GroceryListItemViewModel['bucket'],
): string | null {
  if (bucket === 'verify_pantry') {
    if (item.uncertainty) {
      return item.uncertainty;
    }
    if (item.inventoryStatus === 'check_pantry') {
      return 'Pantry quantity still needs confirmation.';
    }
    return 'Inventory may already cover this item.';
  }

  if (bucket === 'covered' && item.actionStatus === 'confirmed') {
    return 'Marked as already covered.';
  }

  if (bucket === 'covered' && item.actionStatus === 'have_enough') {
    return 'Confirmed as enough on hand.';
  }

  return null;
}

function buildGroceryMergeKey(canonicalItemKey: string | null, name: string): string {
  if (canonicalItemKey?.trim()) {
    return canonicalizeGroceryMergeName(canonicalItemKey.replace(/_/g, ' '));
  }
  return canonicalizeGroceryMergeName(name);
}

function normalizeGroceryListText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function choosePreferredName(current: string, incoming: string): string {
  if (!current) {
    return incoming;
  }
  return current.length >= incoming.length ? current : incoming;
}

function chooseBrandHint(current: string | null, incoming: string[] | null | undefined): string | null {
  if (current?.trim()) {
    return current.trim();
  }

  const brands = (incoming ?? []).map((brand) => brand.trim()).filter(Boolean);
  if (brands.length === 0) {
    return null;
  }

  const uniqueBrands = Array.from(new Set(brands));
  return uniqueBrands.slice(0, 2).join(' or ');
}

function canonicalizeGroceryMergeName(name: string): string {
  const normalized = normalizeGroceryListText(name);
  if (!normalized) {
    return normalized;
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const singularTokens = tokens.map(singularizeGroceryToken);

  if (singularTokens.includes('cucumber')) {
    return 'cucumber';
  }

  return singularTokens.join(' ');
}

function singularizeGroceryToken(token: string): string {
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if ((token.endsWith('oes') || token.endsWith('ses')) && token.length > 3) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function mergeMeasurement(measurements: GroceryListMeasurement[], quantity: number | null, unit: string | null): void {
  const normalizedUnit = normalizeGroceryListText(unit ?? '');
  const nextQuantity = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null;

  if (nextQuantity == null && !normalizedUnit) {
    return;
  }

  const existing = measurements.find((entry) => normalizeGroceryListText(entry.unit ?? '') === normalizedUnit);
  if (!existing) {
    measurements.push({ quantity: nextQuantity, unit });
    return;
  }

  if (existing.quantity == null) {
    existing.quantity = nextQuantity;
  } else if (nextQuantity != null) {
    existing.quantity += nextQuantity;
  }
  existing.unit = existing.unit ?? unit ?? null;
}

function collapseMeasurements(measurements: GroceryListMeasurement[]): GroceryListMeasurement {
  if (measurements.length === 1) {
    return measurements[0]!;
  }
  return {
    quantity: null,
    unit: null,
  };
}

function formatMeasurementDisplay(measurements: GroceryListMeasurement[]): string | null {
  const parts = measurements
    .map((entry) => formatSingleMeasurement(entry.quantity, entry.unit))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  return parts.join(' + ');
}

function formatSingleMeasurement(quantity: number | null, unit: string | null): string | null {
  const parts: string[] = [];
  if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    const rounded = Math.round(quantity * 100) / 100;
    parts.push(Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  }
  if (unit) {
    parts.push(unit);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function mergeBucket(
  current: GroceryListItemViewModel['bucket'] | null,
  incoming: GroceryListItemViewModel['bucket'],
): GroceryListItemViewModel['bucket'] {
  if (!current) {
    return incoming;
  }

  const priority: Record<GroceryListItemViewModel['bucket'], number> = {
    covered: 0,
    verify_pantry: 1,
    need_to_buy: 2,
  };

  return priority[incoming] > priority[current] ? incoming : current;
}

function mergeSentence(current: string | null, incoming: string | null): string | null {
  if (!current) {
    return incoming;
  }
  if (!incoming || current === incoming) {
    return current;
  }
  return `${current} ${incoming}`;
}

function mergeRecipeSources(
  item: GroceryListItemAccumulator,
  recipeIds: string[],
  recipeNames: string[],
): void {
  for (let index = 0; index < Math.max(recipeIds.length, recipeNames.length); index += 1) {
    const recipeId = recipeIds[index];
    const recipeName = recipeNames[index];
    if (!recipeId || !recipeName) {
      continue;
    }
    if (item.recipes.some((entry) => entry.recipeId === recipeId)) {
      continue;
    }
    item.recipes.push({ recipeId, recipeName });
  }
}


