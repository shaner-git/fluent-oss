import { getFluentAuthProps } from './auth';

export const FLUENT_PRIMARY_TENANT_ID = 'primary';
export const FLUENT_OWNER_PROFILE_ID = 'owner';

export interface FluentIdentityContext {
  email: string | null;
  login: string | null;
  name: string | null;
  profileId: string;
  source: 'legacy-default' | 'request';
  tenantId: string;
  userId: string | null;
}

export function getFluentIdentityContext(): FluentIdentityContext {
  const props = getFluentAuthProps();
  const tenantId = normalizeIdentityPart(props.tenantId) ?? FLUENT_PRIMARY_TENANT_ID;
  const profileId = normalizeIdentityPart(props.profileId) ?? FLUENT_OWNER_PROFILE_ID;
  const userId = normalizeIdentityPart(props.userId) ?? normalizeIdentityPart(props.login);

  return {
    email: normalizeIdentityPart(props.email),
    login: normalizeIdentityPart(props.login),
    name: normalizeIdentityPart(props.name),
    profileId,
    source:
      tenantId === FLUENT_PRIMARY_TENANT_ID && profileId === FLUENT_OWNER_PROFILE_ID ? 'legacy-default' : 'request',
    tenantId,
    userId,
  };
}

function normalizeIdentityPart(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
