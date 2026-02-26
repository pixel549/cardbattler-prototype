import React, { useState, useRef, useEffect } from 'react';
import { getEnemyImage } from '../data/enemyImages';

/**
 * CombatScreen - Cyberpunk deckbuilder combat UI
 *
 * Layout (top to bottom):
 * 1. Enemy zone (top) - enemies with prominent HP bars, status effects, intent
 * 2. Center zone - selected card display with mutation callouts + EXECUTE
 * 3. Player zone - player stats (left) + hand cards (right)
 * 4. Bottom bar - RAM blocks + pile counts + END TURN
 */

// ============================================================
// STYLE CONSTANTS
// ============================================================
const C = {
  bg: '#0a0a0f',
  bgCard: '#12121a',
  bgCardHover: '#1a1a28',
  bgDark: '#0d0d14',
  border: '#2a2a3a',
  borderLight: '#3a3a5a',
  neonCyan: '#00f0ff',
  neonOrange: '#ff6b00',
  neonRed: '#ff2a2a',
  neonGreen: '#00ff6b',
  neonPurple: '#b44aff',
  neonYellow: '#ffe600',
  textPrimary: '#e0e0e0',
  textSecondary: '#888',
  textDim: '#555',
};

const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

const TYPE_COLORS = {
  Attack: C.neonRed,
  Defense: C.neonCyan,
  Skill: C.neonGreen,
  Support: C.neonGreen,
  Power: C.neonPurple,
  Utility: C.neonYellow,
  Status: C.textDim,
  default: C.neonCyan,
};

// ============================================================
// STATUS EFFECT ICONS & COLORS
// ============================================================
const STATUS_META = {
  Weak:            { icon: '\u2193', color: '#ff6b6b', short: 'WK' },
  Vulnerable:      { icon: '\u25CE', color: '#ff4444', short: 'VU' },
  Firewall:        { icon: '\u25A3', color: C.neonCyan, short: 'FW' },
  Leak:            { icon: '\u2614', color: '#6688ff', short: 'LK' },
  ExposedPorts:    { icon: '\u26A0', color: '#ff8844', short: 'EP' },
  SensorGlitch:    { icon: '\u2734', color: '#aa66ff', short: 'SG' },
  Corrode:         { icon: '\u2620', color: '#88aa00', short: 'CR' },
  Underclock:      { icon: '\u231B', color: '#8888aa', short: 'UC' },
  Overclock:       { icon: '\u26A1', color: C.neonYellow, short: 'OC' },
  Nanoflow:        { icon: '\u2764', color: C.neonGreen, short: 'NF' },
  TargetSpoof:     { icon: '\u2316', color: '#cc66ff', short: 'TS' },
  Throttled:       { icon: '\u29D6', color: '#ff6600', short: 'TH' },
  TraceBeacon:     { icon: '\u25C9', color: '#ff3366', short: 'TB' },
  Overheat:        { icon: '\u2668', color: '#ff4400', short: 'OH' },
  CorruptedSector: { icon: '\u2718', color: '#990099', short: 'CS' },
  DazedPackets:    { icon: '\u25CC', color: '#7788aa', short: 'DP' },
  Burn:            { icon: '\uD83D\uDD25', color: '#ff5500', short: 'BN' },
};

function getStatusMeta(id) {
  return STATUS_META[id] || { icon: '\u25C6', color: C.neonPurple, short: id.slice(0, 2).toUpperCase() };
}

// ============================================================
// UTILITY
// ============================================================
function getCardColor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.default;
}

function getHealthColor(current, max) {
  const pct = current / max;
  if (pct > 0.6) return C.neonGreen;
  if (pct > 0.35) return C.neonYellow;
  if (pct > 0.15) return C.neonOrange;
  return C.neonRed;
}

// ── Mutation tier/polarity colour system ──
// Polarity derived from ID: '+' = positive, '-S' = special, else negative
const MUT_COLORS_NEG = { A:'#999', B:'#b8a020', C:'#cc6010', D:'#dd3310', E:'#ee1818', F:'#dd0828', G:'#cc0040', H:'#bb0060', I:'#aa0080', J:'#880000' };
const MUT_COLORS_POS = { A:'#7090b8', B:'#30bb99', C:'#20bb50', D:'#00ee60', E:'#00eeaa', F:'#00dddd', G:'#0099ff', H:'#3377ff', I:'#8844ff' };
const MUT_COLORS_SPECIAL = '#b44aff';

function getMutPolarity(id) {
  if (id.includes('+')) return 'pos';
  if (id.includes('-S')) return 'special';
  return 'neg';
}
function getMutTier(id) { return id[0]; }
function getMutColor(id) {
  const p = getMutPolarity(id);
  const t = getMutTier(id);
  if (p === 'special') return MUT_COLORS_SPECIAL;
  if (p === 'pos') return MUT_COLORS_POS[t] || C.neonCyan;
  return MUT_COLORS_NEG[t] || C.textDim;
}
// Short display label: tier letter + polarity symbol
function getMutLabel(id) {
  const p = getMutPolarity(id);
  const t = getMutTier(id);
  if (p === 'pos') return `${t}+`;
  if (p === 'special') return `${t}~`;
  return t;
}

function getIntentIcon(intentType) {
  switch (intentType) {
    case 'Attack':  return '\u2694';   // ⚔
    case 'Defense': return '\uD83D\uDEE1'; // 🛡
    case 'Skill':   return '\uD83D\uDEE1'; // 🛡
    case 'Buff':    return '\u2764';   // ❤ (self-heal/buff)
    case 'Debuff':  return '\u2620';   // ☠
    case 'Unknown': return '?';
    default:        return '\u2694';
  }
}

function getIntentColor(intentType) {
  switch (intentType) {
    case 'Attack':  return C.neonRed;
    case 'Defense': return C.neonCyan;
    case 'Skill':   return C.neonCyan;
    case 'Buff':    return C.neonGreen;
    case 'Debuff':  return C.neonPurple;
    default:        return C.neonOrange;
  }
}

// ============================================================
// EFFECT COLOUR CODING (from player perspective)
// ============================================================
// Parses card effects (including RawText) and assigns green/red/neutral.
// Perspective: 'player' = card in player's hand; 'enemy' = enemy's next card.
function classifyEffects(effects, perspective) {
  if (!effects || effects.length === 0) return [];

  const result = [];
  for (const eff of effects) {
    if (eff.op === 'RawText') {
      const t = eff.text || '';
      // Break into sentences
      const parts = t.split(/(?:\.\s*|\s*;\s*|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        const color = classifyRawTextLine(part, perspective);
        result.push({ text: part, color });
      }
    } else {
      const color = classifyOp(eff, perspective);
      result.push({ text: formatOpLine(eff), color });
    }
  }
  return result;
}

function classifyRawTextLine(text, perspective) {
  const t = text.toLowerCase();
  if (perspective === 'player') {
    // Bad for player
    if (/lose \d+ hp/.test(t) || /lose \d+ ram/.test(t)) return C.neonRed;
    // Good for player
    return C.neonGreen;
  } else {
    // enemy card — classify from player's perspective
    if (/deal \d+ damage/.test(t))                return C.neonRed;    // enemy attacks → bad
    if (/apply \d+ /.test(t) || /apply [a-z]/i.test(t.toLowerCase())) return C.neonRed; // debuffs player
    if (/gain \d+ firewall/.test(t))              return '#ff9944';    // enemy blocks → neutral/bad
    if (/gain \d+ nanoflow/.test(t) || /heal \d+ hp/.test(t)) return '#ff9944'; // enemy heals → bad
    return '#ff9944'; // default for enemy: amber/warning
  }
}

function classifyOp(eff, perspective) {
  if (perspective === 'player') {
    if (eff.op === 'DealDamage') return C.neonGreen;
    if (eff.op === 'GainBlock')  return C.neonGreen;
    if (eff.op === 'Heal')       return C.neonGreen;
    if (eff.op === 'GainRAM')    return C.neonGreen;
    if (eff.op === 'DrawCards')  return C.neonGreen;
    if (eff.op === 'ApplyStatus' && eff.target !== 'Self') return C.neonGreen;
    if (eff.op === 'LoseRAM')    return C.neonRed;
    return C.neonGreen;
  } else {
    if (eff.op === 'DealDamage') return C.neonRed;
    if (eff.op === 'ApplyStatus') return C.neonRed;
    return '#ff9944'; // enemy block/heal = amber
  }
}

function formatOpLine(eff) {
  if (eff.op === 'DealDamage') return `Deal ${eff.amount} damage`;
  if (eff.op === 'GainBlock')  return `Gain ${eff.amount} Firewall`;
  if (eff.op === 'Heal')       return `Heal ${eff.amount} HP`;
  if (eff.op === 'GainRAM')    return `Gain ${eff.amount} RAM`;
  if (eff.op === 'DrawCards')  return `Draw ${eff.amount} card${eff.amount > 1 ? 's' : ''}`;
  if (eff.op === 'ApplyStatus') return `Apply ${eff.stacks} ${eff.statusId}`;
  if (eff.op === 'LoseRAM')    return `Lose ${eff.amount} RAM`;
  return eff.op;
}

// ============================================================
// CARD EFFECT TOOLTIP
// ============================================================
function CardEffectTooltip({ cardDef, perspective, x, y }) {
  if (!cardDef) return null;
  const classified = classifyEffects(cardDef.effects, perspective);
  if (classified.length === 0) return null;

  // Clamp tooltip position to avoid overflowing viewport edges
  const tipWidth = 200;
  const tipLeft  = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - tipWidth - 10);
  const tipTop   = y - 8;

  return (
    <div
      style={{
        position: 'fixed',
        left: tipLeft,
        top: tipTop,
        transform: 'translateY(-100%)',
        zIndex: 9999,
        backgroundColor: '#0d0d18',
        border: '1px solid #2a2a3a',
        borderRadius: 8,
        padding: '8px 10px',
        minWidth: 160,
        maxWidth: tipWidth,
        boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, color: '#888', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {cardDef.name}
      </div>
      {classified.map((line, i) => (
        <div key={i} style={{ fontFamily: MONO, fontSize: 9, color: line.color, lineHeight: 1.5 }}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

function formatEffects(effects) {
  if (!effects || effects.length === 0) return 'No effect';
  return effects.map(e => {
    if (e.op === 'DealDamage') return `${e.amount} dmg`;
    if (e.op === 'GainBlock') return `+${e.amount} blk`;
    if (e.op === 'Heal') return `+${e.amount} hp`;
    if (e.op === 'GainRAM') return `+${e.amount} RAM`;
    if (e.op === 'DrawCards') return `Draw ${e.amount}`;
    if (e.op === 'ApplyStatus') return `${e.stacks}x ${e.statusId}`;
    if (e.op === 'RawText') return e.text;
    return e.op;
  }).join(' \u00B7 ');
}

function formatEffectsLong(effects) {
  if (!effects || effects.length === 0) return ['No effect'];
  return effects.map(e => {
    if (e.op === 'DealDamage') return `Deal ${e.amount} damage`;
    if (e.op === 'GainBlock') return `Gain ${e.amount} Block`;
    if (e.op === 'Heal') return `Heal ${e.amount} HP`;
    if (e.op === 'GainRAM') return `Gain ${e.amount} RAM`;
    if (e.op === 'DrawCards') return `Draw ${e.amount} card${e.amount > 1 ? 's' : ''}`;
    if (e.op === 'ApplyStatus') return `Apply ${e.stacks} ${e.statusId}`;
    if (e.op === 'RawText') return e.text;
    return e.op;
  });
}

// ============================================================
// STATUS BADGE (reusable for player + enemies)
// ============================================================
function StatusBadge({ status, size = 'normal' }) {
  const meta = getStatusMeta(status.id);
  const isSmall = size === 'small';

  return (
    <div
      title={`${status.id}: ${status.stacks} stacks`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '2px' : '3px',
        padding: isSmall ? '1px 4px' : '2px 6px',
        borderRadius: '4px',
        fontFamily: MONO,
        fontSize: isSmall ? 8 : 10,
        fontWeight: 700,
        backgroundColor: `${meta.color}18`,
        color: meta.color,
        border: `1px solid ${meta.color}35`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: isSmall ? 9 : 11 }}>{meta.icon}</span>
      {status.stacks > 1 && <span>{status.stacks}</span>}
    </div>
  );
}

// ============================================================
// STATUS ROW (renders all statuses for an entity)
// ============================================================
function StatusRow({ statuses, size = 'normal', justify = 'flex-start' }) {
  if (!statuses || statuses.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: justify }}>
      {statuses.map((s, i) => (
        <StatusBadge key={`${s.id}-${i}`} status={s} size={size} />
      ))}
    </div>
  );
}

// ============================================================
// HEALTH BAR (prominent, segmented for low-HP enemies)
// ============================================================
function HealthBar({ current, max, height = 14, segmented = false, showText = true, glow = true }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = getHealthColor(current, max);

  if (segmented && max <= 40) {
    const segCount = max;
    const filledSegs = current;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '1px', borderRadius: '4px', overflow: 'hidden', height }}>
          {Array.from({ length: segCount }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                transition: 'all 0.3s ease',
                backgroundColor: i < filledSegs ? color : '#1a1a2a',
                boxShadow: i < filledSegs && glow ? `0 0 4px ${color}60` : 'none',
                minWidth: 2,
              }}
            />
          ))}
        </div>
        {showText && (
          <div style={{ display: 'flex', justifyContent: 'center', fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
            <span style={{ color }}>{current}</span>
            <span style={{ color: C.textDim }}>/{max}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
      <div style={{
        position: 'relative',
        borderRadius: '6px',
        overflow: 'hidden',
        height,
        backgroundColor: '#1a1a2a',
        width: '100%',
        border: `1px solid ${color}30`,
      }}>
        <div
          style={{
            height: '100%',
            borderRadius: '5px',
            transition: 'all 0.5s ease-out',
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: glow ? `0 0 10px ${color}60, inset 0 1px 0 rgba(255,255,255,0.15)` : 'none',
          }}
        />
        {/* HP text overlay inside bar */}
        {showText && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: MONO,
            fontSize: height > 16 ? 12 : 10,
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}>
            {current}/{max}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ENEMY CARD (prominent, top zone)
// ============================================================
function EnemyCard({ enemy, isTargeted, onClick, actingType }) {
  const intentIcon  = getIntentIcon(enemy.intent?.type);
  const intentColor = getIntentColor(enemy.intent?.type);
  const imgSrc      = getEnemyImage(enemy.enemyDefId);
  const actClass    = actingType === 'Attack'  ? 'enemy-act-attack'
                    : actingType === 'Debuff'  ? 'enemy-act-debuff'
                    : actingType               ? 'enemy-act-defend'
                    : '';

  if (imgSrc) {
    // ── Image card: artwork fills the card, stats overlaid ──
    return (
      <button
        onClick={onClick}
        className={actClass}
        style={{
          position: 'relative',
          flexShrink: 0,
          padding: 0,
          border: `2px solid ${isTargeted ? C.neonCyan : 'transparent'}`,
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isTargeted
            ? `0 0 28px ${C.neonCyan}60`
            : '0 4px 16px rgba(0,0,0,0.7)',
          display: 'block',
        }}
      >
        {/* Full artwork — no cropping */}
        <img
          src={imgSrc}
          alt={enemy.name ?? 'Enemy'}
          style={{
            display: 'block',
            height: '32vh',
            width: 'auto',
            maxWidth: '160px',
            minWidth: '100px',
          }}
        />

        {/* Intent badge — top-right */}
        <div style={{
          position: 'absolute',
          top: 6,
          right: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '2px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0,0,0,0.75)',
            border: `1px solid ${intentColor}60`,
          }}>
            <span style={{ fontSize: 13 }}>{intentIcon}</span>
            <span style={{ fontFamily: MONO, fontWeight: 700, color: intentColor, fontSize: 13 }}>
              {enemy.intent?.amount ?? '?'}
            </span>
          </div>
          {enemy.intent?.name && (
            <div style={{
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(0,0,0,0.7)',
              fontFamily: MONO,
              fontSize: 8,
              color: intentColor,
              opacity: 0.85,
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {enemy.intent.name}
            </div>
          )}
        </div>

        {/* Block badge — top-left (only when active) */}
        {enemy.block > 0 && (
          <div style={{
            position: 'absolute',
            top: 6,
            left: 6,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            padding: '3px 7px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0,0,0,0.75)',
            border: `1px solid ${C.neonCyan}50`,
            fontFamily: MONO,
            fontWeight: 700,
            color: C.neonCyan,
            fontSize: 11,
          }}>
            {'\uD83D\uDEE1'} {enemy.block}
          </div>
        )}

        {/* Bottom overlay: name + status effects + HP bar */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '20px 6px 6px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.88) 40%)',
        }}>
          {/* Enemy name */}
          {enemy.name && (
            <div style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              fontSize: 9,
              fontWeight: 700,
              color: '#e0e0e0',
              textAlign: 'center',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 3,
              opacity: 0.9,
            }}>
              {enemy.name}
            </div>
          )}

          {/* Status effects */}
          {enemy.statuses?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center', marginBottom: 4 }}>
              {enemy.statuses.map((s, i) => (
                <StatusBadge key={`${s.id}-${i}`} status={s} size="small" />
              ))}
            </div>
          )}

          {/* HP bar */}
          <HealthBar
            current={enemy.hp}
            max={enemy.maxHP}
            height={14}
            segmented={false}
            showText={true}
            glow={false}
          />
        </div>
      </button>
    );
  }

  // ── Fallback card for enemies without artwork ──
  return (
    <button
      onClick={onClick}
      className={actClass}
      style={{
        position: 'relative',
        flexShrink: 0,
        borderRadius: '10px',
        transition: 'all 0.2s ease',
        backgroundColor: C.bgCard,
        border: `2px solid ${isTargeted ? C.neonCyan : C.border}`,
        boxShadow: isTargeted
          ? `0 0 24px ${C.neonCyan}40, inset 0 0 20px ${C.neonCyan}06`
          : `0 2px 12px rgba(0,0,0,0.5)`,
        padding: '10px 14px',
        minWidth: 140,
        maxWidth: 180,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{
        fontFamily: MONO,
        fontWeight: 700,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: isTargeted ? C.neonCyan : C.textPrimary,
        fontSize: 11,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}>
        {enemy.name ? `${enemy.name}.EXE` : 'UNKNOWN.EXE'}
      </div>
      <HealthBar current={enemy.hp} max={enemy.maxHP} height={16} segmented={enemy.maxHP <= 30} showText={true} />
      {enemy.block > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '2px 8px', borderRadius: '4px', fontFamily: MONO, fontWeight: 700, backgroundColor: `${C.neonCyan}15`, color: C.neonCyan, fontSize: 11, border: `1px solid ${C.neonCyan}30` }}>
          {'\uD83D\uDEE1'} {enemy.block}
        </div>
      )}
      <StatusRow statuses={enemy.statuses} size="small" justify="center" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '4px 8px', borderRadius: '6px', backgroundColor: `${intentColor}12`, border: `1px solid ${intentColor}30` }}>
        <span style={{ fontSize: 14 }}>{intentIcon}</span>
        <span style={{ fontFamily: MONO, fontWeight: 700, color: intentColor, fontSize: 14 }}>{enemy.intent?.amount ?? '?'}</span>
        {enemy.intent?.name && (
          <span style={{ fontFamily: MONO, color: C.textDim, fontSize: 8, marginLeft: '2px' }}>{enemy.intent.name}</span>
        )}
      </div>
    </button>
  );
}

// ============================================================
// PLAYER STATS PANEL (bottom-left)
// ============================================================
function PlayerPanel({ player, turn }) {
  const hp = player?.hp ?? 0;
  const maxHp = player?.maxHP ?? 1;
  const block = player?.block ?? 0;

  return (
    <div
      style={{
        flexShrink: 0,
        width: 110,
        borderRadius: '10px',
        padding: '8px',
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        justifyContent: 'center',
      }}
    >
      {/* Turn badge */}
      <div
        style={{
          textAlign: 'center',
          fontSize: 10,
          fontFamily: MONO,
          fontWeight: 700,
          color: C.neonCyan,
          paddingBottom: '4px',
          borderBottom: `1px solid ${C.border}`,
          letterSpacing: '0.05em',
        }}
      >
        TURN {turn}
      </div>

      {/* HP bar - prominent */}
      <HealthBar current={hp} max={maxHp} height={14} showText={true} />

      {/* Firewall (Block) badge - always visible */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3px',
          fontSize: 11,
          fontFamily: MONO,
          fontWeight: 700,
          color: block > 0 ? C.neonCyan : C.textDim,
          backgroundColor: block > 0 ? `${C.neonCyan}15` : `${C.textDim}10`,
          borderRadius: '4px',
          padding: '3px 8px',
          border: `1px solid ${block > 0 ? `${C.neonCyan}30` : `${C.textDim}20`}`,
          transition: 'all 0.3s ease',
        }}
      >
        {'\u25A3'} <span style={{ fontSize: 8, letterSpacing: '0.05em' }}>FW</span> {block}
      </div>

      {/* Player statuses */}
      <StatusRow statuses={player?.statuses} size="small" justify="center" />
    </div>
  );
}

// ============================================================
// MUTATION CALLOUT (speech-bubble style)
// ============================================================
function MutationCallout({ mid, data, connectorSide }) {
  const mut  = data?.mutations?.[mid];
  const col  = getMutColor(mid);
  const lbl  = getMutLabel(mid);
  const label = (
    <div
      style={{
        padding: '3px 6px',
        borderRadius: '5px',
        fontFamily: MONO,
        backgroundColor: `${col}14`,
        border: `1px solid ${col}55`,
        color: col,
        fontSize: 8,
        lineHeight: 1.3,
        maxWidth: 90,
      }}
    >
      <span style={{ fontWeight: 700, marginRight: 3, opacity: 0.85 }}>{lbl}</span>
      {mut?.name || mid}
    </div>
  );
  const connector = <div style={{ width: 12, height: 1, backgroundColor: `${col}55`, flexShrink: 0 }} />;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {connectorSide === 'right' && label}
      {connectorSide === 'right' && connector}
      {connectorSide === 'left' && connector}
      {connectorSide === 'left' && label}
    </div>
  );
}

// ============================================================
// CENTER CARD with 4-CORNER MUTATION CALLOUTS
// ============================================================
function CenterCardDisplay({ cardInstance, cardDef, data }) {
  if (!cardInstance || !cardDef) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 100,
        }}
      >
        <span style={{ fontFamily: MONO, color: C.textDim, fontSize: 12 }}>
          Tap a card to inspect
        </span>
      </div>
    );
  }

  const color = getCardColor(cardDef.type);
  const cost = Math.max(0, (cardDef.costRAM || 0) + (cardInstance.ramCostDelta || 0));
  const mutations = cardInstance.appliedMutations || [];
  const effectLines = formatEffectsLong(cardDef.effects);
  const isDecaying = cardInstance.finalMutationCountdown <= 3;

  // Split mutations into 4 corners
  const topLeftMuts = mutations.filter((_, i) => i % 4 === 0);
  const topRightMuts = mutations.filter((_, i) => i % 4 === 1);
  const bottomLeftMuts = mutations.filter((_, i) => i % 4 === 2);
  const bottomRightMuts = mutations.filter((_, i) => i % 4 === 3);

  return (
    <div className="animate-slide-up" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
      {/* Top-left mutations */}
      {topLeftMuts.length > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10, maxWidth: 95 }}>
          {topLeftMuts.map((mid, i) => (
            <MutationCallout key={i} mid={mid} data={data} connectorSide="right" />
          ))}
        </div>
      )}

      {/* Top-right mutations */}
      {topRightMuts.length > 0 && (
        <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10, maxWidth: 95 }}>
          {topRightMuts.map((mid, i) => (
            <MutationCallout key={i} mid={mid} data={data} connectorSide="left" />
          ))}
        </div>
      )}

      {/* Center card */}
      <div
        style={{
          position: 'relative',
          borderRadius: '12px',
          zIndex: 20,
          width: 170,
          backgroundColor: C.bgCard,
          border: `2px solid ${color}70`,
          boxShadow: `0 0 30px ${color}20, 0 4px 24px rgba(0,0,0,0.5)`,
          overflow: 'hidden',
        }}
      >
        {/* Cost badge */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            width: '28px',
            height: '28px',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontFamily: MONO,
            zIndex: 10,
            backgroundColor: color,
            color: '#000',
            boxShadow: `0 0 10px ${color}80`,
            fontSize: 14,
          }}
        >
          {cost}
        </div>

        {/* Card art area */}
        <div
          style={{
            height: 60,
            background: `linear-gradient(135deg, ${color}15 0%, ${C.bgCard} 60%, ${color}08 100%)`,
            borderBottom: `1px solid ${color}30`,
          }}
        />

        {/* Card body */}
        <div style={{ padding: '10px' }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, marginBottom: '2px', color: C.textPrimary, fontSize: 14 }}>
            {cardDef.name}
          </div>
          <div style={{ fontFamily: MONO, textTransform: 'uppercase', marginBottom: '8px', color, fontSize: 9, letterSpacing: '0.1em' }}>
            {cardDef.type}
          </div>

          <div style={{ fontFamily: MONO, color: C.textSecondary, fontSize: 11, lineHeight: 1.5 }}>
            {effectLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>

          {/* Bottom stats row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '6px', borderTop: `1px solid ${color}20` }}>
            <div style={{ fontFamily: MONO, color: C.textDim, fontSize: 9 }}>
              USES: <span style={{ color: C.textPrimary, fontWeight: 700 }}>{cardInstance.useCounter}</span>
            </div>
            <div style={{ fontFamily: MONO, color: isDecaying ? C.neonOrange : C.textDim, fontSize: 9 }}>
              MUT: <span style={{ fontWeight: 700 }}>{cardInstance.finalMutationCountdown}</span>
            </div>
          </div>
        </div>

        {/* Tags */}
        {cardDef.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '0 10px 8px' }}>
            {cardDef.tags.map((tag, i) => (
              <span
                key={i}
                style={{
                  padding: '2px 4px',
                  borderRadius: '4px',
                  fontFamily: MONO,
                  backgroundColor: '#1a1a2a',
                  color: C.textDim,
                  fontSize: 8,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom-left mutations */}
      {bottomLeftMuts.length > 0 && (
        <div style={{ position: 'absolute', left: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10, maxWidth: 95 }}>
          {bottomLeftMuts.map((mid, i) => (
            <MutationCallout key={i} mid={mid} data={data} connectorSide="right" />
          ))}
        </div>
      )}

      {/* Bottom-right mutations */}
      {bottomRightMuts.length > 0 && (
        <div style={{ position: 'absolute', right: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10, maxWidth: 95 }}>
          {bottomRightMuts.map((mid, i) => (
            <MutationCallout key={i} mid={mid} data={data} connectorSide="left" />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// HAND CARD (compact, bottom-right cluster)
// ============================================================
function HandCard({ cardInstance, cardDef, isSelected, onSelect, canPlay, compact = false, showTooltip = false, onHover }) {
  const color = getCardColor(cardDef?.type);
  const cost = Math.max(0, (cardDef?.costRAM || 0) + (cardInstance?.ramCostDelta || 0));
  const hasMutations = cardInstance?.appliedMutations?.length > 0;
  const countdown = cardInstance?.finalMutationCountdown;
  const isDecaying = countdown != null && countdown <= 3;
  const isBricked   = cardInstance?.finalMutationId === 'J_BRICK';
  const isRewritten  = cardInstance?.finalMutationId === 'J_REWRITE';

  const w = compact ? 72 : 105;
  const h = compact ? 100 : 148;
  const badgeSize = compact ? 18 : 24;
  const badgeOffset = compact ? '-4px' : '-6px';
  const artH = compact ? 22 : 38;

  return (
    <button
      onClick={onSelect}
      onMouseEnter={showTooltip && onHover ? (e) => onHover(cardDef, e.clientX, e.clientY) : undefined}
      onMouseMove={showTooltip && onHover ? (e) => onHover(cardDef, e.clientX, e.clientY) : undefined}
      onMouseLeave={showTooltip && onHover ? () => onHover(null, 0, 0) : undefined}
      style={{
        position: 'relative',
        flexShrink: 0,
        borderRadius: compact ? '8px' : '12px',
        transition: 'all 0.2s ease',
        textAlign: 'left',
        width: w,
        height: h,
        backgroundColor: isSelected ? C.bgCardHover : C.bgCard,
        border: `2px solid ${isSelected ? (showTooltip ? C.neonYellow : C.neonCyan) : color}40`,
        boxShadow: isSelected
          ? `0 0 24px ${showTooltip ? C.neonYellow : C.neonCyan}50, 0 4px 20px rgba(0,0,0,0.5)`
          : `0 2px 8px rgba(0,0,0,0.4)`,
        transform: isSelected
          ? (compact ? 'translateY(-8px) scale(1.08)' : 'translateY(-10px) scale(1.04)')
          : 'none',
        opacity: canPlay ? 1 : 0.4,
        overflow: 'hidden',
        outline: showTooltip ? `1px solid ${C.neonYellow}30` : undefined,
      }}
    >
      {/* Bricked overlay */}
      {isBricked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: compact ? '8px' : '12px',
            backgroundColor: 'rgba(255,42,42,0.18)',
            border: `2px solid ${C.neonRed}70`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: compact ? 18 : 26, opacity: 0.7 }}>💀</span>
        </div>
      )}

      {/* Rewritten overlay */}
      {isRewritten && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: compact ? '8px' : '12px',
            backgroundColor: 'rgba(180,74,255,0.12)',
            border: `2px solid ${C.neonPurple}60`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: compact ? 14 : 20, opacity: 0.7 }}>✦</span>
        </div>
      )}

      {/* Cost badge (top-left) */}
      <div
        style={{
          position: 'absolute',
          top: badgeOffset,
          left: badgeOffset,
          width: badgeSize,
          height: badgeSize,
          borderRadius: '9999px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontFamily: MONO,
          zIndex: 10,
          backgroundColor: color,
          color: '#000',
          boxShadow: `0 0 8px ${color}80`,
          fontSize: compact ? 9 : 12,
        }}
      >
        {cost}
      </div>

      {/* Countdown badge (top-right) */}
      {countdown != null && (
        <div
          style={{
            position: 'absolute',
            top: badgeOffset,
            right: badgeOffset,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontFamily: MONO,
            zIndex: 10,
            backgroundColor: isDecaying ? C.neonOrange : C.bgDark,
            color: isDecaying ? '#000' : C.textDim,
            border: isDecaying ? 'none' : `1px solid ${C.border}`,
            boxShadow: isDecaying ? `0 0 8px ${C.neonOrange}80` : 'none',
            fontSize: compact ? 8 : 10,
          }}
        >
          {countdown}
        </div>
      )}

      {/* Card art placeholder */}
      <div
        style={{
          height: artH,
          background: `linear-gradient(135deg, ${color}12 0%, ${C.bgCard} 50%, ${color}06 100%)`,
          borderBottom: `1px solid ${color}20`,
        }}
      />

      {/* Card content */}
      <div style={{ padding: compact ? '4px 5px' : '6px 8px', display: 'flex', flexDirection: 'column', height: `calc(100% - ${artH}px)` }}>
        {/* Name */}
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            lineHeight: 1.25,
            marginBottom: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: C.textPrimary,
            fontSize: compact ? 8 : 10,
          }}
        >
          {cardDef?.name || 'Unknown'}
        </div>

        {/* Type (hidden in compact) */}
        {!compact && (
          <div
            style={{
              fontFamily: MONO,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
              color,
              fontSize: 7,
            }}
          >
            {cardDef?.type}
          </div>
        )}

        {/* Effects */}
        <div
          style={{
            flex: 1,
            fontFamily: MONO,
            lineHeight: 1.3,
            overflow: 'hidden',
            color: C.textSecondary,
            fontSize: compact ? 7 : 8.5,
            ...(compact ? { whiteSpace: 'nowrap', textOverflow: 'ellipsis' } : {}),
          }}
        >
          {formatEffects(cardDef?.effects)}
        </div>

        {/* Mutation tier chips — one per mutation, color-coded by tier+polarity */}
        {hasMutations && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginTop: 'auto', paddingTop: compact ? '2px' : '3px' }}>
            {cardInstance.appliedMutations.slice(0, 7).map((mid, i) => {
              const col = getMutColor(mid);
              const lbl = getMutLabel(mid);
              return (
                <div key={i} style={{
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: compact ? 6 : 7,
                  padding: '0px 3px',
                  borderRadius: '3px',
                  backgroundColor: `${col}22`,
                  border: `1px solid ${col}55`,
                  color: col,
                  lineHeight: '12px',
                  letterSpacing: '0.02em',
                }}>
                  {lbl}
                </div>
              );
            })}
            {cardInstance.appliedMutations.length > 7 && (
              <div style={{ fontFamily: MONO, fontSize: compact ? 6 : 7, color: C.textDim, lineHeight: '12px' }}>
                +{cardInstance.appliedMutations.length - 7}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ============================================================
// RAM BAR (large labeled blocks)
// ============================================================
function RamBar({ ram, maxRam }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{
        fontSize: 11,
        color: C.neonCyan,
        fontWeight: 700,
        fontFamily: MONO,
        letterSpacing: '0.08em',
        textShadow: `0 0 8px ${C.neonCyan}40`,
      }}>
        RAM
      </span>
      <div style={{ flex: 1, display: 'flex', gap: '3px', alignItems: 'center' }}>
        {Array.from({ length: maxRam }).map((_, i) => {
          const filled = i < ram;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 18,
                maxWidth: 32,
                borderRadius: 4,
                transition: 'all 0.25s ease',
                backgroundColor: filled ? C.neonCyan : '#1a1a2a',
                boxShadow: filled ? `0 0 8px ${C.neonCyan}70, inset 0 1px 0 rgba(255,255,255,0.2)` : 'inset 0 1px 3px rgba(0,0,0,0.4)',
                border: `1px solid ${filled ? `${C.neonCyan}80` : '#222'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{
                fontFamily: MONO,
                fontSize: 7,
                fontWeight: 700,
                color: filled ? '#000' : '#333',
                letterSpacing: '-0.02em',
              }}>
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
      <span style={{
        fontSize: 12,
        color: C.neonCyan,
        fontFamily: MONO,
        fontWeight: 700,
        textShadow: `0 0 6px ${C.neonCyan}30`,
      }}>
        {ram}<span style={{ color: C.textDim, fontWeight: 400 }}>/{maxRam}</span>
      </span>
    </div>
  );
}

// ============================================================
// PILE VIEWER (bottom-sheet modal)
// ============================================================
function PileViewer({ title, cards, cardInstances, data, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
      }}
      onClick={onClose}
    >
      <div
        className="safe-area-bottom animate-slide-up"
        style={{
          width: '100%',
          maxHeight: '75vh',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          padding: '16px',
          paddingBottom: '32px',
          overflowY: 'auto',
          backgroundColor: C.bgDark,
          border: `1px solid ${C.border}`,
          borderBottom: 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '9999px', backgroundColor: C.border }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontFamily: MONO, fontWeight: 700, color: C.textPrimary, fontSize: 16 }}>
            {title}
            <span style={{ marginLeft: '8px', fontWeight: 400, color: C.textDim }}>({cards.length})</span>
          </h3>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: C.bgCard,
              color: C.textSecondary,
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: MONO, color: C.textDim }}>Empty</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {cards.map((cid, i) => {
              const ci = cardInstances[cid];
              const def = data?.cards?.[ci?.defId];
              const clr = getCardColor(def?.type);
              const cst = Math.max(0, (def?.costRAM || 0) + (ci?.ramCostDelta || 0));
              const muts      = ci?.appliedMutations?.length ?? 0;
              const countdown = ci?.finalMutationCountdown ?? null;
              const isBricked  = ci?.finalMutationId === 'J_BRICK';
              const isRewrite  = ci?.finalMutationId === 'J_REWRITE';
              const isDecaying = countdown != null && countdown <= 3 && !ci?.finalMutationId;
              const borderColor = isBricked ? C.neonRed : isRewrite ? C.neonPurple : clr;
              return (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    padding: '8px',
                    borderRadius: '8px',
                    backgroundColor: isBricked ? 'rgba(255,42,42,0.08)' : C.bgCard,
                    border: `1px solid ${borderColor}40`,
                  }}
                >
                  {/* Name row + cost badge */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <div style={{ fontFamily: MONO, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isBricked ? C.neonRed : clr, fontSize: 10, flex: 1 }}>
                      {isBricked ? '💀 ' : isRewrite ? '✦ ' : ''}{def?.name || '???'}
                    </div>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '9999px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: MONO,
                        fontWeight: 700,
                        flexShrink: 0,
                        marginLeft: '4px',
                        backgroundColor: clr,
                        color: '#000',
                        fontSize: 9,
                      }}
                    >
                      {cst}
                    </div>
                  </div>

                  {/* Effects */}
                  <div style={{ fontFamily: MONO, color: C.textDim, fontSize: 8, marginBottom: '4px' }}>
                    {formatEffects(def?.effects)}
                  </div>

                  {/* Mutation info row */}
                  {(muts > 0 || countdown != null) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px' }}>
                      {/* Mutation count pip */}
                      {muts > 0 && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          fontFamily: MONO,
                          fontSize: 7,
                          fontWeight: 700,
                          backgroundColor: `${C.neonPurple}20`,
                          color: C.neonPurple,
                        }}>
                          ◆{muts}
                        </div>
                      )}

                      {/* Countdown badge */}
                      {countdown != null && !ci?.finalMutationId && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          fontFamily: MONO,
                          fontSize: 7,
                          fontWeight: 700,
                          backgroundColor: isDecaying ? `${C.neonOrange}25` : 'transparent',
                          color: isDecaying ? C.neonOrange : C.textDim,
                          border: isDecaying ? `1px solid ${C.neonOrange}40` : `1px solid ${C.border}`,
                          boxShadow: isDecaying ? `0 0 6px ${C.neonOrange}40` : 'none',
                          marginLeft: 'auto',
                        }}>
                          ⏱{countdown}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMBAT SCREEN
// ============================================================
export default function CombatScreen({ state, data, onAction, aiPaused = false }) {
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [viewingPile, setViewingPile] = useState(null);
  const [targetedEnemyIndex, setTargetedEnemyIndex] = useState(0);
  const [actingEnemies, setActingEnemies] = useState({});
  const [tooltip, setTooltip] = useState({ cardDef: null, x: 0, y: 0 });
  const handScrollRef = useRef(null);

  const combat = state?.combat;
  const player = combat?.player;
  const enemies = combat?.enemies || [];
  const cardInstances = combat?.cardInstances || {};
  const hand = player?.piles?.hand || [];
  const drawPile = player?.piles?.draw || [];
  const discardPile = player?.piles?.discard || [];
  const exhaustPile = player?.piles?.exhaust || [];
  const ram = player?.ram ?? 0;
  const maxRam = player?.maxRAM ?? 0;

  const selectedInstance = selectedCardId ? cardInstances[selectedCardId] : null;
  const selectedDef = selectedInstance ? data?.cards?.[selectedInstance.defId] : null;

  // Reset target when enemies change
  useEffect(() => {
    if (targetedEnemyIndex >= enemies.length && enemies.length > 0) {
      setTargetedEnemyIndex(0);
    }
  }, [enemies.length, targetedEnemyIndex]);

  // Clear selection if card leaves hand
  useEffect(() => {
    if (selectedCardId && !hand.includes(selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [hand, selectedCardId]);

  const canPlayCard = (cid) => {
    const ci = cardInstances[cid];
    if (!ci) return false;
    const def = data?.cards?.[ci.defId];
    if (!def) return false;
    const cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
    return player?.ram >= cost;
  };

  const handlePlayCard = () => {
    if (!selectedCardId || !canPlayCard(selectedCardId)) return;
    const target = enemies[targetedEnemyIndex]?.id ?? enemies[0]?.id;
    onAction?.({ type: 'Combat_PlayCard', cardInstanceId: selectedCardId, targetEnemyId: target });
    setSelectedCardId(null);
  };

  const handleEndTurn = () => {
    // Capture intents before the turn resolves — that's what enemies are about to do
    const snapshot = {};
    for (const enemy of enemies) {
      if (enemy.hp > 0 && enemy.intent?.type) snapshot[enemy.id] = enemy.intent.type;
    }
    onAction?.({ type: 'Combat_EndTurn' });
    setSelectedCardId(null);
    if (Object.keys(snapshot).length) {
      setActingEnemies(snapshot);
      setTimeout(() => setActingEnemies({}), 600);
    }
  };

  // Victory / Defeat
  if (!combat || combat.combatOver) {
    const victory = combat?.victory;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: C.bg,
        }}
      >
        <div
          className="animate-slide-up"
          style={{
            fontSize: '30px',
            fontFamily: MONO,
            fontWeight: 700,
            marginBottom: '8px',
            color: victory ? C.neonGreen : C.neonRed,
          }}
        >
          {victory ? 'VICTORY' : 'DEFEATED'}
        </div>
        <div style={{ fontFamily: MONO, marginBottom: '32px', color: C.textDim, fontSize: 13 }}>
          {victory ? 'Systems operational' : 'Connection lost'}
        </div>
        <button
          onClick={() => onAction?.({ type: 'GoToMap' })}
          style={{
            padding: '16px 32px',
            borderRadius: '12px',
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: '18px',
            transition: 'all 0.2s ease',
            backgroundColor: victory ? C.neonGreen : C.neonRed,
            color: '#000',
            boxShadow: `0 0 30px ${victory ? C.neonGreen : C.neonRed}40`,
          }}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: C.bg,
        backgroundImage: `
          linear-gradient(${C.neonCyan}03 1px, transparent 1px),
          linear-gradient(90deg, ${C.neonCyan}03 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px',
      }}
    >
      {/* ============ ZONE A: ENEMIES (top) ============ */}
      <div
        className="safe-area-top"
        style={{
          flex: '0 0 auto',
          minHeight: '20vh',
          maxHeight: '38vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 8px',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'stretch' }}>
          {enemies.map((enemy, i) => (
            <EnemyCard
              key={enemy.id}
              enemy={enemy}
              isTargeted={i === targetedEnemyIndex}
              onClick={() => setTargetedEnemyIndex(i)}
              actingType={actingEnemies[enemy.id] || null}
            />
          ))}
        </div>
      </div>

      {/* ============ ZONE B: CENTER CARD + EXECUTE (middle) ============ */}
      {/* This is a non-scrolling flex zone. EXECUTE button is OUTSIDE any overflow container. */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 8px',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, overflow: 'auto', width: '100%' }}>
          <CenterCardDisplay
            cardInstance={selectedInstance}
            cardDef={selectedDef}
            data={data}
          />
        </div>

        {/* EXECUTE button - outside overflow container to fix click-through bug */}
        {selectedCardId && canPlayCard(selectedCardId) && (
          <button
            onClick={handlePlayCard}
            className="animate-slide-up"
            style={{
              flexShrink: 0,
              margin: '6px auto',
              padding: '10px 36px',
              borderRadius: '12px',
              fontFamily: MONO,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'all 0.2s ease',
              backgroundColor: getCardColor(selectedDef?.type),
              color: '#000',
              boxShadow: `0 0 24px ${getCardColor(selectedDef?.type)}50`,
              fontSize: 14,
              cursor: 'pointer',
              zIndex: 30,
            }}
          >
            {'\u25B6'} EXECUTE
          </button>
        )}
      </div>

      {/* ============ ZONE C: PLAYER PANEL + HAND CARDS ============ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px',
          padding: '8px 8px 4px 8px',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        {/* Left: Player Stats */}
        <PlayerPanel
          player={player}
          turn={combat.turn}
        />

        {/* Right: Compact fanned hand cards */}
        <div
          ref={handScrollRef}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            overflowX: 'auto',
            paddingRight: '4px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {hand.map((cid, idx) => {
            const ci = cardInstances[cid];
            const def = data?.cards?.[ci?.defId];
            return (
              <div
                key={cid}
                style={{
                  marginLeft: idx > 0 ? '-10px' : 0,
                  zIndex: selectedCardId === cid ? 20 : hand.length - idx,
                  transition: 'all 0.2s ease',
                }}
              >
                <HandCard
                  cardInstance={ci}
                  cardDef={def}
                  isSelected={selectedCardId === cid}
                  canPlay={canPlayCard(cid)}
                  onSelect={() => setSelectedCardId(selectedCardId === cid ? null : cid)}
                  compact={true}
                  showTooltip={aiPaused}
                  onHover={(cd, x, y) => setTooltip({ cardDef: cd, x, y })}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ============ ZONE D: RAM BAR + ACTION BUTTONS (bottom) ============ */}
      <div
        className="safe-area-bottom"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          padding: '6px 10px 10px 10px',
          backgroundColor: C.bgDark,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        {/* Row 1: RAM bar */}
        <RamBar ram={ram} maxRam={maxRam} />

        {/* Row 2: Pile buttons + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Pile count buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setViewingPile('draw')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                fontFamily: MONO,
                transition: 'all 0.15s ease',
                backgroundColor: C.bgCard,
                border: `1px solid ${C.neonCyan}30`,
                fontSize: 11,
              }}
            >
              <span style={{ color: C.neonCyan, fontWeight: 700 }}>{drawPile.length}</span>
              <span style={{ color: C.textDim }}>Draw</span>
            </button>
            <button
              onClick={() => setViewingPile('discard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                fontFamily: MONO,
                transition: 'all 0.15s ease',
                backgroundColor: C.bgCard,
                border: `1px solid ${C.neonOrange}30`,
                fontSize: 11,
              }}
            >
              <span style={{ color: C.neonOrange, fontWeight: 700 }}>{discardPile.length}</span>
              <span style={{ color: C.textDim }}>Disc</span>
            </button>
            <button
              onClick={() => setViewingPile('exhaust')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                fontFamily: MONO,
                transition: 'all 0.15s ease',
                backgroundColor: C.bgCard,
                border: `1px solid ${C.neonRed}30`,
                fontSize: 11,
              }}
            >
              <span style={{ color: C.neonRed, fontWeight: 700 }}>{exhaustPile.length}</span>
              <span style={{ color: C.textDim }}>Exh</span>
            </button>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => onAction?.({ type: 'Combat_Simulate', maxTurns: 50 })}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                fontFamily: MONO,
                fontWeight: 700,
                textTransform: 'uppercase',
                transition: 'all 0.15s ease',
                backgroundColor: `${C.neonPurple}20`,
                color: C.neonPurple,
                border: `1px solid ${C.neonPurple}40`,
                fontSize: 9,
              }}
            >
              AUTO
            </button>
            <button
              onClick={handleEndTurn}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontFamily: MONO,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'all 0.15s ease',
                backgroundColor: C.neonCyan,
                color: '#000',
                boxShadow: `0 0 14px ${C.neonCyan}40`,
                fontSize: 11,
              }}
            >
              END TURN
            </button>
          </div>
        </div>
      </div>

      {/* Pile viewer modal */}
      {viewingPile && (
        <PileViewer
          title={viewingPile === 'draw' ? 'Draw Pile' : viewingPile === 'discard' ? 'Discard Pile' : 'Exhausted'}
          cards={viewingPile === 'draw' ? drawPile : viewingPile === 'discard' ? discardPile : exhaustPile}
          cardInstances={cardInstances}
          data={data}
          onClose={() => setViewingPile(null)}
        />
      )}

      {/* Paused overlay banner */}
      {aiPaused && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          textAlign: 'center',
          padding: '3px 0',
          backgroundColor: '#ffe60018',
          borderBottom: '1px solid #ffe60040',
          fontFamily: MONO,
          fontSize: 9,
          fontWeight: 700,
          color: '#ffe600',
          letterSpacing: '0.12em',
          pointerEvents: 'none',
        }}>
          ⏸ AI PAUSED — hover cards to inspect effects
        </div>
      )}

      {/* Card effect tooltip */}
      {aiPaused && tooltip.cardDef && (
        <CardEffectTooltip
          cardDef={tooltip.cardDef}
          perspective="player"
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
    </div>
  );
}
