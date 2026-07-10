# Fluent Public Contract 2.0

Contract version: `2026-07-09.fluent-core-v2.0`

This is the single product contract exposed by hosted and open-source `/mcp`. The pre-launch 2.0 reset intentionally removed every earlier public alias, versioned resource tail, compatibility profile, and full-runtime route.

## Product boundary

- Meals and Style are current; Budgets is limited to manual meals-groceries and style-clothing envelopes; Health and Wellbeing are reserved.
- The assistant performs planning and judgment; Fluent supplies personal context, evidence, media, and explicit bounded writes.
- Browser operation, retailer checkout, product-page extraction, raw financial data, medical decisions, and operator tools are outside this contract.
- Every write requires explicit user intent and read-after-write proof.

## Tools

- `fluent_get_capabilities`
- `fluent_get_account_status`
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

## Resources

- `ui://widget/fluent-grocery-list-v72.html`
- `ui://widget/fluent-budgets-envelope-setup-v1.html`
- `ui://widget/fluent-style-closet-v7.html`

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

## Version policy

- Clients and packages must require this 2.0 contract or newer.
- Any future breaking contract change requires a new major contract and matching package release.
- `contracts/fluent-public-profile.json` is generated from the same source as this contract and is the machine-readable host/package profile.
