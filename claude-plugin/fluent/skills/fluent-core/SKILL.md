---
name: fluent-core
description: Use when Fluent readiness, routing, account, onboarding, or shared profile state matters.
---

# Fluent Core

Use the canonical Fluent 2.0 `/mcp` endpoint and contract `2026-10-08.fluent-core-v2.3`.

## Current baseline

- Style is current. Meals (retired 2026-10-06) and Wellbeing are retired and return no data. If the user asks about meals, recipes, or groceries, say Fluent no longer does meals and answer without Fluent; saved meal data stays in their account export.
- Fluent does not track budgets or spending. For money questions, ask the user.
- Hosted and open-source runtimes expose the same product contract.

## Routing

1. Start with `fluent_get_capabilities` when availability or account readiness is unclear.
2. Start broad personal-context work with `fluent_get_closet_context`.
3. Use `fluent_get_profile`, item, evidence, or media reads only for detail the context packet does not already provide.
4. Write only after explicit approval, using the narrowest tool.
5. Require the mutation's read-after-write proof before claiming success.
6. The user's approved saves are real and durable. Never use `source_type="acceptance_test"` for an ordinary user save: it is verifier-only provenance, not a dry-run switch. If the user asks for a preview or test without saving, keep it in the conversation and do not call write tools.

Keep user-facing answers centered on the current Style tools.
