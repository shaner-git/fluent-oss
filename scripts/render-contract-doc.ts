import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLUENT_CONTRACT_FREEZE,
  FLUENT_CONTRACT_VERSION,
  FLUENT_OPTIONAL_CAPABILITIES,
  FLUENT_RESOURCE_URIS,
  FLUENT_TOOL_NAMES,
} from '../src/contract';

const defaultOutFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fluent-contract-v2.md');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export function renderContractDocMarkdown(): string {
  return [
    '# Fluent Public Contract 2.0',
    '',
    `Contract version: \`${FLUENT_CONTRACT_VERSION}\``,
    '',
    'This is the single product contract exposed by hosted and open-source `/mcp`. The pre-launch 2.0 reset intentionally removed every earlier public alias, versioned resource tail, compatibility profile, and full-runtime route.',
    '',
    '## Product boundary',
    '',
    `- ${FLUENT_CONTRACT_FREEZE.productScope}`,
    '- The assistant performs planning and judgment; Fluent supplies personal context, evidence, media, and explicit bounded writes.',
    '- Browser operation, retailer checkout, product-page extraction, raw financial data, medical decisions, and operator tools are outside this contract.',
    '- Every write requires explicit user intent and read-after-write proof.',
    '- `fluent_get_shared_profile.profile` exposes only the user-facing display name and timezone. Internal profile/tenant identifiers and profile metadata are never part of that public projection.',
    '',
    '## Tools',
    '',
    ...FLUENT_TOOL_NAMES.map((tool) => `- \`${tool}\``),
    '',
    '## Resources',
    '',
    ...FLUENT_RESOURCE_URIS.map((resource) => `- \`${resource}\``),
    '',
    '## Optional capabilities',
    '',
    ...FLUENT_OPTIONAL_CAPABILITIES.map((capability) => `- \`${capability}\``),
    '',
    '## Version policy',
    '',
    `- ${FLUENT_CONTRACT_FREEZE.versionPolicy.minimumClientBehavior}`,
    `- ${FLUENT_CONTRACT_FREEZE.versionPolicy.packageUpdateRule}`,
    '- `contracts/fluent-public-profile.json` is generated from the same source as this contract and is the machine-readable host/package profile.',
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
    if (normalize(existing) !== normalize(rendered)) throw new Error(`Contract doc drift detected in ${outFile}.`);
  }
  console.log(JSON.stringify({ ok: true, outFile, write: args.write === 'true' }, null, 2));
}

function normalize(value: string) { return value.replace(/\r\n/g, '\n'); }
function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) { result[token.slice(2)] = next; index += 1; }
    else result[token.slice(2)] = 'true';
  }
  return result;
}
