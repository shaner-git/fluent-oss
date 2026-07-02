---
name: fluent-style
description: Use when the user wants Fluent Style context, closet evidence, saved item reads, or media-backed style help.
---

# Fluent Style

Use this skill for Style help grounded in the canonical Fluent `/mcp` public vNext profile.

## Core Rules

- Treat Fluent Style as context, evidence, saved items, and media. The host model owns styling judgment.
- Fluent stores; the host reasons and may look things up. You are encouraged to web-search product info to enrich an owned closet item; Fluent never browses, scrapes, or inspects pixels. Tag host-found facts `url_scrape` or `host_text`, reserve `host_vision` for images you inspected, never invent (null beats a guess), and never auto-write an image you did not open and confirm. See `fluent://guidance/style-enrichment`.
- Use the canonical hosted `/mcp` profile. It exposes the public vNext tools, not old Style purchase-analysis, setup-widget, Fluent-side product-page extraction, render, or arbitrary Style write tools.
- The canonical public baseline is 26 tools with promoted grocery-list, budgets envelope setup, and Style closet manager widget resources only. The Style purchase verdict is prose and always leads from `fluent_get_context(domain="style", intent="purchase", candidate=..., amount=...)`; after that prose verdict, when you identify a true owned comparator, render `fluent_render_style_closet_surface` with `filter.item_ids` = those comparator items beneath it so the user sees what they already own, and otherwise use it for owned closet management — never render the whole resolved category as the verdict.
- Do not switch to `/mcp/app`, `/mcp/chatgpt`, a legacy/full route, or any second user-facing route to get old Style tools.
- Start broad Style asks with `fluent_get_context(domain="style", intent="closet")` when available; use `intent="purchase"` for purchase or evidence-boundary questions.
- Use `fluent_list_items(domain="style", ...)` and `fluent_get_item(domain="style", ...)` only when the user asks for saved closet items or the context packet names a specific item needed for the answer.
- Use `fluent_list_evidence(domain="style", ...)` when provenance, confidence, or evidence gaps matter.
- Use `fluent_get_media_bundle(domain="style", ...)` for saved-item media outside the one-read purchase verdict flow. For purchase verdicts with a candidate, the context packet carries owned-category images.
- For priced style-clothing candidates, pass `amount` to `fluent_get_context(domain="style", intent="purchase", candidate=..., amount=...)`; carry BudgetArithmeticFact as verified arithmetic, not as Fluent's final decision.
- State a candidate price only when you have VERIFIED it from the actual product page or listing. If you do not have a verified price, ask the user for the price before any budget-sensitive verdict, then pass it as amount so BudgetArithmeticFact returns exact over/under arithmetic. Never state a typical, approximate, around, or from-memory price for the budget — an unverified estimate is not acceptable; ask instead.
- For the buy -> onboard -> enrich loop, follow `fluent://guidance/style-shopping`: keep consideration ephemeral with no wishlist/closet row; on buy, call `fluent_create_style_item` and include `fit_assessment` in the same call when try-on or fit feedback exists; then use `fluent://guidance/style-enrichment` for post-onboard catalog facts, descriptors, and images.
- For product URL closet adds, pass the product page URL in `source_snapshot.url`; Fluent resolves the product gallery server-side, sets the clean product photo as the display tile when it can, and returns gallery images for you to confirm or correct. Treat direct `image_url` as an optional hint, not the primary display decision.
- Use `fluent_render_style_closet_surface` when the user asks to view or manage owned saved closet items and the host can mount MCP Apps resources. The closet widget may call `fluent_update_style_item_patch`, `fluent_set_style_item_image`, and `fluent_archive_item` for explicit user actions only; re-analyzing a saved item from its photo is a host handoff, not a direct widget call to `fluent_refresh_style_item_profile`.
- For existing-item enrichment, route catalog facts to `fluent_update_style_item_patch`; descriptors/tags such as itemType, silhouette, fabricHand, styleRole, dressCode, seasonality, useCases, and pairingNotes to `fluent_refresh_style_item_profile`; fit facts to the refresh `fit_assessment`; and images to `fluent_set_style_item_image`.
- For a saved-item photo re-analysis, call `fluent_get_media_bundle` for the item or use its stored image URL, inspect the pixels in the host, then split descriptor, catalog, and fit updates across `fluent_refresh_style_item_profile`, `fluent_update_style_item_patch`, and refresh `fit_assessment`. Use `host_vision` with `has_image:true` only when the host actually inspected the image this turn; if the image is unavailable, use `host_text`, do not infer from the item name, and say the photo was not available.
- Use `fluent_update_style_item_patch` only for sparse user-approved catalog/details on an existing Style item. Use `fluent_refresh_style_item_profile` for explicit user-approved host/user evidence refreshes on an existing Style item, including durable tags and descriptors; provide field source/confidence and do not claim image-derived evidence unless an image was actually inspected. Use `fluent_set_style_item_image` only for a host-inspected image URL for an existing Style item. To add a NEW closet item, use `fluent_create_style_item` for explicit, user-approved onboarding — you produce the structured profile from the garment photos, then present the draft for the user to confirm or correct; never create items through the patch or image tools.
- Use `fluent_archive_item` when the user says a saved item was returned, sold, donated, gifted, worn out, never purchased, duplicate, gone, or no longer owned; include the best disposition and report read-after-write proof.
- Do not claim Fluent inspected pixels. If images are returned, the host must inspect them before making visual claims.
- If the canonical Fluent tools are unavailable in the current session, say that the Fluent read is unavailable and do not answer from prior memory as if it came from Fluent.
- Do not call, name as active guidance, or wait for old tools such as `style_prepare_purchase_analysis`, `style_render_purchase_analysis`, `style_show_purchase_analysis_widget`, setup widgets, or arbitrary Fluent-side product-page extraction. Answer Phase 1 purchase verdicts in prose from the one ContextPacket.
- Do not save broad Style profile facts through public vNext. Public Style item writes are limited to explicit, user-approved onboarding via `fluent_create_style_item` (you produce the profile from photos and the user confirms the draft), existing-item profile refreshes via `fluent_refresh_style_item_profile`, detail/photo updates via `fluent_update_style_item_patch` and `fluent_set_style_item_image`, and the non-destructive `fluent_archive_item`. Budget envelope/spend writes are limited to the `style-clothing` declared-envelope category and do not create closet memory.
- Keep finance and checkout out of Style. Use `fluent_get_purchase_context`, `fluent_set_budget_envelope`, and `fluent_log_budget_spend` only for explicit style-clothing budget envelope/spend context; do not use them for dashboards, category taxonomies, Plaid, retailer automation, or final purchase judgment.
- Public Style purchase verdicts read the declared style-clothing budget arithmetic through `fluent_get_context` with `amount`; the host decides how that fact affects the verdict.
- Treat broad asks like "what do you think of my shoe game?" or "how is my style looking?" as closet-analysis requests first, not as image-upload requests.
- Only ask for an uploaded image when the answer depends on a specific unsupplied candidate item, fit photo, or missing visual evidence that Fluent does not already have.
- Do not claim a Style write succeeded unless the mutation returned successfully and a follow-up read confirms the state you intended to set.

## Purchase Or Outfit Questions

For prompts like "should I buy this?", "does this work?", or "compare this to my closet":

1. Read Style context first with `fluent_get_context(domain="style", intent="purchase", candidate={name, category?, subcategory?, image_urls?, price_text?}, amount=priced_amount)` when a candidate has a price.
2. Inspect the candidate image or user-provided candidate details directly in the host; ask for one compact missing input when the candidate is not grounded enough.
3. Judge from CategoryResolution, StylePurchaseOwnedSlice, StylePurchaseCompleteness, and BudgetArithmeticFact in that one packet. Cite owned items by name; if `complete:false`, say the slice is incomplete and offer to look wider.
4. Give the host-owned stylist judgment with clear uncertainty when media, closet coverage, calibration, or budget arithmetic is thin; use same wardrobe job and adjacent style context wording, not lane, same role, Yes if, or No if.
5. Do not call `fluent_get_media_bundle` or `fluent_get_purchase_context` as the default second/third step for Phase 1 purchase verdicts.
6. Answer in prose. Budget is a fact, not a cap or override.
7. For returned, sold, donated, gifted, worn-out, never-purchased, duplicate, gone, or no-longer-owned items, call `fluent_archive_item` with disposition and read-after-write proof.

## Closet Management

For prompts like "show my closet", "replace this saved photo", "fix this item size", or "mark this no longer owned":

1. Read Style context or list Style items when the host cannot mount MCP Apps resources.
2. If the host can mount MCP Apps resources, render `fluent_render_style_closet_surface` with a single `filter` object, cursor, and limit.
3. Let the widget call `fluent_update_style_item_patch`, `fluent_set_style_item_image`, or `fluent_archive_item` only after an explicit user action; for photo re-analysis, the widget asks the host to inspect media and the host calls `fluent_refresh_style_item_profile`.
4. Require provenance, report read-after-write proof, and refresh through the render adapter after writes.
5. Do not provide scores, ratings, verdicts, or judgment language inside closet management.

Good answer shape:

- what Fluent knows
- what is confirmed versus inferred
- what media/evidence is missing
- the host's provisional style read
- budget context, when priced
- the next useful user action

## Boundaries

- Fluent remembers closet context; it does not make the final buy/skip call.
- Ownership suggests patterns, but only explicit user confirmation is preference.
- Do not launder prior chat memory into "what Fluent knows."
- Do not claim a Style write, widget render, or Fluent-side product-page extraction unless the visible public tool profile actually supports it.
