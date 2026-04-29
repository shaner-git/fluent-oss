export const MEALS_GROCERY_LIST_WIDGET_VERSION = 'v55';
export const MEALS_GROCERY_SMOKE_WIDGET_VERSION = 'v1';
export const MEALS_GROCERY_LIST_TEMPLATE_URI = `ui://widget/fluent-grocery-list-${MEALS_GROCERY_LIST_WIDGET_VERSION}.html`;
export const MEALS_GROCERY_SMOKE_TEMPLATE_URI = `ui://widget/fluent-grocery-smoke-${MEALS_GROCERY_SMOKE_WIDGET_VERSION}.html`;

export interface GroceryListRecipeReferenceViewModel {
  recipeId: string;
  recipeName: string;
}

export interface GroceryListActionViewModel {
  id: 'have_it' | 'need_to_buy' | 'undo';
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

export interface GroceryListViewModel {
  bucketOrder: Array<'need_to_buy' | 'verify_pantry' | 'covered'>;
  buckets: GroceryListBucketViewModel[];
  subtitle: string;
  summary: GroceryListSummaryViewModel;
  title: string;
  weekStart: string;
}

export interface GroceryListWidgetViewModel {
  bucketOrder: GroceryListViewModel['bucketOrder'];
  buckets: GroceryListWidgetBucketViewModel[];
  subtitle: string;
  summary: GroceryListSummaryViewModel;
  title: string;
  weekStart: string;
}

export interface GroceryListPublicItemViewModel {
  itemKey: string;
  displayName: string;
  detail: string | null;
  quantityDisplay: string | null;
  checked: boolean;
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
  id: GroceryListBucketViewModel['id'];
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
  bucketOrder: GroceryListViewModel['bucketOrder'];
  buckets: GroceryListPublicBucketViewModel[];
  subtitle: string;
  summary: GroceryListSummaryViewModel;
  title: string;
  weekStart: string;
}

export interface GroceryListInteractiveViewModel {
  bucketOrder: GroceryListInteractiveBucketId[];
  buckets: GroceryListInteractiveBucketViewModel[];
  subtitle: string;
  summary: GroceryListSummaryViewModel & {
    checkPantryCount: number;
    verifyQuantityCount: number;
  };
  title: string;
  weekStart: string;
}

export function buildEmptyGroceryListViewModel(weekStart: string): GroceryListViewModel {
  return {
    bucketOrder: ['need_to_buy', 'verify_pantry', 'covered'],
    buckets: [
      { id: 'need_to_buy', label: 'Need to buy', count: 0, items: [] },
      { id: 'verify_pantry', label: 'Verify pantry', count: 0, items: [] },
      { id: 'covered', label: 'Covered', count: 0, items: [] },
    ],
    subtitle: `Week of ${weekStart}. You’re clear right now, with nothing left to buy or verify.`,
    summary: {
      coveredCount: 0,
      headline: '0 items left to buy',
      needToBuyCount: 0,
      verifyCount: 0,
    },
    title: 'Grocery List',
    weekStart,
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
    subtitle: viewModel.subtitle,
    summary: viewModel.summary,
    title: viewModel.title,
    weekStart: viewModel.weekStart,
  };
}

function buildGroceryListPublicViewModel(viewModel: GroceryListViewModel): GroceryListPublicViewModel {
  return {
    bucketOrder: viewModel.bucketOrder,
    buckets: viewModel.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      count: bucket.count,
      items: bucket.items.map((item) => ({
        checked: bucket.id === 'covered',
        detail: deriveItemDetail(item, resolveInteractiveBucketId(item)),
        displayName: item.displayName,
        itemKey: item.itemKey,
        quantityDisplay: item.quantityDisplay,
      })),
    })),
    subtitle: viewModel.subtitle,
    summary: viewModel.summary,
    title: viewModel.title,
    weekStart: viewModel.weekStart,
  };
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
      label: 'Verify quantity',
      count: groupedItems.verify_quantity.length,
      items: groupedItems.verify_quantity,
    },
    {
      id: 'check_pantry',
      label: 'Check pantry',
      count: groupedItems.check_pantry.length,
      items: groupedItems.check_pantry,
    },
    {
      id: 'covered',
      label: 'Covered',
      count: groupedItems.covered.length,
      items: groupedItems.covered,
    },
  ];

  return {
    bucketOrder: ['need_to_buy', 'verify_quantity', 'check_pantry', 'covered'],
    buckets,
    subtitle: viewModel.subtitle,
    summary: {
      ...viewModel.summary,
      checkPantryCount: groupedItems.check_pantry.length,
      verifyQuantityCount: groupedItems.verify_quantity.length,
    },
    title: viewModel.title,
    weekStart: viewModel.weekStart,
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
    return 'verified on hand';
  }

  if (item.reason === 'Marked as already covered.') {
    return 'already covered';
  }

  return item.reason ?? null;
}

export function buildGroceryListStructuredContent(viewModel: GroceryListViewModel) {
  const publicViewModel = buildGroceryListPublicViewModel(viewModel);
  return {
    experience: 'grocery_list',
    groceryList: publicViewModel,
    subtitle: publicViewModel.subtitle,
    summary: publicViewModel.summary,
    title: publicViewModel.title,
    weekStart: publicViewModel.weekStart,
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
    padding: 0;
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
    background: rgba(217, 119, 6, 0.08);
    border-color: rgba(217, 119, 6, 0.35);
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
    min-height: 22px;
    padding-top: 1px;
  }

  .grocery-item-toggle input {
    width: 18px;
    height: 18px;
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

  .grocery-sync-button-add[disabled],
  .grocery-sync-button[disabled],
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
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getViewModel() {
      var metadata = getOpenAI().toolResponseMetadata;
      if (metadata && metadata.groceryList) {
        return metadata.groceryList;
      }
      var output = getOpenAI().toolOutput;
      if (output && output.groceryList) {
        return output.groceryList;
      }
      return null;
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
        '<p class="grocery-kicker">Fluent grocery list</p>',
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
        await callTool('meals_upsert_grocery_intent', {
          display_name: itemName,
          status: 'pending',
          target_window: viewModel.weekStart,
        });

        addItemExpanded = false;
        addItemDraft = '';
        syncSent = true;
        render();

        var refreshed = await callTool('meals_render_grocery_list_v2', { week_start: viewModel.weekStart });
        applyRenderResult(refreshed);
      } catch (error) {
        syncPending = false;
        syncSent = false;
        syncError = 'Unable to add that grocery item right now.';
        render();
      }
    }

    function toggleCovered() {
      coveredExpanded = !coveredExpanded;
      render();
    }

    function getCallTool() {
      var openai = getOpenAI();
      if (typeof openai.callTool === 'function') {
        return openai.callTool.bind(openai);
      }
      return null;
    }

    function applyRenderResult(result) {
      var nextViewModel =
        (result && result._meta && result._meta.groceryList)
        || (result && result.structuredContent && result.structuredContent.groceryList)
        || null;

      if (!nextViewModel) {
        syncSent = false;
        syncPending = false;
        syncError = 'Fluent updated, but the refreshed grocery list did not come back.';
        render();
        return;
      }

      var openai = getOpenAI();
      if (openai && typeof openai === 'object') {
        openai.toolResponseMetadata = {
          experience: 'grocery_list',
          groceryList: nextViewModel,
          version: '${MEALS_GROCERY_LIST_WIDGET_VERSION}',
        };
        openai.toolOutput = {
          experience: 'grocery_list',
          groceryList: nextViewModel,
          summary: nextViewModel.summary,
          title: nextViewModel.title,
          weekStart: nextViewModel.weekStart,
        };
      }

      stagedSelections = Object.create(null);
      syncError = '';
      syncPending = false;
      syncSent = false;
      render();
    }

    function bucketById(viewModel, bucketId) {
      return (viewModel.buckets || []).find(function (entry) { return entry.id === bucketId; }) || null;
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
        '<div class="grocery-verify-head"><h2 class="grocery-verify-title">Verify in pantry</h2><span class="grocery-verify-count">' + escapeHtml(bucket.count) + '</span></div>',
        '<div class="grocery-verify-rows">' + bucket.items.map(function (item) {
          var selectedActionId = stagedSelections[item.itemKey] || '';
          var haveItAction = (item.syncActions || []).find(function (action) { return action.id === 'have_it'; }) || item.syncAction || null;
          var needItAction = (item.syncActions || []).find(function (action) { return action.id === 'need_to_buy'; }) || null;
          var detailMarkup = item.detail
            ? '<div class="grocery-verify-copy"><strong>' + escapeHtml(toDisplayName(item.displayName)) + ':</strong> ' + escapeHtml(item.detail) + '</div>'
            : '<div class="grocery-verify-copy"><strong>' + escapeHtml(toDisplayName(item.displayName)) + '</strong></div>';
          return [
            '<div class="grocery-verify-row">',
            detailMarkup,
            '<div class="grocery-verify-actions">',
            haveItAction
              ? '<button type="button" class="grocery-verify-button" data-verify-item-key="' + escapeHtml(item.itemKey) + '" data-action-id="have_it" data-active="' + (selectedActionId === 'have_it' ? 'true' : 'false') + '">Have it</button>'
              : '',
            needItAction
              ? '<button type="button" class="grocery-verify-button" data-verify-item-key="' + escapeHtml(item.itemKey) + '" data-action-id="need_to_buy" data-active="' + (selectedActionId === 'need_to_buy' ? 'true' : 'false') + '">Need</button>'
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
        '<span class="grocery-section-title">Covered (' + escapeHtml(bucket.count) + ')</span>',
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
        '<input class="grocery-add-input" type="text" data-add-item-input placeholder="Add an item to your grocery list" value="' + escapeHtml(addItemDraft) + '" />',
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

        try {
          for (var index = 0; index < stagedItems.length; index += 1) {
            var stagedItem = stagedItems[index];
            await callTool(stagedItem.action.toolName, stagedItem.action.args);
          }

        syncSent = true;
        render();

        var refreshed = await callTool('meals_render_grocery_list_v2', { week_start: viewModel.weekStart });
        applyRenderResult(refreshed);
      } catch (error) {
        syncSent = false;
        syncPending = false;
        syncError = 'Unable to send the grocery sync request.';
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
        ? stagedCount + ' item' + (stagedCount === 1 ? '' : 's') + ' checked. Sync once when you’re ready.'
        : 'Check items locally, then sync them back to Fluent in one batch.';
      var headline = escapeHtml(viewModel.summary.needToBuyCount + ' to buy · ' + aisleGroups.length + ' aisles');
      var formattedWeekStart = formatWeekStart(viewModel.weekStart);
      root.innerHTML = [
        '<article class="grocery-card">',
        '<header class="grocery-header">',
        '<div class="grocery-header-top">',
        '<div class="grocery-header-copy">',
        '<p class="grocery-kicker">Grocery list · Week of ' + escapeHtml(formattedWeekStart) + '</p>',
        '<h1 class="grocery-headline">' + headline + '</h1>',
        '</div>',
        '<div class="grocery-header-controls">',
        '<div class="grocery-progress" aria-label="' + escapeHtml(progress.complete + ' of ' + progress.total + ' grocery items checked') + '">',
        '<div class="grocery-progress-track"><div class="grocery-progress-fill" style="width:' + escapeHtml(String(Math.round(progress.ratio * 100))) + '%"></div></div>',
        '<span class="grocery-progress-label">' + escapeHtml(progress.complete + '/' + progress.total) + '</span>',
        '</div>',
        '</div>',
        '</div>',
        '</header>',
        aisleMarkup ? '<div class="grocery-aisles">' + aisleMarkup + '</div>' : '<p class="grocery-empty">Nothing to show for this week.</p>',
        verifyMarkup,
        coveredMarkup,
        '<div class="grocery-sync-bar">',
        '<p class="grocery-sync-copy">' + escapeHtml(syncCopy) + '</p>',
        '<div class="grocery-sync-actions">',
        renderAddItemControls(),
        '<button type="button" class="grocery-sync-button" data-sync-button' + (stagedCount && !syncPending ? '' : ' disabled') + '>' + escapeHtml(syncPending ? 'Syncing to Fluent…' : 'Sync to Fluent') + '</button>',
        (stagedCount ? '<button type="button" class="grocery-sync-reset" data-reset-button' + (syncPending ? ' disabled' : '') + '>Reset</button>' : ''),
        '</div>',
        (syncError ? '<p class="grocery-sync-error">' + escapeHtml(syncError) + '</p>' : ''),
        (syncSent ? '<p class="grocery-sync-sent">Fluent updated those checked items and refreshed the grocery list.</p>' : ''),
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
      render();
    }, { passive: true });

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

