import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FLUENT_MEALS_GROCERY_EXPORT_DIR } from './runtime-paths.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');

if (isInvokedDirectly()) {
  await main();
}

export async function buildHostedGroceryExport(options = {}) {
  const baseUrl = String(options.baseUrl || process.env.FLUENT_BASE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
  const accessToken = String(options.accessToken || process.env.FLUENT_ACCESS_TOKEN || '').trim();
  if (!accessToken) {
    throw new Error('Hosted grocery export requires FLUENT_ACCESS_TOKEN or --access-token.');
  }

  const store = String(options.store || 'voila').toLowerCase();
  const outputPath = resolvePath(
    skillRoot,
    options.outputPath || path.join(FLUENT_MEALS_GROCERY_EXPORT_DIR, `grocery-export-${store}-${todayDateStamp()}.json`),
  );
  const retailerCartItems = Array.isArray(options.retailerCartItems) ? options.retailerCartItems : [];

  const client = new Client({ name: 'fluent-meals-export-builder', version: '0.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  try {
    await client.connect(transport);

    const currentPlan = extractPayload(
      await client.callTool({
        name: 'meals_get_plan',
        arguments: {
          view: 'summary',
        },
      }),
    );
    const weekStart =
      typeof options.weekStart === 'string' && options.weekStart.trim()
        ? options.weekStart.trim()
        : typeof currentPlan?.weekStart === 'string' && currentPlan.weekStart.trim()
          ? currentPlan.weekStart.trim()
          : null;

    if (!weekStart) {
      throw new Error('Could not determine a planning week for the hosted grocery export.');
    }

    let groceryPlan = extractPayload(
      await client.callTool({
        name: 'meals_get_grocery_plan',
        arguments: {
          week_start: weekStart,
          view: 'full',
        },
      }),
    );

    if (!groceryPlan && options.generateIfMissing === true) {
      await client.callTool({
        name: 'meals_generate_grocery_plan',
        arguments: {
          week_start: weekStart,
          response_mode: 'ack',
        },
      });
      groceryPlan = extractPayload(
        await client.callTool({
          name: 'meals_get_grocery_plan',
          arguments: {
            week_start: weekStart,
            view: 'full',
          },
        }),
      );
    }

    if (!groceryPlan?.raw || !Array.isArray(groceryPlan.raw.items)) {
      throw new Error(`No hosted grocery plan exists for week ${weekStart}. Generate it first or pass --generate-if-missing true.`);
    }

    const preparedOrder = extractPayload(
      await client.callTool({
        name: 'meals_prepare_order',
        arguments: {
          week_start: weekStart,
          retailer: store,
          retailer_cart_items: retailerCartItems,
          view: 'full',
        },
      }),
    );

    if (!preparedOrder || !Array.isArray(preparedOrder.remainingToBuy)) {
      throw new Error(`Hosted order preflight for week ${weekStart} did not return a valid remaining-to-buy list.`);
    }

    if (preparedOrder.safeToOrder !== true) {
      const unresolvedNames = Array.isArray(preparedOrder.unresolvedItems)
        ? preparedOrder.unresolvedItems.map((item) => item.displayName).filter(Boolean)
        : [];
      throw new Error(
        `Hosted order preflight for week ${weekStart} is not safe to order yet.${unresolvedNames.length > 0 ? ` Needs review: ${unresolvedNames.join(', ')}.` : ''}`,
      );
    }

    const exportData = {
      version: 4,
      store,
      createdAt: new Date().toISOString(),
      runnerOptions: {
        ambiguityResolution: 'cheapest-safe',
      },
      planMetadata: {
        mealPlanId: groceryPlan.mealPlanId || null,
        retailer: store,
        weekStart,
      },
      source: {
        generatedAt: preparedOrder.freshness?.generatedAt || groceryPlan.generatedAt || null,
        kind: 'hosted-order-preflight',
      },
      assumptions: Array.isArray(preparedOrder.notes) ? preparedOrder.notes : Array.isArray(groceryPlan.raw.notes) ? groceryPlan.raw.notes : [],
      reconciliation: {
        safeToOrder: preparedOrder.safeToOrder === true,
        remainingCount: Array.isArray(preparedOrder.remainingToBuy) ? preparedOrder.remainingToBuy.length : 0,
        coveredCount: Array.isArray(preparedOrder.alreadyCoveredByInventory) ? preparedOrder.alreadyCoveredByInventory.length : 0,
        inCartCount: Array.isArray(preparedOrder.alreadyInRetailerCart) ? preparedOrder.alreadyInRetailerCart.length : 0,
        unresolvedCount: Array.isArray(preparedOrder.unresolvedItems) ? preparedOrder.unresolvedItems.length : 0,
        retailerCartItemsConsidered: retailerCartItems.length,
        freshness: preparedOrder.freshness ?? null,
      },
      items: preparedOrder.remainingToBuy.map((item) => {
        const planItem = Array.isArray(groceryPlan.raw.items)
          ? groceryPlan.raw.items.find((entry) => normalize(entry.name) === normalize(item.displayName))
          : null;
        return {
          itemKey: planItem?.itemKey ?? null,
          name: item.displayName,
          amount: item.quantity ?? null,
          unit: item.unit ?? null,
          orderingPolicy: planItem?.orderingPolicy ?? 'flexible_match',
          searchQuery: buildSearchQuery({
            name: item.displayName,
            preferredBrands: Array.isArray(planItem?.preferredBrands) ? planItem.preferredBrands : [],
          }),
          preferredBrands: Array.isArray(planItem?.preferredBrands) ? planItem.preferredBrands : [],
          avoidBrands: Array.isArray(planItem?.avoidBrands) ? planItem.avoidBrands : [],
          preferSale: true,
          allowedSubstituteQueries: Array.isArray(planItem?.allowedSubstituteQueries) ? planItem.allowedSubstituteQueries : [],
          blockedSubstituteTerms: Array.isArray(planItem?.blockedSubstituteTerms) ? planItem.blockedSubstituteTerms : [],
          sourceMeals: Array.isArray(planItem?.sourceRecipeIds) ? planItem.sourceRecipeIds : [],
          sourceRecipeNames: Array.isArray(planItem?.sourceRecipeNames) ? planItem.sourceRecipeNames : [],
          reasons: Array.isArray(planItem?.reasons) ? planItem.reasons : [],
          uncertainty: null,
          note: item.notes ?? null,
        };
      }),
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(exportData, null, 2)}\n`, 'utf8');

    return {
      itemCount: exportData.items.length,
      outputPath,
      preparedOrder,
      store,
      weekStart,
    };
  } finally {
    await transport.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await buildHostedGroceryExport({
    accessToken: args.accessToken,
    baseUrl: args.baseUrl,
    generateIfMissing: args.generateIfMissing === 'true',
    outputPath: args.output,
    retailerCartItems: parseRetailerCartItems(args.retailerCartItems),
    store: args.store,
    weekStart: args.weekStart,
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

function buildSearchQuery(item) {
  const topBrand = Array.isArray(item.preferredBrands) && item.preferredBrands[0] ? item.preferredBrands[0] : null;
  if (topBrand && !normalize(item.name).includes(normalize(topBrand))) {
    return `${topBrand} ${item.name}`.trim();
  }
  return item.name;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractPayload(result) {
  const structured = result?.structuredContent;
  if (!structured || typeof structured !== 'object') {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(structured, 'value') ? structured.value : structured;
}

function resolvePath(root, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function todayDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[camelize(key)] = next;
      index += 1;
    } else {
      parsed[camelize(key)] = 'true';
    }
  }
  return parsed;
}

function camelize(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseRetailerCartItems(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
