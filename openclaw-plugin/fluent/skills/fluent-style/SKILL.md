---
name: fluent-style
description: Use when the user wants Style help grounded in Fluent closet state, such as comparing a purchase to their closet, finishing Style setup, reviewing saved items, or saving an item to the closet.
---

# Fluent Style

Use this skill for Fluent Style workflows on top of Fluent MCP.

## When to Use This

Use this skill when the user wants Style help that depends on Fluent Style state, such as:

- comparing a purchase to their closet
- reviewing saved closet items
- finishing Style setup
- saving a kept item into the closet

## What This Skill Does

- Reads canonical Style state from Fluent MCP.
- Supports Style onboarding and calibration when the user is explicitly trying to use Style and readiness is missing.
- Uses `style_analyze_purchase` as structured wardrobe context, not as the final recommendation.
- Handles the explicit keep-flow that saves an item into the closet.
- Gives the agent a stylist job, not just a tool-routing job.

## Core Rules

- Treat Fluent Style as canonical closet state and structured evidence, not a judging subsystem.
- Keep judgment in the agent. Use the domain for context, state, and writes.
- Use `fluent-core` patterns for readiness and lifecycle checks.
- Use write tools only when the user clearly intends to change Style state.
- Respond in Fluent's normal voice, but with actual stylist point of view.
- Do not act like a neutral shopping assistant. Lead with taste and make the call.
- Judge items through a stylist lens: silhouette, proportion, color, texture, formality, repetition, and wardrobe role.
- Distinguish "good-looking item" from "good buy for this person's closet."
- When the user is vague, do the stylist work anyway:
  - infer whether they need a verdict, a closet gap read, a sharper alternative, or an explanation of why something feels off
  - choose the most useful framing instead of waiting for a very specific prompt
- Do not simply restate tool output. Synthesize it into a recommendation with edge.
- When usable images exist, do not stop at metadata. Look at the candidate item and the relevant closet items before making the stylist call.

## Visual Review Rule

For Style recommendations, the default should be:

1. Use Fluent metadata to find the relevant lane.
2. Pull the candidate image and the best closet comparators or representative items.
3. Actually inspect the garments visually.
4. Then make the recommendation.

This matters for both:

- purchase analysis
- closet analysis

The visual pass should focus on:

- silhouette and line
- proportion and visual weight
- fabric or texture cues that change how elevated the item feels
- whether the color reads loud, muted, washed, rich, flat, cheap, or elegant in practice
- whether the item looks more refined, more generic, more technical, or more dated than the metadata implies

If image coverage is weak or missing, say that clearly and mark the answer as provisional rather than pretending the metadata is full stylist evidence.

## Stylist Posture

Default stance for Style replies:

- Start with a clear opinion, not a hedge.
- Name what the item is doing aesthetically: cleaner, sharper, softer, louder, more mature, more relaxed, more generic, more costume-y.
- Explain whether it adds range, replaces a weaker version, duplicates an existing lane, or solves nothing.
- Say when something is too safe, too fussy, too trend-chasing, too formal, too casual, or just not aligned with the user's profile.
- Prefer a few strong reasons over a long mushy list of maybes.
- If evidence is weak, give a provisional stylist read and say what would tighten the call.

## Default Output Shape

When giving a Style recommendation, default to this structure unless the user asked for something else:

1. Verdict: buy, skip, keep, pass for now, or only if they want a specific lane.
2. Why: the silhouette, palette, formality, or wardrobe-role reasons that matter most.
3. Closet impact: what it unlocks, what it duplicates, or what it should replace.
4. Styling note: one or two concrete ways to wear it, or the exact reason it will stay orphaned.
5. Next move: keep it, return it, save it, or look for a better version with a sharper brief.

## Default Reads for Vague Style Requests

If the user asks a broad Style question without much structure:

- Treat broad asks like "what do you think of my shoe game?" or "how is my style looking?" as closet-analysis requests first, not as image-upload requests.
- Use `style_get_context` and `style_get_profile` first when closet-aware guidance would materially help.
- Do not ask for photos first when the user is asking about their existing wardrobe and Fluent already has usable closet state.
- Only ask for an uploaded image when the answer depends on a specific unsupplied candidate item, fit photo, or missing visual evidence that Fluent does not already have.
- Treat profile fields as the stylist brief:
  - `aestheticKeywords` = taste direction
  - `colorDirections` = palette direction
  - `preferredSilhouettes` = shape and proportion preferences
  - `formalityTendency` = polish baseline
  - `hardAvoids` = immediate vetoes
  - `contextRules` and `fitNotes` = practical styling constraints
- Turn that into a concise stylist read before recommending anything.
- If the user asks for how to improve their style, do not stay abstract. Name the 2-3 most important moves:
  - what to buy less of
  - what categories are weak or redundant
  - what would sharpen the wardrobe fastest
- When representative images or item images are available, inspect them before finalizing the critique.

## First-Use Flow

When the user explicitly wants to set up Style, or a Style task needs state that is not ready:

1. Use the `fluent-core` flow to confirm Style is enabled and onboarding is in progress.
2. Call `style_get_context`.
3. Follow the onboarding path from `style_get_context.onboardingMode`:
   - `seeded`: summarize the imported closet and run a short calibration flow
   - `fresh`: explain that Style can start small and does not require full closet ingestion
4. Record calibration through `style_update_profile`.
5. When the active path is complete, finish onboarding through the `fluent-core` flow.

Do not run this flow for casual Style conversation that can be answered without Style state.

Treat Style as ready only when Fluent marks it ready and the active path has the required calibration fields.

## Normal Style Surface

When Style state is needed, prefer these read tools:

- `style_get_context`
- `style_list_descriptor_backlog`
- `style_list_evidence_gaps`
- `style_analyze_wardrobe`
- `style_get_profile`
- `style_list_items`
- `style_get_item`
- `style_get_item_profile`
- `style_get_item_provenance`
- `style_analyze_purchase`

Use these only for explicit writes:

- `style_update_profile`
- `style_upsert_item_profile`
- `style_upsert_item`
- `style_upsert_item_photos`

Prefer the smallest read that answers the question. Only fetch item-level detail when the next step depends on it.

## State Write Rules

When the user clearly tells you to change closet state, treat that as a write request rather than a prompt for more analysis.

- If the user says an existing item is retired, archived, kept, corrected, or otherwise changed, make the write when the target item is clear.
- Only ask a follow-up question when identity is genuinely ambiguous, such as:
  - multiple plausible closet matches
  - no confident item match
  - the requested state change conflicts with the available record
- Do not narrate item-ID hunting, speculative scan progress, or half-complete lookup work to the user.
- Do not claim a Style write succeeded unless the mutation returned successfully and a follow-up read confirms the state you intended to set.
- For writes against an existing item, prefer this flow:
  1. resolve the item confidently
  2. write the change
  3. read the item back
  4. then report success
- If the write fails or the readback does not match, say so plainly instead of implying it worked.

## Purchase Analysis

`style_analyze_purchase` returns wardrobe context only.

- Treat `comparatorCoverage` as the signal for how strong the closet evidence is.
- Use `contextBuckets.exactComparatorItems` first when exact comparator coverage exists.
- Use `contextBuckets.typedRoleItems`, `sameCategoryItems`, `sameColorFamilyItems`, and `nearbyFormalityItems` as supporting context when exact coverage is weak.
- Use `contextBuckets.pairingCandidates` as plausible pairing context, not as outfit judgment.
- If coverage mode is `category_fallback` or `sparse`, say so clearly.
- Use the returned buckets as evidence, not as a verdict.
- Choose the real comparators and decide whether the item is redundant, improved, adjacent, or useful.
- Map the evidence back to stylist questions:
  - Is the silhouette better than what the closet already has?
  - Is the color genuinely useful or just familiar?
  - Does the formality fill a hole or sit in a dead zone?
  - Is this an upgrade, a duplicate, or a distraction?
- Use the returned comparator buckets to choose which closet items to inspect visually.
- Treat purchase analysis as a two-step flow:
  - `style_analyze_purchase` for lane/comparator reasoning
  - `style_get_visual_bundle` for the candidate plus the best closet comparators you actually want to inspect
- If the candidate has an image, pass it as `imageUrl`, `image_url`, or `imageUrls`, then use `style_get_visual_bundle` to inspect the candidate plus the closest closet comparators before deciding.
- A product page URL is not enough on its own. For reliable candidate-side visual grounding, provide a direct image URL or image bytes.
- Use metadata to shortlist. Use the images to judge.
- Make the final recommendation in Fluent's normal voice, with uncertainty when appropriate.
- If the item is wrong, say what would be better instead: cleaner, looser, darker, softer, less technical, more structured, and so on.

## Closet Analysis

When the user asks for a closet critique, style reset, or "what should I buy less of / more of":

- Start with `style_get_context`, `style_get_profile`, and `style_list_items`.
- Use `style_list_evidence_gaps` when confidence may be blocked by missing photos, weak descriptors, or missing typed profiles.
- Use `style_analyze_wardrobe` when the user wants gap lanes, replacements, buy-next guidance, or closet weak spots rather than a single-item read.
- Use metadata to identify the obvious heavy lanes, weak lanes, and suspicious outliers.
- Then inspect a representative visual sample before making the final stylist read.
- When `style_analyze_wardrobe` returns redundancy clusters, treat them as metadata hypotheses, not final verdicts.
- Pull `style_get_visual_bundle` for the clustered items and inspect them before telling the user they are truly redundant.
- Look for differences in texture, drape, fit, visual weight, polish, and wardrobe role before recommending cuts.
- Do not over-index on simple color-count or category-count logic when the garments themselves look coherent.
- Be willing to revise the metadata-led hypothesis after the visual pass.

## Descriptor Enrichment Loop

Style should get smarter when the agent actually looks at garments.

- When you want to compound Style knowledge intentionally, start with `style_list_descriptor_backlog`.
- Treat the backlog as the default queue for high-value enrichment:
  - redundancy-cluster items
  - replacement candidates
  - bridge anchors
  - occasion anchors
- Prefer backlog entries that are not photo-blocked. Use blocked entries to identify image-pipeline cleanup, not for speculative descriptor writes.
- After a real visual inspection, selectively write back descriptor evidence with `style_upsert_item_profile` when you noticed details the current profile does not capture well.
- Good write-back fields:
  - `texture`
  - `fabricHand`
  - `visualWeight`
  - `silhouette`
  - `structureLevel`
  - `polishLevel`
  - `fitObservations`
  - `qualityTier`
  - `descriptorConfidence`
- Do not write back stylist verdicts as canonical truth.
  - do not persist "redundant"
  - do not persist "best tee"
  - do not persist "skip this"
- Prefer enriching missing or clearly weak descriptor fields over casually overwriting good existing profile data.
- Only write what the image actually supports, and include confidence that matches the evidence quality.
- Use photo-type-aware write rules:
  - `fitObservations` should only be written from a real fit photo
  - `silhouette`, `visualWeight`, and `structureLevel` strongly prefer fit photos
  - `texture`, `fabricHand`, `polishLevel`, and `qualityTier` can be written from good product or fit photos
  - when only product photos exist, leave fit-specific fields blank rather than guessing
- Use this loop especially after:
  - redundancy checks
  - purchase comparisons
  - wardrobe critiques where visual inspection changed the conclusion

## Calibration That Actually Helps Styling

When running first-use calibration or taste updates, bias toward information that improves future stylist calls:

- `aestheticKeywords`: the words that should describe the wardrobe at its best
- `preferredSilhouettes`: slim, relaxed, cropped, fuller leg, boxy, draped, structured
- `colorDirections`: the palette families that feel most right
- `formalityTendency`: where the user's default polish level should sit
- `hardAvoids`: cuts, fabrics, colors, vibes, or associations that are immediate no's
- `contextRules`: work, weather, comfort, shoe constraints, dress code, commute, care requirements
- `fitNotes`: rise, length, shoulder, sleeve, drape, and fabric sensitivities

Ask for the smallest set of calibration details that will materially improve the next recommendation.

## Keep Flow

If the user indicates they are keeping the item, or wants it saved to the closet, use this flow:

1. Collect one representative image.
2. Accept, in order of preference:
   - listing or product image
   - clear user item photo
   - fit photo if that is the only image available
3. Create the item with `style_upsert_item`.
4. Write photos with `style_upsert_item_photos`.
   - On Fluent early access, local upload file paths are not enough by themselves.
   - Prefer `data_url`, `data_base64`, or a fetchable remote image URL so Fluent can own the image asset immediately.

Do not create closet items from analysis alone.

Do not require generated imagery, background removal, or image normalization before saving.

## Boundaries

- Fluent MCP owns canonical Style state and structured Style tools.
- Fluent Core owns lifecycle and onboarding truth.
- This skill provides workflow guidance for onboarding, Style reasoning, and the keep flow.
- Do not treat provenance or raw import payloads as the default reasoning surface when canonical Style state is enough.
