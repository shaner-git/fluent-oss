# Fluent Tools Reference

Current contract: `2026-10-08.fluent-core-v2.3`

This reference is generated from the single Fluent 2.0 public contract. There is no full, legacy, or compatibility tool lane.

<!-- current-tools:start -->
## Reads

- `fluent_get_capabilities`
- `fluent_get_account_status`
- `fluent_get_account`
- `fluent_get_closet_context`
- `fluent_get_profile`
- `fluent_list_closet_items`
- `fluent_get_closet_item`
- `fluent_list_closet_evidence`
- `fluent_get_closet_item_photos`

## Explicit writes

- `fluent_update_profile`
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

## Optional render adapters

- `fluent_show_closet`
<!-- current-tools:end -->

## One operation per tool

Each tool performs one operation. `fluent_update_closet_item` only edits item details; restoring an archived item uses `fluent_restore_closet_item`, merging a confirmed duplicate uses `fluent_merge_closet_items` (undo with `fluent_undo_closet_item_merge`), adding a photo uses `fluent_add_closet_item_photo`, each photo arrangement change has its own tool, and product details use `fluent_save_closet_item_product_details`. A call that still sends a former multiplexed parameter is rejected with the replacement tool named; nothing is saved.

## Product enrichment

`fluent_save_closet_item_product_details` takes `item_id`, `expected_revision` from the item (0 when absent), UUID `operation_id`, and a complete attributed `reference`. References contain candidate/confirmed/rejected status, match basis, public product URL, brand/name/code, dated sources, and source-linked colour/composition/care/construction/origin facts. Preserve unchanged facts when replacing a reference. Stale revisions and changed replays fail; identical latest-operation retries are idempotent. Conflicting confirmed facts require user confirmation. New items are created first, then enriched using their saved ID.

Only confirmed references appear in the widget. Enrichment does not browse, read email, edit personal fit/size, or alter media. Add inspected retailer photos using the existing alternate-photo add operation. Shared Cloud/OSS migration 0033 is required; references participate in tenant export, snapshot and account deletion. This is a test candidate, not a production or host-acceptance claim.

Writes require explicit user intent. Verify saved state with read-after-write proof; an unavailable readback must distinguish a confirmed commit from an unknown outcome without blindly repeating the write. Render adapters are optional presentation layers; structured data and text remain canonical.

`fluent_get_profile` returns shared facts plus a minimal public profile projection containing only `displayName` and `timezone`; it excludes internal identifiers and metadata in hosted and open-source runtimes. Food facts (allergies, dietary pattern, meal taste) are no longer returned.

Meals is retired (2026-10-06). `domain="meals"`, the Meals item types and the food profile-fact kinds stay accepted for cached clients and return a plain retirement notice with no Meals data; nothing is written.
