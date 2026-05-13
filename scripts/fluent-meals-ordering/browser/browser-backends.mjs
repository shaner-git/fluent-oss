export const DEFAULT_BROWSER_BACKEND = 'local';
export const SUPPORTED_BROWSER_BACKENDS = [
  'local',
  'browser-use-local-cdp',
  'browser-use-cloud-cdp',
  'cloudflare-browser-rendering',
];

export function normalizeBrowserBackend(value) {
  const normalized = String(value || DEFAULT_BROWSER_BACKEND).trim().toLowerCase();
  if (!SUPPORTED_BROWSER_BACKENDS.includes(normalized)) {
    throw new Error(
      `Unsupported browser backend "${value}". Expected one of: ${SUPPORTED_BROWSER_BACKENDS.join(', ')}.`,
    );
  }
  return normalized;
}

export function isBrowserUseBackend(value) {
  return ['browser-use-local-cdp', 'browser-use-cloud-cdp'].includes(String(value || '').trim().toLowerCase());
}
