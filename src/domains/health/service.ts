import type { MutationProvenance } from '../../auth';
import { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from '../../fluent-core';
import type { FluentDatabase } from '../../storage';
import { shiftDateString } from '../../time';
import {
  asNumber,
  asRecord,
  dayLabelForDate,
  normalizeBoundedDayCount,
  normalizeDateString,
  normalizeGoalStatus,
  normalizeGoalTitle,
  normalizeGoalType,
  normalizeHealthPreferences,
  normalizeMetricType,
  normalizeSessionLength,
  normalizeStringArray,
  normalizeText,
  pickTrainingDayOffsets,
  safeParse,
  stringifyJson,
} from './helpers';
import {
  buildHealthMutationAck,
  summarizeHealthBlock,
  summarizeHealthBlockProjection,
  summarizeHealthBlockReview,
  summarizeHealthContext,
  summarizeHealthPreferences,
  summarizeHealthReviewContext,
  summarizeHealthTodayContext,
  summarizeWorkoutLog,
} from './summaries';
import type {
  DomainEventRecord,
  HealthBlockProjectionRecord,
  HealthBlockProjectionSessionRecord,
  HealthBlockReviewRecord,
  HealthBlockStateRecord,
  HealthBodyMetricRecord,
  HealthBodyMetricType,
  HealthConditioningBlockRecord,
  HealthContextRecord,
  HealthBlockSummaryRecord,
  HealthGoalRecord,
  HealthMetricSignalRecord,
  HealthNutritionSupportMode,
  HealthPlanEntryDetailsRecord,
  HealthReviewContextRecord,
  HealthSessionBlockRecord,
  HealthSessionLoadHint,
  HealthSupportLevel,
  HealthTodayContextRecord,
  HealthTrainingBlockRecord,
  HealthTrainingBlockSessionRecord,
  HealthTrainingSupportSummaryRecord,
  HealthWorkoutLogRecord,
} from './types';
import type {
  ListBodyMetricsFilters,
  ListWorkoutLogsFilters,
  LogBodyMetricInput,
  LogWorkoutInput,
  RecordHealthBlockReviewInput,
  UpdateHealthPreferencesInput,
  UpsertHealthBlockInput,
  UpsertHealthGoalInput,
} from './types-extra';

export {
  buildHealthMutationAck,
  summarizeHealthBlock,
  summarizeHealthBlockProjection,
  summarizeHealthBlockReview,
  summarizeHealthContext,
  summarizeHealthPreferences,
  summarizeHealthReviewContext,
  summarizeHealthTodayContext,
  summarizeWorkoutLog,
};
export * from './types';
export * from './types-extra';

export class HealthService {
  constructor(private readonly db: FluentDatabase) {}

  async getPreferences() {
    const row = await this.db
      .prepare(
        `SELECT tenant_id, profile_id, version, raw_json, updated_at
         FROM health_preferences
         WHERE tenant_id = ? AND profile_id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID)
      .first<{
        tenant_id: string;
        profile_id: string;
        version: number | string | null;
        raw_json: string | null;
        updated_at: string | null;
      }>();

    return {
      profileId: row?.profile_id ?? FLUENT_OWNER_PROFILE_ID,
      raw: normalizeHealthPreferences(safeParse(row?.raw_json)),
      tenantId: row?.tenant_id ?? FLUENT_PRIMARY_TENANT_ID,
      updatedAt: row?.updated_at ?? null,
      version: typeof row?.version === 'number' ? row.version : Number(row?.version ?? 1),
    };
  }

  async updatePreferences(input: UpdateHealthPreferencesInput) {
    const before = await this.getPreferences();
    const normalized = normalizeHealthPreferences(input.preferences);
    const version = before.updatedAt ? before.version + 1 : 1;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO health_preferences (
          tenant_id, profile_id, version, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, profile_id) DO UPDATE SET
          version = excluded.version,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        FLUENT_PRIMARY_TENANT_ID,
        FLUENT_OWNER_PROFILE_ID,
        version,
        JSON.stringify(normalized),
        before.updatedAt ?? now,
        now,
      )
      .run();

    const after = await this.getPreferences();
    await this.recordDomainEvent({
      after: summarizeHealthPreferences(after),
      before: before.updatedAt ? summarizeHealthPreferences(before) : null,
      entityId: `${after.tenantId}:${after.profileId}`,
      entityType: 'health_preferences',
      eventType: before.updatedAt ? 'health.preferences_updated' : 'health.preferences_created',
      provenance: input.provenance,
    });

    return after;
  }

  async listGoals(status?: string | null): Promise<HealthGoalRecord[]> {
    const normalizedStatus = normalizeText(status);
    const statement = normalizedStatus
      ? this.db
          .prepare(
            `SELECT id, goal_type, title, target_value, target_unit, deadline, status, notes, created_at, updated_at
             FROM health_goals
             WHERE tenant_id = ? AND profile_id = ? AND status = ?
             ORDER BY
               CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'achieved' THEN 2 ELSE 3 END,
               updated_at DESC`,
          )
          .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID, normalizedStatus)
      : this.db
          .prepare(
            `SELECT id, goal_type, title, target_value, target_unit, deadline, status, notes, created_at, updated_at
             FROM health_goals
             WHERE tenant_id = ? AND profile_id = ?
             ORDER BY
               CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'achieved' THEN 2 ELSE 3 END,
               updated_at DESC`,
          )
          .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID);
    const result = await statement.all<{
      id: string;
      goal_type: string;
      title: string;
      target_value: number | null;
      target_unit: string | null;
      deadline: string | null;
      status: string;
      notes: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>();
    return (result.results ?? []).map((row) => this.mapGoalRow(row));
  }

  async upsertGoal(input: UpsertHealthGoalInput): Promise<HealthGoalRecord> {
    const id = normalizeText(input.id) ?? `health-goal:${crypto.randomUUID()}`;
    const before = await this.getGoalById(id);
    const goalType = normalizeGoalType(input.goalType);
    const title = normalizeGoalTitle(input.title);
    const targetValue = asNumber(input.targetValue);
    const targetUnit = normalizeText(input.targetUnit);
    const deadline = normalizeText(input.deadline);
    const status = normalizeGoalStatus(input.status);
    const notes = normalizeText(input.notes);
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO health_goals (
          tenant_id, profile_id, id, goal_type, title, target_value, target_unit,
          deadline, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          goal_type = excluded.goal_type,
          title = excluded.title,
          target_value = excluded.target_value,
          target_unit = excluded.target_unit,
          deadline = excluded.deadline,
          status = excluded.status,
          notes = excluded.notes,
          updated_at = excluded.updated_at`,
      )
      .bind(
        FLUENT_PRIMARY_TENANT_ID,
        FLUENT_OWNER_PROFILE_ID,
        id,
        goalType,
        title,
        targetValue,
        targetUnit,
        deadline,
        status,
        notes,
        before?.createdAt ?? now,
        now,
      )
      .run();

    const after = await this.getGoalById(id);
    if (!after) {
      throw new Error(`Failed to persist health goal ${id}`);
    }

    await this.recordDomainEvent({
      after,
      before,
      entityId: after.id,
      entityType: 'health_goal',
      eventType: before ? 'health.goal_updated' : 'health.goal_created',
      provenance: input.provenance,
    });
    return after;
  }

  async getActiveBlock(today?: string | null): Promise<HealthTrainingBlockRecord | null> {
    const resolvedToday = normalizeDateString(today ?? null, await this.currentDateString());
    const active = await this.db
      .prepare(
        `SELECT id
         FROM health_training_blocks
         WHERE tenant_id = ? AND profile_id = ?
           AND status IN ('active', 'paused')
           AND start_date <= ?
         ORDER BY
           CASE status WHEN 'active' THEN 0 ELSE 1 END,
           start_date DESC,
           updated_at DESC
         LIMIT 1`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID, resolvedToday)
      .first<{ id: string }>();

    if (active?.id) {
      return this.getBlockById(active.id);
    }

    const fallback = await this.db
      .prepare(
        `SELECT id
         FROM health_training_blocks
         WHERE tenant_id = ? AND profile_id = ?
         ORDER BY start_date DESC, updated_at DESC
         LIMIT 1`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID)
      .first<{ id: string }>();

    return fallback?.id ? this.getBlockById(fallback.id) : null;
  }

  async getBlock(blockId: string): Promise<HealthTrainingBlockRecord | null> {
    return this.getBlockById(blockId);
  }

  async upsertBlock(input: UpsertHealthBlockInput): Promise<HealthTrainingBlockRecord> {
    const preferences = await this.getPreferences();
    const activeGoal = input.goalId ? await this.getGoalById(input.goalId) : (await this.listGoals('active'))[0] ?? null;
    const startDate = normalizeDateString(input.startDate ?? null, await this.currentDateString());
    const durationWeeks = Math.max(1, Math.min(Math.trunc(asNumber(input.durationWeeks) ?? 8), 16));
    const endDate = shiftDateString(startDate, durationWeeks * 7 - 1);
    const daysPerWeek =
      normalizeBoundedDayCount(input.daysPerWeek) ??
      normalizeBoundedDayCount((preferences.raw.days_per_week as number | null | undefined) ?? null) ??
      3;
    const sessionLengthMinutes =
      normalizeSessionLength(input.sessionLengthMinutes) ??
      normalizeSessionLength((preferences.raw.session_length_minutes as number | null | undefined) ?? null) ??
      45;
    const equipmentAccess =
      normalizeText(input.equipmentAccess) ??
      normalizeText(preferences.raw.equipment_access as string | null | undefined) ??
      'general gym';
    const trainingExperience = normalizeText(preferences.raw.training_experience as string | null | undefined) ?? 'beginner';
    const trainingSplit = normalizeSplitPreference(
      normalizeText(input.trainingSplit) ?? normalizeText(preferences.raw.training_split as string | null | undefined),
    );
    const id = normalizeText(input.id) ?? `health-block:${startDate}`;
    const existing = await this.getBlockById(id);
    const name =
      normalizeText(input.name) ??
      (activeGoal ? `${activeGoal.title} Block` : `Training Block starting ${startDate}`);
    const status = normalizeBlockStatus(input.status);
    const notes = normalizeText(input.notes);
    const constraints = normalizeStringArray(input.constraints);
    const progressionStrategy =
      normalizeText(input.progressionStrategy) ??
      'Adherence-driven progression based on consistent completion, not detailed load tracking.';
    const deloadStrategy =
      normalizeText(input.deloadStrategy) ??
      'Suggest a lighter week or simplified projection when adherence or recovery trends deteriorate.';
    const generatedSessions = buildSessionBlueprints({
      daysPerWeek,
      goalType: activeGoal?.goalType ?? 'general_fitness',
      trainingSplit,
      trainingExperience,
    }).map((session, index) => ({
      details: buildGeneratedEntryDetails(session, {
        equipmentAccess,
        preferences,
        sessionLengthMinutes,
        trainingExperience,
      }),
      estimatedMinutes: sessionLengthMinutes,
      id: `health-block-session:${id}:${index + 1}`,
      loadHint: session.loadHint,
      notes:
        session.recoveryNote ??
        (normalizeStringArray(preferences.raw.recovery_preferences).length > 0
          ? `Recovery focus: ${normalizeStringArray(preferences.raw.recovery_preferences).join(', ')}.`
          : null),
      raw: {
        focus: session.focus,
        structure: session.structure,
      },
      sequenceIndex: index,
      sessionType: session.type,
      title: session.title,
      weekPattern: null as string | null,
    }));
    const explicitSessions =
      input.sessions?.map((session, index) => ({
        details: normalizePlanEntryDetails(session.details),
        estimatedMinutes: normalizeSessionLength(session.estimatedMinutes) ?? sessionLengthMinutes,
        id: normalizeText(session.id) ?? `health-block-session:${id}:${index + 1}`,
        loadHint: normalizeSessionLoadHint(session.loadHint),
        notes: normalizeText(session.notes),
        raw: {
          details: session.details ?? null,
          loadHint: normalizeSessionLoadHint(session.loadHint),
          weekPattern: normalizeText(session.weekPattern),
        },
        sequenceIndex: Math.max(0, Math.trunc(asNumber(session.sequenceIndex) ?? index)),
        sessionType: normalizeText(session.sessionType),
        title: normalizeGoalTitle(session.title),
        weekPattern: normalizeText(session.weekPattern),
      })) ?? [];
    const sessions = (explicitSessions.length > 0 ? explicitSessions : generatedSessions).sort(
      (left, right) => left.sequenceIndex - right.sequenceIndex,
    );
    const rationale = [
      `Built a ${durationWeeks}-week block because training benefits from continuity across weeks.`,
      `Split preference is ${trainingSplit ?? 'not explicitly set'}, with ${daysPerWeek} sessions per week.`,
      `Session length is capped around ${sessionLengthMinutes} minutes and equipment access is treated as ${equipmentAccess}.`,
      activeGoal
        ? `The block is anchored to the active goal: ${activeGoal.title}.`
        : 'The block is anchored to a general fitness objective because no active goal is set yet.',
      'Progression is adherence-driven rather than load-driven so Health can coexist cleanly with external trackers.',
    ];
    if (constraints.length > 0) {
      rationale.push(`Constraints carried into the block: ${constraints.join('; ')}`);
    }
    if (notes) {
      rationale.push(`Planner notes carried into the block: ${notes}`);
    }

    const summary = {
      daysPerWeek,
      durationWeeks,
      equipmentAccess,
      sessionCount: sessions.length,
      sessionLengthMinutes,
      startDate,
      trainingSplit,
    };
    const raw = {
      constraints,
      days_per_week: daysPerWeek,
      deload_strategy: deloadStrategy,
      duration_weeks: durationWeeks,
      equipment_access: equipmentAccess,
      goal_id: activeGoal?.id ?? normalizeText(input.goalId),
      notes,
      progression_strategy: progressionStrategy,
      session_length_minutes: sessionLengthMinutes,
      sessions: sessions.map((session) => ({
        details: session.details,
        estimated_minutes: session.estimatedMinutes,
        id: session.id,
        load_hint: session.loadHint,
        notes: session.notes,
        sequence_index: session.sequenceIndex,
        session_type: session.sessionType,
        title: session.title,
        week_pattern: session.weekPattern,
      })),
      training_split: trainingSplit,
    };
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO health_training_blocks (
          tenant_id, profile_id, id, goal_id, start_date, end_date, duration_weeks, status, name,
          training_split, days_per_week, session_length_minutes, equipment_access, progression_strategy,
          deload_strategy, summary_json, rationale_json, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          goal_id = excluded.goal_id,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          duration_weeks = excluded.duration_weeks,
          status = excluded.status,
          name = excluded.name,
          training_split = excluded.training_split,
          days_per_week = excluded.days_per_week,
          session_length_minutes = excluded.session_length_minutes,
          equipment_access = excluded.equipment_access,
          progression_strategy = excluded.progression_strategy,
          deload_strategy = excluded.deload_strategy,
          summary_json = excluded.summary_json,
          rationale_json = excluded.rationale_json,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        FLUENT_PRIMARY_TENANT_ID,
        FLUENT_OWNER_PROFILE_ID,
        id,
        activeGoal?.id ?? normalizeText(input.goalId),
        startDate,
        endDate,
        durationWeeks,
        status,
        name,
        trainingSplit,
        daysPerWeek,
        sessionLengthMinutes,
        equipmentAccess,
        progressionStrategy,
        deloadStrategy,
        stringifyJson(summary),
        stringifyJson(rationale),
        JSON.stringify(raw),
        existing?.createdAt ?? now,
        now,
      )
      .run();

    await this.db
      .prepare(`DELETE FROM health_block_sessions WHERE tenant_id = ? AND block_id = ?`)
      .bind(FLUENT_PRIMARY_TENANT_ID, id)
      .run();

    for (const session of sessions) {
      await this.db
        .prepare(
          `INSERT INTO health_block_sessions (
            tenant_id, block_id, id, sequence_index, week_pattern, title, session_type,
            estimated_minutes, load_hint, notes, details_json, raw_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          FLUENT_PRIMARY_TENANT_ID,
          id,
          session.id,
          session.sequenceIndex,
          session.weekPattern,
          session.title,
          session.sessionType,
          session.estimatedMinutes,
          session.loadHint,
          session.notes,
          stringifyJson(session.details),
          JSON.stringify(session.raw),
          now,
        )
        .run();
    }

    await this.db
      .prepare(
        `INSERT INTO health_block_state (
          tenant_id, profile_id, block_id, active_week_index, next_session_index, last_completed_session_id,
          last_completed_date, last_completion, paused, deload, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, block_id) DO UPDATE SET
          paused = excluded.paused,
          updated_at = excluded.updated_at`,
      )
      .bind(
        FLUENT_PRIMARY_TENANT_ID,
        FLUENT_OWNER_PROFILE_ID,
        id,
        existing ? (await this.getBlockState(id))?.activeWeekIndex ?? 0 : 0,
        existing ? (await this.getBlockState(id))?.nextSessionIndex ?? 0 : 0,
        existing ? (await this.getBlockState(id))?.lastCompletedSessionId ?? null : null,
        existing ? (await this.getBlockState(id))?.lastCompletedDate ?? null : null,
        existing ? (await this.getBlockState(id))?.lastCompletion ?? null : null,
        status === 'paused' ? 1 : 0,
        0,
        stringifyJson({ notes, status }),
        existing ? (await this.getBlockState(id))?.createdAt ?? now : now,
        now,
      )
      .run();

    const after = await this.getBlockById(id);
    if (!after) {
      throw new Error(`Failed to persist health block ${id}`);
    }

    await this.recordDomainEvent({
      after: summarizeHealthBlock(after),
      before: existing ? summarizeHealthBlock(existing) : null,
      entityId: after.id,
      entityType: 'health_training_block',
      eventType: existing ? 'health.training_block_updated' : 'health.training_block_created',
      provenance: input.provenance,
    });

    return after;
  }

  async getBlockProjection(options: { blockId?: string | null; date?: string | null; weekStart?: string | null } = {}): Promise<HealthBlockProjectionRecord | null> {
    const resolvedDate = normalizeDateString(options.date ?? null, await this.currentDateString());
    const block = options.blockId ? await this.getBlockById(options.blockId) : await this.getActiveBlock(resolvedDate);
    if (!block) {
      return null;
    }
    const state = await this.getBlockState(block.id);
    const preferences = await this.getPreferences();
    const activeGoals = await this.listGoals('active');
    const weekStart = normalizeDateString(options.weekStart ?? null, weekStartForDate(resolvedDate));
    const weekEnd = shiftDateString(weekStart, 6);
    const baseSessions = buildBlockWeekProjection({
      block,
      state,
      weekStart,
    });
    const workoutLogs = await this.listWorkoutLogs({ dateFrom: weekStart, dateTo: weekEnd, limit: 100 });
    const latestBySessionDate = new Map<string, HealthWorkoutLogRecord>();
    for (const log of workoutLogs) {
      const key = `${log.blockSessionId ?? 'none'}:${log.date}`;
      if (!latestBySessionDate.has(key)) {
        latestBySessionDate.set(key, log);
      }
    }
    const sessions = baseSessions.map((session) => {
      const log = latestBySessionDate.get(`${session.blockSessionId}:${session.date}`) ?? null;
      return {
        ...session,
        status: log ? (log.completion === 'full' ? 'completed' : log.completion) : session.status,
      };
    });
    const projectedTodaySession = sessions.find((session) => session.date === resolvedDate) ?? null;
    const resolvedSession = resolveNextBlockSession({
      block,
      projectedTodaySession,
      state,
      today: resolvedDate,
      weekSessions: sessions,
    });
    const nextTrainingDate =
      sessions.find((session) => session.date >= resolvedDate && session.blockSessionId === (resolvedSession?.blockSessionId ?? session.blockSessionId))
        ?.date ??
      sessions.find((session) => session.date >= resolvedDate)?.date ??
      null;

    return {
      activeWeekIndex: state?.activeWeekIndex ?? clampWeekIndex(block, weekStart),
      block: summarizeHealthBlock(block),
      blockState: state,
      nextTrainingDate,
      projectedTodaySession,
      resolvedSession,
      sessions,
      trainingSupportSummary: this.buildTrainingSupportSummary({
        activeGoals,
        block,
        preferences,
        projectedSessions: sessions,
      }),
      weekEnd,
      weekStart,
    };
  }

  async recordBlockReview(input: RecordHealthBlockReviewInput): Promise<HealthBlockReviewRecord> {
    const reviewDate = normalizeDateString(input.reviewDate ?? null, await this.currentDateString());
    const projection = await this.getBlockProjection({
      blockId: normalizeText(input.blockId),
      date: reviewDate,
      weekStart: input.weekStart,
    });
    const blockId = projection?.block?.id ?? normalizeText(input.blockId);
    if (!blockId) {
      throw new Error('An active Health block is required before recording a block review.');
    }
    const weekStart = projection?.weekStart ?? normalizeText(input.weekStart) ?? null;
    const weekEnd = weekStart ? shiftDateString(weekStart, 6) : null;
    const id = `health-block-review:${blockId}:${reviewDate}`;
    const before = await this.getBlockReviewById(id);
    const summary = normalizeText(input.summary);
    const worked = normalizeStringArray(input.worked);
    const struggled = normalizeStringArray(input.struggled);
    const adjustments = normalizeStringArray(input.adjustments);
    const nextFocus = normalizeText(input.nextFocus);
    const nextBlockConfidence = deriveBlockConfidence({
      loggedWorkoutCount: projection?.sessions.filter((session) => session.status !== 'planned').length ?? 0,
      plannedSessionCount: projection?.sessions.length ?? 0,
      skippedSessionCount: projection?.sessions.filter((session) => session.status === 'skipped').length ?? 0,
    }, adjustments.length);
    const raw = {
      adjustments,
      next_block_confidence: nextBlockConfidence,
      next_focus: nextFocus,
      review_date: reviewDate,
      struggled,
      summary,
      week_end: weekEnd,
      week_start: weekStart,
      worked,
    };
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO health_block_reviews (
          tenant_id, profile_id, id, block_id, review_date, week_start, week_end, summary,
          worked_json, struggled_json, adjustments_json, next_focus, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          review_date = excluded.review_date,
          week_start = excluded.week_start,
          week_end = excluded.week_end,
          summary = excluded.summary,
          worked_json = excluded.worked_json,
          struggled_json = excluded.struggled_json,
          adjustments_json = excluded.adjustments_json,
          next_focus = excluded.next_focus,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        FLUENT_PRIMARY_TENANT_ID,
        FLUENT_OWNER_PROFILE_ID,
        id,
        blockId,
        reviewDate,
        weekStart,
        weekEnd,
        summary,
        JSON.stringify(worked),
        JSON.stringify(struggled),
        JSON.stringify(adjustments),
        nextFocus,
        JSON.stringify(raw),
        before?.createdAt ?? now,
        now,
      )
      .run();

    const after = await this.getBlockReviewById(id);
    if (!after) {
      throw new Error(`Failed to persist health block review ${id}`);
    }

    await this.recordDomainEvent({
      after: summarizeHealthBlockReview(after),
      before: before ? summarizeHealthBlockReview(before) : null,
      entityId: after.id,
      entityType: 'health_block_review',
      eventType: before ? 'health.block_review_updated' : 'health.block_review_created',
      provenance: input.provenance,
    });

    return after;
  }


  async listWorkoutLogs(filters: ListWorkoutLogsFilters = {}): Promise<HealthWorkoutLogRecord[]> {
    const limit = Math.max(1, Math.min(filters.limit ?? 25, 200));
    const where: string[] = ['tenant_id = ?', 'profile_id = ?'];
    const bindings: unknown[] = [FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID];
    if (normalizeText(filters.dateFrom)) {
      where.push('date >= ?');
      bindings.push(normalizeText(filters.dateFrom));
    }
    if (normalizeText(filters.dateTo)) {
      where.push('date <= ?');
      bindings.push(normalizeText(filters.dateTo));
    }
    bindings.push(limit);
    const result = await this.db
      .prepare(
        `SELECT id, date, plan_id, plan_entry_id, block_id, block_session_id, title_snapshot, completion, duration_minutes,
                energy_level, soreness_level, notes, raw_json, source_agent, source_skill,
                session_id, confidence, source_type, created_at, updated_at
         FROM health_workout_logs
         WHERE ${where.join(' AND ')}
         ORDER BY date DESC, created_at DESC
         LIMIT ?`,
      )
      .bind(...bindings)
      .all<{
        id: string;
        date: string;
        plan_id: string | null;
        plan_entry_id: string | null;
        block_id: string | null;
        block_session_id: string | null;
        title_snapshot: string | null;
        completion: string;
        duration_minutes: number | null;
        energy_level: string | null;
        soreness_level: string | null;
        notes: string | null;
        raw_json: string | null;
        source_agent: string | null;
        source_skill: string | null;
        session_id: string | null;
        confidence: number | null;
        source_type: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();

    return (result.results ?? []).map((row) => this.mapWorkoutLogRow(row));
  }

  async logWorkout(input: LogWorkoutInput): Promise<HealthWorkoutLogRecord> {
    const date = normalizeDateString(input.date ?? null, await this.currentDateString());
    const id = `health-workout-log:${crypto.randomUUID()}`;
    const completion = normalizeWorkoutCompletion(input.completion);
    const durationMinutes = normalizeSessionLength(input.durationMinutes);
    const energyLevel = normalizeHealthScale(input.energyLevel, ['low', 'okay', 'good', 'great'] as const);
    const sorenessLevel = normalizeHealthScale(input.sorenessLevel, ['low', 'moderate', 'high'] as const);
    const notes = normalizeText(input.notes);
    const details = asRecord(input.details) ?? {};
    const resolvedBlockProjection =
      normalizeText(input.blockId) || normalizeText(input.blockSessionId)
        ? await this.getBlockProjection({ blockId: normalizeText(input.blockId), date })
        : await this.getBlockProjection({ date });
    const resolvedBlockSession =
      normalizeText(input.blockSessionId)
        ? resolvedBlockProjection?.sessions.find((session) => session.blockSessionId === normalizeText(input.blockSessionId)) ?? null
        : resolvedBlockProjection?.resolvedSession ?? null;
    const blockId = normalizeText(input.blockId) ?? resolvedBlockProjection?.block?.id ?? null;
    const blockSessionId = normalizeText(input.blockSessionId) ?? resolvedBlockSession?.blockSessionId ?? null;
    const titleSnapshot = normalizeText(input.title) ?? resolvedBlockSession?.title ?? null;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO health_workout_logs (
          tenant_id, profile_id, id, date, plan_id, plan_entry_id, block_id, block_session_id, title_snapshot, completion,
          duration_minutes, energy_level, soreness_level, notes, raw_json, source_agent,
          source_skill, session_id, confidence, source_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        FLUENT_PRIMARY_TENANT_ID,
        FLUENT_OWNER_PROFILE_ID,
        id,
        date,
        null,
        null,
        blockId,
        blockSessionId,
        titleSnapshot,
        completion,
        durationMinutes,
        energyLevel,
        sorenessLevel,
        notes,
        JSON.stringify(details),
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
        now,
        now,
      )
      .run();

    if (blockId && blockSessionId) {
      const block = await this.getBlockById(blockId);
      const state = await this.getBlockState(blockId);
      if (block && state && block.sessions.length > 0) {
        const sessionIndex = block.sessions.findIndex((session) => session.id === blockSessionId);
        const nextSessionIndex = sessionIndex >= 0 ? (sessionIndex + 1) % block.sessions.length : state.nextSessionIndex;
        await this.db
          .prepare(
            `UPDATE health_block_state
             SET active_week_index = ?, next_session_index = ?, last_completed_session_id = ?,
                 last_completed_date = ?, last_completion = ?, paused = 0, updated_at = ?
             WHERE tenant_id = ? AND block_id = ?`,
          )
          .bind(
            clampWeekIndex(block, weekStartForDate(date)),
            nextSessionIndex,
            blockSessionId,
            date,
            completion,
            now,
            FLUENT_PRIMARY_TENANT_ID,
            blockId,
          )
          .run();
      }
    }

    const after = await this.getWorkoutLogById(id);
    if (!after) {
      throw new Error(`Failed to read back health workout log ${id}`);
    }

    await this.recordDomainEvent({
      after: summarizeWorkoutLog(after),
      before: null,
      entityId: after.id,
      entityType: 'health_workout_log',
      eventType: 'health.workout_logged',
      provenance: input.provenance,
    });
    return after;
  }

  async listBodyMetrics(filters: ListBodyMetricsFilters = {}): Promise<HealthBodyMetricRecord[]> {
    const limit = Math.max(1, Math.min(filters.limit ?? 25, 200));
    const metricType = filters.metricType ? normalizeMetricType(filters.metricType) : null;
    const statement = metricType
      ? this.db
          .prepare(
            `SELECT id, date, metric_type, value, value2, unit, notes, source, source_agent, source_skill,
                    session_id, confidence, source_type, created_at
             FROM health_body_metrics
             WHERE tenant_id = ? AND profile_id = ? AND metric_type = ?
             ORDER BY date DESC, created_at DESC
             LIMIT ?`,
          )
          .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID, metricType, limit)
      : this.db
          .prepare(
            `SELECT id, date, metric_type, value, value2, unit, notes, source, source_agent, source_skill,
                    session_id, confidence, source_type, created_at
             FROM health_body_metrics
             WHERE tenant_id = ? AND profile_id = ?
             ORDER BY date DESC, created_at DESC
             LIMIT ?`,
          )
          .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID, limit);
    const result = await statement.all<{
      id: string;
      date: string;
      metric_type: string;
      value: number | null;
      value2: number | null;
      unit: string | null;
      notes: string | null;
      source: string | null;
      source_agent: string | null;
      source_skill: string | null;
      session_id: string | null;
      confidence: number | null;
      source_type: string | null;
      created_at: string | null;
    }>();

    return (result.results ?? []).map((row) => this.mapBodyMetricRow(row));
  }

  async logBodyMetric(input: LogBodyMetricInput): Promise<HealthBodyMetricRecord> {
    const id = `health-body-metric:${crypto.randomUUID()}`;
    const date = normalizeDateString(input.date ?? null, await this.currentDateString());
    const metricType = normalizeMetricType(input.metricType);
    const value = asNumber(input.value);
    const value2 = asNumber(input.value2);
    const unit = normalizeText(input.unit);
    const notes = normalizeText(input.notes);
    const source = normalizeText(input.source) ?? 'manual';
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO health_body_metrics (
          tenant_id, profile_id, id, date, metric_type, value, value2, unit,
          notes, source, source_agent, source_skill, session_id, confidence, source_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        FLUENT_PRIMARY_TENANT_ID,
        FLUENT_OWNER_PROFILE_ID,
        id,
        date,
        metricType,
        value,
        value2,
        unit,
        notes,
        source,
        input.provenance.sourceAgent,
        input.provenance.sourceSkill,
        input.provenance.sessionId,
        input.provenance.confidence,
        input.provenance.sourceType,
        now,
      )
      .run();

    const after = await this.getBodyMetricById(id);
    if (!after) {
      throw new Error(`Failed to persist health body metric ${id}`);
    }

    await this.recordDomainEvent({
      after,
      before: null,
      entityId: after.id,
      entityType: 'health_body_metric',
      eventType: 'health.body_metric_logged',
      provenance: input.provenance,
    });
    return after;
  }

  async getReviewContext(weekStart?: string | null): Promise<HealthReviewContextRecord> {
    const resolvedWeekStart = await this.resolveWeekStart(weekStart);
    const weekEnd = shiftDateString(resolvedWeekStart, 6);
    const [preferences, activeGoals, activeBlock, latestMetrics, metricSignals, workoutLogs] = await Promise.all([
      this.getPreferences(),
      this.listGoals('active'),
      this.getActiveBlock(resolvedWeekStart),
      this.getLatestMetricsMap(),
      this.buildMetricSignals(),
      this.listWorkoutLogs({ dateFrom: resolvedWeekStart, dateTo: weekEnd, limit: 100 }),
    ]);
    const blockState = activeBlock ? await this.getBlockState(activeBlock.id) : null;
    const blockProjection = activeBlock
      ? await this.getBlockProjection({ blockId: activeBlock.id, weekStart: resolvedWeekStart, date: resolvedWeekStart })
      : null;
    const blockReview = activeBlock ? await this.getMostRecentBlockReview(activeBlock.id, weekEnd) : null;
    const projectedSessions = blockProjection?.sessions ?? [];
    const latestWorkoutBySession = new Map<string, HealthWorkoutLogRecord>();
    for (const log of workoutLogs) {
      const key = `${log.blockSessionId ?? 'none'}:${log.date}`;
      if (!latestWorkoutBySession.has(key)) {
        latestWorkoutBySession.set(key, log);
      }
    }
    const completedEntryCount = Array.from(latestWorkoutBySession.values()).filter((entry) => entry.completion === 'full').length;
    const partialEntryCount = Array.from(latestWorkoutBySession.values()).filter((entry) => entry.completion === 'partial').length;
    const skippedEntryCount = Array.from(latestWorkoutBySession.values()).filter((entry) => entry.completion === 'skipped').length;
    const remainingEntryCount = Math.max(0, projectedSessions.length - latestWorkoutBySession.size);
    const loadDistribution = buildProjectedLoadDistribution(projectedSessions);
    const trainingSupportSummary = this.buildTrainingSupportSummary({
      activeGoals,
      block: activeBlock,
      preferences,
      projectedSessions,
    });

    return {
      activeGoals,
      activeBlock: summarizeHealthBlock(activeBlock),
      adherenceSummary: {
        completedSessions: completedEntryCount,
        loggedWorkouts: workoutLogs.length,
        partialSessions: partialEntryCount,
        plannedSessions: projectedSessions.length,
        remainingSessions: remainingEntryCount,
        skippedSessions: skippedEntryCount,
      },
      blockProjection,
      blockReview,
      blockState,
      completedEntryCount,
      domain: 'health',
      loadDistribution,
      latestMetrics,
      metricSignals,
      loggedFullCount: workoutLogs.filter((entry) => entry.completion === 'full').length,
      loggedPartialCount: workoutLogs.filter((entry) => entry.completion === 'partial').length,
      loggedSkippedCount: workoutLogs.filter((entry) => entry.completion === 'skipped').length,
      loggedWorkoutCount: workoutLogs.length,
      partialEntryCount,
      plannedEntryCount: projectedSessions.length,
      remainingEntryCount,
      skippedEntryCount,
      trainingSupportSummary,
      weekEnd,
      weekStart: resolvedWeekStart,
      workoutLogs,
    };
  }

  async getContext(today?: string | null): Promise<HealthContextRecord> {
    const resolvedToday = normalizeDateString(today ?? null, await this.currentDateString());
    const [preferences, activeGoals, activeBlock, recentWorkouts, latestMetrics] = await Promise.all([
      this.getPreferences(),
      this.listGoals('active'),
      this.getActiveBlock(resolvedToday),
      this.listWorkoutLogs({
        dateFrom: shiftDateString(resolvedToday, -14),
        limit: 50,
      }),
      this.getLatestMetricsMap(),
    ]);
    const blockState = activeBlock ? await this.getBlockState(activeBlock.id) : null;
    const blockProjection = activeBlock
      ? await this.getBlockProjection({ blockId: activeBlock.id, date: resolvedToday })
      : null;

    return {
      activeGoals,
      activeBlock: summarizeHealthBlock(activeBlock),
      blockState,
      domain: 'health',
      lastWorkoutDate: recentWorkouts[0]?.date ?? null,
      latestMetrics,
      preferencesReady: preferences.updatedAt !== null,
      recentWorkoutCount: recentWorkouts.length,
      trainingSupportSummary: this.buildTrainingSupportSummary({
        activeGoals,
        block: activeBlock,
        preferences,
        projectedSessions: blockProjection?.sessions ?? [],
      }),
    };
  }

  async getTodayContext(date?: string | null): Promise<HealthTodayContextRecord> {
    const resolvedDate = normalizeDateString(date ?? null, await this.currentDateString());
    const [preferences, activeBlock, activeGoals, loggedWorkouts, latestMetrics] = await Promise.all([
      this.getPreferences(),
      this.getActiveBlock(resolvedDate),
      this.listGoals('active'),
      this.listWorkoutLogs({ dateFrom: resolvedDate, dateTo: resolvedDate, limit: 20 }),
      this.getLatestMetricsMap(),
    ]);
    const blockState = activeBlock ? await this.getBlockState(activeBlock.id) : null;
    const projection = activeBlock ? await this.getBlockProjection({ blockId: activeBlock.id, date: resolvedDate }) : null;

    return {
      activeGoals,
      activeBlock: summarizeHealthBlock(activeBlock),
      blockState,
      date: resolvedDate,
      latestMetrics,
      loggedWorkouts,
      nextTrainingDate: projection?.nextTrainingDate ?? null,
      projectedSession: projection?.projectedTodaySession ?? null,
      resolvedSession: projection?.resolvedSession ?? null,
      trainingSupportSummary: this.buildTrainingSupportSummary({
        activeGoals,
        block: activeBlock,
        preferences,
        projectedSessions: projection?.sessions ?? [],
      }),
    };
  }

  private buildTrainingSupportSummary(input: {
    activeGoals: HealthGoalRecord[];
    block: HealthTrainingBlockRecord | null;
    preferences: Awaited<ReturnType<HealthService['getPreferences']>>;
    projectedSessions: Array<Pick<HealthBlockProjectionSessionRecord, 'date' | 'details' | 'sessionType' | 'title'>>;
  }): HealthTrainingSupportSummaryRecord {
    const goalType = input.activeGoals[0]?.goalType ?? null;
    const planEntries = input.projectedSessions;
    const trainingDays = Array.from(new Set(planEntries.map((entry) => entry.date))).sort();
    const sessionLoadByDay = Object.fromEntries(
      trainingDays.map((date) => {
        const entry = planEntries.find((candidate) => candidate.date === date) ?? null;
        return [date, entry ? inferEntryLoadHint(entry) : 'moderate'];
      }),
    ) as Record<string, HealthSessionLoadHint>;
    const daysPerWeek =
      trainingDays.length ||
      normalizeBoundedDayCount((input.preferences.raw.days_per_week as number | null | undefined) ?? null) ||
      0;
    const hardDayCount = Object.values(sessionLoadByDay).filter((value) => value === 'hard').length;
    const sessionLengthMinutes =
      normalizeSessionLength((input.preferences.raw.session_length_minutes as number | null | undefined) ?? null) ?? 45;
    const weekComplexity = deriveTrainingWeekComplexity(daysPerWeek, hardDayCount, sessionLengthMinutes);
    const nutritionSupportMode = deriveNutritionSupportMode(goalType, weekComplexity, hardDayCount);

    return {
      daysPerWeek,
      goalType,
      nutritionSupportMode,
      sessionLoadByDay,
      trainingDays,
      weekComplexity,
    };
  }

  private async buildMetricSignals(): Promise<HealthMetricSignalRecord[]> {
    const metrics = await this.listBodyMetrics({ limit: 40 });
    const latestByType = new Map<HealthBodyMetricRecord['metricType'], HealthBodyMetricRecord[]>();
    for (const metric of metrics) {
      const existing = latestByType.get(metric.metricType) ?? [];
      if (existing.length < 2) {
        existing.push(metric);
        latestByType.set(metric.metricType, existing);
      }
    }

    return Array.from(latestByType.entries())
      .map(([metricType, entries]) => summarizeMetricSignal(metricType, entries[0] ?? null, entries[1] ?? null))
      .filter((entry): entry is HealthMetricSignalRecord => Boolean(entry));
  }

  async listDomainEvents(limit = 50): Promise<DomainEventRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT id, domain, entity_type, entity_id, event_type, before_json, after_json, patch_json,
                source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name, created_at
         FROM domain_events
         WHERE domain = 'health'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(Math.max(1, Math.min(limit, 200)))
      .all<{
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
      actorEmail: row.actor_email,
      actorName: row.actor_name,
      after: safeParse(row.after_json),
      before: safeParse(row.before_json),
      confidence: row.confidence,
      createdAt: row.created_at,
      domain: row.domain,
      entityId: row.entity_id,
      entityType: row.entity_type,
      eventType: row.event_type,
      id: row.id,
      patch: safeParse(row.patch_json),
      sessionId: row.session_id,
      sourceAgent: row.source_agent,
      sourceSkill: row.source_skill,
      sourceType: row.source_type,
    }));
  }

  private async getBlockById(id: string): Promise<HealthTrainingBlockRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, goal_id, start_date, end_date, duration_weeks, status, name, training_split, days_per_week,
                session_length_minutes, equipment_access, progression_strategy, deload_strategy,
                summary_json, rationale_json, raw_json, created_at, updated_at
         FROM health_training_blocks
         WHERE tenant_id = ? AND profile_id = ? AND id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID, id)
      .first<{
        id: string;
        goal_id: string | null;
        start_date: string;
        end_date: string;
        duration_weeks: number | string | null;
        status: string;
        name: string;
        training_split: string | null;
        days_per_week: number | string | null;
        session_length_minutes: number | null;
        equipment_access: string | null;
        progression_strategy: string | null;
        deload_strategy: string | null;
        summary_json: string | null;
        rationale_json: string | null;
        raw_json: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();
    if (!row) {
      return null;
    }

    const sessionRows = await this.db
      .prepare(
        `SELECT id, sequence_index, week_pattern, title, session_type, estimated_minutes, load_hint,
                notes, details_json, raw_json, updated_at
         FROM health_block_sessions
         WHERE tenant_id = ? AND block_id = ?
         ORDER BY sequence_index ASC, id ASC`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, id)
      .all<{
        id: string;
        sequence_index: number | string | null;
        week_pattern: string | null;
        title: string;
        session_type: string | null;
        estimated_minutes: number | null;
        load_hint: string | null;
        notes: string | null;
        details_json: string | null;
        raw_json: string | null;
        updated_at: string | null;
      }>();

    return {
      createdAt: row.created_at,
      daysPerWeek: normalizeBoundedDayCount(row.days_per_week) ?? 3,
      deloadStrategy: row.deload_strategy,
      durationWeeks: Number(row.duration_weeks ?? 8),
      endDate: row.end_date,
      equipmentAccess: row.equipment_access,
      goalId: row.goal_id,
      id: row.id,
      name: row.name,
      progressionStrategy: row.progression_strategy,
      rationale: safeParse(row.rationale_json),
      raw: (safeParse(row.raw_json) as Record<string, unknown>) ?? {},
      sessionLengthMinutes: row.session_length_minutes,
      sessions: (sessionRows.results ?? []).map((session) => this.mapBlockSessionRow(row.id, session)),
      startDate: row.start_date,
      status: normalizeBlockStatus(row.status),
      summary: safeParse(row.summary_json),
      trainingSplit: row.training_split,
      updatedAt: row.updated_at,
    };
  }

  private async getBlockState(blockId: string): Promise<HealthBlockStateRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT block_id, active_week_index, next_session_index, last_completed_session_id, last_completed_date,
                last_completion, paused, deload, raw_json, created_at, updated_at
         FROM health_block_state
         WHERE tenant_id = ? AND block_id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, blockId)
      .first<{
        block_id: string;
        active_week_index: number | string | null;
        next_session_index: number | string | null;
        last_completed_session_id: string | null;
        last_completed_date: string | null;
        last_completion: string | null;
        paused: number | string | null;
        deload: number | string | null;
        raw_json: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();
    if (!row) {
      return null;
    }

    return {
      activeWeekIndex: Math.max(0, Math.trunc(Number(row.active_week_index ?? 0))),
      blockId: row.block_id,
      createdAt: row.created_at,
      deload: Number(row.deload ?? 0) === 1,
      lastCompletedDate: row.last_completed_date,
      lastCompletedSessionId: row.last_completed_session_id,
      lastCompletion: normalizeWorkoutCompletionNullable(row.last_completion),
      nextSessionIndex: Math.max(0, Math.trunc(Number(row.next_session_index ?? 0))),
      paused: Number(row.paused ?? 0) === 1,
      raw: (safeParse(row.raw_json) as Record<string, unknown>) ?? {},
      updatedAt: row.updated_at,
    };
  }

  private async getBlockReviewById(id: string): Promise<HealthBlockReviewRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, block_id, review_date, week_start, week_end, summary, worked_json, struggled_json,
                adjustments_json, next_focus, raw_json, created_at, updated_at
         FROM health_block_reviews
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, id)
      .first<{
        id: string;
        block_id: string;
        review_date: string;
        week_start: string | null;
        week_end: string | null;
        summary: string | null;
        worked_json: string | null;
        struggled_json: string | null;
        adjustments_json: string | null;
        next_focus: string | null;
        raw_json: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();
    return row ? this.mapBlockReviewRow(row) : null;
  }

  private async getMostRecentBlockReview(blockId: string, beforeOrOnDate?: string | null): Promise<HealthBlockReviewRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id
         FROM health_block_reviews
         WHERE tenant_id = ? AND profile_id = ? AND block_id = ?
           AND (? IS NULL OR review_date <= ?)
         ORDER BY review_date DESC, updated_at DESC
         LIMIT 1`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, FLUENT_OWNER_PROFILE_ID, blockId, beforeOrOnDate ?? null, beforeOrOnDate ?? null)
      .first<{ id: string }>();
    return row?.id ? this.getBlockReviewById(row.id) : null;
  }

  private async getGoalById(id: string): Promise<HealthGoalRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, goal_type, title, target_value, target_unit, deadline, status, notes, created_at, updated_at
         FROM health_goals
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, id)
      .first<{
        id: string;
        goal_type: string;
        title: string;
        target_value: number | null;
        target_unit: string | null;
        deadline: string | null;
        status: string;
        notes: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();
    return row ? this.mapGoalRow(row) : null;
  }

  private async getWorkoutLogById(id: string): Promise<HealthWorkoutLogRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, date, plan_id, plan_entry_id, block_id, block_session_id, title_snapshot, completion, duration_minutes,
                energy_level, soreness_level, notes, raw_json, source_agent, source_skill,
                session_id, confidence, source_type, created_at, updated_at
         FROM health_workout_logs
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, id)
      .first<{
        id: string;
        date: string;
        plan_id: string | null;
        plan_entry_id: string | null;
        block_id: string | null;
        block_session_id: string | null;
        title_snapshot: string | null;
        completion: string;
        duration_minutes: number | null;
        energy_level: string | null;
        soreness_level: string | null;
        notes: string | null;
        raw_json: string | null;
        source_agent: string | null;
        source_skill: string | null;
        session_id: string | null;
        confidence: number | null;
        source_type: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>();
    return row ? this.mapWorkoutLogRow(row) : null;
  }

  private async getBodyMetricById(id: string): Promise<HealthBodyMetricRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, date, metric_type, value, value2, unit, notes, source, source_agent, source_skill,
                session_id, confidence, source_type, created_at
         FROM health_body_metrics
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(FLUENT_PRIMARY_TENANT_ID, id)
      .first<{
        id: string;
        date: string;
        metric_type: string;
        value: number | null;
        value2: number | null;
        unit: string | null;
        notes: string | null;
        source: string | null;
        source_agent: string | null;
        source_skill: string | null;
        session_id: string | null;
        confidence: number | null;
        source_type: string | null;
        created_at: string | null;
      }>();
    return row ? this.mapBodyMetricRow(row) : null;
  }

  private async getLatestMetricsMap(): Promise<Partial<Record<HealthBodyMetricType, HealthBodyMetricRecord>>> {
    const metrics = await this.listBodyMetrics({ limit: 100 });
    const latest: Partial<Record<HealthBodyMetricType, HealthBodyMetricRecord>> = {};
    for (const metric of metrics) {
      if (!latest[metric.metricType]) {
        latest[metric.metricType] = metric;
      }
    }
    return latest;
  }

  private async resolveWeekStart(weekStart?: string | null): Promise<string> {
    if (normalizeText(weekStart)) {
      return normalizeDateString(weekStart);
    }

    const today = await this.currentDateString();
    return weekStartForDate(today);
  }

  private mapGoalRow(row: {
    id: string;
    goal_type: string;
    title: string;
    target_value: number | null;
    target_unit: string | null;
    deadline: string | null;
    status: string;
    notes: string | null;
    created_at: string | null;
    updated_at: string | null;
  }): HealthGoalRecord {
    return {
      createdAt: row.created_at,
      deadline: row.deadline,
      goalType: normalizeGoalType(row.goal_type),
      id: row.id,
      notes: row.notes,
      status: normalizeGoalStatus(row.status),
      targetUnit: row.target_unit,
      targetValue: row.target_value,
      title: row.title,
      updatedAt: row.updated_at,
    };
  }

  private mapBlockSessionRow(
    blockId: string,
    row: {
      id: string;
      sequence_index: number | string | null;
      week_pattern: string | null;
      title: string;
      session_type: string | null;
      estimated_minutes: number | null;
      load_hint: string | null;
      notes: string | null;
      details_json: string | null;
      raw_json: string | null;
      updated_at: string | null;
    },
  ): HealthTrainingBlockSessionRecord {
    return {
      blockId,
      details: normalizePlanEntryDetails(safeParse(row.details_json)),
      estimatedMinutes: row.estimated_minutes,
      id: row.id,
      loadHint: normalizeSessionLoadHint(row.load_hint),
      notes: row.notes,
      raw: (safeParse(row.raw_json) as Record<string, unknown>) ?? {},
      sequenceIndex: Math.max(0, Math.trunc(Number(row.sequence_index ?? 0))),
      sessionType: row.session_type,
      title: row.title,
      updatedAt: row.updated_at,
      weekPattern: row.week_pattern,
    };
  }

  private mapWorkoutLogRow(row: {
    id: string;
    date: string;
    plan_id: string | null;
    plan_entry_id: string | null;
    block_id: string | null;
    block_session_id: string | null;
    title_snapshot: string | null;
    completion: string;
    duration_minutes: number | null;
    energy_level: string | null;
    soreness_level: string | null;
    notes: string | null;
    raw_json: string | null;
    source_agent: string | null;
    source_skill: string | null;
    session_id: string | null;
    confidence: number | null;
    source_type: string | null;
    created_at: string | null;
    updated_at: string | null;
  }): HealthWorkoutLogRecord {
    return {
      blockId: row.block_id,
      blockSessionId: row.block_session_id,
      completion: normalizeWorkoutCompletion(row.completion),
      confidence: row.confidence,
      createdAt: row.created_at,
      date: row.date,
      durationMinutes: row.duration_minutes,
      energyLevel: normalizeHealthScale(row.energy_level, ['low', 'okay', 'good', 'great'] as const),
      id: row.id,
      notes: row.notes,
      raw: (safeParse(row.raw_json) as Record<string, unknown>) ?? {},
      sessionId: row.session_id,
      sorenessLevel: normalizeHealthScale(row.soreness_level, ['low', 'moderate', 'high'] as const),
      sourceAgent: row.source_agent,
      sourceSkill: row.source_skill,
      sourceType: row.source_type,
      titleSnapshot: row.title_snapshot,
      updatedAt: row.updated_at,
    };
  }

  private mapBlockReviewRow(row: {
    id: string;
    block_id: string;
    review_date: string;
    week_start: string | null;
    week_end: string | null;
    summary: string | null;
    worked_json: string | null;
    struggled_json: string | null;
    adjustments_json: string | null;
    next_focus: string | null;
    raw_json: string | null;
    created_at: string | null;
    updated_at: string | null;
  }): HealthBlockReviewRecord {
    const raw = (safeParse(row.raw_json) as Record<string, unknown>) ?? {};
    return {
      adjustments: normalizeStringArray(safeParse(row.adjustments_json)),
      blockId: row.block_id,
      createdAt: row.created_at,
      id: row.id,
      nextBlockConfidence: normalizeSupportLevel(raw.next_block_confidence),
      nextFocus: row.next_focus,
      raw,
      reviewDate: row.review_date,
      struggled: normalizeStringArray(safeParse(row.struggled_json)),
      summary: row.summary,
      updatedAt: row.updated_at,
      weekEnd: row.week_end,
      weekStart: row.week_start,
      worked: normalizeStringArray(safeParse(row.worked_json)),
    };
  }

  private mapBodyMetricRow(row: {
    id: string;
    date: string;
    metric_type: string;
    value: number | null;
    value2: number | null;
    unit: string | null;
    notes: string | null;
    source: string | null;
    source_agent: string | null;
    source_skill: string | null;
    session_id: string | null;
    confidence: number | null;
    source_type: string | null;
    created_at: string | null;
  }): HealthBodyMetricRecord {
    return {
      confidence: row.confidence,
      createdAt: row.created_at,
      date: row.date,
      id: row.id,
      metricType: normalizeMetricType(row.metric_type),
      notes: row.notes,
      sessionId: row.session_id,
      source: row.source,
      sourceAgent: row.source_agent,
      sourceSkill: row.source_skill,
      sourceType: row.source_type,
      unit: row.unit,
      value: row.value,
      value2: row.value2,
    };
  }

  private async recordDomainEvent(input: {
    after: unknown;
    before: unknown;
    entityId: string | null;
    entityType: string;
    eventType: string;
    provenance: MutationProvenance;
  }) {
    await this.db
      .prepare(
        `INSERT INTO domain_events (
          id, domain, entity_type, entity_id, event_type,
          before_json, after_json, patch_json,
          source_agent, source_skill, session_id, confidence, source_type, actor_email, actor_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `domain-event:${crypto.randomUUID()}`,
        'health',
        input.entityType,
        input.entityId,
        input.eventType,
        stringifyJson(input.before),
        stringifyJson(input.after),
        stringifyJson({ eventType: input.eventType }),
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

  private async currentDateString(): Promise<string> {
    const row = await this.db.prepare(`SELECT DATE('now') AS today`).first<{ today: string }>();
    return row?.today ?? new Date().toISOString().slice(0, 10);
  }
}

function normalizeWorkoutCompletion(value: unknown): HealthWorkoutLogRecord['completion'] {
  return value === 'partial' || value === 'skipped' ? value : 'full';
}

function normalizeWorkoutCompletionNullable(value: unknown): HealthWorkoutLogRecord['completion'] | null {
  return value === 'full' || value === 'partial' || value === 'skipped' ? value : null;
}

function normalizeBlockStatus(value: unknown): HealthTrainingBlockRecord['status'] {
  return value === 'draft' || value === 'paused' || value === 'completed' || value === 'archived' ? value : 'active';
}

function normalizeHealthScale<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && allowed.includes(value) ? (value as T[number]) : null;
}

interface SessionBlueprint {
  title: string;
  type: string;
  focus: string;
  structure: string;
  loadHint: HealthSessionLoadHint;
  recoveryNote?: string;
}

function buildSessionBlock(
  label: string,
  exercises: string[],
  sets: string,
  reps: string,
  notes?: string | null,
): HealthSessionBlockRecord {
  return {
    exercises,
    label,
    notes: normalizeText(notes),
    reps,
    sets,
  };
}

function normalizePlanEntryDetails(value: unknown): HealthPlanEntryDetailsRecord | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const normalizeBlock = (entry: unknown): HealthSessionBlockRecord | null => {
    const block = asRecord(entry);
    const label = normalizeText(block?.label as string | null | undefined);
    const sets = normalizeText(block?.sets as string | null | undefined);
    const reps = normalizeText(block?.reps as string | null | undefined);
    const exercises = normalizeStringArray(block?.exercises);
    if (!label || !sets || !reps || exercises.length === 0) {
      return null;
    }
    return {
      exercises,
      label,
      notes: normalizeText(block?.notes as string | null | undefined),
      reps,
      sets,
    };
  };

  const conditioningBlock = asRecord(raw.conditioningBlock);

  return {
    coachNotes: normalizeStringArray(raw.coachNotes),
    conditioningBlock: conditioningBlock
      ? {
          durationMinutes: normalizeSessionLength(conditioningBlock.durationMinutes),
          mode: normalizeText(conditioningBlock.mode as string | null | undefined) ?? 'conditioning',
          notes: normalizeText(conditioningBlock.notes as string | null | undefined),
          target: normalizeText(conditioningBlock.target as string | null | undefined),
        }
      : null,
    loadHint: normalizeSessionLoadHint(raw.loadHint),
    mainBlocks: Array.isArray(raw.mainBlocks)
      ? raw.mainBlocks.map(normalizeBlock).filter((entry): entry is HealthSessionBlockRecord => Boolean(entry))
      : [],
    secondaryBlocks: Array.isArray(raw.secondaryBlocks)
      ? raw.secondaryBlocks.map(normalizeBlock).filter((entry): entry is HealthSessionBlockRecord => Boolean(entry))
      : [],
    sessionGoal: normalizeText(raw.sessionGoal as string | null | undefined),
    substitutionHints: normalizeStringArray(raw.substitutionHints),
    warmup: normalizeStringArray(raw.warmup),
  };
}

function buildGeneratedEntryDetails(
  session: SessionBlueprint,
  input: {
    equipmentAccess: string;
    preferences: Awaited<ReturnType<HealthService['getPreferences']>>;
    sessionLengthMinutes: number;
    trainingExperience: string;
  },
): HealthPlanEntryDetailsRecord {
  const notes = normalizeText(input.preferences.raw.notes as string | null | undefined);
  const substitutions = buildSubstitutionHints(session, input.equipmentAccess);
  if (notes?.toLowerCase().includes('goblet squat')) {
    substitutions.unshift('Use goblet squats whenever the main squat pattern does not feel appropriate.');
  }
  if (!input.equipmentAccess.toLowerCase().includes('full')) {
    substitutions.push('If equipment is limited, keep the first main block and one secondary block, then swap to dumbbells or cables.');
  }
  const warmup = buildWarmup(session);
  const mainBlocks = buildMainBlocks(session, input.trainingExperience);
  const secondaryBlocks = buildSecondaryBlocks(session);
  const conditioningBlock = buildConditioningBlock(session, input.sessionLengthMinutes);
  const coachNotes = buildCoachNotes(session, input.sessionLengthMinutes, input.trainingExperience);

  return {
    coachNotes,
    conditioningBlock,
    loadHint: session.loadHint,
    mainBlocks,
    secondaryBlocks,
    sessionGoal: session.focus,
    substitutionHints: Array.from(new Set(substitutions)),
    warmup,
  };
}

function buildLoadDistribution(
  entries: Array<Pick<HealthBlockProjectionSessionRecord, 'details' | 'sessionType' | 'title'>>,
): Record<HealthSessionLoadHint, number> {
  return entries.reduce<Record<HealthSessionLoadHint, number>>(
    (distribution, entry) => {
      distribution[inferEntryLoadHint(entry)] += 1;
      return distribution;
    },
    { light: 0, moderate: 0, hard: 0 },
  );
}

function inferEntryLoadHint(
  entry: Pick<HealthBlockProjectionSessionRecord, 'details' | 'sessionType' | 'title'>,
): HealthSessionLoadHint {
  const explicit = entry.details?.loadHint;
  if (explicit) {
    return explicit;
  }
  const text = `${entry.sessionType ?? ''} ${entry.title}`.toLowerCase();
  if (text.includes('conditioning') || text.includes('cardio') || text.includes('mobility')) {
    return 'light';
  }
  if (text.includes('lower') || text.includes('strength') || text.includes('hybrid')) {
    return 'hard';
  }
  return 'moderate';
}

function normalizeSessionLoadHint(value: unknown): HealthSessionLoadHint {
  return value === 'light' || value === 'hard' ? value : 'moderate';
}

function normalizeSupportLevel(value: unknown): HealthSupportLevel | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function clampWeekIndex(block: Pick<HealthTrainingBlockRecord, 'startDate' | 'durationWeeks'>, weekStart: string): number {
  const start = new Date(`${weekStartForDate(block.startDate)}T12:00:00Z`);
  const target = new Date(`${weekStart}T12:00:00Z`);
  const diffWeeks = Math.max(0, Math.floor((target.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  return Math.max(0, Math.min(block.durationWeeks - 1, diffWeeks));
}

function buildBlockWeekProjection(input: {
  block: HealthTrainingBlockRecord;
  state: HealthBlockStateRecord | null;
  weekStart: string;
}): HealthBlockProjectionSessionRecord[] {
  const blockWeekStart = weekStartForDate(input.block.startDate);
  const weekEnd = shiftDateString(input.weekStart, 6);
  const dayOffsets = pickTrainingDayOffsets(input.block.daysPerWeek);
  const sessions = input.block.sessions.length > 0 ? input.block.sessions : [];
  if (sessions.length === 0) {
    return [];
  }

  const slotIndexBase = countTrainingSlotsBetween(blockWeekStart, input.weekStart, dayOffsets);
  const projected = dayOffsets
    .map((offset, dayIndex) => {
      const date = shiftDateString(input.weekStart, offset);
      if (date < input.block.startDate || date > weekEnd || date > input.block.endDate) {
        return null;
      }
      const session = sessions[(slotIndexBase + dayIndex) % sessions.length]!;
      return {
        blockId: input.block.id,
        blockSessionId: session.id,
        date,
        dayLabel: dayLabelForDate(date),
        details: session.details,
        estimatedMinutes: session.estimatedMinutes,
        notes: session.notes,
        sequenceIndex: session.sequenceIndex,
        sessionType: session.sessionType,
        status: 'planned' as const,
        title: session.title,
      };
    });

  return projected.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function resolveNextBlockSession(input: {
  block: HealthTrainingBlockRecord;
  state: HealthBlockStateRecord | null;
  today: string;
  weekSessions: HealthBlockProjectionSessionRecord[];
  projectedTodaySession: HealthBlockProjectionSessionRecord | null;
}): HealthBlockProjectionSessionRecord | null {
  if (input.block.sessions.length === 0) {
    return null;
  }
  const nextIndex = input.state?.nextSessionIndex ?? 0;
  const targetSession = input.block.sessions[nextIndex % input.block.sessions.length] ?? input.block.sessions[0]!;
  const matchingProjected =
    input.weekSessions.find((session) => session.blockSessionId === targetSession.id && session.date >= input.today) ??
    input.weekSessions.find((session) => session.blockSessionId === targetSession.id) ??
    null;
  return (
    matchingProjected ?? {
      blockId: input.block.id,
      blockSessionId: targetSession.id,
      date: input.projectedTodaySession?.date ?? input.today,
      dayLabel: dayLabelForDate(input.projectedTodaySession?.date ?? input.today),
      details: targetSession.details,
      estimatedMinutes: targetSession.estimatedMinutes,
      notes: targetSession.notes,
      sequenceIndex: targetSession.sequenceIndex,
      sessionType: targetSession.sessionType,
      status: 'planned',
      title: targetSession.title,
    }
  );
}

function countTrainingSlotsBetween(startWeek: string, endWeek: string, dayOffsets: number[]): number {
  if (endWeek <= startWeek) {
    return 0;
  }
  const start = new Date(`${startWeek}T12:00:00Z`);
  const end = new Date(`${endWeek}T12:00:00Z`);
  const diffWeeks = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  return diffWeeks * dayOffsets.length;
}

function buildProjectedLoadDistribution(
  entries: Array<Pick<HealthBlockProjectionSessionRecord, 'details' | 'sessionType' | 'title'>>,
): Record<HealthSessionLoadHint, number> {
  return entries.reduce<Record<HealthSessionLoadHint, number>>(
    (distribution, entry) => {
      distribution[inferEntryLoadHint(entry)] += 1;
      return distribution;
    },
    { light: 0, moderate: 0, hard: 0 },
  );
}

function deriveBlockConfidence(
  counts: {
    plannedSessionCount: number;
    loggedWorkoutCount: number;
    skippedSessionCount: number;
  },
  adjustmentCount: number,
): HealthSupportLevel {
  if (counts.plannedSessionCount === 0) {
    return 'medium';
  }
  const completionRatio = (counts.loggedWorkoutCount - counts.skippedSessionCount * 0.5) / counts.plannedSessionCount;
  if (completionRatio >= 0.75 && adjustmentCount <= 2) {
    return 'high';
  }
  if (completionRatio >= 0.4) {
    return 'medium';
  }
  return 'low';
}

function deriveTrainingWeekComplexity(
  daysPerWeek: number,
  hardDayCount: number,
  sessionLengthMinutes: number,
): HealthSupportLevel {
  if (daysPerWeek >= 5 || hardDayCount >= 2 || sessionLengthMinutes >= 70) {
    return 'high';
  }
  if (daysPerWeek >= 3 || sessionLengthMinutes >= 50) {
    return 'medium';
  }
  return 'low';
}

function deriveNutritionSupportMode(
  goalType: HealthGoalRecord['goalType'] | null,
  weekComplexity: HealthSupportLevel,
  hardDayCount: number,
): HealthNutritionSupportMode {
  if (weekComplexity === 'high') {
    return 'simpler_dinners';
  }
  if (goalType === 'endurance' || hardDayCount >= 2) {
    return 'recovery_support';
  }
  if (goalType === 'fat_loss' || goalType === 'recomp' || goalType === 'muscle_gain' || goalType === 'strength') {
    return 'higher_protein';
  }
  return 'general';
}

function summarizeMetricSignal(
  metricType: HealthBodyMetricType,
  latest: HealthBodyMetricRecord | null,
  previous: HealthBodyMetricRecord | null,
): HealthMetricSignalRecord | null {
  if (!latest) {
    return null;
  }

  let direction: HealthMetricSignalRecord['direction'] = 'new';
  if (previous && latest.value != null && previous.value != null) {
    if (latest.value > previous.value) {
      direction = 'up';
    } else if (latest.value < previous.value) {
      direction = 'down';
    } else {
      direction = 'flat';
    }
  }

  const label = metricType.replace(/_/g, ' ');
  const valueText = latest.value == null ? 'no numeric value' : `${latest.value}${latest.unit ? ` ${latest.unit}` : ''}`;
  const summary =
    direction === 'new' || !previous
      ? `Latest ${label} logged at ${valueText}.`
      : `Latest ${label} is ${direction} versus the prior check-in (${valueText}).`;

  return {
    date: latest.date,
    direction,
    metricType,
    summary,
    unit: latest.unit,
    value: latest.value,
  };
}

function buildWarmup(session: SessionBlueprint): string[] {
  const text = `${session.title} ${session.structure}`.toLowerCase();
  const warmup = ['5 minutes easy cardio'];
  if (text.includes('squat') || text.includes('lower')) {
    warmup.push('Hip and ankle prep');
  }
  if (text.includes('hinge') || text.includes('deadlift')) {
    warmup.push('Hip hinge rehearsal');
  }
  if (text.includes('press') || text.includes('upper') || text.includes('shoulder')) {
    warmup.push('Shoulder prep and ramp-up sets');
  }
  if (text.includes('conditioning') || text.includes('interval')) {
    warmup.push('Dynamic mobility plus two short pickups');
  }
  return Array.from(new Set(warmup));
}

function buildMainBlocks(session: SessionBlueprint, trainingExperience: string): HealthSessionBlockRecord[] {
  const text = `${session.title} ${session.structure}`.toLowerCase();
  if (session.type === 'conditioning' || session.type === 'cardio') {
    return [
      buildSessionBlock(
        'Primary Conditioning Block',
        [session.structure],
        '1',
        trainingExperience === 'beginner' ? '15-20 min' : '20-30 min',
        'Keep the effort sustainable for the whole block.',
      ),
    ];
  }

  const blocks: HealthSessionBlockRecord[] = [];
  if (text.includes('squat')) {
    blocks.push(buildSessionBlock('Primary Lower Pattern', ['Squat or squat-friendly variation'], '3-4', '5-8'));
  }
  if (text.includes('hinge')) {
    blocks.push(buildSessionBlock('Posterior Chain', ['Romanian deadlift, trap-bar pull, or hip thrust'], '3', '6-10'));
  }
  if (text.includes('press')) {
    blocks.push(buildSessionBlock('Primary Press', ['Barbell, dumbbell, or machine press'], '3', '6-10'));
  }
  if (text.includes('row') || text.includes('pull')) {
    blocks.push(buildSessionBlock('Primary Pull', ['Chest-supported row, cable row, or pulldown'], '3', '8-12'));
  }
  if (blocks.length === 0) {
    blocks.push(buildSessionBlock('Primary Work', [session.structure], '3', '8-12'));
  }
  return blocks.slice(0, 2);
}

function buildSecondaryBlocks(session: SessionBlueprint): HealthSessionBlockRecord[] {
  const text = `${session.title} ${session.structure}`.toLowerCase();
  const blocks: HealthSessionBlockRecord[] = [];
  if (text.includes('unilateral') || text.includes('single-leg') || text.includes('split squat')) {
    blocks.push(buildSessionBlock('Single-Leg Support', ['Split squat, lunge, or step-up'], '2-3', '8-12 each side'));
  }
  if (text.includes('arms') || text.includes('shoulders')) {
    blocks.push(buildSessionBlock('Upper Accessories', ['Lateral raise plus curls or pressdowns'], '2-3', '10-15'));
  }
  if (text.includes('carry') || text.includes('core') || text.includes('trunk')) {
    blocks.push(buildSessionBlock('Carry / Trunk', ['Farmer carry, Pallof press, or dead bug'], '2-3', '20-40 m / 8-12'));
  }
  if (blocks.length === 0 && session.type !== 'conditioning' && session.type !== 'cardio') {
    blocks.push(buildSessionBlock('Accessory Support', ['One supportive accessory and one trunk movement'], '2', '8-12'));
  }
  return blocks.slice(0, 2);
}

function buildConditioningBlock(
  session: SessionBlueprint,
  sessionLengthMinutes: number,
): HealthConditioningBlockRecord | null {
  if (session.type === 'conditioning' || session.type === 'cardio') {
    return {
      durationMinutes: Math.min(30, Math.max(12, sessionLengthMinutes - 20)),
      mode: session.type,
      notes: 'Keep the effort repeatable and stop while movement quality is still good.',
      target: session.structure,
    };
  }
  if (session.type === 'hybrid' || session.loadHint === 'hard') {
    return {
      durationMinutes: Math.min(10, Math.max(6, Math.round(sessionLengthMinutes * 0.15))),
      mode: 'finisher',
      notes: 'Optional if recovery is already stretched.',
      target: 'Bike, rower, sled, or short intervals',
    };
  }
  return null;
}

function buildSubstitutionHints(session: SessionBlueprint, equipmentAccess: string): string[] {
  const text = `${session.title} ${session.structure}`.toLowerCase();
  const substitutions: string[] = [];
  if (text.includes('squat')) {
    substitutions.push('Swap the squat pattern for goblet squat, hack squat, or leg press if setup or joints are limiting the day.');
  }
  if (text.includes('press')) {
    substitutions.push('Use dumbbell or machine pressing if barbell setup would slow the session down.');
  }
  if (text.includes('row') || text.includes('pull')) {
    substitutions.push('Any supported row or pulldown is fine if it keeps the session moving.');
  }
  if (!equipmentAccess.toLowerCase().includes('full')) {
    substitutions.push('Bias dumbbells, cables, or bodyweight-friendly options if the full setup is not available.');
  }
  substitutions.push('If time gets tight, keep the first main block and one support block, then stop there.');
  return substitutions;
}

function buildCoachNotes(
  session: SessionBlueprint,
  sessionLengthMinutes: number,
  trainingExperience: string,
): string[] {
  const notes = [
    trainingExperience === 'beginner'
      ? 'Leave one or two reps in reserve and keep the session repeatable next week.'
      : `Keep the session inside ${sessionLengthMinutes} minutes by resting with intent.`,
  ];
  if (session.loadHint === 'hard') {
    notes.push('Protect recovery by trimming accessories before you trim the main work.');
  }
  if (session.type === 'conditioning' || session.type === 'cardio') {
    notes.push('This should support the week, not become another grind.');
  }
  return notes;
}

function buildSessionBlueprints(input: {
  goalType: HealthGoalRecord['goalType'];
  trainingExperience: string;
  daysPerWeek: number;
  trainingSplit: string | null;
}): SessionBlueprint[] {
  const beginner = input.trainingExperience === 'beginner';
  const goal = input.goalType;
  const split = input.trainingSplit;

  if (split === 'full_body_abc' && input.daysPerWeek === 3) {
    return [
      { focus: 'Build full-body strength and muscle with a squat emphasis.', loadHint: 'moderate', structure: 'squat, horizontal press, row, accessories', title: 'Full Body A', type: 'full_body' },
      { focus: 'Bias the week toward a hinge pattern, vertical pressing, and unilateral support.', loadHint: 'moderate', structure: 'hinge, vertical press, pull, unilateral work', title: 'Full Body B', type: 'full_body' },
      { focus: 'Wrap the week with athletic full-body work, accessories, and carries.', loadHint: 'hard', structure: 'single-leg, incline or push-up, posterior chain, carry', title: 'Full Body C', type: 'full_body' },
    ];
  }

  if (split === 'upper_lower_conditioning' && input.daysPerWeek === 3) {
    return [
      { focus: 'Drive upper-body strength and muscle with straightforward push / pull work.', loadHint: 'moderate', structure: 'pressing, rowing, shoulders, arms', title: 'Upper', type: 'upper' },
      { focus: 'Make lower-body work count with one main squat or hinge pattern plus unilateral support.', loadHint: 'hard', structure: 'squat/hinge, unilateral work, trunk', title: 'Lower', type: 'lower' },
      { focus: 'Support recovery and athleticism without adding another hard strength day.', loadHint: 'light', structure: 'intervals, carries, mobility', title: 'Conditioning', type: 'conditioning' },
    ];
  }

  if (split === 'upper_lower' && input.daysPerWeek >= 2) {
    return [
      { focus: 'Build the week around an efficient upper-body push / pull session.', loadHint: 'moderate', structure: 'pressing, rowing, shoulders, arms', title: 'Upper', type: 'upper' },
      { focus: 'Anchor the week with a squat or hinge pattern and enough trunk work to stay durable.', loadHint: 'hard', structure: 'squat/hinge, unilateral work, trunk', title: 'Lower', type: 'lower' },
      { focus: 'Get more upper-body volume without repeating the exact same stress as day one.', loadHint: 'moderate', structure: 'press, pull, shoulders, arms, trunk', title: 'Upper Volume', type: 'upper' },
      { focus: 'Round out the week with lower-body volume and posterior-chain support.', loadHint: 'moderate', structure: 'hinge, squat pattern, unilateral work, calves', title: 'Lower Volume', type: 'lower' },
    ];
  }

  if (goal === 'strength') {
    return [
      { focus: 'Practice one main lower-body lift with enough back-off volume to keep technique sharp.', loadHint: 'hard', structure: 'main lift, secondary lift, brief accessories', title: 'Lower Strength', type: 'strength' },
      { focus: 'Drive pressing and rowing strength with just enough accessory volume to stay balanced.', loadHint: 'moderate', structure: 'main press, row, accessories', title: 'Upper Strength', type: 'strength' },
      { focus: 'Expose the whole body to strength work while staying just under all-out effort.', loadHint: 'moderate', recoveryNote: 'Keep one or two reps in reserve on the final sets.', structure: 'squat/hinge, press/pull, core', title: 'Full Body Strength', type: 'strength' },
      { focus: 'Use a lower-stress session to keep supporting muscles and movement quality moving.', loadHint: 'light', structure: 'single-leg, upper-back, trunk work', title: 'Accessory Strength', type: 'strength' },
    ];
  }

  if (goal === 'fat_loss' || goal === 'recomp') {
    return [
      { focus: 'Keep resistance training as the anchor while adding just enough conditioning to support the goal.', loadHint: 'moderate', structure: 'push, pull, legs, brief conditioning finisher', title: 'Full Body A', type: 'full_body' },
      { focus: 'Build aerobic capacity and recovery support without creating another heavy day.', loadHint: 'light', structure: 'zone 2 or intervals plus mobility', title: 'Conditioning', type: 'conditioning' },
      { focus: 'Revisit full-body resistance work with a hinge and unilateral bias.', loadHint: 'moderate', structure: 'hinge, press, pull, split squat', title: 'Full Body B', type: 'full_body' },
      { focus: 'Blend one or two compound lifts with short conditioning while keeping recovery manageable.', loadHint: 'hard', recoveryNote: 'Keep the conditioning block moderate so recovery stays manageable.', structure: 'compound lifts then short conditioning', title: 'Hybrid Session', type: 'hybrid' },
    ];
  }

  if (goal === 'endurance') {
    return [
      { focus: 'Build aerobic base at a conversational effort.', loadHint: 'light', structure: 'conversational effort cardio', title: 'Base Cardio', type: 'cardio' },
      { focus: 'Touch threshold or interval work without overextending the week.', loadHint: 'hard', structure: 'warm-up, intervals, cool-down', title: 'Intervals', type: 'cardio' },
      { focus: 'Keep enough strength work in place to support running or conditioning goals.', loadHint: 'moderate', structure: 'single-leg, pulling, posterior chain, core', title: 'Strength Support', type: 'strength_support' },
      { focus: 'Accumulate longer aerobic time with steady pacing.', loadHint: 'moderate', structure: 'steady longer duration effort', title: 'Long Session', type: 'cardio' },
    ];
  }

  if (goal === 'muscle_gain') {
    return [
      { focus: 'Accumulate useful upper-body hypertrophy volume with stable exercise choices.', loadHint: 'moderate', structure: 'press, pull, shoulders, arms', title: 'Upper Hypertrophy', type: 'hypertrophy' },
      { focus: 'Accumulate lower-body volume with one main squat pattern and one hinge pattern.', loadHint: 'hard', structure: 'squat pattern, hinge pattern, unilateral work, calves', title: 'Lower Hypertrophy', type: 'hypertrophy' },
      { focus: 'Revisit the upper body with slightly different angles and rep ranges.', loadHint: 'moderate', structure: 'different angles and rep ranges from day one', title: 'Upper Volume', type: 'hypertrophy' },
      { focus: 'Round out the week with posterior-chain and glute / hamstring support.', loadHint: 'moderate', structure: 'hinge, leg press or split squat, hamstrings, calves', title: 'Lower Volume', type: 'hypertrophy' },
    ];
  }

  return beginner
    ? [
        { focus: 'Build familiarity with the main movement patterns and leave the gym feeling capable of repeating the session.', loadHint: 'light', structure: 'squat, push, pull, hinge, carry', title: 'Full Body Foundations', type: 'full_body' },
        { focus: 'Build consistency with easy conditioning and mobility support.', loadHint: 'light', structure: 'easy conditioning plus mobility', title: 'Conditioning + Mobility', type: 'conditioning' },
        { focus: 'Repeat the core patterns with one small progression from the first session.', loadHint: 'moderate', structure: 'repeat patterns with small progressions', title: 'Full Body Progression', type: 'full_body' },
      ]
    : [
        { focus: 'Build a clean upper-body day with simple push / pull pairings.', loadHint: 'moderate', structure: 'pressing, rowing, shoulders, arms', title: 'Upper', type: 'upper' },
        { focus: 'Cover the main lower-body patterns with one hard but controlled lower session.', loadHint: 'hard', structure: 'squat/hinge, unilateral work, trunk', title: 'Lower', type: 'lower' },
        { focus: 'Keep conditioning and athletic support in the plan without turning it into another grind.', loadHint: 'light', structure: 'intervals, carries, mobility', title: 'Conditioning', type: 'conditioning' },
        { focus: 'Use a balanced full-body session as a flexible fourth slot when the week allows it.', loadHint: 'moderate', structure: 'compound lifts and accessories', title: 'Full Body', type: 'full_body' },
      ];
}

function weekStartForDate(date: string): string {
  const anchor = new Date(`${date}T12:00:00Z`);
  const day = anchor.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  anchor.setUTCDate(anchor.getUTCDate() + mondayOffset);
  return anchor.toISOString().slice(0, 10);
}

function normalizeSplitPreference(value: string | null): string | null {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('full body a/b/c') ||
    normalized.includes('full body abc') ||
    normalized.includes('full-body a/b/c') ||
    normalized.includes('full-body abc')
  ) {
    return 'full_body_abc';
  }
  if (
    normalized.includes('upper/lower/conditioning') ||
    normalized.includes('upper lower conditioning')
  ) {
    return 'upper_lower_conditioning';
  }
  if (normalized.includes('upper/lower') || normalized.includes('upper lower')) {
    return 'upper_lower';
  }

  return normalized.replace(/\s+/g, '_');
}

function normalizePlanningStartDate(startDate: string | null | undefined, weekStart: string, weekEnd: string): string {
  const normalized = normalizeText(startDate);
  if (!normalized) {
    return weekStart;
  }
  if (normalized < weekStart) {
    return weekStart;
  }
  if (normalized > weekEnd) {
    return weekEnd;
  }
  return normalized;
}
