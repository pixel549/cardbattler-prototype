import fs from 'node:fs';
import path from 'node:path';

import { createInitialState } from '../src/game/game_core.js';
import { dispatchWithJournal } from '../src/game/dispatch_with_journal.js';
import { getAIAction } from '../src/game/aiPlayer.js';
import { getAiPlaystyleLabel } from '../src/game/aiPlaystyles.js';
import { DIFFICULTY_PROFILES, STARTER_PROFILES } from '../src/game/runProfiles.js';

export function loadGameData(rootDir = process.cwd()) {
  const gameDataPath = path.join(rootDir, 'src', 'data', 'gamedata.json');
  return JSON.parse(fs.readFileSync(gameDataPath, 'utf8'));
}

function getDeckCardIds(deck) {
  const master = Array.isArray(deck?.master) ? deck.master : [];
  return master.map((instanceId) => deck?.cardInstances?.[instanceId]?.defId || instanceId);
}

function snapshotDeck(deck) {
  const cardIds = getDeckCardIds(deck);
  return {
    cardCount: cardIds.length,
    cardIds,
  };
}

function cloneRunTelemetry(run) {
  return JSON.parse(JSON.stringify(run?.telemetry || {}));
}

function getCurrentNodeType(state) {
  return state?.map?.nodes?.[state?.map?.currentNodeId]?.type || 'Combat';
}

function getEncounterEnemies(combat) {
  return (combat?.enemies || [])
    .map((enemy) => enemy?.enemyDefId || enemy?.name || enemy?.id)
    .filter(Boolean);
}

function getEncounterLabel(encounter) {
  if (!encounter) return 'Unknown';
  if (encounter.encounterName) return encounter.encounterName;
  if (encounter.encounterId) return encounter.encounterId;
  if (Array.isArray(encounter.enemies) && encounter.enemies.length > 0) return encounter.enemies.join(' + ');
  return encounter.nodeType || 'Unknown';
}

function finalizeEncounter(encounter, state, result, lastCombatTurn = 0) {
  if (!encounter) return null;
  return {
    ...encounter,
    result,
    turns: Math.max(1, Number(lastCombatTurn || encounter.turns || 1)),
    hpAfter: state?.run?.hp ?? encounter.hpBefore ?? 0,
  };
}

export function runAiSimulation({
  data,
  seed = Date.now(),
  playstyle = 'balanced',
  starterProfileId = 'kernel',
  difficultyId = 'standard',
  challengeIds = [],
  maxSteps = 5000,
} = {}) {
  if (!data) throw new Error('runAiSimulation requires loaded game data.');

  let state = dispatchWithJournal(createInitialState(), data, {
    type: 'NewRun',
    seed,
    starterProfileId,
    difficultyId,
    challengeIds,
  });

  const encounters = [];
  const errors = [];
  const floorEvents = [];
  const startingDeck = snapshotDeck(state.deck);
  let currentEncounter = null;
  let lastCombatTurn = 0;
  let steps = 0;

  while (state.mode !== 'GameOver' && steps < maxSteps) {
    if (state.mode === 'Combat' && !currentEncounter) {
      currentEncounter = {
        act: state.run?.act ?? 1,
        floor: state.run?.floor ?? 1,
        nodeType: getCurrentNodeType(state),
        encounterId: state.combat?.encounterId ?? null,
        encounterName: state.combat?.encounterName ?? null,
        hpBefore: state.run?.hp ?? 0,
        enemies: getEncounterEnemies(state.combat),
        turns: state.combat?.turn ?? 1,
      };
    }

    if (state.mode === 'Combat') {
      lastCombatTurn = state.combat?.turn ?? lastCombatTurn;
    }

    const action = getAIAction(state, data, playstyle);
    if (!action) {
      errors.push(`No AI action returned in mode ${state.mode} at step ${steps}`);
      break;
    }

    if (action.type === 'Reward_PickCard' || action.type === 'Reward_Skip' || action.type === 'Reward_PickRelic') {
      floorEvents.push({
        act: state.run?.act ?? 1,
        floor: state.run?.floor ?? 1,
        type: action.type,
      });
    }

    const modeBeforeAction = state.mode;
    try {
      state = dispatchWithJournal(state, data, action);
    } catch (error) {
      errors.push(`Dispatch failed on ${action.type}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }

    if (modeBeforeAction === 'Combat' && state.mode !== 'Combat' && currentEncounter) {
      encounters.push(
        finalizeEncounter(
          currentEncounter,
          state,
          state.mode === 'GameOver' ? 'loss' : 'win',
          lastCombatTurn,
        ),
      );
      currentEncounter = null;
      lastCombatTurn = 0;
    }

    steps += 1;
  }

  if (currentEncounter) {
    encounters.push(finalizeEncounter(currentEncounter, state, 'incomplete', lastCombatTurn));
  }

  if (state.mode !== 'GameOver' && steps >= maxSteps) {
    errors.push(`Simulation hit the step cap (${maxSteps}) before reaching GameOver.`);
  }

  const starterProfile = STARTER_PROFILES[starterProfileId] || null;
  const difficultyProfile = DIFFICULTY_PROFILES[difficultyId] || null;
  const outcome = state.mode === 'GameOver'
    ? (state.run?.victory ? 'victory' : 'defeat')
    : 'incomplete';

  return {
    telemetryVersion: 5,
    exportProfile: 'summary',
    seed,
    aiPlaystyle: playstyle,
    aiPlaystyleLabel: getAiPlaystyleLabel(playstyle),
    starterProfileId,
    starterProfileName: starterProfile?.name || starterProfileId,
    difficultyId,
    difficultyName: difficultyProfile?.name || difficultyId,
    challengeIds: [...challengeIds],
    outcome,
    endTime: new Date().toISOString(),
    finalAct: state.run?.act ?? 1,
    finalFloor: state.run?.floor ?? 1,
    finalGold: state.run?.gold ?? 0,
    finalHP: state.run?.hp ?? 0,
    steps,
    startingDeck,
    endingDeck: snapshotDeck(state.deck),
    runTelemetry: cloneRunTelemetry(state.run),
    encounters,
    floorEvents,
    errors,
  };
}

export function summarizeSimulationBatch(records) {
  const safeRecords = Array.isArray(records) ? records : [];
  const wins = safeRecords.filter((record) => record?.outcome === 'victory').length;
  const completed = safeRecords.filter((record) => record?.outcome === 'victory' || record?.outcome === 'defeat');
  const completedEncounters = completed
    .map((record) => Array.isArray(record?.encounters) ? record.encounters : [])
    .flat();
  const averageFloor = completed.length > 0
    ? completed.reduce((sum, record) => sum + Number(record?.finalFloor || 0), 0) / completed.length
    : 0;
  const averageHeatPeak = completed.length > 0
    ? completed.reduce((sum, record) => sum + Number(record?.runTelemetry?.peakHeat || 0), 0) / completed.length
    : 0;
  const averageRamStarve = completed.length > 0
    ? completed.reduce((sum, record) => sum + Number(record?.runTelemetry?.ramStarvedTurns || 0), 0) / completed.length
    : 0;
  const firstCombats = completed
    .map((record) => (record?.encounters || []).find((encounter) => encounter?.nodeType === 'Combat'))
    .filter(Boolean);
  const floorFiveEntries = completed
    .map((record) => (record?.encounters || []).find((encounter) => Number(encounter?.floor || 0) >= 5))
    .filter(Boolean);
  const averageFirstCombatHpAfter = firstCombats.length > 0
    ? firstCombats.reduce((sum, encounter) => sum + Number(encounter?.hpAfter || 0), 0) / firstCombats.length
    : 0;
  const averageHpEnteringFloorFive = floorFiveEntries.length > 0
    ? floorFiveEntries.reduce((sum, encounter) => sum + Number(encounter?.hpBefore || 0), 0) / floorFiveEntries.length
    : 0;
  const averageEncounterTurns = completedEncounters.length > 0
    ? completedEncounters.reduce((sum, encounter) => sum + Number(encounter?.turns || 0), 0) / completedEncounters.length
    : 0;
  const floorHistogram = Object.fromEntries(
    [...completed.reduce((hist, record) => {
      const floor = Number(record?.finalFloor || 0);
      hist.set(floor, (hist.get(floor) || 0) + 1);
      return hist;
    }, new Map()).entries()].sort((a, b) => a[0] - b[0]),
  );
  const defeatingEncounterMap = new Map();
  for (const record of completed.filter((entry) => entry?.outcome === 'defeat')) {
    const lastEncounter = (record?.encounters || []).slice(-1)[0];
    if (!lastEncounter) continue;
    const key = lastEncounter.encounterId
      || lastEncounter.encounterName
      || JSON.stringify(lastEncounter.enemies || [])
      || 'Unknown';
    const current = defeatingEncounterMap.get(key) || {
      label: getEncounterLabel(lastEncounter),
      count: 0,
      totalFloor: 0,
      totalTurns: 0,
    };
    current.count += 1;
    current.totalFloor += Number(lastEncounter.floor || 0);
    current.totalTurns += Number(lastEncounter.turns || 0);
    defeatingEncounterMap.set(key, current);
  }
  const topDefeatingEncounters = [...defeatingEncounterMap.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.totalFloor - a.totalFloor;
    })
    .slice(0, 5)
    .map((entry) => ({
      label: entry.label,
      count: entry.count,
      averageFloor: entry.count > 0 ? entry.totalFloor / entry.count : 0,
      averageTurns: entry.count > 0 ? entry.totalTurns / entry.count : 0,
    }));
  const erroredRuns = safeRecords.filter((record) => Array.isArray(record?.errors) && record.errors.length > 0).length;

  return {
    totalRuns: safeRecords.length,
    completedRuns: completed.length,
    wins,
    losses: completed.length - wins,
    winRate: completed.length > 0 ? wins / completed.length : 0,
    averageFloor,
    averageHeatPeak,
    averageRamStarve,
    averageFirstCombatHpAfter,
    averageHpEnteringFloorFive,
    averageEncounterTurns,
    floorHistogram,
    topDefeatingEncounters,
    erroredRuns,
  };
}
