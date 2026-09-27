import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getFluentIdentityContext } from './fluent-identity';
import type { FluentProfileRecord } from './fluent-core';

export const FLUENT_ACCOUNT_PROFILE_TOOL = 'fluent_get_account_profile';
export const accountProfileSchema = z.object({
  id: z.string().min(1).regex(/\S/),
  name: z.string().optional(),
}).strict();

// Identity keys are immutable and account provisioning never reassigns tenant IDs.
// Version the derivation independently of display metadata and OAuth grants.
export function buildAccountProfile(profile: FluentProfileRecord) {
  const identity = getFluentIdentityContext();
  if (!profile.tenantId?.trim() || !profile.id?.trim() ||
      profile.tenantId !== identity.tenantId || profile.id !== identity.profileId) {
    throw new Error('Authenticated Fluent profile identity unavailable.');
  }
  const id = `prf_${createHash('sha256')
    .update(JSON.stringify(['fluent-account-profile-v1', profile.tenantId, profile.id]))
    .digest('hex')}`;
  const name = profile.displayName?.trim();
  return accountProfileSchema.parse({ id, ...(name ? { name } : {}) });
}
