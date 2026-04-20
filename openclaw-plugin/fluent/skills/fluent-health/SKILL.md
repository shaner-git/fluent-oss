---
name: fluent-health
description: Use when the user wants fitness-first Health help grounded in Fluent MCP, such as setting a goal, building a training block, checking today’s workout, logging a workout, or reviewing training progress.
---

# Fluent Health

Use this skill for Fluent Health workflows on top of Fluent MCP.

## When to Use This

Use this skill when the user wants Health help that depends on saved Health state, such as:

- setting or updating a fitness goal
- building or adjusting a training block
- showing this week from the active block
- checking today’s workout
- logging a completed or partial workout
- reviewing the block and adjusting the next stretch
- logging lightweight body metrics like weight or waist

## What This Skill Does

- Reads canonical Health state from Fluent MCP.
- Handles Health first-use onboarding when the domain is not ready.
- Treats Health as a block-first coaching loop, not a broad medical domain.
- Keeps Meals as the food-execution domain when a fitness goal needs meal support.
- Treats block review as the main coaching loop, with logging kept lightweight and optional.

## Core Rules

- Use `fluent-core` patterns for readiness and lifecycle checks.
- Prefer summary-first reads.
- Build and revise blocks only when the user clearly wants planning.
- Use writes only for explicit goal, block, workout-log, block-review, or body-metric changes.
- Keep recovery advice practical and uncertainty-honest.
- Route food execution to Meals instead of duplicating it here.
- Do not treat Health as a separate coach persona.
- Prefer coach-like weekly adjustments over tracking-heavy workflows.

## First-Use Flow

When the user explicitly wants to set up Health, or a Health task needs state that is not ready:

1. Use the `fluent-core` flow to confirm Health is enabled and onboarding is in progress.
2. Collect the minimum onboarding inputs:
   - primary fitness goal
   - days per week
   - equipment access
   - session length
   - training experience
   - preferred units
   - optional starting metric like weight
3. Save those through `health_update_preferences`.
4. If the user already gave a concrete goal, save it through `health_upsert_goal`.
5. Finish onboarding through the `fluent-core` flow.

Treat Health as ready only when Fluent marks it ready.

## Normal Operating Pattern

Default to this pattern:

1. Use fresh Fluent capability state when readiness matters.
2. Start with summary reads:
   - `health_get_context`
   - `health_get_active_block`
   - `health_get_today_context`
   - `health_get_block_projection`
   - `health_list_goals`
3. Escalate to full block detail only when the next step depends on it.
4. Prefer compact write acknowledgements unless the next step needs the full mutated document.

Use these for explicit writes:

- `health_update_preferences`
- `health_upsert_goal`
- `health_upsert_block`
- `health_record_block_review`
- `health_log_workout`
- `health_log_body_metric`

## Block-First Fitness Loop

For explicit training planning:

1. Confirm Health is ready.
2. Read:
   - `health_get_context`
   - `health_list_goals`
   - `health_get_active_block` when continuity matters
   - `health_get_block_projection` when the current week matters
3. Build or revise the block conversationally.
4. Persist the agreed block with `health_upsert_block`.
5. Use `health_get_today_context` and `health_log_workout` during the block.
6. On review:
   - read `health_get_review_context`
   - summarize what was projected vs completed
   - persist the agreed review with `health_record_block_review`
   - revise the current or next block after the review is saved when the user explicitly wants an adjustment.

Treat the block review as the main coaching moment:

- use adherence counts, `metricSignals`, and `trainingSupportSummary`
- recommend `2-4` concrete next-block or next-week changes
- keep workout logging minimal unless the user explicitly wants more detail

When the user only wants the current week from an existing block:

- use `health_get_block_projection`
- treat “what’s my workout today?” as a resolver problem, not a cue to regenerate a week
- if the user missed a session, keep the advice stateful and sequence-aware rather than rebuilding the whole block

## Boundaries

- Health owns fitness goals, training blocks, workout adherence, recovery framing, and optional body metrics.
- Meals owns calorie and protein execution through food, meal plans, grocery, inventory, and ordering.
- When the user wants training plus food support, read Meals context and use its `executionSupportSummary` to decide whether food friction is part of the problem.
- When the user explicitly wants meals shaped around the training block or current week projection, hand Meals the compact `trainingSupportSummary` instead of generating canonical meal plans here.
- Do not use Health for symptom triage, injury diagnosis, rehab treatment, dermatology guidance, or aggressive body-composition authority.
- Casual fitness chat should still complete with zero tools when no saved Health state is needed.
