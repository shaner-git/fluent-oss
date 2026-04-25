---
name: fluent-meals
description: Use when the user wants Meals help on top of Fluent MCP, such as planning dinners for the week, checking kitchen inventory, generating a grocery list, fixing meal data, or placing a grocery order from a plan.
---

# Fluent Meals

Use this skill for Fluent Meals workflows on top of Fluent MCP.

## When to Use This

Use this skill when the user wants Meals help that depends on Fluent meal state, such as:

- planning meals for the week
- checking kitchen inventory
- generating a grocery list from a plan
- fixing recipe, grocery, or inventory state
- ordering groceries from a hosted plan with current inventory truth

## What This Skill Does

- Reads canonical meal state from Fluent MCP.
- Handles meals first-use onboarding when the meals domain is not ready.
- Orchestrates weekly planning, grocery generation, inventory work, and recipe reads.
- Keeps browser ordering outside Fluent Core, with a managed purchase lane for Fluent early access and a local fallback path for OSS or operator recovery.
- Requires a hosted order preflight before retailer automation.

## Core Rules

- Use `fluent-core` patterns for readiness and lifecycle checks.
- If capability discovery is deferred in the client, use `meals_list_tools` as the fallback directory.
- Prefer summary reads first.
- If a summary read already answers the user's question, stop there unless the next step needs detail the summary did not provide.
- Avoid duplicate reads in the same turn unless the user asks for a refresh.
- Use writes only when the user clearly intends to change meal state.
- Keep retailer ordering and local browser execution outside Fluent Core.
- Keep final recommendations and prioritization in the agent.
- Treat the grocery plan as planning state, not the final order list.
- For pantry-style blockers, prefer lightweight sufficiency confirmation for the full week plan instead of inventing exact quantities.
- Receipt-backed `purchased` actions should refresh future durable-coverage evidence, but should not invent exact quantities.
- When the user explicitly wants meals to support a training week, read Health context and use its `trainingSupportSummary` as guidance only.
- During explicit weekly meal planning or revision, pass that compact Health summary into `meals_generate_plan` or `meals_accept_plan_candidate` as `training_context`.
- Do not read Health just because it exists. Only cross over when the current user request includes a clear training signal such as workouts, training, fitness, cutting, bulking, recovery, or a request to make meals support a training week.
- When surfacing calories, protein, fiber, or similar totals from a generated meal plan, describe them as plan estimates or plan totals, not personalized dietary targets.

## First-Use Flow

When the user explicitly wants to set up Meals, or a Meals task needs state that is not ready:

1. Use the `fluent-core` flow to confirm Meals is enabled and onboarding is in progress.
2. If capability discovery is deferred, call `meals_list_tools` and use its grouped output as the fallback directory.
3. Complete the minimum onboarding questions needed for the current request.
4. When setup is complete, finish onboarding through the `fluent-core` flow.

Treat Meals as ready only when Fluent marks it ready.

Do not infer onboarding readiness from prior conversation state, cached client state, or local package state.

## Normal Operating Pattern

Default to this pattern:

1. Use fresh Fluent capability state when readiness matters.
2. Recover the surface with `meals_list_tools` only when capability discovery is deferred.
3. Start with summary reads.
4. Escalate to full documents only when the next step depends on missing detail.
5. Prefer compact write acknowledgements unless the next step needs the full mutated document.

Default low-cost tools:

- `meals_get_plan` with `view: "summary"`
- `meals_list_plan_history`
- `meals_get_preferences` with `view: "summary"`
- `meals_get_inventory_summary`
- `meals_generate_plan`
- `meals_generate_grocery_plan`
- `meals_get_grocery_plan` with `view: "summary"`
- `meals_prepare_order`
- `meals_render_grocery_list`

When the user says they are already cooking a planned meal or have started prep:

- call `meals_mark_meal_cooked` before refreshing plan reads
- if the meal was planned for a later day in the same week, Fluent can pull it forward and shift the remaining same-type schedule automatically
- after the write, refresh with `meals_get_today_context` or `meals_get_plan` only if the user still needs the updated view

Use higher-detail or audit reads only when needed:

- `meals_get_recipe`
- `meals_get_today_context`
- `meals_get_inventory`
- `fluent_list_domain_events` for audit or debugging

Recipe presentation pattern:

- start with `meals_get_recipe`
- if the user names a specific saved recipe or clearly refers to one, prefer Fluent recipe reads over generic cooking knowledge
- treat asks like "show me the recipe", "how do I make X", "what's in X", "pull up X", and "walk me through X" as recipe-first turns when `X` matches a saved recipe
- if the user is asking "which one is X" right after recipe discovery or list output, stay in recipe-disambiguation flow with `meals_list_recipes` or `meals_get_recipe`; do not jump to `meals_get_today_context` unless the user is explicitly asking about today's plan
- for clearly recipe-centric turns, prefer the data/render split:
  - if the user is asking for the recipe itself, how to make the dish, the ingredients, the steps, or a cook-from-this walkthrough, follow with `meals_render_recipe_card` when the host supports rich app surfaces
  - do not require the user to ask for a "card" explicitly when the request is obviously recipe-first
- do not call `meals_render_recipe_card` for ordinary chat turns where the recipe details are incidental and plain text already answers the question
- keep the text answer truthful and complete even when you expect the host to render the recipe card
- if a saved recipe lookup succeeds, do not answer from prior knowledge unless the user explicitly asks for a generic version instead of the saved Fluent recipe

Grocery-list presentation pattern:

- when the user is asking for the actionable grocery view itself, such as "What's on my grocery list?", "What do I still need to buy?", or "Show me this week's grocery list", prefer `meals_render_grocery_list` as the default end-user experience in rich hosts
- do not require a raw grocery-plan read first for those ordinary grocery-list asks
- gather or reconcile extra grocery state first only when the turn specifically needs underlying plan detail, reconciliation detail, or intent debugging:
  - `meals_get_grocery_plan`
  - `meals_prepare_order`
  - `meals_list_grocery_intents`
- if the host supports rich app surfaces, use `meals_render_grocery_list` directly for the primary shopping view
- do not require the user to ask for a "card" or "surface" explicitly when the turn is clearly grocery-list-first
- keep the text answer truthful and complete even when you expect the host to render the grocery list

## Weekly Planning Loop

For explicit weekly planning:

1. Confirm meals is ready.
2. Read planning inputs with summary-first calls:
   - `meals_get_preferences`
   - `meals_get_inventory_summary`
   - `meals_list_plan_history`
3. Read more detail only if needed.
4. Call `meals_generate_plan`.
5. Present the candidate and collect approval or revisions.
6. On approval, call `meals_accept_plan_candidate`.
7. Generate the grocery plan with `meals_generate_grocery_plan`.
8. Before any retailer ordering, run `meals_prepare_order` to reconcile what still needs to be bought right now.
9. Only start local export or browser ordering from the reconciled `remainingToBuy` artifact.

When the user names a specific weekday or date for a meal during planning or revision:

- treat that as a slot-level constraint, not a soft preference
- pass it into `meals_generate_plan` as `overrides.pinnedMeals`
- use one entry per fixed slot with `{ date, mealType, recipeId }`
- prefer this for requests like "make Friday spaghetti", "put salmon on Wednesday lunch", or "move tacos to Apr 17 dinner"
- if the recipe is not identified yet, resolve the recipe first, then regenerate with the pinned slot
- do not rely on the planner's default dinner ordering to preserve a named weekday
- when multiple explicit weekday requests exist, include all of them in the same `pinnedMeals` array so the candidate is generated around the full set of constraints

When Meals is supporting a training week:

- read Health summary context, not raw training internals
- only do that when the current prompt clearly contains a training signal
- bias the whole day around harder training days, with dinner complexity as the strongest lever
- use `training_context` only for explicit planning or revision workflows, not casual meal chat
- let `nutritionSupportMode` and `weekComplexity` shape choices, but do not let Health overwrite canonical meal state
- keep food execution canonical in Meals

Do not run the full planning loop for ordinary chat unless the user is clearly planning or revising a week.

## Ordering Execution Boundary

- Fluent MCP owns canonical meal plans, preferences, grocery plans, inventory, recipes, feedback, and audit state.
- Fluent Core owns lifecycle and onboarding truth.
- This skill provides workflow guidance for first-use wording, planning orchestration, and the ordering handoff.
- Keep retailer credentials out of Fluent MCP, D1, and hosted profile metadata.
- For Fluent early access, prefer the hosted purchase runner after the hosted grocery plan exists and `meals_prepare_order` returns a safe remaining-to-buy set.
- The hosted purchase runner may use Cloudflare-managed secret material and internal Worker routes, but that execution subsystem remains outside the public Meals MCP contract.
- Fluent open-source runtime keeps the local export plus browser flow as the supported execution path.
- After checkout succeeds and a real retailer order exists, sync the confirmed order details back into Fluent.
- If the confirmed order includes a delivery slot, the local workflow may emit a delivery-event candidate keyed by the retailer order id for whatever calendar tooling the client actually has.
- If the user says they already bought items and inventory may be stale, pause ordering until inventory is updated.
- When a browser or local ordering flow adds a planned line to the live retailer cart, prefer persisting `in_cart` for that grocery line so later preflight reads show it as already in cart without claiming it was purchased.
- When the user has a recent receipt for current-week grocery lines, prefer marking those lines `purchased` so future durable staples can stay covered across later runs.
- Describe ordering state in these buckets when relevant: still need to buy, already have, already in cart, needs review.
- Use pantry-first sufficiency confirmations only for low-risk pantry blockers. Do not use them for proteins, dairy, eggs, bread/wraps, fresh produce, or other items that still need quantity-aware review.
- In the OpenClaw package, do not run bundled browser or retailer-execution scripts. This package intentionally excludes those local execution helpers so standard OpenClaw installs stay within the safe MCP-first surface.
- If the user wants retailer execution from OpenClaw, stop at `meals_prepare_order`, explain that the OpenClaw package does not include the browser-ordering helpers, and hand off the reconciled remaining-to-buy state instead of attempting checkout.
- If the user wants the hosted purchase lane, stop at plan and preflight state unless a separate operator-owned execution path is explicitly available outside this package.
- Treat retailer order details as the post-checkout source of truth. Do not infer `skipped` from omission, and preserve confirmed ordered extras as inventory evidence instead of fabricating grocery-plan history.
