import type {
  HealthBlockProjectionRecord,
  HealthBlockReviewRecord,
  HealthBlockReviewSummaryRecord,
  HealthBlockSummaryRecord,
  HealthContextRecord,
  HealthPreferencesRecord,
  HealthReviewContextRecord,
  HealthTodayContextRecord,
  HealthWorkoutLogRecord,
} from './types';
import type { HealthMutationAckRecord } from './types-extra';

export function buildHealthMutationAck(
  entityType: string,
  entityId: string,
  action: string,
  updatedAt: string | null,
  details?: Record<string, unknown>,
): HealthMutationAckRecord {
  return {
    action,
    details,
    entityId,
    entityType,
    updatedAt,
  };
}

export function summarizeHealthPreferences(preferences: HealthPreferencesRecord) {
  const raw = preferences.raw ?? {};
  return {
    daysPerWeek: typeof raw.days_per_week === 'number' ? raw.days_per_week : null,
    equipmentAccess: typeof raw.equipment_access === 'string' ? raw.equipment_access : null,
    recoveryPreferences: Array.isArray(raw.recovery_preferences) ? raw.recovery_preferences : [],
    sessionLengthMinutes: typeof raw.session_length_minutes === 'number' ? raw.session_length_minutes : null,
    trainingExperience: typeof raw.training_experience === 'string' ? raw.training_experience : null,
    trainingSplit: typeof raw.training_split === 'string' ? raw.training_split : null,
    units: typeof raw.units === 'object' && raw.units ? raw.units : null,
    updatedAt: preferences.updatedAt,
    version: preferences.version,
  };
}

export function summarizeHealthBlock(block: {
  id: string;
  goalId: string | null;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  status: string;
  name: string;
  trainingSplit: string | null;
  daysPerWeek: number;
  sessionLengthMinutes: number | null;
  equipmentAccess: string | null;
  sessions: { id: string }[];
  createdAt: string | null;
  updatedAt: string | null;
  summary: unknown;
} | null): HealthBlockSummaryRecord | null {
  if (!block) {
    return null;
  }

  return {
    createdAt: block.createdAt,
    daysPerWeek: block.daysPerWeek,
    durationWeeks: block.durationWeeks,
    endDate: block.endDate,
    equipmentAccess: block.equipmentAccess,
    goalId: block.goalId,
    id: block.id,
    name: block.name,
    sessionCount: block.sessions.length,
    sessionLengthMinutes: block.sessionLengthMinutes,
    startDate: block.startDate,
    status: block.status as HealthBlockSummaryRecord['status'],
    summary: block.summary,
    trainingSplit: block.trainingSplit,
    updatedAt: block.updatedAt,
  };
}

export function summarizeHealthBlockReview(review: HealthBlockReviewRecord | null): HealthBlockReviewSummaryRecord | null {
  if (!review) {
    return null;
  }

  return {
    adjustmentCount: review.adjustments.length,
    blockId: review.blockId,
    id: review.id,
    nextBlockConfidence: review.nextBlockConfidence,
    nextFocus: review.nextFocus,
    reviewDate: review.reviewDate,
    struggledCount: review.struggled.length,
    updatedAt: review.updatedAt,
    workedCount: review.worked.length,
  };
}

export function summarizeHealthBlockProjection(projection: HealthBlockProjectionRecord | null) {
  if (!projection) {
    return null;
  }

  return {
    activeWeekIndex: projection.activeWeekIndex,
    block: projection.block,
    nextTrainingDate: projection.nextTrainingDate,
    projectedTodaySession: projection.projectedTodaySession
      ? {
          blockSessionId: projection.projectedTodaySession.blockSessionId,
          date: projection.projectedTodaySession.date,
          status: projection.projectedTodaySession.status,
          title: projection.projectedTodaySession.title,
        }
      : null,
    resolvedSession: projection.resolvedSession
      ? {
          blockSessionId: projection.resolvedSession.blockSessionId,
          date: projection.resolvedSession.date,
          status: projection.resolvedSession.status,
          title: projection.resolvedSession.title,
        }
      : null,
    sessionCount: projection.sessions.length,
    trainingSupportSummary: projection.trainingSupportSummary,
    weekEnd: projection.weekEnd,
    weekStart: projection.weekStart,
  };
}

export function formatHealthBlockText(block: HealthBlockSummaryRecord | null): string {
  if (!block) {
    return [
      'Health training block',
      'No training plan is active yet.',
      "Set a simple weekly plan first, then I can show today's session.",
      healthBoundaryText(),
    ].join('\n');
  }

  return [
    'Health training block',
    `${block.name} is ${block.status}.`,
    `Plan: ${formatCount(block.daysPerWeek, 'day')}/week, ${formatCount(block.sessionCount, 'session')} across ${formatDateRange(block.startDate, block.endDate)}.`,
    block.sessionLengthMinutes ? `Session target: about ${block.sessionLengthMinutes} minutes.` : null,
    block.equipmentAccess ? `Equipment: ${block.equipmentAccess}.` : null,
    healthBoundaryText(),
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export function summarizeHealthContext(context: HealthContextRecord) {
  return {
    activeGoalCount: context.activeGoals.length,
    activeBlock: context.activeBlock,
    blockState: context.blockState,
    domain: context.domain,
    lastWorkoutDate: context.lastWorkoutDate,
    latestMetricTypes: Object.keys(context.latestMetrics).sort(),
    preferencesReady: context.preferencesReady,
    recentWorkoutCount: context.recentWorkoutCount,
    trainingSupportSummary: context.trainingSupportSummary,
  };
}

export function formatHealthContextText(context: HealthContextRecord): string {
  const activeBlock = context.activeBlock
    ? `${context.activeBlock.name}, ${formatCount(context.activeBlock.daysPerWeek, 'day')}/week`
    : 'no active training block';
  const recentTraining = context.recentWorkoutCount
    ? `recent workout history is available${context.lastWorkoutDate ? `; last session was ${context.lastWorkoutDate}` : ''}`
    : 'workout history will get more useful after the next session';

  return [
    'Health context',
    `Current setup: ${context.preferencesReady ? 'preferences are saved' : 'preferences are not saved yet'}; ${activeBlock}.`,
    `Recent training: ${recentTraining}.`,
    `Goal context: ${formatGoalContext(context.activeGoals.length)}.`,
    context.trainingSupportSummary
      ? `Weekly shape: ${formatCount(context.trainingSupportSummary.daysPerWeek, 'day')}/week; ${context.trainingSupportSummary.weekComplexity} complexity.`
      : null,
    healthBoundaryText(),
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export function summarizeHealthTodayContext(context: HealthTodayContextRecord) {
  return {
    activeGoalCount: context.activeGoals.length,
    activeBlock: context.activeBlock,
    blockState: context.blockState,
    completionSignalCount: context.loggedWorkouts.length,
    date: context.date,
    latestMetricTypes: Object.keys(context.latestMetrics).sort(),
    loggedWorkoutCount: context.loggedWorkouts.length,
    nextTrainingDate: context.nextTrainingDate,
    projectedSession: context.projectedSession
      ? {
          blockSessionId: context.projectedSession.blockSessionId,
          date: context.projectedSession.date,
          status: context.projectedSession.status,
          title: context.projectedSession.title,
        }
      : null,
    resolvedSession: context.resolvedSession
      ? {
          blockSessionId: context.resolvedSession.blockSessionId,
          date: context.resolvedSession.date,
          status: context.resolvedSession.status,
          title: context.resolvedSession.title,
        }
      : null,
    trainingSupportSummary: context.trainingSupportSummary,
  };
}

export function formatHealthTodayContextText(context: HealthTodayContextRecord): string {
  const session = context.resolvedSession ?? context.projectedSession;
  const title = session?.title ?? null;
  const status = session?.status ?? null;
  const details = session?.details ?? null;
  const plan = context.activeBlock
    ? `${context.activeBlock.name}, ${formatCount(context.activeBlock.daysPerWeek, 'day')}/week`
    : 'no active training block';
  const logged = context.loggedWorkouts.length
    ? 'today already has workout notes'
    : 'nothing recorded yet';

  return [
    "Today's training",
    title
      ? `${title}${status ? ` (${status})` : ''} for ${context.date}.`
      : `No training is planned for ${context.date}.`,
    `Plan: ${plan}.`,
    details?.sessionGoal ? `Goal: ${details.sessionGoal}.` : null,
    formatWarmupLine(details?.warmup ?? []),
    formatBlocksLine('Main work', details?.mainBlocks ?? []),
    formatBlocksLine('Secondary work', details?.secondaryBlocks ?? []),
    formatConditioningLine(details?.conditioningBlock ?? null),
    formatListLine('Substitutions', details?.substitutionHints ?? [], 2),
    formatListLine('Coach notes', details?.coachNotes ?? [], 2),
    `Today's notes: ${logged}.`,
    !title ? "Set or activate a weekly training plan, then I can turn this into today's session." : null,
    context.nextTrainingDate && !title ? `Next training date: ${context.nextTrainingDate}.` : null,
    `Goal context: ${formatGoalContext(context.activeGoals.length)}.`,
    healthBoundaryText(),
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export function formatHealthBlockProjectionText(projection: HealthBlockProjectionRecord | null): string {
  if (!projection) {
    return [
      'Health training week',
      'No training week is active yet.',
      'Create or activate a training plan before projecting the week.',
      healthBoundaryText(),
    ].join('\n');
  }

  const session = projection.resolvedSession ?? projection.projectedTodaySession;
  return [
    'Health training week',
    `Week: ${formatDateRange(projection.weekStart, projection.weekEnd)}.`,
    projection.block ? `Block: ${projection.block.name}, ${formatCount(projection.block.daysPerWeek, 'day')}/week.` : 'Block: none active.',
    `Sessions: ${formatCount(projection.sessions.length, 'planned session')}.`,
    session ? `Today: ${session.title} (${session.status}).` : 'Today: no training planned.',
    projection.nextTrainingDate ? `Next training date: ${projection.nextTrainingDate}.` : null,
    healthBoundaryText(),
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export function summarizeHealthReviewContext(context: HealthReviewContextRecord) {
  return {
    adherenceSummary: context.adherenceSummary,
    adherenceEvidenceLevel: context.adherenceSummary.evidenceLevel,
    activeGoalCount: context.activeGoals.length,
    activeBlock: context.activeBlock,
    blockProjection: summarizeHealthBlockProjection(context.blockProjection),
    blockReview: summarizeHealthBlockReview(context.blockReview),
    blockState: context.blockState,
    completedEntryCount: context.completedEntryCount,
    completionSignalCount: context.adherenceSummary.completionSignalCount,
    domain: context.domain,
    loadDistribution: context.loadDistribution,
    loggedPartialCount: context.loggedPartialCount,
    loggedSkippedCount: context.loggedSkippedCount,
    loggedWorkoutCount: context.loggedWorkoutCount,
    needsUserCheckIn: context.adherenceSummary.needsUserCheckIn,
    metricSignals: context.metricSignals,
    partialEntryCount: context.partialEntryCount,
    plannedEntryCount: context.plannedEntryCount,
    remainingEntryCount: context.remainingEntryCount,
    skippedEntryCount: context.skippedEntryCount,
    latestMetricTypes: Object.keys(context.latestMetrics).sort(),
    trainingSupportSummary: context.trainingSupportSummary,
    weekEnd: context.weekEnd,
    weekStart: context.weekStart,
  };
}

export function summarizeWorkoutLog(log: HealthWorkoutLogRecord) {
  return {
    completion: log.completion,
    date: log.date,
    durationMinutes: log.durationMinutes,
    energyLevel: log.energyLevel,
    id: log.id,
    titleSnapshot: log.titleSnapshot,
  };
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function formatGoalContext(count: number): string {
  if (count > 1) return 'goals are set for the current training direction';
  if (count === 1) return 'a goal is set for the current training direction';
  return 'set a goal when you want sharper training guidance';
}

function formatDateRange(start: string, end: string): string {
  return start === end ? start : `${start} to ${end}`;
}

function healthBoundaryText(): string {
  return 'I can help with training, not medical diagnosis, treatment, or nutrition prescriptions.';
}

function formatWarmupLine(warmup: string[]): string | null {
  return warmup.length ? `Warmup: ${warmup.slice(0, 3).join('; ')}.` : null;
}

function formatBlocksLine(label: string, blocks: Array<{ label: string; sets: string; reps: string; exercises: string[] }>): string | null {
  if (!blocks.length) {
    return null;
  }
  const rendered = blocks.slice(0, 3).map((block) => {
    const prescription = [block.sets, block.reps].filter(Boolean).join(' x ');
    const exercises = block.exercises.slice(0, 4).join(', ');
    const parts = [block.label, prescription, exercises].filter(Boolean);
    return parts.length === 1 ? parts[0] : parts.join(': ');
  });
  return `${label}: ${rendered.join(' | ')}.`;
}

function formatConditioningLine(block: { mode: string; durationMinutes: number | null; target: string | null } | null): string | null {
  if (!block) {
    return null;
  }
  const duration = block.durationMinutes ? `${block.durationMinutes} min` : null;
  return `Conditioning: ${[block.mode, duration, block.target].filter(Boolean).join(', ')}.`;
}

function formatListLine(label: string, values: string[], limit: number): string | null {
  return values.length ? `${label}: ${values.slice(0, limit).join('; ')}.` : null;
}
