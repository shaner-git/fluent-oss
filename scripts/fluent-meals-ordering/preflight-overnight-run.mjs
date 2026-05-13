import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildHostedGroceryExport } from './build-grocery-export.mjs';
import { FLUENT_MEALS_GROCERY_EXPORT_DIR, FLUENT_MEALS_OVERNIGHT_REPORT_DIR } from './runtime-paths.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');

if (isInvokedDirectly()) {
  await main();
}

export async function preflightOvernightRun(options = {}) {
  const store = String(options.store || 'voila').toLowerCase();
  const exportResult = await buildHostedGroceryExport({
    accessToken: options.accessToken,
    baseUrl: options.baseUrl,
    generateIfMissing: options.generateIfMissing !== false,
    outputPath:
      options.outputPath ||
      path.join(FLUENT_MEALS_GROCERY_EXPORT_DIR, `grocery-export-${store}-${todayDateStamp()}.json`),
    store,
    weekStart: options.weekStart,
  });

  const report = {
    ok: exportResult.preparedOrder?.safeToOrder === true,
    checkedAt: new Date().toISOString(),
    store,
    weekStart: exportResult.weekStart,
    groceryExportPath: exportResult.outputPath,
    itemCount: exportResult.itemCount,
    coveredCount: Array.isArray(exportResult.preparedOrder?.alreadyCoveredByInventory)
      ? exportResult.preparedOrder.alreadyCoveredByInventory.length
      : 0,
    inCartCount: Array.isArray(exportResult.preparedOrder?.alreadyInRetailerCart)
      ? exportResult.preparedOrder.alreadyInRetailerCart.length
      : 0,
    unresolvedCount: Array.isArray(exportResult.preparedOrder?.unresolvedItems)
      ? exportResult.preparedOrder.unresolvedItems.length
      : 0,
  };

  const reportPath = resolvePath(
    skillRoot,
    options.reportPath || path.join(FLUENT_MEALS_OVERNIGHT_REPORT_DIR, `preflight-${store}-${todayDateStamp()}.json`),
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return {
    ...report,
    reportPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await preflightOvernightRun({
    accessToken: args.accessToken,
    baseUrl: args.baseUrl,
    generateIfMissing: args.generateIfMissing !== 'false',
    outputPath: args.output,
    reportPath: args.report,
    store: args.store,
    weekStart: args.weekStart,
  });
  console.log(JSON.stringify(result, null, 2));
}

function resolvePath(root, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(root, value);
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

function todayDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
