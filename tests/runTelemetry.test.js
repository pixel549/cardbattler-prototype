import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRunAnalyticsDashboard,
  createRunTelemetry,
  ingestRunRecordAnalytics,
} from '../src/game/runTelemetry.js';

test('createRunTelemetry exposes the new pressure and scrap metrics', () => {
  const telemetry = createRunTelemetry();

  assert.equal(telemetry.ramStarvedTurns, 0);
  assert.equal(telemetry.lowRamTurns, 0);
  assert.equal(telemetry.peakHeat, 0);
  assert.equal(telemetry.scrapSpent, 0);
  assert.equal(telemetry.eliteCombatsEntered, 0);
  assert.equal(telemetry.bossCombatsLost, 0);
});

test('ingestRunRecordAnalytics aggregates starter pain points and first elite or boss wipes', () => {
  const lossAnalytics = ingestRunRecordAnalytics(null, {
    endTime: '2026-03-13T08:00:00.000Z',
    outcome: 'defeat',
    starterProfileId: 'ghost',
    starterProfileName: 'Ghost',
    difficultyId: 'standard',
    difficultyName: 'Standard',
    finalAct: 1,
    finalFloor: 6,
    runTelemetry: {
      ramStarvedTurns: 3,
      peakHeat: 15,
      scrapSpent: 4,
      criticalHeatTurns: 1,
    },
    encounters: [
      { nodeType: 'Combat', result: 'win' },
      { nodeType: 'Elite', result: 'loss' },
    ],
  });

  const finalAnalytics = ingestRunRecordAnalytics(lossAnalytics, {
    endTime: '2026-03-13T09:00:00.000Z',
    outcome: 'victory',
    starterProfileId: 'ghost',
    starterProfileName: 'Ghost',
    difficultyId: 'standard',
    difficultyName: 'Standard',
    finalAct: 3,
    finalFloor: 14,
    runTelemetry: {
      ramStarvedTurns: 1,
      peakHeat: 11,
      scrapSpent: 6,
      criticalHeatTurns: 0,
    },
    encounters: [
      { nodeType: 'Elite', result: 'win' },
      { nodeType: 'Boss', result: 'win' },
    ],
  });

  const dashboard = buildRunAnalyticsDashboard(finalAnalytics);
  const ghost = dashboard.profileRows.find((profile) => profile.id === 'ghost');

  assert.equal(dashboard.totalRuns, 2);
  assert.equal(dashboard.totalWins, 1);
  assert.equal(dashboard.firstEliteAttempts, 2);
  assert.equal(dashboard.firstEliteLosses, 1);
  assert.equal(dashboard.firstBossAttempts, 1);
  assert.equal(dashboard.firstBossLosses, 0);
  assert.equal(ghost.runs, 2);
  assert.equal(ghost.losses, 1);
  assert.equal(ghost.scrapSpent, 10);
  assert.equal(ghost.firstEliteLosses, 1);
  assert.equal(ghost.firstBossAttempts, 1);
});
