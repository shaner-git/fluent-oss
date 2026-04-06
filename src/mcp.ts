import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreRuntimeBindings } from './config';
import { FLUENT_CONTRACT_VERSION } from './contract';
import { FluentCoreService } from './fluent-core';
import { registerCoreMcpSurface } from './mcp-core';
import { registerHealthMcpSurface } from './mcp-health';
import { registerMealsMcpSurface } from './mcp-meals';
import { registerStyleMcpSurface } from './mcp-style';
import { HealthService } from './domains/health/service';
import { iconFor } from './mcp-shared';
import { MealsService } from './domains/meals/service';
import { StyleService } from './domains/style/service';

export function createFluentMcpServer(bindings: CoreRuntimeBindings, origin: string): McpServer {
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
    name: 'fluent-mcp',
    version: FLUENT_CONTRACT_VERSION,
  });

  registerCoreMcpSurface(server, fluentCore, meals, origin);
  registerHealthMcpSurface(server, health, origin);
  registerMealsMcpSurface(server, meals, fluentCore, origin);
  registerStyleMcpSurface(server, style, origin);

  return server;
}
