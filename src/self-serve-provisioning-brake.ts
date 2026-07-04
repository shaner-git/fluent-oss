import type { FluentCloudAccessFailureCode } from './cloud-early-access';
import type { CloudRuntimeEnv } from './config';
import type { HostedCloudAccessDecision } from './hosted-access-state';
import type { FluentDatabase } from './storage';

export const DEFAULT_SELF_SERVE_DAILY_PROVISION_CAP = 25;

export type SelfServeProvisioningBrakeReason = 'daily_cap' | 'ip_rate_limit';

export type SelfServeProvisioningBrakeResult =
  | {
      allowed: true;
      applied: boolean;
    }
  | {
      allowed: false;
      code: Extract<FluentCloudAccessFailureCode, 'self_serve_capacity_reached'>;
      reason: SelfServeProvisioningBrakeReason;
    };

export class SelfServeProvisioningBrakeError extends Error {
  readonly code = 'self_serve_capacity_reached' as const;
  readonly reason: SelfServeProvisioningBrakeReason;

  constructor(reason: SelfServeProvisioningBrakeReason) {
    super('Fluent has reached today\'s self-serve provisioning capacity.');
    this.name = 'SelfServeProvisioningBrakeError';
    this.reason = reason;
  }
}

export function isSelfServeProvisioningBrakeError(error: unknown): error is SelfServeProvisioningBrakeError {
  return error instanceof SelfServeProvisioningBrakeError;
}

export function needsSelfServeProvisioningBrake(
  accessDecision: Pick<HostedCloudAccessDecision, 'allowed' | 'needsProvisioning' | 'provisioningSource'>,
): boolean {
  return Boolean(
    accessDecision.allowed &&
      accessDecision.needsProvisioning &&
      accessDecision.provisioningSource?.accessSource === 'self_serve',
  );
}

export async function checkSelfServeProvisioningBrake(
  db: FluentDatabase,
  env: Pick<CloudRuntimeEnv, 'FLUENT_PROVISION_RATE_LIMITER' | 'FLUENT_SELF_SERVE_DAILY_PROVISION_CAP'>,
  accessDecision: Pick<HostedCloudAccessDecision, 'allowed' | 'needsProvisioning' | 'provisioningSource'>,
  request?: Request | null,
): Promise<SelfServeProvisioningBrakeResult> {
  if (!needsSelfServeProvisioningBrake(accessDecision)) {
    return { allowed: true, applied: false };
  }

  const cap = parseSelfServeDailyProvisionCap(env.FLUENT_SELF_SERVE_DAILY_PROVISION_CAP);
  const provisionedToday = await countRecentSelfServeProvisioningEvents(db);
  if (provisionedToday >= cap) {
    return {
      allowed: false,
      code: 'self_serve_capacity_reached',
      reason: 'daily_cap',
    };
  }

  const limiter = env.FLUENT_PROVISION_RATE_LIMITER;
  if (!limiter) {
    return { allowed: true, applied: true };
  }

  const key = request?.headers.get('CF-Connecting-IP')?.trim() || 'unknown-client-ip';
  const result = await limiter.limit({ key });
  if (!result.success) {
    return {
      allowed: false,
      code: 'self_serve_capacity_reached',
      reason: 'ip_rate_limit',
    };
  }

  return { allowed: true, applied: true };
}

export async function assertSelfServeProvisioningAllowed(
  db: FluentDatabase,
  env: Pick<CloudRuntimeEnv, 'FLUENT_PROVISION_RATE_LIMITER' | 'FLUENT_SELF_SERVE_DAILY_PROVISION_CAP'>,
  accessDecision: Pick<HostedCloudAccessDecision, 'allowed' | 'needsProvisioning' | 'provisioningSource'>,
  request?: Request | null,
): Promise<void> {
  const brake = await checkSelfServeProvisioningBrake(db, env, accessDecision, request);
  if (!brake.allowed) {
    throw new SelfServeProvisioningBrakeError(brake.reason);
  }
}

export function parseSelfServeDailyProvisionCap(value: string | null | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_SELF_SERVE_DAILY_PROVISION_CAP;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_SELF_SERVE_DAILY_PROVISION_CAP;
  }

  return Math.floor(parsed);
}

async function countRecentSelfServeProvisioningEvents(db: FluentDatabase): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM fluent_cloud_onboarding_events
       WHERE event_type = 'cloud_onboarding.account_created'
         AND json_extract(metadata_json, '$.accessSource') = 'self_serve'
         AND julianday(created_at) >= julianday('now', '-24 hours')`,
    )
    .first<{ count: number | string | null }>();

  const count = Number(row?.count ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}
