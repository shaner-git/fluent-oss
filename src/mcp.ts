import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { markFluentCloudSuccessfulToolCallFromCurrentRequest } from './cloud-onboarding';
import type { CoreRuntimeBindings } from './config';
import {
  FLUENT_CHATGPT_APP_OPEN_WORLD_TOOL_NAMES,
  FLUENT_CONTRACT_VERSION,
  fluentChatGptAppProfile,
} from './contract';
import { FluentCoreService } from './fluent-core';
import { registerCoreMcpSurface } from './mcp-core';
import { registerHealthMcpSurface } from './mcp-health';
import { registerMealsMcpSurface } from './mcp-meals';
import { registerStyleMcpSurface } from './mcp-style';
import { getFluentAuthProps } from './auth';
import { assertCurrentUserToolAllowedForSubscriptionLifecycle } from './subscription-lifecycle';
import { HealthService } from './domains/health/service';
import { iconFor } from './mcp-shared';
import { MealsService } from './domains/meals/service';
import { StyleService } from './domains/style/service';

export type FluentMcpRuntimeProfile = 'chatgpt_app' | 'full';

const MCP_TOOL_OUTPUT_SCHEMA = z.object({}).passthrough();

export function createFluentMcpServer(
  bindings: CoreRuntimeBindings,
  origin: string,
  options: { profile?: FluentMcpRuntimeProfile } = {},
): McpServer {
  const fluentCore = new FluentCoreService(bindings.db, bindings);
  const health = new HealthService(bindings.db);
  const meals = new MealsService(bindings.db);
  const style = new StyleService(bindings.db, {
    artifacts: bindings.artifacts,
    imageDeliverySecret: bindings.imageDeliverySecret ?? null,
    origin,
  });
  const server = new McpServer({
    icons: iconFor(origin),
    name: options.profile === 'chatgpt_app' ? 'fluent-chatgpt-app' : 'fluent-mcp',
    version: FLUENT_CONTRACT_VERSION,
  });
  applyMcpToolOutputSchemaDefaults(server, options.profile ?? 'full');
  if (options.profile === 'chatgpt_app') {
    applyChatGptAppProfileFilter(server);
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

  registerCoreMcpSurface(server, fluentCore, meals, health, style, origin);
  registerHealthMcpSurface(server, health, origin);
  registerMealsMcpSurface(server, meals, fluentCore, origin);
  registerStyleMcpSurface(server, style, origin, {
    allowPurchasePageExtraction: options.profile !== 'chatgpt_app',
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

const FLUENT_FULL_MCP_WRITE_TOOL_NAMES = new Set([
  'fluent_update_profile',
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
  const isWrite = FLUENT_FULL_MCP_WRITE_TOOL_NAMES.has(name);
  const readOnlyHint = typeof annotations.readOnlyHint === 'boolean' ? annotations.readOnlyHint : !isWrite;
  const idempotentHint = typeof annotations.idempotentHint === 'boolean' ? annotations.idempotentHint : !isWrite;
  const destructiveHint =
    profile === 'full' && isDestructiveFullMcpToolName(name)
      ? true
      : typeof annotations.destructiveHint === 'boolean'
        ? annotations.destructiveHint
        : false;
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

function isDestructiveFullMcpToolName(name: string): boolean {
  return name.includes('_delete_') || name.includes('_archive_') || name === 'style_set_item_product_image';
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

function applyChatGptAppProfileFilter(server: McpServer): void {
  const profile = fluentChatGptAppProfile();
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
    const chatGptHandler = (async (...args: any[]) => sanitizeChatGptAppResult(name, await handler(...args))) as any;
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
    const chatGptHandler = (async (...args: any[]) => sanitizeChatGptAppResult(uri, await handler(...args))) as any;
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
  const allowedToolNames =
    surface === 'meals_list_tools' || surface === 'fluent_get_capabilities'
      ? new Set<string>(fluentChatGptAppProfile().tools)
      : undefined;
  return sanitizeChatGptAppValue(value, {
    allowedToolNames,
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
    return value.map((entry) => sanitizeChatGptAppValue(entry, { ...options, path: [...options.path, '[]'] }));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (shouldOmitChatGptAppKey(key, entry, options)) {
        continue;
      }
      if (options.allowedToolNames && isToolNameListKey(key) && Array.isArray(entry)) {
        result[key] = entry.filter((toolName) => typeof toolName === 'string' && options.allowedToolNames?.has(toolName));
        continue;
      }
      result[key] = sanitizeChatGptAppValue(entry, { ...options, path: [...options.path, key] });
    }
    return result;
  }
  if (typeof value === 'string') {
    const parsed = parseJsonString(value);
    if (parsed != null) {
      return JSON.stringify(sanitizeChatGptAppValue(parsed, options));
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
  return key === 'toolNames' || key === 'starterReadTools' || key === 'starterWriteTools';
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
