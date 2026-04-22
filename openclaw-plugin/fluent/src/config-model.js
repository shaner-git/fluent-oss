import { FLUENT_SERVER_ID } from './constants.js';

export function normalizeBaseUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/mcp\/?$/i, '').replace(/\/$/, '');
}

export function normalizeMcpUrl(value) {
  const baseUrl = normalizeBaseUrl(value);
  return baseUrl ? `${baseUrl}/mcp` : null;
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export function extractFluentServer(config) {
  if (config?.mcp?.servers && typeof config.mcp.servers === 'object') {
    return config.mcp.servers[FLUENT_SERVER_ID] ?? null;
  }
  return null;
}

export function extractServerBaseUrl(config) {
  const server = extractFluentServer(config);
  if (!server || typeof server.url !== 'string') {
    return null;
  }
  return normalizeBaseUrl(server.url);
}

export function buildFluentServer(input) {
  const url = normalizeMcpUrl(input.baseUrl);
  if (!url) {
    throw new Error('A Fluent base URL is required before MCP config can be written.');
  }

  const headers = {
    ...(isRecord(input.existingHeaders) ? input.existingHeaders : {}),
  };

  if (typeof input.accessToken === 'string' && input.accessToken.trim()) {
    headers.Authorization = `Bearer ${input.accessToken.trim()}`;
  } else if (input.clearAuthorization === true) {
    delete headers.Authorization;
  }

  const server = {
    ...(isRecord(input.existingServer) ? input.existingServer : {}),
    transport: 'streamable-http',
    url,
  };

  if (Object.keys(headers).length > 0) {
    server.headers = headers;
  } else {
    delete server.headers;
  }

  return server;
}

export function applyFluentServerConfig(config, input) {
  const nextConfig = cloneJson(config);
  if (!nextConfig.mcp || typeof nextConfig.mcp !== 'object') {
    nextConfig.mcp = {};
  }
  if (!nextConfig.mcp.servers || typeof nextConfig.mcp.servers !== 'object') {
    nextConfig.mcp.servers = {};
  }

  const existingServer = nextConfig.mcp.servers[FLUENT_SERVER_ID];
  nextConfig.mcp.servers[FLUENT_SERVER_ID] = buildFluentServer({
    accessToken: input.accessToken,
    baseUrl: input.baseUrl,
    clearAuthorization: input.clearAuthorization,
    existingHeaders: existingServer?.headers,
    existingServer,
  });
  return nextConfig;
}

export function removeAuthorizationHeader(config) {
  const nextConfig = cloneJson(config);
  const server = extractFluentServer(nextConfig);
  if (!server) {
    return nextConfig;
  }

  if (isRecord(server.headers)) {
    delete server.headers.Authorization;
    if (Object.keys(server.headers).length === 0) {
      delete server.headers;
    }
  }
  return nextConfig;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
