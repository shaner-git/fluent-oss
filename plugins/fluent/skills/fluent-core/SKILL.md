---
name: fluent-core
description: Use when Fluent readiness, routing, account, onboarding, or profile state matters.
---

# Fluent Core

See [docs/fluent-host-surface-routing-matrix.md](../../../../docs/fluent-host-surface-routing-matrix.md) for host-specific rendering rules.

## Core Rules

- Start with `fluent_get_capabilities`, `fluent_get_home`, or `fluent_get_next_actions` when the user asks a broad Fluent question.
- If the user asks about Fluent account status, access status, billing boundary, subscription state, export, deletion, reactivation, support, or whether their account is ready, call `fluent_get_account_status`. Do not satisfy those asks with `fluent_get_home`; Home is a cross-domain check-in, not the account lifecycle surface.
- In Codex, OpenClaw, and generic plain MCP clients, default to canonical data and text unless the live host explicitly proves widget support.
- Write only on explicit enable, onboarding, or shared-profile intent; never auto-enable disabled domains.
- Do not expose raw IDs, logs, traces, Stripe IDs, event IDs, or debug details.

## Normal Flow

Read shared state, then route to Meals, Style, or Health. Billing stays on `meetfluent.app`; no ChatGPT subscription sales, grocery checkout, or medical diagnosis.
