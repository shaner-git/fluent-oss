import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { markFluentCloudSuccessfulToolCallFromCurrentRequest } from './cloud-onboarding';
import type { CoreRuntimeBindings } from './config';
import {
  FLUENT_CHATGPT_APP_OPEN_WORLD_TOOL_NAMES,
  FLUENT_CONTRACT_VERSION,
  FLUENT_TOOL_NAMES,
  fluentAssistantAppProfile,
  fluentChatGptAppProfile,
} from './contract';
import { FluentCoreService } from './fluent-core';
import { registerCoreMcpSurface } from './mcp-core';
import { registerMealsMcpSurface } from './mcp-meals';
import { registerStyleMcpSurface } from './mcp-style';
import { getFluentAuthProps } from './auth';
import { assertCurrentUserToolAllowedForSubscriptionLifecycle } from './subscription-lifecycle';
import { BudgetsService } from './domains/budgets/service';
import { iconFor } from './mcp-shared';
import { MealsService } from './domains/meals/service';
import { StyleService } from './domains/style/service';

export type FluentMcpRuntimeProfile = 'assistant_app' | 'chatgpt_app';

const MCP_TOOL_OUTPUT_SCHEMA = z.object({}).passthrough();
let fluentKnownToolNamesCache: Set<string> | null = null;
const PUBLIC_CAPABILITY_DOMAIN_IDS = new Set(['meals', 'style']);
// Move 4 landed: core_rules Tier-1 dietary dual-write is removed; person_facts is sole source.
// Keep this disabled and the reader null as a read-time safety belt for the legacy server-side planner overlay.
export const ENABLE_MEALS_PERSON_FACTS_PLANNING = false;

export function createFluentMcpServer(
  bindings: CoreRuntimeBindings,
  origin: string,
  options: { profile?: FluentMcpRuntimeProfile } = {},
): McpServer {
  const fluentCore = new FluentCoreService(bindings.db, bindings);
  const meals = new MealsService(
    bindings.db,
    ENABLE_MEALS_PERSON_FACTS_PLANNING ? (input) => fluentCore.listPersonFacts(input) : null,
  );
  const budgets = new BudgetsService(bindings.db);
  const style = new StyleService(bindings.db, {
    artifacts: bindings.artifacts,
    budgets,
    imageDeliverySecret: bindings.imageDeliverySecret ?? null,
    origin,
  });
  const server = new McpServer({
    icons: iconFor(origin),
    name:
      options.profile === 'chatgpt_app'
        ? 'fluent-chatgpt-app'
        : options.profile === 'assistant_app'
          ? 'fluent-assistant-app'
          : 'fluent-mcp',
    version: FLUENT_CONTRACT_VERSION,
  });
  const runtimeProfile = options.profile ?? 'assistant_app';
  applyMcpToolOutputSchemaDefaults(server, runtimeProfile);
  if (options.profile === 'chatgpt_app') {
    applyCuratedMcpProfileFilter(server, fluentChatGptAppProfile());
  } else {
    applyCuratedMcpProfileFilter(server, fluentAssistantAppProfile());
  }
  if (bindings.deploymentTrack === 'cloud') {
    const originalRegisterTool = server.registerTool.bind(server);
    (server as McpServer & { registerTool: typeof server.registerTool }).registerTool = ((
      name: string,
      config: unknown,
      handler: (...args: any[]) => Promise<unknown>,
    ) => {
      const wrappedHandler = (async (...args: any[]) => {
        const authProps = getFluentAuthProps();
        await assertCurrentUserToolAllowedForSubscriptionLifecycle(bindings.db, {
          email: authProps.email ?? null,
          tenantId: authProps.tenantId ?? null,
          toolName: name,
          userId: authProps.userId ?? null,
        });
        const result = await handler(...args);
        const firstArg = args[0];
        await markFluentCloudSuccessfulToolCallFromCurrentRequest(bindings.db, {
          args:
            firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg)
              ? (firstArg as Record<string, unknown>)
              : undefined,
          toolName: name,
        });
        return result;
      }) as any;
      return originalRegisterTool(name as never, config as never, wrappedHandler);
    }) as typeof server.registerTool;
  }

  registerCoreMcpSurface(server, fluentCore, meals, style, budgets, origin, {
    publicWriteRateLimiter: bindings.publicWriteRateLimiter,
  });
  registerMealsMcpSurface(server, meals, fluentCore, origin, { budgets });
  registerStyleMcpSurface(server, style, origin, {
    imageDeliverySecret: bindings.imageDeliverySecret ?? null,
  });

  return server;
}

function applyMcpToolOutputSchemaDefaults(server: McpServer, profile: FluentMcpRuntimeProfile): void {
  const originalRegisterTool = server.registerTool.bind(server);

  (server as McpServer & { registerTool: typeof server.registerTool }).registerTool = ((
    name: string,
    config: unknown,
    handler: (...args: any[]) => Promise<unknown>,
  ) => {
    const normalizedConfig = normalizeMcpToolOutputSchemaConfig(name, config, profile);
    const normalizedHandler = (async (...args: any[]) => normalizeMcpToolResult(await handler(...args))) as any;
    return (originalRegisterTool as any)(name, normalizedConfig, normalizedHandler);
  }) as typeof server.registerTool;
}

const FLUENT_WRITE_TOOL_NAMES = new Set([
  'fluent_update_profile',
  'fluent_update_shared_profile_patch',
  'fluent_set_budget_envelope',
  'fluent_log_budget_spend',
  'fluent_update_style_item_patch',
  'fluent_create_style_item',
  'fluent_refresh_style_item_profile',
  'fluent_set_style_item_image',
  'fluent_save_recipe',
  'fluent_update_recipe_patch',
  'fluent_record_recipe_feedback',
  'fluent_apply_grocery_list_change',
  'fluent_upsert_item',
  'fluent_archive_item',
  'fluent_record_event',
  'fluent_enable_domain',
  'fluent_disable_domain',
  'fluent_begin_domain_onboarding',
  'fluent_complete_domain_onboarding',
  'health_update_preferences',
  'health_upsert_block',
  'health_record_block_review',
  'health_upsert_goal',
  'health_log_workout',
  'health_log_body_metric',
  'meals_create_recipe',
  'meals_record_calibration_response',
  'meals_update_preferences',
  'meals_upsert_plan',
  'meals_generate_plan',
  'meals_accept_plan_candidate',
  'meals_patch_recipe',
  'meals_log_feedback',
  'meals_mark_meal_cooked',
  'meals_update_inventory',
  'meals_delete_inventory_item',
  'meals_update_inventory_batch',
  'meals_record_plan_review',
  'meals_generate_grocery_plan',
  'meals_upsert_grocery_plan_action',
  'meals_delete_grocery_plan_action',
  'meals_upsert_grocery_intent',
  'meals_delete_grocery_intent',
  'meals_apply_pantry_dashboard_action',
  'style_update_profile',
  'style_record_calibration_response',
  'style_add_starter_closet_item',
  'style_upsert_item',
  'style_archive_item',
  'style_upsert_item_profile',
  'style_upsert_item_photos',
  'style_set_item_product_image',
  'style_submit_purchase_visual_observations',
  'style_apply_purchase_analysis_action',
]);

function normalizeMcpToolOutputSchemaConfig(name: string, config: unknown, profile: FluentMcpRuntimeProfile): unknown {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return config;
  }
  const original = config as Record<string, unknown>;
  const annotations =
    original.annotations && typeof original.annotations === 'object' && !Array.isArray(original.annotations)
      ? (original.annotations as Record<string, unknown>)
      : {};
  const isWrite = FLUENT_WRITE_TOOL_NAMES.has(name);
  const readOnlyHint = typeof annotations.readOnlyHint === 'boolean' ? annotations.readOnlyHint : !isWrite;
  const idempotentHint = typeof annotations.idempotentHint === 'boolean' ? annotations.idempotentHint : !isWrite;
  const destructiveHint = typeof annotations.destructiveHint === 'boolean' ? annotations.destructiveHint : false;
  const openWorldHint = typeof annotations.openWorldHint === 'boolean' ? annotations.openWorldHint : false;

  return {
    ...original,
    annotations: {
      ...annotations,
      destructiveHint,
      idempotentHint,
      openWorldHint,
      readOnlyHint,
    },
    outputSchema: original.outputSchema ?? MCP_TOOL_OUTPUT_SCHEMA,
  };
}

function normalizeMcpToolResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (!('content' in record)) {
    return value;
  }

  const structuredContent = record.structuredContent;
  if (structuredContent && typeof structuredContent === 'object' && !Array.isArray(structuredContent)) {
    return value;
  }

  return {
    ...record,
    structuredContent: structuredContent == null ? {} : { value: structuredContent },
  };
}

function applyCuratedMcpProfileFilter(
  server: McpServer,
  profile: { resources: readonly string[]; tools: readonly string[]; writeTools: readonly string[] },
): void {
  const allowedTools = new Set<string>(profile.tools);
  const allowedResources = new Set<string>(profile.resources);
  const writeTools = new Set<string>(profile.writeTools);
  const openWorldTools = new Set<string>(FLUENT_CHATGPT_APP_OPEN_WORLD_TOOL_NAMES);
  const originalRegisterTool = server.registerTool.bind(server);
  const originalRegisterResource = server.registerResource.bind(server);

  (server as McpServer & { registerTool: typeof server.registerTool }).registerTool = ((
    name: string,
    config: unknown,
    handler: (...args: any[]) => Promise<unknown>,
  ) => {
    if (!allowedTools.has(name)) {
      return undefined;
    }
    const chatGptConfig = normalizeChatGptAppToolConfig(name, config, { openWorldTools, writeTools });
    const chatGptHandler = (async (...args: any[]) => sanitizeCuratedMcpResult(name, await handler(...args), profile)) as any;
    return (originalRegisterTool as any)(name, chatGptConfig, chatGptHandler);
  }) as typeof server.registerTool;

  (server as McpServer & { registerResource: typeof server.registerResource }).registerResource = ((
    name: string,
    uriOrTemplate: unknown,
    config: unknown,
    handler: (...args: any[]) => Promise<unknown>,
  ) => {
    const uri = typeof uriOrTemplate === 'string' ? uriOrTemplate : resourceTemplateToString(uriOrTemplate);
    if (!uri || !allowedResources.has(uri)) {
      return undefined;
    }
    const chatGptHandler = (async (...args: any[]) => sanitizeCuratedMcpResult(uri, await handler(...args), profile)) as any;
    return (originalRegisterResource as any)(name, uriOrTemplate, config, chatGptHandler);
  }) as typeof server.registerResource;
}

function normalizeChatGptAppToolConfig(
  name: string,
  config: unknown,
  options: {
    openWorldTools: Set<string>;
    writeTools: Set<string>;
  },
): unknown {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return config;
  }
  const original = config as Record<string, unknown>;
  const originalAnnotations =
    original.annotations && typeof original.annotations === 'object' && !Array.isArray(original.annotations)
      ? (original.annotations as Record<string, unknown>)
      : {};
  const isWrite = options.writeTools.has(name);

  return {
    ...original,
    annotations: {
      ...originalAnnotations,
      destructiveHint: false,
      idempotentHint: !isWrite,
      openWorldHint: options.openWorldTools.has(name),
      readOnlyHint: !isWrite,
    },
  };
}

function resourceTemplateToString(value: unknown): string | null {
  const candidate = value as { _uriTemplate?: { template?: unknown } } | null;
  const template = candidate?._uriTemplate?.template;
  return typeof template === 'string' ? template : null;
}

const CHATGPT_APP_FORBIDDEN_KEYS = new Set([
  'analysisId',
  'internalEventId',
  'logId',
  'profileId',
  'profile_id',
  'spanId',
  'stripeCheckoutSessionId',
  'stripeCustomerId',
  'stripePriceId',
  'stripeProductId',
  'stripeSubscriptionId',
  'tenantId',
  'tenant_id',
  'traceId',
]);

export function sanitizeChatGptAppResult(surface: string, value: unknown): unknown {
  return sanitizeCuratedMcpResult(surface, value, fluentChatGptAppProfile());
}

export function sanitizeCuratedMcpResult(
  surface: string,
  value: unknown,
  profile: {
    resources?: readonly string[];
    tools: readonly string[];
    writeTools?: readonly string[];
  },
): unknown {
  const projectedValue =
    surface === 'fluent_get_capabilities'
      ? projectCuratedCapabilitiesResult(value, profile)
      : value;
  return sanitizeChatGptAppValue(projectedValue, {
    allowedToolNames: new Set<string>(profile.tools),
    omitRootProfileId: surface === 'fluent_get_profile' || surface === 'fluent://core/profile',
    path: [],
  });
}

function sanitizeChatGptAppValue(
  value: unknown,
  options: {
    allowedToolNames?: Set<string>;
    omitRootProfileId: boolean;
    path: string[];
  },
): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeChatGptAppValue(entry, { ...options, path: [...options.path, '[]'] }))
      .filter((entry) => entry !== undefined);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (shouldOmitChatGptAppKey(key, entry, options)) {
        continue;
      }
      if (
        options.allowedToolNames
        && isToolNameListKey(key)
        && Array.isArray(entry)
        && entry.every((toolName) => typeof toolName === 'string')
      ) {
        result[key] = entry
          .filter((toolName) => typeof toolName === 'string' && options.allowedToolNames?.has(toolName));
        continue;
      }
      const sanitizedEntry = sanitizeChatGptAppValue(entry, { ...options, path: [...options.path, key] });
      if (sanitizedEntry !== undefined) {
        result[key] = sanitizedEntry;
      }
    }
    return result;
  }
  if (typeof value === 'string') {
    const parsed = parseJsonString(value);
    if (parsed != null) {
      return JSON.stringify(sanitizeChatGptAppValue(parsed, options));
    }
    if (options.allowedToolNames) {
      return sanitizeCuratedToolReferenceString(value, options.allowedToolNames, options.path.at(-1));
    }
  }
  return value;
}

function shouldOmitChatGptAppKey(
  key: string,
  value: unknown,
  options: {
    allowedToolNames?: Set<string>;
    omitRootProfileId: boolean;
    path: string[];
  },
) {
  if (CHATGPT_APP_FORBIDDEN_KEYS.has(key)) {
    return true;
  }
  if (/^stripe[A-Za-z]*Id$/.test(key) || /^(trace|span|log|internalEvent)Id$/.test(key)) {
    return true;
  }
  if (key === 'id' && typeof value === 'string' && /^purchase-analysis:/.test(value)) {
    return true;
  }
  return options.omitRootProfileId && key === 'id' && isRootProfileObjectPath(options.path);
}

function isToolNameListKey(key: string): boolean {
  return key === 'toolNames'
    || key === 'starterReadTools'
    || key === 'detailReadTools'
    || key === 'starterWriteTools'
    || key === 'tools'
    || key === 'writeTools';
}

function isRootProfileObjectPath(pathParts: string[]) {
  if (pathParts.length === 0) {
    return true;
  }
  return pathParts.length === 1 && (pathParts[0] === 'structuredContent' || pathParts[0] === 'value');
}

function parseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function projectCuratedCapabilitiesResult(
  value: unknown,
  profile: {
    resources?: readonly string[];
    tools: readonly string[];
    writeTools?: readonly string[];
  },
): unknown {
  const result = objectRecord(value);
  if (!result || !objectRecord(result.structuredContent)) {
    return projectCuratedCapabilitiesPayload(value, profile);
  }

  const capabilities = projectCuratedCapabilitiesPayload(result.structuredContent, profile);
  const enabledDomains = stringArrayField(capabilities, 'enabledDomains');
  const readyDomains = stringArrayField(capabilities, 'readyDomains');
  const contractVersion = stringField(capabilities, 'contractVersion') ?? 'unknown';
  return {
    ...result,
    content: [
      {
        type: 'text',
        text: [
          `Fluent public capabilities (${contractVersion}).`,
          `Enabled domains: ${enabledDomains.length ? enabledDomains.join(', ') : 'none'}.`,
          `Ready domains: ${readyDomains.length ? readyDomains.join(', ') : 'none'}.`,
          'Use MCP tools/list as the authoritative tool directory and start domain work with fluent_get_context.',
        ].join('\n'),
      },
    ],
    structuredContent: capabilities,
  };
}

function projectCuratedCapabilitiesPayload(
  value: unknown,
  profile: {
    resources?: readonly string[];
    tools: readonly string[];
    writeTools?: readonly string[];
  },
): Record<string, unknown> {
  const capabilities = objectRecord(value) ?? {};
  const availableDomains = Array.isArray(capabilities.availableDomains)
    ? capabilities.availableDomains
        .map((domain) => objectRecord(domain) ?? {})
        .filter((domain) => PUBLIC_CAPABILITY_DOMAIN_IDS.has(stringField(domain, 'domainId') ?? ''))
        .map((domain) => pickDefined(domain, ['domainId', 'displayName', 'lifecycleState', 'onboardingState', 'onboardingVersion']))
    : [];
  const onboarding = objectRecord(capabilities.onboarding);
  const onboardingCore = objectRecord(onboarding?.core);
  const onboardingDomains = Array.isArray(onboarding?.domains)
    ? onboarding.domains
        .map((domain) => objectRecord(domain) ?? {})
        .filter((domain) => PUBLIC_CAPABILITY_DOMAIN_IDS.has(stringField(domain, 'domainId') ?? ''))
        .map((domain) => pickDefined(domain, ['domainId', 'state', 'version']))
    : [];
  const publicTools = [...profile.tools];
  const publicWriteTools = (profile.writeTools ?? []).filter((toolName) => publicTools.includes(toolName));
  const publicEnabledDomains = stringArrayField(capabilities, 'enabledDomains')
    .filter((domainId) => PUBLIC_CAPABILITY_DOMAIN_IDS.has(domainId));
  const publicReadyDomains = stringArrayField(capabilities, 'readyDomains')
    .filter((domainId) => PUBLIC_CAPABILITY_DOMAIN_IDS.has(domainId));

  return {
    object: 'FluentCapabilities',
    ...pickDefined(capabilities, ['backendMode', 'contractVersion', 'deploymentTrack', 'storageBackend']),
    availableDomains,
    enabledDomains: publicEnabledDomains,
    readyDomains: publicReadyDomains,
    reservedDomains: ['health', 'wellbeing'],
    onboarding: {
      core: onboardingCore ? pickDefined(onboardingCore, ['state', 'version']) : null,
      domains: onboardingDomains,
    },
    profile: pickDefined(objectRecord(capabilities.profile) ?? {}, ['displayName', 'timezone']),
    publicProfile: {
      canonicalRegistry: 'mcp_tools_list',
      tools: publicTools,
      writeTools: publicWriteTools,
    },
    routing: {
      accountStatusTool: publicTools.includes('fluent_get_account_status') ? 'fluent_get_account_status' : null,
      startDomainWorkWith: publicTools.includes('fluent_get_context') ? 'fluent_get_context' : null,
      note: 'MCP tools/list is authoritative for the connected public Fluent profile.',
    },
  };
}

function sanitizeCuratedToolReferenceString(
  value: string,
  allowedToolNames: Set<string>,
  key: string | undefined,
): string | undefined {
  const references = fluentToolReferences(value, key);
  const disallowedReferences = references.filter((toolName) => !allowedToolNames.has(toolName));
  const trimmed = value.trim();

  if (
    key
    && isToolReferenceFieldKey(key)
    && looksLikeToolIdentifier(trimmed)
    && !allowedToolNames.has(trimmed)
  ) {
    return undefined;
  }
  if (disallowedReferences.length === 0) {
    return value;
  }
  if (isOnlyToolReference(trimmed, disallowedReferences)) {
    return undefined;
  }
  const disallowed = new Set(disallowedReferences);
  return value.replace(/\b(?:fluent|meals|style|health)_[a-z][a-z0-9_]*\b/g, (toolName) =>
    disallowed.has(toolName) ? '[non-public tool omitted]' : toolName,
  );
}

function fluentToolReferences(value: string, key: string | undefined): string[] {
  const knownToolNames = fluentKnownToolNamesCache ??= new Set<string>(FLUENT_TOOL_NAMES);
  const explicitToolProse = /\b(?:call|invoke|route|run|tool|use)\b/i.test(value);
  return [...value.matchAll(/\b(?:fluent|meals|style|health)_[a-z0-9]+_[a-z0-9_]+\b/g)]
    .map((match) => match[0])
    .filter((toolName) => knownToolNames.has(toolName) || Boolean(key && isToolReferenceFieldKey(key)) || explicitToolProse);
}

function isOnlyToolReference(value: string, disallowedReferences: string[]): boolean {
  return disallowedReferences.some((toolName) => {
    const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}(?:\\([^)]*\\))?$`).test(value);
  });
}

function isToolReferenceFieldKey(key: string): boolean {
  return /tool/i.test(key) || key === 'primaryAction' || key === 'recommendedAction';
}

function looksLikeToolIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(value);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(value: unknown, key: string): string | null {
  const record = objectRecord(value);
  const candidate = record?.[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

function stringArrayField(value: unknown, key: string): string[] {
  const record = objectRecord(value);
  const candidate = record?.[key];
  return Array.isArray(candidate) ? candidate.filter((entry): entry is string => typeof entry === 'string') : [];
}

function pickDefined(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) {
      result[key] = record[key];
    }
  }
  return result;
}
