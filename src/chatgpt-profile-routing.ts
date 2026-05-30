import type { FluentAuthProps } from './auth';

export type FluentRuntimeProfile = 'chatgpt_app' | 'full';

export const CHATGPT_MCP_PATHS = ['/mcp/chatgpt', '/mcp/chatgpt-v2'] as const;

export function resolveMcpRuntimeProfileForRequest(
  pathname: string,
  authProps?: Pick<FluentAuthProps, 'oauthClientName' | 'oauthClientRedirectUris'>,
): FluentRuntimeProfile {
  if (isChatGptMcpPath(pathname)) {
    return 'chatgpt_app';
  }
  return isChatGptOAuthClient(authProps) ? 'chatgpt_app' : 'full';
}

export function isChatGptMcpPath(pathname: string): boolean {
  return CHATGPT_MCP_PATHS.includes(pathname.replace(/\/$/, '') as (typeof CHATGPT_MCP_PATHS)[number]);
}

export function isChatGptOAuthClient(
  authProps?: Pick<FluentAuthProps, 'oauthClientName' | 'oauthClientRedirectUris'>,
): boolean {
  const clientName = authProps?.oauthClientName?.trim().toLowerCase() ?? '';
  if (clientName === 'chatgpt' || clientName.includes('chatgpt') || clientName.includes('openai')) {
    return true;
  }

  return (authProps?.oauthClientRedirectUris ?? []).some((uri) => isChatGptConnectorRedirectUri(uri));
}

function isChatGptConnectorRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.hostname === 'chatgpt.com' && parsed.pathname.startsWith('/connector/oauth/');
  } catch {
    return false;
  }
}
