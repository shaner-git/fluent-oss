# Fluent Tools Reference

Current contract: `2026-07-09.fluent-core-v2.0`

This reference is generated from the single Fluent 2.0 public contract. There is no full, legacy, or compatibility tool lane.

<!-- current-tools:start -->
## Reads

- `fluent_get_capabilities`
- `fluent_get_account_status`
- `fluent_get_account_profile`
- `fluent_get_context`
- `fluent_get_shared_profile`
- `fluent_list_items`
- `fluent_get_item`
- `fluent_get_purchase_context`
- `fluent_list_evidence`
- `fluent_get_media_bundle`

## Explicit writes

- `fluent_update_shared_profile_patch`
- `fluent_save_recipe`
- `fluent_update_recipe_patch`
- `fluent_record_recipe_feedback`
- `fluent_save_meal_plan`
- `fluent_apply_grocery_list_change`
- `fluent_apply_grocery_shopping_result`
- `fluent_set_budget_envelope`
- `fluent_log_budget_spend`
- `fluent_update_style_item_patch`
- `fluent_create_style_item`
- `fluent_refresh_style_item_profile`
- `fluent_set_style_item_image`
- `fluent_archive_item`

## Optional render adapters

- `fluent_render_surface`
- `fluent_render_budgets_surface`
- `fluent_render_style_closet_surface`
<!-- current-tools:end -->

## Product enrichment candidate

`fluent_update_style_item_patch` accepts `product_enrichment` with an empty `patch`, `expected_revision` from the item (0 when absent), UUID `operation_id`, and a complete attributed `reference`. References contain candidate/confirmed/rejected status, match basis, public product URL, brand/name/code, dated sources, and source-linked colour/composition/care/construction/origin facts. Preserve unchanged facts when replacing a reference. Stale revisions and changed replays fail; identical latest-operation retries are idempotent. Conflicting confirmed facts require user confirmation. New items are created first, then enriched using their saved ID.

Only confirmed references appear in the widget. Enrichment does not browse, read email, edit personal fit/size, or alter media. Add inspected retailer photos using the existing alternate-photo add operation. Shared Cloud/OSS migration 0033 is required; references participate in tenant export, snapshot and account deletion. This is a test candidate, not a production or host-acceptance claim.

Writes require explicit user intent. Verify saved state with read-after-write proof; an unavailable readback must distinguish a confirmed commit from an unknown outcome without blindly repeating the write. Render adapters are optional presentation layers; structured data and text remain canonical.

`fluent_get_shared_profile` returns shared facts plus a minimal public profile projection containing only `displayName` and `timezone`; it excludes internal identifiers and metadata in hosted and open-source runtimes.
