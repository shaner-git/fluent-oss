# Fluent MCP Contract v1 Freeze

This document records the current Fluent MCP v1.31 freeze, including the block-first Health coaching surface, training-aware Meals planning, the Style onboarding/media bridge, the canonical comparator-key Style item model, coverage-aware purchase analysis, guided tool discovery hints in `fluent_get_capabilities`, the eager-friendly `meals_list_tools` fallback, inventory hard delete support, reconciled grocery order preflight, pantry-first sufficiency confirmations for ordering, durable grocery purchase carry-forward, and confirmed retailer order sync.

## Frozen Surface

The following are treated as stable for the current v1.31 contract:

- contract version: `2026-04-05.fluent-core-v1.31`
- resources:
  - `fluent://core/capabilities`
  - `fluent://core/profile`
  - `fluent://core/domains`
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
  - `fluent://style/profile`
  - `fluent://style/context`
  - `fluent://style/items`
  - `fluent://style/items/{item_id}`
  - `fluent://style/item-profiles/{item_id}`
- tools:
  - `fluent_get_capabilities`
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
  - `style_get_profile`
  - `style_update_profile`
  - `style_get_context`
  - `style_list_items`
  - `style_get_item`
  - `style_get_item_profile`
  - `style_upsert_item`
  - `style_upsert_item_photos`
  - `style_analyze_purchase`
  - `meals_get_current_plan`
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
  - `meals_list_grocery_plan_actions`
  - `meals_upsert_grocery_plan_action`
  - `meals_delete_grocery_plan_action`
  - `meals_record_plan_review`
  - `meals_list_grocery_intents`
  - `meals_upsert_grocery_intent`
  - `meals_delete_grocery_intent`

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

- Clients and packages must declare the minimum Fluent contract version they support.
- Capability discovery is the source of truth for the active contract version.
- After this freeze point, contract changes must be additive only.
- Any breaking contract change requires package updates before release and should be treated as a plan revision, not an incidental refactor.

## Scope Exception

Fluent v1.31 keeps dedicated `health:read`, `health:write`, `style:read`, and `style:write` scopes for their domain surfaces. Hosted currently continues to accept legacy meals scopes for the Style surface during the remaining bridge window, while package metadata and hosted-client docs prefer the dedicated Health and Style scopes.

## Local Parity Rule

`Fluent OSS` must use the same public tool names, resource names, payload shapes, provenance fields, and onboarding writes as hosted Fluent. The legacy `backendMode = "local"` bridge value may remain, but differences in transport or auth are allowed only when they do not change the MCP contract itself.

## Phase 10 Additive Guidance

Phase 20 keeps the mature meals and style guidance intact while replacing Health's pre-production weekly-plan contract with a block-first coaching surface.

Current additive guidance:

- `readyDomains` is now a required readiness field and the primary package routing primitive
- `toolDiscovery` may provide workflow-oriented starter tool hints, but MCP `tools/list` and `contract.tools` remain the authoritative full registry
- `meals_list_tools` may expose a fallback directory with full tool names and workflow groups when `fluent_get_capabilities` is deferred in a client surface
- `meals_delete_inventory_item` permanently removes a stale or incorrect inventory row when the user explicitly asks for hard deletion
- `meals_prepare_order` distinguishes the raw grocery plan from an order-ready remaining-to-buy artifact after reconciling current inventory and optional retailer cart state
- `meals_upsert_grocery_plan_action` may persist pantry-first sufficiency confirmations (`have_enough`, `have_some_need_to_buy`, `dont_have_it`) that affect `meals_prepare_order` without changing canonical inventory truth
- `meals_upsert_grocery_plan_action` accepts optional `purchased_at` on `purchased` actions so receipt-backed grocery lines can refresh future durable inventory coverage without inventing quantities
- recent durable pantry evidence and short-window frozen evidence may implicitly cover future grocery lines when exact quantity is unknown, while fresh and refrigerated items remain conservative by default
- `fluent://meals/confirmed-order-sync/{retailer}/{retailer_order_id}` may expose the latest canonical summary for a confirmed retailer order so local browser workflows can safely no-op or resume idempotent sync
- confirmed retailer order sync remains workflow-driven, but canonical matched purchases and ordered extras must still be written through existing Meals MCP write tools
- delivery calendar follow-through remains workflow-side; `fluent-meals` may emit a portable delivery-event candidate keyed by retailer order id, but calendar creation is not part of the Meals MCP contract
- Health now exposes a block-first fitness coaching surface with preferences, goals, training blocks, today resolution, review context, workout logs, and optional body metrics
- Health onboarding is lightweight: the domain is ready once Health is enabled, onboarding is completed, and `health_preferences` have been saved
- Health persists the active training block as canonical truth, while the current week and today's workout are derived views
- Health may reason about training goals and rough nutrition constraints, but meal execution remains in Meals
- per-domain routing hints under `metadata.fluent` remain advisory only
- meal plans, planning-critical preferences, recipes, grocery-plan outputs, inventory, feedback, and audit history are MCP-native
- Meals may consume Health's derived `trainingSupportSummary`, but Health remains the only canonical owner of training structure
- Style now exposes a narrow closet-derived domain surface with import-seeded items, canonical comparator keys, typed media roles, item status, minimal onboarding/calibration state, typed item profiles, and coverage-aware wardrobe-context purchase analysis
- retailer/cart execution remains skill-side by design

These are additive only and do not change the frozen resource or tool names.
