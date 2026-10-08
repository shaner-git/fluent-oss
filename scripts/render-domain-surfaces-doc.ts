import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeNewlines, readFrozenContractSnapshot } from './render-public-doc-shared';

const defaultOutFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fluent-domain-surfaces.md');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exit(1); });

export function renderDomainSurfacesMarkdown(): string {
  const snapshot = readFrozenContractSnapshot();
  const tools = new Set(snapshot.tools);
  const list = (names: string[]) => names.filter((name) => tools.has(name)).map((name) => `- \`${name}\``);
  return [
    '# Fluent Domain Surfaces', '', `Current contract: \`${snapshot.contractVersion}\``, '',
    'Fluent exposes one cross-host product contract. Style is current; Meals, Health, Wellbeing and budgets are retired.', '',
    '<!-- current-tools:start -->',
    '## Shared context and evidence', '', ...list(['fluent_get_capabilities','fluent_get_account_status','fluent_get_closet_context','fluent_get_profile','fluent_update_profile','fluent_list_closet_items','fluent_get_closet_item','fluent_list_closet_evidence','fluent_get_closet_item_photos','fluent_archive_closet_item']), '',
    '## Style', '', ...list(['fluent_update_closet_item','fluent_set_closet_item_cover','fluent_reorder_closet_item_photos','fluent_hide_closet_item_photo','fluent_replace_closet_item_photo','fluent_undo_closet_item_photo_change','fluent_add_closet_item_photo','fluent_restore_closet_item','fluent_merge_closet_items','fluent_save_closet_item_product_details','fluent_undo_closet_item_merge','fluent_add_closet_item','fluent_record_closet_item_feedback','fluent_set_closet_item_photo','fluent_show_closet']), '',
    'Style supplies saved closet context and media. The assistant owns visual interpretation and stylist judgment. Fluent does not extract arbitrary product pages.', '',
    '<!-- current-tools:end -->',
    '## Retired', '',
    'Meals was retired on 2026-10-06. Its recipe, meal-plan and grocery tools and the Grocery List MCP App are no longer available; the shared tools return a retirement notice for Meals requests. Saved Meals data is kept and included in the account export.', '',
    'Health, Wellbeing and budgets are not currently supported. Earlier Health and budget tools and the old Home dashboard are not available; assistants bring finance context from tools the user has connected.', '',
    '## Resources', '', ...snapshot.resources.map((resource) => `- \`${resource}\``), '',
  ].join('\n');
}

async function main() { const args = parseArgs(process.argv.slice(2)); const outFile = path.resolve(args.out ?? defaultOutFile); const rendered = renderDomainSurfacesMarkdown(); if (args.write === 'true') { await mkdir(path.dirname(outFile), { recursive: true }); await writeFile(outFile, rendered, 'utf8'); } if (args.check === 'true' && normalizeNewlines(await readFile(outFile,'utf8')) !== normalizeNewlines(rendered)) throw new Error(`Domain surfaces doc drift detected in ${outFile}.`); console.log(JSON.stringify({ ok: true, outFile, write: args.write === 'true' }, null, 2)); }
function parseArgs(argv: string[]): Record<string,string> { const result: Record<string,string> = {}; for (let i=0;i<argv.length;i+=1) { const token=argv[i]; if (!token.startsWith('--')) continue; const next=argv[i+1]; if (next && !next.startsWith('--')) { result[token.slice(2)]=next; i+=1; } else result[token.slice(2)]='true'; } return result; }
