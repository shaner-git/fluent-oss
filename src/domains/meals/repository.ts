import type { MutationProvenance } from '../../auth';
import { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from '../../fluent-core';
import type { FluentDatabase } from '../../storage';
import { dateStringForTimeZone, shiftDateString, torontoTimeZone, weekdayForDateInTimeZone } from '../../time';
import {
  mapGroceryIntentRow,
  mapInventoryRow,
  mapMealFeedbackRow,
  normalizeDayLabel,
  normalizeText,
  safeParse,
  stringifyJson,
} from './helpers';
import type {
  DomainEventRecord,
  FeedbackValue,
  GroceryIntentRecord,
  InventoryRecord,
  MealFeedbackRecord,
  MealPlanEntryRecord,
  MealPlanRecord,
} from './types';
import { asNonEmptyString, asRecord } from './helpers';
import { normalizeCalendarContext, normalizeGeneratePlanOverrides, normalizeTrainingContext } from './planning';
import { deriveTrainingAlignmentSummary } from './summaries';
import type { PersistedMealPlanCandidateRecord, PersistedMealPlanGenerationRecord } from './types-extra';

export class MealsRepository {
  constructor(private readonly db: FluentDatabase) {}

  async currentDateString(): Promise<string> {
    return dateStringForTimeZone(await this.getProfileTimeZone());
  }

  async getProfileTimeZone(): Promise<string> {
    const row = await this.db
      .prepare(`SELECT timezone FROM fluent_profile WHERE tenant_id = ? AND profile_id = ?`)
      .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID)
      .first<{ timezone: string | null }>();

    return row?.timezone?.trim() || torontoTimeZone();
  }

  async dateToWeekday(date: string): Promise<string> {
    return weekdayForDateInTimeZone(date, await this.getProfileTimeZone());
  }

  async filterEntriesForDate(entries: MealPlanEntryRecord[], date: string): Promise<MealPlanEntryRecord[]> {
    const day = await this.dateToWeekday(date);
    return entries.filter((entry) => {
      if (entry.date) return entry.date === date;
      const normalized = normalizeDayLabel(entry.dayLabel);
      if (!normalized) return false;
      if (normalized === 'weekdays') return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(day);
      if (normalized === 'week') return true;
      return normalized === day;
    });
  }

  async getPlanById(planId: string): Promise<MealPlanRecord | null> {
    const planRow = await this.db
      .prepare(
        `SELECT id, week_start, week_end, status, generated_at, approved_at, profile_owner,
                requirements_json, summary_json, source_snapshot_json, created_at, updated_at
         FROM meal_plans
         WHERE id = ?`,
      )
      .bind(planId)
      .first<{
        id: string;
        week_start: string;
        week_end: string | null;
        status: string;
        generated_at: string | null;
        approved_at: string | null;
        profile_owner: string | null;
        requirements_json: string | null;
        summary_json: string | null;
        source_snapshot_json: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();

    if (!planRow) return null;

    const entriesResult = await this.db
      .prepare(
        `SELECT id, date, day_label, meal_type, recipe_id, recipe_name_snapshot, selection_status,
                serves, prep_minutes, total_minutes, leftovers_expected, instructions_snapshot_json,
                notes_json, status, cooked_at, updated_at
         FROM meal_plan_entries
         WHERE meal_plan_id = ?
         ORDER BY COALESCE(date, '9999-12-31') ASC, meal_type ASC, id ASC`,
      )
      .bind(planId)
      .all<{
        id: string;
        date: string | null;
        day_label: string | null;
        meal_type: string;
        recipe_id: string | null;
        recipe_name_snapshot: string;
        selection_status: string | null;
        serves: number | null;
        prep_minutes: number | null;
        total_minutes: number | null;
        leftovers_expected: number | null;
        instructions_snapshot_json: string | null;
        notes_json: string | null;
        status: string | null;
        cooked_at: string | null;
        updated_at: string | null;
      }>();

    const plan: MealPlanRecord = {
      id: planRow.id,
      weekStart: planRow.week_start,
      weekEnd: planRow.week_end,
      status: planRow.status,
      generatedAt: planRow.generated_at,
      approvedAt: planRow.approved_at,
      profileOwner: planRow.profile_owner,
      requirements: safeParse(planRow.requirements_json),
      summary: safeParse(planRow.summary_json),
      sourceSnapshot: safeParse(planRow.source_snapshot_json),
      createdAt: planRow.created_at,
      updatedAt: planRow.updated_at,
      trainingAlignmentSummary: {
        trainingContextUsed: false,
        trainingDays: [],
        sessionLoadByDay: {},
        nutritionSupportMode: null,
        weekComplexity: null,
        planningBiasesApplied: [],
      },
      entries: (entriesResult.results ?? []).map((row) => ({
        id: row.id,
        date: row.date,
        dayLabel: row.day_label,
        mealType: row.meal_type,
        recipeId: row.recipe_id,
        recipeNameSnapshot: row.recipe_name_snapshot,
        selectionStatus: row.selection_status,
        serves: row.serves,
        prepMinutes: row.prep_minutes,
        totalMinutes: row.total_minutes,
        leftoversExpected: Boolean(row.leftovers_expected),
        instructionsSnapshot: safeParse(row.instructions_snapshot_json),
        notes: safeParse(row.notes_json),
        status: row.status,
        cookedAt: row.cooked_at,
        updatedAt: row.updated_at,
      })),
    };

    plan.trainingAlignmentSummary = deriveTrainingAlignmentSummary(plan);
    return plan;
  }

  async getFeedbackForDate(date: string, mealPlanId?: string | null): Promise<MealFeedbackRecord[]> {
    const statement = mealPlanId
      ? this.db
          .prepare(
            `SELECT id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty, time_reality,
                    repeat_again, family_acceptance, notes, submitted_by, source_agent, source_skill,
                    session_id, confidence, source_type, created_at
             FROM meal_feedback
             WHERE date = ? AND meal_plan_id = ?
             ORDER BY created_at DESC`,
          )
          .bind(date, mealPlanId)
      : this.db
          .prepare(
            `SELECT id, meal_plan_id, meal_plan_entry_id, recipe_id, date, taste, difficulty, time_reality,
                    repeat_again, family_acceptance, notes, submitted_by, source_agent, source_skill,
                    session_id, confidence, source_type, created_at
             FROM meal_feedback
             WHERE date = ?
             ORDER BY created_at DESC`,
          )
          .bind(date);

    const result = await statement.all<{
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

  async lookupInventoryByNormalizedName(normalizedName: string): Promise<InventoryRecord | null> {
    const record = await this.db
      .prepare(
        `SELECT id, name, normalized_name, status, source, confirmed_at, purchased_at,
                estimated_expiry, perishability, long_life_default, canonical_item_key, canonical_quantity,
                canonical_unit, canonical_confidence, quantity, unit, location, brand, cost_cad,
                metadata_json
         FROM meal_inventory_items
         WHERE normalized_name = ?`,
      )
      .bind(normalizedName)
      .first<{
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

    return record ? mapInventoryRow(record) : null;
  }

  async getGroceryIntentById(id: string): Promise<GroceryIntentRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, normalized_name, display_name, quantity, unit, notes, status, target_window,
                meal_plan_id, metadata_json, source_agent, source_skill, session_id,
                confidence, source_type, created_at, updated_at
         FROM grocery_intents
         WHERE id = ?`,
      )
      .bind(id)
      .first<any>();
    return row ? mapGroceryIntentRow(row) : null;
  }

  async getLatestOpenIntentByName(normalizedName: string): Promise<GroceryIntentRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, normalized_name, display_name, quantity, unit, notes, status, target_window,
                meal_plan_id, metadata_json, source_agent, source_skill, session_id,
                confidence, source_type, created_at, updated_at
         FROM grocery_intents
         WHERE normalized_name = ?
           AND status NOT IN ('completed', 'deleted', 'archived')
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .bind(normalizedName)
      .first<any>();
    return row ? mapGroceryIntentRow(row) : null;
  }

  async getBrandPreferences(): Promise<Map<string, string[]>> {
    const result = await this.db
      .prepare(
        `SELECT item_family, brand
         FROM meal_brand_preferences
         ORDER BY item_family ASC, evidence_count DESC, brand ASC`,
      )
      .all<{ item_family: string; brand: string }>();

    const preferences = new Map<string, string[]>();
    for (const row of result.results ?? []) {
      const key = normalizeText(row.item_family);
      const next = preferences.get(key) ?? [];
      if (!next.includes(row.brand)) {
        next.push(row.brand);
        preferences.set(key, next);
      }
    }
    return preferences;
  }

  async recordDomainEvent(input: {
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
        'meals',
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

  async getPlanGeneration(generationId: string): Promise<PersistedMealPlanGenerationRecord | null> {
    const row = await this.db
      .prepare(`SELECT raw_json FROM meal_plan_generations WHERE id = ?`)
      .bind(generationId)
      .first<{ raw_json: string | null }>();

    if (!row?.raw_json) return null;
    const parsed = asRecord(safeParse(row.raw_json));
    if (!parsed) return null;

    return {
      id: asNonEmptyString(parsed.id) ?? generationId,
      weekStart: asNonEmptyString(parsed.weekStart) ?? '',
      inputHash: asNonEmptyString(parsed.inputHash) ?? '',
      createdAt: asNonEmptyString(parsed.createdAt) ?? '',
      overrides: normalizeGeneratePlanOverrides(asRecord(parsed.overrides) ?? null),
      calendarContext: normalizeCalendarContext(
        asRecord(parsed.calendarContext ?? parsed.calendar_context),
        asNonEmptyString(parsed.weekStart) ?? '',
      ),
      trainingContext: normalizeTrainingContext(asRecord(parsed.trainingContext ?? parsed.training_context)),
      candidates: Array.isArray(parsed.candidates)
        ? parsed.candidates.reduce<PersistedMealPlanCandidateRecord[]>((accumulator, entry) => {
            const record = asRecord(entry);
            const summary = asRecord(record?.summary);
            const candidateId = asNonEmptyString(record?.candidateId);
            if (!record || !summary || !candidateId) return accumulator;
            accumulator.push({
              candidateId,
              plan: record.plan ?? null,
              summary: summary as any,
            });
            return accumulator;
          }, [])
        : [],
    };
  }

  async listRecentRecipeIds(excludedWeekStart: string, lookbackDays: number): Promise<string[]> {
    const earliestWeekStart = shiftDateString(excludedWeekStart, -Math.max(1, lookbackDays));
    const result = await this.db
      .prepare(
        `SELECT e.recipe_id, MAX(p.week_start) AS latest_week_start, MAX(COALESCE(e.updated_at, p.updated_at, p.created_at)) AS latest_updated_at
         FROM meal_plan_entries e
         INNER JOIN meal_plans p ON p.id = e.meal_plan_id
         WHERE e.recipe_id IS NOT NULL
           AND p.week_start <> ?
           AND p.week_start >= ?
           AND p.status IN ('active', 'approved', 'draft')
         GROUP BY e.recipe_id
         ORDER BY latest_week_start DESC, latest_updated_at DESC`,
      )
      .bind(excludedWeekStart, earliestWeekStart)
      .all<{ recipe_id: string }>();

    return (result.results ?? []).map((row) => row.recipe_id);
  }
}
