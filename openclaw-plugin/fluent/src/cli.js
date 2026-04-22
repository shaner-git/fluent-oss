import {
  doctorFluentPlugin,
  getHostedAuthStatus,
  loginHostedAuth,
  logoutHostedAuth,
  refreshHostedAuth,
  setupMcpServer,
} from './plugin-actions.js';

export function registerFluentCli({ program }) {
  const fluent = program.command('fluent').description('Manage Fluent auth and MCP configuration');
  const auth = fluent.command('auth').description('Manage hosted Fluent auth for OpenClaw');

  auth
    .command('login')
    .description('Run hosted Fluent OAuth and bind the resulting token into mcp.servers.fluent')
    .option('--base-url <url>', 'Fluent hosted base URL override')
    .option('--profile <name>', 'Fluent auth profile name')
    .option('--scope <scope>', 'OAuth scope override')
    .option('--json', 'Emit JSON output')
    .action(async (options) => {
      await runAction(loginHostedAuth(options), options);
    });

  auth
    .command('refresh')
    .description('Refresh a stored hosted Fluent token and rewrite mcp.servers.fluent')
    .option('--base-url <url>', 'Fluent hosted base URL override')
    .option('--profile <name>', 'Fluent auth profile name')
    .option('--json', 'Emit JSON output')
    .action(async (options) => {
      await runAction(refreshHostedAuth(options), options);
    });

  auth
    .command('status')
    .description('Show stored hosted Fluent auth state and current MCP binding')
    .option('--base-url <url>', 'Fluent hosted base URL override')
    .option('--profile <name>', 'Fluent auth profile name')
    .option('--track <track>', 'Track to inspect (cloud or oss)')
    .option('--json', 'Emit JSON output')
    .action(async (options) => {
      await runAction(getHostedAuthStatus(options), options);
    });

  auth
    .command('logout')
    .description('Remove stored hosted Fluent auth state and clear the MCP Authorization header')
    .option('--base-url <url>', 'Fluent hosted base URL override')
    .option('--profile <name>', 'Fluent auth profile name')
    .option('--keep-mcp', 'Preserve the current mcp.servers.fluent Authorization header')
    .option('--json', 'Emit JSON output')
    .action(async (options) => {
      await runAction(logoutHostedAuth({ ...options, clearMcp: options.keepMcp !== true }), options);
    });

  fluent
    .command('mcp')
    .description('Configure mcp.servers.fluent for hosted or OSS Fluent')
    .option('--track <track>', 'Target track (cloud or oss)')
    .option('--base-url <url>', 'Fluent base URL override')
    .option('--profile <name>', 'Fluent auth profile name')
    .option('--token <token>', 'OSS bearer token override')
    .option('--json', 'Emit JSON output')
    .action(async (options) => {
      await runAction(setupMcpServer(options), options);
    });

  fluent
    .command('doctor')
    .description('Check Fluent token freshness and MCP binding health')
    .option('--track <track>', 'Target track (cloud or oss)')
    .option('--base-url <url>', 'Fluent base URL override')
    .option('--profile <name>', 'Fluent auth profile name')
    .option('--token <token>', 'OSS bearer token override')
    .option('--json', 'Emit JSON output')
    .action(async (options) => {
      await runAction(doctorFluentPlugin(options), options);
    });
}

async function runAction(promise, options) {
  const result = await promise;
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderResult(result)}\n`);
}

function renderResult(result) {
  if (result.action === 'doctor') {
    if (result.ok) {
      return `Fluent doctor: ok (${result.track}, profile ${result.profile})`;
    }
    return ['Fluent doctor found issues:', ...result.issues.map((issue) => `- ${issue}`)].join('\n');
  }

  if (result.action === 'mcp-setup') {
    return `Configured mcp.servers.fluent for ${result.track} (${result.mcpUrl ?? 'no URL'}).`;
  }

  if (result.action === 'logout') {
    return `Removed hosted Fluent auth for profile ${result.profile}.`;
  }

  const lines = [
    `Fluent ${result.action} complete for profile ${result.profile}.`,
    `Track: ${result.track}`,
  ];
  if (result.baseUrl) {
    lines.push(`Base URL: ${result.baseUrl}`);
  }
  if (result.expiresAt) {
    lines.push(`Expires: ${result.expiresAt}${result.expiresSoon ? ' (soon)' : ''}`);
  }
  if (result.mcpUrl) {
    lines.push(`MCP: ${result.mcpUrl}`);
  }
  return lines.join('\n');
}
