import { dash } from '@better-auth/infra';
import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { jwt, magicLink } from 'better-auth/plugins';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  type FluentAuthProps,
  FLUENT_HEALTH_READ_SCOPE,
  FLUENT_HEALTH_WRITE_SCOPE,
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  FLUENT_STYLE_READ_SCOPE,
  FLUENT_STYLE_WRITE_SCOPE,
  FLUENT_SUPPORTED_SCOPES,
} from './auth';
import { coreBindingsFromCloudEnv, readConfig, type CloudRuntimeEnv, type OAuthAppEnv } from './config';
import { hasHostedEmailDelivery, sendHostedMagicLinkEmail } from './hosted-email';
import { createFluentMcpServer } from './mcp';
import { wrapCloudflareDatabase } from './storage';
import { ensureHostedUserProvisioned, getHostedUserMembership } from './hosted-identity';

type BetterAuthSessionPayload = {
  session?: {
    id?: string;
  } | null;
  user?: {
    email?: string | null;
    id: string;
    name?: string | null;
  } | null;
} | null;

type BetterAuthCompatibilityRoute =
  | '/authorize'
  | '/register'
  | '/token'
  | '/.well-known/oauth-authorization-server'
  | '/.well-known/openid-configuration'
  | '/.well-known/oauth-protected-resource';

export async function maybeHandleBetterAuthRequest(
  request: Request,
  env: CloudRuntimeEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/ops/better-auth/migrate') {
    return handleBetterAuthMigration(request, env);
  }

  if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) {
    return handleBetterAuthApiRequest(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/sign-in') {
    return handleSignInPage(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/consent') {
    return handleConsentPage(request, env);
  }

  return null;
}

export async function maybeHandleBetterAuthCompatibilityRequest(
  request: Request,
  env: OAuthAppEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const compatibilityRoute = normalizeCompatibilityRoute(url.pathname);
  if (url.pathname === '/mcp' || compatibilityRoute) {
    if (!hasBetterAuthConfig(env)) {
      return betterAuthConfigErrorResponse(new Error('Better Auth is not configured.'));
    }
  }

  if (url.pathname === '/mcp') {
    return handleBetterAuthMcpRequest(request, env, ctx);
  }

  if (!compatibilityRoute) {
    return null;
  }

  switch (compatibilityRoute) {
    case '/authorize':
      return proxyBetterAuthRequest(request, env, '/api/auth/oauth2/authorize');
    case '/token':
      return proxyBetterAuthRequest(request, env, '/api/auth/oauth2/token');
    case '/register':
      return proxyBetterAuthRequest(request, env, '/api/auth/oauth2/register');
    case '/.well-known/oauth-authorization-server':
      return handleBetterAuthWellKnownMetadata(request, env, 'authorization_server');
    case '/.well-known/openid-configuration':
      return handleBetterAuthWellKnownMetadata(request, env, 'openid_configuration');
    case '/.well-known/oauth-protected-resource':
      return json(buildProtectedResourceMetadata(request, env));
    default:
      return null;
  }
}

export function buildBetterAuthStatus(env: CloudRuntimeEnv): {
  hasEmailDelivery: boolean;
  hasMigrationToken: boolean;
  hasSecret: boolean;
} {
  return {
    hasEmailDelivery: hasHostedEmailDelivery(env),
    hasMigrationToken: Boolean(env.BETTER_AUTH_MIGRATION_TOKEN?.trim()),
    hasSecret: Boolean(resolveBetterAuthSecret(env)),
  };
}

export function hasBetterAuthConfig(env: CloudRuntimeEnv): boolean {
  return readConfig(env).hasBetterAuthConfig;
}

async function handleBetterAuthApiRequest(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch (error) {
    return betterAuthConfigErrorResponse(error);
  }

  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/auth/root-metadata/oauth-authorization-server') {
    return oauthProviderAuthServerMetadata(auth)(request);
  }
  if (request.method === 'GET' && url.pathname === '/api/auth/root-metadata/openid-configuration') {
    return oauthProviderOpenIdConfigMetadata(auth)(request);
  }

  return auth.handler(request);
}

async function handleBetterAuthMigration(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  const migrationToken = env.BETTER_AUTH_MIGRATION_TOKEN?.trim();
  if (!migrationToken) {
    return json(
      {
        error: 'Better Auth migrations are disabled until BETTER_AUTH_MIGRATION_TOKEN is configured.',
      },
      503,
    );
  }

  const presented = parseBearerToken(request.headers.get('authorization'));
  if (presented !== migrationToken) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let config;
  try {
    config = createBetterAuthConfig(request, env);
  } catch (error) {
    return betterAuthConfigErrorResponse(error);
  }

  try {
    const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(config);
    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
      return json({
        message: 'No Better Auth schema changes are pending.',
      });
    }

    await runMigrations();
    return json({
      message: 'Better Auth schema migrations applied.',
      tablesAdded: toBeAdded.map((entry: { table: string }) => entry.table),
      tablesCreated: toBeCreated.map((entry: { table: string }) => entry.table),
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

async function handleSignInPage(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch (error) {
    return html(renderAuthUnavailablePage(env, 'Sign In'), 503);
  }

  const session = await getBetterAuthSession(auth, request);
  const provisioning = await maybeProvisionHostedSession(env, session);
  const postSignInRedirectUrl = derivePostSignInRedirectUrl(request.url, Boolean(session?.user));
  if (postSignInRedirectUrl) {
    return Response.redirect(postSignInRedirectUrl, 302);
  }
  const origin = new URL(request.url).origin;

  return html(
    renderSignInPage({
      callbackUrl: deriveMagicLinkCallbackUrl(request.url),
      emailDeliveryReady: hasHostedEmailDelivery(env),
      origin,
      provisioningError: provisioning.error,
      provisioningResult: provisioning.result,
      session,
    }),
  );
}

async function handleConsentPage(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch {
    return html(renderAuthUnavailablePage(env, 'Consent'), 503);
  }

  const session = await getBetterAuthSession(auth, request);
  if (!session?.user) {
    const url = new URL(request.url);
    return Response.redirect(`${url.origin}/sign-in${url.search}`, 302);
  }

  const provisioning = await maybeProvisionHostedSession(env, session);
  const consentInfo = await getConsentClientSummary(auth, request);
  return html(
    renderConsentPage({
      clientId: consentInfo.clientId,
      clientName: consentInfo.clientName,
      logoUrl: consentInfo.logoUrl,
      provisioningError: provisioning.error,
      requestedScopes: consentInfo.requestedScopes,
      session,
    }),
  );
}

export function createBetterAuth(request: Request, env: CloudRuntimeEnv) {
  return betterAuth(createBetterAuthConfig(request, env));
}

export function createBetterAuthConfig(request: Request, env: CloudRuntimeEnv) {
  const secret = resolveBetterAuthSecret(env);
  if (!secret) {
    throw new Error('Missing BETTER_AUTH_SECRET (or COOKIE_ENCRYPTION_KEY fallback) for Better Auth.');
  }

  const baseURL = resolveBetterAuthBaseUrl(request, env);
  const plugins = [
    jwt({
      disableSettingJwtHeader: true,
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendHostedMagicLinkEmail(env, { email, url });
      },
    }),
    oauthProvider({
      allowDynamicClientRegistration: true,
      allowPublicClientPrelogin: true,
      allowUnauthenticatedClientRegistration: true,
      consentPage: '/consent',
      customAccessTokenClaims: async ({ user }) => buildHostedAccessTokenClaims(env, user),
      loginPage: '/sign-in',
      scopes: [
        'email',
        FLUENT_MEALS_READ_SCOPE,
        FLUENT_MEALS_WRITE_SCOPE,
        FLUENT_HEALTH_READ_SCOPE,
        FLUENT_HEALTH_WRITE_SCOPE,
        FLUENT_STYLE_READ_SCOPE,
        FLUENT_STYLE_WRITE_SCOPE,
        'offline_access',
        'openid',
        'profile',
      ],
      validAudiences: [baseURL, `${baseURL}/`, `${baseURL}/mcp`, `${baseURL}/mcp/`],
    }),
    ...(env.BETTER_AUTH_API_KEY?.trim()
      ? [
          dash({
            apiKey: env.BETTER_AUTH_API_KEY.trim(),
            apiUrl: env.BETTER_AUTH_API_URL?.trim(),
            kvUrl: env.BETTER_AUTH_KV_URL?.trim(),
          }),
        ]
      : []),
  ];

  return {
    basePath: '/api/auth',
    baseURL,
    database: env.DB,
    disabledPaths: ['/token'],
    plugins,
    secret,
    trustedOrigins: [new URL(baseURL).origin],
  };
}

async function getBetterAuthSession(auth: ReturnType<typeof createBetterAuth>, request: Request): Promise<BetterAuthSessionPayload> {
  return (await auth.api.getSession({
    headers: request.headers,
  })) as BetterAuthSessionPayload;
}

async function maybeProvisionHostedSession(
  env: CloudRuntimeEnv,
  session: BetterAuthSessionPayload,
): Promise<{
  error: string | null;
  result: Awaited<ReturnType<typeof ensureHostedUserProvisioned>> | null;
}> {
  const user = session?.user;
  if (!user?.id) {
    return { error: null, result: null };
  }

  try {
    const result = await ensureHostedUserProvisioned(wrapCloudflareDatabase(env.DB), {
      email: user.email ?? null,
      id: user.id,
      name: user.name ?? null,
    });
    return {
      error: null,
      result,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      result: null,
    };
  }
}

async function getConsentClientSummary(
  auth: ReturnType<typeof createBetterAuth>,
  request: Request,
): Promise<{
  clientId: string | null;
  clientName: string;
  logoUrl: string | null;
  requestedScopes: string[];
}> {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const scopeParam = url.searchParams.get('scope');
  const requestedScopes = scopeParam
    ? scopeParam
        .split(' ')
        .map((scope) => scope.trim())
        .filter(Boolean)
    : [...FLUENT_SUPPORTED_SCOPES];

  if (!clientId) {
    return {
      clientId: null,
      clientName: 'Connected client',
      logoUrl: null,
      requestedScopes,
    };
  }

  try {
    const response = (await auth.api.getOAuthClientPublicPrelogin({
      body: {
        client_id: clientId,
        oauth_query: url.searchParams.toString(),
      },
      headers: request.headers,
    })) as {
      client_id?: string;
      client_name?: string;
      logo_uri?: string;
    };

    return {
      clientId,
      clientName: response.client_name?.trim() || clientId,
      logoUrl: response.logo_uri?.trim() || null,
      requestedScopes,
    };
  } catch {
    return {
      clientId,
      clientName: clientId,
      logoUrl: null,
      requestedScopes,
    };
  }
}

async function handleBetterAuthMcpRequest(
  request: Request,
  env: OAuthAppEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const authResult = await authenticateBetterAuthBearerRequest(env, request, new URL(request.url).origin);
  if (authResult instanceof Response) {
    return authResult;
  }

  if (!authResult) {
    return createBearerAuthErrorResponse(
      request,
      'Missing or invalid access token',
      new URL(request.url).origin,
      FLUENT_SUPPORTED_SCOPES,
    );
  }

  const server = createFluentMcpServer(coreBindingsFromCloudEnv(env), new URL(request.url).origin);
  const { createMcpHandler } = await import('agents/mcp');
  const handler = createMcpHandler(server, {
    authContext: { props: authResult as Record<string, unknown> },
    route: '/mcp',
  });
  return handler(request, env, ctx);
}

async function handleBetterAuthWellKnownMetadata(
  request: Request,
  env: CloudRuntimeEnv,
  mode: 'authorization_server' | 'openid_configuration',
): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch (error) {
    return betterAuthConfigErrorResponse(error);
  }

  const response =
    mode === 'authorization_server'
      ? await oauthProviderAuthServerMetadata(auth)(request)
      : await oauthProviderOpenIdConfigMetadata(auth)(request);
  return rewriteMetadataResponse(request, response);
}

export async function authenticateBetterAuthBearerRequest(
  env: CloudRuntimeEnv,
  request: Request,
  resourceOrigin: string,
): Promise<FluentAuthProps | Response | null> {
  const presented = parseBearerToken(request.headers.get('authorization'));
  if (!presented) {
    return null;
  }

  try {
    const payload = await verifyHostedAccessToken(env, request, presented, resourceOrigin);
    return jwtPayloadToAuthProps(payload, presented);
  } catch (error) {
    return createBearerAuthErrorResponse(
      request,
      error instanceof Error ? error.message : 'Invalid access token',
      resourceOrigin,
      FLUENT_SUPPORTED_SCOPES,
    );
  }
}

async function verifyHostedAccessToken(
  env: CloudRuntimeEnv,
  request: Request,
  presented: string,
  resourceOrigin: string,
): Promise<JWTPayload> {
  const issuer = `${resolveBetterAuthBaseUrl(request, env)}/api/auth`;
  const audience = [resourceOrigin, `${resourceOrigin}/mcp`];

  try {
    const { payload } = await jwtVerify(
      presented,
      createRemoteJWKSet(new URL(`${issuer}/jwks`)),
      {
        audience,
        issuer,
      },
    );
    return payload;
  } catch {
    return lookupHostedOpaqueAccessTokenPayload(env, request, presented, issuer);
  }
}

async function lookupHostedOpaqueAccessTokenPayload(
  env: CloudRuntimeEnv,
  request: Request,
  presented: string,
  issuer: string,
): Promise<JWTPayload> {
  const db = wrapCloudflareDatabase(env.DB);
  const storedToken = await sha256Base64Url(presented);
  const accessToken = await db
    .prepare('SELECT clientId, createdAt, expiresAt, referenceId, scopes, sessionId, userId FROM oauthAccessToken WHERE token = ?')
    .bind(storedToken)
    .first<{
      clientId?: string | null;
      createdAt?: string | null;
      expiresAt?: string | null;
      referenceId?: string | null;
      scopes?: string | null;
      sessionId?: string | null;
      userId?: string | null;
    }>();
  if (!accessToken) {
    throw new Error('Invalid access token');
  }

  const expiresAt = accessToken.expiresAt ? new Date(accessToken.expiresAt) : null;
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    throw new Error('token inactive');
  }

  if (accessToken.clientId) {
    const client = await db
      .prepare('SELECT clientId, disabled, metadata FROM oauthClient WHERE clientId = ?')
      .bind(accessToken.clientId)
      .first<{ clientId?: string | null; disabled?: number | null; metadata?: string | null }>();
    if (!client?.clientId || Number(client.disabled ?? 0) !== 0) {
      throw new Error('token inactive');
    }
  }

  let sid: string | undefined;
  if (accessToken.sessionId) {
    const session = await db
      .prepare('SELECT id, expiresAt FROM session WHERE id = ?')
      .bind(accessToken.sessionId)
      .first<{ id?: string | null; expiresAt?: string | null }>();
    if (session?.id && session.expiresAt && new Date(session.expiresAt).getTime() >= Date.now()) {
      sid = session.id;
    }
  }

  let user:
    | {
        id: string;
        email?: string | null;
        name?: string | null;
      }
    | undefined;
  if (accessToken.userId) {
    const row = await db
      .prepare('SELECT id, email, name FROM "user" WHERE id = ?')
      .bind(accessToken.userId)
      .first<{ id?: string | null; email?: string | null; name?: string | null }>();
    if (row?.id) {
      user = {
        email: row.email ?? null,
        id: row.id,
        name: row.name ?? null,
      };
    }
  }

  const customClaims = await buildHostedAccessTokenClaims(env, user);
  const createdAt = accessToken.createdAt ? new Date(accessToken.createdAt) : new Date();
  const scopes = parseJsonStringArray(accessToken.scopes);

  return {
    ...customClaims,
    azp: accessToken.clientId ?? undefined,
    client_id: accessToken.clientId ?? undefined,
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: Math.floor(createdAt.getTime() / 1000),
    iss: issuer,
    scope: scopes.join(' '),
    sid,
    sub: user?.id,
  };
}

export function resolveBetterAuthBaseUrl(request: Request, env: CloudRuntimeEnv): string {
  const configured = env.PUBLIC_BASE_URL?.trim();
  return configured || new URL(request.url).origin;
}

function resolveBetterAuthSecret(env: CloudRuntimeEnv): string | null {
  const secret = env.BETTER_AUTH_SECRET?.trim() || env.COOKIE_ENCRYPTION_KEY?.trim() || '';
  return secret || null;
}

export function derivePostSignInRedirectUrl(requestUrl: string, signedIn: boolean): string | null {
  if (!signedIn) {
    return null;
  }

  const url = new URL(requestUrl);
  if (url.pathname !== '/sign-in') {
    return null;
  }

  if (!url.searchParams.get('client_id') || !url.searchParams.get('redirect_uri')) {
    return null;
  }

  const redirectUrl = new URL(url.toString());
  redirectUrl.pathname = '/authorize';
  return redirectUrl.toString();
}

export function deriveMagicLinkCallbackUrl(requestUrl: string): string {
  const targetUrl = derivePostSignInRedirectUrl(requestUrl, true) ?? requestUrl;
  const parsed = new URL(targetUrl);
  const callbackSearch = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    callbackSearch.append(key, encodeURIComponent(value));
  }
  const query = callbackSearch.toString();
  return query ? `${parsed.pathname}?${query}` : parsed.pathname;
}

async function sha256Base64Url(value: string | null): Promise<string> {
  if (!value) {
    throw new Error('Missing Better Auth secret for hosted resource introspection client.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('base64url');
}

async function buildHostedAccessTokenClaims(
  env: CloudRuntimeEnv,
  user:
    | {
        id: string;
        email?: string | null;
        name?: string | null;
      }
    | null
    | undefined,
): Promise<Record<string, string>> {
  if (!user?.id) {
    return {};
  }

  const db = wrapCloudflareDatabase(env.DB);
  const provisioning = await ensureHostedUserProvisioned(db, {
    email: typeof user.email === 'string' ? user.email : null,
    id: user.id,
    name: typeof user.name === 'string' ? user.name : null,
  });

  return {
    ...(typeof user.email === 'string' ? { email: user.email, login: user.email } : {}),
    ...(typeof user.name === 'string' ? { name: user.name } : {}),
    profileId: provisioning.profileId,
    tenantId: provisioning.tenantId,
    userId: user.id,
  };
}

function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function betterAuthConfigErrorResponse(error: unknown): Response {
  return json(
    {
      error: error instanceof Error ? error.message : 'Better Auth is not configured.',
    },
    503,
  );
}

const FLUENT_LOGO_SVG = `<svg viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="1024" height="1024" rx="220" fill="#121212"/>
  <path d="M248 238H488C548.751 238 598 287.249 598 348V666C598 726.751 647.249 776 708 776H776" stroke="#FAF9F6" stroke-width="92" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M248 512H552" stroke="#FAF9F6" stroke-width="92" stroke-linecap="round"/>
</svg>`;

function renderAuthUnavailablePage(env: CloudRuntimeEnv, title: string): string {
  const status = buildBetterAuthStatus(env);
  return renderAuthShell({
    body: `
<p class="eyebrow">⟩ ${escapeHtml(title)}</p>
<h1 class="display">${escapeHtml(title)} is <span class="accent">unavailable</span></h1>
<p class="lede">Fluent's Better Auth scaffold is mounted, but the required secret has not been configured yet.</p>
<div class="status-list">
  <div class="status-row"><span class="status-key">Secret ready</span><code class="status-val">${String(status.hasSecret)}</code></div>
  <div class="status-row"><span class="status-key">Email delivery ready</span><code class="status-val">${String(status.hasEmailDelivery)}</code></div>
  <div class="status-row"><span class="status-key">Migration token ready</span><code class="status-val">${String(status.hasMigrationToken)}</code></div>
</div>`,
    title: `${title} | Fluent`,
  });
}

function renderSignInPage(input: {
  callbackUrl: string;
  emailDeliveryReady: boolean;
  origin: string;
  provisioningError: string | null;
  provisioningResult: Awaited<ReturnType<typeof ensureHostedUserProvisioned>> | null;
  session: BetterAuthSessionPayload;
}): string {
  const signedIn = Boolean(input.session?.user);
  const signedInBody = signedIn
    ? `
<div class="notice success">
  <p class="notice-title">You're signed in to Fluent.</p>
  <p>Return to the app or browser tab that opened this page to continue the connection.</p>
  <p class="meta">Signed in as <strong>${escapeHtml(input.session?.user?.email ?? input.session?.user?.id ?? 'your email')}</strong>.</p>
</div>`
    : '';

  const provisioningWarning = input.provisioningError
    ? `<div class="notice warn"><p class="notice-title">Hosted bootstrap warning</p><p>${escapeHtml(input.provisioningError)}</p></div>`
    : '';

  const emailDeliveryWarning = input.emailDeliveryReady
    ? ''
    : `<div class="notice warn"><p class="notice-title">Sign-in links are unavailable right now</p><p>Cloudflare Email Service still needs to be configured before Fluent can send passwordless sign-in links.</p></div>`;

  const signedOutBody = `
<p class="eyebrow">⟩ Fluent sign-in</p>
<h1 class="display">Sign in with <span class="accent">email</span></h1>
<p class="lede">We'll send you a one-time sign-in link. If this is your first time, your Fluent account is created after you verify.</p>
<div class="auth-card">
  <form id="magic-link-form" class="stack">
    <label>
      <span class="field-label">Email address</span>
      <input type="email" name="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com" required />
    </label>
    <button id="magic-link-submit" type="submit" class="btn-primary"${input.emailDeliveryReady ? '' : ' disabled'}>
      Send sign-in link
      <span class="btn-arrow">→</span>
    </button>
  </form>
  <div id="form-status" class="meta status-live" aria-live="polite"></div>
</div>
<ul class="support-list">
  <li>No password required.</li>
  <li>Open the sign-in link in this same browser.</li>
  <li>Links expire in 15 minutes.</li>
</ul>`;

  return renderAuthShell({
    body: `${signedIn ? signedInBody : signedOutBody}
${provisioningWarning}
${emailDeliveryWarning}
<script>
const form = document.getElementById('magic-link-form');
const status = document.getElementById('form-status');
const submitButton = document.getElementById('magic-link-submit');
const callbackUrl = ${JSON.stringify(input.callbackUrl)};
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitButton) submitButton.disabled = true;
  status.textContent = 'Sending your sign-in link…';
  const formData = new FormData(form);
  const payload = { email: String(formData.get('email') || '').trim(), callbackURL: callbackUrl };
  try {
    const response = await fetch('${input.origin}/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || data?.error || 'Unable to send sign-in link.');
    status.textContent = 'Check your inbox. Your Fluent sign-in link is on the way.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});
</script>`,
    title: 'Sign in | Fluent',
  });
}

function renderConsentPage(input: {
  clientId: string | null;
  clientName: string;
  logoUrl: string | null;
  provisioningError: string | null;
  requestedScopes: string[];
  session: BetterAuthSessionPayload;
}): string {
  const scopeItems = input.requestedScopes
    .map((scope) => {
      const human = humanizeScope(scope);
      return `<li class="scope-row"><code class="scope-code">${escapeHtml(scope)}</code><span class="scope-human">${escapeHtml(human)}</span></li>`;
    })
    .join('');
  const warning = input.provisioningError
    ? `<div class="notice warn"><p class="notice-title">Hosted bootstrap warning</p><p>${escapeHtml(input.provisioningError)}</p></div>`
    : '';
  const logo = input.logoUrl
    ? `<img class="client-logo" src="${escapeHtml(input.logoUrl)}" alt="" />`
    : `<div class="client-logo client-logo-fallback">${escapeHtml((input.clientName || '?').slice(0, 1).toUpperCase())}</div>`;

  return renderAuthShell({
    body: `${warning}
<p class="eyebrow">⟩ Authorize access</p>
<h1 class="display">Grant <span class="accent">${escapeHtml(input.clientName)}</span> access to Fluent?</h1>
<div class="client-card">
  ${logo}
  <div class="client-meta">
    <p class="client-name">${escapeHtml(input.clientName)}</p>
    <p class="client-sub">Signed in as <strong>${escapeHtml(input.session?.user?.email ?? input.session?.user?.id ?? 'your account')}</strong></p>
  </div>
</div>
<div class="scope-card">
  <p class="eyebrow-sm">Requested access</p>
  <ul class="scope-list">${scopeItems}</ul>
  <p class="meta">Client ID <code>${escapeHtml(input.clientId ?? 'unknown')}</code></p>
</div>
<div class="actions">
  <button id="approve" class="btn-primary">Approve <span class="btn-arrow">→</span></button>
  <button id="deny" class="btn-secondary">Deny</button>
</div>
<div id="consent-status" class="meta" aria-live="polite"></div>
<script>
const status = document.getElementById('consent-status');
async function submitConsent(accept) {
  status.textContent = accept ? 'Approving access…' : 'Denying access…';
  try {
    const response = await fetch('/api/auth/oauth2/consent', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        accept,
        oauth_query: window.location.search.slice(1),
        scope: ${JSON.stringify(input.requestedScopes.join(' '))} || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || data?.error || 'Unable to process consent.');
    if (data?.url) { window.location.assign(data.url); return; }
    status.textContent = 'Consent recorded.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
}
document.getElementById('approve')?.addEventListener('click', () => submitConsent(true));
document.getElementById('deny')?.addEventListener('click', () => submitConsent(false));
</script>`,
    title: 'Authorize | Fluent',
  });
}

function humanizeScope(scope: string): string {
  switch (scope) {
    case 'openid':
      return 'Verify your identity';
    case 'offline_access':
      return 'Stay connected without repeated sign-ins';
    case 'profile':
      return 'Read your basic profile';
    case 'email':
      return 'Read your email address';
    case FLUENT_MEALS_READ_SCOPE:
      return 'Read your meals, pantry, and grocery context';
    case FLUENT_MEALS_WRITE_SCOPE:
      return 'Create and update meal plans and grocery lists';
    case FLUENT_STYLE_READ_SCOPE:
      return 'Read your closet and style preferences';
    case FLUENT_STYLE_WRITE_SCOPE:
      return 'Update your closet and purchase decisions';
    case FLUENT_HEALTH_READ_SCOPE:
      return 'Read your training blocks and workout history';
    case FLUENT_HEALTH_WRITE_SCOPE:
      return 'Create and update training plans';
    default:
      return scope;
  }
}

function renderAuthShell(input: { body: string; title: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(input.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: dark;
      --bg: #0A0A0A;
      --bg-elev: #131311;
      --card: rgba(23, 23, 21, 0.74);
      --ink: #908B85;
      --ink-strong: #FAF9F6;
      --muted: #908B85;
      --faint: #5A5550;
      --accent: #D4C4A8;
      --accent-strong: #E1D3BA;
      --border: rgba(250, 249, 246, 0.09);
      --border-strong: rgba(250, 249, 246, 0.18);
      --warn: #E09B7D;
      --success: #A3B094;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 15px;
      line-height: 1.55;
      background:
        radial-gradient(900px 600px at 50% -10%, rgba(212,196,168,0.08), transparent 60%),
        radial-gradient(640px 420px at 12% 8%, rgba(250,249,246,0.03), transparent 70%),
        var(--bg);
      color: var(--ink);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .shell { min-height: 100vh; display: flex; flex-direction: column; }
    header.brand {
      padding: 28px 24px 0;
      max-width: 680px; margin: 0 auto; width: 100%;
      display: flex; align-items: center; gap: 10px;
    }
    .brand-mark { width: 28px; height: 28px; display: inline-flex; }
    .brand-mark svg { width: 100%; height: 100%; }
    .brand-wordmark {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 20px; letter-spacing: -0.01em; color: var(--ink-strong);
    }
    main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 24px 88px; }
    .panel {
      width: 100%; max-width: 520px;
      background: linear-gradient(to bottom, rgba(255,255,255,0.02), transparent 18%), var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 40px 36px 36px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 40px 80px -40px rgba(0,0,0,0.6), 0 0 0 1px rgba(250,249,246,0.03) inset;
    }
    .eyebrow {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase;
      color: var(--faint); margin: 0 0 16px;
    }
    .eyebrow-sm {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;
      color: var(--faint); margin: 0 0 12px;
    }
    h1.display {
      font-family: 'Instrument Serif', Georgia, serif;
      font-weight: 400; font-size: clamp(30px, 5vw, 40px);
      line-height: 1.08; letter-spacing: -0.02em;
      color: var(--ink-strong); margin: 0 0 16px; text-wrap: pretty;
    }
    h1.display .accent { font-style: italic; color: var(--accent); }
    .lede { color: var(--muted); margin: 0 0 28px; font-size: 15.5px; line-height: 1.6; max-width: 38rem; }
    .auth-card {
      margin-top: 4px; padding: 22px; border-radius: 14px;
      background: rgba(0,0,0,0.22); border: 1px solid var(--border);
    }
    .stack { display: grid; gap: 16px; }
    label { display: grid; gap: 8px; }
    .field-label {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--faint);
    }
    input[type="email"] {
      border: 1px solid var(--border); border-radius: 10px;
      padding: 13px 15px; font: inherit; font-size: 15px;
      background: rgba(0,0,0,0.3); color: var(--ink-strong);
      transition: border-color .18s ease, background .18s ease;
    }
    input[type="email"]::placeholder { color: var(--faint); }
    input:focus-visible, button:focus-visible {
      outline: none; border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(212,196,168,0.18);
    }
    button {
      border: 0; border-radius: 10px; padding: 13px 18px;
      font: inherit; font-size: 14px; font-weight: 600;
      cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      transition: transform .18s ease, opacity .18s ease, background .18s ease;
    }
    .btn-primary { background: var(--accent); color: #0A0A0A; }
    .btn-primary:hover:not(:disabled) { background: var(--accent-strong); transform: translateY(-1px); }
    .btn-secondary {
      background: transparent; color: var(--ink);
      border: 1px solid var(--border-strong);
    }
    .btn-secondary:hover:not(:disabled) { color: var(--ink-strong); border-color: var(--ink); }
    .btn-arrow { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 500; }
    button:disabled { cursor: not-allowed; opacity: 0.45; transform: none; }
    .meta {
      margin-top: 14px; font-size: 13px; color: var(--muted);
      font-family: 'JetBrains Mono', ui-monospace, monospace; letter-spacing: 0.01em;
    }
    .meta code { font-size: 12px; }
    .status-live { min-height: 1.4em; color: var(--muted); }
    .support-list {
      list-style: none; padding: 0; margin: 20px 0 0;
      display: grid; gap: 8px;
      border-top: 1px solid var(--border); padding-top: 20px;
      color: var(--muted); font-size: 13.5px;
    }
    .support-list li { position: relative; padding-left: 18px; }
    .support-list li::before {
      content: "›"; position: absolute; left: 0; top: 0;
      color: var(--accent); font-family: 'JetBrains Mono', monospace;
    }
    .notice {
      margin-top: 20px; padding: 16px 18px; border-radius: 12px;
      border: 1px solid var(--border);
      background: rgba(0,0,0,0.25);
    }
    .notice-title { margin: 0 0 6px; font-weight: 600; color: var(--ink-strong); font-size: 14px; }
    .notice p { margin: 0 0 4px; font-size: 14px; color: var(--muted); }
    .notice.success { border-color: rgba(163,176,148,0.28); }
    .notice.success .notice-title { color: var(--success); }
    .notice.warn { border-color: rgba(224,155,125,0.3); }
    .notice.warn .notice-title { color: var(--warn); }
    .client-card {
      display: flex; align-items: center; gap: 16px;
      padding: 18px; margin: 4px 0 20px;
      border-radius: 14px;
      background: rgba(0,0,0,0.22); border: 1px solid var(--border);
    }
    .client-logo {
      width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0;
      object-fit: cover; background: rgba(212,196,168,0.06);
      border: 1px solid var(--border);
    }
    .client-logo-fallback {
      display: flex; align-items: center; justify-content: center;
      font-family: 'Instrument Serif', Georgia, serif; font-size: 22px; color: var(--accent);
    }
    .client-meta { display: grid; gap: 4px; min-width: 0; }
    .client-name {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 19px; letter-spacing: -0.01em; color: var(--ink-strong);
      margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .client-sub { margin: 0; font-size: 13.5px; color: var(--muted); }
    .scope-card {
      padding: 18px; border-radius: 14px; margin: 4px 0 22px;
      background: rgba(0,0,0,0.22); border: 1px solid var(--border);
    }
    .scope-list { list-style: none; padding: 0; margin: 0 0 14px; display: grid; gap: 10px; }
    .scope-row { display: grid; gap: 4px; }
    .scope-code {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 11.5px; color: var(--accent);
      background: rgba(212,196,168,0.1); padding: 2px 6px; border-radius: 6px;
      justify-self: start; letter-spacing: 0.02em;
    }
    .scope-human { color: var(--ink); font-size: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
    .actions .btn-primary, .actions .btn-secondary { flex: 1; min-width: 140px; }
    .status-list { margin-top: 20px; display: grid; gap: 10px; }
    .status-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px;
      background: rgba(0,0,0,0.22);
    }
    .status-key { color: var(--muted); font-size: 13.5px; }
    .status-val {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 12px; color: var(--accent);
      background: rgba(212,196,168,0.1); padding: 2px 8px; border-radius: 6px;
    }
    code {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 12.5px; background: rgba(212,196,168,0.06);
      padding: 2px 6px; border-radius: 6px; color: var(--ink);
    }
    footer.brand-footer {
      max-width: 680px; margin: 0 auto; width: 100%;
      padding: 24px; text-align: center;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase;
      color: var(--faint);
    }
    footer.brand-footer a { color: var(--muted); text-decoration: none; }
    footer.brand-footer a:hover { color: var(--ink); }
  </style>
</head>
<body>
  <div class="shell">
    <header class="brand">
      <span class="brand-mark">${FLUENT_LOGO_SVG}</span>
      <span class="brand-wordmark">Fluent</span>
    </header>
    <main>
      <section class="panel">${input.body}</section>
    </main>
    <footer class="brand-footer">
      Fluent · <a href="https://meetfluent.app">meetfluent.app</a>
    </footer>
  </div>
</body>
</html>`;
}

function normalizeCompatibilityRoute(pathname: string): BetterAuthCompatibilityRoute | null {
  switch (pathname) {
    case '/authorize':
    case '/register':
    case '/token':
    case '/.well-known/oauth-authorization-server':
    case '/.well-known/openid-configuration':
    case '/.well-known/oauth-protected-resource':
      return pathname;
    default:
      return null;
  }
}

async function proxyBetterAuthRequest(
  request: Request,
  env: CloudRuntimeEnv,
  pathname: string,
): Promise<Response> {
  const targetUrl = new URL(request.url);
  targetUrl.pathname = pathname;
  const proxiedRequest = new Request(targetUrl.toString(), request);
  return handleBetterAuthApiRequest(proxiedRequest, env);
}

function buildProtectedResourceMetadata(request: Request, env: CloudRuntimeEnv) {
  const baseUrl = resolveBetterAuthBaseUrl(request, env);
  const resource = `${new URL(request.url).origin}/mcp`;
  return {
    authorization_servers: [`${baseUrl}/api/auth`],
    bearer_methods_supported: ['header'],
    jwks_uri: `${baseUrl}/api/auth/jwks`,
    resource,
    resource_documentation: `${baseUrl}/sign-in`,
    scopes_supported: [...FLUENT_SUPPORTED_SCOPES],
  };
}

async function rewriteMetadataResponse(request: Request, response: Response): Promise<Response> {
  const body = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return new Response(body, {
      headers: response.headers,
      status: response.status,
    });
  }

  const origin = new URL(request.url).origin;
  rewriteMetadataUrl(parsed, 'authorization_endpoint', origin, '/authorize');
  rewriteMetadataUrl(parsed, 'token_endpoint', origin, '/token');
  rewriteMetadataUrl(parsed, 'registration_endpoint', origin, '/register');
  return json(parsed, response.status);
}

function rewriteMetadataUrl(
  payload: Record<string, unknown>,
  key: string,
  origin: string,
  pathname: string,
): void {
  if (typeof payload[key] !== 'string') {
    return;
  }

  const current = payload[key] as string;
  try {
    const url = new URL(current);
    if (url.origin === origin) {
      payload[key] = `${origin}${pathname}`;
    }
  } catch {
    payload[key] = `${origin}${pathname}`;
  }
}

function jwtPayloadToAuthProps(payload: JWTPayload, accessToken: string): FluentAuthProps {
  const record = payload as JWTPayload & Record<string, unknown>;
  const scope = typeof record.scope === 'string'
    ? record.scope
        .split(' ')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  return {
    accessToken,
    email: typeof record.email === 'string' ? record.email : undefined,
    login: typeof record.login === 'string' ? record.login : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    oauthClientId:
      typeof record.client_id === 'string'
        ? record.client_id
        : typeof record.azp === 'string'
          ? record.azp
          : undefined,
    oauthClientName: typeof record.client_name === 'string' ? record.client_name : undefined,
    profileId: typeof record.profileId === 'string' ? record.profileId : undefined,
    scope,
    tenantId: typeof record.tenantId === 'string' ? record.tenantId : undefined,
    userId:
      typeof record.userId === 'string'
        ? record.userId
        : typeof record.sub === 'string'
          ? record.sub
          : undefined,
  };
}

function createBearerAuthErrorResponse(
  request: Request,
  description: string,
  resourceOrigin: string,
  requiredScopes: readonly string[],
): Response {
  const resourceMetadataUrl = `${resourceOrigin}/.well-known/oauth-protected-resource`;
  const headerParts = [
    'Bearer realm="OAuth"',
    `resource_metadata="${escapeHtml(resourceMetadataUrl)}"`,
    'error="invalid_token"',
    `error_description="${escapeHtml(description)}"`,
  ];
  if (requiredScopes.length) {
    headerParts.push(`scope="${escapeHtml(requiredScopes.join(' '))}"`);
  }
  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description: description,
    }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'WWW-Authenticate': headerParts.join(', '),
      },
      status: 401,
    },
  );
}

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() || null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    status,
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  });
}
