# Fluent Domain Surfaces

Current contract: `2026-07-09.fluent-core-v2.0`

Fluent exposes one cross-host product contract. Meals and Style are current; Budgets is a narrow shared seam; Health and Wellbeing are reserved.

<!-- current-tools:start -->
## Shared context and evidence

- `fluent_get_capabilities`
- `fluent_get_account_status`
- `fluent_get_context`
- `fluent_get_shared_profile`
- `fluent_update_shared_profile_patch`
- `fluent_list_items`
- `fluent_get_item`
- `fluent_list_evidence`
- `fluent_get_media_bundle`
- `fluent_archive_item`

## Meals

- `fluent_save_recipe`
- `fluent_update_recipe_patch`
- `fluent_record_recipe_feedback`
- `fluent_save_meal_plan`
- `fluent_apply_grocery_list_change`
- `fluent_apply_grocery_shopping_result`
- `fluent_render_surface`

Meals supports assistant-drafted plans, saved recipes, the current grocery list, confirmed post-shopping updates, and the Grocery List MCP App. It does not browse retailers, fill carts, or check out.

## Style

- `fluent_update_style_item_patch`
- `fluent_create_style_item`
- `fluent_refresh_style_item_profile`
- `fluent_set_style_item_image`
- `fluent_render_style_closet_surface`

Style supplies saved closet context and media. The assistant owns visual interpretation and stylist judgment. Fluent does not extract arbitrary product pages.

## Budgets

- `fluent_get_purchase_context`
- `fluent_set_budget_envelope`
- `fluent_log_budget_spend`
- `fluent_render_budgets_surface`

Budgets is limited to manual `meals-groceries` and `style-clothing` monthly envelopes and explicit spend corrections. It is not a banking or finance-data product.

<!-- current-tools:end -->
## Reserved

Health and Wellbeing are not currently supported. Earlier Health tools and the old Home dashboard are not available.

## Resources

- `ui://widget/fluent-grocery-list-v72.html`
- `ui://widget/fluent-budgets-envelope-setup-v1.html`
- `ui://widget/fluent-style-closet-v7.html`
