import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { HostedEmailBinding } from './hosted-email';
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
  EMAIL?: HostedEmailBinding;
  PURCHASE_BROWSER: Fetcher;
  PURCHASE_RUN_STATE: DurableObjectNamespace;
  PURCHASE_WORKFLOW: Workflow<import('./cloud/purchase/types').PurchaseRunCreateInput>;
  IMAGE_DELIVERY_SECRET?: string;
  PUBLIC_BASE_URL?: string;
  PURCHASE_RUNNER_INTERNAL_TOKEN?: string;
  FLUENT_VOILA_USERNAME?: string;
  FLUENT_VOILA_PASSWORD?: string;
  FLUENT_VOILA_TOTP?: string;
  FLUENT_VOILA_TOTP_SECRET?: string;
  ACCESS_CALLBACK_BASE_URL?: string;
  ALLOWED_EMAIL?: string;
  ALLOWED_EMAILS?: string;
  ACCESS_AUTHORIZATION_URL?: string;
  ACCESS_CLIENT_ID?: string;
  ACCESS_CLIENT_SECRET?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_TOKEN_URL?: string;
  BETTER_AUTH_API_KEY?: string;
  BETTER_AUTH_API_URL?: string;
  BETTER_AUTH_KV_URL?: string;
  BETTER_AUTH_MIGRATION_TOKEN?: string;
  ACCOUNT_DELETION_OPS_TOKEN?: string;
  BETTER_AUTH_SECRET?: string;
  COOKIE_ENCRYPTION_KEY?: string;
  FLUENT_CLOUD_ACCESS_MODE?: string;
  FLUENT_CLOUD_ENVIRONMENT?: string;
  FLUENT_USER_EXPORT_SELF_SERVE_DISABLED?: string;
  FLUENT_BILLING_PORTAL_URL?: string;
  STRIPE_BILLING_PORTAL_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  ALLOW_ALL_CLOUD_EMAILS_FOR_DEV?: string;
  HOSTED_EMAIL_FROM_ADDRESS?: string;
  HOSTED_EMAIL_FROM_NAME?: string;
}

export type AppEnv = CoreRuntimeBindings;

export type OAuthAppEnv = CloudRuntimeEnv & {
  OAUTH_PROVIDER: OAuthHelpers;
};

export interface RuntimeConfig {
  hasBetterAuthConfig: boolean;
  hasBetterAuthEmail: boolean;
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
    hasBetterAuthConfig: hasBetterAuthConfig(env),
    hasBetterAuthEmail: hasBetterAuthEmail(env),
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
    authModel: hasBetterAuthConfig(env) ? 'better-auth-oauth-provider' : 'cloudflare-access-oauth',
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

export function hasBetterAuthConfig(env: CloudRuntimeEnv): boolean {
  const hasRuntimeSecret = Boolean((env.BETTER_AUTH_SECRET ?? env.COOKIE_ENCRYPTION_KEY)?.trim());
  const hasExplicitBetterAuthSignal = Boolean(
    env.BETTER_AUTH_SECRET?.trim() ||
      env.BETTER_AUTH_API_KEY?.trim() ||
      env.BETTER_AUTH_API_URL?.trim() ||
      env.BETTER_AUTH_KV_URL?.trim() ||
      env.BETTER_AUTH_MIGRATION_TOKEN?.trim(),
  );
  return hasRuntimeSecret && hasExplicitBetterAuthSignal;
}

function hasBetterAuthEmail(env: CloudRuntimeEnv): boolean {
  return hasBetterAuthConfig(env) && Boolean(env.EMAIL);
}
