import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeNewlines, readFrozenContractSnapshot } from './render-public-doc-shared';

const defaultOutFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fluent-tools-reference.md');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}

export function renderToolsReferenceMarkdown(): string {
  const snapshot = readFrozenContractSnapshot();
  const writes = new Set([
    'fluent_update_shared_profile_patch', 'fluent_save_recipe', 'fluent_update_recipe_patch',
    'fluent_record_recipe_feedback', 'fluent_save_meal_plan', 'fluent_apply_grocery_list_change',
    'fluent_apply_grocery_shopping_result', 'fluent_set_budget_envelope', 'fluent_log_budget_spend',
    'fluent_update_style_item_patch', 'fluent_create_style_item', 'fluent_refresh_style_item_profile',
    'fluent_set_style_item_image', 'fluent_archive_item',
  ]);
  const renders = new Set(['fluent_render_surface', 'fluent_render_budgets_surface', 'fluent_render_style_closet_surface']);
  const reads = snapshot.tools.filter((tool) => !writes.has(tool) && !renders.has(tool));
  return [
    '# Fluent Tools Reference', '',
    `Current contract: \`${snapshot.contractVersion}\``, '',
    'This reference is generated from the single Fluent 2.0 public contract. There is no full, legacy, or compatibility tool lane.', '',
    '<!-- current-tools:start -->',
    '## Reads', '', ...reads.map((tool) => `- \`${tool}\``), '',
    '## Explicit writes', '', ...snapshot.tools.filter((tool) => writes.has(tool)).map((tool) => `- \`${tool}\``), '',
    '## Optional render adapters', '', ...snapshot.tools.filter((tool) => renders.has(tool)).map((tool) => `- \`${tool}\``),
    '<!-- current-tools:end -->', '',
    '## Product enrichment candidate', '',
    '`fluent_update_style_item_patch` accepts `product_enrichment` with an empty `patch`, `expected_revision` from the item (0 when absent), UUID `operation_id`, and a complete attributed `reference`. References contain candidate/confirmed/rejected status, match basis, public product URL, brand/name/code, dated sources, and source-linked colour/composition/care/construction/origin facts. Preserve unchanged facts when replacing a reference. Stale revisions and changed replays fail; identical latest-operation retries are idempotent. Conflicting confirmed facts require user confirmation. New items are created first, then enriched using their saved ID.', '',
    'Only confirmed references appear in the widget. Enrichment does not browse, read email, edit personal fit/size, or alter media. Add inspected retailer photos using the existing alternate-photo add operation. Shared Cloud/OSS migration 0033 is required; references participate in tenant export, snapshot and account deletion. This is a test candidate, not a production or host-acceptance claim.', '',
    'Writes require explicit user intent. Verify saved state with read-after-write proof; an unavailable readback must distinguish a confirmed commit from an unknown outcome without blindly repeating the write. Render adapters are optional presentation layers; structured data and text remain canonical.', '',
    '`fluent_get_shared_profile` returns shared facts plus a minimal public profile projection containing only `displayName` and `timezone`; it excludes internal identifiers and metadata in hosted and open-source runtimes.', '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2)); const outFile = path.resolve(args.out ?? defaultOutFile); const rendered = renderToolsReferenceMarkdown();
  if (args.write === 'true') { await mkdir(path.dirname(outFile), { recursive: true }); await writeFile(outFile, rendered, 'utf8'); }
  if (args.check === 'true' && normalizeNewlines(await readFile(outFile, 'utf8')) !== normalizeNewlines(rendered)) throw new Error(`Tools reference doc drift detected in ${outFile}.`);
  console.log(JSON.stringify({ ok: true, outFile, write: args.write === 'true' }, null, 2));
}

function parseArgs(argv: string[]): Record<string, string> { const result: Record<string, string> = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (!token.startsWith('--')) continue; const next = argv[i + 1]; if (next && !next.startsWith('--')) { result[token.slice(2)] = next; i += 1; } else result[token.slice(2)] = 'true'; } return result; }
