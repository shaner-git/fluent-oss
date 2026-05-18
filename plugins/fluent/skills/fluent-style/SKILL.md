---
name: fluent-style
description: Use when the user wants Fluent Style purchase checks, Style setup or calibration, closet gaps, or saved items.
---

# Fluent Style

## Core Rules

- Use `fluent-core` first when Style readiness or onboarding state is unclear.
- Start Style setup, calibration, or confidence-sensitive work with `style_get_onboarding_calibration`. Use `style_get_context` or `style_get_profile` only after the calibration read model when broader closet detail is still needed.
- Treat broad asks like "what do you think of my shoe game?" or "how is my style looking?" as closet-analysis requests first, not as image-upload requests.
- Only ask for an uploaded image when the answer depends on a specific unsupplied candidate item, fit photo, or missing visual evidence that Fluent does not already have.
- Ask for images only when specific missing visual evidence matters. Do not turn correction tools into shopping automation.
- Distinguish closet evidence from taste. Ownership can suggest a pattern, but only explicit user confirmation should be described as preference.
- Treat category counts as closet coverage evidence, not taste or aesthetic signals.
- Use "your closet suggests..." for inferred signals and "you said..." only for user-confirmed taste. Avoid second-person taste phrasing such as "you're going for..." or "you lean..." until the user confirms it.
- Treat `purchaseAnalysisReadiness.readinessLevel: "not_ready"` as candidate-only, not wardrobe-fit ready. Treat `"provisional"` as usable but not calibrated. Keep buy/skip language cautious and use the returned `calibrationPrompts` for one high-leverage confirm/correct question.

## Purchase Analysis

Confirm candidate evidence, use purchase-analysis tools, inspect available imagery, compare against the actual closet, give a clear point of view, and ask before logging or saving.

For ordinary buy/skip prompts, use the staged path: prepare the purchase analysis, extract page evidence when needed, get the purchase vision packet, inspect images, make the stylist call yourself, submit visual observations with `stylist_judgment`, then render the purchase-analysis surface or structured fallback. Do not use `style_analyze_purchase` as the normal final path.

Purchase analysis should inherit the calibration state. If Fluent has no closet or a thin closet, judge the candidate only and ask for starter/import confirmation evidence before making wardrobe-fit claims. If Fluent has imported-but-unconfirmed evidence or inferred-but-unconfirmed preferences, say so plainly and keep the recommendation provisional.

Do not let host memory, prior chat context, or an earlier unsaved recommendation determine the buy/wait/skip call unless the user confirms it in the current turn or Fluent state/tool evidence supports it. You may mention it only as outside Fluent state.

In MCP Apps-capable hosts, a regular "should I buy this?" prompt is enough intent to open the native purchase-analysis surface after the staged visual flow succeeds. Do not wait for the user to explicitly ask for a card, widget, or MCP app.

If accepted visual observations return or display `style_show_purchase_analysis_widget`, make the actual `style_show_purchase_analysis_widget` tool call. Do not merely mention the tool name in prose, and do not treat the card as rendered until the tool call is made or the host visibly mounts the native card.

`stylist_judgment` is the agent-owned decision the native card renders. Include `verdict`, `headline`, `rationale`, `decisionBasis`, `wardrobeImpact`, `whatItAdds`, `whereItOverlaps`, `pairingOpportunities`, `caveats`, and `referencedComparatorIds` when the evidence supports them. Same category and subcategory are only starting points; true substitutes must share the same wardrobe job. Use broad same-category matches as adjacent context or rejected comparators, and use cross-category items as adjacent context or pairing candidates, not primary duplicates. Do not call a jersey the closest comparator for a tee, do not invent item facts, and keep internal comparator labels out of user-facing prose. Prefer plain stylist wording such as same wardrobe job, adjacent style context, stronger case when, and weaker case when. Never use lane language in user-facing purchase prose, including casual idioms such as opens a lane, tee lane, loafer lane, or same lane; say wardrobe job, closet gap, part of the wardrobe, slot, or role instead.

## Closet And Onboarding

For wardrobe-level questions, analyze before asking for more photos. Treat missing photos, thin closet coverage, stale items, or unconfirmed imported data as confidence limits.

When the user explicitly wants to set up Style, or a Style task depends on readiness that is missing:

1. Use `fluent-core` to confirm Style is enabled or begin onboarding.
2. Call `style_get_onboarding_calibration`; this is the setup/readiness read model. Do not use `style_get_context` for ordinary setup summaries, confirm/correct prompts, starter closet additions, or stale/accidental phrase calibration.
3. If `style_show_setup_calibration_widget` is visible in an MCP Apps-capable host, call it for the native setup surface only after `style_get_onboarding_calibration` has already run in the same turn and only when the host can visibly mount Fluent `ui://` resources. Never call the widget as the first setup/calibration tool, even for native-render probes. A tool call alone is not proof that the widget rendered. In Claude.ai text fallback, Codex, plain MCP, and other text hosts, do not call the setup widget; use the read model, explicit write tools, and a compact text answer.
4. Ask only the smallest high-value question or request the smallest useful starter item set.
5. Use `style_add_starter_closet_item` when the user provides an item photo, link, or description they clearly want saved; do not route starter onboarding items through `style_upsert_item`.
6. Use `style_record_calibration_response` only after explicit user intent for confirmed/rejected/corrected preference signals or active/stale/accidental item markings. Do not pass a returned `calibrationPrompt` object directly as tool input. Confirm/reject writes must use `source: "user_confirmed"`; corrected writes also require a user-provided `corrected_value`. For phrase-level feedback without a stable item match, record a rejected signal instead of fabricating an item ID. If the user says a named item or phrase is stale/accidental and should not count as style preference, and you cannot match a stable item ID, immediately record the phrase as a rejected `aesthetic` signal with a note. Use `hard_avoid` only when the user explicitly says it is a hard avoid; do not route stale/accidental preference exclusion through `style_upsert_item`.

Do not pretend Fluent found a closet when the closet is empty. Let the user skip setup and continue with lower-confidence Style help.
Do not say "you prefer" unless the user confirmed it; for inferred signals say "your closet suggests" and avoid second-person taste phrasing like "you lean" or "you're going for."

## Calibration Signals

The calibration read model separates:

- `closetCoverageConfidence`: active closet evidence.
- `visualEvidenceConfidence`: item/photo evidence.
- `preferenceCalibrationConfidence`: user-confirmed taste.
- `shoppingDecisionConfidence`: how strong a purchase recommendation can be.

Use `calibrationPrompts` as the guided setup path: confirm closet-suggested signals, ask for corrected text before writing corrections, save one constraint, set budget, or add one starter item. Do not treat imported closet data as fully calibrated style truth. Do not mark onboarding complete just because items exist if the calibration model still shows unresolved preference questions.

## Safety

Do not claim a Style write succeeded unless the mutation returned successfully and a follow-up read confirms the state you intended to set.

Do not expose raw provenance, internal IDs, logs, traces, or storage URLs unless explicitly debugging. Keep purchase decisions and checkout separate.
