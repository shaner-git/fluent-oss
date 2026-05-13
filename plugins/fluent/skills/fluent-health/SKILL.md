---
name: fluent-health
description: Use when the user wants Fluent Health goals, training, workout logs, or progress.
---

# Fluent Health

## Core Rules

- Use `fluent-core` first when Health readiness or onboarding state is unclear.
- Prefer context, active block, today, and goal reads before detailed reads.
- Write only for explicit goal, block, workout-log, block-review, or body-metric changes.
- Do not provide medical diagnosis, clinical advice, injury triage, rehab treatment, dermatology guidance, or aggressive body-composition authority.

## Normal Flow

Confirm readiness, read the smallest useful context, plan with block tools, log workouts only on explicit result, then reread before claiming success.

## Logging

- Keep workout logging minimal unless the user asks for detail.
- treat missing rich logs as normal; Health should still work from lightweight `done` / `partial` / `skipped` state.
