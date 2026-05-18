import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type FrozenContractSnapshot = {
  contractVersion: string;
  optionalCapabilities: string[];
  resources: string[];
  tools: string[];
};

export type CurrentToolGroups = {
  core: string[];
  healthCanonical: string[];
  mealsCanonical: string[];
  mealsRender: string[];
  styleCanonical: string[];
  styleRender: string[];
};

export type RenderToolHostGuide = {
  name: string;
  hostClass: string;
  claude: string;
  openclaw: string;
  plainMcpFallback: string;
};

export type PreviewToolGuide = {
  name: string;
  lane: string;
  status: string;
  note: string;
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const defaultFrozenContractPath = path.join(rootDir, 'contracts', 'fluent-contract.v1.json');

export const CURRENT_MEALS_RENDER_TOOL_NAMES = [
  'meals_render_recipe_card',
  'meals_render_pantry_dashboard',
  'meals_render_grocery_list_v2',
] as const;

export const CURRENT_STYLE_RENDER_TOOL_NAMES = [
  'style_show_setup_calibration_widget',
  'style_show_purchase_analysis_widget',
] as const;

export const CURRENT_RENDER_TOOL_NAMES = [
  ...CURRENT_MEALS_RENDER_TOOL_NAMES,
  ...CURRENT_STYLE_RENDER_TOOL_NAMES,
] as const;

export const CURRENT_RENDER_TOOL_HOST_GUIDE: readonly RenderToolHostGuide[] = [
  {
    name: 'meals_render_recipe_card',
    hostClass: 'ChatGPT/MCP Apps-style widget',
    claude:
      'In Claude MCP Apps-capable runs, use this as the native Fluent recipe-card surface for ordinary recipe-opening asks. In Claude visualizer-only runs, prefer `meals_get_recipe` and let Claude render a host-native card.',
    openclaw: 'Use the plain-MCP recipe read path.',
    plainMcpFallback: '`meals_get_recipe`',
  },
  {
    name: 'meals_render_pantry_dashboard',
    hostClass: 'ChatGPT/App-SDK-style widget',
    claude: 'Prefer canonical inventory reads and a host-native summary.',
    openclaw: 'Use the plain-MCP inventory path.',
    plainMcpFallback: '`meals_get_inventory_summary` plus `meals_get_inventory` when detail is needed',
  },
  {
    name: 'meals_render_grocery_list_v2',
    hostClass: 'ChatGPT/App-SDK-style widget',
    claude:
      'In Claude MCP Apps-capable runs, use this as the native Fluent grocery-list surface for ordinary display asks. In Claude visualizer-only runs, prefer `meals_get_current_grocery_list` and let Claude render from that living-list data. Use `meals_get_grocery_plan` only for explicit week-scoped/raw plan detail.',
    openclaw: 'Use `meals_get_current_grocery_list` as the plain-MCP living-list path.',
    plainMcpFallback: '`meals_get_current_grocery_list`',
  },
  {
    name: 'style_show_setup_calibration_widget',
    hostClass: 'ChatGPT/MCP Apps-style widget',
    claude:
      'Use this only in a separate Claude MCP Apps native probe where `ui://` resources visibly mount. In visualizer-only or text-only runs, do not call the widget; read `style_get_onboarding_calibration`, ask the smallest useful confirmation question, and write explicit responses with `style_record_calibration_response`.',
    openclaw:
      'Do not call this widget tool. Use `style_get_onboarding_calibration`, then write explicit user confirmations or starter items with the canonical write tools.',
    plainMcpFallback:
      '`style_get_onboarding_calibration` plus `style_record_calibration_response` and `style_add_starter_closet_item` when the user explicitly changes state',
  },
  {
    name: 'style_show_purchase_analysis_widget',
    hostClass: 'ChatGPT/MCP Apps-style widget',
    claude:
      'In Claude MCP Apps-capable runs, use this as the native Fluent purchase-analysis surface after the staged evidence flow and real host image inspection. In Claude visualizer-only or text-only runs, use `style_prepare_purchase_analysis`, page extraction when needed, `style_get_purchase_vision_packet`, host image inspection, `style_submit_purchase_visual_observations` when exposed, then `style_render_purchase_analysis` for the final structured/text result. If the submit tool is unavailable, pass concrete `visual_evidence` with `source: "host_vision"` directly to `style_render_purchase_analysis`.',
    openclaw:
      'Do not call this widget tool. Use the plain-MCP purchase-analysis path and answer from `style_render_purchase_analysis` after real visual evidence is available.',
    plainMcpFallback:
      '`style_prepare_purchase_analysis` plus page extraction, `style_get_purchase_vision_packet`, and `style_render_purchase_analysis` with accepted or direct `host_vision` evidence',
  },
] as const;

export const PREVIEW_RICH_TOOL_GUIDE: readonly PreviewToolGuide[] = [
  {
    name: 'meals_render_week_plan',
    lane: 'Meals rich week planning',
    status: 'Preview only',
    note: 'Exists in local probe HTML, but is not registered by the current runtime and is not in the frozen public contract.',
  },
  {
    name: 'health_render_training_week',
    lane: 'Health rich training-week surface',
    status: 'Preview only',
    note: 'Exists in local probe HTML, but is not registered by the current runtime and is not in the frozen public contract.',
  },
  {
    name: 'health_update_training_session',
    lane: 'Health training-week widget companion action',
    status: 'Preview only',
    note: 'Appears as a probe-only action tool for the training-week mock surface, but is not registered by the current runtime and is not in the frozen public contract.',
  },
] as const;

export function readFrozenContractSnapshot(filePath = defaultFrozenContractPath): FrozenContractSnapshot {
  return JSON.parse(readFileSync(filePath, 'utf8')) as FrozenContractSnapshot;
}

export function splitCurrentToolGroups(snapshot: FrozenContractSnapshot): CurrentToolGroups {
  const currentRenderToolSet = new Set<string>(CURRENT_RENDER_TOOL_NAMES);
  const core: string[] = [];
  const healthCanonical: string[] = [];
  const mealsCanonical: string[] = [];
  const mealsRender: string[] = [];
  const styleCanonical: string[] = [];
  const styleRender: string[] = [];

  for (const tool of snapshot.tools) {
    if (tool.startsWith('fluent_')) {
      core.push(tool);
      continue;
    }

    if (tool.startsWith('health_')) {
      healthCanonical.push(tool);
      continue;
    }

    if (tool.startsWith('meals_')) {
      if (currentRenderToolSet.has(tool)) {
        mealsRender.push(tool);
      } else {
        mealsCanonical.push(tool);
      }
      continue;
    }

    if (tool.startsWith('style_')) {
      if (currentRenderToolSet.has(tool)) {
        styleRender.push(tool);
      } else {
        styleCanonical.push(tool);
      }
      continue;
    }
  }

  return {
    core,
    healthCanonical,
    mealsCanonical,
    mealsRender,
    styleCanonical,
    styleRender,
  };
}

export function extractCurrentToolNamesFromMarkdown(markdown: string): string[] {
  const matches = Array.from(markdown.matchAll(/<!-- current-tools:start -->([\s\S]*?)<!-- current-tools:end -->/g));
  const currentSections = matches.map((match) => match[1] ?? '').join('\n');
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const match of currentSections.matchAll(/`([a-z]+_[a-z0-9_]+)`/g)) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }

  return ordered;
}

export function formatCodeList(items: readonly string[]) {
  return items.map((item) => `- \`${item}\``);
}

export function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, '\n');
}

export function renderToolSetLine(items: readonly string[]) {
  return items.length > 0 ? items.map((item) => `\`${item}\``).join(', ') : 'None.';
}

export function validateDocInputs(snapshot: FrozenContractSnapshot) {
  const snapshotTools = new Set(snapshot.tools);

  for (const guide of CURRENT_RENDER_TOOL_HOST_GUIDE) {
    if (!snapshotTools.has(guide.name)) {
      throw new Error(`Current render tool ${guide.name} is missing from ${defaultFrozenContractPath}.`);
    }
  }

  for (const preview of PREVIEW_RICH_TOOL_GUIDE) {
    if (snapshotTools.has(preview.name)) {
      throw new Error(`Preview tool ${preview.name} is already in ${defaultFrozenContractPath} and must not stay in preview.`);
    }
  }
}
