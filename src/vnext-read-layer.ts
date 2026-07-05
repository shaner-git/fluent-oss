import type { FluentVNextDomain } from './vnext-contract';
import { toDerivedSeam, type BudgetCategory, type PurchaseContext } from './domains/budgets/service';
import {
  isStyleDisplayPhoto,
  isStyleFitPhoto,
  normalizeStyleCategoryStrict,
  normalizeStylePurchaseCandidate,
} from './domains/style/helpers';
import { normalizeText } from './domains/meals/helpers';
import {
  blockersForDietaryPattern,
  DAIRY_FREE_QUALIFIERS,
  ingredientMatchesAnyBlocker,
  PATTERN_EXCLUDED_CLASSES,
  PLANT_BASED_QUALIFIERS,
  recognizeDietaryPattern,
  type DietaryPattern,
} from './domains/meals/dietary-patterns';
import { factLabel, type PcDomain, type PcHost, type PersonFact, type SeamSignal } from './personal-context';

export type FluentVNextReadIntent =
  | 'readiness'
  | 'setup'
  | 'planning'
  | 'today'
  | 'closet'
  | 'purchase'
  | 'budget_signal'
  | 'unknown';
export type FluentVNextItemType = 'meal_plan' | 'recipe' | 'grocery_list' | 'inventory_item' | 'style_item' | 'goal' | 'budget_signal';
export type FluentVNextMediaBundlePurpose = 'saved_item_review' | 'style_purchase_advice' | 'visual_evidence_check';
export type FluentVNextMediaBundleDeliveryMode = 'authenticated_only' | 'authenticated_with_signed_fallback';
type FluentVNextStyleVisualBundleDeliveryMode = 'authenticated_only' | 'authenticated_with_signed_fallback';
type FluentVNextStyleEvidenceGapPriorityFilter = 'actionable' | 'all' | 'high' | 'medium' | 'low';

export interface FluentVNextReadServices {
  core: {
    getAccountStatus?: () => Promise<unknown>;
    getCapabilities: () => Promise<unknown>;
    getProfile: () => Promise<unknown>;
    listPersonFacts?: (input: { consumerDomain: PcDomain; host: PcHost }) => Promise<PersonFact[]>;
  };
  budgets?: {
    getPurchaseContext?: (input: { amount?: number | null; category: BudgetCategory }) => Promise<PurchaseContext>;
  };
  meals?: {
    getCurrentGroceryList?: (input?: {
      skipCalibrationContext?: boolean;
      today?: string | null;
      weekStart?: string | null;
    }) => Promise<unknown>;
    getInventory?: () => Promise<unknown[]>;
    getMealMemory?: (recipeId?: string) => Promise<unknown[]>;
    getOnboardingCalibration?: (input?: { includeCurrentGroceryList?: boolean }) => Promise<unknown>;
    getPreferences?: () => Promise<unknown>;
    getPlan?: (input?: { today?: string | null; weekStart?: string | null }) => Promise<unknown | null>;
    getRecipe?: (recipeId: string) => Promise<unknown | null>;
    listDomainEvents?: (filters?: { entityId?: string; entityType?: string; limit?: number }) => Promise<unknown[]>;
    listPlanHistory?: (input?: { limit?: number | null }) => Promise<unknown[]>;
    listRecipes?: (mealType?: string, status?: string) => Promise<unknown[]>;
  };
  style?: {
    getContext?: () => Promise<unknown>;
    getItem?: (itemId: string) => Promise<unknown | null>;
    getItemProvenance?: (itemId: string) => Promise<unknown | null>;
    getOnboardingCalibration?: () => Promise<unknown>;
    getProfile?: () => Promise<unknown>;
    getVisualBundle?: (input: {
      candidate?: unknown;
      deliveryMode?: FluentVNextStyleVisualBundleDeliveryMode | null;
      includeComparators?: boolean | null;
      itemIds?: string[] | null;
      maxImages?: number | null;
      photoPreference?: 'product' | 'fit' | null;
    }) => Promise<unknown>;
    listEvidenceGaps?: (input?: { priorityFilter?: FluentVNextStyleEvidenceGapPriorityFilter | null }) => Promise<unknown>;
    listItems?: () => Promise<unknown[]>;
  };
}

export interface FluentVNextSharedProfile {
  object: 'SharedProfile';
  source: 'fluent_vnext_read_layer';
  profile: unknown;
  capabilities: unknown;
  facts: FluentVNextSharedFact[];
  boundaries: {
    domainProfilesStayTyped: boolean;
    writesRequireExplicitIntent: boolean;
  };
}

export interface FluentVNextSharedFact {
  id: string;
  value: unknown;
  domains: readonly FluentVNextDomain[];
  status: 'confirmed' | 'inferred' | 'system';
  source: string;
}

export interface FluentVNextContextPacket {
  object: 'ContextPacket';
  domain: FluentVNextDomain;
  intent: FluentVNextReadIntent;
  compactFacts: unknown[];
  responseGuidance?: unknown;
  relevantItems: FluentVNextDomainItem[];
  evidenceGaps: unknown[];
  freshness: {
    source: string;
    status: 'current' | 'stale' | 'unknown' | 'not_implemented';
  };
  suggestedWritebacks: unknown[];
  sourceReads: string[];
}

export interface FluentVNextDomainItem {
  object: 'DomainItem';
  domain: FluentVNextDomain;
  id: string;
  match?: {
    matchedFields: string[];
    query: string;
    quality: 'exact' | 'partial';
  };
  type: string;
  status: string | null;
  source: string;
  payload: unknown;
  provenance: unknown | null;
  reanalyzeDirective?: string;
  responseGuidance?: unknown;
}

export interface FluentVNextItemListPage {
  object: 'ItemListPage';
  domain: FluentVNextDomain;
  itemType: FluentVNextItemType | null;
  items: FluentVNextDomainItem[];
  limit: number | null;
  nextCursor?: string;
  next_cursor?: string;
  query: string | null;
  status: string | null;
  total: number;
}

const MEALS_HARD_CONSTRAINT_USAGE =
  'MealsHardConstraints lists CONFIRMED Tier-1 dietary exclusions (allergies, hard avoids). A confirmed allergy or hard avoid is authoritative: do NOT draft, suggest, or save any meal, recipe, or grocery item that contains it, and do NOT reason around it - a fresh-vs-frozen or raw-vs-cooked form, a saved recipe by name, or a conflicting like/favorite does NOT override a confirmed exclusion. Fluent does not filter recipes; you own the plan, so you must honor these when you draft, and exclude any conflicting saved recipe (it is tagged conflictsWithHardConstraint in the recipe index) with a brief reason. Treat severity:medical as the strictest. If the user EXPLICITLY overrides an exclusion this turn (e.g. "I outgrew that, plan it anyway"), surface the conflict and get one explicit confirmation BEFORE including it, then offer to update the fact - never silently override and never silently drop the user\'s request.';

const MEALS_SOFT_PREFERENCES_USAGE =
  'MealsSoftPreferences are SOFT signals, not rules. Lean toward `likes` and away from `dislikes` when choosing among otherwise-acceptable options - but they are NOT exclusions: never hard-exclude or refuse a recipe/ingredient solely for a soft preference, never override an explicit in-turn user request (if the user asks for a disliked food, plan it), and never silently drop a user\'s choice. Hard constraints (MealsHardConstraints) always outrank soft preferences. A soft preference shapes ranking/variety, it does not gate.';

const MEALS_DIETARY_PATTERNS_USAGE =
  'MealsDietaryPatterns are confirmed light-touch identity defaults: treat the listed classes as standing default exclusions when planning, after MealsHardConstraints and before MealsSoftPreferences. Recipe tags use saved recipe names plus structured ingredient names for obvious conflicts, but the host still owns the final plan and must exclude a recipe whose full ingredients contain an excluded class even when untagged, including hidden animal products such as gelatin, rennet, fish sauce, or stock. If the user asks for an off-pattern dish this turn, plan it and optionally offer to note the exception - do NOT double-confirm. Annotate only: Fluent never vetoes a recipe; the host decides.';

type MealsHardConstraintExclusion = {
  factId: string;
  kind: 'allergy' | 'hard_avoid';
  value: string;
  severity?: 'medical' | 'avoid';
  status: 'confirmed';
};

type MealsHardConstraintsCompactFact = {
  object: 'MealsHardConstraints';
  tier: 'person_fact';
  source: 'core.listPersonFacts';
  confirmedExclusions: MealsHardConstraintExclusion[];
  usage: string;
};

type MealsSoftPreferenceSignal = {
  factId: string;
  kind: 'anti_favorite' | 'taste_pref';
  value: string;
  strength?: 'mild' | 'strong';
  status: 'confirmed';
};

type MealsSoftPreferencesCompactFact = {
  object: 'MealsSoftPreferences';
  tier: 'person_fact';
  source: 'core.listPersonFacts';
  dislikes: MealsSoftPreferenceSignal[];
  likes: MealsSoftPreferenceSignal[];
  usage: string;
};

type MealsDietaryPatternExclusion = {
  factId: string;
  pattern: DietaryPattern;
  status: 'confirmed';
  excludedClasses: string[];
};

type MealsDietaryPatternsCompactFact = {
  object: 'MealsDietaryPatterns';
  tier: 'person_fact';
  source: 'core.listPersonFacts';
  patterns: MealsDietaryPatternExclusion[];
  excludedClasses: string[];
  usage: string;
};

export interface FluentVNextEvidenceRecord {
  object: 'Evidence';
  domain: FluentVNextDomain;
  subject: string | null;
  claim: string | null;
  source: string;
  payload: unknown;
}

export interface FluentVNextMediaBundle {
  object: 'MediaBundle';
  domain: FluentVNextDomain;
  subject: string | null;
  purpose: FluentVNextMediaBundlePurpose;
  deliveryMode: FluentVNextMediaBundleDeliveryMode;
  source: string;
  payload: unknown;
  constraints: string[];
}

export interface FluentVNextPurchaseContext extends PurchaseContext {
  object: 'PurchaseContext';
  source: 'budgets.getPurchaseContext';
}

export interface FluentVNextPurchaseCandidate {
  category?: string | null;
  image_urls?: string[] | null;
  name: string;
  price_text?: string | null;
  subcategory?: string | null;
}

export async function getFluentVNextSharedProfile(
  services: FluentVNextReadServices,
  input: { host?: PcHost | null } = {},
): Promise<FluentVNextSharedProfile> {
  const host = normalizeHost(input.host);
  const [profile, capabilities, personFacts] = await Promise.all([
    services.core.getProfile(),
    services.core.getCapabilities(),
    services.core.listPersonFacts ? services.core.listPersonFacts({ consumerDomain: 'shared', host }) : [],
  ]);
  const facts = buildSharedFactsFromPersonFacts(profile, personFacts);
  return {
    object: 'SharedProfile',
    source: 'fluent_vnext_read_layer',
    profile,
    capabilities,
    facts,
    boundaries: {
      domainProfilesStayTyped: true,
      writesRequireExplicitIntent: true,
    },
  };
}

export async function getFluentVNextContext(
  services: FluentVNextReadServices,
  input: {
    amount?: number | null;
    candidate?: FluentVNextPurchaseCandidate | null;
    domain: FluentVNextDomain;
    host?: PcHost | null;
    intent?: FluentVNextReadIntent;
  },
): Promise<FluentVNextContextPacket> {
  const intent = input.intent ?? 'unknown';
  const host = normalizeHost(input.host);
  if (input.domain === 'shared') {
    const sharedProfile = await getFluentVNextSharedProfile(services, { host });
    return contextPacket({
      compactFacts: sharedProfile.facts,
      domain: 'shared',
      intent,
      sourceReads: ['core.getProfile', 'core.getCapabilities', 'core.listPersonFacts'],
    });
  }

  if (input.domain === 'meals') {
    requireService(services.meals, 'meals');
    const planningIntent = intent === 'today' || intent === 'planning';
    // The cross-domain budget seam is OPTIONAL context — it must never break meals planning (R-1).
    // Defer the call so even a synchronous throw (e.g. a host without a budgets service) becomes a
    // caught rejection that degrades to no-seam rather than failing the whole packet.
    const budgetSeamRead =
      planningIntent && services.budgets?.getPurchaseContext
        ? Promise.resolve()
            .then(() => services.budgets!.getPurchaseContext!({ category: 'meals-groceries' }))
            .catch(() => null)
        : Promise.resolve(null);
    const [calibration, personFacts, budgetPurchaseContext] = await Promise.all([
      services.meals.getOnboardingCalibration
        ? services.meals.getOnboardingCalibration({ includeCurrentGroceryList: planningIntent })
        : null,
      services.core.listPersonFacts ? services.core.listPersonFacts({ consumerDomain: 'meals', host }) : [],
      budgetSeamRead,
    ]);
    // Planning needs durable meal memory in the packet itself (single reads, not a detail chain):
    // saved recipes, recent outcomes, and an on-hand inventory signal compacted below.
    const [grocery, recipes, inventory, mealMemory] = planningIntent
      ? await Promise.all([
          services.meals.getCurrentGroceryList?.({ skipCalibrationContext: true }) ?? null,
          services.meals.listRecipes?.(undefined, 'active') ?? [],
          services.meals.getInventory?.() ?? [],
          services.meals.getMealMemory?.() ?? [],
        ])
      : [null, [] as unknown[], [] as unknown[], [] as unknown[]];
    const mealsHardConstraints = buildMealsHardConstraintsCompactFact(personFacts);
    const mealsSoftPreferences = buildMealsSoftPreferencesCompactFact(personFacts, mealsHardConstraints?.confirmedExclusions ?? []);
    const mealsDietaryPatterns = buildMealsDietaryPatternsCompactFact(personFacts);
    const outcomeSignals = planningIntent ? mealsOutcomeSignals(mealMemory, recipes) : null;
    const recipeIndex = planningIntent
      ? mealsRecipeIndex(
          recipes,
          mealsHardConstraints?.confirmedExclusions ?? [],
          mealsDietaryPatterns?.patterns ?? [],
          outcomeSignals?.signals ?? [],
        )
      : null;
    const inventorySummary = planningIntent ? mealsInventorySummary(inventory) : null;
    const sharedPersonFacts = buildPersonFactsCompactFact(personFacts, 'meals');
    const budgetsSeam = budgetPurchaseContext ? buildDerivedSeamCompactFact(toDerivedSeam(budgetPurchaseContext)) : null;
    return contextPacket({
      compactFacts: [
        mealsHardConstraints,
        mealsDietaryPatterns,
        mealsSoftPreferences,
        mealsKnowledgeSummary(calibration, grocery, intent),
        sharedPersonFacts,
        budgetsSeam,
        planningIntent ? mealsCurrentnessFact(grocery, intent) : null,
        outcomeSignals?.fact,
        recipeIndex,
        inventorySummary,
      ].filter(Boolean),
      domain: 'meals',
      evidenceGaps: [
        ...evidenceGapsFromPayload(calibration),
        ...mealsCurrentnessEvidenceGaps(grocery, calibration, intent),
      ],
      freshnessStatus: grocery ? freshnessStatusFromPayload(grocery) : planningIntent ? 'unknown' : undefined,
      intent,
      relevantItems: grocery ? [domainItem('meals', 'current_grocery_list', 'grocery_list', grocery, 'meals.getCurrentGroceryList')] : [],
      sourceReads: [
        ...(calibration ? ['meals.getOnboardingCalibration'] : []),
        'core.listPersonFacts',
        ...(budgetPurchaseContext ? ['budgets.getPurchaseContext'] : []),
        ...(grocery ? ['meals.getCurrentGroceryList'] : []),
        // Gate on the method existing (not on the summary), so we never report a read we could not
        // perform: mealsRecipeIndex always returns an object even for an empty/absent recipe list.
        ...(planningIntent && services.meals.listRecipes ? ['meals.listRecipes'] : []),
        ...(planningIntent && services.meals.getInventory ? ['meals.getInventory'] : []),
        ...(planningIntent && services.meals.getMealMemory ? ['meals.getMealMemory'] : []),
      ],
      responseGuidance: mealsResponseGuidance(intent),
      suggestedWritebacks: buildMealsSuggestedWritebacks(calibration, grocery, intent, personFacts),
    });
  }

  if (input.domain === 'style') {
    requireService(services.style, 'style');
    if (intent === 'purchase' && input.candidate) {
      return getStylePurchaseContextPacket(services, {
        amount: input.amount ?? null,
        candidate: input.candidate,
        host,
        intent,
      });
    }
    const [calibration, context, gaps, personFacts] = await Promise.all([
      services.style.getOnboardingCalibration?.() ?? null,
      services.style.getContext?.() ?? null,
      services.style.listEvidenceGaps?.({ priorityFilter: 'actionable' }) ?? null,
      services.core.listPersonFacts ? services.core.listPersonFacts({ consumerDomain: 'style', host }) : [],
    ]);
    const sharedPersonFacts = buildPersonFactsCompactFact(personFacts, 'style');
    return contextPacket({
      compactFacts: [calibration, context, sharedPersonFacts].filter(Boolean),
      domain: 'style',
      evidenceGaps: [
        ...evidenceGapsFromPayload(calibration),
        ...evidenceGapsFromPayload(context),
        ...(gaps ? [gaps] : []),
      ],
      intent,
      sourceReads: [
        ...(calibration ? ['style.getOnboardingCalibration'] : []),
        ...(context ? ['style.getContext'] : []),
        ...(gaps ? ['style.listEvidenceGaps'] : []),
        'core.listPersonFacts',
      ],
      responseGuidance: styleResponseGuidance(intent, context),
    });
  }

  return contextPacket({
    domain: input.domain,
    intent,
    freshnessStatus: 'not_implemented',
    responseGuidance: reservedDomainResponseGuidance(input.domain, intent),
    sourceReads: [],
  });
}

async function getStylePurchaseContextPacket(
  services: FluentVNextReadServices,
  input: {
    amount: number | null;
    candidate: FluentVNextPurchaseCandidate;
    host: PcHost;
    intent: FluentVNextReadIntent;
  },
): Promise<FluentVNextContextPacket> {
  requireService(services.style, 'style');
  const categoryResolution = resolveStylePurchaseCategory(input.candidate);
  const personFactsPromise = services.core.listPersonFacts
    ? services.core.listPersonFacts({ consumerDomain: 'style', host: input.host })
    : Promise.resolve([]);
  const [items, personFacts] = await Promise.all([
    services.style.listItems?.() ?? [],
    personFactsPromise,
  ]);
  const sharedPersonFacts = buildPersonFactsCompactFact(personFacts, 'style');
  const blockingGaps: unknown[] = [];
  const compactFacts: unknown[] = [
    categoryResolution,
    sharedPersonFacts,
  ].filter(Boolean);
  const sourceReads = [
    'style.listItems',
    ...(services.core.listPersonFacts ? ['core.listPersonFacts'] : []),
  ];

  if (!categoryResolution.resolvedCategory || categoryResolution.confidence < 0.8 || categoryResolution.ambiguity.length > 0) {
    const completeness = stylePurchaseCompleteness({
      complete: false,
      itemIds: [],
      resolvedCategory: categoryResolution.resolvedCategory,
      scope: 'blocked:category_not_reliable',
      serializedCount: 0,
      totalMatched: 0,
    });
    compactFacts.push(completeness);
    blockingGaps.push(stylePurchaseBlockingGap(
      'style_purchase_category_not_reliable',
      'Candidate category is not reliable enough to claim a complete owned-category slice.',
    ));
  } else {
    const ownedSlice = await buildStylePurchaseOwnedSlice(services, items, categoryResolution.resolvedCategory);
    compactFacts.push(ownedSlice.fact, ownedSlice.completeness);
    sourceReads.push('style.getVisualBundle:product');
    if (ownedSlice.fitImageFetchAttempted) {
      sourceReads.push('style.getVisualBundle:fit');
    }
  }

  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount)) {
    blockingGaps.push(stylePurchaseBlockingGap(
      'style_purchase_amount_required',
      'Purchase amount is required for style purchase verdict context; ask the user for the candidate price, then pass it as amount so Fluent can return exact budget over/under arithmetic. Fluent will not default or estimate missing price into a benign budget signal.',
    ));
  } else if (!hasUsablePriceText(input.candidate.price_text)) {
    blockingGaps.push(stylePurchaseBlockingGap(
      'style_purchase_price_text_required',
      'Pass the candidate\'s exact listing price_text (the price string you saw); amount must equal its number. If you cannot extract a clean price, ask the user - do not estimate.',
    ));
  } else if (!services.budgets?.getPurchaseContext) {
    blockingGaps.push(stylePurchaseBlockingGap(
      'style_purchase_budget_service_missing',
      'Budget arithmetic is required for style purchase verdict context, but budgets.getPurchaseContext is unavailable.',
    ));
  } else {
    const sourcePriceText = input.candidate.price_text;
    const parsedPriceText = parsePriceText(sourcePriceText);
    const priceMatchesSource = parsedPriceText.kind !== 'none' && priceTextMatchesAmount(input.amount, parsedPriceText);
    if (parsedPriceText.kind !== 'none' && !priceMatchesSource && parsedPriceText.currency !== 'non_cad') {
      blockingGaps.push(stylePurchaseBlockingGap(
        'style_purchase_price_mismatch',
        `amount=${roundCurrency(input.amount)} does not match the cited price_text number (${describeParsedPriceText(parsedPriceText)}); recheck the listing or confirm the price with the user.`,
      ));
    } else {
      const budgetContext = await services.budgets.getPurchaseContext({
        amount: input.amount,
        category: 'style-clothing',
      });
      const priceVerifiedAgainstSource = priceMatchesSource;
      const priceCaveats = priceTextCaveats(parsedPriceText, priceMatchesSource);
      compactFacts.push(stylePurchaseBudgetArithmeticFact(
        input.amount,
        categoryResolution.resolvedCategory,
        budgetContext,
        {
          priceVerifiedAgainstSource,
          sourcePriceText,
          caveats: priceCaveats,
        },
      ));
      if (parsedPriceText.kind === 'none') {
        blockingGaps.push(stylePurchaseEvidenceNote(
          'price_unverified_unparseable_source',
          'The cited price_text could not be parsed into a number; confirm the price you saw with the user before making a budget-sensitive purchase recommendation.',
        ));
      } else if (parsedPriceText.currency === 'non_cad' && !priceMatchesSource) {
        blockingGaps.push(stylePurchaseEvidenceNote(
          'price_currency_or_conversion_unverified',
          'The cited price may be a different currency or the amount may be a converted value; confirm the listing currency and converted CAD price before making a budget-sensitive purchase recommendation.',
        ));
      }
      sourceReads.push('budgets.getPurchaseContext');
    }
  }

  return contextPacket({
    compactFacts,
    domain: 'style',
    evidenceGaps: blockingGaps,
    intent: input.intent,
    sourceReads,
    responseGuidance: styleResponseGuidance(input.intent),
  });
}

export async function getFluentVNextPurchaseContext(
  services: FluentVNextReadServices,
  input: { amount?: number | null; category: BudgetCategory },
): Promise<FluentVNextPurchaseContext> {
  requireService(services.budgets, 'budgets');
  if (!services.budgets.getPurchaseContext) {
    throw new Error('budgets.getPurchaseContext is not available.');
  }
  const context = await services.budgets.getPurchaseContext({
    amount: input.amount ?? null,
    category: input.category,
  });
  return {
    object: 'PurchaseContext',
    source: 'budgets.getPurchaseContext',
    ...context,
  };
}

export async function listFluentVNextItems(
  services: FluentVNextReadServices,
  input: {
    cursor?: string | null;
    domain: FluentVNextDomain;
    itemType?: FluentVNextItemType | null;
    limit?: number | null;
    query?: string | null;
    status?: string | null;
  },
): Promise<FluentVNextDomainItem[]> {
  return (await listFluentVNextItemsPage(services, input)).items;
}

export async function listFluentVNextItemsPage(
  services: FluentVNextReadServices,
  input: {
    cursor?: string | null;
    domain: FluentVNextDomain;
    itemType?: FluentVNextItemType | null;
    limit?: number | null;
    query?: string | null;
    status?: string | null;
  },
): Promise<FluentVNextItemListPage> {
  const resolvedInput = withDefaultListLimit(input);
  const items = await listFluentVNextItemsUnpaged(services, resolvedInput);
  return paginateDomainItems(items, resolvedInput);
}

// A bare `fluent_list_items(domain="meals", item_type="recipe")` with no limit used to return every
// saved recipe unpaged, which the host then truncated mid-list (the "couldn't see all 43 recipes"
// failure). Default the recipe read to a bounded, cursor-paged page so it can never dump unbounded.
const DEFAULT_MEALS_RECIPE_LIST_LIMIT = 25;
// Default the style closet list to a bounded, cursor-paged page. Without a limit, paginateDomainItems
// returns every item with NO cursor; the model-visible serializer then caps the array (MAX_LIST_ITEMS)
// and the hidden tail becomes unreachable. A default page (<= the serializer cap) keeps every item
// reachable via nextCursor — mirrors the meals recipe-list default that fixed the same "couldn't see all" gap.
const DEFAULT_STYLE_LIST_LIMIT = 50;

function withDefaultListLimit<T extends { domain: FluentVNextDomain; itemType?: FluentVNextItemType | null; limit?: number | null }>(
  input: T,
): T {
  if (input.limit != null) {
    return input;
  }
  if (input.domain === 'meals' && (input.itemType == null || input.itemType === 'recipe')) {
    return { ...input, limit: DEFAULT_MEALS_RECIPE_LIST_LIMIT };
  }
  if (input.domain === 'style') {
    return { ...input, limit: DEFAULT_STYLE_LIST_LIMIT };
  }
  return input;
}

async function listFluentVNextItemsUnpaged(
  services: FluentVNextReadServices,
  input: {
    domain: FluentVNextDomain;
    itemType?: FluentVNextItemType | null;
    limit?: number | null;
    query?: string | null;
    status?: string | null;
  },
): Promise<FluentVNextDomainItem[]> {
  if (input.domain === 'meals') {
    requireService(services.meals, 'meals');
    if (input.itemType === 'grocery_list') {
      const grocery = await services.meals.getCurrentGroceryList?.({ skipCalibrationContext: true });
      const match = groceryListMatch(grocery, input.query);
      return grocery && (!input.query || match)
        ? [domainItem('meals', 'current_grocery_list', 'grocery_list', grocery, 'meals.getCurrentGroceryList', match)]
        : [];
    }
    if (input.itemType === 'meal_plan') {
      const plans =
        await services.meals.listPlanHistory?.({ limit: input.limit ?? 10 }) ??
        (await services.meals.getPlan?.() ? [await services.meals.getPlan?.()] : []);
      return applyListLimit(
        plans
          .filter(Boolean)
          .map((entry) => domainItem('meals', itemId(entry), 'meal_plan', entry, 'meals.listPlanHistory', mealPlanMatch(entry, input.query)))
          .filter((entry) => !input.query || entry.match),
        input.limit,
      );
    }
    if (input.itemType === 'inventory_item') {
      const inventory = await services.meals.getInventory?.() ?? [];
      return inventory
        .map((entry) => domainItem('meals', itemId(entry), 'inventory_item', entry, 'meals.getInventory', inventoryItemMatch(entry, input.query)))
        .filter((entry) => inventoryItemStatusMatches(entry, input.status))
        .filter((entry) => !input.query || entry.match);
    }
    const mealTypeFilter = recipeMealTypeFromQuery(input.query);
    const recipes = await services.meals.listRecipes?.(mealTypeFilter ?? undefined, input.status ?? undefined) ?? [];
    // Return the full matched set and let paginateDomainItems own the bound (with the recipe default
    // limit applied in listFluentVNextItemsPage). Bounding here too would make paginate report a
    // truncated total and drop the next_cursor, so recipes past the first page become unreachable.
    return recipes
      .map((entry) => domainItem('meals', itemId(entry), 'recipe', entry, 'meals.listRecipes', recipeMatch(entry, input.query)))
      .filter((entry) => !input.query || entry.match);
  }

  if (input.domain === 'style') {
    requireService(services.style, 'style');
    const items = await services.style.listItems?.() ?? [];
    return items
      .map((entry) => domainItem('style', itemId(entry), 'style_item', entry, 'style.listItems', styleItemMatch(entry, input.query)))
      .filter((entry) => styleItemStatusMatches(entry, input.status))
      .filter((entry) => !input.query || entry.match)
      // A list is an ENUMERATION: return a compact per-item summary (identity, color, size, photo count,
      // and a profile signal: method/itemType/styleRole/tagCount) so a full page fits the model-visible
      // text budget and the host can audit metadata across the whole closet. Full descriptors (fit
      // observations, pairing notes, etc.) stay in fluent_get_item.
      .map((item) => ({ ...item, payload: compactStyleListItem(item.payload) }));
  }

  return [];
}

// Compact projection for a style item in a LIST response. Drops the heavy profile.raw descriptor block
// (the bulk of the payload) and the photo array, keeping identity, color, size, the comparator slot, a
// photo count, and a profile signal sufficient to audit metadata completeness. fluent_get_item still
// returns the full record.
function compactStyleListItem(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const item = payload as Record<string, unknown>;
  const profile = item.profile && typeof item.profile === 'object' ? (item.profile as Record<string, unknown>) : null;
  const raw = profile && profile.raw && typeof profile.raw === 'object' ? (profile.raw as Record<string, unknown>) : null;
  const photosCount = Array.isArray(item.photos)
    ? item.photos.length
    : typeof item.photosCount === 'number'
      ? item.photosCount
      : 0;
  const photos = Array.isArray(item.photos)
    ? item.photos.filter((photo): photo is Record<string, unknown> => Boolean(photo) && typeof photo === 'object' && !Array.isArray(photo))
    : [];
  return {
    id: item.id ?? null,
    legacyItemId: item.legacyItemId ?? null,
    brand: item.brand ?? null,
    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
    name: item.name ?? null,
    size: item.size ?? null,
    colorFamily: item.colorFamily ?? null,
    colorHex: item.colorHex ?? null,
    colorName: item.colorName ?? null,
    comparatorKey: item.comparatorKey ?? null,
    formality: item.formality ?? null,
    status: item.status ?? null,
    hasDisplayPhoto: photos.some(isStyleDisplayPhoto),
    hasFitPhoto: photos.some(isStyleFitPhoto),
    photosCount,
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
    profile: profile
      ? {
          method: profile.method ?? null,
          itemType: raw?.itemType ?? null,
          reanalyzePending: raw?.reanalyzePending === true,
          styleRole: raw?.styleRole ?? null,
          tagCount: Array.isArray(raw?.tags) ? (raw!.tags as unknown[]).length : 0,
        }
      : null,
    reanalyzePending: raw?.reanalyzePending === true,
  };
}

const STYLE_REANALYZE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STYLE_REANALYZE_DIRECTIVE =
  'This item is queued for re-analysis, which the user already approved by requesting it, so pass approval="explicit_user_approved" on the refresh. If a photo is attached inline in this result, inspect it now and call fluent_refresh_style_item_profile with approval="explicit_user_approved", source="host_vision", and has_image:true; do not ask first. If no photo is attached, say the photo was not available and refresh only text-supported fields with approval="explicit_user_approved" and source="host_text" without fabricating visual descriptors. Field routing: fluent://guidance/style-enrichment.';

function activeStyleReanalyzeDirective(item: unknown): string | null {
  const raw = styleItemProfileRaw(item);
  if (raw?.reanalyzePending !== true) {
    return null;
  }
  const requestedAt = typeof raw.reanalyzeRequestedAt === 'string' ? raw.reanalyzeRequestedAt : null;
  if (!requestedAt) {
    return null;
  }
  const requestedAtMs = Date.parse(requestedAt);
  if (!Number.isFinite(requestedAtMs)) {
    return null;
  }
  const ageMs = Date.now() - requestedAtMs;
  return ageMs >= 0 && ageMs <= STYLE_REANALYZE_TTL_MS ? STYLE_REANALYZE_DIRECTIVE : null;
}

function passiveStyleReanalyzeSummary(context: unknown): unknown | null {
  const record = objectRecord(context);
  if (!record) {
    return null;
  }
  const count = typeof record.pendingReanalyzeCount === 'number' ? Math.max(0, Math.floor(record.pendingReanalyzeCount)) : 0;
  if (count <= 0) {
    return null;
  }
  const itemIds = Array.isArray(record.pendingReanalyzeItemIds)
    ? record.pendingReanalyzeItemIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).slice(0, 3)
    : [];
  return {
    count,
    itemIds,
    note: `${count} closet item${count === 1 ? ' is' : 's are'} queued for re-analysis; each refreshes from its photo when you next view that item.`,
  };
}

function styleItemProfileRaw(item: unknown): Record<string, unknown> | null {
  const record = objectRecord(item);
  const profile = objectRecord(record?.profile);
  return objectRecord(profile?.raw);
}

function resolveStylePurchaseCategory(candidate: FluentVNextPurchaseCandidate): {
  object: 'CategoryResolution';
  inputCategory: string | null;
  resolvedCategory: string | null;
  confidence: number;
  ambiguity: string[];
  source: 'style.normalizeStylePurchaseCandidate';
} {
  const inputCategory = candidate.category?.trim() || null;
  const explicitCategory = normalizeStyleCategoryStrict(inputCategory);
  if (explicitCategory) {
    return {
      object: 'CategoryResolution',
      inputCategory,
      resolvedCategory: explicitCategory,
      confidence: 1,
      ambiguity: [],
      source: 'style.normalizeStylePurchaseCandidate',
    };
  }

  try {
    const normalizedCandidate = normalizeStylePurchaseCandidate({
      category: candidate.category ?? undefined,
      imageUrls: candidate.image_urls ?? undefined,
      name: candidate.name,
      notes: [candidate.name, candidate.subcategory, candidate.price_text].filter(Boolean).join(' '),
      subcategory: candidate.subcategory ?? undefined,
    });
    const inferredCategory = normalizeStyleCategoryStrict(normalizedCandidate.category);
    if (inferredCategory) {
      return {
        object: 'CategoryResolution',
        inputCategory,
        resolvedCategory: inferredCategory,
        confidence: inputCategory ? 0.72 : 0.84,
        ambiguity: inputCategory ? ['non_canonical_input_category'] : [],
        source: 'style.normalizeStylePurchaseCandidate',
      };
    }
  } catch {
    // Fall through to the blocking resolution below; callers surface the gap in the packet.
  }

  return {
    object: 'CategoryResolution',
    inputCategory,
    resolvedCategory: null,
    confidence: 0,
    ambiguity: ['category_not_resolved'],
    source: 'style.normalizeStylePurchaseCandidate',
  };
}

async function buildStylePurchaseOwnedSlice(
  services: FluentVNextReadServices,
  rawItems: unknown[],
  resolvedCategory: string,
): Promise<{
  completeness: ReturnType<typeof stylePurchaseCompleteness>;
  fact: {
    object: 'StylePurchaseOwnedSlice';
    source: 'style.listItems+style.getVisualBundle';
    resolvedCategory: string;
    items: unknown[];
    completeness: ReturnType<typeof stylePurchaseCompleteness>;
    guidance: string;
  };
  fitImageFetchAttempted: boolean;
}> {
  requireService(services.style, 'style');
  const records = rawItems
    .map(objectRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const matchedItems = records.filter((item) => {
    const status = stringField(item, 'status');
    const category = normalizeStyleCategoryStrict(stringField(item, 'category'));
    return status === 'active' && category === resolvedCategory;
  });
  const itemIds = matchedItems.map((item) => stringField(item, 'id')).filter((id): id is string => Boolean(id));
  const itemsWithFitPhoto = matchedItems.filter((item) => arrayField(item, 'photos').some(isStyleFitPhotoLike));
  const [displayBundle, fitBundle] = await Promise.all([
    services.style.getVisualBundle
      ? services.style.getVisualBundle({
          deliveryMode: 'authenticated_with_signed_fallback',
          includeComparators: false,
          itemIds,
          maxImages: Math.max(itemIds.length, 1),
          photoPreference: 'product',
        })
      : Promise.resolve(null),
    services.style.getVisualBundle && itemsWithFitPhoto.length > 0
      ? services.style.getVisualBundle({
          deliveryMode: 'authenticated_with_signed_fallback',
          includeComparators: false,
          itemIds: itemsWithFitPhoto.map((item) => stringField(item, 'id')).filter((id): id is string => Boolean(id)),
          maxImages: Math.max(itemsWithFitPhoto.length, 1),
          photoPreference: 'fit',
        })
      : Promise.resolve(null),
  ]);
  const displayAssets = visualBundleAssets(displayBundle);
  const fitAssets = visualBundleAssets(fitBundle);
  const imageUrlByItemId = new Map<string, string | null>();
  const displayPhotoIdByItemId = new Map<string, string | null>();
  for (const asset of displayAssets) {
    const itemId = stringField(asset, 'itemId');
    if (!itemId || imageUrlByItemId.has(itemId)) {
      continue;
    }
    imageUrlByItemId.set(itemId, visualAssetUrl(asset));
    displayPhotoIdByItemId.set(itemId, stringField(asset, 'photoId'));
  }
  const fitImageUrlByItemId = new Map<string, string | null>();
  for (const asset of fitAssets) {
    const itemId = stringField(asset, 'itemId');
    if (!itemId || fitImageUrlByItemId.has(itemId)) {
      continue;
    }
    const fitPhotoId = stringField(asset, 'photoId');
    const fitUrl = visualAssetUrl(asset);
    if (fitPhotoId && fitPhotoId === displayPhotoIdByItemId.get(itemId)) {
      continue;
    }
    if (fitUrl && fitUrl === imageUrlByItemId.get(itemId)) {
      continue;
    }
    fitImageUrlByItemId.set(itemId, fitUrl);
  }
  const items = matchedItems.map((item) => compactStylePurchaseOwnedItem(
    item,
    imageUrlByItemId.get(stringField(item, 'id') ?? '') ?? null,
    fitImageUrlByItemId.get(stringField(item, 'id') ?? '') ?? null,
  ));
  const completeness = stylePurchaseCompleteness({
    complete: true,
    itemIds,
    resolvedCategory,
    scope: `active_owned_category:${resolvedCategory}`,
    serializedCount: items.length,
    totalMatched: matchedItems.length,
  });
  return {
    completeness,
    fact: {
      object: 'StylePurchaseOwnedSlice',
      source: 'style.listItems+style.getVisualBundle',
      resolvedCategory,
      items,
      completeness,
      guidance:
        'This is the complete active owned-category slice for the resolved candidate category. The host model owns relevance, duplicate, gap, and verdict judgment; cite owned items by name. After the prose verdict, render fluent_render_style_closet_surface with filter.item_ids set to the items you judged true comparators (same wardrobe job as the candidate) so the user sees what they already own — comparator ids only, never the whole slice, and only when a true comparator exists.',
    },
    fitImageFetchAttempted: itemsWithFitPhoto.length > 0,
  };
}

function compactStylePurchaseOwnedItem(
  item: Record<string, unknown>,
  imageUrl: string | null,
  fitImageUrl: string | null,
): unknown {
  const profile = objectRecord(item.profile);
  const raw = objectRecord(profile?.raw);
  return {
    id: item.id ?? null,
    name: item.name ?? null,
    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
    color: {
      family: item.colorFamily ?? null,
      name: item.colorName ?? null,
      hex: item.colorHex ?? null,
    },
    attrs: {
      brand: item.brand ?? null,
      size: item.size ?? null,
      itemType: raw?.itemType ?? null,
      styleRole: raw?.styleRole ?? null,
      tags: Array.isArray(raw?.tags) ? raw.tags : [],
    },
    imageUrl,
    ...(fitImageUrl && fitImageUrl !== imageUrl ? { fitImageUrl } : {}),
  };
}

function stylePurchaseCompleteness(input: {
  complete: boolean;
  itemIds: string[];
  resolvedCategory: string | null;
  scope: string;
  serializedCount: number;
  totalMatched: number;
}): {
  object: 'StylePurchaseCompleteness';
  scope: string;
  complete: boolean;
  totalMatched: number;
  serializedCount: number;
  itemIds: string[];
  resolvedCategory: string | null;
} {
  return {
    object: 'StylePurchaseCompleteness',
    scope: input.scope,
    complete: input.complete,
    totalMatched: input.totalMatched,
    serializedCount: input.serializedCount,
    itemIds: input.itemIds,
    resolvedCategory: input.resolvedCategory,
  };
}

function stylePurchaseBudgetArithmeticFact(
  price: number,
  resolvedCategory: string | null,
  budgetContext: PurchaseContext,
  input: {
    caveats?: string[];
    priceVerifiedAgainstSource: boolean;
    sourcePriceText: string | null;
  },
): unknown {
  const remainingThisPeriod = budgetContext.targetSetup?.remainingThisPeriod ?? null;
  const delta = typeof remainingThisPeriod === 'number' ? roundCurrency(price - remainingThisPeriod) : null;
  return {
    object: 'BudgetArithmeticFact',
    source: 'budgets.getPurchaseContext',
    category: budgetContext.category,
    resolvedStyleCategory: resolvedCategory,
    price: roundCurrency(price),
    sourcePriceText: input.sourcePriceText,
    priceVerifiedAgainstSource: input.priceVerifiedAgainstSource,
    remainingThisPeriod,
    delta,
    status: delta != null && delta > 0 ? 'over' : 'under',
    caveats: [
      ...budgetContext.caveats,
      ...(input.caveats ?? []),
      ...(budgetContext.targetSetup ? [] : ['no_declared_budget_envelope']),
      'budget_fact_only_not_verdict_cap',
    ],
  };
}

type ParsedPriceText = {
  tokens: number[];
  currency: 'cad_compatible' | 'non_cad' | 'unknown';
  kind: 'single' | 'range' | 'none';
};

type PriceToken = {
  amount: number;
  currency: 'cad_compatible' | 'non_cad';
  end: number;
  marker: string | null;
  start: number;
  tokenStart: number;
};

const PRICE_CURRENCY_CODE_PATTERN = 'CAD|USD|EUR|GBP|AUD|NZD|CHF|JPY|CNY|HKD|SGD';
const PRICE_DOLLAR_PREFIX_PATTERN = 'CAD|CA|C|USD|US|AUD|AU|A|HKD|HK|NZD|NZ|SGD|SG|EUR|GBP|CHF|JPY|CNY';
const PRICE_NUMBER_PATTERN = String.raw`(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const PRICE_COMPARISON_LABEL_PATTERN = /\b(?:was|reg|regular|orig|originally|compare at|compare|save|rrp|msrp)\b/i;
const PRICE_CURRENT_LABEL_PATTERN = /\b(?:now|sale|price)\b/i;

function hasUsablePriceText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parsePriceText(text: string): ParsedPriceText {
  const trimmed = text.trim();
  if (!trimmed || hasAmbiguousPriceLocale(trimmed)) {
    return nonePriceText();
  }
  const anchoredTokens = extractAnchoredPriceTokens(trimmed);
  if (anchoredTokens.length === 1) {
    const secondRangeAmount = parseInheritedCurrencyRangeAmount(trimmed, anchoredTokens[0]);
    if (secondRangeAmount != null) {
      return {
        tokens: [anchoredTokens[0].amount, secondRangeAmount],
        currency: anchoredTokens[0].currency,
        kind: 'range',
      };
    }
    return singlePriceText(anchoredTokens[0]);
  }
  if (anchoredTokens.length >= 2) {
    const explicitRange = anchoredTokens.length === 2 && hasExplicitPriceRange(trimmed, anchoredTokens[0], anchoredTokens[1]);
    if (explicitRange) {
      return {
        tokens: anchoredTokens.map((token) => token.amount),
        currency: priceTokenCurrency(anchoredTokens),
        kind: 'range',
      };
    }
    const saleToken = selectSaleCurrentPriceToken(trimmed, anchoredTokens);
    if (saleToken) {
      return singlePriceText(saleToken);
    }
    return nonePriceText();
  }
  const bareAmount = parseBarePriceText(trimmed);
  return bareAmount == null
    ? nonePriceText()
    : { tokens: [bareAmount], currency: 'cad_compatible', kind: 'single' };
}

function priceTextMatchesAmount(amount: number, parsedPriceText: ParsedPriceText): boolean {
  const tolerance = Math.max(1, 0.02 * amount);
  if (parsedPriceText.kind === 'single') {
    return Math.abs(parsedPriceText.tokens[0] - amount) <= tolerance;
  }
  if (parsedPriceText.kind === 'range') {
    const min = Math.min(...parsedPriceText.tokens);
    const max = Math.max(...parsedPriceText.tokens);
    return amount >= min - tolerance && amount <= max + tolerance;
  }
  return false;
}

function priceTextCaveats(parsedPriceText: ParsedPriceText, priceMatchesSource: boolean): string[] {
  if (parsedPriceText.kind === 'none') {
    return ['price_unverified_unparseable_source'];
  }
  if (parsedPriceText.currency === 'non_cad' && priceMatchesSource) {
    return ['price_currency_unverified'];
  }
  if (parsedPriceText.currency === 'non_cad') {
    return ['price_currency_or_conversion_unverified'];
  }
  return [];
}

function nonePriceText(): ParsedPriceText {
  return { tokens: [], currency: 'unknown', kind: 'none' };
}

function singlePriceText(token: PriceToken): ParsedPriceText {
  return { tokens: [token.amount], currency: token.currency, kind: 'single' };
}

function hasAmbiguousPriceLocale(text: string): boolean {
  return /\b\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:\.\d{1,2})?\b/.test(text) ||
    /(?:^|[^\d])\d+,\d{1,2}(?![\d,.])/.test(text);
}

function extractAnchoredPriceTokens(text: string): PriceToken[] {
  const tokens: PriceToken[] = [];
  const seenAmountSpans = new Set<string>();
  const prefixed = new RegExp(
    String.raw`(?<marker>\b(?:${PRICE_DOLLAR_PREFIX_PATTERN})\$|[$£€¥]|\b(?:${PRICE_CURRENCY_CODE_PATTERN})\b)\s*(?<amount>${PRICE_NUMBER_PATTERN})(?![\d,.])`,
    'gi',
  );
  const suffixed = new RegExp(
    String.raw`(?:^|[^\d,.\w#])(?<amount>${PRICE_NUMBER_PATTERN})(?![\d,.])\s*(?<marker>\b(?:${PRICE_CURRENCY_CODE_PATTERN})\b)`,
    'gi',
  );
  for (const match of text.matchAll(prefixed)) {
    const amountText = match.groups?.amount;
    const marker = match.groups?.marker ?? null;
    const amountIndex = amountText && match.index != null ? match[0].lastIndexOf(amountText) : -1;
    const amountStart = match.index != null && amountIndex >= 0 ? match.index + amountIndex : null;
    addPriceToken(tokens, seenAmountSpans, amountText, marker, amountStart, match.index ?? null);
  }
  for (const match of text.matchAll(suffixed)) {
    const amountText = match.groups?.amount;
    const marker = match.groups?.marker ?? null;
    const amountIndex = amountText && match.index != null ? match[0].indexOf(amountText) : -1;
    const amountStart = match.index != null && amountIndex >= 0 ? match.index + amountIndex : null;
    addPriceToken(tokens, seenAmountSpans, amountText, marker, amountStart, amountStart);
  }
  return tokens.sort((left, right) => left.tokenStart - right.tokenStart);
}

function addPriceToken(
  tokens: PriceToken[],
  seenAmountSpans: Set<string>,
  amountText: string | undefined,
  marker: string | null,
  amountStart: number | null,
  tokenStart: number | null,
): void {
  if (!amountText || amountStart == null || tokenStart == null) {
    return;
  }
  const amount = parseConfidentPriceAmount(amountText);
  if (amount == null) {
    return;
  }
  const spanKey = `${amountStart}:${amountStart + amountText.length}`;
  if (seenAmountSpans.has(spanKey)) {
    return;
  }
  seenAmountSpans.add(spanKey);
  tokens.push({
    amount,
    currency: currencyCompatibility(marker),
    end: amountStart + amountText.length,
    marker,
    start: amountStart,
    tokenStart,
  });
}

function parseBarePriceText(text: string): number | null {
  if (!/^\d[\d,. ]*\d$|^\d+$/.test(text)) {
    return null;
  }
  if (/\d\s+\d/.test(text) || hasAmbiguousPriceLocale(text)) {
    return null;
  }
  return parseConfidentPriceAmount(text);
}

function parseConfidentPriceAmount(rawAmount: string): number | null {
  if (/\s/.test(rawAmount) || /\d+,\d{1,2}(?![\d,.])/.test(rawAmount)) {
    return null;
  }
  if (rawAmount.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(rawAmount)) {
    return null;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount.replace(/,/g, ''))) {
    return null;
  }
  const amount = Number(rawAmount.replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function hasExplicitPriceRange(text: string, first: PriceToken, second: PriceToken): boolean {
  const between = text.slice(first.end, second.tokenStart);
  if (/^\s*(?:-|–|—|to)\s*$/i.test(between)) {
    return true;
  }
  const beforeFirst = text.slice(0, first.start);
  return /\bfrom\s*$/i.test(beforeFirst) && /^\s*to\s*$/i.test(between);
}

function parseInheritedCurrencyRangeAmount(text: string, first: PriceToken): number | null {
  const afterFirst = text.slice(first.end);
  const match = afterFirst.match(new RegExp(String.raw`^\s*(?:-|–|—|to)\s*(?<amount>${PRICE_NUMBER_PATTERN})(?![\d,.])`, 'i'));
  return parseConfidentPriceAmount(match?.groups?.amount ?? '');
}

function selectSaleCurrentPriceToken(text: string, tokens: PriceToken[]): PriceToken | null {
  if (!PRICE_COMPARISON_LABEL_PATTERN.test(text)) {
    return null;
  }
  const currentLabeled = tokens.filter((token) => tokenHasNearbyLabel(text, token, PRICE_CURRENT_LABEL_PATTERN));
  if (currentLabeled.length === 1) {
    return currentLabeled[0];
  }
  const nonComparisonTokens = tokens.filter((token) => !tokenHasLabelBefore(text, token, PRICE_COMPARISON_LABEL_PATTERN));
  if (nonComparisonTokens.length === 1) {
    return nonComparisonTokens[0];
  }
  const [first, ...rest] = tokens;
  if (!tokenHasLabelBefore(text, first, PRICE_COMPARISON_LABEL_PATTERN) &&
    rest.length > 0 &&
    rest.every((token) => tokenHasLabelBefore(text, token, PRICE_COMPARISON_LABEL_PATTERN))) {
    return first;
  }
  return null;
}

function tokenHasLabelBefore(text: string, token: PriceToken, labelPattern: RegExp): boolean {
  return labelPattern.test(text.slice(Math.max(0, token.start - 28), token.start));
}

function tokenHasNearbyLabel(text: string, token: PriceToken, labelPattern: RegExp): boolean {
  const before = text.slice(Math.max(0, token.start - 28), token.start);
  const after = text.slice(token.end, Math.min(text.length, token.end + 16));
  return labelPattern.test(before) || labelPattern.test(after);
}

function priceTokenCurrency(tokens: PriceToken[]): ParsedPriceText['currency'] {
  return tokens.some((token) => token.currency === 'non_cad') ? 'non_cad' : 'cad_compatible';
}

function currencyCompatibility(marker: string | null): PriceToken['currency'] {
  const normalizedMarker = marker?.toUpperCase() ?? null;
  if (!normalizedMarker || normalizedMarker === '$' || normalizedMarker === 'CAD' || normalizedMarker === 'C$' || normalizedMarker === 'CA$' || normalizedMarker === 'CAD$') {
    return 'cad_compatible';
  }
  return 'non_cad';
}

function describeParsedPriceText(parsedPriceText: ParsedPriceText): string {
  if (parsedPriceText.kind === 'single') {
    return String(roundCurrency(parsedPriceText.tokens[0]));
  }
  if (parsedPriceText.kind === 'range') {
    const min = roundCurrency(Math.min(...parsedPriceText.tokens));
    const max = roundCurrency(Math.max(...parsedPriceText.tokens));
    return `${min}-${max}`;
  }
  return 'unparseable';
}

function stylePurchaseBlockingGap(type: string, message: string): unknown {
  return {
    object: 'EvidenceGap',
    domain: 'style',
    severity: 'blocking',
    type,
    message,
  };
}

function stylePurchaseEvidenceNote(type: string, message: string): unknown {
  return {
    object: 'EvidenceGap',
    domain: 'style',
    severity: 'info',
    type,
    message,
  };
}

function visualBundleAssets(bundle: unknown): Record<string, unknown>[] {
  return arrayField(bundle, 'assets').map(objectRecord).filter((asset): asset is Record<string, unknown> => Boolean(asset));
}

function visualAssetUrl(asset: Record<string, unknown>): string | null {
  return firstString(asset, ['fallbackSignedOriginalUrl', 'authenticatedOriginalUrl', 'sourceUrl']);
}

function isStyleFitPhotoLike(photo: unknown): boolean {
  return Boolean(photo && typeof photo === 'object' && !Array.isArray(photo) && isStyleFitPhoto(photo as never));
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getFluentVNextItem(
  services: FluentVNextReadServices,
  input: { domain: FluentVNextDomain; itemId: string; itemType?: FluentVNextItemType | null },
): Promise<FluentVNextDomainItem | null> {
  if (input.domain === 'meals') {
    requireService(services.meals, 'meals');
    if (input.itemType === 'grocery_list' || input.itemId === 'current_grocery_list') {
      return getFluentVNextCurrentGroceryListItem(services);
    }
    if (input.itemType === 'meal_plan' || input.itemId === 'current_meal_plan') {
      const plan = await getMealsPlanByPublicItemId(services.meals, input.itemId);
      return plan ? domainItem('meals', itemId(plan, input.itemId), 'meal_plan', plan, 'meals.getPlan') : null;
    }
    if (input.itemType === 'inventory_item') {
      const inventory = await services.meals.getInventory?.() ?? [];
      const item = inventory.find((entry) => inventoryItemIdMatches(entry, input.itemId));
      return item
        ? domainItem('meals', itemId(item, input.itemId), 'inventory_item', item, 'meals.getInventory', {
          matchedFields: ['id'],
          query: input.itemId,
          quality: 'exact',
        })
        : null;
    }
    const recipe = await services.meals.getRecipe?.(input.itemId);
    if (recipe) {
      return domainItem('meals', itemId(recipe, input.itemId), 'recipe', recipe, 'meals.getRecipe');
    }
    const recipeByTitle = await findMealsRecipeByExactTitle(services.meals, input.itemId);
    return recipeByTitle
      ? domainItem('meals', itemId(recipeByTitle.recipe, input.itemId), 'recipe', recipeByTitle.recipe, 'meals.listRecipes', recipeByTitle.match)
      : null;
  }

  if (input.domain === 'style') {
    requireService(services.style, 'style');
    const item = await services.style.getItem?.(input.itemId);
    if (!item) {
      return null;
    }
    const result = domainItem('style', itemId(item, input.itemId), 'style_item', item, 'style.getItem');
    const directive = activeStyleReanalyzeDirective(item);
    return directive
      ? {
        ...result,
        reanalyzeDirective: directive,
        responseGuidance: {
          object: 'ResponseGuidance',
          domain: 'style',
          source: 'fluent_vnext_read_layer',
          reanalyzeDirective: directive,
        },
      }
      : result;
  }

  return null;
}

export async function listFluentVNextEvidence(
  services: FluentVNextReadServices,
  input: { claim?: string | null; domain?: FluentVNextDomain | null; subject?: string | null } = {},
): Promise<FluentVNextEvidenceRecord[]> {
  if (input.domain === 'meals') {
    requireService(services.meals, 'meals');
    const directRecipe = input.subject && looksLikeRecipeId(input.subject)
      ? await services.meals.getRecipe?.(input.subject)
      : null;
    if (input.subject && directRecipe) {
      return listMealsRecipeSubjectEvidence(services.meals, input.subject, input.claim ?? null, directRecipe);
    }
    const groceryLookup = await findMealsGroceryListEvidence(services.meals, input.subject ?? null, input.claim ?? null);
    if (groceryLookup.length) {
      return groceryLookup;
    }
    return input.subject ? listMealsRecipeSubjectEvidence(services.meals, input.subject, input.claim ?? null) : [];
  }

  if (input.domain === 'style') {
    requireService(services.style, 'style');
    if (input.subject) {
      const provenance = await services.style.getItemProvenance?.(input.subject);
      return provenance ? [evidence('style', input.subject, input.claim ?? null, 'style.getItemProvenance', provenance)] : [];
    }
    const gaps = await services.style.listEvidenceGaps?.({ priorityFilter: 'all' });
    return gaps ? [evidence('style', null, input.claim ?? null, 'style.listEvidenceGaps', gaps)] : [];
  }

  return [];
}

export async function getFluentVNextMediaBundle(
  services: FluentVNextReadServices,
  input: {
    candidate?: FluentVNextMediaBundleCandidate | null;
    deliveryMode?: FluentVNextMediaBundleDeliveryMode | null;
    domain: FluentVNextDomain;
    itemIds?: string[] | null;
    purpose?: FluentVNextMediaBundlePurpose | null;
    subject?: string | null;
  },
): Promise<FluentVNextMediaBundle | null> {
  if (input.domain !== 'style') {
    return null;
  }
  requireService(services.style, 'style');
  if (!services.style.getVisualBundle) {
    return null;
  }
  const purpose = input.purpose ?? 'visual_evidence_check';
  const deliveryMode = input.deliveryMode ?? 'authenticated_with_signed_fallback';
  const bundle = await services.style.getVisualBundle({
    candidate: input.candidate,
    deliveryMode: toStyleVisualBundleDeliveryMode(input.deliveryMode),
    includeComparators: true,
    itemIds: input.itemIds ?? (input.subject ? [input.subject] : null),
  });
  return {
    object: 'MediaBundle',
    domain: 'style',
    subject: input.subject ?? null,
    purpose,
    deliveryMode,
    source: 'style.getVisualBundle',
    payload: bundle,
    constraints: [
      'Host model must inspect media before making visual claims.',
      'Fluent stores media provenance; it does not own pixel judgment.',
      ...(mediaAssetCount(bundle) === 0
        ? ['No saved media was available in this bundle; ask for an upload or visual description before visual judgment.']
        : []),
    ],
  };
}

export interface FluentVNextMediaBundleCandidate {
  brand?: string | null;
  description?: string | null;
  image_urls?: string[] | null;
  imageUrls?: string[] | null;
  price_text?: string | null;
  priceText?: string | null;
  retailer?: string | null;
  title?: string | null;
  url?: string | null;
}

function toStyleVisualBundleDeliveryMode(value: FluentVNextMediaBundleDeliveryMode | null | undefined): FluentVNextStyleVisualBundleDeliveryMode {
  return value === 'authenticated_only' ? 'authenticated_only' : 'authenticated_with_signed_fallback';
}

function contextPacket(input: {
  compactFacts?: unknown[];
  domain: FluentVNextDomain;
  evidenceGaps?: unknown[];
  freshnessStatus?: FluentVNextContextPacket['freshness']['status'];
  intent: FluentVNextReadIntent;
  relevantItems?: FluentVNextDomainItem[];
  responseGuidance?: unknown;
  sourceReads: string[];
  suggestedWritebacks?: unknown[];
}): FluentVNextContextPacket {
  return {
    object: 'ContextPacket',
    domain: input.domain,
    intent: input.intent,
    compactFacts: input.compactFacts ?? [],
    ...(input.responseGuidance ? { responseGuidance: input.responseGuidance } : {}),
    relevantItems: input.relevantItems ?? [],
    evidenceGaps: input.evidenceGaps ?? [],
    freshness: {
      source: 'fluent_vnext_read_layer',
      status: input.freshnessStatus ?? 'current',
    },
    suggestedWritebacks: input.suggestedWritebacks ?? [],
    sourceReads: input.sourceReads,
  };
}

function domainItem(
  domain: FluentVNextDomain,
  id: string,
  type: string,
  payload: unknown,
  source: string,
  match?: FluentVNextDomainItem['match'] | null,
): FluentVNextDomainItem {
  return {
    object: 'DomainItem',
    domain,
    id,
    ...(match ? { match } : {}),
    type,
    status: stringField(payload, 'status'),
    source,
    payload,
    provenance: provenanceField(payload),
  };
}

function evidence(
  domain: FluentVNextDomain,
  subject: string | null,
  claim: string | null,
  source: string,
  payload: unknown,
): FluentVNextEvidenceRecord {
  return {
    object: 'Evidence',
    domain,
    subject,
    claim,
    source,
    payload,
  };
}

function buildSharedFactsFromPersonFacts(profile: unknown, personFacts: PersonFact[]): FluentVNextSharedFact[] {
  const facts: FluentVNextSharedFact[] = [];
  const displayName = stringField(profile, 'displayName');
  const timezone = stringField(profile, 'timezone');
  if (displayName) {
    facts.push({
      id: 'core.display_name',
      value: displayName,
      domains: ['shared'],
      status: 'system',
      source: 'core.getProfile',
    });
  }
  if (timezone) {
    facts.push({
      id: 'core.timezone',
      value: timezone,
      domains: ['shared', 'meals', 'style', 'wellbeing'],
      status: 'system',
      source: 'core.getProfile',
    });
  }
  for (const fact of personFacts) {
    facts.push({
      id: fact.path,
      value: factLabel(fact),
      domains: visibleDomainsForFact(fact),
      status: fact.status,
      source: personFactSourceLabel(fact),
    });
  }
  return facts;
}

function buildPersonFactsCompactFact(personFacts: PersonFact[], consumerDomain: 'meals' | 'style'): unknown | null {
  if (!personFacts.length) {
    return null;
  }
  return {
    object: 'SharedPersonFacts',
    tier: 'person_fact',
    consumerDomain,
    source: 'core.listPersonFacts',
    facts: personFacts.map((fact) => ({
      id: fact.path,
      kind: fact.kind,
      value: factLabel(fact),
      status: fact.status,
      source: personFactSourceLabel(fact),
    })),
  };
}

function buildMealsHardConstraintsCompactFact(personFacts: PersonFact[]): MealsHardConstraintsCompactFact | null {
  const confirmedExclusions = personFacts
    .filter((fact): fact is PersonFact<'allergy' | 'hard_avoid'> => {
      return fact.status === 'confirmed' && (fact.kind === 'allergy' || fact.kind === 'hard_avoid');
    })
    .map((fact): MealsHardConstraintExclusion => {
      const base = {
        factId: fact.path,
        kind: fact.kind,
        value: factLabel(fact),
        status: 'confirmed' as const,
      };
      if (fact.kind === 'allergy') {
        return {
          ...base,
          severity: (fact as PersonFact<'allergy'>).value.severity,
        };
      }
      return base;
    })
    .sort((a, b) => {
      if (a.severity === 'medical' && b.severity !== 'medical') {
        return -1;
      }
      if (a.severity !== 'medical' && b.severity === 'medical') {
        return 1;
      }
      return a.value.localeCompare(b.value);
    });

  if (!confirmedExclusions.length) {
    return null;
  }

  return {
    object: 'MealsHardConstraints',
    tier: 'person_fact',
    source: 'core.listPersonFacts',
    confirmedExclusions,
    usage: MEALS_HARD_CONSTRAINT_USAGE,
  };
}

function buildMealsSoftPreferencesCompactFact(
  personFacts: PersonFact[],
  confirmedExclusions: MealsHardConstraintExclusion[],
): MealsSoftPreferencesCompactFact | null {
  const hardConstraintValues = new Set(confirmedExclusions.map((exclusion) => normalizeText(exclusion.value)));
  const softPreferenceAllowed = (fact: PersonFact<'anti_favorite' | 'taste_pref'>) => {
    return !hardConstraintValues.has(normalizeText(factLabel(fact)));
  };
  const toPreferenceSignal = (fact: PersonFact<'anti_favorite' | 'taste_pref'>): MealsSoftPreferenceSignal => {
    const signal: MealsSoftPreferenceSignal = {
      factId: fact.path,
      kind: fact.kind,
      value: factLabel(fact),
      status: 'confirmed',
    };
    if (fact.kind === 'taste_pref') {
      const tasteFact = fact as PersonFact<'taste_pref'>;
      if (tasteFact.value.strength) {
        signal.strength = tasteFact.value.strength;
      }
    }
    return signal;
  };
  const isConfirmedSoftDislike = (fact: PersonFact): fact is PersonFact<'anti_favorite' | 'taste_pref'> => {
    if (fact.status !== 'confirmed') {
      return false;
    }
    if (fact.kind === 'anti_favorite') {
      return true;
    }
    if (fact.kind === 'taste_pref') {
      return (fact as PersonFact<'taste_pref'>).value.polarity === 'dislike';
    }
    return false;
  };
  const isConfirmedSoftLike = (fact: PersonFact): fact is PersonFact<'taste_pref'> => {
    return fact.status === 'confirmed' && fact.kind === 'taste_pref' && (fact as PersonFact<'taste_pref'>).value.polarity === 'like';
  };
  const sortByValue = (a: MealsSoftPreferenceSignal, b: MealsSoftPreferenceSignal) => a.value.localeCompare(b.value);
  const dislikes = personFacts
    .filter(isConfirmedSoftDislike)
    .filter(softPreferenceAllowed)
    .map(toPreferenceSignal)
    .sort(sortByValue);
  const likes = personFacts
    .filter(isConfirmedSoftLike)
    .filter(softPreferenceAllowed)
    .map(toPreferenceSignal)
    .sort(sortByValue);

  if (!dislikes.length && !likes.length) {
    return null;
  }

  return {
    object: 'MealsSoftPreferences',
    tier: 'person_fact',
    source: 'core.listPersonFacts',
    dislikes,
    likes,
    usage: MEALS_SOFT_PREFERENCES_USAGE,
  };
}

function buildMealsDietaryPatternsCompactFact(personFacts: PersonFact[]): MealsDietaryPatternsCompactFact | null {
  const patterns = personFacts
    .filter((fact): fact is PersonFact<'dietary_pattern'> => fact.status === 'confirmed' && fact.kind === 'dietary_pattern')
    .flatMap((fact): MealsDietaryPatternExclusion[] => {
      const pattern = fact.value.pattern ?? recognizeDietaryPattern(factLabel(fact));
      if (!pattern) {
        return [];
      }
      return [
        {
          factId: fact.path,
          pattern,
          status: 'confirmed',
          excludedClasses: [...PATTERN_EXCLUDED_CLASSES[pattern]].sort((a, b) => a.localeCompare(b)),
        },
      ];
    })
    .sort((a, b) => a.pattern.localeCompare(b.pattern) || a.factId.localeCompare(b.factId));

  if (!patterns.length) {
    return null;
  }

  return {
    object: 'MealsDietaryPatterns',
    tier: 'person_fact',
    source: 'core.listPersonFacts',
    patterns,
    excludedClasses: uniqueSorted(patterns.flatMap((pattern) => pattern.excludedClasses)),
    usage: MEALS_DIETARY_PATTERNS_USAGE,
  };
}

function buildDerivedSeamCompactFact(signal: SeamSignal): unknown {
  return {
    object: 'DerivedSeamSignal',
    tier: 'derived_seam',
    source: 'budgets.toDerivedSeam',
    signal,
  };
}

function visibleDomainsForFact(fact: PersonFact): readonly FluentVNextDomain[] {
  const domains = fact.visibility.domains;
  if (domains === 'all') {
    return ['shared', 'meals', 'style', 'wellbeing'];
  }
  if (domains === 'asserting_only') {
    return pcDomainToVNextDomain(fact.source.domain);
  }
  return [...new Set(domains.flatMap(pcDomainToVNextDomain))];
}

function pcDomainToVNextDomain(domain: string): FluentVNextDomain[] {
  if (domain === 'shared' || domain === 'meals' || domain === 'style' || domain === 'wellbeing') {
    return [domain];
  }
  if (domain === 'budgets') {
    return ['finance'];
  }
  return [];
}

function personFactSourceLabel(fact: PersonFact): string {
  return ['core.person_facts', fact.source.domain, fact.source.origin, fact.source.detail].filter(Boolean).join(':');
}

function normalizeHost(host: PcHost | null | undefined): PcHost {
  return host ?? 'unknown';
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function itemId(value: unknown, fallback = 'unknown'): string {
  return stringField(value, 'id') ?? stringField(value, 'itemId') ?? stringField(value, 'recipeId') ?? fallback;
}

function applyListLimit<T>(items: T[], limit: number | null | undefined): T[] {
  if (!limit || !Number.isFinite(limit)) {
    return items;
  }
  const resolvedLimit = normalizeListLimit(limit);
  return resolvedLimit ? items.slice(0, resolvedLimit) : items;
}

function normalizeListLimit(limit: number | null | undefined): number | null {
  if (!limit || !Number.isFinite(limit)) {
    return null;
  }
  return Math.min(50, Math.max(1, Math.trunc(limit)));
}

function paginateDomainItems(
  items: FluentVNextDomainItem[],
  input: {
    cursor?: string | null;
    domain: FluentVNextDomain;
    itemType?: FluentVNextItemType | null;
    limit?: number | null;
    query?: string | null;
    status?: string | null;
  },
): FluentVNextItemListPage {
  const limit = normalizeListLimit(input.limit);
  const offset = limit ? parseListCursor(input.cursor) : 0;
  const pagedItems = limit ? items.slice(offset, offset + limit) : items;
  const nextOffset = offset + pagedItems.length;
  const nextCursor = limit && nextOffset < items.length ? formatListCursor(nextOffset) : undefined;
  return {
    object: 'ItemListPage',
    domain: input.domain,
    itemType: input.itemType ?? null,
    items: pagedItems,
    limit,
    ...(nextCursor ? { nextCursor, next_cursor: nextCursor } : {}),
    query: input.query ?? null,
    status: input.status ?? (input.domain === 'style' ? 'active' : null),
    total: items.length,
  };
}

function parseListCursor(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0;
  }
  const match = /^offset:(\d+)$/u.exec(cursor.trim());
  if (!match) {
    throw new Error('Invalid fluent_list_items cursor.');
  }
  return Math.max(0, Number.parseInt(match[1] ?? '0', 10));
}

function formatListCursor(offset: number): string {
  return `offset:${offset}`;
}

function recipeMatch(value: unknown, query: string | null | undefined): FluentVNextDomainItem['match'] | null {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) {
    return null;
  }
  const fields = recipeLookupFields(value);
  const exactFields = fields.filter((field) => field.normalized === normalizedQuery).map((field) => field.key);
  if (exactFields.length) {
    return { matchedFields: exactFields, query: String(query).trim(), quality: 'exact' };
  }
  const queryTokens = lookupTokens(normalizedQuery);
  if (queryTokens.length > 1 && queryTokens.every((token) => fields.some((field) => field.normalized.includes(token)))) {
    const tokenFields = queryTokens.flatMap((token) =>
      fields.filter((field) => field.normalized.includes(token)).map((field) => field.key),
    );
    return { matchedFields: uniqueStrings(tokenFields), query: String(query).trim(), quality: 'partial' };
  }
  const partialFields = fields
    .filter((field) => field.normalized.includes(normalizedQuery) || (queryTokens.length <= 1 && normalizedQuery.includes(field.normalized)))
    .map((field) => field.key);
  if (partialFields.length) {
    return { matchedFields: uniqueStrings(partialFields), query: String(query).trim(), quality: 'partial' };
  }
  return null;
}

function styleItemMatch(value: unknown, query: string | null | undefined): FluentVNextDomainItem['match'] | null {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) {
    return null;
  }
  const fields = styleItemLookupFields(value);
  const exactFields = fields.filter((field) => field.normalized === normalizedQuery).map((field) => field.key);
  if (exactFields.length) {
    return { matchedFields: exactFields, query: String(query).trim(), quality: 'exact' };
  }
  const queryTokens = lookupTokens(normalizedQuery);
  if (queryTokens.length > 1 && queryTokens.every((token) => fields.some((field) => field.normalized.includes(token)))) {
    const tokenFields = queryTokens.flatMap((token) =>
      fields.filter((field) => field.normalized.includes(token)).map((field) => field.key),
    );
    return { matchedFields: uniqueStrings(tokenFields), query: String(query).trim(), quality: 'partial' };
  }
  const partialFields = fields
    .filter((field) => field.normalized.includes(normalizedQuery) || (queryTokens.length <= 1 && normalizedQuery.includes(field.normalized)))
    .map((field) => field.key);
  if (partialFields.length) {
    return { matchedFields: uniqueStrings(partialFields), query: String(query).trim(), quality: 'partial' };
  }
  return null;
}

function styleItemStatusMatches(item: FluentVNextDomainItem, status: string | null | undefined): boolean {
  const requestedStatus = status ?? 'active';
  const itemStatus = item.status ?? 'active';
  if (requestedStatus === 'any') {
    return true;
  }
  if (requestedStatus === 'archived') {
    return itemStatus === 'archived';
  }
  if (requestedStatus === 'active') {
    return itemStatus === 'active';
  }
  return itemStatus === requestedStatus;
}

function groceryListMatch(value: unknown, query: string | null | undefined): FluentVNextDomainItem['match'] | null {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery || !value) {
    return null;
  }
  const fields = groceryListLookupFields(value);
  const exactFields = fields.filter((field) => field.normalized === normalizedQuery).map((field) => field.key);
  if (exactFields.length) {
    return { matchedFields: exactFields, query: String(query).trim(), quality: 'exact' };
  }
  const partialFields = fields.filter((field) => field.normalized.includes(normalizedQuery)).map((field) => field.key);
  return partialFields.length ? { matchedFields: partialFields, query: String(query).trim(), quality: 'partial' } : null;
}

function inventoryItemMatch(value: unknown, query: string | null | undefined): FluentVNextDomainItem['match'] | null {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery || !value) {
    return null;
  }
  const fields = inventoryItemLookupFields(value);
  const exactFields = fields.filter((field) => field.normalized === normalizedQuery).map((field) => field.key);
  if (exactFields.length) {
    return { matchedFields: exactFields, query: String(query).trim(), quality: 'exact' };
  }
  const queryTokens = lookupTokens(normalizedQuery);
  if (queryTokens.length > 1 && queryTokens.every((token) => fields.some((field) => field.normalized.includes(token)))) {
    const tokenFields = queryTokens.flatMap((token) =>
      fields.filter((field) => field.normalized.includes(token)).map((field) => field.key),
    );
    return { matchedFields: uniqueStrings(tokenFields), query: String(query).trim(), quality: 'partial' };
  }
  const partialFields = fields
    .filter((field) => field.normalized.includes(normalizedQuery) || (queryTokens.length <= 1 && normalizedQuery.includes(field.normalized)))
    .map((field) => field.key);
  return partialFields.length ? { matchedFields: uniqueStrings(partialFields), query: String(query).trim(), quality: 'partial' } : null;
}

function inventoryItemStatusMatches(item: FluentVNextDomainItem, status: string | null | undefined): boolean {
  const requestedStatus = status ?? 'any';
  const itemStatus = item.status ?? stringField(item.payload, 'status') ?? 'present';
  if (requestedStatus === 'any') {
    return true;
  }
  if (requestedStatus === 'active') {
    return !['consumed', 'removed', 'deleted'].includes(itemStatus);
  }
  return itemStatus === requestedStatus;
}

async function findMealsRecipeByExactTitle(
  meals: NonNullable<FluentVNextReadServices['meals']>,
  query: string,
): Promise<{ match: NonNullable<FluentVNextDomainItem['match']>; recipe: unknown } | null> {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) {
    return null;
  }
  const recipes = await meals.listRecipes?.() ?? [];
  for (const recipe of recipes) {
    const match = recipeMatch(recipe, query);
    if (match?.quality === 'exact' && match.matchedFields.some((field) => ['name', 'title'].includes(field))) {
      return { match, recipe };
    }
  }
  return null;
}

async function findMealsRecipeByQuery(
  meals: NonNullable<FluentVNextReadServices['meals']>,
  query: string,
): Promise<
  | { kind: 'matched'; match: NonNullable<FluentVNextDomainItem['match']>; recipe: unknown }
  | { candidates: Array<{ id: string; match: NonNullable<FluentVNextDomainItem['match']>; title: string | null }>; kind: 'ambiguous' }
  | null
> {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) {
    return null;
  }
  const recipes = await meals.listRecipes?.() ?? [];
  const matches = recipes
    .map((recipe) => {
      const match = recipeMatch(recipe, query);
      return match ? { id: itemId(recipe, query), match, recipe, title: recipeTitle(recipe) } : null;
    })
    .filter((entry): entry is { id: string; match: NonNullable<FluentVNextDomainItem['match']>; recipe: unknown; title: string | null } =>
      Boolean(entry),
    );
  const exactTitle = matches.find((entry) => entry.match.quality === 'exact' && entry.match.matchedFields.some((field) => ['name', 'title', 'raw.name', 'raw.title'].includes(field)));
  if (exactTitle) {
    return { kind: 'matched', match: exactTitle.match, recipe: exactTitle.recipe };
  }
  if (matches.length === 1) {
    return { kind: 'matched', match: matches[0]!.match, recipe: matches[0]!.recipe };
  }
  return matches.length ? { candidates: matches.slice(0, 5).map(({ id, match, title }) => ({ id, match, title })), kind: 'ambiguous' } : null;
}

export async function getFluentVNextCurrentGroceryListItem(
  services: FluentVNextReadServices,
  input: { weekStart?: string | null } = {},
): Promise<FluentVNextDomainItem | null> {
  requireService(services.meals, 'meals');
  const grocery = await services.meals.getCurrentGroceryList?.({
    skipCalibrationContext: true,
    weekStart: input.weekStart ?? undefined,
  });
  return grocery ? domainItem('meals', 'current_grocery_list', 'grocery_list', grocery, 'meals.getCurrentGroceryList') : null;
}

async function findMealsRecipeEvidence(
  meals: NonNullable<FluentVNextReadServices['meals']>,
  subject: string,
  claim: string | null,
  directRecipe?: unknown | null,
): Promise<FluentVNextEvidenceRecord[]> {
  const resolvedDirectRecipe = directRecipe === undefined ? await meals.getRecipe?.(subject) : directRecipe;
  const recipe = resolvedDirectRecipe
    ? { kind: 'matched' as const, match: { matchedFields: ['id'], query: subject, quality: 'exact' as const }, recipe: resolvedDirectRecipe }
    : await findMealsRecipeByQuery(meals, subject);
  if (!recipe) {
    return [
      evidence('meals', subject, claim, 'fluent_vnext_read_layer.recipe_lookup', {
        object: 'RecipeLookupEvidence',
        matched: false,
        query: subject,
        guidance: 'Do not claim this saved recipe exists. List saved recipes or ask the user for the exact saved recipe before writing groceries from it.',
      }),
    ];
  }
  if (recipe.kind === 'ambiguous') {
    return [
      evidence('meals', subject, claim, 'fluent_vnext_read_layer.recipe_lookup', {
        object: 'RecipeLookupEvidence',
        matched: false,
        ambiguous: true,
        query: subject,
        candidates: recipe.candidates,
        guidance:
          'Multiple saved recipes matched. Do not choose one silently or write groceries from it; ask the user to pick a recipe or use a stable recipe ID.',
      }),
    ];
  }
  const id = itemId(recipe.recipe, subject);
  return [
    evidence('meals', id, claim, 'fluent_vnext_read_layer.recipe_lookup', {
      object: 'RecipeLookupEvidence',
      matched: true,
      match: recipe.match,
      recipe: recipe.recipe,
      recipeId: id,
      recipeTitle: recipeTitle(recipe.recipe),
      groundingUse:
        'Use this saved recipe evidence to explain recipe-derived grocery-list deltas. Do not infer pantry, inventory, cart, checkout, or order truth from it.',
    }),
  ];
}

async function listMealsRecipeSubjectEvidence(
  meals: NonNullable<FluentVNextReadServices['meals']>,
  subject: string,
  claim: string | null,
  directRecipe?: unknown | null,
): Promise<FluentVNextEvidenceRecord[]> {
  const recipeLookup = await findMealsRecipeEvidence(meals, subject, claim, directRecipe);
  const evidenceSubject = recipeLookup[0]?.subject ?? subject;
  const [events, memory] = await Promise.all([
    meals.listDomainEvents?.({ entityId: evidenceSubject, limit: 50 }) ?? [],
    meals.getMealMemory?.(evidenceSubject) ?? [],
  ]);
  return [
    ...recipeLookup,
    ...events.map((entry) => evidence('meals', subject, claim, 'meals.listDomainEvents', entry)),
    ...memory.map((entry) => evidence('meals', subject, claim, 'meals.getMealMemory', entry)),
  ];
}

async function findMealsGroceryListEvidence(
  meals: NonNullable<FluentVNextReadServices['meals']>,
  subject: string | null,
  claim: string | null,
): Promise<FluentVNextEvidenceRecord[]> {
  const subjectText = normalizeLookupText(subject);
  const claimText = normalizeLookupText(claim);
  const grocerySubject =
    !subjectText ||
    subjectText === 'current grocery list' ||
    subjectText === 'current grocery-list' ||
    subjectText === 'current grocery' ||
    subjectText === 'current_grocery_list' ||
    subjectText.startsWith('grocery list') ||
    subjectText.startsWith('grocery:list') ||
    subjectText.startsWith('current grocery list');
  const groceryClaim =
    claimText &&
    (claimText.includes('grocery') ||
      claimText.includes('shopping list') ||
      claimText.includes('already on') ||
      claimText.includes('already covered') ||
      claimText.includes('duplicate') ||
      claimText.includes('current list') ||
      claimText.includes('need to buy') ||
      claimText.includes('to buy'));
  if (!grocerySubject && !groceryClaim) {
    return [];
  }
  const grocery = await meals.getCurrentGroceryList?.({ skipCalibrationContext: true });
  if (!grocery) {
    return [
      evidence('meals', subject ?? 'current_grocery_list', claim, 'fluent_vnext_read_layer.grocery_list_lookup', {
        object: 'GroceryListEvidence',
        matched: false,
        guidance:
          'No current grocery list was available. Do not claim a grocery item is present, missing, duplicate, or covered by Fluent.',
      }),
    ];
  }
  const query = firstGroceryEvidenceQuery(subject, claim);
  const matches = groceryListEvidenceMatches(grocery, query);
  return [
    evidence('meals', 'current_grocery_list', claim, 'fluent_vnext_read_layer.grocery_list_lookup', {
      object: 'GroceryListEvidence',
      matched: true,
      listId: stringField(grocery, 'listId') ?? stringField(grocery, 'id') ?? 'current_grocery_list',
      version: stringField(grocery, 'version'),
      weekStart: stringField(grocery, 'weekStart') ?? stringField(grocery, 'week_start'),
      currentness: mealsCurrentnessFact(grocery, 'planning'),
      query,
      matchingItems: matches,
      matchingItemCount: matches.length,
      guidance:
        'Use matchingItems to avoid duplicate or already-covered grocery-list deltas. If matchingItems is empty, say Fluent did not prove the item is already covered; still require explicit user approval before writing one list change.',
    }),
  ];
}

function recipeLookupFields(value: unknown): Array<{ key: string; normalized: string }> {
  const record = objectRecord(value);
  if (!record) {
    return [];
  }
  const fields: Array<{ key: string; normalized: string }> = [];
  for (const key of ['id', 'itemId', 'recipeId', 'slug', 'name', 'title', 'displayName', 'mealType', 'meal_type']) {
    const normalized = normalizeLookupText(record[key]);
    if (normalized) {
      fields.push({ key, normalized });
    }
  }
  collectRecipeStructuredLookupFields(fields, record, '');
  const raw = objectRecord(record.raw);
  if (raw) {
    for (const key of ['id', 'slug', 'name', 'title', 'displayName', 'meal_type', 'mealType']) {
      const normalized = normalizeLookupText(raw[key]);
      if (normalized) {
        fields.push({ key: `raw.${key}`, normalized });
      }
    }
    collectRecipeStructuredLookupFields(fields, raw, 'raw.');
  }
  return fields;
}

function styleItemLookupFields(value: unknown): Array<{ key: string; normalized: string }> {
  const record = objectRecord(value);
  if (!record) {
    return [];
  }
  const fields: Array<{ key: string; normalized: string }> = [];
  collectStyleLookupFields(fields, record, '');
  const raw = objectRecord(record.raw);
  if (raw) {
    collectStyleLookupFields(fields, raw, 'raw.');
  }
  const profile = objectRecord(record.profile);
  if (profile) {
    collectStyleLookupFields(fields, profile, 'profile.');
    const profileRaw = objectRecord(profile.raw);
    if (profileRaw) {
      collectStyleLookupFields(fields, profileRaw, 'profile.raw.');
    }
  }
  return fields;
}

function collectStyleLookupFields(
  fields: Array<{ key: string; normalized: string }>,
  record: Record<string, unknown>,
  prefix: string,
): void {
  for (const key of ['id', 'itemId', 'name', 'title', 'displayName', 'brand', 'category', 'subcategory']) {
    const normalized = normalizeLookupText(record[key]);
    if (normalized) {
      fields.push({ key: `${prefix}${key}`, normalized });
    }
  }
  for (const tag of arrayField(record, 'tags')) {
    const normalized = normalizeLookupText(tag);
    if (normalized) {
      fields.push({ key: `${prefix}tags`, normalized });
    }
  }
}

function collectRecipeStructuredLookupFields(
  fields: Array<{ key: string; normalized: string }>,
  record: Record<string, unknown>,
  prefix: string,
): void {
  for (const tag of arrayField(record, 'tags')) {
    const normalized = normalizeLookupText(tag);
    if (normalized) {
      fields.push({ key: `${prefix}tags`, normalized });
    }
  }
  const ingredients = Array.isArray(record.ingredients)
    ? record.ingredients.map(objectRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
  for (const ingredient of ingredients) {
    for (const key of ['item', 'name', 'ingredient', 'canonical_item', 'canonicalItem', 'search_query_hint', 'searchQueryHint']) {
      const normalized = normalizeLookupText(ingredient[key]);
      if (normalized) {
        fields.push({ key: `${prefix}ingredients.${key}`, normalized });
      }
    }
    for (const key of ['allowed_substitute_queries', 'allowedSubstituteQueries']) {
      for (const candidate of arrayField(ingredient, key)) {
        const normalized = normalizeLookupText(candidate);
        if (normalized) {
          fields.push({ key: `${prefix}ingredients.${key}`, normalized });
        }
      }
    }
  }
}

function groceryListLookupFields(value: unknown): Array<{ key: string; normalized: string }> {
  const record = objectRecord(value);
  if (!record) {
    return [];
  }
  const fields: Array<{ key: string; normalized: string }> = [];
  for (const key of ['id', 'listId', 'title', 'subtitle', 'trustLabel', 'trustState', 'weekStart']) {
    const normalized = normalizeLookupText(record[key]);
    if (normalized) {
      fields.push({ key, normalized });
    }
  }
  for (const item of groceryListEvidenceItems(value)) {
    for (const key of ['id', 'itemKey', 'displayName', 'display_name', 'itemName', 'name', 'ingredient', 'item']) {
      const normalized = normalizeLookupText(item.payload[key]);
      if (normalized) {
        fields.push({ key: `${item.collection}.${key}`, normalized });
      }
    }
  }
  return fields;
}

function inventoryItemLookupFields(value: unknown): Array<{ key: string; normalized: string }> {
  const record = objectRecord(value);
  if (!record) {
    return [];
  }
  const fields: Array<{ key: string; normalized: string }> = [];
  for (const key of ['id', 'itemId', 'name', 'displayName', 'normalizedName', 'normalized_name', 'canonicalItemKey', 'canonical_item_key', 'status']) {
    const normalized = normalizeLookupText(record[key]);
    if (normalized) {
      fields.push({ key, normalized });
    }
  }
  const id = stringField(record, 'id');
  if (id) {
    const publicId = normalizeLookupText(`inventory:${id}`);
    if (publicId) {
      fields.push({ key: 'publicId', normalized: publicId });
    }
  }
  return fields;
}

function mealPlanMatch(value: unknown, query: string | null | undefined): FluentVNextDomainItem['match'] | null {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) {
    return null;
  }
  const fields = mealPlanLookupFields(value);
  const exact = fields.find((entry) => entry.normalized === normalizedQuery);
  if (exact) {
    return { matchedFields: [exact.key], query: query!, quality: 'exact' };
  }
  const partial = fields.filter((entry) => entry.normalized.includes(normalizedQuery) || normalizedQuery.includes(entry.normalized));
  return partial.length ? { matchedFields: partial.map((entry) => entry.key), query: query!, quality: 'partial' } : null;
}

function mealPlanLookupFields(value: unknown): Array<{ key: string; normalized: string }> {
  const record = objectRecord(value);
  if (!record) {
    return [];
  }
  const fields: Array<{ key: string; normalized: string }> = [];
  for (const key of ['id', 'weekStart', 'week_start', 'status', 'title']) {
    const normalized = normalizeLookupText(record[key]);
    if (normalized) {
      fields.push({ key, normalized });
    }
  }
  const entries = Array.isArray(record.entries) ? record.entries : [];
  for (const entry of entries) {
    const entryRecord = objectRecord(entry);
    if (!entryRecord) {
      continue;
    }
    for (const key of ['date', 'dayLabel', 'day_label', 'mealType', 'meal_type', 'recipeId', 'recipe_id', 'recipeNameSnapshot', 'recipe_name_snapshot']) {
      const normalized = normalizeLookupText(entryRecord[key]);
      if (normalized) {
        fields.push({ key: `entries.${key}`, normalized });
      }
    }
  }
  return fields;
}

async function getMealsPlanByPublicItemId(
  meals: NonNullable<FluentVNextReadServices['meals']>,
  itemId: string,
): Promise<unknown | null> {
  if (itemId === 'current_meal_plan') {
    return await meals.getPlan?.() ?? null;
  }
  const planWeekStart = mealPlanWeekStartFromPublicItemId(itemId) ?? itemId;
  const direct = await meals.getPlan?.({ weekStart: planWeekStart });
  if (direct && (itemIdMatches(direct, itemId) || itemIdMatches(direct, planWeekStart))) {
    return direct;
  }
  const history = await meals.listPlanHistory?.({ limit: 25 }) ?? [];
  return history.find((entry) => itemIdMatches(entry, itemId)) ?? null;
}

function mealPlanWeekStartFromPublicItemId(itemId: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(itemId)) {
    return itemId;
  }
  return itemId.match(/(?:^|:)(\d{4}-\d{2}-\d{2})(?::|$)/)?.[1] ?? null;
}

function itemIdMatches(value: unknown, id: string): boolean {
  const record = objectRecord(value);
  if (!record) {
    return false;
  }
  return [record.id, record.weekStart, record.week_start].some((candidate) => candidate === id);
}

function inventoryItemIdMatches(value: unknown, id: string): boolean {
  const record = objectRecord(value);
  if (!record) {
    return false;
  }
  const normalizedId = normalizeLookupText(id);
  if (!normalizedId) {
    return false;
  }
  return inventoryItemLookupFields(record).some((field) => field.normalized === normalizedId);
}

function firstGroceryEvidenceQuery(subject: string | null, claim: string | null): string | null {
  const claimText = typeof claim === 'string' ? claim.trim() : '';
  const subjectText = typeof subject === 'string' ? subject.trim() : '';
  const normalizedSubject = normalizeLookupText(subjectText);
  const normalizedClaim = normalizeLookupText(claimText);
  if (
    normalizedSubject &&
    normalizedClaim &&
    !isGenericGroceryListSubject(normalizedSubject) &&
    (normalizedClaim.includes('grocery') ||
      normalizedClaim.includes('shopping list') ||
      normalizedClaim.includes('already on') ||
      normalizedClaim.includes('already covered') ||
      normalizedClaim.includes('duplicate'))
  ) {
    return subjectText;
  }
  for (const candidate of [claimText, subjectText]) {
    const normalized = normalizeLookupText(candidate);
    if (!normalized) {
      continue;
    }
    const itemMatch = normalized.match(/(?:already on|already covered|duplicate|need to buy|to buy|have|has|includes?|add)\s+([a-z0-9 ]{2,})/);
    if (itemMatch?.[1]) {
      return itemMatch[1].trim();
    }
    if (!normalized.includes('grocery') && !normalized.includes('current list') && !normalized.includes('shopping list')) {
      return candidate;
    }
  }
  return claimText || subjectText || null;
}

function isGenericGroceryListSubject(value: string): boolean {
  return (
    value === 'current grocery list' ||
    value === 'current grocery-list' ||
    value === 'current grocery' ||
    value === 'current_grocery_list' ||
    value.startsWith('grocery list') ||
    value.startsWith('grocery:list') ||
    value.startsWith('current grocery list')
  );
}

function groceryListEvidenceMatches(value: unknown, query: string | null): unknown[] {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) {
    return [];
  }
  return groceryListEvidenceItems(value)
    .filter((entry) => {
      return Object.values(entry.payload).some((field) => {
        const normalizedField = normalizeLookupText(field);
        return normalizedField ? normalizedField.includes(normalizedQuery) || normalizedQuery.includes(normalizedField) : false;
      });
    })
    .map((entry) => ({
      collection: entry.collection,
      id: entry.payload.id ?? entry.payload.itemKey ?? entry.payload.item_key ?? null,
      name:
        firstString(entry.payload, ['displayName', 'display_name', 'itemName', 'item_name', 'name', 'ingredient', 'item']) ??
        null,
      status: firstString(entry.payload, ['status', 'actionStatus', 'action_status', 'inventoryStatus', 'inventory_status']),
      sourceRecipeIds: arrayField(entry.payload, 'sourceRecipeIds').length
        ? arrayField(entry.payload, 'sourceRecipeIds')
        : arrayField(entry.payload, 'source_recipe_ids'),
    }));
}

function groceryListEvidenceItems(value: unknown): Array<{ collection: string; payload: Record<string, unknown> }> {
  const record = objectRecord(value);
  if (!record) {
    return [];
  }
  const items: Array<{ collection: string; payload: Record<string, unknown> }> = [];
  collectRecordArray(items, 'intents', record.intents);
  const groceryPlan = objectRecord(record.groceryPlan) ?? objectRecord(record.grocery_plan);
  const groceryPlanRaw = objectRecord(groceryPlan?.raw);
  collectRecordArray(items, 'groceryPlan.items', groceryPlanRaw?.items);
  collectRecordArray(items, 'groceryPlan.resolvedItems', groceryPlanRaw?.resolvedItems ?? groceryPlanRaw?.resolved_items);
  const preparedOrder = objectRecord(record.preparedOrder) ?? objectRecord(record.prepared_order);
  collectRecordArray(items, 'preparedOrder.remainingToBuy', preparedOrder?.remainingToBuy ?? preparedOrder?.remaining_to_buy);
  collectRecordArray(items, 'preparedOrder.alreadyCoveredByInventory', preparedOrder?.alreadyCoveredByInventory ?? preparedOrder?.already_covered_by_inventory);
  collectRecordArray(items, 'preparedOrder.unresolvedItems', preparedOrder?.unresolvedItems ?? preparedOrder?.unresolved_items);
  return items;
}

function collectRecordArray(
  output: Array<{ collection: string; payload: Record<string, unknown> }>,
  collection: string,
  value: unknown,
): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const entry of value) {
    const record = objectRecord(entry);
    if (record) {
      output.push({ collection, payload: record });
    }
  }
}

function recipeTitle(value: unknown): string | null {
  const record = objectRecord(value);
  return record ? firstString(record, ['name', 'title', 'displayName']) : null;
}

function looksLikeRecipeId(value: string): boolean {
  return /^(recipe:|breakfast-|lunch-|dinner-|snack-)/i.test(value.trim());
}

function normalizeLookupText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function lookupTokens(value: string): string[] {
  return value.split(' ').filter((token) => token.length > 1);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function provenanceField(value: unknown): unknown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return record.provenance ?? record.sourceProvenance ?? record.source_snapshot ?? record.sourceSnapshot ?? null;
}

function evidenceGapsFromPayload(value: unknown): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const gaps = (value as Record<string, unknown>).evidenceGaps;
  return Array.isArray(gaps) ? gaps : [];
}

const RECIPE_INDEX_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const RECIPE_INDEX_PER_GROUP_CAP = 12;
const MEALS_OUTCOME_SIGNAL_CAP = 12;
const INVENTORY_SUMMARY_SAMPLE_CAP = 8;

function recipeMealTypeFromQuery(query: string | null | undefined): string | null {
  const normalized = normalizeLookupText(query);
  if (!normalized) {
    return null;
  }
  const byTerm: Record<string, string> = {
    breakfast: 'breakfast',
    breakfasts: 'breakfast',
    lunch: 'lunch',
    lunches: 'lunch',
    dinner: 'dinner',
    dinners: 'dinner',
    supper: 'dinner',
    suppers: 'dinner',
    snack: 'snack',
    snacks: 'snack',
  };
  return byTerm[normalized] ?? null;
}

// Compact, titles-only index of the user's saved recipes grouped by meal type, so a planning answer
// can be built from real saved recipes inside the single context read — NOT a full recipe dump.
// Intentionally carries no ingredients/instructions (the compactness guard test enforces this).
function mealsRecipeIndex(
  recipes: unknown[],
  hardConstraints: MealsHardConstraintExclusion[] = [],
  dietaryPatterns: MealsDietaryPatternExclusion[] = [],
  outcomeSignals: MealsOutcomeSignal[] = [],
): unknown {
  const outcomesByRecipeId = new Map(outcomeSignals.map((signal) => [signal.recipeId, signal]));
  const groups = new Map<
    string,
    Array<{
      id: string;
      name: string;
      conflictsWithDietaryPattern?: string;
      conflictsWithHardConstraint?: string;
      recentOutcome?: MealsRecipeIndexOutcome;
    }>
  >();
  let totalActive = 0;
  for (const entry of recipes) {
    const record = objectRecord(entry);
    if (!record) {
      continue;
    }
    const status = stringField(record, 'status') ?? 'active';
    if (status !== 'active') {
      continue;
    }
    const name = firstString(record, ['name', 'title', 'displayName']);
    if (!name) {
      continue;
    }
    const mealTypeRaw = (stringField(record, 'mealType') ?? stringField(record, 'meal_type') ?? '').toLowerCase().trim();
    const group = (RECIPE_INDEX_MEAL_TYPES as readonly string[]).includes(mealTypeRaw) ? mealTypeRaw : 'other';
    const list = groups.get(group) ?? [];
    const conflict = firstMatchingHardConstraint(name, hardConstraints);
    const dietaryConflict = firstMatchingDietaryPattern(record, name, dietaryPatterns);
    const recentOutcome = recipeIndexOutcome(outcomesByRecipeId.get(itemId(record)));
    list.push({
      id: itemId(record),
      name,
      ...(conflict ? { conflictsWithHardConstraint: conflict.value } : {}),
      ...(dietaryConflict ? { conflictsWithDietaryPattern: dietaryConflict.pattern } : {}),
      ...(recentOutcome ? { recentOutcome } : {}),
    });
    groups.set(group, list);
    totalActive += 1;
  }
  const byMealType: Record<string, number> = {};
  const recipesByMealType: Record<
    string,
    Array<{
      id: string;
      name: string;
      conflictsWithDietaryPattern?: string;
      conflictsWithHardConstraint?: string;
      recentOutcome?: MealsRecipeIndexOutcome;
    }>
  > = {};
  const overflow: Record<string, number> = {};
  for (const [group, list] of groups) {
    byMealType[group] = list.length;
    recipesByMealType[group] = list.slice(0, RECIPE_INDEX_PER_GROUP_CAP);
    if (list.length > RECIPE_INDEX_PER_GROUP_CAP) {
      overflow[group] = list.length - RECIPE_INDEX_PER_GROUP_CAP;
    }
  }
  return {
    object: 'MealsRecipeIndex',
    domain: 'meals',
    source: 'meals.listRecipes',
    status: 'active',
    totalActive,
    byMealType,
    recipes: recipesByMealType,
    ...(Object.keys(overflow).length ? { overflow } : {}),
    usage:
      totalActive > 0
        ? 'Build the requested meals from these saved recipes by name — they are the user\'s durable Meals memory. Do not invent recipes when matching saved ones exist. To open a recipe in full or page past this index, read fluent_list_items(domain="meals", item_type="recipe", query=<recipe name or meal type>).'
        : 'No active saved recipes are available to plan from. Offer to add or import recipes, or ask the user, instead of inventing a saved-recipe plan.',
  };
}

type MealsOutcomeSignal = {
  recipeId: string;
  recipeName: string;
  status: string;
  lastFeedback?: MealsOutcomeFeedback;
  lastUsedAt: string | null;
};

type MealsOutcomeFeedback = {
  difficulty?: unknown;
  family_acceptance?: unknown;
  repeat_again?: unknown;
  taste?: unknown;
  time_reality?: unknown;
};

type MealsRecipeIndexOutcome = {
  lastUsedAt: string | null;
  repeatAgain?: unknown;
  status: string;
  summary: string;
  taste?: unknown;
};

function mealsOutcomeSignals(mealMemory: unknown[], recipes: unknown[]): { fact: unknown; signals: MealsOutcomeSignal[] } {
  const recipeNamesById = new Map<string, string>();
  for (const recipe of recipes) {
    const record = objectRecord(recipe);
    const id = itemId(record);
    const name = recipeTitle(record);
    if (id !== 'unknown' && name) {
      recipeNamesById.set(id, name);
    }
  }
  const signals = mealMemory
    .map((entry) => mealOutcomeSignal(entry, recipeNamesById))
    .filter((entry): entry is MealsOutcomeSignal & { sortKey: number } => Boolean(entry))
    .sort((left, right) => right.sortKey - left.sortKey || left.recipeId.localeCompare(right.recipeId))
    .slice(0, MEALS_OUTCOME_SIGNAL_CAP)
    .map(({ sortKey: _sortKey, ...entry }) => entry);
  return {
    fact: {
      object: 'MealsOutcomeSignals',
      domain: 'meals',
      source: 'meals.getMealMemory',
      limit: MEALS_OUTCOME_SIGNAL_CAP,
      entries: signals,
      usage:
        'Use these recent saved-recipe outcomes for keep-vs-swap planning: repeat what was liked or would repeat, flag what flopped, and never claim no recipe feedback exists when entries is non-empty.',
    },
    signals,
  };
}

function mealOutcomeSignal(
  entry: unknown,
  recipeNamesById: Map<string, string>,
): (MealsOutcomeSignal & { sortKey: number }) | null {
  const record = objectRecord(entry);
  if (!record) {
    return null;
  }
  const recipeId = firstString(record, ['recipeId', 'recipe_id', 'id']);
  if (!recipeId) {
    return null;
  }
  const status = stringField(record, 'status') ?? 'unknown';
  const lastFeedback = compactMealOutcomeFeedback(record.lastFeedback ?? record.last_feedback ?? record.last_feedback_json);
  const lastUsedAt = firstString(record, ['lastUsedAt', 'last_used_at']);
  const updatedAt = firstString(record, ['updatedAt', 'updated_at']);
  return {
    recipeId,
    recipeName: recipeNamesById.get(recipeId) ?? firstString(record, ['recipeName', 'recipeNameSnapshot', 'name', 'title', 'displayName']) ?? recipeId,
    status,
    ...(lastFeedback ? { lastFeedback } : {}),
    lastUsedAt,
    sortKey: Math.max(timestampForSort(lastUsedAt), timestampForSort(updatedAt)),
  };
}

function compactMealOutcomeFeedback(value: unknown): MealsOutcomeFeedback | null {
  const record = objectRecord(value);
  if (!record) {
    return null;
  }
  const feedback: MealsOutcomeFeedback = {};
  copyFeedbackField(feedback, record, 'taste');
  copyFeedbackField(feedback, record, 'difficulty');
  copyFeedbackField(feedback, record, 'time_reality', 'timeReality');
  copyFeedbackField(feedback, record, 'repeat_again', 'repeatAgain');
  copyFeedbackField(feedback, record, 'family_acceptance', 'familyAcceptance');
  return Object.keys(feedback).length > 0 ? feedback : null;
}

function copyFeedbackField(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
  outputKey: keyof MealsOutcomeFeedback,
  alternateKey?: string,
): void {
  const value = input[outputKey] ?? (alternateKey ? input[alternateKey] : undefined);
  if (value !== undefined && value !== null) {
    output[outputKey] = value;
  }
}

function recipeIndexOutcome(signal: MealsOutcomeSignal | undefined): MealsRecipeIndexOutcome | null {
  if (!signal) {
    return null;
  }
  const taste = signal.lastFeedback?.taste;
  const repeatAgain = signal.lastFeedback?.repeat_again;
  return {
    status: signal.status,
    ...(taste !== undefined ? { taste } : {}),
    ...(repeatAgain !== undefined ? { repeatAgain } : {}),
    lastUsedAt: signal.lastUsedAt,
    summary: summarizeOutcomeSignal(signal),
  };
}

function summarizeOutcomeSignal(signal: MealsOutcomeSignal): string {
  const taste = normalizeOutcomeToken(signal.lastFeedback?.taste);
  const repeatAgain = signal.lastFeedback?.repeat_again;
  const liked = taste === 'good' || taste === 'great' || taste === 'liked' || taste === 'love' || taste === 'loved';
  if (liked && isPositiveRepeatSignal(repeatAgain)) {
    return 'liked, would repeat';
  }
  if (isNegativeOutcomeSignal(signal.lastFeedback?.taste) || repeatAgain === false || normalizeOutcomeToken(repeatAgain) === 'no') {
    return 'did not work well';
  }
  if (isPositiveRepeatSignal(repeatAgain)) {
    return 'would repeat';
  }
  if (liked) {
    return 'liked';
  }
  return signal.status;
}

function isPositiveRepeatSignal(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  const token = normalizeOutcomeToken(value);
  return token === 'yes' || token === 'true' || token === 'good' || token === 'repeat' || token === 'would repeat';
}

function isNegativeOutcomeSignal(value: unknown): boolean {
  const token = normalizeOutcomeToken(value);
  return token === 'bad' || token === 'poor' || token === 'disliked' || token === 'flop' || token === 'no';
}

function normalizeOutcomeToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function timestampForSort(value: string | null): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function firstMatchingHardConstraint(
  recipeName: string,
  hardConstraints: MealsHardConstraintExclusion[],
): MealsHardConstraintExclusion | null {
  return hardConstraints.find((constraint) => recipeNameMatchesHardConstraint(recipeName, constraint.value)) ?? null;
}

function firstMatchingDietaryPattern(
  recipe: Record<string, unknown>,
  recipeName: string,
  dietaryPatterns: MealsDietaryPatternExclusion[],
): MealsDietaryPatternExclusion | null {
  const ingredientNames = recipeIngredientNames(recipe);
  return dietaryPatterns.find((pattern) => {
    const blockers = blockersForDietaryPattern(pattern.pattern);
    const qualifiers = qualifiersForDietaryPattern(pattern.pattern);
    return (
      ingredientMatchesAnyBlocker(ingredientNames, blockers, qualifiers) ||
      ingredientMatchesAnyBlocker([recipeName], blockers, qualifiers)
    );
  }) ?? null;
}

function qualifiersForDietaryPattern(pattern: DietaryPattern): string[] {
  return pattern === 'vegan' ? [...PLANT_BASED_QUALIFIERS, ...DAIRY_FREE_QUALIFIERS] : PLANT_BASED_QUALIFIERS;
}

function recipeIngredientNames(recipe: Record<string, unknown>): string[] {
  const names: string[] = [];
  collectRecipeIngredientNames(names, recipe);
  const raw = objectRecord(recipe.raw);
  if (raw) {
    collectRecipeIngredientNames(names, raw);
  }
  return uniqueSorted(names);
}

function collectRecipeIngredientNames(names: string[], record: Record<string, unknown>): void {
  const ingredients = Array.isArray(record.ingredients)
    ? record.ingredients.map(objectRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
  for (const ingredient of ingredients) {
    for (const key of ['item', 'name', 'ingredient', 'canonical_item', 'canonicalItem']) {
      const value = ingredient[key];
      if (typeof value === 'string' && value.trim()) {
        names.push(value.trim());
      }
    }
  }
}

function recipeNameMatchesHardConstraint(recipeName: string, exclusionValue: string): boolean {
  const nameTokens = new Set(tokenizeForConstraintMatch(recipeName));
  const exclusionTokens = tokenizeForConstraintMatch(exclusionValue);
  // Whole-word (stem-folded) match only: every exclusion token must appear as a name token.
  // Deliberately NO arbitrary substring match — that over-tagged safe titles ("nut" -> "Butternut
  // Squash", "egg" -> "Veggie Chili"), wrongly dropping a safe recipe (over-restriction). Bias to
  // precision: a missed tag is backstopped by the hardConstraintBoundary guidance (the host still
  // excludes conflicting ingredients when drafting), but a false tag silently removes a safe meal.
  // Morphology/aliases the name index cannot resolve (e.g. "walnut" -> "tree nuts") are intentionally
  // NOT tagged here and are left to the guidance.
  return exclusionTokens.length > 0 && exclusionTokens.every((token) => nameTokens.has(token));
}

function tokenizeForConstraintMatch(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stemConstraintToken);
}

// Crude singular->base fold so "peanuts"/"nuts"/"eggs" match a singular recipe token (and vice versa).
// Strips a single trailing 's' on tokens longer than 3 chars; conservative (no 'es' stripping, which
// would collapse distinct words like "cheese"). Applied to BOTH sides, so it only needs to be consistent.
function stemConstraintToken(token: string): string {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

// Compact on-hand inventory signal (counts + a few names), only emitted when inventory exists.
// Deliberately not a confirmed live count — the usage note keeps the host from asserting pantry truth.
function mealsInventorySummary(inventory: unknown[]): unknown | null {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return null;
  }
  const byStatus: Record<string, number> = {};
  const sampleOnHand: string[] = [];
  for (const entry of inventory) {
    const record = objectRecord(entry);
    if (!record) {
      continue;
    }
    const status = stringField(record, 'status') ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const name = firstString(record, ['name', 'displayName', 'normalizedName']);
    if (name && sampleOnHand.length < INVENTORY_SUMMARY_SAMPLE_CAP) {
      sampleOnHand.push(name);
    }
  }
  return {
    object: 'MealsInventorySummary',
    domain: 'meals',
    source: 'meals.getInventory',
    totalItems: inventory.length,
    byStatus,
    sampleOnHand,
    usage:
      'Use this as a rough on-hand signal when planning (prefer recipes that reuse what is already in inventory). It is not a confirmed live count — do not assert exact quantities or that an item is definitely available; confirm with the user before treating it as current.',
  };
}

function mealsKnowledgeSummary(calibration: unknown, grocery: unknown, intent: FluentVNextReadIntent): unknown | null {
  const record = objectRecord(calibration);
  if (!record) {
    return null;
  }
  return {
    object: 'MealsKnowledgeSummary',
    domain: 'meals',
    intent,
    source: 'meals.getOnboardingCalibration',
    userFacingMode:
      'Say what Fluent supplied as confirmed facts, inferred signals, missing context, and currentness. Do not expose internal setup-status, calibration, or readiness labels as things Fluent knows.',
    attributionBoundary:
      'When saying what Fluent knows, only attribute facts from this ContextPacket to Fluent. Keep prior chat memory, model assumptions, and other domains separate unless separately read from Fluent.',
    confirmedFacts: [
      ...userFacingPreferenceFacts(record.confirmedPreferences),
      ...userFacingStringArray(record.confirmedMealFacts),
      ...userFacingStringArray(record.hardAvoids).map((item) => `hard avoid: ${item}`),
    ].slice(0, 10),
    inferredSignals: [
      ...userFacingStringArray(record.inferredMealSignals),
      ...userFacingStringArray(record.inferredPatterns),
    ].slice(0, 8),
    missingFacts: [
      ...userFacingStringArray(record.evidenceGaps),
      ...userFacingStringArray(record.unresolvedQuestions),
    ].slice(0, 10),
    currentnessStatus: intent === 'today' || intent === 'planning' ? mealsWeeklyCurrentnessStatus(grocery) : 'not_requested',
  };
}

function styleResponseGuidance(intent: FluentVNextReadIntent, context?: unknown): unknown {
  const pendingReanalyze = passiveStyleReanalyzeSummary(context);
  const baseGuidance = {
    object: 'ResponseGuidance',
    domain: 'style',
    intent,
    source: 'fluent_vnext_read_layer',
    productBoundary:
      'Public vNext Style is a context, evidence, provenance, and media-boundary surface. Fluent does not make final buy/wait/skip verdicts, browse retailer pages, extract product pages, fill carts, check out, or render purchase widgets.',
    visualBoundary:
      'Before making visual claims, the host model must inspect user-provided images or media returned by fluent_get_media_bundle. If no inspectable image is available, ask for an upload, direct image URL, or description instead of presenting a final style judgment.',
    attributionBoundary:
      'Attribute only facts returned by Fluent reads to Fluent. Keep prior chat memory, model assumptions, browser context, and user-supplied candidate details separate unless Fluent returned that evidence.',
    allowedPublicReads: [
      'fluent_get_context(domain="style", intent="closet")',
      'fluent_get_context(domain="style", intent="purchase")',
      'fluent_list_items(domain="style", item_type="style_item")',
      'fluent_get_item(domain="style", item_id=...)',
      'fluent_list_evidence(domain="style", subject=...)',
      'fluent_get_media_bundle(domain="style", purpose="style_purchase_advice")',
    ],
    avoidUserFacingClaims: [
      'Do not say Fluent inspected pixels; the host model performs visual inspection.',
      'Do not say Fluent completed, staged, or can complete a purchase.',
      'Do not expose old Style purchase-analysis, setup-widget, product-page extraction, or render-tool names as public vNext behavior.',
      'Do not write arbitrary Style memory through the public vNext profile; only the typed closet detail, photo, and no-longer-owned flows are public.',
    ],
    ...(pendingReanalyze ? { pendingReanalyze } : {}),
    writeBoundary: 'Public vNext exposes only typed Style closet-management writes. Ask for explicit confirmation and provenance before changing closet details, saving a host-inspected image URL, or marking an item no longer owned.',
  };
  if (intent !== 'purchase') {
    return baseGuidance;
  }
  return {
    ...baseGuidance,
    purchaseVerdictFlow: {
      mode: 'one_read_prose_verdict',
      requiredFacts: [
        'CategoryResolution',
        'StylePurchaseOwnedSlice',
        'StylePurchaseCompleteness',
        'BudgetArithmeticFact',
      ],
      modelOwns:
        'The host model owns relevance, duplicate/gap assessment, buy/wait/skip verdict, and all user-facing prose from the candidate evidence plus this packet.',
      budgetBoundary:
        'BudgetArithmeticFact is a fact, not a cap. Mention price, remainingThisPeriod, delta, status, and caveats without saying Fluent decided the verdict from budget. Use only a candidate price you verified from the product page or listing; if you have no verified price, ask the user rather than estimating a typical or approximate one.',
      ownedSliceBoundary:
        'Cite owned items by name. If completeness.complete is false, say the slice is incomplete and offer to look wider before claiming no comparable owned item exists.',
      renderBoundary:
        'Lead with the prose verdict; it is never replaced by a card. Then, when the owned slice contains one or more true comparators (owned items doing the same wardrobe job as the candidate), render fluent_render_style_closet_surface with filter.item_ids set to exactly those comparator item ids, beneath the prose verdict, so the user can see what they already own. Pass only the true-comparator ids — never the whole category. If there is no true owned comparator, stay prose-only.',
    },
  };
}

function reservedDomainResponseGuidance(domain: FluentVNextDomain, intent: FluentVNextReadIntent): unknown {
  const domainLabel = domain === 'finance' ? 'Finance' : domain === 'wellbeing' ? 'Wellbeing' : domain;
  return {
    object: 'ResponseGuidance',
    domain,
    intent,
    source: 'fluent_vnext_read_layer',
    productBoundary:
      `${domainLabel} is reserved and is not a public Fluent vNext product surface yet. Treat this ContextPacket as an explicit no-data boundary, not as evidence of readiness or missing setup.`,
    attributionBoundary:
      `Do not attribute ${domainLabel} facts, recommendations, readiness, transactions, accounts, budgets, health goals, medical context, or private records to Fluent from this packet.`,
    allowedPublicReads: ['fluent_get_context', 'fluent_get_shared_profile'],
    avoidUserFacingClaims: [
      `Do not say Fluent knows ${domainLabel} details.`,
      `Do not present ${domainLabel} advice as grounded in Fluent.`,
      'Do not request or expose raw private records through public vNext.',
      'Do not save public writes for this domain.',
    ],
    writeBoundary: 'No public write schema exists for this domain.',
  };
}

function mealsResponseGuidance(intent: FluentVNextReadIntent): unknown {
  const broadPlanningIntent = intent === 'planning' || intent === 'today';
  return {
    object: 'ResponseGuidance',
    domain: 'meals',
    intent,
    source: 'fluent_vnext_read_layer',
    attributionBoundary:
      'If the user asks what Fluent knows, answer from compactFacts, relevantItems, evidenceGaps, freshness, and sourceReads only. Do not call external memory or general model assumptions Fluent knowledge.',
    externalMemoryBoundary:
      'Do not blend prior chat memory, other-domain context, browser context, or model assumptions into what Fluent knows unless a separate Fluent read returned that evidence.',
    avoidUserFacingClaims: [
      'Do not expose internal setup-status labels.',
      'Do not say Fluent has a calibrated profile, considers the domain ready, or knows readiness labels; those are internal routing facts, not user knowledge.',
      'Do not describe Fluent as ready; describe the specific evidence and gaps instead.',
      'Do not merge Fluent facts with separate assistant memory in the same sentence.',
      'Do not invent cross-domain relevance when only Meals was read.',
    ],
    currentnessBoundary:
      'If MealsCurrentness.status is stale, missing, or incomplete, state that grocery context is not trustworthy enough for a concrete grocery-dependent plan. Still give one safe, tentative planning framework or compact unlock from confirmed/inferred Meals facts when available, label it as not based on current groceries, then ask one confirmation. Never stop at only an intake question, multiple-choice card, or state dump.',
    hardConstraintBoundary: MEALS_HARD_CONSTRAINT_USAGE,
    softPreferenceBoundary: MEALS_SOFT_PREFERENCES_USAGE,
    dietaryPatternBoundary: MEALS_DIETARY_PATTERNS_USAGE,
    recommendedAnswerShape:
      'For broad planning or "what Fluent knows" prompts, answer in this order: useful confirmed Meals facts and preferences, recent saved-recipe outcomes from MealsOutcomeSignals (repeat what was loved, flag what flopped), the saved recipes you will build the plan from (by name, from MealsRecipeIndex in this packet), inferred signals clearly labeled as inferred, currentness/grocery and on-hand inventory trust boundary, one tentative planning move when safe, missing facts, then one compact user question. Ground the plan in the packet\'s saved recipes, confirmed preferences, hard avoids, dietary patterns, and recent outcomes, deferring to hardConstraintBoundary for any MealsHardConstraints conflict, applying dietaryPatternBoundary before soft preferences, and using MealsSoftPreferences only as a ranking/variety input that defers to hard constraints and dietary patterns — do not invent recipes when matching saved ones exist. If MealsOutcomeSignals.entries is non-empty, never claim no cooked/feedback status exists and do not offer to log feedback already present in the packet. Do not stop at a broad intake dump. Do not lead with stale grocery detail unless the user asked specifically about groceries.',
    tentativePlanningBoundary:
      'When grocery state is stale, missing, or incomplete, suggest a lightweight meal framework from confirmed/inferred Meals facts when available, but must not present it as based on current groceries or as a finalized shopping plan. If only Meals context was read, say exactly: "I did not read outside meals or cross-domain Fluent context for this turn." Also say exactly: "Nothing has been saved" unless a public write returned success and read-after-write evidence.',
    weeklyMealPlanningBoundary:
      'For weekly meal planning, the host model may draft a 2-4 dinner plan from returned Meals facts and user turn context, but Fluent does not persist that plan. Before proposing grocery-list deltas, resolve named recipes with fluent_list_items/fluent_get_item/fluent_list_evidence and check current grocery-list evidence so duplicate or already-covered items are not proposed. When the user explicitly approves a drafted plan, proactively offer to save it with fluent_save_meal_plan (the exact approved plan), then cite read-after-write before claiming it was saved. If you offered to save a plan and the user did not answer, ask once more before ending the task or moving past planning; an unanswered offer is not a decline, but never save without an answer.',
    approvedGroceryDeltaBoundary:
      'Apply grocery changes only one explicit user-approved item at a time through fluent_apply_grocery_list_change, then cite the WriteAck readAfterWrite before saying anything changed. Do not batch hidden deltas, infer pantry/fridge quantity truth, browse retailers, mutate carts, place orders, or save the draft plan as memory. When the user confirms they bought or already have a single item for the current week, proactively offer it and on their explicit yes call fluent_apply_grocery_list_change (approval="explicit_user_approved", currentness_confirmed=true), then cite read-after-write. When the user says they finished a whole shop ("I went shopping", "got everything"), proactively offer the post-shopping reconcile and on their explicit yes call fluent_apply_grocery_shopping_result (mark_all_to_buy_bought=true, or the specific bought_items, currentness_confirmed=true): it marks the current list bought items purchased and refreshes inventory presence in one approved action (presence only, never inventing quantities), then cite read-after-write before claiming anything changed.',
    outcomeLearningBoundary:
      'Recipe outcomes belong on fluent_record_recipe_feedback for one saved recipe. Do not turn one meal outcome into broad preferences, grocery state, inventory, or durable routine memory. When the user says they cooked, ate, or tried a saved recipe, make a brief explicit offer in the same reply to record it (for example: "Want me to log that to Fluent — tasted great, would repeat?") and do not end the turn without offering; you may also ask one quick clarifying detail. Only on the user\'s yes, call fluent_record_recipe_feedback (approval="explicit_user_approved", with taste/difficulty/repeat from the conversation), then cite read-after-write before claiming it was recorded.',
    routineLearningBoundary:
      'Durable routine learning requires a separate explicit fluent_update_shared_profile_patch with a supported Meals fact kind such as routine_note, planning_grocery_day, or weeknight_time_limit_minutes. Never infer a routine from one observed week.',
    portableCaptureBoundary:
      'When a durable cross-domain person-fact (Tier-1: an allergy, a hard avoid, a dietary pattern, an anti-favorite, a strong taste like/dislike) surfaces in the flow, proactively offer to capture it via fluent_update_shared_profile_patch, but at most ONE task-bound capture question per turn, woven into the meal-planning task; never make a survey or intake dump. NEVER ask about a fact already present in this packet\'s compactFacts/sharedPersonFacts; do not re-ask a confirmed fact. Membership test: "Would a second domain or host ever act on this? If yes, capture it as a portable Fluent fact; if it is a single-consumer Meals operational lever (grocery day, weeknight time limit, batch size), keep it domain-local — do not frame it as portable." At the moment of capture, include this one-line portability and consent disclosure template: "I\'ll keep [the fact] in your Fluent profile so any assistant you connect can act on it, and Meals will plan around it." Frame the fact as portable/cross-host and action-relevant; never market it as "remembering." Still obey explicit_user_approved, read-after-write, and "Nothing has been saved" boundaries: offer proactively, but write only after the user gives an explicit yes. NEW-this-turn facts are the highest-value capture: if the user reveals a durable cross-domain fact in the current turn (for example a dietary pattern like plant-forward/vegetarian/pescatarian/gluten-free, a new allergy, a new hard avoid, or a strong like/dislike), detect it yourself and offer the portable capture before ending the turn. For confirmed standing vegetarian, vegan, or pescatarian identities, set patch.pattern to the canonical enum even when the user\'s phrasing is not a literal label; never set pattern for hedged, leaning, mostly, trying, flexitarian, negated, or no-longer statements, and do not capture those as standing exclusions. The packet\'s suggestedWritebacks only list facts already stored; a fact the user just stated will NOT appear there - detect it from the conversation yourself and offer the capture before ending the turn. Prioritize this portable-fact capture offer ABOVE offering to save a recipe or meal plan - a recipe/plan save is per-week; a portable person-fact follows the user to every assistant they connect.',
    detailReadPolicy: broadPlanningIntent
      ? {
          object: 'DetailReadPolicy',
          mode: 'answer_from_this_packet_for_broad_planning',
          answerFromPacketForTentativePlanning: true,
          packetProvidesForPlanning: [
            'MealsRecipeIndex (the saved recipes to plan from, grouped by meal type)',
            'MealsOutcomeSignals (recent saved-recipe outcomes for keep-vs-swap planning)',
            'MealsHardConstraints (confirmed allergies and hard avoids that must be honored before selecting recipes)',
            'MealsDietaryPatterns (confirmed vegetarian/vegan/pescatarian identity defaults surfaced as ingredient-class exclusions and recipe annotations)',
            'MealsSoftPreferences (confirmed likes/dislikes used only for ranking and variety after hard constraints)',
            'confirmed preferences and hard avoids (in MealsKnowledgeSummary)',
            'MealsInventorySummary (a rough on-hand signal, when inventory exists)',
            'MealsCurrentness (grocery trust boundary)',
          ],
          detailReadsAllowed: false,
          detailReadsAllowedOnlyToExpandPacket: [
            'meals_list_recipes',
            'fluent_list_items',
            'fluent_get_item',
          ],
          blockedForBroadPlanning: [
            'meals_get_onboarding_calibration',
            'meals_get_preferences',
            'meals_get_plan',
            'meals_list_plan_history',
            'meals_get_inventory_summary',
            'fluent_list_evidence',
          ],
          allowedOnlyWhen: [
            'The user names a specific saved recipe or item to open in full, or asks to see more recipes than this packet\'s index lists (then read meals_list_recipes/fluent_list_items/fluent_get_item, filtered and paginated).',
            'This ContextPacket names a specific missing field or item that must be read before answering.',
            'The user asks to inspect evidence/provenance rather than asking for a tentative broad plan.',
          ],
          broadPlanningInstruction:
            'Plan from this packet: honor MealsHardConstraints first, apply MealsDietaryPatterns as standing default ingredient-class exclusions, then build the requested meals from MealsRecipeIndex and the confirmed preferences/hard-avoids, use MealsOutcomeSignals and MealsRecipeIndex.recentOutcome for keep-vs-swap reasoning, use MealsSoftPreferences only to rank otherwise-acceptable options and vary toward likes/away from dislikes, and use MealsInventorySummary as an on-hand signal. The planning memory is already here — do not chain detail reads before answering, and do not invent recipes when the index has matching saved ones. Exclude recipes tagged conflictsWithHardConstraint with a brief reason; treat conflictsWithDietaryPattern as an annotate-only planning signal unless the user explicitly asks off-pattern this turn; never exclude solely for a soft preference. Only read a recipe or item in full (meals_list_recipes/fluent_list_items) when the user names it or asks to page beyond the index.',
        }
      : undefined,
    writeApprovalBoundary: 'Public Meals writes require approval="explicit_user_approved", and the host may also prompt the user to approve the action before it runs. Offer the write and get an explicit yes from the user BEFORE calling the tool — do not fire a write from a bare narration. If a write is not approved or the result says no approval was received, tell the user plainly that it needs their approval and re-offer it; never attribute a write failure to session tokens, write permissions, connectivity, or trying again in a fresh session unless the Fluent tool result text says exactly that.',
    writeBoundary: 'Do not say anything was saved unless a Fluent write tool returned status=applied with readAfterWrite evidence.',
  };
}

function buildMealsSuggestedWritebacks(
  calibration: unknown,
  grocery: unknown,
  intent: FluentVNextReadIntent,
  personFacts: PersonFact[] = [],
): unknown[] {
  if (intent !== 'today' && intent !== 'planning') {
    return [];
  }
  const suggestions: unknown[] = [];
  const calibrationRecord = objectRecord(calibration);
  const suggestedNextAction = objectRecord(calibrationRecord?.suggestedNextAction);
  if (suggestedNextAction) {
    suggestions.push({
      object: 'SuggestedWriteback',
      domain: 'meals',
      type: 'calibration_next_action',
      label: suggestedNextAction.label ?? null,
      rationale: suggestedNextAction.rationale ?? null,
      proposedToolName: suggestedNextAction.toolName ?? null,
      requiresExplicitUserApproval: true,
      source: 'meals.getOnboardingCalibration',
    });
  }

  const unresolvedQuestions = arrayField(calibration, 'unresolvedQuestions');
  if (unresolvedQuestions.length) {
    suggestions.push({
      object: 'SuggestedWriteback',
      domain: 'meals',
      type: 'ask_before_planning',
      questions: unresolvedQuestions.slice(0, 3),
      requiresExplicitUserApproval: true,
      source: 'meals.getOnboardingCalibration',
    });
  }

  const freshnessStatus = grocery ? freshnessStatusFromPayload(grocery) : 'unknown';
  if (freshnessStatus === 'stale' || freshnessStatus === 'unknown') {
    const groceryRecord = objectRecord(grocery);
    suggestions.push({
      object: 'SuggestedWriteback',
      domain: 'meals',
      type: grocery ? 'confirm_current_grocery_list' : 'confirm_missing_current_grocery_list',
      allowedAction: 'ask_user_first',
      label: mealsNextUserQuestion(groceryRecord),
      nextUserQuestion: mealsNextUserQuestion(groceryRecord),
      rationale: mealsCurrentnessRationale(groceryRecord, freshnessStatus),
      proposedToolName: 'fluent_update_shared_profile_patch',
      proposedPatchShape: 'fact_patch',
      proposedPatchExample: {
        kind: 'planning_grocery_day',
        status: 'confirmed',
        value: 'Sunday',
      },
      requiresExplicitUserApproval: true,
      source: grocery ? 'meals.getCurrentGroceryList' : 'fluent_vnext_read_layer',
    });
  }

  const portableCaptureCandidate = mealsPortableCaptureCandidate(calibration, personFacts);
  if (portableCaptureCandidate) {
    suggestions.push({
      object: 'SuggestedWriteback',
      domain: 'meals',
      type: 'capture_portable_person_fact',
      allowedAction: 'ask_user_first',
      label: `Offer portable capture for ${portableCaptureCandidate.value}`,
      nextUserQuestion:
        `Want me to keep ${portableCaptureCandidate.value} in your Fluent profile so any assistant you connect can act on it, and Meals will plan around it?`,
      portabilityDisclosure:
        `I'll keep ${portableCaptureCandidate.value} in your Fluent profile so any assistant you connect can act on it, and Meals will plan around it.`,
      proposedToolName: 'fluent_update_shared_profile_patch',
      proposedPatchShape: 'fact_patch',
      proposedPatchExample: {
        kind: portableCaptureCandidate.publicKind,
        status: 'confirmed',
        value: portableCaptureCandidate.value,
      },
      requiresExplicitUserApproval: true,
      source: 'fluent_vnext_read_layer',
    });
  }

  return suggestions;
}

type MealsPortableCaptureCandidate = {
  personKind: 'allergy' | 'hard_avoid' | 'dietary_pattern' | 'anti_favorite' | 'taste_pref';
  publicKind: 'allergy' | 'hard_avoid' | 'dietary_pattern' | 'avoid' | 'favorite';
  value: string;
};

function mealsPortableCaptureCandidate(
  calibration: unknown,
  personFacts: PersonFact[],
): MealsPortableCaptureCandidate | null {
  const record = objectRecord(calibration);
  if (!record) {
    return null;
  }
  const candidates: MealsPortableCaptureCandidate[] = [
    ...userFacingStringArray(record.hardAvoids).map((value) => ({
      personKind: 'hard_avoid' as const,
      publicKind: 'hard_avoid' as const,
      value,
    })),
    ...mealsPortableCandidatesFromConfirmedPreferences(record.confirmedPreferences),
  ];
  return candidates.find((candidate) => !hasMatchingPersonFact(candidate, personFacts)) ?? null;
}

function mealsPortableCandidatesFromConfirmedPreferences(value: unknown): MealsPortableCaptureCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const candidates: MealsPortableCaptureCandidate[] = [];
  for (const entry of value) {
    const record = objectRecord(entry);
    const label = record ? firstString(record, ['value', 'label', 'name', 'summary', 'note']) : typeof entry === 'string' ? entry.trim() : null;
    if (!label) {
      continue;
    }
    const kind = typeof record?.kind === 'string' ? record.kind : null;
    const status = typeof record?.status === 'string' ? record.status : null;
    if (status === 'rejected' || status === 'inferred') {
      continue;
    }
    if (kind === 'allergy') {
      candidates.push({ personKind: 'allergy', publicKind: 'allergy', value: label });
      continue;
    }
    if (kind === 'dietary_constraint') {
      candidates.push({ personKind: 'dietary_pattern', publicKind: 'dietary_pattern', value: label });
      continue;
    }
    if (kind === 'disliked_food') {
      candidates.push({ personKind: 'anti_favorite', publicKind: 'avoid', value: label });
      continue;
    }
    if (kind === 'favorite_food' || kind === 'preferred_cuisine') {
      candidates.push({ personKind: 'taste_pref', publicKind: 'favorite', value: label });
      continue;
    }
    // Only structured, recognized Tier-1 kinds become portable-capture offers. Entries with an
    // unrecognized/free-text kind are intentionally NOT guessed into a fact: a heuristic like
    // "no <x>" misfires on operational notes ("no time on weeknights" -> avoid "time on weeknights")
    // and would pollute the portable spine with garbage. Capture only what the calibration layer
    // has already structured.
  }
  return candidates;
}

function hasMatchingPersonFact(candidate: MealsPortableCaptureCandidate, personFacts: PersonFact[]): boolean {
  const normalizedCandidateValue = normalizePortableFactValue(candidate.value);
  return personFacts.some((fact) => {
    if (fact.status !== 'confirmed') {
      return false;
    }
    if (!personFactKindsOverlap(candidate.personKind, fact.kind)) {
      return false;
    }
    return normalizePortableFactValue(factLabel(fact)) === normalizedCandidateValue;
  });
}

function personFactKindsOverlap(candidateKind: MealsPortableCaptureCandidate['personKind'], factKind: PersonFact['kind']): boolean {
  if ((candidateKind === 'anti_favorite' || candidateKind === 'hard_avoid') && (factKind === 'anti_favorite' || factKind === 'hard_avoid')) {
    return true;
  }
  return candidateKind === factKind;
}

function normalizePortableFactValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mealsCurrentnessEvidenceGaps(grocery: unknown, calibration: unknown, intent: FluentVNextReadIntent): unknown[] {
  if (intent !== 'today' && intent !== 'planning') {
    return [];
  }
  const gaps: unknown[] = [];
  const unresolvedQuestions = arrayField(calibration, 'unresolvedQuestions');
  if (unresolvedQuestions.length) {
    gaps.push({
      object: 'EvidenceGap',
      domain: 'meals',
      type: 'unresolved_calibration_questions',
      priority: 'medium',
      questions: unresolvedQuestions.slice(0, 3),
      source: 'meals.getOnboardingCalibration',
    });
  }

  if (!grocery) {
    gaps.push({
      object: 'EvidenceGap',
      domain: 'meals',
      type: 'missing_current_grocery_list',
      priority: 'high',
      note: 'No current grocery list was available for a planning or today request.',
      source: 'meals.getCurrentGroceryList',
    });
    return gaps;
  }

  const status = freshnessStatusFromPayload(grocery);
  const weeklyStatus = mealsWeeklyCurrentnessStatus(grocery);
  if (status === 'stale' || status === 'unknown' || weeklyStatus === 'incomplete' || weeklyStatus === 'missing') {
    const record = objectRecord(grocery);
    gaps.push({
      object: 'EvidenceGap',
      domain: 'meals',
      type: mealsCurrentnessGapType(weeklyStatus, status),
      priority: status === 'stale' || weeklyStatus === 'missing' ? 'high' : 'medium',
      currentWeekPlan: mealsCurrentWeekPlanStatus(record),
      groceryList: mealsGroceryListReadiness(record),
      nextUserQuestion: mealsNextUserQuestion(record),
      staleReasons: arrayField(grocery, 'staleReasons'),
      selectionReason: record?.selectionReason ?? null,
      trustLabel: record?.trustLabel ?? null,
      trustState: record?.trustState ?? null,
      weekRelation: record?.weekRelation ?? null,
      source: 'meals.getCurrentGroceryList',
    });
  }

  return gaps;
}

function mealsCurrentnessFact(grocery: unknown, intent: FluentVNextReadIntent): unknown {
  const record = objectRecord(grocery);
  const status = mealsWeeklyCurrentnessStatus(record);
  const manualIntentCount = mealsManualIntentCount(record);
  return {
    object: 'MealsCurrentness',
    domain: 'meals',
    intent,
    allowedAction: 'ask_user_first',
    currentWeekPlan: mealsCurrentWeekPlanStatus(record),
    freshnessStatus: record ? freshnessStatusFromPayload(record) : 'unknown',
    groceryList: mealsGroceryListReadiness(record),
    hasCurrentGroceryList: status === 'current' || status === 'incomplete',
    livingList: mealsLivingListStatus(record),
    manualIntentCount,
    nextUserQuestion: status === 'current' ? null : mealsNextUserQuestion(record),
    planningUse: mealsPlanningUse(status),
    selectionReason: record?.selectionReason ?? null,
    stale: record?.stale ?? null,
    staleReasons: arrayField(record, 'staleReasons'),
    status,
    trustLabel: record?.trustLabel ?? null,
    trustState: record?.trustState ?? null,
    weekRelation: record?.weekRelation ?? null,
    source: record ? 'meals.getCurrentGroceryList' : 'fluent_vnext_read_layer',
  };
}

function mealsPlanningUse(status: 'current' | 'stale' | 'incomplete' | 'missing'): string {
  if (status === 'current') {
    return 'concrete_grocery_dependent_planning_ok';
  }
  if (status === 'incomplete') {
    return 'tentative_framework_ok_confirm_check_at_home_before_grocery_dependent_plan';
  }
  if (status === 'stale') {
    return 'tentative_framework_ok_refresh_or_confirm_before_grocery_dependent_plan';
  }
  return 'tentative_framework_ok_ask_for_current_groceries_before_grocery_dependent_plan';
}

function mealsCurrentnessRationale(
  grocery: Record<string, unknown> | null,
  freshnessStatus: FluentVNextContextPacket['freshness']['status'],
): string {
  if (!grocery) {
    return 'Fluent has no current grocery list for this planning context, so the host should ask before assuming what is in scope.';
  }
  const trustLabel = typeof grocery.trustLabel === 'string' ? grocery.trustLabel : null;
  const selectionReason = typeof grocery.selectionReason === 'string' ? grocery.selectionReason : null;
  return [trustLabel, selectionReason, `freshness=${freshnessStatus}`].filter(Boolean).join(' ');
}

function mealsWeeklyCurrentnessStatus(grocery: unknown): 'current' | 'stale' | 'incomplete' | 'missing' {
  const record = objectRecord(grocery);
  if (!record) {
    return 'missing';
  }
  if (freshnessStatusFromPayload(record) === 'stale') {
    return 'stale';
  }
  if (mealsCurrentWeekPlanStatus(record) === 'absent') {
    return mealsGroceryListReadiness(record) === 'absent' ? 'missing' : 'incomplete';
  }
  if (mealsGroceryListReadiness(record) !== 'ready') {
    return 'incomplete';
  }
  return 'current';
}

function mealsCurrentWeekPlanStatus(record: Record<string, unknown> | null): 'accepted' | 'draft' | 'absent' | 'unknown' {
  if (!record) {
    return 'absent';
  }
  if (record.groceryPlan === null || record.currentPlan === null || record.plan === null) {
    return 'absent';
  }
  const plan = objectRecord(record.groceryPlan) ?? objectRecord(record.currentPlan) ?? objectRecord(record.plan);
  const status = typeof plan?.status === 'string' ? plan.status : stringField(record, 'planStatus');
  if (status === 'accepted' || status === 'active' || status === 'current') {
    return 'accepted';
  }
  if (status === 'draft' || status === 'proposed' || status === 'preview') {
    return 'draft';
  }
  if (record.weekRelation === 'current' || record.stale === false) {
    return 'accepted';
  }
  return 'unknown';
}

function mealsGroceryListReadiness(record: Record<string, unknown> | null): 'ready' | 'needs_at_home_checks' | 'stale' | 'absent' {
  if (!record) {
    return 'absent';
  }
  if (freshnessStatusFromPayload(record) === 'stale') {
    return 'stale';
  }
  const counts = objectRecord(record.counts);
  const manualIntentCount = mealsManualIntentCount(record);
  const planItemCount = typeof counts?.planItemCount === 'number'
    ? counts.planItemCount
    : typeof record.planItemCount === 'number'
      ? record.planItemCount
      : 0;
  const hasPreparedOrder = Boolean(objectRecord(record.preparedOrder));
  if (record.groceryPlan == null && record.items == null && !hasPreparedOrder && manualIntentCount === 0 && planItemCount === 0) {
    return 'absent';
  }
  const checkAtHomeCount = typeof counts?.checkAtHomeCount === 'number'
    ? counts.checkAtHomeCount
    : typeof record.checkAtHomeCount === 'number'
      ? record.checkAtHomeCount
      : 0;
  const trustState = typeof record.trustState === 'string' ? record.trustState : '';
  if (checkAtHomeCount > 0 || trustState.includes('check_at_home') || trustState.includes('needs_at_home')) {
    return 'needs_at_home_checks';
  }
  return 'ready';
}

function mealsManualIntentCount(record: Record<string, unknown> | null): number {
  if (!record) {
    return 0;
  }
  const counts = objectRecord(record.counts);
  if (typeof counts?.manualIntentCount === 'number') {
    return counts.manualIntentCount;
  }
  if (typeof record.manualIntentCount === 'number') {
    return record.manualIntentCount;
  }
  return arrayField(record, 'intents').length;
}

function mealsLivingListStatus(record: Record<string, unknown> | null): string {
  if (!record) {
    return 'absent';
  }
  if (record.weekRelation === 'future') {
    return 'upcoming_week_list';
  }
  const manualIntentCount = mealsManualIntentCount(record);
  const planStatus = mealsCurrentWeekPlanStatus(record);
  if (manualIntentCount > 0 && planStatus === 'absent') {
    return 'current_week_manual_items_only';
  }
  if (manualIntentCount > 0) {
    return 'current_week_with_manual_items';
  }
  if (mealsGroceryListReadiness(record) === 'absent') {
    return 'absent';
  }
  return 'current_week_list';
}

function mealsCurrentnessGapType(
  status: 'current' | 'stale' | 'incomplete' | 'missing',
  freshnessStatus: FluentVNextContextPacket['freshness']['status'],
): string {
  if (status === 'missing') {
    return 'missing_current_grocery_list';
  }
  if (status === 'incomplete') {
    return 'incomplete_current_grocery_list';
  }
  return freshnessStatus === 'stale' ? 'stale_current_grocery_list' : 'unknown_current_grocery_list_freshness';
}

function mealsNextUserQuestion(record: Record<string, unknown> | null): string {
  if (!record) {
    return 'What groceries or current meal plan should I treat as active for this week?';
  }
  const status = mealsWeeklyCurrentnessStatus(record);
  if (status === 'stale') {
    if (record.weekRelation === 'future') {
      return 'Should I treat this upcoming grocery list as the active planning target?';
    }
    return 'Is this saved grocery list still current for this week, or should we refresh it before planning?';
  }
  if (status === 'missing') {
    return 'What current groceries or plan should I use for this week before suggesting meals?';
  }
  if (status === 'incomplete') {
    return 'Are the check-at-home or draft grocery items accurate enough to plan from, or should we confirm them first?';
  }
  return 'Should I save this confirmed Meals context before using it again?';
}

function freshnessStatusFromPayload(value: unknown): FluentVNextContextPacket['freshness']['status'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'unknown';
  }
  const record = value as Record<string, unknown>;
  const freshness = record.freshness;
  if (freshness && typeof freshness === 'object' && !Array.isArray(freshness)) {
    const nested = (freshness as Record<string, unknown>).status;
    if (nested === 'current' || nested === 'stale' || nested === 'unknown') {
      return nested;
    }
  }
  const direct = record.freshnessStatus ?? record.freshness_status;
  if (direct === 'current' || direct === 'stale' || direct === 'unknown') {
    return direct;
  }
  if (record.stale === true) {
    return 'stale';
  }
  if (record.stale === false) {
    return 'current';
  }
  if (record.weekRelation === 'past' || record.weekRelation === 'future') {
    return 'stale';
  }
  const trustState = typeof record.trustState === 'string' ? record.trustState : null;
  if (trustState && (trustState.includes('out_of_date') || trustState.includes('stale'))) {
    return 'stale';
  }
  return 'unknown';
}

function mediaAssetCount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 0;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['assets', 'photos', 'images', 'imageUrls', 'image_urls']) {
    const entry = record[key];
    if (Array.isArray(entry)) {
      return entry.length;
    }
  }
  return 0;
}

function stringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === 'string' && entry.trim() ? entry : null;
}

function userFacingStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      output.push(entry.trim());
      continue;
    }
    const record = objectRecord(entry);
    const label = record
      ? firstString(record, ['label', 'summary', 'question', 'name', 'value', 'claim', 'note', 'detail'])
      : null;
    if (label) {
      output.push(label);
    }
  }
  return output;
}

function userFacingPreferenceFacts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const priorities = new Map<string, number>([
    ['meal_routine', 0],
    ['cooking_cadence', 1],
    ['weeknight_time_limit', 2],
    ['grocery_expectation', 3],
    ['favorite_food', 4],
    ['preferred_cuisine', 5],
    ['leftover_preference', 6],
    ['disliked_food', 10],
  ]);
  return [...value]
    .sort((left, right) => {
      const leftKind = objectRecord(left)?.kind;
      const rightKind = objectRecord(right)?.kind;
      return (priorities.get(typeof leftKind === 'string' ? leftKind : '') ?? 50) -
        (priorities.get(typeof rightKind === 'string' ? rightKind : '') ?? 50);
    })
    .flatMap((entry) => userFacingStringArray([entry]));
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function arrayField(value: unknown, key: string): unknown[] {
  const record = objectRecord(value);
  if (!record) {
    return [];
  }
  const entry = record[key];
  return Array.isArray(entry) ? entry : [];
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requireService<T>(service: T | undefined, domain: FluentVNextDomain | 'budgets'): asserts service is T {
  if (!service) {
    throw new Error(`Fluent vNext ${domain} read service is not available.`);
  }
}
