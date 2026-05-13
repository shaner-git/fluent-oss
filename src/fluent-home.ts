import { createHash } from 'node:crypto';
import { summarizeHealthContext, summarizeHealthTodayContext, type HealthService } from './domains/health/service';
import { MEALS_GROCERY_LIST_TEMPLATE_URI } from './domains/meals/grocery-list';
import {
  summarizeCurrentGroceryList,
  summarizeMealPlan,
  type CurrentGroceryListRecord,
  type InventorySummary,
  type MealMemoryRecord,
  type MealPlanRecord,
  type MealsService,
} from './domains/meals/service';
import { summarizeStyleContext, type StyleService } from './domains/style/service';
import type { StyleContextRecord } from './domains/style/types';
import type { FluentAccountAccessState, FluentCoreService, FluentDomainRecord } from './fluent-core';

export const FLUENT_HOME_LEGACY_TEMPLATE_URI = 'ui://widget/fluent-home-v10.html';
export const FLUENT_HOME_COMPAT_TEMPLATE_URI = 'ui://widget/fluent-home-v11.html';
export const FLUENT_HOME_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-home-v12.html';
export const FLUENT_HOME_RECENT_TEMPLATE_URI = 'ui://widget/fluent-home-v13.html';
export const FLUENT_HOME_CACHED_TEMPLATE_URI = 'ui://widget/fluent-home-v14.html';
export const FLUENT_HOME_REVIEW_TEMPLATE_URI = 'ui://widget/fluent-home-v15.html';
export const FLUENT_HOME_CANARY_TEMPLATE_URI = 'ui://widget/fluent-home-v16.html';
export const FLUENT_HOME_LIVE_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-home-v17.html';
export const FLUENT_HOME_ACTIONS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-home-v18.html';
export const FLUENT_HOME_DIRECT_ACTIONS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-home-v19.html';
export const FLUENT_HOME_MODAL_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-home-v20.html';
export const FLUENT_HOME_TEMPLATE_URI = 'ui://widget/fluent-home-v21.html';
export const FLUENT_HOME_WIDGET_VERSION = 'v21';

type HomeDomainId = 'meals' | 'style' | 'health';
type HomeDomainStatus = 'ready' | 'available' | 'onboarding' | 'disabled';

export interface FluentHomeViewModel {
  account: {
    access: string;
    displayName: string | null;
    entitlement: string | null;
    timezone: string;
  };
  domains: Array<{
    domain: HomeDomainId;
    label: string;
    status: HomeDomainStatus;
    summary: string;
  }>;
  memory: {
    meals: {
      currentPlan: string | null;
      groceryReadiness: string | null;
      inventory: string;
      mealMemory: string;
    };
    style: {
      closet: string;
      coverage: string;
      purchaseAnalysisReady: boolean;
      styleSignals: string[];
    };
    health: {
      activeBlock: string | null;
      today: string | null;
      trainingSupport: string;
    };
  };
  suggestedActions: Array<{
    label: string;
    domain: HomeDomainId;
    targetSurfaceId: string;
    targetToolName: string;
    args: Record<string, unknown>;
    richSurfaceAvailable: boolean;
    handoffPrompt?: string;
    presentationMode: 'modal' | 'text_handoff' | 'inline_fallback';
    templateUri?: string;
    toolName: string;
  }>;
  textFallback: string;
  version: string;
}

export interface FluentHomeServices {
  fluentCore: FluentCoreService;
  health: HealthService;
  meals: MealsService;
  style: StyleService;
}

export async function buildFluentHomeViewModel(services: FluentHomeServices): Promise<FluentHomeViewModel> {
  const [capabilities, accountStatus] = await Promise.all([
    services.fluentCore.getCapabilities(),
    services.fluentCore.getAccountStatus(),
  ]);
  const domainStatuses = buildDomainReadiness(capabilities.availableDomains);
  const readyDomains = new Set(capabilities.readyDomains);

  const [mealsSnapshot, styleSnapshot, healthSnapshot] = await Promise.all([
    readyDomains.has('meals')
      ? safeSnapshot(() => buildMealsMemorySnapshot(services.meals), fallbackMealsMemory('I could not refresh Meals just now.'))
      : null,
    readyDomains.has('style')
      ? safeSnapshot(() => buildStyleMemorySnapshot(services.style), fallbackStyleMemory('I could not refresh Style just now.'))
      : null,
    readyDomains.has('health')
      ? safeSnapshot(() => buildHealthMemorySnapshot(services.health), fallbackHealthMemory('I could not refresh Health just now.'))
      : null,
  ]);

  const home: Omit<FluentHomeViewModel, 'textFallback'> = {
    account: {
      access: capabilities.deploymentTrack === 'cloud' ? accountStatus.accessState : 'local',
      displayName: capabilities.profile.displayName,
      entitlement: capabilities.deploymentTrack === 'cloud' ? accountStatus.entitlement.state : null,
      timezone: capabilities.profile.timezone,
    },
    domains: domainStatuses,
    memory: {
      meals: mealsSnapshot ?? fallbackMealsMemory('Meals is not ready yet.'),
      style: styleSnapshot ?? fallbackStyleMemory('Style is not ready yet.'),
      health: healthSnapshot ?? fallbackHealthMemory('Health is not ready yet.'),
    },
    suggestedActions: buildSuggestedActions(readyDomains, healthSnapshot),
    version: FLUENT_HOME_WIDGET_VERSION,
  };

  return {
    ...home,
    textFallback: buildHomeTextFallback(home),
  };
}

export function buildFluentHomeMetadata(viewModel: FluentHomeViewModel) {
  return {
    experience: 'fluent_home',
    home: viewModel,
    version: FLUENT_HOME_WIDGET_VERSION,
  };
}

export function buildFluentHomeWidgetMeta(origin: string) {
  return {
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: [],
    },
    'openai/widgetDescription':
      'Fluent Home check-in with meals, style, and health context for the current account.',
    'openai/widgetDomain': origin,
    'openai/widgetPrefersBorder': true,
    ui: {
      csp: {
        connectDomains: [],
        resourceDomains: [],
      },
      domain: `${createHash('sha256').update(origin).digest('hex').slice(0, 32)}.claudemcpcontent.com`,
      prefersBorder: true,
    },
  } as const;
}

export function getFluentHomeWidgetHtml() {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root {
      color-scheme: light;
      --home-surface: #ffffff;
      --home-surface-alt: #f7f7f8;
      --home-border: rgba(0, 0, 0, 0.08);
      --home-text: #0d0d0d;
      --home-muted: #6e6e73;
      --home-soft: #3c3c43;
      --home-accent: #2563eb;
      --home-accent-soft: rgba(47, 111, 235, 0.10);
      --home-warn-bg: #fff7e6;
      --home-warn-ink: #78400a;
      --home-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 22px rgba(0, 0, 0, 0.04);
      --home-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: transparent; color: var(--home-text); font-family: var(--home-sans); }
    button { font: inherit; }
    .home-card {
      margin: 0;
      padding: 18px 20px;
      border: 1px solid var(--home-border);
      border-radius: 16px;
      background: var(--home-surface);
      box-shadow: var(--home-shadow);
      display: grid;
      gap: 16px;
    }
    .home-header {
      display: grid;
      gap: 12px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--home-border);
    }
    .home-header-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .home-kicker {
      margin: 0 0 4px;
      color: var(--home-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .home-title { margin: 0; font-size: 20px; line-height: 1.25; font-weight: 600; letter-spacing: 0; }
    .home-subtitle { margin: 6px 0 0; color: var(--home-soft); font-size: 13px; line-height: 1.45; }
    .home-pills { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .home-pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 5px 9px;
      border: 1px solid var(--home-border);
      border-radius: 8px;
      background: var(--home-surface-alt);
      color: var(--home-soft);
      font-size: 12px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .home-priority {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 14px 0 15px;
      border-top: 1px solid var(--home-border);
      border-bottom: 1px solid var(--home-border);
      background: var(--home-surface);
    }
    .home-priority-copy { min-width: 0; display: grid; gap: 4px; }
    .home-priority-kicker { margin: 0; color: var(--home-muted); font-size: 11px; line-height: 1.2; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .home-priority-title { margin: 0; font-size: 16px; line-height: 1.25; font-weight: 650; }
    .home-priority-body { margin: 0; color: var(--home-soft); font-size: 13px; line-height: 1.45; }
    .home-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; border-bottom: 1px solid var(--home-border); padding-bottom: 14px; }
    .home-panel {
      min-width: 0;
      border: 0;
      border-radius: 0;
      background: var(--home-surface);
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .home-panel-title { margin: 0; font-size: 14px; line-height: 1.2; font-weight: 600; }
    .home-line { margin: 0; color: var(--home-soft); font-size: 13px; line-height: 1.45; }
    .home-line strong { color: var(--home-text); font-weight: 600; }
    .home-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .home-action {
      min-height: 40px;
      padding: 8px 12px;
      border: 1px solid var(--home-border);
      border-radius: 10px;
      background: var(--home-surface);
      color: var(--home-text);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    .home-action-primary {
      min-width: 156px;
      justify-content: center;
      border-color: #0d0d0d;
      background: #0d0d0d;
      color: #ffffff;
    }
    .home-action[data-active="true"] { border-color: #2458bd; background: #2458bd; color: #ffffff; }
    .home-action-primary[data-active="true"] { border-color: #2458bd; background: #2458bd; color: #ffffff; }
    .home-action:focus-visible, .home-detail:focus-visible {
      outline: 3px solid rgba(47, 111, 235, 0.34);
      outline-offset: 2px;
    }
    .home-action:disabled { opacity: 0.62; cursor: progress; }
    .home-detail {
      border: 1px solid var(--home-border);
      border-radius: 12px;
      background: var(--home-surface-alt);
      padding: 14px 16px;
      display: grid;
      gap: 12px;
    }
    .home-detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .home-detail-title { margin: 0; font-size: 14px; line-height: 1.2; font-weight: 600; }
    .home-detail-meta { color: var(--home-muted); font-size: 12px; line-height: 1.35; }
    .home-list-section { display: grid; gap: 6px; }
    .home-list-title { margin: 0; color: var(--home-muted); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .home-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
    .home-list-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 8px 0; border-top: 1px solid var(--home-border); font-size: 13px; line-height: 1.4; }
    .home-list-item:first-child { border-top: 0; }
    .home-item-name { color: var(--home-text); font-weight: 500; }
    .home-item-note { color: var(--home-muted); font-size: 12px; margin-top: 1px; }
    .home-quantity { color: var(--home-muted); white-space: nowrap; }
    .home-warning { border: 1px solid rgba(217, 119, 6, 0.18); border-radius: 10px; background: var(--home-warn-bg); color: var(--home-warn-ink); padding: 9px 10px; font-size: 12px; line-height: 1.4; }
    .home-status { color: var(--home-muted); font-size: 12px; line-height: 1.45; }
    .home-status[data-tone="error"] { color: #9b4a32; }
    @media (max-width: 720px) {
      .home-header-top { display: grid; }
      .home-pills { justify-content: flex-start; }
      .home-priority { grid-template-columns: 1fr; }
      .home-grid { grid-template-columns: 1fr; }
      .home-action-primary { width: 100%; }
      .home-detail-head { display: grid; }
    }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const app = document.getElementById('app');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const callableTools = new Set(['meals_render_grocery_list_v2', 'health_get_today_context']);
    let pendingActionIndex = null;
    let activeDetail = null;
    let bridgeRpcId = 0;
    const bridgePending = Object.create(null);

    function getOpenAI() { return window.openai || {}; }
    function getBridgeTargets() {
      const targets = [];
      if (window.parent && window.parent !== window) targets.push(window.parent);
      try {
        if (window.top && window.top !== window && targets.indexOf(window.top) === -1) targets.push(window.top);
      } catch (error) {}
      return targets;
    }
    function isBridgeSource(source) { return getBridgeTargets().indexOf(source) !== -1; }
    window.addEventListener('message', function (event) {
      if (!isBridgeSource(event.source)) return;
      const message = event.data;
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
      const pending = bridgePending[message.id];
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
        const targets = getBridgeTargets();
        if (!targets.length) {
          reject(new Error('MCP Apps bridge is not available.'));
          return;
        }
        const id = ++bridgeRpcId;
        bridgePending[id] = {
          resolve,
          reject,
          timer: window.setTimeout(function () {
            delete bridgePending[id];
            reject(new Error('MCP Apps bridge request timed out.'));
          }, timeoutMs || 12000),
        };
        const message = { jsonrpc: '2.0', id, method, params };
        targets.forEach(function (target) { target.postMessage(message, '*'); });
      });
    }
    function bridgeNotify(method, params) {
      getBridgeTargets().forEach(function (target) {
        target.postMessage({ jsonrpc: '2.0', method, params: params || {} }, '*');
      });
    }
    function callTool(name, args) {
      const openai = getOpenAI();
      if (typeof openai.callTool === 'function') return openai.callTool(name, args || {});
      if (getBridgeTargets().length) {
        return bridgeRequest('tools/call', { name, arguments: args || {} }, 20000);
      }
      return Promise.reject(new Error('Widget tool calls are not available in this host yet.'));
    }
    function getHome() {
      const data = getOpenAI().toolOutput ?? getOpenAI().toolResponse ?? {};
      const structured = data.structuredContent ?? data;
      return structured.home ?? data.home ?? structured;
    }
    function canInvoke(action) {
      return action && callableTools.has(action.toolName);
    }
    function displayName(name) {
      const value = String(name || '').trim();
      if (!value) return '';
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    function displayTimezone(zone) {
      const value = String(zone || '').trim();
      if (!value) return '';
      const parts = value.split('/');
      return (parts[parts.length - 1] || value).replace(/_/g, ' ') + ' time';
    }
    function describeAccountAccess(access) {
      if (access === 'active') return 'Signed in';
      if (access === 'limited') return 'Limited access';
      if (access === 'pending') return 'Pending access';
      if (access === 'unavailable') return 'Access unavailable';
      if (access === 'local') return 'Local profile';
      return 'Access check needed';
    }
    function renderAction(action, index) {
      if (canInvoke(action)) {
        const pending = pendingActionIndex === index;
        const active = activeDetail && activeDetail.index === index;
        return '<button type="button" class="home-action" data-active="' + (active ? 'true' : 'false') + '" aria-pressed="' + (active ? 'true' : 'false') + '" data-action-index="' + index + '"' + (pending ? ' disabled' : '') + '>' + esc(pending ? 'Loading...' : action.label) + '</button>';
      }
      return '';
    }
    function renderPrimaryAction(action, index) {
      if (!canInvoke(action)) return '';
      const pending = pendingActionIndex === index;
      const active = activeDetail && activeDetail.index === index;
      return '<button type="button" class="home-action home-action-primary" data-active="' + (active ? 'true' : 'false') + '" aria-pressed="' + (active ? 'true' : 'false') + '" data-action-index="' + index + '"' + (pending ? ' disabled' : '') + '>' + esc(pending ? 'Opening...' : action.label) + '</button>';
    }
    function normalizeToolResult(result) {
      if (!result || typeof result !== 'object') return {};
      if (result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
      return result;
    }
    function normalizeToolMetadata(result) {
      if (!result || typeof result !== 'object') return {};
      if (result._meta && typeof result._meta === 'object') return result._meta;
      if (result.toolResponseMetadata && typeof result.toolResponseMetadata === 'object') return result.toolResponseMetadata;
      return {};
    }
    async function requestDedicatedSurface(action, payload, metadata) {
      const openai = getOpenAI();
      if (!action || !action.templateUri || typeof openai.requestModal !== 'function') return false;
      const safePayload = payload || {};
      const safeMetadata = metadata && Object.keys(metadata).length ? metadata : safePayload;
      try {
        await openai.requestModal({
          template: action.templateUri,
          params: {
            ...safePayload,
            structuredContent: safePayload,
            toolOutput: safePayload,
            toolResponseMetadata: safeMetadata,
          },
        });
        return true;
      } catch (error) {
        return false;
      }
    }
    function openedMessage(action, handedToChat) {
      if (action && action.domain === 'health') {
        return handedToChat ? "Asking ChatGPT to show today's training." : "Showing today's training.";
      }
      if (action && action.domain === 'meals') {
        return handedToChat ? 'Asking ChatGPT to open the Grocery List surface.' : 'Opening the Grocery List surface.';
      }
      return handedToChat ? 'Asking ChatGPT to continue in Fluent.' : 'Opening the focused Fluent surface.';
    }
    function sendHostMessage(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return false;
      try {
        const openai = getOpenAI();
        if (typeof openai.sendMessage === 'function') {
          openai.sendMessage({ role: 'user', content: [{ type: 'text', text: trimmed }] });
          return true;
        }
        if (getBridgeTargets().length) {
          bridgeNotify('ui/message', { role: 'user', content: [{ type: 'text', text: trimmed }] });
          return true;
        }
      } catch (error) {}
      return false;
    }
    function firstBucket(list, id) {
      const buckets = list && Array.isArray(list.buckets) ? list.buckets : [];
      return buckets.find(function (bucket) { return bucket && bucket.id === id; }) || null;
    }
    function renderItems(items, emptyText) {
      const rows = Array.isArray(items) ? items.slice(0, 6) : [];
      if (!rows.length) return '<p class="home-line">' + esc(emptyText) + '</p>';
      return '<ul class="home-list">' + rows.map(function (item) {
        return '<li class="home-list-item"><div><div class="home-item-name">' + esc(item.displayName || 'Item') + '</div>' +
          (item.detail ? '<div class="home-item-note">' + esc(item.detail) + '</div>' : '') +
          '</div><div class="home-quantity">' + esc(item.quantityDisplay || '') + '</div></li>';
      }).join('') + '</ul>';
    }
    function renderGroceryDetail(payload) {
      const list = payload.groceryList || payload;
      const buy = firstBucket(list, 'need_to_buy');
      const verify = firstBucket(list, 'verify_pantry');
      const summary = list.summary || {};
      const stale = Array.isArray(list.staleReasons) && list.staleReasons.length ? list.staleReasons[0] : null;
      return '<section id="home-detail" class="home-detail" aria-label="Grocery list" aria-live="polite" role="status" tabindex="-1">' +
        '<div class="home-detail-head"><h2 class="home-detail-title">' + esc(list.title || 'Grocery list') + '</h2><div class="home-detail-meta">' + esc(summary.headline || list.subtitle || '') + '</div></div>' +
        (stale ? '<div class="home-warning">' + esc(stale) + '</div>' : '') +
        '<div class="home-list-section"><h3 class="home-list-title">To buy</h3>' + renderItems(buy && buy.items, 'Nothing left to buy.') + '</div>' +
        '<div class="home-list-section"><h3 class="home-list-title">Check at home</h3>' + renderItems(verify && verify.items, 'No pantry checks right now.') + '</div>' +
        '</section>';
    }
    function renderTrainingDetail(payload) {
      const session = payload.resolvedSession || payload.projectedSession || {};
      const block = payload.activeBlock || {};
      const title = session.title || 'No training planned for today';
      const status = session.status ? 'Status: ' + session.status : '';
      const date = payload.date || session.date || '';
      const workoutCount = payload.loggedWorkoutCount || 0;
      const workoutCopy = workoutCount
        ? 'Recent training can guide the next session.'
        : 'Your next workout log will make coaching sharper.';
      const goalCount = payload.activeGoalCount || 0;
      const goalCopy = goalCount
        ? 'Your goals are ready for the current block.'
        : 'Set a goal when you want sharper coaching context.';
      return '<section id="home-detail" class="home-detail" aria-label="Today training" aria-live="polite" role="status" tabindex="-1">' +
        '<div class="home-detail-head"><h2 class="home-detail-title">' + esc(title) + '</h2><div class="home-detail-meta">' + esc(date) + '</div></div>' +
        '<p class="home-line"><strong>Training plan:</strong> ' + esc(block.daysPerWeek ? block.daysPerWeek + ' days/week' : 'No active training plan') + '</p>' +
        '<p class="home-line"><strong>Recent training:</strong> ' + esc(workoutCopy) + '</p>' +
        '<p class="home-line"><strong>Coaching context:</strong> ' + esc(goalCopy) + (status ? ' ' + esc(status.replace(/^Status: /, '')) + '.' : '') + '</p>' +
        '</section>';
    }
    function actionDetailType(action) {
      if (!action) return null;
      if (action.toolName === 'meals_render_grocery_list_v2') return 'grocery';
      if (action.toolName === 'health_get_today_context') return 'training';
      return null;
    }
    function renderDetail() {
      if (!activeDetail) return '';
      if (activeDetail.error) {
        return '<section id="home-detail" class="home-detail" aria-live="polite" tabindex="-1"><div class="home-status" data-tone="error" role="status">' + esc(activeDetail.error) + '</div></section>';
      }
      if (activeDetail.type === 'opened') {
        const fallback = activeDetail.fallbackPrompt
          ? '<div class="home-status">If it does not appear, ask: ' + esc(activeDetail.fallbackPrompt) + '</div>'
          : '';
        return '<section id="home-detail" class="home-detail" aria-live="polite" role="status" tabindex="-1"><div class="home-status">' + esc(activeDetail.message || 'Opening the focused Fluent surface.') + '</div>' + fallback + '</section>';
      }
      if (activeDetail.type === 'grocery') return renderGroceryDetail(activeDetail.payload || {});
      if (activeDetail.type === 'training') return renderTrainingDetail(activeDetail.payload || {});
      return '';
    }
    async function runAction(index) {
      const home = getHome();
      const action = (home.suggestedActions || [])[index];
      if (!canInvoke(action) || pendingActionIndex !== null) return;
      pendingActionIndex = index;
      render();
      try {
        const result = await callTool(action.toolName, action.args || {});
        const payload = normalizeToolResult(result);
        const metadata = normalizeToolMetadata(result);
        const openedDedicatedSurface = await requestDedicatedSurface(action, payload, metadata);
        const detailType = actionDetailType(action);
        const handedToChat = openedDedicatedSurface || detailType ? false : sendHostMessage(action.handoffPrompt);
        activeDetail = {
          index,
          type: openedDedicatedSurface || handedToChat ? 'opened' : detailType || 'opened',
          fallbackPrompt: action.handoffPrompt,
          message: openedDedicatedSurface || handedToChat ? openedMessage(action, handedToChat) : undefined,
          payload,
        };
      } catch (error) {
        activeDetail = { index, error: (error && error.message) || 'Unable to load that Fluent detail right now.' };
      } finally {
        pendingActionIndex = null;
        render();
        const detail = document.getElementById('home-detail');
        if (detail) detail.focus({ preventScroll: true });
      }
    }
    function render() {
      const home = getHome();
      const readyDomains = (home.domains ?? []).filter((domain) => domain.status === 'ready');
      const readiness = readyDomains.length
        ? readyDomains.map((domain) => domain.label).join(', ') + ' ready'
        : 'Setup in progress';
      const actions = (home.suggestedActions ?? []).map((action, index) => (index === 0 ? '' : renderAction(action, index))).join('');
      const actionsSection = actions ? '<section class="home-actions" aria-label="Home actions">' + actions + '</section>' : '';
      const detail = renderDetail();
      const account = home.account || {};
      const accountAccess = describeAccountAccess(account.access);
      const accountPill = '<span class="home-pill">Account: ' + esc(accountAccess) + '</span>';
      const timezonePill = account.timezone ? '<span class="home-pill">' + esc(displayTimezone(account.timezone)) + '</span>' : '';
      const ownerName = displayName(account.displayName);
      const primaryAction = (home.suggestedActions ?? [])[0] || null;
      const priorityTitle = primaryAction && primaryAction.domain === 'meals'
        ? 'Grocery list'
        : primaryAction
        ? primaryAction.label
        : 'Fluent is ready when you are';
      const priorityBody = primaryAction && primaryAction.domain === 'meals'
        ? (home.memory?.meals?.groceryReadiness || 'Open the current living list before you shop.')
        : primaryAction && primaryAction.domain === 'health'
        ? (home.memory?.health?.today || "Open today's training context.")
        : 'Ask for Meals, Style, or Health when you want a focused next step.';
      const priority = '<section class="home-priority" aria-label="Suggested next step"><div class="home-priority-copy"><p class="home-priority-kicker">Suggested</p><h2 class="home-priority-title">' + esc(priorityTitle) + '</h2><p class="home-priority-body">' + esc(priorityBody) + '</p></div>' + renderPrimaryAction(primaryAction, 0) + '</section>';
      app.innerHTML = '<article class="home-card">' +
        '<header class="home-header"><div class="home-header-top"><div><p class="home-kicker">Fluent Home</p><h1 class="home-title">Today in Fluent</h1><p class="home-subtitle">' + esc(ownerName ? ownerName + ', here is what is ready across Meals, Style, and Health.' : 'Here is what is ready across Meals, Style, and Health.') + '</p></div><div class="home-pills">' + accountPill + timezonePill + '<span class="home-pill">' + esc(readiness) + '</span></div></div></header>' +
        priority +
        '<section class="home-grid">' +
        '<article class="home-panel"><h2 class="home-panel-title">Meals</h2><p class="home-line">' + esc(home.memory?.meals?.currentPlan ?? 'No active meal plan.') + '</p><p class="home-line">' + esc(home.memory?.meals?.groceryReadiness ?? 'No grocery list ready yet.') + '</p><p class="home-line">' + esc(home.memory?.meals?.inventory ?? '') + '</p><p class="home-line">' + esc(home.memory?.meals?.mealMemory ?? '') + '</p></article>' +
        '<article class="home-panel"><h2 class="home-panel-title">Style</h2><p class="home-line">' + esc(home.memory?.style?.closet ?? '') + '</p><p class="home-line">' + esc(home.memory?.style?.coverage ?? '') + '</p></article>' +
        '<article class="home-panel"><h2 class="home-panel-title">Health</h2><p class="home-line">' + esc(home.memory?.health?.activeBlock ?? 'No active training plan.') + '</p><p class="home-line">' + esc(home.memory?.health?.today ?? '') + '</p><p class="home-line">' + esc(home.memory?.health?.trainingSupport ?? '') + '</p></article>' +
        '</section>' + actionsSection + detail + '</article>';
      Array.prototype.forEach.call(app.querySelectorAll('[data-action-index]'), function (button) {
        button.addEventListener('click', function () {
          runAction(Number(button.getAttribute('data-action-index')));
        });
      });
      window.openai?.notifyIntrinsicHeight?.(document.body.scrollHeight);
    }
    window.addEventListener('openai:set_globals', render);
    render();
  </script>
</body>
</html>`;
}

async function buildMealsMemorySnapshot(meals: MealsService): Promise<FluentHomeViewModel['memory']['meals']> {
  const optionalMeals = meals as MealsService & {
    getCurrentGroceryList?: () => Promise<CurrentGroceryListRecord>;
  };
  const [currentPlanResult, currentGroceryListResult, inventorySummaryResult, mealMemoryResult] = await Promise.allSettled([
    meals.getCurrentPlan(),
    typeof optionalMeals.getCurrentGroceryList === 'function' ? optionalMeals.getCurrentGroceryList() : Promise.resolve(null),
    meals.getInventorySummary(),
    meals.getMealMemory(),
  ]);
  const currentPlan = settledValue(currentPlanResult);
  const currentGroceryList = settledValue(currentGroceryListResult);
  const inventorySummary = settledValue(inventorySummaryResult);
  const mealMemory = settledValue(mealMemoryResult) ?? [];
  return {
    currentPlan: describeMealPlan(currentPlan),
    groceryReadiness: describeGroceryReadiness(currentGroceryList),
    inventory: inventorySummary ? describeInventory(inventorySummary) : 'Pantry: could not refresh inventory just now.',
    mealMemory: describeMealMemory(mealMemory),
  };
}

async function buildStyleMemorySnapshot(style: StyleService): Promise<FluentHomeViewModel['memory']['style']> {
  const context = await style.getContext();
  const summary = summarizeStyleContext(context);
  return {
    closet: describeStyleCloset(summary),
    coverage: describeStyleCoverage(context),
    purchaseAnalysisReady: summary.purchaseEvalReady,
    styleSignals: [
      ...context.profile.raw.aestheticKeywords.slice(0, 5),
      ...context.profile.raw.hardAvoids.slice(0, 3).map((entry) => `Avoid: ${entry}`),
    ].slice(0, 8),
  };
}

async function buildHealthMemorySnapshot(health: HealthService): Promise<FluentHomeViewModel['memory']['health']> {
  const [context, today] = await Promise.all([health.getContext(), health.getTodayContext()]);
  const contextSummary = summarizeHealthContext(context);
  const todaySummary = summarizeHealthTodayContext(today);
  const resolvedTitle = todaySummary.resolvedSession?.title ?? null;
  const projectedTitle = todaySummary.projectedSession?.title ?? null;
  return {
    activeBlock: contextSummary.activeBlock
      ? `Training plan: ${contextSummary.activeBlock.daysPerWeek} days/week.`
      : null,
    today: resolvedTitle
      ? `Today: ${resolvedTitle}.`
      : projectedTitle
      ? `Next likely session: ${projectedTitle}${todaySummary.nextTrainingDate ? ` on ${todaySummary.nextTrainingDate}` : ''}.`
      : todaySummary.nextTrainingDate
      ? `Next training date: ${todaySummary.nextTrainingDate ?? todaySummary.date}`
      : 'No training planned for today.',
    trainingSupport: describeTrainingSupport(contextSummary.activeGoalCount, contextSummary.recentWorkoutCount),
  };
}

function buildDomainReadiness(domains: FluentDomainRecord[]): FluentHomeViewModel['domains'] {
  const labels: Record<HomeDomainId, string> = {
    health: 'Health',
    meals: 'Meals',
    style: 'Style',
  };
  return (['meals', 'style', 'health'] as HomeDomainId[]).map((domainId) => {
    const domain = domains.find((entry) => entry.domainId === domainId);
    const status = deriveDomainStatus(domain);
    return {
      domain: domainId,
      label: labels[domainId],
      status,
      summary: summarizeDomainStatus(status),
    };
  });
}

function deriveDomainStatus(domain: FluentDomainRecord | undefined): HomeDomainStatus {
  if (!domain) return 'available';
  if (domain.lifecycleState === 'disabled') return 'disabled';
  if (domain.lifecycleState === 'enabled' && domain.onboardingState === 'onboarding_completed') return 'ready';
  if (domain.lifecycleState === 'enabled') return 'onboarding';
  return 'available';
}

function summarizeDomainStatus(status: HomeDomainStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready to use.';
    case 'onboarding':
      return 'Enabled, onboarding still in progress.';
    case 'disabled':
      return 'Disabled for this account.';
    default:
      return 'Available but not enabled yet.';
  }
}

function buildSuggestedActions(
  readyDomains: Set<string>,
  healthSnapshot: FluentHomeViewModel['memory']['health'] | null,
): FluentHomeViewModel['suggestedActions'] {
  const actions: FluentHomeViewModel['suggestedActions'] = [];
  if (readyDomains.has('meals')) {
    actions.push({
      args: {},
      domain: 'meals',
      label: 'Open grocery list',
      richSurfaceAvailable: true,
      handoffPrompt: 'Use Fluent to show me my grocery list.',
      presentationMode: 'modal',
      targetSurfaceId: 'meals-grocery-list-chatgpt',
      targetToolName: 'meals_render_grocery_list_v2',
      templateUri: MEALS_GROCERY_LIST_TEMPLATE_URI,
      toolName: 'meals_render_grocery_list_v2',
    });
  }
  const hasTrainingContext = Boolean(
    healthSnapshot?.today ||
    healthSnapshot?.activeBlock ||
    healthSnapshot?.trainingSupport,
  );
  if (readyDomains.has('health') && hasTrainingContext) {
    actions.push({
      args: {},
      domain: 'health',
      label: "Show today's training",
      richSurfaceAvailable: false,
      handoffPrompt: "Use Fluent to show today's training.",
      presentationMode: 'text_handoff',
      targetSurfaceId: 'health-text-first-chatgpt',
      targetToolName: 'health_get_today_context',
      toolName: 'health_get_today_context',
    });
  }
  return actions;
}

function describeMealPlan(plan: MealPlanRecord | null): string | null {
  const summary = summarizeMealPlan(plan);
  if (!summary) return null;
  return `Meal plan: ${formatCount(
    summary.entryCount,
    'meal',
  )} planned${summary.weekStart ? ` for ${formatDateRange(summary.weekStart, summary.weekEnd)}` : ''}.`;
}

function describeGroceryReadiness(list: CurrentGroceryListRecord | null): string | null {
  const summary = summarizeCurrentGroceryList(list);
  if (!summary) return null;
  const toBuy = summary.counts.toBuyCount;
  const checks = summary.counts.checkAtHomeCount;
  const week = summary.weekRelation === 'past'
    ? `from ${formatShortDate(summary.weekStart)}`
    : summary.weekRelation === 'future'
    ? `for ${formatShortDate(summary.weekStart)}`
    : `for ${formatShortDate(summary.weekStart)}`;
  const stale = summary.stale ? 'Review it before shopping' : summary.trustLabel;
  return `Grocery list: ${formatCount(toBuy, 'item')} to buy, ${formatCount(checks, 'thing')} to check at home; ${week}. ${stale}.`;
}

function describeInventory(summary: InventorySummary): string {
  const expiringCount = summary.expiringSoon.length;
  return `Pantry: ${formatCount(summary.totalItems, 'item')} tracked${expiringCount ? `; ${formatCount(expiringCount, 'item')} may need attention soon` : ''}.`;
}

function describeMealMemory(memory: MealMemoryRecord[]): string {
  const statuses = memory.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
  const favorites = (statuses.proven ?? 0) + (statuses.repeat ?? 0);
  const retired = statuses.retired ?? 0;
  const trial = statuses.trial ?? 0;
  const known = Object.entries(statuses).reduce((total, [status, count]) => (
    ['proven', 'repeat', 'retired', 'trial'].includes(status) ? total : total + count
  ), 0);
  const parts = [
    favorites ? `${formatCount(favorites, 'favorite')} saved` : null,
    retired ? `${formatCount(retired, 'meal')} out of rotation` : null,
    trial ? `${formatCount(trial, 'meal')} still being tested` : null,
    known ? `${formatCount(known, 'meal')} with notes` : null,
  ].filter((entry): entry is string => Boolean(entry));
  return parts.length ? `Meal notes: ${parts.join('; ')}.` : 'Meal notes: no favorites yet.';
}

function describeTrainingSupport(activeGoalCount: number, recentWorkoutCount: number): string {
  if (recentWorkoutCount && activeGoalCount) {
    return 'Your recent training and goals are ready to shape the next session.';
  }
  if (recentWorkoutCount) {
    return 'Your recent training is ready to shape the next session.';
  }
  if (activeGoalCount) {
    return 'Your goals are ready; the next workout log will make coaching sharper.';
  }
  return 'Add a goal or workout when you want stronger coaching context.';
}

function describeStyleCloset(summary: ReturnType<typeof summarizeStyleContext>): string {
  if (!summary.itemCount) return 'Style is ready, but I have not seen any closet items yet.';
  if (!summary.photoCount) return `I know ${formatCount(summary.itemCount, 'closet item')}; fit calls need a few photos first.`;
  return `Closet: ${formatCount(summary.itemCount, 'item')} and ${formatCount(summary.photoCount, 'photo')} ready for comparisons.`;
}

function describeStyleCoverage(context: StyleContextRecord): string {
  if (!context.photoCount) return 'Purchase advice is available for preference checks, but closet photos will make fit calls more useful.';
  if (context.purchaseEvalReady) return 'Purchase analysis is ready; confidence improves as more closet photos and item notes are added.';
  return 'Purchase advice works, but a few more item notes would make verdicts sharper.';
}

function buildHomeTextFallback(home: Omit<FluentHomeViewModel, 'textFallback'>): string {
  const readyAreas = home.domains.filter((domain) => domain.status === 'ready').map((domain) => domain.label);
  const accountAccess = describeAccountAccess(home.account.access).toLowerCase();
  const primaryAction = home.suggestedActions[0] ?? null;
  const primaryActionText = describePrimaryHomeAction(primaryAction, home);
  const secondaryActions = home.suggestedActions.slice(1).map((action) => action.label);
  return [
    'Fluent Home',
    `Next: ${primaryActionText.title}`,
    `Why: ${primaryActionText.reason}`,
    `Account: ${accountAccess}${home.account.timezone ? `, ${describeTimezone(home.account.timezone)}` : ''}`,
    readyAreas.length ? `Ready now: ${readyAreas.join(', ')}.` : 'Ready now: setup is still in progress.',
    `Meals: ${home.memory.meals.currentPlan ?? 'No active plan'} ${home.memory.meals.groceryReadiness ?? ''} ${home.memory.meals.inventory}`.trim(),
    `Style: ${home.memory.style.closet} ${home.memory.style.coverage}`,
    `Health: ${home.memory.health.today ?? 'No training planned for today.'} ${home.memory.health.trainingSupport}`.trim(),
    secondaryActions.length ? `Also available: ${secondaryActions.join(' | ')}` : null,
  ].filter((line): line is string => Boolean(line)).join('\n');
}

function describePrimaryHomeAction(
  action: FluentHomeViewModel['suggestedActions'][number] | null,
  home: Omit<FluentHomeViewModel, 'textFallback'>,
): { reason: string; title: string } {
  if (action?.domain === 'meals') {
    return {
      reason: home.memory.meals.groceryReadiness ?? home.memory.meals.inventory,
      title: 'Open grocery list.',
    };
  }
  if (action?.domain === 'health') {
    return {
      reason: home.memory.health.today ?? 'Today has training context ready to review.',
      title: "Show today's training.",
    };
  }
  return {
    reason: 'Meals, Style, and Health are available when you want a focused next step.',
    title: 'Ask Fluent for the area you want to work on.',
  };
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function trimTrailingSentencePunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/u, '');
}

function formatDateRange(start: string, end: string | null | undefined): string {
  if (!end || end === start) return formatShortDate(start);
  return `${formatShortDate(start)} to ${formatShortDate(end)}`;
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return 'the current week';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function describeTimezone(zone: string): string {
  const label = zone.split('/').pop()?.replace(/_/g, ' ').trim();
  return label ? `${label} time` : zone;
}

function describeAccountAccess(access: string): string {
  switch (access as FluentAccountAccessState | 'local') {
    case 'active':
      return 'Signed in';
    case 'limited':
      return 'Limited access';
    case 'pending':
      return 'Pending access';
    case 'unavailable':
      return 'Access unavailable';
    case 'local':
      return 'Local profile';
    default:
      return 'Access check needed';
  }
}

async function safeSnapshot<T>(build: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await build();
  } catch {
    return fallback;
  }
}

function fallbackMealsMemory(reason: string): FluentHomeViewModel['memory']['meals'] {
  return {
    currentPlan: null,
    groceryReadiness: null,
    inventory: reason,
    mealMemory: 'Ask for Meals when you want to plan or shop.',
  };
}

function fallbackStyleMemory(reason: string): FluentHomeViewModel['memory']['style'] {
  return {
    closet: reason,
    coverage: 'Purchase analysis will be clearer after Style is available.',
    purchaseAnalysisReady: false,
    styleSignals: [],
  };
}

function fallbackHealthMemory(reason: string): FluentHomeViewModel['memory']['health'] {
  return {
    activeBlock: null,
    today: null,
    trainingSupport: reason,
  };
}
