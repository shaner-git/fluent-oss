# Fluent Domain Surfaces

Current contract: `2026-10-08.fluent-core-v2.3`

Fluent exposes one cross-host product contract. Style is current; Meals, Health, Wellbeing and budgets are retired.

<!-- current-tools:start -->
## Shared context and evidence

- `fluent_get_capabilities`
- `fluent_get_account_status`
- `fluent_get_closet_context`
- `fluent_get_profile`
- `fluent_update_profile`
- `fluent_list_closet_items`
- `fluent_get_closet_item`
- `fluent_list_closet_evidence`
- `fluent_get_closet_item_photos`
- `fluent_archive_closet_item`

## Style

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
- `fluent_show_closet`

Style supplies saved closet context and media. The assistant owns visual interpretation and stylist judgment. Fluent does not extract arbitrary product pages.

<!-- current-tools:end -->
## Retired

Meals was retired on 2026-10-06. Its recipe, meal-plan and grocery tools and the Grocery List MCP App are no longer available; the shared tools return a retirement notice for Meals requests. Saved Meals data is kept and included in the account export.

Health, Wellbeing and budgets are not currently supported. Earlier Health and budget tools and the old Home dashboard are not available; assistants bring finance context from tools the user has connected.

## Resources

- `ui://widget/fluent-style-closet.html`
