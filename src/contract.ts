import {
  FLUENT_PUBLIC_CONTRACT_VERSION,
  FLUENT_PUBLIC_OPTIONAL_CAPABILITIES,
  FLUENT_PUBLIC_PROFILE_POLICY,
  FLUENT_PUBLIC_RENDER_ADAPTERS,
  FLUENT_PUBLIC_RESOURCE_URIS,
  FLUENT_PUBLIC_TOOL_NAMES,
  FLUENT_PUBLIC_WRITE_TOOL_NAMES,
  fluentPublicProfile,
} from './public-profile';

export const FLUENT_CONTRACT_VERSION = FLUENT_PUBLIC_CONTRACT_VERSION;
export const FLUENT_MINIMUM_SUPPORTED_CONTRACT_VERSION = FLUENT_CONTRACT_VERSION;
export const FLUENT_TOOL_NAMES = FLUENT_PUBLIC_TOOL_NAMES;
export const FLUENT_RESOURCE_URIS = FLUENT_PUBLIC_RESOURCE_URIS;
export const FLUENT_RENDER_ADAPTER_TOOL_NAMES = FLUENT_PUBLIC_RENDER_ADAPTERS;
export const FLUENT_OPTIONAL_CAPABILITIES = FLUENT_PUBLIC_OPTIONAL_CAPABILITIES;
export const FLUENT_CHATGPT_APP_WRITE_TOOL_NAMES = FLUENT_PUBLIC_WRITE_TOOL_NAMES;
export const FLUENT_CHATGPT_APP_OPEN_WORLD_TOOL_NAMES = [] as const;

// Runtime guidance from retired generations is intentionally not part of the
// launch contract. Packaged host skills provide the current routing guidance.
export const FLUENT_GUIDANCE_RESOURCE_URIS: readonly string[] = [];
export const FLUENT_TOOL_ALIASES = [] as const;
export const FLUENT_DEV_TOOL_NAMES = [] as const;
export const FLUENT_DEV_RESOURCE_URIS = [] as const;

export const FLUENT_CHATGPT_APP_PROFILE = {
  accountLinks: {
    billing: '/account/billing',
    deleteAccount: '/account/delete',
    exportData: '/account/export',
    reactivate: '/account/reactivate',
    signIn: '/sign-in',
  },
  degradedDomainPolicy:
    'Expose account helpers for every connected account; expose Meals and Style behavior only when the matching domain is ready.',
  excludedSurfacePolicy: [
    'Health and Wellbeing until a separately reviewed public contract exists',
    'Home dashboards and retired domain-specific tools',
    'browser, retailer, cart, checkout, and product-page extraction',
    'raw financial data and medical decisions',
    'operator, migration, diagnostic, and arbitrary generic-write tools',
    'widgets other than Grocery List, Budgets Envelope Setup, and Style Closet',
  ],
  id: 'chatgpt-app',
  title: 'Fluent ChatGPT App',
  writeIntentPolicy:
    'Invoke write tools only after explicit user intent to change Fluent state, then rely on the returned read-after-write proof.',
} as const;

export type FluentChatGptAppDomain = 'health' | 'meals' | 'style';
export type FluentHostProfileId = 'chatgpt_app' | 'claude' | 'openclaw' | 'codex' | 'generic_mcp';

export interface FluentHostProfile {
  id: FluentHostProfileId;
  title: string;
  toolExposure: 'curated_product_profile';
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

export function fluentChatGptAppProfile(_options?: { readyDomains?: readonly FluentChatGptAppDomain[] }) {
  return {
    ...FLUENT_CHATGPT_APP_PROFILE,
    generatedFrom: FLUENT_CONTRACT_VERSION,
    omittedConcepts: [] as const,
    ...fluentPublicProfile(),
  };
}

export function fluentAssistantAppProfile() {
  return {
    generatedFrom: FLUENT_CONTRACT_VERSION,
    id: 'assistant_app',
    omittedConcepts: [] as const,
    title: 'Fluent Assistant App',
    ...fluentPublicProfile(),
  };
}

export function fluentHostProfiles(_options?: {
  readyDomains?: readonly FluentChatGptAppDomain[];
}): FluentHostProfile[] {
  const profile = fluentPublicProfile();
  const shared = {
    advertisedResources: profile.resources,
    advertisedTools: profile.tools,
    canonicalFallbacks: {
      budgetEnvelopeSetup: 'Use structured budget-envelope data in text when the host cannot mount MCP Apps.',
      groceryList: 'Use fluent_get_context or fluent_list_items when the host cannot mount MCP Apps.',
      styleCloset: 'Use fluent_list_items, fluent_get_item, and fluent_get_media_bundle when the host cannot mount MCP Apps.',
    },
    guidanceResources: [] as const,
    notes: [
      'Meals and Style are current. Budgets are limited to manual clothing and grocery envelopes. Health and Wellbeing are reserved.',
      'All hosts use the same public contract and explicit-write boundary.',
    ],
    renderAdapters: profile.renderAdapters,
    toolExposure: 'curated_product_profile' as const,
  };

  return [
    {
      ...shared,
      id: 'chatgpt_app',
      title: 'ChatGPT',
      packagedSkills: 'unavailable',
      defaultAnswerMode: 'widget_plus_text',
      widgetPolicy: 'Use the three promoted MCP Apps resources when they materially help; always preserve a text fallback.',
    },
    {
      ...shared,
      id: 'claude',
      title: 'Claude',
      packagedSkills: 'available',
      defaultAnswerMode: 'native_visuals_plus_text',
      widgetPolicy: 'Use promoted MCP Apps resources when supported; otherwise use native presentation plus text.',
    },
    {
      ...shared,
      id: 'openclaw',
      title: 'OpenClaw',
      packagedSkills: 'available',
      defaultAnswerMode: 'text_first',
      widgetPolicy: 'Prefer text and host-native presentation; promoted resources are optional adapters.',
    },
    {
      ...shared,
      id: 'codex',
      title: 'Codex',
      packagedSkills: 'available',
      defaultAnswerMode: 'text_first',
      widgetPolicy: 'Prefer text and host-native presentation; promoted resources are optional adapters.',
    },
    {
      ...shared,
      id: 'generic_mcp',
      title: 'Generic MCP',
      packagedSkills: 'host_dependent',
      defaultAnswerMode: 'text_first',
      widgetPolicy: 'Treat MCP Apps as optional and keep every workflow usable from structured data plus text.',
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
  breakingChange: true,
  frozenAt: '2026-07-09',
  launchBoundary:
    'This pre-launch 2.0 reset intentionally drops every earlier public tool, resource alias, route, and compatibility profile. There are no external active users to migrate.',
  productScope:
    'Meals and Style are current; Budgets is limited to manual meals-groceries and style-clothing envelopes; Health and Wellbeing are reserved.',
  requiredFields: [
    'contractVersion',
    'availableDomains',
    'enabledDomains',
    'readyDomains',
    'profile.displayName',
    'profile.timezone',
  ],
  stableResources: [...FLUENT_RESOURCE_URIS],
  stableTools: [...FLUENT_TOOL_NAMES],
  versionPolicy: {
    minimumClientBehavior: 'Clients and packages must require this 2.0 contract or newer.',
    packageUpdateRule: 'Any future breaking contract change requires a new major contract and matching package release.',
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
    aliasTools: [] as const,
    contractVersion: FLUENT_CONTRACT_VERSION,
    devResources: [] as const,
    devTools: [] as const,
    publicResources: [...FLUENT_RESOURCE_URIS],
    publicTools: [...FLUENT_TOOL_NAMES],
  };
}

export { FLUENT_PUBLIC_PROFILE_POLICY, fluentPublicProfile };
