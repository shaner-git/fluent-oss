---
name: fluent-style
description: Use when the user wants Fluent Style closet context, saved item reads, purchase help, or media-backed style guidance.
---

# Fluent Style

Use the canonical Fluent 2.0 `/mcp` profile.

## Read path

- Start broad closet work with `fluent_get_context(domain="style", intent="closet", detail="summary")`.
- For purchase advice, call `fluent_get_context(domain="style", intent="purchase", candidate=..., amount=...)` once.
- The host inspects candidate images and owns the stylist judgment. Fluent supplies owned closet context, media references, evidence, completeness, and budget arithmetic.
- Use `fluent_list_items`, `fluent_get_item`, `fluent_list_evidence`, and `fluent_get_media_bundle` only when the context packet leaves a specific gap.
- Never claim an image was inspected merely because Fluent returned an image URL.

## Write path

- `fluent_create_style_item`: explicit, user-approved onboarding of a newly owned item.
- `fluent_update_style_item_patch`: sparse details for an existing item.
- `fluent_refresh_style_item_profile`: user/host evidence refresh for an existing item.
- `fluent_set_style_item_image`: a host-inspected image for an existing item.
- `fluent_archive_item`: explicit no-longer-owned disposition.
- Budget writes remain limited to the manual `style-clothing` envelope.

Use `fluent_render_style_closet_surface` only for owned closet viewing/management or model-selected owned comparators when the host supports MCP Apps. The prose purchase judgment leads.

Fluent does not extract arbitrary product pages, scrape retailers, operate browsers, score purchases server-side, or expose earlier Style purchase widgets/tools. Require explicit approval and returned read-after-write proof for every mutation.
