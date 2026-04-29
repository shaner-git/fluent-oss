import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLUENT_CONTRACT_FREEZE,
  FLUENT_CONTRACT_VERSION,
  FLUENT_DEV_RESOURCE_URIS,
  FLUENT_DEV_TOOL_NAMES,
  FLUENT_OPTIONAL_CAPABILITIES,
  FLUENT_RESOURCE_URIS,
  FLUENT_TOOL_ALIASES,
  FLUENT_TOOL_NAMES,
} from '../src/contract';

const defaultOutFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fluent-contract-v1.md');

const TOOL_DISCOVERY_FIELDS = [
  'toolDiscovery.canonicalRegistry',
  'toolDiscovery.note',
  'toolDiscovery.groups',
];

const ADDITIVE_GUIDANCE = [
  '`readyDomains` is now a required readiness field and the primary package routing primitive',
  '`toolDiscovery` may provide workflow-oriented starter tool hints, but MCP `tools/list` and `contract.tools` remain the authoritative full registry',
  '`meals_list_tools` may expose a fallback directory with full tool names and workflow groups when `fluent_get_capabilities` is deferred in a client surface',
  '`fluent_get_home` may expose a one-product Fluent Home overview with domain readiness, sanitized Meals/Style/Health memory snapshots, account/access state, text fallback, and optional ChatGPT/App SDK widget metadata',
  '`meals_delete_inventory_item` permanently removes a stale or incorrect inventory row when the user explicitly asks for hard deletion',
  '`meals_prepare_order` distinguishes the raw grocery plan from an order-ready remaining-to-buy artifact after reconciling current inventory and optional retailer cart state',
  '`meals_upsert_grocery_plan_action` may persist pantry-first sufficiency confirmations (`have_enough`, `have_some_need_to_buy`, `dont_have_it`) that affect `meals_prepare_order` without changing canonical inventory truth',
  '`meals_upsert_grocery_plan_action` accepts optional `purchased_at` on `purchased` actions so receipt-backed grocery lines can refresh future durable inventory coverage without inventing quantities',
  '`meals_upsert_grocery_plan_action` may persist `in_cart` progress for grocery lines that were added to a local retailer basket so `meals_prepare_order` can treat them as already in cart without treating them as purchased or inventory-backed',
  'Recent durable pantry evidence and short-window frozen evidence may implicitly cover future grocery lines when exact quantity is unknown, while fresh and refrigerated items remain conservative by default',
  '`fluent://meals/confirmed-order-sync/{retailer}/{retailer_order_id}` may expose the latest canonical summary for a confirmed retailer order so local browser workflows can safely no-op or resume idempotent sync',
  'Confirmed retailer order sync remains workflow-driven, but canonical matched purchases and ordered extras must still be written through existing Meals MCP write tools',
  'Delivery calendar follow-through remains workflow-side; `fluent-meals` may emit a portable delivery-event candidate keyed by retailer order id, but calendar creation is not part of the Meals MCP contract',
  'Health now exposes a block-first fitness coaching surface with preferences, goals, training blocks, today resolution, review context, workout logs, and optional body metrics',
  'Health onboarding is lightweight: the domain is ready once Health is enabled, onboarding is completed, and `health_preferences` have been saved',
  'Health persists the active training block as canonical truth, while the current week and today\'s workout are derived views',
  'Health may reason about training goals and rough nutrition constraints, but meal execution remains in Meals',
  'Per-domain routing hints under `metadata.fluent` remain advisory only',
  'Meal plans, planning-critical preferences, recipes, grocery-plan outputs, inventory, feedback, and audit history are MCP-native',
  'Meals may consume Health\'s derived `trainingSupportSummary`, but Health remains the only canonical owner of training structure',
  'Style now exposes a narrow closet-derived domain surface with import-seeded items, canonical comparator keys, typed media roles, item status, minimal onboarding/calibration state, typed item profiles, and coverage-aware wardrobe-context purchase analysis',
  'The Meals render tools stay in the frozen public contract because Fluent early access and the open-source runtime both register the output-template resources required to serve them',
  '`meals_show_recipe` stays registered as a runtime alias for `meals_render_recipe_card`, but the frozen contract keeps the canonical tool name only',
  '`meals_render_grocery_widget_smoke` and its standalone widget resource stay dev-only for host verification and are intentionally excluded from the frozen public contract',
  'Hosts that do not support MCP output templates should still prefer `meals_get_recipe` and `meals_get_grocery_plan` as the portable data-first fallback',
  'Retailer/cart execution remains skill-side by design',
];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export function renderContractDocMarkdown(): string {
  return [
    '# Fluent MCP Contract v1 Freeze',
    '',
    `This document records the current Fluent MCP \`${FLUENT_CONTRACT_VERSION.split('.fluent-core-')[1]}\` freeze for the shared Fluent contract.`,
    '',
    'Current freeze note:',
    '',
    `- ${FLUENT_CONTRACT_FREEZE.backwardCompatibility}`,
    '',
    '## Frozen Surface',
    '',
    `- contract version: \`${FLUENT_CONTRACT_VERSION}\``,
    '- resources:',
    ...formatCodeList(FLUENT_RESOURCE_URIS),
    '- tools:',
    ...formatCodeList(FLUENT_TOOL_NAMES),
    '- optional capabilities:',
    ...formatCodeList(FLUENT_OPTIONAL_CAPABILITIES),
    '',
    '## Runtime Notes',
    '',
    'Registered runtime aliases:',
    '',
    ...FLUENT_TOOL_ALIASES.map((entry) => `- \`${entry.name}\` -> \`${entry.canonicalTool}\`: ${entry.note}`),
    '',
    'Registered dev-only surfaces:',
    '',
    ...formatCodeList(FLUENT_DEV_TOOL_NAMES),
    ...formatCodeList(FLUENT_DEV_RESOURCE_URIS),
    '',
    '## Required Capability Fields',
    '',
    '`fluent_get_capabilities` must continue to return:',
    '',
    ...formatCodeList(FLUENT_CONTRACT_FREEZE.requiredFields),
    '',
    'It may also return additive guided discovery hints under:',
    '',
    ...formatCodeList(TOOL_DISCOVERY_FIELDS),
    '',
    '## Version Policy',
    '',
    `- ${FLUENT_CONTRACT_FREEZE.versionPolicy.minimumClientBehavior}`,
    '- Capability discovery is the source of truth for the active contract version.',
    '- After this freeze point, contract changes must be additive only.',
    `- ${FLUENT_CONTRACT_FREEZE.versionPolicy.packageUpdateRule}`,
    '',
    '## Scope Exception',
    '',
    FLUENT_CONTRACT_FREEZE.scopeException,
    '',
    '## Local Parity Rule',
    '',
    'The open-source runtime must use the same public tool names, resource names, payload shapes, provenance fields, and onboarding writes as early-access Fluent. The legacy `backendMode = "local"` bridge value may remain, but differences in transport or auth are allowed only when they do not change the MCP contract itself.',
    '',
    'The Meals rich render tools stay in the public contract only because the runtime really registers them in both deployment tracks. Hosts without MCP output-template support should still fall back to the portable data tools.',
    '',
    '## Phase 20 Additive Guidance',
    '',
    FLUENT_CONTRACT_FREEZE.backwardCompatibility,
    '',
    'Current additive guidance:',
    '',
    ...formatPlainList(ADDITIVE_GUIDANCE),
    '',
    'These are additive only and do not change the frozen resource or tool names.',
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outFile = path.resolve(args.out ?? defaultOutFile);
  const rendered = renderContractDocMarkdown();

  if (args.write === 'true') {
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, rendered, 'utf8');
  }

  if (args.check === 'true') {
    const existing = await readFile(outFile, 'utf8');
    if (normalizeNewlines(existing) !== normalizeNewlines(rendered)) {
      throw new Error(`Contract doc drift detected in ${outFile}. Re-run: tsx scripts/render-contract-doc.ts --write`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        outFile,
        write: args.write === 'true',
      },
      null,
      2,
    ),
  );
}

function formatCodeList(items: readonly string[]) {
  return items.map((item) => `  - \`${item}\``);
}

function formatPlainList(items: readonly string[]) {
  return items.map((item) => `- ${item}`);
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, '\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}
