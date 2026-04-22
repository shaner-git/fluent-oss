import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURRENT_RENDER_TOOL_HOST_GUIDE,
  PREVIEW_RICH_TOOL_GUIDE,
  formatCodeList,
  normalizeNewlines,
  readFrozenContractSnapshot,
  splitCurrentToolGroups,
  validateDocInputs,
} from './render-public-doc-shared';

const defaultOutFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fluent-domain-surfaces.md');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export function renderDomainSurfacesMarkdown(): string {
  const snapshot = readFrozenContractSnapshot();
  validateDocInputs(snapshot);
  const groups = splitCurrentToolGroups(snapshot);
  const previewMeals = PREVIEW_RICH_TOOL_GUIDE.filter((tool) => tool.name.startsWith('meals_'));
  const previewHealth = PREVIEW_RICH_TOOL_GUIDE.filter((tool) => tool.name.startsWith('health_'));
  const previewStyle = PREVIEW_RICH_TOOL_GUIDE.filter((tool) => tool.name.startsWith('style_'));

  return [
    '# Fluent Domain Surfaces',
    '',
    'This page is generated from `contracts/fluent-contract.v1.json` plus an explicit preview list for rich surfaces that are not yet in the public contract.',
    '',
    `Current contract version: \`${snapshot.contractVersion}\``,
    '',
    '## Meals',
    '',
    'Meals currently ships a broad canonical planning and execution surface, plus a narrow set of widget-style render tools for hosts that support MCP output templates.',
    '',
    '<!-- current-tools:start -->',
    '### Current Canonical Meals Tools',
    '',
    ...formatCodeList(groups.mealsCanonical),
    '',
    '### Current Meals Render Tools',
    '',
    ...formatCodeList(groups.mealsRender),
    '<!-- current-tools:end -->',
    '',
    'Current host guidance:',
    '',
    '- ChatGPT/App-SDK-style hosts can use the current Meals render tools.',
    '- Claude should prefer `meals_get_recipe`, `meals_get_grocery_plan`, and inventory reads, then render host-native visuals.',
    '- OpenClaw should use the plain-MCP Meals data tools rather than depending on Fluent widget rendering.',
    '',
    'Preview only:',
    '',
    ...previewMeals.map((tool) => `- \`${tool.name}\`: ${tool.note}`),
    '',
    '## Health',
    '',
    'Health currently ships the block-first coaching surface. The current week is derived through canonical data reads instead of a public rich widget contract.',
    '',
    '<!-- current-tools:start -->',
    '### Current Canonical Health Tools',
    '',
    ...formatCodeList(groups.healthCanonical),
    '<!-- current-tools:end -->',
    '',
    'Current host guidance:',
    '',
    '- There are no current Health render tools in the frozen public contract.',
    '- Use `health_get_block_projection`, `health_get_today_context`, and the workout or body-metric writes as the durable plain-MCP path.',
    '',
    'Preview only:',
    '',
    ...previewHealth.map((tool) => `- \`${tool.name}\`: ${tool.note}`),
    '',
    '## Style',
    '',
    'Style currently ships canonical closet and purchase-analysis data tools, plus one current rich purchase-analysis widget for hosts that support MCP output templates.',
    '',
    '<!-- current-tools:start -->',
    '### Current Canonical Style Tools',
    '',
    ...formatCodeList(groups.styleCanonical),
    '',
    '### Current Style Render Tools',
    '',
    ...formatCodeList(groups.styleRender),
    '<!-- current-tools:end -->',
    '',
    'Current host guidance:',
    '',
    '- ChatGPT/App-SDK-style hosts can use `style_render_purchase_analysis`.',
    '- Claude should prefer `style_analyze_purchase` plus `style_get_visual_bundle` when visual evidence is needed.',
    '- OpenClaw should use the plain-MCP Style data tools rather than depending on Fluent widget rendering.',
    '',
    previewStyle.length > 0 ? 'Preview only:' : 'Preview only: none right now.',
    '',
    ...previewStyle.map((tool) => `- \`${tool.name}\`: ${tool.note}`),
    '',
    '## Render Host Summary',
    '',
    `- Current ChatGPT/App-SDK-style render tools: ${CURRENT_RENDER_TOOL_HOST_GUIDE.map((guide) => `\`${guide.name}\``).join(', ')}`,
    '- Current Claude-specific render tools: none.',
    '- Current OpenClaw-specific render tools: none.',
    '- Plain-MCP fallbacks remain the canonical cross-host path for every domain.',
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outFile = path.resolve(args.out ?? defaultOutFile);
  const rendered = renderDomainSurfacesMarkdown();

  if (args.write === 'true') {
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, rendered, 'utf8');
  }

  if (args.check === 'true') {
    const existing = await readFile(outFile, 'utf8');
    if (normalizeNewlines(existing) !== normalizeNewlines(rendered)) {
      throw new Error(`Domain surfaces doc drift detected in ${outFile}. Re-run: tsx scripts/render-domain-surfaces-doc.ts --write`);
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
