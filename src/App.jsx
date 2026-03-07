import { useState, useEffect, useRef } from 'react';
import { loadGameData } from './data/loadData';
import { createInitialState, dispatchGame } from './game/game_core';
import { dispatchWithJournal } from './game/dispatch_with_journal';
import CombatScreen from './components/CombatScreen';
import AIDebugPanel from './components/AIDebugPanel';
import { getAIAction, AI_PLAYSTYLES } from './game/aiPlayer';
import { decodeDebugSeed, decodeSensibleDebugSeed, randomDebugSeed } from './game/debugSeed';
import { createBasicEventRegistry } from './game/events';
import { MINIGAME_REGISTRY, isMinigameEvent } from './game/minigames';
import { sfx } from './game/sounds';
import { getEventImage } from './data/eventImages';

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
  const MONO    = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const nodeList = Object.values(nodes);

  // Detour edge lookup (amber dashed lines)
  const detourSet = new Set((state.map?.detourEdges || []).map(([f, t]) => `${f}-${t}`));

  // Collect edges
  const edges = [];
  for (const node of nodeList) {
    for (const toId of (node.next || [])) {
      if (nodes[toId]) edges.push({ from: node, to: nodes[toId] });
    }
  }

  return (
    <ScreenShell>
      <RunHeader run={state.run} data={data} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 8px 0', overflowY: 'auto' }}>

        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', marginBottom: 4, marginTop: 4 }}>
          ACT {state.run?.act} — CHOOSE YOUR PATH
        </div>

        {/* ── SVG Map ─────────────────────────────────────── */}
        <svg width="100%" viewBox={`0 0 ${SVG_MAP_W} ${SVG_MAP_H}`} style={{ maxWidth: 340, display: 'block' }}>
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

            if (isDetour) {
              // Amber dashed detour lines — sideways or backward cross-paths
              return (
                <line
                  key={`${from.id}-${to.id}`}
                  x1={mapNX(from.x)} y1={mapNY(from.y)}
                  x2={mapNX(to.x)}   y2={mapNY(to.y)}
                  stroke={isTraversed ? '#FFAA0040' : isHot ? '#FFCC44' : '#FFAA0088'}
                  strokeWidth={isTraversed ? 1.5 : isHot ? 2 : 1.5}
                  strokeDasharray={isTraversed ? 'none' : '5 3'}
                  filter={isHot ? 'url(#mglow-sm)' : undefined}
                />
              );
            }

            return (
              <line
                key={`${from.id}-${to.id}`}
                x1={mapNX(from.x)} y1={mapNY(from.y)}
                x2={mapNX(to.x)}   y2={mapNY(to.y)}
                stroke={isTraversed ? `${C.cyan}70` : isHot ? `${C.cyan}cc` : `${C.cyan}28`}
                strokeWidth={isTraversed ? 2 : isHot ? 2 : 1.5}
                strokeDasharray={isTraversed || isHot ? 'none' : '5 4'}
                filter={isHot ? 'url(#mglow-sm)' : undefined}
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
            const col  = NODE_COLORS[node.type] || '#888';
            const ico  = NODE_ICONS[node.type]  || '?';
            const R    = isCur ? 23 : isSel ? 21 : 17;

            return (
              <g key={node.id}
                onClick={() => isSel && onAction({ type: 'SelectNextNode', nodeId: node.id })}
                style={{ cursor: isSel ? 'pointer' : 'default' }}
              >
                {/* Outer glow ring */}
                {(isCur || isSel) && (
                  <circle cx={cx} cy={cy} r={R + (isCur ? 10 : 7)}
                    fill={`${col}${isCur ? '10' : '08'}`}
                    stroke={`${col}${isCur ? '40' : '50'}`}
                    strokeWidth={1.5}
                  />
                )}
                {/* Main circle */}
                <circle cx={cx} cy={cy} r={R}
                  fill={isCur ? `${col}28` : isSel ? `${col}18` : isDone ? '#131320' : '#0b0b12'}
                  stroke={isCur ? col : isSel ? `${col}90` : isDone ? `${col}35` : '#202030'}
                  strokeWidth={isCur ? 2.5 : isSel ? 2 : 1}
                  filter={isCur ? 'url(#mglow)' : isSel ? 'url(#mglow-sm)' : 'none'}
                />
                {/* Icon */}
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                  fontSize={isCur ? 15 : isSel ? 14 : isDone ? 11 : 12}
                  fill={isDone ? `${col}40` : isCur || isSel ? col : `${col}55`}
                  fontFamily="Arial, sans-serif"
                >
                  {isDone ? '✓' : ico}
                </text>
                {/* Type label */}
                {(isCur || isSel || isDone) && (
                  <text x={cx} y={cy + R + 13} textAnchor="middle"
                    fontSize={8}
                    fill={isCur ? col : isSel ? `${col}cc` : `${col}44`}
                    fontFamily="JetBrains Mono, monospace"
                    letterSpacing="0.3"
                  >
                    {node.type.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Quick-tap node buttons */}
        {selNext.length > 0 && (
          <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px', marginTop: 4 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: '0.12em', marginBottom: 2 }}>
              MOVE TO
            </div>
            {selNext.map(nodeId => {
              const node  = nodes[nodeId];
              const color = NODE_COLORS[node?.type] || '#888';
              const icon  = NODE_ICONS[node?.type]  || '·';
              const desc  = NODE_TYPE_DESCS[node?.type] || '';
              return (
                <button key={nodeId}
                  onClick={() => onAction({ type: 'SelectNextNode', nodeId })}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: '12px',
                    fontFamily: MONO, textAlign: 'left', transition: 'all 0.15s',
                    backgroundColor: `${color}0c`,
                    border: `2px solid ${color}55`,
                    boxShadow: `0 0 14px ${color}12`,
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
                    <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{desc}</div>
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
          className="safe-area-bottom"
          style={{
            width: '100%', maxWidth: 340,
            padding: '12px', borderRadius: '12px',
            fontFamily: MONO, textAlign: 'center',
            transition: 'all 0.15s',
            backgroundColor: C.bgCard, border: `1px solid ${C.cyan}30`,
            color: C.cyan, fontSize: 12, cursor: 'pointer',
            margin: '12px 4px 8px',
          }}
        >
          📋 View Deck ({state.deck?.master?.length || 0} cards)
        </button>
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
          <div style={{ fontFamily: MONO, color: C.textMuted, fontSize: 12 }}>
            {hasRelics ? 'Select a relic — then choose a card' : 'Select a card reward'}
          </div>
        </div>

        {/* Relic choices (shown above card choices when available) */}
        {hasRelics && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.yellow, letterSpacing: '0.1em', marginBottom: '8px', textAlign: 'center' }}>
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
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, opacity: 0.7, textTransform: 'uppercase' }}>
                        [{tier}]
                      </span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                      {relic?.description || ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Card choices */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {choices.map(defId => {
            const card = data.cards?.[defId];
            const typeColors = { Attack: C.red, Skill: C.green, Power: C.purple, Defense: C.cyan, Support: C.green, Utility: C.yellow };
            const color = typeColors[card?.type] || C.cyan;
            const cost = card?.costRAM || 0;

            return (
              <button
                key={defId}
                onClick={() => onAction({ type: 'Reward_PickCard', defId })}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  backgroundColor: C.bgCard,
                  border: `2px solid ${color}40`,
                  boxShadow: `0 0 16px ${color}10`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Cost badge */}
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                      fontWeight: 700,
                      flexShrink: 0,
                      backgroundColor: color,
                      color: '#000',
                      fontSize: 14,
                    }}
                  >
                    {cost}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontWeight: 700, color, fontSize: 14 }}>
                        {card?.name || defId}
                      </span>
                      {/* Tag chips */}
                      {(card?.tags || []).filter(t => ['Power','OneShot','Volatile','Exhaust'].includes(t)).map(t => (
                        <span key={t} style={{
                          fontSize: 9, fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                          padding: '1px 5px', borderRadius: 4, fontWeight: 700,
                          backgroundColor: t === 'Power' ? `${C.purple}25` : `${color}15`,
                          color: t === 'Power' ? C.purple : color,
                          border: `1px solid ${t === 'Power' ? C.purple : color}40`,
                        }}>{t === 'Power' ? 'PWR' : t.toUpperCase()}</span>
                      ))}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginTop: '2px', color: C.textDim, fontSize: 11 }}>
                      {card?.type}
                    </div>
                    {card?.effects && (
                      <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", marginTop: '4px', color: C.textMuted, fontSize: 10 }}>
                        {card.effects.map(e => {
                          if (e.op === 'DealDamage') return `Deal ${e.amount} damage`;
                          if (e.op === 'GainBlock') return `Gain ${e.amount} Block`;
                          if (e.op === 'Heal') return `Heal ${e.amount}`;
                          if (e.op === 'DrawCards') return `Draw ${e.amount}`;
                          if (e.op === 'RawText') return e.text;
                          return e.op;
                        }).join(' \u00B7 ')}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Skip button */}
        <button
          onClick={() => onAction({ type: 'Reward_Skip' })}
          className="safe-area-bottom"
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            marginTop: '16px',
            transition: 'all 0.15s ease',
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            fontSize: 13,
            cursor: 'pointer',
          }}
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
    if (e.op === 'GainBlock')   return `+${e.amount} Block`;
    if (e.op === 'Heal')        return `Heal ${e.amount} HP`;
    if (e.op === 'DrawCards')   return `Draw ${e.amount}`;
    if (e.op === 'GainRAM')     return `+${e.amount} RAM`;
    if (e.op === 'ApplyStatus') return `Apply ${e.statusId}×${e.stacks}`;
    if (e.op === 'RawText')     return e.text;
    return e.op;
  }).join(' · ');
}

function ShopScreen({ state, data, onAction }) {
  const offers = state.shop?.offers || [];
  const gold = state.run?.gold || 0;
  const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const typeColors = { Attack: C.red, Skill: C.green, Power: C.purple, Defense: C.cyan, Support: C.green, Utility: C.yellow };

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
          <span style={{ fontFamily: MONO, color: C.textMuted, fontSize: 11 }}>
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
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
              CARDS FOR SALE
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {offers.map((offer, i) => {
                if (offer.kind !== 'Card') return null;
                const card = data.cards?.[offer.defId];
                const canAfford = gold >= offer.price;
                const color = typeColors[card?.type] || C.cyan;
                const fx = describeEffects(card?.effects);
                return (
                  <button
                    key={i}
                    onClick={() => canAfford && onAction({ type: 'Shop_BuyOffer', index: i })}
                    disabled={!canAfford}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '12px',
                      textAlign: 'left', transition: 'all 0.2s ease',
                      opacity: !canAfford ? 0.45 : 1,
                      backgroundColor: canAfford ? `${color}08` : C.bgCard,
                      border: `2px solid ${canAfford ? `${color}50` : C.border}`,
                      boxShadow: canAfford ? `0 0 16px ${color}10` : 'none',
                      cursor: canAfford ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      {/* RAM cost badge */}
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: MONO, fontWeight: 700, fontSize: 13,
                        backgroundColor: color, color: '#000',
                      }}>
                        {card?.costRAM ?? '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: MONO, fontWeight: 700, color: canAfford ? color : C.textMuted, fontSize: 14 }}>
                            {card?.name || offer.defId}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {card?.type}
                          </span>
                        </div>
                        {fx && (
                          <div style={{ fontFamily: MONO, marginTop: 3, color: C.textDim, fontSize: 11 }}>
                            {fx}
                          </div>
                        )}
                        {card?.tags?.length > 0 && (
                          <div style={{ fontFamily: MONO, marginTop: 3, color: C.textMuted, fontSize: 10 }}>
                            {card.tags.filter(t => t !== 'Core' && t !== 'EnemyCard').map(t => (
                              <span key={t} style={{ background: `${C.purple}18`, borderRadius: 4, padding: '1px 5px', marginRight: 4 }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{
                        padding: '4px 10px', borderRadius: '8px',
                        fontFamily: MONO, fontWeight: 700,
                        backgroundColor: canAfford ? `${C.yellow}18` : 'transparent',
                        border: `1px solid ${canAfford ? `${C.yellow}50` : C.border}`,
                        color: canAfford ? C.yellow : C.textMuted, fontSize: 13,
                        flexShrink: 0, alignSelf: 'center',
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

        {/* Services section */}
        {offers.some(o => o.kind === 'Service') && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
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
                        <div style={{ fontFamily: MONO, marginTop: 2, color: C.textMuted, fontSize: 11 }}>
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
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: '0.1em', marginBottom: '10px' }}>
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
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            [{tier}]
                          </span>
                        </div>
                        <div style={{ fontFamily: MONO, marginTop: 2, color: C.textMuted, fontSize: 11 }}>
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
          style={{
            flex: 1, padding: '14px', borderRadius: '12px',
            fontFamily: MONO, transition: 'all 0.15s ease',
            backgroundColor: C.bgCard, border: `1px solid ${C.border}`,
            color: C.textMuted, fontSize: 13, cursor: 'pointer',
          }}
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
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                textAlign: 'center',
                marginTop: '8px',
                transition: 'all 0.15s ease',
                backgroundColor: C.bgCard,
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                fontSize: 12,
                cursor: 'pointer',
              }}
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
                style={{
                  width: '100%', padding: isLeave ? '12px 16px' : '14px 16px',
                  borderRadius: '12px', textAlign: 'left',
                  fontFamily: MONO, fontWeight: isLeave ? 400 : 600,
                  fontSize: isLeave ? 12 : 13,
                  transition: 'all 0.15s ease',
                  backgroundColor: isLeave ? 'transparent' : `${col}10`,
                  border: `${isLeave ? 1 : 2}px solid ${isLeave ? C.border : `${col}50`}`,
                  boxShadow: isLeave ? 'none' : `0 0 12px ${col}0a`,
                  color: isLeave ? C.textMuted : col,
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
  if (!dv) return null;

  const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
  const pendingOp = state.event?.pendingSelectOp || state.shop?.pendingService;
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

  const canCancel = !pendingOp; // Can only cancel if just viewing deck, not mid-op

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backgroundColor: 'rgba(0,0,0,0.88)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div className="safe-area-top" style={{
        padding: '16px',
        backgroundColor: C.bgBar,
        borderBottom: `1px solid ${opInfo.color}40`,
      }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: opInfo.color, marginBottom: 4 }}>
          {opInfo.label}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}>
          {opInfo.desc}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 6 }}>
          {cards.length} card{cards.length !== 1 ? 's' : ''} in deck
        </div>
      </div>

      {/* Card list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {cards.map(({ iid, ci, def }) => {
          const color = typeColors[def.type] || C.text;
          const useRatio = def.defaultUseCounter ? ci.useCounter / def.defaultUseCounter : null;
          const worn = useRatio !== null && useRatio < 0.35;
          const mutated     = !!ci.finalMutationId;
          const isRewritten = ci.finalMutationId === 'J_REWRITE';
          const isBricked   = ci.finalMutationId === 'J_BRICK';
          const activeMuts  = ci.appliedMutations || [];
          const hasMutation = activeMuts.length > 0;   // fixed: was ci.mutationId
          const decaying    = !mutated && ci.finalMutationCountdown != null && ci.finalMutationCountdown <= 5;

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
                    {useRatio !== null && !mutated && (
                      <span style={{ marginLeft: 8, color: worn ? C.orange : C.textDim }}>
                        {ci.useCounter} until mut
                      </span>
                    )}
                    {ci.finalMutationCountdown != null && !mutated && (
                      <span style={{ marginLeft: 8, color: decaying ? C.orange : C.textDim }}>
                        · final in {ci.finalMutationCountdown}
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
          onClick={() => onAction({ type: 'CloseDeck' })}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            fontFamily: MONO, fontSize: 13,
            backgroundColor: C.bgCard, border: `1px solid ${C.border}`,
            color: C.textMuted, cursor: 'pointer',
          }}
        >
          {canCancel ? 'Close' : 'Cancel'}
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
function DevButtons({ state, onDevAction, onToggleLog }) {
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

  if (collapsed) {
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
    <div style={{ position: 'fixed', bottom: '80px', right: '8px', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: 100 }}>
      <button
        onClick={() => setCollapsed(true)}
        style={{ ...devBtnStyle, alignSelf: 'flex-start', backgroundColor: '#333', color: '#f66' }}
      >
        {'\u2715'} Close
      </button>
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

  // ── URL params: read from global captured in index.html before React loaded ──
  const _up = (key) => window.__launchParams?.[key] ?? null;

  // ── AI auto-play debug state ──────────────────────────────────────────────
  const [aiEnabled, setAiEnabled]       = useState(() => _up('ai') === 'true');
  const [aiPaused, setAiPaused]         = useState(false);
  const [aiSpeed, setAiSpeed]           = useState(() => {

    const v = parseInt(_up('speed'), 10);
    return (!isNaN(v) && v >= 150 && v <= 1500) ? v : 300;
  });
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
  // ── Per-run accumulator refs (all cleared on GameOver) ───────────────────
  const pendingEncountersRef  = useRef([]);   // finalised combat entries
  const pendingCardEventsRef  = useRef([]);   // reward offers + picks
  const pendingFloorEventsRef = useRef([]);   // rest/shop/event outcomes
  const deckSnapshotsRef      = useRef([]);   // deck state at each floor change
  const lastFloorRef          = useRef(null); // previous floor for change detection

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
    loadGameData()
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (data && !state) {
      startNewRun();
    }
  }, [data]);

  // ── AI effect: fires on every state change when AI is enabled ─────────────
  useEffect(() => {
    if (!aiEnabled || aiPaused || !data || !state) return;

    const timer = setTimeout(() => {
      const mode     = state.mode;
      const prevMode = prevModeRef.current;
      prevModeRef.current = mode;

      // ── Deck snapshot on floor change (run start = first floor seen) ────────
      const curFloor = state.run?.floor ?? null;
      if (curFloor !== null && curFloor !== lastFloorRef.current && state.deck?.master) {
        lastFloorRef.current = curFloor;
        deckSnapshotsRef.current.push({
          act:   state.run.act,
          floor: curFloor,
          cards: state.deck.master.map(cid => state.deck.cardInstances?.[cid]?.defId ?? null),
        });
      }

      // ── Combat ended: finalise encounter entry ───────────────────────────────
      if (prevMode === 'Combat' && mode !== 'Combat' && combatStatsRef.current) {
        const cs = combatStatsRef.current;
        // result captured below when combatOver fires; fall back to state if missed
        if (cs.result === null) cs.result = state.combat?.victory ? 'win' : 'loss';
        cs.hpAfter = state.run?.hp ?? 0;
        const { _lastPlayerHp, _lastEnemyHp, _logOffset, ...encounter } = cs; // strip scratch fields
        pendingEncountersRef.current.push(encounter);
        combatStatsRef.current = null;
      }

      // ── Combat entered: initialise scratch data ──────────────────────────────
      // Guard: skip if enemies haven't loaded yet (avoids phantom enemies:[] entries)
      if (mode === 'Combat' && prevMode !== 'Combat' && (state.combat?.enemies?.length ?? 0) > 0) {
        const initEnemyHp = (state.combat?.enemies || []).reduce((s, e) => s + (e.hp ?? 0), 0);
        combatStatsRef.current = {
          act:                 state.run?.act   ?? 1,
          floor:               state.run?.floor ?? '?',
          enemies:             (state.combat?.enemies || []).map(e => e.enemyDefId).filter(Boolean),
          hpBefore:            state.run?.hp    ?? 0,
          turns:               0,
          result:              null,
          hpAfter:             null,
          totalDamageDealt:    0,
          totalDamageReceived: 0,
          totalCardsPlayed:    0,
          totalRAMSpent:       0,
          mutationEvents:      [],
          // Detailed damage breakdown (populated from DamageDealt log events)
          damageBreakdown: {
            playerDealt: {
              total:          0,  // final HP damage dealt to enemies
              totalBlocked:   0,  // blocked by enemy block
              weakenedHits:   0,  // hits where player had Weak (reduced dmg)
              vulnerableHits: 0,  // hits where enemy had Vulnerable (boosted dmg)
            },
            playerReceived: {
              total:          0,  // final HP damage received by player
              totalBlocked:   0,  // blocked by player's block
              weakenedHits:   0,  // hits where enemy had Weak (reduced enemy dmg)
              vulnerableHits: 0,  // hits where player had Vulnerable (boosted enemy dmg)
            },
          },
          _lastPlayerHp:       state.run?.hp    ?? 0,
          _lastEnemyHp:        initEnemyHp,
          _logOffset:          (state.log ?? []).length,
        };
      }

      // ── Combat active: track damage deltas + capture result when combatOver ──
      if (mode === 'Combat' && state.combat && combatStatsRef.current) {
        const cs = combatStatsRef.current;
        cs.turns = state.combat.turn ?? 0;

        // Fix: capture result here while state.combat is guaranteed non-null
        if (state.combat.combatOver && cs.result === null)
          cs.result = state.combat.victory ? 'win' : 'loss';

        const curPlayerHp = state.run?.hp ?? 0;
        const curEnemyHp  = (state.combat.enemies || []).reduce((s, e) => s + (e.hp ?? 0), 0);
        const dmgReceived = cs._lastPlayerHp - curPlayerHp;
        const dmgDealt    = cs._lastEnemyHp  - curEnemyHp;
        if (dmgReceived > 0) cs.totalDamageReceived += dmgReceived;
        if (dmgDealt    > 0) cs.totalDamageDealt    += dmgDealt;
        cs._lastPlayerHp = curPlayerHp;
        cs._lastEnemyHp  = curEnemyHp;

        // Scan new log entries for structured events since combat started
        const log       = state.log ?? [];
        const logOffset = cs._logOffset ?? 0;
        for (let li = logOffset; li < log.length; li++) {
          const entry = log[li];

          if (entry.t === 'DamageDealt' && entry.data) {
            const d = entry.data;
            if (d.isPlayerSource) {
              cs.damageBreakdown.playerDealt.total          += d.finalDamage;
              cs.damageBreakdown.playerDealt.totalBlocked   += d.blocked;
              if (d.weakened)    cs.damageBreakdown.playerDealt.weakenedHits++;
              if (d.vulnerable)  cs.damageBreakdown.playerDealt.vulnerableHits++;
            } else {
              cs.damageBreakdown.playerReceived.total          += d.finalDamage;
              cs.damageBreakdown.playerReceived.totalBlocked   += d.blocked;
              if (d.weakened)    cs.damageBreakdown.playerReceived.weakenedHits++;
              if (d.vulnerable)  cs.damageBreakdown.playerReceived.vulnerableHits++;
            }
          } else if (entry.t === 'MutationApplied') {
            cs.mutationEvents.push({
              turn:           state.combat.turn ?? 0,
              type:           'mutation',
              cardInstanceId: entry.data?.cardInstanceId ?? null,
              tier:           entry.data?.tier ?? null,
              mutationId:     entry.msg?.replace('Mutation ', '') ?? null,
            });
          } else if (entry.t === 'FinalMutation') {
            const isBrick = entry.msg?.includes('BRICK');
            cs.mutationEvents.push({
              turn:           state.combat.turn ?? 0,
              type:           'final',
              cardInstanceId: entry.data?.cardInstanceId ?? null,
              outcome:        isBrick ? 'brick' : 'rewrite',
              newDefId:       !isBrick && entry.msg?.includes('->') ? entry.msg.split('-> ')[1]?.trim() : null,
            });
          }
        }
        cs._logOffset = log.length;
      }

      // ── GameOver: record run and start a new one ─────────────────────────────
      if (mode === 'GameOver') {
        const idx    = ++runIndexRef.current;
        const runDbg = state.run?.debugOverrides;
        const summary = {
          runIndex:       idx,
          seed:           state.run?.seed      ?? null,
          debugSeed:      state.run?.debugSeed ?? null,
          debugSeedMode:  runDbg?._mode        ?? seedMode,
          aiPlaystyle,
          aiPlaystyleLabel: AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle,
          debugOverrides: runDbg ? {
            playerMaxHP:       runDbg.playerMaxHP,
            startingCardCount: runDbg.startingCardCount,
            enemyHpMult:       runDbg.enemyHpMult,
            enemyDmgMult:      runDbg.enemyDmgMult,
            playerMaxRAM:      runDbg.playerMaxRAM,
            drawPerTurnDelta:  runDbg.drawPerTurnDelta,
            actOverride:       runDbg.actOverride,
            encounterKind:     runDbg.encounterKind,
          } : null,
          endTime:        new Date().toISOString(),
          outcome:        'defeat',
          finalAct:       state.run?.act   ?? 1,
          finalFloor:     state.run?.floor ?? 0,
          finalHp:        state.run?.hp    ?? 0,
          maxHp:          state.run?.maxHP ?? 0,
          finalGold:      state.run?.gold  ?? 0,
          deckSize:       state.deck?.master?.length ?? 0,
          encounters:     pendingEncountersRef.current.slice(),
          deckSnapshots:  deckSnapshotsRef.current.slice(),
          cardEvents:     pendingCardEventsRef.current.slice(),
          floorEvents:    pendingFloorEventsRef.current.slice(),
        };
        pendingEncountersRef.current  = [];
        pendingCardEventsRef.current  = [];
        pendingFloorEventsRef.current = [];
        deckSnapshotsRef.current      = [];
        lastFloorRef.current          = null;
        setRunHistory(prev => [...prev, summary]);

        // Resolve debug seed for the next run.
        // Custom config values are NEVER auto-cleared here — the user clears them manually.
        // Locked fields always beat the seed; unlocked fields yield to the seed
        // (but still apply as defaults when the seed doesn't override that field).
        let nextDebugSeed = null;
        if (randomizeDebugSeed) {
          nextDebugSeed = randomDebugSeed();
        } else if (debugSeedInput.trim()) {
          const parsed = parseInt(debugSeedInput.trim(), 10);
          if (!isNaN(parsed)) nextDebugSeed = parsed;
        }

        const initial = createInitialState();
        const seed    = Date.now();
        const next    = dispatchWithJournal(initial, data, {
          type: 'NewRun', seed, debugSeed: nextDebugSeed, debugSeedMode: seedMode,
          customOverrides: buildCustomOverrides(customConfig),
          lockedKeys: [...lockedFields],
        });
        setState(next);
        prevModeRef.current = null;
        return;
      }

      // ── AI action: intercept for stats, then dispatch ─────────────────────────
      const action = getAIAction(state, data, aiPlaystyle);
      if (action) {
        // Card plays — count + sum RAM cost
        if (action.type === 'Combat_PlayCard' && combatStatsRef.current) {
          combatStatsRef.current.totalCardsPlayed++;
          const cid  = action.cardInstanceId;
          const inst = state.combat?.cardInstances?.[cid];
          const cost = (inst?.defId && data.cards?.[inst.defId]?.costRAM) ?? 0;
          combatStatsRef.current.totalRAMSpent += cost;
        }

        // Card acquisition (reward screen)
        if (action.type === 'Reward_PickCard') {
          pendingCardEventsRef.current.push({
            act:     state.run?.act,
            floor:   state.run?.floor,
            offered: (state.reward?.cardChoices ?? []).slice(),
            taken:   action.defId,
          });
        }
        if (action.type === 'Reward_Skip') {
          pendingCardEventsRef.current.push({
            act:     state.run?.act,
            floor:   state.run?.floor,
            offered: (state.reward?.cardChoices ?? []).slice(),
            taken:   null,
          });
        }

        // Rest site choices
        if (['Rest_Heal', 'Rest_Repair', 'Rest_Stabilise'].includes(action.type)) {
          pendingFloorEventsRef.current.push({
            act:    state.run?.act,
            floor:  state.run?.floor,
            type:   'Rest',
            choice: action.type,
          });
        }

        // Shop purchases
        if (action.type === 'Shop_BuyOffer') {
          const offer = state.shop?.offers?.[action.index];
          if (offer) pendingFloorEventsRef.current.push({
            act:       state.run?.act,
            floor:     state.run?.floor,
            type:      'Shop',
            purchased: { kind: offer.kind, defId: offer.defId ?? offer.serviceId, price: offer.price },
          });
        }

        setState(prev => {
          try { return dispatchWithJournal(prev, data, action); }
          catch (e) { console.error('[AI] action failed', action, e); return prev; }
        });
      }
    }, aiSpeed);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, aiEnabled, aiPaused, aiSpeed]);

  // ── Auto-export every 5 completed runs ────────────────────────────────────
  useEffect(() => {
    if (runHistory.length === 0 || runHistory.length % 5 !== 0) return;
    const batchEnd   = runHistory.length;
    const batchStart = batchEnd - 4;
    const batch      = runHistory.slice(batchStart - 1); // last 5 runs
    const pad        = n => String(n).padStart(3, '0');
    const psLabel    = (AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle).replace(/\s+/g, '_');
    const uid        = Math.random().toString(36).slice(2, 7);
    const filename   = `ai_runs_${psLabel}_${pad(batchStart)}-${pad(batchEnd)}_${Date.now()}_${uid}.json`;
    const jsonStr    = JSON.stringify(batch, null, 2);
    writeToSaveDir(filename, jsonStr).then(ok => {
      if (!ok) fallbackDownload(filename, jsonStr);
    });
  }, [runHistory]);

  function buildInProgressSnapshot() {
    if (!state?.run) return null;
    const runDbg = state.run?.debugOverrides;
    return {
      runIndex:       (runIndexRef.current + 1),
      seed:           state.run?.seed      ?? null,
      debugSeed:      state.run?.debugSeed ?? null,
      debugSeedMode:  runDbg?._mode        ?? seedMode,
      aiPlaystyle,
      aiPlaystyleLabel: AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle,
      debugOverrides: runDbg ? {
        playerMaxHP:       runDbg.playerMaxHP,
        startingCardCount: runDbg.startingCardCount,
        enemyHpMult:       runDbg.enemyHpMult,
        enemyDmgMult:      runDbg.enemyDmgMult,
        playerMaxRAM:      runDbg.playerMaxRAM,
        drawPerTurnDelta:  runDbg.drawPerTurnDelta,
        actOverride:       runDbg.actOverride,
        encounterKind:     runDbg.encounterKind,
      } : null,
      endTime:        new Date().toISOString(),
      outcome:        'in_progress',
      finalAct:       state.run?.act   ?? 1,
      finalFloor:     state.run?.floor ?? 0,
      finalHp:        state.run?.hp    ?? 0,
      maxHp:          state.run?.maxHP ?? 0,
      finalGold:      state.run?.gold  ?? 0,
      deckSize:       state.deck?.master?.length ?? 0,
      encounters:     pendingEncountersRef.current.slice(),
      deckSnapshots:  deckSnapshotsRef.current.slice(),
      cardEvents:     pendingCardEventsRef.current.slice(),
      floorEvents:    pendingFloorEventsRef.current.slice(),
    };
  }

  async function exportRunData() {
    const pad      = n => String(n).padStart(3, '0');
    const total    = runHistory.length;
    const psLabel  = (AI_PLAYSTYLES[aiPlaystyle]?.label ?? aiPlaystyle).replace(/\s+/g, '_');
    const uid      = Math.random().toString(36).slice(2, 7);
    const filename = total > 0
      ? `ai_runs_${psLabel}_${pad(1)}-${pad(total)}_${Date.now()}_${uid}.json`
      : `ai_runs_${psLabel}_empty_${Date.now()}_${uid}.json`;

    // Include current in-progress run if one exists
    const inProgressSnap = buildInProgressSnapshot();
    const allRuns = inProgressSnap
      ? [...runHistory, inProgressSnap]
      : runHistory;

    const jsonStr  = JSON.stringify(allRuns, null, 2);
    const ok = await writeToSaveDir(filename, jsonStr);
    if (!ok) fallbackDownload(filename, jsonStr);
  }

  // Keep window.exportGameData fresh so close-ai-grid.ps1 can trigger it via CDP
  useEffect(() => { window.exportGameData = exportRunData; });

  const startNewRun = (overrideDebugSeed) => {
    if (!data) return;
    const initial = createInitialState();
    const seed = Date.now();
    let debugSeed = null;
    if (overrideDebugSeed !== undefined) {
      debugSeed = overrideDebugSeed;
    } else if (debugSeedInput.trim()) {
      const parsed = parseInt(debugSeedInput.trim(), 10);
      if (!isNaN(parsed)) debugSeed = parsed;
    }
    const newState = dispatchWithJournal(initial, data, {
      type: 'NewRun', seed, debugSeed, debugSeedMode: seedMode,
      customOverrides: buildCustomOverrides(customConfig),
      lockedKeys: [...lockedFields],
    });
    setState(newState);
  };

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
      content = <CombatScreen state={state} data={data} onAction={handleAction} aiPaused={aiPaused} />;
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
      content = <GameOverScreen state={state} onNewRun={startNewRun} />;
      break;
    default:
      content = (
        <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: C.text }}>Unknown mode: {state.mode}</div>
        </ScreenShell>
      );
  }

  return (
    <>
      {content}
      {/* Persistent mute toggle */}
      <MuteButton muted={soundMuted} onToggle={toggleMute} />
      {/* Deck picker overlay — appears on top of any screen when card selection is needed */}
      {state?.deckView && (
        <DeckPickerOverlay state={state} data={data} onAction={handleAction} />
      )}
      {state.run && (
        <>
          <DevButtons state={state} onDevAction={handleAction} onToggleLog={() => setShowLog(prev => !prev)} />
          {showLog && <LogOverlay log={state.log} />}
        </>
      )}
      <AIDebugPanel
        enabled={aiEnabled}              onToggle={() => setAiEnabled(v => !v)}
        paused={aiPaused}                onTogglePause={() => setAiPaused(v => !v)}
        speed={aiSpeed}                  onSpeedChange={setAiSpeed}
        runHistory={runHistory}          onExport={exportRunData}
        currentState={state}
        debugSeed={debugSeedInput}       onDebugSeedChange={setDebugSeedInput}
        seedMode={seedMode}              onSeedModeChange={setSeedMode}
        randomize={randomizeDebugSeed}   onRandomizeToggle={setRandomizeDebugSeed}
        onRandomizeSeed={() => { setSeedMode('wild');     setDebugSeedInput(String(randomDebugSeed())); }}
        onRandomizeSensibleSeed={() => { setSeedMode('sensible'); setDebugSeedInput(String(randomDebugSeed())); }}
        aiPlaystyle={aiPlaystyle}        onPlaystyleChange={setAiPlaystyle}
        saveDirName={saveDirName}        onSetSaveDir={pickSaveDir}
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
    </>
  );
}

export default App;
