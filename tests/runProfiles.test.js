import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeRunConfig,
  getStarterProfileLoadoutSlots,
  resolveStarterProfileDeck,
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

test('starter profiles expose themed random loadout slots and resolve them deterministically', () => {
  const mockData = {
    cards: {
      'C-001': { id: 'C-001', type: 'Attack', tags: ['Core'] },
      'C-002': { id: 'C-002', type: 'Defense', tags: ['Core'] },
      'C-003': { id: 'C-003', type: 'Support', tags: ['Core'] },
      'C-004': { id: 'C-004', type: 'Utility', tags: ['Core'] },
      'C-006': { id: 'C-006', type: 'Attack', tags: ['Core'] },
      'NC-001': { id: 'NC-001', type: 'Attack', tags: [] },
      'NC-003': { id: 'NC-003', type: 'Defense', tags: ['Firewall'] },
      'SUP-01': { id: 'SUP-01', type: 'Support', tags: [] },
      'SUP-02': { id: 'SUP-02', type: 'Support', tags: [] },
      'UTL-01': { id: 'UTL-01', type: 'Utility', tags: [] },
      'UTL-02': { id: 'UTL-02', type: 'Utility', tags: [] },
    },
  };

  const slots = getStarterProfileLoadoutSlots('kernel');
  assert.equal(slots.length, 9);
  assert.equal(slots.filter((slot) => slot.kind === 'random').length, 2);

  const deckA = resolveStarterProfileDeck(mockData, 12345, 'kernel');
  const deckB = resolveStarterProfileDeck(mockData, 12345, 'kernel');

  assert.deepEqual(deckA, deckB);
  assert.equal(deckA.length, 9);
  assert.ok(deckA.includes('SUP-01') || deckA.includes('SUP-02'));
  assert.ok(deckA.includes('UTL-01') || deckA.includes('UTL-02'));
});
