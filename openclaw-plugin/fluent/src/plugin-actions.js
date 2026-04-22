import { access, readFile } from 'node:fs/promises';
import {
  CALLBACK_PORT,
  DEFAULT_PROFILE_NAME,
  DEFAULT_WARN_BEFORE_EXPIRY_MINUTES,
  FLUENT_LOCAL_TOKEN_ENV,
  FLUENT_OSS_TOKEN_ENV,
  FLUENT_REQUIRED_HOSTED_SCOPE,
  PACKAGED_TEMPLATE_FILES,
} from './constants.js';
import {
  applyFluentServerConfig,
  cloneJson,
  extractFluentServer,
  extractServerBaseUrl,
  normalizeBaseUrl,
} from './config-model.js';
import { buildAuthStateFilePath, readTokenState, removeTokenState, writeTokenState } from './fs-state.js';
import { bootstrapHostedToken, refreshHostedToken, tokenExpiresSoon } from './hosted-auth.js';
import { getPluginContext, getRuntime } from './plugin-context.js';

export async function loginHostedAuth(options = {}) {
  const settings = await resolvePluginSettings({
    baseUrl: options.baseUrl,
    profile: options.profile,
    track: 'cloud',
  });
  const scope = String(options.scope ?? FLUENT_REQUIRED_HOSTED_SCOPE).trim();
  const state = await bootstrapHostedToken({
    baseUrl: settings.baseUrl,
    callbackPort: CALLBACK_PORT,
    scope,
  });
  await writeTokenState(settings.stateFile, state);
  await bindFluentServer({
    accessToken: state.accessToken,
    baseUrl: state.baseUrl,
  });
  return buildAuthStatusResult({
    action: 'login',
    profile: settings.profile,
    state,
    track: 'cloud',
  });
}

export async function refreshHostedAuth(options = {}) {
  const settings = await resolvePluginSettings({
    baseUrl: options.baseUrl,
    profile: options.profile,
    track: 'cloud',
  });
  const state = await refreshStoredHostedAuth(settings);
  return buildAuthStatusResult({
    action: 'refresh',
    profile: settings.profile,
    state,
    track: 'cloud',
  });
}

export async function getHostedAuthStatus(options = {}) {
  const settings = await resolvePluginSettings({
    baseUrl: options.baseUrl,
    profile: options.profile,
    track: options.track ?? 'cloud',
  });
  const state = await readTokenState(settings.stateFile);
  const config = await loadConfigSnapshot();
  const server = extractFluentServer(config);
  return buildAuthStatusResult({
    action: 'status',
    baseUrl: settings.baseUrl,
    profile: settings.profile,
    server,
    state,
    track: settings.track,
    warnBeforeExpiryMinutes: settings.warnBeforeExpiryMinutes,
  });
}

export async function logoutHostedAuth(options = {}) {
  const settings = await resolvePluginSettings({
    baseUrl: options.baseUrl,
    profile: options.profile,
    track: 'cloud',
  });
  await removeTokenState(settings.stateFile);
  if (options.clearMcp !== false) {
    await clearFluentAuthorization();
  }
  return {
    action: 'logout',
    clearMcp: options.clearMcp !== false,
    ok: true,
    profile: settings.profile,
  };
}

export async function setupMcpServer(options = {}) {
  const settings = await resolvePluginSettings({
    baseUrl: options.baseUrl,
    profile: options.profile,
    track: options.track,
  });

  let accessToken = null;
  if (settings.track === 'cloud') {
    let current = await readTokenState(settings.stateFile);
    if (!current) {
      throw new Error('No Fluent hosted auth state was found. Run `openclaw fluent auth login` first.');
    }
    if (tokenExpiresSoon(current, settings.warnBeforeExpiryMinutes)) {
      current = await refreshStoredHostedAuth(settings);
    }
    accessToken = current?.accessToken ?? null;
  } else {
    accessToken = resolveOssToken(options);
  }

  const writtenConfig = await bindFluentServer({
    accessToken,
    baseUrl: settings.baseUrl,
  });
  return {
    action: 'mcp-setup',
    mcpUrl: writtenConfig.mcp?.servers?.fluent?.url ?? null,
    ok: true,
    profile: settings.profile,
    track: settings.track,
  };
}

export async function doctorFluentPlugin(options = {}) {
  const settings = await resolvePluginSettings({
    baseUrl: options.baseUrl,
    profile: options.profile,
    track: options.track,
  });
  const issues = [];
  const config = await loadConfigSnapshot();
  const server = extractFluentServer(config);
  const state = settings.track === 'cloud' ? await readTokenState(settings.stateFile) : null;

  if (!server?.url) {
    issues.push('mcp.servers.fluent is missing.');
  }

  if (settings.track === 'cloud') {
    if (!state) {
      issues.push('Hosted Fluent auth has not been initialized.');
    } else if (tokenExpiresSoon(state, settings.warnBeforeExpiryMinutes)) {
      issues.push('Hosted Fluent access token is expired or nearing expiry.');
    }
  } else if (!resolveOssToken({ ...options, optional: true })) {
    issues.push('OSS Fluent token is missing. Pass --token or set FLUENT_OSS_TOKEN.');
  }

  return {
    action: 'doctor',
    issues,
    ok: issues.length === 0,
    profile: settings.profile,
    track: settings.track,
  };
}

async function bindFluentServer(input) {
  const config = await loadConfigSnapshot();
  const nextConfig = applyFluentServerConfig(config, {
    accessToken: input.accessToken,
    baseUrl: input.baseUrl,
  });
  await writeConfigSnapshot(nextConfig);
  return nextConfig;
}

async function refreshStoredHostedAuth(settings) {
  const current = await readTokenState(settings.stateFile);
  if (!current) {
    throw new Error('No Fluent hosted auth state was found. Run `openclaw fluent auth login` first.');
  }

  let state;
  try {
    state = await refreshHostedToken({ state: current });
  } catch (error) {
    throw new Error(buildHostedRefreshErrorMessage(error));
  }

  await writeTokenState(settings.stateFile, state);
  await bindFluentServer({
    accessToken: state.accessToken,
    baseUrl: state.baseUrl,
  });
  return state;
}

async function clearFluentAuthorization() {
  const config = await loadConfigSnapshot();
  const currentBaseUrl = extractServerBaseUrl(config);
  if (!currentBaseUrl) {
    return;
  }
  const nextConfig = applyFluentServerConfig(config, {
    baseUrl: currentBaseUrl,
    clearAuthorization: true,
  });
  await writeConfigSnapshot(nextConfig);
}

async function resolvePluginSettings(input = {}) {
  const context = getPluginContext();
  const runtime = getRuntime();
  const config = await loadConfigSnapshot();
  const pluginConfig = isRecord(context.pluginConfig) ? context.pluginConfig : {};
  const profile = normalizeProfile(input.profile ?? pluginConfig.defaultProfile ?? DEFAULT_PROFILE_NAME);
  const track = normalizeTrack(input.track ?? pluginConfig.defaultTrack ?? 'cloud');
  const baseUrl =
    normalizeBaseUrl(input.baseUrl) ??
    normalizeBaseUrl(pluginConfig.baseUrl) ??
    (await resolvePackagedBaseUrl(track)) ??
    extractServerBaseUrl(config);

  if (!baseUrl) {
    throw new Error(
      `No Fluent ${track} base URL is configured. Pass --base-url explicitly or add plugins.entries.fluent.config.baseUrl.`,
    );
  }

  return {
    baseUrl,
    profile,
    stateFile: buildAuthStateFilePath(runtime.state.resolveStateDir(), profile),
    track,
    warnBeforeExpiryMinutes: resolveWarnBeforeExpiryMinutes(pluginConfig.warnBeforeExpiryMinutes),
  };
}

async function loadConfigSnapshot() {
  const runtime = getRuntime();
  const config = await Promise.resolve(runtime.config.loadConfig());
  return cloneJson(config);
}

async function writeConfigSnapshot(config) {
  const runtime = getRuntime();
  await Promise.resolve(runtime.config.writeConfigFile(config));
}

async function resolvePackagedBaseUrl(track) {
  const { resolvePath } = getPluginContext();
  const candidates = PACKAGED_TEMPLATE_FILES[track] ?? [];
  for (const candidate of candidates) {
    const candidatePath = resolvePath(candidate);
    if (!(await exists(candidatePath))) {
      continue;
    }
    try {
      const parsed = JSON.parse(await readFile(candidatePath, 'utf8'));
      const baseUrl = extractServerBaseUrl(parsed);
      if (baseUrl) {
        return baseUrl;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function buildAuthStatusResult(input) {
  const expiresSoon =
    input.state && tokenExpiresSoon(input.state, input.warnBeforeExpiryMinutes ?? DEFAULT_WARN_BEFORE_EXPIRY_MINUTES);
  return {
    action: input.action,
    baseUrl: input.state?.baseUrl ?? input.baseUrl ?? (typeof input.server?.url === 'string' ? normalizeBaseUrl(input.server.url) : null),
    expiresAt: input.state?.expiresAt ?? null,
    expiresSoon,
    mcpBound: Boolean(input.server?.url),
    mcpUrl: typeof input.server?.url === 'string' ? input.server.url : null,
    ok: true,
    profile: input.profile,
    scope: input.state?.scope ?? null,
    track: input.track,
  };
}

function resolveOssToken(options = {}) {
  const explicit = String(options.token ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const envToken = process.env[FLUENT_OSS_TOKEN_ENV]?.trim() || process.env[FLUENT_LOCAL_TOKEN_ENV]?.trim();
  if (envToken) {
    return envToken;
  }
  if (options.optional === true) {
    return null;
  }
  throw new Error('Missing OSS Fluent token. Pass --token or set FLUENT_OSS_TOKEN.');
}

function normalizeProfile(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || DEFAULT_PROFILE_NAME;
}

function normalizeTrack(value) {
  return value === 'oss' ? 'oss' : 'cloud';
}

function resolveWarnBeforeExpiryMinutes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WARN_BEFORE_EXPIRY_MINUTES;
}

function buildHostedRefreshErrorMessage(error) {
  const detail = error instanceof Error && error.message ? error.message : String(error ?? 'Unknown error');
  return [
    'Fluent hosted auth refresh failed. Existing `mcp.servers.fluent` config was left unchanged.',
    'Retry `openclaw fluent auth refresh`, or reconnect with `openclaw fluent auth login` if the refresh token was retired.',
    `Cause: ${detail}`,
  ].join(' ');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
