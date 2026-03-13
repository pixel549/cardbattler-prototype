import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGameData, runAiSimulation, summarizeSimulationBatch } from '../tools/aiSimulationCore.mjs';

test('runAiSimulation produces a usable summary without runtime errors', () => {
  const data = loadGameData(process.cwd());
  const result = runAiSimulation({
    data,
    seed: 12345,
    playstyle: 'balanced',
    maxSteps: 60,
  });

  assert.equal(result.aiPlaystyle, 'balanced');
  assert.equal(result.aiPlaystyleLabel, 'Balanced');
  assert.ok(result.startingDeck.cardCount > 0);
  assert.ok(result.steps > 0);
  assert.ok(Array.isArray(result.encounters));
  assert.ok(result.errors.every((error) => /step cap/i.test(error)));
});

test('summarizeSimulationBatch aggregates wins and pressure metrics', () => {
  const summary = summarizeSimulationBatch([
    {
      outcome: 'victory',
      finalFloor: 15,
      runTelemetry: { peakHeat: 10, ramStarvedTurns: 2 },
      errors: [],
    },
    {
      outcome: 'defeat',
      finalFloor: 6,
      runTelemetry: { peakHeat: 16, ramStarvedTurns: 4 },
      errors: ['step cap'],
    },
  ]);

  assert.equal(summary.totalRuns, 2);
  assert.equal(summary.completedRuns, 2);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.averageFloor, 10.5);
  assert.equal(summary.averageHeatPeak, 13);
  assert.equal(summary.averageRamStarve, 3);
  assert.equal(summary.erroredRuns, 1);
});
