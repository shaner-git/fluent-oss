import type { FluentAuthProps } from './auth';

export const PUBLIC_WRITE_RATE_LIMIT_MESSAGE = 'rate limit — try again shortly';
export const AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS = 30;

export interface FluentRateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export async function enforcePublicWriteRateLimit(
  limiter: FluentRateLimitBinding | undefined,
  authProps: Pick<FluentAuthProps, 'tenantId' | 'userId'>,
): Promise<void> {
  const key = authProps.userId?.trim() || authProps.tenantId?.trim();
  if (!limiter || !key) {
    return;
  }

  const result = await limiter.limit({ key });
  if (!result.success) {
    throw new Error(PUBLIC_WRITE_RATE_LIMIT_MESSAGE);
  }
}

export async function maybeRateLimitAuthRequest(
  request: Request,
  limiter: FluentRateLimitBinding | undefined,
): Promise<Response | null> {
  if (!limiter || !isHostedAuthRateLimitedRequest(request)) {
    return null;
  }

  const key = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown-client-ip';
  const result = await limiter.limit({ key });
  if (result.success) {
    return null;
  }

  return new Response('rate limit - try again shortly', {
    headers: {
      'retry-after': String(AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS),
    },
    status: 429,
  });
}

function isHostedAuthRateLimitedRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/authorize') {
    return true;
  }
  return request.method === 'POST' && (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/'));
}
