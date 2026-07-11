---
name: fluent-core
description: Use when Fluent readiness, routing, account, onboarding, or shared profile state matters.
---

# Fluent Core

Use the canonical `/mcp` endpoint and contract `2026-07-09.fluent-core-v2.0`.

## Current baseline

- 26 tools, 14 explicit writes, 3 render adapters, and 3 resources.
- Meals and Style are current.
- Budgets is limited to manual grocery and clothing envelopes.
- Hosted and open-source runtimes expose the same product contract.

## Routing

1. Start with `fluent_get_capabilities` when availability or account readiness is unclear.
2. Start broad personal-context work with `fluent_get_context`.
3. Use `fluent_get_shared_profile`, item, evidence, or media reads only for detail the context packet does not already provide.
4. Write only after explicit approval, using the narrowest tool.
5. Require the mutation's read-after-write proof before claiming success.

Keep user-facing answers centered on the current Meals, Style, and focused budget tools.
