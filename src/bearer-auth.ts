import type { FluentAuthProps } from './auth';
import type { AppEnv, OAuthAppEnv } from './config';

export interface BearerAuthSuccess {
  mode: 'local' | 'oauth';
  props: FluentAuthProps;
}

export interface BearerAuthOptions {
  localBearerToken?: string | null;
  localScopes?: string[];
  realm?: string;
  request: Request;
  requiredScopes?: readonly string[];
  resourceMetadataUrl?: string | null;
}

export async function authenticateBearerRequest(
  env: AppEnv | OAuthAppEnv,
  options: BearerAuthOptions,
): Promise<BearerAuthSuccess | Response | null> {
  const presentedToken = parseBearerToken(options.request.headers.get('authorization'));
  if (!presentedToken) {
    return null;
  }

  if (hasOAuthProvider(env)) {
    const token = await env.OAUTH_PROVIDER.unwrapToken<Record<string, unknown>>(presentedToken);
    if (!token) {
      return createBearerAuthErrorResponse({
        code: 'invalid_token',
        description: 'Invalid access token',
        realm: options.realm,
        resourceMetadataUrl: options.resourceMetadataUrl,
      });
    }

    const audienceValues = Array.isArray(token.audience)
      ? token.audience
      : token.audience
        ? [token.audience]
        : [];
    if (
      audienceValues.length > 0 &&
      !audienceValues.some((audience) => typeof audience === 'string' && audienceMatchesResourceServer(options.request.url, audience))
    ) {
      return createBearerAuthErrorResponse({
        code: 'invalid_token',
        description: 'Invalid audience',
        realm: options.realm,
        resourceMetadataUrl: options.resourceMetadataUrl,
      });
    }

    const props = normalizeAuthProps({
      accessToken: presentedToken,
      rawProps: token.grant?.props,
      rawScopes: token.scope,
    });
    if (options.requiredScopes?.length && !hasAnyScope(props.scope, options.requiredScopes)) {
      return createBearerAuthErrorResponse({
        code: 'insufficient_scope',
        description: `This route requires one of: ${options.requiredScopes.join(', ')}`,
        realm: options.realm,
        requiredScopes: options.requiredScopes,
        resourceMetadataUrl: options.resourceMetadataUrl,
        status: 403,
      });
    }

    return {
      mode: 'oauth',
      props,
    };
  }

  const localBearerToken = options.localBearerToken?.trim() || '';
  if (!localBearerToken || presentedToken !== localBearerToken) {
    return createBearerAuthErrorResponse({
      code: 'invalid_token',
      description: 'Invalid access token',
      realm: options.realm,
      resourceMetadataUrl: options.resourceMetadataUrl,
    });
  }

  const props = normalizeAuthProps({
    accessToken: presentedToken,
    rawProps: {
      oauthClientId: 'fluent-oss',
      oauthClientName: 'Fluent OSS',
      scope: options.localScopes ?? [],
    },
    rawScopes: options.localScopes,
  });
  if (options.requiredScopes?.length && !hasAnyScope(props.scope, options.requiredScopes)) {
    return createBearerAuthErrorResponse({
      code: 'insufficient_scope',
      description: `This route requires one of: ${options.requiredScopes.join(', ')}`,
      realm: options.realm,
      requiredScopes: options.requiredScopes,
      resourceMetadataUrl: options.resourceMetadataUrl,
      status: 403,
    });
  }

  return {
    mode: 'local',
    props,
  };
}

export function audienceMatchesResourceServer(resourceServerUrl: string, audienceValue: string): boolean {
  try {
    const resource = new URL(resourceServerUrl);
    const audience = new URL(audienceValue);
    if (resource.origin !== audience.origin) {
      return false;
    }
    if (audience.pathname === '/' || audience.pathname === '') {
      return true;
    }
    return resource.pathname === audience.pathname || resource.pathname.startsWith(`${audience.pathname}/`);
  } catch {
    return false;
  }
}

export function createBearerAuthErrorResponse(input: {
  code: 'insufficient_scope' | 'invalid_token';
  description: string;
  realm?: string;
  requiredScopes?: readonly string[];
  resourceMetadataUrl?: string | null;
  status?: number;
}): Response {
  const status = input.status ?? (input.code === 'insufficient_scope' ? 403 : 401);
  const headers = new Headers({
    'content-type': 'application/json',
    'WWW-Authenticate': buildBearerAuthenticateHeader(input),
  });
  return new Response(
    JSON.stringify({
      error: input.code,
      error_description: input.description,
    }),
    {
      status,
      headers,
    },
  );
}

function buildBearerAuthenticateHeader(input: {
  code: 'insufficient_scope' | 'invalid_token';
  description: string;
  realm?: string;
  requiredScopes?: readonly string[];
  resourceMetadataUrl?: string | null;
}): string {
  const parts = [`Bearer realm="${escapeAuthValue(input.realm ?? 'OAuth')}"`, `error="${input.code}"`];
  if (input.resourceMetadataUrl) {
    parts.push(`resource_metadata="${escapeAuthValue(input.resourceMetadataUrl)}"`);
  }
  if (input.description) {
    parts.push(`error_description="${escapeAuthValue(input.description)}"`);
  }
  if (input.code === 'insufficient_scope' && input.requiredScopes?.length) {
    parts.push(`scope="${escapeAuthValue(input.requiredScopes.join(' '))}"`);
  }
  return parts.join(', ');
}

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() || null;
}

function hasOAuthProvider(env: AppEnv | OAuthAppEnv): env is OAuthAppEnv {
  return typeof (env as OAuthAppEnv).OAUTH_PROVIDER?.unwrapToken === 'function';
}

function normalizeAuthProps(input: {
  accessToken: string;
  rawProps: unknown;
  rawScopes: unknown;
}): FluentAuthProps {
  const props = (input.rawProps && typeof input.rawProps === 'object' && !Array.isArray(input.rawProps)
    ? input.rawProps
    : {}) as Record<string, unknown>;
  const scopes = normalizeScopes(props.scope ?? input.rawScopes);
  return {
    accessToken: input.accessToken,
    email: typeof props.email === 'string' ? props.email : undefined,
    login: typeof props.login === 'string' ? props.login : undefined,
    name: typeof props.name === 'string' ? props.name : undefined,
    oauthClientId: typeof props.oauthClientId === 'string' ? props.oauthClientId : undefined,
    oauthClientName: typeof props.oauthClientName === 'string' ? props.oauthClientName : undefined,
    scope: scopes,
  };
}

function normalizeScopes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function hasAnyScope(grantedScopes: string[] | undefined, requiredScopes: readonly string[]): boolean {
  const granted = grantedScopes ?? [];
  return requiredScopes.some((scope) => granted.includes(scope));
}

function escapeAuthValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
