# Fluent Domain Surfaces

This page is generated from `contracts/fluent-contract.v1.json` plus an explicit preview list for rich surfaces that are not yet in the public contract.

Current contract version: `2026-05-17.fluent-core-v1.84`

## Meals

Meals currently ships a broad canonical planning and execution surface, plus active widget-style render tools for hosts that support MCP output templates. Retired render tools may remain in the frozen contract only for legacy compatibility.

Contract-current tools describe source and frozen-contract truth. Hosted production may lag until `npm run verify:contract-parity` passes after deployment; check the dated surface reports before treating newly added tools as live hosted availability.

<!-- current-tools:start -->
### Current Canonical Meals Tools

- `meals_list_tools`
- `meals_get_plan`
- `meals_list_plan_history`
- `meals_get_day_plan`
- `meals_get_today_context`
- `meals_get_recipe`
- `meals_create_recipe`
- `meals_list_recipes`
- `meals_get_onboarding_calibration`
- `meals_record_calibration_response`
- `meals_get_recipe_book`
- `meals_apply_recipe_book_action`
- `meals_get_preferences`
- `meals_update_preferences`
- `meals_upsert_plan`
- `meals_generate_plan`
- `meals_accept_plan_candidate`
- `meals_get_inventory`
- `meals_get_inventory_summary`
- `meals_get_meal_memory`
- `meals_list_feedback`
- `meals_generate_grocery_plan`
- `meals_get_current_grocery_list`
- `meals_get_grocery_plan`
- `meals_prepare_order`
- `meals_patch_recipe`
- `meals_log_feedback`
- `meals_mark_meal_cooked`
- `meals_update_inventory`
- `meals_delete_inventory_item`
- `meals_update_inventory_batch`
- `meals_record_plan_review`
- `meals_list_grocery_plan_actions`
- `meals_upsert_grocery_plan_action`
- `meals_delete_grocery_plan_action`
- `meals_list_grocery_intents`
- `meals_upsert_grocery_intent`
- `meals_delete_grocery_intent`
- `meals_apply_pantry_dashboard_action`

### Current Active Meals Render Tools

- `meals_render_recipe_card`
- `meals_render_grocery_list_v2`

### Legacy Meals Compatibility Render Tools

- `meals_render_pantry_dashboard`
<!-- current-tools:end -->

Current host guidance:

- ChatGPT/App-SDK-style hosts can use Recipe Card and Grocery List v2. Pantry Dashboard is contract-current only for legacy compatibility and should not be routed for new flows.
- Grocery delete tools are legacy/admin cleanup only. For restart or reset-style product flows, start a new meal or grocery plan instead of deleting plan state.
- Claude visualizer-only runs should prefer `meals_get_recipe`, `meals_get_current_grocery_list`, and inventory reads, then render host-native visuals. Claude MCP Apps-capable runs may use proven Fluent `ui://` render resources such as Recipe Card and Grocery List v2. Use `meals_get_grocery_plan` only for explicit week-scoped/raw plan detail.
- OpenClaw should use the plain-MCP Meals data tools rather than depending on Fluent widget rendering.

Preview only:

- `meals_render_week_plan`: Exists in local probe HTML, but is not registered by the current runtime and is not in the frozen public contract.

## Health

Health currently ships the block-first coaching surface. The current week is derived through canonical data reads instead of a public rich widget contract.

<!-- current-tools:start -->
### Current Canonical Health Tools

- `health_get_preferences`
- `health_update_preferences`
- `health_get_context`
- `health_get_today_context`
- `health_get_review_context`
- `health_get_active_block`
- `health_get_block`
- `health_get_block_projection`
- `health_list_goals`
- `health_upsert_goal`
- `health_upsert_block`
- `health_record_block_review`
- `health_list_workout_logs`
- `health_log_workout`
- `health_list_body_metrics`
- `health_log_body_metric`
<!-- current-tools:end -->

Current host guidance:

- There are no current Health render tools in the frozen public contract.
- Use `health_get_block_projection`, `health_get_today_context`, and the workout or body-metric writes as the durable plain-MCP path.

Preview only:

- `health_render_training_week`: Exists in local probe HTML, but is not registered by the current runtime and is not in the frozen public contract.
- `health_update_training_session`: Appears as a probe-only action tool for the training-week mock surface, but is not registered by the current runtime and is not in the frozen public contract.

## Style

Style currently ships canonical closet and purchase-analysis data tools, plus one current rich purchase-analysis widget for hosts that support MCP output templates.

<!-- current-tools:start -->
### Current Canonical Style Tools

- `style_get_profile`
- `style_update_profile`
- `style_get_context`
- `style_get_onboarding_calibration`
- `style_record_calibration_response`
- `style_add_starter_closet_item`
- `style_list_descriptor_backlog`
- `style_list_evidence_gaps`
- `style_analyze_wardrobe`
- `style_list_items`
- `style_get_item`
- `style_get_item_profile`
- `style_get_item_provenance`
- `style_upsert_item`
- `style_archive_item`
- `style_upsert_item_profile`
- `style_upsert_item_photos`
- `style_set_item_product_image`
- `style_extract_purchase_page_evidence`
- `style_prepare_purchase_analysis`
- `style_get_purchase_vision_packet`
- `style_submit_purchase_visual_observations`
- `style_analyze_purchase`
- `style_render_purchase_analysis`
- `style_apply_purchase_analysis_action`
- `style_get_visual_bundle`

### Current Style Render Tools

- `style_show_setup_calibration_widget`
- `style_show_purchase_analysis_widget`
<!-- current-tools:end -->

Current host guidance:

- ChatGPT v2 should use `style_prepare_purchase_analysis`, direct product images or uploaded photos when needed, `style_get_purchase_vision_packet`, host image inspection, `style_submit_purchase_visual_observations`, then `style_show_purchase_analysis_widget`; full-MCP Apps-capable hosts may use `style_extract_purchase_page_evidence` where that tool is exposed before requesting the vision packet.
- Claude MCP Apps-capable runs may use the same staged evidence flow and `style_show_purchase_analysis_widget` as the native Fluent purchase-analysis surface after real image inspection. Claude visualizer-only or text-only runs should answer from `style_render_purchase_analysis` or host-native visuals instead.
- OpenClaw and generic MCP clients should use the plain-MCP Style data tools, `style_get_purchase_vision_packet` when the host can inspect images, and `style_render_purchase_analysis` after concrete `host_vision` evidence.

Preview only: none right now.


## Render Host Summary

- Active contract-current MCP Apps render tools: `meals_render_recipe_card`, `meals_render_grocery_list_v2`, `style_show_setup_calibration_widget`, `style_show_purchase_analysis_widget`.
- Legacy compatibility render tools, not active product surfaces: `meals_render_pantry_dashboard`
- All contract-current render tools, including legacy compatibility: `meals_render_recipe_card`, `meals_render_pantry_dashboard`, `meals_render_grocery_list_v2`, `style_show_setup_calibration_widget`, `style_show_purchase_analysis_widget`.
- Current Claude-specific render tools: none.
- Current OpenClaw-specific render tools: none.
- Plain-MCP fallbacks remain the canonical cross-host path for every domain.
