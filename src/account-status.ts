import type { FluentAuthProps } from './auth';
import { FLUENT_SUPPORT_EMAIL } from './cloud-early-access';
import { getFluentCloudOnboardingRecord } from './cloud-onboarding';
import type { CloudRuntimeEnv } from './config';
import { evaluateSubscriptionLifecycle } from './subscription-lifecycle';
import type { FluentDatabase } from './storage';

type AccountIdentity = { accountId?: string | null; email?: string | null; tenantId?: string | null; userId?: string | null };

export async function handleAccountStatusForIdentity(input: { db: FluentDatabase; env: CloudRuntimeEnv; identity: AccountIdentity; props?: FluentAuthProps | null; request: Request }): Promise<Response> {
  const account = await getFluentCloudOnboardingRecord(input.db, { email: input.identity.email ?? null, userId: input.identity.userId ?? null });
  const lifecycle = evaluateSubscriptionLifecycle(account);
  const state = publicState(account?.currentState ?? null, lifecycle.access);
  const origin = new URL(input.request.url).origin;
  return json({
    accessState: state === 'active' ? 'active' : state === 'limited' ? 'limited' : state === 'pending' ? 'pending' : 'unavailable',
    entitlement: { state, summary: lifecycle.message, graceDeadline: lifecycle.graceDeadline, retentionDeadline: lifecycle.retentionDeadline },
    links: { deletion: `${origin}/account/delete`, export: `${origin}/api/account/exports`, manageAccount: `${origin}/account`, supportEmail: `mailto:${FLUENT_SUPPORT_EMAIL}` },
    supportEmail: FLUENT_SUPPORT_EMAIL,
  });
}

export async function buildChatGptSafeRuntimeEntitlement(_db?: FluentDatabase, _input?: { email?: string | null; tenantId?: string | null; userId?: string | null }): Promise<null> { return null; }

function publicState(currentState: string | null, access: ReturnType<typeof evaluateSubscriptionLifecycle>['access']) {
  if (access === 'full_access') return 'active' as const;
  if (access === 'limited_access') return 'limited' as const;
  if (access === 'retention_expired') return 'retention_expired' as const;
  if (access === 'suspended') return 'suspended' as const;
  if (access === 'deleted') return 'deleted' as const;
  if (currentState && ['account_created', 'checkout_required', 'invite_accepted', 'invited', 'waitlisted'].includes(currentState)) return 'pending' as const;
  return 'unavailable' as const;
}

function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json; charset=utf-8' }, status }); }
