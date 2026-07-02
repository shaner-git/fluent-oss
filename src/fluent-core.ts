import { getFluentAuthProps, type MutationProvenance } from './auth';
import { buildChatGptSafeRuntimeEntitlement } from './account-billing';
import { getFluentCloudOnboardingRecord, type FluentCloudOnboardingRecord } from './cloud-onboarding';
import { markFluentCloudAccountActive } from './cloud-invites';
import { FLUENT_SUPPORT_EMAIL } from './cloud-early-access';
import type { CoreRuntimeBindings, FluentBackendMode, FluentDeploymentTrack } from './config';
import {
  FLUENT_CONTRACT_VERSION,
  FLUENT_GUIDANCE_RESOURCE_URIS,
  FLUENT_OPTIONAL_CAPABILITIES,
  FLUENT_TOOL_NAMES,
  fluentHostProfile,
  fluentHostProfiles,
  type FluentHostProfile,
} from './contract';
import { isStylePurchaseEvalReady, normalizeStyleProfile } from './domains/style/helpers';
import { getFluentIdentityContext } from './fluent-identity';
import {
  type ConsentEventLite,
  type ConsentVisibility,
  type FactAnnotation,
  type PcDomain,
  type PcHost,
  type PersonFact,
  type PersonFactKind,
  type PersonFactRejectAck,
  type PersonFactSource,
  type PersonFactStatus,
  type PersonFactWriteAck,
  PERSON_FACT_SCHEMA_VERSION,
  consentScopeChain,
  defaultVisibilityForKind,
  pathForFact,
  sectionForKind,
  validateConsentScopeKey,
  validateConsentVisibility,
  validatePersonFactValue,
  visibleTo,
} from './personal-context';
import type { FluentDatabase } from './storage';
import {
  calculateLapsedRetentionDeadline,
  calculateSubscriptionGraceDeadline,
  evaluateSubscriptionLifecycle,
} from './subscription-lifecycle';
import { torontoTimeZone } from './time';

export {
  FLUENT_OSS_DEFAULT_PROFILE_ID,
  FLUENT_OSS_DEFAULT_TENANT_ID,
  FLUENT_OWNER_PROFILE_ID,
  FLUENT_PRIMARY_TENANT_ID,
} from './fluent-identity';

export interface FluentTenantRecord {
  backendMode: FluentBackendMode;
  deploymentTrack: FluentDeploymentTrack;
  displayName: string;
  id: string;
  metadata: unknown;
  onboardingState: string;
  onboardingVersion: string;
  slug: string;
  status: string;
}

export interface FluentProfileRecord {
  displayName: string | null;
  id: string;
  metadata: unknown;
  tenantId: string;
  timezone: string;
}

export interface FluentDomainRecord {
  displayName: string;
  domainId: string;
  lifecycleState: string;
  metadata: unknown;
  onboardingState: string;
  onboardingVersion: string | null;
  tenantId: string;
}

export interface FluentCapabilities {
  availableDomains: FluentDomainRecord[];
  backendMode: FluentBackendMode;
  contractVersion: string;
  deploymentTrack: FluentDeploymentTrack;
  storageBackend: CoreRuntimeBindings['storageBackend'];
  enabledDomains: string[];
  readyDomains: string[];
  onboarding: {
    core: {
      state: string;
      version: string;
    };
    domains: Array<{
      domainId: string;
      state: string;
      version: string | null;
    }>;
  };
  optionalCapabilities: string[];
  profile: {
    displayName: string | null;
    timezone: string;
  };
  hostProfiles: FluentHostProfile[];
  toolDiscovery: {
    canonicalRegistry: 'mcp_tools_list';
    guidanceResources: string[];
    note: string;
    groups: FluentToolDiscoveryGroup[];
  };
}

export type FluentAccountAccessState = 'active' | 'limited' | 'pending' | 'unavailable';
export type FluentAccountEntitlementState =
  | 'active'
  | 'trialing'
  | 'past_due_grace'
  | 'limited'
  | 'canceled_retention'
  | 'retention_expired'
  | 'suspended'
  | 'deleted'
  | 'pending'
  | 'unavailable';

export interface FluentAccountStatus {
  accessState: FluentAccountAccessState;
  backendMode: FluentBackendMode;
  contractVersion: string;
  enabledDomains: string[];
  entitlement: {
    state: FluentAccountEntitlementState;
    summary: string;
    graceDeadline: string | null;
    retentionDeadline: string | null;
  };
  instructions: {
    deletion: string;
    export: string;
    manageAccount: string;
    support: string;
  };
  links: {
    deletion: string | null;
    export: string | null;
    manageAccount: string;
    supportEmail: string;
  };
  supportEmail: string;
}

export interface FluentToolDiscoveryGroup {
  id: 'core' | 'health_fitness' | 'meals_planning' | 'meals_shopping' | 'meals_cooking' | 'style';
  label: string;
  domainId: 'health' | 'meals' | 'style' | null;
  guidanceResourceUris: string[];
  toolPrefixes: string[];
  starterReadTools: string[];
  detailReadTools?: string[];
  starterWriteTools: string[];
  whenToUse: string;
  domainReady: boolean;
}

export interface FluentToolDirectory {
  canonicalRegistry: 'mcp_tools_list';
  guidanceResources: string[];
  note: string;
  toolNames: string[];
  groups: FluentToolDiscoveryGroup[];
}

export type FluentHostFamily = 'chatgpt_app' | 'claude' | 'openclaw' | 'codex' | 'generic_mcp' | 'unknown';
export type FluentIntentKind = 'read' | 'write' | 'render' | 'plan' | 'onboard' | 'unknown';
export type FluentNextActionDomain = 'core' | 'health' | 'meals' | 'style' | 'unknown';

export function resolveHostFamily(): FluentHostFamily {
  const clientName = getFluentAuthProps().oauthClientName?.trim().toLowerCase() ?? '';
  if (clientName.includes('claude')) {
    return 'claude';
  }
  if (clientName.includes('chatgpt') || clientName.includes('openai')) {
    return 'chatgpt_app';
  }
  if (clientName.includes('openclaw')) {
    return 'openclaw';
  }
  if (clientName.includes('codex')) {
    return 'codex';
  }
  return 'unknown';
}

export interface FluentNextActionsInput {
  domainHint?: FluentNextActionDomain | null;
  hostFamily?: FluentHostFamily | null;
  intent?: FluentIntentKind | null;
  userGoal?: string | null;
}

export interface FluentNextActions {
  domain: FluentNextActionDomain;
  domainReady: boolean | null;
  guidanceResources: string[];
  hostProfile: FluentHostProfile;
  hostFamily: FluentHostFamily;
  primaryAction: FluentRecommendedAction;
  recommendedActions: FluentRecommendedAction[];
  routingNotes: string[];
  warnings: string[];
  writePolicy: string;
}

export interface FluentRecommendedAction {
  tool: string;
  reason: string;
  kind: 'read' | 'write' | 'render' | 'onboard' | 'host_action';
}

export class FluentCoreService {
  constructor(private readonly db: FluentDatabase, private readonly runtime: CoreRuntimeBindings) {}

  private get tenantId(): string {
    return getFluentIdentityContext().tenantId;
  }

  private get profileId(): string {
    return getFluentIdentityContext().profileId;
  }

  async getCapabilities(): Promise<FluentCapabilities> {
    const [tenant, profile, domains] = await Promise.all([this.getTenant(), this.getProfile(), this.listDomains()]);
    const readyDomains = domains.filter((domain) => isDomainReady(domain)).map((domain) => domain.domainId);

    return {
      availableDomains: domains,
      backendMode: tenant.backendMode,
      contractVersion: FLUENT_CONTRACT_VERSION,
      deploymentTrack: tenant.deploymentTrack,
      storageBackend: this.runtime.storageBackend,
      enabledDomains: domains.filter((domain) => domain.lifecycleState === 'enabled').map((domain) => domain.domainId),
      readyDomains,
      onboarding: {
        core: {
          state: tenant.onboardingState,
          version: tenant.onboardingVersion,
        },
        domains: domains.map((domain) => ({
          domainId: domain.domainId,
          state: domain.onboardingState,
          version: domain.onboardingVersion,
        })),
      },
      optionalCapabilities: [...FLUENT_OPTIONAL_CAPABILITIES],
      profile: {
        displayName: profile.displayName,
        timezone: profile.timezone,
      },
      hostProfiles: fluentHostProfiles({
        readyDomains: readyDomains.filter(isChatGptAppDomain),
      }),
      toolDiscovery: buildToolDiscovery(readyDomains),
    };
  }

  async getToolDirectory(): Promise<FluentToolDirectory> {
    const domains = await this.listDomains();
    const readyDomains = domains.filter((domain) => isDomainReady(domain)).map((domain) => domain.domainId);
    return buildToolDirectory(readyDomains);
  }

  async getNextActions(input: FluentNextActionsInput = {}): Promise<FluentNextActions> {
    const domains = await this.listDomains();
    const readyDomains = domains.filter((domain) => isDomainReady(domain)).map((domain) => domain.domainId);
    return buildNextActions({
      domains,
      input,
      readyDomains,
    });
  }

  async getAccountStatus(): Promise<FluentAccountStatus> {
    const [tenant, domains] = await Promise.all([this.getTenant(), this.listDomains()]);
    const enabledDomains = domains.filter((domain) => domain.lifecycleState === 'enabled').map((domain) => domain.domainId);
    const accountBaseUrl = meetFluentAccountBaseUrl(this.runtime.publicBaseUrl);
    const accountRecord =
      this.runtime.deploymentTrack === 'cloud'
        ? await this.getCurrentCloudAccountRecord()
        : null;
    const authProps = getFluentAuthProps();
    const runtimeEntitlement =
      this.runtime.deploymentTrack === 'cloud'
        ? await buildChatGptSafeRuntimeEntitlement(this.db, {
            email: authProps.email ?? accountRecord?.email ?? null,
            tenantId: authProps.tenantId ?? accountRecord?.tenantId ?? this.tenantId,
            userId: authProps.userId ?? accountRecord?.userId ?? null,
          })
        : null;
    const entitlement = buildAccountEntitlement(accountRecord, this.runtime.deploymentTrack, runtimeEntitlement);
    const accessState = buildAccountAccessState(accountRecord, tenant.status, this.runtime.deploymentTrack);
    const links = buildAccountLinks(accountBaseUrl, entitlement.state);

    return {
      accessState,
      backendMode: tenant.backendMode,
      contractVersion: FLUENT_CONTRACT_VERSION,
      enabledDomains,
      entitlement,
      instructions: buildAccountInstructions(this.runtime.deploymentTrack, entitlement.state),
      links,
      supportEmail: FLUENT_SUPPORT_EMAIL,
    };
  }

  async getProfile(): Promise<FluentProfileRecord> {
    const row = await this.db
      .prepare(
        `SELECT tenant_id, profile_id, display_name, timezone, metadata_json
         FROM fluent_profile
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(this.tenantId, this.profileId)
      .first<{
        tenant_id: string;
        profile_id: string;
        display_name: string | null;
        timezone: string | null;
        metadata_json: string | null;
      }>();

    if (!row) {
      throw new Error(`Missing Fluent profile for tenant ${this.tenantId} and profile ${this.profileId}.`);
    }

    return {
      displayName: row.display_name,
      id: row.profile_id,
      metadata: safeParse(row.metadata_json),
      tenantId: row.tenant_id,
      timezone: row.timezone?.trim() || torontoTimeZone(),
    };
  }

  async updateProfile(
    input: {
      displayName?: string | null;
      metadata?: unknown;
      timezone?: string | null;
    },
    provenance: MutationProvenance,
  ): Promise<FluentProfileRecord> {
    const before = await this.getProfile();
    const displayName = input.displayName === undefined ? before.displayName : normalizeNullableText(input.displayName);
    const timezone = normalizeTimeZone(input.timezone, before.timezone);
    const metadata = input.metadata === undefined ? before.metadata : parseJsonLike(input.metadata);

    await this.db
      .prepare(
        `UPDATE fluent_profile
         SET display_name = ?, timezone = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(displayName, timezone, stringifyJson(metadata), this.tenantId, this.profileId)
      .run();

    const after = await this.getProfile();
    await this.recordCoreEvent({
      after,
      before,
      entityId: after.id,
      entityType: 'fluent_profile',
      eventType: 'profile.updated',
      patch: {
        display_name: displayName,
        timezone,
      },
      provenance,
    });
    return after;
  }

  async listDomains(): Promise<FluentDomainRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT tenant_id, domain_id, display_name, lifecycle_state, onboarding_state, onboarding_version, metadata_json
         FROM fluent_domains
         WHERE tenant_id = ?`,
      )
      .bind(this.tenantId)
      .all<{
        tenant_id: string;
        domain_id: string;
        display_name: string;
        lifecycle_state: string;
        onboarding_state: string;
        onboarding_version: string | null;
        metadata_json: string | null;
      }>();

    const domains = (result.results ?? [])
      .map((row) => ({
        displayName: row.display_name,
        domainId: row.domain_id,
        lifecycleState: row.lifecycle_state,
        metadata: buildDomainMetadata({
          domainId: row.domain_id,
          lifecycleState: row.lifecycle_state,
          metadata: safeParse(row.metadata_json),
          onboardingState: row.onboarding_state,
        }),
        onboardingState: row.onboarding_state,
        onboardingVersion: row.onboarding_version,
        tenantId: row.tenant_id,
      }))
      .sort((left, right) => {
        const lifecycleDelta = lifecycleOrder(left.lifecycleState) - lifecycleOrder(right.lifecycleState);
        if (lifecycleDelta !== 0) {
          return lifecycleDelta;
        }
        return left.domainId.localeCompare(right.domainId);
      });

    return Promise.all(domains.map((domain) => this.resolveEffectiveDomain(domain)));
  }

  async enableDomain(domainId: string, provenance: MutationProvenance): Promise<FluentDomainRecord> {
    return this.updateDomain(domainId, { lifecycleState: 'enabled' }, provenance, 'domain.enabled');
  }

  async disableDomain(domainId: string, provenance: MutationProvenance): Promise<FluentDomainRecord> {
    return this.updateDomain(domainId, { lifecycleState: 'disabled' }, provenance, 'domain.disabled');
  }

  async beginDomainOnboarding(
    domainId: string,
    input: { onboardingVersion?: string | null },
    provenance: MutationProvenance,
  ): Promise<FluentDomainRecord> {
    const before = await this.getDomain(domainId);
    assertOnboardingAllowed(before);
    return this.updateDomain(
      domainId,
      {
        onboardingState: 'onboarding_started',
        onboardingVersion: normalizeVersion(input.onboardingVersion),
      },
      provenance,
      'domain.onboarding_started',
      before,
    );
  }

  async completeDomainOnboarding(
    domainId: string,
    input: { onboardingVersion?: string | null },
    provenance: MutationProvenance,
  ): Promise<FluentDomainRecord> {
    const before = await this.getDomain(domainId);
    assertOnboardingAllowed(before);
    await this.assertCompletionAllowed(domainId);
    return this.updateDomain(
      domainId,
      {
        onboardingState: 'onboarding_completed',
        onboardingVersion: normalizeVersion(input.onboardingVersion),
      },
      provenance,
      'domain.onboarding_completed',
      before,
    );
  }

  async getProfileTimeZone(): Promise<string> {
    return (await this.getProfile()).timezone;
  }

  private async getTenant(): Promise<FluentTenantRecord> {
    const row = await this.db
      .prepare(
        `SELECT id, slug, display_name, backend_mode, status, onboarding_state, onboarding_version, metadata_json
         FROM fluent_tenants
         WHERE id = ?`,
      )
      .bind(this.tenantId)
      .first<{
        id: string;
        slug: string;
        display_name: string;
        backend_mode: string | null;
        status: string;
        onboarding_state: string;
        onboarding_version: string | null;
        metadata_json: string | null;
      }>();

    if (!row) {
      throw new Error('Missing Fluent tenant record.');
    }

    return {
      backendMode: row.backend_mode === 'local' ? 'local' : this.runtime.deploymentTrack === 'cloud' ? 'hosted' : 'local',
      deploymentTrack: this.runtime.deploymentTrack,
      displayName: row.display_name,
      id: row.id,
      metadata: safeParse(row.metadata_json),
      onboardingState: row.onboarding_state,
      onboardingVersion: row.onboarding_version || '1',
      slug: row.slug,
      status: row.status,
    };
  }

  private async getCurrentCloudAccountRecord(): Promise<FluentCloudOnboardingRecord | null> {
    const authProps = getFluentAuthProps();
    return getFluentCloudOnboardingRecord(this.db, {
      email: authProps.email ?? null,
      tenantId: authProps.tenantId ?? this.tenantId,
      userId: authProps.userId ?? null,
    });
  }

  private async getDomain(domainId: string): Promise<FluentDomainRecord> {
    const row = await this.db
      .prepare(
        `SELECT tenant_id, domain_id, display_name, lifecycle_state, onboarding_state, onboarding_version, metadata_json
         FROM fluent_domains
         WHERE tenant_id = ? AND domain_id = ?`,
      )
      .bind(this.tenantId, domainId)
      .first<{
        tenant_id: string;
        domain_id: string;
        display_name: string;
        lifecycle_state: string;
        onboarding_state: string;
        onboarding_version: string | null;
        metadata_json: string | null;
      }>();

    if (!row) {
      throw new Error(`Unknown Fluent domain: ${domainId}`);
    }

    const domain = {
      displayName: row.display_name,
      domainId: row.domain_id,
      lifecycleState: row.lifecycle_state,
      metadata: buildDomainMetadata({
        domainId: row.domain_id,
        lifecycleState: row.lifecycle_state,
        metadata: safeParse(row.metadata_json),
        onboardingState: row.onboarding_state,
      }),
      onboardingState: row.onboarding_state,
      onboardingVersion: row.onboarding_version,
      tenantId: row.tenant_id,
    };

    return this.resolveEffectiveDomain(domain);
  }

  private async resolveEffectiveDomain(domain: FluentDomainRecord): Promise<FluentDomainRecord> {
    let effectiveOnboardingState = domain.onboardingState;
    if (domain.domainId === 'style') {
      const ready = await this.isStyleReady();
      effectiveOnboardingState =
        domain.lifecycleState === 'enabled' &&
        domain.onboardingState === 'onboarding_completed' &&
        !ready
          ? 'onboarding_started'
          : domain.onboardingState;
    }
    if (domain.domainId === 'health') {
      const ready = await this.isHealthReady();
      effectiveOnboardingState =
        domain.lifecycleState === 'enabled' &&
        domain.onboardingState === 'onboarding_completed' &&
        !ready
          ? 'onboarding_started'
          : effectiveOnboardingState;
    }

    return {
      ...domain,
      metadata: buildDomainMetadata({
        domainId: domain.domainId,
        lifecycleState: domain.lifecycleState,
        metadata: domain.metadata,
        onboardingState: effectiveOnboardingState,
      }),
      onboardingState: effectiveOnboardingState,
    };
  }

  private async assertCompletionAllowed(domainId: string): Promise<void> {
    if (domainId !== 'style') {
      return;
    }

    if (!(await this.isStyleReady())) {
      throw new Error(
        'Domain style is not ready to complete onboarding. Finish Style calibration before marking onboarding complete.',
      );
    }
  }

  private async isStyleReady(): Promise<boolean> {
    const [profileRow, itemCountRow, primaryPhotoCountRow, itemProfileCountRow] = await Promise.all([
      this.db
        .prepare(
          `SELECT raw_json
           FROM style_profile
           WHERE tenant_id = ?
           LIMIT 1`,
        )
        .bind(this.tenantId)
        .first<{ raw_json: string | null }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM style_items
           WHERE tenant_id = ?`,
        )
        .bind(this.tenantId)
        .first<{ count: number | string | null }>(),
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT item_id) AS count
           FROM style_item_photos
           WHERE tenant_id = ? AND is_primary = 1`,
        )
        .bind(this.tenantId)
        .first<{ count: number | string | null }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM style_item_profiles
           WHERE tenant_id = ?`,
        )
        .bind(this.tenantId)
        .first<{ count: number | string | null }>(),
    ]);

    const profile = normalizeStyleProfile(profileRow?.raw_json ?? null);
    const itemCount = asCount(itemCountRow?.count);
    const primaryPhotoCount = asCount(primaryPhotoCountRow?.count);
    const itemProfileCount = asCount(itemProfileCountRow?.count);

    if (isStylePurchaseEvalReady(profile, { itemCount, itemProfileCount, primaryPhotoCount })) {
      return true;
    }

    // Preserve strict onboarding for fresh or sparse closets, but keep mature imported
    // closets from being downgraded just because the legacy style_profile row is absent.
    return !profileRow && itemCount >= 24 && primaryPhotoCount >= 12 && itemProfileCount >= 24;
  }

  private async isHealthReady(): Promise<boolean> {
    const [preferencesRow, activeBlockCountRow, goalCountRow, workoutCountRow, metricCountRow] = await Promise.all([
      this.db
        .prepare(
          `SELECT updated_at
           FROM health_preferences
           WHERE tenant_id = ? AND profile_id = ?
           LIMIT 1`,
        )
        .bind(this.tenantId, this.profileId)
        .first<{ updated_at: string | null }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM health_training_blocks
           WHERE tenant_id = ? AND profile_id = ?`,
        )
        .bind(this.tenantId, this.profileId)
        .first<{ count: number | string | null }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM health_goals
           WHERE tenant_id = ? AND profile_id = ?`,
        )
        .bind(this.tenantId, this.profileId)
        .first<{ count: number | string | null }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM health_workout_logs
           WHERE tenant_id = ? AND profile_id = ?`,
        )
        .bind(this.tenantId, this.profileId)
        .first<{ count: number | string | null }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM health_body_metrics
           WHERE tenant_id = ? AND profile_id = ?`,
        )
        .bind(this.tenantId, this.profileId)
        .first<{ count: number | string | null }>(),
    ]);

    return (
      Boolean(preferencesRow?.updated_at) ||
      asCount(activeBlockCountRow?.count) > 0 ||
      asCount(goalCountRow?.count) > 0 ||
      asCount(workoutCountRow?.count) > 0 ||
      asCount(metricCountRow?.count) > 0
    );
  }

  private async updateDomain(
    domainId: string,
    changes: {
      lifecycleState?: string;
      onboardingState?: string;
      onboardingVersion?: string | null;
    },
    provenance: MutationProvenance,
    eventType: string,
    before?: FluentDomainRecord,
  ): Promise<FluentDomainRecord> {
    const prior = before ?? (await this.getDomain(domainId));
    const lifecycleState = changes.lifecycleState ?? prior.lifecycleState;
    const onboardingState = changes.onboardingState ?? prior.onboardingState;
    const onboardingVersion =
      changes.onboardingVersion === undefined ? prior.onboardingVersion : normalizeVersion(changes.onboardingVersion);

    await this.db
      .prepare(
        `UPDATE fluent_domains
         SET lifecycle_state = ?, onboarding_state = ?, onboarding_version = ?, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND domain_id = ?`,
      )
      .bind(lifecycleState, onboardingState, onboardingVersion, this.tenantId, domainId)
      .run();

    const after = await this.getDomain(domainId);
    await this.recordCoreEvent({
      after,
      before: prior,
      entityId: after.domainId,
      entityType: 'fluent_domain',
      eventType,
      patch: {
        lifecycle_state: lifecycleState,
        onboarding_state: onboardingState,
        onboarding_version: onboardingVersion,
      },
      provenance,
    });
    await this.syncTenantOnboardingState(provenance);
    return after;
  }

  private async syncTenantOnboardingState(provenance: MutationProvenance): Promise<void> {
    if (this.runtime.deploymentTrack !== 'cloud') {
      return;
    }

    const before = await this.getTenant();
    const domains = await this.listDomains();
    const readyDomainCount = domains.filter((domain) => isDomainReady(domain)).length;
    const hasOnboardingActivity = domains.some(
      (domain) => domain.lifecycleState === 'enabled' || domain.onboardingState === 'onboarding_started',
    );
    const nextStatus = before.status === 'active' || readyDomainCount > 0 ? 'active' : 'onboarding';
    const nextOnboardingState =
      before.onboardingState === 'onboarding_completed' || readyDomainCount > 0
        ? 'onboarding_completed'
        : hasOnboardingActivity
          ? 'onboarding_started'
          : 'not_started';

    if (before.status === nextStatus && before.onboardingState === nextOnboardingState) {
      return;
    }

    await this.db
      .prepare(
        `UPDATE fluent_tenants
         SET status = ?, onboarding_state = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(nextStatus, nextOnboardingState, this.tenantId)
      .run();

    const after = await this.getTenant();
    await this.recordCoreEvent({
      after,
      before,
      entityId: after.id,
      entityType: 'fluent_tenant',
      eventType: 'tenant.onboarding_updated',
      patch: {
        onboarding_state: after.onboardingState,
        status: after.status,
      },
      provenance,
    });

    if (before.status !== 'active' && after.status === 'active') {
      const waitlistEntryId = asRecord(after.metadata)?.cloudAccess;
      await markFluentCloudAccountActive(this.db, {
        actor: {
          actorEmail: provenance.actorEmail,
          actorId: provenance.sessionId,
          actorType: provenance.sourceType === 'operator' ? 'operator' : provenance.sourceType === 'user' ? 'user' : 'system',
        },
        tenantId: after.id,
        waitlistEntryId:
          waitlistEntryId && typeof waitlistEntryId === 'object' && !Array.isArray(waitlistEntryId)
            ? typeof (waitlistEntryId as Record<string, unknown>).waitlistEntryId === 'string'
              ? ((waitlistEntryId as Record<string, unknown>).waitlistEntryId as string)
              : null
            : null,
      });
    }
  }

  // ---- Personal-Context Schema v1 (D18): canonical cross-domain person facts ----

  // THE consent chokepoint. No unfiltered read exists: callers MUST pass consumerDomain + host,
  // and the result is filtered server-side via visibleTo (incl. the host-boundary drop).
  async listPersonFacts(input: { consumerDomain: PcDomain; host: PcHost }): Promise<PersonFact[]> {
    const [factResult, consentResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT ${PERSON_FACT_COLUMNS}
             FROM person_facts
            WHERE tenant_id = ? AND profile_id = ? AND status IN ('confirmed', 'system')`,
        )
        .bind(this.tenantId, this.profileId)
        .all<PersonFactRow>(),
      this.db
        .prepare(
          `SELECT scope_key, visibility_json, occurred_at
             FROM person_consent_events
            WHERE tenant_id = ? AND profile_id = ?
            ORDER BY occurred_at DESC`,
        )
        .bind(this.tenantId, this.profileId)
        .all<{ scope_key: string; visibility_json: string; occurred_at: string }>(),
    ]);

    // Defensive parse: a malformed stored consent row is skipped, never crashes the read.
    const consent: ConsentEventLite[] = (consentResult.results ?? []).flatMap((row) => {
      try {
        return [
          {
            scope_key: validateConsentScopeKey(row.scope_key),
            visibility: validateConsentVisibility(safeParse(row.visibility_json)),
            occurred_at: row.occurred_at,
          },
        ];
      } catch {
        return [];
      }
    });
    return (factResult.results ?? [])
      .map((row) => personFactFromRow(row))
      .filter((fact) => {
        const chain = consentScopeChain(fact);
        return visibleTo(
          fact,
          input.consumerDomain,
          input.host,
          consent.filter((event) => chain.includes(event.scope_key)),
        );
      });
  }

  private async getPersonFactByPath(path: string): Promise<PersonFact | null> {
    const row = await this.db
      .prepare(`SELECT ${PERSON_FACT_COLUMNS} FROM person_facts WHERE tenant_id = ? AND profile_id = ? AND path = ?`)
      .bind(this.tenantId, this.profileId, path)
      .first<PersonFactRow>();
    return row ? personFactFromRow(row) : null;
  }

  // D16-for-data: a write with status 'inferred' may ONLY append to annotations[]; it can NEVER set,
  // mutate, or supersede a confirmed `value`. Confirmed/system writes upsert the canonical row.
  async upsertPersonFact(
    input: {
      kind: PersonFactKind;
      value: unknown;
      status: PersonFactStatus;
      source: PersonFactSource;
      visibility?: ConsentVisibility;
      note?: string | null;
      questionId?: string | null;
      staleAfter?: string | null;
      confidence?: number;
    },
    provenance: MutationProvenance,
  ): Promise<PersonFactWriteAck> {
    const value = validatePersonFactValue(input.kind, input.value);
    const path = pathForFact(input.kind, value);
    const section = sectionForKind(input.kind);
    const existing = await this.getPersonFactByPath(path);
    const now = new Date().toISOString();

    if (input.status === 'inferred') {
      const annotation: FactAnnotation = {
        observed_value: value,
        status: 'inferred',
        source: input.source,
        confidence: clampConfidenceValue(input.confidence ?? 0.5),
        observed_at: now,
        promotable: true,
      };
      if (existing && existing.status !== 'inferred') {
        // Confirmed/system canonical row exists: append the inference, never touch `value`.
        const annotations = [...existing.annotations, annotation].slice(-12);
        await this.db
          .prepare(
            `UPDATE person_facts SET annotations_json = ?, updated_at = CURRENT_TIMESTAMP
              WHERE tenant_id = ? AND profile_id = ? AND path = ?`,
          )
          .bind(stringifyJson(annotations), this.tenantId, this.profileId, path)
          .run();
        const after: PersonFact = { ...existing, annotations };
        await this.recordCoreEvent({
          after,
          before: existing,
          entityId: existing.fact_id,
          entityType: 'person_fact',
          eventType: 'person_fact.annotated',
          patch: { annotation },
          provenance,
        });
        // Return only an ack — never the existing confirmed value/visibility (a write must not become
        // an unfiltered read). Host-facing read-after-write goes through listPersonFacts.
        return { factId: existing.fact_id, path, status: existing.status };
      }
      // No canonical (confirmed/system) row yet: store an inferred row (never surfaces — visibleTo drops it).
      const inferred: PersonFact = {
        fact_id: existing?.fact_id ?? `pf_${crypto.randomUUID()}`,
        path,
        section,
        kind: input.kind,
        value,
        status: 'inferred',
        confidence: clampConfidenceValue(input.confidence ?? 0.5),
        source: input.source,
        question_id: input.questionId ?? null,
        note: input.note ?? null,
        visibility: input.visibility ?? defaultVisibilityForKind(input.kind),
        annotations: [...(existing?.annotations ?? []), annotation].slice(-12),
        supersedes: null,
        observed_at: existing?.observed_at ?? now,
        confirmed_at: null,
        stale_after: input.staleAfter ?? null,
        schema_version: PERSON_FACT_SCHEMA_VERSION,
      };
      await this.writePersonFactRow(inferred);
      await this.recordCoreEvent({
        after: inferred,
        before: existing,
        entityId: inferred.fact_id,
        entityType: 'person_fact',
        eventType: 'person_fact.inferred',
        patch: { annotation },
        provenance,
      });
      return { factId: inferred.fact_id, path, status: inferred.status };
    }

    // confirmed | system: upsert the canonical row ("confirmed wins" via the per-path primary key).
    // Supersedes is computed per path; value-keyed kinds corrected to a different value land on
    // a new path, leaving old-value removal to an explicit reject.
    const fact: PersonFact = {
      fact_id: `pf_${crypto.randomUUID()}`,
      path,
      section,
      kind: input.kind,
      value,
      status: input.status,
      confidence: 1,
      source: input.source,
      question_id: input.questionId ?? null,
      note: input.note ?? null,
      visibility: input.visibility ?? existing?.visibility ?? defaultVisibilityForKind(input.kind),
      annotations: existing?.annotations ?? [],
      supersedes: existing?.fact_id ?? null,
      observed_at: existing?.observed_at ?? now,
      confirmed_at: input.status === 'confirmed' ? now : (existing?.confirmed_at ?? null),
      stale_after: input.staleAfter ?? null,
      schema_version: PERSON_FACT_SCHEMA_VERSION,
    };
    await this.writePersonFactRow(fact);
    await this.recordCoreEvent({
      after: fact,
      before: existing,
      entityId: fact.fact_id,
      entityType: 'person_fact',
      eventType: existing ? 'profile.fact_superseded' : 'person_fact.confirmed',
      patch: { value, status: input.status },
      provenance,
    });
    return { factId: fact.fact_id, path, status: fact.status };
  }

  async rejectPersonFact(
    input: { kind: PersonFactKind; value: unknown },
    provenance: MutationProvenance,
  ): Promise<PersonFactRejectAck> {
    const value = validatePersonFactValue(input.kind, input.value);
    const path = pathForFact(input.kind, value);
    const existing = await this.getPersonFactByPath(path);
    if (!existing) {
      return { path, removed: false };
    }

    await this.db
      .prepare('DELETE FROM person_facts WHERE tenant_id = ? AND profile_id = ? AND path = ?')
      .bind(this.tenantId, this.profileId, path)
      .run();
    await this.recordCoreEvent({
      after: null,
      before: existing,
      entityId: existing.fact_id,
      entityType: 'person_fact',
      eventType: 'profile.fact_rejected',
      patch: { kind: input.kind, path, value },
      provenance,
    });
    return { path, removed: true };
  }

  async appendPersonConsentEvent(
    input: { scopeKey: string; visibility: ConsentVisibility },
    provenance: MutationProvenance,
  ): Promise<void> {
    const scopeKey = validateConsentScopeKey(input.scopeKey);
    const visibility = validateConsentVisibility(input.visibility);
    await this.db
      .prepare(
        `INSERT INTO person_consent_events (tenant_id, profile_id, event_id, scope_key, visibility_json, source_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        this.tenantId,
        this.profileId,
        `pce_${crypto.randomUUID()}`,
        scopeKey,
        stringifyJson(visibility),
        stringifyJson({ sourceAgent: provenance.sourceAgent, sourceType: provenance.sourceType }),
        new Date().toISOString(),
      )
      .run();
    await this.recordCoreEvent({
      after: { scopeKey, visibility },
      before: null,
      entityId: scopeKey,
      entityType: 'person_consent',
      eventType: 'person_consent.set',
      provenance,
    });
  }

  private async writePersonFactRow(fact: PersonFact): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO person_facts (
           tenant_id, profile_id, fact_id, path, section, kind, value_json, status, confidence,
           source_json, visibility_json, annotations_json, supersedes, question_id, note,
           observed_at, confirmed_at, stale_after, schema_version, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(tenant_id, profile_id, path) DO UPDATE SET
           fact_id = excluded.fact_id, section = excluded.section, kind = excluded.kind,
           value_json = excluded.value_json, status = excluded.status, confidence = excluded.confidence,
           source_json = excluded.source_json, visibility_json = excluded.visibility_json,
           annotations_json = excluded.annotations_json, supersedes = excluded.supersedes,
           question_id = excluded.question_id, note = excluded.note, observed_at = excluded.observed_at,
           confirmed_at = excluded.confirmed_at, stale_after = excluded.stale_after,
           schema_version = excluded.schema_version, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        this.tenantId,
        this.profileId,
        fact.fact_id,
        fact.path,
        fact.section,
        fact.kind,
        stringifyJson(fact.value),
        fact.status,
        fact.confidence,
        stringifyJson(fact.source),
        stringifyJson(fact.visibility),
        stringifyJson(fact.annotations),
        fact.supersedes,
        fact.question_id,
        fact.note,
        fact.observed_at,
        fact.confirmed_at,
        fact.stale_after,
        fact.schema_version,
      )
      .run();
  }

  private async recordCoreEvent(input: {
    entityType: string;
    entityId: string | null;
    eventType: string;
    before: unknown;
    after: unknown;
    patch?: unknown;
    provenance: MutationProvenance;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO domain_events (
          id, domain, entity_type, entity_id, event_type, before_json, after_json, patch_json,
          source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `domain-event:${crypto.randomUUID()}`,
        'core',
        input.entityType,
        input.entityId,
        input.eventType,
        stringifyJson(input.before),
        stringifyJson(input.after),
        stringifyJson(input.patch),
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
        input.provenance.actorEmail,
        input.provenance.actorName,
      )
      .run();
  }
}

const PERSON_FACT_COLUMNS =
  `fact_id, path, section, kind, value_json, status, confidence, source_json, visibility_json, ` +
  `annotations_json, supersedes, question_id, note, observed_at, confirmed_at, stale_after, schema_version`;

interface PersonFactRow {
  fact_id: string;
  path: string;
  section: string;
  kind: string;
  value_json: string;
  status: string;
  confidence: number;
  source_json: string;
  visibility_json: string;
  annotations_json: string;
  supersedes: string | null;
  question_id: string | null;
  note: string | null;
  observed_at: string;
  confirmed_at: string | null;
  stale_after: string | null;
  schema_version: number;
}

function personFactFromRow(row: PersonFactRow): PersonFact {
  return {
    fact_id: row.fact_id,
    path: row.path,
    section: row.section as PersonFact['section'],
    kind: row.kind as PersonFactKind,
    value: safeParse(row.value_json) as PersonFact['value'],
    status: row.status as PersonFactStatus,
    confidence: row.confidence,
    source: safeParse(row.source_json) as PersonFactSource,
    question_id: row.question_id,
    note: row.note,
    visibility: safeParse(row.visibility_json) as ConsentVisibility,
    annotations: (safeParse(row.annotations_json) as FactAnnotation[] | null) ?? [],
    supersedes: row.supersedes,
    observed_at: row.observed_at,
    confirmed_at: row.confirmed_at,
    stale_after: row.stale_after,
    schema_version: row.schema_version,
  };
}

function clampConfidenceValue(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeTimeZone(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback || torontoTimeZone();
}

function normalizeVersion(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || '1';
}

function isDomainReady(domain: Pick<FluentDomainRecord, 'lifecycleState' | 'onboardingState'>): boolean {
  return domain.lifecycleState === 'enabled' && domain.onboardingState === 'onboarding_completed';
}

function assertOnboardingAllowed(domain: Pick<FluentDomainRecord, 'domainId' | 'lifecycleState'>) {
  if (domain.lifecycleState === 'disabled') {
    throw new Error(`Domain ${domain.domainId} is disabled and must be explicitly re-enabled before onboarding can continue.`);
  }
  if (domain.lifecycleState !== 'enabled') {
    throw new Error(`Domain ${domain.domainId} must be enabled before onboarding can continue.`);
  }
}

function buildDomainMetadata(input: {
  domainId: string;
  lifecycleState: string;
  metadata: unknown;
  onboardingState: string;
}) {
  const base = asRecord(input.metadata);
  const normalizedBase = { ...(base ?? {}) };
  const canonicalSkill = canonicalDomainSkill(input.domainId, normalizedBase);
  if (canonicalSkill) {
    normalizedBase.skill = canonicalSkill;
  } else {
    delete normalizedBase.skill;
  }
  const ready = isDomainReady(input);
  const packageSkill = canonicalSkill && canonicalSkill.startsWith('fluent-') ? canonicalSkill : null;
  const workflowSkill = canonicalSkill;
  const lifecycleAction =
    input.lifecycleState === 'disabled'
      ? 'manual_reenable_required'
      : input.lifecycleState === 'available'
        ? 'first_use_enable'
        : ready
          ? 'ready'
          : 'resume_onboarding';
  const fluentMetadata = {
    activationFlow: lifecycleAction,
    lifecycleAction,
    onboardingOwner: packageSkill ?? workflowSkill,
    packageSkill,
    ready,
    requiresExplicitEnable: input.lifecycleState === 'disabled',
    workflowSkill,
  };

  return {
    ...normalizedBase,
    fluent: fluentMetadata,
  };
}

function lifecycleOrder(value: string): number {
  switch (value) {
    case 'enabled':
      return 0;
    case 'available':
      return 1;
    case 'disabled':
      return 2;
    default:
      return 3;
  }
}

function canonicalDomainSkill(domainId: string, metadata: Record<string, unknown>): string | null {
  if (domainId === 'health') {
    return 'fluent-health';
  }
  if (domainId === 'meals') {
    return 'fluent-meals';
  }
  if (domainId === 'style') {
    return 'fluent-style';
  }

  return typeof metadata.skill === 'string' ? metadata.skill : null;
}

function buildToolDiscovery(readyDomains: string[]): FluentCapabilities['toolDiscovery'] {
  const isReady = (domainId: 'health' | 'meals' | 'style') => readyDomains.includes(domainId);

  return {
    canonicalRegistry: 'mcp_tools_list',
    guidanceResources: [...FLUENT_GUIDANCE_RESOURCE_URIS],
    note:
      'Guidance only. MCP tools/list is authoritative for the connected runtime profile. Hosted public /mcp exposes the curated product-safe vNext assistant profile, not the legacy full contract or a developer escape hatch.',
    groups: [
      {
        id: 'core',
        label: 'Core Routing',
        domainId: null,
        guidanceResourceUris: ['fluent://guidance/routing', 'fluent://guidance/host-capabilities'],
        toolPrefixes: ['fluent_'],
        starterReadTools: ['fluent_get_home', 'fluent_get_capabilities', 'fluent_get_account_status', 'fluent_list_domains'],
        starterWriteTools: ['fluent_enable_domain', 'fluent_begin_domain_onboarding'],
        whenToUse: 'First call in a Fluent session or when domain readiness is unclear.',
        domainReady: true,
      },
      {
        id: 'health_fitness',
        label: 'Health Fitness',
        domainId: 'health',
        guidanceResourceUris: ['fluent://guidance/routing', 'fluent://guidance/host-capabilities', 'fluent://guidance/health-blocks'],
        toolPrefixes: ['health_'],
        starterReadTools: ['health_get_context', 'health_get_active_block', 'health_get_today_context'],
        starterWriteTools: ['health_upsert_block', 'health_record_block_review', 'health_log_workout'],
        whenToUse: 'Training block creation, today resolution, lightweight workout logging, and block reviews.',
        domainReady: isReady('health'),
      },
      {
        id: 'meals_planning',
        label: 'Meals Planning',
        domainId: 'meals',
        guidanceResourceUris: ['fluent://guidance/routing', 'fluent://guidance/host-capabilities', 'fluent://guidance/meals-planning'],
        toolPrefixes: ['fluent_', 'meals_'],
        starterReadTools: ['fluent_get_context'],
        detailReadTools: [
          'meals_get_onboarding_calibration',
          'meals_get_plan',
          'meals_list_plan_history',
          'meals_get_preferences',
          'meals_get_inventory_summary',
          'meals_list_recipes',
        ],
        starterWriteTools: [
          'meals_record_calibration_response',
          'meals_generate_plan',
          'meals_accept_plan_candidate',
          'meals_generate_grocery_plan',
        ],
        whenToUse:
          'Weekly planning, plan revision, setup/calibration, inferred food preference confirmation, or grocery-plan generation from an approved week. Start broad planning/currentness/"what Fluent knows" turns from fluent_get_context(domain="meals", intent="planning"); use meals_get_onboarding_calibration only for explicit setup/calibration detail or when vNext context is unavailable.',
        domainReady: isReady('meals'),
      },
      {
        id: 'meals_shopping',
        label: 'Meals Shopping',
        domainId: 'meals',
        guidanceResourceUris: ['fluent://guidance/routing', 'fluent://guidance/host-capabilities', 'fluent://guidance/meals-shopping'],
        toolPrefixes: ['meals_'],
        starterReadTools: [
          'meals_render_grocery_list_v2',
          'meals_get_current_grocery_list',
          'meals_get_grocery_plan',
          'meals_prepare_order',
          'meals_get_inventory_summary',
          'meals_list_grocery_intents',
        ],
        starterWriteTools: ['meals_upsert_grocery_plan_action', 'meals_update_inventory_batch', 'meals_upsert_grocery_intent'],
        whenToUse:
          'Shopping, at-home checks, substitutions, receipt reconciliation, or the primary living grocery-list view. In ChatGPT / MCP Apps-style hosts and Claude MCP Apps-capable runs, start from meals_render_grocery_list_v2 for the richer Fluent surface; in Claude visualizer-only hosts, start from meals_get_current_grocery_list before host-native visuals; in Codex, OpenClaw, and generic plain MCP clients, default to canonical grocery data plus text. Pantry Dashboard is retired and should not be used for new flows.',
        domainReady: isReady('meals'),
      },
      {
        id: 'meals_cooking',
        label: 'Meals Cooking',
        domainId: 'meals',
        guidanceResourceUris: ['fluent://guidance/routing', 'fluent://guidance/host-capabilities', 'fluent://guidance/meals-planning'],
        toolPrefixes: ['meals_'],
        starterReadTools: ['meals_get_today_context', 'meals_get_day_plan'],
        starterWriteTools: ['meals_mark_meal_cooked', 'meals_log_feedback'],
        whenToUse: 'Cooking today’s meals or recording meal outcomes.',
        domainReady: isReady('meals'),
      },
      {
        id: 'style',
        label: 'Style',
        domainId: 'style',
        guidanceResourceUris: [
          'fluent://guidance/routing',
          'fluent://guidance/host-capabilities',
          'fluent://guidance/style-purchase-analysis',
          'fluent://guidance/style-shopping',
          'fluent://guidance/style-enrichment',
        ],
        toolPrefixes: ['style_'],
        starterReadTools: [
          'style_get_onboarding_calibration',
          'style_get_context',
          'style_list_descriptor_backlog',
          'style_analyze_wardrobe',
          'style_get_profile',
        ],
        starterWriteTools: [
          'style_record_calibration_response',
          'style_add_starter_closet_item',
          'style_update_profile',
          'style_upsert_item_profile',
          'style_upsert_item',
          'style_archive_item',
          'style_upsert_item_photos',
          'style_set_item_product_image',
        ],
        whenToUse: 'Closet reads, wardrobe analysis, purchase analysis, or style calibration.',
        domainReady: isReady('style'),
      },
    ],
  };
}

function buildToolDirectory(readyDomains: string[]): FluentToolDirectory {
  const discovery = buildToolDiscovery(readyDomains);
  return {
    canonicalRegistry: discovery.canonicalRegistry,
    guidanceResources: discovery.guidanceResources,
    note: 'Fallback discovery only. Use this when deferred core tools or keyword search miss the Fluent surface; MCP tools/list remains authoritative.',
    toolNames: [...FLUENT_TOOL_NAMES],
    groups: discovery.groups,
  };
}

function buildNextActions(input: {
  domains: FluentDomainRecord[];
  input: FluentNextActionsInput;
  readyDomains: string[];
}): FluentNextActions {
  const hostFamily = normalizeHostFamily(input.input.hostFamily);
  const hostProfile = fluentHostProfile(hostFamily, {
    readyDomains: input.readyDomains.filter(isChatGptAppDomain),
  });
  const domain = normalizeNextActionDomain(input.input.domainHint) ?? inferDomainFromGoal(input.input.userGoal);
  const intent = normalizeIntentKind(input.input.intent);
  const goal = normalizeNullableText(input.input.userGoal);
  const domainRecord = domain === 'unknown' || domain === 'core' ? null : input.domains.find((entry) => entry.domainId === domain);
  const domainReady = domain === 'core' ? true : domain === 'unknown' ? null : Boolean(domainRecord && isDomainReady(domainRecord));
  const baseWarnings = buildHostWarnings(hostFamily);
  const writePolicy = 'Use write tools only from explicit user intent, including direct user requests, approved plans, or user-initiated widget actions.';

  if (domainRecord && !domainReady) {
    const actions: FluentRecommendedAction[] = [];
    if (domainRecord.lifecycleState === 'available') {
      actions.push({
        kind: 'onboard',
        reason: `${domain} is available but not enabled. Use only when the user wants to start ${domain}.`,
        tool: 'fluent_enable_domain',
      });
    }
    if (domainRecord.lifecycleState === 'enabled') {
      actions.push({
        kind: 'onboard',
        reason: `${domain} is enabled but onboarding is not complete. Continue the domain-specific first-use flow.`,
        tool: 'fluent_begin_domain_onboarding',
      });
    }
    actions.push({
      kind: 'read',
      reason: 'Read domain lifecycle and onboarding state before deciding whether to continue setup.',
      tool: 'fluent_list_domains',
    });

    return {
      domain,
      domainReady,
      guidanceResources: guidanceForDomain(domain),
      hostProfile,
      hostFamily,
      primaryAction: actions[0]!,
      recommendedActions: actions,
      routingNotes: [
        `readyDomains currently contains: ${input.readyDomains.length ? input.readyDomains.join(', ') : 'none'}.`,
        'Do not infer readiness from previous chat state; use Fluent capability state.',
      ],
      warnings: [
        ...baseWarnings,
        ...(domainRecord.lifecycleState === 'disabled'
          ? [`${domain} is disabled. Do not re-enable it unless the user explicitly asks.`]
          : []),
      ],
      writePolicy,
    };
  }

  const actions = readyDomainActions({
    domain,
    goal,
    hostFamily,
    intent,
  });

  return {
    domain,
    domainReady,
    guidanceResources: guidanceForDomain(domain),
    hostProfile,
    hostFamily,
    primaryAction: actions[0]!,
    recommendedActions: actions,
    routingNotes: [
      'Prefer summary reads before full reads.',
      'Use fluent_get_capabilities when readiness, host routing, or available domains are unclear.',
      ...(hostFamily === 'chatgpt_app'
        ? ['ChatGPT has no packaged Fluent skill, so prefer this next-action output and the guidance resources as the in-band operating manual.']
        : ['Packaged skills may add host-specific orchestration, but MCP capability and resource state remain canonical.']),
    ],
    warnings: baseWarnings,
    writePolicy,
  };
}

function readyDomainActions(input: {
  domain: FluentNextActionDomain;
  goal: string | null;
  hostFamily: FluentHostFamily;
  intent: FluentIntentKind;
}): FluentRecommendedAction[] {
  const goal = input.goal ?? '';
  const chatgpt = input.hostFamily === 'chatgpt_app';

  if (input.domain === 'core' && isAccountStatusGoal(goal)) {
    return [
      {
        kind: 'read',
        reason:
          'Use the account-status surface for account, access, billing-boundary, subscription, export, deletion, reactivation, support, or account-ready asks. Do not answer this with Home.',
        tool: 'fluent_get_account_status',
      },
      {
        kind: 'read',
        reason: 'Use only if account-status output still leaves domain readiness unclear.',
        tool: 'fluent_get_capabilities',
      },
    ];
  }

  if (input.domain === 'meals') {
    if (isMealsSetupGoal(goal) || input.intent === 'onboard') {
      return [
        {
          kind: 'read',
          reason:
            'Start Meals setup/calibration from the compact read model so evidence, inferred signals, confirmed preferences, and decision readiness stay separate.',
          tool: 'meals_get_onboarding_calibration',
        },
        {
          kind: 'read',
          reason:
            'Use recipe-book learning for lightweight recipe discovery without turning one recipe reaction into a permanent household rule.',
          tool: 'meals_get_recipe_book',
        },
        {
          kind: 'write',
          reason:
            'Record only explicit household, safety, planning, grocery, or recipe-learning responses after the user confirms them.',
          tool: 'meals_record_calibration_response',
        },
      ];
    }
    if (/grocery|shopping|shop|buy|pantry|cart|order|receipt|ingredient/i.test(goal)) {
      return [
        chatgpt
          ? {
              kind: 'render',
              reason: 'For ChatGPT/App SDK grocery-list-first prompts, open the rich grocery-list surface when available.',
              tool: 'meals_render_grocery_list_v2',
            }
          : {
              kind: 'read',
              reason:
                input.hostFamily === 'claude'
                  ? 'For Claude grocery-list-first prompts, fetch the canonical current living list first, then render with visualize:show_widget when available; otherwise answer from that fresh data in text.'
                  : 'For non-ChatGPT hosts, fetch the canonical current living grocery list and answer from that fresh data in text.',
              tool: 'meals_get_current_grocery_list',
            },
        {
          kind: 'read',
          reason: 'Use before any retailer execution or when the user asks what still needs to be bought right now.',
          tool: 'meals_prepare_order',
        },
        {
          kind: 'read',
          reason: 'Check current at-home grocery state before resolving uncertain grocery lines.',
          tool: 'meals_get_inventory_summary',
        },
      ];
    }
    if (/recipe|cook|make|ingredients|steps|card/i.test(goal)) {
      return [
        {
          kind: 'read',
          reason: 'Read the saved Fluent recipe before answering from general cooking knowledge.',
          tool: 'meals_get_recipe',
        },
        chatgpt
          ? {
              kind: 'render',
              reason: 'In ChatGPT/MCP Apps-style hosts, render the recipe card when the user is asking for the recipe itself.',
              tool: 'meals_render_recipe_card',
            }
          : {
              kind: 'read',
              reason: 'Use text from the canonical recipe read in non-widget hosts.',
              tool: 'meals_get_recipe',
            },
      ];
    }
    return [
      {
        kind: 'read',
        reason:
          'Start broad Meals planning from the vNext context packet so confirmed facts, inferred signals, stale/missing currentness, evidence gaps, and write boundaries stay together.',
        tool: 'fluent_get_context',
      },
      {
        kind: 'read',
        reason: 'Use only if the user asks for current or target-week plan detail beyond the vNext context packet.',
        tool: 'meals_get_plan',
      },
      {
        kind: input.intent === 'plan' || /plan|week|schedule|dinner/i.test(goal) ? 'write' : 'read',
        reason: 'Generate a candidate only when the user is clearly planning or revising a week.',
        tool: 'meals_generate_plan',
      },
    ];
  }

  if (input.domain === 'style') {
    if (isStyleSetupGoal(goal) || input.intent === 'onboard') {
      return [
        {
          kind: 'read',
          reason:
            'Start Style setup/calibration from the compact read model before using broad closet context or wardrobe analysis.',
          tool: 'style_get_onboarding_calibration',
        },
        chatgpt
          ? {
              kind: 'render',
              reason:
                'In ChatGPT/MCP Apps-style hosts, render the Style setup surface only after the calibration read model has run.',
              tool: 'style_show_setup_calibration_widget',
            }
          : {
              kind: 'read',
              reason:
                'For non-widget or text-first hosts, answer from the calibration read model instead of calling the setup widget.',
              tool: 'style_get_onboarding_calibration',
            },
        {
          kind: 'write',
          reason:
            'Record explicit setup corrections or starter closet evidence only after the user provides clear confirmation.',
          tool: 'style_record_calibration_response',
        },
      ];
    }
    if (/buy|purchase|link|product|return|keep|closet|wardrobe|style|shoe|shirt|pants|jacket|sweater/i.test(goal)) {
      const productPageEvidenceActions: FluentRecommendedAction[] = chatgpt
        ? []
        : [
            {
              kind: 'read',
              reason:
                'For product URLs without usable candidate images yet, extract direct public product-page image references before requesting the vision packet.',
              tool: 'style_extract_purchase_page_evidence',
            },
          ];
      return [
        {
          kind: 'read',
          reason: 'First hop for purchase questions and product URLs; returns evidence requirements before any widget render.',
          tool: 'style_prepare_purchase_analysis',
        },
        ...productPageEvidenceActions,
        {
          kind: 'read',
          reason: 'Retrieve model-visible candidate and closet-comparator images for host visual inspection after purchase preparation.',
          tool: 'style_get_purchase_vision_packet',
        },
        {
          kind: 'write',
          reason: 'Submit concrete host visual observations from inspected images and receive the render-ready evidence receipt.',
          tool: 'style_submit_purchase_visual_observations',
        },
        chatgpt
          ? {
              kind: 'render',
              reason: 'Use as the final ChatGPT/App SDK widget presentation step only after visual observations are accepted.',
              tool: 'style_show_purchase_analysis_widget',
            }
          : {
              kind: 'read',
              reason: 'Use structured non-widget presentation data after evidence is ready and answer in text for non-widget hosts.',
              tool: 'style_render_purchase_analysis',
            },
      ];
    }
    return [
      {
        kind: 'read',
        reason: 'Start broad Style asks from closet-derived context.',
        tool: 'style_get_context',
      },
      {
        kind: 'read',
        reason: 'Use wardrobe-level derived strengths, gaps, replacements, and buy-next guidance.',
        tool: 'style_analyze_wardrobe',
      },
    ];
  }

  if (input.domain === 'health') {
    if (/today|now|workout/i.test(goal)) {
      return [
        {
          kind: 'read',
          reason: 'Resolve today from the active block rather than regenerating a week.',
          tool: 'health_get_today_context',
        },
        {
          kind: 'read',
          reason: 'Use the active block for continuity when today needs context.',
          tool: 'health_get_active_block',
        },
        {
          kind: 'write',
          reason: 'Log completion only when the user explicitly says they completed, skipped, or partially completed a workout.',
          tool: 'health_log_workout',
        },
      ];
    }
    return [
      {
        kind: 'read',
        reason: 'Start Health from current goals, block state, and recent activity.',
        tool: 'health_get_context',
      },
      {
        kind: 'read',
        reason: 'Project the current week from the active block.',
        tool: 'health_get_block_projection',
      },
      {
        kind: input.intent === 'plan' ? 'write' : 'read',
        reason: 'Create or revise a block only when the user clearly wants training planning.',
        tool: 'health_upsert_block',
      },
    ];
  }

  return [
    {
      kind: 'read',
      reason: 'Start with Fluent Home when the user asks generally what Fluent knows or what to do next.',
      tool: 'fluent_get_home',
    },
    {
      kind: 'read',
      reason: 'Fetch domain readiness, contract version, and discovery groups.',
      tool: 'fluent_get_capabilities',
    },
  ];
}

function isChatGptAppDomain(value: string): value is 'health' | 'meals' | 'style' {
  return value === 'health' || value === 'meals' || value === 'style';
}

function guidanceForDomain(domain: FluentNextActionDomain): string[] {
  switch (domain) {
    case 'health':
      return ['fluent://guidance/routing', 'fluent://guidance/host-capabilities', 'fluent://guidance/health-blocks'];
    case 'meals':
      return [
        'fluent://guidance/routing',
        'fluent://guidance/host-capabilities',
        'fluent://guidance/meals-planning',
        'fluent://guidance/meals-shopping',
      ];
    case 'style':
      return [
        'fluent://guidance/routing',
        'fluent://guidance/host-capabilities',
        'fluent://guidance/style-purchase-analysis',
        'fluent://guidance/style-shopping',
        'fluent://guidance/style-enrichment',
      ];
    case 'core':
    case 'unknown':
      return ['fluent://guidance/routing', 'fluent://guidance/host-capabilities'];
  }
}

function inferDomainFromGoal(goal: string | null | undefined): FluentNextActionDomain {
  const text = normalizeNullableText(goal)?.toLowerCase() ?? '';
  if (!text) return 'unknown';
  if (isAccountStatusGoal(text)) {
    return 'core';
  }
  if (isGroceryShoppingGoal(text)) {
    return 'meals';
  }
  if (/\b(meal|dinner|lunch|breakfast|recipe|grocery|pantry|shopping|ingredient|cook|order|cart)\b/.test(text)) {
    return 'meals';
  }
  if (/\b(style|closet|wardrobe|outfit|buy|purchase|shirt|pants|shoe|jacket|sweater|fit)\b/.test(text)) {
    return 'style';
  }
  if (/\b(health|fitness|workout|training|block|goal|weight|lift|run|recovery)\b/.test(text)) {
    return 'health';
  }
  return 'unknown';
}

function isGroceryShoppingGoal(text: string): boolean {
  return /\bwhat do i need to buy\b/.test(text)
    || /\b(show|open|get|pull up)\b.*\b(grocery|groceries|shopping)\b.*\blist\b/.test(text)
    || /\b(grocery|groceries|shopping)\s+list\b/.test(text)
    || /\b(to-buy|to buy)\b.*\b(grocery|groceries|ingredients?|items?)\b/.test(text);
}

function isAccountStatusGoal(text: string): boolean {
  return /\b(account|access|billing|subscription|export|deletion|delete|reactivat(?:e|ion)|support|ready|enabled)\b/.test(text)
    && /\b(fluent|account|access|billing|subscription|export|deletion|delete|reactivat(?:e|ion)|support)\b/.test(text);
}

function isMealsSetupGoal(text: string): boolean {
  return /\b(set ?up|onboard(?:ing)?|calibrat(?:e|ion)|preferences?|household|allerg(?:y|ies)|dietary|recipe book|recipes? we'd actually try|starter meals?)\b/i.test(
    text,
  );
}

function isStyleSetupGoal(text: string): boolean {
  return /\b(set ?up|onboard(?:ing)?|calibrat(?:e|ion)|style profile|taste|starter closet|closet setup|closet import|style preferences?)\b/i.test(
    text,
  );
}

function normalizeNextActionDomain(value: FluentNextActionDomain | null | undefined): FluentNextActionDomain | null {
  return value === 'core' || value === 'health' || value === 'meals' || value === 'style' || value === 'unknown'
    ? value
    : null;
}

function normalizeHostFamily(value: FluentHostFamily | null | undefined): FluentHostFamily {
  return value === 'chatgpt_app' || value === 'claude' || value === 'openclaw' || value === 'codex' || value === 'generic_mcp'
    ? value
    : 'unknown';
}

function normalizeIntentKind(value: FluentIntentKind | null | undefined): FluentIntentKind {
  return value === 'read' || value === 'write' || value === 'render' || value === 'plan' || value === 'onboard'
    ? value
    : 'unknown';
}

function buildHostWarnings(hostFamily: FluentHostFamily): string[] {
  if (hostFamily === 'chatgpt_app') {
    return [
      'ChatGPT does not receive packaged Fluent skills, so prefer fluent_get_next_actions, toolDiscovery, and guidance resources when routing is unclear.',
    ];
  }
  if (hostFamily === 'claude') {
    return [
      'Claude visualizer-only runs should prefer canonical Fluent data plus Claude-native rendering; Claude MCP Apps-capable runs may use proven Fluent ui:// resources such as meals_render_grocery_list_v2 for Grocery.',
    ];
  }
  if (hostFamily === 'openclaw' || hostFamily === 'codex' || hostFamily === 'generic_mcp') {
    return ['Default to canonical data tools and text; do not assume ChatGPT/App SDK widget support.'];
  }
  return ['Host capabilities are unknown; prefer canonical data tools and text unless the host proves widget support.'];
}

function buildAccountAccessState(
  record: FluentCloudOnboardingRecord | null,
  tenantStatus: string,
  deploymentTrack: FluentDeploymentTrack,
): FluentAccountAccessState {
  if (deploymentTrack !== 'cloud') {
    return 'active';
  }
  if (!record) {
    return tenantStatus === 'active' ? 'active' : 'unavailable';
  }
  if (isPendingAccountState(record.currentState)) {
    return 'pending';
  }
  const lifecycle = evaluateSubscriptionLifecycle(record);
  switch (lifecycle.access) {
    case 'full_access':
      return 'active';
    case 'limited_access':
      return 'limited';
    case 'blocked':
      return 'pending';
    case 'deleted':
    case 'retention_expired':
    case 'suspended':
      return 'unavailable';
  }
}

function isPendingAccountState(currentState: FluentCloudOnboardingRecord['currentState']): boolean {
  return [
    'account_created',
    'checkout_required',
    'invite_accepted',
    'invited',
    'waitlisted',
  ].includes(currentState);
}

function buildAccountEntitlement(
  record: FluentCloudOnboardingRecord | null,
  deploymentTrack: FluentDeploymentTrack,
  runtimeEntitlement: Pick<FluentAccountStatus['entitlement'], 'state' | 'summary' | 'graceDeadline' | 'retentionDeadline'> | null = null,
): FluentAccountStatus['entitlement'] {
  if (deploymentTrack !== 'cloud') {
    return {
      state: 'unavailable',
      summary: 'Hosted billing entitlements do not apply to the local OSS runtime.',
      graceDeadline: null,
      retentionDeadline: null,
    };
  }
  if (record) {
    const lifecycle = evaluateSubscriptionLifecycle(record);
    if (lifecycle.access === 'retention_expired' || lifecycle.access === 'suspended' || lifecycle.access === 'deleted' || lifecycle.access === 'blocked') {
      return {
        state: lifecycle.access === 'retention_expired' ? 'retention_expired' : publicEntitlementState(record.currentState),
        summary: lifecycle.message,
        graceDeadline: calculateSubscriptionGraceDeadline(record),
        retentionDeadline: calculateLapsedRetentionDeadline(record),
      };
    }
  }
  if (runtimeEntitlement) {
    return {
      state: runtimeEntitlement.state,
      summary: runtimeEntitlement.summary ?? 'Your Fluent account status is controlled by the current runtime entitlement.',
      graceDeadline: runtimeEntitlement.graceDeadline,
      retentionDeadline: runtimeEntitlement.retentionDeadline,
    };
  }
  if (!record) {
    return {
      state: 'unavailable',
      summary: 'I could not find an active Fluent account for this sign-in.',
      graceDeadline: null,
      retentionDeadline: null,
    };
  }

  const lifecycle = evaluateSubscriptionLifecycle(record);
  const state =
    lifecycle.access === 'retention_expired'
      ? 'retention_expired'
      : publicEntitlementState(record.currentState);
  return {
    state,
    summary: lifecycle.message,
    graceDeadline: calculateSubscriptionGraceDeadline(record),
    retentionDeadline: calculateLapsedRetentionDeadline(record),
  };
}

function publicEntitlementState(currentState: FluentCloudOnboardingRecord['currentState']): FluentAccountEntitlementState {
  switch (currentState) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due_grace':
      return 'past_due_grace';
    case 'limited_access':
      return 'limited';
    case 'canceled_retention':
      return 'canceled_retention';
    case 'checkout_required':
    case 'account_created':
    case 'invite_accepted':
    case 'invited':
    case 'waitlisted':
      return 'pending';
    case 'deletion_requested':
    case 'suspended':
      return 'suspended';
    case 'deleted':
      return 'deleted';
    default:
      return 'unavailable';
  }
}

function meetFluentAccountBaseUrl(publicBaseUrl: string | undefined): string {
  const fallback = 'https://meetfluent.app';
  if (!publicBaseUrl) {
    return fallback;
  }
  try {
    const url = new URL(publicBaseUrl);
    return url.hostname === 'meetfluent.app' ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

function buildAccountLinks(
  accountBaseUrl: string,
  state: FluentAccountEntitlementState,
): FluentAccountStatus['links'] {
  const supportEmail = `mailto:${FLUENT_SUPPORT_EMAIL}`;
  if (state === 'deleted' || state === 'retention_expired') {
    return {
      deletion: null,
      export: null,
      manageAccount: `${accountBaseUrl}/account`,
      supportEmail,
    };
  }
  if (state === 'suspended' || state === 'pending' || state === 'unavailable') {
    return {
      deletion: null,
      export: null,
      manageAccount: `${accountBaseUrl}/account`,
      supportEmail,
    };
  }
  return {
    deletion: `${accountBaseUrl}/account/delete`,
    export: `${accountBaseUrl}/account`,
    manageAccount: `${accountBaseUrl}/account`,
    supportEmail,
  };
}

function buildAccountInstructions(
  deploymentTrack: FluentDeploymentTrack,
  state: FluentAccountEntitlementState,
): FluentAccountStatus['instructions'] {
  if (deploymentTrack !== 'cloud') {
    return {
      deletion: 'Use the self-hosted runtime controls for deletion, then remove the local Fluent data directory or database backups you control.',
      export: 'Use the local OSS snapshot export workflow from the Fluent runtime to export the data stored on this machine.',
      manageAccount: 'Use your local Fluent runtime controls for account-like settings.',
      support: `Email ${FLUENT_SUPPORT_EMAIL} for account help.`,
    };
  }
  if (state === 'deleted') {
    return {
      deletion: 'This account is already deleted.',
      export: 'Account export is not available after deletion.',
      manageAccount: 'Open meetfluent.app/account for any remaining account status details.',
      support: `Email ${FLUENT_SUPPORT_EMAIL} if you believe the deletion was a mistake.`,
    };
  }
  if (state === 'retention_expired') {
    return {
      deletion: 'The data retention window has ended, so deletion controls are no longer the next step.',
      export: 'Account export is no longer available after the retention window ends.',
      manageAccount: 'Open meetfluent.app/account for account status details.',
      support: `Email ${FLUENT_SUPPORT_EMAIL} for help with retained billing records or account questions.`,
    };
  }
  if (state === 'suspended') {
    return {
      deletion: 'Contact support before changing deletion state for this account.',
      export: 'Contact support if you need an export while the account is paused.',
      manageAccount: 'Open meetfluent.app/account for status details.',
      support: `Email ${FLUENT_SUPPORT_EMAIL} to resolve this account state.`,
    };
  }
  if (state === 'pending' || state === 'unavailable') {
    return {
      deletion: 'Deletion is available after account setup is complete, or through support for waitlist-only records.',
      export: 'Export is available after account setup is complete.',
      manageAccount: 'Open meetfluent.app/account to finish setup or check access.',
      support: `Email ${FLUENT_SUPPORT_EMAIL} if this account should already be active.`,
    };
  }
  return {
    deletion: 'Open the deletion link to review the deletion policy, request deletion, or confirm a pending request.',
    export: 'Open account settings on meetfluent.app to request or download an export.',
    manageAccount: 'Open the manage account link on meetfluent.app for account, billing, export, and deletion controls.',
    support: `Email ${FLUENT_SUPPORT_EMAIL} for account help.`,
  };
}

function safeParse(value: string | null): unknown {
  if (!value) {
    return null;
  }

  let current: unknown = value;
  for (let depth = 0; depth < 2; depth += 1) {
    if (typeof current !== 'string') {
      break;
    }
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }

  return current;
}

function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return safeParse(value);
}

function asCount(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
