import { setPluginContext } from './src/plugin-context.js';

const configSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: 'string',
      description: 'Default Fluent base URL override for plugin-managed auth and MCP setup.',
    },
    defaultProfile: {
      type: 'string',
      description: 'Default Fluent auth profile name to use for CLI flows.',
    },
    defaultTrack: {
      type: 'string',
      enum: ['cloud', 'oss'],
      description: 'Default Fluent deployment track for plugin CLI flows.',
    },
    warnBeforeExpiryMinutes: {
      type: 'integer',
      minimum: 1,
      description: 'Warn before token expiry when Fluent auth has less than this many minutes remaining.',
    },
  },
};

export default {
  id: 'fluent',
  name: 'Fluent',
  description: 'Fluent skills plus plugin-managed auth and MCP setup for OpenClaw.',
  configSchema,
  register(api) {
    api.registerCli(
      async ({ program }) => {
        const { registerFluentCli } = await import('./src/cli.js');
        registerFluentCli({ program });
      },
      {
        descriptors: [
          {
            name: 'fluent',
            description: 'Manage Fluent auth, MCP setup, and diagnostics',
            hasSubcommands: true,
          },
        ],
      },
    );

    if (api.registrationMode === 'cli-metadata') {
      return;
    }

    setPluginContext(api);
  },
};
