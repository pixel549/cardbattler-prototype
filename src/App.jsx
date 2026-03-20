import React, { Suspense, lazy, startTransition, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { loadGameData } from './data/loadData.js';
import { C, UI_MONO } from './app/uiTheme.js';
import {
  createInitialState,
  getServiceTargetPreview,
} from './game/game_core.js';
import { dispatchWithJournal } from './game/dispatch_with_journal.js';
import MainMenuHub from './components/MainMenuHub.jsx';
import RuntimeArt from './components/RuntimeArt.jsx';
import {
  CombatRecoveryScreen,
  LoadingScreen,
  RunHeader,
  ScreenShell,
  TutorialCompleteScreen,
} from './components/AppShellScreens.jsx';
import {
  CardChoiceTile,
  MENU_CARD_MAX_W,
  getCardLifecycleDisplay,
  getCardUseCounterLimit,
  getSecondaryActionButtonStyle,
} from './components/AppScenePrimitives.jsx';
import {
  EventScreen,
  GameOverScreen,
  RewardScreen,
  ShopScreen,
} from './components/AppModeScreens.jsx';
import { MinigameScreen } from './components/AppMinigameScreens.jsx';
import { decodeDebugSeed, decodeSensibleDebugSeed, randomDebugSeed } from './game/debugSeed.js';
import { createBasicEventRegistry } from './game/events.js';
import { MINIGAME_REGISTRY, isMinigameEvent } from './game/minigames.js';
import { getRunMods } from './game/rules_mods.js';
import { sfx } from './game/sounds.js';
import { getEventImage } from './data/eventImages.js';
import { getCardImage } from './data/cardImages.js';
import { getEnemyImage } from './data/enemyImages.js';
import {
  areRuntimeArtUrlsSettled,
  getPendingRuntimeArtUrls,
  preloadRuntimeArtUrls,
} from './data/runtimeArtPreload.js';
import { getRuntimeArtPreviewUrls } from './data/runtimeArtCatalog.js';
import useDialogAccessibility from './hooks/useDialogAccessibility.js';
import {
  buildPlaytestUrl,
  readPlaytestModeEnabled,
  writePlaytestModeEnabled,
} from './playtest/config.js';
import {
  TUTORIAL_COMPLETED_STORAGE_KEY,
  acknowledgeTutorialStep,
  parseCompletedTutorialIds,
  serializeCompletedTutorialIds,
  createTutorialRunState,
  getTutorialCatalog,
  getTutorialDefinition,
  getTutorialStep,
  getTutorialMenuState,
  canUseTutorialAction,
  advanceTutorialState,
} from './game/tutorial.js';
import {
  createVisualSceneState,
  getVisualSceneMenuState,
} from './playtest/visualScenes.js';
import {
  STARTER_PROFILES,
  DIFFICULTY_PROFILES,
  CHALLENGE_MODES,
  RUN_BASELINE,
  getUnlockedStarterProfiles,
  getUnlockedDifficulties,
  getUnlockedChallenges,
  composeRunConfig,
} from './game/runProfiles.js';
import {
  readMetaProgress,
  writeMetaProgress,
  applyRunResultToMetaProgress,
} from './game/metaProgression.js';
import {
  getAchievementCatalog,
  getUnlockedAchievementRewardState,
  getCallsignCatalog,
  getCallsignTheme,
  getDefaultCallsignId,
} from './game/achievements.js';
import {
  getDailyRunConfig,
  scoreRunForDaily,
} from './game/dailyRun.js';
import {
  getBossArchiveEntries,
  getProjectedBossEncounter,
  summarizeBossEncounter,
} from './game/bossIntel.js';
import {
  AI_PLAYSTYLES,
  getAiPlaystyleLabel,
  getAiPlaystyleSlug,
} from './game/aiPlaystyles.js';
import {
  buildRunAnalyticsDashboard,
  ingestRunRecordAnalytics,
  recordTutorialAnalyticsEvent,
  readRunAnalytics,
  writeRunAnalytics,
} from './game/runTelemetry.js';
import {
  DEBUG_SAVE_SLOT_IDS,
  buildDebugSavePayload,
  buildNodeAutosaveToken,
  clearNodeAutosave,
  consumeForcedNewRun,
  getSnapshotContentFingerprint,
  queueForcedNewRun,
  readDebugSaveSlots,
  readNodeAutosave,
  restorePersistedSnapshot,
  sanitizeRestoredState,
  writeDebugSaveSlots,
  writeNodeAutosave,
} from './app/persistence.js';
import { deriveCauseOfDeath } from './app/deathAnalysis.js';

const CombatScreen = lazy(() => import('./components/CombatScreen.jsx'));
const AIDebugPanel = lazy(() => import('./components/AIDebugPanel.jsx'));

let aiPlayerModulePromise = null;

function loadAiPlayerModule() {
  if (!aiPlayerModulePromise) {
    aiPlayerModulePromise = import('./game/aiPlayer.js');
  }
  return aiPlayerModulePromise;
}

// Module-level event registry (created once)
const EVENT_REG_UI = createBasicEventRegistry();

// ============================================================
// SHARED CONSTANTS
// ============================================================
const NODE_COLORS = {
  Combat: C.orange,
  Elite: C.red,
  Boss: C.purple,
  Shop: C.yellow,
  Rest: C.green,
  Compile: C.orange,
  Event: C.cyan,
  Start: C.textMuted,
};

const NODE_ICONS = {
  Combat: '\u2694',
  Elite: '\u2620',
  Boss: '\uD83D\uDC51',
  Shop: '\uD83D\uDED2',
  Rest: '\u2665',
  Compile: '\u2699',
  Event: '?',
  Start: '\u25CF',
};

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
const STARTER_PROFILE_STORAGE_KEY = 'cb_selected_starter_profile_v1';
const DIFFICULTY_STORAGE_KEY = 'cb_selected_difficulty_v1';
const CHALLENGES_STORAGE_KEY = 'cb_selected_challenges_v1';
const CALLSIGN_STORAGE_KEY = 'cb_selected_callsign_v1';
const AI_STALL_EXPORT_MS = 15000;
const AI_STALL_RECOVER_MS = 28000;
const TUTORIAL_CATALOG = getTutorialCatalog();
const AI_WATCHDOG_IDLE = {
  active: false,
  stagnantMs: 0,
  exportTriggered: false,
  recoveryTriggered: false,
  lastChangedAt: 0,
};

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

function readStoredString(key, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function readStoredArray(key) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function compactStatusesForExport(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  return statuses
    .filter(Boolean)
    .map((status) => ({
      id: status.id ?? null,
      stacks: Number.isFinite(Number(status.stacks)) ? Number(status.stacks) : null,
    }));
}

function compactCombatantForExport(entity) {
  if (!entity || typeof entity !== 'object') return null;
  return {
    id: entity.id ?? null,
    enemyDefId: entity.enemyDefId ?? null,
    name: entity.name ?? null,
    hp: Number.isFinite(Number(entity.hp)) ? Number(entity.hp) : null,
    maxHP: Number.isFinite(Number(entity.maxHP)) ? Number(entity.maxHP) : null,
    firewall: Number.isFinite(Number(entity.firewall)) ? Number(entity.firewall) : null,
    protection: Number.isFinite(Number(entity.protection)) ? Number(entity.protection) : null,
    statuses: compactStatusesForExport(entity.statuses),
    intentType: entity.intentType ?? null,
    intentAmount: Number.isFinite(Number(entity.intentAmount)) ? Number(entity.intentAmount) : null,
    intentCardDefId: entity.intentCardDefId ?? null,
  };
}

function compactEffectSummaryForExport(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const compact = {
    type: summary.type ?? null,
    primaryRole: summary.primaryRole ?? null,
  };
  const numericKeys = [
    'damage',
    'defense',
    'heal',
    'buff',
    'debuff',
    'draw',
    'gainRAM',
    'loseRAM',
    'firewallGain',
    'firewallBreach',
  ];
  for (const key of numericKeys) {
    const value = Number(summary[key]);
    if (Number.isFinite(value) && value !== 0) compact[key] = value;
  }
  if (summary.firewallBreachAll) compact.firewallBreachAll = true;
  if (summary.firewallSpend) compact.firewallSpend = true;
  if (summary.targetsAllEnemies) compact.targetsAllEnemies = true;
  if (summary.xCost) compact.xCost = true;
  if (Array.isArray(summary.roles) && summary.roles.length > 0) {
    compact.roles = summary.roles.slice();
  }
  return compact;
}

function compactCardRefForExport(card) {
  if (!card || typeof card !== 'object') return null;
  return {
    instanceId: card.instanceId ?? null,
    defId: card.defId ?? null,
    name: card.name ?? null,
    type: card.type ?? null,
    cost: Number.isFinite(Number(card.cost)) ? Number(card.cost) : null,
    affordable: typeof card.affordable === 'boolean' ? card.affordable : null,
    effectSummary: compactEffectSummaryForExport(card.effectSummary),
  };
}

function compactCardPreviewListForExport(cards, limit = 5) {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  const compacted = cards
    .slice(0, limit)
    .map(compactCardRefForExport)
    .filter(Boolean);
  if (cards.length > limit) {
    compacted.push({
      omittedCount: cards.length - limit,
    });
  }
  return compacted;
}

function compactMutationTriggerChecksForExport(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map((entry) => ({
    seq: entry.seq ?? null,
    turn: entry.turn ?? null,
    instanceId: entry.instanceId ?? null,
    defId: entry.defId ?? null,
    name: entry.name ?? null,
    useCounter: Number.isFinite(Number(entry.useCounter)) ? Number(entry.useCounter) : null,
    finalMutationCountdown: Number.isFinite(Number(entry.finalMutationCountdown)) ? Number(entry.finalMutationCountdown) : null,
    appliedMutationCount: Number.isFinite(Number(entry.appliedMutationCount)) ? Number(entry.appliedMutationCount) : null,
    triggerChance: Number.isFinite(Number(entry.triggerChance)) ? Number(entry.triggerChance) : null,
    roll: Number.isFinite(Number(entry.roll)) ? Number(entry.roll) : null,
    guaranteed: Boolean(entry.guaranteed),
    forcedTier: entry.forcedTier ?? null,
    rolledTier: entry.rolledTier ?? null,
    appliedTier: entry.appliedTier ?? null,
    mutationId: entry.mutationId ?? null,
    outcome: entry.outcome ?? null,
    triggered: Boolean(entry.triggered),
    thresholdReached: Boolean(entry.thresholdReached),
    timingMode: entry.timingMode ?? null,
    effectiveMutationStep: Number.isFinite(Number(entry.effectiveMutationStep)) ? Number(entry.effectiveMutationStep) : null,
    effectiveFinalCountdownStep: Number.isFinite(Number(entry.effectiveFinalCountdownStep)) ? Number(entry.effectiveFinalCountdownStep) : null,
  }));
}

function compactCardPlayTimelineForExport(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map((entry) => ({
    seq: entry.seq ?? null,
    turn: entry.turn ?? null,
    cardInstanceId: entry.cardInstanceId ?? null,
    defId: entry.defId ?? null,
    name: entry.name ?? null,
    cost: Number.isFinite(Number(entry.cost)) ? Number(entry.cost) : null,
    ramBefore: Number.isFinite(Number(entry.ramBefore)) ? Number(entry.ramBefore) : null,
    ramAfter: Number.isFinite(Number(entry.ramAfter)) ? Number(entry.ramAfter) : null,
    heatAfter: Number.isFinite(Number(entry.heatAfter)) ? Number(entry.heatAfter) : null,
    targetEnemyId: entry.targetEnemyId ?? null,
    targetSelf: Boolean(entry.targetSelf),
    playerBefore: compactCombatantForExport(entry.playerBefore),
    targetBefore: compactCombatantForExport(entry.targetBefore),
    handSizeBefore: Array.isArray(entry.handBefore) ? entry.handBefore.length : null,
    handBefore: compactCardPreviewListForExport(entry.handBefore),
    effectSummary: compactEffectSummaryForExport(entry.effectSummary),
    availableRoleCounts: entry.availableRoleCounts ? { ...entry.availableRoleCounts } : null,
    tacticalFlags: entry.tacticalFlags ? { ...entry.tacticalFlags } : null,
  }));
}

function compactEnemyPlayTimelineForExport(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map((entry) => ({
    seq: entry.seq ?? null,
    turn: entry.turn ?? null,
    enemyId: entry.enemyId ?? null,
    enemyName: entry.enemyName ?? null,
    defId: entry.defId ?? null,
    name: entry.name ?? null,
    intentType: entry.intentType ?? null,
    effectSummary: compactEffectSummaryForExport(entry.effectSummary),
    playerBefore: compactCombatantForExport(entry.playerBefore),
    enemyBefore: compactCombatantForExport(entry.enemyBefore),
    playerRamBefore: Number.isFinite(Number(entry.playerRamBefore)) ? Number(entry.playerRamBefore) : null,
    playerMaxRamBefore: Number.isFinite(Number(entry.playerMaxRamBefore)) ? Number(entry.playerMaxRamBefore) : null,
    heatBefore: Number.isFinite(Number(entry.heatBefore)) ? Number(entry.heatBefore) : null,
    maxHeatBefore: Number.isFinite(Number(entry.maxHeatBefore)) ? Number(entry.maxHeatBefore) : null,
  }));
}

function compactHandTimelineForExport(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map((entry) => ({
    seq: entry.seq ?? null,
    reason: entry.reason ?? null,
    turn: entry.turn ?? null,
    ram: Number.isFinite(Number(entry.ram)) ? Number(entry.ram) : null,
    handSize: Number.isFinite(Number(entry.handSize)) ? Number(entry.handSize) : null,
    drawCount: Number.isFinite(Number(entry.drawCount)) ? Number(entry.drawCount) : null,
    discardCount: Number.isFinite(Number(entry.discardCount)) ? Number(entry.discardCount) : null,
    exhaustCount: Number.isFinite(Number(entry.exhaustCount)) ? Number(entry.exhaustCount) : null,
    powerCount: Number.isFinite(Number(entry.powerCount)) ? Number(entry.powerCount) : null,
    source: entry.source ?? null,
    requested: Number.isFinite(Number(entry.requested)) ? Number(entry.requested) : null,
    drawnCount: Number.isFinite(Number(entry.drawnCount)) ? Number(entry.drawnCount) : null,
    reshuffled: Boolean(entry.reshuffled),
    hand: compactCardPreviewListForExport(entry.hand),
    drawn: compactCardPreviewListForExport(entry.drawn),
  }));
}

function filterEncounterForExport(encounter, options) {
  const out = { ...encounter };
  if (!options.cards) {
    out.cardPlayTimeline = [];
    out.enemyPlayTimeline = [];
    delete out.tacticalSummary;
  } else {
    out.cardPlayTimeline = compactCardPlayTimelineForExport(out.cardPlayTimeline);
    out.enemyPlayTimeline = compactEnemyPlayTimelineForExport(out.enemyPlayTimeline);
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
  } else {
    out.mutationTriggerChecks = compactMutationTriggerChecksForExport(out.mutationTriggerChecks);
  }
  if (!options.hands) {
    out.handTimeline = [];
  } else {
    out.handTimeline = compactHandTimelineForExport(out.handTimeline);
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

function getPrimaryActionButtonStyle(accent = C.cyan, overrides = {}) {
  return {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    fontFamily: UI_MONO,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    transition: 'all 0.15s ease',
    background: `linear-gradient(135deg, ${accent} 0%, ${accent}d0 100%)`,
    border: `1px solid ${accent}00`,
    boxShadow: `0 16px 30px ${accent}22`,
    color: '#041015',
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
    aiPlaystyleLabel: getAiPlaystyleLabel(aiPlaystyle),
    starterProfileId: state.run?.starterProfileId || 'kernel',
    starterProfileName: state.run?.starterProfileName || STARTER_PROFILES[state.run?.starterProfileId || 'kernel']?.name || 'Kernel Runner',
    difficultyId: state.run?.difficultyId || 'standard',
    difficultyName: DIFFICULTY_PROFILES[state.run?.difficultyId || 'standard']?.name || 'Standard',
    challengeIds: Array.isArray(state.run?.challengeIds) ? [...state.run.challengeIds] : [],
    runMode: state.run?.runMode || 'standard',
    dailyRunId: state.run?.dailyRunId || null,
    dailyRunLabel: state.run?.dailyRunLabel || null,
    debugOverrides: buildExportDebugOverrides(runDbg),
    relicIds:       finalRelicIds,
    relicNames:     finalRelicIds.map((rid) => data?.relics?.[rid]?.name || rid),
    runRuleMods,
    forcedMutationTier: state.run?.forcedMutationTier ?? null,
    seenMutationIds:    [...(state.run?.seenMutationIds || [])],
    runTelemetry: { ...(state.run?.telemetry || {}) },
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


class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error) ?? null;
    }
    return this.props.children;
  }
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
  'Scroll or tap the hand until the card you want is centered, then double tap an enemy to use it. If the card can affect you, double tap your FW / HP / RAM panel instead.',
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

function InlineLoadingPanel({ title = 'Loading', detail = 'Pulling the next module into memory.' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: UI_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: C.cyan }}>
        {title}
      </div>
      <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textMuted }}>
        {detail}
      </div>
    </div>
  );
}

function PauseMenuOverlay({
  open,
  onClose,
  soundMuted,
  onToggleMute,
  updateReady = false,
  onApplyDownloadedUpdate,
  onReloadApp,
  onForceRefreshApp,
  onReturnToLaunchMenu,
  onAbandonRun,
  onSaveDebugSlot,
  onLoadDebugSlot,
  onDeleteDebugSlot,
  debugSaveSlots = {},
  hasActiveRun = false,
  state,
  showLog,
  onDevAction,
  onToggleLog,
  aiPanelProps = null,
  playtestMode = false,
  onTogglePlaytestMode,
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

  const renderSaveSlotButton = (slotId, label) => {
    const slot = debugSaveSlots?.[slotId] || null;
    return (
      <div
        key={slotId}
        style={{
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          background: 'rgba(255,255,255,0.025)',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.12em', color: C.cyan }}>
            {label}
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, color: C.textMuted }}>
            {slot ? new Date(slot.savedAt).toLocaleString() : 'Empty'}
          </div>
        </div>
        <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.5, color: slot ? C.text : C.textMuted }}>
          {slot?.label || 'No save stored yet.'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hasActiveRun && (
            <button
              onClick={() => onSaveDebugSlot?.(slotId)}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: `1px solid ${C.cyan}44`,
                background: `${C.cyan}12`,
                color: C.cyan,
                fontFamily: UI_MONO,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          )}
          <button
            onClick={() => onLoadDebugSlot?.(slotId)}
            disabled={!slot}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: `1px solid ${slot ? C.yellow + '44' : C.border}`,
              background: slot ? `${C.yellow}12` : 'rgba(255,255,255,0.02)',
              color: slot ? C.yellow : C.textMuted,
              fontFamily: UI_MONO,
              fontSize: 11,
              fontWeight: 700,
              cursor: slot ? 'pointer' : 'not-allowed',
            }}
          >
            Load
          </button>
          {slot && (
            <button
              onClick={() => onDeleteDebugSlot?.(slotId)}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: `1px solid ${C.red}44`,
                background: `${C.red}12`,
                color: C.red,
                fontFamily: UI_MONO,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );
  };

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
              {hasActiveRun ? 'PAUSE MENU' : 'SETTINGS'}
            </div>
            <div id="pause-menu-desc" style={{ fontFamily: UI_MONO, fontSize: 12, color: C.textDim }}>
              {hasActiveRun
                ? (state?.mode === 'Combat' ? 'Combat tools, AI controls, and quick help.' : 'Run controls, debug tools, and quick help.')
                : 'App settings, debug tools, and quick help.'}
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
                  onClick={onReturnToLaunchMenu}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: `1px solid ${C.yellow}55`,
                    background: `${C.yellow}14`,
                    color: C.yellow,
                    fontFamily: UI_MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  Return to launch menu
                </button>
              )}
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
              {updateReady && (
                <button
                  onClick={onApplyDownloadedUpdate}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: `1px solid ${C.cyan}55`,
                    background: `${C.cyan}14`,
                    color: C.cyan,
                    fontFamily: UI_MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  Apply downloaded update
                </button>
              )}
              <button
                onClick={onForceRefreshApp}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${C.orange}55`,
                  background: `${C.orange}14`,
                  color: C.orange,
                  fontFamily: UI_MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Force refresh app assets
              </button>
              <button
                onClick={onTogglePlaytestMode}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${playtestMode ? C.cyan + '55' : C.border}`,
                  background: playtestMode ? `${C.cyan}14` : 'rgba(255,255,255,0.03)',
                  color: playtestMode ? C.cyan : C.text,
                  fontFamily: UI_MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {playtestMode ? 'Phone playtest on - tap to disable' : 'Enable phone playtest mode'}
              </button>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.5, color: C.textMuted }}>
                Playtest mode captures real phone sessions from the LAN dev or preview server and stores them in `playtest_sessions/`.
              </div>
              {updateReady && (
                <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.5, color: C.cyan }}>
                  A newer build is already downloaded. Apply it here before using the heavier force refresh option.
                </div>
              )}
              <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.5, color: C.textMuted }}>
                Force refresh clears cached app files and reopens the latest deployed build without touching saves.
              </div>
            </HelpCard>

            <HelpCard title="SAVE SLOTS">
              <div style={{ display: 'grid', gap: 10 }}>
                {DEBUG_SAVE_SLOT_IDS.map((slotId, index) => renderSaveSlotButton(slotId, `Slot ${index + 1}`))}
              </div>
            </HelpCard>

            <HelpCard title="AI AUTO-PLAY">
              {aiPanelProps ? (
                <Suspense fallback={<InlineLoadingPanel title="Loading AI Tools" detail="Bringing the autoplay controls online." />}>
                  <AIDebugPanel {...aiPanelProps} />
                </Suspense>
              ) : (
                <InlineLoadingPanel title="AI Tools Unavailable" detail="No autoplay controls are attached to this build state." />
              )}
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
  Compile:'Deliberate card upgrade',
  Event:  'Unknown encounter',
};

function MapScreen({ state, data, onAction, metaProgress = null }) {
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
  const bossPreviewNodeId = (previewNodeId && nodes[previewNodeId]?.type === 'Boss')
    ? previewNodeId
    : selNext.find((nodeId) => nodes[nodeId]?.type === 'Boss') || null;
  const projectedBossSummary = bossPreviewNodeId
    ? summarizeBossEncounter(data, getProjectedBossEncounter(data, state.run))
    : null;
  const seenBossSet = new Set(metaProgress?.bossEncounterIdsSeen || []);
  const defeatedBossSet = new Set(metaProgress?.bossEncounterIdsDefeated || []);
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
  const bossIntelPanel = bossPreviewNodeId ? (
    <div
      style={{
        width: '100%',
        padding: isWideLayout ? '14px 16px' : '12px 14px',
        borderRadius: 16,
        border: `1px solid ${C.purple}32`,
        background: 'linear-gradient(180deg, rgba(20, 10, 28, 0.92) 0%, rgba(8, 10, 18, 0.98) 100%)',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: C.purple }}>
          ACT BOSS INTEL
        </div>
        {!projectedBossSummary?.debugPool && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: defeatedBossSet.has(projectedBossSummary?.id) ? C.green : seenBossSet.has(projectedBossSummary?.id) ? C.yellow : C.red,
            }}
          >
            {defeatedBossSet.has(projectedBossSummary?.id) ? 'Defeated before' : seenBossSet.has(projectedBossSummary?.id) ? 'Seen before' : 'New threat'}
          </div>
        )}
      </div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: C.text }}>
        {projectedBossSummary?.name || 'Boss prediction unavailable'}
      </div>
      {projectedBossSummary?.debugPool ? (
        <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.55, color: C.textDim }}>
          {projectedBossSummary.notes}
        </div>
      ) : (
        <>
          <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.55, color: C.textDim }}>
            {projectedBossSummary?.enemyCount || 0} enemy{projectedBossSummary?.enemyCount === 1 ? '' : 'ies'} • {projectedBossSummary?.totalHp || '?'} total HP
            {projectedBossSummary?.roleSummary?.length ? ` • ${projectedBossSummary.roleSummary.join(' • ')}` : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(projectedBossSummary?.enemies || []).map((enemy) => (
              <span
                key={enemy.id}
                style={{
                  padding: '5px 8px',
                  borderRadius: 999,
                  border: `1px solid ${C.purple}28`,
                  background: `${C.purple}12`,
                  color: C.purple,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                }}
              >
                {enemy.name} • {enemy.hp} HP
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  ) : null;
  const actionsPanel = (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {bossIntelPanel}
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
      <RunHeader run={state.run} data={data} mode="Map" />

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
// DECK PICKER OVERLAY
// shown when state.deckView is set (shop service / event card op)
// ============================================================

const DECK_OP_LABELS = {
  RemoveCard:            { label: 'REMOVE A CARD',    desc: 'The chosen card will be permanently deleted.', color: '#ff4444' },
  RemoveSelectedCard:    { label: 'REMOVE A CARD',    desc: 'The chosen card will be permanently deleted.', color: '#ff4444' },
  Repair:                { label: 'REPAIR A CARD',    desc: 'Remove the chosen card\'s latest applied mutation.', color: '#00f0ff' },
  RepairSelectedCard:    { label: 'REPAIR A CARD',    desc: 'Remove the chosen card\'s latest applied mutation.', color: '#00f0ff' },
  Stabilise:             { label: 'STABILISE A CARD', desc: 'Extend the chosen card\'s use and final mutation clocks by 10%.', color: '#b44aff' },
  StabiliseSelectedCard: { label: 'STABILISE A CARD', desc: 'Extend the chosen card\'s use and final mutation clocks by 10%.', color: '#b44aff' },
  Accelerate:            { label: 'ACCELERATE A CARD',desc: 'Reduce the chosen card\'s use and final mutation clocks by 10%.', color: '#ff6b00' },
  AccelerateSelectedCard:{ label: 'ACCELERATE A CARD',desc: 'Reduce the chosen card\'s use and final mutation clocks by 10%.', color: '#ff6b00' },
  Forge:                 { label: 'REFORGE A CARD',   desc: 'Spend salvage to repair, compile, and stabilise one card.', color: '#ff6b00' },
  ForgeSelectedCard:     { label: 'REFORGE A CARD',   desc: 'Spend salvage to repair, compile, and stabilise one card.', color: '#ff6b00' },
  Compile:               { label: 'COMPILE A CARD',   desc: 'Reduce its RAM cost and add a permanent typed bonus.', color: '#ff6b00' },
  CompileSelectedCard:   { label: 'COMPILE A CARD',   desc: 'Reduce its RAM cost and add a permanent typed bonus.', color: '#ff6b00' },
};

function DeckPickerOverlay({ state, data, onAction, tutorialStep = null }) {
  const dv = state.deckView;
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const tutorialTileRefs = useRef(new Map());
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

  const tutorialTargetId = getDeckPickerTutorialTargetId(state, tutorialStep);
  const tutorialDeckActive = tutorialStep?.mode === 'DeckView';

  useEffect(() => {
    if (!tutorialTargetId) return;
    const targetNode = tutorialTileRefs.current.get(tutorialTargetId);
    targetNode?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [tutorialTargetId]);

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
  const cardsWithSelectionState = cards.map(({ iid, ci, def }) => ({
    iid,
    ci,
    def,
    selectionInfo: pendingOp ? getServiceTargetPreview(pendingOp, state, data, iid) : { eligible: true, summary: null, reason: null },
  }));
  const eligibleCardCount = pendingOp
    ? cardsWithSelectionState.filter(({ selectionInfo }) => selectionInfo.eligible).length
    : cardsWithSelectionState.length;

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
            {pendingOp ? ` • ${eligibleCardCount} eligible` : ''}
          </div>
          {tutorialDeckActive ? (
            <div style={{ fontFamily: MONO, fontSize: 10, color: opInfo.color, marginTop: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Training target marked in-grid
            </div>
          ) : null}
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
        {cardsWithSelectionState.map(({ iid, ci, def, selectionInfo }) => {
          const highlighted = tutorialTargetId === iid;
          const dimmed = tutorialDeckActive && tutorialTargetId && !highlighted;
          return (
          <div
            key={iid}
            ref={(node) => {
              if (highlighted && node) tutorialTileRefs.current.set(iid, node);
              if (!node) tutorialTileRefs.current.delete(iid);
            }}
            style={{
              width: '100%',
              maxWidth: `${MENU_CARD_MAX_W}px`,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignSelf: 'start',
              padding: highlighted ? '8px' : 0,
              borderRadius: highlighted ? 18 : 0,
              border: highlighted ? `1px solid ${opInfo.color}55` : '1px solid transparent',
              boxShadow: highlighted ? `0 0 0 1px ${opInfo.color}22, 0 0 26px ${opInfo.color}24` : 'none',
              background: highlighted ? `${opInfo.color}08` : 'transparent',
              opacity: dimmed ? 0.58 : 1,
              transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <CardChoiceTile
              cardId={ci.defId}
              card={def}
              instance={ci}
              selected={dv.selectedInstanceId === iid}
              onClick={() => selectionInfo.eligible && onAction({ type: 'SelectDeckCard', instanceId: iid })}
              disabled={pendingOp ? !selectionInfo.eligible : false}
            />
            {pendingOp && (
              <div
                style={{
                  minHeight: 34,
                  fontFamily: MONO,
                  fontSize: 10,
                  lineHeight: 1.45,
                  color: selectionInfo.eligible ? opInfo.color : C.textDim,
                }}
              >
                {selectionInfo.eligible ? selectionInfo.summary : selectionInfo.reason}
              </div>
            )}
            {highlighted ? (
              <div style={{ fontFamily: MONO, fontSize: 10, color: opInfo.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Training target
              </div>
            ) : null}
          </div>
        );
        })}
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
// LOADING SCREEN
// ============================================================
function collectUniqueArtUrls(urls = []) {
  return [...new Set((Array.isArray(urls) ? urls : []).filter((url) => typeof url === 'string' && url.trim()))];
}

function getCardArtUrlsFromInstanceIds(instanceIds = [], cardInstances = {}) {
  const defIds = new Set();
  for (const instanceId of instanceIds) {
    const defId = cardInstances?.[instanceId]?.defId;
    if (defId) defIds.add(defId);
  }
  return collectUniqueArtUrls([...defIds].map((defId) => getCardImage(defId)));
}

function getRunDeckArtUrls(state) {
  const cardDefIds = new Set();

  for (const instanceId of state?.deck?.master || []) {
    const defId = state?.deck?.cardInstances?.[instanceId]?.defId;
    if (defId) cardDefIds.add(defId);
  }

  for (const cardInstance of Object.values(state?.combat?.cardInstances || {})) {
    if (cardInstance?.defId) cardDefIds.add(cardInstance.defId);
  }

  return collectUniqueArtUrls([...cardDefIds].map((defId) => getCardImage(defId)));
}

function getCombatVisibleArtUrls(state) {
  const combatCardInstances = state?.combat?.cardInstances || {};
  const playerPiles = state?.combat?.player?.piles || {};
  const visibleInstanceIds = [
    ...(playerPiles.hand || []),
    ...(playerPiles.power || []),
    ...(playerPiles.draw || []).slice(0, 6),
    ...(playerPiles.discard || []).slice(-4),
    ...(playerPiles.exhaust || []).slice(-2),
  ];
  return getCardArtUrlsFromInstanceIds(visibleInstanceIds, combatCardInstances);
}

function getShopOfferArtUrls(state) {
  return collectUniqueArtUrls(
    (state?.shop?.offers || [])
      .filter((offer) => offer?.kind === 'Card')
      .map((offer) => getCardImage(offer?.defId))
  );
}

function getEventArtUrls(state) {
  const eventId = state?.event?.eventId;
  if (!eventId || isMinigameEvent(eventId)) return [];
  const eventDef = EVENT_REG_UI.events[eventId];
  return collectUniqueArtUrls([eventDef?.image || getEventImage(eventId)]);
}

function buildSceneArtManifest(state) {
  if (!state) return null;

  const seed = state.run?.seed ?? 'seed';
  const act = state.run?.act ?? 'act';
  const floor = state.run?.floor ?? 'floor';

  if (state.deckView) {
    const pendingOp = state.shop?.pendingService ?? state.event?.pendingSelectOp ?? 'deck';
    const urls = getRunDeckArtUrls(state);
    if (!urls.length) return null;
    const blockUrls = getRuntimeArtPreviewUrls(urls);
    return {
      key: `deck:${seed}:${act}:${floor}:${pendingOp}:${(state.deck?.master || []).join(',')}`,
      title: 'SYNCING DECK',
      message: 'Loading deck card art...',
      accent: C.orange,
      urls,
      blockUrls,
    };
  }

  if (state.mode === 'Combat') {
    const enemyIds = (state.combat?.enemies || []).map((enemy) => enemy?.enemyDefId ?? 'enemy');
    const enemyUrls = collectUniqueArtUrls(enemyIds.map((enemyDefId) => getEnemyImage(enemyDefId)));
    const immediateCardUrls = getCombatVisibleArtUrls(state);
    const deckCardUrls = getRunDeckArtUrls(state);
    const backgroundUrls = deckCardUrls.filter((url) => !immediateCardUrls.includes(url));
    const urls = collectUniqueArtUrls([...enemyUrls, ...immediateCardUrls]);
    if (!urls.length) return null;
    const blockUrls = getRuntimeArtPreviewUrls(urls);
    return {
      key: `combat:${seed}:${act}:${floor}:${state.map?.currentNodeId ?? (enemyIds.join(',') || 'node')}`,
      title: 'SYNCING ENCOUNTER',
      message: 'Loading enemy and action card art...',
      accent: C.orange,
      urls,
      blockUrls,
      backgroundUrls,
    };
  }

  if (state.mode === 'Reward') {
    const cardIds = state.reward?.cardChoices || [];
    const urls = collectUniqueArtUrls(cardIds.map((cardId) => getCardImage(cardId)));
    if (!urls.length) return null;
    const blockUrls = getRuntimeArtPreviewUrls(urls);
    return {
      key: `reward:${seed}:${act}:${floor}:${cardIds.join(',')}`,
      title: 'SYNCING REWARDS',
      message: 'Loading reward card art...',
      accent: C.cyan,
      urls,
      blockUrls,
    };
  }

  if (state.mode === 'Shop') {
    const urls = getShopOfferArtUrls(state);
    if (!urls.length) return null;
    const blockUrls = getRuntimeArtPreviewUrls(urls);
    return {
      key: `shop:${seed}:${act}:${floor}:${(state.shop?.offers || []).map((offer) => `${offer.kind}:${offer.defId ?? offer.relicId ?? offer.serviceId ?? '?'}`).join(',')}`,
      title: 'SYNCING MARKET',
      message: 'Loading market card art...',
      accent: C.yellow,
      urls,
      blockUrls,
    };
  }

  if (state.mode === 'Event') {
    const urls = getEventArtUrls(state);
    if (!urls.length) return null;
    const blockUrls = getRuntimeArtPreviewUrls(urls);
    return {
      key: `event:${seed}:${act}:${floor}:${state.event?.eventId ?? 'event'}`,
      title: 'SYNCING NODE',
      message: 'Loading event art...',
      accent: C.cyan,
      urls,
      blockUrls,
    };
  }

  return null;
}

function getTutorialFocusLabel(step, presentationMode = 'Combat') {
  if (!step) return '';
  if (presentationMode === 'MainMenu') {
    if (step.menuView === 'setup') return 'RUN SETUP';
    if (step.menuView === 'daily') return 'DAILY RUN';
    if (step.menuView === 'intel' && step.intelView === 'bosses') return 'BOSS ARCHIVE';
    if (step.menuView === 'intel' && step.intelView === 'callsigns') return 'CALLSIGN ARCHIVE';
    if (step.menuView === 'intel') return 'PROGRESS ARCHIVE';
    return 'ACTIVE MENU PANE';
  }
  if (presentationMode === 'DeckView') return 'DECK PICKER';
  if (presentationMode === 'Event') return 'EVENT CHOICE';
  if (presentationMode === 'Reward') return 'REWARD CHOICES';
  if (presentationMode === 'Combat') {
    if (step.id?.includes('end_turn')) return 'END TURN';
    if (step.id === 'phase_read' || step.id === 'adaptive_intro') return 'ENEMY PANEL';
    return 'CENTER CARD + TARGET';
  }
  return 'ACTIVE PANEL';
}

function getTutorialOverlayLayout(presentationMode = 'Combat') {
  if (presentationMode === 'Event') {
    return {
      justifyContent: 'center',
      left: 12,
      right: 12,
      top: 'min(calc(26% + 44px), calc(100% - 214px))',
      bottom: 'auto',
      width: 'min(420px, 100%)',
      pointerSide: 'top',
    };
  }
  if (presentationMode === 'MainMenu') {
    return {
      justifyContent: 'center',
      left: 12,
      right: 12,
      bottom: 14,
      width: 'min(520px, 100%)',
      pointerSide: 'top',
    };
  }
  if (presentationMode === 'DeckView') {
    return {
      justifyContent: 'center',
      left: 12,
      right: 12,
      bottom: 16,
      width: 'min(520px, 100%)',
      pointerSide: 'top',
    };
  }
  if (presentationMode === 'Reward') {
    return {
      justifyContent: 'center',
      left: 12,
      right: 12,
      bottom: 18,
      width: 'min(560px, 100%)',
      pointerSide: 'top',
    };
  }
  return {
    justifyContent: 'center',
    left: 12,
    right: 12,
    top: 'min(calc(48% + 18px), calc(100% - 228px))',
    bottom: 'auto',
    width: 'min(500px, 100%)',
    pointerSide: 'top',
  };
}

function TutorialOverlay({ step, nudge = '', onAdvance, onExit, presentationMode = 'Combat' }) {
  if (!step) return null;
  const layout = getTutorialOverlayLayout(presentationMode);
  const focusLabel = getTutorialFocusLabel(step, presentationMode);

  return (
    <div
      className="safe-area-bottom"
      style={{
        position: 'fixed',
        left: layout.left,
        right: layout.right,
        top: layout.top,
        bottom: layout.bottom,
        zIndex: 980,
        display: 'flex',
        justifyContent: layout.justifyContent,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: layout.width,
          pointerEvents: 'auto',
          borderRadius: 20,
          border: `1px solid ${C.cyan}38`,
          background: 'linear-gradient(180deg, rgba(6,10,18,0.96) 0%, rgba(5,7,12,0.99) 100%)',
          boxShadow: '0 18px 44px rgba(0,0,0,0.42)',
          padding: '14px 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          position: 'relative',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 16,
            height: 16,
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            background: 'rgba(6,10,18,0.97)',
            borderLeft: `1px solid ${C.cyan}38`,
            borderTop: `1px solid ${C.cyan}38`,
            top: layout.pointerSide === 'top' ? -9 : 'auto',
            bottom: layout.pointerSide === 'bottom' ? -9 : 'auto',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 12, letterSpacing: '0.16em', color: C.cyan }}>
              TUTORIAL
            </div>
            <div
              style={{
                padding: '5px 8px',
                borderRadius: 999,
                border: `1px solid ${C.cyan}28`,
                background: `${C.cyan}10`,
                color: C.cyan,
                fontFamily: UI_MONO,
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Focus: {focusLabel}
            </div>
          </div>
          <button
            onClick={onExit}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.03)',
              color: C.textDim,
              fontFamily: UI_MONO,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Leave tutorial
          </button>
        </div>

        <div style={{ fontFamily: UI_MONO, fontSize: 18, fontWeight: 700, color: C.text }}>
          {step.title}
        </div>
        <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.65, color: C.textDim }}>
          {step.body}
        </div>

        {!!step.concepts?.length && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {step.concepts.map((concept) => (
              <span
                key={concept}
                style={{
                  padding: '6px 9px',
                  borderRadius: 999,
                  border: `1px solid ${C.cyan}26`,
                  background: `${C.cyan}10`,
                  color: C.cyan,
                  fontFamily: UI_MONO,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {concept}
              </span>
            ))}
          </div>
        )}

        {nudge && (
          <div style={{ fontFamily: UI_MONO, fontSize: 11, color: C.orange, lineHeight: 1.5 }}>
            {nudge}
          </div>
        )}

        {step.acknowledgeOnly && (
          <button
            onClick={onAdvance}
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: C.cyan,
              color: '#031014',
              fontFamily: UI_MONO,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {step.ctaLabel || 'Continue'}
          </button>
        )}
      </div>
    </div>
  );
}

function UpdateReadyBanner({
  updateReady = false,
  applying = false,
  hasActiveRun = false,
  onApply,
  onForceRefresh,
}) {
  if (!updateReady && !applying) return null;

  return (
    <div
      className="safe-area-top"
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        zIndex: 975,
        width: 'min(360px, calc(100% - 28px))',
      }}
    >
      <div
        className="panel-chrome hud-scanline"
        style={{
          borderRadius: 18,
          border: `1px solid ${C.cyan}34`,
          background: 'linear-gradient(180deg, rgba(8,12,20,0.96) 0%, rgba(4,6,10,0.99) 100%)',
          boxShadow: '0 18px 44px rgba(0,0,0,0.42)',
          padding: '12px 14px',
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.14em', color: C.cyan }}>
            UPDATE READY
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, color: C.textMuted }}>
            {applying ? 'Applying' : hasActiveRun ? 'Queued' : 'Standing by'}
          </div>
        </div>
        <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
          {applying
            ? 'Syncing the newest build now. This should only take a moment.'
            : hasActiveRun
              ? 'A fresher build is downloaded. Finish the current run, then apply it here without hard-refresh roulette.'
              : 'A fresher build is downloaded. Apply it now before the old bundle keeps hanging around.'}
        </div>
        {!applying ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={onApply}
              style={getPrimaryActionButtonStyle(C.cyan, { padding: '10px 14px', fontSize: 11 })}
            >
              Apply update
            </button>
            <button
              onClick={onForceRefresh}
              style={getSecondaryActionButtonStyle(C.orange, { padding: '10px 14px', fontSize: 11 })}
            >
              Force refresh
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
  const {
    needRefresh: [updateReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('PWA registration failed.', error);
    },
  });
  const _upInitial = (key) => window.__launchParams?.[key] ?? null;
  const launchStarterProfileIdInitial = _upInitial('starterProfile') ?? _upInitial('starter') ?? null;
  const launchDifficultyIdInitial = _upInitial('difficulty') ?? null;
  const launchChallengeIdsInitial = String(_upInitial('challenges') ?? '')
    .split(',')
    .map((challengeId) => challengeId.trim())
    .filter(Boolean);
  const [data, setData] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [autoApplyingUpdate, setAutoApplyingUpdate] = useState(false);
  const [menuAutosave, setMenuAutosave] = useState(null);
  const [debugSaveSlots, setDebugSaveSlots] = useState(() => readDebugSaveSlots());
  const [playtestMode, setPlaytestMode] = useState(() => readPlaytestModeEnabled());
  const [metaProgress, setMetaProgress] = useState(() => readMetaProgress());
  const [runAnalytics, setRunAnalytics] = useState(() => readRunAnalytics());
  const [recentUnlocks, setRecentUnlocks] = useState(() => readMetaProgress().lastUnlocks || []);
  const [selectedCallsignId, setSelectedCallsignId] = useState(() => (
    readStoredString(CALLSIGN_STORAGE_KEY, getDefaultCallsignId())
  ));
  const [selectedStarterProfileId, setSelectedStarterProfileId] = useState(() => {
    const unlocked = getUnlockedStarterProfiles(readMetaProgress());
    if (launchStarterProfileIdInitial && unlocked.some((profile) => profile.id === launchStarterProfileIdInitial)) {
      return launchStarterProfileIdInitial;
    }
    return readStoredString(STARTER_PROFILE_STORAGE_KEY, unlocked[0]?.id || 'kernel');
  });
  const [selectedDifficultyId, setSelectedDifficultyId] = useState(() => {
    const unlocked = getUnlockedDifficulties(readMetaProgress());
    if (launchDifficultyIdInitial && unlocked.some((difficulty) => difficulty.id === launchDifficultyIdInitial)) {
      return launchDifficultyIdInitial;
    }
    return readStoredString(DIFFICULTY_STORAGE_KEY, unlocked[0]?.id || 'standard');
  });
  const [selectedChallengeIds, setSelectedChallengeIds] = useState(() => {
    const unlocked = getUnlockedChallenges(readMetaProgress());
    if (launchChallengeIdsInitial.length > 0) {
      const unlockedIds = new Set(unlocked.map((challenge) => challenge.id));
      const filtered = launchChallengeIdsInitial.filter((challengeId) => unlockedIds.has(challengeId));
      if (filtered.length > 0) return filtered;
    }
    return readStoredArray(CHALLENGES_STORAGE_KEY);
  });
  const [tutorialNudge, setTutorialNudge] = useState('');
  const [sceneArtReadyKey, setSceneArtReadyKey] = useState(null);
  const [completedTutorialIds, setCompletedTutorialIds] = useState(() => {
    if (typeof window === 'undefined') return [];
    return parseCompletedTutorialIds(window.localStorage.getItem(TUTORIAL_COMPLETED_STORAGE_KEY));
  });
  const achievementCatalog = useMemo(() => getAchievementCatalog(), []);
  const callsignCatalog = useMemo(() => getCallsignCatalog(), []);
  const dailyConfigDateKey = new Date().toDateString();
  const dailyRunConfig = useMemo(() => getDailyRunConfig(new Date(dailyConfigDateKey)), [dailyConfigDateKey]);
  const unlockedAchievementRewardState = useMemo(
    () => getUnlockedAchievementRewardState(metaProgress?.achievementIdsUnlocked || []),
    [metaProgress?.achievementIdsUnlocked],
  );
  const unlockedStarterProfiles = useMemo(() => getUnlockedStarterProfiles(metaProgress), [metaProgress]);
  const unlockedDifficulties = useMemo(() => getUnlockedDifficulties(metaProgress), [metaProgress]);
  const unlockedChallenges = useMemo(() => getUnlockedChallenges(metaProgress), [metaProgress]);
  const todaysDailyRecord = useMemo(
    () => (metaProgress?.dailyRunRecords || []).find((record) => record.id === dailyRunConfig.id) || null,
    [dailyRunConfig.id, metaProgress?.dailyRunRecords],
  );
  const recentDailyRecords = useMemo(
    () => metaProgress?.dailyRunRecords || [],
    [metaProgress?.dailyRunRecords],
  );
  const runAnalyticsDashboard = useMemo(
    () => buildRunAnalyticsDashboard(runAnalytics),
    [runAnalytics],
  );
  const sceneArtManifest = useMemo(() => buildSceneArtManifest(state), [
    state?.combat?.enemies,
    state?.combat?.player?.piles,
    state?.combat?.cardInstances,
    state?.deck?.cardInstances,
    state?.deck?.master,
    state?.deckView,
    state?.event?.eventId,
    state?.event?.pendingSelectOp,
    state?.map?.currentNodeId,
    state?.mode,
    state?.reward?.cardChoices,
    state?.run?.act,
    state?.run?.floor,
    state?.run?.seed,
    state?.shop?.offers,
    state?.shop?.pendingService,
  ]);

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
    const nextMode = state?.mode;
    if (!nextMode || sceneAudioModeRef.current === nextMode) return;
    const previousMode = sceneAudioModeRef.current;
    sceneAudioModeRef.current = nextMode;

    if (nextMode === 'MainMenu') sfx.menuOpen();
    else if (nextMode === 'Map' && previousMode === 'MainMenu') sfx.runStart();
    else if (nextMode === 'Reward') sfx.rewardOpen();
    else if (nextMode === 'Shop') sfx.shopOpen();
    else if (nextMode === 'Event') sfx.eventOpen();
    else if (nextMode === 'GameOver') sfx.fixerPing();
  }, [state?.mode]);

  useEffect(() => {
    if (!unlockedStarterProfiles.some((profile) => profile.id === selectedStarterProfileId)) {
      setSelectedStarterProfileId(unlockedStarterProfiles[0]?.id || 'kernel');
    }
  }, [selectedStarterProfileId, unlockedStarterProfiles]);

  useEffect(() => {
    if (!unlockedDifficulties.some((difficulty) => difficulty.id === selectedDifficultyId)) {
      setSelectedDifficultyId(unlockedDifficulties[0]?.id || 'standard');
    }
  }, [selectedDifficultyId, unlockedDifficulties]);

  useEffect(() => {
    const unlockedIds = new Set(unlockedChallenges.map((challenge) => challenge.id));
    setSelectedChallengeIds((prev) => prev.filter((challengeId) => unlockedIds.has(challengeId)));
  }, [unlockedChallenges]);

  useEffect(() => {
    const unlockedCallsigns = new Set(unlockedAchievementRewardState.unlockedCallsignIds || []);
    if (!unlockedCallsigns.has(selectedCallsignId)) {
      setSelectedCallsignId(unlockedAchievementRewardState.unlockedCallsignIds?.[0] || getDefaultCallsignId());
    }
  }, [selectedCallsignId, unlockedAchievementRewardState]);

  useEffect(() => {
    if (!sceneArtManifest?.key) return undefined;
    const blockUrls = sceneArtManifest.blockUrls?.length ? sceneArtManifest.blockUrls : sceneArtManifest.urls;
    if (areRuntimeArtUrlsSettled(blockUrls)) {
      startTransition(() => {
        setSceneArtReadyKey((prev) => (prev === sceneArtManifest.key ? prev : sceneArtManifest.key));
      });
      return undefined;
    }

    let cancelled = false;
    preloadRuntimeArtUrls(blockUrls, { timeoutMs: 4500 }).finally(() => {
      if (cancelled) return;
      startTransition(() => {
        setSceneArtReadyKey(sceneArtManifest.key);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sceneArtManifest?.key]);

  useEffect(() => {
    if (!sceneArtManifest?.backgroundUrls?.length) return undefined;
    let cancelled = false;

    const warmBackgroundArt = () => {
      preloadRuntimeArtUrls(sceneArtManifest.backgroundUrls, { timeoutMs: 4500 }).catch(() => {});
    };

    if (typeof window === 'undefined') {
      warmBackgroundArt();
      return undefined;
    }

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(() => {
        if (!cancelled) warmBackgroundArt();
      }, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) warmBackgroundArt();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [sceneArtManifest?.key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STARTER_PROFILE_STORAGE_KEY, selectedStarterProfileId || 'kernel');
  }, [selectedStarterProfileId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DIFFICULTY_STORAGE_KEY, selectedDifficultyId || 'standard');
  }, [selectedDifficultyId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHALLENGES_STORAGE_KEY, JSON.stringify(selectedChallengeIds || []));
  }, [selectedChallengeIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CALLSIGN_STORAGE_KEY, selectedCallsignId || getDefaultCallsignId());
  }, [selectedCallsignId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const hasActiveRun = Boolean(state?.run) && !state?.run?.tutorialShell && !['GameOver', 'TutorialComplete'].includes(state?.mode);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentUrl = new URL(window.location.href);
    if (!currentUrl.searchParams.has('refresh')) return;
    currentUrl.searchParams.delete('refresh');
    window.history.replaceState(window.history.state, '', currentUrl.toString());
  }, []);

  useEffect(() => {
    if (!updateReady) {
      autoUpdateAttemptedRef.current = false;
      setAutoApplyingUpdate(false);
      return undefined;
    }
    const safeToApply = state?.mode === 'MainMenu' && !state?.run && !showPauseMenu;
    if (!safeToApply || !updateServiceWorker || autoUpdateAttemptedRef.current) return undefined;

    autoUpdateAttemptedRef.current = true;
    const timer = window.setTimeout(async () => {
      setAutoApplyingUpdate(true);
      try {
        await updateServiceWorker(true);
      } catch (error) {
        console.warn('Unable to auto-apply downloaded update.', error);
        setAutoApplyingUpdate(false);
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [showPauseMenu, state?.mode, state?.run, updateReady, updateServiceWorker]);

  // ── URL params: read from global captured in index.html before React loaded ──
  const _up = (key) => window.__launchParams?.[key] ?? null;
  const visualSceneId = _up('scene');
  const visualMenuState = getVisualSceneMenuState(visualSceneId);
  const launchAiEnabled = _up('ai') === 'true';
  const launchAiAutoRun = _up('autoRun') === 'true' || _up('autorun') === 'true';
  const launchStarterProfileId = _up('starterProfile') ?? _up('starter') ?? null;
  const launchDifficultyId = _up('difficulty') ?? null;
  const launchChallengeIds = String(_up('challenges') ?? '')
    .split(',')
    .map((challengeId) => challengeId.trim())
    .filter(Boolean);

  // ── AI auto-play debug state ──────────────────────────────────────────────
  const [aiEnabled, setAiEnabled]       = useState(() => launchAiEnabled || launchAiAutoRun);
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
  const [debugSeedInput, setDebugSeedInput] = useState(() => _up('seed') ?? '');
  const [randomizeDebugSeed, setRandomizeDebugSeed] = useState(() => _up('randomize') === 'true');
  const [seedMode, setSeedMode] = useState(() => {
    const sm = _up('seedMode');
    return (sm === 'wild' || sm === 'sensible') ? sm : 'wild';
  });
  const [aiPlaystyle, setAiPlaystyle] = useState(() => {
    const ps = _up('playstyle');
    return (ps && AI_PLAYSTYLES[ps]) ? ps : 'balanced';
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
      if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
      if (Object.prototype.hasOwnProperty.call(RUN_BASELINE, k) && RUN_BASELINE[k] === v) continue;
      out[k] = v;
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
  const contentFingerprintRef = useRef('unknown');
  const metaProgressAwardRef = useRef(null);
  const tutorialCompletionRef = useRef(null);
  const autoUpdateAttemptedRef = useRef(false);
  const exportCurrentGameDataRef = useRef(async () => false);
  const startNewRunRef = useRef(() => {});
  const autosaveTokenRef = useRef(null);
  const backGuardPrimedRef = useRef(false);
  const sceneAudioModeRef = useRef(null);
  const tutorialNudgeTimerRef = useRef(null);
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

  const createRunStateFromSettings = useCallback(function createRunStateFromSettings({
    overrideDebugSeed = undefined,
    sourceSeedMode = seedMode,
    sourceCustomConfig = customConfig,
    sourceLockedFields = lockedFields,
    starterProfileId = selectedStarterProfileId,
    difficultyId = selectedDifficultyId,
    challengeIds = selectedChallengeIds,
    fixedSeed = null,
    runMode = 'standard',
    dailyRunId = null,
    dailyRunLabel = null,
  } = {}) {
    if (!data) return null;
    const effectiveCustomConfig = composeRunConfig(
      sourceCustomConfig,
      starterProfileId,
      difficultyId,
      challengeIds,
    );
    const initial = createInitialState();
    return dispatchWithJournal(initial, data, {
      type: 'NewRun',
      seed: fixedSeed ?? Date.now(),
      debugSeed: resolveRequestedDebugSeed(overrideDebugSeed),
      debugSeedMode: sourceSeedMode,
      customOverrides: buildCustomOverrides(effectiveCustomConfig),
      lockedKeys: [...sourceLockedFields],
      starterProfileId,
      difficultyId,
      challengeIds,
      runMode,
      dailyRunId,
      dailyRunLabel,
      unlockedAchievementIds: unlockedAchievementRewardState.unlockedAchievementIds,
      unlockedCardIds: unlockedAchievementRewardState.unlockedCardIds,
      unlockedRelicIds: unlockedAchievementRewardState.unlockedRelicIds,
      unlockedCallsignIds: unlockedAchievementRewardState.unlockedCallsignIds,
    });
  }, [
    customConfig,
    data,
    lockedFields,
    seedMode,
    unlockedAchievementRewardState,
    selectedChallengeIds,
    selectedDifficultyId,
    selectedStarterProfileId,
  ]);

  function showTutorialHint(message) {
    if (!message) return;
    sfx.systemWarning();
    setTutorialNudge(message);
    if (tutorialNudgeTimerRef.current) clearTimeout(tutorialNudgeTimerRef.current);
    tutorialNudgeTimerRef.current = setTimeout(() => {
      tutorialNudgeTimerRef.current = null;
      setTutorialNudge('');
    }, 2400);
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

  const commitRunAnalytics = useCallback((updater) => {
    setRunAnalytics((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeRunAnalytics(next);
      return next;
    });
  }, []);

  const appendRunSummary = useCallback((summary) => {
    if (!summary) return;
    setRunHistory((prev) => [...prev, summary]);
    commitRunAnalytics((prev) => ingestRunRecordAnalytics(prev, summary));
  }, [commitRunAnalytics]);

  function adoptState(newState, {
    handoffReason = '',
    pauseAi = false,
    clearAutosave = true,
    autosaveToken = null,
  } = {}) {
    if (!newState) return;
    resetRunTransientState();
    if (clearAutosave) clearNodeAutosave();
    autosaveTokenRef.current = autosaveToken;
    aiPausedRef.current = pauseAi;
    setAiPaused(pauseAi);
    setAiHandoffReason(handoffReason);
    setAiWatchdog(AI_WATCHDOG_IDLE);
    setTutorialNudge('');
    resetAiStallTracker(getAiStateSignature(newState));
    setState(newState);
  }

  function resumeAutosavedRun() {
    if (!menuAutosave?.state) return;
    const restored = restorePersistedSnapshot(menuAutosave, contentFingerprintRef.current);
    if (!restored.ok) {
      clearNodeAutosave();
      setMenuAutosave(null);
      return;
    }
    const token = restored.payload.token || buildNodeAutosaveToken(restored.payload.state);
    setMenuAutosave(null);
    adoptState(restored.payload.state, {
      handoffReason: 'Resumed from node autosave.',
      pauseAi: false,
      clearAutosave: false,
      autosaveToken: token,
    });
  }

  function startTutorialRun(tutorialId = TUTORIAL_CATALOG[0]?.id) {
    if (!data) return;
    setMenuAutosave(null);
    const tutorialDef = getTutorialDefinition(tutorialId);
    commitRunAnalytics((prev) => recordTutorialAnalyticsEvent(prev, {
      type: 'start',
      tutorialId,
      title: tutorialDef.title,
    }));
    sfx.tutorialAdvance();
    adoptState(createTutorialRunState(data, tutorialId), {
      handoffReason: `${tutorialDef.title} active`,
      pauseAi: true,
      clearAutosave: true,
    });
  }

  function startDailyRun() {
    if (!data) return;
    const newState = createRunStateFromSettings({
      starterProfileId: dailyRunConfig.starterProfileId,
      difficultyId: dailyRunConfig.difficultyId,
      challengeIds: dailyRunConfig.challengeIds,
      sourceCustomConfig: {},
      sourceLockedFields: [],
      sourceSeedMode: 'wild',
      overrideDebugSeed: null,
      fixedSeed: dailyRunConfig.seed,
      runMode: 'daily',
      dailyRunId: dailyRunConfig.id,
      dailyRunLabel: dailyRunConfig.summary,
    });
    if (!newState) return;
    setMenuAutosave(null);
    adoptState(newState, {
      handoffReason: `Daily Run ${dailyRunConfig.id}`,
      pauseAi: false,
      clearAutosave: true,
    });
  }

  function returnToMainMenu() {
    const liveState = stateRef.current;
    if (liveState?.run?.tutorial?.active) {
      const tutorialId = liveState.run.tutorial.id;
      const tutorialDef = getTutorialDefinition(tutorialId);
      const activeStep = getTutorialStep(liveState);
      commitRunAnalytics((prev) => recordTutorialAnalyticsEvent(prev, {
        type: 'exit',
        tutorialId,
        title: tutorialDef.title,
        stepId: activeStep?.id || null,
      }));
    }
    clearNodeAutosave();
    setMenuAutosave(null);
    adoptState(createInitialState(), {
      handoffReason: '',
      pauseAi: true,
      clearAutosave: false,
      autosaveToken: null,
    });
  }

  function saveDebugSlot(slotId) {
    const liveState = stateRef.current;
    if (!liveState?.run) return;
    const nextSlots = {
      ...readDebugSaveSlots(contentFingerprintRef.current),
      [slotId]: buildDebugSavePayload(slotId, liveState, contentFingerprintRef.current),
    };
    writeDebugSaveSlots(nextSlots);
    setDebugSaveSlots(nextSlots);
  }

  function loadDebugSlot(slotId) {
    const slots = readDebugSaveSlots(contentFingerprintRef.current);
    const slot = slots?.[slotId];
    if (!slot?.state) return;
    setShowPauseMenu(false);
    setMenuAutosave(null);
    adoptState(slot.state, {
      handoffReason: `Loaded debug save: ${slot.label}`,
      pauseAi: true,
      clearAutosave: true,
      autosaveToken: null,
    });
  }

  async function pickImportSaveFile() {
    if (typeof window === 'undefined') return null;

    if (typeof window.showOpenFilePicker === 'function') {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Card Battler save files',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      });
      return handle ? handle.getFile() : null;
    }

    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const [file] = Array.from(input.files || []);
        resolve(file || null);
        input.remove();
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  async function importSaveFile() {
    if (!data) return;
    setShowPauseMenu(false);

    try {
      const file = await pickImportSaveFile();
      if (!file) return;

      const raw = await file.text();
      const parsed = JSON.parse(raw);
      let importedState = null;

      if (parsed?.schemaVersion != null) {
        const restored = restorePersistedSnapshot(parsed, contentFingerprintRef.current);
        if (!restored.ok) {
          window.alert('That save snapshot does not match the current build.');
          return;
        }
        importedState = restored.payload.state;
      } else if (parsed?.version === 1 && parsed?.state) {
        importedState = sanitizeRestoredState(parsed.state);
      }

      if (!importedState) {
        window.alert('Could not import that save file.');
        return;
      }

      setMenuAutosave(null);
      adoptState(importedState, {
        handoffReason: `Imported save: ${file.name}`,
        pauseAi: true,
        clearAutosave: true,
        autosaveToken: null,
      });
    } catch (error) {
      console.error('Failed to import save file', error);
      window.alert('Could not import that save file.');
    }
  }

  function clearDebugSlot(slotId) {
    const slots = { ...readDebugSaveSlots() };
    delete slots[slotId];
    writeDebugSaveSlots(slots);
    setDebugSaveSlots(slots);
  }

  function reloadApp() {
    setShowPauseMenu(false);
    window.location.reload();
  }

  async function applyDownloadedUpdate() {
    setShowPauseMenu(false);
    if (!updateServiceWorker) return;
    try {
      setAutoApplyingUpdate(true);
      await updateServiceWorker(true);
    } catch (error) {
      setAutoApplyingUpdate(false);
      console.warn('Unable to apply downloaded update.', error);
    }
  }

  async function forceRefreshApp() {
    setShowPauseMenu(false);
    setAutoApplyingUpdate(true);
    const refreshUrl = new URL(window.location.href);
    refreshUrl.searchParams.set('refresh', String(Date.now()));

    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map((registration) => registration.unregister()));
      }
      if (typeof window !== 'undefined' && window.caches?.keys) {
        const cacheKeys = await window.caches.keys();
        await Promise.allSettled(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
      }
    } catch (error) {
      console.warn('Force refresh could not fully clear cached assets.', error);
    }

    window.location.replace(refreshUrl.toString());
  }

  const togglePlaytestMode = useCallback(() => {
    const next = !playtestMode;
    writePlaytestModeEnabled(next);
    setPlaytestMode(next);
    if (typeof window !== 'undefined') {
      window.location.href = buildPlaytestUrl(window.location.href, next);
    }
  }, [playtestMode]);

  function hardReloadIntoFreshRun(overrideDebugSeed = undefined) {
    const debugSeed = resolveRequestedDebugSeed(overrideDebugSeed);
    queueForcedNewRun({
      overrideDebugSeed: debugSeed,
      seedMode,
      customConfig,
      lockedFields: [...lockedFields],
      starterProfileId: selectedStarterProfileId,
      difficultyId: selectedDifficultyId,
      challengeIds: [...selectedChallengeIds],
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

  function returnToLaunchMenuFromPause() {
    if (!stateRef.current?.run) returnToMainMenu();
    const confirmed = window.confirm('Return to the launch menu and clear this run?');
    if (!confirmed) return;
    returnToMainMenu();
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
  // 'wild' | 'sensible' — which decoder to use for the current seed / each-run randomise
  // ── AI Playstyle ──────────────────────────────────────────────────────────
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
    if (!aiEnabled) return;
    loadAiPlayerModule().catch((error) => {
      console.error('Failed to preload AI module', error);
    });
  }, [aiEnabled]);

  useEffect(() => {
    if (!state?.run) return;
    if (state.mode === 'GameOver' || state.mode === 'TutorialComplete') {
      clearNodeAutosave();
      autosaveTokenRef.current = null;
      return;
    }
    const token = buildNodeAutosaveToken(state);
    if (!token || token === autosaveTokenRef.current) return;
    try {
      const savedToken = writeNodeAutosave(state, contentFingerprintRef.current);
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
      const contentFingerprint = getSnapshotContentFingerprint(data);
      contentFingerprintRef.current = contentFingerprint;
      const compatibleDebugSlots = readDebugSaveSlots(contentFingerprint);
      writeDebugSaveSlots(compatibleDebugSlots);
      setDebugSaveSlots(compatibleDebugSlots);

      const forcedRun = consumeForcedNewRun();
      if (forcedRun) {
        const nextSeedMode = forcedRun.seedMode === 'sensible' ? 'sensible' : 'wild';
        const nextCustomConfig = {
          ...CUSTOM_CONFIG_DEFAULTS,
          ...(forcedRun.customConfig && typeof forcedRun.customConfig === 'object' ? forcedRun.customConfig : {}),
        };
        const nextLockedFields = new Set(Array.isArray(forcedRun.lockedFields) ? forcedRun.lockedFields : []);
        const nextStarterProfileId = STARTER_PROFILES[forcedRun.starterProfileId] ? forcedRun.starterProfileId : 'kernel';
        const nextDifficultyId = DIFFICULTY_PROFILES[forcedRun.difficultyId] ? forcedRun.difficultyId : 'standard';
        const nextChallengeIds = Array.isArray(forcedRun.challengeIds)
          ? forcedRun.challengeIds.filter((challengeId) => CHALLENGE_MODES[challengeId])
          : [];
        const forcedDebugSeed = forcedRun.overrideDebugSeed ?? null;
        clearNodeAutosave();
        autosaveTokenRef.current = null;
        setSeedMode(nextSeedMode);
        setCustomConfig(nextCustomConfig);
        setLockedFields(nextLockedFields);
        setSelectedStarterProfileId(nextStarterProfileId);
        setSelectedDifficultyId(nextDifficultyId);
        setSelectedChallengeIds(nextChallengeIds);
        setDebugSeedInput(forcedDebugSeed == null ? '' : String(forcedDebugSeed));
        const newState = createRunStateFromSettings({
          overrideDebugSeed: forcedDebugSeed,
          sourceSeedMode: nextSeedMode,
          sourceCustomConfig: nextCustomConfig,
          sourceLockedFields: nextLockedFields,
          starterProfileId: nextStarterProfileId,
          difficultyId: nextDifficultyId,
          challengeIds: nextChallengeIds,
        });
        setMenuAutosave(null);
        aiPausedRef.current = false;
        setAiPaused(false);
        setAiHandoffReason('');
        setState(newState);
        return;
      }

      if (visualMenuState) {
        clearNodeAutosave();
        autosaveTokenRef.current = null;
        setMenuAutosave(null);
        aiPausedRef.current = true;
        setAiPaused(true);
        setAiHandoffReason('Visual QA scene');
        setState(createInitialState());
        return;
      }

      const visualSceneState = createVisualSceneState(data, visualSceneId);
      if (visualSceneState) {
        clearNodeAutosave();
        autosaveTokenRef.current = null;
        setMenuAutosave(null);
        aiPausedRef.current = true;
        setAiPaused(true);
        setAiHandoffReason('Visual QA scene');
        setState(visualSceneState);
        return;
      }

      const autosave = readNodeAutosave(contentFingerprint);
      if (autosave?.state) {
        autosaveTokenRef.current = autosave.token || buildNodeAutosaveToken(autosave.state);
        setMenuAutosave(autosave);
      } else {
        clearNodeAutosave();
        autosaveTokenRef.current = null;
        setMenuAutosave(null);
      }
      const bootAiActive = launchAiEnabled || launchAiAutoRun;
      aiPausedRef.current = !bootAiActive;
      setAiPaused(!bootAiActive);
      setAiHandoffReason(bootAiActive ? 'AI launch session' : '');
      setState(createInitialState());
    }
  }, [data, state, debugSeedInput, seedMode, customConfig, lockedFields, visualSceneId, launchAiEnabled, launchAiAutoRun]);

  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const shouldForcePause = state?.mode === 'TutorialComplete'
      || Boolean(state?.run?.tutorial?.active);
    if (!shouldForcePause || !aiEnabled || aiPaused) return;
    clearAiTimer();
    aiPausedRef.current = true;
    setAiPaused(true);
    setAiHandoffReason(state?.run?.tutorial?.active ? 'Tutorial active' : 'Tutorial complete');
    setAiWatchdog(AI_WATCHDOG_IDLE);
  }, [state?.mode, state?.run?.tutorial?.active, aiEnabled, aiPaused, clearAiTimer]);

  useEffect(() => {
    if (state?.mode !== 'TutorialComplete') return;
    const tutorialId = state?.run?.tutorial?.id;
    if (!tutorialId) return;
    const completionKey = `${tutorialId}:${state?.run?.tutorial?.outcome || 'complete'}`;
    if (tutorialCompletionRef.current !== completionKey) {
      tutorialCompletionRef.current = completionKey;
      const tutorialDef = getTutorialDefinition(tutorialId);
      commitRunAnalytics((prev) => recordTutorialAnalyticsEvent(prev, {
        type: 'complete',
        tutorialId,
        title: tutorialDef.title,
      }));
      sfx.tutorialComplete();
    }
    setCompletedTutorialIds((prev) => {
      if (prev.includes(tutorialId)) return prev;
      const next = [...prev, tutorialId];
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TUTORIAL_COMPLETED_STORAGE_KEY, serializeCompletedTutorialIds(next));
      }
      return next;
    });
  }, [commitRunAnalytics, state?.mode, state?.run?.tutorial?.id, state?.run?.tutorial?.outcome]);

  useEffect(() => {
    if (state?.mode === 'TutorialComplete') return;
    tutorialCompletionRef.current = null;
  }, [state?.mode]);

  useEffect(() => {
    if (state?.mode !== 'GameOver' || !state?.run || state.run?.tutorial?.active) return;
    const signature = [
      state.run.seed ?? 'seed',
      state.run.victory ? 'win' : 'loss',
      state.run.act ?? 'act',
      state.run.floor ?? 'floor',
    ].join(':');
    if (metaProgressAwardRef.current === signature) return;
    metaProgressAwardRef.current = signature;
    setMetaProgress((prev) => {
      const { nextMetaProgress, newUnlocks } = applyRunResultToMetaProgress(prev, state.run);
      writeMetaProgress(nextMetaProgress);
      setRecentUnlocks(newUnlocks);
      return nextMetaProgress;
    });
  }, [state?.mode, state?.run]);

  useEffect(() => () => {
    if (tutorialNudgeTimerRef.current) {
      clearTimeout(tutorialNudgeTimerRef.current);
      tutorialNudgeTimerRef.current = null;
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
    appendRunSummary(archived);
    return true;
  }, [aiPlaystyle, appendRunSummary, seedMode]);

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
    runAiStepRef.current = async () => {
      if (!aiEnabledRef.current || aiPausedRef.current) return;

      let getAIAction = null;
      try {
        ({ getAIAction } = await loadAiPlayerModule());
      } catch (error) {
        console.error('[AI] failed to load autoplay module', error);
        stopAiForTakeover('AI controls failed to load. Handing control back to you.');
        return;
      }

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

    if (mode === 'MainMenu') {
      const next = createRunStateFromSettings();
      if (!next) {
        stopAiForTakeover('AI could not start a run from the current launch settings.');
        return;
      }
      setMenuAutosave(null);
      adoptState(next, {
        handoffReason: '',
        pauseAi: false,
        clearAutosave: true,
        autosaveToken: null,
      });
      scheduleAiTick(Math.min(120, aiSpeed));
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
      appendRunSummary(summary);

      let nextDebugSeed = null;
      if (randomizeDebugSeed) {
        nextDebugSeed = randomDebugSeed();
      } else if (debugSeedInput.trim()) {
        const parsed = parseInt(debugSeedInput.trim(), 10);
        if (!isNaN(parsed)) nextDebugSeed = parsed;
      }

      clearNodeAutosave();
      autosaveTokenRef.current = null;
      const next = createRunStateFromSettings({ overrideDebugSeed: nextDebugSeed });
      if (!next) {
        scheduleAiTick(Math.min(220, aiSpeed));
        return;
      }
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

    if (['Rest_Heal', 'Rest_Repair', 'Rest_Stabilise', 'Rest_Forge'].includes(action.type)) {
      pendingFloorEventsRef.current.push({
        act: currentState.run?.act,
        floor: currentState.run?.floor,
        type: 'Rest',
        choice: action.type,
      });
    }

    if (action.type === 'Shop_BuyOffer') {
      const offer = currentState.shop?.offers?.[action.index];
      if (offer && (offer.kind !== 'Service' || offer.serviceId === 'Heal')) {
        pendingFloorEventsRef.current.push({
          act: currentState.run?.act,
          floor: currentState.run?.floor,
          type: 'Shop',
          purchased: {
            kind: offer.kind,
            defId: offer.defId ?? offer.serviceId ?? offer.relicId,
            price: offer.price,
            currency: getOfferCurrency(offer),
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
      if (currentState.shop?.pendingService) {
        pendingFloorEventsRef.current.push({
          act: currentState.run?.act,
          floor: currentState.run?.floor,
          type: 'Shop',
          purchased: {
            kind: 'Service',
            defId: currentState.shop.pendingService,
            price: currentState.shop.pendingPrice ?? null,
            currency: currentState.shop.pendingCurrency ?? 'gold',
            targetInstanceId: action.instanceId,
            targetDefId: instance?.defId ?? null,
          },
        });
      } else {
        pendingFloorEventsRef.current.push({
          act: currentState.run?.act,
          floor: currentState.run?.floor,
          type: 'DeckTarget',
          source: currentState.event?.pendingSelectOp ? 'Event' : 'DeckView',
          operation: currentState.event?.pendingSelectOp ?? null,
          instanceId: action.instanceId,
          defId: instance?.defId ?? null,
        });
      }
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
    adoptState,
    appendRunSummary,
    aiPlaystyle,
    aiSpeed,
    aiStopAfterCombat,
    aiStopAtAct,
    archiveInProgressRun,
    customConfig,
    debugSeedInput,
    lockedFields,
    randomizeDebugSeed,
    createRunStateFromSettings,
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
    const psLabel    = getAiPlaystyleSlug(aiPlaystyle);
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

    const psLabel = getAiPlaystyleSlug(aiPlaystyle);
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
    const psLabel  = getAiPlaystyleSlug(aiPlaystyle);
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
    setMenuAutosave(null);
    adoptState(newState, {
      handoffReason: '',
      pauseAi: false,
      clearAutosave: true,
    });
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
    const tutorialGate = canUseTutorialAction(stateRef.current, action);
    if (!tutorialGate.allowed) {
      showTutorialHint(tutorialGate.message);
      return;
    }
    setState(prev => {
      try {
        const next = dispatchWithJournal(prev, data, action);
        return advanceTutorialState(next, action, data);
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

  const sceneArtBlockUrls = sceneArtManifest?.blockUrls?.length ? sceneArtManifest.blockUrls : (sceneArtManifest?.urls || []);
  const pendingSceneArtCount = sceneArtManifest ? getPendingRuntimeArtUrls(sceneArtBlockUrls).length : 0;
  const shouldBlockSceneArt = Boolean(sceneArtManifest)
    && sceneArtReadyKey !== sceneArtManifest.key
    && pendingSceneArtCount > 0;

  if (shouldBlockSceneArt) {
    const readyCount = Math.max(0, sceneArtBlockUrls.length - pendingSceneArtCount);
    return (
      <LoadingScreen
        title={sceneArtManifest.title}
        message={sceneArtManifest.message}
        detail={`${readyCount}/${sceneArtBlockUrls.length} preview assets ready`}
        accent={sceneArtManifest.accent}
      />
    );
  }

  const tutorialStep = getTutorialStep(state);
  const tutorialMenuState = getTutorialMenuState(state);
  const blockMenuTutorialAction = () => showTutorialHint('Finish or leave the briefing first.');

  let content;
  switch (state.mode) {
    case 'MainMenu':
      content = (
        <MainMenuHub
          ScreenShell={ScreenShell}
          data={data}
          tutorialStep={tutorialStep}
          initialMenuView={tutorialMenuState?.menuView ?? visualMenuState?.menuView ?? 'home'}
          initialIntelView={tutorialMenuState?.intelView ?? visualMenuState?.intelView ?? 'progress'}
          forcedMenuView={tutorialMenuState?.menuView ?? null}
          forcedIntelView={tutorialMenuState?.intelView ?? null}
          onBlockedNavigation={tutorialMenuState ? blockMenuTutorialAction : null}
          canContinue={Boolean(menuAutosave?.state)}
          onContinue={tutorialMenuState ? blockMenuTutorialAction : resumeAutosavedRun}
          onImportSave={tutorialMenuState ? blockMenuTutorialAction : importSaveFile}
          onStartTutorial={tutorialMenuState ? blockMenuTutorialAction : startTutorialRun}
          onStartDailyRun={tutorialMenuState ? blockMenuTutorialAction : startDailyRun}
          onNewGame={tutorialMenuState ? blockMenuTutorialAction : (() => startNewRun())}
          onSettings={tutorialMenuState ? blockMenuTutorialAction : openPauseMenu}
          debugSaveSlots={debugSaveSlots}
          debugSaveSlotIds={DEBUG_SAVE_SLOT_IDS}
          onLoadDebugSave={tutorialMenuState ? blockMenuTutorialAction : loadDebugSlot}
          tutorialCatalog={TUTORIAL_CATALOG}
          completedTutorialIds={completedTutorialIds}
          metaProgress={metaProgress}
          runAnalytics={runAnalyticsDashboard}
          recentUnlocks={recentUnlocks}
          achievements={achievementCatalog}
          dailyRunConfig={dailyRunConfig}
          dailyRunRecord={todaysDailyRecord}
          recentDailyRecords={recentDailyRecords}
          callsignCatalog={callsignCatalog}
          unlockedCallsignIds={unlockedAchievementRewardState.unlockedCallsignIds}
          selectedCallsignId={selectedCallsignId}
          onSelectCallsign={tutorialMenuState ? blockMenuTutorialAction : setSelectedCallsignId}
          starterProfiles={Object.values(STARTER_PROFILES)}
          unlockedStarterProfileIds={unlockedStarterProfiles.map((profile) => profile.id)}
          selectedStarterProfileId={selectedStarterProfileId}
          onSelectStarterProfile={tutorialMenuState ? blockMenuTutorialAction : setSelectedStarterProfileId}
          difficultyProfiles={Object.values(DIFFICULTY_PROFILES)}
          unlockedDifficultyIds={unlockedDifficulties.map((difficulty) => difficulty.id)}
          selectedDifficultyId={selectedDifficultyId}
          onSelectDifficulty={tutorialMenuState ? blockMenuTutorialAction : setSelectedDifficultyId}
          challengeModes={Object.values(CHALLENGE_MODES)}
          unlockedChallengeIds={unlockedChallenges.map((challenge) => challenge.id)}
          selectedChallengeIds={selectedChallengeIds}
          onToggleChallenge={tutorialMenuState ? blockMenuTutorialAction : ((challengeId) => {
            setSelectedChallengeIds((prev) => (
              prev.includes(challengeId)
                ? prev.filter((id) => id !== challengeId)
                : [...prev, challengeId]
            ));
          })}
          debugSeed={debugSeedInput}
          onDebugSeedChange={tutorialMenuState ? blockMenuTutorialAction : setDebugSeedInput}
          seedMode={seedMode}
          onSeedModeChange={tutorialMenuState ? blockMenuTutorialAction : setSeedMode}
          randomizeDebugSeed={randomizeDebugSeed}
          onRandomizeDebugSeed={tutorialMenuState ? blockMenuTutorialAction : setRandomizeDebugSeed}
          onRandomizeSeed={tutorialMenuState ? blockMenuTutorialAction : (() => {
            setSeedMode('wild');
            setDebugSeedInput(String(randomDebugSeed()));
          })}
          onRandomizeSensibleSeed={tutorialMenuState ? blockMenuTutorialAction : (() => {
            setSeedMode('sensible');
            setDebugSeedInput(String(randomDebugSeed()));
          })}
          customConfig={customConfig}
          onSetCustomField={tutorialMenuState ? blockMenuTutorialAction : ((key, val) => setCustomConfig((prev) => ({ ...prev, [key]: val })))}
          onClearCustomConfig={tutorialMenuState ? blockMenuTutorialAction : (() => setCustomConfig(CUSTOM_CONFIG_DEFAULTS))}
        />
      );
      break;
    case 'Combat':
      content = (
        <ScreenErrorBoundary
          resetKey={`${state.run?.seed ?? 'seed'}:${state.run?.floor ?? 'floor'}:${state.map?.currentNodeId ?? 'node'}`}
          onError={(combatError) => {
            console.error('CombatScreen render failed', combatError, state);
          }}
          fallback={(combatError) => (
            <CombatRecoveryScreen
              message={combatError?.message || 'Combat failed to render.'}
              onReturnToMenu={returnToMainMenu}
              onStartFreshRun={hardReloadIntoFreshRun}
              onReloadApp={reloadApp}
            />
          )}
        >
          <Suspense
            fallback={(
              <LoadingScreen
                title="Booting Combat Shell"
                message="Loading combat systems, FX, and encounter rendering."
                accent={C.red}
              />
            )}
          >
            <CombatScreen state={state} data={data} onAction={handleAction} aiPaused={aiPaused} onOpenMenu={openPauseMenu} tutorialStep={tutorialStep} />
          </Suspense>
        </ScreenErrorBoundary>
      );
      break;
    case 'Map':
      content = <MapScreen state={state} data={data} onAction={handleAction} metaProgress={metaProgress} />;
      break;
    case 'Reward':
      content = <RewardScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Shop':
      content = <ShopScreen state={state} data={data} onAction={handleAction} />;
      break;
    case 'Event':
      content = <EventScreen state={state} data={data} onAction={handleAction} tutorialStep={tutorialStep} MinigameScreen={MinigameScreen} />;
      break;
    case 'GameOver':
      content = <GameOverScreen state={state} onNewRun={hardReloadIntoFreshRun} recentUnlocks={recentUnlocks} />;
      break;
    case 'TutorialComplete':
      content = <TutorialCompleteScreen state={state} onNewGame={() => startNewRun()} onReturnToMenu={returnToMainMenu} />;
      break;
    default:
      content = (
        <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: C.text }}>Unknown mode: {state.mode}</div>
        </ScreenShell>
      );
  }

  const aiPanelProps = {
    embedded: true,
    enabled: aiEnabled,
    onToggle: toggleAiEnabled,
    paused: aiPaused,
    onTogglePause: toggleAiPause,
    stopAtAct: aiStopAtAct,
    onStopAtActChange: setAiStopAtAct,
    stopAfterCombat: aiStopAfterCombat,
    onStopAfterCombatChange: setAiStopAfterCombat,
    onTakeOverNow: takeOverNow,
    speed: aiSpeed,
    onSpeedChange: setAiSpeed,
    runHistory,
    onExport: exportRunData,
    onExportCurrent: exportCurrentGameData,
    currentState: state,
    handoffReason: aiHandoffReason,
    aiWatchdog: { ...aiWatchdog, exportMs: AI_STALL_EXPORT_MS, recoveryMs: AI_STALL_RECOVER_MS },
    debugSeed: debugSeedInput,
    onDebugSeedChange: setDebugSeedInput,
    seedMode,
    onSeedModeChange: setSeedMode,
    randomize: randomizeDebugSeed,
    onRandomizeToggle: setRandomizeDebugSeed,
    onRandomizeSeed: () => {
      setSeedMode('wild');
      setDebugSeedInput(String(randomDebugSeed()));
    },
    onRandomizeSensibleSeed: () => {
      setSeedMode('sensible');
      setDebugSeedInput(String(randomDebugSeed()));
    },
    aiPlaystyle,
    onPlaystyleChange: setAiPlaystyle,
    saveDirName,
    onSetSaveDir: pickSaveDir,
    exportOptions: aiExportOptions,
    onSetExportOption: (key, value) => setAiExportOptions((prev) => normalizeAiExportOptions({ ...prev, [key]: value })),
    onSetAllExportOptions: (value) => setAiExportOptions(
      normalizeAiExportOptions(Object.fromEntries(
        Object.keys(AI_EXPORT_OPTIONS_DEFAULTS).map((key) => [key, value]),
      )),
    ),
    customConfig,
    lockedFields,
    onSetCustomField: (key, val) => setCustomConfig((prev) => ({ ...prev, [key]: val })),
    onToggleLock: (key) => setLockedFields((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    }),
    onClearCustomConfig: () => setCustomConfig(CUSTOM_CONFIG_DEFAULTS),
    gameData: data,
  };

  const tutorialStepMode = tutorialStep?.mode || 'Combat';
  const showTutorialOverlay = Boolean(tutorialStep) && (
    tutorialStepMode === 'DeckView'
      ? Boolean(state?.deckView)
      : state.mode === tutorialStepMode
  );
  const hasActiveRun = Boolean(state?.run) && !state?.run?.tutorialShell && !['GameOver', 'TutorialComplete'].includes(state?.mode);
  const showFloatingMenuButton = !['Combat', 'MainMenu', 'TutorialComplete'].includes(state.mode);

  return (
    <>
      {content}
      {!showPauseMenu && (
        <UpdateReadyBanner
          updateReady={updateReady}
          applying={autoApplyingUpdate}
          hasActiveRun={hasActiveRun}
          onApply={applyDownloadedUpdate}
          onForceRefresh={forceRefreshApp}
        />
      )}
      {showFloatingMenuButton && (
        <PauseMenuButton open={showPauseMenu} onClick={() => (showPauseMenu ? closePauseMenu() : openPauseMenu())} />
      )}
      <PauseMenuOverlay
        open={showPauseMenu}
        onClose={closePauseMenu}
        soundMuted={soundMuted}
        onToggleMute={toggleMute}
        updateReady={updateReady}
        onApplyDownloadedUpdate={applyDownloadedUpdate}
        onReloadApp={reloadApp}
        onForceRefreshApp={forceRefreshApp}
        onReturnToLaunchMenu={returnToLaunchMenuFromPause}
        onAbandonRun={abandonRun}
        onSaveDebugSlot={saveDebugSlot}
        onLoadDebugSlot={loadDebugSlot}
        onDeleteDebugSlot={clearDebugSlot}
        debugSaveSlots={debugSaveSlots}
        hasActiveRun={hasActiveRun}
        state={state}
        showLog={showLog}
        onDevAction={handleAction}
        onToggleLog={() => setShowLog(prev => !prev)}
        aiPanelProps={aiPanelProps}
        playtestMode={playtestMode}
        onTogglePlaytestMode={togglePlaytestMode}
      />
      {/* Deck picker overlay — appears on top of any screen when card selection is needed */}
      {state?.deckView && (
        <DeckPickerOverlay state={state} data={data} onAction={handleAction} tutorialStep={tutorialStep} />
      )}
      {showTutorialOverlay && (
        <TutorialOverlay
          step={tutorialStep}
          nudge={tutorialNudge}
          presentationMode={tutorialStepMode}
          onAdvance={() => {
            const tutorialId = state?.run?.tutorial?.id;
            if (tutorialId && tutorialStep?.id) {
              const tutorialDef = getTutorialDefinition(tutorialId);
              commitRunAnalytics((prev) => recordTutorialAnalyticsEvent(prev, {
                type: 'advance',
                tutorialId,
                title: tutorialDef.title,
                stepId: tutorialStep.id,
              }));
            }
            sfx.tutorialAdvance();
            setTutorialNudge('');
            setState((prev) => acknowledgeTutorialStep(prev));
          }}
          onExit={returnToMainMenu}
        />
      )}
      {state.run && showLog && !['MainMenu', 'TutorialComplete'].includes(state.mode) && <LogOverlay log={state.log} />}
    </>
  );
}

export default App;


