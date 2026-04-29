import type { MutationProvenance } from '../../auth';
import { getFluentIdentityContext } from '../../fluent-identity';
import type { FluentDatabase, FluentPreparedStatement } from '../../storage';
import { shiftDateString } from '../../time';
import { applyJsonPatch, deriveRecipeColumns, validateRecipeDocument } from './recipe-document';
import {
  asNonEmptyString,
  asNonNegativeNumber,
  asNullableString,
  asPositiveNumber,
  asRecord,
  asStringArray,
  deriveMealStatus,
  findInventoryMatch,
  hashStableJson,
  mapGroceryIntentRow,
  mapGroceryPlanActionRow,
  mapInventoryRow,
  mapMealFeedbackRow,
  mergeNotes,
  normalizeDayLabel,
  normalizeMealPlanDocument,
  normalizeMealPreferences,
  normalizeText,
  safeParse,
  stringifyJson,
} from './helpers';
import {
  buildGroceryAggregation as buildGroceryAggregationHelper,
  buildPrimaryPlanCandidate as buildPrimaryPlanCandidateHelper,
  deriveCalendarPlanningConstraints,
  normalizeTrainingContext,
  normalizeCalendarContext,
  normalizeGeneratePlanOverrides,
  type PlanningSnapshot,
} from './planning';
import { MealsRepository } from './repository';
import { canonicalizeInventoryItem, normalizeUnit } from './units';
import type {
  ConfirmedOrderSyncRecord,
  ConfirmedOrderSyncStatus,
  DomainEventRecord,
  FeedbackValue,
  GroceryPlanActionRecord,
  GroceryPlanSufficiencyStatus,
  GroceryIntentRecord,
  GroceryPlanRecord,
  InventoryRecord,
  InventorySummary,
  MealFeedbackRecord,
  MealMemoryRecord,
  MealPlanEntryRecord,
  MealPlanHistoryRecord,
  MealPlanRecord,
  MealPlanSummaryRecord,
  MealPreferencesRecord,
  MealRecipeRecord,
  PreparedOrderRecord,
  PreparedOrderItemRecord,
  PreparedOrderSubstitutionDecisionRecord,
  PreparedOrderUnresolvedItemRecord,
  TodayContext,
} from './types';
import type {
  AcceptMealPlanCandidateInput,
  CalendarContext,
  ConfirmedOrderSyncMetadataInput,
  CreateRecipeInput,
  DeleteInventoryItemInput,
  DeleteGroceryPlanActionInput,
  DeleteGroceryIntentInput,
  GenerateGroceryPlanInput,
  GenerateMealPlanInput,
  GenerateMealPlanOverrides,
  ListDomainEventsFilters,
  ListMealFeedbackFilters,
  LogFeedbackInput,
  MarkMealCookedInput,
  PatchRecipeInput,
  PlanReviewInput,
  PrepareOrderInput,
  UpdateInventoryBatchInput,
  UpsertGroceryPlanActionInput,
  UpsertGroceryIntentInput,
  UpdateInventoryInput,
  UpdateMealPreferencesInput,
  UpsertMealPlanInput,
  MealPlanGenerationRecord,
  PersistedMealPlanCandidateRecord,
  PersistedMealPlanGenerationRecord,
  ApplyGroceryPlanActionResult,
} from './types-extra';
import { deriveExecutionSupportSummary } from './summaries';
export {
  buildMutationAck,
  deriveExecutionSupportSummary,
  summarizeDomainEvent,
  summarizeDomainEvents,
  summarizeGroceryPlan,
  summarizeMealPlan,
  summarizeMealPreferences,
  summarizePreparedOrder,
} from './summaries';
export * from './types';
export * from './types-extra';

const PREPARED_ORDER_SUFFICIENCY_STATUSES: GroceryPlanSufficiencyStatus[] = [
  'have_enough',
  'have_some_need_to_buy',
  'dont_have_it',
];

export class MealsService {
  private readonly repository: MealsRepository;

  constructor(private readonly db: FluentDatabase) {
    this.repository = new MealsRepository(db);
  }

  private get tenantId(): string {
    return getFluentIdentityContext().tenantId;
  }

  private get profileId(): string {
    return getFluentIdentityContext().profileId;
  }

  async getCurrentPlan(today?: string): Promise<MealPlanRecord | null> {
    const resolvedToday = today ?? (await this.currentDateString());
    const row = await this.db
      .prepare(
        `SELECT id
         FROM meal_plans
         WHERE tenant_id = ?
           AND status IN ('active', 'approved')
           AND week_start <= ?
           AND (week_end IS NULL OR week_end >= ?)
         ORDER BY week_start DESC
         LIMIT 1`,
      )
      .bind(this.tenantId, resolvedToday, resolvedToday)
      .first<{ id: string }>();

    if (row?.id) {
      return this.getPlanById(row.id);
    }

    const fallback = await this.db
      .prepare(
        `SELECT id
         FROM meal_plans
         WHERE tenant_id = ?
           AND status IN ('active', 'approved', 'draft')
         ORDER BY week_start DESC
         LIMIT 1`,
      )
      .bind(this.tenantId)
      .first<{ id: string }>();

    return fallback?.id ? this.getPlanById(fallback.id) : null;
  }

  async getPlanByWeek(weekStart: string): Promise<MealPlanRecord | null> {
    const row = await this.db
      .prepare(`SELECT id FROM meal_plans WHERE tenant_id = ? AND week_start = ? ORDER BY updated_at DESC LIMIT 1`)
      .bind(this.tenantId, weekStart)
      .first<{ id: string }>();

    return row?.id ? this.getPlanById(row.id) : null;
  }

  async getPlan(weekStart: string): Promise<MealPlanRecord | null> {
    return this.getPlanByWeek(weekStart);
  }

  async listPlanHistory(limit = 12): Promise<MealPlanHistoryRecord[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 52));
    const result = await this.db
      .prepare(
        `SELECT p.id, p.week_start, p.week_end, p.status, p.generated_at, p.approved_at, p.updated_at,
                p.summary_json,
                COUNT(e.id) AS entry_count
         FROM meal_plans p
         LEFT JOIN meal_plan_entries e ON e.tenant_id = p.tenant_id AND e.meal_plan_id = p.id
         WHERE p.tenant_id = ?
         GROUP BY p.id, p.week_start, p.week_end, p.status, p.generated_at, p.approved_at, p.updated_at, p.summary_json
         ORDER BY p.week_start DESC
         LIMIT ?`,
      )
      .bind(this.tenantId, boundedLimit)
      .all<{
        id: string;
        week_start: string;
        week_end: string | null;
        status: string;
        generated_at: string | null;
        approved_at: string | null;
        updated_at: string | null;
        summary_json: string | null;
        entry_count: number | string | null;
      }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      status: row.status,
      generatedAt: row.generated_at,
      approvedAt: row.approved_at,
      updatedAt: row.updated_at,
      entryCount: Number(row.entry_count ?? 0),
      summary: safeParse(row.summary_json),
    }));
  }

  async generatePlan(input: GenerateMealPlanInput): Promise<MealPlanGenerationRecord> {
    const overrides = normalizeGeneratePlanOverrides(input.overrides, input.weekStart);
    const snapshot = await this.buildPlanningSnapshot(
      input.weekStart,
      overrides,
      input.calendarContext ?? null,
      input.trainingContext ?? null,
    );
    const inputHash = await hashStableJson(snapshot.acceptanceHashInput);
    const now = new Date().toISOString();
    const generationId = `plan-generation:${input.weekStart}:${crypto.randomUUID()}`;
    const candidate = this.buildPrimaryPlanCandidate({
      snapshot,
      overrides,
      weekStart: input.weekStart,
    });
    const persisted: PersistedMealPlanGenerationRecord = {
      id: generationId,
      weekStart: input.weekStart,
      inputHash,
      createdAt: now,
      overrides,
      calendarContext: snapshot.calendarContext,
      trainingContext: snapshot.trainingContext,
      candidates: [candidate],
    };

    await this.db
      .prepare(
        `INSERT INTO meal_plan_generations (
          id, tenant_id, profile_id, week_start, input_hash, raw_json, source_snapshot_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generationId,
        this.tenantId,
        this.profileId,
        input.weekStart,
        inputHash,
        JSON.stringify(persisted),
        JSON.stringify(snapshot.acceptanceHashInput),
        now,
        now,
      )
      .run();

    await this.recordDomainEvent({
      entityType: 'meal_plan_generation',
      entityId: generationId,
      eventType: 'plan_generation.created',
      before: null,
      after: {
        candidateCount: persisted.candidates.length,
        calendarAvailability: snapshot.planningConstraints.calendarAvailability,
        calendarUsed: snapshot.planningConstraints.calendarUsed,
        inputHash,
        weekStart: input.weekStart,
      },
      patch: {
        calendarAvailability: snapshot.planningConstraints.calendarAvailability,
        calendarUsed: snapshot.planningConstraints.calendarUsed,
        candidateIds: persisted.candidates.map((entry) => entry.candidateId),
        weekStart: input.weekStart,
      },
      provenance: input.provenance,
    });

    return {
      id: generationId,
      weekStart: input.weekStart,
      inputHash,
      createdAt: now,
      overrides,
      calendarContext: snapshot.calendarContext,
      trainingContext: snapshot.trainingContext,
      candidates: persisted.candidates.map((entry) => entry.summary),
    };
  }

  async acceptPlanCandidate(input: AcceptMealPlanCandidateInput): Promise<MealPlanRecord> {
    const generation = await this.getPlanGeneration(input.generationId);
    if (!generation) {
      throw new Error(`Unknown meal plan generation: ${input.generationId}`);
    }
    if (generation.inputHash !== input.inputHash) {
      throw new Error('Meal plan candidate input hash did not match the stored generation.');
    }

    const currentHash = await hashStableJson(
      (
        await this.buildPlanningSnapshot(
          generation.weekStart,
          generation.overrides,
          input.calendarContext ?? generation.calendarContext ?? null,
          input.trainingContext ?? generation.trainingContext ?? null,
        )
      ).acceptanceHashInput,
    );
    if (currentHash !== generation.inputHash) {
      throw new Error('Meal plan candidate is stale because planning inputs changed.');
    }

    const candidate = generation.candidates.find((entry) => entry.candidateId === input.candidateId);
    if (!candidate) {
      throw new Error(`Unknown meal plan candidate: ${input.candidateId}`);
    }

    const acceptedPlan = await this.upsertPlan({
      plan: {
        ...(asRecord(candidate.plan) ?? {}),
        approved_at: new Date().toISOString(),
        source_snapshot: {
          ...(asRecord(asRecord(candidate.plan)?.source_snapshot) ?? {}),
          accepted_candidate_id: input.candidateId,
          generation_id: input.generationId,
          input_hash: input.inputHash,
          planner: 'mcp-native',
        },
        status: 'approved',
      },
      provenance: input.provenance,
    });

    await this.db
      .prepare(
        `UPDATE meal_plan_generations
         SET accepted_candidate_id = ?, accepted_plan_id = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(input.candidateId, acceptedPlan.id, new Date().toISOString(), this.tenantId, input.generationId)
      .run();

    await this.recordDomainEvent({
      entityType: 'meal_plan_generation',
      entityId: input.generationId,
      eventType: 'plan_candidate.accepted',
      before: null,
      after: {
        acceptedCandidateId: input.candidateId,
        acceptedPlanId: acceptedPlan.id,
        inputHash: input.inputHash,
      },
      patch: {
        accepted_candidate_id: input.candidateId,
        accepted_plan_id: acceptedPlan.id,
      },
      provenance: input.provenance,
    });

    return acceptedPlan;
  }

  async upsertPlan(input: UpsertMealPlanInput): Promise<MealPlanRecord> {
    const normalized = normalizeMealPlanDocument(input.plan);
    const existing =
      (normalized.id ? await this.getPlanById(normalized.id) : null) ?? (await this.getPlanByWeek(normalized.weekStart));
    const planId = existing?.id ?? normalized.id ?? `plan:${this.tenantId}:${normalized.weekStart}`;
    const now = new Date().toISOString();
    const status = normalized.status ?? 'approved';
    const approvedAt = status === 'approved' || status === 'active' ? normalized.approvedAt ?? now : normalized.approvedAt;

    await this.db
      .prepare(
        `INSERT INTO meal_plans (
          id, tenant_id, profile_id, week_start, week_end, status, generated_at, approved_at, profile_owner,
          requirements_json, summary_json, source_snapshot_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
        ON CONFLICT(id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          profile_id = excluded.profile_id,
          week_start = excluded.week_start,
          week_end = excluded.week_end,
          status = excluded.status,
          generated_at = excluded.generated_at,
          approved_at = excluded.approved_at,
          profile_owner = excluded.profile_owner,
          requirements_json = excluded.requirements_json,
          summary_json = excluded.summary_json,
          source_snapshot_json = excluded.source_snapshot_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        planId,
        this.tenantId,
        this.profileId,
        normalized.weekStart,
        normalized.weekEnd,
        status,
        normalized.generatedAt ?? now,
        approvedAt ?? null,
        normalized.profileOwner ?? null,
        stringifyJson(normalized.requirements),
        stringifyJson(normalized.summary),
        stringifyJson(normalized.sourceSnapshot),
        existing?.createdAt ?? now,
        now,
      )
      .run();

    await this.db
      .prepare(`DELETE FROM meal_plan_entries WHERE tenant_id = ? AND meal_plan_id = ?`)
      .bind(this.tenantId, planId)
      .run();

    for (const [index, entry] of normalized.entries.entries()) {
      await this.db
        .prepare(
          `INSERT INTO meal_plan_entries (
            id, tenant_id, meal_plan_id, date, day_label, meal_type, recipe_id, recipe_name_snapshot,
            selection_status, serves, prep_minutes, total_minutes, leftovers_expected,
            instructions_snapshot_json, notes_json, status, cooked_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          entry.id ?? `${planId}:entry:${index + 1}`,
          this.tenantId,
          planId,
          entry.date ?? null,
          entry.dayLabel ?? null,
          entry.mealType,
          entry.recipeId ?? null,
          entry.recipeNameSnapshot,
          entry.selectionStatus ?? null,
          entry.serves ?? null,
          entry.prepMinutes ?? null,
          entry.totalMinutes ?? null,
          entry.leftoversExpected ? 1 : 0,
          stringifyJson(entry.instructionsSnapshot ?? []),
          stringifyJson(entry.notes ?? null),
          entry.status ?? 'planned',
          entry.cookedAt ?? null,
          now,
        )
        .run();
    }

    const after = await this.getPlanById(planId);
    if (!after) {
      throw new Error(`Failed to upsert meal plan for week ${normalized.weekStart}`);
    }

    await this.recordDomainEvent({
      entityType: 'meal_plan',
      entityId: planId,
      eventType: existing ? 'plan.updated' : 'plan.created',
      before: existing,
      after,
      patch: {
        status,
        week_start: normalized.weekStart,
        entry_count: normalized.entries.length,
      },
      provenance: input.provenance,
    });

    return after;
  }

  async getDayPlan(date: string): Promise<MealPlanEntryRecord[]> {
    const currentPlan = await this.getCurrentPlan(date);
    if (!currentPlan) {
      return [];
    }

    return this.filterEntriesForDate(currentPlan.entries, date);
  }

  async getTodayContext(date?: string): Promise<TodayContext> {
    const resolvedDate = date ?? (await this.currentDateString());
    const plan = await this.getCurrentPlan(resolvedDate);
    if (!plan) {
      return {
        date: resolvedDate,
        plan: null,
        entries: [],
        missingFeedbackRecipeIds: [],
        executionSupportSummary: deriveExecutionSupportSummary(null),
        trainingAlignmentSummary: {
          trainingContextUsed: false,
          trainingDays: [],
          sessionLoadByDay: {},
          nutritionSupportMode: null,
          weekComplexity: null,
          planningBiasesApplied: [],
        },
      };
    }

    const entries = await this.filterEntriesForDate(plan.entries, resolvedDate);
    const recipeIds = entries.map((entry) => entry.recipeId).filter((value): value is string => Boolean(value));
    const recipes = new Map<string, MealRecipeRecord | null>();
    for (const recipeId of recipeIds) {
      recipes.set(recipeId, await this.getRecipe(recipeId));
    }

    const feedback = await this.getFeedbackForDate(resolvedDate, plan.id);
    const loggedByEntryId = new Set(feedback.filter((item) => item.mealPlanEntryId).map((item) => item.mealPlanEntryId as string));
    const loggedByRecipeId = new Set(feedback.map((item) => item.recipeId));

    const enrichedEntries = entries.map((entry) => ({
      ...entry,
      recipe: entry.recipeId ? recipes.get(entry.recipeId) ?? null : null,
      feedbackLogged:
        (entry.id ? loggedByEntryId.has(entry.id) : false) ||
        (entry.recipeId ? loggedByRecipeId.has(entry.recipeId) : false),
    }));

    return {
      date: resolvedDate,
      plan,
      entries: enrichedEntries,
      missingFeedbackRecipeIds: enrichedEntries
        .filter((entry) => entry.recipeId && !entry.feedbackLogged)
        .map((entry) => entry.recipeId as string),
      executionSupportSummary: deriveExecutionSupportSummary(plan),
      trainingAlignmentSummary: plan.trainingAlignmentSummary,
    };
  }

  async getExecutionSupportSummary(today?: string): Promise<MealPlanSummaryRecord['executionSupportSummary']> {
    const plan = await this.getCurrentPlan(today);
    return deriveExecutionSupportSummary(plan);
  }

  async getRecipe(recipeId: string): Promise<MealRecipeRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, slug, name, meal_type, status, raw_json
         FROM meal_recipes
         WHERE id = ?`,
      )
      .bind(recipeId)
      .first<{
        id: string;
        slug: string | null;
        name: string;
        meal_type: string;
        status: string;
        raw_json: string | null;
      }>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      mealType: row.meal_type,
      status: row.status,
      raw: safeParse(row.raw_json),
    };
  }

  async createRecipe(input: CreateRecipeInput): Promise<MealRecipeRecord> {
    const recipe = validateRecipeDocument(input.recipe);
    const existing = await this.getRecipe(recipe.id);
    if (existing) {
      throw new Error(`Recipe already exists: ${recipe.id}`);
    }

    const derived = deriveRecipeColumns(recipe);
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO meal_recipes (
          id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, macros_json,
          cost_per_serving_cad, kid_friendly, instructions_json, mise_en_place_json, prep_notes,
          reheat_guidance, serving_notes, status, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        recipe.id,
        derived.slug,
        derived.name,
        derived.mealType,
        derived.servings,
        derived.totalTimeMinutes,
        derived.activeTimeMinutes,
        derived.macrosJson,
        derived.costPerServingCad,
        derived.kidFriendly,
        derived.instructionsJson,
        derived.miseEnPlaceJson,
        derived.prepNotes,
        derived.reheatGuidance,
        derived.servingNotes,
        derived.status,
        derived.rawJson,
        now,
        now,
      )
      .run();

    const created = await this.getRecipe(recipe.id);
    if (!created) {
      throw new Error(`Failed to create recipe ${recipe.id}`);
    }

    await this.recordDomainEvent({
      entityType: 'meal_recipe',
      entityId: created.id,
      eventType: 'recipe.created',
      before: null,
      after: created,
      patch: {
        recipe_id: created.id,
        meal_type: created.mealType,
      },
      provenance: input.provenance,
    });

    return created;
  }

  async listRecipes(mealType?: string, status = 'active'): Promise<MealRecipeRecord[]> {
    const statement = mealType
      ? this.db
          .prepare(
            `SELECT id, slug, name, meal_type, status, raw_json
             FROM meal_recipes
             WHERE meal_type = ? AND status = ?
             ORDER BY name ASC`,
          )
          .bind(mealType, status)
      : this.db
          .prepare(
            `SELECT id, slug, name, meal_type, status, raw_json
             FROM meal_recipes
             WHERE status = ?
             ORDER BY meal_type ASC, name ASC`,
          )
          .bind(status);

    const result = await statement.all<{
      id: string;
      slug: string | null;
      name: string;
      meal_type: string;
      status: string;
      raw_json: string | null;
    }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      mealType: row.meal_type,
      status: row.status,
      raw: safeParse(row.raw_json),
    }));
  }

  async getPreferences(): Promise<MealPreferencesRecord> {
    const row = await this.db
      .prepare(
        `SELECT tenant_id, profile_id, version, raw_json, updated_at
         FROM meal_preferences
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(this.tenantId, this.profileId)
      .first<{
        tenant_id: string;
        profile_id: string;
        version: string | null;
        raw_json: string;
        updated_at: string | null;
      }>();

    if (!row) {
      throw new Error('Missing Fluent meal preferences.');
    }

    const raw = asRecord(safeParse(row.raw_json)) ?? {};
    return {
      profileId: row.profile_id,
      profileOwner: typeof raw.profile_owner === 'string' ? raw.profile_owner : null,
      raw,
      tenantId: row.tenant_id,
      updatedAt: row.updated_at,
      version: row.version ?? '1',
    };
  }

  async updatePreferences(input: UpdateMealPreferencesInput): Promise<MealPreferencesRecord> {
    const before = await this.getPreferences();
    const nextRaw = normalizeMealPreferences(input.preferences);
    const version = typeof nextRaw.version === 'string' && nextRaw.version.trim() ? nextRaw.version.trim() : before.version;
    const now = new Date().toISOString();
    nextRaw.updated_at = now;
    if (!nextRaw.profile_owner && before.profileOwner) {
      nextRaw.profile_owner = before.profileOwner;
    }

    await this.db
      .prepare(
        `INSERT INTO meal_preferences (
          tenant_id, profile_id, version, raw_json, source_snapshot_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM meal_preferences WHERE tenant_id = ? AND profile_id = ?), CURRENT_TIMESTAMP), ?)
        ON CONFLICT(tenant_id, profile_id) DO UPDATE SET
          version = excluded.version,
          raw_json = excluded.raw_json,
          source_snapshot_json = excluded.source_snapshot_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        this.tenantId,
        this.profileId,
        version,
        JSON.stringify(nextRaw),
        stringifyJson(input.sourceSnapshot ?? null),
        this.tenantId,
        this.profileId,
        now,
      )
      .run();

    const after = await this.getPreferences();
    await this.recordDomainEvent({
      entityType: 'meal_preferences',
      entityId: `${after.tenantId}:${after.profileId}`,
      eventType: 'preferences.updated',
      before: before.raw,
      after: after.raw,
      patch: {
        version: after.version,
      },
      provenance: input.provenance,
    });

    return after;
  }

  async getInventory(): Promise<InventoryRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT id, name, normalized_name, status, source, confirmed_at, purchased_at,
                estimated_expiry, perishability, long_life_default, canonical_item_key, canonical_quantity,
                canonical_unit, canonical_confidence, quantity, unit, location, brand, cost_cad,
                metadata_json
         FROM meal_inventory_items
         WHERE tenant_id = ?
           AND status != 'removed'
         ORDER BY name ASC`,
      )
      .bind(this.tenantId)
      .all<{
        id: string;
        name: string;
        normalized_name: string | null;
        status: string;
        source: string | null;
        confirmed_at: string | null;
        purchased_at: string | null;
        estimated_expiry: string | null;
        perishability: string | null;
        long_life_default: number | null;
        canonical_item_key: string | null;
        canonical_quantity: number | null;
        canonical_unit: string | null;
        canonical_confidence: number | null;
        quantity: number | null;
        unit: string | null;
        location: string | null;
        brand: string | null;
        cost_cad: number | null;
        metadata_json: string | null;
      }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      canonicalItemKey: row.canonical_item_key,
      canonicalQuantity: row.canonical_quantity,
      canonicalUnit: row.canonical_unit,
      canonicalConfidence: row.canonical_confidence,
      status: row.status,
      source: row.source,
      confirmedAt: row.confirmed_at,
      purchasedAt: row.purchased_at,
      estimatedExpiry: row.estimated_expiry,
      perishability: row.perishability,
      longLifeDefault: Boolean(row.long_life_default),
      quantity: row.quantity,
      unit: row.unit,
      location: row.location,
      brand: row.brand,
      costCad: row.cost_cad,
      metadata: safeParse(row.metadata_json),
    }));
  }

  async getInventorySummary(today?: string): Promise<InventorySummary> {
    const inventory = await this.getInventory();
    const resolvedToday = today ?? (await this.currentDateString());
    const cutoff = shiftDateString(resolvedToday, 3);

    return {
      byStatus: inventory.reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.status] = (accumulator[item.status] ?? 0) + 1;
        return accumulator;
      }, {}),
      expiringSoon: inventory.filter((item) => Boolean(item.estimatedExpiry && item.estimatedExpiry <= cutoff)),
      totalItems: inventory.length,
    };
  }

  async getMealMemory(recipeId?: string): Promise<MealMemoryRecord[]> {
    const statement = recipeId
      ? this.db
          .prepare(
            `SELECT recipe_id, status, last_feedback_json, notes_json, last_used_at, updated_at
             FROM meal_memory
             WHERE tenant_id = ? AND recipe_id = ?
             ORDER BY recipe_id ASC`,
          )
          .bind(this.tenantId, recipeId)
      : this.db.prepare(
          `SELECT recipe_id, status, last_feedback_json, notes_json, last_used_at, updated_at
           FROM meal_memory
           WHERE tenant_id = ?
           ORDER BY recipe_id ASC`,
        ).bind(this.tenantId);

    const result = await statement.all<{
      recipe_id: string;
      status: string;
      last_feedback_json: string | null;
      notes_json: string | null;
      last_used_at: string | null;
      updated_at: string | null;
    }>();

    return (result.results ?? []).map((row) => ({
      recipeId: row.recipe_id,
      status: row.status,
      lastFeedback: safeParse(row.last_feedback_json),
      notes: safeParse(row.notes_json),
      lastUsedAt: row.last_used_at,
      updatedAt: row.updated_at,
    }));
  }

  async listMealFeedback(filters: ListMealFeedbackFilters = {}): Promise<MealFeedbackRecord[]> {
    const limit = Math.max(1, Math.min(filters.limit ?? 25, 100));
    let sql =
      `SELECT id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty, time_reality,
              repeat_again, family_acceptance, notes, submitted_by, source_agent, source_skill,
              session_id, confidence, source_type, created_at
       FROM meal_feedback`;
    const conditions: string[] = ['tenant_id = ?'];
    const values: Array<string | number> = [this.tenantId];

    if (filters.recipeId) {
      conditions.push('recipe_id = ?');
      values.push(filters.recipeId);
    }

    if (filters.date) {
      conditions.push('date = ?');
      values.push(filters.date);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    values.push(limit);

    const result = await this.db.prepare(sql).bind(...values).all<{
      id: string;
      meal_plan_id: string | null;
      meal_plan_entry_id: string | null;
      recipe_id: string;
      date: string;
      taste: FeedbackValue | null;
      difficulty: FeedbackValue | null;
      time_reality: FeedbackValue | null;
      repeat_again: FeedbackValue | null;
      family_acceptance: FeedbackValue | null;
      notes: string | null;
      submitted_by: string | null;
      source_agent: string | null;
      source_skill: string | null;
      session_id: string | null;
      confidence: number | null;
      source_type: string | null;
      created_at: string | null;
    }>();

    return (result.results ?? []).map(mapMealFeedbackRow);
  }

  async logFeedback(input: LogFeedbackInput): Promise<MealFeedbackRecord> {
    const date = input.date ?? (await this.currentDateString());
    const resolvedEntry = await this.resolvePlanEntry({
      mealPlanEntryId: input.mealPlanEntryId,
      recipeId: input.recipeId,
      date,
    });

    const feedbackId = `feedback:${input.recipeId}:${date}:${crypto.randomUUID()}`;
    const mealPlanId = input.mealPlanId ?? resolvedEntry?.mealPlanId ?? null;
    const mealPlanEntryId = input.mealPlanEntryId ?? resolvedEntry?.id ?? null;
    const createdAt = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO meal_feedback (
          id, tenant_id, profile_id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty, time_reality,
          repeat_again, family_acceptance, notes, submitted_by, source_agent, source_skill,
          session_id, confidence, source_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        feedbackId,
        this.tenantId,
        this.profileId,
        mealPlanId,
        mealPlanEntryId,
        input.recipeId,
        date,
        input.taste ?? null,
        input.difficulty ?? null,
        input.timeReality ?? null,
        input.repeatAgain ?? null,
        input.familyAcceptance ?? null,
        input.notes ?? null,
        input.submittedBy ?? null,
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
      )
      .run();

    const existingMemory = await this.getMealMemory(input.recipeId);
    const currentMemory = existingMemory[0] ?? null;
    const currentStatus =
      currentMemory?.status === 'active' || currentMemory?.status === 'observed'
        ? 'trial'
        : (currentMemory?.status ?? 'trial');
    const nextStatus = deriveMealStatus(currentStatus, input);

    await this.upsertMealMemoryRecord({
      recipeId: input.recipeId,
      status: nextStatus,
      lastFeedback: {
        ...(asRecord(currentMemory?.lastFeedback) ?? {}),
        taste: input.taste ?? null,
        difficulty: input.difficulty ?? null,
        time_reality: input.timeReality ?? null,
        repeat_again: input.repeatAgain ?? null,
        family_acceptance: input.familyAcceptance ?? null,
      },
      notes: mergeNotes(currentMemory?.notes, input.notes),
      lastUsedAt: date,
      updatedAt: createdAt,
    });

    const feedbackRecord: MealFeedbackRecord = {
      id: feedbackId,
      mealPlanId,
      mealPlanEntryId,
      recipeId: input.recipeId,
      date,
      taste: input.taste ?? null,
      difficulty: input.difficulty ?? null,
      timeReality: input.timeReality ?? null,
      repeatAgain: input.repeatAgain ?? null,
      familyAcceptance: input.familyAcceptance ?? null,
      notes: input.notes ?? null,
      submittedBy: input.submittedBy ?? null,
      sourceAgent: input.provenance.sourceAgent,
      sourceSkill: input.provenance.sourceSkill,
      sessionId: input.provenance.sessionId,
      confidence: input.provenance.confidence,
      sourceType: input.provenance.sourceType,
      createdAt,
    };

    await this.recordDomainEvent({
      entityType: 'meal_feedback',
      entityId: feedbackRecord.id,
      eventType: 'feedback.logged',
      before: null,
      after: feedbackRecord,
      patch: {
        meal_plan_id: mealPlanId,
        meal_plan_entry_id: mealPlanEntryId,
        recipe_id: input.recipeId,
      },
      provenance: input.provenance,
    });

    return feedbackRecord;
  }

  async markMealCooked(input: MarkMealCookedInput): Promise<MealPlanEntryRecord | null> {
    const date = input.date ?? (await this.currentDateString());
    const entry = await this.resolvePlanEntry({
      mealPlanEntryId: input.mealPlanEntryId,
      recipeId: input.recipeId ?? null,
      date,
      allowFutureRecipeFallback: true,
    });

    if (!entry) {
      return null;
    }

    const planBefore = await this.getPlanById(entry.mealPlanId);
    const before = { ...entry };
    const cookedAt = new Date().toISOString();
    const planRescheduled = await this.applyCookedMealMutation({
      cookedAt,
      cookedDate: date,
      entry,
      plan: planBefore,
    });

    const refreshedPlan = await this.getPlanById(entry.mealPlanId);
    const updated = refreshedPlan?.entries.find((item) => item.id === entry.id) ?? null;

    if (updated) {
      await this.recordDomainEvent({
        entityType: 'meal_plan_entry',
        entityId: updated.id,
        eventType: 'meal.cooked',
        before,
        after: updated,
        patch: {
          cooked_at: cookedAt,
          cooked_date: date,
          date: updated.date,
          rescheduled: planRescheduled,
          scheduled_date: before.date,
          status: 'cooked',
        },
        provenance: input.provenance,
      });
    }

    if (planRescheduled && planBefore && refreshedPlan && updated) {
      await this.recordDomainEvent({
        entityType: 'meal_plan',
        entityId: refreshedPlan.id,
        eventType: 'plan.updated',
        before: planBefore,
        after: refreshedPlan,
        patch: {
          cooked_entry_id: updated.id,
          meal_type: updated.mealType,
          rescheduled_for_cooked_meal: true,
          to_date: updated.date,
          week_start: refreshedPlan.weekStart,
        },
        provenance: input.provenance,
      });
    }

    return updated;
  }

  async updateInventory(input: UpdateInventoryInput): Promise<InventoryRecord> {
    const before = await this.lookupInventoryByNormalizedName(normalizeText(input.name));
    const [record] = await this.persistInventoryBatchInternal([input]);

    if (!record) {
      throw new Error(`Inventory update failed for ${input.name}`);
    }

    await this.recordDomainEvent({
      entityType: 'meal_inventory_item',
      entityId: record.id,
      eventType: before ? 'inventory.updated' : 'inventory.created',
      before,
      after: record,
      patch: { normalized_name: record.normalizedName, status: record.status },
      provenance: input.provenance,
    });

    await this.maybePersistConfirmedOrderSyncFromMetadata(input.metadata, input.provenance);

    return record;
  }

  async deleteInventoryItem(input: DeleteInventoryItemInput): Promise<InventoryRecord | null> {
    const normalizedName = normalizeText(input.name);
    const existing = await this.lookupInventoryByNormalizedName(normalizedName);
    if (!existing) {
      return null;
    }

    await this.db
      .prepare(`DELETE FROM meal_inventory_items WHERE tenant_id = ? AND normalized_name = ?`)
      .bind(this.tenantId, normalizedName)
      .run();

    await this.recordDomainEvent({
      entityType: 'meal_inventory_item',
      entityId: existing.id,
      eventType: 'inventory.deleted',
      before: existing,
      after: null,
      patch: { normalized_name: normalizedName, hard_delete: true },
      provenance: input.provenance,
    });

    return existing;
  }

  async updateInventoryBatch(input: UpdateInventoryBatchInput): Promise<{
    createdCount: number;
    updatedCount: number;
    itemsProcessed: number;
    items: Array<{ name: string; normalizedName: string | null; status: string }>;
    records: InventoryRecord[];
  }> {
    if (input.items.length === 0) {
      return {
        createdCount: 0,
        updatedCount: 0,
        items: [],
        itemsProcessed: 0,
        records: [],
      };
    }

    const collapsed = this.collapseInventoryBatchItems(input.items);
    const beforeRecords = await Promise.all(
      collapsed.map(async (item) => this.lookupInventoryByNormalizedName(normalizeText(item.name))),
    );
    const records = await this.persistInventoryBatchInternal(collapsed);

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!record) continue;

      await this.recordDomainEvent({
        entityType: 'meal_inventory_item',
        entityId: record.id,
        eventType: beforeRecords[index] ? 'inventory.updated' : 'inventory.created',
        before: beforeRecords[index],
        after: record,
        patch: { normalized_name: record.normalizedName, status: record.status },
        provenance: input.provenance,
      });
    }

    await this.recordDomainEvent({
      entityType: 'meal_inventory_batch',
      entityId: `inventory-batch:${crypto.randomUUID()}`,
      eventType: 'inventory.batch_updated',
      before: beforeRecords,
      after: records,
      patch: {
        created_count: beforeRecords.filter((entry) => !entry).length,
        updated_count: beforeRecords.filter(Boolean).length,
        items_processed: records.length,
      },
      provenance: input.provenance,
    });

    for (const item of input.items) {
      await this.maybePersistConfirmedOrderSyncFromMetadata(item.metadata, input.provenance);
    }

    return {
      createdCount: beforeRecords.filter((entry) => !entry).length,
      updatedCount: beforeRecords.filter(Boolean).length,
      items: records.map((record) => ({
        name: record.name,
        normalizedName: record.normalizedName,
        status: record.status,
      })),
      itemsProcessed: records.length,
      records,
    };
  }

  async recordPlanReview(input: PlanReviewInput): Promise<{ id: string; mealPlanId: string | null; weekStart: string }> {
    const plan = input.weekStart ? await this.getPlanByWeek(input.weekStart) : await this.getCurrentPlan();
    const weekStart = input.weekStart ?? plan?.weekStart;
    if (!weekStart) {
      throw new Error('Unable to resolve week_start for plan review.');
    }

    const reviewId = `plan-review:${weekStart}:${crypto.randomUUID()}`;
    const mealPlanId = input.mealPlanId ?? plan?.id ?? null;

    await this.db
      .prepare(
        `INSERT INTO meal_plan_reviews (
          id, tenant_id, profile_id, meal_plan_id, week_start, summary, worked_json, skipped_json, next_changes_json,
          source_agent, source_skill, session_id, confidence, source_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reviewId,
        this.tenantId,
        this.profileId,
        mealPlanId,
        weekStart,
        input.summary ?? null,
        JSON.stringify(input.worked ?? []),
        JSON.stringify(input.skipped ?? []),
        JSON.stringify(input.nextChanges ?? []),
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
      )
      .run();

    const review = {
      id: reviewId,
      mealPlanId,
      weekStart,
    };

    await this.recordDomainEvent({
      entityType: 'meal_plan_review',
      entityId: reviewId,
      eventType: 'plan.reviewed',
      before: null,
      after: review,
      patch: { meal_plan_id: mealPlanId, week_start: weekStart },
      provenance: input.provenance,
    });

    return review;
  }

  async patchRecipe(input: PatchRecipeInput): Promise<MealRecipeRecord> {
    const current = await this.getRecipe(input.recipeId);
    if (!current) {
      throw new Error(`Recipe not found: ${input.recipeId}`);
    }

    const currentRecipe = validateRecipeDocument(current.raw);
    const nextRecipe = validateRecipeDocument(applyJsonPatch(currentRecipe, input.operations));
    if (nextRecipe.id !== input.recipeId) {
      throw new Error('Recipe patches may not change the recipe id.');
    }

    const derived = deriveRecipeColumns(nextRecipe);
    const updatedAt = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE meal_recipes
         SET slug = ?, name = ?, meal_type = ?, status = ?, servings = ?, total_time_minutes = ?,
             active_time_minutes = ?, macros_json = ?, cost_per_serving_cad = ?, kid_friendly = ?,
             instructions_json = ?, mise_en_place_json = ?, prep_notes = ?, reheat_guidance = ?,
             serving_notes = ?, raw_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        derived.slug,
        derived.name,
        derived.mealType,
        derived.status,
        derived.servings,
        derived.totalTimeMinutes,
        derived.activeTimeMinutes,
        derived.macrosJson,
        derived.costPerServingCad,
        derived.kidFriendly,
        derived.instructionsJson,
        derived.miseEnPlaceJson,
        derived.prepNotes,
        derived.reheatGuidance,
        derived.servingNotes,
        derived.rawJson,
        updatedAt,
        input.recipeId,
      )
      .run();

    const updated = await this.getRecipe(input.recipeId);
    if (!updated) {
      throw new Error(`Recipe patch failed for ${input.recipeId}`);
    }

    await this.recordDomainEvent({
      entityType: 'meal_recipe',
      entityId: updated.id,
      eventType: 'recipe.patched',
      before: current.raw,
      after: updated.raw,
      patch: input.operations,
      provenance: input.provenance,
    });

    return updated;
  }

  async listGroceryIntents(status?: string): Promise<GroceryIntentRecord[]> {
    const statement = status
      ? this.db
          .prepare(
            `SELECT id, normalized_name, display_name, quantity, unit, notes, status, target_window,
                    meal_plan_id, metadata_json, source_agent, source_skill, session_id,
                    confidence, source_type, created_at, updated_at
             FROM grocery_intents
             WHERE tenant_id = ? AND status = ?
             ORDER BY updated_at DESC, display_name ASC`,
          )
          .bind(this.tenantId, status)
      : this.db.prepare(
          `SELECT id, normalized_name, display_name, quantity, unit, notes, status, target_window,
                  meal_plan_id, metadata_json, source_agent, source_skill, session_id,
                  confidence, source_type, created_at, updated_at
           FROM grocery_intents
           WHERE tenant_id = ?
             AND status != 'deleted'
           ORDER BY updated_at DESC, display_name ASC`,
        ).bind(this.tenantId);

    const result = await statement.all<{
      id: string;
      normalized_name: string;
      display_name: string;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
      status: string;
      target_window: string | null;
      meal_plan_id: string | null;
      metadata_json: string | null;
      source_agent: string | null;
      source_skill: string | null;
      session_id: string | null;
      confidence: number | null;
      source_type: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>();

    return (result.results ?? []).map(mapGroceryIntentRow);
  }

  async listDomainEvents(filters: ListDomainEventsFilters = {}): Promise<DomainEventRecord[]> {
    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
    let sql =
      `SELECT id, domain, entity_type, entity_id, event_type, before_json, after_json, patch_json,
              source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name, created_at
       FROM domain_events`;
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (filters.domain) {
      conditions.push('domain = ?');
      values.push(filters.domain);
    }
    if (filters.entityType) {
      conditions.push('entity_type = ?');
      values.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push('entity_id = ?');
      values.push(filters.entityId);
    }
    if (filters.eventType) {
      conditions.push('event_type = ?');
      values.push(filters.eventType);
    }
    if (filters.since) {
      conditions.push('created_at >= ?');
      values.push(filters.since);
    }
    if (filters.until) {
      conditions.push('created_at <= ?');
      values.push(filters.until);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    values.push(limit);

    const result = await this.db.prepare(sql).bind(...values).all<{
      id: string;
      domain: string;
      entity_type: string;
      entity_id: string | null;
      event_type: string;
      before_json: string | null;
      after_json: string | null;
      patch_json: string | null;
      source_agent: string | null;
      source_skill: string | null;
      session_id: string | null;
      confidence: number | null;
      source_type: string | null;
      actor_email: string | null;
      actor_name: string | null;
      created_at: string | null;
    }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      domain: row.domain,
      entityType: row.entity_type,
      entityId: row.entity_id,
      eventType: row.event_type,
      before: safeParse(row.before_json),
      after: safeParse(row.after_json),
      patch: safeParse(row.patch_json),
      sourceAgent: row.source_agent,
      sourceSkill: row.source_skill,
      sessionId: row.session_id,
      confidence: row.confidence,
      sourceType: row.source_type,
      actorEmail: row.actor_email,
      actorName: row.actor_name,
      createdAt: row.created_at,
    }));
  }

  async getConfirmedOrderSync(retailer: string, retailerOrderId: string): Promise<ConfirmedOrderSyncRecord | null> {
    const normalizedRetailer = normalizeText(retailer);
    const normalizedOrderId = retailerOrderId.trim();
    if (!normalizedRetailer || !normalizedOrderId) {
      return null;
    }

    const row = await this.db
      .prepare(
        `SELECT id, retailer, retailer_order_id, week_start, status, confirmed_at, synced_at,
                matched_purchased_count, ordered_extra_count, explicit_skipped_count,
                missing_planned_count, unresolved_count, payload_summary_json, created_at, updated_at
         FROM meal_confirmed_order_syncs
         WHERE tenant_id = ? AND retailer = ? AND retailer_order_id = ?`,
      )
      .bind(this.tenantId, normalizedRetailer, normalizedOrderId)
      .first<{
        id: string;
        retailer: string;
        retailer_order_id: string;
        week_start: string;
        status: ConfirmedOrderSyncStatus;
        confirmed_at: string | null;
        synced_at: string;
        matched_purchased_count: number | null;
        ordered_extra_count: number | null;
        explicit_skipped_count: number | null;
        missing_planned_count: number | null;
        unresolved_count: number | null;
        payload_summary_json: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();

    return row ? this.mapConfirmedOrderSyncRow(row) : null;
  }

  async getGroceryPlan(weekStart: string): Promise<GroceryPlanRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, week_start, meal_plan_id, raw_json, generated_at
         FROM meal_grocery_plans
         WHERE tenant_id = ? AND week_start = ?`,
      )
      .bind(this.tenantId, weekStart)
      .first<{
        id: string;
        week_start: string;
        meal_plan_id: string | null;
        raw_json: string;
        generated_at: string;
      }>();

    if (!row) {
      return null;
    }

    const basePlan = {
      id: row.id,
      weekStart: row.week_start,
      mealPlanId: row.meal_plan_id,
      generatedAt: row.generated_at,
      raw: (safeParse(row.raw_json) as GroceryPlanRecord['raw']) ?? {
        generatedAt: row.generated_at,
        items: [],
        notes: [],
        actionsAppliedCount: 0,
        preferencesVersion: null,
        profileOwner: null,
        resolvedItems: [],
        sources: {
          groceryIntentCount: 0,
          inventoryItemCount: 0,
          planId: row.meal_plan_id,
          recipeCount: 0,
        },
        weekStart: row.week_start,
      },
    };

    return this.applyGroceryPlanActions(basePlan, await this.listGroceryPlanActions(weekStart));
  }

  async prepareOrder(input: PrepareOrderInput): Promise<PreparedOrderRecord> {
    const generatedAt = new Date().toISOString();
    const retailer = input.retailer?.trim() ? input.retailer.trim().toLowerCase() : null;
    const notes: string[] = [];
    const freshness: PreparedOrderRecord['freshness'] = {
      generatedAt,
      groceryPlanUpdatedAt: null,
      inventoryUpdatedAt: null,
    };

    const groceryPlan = await this.getGroceryPlan(input.weekStart);
    if (!groceryPlan) {
      return {
        weekStart: input.weekStart,
        retailer,
        safeToOrder: false,
        remainingToBuy: [],
        alreadyCoveredByInventory: [],
        alreadyInRetailerCart: [],
        unresolvedItems: [],
        substitutionDecisions: [],
        freshness,
        notes: ['No current grocery plan exists for this week. Generate and review the grocery plan before ordering.'],
      };
    }

    freshness.groceryPlanUpdatedAt = groceryPlan.generatedAt;

    let inventory: InventoryRecord[];
    let longLifeDefaults: string[] = [];
    try {
      const [preferences, loadedInventory] = await Promise.all([this.getPreferences(), this.getInventory()]);
      inventory = loadedInventory;
      longLifeDefaults = asStringArray(asRecord(asRecord(preferences.raw)?.inventory)?.long_life_defaults);
    } catch (error) {
      notes.push(`Inventory could not be read: ${error instanceof Error ? error.message : String(error)}`);
      return {
        weekStart: input.weekStart,
        retailer,
        safeToOrder: false,
        remainingToBuy: [],
        alreadyCoveredByInventory: [],
        alreadyInRetailerCart: [],
        unresolvedItems: [],
        substitutionDecisions: this.collectPreparedOrderSubstitutions(groceryPlan),
        freshness,
        notes,
      };
    }

    freshness.inventoryUpdatedAt = this.latestInventoryTimestamp(inventory);

    const remainingToBuy: PreparedOrderItemRecord[] = [];
    const alreadyCoveredByInventory: PreparedOrderItemRecord[] = [];
    const alreadyInRetailerCart: PreparedOrderRecord['alreadyInRetailerCart'] = [];
    const unresolvedItems: PreparedOrderUnresolvedItemRecord[] = [];
    const substitutionDecisions = this.collectPreparedOrderSubstitutions(groceryPlan);
    const actionMap = new Map(
      (await this.listGroceryPlanActions(groceryPlan.weekStart)).map((action) => [action.itemKey, action]),
    );
    const cartItems = Array.isArray(input.retailerCartItems) ? input.retailerCartItems : [];
    const cartMatchState = cartItems.map((item, index) => ({
      index,
      matched: false,
      quantity: item.quantity ?? null,
      title: String(item.title ?? '').trim(),
    }));

    for (const item of groceryPlan.raw.resolvedItems) {
      if (item.actionStatus !== 'in_cart') {
        continue;
      }
      const cartMatch = this.findRetailerCartMatch(item, cartMatchState);
      if (cartMatch) {
        cartMatch.matched = true;
      }
      alreadyInRetailerCart.push({
        displayName: item.name,
        matchedCartTitle: cartMatch?.title ?? item.name,
        quantity: item.quantity ?? null,
      });
    }

    for (const item of groceryPlan.raw.items) {
      const line = this.toPreparedOrderLine(item.name, item.quantity, item.unit, item.note ?? null);
      const action = actionMap.get(item.itemKey) ?? null;
      const sufficiencyDecision = this.resolvePreparedOrderSufficiencyDecision(item, action);

      if (sufficiencyDecision === 'have_enough') {
        alreadyCoveredByInventory.push({
          ...line,
          notes: action?.notes ?? 'Confirmed as enough on hand for the current week plan.',
        });
        continue;
      }

      if (sufficiencyDecision === 'dont_have_it' || sufficiencyDecision === 'have_some_need_to_buy') {
        const cartMatch = this.findRetailerCartMatch(item, cartMatchState);
        if (cartMatch) {
          cartMatch.matched = true;
          alreadyInRetailerCart.push({
            displayName: item.name,
            matchedCartTitle: cartMatch.title,
            quantity: item.quantity ?? null,
          });
          continue;
        }
        remainingToBuy.push(
          this.toPreparedOrderLine(
            item.name,
            item.canonicalQuantity ?? item.quantity ?? null,
            item.canonicalQuantity != null && item.canonicalUnit ? item.canonicalUnit : item.unit ?? null,
            action?.notes ??
              (sufficiencyDecision === 'have_some_need_to_buy'
                ? 'Confirmed as partially stocked; buy the planned amount for the current week.'
                : line.notes),
          ),
        );
        continue;
      }

      if (action?.actionStatus === 'needs_purchase') {
        const cartMatch = this.findRetailerCartMatch(item, cartMatchState);
        if (cartMatch) {
          cartMatch.matched = true;
          alreadyInRetailerCart.push({
            displayName: item.name,
            matchedCartTitle: cartMatch.title,
            quantity: item.quantity ?? null,
          });
          continue;
        }
        remainingToBuy.push(
          this.toPreparedOrderLine(
            item.name,
            item.canonicalQuantity ?? item.quantity ?? null,
            item.canonicalQuantity != null && item.canonicalUnit ? item.canonicalUnit : item.unit ?? null,
            action.notes ?? line.notes,
          ),
        );
        continue;
      }

      if (item.inventoryStatus === 'check_pantry') {
        unresolvedItems.push({
          ...line,
          reason: 'Pantry stock still needs confirmation before ordering.',
          sufficiencyConfirmationEligible: this.isPreparedOrderSufficiencyEligible(item),
          sufficiencyConfirmationOptions: this.isPreparedOrderSufficiencyEligible(item)
            ? PREPARED_ORDER_SUFFICIENCY_STATUSES
            : null,
        });
        continue;
      }

      const inventoryMatch = findInventoryMatch({
        allowedSubstituteQueries: item.allowedSubstituteQueries,
        inventory,
        longLifeDefaults,
        name: item.name,
        neededCanonicalItemKey: item.canonicalItemKey ?? undefined,
        neededCanonicalQuantity: item.canonicalQuantity ?? undefined,
        neededCanonicalUnit: item.canonicalUnit ?? undefined,
        neededQuantity: item.quantity,
        neededUnit: item.unit,
        normalizedName: item.normalizedName,
        planningWindowStart: groceryPlan.weekStart,
      });

      if (inventoryMatch.uncertainty) {
        unresolvedItems.push({
          ...line,
          reason: this.describePreparedOrderUncertainty(item, inventoryMatch.uncertainty),
          notes: inventoryMatch.note ?? line.notes,
          sufficiencyConfirmationEligible: false,
          sufficiencyConfirmationOptions: null,
        });
        continue;
      }

      if (inventoryMatch.status === 'sufficient') {
        alreadyCoveredByInventory.push({
          ...line,
          notes: inventoryMatch.note ?? line.notes,
        });
        continue;
      }

      const cartMatch = this.findRetailerCartMatch(item, cartMatchState);
      if (cartMatch) {
        cartMatch.matched = true;
        alreadyInRetailerCart.push({
          displayName: item.name,
          matchedCartTitle: cartMatch.title,
          quantity: item.quantity ?? null,
        });
        continue;
      }

      remainingToBuy.push(this.toPreparedOrderLine(
        item.name,
        this.resolvePreparedOrderQuantity(item, inventoryMatch),
        this.resolvePreparedOrderUnit(item, inventoryMatch),
        inventoryMatch.note ?? line.notes,
      ));
    }

    const unmatchedCartItems = cartMatchState.filter((entry) => !entry.matched && entry.title.length > 0);
    if (unmatchedCartItems.length > 0) {
      notes.push(
        `Retailer cart already contains ${unmatchedCartItems.length} item${unmatchedCartItems.length === 1 ? '' : 's'} not matched to this grocery plan.`,
      );
    }
    if (substitutionDecisions.length > 0) {
      notes.push('Resolved substitutions from grocery-plan actions were carried into order preflight.');
    }

    return {
      weekStart: groceryPlan.weekStart,
      retailer,
      safeToOrder: unresolvedItems.length === 0,
      remainingToBuy,
      alreadyCoveredByInventory,
      alreadyInRetailerCart,
      unresolvedItems,
      substitutionDecisions,
      freshness,
      notes: mergeNotes(groceryPlan.raw.notes, notes.join(' ')).filter(Boolean),
    };
  }

  async generateGroceryPlan(input: GenerateGroceryPlanInput): Promise<GroceryPlanRecord> {
    const plan =
      (input.weekStart ? await this.getPlanByWeek(input.weekStart) : null) ??
      (await this.getCurrentPlan()) ??
      null;
    if (!plan) {
      throw new Error('Cannot generate a grocery plan without a canonical meal plan.');
    }

    const preferences = await this.getPreferences();
    const inventory = await this.getInventory();
    const brandPreferences = await this.getBrandPreferences();
    const groceryIntents = (await this.listGroceryIntents('pending')).filter(
      (intent) => intent.mealPlanId === null || intent.mealPlanId === plan.id,
    );
    const before = await this.getGroceryPlan(plan.weekStart);
    const recipesById = new Map<string, Record<string, unknown>>();
    for (const entry of plan.entries) {
      if (!entry.recipeId || recipesById.has(entry.recipeId)) {
        continue;
      }
      const recipe = asRecord((await this.getRecipe(entry.recipeId))?.raw);
      if (recipe) {
        recipesById.set(entry.recipeId, recipe);
      }
    }
    const aggregation = buildGroceryAggregationHelper({
      brandPreferences,
      groceryIntents,
      inventory,
      planEntries: plan.entries.map((entry) => ({
        date: entry.date,
        day: entry.dayLabel,
        meal_type: entry.mealType,
        recipe_id: entry.recipeId,
        recipe_name: entry.recipeNameSnapshot,
        serves: entry.serves,
      })),
      preferences: preferences.raw,
      recipesById,
      weekStart: plan.weekStart,
    });

    const generatedAt = new Date().toISOString();
    const raw = {
      generatedAt,
      items: aggregation.items,
      notes: aggregation.notes,
      actionsAppliedCount: 0,
      preferencesVersion: preferences.version,
      profileOwner: preferences.profileOwner,
      resolvedItems: aggregation.resolvedItems,
      sources: {
        groceryIntentCount: groceryIntents.length,
        inventoryItemCount: inventory.length,
        planId: plan.id,
        recipeCount: recipesById.size,
      },
      weekStart: plan.weekStart,
    } satisfies GroceryPlanRecord['raw'];

    const recordId = `grocery-plan:${this.tenantId}:${plan.weekStart}`;
    await this.db
      .prepare(
        `INSERT INTO meal_grocery_plans (
          id, tenant_id, profile_id, week_start, meal_plan_id, raw_json, source_snapshot_json, generated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM meal_grocery_plans WHERE tenant_id = ? AND week_start = ?), CURRENT_TIMESTAMP), ?)
        ON CONFLICT(week_start) DO UPDATE SET
          id = excluded.id,
          tenant_id = excluded.tenant_id,
          profile_id = excluded.profile_id,
          meal_plan_id = excluded.meal_plan_id,
          raw_json = excluded.raw_json,
          source_snapshot_json = excluded.source_snapshot_json,
          generated_at = excluded.generated_at,
          updated_at = excluded.updated_at`,
      )
      .bind(
        recordId,
        this.tenantId,
        this.profileId,
        plan.weekStart,
        plan.id,
        JSON.stringify(raw),
        stringifyJson({
          groceryIntents: groceryIntents.map((intent) => intent.id),
          inventoryUpdatedAt: inventory.map((item) => item.confirmedAt ?? item.purchasedAt).filter(Boolean),
          preferenceVersion: preferences.version,
        }),
        generatedAt,
        this.tenantId,
        plan.weekStart,
        generatedAt,
      )
      .run();

    const after = await this.getGroceryPlan(plan.weekStart);
    if (!after) {
      throw new Error(`Failed to persist grocery plan for week ${plan.weekStart}`);
    }

    await this.recordDomainEvent({
      entityType: 'meal_grocery_plan',
      entityId: after.id,
      eventType: 'grocery_plan.generated',
      before,
      after,
      patch: {
        item_count: after.raw.items.length,
        week_start: after.weekStart,
      },
      provenance: input.provenance,
    });

    return after;
  }

  async listGroceryPlanActions(weekStart: string): Promise<GroceryPlanActionRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT id, week_start, meal_plan_id, item_key, action_status, substitute_item_key, substitute_display_name,
                notes, metadata_json, source_agent, source_skill, session_id, confidence, source_type,
                created_at, updated_at
         FROM meal_grocery_plan_actions
         WHERE tenant_id = ? AND week_start = ?
         ORDER BY updated_at DESC, item_key ASC`,
      )
      .bind(this.tenantId, weekStart)
      .all<{
        id: string;
        week_start: string;
        meal_plan_id: string | null;
        item_key: string;
        action_status: GroceryPlanActionRecord['actionStatus'];
        substitute_item_key: string | null;
        substitute_display_name: string | null;
        notes: string | null;
        metadata_json: string | null;
        source_agent: string | null;
        source_skill: string | null;
        session_id: string | null;
        confidence: number | null;
        source_type: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();

    return (result.results ?? []).map(mapGroceryPlanActionRow);
  }

  async upsertGroceryPlanAction(input: UpsertGroceryPlanActionInput): Promise<ApplyGroceryPlanActionResult> {
    const isSufficiencyAction = PREPARED_ORDER_SUFFICIENCY_STATUSES.includes(
      input.actionStatus as GroceryPlanSufficiencyStatus,
    );
    const targetItem =
      isSufficiencyAction ||
      input.actionStatus === 'purchased' ||
      input.actionStatus === 'substituted' ||
      input.actionStatus === 'in_cart'
        ? await this.resolveGroceryPlanItemForAction(input.weekStart, input.itemKey)
        : null;
    if (
      input.actionStatus === 'substituted' &&
      !input.substituteItemKey &&
      !input.substituteDisplayName
    ) {
      throw new Error('substituted grocery actions require substitute_item_key or substitute_display_name.');
    }
    if (input.createSubstituteIntent && input.actionStatus !== 'substituted') {
      throw new Error('createSubstituteIntent is only supported for substituted grocery actions.');
    }
    if (input.createSubstituteIntent && !input.substituteDisplayName) {
      throw new Error('createSubstituteIntent requires substituteDisplayName.');
    }
    if (
      isSufficiencyAction &&
      (input.substituteItemKey ||
        input.substituteDisplayName ||
        input.createSubstituteIntent ||
        input.substituteQuantity != null ||
        input.substituteUnit)
    ) {
      throw new Error('Sufficiency confirmations cannot include substitute fields or substitute intents.');
    }

    if (isSufficiencyAction) {
      if (!targetItem) {
        throw new Error(`Could not find grocery-plan item ${input.itemKey} for sufficiency confirmation.`);
      }
      if (!this.isPreparedOrderSufficiencyEligible(targetItem)) {
        throw new Error(
          `${targetItem.name} still requires quantity-aware review before ordering; pantry sufficiency confirmation is not supported for this item.`,
        );
      }
    }

    if (input.actionStatus === 'purchased' && !targetItem) {
      throw new Error(`Could not find grocery-plan item ${input.itemKey} for purchased receipt confirmation.`);
    }
    if (input.actionStatus === 'in_cart' && !targetItem) {
      throw new Error(`Could not find grocery-plan item ${input.itemKey} for cart tracking.`);
    }

    const existing = await this.getGroceryPlanAction(input.weekStart, input.itemKey);
    const now = new Date().toISOString();
    const id = existing?.id ?? `grocery-plan-action:${this.tenantId}:${input.weekStart}:${input.itemKey}`;

    await this.db
      .prepare(
        `INSERT INTO meal_grocery_plan_actions (
          id, tenant_id, week_start, meal_plan_id, item_key, action_status, substitute_item_key, substitute_display_name,
          notes, metadata_json, source_agent, source_skill, session_id, confidence, source_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          meal_plan_id = excluded.meal_plan_id,
          action_status = excluded.action_status,
          substitute_item_key = excluded.substitute_item_key,
          substitute_display_name = excluded.substitute_display_name,
          notes = excluded.notes,
          metadata_json = excluded.metadata_json,
          source_agent = excluded.source_agent,
          source_skill = excluded.source_skill,
          session_id = excluded.session_id,
          confidence = excluded.confidence,
          source_type = excluded.source_type,
          updated_at = excluded.updated_at`,
      )
      .bind(
        id,
        this.tenantId,
        input.weekStart,
        input.mealPlanId ?? null,
        input.itemKey,
        input.actionStatus,
        input.substituteItemKey ?? null,
        input.substituteDisplayName ?? null,
        input.notes ?? null,
        stringifyJson(input.metadata),
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
        existing?.createdAt ?? now,
        now,
      )
      .run();

    const action = await this.getGroceryPlanAction(input.weekStart, input.itemKey);
    if (!action) {
      throw new Error(`Failed to upsert grocery action for ${input.itemKey}`);
    }

    if (input.actionStatus === 'purchased' && targetItem) {
      await this.refreshInventoryEvidenceFromPurchasedAction({
        purchasedAt: input.purchasedAt ?? now,
        targetItem,
        provenance: input.provenance,
      });
    }
    if ((input.actionStatus === 'confirmed' || input.actionStatus === 'have_enough') && targetItem) {
      await this.refreshInventoryEvidenceFromCoveredAction({
        confirmedAt: now,
        targetItem,
        provenance: input.provenance,
      });
    }
    if (input.actionStatus === 'substituted' && targetItem) {
      await this.recordShoppingSubstitutionMemory({
        substitutedAt: now,
        substituteDisplayName: input.substituteDisplayName ?? input.substituteItemKey ?? null,
        substituteItemKey: input.substituteItemKey ?? null,
        targetItem,
        weekStart: input.weekStart,
      });
    }

    await this.recordDomainEvent({
      entityType: 'meal_grocery_plan_action',
      entityId: action.id,
      eventType: existing ? 'grocery_plan_action.updated' : 'grocery_plan_action.created',
      before: existing,
      after: action,
      patch: { item_key: input.itemKey, action_status: input.actionStatus, week_start: input.weekStart },
      provenance: input.provenance,
    });

    await this.maybePersistConfirmedOrderSyncFromMetadata(input.metadata, input.provenance);

    let substituteIntent: GroceryIntentRecord | null = null;
    let groceryPlan: GroceryPlanRecord | null = null;

    if (input.actionStatus === 'substituted' && input.createSubstituteIntent) {
      const quantity = input.substituteQuantity ?? targetItem?.quantity ?? targetItem?.canonicalQuantity ?? null;
      const unit = input.substituteUnit ?? targetItem?.unit ?? targetItem?.canonicalUnit ?? null;
      const originalItemName = targetItem?.name ?? input.itemKey;
      const plan = await this.getGroceryPlan(input.weekStart);

      substituteIntent = await this.upsertGroceryIntent({
        displayName: input.substituteDisplayName ?? input.substituteItemKey ?? input.itemKey,
        mealPlanId: input.mealPlanId ?? plan?.mealPlanId ?? null,
        metadata: {
          kind: 'grocery_substitution',
          originalItemKey: input.itemKey,
          originalItemName,
          substituteItemKey: input.substituteItemKey ?? null,
          weekStart: input.weekStart,
        },
        notes: input.intentNotes ?? `Substitute for ${originalItemName}.`,
        quantity,
        status: 'pending',
        unit,
        provenance: input.provenance,
      });
    }

    if (input.actionStatus === 'substituted') {
      groceryPlan = await this.generateGroceryPlan({
        weekStart: input.weekStart,
        provenance: input.provenance,
      });
    }

    return {
      action,
      groceryPlan,
      substituteIntent,
    };
  }

  async deleteGroceryPlanAction(input: DeleteGroceryPlanActionInput): Promise<GroceryPlanActionRecord | null> {
    const existing = await this.getGroceryPlanAction(input.weekStart, input.itemKey);
    if (!existing) {
      return null;
    }

    await this.db
      .prepare(`DELETE FROM meal_grocery_plan_actions WHERE tenant_id = ? AND week_start = ? AND item_key = ?`)
      .bind(this.tenantId, input.weekStart, input.itemKey)
      .run();

    await this.recordDomainEvent({
      entityType: 'meal_grocery_plan_action',
      entityId: existing.id,
      eventType: 'grocery_plan_action.deleted',
      before: existing,
      after: null,
      patch: { item_key: input.itemKey, week_start: input.weekStart },
      provenance: input.provenance,
    });

    return existing;
  }

  async upsertGroceryIntent(input: UpsertGroceryIntentInput): Promise<GroceryIntentRecord> {
    const normalizedName = normalizeText(input.displayName);
    const now = new Date().toISOString();
    const existing = input.id
      ? await this.getGroceryIntentById(input.id)
      : await this.getLatestOpenIntentByName(normalizedName, input.mealPlanId ?? null);
    const recordId = existing?.id ?? input.id ?? `grocery-intent:${normalizedName}:${crypto.randomUUID()}`;

    await this.db
      .prepare(
        `INSERT INTO grocery_intents (
          id, tenant_id, normalized_name, display_name, quantity, unit, notes, status, target_window,
          meal_plan_id, metadata_json, source_agent, source_skill, session_id, confidence,
          source_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          normalized_name = excluded.normalized_name,
          display_name = excluded.display_name,
          quantity = excluded.quantity,
          unit = excluded.unit,
          notes = excluded.notes,
          status = excluded.status,
          target_window = excluded.target_window,
          meal_plan_id = excluded.meal_plan_id,
          metadata_json = excluded.metadata_json,
          source_agent = excluded.source_agent,
          source_skill = excluded.source_skill,
          session_id = excluded.session_id,
          confidence = excluded.confidence,
          source_type = excluded.source_type,
          updated_at = excluded.updated_at`,
      )
      .bind(
        recordId,
        this.tenantId,
        normalizedName,
        input.displayName,
        input.quantity ?? null,
        input.unit ?? null,
        input.notes ?? null,
        input.status ?? existing?.status ?? 'pending',
        input.targetWindow ?? null,
        input.mealPlanId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
        existing?.createdAt ?? now,
        now,
      )
      .run();

    const record = await this.getGroceryIntentById(recordId);
    if (!record) {
      throw new Error(`Failed to upsert grocery intent for ${input.displayName}`);
    }

    await this.recordDomainEvent({
      entityType: 'grocery_intent',
      entityId: record.id,
      eventType: existing ? 'grocery_intent.updated' : 'grocery_intent.created',
      before: existing,
      after: record,
      patch: { normalized_name: normalizedName, status: record.status },
      provenance: input.provenance,
    });

    return record;
  }

  async deleteGroceryIntent(input: DeleteGroceryIntentInput): Promise<GroceryIntentRecord | null> {
    const existing = await this.getGroceryIntentById(input.id);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE grocery_intents
         SET status = 'deleted', updated_at = ?, source_agent = ?, source_skill = ?, session_id = ?, confidence = ?, source_type = ?
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(
        updatedAt,
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
        this.tenantId,
        input.id,
      )
      .run();

    const record = await this.getGroceryIntentById(input.id);
    if (record) {
      await this.recordDomainEvent({
        entityType: 'grocery_intent',
        entityId: record.id,
        eventType: 'grocery_intent.deleted',
        before: existing,
        after: record,
        patch: { status: 'deleted' },
        provenance: input.provenance,
      });
    }

    return record;
  }

  private async getGroceryPlanAction(weekStart: string, itemKey: string): Promise<GroceryPlanActionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, week_start, meal_plan_id, item_key, action_status, substitute_item_key, substitute_display_name,
                notes, metadata_json, source_agent, source_skill, session_id, confidence, source_type,
                created_at, updated_at
         FROM meal_grocery_plan_actions
         WHERE tenant_id = ? AND week_start = ? AND item_key = ?`,
      )
      .bind(this.tenantId, weekStart, itemKey)
      .first<{
        id: string;
        week_start: string;
        meal_plan_id: string | null;
        item_key: string;
        action_status: GroceryPlanActionRecord['actionStatus'];
        substitute_item_key: string | null;
        substitute_display_name: string | null;
        notes: string | null;
        metadata_json: string | null;
        source_agent: string | null;
        source_skill: string | null;
        session_id: string | null;
        confidence: number | null;
        source_type: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();

    return row ? mapGroceryPlanActionRow(row) : null;
  }

  private async resolveGroceryPlanItemForAction(
    weekStart: string,
    itemKey: string,
  ): Promise<GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number] | null> {
    const plan =
      (await this.getGroceryPlan(weekStart)) ??
      (await this.generateGroceryPlan({
        weekStart,
        provenance: {
          actorEmail: null,
          actorName: null,
          confidence: null,
          scopes: [],
          sessionId: null,
          sourceAgent: 'meals-service',
          sourceSkill: 'fluent-meals',
          sourceType: 'system',
        },
      }));

    return (
      plan.raw.items.find((item) => item.itemKey === itemKey) ??
      plan.raw.resolvedItems.find((item) => item.itemKey === itemKey) ??
      null
    );
  }

  private applyGroceryPlanActions(
    plan: GroceryPlanRecord,
    actions: GroceryPlanActionRecord[],
  ): GroceryPlanRecord {
    if (actions.length === 0) {
      return {
        ...plan,
        raw: {
          ...plan.raw,
          actionsAppliedCount: 0,
          resolvedItems: plan.raw.resolvedItems ?? [],
        },
      };
    }

    const actionMap = new Map(actions.map((action) => [action.itemKey, action]));
    const actionableItems: typeof plan.raw.items = [];
    const resolvedItems: typeof plan.raw.resolvedItems = [];

    for (const item of plan.raw.items) {
      const action = actionMap.get(item.itemKey);
      if (!action) {
        actionableItems.push(item);
        continue;
      }

      if (this.isPreparedOrderSufficiencyAction(action.actionStatus)) {
        actionableItems.push({
          ...item,
          actionStatus: action.actionStatus,
          note: action.notes ?? item.note,
          substitute: null,
        });
        continue;
      }

      if (action.actionStatus === 'needs_purchase') {
        actionableItems.push({
          ...item,
          actionStatus: action.actionStatus,
          note:
            action.notes ??
            (item.inventoryStatus === 'check_pantry'
              ? 'Pantry check marked for purchase.'
              : item.note),
          inventoryStatus: item.inventoryStatus === 'check_pantry' ? 'missing' : item.inventoryStatus,
          substitute: null,
        });
        continue;
      }

      resolvedItems.push({
        ...item,
        actionStatus: action.actionStatus,
        note: action.notes ?? item.note,
        substitute:
          action.actionStatus === 'substituted'
            ? {
                itemKey: action.substituteItemKey,
                displayName: action.substituteDisplayName,
              }
            : null,
      });
    }

    for (const item of plan.raw.resolvedItems ?? []) {
      const action = actionMap.get(item.itemKey);
      if (!action) {
        resolvedItems.push(item);
        continue;
      }

      if (action.actionStatus === 'needs_purchase') {
        actionableItems.push({
          ...item,
          actionStatus: action.actionStatus,
          note: action.notes ?? item.note,
          inventoryStatus: 'missing',
          substitute: null,
        });
        continue;
      }

      resolvedItems.push({
        ...item,
        actionStatus: action.actionStatus,
        note: action.notes ?? item.note,
        substitute:
          action.actionStatus === 'substituted'
            ? {
                itemKey: action.substituteItemKey,
                displayName: action.substituteDisplayName,
              }
            : item.substitute ?? null,
      });
    }

    return {
      ...plan,
      raw: {
        ...plan.raw,
        actionsAppliedCount: actions.length,
        items: actionableItems,
        resolvedItems,
      },
    };
  }

  private collectPreparedOrderSubstitutions(plan: GroceryPlanRecord): PreparedOrderSubstitutionDecisionRecord[] {
    return plan.raw.resolvedItems
      .filter((item) => item.actionStatus === 'substituted' && item.substitute?.displayName)
      .map((item) => ({
        requested: item.name,
        resolvedTo: item.substitute?.displayName ?? item.name,
        source: 'grocery_plan_action',
      }));
  }

  private isPreparedOrderSufficiencyAction(value: string): value is GroceryPlanSufficiencyStatus {
    return PREPARED_ORDER_SUFFICIENCY_STATUSES.includes(value as GroceryPlanSufficiencyStatus);
  }

  private isPreparedOrderSufficiencyEligible(
    item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
  ) {
    return item.inventoryStatus === 'check_pantry' || item.orderingPolicy === 'pantry_item';
  }

  private resolvePreparedOrderSufficiencyDecision(
    item: GroceryPlanRecord['raw']['items'][number],
    action: GroceryPlanActionRecord | null,
  ): GroceryPlanSufficiencyStatus | null {
    if (!action || !this.isPreparedOrderSufficiencyAction(action.actionStatus)) {
      return null;
    }
    return this.isPreparedOrderSufficiencyEligible(item) ? action.actionStatus : null;
  }

  private latestInventoryTimestamp(inventory: InventoryRecord[]): string | null {
    const timestamps = inventory
      .map((item) => item.confirmedAt ?? item.purchasedAt ?? null)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort((left, right) => left.localeCompare(right));
    return timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
  }

  private toPreparedOrderLine(
    displayName: string,
    quantity: number | null,
    unit: string | null,
    notes: string | null,
  ): PreparedOrderItemRecord {
    return {
      displayName,
      quantity: quantity ?? null,
      unit: unit ?? null,
      notes: notes?.trim() ? notes.trim() : null,
    };
  }

  private resolvePreparedOrderQuantity(
    item: GroceryPlanRecord['raw']['items'][number],
    inventoryMatch: {
      missingCanonicalQuantity: number | null;
      missingQuantity: number | null;
    },
  ): number | null {
    return inventoryMatch.missingCanonicalQuantity ?? inventoryMatch.missingQuantity ?? item.quantity ?? null;
  }

  private resolvePreparedOrderUnit(
    item: GroceryPlanRecord['raw']['items'][number],
    inventoryMatch: {
      missingCanonicalQuantity: number | null;
    },
  ): string | null {
    return inventoryMatch.missingCanonicalQuantity != null && item.canonicalUnit ? item.canonicalUnit : item.unit ?? null;
  }

  private describePreparedOrderUncertainty(
    item: GroceryPlanRecord['raw']['items'][number],
    uncertainty: string,
  ): string {
    switch (uncertainty) {
      case 'ingredient_quantity_unknown':
        return `The planned amount for ${item.name} is not specific enough to order confidently.`;
      case 'inventory_quantity_unknown':
        return `Inventory has ${item.name}, but the on-hand quantity is unknown.`;
      case 'inventory_unit_mismatch':
        return `Inventory has ${item.name}, but the tracked unit does not match the planned unit.`;
      default:
        return `Ordering ${item.name} still needs review before checkout.`;
    }
  }

  private findRetailerCartMatch(
    item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
    cartItems: Array<{ index: number; matched: boolean; quantity: number | null; title: string }>,
  ) {
    const requestedKeys = [
      ...this.buildPreparedOrderMatchKeys(item.name),
      ...(item.canonicalItemKey ? this.buildPreparedOrderMatchKeys(item.canonicalItemKey) : []),
      ...item.allowedSubstituteQueries.flatMap((entry) => this.buildPreparedOrderMatchKeys(entry)),
    ].filter((entry) => entry.length > 0);

    for (const cartItem of cartItems) {
      if (cartItem.matched) {
        continue;
      }
      const cartKeys = this.buildPreparedOrderMatchKeys(cartItem.title);
      if (
        cartKeys.some((cartKey) =>
          requestedKeys.some((requestedKey) =>
            cartKey === requestedKey ||
            cartKey.includes(requestedKey) ||
            requestedKey.includes(cartKey),
          ),
        )
      ) {
        return cartItem;
      }
    }

    return null;
  }

  private buildPreparedOrderMatchKeys(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    const normalized = normalizeText(trimmed);
    const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
    const keys = new Set<string>([normalized]);
    if (tokens.length > 0) {
      keys.add(tokens.join(' '));
      if (tokens.length > 1) {
        keys.add(tokens.filter((token) => token.length > 2).join(' '));
      }
    }
    return Array.from(keys).filter((entry) => entry.length > 0);
  }

  private async refreshInventoryEvidenceFromPurchasedAction(input: {
    purchasedAt: string;
    targetItem: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number];
    provenance: MutationProvenance;
  }): Promise<void> {
    const inventory = await this.getInventory();
    const existing = this.findInventoryRecordForGroceryItem(input.targetItem, inventory);
    const inferred = this.inferPurchasedInventoryDefaults(input.targetItem, existing);

    await this.updateInventory({
      name: existing?.name ?? input.targetItem.name,
      status: 'present',
      source: existing?.source ?? 'grocery_plan_action',
      confirmedAt: existing?.confirmedAt ?? null,
      purchasedAt: input.purchasedAt,
      estimatedExpiry: existing?.estimatedExpiry ?? null,
      perishability: existing?.perishability ?? inferred.perishability,
      longLifeDefault: existing ? existing.longLifeDefault : inferred.longLifeDefault,
      quantity: existing?.quantity ?? null,
      unit: existing?.unit ?? null,
      location: existing?.location ?? null,
      brand: existing?.brand ?? null,
      costCad: existing?.costCad ?? null,
      metadata: existing?.metadata ?? null,
      provenance: input.provenance,
    });
  }

  private async refreshInventoryEvidenceFromCoveredAction(input: {
    confirmedAt: string;
    targetItem: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number];
    provenance: MutationProvenance;
  }): Promise<void> {
    const inventory = await this.getInventory();
    const existing = this.findInventoryRecordForGroceryItem(input.targetItem, inventory);
    const inferred = this.inferPurchasedInventoryDefaults(input.targetItem, existing);

    await this.updateInventory({
      name: existing?.name ?? input.targetItem.name,
      status: 'present',
      source: existing?.source ?? 'grocery_plan_action',
      confirmedAt: input.confirmedAt,
      purchasedAt: existing?.purchasedAt ?? null,
      estimatedExpiry: existing?.estimatedExpiry ?? null,
      perishability: existing?.perishability ?? inferred.perishability,
      longLifeDefault: existing ? existing.longLifeDefault : inferred.longLifeDefault,
      quantity: existing?.quantity ?? null,
      unit: existing?.unit ?? null,
      location: existing?.location ?? null,
      brand: existing?.brand ?? null,
      costCad: existing?.costCad ?? null,
      metadata: existing?.metadata ?? null,
      provenance: input.provenance,
    });
  }

  private findInventoryRecordForGroceryItem(
    targetItem: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
    inventory: InventoryRecord[],
  ): InventoryRecord | null {
    return (
      (targetItem.canonicalItemKey
        ? inventory.find((entry) => entry.canonicalItemKey === targetItem.canonicalItemKey)
        : null) ??
      inventory.find((entry) => entry.normalizedName === targetItem.normalizedName) ??
      null
    );
  }

  private inferPurchasedInventoryDefaults(
    targetItem: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
    existing: InventoryRecord | null,
  ): { longLifeDefault: boolean; perishability: string | null } {
    if (existing) {
      return {
        longLifeDefault: existing.longLifeDefault,
        perishability: existing.perishability,
      };
    }

    const normalizedPolicy = normalizeText(targetItem.orderingPolicy ?? '');
    if (normalizedPolicy === 'pantry_item' || targetItem.inventoryStatus === 'check_pantry') {
      return {
        longLifeDefault: true,
        perishability: 'pantry',
      };
    }

    return {
      longLifeDefault: false,
      perishability: null,
    };
  }

  private normalizeInventoryMutation(input: {
    brand?: string | null;
    confirmedAt?: string | null;
    costCad?: number | null;
    estimatedExpiry?: string | null;
    location?: string | null;
    longLifeDefault?: boolean;
    metadata?: unknown;
    name: string;
    perishability?: string | null;
    purchasedAt?: string | null;
    quantity?: number | null;
    source?: string | null;
    status?: string;
    unit?: string | null;
  }) {
    if (!input.name.trim()) {
      throw new Error('Inventory item name is required.');
    }
    if (input.quantity != null && (!Number.isFinite(input.quantity) || input.quantity <= 0)) {
      throw new Error(`Inventory quantity must be positive for ${input.name}.`);
    }

    const normalizedName = normalizeText(input.name);
    const canonical = canonicalizeInventoryItem({
      metadata: input.metadata,
      name: input.name,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
    });

    return {
      brand: input.brand ?? null,
      canonicalConfidence: canonical.canonicalConfidence,
      canonicalItemKey: canonical.canonicalItemKey,
      canonicalQuantity: canonical.canonicalQuantity,
      canonicalUnit: canonical.canonicalUnit,
      confirmedAt: input.confirmedAt ?? null,
      costCad: input.costCad ?? null,
      estimatedExpiry: input.estimatedExpiry ?? null,
      id: `inventory:${this.tenantId}:${normalizedName}`,
      location: input.location ?? null,
      longLifeDefault: input.longLifeDefault ? 1 : 0,
      metadataJson: stringifyJson(input.metadata),
      name: input.name,
      normalizedName,
      perishability: input.perishability ?? null,
      purchasedAt: input.purchasedAt ?? null,
      quantity: input.quantity ?? null,
      source: input.source ?? null,
      status: input.status ?? 'present',
      unit: input.unit ?? null,
    };
  }

  private buildInventoryUpsertStatement(
    payload: ReturnType<MealsService['normalizeInventoryMutation']>,
    updatedAt: string,
  ): FluentPreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO meal_inventory_items (
          id, tenant_id, name, normalized_name, status, source, confirmed_at, purchased_at, estimated_expiry,
          perishability, long_life_default, canonical_item_key, canonical_quantity, canonical_unit,
          canonical_confidence, quantity, unit, location, brand, cost_cad, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          source = excluded.source,
          confirmed_at = excluded.confirmed_at,
          purchased_at = excluded.purchased_at,
          estimated_expiry = excluded.estimated_expiry,
          perishability = excluded.perishability,
          long_life_default = excluded.long_life_default,
          canonical_item_key = excluded.canonical_item_key,
          canonical_quantity = excluded.canonical_quantity,
          canonical_unit = excluded.canonical_unit,
          canonical_confidence = excluded.canonical_confidence,
          quantity = excluded.quantity,
          unit = excluded.unit,
          location = excluded.location,
          brand = excluded.brand,
          cost_cad = excluded.cost_cad,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        payload.id,
        this.tenantId,
        payload.name,
        payload.normalizedName,
        payload.status,
        payload.source,
        payload.confirmedAt ?? updatedAt,
        payload.purchasedAt,
        payload.estimatedExpiry,
        payload.perishability,
        payload.longLifeDefault,
        payload.canonicalItemKey,
        payload.canonicalQuantity,
        payload.canonicalUnit,
        payload.canonicalConfidence,
        payload.quantity,
        payload.unit,
        payload.location,
        payload.brand,
        payload.costCad,
        payload.metadataJson,
        updatedAt,
      );
  }

  private collapseInventoryBatchItems(items: UpdateInventoryBatchInput['items']): UpdateInventoryBatchInput['items'] {
    const collapsed = new Map<string, UpdateInventoryBatchInput['items'][number]>();

    for (const item of items) {
      const normalizedName = normalizeText(item.name);
      const normalizedItemUnit = normalizeUnit(item.unit ?? null);
      const existing = collapsed.get(normalizedName);
      if (!existing) {
        collapsed.set(normalizedName, { ...item });
        continue;
      }

      const existingUnit = normalizeUnit(existing.unit ?? null);
      if ((existingUnit ?? null) !== (normalizedItemUnit ?? null)) {
        throw new Error(`Conflicting units for duplicate inventory item ${item.name}.`);
      }

      collapsed.set(normalizedName, {
        ...existing,
        ...item,
        quantity:
          existing.quantity == null || item.quantity == null
            ? existing.quantity ?? item.quantity
            : existing.quantity + item.quantity,
      });
    }

    return Array.from(collapsed.values());
  }

  private async persistInventoryBatchInternal(
    items: UpdateInventoryBatchInput['items'],
  ): Promise<InventoryRecord[]> {
    const updatedAt = new Date().toISOString();
    const normalizedItems = items.map((item) => this.normalizeInventoryMutation(item));
    const statements = normalizedItems.map((item) => this.buildInventoryUpsertStatement(item, updatedAt));
    await this.db.batch(statements);

    return Promise.all(
      normalizedItems.map(async (item) => {
        const record = await this.lookupInventoryByNormalizedName(item.normalizedName);
        if (!record) {
          throw new Error(`Inventory update failed for ${item.name}`);
        }
        return record;
      }),
    );
  }

  private async filterEntriesForDate(entries: MealPlanEntryRecord[], date: string): Promise<MealPlanEntryRecord[]> {
    return this.repository.filterEntriesForDate(entries, date);
  }

  private async getFeedbackForDate(date: string, mealPlanId?: string | null): Promise<MealFeedbackRecord[]> {
    return this.repository.getFeedbackForDate(date, mealPlanId);
  }

  private async resolvePlanEntry(input: {
    allowFutureRecipeFallback?: boolean;
    mealPlanEntryId?: string | null;
    recipeId?: string | null;
    date: string;
  }): Promise<(MealPlanEntryRecord & { mealPlanId: string }) | null> {
    if (input.mealPlanEntryId) {
      const row = await this.db
        .prepare(
          `SELECT meal_plan_id
           FROM meal_plan_entries
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(this.tenantId, input.mealPlanEntryId)
        .first<{ meal_plan_id: string }>();

      if (!row) {
        return null;
      }

      const plan = await this.getPlanById(row.meal_plan_id);
      const entry = plan?.entries.find((item) => item.id === input.mealPlanEntryId);
      return entry ? { ...entry, mealPlanId: row.meal_plan_id } : null;
    }

    const plan = await this.getCurrentPlan(input.date);
    if (!plan) {
      return null;
    }

    const entries = await this.filterEntriesForDate(plan.entries, input.date);
    if (input.recipeId) {
      const exactDateMatch = entries.find((item) => item.recipeId === input.recipeId);
      if (exactDateMatch) {
        return { ...exactDateMatch, mealPlanId: plan.id };
      }

      if (!input.allowFutureRecipeFallback) {
        return null;
      }

      const matchingEntry =
        plan.entries
          .filter((item) => item.recipeId === input.recipeId && item.status !== 'cooked')
          .sort((left, right) => {
            const leftDate = left.date ?? '9999-12-31';
            const rightDate = right.date ?? '9999-12-31';
            const leftPriority = leftDate >= input.date ? 0 : 1;
            const rightPriority = rightDate >= input.date ? 0 : 1;
            return (
              leftPriority - rightPriority ||
              leftDate.localeCompare(rightDate) ||
              (left.updatedAt ?? '').localeCompare(right.updatedAt ?? '')
            );
          })[0] ?? null;
      return matchingEntry ? { ...matchingEntry, mealPlanId: plan.id } : null;
    }

    const entry = entries.find((item) => item.status !== 'cooked') ?? entries[0] ?? null;
    return entry ? { ...entry, mealPlanId: plan.id } : null;
  }

  private async applyCookedMealMutation(input: {
    cookedAt: string;
    cookedDate: string;
    entry: MealPlanEntryRecord & { mealPlanId: string };
    plan: MealPlanRecord | null;
  }): Promise<boolean> {
    const plan = input.plan;
    if (
      !plan ||
      !input.entry.date ||
      input.cookedDate >= String(input.entry.date) ||
      !this.isDateWithinPlanWindow(plan, input.cookedDate)
    ) {
      await this.db
        .prepare(
          `UPDATE meal_plan_entries
           SET status = 'cooked', cooked_at = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(input.cookedAt, input.cookedAt, this.tenantId, input.entry.id)
        .run();
      return false;
    }

    const scheduledDate = String(input.entry.date);
    const cookedDayLabel = await this.dateToWeekday(input.cookedDate);
    const statements: FluentPreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE meal_plan_entries
           SET date = ?, day_label = ?, status = 'cooked', cooked_at = ?, updated_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(input.cookedDate, cookedDayLabel, input.cookedAt, input.cookedAt, this.tenantId, input.entry.id),
    ];

    const entriesToShift = plan.entries
      .filter(
        (item) =>
          item.id !== input.entry.id &&
          item.mealType === input.entry.mealType &&
          item.status !== 'cooked' &&
          Boolean(item.date) &&
          String(item.date) >= input.cookedDate &&
          String(item.date) < scheduledDate,
      )
      .sort((left, right) => String(left.date).localeCompare(String(right.date)));

    for (const item of entriesToShift) {
      const shiftedDate = shiftDateString(String(item.date), 1);
      const shiftedDayLabel = await this.dateToWeekday(shiftedDate);
      statements.push(
        this.db
          .prepare(
            `UPDATE meal_plan_entries
             SET date = ?, day_label = ?, updated_at = ?
             WHERE tenant_id = ? AND id = ?`,
          )
          .bind(shiftedDate, shiftedDayLabel, input.cookedAt, this.tenantId, item.id),
      );
    }

    statements.push(
      this.db
        .prepare(`UPDATE meal_plans SET updated_at = ? WHERE tenant_id = ? AND id = ?`)
        .bind(input.cookedAt, this.tenantId, input.entry.mealPlanId),
    );

    await this.db.batch(statements);
    return true;
  }

  private isDateWithinPlanWindow(plan: MealPlanRecord, date: string): boolean {
    if (date < plan.weekStart) {
      return false;
    }

    if (plan.weekEnd && date > plan.weekEnd) {
      return false;
    }

    return true;
  }

  private async getPlanById(planId: string): Promise<MealPlanRecord | null> {
    return this.repository.getPlanById(planId);
  }

  private async upsertMealMemoryRecord(input: {
    recipeId: string;
    status: string;
    lastFeedback: unknown;
    notes: unknown;
    lastUsedAt: string | null;
    updatedAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO meal_memory (id, tenant_id, recipe_id, status, last_feedback_json, notes_json, last_used_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          last_feedback_json = excluded.last_feedback_json,
          notes_json = excluded.notes_json,
           last_used_at = excluded.last_used_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        `memory:${this.tenantId}:${input.recipeId}`,
        this.tenantId,
        input.recipeId,
        input.status,
        stringifyJson(input.lastFeedback),
        stringifyJson(input.notes),
        input.lastUsedAt,
        input.updatedAt,
      )
      .run();
  }

  private async recordShoppingSubstitutionMemory(input: {
    substitutedAt: string;
    substituteDisplayName: string | null;
    substituteItemKey: string | null;
    targetItem: import('./types').GroceryPlanItemRecord;
    weekStart: string;
  }): Promise<void> {
    const sourceRecipeIds = Array.from(new Set(input.targetItem.sourceRecipeIds.filter(Boolean)));
    for (const recipeId of sourceRecipeIds) {
      const existingMemory = await this.getMealMemory(recipeId);
      const currentMemory = existingMemory[0] ?? null;
      const currentLastFeedback = asRecord(currentMemory?.lastFeedback) ?? {};
      const currentPlannerSignals =
        asRecord(currentLastFeedback.planner_signals ?? currentLastFeedback.plannerSignals) ?? {};
      const currentShoppingFriction = asRecord(currentPlannerSignals.shopping_substitution_friction) ?? {};
      const currentCount = asNonNegativeNumber(currentShoppingFriction.count) ?? 0;

      await this.upsertMealMemoryRecord({
        recipeId,
        status: currentMemory?.status ?? 'observed',
        lastFeedback: {
          ...currentLastFeedback,
          planner_signals: {
            ...currentPlannerSignals,
            shopping_substitution_friction: {
              count: currentCount + 1,
              lastObservedAt: input.substitutedAt,
              originalItemKey: input.targetItem.itemKey,
              originalItemName: input.targetItem.name,
              substituteDisplayName: input.substituteDisplayName,
              substituteItemKey: input.substituteItemKey,
              weekStart: input.weekStart,
            },
          },
        },
        notes: currentMemory?.notes ?? null,
        lastUsedAt: currentMemory?.lastUsedAt ?? null,
        updatedAt: input.substitutedAt,
      });
    }
  }

  private async getBrandPreferences(): Promise<Map<string, string[]>> {
    return this.repository.getBrandPreferences();
  }

  private async lookupInventoryByNormalizedName(normalizedName: string): Promise<InventoryRecord | null> {
    return this.repository.lookupInventoryByNormalizedName(normalizedName);
  }

  private async getGroceryIntentById(id: string): Promise<GroceryIntentRecord | null> {
    return this.repository.getGroceryIntentById(id);
  }

  private async getLatestOpenIntentByName(
    normalizedName: string,
    mealPlanId?: string | null,
  ): Promise<GroceryIntentRecord | null> {
    return this.repository.getLatestOpenIntentByName(normalizedName, mealPlanId);
  }

  private async recordDomainEvent(input: {
    entityType: string;
    entityId: string | null;
    eventType: string;
    before: unknown;
    after: unknown;
    patch?: unknown;
    provenance: MutationProvenance;
  }): Promise<void> {
    await this.repository.recordDomainEvent(input);
  }

  private mapConfirmedOrderSyncRow(row: {
    id: string;
    retailer: string;
    retailer_order_id: string;
    week_start: string;
    status: ConfirmedOrderSyncStatus;
    confirmed_at: string | null;
    synced_at: string;
    matched_purchased_count: number | null;
    ordered_extra_count: number | null;
    explicit_skipped_count: number | null;
    missing_planned_count: number | null;
    unresolved_count: number | null;
    payload_summary_json: string | null;
    created_at: string | null;
    updated_at: string | null;
  }): ConfirmedOrderSyncRecord {
    return {
      id: row.id,
      retailer: row.retailer,
      retailerOrderId: row.retailer_order_id,
      weekStart: row.week_start,
      status: row.status,
      confirmedAt: row.confirmed_at,
      syncedAt: row.synced_at,
      matchedPurchasedCount: row.matched_purchased_count ?? 0,
      orderedExtraCount: row.ordered_extra_count ?? 0,
      explicitSkippedCount: row.explicit_skipped_count ?? 0,
      missingPlannedCount: row.missing_planned_count ?? 0,
      unresolvedCount: row.unresolved_count ?? 0,
      payloadSummary: safeParse(row.payload_summary_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async maybePersistConfirmedOrderSyncFromMetadata(
    metadata: unknown,
    provenance: MutationProvenance,
  ): Promise<ConfirmedOrderSyncRecord | null> {
    const syncMetadata = this.extractConfirmedOrderSyncMetadata(metadata);
    if (!syncMetadata) {
      return null;
    }

    return this.persistConfirmedOrderSync(syncMetadata, provenance);
  }

  private extractConfirmedOrderSyncMetadata(metadata: unknown): ConfirmedOrderSyncMetadataInput | null {
    const record = asRecord(metadata);
    if (!record) {
      return null;
    }

    const candidate = asRecord(record.confirmed_order_sync ?? record.confirmedOrderSync);
    if (!candidate) {
      return null;
    }

    const retailer = asNonEmptyString(candidate.retailer);
    const retailerOrderId = asNonEmptyString(candidate.retailerOrderId ?? candidate.retailer_order_id);
    const weekStart = asNonEmptyString(candidate.weekStart ?? candidate.week_start);
    const status = asNonEmptyString(candidate.status) as ConfirmedOrderSyncStatus | null;

    if (
      !retailer ||
      !retailerOrderId ||
      !weekStart ||
      !status ||
      !['sync_completed', 'sync_partial', 'sync_failed'].includes(status)
    ) {
      return null;
    }

    return {
      retailer: normalizeText(retailer),
      retailerOrderId,
      weekStart,
      status,
      confirmedAt: asNullableString(candidate.confirmedAt ?? candidate.confirmed_at),
      syncedAt: asNullableString(candidate.syncedAt ?? candidate.synced_at),
      matchedPurchasedCount: asNonNegativeNumber(candidate.matchedPurchasedCount ?? candidate.matched_purchased_count),
      orderedExtraCount: asNonNegativeNumber(candidate.orderedExtraCount ?? candidate.ordered_extra_count),
      explicitSkippedCount: asNonNegativeNumber(candidate.explicitSkippedCount ?? candidate.explicit_skipped_count),
      missingPlannedCount: asNonNegativeNumber(candidate.missingPlannedCount ?? candidate.missing_planned_count),
      unresolvedCount: asNonNegativeNumber(candidate.unresolvedCount ?? candidate.unresolved_count),
      payloadSummary: candidate.payloadSummary ?? candidate.payload_summary ?? null,
      force:
        typeof candidate.force === 'boolean'
          ? candidate.force
          : typeof candidate.force_resync === 'boolean'
            ? candidate.force_resync
            : null,
    };
  }

  private async persistConfirmedOrderSync(
    input: ConfirmedOrderSyncMetadataInput,
    provenance: MutationProvenance,
  ): Promise<ConfirmedOrderSyncRecord> {
    const existing = await this.getConfirmedOrderSync(input.retailer, input.retailerOrderId);
    if (existing && existing.status === 'sync_completed' && input.force !== true) {
      return existing;
    }

    const syncedAt = input.syncedAt ?? new Date().toISOString();
    const id = existing?.id ?? `confirmed-order-sync:${this.tenantId}:${input.retailer}:${input.retailerOrderId}`;
    const payloadSummaryJson = stringifyJson(input.payloadSummary ?? null);

    const noOp =
      existing &&
      existing.weekStart === input.weekStart &&
      existing.status === input.status &&
      (existing.confirmedAt ?? null) === (input.confirmedAt ?? null) &&
      existing.matchedPurchasedCount === (input.matchedPurchasedCount ?? 0) &&
      existing.orderedExtraCount === (input.orderedExtraCount ?? 0) &&
      existing.explicitSkippedCount === (input.explicitSkippedCount ?? 0) &&
      existing.missingPlannedCount === (input.missingPlannedCount ?? 0) &&
      existing.unresolvedCount === (input.unresolvedCount ?? 0) &&
      JSON.stringify(existing.payloadSummary ?? null) === JSON.stringify(input.payloadSummary ?? null);

    if (noOp) {
      return existing;
    }

    await this.db
      .prepare(
        `INSERT INTO meal_confirmed_order_syncs (
          id, tenant_id, retailer, retailer_order_id, week_start, status, confirmed_at, synced_at,
          matched_purchased_count, ordered_extra_count, explicit_skipped_count, missing_planned_count,
          unresolved_count, payload_summary_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          week_start = excluded.week_start,
          status = excluded.status,
          confirmed_at = excluded.confirmed_at,
          synced_at = excluded.synced_at,
          matched_purchased_count = excluded.matched_purchased_count,
          ordered_extra_count = excluded.ordered_extra_count,
          explicit_skipped_count = excluded.explicit_skipped_count,
          missing_planned_count = excluded.missing_planned_count,
          unresolved_count = excluded.unresolved_count,
          payload_summary_json = excluded.payload_summary_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        id,
        this.tenantId,
        input.retailer,
        input.retailerOrderId,
        input.weekStart,
        input.status,
        input.confirmedAt ?? null,
        syncedAt,
        input.matchedPurchasedCount ?? 0,
        input.orderedExtraCount ?? 0,
        input.explicitSkippedCount ?? 0,
        input.missingPlannedCount ?? 0,
        input.unresolvedCount ?? 0,
        payloadSummaryJson,
        existing?.createdAt ?? syncedAt,
        syncedAt,
      )
      .run();

    const after = await this.getConfirmedOrderSync(input.retailer, input.retailerOrderId);
    if (!after) {
      throw new Error(`Failed to persist confirmed order sync for ${input.retailer}:${input.retailerOrderId}`);
    }

    await this.recordDomainEvent({
      entityType: 'meal_confirmed_order_sync',
      entityId: after.id,
      eventType: existing ? 'confirmed_order_sync.updated' : 'confirmed_order_sync.created',
      before: existing,
      after,
      patch: {
        retailer: input.retailer,
        retailer_order_id: input.retailerOrderId,
        status: input.status,
        week_start: input.weekStart,
      },
      provenance,
    });

    return after;
  }

  private async buildPlanningSnapshot(
    weekStart: string,
    overrides: GenerateMealPlanOverrides | null,
    calendarContextInput: CalendarContext | null,
    trainingContextInput: import('./types').MealsTrainingContextRecord | null,
  ) {
    const [preferences, inventory, mealMemory, history, recipes, groceryIntents, timeZone, recentRecipeIds] = await Promise.all([
      this.getPreferences(),
      this.getInventory(),
      this.getMealMemory(),
      this.listPlanHistory(8),
      this.listRecipes(undefined, 'active'),
      this.listGroceryIntents('pending'),
      this.repository.getProfileTimeZone(),
      this.repository.listRecentRecipeIds(weekStart, 28),
    ]);

    const calendarRequired = preferences.raw.calendar_check_required_before_planning === true;
    const calendarContext = normalizeCalendarContext(calendarContextInput, weekStart);
    const trainingContext = normalizeTrainingContext(trainingContextInput);
    const planningConstraints = deriveCalendarPlanningConstraints({
      calendarContext,
      weekStart,
    });
    if (calendarRequired && planningConstraints.calendarAvailability !== 'available') {
      throw new Error('Calendar check is required before planning, but calendar_context was not available.');
    }

    const recipesById = new Map(recipes.map((recipe) => [recipe.id, asRecord(recipe.raw) ?? {}]));
    const mealMemoryByRecipeId = new Map(mealMemory.map((entry) => [entry.recipeId, entry]));

    return {
      calendarContext,
      groceryIntents,
      history,
      inventory,
      mealMemory,
      mealMemoryByRecipeId,
      planningConstraints,
      preferences,
      recentRecipeIds: new Set(recentRecipeIds),
      recipes,
      recipesById,
      trainingContext,
      timeZone,
      weekStart,
      acceptanceHashInput: {
        groceryIntents: groceryIntents.map((entry) => ({
          displayName: entry.displayName,
          quantity: entry.quantity,
          status: entry.status,
          targetWindow: entry.targetWindow,
          unit: entry.unit,
        })),
        inventory: inventory.map((entry) => ({
          brand: entry.brand,
          estimatedExpiry: entry.estimatedExpiry,
          id: entry.id,
          location: entry.location,
          longLifeDefault: entry.longLifeDefault,
          name: entry.name,
          normalizedName: entry.normalizedName,
          quantity: entry.quantity,
          status: entry.status,
          unit: entry.unit,
        })),
        mealMemory: mealMemory.map((entry) => ({
          lastFeedback: entry.lastFeedback,
          notes: entry.notes,
          recipeId: entry.recipeId,
          status: entry.status,
        })),
        calendarContext,
        trainingContext,
        planningConstraints,
        overrides,
        preferences: preferences.raw,
        recipes: recipes.map((entry) => ({
          id: entry.id,
          mealType: entry.mealType,
          raw: entry.raw,
          status: entry.status,
        })),
        weekStart,
      },
      hashInput: {
        groceryIntents: groceryIntents.map((entry) => ({
          displayName: entry.displayName,
          quantity: entry.quantity,
          status: entry.status,
          targetWindow: entry.targetWindow,
          unit: entry.unit,
        })),
        history: history.map((entry) => ({
          approvedAt: entry.approvedAt,
          id: entry.id,
          status: entry.status,
          summary: entry.summary,
          updatedAt: entry.updatedAt,
          weekStart: entry.weekStart,
        })),
        inventory: inventory.map((entry) => ({
          brand: entry.brand,
          estimatedExpiry: entry.estimatedExpiry,
          id: entry.id,
          location: entry.location,
          longLifeDefault: entry.longLifeDefault,
          name: entry.name,
          normalizedName: entry.normalizedName,
          quantity: entry.quantity,
          status: entry.status,
          unit: entry.unit,
        })),
        mealMemory: mealMemory.map((entry) => ({
          lastFeedback: entry.lastFeedback,
          lastUsedAt: entry.lastUsedAt,
          notes: entry.notes,
          recipeId: entry.recipeId,
          status: entry.status,
          updatedAt: entry.updatedAt,
        })),
        calendarContext,
        trainingContext,
        planningConstraints,
        overrides,
        preferences: preferences.raw,
        recipes: recipes.map((entry) => ({
          id: entry.id,
          mealType: entry.mealType,
          raw: entry.raw,
          status: entry.status,
        })),
        weekStart,
      },
    };
  }

  private buildPrimaryPlanCandidate(input: {
    snapshot: Awaited<ReturnType<MealsService['buildPlanningSnapshot']>>;
    overrides: GenerateMealPlanOverrides | null;
    weekStart: string;
  }): PersistedMealPlanCandidateRecord {
    return buildPrimaryPlanCandidateHelper(input);
  }

  private async getPlanGeneration(generationId: string): Promise<PersistedMealPlanGenerationRecord | null> {
    return this.repository.getPlanGeneration(generationId);
  }

  private async listRecentRecipeIds(excludedWeekStart: string, limitDays: number): Promise<string[]> {
    return this.repository.listRecentRecipeIds(excludedWeekStart, limitDays);
  }

  private async currentDateString(): Promise<string> {
    return this.repository.currentDateString();
  }

  private async getProfileTimeZone(): Promise<string> {
    return this.repository.getProfileTimeZone();
  }

  private async dateToWeekday(date: string): Promise<string> {
    return this.repository.dateToWeekday(date);
  }
}

