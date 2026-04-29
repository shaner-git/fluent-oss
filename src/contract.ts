import {
  MEALS_GROCERY_LIST_TEMPLATE_URI,
  MEALS_GROCERY_SMOKE_TEMPLATE_URI,
} from './domains/meals/grocery-list';
import { MEALS_PANTRY_DASHBOARD_TEMPLATE_URI } from './domains/meals/pantry-dashboard';
import { MEALS_RECIPE_CARD_TEMPLATE_URI } from './domains/meals/recipe-card';
import {
  STYLE_PURCHASE_ANALYSIS_CACHED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_COMBINED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_HUMAN_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_IMAGE_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_LEGACY_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
} from './domains/style/purchase-analysis';
import { FLUENT_HOME_TEMPLATE_URI } from './fluent-home';

export const FLUENT_CONTRACT_VERSION = '2026-04-26.fluent-core-v1.48';
export const FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION = FLUENT_CONTRACT_VERSION;

export const FLUENT_GUIDANCE_RESOURCE_URIS = [
  'fluent://guidance/routing',
  'fluent://guidance/host-capabilities',
  'fluent://guidance/meals-planning',
  'fluent://guidance/meals-shopping',
  'fluent://guidance/style-purchase-analysis',
  'fluent://guidance/health-blocks',
] as const;

export const FLUENT_RESOURCE_URIS = [
  'fluent://core/capabilities',
  'fluent://core/account-status',
  'fluent://core/profile',
  'fluent://core/domains',
  ...FLUENT_GUIDANCE_RESOURCE_URIS,
  FLUENT_HOME_TEMPLATE_URI,
  'fluent://health/preferences',
  'fluent://health/context',
  'fluent://health/today',
  'fluent://health/active-block',
  'fluent://health/block-projection',
  'fluent://health/review-context',
  'fluent://health/blocks/{block_id}',
  'fluent://health/goals',
  'fluent://meals/current-plan',
  'fluent://meals/inventory',
  'fluent://meals/preferences',
  'fluent://meals/plans/{week_start}',
  'fluent://meals/recipes/{recipe_id}',
  'fluent://meals/grocery-plan/{week_start}',
  'fluent://meals/confirmed-order-sync/{retailer}/{retailer_order_id}',
  MEALS_RECIPE_CARD_TEMPLATE_URI,
  MEALS_GROCERY_LIST_TEMPLATE_URI,
  MEALS_PANTRY_DASHBOARD_TEMPLATE_URI,
  'fluent://style/profile',
  'fluent://style/context',
  'fluent://style/items',
  'fluent://style/items/{item_id}',
  'fluent://style/item-profiles/{item_id}',
  'fluent://style/item-provenance/{item_id}',
  STYLE_PURCHASE_ANALYSIS_LEGACY_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_PREVIOUS_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_CACHED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_IMAGE_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_HUMAN_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_COMBINED_TEMPLATE_URI,
  STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
] as const;

export const FLUENT_TOOL_NAMES = [
  'fluent_get_capabilities',
  'fluent_get_account_status',
  'fluent_get_home',
  'fluent_get_next_actions',
  'fluent_get_profile',
  'fluent_update_profile',
  'fluent_list_domains',
  'fluent_enable_domain',
  'fluent_disable_domain',
  'fluent_begin_domain_onboarding',
  'fluent_complete_domain_onboarding',
  'health_get_preferences',
  'health_update_preferences',
  'health_get_context',
  'health_get_today_context',
  'health_get_review_context',
  'health_get_active_block',
  'health_get_block',
  'health_get_block_projection',
  'health_list_goals',
  'health_upsert_goal',
  'health_upsert_block',
  'health_record_block_review',
  'health_list_workout_logs',
  'health_log_workout',
  'health_list_body_metrics',
  'health_log_body_metric',
  'meals_list_tools',
  'meals_get_plan',
  'meals_list_plan_history',
  'meals_get_day_plan',
  'meals_get_today_context',
  'meals_get_recipe',
  'meals_render_recipe_card',
  'meals_render_pantry_dashboard',
  'meals_render_grocery_list_v2',
  'meals_create_recipe',
  'meals_list_recipes',
  'meals_get_preferences',
  'meals_update_preferences',
  'meals_upsert_plan',
  'meals_generate_plan',
  'meals_accept_plan_candidate',
  'meals_get_inventory',
  'meals_get_inventory_summary',
  'meals_get_meal_memory',
  'meals_list_feedback',
  'fluent_list_domain_events',
  'meals_generate_grocery_plan',
  'meals_get_grocery_plan',
  'meals_prepare_order',
  'meals_patch_recipe',
  'meals_log_feedback',
  'meals_mark_meal_cooked',
  'meals_update_inventory',
  'meals_delete_inventory_item',
  'meals_update_inventory_batch',
  'meals_record_plan_review',
  'meals_list_grocery_plan_actions',
  'meals_upsert_grocery_plan_action',
  'meals_delete_grocery_plan_action',
  'meals_list_grocery_intents',
  'meals_upsert_grocery_intent',
  'meals_delete_grocery_intent',
  'meals_apply_pantry_dashboard_action',
  'style_get_profile',
  'style_update_profile',
  'style_get_context',
  'style_list_descriptor_backlog',
  'style_list_evidence_gaps',
  'style_analyze_wardrobe',
  'style_list_items',
  'style_get_item',
  'style_get_item_profile',
  'style_get_item_provenance',
  'style_upsert_item',
  'style_archive_item',
  'style_upsert_item_profile',
  'style_upsert_item_photos',
  'style_set_item_product_image',
  'style_extract_purchase_page_evidence',
  'style_prepare_purchase_analysis',
  'style_get_purchase_vision_packet',
  'style_submit_purchase_visual_observations',
  'style_analyze_purchase',
  'style_render_purchase_analysis',
  'style_show_purchase_analysis_widget',
  'style_apply_purchase_analysis_action',
  'style_get_visual_bundle',
] as const;

export const FLUENT_OPTIONAL_CAPABILITIES = [
  'structured_content',
  'grocery_intents',
  'domain_events',
  'profile_resources',
  'meal_preferences',
  'plan_history',
  'grocery_plan',
  'plan_generation',
  'calendar_aware_planning',
  'grocery_plan_actions',
  'inventory_batch_updates',
  'inventory_hard_delete',
  'grocery_order_preflight',
  'grocery_pantry_sufficiency_confirmation',
  'grocery_purchase_carry_forward',
  'confirmed_order_sync',
  'tool_discovery_hints',
  'runtime_guidance_resources',
  'next_action_routing',
  'host_profiles',
  'tool_list_fallback',
  'fluent_home',
  'fluent_home_widget',
  'ingredient_form_groups',
  'recipe_card_widget',
  'pantry_dashboard_widget',
  'grocery_list_widget_v2',
  'style_profile',
  'style_context',
  'style_purchase_analysis',
  'style_purchase_analysis_widget',
  'style_onboarding_summary',
  'style_media_roles',
  'style_media_delivery',
  'style_visual_bundle',
  'style_item_status',
  'style_item_profile_writes',
  'style_item_provenance',
  'style_evidence_gaps',
  'style_descriptor_backlog',
  'style_wardrobe_analysis',
  'style_descriptor_enrichment',
  'style_comparator_identity',
  'style_comparator_coverage',
  'health_preferences',
  'health_block_programming',
  'health_today_resolution',
  'health_block_reviews',
  'health_workout_logging',
  'health_body_metrics',
  'account_status_surface',
] as const;

export const FLUENT_TOOL_ALIASES = [
  {
    canonicalTool: 'meals_render_recipe_card',
    name: 'meals_show_recipe',
    note:
      'Preferred public runtime alias for ChatGPT/App SDK recipe-opening prompts. The frozen contract keeps meals_render_recipe_card as the canonical tool name.',
  },
] as const;

export const FLUENT_DEV_TOOL_NAMES = [
  'meals_render_grocery_widget_smoke',
] as const;

export const FLUENT_DEV_RESOURCE_URIS = [
  MEALS_GROCERY_SMOKE_TEMPLATE_URI,
] as const;

const FLUENT_CHATGPT_APP_CORE_TOOLS = [
  'fluent_get_home',
  'fluent_get_capabilities',
  'fluent_get_account_status',
  'fluent_get_next_actions',
  'fluent_get_profile',
  'fluent_list_domains',
] as const;

const FLUENT_CHATGPT_APP_MEALS_TOOLS = [
  'meals_list_tools',
  'meals_get_plan',
  'meals_list_plan_history',
  'meals_get_day_plan',
  'meals_get_today_context',
  'meals_get_recipe',
  'meals_render_recipe_card',
  'meals_render_pantry_dashboard',
  'meals_render_grocery_list_v2',
  'meals_list_recipes',
  'meals_generate_plan',
  'meals_accept_plan_candidate',
  'meals_get_inventory',
  'meals_get_inventory_summary',
  'meals_generate_grocery_plan',
  'meals_get_grocery_plan',
  'meals_apply_pantry_dashboard_action',
] as const;

const FLUENT_CHATGPT_APP_STYLE_TOOLS = [
  'style_get_profile',
  'style_get_context',
  'style_extract_purchase_page_evidence',
  'style_prepare_purchase_analysis',
  'style_get_purchase_vision_packet',
  'style_submit_purchase_visual_observations',
  'style_analyze_purchase',
  'style_render_purchase_analysis',
  'style_show_purchase_analysis_widget',
  'style_apply_purchase_analysis_action',
  'style_get_visual_bundle',
  'style_archive_item',
  'style_set_item_product_image',
] as const;

const FLUENT_CHATGPT_APP_HEALTH_TOOLS = [
  'health_get_context',
  'health_get_today_context',
  'health_get_active_block',
  'health_get_block_projection',
] as const;

const FLUENT_CHATGPT_APP_CORE_RESOURCES = [
  FLUENT_HOME_TEMPLATE_URI,
  'fluent://core/capabilities',
  'fluent://core/account-status',
  'fluent://core/profile',
  'fluent://core/domains',
  ...FLUENT_GUIDANCE_RESOURCE_URIS,
] as const;

const FLUENT_CHATGPT_APP_MEALS_RESOURCES = [
  'fluent://meals/current-plan',
  'fluent://meals/inventory',
  'fluent://meals/preferences',
  MEALS_RECIPE_CARD_TEMPLATE_URI,
  MEALS_GROCERY_LIST_TEMPLATE_URI,
  MEALS_PANTRY_DASHBOARD_TEMPLATE_URI,
] as const;

const FLUENT_CHATGPT_APP_STYLE_RESOURCES = [
  'fluent://style/profile',
  'fluent://style/context',
  STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI,
] as const;

const FLUENT_CHATGPT_APP_HEALTH_RESOURCES = [
  'fluent://health/context',
  'fluent://health/today',
  'fluent://health/active-block',
  'fluent://health/block-projection',
] as const;

export const FLUENT_CHATGPT_APP_WRITE_TOOL_NAMES = [
  'meals_generate_plan',
  'meals_accept_plan_candidate',
  'meals_generate_grocery_plan',
  'meals_apply_pantry_dashboard_action',
  'style_apply_purchase_analysis_action',
  'style_archive_item',
  'style_set_item_product_image',
] as const;

export const FLUENT_CHATGPT_APP_PROFILE = {
  accountLinks: {
    billing: '/account/billing',
    deleteAccount: '/account/delete',
    exportData: '/account/export',
    reactivate: '/account/reactivate',
    signIn: '/sign-in',
  },
  degradedDomainPolicy:
    'Expose Fluent Home and account helpers for every connected account; expose Meals, Style, and Health surfaces only when the matching domain is ready.',
  excludedSurfacePolicy: [
    'admin/internal tools',
    'debug/dev tools',
    'raw export/deletion internals',
    'Stripe webhook/billing internals',
    'grocery checkout/cart automation',
    'experimental preview surfaces',
    'raw IDs/logs/traces',
  ],
  id: 'chatgpt-app',
  title: 'Fluent ChatGPT App',
  writeIntentPolicy:
    'Write tools must be invoked only from explicit user intent, including a direct user request to create/update state or a user-initiated widget action.',
} as const;

export type FluentChatGptAppDomain = 'health' | 'meals' | 'style';
export type FluentHostProfileId = 'chatgpt_app' | 'claude' | 'openclaw' | 'codex' | 'generic_mcp';

export interface FluentHostProfile {
  id: FluentHostProfileId;
  title: string;
  toolExposure: 'curated_ready_domain_profile' | 'full_canonical_contract';
  packagedSkills: 'available' | 'unavailable' | 'host_dependent';
  defaultAnswerMode: 'widget_plus_text' | 'native_visuals_plus_text' | 'text_first';
  widgetPolicy: string;
  advertisedTools: readonly string[];
  advertisedResources: readonly string[];
  renderAdapters: readonly string[];
  canonicalFallbacks: Record<string, string>;
  guidanceResources: readonly string[];
  notes: readonly string[];
}

export function fluentChatGptAppProfile(options?: {
  readyDomains?: readonly FluentChatGptAppDomain[];
}) {
  const readyDomains = new Set(options?.readyDomains ?? ['health', 'meals', 'style']);
  const tools = [
    ...FLUENT_CHATGPT_APP_CORE_TOOLS,
    ...(readyDomains.has('meals') ? FLUENT_CHATGPT_APP_MEALS_TOOLS : []),
    ...(readyDomains.has('style') ? FLUENT_CHATGPT_APP_STYLE_TOOLS : []),
    ...(readyDomains.has('health') ? FLUENT_CHATGPT_APP_HEALTH_TOOLS : []),
  ];
  const resources = [
    ...FLUENT_CHATGPT_APP_CORE_RESOURCES,
    ...(readyDomains.has('meals') ? FLUENT_CHATGPT_APP_MEALS_RESOURCES : []),
    ...(readyDomains.has('style') ? FLUENT_CHATGPT_APP_STYLE_RESOURCES : []),
    ...(readyDomains.has('health') ? FLUENT_CHATGPT_APP_HEALTH_RESOURCES : []),
  ];

  return {
    ...FLUENT_CHATGPT_APP_PROFILE,
    resources,
    tools,
    writeTools: tools.filter((tool) => FLUENT_CHATGPT_APP_WRITE_TOOL_NAMES.includes(tool as never)),
  };
}

export function fluentHostProfiles(options?: {
  readyDomains?: readonly FluentChatGptAppDomain[];
}): FluentHostProfile[] {
  const chatGptProfile = fluentChatGptAppProfile(options);
  const coreGuidance = ['fluent://guidance/routing', 'fluent://guidance/host-capabilities'];
  const fullContractStarterTools = ['fluent_get_capabilities', 'fluent_get_next_actions', 'fluent_get_home'];
  const canonicalDataFallbacks = {
    groceryList: 'meals_get_grocery_plan',
    pantryDashboard: 'meals_get_inventory_summary',
    purchaseAnalysis: 'style_prepare_purchase_analysis plus style_render_purchase_analysis',
    recipeCard: 'meals_get_recipe',
  };

  return [
    {
      id: 'chatgpt_app',
      title: 'ChatGPT / MCP Apps',
      toolExposure: 'curated_ready_domain_profile',
      packagedSkills: 'unavailable',
      defaultAnswerMode: 'widget_plus_text',
      widgetPolicy:
        'Advertise only the ready-domain ChatGPT profile. Use App SDK widget adapters when useful, but return complete text as well.',
      advertisedTools: chatGptProfile.tools,
      advertisedResources: chatGptProfile.resources,
      renderAdapters: [
        'meals_render_recipe_card',
        'meals_render_pantry_dashboard',
        'meals_render_grocery_list_v2',
        'style_show_purchase_analysis_widget',
      ],
      canonicalFallbacks: canonicalDataFallbacks,
      guidanceResources: coreGuidance,
      notes: [
        'Use fluent_get_next_actions and guidance resources as the in-band substitute for packaged Fluent skills.',
        'Do not expose operator, admin, export, deletion, billing, checkout, preview, or debug surfaces in the curated profile.',
      ],
    },
    {
      id: 'claude',
      title: 'Claude',
      toolExposure: 'full_canonical_contract',
      packagedSkills: 'available',
      defaultAnswerMode: 'native_visuals_plus_text',
      widgetPolicy:
        'Prefer canonical Fluent data and Claude-native visual or artifact surfaces. Do not use ChatGPT/App SDK widget adapters by default.',
      advertisedTools: fullContractStarterTools,
      advertisedResources: coreGuidance,
      renderAdapters: [],
      canonicalFallbacks: canonicalDataFallbacks,
      guidanceResources: coreGuidance,
      notes: [
        'MCP tools/list remains the authoritative full tool registry for Claude.',
        'Packaged Fluent skills remain the primary Claude operating layer.',
        'Use runtime guidance when packaged skill state is missing, stale, or unclear.',
      ],
    },
    {
      id: 'openclaw',
      title: 'OpenClaw',
      toolExposure: 'full_canonical_contract',
      packagedSkills: 'available',
      defaultAnswerMode: 'text_first',
      widgetPolicy:
        'Default to canonical data tools and text. Use a visual surface only when an operator explicitly wires one for the host.',
      advertisedTools: fullContractStarterTools,
      advertisedResources: coreGuidance,
      renderAdapters: [],
      canonicalFallbacks: canonicalDataFallbacks,
      guidanceResources: coreGuidance,
      notes: [
        'MCP tools/list remains the authoritative full tool registry for OpenClaw.',
        'OpenClaw packages may provide host-specific orchestration, but the Fluent MCP contract remains canonical.',
        'Retailer execution and browser automation stay outside the public Fluent Core contract.',
      ],
    },
    {
      id: 'codex',
      title: 'Codex',
      toolExposure: 'full_canonical_contract',
      packagedSkills: 'available',
      defaultAnswerMode: 'text_first',
      widgetPolicy:
        'Default to canonical data tools and text. Use render adapters only when validating a compatible Fluent widget surface.',
      advertisedTools: fullContractStarterTools,
      advertisedResources: coreGuidance,
      renderAdapters: [],
      canonicalFallbacks: canonicalDataFallbacks,
      guidanceResources: coreGuidance,
      notes: [
        'MCP tools/list remains the authoritative full tool registry for Codex.',
        'Codex skills are useful for repeated workflows and verification, but MCP capability state remains authoritative.',
        'Prefer narrow verifiers and contract parity checks for Fluent MCP changes.',
      ],
    },
    {
      id: 'generic_mcp',
      title: 'Generic MCP',
      toolExposure: 'full_canonical_contract',
      packagedSkills: 'host_dependent',
      defaultAnswerMode: 'text_first',
      widgetPolicy:
        'Assume only plain MCP tools and resources. Do not assume widget, visual, or packaged-skill support until the host proves it.',
      advertisedTools: fullContractStarterTools,
      advertisedResources: coreGuidance,
      renderAdapters: [],
      canonicalFallbacks: canonicalDataFallbacks,
      guidanceResources: coreGuidance,
      notes: [
        'MCP tools/list remains the authoritative full tool registry for generic MCP clients.',
        'Start from fluent_get_capabilities, fluent_get_next_actions, and the relevant fluent://guidance resources.',
        'Use summary reads before full reads and writes only from explicit user intent.',
      ],
    },
  ];
}

export function fluentHostProfile(
  id: FluentHostProfileId | 'unknown',
  options?: { readyDomains?: readonly FluentChatGptAppDomain[] },
): FluentHostProfile {
  const profiles = fluentHostProfiles(options);
  return profiles.find((profile) => profile.id === id) ?? profiles.find((profile) => profile.id === 'generic_mcp')!;
}

export const FLUENT_CONTRACT_FREEZE = {
  backwardCompatibility:
    'Phase 27 keeps the v2, v3, v4, v5, v6, and v7 Style purchase-analysis widget resources for compatibility and adds the v8 widget resource so ChatGPT/App SDK hosts refetch the corrected inline closeness score renderer without clamping already-percent comparator scores to 100%. Phase 26 kept the v2, v3, v4, v5, and v6 Style purchase-analysis widget resources for compatibility and added the v7 widget resource so ChatGPT/App SDK hosts refetched the combined closet-comparison cards with inline closeness scores instead of rendering a redundant separate closeness section. Phase 25 kept the v2, v3, v4, and v5 Style purchase-analysis widget resources for compatibility and added the v6 widget resource so ChatGPT/App SDK hosts refetched the more human stylist copy for photo reads and verdict reasons instead of reusing cached v5 markup. Phase 24 kept the v2, v3, and v4 Style purchase-analysis widget resources for compatibility and added the v5 widget resource so ChatGPT/App SDK hosts refetched the image-CSP and closet-comparator-photo improvements instead of reusing cached v4 markup. Phase 23 kept the v2 and v3 Style purchase-analysis widget resources for compatibility and added the v4 widget resource so ChatGPT/App SDK hosts refetched the polished stylist-analysis HTML instead of reusing cached v3 markup. Phase 22 makes host profiles first-class MCP metadata so ChatGPT, Claude, OpenClaw, Codex, and generic MCP clients can share one canonical Fluent tool vocabulary while using host-aware routing, render-adapter policy, and packaged-skill expectations. Phase 21 added MCP-native runtime guidance resources and fluent_get_next_actions as the in-band skill substitute for ChatGPT and generic MCP hosts, while preserving the full canonical tool surface for Claude, OpenClaw, Codex, OSS, and operator workflows. Phase 20 kept the Style maturity surfaces for item-profile enrichment, provenance reads, evidence-gap reporting, and wardrobe analysis; removed the legacy meals_render_grocery_list alias and grocery_list_widget capability while preserving meals_render_grocery_list_v2 as the canonical ChatGPT/App SDK grocery-list render surface; added the v3 Style purchase-analysis widget resource while keeping the v2 widget resource for compatibility; added style_prepare_purchase_analysis as the first-hop purchase-analysis routing tool, keeps style_render_purchase_analysis as non-widget structured output, and gates the actual style_show_purchase_analysis_widget surface behind host visual evidence; and kept Health on the block-first coaching surface instead of the pre-production weekly-plan contract.',
  frozenAt: 'workstream-5',
  requiredFields: [
    'contractVersion',
    'backendMode',
    'availableDomains',
    'enabledDomains',
    'readyDomains',
    'onboarding.core',
    'onboarding.domains',
    'profile.displayName',
    'profile.timezone',
  ],
  scopeException:
    'Health tools prefer health:read and health:write. Style tools prefer style:read and style:write, while hosted continues to accept legacy meals scopes for the Style surface during the current bridge window.',
  stableResources: [...FLUENT_RESOURCE_URIS],
  stableTools: [...FLUENT_TOOL_NAMES],
  versionPolicy: {
    minimumClientBehavior: 'Clients and packages declare the minimum supported contract version.',
    packageUpdateRule: 'Breaking contract changes require package updates before release.',
  },
} as const;

export function fluentContractSnapshot() {
  return {
    contractVersion: FLUENT_CONTRACT_VERSION,
    optionalCapabilities: [...FLUENT_OPTIONAL_CAPABILITIES],
    resources: [...FLUENT_RESOURCE_URIS],
    tools: [...FLUENT_TOOL_NAMES],
  };
}

export function fluentRuntimeSurfaceSnapshot() {
  return {
    aliasTools: FLUENT_TOOL_ALIASES.map((entry) => ({
      canonicalTool: entry.canonicalTool,
      name: entry.name,
      note: entry.note,
    })),
    contractVersion: FLUENT_CONTRACT_VERSION,
    devResources: [...FLUENT_DEV_RESOURCE_URIS],
    devTools: [...FLUENT_DEV_TOOL_NAMES],
    publicResources: [...FLUENT_RESOURCE_URIS],
    publicTools: [...FLUENT_TOOL_NAMES],
  };
}
