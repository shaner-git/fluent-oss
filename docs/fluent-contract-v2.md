# Fluent Public Contract 2.0

Contract version: `2026-10-08.fluent-core-v2.3`

This is the single product contract exposed by hosted and open-source `/mcp`. The pre-launch 2.0 reset intentionally removed every earlier public alias, versioned resource tail, compatibility profile, and full-runtime route.

## Product boundary

- Style is current; Meals, Health, Wellbeing and budgets are retired.
- The assistant performs planning and judgment; Fluent supplies personal context, evidence, media, and explicit bounded writes.
- Browser operation, retailer checkout, product-page extraction, raw financial data, medical decisions, and operator tools are outside this contract.
- Every write requires explicit user intent. Verify saved state with read-after-write proof; if that read fails, distinguish a confirmed commit from an unknown outcome and never blindly repeat the write.
- Meals was retired on 2026-10-06 (D30). The Meals tools and the Grocery List resource are no longer registered; cached clients calling them get "tool not found". The shared tools still accept `domain="meals"`, the Meals item types and the food fact kinds so cached clients validate, but those calls return a plain `MealsRetired` result with no Meals data and write nothing. Saved Meals data stays stored and is included in the account export.
- `fluent_get_profile.profile` exposes only the user-facing display name and timezone. Internal profile/tenant identifiers and profile metadata are never part of that public projection.

## Tools

- `fluent_get_capabilities`
- `fluent_get_account_status`
- `fluent_get_account`
- `fluent_get_closet_context`
- `fluent_get_profile`
- `fluent_update_profile`
- `fluent_list_closet_items`
- `fluent_get_closet_item`
- `fluent_update_closet_item`
- `fluent_set_closet_item_cover`
- `fluent_reorder_closet_item_photos`
- `fluent_hide_closet_item_photo`
- `fluent_replace_closet_item_photo`
- `fluent_undo_closet_item_photo_change`
- `fluent_add_closet_item_photo`
- `fluent_restore_closet_item`
- `fluent_merge_closet_items`
- `fluent_save_closet_item_product_details`
- `fluent_undo_closet_item_merge`
- `fluent_add_closet_item`
- `fluent_record_closet_item_feedback`
- `fluent_set_closet_item_photo`
- `fluent_archive_closet_item`
- `fluent_list_closet_evidence`
- `fluent_get_closet_item_photos`
- `fluent_show_closet`

## Tool effects and Style patch validation

Tool annotations describe the most consequential supported mode, not authorization. Overwrites, removals and archive operations advertise `destructiveHint: true` even when reversible. Public image fetch modes on `fluent_get_closet_item`, `fluent_get_closet_item_photos` and `fluent_add_closet_item` advertise `openWorldHint: true`; this does not enable retailer browsing or checkout. Shared hosted and OSS registration applies the same classifications. Write tools remain conservatively non-idempotent at tool level; operation-specific replay guarantees are unchanged.

`fluent_update_closet_item` rejects the entire patch before storage when it contains unsupported `care`, `notes`, `tags` or `use_case` fields, including mixed supported/unsupported patches and attempted clears. These legacy keys remain declared so stale clients receive an explicit error rather than a false save claim. Use `fluent_record_closet_item_feedback` for supported tags and styling descriptors; attributed care facts use `fluent_save_closet_item_product_details`. Omitted supported fields remain untouched. Cached clients may include `patch.mode="merge"`; this optional fixed marker is accepted and stripped before the sparse patch is applied. Other mode values remain invalid. Acceptance-test patches are non-durable and the text response does not claim a save.

One operation per tool (contract `2026-10-08.fluent-core-v2.3`). `fluent_update_closet_item` only edits item details; `fluent_restore_closet_item` restores an archived item; `fluent_archive_closet_item` only archives; `fluent_merge_closet_items` merges a confirmed duplicate and `fluent_undo_closet_item_merge` undoes exactly one outstanding merge; `fluent_add_closet_item_photo` adds a photo and `fluent_set_closet_item_photo` sets a role slot; photo arrangement is five tools (`fluent_set_closet_item_cover`, `fluent_reorder_closet_item_photos`, `fluent_hide_closet_item_photo`, `fluent_replace_closet_item_photo`, `fluent_undo_closet_item_photo_change`); product details use `fluent_save_closet_item_product_details`. Behavior is unchanged from the former multiplexed parameters. A call that still sends a former parameter (`photo_library`, `product_enrichment`, `expected_duplicate_merge_id`, `patch.status`, `merge_into_item_id`, `merge_operation_id`, or `photo_action`) is rejected with the replacement tool named, and nothing is saved.

## Resources
Product enrichment: `fluent_save_closet_item_product_details` takes `item_id`, `expected_revision`, UUID `operation_id`, and a complete attributed product `reference`. New items are created first, then enriched using their saved ID. Confirmed references expose material, care and a product link; candidates and rejected matches remain model-facing. Cloud/OSS migration 0033 adds tenant-scoped storage. Enrichment never browses retailers, accesses email, or edits ownership, fit or media. See docs/fluent-tools-reference.md for replacement and conflict rules. This candidate requires host acceptance before production promotion.

- `ui://widget/fluent-style-closet.html`

## Optional capabilities

- `structured_content`
- `shared_context`
- `provenance`
- `read_after_write`
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

The additive `fluent_get_account` identity tool returns a stable opaque ID and optional display name for the current authenticated connection. See [Connected account identification](./cloud/connected-account-profile.md) for identity, privacy, permissions, parity, and review boundaries.

### Add photos to an existing Style item

`fluent_add_closet_item_photo` adds one original `alternate` (product/detail) or `fit` photo to an existing item; it cannot approve or replace
a primary Catalog. Existing photos and their primary/source bindings are retained.
The response includes `photoId` and `photoAction` for exact readback verification.
Repeating the same input representation and role reuses its added photo ID; this
is not content deduplication across different URLs, encodings or roles. Host-file
URLs can change between uploads. `fluent_set_closet_item_photo` sets (replaces) one role slot, such as the primary cover;
a reviewed Catalog is committed only after the host prepares it.

### Durable wardrobe photo arrangement

Five tools change an item's photo arrangement, one change each: `fluent_set_closet_item_cover` (`photo_id`), `fluent_reorder_closet_item_photos` (`photo_ids`), `fluent_hide_closet_item_photo` (`photo_id`, and `next_cover_photo_id` when hiding the cover), `fluent_replace_closet_item_photo` (`photo_id`, `replacement_photo_id` for an already saved photo) and `fluent_undo_closet_item_photo_change` (`undo_token`). Each takes `item_id`, `expected_revision` (64-character SHA-256 revision from the closet render) and `operation_id` (UUID). The existing approval and Style write scope apply. Hidden photo files are kept. Revision checks bind both the saved arrangement and underlying photo tuples; concurrent changes fail closed. Same-operation replay is idempotent, but reused IDs with different changes fail. Undo is persisted for the latest arrangement change and invalidated by later media changes. `photoRevision`, `photoUndoToken`, `coverPhotoId`, and media `hidden`/`sourcePhotoId` are returned by closet rendering. No-cover is explicit and does not promote a fit photo. Shared Cloud/OSS storage requires migration 0032.

### Duplicate merge and Undo

`fluent_merge_closet_items` moves a confirmed duplicate's retained photos into the item that stays, fills only its missing core details, and archives the duplicate under a client `merge_operation_id`. `fluent_undo_closet_item_merge` takes the archived duplicate's `item_id` and that exact `merge_id` (`duplicateMergeId` from closet rendering). It first requires an outstanding merge with that ID on that item; otherwise it fails and nothing changes. It then restores the item and returns its transferred photos.
