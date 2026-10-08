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

assert.equal(normalizeNewlines(doc), normalizeNewlines(renderContractDocMarkdown()));
assert.equal(normalizeNewlines(tools), normalizeNewlines(renderToolsReferenceMarkdown()));
assert.equal(normalizeNewlines(domains), normalizeNewlines(renderDomainSurfacesMarkdown()));

const snapshot = readFrozenContractSnapshot(path.join(root, 'contracts', 'fluent-contract.v2.json'));
for (const generatedDoc of [tools, domains]) {
  const names = extractCurrentToolNamesFromMarkdown(generatedDoc);
  for (const name of names) assert.ok(snapshot.tools.includes(name), `${name} must be in the frozen contract.`);
}
assert.equal(snapshot.tools.length, 26);
assert.equal(snapshot.resources.length, 1);
assert.match(doc, /2026-10-08\.fluent-core-v2\.3/);
assert.match(domains, /Health, Wellbeing and budgets are not currently supported/);
// Meals is retired (D30, 2026-10-06): no generated doc lists a Meals tool or the Grocery List resource.
assert.match(domains, /Meals was retired on 2026-10-06/);
assert.doesNotMatch(
  `${doc}\n${tools}\n${domains}`,
  /`fluent_(?:save_recipe|update_recipe_patch|record_recipe_feedback|save_meal_plan|apply_grocery_list_change|apply_grocery_shopping_result|render_surface)`|fluent-grocery-list/,
);
assert.doesNotMatch(`${doc}\n${tools}\n${domains}`, /public vNext|10 resources|compatibility render|Home dashboard.*current/);

for (const skill of ['fluent-core', 'fluent-style']) {
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
  assert.equal(
    existsSync(path.join(root, host, 'skills/fluent-meals/SKILL.md')),
    false,
    `${host} must not package the retired Meals skill.`,
  );
}

console.log('Fluent 2.0 contract doc alignment ok');

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8');
}
