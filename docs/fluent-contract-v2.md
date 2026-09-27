# Fluent Public Contract 2.0

Contract version: `2026-07-09.fluent-core-v2.0`

This is the single product contract exposed by hosted and open-source `/mcp`. The pre-launch 2.0 reset intentionally removed every earlier public alias, versioned resource tail, compatibility profile, and full-runtime route.

## Product boundary

- Meals and Style are current; Budgets is limited to manual meals-groceries and style-clothing envelopes; Health and Wellbeing are reserved.
- The assistant performs planning and judgment; Fluent supplies personal context, evidence, media, and explicit bounded writes.
- Browser operation, retailer checkout, product-page extraction, raw financial data, medical decisions, and operator tools are outside this contract.
- Every write requires explicit user intent. Verify saved state with read-after-write proof; if that read fails, distinguish a confirmed commit from an unknown outcome and never blindly repeat the write.
- Grocery checkboxes save immediately through `fluent_apply_grocery_shopping_result` with `selection.kind="item_checkbox"`, `item_key`, and `checked`. Every operation binds `list_id`, `list_version`, `week_start`, and a stable `idempotency_key`. Unchecking additionally requires the exact `purchase_id` returned by the check. The list change, inventory presence update, and receipt are atomic; undo restores only that purchase's prior state and refuses to overwrite later edits. Existing `selected_items` and `all_to_buy` operations remain supported. `groceryShoppingEvidence.checkboxPurchases` supplies active checkbox purchase identities for reload and undo.
- `fluent_get_shared_profile.profile` exposes only the user-facing display name and timezone. Internal profile/tenant identifiers and profile metadata are never part of that public projection.

## Tools

- `fluent_get_capabilities`
- `fluent_get_account_status`
- `fluent_get_account_profile`
- `fluent_get_context`
- `fluent_get_shared_profile`
- `fluent_update_shared_profile_patch`
- `fluent_list_items`
- `fluent_get_item`
- `fluent_save_recipe`
- `fluent_update_recipe_patch`
- `fluent_record_recipe_feedback`
- `fluent_save_meal_plan`
- `fluent_apply_grocery_list_change`
- `fluent_apply_grocery_shopping_result`
- `fluent_get_purchase_context`
- `fluent_set_budget_envelope`
- `fluent_log_budget_spend`
- `fluent_update_style_item_patch`
- `fluent_create_style_item`
- `fluent_refresh_style_item_profile`
- `fluent_set_style_item_image`
- `fluent_archive_item`
- `fluent_list_evidence`
- `fluent_get_media_bundle`
- `fluent_render_surface`
- `fluent_render_budgets_surface`
- `fluent_render_style_closet_surface`

## Tool effects and Style patch validation

Tool annotations describe the most consequential supported mode, not authorization. Overwrites, removals and archive operations advertise `destructiveHint: true` even when reversible. Public image fetch modes on `fluent_get_item`, `fluent_get_media_bundle` and `fluent_create_style_item` advertise `openWorldHint: true`; this does not enable retailer browsing or checkout. Shared hosted and OSS registration applies the same classifications. Write tools remain conservatively non-idempotent at tool level; operation-specific replay guarantees are unchanged.

`fluent_update_style_item_patch` rejects the entire patch before storage when it contains unsupported `care`, `notes`, `tags` or `use_case` fields, including mixed supported/unsupported patches and attempted clears. These legacy keys remain declared so stale clients receive an explicit error rather than a false save claim. Use `fluent_refresh_style_item_profile` for supported tags and styling descriptors; attributed care facts use `product_enrichment` with an empty patch. Omitted supported fields remain untouched. Cached clients may include `patch.mode="merge"`; this optional fixed marker is accepted and stripped before the sparse patch is applied. Other mode values remain invalid. Acceptance-test patches are non-durable and the text response does not claim a save.

## Resources
Product enrichment candidate: `fluent_update_style_item_patch` accepts optional `product_enrichment` with an empty `patch`, `expected_revision`, UUID `operation_id`, and a complete attributed product reference. New items are created first, then enriched using their saved ID. Confirmed references expose material, care and a product link; candidates and rejected matches remain model-facing. Cloud/OSS migration 0033 adds tenant-scoped storage. Enrichment never browses retailers, accesses email, or edits ownership, fit or media. See docs/fluent-tools-reference.md for replacement and conflict rules. This candidate requires host acceptance before production promotion.

- `ui://widget/fluent-grocery-list.html`
- `ui://widget/fluent-budgets-envelope-setup.html`
- `ui://widget/fluent-style-closet-v7.html`
- `ui://widget/fluent-style-closet-v8.html`
- `ui://widget/fluent-style-closet-v20.html`
- `ui://widget/fluent-style-closet-v21.html`
- `ui://widget/fluent-style-closet-v22.html`
- `ui://widget/fluent-style-closet-v23.html`
- `ui://widget/fluent-style-closet-v24.html`
- `ui://widget/fluent-style-closet-v25.html`
- `ui://widget/fluent-style-closet-v26.html`
- `ui://widget/fluent-style-closet-v27.html`
- `ui://widget/fluent-style-closet-v33.html`
- `ui://widget/fluent-style-closet.html`

## Optional capabilities

- `structured_content`
- `shared_context`
- `provenance`
- `read_after_write`
- `meals_planning`
- `recipe_management`
- `grocery_list`
- `grocery_shopping_reconcile`
- `budget_envelopes`
- `style_closet`
- `style_media`
- `mcp_apps`


Garment lineage: an approved `link_garments` change records `source="user_report"`, a note, and unique zero-based garment slots with same-account closet item IDs (or null to withdraw a match). `resolved_garments` is the current identity projection, independent of feedback pagination, with exact source-event references and current closet labels. Original garments, unknowns, photos, and observations remain historical. Feedback can carry `garment_indices`; absent indices means outfit-level evidence. Listing with `item_id` finds current links, including confirmations made after trial creation; follow continuation even on empty filtered pages. Confirm ownership before using closet onboarding for missing items; unowned store try-ons remain labeled trial garments and must not be added to the owned closet automatically. No additional public tools or migrations are introduced.

Unowned try-ons: garment ownership is owned, not_owned, or unknown. An unowned garment has no closet ID but may carry structured product brand, model, size_tried, variant, SKU, store, and an HTTPS product_url (reference only; no fetch). Later linking to the closet requires explicit ownership=owned after the user confirms acquisition; it preserves the original product and size-specific notes under a stable trial_garment_ref. Synthetic creation records (evidence_kind=synthetic) are excluded from normal lists and Style context even after linking, and explicit reads warn that they are not user evidence. This is not a merchant catalog or automatic purchase/closet ingestion feature.

## Version policy

- Clients and packages must require this 2.0 contract or newer.
- Any future breaking contract change requires a new major contract and matching package release.
- `contracts/fluent-public-profile.json` is generated from the same source as this contract and is the machine-readable host/package profile.

## Connected account labels

The additive `fluent_get_account_profile` identity tool returns a stable opaque ID and optional display name for the current authenticated connection. See [Connected account identification](./cloud/connected-account-profile.md) for identity, privacy, permissions, parity, and review boundaries.

### Add photos to an existing Style item (candidate)

`fluent_set_style_item_image` accepts optional `photo_action: "add" | "replace"`.
Omitted or `replace` retains the existing role-slot behavior. `add` accepts only
original `alternate` (product/detail) or `fit` photos; it cannot approve or replace
a primary Catalog. Existing photos and their primary/source bindings are retained.
The response includes `photoId` and `photoAction` for exact readback verification.
Repeating the same input representation and role reuses its added photo ID; this
is not content deduplication across different URLs, encodings or roles. Host-file
URLs can change between uploads. Cover preparation remains host-driven and a
reviewed Catalog is committed only after the host prepares it. Older projections
without `photo_action` must not use replacement as an append fallback.
This additive schema is a local candidate until deployment/host acceptance.

### Durable wardrobe photo arrangement

`fluent_update_style_item_patch` accepts optional `photo_library` with `expected_revision` (64-character SHA-256 revision from the closet render), `operation_id` (UUID), and `action`: `remove` (`photoId`, optional `coverId`), `cover` (`photoId`), `reorder` (`ids`), `replace` (`photoId`, `replacementId` for an already saved photo), or `undo` (`token`). `patch` must be empty and duplicate-merge restoration cannot be combined. The existing approval and Style write scope apply. Photo and artifact records remain retained. Revision checks bind both the saved arrangement and underlying photo tuples; concurrent changes fail closed. Same-operation replay is idempotent, but reused IDs with different actions fail. Undo is persisted for the latest arrangement change and invalidated by later media changes. `photoRevision`, `photoUndoToken`, `coverPhotoId`, and media `hidden`/`sourcePhotoId` are returned by closet rendering. No-cover is explicit and does not promote a fit photo. Shared Cloud/OSS storage requires migration 0032; no new public tool name is introduced.
