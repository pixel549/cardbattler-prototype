import React, { useState } from 'react';
import { decodeDebugSeed, decodeSensibleDebugSeed, describeDebugSeed, DEBUG_PRESETS } from '../game/debugSeed';
import { AI_PLAYSTYLES } from '../game/aiPlayer';

const MONO   = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
const CYAN   = '#00f0ff';
const YELLOW = '#ffe600';
const DIM    = '#888';
const BORDER = '#2a2a3a';
const BG     = '#0d0d18';
const ORANGE = '#ff9944';

// Playstyle accent colours
const PLAYSTYLE_COLORS = {
  balanced:       '#00f0ff',  // cyan
  aggressive:     '#ff4433',  // red-orange
  defensive:      '#00ff6b',  // green
  buffDebuff:     '#b44aff',  // purple
  preservation:   '#ffe600',  // yellow
  mutationPusher: '#ff66cc',  // pink/magenta
};

// Card type colours for picker
const TYPE_COLORS = {
  Attack:  '#ff4433',
  Defense: '#00f0ff',
  Utility: '#b44aff',
};

const EXPORT_TRACK_OPTIONS = [
  { key: 'cards', label: 'Track cards', hint: 'Reward picks, card play timelines, and sequencing diagnostics' },
  { key: 'mutations', label: 'Track mutations', hint: 'Mutation events and trigger-check diagnostics' },
  { key: 'hp', label: 'Track HP', hint: 'Damage totals, HP deltas, and health breakdowns' },
  { key: 'hands', label: 'Track hands', hint: 'Opening draws and hand changes through combat' },
  { key: 'floor', label: 'Track map/events', hint: 'Node picks, shops, rests, events, and minigames' },
  { key: 'decks', label: 'Track decks', hint: 'Deck snapshots and full card-list payloads' },
];

// ── Custom field definitions ──────────────────────────────────────────────────
const CUSTOM_FIELDS = [
  { key: 'playerMaxHP',      label: 'HP',         type: 'number', min: 1,    max: 9999, step: 1,   placeholder: '50'   },
  { key: 'startingGold',     label: 'Gold',        type: 'number', min: 0,    max: 9999, step: 1,   placeholder: '99'   },
  { key: 'playerMaxRAM',     label: 'Max RAM',     type: 'number', min: 1,    max: 99,   step: 1,   placeholder: '8'    },
  { key: 'playerRamRegen',   label: 'RAM/turn',    type: 'number', min: 0,    max: 99,   step: 1,   placeholder: '2'    },
  { key: 'drawPerTurnDelta', label: 'Draw Δ',      type: 'number', min: -10,  max: 10,   step: 1,   placeholder: '0'    },
  { key: 'enemyHpMult',      label: 'Enemy HP×',   type: 'number', min: 0.1,  max: 20,   step: 0.1, placeholder: '1.0'  },
  { key: 'enemyDmgMult',     label: 'Enemy Dmg×',  type: 'number', min: 0.1,  max: 20,   step: 0.1, placeholder: '1.0'  },
  { key: 'enemyCount',       label: 'Enemy #',     type: 'number', min: 1,    max: 10,   step: 1,   placeholder: 'auto' },
  {
    key: 'actOverride', label: 'Act', type: 'select',
    options: [
      { v: null, l: 'auto' },
      { v: 1, l: 'Act 1' }, { v: 2, l: 'Act 2' }, { v: 3, l: 'Act 3' }, { v: 4, l: 'Act 4' },
      { v: 5, l: 'Act 5' }, { v: 6, l: 'Act 6' }, { v: 7, l: 'Act 7' },
    ],
  },
  {
    key: 'encounterKind', label: 'Kind', type: 'select',
    options: [
      { v: null, l: 'auto' }, { v: 'normal', l: 'Normal' }, { v: 'elite', l: 'Elite' }, { v: 'boss', l: 'Boss' },
    ],
  },
];

// Shared mini-button style used in the card chip row
const MINI_BTN = {
  padding: '0px 4px',
  borderRadius: 3,
  border: `1px solid #2a2a3a`,
  backgroundColor: 'transparent',
  fontFamily: MONO,
  fontSize: 10,
  cursor: 'pointer',
  lineHeight: 1.5,
  flexShrink: 0,
};

function getStatusLabel(state) {
  if (!state) return 'Waiting…';
  switch (state.mode) {
    case 'Combat': {
      const c = state.combat;
      if (c?.combatOver) return c.victory ? 'Victory – advancing' : 'Defeat – advancing';
      const t    = c?.turn ?? '?';
      const hand = c?.player?.piles?.hand?.length ?? 0;
      const ram  = c?.player?.ram ?? 0;
      const maxR = c?.player?.maxRAM ?? 0;
      return `Combat T${t} — hand:${hand}  ram:${ram}/${maxR}`;
    }
    case 'Map':     return 'Selecting next node…';
    case 'Reward':  return 'Picking card reward…';
    case 'Shop':    return 'At shop — exiting';
    case 'Event': {
      const eid = state.event?.eventId ?? '?';
      return `Event: ${eid}`;
    }
    case 'GameOver': return 'Run over — starting next…';
    default:         return state.mode ?? 'Unknown';
  }
}

function parsedSeed(str) {
  if (!str || !str.trim()) return null;
  const n = parseInt(str.trim(), 10);
  return isNaN(n) ? null : n;
}

const GREEN = '#00ff6b';

export default function AIDebugPanel({
  enabled, onToggle,
  paused, onTogglePause,
  stopAtAct = null, onStopAtActChange,
  stopAfterCombat = false, onStopAfterCombatChange,
  onTakeOverNow,
  speed, onSpeedChange,
  runHistory, onExport, onExportCurrent,
  currentState,
  handoffReason = '',
  aiWatchdog = null,
  debugSeed, onDebugSeedChange,
  seedMode, onSeedModeChange,
  randomize, onRandomizeToggle,
  onRandomizeSeed,
  onRandomizeSensibleSeed,
  aiPlaystyle, onPlaystyleChange,
  saveDirName, onSetSaveDir,
  exportOptions = {},
  onSetExportOption,
  onSetAllExportOptions,
  customConfig   = {},
  lockedFields   = new Set(),
  onSetCustomField,
  onToggleLock,
  onClearCustomConfig,
  gameData,
}) {
  void onSeedModeChange;
  const runCount       = runHistory.length;
  const status         = enabled ? getStatusLabel(currentState) : '—';
  const visibleStatus = enabled ? getStatusLabel(currentState) : (handoffReason || 'Idle');
  const watchdog = aiWatchdog || {
    active: false,
    stagnantMs: 0,
    exportTriggered: false,
    recoveryTriggered: false,
    exportMs: 0,
    recoveryMs: 0,
  };
  const [presetKey,      setPresetKey]      = useState('');
  const [seedOpen,       setSeedOpen]       = useState(false);
  const [customOpen,     setCustomOpen]     = useState(false);
  const [exportOpen,     setExportOpen]     = useState(true);
  const [cardFilter,     setCardFilter]     = useState('');
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [minimized,      setMinimized]      = useState(
    () => localStorage.getItem('aiPanel_minimized') === 'true'
  );
  const toggleMinimized = () => setMinimized(v => {
    const next = !v;
    localStorage.setItem('aiPanel_minimized', String(next));
    return next;
  });

  // ── Derived mutation stats ──
  const cardInstances = currentState?.combat?.cardInstances ?? currentState?.deck?.cardInstances ?? {};
  const totalMutations = Object.values(cardInstances)
    .reduce((sum, ci) => sum + (ci.appliedMutations?.length ?? 0), 0);
  const patchActivations = (currentState?.combat?.log ?? [])
    .filter(e => e.t === 'MutPatch').length;
  const psColor        = PLAYSTYLE_COLORS[aiPlaystyle] || CYAN;
  const watchdogState = !enabled
    ? 'OFF'
    : paused
      ? 'PAUSED'
      : watchdog.recoveryTriggered
        ? 'RECOVERING'
        : watchdog.exportTriggered
          ? 'EXPORTED'
          : 'WATCHING';
  const watchdogColor = !enabled
    ? DIM
    : paused
      ? YELLOW
      : watchdog.recoveryTriggered
        ? ORANGE
        : watchdog.exportTriggered
          ? YELLOW
          : CYAN;
  const stagnantLabel = watchdog.active
    ? `${(watchdog.stagnantMs / 1000).toFixed(watchdog.stagnantMs >= 10000 ? 0 : 1)}s`
    : '0.0s';
  const thresholdLabel = watchdog.exportMs && watchdog.recoveryMs
    ? `${Math.round(watchdog.exportMs / 1000)}s / ${Math.round(watchdog.recoveryMs / 1000)}s`
    : '—';

  const seedNum = parsedSeed(debugSeed);
  // Use the correct decoder based on which mode is active
  const decoded = seedNum !== null
    ? (seedMode === 'sensible' ? decodeSensibleDebugSeed(seedNum) : decodeDebugSeed(seedNum))
    : null;
  const description = decoded ? describeDebugSeed(decoded) : null;

  // ── Active custom field count ────────────────────────────────────────────
  const activeCustomCount = CUSTOM_FIELDS.filter(({ key }) => {
    const v = customConfig[key];
    return v !== null && v !== undefined;
  }).length + ((customConfig.startingCardIds?.length ?? 0) > 0 ? 1 : 0);
  const enabledExportCount = EXPORT_TRACK_OPTIONS.filter(({ key }) => exportOptions[key]).length;

  // ── Card picker helpers ──────────────────────────────────────────────────
  const allCards     = gameData?.cards ? Object.entries(gameData.cards) : [];
  const filteredCards = cardFilter.trim()
    ? allCards.filter(([id, def]) =>
        id.toLowerCase().includes(cardFilter.toLowerCase()) ||
        (def.name || '').toLowerCase().includes(cardFilter.toLowerCase())
      )
    : allCards;

  const selectedCardIds = customConfig.startingCardIds ?? [];
  const selectedCounts  = {};
  for (const id of selectedCardIds) selectedCounts[id] = (selectedCounts[id] || 0) + 1;
  const uniqueSelected  = Object.keys(selectedCounts);

  function addCard(id) {
    onSetCustomField?.('startingCardIds', [...selectedCardIds, id]);
  }
  function removeOneCard(id) {
    const arr = [...selectedCardIds];
    const idx = arr.lastIndexOf(id);
    if (idx === -1) return;
    arr.splice(idx, 1);
    onSetCustomField?.('startingCardIds', arr.length ? arr : null);
  }
  function removeAllCard(id) {
    const arr = selectedCardIds.filter(x => x !== id);
    onSetCustomField?.('startingCardIds', arr.length ? arr : null);
  }

  function handlePresetChange(e) {
    const key = e.target.value;
    setPresetKey(key);
    if (key && DEBUG_PRESETS[key] !== undefined) {
      onDebugSeedChange(String(DEBUG_PRESETS[key]));
    } else {
      onDebugSeedChange('');
    }
  }

  function handleSeedInput(e) {
    onDebugSeedChange(e.target.value);
    setPresetKey('');  // clear preset when user types manually
  }

  const inputStyle = {
    flex: 1,
    backgroundColor: '#0a0a14',
    color: seedNum !== null ? '#e0e0e0' : DIM,
    border: `1px solid ${seedNum !== null ? CYAN : BORDER}`,
    borderRadius: 4,
    padding: '3px 5px',
    fontFamily: MONO,
    fontSize: 10,
    outline: 'none',
  };

  // Shared field input style factory
  function fieldInputStyle(hasValue) {
    return {
      flex: 1,
      backgroundColor: '#0a0a14',
      color: hasValue ? '#e0e0e0' : DIM,
      border: `1px solid ${hasValue ? CYAN : BORDER}`,
      borderRadius: 4,
      padding: '2px 4px',
      fontFamily: MONO,
      fontSize: 9,
      outline: 'none',
      minWidth: 0,
    };
  }

  function lockBtnStyle(locked) {
    return {
      padding: '1px 5px',
      borderRadius: 3,
      border: `1px solid ${locked ? ORANGE : '#252535'}`,
      backgroundColor: locked ? `${ORANGE}22` : 'transparent',
      color: locked ? ORANGE : '#383848',
      fontFamily: MONO,
      fontSize: 10,
      cursor: 'pointer',
      flexShrink: 0,
      lineHeight: 1.4,
      title: locked ? 'Locked — survives random seeds' : 'Unlocked',
    };
  }

  // ── Minimized pill ──────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <button
        onClick={toggleMinimized}
        title="Expand AI panel"
        style={{
          position: 'fixed',
          left: 8,
          top: 8,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 8,
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 700,
          border: `1px solid ${enabled ? psColor : BORDER}`,
          backgroundColor: BG,
          color: enabled ? psColor : DIM,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
          letterSpacing: '0.05em',
        }}
      >
        ⚙ {enabled ? (paused ? '⏸' : '▶') : '—'} {enabled ? psColor === CYAN ? 'AI' : 'AI' : 'AI'}
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        top: 8,
        zIndex: 9999,
        backgroundColor: BG,
        border: `1px solid ${enabled ? psColor : BORDER}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontFamily: MONO,
        fontSize: 11,
        color: '#e0e0e0',
        minWidth: 240,
        maxWidth: 280,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        boxShadow: enabled ? `0 0 18px ${psColor}28` : '0 2px 12px rgba(0,0,0,0.6)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        userSelect: 'none',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: enabled ? psColor : DIM, fontSize: 10, letterSpacing: '0.1em' }}>
          ⚙ AI AUTO-PLAY
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Pause button — only shown when AI is enabled */}
          {enabled && (
            <button
              onClick={onTogglePause}
              title={paused ? 'Resume AI' : 'Pause AI (hover cards to inspect effects)'}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: `1px solid ${paused ? '#ffe600' : '#3a3a5a'}`,
                backgroundColor: paused ? '#ffe60020' : 'transparent',
                color: paused ? '#ffe600' : DIM,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {paused ? '▶' : '⏸'}
            </button>
          )}
          <button
            onClick={onToggle}
            style={{
              padding: '2px 10px',
              borderRadius: 4,
              border: `1px solid ${enabled ? psColor : '#3a3a5a'}`,
              backgroundColor: enabled ? `${psColor}18` : 'transparent',
              color: enabled ? psColor : DIM,
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
          {/* Minimize button — always shown */}
          <button
            onClick={toggleMinimized}
            title="Minimise panel"
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              border: '1px solid #3a3a5a',
              backgroundColor: 'transparent',
              color: DIM,
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            _
          </button>
        </div>
      </div>

      {/* ── Status ── */}
      <div style={{
        color: enabled ? '#e0e0e0' : '#444',
        marginBottom: 8,
        fontSize: 10,
        minHeight: 14,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {paused && enabled ? '⏸ PAUSED — hover cards to inspect' : status}
      </div>

      {/* ── Live run stats ── */}
      <div style={{
        marginBottom: 8,
        padding: '5px 6px',
        borderRadius: 5,
        border: `1px solid ${watchdogColor}33`,
        backgroundColor: `${watchdogColor}10`,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 2,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: watchdogColor }}>
            WATCHDOG
          </span>
          <span style={{ fontSize: 8, color: watchdogColor, fontWeight: 700 }}>
            {watchdogState}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 9 }}>
          <span style={{ color: '#e0e0e0' }}>stuck {stagnantLabel}</span>
          <span style={{ color: DIM }}>export / recover {thresholdLabel}</span>
        </div>
      </div>

      {currentState?.run && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto 1fr',
          gap: '2px 6px',
          marginBottom: 8,
          padding: '4px 6px',
          borderRadius: 4,
          border: `1px solid ${BORDER}`,
          fontSize: 10,
          alignItems: 'center',
        }}>
          <span style={{ color: DIM }}>deck</span>
          <span style={{ color: '#e0e0e0', fontWeight: 700, textAlign: 'right' }}>
            {currentState.deck?.master?.length ?? '—'}
          </span>
          <span style={{ color: DIM }}>gold</span>
          <span style={{ color: YELLOW, fontWeight: 700, textAlign: 'right' }}>
            {currentState.run.gold ?? '—'}
          </span>
          <span style={{ color: DIM }}>muts</span>
          <span style={{ color: '#ff66cc', fontWeight: 700, textAlign: 'right' }}>
            {totalMutations}
          </span>
          <span style={{ color: DIM }}>patches</span>
          <span style={{ color: '#ff9944', fontWeight: 700, textAlign: 'right' }}>
            {patchActivations}
          </span>
        </div>
      )}

      {/* ── Run counter ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 10 }}>
        <span style={{ color: DIM }}>Runs completed</span>
        <span style={{ color: YELLOW, fontWeight: 700 }}>{runCount}</span>
      </div>

      {/* ── Playstyle selector ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: psColor, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 5 }}>
          PLAYSTYLE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {Object.entries(AI_PLAYSTYLES).map(([key, ps]) => {
            const active = aiPlaystyle === key;
            const col = PLAYSTYLE_COLORS[key] || CYAN;
            return (
              <button
                key={key}
                onClick={() => onPlaystyleChange(key)}
                style={{
                  padding: '3px 5px',
                  borderRadius: 4,
                  border: `1px solid ${active ? col : BORDER}`,
                  backgroundColor: active ? `${col}18` : 'transparent',
                  color: active ? col : DIM,
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  letterSpacing: '0.03em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={ps.label}
              >
                {active ? '▶ ' : ''}{ps.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Speed slider ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 10, color: DIM }}>
          <span>Fast</span>
          <span style={{ color: '#e0e0e0' }}>{speed} ms</span>
          <span>Slow</span>
        </div>
        <input
          type="range"
          min={150}
          max={1500}
          step={50}
          value={speed}
          onChange={e => onSpeedChange(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer', accentColor: CYAN, display: 'block' }}
        />
      </div>

      {/* ── Debug Seed section (collapsible) ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginBottom: seedOpen ? 10 : 0 }}>
        <button
          onClick={() => setSeedOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginBottom: seedOpen ? 6 : 0,
            fontSize: 9, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.08em',
            color: seedNum !== null ? (seedMode === 'sensible' ? GREEN : CYAN) : DIM,
          }}
        >
          <span>DEBUG SEED {seedNum !== null ? `· #${seedNum} · ${seedMode}` : '(none)'}</span>
          <span>{seedOpen ? '▲' : '▼'}</span>
        </button>
      </div>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: ORANGE, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
          TAKEOVER
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <select
            value={stopAtAct ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              onStopAtActChange?.(raw === '' ? null : Number(raw));
            }}
            style={{
              flex: 1,
              backgroundColor: '#0a0a14',
              color: stopAtAct ? ORANGE : DIM,
              border: `1px solid ${stopAtAct ? ORANGE : BORDER}`,
              borderRadius: 4,
              padding: '4px 6px',
              fontFamily: MONO,
              fontSize: 9,
              cursor: 'pointer',
            }}
          >
            <option value="">No act stop</option>
            <option value="1">Take over at Act 1</option>
            <option value="2">Take over at Act 2</option>
            <option value="3">Take over at Act 3</option>
          </select>
          <button
            onClick={() => onStopAfterCombatChange?.(!stopAfterCombat)}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: `1px solid ${stopAfterCombat ? ORANGE : BORDER}`,
              backgroundColor: stopAfterCombat ? `${ORANGE}18` : 'transparent',
              color: stopAfterCombat ? ORANGE : DIM,
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {stopAfterCombat ? 'AFTER COMBAT: ARMED' : 'AFTER COMBAT'}
          </button>
        </div>
        <button
          onClick={onTakeOverNow}
          disabled={!enabled}
          style={{
            width: '100%',
            padding: '5px 0',
            borderRadius: 5,
            border: `1px solid ${enabled ? ORANGE : BORDER}`,
            backgroundColor: enabled ? `${ORANGE}15` : 'transparent',
            color: enabled ? ORANGE : '#444',
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 700,
            cursor: enabled ? 'pointer' : 'default',
            letterSpacing: '0.05em',
          }}
        >
          TAKE OVER NOW
        </button>
        {handoffReason && !enabled && (
          <div style={{ marginTop: 6, fontSize: 9, color: ORANGE, lineHeight: 1.5 }}>
            {visibleStatus}
          </div>
        )}
      </div>

      {seedOpen && <div style={{ marginBottom: 10 }}>

        {/* Preset selector */}
        <select
          value={presetKey}
          onChange={handlePresetChange}
          style={{
            width: '100%',
            backgroundColor: '#0a0a14',
            color: presetKey ? '#e0e0e0' : DIM,
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            padding: '3px 5px',
            fontFamily: MONO,
            fontSize: 9,
            marginBottom: 5,
            cursor: 'pointer',
          }}
        >
          <option value="">— preset —</option>
          {Object.keys(DEBUG_PRESETS).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        {/* Manual seed input + wild roll button */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input
            type="number"
            value={debugSeed}
            onChange={handleSeedInput}
            placeholder="seed integer…"
            style={inputStyle}
          />
          <button
            onClick={onRandomizeSeed}
            title="Roll a wild random seed (full extreme ranges)"
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              border: `1px solid ${seedMode === 'wild' && seedNum !== null ? CYAN : BORDER}`,
              backgroundColor: seedMode === 'wild' && seedNum !== null ? `${CYAN}18` : 'transparent',
              color: seedMode === 'wild' && seedNum !== null ? CYAN : '#e0e0e0',
              fontFamily: MONO,
              fontSize: 12,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ⟳
          </button>
        </div>

        {/* Sensible roll button */}
        <button
          onClick={onRandomizeSensibleSeed}
          title="Roll a sensible seed (balanced for 5-15 round combats)"
          style={{
            width: '100%',
            padding: '3px 0',
            borderRadius: 4,
            border: `1px solid ${seedMode === 'sensible' && seedNum !== null ? GREEN : BORDER}`,
            backgroundColor: seedMode === 'sensible' && seedNum !== null ? `${GREEN}18` : 'transparent',
            color: seedMode === 'sensible' && seedNum !== null ? GREEN : DIM,
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            marginBottom: 5,
          }}
        >
          ⟳ sensible
        </button>

        {/* Randomize-each-run toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: randomize ? (seedMode === 'sensible' ? GREEN : CYAN) : DIM, cursor: 'pointer', marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={randomize}
            onChange={e => onRandomizeToggle(e.target.checked)}
            style={{ accentColor: seedMode === 'sensible' ? GREEN : CYAN, cursor: 'pointer' }}
          />
          Randomize each run
        </label>

        {/* Decoded variable display */}
        {decoded && (
          <div style={{
            backgroundColor: '#080812',
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 9,
            color: seedMode === 'sensible' ? GREEN : YELLOW,
            lineHeight: 1.6,
            wordBreak: 'break-word',
          }}>
            {description === 'All defaults'
              ? <span style={{ color: DIM }}>All defaults</span>
              : description}
          </div>
        )}
        {seedNum === null && (
          <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>
            No overrides — standard game
          </div>
        )}
      </div>}

      {/* ══════════════════════════════════════════════════════════
          ── Custom Start Config section (collapsible) ──
          ══════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginBottom: customOpen ? 8 : 0 }}>
        <button
          onClick={() => setCustomOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginBottom: customOpen ? 6 : 0,
            fontSize: 9, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.08em',
            color: activeCustomCount > 0 ? ORANGE : DIM,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            CUSTOM START
            {activeCustomCount > 0 && (
              <span style={{
                padding: '0px 5px',
                borderRadius: 3,
                backgroundColor: `${ORANGE}28`,
                border: `1px solid ${ORANGE}88`,
                fontSize: 8,
                color: ORANGE,
                fontWeight: 700,
                lineHeight: 1.6,
              }}>
                {activeCustomCount}
              </span>
            )}
            {lockedFields.size > 0 && (
              <span style={{
                padding: '0px 4px',
                borderRadius: 3,
                backgroundColor: `${ORANGE}15`,
                border: `1px solid ${ORANGE}55`,
                fontSize: 8,
                color: ORANGE,
                lineHeight: 1.6,
              }}>
                ■ {lockedFields.size}
              </span>
            )}
          </span>
          <span>{customOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {customOpen && (
        <div style={{ marginBottom: 10 }}>

          {/* ── Hint ── */}
          <div style={{ fontSize: 8, color: '#444', marginBottom: 6, lineHeight: 1.5 }}>
            ■ locked = always wins over seed · □ unlocked = seed can override
          </div>

          {/* ── Numeric + select field rows ── */}
          {CUSTOM_FIELDS.map(({ key, label, type, min, max, step, placeholder, options }) => {
            const val    = customConfig[key] ?? null;
            const locked = lockedFields.has(key);
            const hasVal = val !== null && val !== undefined;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                {/* Label */}
                <span style={{
                  width: 62, fontSize: 9,
                  color: hasVal ? '#c0c0d0' : '#505060',
                  flexShrink: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {label}
                </span>

                {/* Input or Select */}
                {type === 'select' ? (
                  <select
                    value={val ?? ''}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { onSetCustomField?.(key, null); return; }
                      const num = Number(raw);
                      onSetCustomField?.(key, isNaN(num) ? raw : num);
                    }}
                    style={fieldInputStyle(hasVal)}
                  >
                    {options.map(({ v, l }) => (
                      <option key={String(v)} value={v ?? ''}>{l}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={val ?? ''}
                    min={min}
                    max={max}
                    step={step}
                    placeholder={placeholder}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { onSetCustomField?.(key, null); return; }
                      const num = parseFloat(raw);
                      onSetCustomField?.(key, isNaN(num) ? null : num);
                    }}
                    style={fieldInputStyle(hasVal)}
                  />
                )}

                {/* Lock toggle */}
                <button
                  onClick={() => onToggleLock?.(key)}
                  title={locked ? `Unlock ${label} — will clear on random seeds` : `Lock ${label} — persists through random seeds`}
                  style={lockBtnStyle(locked)}
                >
                  {locked ? '■' : '□'}
                </button>
              </div>
            );
          })}

          {/* ── Starting Cards sub-section ── */}
          <div style={{ marginTop: 8, borderTop: `1px solid ${BORDER}`, paddingTop: 6 }}>

            {/* Sub-header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                color: selectedCardIds.length > 0 ? CYAN : DIM,
              }}>
                STARTING CARDS{selectedCardIds.length > 0 ? ` (${selectedCardIds.length})` : ''}
              </span>
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {/* Lock toggle for card list */}
                <button
                  onClick={() => onToggleLock?.('startingCardIds')}
                  title={lockedFields.has('startingCardIds') ? 'Unlock card list' : 'Lock card list — persists through random seeds'}
                  style={lockBtnStyle(lockedFields.has('startingCardIds'))}
                >
                  {lockedFields.has('startingCardIds') ? '■' : '□'}
                </button>
                {/* Clear card selection */}
                {selectedCardIds.length > 0 && (
                  <button
                    onClick={() => onSetCustomField?.('startingCardIds', null)}
                    title="Clear card selection"
                    style={{
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid #3a1a1a',
                      backgroundColor: 'transparent',
                      color: '#ff4433',
                      fontFamily: MONO,
                      fontSize: 9,
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                )}
                {/* Show/hide card picker */}
                <button
                  onClick={() => setShowCardPicker(v => !v)}
                  style={{
                    padding: '1px 6px',
                    borderRadius: 3,
                    border: `1px solid ${showCardPicker ? CYAN : BORDER}`,
                    backgroundColor: showCardPicker ? `${CYAN}15` : 'transparent',
                    color: showCardPicker ? CYAN : DIM,
                    fontFamily: MONO,
                    fontSize: 9,
                    cursor: 'pointer',
                  }}
                >
                  {showCardPicker ? '▲' : '▼ pick'}
                </button>
              </div>
            </div>

            {/* Selected card chips */}
            {uniqueSelected.length > 0 && (
              <div style={{ marginBottom: showCardPicker ? 6 : 0 }}>
                {uniqueSelected.map(id => {
                  const def    = gameData?.cards?.[id];
                  const name   = def?.name ?? id;
                  const count  = selectedCounts[id];
                  const typCol = TYPE_COLORS[def?.type] ?? DIM;
                  return (
                    <div key={id} style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      marginBottom: 2,
                      backgroundColor: '#0a0a14',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 3,
                      padding: '2px 4px',
                    }}>
                      <span style={{ color: typCol, fontSize: 8, flexShrink: 0 }}>●</span>
                      <span style={{
                        flex: 1, fontSize: 9, color: '#e0e0e0',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {name}
                      </span>
                      <button
                        onClick={() => removeOneCard(id)}
                        title="Remove one copy"
                        style={{ ...MINI_BTN, color: '#ff4433' }}
                      >−</button>
                      <span style={{
                        color: YELLOW, fontWeight: 700,
                        minWidth: 14, textAlign: 'center', fontSize: 9, flexShrink: 0,
                      }}>
                        {count}
                      </span>
                      <button
                        onClick={() => addCard(id)}
                        title="Add one more copy"
                        style={{ ...MINI_BTN, color: GREEN }}
                      >+</button>
                      <button
                        onClick={() => removeAllCard(id)}
                        title="Remove all copies"
                        style={{ ...MINI_BTN, color: '#555', marginLeft: 1 }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Card picker dropdown */}
            {showCardPicker && (
              <div>
                {/* Search filter */}
                <input
                  type="text"
                  value={cardFilter}
                  onChange={e => setCardFilter(e.target.value)}
                  placeholder="search by name or ID…"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#0a0a14',
                    color: '#e0e0e0',
                    border: `1px solid ${cardFilter ? CYAN : BORDER}`,
                    borderRadius: 4,
                    padding: '3px 5px',
                    fontFamily: MONO,
                    fontSize: 9,
                    outline: 'none',
                    marginBottom: 4,
                  }}
                />

                {/* Card list */}
                <div style={{
                  maxHeight: 160,
                  overflowY: 'auto',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 4,
                  backgroundColor: '#080812',
                }}>
                  {filteredCards.length === 0 ? (
                    <div style={{ padding: '6px 8px', fontSize: 9, color: DIM, fontStyle: 'italic' }}>
                      No cards match
                    </div>
                  ) : (
                    filteredCards.map(([id, def]) => {
                      const typCol    = TYPE_COLORS[def?.type] ?? DIM;
                      const inSel     = (selectedCounts[id] ?? 0) > 0;
                      const costLabel = def?.cost !== undefined ? `${def.cost}▲` : '';
                      return (
                        <div
                          key={id}
                          onClick={() => addCard(id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 6px',
                            cursor: 'pointer',
                            borderBottom: `1px solid #12121f`,
                            backgroundColor: inSel ? '#0c180c' : 'transparent',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = inSel ? '#0e220e' : '#0d0d1e'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = inSel ? '#0c180c' : 'transparent'; }}
                        >
                          <span style={{ color: typCol, fontSize: 7, flexShrink: 0 }}>●</span>
                          <span style={{
                            flex: 1, fontSize: 9, color: '#d8d8e8',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {def?.name ?? id}
                          </span>
                          {costLabel && (
                            <span style={{ fontSize: 8, color: CYAN, flexShrink: 0 }}>{costLabel}</span>
                          )}
                          {inSel && (
                            <span style={{ fontSize: 8, color: YELLOW, fontWeight: 700, flexShrink: 0 }}>
                              ×{selectedCounts[id]}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Card count hint */}
                <div style={{ fontSize: 8, color: '#384', marginTop: 3, textAlign: 'right' }}>
                  {filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''} · click to add
                </div>
              </div>
            )}
          </div>

          {/* ── Clear all overrides button ── */}
          {activeCustomCount > 0 && (
            <button
              onClick={onClearCustomConfig}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '3px 0',
                borderRadius: 4,
                border: '1px solid #3a1a1a',
                backgroundColor: '#160808',
                color: '#ff4433',
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              ✕ CLEAR ALL OVERRIDES
            </button>
          )}
        </div>
      )}

      {/* ── Save folder picker ── */}
      <div style={{ marginBottom: 4 }}>
        <button
          onClick={onSetSaveDir}
          style={{
            width: '100%',
            padding: '4px 0',
            borderRadius: 5,
            border: `1px solid ${saveDirName ? GREEN : BORDER}`,
            backgroundColor: saveDirName ? `${GREEN}12` : 'transparent',
            color: saveDirName ? GREEN : DIM,
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          📁 {saveDirName ? `→ ${saveDirName}` : 'SET SAVE FOLDER'}
        </button>
        {!saveDirName && (
          <div style={{ color: '#555', fontSize: 9, textAlign: 'center', marginTop: 2 }}>
            auto-exports go to Downloads until set
          </div>
        )}
      </div>

      {/* ── Export contents ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginBottom: exportOpen ? 8 : 6 }}>
        <button
          onClick={() => setExportOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginBottom: exportOpen ? 6 : 0,
            fontSize: 9, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.08em',
            color: enabledExportCount === EXPORT_TRACK_OPTIONS.length ? CYAN : enabledExportCount > 0 ? YELLOW : DIM,
          }}
        >
          <span>EXPORT CONTENTS · {enabledExportCount}/{EXPORT_TRACK_OPTIONS.length}</span>
          <span>{exportOpen ? '▲' : '▼'}</span>
        </button>
      </div>
      {exportOpen && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button
              onClick={() => onSetAllExportOptions?.(true)}
              style={{
                flex: 1,
                padding: '3px 0',
                borderRadius: 4,
                border: `1px solid ${CYAN}55`,
                backgroundColor: `${CYAN}14`,
                color: CYAN,
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              TRACK ALL
            </button>
            <button
              onClick={() => onSetAllExportOptions?.(false)}
              style={{
                flex: 1,
                padding: '3px 0',
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
                backgroundColor: 'transparent',
                color: DIM,
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              SUMMARY ONLY
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {EXPORT_TRACK_OPTIONS.map(({ key, label, hint }) => (
              <label
                key={key}
                title={hint}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: `1px solid ${exportOptions[key] ? `${CYAN}35` : BORDER}`,
                  backgroundColor: exportOptions[key] ? `${CYAN}10` : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!exportOptions[key]}
                  onChange={e => onSetExportOption?.(key, e.target.checked)}
                  style={{ accentColor: CYAN, cursor: 'pointer' }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: exportOptions[key] ? '#e0e0e0' : DIM, fontWeight: 700 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 8, color: '#555', lineHeight: 1.4 }}>
                    {hint}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Export button ── */}
      <button
        onClick={onExportCurrent}
        disabled={!currentState?.run}
        style={{
          width: '100%',
          padding: '5px 0',
          borderRadius: 5,
          border: `1px solid ${currentState?.run ? ORANGE : BORDER}`,
          backgroundColor: currentState?.run ? `${ORANGE}15` : 'transparent',
          color: currentState?.run ? ORANGE : '#444',
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 700,
          cursor: currentState?.run ? 'pointer' : 'default',
          letterSpacing: '0.05em',
          marginBottom: 6,
        }}
      >
        â¬‡ EXPORT CURRENT GAME
      </button>

      <button
        onClick={onExport}
        disabled={runCount === 0}
        style={{
          width: '100%',
          padding: '5px 0',
          borderRadius: 5,
          border: `1px solid ${runCount > 0 ? psColor : BORDER}`,
          backgroundColor: runCount > 0 ? `${psColor}15` : 'transparent',
          color: runCount > 0 ? psColor : '#444',
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 700,
          cursor: runCount > 0 ? 'pointer' : 'default',
          letterSpacing: '0.05em',
        }}
      >
        ⬇ EXPORT DATA ({runCount} runs · {enabledExportCount}/{EXPORT_TRACK_OPTIONS.length})
      </button>
    </div>
  );
}
