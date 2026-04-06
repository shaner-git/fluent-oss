import { FLUENT_MEALS_READ_SCOPE, FLUENT_STYLE_READ_SCOPE } from './auth';
import { authenticateBearerRequest } from './bearer-auth';
import { coreBindingsFromCloudEnv, type AppEnv, type CoreRuntimeBindings, type OAuthAppEnv } from './config';
import { StyleService } from './domains/style/service';
import { verifyStyleImagePathSignature } from './domains/style/media';

export async function maybeHandleStyleImageRequest(request: Request, env: AppEnv | OAuthAppEnv): Promise<Response | null> {
  if (request.method !== 'GET') {
    return null;
  }

  const url = new URL(request.url);
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
    return serveStyleImage(env, photoId);
  }

  const expiresAt = url.searchParams.get('exp');
  const signature = url.searchParams.get('sig');
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
  });
  if (!valid) {
    return new Response('Invalid Style image signature.', {
      status: 403,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  return serveStyleImage(env, photoId);
}

async function serveStyleImage(env: AppEnv | OAuthAppEnv, photoId: string): Promise<Response> {
  const bindings = getBindings(env);
  const style = new StyleService(bindings.db);
  const asset = await style.getPhotoDeliveryAsset(photoId);
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

function getBindings(env: AppEnv | OAuthAppEnv): CoreRuntimeBindings {
  return 'OAUTH_PROVIDER' in env ? coreBindingsFromCloudEnv(env) : env;
}

function getImageDeliverySecret(env: AppEnv | OAuthAppEnv): string {
  const secret =
    ('IMAGE_DELIVERY_SECRET' in env ? env.IMAGE_DELIVERY_SECRET : undefined) ??
    ('COOKIE_ENCRYPTION_KEY' in env ? env.COOKIE_ENCRYPTION_KEY : undefined) ??
    ('imageDeliverySecret' in env ? env.imageDeliverySecret : undefined);
  return secret?.trim() || '';
}
