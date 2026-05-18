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
  summarizeCurrentGroceryList,
  summarizeMealPlan,
  summarizeMealPreferences,
  summarizePreparedOrder,
} from './domains/meals/service';
import type {
  CurrentGroceryListRecord,
  GroceryIntentRecord,
  GroceryPlanRecord,
  InventoryRecord,
  MealPlanRecord,
  PreparedOrderRecord,
  UpdateInventoryInput,
} from './domains/meals/service';
import type { MealPlanCandidateSummaryRecord } from './domains/meals/types-extra';
import {
  buildRecipeCardMetadata,
  buildRecipeCardStructuredContent,
  buildRecipeCardViewModel,
  getRecipeCardWidgetHtml,
  MEALS_RECIPE_CARD_CACHED_TEMPLATE_URI,
  MEALS_RECIPE_CARD_LEGACY_PREVIOUS_TEMPLATE_URI,
  MEALS_RECIPE_CARD_PREVIOUS_TEMPLATE_URI,
  MEALS_RECIPE_CARD_TEMPLATE_URI,
} from './domains/meals/recipe-card';
import {
  buildEmptyGroceryListViewModel,
  buildGroceryListMetadata,
  buildGroceryListStructuredContent,
  getGrocerySmokeWidgetHtml,
  getGroceryListWidgetHtml,
  MEALS_GROCERY_LIST_COMPAT_TEMPLATE_URI,
  MEALS_GROCERY_LIST_BUCKET_ACTION_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_CHECKBOX_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_DONE_SYNC_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_FALLBACK_WRITE_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_HYDRATION_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_LIVE_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_MCP_APPS_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_PANTRY_UNDO_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_PUBLIC_ACTIONS_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_STALE_SOURCE_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_LIST_LEGACY_TEMPLATE_URI,
  MEALS_GROCERY_LIST_TEMPLATE_URI,
  MEALS_GROCERY_LIST_TRANSPORT_PREVIOUS_TEMPLATE_URI,
  MEALS_GROCERY_SMOKE_TEMPLATE_URI,
  type GroceryListActionViewModel,
  type GroceryListItemViewModel,
  type GroceryListViewModel,
} from './domains/meals/grocery-list';
import {
  buildPantryDashboardMetadata,
  buildPantryDashboardStructuredContent,
  getPantryDashboardWidgetHtml,
  MEALS_PANTRY_DASHBOARD_PREVIOUS_TEMPLATE_URI,
  MEALS_PANTRY_DASHBOARD_TEMPLATE_URI,
  type PantryDashboardActionViewModel,
  type PantryBoughtRecentlyViewModel,
  type PantryLikelyOpenViewModel,
  type PantryShopItemViewModel,
  type PantryShopViewModel,
  type PantryStapleViewModel,
  type PantryDashboardViewModel,
  type StapleState,
} from './domains/meals/pantry-dashboard';
import { normalizeIngredient } from './domains/meals/helpers';
import { firstTemplateValue, iconFor, jsonResource, provenanceInputSchema, readViewSchema, toolResult, writeResponseModeSchema } from './mcp-shared';

const calendarMealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const mealsCalibrationSignalKindSchema = z.enum([
  'household_shape',
  'disliked_food',
  'allergy',
  'dietary_constraint',
  'preferred_cuisine',
  'cooking_cadence',
  'weeknight_time_limit',
  'budget_sensitivity',
  'leftover_preference',
  'grocery_expectation',
  'meal_pattern',
  'pantry_pattern',
  'starter_preference',
]);
const mealsCalibrationSignalStatusSchema = z.enum(['confirmed', 'corrected', 'rejected']);
const mealsPantryCalibrationStatusSchema = z.enum(['stale', 'accidental', 'not_representative', 'representative']);
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

type AppsOAuth2SecurityScheme = {
  scopes: string[];
  type: 'oauth2';
};

function withAppsSecurity<T extends { _meta?: Record<string, unknown> }>(
  config: T,
  securitySchemes: AppsOAuth2SecurityScheme[],
  options?: { uiVisibility?: string[] },
): T {
  const meta: Record<string, unknown> = {
    ...(config._meta ?? {}),
    securitySchemes,
  };
  if (options?.uiVisibility) {
    const currentUi = meta.ui && typeof meta.ui === 'object' && !Array.isArray(meta.ui)
      ? (meta.ui as Record<string, unknown>)
      : {};
    meta.ui = {
      ...currentUi,
      visibility: options.uiVisibility,
    };
  }
  return {
    ...config,
    securitySchemes,
    _meta: meta,
  } as T;
}

type MealsMcpSurfaceOptions = {
  includeDevWidgetSurfaces?: boolean;
};

function normalizeMealsText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function titleCaseWords(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function parseObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function quantityDisplay(quantity: number | null | undefined, unit: string | null | undefined): string | null {
  if (quantity == null && !unit) return null;
  if (quantity == null) return unit ?? null;
  return unit ? `${quantity} ${unit}` : `${quantity}`;
}

function formatPantryDateLabel(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Toronto',
  }).format(parsed);
}

function daysAgoFromDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
}

function isPantryDashboardUsedUp(item: InventoryRecord): boolean {
  const metadata = parseObject(item.metadata);
  return parseBoolean(metadata?.pantry_dashboard_used_up) === true;
}

function isPantryDashboardStaple(item: InventoryRecord): boolean {
  const metadata = parseObject(item.metadata);
  return parseBoolean(metadata?.pantry_dashboard_staple) === true;
}

function parseStapleState(value: unknown): StapleState | null {
  return value === 'ok' || value === 'low' || value === 'out' ? value : null;
}

function pickRecentShopStore(item: InventoryRecord): string {
  const metadata = parseObject(item.metadata);
  return (
    parseString(metadata?.store_name) ??
    parseString(metadata?.storeName) ??
    parseString(metadata?.retailer) ??
    parseString(item.source) ??
    'Recent shop'
  );
}

function isStapleCandidate(item: InventoryRecord): boolean {
  const metadata = parseObject(item.metadata);
  if (parseBoolean(metadata?.pantry_dashboard_staple) === false) return false;
  if (isPantryDashboardStaple(item)) return true;
  const normalized = normalizeMealsText(item.name);
  const stapleKeywords = ['egg', 'milk', 'olive oil', 'oil', 'butter', 'yogurt', 'granola', 'bread', 'rice', 'oat'];
  return item.longLifeDefault || stapleKeywords.some((keyword) => normalized.includes(keyword));
}

function inferStapleState(item: InventoryRecord): StapleState {
  const metadata = parseObject(item.metadata);
  const explicit = parseStapleState(metadata?.pantry_dashboard_staple_state);
  if (explicit) return explicit;
  const normalizedStatus = normalizeMealsText(item.status);
  if (normalizedStatus === 'out' || normalizedStatus === 'empty') return 'out';
  if (item.quantity != null && item.quantity <= 1) return 'low';
  return 'ok';
}

function nextStapleState(current: StapleState): StapleState {
  if (current === 'ok') return 'low';
  if (current === 'low') return 'out';
  return 'ok';
}

function parseStapleQuantity(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Staple quantity must be zero or greater.');
  }
  return parsed;
}

interface PantryRecipeSuggestionViewModel {
  recipeId: string;
  recipeName: string;
  mealType: string;
  matchedItemCount: number;
  ingredientCount: number;
  matchedItems: string[];
  matchSummary: string;
}

function buildPantryInventoryMatchMap(inventory: InventoryRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of inventory) {
    const label = titleCaseWords(item.name);
    const keys = [
      item.canonicalItemKey,
      item.normalizedName,
      item.name,
    ].map((value) => normalizeMealsText(value));
    for (const key of keys) {
      if (!key || map.has(key)) continue;
      map.set(key, label);
    }
  }
  return map;
}

function buildPantryRecipeSuggestions(input: {
  inventory: InventoryRecord[];
  recipes: Array<{
    id: string;
    mealType: string;
    name: string;
    raw: unknown;
  }>;
  limit?: number;
}): PantryRecipeSuggestionViewModel[] {
  const activeInventory = input.inventory.filter((item) => !isPantryDashboardUsedUp(item));
  const inventoryMatchMap = buildPantryInventoryMatchMap(activeInventory);
  const suggestions: PantryRecipeSuggestionViewModel[] = [];

  for (const recipe of input.recipes) {
    const raw = parseObject(recipe.raw);
    const ingredients = Array.isArray(raw?.ingredients) ? raw.ingredients : [];
    const matchedItems = new Set<string>();
    let ingredientCount = 0;

    for (const ingredient of ingredients) {
      const normalizedIngredient = normalizeIngredient(ingredient, 1);
      if (!normalizedIngredient) continue;
      ingredientCount += 1;
      const keys = [
        normalizedIngredient.canonicalItemKey,
        normalizedIngredient.normalizedName,
        normalizedIngredient.name,
      ].map((value) => normalizeMealsText(value));
      for (const key of keys) {
        if (!key) continue;
        const match = inventoryMatchMap.get(key);
        if (match) {
          matchedItems.add(match);
          break;
        }
      }
    }

    if (matchedItems.size === 0) continue;
    const matchedList = Array.from(matchedItems);
    suggestions.push({
      recipeId: recipe.id,
      recipeName: recipe.name,
      mealType: recipe.mealType,
      matchedItemCount: matchedList.length,
      ingredientCount,
      matchedItems: matchedList,
      matchSummary:
        matchedList.length === 1
          ? `${matchedList[0]} is already around`
          : `${matchedList.slice(0, 2).join(' and ')}${matchedList.length > 2 ? ` + ${matchedList.length - 2} more` : ''} are already around`,
    });
  }

  return suggestions
    .sort((left, right) => {
      if (right.matchedItemCount !== left.matchedItemCount) {
        return right.matchedItemCount - left.matchedItemCount;
      }
      const leftRatio = left.ingredientCount > 0 ? left.matchedItemCount / left.ingredientCount : 0;
      const rightRatio = right.ingredientCount > 0 ? right.matchedItemCount / right.ingredientCount : 0;
      if (rightRatio !== leftRatio) {
        return rightRatio - leftRatio;
      }
      return left.recipeName.localeCompare(right.recipeName);
    })
    .slice(0, input.limit ?? 5);
}

function buildRecipeContextMap(groceryPlan: GroceryPlanRecord | null): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!groceryPlan) return map;

  const append = (item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number]) => {
    const keys = [item.canonicalItemKey, item.normalizedName, item.name].map((value) => normalizeMealsText(value));
    const recipes = (item.sourceRecipeNames ?? []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    for (const key of keys) {
      if (!key) continue;
      const existing = map.get(key) ?? [];
      for (const recipe of recipes) {
        if (!existing.includes(recipe)) existing.push(recipe);
      }
      map.set(key, existing);
    }
  };

  for (const item of groceryPlan.raw.items ?? []) append(item);
  for (const item of groceryPlan.raw.resolvedItems ?? []) append(item);
  return map;
}

function inventoryRecipeContext(item: InventoryRecord, recipeContext: Map<string, string[]>): string | null {
  const keys = [item.canonicalItemKey, item.normalizedName, item.name].map((value) => normalizeMealsText(value));
  for (const key of keys) {
    if (!key) continue;
    const matches = recipeContext.get(key);
    if (!matches || matches.length === 0) continue;
    if (matches.length === 1) return matches[0]!;
    return `across ${matches.length} meals`;
  }
  return null;
}

function buildInventoryMutationArgs(
  item: InventoryRecord,
  metadataPatch: Record<string, unknown>,
): Omit<UpdateInventoryInput, 'provenance'> {
  const existingMetadata = parseObject(item.metadata) ?? {};
  return {
    brand: item.brand ?? undefined,
    confirmedAt: item.confirmedAt ?? undefined,
    costCad: item.costCad ?? undefined,
    estimatedExpiry: item.estimatedExpiry ?? undefined,
    location: item.location ?? undefined,
    longLifeDefault: item.longLifeDefault || undefined,
    metadata: { ...existingMetadata, ...metadataPatch },
    name: item.name,
    perishability: item.perishability ?? undefined,
    purchasedAt: item.purchasedAt ?? undefined,
    quantity: item.quantity ?? undefined,
    source: item.source ?? undefined,
    status: item.status ?? undefined,
    unit: item.unit ?? undefined,
  };
}

function buildPantryDashboardViewModel(input: {
  currentPlan: MealPlanRecord | null;
  groceryPlan: GroceryPlanRecord | null;
  inventory: InventoryRecord[];
}): PantryDashboardViewModel {
  const recipeContext = buildRecipeContextMap(input.groceryPlan);
  const activeInventory = input.inventory.filter((item) => !isPantryDashboardUsedUp(item));
  const groupedRecentShops = new Map<string, InventoryRecord[]>();

  for (const item of activeInventory.filter((entry) => entry.purchasedAt).sort((a, b) => (b.purchasedAt ?? '').localeCompare(a.purchasedAt ?? ''))) {
    const dateKey = (item.purchasedAt ?? '').slice(0, 10);
    if (!dateKey) continue;
    const bucket = groupedRecentShops.get(dateKey) ?? [];
    bucket.push(item);
    groupedRecentShops.set(dateKey, bucket);
  }

  const recentShopKeys = Array.from(groupedRecentShops.keys()).sort((a, b) => b.localeCompare(a)).slice(0, 3);
  const recentShops: PantryShopViewModel[] = recentShopKeys.map((dateKey) => {
    const items = groupedRecentShops.get(dateKey) ?? [];
    const mappedItems: PantryShopItemViewModel[] = items.slice(0, 8).map((item) => ({
      forMeal: inventoryRecipeContext(item, recipeContext),
      id: `inventory:${item.id}`,
      name: titleCaseWords(item.name),
      qty: quantityDisplay(item.quantity ?? item.canonicalQuantity, item.unit ?? item.canonicalUnit),
      status: item.confirmedAt && item.purchasedAt && item.confirmedAt > item.purchasedAt ? 'opened' : 'unused',
    }));
    return {
      date: formatPantryDateLabel(dateKey) ?? dateKey,
      daysAgo: daysAgoFromDate(dateKey),
      id: `shop:${dateKey}`,
      items: mappedItems,
      store: pickRecentShopStore(items[0]!),
    };
  });

  const recentShopInventoryIds = new Set(recentShopKeys.flatMap((dateKey) => (groupedRecentShops.get(dateKey) ?? []).map((item) => item.id)));

  const likelyOpen: PantryLikelyOpenViewModel[] = activeInventory
    .filter((item) => !recentShopInventoryIds.has(item.id))
    .filter((item) => item.location === 'pantry' || item.longLifeDefault)
    .filter((item) => item.confirmedAt || item.purchasedAt)
    .sort((a, b) => (b.confirmedAt ?? b.purchasedAt ?? '').localeCompare(a.confirmedAt ?? a.purchasedAt ?? ''))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      lastAppearedIn: inventoryRecipeContext(item, recipeContext),
      lastSeenRelative: (() => {
        const daysAgo = daysAgoFromDate(item.confirmedAt ?? item.purchasedAt);
        return daysAgo == null ? null : `${daysAgo}d ago`;
      })(),
      name: titleCaseWords(item.name),
    }));

  const boughtRecently: PantryBoughtRecentlyViewModel[] = activeInventory
    .filter((item) => !recentShopInventoryIds.has(item.id))
    .filter((item) => Boolean(item.purchasedAt))
    .sort((a, b) => (b.purchasedAt ?? '').localeCompare(a.purchasedAt ?? ''))
    .slice(0, 8)
    .map((item) => ({
      daysAgo: daysAgoFromDate(item.purchasedAt),
      id: item.id,
      name: titleCaseWords(item.name),
      note: inventoryRecipeContext(item, recipeContext),
    }));

  const staples: PantryStapleViewModel[] = activeInventory
    .filter(isStapleCandidate)
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      name: titleCaseWords(item.name),
      qty: quantityDisplay(item.quantity ?? item.canonicalQuantity, item.unit ?? item.canonicalUnit),
      quantity: item.quantity ?? item.canonicalQuantity ?? null,
      state: inferStapleState(item),
      unit: item.unit ?? item.canonicalUnit ?? null,
    }));

  const actions: PantryDashboardActionViewModel[] = [
    {
      id: 'mark_used_up',
      label: 'Mark used up',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'mark_used_up' },
    },
    {
      id: 'undo_used_up',
      label: 'Undo used up',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'undo_used_up' },
    },
    {
      id: 'update_staple',
      label: 'Update staple',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'update_staple' },
    },
    {
      id: 'set_staple',
      label: 'Save staple',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'set_staple' },
    },
    {
      id: 'add_staple',
      label: 'Add staple',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'add_staple' },
    },
    {
      id: 'remove_staple',
      label: 'Remove staple',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'remove_staple' },
    },
    {
      id: 'suggest_recipes',
      label: 'Suggest recipes',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'suggest_recipes' },
    },
    {
      id: 'plan_meals',
      label: 'Plan meals around these',
      toolName: 'meals_apply_pantry_dashboard_action',
      args: { action_id: 'plan_meals' },
    },
  ];

  const shopItemCount = recentShops.reduce((count, shop) => count + shop.items.length, 0);
  return {
    actions,
    boughtRecently,
    generatedAt: new Date().toISOString(),
    headline: recentShops.length ? 'Here’s what probably came home with you' : 'Kitchen confidence dashboard',
    honestyNote:
      'These are estimates grounded in your receipts, grocery history, and meal plans, not a live view of your fridge or pantry.',
    id: input.currentPlan?.id ?? input.groceryPlan?.id ?? 'pantry-dashboard',
    likelyOpen,
    recentShops,
    staples,
    subheadline: input.currentPlan?.weekStart ? `Week of ${input.currentPlan.weekStart}` : 'Grounded in your recent shops and plans',
    totalsLabel: `${shopItemCount} recent item${shopItemCount === 1 ? '' : 's'} · ${staples.length} staple${staples.length === 1 ? '' : 's'}`,
  };
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

function summarizeMealPlanCandidateForToolText(candidate: MealPlanCandidateSummaryRecord) {
  return {
    candidateId: candidate.candidateId,
    dinnerCount: candidate.entries.filter((entry) => entry.mealType === 'dinner').length,
    entryCount: candidate.entryCount,
    calibrationContext: candidate.calibrationContext,
    rationale: candidate.rationale,
    recipeNamePreview: candidate.recipeNamePreview,
    warningCount: candidate.warnings.length,
    warnings: candidate.warnings,
  };
}

export function registerMealsMcpSurface(
  server: McpServer,
  meals: MealsService,
  fluentCore: FluentCoreService,
  origin: string,
  options?: MealsMcpSurfaceOptions,
) {
  const mealsReadSecuritySchemes = [{ type: 'oauth2' as const, scopes: [FLUENT_MEALS_READ_SCOPE] }];
  const mealsWriteSecuritySchemes = [{ type: 'oauth2' as const, scopes: [FLUENT_MEALS_WRITE_SCOPE] }];
  const recipeCardWidgetMeta = buildWidgetMeta(
    'Fluent recipe card for a saved meal recipe, with ingredients, steps, and cook mode.',
    origin,
  );
  const groceryListWidgetMeta = buildWidgetMeta(
    'Fluent current shopping list with To buy, Check amount, Check at home, Done, and explicit save actions.',
    origin,
  );
  const pantryDashboardWidgetMeta = buildWidgetMeta(
    'Fluent pantry dashboard grounded in recent shops, likely-open staples, and kitchen-confidence signals.',
    origin,
  );

  const registerRecipeCardWidgetResource = (name: string, uri: string, title = 'Recipe Card Widget') =>
    server.registerResource(
      name,
      uri,
      {
        title,
        description: 'Rich recipe card for a saved Fluent meal recipe.',
        mimeType: 'text/html;profile=mcp-app',
        icons: iconFor(origin),
        _meta: recipeCardWidgetMeta,
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: getRecipeCardWidgetHtml(),
            _meta: recipeCardWidgetMeta,
          },
        ],
      }),
    );

  registerRecipeCardWidgetResource(
    'fluent-meals-recipe-card-widget-cached-v8',
    MEALS_RECIPE_CARD_CACHED_TEMPLATE_URI,
    'Recipe Card Widget Cached v8',
  );
  registerRecipeCardWidgetResource(
    'fluent-meals-recipe-card-widget-previous-v9',
    MEALS_RECIPE_CARD_LEGACY_PREVIOUS_TEMPLATE_URI,
    'Recipe Card Widget Previous v9',
  );
  registerRecipeCardWidgetResource(
    'fluent-meals-recipe-card-widget-previous-v10',
    MEALS_RECIPE_CARD_PREVIOUS_TEMPLATE_URI,
    'Recipe Card Widget Previous v10',
  );
  registerRecipeCardWidgetResource('fluent-meals-recipe-card-widget', MEALS_RECIPE_CARD_TEMPLATE_URI);

  const registerGroceryListWidgetResource = (name: string, uri: string, title = 'Grocery List Widget') =>
    server.registerResource(
      name,
      uri,
      {
        title,
        description: 'Rich current shopping-list checklist with Fluent provenance and trust state.',
        mimeType: 'text/html;profile=mcp-app',
        icons: iconFor(origin),
        _meta: groceryListWidgetMeta,
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: getGroceryListWidgetHtml(),
            _meta: groceryListWidgetMeta,
          },
        ],
      }),
    );

  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-legacy-v57',
    MEALS_GROCERY_LIST_LEGACY_TEMPLATE_URI,
    'Grocery List Widget Legacy v57',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v58',
    MEALS_GROCERY_LIST_COMPAT_TEMPLATE_URI,
    'Grocery List Widget Previous v58',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v59',
    MEALS_GROCERY_LIST_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v59',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v60',
    MEALS_GROCERY_LIST_LIVE_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v60',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v61',
    MEALS_GROCERY_LIST_HYDRATION_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v61',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v62',
    MEALS_GROCERY_LIST_MCP_APPS_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v62',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v63',
    MEALS_GROCERY_LIST_TRANSPORT_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v63',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v64',
    MEALS_GROCERY_LIST_CHECKBOX_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v64',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v65',
    MEALS_GROCERY_LIST_FALLBACK_WRITE_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v65',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v66',
    MEALS_GROCERY_LIST_PUBLIC_ACTIONS_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v66',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v67',
    MEALS_GROCERY_LIST_DONE_SYNC_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v67',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v68',
    MEALS_GROCERY_LIST_PANTRY_UNDO_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v68',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v69',
    MEALS_GROCERY_LIST_STALE_SOURCE_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v69',
  );
  registerGroceryListWidgetResource(
    'fluent-meals-grocery-list-widget-v2-previous-v70',
    MEALS_GROCERY_LIST_BUCKET_ACTION_PREVIOUS_TEMPLATE_URI,
    'Grocery List Widget Previous v70',
  );
  registerGroceryListWidgetResource('fluent-meals-grocery-list-widget-v2', MEALS_GROCERY_LIST_TEMPLATE_URI);

  const registerPantryDashboardWidgetResource = (name: string, uri: string, title = 'Pantry Dashboard Widget') =>
    server.registerResource(
      name,
      uri,
      {
        title,
        description: 'Rich pantry dashboard for recent shops, likely-open items, and tracked staples.',
        mimeType: 'text/html;profile=mcp-app',
        icons: iconFor(origin),
        _meta: pantryDashboardWidgetMeta,
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: getPantryDashboardWidgetHtml(),
            _meta: pantryDashboardWidgetMeta,
          },
        ],
      }),
    );

  registerPantryDashboardWidgetResource(
    'fluent-meals-pantry-dashboard-widget-previous-v13',
    MEALS_PANTRY_DASHBOARD_PREVIOUS_TEMPLATE_URI,
    'Pantry Dashboard Widget Previous v13',
  );
  registerPantryDashboardWidgetResource('fluent-meals-pantry-dashboard-widget', MEALS_PANTRY_DASHBOARD_TEMPLATE_URI);

  if (options?.includeDevWidgetSurfaces) {
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
  }

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
        'Fetch canonical recipe data by recipe ID. Use this for raw recipe details, ingredient extraction, editing, patching, simple data questions, and as the default recipe path in Codex, OpenClaw, generic plain MCP clients, and hosts that render first-party recipe visuals themselves. In ChatGPT / MCP Apps-style hosts that support Fluent widgets, if the user wants to show, view, open, or pull up the recipe, prefer meals_render_recipe_card instead of this raw data tool.',
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
              text: 'I could not find that saved recipe. Try listing your saved recipes, then open the one you want.',
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
          ? 'Show Recipe (Preferred ChatGPT/App SDK Alias)'
          : 'Show Recipe Card (MCP Apps Widget)',
        description: options?.preferredAlias
          ? 'Preferred public alias for showing a saved Fluent recipe as a rich Fluent widget only in hosts that support MCP Apps or MCP output templates, such as Claude MCP Apps and ChatGPT Apps-style hosts. Prefer this for ordinary prompts like "show me the recipe for X", "open this recipe", or "pull up that recipe" in those hosts. Do not use this by default in Claude Code, Codex, OpenClaw, or generic plain MCP clients; there, prefer meals_get_recipe and either let the host render its own recipe visual or answer in text.'
          : 'Show a saved Fluent recipe as a rich Fluent widget only in hosts that support MCP Apps or MCP output templates, such as Claude MCP Apps and ChatGPT Apps-style hosts. Prefer this when the user says show, open, view, or pull up a recipe in those hosts, including prompts like "show me the recipe for X." Do not use this by default in Claude Code, Codex, OpenClaw, or generic plain MCP clients; there, prefer meals_get_recipe and either let the host render its own recipe visual or answer in text.',
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

  const registerRenderGroceryListTool = () =>
    server.registerTool(
      'meals_render_grocery_list_v2',
      withAppsSecurity({
        title: 'Show Grocery List',
        description:
          'Show the user\'s current Fluent grocery list as the primary rich checklist surface for normal asks like "show me my grocery list", "what do I need to buy?", "open my shopping list", or "pull up my grocery list". In ChatGPT / MCP Apps-style hosts, and in full-MCP clients such as Claude.ai when they expose MCP Apps UI-resource mounting, prefer this tool for ordinary grocery-list display because it returns the official Fluent `ui://` resource plus structured fallback data. The surface shows the living list with source provenance, trust state, To buy, Check amount, Check at home, and Done sections. If the active host cannot mount the returned MCP Apps UI resource, fall back to the canonical living-list data in the tool result or call meals_get_current_grocery_list and answer in text. Use meals_get_grocery_plan only for explicit week-scoped/raw plan detail.',
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
      }, mealsReadSecuritySchemes),
      async ({ week_start, weekStart }) => {
        requireScope(FLUENT_MEALS_READ_SCOPE);
        const currentList = await getCurrentGroceryListForRender(meals, week_start ?? weekStart);
        const viewModel = buildGroceryListViewModel({
          currentList,
          groceryPlan: currentList.groceryPlan,
          intents: currentList.intents,
          prepared: currentList.preparedOrder,
          weekStart: currentList.weekStart,
        });

        if (!viewModel) {
          const emptyViewModel = applyCurrentListMetadataToViewModel(buildEmptyGroceryListViewModel(currentList.weekStart), currentList);
          return {
            _meta: buildGroceryListMetadata(emptyViewModel),
            content: [
              {
                type: 'text' as const,
                text: 'Your current grocery list is empty.',
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
              text: 'Showing your current grocery list.',
            },
          ],
          structuredContent,
        };
      },
    );

  registerRenderGroceryListTool();

  server.registerTool(
    'meals_render_pantry_dashboard',
    withAppsSecurity({
      title: 'Show Pantry Dashboard (ChatGPT/App SDK Widget)',
      description:
        'Show a Fluent pantry dashboard for recent shops, likely-open pantry items, and tracked staples only in hosts that support Fluent MCP output templates, such as ChatGPT / MCP Apps-style hosts. Prefer this when the user wants a kitchen or pantry dashboard rather than the grocery checklist. Do not use this by default in Claude.ai, Claude Code, Codex, OpenClaw, or generic plain MCP clients.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      _meta: {
        ui: {
          resourceUri: MEALS_PANTRY_DASHBOARD_TEMPLATE_URI,
        },
        'openai/outputTemplate': MEALS_PANTRY_DASHBOARD_TEMPLATE_URI,
        'openai/toolInvocation/invoked': 'Pantry dashboard ready.',
        'openai/toolInvocation/invoking': 'Opening pantry dashboard…',
        'openai/widgetAccessible': true,
      },
    }, mealsReadSecuritySchemes),
    async () => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const currentPlan = await meals.getCurrentPlan();
      const groceryPlan = currentPlan ? await meals.getGroceryPlan(currentPlan.weekStart) : null;
      const inventory = await meals.getInventory();
      const viewModel = buildPantryDashboardViewModel({
        currentPlan,
        groceryPlan,
        inventory,
      });
      return {
        _meta: buildPantryDashboardMetadata(viewModel),
        content: [
          {
            type: 'text' as const,
            text: 'Showing the pantry dashboard.',
          },
        ],
        structuredContent: buildPantryDashboardStructuredContent(viewModel),
      };
    },
  );

  server.registerTool(
    'meals_apply_pantry_dashboard_action',
    withAppsSecurity({
      title: 'Apply Pantry Dashboard Action',
      description:
        'Apply an explicit user-requested pantry dashboard action from the widget, such as marking a recent-shop item used up, updating a tracked staple, suggesting pantry-aware recipes, or generating a pantry-aware meal-plan candidate.',
      inputSchema: {
        action_id: z.enum([
          'mark_used_up',
          'undo_used_up',
          'update_staple',
          'set_staple',
          'add_staple',
          'remove_staple',
          'suggest_recipes',
          'plan_meals',
        ]),
        dashboard_id: z.string().optional(),
        item_key: z.string().optional(),
        staple_id: z.string().optional(),
        staple_name: z.string().optional(),
        staple_quantity: z.union([z.number(), z.string()]).nullable().optional(),
        staple_unit: z.string().nullable().optional(),
        staple_state: z.enum(['ok', 'low', 'out']).optional(),
        ...provenanceInputSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    }, mealsWriteSecuritySchemes, { uiVisibility: ['model', 'app'] }),
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const provenance = buildMutationProvenance(authProps, args);
      const inventory = await meals.getInventory();

      if (args.action_id === 'mark_used_up' || args.action_id === 'undo_used_up') {
        if (!args.item_key?.trim()) {
          throw new Error(`Pantry dashboard action ${args.action_id} requires item_key.`);
        }
        const inventoryId = args.item_key.startsWith('inventory:') ? args.item_key.slice('inventory:'.length) : args.item_key;
        const target = inventory.find((item) => item.id === inventoryId);
        if (!target) {
          throw new Error(`Could not find pantry dashboard inventory item ${args.item_key}.`);
        }

        const metadataPatch =
          args.action_id === 'mark_used_up'
            ? { pantry_dashboard_used_up: true }
            : { pantry_dashboard_used_up: false };

        const updated = await meals.updateInventory({
          ...buildInventoryMutationArgs(target, metadataPatch),
          provenance,
        });

        return toolResult(updated, {
          structuredContent: {
            action: args.action_id,
            experience: 'pantry_dashboard_action',
            name: updated.name,
            pantryDashboardUsedUp: parseBoolean(parseObject(updated.metadata)?.pantry_dashboard_used_up),
          },
          textData: {
            action: args.action_id,
            name: updated.name,
            pantryDashboardUsedUp: parseBoolean(parseObject(updated.metadata)?.pantry_dashboard_used_up),
          },
        });
      }

      if (args.action_id === 'update_staple') {
        if (!args.staple_id?.trim()) {
          throw new Error('Pantry dashboard action update_staple requires staple_id.');
        }
        const target = inventory.find((item) => item.id === args.staple_id);
        if (!target) {
          throw new Error(`Could not find pantry staple ${args.staple_id}.`);
        }
        const existingMetadata = parseObject(target.metadata) ?? {};
        const nextState = nextStapleState(inferStapleState(target));
        const updated = await meals.updateInventory({
          ...buildInventoryMutationArgs(target, {
            ...existingMetadata,
            pantry_dashboard_staple: true,
            pantry_dashboard_staple_added_at:
              parseString(existingMetadata.pantry_dashboard_staple_added_at) ?? new Date().toISOString(),
            pantry_dashboard_staple_state: nextState,
          }),
          provenance,
        });
        return toolResult(updated, {
          structuredContent: {
            action: args.action_id,
            experience: 'pantry_dashboard_action',
            name: updated.name,
            stapleState: nextState,
          },
          textData: {
            action: args.action_id,
            name: updated.name,
            stapleState: nextState,
          },
        });
      }

      if (args.action_id === 'set_staple') {
        if (!args.staple_id?.trim()) {
          throw new Error('Pantry dashboard action set_staple requires staple_id.');
        }
        const target = inventory.find((item) => item.id === args.staple_id);
        if (!target) {
          throw new Error(`Could not find pantry staple ${args.staple_id}.`);
        }
        const existingMetadata = parseObject(target.metadata) ?? {};
        const stapleState = args.staple_state ?? inferStapleState(target);
        const quantity = parseStapleQuantity(args.staple_quantity);
        const unit = typeof args.staple_unit === 'string' ? args.staple_unit.trim() : null;
        const update = buildInventoryMutationArgs(target, {
          ...existingMetadata,
          pantry_dashboard_staple: true,
          pantry_dashboard_staple_added_at:
            parseString(existingMetadata.pantry_dashboard_staple_added_at) ?? new Date().toISOString(),
          pantry_dashboard_staple_state: stapleState,
          pantry_dashboard_used_up: false,
        });
        update.quantity = quantity;
        update.unit = unit;
        const updated = await meals.updateInventory({
          ...update,
          provenance,
        });
        return toolResult(updated, {
          structuredContent: {
            action: args.action_id,
            experience: 'pantry_dashboard_action',
            name: updated.name,
            quantity: updated.quantity,
            stapleState,
            unit: updated.unit,
          },
          textData: {
            action: args.action_id,
            name: updated.name,
            quantity: updated.quantity,
            stapleState,
            unit: updated.unit,
          },
        });
      }

      if (args.action_id === 'add_staple') {
        const stapleName = titleCaseWords(args.staple_name);
        if (!stapleName) {
          throw new Error('Add staple requires a name.');
        }
        const now = new Date().toISOString();
        const created = await meals.updateInventory({
          name: stapleName,
          status: 'present',
          source: 'pantry_dashboard',
          confirmedAt: null,
          purchasedAt: null,
          estimatedExpiry: null,
          perishability: 'long_life',
          longLifeDefault: true,
          quantity: null,
          unit: null,
          location: 'pantry',
          brand: null,
          costCad: null,
          metadata: {
            pantry_dashboard_staple: true,
            pantry_dashboard_staple_added_at: now,
            pantry_dashboard_staple_state: 'ok',
          },
          provenance,
        });
        return toolResult(created, {
          structuredContent: {
            action: args.action_id,
            experience: 'pantry_dashboard_action',
            name: created.name,
            stapleState: 'ok',
          },
          textData: {
            action: args.action_id,
            name: created.name,
            stapleState: 'ok',
          },
        });
      }

      if (args.action_id === 'remove_staple') {
        if (!args.staple_id?.trim()) {
          throw new Error('Pantry dashboard action remove_staple requires staple_id.');
        }
        const target = inventory.find((item) => item.id === args.staple_id);
        if (!target) {
          throw new Error(`Could not find pantry staple ${args.staple_id}.`);
        }
        const existingMetadata = parseObject(target.metadata) ?? {};
        const updated = await meals.updateInventory({
          ...buildInventoryMutationArgs(target, {
            ...existingMetadata,
            pantry_dashboard_staple: false,
            pantry_dashboard_staple_state: null,
            pantry_dashboard_used_up: true,
          }),
          provenance,
        });
        return toolResult(updated, {
          structuredContent: {
            action: args.action_id,
            experience: 'pantry_dashboard_action',
            name: updated.name,
            removedFromPantryDashboard: true,
          },
          textData: {
            action: args.action_id,
            name: updated.name,
            removedFromPantryDashboard: true,
          },
        });
      }

      if (args.action_id === 'suggest_recipes') {
        const suggestions = buildPantryRecipeSuggestions({
          inventory,
          recipes: await meals.listRecipes(undefined, 'active'),
          limit: 4,
        });
        const result = {
          experience: 'pantry_recipe_suggestions',
          title: suggestions.length ? 'Recipes that fit what is probably around' : 'No pantry-led recipe ideas yet',
          suggestionCount: suggestions.length,
          suggestions,
        };
        return toolResult(result, {
          structuredContent: result,
          textData: result,
        });
      }

      if (args.action_id === 'plan_meals') {
        const suggestions = buildPantryRecipeSuggestions({
          inventory,
          recipes: await meals.listRecipes(undefined, 'active'),
          limit: 6,
        });
        const weekStart = await resolveMealsGroceryWeekStart(meals);
        const generation = await meals.generatePlan({
          weekStart,
          overrides: {
            includeRecipeIds: suggestions.map((entry) => entry.recipeId),
            prioritizeInventory: true,
          },
          provenance,
        });
        const result = {
          candidateCount: generation.candidates.length,
          candidatePreview: generation.candidates.slice(0, 3).map(summarizeMealPlanCandidateForToolText),
          experience: 'pantry_plan_generation',
          generationId: generation.id,
          seededRecipeIds: suggestions.map((entry) => entry.recipeId),
          title: 'Meal-plan candidate built around what is already here',
          weekStart: generation.weekStart,
        };
        return toolResult(generation, {
          structuredContent: result,
          textData: result,
        });
      }

      throw new Error(`Unsupported pantry dashboard action ${args.action_id}.`);
    },
  );

  if (options?.includeDevWidgetSurfaces) {
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
  }

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
      description:
        'Fetch raw or summarized meal-planning preferences outside the standard setup/calibration lane. For Meals onboarding, confidence checks, inferred preference confirmation, pantry evidence calibration, or "what do you know about how we eat?" prompts, start with meals_get_onboarding_calibration so pantry evidence, meal history, inferred signals, confirmed preferences, and planning/grocery readiness stay distinct.',
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
    'meals_get_onboarding_calibration',
    {
      title: 'Get Meals Onboarding Calibration',
      description:
        'Required first and sufficient read model for Meals setup/calibration. Fetch setup state, household/preference status, pantry coverage, plan/history coverage, grocery readiness, inferred meal signals, confirmed preferences, unresolved questions, evidence gaps, suggested next action, confidence breakdown, and host copy guardrails. Use this for new Meals setup, returning/imported pantry calibration, inferred preference confirmation, starter meal preference collection, grocery-confidence prompts, and meal planning that depends on thin or inferred evidence. Pantry ownership, old plans, accepted recipes, and grocery actions are evidence only; say "your pantry suggests" or "your meal history suggests" unless the user explicitly confirmed the preference.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async () => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const calibration = await meals.getOnboardingCalibration();
      return toolResult(calibration, {
        textData: calibration,
        structuredContent: calibration,
      });
    },
  );

  server.registerTool(
    'meals_record_calibration_response',
    {
      title: 'Record Meals Calibration Response',
      description:
        'Record an explicit user response during Meals setup/calibration: confirm, correct, or reject inferred meal signals; mark pantry items stale, accidental, not representative, or representative; save starter household/preferences/grocery expectations. Use only after explicit user intent. Do not infer allergies, dietary restrictions, or hard avoids from pantry, recipes, or meal history; those require user-confirmed input.',
      inputSchema: {
        pantry_items: z
          .array(
            z.object({
              item_name: z.string(),
              note: z.string().nullable().optional(),
              status: mealsPantryCalibrationStatusSchema,
            }),
          )
          .optional(),
        preference_patch: z
          .object({
            allergies: z.array(z.string()).nullable().optional(),
            budget_sensitivity: z.string().nullable().optional(),
            cooking_cadence: z.string().nullable().optional(),
            dietary_constraints: z.array(z.string()).nullable().optional(),
            dislikes: z.array(z.string()).nullable().optional(),
            grocery_expectation: z.string().nullable().optional(),
            hard_avoids: z.array(z.string()).nullable().optional(),
            household_shape: z.string().nullable().optional(),
            leftover_preference: z.string().nullable().optional(),
            preferred_cuisines: z.array(z.string()).nullable().optional(),
            weeknight_time_limit_minutes: z.number().min(0).nullable().optional(),
          })
          .optional(),
        response_mode: writeResponseModeSchema,
        signals: z
          .array(
            z.object({
              corrected_value: z.string().nullable().optional(),
              kind: mealsCalibrationSignalKindSchema,
              note: z.string().nullable().optional(),
              status: mealsCalibrationSignalStatusSchema,
              value: z.string(),
            }),
          )
          .optional(),
        starter_preference_text: z.string().nullable().optional(),
        ...provenanceInputSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => {
      const authProps = requireScope(FLUENT_MEALS_WRITE_SCOPE);
      const updated = await meals.recordCalibrationResponse({
        response: {
          pantryItems: args.pantry_items?.map((entry) => ({
            itemName: entry.item_name,
            note: entry.note ?? null,
            status: entry.status,
          })),
          preferencePatch: args.preference_patch
            ? {
                allergies: args.preference_patch.allergies ?? null,
                budgetSensitivity: args.preference_patch.budget_sensitivity ?? null,
                cookingCadence: args.preference_patch.cooking_cadence ?? null,
                dietaryConstraints: args.preference_patch.dietary_constraints ?? null,
                dislikes: args.preference_patch.dislikes ?? null,
                groceryExpectation: args.preference_patch.grocery_expectation ?? null,
                hardAvoids: args.preference_patch.hard_avoids ?? null,
                householdShape: args.preference_patch.household_shape ?? null,
                leftoverPreference: args.preference_patch.leftover_preference ?? null,
                preferredCuisines: args.preference_patch.preferred_cuisines ?? null,
                weeknightTimeLimitMinutes: args.preference_patch.weeknight_time_limit_minutes ?? null,
              }
            : null,
          signals: args.signals?.map((entry) => ({
            correctedValue: entry.corrected_value ?? null,
            kind: entry.kind,
            note: entry.note ?? null,
            status: entry.status,
            value: entry.value,
          })),
          starterPreferenceText: args.starter_preference_text ?? null,
        },
        provenance: buildMutationProvenance(authProps, args),
      });
      const calibration = await meals.getOnboardingCalibration();
      const ack = buildMutationAck(
        'meal_calibration',
        `${updated.tenantId}:${updated.profileId}`,
        'calibration_response.recorded',
        updated.updatedAt,
        {
          setupState: calibration.setupState,
          confidenceBreakdown: calibration.confidenceBreakdown,
          suggestedNextAction: calibration.suggestedNextAction,
        },
      );
      return toolResult(calibration, {
        textData: args.response_mode === 'full' ? calibration : ack,
        structuredContent: args.response_mode === 'ack' ? ack : calibration,
      });
    },
  );

  server.registerTool(
    'meals_update_preferences',
    {
      title: 'Update Meals Preferences',
      description:
        'Replace the canonical meal-planning preferences document for advanced maintenance. For normal Meals setup, confirm/correct prompts, starter household signals, pantry evidence calibration, allergies, hard avoids, dietary constraints, cooking cadence, weeknight limits, budget sensitivity, leftovers, or grocery expectations, prefer meals_record_calibration_response so provenance and confidence semantics stay intact.',
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
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
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
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
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
          calibrationContext: generation.calibrationContext,
          candidatePreview: generation.candidates.slice(0, 4).map(summarizeMealPlanCandidateForToolText),
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
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
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
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
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
    'meals_get_current_grocery_list',
    {
      title: 'Get Current Grocery List',
      description:
        'Fetch the canonical current living grocery list data for text answers, calculations, reconciliation, or hosts that cannot mount a rich grocery-list resource. This host-neutral read model distinguishes the living grocery list from weekly meal plans, derived grocery needs, shopping sessions, purchases, and kitchen memory. In ChatGPT / MCP Apps-style hosts, and in full-MCP clients such as Claude.ai when they expose MCP Apps UI-resource mounting, prefer meals_render_grocery_list_v2 for ordinary display asks like "show me my grocery list" or "what do I need to buy?". In Codex, OpenClaw, generic plain MCP clients, or render-fallback turns, use this tool and answer in text.',
      inputSchema: {
        week_start: z.string().optional(),
        today: z.string().optional(),
        view: readViewSchema,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ today, view, week_start }) => {
      requireScope(FLUENT_MEALS_READ_SCOPE);
      const currentList = await meals.getCurrentGroceryList({ today, weekStart: week_start });
      const summary = summarizeCurrentGroceryList(currentList);
      return toolResult(currentList, {
        textData: view === 'full' ? currentList : summary,
        structuredContent: view === 'summary' ? summary : undefined,
      });
    },
  );

  server.registerTool(
    'meals_get_grocery_plan',
    {
      title: 'Get Grocery Plan',
      description:
        'Fetch the underlying grocery-plan document for a specific meal-plan week, including buy-list items, pantry checks, substitutions, and resolved grocery actions. Prefer this for audit/debugging, when the user explicitly asks for a week-scoped grocery plan, or when a tool needs raw plan data. For ordinary "show my grocery list" asks in ChatGPT / MCP Apps-style hosts or full-MCP clients with MCP Apps UI-resource support, prefer meals_render_grocery_list_v2. In Codex, OpenClaw, generic plain MCP clients, or render-fallback turns, prefer meals_get_current_grocery_list.',
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
    withAppsSecurity({
      title: 'Upsert Grocery Plan Action',
      description:
        'Persist an explicit user-requested grocery item resolution for a grocery-plan line, including mark purchased, track already in cart, skip item, confirm pantry stock, record a pantry sufficiency confirmation, mark need to buy, or substitute, swap, or replace one ingredient with another.',
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
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    }, mealsWriteSecuritySchemes, { uiVisibility: ['model', 'app'] }),
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
    withAppsSecurity({
      title: 'Delete Grocery Plan Action',
      description:
        'Delete a persisted grocery-plan item action only from explicit user-requested undo intent for a specific week and item key so a purchased, in-cart, skipped, pantry-confirmed, pantry-sufficiency, or substituted grocery line returns to the active plan.',
      inputSchema: {
        week_start: z.string(),
        item_key: z.string(),
        ...provenanceInputSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    }, mealsWriteSecuritySchemes, { uiVisibility: ['model', 'app'] }),
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
    withAppsSecurity({
      title: 'Upsert Grocery Intent',
      description:
        'Create or update a grocery intent only when the user explicitly asks to add or change a next-order, buy-list, replacement-ingredient, or need-to-buy item.',
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
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        'openai/widgetAccessible': true,
      },
    }, mealsWriteSecuritySchemes, { uiVisibility: ['model', 'app'] }),
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

async function getCurrentGroceryListForRender(
  meals: MealsService,
  explicitWeekStart?: string,
): Promise<CurrentGroceryListRecord> {
  const optionalMeals = meals as MealsService & {
    getCurrentGroceryList?: (input?: { weekStart?: string | null }) => Promise<CurrentGroceryListRecord>;
  };
  if (typeof optionalMeals.getCurrentGroceryList === 'function') {
    return optionalMeals.getCurrentGroceryList({ weekStart: explicitWeekStart });
  }

  const weekStart = await resolveMealsGroceryWeekStart(meals, explicitWeekStart);
  const groceryPlan = await meals.getGroceryPlan(weekStart);
  const intents = await meals.listGroceryIntents();
  const preparedOrder = groceryPlan ? await meals.prepareOrder({ weekStart }) : null;
  return {
    counts: {
      checkAtHomeCount: preparedOrder?.unresolvedItems.length ?? 0,
      inCartCount: preparedOrder?.alreadyInRetailerCart.length ?? 0,
      manualIntentCount: intents.length,
      planItemCount: groceryPlan?.raw.items.length ?? 0,
      resolvedCount: groceryPlan?.raw.resolvedItems.length ?? 0,
      toBuyCount: preparedOrder?.remainingToBuy.length ?? groceryPlan?.raw.items.length ?? 0,
      unresolvedCount: preparedOrder?.unresolvedItems.length ?? 0,
    },
    generatedAt: groceryPlan?.generatedAt ?? null,
    groceryPlan,
    intents,
    listId: `current-grocery-list:${weekStart}`,
    objectRole: 'living_grocery_list',
    preparedOrder,
    sourceProvenance: [],
    stale: false,
    staleReasons: [],
    selectionReason: null,
    subtitle: `Check before shopping · plan week ${weekStart}`,
    title: 'Grocery list',
    trustLabel: 'Check before shopping',
    trustState: groceryPlan ? 'review_before_shopping' : 'review_before_shopping',
    updatedAt: groceryPlan?.generatedAt ?? null,
    version: `legacy-render:${weekStart}:${groceryPlan?.generatedAt ?? 'empty'}`,
    weekRelation: 'unknown',
    weekStart,
  };
}

function startOfWeekIso(date: Date): string {
  const clone = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = clone.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setUTCDate(clone.getUTCDate() + diff);
  return clone.toISOString().slice(0, 10);
}

function buildGroceryListViewModel(input: {
  currentList?: CurrentGroceryListRecord | null;
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
      label: 'To buy',
      count: items.filter((item) => item.bucket === 'need_to_buy').length,
      items: items.filter((item) => item.bucket === 'need_to_buy'),
    },
    {
      id: 'verify_pantry',
      label: 'Check at home',
      count: items.filter((item) => item.bucket === 'verify_pantry').length,
      items: items.filter((item) => item.bucket === 'verify_pantry'),
    },
    {
      id: 'covered',
      label: 'Done',
      count: items.filter((item) => item.bucket === 'covered').length,
      items: items.filter((item) => item.bucket === 'covered'),
    },
  ];

  return applyCurrentListMetadataToViewModel({
    bucketOrder: ['need_to_buy', 'verify_pantry', 'covered'],
    buckets,
    listId: null,
    objectRole: 'living_grocery_list',
    sourceProvenance: [],
    stale: false,
    staleReasons: [],
    subtitle: `Current list · plan week ${input.weekStart}`,
    summary: {
      coveredCount: buckets[2].count,
      headline: `${buckets[0].count} item${buckets[0].count === 1 ? '' : 's'} left to buy`,
      needToBuyCount: buckets[0].count,
      verifyCount: buckets[1].count,
    },
    title: 'Grocery list',
    trustLabel: null,
    trustState: null,
    version: null,
    weekStart: input.weekStart,
    weekRelation: null,
  }, input.currentList ?? null);
}

function applyCurrentListMetadataToViewModel(
  viewModel: GroceryListViewModel,
  currentList: CurrentGroceryListRecord | null,
): GroceryListViewModel {
  if (!currentList) {
    return viewModel;
  }

  return {
    ...viewModel,
    listId: currentList.listId,
    objectRole: currentList.objectRole,
    sourceProvenance: currentList.sourceProvenance.map((source) => ({
      kind: source.kind,
      label: source.label,
      status: source.status ?? null,
      weekStart: source.weekStart ?? null,
    })),
    stale: currentList.stale,
    staleReasons: currentList.staleReasons,
    subtitle: currentList.subtitle,
    title: currentList.title,
    trustLabel: currentList.trustLabel,
    trustState: currentList.trustState,
    version: currentList.version,
    weekRelation: currentList.weekRelation,
    weekStart: currentList.weekStart,
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
  const rememberKitchenMemory = {
    fluentLifecycle: {
      action: 'already_have_enough',
      memoryEffect: 'kitchen_memory',
      objectRole: 'living_grocery_list',
      rememberInventory: true,
    },
  };
  const markBoughtMemory = {
    fluentLifecycle: {
      action: 'mark_bought',
      memoryEffect: 'purchase_inventory',
      objectRole: 'living_grocery_list',
      rememberInventory: true,
    },
  };
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
    const actions: GroceryListActionViewModel[] = [];
    if (sufficiencyEligible) {
      actions.push({
        id: 'already_have_enough',
        label: 'Already have enough',
        toolName: 'meals_upsert_grocery_plan_action',
        args: {
          action_status: 'have_enough',
          item_key: item.itemKey,
          metadata: rememberKitchenMemory,
          week_start: weekStart,
        },
      });
    }
    actions.push({
        id: 'need_to_buy',
        label: 'Add to buy list',
        toolName: 'meals_upsert_grocery_plan_action',
        args: {
          action_status: sufficiencyEligible ? 'dont_have_it' : 'needs_purchase',
          item_key: item.itemKey,
          week_start: weekStart,
        },
      });
    return actions;
  }

  return [
    {
      id: 'mark_bought',
      label: 'Mark bought',
      toolName: 'meals_upsert_grocery_plan_action',
      args: {
        action_status: 'purchased',
        item_key: item.itemKey,
        metadata: markBoughtMemory,
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
      id: 'mark_bought',
      label: 'Mark bought',
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
