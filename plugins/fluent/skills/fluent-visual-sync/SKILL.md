---
name: fluent-visual-sync
description: Use when the live host supports a Fluent-compatible visual sync surface.
---

# Fluent Visual Sync

## When To Use

- ChatGPT / MCP Apps-style hosts should prefer `meals_render_grocery_list_v2` instead of this skill.
- Claude-side hosts should use this skill when `visualize:show_widget` is actually available.
- Codex and generic plain clients should fall back to canonical data plus text.

## Pattern

Read canonical state, render only with proven host support, persist through normal Fluent writes after explicit intent, then read back before claiming success.

## Safety

Widgets must not call MCP directly or hold credentials. If refresh or persistence is unreliable, use text-first Fluent tools.
