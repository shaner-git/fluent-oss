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
import {
  applyOperatorAccountDeletionAction,
  buildAccountDeletionPolicy,
  cancelAccountDeletion,
  confirmAccountDeletion,
  getAccountDeletionFlow,
  getAccountDeletionSupportLinks,
  requestAccountDeletion,
  type AccountDeletionActor,
  type AccountDeletionFlow,
  type AccountDeletionOperatorAction,
  type AccountDeletionRequestRecord,
} from './account-deletion';
import { coreBindingsFromCloudEnv, readConfig, type CloudRuntimeEnv, type OAuthAppEnv } from './config';
import {
  buildFluentCloudEarlyAccessMessage,
  buildFluentCloudAccessFailureDetails,
  createFluentCloudAccessFailurePayload,
  renderFluentCloudEarlyAccessPage,
  renderFluentCloudAccessFailurePage,
  FLUENT_CLOUD_WAITLIST_URL,
  FLUENT_OSS_AVAILABLE_URL,
  FLUENT_SUPPORT_EMAIL,
} from './cloud-early-access';
import {
  applyFluentCloudOperatorAction,
  fluentCloudOnboardingDescriptor,
  listFluentCloudOnboardingEvents,
  listFluentCloudOnboardingRecords,
  markFluentCloudClientConnected,
  markFluentCloudEmailVerified,
  recordFluentCloudOnboardingFailure,
  renderFluentCloudOnboardingOpsPage,
  type FluentCloudOnboardingState,
} from './cloud-onboarding';
import { hasHostedEmailDelivery, sendHostedMagicLinkEmail } from './hosted-email';
import { resolveHostedCloudAccess, resolveHostedCloudClientDecision } from './hosted-access-state';
import { escapeHeaderQuotedString } from './http-header';
import { createFluentMcpServer } from './mcp';
import { wrapCloudflareDatabase } from './storage';
import { ensureHostedUserProvisioned } from './hosted-identity';
import {
  createBillingPortalResponseForCurrentUser,
  reactivateCurrentUserAccount,
} from './subscription-lifecycle';

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
  if (url.pathname === '/ops/cloud-onboarding') {
    return handleCloudOnboardingOpsRequest(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/ops/better-auth/migrate') {
    return handleBetterAuthMigration(request, env);
  }

  if (request.method === 'POST' && url.pathname.startsWith('/ops/account-deletion/requests/')) {
    return handleAccountDeletionOpsRequest(request, env);
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

  if (request.method === 'GET' && url.pathname === '/account/delete') {
    return handleAccountDeletionPage(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/account/billing') {
    return handleAccountBillingPage(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/account/billing/portal') {
    return handleAccountBillingPortalRequest(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/account/reactivate') {
    return handleAccountReactivateRequest(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/account/delete/request') {
    return handleAccountDeletionAction(request, env, 'request');
  }

  if (request.method === 'POST' && url.pathname === '/account/delete/confirm') {
    return handleAccountDeletionAction(request, env, 'confirm');
  }

  if (request.method === 'POST' && url.pathname === '/account/delete/cancel') {
    return handleAccountDeletionAction(request, env, 'cancel');
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
  if (url.pathname === '/mcp' || url.pathname === '/mcp/chatgpt' || compatibilityRoute) {
    if (!hasBetterAuthConfig(env)) {
      return betterAuthConfigErrorResponse(new Error('Better Auth is not configured.'));
    }
  }

  if (url.pathname === '/mcp' || url.pathname === '/mcp/chatgpt') {
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

  try {
    return await auth.handler(request);
  } catch (error) {
    return betterAuthRuntimeErrorResponse(request, error);
  }
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
  const earlyAccessResponse = await maybeCreateFluentCloudEarlyAccessPage(request, env, session, 'Sign in');
  if (earlyAccessResponse) {
    return earlyAccessResponse;
  }
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

  const earlyAccessResponse = await maybeCreateFluentCloudEarlyAccessPage(request, env, session, 'Authorize');
  if (earlyAccessResponse) {
    return earlyAccessResponse;
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

async function handleAccountDeletionPage(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch {
    return html(renderAuthUnavailablePage(env, 'Account deletion'), 503);
  }

  const session = await getBetterAuthSession(auth, request);
  if (!session?.user?.id) {
    return Response.redirect(buildSignInRedirectUrl(request.url), 302);
  }

  const db = wrapCloudflareDatabase(env.DB);
  const actor = accountDeletionActorFromSession(session);
  const flow = await getAccountDeletionFlow(db, actor);
  const accessResponse = await maybeDenyAccountDeletionForHostedAccount(request, env, session, flow, 'Account deletion');
  if (accessResponse) {
    return accessResponse;
  }
  return html(
    renderAccountDeletionPage({
      actionMessage: null,
      flow,
      origin: new URL(request.url).origin,
      session,
      support: getAccountDeletionSupportLinks(),
    }),
  );
}

async function handleAccountDeletionAction(
  request: Request,
  env: CloudRuntimeEnv,
  action: 'request' | 'confirm' | 'cancel',
): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch {
    return html(renderAuthUnavailablePage(env, 'Account deletion'), 503);
  }

  const session = await getBetterAuthSession(auth, request);
  if (!session?.user?.id) {
    return Response.redirect(buildSignInRedirectUrl(new URL(request.url).origin + '/account/delete'), 302);
  }

  const db = wrapCloudflareDatabase(env.DB);
  const actor = accountDeletionActorFromSession(session);
  const initialFlow = await getAccountDeletionFlow(db, actor);
  const accessResponse = await maybeDenyAccountDeletionForHostedAccount(request, env, session, initialFlow, 'Account deletion');
  if (accessResponse) {
    return accessResponse;
  }
  let flow: AccountDeletionFlow;
  let actionMessage: string;

  switch (action) {
    case 'request':
      flow = await requestAccountDeletion(db, actor);
      actionMessage =
        'Deletion requested. Review the summary below, then confirm if you want Fluent to continue with deletion.';
      break;
    case 'confirm':
      flow = await confirmAccountDeletion(db, actor);
      actionMessage =
        flow.currentRequest?.status === 'deletion_completed'
          ? 'Deletion completed. This account can no longer sign in to Fluent.'
          : flow.currentRequest?.status === 'manual_review_required'
            ? 'Deletion confirmed. Fluent has queued this account for operator review and manual completion.'
            : 'Deletion confirmed.';
      break;
    case 'cancel':
      flow = await cancelAccountDeletion(db, actor);
      actionMessage = 'Deletion cancelled. Fluent will keep the account active unless a new deletion request is submitted.';
      break;
  }

  return html(
    renderAccountDeletionPage({
      actionMessage,
      flow,
      origin: new URL(request.url).origin,
      session,
      support: getAccountDeletionSupportLinks(),
    }),
  );
}

async function handleAccountBillingPage(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch {
    return html(renderAuthUnavailablePage(env, 'Billing'), 503);
  }

  const session = await getBetterAuthSession(auth, request);
  if (!session?.user?.id) {
    return Response.redirect(buildSignInRedirectUrl(request.url), 302);
  }

  const accessResponse = await maybeDenyBillingForHostedAccount(request, env, session, 'Billing');
  if (accessResponse) {
    return accessResponse;
  }

  const portalUrl = env.FLUENT_BILLING_PORTAL_URL?.trim() || null;
  return html(
    renderAuthShell({
      title: 'Billing | Fluent',
      body: `
<h1 class="display">Manage Fluent billing</h1>
<p class="lede">You can update payment details, reactivate Fluent, or manage a canceled subscription during the retention window.</p>
<div class="actions">
  ${
    portalUrl
      ? `<a class="btn-primary" href="${escapeHtml(portalUrl)}">Open billing portal <span class="btn-arrow">→</span></a>`
      : '<p class="notice">Billing portal access is enabled for this account, but FLUENT_BILLING_PORTAL_URL is not configured yet. Contact support to reactivate or update billing.</p>'
  }
</div>`,
    }),
  );
}

async function handleAccountBillingPortalRequest(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch {
    return json({ error: 'Hosted auth is unavailable.' }, 503);
  }

  const session = await getBetterAuthSession(auth, request);
  if (!session?.user?.id) {
    return json({ error: 'Unauthorized' }, 401);
  }

  return createBillingPortalResponseForCurrentUser(request, env, wrapCloudflareDatabase(env.DB), {
    email: session.user.email ?? null,
    id: session.user.id,
  });
}

async function handleAccountReactivateRequest(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  let auth;
  try {
    auth = createBetterAuth(request, env);
  } catch {
    return json({ error: 'Hosted auth is unavailable.' }, 503);
  }

  const session = await getBetterAuthSession(auth, request);
  if (!session?.user?.id) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await reactivateCurrentUserAccount(wrapCloudflareDatabase(env.DB), {
      email: session.user.email ?? null,
      id: session.user.id,
    });
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to reactivate this account.' }, 403);
  }
}

async function maybeDenyAccountDeletionForHostedAccount(
  request: Request,
  env: CloudRuntimeEnv,
  session: BetterAuthSessionPayload,
  flow: AccountDeletionFlow,
  title: string,
): Promise<Response | null> {
  const user = session?.user;
  if (!user?.id || flow.subjectType !== 'cloud_account') {
    return null;
  }

  const accessDecision = await resolveHostedCloudAccess(wrapCloudflareDatabase(env.DB), env, {
    email: user.email ?? null,
    userId: user.id,
  });
  if (accessDecision.allowed) {
    return null;
  }

  const code = accessDecision.code ?? 'not_on_waitlist';
  const details = buildFluentCloudAccessFailureDetails(code, {
    email: user.email ?? null,
    title: `${title} | Fluent`,
  });
  return html(
    renderFluentCloudAccessFailurePage(code, {
      email: user.email ?? null,
      title: `${title} | Fluent`,
    }),
    details.status,
  );
}

async function maybeDenyBillingForHostedAccount(
  request: Request,
  env: CloudRuntimeEnv,
  session: BetterAuthSessionPayload,
  title: string,
): Promise<Response | null> {
  const user = session?.user;
  if (!user?.id) {
    return null;
  }

  const accessDecision = await resolveHostedCloudAccess(wrapCloudflareDatabase(env.DB), env, {
    email: user.email ?? null,
    userId: user.id,
  });
  if (accessDecision.allowed) {
    return null;
  }

  const code = accessDecision.code ?? 'not_on_waitlist';
  const details = buildFluentCloudAccessFailureDetails(code, {
    email: user.email ?? null,
    title: `${title} | Fluent`,
  });
  return html(
    renderFluentCloudAccessFailurePage(code, {
      email: user.email ?? null,
      title: `${title} | Fluent`,
    }),
    details.status,
  );
}

async function handleAccountDeletionOpsRequest(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  const token = env.ACCOUNT_DELETION_OPS_TOKEN?.trim();
  if (!token) {
    return json(
      {
        error:
          'Account deletion ops are disabled until ACCOUNT_DELETION_OPS_TOKEN is configured.',
      },
      503,
    );
  }

  if (parseBearerToken(request.headers.get('authorization')) !== token) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const match = /^\/ops\/account-deletion\/requests\/([^/]+)$/.exec(new URL(request.url).pathname);
  if (!match?.[1]) {
    return json({ error: 'Invalid account deletion request path.' }, 404);
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rawAction = typeof payload.action === 'string' ? payload.action.trim().toLowerCase() : '';
  if (!['complete', 'fail', 'cancel'].includes(rawAction)) {
    return json({ error: 'Expected action to be one of complete, fail, or cancel.' }, 400);
  }

  const db = wrapCloudflareDatabase(env.DB);
  const updated = await applyOperatorAccountDeletionAction(db, {
    action: rawAction as AccountDeletionOperatorAction,
    failureReason: typeof payload.failure_reason === 'string' ? payload.failure_reason : null,
    operatorName: typeof payload.operator_name === 'string' ? payload.operator_name : null,
    requestId: decodeURIComponent(match[1]),
  });
  if (!updated) {
    return json({ error: 'Account deletion request not found.' }, 404);
  }

  return json({
    request: updated,
  });
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
      validAudiences: [baseURL, `${baseURL}/`, `${baseURL}/mcp`, `${baseURL}/mcp/`, `${baseURL}/mcp/chatgpt`, `${baseURL}/mcp/chatgpt/`],
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
    const db = wrapCloudflareDatabase(env.DB);
    const deletionCode = await maybeResolveAccountDeletionFailureCode(db, {
      email: user.email ?? null,
      id: user.id,
      name: user.name ?? null,
      sessionId: typeof session?.session?.id === 'string' ? session.session.id : null,
    });
    if (deletionCode) {
      return { error: null, result: null };
    }

    const accessDecision = await resolveHostedCloudAccess(db, env, {
      email: user.email ?? null,
      userId: user.id,
    });
    if (!accessDecision.allowed) {
      return { error: null, result: null };
    }

    const result = await ensureHostedUserProvisioned(db, {
      email: user.email ?? null,
      id: user.id,
      name: user.name ?? null,
    }, {
      cloudAccess: accessDecision.provisioningSource,
    });
    await markFluentCloudEmailVerified(db, {
      email: user.email ?? null,
      note: 'Hosted Better Auth session established.',
      tenantId: result.tenantId,
      userId: user.id,
    });
    return {
      error: null,
      result,
    };
  } catch (error) {
    await recordFluentCloudOnboardingFailure(wrapCloudflareDatabase(env.DB), {
      code: 'hosted_provisioning_failed',
      email: user.email ?? null,
      message: error instanceof Error ? error.message : String(error),
      note: 'Hosted provisioning failed during sign-in.',
      stage: 'account_creation',
      userId: user.id,
    });
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

  const url = new URL(request.url);
  const route = url.pathname === '/mcp/chatgpt' ? '/mcp/chatgpt' : '/mcp';
  const server = createFluentMcpServer(coreBindingsFromCloudEnv(env), url.origin, {
    profile: route === '/mcp/chatgpt' ? 'chatgpt_app' : 'full',
  });
  const { createMcpHandler } = await import('agents/mcp');
  const handler = createMcpHandler(server, {
    authContext: { props: authResult as Record<string, unknown> },
    route,
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
    const authProps = jwtPayloadToAuthProps(payload, presented);
    const db = wrapCloudflareDatabase(env.DB);
    const clientDecision = await resolveHostedCloudClientDecision(db, request, authProps.oauthClientId);
    if (clientDecision.code) {
      return createFluentCloudEarlyAccessBearerResponse(request, resourceOrigin, clientDecision.code, {
        clientName: clientDecision.clientName ?? authProps.oauthClientName ?? authProps.oauthClientId,
        contractVersion: clientDecision.contractVersion,
        email: authProps.email,
      });
    }

    const accessDecision = await resolveHostedCloudAccess(db, env, {
      email: authProps.email,
      userId: authProps.userId,
    });
    if (!accessDecision.allowed && accessDecision.code) {
      return createFluentCloudEarlyAccessBearerResponse(request, resourceOrigin, accessDecision.code, {
        email: authProps.email,
      });
    }
    await markFluentCloudClientConnected(db, {
      clientId: authProps.oauthClientId,
      clientName: authProps.oauthClientName,
      email: authProps.email,
      note: 'Hosted client authenticated against Fluent MCP.',
      tenantId: authProps.tenantId,
      userId: authProps.userId,
    });

    const deletionCode = await maybeResolveAccountDeletionFailureCode(db, {
      email: authProps.email ?? null,
      id: authProps.userId ?? '',
      name: authProps.name ?? null,
      sessionId: null,
    });
    if (deletionCode) {
      return createFluentCloudEarlyAccessBearerResponse(request, resourceOrigin, deletionCode, {
        email: authProps.email,
      });
    }

    return authProps;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Invalid access token');
    if (message.toLowerCase().includes('token inactive') || message.toLowerCase().includes('token has expired')) {
      return createFluentCloudEarlyAccessBearerResponse(request, resourceOrigin, 'auth_expired');
    }
    return createBearerAuthErrorResponse(
      request,
      message,
      resourceOrigin,
      FLUENT_SUPPORTED_SCOPES,
    );
  }
}

async function handleCloudOnboardingOpsRequest(request: Request, env: CloudRuntimeEnv): Promise<Response> {
  const migrationToken = env.BETTER_AUTH_MIGRATION_TOKEN?.trim();
  if (!migrationToken) {
    return json(
      {
        error: 'Fluent onboarding ops are disabled until BETTER_AUTH_MIGRATION_TOKEN is configured.',
      },
      503,
    );
  }

  const presented = parseBearerToken(request.headers.get('authorization'));
  if (presented !== migrationToken) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = wrapCloudflareDatabase(env.DB);
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const stateParam = url.searchParams.get('state');
    const state = isCloudOnboardingState(stateParam) ? stateParam : null;
    const records = await listFluentCloudOnboardingRecords(db, {
      email: url.searchParams.get('email'),
      limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
      state,
    });
    const eventsByEmail = Object.fromEntries(
      await Promise.all(
        records.map(async (record) => [
          record.emailNormalized,
          await listFluentCloudOnboardingEvents(db, { email: record.emailNormalized }, 12),
        ]),
      ),
    ) as Record<string, Awaited<ReturnType<typeof listFluentCloudOnboardingEvents>>>;
    const wantsHtml = request.headers.get('accept')?.includes('text/html') ?? false;
    if (wantsHtml) {
      return html(
        renderFluentCloudOnboardingOpsPage({
          descriptor: fluentCloudOnboardingDescriptor(),
          eventsByEmail,
          records,
        }),
      );
    }
    return json({
      descriptor: fluentCloudOnboardingDescriptor(),
      eventsByEmail,
      records,
    });
  }

  if (request.method === 'POST') {
    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      actor_id?: string;
      actor_label?: string;
      actor_type?: 'operator' | 'support';
      code?: string;
      email?: string;
      message?: string;
      metadata?: unknown;
      note?: string;
      retry_after?: string;
      stage?: string;
      account_kind?: string;
      stripe_customer_id?: string;
      stripe_subscription_id?: string;
      support_tags?: string[] | string;
      ticket_ref?: string;
    };
    if (!payload.email?.trim()) {
      return json({ error: 'email is required.' }, 400);
    }
    if (!isCloudOnboardingAction(payload.action)) {
      return json({ error: 'Unsupported or missing action.' }, 400);
    }

    const record = await applyFluentCloudOperatorAction(db, {
      action: payload.action,
      actorId: payload.actor_id,
      actorLabel: payload.actor_label,
      actorType: payload.actor_type,
      accountKind: payload.account_kind,
      code: payload.code,
      email: payload.email,
      message: payload.message,
      metadata: payload.metadata,
      note: payload.note,
      retryAfter: payload.retry_after,
      stage: payload.stage,
      stripeCustomerId: payload.stripe_customer_id,
      stripeSubscriptionId: payload.stripe_subscription_id,
      supportTags: payload.support_tags,
      ticketRef: payload.ticket_ref,
    });
    const events = await listFluentCloudOnboardingEvents(db, { email: payload.email }, 12);
    return json({
      descriptor: fluentCloudOnboardingDescriptor(),
      events,
      record,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
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

  const next = normalizeInternalRedirectTarget(url.searchParams.get('next'));
  if (next) {
    return new URL(next, url.origin).toString();
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

function buildSignInRedirectUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  const next = `${url.pathname}${url.search}`;
  return `${url.origin}/sign-in?next=${encodeURIComponent(next)}`;
}

function accountDeletionActorFromSession(session: BetterAuthSessionPayload): AccountDeletionActor {
  if (!session?.user?.id) {
    throw new Error('Cannot build an account deletion actor without a signed-in Better Auth user.');
  }
  return {
    email: typeof session.user.email === 'string' ? session.user.email : null,
    id: session.user.id,
    name: typeof session.user.name === 'string' ? session.user.name : null,
    sessionId: typeof session.session?.id === 'string' ? session.session.id : null,
  };
}

function normalizeInternalRedirectTarget(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith('/')) {
    return null;
  }
  if (trimmed.startsWith('//')) {
    return null;
  }
  return trimmed;
}

async function maybeResolveAccountDeletionFailureCode(
  db: ReturnType<typeof wrapCloudflareDatabase>,
  actor: AccountDeletionActor,
): Promise<'account_deleted' | null> {
  if (!actor.id) {
    return null;
  }
  const flow = await getAccountDeletionFlow(db, actor);
  return flow.currentRequest?.status === 'deletion_completed' ? 'account_deleted' : null;
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
  const accessDecision = await resolveHostedCloudAccess(db, env, {
    email: typeof user.email === 'string' ? user.email : null,
    userId: user.id,
  });
  if (!accessDecision.allowed) {
    return {
      ...(typeof user.email === 'string' ? { email: user.email, login: user.email } : {}),
      ...(typeof user.name === 'string' ? { name: user.name } : {}),
      userId: user.id,
    };
  }

  const provisioning = accessDecision.needsProvisioning
    ? await ensureHostedUserProvisioned(db, {
        email: typeof user.email === 'string' ? user.email : null,
        id: user.id,
        name: typeof user.name === 'string' ? user.name : null,
      }, {
        cloudAccess: accessDecision.provisioningSource,
      })
    : {
        created: false,
        inviteId: null,
        profileId: accessDecision.profileId ?? 'owner',
        tenantId: accessDecision.tenantId ?? `tenant:better-auth:${user.id}`,
        waitlistEntryId: null,
      };

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
  const payload = createFluentCloudAccessFailurePayload('temporarily_unavailable');
  return json(
    {
      ...payload,
      detail: error instanceof Error ? error.message : 'Better Auth is not configured.',
    },
    503,
  );
}

function betterAuthRuntimeErrorResponse(request: Request, error: unknown): Response {
  const url = new URL(request.url);
  console.error('Better Auth request failed', {
    message: error instanceof Error ? error.message : String(error),
    method: request.method,
    pathname: url.pathname,
    stack: error instanceof Error ? error.stack : undefined,
  });

  return json(
    {
      error: 'hosted_auth_failed',
      error_description: 'Hosted authorization is temporarily unavailable.',
      detail: error instanceof Error ? error.message : String(error),
    },
    500,
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
<p class="lede">Fluent is in early access and open source. Approved accounts can sign in here today, and everyone else can request early access or explore the open-source runtime.</p>
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
  <li>Only approved early-access accounts can finish sign-in right now.</li>
  <li>Request early access at <a href="${escapeHtml(FLUENT_CLOUD_WAITLIST_URL)}">${escapeHtml(FLUENT_CLOUD_WAITLIST_URL)}</a>.</li>
  <li>Explore the open-source runtime at <a href="${escapeHtml(FLUENT_OSS_AVAILABLE_URL)}">${escapeHtml(FLUENT_OSS_AVAILABLE_URL)}</a>.</li>
  <li>Contact <a href="mailto:${escapeHtml(FLUENT_SUPPORT_EMAIL)}">${escapeHtml(FLUENT_SUPPORT_EMAIL)}</a> if you expected access.</li>
  <li>Open the sign-in link in this same browser. Links expire in 15 minutes.</li>
  <li>Need to delete a Fluent account later? Sign in first, then open <code>/account/delete</code>.</li>
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
<div class="notice soft">
  <p class="notice-title">What approving means</p>
  <p>Fluent stores your account, OAuth consent, and the Meals, Style, and Health data this client is allowed to read or update.</p>
  <p>Self-serve user exports are JSON files retained for 7 days. Provisioned-account deletion is user-initiated but operator-assisted today.</p>
  <p class="meta">Policy: <a href="https://meetfluent.app/privacy/">meetfluent.app/privacy</a></p>
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

function renderAccountDeletionPage(input: {
  actionMessage: string | null;
  flow: AccountDeletionFlow;
  origin: string;
  session: BetterAuthSessionPayload;
  support: ReturnType<typeof getAccountDeletionSupportLinks>;
}): string {
  const policy = buildAccountDeletionPolicy(input.flow.subjectType);
  const request = input.flow.currentRequest;
  const requestStatus = request?.status ?? 'no_request';
  const statusTone =
    requestStatus === 'deletion_completed'
      ? 'success'
      : requestStatus === 'deletion_cancelled'
        ? 'soft'
        : requestStatus === 'deletion_failed'
          ? 'warn'
          : requestStatus === 'manual_review_required'
            ? 'warn'
            : 'soft';
  const statusLabel = humanizeAccountDeletionStatus(request?.status ?? null);
  const signedInAs = escapeHtml(input.session?.user?.email ?? input.session?.user?.id ?? 'your account');
  const actionNotice = input.actionMessage
    ? `<div class="notice ${statusTone}"><p class="notice-title">${escapeHtml(statusLabel)}</p><p>${escapeHtml(input.actionMessage)}</p></div>`
    : '';
  const subjectLabel = input.flow.subjectType === 'waitlist_only' ? 'Early-access request account' : 'Provisioned Fluent account';
  const statusCard = `
<div class="client-card">
  <div class="client-logo client-logo-fallback">${input.flow.subjectType === 'waitlist_only' ? 'W' : 'C'}</div>
  <div class="client-meta">
    <p class="client-name">${escapeHtml(subjectLabel)}</p>
    <p class="client-sub">Signed in as <strong>${signedInAs}</strong></p>
    <p class="meta">Current status: <code>${escapeHtml(statusLabel)}</code></p>
  </div>
</div>`;

  const requestMeta = request
    ? `<div class="status-list">
  <div class="status-row"><span class="status-key">Request ID</span><code class="status-val">${escapeHtml(request.id)}</code></div>
  <div class="status-row"><span class="status-key">Timeline</span><span class="status-val">${escapeHtml(request.timelineSummary ?? policy.expectedTimeline)}</span></div>
  <div class="status-row"><span class="status-key">Self-serve ready</span><code class="status-val">${String(input.flow.selfServeReady)}</code></div>
  <div class="status-row"><span class="status-key">Latest update</span><span class="status-val">${escapeHtml(request.updatedAt ?? 'pending')}</span></div>
  ${
    request.manualReviewReason
      ? `<div class="status-row"><span class="status-key">Manual review</span><span class="status-val">${escapeHtml(request.manualReviewReason)}</span></div>`
      : ''
  }
  ${
    request.lastError
      ? `<div class="status-row"><span class="status-key">Last error</span><span class="status-val">${escapeHtml(request.lastError)}</span></div>`
      : ''
  }
</div>`
    : '';

  const deletedDataList = policy.deletedData.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
  const retentionList = policy.retentionExceptions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
  const clientEffectsList = policy.connectedClients.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');

  const actions = renderAccountDeletionActions(input.flow);
  const returnToSignIn = `${input.origin}/sign-in`;

  return renderAuthShell({
    body: `${actionNotice}
<p class="eyebrow">⟩ Fluent account deletion</p>
<h1 class="display">Delete your <span class="accent">Fluent</span> account</h1>
<p class="lede">This page handles both provisioned Fluent accounts and signed-in early-access request accounts. Fluent always records an audit entry, shows an explicit completion state, and calls out any retention exception before the request is done.</p>
${statusCard}
${requestMeta}
<div class="scope-card">
  <p class="eyebrow-sm">What gets deleted</p>
  <ul class="scope-list">${deletedDataList}</ul>
</div>
<div class="scope-card">
  <p class="eyebrow-sm">What may be retained</p>
  <ul class="scope-list">${retentionList}</ul>
</div>
<div class="scope-card">
  <p class="eyebrow-sm">Connected clients</p>
  <ul class="scope-list">${clientEffectsList}</ul>
  <p class="meta">Expected timeline: ${escapeHtml(policy.expectedTimeline)}</p>
</div>
${actions}
<ul class="support-list">
  <li>Waitlist-only deletions attempt to finish immediately after confirmation.</li>
  <li>Provisioned Fluent accounts fall back to operator review until the full self-serve data purge is ready.</li>
  <li>If deletion completes, connected clients lose OAuth access and must not expect Fluent to reconnect.</li>
  <li>Need Fluent access instead of deletion? Request early access at <a href="${escapeHtml(input.support.waitlistUrl)}">${escapeHtml(input.support.waitlistUrl)}</a>.</li>
  <li>Need a local alternative? Run Fluent yourself with the open-source runtime at <a href="${escapeHtml(input.support.ossUrl)}">${escapeHtml(input.support.ossUrl)}</a>.</li>
  <li>Questions or retention exceptions: <a href="mailto:${escapeHtml(input.support.supportEmail)}">${escapeHtml(input.support.supportEmail)}</a>.</li>
  <li>Sign-in page: <a href="${escapeHtml(returnToSignIn)}">${escapeHtml(returnToSignIn)}</a>.</li>
</ul>`,
    title: 'Account deletion | Fluent',
  });
}

function renderAccountDeletionActions(flow: AccountDeletionFlow): string {
  const request = flow.currentRequest;
  if (!request) {
    return `
<div class="actions">
  <form method="post" action="/account/delete/request">
    <button class="btn-primary" type="submit">Start deletion request <span class="btn-arrow">→</span></button>
  </form>
</div>`;
  }

  if (request.status === 'deletion_requested') {
    return `
<div class="actions actions-stack">
  <form method="post" action="/account/delete/confirm">
    <button class="btn-primary" type="submit">Confirm deletion <span class="btn-arrow">→</span></button>
  </form>
  <form method="post" action="/account/delete/cancel">
    <button class="btn-secondary" type="submit">Cancel request</button>
  </form>
</div>`;
  }

  if (request.status === 'deletion_pending' || request.status === 'manual_review_required') {
    return `
<div class="actions actions-stack">
  <form method="post" action="/account/delete/cancel">
    <button class="btn-secondary" type="submit">Cancel deletion</button>
  </form>
</div>`;
  }

  if (request.status === 'deletion_cancelled' || request.status === 'deletion_failed') {
    return `
<div class="actions">
  <form method="post" action="/account/delete/request">
    <button class="btn-primary" type="submit">Submit a new deletion request <span class="btn-arrow">→</span></button>
  </form>
</div>`;
  }

  return `
<div class="notice success">
  <p class="notice-title">Deletion completed</p>
  <p>Fluent recorded the final completion state for this request.</p>
</div>`;
}

function humanizeAccountDeletionStatus(status: AccountDeletionRequestRecord['status'] | null): string {
  switch (status) {
    case 'deletion_requested':
      return 'Deletion requested';
    case 'deletion_pending':
      return 'Deletion pending';
    case 'deletion_completed':
      return 'Deletion completed';
    case 'deletion_cancelled':
      return 'Deletion cancelled';
    case 'manual_review_required':
      return 'Manual review required';
    case 'deletion_failed':
      return 'Deletion failed';
    default:
      return 'No deletion request yet';
  }
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
    .notice.soft { border-color: rgba(212,196,168,0.2); }
    .notice.soft .notice-title { color: var(--accent); }
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
    .actions form { display: flex; flex: 1; margin: 0; }
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
    identityRequired: true,
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
    `resource_metadata="${escapeHeaderQuotedString(resourceMetadataUrl)}"`,
    'error="invalid_token"',
    `error_description="${escapeHeaderQuotedString(description)}"`,
  ];
  if (requiredScopes.length) {
    headerParts.push(`scope="${escapeHeaderQuotedString(requiredScopes.join(' '))}"`);
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

async function maybeCreateFluentCloudEarlyAccessPage(
  request: Request,
  env: CloudRuntimeEnv,
  session: BetterAuthSessionPayload,
  title: string,
): Promise<Response | null> {
  const user = session?.user;
  if (!user) {
    return null;
  }

  const db = wrapCloudflareDatabase(env.DB);
  const clientDecision = await resolveHostedCloudClientDecision(db, request, new URL(request.url).searchParams.get('client_id'));
  if (clientDecision.code) {
    const details = buildFluentCloudAccessFailureDetails(clientDecision.code, {
      clientName: clientDecision.clientName ?? new URL(request.url).searchParams.get('client_id'),
      contractVersion: clientDecision.contractVersion,
      title: `${title} | Fluent`,
    });
    return html(
      renderFluentCloudAccessFailurePage(clientDecision.code, {
        clientName: clientDecision.clientName ?? new URL(request.url).searchParams.get('client_id'),
        contractVersion: clientDecision.contractVersion,
        title: `${title} | Fluent`,
      }),
      details.status,
    );
  }

  const accessDecision = await resolveHostedCloudAccess(db, env, {
    email: user.email ?? null,
    userId: user.id,
  });
  if (accessDecision.allowed || !accessDecision.code) {
    const deletionCode = await maybeResolveAccountDeletionFailureCode(db, {
      email: user.email ?? null,
      id: user.id,
      name: user.name ?? null,
      sessionId: typeof session.session?.id === 'string' ? session.session.id : null,
    });
    if (!deletionCode) {
      return null;
    }

    const deletedDetails = buildFluentCloudAccessFailureDetails(deletionCode, {
      email: user.email ?? null,
      title: `${title} | Fluent`,
    });
    return html(
      renderFluentCloudAccessFailurePage(deletionCode, {
        email: user.email ?? null,
        title: `${title} | Fluent`,
      }),
      deletedDetails.status,
    );
  }

  const details = buildFluentCloudAccessFailureDetails(accessDecision.code, {
    email: user.email ?? null,
    title: `${title} | Fluent`,
  });
  return html(
    renderFluentCloudAccessFailurePage(accessDecision.code, {
      email: user.email ?? null,
      title: `${title} | Fluent`,
    }),
    details.status,
  );
}

function createFluentCloudEarlyAccessBearerResponse(
  request: Request,
  resourceOrigin: string,
  code: Parameters<typeof buildFluentCloudAccessFailureDetails>[0],
  context: Parameters<typeof buildFluentCloudAccessFailureDetails>[1] = {},
): Response {
  const resourceMetadataUrl = `${resourceOrigin}/.well-known/oauth-protected-resource`;
  const details = buildFluentCloudAccessFailureDetails(code, context);
  const headerParts = [
    'Bearer realm="OAuth"',
    `resource_metadata="${escapeHeaderQuotedString(resourceMetadataUrl)}"`,
    `error="${details.oauthError}"`,
    `error_description="${escapeHeaderQuotedString(details.message)}"`,
  ];
  if (FLUENT_SUPPORTED_SCOPES.length) {
    headerParts.push(`scope="${escapeHeaderQuotedString(FLUENT_SUPPORTED_SCOPES.join(' '))}"`);
  }
  const payload = createFluentCloudAccessFailurePayload(code, context);
  return new Response(
    JSON.stringify(payload),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'WWW-Authenticate': headerParts.join(', '),
      },
      status: details.status,
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

function isCloudOnboardingState(value: string | null): value is FluentCloudOnboardingState {
  return (
    value === 'waitlisted' ||
    value === 'invited' ||
    value === 'invite_accepted' ||
    value === 'account_created' ||
    value === 'checkout_required' ||
    value === 'trialing' ||
    value === 'active' ||
    value === 'past_due_grace' ||
    value === 'limited_access' ||
    value === 'canceled_retention' ||
    value === 'suspended' ||
    value === 'deletion_requested' ||
    value === 'deleted'
  );
}

function isCloudOnboardingAction(value: string | undefined): value is Parameters<typeof applyFluentCloudOperatorAction>[1]['action'] {
  return (
    value === 'waitlist' ||
    value === 'invite' ||
    value === 'accept_invite' ||
    value === 'provision_reviewer_demo' ||
    value === 'mark_checkout_required' ||
    value === 'mark_trialing' ||
    value === 'mark_active' ||
    value === 'mark_past_due_grace' ||
    value === 'mark_limited_access' ||
    value === 'mark_canceled_retention' ||
    value === 'suspend' ||
    value === 'resume' ||
    value === 'request_deletion' ||
    value === 'cancel_deletion' ||
    value === 'delete' ||
    value === 'record_failure' ||
    value === 'clear_failure' ||
    value === 'escalate_support' ||
    value === 'resolve_support'
  );
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
