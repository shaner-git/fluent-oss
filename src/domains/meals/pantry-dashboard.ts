export const MEALS_PANTRY_DASHBOARD_WIDGET_VERSION = 'v14';
export const MEALS_PANTRY_DASHBOARD_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-pantry-dashboard-v13.html';
export const MEALS_PANTRY_DASHBOARD_TEMPLATE_URI = `ui://widget/fluent-pantry-dashboard-${MEALS_PANTRY_DASHBOARD_WIDGET_VERSION}.html`;

/**
 * Pantry Dashboard — v1 ("grounded in what actually happened")
 *
 * Design philosophy:
 *   • No fabricated expiry dates. Everything is reasoned from receipts and
 *     meal plans, and confidence is shown out loud.
 *   • Hero: the most recent shop(s) — the single most trustworthy source.
 *     Items are grouped by shop trip and annotated with what meal they were
 *     bought for.
 *   • Secondary signals (two columns):
 *       – "Likely open" — pantry items that appeared in a recent cooked meal
 *       – "Bought recently, still likely around" — purchases not yet assigned
 *         to a plan
 *   • "You tell me" — staples the user tracks by hand, rendered as a pill
 *     strip with ok / low / out states.
 *   • Footer: honesty note + two forward-looking actions (Suggest recipes,
 *     Plan meals around these).
 */

export type PantryDashboardSignal =
  | 'bought_for_meals'
  | 'likely_open'
  | 'bought_recently'
  | 'user_tracked';

export type StapleState = 'ok' | 'low' | 'out';

export type PantryItemStatus = 'opened' | 'unused';

export interface PantryShopItemViewModel {
  id: string;
  name: string;
  qty: string | null;
  forMeal: string | null;
  status: PantryItemStatus;
}

export interface PantryShopViewModel {
  id: string;
  store: string;
  date: string;
  daysAgo: number | null;
  items: PantryShopItemViewModel[];
}

export interface PantryLikelyOpenViewModel {
  id: string;
  name: string;
  lastAppearedIn: string | null;
  lastSeenRelative: string | null;
}

export interface PantryBoughtRecentlyViewModel {
  id: string;
  name: string;
  note: string | null;
  daysAgo: number | null;
}

export interface PantryStapleViewModel {
  id: string;
  name: string;
  qty: string | null;
  quantity: number | null;
  state: StapleState;
  unit: string | null;
}

export interface PantryDashboardActionViewModel {
  id:
    | 'mark_used_up'
    | 'undo_used_up'
    | 'update_staple'
    | 'set_staple'
    | 'add_staple'
    | 'remove_staple'
    | 'suggest_recipes'
    | 'plan_meals';
  label: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface PantryDashboardWidgetActionViewModel {
  id: PantryDashboardActionViewModel['id'];
  label: string;
}

export interface PantryDashboardViewModel {
  id: string;
  generatedAt: string | null;
  headline: string;
  subheadline: string;
  honestyNote: string;
  totalsLabel: string | null;
  recentShops: PantryShopViewModel[];
  likelyOpen: PantryLikelyOpenViewModel[];
  boughtRecently: PantryBoughtRecentlyViewModel[];
  staples: PantryStapleViewModel[];
  actions: PantryDashboardActionViewModel[];
}

export interface PantryDashboardWidgetViewModel
  extends Omit<PantryDashboardViewModel, 'actions'> {
  actions: PantryDashboardWidgetActionViewModel[];
}

function buildPantryDashboardWidgetViewModel(
  viewModel: PantryDashboardViewModel,
): PantryDashboardWidgetViewModel {
  return {
    actions: viewModel.actions.map((a) => ({ id: a.id, label: a.label })),
    boughtRecently: viewModel.boughtRecently,
    generatedAt: viewModel.generatedAt,
    headline: viewModel.headline,
    honestyNote: viewModel.honestyNote,
    id: viewModel.id,
    likelyOpen: viewModel.likelyOpen,
    recentShops: viewModel.recentShops,
    staples: viewModel.staples,
    subheadline: viewModel.subheadline,
    totalsLabel: viewModel.totalsLabel,
  };
}

export function buildPantryDashboardStructuredContent(
  viewModel: PantryDashboardViewModel,
) {
  const widget = buildPantryDashboardWidgetViewModel(viewModel);
  const totalShopItems = widget.recentShops.reduce(
    (acc, shop) => acc + shop.items.length,
    0,
  );
  return {
    boughtRecentlyCount: widget.boughtRecently.length,
    experience: 'pantry_dashboard',
    likelyOpenCount: widget.likelyOpen.length,
    pantryDashboardSummary: {
      boughtRecently: widget.boughtRecently.map((item) => ({
        daysAgo: item.daysAgo,
        name: item.name,
        note: item.note,
      })),
      likelyOpen: widget.likelyOpen.map((item) => ({
        lastAppearedIn: item.lastAppearedIn,
        lastSeenRelative: item.lastSeenRelative,
        name: item.name,
      })),
      recentShops: widget.recentShops.map((shop) => ({
        date: shop.date,
        daysAgo: shop.daysAgo,
        itemCount: shop.items.length,
        store: shop.store,
      })),
      staples: widget.staples.map((staple) => ({
        name: staple.name,
        qty: staple.qty,
        state: staple.state,
      })),
    },
    recentShopCount: widget.recentShops.length,
    shopItemCount: totalShopItems,
    stapleCount: widget.staples.length,
    title: widget.headline,
  };
}

export function buildPantryDashboardMetadata(
  viewModel: PantryDashboardViewModel,
) {
  const widget = buildPantryDashboardWidgetViewModel(viewModel);
  return {
    actions: viewModel.actions,
    dashboardId: widget.id,
    experience: 'pantry_dashboard',
    pantryDashboard: widget,
    title: widget.headline,
    version: MEALS_PANTRY_DASHBOARD_WIDGET_VERSION,
  };
}

export function getPantryDashboardWidgetHtml(): string {
  return `
<div id="pantry-dashboard-root"></div>
<style>
  :root {
    color-scheme: light;
    --pd-bg: #f0eee9;
    --pd-surface: #ffffff;
    --pd-surface-alt: #f7f7f8;
    --pd-surface-sunk: #f4f4f5;
    --pd-border: rgba(0, 0, 0, 0.08);
    --pd-border-strong: rgba(0, 0, 0, 0.14);
    --pd-ink: #0d0d0d;
    --pd-ink-soft: #3c3c43;
    --pd-muted: #6e6e73;
    --pd-muted-soft: #9a9a9f;
    --pd-accent: #5b7b4c;
    --pd-accent-soft: rgba(91, 123, 76, 0.08);
    --pd-accent-muted: rgba(91, 123, 76, 0.3);
    --pd-warn-bg: #fff7e6;
    --pd-warn-bar: #d97706;
    --pd-warn-ink: #78400a;
    --pd-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    font-family: var(--pd-sans);
    color: var(--pd-ink);
    background: var(--pd-bg);
  }

  button { font: inherit; cursor: pointer; }

  .pd-shell {
    border: 1px solid var(--pd-border);
    border-radius: 16px;
    background: var(--pd-surface);
    overflow: hidden;
    font-family: var(--pd-sans);
    color: var(--pd-ink);
  }

  .pd-body { padding: 20px 22px; }

  .pd-eyebrow {
    font-size: 11px;
    color: var(--pd-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .pd-title {
    margin: 4px 0 0;
    font-size: 20px;
    line-height: 1.25;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--pd-ink);
  }

  .pd-sub {
    margin: 6px 0 0;
    font-size: 14px;
    color: var(--pd-ink-soft);
    line-height: 1.5;
    max-width: 52ch;
  }

  .pd-section { margin-top: 22px; }

  .pd-section-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .pd-section-sub {
    font-size: 12px;
    color: var(--pd-muted);
    margin: -6px 0 8px;
    line-height: 1.45;
  }

  /* Signal chips (solid variant) */
  .pd-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--pd-accent-soft);
    color: var(--pd-accent);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .pd-chip-meta {
    font-size: 12px;
    color: var(--pd-muted);
  }

  .pd-chip svg { flex-shrink: 0; }

  /* Shop cards */
  .pd-shop {
    border: 1px solid var(--pd-border);
    border-radius: 14px;
    margin-bottom: 10px;
    overflow: hidden;
    background: var(--pd-surface);
    transition: border-color 160ms, box-shadow 160ms;
  }

  .pd-shop[data-open="true"] {
    border-color: var(--pd-accent-muted);
    box-shadow: 0 1px 3px rgba(91, 123, 76, 0.08);
  }

  .pd-shop-head {
    width: 100%;
    border: 0;
    background: transparent;
    padding: 14px 16px;
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 14px;
    align-items: center;
    text-align: left;
    font-family: var(--pd-sans);
  }

  .pd-shop[data-open="true"] .pd-shop-head {
    background: var(--pd-accent-soft);
    border-bottom: 1px solid var(--pd-accent-muted);
  }

  .pd-shop-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--pd-accent-soft);
    color: var(--pd-accent);
    display: grid;
    place-items: center;
  }

  .pd-shop[data-open="true"] .pd-shop-icon {
    background: var(--pd-accent);
    color: #fff;
  }

  .pd-shop-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--pd-ink);
    letter-spacing: -0.005em;
  }

  .pd-shop-title-meta {
    color: var(--pd-muted);
    font-weight: 400;
    margin-left: 8px;
  }

  .pd-shop-preview {
    font-size: 12px;
    color: var(--pd-muted);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pd-shop-count {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .pd-shop-count-n {
    font-size: 14px;
    font-weight: 600;
    color: var(--pd-ink);
  }

  .pd-shop-count-ago {
    font-size: 10.5px;
    color: var(--pd-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .pd-shop-chev {
    color: var(--pd-muted);
    transition: transform 160ms;
  }

  .pd-shop[data-open="true"] .pd-shop-chev {
    transform: rotate(90deg);
  }

  .pd-shop-body {
    padding: 4px 16px 12px;
  }

  /* Item row */
  .pd-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 0;
    border-top: 1px solid var(--pd-border);
  }

  .pd-row[data-done="true"] { opacity: 0.5; }

  .pd-row-name {
    font-size: 14px;
    color: var(--pd-ink);
    font-weight: 500;
  }

  .pd-row[data-done="true"] .pd-row-name {
    text-decoration: line-through;
  }

  .pd-row-qty {
    color: var(--pd-muted);
    font-weight: 400;
    margin-left: 8px;
    font-variant-numeric: tabular-nums;
  }

  .pd-row-provenance {
    font-size: 12px;
    color: var(--pd-muted);
    margin-top: 2px;
  }

  .pd-row-tag {
    font-size: 10.5px;
    color: var(--pd-muted);
    font-weight: 500;
    white-space: nowrap;
    align-self: center;
  }

  .pd-row-finish {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid var(--pd-border);
    background: var(--pd-surface);
    color: var(--pd-muted);
    display: grid;
    place-items: center;
    padding: 0;
  }

  .pd-row[data-done="true"] .pd-row-finish {
    color: var(--pd-accent);
  }

  .pd-row-finish:disabled { opacity: 0.4; cursor: progress; }

  /* Two-column grid */
  .pd-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 22px;
  }

  .pd-list-item {
    padding: 8px 0;
    border-top: 1px solid var(--pd-border);
  }

  .pd-list-name {
    font-size: 14px;
    color: var(--pd-ink);
    font-weight: 500;
  }

  .pd-list-meta {
    font-size: 12px;
    color: var(--pd-muted);
    margin-top: 1px;
  }

  .pd-list-ago {
    color: var(--pd-muted);
    font-weight: 400;
    margin-left: 8px;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }

  /* Staples strip */
  .pd-staples {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pd-staple-wrap {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: var(--pd-surface);
  }

  .pd-staple {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--pd-border);
    border-radius: 999px;
    background: var(--pd-surface);
    color: var(--pd-ink);
    font-size: 12px;
    font-family: var(--pd-sans);
    font-weight: 500;
  }

  .pd-staple-wrap .pd-staple {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: 0;
  }

  .pd-staple-remove {
    width: 28px;
    min-height: 28px;
    border: 1px solid var(--pd-border);
    border-top-right-radius: 999px;
    border-bottom-right-radius: 999px;
    background: var(--pd-surface);
    color: var(--pd-muted);
    display: inline-grid;
    place-items: center;
    padding: 0;
  }

  .pd-staple-remove:disabled { opacity: 0.45; cursor: progress; }

  .pd-staple[data-state="low"] {
    background: var(--pd-warn-bg);
    border-color: var(--pd-warn-bar);
  }

  .pd-staple[data-state="out"] {
    background: var(--pd-surface-alt);
    color: var(--pd-muted);
    text-decoration: line-through;
  }

  .pd-staple-qty {
    color: var(--pd-muted);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
  }

  .pd-staple[data-state="low"] .pd-staple-qty { color: var(--pd-warn-ink); }

  .pd-staple-edit {
    display: inline-grid;
    grid-template-columns: minmax(84px, 1fr) 72px 78px 86px auto auto;
    align-items: center;
    gap: 6px;
    padding: 5px;
    border: 1px solid var(--pd-border);
    border-radius: 10px;
    background: var(--pd-surface);
    max-width: 100%;
  }

  .pd-staple-edit-name {
    min-width: 0;
    padding: 0 4px;
    color: var(--pd-ink);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pd-staple-edit input,
  .pd-staple-edit select {
    min-width: 0;
    border: 1px solid var(--pd-border);
    border-radius: 8px;
    background: var(--pd-surface-alt);
    color: var(--pd-ink);
    font-family: var(--pd-sans);
    font-size: 12px;
    padding: 6px 7px;
  }

  .pd-staple-edit input:focus,
  .pd-staple-edit select:focus {
    outline: 2px solid rgba(103, 79, 55, 0.18);
    border-color: var(--pd-border-strong);
  }

  .pd-staple-add {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border: 1px dashed var(--pd-border-strong);
    border-radius: 999px;
    background: transparent;
    color: var(--pd-muted);
    font-size: 12px;
    font-family: var(--pd-sans);
    font-weight: 500;
  }

  .pd-staple-form {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    border: 1px solid var(--pd-border);
    border-radius: 999px;
    background: var(--pd-surface);
  }

  .pd-staple-input {
    width: 150px;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--pd-ink);
    font: inherit;
    font-size: 12px;
    padding: 4px 6px;
  }

  .pd-staple-mini {
    border: 0;
    border-radius: 999px;
    padding: 5px 8px;
    background: var(--pd-accent);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
  }

  .pd-staple-mini--ghost {
    background: var(--pd-surface-alt);
    color: var(--pd-muted);
  }

  .pd-staple-hint {
    flex-basis: 100%;
    font-size: 12px;
    color: #9b4a32;
  }

  /* Honesty footer */
  .pd-honesty {
    margin-top: 22px;
    padding: 12px 14px;
    background: var(--pd-surface-alt);
    border-radius: 10px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .pd-honesty svg { flex-shrink: 0; color: var(--pd-muted); margin-top: 2px; }

  .pd-honesty-text {
    font-size: 12px;
    color: var(--pd-ink-soft);
    line-height: 1.5;
  }

  .pd-honesty-text strong { font-weight: 600; }

  /* Footer actions */
  .pd-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--pd-border);
    flex-wrap: wrap;
  }

  .pd-footer-totals { font-size: 12px; color: var(--pd-muted); }

  .pd-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 0;
    border-radius: 10px;
    font-size: 14px;
    font-family: var(--pd-sans);
    font-weight: 500;
  }

  .pd-btn--ghost {
    border: 1px solid var(--pd-border);
    background: var(--pd-surface);
    color: var(--pd-ink);
  }

  .pd-btn--primary {
    background: var(--pd-accent);
    color: #fff;
  }

  .pd-btn:disabled { opacity: 0.55; cursor: progress; }

  .pd-error {
    margin: 0 0 12px;
    border-radius: 10px;
    padding: 10px 12px;
    background: rgba(155, 74, 50, 0.1);
    color: #9b4a32;
    font-size: 13px;
  }

  .pd-result {
    margin-top: 18px;
    border: 1px solid var(--pd-border);
    border-radius: 12px;
    background: var(--pd-surface-alt);
    padding: 14px;
  }

  .pd-result-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--pd-ink);
  }

  .pd-result-copy {
    font-size: 12px;
    line-height: 1.5;
    color: var(--pd-ink-soft);
  }

  .pd-result-list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .pd-result-item {
    padding-top: 8px;
    border-top: 1px solid var(--pd-border);
  }

  .pd-result-item:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .pd-result-item-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--pd-ink);
  }

  .pd-result-item-meta {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--pd-muted);
  }

  .pd-fallback {
    padding: 20px 22px;
    font-family: var(--pd-sans);
    color: var(--pd-ink);
  }

  @media (max-width: 620px) {
    .pd-cols { grid-template-columns: 1fr; gap: 16px; }
    .pd-shop-head { grid-template-columns: auto 1fr auto; gap: 10px; }
    .pd-shop-chev { display: none; }
    .pd-staple-edit { grid-template-columns: minmax(120px, 1fr) 70px 76px; }
    .pd-staple-edit .pd-staple-mini { min-height: 30px; }
  }
</style>
<script>
  (function () {
    var root = document.getElementById('pantry-dashboard-root');
    var hydrationTimer = null;
    var hydrationAttempts = 0;
    var lastHydratedSnapshotId = null;
    var lastHydratedSnapshotFingerprint = null;
    var MAX_HYDRATION_ATTEMPTS = 20;
    var bridgeRpcId = 0;
    var bridgeReady = null;
    var bridgePending = Object.create(null);
    var DEFAULT_STATE = {
      actionResult: null,
      errorMessage: null,
      pendingActionId: null,
      snapshot: null,
      expandedShopIndex: 0,
      doneItems: {},
      addingStaple: false,
      stapleDraftError: null,
      editingStapleId: null,
      stapleEditError: null,
      stapleEditDrafts: {},
    };

    var ICONS = {
      check: 'M20 6L9 17l-5-5',
      x: 'M18 6L6 18 M6 6l12 12',
      plus: 'M12 5v14 M5 12h14',
      arrow: 'M5 12h14 M13 6l6 6-6 6',
      info: 'M12 16v-4 M12 8h.01 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
      bag: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
      flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 17c0-1-.5-2-1-3 1 0 2 1 2 3a4 4 0 0 1-8 0 5 5 0 0 1 2-4c0 3 1 5 2.5 4.5zM14.5 12A4.5 4.5 0 0 0 17 8c-1 0-3-1-3-4 0 3-5 3-5 8a4.5 4.5 0 0 0 5.5 4',
      leaf: 'M6.05 12.04C6 14 6 16 9 19c3 0 5-1 8-4 3-3 4-10 4-10s-7 1-10 4c-3 3-4 5-4 8 0 0-1-1-1-3',
      pin: 'M12 22s-8-7-8-13a8 8 0 1 1 16 0c0 6-8 13-8 13z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
    };

    function getOpenAI() { return window.openai || {}; }
    function getSummary() { return getOpenAI().toolOutput || null; }

    function getBridgeTargets() {
      var targets = [];
      if (window.parent && window.parent !== window) targets.push(window.parent);
      try {
        if (window.top && window.top !== window && targets.indexOf(window.top) === -1) {
          targets.push(window.top);
        }
      } catch (error) {}
      return targets;
    }

    function isBridgeSource(source) {
      return getBridgeTargets().indexOf(source) !== -1;
    }

    window.addEventListener('message', function (event) {
      if (!isBridgeSource(event.source)) return;
      var message = event.data;
      if (!message || message.jsonrpc !== '2.0') return;
      if (message.method === 'ui/initialize' && message.id != null) {
        event.source.postMessage({
          jsonrpc: '2.0',
          id: message.id,
          result: { appCapabilities: {}, protocolVersion: '2026-01-26' },
        }, '*');
        bridgeNotify('ui/notifications/initialized', {});
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
        var targets = getBridgeTargets();
        if (!targets.length) {
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
        targets.forEach(function (target) { target.postMessage(message, '*'); });
      });
    }

    function bridgeNotify(method, params) {
      getBridgeTargets().forEach(function (target) {
        target.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
      });
    }

    function callToolViaBridge(name, args) {
      return bridgeRequest('tools/call', { name: name, arguments: args || {} }, 20000);
    }

    function callTool(name, args) {
      var openai = getOpenAI();
      var compatibilityCall = typeof openai.callTool === 'function' ? openai.callTool.bind(openai) : null;
      if (compatibilityCall) return compatibilityCall(name, args);
      if (getBridgeTargets().length) {
        return callToolViaBridge(name, args);
      }
      return Promise.reject(new Error('Widget tool calls are not available in this host yet.'));
    }

    function getState() {
      var s = getOpenAI().widgetState || {};
      return {
        actionResult: s.actionResult && typeof s.actionResult === 'object' ? s.actionResult : null,
        errorMessage: typeof s.errorMessage === 'string' ? s.errorMessage : null,
        pendingActionId: typeof s.pendingActionId === 'string' ? s.pendingActionId : null,
        snapshot: s.snapshot && typeof s.snapshot === 'object' ? s.snapshot : null,
        expandedShopIndex: typeof s.expandedShopIndex === 'number' ? s.expandedShopIndex : 0,
        doneItems: s.doneItems && typeof s.doneItems === 'object' ? s.doneItems : {},
        addingStaple: s.addingStaple === true,
        stapleDraftError: typeof s.stapleDraftError === 'string' ? s.stapleDraftError : null,
        editingStapleId: typeof s.editingStapleId === 'string' ? s.editingStapleId : null,
        stapleEditError: typeof s.stapleEditError === 'string' ? s.stapleEditError : null,
        stapleEditDrafts: s.stapleEditDrafts && typeof s.stapleEditDrafts === 'object' ? s.stapleEditDrafts : {}
      };
    }

    function setState(next) {
      var merged = Object.assign({}, getState(), next || {});
      getOpenAI().setWidgetState && getOpenAI().setWidgetState(merged);
      render(merged);
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function svgIcon(pathD, size, sw) {
      var s = size || 14;
      var w = sw || 1.6;
      return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"><path d="' + pathD + '"/></svg>';
    }

    function notifyHeight() {
      getOpenAI().notifyIntrinsicHeight && getOpenAI().notifyIntrinsicHeight(document.body.scrollHeight);
    }

    function toArray(value) { return Array.isArray(value) ? value : []; }

    function normalize(value) {
      if (!value || typeof value !== 'object') return null;
      if (!value.recentShops && !value.likelyOpen && !value.staples && !value.boughtRecently) return null;
      return {
        actions: toArray(value.actions).map(function (a) {
          return {
            args: a && typeof a.args === 'object' && a.args ? a.args : {},
            id: a.id,
            label: typeof a.label === 'string' ? a.label : '',
            toolName: typeof a.toolName === 'string' ? a.toolName : ''
          };
        }),
        boughtRecently: toArray(value.boughtRecently).map(function (b) {
          return {
            id: typeof b.id === 'string' ? b.id : '',
            name: typeof b.name === 'string' ? b.name : '',
            note: typeof b.note === 'string' ? b.note : null,
            daysAgo: typeof b.daysAgo === 'number' ? b.daysAgo : null
          };
        }),
        generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : null,
        headline: typeof value.headline === 'string' ? value.headline : "Here's what probably came home with you",
        honestyNote: typeof value.honestyNote === 'string' ? value.honestyNote : '',
        id: typeof value.id === 'string' ? value.id : '',
        likelyOpen: toArray(value.likelyOpen).map(function (o) {
          return {
            id: typeof o.id === 'string' ? o.id : '',
            name: typeof o.name === 'string' ? o.name : '',
            lastAppearedIn: typeof o.lastAppearedIn === 'string' ? o.lastAppearedIn : null,
            lastSeenRelative: typeof o.lastSeenRelative === 'string' ? o.lastSeenRelative : null
          };
        }),
        recentShops: toArray(value.recentShops).map(function (shop) {
          return {
            id: typeof shop.id === 'string' ? shop.id : '',
            store: typeof shop.store === 'string' ? shop.store : '',
            date: typeof shop.date === 'string' ? shop.date : '',
            daysAgo: typeof shop.daysAgo === 'number' ? shop.daysAgo : null,
            items: toArray(shop.items).map(function (it) {
              return {
                id: typeof it.id === 'string' ? it.id : '',
                name: typeof it.name === 'string' ? it.name : '',
                qty: typeof it.qty === 'string' ? it.qty : null,
                forMeal: typeof it.forMeal === 'string' ? it.forMeal : null,
                status: it.status === 'opened' ? 'opened' : 'unused'
              };
            })
          };
        }),
        staples: toArray(value.staples).map(function (s) {
          var state = s.state === 'low' || s.state === 'out' ? s.state : 'ok';
          return {
            id: typeof s.id === 'string' ? s.id : '',
            name: typeof s.name === 'string' ? s.name : '',
            qty: typeof s.qty === 'string' ? s.qty : null,
            quantity: typeof s.quantity === 'number' && isFinite(s.quantity) ? s.quantity : null,
            state: state,
            unit: typeof s.unit === 'string' ? s.unit : null
          };
        }),
        subheadline: typeof value.subheadline === 'string' ? value.subheadline : '',
        totalsLabel: typeof value.totalsLabel === 'string' ? value.totalsLabel : null
      };
    }

    function extract(candidate) {
      if (!candidate || typeof candidate !== 'object') return null;
      if (candidate.pantryDashboard) {
        var v = normalize(candidate.pantryDashboard);
        if (v) return v;
      }
      if (candidate.experience === 'pantry_dashboard') {
        var direct = normalize(candidate);
        if (direct) return direct;
      }
      var keys = ['structuredContent', 'output', 'result', 'data', 'value', 'params'];
      for (var i = 0; i < keys.length; i += 1) {
        if (candidate[keys[i]]) {
          var sub = extract(candidate[keys[i]]);
          if (sub) return sub;
        }
      }
      return null;
    }

    function getViewModel(state) {
      if (state && state.snapshot) return state.snapshot;
      return extract(getOpenAI().toolResponseMetadata)
        || extract(getSummary())
        || extract(getOpenAI().toolOutput);
    }

    function hydrateFromCandidate(candidate) {
      var next = extract(candidate);
      if (!next) return false;
      var s = getState();
      var fingerprint = '';
      try {
        fingerprint = JSON.stringify(next);
      } catch (err) {
        fingerprint = next.id || '';
      }
      if (
        fingerprint &&
        lastHydratedSnapshotFingerprint === fingerprint &&
        (lastHydratedSnapshotId === next.id || (s.snapshot && s.snapshot.id === next.id))
      ) {
        render(s.snapshot ? s : Object.assign({}, s, { snapshot: next }));
        return true;
      }
      lastHydratedSnapshotId = next.id;
      lastHydratedSnapshotFingerprint = fingerprint;
      setState({
        actionResult: s.actionResult,
        errorMessage: s.errorMessage,
        pendingActionId: s.pendingActionId,
        snapshot: next,
        expandedShopIndex: s.expandedShopIndex,
        doneItems: s.doneItems,
        addingStaple: s.addingStaple,
        stapleDraftError: s.stapleDraftError,
        editingStapleId: s.editingStapleId,
        stapleEditError: s.stapleEditError,
        stapleEditDrafts: s.stapleEditDrafts
      });
      return true;
    }

    function scheduleHydrationCheck() {
      if (hydrationTimer || hydrationAttempts >= MAX_HYDRATION_ATTEMPTS) return;
      hydrationTimer = window.setTimeout(function () {
        hydrationTimer = null;
        hydrationAttempts += 1;
        render();
      }, hydrationAttempts < 4 ? 140 : 280);
    }

    function findAction(viewModel, actionId) {
      for (var i = 0; i < viewModel.actions.length; i += 1) {
        if (viewModel.actions[i].id === actionId) return viewModel.actions[i];
      }
      return null;
    }

    function extractActionResult(candidate) {
      if (!candidate || typeof candidate !== 'object') return null;
      var payload = candidate.structuredContent && typeof candidate.structuredContent === 'object'
        ? candidate.structuredContent
        : candidate;
      if (payload.experience === 'pantry_recipe_suggestions' || payload.experience === 'pantry_plan_generation') {
        return payload;
      }
      return null;
    }

    function cloneSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return null;
      try {
        return JSON.parse(JSON.stringify(snapshot));
      } catch (err) {
        return null;
      }
    }

    function formatQuantity(quantity, unit) {
      var pieces = [];
      if (typeof quantity === 'number' && isFinite(quantity)) pieces.push(String(quantity));
      if (typeof unit === 'string' && unit.trim()) pieces.push(unit.trim());
      return pieces.length ? pieces.join(' ') : null;
    }

    function refreshLocalTotals(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return snapshot;
      var recentShops = Array.isArray(snapshot.recentShops) ? snapshot.recentShops : [];
      var staples = Array.isArray(snapshot.staples) ? snapshot.staples : [];
      var shopItemCount = recentShops.reduce(function (count, shop) {
        return count + (shop && Array.isArray(shop.items) ? shop.items.length : 0);
      }, 0);
      snapshot.totalsLabel = shopItemCount + ' recent item' + (shopItemCount === 1 ? '' : 's')
        + ' · ' + staples.length + ' staple' + (staples.length === 1 ? '' : 's');
      return snapshot;
    }

    function makeStapleDraft(staple) {
      return {
        quantity: staple && staple.quantity != null ? String(staple.quantity) : '',
        unit: staple && typeof staple.unit === 'string' ? staple.unit : '',
        state: staple && (staple.state === 'low' || staple.state === 'out') ? staple.state : 'ok'
      };
    }

    function clearStapleEditDraft(drafts, stapleId) {
      var next = Object.assign({}, drafts || {});
      if (stapleId) delete next[stapleId];
      return next;
    }

    function applyLocalMutation(snapshot, actionId, args) {
      var next = cloneSnapshot(snapshot);
      if (!next || !Array.isArray(next.staples)) return null;

      if (actionId === 'set_staple') {
        var stapleId = args && typeof args.staple_id === 'string' ? args.staple_id : '';
        var quantity = args && typeof args.staple_quantity === 'number' && isFinite(args.staple_quantity)
          ? args.staple_quantity
          : null;
        var unit = args && typeof args.staple_unit === 'string' ? args.staple_unit.trim() : '';
        var stapleState = args && (args.staple_state === 'low' || args.staple_state === 'out')
          ? args.staple_state
          : 'ok';
        next.staples = next.staples.map(function (staple) {
          if (!staple || staple.id !== stapleId) return staple;
          return Object.assign({}, staple, {
            qty: stapleState === 'out' ? 'out' : formatQuantity(quantity, unit),
            quantity: quantity,
            state: stapleState,
            unit: unit || null
          });
        });
        return refreshLocalTotals(next);
      }

      if (actionId === 'remove_staple') {
        var removeId = args && typeof args.staple_id === 'string' ? args.staple_id : '';
        next.staples = next.staples.filter(function (staple) {
          return !staple || staple.id !== removeId;
        });
        return refreshLocalTotals(next);
      }

      return null;
    }

    async function callServerAction(actionId, extraArgs) {
      var state = getState();
      var viewModel = getViewModel(state);
      if (!viewModel) return;
      var metadata = getOpenAI().toolResponseMetadata || {};
      // actions array on snapshot has no toolName (stripped in widget VM).
      // Look up the original action list from metadata/toolOutput if available.
      var metadataActions = Array.isArray(metadata.actions) ? metadata.actions : [];
      var fullVm = extract(metadata)
        || extract(getSummary())
        || extract(getOpenAI().toolOutput)
        || viewModel;
      var action = findAction(fullVm, actionId);
      if (!action || !action.toolName) {
        action = findAction({ actions: metadataActions }, actionId);
      }
      if (!action || !action.toolName) return;

      setState({
        actionResult: state.actionResult,
        errorMessage: null,
        pendingActionId: actionId,
        snapshot: state.snapshot,
        expandedShopIndex: state.expandedShopIndex,
        doneItems: state.doneItems
      });

      try {
        var args = Object.assign({}, action.args || {}, extraArgs || {});
        var response = await callTool(action.toolName, args);
        if (
          actionId === 'mark_used_up' ||
          actionId === 'undo_used_up' ||
          actionId === 'update_staple' ||
          actionId === 'set_staple' ||
          actionId === 'add_staple' ||
          actionId === 'remove_staple'
        ) {
          try {
            var refreshed = await callTool('meals_render_pantry_dashboard', {});
            hydrateFromCandidate(refreshed);
          } catch (refreshErr) {}
        }
        var current = getState();
        var localSnapshot = applyLocalMutation(current.snapshot || viewModel, actionId, args);
        setState({
          actionResult: extractActionResult(response),
          errorMessage: null,
          pendingActionId: null,
          snapshot: localSnapshot || current.snapshot,
          expandedShopIndex: current.expandedShopIndex,
          doneItems: current.doneItems,
          addingStaple: actionId === 'add_staple' ? false : current.addingStaple,
          stapleDraftError: null,
          editingStapleId: actionId === 'set_staple' || actionId === 'remove_staple' ? null : current.editingStapleId,
          stapleEditError: null,
          stapleEditDrafts: actionId === 'set_staple' || actionId === 'remove_staple'
            ? clearStapleEditDraft(current.stapleEditDrafts, args && typeof args.staple_id === 'string' ? args.staple_id : '')
            : current.stapleEditDrafts
        });
      } catch (err) {
        var cur = getState();
        setState({
          actionResult: cur.actionResult,
          errorMessage: err && err.message ? err.message : 'Could not update this dashboard right now.',
          pendingActionId: null,
          snapshot: cur.snapshot,
          expandedShopIndex: cur.expandedShopIndex,
          doneItems: cur.doneItems,
          addingStaple: cur.addingStaple,
          stapleDraftError: null,
          editingStapleId: cur.editingStapleId,
          stapleEditError: actionId === 'set_staple' ? (err && err.message ? err.message : 'Could not save this staple right now.') : cur.stapleEditError,
          stapleEditDrafts: cur.stapleEditDrafts
        });
      }
    }

    function toggleShop(index) {
      var s = getState();
      setState({
        actionResult: s.actionResult,
        errorMessage: s.errorMessage,
        pendingActionId: s.pendingActionId,
        snapshot: s.snapshot,
        expandedShopIndex: s.expandedShopIndex === index ? -1 : index,
        doneItems: s.doneItems
      });
    }

    function toggleDone(itemKey) {
      var s = getState();
      var next = Object.assign({}, s.doneItems);
      next[itemKey] = !next[itemKey];
      setState({
        actionResult: s.actionResult,
        errorMessage: s.errorMessage,
        pendingActionId: s.pendingActionId,
        snapshot: s.snapshot,
        expandedShopIndex: s.expandedShopIndex,
        doneItems: next
      });
      // Fire-and-forget server call when marking used up.
      if (next[itemKey]) {
        callServerAction('mark_used_up', { item_key: itemKey });
      } else {
        callServerAction('undo_used_up', { item_key: itemKey });
      }
    }

    function renderShop(shop, index, state) {
      var isOpen = state.expandedShopIndex === index;
      var preview = shop.items.slice(0, 3).map(function (i) { return escapeHtml(i.name); }).join(' · ')
        + (shop.items.length > 3 ? ' · +' + (shop.items.length - 3) + ' more' : '');
      var itemsHtml = '';
      if (isOpen) {
        itemsHtml = '<div class="pd-shop-body">' + shop.items.map(function (it, ii) {
          var key = it.id || (shop.id + ':' + ii);
          var done = !!state.doneItems[key];
          var pending = state.pendingActionId && state.pendingActionId.indexOf(key) !== -1;
          return [
            '<div class="pd-row" data-done="' + (done ? 'true' : 'false') + '">',
              '<div style="min-width:0">',
                '<div class="pd-row-name">' + escapeHtml(it.name),
                  it.qty ? '<span class="pd-row-qty">' + escapeHtml(it.qty) + '</span>' : '',
                '</div>',
                it.forMeal ? '<div class="pd-row-provenance">for ' + escapeHtml(it.forMeal) + '</div>' : '',
              '</div>',
              '<span class="pd-row-tag">' + (it.status === 'opened' ? 'likely opened' : 'unopened') + '</span>',
              '<button type="button" class="pd-row-finish" data-item-key="' + escapeHtml(key) + '" title="' + (done ? 'Undo' : 'Mark as used up') + '"' + (pending ? ' disabled' : '') + '>',
                svgIcon(done ? ICONS.x : ICONS.check, 13, 1.8),
              '</button>',
            '</div>'
          ].join('');
        }).join('') + '</div>';
      }
      return [
        '<div class="pd-shop" data-open="' + (isOpen ? 'true' : 'false') + '">',
          '<button type="button" class="pd-shop-head" data-shop-index="' + index + '">',
            '<div class="pd-shop-icon">' + svgIcon(ICONS.bag, 16, 2) + '</div>',
            '<div style="min-width:0">',
              '<div class="pd-shop-title">' + escapeHtml(shop.store),
                '<span class="pd-shop-title-meta">· ' + escapeHtml(shop.date) + '</span>',
              '</div>',
              '<div class="pd-shop-preview">' + preview + '</div>',
            '</div>',
            '<div class="pd-shop-count">',
              '<div class="pd-shop-count-n">' + shop.items.length + '</div>',
              shop.daysAgo != null ? '<div class="pd-shop-count-ago">' + shop.daysAgo + 'd ago</div>' : '',
            '</div>',
            '<span class="pd-shop-chev">' + svgIcon(ICONS.arrow, 14, 1.6) + '</span>',
          '</button>',
          itemsHtml,
        '</div>'
      ].join('');
    }

    function renderLikelyOpen(items) {
      if (!items.length) return '';
      return items.map(function (it) {
        var meta = [];
        if (it.lastAppearedIn) meta.push(escapeHtml(it.lastAppearedIn));
        if (it.lastSeenRelative) meta.push(escapeHtml(it.lastSeenRelative));
        return [
          '<div class="pd-list-item">',
            '<div class="pd-list-name">' + escapeHtml(it.name) + '</div>',
            meta.length ? '<div class="pd-list-meta">' + meta.join(' · ') + '</div>' : '',
          '</div>'
        ].join('');
      }).join('');
    }

    function renderBoughtRecently(items) {
      if (!items.length) return '';
      return items.map(function (it) {
        return [
          '<div class="pd-list-item">',
            '<div class="pd-list-name">' + escapeHtml(it.name),
              it.daysAgo != null ? '<span class="pd-list-ago">' + it.daysAgo + 'd ago</span>' : '',
            '</div>',
            it.note ? '<div class="pd-list-meta">' + escapeHtml(it.note) + '</div>' : '',
          '</div>'
        ].join('');
      }).join('');
    }

    function renderStaples(staples, allowUpdate, allowAdd, state) {
      var pills = staples.map(function (s) {
        var qtyText = s.state === 'out' ? 'out' : (s.qty || '') + (s.state === 'low' ? ' · low' : '');
        if (!allowUpdate) {
          return [
            '<span class="pd-staple" data-state="' + s.state + '">',
              '<span>' + escapeHtml(s.name) + '</span>',
              '<span class="pd-staple-qty">' + escapeHtml(qtyText) + '</span>',
            '</span>'
          ].join('');
        }
        if (state && state.editingStapleId === s.id) {
          var pendingSave = state.pendingActionId === 'set_staple';
          var draft = state.stapleEditDrafts && state.stapleEditDrafts[s.id]
            ? state.stapleEditDrafts[s.id]
            : makeStapleDraft(s);
          var draftState = draft.state === 'low' || draft.state === 'out' ? draft.state : 'ok';
          return [
            '<span class="pd-staple-edit" data-editing-staple-id="' + escapeHtml(s.id) + '">',
              '<span class="pd-staple-edit-name">' + escapeHtml(s.name) + '</span>',
              '<input data-staple-qty-input type="number" min="0" step="0.25" inputmode="decimal" value="' + escapeHtml(draft.quantity == null ? '' : draft.quantity) + '" aria-label="Quantity for ' + escapeHtml(s.name) + '" />',
              '<input data-staple-unit-input type="text" autocomplete="off" value="' + escapeHtml(draft.unit || '') + '" placeholder="unit" aria-label="Unit for ' + escapeHtml(s.name) + '" />',
              '<select data-staple-state-input aria-label="Pantry state for ' + escapeHtml(s.name) + '">',
                '<option value="ok"' + (draftState === 'ok' ? ' selected' : '') + '>Ok</option>',
                '<option value="low"' + (draftState === 'low' ? ' selected' : '') + '>Low</option>',
                '<option value="out"' + (draftState === 'out' ? ' selected' : '') + '>Out</option>',
              '</select>',
              '<button type="button" class="pd-staple-mini" data-action-id="set_staple_submit" data-edit-staple-id="' + escapeHtml(s.id) + '"' + (pendingSave ? ' disabled' : '') + '>Save</button>',
              '<button type="button" class="pd-staple-mini pd-staple-mini--ghost" data-action-id="set_staple_cancel">Cancel</button>',
              state.stapleEditError ? '<span class="pd-staple-hint">' + escapeHtml(state.stapleEditError) + '</span>' : '',
            '</span>'
          ].join('');
        }
        var pendingRemove = state && state.pendingActionId === 'remove_staple';
        return [
          '<span class="pd-staple-wrap">',
            '<button type="button" class="pd-staple" data-state="' + s.state + '" data-staple-id="' + escapeHtml(s.id) + '">',
              '<span>' + escapeHtml(s.name) + '</span>',
              '<span class="pd-staple-qty">' + escapeHtml(qtyText) + '</span>',
            '</button>',
            '<button type="button" class="pd-staple-remove" data-remove-staple-id="' + escapeHtml(s.id) + '" aria-label="Remove ' + escapeHtml(s.name) + ' from tracked staples"' + (pendingRemove ? ' disabled' : '') + '>',
              svgIcon(ICONS.x, 12, 2),
            '</button>',
          '</span>'
        ].join('');
      }).join('');
      if (allowAdd) {
        if (state && state.addingStaple) {
          pills += '<span class="pd-staple-form">'
            + '<input class="pd-staple-input" data-add-staple-input type="text" autocomplete="off" placeholder="Staple name" aria-label="Staple name" />'
            + '<button type="button" class="pd-staple-mini" data-action-id="add_staple_submit">Add</button>'
            + '<button type="button" class="pd-staple-mini pd-staple-mini--ghost" data-action-id="add_staple_cancel">Cancel</button>'
            + '</span>';
          if (state.stapleDraftError) {
            pills += '<span class="pd-staple-hint">' + escapeHtml(state.stapleDraftError) + '</span>';
          }
        } else {
          pills += '<button type="button" class="pd-staple-add" data-action-id="add_staple_open">'
            + svgIcon(ICONS.plus, 11, 2.2) + '<span>Add staple</span></button>';
        }
      }
      return pills;
    }

    function renderActionResult(result) {
      if (!result || typeof result !== 'object') return '';
      if (result.experience === 'pantry_recipe_suggestions') {
        var suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
        return [
          '<section class="pd-result">',
            '<div class="pd-result-title">' + escapeHtml(result.title || 'Recipe ideas') + '</div>',
            '<div class="pd-result-copy">' + (suggestions.length
              ? 'These are the strongest overlaps between your current kitchen state and your saved recipes.'
              : 'I could not find a strong pantry-led recipe suggestion yet.') + '</div>',
            suggestions.length ? '<ul class="pd-result-list">' + suggestions.map(function (entry) {
              return [
                '<li class="pd-result-item">',
                  '<div class="pd-result-item-title">' + escapeHtml(entry.recipeName || 'Recipe') + '</div>',
                  '<div class="pd-result-item-meta">' + escapeHtml(entry.matchSummary || '') + '</div>',
                '</li>',
              ].join('');
            }).join('') + '</ul>' : '',
          '</section>',
        ].join('');
      }

      if (result.experience === 'pantry_plan_generation') {
        var preview = Array.isArray(result.candidatePreview) ? result.candidatePreview : [];
        return [
          '<section class="pd-result">',
            '<div class="pd-result-title">' + escapeHtml(result.title || 'Meal-plan candidate ready') + '</div>',
            '<div class="pd-result-copy">Built a pantry-aware candidate for the week of ' + escapeHtml(result.weekStart || '') + '.</div>',
            preview.length ? '<ul class="pd-result-list">' + preview.map(function (entry, index) {
              var recipeNames = Array.isArray(entry.recipeNamePreview) ? entry.recipeNamePreview.join(' · ') : '';
              return [
                '<li class="pd-result-item">',
                  '<div class="pd-result-item-title">Candidate ' + escapeHtml(index + 1) + '</div>',
                  '<div class="pd-result-item-meta">' + escapeHtml(recipeNames || 'Recipe preview unavailable') + '</div>',
                '</li>',
              ].join('');
            }).join('') + '</ul>' : '',
          '</section>',
        ].join('');
      }

      return '';
    }

    function bindHandlers(state) {
      var shopHeads = root.querySelectorAll('[data-shop-index]');
      for (var i = 0; i < shopHeads.length; i += 1) {
        shopHeads[i].addEventListener('click', function (e) {
          toggleShop(parseInt(e.currentTarget.getAttribute('data-shop-index'), 10));
        });
      }
      var finishes = root.querySelectorAll('[data-item-key]');
      for (var j = 0; j < finishes.length; j += 1) {
        finishes[j].addEventListener('click', function (e) {
          toggleDone(e.currentTarget.getAttribute('data-item-key'));
        });
      }
      var actions = root.querySelectorAll('[data-action-id]');
      for (var k = 0; k < actions.length; k += 1) {
        actions[k].addEventListener('click', function (e) {
          var actionId = e.currentTarget.getAttribute('data-action-id');
          if (actionId === 'add_staple_open') {
            setState({ addingStaple: true, stapleDraftError: null, editingStapleId: null, stapleEditError: null });
            return;
          }
          if (actionId === 'add_staple_cancel') {
            setState({ addingStaple: false, stapleDraftError: null });
            return;
          }
          if (actionId === 'add_staple_submit') {
            submitAddStaple();
            return;
          }
          if (actionId === 'set_staple_cancel') {
            var cancelState = getState();
            setState({
              editingStapleId: null,
              stapleEditError: null,
              stapleEditDrafts: clearStapleEditDraft(cancelState.stapleEditDrafts, cancelState.editingStapleId)
            });
            return;
          }
          if (actionId === 'set_staple_submit') {
            submitSetStaple(e.currentTarget.getAttribute('data-edit-staple-id'));
            return;
          }
          callServerAction(actionId);
        });
      }
      var input = root.querySelector('[data-add-staple-input]');
      if (input) {
        input.focus();
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitAddStaple();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setState({ addingStaple: false, stapleDraftError: null });
          }
        });
      }
      var staples = root.querySelectorAll('[data-staple-id]');
      for (var m = 0; m < staples.length; m += 1) {
        staples[m].addEventListener('click', function (e) {
          var stapleId = e.currentTarget.getAttribute('data-staple-id');
          var viewModel = getViewModel(getState());
          var selected = null;
          if (viewModel && Array.isArray(viewModel.staples)) {
            for (var si = 0; si < viewModel.staples.length; si += 1) {
              if (viewModel.staples[si] && viewModel.staples[si].id === stapleId) {
                selected = viewModel.staples[si];
                break;
              }
            }
          }
          var current = getState();
          var nextDrafts = Object.assign({}, current.stapleEditDrafts || {});
          nextDrafts[stapleId] = makeStapleDraft(selected);
          setState({
            addingStaple: false,
            stapleDraftError: null,
            editingStapleId: stapleId,
            stapleEditError: null,
            stapleEditDrafts: nextDrafts
          });
        });
      }
      var removeStaples = root.querySelectorAll('[data-remove-staple-id]');
      for (var r = 0; r < removeStaples.length; r += 1) {
        removeStaples[r].addEventListener('click', function (e) {
          callServerAction('remove_staple', { staple_id: e.currentTarget.getAttribute('data-remove-staple-id') });
        });
      }
      var editWrap = root.querySelector('[data-editing-staple-id]');
      if (editWrap) {
        var editStapleId = editWrap.getAttribute('data-editing-staple-id');
        var editInputs = editWrap.querySelectorAll('[data-staple-qty-input], [data-staple-unit-input], [data-staple-state-input]');
        for (var ei = 0; ei < editInputs.length; ei += 1) {
          editInputs[ei].addEventListener('input', function () { updateStapleDraft(editStapleId); });
          editInputs[ei].addEventListener('change', function () { updateStapleDraft(editStapleId); });
        }
      }
    }

    function updateStapleDraft(stapleId) {
      if (!stapleId) return;
      var qtyInput = root.querySelector('[data-staple-qty-input]');
      var unitInput = root.querySelector('[data-staple-unit-input]');
      var stateInput = root.querySelector('[data-staple-state-input]');
      var current = getState();
      var nextDrafts = Object.assign({}, current.stapleEditDrafts || {});
      nextDrafts[stapleId] = {
        quantity: qtyInput && typeof qtyInput.value === 'string' ? qtyInput.value : '',
        unit: unitInput && typeof unitInput.value === 'string' ? unitInput.value : '',
        state: stateInput && stateInput.value ? stateInput.value : 'ok'
      };
      getOpenAI().setWidgetState && getOpenAI().setWidgetState(Object.assign({}, current, { stapleEditDrafts: nextDrafts }));
    }

    function submitSetStaple(stapleId) {
      var qtyInput = root.querySelector('[data-staple-qty-input]');
      var unitInput = root.querySelector('[data-staple-unit-input]');
      var stateInput = root.querySelector('[data-staple-state-input]');
      var draft = getState().stapleEditDrafts && getState().stapleEditDrafts[stapleId]
        ? getState().stapleEditDrafts[stapleId]
        : null;
      var rawQty = draft && typeof draft.quantity === 'string'
        ? draft.quantity.trim()
        : (qtyInput && qtyInput.value ? qtyInput.value.trim() : '');
      var quantity = rawQty ? Number(rawQty) : null;
      if (rawQty && (!isFinite(quantity) || quantity < 0)) {
        setState({ editingStapleId: stapleId, stapleEditError: 'Use a zero or positive quantity.' });
        return;
      }
      callServerAction('set_staple', {
        staple_id: stapleId,
        staple_quantity: quantity,
        staple_unit: draft && typeof draft.unit === 'string'
          ? draft.unit.trim()
          : (unitInput && unitInput.value ? unitInput.value.trim() : ''),
        staple_state: draft && draft.state ? draft.state : (stateInput && stateInput.value ? stateInput.value : 'ok')
      });
    }

    function submitAddStaple() {
      var input = root.querySelector('[data-add-staple-input]');
      var stapleName = input && input.value ? input.value.trim() : '';
      if (!stapleName) {
        setState({ addingStaple: true, stapleDraftError: 'Enter a staple name first.' });
        return;
      }
      callServerAction('add_staple', { staple_name: stapleName });
    }

    function renderFallback(summary) {
      var title = (summary && summary.title) || 'Pantry dashboard';
      root.innerHTML = '<div class="pd-fallback"><div class="pd-eyebrow">Kitchen</div>'
        + '<div class="pd-title">' + escapeHtml(title) + '</div>'
        + '<p class="pd-sub">Loading your recent shops and pantry signals…</p></div>';
      notifyHeight();
    }

    function render(overrideState) {
      var state = overrideState || getState();
      var viewModel = getViewModel(state);
      var summary = getSummary();

      if (!viewModel) {
        renderFallback(summary);
        scheduleHydrationCheck();
        return;
      }

      hydrationAttempts = 0;
      var shopTotal = viewModel.recentShops.reduce(function (a, s) { return a + s.items.length; }, 0);
      var totalItems = shopTotal + viewModel.likelyOpen.length + viewModel.boughtRecently.length + viewModel.staples.length;
      var suggestAction = findAction(viewModel, 'suggest_recipes');
      var planAction = findAction(viewModel, 'plan_meals');

      var updateStapleAction = findAction(viewModel, 'update_staple');
      var setStapleAction = findAction(viewModel, 'set_staple');
      var addStapleAction = findAction(viewModel, 'add_staple');
      var suggestBtn = suggestAction
        ? '<button type="button" class="pd-btn pd-btn--ghost" data-action-id="suggest_recipes">' + svgIcon(ICONS.info, 14, 1.6) + '<span>' + escapeHtml(suggestAction.label) + '</span></button>'
        : '';
      var planBtn = planAction
        ? '<button type="button" class="pd-btn pd-btn--primary" data-action-id="plan_meals"><span>' + escapeHtml(planAction.label) + '</span>' + svgIcon(ICONS.arrow, 14, 2) + '</button>'
        : '';

      root.innerHTML = [
        '<article class="pd-shell"><div class="pd-body">',
          state.errorMessage ? '<p class="pd-error">' + escapeHtml(state.errorMessage) + '</p>' : '',
          '<div class="pd-eyebrow">' + escapeHtml(viewModel.subheadline || 'Kitchen · grounded in your recent shops & plans') + '</div>',
          '<div class="pd-title">' + escapeHtml(viewModel.headline) + '</div>',
          '<p class="pd-sub">I can\\'t see your fridge, but I can track what got bought, what appeared in plans, and roughly how long it\\'s been sitting around.</p>',

          // Hero: bought for recent meals
          '<section class="pd-section">',
            '<div class="pd-section-head">',
              '<span class="pd-chip">' + svgIcon(ICONS.bag, 10, 2.2) + '<span>Bought for recent meals</span></span>',
              '<span class="pd-chip-meta">' + shopTotal + ' items across ' + viewModel.recentShops.length + ' shop' + (viewModel.recentShops.length === 1 ? '' : 's') + '</span>',
            '</div>',
            viewModel.recentShops.map(function (shop, i) { return renderShop(shop, i, state); }).join(''),
          '</section>',

          // Two columns
          '<div class="pd-cols">',
            '<section>',
              '<div class="pd-section-head"><span class="pd-chip">' + svgIcon(ICONS.flame, 10, 2.2) + '<span>Likely open</span></span></div>',
              '<div class="pd-section-sub">Last appeared in a cooked meal — may still be in the cupboard.</div>',
              '<div>' + renderLikelyOpen(viewModel.likelyOpen) + '</div>',
            '</section>',
            '<section>',
              '<div class="pd-section-head"><span class="pd-chip">' + svgIcon(ICONS.leaf, 10, 2.2) + '<span>Bought recently, still likely around</span></span></div>',
              '<div class="pd-section-sub">Came home in the last week or two and hasn\\'t shown up in a plan yet.</div>',
              '<div>' + renderBoughtRecently(viewModel.boughtRecently) + '</div>',
            '</section>',
          '</div>',

          // Staples strip
          '<section class="pd-section">',
            '<div class="pd-section-head">',
              '<span class="pd-chip">' + svgIcon(ICONS.pin, 10, 2.2) + '<span>You tell me</span></span>',
              '<span class="pd-chip-meta">Staples you track by hand</span>',
            '</div>',
            '<div class="pd-section-sub">' + (updateStapleAction || setStapleAction || addStapleAction
              ? 'The handful of items too common to ground from receipts. Tap to edit quantity, unit, or state.'
              : 'The handful of items too common to ground from receipts.') + '</div>',
            '<div class="pd-staples">' + renderStaples(viewModel.staples, !!(updateStapleAction || setStapleAction), !!addStapleAction, state) + '</div>',
          '</section>',

          renderActionResult(state.actionResult),

          // Honesty note
          '<div class="pd-honesty">',
            svgIcon(ICONS.info, 14, 1.6),
            '<div class="pd-honesty-text">' + (viewModel.honestyNote
              ? escapeHtml(viewModel.honestyNote)
              : 'These are estimates from <strong>your receipts, meal plans, and recipe history</strong> — not your physical fridge. Mark items as used up when I\\'m wrong and I\\'ll get better at this.') + '</div>',
          '</div>',

          // Footer
          '<div class="pd-footer">',
            '<span class="pd-footer-totals">' + (viewModel.totalsLabel
              ? escapeHtml(viewModel.totalsLabel)
              : (totalItems + ' items tracked · ' + viewModel.recentShops.length + ' recent shop' + (viewModel.recentShops.length === 1 ? '' : 's'))) + '</span>',
            '<div class="pd-actions">' + suggestBtn + planBtn + '</div>',
          '</div>',

        '</div></article>'
      ].join('');

      bindHandlers(state);
      notifyHeight();
    }

    window.addEventListener('openai:set_globals', function () {
      if (!hydrateFromCandidate(getOpenAI().toolOutput) && !hydrateFromCandidate(getOpenAI().toolResponseMetadata)) {
        render();
      }
    }, { passive: true });

    window.addEventListener('message', function (event) {
      if (!isBridgeSource(event.source)) return;
      var message = event.data;
      if (!message || message.jsonrpc !== '2.0') return;
      if (message.method === 'ui/notifications/tool-result' || message.method === 'ui/notifications/tool-input') {
        if (!hydrateFromCandidate(message)) render();
      }
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') render();
    }, { passive: true });

    render(DEFAULT_STATE);
  })();
</script>`.trim();
}
