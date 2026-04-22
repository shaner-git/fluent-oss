# Fluent Claude AI Visual Guidance

Use this public companion when shaping Claude-first recipe and grocery responses against Fluent OSS.

Core guidance:

- prefer fresh MCP state over prior chat memory
- keep the text answer complete even when the host may render a richer visual
- use recipe-card style structure for recipe-first turns
- use checklist-style structure for grocery-list-first turns
- avoid relying on local file paths, private repos, or operator-only tooling in public prompts

This document is intentionally public-safe and only covers OSS-facing behavior.
