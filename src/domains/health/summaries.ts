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
