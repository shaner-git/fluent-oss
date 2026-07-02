---
name: fluent-core
description: Use when Fluent readiness, routing, account, onboarding, or profile state matters.
---

# Fluent Core

Use this skill for shared Fluent routing, readiness, account status, and public vNext profile reads.

See [docs/fluent-host-surface-routing-matrix.md](../../../../docs/fluent-host-surface-routing-matrix.md) for host-specific rendering rules.

## Public vNext Baseline

- canonical endpoint: `/mcp`.
- Public profile: 26 tools, 10 resources (promoted vNext grocery-list MCP App templates plus the Budgets Envelope Setup and Style Closet Manager MCP App v2/v3/v4/v5 templates with their dedicated render adapters).
- Public write tools: `fluent_update_shared_profile_patch`, `fluent_save_recipe`, `fluent_update_recipe_patch`, `fluent_record_recipe_feedback`, `fluent_save_meal_plan`, `fluent_apply_grocery_list_change`, `fluent_apply_grocery_shopping_result`, `fluent_set_budget_envelope`, `fluent_log_budget_spend`, `fluent_update_style_item_patch`, `fluent_create_style_item`, `fluent_refresh_style_item_profile`, `fluent_set_style_item_image`, and `fluent_archive_item`.
- Public write domains: `shared`, `meals`, `style-clothing`, and `meals-groceries`.
- No widgets beyond the promoted Grocery List, Budgets Envelope Setup, and Style Closet Manager render families, action/apply tools, generic item upsert/event writes, browser use, checkout, product-page extraction, dashboards, Plaid imports, or operator lifecycle tools.

## Host Routing

- In Codex, OpenClaw, and generic plain MCP clients, default to canonical data and text unless the live host explicitly proves widget support.
- In Claude visualizer-only hosts, prefer the Claude visual path from the relevant domain skill rather than ChatGPT-oriented render tools.
- In Claude.ai MCP Apps-capable hosts where a Fluent `ui://` render tool is visible, use the MCP Apps render path for the matching surface.
- In OpenClaw, default to canonical data and text unless an operator has explicitly provided a host-specific visual equivalent.

## What Fluent Owns vs the Assistant's Own Memory

The assistant's native memory and Fluent are different layers; Fluent does not try to replace native recall.
- **Native memory owns** conversational and episodic recall, thread continuity, how-you-like-to-be-talked-to preferences, and bare cold "remember X" requests when no Fluent flow is active — even when that content could later become a Fluent fact.
- **Fluent owns** the durable, typed facts your assistants must ACT on and that, with the user's consent, are portable to their other connected assistants — allergies, dietary needs, household, hard avoids, stable strong tastes — plus the cross-domain signals domains compute. Native memory is per-assistant and stays put; Fluent is structured for action and portable across hosts where the user allows it.
- **Membership test — would a second domain, or a second assistant, ever act on this?** If yes, AND it is durable person-level context (not a one-session detail, an unconfirmed candidate detail, or a domain-local operational setting like a weekly meal count), it is a Fluent fact. Otherwise leave it to native memory or the owning domain; do not duplicate it into the shared store.
- **Capture at the moment of action, after explicit approval — not on a bare "remember."** When a Fluent-owned fact surfaces during a Fluent flow (e.g. while planning meals), get the user's explicit approval of the exact fact, persist it with the matching public write, read back, and note in one line that connected assistants can now use it (for example: "Saved to Fluent — connected assistants can plan around the peanut allergy"). Do not try to catch every cold "remember X" — that is native memory's job, unless the user explicitly asks to tell Fluent or an onboarding/import flow is active.

## Core Rules

- Start broad Fluent questions with `fluent_get_capabilities`, `fluent_get_shared_profile`, or `fluent_get_context`.
- Use `fluent_get_account_status` for account status, access status, billing boundary, subscription state, export, deletion, reactivation, support, or whether the account is ready.
- Route Meals work through `fluent_get_context(domain="meals", intent="planning")` when currentness, planning, or "what Fluent knows" matters.
- Route Style work through `fluent_get_context(domain="style", intent="closet")` or `fluent_get_context(domain="style", intent="purchase")`; use `fluent_get_media_bundle` only for inspectable Style media.
- Treat Wellbeing and Finance as reserved, not public vNext product surfaces.
- Use `fluent_get_purchase_context`, `fluent_set_budget_envelope`, and `fluent_log_budget_spend` only for explicit style-clothing or meals-groceries envelope/spend context. Do not use Budgets for dashboards, category taxonomies, Plaid, retailer automation, Meals signal consumption, or final purchase judgment.
- Write only when the user explicitly approves a durable shared/Meals fact, saved recipe, recipe feedback, meal plan, grocery-list change, budget envelope, budget spend event, existing Style closet item detail/photo update, or no-longer-owned archive, then read back the result before relying on it. For durable person-level facts, follow *What Fluent Owns vs the Assistant's Own Memory* — capture at the moment of action, after explicit approval, and frame the save as consent-scoped portability across the user's connected assistants.
- Do not expose raw IDs, logs, traces, Stripe IDs, event IDs, OAuth details, runtime mode, or debug details.

## Normal Flow

1. Read capabilities, account status, shared profile, or domain context depending on the user ask.
2. Keep Fluent facts separate from prior chat memory, model assumptions, browser context, and user-provided candidate details.
3. Hand off to Meals or Style only after the relevant context packet is read.
4. Ask one compact confirmation when currentness, evidence, or write intent is missing.
5. Persist only explicit user-approved shared/Meals facts, recipes, meal plans, recipe feedback, grocery-list changes, budget envelopes, budget spend events, existing Style closet item detail/photo updates, or no-longer-owned archives through the matching public write tool.

Billing stays on `meetfluent.app`. Fluent does not sell subscriptions, browse retailers, fill carts, check out, make medical decisions, or expose Finance data through public vNext.
