# Fluent Domain Surfaces

This page is generated from `contracts/fluent-contract.v1.json` plus an explicit preview list for rich surfaces that are not yet in the public contract.

Current contract version: `2026-04-20.fluent-core-v1.37`

## Meals

Meals currently ships a broad canonical planning and execution surface, plus a narrow set of widget-style render tools for hosts that support MCP output templates.

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

### Current Meals Render Tools

- `meals_render_recipe_card`
- `meals_render_pantry_dashboard`
- `meals_render_grocery_list_v2`
- `meals_render_grocery_list`
<!-- current-tools:end -->

Current host guidance:

- ChatGPT/App-SDK-style hosts can use the current Meals render tools.
- Claude should prefer `meals_get_recipe`, `meals_get_grocery_plan`, and inventory reads, then render host-native visuals.
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
- `style_list_descriptor_backlog`
- `style_list_evidence_gaps`
- `style_analyze_wardrobe`
- `style_list_items`
- `style_get_item`
- `style_get_item_profile`
- `style_get_item_provenance`
- `style_upsert_item`
- `style_upsert_item_profile`
- `style_upsert_item_photos`
- `style_analyze_purchase`
- `style_apply_purchase_analysis_action`
- `style_get_visual_bundle`

### Current Style Render Tools

- `style_render_purchase_analysis`
<!-- current-tools:end -->

Current host guidance:

- ChatGPT/App-SDK-style hosts can use `style_render_purchase_analysis`.
- Claude should prefer `style_analyze_purchase` plus `style_get_visual_bundle` when visual evidence is needed.
- OpenClaw should use the plain-MCP Style data tools rather than depending on Fluent widget rendering.

Preview only: none right now.


## Render Host Summary

- Current ChatGPT/App-SDK-style render tools: `meals_render_recipe_card`, `meals_render_pantry_dashboard`, `meals_render_grocery_list_v2`, `meals_render_grocery_list`, `style_render_purchase_analysis`
- Current Claude-specific render tools: none.
- Current OpenClaw-specific render tools: none.
- Plain-MCP fallbacks remain the canonical cross-host path for every domain.
