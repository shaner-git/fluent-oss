# Fluent Tools Reference

Current contract: `2026-07-09.fluent-core-v2.0`

This reference is generated from the single Fluent 2.0 public contract. There is no full, legacy, or compatibility tool lane.

<!-- current-tools:start -->
## Reads

- `fluent_get_capabilities`
- `fluent_get_account_status`
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

Writes require explicit user intent and returned read-after-write proof. Render adapters are optional presentation layers; structured data and text remain canonical.

`fluent_get_shared_profile` returns shared facts plus a minimal public profile projection containing only `displayName` and `timezone`; it excludes internal identifiers and metadata in hosted and open-source runtimes.
