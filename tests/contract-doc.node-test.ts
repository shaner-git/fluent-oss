import nodeAssert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderContractDocMarkdown } from '../scripts/render-contract-doc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(path.join(root, 'docs', 'fluent-contract-v1.md'), 'utf8');
const packagedMealSkill = readFileSync(path.join(root, 'plugins', 'fluent', 'skills', 'fluent-meals', 'SKILL.md'), 'utf8');
const claudeMealSkill = readFileSync(
  path.join(root, 'claude-plugin', 'fluent', 'skills', 'fluent-meals', 'SKILL.md'),
  'utf8',
);
const packagedStyleSkill = readFileSync(path.join(root, 'plugins', 'fluent', 'skills', 'fluent-style', 'SKILL.md'), 'utf8');
const claudeStyleSkill = readFileSync(
  path.join(root, 'claude-plugin', 'fluent', 'skills', 'fluent-style', 'SKILL.md'),
  'utf8',
);
const openclawStyleSkill = readFileSync(
  path.join(root, 'openclaw-plugin', 'fluent', 'skills', 'fluent-style', 'SKILL.md'),
  'utf8',
);

nodeAssert.equal(
  normalizeNewlines(doc),
  normalizeNewlines(renderContractDocMarkdown()),
  'fluent-contract-v1.md must stay in exact parity with the rendered contract doc template.',
);
assert(
  packagedMealSkill.includes('When the user says they are already cooking a planned meal or have started prep:'),
  'plugins/fluent meals skill must instruct the agent to mark a started meal as cooked before refreshing plan reads.',
);
assert(
  packagedMealSkill.includes('- call `meals_mark_meal_cooked` before refreshing plan reads'),
  'plugins/fluent meals skill must call meals_mark_meal_cooked before refreshing plan reads.',
);
assert(
  claudeMealSkill.includes('When the user says they are already cooking a planned meal or have started prep:'),
  'claude-plugin meals skill must instruct the agent to mark a started meal as cooked before refreshing plan reads.',
);
assert(
  claudeMealSkill.includes('- call `meals_mark_meal_cooked` before refreshing plan reads'),
  'claude-plugin meals skill must call meals_mark_meal_cooked before refreshing plan reads.',
);
assert(
  packagedStyleSkill.includes(
    'Treat broad asks like "what do you think of my shoe game?" or "how is my style looking?" as closet-analysis requests first, not as image-upload requests.',
  ),
  'plugins/fluent style skill must route broad wardrobe questions through closet analysis before asking for photos.',
);
assert(
  packagedStyleSkill.includes(
    'Only ask for an uploaded image when the answer depends on a specific unsupplied candidate item, fit photo, or missing visual evidence that Fluent does not already have.',
  ),
  'plugins/fluent style skill must reserve photo requests for truly missing visual evidence.',
);
assert(
  packagedStyleSkill.includes(
    'Do not claim a Style write succeeded unless the mutation returned successfully and a follow-up read confirms the state you intended to set.',
  ),
  'plugins/fluent style skill must require mutation success plus readback before claiming a write succeeded.',
);
assert(
  claudeStyleSkill.includes(
    'Treat broad asks like "what do you think of my shoe game?" or "how is my style looking?" as closet-analysis requests first, not as image-upload requests.',
  ),
  'claude-plugin style skill must route broad wardrobe questions through closet analysis before asking for photos.',
);
assert(
  claudeStyleSkill.includes(
    'Only ask for an uploaded image when the answer depends on a specific unsupplied candidate item, fit photo, or missing visual evidence that Fluent does not already have.',
  ),
  'claude-plugin style skill must reserve photo requests for truly missing visual evidence.',
);
assert(
  claudeStyleSkill.includes(
    'Do not claim a Style write succeeded unless the mutation returned successfully and a follow-up read confirms the state you intended to set.',
  ),
  'claude-plugin style skill must require mutation success plus readback before claiming a write succeeded.',
);
assert(
  openclawStyleSkill.includes(
    'Treat broad asks like "what do you think of my shoe game?" or "how is my style looking?" as closet-analysis requests first, not as image-upload requests.',
  ),
  'openclaw-plugin style skill must route broad wardrobe questions through closet analysis before asking for photos.',
);
assert(
  openclawStyleSkill.includes(
    'Only ask for an uploaded image when the answer depends on a specific unsupplied candidate item, fit photo, or missing visual evidence that Fluent does not already have.',
  ),
  'openclaw-plugin style skill must reserve photo requests for truly missing visual evidence.',
);
assert(
  openclawStyleSkill.includes(
    'Do not claim a Style write succeeded unless the mutation returned successfully and a follow-up read confirms the state you intended to set.',
  ),
  'openclaw-plugin style skill must require mutation success plus readback before claiming a write succeeded.',
);

console.log('contract doc alignment ok');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, '\n');
}
