---
name: fluent-meals
description: Use when the user wants Fluent Meals planning, recipes, grocery currentness, or pantry context.
---

# Fluent Meals

Use this skill for Meals help grounded in the canonical Fluent `/mcp` public vNext profile.

See [docs/fluent-host-surface-routing-matrix.md](../../../../docs/fluent-host-surface-routing-matrix.md) for host-specific rendering rules.

## Core Rules

- Use the canonical hosted `/mcp` public profile. It exposes the vNext assistant tools, not old Meals-specific plan, preferences, inventory, history, grocery-generation, render, order-preflight, or retailer-execution tools.
- Start broad planning, currentness, "what does Fluent know?", and weeknight-dinner turns with `fluent_get_context(domain="meals", intent="planning")` when available.
- For planning, the context packet now carries the durable meal memory you plan from: a saved-recipe index grouped by meal type, confirmed preferences and hard avoids, soft likes/dislikes for ranking, and an on-hand inventory summary. Build the requested meals from those saved recipes by name — do not invent recipes when the index has matching saved ones.
- The packet may include a `MealsHardConstraints` block of confirmed Tier-1 exclusions (allergies, hard avoids) — authoritative; never draft/suggest/save a meal/recipe/grocery item containing one, even when a saved recipe, a liked food, or a fresh-vs-frozen distinction seems to permit it; Fluent does not filter recipes, you must honor these when you draft.
- The packet may include a `MealsSoftPreferences` block of confirmed soft likes/dislikes. These are SOFT signals, not rules: lean toward `likes` and away from `dislikes` when choosing among otherwise-acceptable options, but never hard-exclude or refuse a recipe/ingredient solely for a soft preference, never override an explicit in-turn user request, and never silently drop a user's choice. Hard constraints always outrank soft preferences; soft preferences shape ranking/variety, not gating.
- Use the returned recipe index, knowledge summary (preferences and avoids), inventory summary, currentness, evidence gaps, suggested writebacks, and response guidance as the answer boundary.
- Do not chain legacy detail reads to make a tentative suggestion — the planning memory is already in the packet. Only read a recipe or item in full when the user names it or asks to page beyond the index.
- Keep prior chat/model memory separate from Fluent knowledge.
- If grocery currentness is stale, missing, or incomplete, still give one safe tentative planning framework built from the saved recipe index and confirmed/inferred Meals facts when available, then ask one compact refresh or confirmation question before making a grocery-dependent plan.
- Never stop a broad planning/currentness first response at only an intake question, multiple-choice card, or state dump. The first response must include the tentative non-grocery-dependent planning move before the question.
- Always include the boundary sentence "I did not read outside meals or cross-domain Fluent context for this turn" unless you separately read shared or cross-domain context.
- Always state "Nothing has been saved" in the first response unless a public write returned success and read-after-write evidence.
- The host model drafts the plan. Fluent remembers context and evidence.
- Public vNext writes are limited to `fluent_update_shared_profile_patch` for explicit shared or Meals profile facts, the named recipe tools (`fluent_save_recipe`, `fluent_update_recipe_patch`, `fluent_record_recipe_feedback`), `fluent_save_meal_plan` for one explicit user-approved host-authored meal plan, `fluent_apply_grocery_list_change` for one explicit current-list change, and the narrow budget writes (`fluent_set_budget_envelope`, `fluent_log_budget_spend`) for declared `style-clothing` or `meals-groceries` envelopes/spend.
- Use `fluent_save_meal_plan` only after drafting the plan in conversation and receiving explicit user approval to save it. Then read back with `fluent_get_item(domain="meals", item_type="meal_plan", ...)` before claiming the plan is saved.
- If you offered to save a plan and the user did not answer, ask once more before ending the task or moving past planning. An unanswered offer is not a decline; never save without an answer.
- Use `fluent_apply_grocery_list_change` only after reading the current grocery list and getting explicit approval for one manual add, existing plan-item status, substitution, or manual item update. Do not use it for carts, checkout, orders, recipes, inventory truth, or broad preferences.
- For saved-plan grocery deltas, make the grocery-list week explicit and consistent: read the grocery list for the week you intend to update, pass the same week as `week_start`, and omit `target_window` unless it exactly matches that readback week. Do not claim a grocery item was added until the same-week read-after-write shows it.
- Do not use `fluent_save_meal_plan` for tentative drafts, server-side plan generation, hidden generated candidates, grocery-list deltas, pantry/fridge quantity truth, cooking events, inventory, or generic items.
- Do not run retailer automation, checkout, browser execution, or grocery ordering from Fluent Core.
- Do not use OpenClaw visualizer widgets, MCP Apps resources, or render adapters as public vNext behavior.
- If OpenClaw cannot access canonical Fluent tools in the current session, say the Fluent read is unavailable and do not answer from prior memory as if it came from Fluent.
- If the connected runtime only shows old `meals_*` detail tools for this public flow, treat the connection as stale or pre-vNext. Do not call those tools; ask the user to reconnect or refresh Fluent.

## Normal Operating Pattern

1. Read `fluent_get_context(domain="meals", intent="planning")`.
2. Answer from the packet's saved recipe index, confirmed preferences and avoids, MealsSoftPreferences as ranking/variety input only, on-hand inventory summary, currentness, and evidence gaps — grounding the plan in saved recipes, not generic ideas.
3. Use `fluent_list_items(domain="meals", item_type="recipe")` only when the user names a specific recipe or asks to see more recipes than the packet's index lists (it is filtered by meal type and paginated).
4. Use `fluent_list_items(domain="meals", item_type="meal_plan")` or `fluent_get_item(domain="meals", item_type="meal_plan")` when the user asks for current or saved meal plans.
5. Use `fluent_list_items(domain="meals", item_type="grocery_list")` only when the user asks for the grocery list itself.
6. Use `fluent_get_item` only for a specific saved item.
7. Use `fluent_list_evidence` only when provenance or an evidence gap matters.
8. Save only explicit durable shared or Meals facts through `fluent_update_shared_profile_patch`, then read back before claiming success.
9. Save user-approved reusable recipes with `fluent_save_recipe`; include only fields the user supplied or approved, and do not invent missing quantities, servings, nutrition, cost, or timing.
10. Save an approved host-authored meal plan with `fluent_save_meal_plan` only after the user approves the exact plan.
11. Update saved recipes with `fluent_update_recipe_patch` only after identifying the saved recipe ID, then read back before claiming success.
12. Record tried-it notes and recipe-specific outcomes with `fluent_record_recipe_feedback`; do not turn recipe feedback into global preferences unless the user separately approves that memory.
13. Apply grocery-list changes with `fluent_apply_grocery_list_change` only for the four bounded list operations, using IDs or item keys from the current list readback and read-after-write proof. For plan-derived items, keep `week_start`, `target_window`, and the readback list on the same week.

## Cooking State

When the user says they are already cooking, have cooked, ate, or tried a meal:

- if it maps to a saved recipe, make a brief explicit offer in the same reply to record it (e.g. "Want me to log that to Fluent?") — do not end the turn without offering; on the user's yes, call `fluent_record_recipe_feedback` (approval="explicit_user_approved"; taste, difficulty, repeat), then cite read-after-write; the public vNext profile has no cooked-state tool, so feedback is the durable capture
- do not imply the plan was refreshed from a new cooked state, and do not record anything the user did not confirm

When the user narrates other real-world state, proactively offer the matching capture (confirm first, then cite read-after-write): an approved drafted plan → `fluent_save_meal_plan`; a confirmed single bought or already-have item for the current week → `fluent_apply_grocery_list_change` (currentness_confirmed=true); a whole finished shop ("I went shopping", "got everything") → `fluent_apply_grocery_shopping_result` (mark_all_to_buy_bought=true or specific bought_items, currentness_confirmed=true), which marks the current list's bought items purchased and refreshes inventory presence (presence only, no quantity inference) in one approved action.

Writes need `approval="explicit_user_approved"` and the host may also ask the user to approve the action; get an explicit yes before calling, and never fire a write off a bare narration. If a write is not approved (for example a "no approval received" result), say plainly that it needs the user's approval and re-offer it — never blame session tokens, write permissions, connectivity, or a fresh session.

## Capture (write-acquisition)

- **New facts stated this turn are the highest-priority capture.** If the user reveals a new durable food identity, pattern, or restriction in the current turn (e.g. "I've gone plant-forward", "I'm vegetarian now", "I'm gluten-free", a new allergy or hard avoid), offer to capture it as a portable Fluent fact BEFORE ending the turn - and prioritize that offer over offering to save a recipe or meal plan. A recipe/plan save lasts one week; a portable person-fact follows the user to every assistant they connect.
- When a durable cross-domain person-fact surfaces during the task (an allergy, a hard avoid, a dietary pattern, an anti-favorite, a strong taste like/dislike), proactively offer ONE task-bound capture in the same reply - never a survey, at most one capture question per turn.
- Never re-ask a fact already present in the context packet (compactFacts / shared person facts).
- Apply the membership test: portable cross-domain facts -> capture via `fluent_update_shared_profile_patch` (they become available to every assistant the user connects); single-consumer Meals operational levers (grocery day, weeknight time limit, batch size) stay domain-local - do not frame those as portable.
- For confirmed standing vegetarian, vegan, or pescatarian identities, include the canonical `pattern` enum in `fluent_update_shared_profile_patch` even when the user's wording is not a literal label. Never set `pattern` for hedged, leaning, mostly, trying, flexitarian, negated, or no-longer statements; leave those unset and do not capture them as standing exclusions.
- At capture, state portability + action in one line ("kept in your Fluent profile so any assistant you connect can act on it, and Meals will plan around it"). Lead with action + cross-host, never "remembers."
- The write still needs `approval="explicit_user_approved"` and read-after-write proof; offer proactively, get an explicit yes, then cite read-after-write.

## Answer Shape

For planning/currentness turns:

- what Fluent can trust
- what is inferred
- what is stale, missing, or needs confirmation
- one useful tentative next move when currentness allows it; for stale grocery state, make it explicitly not based on current groceries
- exclude anything conflicting with a `MealsHardConstraints` entry and say why; if the user explicitly overrides a confirmed exclusion this turn, surface the conflict + get one confirmation before including it, then offer to update the fact
- weight otherwise-acceptable options toward `MealsSoftPreferences.likes` and away from `MealsSoftPreferences.dislikes`, but never exclude, refuse, or silently drop a user choice solely for a soft preference
- one compact question when currentness blocks a concrete plan
- if the user revealed a new durable cross-domain food fact this turn, one portable-capture offer for it - before any recipe or meal-plan save offer
- the exact boundary sentence "I did not read outside meals or cross-domain Fluent context for this turn" unless you separately read shared or cross-domain context
- the exact write boundary "Nothing has been saved" unless a public write returned success and read-after-write evidence

For recipe or grocery-list turns:

- use canonical item data when visible
- give a complete text answer
- do not imply a widget, card, checkout, or live grocery refresh happened unless the public tool result proves it
- distinguish saved recipe state from recipe-specific feedback and broader food preferences

## Boundaries

- Pantry ownership, old plans, accepted recipes, and grocery actions are evidence, not confirmed preference.
- Say "your pantry suggests" or "your meal history suggests" for inferred signals.
- Allergies, medical restrictions, dietary constraints, and hard avoids require explicit user confirmation.
- Once confirmed and present in `MealsHardConstraints`, treat allergies/hard-avoids as hard exclusions you must not plan around; a soft dislike (anti-favorite, taste dislike) is a preference to weight, NOT a hard exclusion.
- `MealsSoftPreferences` are SOFT signals, not rules. Lean toward `likes` and away from `dislikes` when choosing among otherwise-acceptable options - but they are NOT exclusions: never hard-exclude or refuse a recipe/ingredient solely for a soft preference, never override an explicit in-turn user request (if the user asks for a disliked food, plan it), and never silently drop a user's choice. Hard constraints (`MealsHardConstraints`) always outrank soft preferences. A soft preference shapes ranking/variety, it does not gate.
- Do not claim Fluent saved or updated anything without a successful public write and read-after-write proof.
