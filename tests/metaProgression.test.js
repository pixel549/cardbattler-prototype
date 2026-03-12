import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRunResultToMetaProgress,
  createDefaultMetaProgress,
} from '../src/game/metaProgression.js';

test('applyRunResultToMetaProgress tracks bosses, mutations, and unlocks after a win', () => {
  const base = createDefaultMetaProgress();
  const run = {
    seed: 42,
    victory: true,
    act: 3,
    floor: 28,
    starterProfileId: 'kernel',
    difficultyId: 'standard',
    challengeIds: [],
    encounterHistory: [
      { kind: 'boss', id: 'BOSS-001', act: 1 },
      { kind: 'boss', id: 'BOSS-002', act: 2 },
    ],
    seenMutationIds: ['MUT-001', 'MUT-002'],
    telemetry: {
      bossesDefeated: 2,
      highestActReached: 3,
    },
  };

  const { nextMetaProgress, newUnlocks, summary } = applyRunResultToMetaProgress(base, run);

  assert.equal(summary.victory, true);
  assert.equal(nextMetaProgress.totalRuns, 1);
  assert.equal(nextMetaProgress.totalWins, 1);
  assert.equal(nextMetaProgress.totalBossesDefeated, 2);
  assert.equal(nextMetaProgress.bestActReached, 3);
  assert.deepEqual(nextMetaProgress.bossEncounterIdsSeen, ['BOSS-001', 'BOSS-002']);
  assert.deepEqual(nextMetaProgress.bossEncounterIdsDefeated, ['BOSS-001', 'BOSS-002']);
  assert.deepEqual(nextMetaProgress.mutationIdsSeen, ['MUT-001', 'MUT-002']);
  assert.ok(newUnlocks.some((unlock) => unlock.type === 'profile' && unlock.id === 'bruteforce'));
  assert.ok(newUnlocks.some((unlock) => unlock.type === 'difficulty' && unlock.id === 'ascension_1'));
  assert.ok(newUnlocks.some((unlock) => unlock.type === 'challenge' && unlock.id === 'glass_route'));
  assert.ok(newUnlocks.some((unlock) => unlock.type === 'challenge' && unlock.id === 'endless_protocol'));
});
