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
    'Fluent exposes one cross-host product contract. Meals and Style are current; Budgets is a narrow shared seam; Health and Wellbeing are reserved.', '',
    '<!-- current-tools:start -->',
    '## Shared context and evidence', '', ...list(['fluent_get_capabilities','fluent_get_account_status','fluent_get_context','fluent_get_shared_profile','fluent_update_shared_profile_patch','fluent_list_items','fluent_get_item','fluent_list_evidence','fluent_get_media_bundle','fluent_archive_item']), '',
    '## Meals', '', ...list(['fluent_save_recipe','fluent_update_recipe_patch','fluent_record_recipe_feedback','fluent_save_meal_plan','fluent_apply_grocery_list_change','fluent_apply_grocery_shopping_result','fluent_render_surface']), '',
    'Meals supports host-authored planning, saved recipes, the current grocery list, explicit shopping reconciliation, and the Grocery List MCP App. It does not browse retailers, fill carts, or check out.', '',
    '## Style', '', ...list(['fluent_update_style_item_patch','fluent_create_style_item','fluent_refresh_style_item_profile','fluent_set_style_item_image','fluent_render_style_closet_surface']), '',
    'Style supplies saved closet context and media. The assistant owns visual interpretation and stylist judgment. Fluent does not extract arbitrary product pages.', '',
    '## Budgets', '', ...list(['fluent_get_purchase_context','fluent_set_budget_envelope','fluent_log_budget_spend','fluent_render_budgets_surface']), '',
    'Budgets is limited to manual `meals-groceries` and `style-clothing` monthly envelopes and explicit spend corrections. It is not a banking or finance-data product.', '',
    '<!-- current-tools:end -->',
    '## Reserved', '',
    'Health and Wellbeing have no public tools or resources in this contract. No Home dashboard or earlier domain-specific tool family is registered as a product surface.', '',
    '## Resources', '', ...snapshot.resources.map((resource) => `- \`${resource}\``), '',
  ].join('\n');
}

async function main() { const args = parseArgs(process.argv.slice(2)); const outFile = path.resolve(args.out ?? defaultOutFile); const rendered = renderDomainSurfacesMarkdown(); if (args.write === 'true') { await mkdir(path.dirname(outFile), { recursive: true }); await writeFile(outFile, rendered, 'utf8'); } if (args.check === 'true' && normalizeNewlines(await readFile(outFile,'utf8')) !== normalizeNewlines(rendered)) throw new Error(`Domain surfaces doc drift detected in ${outFile}.`); console.log(JSON.stringify({ ok: true, outFile, write: args.write === 'true' }, null, 2)); }
function parseArgs(argv: string[]): Record<string,string> { const result: Record<string,string> = {}; for (let i=0;i<argv.length;i+=1) { const token=argv[i]; if (!token.startsWith('--')) continue; const next=argv[i+1]; if (next && !next.startsWith('--')) { result[token.slice(2)]=next; i+=1; } else result[token.slice(2)]='true'; } return result; }
