import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURRENT_RENDER_TOOL_HOST_GUIDE,
  PREVIEW_RICH_TOOL_GUIDE,
  formatCodeList,
  normalizeNewlines,
  readFrozenContractSnapshot,
  renderToolSetLine,
  splitCurrentToolGroups,
  validateDocInputs,
} from './render-public-doc-shared';

const defaultOutFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fluent-tools-reference.md');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export function renderToolsReferenceMarkdown(): string {
  const snapshot = readFrozenContractSnapshot();
  validateDocInputs(snapshot);
  const groups = splitCurrentToolGroups(snapshot);

  return [
    '# Fluent Tools Reference',
    '',
    'This page is generated from `contracts/fluent-contract.v1.json`.',
    'Anything listed as a current tool is present in the frozen public contract artifact. Preview items are intentionally not current contract tools.',
    '',
    `Current contract version: \`${snapshot.contractVersion}\``,
    '',
    '## How To Read This Page',
    '',
    '- Canonical data tools are the durable plain-MCP tools that carry Fluent state and work across hosts.',
    '- Host-specific render tools are current contract tools that rely on MCP output-template or widget support.',
    '- Preview or planned surfaces may exist in probes or design work, but they are not part of the current public contract.',
    '',
    '## Current Contract Tools',
    '',
    '<!-- current-tools:start -->',
    '### Core Platform Tools',
    '',
    ...formatCodeList(groups.core),
    '',
    '### Meals Canonical Data Tools',
    '',
    ...formatCodeList(groups.mealsCanonical),
    '',
    '### Meals Host-Specific Render Tools',
    '',
    ...formatCodeList(groups.mealsRender),
    '',
    '### Health Canonical Data Tools',
    '',
    ...formatCodeList(groups.healthCanonical),
    '',
    '### Style Canonical Data Tools',
    '',
    ...formatCodeList(groups.styleCanonical),
    '',
    '### Style Host-Specific Render Tools',
    '',
    ...formatCodeList(groups.styleRender),
    '<!-- current-tools:end -->',
    '',
    '## Current Render Host Classification',
    '',
    `- ChatGPT/App-SDK-style current render tools: ${renderToolSetLine(
      CURRENT_RENDER_TOOL_HOST_GUIDE.map((guide) => guide.name),
    )}`,
    '- Claude-specific current render tools: none. Claude should prefer canonical data tools and host-native visuals.',
    '- OpenClaw-compatible current render tools: none as dedicated Fluent rich widgets. OpenClaw should use the plain-MCP fallbacks.',
    '- Plain-MCP fallback tools stay canonical even when a render tool exists.',
    '',
    '## Current Render Host Matrix',
    '',
    '| Tool | Host class | Claude guidance | OpenClaw guidance | Plain-MCP fallback |',
    '| --- | --- | --- | --- | --- |',
    ...CURRENT_RENDER_TOOL_HOST_GUIDE.map(
      (guide) =>
        `| \`${guide.name}\` | ${guide.hostClass} | ${guide.claude} | ${guide.openclaw} | ${guide.plainMcpFallback} |`,
    ),
    '',
    '## Preview Or Planned Rich Surfaces',
    '',
    '| Tool | Lane | Status | Note |',
    '| --- | --- | --- | --- |',
    ...PREVIEW_RICH_TOOL_GUIDE.map(
      (guide) => `| \`${guide.name}\` | ${guide.lane} | ${guide.status} | ${guide.note} |`,
    ),
    '',
    'These preview entries are intentionally not part of the current public contract until they are added to `contracts/fluent-contract.v1.json` and the runtime actually registers them.',
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outFile = path.resolve(args.out ?? defaultOutFile);
  const rendered = renderToolsReferenceMarkdown();

  if (args.write === 'true') {
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, rendered, 'utf8');
  }

  if (args.check === 'true') {
    const existing = await readFile(outFile, 'utf8');
    if (normalizeNewlines(existing) !== normalizeNewlines(rendered)) {
      throw new Error(`Tools reference doc drift detected in ${outFile}. Re-run: tsx scripts/render-tools-reference-doc.ts --write`);
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
