import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPlaywrightAdapter } from './playwright-adapter.mjs';

export const DEFAULT_BROWSER_USE_API_BASE_URL = 'https://api.browser-use.com/api/v3';
export const DEFAULT_BROWSER_USE_LOCAL_BACKEND = 'browser-use-local-cdp';
export const DEFAULT_BROWSER_USE_CLOUD_BACKEND = 'browser-use-cloud-cdp';
export const DEFAULT_BROWSER_USE_LOCAL_RELAY_TIMEOUT_MS = 15_000;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_BROWSER_HARNESS_ROOT = path.join(os.homedir(), 'browser-harness');
const LOCAL_BROWSER_HARNESS_PYTHON = process.platform === 'win32'
  ? path.join(LOCAL_BROWSER_HARNESS_ROOT, '.venv', 'Scripts', 'python.exe')
  : path.join(LOCAL_BROWSER_HARNESS_ROOT, '.venv', 'bin', 'python');
const LOCAL_RELAY_SCRIPT_PATH = path.join(moduleDir, 'browser-use-cdp-relay.py');
const BROWSER_USE_TUNNEL_ERROR_PATTERN = /\bERR_TUNNEL_CONNECTION_FAILED\b/i;

export async function launchBrowserUseLocalCdpAdapter(options = {}) {
  const websocketUrl = await resolveLocalBrowserUseWebSocketUrl(options);
  if (shouldPreferLocalCdpRelay(options)) {
    try {
      return await connectThroughLocalRelay(websocketUrl, options);
    } catch (error) {
      if (!shouldFallbackToLocalPlaywright(error, options)) {
        throw error;
      }
      return launchLocalPlaywrightFallbackAdapter(options, error);
    }
  }
  try {
    return await connectPlaywrightCdpAdapter({
      backend: DEFAULT_BROWSER_USE_LOCAL_BACKEND,
      localSessionMode: 'cdp_direct',
      reuseCurrentPage: false,
      websocketUrl,
    });
  } catch (error) {
    if (!shouldFallbackToLocalCdpRelay(error, options)) {
      if (!shouldFallbackToLocalPlaywright(error, options)) {
        throw error;
      }
      return launchLocalPlaywrightFallbackAdapter(options, error);
    }
    try {
      return await connectThroughLocalRelay(websocketUrl, options);
    } catch (relayError) {
      if (!shouldFallbackToLocalPlaywright(relayError, options)) {
        throw relayError;
      }
      return launchLocalPlaywrightFallbackAdapter(options, relayError);
    }
  }
}

export async function launchBrowserUseCloudCdpAdapter(options = {}) {
  const apiKey = String(options.apiKey || process.env.BROWSER_USE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Browser Use Cloud backend requires BROWSER_USE_API_KEY or --browser-use-api-key.');
  }

  const apiBaseUrl = normalizeBrowserUseApiBaseUrl(options.apiBaseUrl);
  const sessionId = String(options.sessionId || '').trim() || null;
  const existingSession = sessionId
    ? await fetchBrowserUseSession({
        apiBaseUrl,
        apiKey,
        sessionId,
      })
    : null;

  const session =
    existingSession ||
    (await createBrowserUseSession({
      apiBaseUrl,
      apiKey,
      profileId: options.profileId,
      profileName: options.profileName,
      proxyCountryCode: options.proxyCountryCode,
      timeoutMinutes: options.timeoutMinutes,
    }));

  if (!String(session?.cdpUrl || '').trim()) {
    throw new Error('Browser Use Cloud did not return a CDP URL.');
  }

  if (String(session.status || '').trim().toLowerCase() === 'stopped') {
    throw new Error(`Browser Use session ${session.id} is stopped and cannot be resumed.`);
  }

  const websocketUrl = await resolveBrowserUseWebSocketUrl(session.cdpUrl);
  return connectPlaywrightCdpAdapter({
    backend: DEFAULT_BROWSER_USE_CLOUD_BACKEND,
    localSessionMode: null,
    websocketUrl,
    remoteRegion: session.region ?? null,
    remoteSessionId: session.id ?? null,
    reuseCurrentPage: Boolean(existingSession),
    sessionReused: Boolean(existingSession),
    async onClose(mode) {
      if (mode !== 'close' || !session.id) {
        return;
      }
      await stopBrowserUseSession({
        apiBaseUrl,
        apiKey,
        sessionId: session.id,
      }).catch(() => {});
    },
  });
}

export function normalizeBrowserUseApiBaseUrl(value) {
  return String(value || process.env.BROWSER_USE_API_BASE_URL || DEFAULT_BROWSER_USE_API_BASE_URL).replace(/\/$/, '');
}

export function normalizeBrowserUseProxyCountryCode(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized || '';
}

export function parseDevToolsActivePort(value) {
  const [portLine = '', browserPath = ''] = String(value || '').split(/\r?\n/);
  const port = Number.parseInt(portLine.trim(), 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('DevToolsActivePort did not contain a valid port.');
  }
  return {
    browserPath: browserPath.trim() || null,
    port,
  };
}

export function defaultChromeUserDataDir() {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Google', 'Chrome', 'User Data');
}

export async function resolveLocalBrowserUseWebSocketUrl(options = {}) {
  const explicitWebSocketUrl = String(
    options.websocketUrl || options.cdpWebSocketUrl || process.env.FLUENT_BROWSER_USE_CDP_WS || process.env.BU_CDP_WS || '',
  ).trim();
  if (explicitWebSocketUrl) {
    return explicitWebSocketUrl;
  }

  const cdpUserDataDir = String(
    options.cdpUserDataDir || options.chromeUserDataDir || defaultChromeUserDataDir(),
  ).trim();
  const activePortPath = options.activePortPath
    ? path.resolve(String(options.activePortPath))
    : path.join(
        path.resolve(cdpUserDataDir),
        'DevToolsActivePort',
      );
  const activePortText = await fs.readFile(activePortPath, 'utf8');
  const activePort = parseDevToolsActivePort(activePortText);
  if (activePort.browserPath) {
    return `ws://127.0.0.1:${activePort.port}${activePort.browserPath}`;
  }
  return resolveBrowserUseWebSocketUrl(`http://127.0.0.1:${activePort.port}`);
}

export async function resolveBrowserUseWebSocketUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('Browser Use CDP URL is empty.');
  }
  if (normalized.startsWith('ws://') || normalized.startsWith('wss://')) {
    return normalized;
  }

  const versionUrl = `${normalized.replace(/\/$/, '')}/json/version`;
  const response = await fetch(versionUrl, {
    headers: {
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Could not resolve Browser Use websocket URL from ${versionUrl} (${response.status}).`);
  }
  const payload = await response.json();
  const websocketUrl = String(payload?.webSocketDebuggerUrl || '').trim();
  if (!websocketUrl) {
    throw new Error(`Browser Use websocket URL response from ${versionUrl} was missing webSocketDebuggerUrl.`);
  }
  return websocketUrl;
}

async function connectPlaywrightCdpAdapter(options) {
  const browser = await chromium.connectOverCDP(options.websocketUrl);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page =
    options.reuseCurrentPage === true
      ? context.pages()[0] || (await context.newPage())
      : await context.newPage();

  return {
    backend: options.backend,
    browser,
    context,
    localSessionMode: options.localSessionMode ?? null,
    page,
    remoteRegion: options.remoteRegion ?? null,
    remoteSessionId: options.remoteSessionId ?? null,
    sessionReused: options.sessionReused === true,
    async goto(url, extra = {}) {
      try {
        await page.goto(url, {
          waitUntil: extra.waitUntil || 'domcontentloaded',
          timeout: extra.timeout ?? 45_000,
        });
      } catch (error) {
        if (options.backend === DEFAULT_BROWSER_USE_CLOUD_BACKEND && isBrowserUseTunnelConnectionError(error)) {
          throw new Error(
            `Browser Use Cloud navigation failed with ERR_TUNNEL_CONNECTION_FAILED while opening ${url}. This matches the upstream Browser Use cloud tunnel regression reported on April 16, 2026 (issue #4694). Retry later or use --browser-backend browser-use-local-cdp.`,
          );
        }
        throw error;
      }
      if (extra.waitForLoadState) {
        await page.waitForLoadState(extra.waitForLoadState, { timeout: extra.timeout ?? 10_000 }).catch(() => {});
      }
      return page.url();
    },
    async bringToFront() {
      await page.bringToFront();
    },
    async wait(ms) {
      await page.waitForTimeout(ms);
    },
    async screenshot(filePath) {
      return page.screenshot({ path: filePath, fullPage: true });
    },
    async close(mode = 'close') {
      if (typeof options.onClose === 'function') {
        await options.onClose(mode);
      }
      if (mode === 'close') {
        await browser.close().catch(() => {});
      }
    },
    async firstVisible(selectors, timeoutMs = 0) {
      const startedAt = Date.now();
      while (Date.now() - startedAt <= timeoutMs) {
        for (const selector of selectors) {
          const locator = page.locator(selector);
          const count = await locator.count();
          for (let index = 0; index < count; index += 1) {
            const candidate = locator.nth(index);
            if (await candidate.isVisible().catch(() => false)) {
              return candidate;
            }
          }
        }
        if (timeoutMs === 0) {
          break;
        }
        await page.waitForTimeout(150);
      }
      return null;
    },
    async clickFirstVisible(selectors, timeoutMs = 0) {
      const locator = await this.firstVisible(selectors, timeoutMs);
      if (!locator) {
        return false;
      }
      await locator.click({ timeout: 10_000 }).catch(() => {});
      return true;
    },
    async textOfFirstVisible(selectors, timeoutMs = 0) {
      const locator = await this.firstVisible(selectors, timeoutMs);
      if (!locator) {
        return '';
      }
      return ((await locator.textContent().catch(() => '')) || '').trim();
    },
  };
}

export function isBrowserUseTunnelConnectionError(error) {
  return BROWSER_USE_TUNNEL_ERROR_PATTERN.test(String(error?.message || error || ''));
}

export function shouldPreferLocalCdpRelay(options = {}) {
  const explicitValue = options.useLocalRelay ?? process.env.FLUENT_BROWSER_USE_LOCAL_RELAY;
  if (explicitValue !== undefined && explicitValue !== null && String(explicitValue).trim() !== '') {
    const normalized = String(explicitValue).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y'].includes(normalized);
  }
  return process.platform === 'win32';
}

export function shouldFallbackToLocalCdpRelay(error, options = {}) {
  if (options.disableLocalRelay === true) {
    return false;
  }
  const message = String(error?.message || error || '');
  return /connectOverCDP: (Timeout|WebSocket error|WebSocket was closed|socket hang up|ECONNREFUSED|ECONNRESET)/i.test(message);
}

export function shouldFallbackToLocalPlaywright(_error, options = {}) {
  if (options.disablePlaywrightFallback === true) {
    return false;
  }
  const explicitValue = options.allowPlaywrightFallback ?? process.env.FLUENT_BROWSER_USE_LOCAL_PLAYWRIGHT_FALLBACK;
  if (explicitValue !== undefined && explicitValue !== null && String(explicitValue).trim() !== '') {
    const normalized = String(explicitValue).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y'].includes(normalized);
  }
  return true;
}

export async function resolveBrowserUseRelayPythonExecutable(options = {}) {
  const explicitExecutable = String(
    options.pythonExecutable || process.env.FLUENT_BROWSER_USE_RELAY_PYTHON || '',
  ).trim();
  const candidates = explicitExecutable
    ? [explicitExecutable]
    : [LOCAL_BROWSER_HARNESS_PYTHON, process.platform === 'win32' ? 'python' : 'python3', 'python'];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate)) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
    return candidate;
  }

  throw new Error(
    'Could not find a Python executable for the Browser Use local CDP relay. Set FLUENT_BROWSER_USE_RELAY_PYTHON or install the browser-harness local venv.',
  );
}

async function connectThroughLocalRelay(targetWebSocketUrl, options = {}) {
  const relay = await startLocalBrowserUseCdpRelay(targetWebSocketUrl, options);
  try {
    return await connectPlaywrightCdpAdapter({
      backend: DEFAULT_BROWSER_USE_LOCAL_BACKEND,
      localSessionMode: 'cdp_relay',
      reuseCurrentPage: false,
      websocketUrl: relay.websocketUrl,
      async onClose(mode) {
        await relay.stop();
      },
    });
  } catch (error) {
    await relay.stop();
    throw error;
  }
}

async function launchLocalPlaywrightFallbackAdapter(options = {}, cause) {
  const adapter = await launchPlaywrightAdapter({
    headless: options.headless,
    useChrome: options.useChrome,
    userDataDir: options.userDataDir,
  });
  return {
    ...adapter,
    backend: DEFAULT_BROWSER_USE_LOCAL_BACKEND,
    localSessionMode: 'playwright_fallback',
    localSessionFallbackReason: cause instanceof Error ? cause.message : String(cause || ''),
  };
}

async function startLocalBrowserUseCdpRelay(targetWebSocketUrl, options = {}) {
  const pythonExecutable = await resolveBrowserUseRelayPythonExecutable(options);
  const relayScriptPath = path.resolve(String(options.relayScriptPath || LOCAL_RELAY_SCRIPT_PATH));
  const relayTimeoutMs = Number.isFinite(Number(options.relayTimeoutMs))
    ? Number(options.relayTimeoutMs)
    : DEFAULT_BROWSER_USE_LOCAL_RELAY_TIMEOUT_MS;
  const child = spawn(pythonExecutable, [relayScriptPath, '--target-ws', targetWebSocketUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let settled = false;
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new Error(
          `Timed out starting the Browser Use local CDP relay after ${relayTimeoutMs}ms.${stderr ? ` ${stderr.trim()}` : ''}`,
        ),
      );
    }, relayTimeoutMs);

    const finish = (value, isError = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (isError) {
        child.kill();
        reject(value);
        return;
      }
      resolve(value);
    };

    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const payload = JSON.parse(trimmed);
          if (String(payload.wsUrl || '').trim()) {
            finish({
              process: child,
              websocketUrl: String(payload.wsUrl).trim(),
              stop: async () => {
                if (child.exitCode !== null || child.killed) {
                  return;
                }
                child.kill();
                await new Promise((resolveStop) => {
                  child.once('exit', () => resolveStop());
                  setTimeout(resolveStop, 2_000);
                });
              },
            });
            return;
          }
        } catch {
          // Ignore non-JSON relay output until readiness is printed.
        }
      }
    });

    child.once('error', (error) => {
      finish(
        new Error(
          `Could not start the Browser Use local CDP relay with ${pythonExecutable}: ${error.message}`,
        ),
        true,
      );
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      finish(
        new Error(
          `Browser Use local CDP relay exited before becoming ready (code=${code ?? 'null'}, signal=${signal ?? 'null'}).${stderr ? ` ${stderr.trim()}` : ''}`,
        ),
        true,
      );
    });
  });
}

async function createBrowserUseSession(options) {
  const payload = {};
  if (options.profileId) payload.profileId = String(options.profileId).trim();
  if (options.profileName) payload.profileName = String(options.profileName).trim();
  const proxyCountryCode = normalizeBrowserUseProxyCountryCode(options.proxyCountryCode);
  if (proxyCountryCode !== undefined) payload.proxyCountryCode = proxyCountryCode;
  if (Number.isFinite(Number(options.timeoutMinutes))) payload.timeout = Number(options.timeoutMinutes);

  return browserUseRequest({
    apiBaseUrl: options.apiBaseUrl,
    apiKey: options.apiKey,
    body: payload,
    method: 'POST',
    path: '/browsers',
  });
}

async function fetchBrowserUseSession(options) {
  return browserUseRequest({
    apiBaseUrl: options.apiBaseUrl,
    apiKey: options.apiKey,
    method: 'GET',
    path: `/browsers/${encodeURIComponent(options.sessionId)}`,
  });
}

async function stopBrowserUseSession(options) {
  return browserUseRequest({
    apiBaseUrl: options.apiBaseUrl,
    apiKey: options.apiKey,
    body: { action: 'stop' },
    method: 'PATCH',
    path: `/browsers/${encodeURIComponent(options.sessionId)}`,
  });
}

async function browserUseRequest(options) {
  const response = await fetch(`${options.apiBaseUrl}${options.path}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      'content-type': 'application/json',
      'x-browser-use-api-key': options.apiKey,
    },
    method: options.method,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Browser Use request failed (${response.status}).`);
  }
  return payload;
}
