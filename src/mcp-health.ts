import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildMutationProvenance, FLUENT_HEALTH_READ_SCOPE, FLUENT_HEALTH_WRITE_SCOPE, requireScope } from './auth';
import {
  buildHealthMutationAck,
  HealthService,
  summarizeHealthBlock,
  summarizeHealthBlockProjection,
  summarizeHealthBlockReview,
  summarizeHealthContext,
  summarizeHealthPreferences,
  summarizeHealthReviewContext,
  summarizeHealthTodayContext,
  summarizeWorkoutLog,
} from './domains/health/service';
import {
  firstTemplateValue,
  iconFor,
  jsonResource,
  provenanceInputSchema,
  readViewSchema,
  toolResult,
  writeResponseModeSchema,
} from './mcp-shared';

const goalTypeSchema = z.enum([
  'fat_loss',
  'muscle_gain',
  'recomp',
  'strength',
  'consistency',
  'endurance',
  'general_fitness',
  'custom',
]);
const goalStatusSchema = z.enum(['active', 'achieved', 'paused', 'abandoned']);
const blockStatusSchema = z.enum(['draft', 'active', 'paused', 'completed', 'archived']);
const workoutCompletionSchema = z.enum(['full', 'partial', 'skipped']);
const energyLevelSchema = z.enum(['low', 'okay', 'good', 'great']);
const sorenessLevelSchema = z.enum(['low', 'moderate', 'high']);
const metricTypeSchema = z.enum(['weight', 'waist', 'body_fat', 'resting_hr', 'sleep_hours', 'custom']);
const loadHintSchema = z.enum(['light', 'moderate', 'hard']);

export function registerHealthMcpSurface(server: McpServer, health: HealthService, origin: string) {
  server.registerResource(
    'health-preferences',
    'fluent://health/preferences',
    {
      description: 'Saved Health preferences for fitness-first planning and logging.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Health Preferences',
    },
    async (uri) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, (await health.getPreferences()).raw);
    },
  );

  server.registerResource(
    'health-context',
    'fluent://health/context',
    {
      description: 'Current Health context including active goals, active block state, and recent activity.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Health Context',
    },
    async (uri) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, await health.getContext());
    },
  );

  server.registerResource(
    'health-today',
    'fluent://health/today',
    {
      description: 'Today’s Health context including the planned session and logged workouts.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Health Today Context',
    },
    async (uri) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, await health.getTodayContext());
    },
  );

  server.registerResource(
    'health-active-block',
    'fluent://health/active-block',
    {
      description: 'The active Health training block with inline session templates.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Active Health Block',
    },
    async (uri) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, await health.getActiveBlock());
    },
  );

  server.registerResource(
    'health-block-projection',
    'fluent://health/block-projection',
    {
      description: 'The current projected Health week derived from the active block.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Health Block Projection',
    },
    async (uri) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, await health.getBlockProjection());
    },
  );

  server.registerResource(
    'health-block-by-id',
    new ResourceTemplate('fluent://health/blocks/{block_id}', { list: undefined }),
    {
      description: 'A saved Health training block by block id.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Health Block By Id',
    },
    async (uri, params) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, await health.getBlock(firstTemplateValue(params.block_id)));
    },
  );

  server.registerResource(
    'health-review-context',
    'fluent://health/review-context',
    {
      description: 'This week’s Health review context including planned sessions, logged workouts, and any saved weekly review.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Health Review Context',
    },
    async (uri) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, await health.getReviewContext());
    },
  );

  server.registerResource(
    'health-goals',
    'fluent://health/goals',
    {
      description: 'Current Health goals for the active Fluent profile.',
      icons: iconFor(origin),
      mimeType: 'application/json',
      title: 'Health Goals',
    },
    async (uri) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      return jsonResource(uri.href, await health.listGoals());
    },
  );

  server.registerTool(
    'health_get_preferences',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'Fetch saved Health preferences for fitness-first planning.',
      inputSchema: {
        view: readViewSchema,
      },
      title: 'Get Health Preferences',
    },
    async ({ view }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const preferences = await health.getPreferences();
      const summary = summarizeHealthPreferences(preferences);
      return toolResult(preferences.raw, {
        structuredContent: view === 'summary' ? summary : undefined,
        textData: view === 'full' ? preferences.raw : summary,
      });
    },
  );

  server.registerTool(
    'health_update_preferences',
    {
      description: 'Create or update the canonical Health preferences document.',
      inputSchema: {
        preferences: z.any(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      title: 'Update Health Preferences',
    },
    async (args) => {
      const authProps = requireScope(FLUENT_HEALTH_WRITE_SCOPE);
      const updated = await health.updatePreferences({
        preferences: args.preferences,
        provenance: buildMutationProvenance(authProps, args),
      });
      const ack = buildHealthMutationAck(
        'health_preferences',
        `${updated.tenantId}:${updated.profileId}`,
        'preferences.updated',
        updated.updatedAt,
        summarizeHealthPreferences(updated),
      );
      return toolResult(updated.raw, {
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
        textData: args.response_mode === 'full' ? updated.raw : ack,
      });
    },
  );

  server.registerTool(
    'health_get_context',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'Fetch current Health context with active goals, active block state, and recent activity.',
      inputSchema: {
        view: readViewSchema,
      },
      title: 'Get Health Context',
    },
    async ({ view }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const context = await health.getContext();
      const summary = summarizeHealthContext(context);
      return toolResult(context, {
        structuredContent: view === 'full' ? undefined : summary,
        textData: view === 'full' ? context : summary,
      });
    },
  );

  server.registerTool(
    'health_get_today_context',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'Fetch today’s planned Health session and logged workouts.',
      inputSchema: {
        date: z.string().optional(),
        view: readViewSchema,
      },
      title: 'Get Health Today Context',
    },
    async ({ date, view }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const context = await health.getTodayContext(date);
      const summary = summarizeHealthTodayContext(context);
      return toolResult(context, {
        structuredContent: view === 'full' ? undefined : summary,
        textData: view === 'full' ? context : summary,
      });
    },
  );

  server.registerTool(
    'health_get_review_context',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'Fetch a weekly Health review context with planned sessions, logged workouts, and any saved review.',
      inputSchema: {
        week_start: z.string().optional(),
        view: readViewSchema,
      },
      title: 'Get Health Review Context',
    },
    async ({ week_start, view }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const context = await health.getReviewContext(week_start);
      const summary = summarizeHealthReviewContext(context);
      return toolResult(context, {
        structuredContent: view === 'full' ? undefined : summary,
        textData: view === 'full' ? context : summary,
      });
    },
  );

  server.registerTool(
    'health_get_active_block',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'Fetch the active Health training block with inline sessions.',
      inputSchema: {
        date: z.string().optional(),
        view: readViewSchema,
      },
      title: 'Get Active Health Block',
    },
    async ({ date, view }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const block = await health.getActiveBlock(date);
      const summary = summarizeHealthBlock(block);
      return toolResult(block, {
        structuredContent: view === 'summary' ? summary ?? undefined : undefined,
        textData: view === 'full' ? block : summary,
      });
    },
  );

  server.registerTool(
    'health_get_block',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'Fetch a saved Health block by id.',
      inputSchema: {
        block_id: z.string(),
        view: readViewSchema,
      },
      title: 'Get Health Block',
    },
    async ({ block_id, view }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const block = await health.getBlock(block_id);
      const summary = summarizeHealthBlock(block);
      return toolResult(block, {
        structuredContent: view === 'summary' ? summary ?? undefined : undefined,
        textData: view === 'full' ? block : summary,
      });
    },
  );

  server.registerTool(
    'health_get_block_projection',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'Project the current or requested Health week from the active block.',
      inputSchema: {
        block_id: z.string().optional(),
        date: z.string().optional(),
        week_start: z.string().optional(),
        view: readViewSchema,
      },
      title: 'Get Health Block Projection',
    },
    async ({ block_id, date, week_start, view }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const projection = await health.getBlockProjection({
        blockId: block_id,
        date,
        weekStart: week_start,
      });
      const summary = summarizeHealthBlockProjection(projection);
      return toolResult(projection, {
        structuredContent: view === 'summary' ? summary ?? undefined : undefined,
        textData: view === 'full' ? projection : summary,
      });
    },
  );

  server.registerTool(
    'health_upsert_block',
    {
      description: 'Create or update the active Health training block. Sessions may be generated from preferences or passed explicitly.',
      inputSchema: {
        id: z.string().optional(),
        goal_id: z.string().optional(),
        name: z.string().optional(),
        start_date: z.string().optional(),
        duration_weeks: z.number().int().min(1).max(16).optional(),
        status: blockStatusSchema.optional(),
        training_split: z.string().optional(),
        days_per_week: z.number().int().min(1).max(7).optional(),
        session_length_minutes: z.number().int().min(15).max(240).optional(),
        equipment_access: z.string().optional(),
        progression_strategy: z.string().optional(),
        deload_strategy: z.string().optional(),
        notes: z.string().optional(),
        constraints: z.array(z.string()).optional(),
        sessions: z
          .array(
            z.object({
              id: z.string().optional(),
              title: z.string(),
              session_type: z.string().optional(),
              estimated_minutes: z.number().int().min(15).max(240).optional(),
              load_hint: loadHintSchema.optional(),
              notes: z.string().optional(),
              details: z.any().optional(),
              week_pattern: z.string().optional(),
              sequence_index: z.number().int().min(0).optional(),
            }),
          )
          .optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      title: 'Upsert Health Block',
    },
    async (args) => {
      const authProps = requireScope(FLUENT_HEALTH_WRITE_SCOPE);
      const block = await health.upsertBlock({
        constraints: args.constraints,
        daysPerWeek: args.days_per_week,
        deloadStrategy: args.deload_strategy,
        durationWeeks: args.duration_weeks,
        equipmentAccess: args.equipment_access,
        goalId: args.goal_id,
        id: args.id,
        name: args.name,
        notes: args.notes,
        progressionStrategy: args.progression_strategy,
        provenance: buildMutationProvenance(authProps, args),
        sessionLengthMinutes: args.session_length_minutes,
        sessions: args.sessions?.map((session) => ({
          details: session.details,
          estimatedMinutes: session.estimated_minutes,
          id: session.id,
          loadHint: session.load_hint,
          notes: session.notes,
          sequenceIndex: session.sequence_index,
          sessionType: session.session_type,
          title: session.title,
          weekPattern: session.week_pattern,
        })),
        startDate: args.start_date,
        status: args.status,
        trainingSplit: args.training_split,
      });
      const ack = buildHealthMutationAck('health_training_block', block.id, 'block.upserted', block.updatedAt, {
        durationWeeks: block.durationWeeks,
        sessionCount: block.sessions.length,
        startDate: block.startDate,
        status: block.status,
      });
      return toolResult(block, {
        structuredContent: args.response_mode === 'ack' ? ack : summarizeHealthBlock(block) ?? undefined,
        textData: args.response_mode === 'full' ? block : ack,
      });
    },
  );

  server.registerTool(
    'health_record_block_review',
    {
      description: 'Persist a block review so future week projections and adjustments can use it.',
      inputSchema: {
        block_id: z.string().optional(),
        review_date: z.string().optional(),
        week_start: z.string().optional(),
        summary: z.string().optional(),
        worked: z.array(z.string()).optional(),
        struggled: z.array(z.string()).optional(),
        adjustments: z.array(z.string()).optional(),
        next_focus: z.string().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      title: 'Record Health Block Review',
    },
    async (args) => {
      const authProps = requireScope(FLUENT_HEALTH_WRITE_SCOPE);
      const review = await health.recordBlockReview({
        adjustments: args.adjustments,
        blockId: args.block_id,
        nextFocus: args.next_focus,
        provenance: buildMutationProvenance(authProps, args),
        reviewDate: args.review_date,
        struggled: args.struggled,
        summary: args.summary,
        weekStart: args.week_start,
        worked: args.worked,
      });
      const ack = buildHealthMutationAck('health_block_review', review.id, 'block_review.recorded', review.updatedAt, {
        adjustmentCount: review.adjustments.length,
        blockId: review.blockId,
        reviewDate: review.reviewDate,
      });
      return toolResult(review, {
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
        textData: args.response_mode === 'full' ? review : summarizeHealthBlockReview(review) ?? ack,
      });
    },
  );

  server.registerTool(
    'health_list_goals',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'List Health goals, optionally filtered by status.',
      inputSchema: {
        status: goalStatusSchema.optional(),
      },
      title: 'List Health Goals',
    },
    async ({ status }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const goals = await health.listGoals(status);
      return toolResult(goals, {
        textData: {
          goalCount: goals.length,
          requestedStatus: status ?? null,
          preview: goals.slice(0, 10).map((goal) => ({
            deadline: goal.deadline,
            goalType: goal.goalType,
            id: goal.id,
            status: goal.status,
            title: goal.title,
          })),
        },
      });
    },
  );

  server.registerTool(
    'health_upsert_goal',
    {
      description: 'Create or update a Health goal.',
      inputSchema: {
        id: z.string().optional(),
        goal_type: goalTypeSchema,
        title: z.string(),
        target_value: z.number().optional(),
        target_unit: z.string().optional(),
        deadline: z.string().optional(),
        status: goalStatusSchema.optional(),
        notes: z.string().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      title: 'Upsert Health Goal',
    },
    async (args) => {
      const authProps = requireScope(FLUENT_HEALTH_WRITE_SCOPE);
      const goal = await health.upsertGoal({
        deadline: args.deadline,
        goalType: args.goal_type,
        id: args.id,
        notes: args.notes,
        provenance: buildMutationProvenance(authProps, args),
        status: args.status,
        targetUnit: args.target_unit,
        targetValue: args.target_value,
        title: args.title,
      });
      const ack = buildHealthMutationAck('health_goal', goal.id, 'goal.upserted', goal.updatedAt, {
        goalType: goal.goalType,
        status: goal.status,
        title: goal.title,
      });
      return toolResult(goal, {
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
        textData: args.response_mode === 'full' ? goal : ack,
      });
    },
  );

  server.registerTool(
    'health_list_workout_logs',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'List Health workout logs.',
      inputSchema: {
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      title: 'List Workout Logs',
    },
    async ({ date_from, date_to, limit }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const logs = await health.listWorkoutLogs({
        dateFrom: date_from,
        dateTo: date_to,
        limit,
      });
      return toolResult(logs, {
        structuredContent: { logs: logs.map((entry) => summarizeWorkoutLog(entry)) },
        textData: logs.map((entry) => summarizeWorkoutLog(entry)),
      });
    },
  );

  server.registerTool(
    'health_log_workout',
    {
      description: 'Create a workout log linked to the active Health block or a specific block session.',
      inputSchema: {
        date: z.string().optional(),
        block_id: z.string().optional(),
        block_session_id: z.string().optional(),
        title: z.string().optional(),
        completion: workoutCompletionSchema.optional(),
        duration_minutes: z.number().int().min(1).max(480).optional(),
        energy_level: energyLevelSchema.optional(),
        soreness_level: sorenessLevelSchema.optional(),
        notes: z.string().optional(),
        details: z.any().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      title: 'Log Workout',
    },
    async (args) => {
      const authProps = requireScope(FLUENT_HEALTH_WRITE_SCOPE);
      const log = await health.logWorkout({
        completion: args.completion,
        date: args.date,
        details: args.details,
        durationMinutes: args.duration_minutes,
        energyLevel: args.energy_level,
        notes: args.notes,
        blockId: args.block_id,
        blockSessionId: args.block_session_id,
        provenance: buildMutationProvenance(authProps, args),
        sorenessLevel: args.soreness_level,
        title: args.title,
      });
      const ack = buildHealthMutationAck('health_workout_log', log.id, 'workout.logged', log.updatedAt, {
        blockSessionId: log.blockSessionId,
        completion: log.completion,
        date: log.date,
      });
      return toolResult(log, {
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
        textData: args.response_mode === 'full' ? log : ack,
      });
    },
  );

  server.registerTool(
    'health_list_body_metrics',
    {
      annotations: { idempotentHint: true, readOnlyHint: true },
      description: 'List Health body metrics, optionally filtered by metric type.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        metric_type: metricTypeSchema.optional(),
      },
      title: 'List Body Metrics',
    },
    async ({ limit, metric_type }) => {
      requireScope(FLUENT_HEALTH_READ_SCOPE);
      const metrics = await health.listBodyMetrics({ limit, metricType: metric_type });
      return toolResult(metrics, {
        textData: {
          metricCount: metrics.length,
          metricType: metric_type ?? null,
          preview: metrics.slice(0, 12).map((metric) => ({
            date: metric.date,
            id: metric.id,
            metricType: metric.metricType,
            unit: metric.unit,
            value: metric.value,
            value2: metric.value2,
          })),
        },
      });
    },
  );

  server.registerTool(
    'health_log_body_metric',
    {
      description: 'Log an optional Health body metric such as weight, waist, or sleep hours.',
      inputSchema: {
        date: z.string().optional(),
        metric_type: metricTypeSchema,
        value: z.number().optional(),
        value2: z.number().optional(),
        unit: z.string().optional(),
        notes: z.string().optional(),
        source: z.string().optional(),
        response_mode: writeResponseModeSchema,
        ...provenanceInputSchema,
      },
      title: 'Log Body Metric',
    },
    async (args) => {
      const authProps = requireScope(FLUENT_HEALTH_WRITE_SCOPE);
      const metric = await health.logBodyMetric({
        date: args.date,
        metricType: args.metric_type,
        notes: args.notes,
        provenance: buildMutationProvenance(authProps, args),
        source: args.source,
        unit: args.unit,
        value: args.value,
        value2: args.value2,
      });
      const ack = buildHealthMutationAck('health_body_metric', metric.id, 'body_metric.logged', metric.createdAt, {
        date: metric.date,
        metricType: metric.metricType,
      });
      return toolResult(metric, {
        structuredContent: args.response_mode === 'ack' ? ack : undefined,
        textData: args.response_mode === 'full' ? metric : ack,
      });
    },
  );
}
