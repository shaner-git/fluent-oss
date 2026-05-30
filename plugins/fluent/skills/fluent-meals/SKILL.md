---
name: fluent-meals
description: Use when the user wants Fluent Meals planning, recipes, groceries, or pantry help.
---

# Fluent Meals

See [docs/fluent-host-surface-routing-matrix.md](../../../../docs/fluent-host-surface-routing-matrix.md) for host-specific rendering rules.

## Core Rules

- Use `fluent-core` first when Meals readiness or onboarding state is unclear.
- Start setup, calibration, confidence-sensitive planning, inferred-food-pattern confirmation, and "what do you know about how we eat?" turns with `meals_get_onboarding_calibration`.
- In Codex, do not assume rich widget support by default.
- for simple data questions such as quantities, ingredient checks, or pantry facts, do not jump to a render tool.
- Do not complete grocery checkout inside ChatGPT or Codex.

## Normal Operating Pattern

- Grocery list: in Codex and plain clients, prefer `meals_get_current_grocery_list` and answer in text; use `meals_get_grocery_plan` only for explicit week-scoped/raw plan detail.
- Grocery widget: only with proven ChatGPT/App SDK-style widget support, prefer `meals_render_grocery_list_v2` as the default rich end-user experience.
- Recipe asks: call `meals_get_recipe`; when widgets are supported, follow `meals_get_recipe` with `meals_render_recipe_card`.
- Recipe-book setup or browsing: call `meals_get_recipe_book`; use `meals_apply_recipe_book_action` only after explicit user intent. Treat recipe-book actions as recipe-specific evidence or week-scoped planning intent, not broad household preference, allergy, dietary restriction, or hard avoid.
- Weekly planning: read context, generate/accept a plan, then generate groceries.
- Meals setup and calibration: use `meals_get_onboarding_calibration` before planning or grocery recommendations when preferences, pantry freshness, household shape, schedule, or grocery expectations are unknown. Ask 3-5 starter signals for new users, or 1-3 confirm/correct questions for returning/imported users. Use `meals_record_calibration_response` only after explicit user intent.

## Calibration Language

- Pantry ownership, old plans, accepted recipes, and grocery actions are evidence, not confirmed preference.
- Say "your pantry suggests" or "your meal history suggests" for inferred patterns. Do not say "you like X" unless the user confirmed it.
- Allergies, medical restrictions, dietary constraints, and hard avoids require explicit user confirmation.
- If calibration is thin, offer a starter plan or grocery list with lower confidence instead of forcing a long quiz.

When the user says they are already cooking a planned meal or have started prep:

- call `meals_mark_meal_cooked` before refreshing plan reads
- then refresh the relevant plan or day context before suggesting substitutions, leftovers, or next meals

## Grocery And Ordering Boundary

This public Codex package does not bundle browser or retailer-execution scripts. Stop at a reconciled list or external checkout handoff.

## Safety

Do not invent inventory, purchase state, receipts, delivery windows, or order status. Treat in-cart, purchased, already-have, and needs-review as distinct states.
