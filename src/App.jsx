import { useState, useEffect, useRef, useCallback } from 'react';
import { loadGameData } from './data/loadData';
import { createInitialState, dispatchGame } from './game/game_core';
import { dispatchWithJournal } from './game/dispatch_with_journal';
import CombatScreen from './components/CombatScreen';
import AIDebugPanel from './components/AIDebugPanel';
import { getAIAction, AI_PLAYSTYLES } from './game/aiPlayer';
import { decodeDebugSeed, decodeSensibleDebugSeed, randomDebugSeed } from './game/debugSeed';
import { createBasicEventRegistry } from './game/events';
import { MINIGAME_REGISTRY, isMinigameEvent } from './game/minigames';
import { getRunMods } from './game/rules_mods';
import { sfx } from './game/sounds';
import { getEventImage } from './data/eventImages';
import { getCardImage } from './data/cardImages';
import useDialogAccessibility from './hooks/useDialogAccessibility';

// Module-level event registry (created once)
const EVENT_REG_UI = createBasicEventRegistry();

// ============================================================
// SHARED CONSTANTS
// ============================================================
const C = {
  bg: '#0a0a0f',
  bgCard: '#12121a',
  bgBar: '#0d0d14',
  border: '#2a2a3a',
  cyan: '#00f0ff',
  orange: '#ff6b00',
  red: '#ff2a2a',
  green: '#00ff6b',
  purple: '#b44aff',
  yellow: '#ffe600',
  text: '#e0e0e0',
  textDim: '#888',
  textMuted: '#555',
};

const UI_MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

const NODE_COLORS = {
  Combat: C.orange,
  Elite: C.red,
  Boss: C.purple,
  Shop: C.yellow,
  Rest: C.green,
  Event: C.cyan,
  Start: C.textMuted,
};

const NODE_ICONS = {
  Combat: '\u2694',
  Elite: '\u2620',
  Boss: '\uD83D\uDC51',
  Shop: '\uD83D\uDED2',
  Rest: '\u2665',
  Event: '?',
  Start: '\u25CF',
};

const CARD_TYPE_COLORS = {
  Attack: C.red,
  Skill: C.green,
  Power: C.purple,
  Defense: C.cyan,
  Support: C.green,
  Utility: C.yellow,
  default: C.cyan,
};

const MENU_CARD_RATIO = '13 / 18';
const MENU_CARD_MIN_W = 156;
const MENU_CARD_MAX_W = 188;

const TELEMETRY_VERSION = 5;
const KNOWN_ENEMY_ACTION_TYPES = new Set(['Attack', 'Defense', 'Buff', 'Debuff']);
const AI_EXPORT_OPTIONS_DEFAULTS = {
  cards: true,
  mutations: true,
  hp: true,
  hands: true,
  floor: true,
  decks: true,
};
const AI_STALL_EXPORT_MS = 15000;
const AI_STALL_RECOVER_MS = 28000;
const NODE_AUTOSAVE_KEY = 'cb_node_autosave_v1';
const FORCE_NEW_RUN_KEY = 'cb_force_new_run_v1';
const AI_WATCHDOG_IDLE = {
  active: false,
  stagnantMs: 0,
  exportTriggered: false,
  recoveryTriggered: false,
  lastChangedAt: 0,
};

function buildNodeAutosaveToken(state) {
  if (!state?.run || !state?.map?.currentNodeId) return null;
  if (!['Combat', 'Shop', 'Event'].includes(state.mode)) return null;
  return [
    state.run.seed ?? 'seed',
    state.run.act ?? 'act',
    state.run.floor ?? 'floor',
    state.map.currentNodeId,
    state.mode,
    state.event?.eventId ?? '',
  ].join(':');
}

function buildNodeAutosaveState(state) {
  const snapshot = JSON.parse(JSON.stringify(state));
  snapshot.log = [];
  snapshot.deckView = null;
  if (snapshot.journal) {
    snapshot.journal.actions = [];
  }
  return snapshot;
}

function writeNodeAutosave(state) {
  const token = buildNodeAutosaveToken(state);
  if (!token) return null;
  const payload = {
    version: 1,
    savedAt: Date.now(),
    token,
    state: buildNodeAutosaveState(state),
  };
  localStorage.setItem(NODE_AUTOSAVE_KEY, JSON.stringify(payload));
  return token;
}

function readNodeAutosave() {
  try {
    const raw = localStorage.getItem(NODE_AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.state?.run || !parsed?.state?.map) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearNodeAutosave() {
  localStorage.removeItem(NODE_AUTOSAVE_KEY);
}

function queueForcedNewRun(payload) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(FORCE_NEW_RUN_KEY, JSON.stringify({
      requestedAt: Date.now(),
      ...payload,
    }));
  } catch (error) {
    console.error('Failed to queue forced new run', error);
  }
}

function consumeForcedNewRun() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(FORCE_NEW_RUN_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(FORCE_NEW_RUN_KEY);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getFirewallStacksFromEntity(entity) {
  return entity?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
}

function getAiStateSignature(state) {
  if (!state) return 'none';

  const base = [
    state.mode ?? 'Unknown',
    state.run?.act ?? 'x',
    state.run?.floor ?? 'x',
    state.run?.hp ?? 'x',
    state.run?.gold ?? 'x',
  ];

  if (state.mode === 'Combat' && state.combat) {
    const player = state.combat.player ?? {};
    const handBits = (player.piles?.hand || [])
      .map((cid) => {
        const ci = state.combat.cardInstances?.[cid];
        return ci ? `${ci.defId}:${ci.useCounter ?? 0}:${ci.finalMutationCountdown ?? 0}` : cid;
      })
      .join('|');
    const enemyBits = (state.combat.enemies || [])
      .map((enemy) => `${enemy.id}:${enemy.hp}:${getFirewallStacksFromEntity(enemy)}`)
      .join('|');
    return [
      ...base,
      state.combat.turn ?? 0,
      player.hp ?? state.run?.hp ?? 0,
      player.ram ?? 0,
      getFirewallStacksFromEntity(player),
      state.combat._scryPending ? 'scry' : 'combat',
      handBits,
      enemyBits,
    ].join('::');
  }

  if (state.mode === 'Map' && state.map) {
    return [
      ...base,
      state.map.currentNodeId ?? 'start',
      (state.map.selectableNext || []).join(','),
    ].join('::');
  }

  if (state.mode === 'Reward' && state.reward) {
    return [
      ...base,
      (state.reward.cardChoices || []).join(','),
      (state.reward.relicChoices || []).join(','),
    ].join('::');
  }

  if (state.mode === 'Shop' && state.shop) {
    return [
      ...base,
      (state.shop.offers || []).map((offer) => `${offer.kind}:${offer.defId ?? offer.relicId ?? offer.serviceId ?? '?'}`).join(','),
      state.run?.gold ?? 0,
    ].join('::');
  }

  if (state.mode === 'Event' && state.event) {
    return [
      ...base,
      state.event.eventId ?? 'event',
      state.event.pendingSelectOp ?? '',
      (state.event.choices || []).map((choice) => choice.id || choice.label || '?').join(','),
    ].join('::');
  }

  if (state.deckView && state.deck) {
    return [
      ...base,
      'deckView',
      state.shop?.pendingService ?? state.event?.pendingSelectOp ?? '',
      (state.deck.master || []).length,
    ].join('::');
  }

  return base.join('::');
}

function normalizeAiExportOptions(raw = null) {
  const out = { ...AI_EXPORT_OPTIONS_DEFAULTS };
  for (const key of Object.keys(out)) {
    if (typeof raw?.[key] === 'boolean') out[key] = raw[key];
  }
  return out;
}

function getAiExportProfileLabel(options) {
  const enabled = Object.entries(options).filter(([, value]) => value).map(([key]) => key);
  if (enabled.length === Object.keys(AI_EXPORT_OPTIONS_DEFAULTS).length) return 'all';
  if (enabled.length === 0) return 'summary';
  return 'custom';
}

function filterEncounterForExport(encounter, options) {
  const out = { ...encounter };
  if (!options.cards) {
    out.cardPlayTimeline = [];
    out.enemyPlayTimeline = [];
    delete out.tacticalSummary;
  }
  if (!options.hp) {
    delete out.hpBefore;
    delete out.hpAfter;
    delete out.totalDamageDealt;
    delete out.totalDamageReceived;
    delete out.damageBreakdown;
  }
  if (!options.mutations) {
    out.mutationEvents = [];
    out.mutationTriggerChecks = [];
    delete out.forcedMutationTier;
  }
  if (!options.hands) {
    out.handTimeline = [];
  }
  return out;
}

function filterRunRecordForExport(run, options) {
  const normalized = normalizeAiExportOptions(options);
  const filtered = {
    ...run,
    exportProfile: getAiExportProfileLabel(normalized),
    exportOptions: normalized,
    encounters: (run.encounters || []).map((encounter) => filterEncounterForExport(encounter, normalized)),
    cardEvents: normalized.cards ? [...(run.cardEvents || [])] : [],
    floorEvents: normalized.floor ? [...(run.floorEvents || [])] : [],
    deckSnapshots: normalized.decks ? [...(run.deckSnapshots || [])] : [],
    seenMutationIds: normalized.mutations ? [...(run.seenMutationIds || [])] : [],
  };

  if (!normalized.decks) {
    filtered.startingDeck = {
      ...filtered.startingDeck,
      cards: [],
      enemyCardIds: [],
      enemyCardNames: [],
    };
    filtered.endingDeck = {
      ...filtered.endingDeck,
      cards: [],
      enemyCardIds: [],
      enemyCardNames: [],
    };
  }

  if (!normalized.mutations) {
    filtered.forcedMutationTier = null;
  }

  return filtered;
}

function getSecondaryActionButtonStyle(accent = C.cyan, overrides = {}) {
  return {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    fontFamily: UI_MONO,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    transition: 'all 0.15s ease',
    background: `linear-gradient(180deg, ${accent}18 0%, rgba(10,10,15,0.94) 100%)`,
    border: `1px solid ${accent}60`,
    boxShadow: `0 0 18px ${accent}12, inset 0 1px 0 rgba(255,255,255,0.06)`,
    color: accent,
    cursor: 'pointer',
    ...overrides,
  };
}

function buildExportDebugOverrides(runDbg) {
  if (!runDbg) return null;
  return {
    playerMaxHP:       runDbg.playerMaxHP,
    startingCardCount: runDbg.startingCardCount,
    startingCardIds:   runDbg.startingCardIds ?? null,
    enemyHpMult:       runDbg.enemyHpMult,
    enemyDmgMult:      runDbg.enemyDmgMult,
    playerMaxRAM:      runDbg.playerMaxRAM,
    drawPerTurnDelta:  runDbg.drawPerTurnDelta,
    actOverride:       runDbg.actOverride,
    encounterKind:     runDbg.encounterKind,
  };
}

function isEnemyLikeCardDef(defId, data) {
  const def = data?.cards?.[defId];
  const tags = def?.tags || [];
  return String(defId || '').startsWith('EC-')
    || tags.includes('EnemyCard')
    || tags.includes('EnemyAbility');
}

function buildDeckAnalysis(cardIds, data) {
  const ids = (cardIds || []).filter(Boolean);
  const enemyCardIds = ids.filter((defId) => isEnemyLikeCardDef(defId, data));
  return {
    cards: ids,
    cardCount: ids.length,
    uniqueCardCount: new Set(ids).size,
    enemyCardIds,
    enemyCardCount: enemyCardIds.length,
    enemyCardNames: enemyCardIds.map((defId) => data?.cards?.[defId]?.name || defId),
  };
}

function getCombatEntityName(state, entityId) {
  if (!entityId) return null;
  if (state?.combat?.player?.id === entityId) return state.combat.player.name || 'Player';
  const enemy = (state?.combat?.enemies || []).find((candidate) => candidate?.id === entityId);
  return enemy?.name ?? enemy?.enemyDefId ?? entityId;
}

function formatRunEndSummary(logMessage, fallback) {
  const cleaned = String(logMessage || '')
    .replace(/^Run ended:\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + '.';
}

function deriveCauseOfDeath(state, encounters = []) {
  if (!state?.run || state.run?.victory) return null;
  if (state.mode !== 'GameOver' && (state.run.hp ?? 1) > 0) return null;

  const log = Array.isArray(state.log) ? state.log : [];
  const reversedLog = [...log].reverse();
  const playerId = state?.combat?.player?.id ?? null;
  const latestRunEnd = reversedLog.find((entry) => entry?.t === 'Info' && /^Run ended:/i.test(entry.msg || ''));
  const lastDamageToPlayer = reversedLog.find((entry) => {
    if (entry?.t !== 'DamageDealt' || !entry.data) return false;
    const targetId = entry.data.targetId;
    if (!targetId) return false;
    if (playerId && targetId === playerId) return true;
    return targetId === 'player' || targetId === 'Player';
  });
  const lastLossEncounter = [...encounters].reverse().find((encounter) => encounter?.result === 'loss');
  const encounterReason = typeof lastLossEncounter?.outcomeReason === 'string' && lastLossEncounter.outcomeReason.trim()
    ? lastLossEncounter.outcomeReason.trim()
    : null;

  if (/travel damage/i.test(latestRunEnd?.msg || '')) {
    const travelTick = reversedLog.find((entry) => entry?.t === 'Info' && /^Travel at 0 MP:/i.test(entry.msg || ''));
    return {
      category: 'travel',
      summary: travelTick?.msg ? `${travelTick.msg}.` : 'Travel damage at 0 MP reduced you to 0 HP.',
      logMessage: latestRunEnd?.msg ?? null,
      sourceId: null,
      sourceName: null,
      damage: null,
    };
  }

  if (/died in event/i.test(latestRunEnd?.msg || '')) {
    return {
      category: 'event',
      summary: 'An event penalty reduced you to 0 HP.',
      logMessage: latestRunEnd?.msg ?? null,
      sourceId: null,
      sourceName: null,
      damage: null,
    };
  }

  if (/minigame penalty/i.test(latestRunEnd?.msg || '')) {
    return {
      category: 'minigame',
      summary: 'A minigame penalty reduced you to 0 HP.',
      logMessage: latestRunEnd?.msg ?? null,
      sourceId: null,
      sourceName: null,
      damage: null,
    };
  }

  if (latestRunEnd || lastDamageToPlayer || encounterReason) {
    const sourceId = lastDamageToPlayer?.data?.sourceId ?? null;
    const sourceName = sourceId
      ? (sourceId === playerId ? 'your own effect' : getCombatEntityName(state, sourceId))
      : null;
    const finalDamage = Number(lastDamageToPlayer?.data?.finalDamage ?? NaN);
    const damage = Number.isFinite(finalDamage) ? finalDamage : null;
    const absorbed = Number(lastDamageToPlayer?.data?.protectionAbsorbed
      ?? lastDamageToPlayer?.data?.firewallAbsorbed
      ?? lastDamageToPlayer?.data?.blocked
      ?? NaN);
    const absorbedDamage = Number.isFinite(absorbed) ? absorbed : null;

    let summary = null;
    if (sourceName && damage != null) {
      summary = `${sourceName} dealt the killing blow for ${damage} damage.`;
    } else if (sourceName) {
      summary = `${sourceName} dealt the killing blow.`;
    } else if (encounterReason) {
      summary = encounterReason;
    } else {
      summary = formatRunEndSummary(latestRunEnd?.msg, 'You were defeated in combat.');
    }

    return {
      category: 'combat',
      summary,
      logMessage: latestRunEnd?.msg ?? null,
      encounterReason,
      sourceId,
      sourceName,
      damage,
      absorbedDamage,
    };
  }

  return {
    category: 'unknown',
    summary: 'The run ended, but the exact cause could not be reconstructed.',
    logMessage: latestRunEnd?.msg ?? null,
    sourceId: null,
    sourceName: null,
    damage: null,
  };
}

function buildRunRecord({
  runIndex,
  state,
  data,
  seedMode,
  aiPlaystyle,
  encounters,
  deckSnapshots,
  cardEvents,
  floorEvents,
  outcome,
}) {
  const runDbg = state.run?.debugOverrides;
  const currentDeckIds = (state.deck?.master || [])
    .map((instanceId) => state.deck?.cardInstances?.[instanceId]?.defId ?? null)
    .filter(Boolean);
  const firstSnap = deckSnapshots[0];
  const lastSnap = deckSnapshots[deckSnapshots.length - 1];
  const startingDeck = buildDeckAnalysis(firstSnap?.cards || currentDeckIds, data);
  const endingDeck = buildDeckAnalysis(lastSnap?.cards || currentDeckIds, data);
  const finalRelicIds = [...(state.run?.relicIds || [])];
  const runRuleMods = getRunMods(data, finalRelicIds);
  const debugSeedActive = state.run?.debugSeed != null;
  const telemetryFlags = [];
  const causeOfDeath = deriveCauseOfDeath(state, encounters);
  const recentLog = (state.log || []).slice(-20).map((entry) => ({
    t: entry?.t ?? 'Info',
    msg: entry?.msg ?? '',
  }));
  if (startingDeck.enemyCardCount > 0) telemetryFlags.push('starting_deck_contains_enemy_cards');
  if (endingDeck.enemyCardCount > 0) telemetryFlags.push('ending_deck_contains_enemy_cards');

  return {
    telemetryVersion: TELEMETRY_VERSION,
    runIndex,
    seed:           state.run?.seed      ?? null,
    debugSeed:      state.run?.debugSeed ?? null,
    debugSeedActive,
    debugSeedMode:  debugSeedActive ? (runDbg?._mode ?? seedMode ?? 'wild') : null,
    aiPlaystyle,
    aiPlaystyleLabel: AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle,
    debugOverrides: buildExportDebugOverrides(runDbg),
    relicIds:       finalRelicIds,
    relicNames:     finalRelicIds.map((rid) => data?.relics?.[rid]?.name || rid),
    runRuleMods,
    forcedMutationTier: state.run?.forcedMutationTier ?? null,
    seenMutationIds:    [...(state.run?.seenMutationIds || [])],
    endTime:        new Date().toISOString(),
    outcome,
    finalAct:       state.run?.act   ?? 1,
    finalFloor:     state.run?.floor ?? 0,
    finalHp:        state.run?.hp    ?? 0,
    maxHp:          state.run?.maxHP ?? 0,
    finalGold:      state.run?.gold  ?? 0,
    deckSize:       state.deck?.master?.length ?? 0,
    startingDeck,
    endingDeck,
    telemetryFlags,
    causeOfDeath,
    causeOfDeathSummary: causeOfDeath?.summary ?? null,
    recentLog,
    encounters:     encounters.slice(),
    deckSnapshots:  deckSnapshots.slice(),
    cardEvents:     cardEvents.slice(),
    floorEvents:    floorEvents.slice(),
  };
}

function cloneEncounterScratch(cs) {
  if (!cs) return null;
  if (typeof structuredClone === 'function') return structuredClone(cs);
  return JSON.parse(JSON.stringify(cs));
}

function finalizeEncounterForExport(cs, state, finalMode, defaultResult = null) {
  if (!cs) return null;
  const snapshot = cloneEncounterScratch(cs);
  ingestCombatLogEntries(snapshot, state?.log ?? [], state?.combat?.turn ?? snapshot.turns ?? 0);
  if (snapshot.result == null) snapshot.result = defaultResult;
  snapshot.endMode = finalMode ?? snapshot.endMode ?? null;
  snapshot.hpAfter = state?.run?.hp ?? snapshot.hpAfter ?? 0;
  snapshot.rawTurnCounter = snapshot.turns ?? 0;
  snapshot.turns = snapshot._hadActivity ? (snapshot.rawTurnCounter + 1) : snapshot.rawTurnCounter;
  snapshot.openingTurnCombat = snapshot._hadActivity && snapshot.rawTurnCounter === 0;
  if (snapshot.damageBreakdown?.playerDealt) {
    snapshot.damageBreakdown.playerDealt.netHpDeltaTotal = snapshot.totalDamageDealt;
    snapshot.damageBreakdown.playerDealt.deltaVsDamageEvents = snapshot.totalDamageDealt - snapshot.damageBreakdown.playerDealt.total;
  }
  if (snapshot.damageBreakdown?.playerReceived) {
    snapshot.damageBreakdown.playerReceived.netHpLossTotal = snapshot.totalDamageReceived;
    snapshot.damageBreakdown.playerReceived.deltaVsDamageEvents = snapshot.totalDamageReceived - snapshot.damageBreakdown.playerReceived.total;
  }
  snapshot.inProgress = snapshot.result === 'in_progress';
  const { _lastPlayerHp, _lastEnemyHp, _logOffset, _hadActivity, ...encounter } = snapshot;
  return encounter;
}

function ingestCombatLogEntries(cs, log, turnHint = 0) {
  if (!cs) return;

  const entries = log || [];
  const start = cs._logOffset ?? 0;
  const trackedTurn = Math.max(0, turnHint || 0);

  for (let li = start; li < entries.length; li++) {
    const entry = entries[li];

    if (entry.t === 'CardPlayed' && entry.data) {
      cs.totalCardsPlayed += 1;
      cs.totalRAMSpent += entry.data.cost || 0;
      cs.cardPlayTimeline.push({
        seq: cs.cardPlayTimeline.length,
        turn: trackedTurn,
        ...entry.data,
      });
      if (entry.data.tacticalFlags?.attackIntoProtection) {
        cs.tacticalSummary.attackIntoProtection += 1;
      }
      if (entry.data.tacticalFlags?.attackIntoProtectionWithAffordableBreach) {
        cs.tacticalSummary.attackIntoProtectionWithAffordableBreach += 1;
      }
      if (entry.data.tacticalFlags?.breachIntoUnshieldedTarget) {
        cs.tacticalSummary.breachIntoUnshieldedTarget += 1;
      }
      if (entry.data.tacticalFlags?.firewallSpendWithoutFirewall) {
        cs.tacticalSummary.firewallSpendWithoutFirewall += 1;
      }
      cs._hadActivity = true;
      continue;
    }

    if (entry.t === 'EnemyCardPlayed' && entry.data) {
      cs.enemyCardsPlayed += 1;
      const intentType = KNOWN_ENEMY_ACTION_TYPES.has(entry.data.intentType) ? entry.data.intentType : 'Other';
      cs.enemyActionTypes[intentType] = (cs.enemyActionTypes[intentType] || 0) + 1;
      cs.enemyPlayTimeline.push({
        seq: cs.enemyPlayTimeline.length,
        turn: trackedTurn,
        ...entry.data,
      });
      if (intentType === 'Defense') {
        cs.tacticalSummary.enemyDefenseActions += 1;
      }
      cs.tacticalSummary.enemyProtectionGain += Number(entry.data.effectSummary?.defense || 0);
      cs.tacticalSummary.enemyFirewallGain += Number(entry.data.effectSummary?.firewallGain || 0);
      cs._hadActivity = true;
      continue;
    }

    if (entry.t === 'DamageDealt' && entry.data) {
      const d = entry.data;
      if (d.isPlayerSource) {
        cs.damageBreakdown.playerDealt.total += d.finalDamage;
        cs.damageBreakdown.playerDealt.totalBlocked += d.blocked;
        cs.damageBreakdown.playerDealt.totalFirewallAbsorbed += d.firewallAbsorbed || 0;
        cs.damageBreakdown.playerDealt.eventCount += 1;
        if (d.weakened) cs.damageBreakdown.playerDealt.weakenedHits++;
        if (d.vulnerable) cs.damageBreakdown.playerDealt.vulnerableHits++;
      } else {
        cs.damageBreakdown.playerReceived.total += d.finalDamage;
        cs.damageBreakdown.playerReceived.totalBlocked += d.blocked;
        cs.damageBreakdown.playerReceived.totalFirewallAbsorbed += d.firewallAbsorbed || 0;
        cs.damageBreakdown.playerReceived.eventCount += 1;
        if (d.weakened) cs.damageBreakdown.playerReceived.weakenedHits++;
        if (d.vulnerable) cs.damageBreakdown.playerReceived.vulnerableHits++;
      }
      cs._hadActivity = true;
      continue;
    }

    if (entry.t === 'MutationApplied') {
      cs.mutationEvents.push({
        turn:           trackedTurn,
        type:           'mutation',
        cardInstanceId: entry.data?.cardInstanceId ?? null,
        cardDefId:      entry.data?.cardDefId ?? null,
        mutationName:   entry.data?.mutationName ?? null,
        tier:           entry.data?.tier ?? null,
        mutationId:     entry.data?.mutationId ?? entry.msg?.replace('Mutation ', '') ?? null,
        isNewInRun:     entry.data?.isNewInRun ?? null,
      });
      cs._hadActivity = true;
      continue;
    }

    if (entry.t === 'FinalMutation') {
      const isBrick = entry.data?.outcome
        ? entry.data.outcome === 'brick'
        : entry.msg?.includes('BRICK');
      cs.mutationEvents.push({
        turn:           trackedTurn,
        type:           'final',
        cardInstanceId: entry.data?.cardInstanceId ?? null,
        cardDefId:      entry.data?.cardDefId ?? null,
        outcome:        isBrick ? 'brick' : 'rewrite',
        newDefId:       !isBrick ? (entry.data?.newDefId ?? (entry.msg?.includes('->') ? entry.msg.split('-> ')[1]?.trim() : null)) : null,
      });
      cs._hadActivity = true;
      continue;
    }

    if (entry.t === 'MutationTriggerCheck' && entry.data) {
      cs.mutationTriggerChecks.push({
        seq: cs.mutationTriggerChecks.length,
        turn: entry.data.turn ?? trackedTurn,
        ...entry.data,
      });
      cs._hadActivity = true;
      continue;
    }

    if (entry.t === 'HandState' && entry.data) {
      cs.handTimeline.push({
        seq: cs.handTimeline.length,
        ...entry.data,
        turn: entry.data.turn ?? trackedTurn,
      });
      cs._hadActivity = true;
      continue;
    }

    if (entry.t === 'Info' && entry.msg) {
      if (
        /Combat victory/i.test(entry.msg)
        || /Player defeated/i.test(entry.msg)
        || /Run ended: defeated/i.test(entry.msg)
      ) {
        cs.outcomeReason = entry.msg;
      }
    }
  }

  cs._logOffset = entries.length;
}


function getCardColor(type) {
  return CARD_TYPE_COLORS[type] || CARD_TYPE_COLORS.default;
}

function formatMutationCounter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.ceil(numeric));
}

function isCoreCard(card) {
  return (card?.tags || []).includes('Core');
}

function getCardLifecycleDisplay(card, instance) {
  const core = isCoreCard(card);
  const nextValue = core ? 'N/A' : formatMutationCounter(instance?.useCounter);
  const finalValue = core ? 'N/A' : formatMutationCounter(instance?.finalMutationCountdown);
  const isDecaying = !core
    && !instance?.finalMutationId
    && instance?.finalMutationCountdown != null
    && instance.finalMutationCountdown <= 5;
  return { core, nextValue, finalValue, isDecaying };
}

function getCardUseCounterLimit(card, instance, data) {
  let maxUse = Number(card?.defaultUseCounter ?? 12);
  for (const mid of instance?.appliedMutations || []) {
    maxUse += Number(data?.mutations?.[mid]?.useCounterDelta ?? 0);
  }
  return Math.max(1, Number.isFinite(maxUse) ? maxUse : 12);
}

function CardChoiceTile({
  cardId,
  card,
  instance = null,
  onClick,
  disabled = false,
  price = null,
  selected = false,
}) {
  if (!card) return null;

  const color = getCardColor(card.type);
  const imgSrc = getCardImage(cardId);
  const tags = (card.tags || []).filter((tag) => !['Core', 'EnemyCard'].includes(tag));
  const mutations = instance?.appliedMutations || [];
  const isBricked = instance?.finalMutationId === 'J_BRICK';
  const isRewritten = instance?.finalMutationId === 'J_REWRITE';
  const { nextValue: visibleUseCounter, finalValue: visibleFinalCounter, isDecaying } = getCardLifecycleDisplay(card, instance);
  const effectText = describeEffects(card.effects);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        maxWidth: `${MENU_CARD_MAX_W}px`,
        aspectRatio: MENU_CARD_RATIO,
        minHeight: 216,
        borderRadius: 16,
        overflow: 'hidden',
        textAlign: 'left',
        position: 'relative',
        justifySelf: 'center',
        alignSelf: 'start',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        padding: 0,
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundColor: C.bgCard,
        border: `2px solid ${selected ? C.yellow : isBricked ? C.red : isDecaying ? C.orange : color}55`,
        boxShadow: selected
          ? `0 0 24px ${C.yellow}35, 0 14px 28px rgba(0,0,0,0.45)`
          : `0 0 18px ${color}18, 0 10px 24px rgba(0,0,0,0.36)`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
      }}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={card.name}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            display: 'block',
            transform: 'scale(1.02)',
            filter: 'saturate(1.04) contrast(1.02) brightness(0.92)',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(145deg, ${color}22 0%, ${C.bgCard} 48%, ${color}0c 100%)`,
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(circle at 24% 16%, ${color}28 0%, transparent 34%),
            linear-gradient(180deg, rgba(8,10,16,0.08) 0%, rgba(8,10,16,0.24) 24%, rgba(8,10,16,0.78) 58%, rgba(8,10,16,0.95) 100%)
          `,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: `inset 0 0 0 1px ${color}14`,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 30,
          height: 30,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color,
          color: '#000',
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 14,
          zIndex: 2,
          boxShadow: `0 0 10px ${color}55`,
        }}
      >
        {card.costRAM ?? 0}
      </div>

      {price != null && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '4px 8px',
            borderRadius: 999,
            backgroundColor: `${C.yellow}18`,
            border: `1px solid ${C.yellow}45`,
            color: C.yellow,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 11,
            zIndex: 2,
          }}
        >
          {price}g
        </div>
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          minHeight: 0,
          padding: '0 10px 10px',
        }}
      >
        <div
          style={{
            padding: '12px 10px 10px',
            borderRadius: 14,
            background: 'linear-gradient(180deg, rgba(8,10,16,0.14) 0%, rgba(8,10,16,0.72) 14%, rgba(8,10,16,0.92) 100%)',
            border: `1px solid ${color}22`,
            boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: '47%',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 700,
                color: C.text,
                fontSize: 13,
                lineHeight: 1.25,
                marginBottom: 3,
                textShadow: '0 1px 10px rgba(0,0,0,0.55)',
              }}
            >
              {card.name}
            </div>
            <div
              style={{
                fontFamily: MONO,
                color,
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              {card.type}
            </div>
          </div>

          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: '#b7bcc6',
              lineHeight: 1.45,
              minHeight: 42,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 1px 8px rgba(0,0,0,0.45)',
            }}
          >
            {effectText}
          </div>

          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: '2px 5px',
                    borderRadius: 4,
                    fontFamily: MONO,
                    fontSize: 8,
                    backgroundColor: `${color}14`,
                    color,
                    border: `1px solid ${color}28`,
                    boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
                  }}
                >
                  {tag.toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {(mutations.length > 0 || instance?.useCounter != null || instance?.finalMutationCountdown != null) && (
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 8,
                borderTop: `1px solid ${color}22`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {mutations.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {mutations.slice(0, 4).map((mid) => (
                    <span
                      key={mid}
                      style={{
                        padding: '1px 4px',
                        borderRadius: 4,
                        fontFamily: MONO,
                        fontSize: 8,
                        color,
                        backgroundColor: `${color}10`,
                        border: `1px solid ${color}28`,
                      }}
                    >
                      {mid}
                    </span>
                  ))}
                  {mutations.length > 4 && (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: C.textMuted }}>
                      +{mutations.length - 4}
                    </span>
                  )}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontFamily: MONO,
                  fontSize: 9,
                  color: C.textMuted,
                  letterSpacing: '0.04em',
                }}
              >
                <span>
                  {visibleUseCounter != null ? `NEXT ${visibleUseCounter}` : (isBricked ? 'BRICKED' : isRewritten ? 'REWRITTEN' : '')}
                </span>
                <span>
                  {visibleFinalCounter != null ? `FINAL ${visibleFinalCounter}` : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/** Shared full-screen background wrapper */
function ScreenShell({ children, extraStyle = {} }) {
  return (
    <div
      className="scanlines"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.bg,
        backgroundImage: `
          linear-gradient(${C.cyan}03 1px, transparent 1px),
          linear-gradient(90deg, ${C.cyan}03 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px',
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

/** Floating mute/unmute button, always on top */
function MuteButton({ muted, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={muted ? 'Unmute sound' : 'Mute sound'}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 99999,
        background: 'rgba(10,10,20,0.88)',
        border: `1px solid ${muted ? C.border : C.cyan + '55'}`,
        borderRadius: 8,
        color: muted ? C.textMuted : C.cyan,
        fontSize: 16,
        cursor: 'pointer',
        padding: '4px 7px',
        lineHeight: 1,
        boxShadow: muted ? 'none' : `0 0 10px ${C.cyan}25`,
        transition: 'all 0.15s',
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

function PauseMenuButton({ onClick, open = false }) {
  return (
    <button
      onClick={onClick}
      title={open ? 'Close menu' : 'Open menu'}
      aria-label={open ? 'Close pause menu' : 'Open pause menu'}
      aria-haspopup="dialog"
      aria-expanded={open}
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 99999,
        background: 'rgba(10,10,20,0.88)',
        border: `1px solid ${open ? C.yellow + '55' : C.cyan + '55'}`,
        borderRadius: 10,
        color: open ? C.yellow : C.cyan,
        fontSize: 12,
        fontFamily: UI_MONO,
        fontWeight: 700,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        padding: '8px 10px',
        lineHeight: 1,
        boxShadow: open ? `0 0 12px ${C.yellow}25` : `0 0 10px ${C.cyan}25`,
        transition: 'all 0.15s',
      }}
    >
      {open ? 'CLOSE' : 'MENU'}
    </button>
  );
}

const HOW_TO_PLAY = [
  'Scroll the hand until the card you want is centered, then tap the centered card to play it.',
  'RAM is your per-turn resource. Sequence setup and RAM gain before your heavy cards when you can.',
  'Firewall absorbs damage before HP. If an enemy stacks Firewall, use shield-break or breach effects before damage cards.',
  'Use the selected enemy panel to read HP, Firewall, and the next action without cluttering the enemy art.',
  'Mutations are part of long-run planning. Non-core cards will change over time, so value both immediate output and future stability.',
];

const GLOSSARY_ITEMS = [
  { term: 'HP', desc: 'Your health. If it reaches 0, the run ends.' },
  { term: 'RAM', desc: 'The resource spent to play cards each turn.' },
  { term: 'Firewall', desc: 'Persistent shielding that absorbs damage before HP until it is removed or spent.' },
  { term: 'Core card', desc: 'A stable starter-grade card. Core cards do not follow the same mutation risk as normal mutable cards.' },
  { term: 'Mutation', desc: 'A card change gained from use over time. You can roughly predict when it will happen, but not the exact result.' },
  { term: 'Final mutation', desc: 'The late lifecycle rewrite or collapse of a heavily used mutable card.' },
  { term: 'One-Shot', desc: 'The card is permanently removed after it is played.' },
  { term: 'Exhaust', desc: 'The card leaves your deck for the rest of the current combat.' },
  { term: 'Leak', desc: 'A damage-over-time effect that chips HP on later turns.' },
  { term: 'Corrode', desc: 'Defense shredding pressure that strips Firewall so follow-up damage can stick.' },
  { term: 'Overclock', desc: 'A tempo-boosting status that usually trades safety or future stability for immediate power.' },
  { term: 'Power', desc: 'A persistent card effect that changes later turns after it is played.' },
];

function HelpCard({ title, children }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        background: 'linear-gradient(180deg, rgba(14,16,26,0.96) 0%, rgba(9,11,18,0.98) 100%)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontFamily: UI_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: C.cyan }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function PauseMenuOverlay({
  open,
  onClose,
  soundMuted,
  onToggleMute,
  onReloadApp,
  onAbandonRun,
  hasActiveRun = false,
  state,
  showLog,
  onDevAction,
  onToggleLog,
  aiPanel,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const isNarrow = typeof window !== 'undefined' ? window.innerWidth < 900 : false;

  useDialogAccessibility(open, {
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
  });

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        background: 'rgba(4,6,12,0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: isNarrow ? '54px 10px 12px' : '56px 14px 14px',
      }}
    >
      <div
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-menu-title"
        aria-describedby="pause-menu-desc"
        tabIndex={-1}
        style={{
          width: 'min(1180px, 100%)',
          maxHeight: '100%',
          overflowY: 'auto',
          borderRadius: 18,
          border: `1px solid ${C.cyan}30`,
          background: 'linear-gradient(180deg, rgba(8,10,18,0.98) 0%, rgba(5,7,14,0.99) 100%)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
          padding: isNarrow ? '12px' : '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div id="pause-menu-title" style={{ fontFamily: UI_MONO, fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', color: C.cyan }}>
              PAUSE MENU
            </div>
            <div id="pause-menu-desc" style={{ fontFamily: UI_MONO, fontSize: 12, color: C.textDim }}>
              {state?.mode === 'Combat' ? 'Combat tools, AI controls, and quick help.' : 'Run controls, debug tools, and quick help.'}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close pause menu"
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.03)',
              color: C.text,
              fontFamily: UI_MONO,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            CLOSE
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'minmax(320px, 420px) minmax(0, 1fr)',
            gap: 12,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <HelpCard title="SYSTEM">
              <button
                onClick={onToggleMute}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${soundMuted ? C.border : C.cyan + '50'}`,
                  background: soundMuted ? 'rgba(255,255,255,0.03)' : `${C.cyan}12`,
                  color: soundMuted ? C.text : C.cyan,
                  fontFamily: UI_MONO,
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {soundMuted ? 'Sound off - tap to unmute' : 'Sound on - tap to mute'}
              </button>
              <button
                onClick={onToggleLog}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${showLog ? C.orange + '55' : C.border}`,
                  background: showLog ? `${C.orange}15` : 'rgba(255,255,255,0.03)',
                  color: showLog ? C.orange : C.text,
                  fontFamily: UI_MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {showLog ? 'Hide log overlay' : 'Show log overlay'}
              </button>
              {hasActiveRun && (
                <button
                  onClick={onAbandonRun}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: `1px solid ${C.red}55`,
                    background: `${C.red}14`,
                    color: C.red,
                    fontFamily: UI_MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  Abandon run
                </button>
              )}
              <button
                onClick={onReloadApp}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: 'rgba(255,255,255,0.03)',
                  color: C.text,
                  fontFamily: UI_MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Reload app
              </button>
            </HelpCard>

            <HelpCard title="AI AUTO-PLAY">
              {aiPanel}
            </HelpCard>

            <HelpCard title="DEBUG TOOLS">
              <DevButtons state={state} onDevAction={onDevAction} onToggleLog={onToggleLog} embedded={true} />
            </HelpCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 12, minWidth: 0 }}>
            <HelpCard title="HOW TO PLAY">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {HOW_TO_PLAY.map((line, index) => (
                  <div key={index} style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>
                    <span style={{ color: C.cyan, fontWeight: 700 }}>{index + 1}.</span> {line}
                  </div>
                ))}
              </div>
            </HelpCard>

            <HelpCard title="GLOSSARY">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {GLOSSARY_ITEMS.map((item) => (
                  <div key={item.term} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontFamily: UI_MONO, fontSize: 11, fontWeight: 700, color: C.yellow, letterSpacing: '0.08em' }}>
                      {item.term}
                    </div>
                    <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.45, color: C.text }}>
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
            </HelpCard>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared top bar showing run stats */
function RunHeader({ run, data }) {
  if (!run) return null;
  const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const relics = run.relicIds || [];
  return (
    <div
      className="safe-area-top"
      style={{
        backgroundColor: C.bgBar,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '8px',
        paddingBottom: relics.length > 0 ? '4px' : '8px',
      }}>
        <div style={{ fontFamily: MONO, color: C.cyan, fontSize: 11 }}>
          <span style={{ opacity: 0.5 }}>ACT</span> {run.act}
          <span style={{ marginLeft: '8px', marginRight: '8px', opacity: 0.3 }}>|</span>
          <span style={{ opacity: 0.5 }}>FLOOR</span> {run.floor}
        </div>
        <div style={{ display: 'flex', gap: '12px', fontFamily: MONO, fontSize: 12 }}>
          <span style={{ color: C.green }}>{run.hp}/{run.maxHP}</span>
          <span style={{ color: C.yellow }}>{run.gold}g</span>
          <span style={{ color: C.cyan }}>{run.mp}mp</span>
        </div>
      </div>
      {/* Relic chips */}
      {relics.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingBottom: '6px',
        }}>
          {relics.map(rid => {
            const relic = data?.relics?.[rid];
            const tier = relic?.rarity || relic?.tier || 'common';
            const tierColors = { boss: C.red, rare: C.purple, uncommon: C.yellow };
            const col = tierColors[tier] || C.cyan;
            return (
              <div
                key={rid}
                title={`${relic?.name || rid}: ${relic?.description || ''}`}
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  color: col,
                  backgroundColor: `${col}15`,
                  border: `1px solid ${col}40`,
                  borderRadius: '4px',
                  padding: '2px 6px',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                {relic?.icon || '◈'} {relic?.name || rid}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAP SCREEN — SVG node graph
// ============================================================

// StS-style: 6 columns (x=0..5), 15 rows (y=0..14). x=2.5 = centre (Start/Boss).
const SVG_MAP_W = 300;
const SVG_MAP_H = 920;

function mapNX(x) {
  // x=0→30, x=2.5→150 (centre), x=5→270
  return 30 + x * 48;
}
function mapNY(y) {
  // y=0 (Start)→40px, y=14 (Boss)→880px
  return 40 + (y / 14) * 840;
}

const NODE_TYPE_DESCS = {
  Combat: 'Standard fight',
  Elite:  'Tough enemy, better loot',
  Boss:   'Act boss — prepare',
  Shop:   'Buy cards & services',
  Rest:   'Heal, repair, or stabilise',
  Event:  'Unknown encounter',
};

function MapScreen({ state, data, onAction }) {
  const nodes   = state.map?.nodes || {};
  const curId   = state.map?.currentNodeId;
  const selNext = state.map?.selectableNext || [];
  const nodeList = Object.values(nodes);
  const [manualPreviewNodeId, setManualPreviewNodeId] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));

  // Detour edge lookup (amber dashed lines)
  const detourSet = new Set((state.map?.detourEdges || []).map(([f, t]) => `${f}-${t}`));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncViewport = () => setViewportWidth(window.innerWidth);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const autoPreviewNodeId = selNext.length === 1 ? selNext[0] : null;
  const previewNodeId = selNext.includes(manualPreviewNodeId) ? manualPreviewNodeId : autoPreviewNodeId;

  const previewNodeSet = new Set();
  const previewEdgeSet = new Set();
  if (previewNodeId && nodes[previewNodeId]) {
    const stack = [previewNodeId];
    while (stack.length > 0) {
      const nodeId = stack.pop();
      if (!nodeId || previewNodeSet.has(nodeId) || !nodes[nodeId]) continue;
      previewNodeSet.add(nodeId);
      for (const nextId of nodes[nodeId].next || []) {
        if (!nodes[nextId]) continue;
        previewEdgeSet.add(`${nodeId}-${nextId}`);
        if (!previewNodeSet.has(nextId)) stack.push(nextId);
      }
    }
  }
  const previewActive = previewNodeSet.size > 0;

  // Collect edges
  const edges = [];
  for (const node of nodeList) {
    for (const toId of (node.next || [])) {
      if (nodes[toId]) edges.push({ from: node, to: nodes[toId] });
    }
  }

  const isWideLayout = viewportWidth >= 980;
  const mapWidth = isWideLayout ? 760 : 340;
  const routeLabelFontSize = isWideLayout ? 12 : 11;
  const routeHintFontSize = isWideLayout ? 11 : 10;
  const routeControls = selNext.length > 0 ? (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: isWideLayout ? 0 : '0 4px', marginTop: isWideLayout ? 0 : 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
        <div style={{ fontFamily: MONO, fontSize: routeLabelFontSize, color: C.textMuted, letterSpacing: '0.12em' }}>
          MOVE TO
        </div>
        <div style={{ fontFamily: MONO, fontSize: routeHintFontSize, color: C.textDim }}>
          Tap once preview | tap twice confirm
        </div>
      </div>
      {selNext.map(nodeId => {
        const node  = nodes[nodeId];
        const color = NODE_COLORS[node?.type] || '#888';
        const icon  = NODE_ICONS[node?.type]  || '.';
        const desc  = NODE_TYPE_DESCS[node?.type] || '';
        const isPreviewed = previewNodeId === nodeId;
        return (
          <button
            key={nodeId}
            onMouseEnter={() => setManualPreviewNodeId(nodeId)}
            onFocus={() => setManualPreviewNodeId(nodeId)}
            onClick={() => {
              if (previewNodeId === nodeId) {
                onAction({ type: 'SelectNextNode', nodeId });
                return;
              }
              setManualPreviewNodeId(nodeId);
            }}
            aria-label={isPreviewed ? `Confirm route to ${node?.type}` : `Preview route to ${node?.type}`}
            aria-pressed={isPreviewed}
            style={{
              width: '100%',
              padding: isWideLayout ? '14px 16px' : '12px 14px',
              borderRadius: '12px',
              fontFamily: MONO,
              textAlign: 'left',
              transition: 'all 0.15s',
              background: isPreviewed
                ? `linear-gradient(135deg, ${color}1c 0%, rgba(12,16,24,0.92) 100%)`
                : `linear-gradient(135deg, ${color}10 0%, rgba(10,12,20,0.9) 100%)`,
              border: `2px solid ${isPreviewed ? `${color}aa` : `${color}55`}`,
              boxShadow: isPreviewed ? `0 0 22px ${color}2c` : `0 0 14px ${color}12`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              backgroundColor: `${color}18`,
              border: `1px solid ${color}40`,
            }}>
              {icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color, fontSize: isWideLayout ? 16 : 14 }}>{node?.type}</div>
              <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
              {isPreviewed && (
                <div style={{
                  display: 'inline-flex',
                  marginTop: 6,
                  padding: '4px 8px',
                  borderRadius: 999,
                  backgroundColor: `${color}20`,
                  border: `1px solid ${color}55`,
                  color,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}>
                  CONFIRM ROUTE
                </div>
              )}
            </div>
            <div style={{ color: C.textMuted, fontSize: 18 }}>{'>'}</div>
          </button>
        );
      })}
    </div>
  ) : null;
  const actionsPanel = (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {routeControls}
      {state.run?.debugOverrides?.showLegacyMapRouteControls === true && selNext.length > 0 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: isWideLayout ? 0 : '0 4px', marginTop: isWideLayout ? 0 : 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
            <div style={{ fontFamily: MONO, fontSize: isWideLayout ? 12 : 11, color: C.textMuted, letterSpacing: '0.12em' }}>
              MOVE TO
            </div>
            <div style={{ fontFamily: MONO, fontSize: isWideLayout ? 11 : 10, color: C.textDim }}>
              Tap once preview | tap twice confirm
            </div>
          </div>
          {selNext.map(nodeId => {
            const node  = nodes[nodeId];
            const color = NODE_COLORS[node?.type] || '#888';
            const icon  = NODE_ICONS[node?.type]  || '·';
            const desc  = NODE_TYPE_DESCS[node?.type] || '';
            const isPreviewed = previewNodeId === nodeId;
            return (
              <button
                key={nodeId}
                onMouseEnter={() => setManualPreviewNodeId(nodeId)}
                onFocus={() => setManualPreviewNodeId(nodeId)}
                onClick={() => {
                  if (previewNodeId === nodeId) {
                    onAction({ type: 'SelectNextNode', nodeId });
                    return;
                  }
                  setManualPreviewNodeId(nodeId);
                }}
                aria-label={isPreviewed ? `Confirm route to ${node?.type}` : `Preview route to ${node?.type}`}
                aria-pressed={isPreviewed}
                style={{
                  width: '100%',
                  padding: isWideLayout ? '14px 16px' : '12px 14px',
                  borderRadius: '12px',
                  fontFamily: MONO,
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  background: isPreviewed
                    ? `linear-gradient(135deg, ${color}1c 0%, rgba(12,16,24,0.92) 100%)`
                    : `linear-gradient(135deg, ${color}10 0%, rgba(10,12,20,0.9) 100%)`,
                  border: `2px solid ${isPreviewed ? `${color}aa` : `${color}55`}`,
                  boxShadow: isPreviewed ? `0 0 22px ${color}2c` : `0 0 14px ${color}12`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  backgroundColor: `${color}18`,
                  border: `1px solid ${color}40`,
                }}>
                  {icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color, fontSize: isWideLayout ? 16 : 14 }}>{node?.type}</div>
                  <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
                  {isPreviewed && (
                    <div style={{
                      display: 'inline-flex',
                      marginTop: 6,
                      padding: '4px 8px',
                      borderRadius: 999,
                      backgroundColor: `${color}20`,
                      border: `1px solid ${color}55`,
                      color,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}>
                      CONFIRM ROUTE
                    </div>
                  )}
                </div>
                <div style={{ color: C.textMuted, fontSize: 18 }}>›</div>
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => onAction({ type: 'OpenDeck' })}
        aria-label={`View deck with ${state.deck?.master?.length || 0} cards`}
        className={isWideLayout ? undefined : 'safe-area-bottom'}
        style={{
          width: '100%',
          padding: isWideLayout ? '15px 16px' : '13px 14px',
          borderRadius: '14px',
          fontFamily: MONO,
          textAlign: 'center',
          transition: 'all 0.15s',
          background: `linear-gradient(135deg, ${C.cyan}18 0%, rgba(9,16,24,0.96) 100%)`,
          border: `1px solid ${C.cyan}50`,
          color: '#b8fbff',
          fontSize: isWideLayout ? 14 : 13,
          cursor: 'pointer',
          boxShadow: `0 0 20px ${C.cyan}12`,
          letterSpacing: '0.05em',
          margin: isWideLayout ? 0 : '12px 4px 8px',
        }}
      >
        📋 View Deck ({state.deck?.master?.length || 0} cards)
      </button>
    </div>
  );

  return (
    <ScreenShell>
      <RunHeader run={state.run} data={data} />

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: isWideLayout ? '14px 16px 0' : '8px 8px 0', overflowY: 'auto' }}>
        <div
          style={{
            width: 'min(100%, 1120px)',
            display: 'grid',
            gridTemplateColumns: isWideLayout ? 'minmax(0, 1fr) minmax(280px, 320px)' : 'minmax(0, 1fr)',
            gap: isWideLayout ? 18 : 0,
            alignItems: 'start',
          }}
        >
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <div style={{ fontFamily: MONO, fontSize: isWideLayout ? 12 : 11, color: C.textMuted, letterSpacing: '0.15em', marginBottom: 6, marginTop: 4 }}>
          ACT {state.run?.act} — CHOOSE YOUR PATH
        </div>

        {/* ── SVG Map ─────────────────────────────────────── */}
        <svg width="100%" viewBox={`0 0 ${SVG_MAP_W} ${SVG_MAP_H}`} style={{ maxWidth: mapWidth, display: 'block' }}>
          <defs>
            <filter id="mglow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="mglow-sm" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {edges.map(({ from, to }) => {
            const isTraversed = from.cleared;
            const isHot      = (from.id === curId) && selNext.includes(to.id);
            const isDetour   = detourSet.has(`${from.id}-${to.id}`);
            const isPreview  = previewEdgeSet.has(`${from.id}-${to.id}`);
            const previewColor = NODE_COLORS[to.type] || C.cyan;

            if (isDetour) {
              // Amber dashed detour lines — sideways or backward cross-paths
              return (
                <line
                  key={`${from.id}-${to.id}`}
                  x1={mapNX(from.x)} y1={mapNY(from.y)}
                  x2={mapNX(to.x)}   y2={mapNY(to.y)}
                  stroke={isPreview ? `${previewColor}dd` : isTraversed ? '#FFAA0040' : isHot ? '#FFCC44' : '#FFAA0088'}
                  strokeWidth={isPreview ? 2.5 : isTraversed ? 1.5 : isHot ? 2 : 1.5}
                  strokeDasharray={isPreview || isTraversed ? 'none' : '5 3'}
                  filter={isPreview || isHot ? 'url(#mglow-sm)' : undefined}
                  opacity={previewActive && !isPreview ? 0.25 : 1}
                />
              );
            }

            return (
              <line
                key={`${from.id}-${to.id}`}
                x1={mapNX(from.x)} y1={mapNY(from.y)}
                x2={mapNX(to.x)}   y2={mapNY(to.y)}
                stroke={isPreview ? `${previewColor}cc` : isTraversed ? `${C.cyan}70` : isHot ? `${C.cyan}cc` : `${C.cyan}28`}
                strokeWidth={isPreview ? 2.6 : isTraversed ? 2 : isHot ? 2 : 1.5}
                strokeDasharray={isTraversed || isHot || isPreview ? 'none' : '5 4'}
                filter={isPreview || isHot ? 'url(#mglow-sm)' : undefined}
                opacity={previewActive && !isPreview && !isTraversed && !isHot ? 0.18 : 1}
              />
            );
          })}

          {/* Nodes */}
          {nodeList.map(node => {
            const cx   = mapNX(node.x);
            const cy   = mapNY(node.y);
            const isCur  = node.id === curId;
            const isSel  = selNext.includes(node.id);
            const isDone = node.cleared;
            const isPreviewRoot = previewNodeId === node.id;
            const isPreviewReachable = previewNodeSet.has(node.id);
            const shouldFade = previewActive && !isCur && !isSel && !isDone && !isPreviewReachable;
            const col  = NODE_COLORS[node.type] || '#888';
            const ico  = NODE_ICONS[node.type]  || '?';
            const R    = isCur ? 23 : isPreviewRoot ? 22 : isSel ? 21 : isPreviewReachable ? 18 : 17;
            const desc = NODE_TYPE_DESCS[node.type] || '';
            const handleNodeActivate = () => {
              if (!isSel) return;
              if (previewNodeId === node.id) {
                onAction({ type: 'SelectNextNode', nodeId: node.id });
                return;
              }
              setManualPreviewNodeId(node.id);
            };

            return (
              <g key={node.id}
                onClick={handleNodeActivate}
                onKeyDown={(event) => {
                  if (!isSel) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleNodeActivate();
                  }
                }}
                role={isSel ? 'button' : undefined}
                tabIndex={isSel ? 0 : -1}
                focusable={isSel ? 'true' : undefined}
                aria-disabled={!isSel}
                aria-label={isSel
                  ? `${previewNodeId === node.id ? 'Confirm route to' : 'Preview route to'} ${node.type}${desc ? `. ${desc}` : ''}`
                  : `${node.type}${isDone ? ', cleared' : ''}`}
                style={{ cursor: isSel ? 'pointer' : 'default' }}
              >
                {/* Outer glow ring */}
                {(isCur || isSel || isPreviewReachable) && (
                  <circle cx={cx} cy={cy} r={R + (isCur ? 10 : 7)}
                    fill={`${col}${isCur ? '10' : isPreviewRoot ? '16' : '08'}`}
                    stroke={`${col}${isCur ? '40' : '50'}`}
                    strokeWidth={1.5}
                    opacity={shouldFade ? 0.2 : 1}
                  />
                )}
                {/* Main circle */}
                <circle cx={cx} cy={cy} r={R}
                  fill={isCur ? `${col}28` : isPreviewRoot ? `${col}22` : isSel ? `${col}18` : isDone ? '#131320' : '#0b0b12'}
                  stroke={isCur ? col : isPreviewRoot ? `${col}cc` : isSel ? `${col}90` : isDone ? `${col}35` : '#202030'}
                  strokeWidth={isCur ? 2.5 : isPreviewRoot ? 2.3 : isSel ? 2 : isPreviewReachable ? 1.6 : 1}
                  filter={isCur ? 'url(#mglow)' : isPreviewReachable || isSel ? 'url(#mglow-sm)' : 'none'}
                  opacity={shouldFade ? 0.25 : 1}
                />
                {/* Icon */}
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                  fontSize={isCur ? 15 : isPreviewRoot ? 14 : isSel ? 14 : isDone ? 11 : 12}
                  fill={isDone ? `${col}40` : isCur || isSel || isPreviewReachable ? col : `${col}55`}
                  fontFamily="Arial, sans-serif"
                  opacity={shouldFade ? 0.28 : 1}
                >
                  {isDone ? '✓' : ico}
                </text>
                {/* Type label */}
                {(isCur || isSel || isDone || isPreviewReachable) && (
                  <text x={cx} y={cy + R + 13} textAnchor="middle"
                    fontSize={9}
                    fill={isCur ? col : isPreviewRoot ? `${col}ff` : isSel ? `${col}cc` : `${col}44`}
                    fontFamily="JetBrains Mono, monospace"
                    letterSpacing="0.3"
                    opacity={shouldFade ? 0.3 : 1}
                  >
                    {node.type.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Quick-tap node buttons */}
        {!isWideLayout && selNext.length > 0 && (
          <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px', marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.12em' }}>
                MOVE TO
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                Tap once preview | tap twice confirm
              </div>
            </div>
            {selNext.map(nodeId => {
              const node  = nodes[nodeId];
              const color = NODE_COLORS[node?.type] || '#888';
              const icon  = NODE_ICONS[node?.type]  || '·';
              const desc  = NODE_TYPE_DESCS[node?.type] || '';
              const isPreviewed = previewNodeId === nodeId;
              return (
                <button key={nodeId}
                  onMouseEnter={() => setManualPreviewNodeId(nodeId)}
                  onFocus={() => setManualPreviewNodeId(nodeId)}
                  onClick={() => {
                    if (previewNodeId === nodeId) {
                      onAction({ type: 'SelectNextNode', nodeId });
                      return;
                    }
                    setManualPreviewNodeId(nodeId);
                  }}
                  aria-label={isPreviewed ? `Confirm route to ${node?.type}` : `Preview route to ${node?.type}`}
                  aria-pressed={isPreviewed}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: '12px',
                    fontFamily: MONO, textAlign: 'left', transition: 'all 0.15s',
                    background: isPreviewed
                      ? `linear-gradient(135deg, ${color}1c 0%, rgba(12,16,24,0.92) 100%)`
                      : `linear-gradient(135deg, ${color}10 0%, rgba(10,12,20,0.9) 100%)`,
                    border: `2px solid ${isPreviewed ? `${color}aa` : `${color}55`}`,
                    boxShadow: isPreviewed ? `0 0 22px ${color}2c` : `0 0 14px ${color}12`,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, backgroundColor: `${color}18`, border: `1px solid ${color}40`,
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color, fontSize: 14 }}>{node?.type}</div>
                    <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
                    {isPreviewed && (
                      <div style={{
                        display: 'inline-flex',
                        marginTop: 6,
                        padding: '3px 7px',
                        borderRadius: 999,
                        backgroundColor: `${color}20`,
                        border: `1px solid ${color}55`,
                        color,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                      }}>
                        CONFIRM ROUTE
                      </div>
                    )}
                  </div>
                  <div style={{ color: C.textMuted, fontSize: 18 }}>›</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Deck button */}
        <button
          onClick={() => onAction({ type: 'OpenDeck' })}
          aria-label={`View deck with ${state.deck?.master?.length || 0} cards`}
          className="safe-area-bottom"
          style={{
            display: isWideLayout ? 'none' : 'block',
            width: '100%', maxWidth: 340,
            padding: '13px 14px', borderRadius: '14px',
            fontFamily: MONO, textAlign: 'center',
            transition: 'all 0.15s',
            background: `linear-gradient(135deg, ${C.cyan}18 0%, rgba(9,16,24,0.96) 100%)`,
            border: `1px solid ${C.cyan}50`,
            color: '#b8fbff', fontSize: 13, cursor: 'pointer',
            boxShadow: `0 0 20px ${C.cyan}12`,
            letterSpacing: '0.05em',
            margin: '12px 4px 8px',
          }}
        >
          📋 View Deck ({state.deck?.master?.length || 0} cards)
        </button>
          </div>

          {isWideLayout && (
            <div
              className="safe-area-bottom"
              style={{
                position: 'sticky',
                top: 12,
                alignSelf: 'start',
                minWidth: 0,
                padding: '8px 0 12px',
              }}
            >
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '14px',
                borderRadius: 16,
                background: 'linear-gradient(180deg, rgba(8,12,20,0.94) 0%, rgba(5,8,14,0.98) 100%)',
                border: `1px solid ${C.border}`,
                boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: C.cyan }}>
                    ROUTE CONTROLS
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                    Preview the next branch directly on the map, then confirm the route from this panel.
                  </div>
                </div>
                {actionsPanel}
              </div>
            </div>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// REWARD SCREEN
// ============================================================
function RewardScreen({ state, data, onAction }) {
  const choices = state.reward?.cardChoices || [];
  const relicChoices = state.reward?.relicChoices || [];
  const hasRelics = relicChoices.length > 0;
  const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

  return (
    <ScreenShell>
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', paddingTop: '24px', paddingBottom: '24px' }}>
          <div
            className="animate-slide-up"
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: '24px',
              marginBottom: '4px',
              color: C.green,
            }}
          >
            VICTORY
          </div>
          <div style={{ fontFamily: MONO, color: C.textMuted, fontSize: 13 }}>
            {hasRelics ? 'Select a relic — then choose a card' : 'Select a card reward'}
          </div>
        </div>

        {/* Relic choices (shown above card choices when available) */}
        {hasRelics && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.yellow, letterSpacing: '0.1em', marginBottom: '8px', textAlign: 'center' }}>
              ◈ RELIC REWARD — pick one
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {relicChoices.map(rid => {
                const relic = data.relics?.[rid];
                const tier = relic?.rarity || relic?.tier || 'common';
                const tierColors = { boss: C.red, rare: C.purple, uncommon: C.yellow };
                const col = tierColors[tier] || C.cyan;
                return (
                  <button
                    key={rid}
                    onClick={() => onAction({ type: 'Reward_PickRelic', relicId: rid })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      textAlign: 'left',
                      backgroundColor: `${col}10`,
                      border: `2px solid ${col}50`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontFamily: MONO, fontWeight: 700, color: col, fontSize: 13, marginBottom: '3px' }}>
                      {relic?.icon && <span style={{ marginRight: 5 }}>{relic.icon}</span>}
                      {relic?.name || rid}
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, opacity: 0.7, textTransform: 'uppercase' }}>
                        [{tier}]
                      </span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, lineHeight: 1.45 }}>
                      {relic?.description || ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Card choices */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(${MENU_CARD_MIN_W}px, ${MENU_CARD_MAX_W}px))`,
            gap: '12px',
            alignContent: 'start',
            justifyContent: 'center',
          }}
        >
          {choices.map(defId => {
            const card = data.cards?.[defId];

            return (
              <CardChoiceTile
                key={defId}
                cardId={defId}
                card={card}
                onClick={() => onAction({ type: 'Reward_PickCard', defId })}
              />
            );
          })}
        </div>

        {/* Skip button */}
        <button
          onClick={() => onAction({ type: 'Reward_Skip' })}
          className="safe-area-bottom"
          style={getSecondaryActionButtonStyle(C.green, {
            marginTop: '16px',
            fontSize: 13,
          })}
        >
          Skip Reward
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// SHOP SCREEN
// ============================================================

const SHOP_SERVICE_INFO = {
  RemoveCard: { icon: '🗑️', desc: 'Permanently remove a card from your deck', color: C.red },
  Remove:     { icon: '🗑️', desc: 'Permanently remove a card from your deck', color: C.red },
  Repair:     { icon: '🔧', desc: 'Restore a card\'s use counter', color: C.cyan },
  Stabilise:  { icon: '◆',  desc: 'Reset a card\'s mutation countdown', color: C.purple },
  Accelerate: { icon: '⚡', desc: 'Speed up a card\'s mutation trigger', color: C.orange },
  Heal:       { icon: '💊', desc: 'Restore 40 HP', color: C.green },
};

function describeEffects(effects) {
  if (!effects?.length) return '';
  return effects.map(e => {
    if (e.op === 'DealDamage')  return `Deal ${e.amount} dmg`;
    if (e.op === 'GainBlock')   return `+${e.amount} Firewall`;
    if (e.op === 'Heal')        return `Heal ${e.amount} HP`;
    if (e.op === 'DrawCards')   return `Draw ${e.amount}`;
    if (e.op === 'GainRAM')     return `+${e.amount} RAM`;
    if (e.op === 'ApplyStatus') return `Apply ${e.statusId}×${e.stacks}`;
    if (e.op === 'ApplyStatus' && e.statusId === 'Firewall' && e.target === 'Self') return `+${e.stacks} Firewall`;
    if (e.op === 'RawText')     return e.text;
    return e.op;
  }).join(' · ');
}

function ShopScreen({ state, data, onAction }) {
  const offers = state.shop?.offers || [];
  const gold = state.run?.gold || 0;
  const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

  return (
    <ScreenShell>
      {/* Shop header */}
      <div
        className="safe-area-top"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingTop: '12px',
          paddingBottom: '12px',
          backgroundColor: C.bgBar,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontFamily: MONO, fontWeight: 700, color: C.yellow, fontSize: 16 }}>
          🛒 MARKET
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: MONO, color: C.textMuted, fontSize: 12 }}>
            ACT {state.run?.act} · FLOOR {state.run?.floor}
          </span>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 12px', borderRadius: '8px',
              fontFamily: MONO, fontWeight: 700,
              backgroundColor: `${C.yellow}15`,
              border: `1px solid ${C.yellow}40`,
              color: C.yellow, fontSize: 14,
            }}
          >
            {gold}g
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '16px', paddingBottom: '8px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Cards section */}
        {offers.some(o => o.kind === 'Card') && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
              CARDS FOR SALE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${MENU_CARD_MIN_W}px, ${MENU_CARD_MAX_W}px))`, gap: '12px', justifyContent: 'center' }}>
              {offers.map((offer, i) => {
                if (offer.kind !== 'Card') return null;
                const card = data.cards?.[offer.defId];
                const canAfford = gold >= offer.price;
                return (
                  <CardChoiceTile
                    key={i}
                    cardId={offer.defId}
                    card={card}
                    price={offer.price}
                    onClick={() => canAfford && onAction({ type: 'Shop_BuyOffer', index: i })}
                    disabled={!canAfford}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Services section */}
        {offers.some(o => o.kind === 'Service') && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
              SERVICES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {offers.map((offer, i) => {
                if (offer.kind !== 'Service') return null;
                const canAfford = gold >= offer.price;
                const svc = SHOP_SERVICE_INFO[offer.serviceId] || { icon: '⚙', desc: offer.serviceId, color: C.cyan };
                return (
                  <button
                    key={i}
                    onClick={() => canAfford && onAction({ type: 'Shop_BuyOffer', index: i })}
                    disabled={!canAfford}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '12px',
                      textAlign: 'left', transition: 'all 0.2s ease',
                      opacity: !canAfford ? 0.45 : 1,
                      backgroundColor: canAfford ? `${svc.color}08` : C.bgCard,
                      border: `2px solid ${canAfford ? `${svc.color}40` : C.border}`,
                      cursor: canAfford ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px',
                        backgroundColor: `${svc.color}18`,
                        border: `1px solid ${svc.color}40`,
                      }}>
                        {svc.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: MONO, fontWeight: 700, color: canAfford ? svc.color : C.textMuted, fontSize: 14 }}>
                          {offer.serviceId}
                        </div>
                        <div style={{ fontFamily: MONO, marginTop: 2, color: C.textMuted, fontSize: 12, lineHeight: 1.45 }}>
                          {svc.desc}
                        </div>
                      </div>
                      <div style={{
                        padding: '4px 10px', borderRadius: '8px',
                        fontFamily: MONO, fontWeight: 700,
                        backgroundColor: canAfford ? `${C.yellow}18` : 'transparent',
                        border: `1px solid ${canAfford ? `${C.yellow}50` : C.border}`,
                        color: canAfford ? C.yellow : C.textMuted, fontSize: 13, flexShrink: 0,
                      }}>
                        {offer.price}g
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Relic section */}
        {offers.some(o => o.kind === 'Relic') && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
              RELICS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {offers.map((offer, i) => {
                if (offer.kind !== 'Relic') return null;
                const relic = data.relics?.[offer.relicId];
                const tier = relic?.rarity || relic?.tier || 'common';
                const tierColors = { boss: C.red, rare: C.purple, uncommon: C.yellow };
                const col = tierColors[tier] || C.cyan;
                const canAfford = gold >= offer.price;
                return (
                  <button
                    key={i}
                    onClick={() => canAfford && onAction({ type: 'Shop_BuyOffer', index: i })}
                    disabled={!canAfford}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '12px',
                      textAlign: 'left', transition: 'all 0.2s ease',
                      opacity: !canAfford ? 0.45 : 1,
                      backgroundColor: canAfford ? `${col}10` : C.bgCard,
                      border: `2px solid ${canAfford ? `${col}50` : C.border}`,
                      boxShadow: canAfford ? `0 0 20px ${col}14` : 'none',
                      cursor: canAfford ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: '10px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '22px',
                        backgroundColor: `${col}18`,
                        border: `1px solid ${col}40`,
                      }}>
                        {relic?.icon || '◈'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontFamily: MONO, fontWeight: 700, color: canAfford ? col : C.textMuted, fontSize: 14 }}>
                            {relic?.name || offer.relicId}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            [{tier}]
                          </span>
                        </div>
                        <div style={{ fontFamily: MONO, marginTop: 2, color: C.textMuted, fontSize: 12, lineHeight: 1.45 }}>
                          {relic?.description || ''}
                        </div>
                      </div>
                      <div style={{
                        padding: '4px 10px', borderRadius: '8px',
                        fontFamily: MONO, fontWeight: 700,
                        backgroundColor: canAfford ? `${C.yellow}18` : 'transparent',
                        border: `1px solid ${canAfford ? `${C.yellow}50` : C.border}`,
                        color: canAfford ? C.yellow : C.textMuted, fontSize: 13, flexShrink: 0,
                      }}>
                        {offer.price}g
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Footer: Reroll + Leave */}
      <div
        className="safe-area-bottom"
        style={{
          flexShrink: 0,
          padding: '10px 16px',
          borderTop: `1px solid ${C.border}`,
          backgroundColor: C.bgBar,
          display: 'flex',
          gap: '8px',
        }}
      >
        {/* Reroll button */}
        {(() => {
          const rerollsUsed = state.shop?.rerollsUsed || 0;
          const hasSysKey = (state.run?.relicIds || []).includes('SystemAdminKey');
          const rerollCost = hasSysKey && rerollsUsed === 0 ? 0 : 30 + rerollsUsed * 10;
          const canAffordReroll = (state.run?.gold || 0) >= rerollCost;
          return (
            <button
              onClick={() => onAction({ type: 'Shop_Reroll' })}
              disabled={!canAffordReroll}
              title={hasSysKey && rerollsUsed === 0 ? 'Free reroll (SystemAdminKey)' : `Reroll shop (${rerollCost}g)`}
              style={{
                flex: '0 0 auto', padding: '14px 18px', borderRadius: '12px',
                fontFamily: MONO, fontSize: 12, fontWeight: 700,
                backgroundColor: canAffordReroll ? `${C.cyan}12` : 'transparent',
                border: `1px solid ${canAffordReroll ? `${C.cyan}40` : C.border}`,
                color: canAffordReroll ? C.cyan : C.textMuted,
                cursor: canAffordReroll ? 'pointer' : 'default',
                opacity: canAffordReroll ? 1 : 0.45,
                transition: 'all 0.15s ease',
              }}
            >
              🔄 {rerollCost === 0 ? 'Free' : `${rerollCost}g`}
            </button>
          );
        })()}
        <button
          onClick={() => onAction({ type: 'Shop_Exit' })}
          style={getSecondaryActionButtonStyle(C.yellow, {
            flex: 1,
            fontFamily: MONO,
            fontSize: 13,
          })}
        >
          Leave Market
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// MINIGAME COMPONENTS
// ============================================================

// Shared symbols used across all minigame types
const MG_SYMBOLS = ['⚡','🔥','💧','🌀','⭐','🔮','💀','🛡️','🧠','🔗'];
const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

// ── Memory Match ──────────────────────────────────────────────────────────────
function MemoryGame({ config, onComplete }) {
  const { pairs = 3, cols = 3, goldMisses = 1, silverMisses = 3 } = config;
  const [tiles, setTiles] = useState(() => {
    const syms = MG_SYMBOLS.slice(0, pairs);
    const arr  = [...syms, ...syms].map((s, i) => ({ id: i, sym: s, flipped: false, matched: false }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });
  const [selected, setSelected]   = useState([]); // indices currently flipped (unmatched)
  const [misses, setMisses]        = useState(0);
  const [locked, setLocked]        = useState(false);
  const [done, setDone]            = useState(false);

  const tap = (idx) => {
    if (locked || done || tiles[idx].flipped || tiles[idx].matched) return;
    const newSel = [...selected, idx];
    setTiles(prev => prev.map((t, i) => i === idx ? { ...t, flipped: true } : t));
    if (newSel.length < 2) { setSelected(newSel); return; }

    // Two flipped — check match
    setLocked(true);
    const [a, b] = newSel;
    setSelected([]);
    if (tiles[a].sym === tiles[b].sym) {
      setTimeout(() => {
        setTiles(prev => {
          const next = prev.map((t, i) => (i === a || i === b) ? { ...t, matched: true } : t);
          if (next.every(t => t.matched)) {
            setDone(true);
            const tier = misses <= goldMisses ? 'gold' : misses <= silverMisses ? 'silver' : 'fail';
            setTimeout(() => onComplete(tier), 400);
          }
          return next;
        });
        setLocked(false);
      }, 300);
    } else {
      setMisses(m => m + 1);
      setTimeout(() => {
        setTiles(prev => prev.map((t, i) => (i === a || i === b) && !t.matched ? { ...t, flipped: false } : t));
        setLocked(false);
      }, 800);
    }
  };

  const gridCols = cols === 4 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
        Misses: {misses} / {silverMisses + 1}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10, width: '100%', maxWidth: 320 }}>
        {tiles.map((tile, idx) => (
          <button key={tile.id} onClick={() => tap(idx)} style={{
            height: 72, borderRadius: 14, fontSize: 28, border: 'none', cursor: tile.matched ? 'default' : 'pointer',
            background: tile.matched ? '#0a2a18' : tile.flipped ? '#1a1a30' : '#1a1a24',
            boxShadow: tile.matched ? `0 0 12px ${C.green}40` : tile.flipped ? `0 0 8px ${C.cyan}40` : 'none',
            transition: 'all 0.15s',
            transform: tile.flipped || tile.matched ? 'scale(1.05)' : 'scale(1)',
          }}>
            {tile.flipped || tile.matched ? tile.sym : '▪'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Timing Tap ────────────────────────────────────────────────────────────────
function TimingGame({ config, onComplete }) {
  const { rounds = 4, goldHits, silverHits, duration = 2500, zoneWidth = 22 } = config;
  const gHits = goldHits  ?? rounds;
  const sHits = silverHits ?? Math.ceil(rounds / 2);

  const [round, setRound]       = useState(0);
  const [progress, setProgress] = useState(0);   // 0-100
  const [zone, setZone]         = useState(null); // { start, end }
  const [phase, setPhase]       = useState('countdown'); // 'countdown'|'running'|'feedback'|'done'
  const [lastHit, setLastHit]   = useState(null);
  const [countdown, setCountdown] = useState(2);

  const scoreRef   = useRef(0);
  const roundRef   = useRef(0);
  const rafRef     = useRef(null);
  const startRef   = useRef(null);
  const progRef    = useRef(0);
  const zoneRef    = useRef(null);
  const phaseRef   = useRef('countdown');

  const beginRound = () => {
    const s = 18 + Math.floor(Math.random() * 52);
    const z = { start: s, end: Math.min(94, s + zoneWidth) };
    zoneRef.current = z;
    setZone(z);
    setProgress(0);
    progRef.current = 0;
    setLastHit(null);
    phaseRef.current = 'running';
    setPhase('running');
    startRef.current = performance.now();

    const tick = (now) => {
      const p = Math.min(100, ((now - startRef.current) / duration) * 100);
      progRef.current = p;
      setProgress(p);
      if (p >= 100) { resolve(false); }
      else          { rafRef.current = requestAnimationFrame(tick); }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const resolve = (hit) => {
    cancelAnimationFrame(rafRef.current);
    if (hit) scoreRef.current++;
    setLastHit(hit);
    phaseRef.current = 'feedback';
    setPhase('feedback');
    setTimeout(() => {
      roundRef.current++;
      if (roundRef.current >= rounds) {
        setPhase('done');
        const tier = scoreRef.current >= gHits ? 'gold' : scoreRef.current >= sHits ? 'silver' : 'fail';
        setTimeout(() => onComplete(tier), 500);
      } else {
        setRound(roundRef.current);
        beginRound();
      }
    }, 700);
  };

  const tap = () => { if (phaseRef.current !== 'running') return; resolve(progRef.current >= zoneRef.current.start && progRef.current <= zoneRef.current.end); };

  // Countdown then start
  useEffect(() => {
    if (countdown <= 0) { beginRound(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 600);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const barColor  = phase === 'feedback' ? (lastHit ? C.green : C.red) : C.cyan;
  const fillStyle = { width: `${progress}%`, height: '100%', background: barColor, borderRadius: 4, transition: phase === 'feedback' ? 'none' : undefined };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
        Round {Math.min(round + 1, rounds)} / {rounds} · Hits: {scoreRef.current}
      </div>

      {countdown > 0 ? (
        <div style={{ fontSize: 64, fontFamily: MONO, color: C.cyan }}>{countdown}</div>
      ) : (
        <>
          {/* Progress bar */}
          <div style={{ position: 'relative', width: '100%', maxWidth: 300, height: 28, background: '#1a1a2a', borderRadius: 6, overflow: 'hidden' }}>
            <div style={fillStyle} />
            {zone && (
              <div style={{
                position: 'absolute', top: 0, height: '100%',
                left: `${zone.start}%`, width: `${zone.end - zone.start}%`,
                background: `${C.green}35`, border: `1px solid ${C.green}80`,
                borderRadius: 3, pointerEvents: 'none',
              }} />
            )}
          </div>

          {phase === 'feedback' && (
            <div style={{ fontFamily: MONO, fontSize: 22, color: lastHit ? C.green : C.red }}>
              {lastHit ? '✓ HIT' : '✗ MISS'}
            </div>
          )}

          <button onClick={tap} disabled={phase !== 'running'} style={{
            width: 140, height: 140, borderRadius: '50%', fontSize: 36, border: 'none', cursor: 'pointer',
            background: phase === 'running' ? C.cyan : '#222233',
            color: phase === 'running' ? '#000' : '#555',
            boxShadow: phase === 'running' ? `0 0 32px ${C.cyan}60` : 'none',
            transition: 'all 0.1s', fontFamily: MONO, fontWeight: 700,
          }}>
            TAP
          </button>
        </>
      )}
    </div>
  );
}

// ── Sequence Recall ───────────────────────────────────────────────────────────
function SequenceGame({ config, onComplete }) {
  const { length = 4, showMs = 2000, goldCorrect, silverCorrect } = config;
  const gCorrect = goldCorrect  ?? length;
  const sCorrect = silverCorrect ?? Math.ceil(length / 2);

  const [sequence] = useState(() => {
    const pool = [...MG_SYMBOLS];
    const seq  = [];
    for (let i = 0; i < length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      seq.push(pool.splice(idx, 1)[0]);
    }
    return seq;
  });
  const [grid] = useState(() => {
    const g = [...MG_SYMBOLS].sort(() => Math.random() - 0.5);
    return g;
  });
  const [phase, setPhase]   = useState('showing'); // 'showing'|'input'|'done'
  const [tapped, setTapped] = useState([]);         // symbols tapped so far
  const [wrong, setWrong]   = useState(false);

  useEffect(() => {
    if (phase !== 'showing') return;
    const t = setTimeout(() => setPhase('input'), showMs);
    return () => clearTimeout(t);
  }, [phase, showMs]);

  const tapSym = (sym) => {
    if (phase !== 'input' || wrong) return;
    const expected = sequence[tapped.length];
    const newTapped = [...tapped, sym];
    if (sym !== expected) {
      setWrong(true);
      setTapped(newTapped);
      const tier = tapped.length >= gCorrect ? 'gold' : tapped.length >= sCorrect ? 'silver' : 'fail';
      setTimeout(() => onComplete(tier), 800);
      return;
    }
    setTapped(newTapped);
    if (newTapped.length === sequence.length) {
      setTimeout(() => onComplete('gold'), 400);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {phase === 'showing' ? (
        <>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: '0.1em' }}>MEMORISE THE SEQUENCE</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '16px 0' }}>
            {sequence.map((s, i) => (
              <div key={i} style={{
                width: 60, height: 60, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 30, background: '#1a1a30', border: `2px solid ${C.cyan}60`,
                boxShadow: `0 0 12px ${C.cyan}30`,
              }}>{s}</div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
            Tap in order — {tapped.length}/{sequence.length}
          </div>
          {/* Progress row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            {sequence.map((s, i) => (
              <div key={i} style={{
                width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
                background: i < tapped.length ? (wrong && i === tapped.length - 1 ? `${C.red}30` : `${C.green}30`) : '#1a1a24',
                border: `1px solid ${i < tapped.length ? (wrong && i === tapped.length - 1 ? C.red : C.green) : '#2a2a3a'}`,
              }}>
                {i < tapped.length ? tapped[i] : '·'}
              </div>
            ))}
          </div>
          {/* Symbol grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, width: '100%', maxWidth: 320 }}>
            {grid.map((sym, i) => (
              <button key={i} onClick={() => tapSym(sym)} style={{
                height: 58, borderRadius: 12, fontSize: 24, border: `1px solid #2a2a3a`,
                background: '#1a1a24', cursor: 'pointer',
                boxShadow: tapped.includes(sym) ? `inset 0 0 8px #0005` : 'none',
                opacity: tapped.includes(sym) ? 0.4 : 1,
                transition: 'all 0.1s',
              }}>{sym}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Rapid Tap ────────────────────────────────────────────────────────────────
function RapidGame({ config, onComplete }) {
  const { duration = 5000, goldTaps, silverTaps } = config;
  const [phase, setPhase]   = useState('ready');   // 'ready'|'playing'
  const [countdown, setCd]  = useState(3);
  const [count, setCount]   = useState(0);
  const [timeLeft, setTime] = useState(duration);
  const doneRef             = useRef(false);

  // 3-2-1 countdown
  useEffect(() => {
    if (phase !== 'ready') return;
    if (countdown <= 0) { setPhase('playing'); return; }
    const t = setTimeout(() => setCd(c => c - 1), 900);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Play timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setTime(t => Math.max(0, t - 100)), 100);
    return () => clearInterval(id);
  }, [phase]);

  // End detection
  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete(count >= goldTaps ? 'gold' : count >= silverTaps ? 'silver' : 'fail');
    }
  }, [timeLeft, phase, count, goldTaps, silverTaps, onComplete]);

  if (phase === 'ready') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.15em' }}>GET READY</div>
        <div style={{ fontFamily: MONO, fontSize: 96, fontWeight: 700, color: C.cyan, lineHeight: 1 }}>
          {countdown > 0 ? countdown : 'GO!'}
        </div>
      </div>
    );
  }

  const pct = timeLeft / duration;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '4px 0' }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, letterSpacing: '0.15em' }}>TAP AS FAST AS YOU CAN</div>
      {/* Timer bar */}
      <div style={{ width: '100%', height: 8, background: '#1a1a28', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`, borderRadius: 4,
          background: pct > 0.5 ? C.cyan : pct > 0.25 ? C.orange : C.red,
          transition: 'width 0.1s linear, background 0.3s',
        }} />
      </div>
      {/* Count */}
      <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 700, color: C.cyan, lineHeight: 1 }}>{count}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
        ⭐ {goldTaps}+  ·  ✦ {silverTaps}+  ·  {(timeLeft / 1000).toFixed(1)}s
      </div>
      {/* Tap button */}
      <button
        onPointerDown={(e) => { e.preventDefault(); setCount(c => c + 1); }}
        style={{
          width: 180, height: 180, borderRadius: '50%',
          background: `${C.cyan}12`, border: `3px solid ${C.cyan}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 22, fontWeight: 700, color: C.cyan,
          cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
          touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
          boxShadow: `0 0 40px ${C.cyan}15`,
        }}
      >
        TAP
      </button>
    </div>
  );
}

// ── Minigame wrapper (intro → play → result) ──────────────────────────────────
const TIER_LABEL  = { gold: '⭐ GOLD',  silver: '✦ SILVER', fail: '✗ FAILED', skip: '— SKIPPED' };
const TIER_COLOR  = { gold: C.yellow,   silver: '#aaa',     fail: C.red,       skip: C.textDim };

function MinigameScreen({ state, onAction }) {
  const eventId = state.event?.eventId;
  const def     = MINIGAME_REGISTRY[eventId];
  const [phase, setPhase]       = useState('intro');   // 'intro'|'playing'|'result'
  const [resultTier, setResult] = useState(null);

  const handleComplete = (tier) => { setResult(tier); setPhase('result'); };
  const handleSkip     = ()     => onAction({ type: 'Minigame_Complete', eventId, tier: 'skip' });
  const handleClaim    = ()     => onAction({ type: 'Minigame_Complete', eventId, tier: resultTier });

  if (!def) {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={null} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 18, color: C.cyan, fontWeight: 700 }}>MINIGAME</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{eventId}</div>
          <button onClick={handleSkip} style={{ padding: '12px 32px', borderRadius: 12, fontFamily: MONO, fontWeight: 700, background: C.cyan, color: '#000', border: 'none', cursor: 'pointer' }}>Continue</button>
        </div>
      </ScreenShell>
    );
  }

  const rewardLine = (ops) => ops.length === 0 ? 'No reward' : ops.map(o => {
    if (o.op === 'GainGold') return `+${o.amount}g`;
    if (o.op === 'Heal')     return `+${o.amount} HP`;
    if (o.op === 'LoseHP')   return `-${o.amount} HP`;
    if (o.op === 'GainMP')   return `+${o.amount} MP`;
    if (o.op === 'GainMaxHP')   return `+${o.amount} Max HP`;
    if (o.op === 'AccelerateSelectedCard') return 'Accelerate a card';
    if (o.op === 'StabiliseSelectedCard')  return 'Stabilise a card';
    if (o.op === 'RepairSelectedCard')     return 'Repair a card';
    if (o.op === 'RemoveSelectedCard')     return 'Remove a card';
    return o.op;
  }).join(' · ');

  if (phase === 'intro') {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={null} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
          <div style={{ fontSize: 52 }}>{def.icon}</div>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, color: C.cyan, textAlign: 'center' }}>{def.title}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: 'center', maxWidth: 280 }}>{def.desc}</div>
          <div style={{ width: '100%', maxWidth: 280, background: '#12121a', borderRadius: 12, padding: 14, border: '1px solid #2a2a3a' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginBottom: 8, letterSpacing: '0.1em' }}>REWARDS</div>
            {[['gold', C.yellow], ['silver', '#aaa'], ['fail', C.red]].map(([tier, col]) => (
              <div key={tier} style={{ fontFamily: MONO, fontSize: 11, color: col, marginBottom: 4 }}>
                {TIER_LABEL[tier]}: {rewardLine(def.rewards[tier] ?? [])}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 280 }}>
            <button onClick={() => setPhase('playing')} style={{
              flex: 1, padding: '14px 0', borderRadius: 12, fontFamily: MONO, fontWeight: 700, fontSize: 14,
              background: C.cyan, color: '#000', border: 'none', cursor: 'pointer',
            }}>PLAY</button>
            <button onClick={handleSkip} style={{
              padding: '14px 18px', borderRadius: 12, fontFamily: MONO, fontSize: 12,
              background: 'transparent', color: C.textDim, border: `1px solid #2a2a3a`, cursor: 'pointer',
            }}>Skip</button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (phase === 'playing') {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={null} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', overflowY: 'auto' }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 16, color: C.cyan, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>{def.icon}</span><span>{def.title}</span>
          </div>
          {def.type === 'memory'   && <MemoryGame   config={def.config} onComplete={handleComplete} />}
          {def.type === 'timing'   && <TimingGame   config={def.config} onComplete={handleComplete} />}
          {def.type === 'sequence' && <SequenceGame config={def.config} onComplete={handleComplete} />}
          {def.type === 'rapid'    && <RapidGame    config={def.config} onComplete={handleComplete} />}
        </div>
      </ScreenShell>
    );
  }

  // Result screen
  const col = TIER_COLOR[resultTier] || C.text;
  return (
    <ScreenShell>
      <RunHeader run={state.run} data={null} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <div style={{ fontSize: 52 }}>{def.icon}</div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 28, color: col }}>{TIER_LABEL[resultTier]}</div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, textAlign: 'center' }}>
          {rewardLine(def.rewards[resultTier] ?? [])}
        </div>
        <button onClick={handleClaim} style={{
          padding: '14px 48px', borderRadius: 12, fontFamily: MONO, fontWeight: 700, fontSize: 15,
          background: col, color: '#000', border: 'none', cursor: 'pointer',
          boxShadow: `0 0 24px ${col}50`,
        }}>CLAIM</button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// EVENT SCREEN
// ============================================================
function EventScreen({ state, data, onAction }) {
  const eventId = state.event?.eventId;

  if (isMinigameEvent(eventId)) {
    return <MinigameScreen state={state} onAction={onAction} />;
  }

  if (eventId === 'RestSite') {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={data} />
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="animate-slide-up"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              fontWeight: 700,
              fontSize: '24px',
              marginBottom: '8px',
              color: C.green,
            }}
          >
            REST SITE
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '32px', color: C.textMuted, fontSize: 12 }}>
            Choose an action
          </div>

          <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { type: 'Rest_Heal', label: 'Rest', desc: 'Heal 30% HP', color: C.green, icon: '\u2665' },
              { type: 'Rest_Repair', label: 'Repair', desc: 'Restore a card', color: C.cyan, icon: '\uD83D\uDD27' },
              { type: 'Rest_Stabilise', label: 'Stabilise', desc: 'Stabilise a card', color: C.purple, icon: '\u25C6' },
            ].map(opt => (
              <button
                key={opt.type}
                onClick={() => onAction({ type: opt.type })}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  backgroundColor: C.bgCard,
                  border: `2px solid ${opt.color}40`,
                  boxShadow: `0 0 16px ${opt.color}10`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      backgroundColor: `${opt.color}15`,
                      border: `1px solid ${opt.color}40`,
                    }}
                  >
                    {opt.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: opt.color, fontSize: 14 }}>{opt.label}</div>
                    <div style={{ color: C.textMuted, fontSize: 11 }}>{opt.desc}</div>
                  </div>
                </div>
              </button>
            ))}

            <button
              onClick={() => onAction({ type: 'Rest_Leave' })}
              style={getSecondaryActionButtonStyle(C.green, {
                textAlign: 'center',
                marginTop: '8px',
              })}
            >
              Leave
            </button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  // Registry-driven generic event
  const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const _baseDef = EVENT_REG_UI.events[eventId];
  // Inject background image from gamedata or our image mapping
  const eventDef = _baseDef
    ? { ..._baseDef, image: _baseDef.image || getEventImage(eventId) }
    : _baseDef;

  if (!eventDef) {
    return (
      <ScreenShell>
        <RunHeader run={state.run} data={data} />
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: '20px', marginBottom: '8px', color: C.cyan }}>
            UNKNOWN EVENT
          </div>
          <div style={{ fontFamily: MONO, marginBottom: '32px', color: C.textMuted, fontSize: 13 }}>{eventId}</div>
          <button
            onClick={() => onAction({ type: 'GoToMap' })}
            style={{ padding: '16px 32px', borderRadius: '12px', fontFamily: MONO, fontWeight: 700, backgroundColor: C.cyan, color: '#000', border: 'none', cursor: 'pointer' }}
          >
            Continue
          </button>
        </div>
      </ScreenShell>
    );
  }

  // Categorise choices for coloring
  const choiceColor = (choice) => {
    const ops = choice.ops.map(o => o.op);
    if (ops.includes('LoseHP')) return C.red;
    if (ops.includes('GainMaxHP')) return C.purple;
    if (ops.includes('DuplicateSelectedCard')) return C.purple;
    if (ops.includes('GainCard')) return C.cyan;
    if (ops.includes('AccelerateSelectedCard')) return C.orange;
    if (ops.includes('RemoveSelectedCard')) return C.red;
    if (ops.includes('RepairSelectedCard')) return C.cyan;
    if (ops.includes('StabiliseSelectedCard')) return C.purple;
    if (ops.includes('GainGold')) return C.yellow;
    if (ops.includes('GainMP')) return C.cyan;
    if (ops.includes('Heal')) return C.green;
    if (choice.ops.length === 0) return C.textMuted;
    return C.text;
  };

  return (
    <ScreenShell>
      <RunHeader run={state.run} data={data} />
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>

        {/* Event card */}
        <div
          className="animate-slide-up"
          style={{
            borderRadius: '16px',
            backgroundColor: C.bgCard,
            border: `1px solid ${C.cyan}30`,
            boxShadow: `0 0 40px ${C.cyan}08`,
            marginBottom: '24px',
            textAlign: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Banner image — shown when event has art */}
          {eventDef.image && (
            <img
              src={eventDef.image}
              alt={eventDef.title}
              style={{
                width: '100%', height: '150px',
                objectFit: 'cover', display: 'block',
                borderBottom: `1px solid ${C.cyan}20`,
              }}
            />
          )}
          <div style={{ padding: '20px 24px 24px' }}>
            {/* Icon — hide if banner image present */}
            {!eventDef.image && (
              <div style={{ fontSize: '52px', lineHeight: 1, marginBottom: '12px' }}>{eventDef.icon}</div>
            )}
            {/* Title */}
            <div style={{
              fontFamily: MONO, fontWeight: 700, fontSize: '18px',
              color: C.cyan, letterSpacing: '0.05em', marginBottom: '12px',
            }}>
              {eventDef.icon && eventDef.image ? `${eventDef.icon}  ` : ''}{eventDef.title.toUpperCase()}
            </div>
            {/* Flavour text */}
            <div style={{
              fontFamily: MONO, fontSize: '12px', color: C.textDim,
              fontStyle: 'italic', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto',
            }}>
              "{eventDef.text}"
            </div>
          </div>
        </div>

        {/* Choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
          {eventDef.choices.map(choice => {
            const col = choiceColor(choice);
            const isLeave = choice.ops.length === 0;
            return (
              <button
                key={choice.id}
                onClick={() => onAction({ type: 'Event_Choose', choiceId: choice.id })}
                style={isLeave
                  ? getSecondaryActionButtonStyle(C.cyan, {
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontFamily: MONO,
                  })
                  : {
                    width: '100%', padding: '14px 16px',
                    borderRadius: '12px', textAlign: 'left',
                    fontFamily: MONO, fontWeight: 600,
                    fontSize: 13,
                    transition: 'all 0.15s ease',
                    backgroundColor: `${col}10`,
                    border: `2px solid ${col}50`,
                    boxShadow: `0 0 12px ${col}0a`,
                    color: col,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}
              >
                {!isLeave && (
                  <div style={{
                    width: 28, height: 28, borderRadius: '6px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px',
                    backgroundColor: `${col}20`,
                    border: `1px solid ${col}40`,
                  }}>
                    {choice.ops.some(o => o.op === 'GainGold') ? '💰'
                      : choice.ops.some(o => o.op === 'Heal') ? '💊'
                      : choice.ops.some(o => o.op === 'GainMaxHP') ? '⬆'
                      : choice.ops.some(o => o.op === 'RemoveSelectedCard') ? '🗑'
                      : choice.ops.some(o => o.op === 'RepairSelectedCard') ? '🔧'
                      : choice.ops.some(o => o.op === 'StabiliseSelectedCard') ? '◆'
                      : choice.ops.some(o => o.op === 'AccelerateSelectedCard') ? '⚡'
                      : choice.ops.some(o => o.op === 'GainMP') ? '💾'
                      : choice.ops.some(o => o.op === 'LoseHP') ? '⚠'
                      : '▶'}
                  </div>
                )}
                <span>{choice.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </ScreenShell>
  );
}

// ============================================================
// DECK PICKER OVERLAY
// shown when state.deckView is set (shop service / event card op)
// ============================================================

const DECK_OP_LABELS = {
  RemoveSelectedCard:    { label: 'REMOVE A CARD',    desc: 'The chosen card will be permanently deleted.', color: '#ff4444' },
  RepairSelectedCard:    { label: 'REPAIR A CARD',    desc: 'Restore the chosen card\'s use counter.', color: '#00f0ff' },
  StabiliseSelectedCard: { label: 'STABILISE A CARD', desc: 'Reset the chosen card\'s mutation countdown.', color: '#b44aff' },
  AccelerateSelectedCard:{ label: 'ACCELERATE A CARD',desc: 'Speed up the chosen card\'s mutation trigger.', color: '#ff6b00' },
};

function DeckPickerOverlay({ state, data, onAction }) {
  const dv = state.deckView;
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const handleClose = useCallback(() => onAction({ type: 'CloseDeck' }), [onAction]);
  const pendingOp = state.event?.pendingSelectOp || state.shop?.pendingService;
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));

  useDialogAccessibility(Boolean(dv), {
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: handleClose,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncViewport = () => setViewportWidth(window.innerWidth);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  if (!dv) return null;

  const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const opInfo = DECK_OP_LABELS[pendingOp] || { label: 'SELECT A CARD', desc: pendingOp || '', color: '#00f0ff' };

  const master = state.deck?.master || [];
  const instances = state.deck?.cardInstances || {};
  const typeColors = { Attack: C.red, Skill: C.green, Power: C.purple, Defense: C.cyan, Support: C.green, Utility: C.yellow };

  const cards = master
    .map(iid => {
      const ci = instances[iid];
      if (!ci) return null;
      const def = data?.cards?.[ci.defId];
      if (!def) return null;
      if (def.tags?.includes('EnemyCard')) return null;
      return { iid, ci, def };
    })
    .filter(Boolean);

  const canCancel = !pendingOp;
  const closeLabel = canCancel ? 'Close deck' : 'Cancel selection';
  const showLegacyDeckList = state.run?.debugOverrides?.showLegacyDeckList === true;
  const deckColumnCount = viewportWidth >= 960 ? 3 : 2;
  const deckGridWidth = deckColumnCount === 3 ? 624 : 412;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-picker-title"
      aria-describedby="deck-picker-desc"
      tabIndex={-1}
      style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backgroundColor: 'rgba(0,0,0,0.88)',
      display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div className="safe-area-top" style={{
        padding: '16px',
        backgroundColor: C.bgBar,
        borderBottom: `1px solid ${opInfo.color}40`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="deck-picker-title" style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: opInfo.color, marginBottom: 4 }}>
            {opInfo.label}
          </div>
          <div id="deck-picker-desc" style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted, lineHeight: 1.45 }}>
            {opInfo.desc}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 6 }}>
            {cards.length} card{cards.length !== 1 ? 's' : ''} in deck
          </div>
        </div>
        <button
          ref={closeButtonRef}
          onClick={handleClose}
          aria-label={closeLabel}
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            border: `1px solid ${C.border}`,
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: C.text,
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          CLOSE
        </button>
      </div>

      {/* Card list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'grid',
          gridTemplateColumns: `repeat(${deckColumnCount}, minmax(0, 1fr))`,
          width: '100%',
          maxWidth: `${deckGridWidth}px`,
          margin: '0 auto',
          gap: '12px',
          alignContent: 'start',
          justifyItems: 'center',
        }}
      >
        {cards.map(({ iid, ci, def }) => (
          <CardChoiceTile
            key={iid}
            cardId={ci.defId}
            card={def}
            instance={ci}
            selected={dv.selectedInstanceId === iid}
            onClick={() => onAction({ type: 'SelectDeckCard', instanceId: iid })}
          />
        ))}
        {showLegacyDeckList && cards.map(({ iid, ci, def }) => {
          const color = typeColors[def.type] || C.text;
          const maxUse = getCardUseCounterLimit(def, ci, data);
          const { core: isCore, nextValue: visibleUseCounter, finalValue: visibleFinalCounter, isDecaying: decaying } = getCardLifecycleDisplay(def, ci);
          const useRatio = isCore ? null : (maxUse ? (ci.useCounter ?? maxUse) / maxUse : null);
          const worn = !isCore && useRatio !== null && useRatio < 0.35;
          const mutated     = !!ci.finalMutationId;
          const isRewritten = ci.finalMutationId === 'J_REWRITE';
          const isBricked   = ci.finalMutationId === 'J_BRICK';
          const activeMuts  = ci.appliedMutations || [];
          const hasMutation = activeMuts.length > 0;   // fixed: was ci.mutationId

          // Tier → colour mapping for mutation chips
          const TIER_COLS = { A:'#55ff99', B:'#44ddff', C:'#ffcc44', D:'#ff8844',
                              E:'#ff5555', F:'#cc44ff', G:'#ff44aa', H:'#ffffff', I:'#ff2222' };

          return (
            <button
              key={iid}
              onClick={() => onAction({ type: 'SelectDeckCard', instanceId: iid })}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px',
                textAlign: 'left', transition: 'all 0.15s ease',
                backgroundColor: `${color}08`,
                border: `2px solid ${isBricked ? C.red : decaying ? C.orange : color}35`,
                boxShadow: decaying ? `0 0 10px ${C.orange}18` : `0 0 10px ${color}0a`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* RAM cost */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: MONO, fontWeight: 700, fontSize: 12,
                  backgroundColor: color, color: '#000',
                }}>
                  {def.costRAM ?? 0}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color }}>
                      {def.name}
                    </span>
                    {isBricked && (
                      <span style={{
                        fontFamily: MONO, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        backgroundColor: `${C.red}25`, color: C.red, border: `1px solid ${C.red}40`,
                      }}>BRICKED</span>
                    )}
                    {isRewritten && (
                      <span style={{
                        fontFamily: MONO, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        backgroundColor: `${C.purple}25`, color: C.purple, border: `1px solid ${C.purple}40`,
                      }}>REWRITTEN</span>
                    )}
                    {worn && !mutated && !decaying && (
                      <span style={{
                        fontFamily: MONO, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        backgroundColor: `${C.orange}25`, color: C.orange, border: `1px solid ${C.orange}40`,
                      }}>WORN</span>
                    )}
                    {decaying && (
                      <span style={{
                        fontFamily: MONO, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        backgroundColor: `${C.orange}30`, color: C.orange, border: `1px solid ${C.orange}60`,
                      }}>DECAYING ⚠</span>
                    )}
                  </div>

                  {/* Mutation chips — one per active mutation, coloured by tier */}
                  {hasMutation && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                      {activeMuts.slice(0, 6).map((mid, idx) => {
                        const mut = data?.mutations?.[mid];
                        const tier = mid?.charAt(0) ?? '?';
                        const tc = TIER_COLS[tier] ?? '#aaa';
                        return (
                          <span key={`${mid}-${idx}`} style={{
                            fontFamily: MONO, fontSize: 8, padding: '1px 4px', borderRadius: 3,
                            backgroundColor: `${tc}18`, color: tc, border: `1px solid ${tc}35`,
                          }}>
                            {mut?.name ?? mid}
                          </span>
                        );
                      })}
                      {activeMuts.length > 6 && (
                        <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>
                          +{activeMuts.length - 6}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Counters row */}
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 3 }}>
                    {def.type}
                    {!mutated && visibleUseCounter != null && (
                      <span style={{ marginLeft: 8, color: worn ? C.orange : C.textDim }}>
                        {isCore ? `NEXT ${visibleUseCounter}` : `${visibleUseCounter} until mut`}
                      </span>
                    )}
                    {!mutated && visibleFinalCounter != null && (
                      <span style={{ marginLeft: 8, color: decaying ? C.orange : C.textDim }}>
                        {isCore ? `· FINAL ${visibleFinalCounter}` : `· final in ${visibleFinalCounter}`}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ color: C.textMuted, fontSize: 18, flexShrink: 0 }}>›</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Cancel / close footer */}
      <div className="safe-area-bottom" style={{ padding: '12px', backgroundColor: C.bgBar, borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={handleClose}
          style={getSecondaryActionButtonStyle(opInfo.color, {
            borderRadius: '10px',
            fontFamily: MONO,
            fontSize: 13,
          })}
        >
          {canCancel ? 'Close Deck' : 'Cancel Selection'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// GAME OVER SCREEN
// ============================================================
const DEATH_QUIPS = [
  'Connection terminated.',
  'Process killed.',
  'Signal lost.',
  'System failure.',
  'Neural link severed.',
  'Firewall breach — fatal.',
  'Memory corrupted beyond repair.',
  'Runtime exception: fatal.',
];

function GameOverScreen({ state, onNewRun }) {
  const MONO   = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const run    = state.run   || {};
  const deck   = state.deck  || {};
  const quip   = DEATH_QUIPS[(run.floor ?? 0) % DEATH_QUIPS.length];
  const hpPct  = run.maxHP ? Math.round(((run.hp ?? 0) / run.maxHP) * 100) : 0;
  const isVictory = !!run.victory;
  const causeOfDeath = deriveCauseOfDeath(state);

  const stats = [
    { label: 'ACT',       value: run.act   ?? 1 },
    { label: 'FLOOR',     value: run.floor ?? 0 },
    { label: 'HP',        value: `${run.hp ?? 0}/${run.maxHP ?? 0}`, color: hpPct > 30 ? C.green : C.red },
    { label: 'GOLD',      value: `${run.gold ?? 0}g`, color: C.yellow },
    { label: 'DECK SIZE', value: deck.master?.length ?? 0 },
    { label: 'MP',        value: `${run.mp ?? 0}mp`, color: C.cyan },
  ];

  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="animate-slide-up" style={{ textAlign: 'center', width: '100%', maxWidth: 360 }}>

        {/* Big title */}
        {isVictory ? (
          <>
            <div
              style={{ fontFamily: MONO, fontWeight: 900, fontSize: 38, color: C.green, marginBottom: 8,
                letterSpacing: '0.1em', textShadow: `0 0 40px ${C.green}80` }}
            >
              ✓ RUN COMPLETE
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 32, fontStyle: 'italic' }}>
              All three acts cleared. The network is silent.
            </div>
          </>
        ) : (
          <>
            <div
              className="glitch-text"
              data-text="GAME OVER"
              style={{ fontFamily: MONO, fontWeight: 700, fontSize: 40, color: C.red, marginBottom: 8, textShadow: `0 0 40px ${C.red}80` }}
            >
              GAME OVER
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 32, fontStyle: 'italic' }}>
              {quip}
            </div>
            {causeOfDeath?.summary && (
              <div
                style={{
                  marginBottom: 24,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${C.red}35`,
                  background: `${C.red}10`,
                  textAlign: 'left',
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.red, marginBottom: 6 }}>
                  CAUSE OF DEATH
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.5, color: C.text }}>
                  {causeOfDeath.summary}
                </div>
                {causeOfDeath.logMessage && causeOfDeath.logMessage !== causeOfDeath.summary && (
                  <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.45, color: C.textDim, marginTop: 6 }}>
                    {causeOfDeath.logMessage}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Stats grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8, marginBottom: 32,
          padding: '16px', borderRadius: 14,
          backgroundColor: C.bgCard, border: `1px solid ${C.border}`,
        }}>
          {stats.map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '8px 4px' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, letterSpacing: '0.1em', marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 16, color: s.color || C.text }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* HP bar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ height: 4, borderRadius: 9999, backgroundColor: '#1a1a2a', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 9999,
              width: `${hpPct}%`,
              backgroundColor: hpPct > 50 ? C.green : hpPct > 20 ? C.orange : C.red,
              boxShadow: `0 0 8px ${hpPct > 50 ? C.green : C.red}`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 4 }}>
            {hpPct}% HP remaining
          </div>
        </div>

        <button
          onClick={onNewRun}
          style={{
            padding: '16px 48px', borderRadius: '12px',
            fontFamily: MONO, fontWeight: 700, fontSize: 18,
            transition: 'all 0.15s ease',
            backgroundColor: C.cyan, color: '#000',
            boxShadow: `0 0 30px ${C.cyan}50`,
            border: 'none', cursor: 'pointer',
          }}
        >
          ▶ NEW RUN
        </button>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// LOADING SCREEN
// ============================================================
function LoadingScreen() {
  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, fontSize: '20px', marginBottom: '24px', color: C.cyan }}>
          INITIALIZING
        </div>
        <div style={{ width: '160px', height: '4px', borderRadius: '9999px', overflow: 'hidden', backgroundColor: '#1a1a2a' }}>
          <div
            className="animate-pulse"
            style={{ height: '100%', borderRadius: '9999px', width: '60%', backgroundColor: C.cyan, boxShadow: `0 0 10px ${C.cyan}` }}
          />
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginTop: '12px', color: C.textMuted, fontSize: 10 }}>
          Loading game data...
        </div>
      </div>
    </ScreenShell>
  );
}

// ============================================================
// DEV TOOLS OVERLAY
// ============================================================
function DevButtons({ state, onDevAction, onToggleLog, embedded = false }) {
  const [collapsed, setCollapsed] = useState(true);

  const copySnapshot = () => {
    try {
      const snapshot = { run: state.run, map: state.map, combat: state.combat, log: state.log, journal: state.journal };
      navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    } catch (err) { console.error('Failed to copy snapshot', err); }
  };

  const copyRepro = () => {
    try {
      const repro = { seed: state.journal?.seed, actions: state.journal?.actions };
      navigator.clipboard.writeText(JSON.stringify(repro, null, 2));
    } catch (err) { console.error('Failed to copy reproduction script', err); }
  };

  const devBtnStyle = {
    paddingLeft: '8px',
    paddingRight: '8px',
    paddingTop: '4px',
    paddingBottom: '4px',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    borderRadius: '4px',
    backgroundColor: '#333',
    border: 'none',
    cursor: 'pointer',
  };

  if (collapsed && !embedded) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '8px',
          zIndex: 50,
          width: '28px',
          height: '28px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: '12px',
          backgroundColor: '#222',
          color: '#0ff',
          opacity: 0.5,
          border: `1px solid #333`,
          cursor: 'pointer',
        }}
      >
        D
      </button>
    );
  }

  return (
    <div style={{
      position: embedded ? 'relative' : 'fixed',
      bottom: embedded ? undefined : '80px',
      right: embedded ? undefined : '8px',
      zIndex: embedded ? 'auto' : 50,
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      maxWidth: embedded ? '100%' : 100,
    }}>
      {!embedded && (
        <button
          onClick={() => setCollapsed(true)}
          style={{ ...devBtnStyle, alignSelf: 'flex-start', backgroundColor: '#333', color: '#f66' }}
        >
          {'\u2715'} Close
        </button>
      )}
      {[
        { label: '+100 HP', color: '#0ff', action: { type: 'Dev_AddHP', amount: 100 } },
        { label: '+100 Gold', color: '#ff0', action: { type: 'Dev_AddGold', amount: 100 } },
        { label: '+5 RAM', color: '#0f0', action: { type: 'Dev_AddRAM', amount: 5 } },
      ].map(btn => (
        <button
          key={btn.label}
          onClick={() => onDevAction(btn.action)}
          style={{ ...devBtnStyle, color: btn.color }}
        >
          {btn.label}
        </button>
      ))}
      <button onClick={copySnapshot} style={{ ...devBtnStyle, color: '#0af' }}>
        Snapshot
      </button>
      <button onClick={copyRepro} style={{ ...devBtnStyle, color: '#f0a' }}>
        Repro
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_StartTurn' })} style={{ ...devBtnStyle, color: '#0cf' }}>
        StartTurn
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_EndTurn' })} style={{ ...devBtnStyle, color: '#0cf' }}>
        EndTurn
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_Simulate', maxTurns: 1 })} style={{ ...devBtnStyle, color: '#0c6' }}>
        Sim 1
      </button>
      <button onClick={() => onDevAction({ type: 'Combat_Simulate', maxTurns: 10 })} style={{ ...devBtnStyle, color: '#0c6' }}>
        Sim 10
      </button>
      <button onClick={onToggleLog} style={{ ...devBtnStyle, color: '#f60' }}>
        Log
      </button>
    </div>
  );
}

function LogOverlay({ log }) {
  const entries = (log || []).slice(-30).reverse();
  return (
    <div
      className="safe-area-bottom"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '256px',
        overflowY: 'auto',
        zIndex: 50,
        padding: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        borderTop: `1px solid ${C.border}`,
      }}
    >
      <div style={{ marginBottom: '8px', fontSize: '12px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", textAlign: 'right', color: C.textMuted }}>
        Recent Log
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", textAlign: 'center', color: C.textMuted }}>
          No log entries
        </div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '2px', listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((e, i) => (
            <li key={i} style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}>
              <span style={{ color: C.cyan }}>{e.t || 'Info'}:</span>{' '}
              <span style={{ color: C.text }}>{e.msg}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// SAVE DIRECTORY — IndexedDB persistence for File System Access API handle
// ============================================================
const IDB_DB    = 'cardbattler-prefs';
const IDB_STORE = 'settings';
const IDB_KEY   = 'saveDirHandle';

function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = () => rej(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror   = () => rej(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

// ============================================================
// CUSTOM RUN CONFIG — defaults (module-level so they can be referenced as a stable object)
// ============================================================
const CUSTOM_CONFIG_DEFAULTS = {
  playerMaxHP:       null,
  startingGold:      null,
  playerMaxRAM:      null,
  playerRamRegen:    null,
  drawPerTurnDelta:  null,
  enemyHpMult:       null,
  enemyDmgMult:      null,
  actOverride:       null,
  encounterKind:     null,
  enemyCount:        null,
  startingCardIds:   null,
};

// ============================================================
// MAIN APP
// ============================================================
function App() {
  const [data, setData] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  // ── Sound mute toggle (persisted to localStorage) ────────────────────────
  const [soundMuted, setSoundMuted] = useState(() => {
    const stored = localStorage.getItem('cb_muted') === 'true';
    sfx.setMuted(stored);
    return stored;
  });
  function toggleMute() {
    setSoundMuted(m => {
      const next = !m;
      sfx.setMuted(next);
      localStorage.setItem('cb_muted', String(next));
      return next;
    });
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const hasActiveRun = Boolean(state?.run) && state?.mode !== 'GameOver';
    if (!hasActiveRun) {
      backGuardPrimedRef.current = false;
      return undefined;
    }

    if (!backGuardPrimedRef.current) {
      window.history.pushState({ cardbattlerGuard: true }, '', window.location.href);
      backGuardPrimedRef.current = true;
    }

    const onPopState = () => {
      const liveState = stateRef.current;
      if (!liveState?.run || liveState.mode === 'GameOver') return;
      if (!showPauseMenu) {
        window.history.pushState({ cardbattlerGuard: true }, '', window.location.href);
        if (aiTimerRef.current) {
          clearTimeout(aiTimerRef.current);
          aiTimerRef.current = null;
        }
        aiPausedRef.current = true;
        setAiPaused(true);
        setAiHandoffReason('Paused from menu');
        setAiWatchdog(AI_WATCHDOG_IDLE);
        setShowPauseMenu(true);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [showPauseMenu, state?.mode, state?.run]);

  // ── URL params: read from global captured in index.html before React loaded ──
  const _up = (key) => window.__launchParams?.[key] ?? null;

  // ── AI auto-play debug state ──────────────────────────────────────────────
  const [aiEnabled, setAiEnabled]       = useState(() => _up('ai') === 'true');
  const [aiPaused, setAiPaused]         = useState(false);
  const [aiSpeed, setAiSpeed]           = useState(() => {

    const v = parseInt(_up('speed'), 10);
    return (!isNaN(v) && v >= 150 && v <= 1500) ? v : 300;
  });
  const [aiStopAtAct, setAiStopAtAct]   = useState(null);
  const [aiStopAfterCombat, setAiStopAfterCombat] = useState(false);
  const [aiHandoffReason, setAiHandoffReason] = useState('');
  const [aiWatchdog, setAiWatchdog] = useState(AI_WATCHDOG_IDLE);
  const [aiExportOptions, setAiExportOptions] = useState(() => {
    try {
      const stored = localStorage.getItem('cb_ai_export_options');
      return normalizeAiExportOptions(stored ? JSON.parse(stored) : null);
    } catch {
      return { ...AI_EXPORT_OPTIONS_DEFAULTS };
    }
  });

  useEffect(() => {
    if (showPauseMenu && aiEnabled && !aiPaused) {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
      aiPausedRef.current = true;
      setAiPaused(true);
      setAiHandoffReason('Paused from menu');
      setAiWatchdog(AI_WATCHDOG_IDLE);
    }
  }, [showPauseMenu, aiEnabled, aiPaused]);
  // ── Custom run config: explicit per-field overrides ─────────────────────
  // Each value is null (not set) or a concrete override.
  // lockedFields: Set of keys whose values survive AI randomise-each-run.
  const [customConfig,  setCustomConfig]  = useState(CUSTOM_CONFIG_DEFAULTS);
  const [lockedFields,  setLockedFields]  = useState(new Set());

  // Build the customOverrides object to pass to NewRun (strip null values)
  function buildCustomOverrides(cfg) {
    const out = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  // Clear any unlocked fields before a randomised run, keeping locked ones
  function customConfigForRandomRun(cfg, locked) {
    const out = { ...cfg };
    for (const k of Object.keys(out)) {
      if (!locked.has(k)) out[k] = null;
    }
    return out;
  }

  const [runHistory, setRunHistory]     = useState([]);
  const runIndexRef  = useRef(0);        // increments each completed run
  const prevModeRef  = useRef(null);     // detects mode transitions for stats
  const combatStatsRef = useRef(null);   // per-combat scratch data
  const aiEnabledRef = useRef(aiEnabled);
  const aiPausedRef  = useRef(aiPaused);
  const aiTimerRef   = useRef(null);
  const stateRef     = useRef(state);
  const dataRef      = useRef(data);
  const exportCurrentGameDataRef = useRef(async () => false);
  const startNewRunRef = useRef(() => {});
  const autosaveTokenRef = useRef(null);
  const backGuardPrimedRef = useRef(false);
  const aiStallRef = useRef({
    signature: null,
    lastChangedAt: 0,
    exportTriggered: false,
    recoveryTriggered: false,
  });
  // ── Per-run accumulator refs (all cleared on GameOver) ───────────────────
  const pendingEncountersRef  = useRef([]);   // finalised combat entries
  const pendingCardEventsRef  = useRef([]);   // reward offers + picks
  const pendingFloorEventsRef = useRef([]);   // rest/shop/event outcomes
  const deckSnapshotsRef      = useRef([]);   // deck state at each floor change
  const lastFloorRef          = useRef(null); // previous floor for change detection

  function resolveRequestedDebugSeed(overrideDebugSeed = undefined, fallbackValue = debugSeedInput) {
    if (overrideDebugSeed !== undefined) return overrideDebugSeed;
    const parsed = parseInt(String(fallbackValue ?? '').trim(), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function createRunStateFromSettings({
    overrideDebugSeed = undefined,
    sourceSeedMode = seedMode,
    sourceCustomConfig = customConfig,
    sourceLockedFields = lockedFields,
  } = {}) {
    if (!data) return null;
    const initial = createInitialState();
    return dispatchWithJournal(initial, data, {
      type: 'NewRun',
      seed: Date.now(),
      debugSeed: resolveRequestedDebugSeed(overrideDebugSeed),
      debugSeedMode: sourceSeedMode,
      customOverrides: buildCustomOverrides(sourceCustomConfig),
      lockedKeys: [...sourceLockedFields],
    });
  }

  function resetRunTransientState() {
    clearAiTimer();
    combatStatsRef.current = null;
    pendingEncountersRef.current = [];
    pendingCardEventsRef.current = [];
    pendingFloorEventsRef.current = [];
    deckSnapshotsRef.current = [];
    lastFloorRef.current = null;
    prevModeRef.current = null;
    autosaveTokenRef.current = null;
    backGuardPrimedRef.current = false;
    setShowPauseMenu(false);
    setShowLog(false);
  }

  function reloadApp() {
    setShowPauseMenu(false);
    window.location.reload();
  }

  function hardReloadIntoFreshRun(overrideDebugSeed = undefined) {
    const debugSeed = resolveRequestedDebugSeed(overrideDebugSeed);
    queueForcedNewRun({
      overrideDebugSeed: debugSeed,
      seedMode,
      customConfig,
      lockedFields: [...lockedFields],
    });
    clearNodeAutosave();
    resetRunTransientState();
    setAiHandoffReason('');
    try {
      window.location.reload();
    } catch {
      startNewRunRef.current?.(debugSeed);
    }
  }

  function abandonRun() {
    if (!stateRef.current?.run) return;
    const confirmed = window.confirm('Abandon this run and start a fresh one?');
    if (!confirmed) return;
    hardReloadIntoFreshRun();
  }

  // ── Save directory (File System Access API, persisted via IndexedDB) ─────
  const saveDirHandle = useRef(null);
  const [saveDirName, setSaveDirName] = useState(null);

  // Restore handle from IndexedDB on mount
  useEffect(() => {
    idbGet(IDB_KEY).then(async handle => {
      if (!handle) return;
      try {
        await handle.queryPermission({ mode: 'readwrite' }); // throws if stale
        saveDirHandle.current = handle;
        setSaveDirName(handle.name);
      } catch { /* stale handle, ignore */ }
    }).catch(() => {});
  }, []);

  async function pickSaveDir() {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
      saveDirHandle.current = handle;
      setSaveDirName(handle.name);
      await idbSet(IDB_KEY, handle);
    } catch { /* user cancelled */ }
  }

  async function writeToSaveDir(filename, jsonStr) {
    const handle = saveDirHandle.current;
    if (!handle) return false;
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      const fh  = await handle.getFileHandle(filename, { create: true });
      const w   = await fh.createWritable();
      await w.write(jsonStr);
      await w.close();
      return true;
    } catch (e) {
      console.error('writeToSaveDir failed:', e);
      return false;
    }
  }

  function fallbackDownload(filename, jsonStr) {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Debug seed state ─────────────────────────────────────────────────────
  const [debugSeedInput, setDebugSeedInput]         = useState(() => _up('seed') ?? '');
  const [randomizeDebugSeed, setRandomizeDebugSeed] = useState(() => _up('randomize') === 'true');
  // 'wild' | 'sensible' — which decoder to use for the current seed / each-run randomise
  const [seedMode, setSeedMode] = useState(() => {
    const sm = _up('seedMode');
    return (sm === 'wild' || sm === 'sensible') ? sm : 'wild';
  });

  // ── AI Playstyle ──────────────────────────────────────────────────────────
  const [aiPlaystyle, setAiPlaystyle] = useState(() => {
    const ps = _up('playstyle');
    return (ps && AI_PLAYSTYLES[ps]) ? ps : 'balanced';
  });

  useEffect(() => {
    localStorage.setItem('cb_ai_export_options', JSON.stringify(aiExportOptions));
  }, [aiExportOptions]);

  useEffect(() => {
    aiEnabledRef.current = aiEnabled;
    aiPausedRef.current = aiPaused;
    stateRef.current = state;
    dataRef.current = data;
  }, [aiEnabled, aiPaused, state, data]);

  useEffect(() => {
    if (!state?.run) return;
    if (state.mode === 'GameOver') {
      clearNodeAutosave();
      autosaveTokenRef.current = null;
      return;
    }
    const token = buildNodeAutosaveToken(state);
    if (!token || token === autosaveTokenRef.current) return;
    try {
      const savedToken = writeNodeAutosave(state);
      if (savedToken) autosaveTokenRef.current = savedToken;
    } catch (err) {
      console.error('Failed to write node autosave', err);
    }
  }, [state]);

  useEffect(() => {
    loadGameData()
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (data && !state) {
      const forcedRun = consumeForcedNewRun();
      if (forcedRun) {
        const nextSeedMode = forcedRun.seedMode === 'sensible' ? 'sensible' : 'wild';
        const nextCustomConfig = {
          ...CUSTOM_CONFIG_DEFAULTS,
          ...(forcedRun.customConfig && typeof forcedRun.customConfig === 'object' ? forcedRun.customConfig : {}),
        };
        const nextLockedFields = new Set(Array.isArray(forcedRun.lockedFields) ? forcedRun.lockedFields : []);
        const forcedDebugSeed = forcedRun.overrideDebugSeed ?? null;
        clearNodeAutosave();
        autosaveTokenRef.current = null;
        setSeedMode(nextSeedMode);
        setCustomConfig(nextCustomConfig);
        setLockedFields(nextLockedFields);
        setDebugSeedInput(forcedDebugSeed == null ? '' : String(forcedDebugSeed));
        const newState = createRunStateFromSettings({
          overrideDebugSeed: forcedDebugSeed,
          sourceSeedMode: nextSeedMode,
          sourceCustomConfig: nextCustomConfig,
          sourceLockedFields: nextLockedFields,
        });
        setState(newState);
        return;
      }

      const autosave = readNodeAutosave();
      if (autosave?.state) {
        autosaveTokenRef.current = autosave.token || buildNodeAutosaveToken(autosave.state);
        setAiHandoffReason('Resumed from node autosave.');
        setState(autosave.state);
        return;
      }

      clearNodeAutosave();
      autosaveTokenRef.current = null;
      const newState = createRunStateFromSettings();
      setState(newState);
    }
  }, [data, state, debugSeedInput, seedMode, customConfig, lockedFields]);

  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
  }, []);

  const resetAiStallTracker = useCallback((signature = null) => {
    const now = Date.now();
    aiStallRef.current = {
      signature,
      lastChangedAt: now,
      exportTriggered: false,
      recoveryTriggered: false,
    };
    setAiWatchdog({
      active: Boolean(signature),
      stagnantMs: 0,
      exportTriggered: false,
      recoveryTriggered: false,
      lastChangedAt: signature ? now : 0,
    });
  }, []);

  const stopAiForTakeover = useCallback((reason = 'Manual takeover ready.') => {
    clearAiTimer();
    aiEnabledRef.current = false;
    aiPausedRef.current = false;
    setAiEnabled(false);
    setAiPaused(false);
    setAiStopAfterCombat(false);
    setAiHandoffReason(reason);
    resetAiStallTracker(null);
  }, [clearAiTimer, resetAiStallTracker]);

  const archiveInProgressRun = useCallback((outcome = 'stalled_restart', outcomeReason = 'AI stall auto-restart') => {
    const currentState = stateRef.current;
    const currentData = dataRef.current;
    if (!currentState?.run || !currentData) return false;
    const liveEncounter = combatStatsRef.current
      ? finalizeEncounterForExport(
          combatStatsRef.current,
          currentState,
          currentState.mode,
          currentState.mode === 'Combat'
            ? 'in_progress'
            : (currentState.mode === 'Reward'
                ? 'win'
                : (currentState.mode === 'GameOver' ? 'loss' : combatStatsRef.current.result)),
        )
      : null;
    const idx = ++runIndexRef.current;
    const archived = {
      ...buildRunRecord({
        runIndex: idx,
        state: currentState,
        data: currentData,
        seedMode,
        aiPlaystyle,
        encounters: liveEncounter
          ? [...pendingEncountersRef.current, liveEncounter]
          : pendingEncountersRef.current,
        deckSnapshots: deckSnapshotsRef.current,
        cardEvents: pendingCardEventsRef.current,
        floorEvents: pendingFloorEventsRef.current,
        outcome,
      }),
      outcomeReason,
      endMode: currentState.mode ?? null,
      watchdogTerminated: true,
    };
    combatStatsRef.current = null;
    pendingEncountersRef.current = [];
    pendingCardEventsRef.current = [];
    pendingFloorEventsRef.current = [];
    deckSnapshotsRef.current = [];
    lastFloorRef.current = null;
    setRunHistory((prev) => [...prev, archived]);
    return true;
  }, [aiPlaystyle, seedMode]);

  const runAiStepRef = useRef(() => {});

  const scheduleAiTick = useCallback((delayMs = null) => {
    clearAiTimer();
    if (!aiEnabledRef.current || aiPausedRef.current || !dataRef.current || !stateRef.current) return;
    const wait = Math.max(60, delayMs ?? aiSpeed);
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null;
      runAiStepRef.current();
    }, wait);
  }, [aiSpeed, clearAiTimer]);

  useEffect(() => {
    runAiStepRef.current = () => {
      if (!aiEnabledRef.current || aiPausedRef.current) return;

      const currentState = stateRef.current;
      const currentData = dataRef.current;
      if (!currentState || !currentData) return;

      const signature = getAiStateSignature(currentState);
      const now = Date.now();
      if (aiStallRef.current.signature !== signature) {
        resetAiStallTracker(signature);
      } else {
        const stagnantMs = now - (aiStallRef.current.lastChangedAt || now);
        if (stagnantMs >= AI_STALL_EXPORT_MS && !aiStallRef.current.exportTriggered) {
          aiStallRef.current.exportTriggered = true;
          setAiWatchdog((prev) => ({
            ...prev,
            active: true,
            stagnantMs,
            exportTriggered: true,
          }));
          setAiHandoffReason('AI stall detected. Exporting current run snapshot.');
          queueMicrotask(() => {
            exportCurrentGameDataRef.current?.().catch?.(() => {});
          });
        }
        if (stagnantMs >= AI_STALL_RECOVER_MS && !aiStallRef.current.recoveryTriggered) {
          aiStallRef.current.recoveryTriggered = true;
          setAiWatchdog((prev) => ({
            ...prev,
            active: true,
            stagnantMs,
            exportTriggered: true,
            recoveryTriggered: true,
          }));

          if (currentState.mode === 'Combat' && !currentState.combat?.combatOver) {
            console.warn('[AI] stall detected in combat, forcing end turn once');
            setAiHandoffReason('AI stall detected. Forced an end turn to recover.');
            setState((prev) => {
              try {
                return dispatchWithJournal(prev, currentData, { type: 'Combat_EndTurn' });
              } catch (e) {
                console.error('[AI] stall recovery end turn failed', e);
                return prev;
              }
            });
            scheduleAiTick(Math.min(220, aiSpeed));
            return;
          }

          console.warn('[AI] stall detected outside combat, exporting and starting a fresh run');
          setAiHandoffReason('AI stall detected. Exported snapshot and started a fresh run.');
          archiveInProgressRun('stalled_restart', 'AI stall auto-restart');
          queueMicrotask(() => {
            exportCurrentGameDataRef.current?.().catch?.(() => {});
            startNewRunRef.current?.();
          });
          scheduleAiTick(Math.min(220, aiSpeed));
          return;
        }
      }

      const mode = currentState.mode;
      const prevMode = prevModeRef.current;
      prevModeRef.current = mode;

    const curFloor = currentState.run?.floor ?? null;
    if (curFloor !== null && curFloor !== lastFloorRef.current && currentState.deck?.master) {
      lastFloorRef.current = curFloor;
      deckSnapshotsRef.current.push({
        act: currentState.run.act,
        floor: curFloor,
        cards: currentState.deck.master.map(cid => currentState.deck.cardInstances?.[cid]?.defId ?? null),
      });
    }

    if (prevMode === 'Combat' && mode !== 'Combat' && combatStatsRef.current) {
      const cs = combatStatsRef.current;
      const inferredResult =
        mode === 'Reward' ? 'win' :
        mode === 'GameOver' ? 'loss' :
        (currentState.combat?.victory === true ? 'win' :
          currentState.combat?.victory === false ? 'loss' :
          cs.result);
      const encounter = finalizeEncounterForExport(cs, currentState, mode, inferredResult ?? 'unknown');
      pendingEncountersRef.current.push(encounter);
      combatStatsRef.current = null;
    }

    if (mode === 'Combat' && prevMode !== 'Combat' && (currentState.combat?.enemies?.length ?? 0) > 0) {
      const initEnemyHp = (currentState.combat?.enemies || []).reduce((sum, enemy) => sum + (enemy.hp ?? 0), 0);
      combatStatsRef.current = {
        act: currentState.run?.act ?? 1,
        floor: currentState.run?.floor ?? '?',
        nodeType: currentState.map?.nodes?.[currentState.map?.currentNodeId]?.type ?? null,
        enemies: (currentState.combat?.enemies || []).map(enemy => enemy.enemyDefId).filter(Boolean),
        relicIds: [...(currentState.run?.relicIds || [])],
        ruleMods: { ...(currentState.combat?.ruleMods || {}) },
        forcedMutationTier: currentState.combat?.forcedMutationTier ?? null,
        hpBefore: currentState.run?.hp ?? 0,
        turns: 0,
        result: null,
        endMode: null,
        outcomeReason: null,
        hpAfter: null,
        totalDamageDealt: 0,
        totalDamageReceived: 0,
        totalCardsPlayed: 0,
        totalRAMSpent: 0,
        enemyCardsPlayed: 0,
        enemyActionTypes: { Attack: 0, Defense: 0, Buff: 0, Debuff: 0, Other: 0 },
        mutationEvents: [],
        mutationTriggerChecks: [],
        handTimeline: [],
        cardPlayTimeline: [],
        enemyPlayTimeline: [],
        tacticalSummary: {
          attackIntoProtection: 0,
          attackIntoProtectionWithAffordableBreach: 0,
          breachIntoUnshieldedTarget: 0,
          firewallSpendWithoutFirewall: 0,
          enemyDefenseActions: 0,
          enemyProtectionGain: 0,
          enemyFirewallGain: 0,
        },
        damageBreakdown: {
          playerDealt: {
            total: 0,
            totalBlocked: 0,
            totalFirewallAbsorbed: 0,
            eventCount: 0,
            weakenedHits: 0,
            vulnerableHits: 0,
          },
          playerReceived: {
            total: 0,
            totalBlocked: 0,
            totalFirewallAbsorbed: 0,
            eventCount: 0,
            weakenedHits: 0,
            vulnerableHits: 0,
          },
        },
        _lastPlayerHp: currentState.run?.hp ?? 0,
        _lastEnemyHp: initEnemyHp,
        _logOffset: (currentState.log ?? []).length,
        _hadActivity: false,
      };
    }

    if (mode === 'Combat' && currentState.combat && combatStatsRef.current) {
      const cs = combatStatsRef.current;
      cs.turns = currentState.combat.turn ?? 0;
      if (currentState.combat.combatOver && cs.result === null) {
        cs.result = currentState.combat.victory ? 'win' : 'loss';
      }

      const curPlayerHp = currentState.run?.hp ?? 0;
      const curEnemyHp = (currentState.combat.enemies || []).reduce((sum, enemy) => sum + (enemy.hp ?? 0), 0);
      const dmgReceived = cs._lastPlayerHp - curPlayerHp;
      const dmgDealt = cs._lastEnemyHp - curEnemyHp;
      if (dmgReceived > 0) cs.totalDamageReceived += dmgReceived;
      if (dmgDealt > 0) cs.totalDamageDealt += dmgDealt;
      if (dmgReceived > 0 || dmgDealt > 0) cs._hadActivity = true;
      cs._lastPlayerHp = curPlayerHp;
      cs._lastEnemyHp = curEnemyHp;
      ingestCombatLogEntries(cs, currentState.log ?? [], currentState.combat.turn ?? 0);
    }

    if (aiStopAfterCombat && prevMode === 'Combat' && mode !== 'Combat') {
      stopAiForTakeover('Combat finished. AI handed control back to you.');
      return;
    }

    if (aiStopAtAct !== null && (currentState.run?.act ?? 0) >= aiStopAtAct && mode !== 'Combat' && mode !== 'GameOver') {
      stopAiForTakeover(`Reached Act ${aiStopAtAct}. AI handed control back to you.`);
      return;
    }

    if (mode === 'GameOver') {
      if (aiPausedRef.current || !aiEnabledRef.current) return;

      const idx = ++runIndexRef.current;
      const summary = buildRunRecord({
        runIndex: idx,
        state: currentState,
        data: currentData,
        seedMode,
        aiPlaystyle,
        encounters: pendingEncountersRef.current,
        deckSnapshots: deckSnapshotsRef.current,
        cardEvents: pendingCardEventsRef.current,
        floorEvents: pendingFloorEventsRef.current,
        outcome: currentState.run?.victory ? 'victory' : 'defeat',
      });
      pendingEncountersRef.current = [];
      pendingCardEventsRef.current = [];
      pendingFloorEventsRef.current = [];
      deckSnapshotsRef.current = [];
      lastFloorRef.current = null;
      setRunHistory(prev => [...prev, summary]);

      let nextDebugSeed = null;
      if (randomizeDebugSeed) {
        nextDebugSeed = randomDebugSeed();
      } else if (debugSeedInput.trim()) {
        const parsed = parseInt(debugSeedInput.trim(), 10);
        if (!isNaN(parsed)) nextDebugSeed = parsed;
      }

      const initial = createInitialState();
      const seed = Date.now();
      clearNodeAutosave();
      autosaveTokenRef.current = null;
      const next = dispatchWithJournal(initial, currentData, {
        type: 'NewRun',
        seed,
        debugSeed: nextDebugSeed,
        debugSeedMode: seedMode,
        customOverrides: buildCustomOverrides(customConfig),
        lockedKeys: [...lockedFields],
      });
      setState(next);
      resetAiStallTracker(getAiStateSignature(next));
      prevModeRef.current = null;
      scheduleAiTick(Math.min(120, aiSpeed));
      return;
    }

    const action = getAIAction(currentState, currentData, aiPlaystyle);
    if (!action) {
      scheduleAiTick(Math.min(220, aiSpeed));
      return;
    }

    if (action.type === 'Reward_PickCard') {
      pendingCardEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        offered: (currentState.reward?.cardChoices ?? []).slice(),
        taken: action.defId,
      });
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'RewardCard',
        offered: (currentState.reward?.cardChoices ?? []).slice(),
        chosen: action.defId,
      });
    }
    if (action.type === 'Reward_Skip') {
      pendingCardEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        offered: (currentState.reward?.cardChoices ?? []).slice(),
        taken: null,
      });
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'RewardCard',
        offered: (currentState.reward?.cardChoices ?? []).slice(),
        chosen: null,
      });
    }
    if (action.type === 'Reward_PickRelic') {
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'RewardRelic',
        offered: (currentState.reward?.relicChoices ?? []).slice(),
        relicId: action.relicId,
      });
    }

    if (['Rest_Heal', 'Rest_Repair', 'Rest_Stabilise'].includes(action.type)) {
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'Rest',
        choice: action.type,
      });
    }

    if (action.type === 'Shop_BuyOffer') {
      const offer = currentState.shop?.offers?.[action.index];
      if (offer) {
        pendingFloorEventsRef.current.push({
          act: currentState.run?.act,
          floor: currentState.run?.floor,
          type: 'Shop',
          purchased: {
            kind: offer.kind,
            defId: offer.defId ?? offer.serviceId ?? offer.relicId,
            price: offer.price,
          },
        });
      }
    }
    if (action.type === 'Event_Choose') {
      const choiceDef = EVENT_REG_UI.events[currentState.event?.eventId]?.choices?.find(choice => choice.id === action.choiceId);
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'Event',
        eventId: currentState.event?.eventId ?? null,
        choiceId: action.choiceId,
        choiceLabel: choiceDef?.label ?? null,
      });
    }
    if (action.type === 'Minigame_Complete') {
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'Minigame',
        eventId: action.eventId,
        tier: action.tier,
        title: MINIGAME_REGISTRY[action.eventId]?.title ?? null,
        gameType: MINIGAME_REGISTRY[action.eventId]?.type ?? null,
      });
    }
    if (action.type === 'SelectDeckCard') {
      const instance = currentState.deck?.cardInstances?.[action.instanceId];
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'DeckTarget',
        source: currentState.shop?.pendingService ? 'Shop' : (currentState.event?.pendingSelectOp ? 'Event' : 'DeckView'),
        operation: currentState.shop?.pendingService ?? currentState.event?.pendingSelectOp ?? null,
        instanceId: action.instanceId,
        defId: instance?.defId ?? null,
      });
    }
    if (action.type === 'SelectNextNode') {
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'MapChoice',
        nodeId: action.nodeId,
        nodeType: currentState.map?.nodes?.[action.nodeId]?.type ?? null,
      });
    }

      setState(prev => {
        try {
          return dispatchWithJournal(prev, currentData, action);
        } catch (e) {
          console.error('[AI] action failed', action, e);
          return prev;
        }
      });
      scheduleAiTick();
    };
  }, [
    aiPlaystyle,
    aiSpeed,
    aiStopAfterCombat,
    aiStopAtAct,
    archiveInProgressRun,
    customConfig,
    debugSeedInput,
    lockedFields,
    randomizeDebugSeed,
    resetAiStallTracker,
    scheduleAiTick,
    seedMode,
    stopAiForTakeover,
  ]);

  useEffect(() => {
    clearAiTimer();
    if (aiEnabled && !aiPaused && data && state) {
      scheduleAiTick(aiSpeed);
    }
    return clearAiTimer;
  }, [aiEnabled, aiPaused, aiSpeed, data, state ? 1 : 0, clearAiTimer, scheduleAiTick]);

  useEffect(() => {
    if (!aiEnabled || aiPaused) {
      setAiWatchdog(AI_WATCHDOG_IDLE);
      return undefined;
    }
    const syncWatchdog = () => {
      const stallState = aiStallRef.current;
      const stagnantMs = stallState.signature
        ? Math.max(0, Date.now() - (stallState.lastChangedAt || Date.now()))
        : 0;
      setAiWatchdog((prev) => {
        const next = {
          active: Boolean(stallState.signature),
          stagnantMs,
          exportTriggered: stallState.exportTriggered,
          recoveryTriggered: stallState.recoveryTriggered,
          lastChangedAt: stallState.lastChangedAt || 0,
        };
        const prevSeconds = Math.floor((prev.stagnantMs || 0) / 1000);
        const nextSeconds = Math.floor((next.stagnantMs || 0) / 1000);
        if (
          prev.active === next.active
          && prev.exportTriggered === next.exportTriggered
          && prev.recoveryTriggered === next.recoveryTriggered
          && prev.lastChangedAt === next.lastChangedAt
          && prevSeconds === nextSeconds
        ) {
          return prev;
        }
        return next;
      });
    };
    syncWatchdog();
    const intervalId = setInterval(syncWatchdog, 1000);
    return () => clearInterval(intervalId);
  }, [aiEnabled, aiPaused]);

  // ── Auto-export every 5 completed runs ────────────────────────────────────
  useEffect(() => {
    if (runHistory.length === 0 || runHistory.length % 5 !== 0) return;
    const batchEnd   = runHistory.length;
    const batchStart = batchEnd - 4;
    const batch      = runHistory.slice(batchStart - 1); // last 5 runs
    const pad        = n => String(n).padStart(3, '0');
    const psLabel    = (AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle).replace(/\s+/g, '_');
    const exportProfile = getAiExportProfileLabel(aiExportOptions);
    const uid        = Math.random().toString(36).slice(2, 7);
    const filename   = `ai_runs_${psLabel}_${exportProfile}_${pad(batchStart)}-${pad(batchEnd)}_${Date.now()}_${uid}.json`;
    const exportBatch = batch.map((run) => filterRunRecordForExport(run, aiExportOptions));
    const jsonStr    = JSON.stringify(exportBatch, null, 2);
    writeToSaveDir(filename, jsonStr).then(ok => {
      if (!ok) fallbackDownload(filename, jsonStr);
    });
  }, [runHistory, aiPlaystyle, aiExportOptions]);

  const buildInProgressSnapshot = useCallback(() => {
    if (!state?.run) return null;
    const liveEncounter = combatStatsRef.current
      ? finalizeEncounterForExport(
          combatStatsRef.current,
          state,
          state.mode,
          state.mode === 'Combat'
            ? 'in_progress'
            : (state.mode === 'Reward'
                ? 'win'
                : (state.mode === 'GameOver' ? 'loss' : combatStatsRef.current.result)),
        )
      : null;
    const snapshotOutcome = state.mode === 'GameOver'
      ? (state.run?.victory ? 'victory' : 'defeat')
      : 'in_progress';
    return buildRunRecord({
      runIndex: runIndexRef.current + 1,
      state,
      data,
      seedMode,
      aiPlaystyle,
      encounters: liveEncounter
        ? [...pendingEncountersRef.current, liveEncounter]
        : pendingEncountersRef.current,
      deckSnapshots: deckSnapshotsRef.current,
      cardEvents: pendingCardEventsRef.current,
      floorEvents: pendingFloorEventsRef.current,
      outcome: snapshotOutcome,
    });
  }, [aiPlaystyle, data, seedMode, state]);

  const exportCurrentGameData = useCallback(async function exportCurrentGameData() {
    const snapshot = buildInProgressSnapshot();
    if (!snapshot) return false;

    const psLabel = (AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle).replace(/\s+/g, '_');
    const exportProfile = getAiExportProfileLabel(aiExportOptions);
    const uid = Math.random().toString(36).slice(2, 7);
    const act = snapshot.finalAct ?? state?.run?.act ?? 'x';
    const floor = snapshot.finalFloor ?? state?.run?.floor ?? 'x';
    const modeLabel = (state?.mode ?? 'current').replace(/\s+/g, '_');
    const filename = `ai_run_current_${psLabel}_${exportProfile}_a${act}_f${floor}_${modeLabel}_${Date.now()}_${uid}.json`;
    const filteredSnapshot = filterRunRecordForExport(snapshot, aiExportOptions);
    const jsonStr = JSON.stringify([filteredSnapshot], null, 2);
    const ok = await writeToSaveDir(filename, jsonStr);
    if (!ok) fallbackDownload(filename, jsonStr);
    return true;
  }, [aiExportOptions, aiPlaystyle, buildInProgressSnapshot, state]);

  const exportRunData = useCallback(async function exportRunData() {
    // Include current in-progress run if one exists
    const inProgressSnap = buildInProgressSnapshot();
    const allRuns = inProgressSnap
      ? [...runHistory, inProgressSnap]
      : runHistory;
    const pad      = n => String(n).padStart(3, '0');
    const total    = allRuns.length;
    const psLabel  = (AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle).replace(/\s+/g, '_');
    const exportProfile = getAiExportProfileLabel(aiExportOptions);
    const uid      = Math.random().toString(36).slice(2, 7);
    const filename = total > 0
      ? `ai_runs_${psLabel}_${exportProfile}_${pad(1)}-${pad(total)}_${Date.now()}_${uid}.json`
      : `ai_runs_${psLabel}_${exportProfile}_empty_${Date.now()}_${uid}.json`;

    const exportRuns = allRuns.map((run) => filterRunRecordForExport(run, aiExportOptions));
    const jsonStr  = JSON.stringify(exportRuns, null, 2);
    const ok = await writeToSaveDir(filename, jsonStr);
    if (!ok) fallbackDownload(filename, jsonStr);
  }, [aiExportOptions, aiPlaystyle, buildInProgressSnapshot, runHistory]);

  // Keep window.exportGameData fresh so close-ai-grid.ps1 can trigger it via CDP
  useEffect(() => { window.exportGameData = exportRunData; }, [exportRunData]);
  useEffect(() => { window.exportCurrentGameData = exportCurrentGameData; }, [exportCurrentGameData]);
  useEffect(() => { exportCurrentGameDataRef.current = exportCurrentGameData; }, [exportCurrentGameData]);

  const toggleAiEnabled = useCallback(() => {
    const next = !aiEnabledRef.current;
    clearAiTimer();
    aiEnabledRef.current = next;
    aiPausedRef.current = false;
    setAiEnabled(next);
    setAiPaused(false);
    resetAiStallTracker(next ? getAiStateSignature(stateRef.current) : null);
    if (next) {
      setAiHandoffReason('');
    }
  }, [clearAiTimer, resetAiStallTracker]);

  const toggleAiPause = useCallback(() => {
    const next = !aiPausedRef.current;
    clearAiTimer();
    aiPausedRef.current = next;
    setAiPaused(next);
    if (next) resetAiStallTracker(null);
    else resetAiStallTracker(getAiStateSignature(stateRef.current));
    if (!next) {
      setAiHandoffReason('');
    }
  }, [clearAiTimer, resetAiStallTracker]);

  const takeOverNow = useCallback(() => {
    stopAiForTakeover('Manual takeover engaged.');
  }, [stopAiForTakeover]);

  const openPauseMenu = useCallback(() => {
    clearAiTimer();
    if (aiEnabledRef.current && !aiPausedRef.current) {
      aiPausedRef.current = true;
      setAiPaused(true);
      resetAiStallTracker(null);
      setAiHandoffReason('Paused from menu');
    }
    setShowPauseMenu(true);
  }, [clearAiTimer, resetAiStallTracker]);

  const closePauseMenu = useCallback(() => {
    setShowPauseMenu(false);
  }, []);

  function startNewRun(overrideDebugSeed) {
    const newState = createRunStateFromSettings({ overrideDebugSeed });
    if (!newState) return;
    setAiHandoffReason('');
    setAiPaused(false);
    aiPausedRef.current = false;
    clearNodeAutosave();
    resetRunTransientState();
    resetAiStallTracker(getAiStateSignature(newState));
    setState(newState);
  }
  useEffect(() => { startNewRunRef.current = startNewRun; }, [startNewRun]);

  const handleAction = (action) => {
    if (action.type === 'Dev_AddHP') {
      setState(prev => {
        if (!prev?.run) return prev;
        const hp = Math.min(prev.run.hp + (action.amount || 0), prev.run.maxHP);
        return { ...prev, run: { ...prev.run, hp } };
      });
      return;
    }
    if (action.type === 'Dev_AddGold') {
      setState(prev => {
        if (!prev?.run) return prev;
        const gold = (prev.run.gold || 0) + (action.amount || 0);
        return { ...prev, run: { ...prev.run, gold } };
      });
      return;
    }
    if (action.type === 'Dev_AddRAM') {
      setState(prev => {
        if (!prev?.combat?.player) return prev;
        const current = (prev.combat.player.ram || 0) + (action.amount || 0);
        const max = (prev.combat.player.maxRAM || 0) + (action.amount || 0);
        return {
          ...prev,
          combat: {
            ...prev.combat,
            player: { ...prev.combat.player, ram: current, maxRAM: max }
          }
        };
      });
      return;
    }
    setState(prev => {
      try {
        return dispatchWithJournal(prev, data, action);
      } catch (err) {
        console.error('Action failed:', action, err);
        return prev;
      }
    });
  };

  // Error state
  if (error) {
    return (
      <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, fontSize: '20px', marginBottom: '16px', color: C.red }}>ERROR</div>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginBottom: '24px', color: C.textDim, fontSize: 13 }}>{error}</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              paddingLeft: '24px',
              paddingRight: '24px',
              paddingTop: '12px',
              paddingBottom: '12px',
              borderRadius: '12px',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              fontWeight: 700,
              transition: 'all 0.15s ease',
              backgroundColor: C.red,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </ScreenShell>
    );
  }

  // Loading state
  if (!data || !state) {
    return <LoadingScreen />;
  }

  let content;
  switch (state.mode) {
    case 'Combat':
      content = <CombatScreen state={state} data={data} onAction={handleAction} aiPaused={aiPaused} onOpenMenu={openPauseMenu} />;
      break;
    case 'Map':
      content = <MapScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Reward':
      content = <RewardScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Shop':
      content = <ShopScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Event':
      content = <EventScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'GameOver':
      content = <GameOverScreen state={state} onNewRun={hardReloadIntoFreshRun} />;
      break;
    default:
      content = (
        <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: C.text }}>Unknown mode: {state.mode}</div>
        </ScreenShell>
      );
  }

  const aiPanel = (
    <AIDebugPanel
      embedded={true}
      enabled={aiEnabled}              onToggle={toggleAiEnabled}
      paused={aiPaused}                onTogglePause={toggleAiPause}
      stopAtAct={aiStopAtAct}          onStopAtActChange={setAiStopAtAct}
      stopAfterCombat={aiStopAfterCombat} onStopAfterCombatChange={setAiStopAfterCombat}
      onTakeOverNow={takeOverNow}
      speed={aiSpeed}                  onSpeedChange={setAiSpeed}
      runHistory={runHistory}          onExport={exportRunData}
      onExportCurrent={exportCurrentGameData}
      currentState={state}
      handoffReason={aiHandoffReason}
      aiWatchdog={{ ...aiWatchdog, exportMs: AI_STALL_EXPORT_MS, recoveryMs: AI_STALL_RECOVER_MS }}
      debugSeed={debugSeedInput}       onDebugSeedChange={setDebugSeedInput}
      seedMode={seedMode}              onSeedModeChange={setSeedMode}
      randomize={randomizeDebugSeed}   onRandomizeToggle={setRandomizeDebugSeed}
      onRandomizeSeed={() => { setSeedMode('wild');     setDebugSeedInput(String(randomDebugSeed())); }}
      onRandomizeSensibleSeed={() => { setSeedMode('sensible'); setDebugSeedInput(String(randomDebugSeed())); }}
      aiPlaystyle={aiPlaystyle}        onPlaystyleChange={setAiPlaystyle}
      saveDirName={saveDirName}        onSetSaveDir={pickSaveDir}
      exportOptions={aiExportOptions}
      onSetExportOption={(key, value) => setAiExportOptions(prev => normalizeAiExportOptions({ ...prev, [key]: value }))}
      onSetAllExportOptions={(value) => setAiExportOptions(
        normalizeAiExportOptions(Object.fromEntries(
          Object.keys(AI_EXPORT_OPTIONS_DEFAULTS).map((key) => [key, value]),
        )),
      )}
      customConfig={customConfig}      lockedFields={lockedFields}
      onSetCustomField={(key, val) => setCustomConfig(prev => ({ ...prev, [key]: val }))}
      onToggleLock={(key) => setLockedFields(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      })}
      onClearCustomConfig={() => setCustomConfig(CUSTOM_CONFIG_DEFAULTS)}
      gameData={data}
    />
  );

  return (
    <>
      {content}
      {state.mode !== 'Combat' && (
        <PauseMenuButton open={showPauseMenu} onClick={() => (showPauseMenu ? closePauseMenu() : openPauseMenu())} />
      )}
      <PauseMenuOverlay
        open={showPauseMenu}
        onClose={closePauseMenu}
        soundMuted={soundMuted}
        onToggleMute={toggleMute}
        onReloadApp={reloadApp}
        onAbandonRun={abandonRun}
        hasActiveRun={Boolean(state?.run) && state?.mode !== 'GameOver'}
        state={state}
        showLog={showLog}
        onDevAction={handleAction}
        onToggleLog={() => setShowLog(prev => !prev)}
        aiPanel={aiPanel}
      />
      {/* Deck picker overlay — appears on top of any screen when card selection is needed */}
      {state?.deckView && (
        <DeckPickerOverlay state={state} data={data} onAction={handleAction} />
      )}
      {state.run && showLog && <LogOverlay log={state.log} />}
    </>
  );
}

export default App;
