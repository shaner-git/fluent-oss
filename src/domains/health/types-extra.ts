import type { MutationProvenance } from '../../auth';
import type {
  HealthBlockStatus,
  HealthBodyMetricType,
  HealthEnergyLevel,
  HealthGoalStatus,
  HealthGoalType,
  HealthSorenessLevel,
  HealthTrainingExperience,
  HealthUnitDistance,
  HealthUnitHeight,
  HealthUnitWeight,
  HealthWorkoutCompletion,
} from './types';

export interface UpdateHealthPreferencesInput {
  preferences: Record<string, unknown>;
  provenance: MutationProvenance;
}

export interface UpsertHealthGoalInput {
  id?: string | null;
  goalType: HealthGoalType;
  title: string;
  targetValue?: number | null;
  targetUnit?: string | null;
  deadline?: string | null;
  status?: HealthGoalStatus | null;
  notes?: string | null;
  provenance: MutationProvenance;
}

export interface ListWorkoutLogsFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number | null;
}

export interface LogWorkoutInput {
  date?: string | null;
  blockId?: string | null;
  blockSessionId?: string | null;
  title?: string | null;
  completion?: HealthWorkoutCompletion | null;
  durationMinutes?: number | null;
  energyLevel?: HealthEnergyLevel | null;
  sorenessLevel?: HealthSorenessLevel | null;
  notes?: string | null;
  details?: unknown;
  provenance: MutationProvenance;
}

export interface ListBodyMetricsFilters {
  metricType?: HealthBodyMetricType | null;
  limit?: number | null;
}

export interface LogBodyMetricInput {
  date?: string | null;
  metricType: HealthBodyMetricType;
  value?: number | null;
  value2?: number | null;
  unit?: string | null;
  notes?: string | null;
  source?: string | null;
  provenance: MutationProvenance;
}

export interface UpsertHealthBlockSessionInput {
  id?: string | null;
  title: string;
  sessionType?: string | null;
  estimatedMinutes?: number | null;
  loadHint?: 'light' | 'moderate' | 'hard' | null;
  notes?: string | null;
  details?: unknown;
  weekPattern?: string | null;
  sequenceIndex?: number | null;
}

export interface UpsertHealthBlockInput {
  id?: string | null;
  goalId?: string | null;
  name?: string | null;
  startDate?: string | null;
  durationWeeks?: number | null;
  status?: HealthBlockStatus | null;
  trainingSplit?: string | null;
  daysPerWeek?: number | null;
  sessionLengthMinutes?: number | null;
  equipmentAccess?: string | null;
  progressionStrategy?: string | null;
  deloadStrategy?: string | null;
  notes?: string | null;
  constraints?: string[] | null;
  sessions?: UpsertHealthBlockSessionInput[] | null;
  provenance: MutationProvenance;
}

export interface RecordHealthBlockReviewInput {
  blockId?: string | null;
  reviewDate?: string | null;
  weekStart?: string | null;
  summary?: string | null;
  worked?: string[] | null;
  struggled?: string[] | null;
  adjustments?: string[] | null;
  nextFocus?: string | null;
  provenance: MutationProvenance;
}

export interface NormalizedHealthPreferences {
  units: {
    weight: HealthUnitWeight;
    height: HealthUnitHeight;
    distance: HealthUnitDistance;
  };
  training_experience: HealthTrainingExperience | null;
  equipment_access: string | null;
  training_split: string | null;
  days_per_week: number | null;
  session_length_minutes: number | null;
  recovery_preferences: string[];
  notes: string | null;
}

export interface HealthMutationAckRecord {
  entityType: string;
  entityId: string;
  action: string;
  updatedAt: string | null;
  details?: Record<string, unknown>;
}
