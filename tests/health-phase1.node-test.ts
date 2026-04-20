import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FluentCoreService } from '../src/fluent-core';
import { HealthService } from '../src/domains/health/service';
import { createLocalRuntime } from '../src/local/runtime';

const tempRoots: string[] = [];
const provenance = {
  actorEmail: 'tester@example.com',
  actorName: 'Shane Rodness',
  confidence: 1,
  scopes: ['health:write'],
  sessionId: 'health-v2-test',
  sourceAgent: 'codex-test',
  sourceSkill: 'fluent-health',
  sourceType: 'test',
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  });

async function main() {
  await persistsBlockFirstHealthLoop();
  await resolvesMissedSessionDriftFromBlockState();
  await marksReviewContextAsNeedingCheckInWhenNoAdherenceSignalsExist();
  await usesSavedPreferencesToAutogenerateBlockSessions();
  await completesHealthOnboardingAndDiscoveryWithBlockTools();
}

async function persistsBlockFirstHealthLoop() {
  const runtime = createTempRuntime();
  try {
    const service = new HealthService(runtime.sqliteDb as unknown as D1Database);

    const initialContext = await service.getContext('2026-04-06');
    assert.equal(initialContext.preferencesReady, false);
    assert.equal(initialContext.activeBlock, null);

    await service.updatePreferences({
      preferences: {
        days_per_week: 3,
        equipment_access: 'full gym access',
        recovery_preferences: ['Peloton', 'summer basketball'],
        session_length_minutes: 60,
        training_experience: 'intermediate',
        training_split: 'Full Body A/B/C',
        units: {
          distance: 'km',
          height: 'in',
          weight: 'lb',
        },
      },
      provenance,
    });

    const goal = await service.upsertGoal({
      goalType: 'consistency',
      notes: 'Keep the gym work realistic around other activities.',
      provenance,
      status: 'active',
      title: 'Maintain 3x weekly full body training',
    });

    const block = await service.upsertBlock({
      durationWeeks: 8,
      goalId: goal.id,
      provenance,
      startDate: '2026-04-06',
    });

    assert.equal(block.durationWeeks, 8);
    assert.equal(block.daysPerWeek, 3);
    assert.equal(block.sessions.length, 3);
    assert.equal(block.trainingSplit, 'full_body_abc');
    assert.deepEqual(
      block.sessions.map((session) => session.title),
      ['Full Body A', 'Full Body B', 'Full Body C'],
    );

    const activeBlock = await service.getActiveBlock('2026-04-08');
    assert.equal(activeBlock?.id, block.id);
    assert.equal(activeBlock?.sessions.length, 3);

    const projection = await service.getBlockProjection({ date: '2026-04-06' });
    assert.equal(projection?.sessions.length, 3);
    assert.equal(projection?.projectedTodaySession?.title, 'Full Body A');
    assert.equal(projection?.resolvedSession?.title, 'Full Body A');
    assert.equal(projection?.trainingSupportSummary.daysPerWeek, 3);

    const todayBeforeLog = await service.getTodayContext('2026-04-06');
    assert.equal(todayBeforeLog.projectedSession?.title, 'Full Body A');
    assert.equal(todayBeforeLog.resolvedSession?.title, 'Full Body A');

    const workout = await service.logWorkout({
      completion: 'full',
      date: '2026-04-06',
      durationMinutes: 58,
      energyLevel: 'good',
      notes: 'Moved well.',
      provenance,
    });

    assert.equal(workout.blockId, block.id);
    assert.equal(workout.blockSessionId, block.sessions[0]?.id);

    const todayAfterLog = await service.getTodayContext('2026-04-06');
    assert.equal(todayAfterLog.projectedSession?.status, 'completed');
    assert.equal(todayAfterLog.resolvedSession?.title, 'Full Body B');
    assert.equal(todayAfterLog.blockState?.nextSessionIndex, 1);

    const review = await service.recordBlockReview({
      adjustments: ['Keep Friday a bit easier if basketball gets intense.'],
      provenance,
      reviewDate: '2026-04-12',
      summary: 'Strong week overall.',
      weekStart: '2026-04-06',
      worked: ['Good consistency', 'Sessions fit the hour cap well'],
    });
    assert.equal(review.blockId, block.id);
    assert.equal(review.adjustments.length, 1);

    await service.logBodyMetric({
      date: '2026-04-06',
      metricType: 'sleep_hours',
      provenance,
      unit: 'hours',
      value: 7.5,
    });

    const context = await service.getContext('2026-04-08');
    assert.equal(context.preferencesReady, true);
    assert.equal(context.activeGoals.length, 1);
    assert.equal(context.activeBlock?.id, block.id);
    assert.equal(context.blockState?.nextSessionIndex, 1);
    assert.equal(context.trainingSupportSummary.goalType, 'consistency');
    assert.equal(context.latestMetrics.sleep_hours?.value, 7.5);

    const reviewContext = await service.getReviewContext('2026-04-06');
    assert.equal(reviewContext.activeBlock?.id, block.id);
    assert.equal(reviewContext.blockProjection?.sessions.length, 3);
    assert.equal(reviewContext.blockReview?.id, review.id);
    assert.equal(reviewContext.adherenceSummary.completedSessions, 1);
    assert.equal(reviewContext.adherenceSummary.completionSignalCount, 1);
    assert.equal(reviewContext.adherenceSummary.evidenceLevel, 'medium');
    assert.equal(reviewContext.adherenceSummary.needsUserCheckIn, false);
    assert.equal(reviewContext.trainingSupportSummary.daysPerWeek, 3);

    const events = await service.listDomainEvents(20);
    assert.equal(events.some((event) => event.eventType === 'health.training_block_created'), true);
    assert.equal(events.some((event) => event.eventType === 'health.workout_logged'), true);
    assert.equal(events.some((event) => event.eventType === 'health.block_review_created'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function resolvesMissedSessionDriftFromBlockState() {
  const runtime = createTempRuntime();
  try {
    const service = new HealthService(runtime.sqliteDb as unknown as D1Database);

    await service.updatePreferences({
      preferences: {
        days_per_week: 3,
        session_length_minutes: 50,
        training_split: 'Full Body A/B/C',
        units: { distance: 'km', height: 'in', weight: 'lb' },
      },
      provenance,
    });

    const block = await service.upsertBlock({
      durationWeeks: 6,
      name: 'Missed Session Test Block',
      provenance,
      startDate: '2026-04-06',
    });

    const wednesday = await service.getTodayContext('2026-04-08');
    assert.equal(wednesday.projectedSession?.title, 'Full Body B');
    assert.equal(wednesday.resolvedSession?.title, 'Full Body A');

    const skipped = await service.logWorkout({
      blockId: block.id,
      blockSessionId: wednesday.resolvedSession?.blockSessionId,
      completion: 'skipped',
      date: '2026-04-08',
      provenance,
    });
    assert.equal(skipped.blockSessionId, block.sessions[0]?.id);

    const afterSkip = await service.getTodayContext('2026-04-08');
    assert.equal(afterSkip.blockState?.nextSessionIndex, 1);
    assert.equal(afterSkip.resolvedSession?.title, 'Full Body B');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function marksReviewContextAsNeedingCheckInWhenNoAdherenceSignalsExist() {
  const runtime = createTempRuntime();
  try {
    const service = new HealthService(runtime.sqliteDb as unknown as D1Database);

    await service.updatePreferences({
      preferences: {
        days_per_week: 3,
        session_length_minutes: 45,
        training_split: 'Full Body A/B/C',
        units: { distance: 'km', height: 'in', weight: 'lb' },
      },
      provenance,
    });

    await service.upsertBlock({
      durationWeeks: 6,
      name: 'No Adherence Yet Block',
      provenance,
      startDate: '2026-04-06',
    });

    const reviewContext = await service.getReviewContext('2026-04-06');
    assert.equal(reviewContext.adherenceSummary.plannedSessions, 3);
    assert.equal(reviewContext.adherenceSummary.loggedWorkouts, 0);
    assert.equal(reviewContext.adherenceSummary.completionSignalCount, 0);
    assert.equal(reviewContext.adherenceSummary.evidenceLevel, 'low');
    assert.equal(reviewContext.adherenceSummary.needsUserCheckIn, true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function usesSavedPreferencesToAutogenerateBlockSessions() {
  const runtime = createTempRuntime();
  try {
    const service = new HealthService(runtime.sqliteDb as unknown as D1Database);

    await service.updatePreferences({
      preferences: {
        fitness: { experienceLevel: 'intermediate' },
        gym: { access: 'full gym access', name: 'GoodLife' },
        otherActivities: ['Peloton', 'summer basketball'],
        schedule: { daysPerWeek: 3, sessionDurationMinutes: 60 },
        training: { split: 'Full Body A/B/C' },
        units: { distance: 'km', height: 'in', weight: 'lb' },
      },
      provenance,
    });

    const block = await service.upsertBlock({
      durationWeeks: 8,
      name: 'Autogenerated Block',
      provenance,
      startDate: '2026-05-04',
    });

    assert.equal(block.trainingSplit, 'full_body_abc');
    assert.equal(block.sessionLengthMinutes, 60);
    assert.deepEqual(
      block.sessions.map((session) => session.title),
      ['Full Body A', 'Full Body B', 'Full Body C'],
    );
    assert.equal(block.sessions.every((session) => session.details?.mainBlocks.length), true);

    const projection = await service.getBlockProjection({ blockId: block.id, weekStart: '2026-05-04' });
    assert.equal(projection?.trainingSupportSummary.weekComplexity, 'medium');
    assert.equal(projection?.sessions[0]?.details?.loadHint, 'moderate');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function completesHealthOnboardingAndDiscoveryWithBlockTools() {
  const runtime = createTempRuntime();
  try {
    const core = new FluentCoreService(runtime.env.db, runtime.env);
    const health = new HealthService(runtime.env.db);

    await core.enableDomain('health', provenance);
    await core.beginDomainOnboarding('health', { onboardingVersion: '2' }, provenance);
    await health.updatePreferences({
      preferences: {
        days_per_week: 3,
        equipment_access: 'home gym',
        session_length_minutes: 40,
        training_experience: 'beginner',
        training_split: 'Full Body A/B/C',
        units: { distance: 'km', height: 'in', weight: 'lb' },
      },
      provenance,
    });
    const completed = await core.completeDomainOnboarding('health', { onboardingVersion: '2' }, provenance);
    assert.equal(completed.lifecycleState, 'enabled');
    assert.equal(completed.onboardingState, 'onboarding_completed');

    const capabilities = await core.getCapabilities();
    const healthGroup = capabilities.toolDiscovery.groups.find((group) => group.id === 'health_fitness');
    assert.equal(healthGroup?.domainReady, true);
    assert.deepEqual(healthGroup?.starterReadTools, ['health_get_context', 'health_get_active_block', 'health_get_today_context']);
    assert.deepEqual(healthGroup?.starterWriteTools, ['health_upsert_block', 'health_record_block_review', 'health_log_workout']);
    assert.equal(capabilities.readyDomains.includes('health'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-health-v2-'));
  tempRoots.push(root);
  return createLocalRuntime({ origin: 'http://127.0.0.1:8788', rootDir: root });
}
