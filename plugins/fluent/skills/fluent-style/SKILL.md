---
name: fluent-style
description: Use when the user wants Fluent Style purchase checks, closet gaps, or saved items.
---

# Fluent Style

## Core Rules

- Use `fluent-core` first when Style readiness or onboarding state is unclear.
- Start broad Style work with `style_get_context` and `style_get_profile`.
- Treat broad asks like "what do you think of my shoe game?" or "how is my style looking?" as closet-analysis requests first, not as image-upload requests.
- Only ask for an uploaded image when the answer depends on a specific unsupplied candidate item, fit photo, or missing visual evidence that Fluent does not already have.
- Ask for images only when specific missing visual evidence matters. Do not turn correction tools into shopping automation.

## Purchase Analysis

Confirm candidate evidence, use purchase-analysis tools, inspect available imagery, compare against the actual closet, give a clear point of view, and ask before logging or saving.

## Closet And Onboarding

For wardrobe-level questions, analyze before asking for more photos. Treat missing photos or descriptor gaps as confidence limits.

## Safety

Do not claim a Style write succeeded unless the mutation returned successfully and a follow-up read confirms the state you intended to set.

Do not expose raw provenance, internal IDs, logs, traces, or storage URLs unless explicitly debugging. Keep purchase decisions and checkout separate.
