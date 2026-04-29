# Fluent MCP Contract v1 Freeze

This document records the current Fluent MCP `v1.48` freeze for the shared Fluent contract.

Current freeze note:

- Phase 27 keeps the v2, v3, v4, v5, v6, and v7 Style purchase-analysis widget resources for compatibility and adds the v8 widget resource so ChatGPT/App SDK hosts refetch the corrected inline closeness score renderer without clamping already-percent comparator scores to 100%. Phase 26 kept the v2, v3, v4, v5, and v6 Style purchase-analysis widget resources for compatibility and added the v7 widget resource so ChatGPT/App SDK hosts refetched the combined closet-comparison cards with inline closeness scores instead of rendering a redundant separate closeness section. Phase 25 kept the v2, v3, v4, and v5 Style purchase-analysis widget resources for compatibility and added the v6 widget resource so ChatGPT/App SDK hosts refetched the more human stylist copy for photo reads and verdict reasons instead of reusing cached v5 markup. Phase 24 kept the v2, v3, and v4 Style purchase-analysis widget resources for compatibility and added the v5 widget resource so ChatGPT/App SDK hosts refetched the image-CSP and closet-comparator-photo improvements instead of reusing cached v4 markup. Phase 23 kept the v2 and v3 Style purchase-analysis widget resources for compatibility and added the v4 widget resource so ChatGPT/App SDK hosts refetched the polished stylist-analysis HTML instead of reusing cached v3 markup. Phase 22 makes host profiles first-class MCP metadata so ChatGPT, Claude, OpenClaw, Codex, and generic MCP clients can share one canonical Fluent tool vocabulary while using host-aware routing, render-adapter policy, and packaged-skill expectations. Phase 21 added MCP-native runtime guidance resources and fluent_get_next_actions as the in-band skill substitute for ChatGPT and generic MCP hosts, while preserving the full canonical tool surface for Claude, OpenClaw, Codex, OSS, and operator workflows. Phase 20 kept the Style maturity surfaces for item-profile enrichment, provenance reads, evidence-gap reporting, and wardrobe analysis; removed the legacy meals_render_grocery_list alias and grocery_list_widget capability while preserving meals_render_grocery_list_v2 as the canonical ChatGPT/App SDK grocery-list render surface; added the v3 Style purchase-analysis widget resource while keeping the v2 widget resource for compatibility; added style_prepare_purchase_analysis as the first-hop purchase-analysis routing tool, keeps style_render_purchase_analysis as non-widget structured output, and gates the actual style_show_purchase_analysis_widget surface behind host visual evidence; and kept Health on the block-first coaching surface instead of the pre-production weekly-plan contract.

## Frozen Surface

- contract version: `2026-04-26.fluent-core-v1.48`
- resources:
  - `fluent://core/capabilities`
  - `fluent://core/account-status`
  - `fluent://core/profile`
  - `fluent://core/domains`
  - `fluent://guidance/routing`
  - `fluent://guidance/host-capabilities`
  - `fluent://guidance/meals-planning`
  - `fluent://guidance/meals-shopping`
  - `fluent://guidance/style-purchase-analysis`
  - `fluent://guidance/health-blocks`
  - `ui://widget/fluent-home-v1.html`
  - `fluent://health/preferences`
  - `fluent://health/context`
  - `fluent://health/today`
  - `fluent://health/active-block`
  - `fluent://health/block-projection`
  - `fluent://health/review-context`
  - `fluent://health/blocks/{block_id}`
  - `fluent://health/goals`
  - `fluent://meals/current-plan`
  - `fluent://meals/inventory`
  - `fluent://meals/preferences`
  - `fluent://meals/plans/{week_start}`
  - `fluent://meals/recipes/{recipe_id}`
  - `fluent://meals/grocery-plan/{week_start}`
  - `fluent://meals/confirmed-order-sync/{retailer}/{retailer_order_id}`
  - `ui://widget/fluent-recipe-card-v7.html`
  - `ui://widget/fluent-grocery-list-v55.html`
  - `ui://widget/fluent-pantry-dashboard-v1.html`
  - `fluent://style/profile`
  - `fluent://style/context`
  - `fluent://style/items`
  - `fluent://style/items/{item_id}`
  - `fluent://style/item-profiles/{item_id}`
  - `fluent://style/item-provenance/{item_id}`
  - `ui://widget/fluent-purchase-analysis-v2.html`
  - `ui://widget/fluent-purchase-analysis-v3.html`
  - `ui://widget/fluent-purchase-analysis-v4.html`
  - `ui://widget/fluent-purchase-analysis-v5.html`
  - `ui://widget/fluent-purchase-analysis-v6.html`
  - `ui://widget/fluent-purchase-analysis-v7.html`
  - `ui://widget/fluent-purchase-analysis-v8.html`
- tools:
  - `fluent_get_capabilities`
  - `fluent_get_account_status`
  - `fluent_get_home`
  - `fluent_get_next_actions`
  - `fluent_get_profile`
  - `fluent_update_profile`
  - `fluent_list_domains`
  - `fluent_enable_domain`
  - `fluent_disable_domain`
  - `fluent_begin_domain_onboarding`
  - `fluent_complete_domain_onboarding`
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
  - `meals_list_tools`
  - `meals_get_plan`
  - `meals_list_plan_history`
  - `meals_get_day_plan`
  - `meals_get_today_context`
  - `meals_get_recipe`
  - `meals_render_recipe_card`
  - `meals_render_pantry_dashboard`
  - `meals_render_grocery_list_v2`
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
  - `fluent_list_domain_events`
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
  - `style_show_purchase_analysis_widget`
  - `style_apply_purchase_analysis_action`
  - `style_get_visual_bundle`
- optional capabilities:
  - `structured_content`
  - `grocery_intents`
  - `domain_events`
  - `profile_resources`
  - `meal_preferences`
  - `plan_history`
  - `grocery_plan`
  - `plan_generation`
  - `calendar_aware_planning`
  - `grocery_plan_actions`
  - `inventory_batch_updates`
  - `inventory_hard_delete`
  - `grocery_order_preflight`
  - `grocery_pantry_sufficiency_confirmation`
  - `grocery_purchase_carry_forward`
  - `confirmed_order_sync`
  - `tool_discovery_hints`
  - `runtime_guidance_resources`
  - `next_action_routing`
  - `host_profiles`
  - `tool_list_fallback`
  - `fluent_home`
  - `fluent_home_widget`
  - `ingredient_form_groups`
  - `recipe_card_widget`
  - `pantry_dashboard_widget`
  - `grocery_list_widget_v2`
  - `style_profile`
  - `style_context`
  - `style_purchase_analysis`
  - `style_purchase_analysis_widget`
  - `style_onboarding_summary`
  - `style_media_roles`
  - `style_media_delivery`
  - `style_visual_bundle`
  - `style_item_status`
  - `style_item_profile_writes`
  - `style_item_provenance`
  - `style_evidence_gaps`
  - `style_descriptor_backlog`
  - `style_wardrobe_analysis`
  - `style_descriptor_enrichment`
  - `style_comparator_identity`
  - `style_comparator_coverage`
  - `health_preferences`
  - `health_block_programming`
  - `health_today_resolution`
  - `health_block_reviews`
  - `health_workout_logging`
  - `health_body_metrics`
  - `account_status_surface`

## Runtime Notes

Registered runtime aliases:

- `meals_show_recipe` -> `meals_render_recipe_card`: Preferred public runtime alias for ChatGPT/App SDK recipe-opening prompts. The frozen contract keeps meals_render_recipe_card as the canonical tool name.

Registered dev-only surfaces:

  - `meals_render_grocery_widget_smoke`
  - `ui://widget/fluent-grocery-smoke-v1.html`

## Required Capability Fields

`fluent_get_capabilities` must continue to return:

  - `contractVersion`
  - `backendMode`
  - `availableDomains`
  - `enabledDomains`
  - `readyDomains`
  - `onboarding.core`
  - `onboarding.domains`
  - `profile.displayName`
  - `profile.timezone`

It may also return additive guided discovery hints under:

  - `toolDiscovery.canonicalRegistry`
  - `toolDiscovery.note`
  - `toolDiscovery.groups`

## Version Policy

- Clients and packages declare the minimum supported contract version.
- Capability discovery is the source of truth for the active contract version.
- After this freeze point, contract changes must be additive only.
- Breaking contract changes require package updates before release.

## Scope Exception

Health tools prefer health:read and health:write. Style tools prefer style:read and style:write, while hosted continues to accept legacy meals scopes for the Style surface during the current bridge window.

## Local Parity Rule

The open-source runtime must use the same public tool names, resource names, payload shapes, provenance fields, and onboarding writes as early-access Fluent. The legacy `backendMode = "local"` bridge value may remain, but differences in transport or auth are allowed only when they do not change the MCP contract itself.

The Meals rich render tools stay in the public contract only because the runtime really registers them in both deployment tracks. Hosts without MCP output-template support should still fall back to the portable data tools.

## Phase 20 Additive Guidance

Phase 27 keeps the v2, v3, v4, v5, v6, and v7 Style purchase-analysis widget resources for compatibility and adds the v8 widget resource so ChatGPT/App SDK hosts refetch the corrected inline closeness score renderer without clamping already-percent comparator scores to 100%. Phase 26 kept the v2, v3, v4, v5, and v6 Style purchase-analysis widget resources for compatibility and added the v7 widget resource so ChatGPT/App SDK hosts refetched the combined closet-comparison cards with inline closeness scores instead of rendering a redundant separate closeness section. Phase 25 kept the v2, v3, v4, and v5 Style purchase-analysis widget resources for compatibility and added the v6 widget resource so ChatGPT/App SDK hosts refetched the more human stylist copy for photo reads and verdict reasons instead of reusing cached v5 markup. Phase 24 kept the v2, v3, and v4 Style purchase-analysis widget resources for compatibility and added the v5 widget resource so ChatGPT/App SDK hosts refetched the image-CSP and closet-comparator-photo improvements instead of reusing cached v4 markup. Phase 23 kept the v2 and v3 Style purchase-analysis widget resources for compatibility and added the v4 widget resource so ChatGPT/App SDK hosts refetched the polished stylist-analysis HTML instead of reusing cached v3 markup. Phase 22 makes host profiles first-class MCP metadata so ChatGPT, Claude, OpenClaw, Codex, and generic MCP clients can share one canonical Fluent tool vocabulary while using host-aware routing, render-adapter policy, and packaged-skill expectations. Phase 21 added MCP-native runtime guidance resources and fluent_get_next_actions as the in-band skill substitute for ChatGPT and generic MCP hosts, while preserving the full canonical tool surface for Claude, OpenClaw, Codex, OSS, and operator workflows. Phase 20 kept the Style maturity surfaces for item-profile enrichment, provenance reads, evidence-gap reporting, and wardrobe analysis; removed the legacy meals_render_grocery_list alias and grocery_list_widget capability while preserving meals_render_grocery_list_v2 as the canonical ChatGPT/App SDK grocery-list render surface; added the v3 Style purchase-analysis widget resource while keeping the v2 widget resource for compatibility; added style_prepare_purchase_analysis as the first-hop purchase-analysis routing tool, keeps style_render_purchase_analysis as non-widget structured output, and gates the actual style_show_purchase_analysis_widget surface behind host visual evidence; and kept Health on the block-first coaching surface instead of the pre-production weekly-plan contract.

Current additive guidance:

- `readyDomains` is now a required readiness field and the primary package routing primitive
- `toolDiscovery` may provide workflow-oriented starter tool hints, but MCP `tools/list` and `contract.tools` remain the authoritative full registry
- `meals_list_tools` may expose a fallback directory with full tool names and workflow groups when `fluent_get_capabilities` is deferred in a client surface
- `fluent_get_home` may expose a one-product Fluent Home overview with domain readiness, sanitized Meals/Style/Health memory snapshots, account/access state, text fallback, and optional ChatGPT/App SDK widget metadata
- `meals_delete_inventory_item` permanently removes a stale or incorrect inventory row when the user explicitly asks for hard deletion
- `meals_prepare_order` distinguishes the raw grocery plan from an order-ready remaining-to-buy artifact after reconciling current inventory and optional retailer cart state
- `meals_upsert_grocery_plan_action` may persist pantry-first sufficiency confirmations (`have_enough`, `have_some_need_to_buy`, `dont_have_it`) that affect `meals_prepare_order` without changing canonical inventory truth
- `meals_upsert_grocery_plan_action` accepts optional `purchased_at` on `purchased` actions so receipt-backed grocery lines can refresh future durable inventory coverage without inventing quantities
- `meals_upsert_grocery_plan_action` may persist `in_cart` progress for grocery lines that were added to a local retailer basket so `meals_prepare_order` can treat them as already in cart without treating them as purchased or inventory-backed
- Recent durable pantry evidence and short-window frozen evidence may implicitly cover future grocery lines when exact quantity is unknown, while fresh and refrigerated items remain conservative by default
- `fluent://meals/confirmed-order-sync/{retailer}/{retailer_order_id}` may expose the latest canonical summary for a confirmed retailer order so local browser workflows can safely no-op or resume idempotent sync
- Confirmed retailer order sync remains workflow-driven, but canonical matched purchases and ordered extras must still be written through existing Meals MCP write tools
- Delivery calendar follow-through remains workflow-side; `fluent-meals` may emit a portable delivery-event candidate keyed by retailer order id, but calendar creation is not part of the Meals MCP contract
- Health now exposes a block-first fitness coaching surface with preferences, goals, training blocks, today resolution, review context, workout logs, and optional body metrics
- Health onboarding is lightweight: the domain is ready once Health is enabled, onboarding is completed, and `health_preferences` have been saved
- Health persists the active training block as canonical truth, while the current week and today's workout are derived views
- Health may reason about training goals and rough nutrition constraints, but meal execution remains in Meals
- Per-domain routing hints under `metadata.fluent` remain advisory only
- Meal plans, planning-critical preferences, recipes, grocery-plan outputs, inventory, feedback, and audit history are MCP-native
- Meals may consume Health's derived `trainingSupportSummary`, but Health remains the only canonical owner of training structure
- Style now exposes a narrow closet-derived domain surface with import-seeded items, canonical comparator keys, typed media roles, item status, minimal onboarding/calibration state, typed item profiles, and coverage-aware wardrobe-context purchase analysis
- The Meals render tools stay in the frozen public contract because Fluent early access and the open-source runtime both register the output-template resources required to serve them
- `meals_show_recipe` stays registered as a runtime alias for `meals_render_recipe_card`, but the frozen contract keeps the canonical tool name only
- `meals_render_grocery_widget_smoke` and its standalone widget resource stay dev-only for host verification and are intentionally excluded from the frozen public contract
- Hosts that do not support MCP output templates should still prefer `meals_get_recipe` and `meals_get_grocery_plan` as the portable data-first fallback
- Retailer/cart execution remains skill-side by design

These are additive only and do not change the frozen resource or tool names.
