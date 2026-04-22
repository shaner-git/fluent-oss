let pluginContext = null;
let runtime = null;

export function setPluginContext(api) {
  pluginContext = {
    config: api.config ?? {},
    id: api.id,
    logger: api.logger ?? console,
    name: api.name,
    pluginConfig: api.pluginConfig ?? {},
    resolvePath: api.resolvePath,
    runtime: api.runtime,
  };

  if (api.runtime) {
    runtime = api.runtime;
  }
}

export function getPluginContext() {
  if (!pluginContext) {
    throw new Error('Fluent OpenClaw plugin context not initialized.');
  }
  return pluginContext;
}

export function getRuntime() {
  if (!runtime) {
    throw new Error('Fluent OpenClaw runtime not initialized.');
  }
  return runtime;
}
