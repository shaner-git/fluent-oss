---
name: fluent-health
description: Use when the user asks about Fluent Health or Wellbeing boundaries.
---

# Fluent Health

## Public vNext Boundary

Health/Wellbeing is not a public vNext product surface yet.

Use Fluent only to check public capability/context availability. If the canonical `/mcp` profile returns `not_implemented`, missing context, or no useful Wellbeing packet, say plainly that Fluent does not have a public Health/Wellbeing memory surface available for this request.

## Core Rules

- Do not name old Health tools as active public guidance.
- Do not write goals, workouts, body metrics, block reviews, or preferences through public vNext.
- Do not provide medical diagnosis, injury triage, rehab treatment, dermatology guidance, or clinical advice.
- Casual fitness conversation can proceed without Fluent tools when saved Fluent state is not needed.
- If Meals context is relevant to an explicit food-planning request, use the Meals path, not Health.

## Expected Answer Shape

- State whether Fluent public context is available.
- If unavailable, continue from user-provided context only.
- Keep advice conservative and non-clinical.
- Ask for professional care when symptoms, pain, injury, or medical risk are involved.
