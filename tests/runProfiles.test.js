import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeRunConfig,
  getUnlockedDifficulties,
  getUnlockedStarterProfiles,
} from '../src/game/runProfiles.js';

test('composeRunConfig applies starter, difficulty, and challenge modifiers together', () => {
  const config = composeRunConfig({}, 'architect', 'ascension_2', ['low_bandwidth']);

  assert.equal(config.playerMaxHP, 79);
  assert.equal(config.startingGold, 96);
  assert.equal(config.travelHpCost, 3);
  assert.equal(config.drawPerTurnDelta, -1);
  assert.equal(config.enemyHpMult, 1.18);
  assert.equal(config.enemyDmgMult, 1.14);
});

test('unlock helpers surface newly earned starter profiles and ascensions', () => {
  const metaProgress = {
    totalRuns: 1,
    totalWins: 1,
    bestActReached: 2,
    totalUniqueMutations: 10,
    highestDifficultyRankCleared: 2,
  };

  assert.deepEqual(
    getUnlockedStarterProfiles(metaProgress).map((profile) => profile.id),
    ['kernel', 'bruteforce', 'ghost', 'architect', 'scrapper'],
  );
  assert.deepEqual(
    getUnlockedDifficulties(metaProgress).map((difficulty) => difficulty.id),
    ['standard', 'ascension_1', 'ascension_2', 'ascension_3'],
  );
});
