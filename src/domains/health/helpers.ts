import { shiftDateString } from '../../time';
import type {
  HealthBodyMetricType,
  HealthGoalStatus,
  HealthGoalType,
  HealthTrainingExperience,
  HealthUnitDistance,
  HealthUnitHeight,
  HealthUnitWeight,
} from './types';
import type { NormalizedHealthPreferences } from './types-extra';

const allowedGoalTypes = new Set<HealthGoalType>([
  'fat_loss',
  'muscle_gain',
  'recomp',
  'strength',
  'consistency',
  'endurance',
  'general_fitness',
  'custom',
]);

const allowedGoalStatuses = new Set<HealthGoalStatus>(['active', 'achieved', 'paused', 'abandoned']);
const allowedMetricTypes = new Set<HealthBodyMetricType>([
  'weight',
  'waist',
  'body_fat',
  'resting_hr',
  'sleep_hours',
  'custom',
]);
const allowedTrainingExperience = new Set<HealthTrainingExperience>(['beginner', 'intermediate', 'advanced']);
const allowedWeightUnits = new Set<HealthUnitWeight>(['kg', 'lb']);
const allowedHeightUnits = new Set<HealthUnitHeight>(['cm', 'in']);
const allowedDistanceUnits = new Set<HealthUnitDistance>(['km', 'mi']);

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function safeParse(value: string | null | undefined): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizePositiveInteger(value: unknown, fallback: number | null = null): number | null {
  const parsed = asNumber(value);
  if (parsed == null) return fallback;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : fallback;
}

export function normalizeDateString(value: string | null | undefined, fallback?: string | null): string {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (fallback?.trim()) {
    return fallback.trim();
  }
  throw new Error('A valid date string is required.');
}

export function normalizeGoalType(value: unknown, fallback: HealthGoalType = 'general_fitness'): HealthGoalType {
  return typeof value === 'string' && allowedGoalTypes.has(value as HealthGoalType)
    ? (value as HealthGoalType)
    : fallback;
}

export function normalizeGoalStatus(value: unknown, fallback: HealthGoalStatus = 'active'): HealthGoalStatus {
  return typeof value === 'string' && allowedGoalStatuses.has(value as HealthGoalStatus)
    ? (value as HealthGoalStatus)
    : fallback;
}

export function normalizeMetricType(value: unknown): HealthBodyMetricType {
  if (typeof value === 'string' && allowedMetricTypes.has(value as HealthBodyMetricType)) {
    return value as HealthBodyMetricType;
  }
  throw new Error(`Unsupported health metric type: ${String(value)}`);
}

export function normalizeHealthPreferences(input: unknown): Record<string, unknown> {
  const raw = asRecord(input) ?? {};
  const nestedSources = [
    raw,
    asRecord(raw.preferences),
    asRecord(raw.health),
    asRecord(raw.fitness),
    asRecord(raw.training),
    asRecord(raw.schedule),
    asRecord(raw.workout),
    asRecord(raw.workout_plan),
    asRecord(raw.workoutPlan),
    asRecord(raw.gym),
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const units = firstRecord(
    raw.units,
    asRecord(raw.preferences)?.units,
    asRecord(raw.health)?.units,
    asRecord(raw.fitness)?.units,
    asRecord(raw.training)?.units,
  );
  const trainingExperienceCandidate = normalizeText(
    firstString(
      ...nestedSources.flatMap((source) => [
        source.training_experience,
        source.trainingExperience,
        source.experience_level,
        source.experienceLevel,
        source.fitness_level,
        source.fitnessLevel,
        source.level,
        source.experience,
      ]),
    ),
  );
  const preferences: NormalizedHealthPreferences = {
    units: {
      weight:
        typeof units?.weight === 'string' && allowedWeightUnits.has(units.weight as HealthUnitWeight)
          ? (units.weight as HealthUnitWeight)
          : 'lb',
      height:
        typeof units?.height === 'string' && allowedHeightUnits.has(units.height as HealthUnitHeight)
          ? (units.height as HealthUnitHeight)
          : 'in',
      distance:
        typeof units?.distance === 'string' && allowedDistanceUnits.has(units.distance as HealthUnitDistance)
          ? (units.distance as HealthUnitDistance)
          : 'km',
    },
    training_experience:
      trainingExperienceCandidate && allowedTrainingExperience.has(trainingExperienceCandidate as HealthTrainingExperience)
        ? (trainingExperienceCandidate as HealthTrainingExperience)
        : null,
    equipment_access: normalizeText(
      firstString(
        ...nestedSources.flatMap((source) => [
          source.equipment_access,
          source.equipmentAccess,
          source.gym_access,
          source.gymAccess,
          source.equipment,
          source.access,
        ]),
      ),
    ),
    training_split: normalizeText(
      firstString(
        ...nestedSources.flatMap((source) => [
          source.training_split,
          source.trainingSplit,
          source.split,
          source.workout_split,
          source.workoutSplit,
          source.training_style,
          source.trainingStyle,
        ]),
      ),
    ),
    days_per_week: normalizeBoundedDayCount(
      firstDefined(
        ...nestedSources.flatMap((source) => [
          source.days_per_week,
          source.daysPerWeek,
          source.sessions_per_week,
          source.sessionsPerWeek,
          source.workout_days_per_week,
          source.workoutDaysPerWeek,
        ]),
      ),
    ),
    session_length_minutes: normalizeSessionLength(
      firstDefined(
        ...nestedSources.flatMap((source) => [
          source.session_length_minutes,
          source.sessionLengthMinutes,
          source.session_duration_minutes,
          source.sessionDurationMinutes,
          source.workout_length_minutes,
          source.workoutLengthMinutes,
        ]),
      ),
    ),
    recovery_preferences: normalizeStringArray(
      firstDefined(
        ...nestedSources.flatMap((source) => [
          source.recovery_preferences,
          source.recoveryPreferences,
          source.other_activities,
          source.otherActivities,
        ]),
      ),
    ),
    notes: normalizeText(
      firstString(
        ...nestedSources.flatMap((source) => [source.notes, source.note]),
      ),
    ),
  };

  return {
    ...raw,
    ...preferences,
    units: preferences.units,
  };
}

export function normalizeGoalTitle(value: unknown): string {
  const normalized = normalizeText(typeof value === 'string' ? value : null);
  if (!normalized) {
    throw new Error('Health goal title is required.');
  }
  return normalized;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

export function normalizeBoundedDayCount(value: unknown): number | null {
  const parsed = normalizePositiveInteger(value);
  if (parsed == null) return null;
  return Math.max(1, Math.min(7, parsed));
}

export function normalizeSessionLength(value: unknown): number | null {
  const parsed = normalizePositiveInteger(value);
  if (parsed == null) return null;
  return Math.max(15, Math.min(240, parsed));
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function firstString(...values: unknown[]): string | null {
  const value = firstDefined(...values);
  return typeof value === 'string' ? value : null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) {
      return record;
    }
  }
  return null;
}

export function dayLabelForDate(date: string): string {
  const weekday = new Date(`${date}T12:00:00.000Z`).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    weekday: 'long',
  });
  return weekday;
}

export function pickTrainingDayOffsets(daysPerWeek: number): number[] {
  switch (daysPerWeek) {
    case 1:
      return [0];
    case 2:
      return [0, 3];
    case 3:
      return [0, 2, 4];
    case 4:
      return [0, 1, 3, 4];
    case 5:
      return [0, 1, 2, 4, 5];
    case 6:
      return [0, 1, 2, 3, 4, 5];
    default:
      return [0, 1, 2, 3, 4, 5, 6].slice(0, Math.max(1, Math.min(daysPerWeek, 7)));
  }
}
