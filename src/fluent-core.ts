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
  starterReadTools: FluentPublicToolName[];
  detailReadTools?: FluentPublicToolName[];
  starterWriteTools: FluentPublicToolName[];
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
  tool: FluentPublicToolName;
  reason: string;
  kind: 'read' | 'write' | 'render' | 'onboard' | 'host_action';
}

type FluentPublicToolName = (typeof FLUENT_TOOL_NAMES)[number];

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
    const publicDomains = domains.filter((domain) => isPublicProductDomain(domain.domainId));
    const readyDomains = publicDomains.filter((domain) => isDomainReady(domain)).map((domain) => domain.domainId);

    return {
      availableDomains: publicDomains,
      backendMode: tenant.backendMode,
      contractVersion: FLUENT_CONTRACT_VERSION,
      deploymentTrack: tenant.deploymentTrack,
      storageBackend: this.runtime.storageBackend,
      enabledDomains: publicDomains.filter((domain) => domain.lifecycleState === 'enabled').map((domain) => domain.domainId),
      readyDomains,
      onboarding: {
        core: {
          state: tenant.onboardingState,
          version: tenant.onboardingVersion,
        },
        domains: publicDomains.map((domain) => ({
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
    const enabledDomains = domains
      .filter((domain) => isPublicProductDomain(domain.domainId) && domain.lifecycleState === 'enabled')
      .map((domain) => domain.domainId);
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
  const isReady = (domainId: 'meals' | 'style') => readyDomains.includes(domainId);

  return {
    canonicalRegistry: 'mcp_tools_list',
    guidanceResources: [...FLUENT_GUIDANCE_RESOURCE_URIS],
    note:
      'MCP tools/list is authoritative. This directory describes the same curated 2.0 product profile and never advertises tools outside the connected public contract.',
    groups: [
      {
        id: 'core',
        label: 'Core and Shared Context',
        domainId: null,
        guidanceResourceUris: [],
        toolPrefixes: ['fluent_'],
        starterReadTools: ['fluent_get_capabilities', 'fluent_get_account_status', 'fluent_get_context', 'fluent_get_shared_profile'],
        detailReadTools: ['fluent_list_items', 'fluent_get_item', 'fluent_list_evidence', 'fluent_get_media_bundle'],
        starterWriteTools: ['fluent_update_shared_profile_patch'],
        whenToUse: 'Account status, shared profile context, capability checks, or cross-domain routing.',
        domainReady: true,
      },
      {
        id: 'health_fitness',
        label: 'Wellbeing (Reserved)',
        domainId: 'health',
        guidanceResourceUris: [],
        toolPrefixes: ['fluent_'],
        starterReadTools: ['fluent_get_capabilities'],
        starterWriteTools: [],
        whenToUse: 'Wellbeing is reserved in the 2.0 public contract. Check capabilities, then continue from user-provided context without claiming Fluent has Health tools or state.',
        domainReady: false,
      },
      {
        id: 'meals_planning',
        label: 'Meals Planning',
        domainId: 'meals',
        guidanceResourceUris: [],
        toolPrefixes: ['fluent_'],
        starterReadTools: ['fluent_get_context', 'fluent_list_items', 'fluent_get_item'],
        detailReadTools: ['fluent_get_shared_profile', 'fluent_list_evidence'],
        starterWriteTools: [
          'fluent_save_recipe',
          'fluent_update_recipe_patch',
          'fluent_record_recipe_feedback',
          'fluent_save_meal_plan',
          'fluent_archive_item',
        ],
        whenToUse:
          'Meals planning, saved recipes, meal-plan reads, and explicit approved saves. Start broad planning and currentness from fluent_get_context(domain="meals", intent="planning").',
        domainReady: isReady('meals'),
      },
      {
        id: 'meals_shopping',
        label: 'Meals Shopping',
        domainId: 'meals',
        guidanceResourceUris: [],
        toolPrefixes: ['fluent_'],
        starterReadTools: [
          'fluent_get_context',
          'fluent_list_items',
          'fluent_get_item',
          'fluent_render_surface',
          'fluent_get_purchase_context',
          'fluent_render_budgets_surface',
        ],
        starterWriteTools: [
          'fluent_apply_grocery_list_change',
          'fluent_apply_grocery_shopping_result',
          'fluent_set_budget_envelope',
          'fluent_log_budget_spend',
        ],
        whenToUse:
          'The living grocery list, explicit list changes, shopping-result reconciliation, or the narrow meals-groceries budget envelope. Use fluent_render_surface only when the host can mount MCP Apps; otherwise answer from current structured data.',
        domainReady: isReady('meals'),
      },
      {
        id: 'meals_cooking',
        label: 'Meals Cooking',
        domainId: 'meals',
        guidanceResourceUris: [],
        toolPrefixes: ['fluent_'],
        starterReadTools: ['fluent_list_items', 'fluent_get_item'],
        detailReadTools: ['fluent_get_shared_profile'],
        starterWriteTools: ['fluent_record_recipe_feedback'],
        whenToUse: 'Reading a saved recipe for cooking or recording explicit recipe feedback.',
        domainReady: isReady('meals'),
      },
      {
        id: 'style',
        label: 'Style',
        domainId: 'style',
        guidanceResourceUris: [],
        toolPrefixes: ['fluent_'],
        starterReadTools: [
          'fluent_get_context',
          'fluent_list_items',
          'fluent_get_item',
          'fluent_get_media_bundle',
          'fluent_list_evidence',
          'fluent_get_purchase_context',
          'fluent_render_style_closet_surface',
          'fluent_render_budgets_surface',
        ],
        starterWriteTools: [
          'fluent_update_style_item_patch',
          'fluent_create_style_item',
          'fluent_refresh_style_item_profile',
          'fluent_set_style_item_image',
          'fluent_archive_item',
          'fluent_set_budget_envelope',
          'fluent_log_budget_spend',
        ],
        whenToUse: 'Owned closet reads and edits, host-grounded Style context, inspectable media, or the narrow style-clothing budget envelope. The closet renderer manages saved items; it does not make purchase verdicts.',
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
  const domainReady = domain === 'core'
    ? true
    : domain === 'unknown'
      ? null
      : domain === 'health'
        ? false
        : Boolean(domainRecord && isDomainReady(domainRecord));
  const baseWarnings = buildHostWarnings(hostFamily);
  const writePolicy = 'Use write tools only from explicit user intent, including direct user requests, approved plans, or user-initiated widget actions.';

  if (domain === 'health') {
    const actions: FluentRecommendedAction[] = [{
      kind: 'read',
      reason: 'Health and Wellbeing are reserved in the public contract. Check current capabilities, then continue only from context the user provides.',
      tool: 'fluent_get_capabilities',
    }];

    return {
      domain,
      domainReady: false,
      guidanceResources: [],
      hostProfile,
      hostFamily,
      primaryAction: actions[0]!,
      recommendedActions: actions,
      routingNotes: ['Do not claim Fluent has Health or Wellbeing tools, state, or medical authority.'],
      warnings: [...baseWarnings, 'Health and Wellbeing are reserved and expose no domain tools in the public product.'],
      writePolicy,
    };
  }

  if ((domain === 'meals' || domain === 'style') && !domainReady) {
    const actions: FluentRecommendedAction[] = [{
      kind: 'read',
      reason: `${domain} is not currently ready. Re-read the public capability state before attempting a domain workflow.`,
      tool: 'fluent_get_capabilities',
    }];

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
        'Do not infer readiness from prior chat state or recommend retired onboarding tools.',
      ],
      warnings: baseWarnings,
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
      'Only tools in the connected curated product profile may be recommended.',
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

  if (isBudgetGoal(goal)) {
    return [
      {
        kind: 'read',
        reason: 'Read the matching meals-groceries or style-clothing envelope before presenting budget pressure or recording a change.',
        tool: 'fluent_get_purchase_context',
      },
      ...(chatgpt
        ? [{
            kind: 'render' as const,
            reason: 'Open the promoted budget-envelope surface when the host can mount MCP Apps.',
            tool: 'fluent_render_budgets_surface' as const,
          }]
        : []),
      ...(input.intent === 'write'
        ? [{
            kind: 'write' as const,
            reason: /log|spent|purchase|bought/i.test(goal)
              ? 'Record an explicit user-confirmed grocery or clothing spend only.'
              : 'Set an explicit user-confirmed grocery or clothing envelope only.',
            tool: (/log|spent|purchase|bought/i.test(goal)
              ? 'fluent_log_budget_spend'
              : 'fluent_set_budget_envelope') as FluentPublicToolName,
          }]
        : []),
    ];
  }

  if (input.domain === 'core' && isAccountStatusGoal(goal)) {
    return [
      {
        kind: 'read',
        reason:
          'Use the account-status surface for account, access, billing-boundary, subscription, export, deletion, reactivation, support, or account-ready asks.',
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
          reason: 'Read compact Meals setup context and currentness before asking for corrections or durable preferences.',
          tool: 'fluent_get_context',
        },
        {
          kind: 'read',
          reason: 'Read confirmed shared facts separately from inferred or session-only setup details.',
          tool: 'fluent_get_shared_profile',
        },
        ...(input.intent === 'write'
          ? [{
              kind: 'write' as const,
              reason: 'Save only an explicit user-approved durable shared or Meals fact, then rely on read-after-write proof.',
              tool: 'fluent_update_shared_profile_patch' as const,
            }]
          : []),
      ];
    }
    if (/grocery|shopping|shop|buy|pantry|cart|order|receipt|ingredient/i.test(goal)) {
      return [
        chatgpt
          ? {
              kind: 'render',
              reason: 'Open the promoted living grocery-list surface when the host can mount MCP Apps.',
              tool: 'fluent_render_surface',
            }
          : {
              kind: 'read',
              reason: 'Read the current living grocery-list item and answer from structured data in text.',
              tool: 'fluent_list_items',
            },
        {
          kind: 'read',
          reason: 'Read compact Meals context when planning state, freshness, or grocery provenance matters.',
          tool: 'fluent_get_context',
        },
        ...(input.intent === 'write'
          ? [{
              kind: 'write' as const,
              reason: /receipt|bought|purchased|shopped/i.test(goal)
                ? 'Apply an explicit user-confirmed shopping result to the living list.'
                : 'Apply an explicit user-approved grocery-list change.',
              tool: (/receipt|bought|purchased|shopped/i.test(goal)
                ? 'fluent_apply_grocery_shopping_result'
                : 'fluent_apply_grocery_list_change') as FluentPublicToolName,
            }]
          : []),
      ];
    }
    if (/recipe|cook|make|ingredients|steps|card/i.test(goal)) {
      return [
        {
          kind: 'read',
          reason: 'Find the saved recipe by title or stable ID before relying on it.',
          tool: 'fluent_list_items',
        },
        {
          kind: 'read',
          reason: 'Read the exact saved recipe before deriving steps, ingredients, or grocery changes.',
          tool: 'fluent_get_item',
        },
        ...(input.intent === 'write'
          ? [{
              kind: 'write' as const,
              reason: /feedback|rating|liked|disliked|cooked/i.test(goal)
                ? 'Record explicit recipe feedback without inventing a household preference.'
                : /update|edit|change/i.test(goal)
                  ? 'Patch an existing saved recipe after explicit approval.'
                  : 'Save the recipe after explicit approval.',
              tool: (/feedback|rating|liked|disliked|cooked/i.test(goal)
                ? 'fluent_record_recipe_feedback'
                : /update|edit|change/i.test(goal)
                  ? 'fluent_update_recipe_patch'
                  : 'fluent_save_recipe') as FluentPublicToolName,
            }]
          : []),
      ];
    }
    return [
      {
        kind: 'read',
        reason: 'Start broad Meals planning from the compact context packet so facts, freshness, evidence gaps, and write boundaries stay together.',
        tool: 'fluent_get_context',
      },
      {
        kind: 'read',
        reason: 'List the current saved meal-plan item when the user asks for plan detail.',
        tool: 'fluent_list_items',
      },
      ...(input.intent === 'write' || input.intent === 'plan'
        ? [{
            kind: 'write' as const,
            reason: 'Save a meal plan only after the user explicitly approves the plan to persist.',
            tool: 'fluent_save_meal_plan' as const,
          }]
        : []),
    ];
  }

  if (input.domain === 'style') {
    if (isStyleSetupGoal(goal) || input.intent === 'onboard') {
      return [
        {
          kind: 'read',
          reason: 'Read current Style closet/setup context before proposing any durable item changes.',
          tool: 'fluent_get_context',
        },
        {
          kind: 'read',
          reason: 'List owned Style items to ground setup in the actual saved closet.',
          tool: 'fluent_list_items',
        },
        ...(chatgpt
          ? [{
              kind: 'render' as const,
              reason: 'Open the promoted Style Closet Manager when the host can mount MCP Apps.',
              tool: 'fluent_render_style_closet_surface' as const,
            }]
          : []),
        ...(input.intent === 'write'
          ? [{
              kind: 'write' as const,
              reason: 'Create a starter closet item only after explicit user approval of the host-produced profile.',
              tool: 'fluent_create_style_item' as const,
            }]
          : []),
      ];
    }
    if (/buy|purchase|should i|return|keep|candidate|product|afford|price|cost/i.test(goal)) {
      return [
        {
          kind: 'read',
          reason: 'Read compact Style purchase context first; the host owns visual judgment and the final verdict.',
          tool: 'fluent_get_context',
        },
        {
          kind: 'read',
          reason: 'Fetch a host-provided direct candidate image, upload, or saved closet media when visual evidence is needed. Never pass a product-page URL for extraction; ask for a direct image when pixels are unavailable.',
          tool: 'fluent_get_media_bundle',
        },
      ];
    }
    return [
      {
        kind: 'read',
        reason: 'Start broad Style asks from compact closet context.',
        tool: 'fluent_get_context',
      },
      {
        kind: 'read',
        reason: 'List the saved closet items relevant to the user request.',
        tool: 'fluent_list_items',
      },
      ...(chatgpt
        ? [{
            kind: 'render' as const,
            reason: 'Open Style Closet Manager for saved-item browsing or management, never for a purchase verdict.',
            tool: 'fluent_render_style_closet_surface' as const,
          }]
        : [{
            kind: 'read' as const,
            reason: 'Use inspectable saved-item media when the answer depends on owned closet images.',
            tool: 'fluent_get_media_bundle' as const,
          }]),
      ...(input.intent === 'write'
        ? [{
            kind: 'write' as const,
            reason: 'Use the narrow Style mutation matching the explicit user-approved change.',
            tool: styleWriteToolForGoal(goal),
          }]
        : []),
    ];
  }

  if (input.domain === 'health') {
    return [
      {
        kind: 'read',
        reason: 'Health and Wellbeing are reserved. Check current capabilities and continue only from user-provided context.',
        tool: 'fluent_get_capabilities',
      },
    ];
  }

  return [
    {
      kind: 'read',
      reason: 'Start with the current public capability profile when the request is broad or routing is unclear.',
      tool: 'fluent_get_capabilities',
    },
    {
      kind: 'read',
      reason: 'Read confirmed shared profile context when the user asks broadly what Fluent knows.',
      tool: 'fluent_get_shared_profile',
    },
  ];
}

function isBudgetGoal(goal: string): boolean {
  return /\b(budget|envelope|spend|spending)\b/i.test(goal);
}

function styleWriteToolForGoal(goal: string): FluentPublicToolName {
  if (/\b(add|create|save|new)\b/i.test(goal)) return 'fluent_create_style_item';
  if (/\b(archive|remove|sold|donat(?:e|ed)|return(?:ed)?|no longer)\b/i.test(goal)) return 'fluent_archive_item';
  if (/\b(photo|image|picture)\b/i.test(goal)) return 'fluent_set_style_item_image';
  if (/\b(refresh|re-?analy[sz]e)\b/i.test(goal)) return 'fluent_refresh_style_item_profile';
  return 'fluent_update_style_item_patch';
}

function isChatGptAppDomain(value: string): value is 'health' | 'meals' | 'style' {
  return value === 'health' || value === 'meals' || value === 'style';
}

function isPublicProductDomain(value: string): value is 'meals' | 'style' {
  return value === 'meals' || value === 'style';
}

function guidanceForDomain(_domain: FluentNextActionDomain): string[] {
  return [];
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
      'ChatGPT does not receive packaged Fluent skills; use only the curated tools exposed by the current connection.',
    ];
  }
  if (hostFamily === 'claude') {
    return [
      'Claude should prefer current Fluent data plus native presentation; use a promoted Fluent render adapter only when the host visibly supports MCP Apps.',
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
