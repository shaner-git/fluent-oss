---
name: fluent-meals
description: Use when the user wants Fluent Meals planning, recipes, groceries, or pantry help.
---

# Fluent Meals

See [docs/fluent-host-surface-routing-matrix.md](../../../../docs/fluent-host-surface-routing-matrix.md) for host-specific rendering rules.

## Core Rules

- Use `fluent-core` first when Meals readiness or onboarding state is unclear.
- In Codex, do not assume rich widget support by default.
- for simple data questions such as quantities, ingredient checks, or pantry facts, do not jump to a render tool.
- Do not complete grocery checkout inside ChatGPT or Codex.

## Normal Operating Pattern

- Grocery list: in Codex and plain clients, prefer `meals_get_current_grocery_list` and answer in text; use `meals_get_grocery_plan` only for explicit week-scoped/raw plan detail.
- Grocery widget: only with proven ChatGPT/App SDK-style widget support, prefer `meals_render_grocery_list_v2` as the default rich end-user experience.
- Recipe asks: call `meals_get_recipe`; when widgets are supported, follow `meals_get_recipe` with `meals_render_recipe_card`.
- Weekly planning: read context, generate/accept a plan, then generate groceries.

When the user says they are already cooking a planned meal or have started prep:

- call `meals_mark_meal_cooked` before refreshing plan reads
- then refresh the relevant plan or day context before suggesting substitutions, leftovers, or next meals

## Grocery And Ordering Boundary

This public Codex package does not bundle browser or retailer-execution scripts. Stop at a reconciled list or external checkout handoff.

### Agent-Email Verification Bridge

This bridge is operator-only. Use it only when a separate approved browser-ordering tool reports `waitingForVerification: true` and the current agent has an approved email surface. Do not expose verification codes in user-facing text unless the user explicitly asks.

## Safety

Do not invent inventory, purchase state, receipts, delivery windows, or order status. Treat in-cart, purchased, already-have, and needs-review as distinct states.
