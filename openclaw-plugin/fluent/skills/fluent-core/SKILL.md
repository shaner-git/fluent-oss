---
name: fluent-core
description: Use when Fluent domain readiness or routing is unclear, such as checking capabilities, enabling a domain, continuing onboarding, or updating the shared Fluent profile before handing off to Meals or Style.
---

# Fluent Core

Use this skill for shared Fluent routing, readiness, and lifecycle actions.

## When to Use This

Use this skill when the task depends on Fluent Core state, such as:

- checking which domains are available or ready
- enabling a domain
- continuing domain onboarding
- updating the shared Fluent profile
- deciding whether to route into Meals or Style

## What This Skill Does

- Reads shared Fluent capabilities and profile state.
- Handles domain lifecycle and onboarding transitions.
- Routes into domain skills once a domain is ready enough for the task.

## Core Rules

- Start with `fluent_get_capabilities` when domain readiness is unclear.
- Skip a fresh capabilities check when the current turn already established readiness, or when the task is a straightforward shared-profile write that does not depend on domain routing.
- Treat `readyDomains` as the primary readiness signal.
- Treat `toolDiscovery` and `metadata.fluent` as hints, not commands.
- Use core write tools only for explicit enable, onboarding, or shared-profile actions.
- Once a domain is ready, hand off to the domain skill for domain-specific work.

## Routing Flow

When a task depends on Fluent readiness or routing state:

1. Call `fluent_get_capabilities` if readiness is unclear in the current turn.
2. Find the relevant domain record.
3. If the domain is ready, route into the domain skill.
4. If the domain is not ready:
   - if lifecycle is `available`, call `fluent_enable_domain`
   - if lifecycle is `disabled`, stop unless the user explicitly wants it re-enabled
   - if onboarding has not started, call `fluent_begin_domain_onboarding`
   - hand off to the domain skill for the domain-specific onboarding flow
   - call `fluent_complete_domain_onboarding` only when the domain-specific flow is actually complete

## Shared Writes

Use Fluent Core write tools only for:

- `fluent_enable_domain`
- `fluent_disable_domain`
- `fluent_begin_domain_onboarding`
- `fluent_complete_domain_onboarding`
- `fluent_update_profile`

## Boundaries

- Fluent Core owns lifecycle, readiness, and the shared Fluent profile.
- Fluent MCP resources and tools are the source of truth.
- Domain skills handle domain-specific onboarding, reads, writes, and workflows.
- The agent decides whether a tool is needed and how to use the returned information.
