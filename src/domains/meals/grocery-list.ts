export const MEALS_GROCERY_LIST_WIDGET_VERSION = 'v71';
export const MEALS_GROCERY_SMOKE_WIDGET_VERSION = 'v1';
export const MEALS_GROCERY_LIST_LEGACY_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v57.html';
export const MEALS_GROCERY_LIST_COMPAT_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v58.html';
export const MEALS_GROCERY_LIST_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v59.html';
export const MEALS_GROCERY_LIST_LIVE_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v60.html';
export const MEALS_GROCERY_LIST_HYDRATION_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v61.html';
export const MEALS_GROCERY_LIST_MCP_APPS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v62.html';
export const MEALS_GROCERY_LIST_TRANSPORT_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v63.html';
export const MEALS_GROCERY_LIST_CHECKBOX_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v64.html';
export const MEALS_GROCERY_LIST_FALLBACK_WRITE_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v65.html';
export const MEALS_GROCERY_LIST_PUBLIC_ACTIONS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v66.html';
export const MEALS_GROCERY_LIST_DONE_SYNC_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v67.html';
export const MEALS_GROCERY_LIST_PANTRY_UNDO_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v68.html';
export const MEALS_GROCERY_LIST_STALE_SOURCE_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v69.html';
export const MEALS_GROCERY_LIST_BUCKET_ACTION_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-grocery-list-v70.html';
export const MEALS_GROCERY_LIST_TEMPLATE_URI = `ui://widget/fluent-grocery-list-${MEALS_GROCERY_LIST_WIDGET_VERSION}.html`;
export const MEALS_GROCERY_SMOKE_TEMPLATE_URI = `ui://widget/fluent-grocery-smoke-${MEALS_GROCERY_SMOKE_WIDGET_VERSION}.html`;

export interface GroceryListRecipeReferenceViewModel {
  recipeId: string;
  recipeName: string;
}

export interface GroceryListActionViewModel {
  id: 'already_have_enough' | 'mark_bought' | 'need_to_buy' | 'undo';
  label: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface GroceryListWidgetActionViewModel {
  id: GroceryListActionViewModel['id'];
  label: string;
}

export interface GroceryListManualIntentPatchViewModel {
  displayName: string;
  id: string;
  mealPlanId: string | null;
  metadata: unknown;
  notes: string | null;
  quantity: number | null;
  targetWindow: string | null;
  unit: string | null;
}

export interface GroceryListItemViewModel {
  itemKey: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  quantityDisplay: string | null;
  bucket: 'need_to_buy' | 'verify_pantry' | 'covered';
  brandHint: string | null;
  note: string | null;
  reason: string | null;
  provenanceLabel: string | null;
  isManual: boolean;
  manualIntentId: string | null;
  recipes: GroceryListRecipeReferenceViewModel[];
  actions: GroceryListActionViewModel[];
}

export interface GroceryListWidgetItemViewModel {
  itemKey: string;
  displayName: string;
  bucket: GroceryListItemViewModel['bucket'];
  quantityDisplay: string | null;
  note: string | null;
  reason: string | null;
  provenanceLabel: string | null;
  isManual: boolean;
  manualIntent: GroceryListManualIntentPatchViewModel | null;
  recipes: GroceryListRecipeReferenceViewModel[];
  actions: GroceryListWidgetActionViewModel[];
}

export interface GroceryListBucketViewModel {
  id: 'need_to_buy' | 'verify_pantry' | 'covered';
  label: string;
  count: number;
  items: GroceryListItemViewModel[];
}

export interface GroceryListWidgetBucketViewModel {
  id: GroceryListBucketViewModel['id'];
  label: string;
  count: number;
  items: GroceryListWidgetItemViewModel[];
}

export interface GroceryListSummaryViewModel {
  coveredCount: number;
  headline: string;
  needToBuyCount: number;
  verifyCount: number;
}

export interface GroceryListSourceViewModel {
  kind: string;
  label: string;
  status?: string | null;
  weekStart?: string | null;
}

export interface GroceryListViewModel {
  bucketOrder: Array<'need_to_buy' | 'verify_pantry' | 'covered'>;
  buckets: GroceryListBucketViewModel[];
  listId: string | null;
  objectRole: 'living_grocery_list';
  sourceProvenance: GroceryListSourceViewModel[];
  stale: boolean;
  staleReasons: string[];
  subtitle: string;
  summary: GroceryListSummaryViewModel;
  title: string;
  trustLabel: string | null;
  trustState: string | null;
  version: string | null;
  weekStart: string;
  weekRelation: string | null;
}

export interface GroceryListWidgetViewModel {
  bucketOrder: GroceryListViewModel['bucketOrder'];
  buckets: GroceryListWidgetBucketViewModel[];
  listId: string | null;
  objectRole: GroceryListViewModel['objectRole'];
  sourceProvenance: GroceryListSourceViewModel[];
  stale: boolean;
  staleReasons: string[];
  subtitle: string;
  summary: GroceryListSummaryViewModel;
  title: string;
  trustLabel: string | null;
  trustState: string | null;
  version: string | null;
  weekStart: string;
  weekRelation: string | null;
}

export interface GroceryListPublicItemViewModel {
  itemKey: string;
  displayName: string;
  detail: string | null;
  quantityDisplay: string | null;
  checked: boolean;
  syncAction?: GroceryListInteractiveSyncActionViewModel | null;
  syncActions?: GroceryListInteractiveSyncActionViewModel[];
}

export interface GroceryListInteractiveSyncActionViewModel {
  id?: GroceryListActionViewModel['id'];
  label?: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface GroceryListInteractiveItemViewModel extends GroceryListPublicItemViewModel {
  syncAction: GroceryListInteractiveSyncActionViewModel | null;
  syncActions?: GroceryListInteractiveSyncActionViewModel[];
}

export interface GroceryListPublicBucketViewModel {
  id: GroceryListBucketViewModel['id'] | GroceryListInteractiveBucketId;
  label: string;
  count: number;
  items: GroceryListPublicItemViewModel[];
}

export type GroceryListInteractiveBucketId = 'need_to_buy' | 'verify_quantity' | 'check_pantry' | 'covered';

export interface GroceryListInteractiveBucketViewModel {
  id: GroceryListInteractiveBucketId;
  label: string;
  count: number;
  items: GroceryListInteractiveItemViewModel[];
}

export interface GroceryListPublicViewModel {
  bucketOrder: Array<GroceryListBucketViewModel['id'] | GroceryListInteractiveBucketId>;
  buckets: GroceryListPublicBucketViewModel[];
  listId: string | null;
  objectRole: GroceryListViewModel['objectRole'];
  sourceProvenance: GroceryListSourceViewModel[];
  stale: boolean;
  staleReasons: string[];
  subtitle: string;
  summary: GroceryListSummaryViewModel;
  title: string;
  trustLabel: string | null;
  trustState: string | null;
  version: string | null;
  weekStart: string;
  weekRelation: string | null;
}

export interface GroceryListInteractiveViewModel {
  bucketOrder: GroceryListInteractiveBucketId[];
  buckets: GroceryListInteractiveBucketViewModel[];
  listId: string | null;
  objectRole: GroceryListViewModel['objectRole'];
  sourceProvenance: GroceryListSourceViewModel[];
  stale: boolean;
  staleReasons: string[];
  subtitle: string;
  summary: GroceryListSummaryViewModel & {
    checkPantryCount: number;
    verifyQuantityCount: number;
  };
  title: string;
  trustLabel: string | null;
  trustState: string | null;
  version: string | null;
  weekStart: string;
  weekRelation: string | null;
}

export function buildEmptyGroceryListViewModel(weekStart: string): GroceryListViewModel {
  return {
    bucketOrder: ['need_to_buy', 'verify_pantry', 'covered'],
    buckets: [
      { id: 'need_to_buy', label: 'To buy', count: 0, items: [] },
      { id: 'verify_pantry', label: 'Check at home', count: 0, items: [] },
      { id: 'covered', label: 'Done', count: 0, items: [] },
    ],
    listId: null,
    objectRole: 'living_grocery_list',
    sourceProvenance: [],
    stale: false,
    staleReasons: [],
    subtitle: `Current list · nothing left to buy or check for ${weekStart}.`,
    summary: {
      coveredCount: 0,
      headline: '0 items left to buy',
      needToBuyCount: 0,
      verifyCount: 0,
    },
    title: 'Grocery list',
    trustLabel: 'Ready to shop',
    trustState: 'ready_to_shop',
    version: null,
    weekStart,
    weekRelation: null,
  };
}

function buildGroceryListWidgetViewModel(viewModel: GroceryListViewModel): GroceryListWidgetViewModel {
  return {
    bucketOrder: viewModel.bucketOrder,
    buckets: viewModel.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      count: bucket.count,
      items: bucket.items.map((item) => ({
        actions: item.actions.map((action) => ({
          id: action.id,
          label: action.label,
        })),
        bucket: item.bucket,
        displayName: item.displayName,
        isManual: item.isManual,
        itemKey: item.itemKey,
        manualIntent:
          item.isManual && item.manualIntentId
            ? {
                displayName: item.displayName,
                id: item.manualIntentId,
                mealPlanId: typeof item.actions[0]?.args?.meal_plan_id === 'string' ? (item.actions[0].args.meal_plan_id as string) : null,
                metadata: Object.prototype.hasOwnProperty.call(item.actions[0]?.args ?? {}, 'metadata')
                  ? item.actions[0]?.args?.metadata
                  : null,
                notes: typeof item.actions[0]?.args?.notes === 'string' ? (item.actions[0].args.notes as string) : null,
                quantity: typeof item.actions[0]?.args?.quantity === 'number' ? (item.actions[0].args.quantity as number) : null,
                targetWindow:
                  typeof item.actions[0]?.args?.target_window === 'string'
                    ? (item.actions[0].args.target_window as string)
                    : null,
                unit: typeof item.actions[0]?.args?.unit === 'string' ? (item.actions[0].args.unit as string) : null,
              }
            : null,
        note: item.note,
        provenanceLabel: item.provenanceLabel,
        quantityDisplay: item.quantityDisplay,
        reason: item.reason,
        recipes: item.recipes,
      })),
    })),
    listId: viewModel.listId,
    objectRole: viewModel.objectRole,
    sourceProvenance: viewModel.sourceProvenance,
    stale: viewModel.stale,
    staleReasons: viewModel.staleReasons,
    subtitle: viewModel.subtitle,
    summary: viewModel.summary,
    title: viewModel.title,
    trustLabel: viewModel.trustLabel,
    trustState: viewModel.trustState,
    version: viewModel.version,
    weekStart: viewModel.weekStart,
    weekRelation: viewModel.weekRelation,
  };
}

function buildGroceryListPublicViewModel(viewModel: GroceryListViewModel): GroceryListPublicViewModel {
  return buildGroceryListInteractiveViewModel(viewModel);
}

function buildPrimarySyncAction(item: GroceryListItemViewModel, bucketId: GroceryListBucketViewModel['id']): GroceryListInteractiveSyncActionViewModel | null {
  const action =
    bucketId === 'covered'
      ? item.actions.find((candidate) => candidate.id === 'undo') ?? null
      : item.actions.find((candidate) => candidate.id !== 'undo') ?? null;
  if (!action) {
    return null;
  }

  return {
    args: action.args,
    id: action.id,
    label: action.label,
    toolName: action.toolName,
  };
}

function buildSyncActions(item: GroceryListItemViewModel, bucketId: GroceryListBucketViewModel['id']): GroceryListInteractiveSyncActionViewModel[] {
  return item.actions
    .filter((candidate) => (bucketId === 'covered' ? candidate.id === 'undo' : candidate.id !== 'undo'))
    .map((action) => ({
      args: action.args,
      id: action.id,
      label: action.label,
      toolName: action.toolName,
    }));
}

function buildGroceryListInteractiveViewModel(viewModel: GroceryListViewModel): GroceryListInteractiveViewModel {
  const groupedItems: Record<GroceryListInteractiveBucketId, GroceryListInteractiveItemViewModel[]> = {
    check_pantry: [],
    covered: [],
    need_to_buy: [],
    verify_quantity: [],
  };

  for (const bucketId of viewModel.bucketOrder) {
    const bucket = viewModel.buckets.find((entry) => entry.id === bucketId);
    if (!bucket) {
      continue;
    }

    for (const item of bucket.items) {
      const interactiveBucketId = item.bucket === 'covered' ? 'covered' : resolveInteractiveBucketId(item);
      groupedItems[interactiveBucketId].push({
        checked: item.bucket === 'covered',
        detail: deriveItemDetail(item, interactiveBucketId),
        displayName: item.displayName,
        itemKey: item.itemKey,
        quantityDisplay: item.quantityDisplay,
        syncAction: buildPrimarySyncAction(item, bucket.id),
        syncActions: buildSyncActions(item, bucket.id),
      });
    }
  }

  const buckets: GroceryListInteractiveBucketViewModel[] = [
    {
      id: 'need_to_buy',
      label: 'To buy',
      count: groupedItems.need_to_buy.length,
      items: groupedItems.need_to_buy,
    },
    {
      id: 'verify_quantity',
      label: 'Check amount',
      count: groupedItems.verify_quantity.length,
      items: groupedItems.verify_quantity,
    },
    {
      id: 'check_pantry',
      label: 'Check at home',
      count: groupedItems.check_pantry.length,
      items: groupedItems.check_pantry,
    },
    {
      id: 'covered',
      label: 'Done',
      count: groupedItems.covered.length,
      items: groupedItems.covered,
    },
  ];

  return {
    bucketOrder: ['need_to_buy', 'verify_quantity', 'check_pantry', 'covered'],
    buckets,
    listId: viewModel.listId,
    objectRole: viewModel.objectRole,
    sourceProvenance: viewModel.sourceProvenance,
    stale: viewModel.stale,
    staleReasons: viewModel.staleReasons,
    subtitle: viewModel.subtitle,
    summary: {
      ...viewModel.summary,
      checkPantryCount: groupedItems.check_pantry.length,
      verifyQuantityCount: groupedItems.verify_quantity.length,
    },
    title: viewModel.title,
    trustLabel: viewModel.trustLabel,
    trustState: viewModel.trustState,
    version: viewModel.version,
    weekStart: viewModel.weekStart,
    weekRelation: viewModel.weekRelation,
  };
}

function resolveInteractiveBucketId(item: GroceryListItemViewModel): GroceryListInteractiveBucketId {
  if (
    item.reason?.includes('inventory_quantity_unknown') ||
    item.reason?.includes('inventory_unit_mismatch') ||
    item.note?.toLowerCase().includes('quantity is unknown') ||
    item.note?.toLowerCase().includes('unit ') ||
    item.note?.toLowerCase().includes('qty unknown')
  ) {
    return 'verify_quantity';
  }
  return item.bucket === 'need_to_buy' ? 'need_to_buy' : 'check_pantry';
}

function deriveItemDetail(item: GroceryListItemViewModel, interactiveBucketId: GroceryListInteractiveBucketId): string | null {
  if (interactiveBucketId === 'check_pantry') {
    return derivePantryDetail(item);
  }

  const segments: string[] = [];
  const recipeContext = deriveRecipeContext(item);
  if (recipeContext) {
    segments.push(recipeContext);
  }

  if (item.brandHint && interactiveBucketId === 'need_to_buy') {
    segments.push(item.brandHint);
  }

  const quantityHint = deriveQuantityHint(item);
  if (quantityHint && interactiveBucketId === 'verify_quantity') {
    segments.push(quantityHint);
  }

  const coveredHint = deriveCoveredHint(item);
  if (coveredHint && interactiveBucketId === 'covered') {
    segments.push(coveredHint);
  }

  if (segments.length > 0) {
    return segments.join(' · ');
  }

  return deriveUsefulFallbackDetail(item);
}

function compactRecipeName(recipeName: string | null): string | null {
  if (!recipeName) {
    return null;
  }

  let compact = recipeName.trim();
  compact = compact.replace(/^Meal-Prep\s+/i, '');
  compact = compact.replace(/^Vanilla Greek Yogurt /i, 'Yogurt ');

  const withIndex = compact.toLowerCase().indexOf(' with ');
  if (withIndex >= 0) {
    compact = compact.slice(0, withIndex).trim();
  }

  return compact || null;
}

function deriveQuantityHint(item: GroceryListItemViewModel): string | null {
  return null;
}

function deriveRecipeContext(item: GroceryListItemViewModel): string | null {
  const recipeNames = item.recipes
    .map((recipe) => compactRecipeName(recipe.recipeName))
    .filter((recipeName): recipeName is string => Boolean(recipeName));

  if (recipeNames.length > 1) {
    return `across ${recipeNames.length} meals`;
  }

  return recipeNames[0] ?? null;
}

function derivePantryDetail(item: GroceryListItemViewModel): string | null {
  const candidates = [item.note, item.reason, item.provenanceLabel];
  for (const candidate of candidates) {
    const sanitized = sanitizePantryDetail(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  return null;
}

function deriveUsefulFallbackDetail(item: GroceryListItemViewModel): string | null {
  const candidates = [item.note, item.reason, item.provenanceLabel];
  for (const candidate of candidates) {
    const sanitized = sanitizeGenericDetail(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  return null;
}

function sanitizePantryDetail(value: string | null | undefined): string | null {
  const normalized = sanitizeGenericDetail(value);
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (
    lower === 'pantry quantity still needs confirmation.' ||
    lower === 'pantry stock still needs confirmation before ordering.' ||
    lower === 'marked as a pantry item, so verify what is on hand before adding it to the cart.'
  ) {
    return null;
  }

  return normalized;
}

function sanitizeGenericDetail(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (
    normalized.toLowerCase() === 'pantry quantity still needs confirmation.' ||
    normalized.toLowerCase() === 'marked as a pantry item, so verify what is on hand before adding it to the cart.' ||
    normalized.toLowerCase() === 'inventory quantity is unknown; plan recommends buying the full amount.'
  ) {
    return null;
  }

  return normalized;
}

function deriveCoveredHint(item: GroceryListItemViewModel): string | null {
  if (item.reason === 'Confirmed as enough on hand.') {
    return 'Already have enough';
  }

  if (item.reason === 'Marked as already covered.') {
    return 'Already handled';
  }

  return item.reason ?? null;
}

export function buildGroceryListStructuredContent(viewModel: GroceryListViewModel) {
  const publicViewModel = buildGroceryListPublicViewModel(viewModel);
  return {
    experience: 'grocery_list',
    groceryList: publicViewModel,
    listId: publicViewModel.listId,
    objectRole: publicViewModel.objectRole,
    sourceProvenance: publicViewModel.sourceProvenance,
    stale: publicViewModel.stale,
    staleReasons: publicViewModel.staleReasons,
    subtitle: publicViewModel.subtitle,
    summary: publicViewModel.summary,
    title: publicViewModel.title,
    trustLabel: publicViewModel.trustLabel,
    trustState: publicViewModel.trustState,
    version: publicViewModel.version,
    weekStart: publicViewModel.weekStart,
    weekRelation: publicViewModel.weekRelation,
  };
}

export function buildGroceryListMetadata(viewModel: GroceryListViewModel) {
  return {
    experience: 'grocery_list',
    groceryList: buildGroceryListInteractiveViewModel(viewModel),
    version: MEALS_GROCERY_LIST_WIDGET_VERSION,
  };
}

export function getGroceryListWidgetHtml(): string {
  return `
<div id="grocery-list-root"></div>
<style>
  :root {
    color-scheme: light;
    --grocery-card-bg: #ffffff;
    --grocery-card-border: rgba(0, 0, 0, 0.08);
    --grocery-surface-alt: #f7f7f8;
    --grocery-panel-bg: #ffffff;
    --grocery-panel-border: rgba(0, 0, 0, 0.08);
    --grocery-row-border: rgba(0, 0, 0, 0.08);
    --grocery-text: #0d0d0d;
    --grocery-text-muted: #3c3c43;
    --grocery-text-soft: #6e6e73;
    --grocery-button-bg: #ffffff;
    --grocery-button-border: rgba(0, 0, 0, 0.08);
    --grocery-accent: #2f6feb;
    --grocery-accent-dim: rgba(47, 111, 235, 0.1);
    --grocery-warn-bg: #fff7e6;
    --grocery-warn-line: rgba(217, 119, 6, 0.18);
    --grocery-warn-ink: #78400a;
    --grocery-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 10px 28px rgba(0, 0, 0, 0.04);
    --grocery-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: var(--grocery-font-sans);
    background: transparent;
    color: var(--grocery-text);
  }

  .grocery-card {
    margin: 0;
    padding: 18px 20px;
    border: 1px solid var(--grocery-card-border);
    border-radius: 16px;
    background: var(--grocery-card-bg);
    box-shadow: var(--grocery-shadow);
  }

  .grocery-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .grocery-header {
    display: grid;
    gap: 10px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--grocery-row-border);
    margin-bottom: 14px;
  }

  .grocery-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .grocery-header-copy {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .grocery-header-controls {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .grocery-kicker {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.08em;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--grocery-text-soft);
  }

  .grocery-headline {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }

  .grocery-subtitle {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--grocery-text-muted);
  }

  .grocery-covered-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--grocery-text-soft);
  }

  .grocery-progress {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-width: 152px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--grocery-surface-alt);
    align-self: start;
  }

  .grocery-progress-track {
    position: relative;
    flex: 1 1 auto;
    height: 6px;
    border-radius: 999px;
    background: rgba(47, 111, 235, 0.10);
    overflow: hidden;
  }

  .grocery-progress-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: var(--grocery-accent);
  }

  .grocery-progress-label {
    font-size: 12px;
    line-height: 1.2;
    font-weight: 600;
    color: var(--grocery-text-soft);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .grocery-covered-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
    padding: 6px 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }

  .grocery-covered-toggle-copy {
    font-size: 12px;
    font-weight: 500;
    color: var(--grocery-accent);
    white-space: nowrap;
  }

  .grocery-aisles {
    display: grid;
    gap: 12px;
  }

  .grocery-aisle {
    display: grid;
    grid-template-columns: 108px minmax(0, 1fr);
    gap: 14px;
    padding: 12px 0;
    border-top: 1px solid var(--grocery-row-border);
  }

  .grocery-aisle:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .grocery-aisle-label {
    display: grid;
    gap: 4px;
    align-content: start;
  }

  .grocery-aisle-name {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
  }

  .grocery-aisle-meta {
    font-size: 12px;
    line-height: 1.3;
    color: var(--grocery-text-soft);
  }

  .grocery-aisle-body {
    min-width: 0;
  }

  .grocery-verify-block,
  .grocery-section {
    border: 1px solid var(--grocery-panel-border);
    border-radius: 16px;
    background: var(--grocery-panel-bg);
  }

  .grocery-section,
  .grocery-verify-block {
    margin-top: 16px;
    padding: 14px 16px;
  }

  .grocery-verify-block {
    background: var(--grocery-warn-bg);
    border-color: var(--grocery-warn-line);
  }

  .grocery-verify-head,
  .grocery-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .grocery-verify-title,
  .grocery-section-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
  }

  .grocery-verify-title {
    color: var(--grocery-warn-ink);
  }

  .grocery-verify-title::before {
    content: "⚠";
    margin-right: 8px;
    font-size: 12px;
    vertical-align: 1px;
  }

  .grocery-verify-count,
  .grocery-section-count {
    font-size: 12px;
    color: var(--grocery-text-soft);
    white-space: nowrap;
  }

  .grocery-verify-count {
    color: rgba(120, 64, 10, 0.82);
  }

  .grocery-section-copy {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--grocery-text-soft);
  }

  .grocery-verify-rows {
    display: grid;
  }

  .grocery-verify-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid var(--grocery-warn-line);
  }

  .grocery-verify-row:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .grocery-verify-copy {
    font-size: 14px;
    line-height: 1.45;
    color: var(--grocery-text-muted);
  }

  .grocery-verify-copy strong {
    color: var(--grocery-text);
    font-weight: 600;
    text-transform: capitalize;
  }

  .grocery-verify-actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .grocery-verify-button {
    appearance: none;
    border: 1px solid rgba(217, 119, 6, 0.25);
    border-radius: 6px;
    background: #ffffff;
    color: var(--grocery-warn-ink);
    padding: 4px 10px;
    font: inherit;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 500;
    cursor: pointer;
  }

  .grocery-verify-button[data-active="true"] {
    background: var(--grocery-warn);
    border-color: var(--grocery-warn);
    color: #ffffff;
    box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.18);
    font-weight: 700;
  }

  .grocery-verify-button:hover {
    border-color: rgba(217, 119, 6, 0.45);
  }

  .grocery-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0;
  }

  .grocery-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    padding: 9px 0;
    border-top: 1px solid var(--grocery-row-border);
  }

  .grocery-item:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .grocery-verify-block .grocery-item {
    border-top-color: var(--grocery-warn-line);
  }

  .grocery-item-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 32px;
    margin: -5px 0;
  }

  .grocery-item-toggle input {
    width: 24px;
    height: 24px;
    margin: 0;
    accent-color: var(--grocery-accent);
  }

  .grocery-item-toggle--covered {
    color: var(--grocery-text-soft);
  }

  .grocery-item-main {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .grocery-item-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
    text-transform: capitalize;
  }

  .grocery-item-name--checked {
    text-decoration: line-through;
    color: var(--grocery-text-soft);
  }

  .grocery-item-detail {
    font-size: 12px;
    line-height: 1.4;
    color: var(--grocery-text-muted);
  }

  .grocery-item-qty {
    font-size: 12px;
    line-height: 1.4;
    white-space: nowrap;
    color: var(--grocery-text-soft);
    font-variant-numeric: tabular-nums;
  }

  .grocery-empty {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--grocery-text-muted);
  }

  .grocery-sync-bar {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--grocery-row-border);
  }

  .grocery-sync-copy {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--grocery-text-muted);
  }

  .grocery-sync-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .grocery-sync-button-add,
  .grocery-sync-button,
  .grocery-sync-refresh,
  .grocery-sync-reset {
    appearance: none;
    border: 1px solid var(--grocery-button-border);
    border-radius: 10px;
    background: var(--grocery-button-bg);
    color: var(--grocery-text);
    padding: 8px 14px;
    font: inherit;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 500;
    cursor: pointer;
    transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
  }

  .grocery-sync-button-add::before {
    content: "+";
    margin-right: 6px;
    font-weight: 500;
  }

  .grocery-add-form {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .grocery-add-input {
    min-width: min(260px, 100%);
    flex: 1 1 240px;
    border: 1px solid var(--grocery-button-border);
    border-radius: 10px;
    background: #fff;
    color: var(--grocery-text);
    padding: 8px 12px;
    font: inherit;
    font-size: 13px;
    line-height: 1.2;
  }

  .grocery-add-input::placeholder {
    color: var(--grocery-text-soft);
  }

  .grocery-add-submit,
  .grocery-add-cancel {
    appearance: none;
    border-radius: 10px;
    padding: 8px 14px;
    font: inherit;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 500;
    cursor: pointer;
  }

  .grocery-add-submit {
    border: 0;
    background: var(--grocery-accent);
    color: #fff;
  }

  .grocery-add-cancel {
    border: 1px solid var(--grocery-button-border);
    background: #fff;
    color: var(--grocery-text);
  }

  .grocery-sync-button-add:not([disabled]):hover,
  .grocery-sync-button:not([disabled]):hover,
  .grocery-sync-refresh:not([disabled]):hover,
  .grocery-sync-reset:not([disabled]):hover {
    border-color: var(--grocery-accent);
    transform: translateY(-1px);
  }

  .grocery-sync-button {
    background: var(--grocery-accent);
    color: #fff;
    border-color: rgba(47, 111, 235, 0.22);
    font-weight: 500;
  }

  .grocery-sync-reset {
    background: #fff;
    color: var(--grocery-text-muted);
  }

  .grocery-sync-refresh {
    background: #fff;
    color: var(--grocery-text-muted);
  }

  .grocery-sync-button-add[disabled],
  .grocery-sync-button[disabled],
  .grocery-sync-refresh[disabled],
  .grocery-sync-reset[disabled] {
    cursor: default;
    opacity: 0.55;
  }

  .grocery-sync-error {
    margin: 10px 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: #b42318;
  }

  .grocery-sync-sent {
    margin: 10px 0 0;
    font-size: 13px;
    line-height: 1.5;
    opacity: 0.8;
  }

  @media (max-width: 640px) {
    .grocery-header-top {
      flex-direction: column;
    }

    .grocery-progress {
      width: 100%;
    }

    .grocery-header-controls {
      width: 100%;
      justify-content: flex-end;
    }

    .grocery-aisle {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .grocery-verify-head,
    .grocery-section-head {
      align-items: flex-start;
    }

    .grocery-verify-row {
      grid-template-columns: 1fr;
    }

    .grocery-verify-actions {
      justify-content: flex-start;
    }

    .grocery-verify-head,
    .grocery-section-head {
      flex-direction: column;
    }
  }
</style>
  <script>
  (function () {
    var root = document.getElementById('grocery-list-root');
    var stagedSelections = Object.create(null);
    var addItemExpanded = false;
    var addItemDraft = '';
    var coveredExpanded = false;
    var hostHydratedViewModel = null;
    var locallySavedActions = Object.create(null);
    var locallyAddedItems = Object.create(null);
    var syncError = '';
    var syncSent = false;
    var syncPending = false;

    function getOpenAI() {
      return window.openai || {};
    }

    function notifyHeight() {
      if (getOpenAI().notifyIntrinsicHeight) {
        getOpenAI().notifyIntrinsicHeight(document.body.scrollHeight);
      }
      bridgeNotify('ui/notifications/size-changed', {
        height: document.body.scrollHeight,
        width: document.body.scrollWidth,
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function findGroceryList(candidate) {
      if (!candidate || typeof candidate !== 'object') {
        return null;
      }
      if (candidate.groceryList) {
        return candidate.groceryList;
      }
      if (candidate.structuredContent && candidate.structuredContent.groceryList) {
        return candidate.structuredContent.groceryList;
      }
      if (candidate.toolOutput && candidate.toolOutput.groceryList) {
        return candidate.toolOutput.groceryList;
      }
      if (candidate.toolResponseMetadata && candidate.toolResponseMetadata.groceryList) {
        return candidate.toolResponseMetadata.groceryList;
      }
      if (candidate._meta && candidate._meta.groceryList) {
        return candidate._meta.groceryList;
      }
      if (candidate.experience === 'grocery_list') {
        return candidate;
      }
      var keys = ['structuredContent', 'output', 'result', 'data', 'value', 'params'];
      for (var index = 0; index < keys.length; index += 1) {
        if (candidate[keys[index]]) {
          var nested = findGroceryList(candidate[keys[index]]);
          if (nested) {
            return nested;
          }
        }
      }
      return null;
    }

    function normalizeBucketId(bucketId) {
      return bucketId === 'verify_pantry' ? 'check_pantry' : bucketId;
    }

    function cloneSyncAction(action) {
      if (!action || typeof action !== 'object') {
        return null;
      }
      return {
        args: action.args || {},
        id: action.id || undefined,
        label: action.label || undefined,
        toolName: action.toolName,
      };
    }

    function buildFallbackSyncActions(item, bucketId, weekStart) {
      if (!item || !item.itemKey || !weekStart) {
        return [];
      }

      if (bucketId === 'need_to_buy' || bucketId === 'verify_quantity') {
        return [{
          args: {
            action_status: 'purchased',
            item_key: item.itemKey,
            week_start: weekStart,
          },
          id: 'mark_bought',
          label: 'Mark bought',
          toolName: 'meals_upsert_grocery_plan_action',
        }];
      }

      if (bucketId === 'check_pantry') {
        return [
          {
            args: {
              action_status: 'have_enough',
              item_key: item.itemKey,
              week_start: weekStart,
            },
            id: 'already_have_enough',
            label: 'Already have enough',
            toolName: 'meals_upsert_grocery_plan_action',
          },
          {
            args: {
              action_status: 'dont_have_it',
              item_key: item.itemKey,
              week_start: weekStart,
            },
            id: 'need_to_buy',
            label: 'Add to buy list',
            toolName: 'meals_upsert_grocery_plan_action',
          },
        ];
      }

      if (bucketId === 'covered') {
        return [{
          args: {
            item_key: item.itemKey,
            week_start: weekStart,
          },
          id: 'undo',
          label: 'Undo',
          toolName: 'meals_delete_grocery_plan_action',
        }];
      }

      return [];
    }

    function normalizeGroceryListForWidget(groceryList) {
      if (!groceryList || typeof groceryList !== 'object') {
        return groceryList;
      }

      var weekStart = groceryList.weekStart || groceryList.week_start || '';
      var buckets = Array.isArray(groceryList.buckets) ? groceryList.buckets.map(function (bucket) {
        var bucketId = normalizeBucketId(bucket.id);
        var items = Array.isArray(bucket.items) ? bucket.items.map(function (item) {
          var syncActions = Array.isArray(item.syncActions)
            ? item.syncActions.map(cloneSyncAction).filter(Boolean)
            : [];
          var syncAction = cloneSyncAction(item.syncAction) || syncActions[0] || null;
          var fallbackActions = buildFallbackSyncActions(item, bucketId, weekStart);
          var primaryActionId = bucketId === 'covered'
            ? 'undo'
            : bucketId === 'check_pantry'
              ? 'already_have_enough'
              : 'mark_bought';
          var primaryAction = syncActions.find(function (action) { return action.id === primaryActionId; })
            || (syncAction && syncAction.id === primaryActionId ? syncAction : null)
            || fallbackActions.find(function (action) { return action.id === primaryActionId; })
            || null;
          var nextSyncActions = syncActions.length ? syncActions.slice() : [];
          fallbackActions.forEach(function (fallbackAction) {
            if (!nextSyncActions.some(function (action) { return action.id === fallbackAction.id; })) {
              nextSyncActions.push(fallbackAction);
            }
          });
          var nextSyncAction = primaryAction || syncAction || nextSyncActions[0] || null;

          return Object.assign({}, item, {
            checked: bucketId === 'covered' ? true : Boolean(item.checked),
            syncAction: nextSyncAction,
            syncActions: nextSyncActions,
          });
        }) : [];

        return Object.assign({}, bucket, {
          id: bucketId,
          items: items,
        });
      }) : [];

      var normalizedOrder = Array.isArray(groceryList.bucketOrder)
        ? groceryList.bucketOrder.map(normalizeBucketId)
        : ['need_to_buy', 'verify_quantity', 'check_pantry', 'covered'];
      ['need_to_buy', 'verify_quantity', 'check_pantry', 'covered'].forEach(function (bucketId) {
        if (buckets.some(function (bucket) { return bucket.id === bucketId; }) && normalizedOrder.indexOf(bucketId) < 0) {
          normalizedOrder.push(bucketId);
        }
      });

      return Object.assign({}, groceryList, {
        bucketOrder: normalizedOrder,
        buckets: buckets,
      });
    }

    function hydrateFromCandidate(candidate) {
      var groceryList = findGroceryList(candidate);
      if (!groceryList) {
        return false;
      }
      hostHydratedViewModel = applyLocalGroceryListEdits(normalizeGroceryListForWidget(groceryList));
      return true;
    }

    function publishViewModel(nextViewModel, options) {
      reconcileLocalEditsWithHost(normalizeGroceryListForWidget(nextViewModel), Boolean(options && options.clearMissingLocalEdits));
      var normalized = applyLocalGroceryListEdits(normalizeGroceryListForWidget(nextViewModel));
      hostHydratedViewModel = normalized;

      var openai = getOpenAI();
      if (openai && typeof openai === 'object') {
        openai.toolResponseMetadata = {
          experience: 'grocery_list',
          groceryList: normalized,
          version: '${MEALS_GROCERY_LIST_WIDGET_VERSION}',
        };
        openai.toolOutput = {
          experience: 'grocery_list',
          groceryList: normalized,
          summary: normalized.summary,
          title: normalized.title,
          weekStart: normalized.weekStart,
        };
      }

      return normalized;
    }

    function getViewModel() {
      var openai = getOpenAI();
      var candidates = [
        openai.toolResponseMetadata,
        openai.toolOutput,
        openai.structuredContent,
        openai.params,
        openai.requestParams,
        openai.modalParams,
        openai,
      ];
      for (var index = 0; index < candidates.length; index += 1) {
        var groceryList = findGroceryList(candidates[index]);
        if (groceryList) {
          return applyLocalGroceryListEdits(normalizeGroceryListForWidget(groceryList));
        }
      }
      return hostHydratedViewModel;
    }

    function toDisplayName(label) {
      return String(label || '').replace(/\b([a-z])/g, function (_, chr) {
        return chr.toUpperCase();
      });
    }

    function formatWeekStart(weekStart) {
      if (!weekStart) {
        return '';
      }

      var raw = String(weekStart).trim();
      var parts = raw.split('-');
      if (parts.length !== 3) {
        return raw;
      }

      var year = Number(parts[0]);
      var monthIndex = Number(parts[1]) - 1;
      var day = Number(parts[2]);
      if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
        return raw;
      }

      var date = new Date(year, monthIndex, day);
      var monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];

      try {
        return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date);
      } catch (error) {
        return (monthNames[monthIndex] || raw) + ' ' + day;
      }
    }

    function formatQuantityDisplay(quantityDisplay) {
      return quantityDisplay || '';
    }

    function itemIsChecked(item) {
      var hasSelection = Boolean(stagedSelections[item.itemKey]);
      if (item.checked) {
        return !hasSelection;
      }
      return hasSelection;
    }

    function renderEmpty() {
      root.innerHTML = [
        '<article class="grocery-card">',
        '<p class="grocery-kicker">Grocery list</p>',
        '<h1 class="grocery-headline">Grocery widget · ${MEALS_GROCERY_LIST_WIDGET_VERSION}</h1>',
        '<p class="grocery-empty">Waiting for grocery data…</p>',
        '</article>',
      ].join('');
      notifyHeight();
    }

    function getSelectedAction(item) {
      var selectedId = stagedSelections[item.itemKey];
      if (!selectedId) {
        return null;
      }

      if (item.syncActions && item.syncActions.length) {
        var matchedAction = item.syncActions.find(function (action) {
          return action.id === selectedId;
        });
        if (matchedAction) {
          return matchedAction;
        }
      }

      if (item.syncAction && (item.syncAction.id === selectedId || selectedId === '__primary__')) {
        return item.syncAction;
      }

      return item.syncAction || null;
    }

    function getStagedItems(viewModel) {
      var staged = [];
      (viewModel.bucketOrder || []).forEach(function (bucketId) {
        var bucket = (viewModel.buckets || []).find(function (entry) { return entry.id === bucketId; });
          if (!bucket || !bucket.items) {
            return;
          }
          bucket.items.forEach(function (item) {
            var selectedAction = getSelectedAction(item);
            if (selectedAction) {
              staged.push({
                action: selectedAction,
                item: item,
                previousBucketId: item.previousBucketId,
                sourceBucketId: bucket.id,
              });
            }
          });
        });
        return staged;
      }

    function toggleItem(itemKey) {
      if (syncPending) {
        return;
      }
      if (stagedSelections[itemKey]) {
        delete stagedSelections[itemKey];
      } else {
        stagedSelections[itemKey] = '__primary__';
      }
      syncError = '';
      syncSent = false;
      render();
    }

    function selectItemAction(itemKey, actionId) {
      if (syncPending) {
        return;
      }
      if (stagedSelections[itemKey] === actionId) {
        delete stagedSelections[itemKey];
      } else {
        stagedSelections[itemKey] = actionId;
      }
      syncError = '';
      syncSent = false;
      render();
    }

    function resetStaged() {
      if (syncPending) {
        return;
      }
      stagedSelections = Object.create(null);
      syncError = '';
      syncSent = false;
      render();
    }

    function toggleAddItem() {
      if (syncPending) {
        return;
      }
      addItemExpanded = !addItemExpanded;
      if (!addItemExpanded) {
        addItemDraft = '';
      }
      syncError = '';
      syncSent = false;
      render();
    }

    function updateAddItemDraft(value) {
      addItemDraft = value || '';
    }

    async function addManualItem(viewModel) {
      if (syncPending) {
        return;
      }

      var callTool = getCallTool();
      if (!callTool) {
        syncError = 'This host cannot add a grocery item from the widget yet.';
        render();
        return;
      }

      var itemName = addItemDraft.trim();
      if (!itemName) {
        syncError = 'Enter an item name to add it to your grocery list.';
        syncSent = false;
        render();
        return;
      }

      syncError = '';
      syncPending = true;
      syncSent = false;
      render();

      try {
        var addArgs = {
          display_name: itemName,
          status: 'pending',
          target_window: viewModel.weekStart,
        };
        var addedResult = await callTool('meals_upsert_grocery_intent', addArgs);
        var addedRecord = findToolRecord(addedResult);

        var localItemKey = normalizeManualItemKey(itemName);
        var localAddAction = {
          args: {
            display_name: itemName,
            id: addedRecord && addedRecord.id ? addedRecord.id : undefined,
            status: 'completed',
            target_window: viewModel.weekStart,
          },
          id: 'mark_bought',
          label: 'Mark bought',
          toolName: 'meals_upsert_grocery_intent',
        };
        locallyAddedItems[localItemKey] = {
          checked: false,
          detail: 'Added manually',
          displayName: itemName,
          itemKey: localItemKey,
          quantityDisplay: null,
          syncAction: localAddAction,
          syncActions: [localAddAction],
        };

        addItemExpanded = false;
        addItemDraft = '';
        syncSent = true;
        publishViewModel(viewModel);
        render();

        var refreshed = await callTool('meals_render_grocery_list_v2', { week_start: viewModel.weekStart });
        applyRenderResult(refreshed);
      } catch (error) {
        syncPending = false;
        syncSent = false;
        syncError = 'Unable to add that grocery item right now. Refresh the list before trying again.';
        render();
      }
    }

    function toggleCovered() {
      coveredExpanded = !coveredExpanded;
      render();
    }

    var bridgeRpcId = 0;
    var bridgeReady = null;
    var bridgePending = Object.create(null);
    var bridgeInitialized = false;

    function getBridgeTarget() {
      if (window.parent && window.parent !== window) {
        return window.parent;
      }
      try {
        if (window.top && window.top !== window) {
          return window.top;
        }
      } catch (error) {}
      return null;
    }

    function isBridgeSource(source) {
      return source === getBridgeTarget();
    }

    window.addEventListener('message', function (event) {
      if (!isBridgeSource(event.source)) return;
      var message = event.data;
      if (!message || message.jsonrpc !== '2.0') return;
      if (message.method === 'ui/initialize' && message.id != null) {
        hydrateFromCandidate(message);
        event.source.postMessage({
          jsonrpc: '2.0',
          id: message.id,
          result: { appCapabilities: {}, protocolVersion: '2026-01-26' },
        }, '*');
        bridgeInitialized = true;
        bridgeNotify('ui/notifications/initialized', {});
        render();
        return;
      }
      if (
        message.method === 'ui/notifications/tool-result'
        || message.method === 'ui/notifications/tool-input'
        || message.method === 'ui/notifications/tool-input-partial'
      ) {
        if (hydrateFromCandidate(message)) {
          render();
        }
        return;
      }
      if (typeof message.id !== 'number') return;
      var pending = bridgePending[message.id];
      if (!pending) return;
      delete bridgePending[message.id];
      window.clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(message.error);
        return;
      }
      pending.resolve(message.result);
    }, { passive: true });

    function bridgeRequest(method, params, timeoutMs) {
      return new Promise(function (resolve, reject) {
        var target = getBridgeTarget();
        if (!target) {
          reject(new Error('MCP Apps bridge is not available.'));
          return;
        }
        var id = ++bridgeRpcId;
        bridgePending[id] = {
          resolve: resolve,
          reject: reject,
          timer: window.setTimeout(function () {
            delete bridgePending[id];
            reject(new Error('MCP Apps bridge request timed out.'));
          }, timeoutMs || 12000),
        };
        var message = { jsonrpc: '2.0', id: id, method: method, params: params };
        target.postMessage(message, '*');
      });
    }

    function bridgeNotify(method, params) {
      if (method !== 'ui/notifications/initialized' && !bridgeInitialized) {
        return;
      }
      var target = getBridgeTarget();
      if (!target) {
        return;
      }
      target.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
    }

    function connectMcpAppsHost() {
      if (bridgeReady) {
        return bridgeReady;
      }

      if (!getBridgeTarget()) {
        bridgeReady = Promise.resolve(null);
        return bridgeReady;
      }

      bridgeReady = bridgeRequest('ui/initialize', {
        appInfo: {
          name: 'Fluent Grocery List',
          version: '${MEALS_GROCERY_LIST_WIDGET_VERSION}',
        },
        appCapabilities: {},
        protocolVersion: '2026-01-26',
      }, 6000)
        .then(function (result) {
          bridgeInitialized = true;
          bridgeNotify('ui/notifications/initialized', {});
          render();
          return result;
        })
        .catch(function () {
          return null;
        });

      return bridgeReady;
    }

    function callToolViaBridge(name, args) {
      return bridgeRequest('tools/call', { name: name, arguments: args || {} }, 20000);
    }

    function getCallTool() {
      var openai = getOpenAI();
      var compatibilityCall = typeof openai.callTool === 'function' ? openai.callTool.bind(openai) : null;
      return compatibilityCall || (getBridgeTarget() ? callToolViaBridge : null);
    }

    function applyRenderResult(result, options) {
      var nextViewModel = findGroceryList(result);

      if (!nextViewModel) {
        syncSent = true;
        syncPending = false;
        syncError = 'Saved locally. Refresh did not return a new grocery list yet.';
        render();
        return;
      }

      publishViewModel(nextViewModel, options);
      stagedSelections = Object.create(null);
      syncError = '';
      syncPending = false;
      syncSent = false;
      render();
    }

    async function refreshList(viewModel) {
      if (syncPending) {
        return;
      }

      var callTool = getCallTool();
      if (!callTool) {
        syncError = 'This host cannot refresh the grocery list from the widget yet.';
        render();
        return;
      }

      syncError = '';
      syncPending = true;
      syncSent = false;
      render();

      try {
        var refreshed = await callTool('meals_render_grocery_list_v2', { week_start: viewModel.weekStart });
        applyRenderResult(refreshed, { clearMissingLocalEdits: true });
      } catch (error) {
        syncPending = false;
        syncSent = false;
        syncError = 'Unable to refresh the list right now. Your local checks are still staged.';
        render();
      }
    }

    function bucketById(viewModel, bucketId) {
      return (viewModel.buckets || []).find(function (entry) { return entry.id === bucketId; }) || null;
    }

    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value || {}));
    }

    function normalizeManualItemKey(displayName) {
      return String(displayName || '').trim().toLowerCase();
    }

    function findToolRecord(candidate) {
      if (!candidate || typeof candidate !== 'object') {
        return null;
      }
      if (candidate.id || candidate.displayName || candidate.display_name || candidate.status) {
        return candidate;
      }
      var keys = ['structuredContent', 'record', 'result', 'data', 'value'];
      for (var index = 0; index < keys.length; index += 1) {
        if (candidate[keys[index]]) {
          var nested = findToolRecord(candidate[keys[index]]);
          if (nested) {
            return nested;
          }
        }
      }
      return null;
    }

    function ensureBucket(viewModel, bucketId, label) {
      viewModel.buckets = Array.isArray(viewModel.buckets) ? viewModel.buckets : [];
      var bucket = bucketById(viewModel, bucketId);
      if (!bucket) {
        bucket = { id: bucketId, label: label, count: 0, items: [] };
        viewModel.buckets.push(bucket);
      }
      viewModel.bucketOrder = Array.isArray(viewModel.bucketOrder) ? viewModel.bucketOrder : [];
      if (viewModel.bucketOrder.indexOf(bucketId) < 0) {
        viewModel.bucketOrder.push(bucketId);
      }
      bucket.items = Array.isArray(bucket.items) ? bucket.items : [];
      return bucket;
    }

    function removeItemFromBuckets(viewModel, itemKey) {
      var removed = null;
      (viewModel.buckets || []).forEach(function (bucket) {
        var nextItems = [];
        (bucket.items || []).forEach(function (item) {
          if (item.itemKey === itemKey) {
            removed = removed || item;
            return;
          }
          nextItems.push(item);
        });
        bucket.items = nextItems;
      });
      return removed;
    }

    function updateBucketCounts(viewModel) {
      var counts = {
        check_pantry: 0,
        covered: 0,
        need_to_buy: 0,
        verify_quantity: 0,
      };

      (viewModel.buckets || []).forEach(function (bucket) {
        bucket.items = Array.isArray(bucket.items) ? bucket.items : [];
        bucket.count = bucket.items.length;
        if (Object.prototype.hasOwnProperty.call(counts, bucket.id)) {
          counts[bucket.id] = bucket.count;
        }
      });

      var summary = Object.assign({}, viewModel.summary || {});
      summary.coveredCount = counts.covered;
      summary.needToBuyCount = counts.need_to_buy + counts.verify_quantity;
      summary.verifyCount = counts.check_pantry + counts.verify_quantity;
      summary.checkPantryCount = counts.check_pantry;
      summary.verifyQuantityCount = counts.verify_quantity;
      viewModel.summary = summary;
    }

    function findItemBucket(viewModel, itemKey, displayName) {
      var manualKey = normalizeManualItemKey(displayName);
      var matched = null;
      (viewModel.buckets || []).forEach(function (bucket) {
        (bucket.items || []).forEach(function (item) {
          if (matched) {
            return;
          }
          if (item.itemKey === itemKey || (manualKey && normalizeManualItemKey(item.displayName) === manualKey)) {
            matched = bucket.id;
          }
        });
      });
      return matched;
    }

    function restoreActiveBucketId(bucketId) {
      var normalized = normalizeBucketId(bucketId);
      if (normalized === 'need_to_buy' || normalized === 'verify_quantity' || normalized === 'check_pantry') {
        return normalized;
      }
      return null;
    }

    function inferUndoTargetBucket(saved) {
      var item = saved && saved.item ? saved.item : {};
      var explicitBucket = restoreActiveBucketId(saved && saved.previousBucketId)
        || restoreActiveBucketId(saved && saved.sourceBucketId)
        || restoreActiveBucketId(item.previousBucketId)
        || restoreActiveBucketId(item.sourceBucketId);
      if (explicitBucket) {
        return explicitBucket;
      }

      var hint = [
        item.detail,
        item.reason,
        item.note,
        item.provenanceLabel,
        item.inventoryStatus,
      ].filter(Boolean).join(' ').toLowerCase();
      if (hint.indexOf('quantity') >= 0 || hint.indexOf('unit mismatch') >= 0 || hint.indexOf('qty unknown') >= 0) {
        return 'verify_quantity';
      }
      if (hint.indexOf('pantry') >= 0 || hint.indexOf('enough on hand') >= 0 || hint.indexOf('already have enough') >= 0) {
        return 'check_pantry';
      }

      return 'need_to_buy';
    }

    function actionTargetBucket(action, saved) {
      if (!action || !action.toolName) {
        return null;
      }

      if (action.toolName === 'meals_delete_grocery_plan_action') {
        return inferUndoTargetBucket(saved);
      }

      var args = action.args || {};
      if (action.toolName === 'meals_upsert_grocery_intent') {
        return args.status === 'completed' ? 'covered' : 'need_to_buy';
      }

      if (action.toolName !== 'meals_upsert_grocery_plan_action') {
        return null;
      }

      var status = String(args.action_status || '');
      if (status === 'dont_have_it' || status === 'needs_purchase' || status === 'have_some_need_to_buy') {
        return 'need_to_buy';
      }
      if (status === 'purchased' || status === 'have_enough' || status === 'confirmed' || status === 'skipped' || status === 'substituted' || status === 'in_cart') {
        return 'covered';
      }
      return null;
    }

    function localSyncActionsForBucket(item, bucketId, sourceAction, weekStart) {
      if (sourceAction && sourceAction.toolName === 'meals_upsert_grocery_intent') {
        var args = Object.assign({}, sourceAction.args || {});
        args.display_name = args.display_name || item.displayName;
        args.target_window = args.target_window || weekStart;
        args.status = bucketId === 'covered' ? 'pending' : 'completed';
        return [{
          args: args,
          id: bucketId === 'covered' ? 'undo' : 'mark_bought',
          label: bucketId === 'covered' ? 'Undo' : 'Mark bought',
          toolName: 'meals_upsert_grocery_intent',
        }];
      }

      return buildFallbackSyncActions(item, bucketId, weekStart);
    }

    function moveItemBySavedAction(viewModel, saved) {
      if (!saved || !saved.item || !saved.action) {
        return false;
      }

      var currentBucketId = findItemBucket(viewModel, saved.item.itemKey, saved.item.displayName);
      var targetBucketId = actionTargetBucket(saved.action, saved);
      if (!targetBucketId) {
        return false;
      }

      var labels = {
        check_pantry: 'Check at home',
        covered: 'Done',
        need_to_buy: 'To buy',
        verify_quantity: 'Check amount',
      };
      var removed = removeItemFromBuckets(viewModel, saved.item.itemKey);
      var baseItem = removed || saved.item;
      var previousBucketId = targetBucketId === 'covered'
        ? restoreActiveBucketId(saved.sourceBucketId)
          || restoreActiveBucketId(currentBucketId)
          || restoreActiveBucketId(saved.previousBucketId)
          || restoreActiveBucketId(baseItem.sourceBucketId)
          || restoreActiveBucketId(baseItem.previousBucketId)
        : restoreActiveBucketId(saved.previousBucketId)
          || restoreActiveBucketId(saved.sourceBucketId)
          || restoreActiveBucketId(currentBucketId)
          || restoreActiveBucketId(baseItem.previousBucketId)
          || restoreActiveBucketId(baseItem.sourceBucketId);
      var movedItem = Object.assign({}, cloneJson(baseItem), {
        checked: targetBucketId === 'covered',
      });
      if (targetBucketId === 'covered' && previousBucketId) {
        movedItem.previousBucketId = previousBucketId;
        movedItem.sourceBucketId = previousBucketId;
      } else if (targetBucketId !== 'covered') {
        delete movedItem.previousBucketId;
        delete movedItem.sourceBucketId;
      }
      var syncActions = localSyncActionsForBucket(movedItem, targetBucketId, saved.action, viewModel.weekStart);
      movedItem.syncActions = syncActions;
      movedItem.syncAction = syncActions[0] || null;

      var targetBucket = ensureBucket(viewModel, targetBucketId, labels[targetBucketId] || targetBucketId);
      targetBucket.items.push(movedItem);
      if (targetBucketId === 'covered') {
        coveredExpanded = true;
      }
      return true;
    }

    function applyLocalGroceryListEdits(viewModel) {
      if (!viewModel || typeof viewModel !== 'object') {
        return viewModel;
      }

      var nextViewModel = cloneJson(viewModel);
      Object.keys(locallyAddedItems).forEach(function (itemKey) {
        var addedItem = locallyAddedItems[itemKey];
        var exists = (nextViewModel.buckets || []).some(function (bucket) {
          return (bucket.items || []).some(function (item) {
            return item.itemKey === itemKey || normalizeManualItemKey(item.displayName) === itemKey;
          });
        });
        if (!exists) {
          ensureBucket(nextViewModel, 'need_to_buy', 'To buy').items.push(cloneJson(addedItem));
        }
      });

      Object.keys(locallySavedActions).forEach(function (itemKey) {
        moveItemBySavedAction(nextViewModel, locallySavedActions[itemKey]);
      });

      updateBucketCounts(nextViewModel);
      return normalizeGroceryListForWidget(nextViewModel);
    }

    function reconcileLocalEditsWithHost(hostViewModel, clearMissingLocalEdits) {
      Object.keys(locallyAddedItems).forEach(function (itemKey) {
        var addedItem = locallyAddedItems[itemKey];
        if (findItemBucket(hostViewModel, itemKey, addedItem.displayName) || clearMissingLocalEdits) {
          delete locallyAddedItems[itemKey];
        }
      });

      Object.keys(locallySavedActions).forEach(function (itemKey) {
        var saved = locallySavedActions[itemKey];
        var targetBucketId = actionTargetBucket(saved.action, saved);
        var hostBucketId = findItemBucket(hostViewModel, itemKey, saved.item && saved.item.displayName);
        if (hostBucketId === targetBucketId || (!hostBucketId && clearMissingLocalEdits)) {
          delete locallySavedActions[itemKey];
        }
      });
    }

    function rememberSavedActions(savedItems) {
      savedItems.forEach(function (saved) {
        if (saved && saved.item && saved.item.itemKey) {
          locallySavedActions[saved.item.itemKey] = {
            action: cloneSyncAction(saved.action),
            item: cloneJson(saved.item),
            previousBucketId: saved.previousBucketId,
            sourceBucketId: saved.sourceBucketId,
          };
          if (locallyAddedItems[saved.item.itemKey] && actionTargetBucket(saved.action, saved) === 'covered') {
            delete locallyAddedItems[saved.item.itemKey];
          }
        }
      });
    }

    function inferAisle(item) {
      var label = (item.displayName || '').toLowerCase();
      if (label.indexOf('salmon') >= 0 || label.indexOf('shrimp') >= 0 || label.indexOf('tuna') >= 0 || label.indexOf('cod') >= 0) {
        return 'Seafood';
      }
      if (
        label.indexOf('chicken') >= 0 ||
        label.indexOf('beef') >= 0 ||
        label.indexOf('turkey') >= 0 ||
        label.indexOf('pork') >= 0 ||
        label.indexOf('sausage') >= 0 ||
        label.indexOf('meatball') >= 0
      ) {
        return 'Meat';
      }
      if (
        label.indexOf('yogurt') >= 0 ||
        label === 'egg' ||
        label.indexOf('eggs') >= 0 ||
        label.indexOf('parmesan') >= 0 ||
        label.indexOf('cheese') >= 0 ||
        label.indexOf('milk') >= 0 ||
        label.indexOf('butter') >= 0 ||
        label.indexOf('cream') >= 0
      ) {
        return 'Dairy';
      }
      if (
        label.indexOf('blueberr') >= 0 ||
        label.indexOf('avocado') >= 0 ||
        label.indexOf('orange') >= 0 ||
        label.indexOf('lemon') >= 0 ||
        label.indexOf('lime') >= 0 ||
        label.indexOf('tomato') >= 0 ||
        label.indexOf('bok choy') >= 0 ||
        label.indexOf('broccoli') >= 0 ||
        label.indexOf('carrot') >= 0 ||
        label.indexOf('romaine') >= 0 ||
        label.indexOf('spinach') >= 0 ||
        label.indexOf('potato') >= 0 ||
        label.indexOf('garlic') >= 0 ||
        label.indexOf('onion') >= 0 ||
        label.indexOf('scallion') >= 0 ||
        label.indexOf('lettuce') >= 0
      ) {
        return 'Produce';
      }
      if (
        label.indexOf('granola') >= 0 ||
        label.indexOf('spaghetti') >= 0 ||
        label.indexOf('marinara') >= 0 ||
        label.indexOf('dressing') >= 0 ||
        label.indexOf('seasoning') >= 0 ||
        label.indexOf('miso') >= 0 ||
        label.indexOf('soy sauce') >= 0 ||
        label.indexOf('breadcrumb') >= 0 ||
        label.indexOf('chickpea') >= 0 ||
        label.indexOf('oats') >= 0 ||
        label.indexOf('rice') >= 0 ||
        label.indexOf('paprika') >= 0 ||
        label.indexOf('basil') >= 0 ||
        label.indexOf('oregano') >= 0 ||
        label.indexOf('olive oil') >= 0 ||
        label.indexOf('honey') >= 0
      ) {
        return 'Pantry';
      }
      return 'Other';
    }

    function buildAisleGroups(viewModel) {
      var order = [];
      var groups = Object.create(null);
      ['need_to_buy', 'verify_quantity'].forEach(function (bucketId) {
        var bucket = bucketById(viewModel, bucketId);
        if (!bucket || !bucket.items) {
          return;
        }

        bucket.items.forEach(function (item) {
          var aisle = inferAisle(item);
          if (!groups[aisle]) {
            groups[aisle] = [];
            order.push(aisle);
          }
          groups[aisle].push(item);
        });
      });

      return order.map(function (aisle) {
        return { name: aisle, items: groups[aisle] };
      });
    }

    function renderToggle(item, isChecked) {
      if (item.syncAction) {
        return '<label class="grocery-item-toggle' + (item.checked ? ' grocery-item-toggle--covered' : '') + '"><input type="checkbox" data-item-key="' + escapeHtml(item.itemKey) + '"' + (isChecked ? ' checked' : '') + ' aria-label="' + escapeHtml(toDisplayName(item.displayName)) + '" /></label>';
      }
      return '<span class="grocery-item-toggle" aria-hidden="true"></span>';
    }

    function renderItem(item) {
      var isChecked = itemIsChecked(item);
      var nameClass = isChecked ? 'grocery-item-name grocery-item-name--checked' : 'grocery-item-name';
      var displayQty = formatQuantityDisplay(item.quantityDisplay);

      return [
        '<li class="grocery-item">',
        renderToggle(item, isChecked),
        '<div class="grocery-item-main">',
        '<span class="' + nameClass + '">' + escapeHtml(toDisplayName(item.displayName)) + '</span>',
        item.detail ? '<span class="grocery-item-detail">' + escapeHtml(item.detail) + '</span>' : '',
        '</div>',
        displayQty ? '<span class="grocery-item-qty">' + escapeHtml(displayQty) + '</span>' : '',
        '</li>',
      ].join('');
    }

    function renderAisle(group) {
      return [
        '<section class="grocery-aisle">',
        '<div class="grocery-aisle-label">',
        '<h2 class="grocery-aisle-name">' + escapeHtml(group.name) + '</h2>',
        '<div class="grocery-aisle-meta">' + escapeHtml(group.items.length) + ' item' + (group.items.length === 1 ? '' : 's') + '</div>',
        '</div>',
        '<div class="grocery-aisle-body"><ul class="grocery-list">' + group.items.map(renderItem).join('') + '</ul></div>',
        '</section>',
      ].join('');
    }

    function renderVerifyBlock(bucket) {
      if (!bucket || !bucket.items || !bucket.items.length) {
        return '';
      }

      return [
        '<section class="grocery-verify-block">',
        '<div class="grocery-verify-head"><h2 class="grocery-verify-title">Check at home</h2><span class="grocery-verify-count">' + escapeHtml(bucket.count) + '</span></div>',
        '<div class="grocery-verify-rows">' + bucket.items.map(function (item) {
          var selectedActionId = stagedSelections[item.itemKey] || '';
          var haveItAction = (item.syncActions || []).find(function (action) { return action.id === 'already_have_enough'; }) || item.syncAction || null;
          var needItAction = (item.syncActions || []).find(function (action) { return action.id === 'need_to_buy'; }) || null;
          var detailMarkup = item.detail
            ? '<div class="grocery-verify-copy"><strong>' + escapeHtml(toDisplayName(item.displayName)) + ':</strong> ' + escapeHtml(item.detail) + '</div>'
            : '<div class="grocery-verify-copy"><strong>' + escapeHtml(toDisplayName(item.displayName)) + '</strong></div>';
          return [
            '<div class="grocery-verify-row">',
            detailMarkup,
            '<div class="grocery-verify-actions">',
            haveItAction
              ? '<button type="button" class="grocery-verify-button" data-verify-item-key="' + escapeHtml(item.itemKey) + '" data-action-id="already_have_enough" data-active="' + (selectedActionId === 'already_have_enough' ? 'true' : 'false') + '" aria-label="' + escapeHtml('Mark ' + toDisplayName(item.displayName) + ' as already enough at home') + '" aria-pressed="' + (selectedActionId === 'already_have_enough' ? 'true' : 'false') + '">Already have enough</button>'
              : '',
            needItAction
              ? '<button type="button" class="grocery-verify-button" data-verify-item-key="' + escapeHtml(item.itemKey) + '" data-action-id="need_to_buy" data-active="' + (selectedActionId === 'need_to_buy' ? 'true' : 'false') + '" aria-label="' + escapeHtml('Add ' + toDisplayName(item.displayName) + ' to the buy list') + '" aria-pressed="' + (selectedActionId === 'need_to_buy' ? 'true' : 'false') + '">Add to buy list</button>'
              : '',
            '</div>',
            '</div>',
          ].join('');
        }).join('') + '</div>',
        '</section>',
      ].join('');
    }

    function renderCovered(bucket) {
      if (!bucket || !bucket.items || !bucket.items.length) {
        return '';
      }

      return [
        '<section class="grocery-section grocery-section--covered">',
        '<button type="button" class="grocery-covered-toggle" data-covered-toggle aria-expanded="' + (coveredExpanded ? 'true' : 'false') + '">',
        '<span class="grocery-section-title">Done (' + escapeHtml(bucket.count) + ')</span>',
        '<span class="grocery-covered-toggle-copy">' + escapeHtml(coveredExpanded ? 'Hide' : 'Show') + '</span>',
        '</button>',
        coveredExpanded ? '<ul class="grocery-list">' + bucket.items.map(renderItem).join('') + '</ul>' : '',
        '</section>',
      ].join('');
    }

    function getProgressSummary(viewModel) {
      var total = 0;
      var complete = 0;

      (viewModel.bucketOrder || []).forEach(function (bucketId) {
        var bucket = bucketById(viewModel, bucketId);
        if (!bucket || !bucket.items) {
          return;
        }

        bucket.items.forEach(function (item) {
          total += 1;
          if (itemIsChecked(item)) {
            complete += 1;
          }
        });
      });

      return {
        complete: complete,
        ratio: total ? Math.max(0, Math.min(1, complete / total)) : 0,
        total: total,
      };
    }

    function renderAddItemControls() {
      if (!addItemExpanded) {
        return '<button type="button" class="grocery-sync-button-add" data-add-item>Add item</button>';
      }

      return [
        '<div class="grocery-add-form">',
        '<label class="grocery-visually-hidden" for="grocery-add-item-input">Item to add</label>',
        '<input id="grocery-add-item-input" class="grocery-add-input" type="text" data-add-item-input placeholder="Add an item to your grocery list" value="' + escapeHtml(addItemDraft) + '" />',
        '<button type="button" class="grocery-add-submit" data-add-item-submit>Add item</button>',
        '<button type="button" class="grocery-add-cancel" data-add-item-cancel>Cancel</button>',
        '</div>',
      ].join('');
    }

    async function sendSync(viewModel) {
      var stagedItems = getStagedItems(viewModel);
      if (!stagedItems.length) {
        return;
      }

      var callTool = getCallTool();
      if (!callTool) {
        syncError = 'This host cannot call Fluent tools from the widget yet.';
        render();
        return;
      }

      syncError = '';
      syncPending = true;
      syncSent = false;
      render();

      var completedCount = 0;

        try {
          for (var index = 0; index < stagedItems.length; index += 1) {
            var stagedItem = stagedItems[index];
            await callTool(stagedItem.action.toolName, stagedItem.action.args);
            completedCount += 1;
          }

        rememberSavedActions(stagedItems);
        publishViewModel(viewModel);
        stagedSelections = Object.create(null);
        syncSent = true;
        render();

        var refreshed = await callTool('meals_render_grocery_list_v2', { week_start: viewModel.weekStart });
        applyRenderResult(refreshed);
      } catch (error) {
        syncSent = false;
        syncPending = false;
        syncError = completedCount
          ? 'Some selected changes may have saved before the connection failed. Refresh the list before retrying.'
          : 'Unable to save the grocery list changes. Nothing was confirmed by the widget.';
        render();
      }
    }

    function render() {
      var viewModel = getViewModel();
      if (!viewModel) {
        renderEmpty();
        return;
      }

      var aisleGroups = buildAisleGroups(viewModel);
      var verifyBucket = bucketById(viewModel, 'check_pantry');
      var coveredBucket = bucketById(viewModel, 'covered');
      var aisleMarkup = aisleGroups.map(renderAisle).join('');
      var verifyMarkup = renderVerifyBlock(verifyBucket);
      var coveredMarkup = renderCovered(coveredBucket);
      var stagedCount = getStagedItems(viewModel).length;
      var progress = getProgressSummary(viewModel);
      var syncCopy = stagedCount
          ? stagedCount + ' item' + (stagedCount === 1 ? '' : 's') + ' selected. Save when you’re ready.'
        : 'Check items locally, then save changes when you’re ready.';
      var headline = escapeHtml(viewModel.summary.needToBuyCount + ' to buy · ' + aisleGroups.length + ' aisles');
      var formattedWeekStart = formatWeekStart(viewModel.weekStart);
      var syncStatus = syncPending
        ? 'Saving changes.'
        : syncError
          ? syncError
          : syncSent
            ? 'Saved and refreshed.'
            : syncCopy;
      root.innerHTML = [
        '<article class="grocery-card">',
        '<header class="grocery-header">',
        '<div class="grocery-header-top">',
        '<div class="grocery-header-copy">',
        '<p class="grocery-kicker">Grocery list</p>',
        '<h1 class="grocery-headline">' + headline + '</h1>',
        '<p class="grocery-subtitle">' + escapeHtml(viewModel.subtitle || ((viewModel.trustLabel || 'Check before shopping') + (formattedWeekStart ? ' · plan week ' + formattedWeekStart : ''))) + '</p>',
        (viewModel.stale && viewModel.staleReasons && viewModel.staleReasons.length ? '<p class="grocery-sync-error">' + escapeHtml(viewModel.staleReasons[0]) + '</p>' : ''),
        '</div>',
        '<div class="grocery-header-controls">',
        '<div class="grocery-progress" aria-label="' + escapeHtml(progress.complete + ' of ' + progress.total + ' grocery items checked') + '">',
        '<div class="grocery-progress-track"><div class="grocery-progress-fill" style="width:' + escapeHtml(String(Math.round(progress.ratio * 100))) + '%"></div></div>',
        '<span class="grocery-progress-label">' + escapeHtml(progress.complete + '/' + progress.total) + '</span>',
        '</div>',
        '</div>',
        '</div>',
        '</header>',
        aisleMarkup ? '<div class="grocery-aisles">' + aisleMarkup + '</div>' : '<p class="grocery-empty">Nothing left to buy on this list.</p>',
        verifyMarkup,
        coveredMarkup,
        '<div class="grocery-sync-bar" aria-busy="' + (syncPending ? 'true' : 'false') + '">',
        '<p class="grocery-sync-copy">' + escapeHtml(syncCopy) + '</p>',
        '<div class="grocery-sync-actions">',
        renderAddItemControls(),
        '<button type="button" class="grocery-sync-button" data-sync-button aria-label="' + escapeHtml(stagedCount ? 'Save ' + stagedCount + ' grocery list change' + (stagedCount === 1 ? '' : 's') : 'Save changes') + '"' + (stagedCount && !syncPending ? '' : ' disabled') + '>' + escapeHtml(syncPending ? 'Saving…' : 'Save changes') + '</button>',
        '<button type="button" class="grocery-sync-refresh" data-refresh-button aria-label="Refresh list"' + (syncPending ? ' disabled' : '') + '>Refresh list</button>',
        (stagedCount ? '<button type="button" class="grocery-sync-reset" data-reset-button' + (syncPending ? ' disabled' : '') + '>Reset</button>' : ''),
        '</div>',
        '<p class="grocery-visually-hidden" role="status" aria-live="polite">' + escapeHtml(syncStatus) + '</p>',
        (syncError ? '<p class="grocery-sync-error" role="alert">' + escapeHtml(syncError) + '</p>' : ''),
        (syncSent ? '<p class="grocery-sync-sent">Saved and refreshed.</p>' : ''),
        '</div>',
        '</article>',
      ].join('');

        Array.prototype.forEach.call(root.querySelectorAll('input[data-item-key]'), function (input) {
          input.addEventListener('click', function (event) {
            event.preventDefault();
            toggleItem(input.getAttribute('data-item-key'));
          });
        });

        Array.prototype.forEach.call(root.querySelectorAll('button[data-verify-item-key][data-action-id]'), function (button) {
          button.addEventListener('click', function () {
            selectItemAction(button.getAttribute('data-verify-item-key'), button.getAttribute('data-action-id'));
          });
        });

      var syncButton = root.querySelector('[data-sync-button]');
      if (syncButton) {
        syncButton.addEventListener('click', function () {
          void sendSync(viewModel);
        });
      }

        var refreshButton = root.querySelector('[data-refresh-button]');
        if (refreshButton) {
          refreshButton.addEventListener('click', function () {
            void refreshList(viewModel);
          });
        }

        var resetButton = root.querySelector('[data-reset-button]');
        if (resetButton) {
          resetButton.addEventListener('click', function () {
            resetStaged();
          });
        }

        var addItemButton = root.querySelector('[data-add-item]');
        if (addItemButton) {
          addItemButton.addEventListener('click', function () {
            toggleAddItem();
          });
        }

        var addItemInput = root.querySelector('[data-add-item-input]');
        if (addItemInput) {
          addItemInput.addEventListener('input', function () {
            updateAddItemDraft(addItemInput.value);
          });
          addItemInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
              event.preventDefault();
              void addManualItem(viewModel);
            }
          });
          addItemInput.focus();
        }

        var addItemSubmit = root.querySelector('[data-add-item-submit]');
        if (addItemSubmit) {
          addItemSubmit.addEventListener('click', function () {
            void addManualItem(viewModel);
          });
        }

        var addItemCancel = root.querySelector('[data-add-item-cancel]');
        if (addItemCancel) {
          addItemCancel.addEventListener('click', function () {
            toggleAddItem();
          });
        }

      var coveredToggle = root.querySelector('[data-covered-toggle]');
      if (coveredToggle) {
        coveredToggle.addEventListener('click', function () {
          toggleCovered();
        });
      }

      notifyHeight();
    }

    window.addEventListener('openai:set_globals', function () {
      hydrateFromCandidate(getOpenAI().toolResponseMetadata) || hydrateFromCandidate(getOpenAI().toolOutput);
      render();
    }, { passive: true });

    void connectMcpAppsHost();
    render();
  })();
</script>`;
}
export function getGrocerySmokeWidgetHtml(): string {
  return `
<div class="fluent-grocery-smoke">
  <p class="fluent-grocery-kicker">Fluent widget smoke test</p>
  <h1>Standalone grocery smoke widget · ${MEALS_GROCERY_SMOKE_WIDGET_VERSION}</h1>
  <p>This is a dedicated smoke widget resource for ChatGPT host verification.</p>
  <p>If this one fails too, the issue is outside the grocery list implementation path.</p>
</div>
<style>
  :root {
    color-scheme: light dark;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: transparent;
    color: inherit;
  }

  .fluent-grocery-smoke {
    margin: 0;
    padding: 20px;
    border: 1px solid rgba(128, 128, 128, 0.25);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.72);
  }

  .fluent-grocery-kicker {
    margin: 0 0 10px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .fluent-grocery-smoke h1 {
    margin: 0 0 12px;
    font-size: 24px;
    line-height: 1.1;
  }

  .fluent-grocery-smoke p {
    margin: 0 0 10px;
    font-size: 14px;
    line-height: 1.5;
  }

  .fluent-grocery-smoke p:last-child {
    margin-bottom: 0;
  }
</style>`;
}
