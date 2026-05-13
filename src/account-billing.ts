import { FLUENT_SUPPORTED_SCOPES, type FluentAuthProps } from './auth';
import { authenticateBearerRequest } from './bearer-auth';
import { getFluentCloudOnboardingRecord, type FluentCloudOnboardingRecord } from './cloud-onboarding';
import { FLUENT_SUPPORT_EMAIL } from './cloud-early-access';
import type { CloudRuntimeEnv, OAuthAppEnv } from './config';
import {
  calculateLapsedRetentionDeadline,
  calculateSubscriptionGraceDeadline,
  evaluateSubscriptionLifecycle,
} from './subscription-lifecycle';
import {
  lookupCurrentEntitlementForUser,
  type FluentEntitlementAccessState,
} from './stripe-entitlements';
import type { FluentDatabase } from './storage';
import { wrapCloudflareDatabase } from './storage';

export type AccountBillingStripeClient = {
  createCustomer(input: StripeCustomerCreateInput): Promise<StripeCustomer>;
  createCheckoutSession(input: StripeCheckoutSessionCreateInput): Promise<StripeCheckoutSession>;
  createPortalSession(input: StripePortalSessionCreateInput): Promise<StripePortalSession>;
};

type AccountApiContext = {
  db: FluentDatabase;
  env: CloudRuntimeEnv;
  request: Request;
  stripe?: AccountBillingStripeClient;
};

type AccountBillingPayload = {
  accountId?: unknown;
  cancelUrl?: unknown;
  currency?: unknown;
  email?: unknown;
  successUrl?: unknown;
  tenantId?: unknown;
  userId?: unknown;
};

type AccountApiIdentity = {
  accountId: string | null;
  email: string | null;
  tenantId: string | null;
  userId: string | null;
};

type StripeCustomerCreateInput = {
  email: string;
  metadata: Record<string, string>;
};

type StripeCheckoutSessionCreateInput = {
  cancelUrl: string;
  customer: string;
  metadata: Record<string, string>;
  priceId: string;
  successUrl: string;
};

type StripePortalSessionCreateInput = {
  customer: string;
  returnUrl: string;
};

type StripeCustomer = {
  id: string;
};

type StripeCheckoutSession = {
  id: string;
  url: string | null;
};

type StripePortalSession = {
  id: string;
  url: string | null;
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2026-02-25.clover';
const EARLY_ACCESS_TRIAL_DAYS = 7;

export async function maybeHandleAccountApiRequest(
  request: Request,
  env: OAuthAppEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isRoute =
    (request.method === 'POST' &&
      (url.pathname === '/account/billing/checkout' || url.pathname === '/account/billing/portal')) ||
    (request.method === 'GET' && url.pathname === '/account/status');
  if (!isRoute) {
    return null;
  }

  const auth = await authenticateAccountApiRequest(request, env);
  if (!auth) {
    return null;
  }
  if (auth instanceof Response) {
    return auth;
  }

  const db = wrapCloudflareDatabase(env.DB);
  if (url.pathname === '/account/status') {
    return handleAccountStatusForIdentity({
      db,
      env,
      identity: auth.identity,
      request,
      props: auth.props,
    });
  }
  if (url.pathname === '/account/billing/checkout') {
    return handleAccountBillingCheckoutRequest({ db, env, request });
  }
  return handleAccountBillingPortalRequest({ db, env, request });
}

export async function handleAccountBillingCheckoutRequest(context: AccountApiContext): Promise<Response> {
  const secretKey = context.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return json({ ok: false, code: 'billing_not_configured', error: 'Billing is not configured.' }, 503);
  }

  const payload = await readJsonPayload<AccountBillingPayload>(context.request);
  if (!payload.ok) {
    return json({ ok: false, code: 'invalid_json', error: 'Invalid JSON body.' }, 400);
  }

  const identity = identityFromPayload(payload.body);
  if (!identity.email && !identity.userId && !identity.tenantId) {
    return json({ ok: false, code: 'missing_identity', error: 'A Fluent account identity is required.' }, 400);
  }

  const account = await resolveKnownAccount(context.db, identity);
  if (!account) {
    return json({ ok: false, code: 'account_not_found', error: 'No Fluent account was found for checkout.' }, 404);
  }

  const email = account.email ?? identity.email;
  if (!email) {
    return json({ ok: false, code: 'missing_email', error: 'Checkout requires an account email.' }, 400);
  }

  const price = resolveEarlyAccessPrice(context.env, payload.body.currency);
  if (!price) {
    return json({ ok: false, code: 'billing_price_not_configured', error: 'Billing price is not configured.' }, 500);
  }

  const stripe = context.stripe ?? createStripeClient(secretKey);
  const metadata = buildStripeIdentityMetadata({
    accountId: identity.accountId,
    email,
    emailNormalized: account.emailNormalized,
    tenantId: account.tenantId ?? identity.tenantId,
    userId: account.userId ?? identity.userId,
  });

  let stripeCustomerId = account.stripeCustomerId ?? (await lookupStripeCustomerId(context.db, identity));
  if (!stripeCustomerId) {
    const customer = await stripe.createCustomer({
      email,
      metadata: {
        ...metadata,
        fluent_billing_source: 'fluent-mcp',
      },
    });
    stripeCustomerId = customer.id;
    await linkStripeCustomerToAccount(context.db, account, stripeCustomerId);
  }

  const urls = resolveCheckoutUrls(context.request, payload.body);
  const session = await stripe.createCheckoutSession({
    cancelUrl: urls.cancelUrl,
    customer: stripeCustomerId,
    metadata: {
      ...metadata,
      fluent_currency: price.currency,
    },
    priceId: price.priceId,
    successUrl: urls.successUrl,
  });

  if (!session.url) {
    return json({ ok: false, code: 'stripe_session_missing_url', error: 'Stripe did not return a checkout URL.' }, 502);
  }

  return json({ ok: true, currency: price.currency, url: session.url }, 201);
}

export async function handleAccountBillingPortalRequest(context: AccountApiContext): Promise<Response> {
  const secretKey = context.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return json({ ok: false, code: 'billing_not_configured', error: 'Billing is not configured.' }, 503);
  }

  const payload = await readJsonPayload<AccountBillingPayload>(context.request);
  if (!payload.ok) {
    return json({ ok: false, code: 'invalid_json', error: 'Invalid JSON body.' }, 400);
  }

  const identity = identityFromPayload(payload.body);
  if (!identity.email && !identity.userId && !identity.tenantId) {
    return json({ ok: false, code: 'missing_identity', error: 'A Fluent account identity is required.' }, 400);
  }

  const account = await resolveKnownAccount(context.db, identity);
  const stripeCustomerId = account?.stripeCustomerId ?? (await lookupStripeCustomerId(context.db, identity));
  if (!account || !stripeCustomerId) {
    return json({ ok: false, code: 'billing_account_not_found', error: 'No billing customer was found for this Fluent account.' }, 404);
  }

  const stripe = context.stripe ?? createStripeClient(secretKey);
  const session = await stripe.createPortalSession({
    customer: stripeCustomerId,
    returnUrl: meetFluentUrl('/billing'),
  });

  if (!session.url) {
    return json({ ok: false, code: 'stripe_session_missing_url', error: 'Stripe did not return a portal URL.' }, 502);
  }

  return json({ ok: true, url: session.url });
}

export async function handleAccountStatusForIdentity(input: {
  db: FluentDatabase;
  env: CloudRuntimeEnv;
  identity: AccountApiIdentity;
  props?: FluentAuthProps | null;
  request: Request;
}): Promise<Response> {
  const account = await resolveKnownAccount(input.db, input.identity);
  const entitlement = await lookupCurrentEntitlementForUser(input.db, input.identity);
  const lifecycle = evaluateSubscriptionLifecycle(account);
  const accessState = entitlementAccessToPublicAccess(entitlement?.accessState, lifecycle.access, account);
  return json({
    accessState,
    entitlement: {
      state: entitlementToPublicState(entitlement?.accessState, entitlement?.stripeStatus, account),
      summary: entitlement?.billingNotice ?? lifecycle.message,
      graceDeadline: calculateSubscriptionGraceDeadline(account),
      retentionDeadline: entitlement?.retentionEndsAt ?? calculateLapsedRetentionDeadline(account),
    },
    links: accountLinks(),
    supportEmail: FLUENT_SUPPORT_EMAIL,
  });
}

export async function buildChatGptSafeRuntimeEntitlement(
  db: FluentDatabase,
  input: { email?: string | null; tenantId?: string | null; userId?: string | null },
): Promise<{
  graceDeadline: string | null;
  retentionDeadline: string | null;
  state:
    | 'active'
    | 'trialing'
    | 'past_due_grace'
    | 'limited'
    | 'canceled_retention'
    | 'retention_expired'
    | 'suspended'
    | 'deleted'
    | 'pending'
    | 'unavailable';
  summary: string;
} | null> {
  const entitlement = await lookupCurrentEntitlementForUser(db, input);
  if (!entitlement) {
    return null;
  }
  return {
    graceDeadline: entitlement.graceEndsAt,
    retentionDeadline: entitlement.retentionEndsAt,
    state: entitlementToPublicState(entitlement.accessState, entitlement.stripeStatus, null),
    summary: entitlement.billingNotice ?? 'Your Fluent account status is controlled by the current runtime entitlement.',
  };
}

function createStripeClient(secretKey: string): AccountBillingStripeClient {
  async function post<T>(path: string, body: URLSearchParams): Promise<T> {
    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'stripe-version': STRIPE_API_VERSION,
      },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const error = asRecord(payload.error);
      throw new Error(normalizeText(error?.message) ?? `Stripe request failed with status ${response.status}.`);
    }
    return payload as T;
  }

  return {
    createCustomer(input) {
      const body = new URLSearchParams();
      body.set('email', input.email);
      setMetadata(body, input.metadata);
      return post<StripeCustomer>('/customers', body);
    },
    createCheckoutSession(input) {
      const body = new URLSearchParams();
      body.set('mode', 'subscription');
      body.set('customer', input.customer);
      body.set('line_items[0][price]', input.priceId);
      body.set('line_items[0][quantity]', '1');
      body.set('success_url', input.successUrl);
      body.set('cancel_url', input.cancelUrl);
      body.set('client_reference_id', input.metadata.fluent_account_id);
      body.set('subscription_data[trial_period_days]', String(EARLY_ACCESS_TRIAL_DAYS));
      for (const [key, value] of Object.entries(input.metadata)) {
        body.set(`subscription_data[metadata][${key}]`, value);
      }
      setMetadata(body, input.metadata);
      return post<StripeCheckoutSession>('/checkout/sessions', body);
    },
    createPortalSession(input) {
      const body = new URLSearchParams();
      body.set('customer', input.customer);
      body.set('return_url', input.returnUrl);
      return post<StripePortalSession>('/billing_portal/sessions', body);
    },
  };
}

async function authenticateAccountApiRequest(
  request: Request,
  env: OAuthAppEnv,
): Promise<{ identity: AccountApiIdentity; props?: FluentAuthProps | null } | Response | null> {
  const apiToken = env.FLUENT_ACCOUNT_API_TOKEN?.trim();
  const presentedApiToken = parseBearerToken(request.headers.get('authorization')) ?? request.headers.get('x-fluent-account-api-token')?.trim();
  if (apiToken && presentedApiToken === apiToken) {
    const payload = request.method === 'GET' ? new URL(request.url).searchParams : await request.clone().json().catch(() => ({}));
    return { identity: identityFromPayload(payload as AccountBillingPayload | URLSearchParams) };
  }

  const bearer = await authenticateBearerRequest(env, {
    request,
    requiredScopes: FLUENT_SUPPORTED_SCOPES,
  });
  if (!bearer) {
    return null;
  }
  if (bearer instanceof Response) {
    return bearer;
  }
  const props = bearer.props;
  return {
    identity: {
      accountId: null,
      email: props.email ?? null,
      tenantId: props.tenantId ?? null,
      userId: props.userId ?? null,
    },
    props,
  };
}

function identityFromPayload(payload: AccountBillingPayload | URLSearchParams): AccountApiIdentity {
  const get = (key: string) => payload instanceof URLSearchParams ? payload.get(key) : (payload as Record<string, unknown>)[key];
  return {
    accountId: normalizeText(get('accountId')),
    email: normalizeEmail(get('email')),
    tenantId: normalizeText(get('tenantId')),
    userId: normalizeText(get('userId')),
  };
}

async function resolveKnownAccount(
  db: FluentDatabase,
  identity: AccountApiIdentity,
): Promise<FluentCloudOnboardingRecord | null> {
  return getFluentCloudOnboardingRecord(db, {
    email: identity.email,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });
}

async function lookupStripeCustomerId(db: FluentDatabase, identity: AccountApiIdentity): Promise<string | null> {
  const clauses: string[] = [];
  const bindings: string[] = [];
  if (identity.userId) {
    clauses.push('user_id = ?');
    bindings.push(identity.userId);
  }
  if (identity.tenantId) {
    clauses.push('tenant_id = ?');
    bindings.push(identity.tenantId);
  }
  if (identity.email) {
    clauses.push('email_normalized = ?');
    bindings.push(identity.email.toLowerCase());
  }
  if (clauses.length === 0) {
    return null;
  }
  const row = await db
    .prepare(
      `SELECT stripe_customer_id
       FROM fluent_entitlements
       WHERE (${clauses.join(' OR ')}) AND stripe_customer_id IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .bind(...bindings)
    .first<{ stripe_customer_id: string | null }>();
  return normalizeText(row?.stripe_customer_id);
}

async function linkStripeCustomerToAccount(
  db: FluentDatabase,
  account: FluentCloudOnboardingRecord,
  stripeCustomerId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE fluent_cloud_onboarding
       SET stripe_customer_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE email_normalized = ?`,
    )
    .bind(stripeCustomerId, account.emailNormalized)
    .run();
}

function buildStripeIdentityMetadata(input: {
  accountId: string | null;
  email: string;
  emailNormalized: string;
  tenantId: string | null;
  userId: string | null;
}): Record<string, string> {
  return stripEmptyMetadata({
    email: input.email,
    email_normalized: input.emailNormalized,
    fluent_account_id: input.accountId ?? input.emailNormalized,
    fluent_email: input.email,
    fluent_onboarding_email: input.emailNormalized,
    tenant_id: input.tenantId,
    user_id: input.userId,
  });
}

function resolveCheckoutUrls(request: Request, payload: AccountBillingPayload): { cancelUrl: string; successUrl: string } {
  const successUrl = normalizeExternalMeetFluentUrl(payload.successUrl) ?? meetFluentUrl('/billing/success?session_id={CHECKOUT_SESSION_ID}');
  const cancelUrl = normalizeExternalMeetFluentUrl(payload.cancelUrl) ?? meetFluentUrl('/billing/cancel');
  return { cancelUrl, successUrl };
}

function resolveEarlyAccessPrice(env: CloudRuntimeEnv, currencyInput: unknown): { currency: 'cad' | 'usd'; priceId: string } | null {
  const currency = normalizeBillingCurrency(currencyInput);
  const priceId =
    currency === 'usd'
      ? env.STRIPE_PRICE_EARLY_ACCESS_USD?.trim()
      : env.STRIPE_PRICE_EARLY_ACCESS_CAD?.trim() || env.STRIPE_PRICE_EARLY_ACCESS?.trim();
  return priceId ? { currency, priceId } : null;
}

function accountLinks() {
  return {
    deletion: meetFluentUrl('/account/delete'),
    export: meetFluentUrl('/api/account/exports'),
    manageAccount: meetFluentUrl('/account'),
    billing: meetFluentUrl('/billing'),
    supportEmail: `mailto:${FLUENT_SUPPORT_EMAIL}`,
  };
}

function entitlementAccessToPublicAccess(
  entitlementAccess: FluentEntitlementAccessState | null | undefined,
  lifecycleAccess: ReturnType<typeof evaluateSubscriptionLifecycle>['access'],
  account: FluentCloudOnboardingRecord | null,
): 'active' | 'limited' | 'pending' | 'unavailable' {
  if (account) {
    if (
      lifecycleAccess === 'retention_expired' ||
      lifecycleAccess === 'suspended' ||
      lifecycleAccess === 'deleted'
    ) {
      return 'unavailable';
    }
    if (lifecycleAccess === 'blocked') return 'pending';
  }
  if (entitlementAccess === 'full_access' || entitlementAccess === 'billing_notice') return 'active';
  if (entitlementAccess === 'limited_access' || entitlementAccess === 'canceled_retention') return 'limited';
  if (!account) return 'unavailable';
  if (lifecycleAccess === 'full_access') return 'active';
  if (lifecycleAccess === 'limited_access') return 'limited';
  return 'unavailable';
}

function entitlementToPublicState(
  accessState: FluentEntitlementAccessState | null | undefined,
  stripeStatus: string | null | undefined,
  account: FluentCloudOnboardingRecord | null,
):
  | 'active'
  | 'trialing'
  | 'past_due_grace'
  | 'limited'
  | 'canceled_retention'
  | 'retention_expired'
  | 'suspended'
  | 'deleted'
  | 'pending'
  | 'unavailable' {
  if (account) {
    const lifecycle = evaluateSubscriptionLifecycle(account);
    if (lifecycle.access === 'retention_expired') return 'retention_expired';
    if (lifecycle.access === 'suspended') return 'suspended';
    if (lifecycle.access === 'deleted') return 'deleted';
    if (lifecycle.access === 'blocked') return 'pending';
  }
  if (accessState === 'full_access') {
    return stripeStatus === 'trialing' ? 'trialing' : 'active';
  }
  if (accessState === 'billing_notice') return 'past_due_grace';
  if (accessState === 'limited_access') return 'limited';
  if (accessState === 'canceled_retention') return 'canceled_retention';
  if (!account) return 'unavailable';
  switch (account.currentState) {
    case 'trialing':
    case 'active':
    case 'past_due_grace':
    case 'canceled_retention':
      return account.currentState;
    case 'limited_access':
      return 'limited';
    case 'checkout_required':
    case 'account_created':
    case 'invite_accepted':
    case 'invited':
    case 'waitlisted':
      return 'pending';
    case 'deletion_requested':
    case 'suspended':
      return 'suspended';
    case 'deleted':
      return 'deleted';
    default:
      return 'unavailable';
  }
}

function setMetadata(body: URLSearchParams, metadata: Record<string, string>) {
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
  }
}

function stripEmptyMetadata(input: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())));
}

function normalizeExternalMeetFluentUrl(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.hostname === 'meetfluent.app' ? url.toString() : null;
  } catch {
    return null;
  }
}

function meetFluentUrl(pathname: string): string {
  return new URL(pathname, 'https://meetfluent.app').toString();
}

function normalizeBillingCurrency(value: unknown): 'cad' | 'usd' {
  return typeof value === 'string' && value.trim().toLowerCase() === 'usd' ? 'usd' : 'cad';
}

function normalizeEmail(value: unknown): string | null {
  const text = normalizeText(value)?.toLowerCase() ?? null;
  return text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseBearerToken(headerValue: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(headerValue?.trim() ?? '');
  return match?.[1]?.trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function readJsonPayload<T>(request: Request): Promise<{ ok: true; body: T } | { ok: false }> {
  try {
    return { ok: true, body: (await request.json()) as T };
  } catch {
    return { ok: false };
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });
}
