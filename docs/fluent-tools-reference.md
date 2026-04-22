# Fluent Tools Reference

This page is generated from `contracts/fluent-contract.v1.json`.
Anything listed as a current tool is present in the frozen public contract artifact. Preview items are intentionally not current contract tools.

Current contract version: `2026-04-20.fluent-core-v1.37`

## How To Read This Page

- Canonical data tools are the durable plain-MCP tools that carry Fluent state and work across hosts.
- Host-specific render tools are current contract tools that rely on MCP output-template or widget support.
- Preview or planned surfaces may exist in probes or design work, but they are not part of the current public contract.

## Current Contract Tools

<!-- current-tools:start -->
### Core Platform Tools

- `fluent_get_capabilities`
- `fluent_get_profile`
- `fluent_update_profile`
- `fluent_list_domains`
- `fluent_enable_domain`
- `fluent_disable_domain`
- `fluent_begin_domain_onboarding`
- `fluent_complete_domain_onboarding`
- `fluent_list_domain_events`

### Meals Canonical Data Tools

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

### Meals Host-Specific Render Tools

- `meals_render_recipe_card`
- `meals_render_pantry_dashboard`
- `meals_render_grocery_list_v2`
- `meals_render_grocery_list`

### Health Canonical Data Tools

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

### Style Canonical Data Tools

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

### Style Host-Specific Render Tools

- `style_render_purchase_analysis`
<!-- current-tools:end -->

## Current Render Host Classification

- ChatGPT/App-SDK-style current render tools: `meals_render_recipe_card`, `meals_render_pantry_dashboard`, `meals_render_grocery_list_v2`, `meals_render_grocery_list`, `style_render_purchase_analysis`
- Claude-specific current render tools: none. Claude should prefer canonical data tools and host-native visuals.
- OpenClaw-compatible current render tools: none as dedicated Fluent rich widgets. OpenClaw should use the plain-MCP fallbacks.
- Plain-MCP fallback tools stay canonical even when a render tool exists.

## Current Render Host Matrix

| Tool | Host class | Claude guidance | OpenClaw guidance | Plain-MCP fallback |
| --- | --- | --- | --- | --- |
| `meals_render_recipe_card` | ChatGPT/App-SDK-style widget | Prefer `meals_get_recipe` and let Claude render a host-native card. | Use the plain-MCP recipe read path. | `meals_get_recipe` |
| `meals_render_pantry_dashboard` | ChatGPT/App-SDK-style widget | Prefer canonical inventory reads and a host-native summary. | Use the plain-MCP inventory path. | `meals_get_inventory_summary` plus `meals_get_inventory` when detail is needed |
| `meals_render_grocery_list_v2` | ChatGPT/App-SDK-style widget | Prefer `meals_get_grocery_plan` and let Claude render the checklist. | Use the plain-MCP grocery-plan path. | `meals_get_grocery_plan` |
| `meals_render_grocery_list` | ChatGPT/App-SDK-style widget (legacy alias) | Do not depend on the legacy widget alias in Claude hosts. | Use the plain-MCP grocery-plan path. | `meals_get_grocery_plan` |
| `style_render_purchase_analysis` | ChatGPT/App-SDK-style widget | Prefer `style_analyze_purchase` and host-native visual follow-up. | Use the plain-MCP purchase-analysis path. | `style_analyze_purchase` |

## Preview Or Planned Rich Surfaces

| Tool | Lane | Status | Note |
| --- | --- | --- | --- |
| `meals_render_week_plan` | Meals rich week planning | Preview only | Exists in local probe HTML, but is not registered by the current runtime and is not in the frozen public contract. |
| `health_render_training_week` | Health rich training-week surface | Preview only | Exists in local probe HTML, but is not registered by the current runtime and is not in the frozen public contract. |
| `health_update_training_session` | Health training-week widget companion action | Preview only | Appears as a probe-only action tool for the training-week mock surface, but is not registered by the current runtime and is not in the frozen public contract. |

These preview entries are intentionally not part of the current public contract until they are added to `contracts/fluent-contract.v1.json` and the runtime actually registers them.
