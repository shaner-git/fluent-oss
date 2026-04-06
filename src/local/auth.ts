import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import {
  FLUENT_HEALTH_READ_SCOPE,
  FLUENT_HEALTH_WRITE_SCOPE,
  FLUENT_MEALS_READ_SCOPE,
  FLUENT_MEALS_WRITE_SCOPE,
  FLUENT_STYLE_READ_SCOPE,
  FLUENT_STYLE_WRITE_SCOPE,
} from '../auth';

export const LOCAL_AUTH_MODEL = 'local-bearer-token';
export const OSS_TOKEN_FILENAME = 'oss-access-token.json';
export const LOCAL_TOKEN_FILENAME = 'local-access-token.json';
export const OSS_TOKEN_ENV = 'FLUENT_OSS_TOKEN';
export const LOCAL_TOKEN_ENV = 'FLUENT_LOCAL_TOKEN';
export const LOCAL_TOKEN_ENV_ALIASES = [OSS_TOKEN_ENV, LOCAL_TOKEN_ENV] as const;

export interface LocalTokenState {
  authModel: typeof LOCAL_AUTH_MODEL;
  createdAt: string;
  rotatedAt: string | null;
  scopes: string[];
  token: string;
}

export function defaultLocalScopes(): string[] {
  return [
    FLUENT_MEALS_READ_SCOPE,
    FLUENT_MEALS_WRITE_SCOPE,
    FLUENT_HEALTH_READ_SCOPE,
    FLUENT_HEALTH_WRITE_SCOPE,
    FLUENT_STYLE_READ_SCOPE,
    FLUENT_STYLE_WRITE_SCOPE,
  ];
}

export function resolveLocalTokenFile(rootDir: string): string {
  const authDir = path.join(rootDir, 'auth');
  const preferredPath = path.join(authDir, OSS_TOKEN_FILENAME);
  const legacyPath = path.join(authDir, LOCAL_TOKEN_FILENAME);

  if (existsSync(preferredPath)) {
    return preferredPath;
  }
  if (existsSync(legacyPath)) {
    return legacyPath;
  }
  return preferredPath;
}

export function ensureLocalTokenState(rootDir: string): LocalTokenState {
  const tokenFile = resolveLocalTokenFile(rootDir);
  mkdirSync(path.dirname(tokenFile), { recursive: true });

  try {
    const existing = readLocalTokenState(rootDir);
    if (existing) {
      return existing;
    }
  } catch {
    // Regenerate below if the file is missing or malformed.
  }

  const now = new Date().toISOString();
  const state: LocalTokenState = {
    authModel: LOCAL_AUTH_MODEL,
    createdAt: now,
    rotatedAt: null,
    scopes: defaultLocalScopes(),
    token: generateLocalToken(),
  };
  writeLocalTokenState(tokenFile, state);
  return state;
}

export function rotateLocalTokenState(rootDir: string): LocalTokenState {
  const tokenFile = resolveLocalTokenFile(rootDir);
  mkdirSync(path.dirname(tokenFile), { recursive: true });
  const existing = readLocalTokenState(rootDir);
  const now = new Date().toISOString();
  const state: LocalTokenState = {
    authModel: LOCAL_AUTH_MODEL,
    createdAt: existing?.createdAt ?? now,
    rotatedAt: now,
    scopes: existing?.scopes?.length ? existing.scopes : defaultLocalScopes(),
    token: generateLocalToken(),
  };
  writeLocalTokenState(tokenFile, state);
  return state;
}

export function readLocalTokenState(rootDir: string): LocalTokenState | null {
  const tokenFile = resolveLocalTokenFile(rootDir);
  try {
    const raw = JSON.parse(readFileSync(tokenFile, 'utf8')) as Partial<LocalTokenState>;
    if (
      raw?.authModel !== LOCAL_AUTH_MODEL ||
      typeof raw?.token !== 'string' ||
      raw.token.length < 24 ||
      !Array.isArray(raw?.scopes)
    ) {
      return null;
    }
    return {
      authModel: LOCAL_AUTH_MODEL,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      rotatedAt: typeof raw.rotatedAt === 'string' ? raw.rotatedAt : null,
      scopes: raw.scopes.filter((scope): scope is string => typeof scope === 'string'),
      token: raw.token,
    };
  } catch {
    return null;
  }
}

export function authorizeLocalBearer(rootDir: string, authorizationHeader: string | undefined): LocalTokenState | null {
  const state = ensureLocalTokenState(rootDir);
  const presented = parseBearerToken(authorizationHeader);
  if (!presented) {
    return null;
  }
  const expectedBuffer = Buffer.from(state.token);
  const actualBuffer = Buffer.from(presented);
  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer) ? state : null;
}

function parseBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() || null;
}

function writeLocalTokenState(tokenFile: string, state: LocalTokenState): void {
  writeFileSync(tokenFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8' });
}

function generateLocalToken(): string {
  return randomBytes(24).toString('base64url');
}
