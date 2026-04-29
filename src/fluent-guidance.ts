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
      'In ChatGPT or MCP Apps-style hosts, render tools may be the primary end-user surface for recipe, grocery, pantry, and purchase-analysis views.',
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
      'Use summary reads first: preferences, current plan, plan history, and inventory summary.',
      'Only pass Health training context when the user explicitly asks meals to support training, recovery, cutting, bulking, or workouts.',
      'Treat named weekdays or dates as pinned slot constraints, not soft preferences.',
      'Generate a candidate first; materialize it only after the user approves.',
    ],
    defaultFlow: [
      'Check readiness with fluent_get_capabilities or fluent_get_next_actions.',
      'Read meals_get_preferences, meals_get_plan, meals_list_plan_history, and meals_get_inventory_summary.',
      'Call meals_generate_plan with week_start and any clear constraints.',
      'Present candidate choices and ask for approval or revisions.',
      'On approval, call meals_accept_plan_candidate.',
      'Generate groceries with meals_generate_grocery_plan after the plan is accepted.',
    ],
    preferredTools: [
      'meals_get_preferences',
      'meals_get_plan',
      'meals_list_plan_history',
      'meals_get_inventory_summary',
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
      'Use this for grocery-list views, pantry checks, substitutions, grocery intents, and order preflight.',
    rules: [
      'Treat the grocery plan as planning state, not the final retailer order.',
      'For ordinary ChatGPT grocery-list asks, meals_render_grocery_list_v2 is the preferred rich surface when available.',
      'For generic clients, use meals_get_grocery_plan and answer in text.',
      'Use meals_prepare_order before retailer execution or order handoff.',
      'Use pantry sufficiency confirmations for low-risk pantry blockers; avoid them for fresh proteins, dairy, eggs, bread, or produce that needs quantity-aware review.',
    ],
    defaultFlow: [
      'For a user asking to see the grocery list, use the host-appropriate grocery-list read or render tool.',
      'For ordering or preflight, call meals_prepare_order against the relevant week_start.',
      'If pantry uncertainty blocks preflight, resolve with meals_upsert_grocery_plan_action where appropriate.',
      'If the user manually wants something added, use meals_upsert_grocery_intent.',
      'Keep retailer automation outside the public Meals MCP contract.',
    ],
    preferredTools: [
      'meals_render_grocery_list_v2',
      'meals_get_grocery_plan',
      'meals_prepare_order',
      'meals_get_inventory_summary',
      'meals_upsert_grocery_plan_action',
      'meals_upsert_grocery_intent',
    ],
    avoidByDefault: [
      'Do not jump to retailer/cart execution from the raw grocery plan.',
      'Do not mark items purchased unless the user or receipt/order evidence supports it.',
      'Do not invent exact inventory quantities from pantry sufficiency confirmations.',
    ],
  },
  'fluent://guidance/style-purchase-analysis': {
    title: 'Style Purchase Analysis Runtime Flow',
    summary:
      'Use this for closet-aware purchase decisions. Fluent supplies closet state and evidence requirements; the host must inspect usable images before making visual claims.',
    rules: [
      'Use style_prepare_purchase_analysis as the required first step for every purchase decision, including text-only candidate names, product URLs, direct image URLs, and should-I-buy prompts.',
      'Do not use style_get_context as the purchase-analysis entrypoint; it is ambient closet context and does not return the shopping render gate or evidence requirements.',
      'A product page URL is not enough for reliable visual grounding; if preparation returns hostResponseMode=request_candidate_image, do not give a final buy/wait/skip answer yet. Extract a usable direct product image or ask the user for one.',
      'If style_prepare_purchase_analysis returns hostResponseMode=request_candidate_image, stop the purchase verdict path there; do not call style_analyze_purchase to produce a text-only shopping take.',
      'Use style_get_purchase_vision_packet after preparation and any needed page-evidence extraction to retrieve model-visible candidate and comparator images plus compact closet comparison context.',
      'Inspect the returned images with host vision, then call style_submit_purchase_visual_observations with concrete color, silhouette, material or texture, and distinctive-detail observations before rendering the widget.',
      'Do not call style_get_item during the normal purchase-analysis happy path unless the user is correcting an item, asking for provenance, or the bundle is missing detail needed for the answer.',
      'Do not treat style_analyze_purchase as the final verdict; the agent makes the stylist call from the evidence.',
      'In ChatGPT/App SDK hosts, after style_submit_purchase_visual_observations returns renderReady=true, call style_show_purchase_analysis_widget as the final presentation step before or alongside the final buy/wait/skip explanation.',
      'Use style_render_purchase_analysis for structured non-widget presentation data or text-first clients; do not use it as the default ChatGPT/App SDK finish.',
      'When the user says a closet item is wrong or no longer owned, use style_archive_item by item_id or exact item_name and report the read-after-write verification.',
      'When the user provides an exact product image for an exact closet item, use style_set_item_product_image; do not search or guess images.',
    ],
    defaultFlow: [
      'Call style_prepare_purchase_analysis with the candidate, even when the candidate is text-only or has no image yet.',
      'If preparation returns hostResponseMode=request_candidate_image, ask for or obtain a direct candidate product image before final judgment.',
      'Call style_extract_purchase_page_evidence when the user supplied a product URL and preparation needs direct candidate image references.',
      'Call style_get_purchase_vision_packet for candidate and closet comparator images.',
      'Inspect the vision packet images and use each asset itemContext and comparisonContext to make the stylist comparison.',
      'Call style_submit_purchase_visual_observations with concrete inspected-image facts.',
      'Call style_analyze_purchase or style_render_purchase_analysis with visual_evidence only when a text or structured answer is enough for the current client.',
      'For ChatGPT/App SDK hosts, call style_show_purchase_analysis_widget when renderReady=true, then give the short stylist explanation around the widget.',
    ],
    preferredTools: [
      'style_prepare_purchase_analysis',
      'style_extract_purchase_page_evidence',
      'style_get_purchase_vision_packet',
      'style_submit_purchase_visual_observations',
      'style_analyze_purchase',
      'style_render_purchase_analysis',
      'style_show_purchase_analysis_widget',
      'style_apply_purchase_analysis_action',
      'style_archive_item',
      'style_set_item_product_image',
    ],
    avoidByDefault: [
      'Do not render purchase analysis before evidence requirements are satisfied.',
      'Do not claim an image was inspected just because Fluent returned an image URL.',
      'Do not save a purchase to the closet unless the user explicitly wants it saved or logged.',
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
};

export function getFluentGuidanceDocument(uri: string): FluentGuidanceDocument | null {
  return (FLUENT_GUIDANCE_DOCUMENTS as Record<string, FluentGuidanceDocument>)[uri] ?? null;
}
