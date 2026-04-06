import { AsyncLocalStorage } from 'node:async_hooks';

export const FLUENT_MEALS_READ_SCOPE = 'meals:read';
export const FLUENT_MEALS_WRITE_SCOPE = 'meals:write';
export const FLUENT_HEALTH_READ_SCOPE = 'health:read';
export const FLUENT_HEALTH_WRITE_SCOPE = 'health:write';
export const FLUENT_STYLE_READ_SCOPE = 'style:read';
export const FLUENT_STYLE_WRITE_SCOPE = 'style:write';
export const FLUENT_SUPPORTED_SCOPES = [
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  FLUENT_HEALTH_READ_SCOPE,
  FLUENT_HEALTH_WRITE_SCOPE,
  FLUENT_STYLE_READ_SCOPE,
  FLUENT_STYLE_WRITE_SCOPE,
] as const;

export interface FluentAuthProps {
  accessToken?: string;
  email?: string;
  login?: string;
  name?: string;
  oauthClientId?: string;
  oauthClientName?: string;
  scope?: string[];
}

const authContextStorage = new AsyncLocalStorage<FluentAuthProps>();
let mcpAuthContextReader: (() => { props?: unknown } | undefined) | undefined;

export interface MutationProvenance {
  actorEmail: string | null;
  actorName: string | null;
  confidence: number | null;
  scopes: string[];
  sessionId: string | null;
  sourceAgent: string;
  sourceSkill: string | null;
  sourceType: string;
}

export function getFluentAuthProps(): FluentAuthProps {
  const override = authContextStorage.getStore();
  if (override) {
    return override;
  }
  const authContext = getMcpAuthContextSafe();
  return ((authContext?.props as FluentAuthProps | undefined) ?? {}) as FluentAuthProps;
}

export function runWithFluentAuthProps<T>(props: FluentAuthProps, callback: () => T): T {
  return authContextStorage.run(props, callback);
}

export function setFluentMcpAuthContextReader(reader: (() => { props?: unknown } | undefined) | undefined): void {
  mcpAuthContextReader = reader;
}

export function requireScope(scope: string): FluentAuthProps {
  const props = getFluentAuthProps();
  const grantedScopes = props.scope ?? [];
  if (!grantedScopes.includes(scope)) {
    throw new Error(`This operation requires the ${scope} scope.`);
  }
  return props;
}

export function requireAnyScope(scopes: readonly string[]): FluentAuthProps {
  const props = getFluentAuthProps();
  const grantedScopes = props.scope ?? [];
  if (!scopes.some((scope) => grantedScopes.includes(scope))) {
    throw new Error(
      `This operation requires one of the following scopes: ${scopes.join(', ')}.`,
    );
  }
  return props;
}

export function buildMutationProvenance(
  props: FluentAuthProps,
  input: {
    confidence?: number | null;
    session_id?: string | null;
    source_agent?: string | null;
    source_skill?: string | null;
    source_type?: string | null;
  },
): MutationProvenance {
  return {
    actorEmail: props.email ?? null,
    actorName: props.name ?? null,
    confidence: typeof input.confidence === 'number' ? input.confidence : null,
    scopes: props.scope ?? [],
    sessionId: input.session_id?.trim() || null,
    sourceAgent:
      input.source_agent?.trim() ||
      props.oauthClientName?.trim() ||
      props.oauthClientId?.trim() ||
      props.login?.trim() ||
      'unknown-client',
    sourceSkill: input.source_skill?.trim() || null,
    sourceType: input.source_type?.trim() || 'oauth-client',
  };
}

function getMcpAuthContextSafe(): { props?: unknown } | undefined {
  const testHook = (globalThis as typeof globalThis & {
    __fluentGetMcpAuthContext?: () => { props?: unknown } | undefined;
  }).__fluentGetMcpAuthContext;
  if (typeof testHook === 'function') {
    return testHook();
  }

  return mcpAuthContextReader?.();
}
