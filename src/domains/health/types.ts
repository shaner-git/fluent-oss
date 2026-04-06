export type HealthUnitWeight = 'kg' | 'lb';
export type HealthUnitHeight = 'cm' | 'in';
export type HealthUnitDistance = 'km' | 'mi';
export type HealthTrainingExperience = 'beginner' | 'intermediate' | 'advanced';
export type HealthGoalType =
  | 'fat_loss'
  | 'muscle_gain'
  | 'recomp'
  | 'strength'
  | 'consistency'
  | 'endurance'
  | 'general_fitness'
  | 'custom';
export type HealthGoalStatus = 'active' | 'achieved' | 'paused' | 'abandoned';
export type HealthBlockStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type HealthPlanEntryStatus = 'planned' | 'completed' | 'partial' | 'skipped';
export type HealthWorkoutCompletion = 'full' | 'partial' | 'skipped';
export type HealthEnergyLevel = 'low' | 'okay' | 'good' | 'great';
export type HealthSorenessLevel = 'low' | 'moderate' | 'high';
export type HealthSessionLoadHint = 'light' | 'moderate' | 'hard';
export type HealthSupportLevel = 'low' | 'medium' | 'high';
export type HealthNutritionSupportMode = 'general' | 'higher_protein' | 'simpler_dinners' | 'recovery_support';
export type HealthBodyMetricType =
  | 'weight'
  | 'waist'
  | 'body_fat'
  | 'resting_hr'
  | 'sleep_hours'
  | 'custom';
export type HealthMetricSignalDirection = 'up' | 'down' | 'flat' | 'new';

export interface HealthSessionBlockRecord {
  label: string;
  sets: string;
  reps: string;
  exercises: string[];
  notes: string | null;
}

export interface HealthConditioningBlockRecord {
  mode: string;
  durationMinutes: number | null;
  target: string | null;
  notes: string | null;
}

export interface HealthPlanEntryDetailsRecord {
  sessionGoal: string | null;
  loadHint: HealthSessionLoadHint;
  warmup: string[];
  mainBlocks: HealthSessionBlockRecord[];
  secondaryBlocks: HealthSessionBlockRecord[];
  conditioningBlock: HealthConditioningBlockRecord | null;
  substitutionHints: string[];
  coachNotes: string[];
}

export interface HealthTrainingSupportSummaryRecord {
  goalType: HealthGoalType | null;
  trainingDays: string[];
  daysPerWeek: number;
  sessionLoadByDay: Record<string, HealthSessionLoadHint>;
  nutritionSupportMode: HealthNutritionSupportMode;
  weekComplexity: HealthSupportLevel;
}

export interface HealthMetricSignalRecord {
  metricType: HealthBodyMetricType;
  date: string;
  direction: HealthMetricSignalDirection;
  summary: string;
  value: number | null;
  unit: string | null;
}

export interface HealthReviewAdherenceSummaryRecord {
  plannedSessions: number;
  completedSessions: number;
  partialSessions: number;
  skippedSessions: number;
  remainingSessions: number;
  loggedWorkouts: number;
}

export interface HealthPreferencesRecord {
  tenantId: string;
  profileId: string;
  version: number;
  raw: Record<string, unknown>;
  updatedAt: string | null;
}

export interface HealthGoalRecord {
  id: string;
  goalType: HealthGoalType;
  title: string;
  targetValue: number | null;
  targetUnit: string | null;
  deadline: string | null;
  status: HealthGoalStatus;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HealthTrainingBlockSessionRecord {
  id: string;
  blockId: string;
  sequenceIndex: number;
  weekPattern: string | null;
  title: string;
  sessionType: string | null;
  estimatedMinutes: number | null;
  loadHint: HealthSessionLoadHint;
  notes: string | null;
  details: HealthPlanEntryDetailsRecord | null;
  raw: Record<string, unknown>;
  updatedAt: string | null;
}

export interface HealthTrainingBlockRecord {
  id: string;
  goalId: string | null;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  status: HealthBlockStatus;
  name: string;
  trainingSplit: string | null;
  daysPerWeek: number;
  sessionLengthMinutes: number | null;
  equipmentAccess: string | null;
  progressionStrategy: string | null;
  deloadStrategy: string | null;
  summary: unknown;
  rationale: unknown;
  raw: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  sessions: HealthTrainingBlockSessionRecord[];
}

export interface HealthBlockStateRecord {
  blockId: string;
  activeWeekIndex: number;
  nextSessionIndex: number;
  lastCompletedSessionId: string | null;
  lastCompletedDate: string | null;
  lastCompletion: HealthWorkoutCompletion | null;
  paused: boolean;
  deload: boolean;
  raw: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HealthBlockSummaryRecord {
  id: string;
  goalId: string | null;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  status: HealthBlockStatus;
  name: string;
  trainingSplit: string | null;
  daysPerWeek: number;
  sessionLengthMinutes: number | null;
  equipmentAccess: string | null;
  sessionCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  summary: unknown;
}

export interface HealthBlockProjectionSessionRecord {
  date: string;
  dayLabel: string;
  blockId: string;
  blockSessionId: string;
  sequenceIndex: number;
  title: string;
  sessionType: string | null;
  estimatedMinutes: number | null;
  notes: string | null;
  details: HealthPlanEntryDetailsRecord | null;
  status: HealthPlanEntryStatus;
}

export interface HealthBlockProjectionRecord {
  block: HealthBlockSummaryRecord | null;
  blockState: HealthBlockStateRecord | null;
  weekStart: string;
  weekEnd: string;
  activeWeekIndex: number;
  sessions: HealthBlockProjectionSessionRecord[];
  projectedTodaySession: HealthBlockProjectionSessionRecord | null;
  resolvedSession: HealthBlockProjectionSessionRecord | null;
  nextTrainingDate: string | null;
  trainingSupportSummary: HealthTrainingSupportSummaryRecord;
}

export interface HealthWorkoutLogRecord {
  id: string;
  date: string;
  blockId: string | null;
  blockSessionId: string | null;
  titleSnapshot: string | null;
  completion: HealthWorkoutCompletion;
  durationMinutes: number | null;
  energyLevel: HealthEnergyLevel | null;
  sorenessLevel: HealthSorenessLevel | null;
  notes: string | null;
  raw: Record<string, unknown>;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sessionId: string | null;
  confidence: number | null;
  sourceType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HealthBodyMetricRecord {
  id: string;
  date: string;
  metricType: HealthBodyMetricType;
  value: number | null;
  value2: number | null;
  unit: string | null;
  notes: string | null;
  source: string | null;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sessionId: string | null;
  confidence: number | null;
  sourceType: string | null;
  createdAt: string | null;
}

export interface HealthBlockReviewRecord {
  id: string;
  blockId: string;
  reviewDate: string;
  weekStart: string | null;
  weekEnd: string | null;
  summary: string | null;
  worked: string[];
  struggled: string[];
  adjustments: string[];
  nextFocus: string | null;
  nextBlockConfidence: HealthSupportLevel | null;
  raw: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HealthBlockReviewSummaryRecord {
  id: string;
  blockId: string;
  reviewDate: string;
  workedCount: number;
  struggledCount: number;
  adjustmentCount: number;
  nextFocus: string | null;
  nextBlockConfidence: HealthSupportLevel | null;
  updatedAt: string | null;
}

export interface HealthPreferencesSummaryRecord {
  version: number;
  updatedAt: string | null;
  units: {
    weight: HealthUnitWeight;
    height: HealthUnitHeight;
    distance: HealthUnitDistance;
  };
  trainingExperience: HealthTrainingExperience | null;
  equipmentAccess: string | null;
  daysPerWeek: number | null;
  sessionLengthMinutes: number | null;
  recoveryPreferences: string[];
}

export interface HealthContextRecord {
  domain: 'health';
  preferencesReady: boolean;
  activeGoals: HealthGoalRecord[];
  activeBlock: HealthBlockSummaryRecord | null;
  blockState: HealthBlockStateRecord | null;
  recentWorkoutCount: number;
  lastWorkoutDate: string | null;
  latestMetrics: Partial<Record<HealthBodyMetricType, HealthBodyMetricRecord>>;
  trainingSupportSummary: HealthTrainingSupportSummaryRecord;
}

export interface HealthReviewContextRecord {
  domain: 'health';
  weekStart: string;
  weekEnd: string;
  activeBlock: HealthBlockSummaryRecord | null;
  blockState: HealthBlockStateRecord | null;
  blockProjection: HealthBlockProjectionRecord | null;
  blockReview: HealthBlockReviewRecord | null;
  activeGoals: HealthGoalRecord[];
  latestMetrics: Partial<Record<HealthBodyMetricType, HealthBodyMetricRecord>>;
  workoutLogs: HealthWorkoutLogRecord[];
  plannedEntryCount: number;
  completedEntryCount: number;
  partialEntryCount: number;
  skippedEntryCount: number;
  remainingEntryCount: number;
  loggedWorkoutCount: number;
  loggedFullCount: number;
  loggedPartialCount: number;
  loggedSkippedCount: number;
  adherenceSummary: HealthReviewAdherenceSummaryRecord;
  loadDistribution: Record<HealthSessionLoadHint, number>;
  metricSignals: HealthMetricSignalRecord[];
  trainingSupportSummary: HealthTrainingSupportSummaryRecord;
}

export interface HealthTodayContextRecord {
  date: string;
  activeBlock: HealthBlockSummaryRecord | null;
  blockState: HealthBlockStateRecord | null;
  projectedSession: HealthBlockProjectionSessionRecord | null;
  resolvedSession: HealthBlockProjectionSessionRecord | null;
  nextTrainingDate: string | null;
  loggedWorkouts: HealthWorkoutLogRecord[];
  activeGoals: HealthGoalRecord[];
  latestMetrics: Partial<Record<HealthBodyMetricType, HealthBodyMetricRecord>>;
  trainingSupportSummary: HealthTrainingSupportSummaryRecord;
}

export interface DomainEventRecord {
  id: string;
  domain: string;
  entityType: string;
  entityId: string | null;
  eventType: string;
  before: unknown;
  after: unknown;
  patch: unknown;
  sourceAgent: string | null;
  sourceSkill: string | null;
  sessionId: string | null;
  confidence: number | null;
  sourceType: string | null;
  actorEmail: string | null;
  actorName: string | null;
  createdAt: string | null;
}
