import { FLUENT_MEALS_READ_SCOPE, FLUENT_STYLE_READ_SCOPE, runWithFluentAuthProps } from './auth';
import { authenticateBearerRequest } from './bearer-auth';
import { coreBindingsFromCloudEnv, type AppEnv, type CloudRuntimeEnv, type CoreRuntimeBindings, type OAuthAppEnv } from './config';
import { StyleService } from './domains/style/service';
import {
  decodeStyleRemoteImageSourceUrl,
  decryptStyleImageOwnerToken,
  verifyStyleImagePathSignature,
  verifyStyleRemoteImageUrlSignature,
} from './domains/style/media';

const STYLE_REMOTE_IMAGE_MAX_BYTES = 5_000_000;

export async function maybeHandleStyleImageRequest(request: Request, env: AppEnv | CloudRuntimeEnv | OAuthAppEnv): Promise<Response | null> {
  if (request.method !== 'GET') {
    return null;
  }

  const url = new URL(request.url);
  if (url.pathname === '/images/style/remote/original') {
    return serveSignedRemoteStyleImage(request, env, url);
  }

  const match = /^\/images\/style\/([^/]+)\/(original)$/.exec(url.pathname);
  if (!match) {
    return null;
  }

  const photoId = decodeURIComponent(match[1] ?? '');
  const secret = getImageDeliverySecret(env);
  if (!secret) {
    return new Response('Style image delivery is not configured.', { status: 503 });
  }

  const bearerAuth = await authenticateBearerRequest(env, {
    localBearerToken: !('OAUTH_PROVIDER' in env) ? secret : null,
    localScopes: [FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE],
    realm: 'Fluent Style Media',
    request,
    requiredScopes: [FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE],
  });
  if (!(bearerAuth instanceof Response) && bearerAuth) {
    return runWithFluentAuthProps(bearerAuth.props, () => serveStyleImage(env, photoId));
  }

  const expiresAt = url.searchParams.get('exp');
  const signature = url.searchParams.get('sig');
  const legacyTenantId = url.searchParams.get('tid')?.trim() || null;
  const ownerToken = url.searchParams.get('owner')?.trim() || null;
  const signedTenantId = legacyTenantId ?? (ownerToken ? await decryptStyleImageOwnerToken({ secret, token: ownerToken }) : null);
  if (!expiresAt || !signature) {
    return (
      bearerAuth ??
      new Response(
        JSON.stringify({
          error: 'invalid_token',
          error_description: 'Missing bearer auth or fallback Style image signature.',
        }),
        {
          status: 401,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'private, no-store',
          },
        },
      )
    );
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return new Response('Expired Style image URL.', {
      status: 401,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const valid = await verifyStyleImagePathSignature({
    expiresAt,
    path: url.pathname,
    secret,
    signatureHex: signature,
    tenantId: signedTenantId,
  });
  if (!valid) {
    return new Response('Invalid Style image signature.', {
      status: 403,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  return serveStyleImage(env, photoId, signedTenantId);
}

async function serveSignedRemoteStyleImage(
  request: Request,
  env: AppEnv | CloudRuntimeEnv | OAuthAppEnv,
  url: URL,
): Promise<Response> {
  const secret = getImageDeliverySecret(env);
  if (!secret) {
    return new Response('Style remote image delivery is not configured.', { status: 503 });
  }

  const expiresAt = url.searchParams.get('exp');
  const signature = url.searchParams.get('sig');
  const encodedSourceUrl = url.searchParams.get('u');
  const sourceUrl = encodedSourceUrl ? decodeStyleRemoteImageSourceUrl(encodedSourceUrl) : null;
  if (!expiresAt || !signature || !sourceUrl) {
    return new Response('Missing remote Style image signature.', {
      status: 401,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return new Response('Expired remote Style image URL.', {
      status: 401,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const source = normalizePublicRemoteImageUrl(sourceUrl);
  if (!source) {
    return new Response('Unsupported remote Style image URL.', {
      status: 400,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const valid = await verifyStyleRemoteImageUrlSignature({
    expiresAt,
    secret,
    signatureHex: signature,
    sourceUrl: source.toString(),
  });
  if (!valid) {
    return new Response('Invalid remote Style image signature.', {
      status: 403,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  return fetchRemoteStyleImage(request, source);
}

async function fetchRemoteStyleImage(request: Request, source: URL): Promise<Response> {
  const upstream = await fetch(source.toString(), {
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      'user-agent': request.headers.get('user-agent') ?? 'Fluent Style image proxy',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });

  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response('Remote Style image redirects are not followed.', {
      status: 502,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
  if (!upstream.ok) {
    return new Response('Remote Style image fetch failed.', {
      status: 502,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!contentType.startsWith('image/')) {
    return new Response('Remote Style image did not return an image.', {
      status: 415,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const contentLength = Number(upstream.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > STYLE_REMOTE_IMAGE_MAX_BYTES) {
    return new Response('Remote Style image is too large.', {
      status: 413,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const body = await upstream.arrayBuffer();
  if (body.byteLength > STYLE_REMOTE_IMAGE_MAX_BYTES) {
    return new Response('Remote Style image is too large.', {
      status: 413,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  return new Response(body, {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': contentType,
    },
  });
}

async function serveStyleImage(env: AppEnv | CloudRuntimeEnv | OAuthAppEnv, photoId: string, tenantId?: string | null): Promise<Response> {
  const bindings = getBindings(env);
  const style = new StyleService(bindings.db);
  const asset = tenantId
    ? await style.getPhotoDeliveryAssetForTenant({ photoId, tenantId })
    : await style.getPhotoDeliveryAsset(photoId);
  if (!asset) {
    return new Response('Style image not found.', {
      status: 404,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const object = await bindings.artifacts.get(asset.r2Key);
  if (!object) {
    return new Response('Style image asset missing.', {
      status: 404,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const contentType = object.httpMetadata?.contentType || asset.mimeType || 'application/octet-stream';
  return new Response(await object.arrayBuffer(), {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': contentType,
    },
  });
}

function getBindings(env: AppEnv | CloudRuntimeEnv | OAuthAppEnv): CoreRuntimeBindings {
  if ('db' in env && 'artifacts' in env) {
    return env;
  }
  return coreBindingsFromCloudEnv(env);
}

function getImageDeliverySecret(env: AppEnv | CloudRuntimeEnv | OAuthAppEnv): string {
  const secret =
    ('IMAGE_DELIVERY_SECRET' in env ? env.IMAGE_DELIVERY_SECRET : undefined) ??
    ('COOKIE_ENCRYPTION_KEY' in env ? env.COOKIE_ENCRYPTION_KEY : undefined) ??
    ('imageDeliverySecret' in env ? env.imageDeliverySecret : undefined);
  return secret?.trim() || '';
}

function normalizePublicRemoteImageUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
