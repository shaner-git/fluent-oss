import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { markFluentCloudSuccessfulToolCallFromCurrentRequest } from './cloud-onboarding';
import type { CoreRuntimeBindings } from './config';
import { FLUENT_CONTRACT_VERSION, fluentChatGptAppProfile } from './contract';
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
  registerStyleMcpSurface(server, style, origin);

  return server;
}

function applyChatGptAppProfileFilter(server: McpServer): void {
  const profile = fluentChatGptAppProfile();
  const allowedTools = new Set<string>(profile.tools);
  const allowedResources = new Set<string>(profile.resources);
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
    return (originalRegisterTool as any)(name, config, handler);
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
    return (originalRegisterResource as any)(name, uriOrTemplate, config, handler);
  }) as typeof server.registerResource;
}

function resourceTemplateToString(value: unknown): string | null {
  const candidate = value as { _uriTemplate?: { template?: unknown } } | null;
  const template = candidate?._uriTemplate?.template;
  return typeof template === 'string' ? template : null;
}
