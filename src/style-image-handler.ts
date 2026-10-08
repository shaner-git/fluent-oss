import type { HostedRequestLifetime } from './auth-rejection-telemetry';
import { FLUENT_MEALS_READ_SCOPE, FLUENT_STYLE_READ_SCOPE, runWithFluentAuthProps } from './auth';
import { authenticateBearerRequest } from './bearer-auth';
import { coreBindingsFromCloudEnv, type AppEnv, type CloudRuntimeEnv, type CoreRuntimeBindings, type OAuthAppEnv } from './config';
import { StyleService } from './domains/style/service';
import {
  buildStyleDerivedImageAssetKey,
  decryptStyleRemoteImageSourceToken,
  decryptStyleImageOwnerToken,
  normalizeStyleRemoteImageSourceUrl,
  readStyleImageResponseBytes,
  STYLE_CLOSET_DETAIL_IMAGE,
  STYLE_HOSTED_FILE_MAX_BYTES,
  verifyStyleImagePathSignature,
  verifyStyleRemoteImageUrlSignature,
  STYLE_CLOSET_GRID_THUMBNAIL,
  type StyleImageVariant,
  validatedStyleRemoteImageMimeType,
} from './domains/style/media';

const STYLE_REMOTE_IMAGE_MAX_REDIRECTS = 3;
const STYLE_IMAGE_BROWSER_CACHE_CONTROL = 'private, max-age=600, immutable';
const STYLE_IMAGE_OWNED_EDGE_TTL_SECONDS = 60 * 60 * 24 * 30;
const STYLE_IMAGE_REMOTE_EDGE_TTL_SECONDS = 60 * 60;
// Remote delivery must not vary with the assistant host's browser/webview user agent. Use one stable,
// honest fetch identity for the server-side proxy (never a browser impersonation) and never forward
// caller-controlled header values upstream. A source that refuses it is treated as unavailable.
const STYLE_REMOTE_IMAGE_PROXY_USER_AGENT = 'FluentImageFetcher/1.0 (+https://meetfluent.app)';

export async function maybeHandleStyleImageRequest(
  request: Request,
  env: AppEnv | CloudRuntimeEnv | OAuthAppEnv,
  lifetime: HostedRequestLifetime | null,
): Promise<Response | null> {
  if (request.method !== 'GET') {
    return null;
  }

  const url = new URL(request.url);
  const remoteMatch = /^\/images\/style\/remote\/(detail|original|thumbnail)$/.exec(url.pathname);
  if (remoteMatch) {
    return serveSignedRemoteStyleImage(request, env, url, remoteMatch[1] as StyleImageVariant);
  }

  const match = /^\/images\/style\/([^/]+)\/(detail|original|thumbnail)$/.exec(url.pathname);
  if (!match) {
    return null;
  }

  const photoId = decodeURIComponent(match[1] ?? '');
  const variant = match[2] as StyleImageVariant;
  const secret = getImageDeliverySecret(env);
  if (!secret) {
    return new Response('Style image delivery is not configured.', { status: 503 });
  }

  const bearerAuth = await authenticateBearerRequest(env, {
    lifetime: lifetime ?? null,
    localBearerToken: !('OAUTH_PROVIDER' in env) ? secret : null,
    localScopes: [FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE],
    realm: 'Fluent Style Media',
    request,
    requiredScopes: [FLUENT_STYLE_READ_SCOPE, FLUENT_MEALS_READ_SCOPE],
  });
  if (!(bearerAuth instanceof Response) && bearerAuth) {
    return runWithFluentAuthProps(bearerAuth.props, () => serveStyleImage(env, photoId, null, variant, false, url.origin));
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

  return serveStyleImage(env, photoId, signedTenantId, variant, true, url.origin);
}

async function serveSignedRemoteStyleImage(
  request: Request,
  env: AppEnv | CloudRuntimeEnv | OAuthAppEnv,
  url: URL,
  variant: StyleImageVariant,
): Promise<Response> {
  const secret = getImageDeliverySecret(env);
  if (!secret) {
    return new Response('Style remote image delivery is not configured.', { status: 503 });
  }

  const expiresAt = url.searchParams.get('exp');
  const signature = url.searchParams.get('sig');
  const sourceToken = url.searchParams.get('u');
  const sourceUrl = sourceToken ? await decryptStyleRemoteImageSourceToken({ secret, token: sourceToken, variant }) : null;
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

  const source = normalizeStyleRemoteImageSourceUrl(sourceUrl);
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
    variant,
  });
  if (!valid) {
    return new Response('Invalid remote Style image signature.', {
      status: 403,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  // SSRF gate: only a runtime with strict public fetch (hosted Cloudflare) proxies a remote image.
  // A self-hosted Node runtime cannot recheck resolved addresses, so it sends the viewer to the
  // (signature-verified) source instead of fetching it server-side.
  if (!hasStrictPublicFetch(env)) {
    return new Response(null, {
      status: 302,
      headers: { 'cache-control': 'private, no-store', location: source.toString() },
    });
  }

  return fetchRemoteStyleImage(env, source, variant, true, url.origin);
}

// Hosted Workers environments (no core bindings) always run with global_fetch_strictly_public.
// Core bindings (local/self-hosted and tests) declare it explicitly.
function hasStrictPublicFetch(env: AppEnv | CloudRuntimeEnv | OAuthAppEnv): boolean {
  if ('db' in env && 'artifacts' in env) {
    return (env as CoreRuntimeBindings).strictPublicFetch === true;
  }
  return true;
}

async function fetchRemoteStyleImage(
  env: AppEnv | CloudRuntimeEnv | OAuthAppEnv,
  source: URL,
  variant: StyleImageVariant,
  corsReadable: boolean,
  cacheOrigin: string,
): Promise<Response> {
  if (variant !== 'original' && !getStyleImagesBinding(env)) {
    return imageTransformUnavailableResponse();
  }
  const cacheKey = variant === 'original'
    ? null
    : await buildStyleImageCacheRequest(cacheOrigin, `remote:${source.toString()}`, variant);
  const cached = cacheKey ? await readCachedStyleImage(cacheKey, corsReadable) : null;
  if (cached) return cached;

  let current = source;
  let upstream: Response | null = null;
  for (let redirectCount = 0; redirectCount <= STYLE_REMOTE_IMAGE_MAX_REDIRECTS; redirectCount += 1) {
    // Only reached with strict public fetch (see hasStrictPublicFetch): Cloud deployments enable
    // global_fetch_strictly_public, which rechecks resolved DNS addresses and closes
    // DNS-rebinding/private-resolution gaps that URL-literal validation alone cannot close.
    upstream = await fetch(current.toString(), {
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        'user-agent': STYLE_REMOTE_IMAGE_PROXY_USER_AGENT,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (upstream.status < 300 || upstream.status >= 400) break;
    const location = upstream.headers.get('location');
    if (!location || redirectCount === STYLE_REMOTE_IMAGE_MAX_REDIRECTS) {
      return new Response('Remote Style image redirect was unsafe or excessive.', {
        status: 502,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    const redirected = normalizeStyleRemoteImageSourceUrl(new URL(location, current).toString());
    if (!redirected) {
      return new Response('Remote Style image redirect target is not public HTTPS.', {
        status: 502,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    current = redirected;
  }
  if (!upstream) {
    return new Response('Remote Style image fetch failed.', { status: 502 });
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

  let bytes: Uint8Array;
  try {
    bytes = await readStyleImageResponseBytes(upstream, STYLE_HOSTED_FILE_MAX_BYTES, 'Remote Style image');
  } catch {
    return new Response('Remote Style image is too large.', {
      status: 413,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
  let validatedContentType: string;
  try {
    validatedContentType = validatedStyleRemoteImageMimeType({
      bytes,
      contentType,
      errorLabel: 'Remote Style image',
      mimeTypeHint: null,
    });
  } catch {
    return new Response('Remote Style image bytes did not match its declared image type.', {
      status: 415,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  if (variant !== 'original') {
    return transformStyleImage(env, bytes, corsReadable, variant, cacheKey, STYLE_IMAGE_REMOTE_EDGE_TTL_SECONDS);
  }

  return new Response(bytes, {
    headers: {
      ...(corsReadable ? { 'access-control-allow-origin': '*' } : {}),
      'cache-control': 'private, no-store',
      'content-type': validatedContentType,
      'x-content-type-options': 'nosniff',
      // Embeddable in cross-origin, COEP-isolated MCP Apps widget iframes (see serveStyleImage).
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}

async function serveStyleImage(
  env: AppEnv | CloudRuntimeEnv | OAuthAppEnv,
  photoId: string,
  tenantId?: string | null,
  variant: StyleImageVariant = 'original',
  corsReadable = false,
  cacheOrigin = 'https://style-image-cache.invalid',
): Promise<Response> {
  if (variant !== 'original' && !getStyleImagesBinding(env)) {
    return imageTransformUnavailableResponse();
  }
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

  const cacheKey = variant === 'original'
    ? null
    : await buildStyleImageCacheRequest(cacheOrigin, `owned:${asset.r2Key}`, variant);
  const cached = cacheKey ? await readCachedStyleImage(cacheKey, corsReadable) : null;
  if (cached) {
    if (variant !== 'original' && cached.headers.get('x-fluent-image-materialized') !== 'r2') {
      try {
        const bytes = new Uint8Array(await cached.clone().arrayBuffer());
        await persistDerivedStyleImage(bindings, asset.r2Key, variant, bytes);
        const promoted = buildDerivedStyleImageResponse(bytes, corsReadable);
        await writeCachedStyleImage(cacheKey, promoted);
        return buildPrivateStyleImageResponse(promoted, corsReadable, 'HIT');
      } catch {
        // Existing edge entries remain valid even if promotion is temporarily unavailable.
      }
    }
    return cached;
  }

  if (variant !== 'original') {
    const derivedKey = buildStyleDerivedImageAssetKey(asset.r2Key, variant);
    const derived = await bindings.artifacts.get(derivedKey);
    if (derived) {
      const response = buildDerivedStyleImageResponse(await derived.arrayBuffer(), corsReadable);
      await writeCachedStyleImage(cacheKey, response);
      return buildPrivateStyleImageResponse(response, corsReadable, 'DERIVED_R2');
    }
  }

  const object = await bindings.artifacts.get(asset.r2Key);
  if (!object) {
    return new Response('Style image asset missing.', {
      status: 404,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const body = await object.arrayBuffer();
  if (variant !== 'original') {
    return transformStyleImage(
      env,
      body,
      corsReadable,
      variant,
      cacheKey,
      STYLE_IMAGE_OWNED_EDGE_TTL_SECONDS,
      (bytes) => persistDerivedStyleImage(bindings, asset.r2Key, variant, bytes),
    );
  }
  let contentType = object.httpMetadata?.contentType || asset.mimeType || 'application/octet-stream';
  if (corsReadable) {
    const declaredContentType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!['image/avif', 'image/jpeg', 'image/jpg', 'image/png', 'image/apng', 'image/webp'].includes(declaredContentType)) {
      return new Response('Signed Style image metadata did not declare a supported image.', {
        status: 415,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    try {
      contentType = validatedStyleRemoteImageMimeType({
        bytes: new Uint8Array(body),
        contentType: declaredContentType,
        errorLabel: 'Signed Style image',
        mimeTypeHint: asset.mimeType,
      });
    } catch {
      return new Response('Signed Style image bytes did not match the declared image type.', {
        status: 415,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
  }
  return new Response(body, {
    headers: {
      ...(corsReadable ? { 'access-control-allow-origin': '*' } : {}),
      'cache-control': 'private, no-store',
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
      // MCP Apps widget iframes (e.g. Claude's *.claudemcpcontent.com) are cross-origin to this
      // worker and run cross-origin-isolated (COEP: require-corp), which blocks any subresource
      // lacking CORP. Without this header the closet/purchase widgets show broken images.
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}

async function transformStyleImage(
  env: AppEnv | CloudRuntimeEnv | OAuthAppEnv,
  body: BodyInit,
  corsReadable: boolean,
  variant: Exclude<StyleImageVariant, 'original'>,
  cacheKey: Request | null,
  edgeTtlSeconds: number,
  persistDerived?: (bytes: Uint8Array) => Promise<void>,
): Promise<Response> {
  const images = getStyleImagesBinding(env);
  if (!images) {
    return imageTransformUnavailableResponse();
  }
  const stream = new Response(body).body;
  if (!stream) return new Response('Optimized Style image source is empty.', { status: 422 });
  const transform = variant === 'thumbnail' ? STYLE_CLOSET_GRID_THUMBNAIL : STYLE_CLOSET_DETAIL_IMAGE;
  const output = await images
    .input(stream)
    .transform({
      fit: transform.fit,
      height: transform.height,
      width: transform.width,
    })
    .output({ format: 'image/webp', quality: transform.quality });
  // ImagesBinding.output() is async; calling response() on the unresolved promise fails in Workers.
  const transformed = await output.response();
  const headers = new Headers(transformed.headers);
  headers.set('cross-origin-resource-policy', 'cross-origin');
  headers.set('x-content-type-options', 'nosniff');
  if (transformed.status !== 200) {
    headers.delete('access-control-allow-origin');
    return new Response(transformed.body, { headers, status: transformed.status });
  }
  headers.set('content-type', 'image/webp');
  headers.set('cache-control', `public, max-age=${edgeTtlSeconds}`);
  headers.delete('access-control-allow-origin');
  let transformedBody: BodyInit | null = transformed.body;
  let derivedStored = false;
  if (persistDerived) {
    const bytes = new Uint8Array(await transformed.arrayBuffer());
    try {
      await persistDerived(bytes);
      derivedStored = true;
    } catch {
      // Derived storage is a performance layer. A transient R2 write failure must not turn a
      // successfully transformed user image into a broken card.
    }
    transformedBody = bytes;
  }
  if (derivedStored) headers.set('x-fluent-image-materialized', 'r2');
  const edgeResponse = new Response(transformedBody, { headers, status: transformed.status });
  const cacheStatus = await writeCachedStyleImage(cacheKey, edgeResponse);
  return buildPrivateStyleImageResponse(edgeResponse, corsReadable, cacheStatus);
}

function buildDerivedStyleImageResponse(body: BodyInit, corsReadable: boolean): Response {
  return new Response(body, {
    headers: {
      ...(corsReadable ? { 'access-control-allow-origin': '*' } : {}),
      'cache-control': `public, max-age=${STYLE_IMAGE_OWNED_EDGE_TTL_SECONDS}`,
      'content-type': 'image/webp',
      'cross-origin-resource-policy': 'cross-origin',
      'x-fluent-image-materialized': 'r2',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function persistDerivedStyleImage(
  bindings: CoreRuntimeBindings,
  sourceR2Key: string,
  variant: Exclude<StyleImageVariant, 'original'>,
  bytes: Uint8Array,
): Promise<void> {
  await bindings.artifacts.put(buildStyleDerivedImageAssetKey(sourceR2Key, variant), bytes, {
    customMetadata: {
      source_r2_key: sourceR2Key,
      style_image_variant: variant,
    },
    httpMetadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: 'image/webp',
    },
  });
}

async function writeCachedStyleImage(cacheKey: Request | null, response: Response): Promise<'BYPASS' | 'MISS'> {
  const cache = getDefaultStyleImageCache();
  if (!cache || !cacheKey) return 'BYPASS';
  try {
    await cache.put(cacheKey, response.clone());
    return 'MISS';
  } catch {
    return 'BYPASS';
  }
}

function getStyleImagesBinding(env: AppEnv | CloudRuntimeEnv | OAuthAppEnv): ImagesBinding | undefined {
  return 'IMAGES' in env ? env.IMAGES : undefined;
}

function imageTransformUnavailableResponse(): Response {
  return new Response('Optimized Style image delivery requires the Cloudflare Images binding.', {
    status: 503,
    headers: { 'cache-control': 'private, no-store' },
  });
}

type StyleImageCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function getDefaultStyleImageCache(): StyleImageCache | null {
  const cacheStorage = (globalThis as unknown as { caches?: { default?: StyleImageCache } }).caches;
  return cacheStorage?.default ?? null;
}

async function buildStyleImageCacheRequest(
  origin: string,
  identity: string,
  variant: Exclude<StyleImageVariant, 'original'>,
): Promise<Request> {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return new Request(new URL(`/__fluent/style-image-cache/${variant}/${digest}`, origin).toString());
}

async function readCachedStyleImage(cacheKey: Request, corsReadable: boolean): Promise<Response | null> {
  const cache = getDefaultStyleImageCache();
  if (!cache) return null;
  try {
    const cached = await cache.match(cacheKey);
    return cached ? buildPrivateStyleImageResponse(cached, corsReadable, 'HIT') : null;
  } catch {
    return null;
  }
}

function buildPrivateStyleImageResponse(response: Response, corsReadable: boolean, cacheStatus: string): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', STYLE_IMAGE_BROWSER_CACHE_CONTROL);
  headers.set('cross-origin-resource-policy', 'cross-origin');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-fluent-image-cache', cacheStatus);
  if (corsReadable) headers.set('access-control-allow-origin', '*');
  else headers.delete('access-control-allow-origin');
  return new Response(response.body, { headers, status: response.status });
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
