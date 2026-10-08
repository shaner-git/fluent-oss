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
      'In ChatGPT or MCP Apps-style hosts, the Style closet render tool may be the primary end-user surface for the saved closet. Meals is retired (D30); do not route meal, recipe, or grocery asks to Fluent.',
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
      'Do not fork Fluent domain semantics by platform. Style and Core tools keep the same canonical meaning across hosts.',
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
    ],
    avoidByDefault: [
      'Do not create platform-specific variants of ordinary Fluent domain tools.',
      'Do not assume ChatGPT/App SDK widget support in Claude, OpenClaw, Codex, or generic MCP clients.',
      'Do not assume packaged skills exist in ChatGPT or generic MCP clients.',
    ],
  },
  'fluent://guidance/style-purchase-analysis': {
    title: 'Style Purchase Analysis Public Flow',
    summary:
      'Use this for closet-aware purchase decisions in the public profile. Fluent supplies the complete owned-category slice and owned-item media in one read; the host inspects candidate images and makes the stylist judgment in prose. Fluent does not track budgets.',
    rules: [
      'Default public flow: call fluent_get_closet_context(domain="style", intent="purchase", candidate={name, category?, subcategory?, image_urls?, price_text?}). Do not start with fluent_list_closet_items.',
      'The host inspects candidate images itself. A product URL, image URL, uploaded photo, or user-supplied item details can ground the candidate, but Fluent does not inspect candidate pixels for the host.',
      'The purchase ContextPacket includes CategoryResolution, StylePurchaseOwnedSlice, and StylePurchaseCompleteness. Use that packet as the sufficient Fluent read for the verdict unless it says complete:false or reports a blocking evidence gap.',
      'Fluent does not track budgets. If price matters, ask the user about their budget; never attribute a budget to Fluent. State a candidate price only when you have verified it from the listing.',
      'The host makes the stylist judgment from the candidate image/details and the complete owned-category slice. Treat items as true substitutes only when they share the same wardrobe job; broad same-category matches are adjacent style context or rejected comparators.',
      'Stylist judgments should be decisive and grounded: same category/subcategory is only a starting point. Treat items as true substitutes only when they share the same wardrobe job; use broad same-category matches as adjacent context or rejected comparators.',
      'Use plain stylist wording such as same wardrobe job, adjacent style context, stronger case when, and weaker case when. Keep internal comparator labels out of user-facing purchase decisions, and do not treat novelty by itself as enough reason to buy.',
      'Banned wording in user-facing purchase decisions: lane, same role, Yes if, and No if. Say wardrobe job, closet gap, part of the wardrobe, slot, or role instead.',
      'Comparator integrity: before saying the user does not own anything like the candidate, ensure the read covered the candidate category; active same-model or same-garment owned items must be cited instead of treated as absent.',
      'The prose verdict always leads and is never replaced by a card. After the prose verdict, when the owned slice contains at least one true comparator (an owned item with the same wardrobe job as the candidate), render fluent_show_closet with filter.item_ids set to those comparator item ids, beneath the verdict, so the user sees what they already own. Render only those model-selected ids — never the whole resolved category, never a category, subcategory, or query filter for a purchase. If there is no true owned comparator, stay prose-only and say the closet has no comparable item. Each owned-slice item carries its id next to its name; map your named comparators to those ids.',
      'If the ContextPacket says complete:false, say the slice is incomplete and offer to look wider instead of claiming the closet has no comparable item.',
      'When the user says an item was returned, sold, donated, gifted, worn out, never purchased, duplicate, gone, or no longer owned, use fluent_archive_closet_item with the best disposition and report read-after-write proof. When the user explicitly confirms two saved Style records are the same physical garment, use fluent_merge_closet_items with item_id set to the redundant record, merge_into_item_id set to the exact canonical record, and a new merge_operation_id; never infer or auto-merge.',
      'Archive only on an explicit user signal about a specific item. Never infer archiving from purchase advice, a stale comparator, or an item simply being absent from a read; if which item is meant is ambiguous, confirm first. Archive is reversible (restore by setting the item active) and audited — report read-after-write proof and state what you archived.',
    ],
    defaultFlow: [
      'Call fluent_get_closet_context with domain="style", intent="purchase", and the candidate.',
      'Inspect the candidate image or user-provided candidate details directly in the host; ask for a usable image/details when the candidate is not visually grounded enough for a purchase verdict.',
      'Make the host stylist judgment in prose with concrete observations, true-substitute discipline, comparator integrity, and the banned-language rules.',
      'Cite relevant owned items by name and mention complete:false or blocking gaps plainly when present.',
      'For returned, sold, donated, gifted, worn-out, never-purchased, duplicate, gone, or no-longer-owned items, call fluent_archive_closet_item with disposition and read-after-write proof. For a user-confirmed saved-item duplicate, call fluent_merge_closet_items with the redundant item_id plus the exact canonical merge_into_item_id so one item remains with the combined photos.',
    ],
    preferredTools: [
      'fluent_get_closet_context',
      'fluent_archive_closet_item',
    ],
    avoidByDefault: [
      'Do not render the purchase verdict as a card; the verdict is prose. The only allowed render is a comparators-only closet surface (fluent_show_closet with filter.item_ids) shown beneath the prose verdict, scoped to the owned items you judged true comparators — never the whole category.',
      'Do not call fluent_get_closet_item_photos as a default second read when fluent_get_closet_context already returned the owned slice.',
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
      'Consideration is ephemeral. For the closet-aware buy/skip judgment, follow fluent://guidance/style-purchase-analysis: ONE fluent_get_closet_context(domain="style", intent="purchase", candidate) read returns the owned-category slice. Never create a closet row, wishlist row, or considered status for an item the user does not own yet.',
      'On buy, onboard the owned item with fluent_add_closet_item. A photo is optional but encouraged: when you have inspected a usable primary Catalog image, include it with catalog_ready=true (and, for a generated Catalog, the exact retained source_image_file in that same call); otherwise save the item without a photo and offer once to add one. If the user tried it on or you have fit feedback, pass fit_assessment and retain the on-you source as source_image_type fit so buy -> save -> fit lands in one explicit user-approved flow. source_snapshot.url is provenance only. Fluent does not fetch that page or resolve its gallery.',
      'Fit source discipline: an in-person try-on is first-person evidence, so use fit_assessment.source "user" (rank 5). Review sentiment such as "reviewers say it runs small" is third-party text, never user evidence.',
      'For online-review fit sentiment, use fit_assessment.source "host_fit_vision" with has_fit_image false so Fluent downgrades it to host_text, or use host_text directly on a surface that exposes that source. A real try-on outranks review sentiment; a review should only fill an empty fitVerdict.',
      'Trust discipline follows fluent://guidance/style-enrichment: attach source_snapshot with the product or provenance URL, confirm rather than silently committing low-confidence or representative facts, and null beats invention. A clean product packshot is legitimate display media only after the host has inspected its direct image URL. source_snapshot.url never selects or writes a display image.',
    ],
    defaultFlow: [
      'For a candidate purchase, the buy/skip verdict comes from ONE fluent_get_closet_context(domain="style", intent="purchase", candidate) read (owned-category slice with images), answered in PROSE per fluent://guidance/style-purchase-analysis. Do not render a card as the verdict; you may render a comparators-only closet surface (filter.item_ids) beneath the prose verdict per fluent://guidance/style-purchase-analysis.',
      'If the user skips or is still considering, write nothing to the closet and keep the candidate host-side.',
      'If the user buys or says they own it now, call fluent_add_closet_item with the supported onboarding fields, provenance, source_snapshot, client_token, and any fit_assessment. Include the inspected primary Catalog image with catalog_ready=true when you have one (plus source_image_file when the Catalog is generated); if you do not, save the item without a photo and offer once to add one through fluent_set_closet_item_photo. Treat source_snapshot.url only as provenance and never write a representative image.',
      'After the item exists, use fluent://guidance/style-enrichment for web-found catalog details, descriptors, and later/extra images that need separate confirmation or routing through fluent_set_closet_item_photo.',
      'Return the read-after-write proof and clearly separate saved facts, low-confidence facts, and anything intentionally left unwritten.',
    ],
    preferredTools: [
      'fluent_get_closet_context',
      'fluent_add_closet_item',
      'fluent_record_closet_item_feedback',
      'fluent_update_closet_item',
      'fluent_set_closet_item_photo',
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
      "Prefer a verified original retailer product photo over regenerating the garment. Once the exact product and colour are confirmed, select a complete, clear product view with consistent orientation (shoe toes facing right where a verified source view is available; never mirror lettering or logos); use existing transparency directly and normalize its framing without changing proportions. For an opaque clean product photo, prefer a reviewed background-only alpha mask that preserves garment pixels. Keep the untouched original separately, label the masked derivative as Catalog rather than generated or original evidence, and retain its source association. Generate a faithful product view only when the available source cannot supply a usable complete product view. Inspect edges, soles, logos and text on light and dark backgrounds before accepting either approach. Never use generated imagery as independent identity evidence.",
      'When fluent_save_closet_item_product_details is available, read the existing item and save a typed product reference with it: expected_revision from productReference.revision (0 if absent), a UUID operation_id, and reference. New items use the same flow after create returns the saved ID. Preserve all existing facts when revising: the reference is a replacement, not a sparse patch. Confirmation resolves product identity once; do not ask separately for each listing fact. Uncertain matches stay candidate until the user confirms. Rejected matches must not be silently proposed again. Never treat generated cutouts as original identity evidence.',
      'If the user shares a narrowly relevant receipt or order confirmation during onboarding, use only its product facts; Fluent never accesses email. Send only product facts and source kind receipt, never raw messages, addresses, payment details, order identifiers, or private links. No email access is an ordinary partial outcome. Research ends with the host turn; no background search is implied. Composition and care belong in product reference facts with source IDs (fluent_save_closet_item_product_details), not tags or fit notes. Retailer images still use the existing inspected alternate-photo add flow; enrichment itself never changes covers or photos.',
      'You MAY, and are encouraged to, web-search the product to enrich an owned item. Fluent never browses; you do the lookup.',
      'Stamp web-found facts honestly: use url_scrape for facts from a product or catalog page, or host_text when reasoned from text. NEVER use host_vision unless you actually inspected pixels. Fluent downgrades false host_vision to host_text when no image accompanied the call. Set honest confidence.',
      'Route by data type: catalog facts such as brand, category, subcategory, color, size, and formality go to fluent_update_closet_item; tags and descriptors such as itemType, silhouette, fabricHand, styleRole, dressCode, seasonality, useCases, and pairingNotes go to fluent_record_closet_item_feedback, NOT patch, because patch stores those as provenance only; fit facts such as fitVerdict, ownedSize, lengthNote, and fitObservations go through the fit_assessment arg of refresh; a product or display image goes to fluent_set_closet_item_photo.',
      'When re-analyzing a saved item from its photo, first call fluent_get_closet_item_photos for that item or use its stored image URL, then actually inspect the pixels yourself. Refresh descriptors through fluent_record_closet_item_feedback, catalog corrections through fluent_update_closet_item, and fit evidence through the refresh fit_assessment channel. Stamp host_vision with has_image:true only when you truly inspected the image this turn; if the image is unavailable, use host_text, do not infer from the item name, and tell the user the photo was not available.',
      'Attach the product or source URL as provenance with source_snapshot on web-sourced writes.',
      'Confirm rather than silently commit when uncertain: a representative, "looks like it", or unverified match should use confidence below 0.6 and be presented for user confirmation before writing. Auto-write only when confident it is THIS item.',
      'For another photo of an existing item, match the exact item and use fluent_add_closet_item_photo with image_type fit for worn evidence or alternate for product/detail evidence. Verify the returned photoId. This preserves the cover and prior photos. Only prepare and replace an existing cover when asked; never use a primary slot write for an add-photo request.',
      'Images are the high-risk case: never auto-write an enrichment image you have not actually opened and confirmed shows THIS user garment. A fabricated URL can still be a valid URL. For an existing item, ordinary secondary evidence may use a host-inspected reference. To finish Catalog readiness, send owned bytes through fluent_set_closet_item_photo with catalog_ready=true; host-generated media also requires the exact retained source_photo_id. Hold representative or uncertain images for confirmation.',
      'Null beats invention. If you cannot find or verify a fact, leave it null or low-confidence.',
    ],
    defaultFlow: [
      'User asks to enrich an existing closet item.',
      'Web-search the product and collect candidate product, catalog, or retailer pages.',
      'Verify the match is the user item before writing; hold representative or uncertain matches for confirmation.',
      'Route each found fact to the right tool with url_scrape or host_text, honest confidence, and provenance URL.',
      'For a saved-photo re-analysis, retrieve inspectable media, look at the image, then split descriptor, catalog, and fit updates across refresh, patch, and fit_assessment with host_vision only when the image was actually viewed.',
      'For images, open and confirm the image shows this item before calling fluent_set_closet_item_photo; for a reviewed primary Catalog use owned bytes plus catalog_ready=true, and include source_photo_id when it is host-generated. Hold uncertain images for confirmation.',
      'Present read-after-write proof and surface low-confidence finds for user confirmation.',
    ],
    preferredTools: [
      'fluent_record_closet_item_feedback',
      'fluent_update_closet_item',
      'fluent_save_closet_item_product_details',
      'fluent_set_closet_item_photo',
      'fluent_get_closet_item_photos',
      'fluent_get_closet_item',
      'fluent_list_closet_evidence',
    ],
    avoidByDefault: [
      'Do not claim host_vision for web-found text.',
      'Do not auto-write an unopened or unverified image.',
      'Do not send tags or descriptors through patch; use refresh.',
      'Do not invent a brand or spec.',
    ],
  },
  'fluent://guidance/style-onboarding': {
    title: 'Style Closet Item Onboarding Flow',
    summary:
      'Use this when the user wants to add a NEW garment to their Fluent closet from photos or a product URL. You (the host model) inspect the evidence, resolve possible duplicates, and prepare structured metadata and, whenever you can, a usable primary Catalog presentation before creating the item. A photo is optional but strongly encouraged. With catalog_ready=true, fluent_add_closet_item stores owned Catalog bytes and, for generated media, exact retained source bytes in the same call; Fluent derives the durable source/quality binding. An item saved without a photo is a real active item with photoStatus "needs_photo". Fluent does not browse the source page, resolve its gallery, generate images, or run a later widget normalization workflow; the host owns every visual claim and image choice.',
    rules: [
      'You are the vision: do not delegate the visual judgment to an external vision/LLM service. You MAY web-search the product to corroborate brand, model, material, or catalog details; record those as url_scrape or host_text, never host_vision. Fill every field you can support and leave the rest null rather than guessing.',
      'Accept individual files or a folder. Inspect original-resolution images (or a full-pixel derivative when the host must decode HEIC/HEIF) in bounded batches, while reasoning across the whole import rather than profiling each photo as an independent item.',
      'When people appear, establish the target person from user direction or a local-only reference and exclude garments worn only by other people. Do not persist biometric identity or the reference itself.',
      'Read each garment evidence set together — product (color/pattern/silhouette/construction), fit (drape; secondary brand clue), tag/label (brand/size/material/colorway/care), detail. Group likely views of the same physical item before creating anything.',
      'Brand: if a tag is legible use that exact text; never substitute a more famous brand by visual resemblance. Infer from an exterior logo only when no tag is readable, at lower confidence. A web lookup confirming brand/model is a stronger source than a visual guess; tag it url_scrape or host_text. Null beats invention.',
      'category MUST be one of TOP, BOTTOM, OUTERWEAR, SHOE, ACCESSORY, ONE_PIECE. Use ONE_PIECE for dresses, jumpsuits, rompers and overalls. subcategory is required (a short garment noun such as Tee, Polo, Oxford, Sweater, Hoodie, Jacket, Coat, Jean, Chino, Trouser, Short, Sneaker, Loafer, Boot, Belt, Dress, Jumpsuit).',
      'comparator_key is advisory only — Fluent re-infers the wardrobe slot from category/subcategory and your profile tags/itemType. color_family is normalized server-side to a canonical lowercase set; provide a specific color_name and #RRGGBB color_hex when you can sample them.',
      'In profile, set styleRole to a wardrobe job (workhorse, bridge, statement, anchor, dress, specialist) — not a casual/smart/lounge label (Fluent repairs those). Put richer descriptors (aestheticLane, fabricWeight, performanceRole, definition, pattern) in technical_metadata; they are stored, not filtered.',
      'For every field you fill, supply field_evidence { value, source, confidence }. Use source host_vision only for fields you actually saw in pixels — Fluent downgrades host_vision to host_text when no image accompanied the call. Set an honest overall_confidence.',
      'Confirm the import request once, then process the batch without interrupting for every item. Hold ambiguous identity, low-confidence, unsupported-image, and possible-duplicate decisions without creating them, then collect those decisions for one concise review.',
      'Do NOT auto-commit blindly: preserve user-stated facts, but do not force item-by-item confirmation when the user already approved the import. Complete metadata, evidence, duplicate disposition, and (whenever you have a usable image) the Catalog presentation before each create.',
      'Pass a stable client_token so a retried create is idempotent; for multiple garments share a batch_id. If Fluent flags a possible duplicate it returns candidates with discriminating signals (brand/color/type/size/tags) and writes nothing for that garment — Fluent does not decide sameness, you do. Continue processing unrelated garments, collect all warned items for one decision turn, compare their signals (and, if needed, candidate photos via fluent_get_closet_item_photos or a filtered closet surface), then re-call each genuinely different item with on_duplicate "force" and its duplicate_candidate_id. For the same item, do not create it: attach the photo to the existing item with fluent_add_closet_item_photo, or fluent_set_closet_item_photo with image_type primary when it has no photo yet. Decide later leaves the item unsaved.',
      'Prefer saving with a photo: for an inspected clean source, send it as owned image_file media with image_origin user_source and catalog_ready=true; for a generated Catalog, send the generated image_file and exact retained source_image_file together, choosing source_image_type fit for on-you evidence. If no usable image is available (a text-only description, or the host cannot inspect or faithfully generate one), save the item without a photo instead of holding it; Fluent returns photoStatus "needs_photo" and nextPhotoStep, so offer once to add a photo later with fluent_set_closet_item_photo (the first photo becomes the cover). A host that can web-search may corroborate fields from listing text at honest lower confidence with url_scrape or host_text, but source_snapshot.url is provenance only and a merely representative image must never be written.',
      'Finish with separate concise counts for added, matched-existing, needs-decision, held, skipped, and failed items. A created item is active; warned, held, skipped, or failed inputs are not durable items. When review is useful, follow create result reviewHandoff values exactly and render only exact durable item IDs with filter.status active. pending_review is not a lifecycle or render-filter status.',
    ],
    defaultFlow: [
      'Confirm the user wants to add the item(s) to their closet once; accept files or a folder and plan bounded original-resolution batches.',
      'Establish the target person when needed, group views by physical garment, exclude non-target garments, resolve identity and duplicates, produce the structured fields and evidence, and, when possible, create or select a faithful primary Catalog presentation.',
      'Call fluent_add_closet_item with provenance and a stable client_token (plus batch_id for multiple items). With a usable image, set catalog_ready=true: a clean inspected source needs one image_file; a generated Catalog also needs the exact source_image_file in the same call. Without one, save the item photo-less and offer once to add a photo; never promise a later widget normalization step.',
      'On duplicate warnings, continue unrelated garments, collect all warned items for one concise decision turn, and do not include them in created-item review. Then compare signals and candidate photos as needed and re-call different items with on_duplicate "force"; for the same item, attach its photo to the existing item with fluent_add_closet_item_photo (or fluent_set_closet_item_photo, image_type primary, when it has no photo). Decide later leaves no durable item.',
      'Return separate added/matched-existing/needs-decision/held/skipped/failed counts. For created items that benefit from review, follow returned reviewHandoff values and render only active exact IDs in ingestion_review; highlight low-confidence fields and apply user corrections via fluent_update_closet_item. Never invent pending_review.',
    ],
    preferredTools: [
      'fluent_add_closet_item',
      'fluent_update_closet_item',
      'fluent_show_closet',
      'fluent_list_closet_items',
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
