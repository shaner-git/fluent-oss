import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { CALLBACK_HOST, CALLBACK_PATH, CALLBACK_PORT } from './constants.js';

const FLUENT_CLOUD_WAITLIST_URL = 'https://meetfluent.app/';
const FLUENT_OSS_AVAILABLE_URL = 'https://github.com/shaner-git/fluent-oss';
const FLUENT_SUPPORT_EMAIL = 'hello@meetfluent.app';

export function tokenExpiresSoon(state, warnBeforeExpiryMinutes = 60) {
  if (!state?.expiresAt) {
    return true;
  }
  const thresholdMs = Math.max(Number(warnBeforeExpiryMinutes) || 0, 1) * 60 * 1000;
  return Date.parse(state.expiresAt) - Date.now() < thresholdMs;
}

export function toHostedTokenState(input) {
  const obtainedAt = new Date().toISOString();
  const expiresIn = Number(input.tokenResponse?.expires_in ?? 0);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return {
    accessToken: String(input.tokenResponse?.access_token ?? ''),
    baseUrl: input.baseUrl,
    clientId: input.clientId,
    expiresAt,
    obtainedAt,
    redirectUri: input.redirectUri,
    refreshToken:
      typeof input.tokenResponse?.refresh_token === 'string' ? input.tokenResponse.refresh_token : input.refreshToken ?? null,
    scope: input.tokenResponse?.scope ?? input.scope,
    tokenType: input.tokenResponse?.token_type ?? 'Bearer',
  };
}

export async function bootstrapHostedToken(input) {
  const redirectUri = `http://${CALLBACK_HOST}:${input.callbackPort ?? CALLBACK_PORT}${CALLBACK_PATH}`;
  const registration = await registerHostedPublicClient({
    baseUrl: input.baseUrl,
    clientName: 'Fluent OpenClaw Plugin',
    redirectUri,
    scope: input.scope,
  });
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(24));
  const authorizeUrl = new URL(`${input.baseUrl}/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', registration.client_id);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', input.scope);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const authorizationCode = await waitForAuthorizationCode({
    callbackPort: input.callbackPort ?? CALLBACK_PORT,
    onOpenUrl: input.onOpenUrl ?? openBrowser,
    url: authorizeUrl.toString(),
    expectedState: state,
  });
  const tokenResponse = await exchangeCode({
    baseUrl: input.baseUrl,
    clientId: registration.client_id,
    code: authorizationCode,
    codeVerifier: verifier,
    redirectUri,
  });
  return toHostedTokenState({
    baseUrl: input.baseUrl,
    clientId: registration.client_id,
    redirectUri,
    scope: input.scope,
    tokenResponse,
  });
}

export async function refreshHostedToken(input) {
  if (!input.state?.refreshToken || !input.state?.clientId || !input.state?.redirectUri) {
    throw new Error('Fluent hosted refresh is unavailable. Run `openclaw fluent auth login` again.');
  }

  const tokenResponse = await exchangeRefresh({
    baseUrl: input.state.baseUrl,
    clientId: input.state.clientId,
    refreshToken: input.state.refreshToken,
  });
  return toHostedTokenState({
    baseUrl: input.state.baseUrl,
    clientId: input.state.clientId,
    redirectUri: input.state.redirectUri,
    scope: tokenResponse.scope ?? input.state.scope,
    refreshToken: input.state.refreshToken,
    tokenResponse,
  });
}

export async function registerHostedPublicClient(input) {
  const payload = {
    client_name: input.clientName,
    redirect_uris: [input.redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: input.scope,
  };

  const response = await fetch(`${input.baseUrl}/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const body = safeParseJson(text);
  if (!response.ok || !body || typeof body !== 'object' || !body.client_id) {
    throw new Error(formatFluentHostedError(text, `Fluent hosted client registration failed (${response.status}): ${text}`));
  }
  return body;
}

async function waitForAuthorizationCode(input) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', `http://${CALLBACK_HOST}:${input.callbackPort}`);
      if (requestUrl.pathname !== CALLBACK_PATH) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');
      const error = requestUrl.searchParams.get('error');
      const errorDescription = requestUrl.searchParams.get('error_description');

      if (error) {
        const earlyAccess = isFluentCloudEarlyAccessDenial(errorDescription ?? error);
        const message = formatFluentHostedError(
          errorDescription ?? error,
          `Fluent hosted authorization failed: ${error}${errorDescription ? ` (${errorDescription})` : ''}`,
        );
        clearTimeout(timeout);
        res.statusCode = 400;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(
          earlyAccess
            ? '<h1>Fluent Cloud early access</h1><p>You can return to OpenClaw.</p>'
            : '<h1>Fluent authorization failed</h1><p>You can return to OpenClaw.</p>',
        );
        server.close();
        reject(new Error(message));
        return;
      }

      if (!code || state !== input.expectedState) {
        clearTimeout(timeout);
        res.statusCode = 400;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<h1>Fluent authorization invalid</h1><p>You can return to OpenClaw.</p>');
        server.close();
        reject(new Error('Fluent hosted authorization callback was missing a code or had an invalid state.'));
        return;
      }

      clearTimeout(timeout);
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<h1>Fluent hosted auth complete</h1><p>You can close this tab and return to OpenClaw.</p>');
      server.close();
      resolve(code);
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for the Fluent hosted OAuth callback.'));
    }, 5 * 60 * 1000);

    server.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.listen(input.callbackPort, CALLBACK_HOST, async () => {
      try {
        await input.onOpenUrl(input.url);
      } catch (error) {
        clearTimeout(timeout);
        server.close();
        reject(error);
      }
    });
  });
}

async function exchangeCode(input) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.clientId,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    resource: input.baseUrl,
  });
  return requestToken(input.baseUrl, body);
}

async function exchangeRefresh(input) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: input.clientId,
    refresh_token: input.refreshToken,
    resource: input.baseUrl,
  });
  return requestToken(input.baseUrl, body);
}

async function requestToken(baseUrl, body) {
  const response = await fetch(`${baseUrl}/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const text = await response.text();
  const parsed = safeParseJson(text);
  if (!response.ok || !parsed?.access_token || !parsed?.expires_in) {
    throw new Error(formatFluentHostedError(text, `Fluent hosted token request failed (${response.status}): ${text}`));
  }
  return parsed;
}

async function openBrowser(url) {
  process.stdout.write(`Open this URL in your browser to continue Fluent login:\n${url}\n`);
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatFluentHostedError(source, fallback) {
  if (isFluentCloudEarlyAccessDenial(source)) {
    return [
      'Fluent Cloud is still in early access and is not generally available yet.',
      'This account does not have Fluent Cloud access yet.',
      `Join the waitlist: ${FLUENT_CLOUD_WAITLIST_URL}`,
      `Fluent OSS is available today: ${FLUENT_OSS_AVAILABLE_URL}`,
      `If you expected Cloud access, contact ${FLUENT_SUPPORT_EMAIL}.`,
    ].join(' ');
  }
  return fallback;
}

function isFluentCloudEarlyAccessDenial(source) {
  const normalized = normalizeErrorText(source);
  if (!normalized) {
    return false;
  }

  return [
    'access_denied',
    'early access',
    'no cloud access',
    'not have access',
    'not approved',
    'not enabled',
    'sign-up interest',
    'waitlist',
  ].some((needle) => normalized.includes(needle));
}

function normalizeErrorText(source) {
  if (!source) {
    return '';
  }
  if (typeof source === 'string') {
    return source.trim().toLowerCase();
  }
  if (typeof source === 'object') {
    return [source.error, source.error_description, source.message]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .trim()
      .toLowerCase();
  }
  return String(source).trim().toLowerCase();
}
