import type { FluentAuthProps } from './auth';

export type FluentRuntimeProfile = 'assistant_app' | 'chatgpt_app' | 'full';

export function resolveMcpRuntimeProfileForRequest(
  _pathname: string,
  authProps?: Pick<FluentAuthProps, 'oauthClientName' | 'oauthClientRedirectUris'>,
): FluentRuntimeProfile {
  void authProps;
  return 'assistant_app';
}

export function isChatGptMcpPath(pathname: string): boolean {
  void pathname;
  return false;
}

export function isAssistantMcpPath(pathname: string): boolean {
  void pathname;
  return false;
}

export function isProfiledMcpPath(pathname: string): boolean {
  void pathname;
  return false;
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
