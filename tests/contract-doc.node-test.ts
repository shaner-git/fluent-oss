import nodeAssert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderContractDocMarkdown } from '../scripts/render-contract-doc';
import { renderDomainSurfacesMarkdown } from '../scripts/render-domain-surfaces-doc';
import {
  extractCurrentToolNamesFromMarkdown,
  normalizeNewlines,
  readFrozenContractSnapshot,
} from '../scripts/render-public-doc-shared';
import { renderToolsReferenceMarkdown } from '../scripts/render-tools-reference-doc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(path.join(root, 'docs', 'fluent-contract-v1.md'), 'utf8');
const toolsReferenceDoc = readFileSync(path.join(root, 'docs', 'fluent-tools-reference.md'), 'utf8');
const domainSurfacesDoc = readFileSync(path.join(root, 'docs', 'fluent-domain-surfaces.md'), 'utf8');
const packagedMealSkill = readFileSync(path.join(root, 'plugins', 'fluent', 'skills', 'fluent-meals', 'SKILL.md'), 'utf8');
const claudeMealSkill = readFileSync(
  path.join(root, 'claude-plugin', 'fluent', 'skills', 'fluent-meals', 'SKILL.md'),
  'utf8',
);
const openclawMealSkill = readFileSync(
  path.join(root, 'openclaw-plugin', 'fluent', 'skills', 'fluent-meals', 'SKILL.md'),
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
nodeAssert.equal(
  normalizeNewlines(toolsReferenceDoc),
  normalizeNewlines(renderToolsReferenceMarkdown()),
  'fluent-tools-reference.md must stay in exact parity with the rendered tools reference template.',
);
nodeAssert.equal(
  normalizeNewlines(domainSurfacesDoc),
  normalizeNewlines(renderDomainSurfacesMarkdown()),
  'fluent-domain-surfaces.md must stay in exact parity with the rendered domain surfaces template.',
);
const frozenSnapshot = readFrozenContractSnapshot(path.join(root, 'contracts', 'fluent-contract.v1.json'));
const frozenToolSet = new Set(frozenSnapshot.tools);
for (const toolName of extractCurrentToolNamesFromMarkdown(toolsReferenceDoc)) {
  assert(
    frozenToolSet.has(toolName),
    `fluent-tools-reference.md lists ${toolName} as a current tool, but it is missing from contracts/fluent-contract.v1.json.`,
  );
}
for (const toolName of extractCurrentToolNamesFromMarkdown(domainSurfacesDoc)) {
  assert(
    frozenToolSet.has(toolName),
    `fluent-domain-surfaces.md lists ${toolName} as a current tool, but it is missing from contracts/fluent-contract.v1.json.`,
  );
}
for (const [label, skill] of [
  ['plugins/fluent', packagedMealSkill],
  ['claude-plugin', claudeMealSkill],
  ['openclaw-plugin', openclawMealSkill],
] as const) {
  assert(
    skill.includes(
      'Public vNext writes are limited to `fluent_update_shared_profile_patch` for explicit shared or Meals profile facts, the named recipe tools (`fluent_save_recipe`, `fluent_update_recipe_patch`, `fluent_record_recipe_feedback`), `fluent_save_meal_plan` for one explicit user-approved host-authored meal plan, `fluent_apply_grocery_list_change` for one explicit current-list change, and the narrow budget writes (`fluent_set_budget_envelope`, `fluent_log_budget_spend`) for declared `style-clothing` or `meals-groceries` envelopes/spend.',
    ),
    `${label} meals skill must describe the current eight explicit public write tools.`,
  );
  assert(
    skill.includes('If the connected runtime only shows old `meals_*` detail tools for this public flow'),
    `${label} meals skill must reject stale pre-vNext meals_* detail tools for the public flow.`,
  );
  assert(
    skill.includes(
      'If you offered to save a plan and the user did not answer, ask once more before ending the task or moving past planning. An unanswered offer is not a decline; never save without an answer.',
    ),
    `${label} meals skill must resurface unanswered meal-plan save offers before moving past planning.`,
  );
  assert(
    !skill.includes('meals_mark_meal_cooked'),
    `${label} meals skill must not route current public vNext through retired meals_mark_meal_cooked guidance.`,
  );
}
for (const [label, skill] of [
  ['plugins/fluent', packagedStyleSkill],
  ['claude-plugin', claudeStyleSkill],
  ['openclaw-plugin', openclawStyleSkill],
] as const) {
  assert(
    skill.includes('Start broad Style asks with `fluent_get_context(domain="style", intent="closet")`'),
    `${label} style skill must start broad Style asks from the current public context packet.`,
  );
  assert(
    skill.includes('Use `fluent_get_media_bundle(domain="style", ...)` for saved-item media outside the one-read purchase verdict flow.'),
    `${label} style skill must scope the media bundle to saved-item media outside the one-read purchase verdict flow (Phase 1 verdicts read owned-category images from the context packet).`,
  );
  assert(
    skill.includes(
      'Do not save broad Style profile facts through public vNext. Public Style item writes are limited to explicit, user-approved onboarding via `fluent_create_style_item` (you produce the profile from photos and the user confirms the draft), existing-item profile refreshes via `fluent_refresh_style_item_profile`, detail/photo updates via `fluent_update_style_item_patch` and `fluent_set_style_item_image`, and the non-destructive `fluent_archive_item`. Budget envelope/spend writes are limited to the `style-clothing` declared-envelope category and do not create closet memory.',
    ),
    `${label} style skill must permit explicit user-approved closet onboarding while preserving the no-public-Style-facts boundary and the narrow budget exception.`,
  );
  assert(
    skill.includes('Do not call, name as active guidance, or wait for old tools such as `style_prepare_purchase_analysis`'),
    `${label} style skill must reject stale pre-vNext Style tools.`,
  );
}

console.log('contract doc alignment ok');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
