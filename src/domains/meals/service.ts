import type { MutationProvenance } from '../../auth';
import { resolveHostFamily } from '../../fluent-core';
import { getFluentIdentityContext } from '../../fluent-identity';
import type { PcDomain, PcHost, PersonFact } from '../../personal-context';
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
  applyMealsCalibrationResponse,
  buildMealsCalibrationContext,
  buildMealsOnboardingCalibration,
  type MealsCalibrationResponseInput,
} from './onboarding-calibration';
import { overlayPersonFactsOntoCoreRules } from './person-facts-overlay';
import {
  buildGroceryAggregation as buildGroceryAggregationHelper,
  buildPrimaryPlanCandidate as buildPrimaryPlanCandidateHelper,
  deriveCalendarPlanningConstraints,
  normalizeTrainingContext,
  normalizeCalendarContext,
  normalizeGeneratePlanOverrides,
  type PlanningSnapshot,
} from './planning';
import { buildRecipeBookOnboarding } from './recipe-book';
import { summarizeRecipeCatalog } from './recipe-catalog';
import { MealsRepository } from './repository';
import { canonicalizeInventoryItem, normalizeUnit } from './units';
import type {
  ConfirmedOrderSyncRecord,
  ConfirmedOrderSyncStatus,
  CurrentGroceryListRecord,
  DomainEventRecord,
  FeedbackValue,
  GroceryPlanActionRecord,
  GroceryPlanSufficiencyStatus,
  GroceryIntentRecord,
  GroceryPlanItemRecord,
  GroceryPlanRecord,
  InventoryRecord,
  InventorySummary,
  MealFeedbackRecord,
  MealMemoryRecord,
  MealsOnboardingCalibrationRecord,
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
  RecipeBookActionResultRecord,
  RecipeCatalogSummaryRecord,
  TodayContext,
} from './types';
import type {
  AcceptMealPlanCandidateInput,
  ApplyRecipeBookActionInput,
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
  ApplyGroceryShoppingResultInput,
  ApplyGroceryShoppingResultRecord,
  GroceryShoppingResultItemStatus,
} from './types-extra';
import { deriveExecutionSupportSummary } from './summaries';
export {
  buildMutationAck,
  deriveExecutionSupportSummary,
  summarizeDomainEvent,
  summarizeDomainEvents,
  summarizeCurrentGroceryList,
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
const GROCERY_PLAN_ACTION_STATUSES: GroceryPlanActionRecord['actionStatus'][] = [
  'purchased',
  'in_cart',
  'skipped',
  'substituted',
  'confirmed',
  'needs_purchase',
  ...PREPARED_ORDER_SUFFICIENCY_STATUSES,
];
// Treat the next one or two planning weeks as relevant for "current grocery list"
// reads before the week starts; farther-future lists should not hide recent past state.
const CURRENT_GROCERY_LIST_UPCOMING_LOOKAHEAD_DAYS = 14;

export type PersonFactsReader = (input: { consumerDomain: PcDomain; host: PcHost }) => Promise<PersonFact[]>;

export class MealsService {
  private readonly repository: MealsRepository;
  private mealRecipesTenantColumnExistsPromise: Promise<boolean> | null = null;

  constructor(
    private readonly db: FluentDatabase,
    private readonly personFactsReader: PersonFactsReader | null = null,
  ) {
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

  async getPlan(input?: string | { today?: string | null; weekStart?: string | null }): Promise<MealPlanRecord | null> {
    if (typeof input === 'string') {
      return this.getPlanByWeek(input);
    }
    if (input?.weekStart) {
      return this.getPlanByWeek(input.weekStart);
    }
    return this.getCurrentPlan(input?.today ?? undefined);
  }

  async listPlanHistory(limit: number | { limit?: number | null } = 12): Promise<MealPlanHistoryRecord[]> {
    const rawLimit = typeof limit === 'number' ? limit : limit?.limit;
    const requestedLimit = typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : 12;
    const boundedLimit = Math.max(1, Math.min(Math.trunc(requestedLimit), 52));
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
    const calibration = buildMealsOnboardingCalibration({
      currentGroceryList: null,
      currentPlan: null,
      inventory: snapshot.inventory,
      mealMemory: snapshot.mealMemory,
      planHistory: snapshot.history,
      preferences: snapshot.preferences,
    });
    const calibrationContext = buildMealsCalibrationContext(calibration);
    const inputHash = await hashStableJson(snapshot.acceptanceHashInput);
    const now = new Date().toISOString();
    const generationId = `plan-generation:${input.weekStart}:${crypto.randomUUID()}`;
    const candidate = this.buildPrimaryPlanCandidate({
      snapshot,
      overrides,
      weekStart: input.weekStart,
    });
    const planningBrief = {
      ...candidate.summary.planningBrief,
      confidenceBreakdown: calibration.confidenceBreakdown,
      readiness: calibration.mealPlanningReadiness,
      evidenceNotes: [
        ...candidate.summary.planningBrief.evidenceNotes,
        calibration.mealPlanningReadiness.label,
        ...calibration.mealPlanningReadiness.notes,
      ],
    };
    const planReview = {
      ...candidate.summary.planReview,
      watchouts: Array.from(
        new Set([
          ...candidate.summary.planReview.watchouts,
          ...calibration.mealPlanningReadiness.notes,
        ]),
      ),
      suggestedSwaps:
        calibration.mealPlanningReadiness.ready
          ? candidate.summary.planReview.suggestedSwaps
          : Array.from(
              new Set([
                ...candidate.summary.planReview.suggestedSwaps,
                'Confirm 3-5 starter meal signals or accept this as a lower-confidence starter plan.',
              ]),
            ),
    };
    candidate.summary = {
      ...candidate.summary,
      calibrationContext,
      planningBrief,
      planReview,
      rationale: [
        ...candidate.summary.rationale,
        `Planning basis: ${calibration.mealPlanningReadiness.basis}; distinguish confirmed preferences, inferred meal history, at-home food evidence, and fallback assumptions.`,
        calibration.mealPlanningReadiness.label,
      ],
      warnings: [
        ...candidate.summary.warnings,
        ...calibration.mealPlanningReadiness.notes,
      ],
    };
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
      calibrationContext,
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
    const previousPlan = await this.getPlanByWeek(generation.weekStart);

    const acceptedPlan = await this.upsertPlan({
      createNewPlan: true,
      plan: {
        ...(asRecord(candidate.plan) ?? {}),
        approved_at: new Date().toISOString(),
        source_snapshot: {
          ...(asRecord(asRecord(candidate.plan)?.source_snapshot) ?? {}),
          accepted_candidate_id: input.candidateId,
          generation_id: input.generationId,
          input_hash: input.inputHash,
          planner: 'mcp-native',
          previous_plan_id: previousPlan?.id ?? null,
          replacement_mode: 'new_plan_preserve_history',
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
      (normalized.id ? await this.getPlanById(normalized.id) : null) ??
      (input.createNewPlan ? null : await this.getPlanByWeek(normalized.weekStart));
    const planId = existing?.id ?? normalized.id ?? (input.createNewPlan ? `plan:${this.tenantId}:${normalized.weekStart}:${crypto.randomUUID()}` : `plan:${this.tenantId}:${normalized.weekStart}`);
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
          sqliteIntegerOrNull(entry.serves),
          sqliteIntegerOrNull(entry.prepMinutes),
          sqliteIntegerOrNull(entry.totalMinutes),
          sqliteBoolean(entry.leftoversExpected),
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
    const tenantScopedRecipes = await this.mealRecipesHaveTenantId();
    const row = await this.db
      .prepare(
        tenantScopedRecipes
          ? `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
             FROM meal_recipes
             WHERE tenant_id = ? AND id = ?`
          : `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
             FROM meal_recipes
             WHERE id = ?`,
      )
      .bind(...(tenantScopedRecipes ? [this.tenantId, recipeId] : [recipeId]))
      .first<{
        id: string;
        slug: string | null;
        name: string;
        meal_type: string;
        servings: number | null;
        total_time_minutes: number | null;
        active_time_minutes: number | null;
        status: string;
        raw_json: string | null;
      }>();

    if (!row) {
      return null;
    }

    return {
      activeTimeMinutes: row.active_time_minutes ?? null,
      id: row.id,
      slug: row.slug,
      name: row.name,
      mealType: row.meal_type,
      servings: row.servings ?? null,
      status: row.status,
      totalTimeMinutes: row.total_time_minutes ?? null,
      raw: safeParse(row.raw_json),
    };
  }

  async createRecipe(input: CreateRecipeInput): Promise<MealRecipeRecord> {
    const parsedRecipe = validateRecipeDocument(input.recipe);
    const recipe = {
      ...parsedRecipe,
      id: parsedRecipe.id ?? `recipe:${slugifyForRecipeId(parsedRecipe.name)}:${crypto.randomUUID().slice(0, 8)}`,
    };
    const existing = await this.getRecipe(recipe.id);
    if (existing) {
      throw new Error(`Recipe already exists: ${recipe.id}`);
    }

    const derived = deriveRecipeColumns(recipe);
    const now = new Date().toISOString();
    const tenantScopedRecipes = await this.mealRecipesHaveTenantId();

    const insertSql = tenantScopedRecipes
      ? `INSERT INTO meal_recipes (
          tenant_id, id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, macros_json,
          cost_per_serving_cad, kid_friendly, instructions_json, mise_en_place_json, prep_notes,
          reheat_guidance, serving_notes, status, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO meal_recipes (
          id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, macros_json,
          cost_per_serving_cad, kid_friendly, instructions_json, mise_en_place_json, prep_notes,
          reheat_guidance, serving_notes, status, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const insertBindings = [
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
      ];

    await this.db
      .prepare(insertSql)
      .bind(...(tenantScopedRecipes ? [this.tenantId, ...insertBindings] : insertBindings))
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
    const tenantScopedRecipes = await this.mealRecipesHaveTenantId();
    const includeAnyStatus = status === 'any';
    const statement = mealType
      ? includeAnyStatus
        ? this.db
            .prepare(
              tenantScopedRecipes
                 ? `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    WHERE tenant_id = ? AND meal_type = ?
                    ORDER BY name ASC`
                 : `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    WHERE meal_type = ?
                    ORDER BY name ASC`,
            )
            .bind(...(tenantScopedRecipes ? [this.tenantId, mealType] : [mealType]))
        : this.db
            .prepare(
              tenantScopedRecipes
                 ? `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    WHERE tenant_id = ? AND meal_type = ? AND status = ?
                    ORDER BY name ASC`
                 : `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    WHERE meal_type = ? AND status = ?
                    ORDER BY name ASC`,
            )
            .bind(...(tenantScopedRecipes ? [this.tenantId, mealType, status] : [mealType, status]))
      : includeAnyStatus
        ? this.db
            .prepare(
              tenantScopedRecipes
                 ? `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    WHERE tenant_id = ?
                    ORDER BY meal_type ASC, name ASC`
                 : `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    ORDER BY meal_type ASC, name ASC`,
            )
            .bind(...(tenantScopedRecipes ? [this.tenantId] : []))
        : this.db
            .prepare(
              tenantScopedRecipes
                 ? `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    WHERE tenant_id = ? AND status = ?
                    ORDER BY meal_type ASC, name ASC`
                 : `SELECT id, slug, name, meal_type, servings, total_time_minutes, active_time_minutes, status, raw_json
                    FROM meal_recipes
                    WHERE status = ?
                    ORDER BY meal_type ASC, name ASC`,
            )
            .bind(...(tenantScopedRecipes ? [this.tenantId, status] : [status]));

    const result = await statement.all<{
      id: string;
      slug: string | null;
      name: string;
      meal_type: string;
      servings: number | null;
      total_time_minutes: number | null;
      active_time_minutes: number | null;
      status: string;
      raw_json: string | null;
    }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      mealType: row.meal_type,
      servings: row.servings ?? null,
      totalTimeMinutes: row.total_time_minutes ?? null,
      activeTimeMinutes: row.active_time_minutes ?? null,
      status: row.status,
      raw: safeParse(row.raw_json),
    }));
  }

  async getRecipeCatalogSummary(input: {
    mealType?: string;
    status?: string;
  } = {}): Promise<{
    items: ReturnType<typeof summarizeRecipeCatalog>['items'];
    summary: RecipeCatalogSummaryRecord;
  }> {
    const status = input.status ?? 'active';
    const [recipes, mealMemory] = await Promise.all([
      this.listRecipes(input.mealType, status),
      this.getMealMemory(),
    ]);
    return summarizeRecipeCatalog({ mealMemory, mealType: input.mealType, recipes, status });
  }

  async getRecipeBookOnboarding(): Promise<import('./types').RecipeBookOnboardingRecord> {
    const [recipes, mealMemory, preferences, inventory] = await Promise.all([
      this.listRecipes(undefined, 'active'),
      this.getMealMemory(),
      this.getPreferences(),
      this.getInventory(),
    ]);
    return buildRecipeBookOnboarding({ inventory, mealMemory, preferences, recipes });
  }

  async applyRecipeBookAction(input: ApplyRecipeBookActionInput): Promise<RecipeBookActionResultRecord> {
    const recipe = await this.getRecipe(input.recipeId);
    if (!recipe || recipe.status === 'retired') {
      throw new Error(`Active recipe not found: ${input.recipeId}`);
    }

    const now = new Date().toISOString();
    const existingMemory = (await this.getMealMemory(input.recipeId))[0] ?? null;
    if (existingMemory?.status === 'retired' && input.action === 'pin_to_week') {
      throw new Error(`Recipe is marked not for us and cannot be pinned to a week: ${input.recipeId}`);
    }
    const currentFeedback = asRecord(existingMemory?.lastFeedback) ?? {};
    const before = existingMemory ? { ...existingMemory } : null;
    const actionFeedback = {
      ...currentFeedback,
      recipe_book: {
        ...(asRecord(currentFeedback.recipe_book ?? currentFeedback.recipeBook) ?? {}),
        action: input.action,
        actionAt: now,
        note: input.note ?? null,
      },
    };

    const nextStatus = deriveRecipeBookMemoryStatus(existingMemory?.status ?? null, input.action);
    const nextMemory = input.action === 'pin_to_week'
      ? {
          lastFeedback: actionFeedback,
          lastUsedAt: existingMemory?.lastUsedAt ?? null,
          notes: mergeNotes(existingMemory?.notes, input.note),
          status: nextStatus,
        }
      : {
          lastFeedback: {
            ...actionFeedback,
            taste:
              input.action === 'favorite'
                ? 'good'
                : input.action === 'not_for_us'
                  ? 'bad'
                  : currentFeedback.taste ?? null,
            repeat_again:
              input.action === 'favorite'
                ? 'good'
                : input.action === 'not_for_us'
                  ? 'bad'
                  : currentFeedback.repeat_again ?? null,
          },
          lastUsedAt: existingMemory?.lastUsedAt ?? null,
          notes: mergeNotes(existingMemory?.notes, input.note),
          status: nextStatus,
        };

    await this.upsertMealMemoryRecord({
      recipeId: input.recipeId,
      status: nextMemory.status,
      lastFeedback: nextMemory.lastFeedback,
      notes: nextMemory.notes,
      lastUsedAt: nextMemory.lastUsedAt,
      updatedAt: now,
    });

    const memory = (await this.getMealMemory(input.recipeId))[0] ?? null;
    const result: RecipeBookActionResultRecord = {
      action: input.action,
      confirmationPrompt:
        input.action === 'not_for_us'
          ? 'If this points to a broader hard avoid, ask explicitly before saving it as a household rule.'
          : null,
      evidenceScope: input.action === 'pin_to_week' ? 'planning_intent' : 'recipe_evidence',
      memory,
      planningIntent:
        input.action === 'pin_to_week'
          ? {
              args: {
                overrides: {
                  includeRecipeIds: [input.recipeId],
                },
                ...(input.weekStart ? { week_start: input.weekStart } : {}),
              },
              toolName: 'meals_generate_plan',
            }
          : null,
      recipeId: input.recipeId,
      recipeName: recipe.name,
      safetyNote:
        'Recipe-book actions are recipe-specific evidence. They do not create allergies, medical restrictions, dietary constraints, or broad hard avoids.',
    };

    await this.recordDomainEvent({
      entityType: 'meal_memory',
      entityId: input.recipeId,
      eventType: 'recipe_book.action_applied',
      before,
      after: memory,
      patch: {
        action: input.action,
        evidence_scope: result.evidenceScope,
        planning_intent: result.planningIntent,
        recipe_id: input.recipeId,
      },
      provenance: input.provenance,
    });

    return result;
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
    const before = await this.getPreferencesOrDefault();
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

  async getOnboardingCalibration(input: { includeCurrentGroceryList?: boolean } = {}): Promise<MealsOnboardingCalibrationRecord> {
    const [preferences, inventory, mealMemory, planHistory, currentPlan] = await Promise.all([
      this.getPreferencesOrDefault(),
      this.getInventory(),
      this.getMealMemory(),
      this.listPlanHistory(12),
      this.getCurrentPlan(),
    ]);
    const currentGroceryList =
      input.includeCurrentGroceryList === false ? null : await this.getCurrentGroceryList({ skipCalibrationContext: true });

    return buildMealsOnboardingCalibration({
      currentGroceryList,
      currentPlan,
      inventory,
      mealMemory,
      planHistory,
      preferences,
    });
  }

  async recordCalibrationResponse(input: {
    response: MealsCalibrationResponseInput;
    provenance: MutationProvenance;
  }): Promise<MealPreferencesRecord> {
    const preferences = await this.getPreferencesOrDefault();
    const nextRaw = applyMealsCalibrationResponse({
      preferences,
      response: input.response,
    });
    const updated = await this.updatePreferences({
      preferences: nextRaw,
      provenance: input.provenance,
      sourceSnapshot: {
        responseKinds: {
          pantryItemCount: input.response.pantryItems?.length ?? 0,
          preferencePatch: Boolean(input.response.preferencePatch),
          signalCount: input.response.signals?.length ?? 0,
          starterPreferenceText: Boolean(input.response.starterPreferenceText?.trim()),
        },
        tool: 'meals_record_calibration_response',
      },
    });

    await this.recordDomainEvent({
      entityType: 'meal_calibration',
      entityId: `${updated.tenantId}:${updated.profileId}`,
      eventType: 'calibration_response.recorded',
      before: preferences.raw.calibration ?? null,
      after: updated.raw.calibration ?? null,
      patch: {
        pantry_item_count: input.response.pantryItems?.length ?? 0,
        signal_count: input.response.signals?.length ?? 0,
      },
      provenance: input.provenance,
    });

    return updated;
  }

  private async getPreferencesOrDefault(): Promise<MealPreferencesRecord> {
    try {
      return await this.getPreferences();
    } catch (error) {
      if (!isMissingMealPreferencesError(error)) {
        throw error;
      }
      return {
        profileId: this.profileId,
        profileOwner: null,
        raw: {},
        tenantId: this.tenantId,
        updatedAt: null,
        version: '1',
      };
    }
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

  async archiveInventoryItem(input: DeleteInventoryItemInput): Promise<InventoryRecord | null> {
    const normalizedName = normalizeText(input.name);
    const existing = await this.lookupInventoryByNormalizedName(normalizedName);
    if (!existing) {
      return null;
    }

    // Soft-archive: flip status to 'removed' (getInventory filters status != 'removed', so the item leaves
    // the active list) WITHOUT touching quantity/unit/brand/etc., so an un-archive (status back to 'present')
    // is lossless. This honors fluent_archive_item's reversible / destructiveHint:false contract, unlike the
    // hard-delete deleteInventoryItem path. A targeted UPDATE is used (not updateInventory, whose upsert
    // rewrites every column from the input and would null omitted fields).
    await this.db
      .prepare(`UPDATE meal_inventory_items SET status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND normalized_name = ?`)
      .bind(this.tenantId, normalizedName)
      .run();

    const after: InventoryRecord = { ...existing, status: 'removed' };

    await this.recordDomainEvent({
      entityType: 'meal_inventory_item',
      entityId: existing.id,
      eventType: 'inventory.archived',
      before: existing,
      after,
      patch: { normalized_name: normalizedName, status: 'removed' },
      provenance: input.provenance,
    });

    return after;
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

    const currentRecipe = validateRecipeDocument(hydrateRecipeDocumentFromColumns(current));
    const nextRecipe = validateRecipeDocument(applyJsonPatch(currentRecipe, input.operations));
    if (nextRecipe.id !== input.recipeId) {
      throw new Error('Recipe patches may not change the recipe id.');
    }

    const derived = deriveRecipeColumns({ ...nextRecipe, id: input.recipeId });
    const updatedAt = new Date().toISOString();
    const tenantScopedRecipes = await this.mealRecipesHaveTenantId();

    await this.db
      .prepare(
        tenantScopedRecipes
          ? `UPDATE meal_recipes
             SET slug = ?, name = ?, meal_type = ?, status = ?, servings = ?, total_time_minutes = ?,
                 active_time_minutes = ?, macros_json = ?, cost_per_serving_cad = ?, kid_friendly = ?,
                 instructions_json = ?, mise_en_place_json = ?, prep_notes = ?, reheat_guidance = ?,
                 serving_notes = ?, raw_json = ?, updated_at = ?
             WHERE tenant_id = ? AND id = ?`
          : `UPDATE meal_recipes
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
        ...(tenantScopedRecipes ? [this.tenantId, input.recipeId] : [input.recipeId]),
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
        `SELECT id, week_start, meal_plan_id, raw_json, source_snapshot_json, generated_at
         FROM meal_grocery_plans
         WHERE tenant_id = ? AND week_start = ?`,
      )
      .bind(this.tenantId, weekStart)
      .first<{
        id: string;
        week_start: string;
        meal_plan_id: string | null;
        raw_json: string;
        source_snapshot_json: string | null;
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
      sourceSnapshot: safeParse(row.source_snapshot_json),
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

  async getCurrentGroceryList(
    input: { weekStart?: string | null; today?: string | null; skipCalibrationContext?: boolean } = {},
  ): Promise<CurrentGroceryListRecord> {
    const today = input.today?.trim() || (await this.currentDateString());
    const explicitWeekStart = input.weekStart?.trim() || null;
    const anchor = await this.resolveCurrentGroceryListAnchor({ explicitWeekStart, today });
    const weekStart = anchor.weekStart;
    const groceryPlan = anchor.groceryPlan;
    const selectedPlan =
      anchor.plan ??
      (groceryPlan?.mealPlanId ? await this.getPlanById(groceryPlan.mealPlanId) : null) ??
      (await this.getPlanByWeek(weekStart));
    const intents = await this.listGroceryIntents();
    const preparedOrder = groceryPlan ? await this.prepareOrder({ weekStart }) : null;
    const actions = groceryPlan ? await this.listGroceryPlanActions(weekStart) : [];
    const weekRelation = this.resolveWeekRelation(weekStart, today);
    const sourceProvenance: CurrentGroceryListRecord['sourceProvenance'] = [];
    const staleReasons: string[] = [];

    if (selectedPlan) {
      sourceProvenance.push({
        id: selectedPlan.id,
        kind: selectedPlan.status === 'draft' ? 'draft_meal_plan' : 'accepted_meal_plan',
        label: selectedPlan.status === 'draft' ? `From draft meal plan for ${selectedPlan.weekStart}` : `From accepted meal plan for ${selectedPlan.weekStart}`,
        status: selectedPlan.status,
        weekStart: selectedPlan.weekStart,
      });
    }
    if (groceryPlan) {
      sourceProvenance.push({
        id: groceryPlan.id,
        kind: 'grocery_plan',
        label: `Derived grocery needs for ${groceryPlan.weekStart}`,
        weekStart: groceryPlan.weekStart,
      });
    }

    const relevantIntents = intents.filter((intent) => this.intentBelongsToCurrentList(intent, weekStart, groceryPlan?.mealPlanId ?? selectedPlan?.id ?? null));
    if (relevantIntents.length > 0) {
      sourceProvenance.push({
        id: null,
        kind: 'manual_item',
        label: `${relevantIntents.length} added item${relevantIntents.length === 1 ? '' : 's'}`,
        weekStart: null,
      });
    }

    const staleInCartCount = actions.filter((action) => action.actionStatus === 'in_cart' && this.isStaleCartAction(action)).length;
    if (staleInCartCount > 0) {
      staleReasons.push(`${staleInCartCount} cart item${staleInCartCount === 1 ? '' : 's'} came from an old shopping session.`);
    }
    if (anchor.selectionReason) {
      staleReasons.push(anchor.selectionReason);
    }
    if (weekRelation === 'future') {
      staleReasons.push('This list includes future meal-plan needs.');
    }
    if (weekRelation === 'past') {
      staleReasons.push('This list is tied to a past meal-plan week.');
    }
    if (selectedPlan?.status === 'draft') {
      staleReasons.push('This list is based on a draft meal plan.');
    }

    const trustState = this.resolveCurrentGroceryListTrustState({
      groceryPlan,
      preparedOrder,
      staleReasons,
    });
    const trustLabel = this.currentGroceryListTrustLabel(trustState);
    const updatedAt = this.latestGroceryListTimestamp(groceryPlan, actions, relevantIntents);
    const counts: CurrentGroceryListRecord['counts'] = {
      checkAtHomeCount: preparedOrder?.unresolvedItems.length ?? 0,
      inCartCount: preparedOrder?.alreadyInRetailerCart.length ?? 0,
      manualIntentCount: relevantIntents.length,
      planItemCount: groceryPlan?.raw.items.length ?? 0,
      resolvedCount: groceryPlan?.raw.resolvedItems.length ?? 0,
      toBuyCount: preparedOrder?.remainingToBuy.length ?? groceryPlan?.raw.items.length ?? 0,
      unresolvedCount: preparedOrder?.unresolvedItems.length ?? 0,
    };
    const currentListBase: CurrentGroceryListRecord = {
      calibrationContext: undefined,
      counts,
      generatedAt: groceryPlan?.generatedAt ?? null,
      groceryPlan,
      intents: relevantIntents,
      listId: `current-grocery-list:${this.tenantId}`,
      objectRole: 'living_grocery_list',
      preparedOrder,
      selectionReason: anchor.selectionReason,
      sourceProvenance,
      stale: staleReasons.length > 0,
      staleReasons,
      subtitle: this.buildCurrentGroceryListSubtitle({
        relevantIntents,
        selectedPlan,
        trustLabel,
        weekRelation,
      }),
      title: 'Grocery list',
      trustLabel,
      trustState,
      updatedAt,
      version: 'pending',
      weekRelation,
      weekStart,
    };
    const calibrationContext =
      input.skipCalibrationContext === true
        ? undefined
        : buildMealsCalibrationContext(
            buildMealsOnboardingCalibration({
              currentGroceryList: currentListBase,
              currentPlan: await this.getCurrentPlan(),
              inventory: await this.getInventory(),
              mealMemory: await this.getMealMemory(),
              planHistory: await this.listPlanHistory(12),
              preferences: await this.getPreferences(),
            }),
          );
    const version = await hashStableJson({
      actions: actions.map((action) => [action.itemKey, action.actionStatus, action.updatedAt, action.metadata]),
      calibrationContext,
      groceryPlanGeneratedAt: groceryPlan?.generatedAt ?? null,
      intents: relevantIntents.map((intent) => [intent.id, intent.status, intent.updatedAt]),
      trustState,
      weekRelation,
      weekStart,
    });

    return {
      ...currentListBase,
      calibrationContext,
      version,
    };
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
    const calibration = buildMealsOnboardingCalibration({
      currentGroceryList: null,
      currentPlan: plan,
      inventory,
      mealMemory: await this.getMealMemory(),
      planHistory: await this.listPlanHistory(12),
      preferences,
    });
    const calibrationContext = buildMealsCalibrationContext(calibration);

    const generatedAt = new Date().toISOString();
    const raw = {
      generatedAt,
      items: aggregation.items,
      notes: [
        ...aggregation.notes,
        ...calibration.groceryReadiness.notes,
        calibration.groceryReadiness.label,
      ],
      actionsAppliedCount: 0,
      calibrationContext,
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
        ON CONFLICT(tenant_id, week_start) DO UPDATE SET
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
          mealPlanId: plan.id,
          preferenceVersion: preferences.version,
          previousGeneratedAt: before?.generatedAt ?? null,
          previousGroceryPlanId: before?.id ?? null,
          previousMealPlanId: before?.mealPlanId ?? null,
          replacementMode: before ? 'regenerate_preserve_event_history' : 'new_grocery_plan',
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
    if (!this.isGroceryPlanActionStatus(input.actionStatus)) {
      throw new Error(`Unsupported grocery-plan action status: ${String(input.actionStatus)}.`);
    }
    const isSufficiencyAction = PREPARED_ORDER_SUFFICIENCY_STATUSES.includes(
      input.actionStatus as GroceryPlanSufficiencyStatus,
    );
    const targetItem = await this.resolveGroceryPlanItemForAction(input.weekStart, input.itemKey);
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

    if (!targetItem) {
      throw new Error(`Could not find grocery-plan item ${input.itemKey} for ${input.actionStatus} action.`);
    }

    if (isSufficiencyAction) {
      if (!this.isPreparedOrderSufficiencyEligible(targetItem)) {
        throw new Error(
          `${targetItem.name} still requires quantity-aware review before ordering; at-home sufficiency confirmation is not supported for this item.`,
        );
      }
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
    if (
      (input.actionStatus === 'confirmed' || input.actionStatus === 'have_enough') &&
      targetItem &&
      this.shouldRefreshInventoryFromCoveredAction(input.metadata)
    ) {
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
        regenerateGroceryPlan: false,
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
    const recordId = existing?.id ?? input.id ?? `grocery-intent:${crypto.randomUUID()}`;

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

    if (input.regenerateGroceryPlan !== false) {
      await this.maybeRegenerateGroceryPlanForIntent(record, input.provenance);
    }

    return record;
  }

  /**
   * Post-shopping reconcile: in one explicit user-approved action, mark the current grocery list's
   * bought items purchased (or skipped) and refresh inventory presence. Handles BOTH grocery item
   * types: plan items (via upsertGroceryPlanAction — 'purchased' auto-refreshes inventory) and manual
   * intents (via upsertGroceryIntent status + an explicit updateInventory, since intents have no
   * auto-inventory path). Only items already on the current readback can be reconciled — no new-item
   * invention. Inventory refresh records PRESENCE only (no quantity inference).
   */
  async applyGroceryShoppingResult(
    input: ApplyGroceryShoppingResultInput,
  ): Promise<ApplyGroceryShoppingResultRecord> {
    const hasExplicit = Array.isArray(input.boughtItems) && input.boughtItems.length > 0;
    if (!hasExplicit && input.markAllToBuyBought !== true) {
      throw new Error(
        'applyGroceryShoppingResult requires bought_items (non-empty) or mark_all_to_buy_bought=true.',
      );
    }

    const currentList = await this.getCurrentGroceryList({
      weekStart: input.weekStart ?? undefined,
      skipCalibrationContext: true,
    });
    const weekStart = currentList.weekStart;
    // raw.items (the current to-buy bucket) and raw.resolvedItems (settled or already-have items)
    // are DISJOINT sets. mark_all_to_buy_bought reconciles the to-buy bucket only; an explicit
    // item_key may name an item from either bucket, so resolution uses the deduped union.
    const toBuyPlanItems = currentList.groceryPlan ? currentList.groceryPlan.raw.items : [];
    const allPlanItems: GroceryPlanItemRecord[] = [];
    if (currentList.groceryPlan) {
      const seenItemKeys = new Set<string>();
      for (const item of [
        ...currentList.groceryPlan.raw.items,
        ...currentList.groceryPlan.raw.resolvedItems,
      ]) {
        if (seenItemKeys.has(item.itemKey)) continue;
        seenItemKeys.add(item.itemKey);
        allPlanItems.push(item);
      }
    }
    const intents = currentList.intents;
    const planByKey = new Map(allPlanItems.map((item) => [item.itemKey, item]));
    const intentById = new Map(intents.map((intent) => [intent.id, intent]));
    const totalItems = allPlanItems.length + intents.length;

    let targets: Array<{ itemKey: string; status: GroceryShoppingResultItemStatus }>;
    if (hasExplicit) {
      const boughtItems = input.boughtItems ?? [];
      if (boughtItems.length > totalItems) {
        throw new Error(
          `applyGroceryShoppingResult received more items (${boughtItems.length}) than the current list contains (${totalItems}).`,
        );
      }
      for (const entry of boughtItems) {
        if (!planByKey.has(entry.itemKey) && !intentById.has(entry.itemKey)) {
          throw new Error(
            `Grocery item ${entry.itemKey} is not on the current list; only items from the current readback can be reconciled.`,
          );
        }
      }
      targets = boughtItems.map((entry) => ({ itemKey: entry.itemKey, status: entry.status ?? 'bought' }));
    } else {
      const planTargets = toBuyPlanItems
        .filter((item) => this.isGroceryPlanItemToBuy(item))
        .map((item) => ({ itemKey: item.itemKey, status: 'bought' as const }));
      const intentTargets = intents
        .filter((intent) => this.isGroceryIntentToBuy(intent))
        .map((intent) => ({ itemKey: intent.id, status: 'bought' as const }));
      targets = [...planTargets, ...intentTargets];
      if (targets.length === 0) {
        throw new Error(
          'applyGroceryShoppingResult found no to-buy items on the current list to mark bought.',
        );
      }
    }

    const reconcileMetadata = {
      fluentLifecycle: {
        kind: 'grocery_shopping_result',
        source: 'fluent_apply_grocery_shopping_result',
        weekStart,
      },
    };

    const planResults: ApplyGroceryShoppingResultRecord['planItems'] = [];
    const intentResults: ApplyGroceryShoppingResultRecord['manualIntents'] = [];
    const inventoryRefreshed: ApplyGroceryShoppingResultRecord['inventoryRefreshed'] = [];
    const skipped: ApplyGroceryShoppingResultRecord['skipped'] = [];

    for (const target of targets) {
      const planItem = planByKey.get(target.itemKey);
      if (planItem) {
        const actionStatus = target.status === 'skipped' ? 'skipped' : 'purchased';
        await this.upsertGroceryPlanAction({
          weekStart,
          itemKey: planItem.itemKey,
          actionStatus,
          mealPlanId: currentList.groceryPlan?.mealPlanId ?? null,
          metadata: reconcileMetadata,
          provenance: input.provenance,
        });
        planResults.push({ itemKey: planItem.itemKey, name: planItem.name, actionStatus });
        if (actionStatus === 'purchased') {
          // upsertGroceryPlanAction('purchased') auto-refreshes inventory presence (service.ts).
          inventoryRefreshed.push({ name: planItem.name });
        }
        continue;
      }

      const intent = intentById.get(target.itemKey);
      if (intent) {
        const intentStatus = target.status === 'skipped' ? 'skipped' : 'purchased';
        const baseMeta =
          intent.metadata && typeof intent.metadata === 'object' && !Array.isArray(intent.metadata)
            ? (intent.metadata as Record<string, unknown>)
            : {};
        await this.upsertGroceryIntent({
          id: intent.id,
          displayName: intent.displayName,
          quantity: intent.quantity,
          unit: intent.unit,
          notes: intent.notes,
          status: intentStatus,
          targetWindow: intent.targetWindow,
          mealPlanId: intent.mealPlanId,
          metadata: { ...baseMeta, ...reconcileMetadata },
          regenerateGroceryPlan: false,
          provenance: input.provenance,
        });
        intentResults.push({ id: intent.id, displayName: intent.displayName, status: intentStatus });
        if (intentStatus === 'purchased') {
          // Manual intents have no auto-inventory path — refresh presence explicitly.
          await this.refreshInventoryEvidenceFromPurchasedIntent({ intent, provenance: input.provenance });
          inventoryRefreshed.push({ name: intent.displayName });
        }
        continue;
      }

      skipped.push({ itemKey: target.itemKey, reason: 'not_on_current_list' });
    }

    return {
      weekStart,
      appliedCount: planResults.length + intentResults.length,
      planItems: planResults,
      manualIntents: intentResults,
      inventoryRefreshed,
      skipped,
    };
  }

  private isGroceryPlanItemToBuy(item: GroceryPlanItemRecord): boolean {
    const settled = new Set(['purchased', 'skipped', 'substituted', 'have_enough', 'confirmed']);
    return !item.actionStatus || !settled.has(item.actionStatus);
  }

  private isGroceryIntentToBuy(intent: GroceryIntentRecord): boolean {
    const settled = new Set(['purchased', 'skipped', 'deleted', 'have_enough']);
    return !settled.has(intent.status);
  }

  private async refreshInventoryEvidenceFromPurchasedIntent(input: {
    intent: GroceryIntentRecord;
    purchasedAt?: string | null;
    provenance: MutationProvenance;
  }): Promise<void> {
    const inventory = await this.getInventory();
    const existing = inventory.find((entry) => entry.normalizedName === input.intent.normalizedName) ?? null;
    await this.updateInventory({
      name: existing?.name ?? input.intent.displayName,
      status: 'present',
      source: existing?.source ?? 'grocery_intent',
      confirmedAt: existing?.confirmedAt ?? null,
      purchasedAt: input.purchasedAt ?? new Date().toISOString(),
      estimatedExpiry: existing?.estimatedExpiry ?? null,
      perishability: existing?.perishability ?? null,
      longLifeDefault: existing ? existing.longLifeDefault : false,
      quantity: existing?.quantity ?? null,
      unit: existing?.unit ?? null,
      location: existing?.location ?? null,
      brand: existing?.brand ?? null,
      costCad: existing?.costCad ?? null,
      metadata: existing?.metadata ?? null,
      provenance: input.provenance,
    });
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
    const plan = await this.getGroceryPlan(weekStart);
    if (!plan) {
      return null;
    }

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
    const appliedActionKeys = new Set<string>();
    const actionableItems: typeof plan.raw.items = [];
    const resolvedItems: typeof plan.raw.resolvedItems = [];

    for (const item of plan.raw.items) {
      const action = actionMap.get(item.itemKey);
      if (!action) {
        actionableItems.push(item);
        continue;
      }
      appliedActionKeys.add(action.itemKey);
      if (this.isStaleCartAction(action)) {
        actionableItems.push({
          ...item,
          note: item.note ?? 'Cart state came from an old shopping session; confirm before treating it as still in cart.',
          substitute: null,
        });
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
      appliedActionKeys.add(action.itemKey);
      if (this.isStaleCartAction(action)) {
        actionableItems.push({
          ...item,
          note: item.note ?? 'Cart state came from an old shopping session; confirm before treating it as still in cart.',
          inventoryStatus: item.inventoryStatus === 'sufficient' ? 'missing' : item.inventoryStatus,
          substitute: null,
        });
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
        actionsAppliedCount: appliedActionKeys.size,
        items: actionableItems,
        resolvedItems,
      },
    };
  }

  private collectPreparedOrderSubstitutions(plan: GroceryPlanRecord): PreparedOrderSubstitutionDecisionRecord[] {
    const decisions: PreparedOrderSubstitutionDecisionRecord[] = [];
    const seen = new Set<string>();

    for (const item of plan.raw.resolvedItems) {
      if (item.actionStatus !== 'substituted' || !item.substitute?.displayName) {
        continue;
      }
      const key = [item.itemKey, item.name, item.substitute.displayName].join('\u0000');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      decisions.push({
        requested: item.name,
        resolvedTo: item.substitute?.displayName ?? item.name,
        source: 'grocery_plan_action',
      });
    }

    return decisions;
  }

  private isPreparedOrderSufficiencyAction(value: string): value is GroceryPlanSufficiencyStatus {
    return PREPARED_ORDER_SUFFICIENCY_STATUSES.includes(value as GroceryPlanSufficiencyStatus);
  }

  private isGroceryPlanActionStatus(value: unknown): value is GroceryPlanActionRecord['actionStatus'] {
    return typeof value === 'string' && GROCERY_PLAN_ACTION_STATUSES.includes(value as GroceryPlanActionRecord['actionStatus']);
  }

  private isPreparedOrderSufficiencyEligible(
    item: GroceryPlanRecord['raw']['items'][number] | GroceryPlanRecord['raw']['resolvedItems'][number],
  ) {
    return item.inventoryStatus === 'check_pantry' || item.orderingPolicy === 'pantry_item';
  }

  private resolveWeekRelation(weekStart: string, today: string): CurrentGroceryListRecord['weekRelation'] {
    const weekStartDate = Date.parse(`${weekStart}T00:00:00.000Z`);
    const todayDate = Date.parse(`${today}T00:00:00.000Z`);
    if (!Number.isFinite(weekStartDate) || !Number.isFinite(todayDate)) {
      return 'unknown';
    }
    const weekEndDate = weekStartDate + 6 * 24 * 60 * 60 * 1000;
    if (todayDate < weekStartDate) {
      return 'future';
    }
    if (todayDate > weekEndDate) {
      return 'past';
    }
    return 'contains_today';
  }

  private async resolveCurrentGroceryListAnchor(input: {
    explicitWeekStart: string | null;
    today: string;
  }): Promise<{
    groceryPlan: GroceryPlanRecord | null;
    plan: MealPlanRecord | null;
    selectionReason: string | null;
    weekStart: string;
  }> {
    if (input.explicitWeekStart) {
      const groceryPlan = await this.getGroceryPlan(input.explicitWeekStart);
      const plan =
        (groceryPlan?.mealPlanId ? await this.getPlanById(groceryPlan.mealPlanId) : null) ??
        (await this.getPlanByWeek(input.explicitWeekStart));
      return {
        groceryPlan,
        plan,
        selectionReason: null,
        weekStart: input.explicitWeekStart,
      };
    }

    const currentWeekStart = this.startOfWeekIso(input.today);
    const currentPlan = await this.getPlanContainingDate(input.today);
    if (currentPlan?.weekStart) {
      return {
        groceryPlan: await this.getGroceryPlan(currentPlan.weekStart),
        plan: currentPlan,
        selectionReason: null,
        weekStart: currentPlan.weekStart,
      };
    }

    const currentWeekGroceryPlan = await this.getGroceryPlan(currentWeekStart);
    if (currentWeekGroceryPlan) {
      const plan =
        (currentWeekGroceryPlan.mealPlanId ? await this.getPlanById(currentWeekGroceryPlan.mealPlanId) : null) ??
        (await this.getPlanByWeek(currentWeekStart));
      return {
        groceryPlan: currentWeekGroceryPlan,
        plan,
        selectionReason: null,
        weekStart: currentWeekStart,
      };
    }

    if (await this.hasCurrentWeekGroceryIntent(currentWeekStart)) {
      return {
        groceryPlan: null,
        plan: await this.getPlanByWeek(currentWeekStart),
        selectionReason: null,
        weekStart: currentWeekStart,
      };
    }

    const upcomingBound = shiftDateString(currentWeekStart, CURRENT_GROCERY_LIST_UPCOMING_LOOKAHEAD_DAYS);
    const upcomingPlanWeek = await this.findNearestGroceryPlanWeek({
      direction: 'future',
      maxWeekStart: upcomingBound,
      weekStart: currentWeekStart,
    });
    // Manual list changes targeted at an upcoming week anchor the list too — a host can build
    // next week's list purely from intents without generating a grocery plan first.
    const upcomingIntentWeek = await this.findNearestGroceryIntentWeek({
      maxWeekStart: upcomingBound,
      weekStart: currentWeekStart,
    });
    const latestUpcomingWeekStart =
      [upcomingPlanWeek, upcomingIntentWeek].filter((week): week is string => Boolean(week)).sort()[0] ?? null;
    if (latestUpcomingWeekStart) {
      const groceryPlan = await this.getGroceryPlan(latestUpcomingWeekStart);
      const plan =
        (groceryPlan?.mealPlanId ? await this.getPlanById(groceryPlan.mealPlanId) : null) ??
        (await this.getPlanByWeek(latestUpcomingWeekStart));
      return {
        groceryPlan,
        plan,
        selectionReason: `No list exists for the current week, so Fluent is showing the upcoming week's list (weekStart ${latestUpcomingWeekStart}).`,
        weekStart: latestUpcomingWeekStart,
      };
    }

    const latestPastWeekStart = await this.findNearestGroceryPlanWeek({
      direction: 'past_or_current',
      weekStart: currentWeekStart,
    });
    if (latestPastWeekStart) {
      const groceryPlan = await this.getGroceryPlan(latestPastWeekStart);
      const plan =
        (groceryPlan?.mealPlanId ? await this.getPlanById(groceryPlan.mealPlanId) : null) ??
        (await this.getPlanByWeek(latestPastWeekStart));
      return {
        groceryPlan,
        plan,
        selectionReason: `No current-week grocery list exists, so Fluent is showing the most recent list from ${latestPastWeekStart}.`,
        weekStart: latestPastWeekStart,
      };
    }

    return {
      groceryPlan: null,
      plan: null,
      selectionReason: 'No current grocery list exists yet for this week.',
      weekStart: currentWeekStart,
    };
  }

  private async getPlanContainingDate(today: string): Promise<MealPlanRecord | null> {
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
      .bind(this.tenantId, today, today)
      .first<{ id: string }>();

    return row?.id ? this.getPlanById(row.id) : null;
  }

  private async findNearestGroceryPlanWeek(input: {
    direction: 'past_or_current' | 'future';
    maxWeekStart?: string;
    weekStart: string;
  }): Promise<string | null> {
    const operator = input.direction === 'past_or_current' ? '<=' : '>';
    const ordering = input.direction === 'past_or_current' ? 'DESC' : 'ASC';
    const upperBoundClause = input.direction === 'future' && input.maxWeekStart ? ' AND week_start <= ?' : '';
    const bindings =
      input.direction === 'future' && input.maxWeekStart
        ? [this.tenantId, input.weekStart, input.maxWeekStart]
        : [this.tenantId, input.weekStart];
    const row = await this.db
      .prepare(
        `SELECT week_start
         FROM meal_grocery_plans
         WHERE tenant_id = ?
            AND week_start ${operator} ?
           ${upperBoundClause}
          ORDER BY week_start ${ordering}
          LIMIT 1`,
      )
      .bind(...bindings)
      .first<{ week_start: string }>();

    return row?.week_start ?? null;
  }

  private async findNearestGroceryIntentWeek(input: {
    maxWeekStart: string;
    weekStart: string;
  }): Promise<string | null> {
    // Anchor on any open-or-settled intent: a fully purchased/skipped list is still that
    // week's list (it must resolve and render as done, not vanish to a past fallback).
    // Archived intents don't anchor — they're excluded from render membership too.
    const intents = await this.listGroceryIntents();
    const weeks = intents
      .filter((intent) => !intent.mealPlanId && intent.status !== 'archived')
      // Match the loose target-window semantics used by the current-week path: extract an
      // ISO date from strings like "week of 2026-07-13" rather than requiring a bare date.
      .map((intent) => intent.targetWindow?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '')
      .filter((window) => window > input.weekStart && window <= input.maxWeekStart)
      .sort();
    return weeks[0] ?? null;
  }

  private async hasCurrentWeekGroceryIntent(weekStart: string): Promise<boolean> {
    const intents = await this.listGroceryIntents();
    return intents.some((intent) => {
      if (intent.mealPlanId || intent.status === 'archived') {
        return false;
      }
      if (!intent.targetWindow) {
        return false;
      }
      return normalizeText(intent.targetWindow).includes(normalizeText(weekStart));
    });
  }

  private resolveCurrentGroceryListTrustState(input: {
    groceryPlan: GroceryPlanRecord | null;
    preparedOrder: PreparedOrderRecord | null;
    staleReasons: string[];
  }): CurrentGroceryListRecord['trustState'] {
    if (input.staleReasons.length > 0) {
      return 'list_may_be_out_of_date';
    }
    if (!input.groceryPlan) {
      return 'review_before_shopping';
    }
    if ((input.preparedOrder?.unresolvedItems.length ?? 0) > 0) {
      return 'confirm_what_you_have';
    }
    return input.preparedOrder?.safeToOrder ? 'ready_to_shop' : 'review_before_shopping';
  }

  private currentGroceryListTrustLabel(
    trustState: CurrentGroceryListRecord['trustState'],
  ): CurrentGroceryListRecord['trustLabel'] {
    switch (trustState) {
      case 'ready_to_shop':
        return 'Ready to shop';
      case 'confirm_what_you_have':
        return 'Check before shopping';
      case 'list_may_be_out_of_date':
        return 'List may be out of date';
      case 'review_before_shopping':
      default:
        return 'Check before shopping';
    }
  }

  private buildCurrentGroceryListSubtitle(input: {
    relevantIntents: GroceryIntentRecord[];
    selectedPlan: MealPlanRecord | null;
    trustLabel: CurrentGroceryListRecord['trustLabel'];
    weekRelation: CurrentGroceryListRecord['weekRelation'];
  }): string {
    const parts: string[] = [input.trustLabel];
    if (input.selectedPlan?.weekStart) {
      parts.push(
        input.weekRelation === 'future'
          ? `includes next plan (${input.selectedPlan.weekStart})`
          : `from meal plan ${input.selectedPlan.weekStart}`,
      );
    }
    if (input.relevantIntents.length > 0) {
      parts.push(`${input.relevantIntents.length} added item${input.relevantIntents.length === 1 ? '' : 's'}`);
    }
    return parts.join(' · ');
  }

  private latestGroceryListTimestamp(
    groceryPlan: GroceryPlanRecord | null,
    actions: GroceryPlanActionRecord[],
    intents: GroceryIntentRecord[],
  ): string | null {
    const timestamps = [
      groceryPlan?.generatedAt ?? null,
      ...actions.map((action) => action.updatedAt ?? action.createdAt ?? null),
      ...intents.map((intent) => intent.updatedAt ?? intent.createdAt ?? null),
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort((left, right) => left.localeCompare(right));
    return timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
  }

  private intentBelongsToCurrentList(intent: GroceryIntentRecord, weekStart: string, currentPlanId: string | null): boolean {
    if (intent.status === 'deleted' || intent.status === 'archived') {
      return false;
    }
    if (intent.mealPlanId && currentPlanId && intent.mealPlanId !== currentPlanId) {
      return false;
    }
    if (!intent.targetWindow) {
      return true;
    }
    return normalizeText(intent.targetWindow).includes(normalizeText(weekStart));
  }

  private async maybeRegenerateGroceryPlanForIntent(
    intent: GroceryIntentRecord,
    provenance: MutationProvenance,
  ): Promise<void> {
    const weekStart = await this.resolveGroceryIntentWeekStart(intent);
    if (!weekStart) {
      return;
    }
    const existingGroceryPlan = await this.getGroceryPlan(weekStart);
    if (!existingGroceryPlan) {
      return;
    }
    const mealPlan = await this.getPlanByWeek(weekStart);
    if (!mealPlan) {
      return;
    }
    await this.generateGroceryPlan({ weekStart, provenance });
  }

  private async resolveGroceryIntentWeekStart(intent: GroceryIntentRecord): Promise<string | null> {
    if (intent.mealPlanId) {
      const plan = await this.getPlanById(intent.mealPlanId);
      if (plan?.weekStart) {
        return plan.weekStart;
      }
    }
    const explicitWindow = intent.targetWindow?.trim() ?? '';
    if (!explicitWindow) {
      return null;
    }
    const isoDateMatch = explicitWindow.match(/\d{4}-\d{2}-\d{2}/);
    return isoDateMatch?.[0] ?? null;
  }

  private startOfWeekIso(dateString: string): string {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().slice(0, 10);
  }

  private isStaleCartAction(action: GroceryPlanActionRecord): boolean {
    if (action.actionStatus !== 'in_cart') {
      return false;
    }
    const metadata = asRecord(action.metadata);
    if (metadata?.kind !== 'browser_cart_sync') {
      return false;
    }
    const shoppingSession = asRecord(metadata.shoppingSession);
    const expiresAt = typeof shoppingSession?.expiresAt === 'string' ? shoppingSession.expiresAt : null;
    return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
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

  private shouldRefreshInventoryFromCoveredAction(metadata: unknown): boolean {
    const record = asRecord(metadata);
    const lifecycle = asRecord(record?.fluentLifecycle) ?? asRecord(record?.lifecycle);
    return record?.rememberInventory === true || lifecycle?.rememberInventory === true;
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
         ON CONFLICT(tenant_id, recipe_id) DO UPDATE SET
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
    if (this.personFactsReader) {
      const facts = await this.personFactsReader({ consumerDomain: 'meals', host: resolveHostFamily() });
      // Canonical dietary-safety guidance for shipping hosts is fluent_get_context MealsHardConstraints, not this legacy planner overlay.
      preferences.raw.core_rules = overlayPersonFactsOntoCoreRules(asRecord(preferences.raw.core_rules) ?? {}, facts);
    }

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

  private async mealRecipesHaveTenantId(): Promise<boolean> {
    this.mealRecipesTenantColumnExistsPromise ??= this.db
      .prepare(`SELECT COUNT(*) AS count FROM pragma_table_info('meal_recipes') WHERE name = 'tenant_id'`)
      .first<{ count: number | string | null }>()
      .then((row) => Number(row?.count ?? 0) > 0)
      .catch(() => false);
    return this.mealRecipesTenantColumnExistsPromise;
  }
}

function sqliteIntegerOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

function sqliteBoolean(value: unknown): 0 | 1 {
  return value === true ? 1 : 0;
}

function hydrateRecipeDocumentFromColumns(recipe: MealRecipeRecord): unknown {
  const columnBackfill: Record<string, unknown> = {
    id: recipe.id,
    meal_type: recipe.mealType || 'unknown',
    name: recipe.name,
    status: recipe.status || 'active',
  };
  if (recipe.servings != null) {
    columnBackfill.servings = recipe.servings;
  }
  if (recipe.totalTimeMinutes != null) {
    columnBackfill.total_time = recipe.totalTimeMinutes;
  }
  if (recipe.activeTimeMinutes != null) {
    columnBackfill.active_time = recipe.activeTimeMinutes;
  }

  return {
    ...columnBackfill,
    ...(recipe.raw && typeof recipe.raw === 'object' && !Array.isArray(recipe.raw) ? recipe.raw as Record<string, unknown> : {}),
  };
}

function isMissingMealPreferencesError(error: unknown): boolean {
  return error instanceof Error && /Missing Fluent meal preferences/i.test(error.message);
}

function slugifyForRecipeId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'recipe';
}

function deriveRecipeBookMemoryStatus(currentStatus: string | null, action: ApplyRecipeBookActionInput['action']): string {
  switch (action) {
    case 'favorite':
      return 'proven';
    case 'want_to_try':
      return 'trial';
    case 'not_for_us':
      return 'retired';
    case 'pin_to_week':
      return currentStatus ?? 'observed';
  }
}

