import { createHash } from 'node:crypto';
import { summarizeHealthContext, summarizeHealthTodayContext, type HealthService } from './domains/health/service';
import {
  summarizeGroceryPlan,
  summarizeMealPlan,
  type GroceryPlanRecord,
  type InventorySummary,
  type MealMemoryRecord,
  type MealPlanRecord,
  type MealsService,
} from './domains/meals/service';
import { summarizeStyleContext, type StyleService } from './domains/style/service';
import type { StyleContextRecord } from './domains/style/types';
import type { FluentCapabilities, FluentCoreService, FluentDomainRecord } from './fluent-core';

export const FLUENT_HOME_TEMPLATE_URI = 'ui://widget/fluent-home-v1.html';
export const FLUENT_HOME_WIDGET_VERSION = 'v1';

type HomeDomainId = 'meals' | 'style' | 'health';
type HomeDomainStatus = 'ready' | 'available' | 'onboarding' | 'disabled';

export interface FluentHomeViewModel {
  account: {
    access: string;
    backendMode: string;
    deploymentTrack: string;
    displayName: string | null;
    storageBackend: string;
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
    toolName: string;
    args: Record<string, unknown>;
    richSurfaceAvailable: boolean;
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
  const capabilities = await services.fluentCore.getCapabilities();
  const domainStatuses = buildDomainReadiness(capabilities.availableDomains);
  const readyDomains = new Set(capabilities.readyDomains);

  const [mealsSnapshot, styleSnapshot, healthSnapshot] = await Promise.all([
    readyDomains.has('meals') ? buildMealsMemorySnapshot(services.meals) : null,
    readyDomains.has('style') ? buildStyleMemorySnapshot(services.style) : null,
    readyDomains.has('health') ? buildHealthMemorySnapshot(services.health) : null,
  ]);

  const home: Omit<FluentHomeViewModel, 'textFallback'> = {
    account: {
      access: capabilities.deploymentTrack === 'cloud' ? 'signed_in' : 'local',
      backendMode: capabilities.backendMode,
      deploymentTrack: capabilities.deploymentTrack,
      displayName: capabilities.profile.displayName,
      storageBackend: capabilities.storageBackend,
      timezone: capabilities.profile.timezone,
    },
    domains: domainStatuses,
    memory: {
      meals: mealsSnapshot ?? {
        currentPlan: null,
        groceryReadiness: null,
        inventory: 'Meals is not ready yet.',
        mealMemory: 'No meal memory available until Meals is ready.',
      },
      style: styleSnapshot ?? {
        closet: 'Style is not ready yet.',
        coverage: 'No closet snapshot available until Style is ready.',
        purchaseAnalysisReady: false,
        styleSignals: [],
      },
      health: healthSnapshot ?? {
        activeBlock: null,
        today: null,
        trainingSupport: 'No training context available until Health is ready.',
      },
    },
    suggestedActions: buildSuggestedActions(readyDomains),
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
      'Fluent Home memory overview with domain readiness, meals, style, health, account state, and suggested next actions.',
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
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    .home { padding: 18px; display: grid; gap: 14px; }
    .top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: 0; }
    p { margin: 0; color: color-mix(in srgb, CanvasText 70%, transparent); font-size: 13px; line-height: 1.45; }
    .pill { border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 999px; padding: 5px 9px; font-size: 12px; white-space: nowrap; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .panel { border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 8px; padding: 12px; min-width: 0; }
    .panel h2 { font-size: 13px; margin: 0 0 8px; letter-spacing: 0; }
    .metric { font-size: 12px; line-height: 1.45; color: color-mix(in srgb, CanvasText 78%, transparent); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .action { border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 8px; padding: 8px 10px; font-size: 12px; background: color-mix(in srgb, CanvasText 4%, transparent); }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .top { display: grid; } }
  </style>
</head>
<body>
  <main class="home" id="app"></main>
  <script>
    const data = window.openai?.toolOutput ?? window.openai?.toolResponse?.structuredContent ?? {};
    const home = data.home ?? data;
    const app = document.getElementById('app');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const domains = (home.domains ?? []).map((domain) => '<span class="pill">' + esc(domain.label) + ': ' + esc(domain.status) + '</span>').join('');
    const actions = (home.suggestedActions ?? []).map((action) => '<span class="action">' + esc(action.label) + '</span>').join('');
    app.innerHTML = '<section class="top"><div><h1>Fluent Home</h1><p>' + esc(home.account?.displayName ? home.account.displayName + "'s memory overview" : 'Memory overview') + '</p></div><div class="actions">' + domains + '</div></section>' +
      '<section class="grid">' +
      '<article class="panel"><h2>Meals</h2><div class="metric">' + esc(home.memory?.meals?.currentPlan ?? 'No active meal plan') + '</div><div class="metric">' + esc(home.memory?.meals?.inventory ?? '') + '</div><div class="metric">' + esc(home.memory?.meals?.mealMemory ?? '') + '</div></article>' +
      '<article class="panel"><h2>Style</h2><div class="metric">' + esc(home.memory?.style?.closet ?? '') + '</div><div class="metric">' + esc(home.memory?.style?.coverage ?? '') + '</div></article>' +
      '<article class="panel"><h2>Health</h2><div class="metric">' + esc(home.memory?.health?.activeBlock ?? 'No active training block') + '</div><div class="metric">' + esc(home.memory?.health?.today ?? '') + '</div><div class="metric">' + esc(home.memory?.health?.trainingSupport ?? '') + '</div></article>' +
      '</section><section class="panel"><h2>Next Actions</h2><div class="actions">' + actions + '</div></section>';
  </script>
</body>
</html>`;
}

async function buildMealsMemorySnapshot(meals: MealsService): Promise<FluentHomeViewModel['memory']['meals']> {
  const [currentPlan, inventorySummary, mealMemory] = await Promise.all([
    meals.getCurrentPlan(),
    meals.getInventorySummary(),
    meals.getMealMemory(),
  ]);
  const groceryPlan = currentPlan ? await meals.getGroceryPlan(currentPlan.weekStart) : null;
  return {
    currentPlan: describeMealPlan(currentPlan),
    groceryReadiness: describeGroceryReadiness(groceryPlan),
    inventory: describeInventory(inventorySummary),
    mealMemory: describeMealMemory(mealMemory),
  };
}

async function buildStyleMemorySnapshot(style: StyleService): Promise<FluentHomeViewModel['memory']['style']> {
  const context = await style.getContext();
  const summary = summarizeStyleContext(context);
  return {
    closet: `${summary.itemCount} closet items, ${summary.photoCount} photos, ${summary.profileCount} item profiles.`,
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
  return {
    activeBlock: contextSummary.activeBlock
      ? `${contextSummary.activeBlock.name} (${contextSummary.activeBlock.status}, ${contextSummary.activeBlock.daysPerWeek} days/week)`
      : null,
    today: todaySummary.resolvedSession?.title ?? todaySummary.projectedSession?.title ?? todaySummary.nextTrainingDate
      ? `Next training date: ${todaySummary.nextTrainingDate ?? todaySummary.date}`
      : 'No training session resolved for today.',
    trainingSupport: `${contextSummary.activeGoalCount} active goals, ${contextSummary.recentWorkoutCount} recent workouts.`,
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

function buildSuggestedActions(readyDomains: Set<string>): FluentHomeViewModel['suggestedActions'] {
  const actions: FluentHomeViewModel['suggestedActions'] = [];
  if (readyDomains.has('meals')) {
    actions.push(
      { label: 'Plan meals', domain: 'meals', toolName: 'meals_generate_plan', args: {}, richSurfaceAvailable: false },
      { label: 'Show grocery list', domain: 'meals', toolName: 'meals_render_grocery_list_v2', args: {}, richSurfaceAvailable: true },
      { label: 'Show pantry dashboard', domain: 'meals', toolName: 'meals_render_pantry_dashboard', args: {}, richSurfaceAvailable: true },
    );
  }
  if (readyDomains.has('style')) {
    actions.push({
      label: 'Analyze a purchase',
      domain: 'style',
      toolName: 'style_prepare_purchase_analysis',
      args: {},
      richSurfaceAvailable: false,
    });
  }
  if (readyDomains.has('health')) {
    actions.push(
      { label: "Show today's training context", domain: 'health', toolName: 'health_get_today_context', args: {}, richSurfaceAvailable: false },
      { label: 'Update a workout', domain: 'health', toolName: 'health_log_workout', args: {}, richSurfaceAvailable: false },
    );
  }
  return actions;
}

function describeMealPlan(plan: MealPlanRecord | null): string | null {
  const summary = summarizeMealPlan(plan);
  if (!summary) return null;
  return `${summary.status} plan for ${summary.weekStart}${summary.weekEnd ? ` to ${summary.weekEnd}` : ''}, ${summary.entryCount} meals.`;
}

function describeGroceryReadiness(plan: GroceryPlanRecord | null): string | null {
  const summary = summarizeGroceryPlan(plan);
  if (!summary) return null;
  return `${summary.itemCount} grocery items, ${summary.pantryCheckCount} pantry checks, ${summary.unresolvedCount} unresolved.`;
}

function describeInventory(summary: InventorySummary): string {
  const expiringCount = summary.expiringSoon.length;
  return `${summary.totalItems} inventory items tracked${expiringCount ? `, ${expiringCount} expiring soon` : ''}.`;
}

function describeMealMemory(memory: MealMemoryRecord[]): string {
  const statuses = memory.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
  const statusText = Object.entries(statuses)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
  return statusText ? `${memory.length} remembered meal outcomes (${statusText}).` : 'No remembered meal outcomes yet.';
}

function describeStyleCoverage(context: StyleContextRecord): string {
  return `${Math.round(context.deliverablePhotoCoverage * 100)}% photo delivery coverage, ${Math.round(
    context.usableProfileCoverage * 100,
  )}% usable profile coverage, ${context.evidenceGapCount} evidence gaps.`;
}

function buildHomeTextFallback(home: Omit<FluentHomeViewModel, 'textFallback'>): string {
  const domainLine = home.domains.map((domain) => `${domain.label}: ${domain.status}`).join(' | ');
  const actionLine = home.suggestedActions.map((action) => `${action.label} -> ${action.toolName}`).join('; ');
  return [
    'Fluent Home',
    domainLine,
    `Account: ${home.account.deploymentTrack}/${home.account.backendMode}, ${home.account.access}, timezone ${home.account.timezone}`,
    `Meals: ${home.memory.meals.currentPlan ?? 'No active plan'} ${home.memory.meals.groceryReadiness ?? ''} ${home.memory.meals.inventory} ${home.memory.meals.mealMemory}`.trim(),
    `Style: ${home.memory.style.closet} ${home.memory.style.coverage}`,
    `Health: ${home.memory.health.activeBlock ?? 'No active block'} ${home.memory.health.today ?? ''} ${home.memory.health.trainingSupport}`.trim(),
    `Suggested actions: ${actionLine || 'Enable or finish onboarding for a domain to unlock actions.'}`,
  ].join('\n');
}
