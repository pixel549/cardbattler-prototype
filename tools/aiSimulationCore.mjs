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
  const averageFloor = completed.length > 0
    ? completed.reduce((sum, record) => sum + Number(record?.finalFloor || 0), 0) / completed.length
    : 0;
  const averageHeatPeak = completed.length > 0
    ? completed.reduce((sum, record) => sum + Number(record?.runTelemetry?.peakHeat || 0), 0) / completed.length
    : 0;
  const averageRamStarve = completed.length > 0
    ? completed.reduce((sum, record) => sum + Number(record?.runTelemetry?.ramStarvedTurns || 0), 0) / completed.length
    : 0;
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
    erroredRuns,
  };
}
