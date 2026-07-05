import { FLUENT_GUIDANCE_RESOURCE_URIS } from './contract';

export type FluentGuidanceUri = (typeof FLUENT_GUIDANCE_RESOURCE_URIS)[number];

export interface FluentGuidanceDocument {
  title: string;
  summary: string;
  rules: string[];
  defaultFlow: string[];
  preferredTools: string[];
  avoidByDefault: string[];
}

export const FLUENT_GUIDANCE_DOCUMENTS: Record<FluentGuidanceUri, FluentGuidanceDocument> = {
  'fluent://guidance/routing': {
    title: 'Fluent Runtime Routing',
    summary:
      'Use this when a client does not have packaged Fluent skills. Start with readiness, choose the smallest domain surface, and use render tools only for hosts that support Fluent widgets.',
    rules: [
      'Call fluent_get_capabilities or fluent_get_next_actions when domain readiness or first tool choice is unclear.',
      'Treat readyDomains as the primary readiness signal.',
      'Use writes only when the user clearly intends to change Fluent state.',
      'In ChatGPT or MCP Apps-style hosts, render tools may be the primary end-user surface for Meals setup/onboarding, Grocery List v2, Style setup/calibration, and Style purchase analysis. Pantry Dashboard is legacy compatibility only and not for new flows.',
      'In Claude, OpenClaw, Codex, and generic MCP clients, prefer canonical data tools plus text unless the host explicitly supports compatible Fluent widgets.',
      'ToolDiscovery and this guidance are routing aids; MCP tools/list remains the authoritative registry for the current connection.',
    ],
    defaultFlow: [
      'Read fluent_get_capabilities when readiness is unknown.',
      'If the relevant domain is not ready, enable or begin onboarding only when the user explicitly wants that domain.',
      'If the relevant domain is ready, choose the domain starter tools from toolDiscovery or fluent_get_next_actions.',
      'Prefer summary reads before full reads.',
      'Return a complete text answer even when a rich widget is also opened.',
    ],
    preferredTools: [
      'fluent_get_next_actions',
      'fluent_get_capabilities',
      'fluent_get_home',
      'fluent_list_domains',
    ],
    avoidByDefault: [
      'Do not call write tools from inferred intent alone.',
      'Do not use ChatGPT/App SDK render tools as the default path in Claude, OpenClaw, Codex, or generic MCP clients.',
      'Do not use audit, provenance, deletion, export, billing, or operator surfaces for ordinary end-user tasks.',
    ],
  },
  'fluent://guidance/host-capabilities': {
    title: 'Fluent Host Capability Profiles',
    summary:
      'Use this to separate Fluent’s canonical tool vocabulary from host-specific affordances such as packaged skills, widgets, native visuals, and plain-MCP text fallbacks.',
    rules: [
      'Do not fork Fluent domain semantics by platform. Meals, Style, Health, and Core tools keep the same canonical meaning across hosts.',
      'Treat ChatGPT/App SDK widget tools as presentation adapters, not as the source of Fluent domain truth.',
      'Treat Claude, OpenClaw, and Codex skills as host orchestration layers over the same MCP contract, not as replacement contracts.',
      'When host capability is unknown, assume plain MCP: canonical data tools, resources, and text.',
      'Use hostProfiles from fluent_get_capabilities or fluent_get_next_actions when choosing advertised tools, widget policy, and fallback behavior.',
    ],
    defaultFlow: [
      'Call fluent_get_capabilities and read hostProfiles when starting in an unfamiliar host.',
      'Call fluent_get_next_actions with host_family when the next Fluent tool choice is unclear.',
      'Use render adapters only when the selected host profile says widgets or compatible visuals are appropriate.',
      'Fall back to canonical data tools and text for unsupported render surfaces.',
      'Keep writes gated behind explicit user intent regardless of host.',
    ],
    preferredTools: [
      'fluent_get_capabilities',
      'fluent_get_next_actions',
      'fluent_get_home',
    ],
    avoidByDefault: [
      'Do not create platform-specific variants of ordinary Fluent domain tools.',
      'Do not assume ChatGPT/App SDK widget support in Claude, OpenClaw, Codex, or generic MCP clients.',
      'Do not assume packaged skills exist in ChatGPT or generic MCP clients.',
    ],
  },
  'fluent://guidance/meals-planning': {
    title: 'Meals Planning Runtime Flow',
    summary:
      'Use this for weekly meal planning, plan revision, and grocery-plan generation when no packaged Meals skill is available.',
    rules: [
      'Do not run the weekly planning loop for casual meal chat.',
      'For broad planning/currentness/"what Fluent knows" prompts, start with fluent_get_context(domain="meals", intent="planning") when available so confirmed facts, inferred signals, stale or missing grocery context, evidence gaps, and write boundaries stay together.',
      'Use legacy detail reads such as meals_get_preferences, meals_get_plan, meals_list_plan_history, meals_get_inventory_summary, and meals_list_recipes only when the user asks for their specific detail or the vNext context packet is unavailable.',
      'Only pass Health training context when the user explicitly asks meals to support training, recovery, cutting, bulking, or workouts.',
      'Treat named weekdays or dates as pinned slot constraints, not soft preferences.',
      'Generate a candidate first; materialize it only after the user approves.',
      'If you offered to save a plan and the user did not answer, ask once more before ending the task or moving past planning. An unanswered offer is not a decline; never save without an answer.',
    ],
    defaultFlow: [
      'Read fluent_get_context(domain="meals", intent="planning") first for broad planning/currentness.',
      'Check readiness with fluent_get_capabilities or fluent_get_next_actions only if the vNext context packet is unavailable or says lifecycle state blocks the request.',
      'Read meals_get_plan, meals_list_plan_history, meals_get_inventory_summary, or meals_list_recipes only if the vNext packet leaves a specific detail unresolved.',
      'Call meals_generate_plan with week_start and any clear constraints.',
      'Present candidate choices and ask for approval or revisions.',
      'On approval, call meals_accept_plan_candidate.',
      'Generate groceries with meals_generate_grocery_plan after the plan is accepted.',
    ],
    preferredTools: [
      'fluent_get_context',
      'meals_generate_plan',
      'meals_accept_plan_candidate',
      'meals_generate_grocery_plan',
    ],
    avoidByDefault: [
      'Do not accept a generated candidate without user approval.',
      'Do not read Health just because Health exists.',
      'Do not treat plan nutrition estimates as personalized medical or dietary targets.',
    ],
  },
  'fluent://guidance/meals-shopping': {
    title: 'Meals Shopping Runtime Flow',
    summary:
      'Use this for grocery-list views, at-home checks, substitutions, grocery intents, and order preflight.',
    rules: [
      'Treat the grocery plan as planning state, not the final retailer order.',
      'For ordinary ChatGPT grocery-list asks, meals_render_grocery_list_v2 is the preferred rich surface when available.',
      'For Claude, Codex, OpenClaw, and generic clients, use meals_get_current_grocery_list and answer in text or host-native visuals.',
      'Use meals_get_grocery_plan only when the user asks for a specific week-scoped grocery plan or raw planning/audit data.',
      'Use meals_prepare_order before retailer execution or order handoff.',
      'Use already-have confirmations for low-risk at-home item blockers; avoid them for fresh proteins, dairy, eggs, bread, or produce that needs quantity-aware review.',
    ],
    defaultFlow: [
      'For a user asking to see the grocery list, use the host-appropriate grocery-list read or render tool.',
      'For ordering or preflight, call meals_prepare_order against the relevant week_start.',
      'If at-home item uncertainty blocks preflight, resolve with meals_upsert_grocery_plan_action where appropriate.',
      'If the user manually wants something added, use meals_upsert_grocery_intent.',
      'Keep retailer automation outside the public Meals MCP contract.',
    ],
    preferredTools: [
      'meals_render_grocery_list_v2',
      'meals_get_current_grocery_list',
      'meals_get_grocery_plan',
      'meals_prepare_order',
      'meals_get_inventory_summary',
      'meals_upsert_grocery_plan_action',
      'meals_upsert_grocery_intent',
    ],
    avoidByDefault: [
      'Do not jump to retailer/cart execution from the raw grocery plan.',
      'Do not mark items purchased unless the user or receipt/order evidence supports it.',
      'Do not invent exact inventory quantities from already-have confirmations.',
    ],
  },
  'fluent://guidance/style-purchase-analysis': {
    title: 'Style Purchase Analysis vNext Public Flow',
    summary:
      'Use this for closet-aware purchase decisions in the public vNext profile. Fluent supplies the complete owned-category slice, owned-item media, and budget arithmetic in one read; the host inspects candidate images and makes the stylist judgment in prose.',
    rules: [
      'Default vNext public flow: call fluent_get_context(domain="style", intent="purchase", candidate={name, category?, subcategory?, image_urls?, price_text}, amount=priced_amount). candidate.price_text must be the exact listing price text you saw, and amount must equal the number in it. Do not start with fluent_list_items.',
      'The host inspects candidate images itself. A product URL, image URL, uploaded photo, or user-supplied item details can ground the candidate, but Fluent does not inspect candidate pixels for the host.',
      'The purchase ContextPacket includes CategoryResolution, StylePurchaseOwnedSlice, StylePurchaseCompleteness, and BudgetArithmeticFact. Use that packet as the sufficient Fluent read for the verdict unless it says complete:false or reports a blocking evidence gap.',
      'State a candidate price only when you have VERIFIED it from the actual product page or listing. Pass candidate.price_text EXACTLY as it appears on the listing, and pass amount only when it equals the number in that price_text; ranges are OK when amount is within the cited range. If you cannot cite a real price_text, ask the user for the price before any budget-sensitive verdict. Never state a typical, approximate, around, or from-memory price for the budget - an unverified estimate is not acceptable; ask instead.',
      'BudgetArithmeticFact is arithmetic only: weave price, remainingThisPeriod, delta, status, and caveats into the verdict, but never treat budget as Fluent capping or overriding the stylist recommendation.',
      'The host makes the stylist judgment from the candidate image/details, the complete owned-category slice, and the budget fact. Treat items as true substitutes only when they share the same wardrobe job; broad same-category matches are adjacent style context or rejected comparators.',
      'Stylist judgments should be decisive and grounded: same category/subcategory is only a starting point. Treat items as true substitutes only when they share the same wardrobe job; use broad same-category matches as adjacent context or rejected comparators.',
      'Use plain stylist wording such as same wardrobe job, adjacent style context, stronger case when, and weaker case when. Keep internal comparator labels out of user-facing purchase decisions, and do not treat novelty by itself as enough reason to buy.',
      'Banned wording in user-facing purchase decisions: lane, same role, Yes if, and No if. Say wardrobe job, closet gap, part of the wardrobe, slot, or role instead.',
      'Comparator integrity: before saying the user does not own anything like the candidate, ensure the read covered the candidate category; active same-model or same-garment owned items must be cited instead of treated as absent.',
      'The prose verdict always leads and is never replaced by a card. After the prose verdict, when the owned slice contains at least one true comparator (an owned item with the same wardrobe job as the candidate), render fluent_render_style_closet_surface with filter.item_ids set to those comparator item ids, beneath the verdict, so the user sees what they already own. Render only those model-selected ids — never the whole resolved category, never a category, subcategory, or query filter for a purchase. If there is no true owned comparator, stay prose-only and say the closet has no comparable item. Each owned-slice item carries its id next to its name; map your named comparators to those ids.',
      'If the ContextPacket says complete:false, say the slice is incomplete and offer to look wider instead of claiming the closet has no comparable item.',
      'When the user says an item was returned, sold, donated, gifted, worn out, never purchased, duplicate, gone, or no longer owned, use fluent_archive_item with the best disposition and report read-after-write proof.',
      'Archive only on an explicit user signal about a specific item. Never infer archiving from purchase advice, a stale comparator, or an item simply being absent from a read; if which item is meant is ambiguous, confirm first. Archive is reversible (restore by setting the item active) and audited — report read-after-write proof and state what you archived.',
      'LEGACY RUNTIME SECTION: Legacy-only hosts may still expose style_prepare_purchase_analysis, style_get_purchase_vision_packet, style_submit_purchase_visual_observations, style_analyze_purchase, style_render_purchase_analysis, style_show_purchase_analysis_widget, style_apply_purchase_analysis_action, style_archive_item, and style_set_item_product_image. Use those only when the vNext public flow is unavailable.',
    ],
    defaultFlow: [
      'Call fluent_get_context with domain="style", intent="purchase", candidate, and amount when a candidate purchase has a verified listing price_text; amount must match that price_text number or fall within its cited range.',
      'Inspect the candidate image or user-provided candidate details directly in the host; ask for a usable image/details when the candidate is not visually grounded enough for a purchase verdict.',
      'Make the host stylist judgment in prose with concrete observations, true-substitute discipline, comparator integrity, budget arithmetic as fact, and the banned-language rules.',
      'Cite relevant owned items by name and mention complete:false or blocking gaps plainly when present.',
      'For returned, sold, donated, gifted, worn-out, never-purchased, duplicate, gone, or no-longer-owned items, call fluent_archive_item with disposition and read-after-write proof.',
    ],
    preferredTools: [
      'fluent_get_context',
      'fluent_archive_item',
    ],
    avoidByDefault: [
      'Do not render the purchase verdict as a card; the verdict is prose. The only allowed render is a comparators-only closet surface (fluent_render_style_closet_surface with filter.item_ids) shown beneath the prose verdict, scoped to the owned items you judged true comparators — never the whole category.',
      'Do not call fluent_get_media_bundle or fluent_get_purchase_context as a default second/third read when fluent_get_context already returned the owned slice and BudgetArithmeticFact.',
      'Do not claim an image was inspected just because Fluent returned an image URL.',
      'Do not save a purchase to the closet unless the user explicitly wants it saved or logged.',
      'Do not use the words lane, nearby lane, same role, Yes if, or No if in the final user-facing purchase recommendation.',
    ],
  },
  'fluent://guidance/style-shopping': {
    title: 'Style Shopping to Closet Flow',
    summary:
      'Use this for the host-orchestrated loop from considering a style purchase, to buying or skipping, to saving an owned item with fit feedback, then enriching the saved closet row. It cross-references purchase analysis, onboarding, and enrichment rather than replacing them.',
    rules: [
      'Consideration is ephemeral. For the closet-aware buy/skip judgment, follow fluent://guidance/style-purchase-analysis: ONE fluent_get_context(domain="style", intent="purchase", candidate, amount) read returns the owned-category slice plus the budget over/under fact — do not call fluent_get_purchase_context separately for the verdict. Never create a closet row, wishlist row, or considered status for an item the user does not own yet.',
      'On buy, onboard the owned item with fluent_create_style_item. If the user tried it on or you have fit feedback, pass fit_assessment in the same create call so buy -> save -> fit lands in one explicit user-approved write. When adding from a product URL, pass the product page URL in source_snapshot.url; Fluent resolves the product gallery server-side, sets a clean product-photo display tile when it can, and returns the gallery for you to confirm or correct with vision. A direct image_url is only an optional hint, not the primary display decision.',
      'Fit source discipline: an in-person try-on is first-person evidence, so use fit_assessment.source "user" (rank 5). Review sentiment such as "reviewers say it runs small" is third-party text, never user evidence.',
      'For online-review fit sentiment, use fit_assessment.source "host_fit_vision" with has_fit_image false so Fluent downgrades it to host_text, or use host_text directly on a surface that exposes that source. A real try-on outranks review sentiment; a review should only fill an empty fitVerdict.',
      'Trust discipline follows fluent://guidance/style-enrichment: attach source_snapshot with the product or provenance URL, confirm rather than silently committing low-confidence or representative facts, and null beats invention. A clean product packshot from the product URL the user is adding from is legitimate display media, but for product URL adds Fluent resolves and sets the display tile from source_snapshot.url; use returned gallery images to confirm or correct. The never-auto-write caution is about fabricated, representative, unopened, or uncertain images.',
    ],
    defaultFlow: [
      'For a candidate purchase, the buy/skip verdict comes from ONE fluent_get_context(domain="style", intent="purchase", candidate, amount) read (owned-category slice with images + budget over/under fact), answered in PROSE per fluent://guidance/style-purchase-analysis. Do not call fluent_get_purchase_context separately or render a card as the verdict; you may render a comparators-only closet surface (filter.item_ids) beneath the prose verdict per fluent://guidance/style-purchase-analysis.',
      'If the user skips or is still considering, write nothing to the closet and keep the candidate host-side.',
      'If the user buys or says they own it now, call fluent_create_style_item with the supported onboarding fields, provenance, source_snapshot, client_token, and any fit_assessment. For product URL adds, put the product page URL in source_snapshot.url; Fluent resolves the gallery, chooses the display tile server-side, and returns the gallery for you to confirm or correct.',
      'After the item exists, use fluent://guidance/style-enrichment for web-found catalog details, descriptors, and later/extra images that need separate confirmation or routing through fluent_set_style_item_image.',
      'Return the read-after-write proof and clearly separate saved facts, low-confidence facts, and anything intentionally left unwritten.',
    ],
    preferredTools: [
      'fluent_get_context',
      'fluent_create_style_item',
      'fluent_refresh_style_item_profile',
      'fluent_update_style_item_patch',
      'fluent_set_style_item_image',
    ],
    avoidByDefault: [
      'Do not add a candidate-to-item bridge or auto-convert flow.',
      'Do not persist wishlist, considered, or not-yet-owned closet rows.',
      'Do not change or bypass the style-purchase-analysis buy/skip judgment.',
      'Do not stamp online reviews as user fit evidence.',
      'Do not save product images or representative catalog facts without the confirmation discipline from style-enrichment.',
    ],
  },
  'fluent://guidance/style-enrichment': {
    title: 'Style Closet Item Enrichment Flow',
    summary:
      'Use this when the user asks to fill in or enrich an EXISTING closet item with brand, catalog fields, descriptors, fit, or images. Lean into your own web search to find the product; Fluent stores what you bring. Fluent never browses, scrapes, or inspects pixels.',
    rules: [
      'You MAY, and are encouraged to, web-search the product to enrich an owned item. Fluent never browses; you do the lookup.',
      'Stamp web-found facts honestly: use url_scrape for facts from a product or catalog page, or host_text when reasoned from text. NEVER use host_vision unless you actually inspected pixels. Fluent downgrades false host_vision to host_text when no image accompanied the call. Set honest confidence.',
      'Route by data type: catalog facts such as brand, category, subcategory, color, size, and formality go to fluent_update_style_item_patch; tags and descriptors such as itemType, silhouette, fabricHand, styleRole, dressCode, seasonality, useCases, and pairingNotes go to fluent_refresh_style_item_profile, NOT patch, because patch stores those as provenance only; fit facts such as fitVerdict, ownedSize, lengthNote, and fitObservations go through the fit_assessment arg of refresh; a product or display image goes to fluent_set_style_item_image.',
      'When re-analyzing a saved item from its photo, first call fluent_get_media_bundle for that item or use its stored image URL, then actually inspect the pixels yourself. Refresh descriptors through fluent_refresh_style_item_profile, catalog corrections through fluent_update_style_item_patch, and fit evidence through the refresh fit_assessment channel. Stamp host_vision with has_image:true only when you truly inspected the image this turn; if the image is unavailable, use host_text, do not infer from the item name, and tell the user the photo was not available.',
      'Attach the product or source URL as provenance with source_snapshot on web-sourced writes.',
      'Confirm rather than silently commit when uncertain: a representative, "looks like it", or unverified match should use confidence below 0.6 and be presented for user confirmation before writing. Auto-write only when confident it is THIS item.',
      'Images are the high-risk case: never auto-write an enrichment image you have not actually opened and confirmed shows THIS user garment. A fabricated URL can still be a valid URL. Use fluent_set_style_item_image only with a host-inspected URL; hold representative or uncertain images for confirmation.',
      'Null beats invention. If you cannot find or verify a fact, leave it null or low-confidence.',
    ],
    defaultFlow: [
      'User asks to enrich an existing closet item.',
      'Web-search the product and collect candidate product, catalog, or retailer pages.',
      'Verify the match is the user item before writing; hold representative or uncertain matches for confirmation.',
      'Route each found fact to the right tool with url_scrape or host_text, honest confidence, and provenance URL.',
      'For a saved-photo re-analysis, retrieve inspectable media, look at the image, then split descriptor, catalog, and fit updates across refresh, patch, and fit_assessment with host_vision only when the image was actually viewed.',
      'For images, open and confirm the image shows this item before calling fluent_set_style_item_image; hold uncertain images for confirmation.',
      'Present read-after-write proof and surface low-confidence finds for user confirmation.',
    ],
    preferredTools: [
      'fluent_refresh_style_item_profile',
      'fluent_update_style_item_patch',
      'fluent_set_style_item_image',
      'fluent_get_media_bundle',
      'fluent_get_item',
      'fluent_list_evidence',
    ],
    avoidByDefault: [
      'Do not claim host_vision for web-found text.',
      'Do not auto-write an unopened or unverified image.',
      'Do not send tags or descriptors through patch; use refresh.',
      'Do not invent a brand or spec.',
    ],
  },
  'fluent://guidance/health-blocks': {
    title: 'Health Block Runtime Flow',
    summary:
      'Use this for fitness-first goals, training blocks, today resolution, workout logging, and weekly block review.',
    rules: [
      'Treat Health as block-first fitness support, not a broad medical domain.',
      'Use summary reads first: context, active block, today context, block projection, and goals.',
      'Create or revise blocks only when the user clearly wants planning.',
      'Use block review as the main coaching loop; logging should stay lightweight unless the user asks for detail.',
      'Route food execution to Meals instead of duplicating it in Health.',
    ],
    defaultFlow: [
      'Check readiness with fluent_get_capabilities or fluent_get_next_actions.',
      'Read health_get_context and health_get_active_block when continuity matters.',
      'Use health_get_today_context for today resolution.',
      'Use health_get_block_projection for the current week.',
      'Persist agreed goals, blocks, workout logs, body metrics, or reviews only from explicit user intent.',
    ],
    preferredTools: [
      'health_get_context',
      'health_get_active_block',
      'health_get_today_context',
      'health_get_block_projection',
      'health_list_goals',
      'health_upsert_block',
      'health_log_workout',
      'health_record_block_review',
    ],
    avoidByDefault: [
      'Do not provide symptom triage, injury diagnosis, rehab treatment, or medical authority.',
      'Do not rebuild a whole block when the user only asks what to do today.',
      'Do not create tracking-heavy workflows unless the user explicitly wants them.',
    ],
  },
  'fluent://guidance/style-onboarding': {
    title: 'Style Closet Item Onboarding Flow',
    summary:
      'Use this when the user wants to add a NEW garment to their Fluent closet from photos, a product URL, or a description. You (the host model) look at the photos or product-page evidence and produce one structured item; fluent_create_style_item validates, normalizes, resolves the product gallery server-side when source_snapshot.url is a product page, surfaces possible existing matches with discriminating signals for you to judge, stores provenance, and returns read-after-write proof. You still own visual confirmation/correction from returned gallery images.',
    rules: [
      'You are the vision: do not delegate the visual judgment to an external vision/LLM service. You MAY web-search the product to corroborate brand, model, material, or catalog details; record those as url_scrape or host_text, never host_vision. Fill every field you can support and leave the rest null rather than guessing.',
      'Read ALL provided photos together in one pass — product (color/pattern/silhouette/construction), fit (drape; secondary brand clue), tag/label (brand/size/material/colorway/care), detail. Do not profile each photo separately.',
      'Brand: if a tag is legible use that exact text; never substitute a more famous brand by visual resemblance. Infer from an exterior logo only when no tag is readable, at lower confidence. A web lookup confirming brand/model is a stronger source than a visual guess; tag it url_scrape or host_text. Null beats invention.',
      'category MUST be one of TOP, BOTTOM, OUTERWEAR, SHOE, ACCESSORY. Dresses are out of scope — do not onboard one. subcategory is required (a short garment noun such as Tee, Polo, Oxford, Sweater, Hoodie, Jacket, Coat, Jean, Chino, Trouser, Short, Sneaker, Loafer, Boot, Belt).',
      'comparator_key is advisory only — Fluent re-infers the wardrobe slot from category/subcategory and your profile tags/itemType. color_family is normalized server-side to a canonical lowercase set; provide a specific color_name and #RRGGBB color_hex when you can sample them.',
      'In profile, set styleRole to a wardrobe job (workhorse, bridge, statement, anchor, dress, specialist) — not a casual/smart/lounge label (Fluent repairs those). Put richer descriptors (aestheticLane, fabricWeight, performanceRole, definition, pattern) in technical_metadata; they are stored, not filtered.',
      'For every field you fill, supply field_evidence { value, source, confidence }. Use source host_vision only for fields you actually saw in pixels — Fluent downgrades host_vision to host_text when no image accompanied the call. Set an honest overall_confidence.',
      'Do NOT auto-commit blindly: present the draft for the user to confirm or correct, highlighting low-confidence fields. Annotate, never override the user-stated facts. With no widget, review conversationally and correct via fluent_update_style_item_patch.',
      'Pass a stable client_token so a retried create is idempotent; for multiple garments share a batch_id. If Fluent flags a possible duplicate it returns candidates with discriminating signals (brand/color/type/size/tags) — Fluent does not decide sameness, you do. Compare those signals (and, if you need pixels, the candidate photo via fluent_get_media_bundle or a fluent_render_style_closet_surface filtered to its id) against the new garment, confirm with the user, then re-call with on_duplicate "force" (genuinely different item) or "skip" (same item).',
      'Text-only or non-vision hosts: onboard from the user description and any transcribed tag text, mark sources host_text/inferred at honest lower confidence, leave color_hex/silhouette null rather than fabricating pixels, and lean on the confirm step. A host that can web-search the product may fill catalog fields such as color, material, or silhouette from the listing at honest lower confidence with url_scrape or host_text rather than leaving them null. When adding from a product URL, pass the product page URL in source_snapshot.url; Fluent resolves the gallery server-side, chooses a clean product-photo display tile when it can, and returns the gallery for a vision-capable host to confirm or correct. Fabricated or merely representative images still require confirmation and should not be auto-written.',
    ],
    defaultFlow: [
      'Confirm the user wants to add the item(s) to their closet.',
      'Read all photos together and produce the structured fields, the profile, and per-field evidence.',
      'Call fluent_create_style_item with provenance; pass a client_token (and batch_id for multiple items). For product URL adds, pass the product page URL in source_snapshot.url; Fluent resolves the gallery server-side and returns inline images so you can confirm the display tile or correct it with fluent_set_style_item_image.',
      'On a duplicate warning, compare the returned signals (and the candidate photo via fluent_get_media_bundle or a closet surface filtered to its id) against the garment, confirm the decision with the user, then re-call with on_duplicate "force" (different item) or "skip" (same item).',
      'Present the created draft for review; highlight low-confidence fields and apply user corrections via fluent_update_style_item_patch.',
    ],
    preferredTools: [
      'fluent_create_style_item',
      'fluent_update_style_item_patch',
      'fluent_render_style_closet_surface',
      'fluent_list_items',
    ],
    avoidByDefault: [
      'Do not invent a brand or a specific color you cannot see; leave it null and lower the confidence.',
      'Do not onboard a dress or anything outside the five canonical categories.',
      'Do not claim host_vision for a field you did not actually see in the photos.',
      'Do not bulk-create without the user intent, and do not silently keep a likely duplicate without confirming.',
    ],
  },
};

export function getFluentGuidanceDocument(uri: string): FluentGuidanceDocument | null {
  return (FLUENT_GUIDANCE_DOCUMENTS as Record<string, FluentGuidanceDocument>)[uri] ?? null;
}
