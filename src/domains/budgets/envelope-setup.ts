import type { BudgetCategory, BudgetsService, InternalPurchaseContext } from './service';
import { buildBudgetLine } from '../style/purchase-analysis';

export const BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI = 'ui://widget/fluent-budgets-envelope-setup-v1.html';

export type BudgetEnvelopeSetupStatus = 'set' | 'stale' | 'unset';

export interface BudgetEnvelopeSetupCategoryViewModel {
  category: BudgetCategory;
  caveats: string[];
  currency: string | null;
  label: string;
  monthlyAmount: number | null;
  status: BudgetEnvelopeSetupStatus;
  statusLine: string | null;
  updatedAt: string | null;
}

export type BudgetEnvelopeSetupStructuredContent = {
  categories: BudgetEnvelopeSetupCategoryViewModel[];
  experience: 'budgets_envelope_setup';
  surface: 'budgets_envelope_setup';
  templateUri: typeof BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI;
  title: 'Budget envelopes';
};

const BUDGET_SETUP_CATEGORIES: Array<{ category: BudgetCategory; label: string }> = [
  { category: 'style-clothing', label: 'Clothing' },
  { category: 'meals-groceries', label: 'Groceries' },
];

export async function buildBudgetsEnvelopeSetupStructuredContent(
  budgets: BudgetsService,
  options?: { now?: Date | string | null },
): Promise<BudgetEnvelopeSetupStructuredContent> {
  const categories: BudgetEnvelopeSetupCategoryViewModel[] = [];
  for (const entry of BUDGET_SETUP_CATEGORIES) {
    const context = await budgets.getPurchaseContext({
      category: entry.category,
      now: options?.now ?? null,
    });
    categories.push(buildCategoryViewModel(entry, context));
  }
  return {
    categories,
    experience: 'budgets_envelope_setup',
    surface: 'budgets_envelope_setup',
    templateUri: BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI,
    title: 'Budget envelopes',
  };
}

export function buildBudgetsEnvelopeSetupWidgetMeta(origin: string) {
  return {
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: [],
    },
    'openai/widgetDescription': 'Set and refresh Fluent budget envelopes for clothing and groceries.',
    'openai/widgetDomain': origin,
    'openai/widgetPrefersBorder': true,
    // MCP Apps `ui.domain` is host-provisioned (Claude expects {hash}.claudemcpcontent.com
    // and rejects a server-supplied origin) — never set it; hosts use their own sandbox domain.
    ui: {
      csp: {
        connectDomains: [],
        resourceDomains: [],
      },
      prefersBorder: true,
    },
  } as const;
}

function buildCategoryViewModel(
  entry: { category: BudgetCategory; label: string },
  context: InternalPurchaseContext,
): BudgetEnvelopeSetupCategoryViewModel {
  const target = context.targetSetup;
  if (!target) {
    return {
      category: entry.category,
      caveats: [],
      currency: null,
      label: entry.label,
      monthlyAmount: null,
      status: 'unset',
      statusLine: null,
      updatedAt: null,
    };
  }
  return {
    category: entry.category,
    caveats: context.caveats,
    currency: target.currency,
    label: entry.label,
    monthlyAmount: target.monthlyAmount,
    status: context.caveats.includes('stale_envelope') ? 'stale' : 'set',
    statusLine: buildBudgetLine(context),
    updatedAt: isoDateOnly(target.updatedAt),
  };
}

function isoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : value;
}

export function getBudgetsEnvelopeSetupWidgetHtml(): string {
  return `
<div id="budgets-envelope-root"></div>
<style>
  /* Structural system mirrors the Fluent grocery-list widget family; D9 signature accents
     (warm sand / Wine, mono micro-labels) replace its blue. */
  :root {
    color-scheme: light;
    --be-card-bg: #ffffff;
    --be-card-border: rgba(0, 0, 0, 0.08);
    --be-row-border: rgba(86, 73, 55, 0.14);
    --be-text: #0d0d0d;
    --be-text-muted: #3c3c43;
    --be-text-soft: #6e6e73;
    --be-accent: #D4C4A8;
    --be-accent-dim: rgba(212, 196, 168, 0.22);
    --be-wine: #7C2D3E;
    --be-wine-dim: rgba(124, 45, 62, 0.12);
    --be-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 10px 28px rgba(0, 0, 0, 0.04);
    --be-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", sans-serif;
    --be-font-mono: ui-monospace, "JetBrains Mono", SFMono-Regular, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--be-font-sans); background: transparent; color: var(--be-text); }
  button, input { font: inherit; }
  .be-card {
    margin: 0;
    padding: 18px 20px;
    border: 1px solid var(--be-card-border);
    border-radius: 16px;
    background: var(--be-card-bg);
    box-shadow: var(--be-shadow);
  }
  .be-header {
    display: grid;
    gap: 8px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--be-row-border);
    margin-bottom: 14px;
  }
  .be-kicker {
    margin: 0;
    font-family: var(--be-font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--be-text-soft);
  }
  .be-title { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
  .be-grid { display: grid; gap: 12px; }
  .be-row {
    background: var(--be-card-bg);
    border: 1px solid var(--be-row-border);
    border-left: 3px solid var(--be-accent);
    border-radius: 12px;
    display: grid;
    gap: 14px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    padding: 14px 16px;
  }
  .be-row[data-status="stale"] { border-left-color: var(--be-wine); }
  .be-label {
    font-family: var(--be-font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--be-text-soft);
    margin-bottom: 4px;
  }
  .be-name { font-size: 15px; font-weight: 600; line-height: 1.3; }
  .be-status {
    font-family: var(--be-font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--be-text-soft);
    margin-top: 6px;
  }
  .be-status-line { color: var(--be-text-muted); font-size: 13px; line-height: 1.45; margin-top: 8px; }
  .be-caveat {
    background: var(--be-accent-dim);
    border-left: 3px solid var(--be-accent);
    border-radius: 6px;
    color: var(--be-text-muted);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 9px;
    padding: 8px 10px;
  }
  .be-row[data-status="stale"] .be-caveat { background: var(--be-wine-dim); border-left-color: var(--be-wine); }
  .be-form { align-items: end; display: grid; gap: 8px; grid-template-columns: 96px 40px 84px; }
  .be-input {
    border: 1px solid var(--be-card-border);
    border-radius: 10px;
    color: var(--be-text);
    min-height: 38px;
    padding: 8px 10px;
    width: 100%;
    background: var(--be-card-bg);
  }
  .be-input:focus { border-color: var(--be-accent); outline: 2px solid var(--be-accent-dim); }
  .be-currency {
    align-items: center;
    color: var(--be-text-soft);
    display: flex;
    font-family: var(--be-font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    font-weight: 500;
    min-height: 38px;
  }
  .be-button {
    background: var(--be-text);
    border: 0;
    border-radius: 10px;
    color: #ffffff;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    min-height: 38px;
    padding: 8px 14px;
  }
  .be-button:disabled { cursor: wait; opacity: 0.62; }
  .be-error, .be-success { border-radius: 10px; font-size: 13px; line-height: 1.4; margin-top: 12px; padding: 10px 12px; }
  .be-error { background: #fff3f0; color: #8a2d1f; }
  .be-success { background: var(--be-accent-dim); color: var(--be-text); }
  @media (max-width: 560px) {
    .be-row { grid-template-columns: 1fr; }
    .be-form { grid-template-columns: minmax(0, 1fr) 40px 84px; }
  }
</style>
<script>
  (function () {
    var root = document.getElementById('budgets-envelope-root');
    var fallbackViewModel = ${JSON.stringify(emptyEnvelopeSetupStructuredContent())};
    var viewModel = null;
    var pendingCategory = null;
    var errorMessage = '';
    var successMessage = '';
    var bridgeId = 1;
    var bridgePending = Object.create(null);
    var bridgeInitialized = false;
    var bridgeReady = null;

    function getOpenAI() {
      if (!window.openai || typeof window.openai !== 'object') window.openai = {};
      return window.openai;
    }
    function toArray(value) { return Array.isArray(value) ? value : []; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function findEnvelopeSetup(candidate, depth) {
      if (!candidate || typeof candidate !== 'object' || depth > 4) return null;
      if (candidate.experience === 'budgets_envelope_setup' || candidate.surface === 'budgets_envelope_setup') return candidate;
      var keys = ['structuredContent', 'toolResponseMetadata', 'toolOutput', 'params', 'result', 'output', 'data', 'value', 'payload', 'readAfterWrite'];
      for (var i = 0; i < keys.length; i += 1) {
        var nested = findEnvelopeSetup(candidate[keys[i]], depth + 1);
        if (nested) return nested;
      }
      return null;
    }
    function normalize(rawCandidate) {
      var candidate = findEnvelopeSetup(rawCandidate, 0);
      if (!candidate) return null;
      return {
        categories: toArray(candidate.categories).map(function (entry) {
          return {
            category: typeof entry.category === 'string' ? entry.category : '',
            caveats: toArray(entry.caveats).filter(Boolean),
            currency: typeof entry.currency === 'string' ? entry.currency : null,
            label: typeof entry.label === 'string' ? entry.label : entry.category,
            monthlyAmount: typeof entry.monthlyAmount === 'number' ? entry.monthlyAmount : null,
            status: entry.status === 'stale' ? 'stale' : entry.status === 'set' ? 'set' : 'unset',
            statusLine: typeof entry.statusLine === 'string' ? entry.statusLine : null,
            updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
          };
        }),
        experience: 'budgets_envelope_setup',
        surface: 'budgets_envelope_setup',
        templateUri: '${BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI}',
        title: typeof candidate.title === 'string' ? candidate.title : 'Budget envelopes',
      };
    }
    function hydrateFromCandidate(candidate) {
      var normalized = normalize(candidate);
      if (!normalized) return false;
      viewModel = normalized;
      var openai = getOpenAI();
      openai.toolResponseMetadata = clone(normalized);
      openai.toolOutput = clone(normalized);
      return true;
    }
    function hydrate() {
      var openai = getOpenAI();
      var candidates = [openai.toolResponseMetadata, openai.toolOutput, openai.structuredContent, openai.params, openai.requestParams, openai.modalParams, openai];
      for (var i = 0; i < candidates.length; i += 1) {
        if (hydrateFromCandidate(candidates[i])) return true;
      }
      viewModel = fallbackViewModel;
      return false;
    }
    function notifyHeight() {
      var openai = getOpenAI();
      var height = document.body.scrollHeight || (root ? root.scrollHeight : 0) || 320;
      var width = document.body.scrollWidth || (root ? root.scrollWidth : 0) || 0;
      if (typeof openai.notifyIntrinsicHeight === 'function') {
        openai.notifyIntrinsicHeight(height);
      }
      bridgeNotify('ui/notifications/size-changed', { height: height, width: width });
    }
    function getBridgeTargets() {
      var targets = [];
      try {
        if (window.parent && window.parent !== window) targets.push(window.parent);
        if (window.top && window.top !== window && targets.indexOf(window.top) === -1) targets.push(window.top);
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
      if (message.id == null || !bridgePending[message.id]) return;
      var pending = bridgePending[message.id];
      delete bridgePending[message.id];
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message || 'MCP Apps bridge error'));
      else pending.resolve(message.result);
    }, { passive: true });
    function bridgeRequest(method, params, timeoutMs) {
      var targets = getBridgeTargets();
      if (!targets.length) return Promise.reject(new Error('No MCP Apps bridge target.'));
      var id = bridgeId++;
      return new Promise(function (resolve, reject) {
        var timeout = setTimeout(function () {
          delete bridgePending[id];
          reject(new Error('MCP Apps bridge timed out.'));
        }, timeoutMs || 15000);
        bridgePending[id] = { reject: reject, resolve: resolve, timeout: timeout };
        var message = { jsonrpc: '2.0', id: id, method: method, params: params || {} };
        targets.forEach(function (target) { target.postMessage(message, '*'); });
      });
    }
    function bridgeNotify(method, params) {
      if (method !== 'ui/notifications/initialized' && !bridgeInitialized) return;
      getBridgeTargets().forEach(function (target) {
        target.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
      });
    }
    function callToolViaBridge(name, args) {
      return bridgeRequest('tools/call', { name: name, arguments: args || {} }, 20000);
    }
    function getCallTool() {
      var openai = getOpenAI();
      if (typeof openai.callTool === 'function') return openai.callTool.bind(openai);
      return getBridgeTargets().length ? callToolViaBridge : null;
    }
    function envelopeArgs(category, amount) {
      var sourceType = getOpenAI().budgetEnvelopeSourceType || 'mcp_app_widget';
      return {
        approval: 'explicit_user_approved',
        category: category,
        currency: 'CAD',
        monthly_amount: amount,
        source_agent: 'fluent-budgets-envelope-setup-widget',
        source_type: sourceType,
      };
    }
    function findReadAfterWriteEnvelope(result) {
      var structured = result && (result.structuredContent || result);
      if (!structured || typeof structured !== 'object') return null;
      if (structured.envelope && typeof structured.envelope === 'object') return structured.envelope;
      if (structured.payload && structured.payload.envelope && typeof structured.payload.envelope === 'object') return structured.payload.envelope;
      return null;
    }
    async function refresh(callTool) {
      var result = await callTool('fluent_render_budgets_surface', {});
      hydrateFromCandidate(result);
      render();
    }
    async function setEnvelope(category) {
      if (pendingCategory) return;
      var input = root.querySelector('[data-amount-input="' + category + '"]');
      var amount = Number(input && input.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        errorMessage = 'Enter a monthly amount greater than $0.';
        successMessage = '';
        render();
        return;
      }
      var callTool = getCallTool();
      if (!callTool) {
        errorMessage = 'This host cannot save budget envelopes from the widget yet.';
        successMessage = '';
        render();
        return;
      }
      pendingCategory = category;
      errorMessage = '';
      successMessage = '';
      render();
      try {
        var result = await callTool('fluent_set_budget_envelope', envelopeArgs(category, amount));
        var envelope = findReadAfterWriteEnvelope(result);
        await refresh(callTool);
        pendingCategory = null;
        successMessage = envelope ? 'Envelope updated.' : 'Envelope request sent.';
        render();
      } catch (error) {
        pendingCategory = null;
        errorMessage = (error && error.message) || 'Unable to update that envelope right now.';
        render();
      }
    }
    function caveatCopy(caveat) {
      if (caveat === 'stale_envelope') return 'Target last confirmed over 45 days ago — confirm or update it.';
      if (caveat === 'no_spend_events_recorded') return 'No spend recorded yet this month.';
      if (caveat === 'currency_unverified') return 'Currency needs confirmation before cross-currency comparisons.';
      return String(caveat).replace(/_/g, ' ');
    }
    function renderCategory(entry) {
      var amountValue = entry.monthlyAmount == null ? '' : String(entry.monthlyAmount);
      var status = entry.status || 'unset';
      var caveats = toArray(entry.caveats);
      var caveatHtml = caveats.map(function (caveat) {
        return '<div class="be-caveat">' + escapeHtml(caveatCopy(caveat)) + '</div>';
      }).join('');
      return '<section class="be-row" data-category="' + escapeHtml(entry.category) + '" data-status="' + escapeHtml(status) + '">'
        + '<div><div class="be-label">' + escapeHtml(entry.category) + '</div><div class="be-name">' + escapeHtml(entry.label) + '</div>'
        + '<div class="be-status">' + escapeHtml(status) + (entry.updatedAt ? ' · ' + escapeHtml(entry.updatedAt) : '') + '</div>'
        + (entry.statusLine ? '<div class="be-status-line">' + escapeHtml(entry.statusLine) + '</div>' : '')
        + caveatHtml + '</div>'
        + '<form class="be-form" data-envelope-form="' + escapeHtml(entry.category) + '">'
        + '<label><span class="be-label">Monthly</span><input class="be-input" data-amount-input="' + escapeHtml(entry.category) + '" inputmode="decimal" min="1" step="1" type="number" value="' + escapeHtml(amountValue) + '" aria-label="' + escapeHtml(entry.label) + ' monthly amount"></label>'
        + '<div class="be-currency">CAD</div>'
        + '<button class="be-button" type="submit" ' + (pendingCategory === entry.category ? 'disabled' : '') + '>' + (pendingCategory === entry.category ? 'Saving' : entry.status === 'unset' ? 'Set' : 'Update') + '</button>'
        + '</form></section>';
    }
    function render() {
      if (!root) return;
      var vm = viewModel || fallbackViewModel;
      root.innerHTML = '<article class="be-card"><header class="be-header"><div class="be-kicker">Fluent budgets</div><h1 class="be-title">' + escapeHtml(vm.title || 'Budget envelopes') + '</h1></header>'
        + '<div class="be-grid">' + toArray(vm.categories).map(renderCategory).join('') + '</div>'
        + (errorMessage ? '<div class="be-error" role="alert">' + escapeHtml(errorMessage) + '</div>' : '')
        + (successMessage ? '<div class="be-success" role="status" aria-live="polite">' + escapeHtml(successMessage) + '</div>' : '')
        + '</article>';
      var forms = root.querySelectorAll('[data-envelope-form]');
      for (var i = 0; i < forms.length; i += 1) {
        forms[i].addEventListener('submit', function (event) {
          event.preventDefault();
          var category = event.currentTarget.getAttribute('data-envelope-form');
          if (category) setEnvelope(category);
        });
      }
      notifyHeight();
    }
    function connectMcpAppsHost() {
      if (bridgeReady) return bridgeReady;
      if (!getBridgeTargets().length) {
        bridgeReady = Promise.resolve(null);
        return bridgeReady;
      }
      bridgeReady = bridgeRequest('ui/initialize', {
        appInfo: { name: 'Fluent Budgets Envelope Setup', version: 'v1' },
        appCapabilities: {},
        protocolVersion: '2026-01-26',
      }, 6000).then(function (result) {
        bridgeInitialized = true;
        hydrateFromCandidate(result);
        bridgeNotify('ui/notifications/initialized', {});
        render();
        return result;
      }).catch(function () { return null; });
      return bridgeReady;
    }
    window.addEventListener('openai:set_globals', function () { hydrate(); render(); });
    window.addEventListener('resize', function () { notifyHeight(); });
    hydrate();
    render();
    connectMcpAppsHost();
  })();
</script>`;
}

function emptyEnvelopeSetupStructuredContent(): BudgetEnvelopeSetupStructuredContent {
  return {
    categories: BUDGET_SETUP_CATEGORIES.map((entry) => ({
      category: entry.category,
      caveats: [],
      currency: null,
      label: entry.label,
      monthlyAmount: null,
      status: 'unset',
      statusLine: null,
      updatedAt: null,
    })),
    experience: 'budgets_envelope_setup',
    surface: 'budgets_envelope_setup',
    templateUri: BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI,
    title: 'Budget envelopes',
  };
}
