import { createInitialState } from '../game/game_core.js';

export const STATE_SNAPSHOT_SCHEMA_VERSION = 2;
export const NODE_AUTOSAVE_KEY = 'cb_node_autosave_v1';
export const DEBUG_SAVE_SLOTS_KEY = 'cb_debug_save_slots_v1';
export const DEBUG_SAVE_SLOT_IDS = ['slot_1', 'slot_2', 'slot_3'];
export const FORCE_NEW_RUN_KEY = 'cb_force_new_run_v1';

function hashString(value) {
  let hash = 5381;
  const source = String(value ?? '');
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function getSnapshotContentFingerprint(data) {
  if (!data || typeof data !== 'object') return 'unknown';
  const { builtAt, ...stableData } = data;
  return `v${data.version ?? 0}:${hashString(JSON.stringify(stableData))}`;
}

function sanitizeStatuses(statuses) {
  return Array.isArray(statuses) ? statuses.filter(Boolean) : [];
}

function sanitizeCombatEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  return {
    ...entity,
    statuses: sanitizeStatuses(entity.statuses),
  };
}

export function sanitizeRestoredState(rawState) {
  if (!rawState || typeof rawState !== 'object') return null;

  const next = {
    ...createInitialState(),
    ...rawState,
  };

  next.run = rawState.run && typeof rawState.run === 'object' ? rawState.run : null;
  next.deck = rawState.deck && typeof rawState.deck === 'object' ? rawState.deck : null;
  next.map = rawState.map && typeof rawState.map === 'object' ? rawState.map : null;
  next.reward = rawState.reward && typeof rawState.reward === 'object' ? rawState.reward : null;
  next.shop = rawState.shop && typeof rawState.shop === 'object' ? rawState.shop : null;
  next.event = rawState.event && typeof rawState.event === 'object' ? rawState.event : null;
  next.deckView = rawState.deckView && typeof rawState.deckView === 'object' ? rawState.deckView : null;
  next.log = Array.isArray(rawState.log) ? rawState.log : [];
  next.journal = rawState.journal && typeof rawState.journal === 'object'
    ? {
      ...rawState.journal,
      actions: Array.isArray(rawState.journal.actions) ? rawState.journal.actions : [],
    }
    : null;

  if (rawState.combat && typeof rawState.combat === 'object') {
    const combat = rawState.combat;
    const player = sanitizeCombatEntity(combat.player);
    if (!player) return null;
    const piles = player.piles && typeof player.piles === 'object' ? player.piles : {};
    player.piles = {
      draw: Array.isArray(piles.draw) ? piles.draw : [],
      hand: Array.isArray(piles.hand) ? piles.hand : [],
      discard: Array.isArray(piles.discard) ? piles.discard : [],
      exhaust: Array.isArray(piles.exhaust) ? piles.exhaust : [],
      power: Array.isArray(piles.power) ? piles.power : [],
    };

    next.combat = {
      ...combat,
      player,
      enemies: Array.isArray(combat.enemies)
        ? combat.enemies.map((enemy) => sanitizeCombatEntity(enemy)).filter(Boolean)
        : [],
      cardInstances: combat.cardInstances && typeof combat.cardInstances === 'object' ? combat.cardInstances : {},
      enemyAI: combat.enemyAI && typeof combat.enemyAI === 'object' ? combat.enemyAI : { cursorByEnemyId: {} },
      log: Array.isArray(combat.log) ? combat.log : [],
      relicIds: Array.isArray(combat.relicIds) ? combat.relicIds : [],
    };
  } else {
    next.combat = null;
  }

  if (next.mode !== 'MainMenu' && !next.run) return null;
  if (next.mode === 'Combat' && !next.combat) return null;

  return next;
}

export function restorePersistedSnapshot(payload, contentFingerprint = null) {
  if (!payload || typeof payload !== 'object' || !payload.state) {
    return { ok: false, reason: 'missing_state', payload: null };
  }
  if (Number(payload.schemaVersion ?? 0) !== STATE_SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema_mismatch', payload: null };
  }
  if (contentFingerprint && payload.contentFingerprint !== contentFingerprint) {
    return { ok: false, reason: 'content_mismatch', payload: null };
  }
  const sanitizedState = sanitizeRestoredState(payload.state);
  if (!sanitizedState) {
    return { ok: false, reason: 'invalid_state', payload: null };
  }
  return {
    ok: true,
    reason: null,
    payload: {
      ...payload,
      state: sanitizedState,
    },
  };
}

export function buildNodeAutosaveToken(state) {
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

export function writeNodeAutosave(state, contentFingerprint = null) {
  const token = buildNodeAutosaveToken(state);
  if (!token) return null;
  const payload = {
    version: 1,
    schemaVersion: STATE_SNAPSHOT_SCHEMA_VERSION,
    contentFingerprint,
    savedAt: Date.now(),
    token,
    state: buildNodeAutosaveState(state),
  };
  localStorage.setItem(NODE_AUTOSAVE_KEY, JSON.stringify(payload));
  return token;
}

export function readNodeAutosave(contentFingerprint = null) {
  try {
    const raw = localStorage.getItem(NODE_AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const restored = restorePersistedSnapshot(parsed, contentFingerprint);
    return restored.ok ? restored.payload : null;
  } catch {
    return null;
  }
}

export function clearNodeAutosave() {
  localStorage.removeItem(NODE_AUTOSAVE_KEY);
}

function describeDebugSaveState(state) {
  if (!state?.run) return 'Empty slot';
  const parts = [
    `Act ${state.run.act ?? '?'}`,
    `Floor ${state.run.floor ?? '?'}`,
    state.mode ?? 'Unknown',
  ];
  if (state.mode === 'Combat') {
    const hp = state.combat?.player?.hp ?? state.run.hp ?? 0;
    const maxHP = state.combat?.player?.maxHP ?? state.run.maxHP ?? 0;
    const enemies = (state.combat?.enemies || []).filter((enemy) => enemy.hp > 0);
    parts.push(`HP ${hp}/${maxHP}`);
    if (enemies.length > 0) parts.push(enemies.map((enemy) => enemy.name).join(', '));
  } else {
    parts.push(`HP ${state.run.hp ?? 0}/${state.run.maxHP ?? 0}`);
    parts.push(`${state.run.gold ?? 0}g`);
  }
  return parts.join(' | ');
}

export function buildDebugSavePayload(slotId, state, contentFingerprint = null) {
  return {
    version: 1,
    schemaVersion: STATE_SNAPSHOT_SCHEMA_VERSION,
    contentFingerprint,
    slotId,
    savedAt: Date.now(),
    label: describeDebugSaveState(state),
    state: buildNodeAutosaveState(state),
  };
}

export function readDebugSaveSlots(contentFingerprint = null) {
  try {
    const raw = localStorage.getItem(DEBUG_SAVE_SLOTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    if (!contentFingerprint) return parsed;
    const nextSlots = {};
    for (const [slotId, payload] of Object.entries(parsed)) {
      const restored = restorePersistedSnapshot(payload, contentFingerprint);
      if (restored.ok) nextSlots[slotId] = restored.payload;
    }
    return nextSlots;
  } catch {
    return {};
  }
}

export function writeDebugSaveSlots(slots) {
  localStorage.setItem(DEBUG_SAVE_SLOTS_KEY, JSON.stringify(slots));
}

export function queueForcedNewRun(payload) {
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

export function consumeForcedNewRun() {
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
