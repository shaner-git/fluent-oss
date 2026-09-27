import path from 'node:path';
import { readFile } from 'node:fs/promises';

// Closet cards are routinely lazy-loaded inside long-lived ChatGPT turns and may be remounted from
// retained structured results. Ten-minute capabilities expired before an offscreen card was ever
// requested, which made an idle or replayed closet look randomly blank. Keep the capability bounded,
// but long enough for an ordinary assistant session and its retained widget result.
export const STYLE_SIGNED_FALLBACK_TTL_MS = 1000 * 60 * 60 * 24;
// Keep original-resolution evidence when practical. Twenty megabytes covers typical
// full-resolution phone JPEG/PNG/WebP files while keeping public writes bounded.
export const STYLE_HOSTED_FILE_MAX_BYTES = 20_000_000;
export const STYLE_CLOSET_GRID_THUMBNAIL = {
  fit: 'contain',
  height: 600,
  quality: 78,
  width: 480,
} as const;
export const STYLE_CLOSET_DETAIL_IMAGE = {
  fit: 'contain',
  height: 1600,
  quality: 86,
  width: 1200,
} as const;
const STYLE_DERIVED_IMAGE_VERSION = 'cf-images-v1';

export function buildStyleDerivedImageAssetKey(
  sourceR2Key: string,
  variant: 'detail' | 'thumbnail',
): string {
  return `${sourceR2Key}.${STYLE_DERIVED_IMAGE_VERSION}.${variant}.webp`;
}
export type StyleImageVariant = 'detail' | 'original' | 'thumbnail';

const STYLE_HOSTED_FILE_MAX_REDIRECTS = 3;
const STYLE_REMOTE_IMAGE_IMPORT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145 Safari/537.36';
const OPENAI_FILE_DOWNLOAD_HOSTS = new Set([
  'api.openai.com',
  'files.openai.com',
  'files.oaiusercontent.com',
]);
const CHATGPT_ESTUARY_CONTENT_PATH = '/backend-api/estuary/content';
// ChatGPT app uploads (image_file) are served from OpenAI-owned Azure Blob storage
// accounts named oaisdmntpr<region> (observed 2026-09-26: oaisdmntprcentralus). Match
// only that account-name shape on blob.core.windows.net; other Azure accounts stay blocked.
const OPENAI_UPLOAD_BLOB_HOST_PATTERN = /^oaisdmntpr[a-z0-9]{2,16}\.blob\.core\.windows\.net$/;

export interface StyleOwnedAssetInput {
  artifactId: string;
  bytes: Uint8Array;
  extension: string;
  mimeType: string;
  sourceUrl: string | null;
}

export interface StyleOwnedAssetStored {
  artifactId: string;
  key: string;
  mimeType: string;
  sourceUrl: string | null;
}

export async function signStyleImagePath(params: {
  expiresAt: string;
  path: string;
  secret: string;
  tenantId?: string | null;
}): Promise<string> {
  const payload = buildStyleImageSignaturePayload(params);
  return signData(payload, params.secret);
}

export async function verifyStyleImagePathSignature(params: {
  expiresAt: string;
  path: string;
  secret: string;
  signatureHex: string;
  tenantId?: string | null;
}): Promise<boolean> {
  const payload = buildStyleImageSignaturePayload(params);
  return verifySignature(params.signatureHex, payload, params.secret);
}

export async function buildSignedStyleImageUrl(params: {
  origin: string;
  photoId: string;
  secret: string;
  tenantId?: string | null;
  ttlMs?: number;
  variant?: StyleImageVariant;
}): Promise<{ expiresAt: string; originalUrl: string }> {
  const variant = params.variant ?? 'original';
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? STYLE_SIGNED_FALLBACK_TTL_MS)).toISOString();
  const pathname = buildStyleImagePath(params.photoId, variant);
  const tenantId = params.tenantId?.trim() || null;
  const ownerToken = tenantId ? await encryptStyleImageOwnerToken({ secret: params.secret, tenantId }) : null;
  const sig = await signStyleImagePath({
    expiresAt,
    path: pathname,
    secret: params.secret,
    tenantId,
  });
  const url = new URL(pathname, params.origin);
  url.searchParams.set('exp', expiresAt);
  if (ownerToken) {
    url.searchParams.set('owner', ownerToken);
  }
  url.searchParams.set('sig', sig);
  return {
    expiresAt,
    originalUrl: url.toString(),
  };
}

export async function buildSignedStyleRemoteImageUrl(params: {
  origin: string;
  secret: string;
  sourceUrl: string;
  ttlMs?: number;
  variant?: StyleImageVariant;
}): Promise<{ expiresAt: string; originalUrl: string }> {
  const variant = params.variant ?? 'original';
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? STYLE_SIGNED_FALLBACK_TTL_MS)).toISOString();
  const source = normalizeStyleRemoteImageSourceUrl(params.sourceUrl);
  if (!source) {
    throw new Error('Remote Style images require a public HTTPS source URL.');
  }
  const sourceUrl = source.toString();
  const sourceToken = await encryptStyleRemoteImageSourceToken({ secret: params.secret, sourceUrl, variant });
  const sig = await signStyleRemoteImageUrl({
    expiresAt,
    secret: params.secret,
    sourceUrl,
    variant,
  });
  const url = new URL(`/images/style/remote/${variant}`, params.origin);
  url.searchParams.set('u', sourceToken);
  url.searchParams.set('exp', expiresAt);
  url.searchParams.set('sig', sig);
  return {
    expiresAt,
    originalUrl: url.toString(),
  };
}

export async function decryptStyleImageOwnerToken(params: {
  secret: string;
  token: string;
}): Promise<string | null> {
  const bytes = base64UrlToBytes(params.token);
  if (bytes.length <= 12) {
    return null;
  }
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const key = await importAesKey(params.secret);
  try {
    const plaintext = await crypto.subtle.decrypt({ iv, name: 'AES-GCM' }, key, ciphertext);
    const record = JSON.parse(new TextDecoder().decode(plaintext)) as { tenantId?: unknown };
    return typeof record.tenantId === 'string' && record.tenantId.trim() ? record.tenantId.trim() : null;
  } catch {
    return null;
  }
}

export function buildStyleImageUrl(params: {
  origin: string;
  photoId: string;
  variant?: StyleImageVariant;
}): { originalUrl: string } {
  const pathname = buildStyleImagePath(params.photoId, params.variant ?? 'original');
  return {
    originalUrl: new URL(pathname, params.origin).toString(),
  };
}

export async function decryptStyleRemoteImageSourceToken(params: {
  secret: string;
  token: string;
  variant: StyleImageVariant;
}): Promise<string | null> {
  const bytes = base64UrlToBytes(params.token);
  if (bytes.length <= 12) return null;
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const key = await importAesKey(params.secret);
  try {
    const plaintext = await crypto.subtle.decrypt({ iv, name: 'AES-GCM' }, key, ciphertext);
    const record = JSON.parse(new TextDecoder().decode(plaintext)) as { sourceUrl?: unknown; variant?: unknown };
    return record.variant === params.variant && typeof record.sourceUrl === 'string'
      ? record.sourceUrl
      : null;
  } catch {
    return null;
  }
}

export function normalizeStyleRemoteImageSourceUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      return null;
    }
    if (isNonPublicIpv4Literal(hostname) || isNonPublicIpv6Literal(hostname)) return null;
    // URL canonicalizes decimal, octal, hexadecimal, and shortened IPv4 forms. If a numeric-looking
    // host somehow survives without becoming a valid dotted quad, fail closed instead of treating it
    // as a DNS name.
    if (/^[\d.]+$/.test(hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function isNonPublicIpv4Literal(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b, c] = octets;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isNonPublicIpv6Literal(hostname: string): boolean {
  if (!hostname.includes(':')) return false;
  const hextets = expandIpv6Literal(hostname);
  if (!hextets) return true;
  const [first, second, third, fourth, fifth, sixth] = hextets;
  const allZero = hextets.every((part) => part === 0);
  const loopback = hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1;
  const ipv4Mapped = hextets.slice(0, 5).every((part) => part === 0) && sixth === 0xffff;
  const ipv4Compatible = hextets.slice(0, 6).every((part) => part === 0);
  return (
    allZero || loopback || ipv4Mapped || ipv4Compatible ||
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    (first === 0x0064 && second === 0xff9b && third === 0 && fourth === 0 && fifth === 0 && sixth === 0) ||
    (first === 0x0064 && second === 0xff9b && third === 1) ||
    (first === 0x0100 && second === 0 && third === 0 && fourth === 0) || // 100::/64 discard-only
    (first === 0x2001 && second === 0x0000) || // Teredo transition space
    (first === 0x2001 && second === 0x0002) || // benchmarking
    (first === 0x2001 && second === 0x0db8) || // documentation
    (first === 0x2001 && (second & 0xfff0) === 0x0020) || // ORCHIDv2
    first === 0x2002 || // deprecated 6to4 transition space
    (first & 0xfff0) === 0x3ff0 || // 3fff::/20 documentation
    first === 0x5f00 // 5f00::/16 segment-routing local block
  );
}

function expandIpv6Literal(hostname: string): number[] | null {
  if (!/^[0-9a-f:]+$/i.test(hostname) || hostname.includes(':::')) return null;
  const halves = hostname.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (left.some((part) => !/^[0-9a-f]{1,4}$/i.test(part)) || right.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return null;
  }
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  return [...left, ...Array.from({ length: missing }, () => '0'), ...right].map((part) => Number.parseInt(part, 16));
}

export async function verifyStyleRemoteImageUrlSignature(params: {
  expiresAt: string;
  secret: string;
  signatureHex: string;
  sourceUrl: string;
  variant?: StyleImageVariant;
}): Promise<boolean> {
  const payload = buildStyleRemoteImageSignaturePayload(params);
  return verifySignature(params.signatureHex, payload, params.secret);
}

async function signStyleRemoteImageUrl(params: {
  expiresAt: string;
  secret: string;
  sourceUrl: string;
  variant?: StyleImageVariant;
}): Promise<string> {
  const payload = buildStyleRemoteImageSignaturePayload(params);
  return signData(payload, params.secret);
}

export async function parseOwnedStyleAsset(input: {
  dataBase64?: string | null;
  dataUrl?: string | null;
  /** Total deadline for a network import, covering redirects and the streamed body. */
  downloadDeadlineMs?: number;
  filePath?: string | null;
  hostedFileDownloadUrl?: string | null;
  mimeTypeHint?: string | null;
  sourceUrl?: string | null;
}): Promise<StyleOwnedAssetInput | null> {
  const dataUrl = input.dataUrl?.trim() || null;
  if (dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    assertOwnedStyleImageBytes(parsed.bytes, parsed.mimeType);
    assertMinimumStyleImageBytes(parsed.bytes, 'Owned Style image');
    return {
      artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
      bytes: parsed.bytes,
      extension: extensionFromMimeType(parsed.mimeType),
      mimeType: parsed.mimeType,
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  if (input.dataBase64?.trim()) {
    const bytes = base64ToBytes(input.dataBase64);
    const mimeType = validatedStyleImageMimeType({
      bytes,
      contentType: null,
      errorLabel: 'Owned Style image',
      mimeTypeHint: input.mimeTypeHint,
    });
    assertOwnedStyleImageBytes(bytes, mimeType);
    assertMinimumStyleImageBytes(bytes, 'Owned Style image');
    return {
      artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
      bytes,
      extension: extensionFromMimeType(mimeType),
      mimeType,
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  const filePath = input.filePath?.trim() || null;
  if (filePath) {
    const bytes = new Uint8Array(await readFile(filePath));
    const mimeType = normalizeMimeType(input.mimeTypeHint) ?? inferMimeTypeFromPath(filePath);
    return {
      artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
      bytes,
      extension: extensionFromMimeType(mimeType) || path.extname(filePath).replace(/^\./, '').toLowerCase() || 'bin',
      mimeType,
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  const hostedFileDownloadUrl = input.hostedFileDownloadUrl?.trim() || null;
  if (hostedFileDownloadUrl) {
    const { bytes, response } = await withStyleImageDownloadDeadline(input.downloadDeadlineMs, async (signal) => {
      const response = await fetchOpenAiHostedStyleFile(hostedFileDownloadUrl, signal);
      return { bytes: await readStyleImageResponseBytes(response, STYLE_HOSTED_FILE_MAX_BYTES, undefined, signal), response };
    });
    const mimeType = validatedStyleImageMimeType({
      bytes,
      contentType: response.headers.get('content-type'),
      mimeTypeHint: input.mimeTypeHint,
    });
    assertMinimumStyleImageBytes(bytes, 'ChatGPT Style image file');
    return {
      artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
      bytes,
      extension: extensionFromMimeType(mimeType),
      mimeType,
      // ChatGPT file download URLs are temporary bearer URLs. Never persist them.
      sourceUrl: null,
    };
  }

  const sourceUrl = input.sourceUrl?.trim() || null;
  if (!sourceUrl) {
    return null;
  }
  // Relative legacy references and host-local upload paths are not network imports. Returning no
  // asset preserves their existing caller-specific handling (legacy backfill or actionable error).
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return null;
  }

  const normalizedSource = normalizeStyleRemoteImageSourceUrl(sourceUrl);
  if (!normalizedSource) {
    throw new Error('Owned Style image URL must use a public HTTPS image source.');
  }
  const { bytes, response } = await withStyleImageDownloadDeadline(input.downloadDeadlineMs, async (signal) => {
    const response = await fetchPublicStyleImageFile(normalizedSource, signal);
    return { bytes: await readStyleImageResponseBytes(response, STYLE_HOSTED_FILE_MAX_BYTES, 'Owned Style image URL', signal), response };
  });
  const mimeType = validatedStyleRemoteImageMimeType({
    bytes,
    contentType: response.headers.get('content-type'),
    errorLabel: 'Owned Style image URL',
    mimeTypeHint: input.mimeTypeHint,
  });
  assertMinimumStyleImageBytes(bytes, 'Owned Style image URL');
  return {
    artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
    bytes,
    extension: extensionFromMimeType(mimeType, normalizedSource.toString()),
    mimeType,
    sourceUrl: normalizedSource.toString(),
  };
}

export const STYLE_IMAGE_DOWNLOAD_DEADLINE_MS = 30_000;

// An unusable caller-supplied image (not image data, not a downloadable URL, too small, a rejected
// or failed download, a timeout). Its message is OUTCOME-NEUTRAL: it never says whether anything was
// saved, because the same failure may reject a photo write (nothing saved) or leave a text-first
// item saved without its photo (D24). Callers that reject add that fact via withNothingSavedNote.
export class StyleImageInputError extends Error {
  readonly detail: string;

  constructor(detail: string, nextStep: string = STYLE_UPLOADED_PHOTO_DATA_URL_STEP) {
    super(nextStep ? `${detail} ${nextStep}` : detail);
    this.name = 'StyleImageInputError';
    this.detail = detail;
  }
}

export function isStyleImageInputError(error: unknown): error is StyleImageInputError {
  return error instanceof Error && error.name === 'StyleImageInputError';
}

// For a write that rejected before storing anything: state that fact between the reason and the
// next step. Other errors pass through unchanged.
export function withNothingSavedNote(error: unknown): unknown {
  if (!isStyleImageInputError(error)) return error;
  const rest = error.message.slice(error.detail.length).trim();
  const note = new Error(`${error.detail} Nothing was saved.${rest ? ` ${rest}` : ''}`);
  note.name = 'StyleImageInputError';
  return note;
}

function assertMinimumStyleImageBytes(bytes: Uint8Array, errorLabel: string): void {
  if (bytes.byteLength < STYLE_MIN_IMAGE_DATA_BYTES) {
    throw new StyleImageInputError(`${errorLabel} is too small to be a real image (${bytes.byteLength} bytes).`);
  }
}

// One total deadline for a network image import: every redirect hop and the streamed body read
// share the same AbortSignal, so a stalled host cannot hold the write open.
async function withStyleImageDownloadDeadline<T>(
  deadlineMs: number | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ms = deadlineMs ?? STYLE_IMAGE_DOWNLOAD_DEADLINE_MS;
  const signal = AbortSignal.timeout(ms);
  const timedOut = () => new StyleImageInputError(`Downloading the image timed out after ${Math.max(1, Math.round(ms / 1000))} seconds.`);
  let onAbort: (() => void) | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(timedOut());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([run(signal), deadline]);
  } catch (error) {
    if (signal.aborted) throw timedOut();
    throw error;
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function fetchPublicStyleImageFile(initialUrl: URL, signal?: AbortSignal): Promise<Response> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= STYLE_HOSTED_FILE_MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl.toString(), {
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        'user-agent': STYLE_REMOTE_IMAGE_IMPORT_USER_AGENT,
      },
      redirect: 'manual',
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount === STYLE_HOSTED_FILE_MAX_REDIRECTS) {
        throw new Error('Unable to download owned Style image URL: unsafe or excessive redirect.');
      }
      const redirected = normalizeStyleRemoteImageSourceUrl(new URL(location, currentUrl).toString());
      if (!redirected) {
        throw new Error('Unable to download owned Style image URL: redirect target is not public HTTPS.');
      }
      currentUrl = redirected;
      continue;
    }
    if (!response.ok) {
      throw new Error(`Unable to download owned Style image URL: HTTP ${response.status}.`);
    }
    return response;
  }
  throw new Error('Unable to download owned Style image URL.');
}

export function buildStyleAssetKey(params: {
  artifactId: string;
  itemId: string;
  photoId: string;
  tenantId: string;
  extension: string;
}): string {
  const safeTenant = sanitizeSegment(params.tenantId);
  const safeItem = sanitizeSegment(params.itemId);
  const safePhoto = sanitizeSegment(params.photoId);
  const safeArtifact = sanitizeSegment(params.artifactId);
  // Each upload gets an immutable object key. A photo-id-only key let a replacement overwrite
  // the currently referenced object before its database swap had succeeded.
  return `style/${safeTenant}/${safeItem}/${safePhoto}/${safeArtifact}/original.${params.extension}`;
}

export function inferMimeTypeFromUrl(url: string): string {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return inferMimeTypeFromExtension(extension);
}

export function inferMimeTypeFromPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return inferMimeTypeFromExtension(extension);
}

function inferMimeTypeFromExtension(extension: string): string {
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.avif':
      return 'image/avif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

export function normalizeMimeType(value: string | null | undefined): string | null {
  const raw = value?.split(';')[0]?.trim().toLowerCase();
  return raw ? raw : null;
}

export function extensionFromMimeType(mimeType: string, fallbackUrl?: string): string {
  switch (normalizeMimeType(mimeType)) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    case 'image/svg+xml':
      return 'svg';
    default: {
      if (fallbackUrl) {
        const extension = path.extname(new URL(fallbackUrl).pathname).replace(/^\./, '').toLowerCase();
        if (extension) {
          return extension;
        }
      }
      return 'bin';
    }
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function buildStyleImageSignaturePayload(params: {
  expiresAt: string;
  path: string;
  tenantId?: string | null;
}): string {
  const tenantId = params.tenantId?.trim();
  return tenantId
    ? `${params.path}:${params.expiresAt}:${tenantId}`
    : `${params.path}:${params.expiresAt}`;
}

function buildStyleRemoteImageSignaturePayload(params: {
  expiresAt: string;
  sourceUrl: string;
  variant?: StyleImageVariant;
}): string {
  return `remote:${params.sourceUrl}:${params.expiresAt}:${params.variant ?? 'original'}`;
}

function buildStyleImagePath(photoId: string, variant: StyleImageVariant): string {
  return `/images/style/${encodeURIComponent(photoId)}/${variant}`;
}

function parseDataUrl(value: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(value);
  if (!match) {
    throw new Error('Invalid Style photo data URL.');
  }
  const mimeType = normalizeMimeType(match[1]) ?? 'application/octet-stream';
  // Hosts and command-line encoders may wrap a large base64 value. Whitespace is not
  // image data, so normalize it before strict signature and size validation.
  const body = match[2] ? (match[3] ?? '').replace(/\s+/g, '') : (match[3] ?? '');
  const bytes = match[2] ? base64ToBytes(body) : new TextEncoder().encode(decodeURIComponent(body));
  assertStyleImageSignature(bytes, mimeType);
  return { bytes, mimeType };
}

function assertOwnedStyleImageBytes(bytes: Uint8Array, mimeType: string): void {
  if (bytes.byteLength > STYLE_HOSTED_FILE_MAX_BYTES) {
    throw new Error(`Owned Style image exceeds the ${STYLE_HOSTED_FILE_MAX_BYTES}-byte limit.`);
  }
  validatedStyleImageMimeType({
    bytes,
    contentType: null,
    errorLabel: 'Owned Style image',
    mimeTypeHint: mimeType,
  });
}

async function fetchOpenAiHostedStyleFile(downloadUrl: string, signal?: AbortSignal): Promise<Response> {
  let currentUrl = validateOpenAiFileDownloadUrl(downloadUrl, { log: true });
  for (let redirectCount = 0; redirectCount <= STYLE_HOSTED_FILE_MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, signal ? { redirect: 'manual', signal } : { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount === STYLE_HOSTED_FILE_MAX_REDIRECTS) {
        throw new StyleImageInputError('Unable to download the ChatGPT Style image file: unsafe or excessive redirect.');
      }
      currentUrl = validateOpenAiFileDownloadUrl(new URL(location, currentUrl).toString(), { log: true, redirect: true });
      continue;
    }
    if (!response.ok) {
      throw new StyleImageInputError(`Unable to download the ChatGPT Style image file: HTTP ${response.status}.`);
    }
    return response;
  }
  throw new StyleImageInputError('Unable to download the ChatGPT Style image file.');
}

// Describe a rejected download_url without ever echoing it: signed URLs carry bearer tokens and a
// local path can carry a file name. Only the scheme is reported, plus the (bounded) host for http(s)
// URLs; for any other scheme (file:, sandbox:, ...) the "host" can be a file name, so it is omitted.
function describeRejectedDownloadUrl(url: URL | null, value: string): { host: string | null; scheme: string | null; summary: string } {
  if (!url) {
    const localPath = /^(\/|~\/|[a-z]:[\\/])/i.test(value.trim());
    return { host: null, scheme: null, summary: localPath ? 'got a local file path, not a URL' : 'got a value that is not a URL' };
  }
  const scheme = url.protocol.slice(0, 32);
  const webScheme = scheme === 'https:' || scheme === 'http:';
  const host = webScheme ? url.hostname.toLowerCase().replace(/\.$/, '').slice(0, 100) || null : null;
  return { host, scheme, summary: host ? `got scheme "${scheme}" and host "${host}"` : `got scheme "${scheme}"` };
}

function rejectOpenAiFileDownloadUrl(
  url: URL | null,
  value: string,
  reason: string,
  options: { log?: boolean; redirect?: boolean },
): never {
  const described = describeRejectedDownloadUrl(url, value);
  if (options.log) {
    // PII-free operator signal: never the URL, path, query, or file name.
    console.warn(JSON.stringify({
      event: 'style_image_file_download_url_rejected',
      host: described.host,
      reason,
      redirect: options.redirect === true,
      scheme: described.scheme,
    }));
  }
  const requirement = reason === 'not_a_url'
    ? 'must be a valid HTTPS URL'
    : 'must use an approved OpenAI HTTPS file host';
  throw new StyleImageInputError(`ChatGPT Style image file download_url ${requirement} (${described.summary}).`);
}

function validateOpenAiFileDownloadUrl(value: string, options: { log?: boolean; redirect?: boolean } = {}): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return rejectOpenAiFileDownloadUrl(null, value, 'not_a_url', options);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const isTrustedOpenAiFileHost = OPENAI_FILE_DOWNLOAD_HOSTS.has(hostname)
    || hostname.endsWith('.oaiusercontent.com')
    || OPENAI_UPLOAD_BLOB_HOST_PATTERN.test(hostname);
  // ChatGPT image generation currently exposes the accepted output through a signed
  // Estuary content URL. Allow only that exact content path on the exact ChatGPT host;
  // arbitrary chatgpt.com endpoints remain outside the server-side fetch allowlist.
  const isSignedChatGptEstuaryContent = hostname === 'chatgpt.com' && url.pathname === CHATGPT_ESTUARY_CONTENT_PATH;
  if (url.protocol !== 'https:') return rejectOpenAiFileDownloadUrl(url, value, 'scheme_not_https', options);
  if (url.username || url.password) return rejectOpenAiFileDownloadUrl(url, value, 'credentials_in_url', options);
  if (url.port !== '' && url.port !== '443') return rejectOpenAiFileDownloadUrl(url, value, 'non_default_port', options);
  if (!isTrustedOpenAiFileHost && !isSignedChatGptEstuaryContent) {
    return rejectOpenAiFileDownloadUrl(url, value, hostname === 'chatgpt.com' ? 'chatgpt_path_not_estuary_content' : 'host_not_approved', options);
  }
  return url.toString();
}

// The exact way a host whose cached schema accepts only image_url (the published ChatGPT app 1.0.0)
// can attach an uploaded photo. It rides in tool results and errors because those reach cached hosts
// live. The practical ~2 MB target keeps the tool-call argument small; the hard server limit is
// STYLE_HOSTED_FILE_MAX_BYTES of decoded image bytes.
export function styleUploadedPhotoDataUrlStep(itemId?: string | null): string {
  return `To attach an uploaded photo: read the uploaded file's bytes, downscale to at most ~1600px on the long edge and re-encode as JPEG (quality ~85) so it stays under ~2 MB (Fluent's hard limit is ${STYLE_HOSTED_FILE_MAX_BYTES / 1_000_000} MB of image bytes), then call fluent_set_style_item_image with ${itemId ? `item_id "${itemId}", ` : ''}image_url set to data:image/jpeg;base64,<bytes> and image_type "fit" for an on-you photo or "alternate" otherwise ("primary" only for the cover). Never pass a local file path or an app-internal image handle.`;
}
export const STYLE_UPLOADED_PHOTO_DATA_URL_STEP = styleUploadedPhotoDataUrlStep();
export const STYLE_NOT_IMAGE_DATA_REASON = 'that photo reference isn\'t image data (it looks like an app-internal image handle)';
export const STYLE_NOT_IMAGE_URL_REASON = 'that photo reference isn\'t a downloadable image URL (it looks like a local file path or an app-internal reference)';
const STYLE_NOT_IMAGE_DATA_DETAIL = 'That photo reference isn\'t image data (it looks like an app-internal image handle).';
const STYLE_NOT_IMAGE_URL_DETAIL = 'That photo reference isn\'t a downloadable image URL (it looks like a local file path or an app-internal reference).';
export const STYLE_NOT_IMAGE_DATA_MESSAGE = `${STYLE_NOT_IMAGE_DATA_DETAIL} ${STYLE_UPLOADED_PHOTO_DATA_URL_STEP}`;
export const STYLE_NOT_IMAGE_URL_MESSAGE = `${STYLE_NOT_IMAGE_URL_DETAIL} ${STYLE_UPLOADED_PHOTO_DATA_URL_STEP}`;

// Thrown by the atomic Catalog create when its image bytes could not be ingested. It is raised only
// before any item or photo row is written, so a caller may safely retry the create text-first (D24).
export class StyleCatalogMediaUnusableError extends Error {
  readonly stage: 'catalog' | 'source';

  constructor(message: string, stage: 'catalog' | 'source') {
    // message is already outcome-neutral (see styleImageNotAttachedReason).
    super(message);
    this.name = 'StyleCatalogMediaUnusableError';
    this.stage = stage;
  }
}

export function isStyleCatalogMediaUnusableError(error: unknown): error is StyleCatalogMediaUnusableError {
  return error instanceof Error && error.name === 'StyleCatalogMediaUnusableError';
}

// The reason an image was not attached, for a receipt of a SAVED item that states the attach step
// once itself. Typed image errors give their outcome-neutral detail; any other error is stripped of
// the attach step and of nothing-saved wording, which would be false on a saved-item receipt.
export function styleImageNotAttachedReason(error: unknown): string {
  if (isStyleImageInputError(error)) return error.detail;
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(STYLE_UPLOADED_PHOTO_DATA_URL_STEP, '')
    .replace(/\s*Nothing (?:was|has been) saved[.;,]?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// The caller-facing reason an ordinary image reference is unusable, or null when the error is a
// different failure (so callers never soften an unrelated error into a text-first save).
export function unusableStyleImageReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : null;
  if (message === STYLE_NOT_IMAGE_DATA_MESSAGE) return STYLE_NOT_IMAGE_DATA_REASON;
  if (message === STYLE_NOT_IMAGE_URL_MESSAGE) return STYLE_NOT_IMAGE_URL_REASON;
  return null;
}

// Below this, "image bytes" cannot be a real photo (a 1x1 PNG is 67 bytes); it is a handle or stub.
const STYLE_MIN_IMAGE_DATA_BYTES = 32;
const STYLE_DATA_URL_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Every Style image write that receives a data: URL (image_url or image_data_url) must carry real
// image bytes: an image/* MIME the owned-media path supports, a matching magic signature, and a
// sane minimum size. ChatGPT code-mode image handles (data:application/vnd.openai.code-mode-image)
// and other opaque tokens fail here with an actionable, nothing-was-saved error.
export function assertStyleImageDataUrl(value: string): void {
  decodeStyleImageDataUrl(value);
}

// Validate and decode an image data URL, returning its exact image bytes (for content identity).
export function decodeStyleImageDataUrl(value: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(value.trim());
  const declared = normalizeMimeType(match?.[1]);
  const mimeType = declared === 'image/jpg' ? 'image/jpeg' : declared;
  if (!match || !mimeType || !STYLE_DATA_URL_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new StyleImageInputError(STYLE_NOT_IMAGE_DATA_DETAIL);
  }
  let bytes: Uint8Array;
  try {
    const body = match[2] ? (match[3] ?? '').replace(/\s+/g, '') : (match[3] ?? '');
    bytes = match[2] ? base64ToBytes(body) : new TextEncoder().encode(decodeURIComponent(body));
  } catch {
    throw new StyleImageInputError(STYLE_NOT_IMAGE_DATA_DETAIL);
  }
  if (bytes.byteLength < STYLE_MIN_IMAGE_DATA_BYTES || detectStyleImageMimeType(bytes) !== mimeType) {
    throw new StyleImageInputError(STYLE_NOT_IMAGE_DATA_DETAIL);
  }
  return { bytes, mimeType };
}

export function isOpenAiUploadImageUrl(value: string): boolean {
  try {
    validateOpenAiFileDownloadUrl(value);
    return true;
  } catch {
    return false;
  }
}

export type StyleImageUrlRoute =
  | { kind: 'hosted_file_download'; value: string }
  | { kind: 'inline_data_url'; value: string }
  | { kind: 'reference_url'; value: string };

// Classify a caller-supplied image_url before any write:
// - data: URLs are validated image bytes and go to owned artifact storage (never the url column);
// - allowlisted OpenAI upload hosts are temporary signed links, so their bytes are copied into
//   owned storage at write time through the SSRF-guarded hosted-file path;
// - other http(s) links keep the existing by-reference behavior;
// - any other scheme (sandbox:, blob:, file:, javascript:, ...) can never display and is rejected.
export function routeStyleImageUrl(value: string): StyleImageUrlRoute {
  const trimmed = value.trim();
  if (/^data:/i.test(trimmed)) {
    assertStyleImageDataUrl(trimmed);
    return { kind: 'inline_data_url', value: trimmed };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new StyleImageInputError(STYLE_NOT_IMAGE_URL_DETAIL);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new StyleImageInputError(STYLE_NOT_IMAGE_URL_DETAIL);
  }
  if (isOpenAiUploadImageUrl(trimmed)) {
    return { kind: 'hosted_file_download', value: trimmed };
  }
  return { kind: 'reference_url', value: trimmed };
}

export async function readStyleImageResponseBytes(
  response: Response,
  maxBytes: number,
  errorLabel = 'ChatGPT Style image file',
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`${errorLabel} exceeds the ${maxBytes}-byte limit.`);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(`${errorLabel} exceeds the ${maxBytes}-byte limit.`);
    }
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  // A stalled body must not outlive the import deadline: cancel the stream when it fires.
  const cancelOnAbort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancelOnAbort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new Error(`${errorLabel} download was aborted.`);
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`${errorLabel} exceeds the ${maxBytes}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock();
  }
  if (signal?.aborted) throw new Error(`${errorLabel} download was aborted.`);
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function validatedStyleImageMimeType(input: {
  bytes: Uint8Array;
  contentType: string | null;
  errorLabel?: string;
  mimeTypeHint: string | null | undefined;
}): 'image/jpeg' | 'image/png' | 'image/webp' {
  return validateStyleImageMimeType(input, ['image/jpeg', 'image/png', 'image/webp'], 'PNG, JPEG, or WebP');
}

// Retained remote sources can legitimately negotiate AVIF with the proxy's browser-oriented
// Accept header. Keep that delivery support separate from owned/ChatGPT file ingestion so adding
// a display format does not silently broaden the public upload contract.
export function validatedStyleRemoteImageMimeType(input: {
  bytes: Uint8Array;
  contentType: string | null;
  errorLabel?: string;
  mimeTypeHint: string | null | undefined;
}): 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp' {
  return validateStyleImageMimeType({
    ...input,
    contentType: normalizeStyleRemoteDeclaredMimeType(input.contentType),
    mimeTypeHint: normalizeStyleRemoteDeclaredMimeType(input.mimeTypeHint),
  }, ['image/avif', 'image/jpeg', 'image/png', 'image/webp'], 'AVIF, PNG, JPEG, or WebP');
}

function normalizeStyleRemoteDeclaredMimeType(value: string | null | undefined): string | null {
  const normalized = normalizeMimeType(value);
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'image/apng') return 'image/png';
  return normalized;
}

type DetectedStyleImageMimeType = 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp';

function validateStyleImageMimeType<T extends DetectedStyleImageMimeType>(
  input: {
    bytes: Uint8Array;
    contentType: string | null;
    errorLabel?: string;
    mimeTypeHint: string | null | undefined;
  },
  allowedMimeTypes: readonly T[],
  supportedDescription: string,
): T {
  const errorLabel = input.errorLabel ?? 'ChatGPT Style image file';
  const detected = detectStyleImageMimeType(input.bytes);
  if (!detected) {
    throw new Error(`${errorLabel} must contain ${supportedDescription} bytes.`);
  }
  if (!allowedMimeTypes.includes(detected as T)) {
    throw new Error(`${errorLabel} has unsupported MIME type ${detected}.`);
  }
  for (const declared of [normalizeMimeType(input.mimeTypeHint), normalizeMimeType(input.contentType)]) {
    if (!declared || declared === 'application/octet-stream') {
      continue;
    }
    if (!allowedMimeTypes.includes(declared as T)) {
      throw new Error(`${errorLabel} has unsupported MIME type ${declared}.`);
    }
    if (declared !== detected) {
      throw new Error(`${errorLabel} bytes do not match declared MIME type ${declared}.`);
    }
  }
  return detected as T;
}

function detectStyleImageMimeType(bytes: Uint8Array): DetectedStyleImageMimeType | null {
  const startsWith = (signature: number[]) =>
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith([0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (isValidatedStyleAvifFileTypeBox(bytes)) {
    return 'image/avif';
  }
  return null;
}

export function isValidatedStyleAvifFileTypeBox(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || asciiFourCc(bytes, 4) !== 'ftyp') {
    return false;
  }
  const declaredBoxSize =
    ((bytes[0] ?? 0) << 24) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0);
  // The AVIF file type box is small. Refuse malformed/truncated boxes and cap how much header data
  // is inspected rather than accepting an arbitrary ISO-BMFF payload that merely contains "avif".
  const boxSize = declaredBoxSize >>> 0;
  if (boxSize < 16 || boxSize > bytes.length || boxSize > 256) {
    return false;
  }
  const majorBrand = asciiFourCc(bytes, 8);
  if (majorBrand === 'avif' || majorBrand === 'avis') {
    return true;
  }
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    const compatibleBrand = asciiFourCc(bytes, offset);
    if (compatibleBrand === 'avif' || compatibleBrand === 'avis') {
      return true;
    }
  }
  return false;
}

function asciiFourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function assertStyleImageSignature(bytes: Uint8Array, mimeType: string): void {
  const startsWith = (signature: number[]) =>
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  const isValid =
    mimeType === 'image/png'
      ? startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : mimeType === 'image/jpeg'
        ? startsWith([0xff, 0xd8, 0xff])
        : mimeType === 'image/webp'
          ? startsWith([0x52, 0x49, 0x46, 0x46]) &&
            bytes.length >= 12 &&
            bytes[8] === 0x57 &&
            bytes[9] === 0x45 &&
            bytes[10] === 0x42 &&
            bytes[11] === 0x50
          : mimeType === 'image/avif'
            ? isValidatedStyleAvifFileTypeBox(bytes)
          : true;
  if (!isValid) {
    throw new Error(`Style photo bytes do not match declared MIME type ${mimeType}.`);
  }
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

async function signData(data: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const encoded = new TextEncoder().encode(data);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoded);
  return Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifySignature(signatureHex: string, data: string, secret: string): Promise<boolean> {
  const key = await importKey(secret);
  const encoded = new TextEncoder().encode(data);
  try {
    const signatureBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    );
    return await crypto.subtle.verify('HMAC', key, signatureBytes.buffer, encoded);
  } catch {
    return false;
  }
}

async function importKey(secret: string): Promise<CryptoKey> {
  if (!secret) {
    throw new Error('IMAGE_DELIVERY_SECRET is required for signed Style image delivery.');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign', 'verify'],
  );
}

async function encryptStyleImageOwnerToken(params: {
  secret: string;
  tenantId: string;
}): Promise<string> {
  const key = await importAesKey(params.secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ tenantId: params.tenantId }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ iv, name: 'AES-GCM' }, key, plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64Url(combined);
}

async function encryptStyleRemoteImageSourceToken(params: {
  secret: string;
  sourceUrl: string;
  variant: StyleImageVariant;
}): Promise<string> {
  const key = await importAesKey(params.secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ sourceUrl: params.sourceUrl, variant: params.variant }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ iv, name: 'AES-GCM' }, key, plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64Url(combined);
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  if (!secret) {
    throw new Error('IMAGE_DELIVERY_SECRET is required for signed Style image delivery.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt', 'encrypt']);
}

function bytesToBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlToBytes(value: string): Uint8Array {
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  } catch {
    return new Uint8Array();
  }
}
