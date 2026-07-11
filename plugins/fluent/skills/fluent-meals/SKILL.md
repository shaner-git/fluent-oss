---
name: fluent-meals
description: Use when the user wants Fluent Meals planning, recipes, grocery currentness, or pantry context.
---

# Fluent Meals

Use the canonical Fluent 2.0 `/mcp` profile.

## Read path

- Start broad planning and currentness questions with `fluent_get_context(domain="meals", intent="planning", detail="summary")`.
- Ground suggestions in confirmed preferences, saved recipes, current inventory/list state, provenance, freshness, and evidence gaps.
- Use `fluent_list_items` or `fluent_get_item` only when the user asks for a specific recipe/item or more detail than the context packet contains.
- Do not treat inferred signals as confirmed preferences.

## Write path

- `fluent_update_shared_profile_patch`: explicit durable shared or Meals facts only.
- `fluent_save_recipe`, `fluent_update_recipe_patch`, `fluent_record_recipe_feedback`: complete, user-approved saved-recipe changes.
- `fluent_save_meal_plan`: a plan drafted by the assistant and explicitly approved by the user.
- `fluent_apply_grocery_list_change`: one explicit current-list add, status, substitution, or manual-item update.
- `fluent_apply_grocery_shopping_result`: explicit post-shop reconciliation against the current list.
- `fluent_set_budget_envelope` and `fluent_log_budget_spend`: manual `meals-groceries` or `style-clothing` envelope context only.

Read before writes and rely on returned read-after-write proof. Never invent quantities, nutrition, price, timing, or purchase state. Fluent does not browse retailers, fill carts, check out, or manage orders.

Use `fluent_render_surface(surface="meals_grocery_list")` only when the host can mount MCP Apps. Otherwise answer from structured data in text.
