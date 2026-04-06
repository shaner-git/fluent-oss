import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { FluentBlobStore, FluentDatabase } from './storage';
import { wrapCloudflareBlobStore, wrapCloudflareDatabase } from './storage';

export type FluentBackendMode = 'hosted' | 'local';
export type FluentDeploymentTrack = 'cloud' | 'oss';
export type FluentStorageBackend = 'd1-r2' | 'sqlite-fs' | 'postgres-s3';

export interface CoreRuntimeBindings {
  artifacts: FluentBlobStore;
  authModel: string;
  db: FluentDatabase;
  deploymentTrack: FluentDeploymentTrack;
  imageDeliverySecret?: string;
  localArtifactsDir?: string;
  publicBaseUrl?: string;
  storageBackend: FluentStorageBackend;
}

export interface CloudRuntimeEnv {
  OAUTH_KV: KVNamespace;
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  IMAGE_DELIVERY_SECRET?: string;
  PUBLIC_BASE_URL?: string;
  ACCESS_CALLBACK_BASE_URL?: string;
  ALLOWED_EMAIL?: string;
  ALLOWED_EMAILS?: string;
  ACCESS_AUTHORIZATION_URL?: string;
  ACCESS_CLIENT_ID?: string;
  ACCESS_CLIENT_SECRET?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_TOKEN_URL?: string;
  COOKIE_ENCRYPTION_KEY?: string;
}

export type AppEnv = CoreRuntimeBindings;

export type OAuthAppEnv = CloudRuntimeEnv & {
  OAUTH_PROVIDER: OAuthHelpers;
};

export interface RuntimeConfig {
  deploymentTrack: FluentDeploymentTrack;
  hasStorage: boolean;
  hasAccessOAuthConfig: boolean;
  publicBaseUrl: string | null;
  allowedEmail: string | null;
  allowedEmails: string[];
  storageBackend: FluentStorageBackend;
}

export function readConfig(env: CloudRuntimeEnv): RuntimeConfig {
  const allowedEmails = parseAllowedEmails(env);
  return {
    deploymentTrack: 'cloud',
    hasStorage: Boolean(env.DB && env.ARTIFACTS && env.OAUTH_KV),
    hasAccessOAuthConfig: hasAccessOAuthConfig(env),
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim() || null,
    allowedEmail: allowedEmails[0] ?? null,
    allowedEmails,
    storageBackend: 'd1-r2',
  };
}

export function coreBindingsFromCloudEnv(env: CloudRuntimeEnv): CoreRuntimeBindings {
  return {
    artifacts: wrapCloudflareBlobStore(env.ARTIFACTS),
    authModel: 'cloudflare-access-oauth',
    db: wrapCloudflareDatabase(env.DB),
    deploymentTrack: 'cloud',
    imageDeliverySecret: env.IMAGE_DELIVERY_SECRET ?? env.COOKIE_ENCRYPTION_KEY,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    storageBackend: 'd1-r2',
  };
}

export function parseAllowedEmails(env: CloudRuntimeEnv): string[] {
  const values = [env.ALLOWED_EMAILS, env.ALLOWED_EMAIL]
    .flatMap((value) => (value ?? '').split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(values));
}

function hasAccessOAuthConfig(env: CloudRuntimeEnv): boolean {
  return Boolean(
    env.ACCESS_CLIENT_ID?.trim() &&
      env.ACCESS_CLIENT_SECRET?.trim() &&
      env.ACCESS_TOKEN_URL?.trim() &&
      env.ACCESS_AUTHORIZATION_URL?.trim() &&
      env.ACCESS_JWKS_URL?.trim() &&
      env.COOKIE_ENCRYPTION_KEY?.trim(),
  );
}
