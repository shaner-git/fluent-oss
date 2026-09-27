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
    '- Every write requires explicit user intent. Verify saved state with read-after-write proof; if that read fails, distinguish a confirmed commit from an unknown outcome and never blindly repeat the write.',
    '- Grocery checkboxes save immediately through `fluent_apply_grocery_shopping_result` with `selection.kind="item_checkbox"`, `item_key`, and `checked`. Every operation binds `list_id`, `list_version`, `week_start`, and a stable `idempotency_key`. Unchecking additionally requires the exact `purchase_id` returned by the check. The list change, inventory presence update, and receipt are atomic; undo restores only that purchase\'s prior state and refuses to overwrite later edits. Existing `selected_items` and `all_to_buy` operations remain supported. `groceryShoppingEvidence.checkboxPurchases` supplies active checkbox purchase identities for reload and undo.',
    '- `fluent_get_shared_profile.profile` exposes only the user-facing display name and timezone. Internal profile/tenant identifiers and profile metadata are never part of that public projection.',
    '',
    '## Tools',
    '',
    ...FLUENT_TOOL_NAMES.map((tool) => `- \`${tool}\``),
    '',
    '## Tool effects and Style patch validation',
    '',
    'Tool annotations describe the most consequential supported mode, not authorization. Overwrites, removals and archive operations advertise `destructiveHint: true` even when reversible. Public image fetch modes on `fluent_get_item`, `fluent_get_media_bundle` and `fluent_create_style_item` advertise `openWorldHint: true`; this does not enable retailer browsing or checkout. Shared hosted and OSS registration applies the same classifications. Write tools remain conservatively non-idempotent at tool level; operation-specific replay guarantees are unchanged.',
    '',
    '`fluent_update_style_item_patch` rejects the entire patch before storage when it contains unsupported `care`, `notes`, `tags` or `use_case` fields, including mixed supported/unsupported patches and attempted clears. These legacy keys remain declared so stale clients receive an explicit error rather than a false save claim. Use `fluent_refresh_style_item_profile` for supported tags and styling descriptors; attributed care facts use `product_enrichment` with an empty patch. Omitted supported fields remain untouched. Cached clients may include `patch.mode="merge"`; this optional fixed marker is accepted and stripped before the sparse patch is applied. Other mode values remain invalid. Acceptance-test patches are non-durable and the text response does not claim a save.',
    '',
    '## Resources',
    'Product enrichment candidate: `fluent_update_style_item_patch` accepts optional `product_enrichment` with an empty `patch`, `expected_revision`, UUID `operation_id`, and a complete attributed product reference. New items are created first, then enriched using their saved ID. Confirmed references expose material, care and a product link; candidates and rejected matches remain model-facing. Cloud/OSS migration 0033 adds tenant-scoped storage. Enrichment never browses retailers, accesses email, or edits ownership, fit or media. See docs/fluent-tools-reference.md for replacement and conflict rules. This candidate requires host acceptance before production promotion.',
    '',
    ...FLUENT_RESOURCE_URIS.map((resource) => `- \`${resource}\``),
    '',
    '## Optional capabilities',
    '',
    ...FLUENT_OPTIONAL_CAPABILITIES.map((capability) => `- \`${capability}\``),
    '',
    '',
    "Garment lineage: an approved `link_garments` change records `source=\"user_report\"`, a note, and unique zero-based garment slots with same-account closet item IDs (or null to withdraw a match). `resolved_garments` is the current identity projection, independent of feedback pagination, with exact source-event references and current closet labels. Original garments, unknowns, photos, and observations remain historical. Feedback can carry `garment_indices`; absent indices means outfit-level evidence. Listing with `item_id` finds current links, including confirmations made after trial creation; follow continuation even on empty filtered pages. Confirm ownership before using closet onboarding for missing items; unowned store try-ons remain labeled trial garments and must not be added to the owned closet automatically. No additional public tools or migrations are introduced.",
    '',
    "Unowned try-ons: garment ownership is owned, not_owned, or unknown. An unowned garment has no closet ID but may carry structured product brand, model, size_tried, variant, SKU, store, and an HTTPS product_url (reference only; no fetch). Later linking to the closet requires explicit ownership=owned after the user confirms acquisition; it preserves the original product and size-specific notes under a stable trial_garment_ref. Synthetic creation records (evidence_kind=synthetic) are excluded from normal lists and Style context even after linking, and explicit reads warn that they are not user evidence. This is not a merchant catalog or automatic purchase/closet ingestion feature.",
    '',
    '## Version policy',
    '',
    `- ${FLUENT_CONTRACT_FREEZE.versionPolicy.minimumClientBehavior}`,
    `- ${FLUENT_CONTRACT_FREEZE.versionPolicy.packageUpdateRule}`,
    '- `contracts/fluent-public-profile.json` is generated from the same source as this contract and is the machine-readable host/package profile.',
    '',
    "## Connected account labels\n\nThe additive `fluent_get_account_profile` identity tool returns a stable opaque ID and optional display name for the current authenticated connection. See [Connected account identification](./cloud/connected-account-profile.md) for identity, privacy, permissions, parity, and review boundaries.",
    '',
    "### Add photos to an existing Style item (candidate)\n\n`fluent_set_style_item_image` accepts optional `photo_action: \"add\" | \"replace\"`.\nOmitted or `replace` retains the existing role-slot behavior. `add` accepts only\noriginal `alternate` (product/detail) or `fit` photos; it cannot approve or replace\na primary Catalog. Existing photos and their primary/source bindings are retained.\nThe response includes `photoId` and `photoAction` for exact readback verification.\nRepeating the same input representation and role reuses its added photo ID; this\nis not content deduplication across different URLs, encodings or roles. Host-file\nURLs can change between uploads. Cover preparation remains host-driven and a\nreviewed Catalog is committed only after the host prepares it. Older projections\nwithout `photo_action` must not use replacement as an append fallback.\nThis additive schema is a local candidate until deployment/host acceptance.\n\n### Durable wardrobe photo arrangement\n\n`fluent_update_style_item_patch` accepts optional `photo_library` with `expected_revision` (64-character SHA-256 revision from the closet render), `operation_id` (UUID), and `action`: `remove` (`photoId`, optional `coverId`), `cover` (`photoId`), `reorder` (`ids`), `replace` (`photoId`, `replacementId` for an already saved photo), or `undo` (`token`). `patch` must be empty and duplicate-merge restoration cannot be combined. The existing approval and Style write scope apply. Photo and artifact records remain retained. Revision checks bind both the saved arrangement and underlying photo tuples; concurrent changes fail closed. Same-operation replay is idempotent, but reused IDs with different actions fail. Undo is persisted for the latest arrangement change and invalidated by later media changes. `photoRevision`, `photoUndoToken`, `coverPhotoId`, and media `hidden`/`sourcePhotoId` are returned by closet rendering. No-cover is explicit and does not promote a fit photo. Shared Cloud/OSS storage requires migration 0032; no new public tool name is introduced.",
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
