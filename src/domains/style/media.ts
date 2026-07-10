import path from 'node:path';
import { readFile } from 'node:fs/promises';

export const STYLE_SIGNED_FALLBACK_TTL_MS = 1000 * 60 * 10;

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
  variant?: 'original';
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
}): Promise<{ expiresAt: string; originalUrl: string }> {
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? STYLE_SIGNED_FALLBACK_TTL_MS)).toISOString();
  const sourceUrl = params.sourceUrl.trim();
  const sig = await signStyleRemoteImageUrl({
    expiresAt,
    secret: params.secret,
    sourceUrl,
  });
  const url = new URL('/images/style/remote/original', params.origin);
  url.searchParams.set('u', stringToBase64Url(sourceUrl));
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
  variant?: 'original';
}): { originalUrl: string } {
  const pathname = buildStyleImagePath(params.photoId, params.variant ?? 'original');
  return {
    originalUrl: new URL(pathname, params.origin).toString(),
  };
}

export function decodeStyleRemoteImageSourceUrl(value: string): string | null {
  return base64UrlToString(value);
}

export async function verifyStyleRemoteImageUrlSignature(params: {
  expiresAt: string;
  secret: string;
  signatureHex: string;
  sourceUrl: string;
}): Promise<boolean> {
  const payload = buildStyleRemoteImageSignaturePayload(params);
  return verifySignature(params.signatureHex, payload, params.secret);
}

async function signStyleRemoteImageUrl(params: {
  expiresAt: string;
  secret: string;
  sourceUrl: string;
}): Promise<string> {
  const payload = buildStyleRemoteImageSignaturePayload(params);
  return signData(payload, params.secret);
}

export async function parseOwnedStyleAsset(input: {
  dataBase64?: string | null;
  dataUrl?: string | null;
  filePath?: string | null;
  mimeTypeHint?: string | null;
  sourceUrl?: string | null;
}): Promise<StyleOwnedAssetInput | null> {
  const dataUrl = input.dataUrl?.trim() || null;
  if (dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    return {
      artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
      bytes: parsed.bytes,
      extension: extensionFromMimeType(parsed.mimeType),
      mimeType: parsed.mimeType,
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  if (input.dataBase64?.trim()) {
    const mimeType = normalizeMimeType(input.mimeTypeHint) ?? 'application/octet-stream';
    return {
      artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
      bytes: base64ToBytes(input.dataBase64),
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

  const sourceUrl = input.sourceUrl?.trim() || null;
  if (!sourceUrl) {
    return null;
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    return null;
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch Style photo source: ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = normalizeMimeType(response.headers.get('content-type')) ?? inferMimeTypeFromUrl(sourceUrl);
  return {
    artifactId: `artifact:style-photo:${crypto.randomUUID()}`,
    bytes,
    extension: extensionFromMimeType(mimeType, sourceUrl),
    mimeType,
    sourceUrl,
  };
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
}): string {
  return `remote:${params.sourceUrl}:${params.expiresAt}`;
}

function buildStyleImagePath(photoId: string, variant: 'original'): string {
  return `/images/style/${encodeURIComponent(photoId)}/${variant}`;
}

function parseDataUrl(value: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(value);
  if (!match) {
    throw new Error('Invalid Style photo data URL.');
  }
  const mimeType = normalizeMimeType(match[1]) ?? 'application/octet-stream';
  const body = match[3] ?? '';
  const bytes = match[2] ? base64ToBytes(body) : new TextEncoder().encode(decodeURIComponent(body));
  return { bytes, mimeType };
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

function stringToBase64Url(value: string): string {
  return Buffer.from(new TextEncoder().encode(value)).toString('base64url');
}

function base64UrlToBytes(value: string): Uint8Array {
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  } catch {
    return new Uint8Array();
  }
}

function base64UrlToString(value: string): string | null {
  try {
    return new TextDecoder().decode(base64UrlToBytes(value));
  } catch {
    return null;
  }
}
