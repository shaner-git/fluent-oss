import { getFluentAuthProps } from './auth';

export const FLUENT_OSS_DEFAULT_TENANT_ID = 'primary';
export const FLUENT_OSS_DEFAULT_PROFILE_ID = 'owner';
export const FLUENT_PRIMARY_TENANT_ID = FLUENT_OSS_DEFAULT_TENANT_ID;
export const FLUENT_OWNER_PROFILE_ID = FLUENT_OSS_DEFAULT_PROFILE_ID;

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
  const requestedTenantId = normalizeIdentityPart(props.tenantId);
  const requestedProfileId = normalizeIdentityPart(props.profileId);
  if (props.identityRequired && (!requestedTenantId || !requestedProfileId)) {
    throw new Error('Hosted Better Auth requests must carry explicit tenantId and profileId identity.');
  }
  const tenantId = requestedTenantId ?? FLUENT_OSS_DEFAULT_TENANT_ID;
  const profileId = requestedProfileId ?? FLUENT_OSS_DEFAULT_PROFILE_ID;
  const userId = normalizeIdentityPart(props.userId) ?? normalizeIdentityPart(props.login);

  return {
    email: normalizeIdentityPart(props.email),
    login: normalizeIdentityPart(props.login),
    name: normalizeIdentityPart(props.name),
    profileId,
    source:
      tenantId === FLUENT_OSS_DEFAULT_TENANT_ID && profileId === FLUENT_OSS_DEFAULT_PROFILE_ID
        ? 'legacy-default'
        : 'request',
    tenantId,
    userId,
  };
}

function normalizeIdentityPart(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
