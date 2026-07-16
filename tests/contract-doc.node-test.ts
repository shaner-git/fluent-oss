import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderContractDocMarkdown } from '../scripts/render-contract-doc';
import { renderDomainSurfacesMarkdown } from '../scripts/render-domain-surfaces-doc';
import { extractCurrentToolNamesFromMarkdown, normalizeNewlines, readFrozenContractSnapshot } from '../scripts/render-public-doc-shared';
import { renderToolsReferenceMarkdown } from '../scripts/render-tools-reference-doc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = read('docs/fluent-contract-v2.md');
const tools = read('docs/fluent-tools-reference.md');
const domains = read('docs/fluent-domain-surfaces.md');
const architecture = read('docs/fluent-platform-architecture.md');
const readme = read('README.md');

assert.equal(normalizeNewlines(doc), normalizeNewlines(renderContractDocMarkdown()));
assert.equal(normalizeNewlines(tools), normalizeNewlines(renderToolsReferenceMarkdown()));
assert.equal(normalizeNewlines(domains), normalizeNewlines(renderDomainSurfacesMarkdown()));

const snapshot = readFrozenContractSnapshot(path.join(root, 'contracts', 'fluent-contract.v2.json'));
for (const generatedDoc of [tools, domains]) {
  const names = extractCurrentToolNamesFromMarkdown(generatedDoc);
  for (const name of names) assert.ok(snapshot.tools.includes(name), `${name} must be in the frozen contract.`);
}
assert.equal(snapshot.tools.length, 26);
assert.equal(snapshot.resources.length, 3);
assert.match(doc, /2026-07-09\.fluent-core-v2\.0/);
assert.match(domains, /Health and Wellbeing are not currently supported/);
assert.doesNotMatch(`${doc}\n${tools}\n${domains}`, /public vNext|10 resources|compatibility render|Home dashboard.*current/);
assert.match(readme, /Make your AI fluent in what matters\./);
assert.match(readme, /bringing in the information that matters for each question/);
assert.match(readme, /The AI app handles the conversation and recommendation\./);
assert.match(architecture, /Meals and Style domain semantics, with Budgets as a narrow shared seam/);
assert.match(architecture, /Reserved public areas:\s+- `health`\s+- `wellbeing`/);
assert.match(architecture, /Cloudflare Access is retired from the hosted end-user auth path/);
assert.doesNotMatch(architecture, /Current domains:\s+[\s\S]*?- `health`/);

for (const skill of ['fluent-core', 'fluent-meals', 'fluent-style']) {
  const codex = read(`plugins/fluent/skills/${skill}/SKILL.md`);
  assert.equal(read(`claude-plugin/fluent/skills/${skill}/SKILL.md`), codex);
  assert.equal(read(`openclaw-plugin/fluent/skills/${skill}/SKILL.md`), codex);
}

for (const host of ['plugins/fluent', 'claude-plugin/fluent', 'openclaw-plugin/fluent']) {
  assert.equal(
    existsSync(path.join(root, host, 'skills/fluent-health/SKILL.md')),
    false,
    `${host} must not package the retired Health skill.`,
  );
}

console.log('Fluent 2.0 contract doc alignment ok');

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8');
}
