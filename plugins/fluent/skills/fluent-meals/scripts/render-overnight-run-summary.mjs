import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { FLUENT_MEALS_OVERNIGHT_REPORT_DIR } from './runtime-paths.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');

if (isInvokedDirectly()) {
  await main();
}

export async function renderOvernightRunSummary(options = {}) {
  const reportPath = resolvePath(
    skillRoot,
    options.reportPath || path.join(FLUENT_MEALS_OVERNIGHT_REPORT_DIR, `preflight-${todayDateStamp()}.json`),
  );
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const markdown = [
    '# Fluent Meals Overnight Run Summary',
    '',
    `- Checked at: ${report.checkedAt ?? 'unknown'}`,
    `- Store: ${report.store ?? 'unknown'}`,
    `- Week start: ${report.weekStart ?? 'unknown'}`,
    `- Grocery export: ${report.groceryExportPath ?? 'not generated'}`,
    `- Item count: ${report.itemCount ?? 0}`,
    '',
    '## Status',
    '',
    report.ok ? 'Ready for retailer execution.' : 'Preflight failed.',
    '',
  ].join('\n');

  const outputPath = resolvePath(
    skillRoot,
    options.outputPath || path.join(FLUENT_MEALS_OVERNIGHT_REPORT_DIR, `summary-${todayDateStamp()}.md`),
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${markdown}\n`, 'utf8');

  return {
    ok: true,
    outputPath,
    reportPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await renderOvernightRunSummary({
    outputPath: args.output,
    reportPath: args.report,
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
