import type { MutationProvenance } from './auth';
import type { CoreRuntimeBindings, FluentBackendMode, FluentDeploymentTrack } from './config';
import { FLUENT_CONTRACT_VERSION, FLUENT_OPTIONAL_CAPABILITIES, FLUENT_TOOL_NAMES } from './contract';
import { isStylePurchaseEvalReady, normalizeStyleProfile } from './domains/style/helpers';
import { getFluentIdentityContext } from './fluent-identity';
import type { FluentDatabase } from './storage';
import { torontoTimeZone } from './time';

export { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from './fluent-identity';

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
  toolDiscovery: {
    canonicalRegistry: 'mcp_tools_list';
    note: string;
    groups: FluentToolDiscoveryGroup[];
  };
}

export interface FluentToolDiscoveryGroup {
  id: 'core' | 'health_fitness' | 'meals_planning' | 'meals_shopping' | 'meals_cooking' | 'style';
  label: string;
  domainId: 'health' | 'meals' | 'style' | null;
  toolPrefixes: string[];
  starterReadTools: string[];
  starterWriteTools: string[];
  whenToUse: string;
  domainReady: boolean;
}

export interface FluentToolDirectory {
  canonicalRegistry: 'mcp_tools_list';
  note: string;
  toolNames: string[];
  groups: FluentToolDiscoveryGroup[];
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
      toolDiscovery: buildToolDiscovery(readyDomains),
    };
  }

  async getToolDirectory(): Promise<FluentToolDirectory> {
    const domains = await this.listDomains();
    const readyDomains = domains.filter((domain) => isDomainReady(domain)).map((domain) => domain.domainId);
    return buildToolDirectory(readyDomains);
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

    if (isStylePurchaseEvalReady(profile, { itemCount, primaryPhotoCount })) {
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
    return after;
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
    note: 'Guidance only. MCP tools/list and contract.tools remain the authoritative full tool registry.',
    groups: [
      {
        id: 'core',
        label: 'Core Routing',
        domainId: null,
        toolPrefixes: ['fluent_'],
        starterReadTools: ['fluent_get_capabilities', 'fluent_list_domains'],
        starterWriteTools: ['fluent_enable_domain', 'fluent_begin_domain_onboarding'],
        whenToUse: 'First call in a Fluent session or when domain readiness is unclear.',
        domainReady: true,
      },
      {
        id: 'health_fitness',
        label: 'Health Fitness',
        domainId: 'health',
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
        toolPrefixes: ['meals_'],
        starterReadTools: ['meals_get_preferences', 'meals_get_plan', 'meals_list_plan_history'],
        starterWriteTools: ['meals_generate_plan', 'meals_accept_plan_candidate', 'meals_generate_grocery_plan'],
        whenToUse: 'Weekly planning, plan revision, or grocery-plan generation from an approved week.',
        domainReady: isReady('meals'),
      },
      {
        id: 'meals_shopping',
        label: 'Meals Shopping',
        domainId: 'meals',
        toolPrefixes: ['meals_'],
        starterReadTools: [
          'meals_render_grocery_list_v2',
          'meals_render_grocery_list',
          'meals_get_grocery_plan',
          'meals_prepare_order',
          'meals_get_inventory_summary',
          'meals_list_grocery_intents',
        ],
        starterWriteTools: ['meals_upsert_grocery_plan_action', 'meals_update_inventory_batch', 'meals_upsert_grocery_intent'],
        whenToUse:
          'Shopping, pantry checks, substitutions, receipt reconciliation, or the primary grocery-list view for the week. In hosts that support Fluent MCP widgets, start from the render tools for the richer Fluent surface; in Claude-style hosts, start from canonical grocery data first.',
        domainReady: isReady('meals'),
      },
      {
        id: 'meals_cooking',
        label: 'Meals Cooking',
        domainId: 'meals',
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
        toolPrefixes: ['style_'],
        starterReadTools: ['style_get_context', 'style_list_descriptor_backlog', 'style_analyze_wardrobe', 'style_get_profile'],
        starterWriteTools: ['style_update_profile', 'style_upsert_item_profile', 'style_upsert_item', 'style_upsert_item_photos'],
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
    note: 'Fallback discovery only. Use this when deferred core tools or keyword search miss the Fluent surface; MCP tools/list remains authoritative.',
    toolNames: [...FLUENT_TOOL_NAMES],
    groups: discovery.groups,
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
