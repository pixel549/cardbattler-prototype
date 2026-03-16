import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { getEnemyImage } from '../data/enemyImages.js';
import { getCardImage } from '../data/cardImages.js';
import RuntimeArt from './RuntimeArt.jsx';
import { sfx } from '../game/sounds.js';
import { getCardPlayability, getCardTargetingProfile } from '../game/engine.js';
import { getCardHeatGain, getHeatState } from '../game/combatMeta.js';
import { getBossDirectiveReadout, getEnemyDirectiveSummaries } from '../game/combatDirectives.js';
import useDialogAccessibility from '../hooks/useDialogAccessibility.js';
import usePlaytestRecorder from '../hooks/usePlaytestRecorder.js';
import {
  BOSS_PHASE_AUDIO_PATTERN,
  HEAT_THRESHOLD_MARKERS,
  SYSTEM_WARNING_AUDIO_PATTERN,
  getBossReadoutTone,
  getCombatFloatLayout,
  getEnemyAnimationAnchor,
  getHeatBarTextColor,
  getHeatVisualState,
} from './combatPresentation.js';

/**
 * CombatScreen - Cyberpunk deckbuilder combat UI
 *
 * Layout (top to bottom):
 * 1. Enemy zone (top) - enemies with prominent HP bars, status effects, intent
 * 2. Center zone - selected card display with mutation callouts
 * 3. Player zone - player stats (left) + hand cards (right)
 * 4. Bottom bar - RAM pips + pile counts + END TURN
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
const DISPLAY = "'Rajdhani', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

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

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};
const DOUBLE_TAP_WINDOW_MS = 320;
const PLAYER_TARGET_ID = '__player__';

function HeatBar({ heat = 0, maxHeat = 20, height = 12, showText = true }) {
  const safeMax = Math.max(1, Number(maxHeat || 20));
  const safeHeat = Math.max(0, Math.min(safeMax, Number(heat || 0)));
  const pct = Math.max(0, Math.min(100, (safeHeat / safeMax) * 100));
  const tone = getHeatVisualState(safeHeat, safeMax);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: height / 2, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: `1px solid ${tone.color}33` }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: height / 2,
          background: `linear-gradient(90deg, ${C.neonYellow} 0%, ${tone.color} 100%)`,
            boxShadow: `0 0 16px ${tone.glow}`,
            transition: 'width 0.2s ease',
          }}
        />
      {HEAT_THRESHOLD_MARKERS.map((marker) => (
        <div
          key={marker.label}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${marker.ratio * 100}% - 1px)`,
            width: 2,
            background: `${marker.color}66`,
            boxShadow: `0 0 8px ${marker.color}2c`,
            pointerEvents: 'none',
          }}
        />
      ))}
        {showText && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: Math.max(8, height - 4), fontWeight: 700, color: getHeatBarTextColor(), mixBlendMode: 'screen' }}>
            HEAT {safeHeat}/{safeMax}
          </div>
        )}
    </div>
  );
}

function CombatConditionStrip({ heat = 0, maxHeat = 20, arenaModifier = null, compact = false }) {
  const tone = getHeatVisualState(heat, maxHeat);
  const fontSize = compact ? 8 : 9;
  const padding = compact ? '3px 7px' : '4px 8px';

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: compact ? 'flex-start' : 'center' }}>
      <div
        title={`Trace heat ${heat}/${maxHeat}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding,
          borderRadius: 999,
          fontFamily: MONO,
          fontSize,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: tone.color,
          backgroundColor: `${tone.color}18`,
          border: `1px solid ${tone.color}36`,
        }}
      >
        HEAT {heat}/{maxHeat} {tone.label}
      </div>
      {arenaModifier && (
        <div
          title={arenaModifier.summary || arenaModifier.shortSummary || arenaModifier.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding,
            borderRadius: 999,
            fontFamily: MONO,
            fontSize,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: arenaModifier.color || C.neonOrange,
            backgroundColor: `${arenaModifier.color || C.neonOrange}16`,
            border: `1px solid ${(arenaModifier.color || C.neonOrange)}34`,
          }}
        >
          {arenaModifier.label}
        </div>
      )}
    </div>
  );
}

function BossProtocolPanel({ readout, compact = false }) {
  if (!readout) return null;

  const tone = getBossReadoutTone(readout.emphasis);
  const titleSize = compact ? 8 : 9;
  const bodySize = compact ? 7 : 8;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 5 : 6,
        padding: compact ? '7px 8px' : '8px 9px',
        borderRadius: 12,
        background: 'rgba(3,7,14,0.76)',
        border: `1px solid ${tone.border}`,
        boxShadow: `0 0 16px ${tone.background}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: titleSize, fontWeight: 700, letterSpacing: '0.12em', color: tone.color, textTransform: 'uppercase' }}>
          Boss Protocol
        </div>
        <div
          style={{
            padding: compact ? '2px 5px' : '3px 6px',
            borderRadius: 999,
            border: `1px solid ${tone.border}`,
            background: tone.background,
            color: tone.color,
            fontFamily: MONO,
            fontSize: compact ? 6 : 7,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {readout.title}
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: bodySize, lineHeight: 1.45, color: '#d6deea' }}>
        {readout.objective}
      </div>
      {readout.counterplay && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 3 : 4 }}>
          <div style={{ fontFamily: MONO, fontSize: compact ? 6 : 7, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim, textTransform: 'uppercase' }}>
            Counterplay
          </div>
          <div style={{ fontFamily: MONO, fontSize: bodySize, lineHeight: 1.45, color: C.textSecondary }}>
            {readout.counterplay}
          </div>
        </div>
      )}
      {readout.progress && (
        <div
          style={{
            padding: compact ? '5px 6px' : '6px 7px',
            borderRadius: 10,
            border: `1px solid ${tone.border}`,
            background: tone.background,
            color: tone.color,
            fontFamily: MONO,
            fontSize: bodySize,
            fontWeight: 700,
            lineHeight: 1.45,
          }}
        >
          {readout.progress}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: compact ? 6 : 7, color: C.textDim, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Phase Tracker
        </div>
        <div style={{ fontFamily: MONO, fontSize: bodySize, color: C.textPrimary }}>
          {readout.nextPhase}
        </div>
      </div>
    </div>
  );
}

function describeCardPlayabilityReason(reason, targetLabel = 'that target') {
  switch (reason) {
    case 'disabled':
      return 'This card is disabled right now';
    case 'hp_lock':
      return 'Your HP is too low to use this card';
    case 'hp_requirement':
      return 'You need more HP to use this card';
    case 'enemy_status_requirement':
      return `This card needs ${targetLabel} to already have a status effect`;
    case 'kernel_condition':
      return 'Firewall must be active first';
    case 'must_be_first':
      return 'This must be the first card you play this turn';
    case 'cannot_be_first':
      return 'Play another card first';
    case 'cannot_follow':
      return 'This card cannot follow the previous play';
    case 'play_window':
      return 'This card waited too long in hand';
    case 'locked_slot':
      return 'Play this card from its locked hand slot';
    case 'skip_every_other':
      return 'This card is waiting out its skip turn';
    case 'locked_turns':
      return 'This card is still locked for a few turns';
    case 'requires_hand_card':
      return 'You need another card in hand to fuel this effect';
    case 'ram':
      return 'Not enough RAM';
    default:
      return 'This card cannot be used right now';
  }
}

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

function formatMutationCounter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.ceil(numeric));
}

function isCoreCard(cardDef) {
  return (cardDef?.tags || EMPTY_ARRAY).includes('Core');
}

function getCardLifecycleDisplay(cardDef, cardInstance) {
  const core = isCoreCard(cardDef);
  const nextValue = core ? 'N/A' : formatMutationCounter(cardInstance?.useCounter);
  const finalValue = core ? 'N/A' : formatMutationCounter(cardInstance?.finalMutationCountdown);
  const countdownValue = core ? 'N/A' : formatMutationCounter(cardInstance?.finalMutationCountdown);
  const isDecaying = !core
    && cardInstance?.finalMutationCountdown != null
    && cardInstance.finalMutationCountdown <= 3
    && !cardInstance?.finalMutationId;
  return { core, nextValue, finalValue, countdownValue, isDecaying };
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

function getTutorialFocusFrameStyle(active, tone = C.neonCyan, padding = 8, radius = 20) {
  if (!active) return null;
  return {
    padding,
    borderRadius: radius,
    border: `1px solid ${tone}55`,
    background: `${tone}08`,
    boxShadow: `0 0 0 1px ${tone}18, 0 0 28px ${tone}18`,
  };
}

function getCombatTutorialFocus(step) {
  if (!step || step.mode !== 'Combat') {
    return {
      enemy: false,
      center: false,
      actions: false,
    };
  }
  if (step.id?.includes('end_turn')) {
    return { enemy: false, center: false, actions: true };
  }
  if (step.id === 'phase_read' || step.id === 'adaptive_intro') {
    return { enemy: true, center: false, actions: false };
  }
  return { enemy: true, center: true, actions: false };
}

function parseMutationPatch(patchStr) {
  if (!patchStr) return [];
  const entries = [];
  for (const segment of String(patchStr).split('|')) {
    const tokens = segment.split(':');
    if (tokens.length < 2) continue;
    let i = 0;
    const trigger = tokens[i++];
    let chance = null;
    let condition = null;
    if (tokens[i] === 'chance') {
      i++;
      chance = parseFloat(tokens[i++]) || null;
    }
    if (tokens[i]?.startsWith('If')) condition = tokens[i++];
    const op = tokens[i++];
    const args = tokens.slice(i);
    if (trigger && op) entries.push({ trigger, chance, condition, op, args });
  }
  return entries;
}

function formatMutationMultiplier(multiplier) {
  return Math.round(Math.abs((multiplier - 1) * 100));
}

function describeMutationPatchEntry(entry) {
  const chancePrefix = entry.chance != null ? `${Math.round(entry.chance * 100)}% chance ` : '';
  const triggerPrefix =
    entry.trigger === 'passive' ? 'Passive: '
      : entry.trigger === 'onPlay' ? 'On play: '
        : entry.trigger === 'onApply' ? 'When gained: '
          : entry.trigger === 'onTurnStart' ? 'At turn start: '
            : entry.trigger === 'onMutate' ? 'When this mutates: '
              : entry.trigger === 'onBrick' ? 'On brick: '
                : `${humanizeStatusId(entry.trigger)}: `;
  const conditionPrefix =
    entry.condition === 'IfInHand' ? 'while in hand, '
      : entry.condition === 'IfExactKill' ? 'if this exact-kills, '
        : entry.condition === 'IfEnemyWeak' ? 'if an enemy is Weak, '
          : '';

  switch (entry.op) {
    case 'DealSelfDamage':
      if (entry.args[0] === 'EffectHalf') return `${triggerPrefix}${conditionPrefix}take damage equal to half this card's base damage`;
      return `${triggerPrefix}${conditionPrefix}take ${entry.args[0] || 0} damage`;
    case 'FirstPlayExtraCost':
      return `${triggerPrefix}first play each combat costs +${entry.args[0] || 0} RAM`;
    case 'EffectMult': {
      const mult = parseFloat(entry.args[0]) || 1;
      return mult < 1
        ? `${triggerPrefix}all effects are ${formatMutationMultiplier(mult)}% weaker`
        : `${triggerPrefix}all effects are ${formatMutationMultiplier(mult)}% stronger`;
    }
    case 'DamageMult': {
      const mult = parseFloat(entry.args[0]) || 1;
      return mult < 1
        ? `${triggerPrefix}damage is ${formatMutationMultiplier(mult)}% lower`
        : `${triggerPrefix}damage is ${formatMutationMultiplier(mult)}% higher`;
    }
    case 'RandomizeEffectMult':
      return `${triggerPrefix}effects roll between ${Math.round((parseFloat(entry.args[0]) || 0) * 100)}% and ${Math.round((parseFloat(entry.args[1]) || 0) * 100)}% power`;
    case 'MutationChanceMult': {
      const mult = parseFloat(entry.args[0]) || 1;
      return mult < 1
        ? `${triggerPrefix}future mutations arrive ${formatMutationMultiplier(mult)}% slower`
        : `${triggerPrefix}future mutations arrive ${formatMutationMultiplier(mult)}% faster`;
    }
    case 'CountdownMult': {
      const mult = parseFloat(entry.args[0]) || 1;
      return mult < 1
        ? `${triggerPrefix}final mutation countdown moves ${formatMutationMultiplier(mult)}% slower`
        : `${triggerPrefix}final mutation countdown moves ${formatMutationMultiplier(mult)}% faster`;
    }
    case 'DrawMod':
      return `${triggerPrefix}draw is modified by ${entry.args[0] || 0}`;
    case 'ApplySelfStatus':
      return `${triggerPrefix}${conditionPrefix}gain ${entry.args[1] || 1} ${humanizeStatusId(entry.args[0])}`;
    case 'ApplyEnemyStatus':
      return `${triggerPrefix}${conditionPrefix}apply ${entry.args[1] || 1} ${humanizeStatusId(entry.args[0])}`;
    case 'LoseRAM':
      return `${triggerPrefix}${conditionPrefix}lose ${entry.args[0] || 0} RAM`;
    case 'GainFirewall':
      return `${triggerPrefix}${conditionPrefix}gain ${entry.args[0] || 0} Firewall`;
    case 'LoseFirewall':
      return `${triggerPrefix}${conditionPrefix}lose ${entry.args[0] || 0} Firewall`;
    case 'ClearSelfFirewall':
      return `${triggerPrefix}${conditionPrefix}lose all Firewall`;
    case 'Fizzle':
      return `${chancePrefix}${triggerPrefix}${conditionPrefix}fizzles and does nothing`;
    case 'SwapTarget':
      return `${chancePrefix}${triggerPrefix}${conditionPrefix}can hit the wrong target`;
    case 'DeferredPlay':
      return `${triggerPrefix}resolves on a delay`;
    case 'NotFirst':
      return `${triggerPrefix}cannot be the first card played this turn`;
    case 'MustPlayFirst':
      return `${triggerPrefix}must be the first card played this turn`;
    case 'AddCopyToHand':
      return `${triggerPrefix}${conditionPrefix}add a ${entry.args[0] || ''} copy to hand`.trim();
    case 'DelayedSelfDamage':
      return `${triggerPrefix}${conditionPrefix}take ${entry.args[0] || 0} delayed damage`;
    case 'AccelerateCountdown':
      return `${triggerPrefix}${conditionPrefix}final mutation countdown drops by ${entry.args[0] || 0}`;
    case 'IncreaseCostPermanent':
      return `${triggerPrefix}${conditionPrefix}permanently costs +${entry.args[0] || 0} RAM`;
    case 'ReduceMaxRAM':
      return `${triggerPrefix}lose ${entry.args[0] || 0} max RAM`;
    case 'ReduceMaxHP':
      return `${triggerPrefix}lose ${entry.args[0] || 0} max HP`;
    case 'SpreadMutation':
      return `${triggerPrefix}spread ${entry.args[0] || 1} extra mutation to another card`;
    case 'CopyMutationTo':
      return `${triggerPrefix}copy a mutation to another card`;
    case 'AffectAdjacentCard':
      return `${chancePrefix}${triggerPrefix}${conditionPrefix}can affect a neighbouring hand card`;
    case 'MaxHandMod':
      return `${triggerPrefix}max hand size ${entry.args[0] || 0}`;
    case 'SplitDamageSelf':
      return `${triggerPrefix}${Math.round((parseFloat(entry.args[0]) || 0) * 100)}% of its damage reflects back to you`;
    case 'DelayEffect':
      return `${triggerPrefix}effects are delayed by ${entry.args[0] || 0} turn`;
    case 'RandomizeCost':
      return `${triggerPrefix}RAM cost becomes unstable`;
    case 'InvertEffects':
      return `${triggerPrefix}effects invert`;
    case 'UnstableTiming':
      return `${triggerPrefix}timing becomes unstable`;
    case 'ChokePenalty':
      return `${triggerPrefix}unused-turn penalty applies`;
    case 'GrantEnemyEffect':
      return `${triggerPrefix}grants an enemy part of this effect`;
    case 'HiddenInvert':
      return `${triggerPrefix}behaves opposite to expectation`;
    case 'LoseType':
      return `${triggerPrefix}loses its card type`;
    case 'RequireHPAbove':
      return `${triggerPrefix}only works above ${entry.args[0] || 0}% HP`;
    case 'ConditionalPenalty':
      return `${triggerPrefix}conditional penalty applies`;
    case 'DisabledBelowHP':
      return `${triggerPrefix}is disabled below ${entry.args[0] || 0}% HP`;
    case 'RequireEnemyStatus':
      return `${triggerPrefix}needs an affected enemy to work`;
    case 'CannotFollowPrevious':
      return `${triggerPrefix}cannot be played right after the previous card`;
    case 'LockedSlot':
      return `${triggerPrefix}is locked to one hand slot`;
    case 'PlayWindowTurns':
      return `${triggerPrefix}must be played within ${entry.args[0] || 0} turn`;
    case 'Disabled':
      return `${triggerPrefix}card is disabled`;
    case 'NoEffect':
      return `${triggerPrefix}card has no effect`;
    case 'TransferToEnemy':
      return `${triggerPrefix}jumps to the enemy network`;
    case 'LockHand':
      return `${triggerPrefix}locks the rest of your hand`;
    case 'MutationResist':
      return `${triggerPrefix}${Math.round((parseFloat(entry.args[0]) || 0) * 100)}% resistance to future mutations`;
    case 'SelfDamageResist':
      return `${triggerPrefix}${Math.round((parseFloat(entry.args[0]) || 0) * 100)}% less mutation self-damage`;
    case 'MutationTierBias':
      return `${triggerPrefix}future mutations bias toward ${String(entry.args[0] || '').toLowerCase()} tiers`;
    case 'MutationBlock':
      return `${triggerPrefix}blocks ${entry.args[0] || 0} future mutation`;
    case 'RAMBufferMod':
      return `${triggerPrefix}RAM buffer +${entry.args[0] || 0}`;
    default:
      return `${triggerPrefix}${conditionPrefix}${entry.op}${entry.args.length ? ` (${entry.args.join(', ')})` : ''}`;
  }
}

function getMutationDetailLines(mut) {
  if (!mut) return [];
  const lines = [];
  if (mut.ramCostDelta > 0) lines.push(`Costs +${mut.ramCostDelta} RAM`);
  if (mut.ramCostDelta < 0) lines.push(`Costs ${Math.abs(mut.ramCostDelta)} less RAM`);
  if (mut.useCounterDelta > 0) lines.push(`Mutates ${mut.useCounterDelta} use${mut.useCounterDelta === 1 ? '' : 's'} later`);
  if (mut.useCounterDelta < 0) lines.push(`Mutates ${Math.abs(mut.useCounterDelta)} use${Math.abs(mut.useCounterDelta) === 1 ? '' : 's'} sooner`);
  if (mut.finalCountdownDelta > 0) lines.push(`Final mutation delayed by ${mut.finalCountdownDelta}`);
  if (mut.finalCountdownDelta < 0) lines.push(`Final mutation accelerated by ${Math.abs(mut.finalCountdownDelta)}`);
  for (const entry of parseMutationPatch(mut.patch)) {
    lines.push(describeMutationPatchEntry(entry));
  }
  return lines;
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
// STATUS DESCRIPTIONS (shown in tooltips on hover/tap)
// ============================================================
/* legacy status descriptions retained during mojibake cleanup
const LEGACY_STATUS_DESCRIPTIONS = {
  Firewall:        'Persistent shield — absorbs incoming damage before HP and soft-decays each turn.',
  Weak:            'Deal 25% less damage while active. Decays 1/turn.',
  Vulnerable:      'Take 50% more incoming damage while active. Decays 1/turn.',
  Leak:            'DoT: 1 damage per stack each turn (data hemorrhage). Decays 1/turn.',
  ExposedPorts:    'Take 40% more incoming damage while active. Decays 1/turn.',
  SensorGlitch:    'Reduces outgoing damage −15% per stack (max 60%). Decays 1/turn.',
  Corrode:         'Strips Firewall and deals 1 HP damage per stack each turn. Decays 1/turn.',
  Underclock:      'Reduces outgoing damage −10% per stack (max 50%). Decays 1/turn.',
  Overclock:       'Boosts outgoing damage +25% per stack (max +150%). Decays 1/turn.',
  Nanoflow:        'Heals HP equal to stacks at start of each turn. Decays 1/turn.',
  TargetSpoof:     'Confused targeting: −25% damage per stack (max 75%). Decays 1/turn.',
  Overheat:        'DoT: deals stacks×HP damage to self each turn. Decays 1/turn.',
  Throttled:       'Reduces outgoing damage −15% per stack (max 60%). Decays 1/turn.',
  TraceBeacon:     'Tracking marker: take +20% damage per stack from all sources.',
  Burn:            'DoT: 2 HP damage per stack each turn. Decays 1/turn.',
  CorruptedSector: 'Cannot gain Firewall this turn. Decays 1/turn.',
  DazedPackets:    'Scrambled packets: −20% outgoing damage per stack (max 80%). Decays 1/turn.',
};

*/

const STATUS_DESCRIPTIONS = {
  Firewall:        'Persistent shield - absorbs incoming damage before HP and soft-decays by 20% each turn.',
  Weak:            'Deal 25% less damage while active. Decays 1/turn.',
  Vulnerable:      'Take 50% more incoming damage while active. Decays 1/turn.',
  Leak:            'DoT: 1 damage per stack each turn (data hemorrhage). Decays 1/turn.',
  ExposedPorts:    'Take 40% more incoming damage while active. Decays 1/turn.',
  SensorGlitch:    'Reduces outgoing damage -15% per stack (max 60%). Decays 1/turn.',
  Corrode:         'Strips Firewall and deals 1 HP damage per stack each turn. Decays 1/turn.',
  Underclock:      'Reduces outgoing damage -10% per stack (max 50%). Decays 1/turn.',
  Overclock:       'Boosts outgoing damage +25% per stack (max +150%). Decays 1/turn.',
  Nanoflow:        'Heals HP equal to stacks at start of each turn. Decays 1/turn.',
  TargetSpoof:     'Confused targeting: -25% damage per stack (max 75%). Decays 1/turn.',
  Overheat:        'DoT: deals stacks x HP damage to self each turn. Decays 1/turn.',
  Throttled:       'Reduces outgoing damage -15% per stack (max 60%). Decays 1/turn.',
  TraceBeacon:     'Tracking marker: take +20% damage per stack from all sources.',
  Burn:            'DoT: 2 HP damage per stack each turn. Decays 1/turn.',
  CorruptedSector: 'Cannot gain Firewall this turn. Decays 1/turn.',
  DazedPackets:    'Scrambled packets: -20% outgoing damage per stack (max 80%). Decays 1/turn.',
};

function formatStatusEffectDescription(statusId, stacks, verb = 'Apply') {
  const normalizedStatusId = normalizeStatusId(statusId);
  const statusLabel = humanizeStatusId(normalizedStatusId);
  const amount = stacks ?? '?';
  const baseLine = `${verb} ${amount} ${statusLabel}.`;
  const detail = STATUS_DESCRIPTIONS[normalizedStatusId];
  return detail ? `${baseLine} ${detail}` : baseLine;
}

function isPlayerEntityId(entityId, playerId = 'player') {
  return entityId === 'player' || entityId === playerId;
}

function cloneStatusesForDisplay(statuses = EMPTY_ARRAY) {
  return statuses.map((status) => ({
    id: status.id,
    stacks: status.stacks,
  }));
}

function buildDisplayEntity(baseEntity, snapshot = null) {
  if (!baseEntity && !snapshot) return null;

  const intent = snapshot
    ? {
        ...(baseEntity?.intent || {}),
        type: snapshot.intentType ?? baseEntity?.intent?.type ?? null,
        amount: snapshot.intentAmount ?? baseEntity?.intent?.amount ?? null,
        cardDefId: snapshot.intentCardDefId ?? baseEntity?.intent?.cardDefId ?? null,
      }
    : baseEntity?.intent
      ? { ...baseEntity.intent }
      : null;

  return {
    ...(baseEntity || {}),
    id: snapshot?.id ?? baseEntity?.id ?? null,
    enemyDefId: snapshot?.enemyDefId ?? baseEntity?.enemyDefId ?? null,
    name: snapshot?.name ?? baseEntity?.name ?? baseEntity?.id ?? null,
    hp: snapshot?.hp ?? baseEntity?.hp ?? 0,
    maxHP: snapshot?.maxHP ?? baseEntity?.maxHP ?? 0,
    statuses: cloneStatusesForDisplay(snapshot?.statuses ?? baseEntity?.statuses ?? EMPTY_ARRAY),
    intent,
  };
}

function buildCombatDisplayState(
  combat,
  playerSnapshot = null,
  enemySnapshots = EMPTY_ARRAY,
  metrics = EMPTY_OBJECT,
) {
  if (!combat) return null;

  const snapshotByEnemyId = new Map(
    (enemySnapshots || EMPTY_ARRAY)
      .filter((snapshot) => snapshot?.id)
      .map((snapshot) => [snapshot.id, snapshot]),
  );

  return {
    player: buildDisplayEntity(combat.player, playerSnapshot),
    enemies: (combat.enemies || EMPTY_ARRAY).map((enemy) => buildDisplayEntity(enemy, snapshotByEnemyId.get(enemy.id))),
    ram: metrics.ram ?? combat.player?.ram ?? 0,
    maxRam: metrics.maxRam ?? combat.player?.maxRAM ?? 0,
    heat: metrics.heat ?? combat.heat ?? 0,
    maxHeat: metrics.maxHeat ?? combat.maxHeat ?? 20,
  };
}

function getEnemyImpactBackground(type = 'damage') {
  if (type === 'shield') {
    return 'radial-gradient(circle at 50% 42%, rgba(0,240,255,0.22) 0%, rgba(0,240,255,0.08) 34%, transparent 72%)';
  }
  if (type === 'heal') {
    return 'radial-gradient(circle at 50% 42%, rgba(0,255,107,0.2) 0%, rgba(0,255,107,0.08) 34%, transparent 72%)';
  }
  if (type === 'status') {
    return 'radial-gradient(circle at 50% 42%, rgba(180,74,255,0.22) 0%, rgba(180,74,255,0.08) 34%, transparent 74%)';
  }
  if (type === 'defeat') {
    return 'radial-gradient(circle at 50% 42%, rgba(255,107,0,0.26) 0%, rgba(255,68,51,0.12) 36%, transparent 76%)';
  }
  return 'radial-gradient(circle at 50% 42%, rgba(255,68,51,0.24) 0%, rgba(255,68,51,0.1) 34%, transparent 74%)';
}

function getPlayerImpactBackground(type = 'damage') {
  if (type === 'heal') {
    return 'radial-gradient(circle at 50% 78%, rgba(0,255,107,0.18) 0%, rgba(0,255,107,0.08) 28%, transparent 70%)';
  }
  if (type === 'shield') {
    return 'radial-gradient(circle at 50% 78%, rgba(0,240,255,0.18) 0%, rgba(0,240,255,0.08) 30%, transparent 72%)';
  }
  if (type === 'status') {
    return 'radial-gradient(circle at 50% 78%, rgba(180,74,255,0.18) 0%, rgba(180,74,255,0.08) 30%, transparent 72%)';
  }
  return 'radial-gradient(circle at 50% 78%, rgba(255,68,51,0.2) 0%, rgba(255,68,51,0.08) 30%, transparent 72%)';
}

function buildAnimationEffectTokens(effectSummary = null, reactions = EMPTY_ARRAY) {
  const tokens = [];
  const seen = new Set();
  const pushToken = (label, color) => {
    if (!label || seen.has(label)) return;
    seen.add(label);
    tokens.push({ label, color });
  };

  const summary = effectSummary || {};
  if (summary.damage > 0) pushToken(`-${summary.damage} DMG`, C.neonRed);
  if (summary.heal > 0) pushToken(`+${summary.heal} HP`, C.neonGreen);
  if (summary.defense > 0 || summary.firewallGain > 0) {
    pushToken(`+${summary.defense || summary.firewallGain} FW`, C.neonCyan);
  }
  if (summary.debuff > 0) pushToken('DEBUFF', C.neonPurple);
  if (summary.buff > 0) pushToken('BUFF', C.neonGreen);
  if (summary.draw > 0) pushToken(`DRAW ${summary.draw}`, C.neonYellow);
  if (summary.gainRAM > 0) pushToken(`+${summary.gainRAM} RAM`, C.neonCyan);

  reactions.forEach((reaction) => {
    if (reaction?.impactType === 'status' && reaction.float?.text) {
      pushToken(reaction.float.text.toUpperCase(), reaction.float.color || C.neonPurple);
    }
  });

  return tokens.slice(0, 4);
}

function summarizeCardEffectsForOps(cardDef) {
  const summary = {
    damage: 0,
    heal: 0,
    firewallGain: 0,
    draw: 0,
    gainRAM: 0,
    statuses: [],
    targetsAllEnemies: false,
  };

  for (const effect of cardDef?.effects || EMPTY_ARRAY) {
    if (!effect) continue;
    if (effect.op === 'DealDamage') {
      summary.damage += Number(effect.amount || 0);
      if (effect.target === 'AllEnemies') summary.targetsAllEnemies = true;
      continue;
    }
    if (effect.op === 'GainBlock') {
      summary.firewallGain += Number(effect.amount || 0);
      continue;
    }
    if (effect.op === 'Heal') {
      summary.heal += Number(effect.amount || 0);
      continue;
    }
    if (effect.op === 'DrawCards') {
      summary.draw += Number(effect.amount || 0);
      continue;
    }
    if (effect.op === 'GainRAM') {
      summary.gainRAM += Number(effect.amount || 0);
      continue;
    }
    if (effect.op === 'ApplyStatus' && effect.statusId) {
      summary.statuses.push(`${humanizeStatusId(effect.statusId)} ${effect.stacks || 1}`);
      continue;
    }
    if (effect.op === 'RawText') {
      const text = String(effect.text || '');
      const damageMatch = text.match(/\bDeal\s+(\d+)\s+damage\b/i);
      const firewallMatch = text.match(/\bGain\s+(\d+)\s+Firewall\b/i);
      const healMatch = text.match(/\bHeal\s+(\d+)\b/i);
      const drawMatch = text.match(/\bDraw\s+(\d+)\b/i);
      const ramMatch = text.match(/\bGain\s+(\d+)\s+RAM\b/i);
      const statusMatch = text.match(/\bApply\s+(\d+)\s+([A-Za-z ]+?)\b/i);
      if (damageMatch) summary.damage += Number(damageMatch[1] || 0);
      if (firewallMatch) summary.firewallGain += Number(firewallMatch[1] || 0);
      if (healMatch) summary.heal += Number(healMatch[1] || 0);
      if (drawMatch) summary.draw += Number(drawMatch[1] || 0);
      if (ramMatch) summary.gainRAM += Number(ramMatch[1] || 0);
      if (statusMatch) summary.statuses.push(`${statusMatch[2].trim()} ${statusMatch[1]}`);
      if (/all enemies/i.test(text)) summary.targetsAllEnemies = true;
    }
  }

  return summary;
}

function buildOpsTokensFromCardSummary(summary = null) {
  if (!summary) return EMPTY_ARRAY;
  const tokens = [];
  if (summary.damage > 0) tokens.push({ label: `-${summary.damage} DMG`, color: C.neonRed });
  if (summary.firewallGain > 0) tokens.push({ label: `+${summary.firewallGain} FW`, color: C.neonCyan });
  if (summary.heal > 0) tokens.push({ label: `+${summary.heal} HP`, color: C.neonGreen });
  if (summary.gainRAM > 0) tokens.push({ label: `+${summary.gainRAM} RAM`, color: C.neonYellow });
  if (summary.draw > 0) tokens.push({ label: `DRAW ${summary.draw}`, color: C.textPrimary });
  if (summary.targetsAllEnemies) tokens.push({ label: 'AOE', color: C.neonOrange });
  for (const status of summary.statuses.slice(0, 2)) {
    tokens.push({ label: status.toUpperCase(), color: C.neonPurple });
  }
  return tokens.slice(0, 5);
}

function buildCardHeatForecast(cardDef, cardInstance, heat = 0, maxHeat = 20) {
  if (!cardDef || !cardInstance) return null;
  const effectSummary = summarizeCardEffectsForOps(cardDef);
  const gain = getCardHeatGain({
    cost: Math.max(0, Number(cardDef.costRAM || 0) + Number(cardInstance.ramCostDelta || 0)),
    effectSummary: {
      damage: effectSummary.damage,
      heal: effectSummary.heal,
      defense: effectSummary.firewallGain,
      firewallGain: effectSummary.firewallGain,
      draw: effectSummary.draw,
      gainRAM: effectSummary.gainRAM,
      targetsAllEnemies: effectSummary.targetsAllEnemies,
    },
    tags: cardDef.tags || EMPTY_ARRAY,
    type: cardDef.type,
    compileLevel: Number(cardInstance.compileLevel || 0),
    appliedMutationCount: Number(cardInstance.appliedMutations?.length || 0),
  });
  const nextHeat = Math.min(Math.max(1, Number(maxHeat || 20)), Math.max(0, Number(heat || 0)) + gain);
  const nextState = getHeatState(nextHeat, maxHeat);
  return {
    gain,
    nextHeat,
    nextState,
    effectSummary,
    tokens: buildOpsTokensFromCardSummary(effectSummary),
  };
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
    if (/deal that much damage/.test(t) || /apply that much damage/.test(t)) return C.neonRed;
    if (/strip \d+ firewall/.test(t))             return C.neonRed;
    if (/apply \d+ /.test(t) || /apply [a-z]/i.test(t.toLowerCase())) return C.neonRed; // debuffs player
  if (/gain \d+ firewall/.test(t))              return '#ff9944';    // enemy defense gain -> neutral/bad
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
    return '#ff9944'; // enemy defense/heal = amber
  }
}

function formatOpLine(eff) {
  if (eff.op === 'DealDamage') return `Deal ${eff.amount} damage`;
  if (eff.op === 'GainBlock')  return `Gain ${eff.amount} Firewall`;
  if (eff.op === 'Heal')       return `Heal ${eff.amount} HP`;
  if (eff.op === 'GainRAM')    return `Gain ${eff.amount} RAM`;
  if (eff.op === 'DrawCards')  return `Draw ${eff.amount} card${eff.amount > 1 ? 's' : ''}`;
  if (eff.op === 'ApplyStatus') return `Apply ${eff.stacks} ${humanizeStatusId(eff.statusId)}`;
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
    if (e.op === 'GainBlock') return `+${e.amount} FW`;
    if (e.op === 'Heal') return `+${e.amount} hp`;
    if (e.op === 'GainRAM') return `+${e.amount} RAM`;
    if (e.op === 'DrawCards') return `Draw ${e.amount}`;
    if (e.op === 'ApplyStatus') return `${e.stacks}x ${humanizeStatusId(e.statusId)}`;
    if (e.op === 'RawText') return e.text;
    return e.op;
  }).join(' \u00B7 ');
}

function formatEffectsLong(effects) {
  if (!effects || effects.length === 0) return ['No effect'];
  return effects.map(e => {
    if (e.op === 'DealDamage') return `Deal ${e.amount} damage`;
    if (e.op === 'GainBlock') return `Gain ${e.amount} Firewall`;
    if (e.op === 'Heal') return `Heal ${e.amount} HP`;
    if (e.op === 'GainRAM') return `Gain ${e.amount} RAM`;
    if (e.op === 'DrawCards') return `Draw ${e.amount} card${e.amount > 1 ? 's' : ''}`;
    if (e.op === 'ApplyStatus') return `Apply ${e.stacks} ${humanizeStatusId(e.statusId)}`;
    if (e.op === 'RawText') return e.text;
    return e.op;
  });
}

function humanizeStatusId(rawStatusId) {
  return normalizeStatusId(rawStatusId)?.replace(/([a-z])([A-Z])/g, '$1 $2') || rawStatusId;
}

function normalizeStatusId(rawStatusId) {
  if (!rawStatusId) return rawStatusId;
  const matchedId = Object.keys(STATUS_META).find((statusId) => statusId.toLowerCase() === rawStatusId.toLowerCase());
  return matchedId || rawStatusId;
}

const CARD_KEYWORD_DESCRIPTIONS = {
  Volatile: 'Volatile - discarded after use.',
  OneShot: 'One-Shot - permanently removed after use.',
  Exhaust: 'Exhaust - removed from the deck for the rest of this combat.',
  Ethereal: 'Ethereal - exhausted if not played this turn.',
  Power: 'Power - stays in play permanently and provides ongoing passive effects.',
  Core: 'Core - stable starter code that does not mutate.',
};

const CARD_KEYWORD_COLORS = {
  Volatile: C.neonOrange,
  OneShot: C.neonRed,
  Exhaust: C.neonPurple,
  Ethereal: C.neonPurple,
  Power: C.neonPurple,
  Core: C.neonCyan,
};

const CARD_KEYWORD_ICONS = {
  Volatile: '!',
  OneShot: '1x',
  Exhaust: 'EXH',
  Ethereal: 'ETH',
  Power: 'PWR',
  Core: 'CORE',
};

const CARD_KEYWORD_ALIAS_TO_ID = {
  firewall: 'Firewall',
  weak: 'Weak',
  vulnerable: 'Vulnerable',
  leak: 'Leak',
  'exposed ports': 'ExposedPorts',
  exposedports: 'ExposedPorts',
  'sensor glitch': 'SensorGlitch',
  sensorglitch: 'SensorGlitch',
  corrode: 'Corrode',
  underclock: 'Underclock',
  overclock: 'Overclock',
  overclocked: 'Overclock',
  nanoflow: 'Nanoflow',
  'target spoof': 'TargetSpoof',
  targetspoof: 'TargetSpoof',
  throttled: 'Throttled',
  'trace beacon': 'TraceBeacon',
  tracebeacon: 'TraceBeacon',
  overheat: 'Overheat',
  'corrupted sector': 'CorruptedSector',
  corruptedsector: 'CorruptedSector',
  'dazed packets': 'DazedPackets',
  dazedpackets: 'DazedPackets',
  volatile: 'Volatile',
  oneshot: 'OneShot',
  'one shot': 'OneShot',
  exhaust: 'Exhaust',
  ethereal: 'Ethereal',
  power: 'Power',
  core: 'Core',
};

const CARD_KEYWORD_PATTERNS = [
  'Sensor Glitch',
  'Exposed Ports',
  'Target Spoof',
  'Trace Beacon',
  'Corrupted Sector',
  'Dazed Packets',
  'Overclocked',
  'Overclock',
  'Underclock',
  'Firewall',
  'Vulnerable',
  'Nanoflow',
  'Throttled',
  'Overheat',
  'Corrode',
  'Volatile',
  'One Shot',
  'OneShot',
  'Exhaust',
  'Ethereal',
  'Power',
  'Core',
  'Weak',
  'Leak',
].sort((a, b) => b.length - a.length);

const CARD_KEYWORD_REGEX = new RegExp(`\\b(${CARD_KEYWORD_PATTERNS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

function normalizeKeywordLookup(rawKeyword) {
  return String(rawKeyword || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

function getCardKeywordInfo(rawKeyword) {
  const keywordId = CARD_KEYWORD_ALIAS_TO_ID[normalizeKeywordLookup(rawKeyword)];
  if (!keywordId) return null;

  if (STATUS_DESCRIPTIONS[keywordId]) {
    const meta = getStatusMeta(keywordId);
    return {
      id: keywordId,
      label: humanizeStatusId(keywordId),
      color: meta.color,
      icon: meta.icon,
      description: STATUS_DESCRIPTIONS[keywordId],
    };
  }

  return {
    id: keywordId,
    label: keywordId === 'OneShot' ? 'One-Shot' : keywordId,
    color: CARD_KEYWORD_COLORS[keywordId] || C.neonCyan,
    icon: CARD_KEYWORD_ICONS[keywordId] || 'i',
    description: CARD_KEYWORD_DESCRIPTIONS[keywordId],
  };
}

function getVisibleCardTags(tags = EMPTY_ARRAY) {
  return tags.filter((tag) => Boolean(getCardKeywordInfo(tag)));
}

function KeywordTooltipToken({ text, asChip = false, compact = false }) {
  const info = getCardKeywordInfo(text);
  const [tipVisible, setTipVisible] = React.useState(false);
  const [tipPos, setTipPos] = React.useState({ x: 0, y: 0 });
  const holdRef = useRef(null);
  const suppressClickRef = useRef(false);

  if (!info) return <>{text}</>;

  const openFromTarget = (target, x = null, y = null) => {
    const rect = target.getBoundingClientRect();
    setTipPos({
      x: x ?? rect.left + (rect.width / 2),
      y: y ?? rect.top,
    });
    setTipVisible(true);
  };

  const clearHold = () => {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };

  const tokenStyle = asChip ? {
    display: 'inline-flex',
    alignItems: 'center',
    gap: compact ? 3 : 4,
    padding: compact ? '1px 4px' : '2px 6px',
    borderRadius: 4,
    fontFamily: MONO,
    fontSize: compact ? 7 : 8,
    fontWeight: 700,
    backgroundColor: `${info.color}16`,
    color: info.color,
    border: `1px solid ${info.color}30`,
    boxShadow: '0 1px 6px rgba(0,0,0,0.22)',
    cursor: 'help',
    pointerEvents: 'auto',
  } : {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontFamily: MONO,
    color: info.color,
    textDecoration: `underline dotted ${info.color}`,
    textUnderlineOffset: '0.16em',
    cursor: 'help',
    pointerEvents: 'auto',
  };

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        title={`${info.label}: ${info.description}`}
        onMouseEnter={(e) => { e.stopPropagation(); openFromTarget(e.currentTarget, e.clientX, e.clientY); }}
        onMouseLeave={() => setTipVisible(false)}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          e.stopPropagation();
          suppressClickRef.current = false;
          clearHold();
          holdRef.current = window.setTimeout(() => {
            suppressClickRef.current = true;
            openFromTarget(e.currentTarget);
          }, 420);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') e.stopPropagation();
          clearHold();
        }}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
        onClick={(e) => {
          e.stopPropagation();
          if (suppressClickRef.current) {
            e.preventDefault();
            suppressClickRef.current = false;
            return;
          }
          openFromTarget(e.currentTarget);
          setTipVisible((visible) => !visible);
        }}
        style={tokenStyle}
      >
        {asChip && <span style={{ fontSize: compact ? 6 : 7 }}>{info.icon}</span>}
        <span>{text}</span>
      </span>
      {tipVisible && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(tipPos.x + 8, window.innerWidth - 220),
            top: tipPos.y - 8,
            transform: 'translateY(-100%)',
            zIndex: 9999,
            backgroundColor: '#0d0d18',
            border: `1px solid ${info.color}50`,
            borderRadius: 8,
            padding: '7px 10px',
            maxWidth: 210,
            boxShadow: `0 4px 20px rgba(0,0,0,0.85), 0 0 12px ${info.color}20`,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, color: info.color, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {info.icon} {info.label}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: '#b0b0b0', lineHeight: 1.5 }}>
            {info.description}
          </div>
        </div>
      )}
    </span>
  );
}

function renderKeywordText(text, keyPrefix, options = {}) {
  if (!text) return text;
  const parts = String(text).split(CARD_KEYWORD_REGEX);
  return parts.map((part, index) => {
    const info = getCardKeywordInfo(part);
    if (!info) return <React.Fragment key={`${keyPrefix}-${index}`}>{part}</React.Fragment>;
    return (
      <KeywordTooltipToken
        key={`${keyPrefix}-${index}`}
        text={part}
        asChip={options.asChip}
        compact={options.compact}
      />
    );
  });
}

function parseIntentRawTextBadges(text, enemy) {
  if (!text) return EMPTY_ARRAY;

  const firewallStacks = enemy?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
  const parts = text.split(/(?:\.\s*|\s*;\s*|\s*\|\s*)/).map((part) => part.trim()).filter(Boolean);
  const badges = [];

  for (const part of parts) {
    let match = null;

    if ((match = part.match(/deal\s+(\d+)\s+damage/i))) {
      badges.push({ icon: '\u2694', value: match[1], label: 'Damage', description: part, color: C.neonRed });
      continue;
    }
    if ((match = part.match(/gain\s+(\d+)\s+(?:block|firewall)/i))) {
      badges.push({
        icon: getStatusMeta('Firewall').icon,
        value: match[1],
        label: 'Firewall',
        description: formatStatusEffectDescription('Firewall', match[1], 'Gain'),
        color: getStatusMeta('Firewall').color,
      });
      continue;
    }
    if ((match = part.match(/heal\s+(\d+)\s+hp/i))) {
      badges.push({ icon: '\u2665', value: match[1], label: 'Heal', description: part, color: C.neonGreen });
      continue;
    }
    if ((match = part.match(/gain\s+(\d+)\s+ram/i))) {
      badges.push({ icon: '\u26A1', value: match[1], label: 'RAM', description: part, color: C.neonYellow });
      continue;
    }
    if ((match = part.match(/draw\s+(\d+)/i))) {
      badges.push({ icon: '\u21BB', value: match[1], label: 'Draw', description: part, color: C.textPrimary });
      continue;
    }
    if ((match = part.match(/strip\s+(\d+)\s+firewall/i))) {
      badges.push({ icon: getStatusMeta('Firewall').icon, value: `-${match[1]}`, label: 'Strip Firewall', description: part, color: C.neonOrange });
      continue;
    }
    if ((match = part.match(/gain\s+(\d+)\s+firewall/i))) {
      badges.push({
        icon: getStatusMeta('Firewall').icon,
        value: match[1],
        label: 'Firewall',
        description: formatStatusEffectDescription('Firewall', match[1], 'Gain'),
        color: getStatusMeta('Firewall').color,
      });
      continue;
    }
    if ((match = part.match(/apply\s+(\d+)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i))) {
      const statusId = normalizeStatusId(match[2]);
      const meta = getStatusMeta(statusId);
      badges.push({
        icon: meta.icon,
        value: match[1],
        label: humanizeStatusId(statusId),
        description: formatStatusEffectDescription(statusId, match[1]),
        color: meta.color,
      });
      continue;
    }
    if (/lose all firewall/i.test(part) && /deal that much damage/i.test(part)) {
      badges.push({
        icon: getStatusMeta('Firewall').icon,
        value: firewallStacks || '0',
        label: 'Spend Firewall',
        description: part,
        color: getStatusMeta('Firewall').color,
      });
      badges.push({
        icon: '\u2694',
        value: enemy?.intent?.amount ?? '?',
        label: 'Variable Damage',
        description: 'Deal damage equal to Firewall spent.',
        color: C.neonRed,
      });
    }
  }

  return badges;
}

function getIntentEffectBadges(enemy, intentCardDef) {
  const intentType = enemy?.intent?.type;
  const intentName = enemy?.intent?.name || intentType || 'Intent';
  const intentColor = getIntentColor(intentType);
  const badges = [];

  for (const effect of intentCardDef?.effects ?? EMPTY_ARRAY) {
    if (effect.op === 'DealDamage' && effect.amount != null) {
      badges.push({ icon: '\u2694', value: effect.amount, label: intentName, description: `Deal ${effect.amount} damage.`, color: C.neonRed });
      continue;
    }
    if (effect.op === 'GainBlock' && effect.amount != null) {
      badges.push({
        icon: getStatusMeta('Firewall').icon,
        value: effect.amount,
        label: intentName,
        description: formatStatusEffectDescription('Firewall', effect.amount, 'Gain'),
        color: getStatusMeta('Firewall').color,
      });
      continue;
    }
    if (effect.op === 'Heal' && effect.amount != null) {
      badges.push({ icon: '\u2665', value: effect.amount, label: intentName, description: `Heal ${effect.amount} HP.`, color: C.neonGreen });
      continue;
    }
    if (effect.op === 'GainRAM' && effect.amount != null) {
      badges.push({ icon: '\u26A1', value: effect.amount, label: intentName, description: `Gain ${effect.amount} RAM.`, color: C.neonYellow });
      continue;
    }
    if (effect.op === 'DrawCards' && effect.amount != null) {
      badges.push({ icon: '\u21BB', value: effect.amount, label: intentName, description: `Draw ${effect.amount} card${effect.amount === 1 ? '' : 's'}.`, color: C.textPrimary });
      continue;
    }
    if (effect.op === 'ApplyStatus' && effect.statusId) {
      const meta = getStatusMeta(effect.statusId);
      badges.push({
        icon: meta.icon,
        value: effect.stacks ?? '?',
        label: humanizeStatusId(effect.statusId),
        description: formatStatusEffectDescription(effect.statusId, effect.stacks),
        color: meta.color,
      });
      continue;
    }
    if (effect.op === 'RawText') {
      badges.push(...parseIntentRawTextBadges(effect.text, enemy));
    }
  }

  if (badges.length > 0) return badges;

  return [{
    icon: getIntentIcon(intentType),
    value: enemy?.intent?.amount ?? '?',
    label: intentName,
    description: intentCardDef?.effects?.length ? formatEffectsLong(intentCardDef.effects).join(' ') : intentName,
    color: intentColor,
  }];
}

function IntentEffectBadge({ badge }) {
  const [tipVisible, setTipVisible] = React.useState(false);
  const [tipPos, setTipPos] = React.useState({ x: 0, y: 0 });

  const handleInteract = (e) => {
    e.stopPropagation();
    setTipPos({ x: e.clientX, y: e.clientY });
    setTipVisible((visible) => !visible);
  };

  const handleEnter = (e) => {
    e.stopPropagation();
    setTipPos({ x: e.clientX, y: e.clientY });
    setTipVisible(true);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <div
        title={badge.label}
        onClick={handleInteract}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setTipVisible(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 7px',
          borderRadius: 999,
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 700,
          backgroundColor: 'rgba(0,0,0,0.76)',
          color: badge.color,
          border: `1px solid ${badge.color}55`,
          boxShadow: `0 0 10px ${badge.color}18`,
          whiteSpace: 'nowrap',
          cursor: 'help',
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: 12 }}>{badge.icon}</span>
        <span>{badge.value}</span>
      </div>
      {tipVisible && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(tipPos.x + 8, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 230),
            top: tipPos.y - 8,
            transform: 'translateY(-100%)',
            zIndex: 9999,
            backgroundColor: '#0d0d18',
            border: `1px solid ${badge.color}50`,
            borderRadius: 8,
            padding: '7px 10px',
            maxWidth: 220,
            boxShadow: `0 4px 20px rgba(0,0,0,0.85), 0 0 12px ${badge.color}18`,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, color: badge.color, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {badge.icon} {badge.label}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: '#b0b0b0', lineHeight: 1.5 }}>
            {badge.description}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STATUS BADGE (reusable for player + enemies)
// ============================================================
function StatusBadge({ status, size = 'normal' }) {
  const [tipVisible, setTipVisible] = React.useState(false);
  const [tipPos, setTipPos] = React.useState({ x: 0, y: 0 });
  const meta = getStatusMeta(status.id);
  const isSmall = size === 'small';
  const desc = STATUS_DESCRIPTIONS[status.id];
  const stackWord = status.stacks === 1 ? 'stack' : 'stacks';
  const tipTitle = `${meta.name || status.id} (${status.stacks} ${stackWord})`;

  const handleInteract = (e) => {
    e.stopPropagation();
    setTipPos({ x: e.clientX, y: e.clientY });
    setTipVisible(v => !v);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <div
        title={tipTitle}
        onClick={handleInteract}
        onMouseEnter={(e) => { setTipPos({ x: e.clientX, y: e.clientY }); setTipVisible(true); }}
        onMouseLeave={() => setTipVisible(false)}
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
          cursor: 'help',
        }}
      >
        <span style={{ fontSize: isSmall ? 9 : 11 }}>{meta.icon}</span>
        {status.stacks > 1 && <span>{status.stacks}</span>}
      </div>
      {tipVisible && desc && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(tipPos.x + 8, window.innerWidth - 210),
            top: tipPos.y - 8,
            transform: 'translateY(-100%)',
            zIndex: 9999,
            backgroundColor: '#0d0d18',
            border: `1px solid ${meta.color}50`,
            borderRadius: 8,
            padding: '7px 10px',
            maxWidth: 200,
            boxShadow: `0 4px 20px rgba(0,0,0,0.85), 0 0 12px ${meta.color}20`,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, color: meta.color, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {meta.icon} {meta.name || status.id} ×{status.stacks}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: '#b0b0b0', lineHeight: 1.5 }}>
            {desc}
          </div>
        </div>
      )}
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
function EnemyCard({
  enemy,
  isTargeted,
  onClick,
  actingType,
  data,
  compact = false,
  impact = null,
  hasActiveCard = false,
  canActivate = false,
  isArmed = false,
}) {
  const intentColor = getIntentColor(enemy.intent?.type);
  const imgSrc      = getEnemyImage(enemy.enemyDefId);
  const intentCardDef = data?.cards?.[enemy.intent?.cardDefId];
  const intentBadges = getIntentEffectBadges(enemy, intentCardDef);
  const cardIntentBadges = intentBadges.slice(0, compact ? 1 : 2);
  const enemyName = enemy.name ?? 'Unknown Target';
  const firewallStacks = enemy?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
  const nonFirewallStatuses = (enemy?.statuses || []).filter((status) => status.id !== 'Firewall');
  const actClass    = actingType === 'Attack'  ? 'enemy-act-attack'
                    : actingType === 'Debuff'  ? 'enemy-act-debuff'
                    : actingType               ? 'enemy-act-defend'
                    : '';
  const actingMeta = actingType ? getPlayAnimationMeta('enemy', actingType, actingType) : null;
  const actingCue = actingType ? getEnemyActionCue(actingType, actingMeta?.accent ?? intentColor) : null;
  const actingColor = actingMeta?.accent ?? intentColor;
  const actingDuration = actingType ? Math.max(760, getPlayAnimationDuration('enemy', actingType) - 120) : null;
  const statusPreview = nonFirewallStatuses.slice(0, compact ? 3 : 6);

  if (imgSrc) {
    // ── Image card: artwork fills the card, stats overlaid ──
    return (
      <button
        onClick={onClick}
        className={actClass}
        style={{
          position: 'relative',
          flexShrink: 0,
          width: compact ? 'clamp(74px, 21vw, 92px)' : 'clamp(122px, 19vw, 164px)',
          aspectRatio: '13 / 18',
          padding: 0,
          border: `2px solid ${isTargeted ? C.neonCyan : 'transparent'}`,
          borderRadius: compact ? '9px' : '10px',
          overflow: 'hidden',
          backgroundColor: C.bgCard,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: actingType
            ? `0 0 ${compact ? 22 : 34}px ${actingColor}40, 0 10px 24px rgba(0,0,0,0.72)`
            : isTargeted
              ? `0 0 ${compact ? 18 : 28}px ${C.neonCyan}60`
              : '0 4px 16px rgba(0,0,0,0.7)',
          '--enemy-act-duration': actingDuration ? `${actingDuration}ms` : undefined,
          '--enemy-act-glow': actingColor,
          '--enemy-action-accent': actingColor,
          '--enemy-action-shadow': `${actingColor}66`,
          ...(actingType ? { transform: compact ? 'translateY(-2px)' : 'translateY(-3px)' } : EMPTY_OBJECT),
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {/* Full artwork — no cropping */}
        <RuntimeArt
          src={imgSrc}
          alt={enemy.name ?? 'Enemy'}
          accent={intentColor}
          label={enemy.name ?? 'Enemy'}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
          }}
          imageStyle={{
            objectFit: 'cover',
            objectPosition: 'center center',
            transform: 'scale(1.02)',
            filter: 'saturate(1.04) contrast(1.03) brightness(0.88)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(circle at 24% 14%, ${intentColor}18 0%, transparent 30%),
              linear-gradient(180deg, rgba(8,10,16,0.08) 0%, rgba(8,10,16,0.12) 30%, rgba(8,10,16,0.34) 62%, rgba(8,10,16,0.82) 100%)
            `,
            pointerEvents: 'none',
          }}
        />

        {actingCue && (
          <div
            className="enemy-action-chip"
            style={{
              position: 'absolute',
              left: compact ? 6 : 8,
              right: compact ? 6 : 8,
              top: compact ? 26 : 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: compact ? 4 : 6,
              padding: compact ? '3px 5px' : '4px 7px',
              borderRadius: 999,
              border: `1px solid ${actingColor}58`,
              background: `linear-gradient(90deg, ${actingColor}18 0%, rgba(5,8,14,0.82) 42%, rgba(5,8,14,0.68) 100%)`,
              boxShadow: `0 0 18px ${actingColor}24`,
              backdropFilter: 'blur(4px)',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: compact ? 6 : 7, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: actingColor }}>
              {actingMeta?.label || actingType}
            </span>
            <span style={{ fontFamily: MONO, fontSize: compact ? 5 : 6, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8d1de' }}>
              {actingCue.shortLabel}
            </span>
          </div>
        )}

        {impact && (
          <div
            key={`${enemy.id}-${impact.token}`}
            className={`enemy-impact-${impact.type}`}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: getEnemyImpactBackground(impact.type),
            }}
          />
        )}

        {(isTargeted || isArmed) && (
          <div
            style={{
              position: 'absolute',
              top: compact ? 5 : 8,
              left: compact ? 5 : 8,
              padding: compact ? '2px 5px' : '3px 6px',
              borderRadius: 999,
              background: isArmed
                ? `${C.neonYellow}18`
                : canActivate && hasActiveCard
                  ? `${C.neonGreen}16`
                  : `${C.neonCyan}18`,
              border: `1px solid ${isArmed
                ? `${C.neonYellow}48`
                : canActivate && hasActiveCard
                  ? `${C.neonGreen}42`
                  : `${C.neonCyan}45`}`,
              color: isArmed
                ? C.neonYellow
                : canActivate && hasActiveCard
                  ? C.neonGreen
                  : C.neonCyan,
              fontFamily: MONO,
              fontSize: compact ? 6 : 7,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              boxShadow: isArmed
                ? `0 0 14px ${C.neonYellow}20`
                : `0 0 10px ${C.neonCyan}18`,
              pointerEvents: 'none',
            }}
          >
            {isArmed
              ? 'Armed'
              : hasActiveCard && canActivate
                ? 'Ready'
                : 'Target'}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: compact ? 5 : 8,
            right: compact ? 5 : 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: compact ? 3 : 4,
            maxWidth: compact ? '74%' : '62%',
            padding: compact ? '3px 4px' : '4px 5px',
            borderRadius: 999,
            background: 'rgba(4,8,14,0.68)',
            border: `1px solid ${intentColor}35`,
            boxShadow: `0 6px 16px rgba(0,0,0,0.26), 0 0 10px ${intentColor}10`,
            backdropFilter: compact ? 'blur(2px)' : 'blur(4px)',
          }}
        >
          {cardIntentBadges.map((badge, index) => (
            <IntentEffectBadge key={`${enemy.id}-intent-${index}`} badge={badge} />
          ))}
        </div>

        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: statusPreview.length > 0
            ? (compact ? '11px 6px 6px' : '18px 9px 9px')
            : (compact ? '6px' : '10px 9px 9px'),
          background: 'linear-gradient(180deg, rgba(8,10,16,0.02) 0%, rgba(8,10,16,0.12) 28%, rgba(8,10,16,0.68) 100%)',
        }}>
          {statusPreview.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center', marginBottom: compact ? 4 : 6 }}>
              {statusPreview.map((s, i) => (
                <StatusBadge key={`${s.id}-${i}`} status={s} size="small" />
              ))}
            </div>
          )}
          <HealthBar
            current={enemy.hp}
            max={enemy.maxHP}
            height={compact ? 10 : 14}
            segmented={false}
            showText={false}
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
        borderRadius: compact ? '9px' : '10px',
        transition: 'all 0.2s ease',
        backgroundColor: C.bgCard,
        border: `2px solid ${isTargeted ? C.neonCyan : C.border}`,
        boxShadow: actingType
          ? `0 0 26px ${actingColor}30, inset 0 0 20px ${actingColor}0c, 0 2px 12px rgba(0,0,0,0.5)`
          : isTargeted
            ? `0 0 24px ${C.neonCyan}40, inset 0 0 20px ${C.neonCyan}06`
            : `0 2px 12px rgba(0,0,0,0.5)`,
        padding: compact ? '8px 10px' : '10px 14px',
        minWidth: compact ? 82 : 140,
        maxWidth: compact ? 102 : 180,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        '--enemy-act-duration': actingDuration ? `${actingDuration}ms` : undefined,
        '--enemy-act-glow': actingColor,
      }}
    >
      {actingCue && (
        <div
          className="enemy-action-chip"
          style={{
            position: 'absolute',
            top: compact ? 24 : 30,
            left: compact ? 6 : 8,
            right: compact ? 6 : 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: compact ? 4 : 6,
            padding: compact ? '3px 5px' : '4px 7px',
            borderRadius: 999,
            border: `1px solid ${actingColor}58`,
            background: `linear-gradient(90deg, ${actingColor}18 0%, rgba(5,8,14,0.82) 42%, rgba(5,8,14,0.68) 100%)`,
            boxShadow: `0 0 18px ${actingColor}24`,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: compact ? 6 : 7, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: actingColor }}>
            {actingMeta?.label || actingType}
          </span>
          <span style={{ fontFamily: MONO, fontSize: compact ? 5 : 6, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8d1de' }}>
            {actingCue.shortLabel}
          </span>
        </div>
      )}
      {impact && (
        <div
          key={`${enemy.id}-fallback-${impact.token}`}
          className={`enemy-impact-${impact.type}`}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            borderRadius: compact ? '9px' : '10px',
            background: getEnemyImpactBackground(impact.type),
          }}
        />
      )}
      {(isTargeted || isArmed || (hasActiveCard && canActivate)) && (
        <div
          style={{
            position: 'absolute',
            top: compact ? 6 : 8,
            left: compact ? 6 : 8,
            padding: compact ? '2px 5px' : '3px 6px',
            borderRadius: 999,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: compact ? 6 : 7,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            background: isArmed
              ? `${C.neonYellow}16`
              : hasActiveCard && canActivate
                ? `${C.neonGreen}14`
                : `${C.neonCyan}14`,
            border: `1px solid ${isArmed
              ? `${C.neonYellow}46`
              : hasActiveCard && canActivate
                ? `${C.neonGreen}40`
                : `${C.neonCyan}36`}`,
            color: isArmed
              ? C.neonYellow
              : hasActiveCard && canActivate
                ? C.neonGreen
                : C.neonCyan,
          }}
        >
          {isArmed
            ? 'Armed'
            : hasActiveCard && canActivate
              ? 'Ready'
              : 'Target'}
        </div>
      )}
      <div style={{
        fontFamily: MONO,
        fontWeight: 700,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: isTargeted ? C.neonCyan : C.textPrimary,
        fontSize: compact ? 9 : 11,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}>
        {enemyName ? `${enemyName}.EXE` : 'UNKNOWN.EXE'}
      </div>
      <HealthBar current={enemy.hp} max={enemy.maxHP} height={compact ? 12 : 16} segmented={enemy.maxHP <= 30} showText={!compact} />
      {firewallStacks > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', padding: compact ? '2px 6px' : '2px 8px', borderRadius: '4px', fontFamily: MONO, fontWeight: 700, backgroundColor: `${C.neonCyan}15`, color: C.neonCyan, fontSize: compact ? 9 : 11, border: `1px solid ${C.neonCyan}30` }}>
            {'\u25A3'} {firewallStacks}
          </div>
        </div>
      )}
      <StatusRow statuses={statusPreview} size="small" justify="center" />
      <div style={{ borderRadius: '6px', backgroundColor: `${intentColor}12`, border: `1px solid ${intentColor}30`, padding: '5px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {(compact ? intentBadges.slice(0, 1) : intentBadges).map((badge, index) => (
            <IntentEffectBadge key={`${enemy.id}-intent-fallback-${index}`} badge={badge} />
          ))}
        </div>
      </div>
    </button>
  );
}

function FirewallBar({ current, max, height = 12, showText = true, glow = true }) {
  const safeMax = Math.max(1, max || 0);
  const safeCurrent = Math.max(0, Math.min(current || 0, safeMax));
  const pct = Math.max(0, Math.min(100, (safeCurrent / safeMax) * 100));
  const color = C.neonCyan;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
      <div
        style={{
          position: 'relative',
          borderRadius: '6px',
          overflow: 'hidden',
          height,
          backgroundColor: '#101929',
          width: '100%',
          border: `1px solid ${color}35`,
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '5px',
            transition: 'all 0.45s ease-out',
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}B8 0%, ${color} 100%)`,
            boxShadow: glow ? `0 0 12px ${color}55, inset 0 1px 0 rgba(255,255,255,0.18)` : 'none',
          }}
        />
        {showText && (
          <div
            style={{
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
            }}
          >
            {safeCurrent}/{safeMax}
          </div>
        )}
      </div>
    </div>
  );
}

function EnemyFocusPanel({
  enemy,
  intentBadges = EMPTY_ARRAY,
  bossReadout = null,
  compact = false,
  onOpenMenu = null,
  hasActiveCard = false,
  canActivate = false,
  isArmed = false,
  blockedReason = null,
}) {
  if (!enemy) return null;

  const firewallStacks = enemy?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
  const intentColor = getIntentColor(enemy.intent?.type);
  const hpColor = getHealthColor(enemy.hp, enemy.maxHP);
  const targetStatusLabel = isArmed
    ? 'ARMED'
    : canActivate && hasActiveCard
      ? 'READY'
      : blockedReason
        ? 'BLOCKED'
        : null;
  const targetStatusColor = isArmed
    ? C.neonYellow
    : canActivate && hasActiveCard
      ? C.neonGreen
      : blockedReason
        ? C.neonOrange
        : C.textDim;
  const targetPrompt = isArmed
    ? 'Double tap now to fire'
    : canActivate && hasActiveCard
      ? 'Tap once to arm. Slow second tap opens intel.'
      : blockedReason
        ? describeCardPlayabilityReason(blockedReason)
        : null;

  if (compact) {
    return (
      <div
        style={{
          width: '100%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 9px 9px',
          borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.95) 100%)',
          border: `1px solid ${C.neonCyan}24`,
          boxShadow: `0 0 24px ${C.neonCyan}0a, 0 10px 24px rgba(0,0,0,0.24)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, letterSpacing: '0.14em', color: C.textDim }}>
              TARGET
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {enemy.name ?? 'Unknown Target'}
            </span>
          </div>
          {onOpenMenu && (
            <button
              onClick={onOpenMenu}
              aria-label="Open combat menu"
              style={{
                padding: '5px 8px',
                borderRadius: 999,
                border: `1px solid ${C.borderLight}`,
                background: 'rgba(10,14,22,0.86)',
                color: C.textSecondary,
                fontFamily: MONO,
                fontSize: 7,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Menu
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          <div style={{ borderRadius: 999, padding: '5px 8px', background: `${hpColor}12`, border: `1px solid ${hpColor}30`, color: hpColor, fontFamily: MONO, fontSize: 9, fontWeight: 700, textAlign: 'center' }}>
            {enemy.hp}/{enemy.maxHP}
          </div>
          <div style={{ borderRadius: 999, padding: '5px 8px', background: firewallStacks > 0 ? `${C.neonCyan}12` : 'rgba(255,255,255,0.03)', border: `1px solid ${firewallStacks > 0 ? `${C.neonCyan}30` : C.borderLight}`, color: firewallStacks > 0 ? C.neonCyan : C.textDim, fontFamily: MONO, fontSize: 9, fontWeight: 700, textAlign: 'center' }}>
            FW {firewallStacks}
          </div>
        </div>

        {bossReadout && <BossProtocolPanel readout={bossReadout} compact={true} />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minHeight: 24 }}>
          {intentBadges.length > 0 ? intentBadges.map((badge, index) => (
            <IntentEffectBadge key={`${enemy.id}-focus-${index}`} badge={badge} />
          )) : (
            <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', color: intentColor, textTransform: 'uppercase' }}>
              {enemy.intent?.type || 'Intent'}
            </span>
          )}
        </div>

        {targetPrompt && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              padding: '6px 7px',
              borderRadius: 12,
              background: 'rgba(3,7,14,0.78)',
              border: `1px solid ${targetStatusColor}2f`,
              boxShadow: `0 0 14px ${targetStatusColor}10`,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                padding: '2px 6px',
                borderRadius: 999,
                background: `${targetStatusColor}18`,
                border: `1px solid ${targetStatusColor}38`,
                color: targetStatusColor,
                fontFamily: MONO,
                fontSize: 7,
                fontWeight: 700,
                letterSpacing: '0.12em',
              }}
            >
              {targetStatusLabel}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 7, lineHeight: 1.45, color: C.textPrimary }}>
              {targetPrompt}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 'clamp(208px, 22vw, 248px)',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px',
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.95) 100%)',
        border: `1px solid ${C.neonCyan}30`,
        boxShadow: `0 0 28px ${C.neonCyan}10, 0 12px 28px rgba(0,0,0,0.28)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: C.textDim }}>
            ENEMY ANALYSIS
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {enemy.name ?? 'Unknown Target'}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: intentColor }}>
            {enemy.intent?.type || 'Intent'}
          </span>
        </div>
        <div
          style={{
            padding: '4px 8px',
            borderRadius: 999,
            background: `${intentColor}18`,
            border: `1px solid ${intentColor}38`,
            color: intentColor,
            fontFamily: MONO,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
          >
            Focused
        </div>
        </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
        <div style={{ borderRadius: 12, padding: '6px 8px', background: `${getHealthColor(enemy.hp, enemy.maxHP)}12`, border: `1px solid ${getHealthColor(enemy.hp, enemy.maxHP)}34` }}>
          <div style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: getHealthColor(enemy.hp, enemy.maxHP), marginBottom: 3 }}>HP</div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textPrimary }}>{enemy.hp}/{enemy.maxHP}</div>
        </div>
        <div style={{ borderRadius: 12, padding: '6px 8px', background: firewallStacks > 0 ? `${C.neonCyan}12` : 'rgba(255,255,255,0.03)', border: `1px solid ${firewallStacks > 0 ? `${C.neonCyan}34` : C.borderLight}` }}>
          <div style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: firewallStacks > 0 ? C.neonCyan : C.textDim, marginBottom: 3 }}>FW</div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textPrimary }}>{firewallStacks}</div>
        </div>
      </div>

      {bossReadout && <BossProtocolPanel readout={bossReadout} />}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          padding: '8px 9px',
          borderRadius: 12,
          background: 'rgba(3,7,14,0.72)',
          border: `1px solid ${C.borderLight}`,
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim }}>
          NEXT ACTION
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {intentBadges.map((badge, index) => (
            <IntentEffectBadge key={`${enemy.id}-focus-${index}`} badge={badge} />
          ))}
        </div>
      </div>

      {targetPrompt && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '8px 9px',
            borderRadius: 12,
            background: 'rgba(3,7,14,0.78)',
            border: `1px solid ${targetStatusColor}30`,
            boxShadow: `0 0 16px ${targetStatusColor}12`,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              padding: '3px 7px',
              borderRadius: 999,
              background: `${targetStatusColor}18`,
              border: `1px solid ${targetStatusColor}38`,
              color: targetStatusColor,
              fontFamily: MONO,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {targetStatusLabel}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, lineHeight: 1.5, color: C.textPrimary }}>
            {targetPrompt}
          </span>
        </div>
      )}
    </div>
  );
}

function EnemySummaryStrip({ enemy, intentBadges = EMPTY_ARRAY, onToggleDetails, detailsOpen = false }) {
  if (!enemy) return null;

  const firewallStacks = enemy?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
  const intentColor = getIntentColor(enemy.intent?.type);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        padding: '7px 8px',
        borderRadius: 12,
        background: 'linear-gradient(180deg, rgba(8,12,20,0.96) 0%, rgba(5,8,14,0.98) 100%)',
        border: `1px solid ${C.neonCyan}22`,
        boxShadow: `0 8px 18px rgba(0,0,0,0.22), 0 0 14px ${C.neonCyan}0d`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: C.textDim,
          }}
        >
          TARGET
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 700,
            color: C.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {enemy.name ?? 'Unknown Target'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <div
          style={{
            padding: '3px 7px',
            borderRadius: 999,
            background: `${getHealthColor(enemy.hp, enemy.maxHP)}14`,
            border: `1px solid ${getHealthColor(enemy.hp, enemy.maxHP)}2f`,
            color: getHealthColor(enemy.hp, enemy.maxHP),
            fontFamily: MONO,
            fontSize: 8,
            fontWeight: 700,
          }}
        >
          {enemy.hp}/{enemy.maxHP}
        </div>
        <div
          style={{
            padding: '3px 7px',
            borderRadius: 999,
            background: firewallStacks > 0 ? `${C.neonCyan}14` : 'rgba(255,255,255,0.03)',
            border: `1px solid ${firewallStacks > 0 ? `${C.neonCyan}2f` : C.borderLight}`,
            color: firewallStacks > 0 ? C.neonCyan : C.textDim,
            fontFamily: MONO,
            fontSize: 8,
            fontWeight: 700,
          }}
        >
          FW {firewallStacks}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {intentBadges.slice(0, 2).map((badge, index) => (
          <IntentEffectBadge key={`${enemy.id}-summary-${index}`} badge={badge} />
        ))}
        <button
          onClick={onToggleDetails}
          style={{
            padding: '4px 8px',
            borderRadius: 999,
            border: `1px solid ${intentColor}30`,
            background: detailsOpen ? `${intentColor}18` : 'rgba(255,255,255,0.03)',
            color: detailsOpen ? intentColor : C.textSecondary,
            fontFamily: MONO,
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {detailsOpen ? 'Hide' : 'Info'}
        </button>
      </div>
    </div>
  );
}

function EnemyDetailDialog({
  enemy,
  data,
  intentBadges = EMPTY_ARRAY,
  intentCardDef = null,
  onClose,
  dialogRef,
  closeButtonRef,
}) {
  if (!enemy) return null;

  const imgSrc = getEnemyImage(enemy.enemyDefId);
  const firewallStacks = enemy?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0;
  const nonFirewallStatuses = (enemy?.statuses || []).filter((status) => status.id !== 'Firewall');
  const intentColor = getIntentColor(enemy.intent?.type);
  const intentLines = intentCardDef?.effects?.length
    ? formatEffectsLong(intentCardDef.effects)
    : intentBadges.map((badge) => badge.description).filter(Boolean);
  const directiveLines = getEnemyDirectiveSummaries(enemy);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 320,
        background: 'rgba(2,6,12,0.94)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={enemy?.name ? `${enemy.name} dossier` : 'Enemy dossier'}
        tabIndex={-1}
        style={{
          height: '100%',
          overflowY: 'auto',
          padding: 'max(env(safe-area-inset-top, 0px), 10px) 12px max(env(safe-area-inset-bottom, 0px), 16px)',
        }}
      >
        <div style={{ width: 'min(100%, 520px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: C.textDim }}>
                ENEMY DOSSIER
              </span>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.1 }}>
                {enemy.name ?? 'Unknown Target'}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: intentColor, textTransform: 'uppercase' }}>
                {enemy.intent?.type || 'Intent'}{intentCardDef?.name ? ` · ${intentCardDef.name}` : ''}
              </span>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close enemy dossier"
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: `1px solid ${C.borderLight}`,
                background: 'rgba(8,12,20,0.88)',
                color: C.textSecondary,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Close
            </button>
          </div>

          <div
            style={{
              position: 'relative',
              minHeight: 'min(42vh, 320px)',
              borderRadius: 22,
              overflow: 'hidden',
              background: imgSrc
                ? C.bgCard
                : `linear-gradient(145deg, ${intentColor}16 0%, rgba(10,12,20,0.98) 58%, rgba(10,12,20,1) 100%)`,
              border: `1px solid ${intentColor}34`,
              boxShadow: `0 18px 36px rgba(0,0,0,0.34), 0 0 26px ${intentColor}18`,
            }}
          >
            <RuntimeArt
              src={imgSrc}
              alt={enemy.name ?? 'Enemy'}
              accent={intentColor}
              label={enemy.name ?? 'Enemy'}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                display: 'block',
              }}
              imageStyle={{
                objectFit: 'cover',
                objectPosition: 'center center',
                filter: 'saturate(1.04) contrast(1.04) brightness(0.88)',
              }}
              fallbackStyle={{
                background: `linear-gradient(145deg, ${intentColor}16 0%, rgba(10,12,20,0.98) 58%, rgba(10,12,20,1) 100%)`,
              }}
            />

            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `
                  radial-gradient(circle at 22% 18%, ${intentColor}28 0%, transparent 32%),
                  linear-gradient(180deg, rgba(8,10,16,0.1) 0%, rgba(8,10,16,0.18) 28%, rgba(8,10,16,0.5) 62%, rgba(8,10,16,0.94) 100%)
                `,
              }}
            />

            <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ padding: '4px 8px', borderRadius: 999, background: `${getHealthColor(enemy.hp, enemy.maxHP)}16`, border: `1px solid ${getHealthColor(enemy.hp, enemy.maxHP)}34`, color: getHealthColor(enemy.hp, enemy.maxHP), fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>
                  HP {enemy.hp}/{enemy.maxHP}
                </div>
                <div style={{ padding: '4px 8px', borderRadius: 999, background: firewallStacks > 0 ? `${C.neonCyan}16` : 'rgba(255,255,255,0.06)', border: `1px solid ${firewallStacks > 0 ? `${C.neonCyan}34` : C.borderLight}`, color: firewallStacks > 0 ? C.neonCyan : C.textSecondary, fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>
                  FW {firewallStacks}
                </div>
                <div style={{ padding: '4px 8px', borderRadius: 999, background: `${intentColor}18`, border: `1px solid ${intentColor}34`, color: intentColor, fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
                  {enemy.intent?.type || 'Intent'}
                </div>
              </div>
              <HealthBar current={enemy.hp} max={enemy.maxHP} height={14} showText={false} glow={false} />
              <FirewallBar current={firewallStacks} max={Math.max(1, enemy.maxHP || 1)} height={10} showText={false} glow={false} />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '12px 14px',
              borderRadius: 18,
              background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.95) 100%)',
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 10px 26px rgba(0,0,0,0.24)',
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.textDim }}>
              UPCOMING ACTION
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {intentBadges.length > 0 ? intentBadges.map((badge, index) => (
                <IntentEffectBadge key={`${enemy.id}-dialog-badge-${index}`} badge={badge} />
              )) : (
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSecondary }}>
                  No intent details available.
                </div>
              )}
            </div>
            {intentLines.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {intentLines.map((line, index) => (
                  <div key={`${enemy.id}-dialog-line-${index}`} style={{ fontFamily: MONO, fontSize: 12, color: '#c7cfda', lineHeight: 1.5 }}>
                    {renderKeywordText(line, `enemy-intel-line-${index}`)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {directiveLines.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px 14px',
                borderRadius: 18,
                background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.95) 100%)',
                border: `1px solid ${C.borderLight}`,
                boxShadow: '0 10px 26px rgba(0,0,0,0.24)',
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.textDim }}>
                TACTICAL PROFILE
              </div>
              {directiveLines.map((line, index) => (
                <div key={`${enemy.id}-directive-${index}`} style={{ fontFamily: MONO, fontSize: 11, color: C.textSecondary, lineHeight: 1.5 }}>
                  {line}
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '12px 14px',
              borderRadius: 18,
              background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.95) 100%)',
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 10px 26px rgba(0,0,0,0.24)',
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.textDim }}>
              ACTIVE EFFECTS
            </div>
            {nonFirewallStatuses.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {nonFirewallStatuses.map((status, index) => (
                    <StatusBadge key={`${status.id}-dialog-chip-${index}`} status={status} size="small" />
                  ))}
                </div>
                {nonFirewallStatuses.map((status, index) => {
                  const meta = getStatusMeta(status.id);
                  return (
                    <div
                      key={`${status.id}-dialog-row-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 12,
                        background: 'rgba(8,12,20,0.72)',
                        border: `1px solid ${C.borderLight}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ color: meta.color, fontSize: 16, lineHeight: 1 }}>{meta.icon}</span>
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textPrimary }}>
                            {humanizeStatusId(status.id)}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textSecondary }}>
                            {meta.short}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: meta.color }}>
                        x{status.stacks ?? 0}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textSecondary }}>
                No active modifiers on this enemy right now.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PLAYER STATS PANEL (bottom-left)
// ============================================================
function PlayerPanel({ player, ram = 0, maxRam = 0, heat = 0, maxHeat = 20, arenaModifier = null, powerPile = [], cardInstances = {}, data }) {
  const hp = player?.hp ?? 0;
  const maxHp = player?.maxHP ?? 1;
  const firewallStacks = player?.statuses?.find(s => s.id === 'Firewall')?.stacks ?? 0;
  const block = 0;
  const nonFirewallStatuses = (player?.statuses || []).filter(s => s.id !== 'Firewall');
  // Active Power cards
  const activePowers = powerPile.map(cid => {
    const ci = cardInstances[cid];
    return ci ? data?.cards?.[ci.defId] : null;
  }).filter(Boolean);

  return (
    <div
      style={{
        flex: '1 1 248px',
        minWidth: 220,
        maxWidth: 320,
        borderRadius: '14px',
        padding: '10px 12px',
        background: 'linear-gradient(180deg, rgba(10,14,24,0.96) 0%, rgba(7,10,18,0.94) 100%)',
        border: `1px solid ${C.neonCyan}30`,
        boxShadow: `0 0 24px ${C.neonCyan}10`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim }}>
            PLAYER
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.08em', color: C.neonCyan }}>
            SYSTEM STATUS
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <div
            title={`Firewall: ${firewallStacks} (persistent shield)`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 10,
              fontFamily: MONO,
              fontWeight: 700,
              color: firewallStacks > 0 ? C.neonCyan : C.textDim,
              backgroundColor: firewallStacks > 0 ? `${C.neonCyan}16` : `${C.textDim}10`,
              borderRadius: 999,
              padding: '4px 8px',
              border: `1px solid ${firewallStacks > 0 ? `${C.neonCyan}45` : `${C.textDim}24`}`,
            }}
          >
            {'\u25A3'} FW {firewallStacks}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.neonGreen }}>
            HP
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textPrimary }}>
            {hp}<span style={{ color: C.textDim }}>/</span>{maxHp}
          </span>
        </div>
        <HealthBar current={hp} max={maxHp} height={12} showText={false} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.neonCyan }}>
            RAM
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textPrimary }}>
            {ram}<span style={{ color: C.textDim }}>/</span>{maxRam}
          </span>
        </div>
        <RamBar ram={ram} maxRam={maxRam} compact={true} showLabel={false} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: getHeatVisualState(heat, maxHeat).color }}>
            HEAT
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textPrimary }}>
            {heat}<span style={{ color: C.textDim }}>/</span>{maxHeat}
          </span>
        </div>
        <HeatBar heat={heat} maxHeat={maxHeat} height={12} showText={false} />
      </div>

      {/* Firewall shield badge (persistent) */}
      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <div
          title={`Firewall: ${firewallStacks} (persistent shield — not reset each turn)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            fontSize: 11,
            fontFamily: MONO,
            fontWeight: 700,
            color: firewallStacks > 0 ? C.neonCyan : C.textDim,
            backgroundColor: firewallStacks > 0 ? `${C.neonCyan}15` : `${C.textDim}10`,
            borderRadius: '4px',
            padding: '3px 7px',
            border: `1px solid ${firewallStacks > 0 ? `${C.neonCyan}40` : `${C.textDim}20`}`,
            transition: 'all 0.3s ease',
          }}
        >
          {'\u25A3'} <span style={{ fontSize: 8, letterSpacing: '0.05em' }}>FW</span> {firewallStacks}
        </div>
        {block > 0 && (
          <div
            title={`Block: ${block} (resets next turn)`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              fontSize: 11,
              fontFamily: MONO,
              fontWeight: 700,
              color: '#66aaff',
              backgroundColor: '#66aaff15',
              borderRadius: '4px',
              padding: '3px 7px',
              border: '1px solid #66aaff30',
            }}
          >
            🛡 {block}
          </div>
        )}
      </div>

      <CombatConditionStrip heat={heat} maxHeat={maxHeat} arenaModifier={arenaModifier} />

      {/* Player statuses (Firewall shown separately above) */}
      <StatusRow statuses={nonFirewallStatuses} size="small" justify="center" />

      {/* Active Power cards */}
      {activePowers.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 4, marginTop: 2 }}>
          <div style={{ fontFamily: MONO, fontSize: 6, color: '#aa66ff', letterSpacing: '0.08em', marginBottom: 3, textAlign: 'center' }}>
            ⚡ POWERS
          </div>
          {activePowers.map((def, i) => (
            <div key={i} title={def.effects?.find(e => e.op === 'RawText')?.text || ''} style={{
              fontFamily: MONO, fontSize: 7, color: '#cc88ff',
              backgroundColor: '#aa44ff12', border: '1px solid #aa44ff30',
              borderRadius: 3, padding: '1px 4px', marginBottom: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}>
              {def.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

void PlayerPanel;

function CompactPlayerHud({
  player,
  ram = 0,
  maxRam = 0,
  heat = 0,
  maxHeat = 20,
  arenaModifier = null,
  powerPile = [],
  cardInstances = {},
  data,
  selfTargetable = false,
  selfTargetSelected = false,
  selfTargetArmed = false,
  onTargetSelf = null,
}) {
  const hp = player?.hp ?? 0;
  const maxHp = player?.maxHP ?? 1;
  const firewallStacks = player?.statuses?.find((s) => s.id === 'Firewall')?.stacks ?? 0;
  const nonFirewallStatuses = (player?.statuses || []).filter((s) => s.id !== 'Firewall');
  const activePowers = powerPile.map((cid) => {
    const ci = cardInstances[cid];
    return ci ? data?.cards?.[ci.defId] : null;
  }).filter(Boolean);

  return (
    <div
      style={{
        flex: '1 1 280px',
        minWidth: 240,
        maxWidth: 380,
        borderRadius: 16,
        padding: '12px',
        background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.96) 100%)',
        border: `1px solid ${C.neonCyan}34`,
        boxShadow: `0 0 28px ${C.neonCyan}12, inset 0 1px 0 rgba(255,255,255,0.04)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.textDim }}>
            PLAYER CORE
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', color: C.neonCyan }}>
            SYSTEMS ONLINE
          </span>
        </div>
        <div
          style={{
            alignSelf: 'center',
            padding: '4px 8px',
            borderRadius: 999,
            background: selfTargetArmed
              ? `${C.neonYellow}18`
              : selfTargetSelected
                ? `${C.neonGreen}16`
                : `${C.neonGreen}14`,
            border: `1px solid ${selfTargetArmed
              ? `${C.neonYellow}42`
              : `${C.neonGreen}34`}`,
            color: selfTargetArmed ? C.neonYellow : C.neonGreen,
            fontFamily: MONO,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {selfTargetable
            ? (selfTargetArmed
              ? 'Double tap now'
              : selfTargetSelected
                ? 'Self target ready'
                : 'Double tap self')
            : 'Double tap target'}
        </div>
      </div>

      <div
        role={selfTargetable ? 'button' : undefined}
        tabIndex={selfTargetable ? 0 : undefined}
        aria-pressed={selfTargetable ? selfTargetSelected : undefined}
        aria-label={selfTargetable ? 'Select yourself as the current card target' : undefined}
        onClick={selfTargetable ? (event) => {
          event.stopPropagation();
          onTargetSelf?.();
        } : undefined}
        onKeyDown={selfTargetable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onTargetSelf?.();
          }
        } : undefined}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          padding: '10px',
          borderRadius: 14,
          background: 'rgba(3,7,14,0.72)',
          border: `1px solid ${selfTargetArmed ? `${C.neonYellow}4a` : selfTargetable ? `${C.neonGreen}32` : C.borderLight}`,
          boxShadow: selfTargetArmed
            ? `0 0 26px ${C.neonYellow}14, inset 0 0 0 1px ${C.neonYellow}12`
            : selfTargetable
              ? `0 0 18px ${C.neonGreen}10`
              : 'none',
          cursor: selfTargetable ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim }}>
            CORE VITALS
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: C.textSecondary }}>
            Firewall, HP, RAM, Heat
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.neonCyan }}>
              FW
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textPrimary }}>
              {firewallStacks}<span style={{ color: C.textDim }}>/</span>{maxHp}
            </span>
          </div>
          <FirewallBar current={firewallStacks} max={maxHp} height={12} showText={false} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.neonGreen }}>
              HP
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textPrimary }}>
              {hp}<span style={{ color: C.textDim }}>/</span>{maxHp}
            </span>
          </div>
          <HealthBar current={hp} max={maxHp} height={12} showText={false} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.neonCyan }}>
              RAM
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textPrimary }}>
              {ram}<span style={{ color: C.textDim }}>/</span>{maxRam}
            </span>
          </div>
          <RamBar ram={ram} maxRam={maxRam} compact={true} showLabel={false} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: getHeatVisualState(heat, maxHeat).color }}>
              HEAT
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textPrimary }}>
              {heat}<span style={{ color: C.textDim }}>/</span>{maxHeat}
            </span>
          </div>
          <HeatBar heat={heat} maxHeat={maxHeat} height={12} showText={false} />
        </div>
      </div>

      <CombatConditionStrip heat={heat} maxHeat={maxHeat} arenaModifier={arenaModifier} compact={true} />

      {nonFirewallStatuses.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            padding: '9px 10px',
            borderRadius: 14,
            background: 'rgba(6,10,18,0.72)',
            border: `1px solid ${C.borderLight}`,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', color: C.textDim }}>
            STATUSES
          </span>
          <StatusRow statuses={nonFirewallStatuses} size="small" justify="flex-start" />
        </div>
      )}

      {activePowers.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            padding: '9px 10px',
            borderRadius: 14,
            background: 'rgba(14,8,20,0.72)',
            border: '1px solid #6f3fbf55',
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', color: '#aa66ff' }}>
            POWERS
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {activePowers.map((def, i) => (
              <div
                key={i}
                title={def.effects?.find((e) => e.op === 'RawText')?.text || ''}
                style={{
                  fontFamily: MONO,
                  fontSize: 8,
                  color: '#cc88ff',
                  backgroundColor: '#aa44ff12',
                  border: '1px solid #aa44ff30',
                  borderRadius: 999,
                  padding: '2px 7px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {def.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobilePlayerHud({
  player,
  ram = 0,
  maxRam = 0,
  heat = 0,
  maxHeat = 20,
  arenaModifier = null,
  drawCount = 0,
  discardCount = 0,
  exhaustCount = 0,
  powerPile = [],
  cardInstances = {},
  data,
  layoutMode = 'phone-portrait',
  interactionLocked = false,
  onEndTurn,
  deckMenuOpen = false,
  onToggleDeckMenu,
  onViewPile,
  deckMenuRef,
  selfTargetable = false,
  selfTargetSelected = false,
  selfTargetArmed = false,
  onTargetSelf = null,
}) {
  const hp = player?.hp ?? 0;
  const maxHp = player?.maxHP ?? 1;
  const firewallStacks = player?.statuses?.find((s) => s.id === 'Firewall')?.stacks ?? 0;
  const nonFirewallStatuses = (player?.statuses || []).filter((s) => s.id !== 'Firewall');
  const isPhonePortrait = layoutMode === 'phone-portrait';
  const activePowers = powerPile
    .map((cid) => {
      const ci = cardInstances[cid];
      return ci ? data?.cards?.[ci.defId] : null;
    })
    .filter(Boolean);
  const renderMetric = (label, value, color, bar) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: isPhonePortrait ? 10 : 11, fontWeight: 700, color }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: isPhonePortrait ? 11 : 12, color: C.textPrimary }}>{value}</span>
      </div>
      {bar}
    </div>
  );
  const handleOpenPile = (pile) => {
    onViewPile?.(pile);
    onToggleDeckMenu?.(false);
  };
  const hasPortraitActionRail = isPhonePortrait && (onEndTurn || onToggleDeckMenu);
  const firewallMetric = renderMetric(
    'FW',
    `${firewallStacks}/${maxHp}`,
    C.neonCyan,
    <FirewallBar current={firewallStacks} max={maxHp} height={isPhonePortrait ? 8 : 10} showText={false} />,
  );
  const hpMetric = renderMetric(
    'HP',
    `${hp}/${maxHp}`,
    C.neonGreen,
    <HealthBar current={hp} max={maxHp} height={isPhonePortrait ? 8 : 10} showText={false} />,
  );
  const ramMetric = renderMetric(
    'RAM',
    `${ram}/${maxRam}`,
    C.neonCyan,
    <RamBar ram={ram} maxRam={maxRam} compact={true} showLabel={false} />,
  );
  const heatMetric = renderMetric(
    'HEAT',
    `${heat}/${maxHeat}`,
    getHeatVisualState(heat, maxHeat).color,
    <HeatBar heat={heat} maxHeat={maxHeat} height={isPhonePortrait ? 8 : 10} showText={false} />,
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isPhonePortrait ? 5 : 7,
        minWidth: 0,
        borderRadius: 14,
        padding: isPhonePortrait ? '7px 8px' : '9px',
        background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.96) 100%)',
        border: `1px solid ${C.neonCyan}28`,
        boxShadow: `0 8px 22px rgba(0,0,0,0.26), 0 0 18px ${C.neonCyan}10`,
      }}
    >
      <div
        role={selfTargetable ? 'button' : undefined}
        tabIndex={selfTargetable ? 0 : undefined}
        aria-pressed={selfTargetable ? selfTargetSelected : undefined}
        aria-label={selfTargetable ? 'Select yourself as the current card target' : undefined}
        onClick={selfTargetable ? (event) => {
          event.stopPropagation();
          onTargetSelf?.();
        } : undefined}
        onKeyDown={selfTargetable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onTargetSelf?.();
          }
        } : undefined}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isPhonePortrait ? 4 : 5,
          padding: isPhonePortrait ? '6px 7px' : '7px 8px',
          borderRadius: 12,
          background: 'rgba(3,7,14,0.72)',
          border: `1px solid ${selfTargetArmed ? `${C.neonYellow}48` : selfTargetable ? `${C.neonGreen}34` : C.borderLight}`,
          boxShadow: selfTargetArmed
            ? `0 0 24px ${C.neonYellow}12, inset 0 0 0 1px ${C.neonYellow}12`
            : selfTargetable
              ? `0 0 16px ${C.neonGreen}10`
              : 'none',
          cursor: selfTargetable ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: isPhonePortrait ? 9 : 10, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim }}>
            PLAYER
          </span>
            <span style={{ fontFamily: MONO, fontSize: isPhonePortrait ? 9 : 10, color: selfTargetArmed ? C.neonYellow : selfTargetable ? C.neonGreen : C.textSecondary }}>
              {selfTargetable
                ? (selfTargetArmed
                  ? 'DOUBLE TAP NOW'
                  : selfTargetSelected
                    ? 'SELF TARGET READY'
                    : 'DOUBLE TAP SELF')
                : 'FW / HP / RAM / HEAT'}
            </span>
          </div>
        {hasPortraitActionRail ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 3fr) minmax(88px, 1fr)',
                gap: 8,
                alignItems: 'stretch',
              }}
            >
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                {firewallMetric}
                {hpMetric}
              </div>
              <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 6, minWidth: 0 }}>
                <CombatActionButton
                  label="End Turn"
                  onClick={onEndTurn}
                  disabled={interactionLocked}
                  tone="primary"
                  compact={true}
                  style={{
                    width: '100%',
                    minHeight: 56,
                    padding: '8px 6px',
                    fontSize: 10,
                    lineHeight: 1.1,
                  }}
                />
                <CombatActionButton
                  label="Deck"
                  onClick={() => onToggleDeckMenu?.(!deckMenuOpen)}
                  active={deckMenuOpen}
                  tone="orange"
                  compact={true}
                  style={{
                    width: '100%',
                    minHeight: 40,
                    padding: '7px 6px',
                    fontSize: 10,
                  }}
                />
              </div>
            </div>
            {ramMetric}
            {heatMetric}
            {deckMenuOpen && (
              <div
                ref={deckMenuRef}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 6,
                  paddingTop: 2,
                }}
              >
                <PileCountButton label="Draw" count={drawCount} color={C.neonCyan} onClick={() => handleOpenPile('draw')} compact={true} />
                <PileCountButton label="Discard" count={discardCount} color={C.neonOrange} onClick={() => handleOpenPile('discard')} compact={true} />
                <PileCountButton label="Exhaust" count={exhaustCount} color={C.neonRed} onClick={() => handleOpenPile('exhaust')} compact={true} />
              </div>
            )}
          </>
        ) : (
          <>
            {firewallMetric}
            {hpMetric}
            {ramMetric}
            {heatMetric}
          </>
        )}
      </div>

      <CombatConditionStrip heat={heat} maxHeat={maxHeat} arenaModifier={arenaModifier} compact={true} />

      {(nonFirewallStatuses.length > 0 || activePowers.length > 0) && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingBottom: 1,
          }}
        >
          {nonFirewallStatuses.map((status, index) => (
            <StatusBadge key={`${status.id}-${index}`} status={status} size="small" />
          ))}
          {activePowers.slice(0, isPhonePortrait ? 2 : 3).map((power, index) => (
            <div
              key={`${power.id || power.name}-${index}`}
              title={power.effects?.find((effect) => effect.op === 'RawText')?.text || power.name}
              style={{
                fontFamily: MONO,
                fontSize: isPhonePortrait ? 9 : 10,
                fontWeight: 700,
                color: '#cc88ff',
                backgroundColor: '#aa44ff12',
                border: '1px solid #aa44ff30',
                borderRadius: 999,
                padding: isPhonePortrait ? '4px 8px' : '5px 9px',
                flexShrink: 0,
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                textAlign: floatLayout.textAlign,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {power.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PileCountButton({ label, count, color, onClick, compact = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        minWidth: 0,
        padding: compact ? '10px 12px' : '10px 14px',
        borderRadius: 10,
        fontFamily: MONO,
        fontSize: compact ? 11 : 12,
        color: C.textPrimary,
        backgroundColor: `${color}12`,
        border: `1px solid ${color}32`,
        boxShadow: `0 0 14px ${color}10`,
      }}
    >
      <span style={{ color, fontWeight: 700 }}>{count}</span>
      <span style={{ color: C.textPrimary, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function CombatActionButton({ label, onClick, disabled = false, active = false, compact = false, tone = 'default', style = EMPTY_OBJECT }) {
  const toneMap = {
    default: {
      background: 'rgba(255,255,255,0.04)',
      border: C.borderLight,
      color: C.textPrimary,
      shadow: 'none',
    },
    cyan: {
      background: `${C.neonCyan}16`,
      border: `${C.neonCyan}36`,
      color: C.neonCyan,
      shadow: `0 0 12px ${C.neonCyan}12`,
    },
    purple: {
      background: `${C.neonPurple}20`,
      border: `${C.neonPurple}42`,
      color: '#e9c9ff',
      shadow: `0 0 12px ${C.neonPurple}16`,
    },
    orange: {
      background: `${C.neonOrange}18`,
      border: `${C.neonOrange}40`,
      color: C.neonOrange,
      shadow: `0 0 12px ${C.neonOrange}14`,
    },
    primary: {
      background: `linear-gradient(135deg, ${C.neonCyan} 0%, #84fff5 100%)`,
      border: 'rgba(255,255,255,0.22)',
      color: '#021217',
      shadow: `0 0 18px ${C.neonCyan}32`,
    },
  };
  const styleTone = toneMap[tone] || toneMap.default;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 0,
        padding: compact ? '11px 10px' : '12px 14px',
        borderRadius: 10,
        fontFamily: MONO,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        transition: 'all 0.15s ease',
        background: active && tone !== 'primary'
          ? `linear-gradient(180deg, ${styleTone.background} 0%, rgba(255,255,255,0.08) 100%)`
          : styleTone.background,
        color: styleTone.color,
        border: `1px solid ${active && tone !== 'primary' ? styleTone.border : styleTone.border}`,
        boxShadow: active ? `${styleTone.shadow}, inset 0 1px 0 rgba(255,255,255,0.08)` : styleTone.shadow,
        fontSize: compact ? 11 : 12,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function PortraitCombatRail({ interactionLocked, onEndTurn, deckMenuOpen = false, onToggleDeckMenu, highlightEndTurn = false }) {
  return (
    <div
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '6px',
        borderRadius: 14,
        background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(5,8,14,0.96) 100%)',
        border: `1px solid ${C.neonCyan}28`,
        boxShadow: `0 8px 22px rgba(0,0,0,0.26), 0 0 18px ${C.neonCyan}10`,
      }}
    >
      <CombatActionButton
        label="End Turn"
        onClick={onEndTurn}
        disabled={interactionLocked}
        tone="primary"
        compact={true}
        style={{
          width: '100%',
          minHeight: 88,
          padding: '10px 7px',
          fontSize: 11,
          lineHeight: 1.1,
          ...(highlightEndTurn ? {
            border: `1px solid ${C.neonYellow}88`,
            boxShadow: `0 0 0 1px ${C.neonYellow}2a, 0 0 24px ${C.neonYellow}26`,
          } : {}),
        }}
      />
      <CombatActionButton
        label="Deck"
        onClick={() => onToggleDeckMenu?.(!deckMenuOpen)}
        active={deckMenuOpen}
        tone="orange"
        compact={true}
        style={{
          width: '100%',
          minHeight: 42,
          padding: '7px 6px',
          fontSize: 10,
        }}
      />
    </div>
  );
}

function CombatUtilityPanel({
  handCount,
  drawCount,
  discardCount,
  exhaustCount,
  interactionLocked,
  onViewPile,
  onOpenSettings,
  onAuto,
  onEndTurn,
  deckMenuOpen = false,
  onToggleDeckMenu,
  layoutMode = 'phone-portrait',
  showDeckAction = true,
  showEndTurnAction = true,
  showDeckMenu = true,
  highlightActionKey = null,
}) {
  const compact = layoutMode !== 'desktop';
  const isPhonePortrait = layoutMode === 'phone-portrait';
  const handleOpenPile = (pile) => {
    onViewPile?.(pile);
    onToggleDeckMenu?.(false);
  };
  const actionButtons = [
    {
      key: 'settings',
      label: 'Settings',
      onClick: onOpenSettings,
      tone: 'cyan',
      disabled: false,
      active: false,
    },
    {
      key: 'auto',
      label: 'Auto',
      onClick: onAuto,
      tone: 'purple',
      disabled: interactionLocked,
      active: false,
    },
    showDeckAction ? {
      key: 'deck',
      label: 'Deck',
      onClick: () => onToggleDeckMenu?.(!deckMenuOpen),
      tone: 'orange',
      disabled: false,
      active: deckMenuOpen,
    } : null,
    showEndTurnAction ? {
      key: 'end-turn',
      label: 'End Turn',
      onClick: onEndTurn,
      tone: 'primary',
      disabled: interactionLocked,
      active: false,
    } : null,
  ].filter(Boolean);
  const actionColumns = compact
    ? (isPhonePortrait ? `repeat(${Math.min(2, actionButtons.length)}, minmax(0, 1fr))` : `repeat(${actionButtons.length}, minmax(0, 1fr))`)
    : `repeat(${actionButtons.length}, minmax(0, 1fr))`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? (isPhonePortrait ? 6 : 8) : 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? (isPhonePortrait ? 5 : 6) : 8,
          padding: compact ? (isPhonePortrait ? '7px 8px' : '9px') : '10px 12px',
          borderRadius: compact ? 14 : 16,
          background: 'linear-gradient(180deg, rgba(8,12,20,0.96) 0%, rgba(5,8,14,0.98) 100%)',
          border: `1px solid ${C.borderLight}`,
          boxShadow: compact ? '0 8px 22px rgba(0,0,0,0.22)' : '0 10px 24px rgba(0,0,0,0.24)',
        }}
      >
        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim }}>
              COMBAT OPS
            </span>
            <span style={{ fontFamily: MONO, fontSize: 8, color: C.textSecondary }}>
              Hand {handCount} | center card arms target
            </span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: actionColumns, gap: compact ? 8 : 8 }}>
          {actionButtons.map((button) => (
            <CombatActionButton
              key={button.key}
              label={button.label}
              onClick={button.onClick}
              disabled={button.disabled}
              active={button.active}
              tone={button.tone}
              compact={compact}
              style={button.key === highlightActionKey ? {
                border: `1px solid ${C.neonYellow}88`,
                boxShadow: `0 0 0 1px ${C.neonYellow}2a, 0 0 24px ${C.neonYellow}26`,
              } : undefined}
            />
          ))}
        </div>
        {showDeckMenu && deckMenuOpen && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: compact ? 6 : 8,
              paddingTop: compact ? 2 : 4,
            }}
          >
            <PileCountButton label="Draw" count={drawCount} color={C.neonCyan} onClick={() => handleOpenPile('draw')} compact={compact} />
            <PileCountButton label="Disc" count={discardCount} color={C.neonOrange} onClick={() => handleOpenPile('discard')} compact={compact} />
            <PileCountButton label="Exh" count={exhaustCount} color={C.neonRed} onClick={() => handleOpenPile('exhaust')} compact={compact} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MUTATION DETAIL PANEL
// ============================================================
function MutationDetailPanel({ mid, data, align = 'left', compact = false }) {
  const mut  = data?.mutations?.[mid];
  const col  = getMutColor(mid);
  const lbl  = getMutLabel(mid);
  const lines = getMutationDetailLines(mut);

  return (
    <div
      style={{
        padding: compact ? '6px 8px' : '8px 10px',
        borderRadius: compact ? 9 : 10,
        fontFamily: MONO,
        background: `linear-gradient(180deg, ${col}12 0%, rgba(8,10,16,0.84) 100%)`,
        border: `1px solid ${col}45`,
        color: C.textPrimary,
        boxShadow: `0 0 18px ${col}14`,
        textAlign: align,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', gap: compact ? 5 : 6, marginBottom: compact ? 5 : 6 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: compact ? 22 : 24,
            height: compact ? 18 : 20,
            padding: compact ? '0 5px' : '0 6px',
            borderRadius: 999,
            backgroundColor: `${col}22`,
            border: `1px solid ${col}55`,
            color: col,
            fontSize: compact ? 8 : 9,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          {lbl}
        </span>
        <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: col, lineHeight: 1.3 }}>
          {mut?.name || mid}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lines.length > 0 ? lines.map((line, index) => (
          <div key={`${mid}-line-${index}`} style={{ fontSize: compact ? 8 : 9, lineHeight: 1.45, color: '#c7cfda' }}>
            {renderKeywordText(line, `${mid}-detail-${index}`)}
          </div>
        )) : (
          <div style={{ fontSize: compact ? 8 : 9, lineHeight: 1.45, color: C.textDim }}>
            No extra mutation behaviour.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CENTER CARD with mutation detail side panels
// ============================================================
const CENTER_CARD_SWIPE_THRESHOLD = 48;
const CENTER_CARD_SWIPE_AXIS_RATIO = 1.2;
const CENTER_CARD_SWIPE_MAX_OFFSET = 72;

function classifyCenterCardSwipe(dx, dy) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absY < CENTER_CARD_SWIPE_THRESHOLD) return null;
  if (absY < absX * CENTER_CARD_SWIPE_AXIS_RATIO) return null;
  return dy < 0 ? 'enemy' : 'self';
}

function CenterCardDisplay({
  cardInstance,
  cardDef,
  data,
  dismissed = false,
  onDismiss,
  onActivate,
  onSwipeCast = null,
  canActivate = false,
  activateHint = 'Double tap a target to play',
  helperNote = null,
  targetPreview = null,
  helperTone = C.neonCyan,
  layoutMode = 'desktop',
}) {
  const isMobileLayout = layoutMode !== 'desktop';
  const swipeStartRef = useRef(null);
  const [swipeOffsetY, setSwipeOffsetY] = useState(0);
  const [swipeIntent, setSwipeIntent] = useState(null);
  const [swipeActive, setSwipeActive] = useState(false);

  const resetSwipeGesture = useCallback(() => {
    swipeStartRef.current = null;
    setSwipeOffsetY(0);
    setSwipeIntent(null);
    setSwipeActive(false);
  }, []);

  const handleCardPointerDown = useCallback((event) => {
    if (!canActivate) return;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    setSwipeOffsetY(0);
    setSwipeIntent(null);
    setSwipeActive(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [canActivate]);

  const handleCardPointerMove = useCallback((event) => {
    const start = swipeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const nextIntent = classifyCenterCardSwipe(dx, dy);
    setSwipeIntent(nextIntent);
    setSwipeOffsetY(Math.max(-CENTER_CARD_SWIPE_MAX_OFFSET, Math.min(CENTER_CARD_SWIPE_MAX_OFFSET, dy)));
    if (Math.abs(dy) > 6 || Math.abs(dx) > 6) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const handleCardPointerUp = useCallback((event) => {
    const start = swipeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const nextIntent = classifyCenterCardSwipe(dx, dy);
    resetSwipeGesture();
    if (nextIntent) {
      event.preventDefault();
      event.stopPropagation();
      onSwipeCast?.(nextIntent);
    }
  }, [onSwipeCast, resetSwipeGesture]);

  const handleCardPointerCancel = useCallback(() => {
    resetSwipeGesture();
  }, [resetSwipeGesture]);

  const swipeAccent = swipeIntent === 'enemy'
    ? C.neonRed
    : swipeIntent === 'self'
      ? C.neonGreen
      : helperTone;
  const swipeHintLabel = swipeIntent === 'enemy'
    ? 'CAST TO SELECTED TARGET'
    : swipeIntent === 'self'
      ? 'CAST TO SELF'
      : null;
  const sharedCardGestureProps = {
    onPointerDown: handleCardPointerDown,
    onPointerMove: handleCardPointerMove,
    onPointerUp: handleCardPointerUp,
    onPointerCancel: handleCardPointerCancel,
    onLostPointerCapture: handleCardPointerCancel,
  };

  if (!cardInstance || !cardDef || dismissed) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: isMobileLayout ? 88 : 120,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isMobileLayout ? 5 : 6,
            padding: isMobileLayout ? '10px 12px' : '14px 18px',
            borderRadius: isMobileLayout ? 14 : 16,
            background: 'linear-gradient(180deg, rgba(8,12,20,0.82) 0%, rgba(5,8,14,0.72) 100%)',
            border: `1px solid ${C.borderLight}`,
            boxShadow: '0 10px 28px rgba(0,0,0,0.24)',
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: isMobileLayout ? 7 : 8, fontWeight: 700, letterSpacing: '0.14em', color: C.textDim }}>
            ACTIVE CARD
          </div>
          <span style={{ fontFamily: MONO, color: C.textPrimary, fontSize: isMobileLayout ? 10 : 12, textAlign: 'center' }}>
            {dismissed ? 'Swipe the hand to reopen the active card' : 'Swipe or tap the hand to choose a card, then swipe up or down to cast'}
          </span>
        </div>
      </div>
    );
  }

  const color = getCardColor(cardDef.type);
  const cost = Math.max(0, (cardDef.costRAM || 0) + (cardInstance.ramCostDelta || 0));
  const mutations = cardInstance.appliedMutations || [];
  const effectLines = formatEffectsLong(cardDef.effects);
  const { nextValue: nextMutationIn, finalValue: finalMutationIn, isDecaying } = getCardLifecycleDisplay(cardDef, cardInstance);
  const imgSrc = getCardImage(cardDef?.id);
  const visibleTags = getVisibleCardTags(cardDef.tags || EMPTY_ARRAY);
  const isPlayable = canActivate;
  const shellAccent = isPlayable ? color : '#9aa4ba';
  const shellBorder = isPlayable ? `${color}70` : '#4b5468';
  const shellShadow = isPlayable
    ? `0 0 28px ${color}24, 0 8px 24px rgba(0,0,0,0.55)`
    : '0 0 16px rgba(120,132,160,0.12), 0 8px 24px rgba(0,0,0,0.58)';
  const desktopShellShadow = isPlayable
    ? `0 0 40px ${color}28, 0 8px 32px rgba(0,0,0,0.7)`
    : '0 0 20px rgba(120,132,160,0.14), 0 8px 32px rgba(0,0,0,0.72)';
  const shellArtFilter = isPlayable
    ? 'saturate(1.04) contrast(1.02) brightness(0.9)'
    : 'grayscale(0.2) saturate(0.42) contrast(0.96) brightness(0.68)';
  const shellFallbackBackground = isPlayable
    ? `linear-gradient(145deg, ${color}22 0%, ${C.bgCard} 48%, ${color}0c 100%)`
    : 'linear-gradient(145deg, rgba(96,108,132,0.24) 0%, rgba(18,18,26,1) 48%, rgba(82,92,112,0.12) 100%)';
  const shellOverlayBackground = isPlayable
    ? `
      radial-gradient(circle at 24% 16%, ${color}28 0%, transparent 34%),
      linear-gradient(180deg, rgba(8,10,16,0.08) 0%, rgba(8,10,16,0.24) 24%, rgba(8,10,16,0.78) 58%, rgba(8,10,16,0.95) 100%)
    `
    : `
      radial-gradient(circle at 24% 16%, rgba(130,144,172,0.12) 0%, transparent 34%),
      linear-gradient(180deg, rgba(8,10,16,0.22) 0%, rgba(8,10,16,0.38) 24%, rgba(8,10,16,0.82) 58%, rgba(8,10,16,0.96) 100%)
    `;
  const shellInfoBackground = isPlayable
    ? 'linear-gradient(180deg, rgba(8,10,16,0.18) 0%, rgba(8,10,16,0.74) 12%, rgba(8,10,16,0.92) 100%)'
    : 'linear-gradient(180deg, rgba(8,10,16,0.28) 0%, rgba(8,10,16,0.8) 12%, rgba(8,10,16,0.94) 100%)';
  const shellInfoBorder = isPlayable ? `${color}22` : '#465063';
  const shellDivider = isPlayable ? `${color}20` : '#40495a';
  const shellTypeColor = shellAccent;

  if (isMobileLayout) {
    const isPhonePortrait = layoutMode === 'phone-portrait';
    const mobileCardWidth = isPhonePortrait
      ? 'min(38vw, 148px)'
      : 'clamp(116px, 17vw, 148px)';
    const utilityRailWidth = isPhonePortrait ? 54 : 0;
    const helperPanel = activateHint ? (
      <div
        style={{
          width: 'min(100%, 300px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          padding: '7px 9px',
          borderRadius: 12,
          background: 'rgba(5,9,16,0.84)',
          border: `1px solid ${helperTone}2f`,
          boxShadow: `0 0 18px ${helperTone}10`,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, letterSpacing: '0.14em', color: helperTone, textTransform: 'uppercase' }}>
          Targeting
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9, lineHeight: 1.45, color: C.textPrimary }}>
          {activateHint}
        </span>
        {helperNote && (
          <span style={{ fontFamily: MONO, fontSize: 8, lineHeight: 1.4, color: C.textSecondary }}>
            {helperNote}
          </span>
        )}
      </div>
    ) : null;
    const utilityButtonBaseStyle = {
      borderRadius: 999,
      border: `1px solid ${C.borderLight}`,
      background: 'rgba(10,14,22,0.84)',
      color: C.textSecondary,
      fontFamily: MONO,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      boxShadow: '0 10px 22px rgba(0,0,0,0.22)',
    };
    const mobileCard = (
      <div
        role="button"
        tabIndex={canActivate ? 0 : -1}
        aria-disabled={!canActivate}
        aria-label={cardDef?.name ? `${activateHint}: ${cardDef.name}` : activateHint}
        title={activateHint}
        {...sharedCardGestureProps}
        onKeyDown={canActivate ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate?.();
          }
        } : undefined}
        style={{
          position: 'relative',
          borderRadius: 12,
          width: mobileCardWidth,
          aspectRatio: '13 / 18',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          backgroundColor: C.bgCard,
          border: `2px solid ${shellBorder}`,
          boxShadow: swipeHintLabel
            ? `0 0 0 1px ${swipeAccent}30, 0 0 28px ${swipeAccent}22, 0 8px 24px rgba(0,0,0,0.55)`
            : shellShadow,
          overflow: 'hidden',
          cursor: 'default',
          flexShrink: 0,
          transform: swipeOffsetY ? `translateY(${swipeOffsetY}px)` : 'translateY(0)',
          transition: swipeActive ? 'none' : 'transform 0.14s ease, box-shadow 0.14s ease',
          touchAction: 'none',
        }}
      >
        <RuntimeArt
          src={imgSrc}
          alt={cardDef?.name || 'Selected card'}
          accent={shellAccent}
          label={cardDef?.name || 'Selected card'}
          loading="eager"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
          }}
          imageStyle={{
            objectFit: 'cover',
            objectPosition: 'center center',
            transform: 'scale(1.02)',
            filter: shellArtFilter,
          }}
          fallbackStyle={{
            background: shellFallbackBackground,
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: shellOverlayBackground,
            pointerEvents: 'none',
          }}
        />

        {!isPlayable && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10,12,18,0.28)',
              pointerEvents: 'none',
            }}
          />
        )}

        {swipeHintLabel && (
          <div
            style={{
              position: 'absolute',
              top: 42,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 11,
              padding: '4px 8px',
              borderRadius: 999,
              background: 'rgba(4,8,14,0.9)',
              border: `1px solid ${swipeAccent}55`,
              color: swipeAccent,
              fontFamily: MONO,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              boxShadow: `0 0 18px ${swipeAccent}18`,
              pointerEvents: 'none',
            }}
          >
            {swipeHintLabel}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 26,
            height: 26,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontFamily: MONO,
            zIndex: 10,
            backgroundColor: color,
            color: '#000',
            boxShadow: isPlayable ? `0 0 10px ${color}80` : '0 0 10px rgba(154,164,186,0.32)',
            fontSize: 12,
          }}
        >
          {cost}
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            margin: 'auto 8px 8px',
            padding: '10px 9px 8px',
            borderRadius: 12,
            background: shellInfoBackground,
            border: `1px solid ${shellInfoBorder}`,
            boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: '44%',
          }}
        >
          <div style={{ fontFamily: MONO, fontWeight: 700, color: C.textPrimary, fontSize: 12, textShadow: '0 1px 10px rgba(0,0,0,0.55)' }}>
            {cardDef.name}
          </div>
          <div style={{ fontFamily: MONO, textTransform: 'uppercase', color: shellTypeColor, fontSize: 8, letterSpacing: '0.1em' }}>
            {cardDef.type}
          </div>

          <div style={{ fontFamily: MONO, color: '#bcc3cf', fontSize: 10, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {effectLines.map((line, i) => (
              <div key={i}>{renderKeywordText(line, `center-effect-mobile-${i}`)}</div>
            ))}
          </div>

          {visibleTags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {visibleTags.map((tag, i) => (
                <KeywordTooltipToken key={i} text={tag} asChip={true} />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '6px', borderTop: `1px solid ${shellDivider}` }}>
            <div style={{ fontFamily: MONO, color: C.textDim, fontSize: 8 }}>
              NEXT: <span style={{ color: C.textPrimary, fontWeight: 700 }}>{nextMutationIn ?? '-'}</span>
            </div>
            <div style={{ fontFamily: MONO, color: isDecaying ? C.neonOrange : C.textDim, fontSize: 8 }}>
              FINAL: <span style={{ fontWeight: 700 }}>{finalMutationIn ?? '-'}</span>
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <div
        className="animate-slide-up"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isPhonePortrait ? 'stretch' : 'flex-end',
          gap: 4,
          padding: isPhonePortrait ? '0' : '4px 0',
          marginTop: isPhonePortrait ? -32 : -4,
        }}
      >
        {isPhonePortrait ? (
          <div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: `minmax(0, 1fr) auto ${utilityRailWidth}px`,
              columnGap: 8,
              justifyContent: 'flex-end',
              alignItems: 'start',
            }}
          >
            <div />
            {mobileCard}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignItems: 'stretch',
                paddingTop: 24,
              }}
            >
              <button
                onClick={onDismiss}
                aria-label="Hide active card details"
                style={{
                  ...utilityButtonBaseStyle,
                  width: utilityRailWidth,
                  height: 50,
                }}
              >
                Hide
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', padding: '0 2px' }}>
              <button
                onClick={onDismiss}
                aria-label="Hide active card details"
                style={{
                  ...utilityButtonBaseStyle,
                  padding: '8px 12px',
                }}
              >
                Hide
              </button>
            </div>
            {mobileCard}
          </>
        )}

        {helperPanel}

        {mutations.length > 0 && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 2,
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            {mutations.map((mid, index) => (
              <div key={`${mid}-mobile-${index}`} style={{ flex: '0 0 min(156px, 54vw)' }}>
                <MutationDetailPanel
                  mid={mid}
                  data={data}
                  align="left"
                  compact={true}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="animate-slide-up"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        zIndex: 700,
        pointerEvents: 'auto',
        padding: '0 clamp(12px, 4vw, 32px) 0 clamp(24px, 6vw, 72px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ position: 'relative', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', gap: 12, width: 'min(100%, 760px)', minHeight: 180, pointerEvents: 'auto' }}
      >
        {mutations.length > 0 ? (
          <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: 'min(38vw, 320px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, maxHeight: 'min(62vh, 460px)', overflowY: 'auto', padding: '4px 4px 4px 0' }}>
            {mutations.map((mid, i) => (
              <MutationDetailPanel key={`left-${mid}-${i}`} mid={mid} data={data} align="left" />
            ))}
          </div>
        ) : null}

        <div
        role="button"
        tabIndex={canActivate ? 0 : -1}
        aria-disabled={!canActivate}
        aria-label={cardDef?.name ? `${activateHint}: ${cardDef.name}` : activateHint}
        title={activateHint}
        {...sharedCardGestureProps}
        onKeyDown={canActivate ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate?.();
          }
          } : undefined}
          style={{
            position: 'relative',
            borderRadius: '12px',
            zIndex: 20,
            width: 'min(44vw, 178px)',
            aspectRatio: '13 / 18',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            backgroundColor: C.bgCard,
            border: `2px solid ${shellBorder}`,
            boxShadow: swipeHintLabel
              ? `0 0 0 1px ${swipeAccent}30, 0 0 40px ${swipeAccent}22, 0 8px 32px rgba(0,0,0,0.7)`
              : desktopShellShadow,
            overflow: 'hidden',
            cursor: 'default',
            flexShrink: 0,
            transform: swipeOffsetY ? `translateY(${swipeOffsetY}px)` : 'translateY(0)',
            transition: swipeActive ? 'none' : 'transform 0.14s ease, box-shadow 0.14s ease',
            touchAction: 'none',
          }}
        >
          <RuntimeArt
            src={imgSrc}
            alt={cardDef?.name || 'Selected card'}
            accent={shellAccent}
            label={cardDef?.name || 'Selected card'}
            loading="eager"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
            }}
            imageStyle={{
              objectFit: 'cover',
              objectPosition: 'center center',
              transform: 'scale(1.02)',
              filter: shellArtFilter,
            }}
            fallbackStyle={{
              background: shellFallbackBackground,
            }}
          />

          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: shellOverlayBackground,
              pointerEvents: 'none',
            }}
          />

          {!isPlayable && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(10,12,18,0.28)',
                pointerEvents: 'none',
              }}
            />
          )}

          {swipeHintLabel && (
            <div
              style={{
                position: 'absolute',
                top: 46,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 11,
                padding: '5px 10px',
                borderRadius: 999,
                background: 'rgba(4,8,14,0.9)',
                border: `1px solid ${swipeAccent}55`,
                color: swipeAccent,
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                boxShadow: `0 0 18px ${swipeAccent}18`,
                pointerEvents: 'none',
              }}
            >
              {swipeHintLabel}
            </div>
          )}

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
              boxShadow: isPlayable ? `0 0 10px ${color}80` : '0 0 10px rgba(154,164,186,0.32)',
              fontSize: 14,
            }}
          >
            {cost}
          </div>

          <div
            style={{
              position: 'relative',
              zIndex: 2,
              margin: 'auto 10px 10px',
              padding: '12px 10px 10px',
              borderRadius: 14,
              background: shellInfoBackground,
              border: `1px solid ${shellInfoBorder}`,
              boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: '46%',
            }}
          >
            <div style={{ fontFamily: MONO, fontWeight: 700, marginBottom: '2px', color: C.textPrimary, fontSize: 14, textShadow: '0 1px 10px rgba(0,0,0,0.55)' }}>
              {cardDef.name}
            </div>
            <div style={{ fontFamily: MONO, textTransform: 'uppercase', color: shellTypeColor, fontSize: 9, letterSpacing: '0.1em' }}>
              {cardDef.type}
            </div>

            <div style={{ fontFamily: MONO, color: '#bcc3cf', fontSize: 11, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {effectLines.map((line, i) => (
                <div key={i}>{renderKeywordText(line, `center-effect-${i}`)}</div>
              ))}
            </div>

            {visibleTags.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {visibleTags.map((tag, i) => (
                  <KeywordTooltipToken key={i} text={tag} asChip={true} />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '6px', borderTop: `1px solid ${shellDivider}` }}>
              <div style={{ fontFamily: MONO, color: C.textDim, fontSize: 9 }}>
                NEXT: <span style={{ color: C.textPrimary, fontWeight: 700 }}>{nextMutationIn ?? '-'}</span>
              </div>
              <div style={{ fontFamily: MONO, color: isDecaying ? C.neonOrange : C.textDim, fontSize: 9 }}>
                FINAL: <span style={{ fontWeight: 700 }}>{finalMutationIn ?? '-'}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

function CombatOpsConsole({
  activeAnimation = null,
  activeCardDef = null,
  targetedEnemy = null,
  targetedIntentBadges = EMPTY_ARRAY,
  targetPreview = null,
  heatForecast = null,
  heat = 0,
  maxHeat = 20,
  arenaModifier = null,
  data = null,
}) {
  const currentHeatState = getHeatState(heat, maxHeat);

  let accent = arenaModifier?.color || currentHeatState.color || C.neonCyan;
  let eyebrow = 'COMBAT OPS';
  let title = arenaModifier?.label || `Trace ${currentHeatState.label}`;
  let body = arenaModifier?.summary || currentHeatState.summary;
  let tokens = [];
  let metrics = [
    { label: 'Heat', value: `${heat}/${maxHeat}`, tone: currentHeatState.color },
    targetedEnemy ? { label: 'Focus', value: targetedEnemy.name || 'Enemy', tone: getIntentColor(targetedEnemy.intent?.type) } : null,
    arenaModifier ? { label: 'Arena', value: arenaModifier.label, tone: arenaModifier.color || C.neonOrange } : null,
  ].filter(Boolean);

  if (activeAnimation) {
    const animCardDef = data?.cards?.[activeAnimation.defId];
    const meta = getPlayAnimationMeta(
      activeAnimation.actor,
      activeAnimation.intentType,
      animCardDef?.type,
    );
    const cue = activeAnimation.actor === 'enemy'
      ? getEnemyActionCue(activeAnimation.intentType, meta.accent)
      : null;

    accent = meta.accent;
    eyebrow = activeAnimation.actor === 'enemy' ? 'HOSTILE SIGNAL' : 'CARD ROUTE LIVE';
    title = activeAnimation.actor === 'enemy'
      ? `${activeAnimation.enemyName || 'Enemy'} ${meta.label}`
      : `${animCardDef?.name || 'Card'} ${meta.label}`;
    body = activeAnimation.actor === 'enemy'
      ? (cue?.targetLabel || activeAnimation.intentType || 'Resolving action')
      : formatEffectsLong(animCardDef?.effects).slice(0, 2).join(' • ');
    tokens = buildAnimationEffectTokens(activeAnimation.effectSummary, activeAnimation.reactions);
    metrics = [
      { label: 'Source', value: activeAnimation.actor === 'enemy' ? (activeAnimation.enemyName || 'Enemy') : 'Player', tone: accent },
      cue ? { label: 'Route', value: cue.shortLabel, tone: accent } : null,
      { label: 'Heat', value: `${heat}/${maxHeat}`, tone: currentHeatState.color },
    ].filter(Boolean);
  } else if (activeCardDef) {
    const cardAccent = getCardColor(activeCardDef.type);
    accent = targetPreview?.tone || cardAccent;
    eyebrow = 'CARD ROUTE';
    title = activeCardDef.name || 'Selected card';
    body = targetPreview?.summary
      || (targetPreview?.label ? `Route armed on ${targetPreview.label}.` : 'Choose a route and cast.');
    tokens = [
      ...(heatForecast?.tokens || EMPTY_ARRAY),
      ...(heatForecast?.gain != null ? [{
        label: `TRACE +${heatForecast.gain}`,
        color: heatForecast.nextState?.color || currentHeatState.color,
      }] : []),
    ].slice(0, 5);
    metrics = [
      targetPreview?.routes?.[0]
        ? { label: targetPreview.routes[0].label, value: targetPreview.routes[0].value, tone: targetPreview.routes[0].tone }
        : null,
      targetPreview?.routes?.[1]
        ? { label: targetPreview.routes[1].label, value: targetPreview.routes[1].value, tone: targetPreview.routes[1].tone }
        : null,
      heatForecast?.nextState
        ? { label: 'After cast', value: `${heatForecast.nextHeat}/${maxHeat} ${heatForecast.nextState.shortLabel}`, tone: heatForecast.nextState.color }
        : { label: 'Heat', value: `${heat}/${maxHeat}`, tone: currentHeatState.color },
    ].filter(Boolean);
  } else if (targetedEnemy) {
    const intentColor = getIntentColor(targetedEnemy.intent?.type);
    accent = intentColor;
    eyebrow = 'ENEMY Dossier';
    title = targetedEnemy.name || 'Enemy';
    body = targetedEnemy.intent?.name
      ? `Queued action: ${targetedEnemy.intent.name}.`
      : `Queued action: ${targetedEnemy.intent?.type || 'Unknown intent'}.`;
    tokens = targetedIntentBadges.slice(0, 4).map((badge) => ({
      label: badge.value != null ? `${badge.label.toUpperCase()} ${badge.value}` : String(badge.label || '').toUpperCase(),
      color: badge.color || intentColor,
    }));
    metrics = [
      { label: 'Intent', value: targetedEnemy.intent?.type || 'Unknown', tone: intentColor },
      { label: 'HP', value: `${targetedEnemy.hp}/${targetedEnemy.maxHP}`, tone: getHealthColor(targetedEnemy.hp, targetedEnemy.maxHP) },
      { label: 'Heat', value: `${heat}/${maxHeat}`, tone: currentHeatState.color },
    ];
  }

  return (
    <div
      className="panel-chrome ops-console-shell"
      style={{
        width: 'min(100%, 880px)',
        padding: '14px 16px',
        borderRadius: 20,
        border: `1px solid ${accent}28`,
        background: `
          linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 18%, transparent 84%, rgba(255,255,255,0.02) 100%),
          radial-gradient(circle at 0% 0%, ${accent}18 0%, transparent 34%),
          radial-gradient(circle at 100% 12%, rgba(255,255,255,0.05) 0%, transparent 18%),
          linear-gradient(180deg, rgba(10,14,24,0.96) 0%, rgba(7,10,18,0.98) 100%)
        `,
        boxShadow: `0 20px 40px rgba(0,0,0,0.28), 0 0 24px ${accent}12`,
        color: accent,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, boxShadow: `0 0 14px ${accent}` }} />
        <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent }}>
          Live Tactical Feed
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent }}>
            {eyebrow}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 0.92, color: C.textPrimary }}>
            {title}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.45, color: '#c5cfdb' }}>
            {body}
          </div>
        </div>
        <div
          style={{
            minWidth: 74,
            padding: '8px 10px',
            borderRadius: 14,
            border: `1px solid ${accent}34`,
            background: `linear-gradient(180deg, ${accent}16 0%, rgba(8, 12, 18, 0.72) 100%)`,
            textAlign: 'right',
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Trace
          </div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: currentHeatState.color }}>
            {heat}
            <span style={{ color: C.textDim, fontSize: 11 }}>/</span>
            {maxHeat}
          </div>
        </div>
      </div>

      {metrics.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, minmax(0, 1fr))`, gap: 8 }}>
          {metrics.map((metric) => (
            <div
              key={`${metric.label}-${metric.value}`}
              style={{
                padding: '8px 10px',
                borderRadius: 14,
                border: `1px solid ${metric.tone || accent}24`,
                background: 'rgba(8,12,18,0.72)',
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
                {metric.label}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: metric.tone || C.textPrimary, lineHeight: 1.35 }}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {tokens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tokens.map((token) => (
            <div
              key={`${token.label}-${token.color}`}
              style={{
                padding: '5px 8px',
                borderRadius: 999,
                border: `1px solid ${token.color}40`,
                background: `${token.color}16`,
                color: token.color,
                fontFamily: MONO,
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {token.label}
            </div>
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
  const { core: isCore, countdownValue: visibleCountdown, isDecaying } = getCardLifecycleDisplay(cardDef, cardInstance);
  const isBricked   = cardInstance?.finalMutationId === 'J_BRICK';
  const isRewritten  = cardInstance?.finalMutationId === 'J_REWRITE';
  const isMutable   = cardDef?.tags && !cardDef.tags.includes('Core') && !cardDef.tags.includes('EnemyCard');
  const isVolatile  = (cardDef?.tags || []).includes('Volatile');
  const isOneShot   = (cardDef?.tags || []).includes('OneShot');
  const isExhaust   = (cardDef?.tags || []).includes('Exhaust') || (cardDef?.tags || []).includes('Ethereal');
  const isPower     = (cardDef?.tags || []).includes('Power') || cardDef?.type === 'Power';

  const w = compact ? 78 : 105;
  const h = compact ? 108 : 148;
  const badgeSize = compact ? 20 : 24;
  const badgeOffset = compact ? '-4px' : '-6px';
  const artH = compact ? h : 60;
  const imgSrc = getCardImage(cardDef?.id);
  const touchStartRef = useRef(null);
  const touchMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const clearTouchGesture = useCallback(() => {
    touchStartRef.current = null;
    touchMovedRef.current = false;
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.pointerType !== 'touch') return;
    touchStartRef.current = { x: e.clientX, y: e.clientY };
    touchMovedRef.current = false;
    suppressClickRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (e.pointerType !== 'touch' || !touchStartRef.current) return;
    const dx = Math.abs(e.clientX - touchStartRef.current.x);
    const dy = Math.abs(e.clientY - touchStartRef.current.y);
    if ((dx > 8 && dx >= dy * 0.75) || dy > 14) {
      touchMovedRef.current = true;
    }
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (e.pointerType === 'touch' && !touchMovedRef.current) {
      suppressClickRef.current = true;
      onSelect?.();
    }
    window.setTimeout(() => {
      clearTouchGesture();
    }, 0);
  }, [clearTouchGesture, onSelect]);

  const handleClick = useCallback((e) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (touchMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelect?.();
  }, [onSelect]);

  return (
    <button
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearTouchGesture}
      aria-pressed={isSelected}
      title={isSelected ? 'Focused in center' : 'Tap to center'}
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
        touchAction: compact ? 'pan-x' : 'manipulation',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
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
      {visibleCountdown != null && (
        <div
          style={{
            position: 'absolute',
            top: badgeOffset,
            right: badgeOffset,
            minWidth: badgeSize,
            height: badgeSize,
            paddingInline: isCore ? (compact ? 5 : 7) : 0,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontFamily: MONO,
            zIndex: 10,
            backgroundColor: isCore ? `${C.neonCyan}18` : (isDecaying ? C.neonOrange : C.bgDark),
            color: isCore ? C.neonCyan : (isDecaying ? '#000' : C.textDim),
            border: isCore ? `1px solid ${C.neonCyan}45` : (isDecaying ? 'none' : `1px solid ${C.border}`),
            boxShadow: isCore ? `0 0 8px ${C.neonCyan}28` : (isDecaying ? `0 0 8px ${C.neonOrange}80` : 'none'),
            fontSize: compact ? (isCore ? 7 : 8) : (isCore ? 8 : 10),
          }}
        >
          {visibleCountdown}
        </div>
      )}

      {/* Mutable indicator (non-Core cards that can receive mutations) */}
      {isMutable && !hasMutations && (
        <div
          title="Non-core card — will mutate over time"
          style={{
            position: 'absolute',
            bottom: 3,
            right: 3,
            width: compact ? 12 : 14,
            height: compact ? 12 : 14,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontFamily: MONO,
            zIndex: 10,
            backgroundColor: `${C.neonPurple}25`,
            color: `${C.neonPurple}cc`,
            border: `1px solid ${C.neonPurple}50`,
            fontSize: compact ? 6 : 8,
            lineHeight: 1,
          }}
        >
          ✦
        </div>
      )}

      {/* Volatile / OneShot / Exhaust indicator strip (bottom-left) */}
      {(isVolatile || isOneShot || isExhaust || isPower) && !compact && (
        <div style={{
          position: 'absolute', bottom: 3, left: 3,
          display: 'flex', gap: 2, zIndex: 10,
        }}>
          {isPower && (
            <span title="Power — stays in play permanently, provides ongoing passive effects" style={{
              fontFamily: MONO, fontSize: 6, fontWeight: 700, letterSpacing: '0.05em',
              padding: '1px 3px', borderRadius: 3,
              backgroundColor: '#aa44ff22', color: '#cc88ff',
              border: '1px solid #aa44ff55',
            }}>PWR</span>
          )}
          {isVolatile && (
            <span title="Volatile — discarded after use" style={{
              fontFamily: MONO, fontSize: 6, fontWeight: 700, letterSpacing: '0.05em',
              padding: '1px 3px', borderRadius: 3,
              backgroundColor: `${C.neonOrange}22`, color: C.neonOrange,
              border: `1px solid ${C.neonOrange}55`,
            }}>VOL</span>
          )}
          {isOneShot && (
            <span title="One-Shot — permanently removed after use" style={{
              fontFamily: MONO, fontSize: 6, fontWeight: 700, letterSpacing: '0.05em',
              padding: '1px 3px', borderRadius: 3,
              backgroundColor: `${C.neonRed}22`, color: C.neonRed,
              border: `1px solid ${C.neonRed}55`,
            }}>1×</span>
          )}
          {isExhaust && !isOneShot && (
            <span title="Exhaust — removed from deck this combat" style={{
              fontFamily: MONO, fontSize: 6, fontWeight: 700, letterSpacing: '0.05em',
              padding: '1px 3px', borderRadius: 3,
              backgroundColor: `${C.neonPurple}22`, color: C.neonPurple,
              border: `1px solid ${C.neonPurple}55`,
            }}>EXH</span>
          )}
        </div>
      )}

      {/* Card artwork */}
      <div style={{
        height: artH, overflow: 'hidden',
        borderBottom: compact ? 'none' : `1px solid ${color}30`,
        position: 'relative',
        backgroundColor: `${color}08`,
      }}>
        <RuntimeArt
          src={imgSrc}
          alt={cardDef?.name || 'Card art'}
          accent={color}
          label={cardDef?.name || 'Card art'}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
          imageStyle={{
            objectFit: 'cover',
            objectPosition: compact ? 'center center' : 'top center',
            transform: compact ? 'scale(1.03)' : 'none',
            filter: compact ? 'saturate(1.05) contrast(1.02) brightness(0.92)' : 'none',
          }}
          fallbackStyle={{
            background: `linear-gradient(135deg, ${color}15 0%, ${C.bgCard} 50%, ${color}08 100%)`,
          }}
        />
        {/* Type colour tint overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: compact
            ? `linear-gradient(to bottom, transparent 22%, rgba(8,10,16,0.18) 48%, rgba(8,10,16,0.84) 78%, ${C.bgCard}f2 100%)`
            : `linear-gradient(to bottom, transparent 60%, ${C.bgCard}dd 100%)`,
          pointerEvents: 'none',
        }} />
      </div>

      {/* Card content */}
      <div style={{
        padding: compact ? '5px 5px 4px' : '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        height: compact ? 'auto' : `calc(100% - ${artH}px)`,
        position: compact ? 'absolute' : 'relative',
        inset: compact ? 'auto 4px 4px 4px' : 'auto',
        borderRadius: compact ? 8 : 0,
        background: compact ? 'linear-gradient(180deg, rgba(8,10,16,0.18) 0%, rgba(8,10,16,0.74) 12%, rgba(8,10,16,0.92) 100%)' : 'transparent',
        border: compact ? `1px solid ${color}22` : 'none',
        boxShadow: compact ? '0 8px 20px rgba(0,0,0,0.24)' : 'none',
        backdropFilter: compact ? 'blur(4px)' : 'none',
        justifyContent: compact ? 'flex-end' : 'flex-start',
      }}>
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
            fontSize: compact ? 9 : 10,
            textShadow: compact ? '0 1px 10px rgba(0,0,0,0.55)' : 'none',
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
            color: compact ? '#c5cbd5' : C.textSecondary,
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

const PLAYER_PLAY_ANIMATION_MS = 460;
const MUTATION_DISCOVERY_MS = 1750;
const MUTATION_REPEAT_LINGER_MS = 1220;
const ENEMY_PLAY_ANIMATION_MS = {
  Attack: 1120,
  Defense: 920,
  Buff: 980,
  Debuff: 1080,
  Unknown: 920,
};

function getPlayAnimationDuration(actor, intentType) {
  if (actor === 'player') return PLAYER_PLAY_ANIMATION_MS;
  return ENEMY_PLAY_ANIMATION_MS[intentType] || ENEMY_PLAY_ANIMATION_MS.Unknown;
}

function getPlayAnimationMeta(actor, intentType, cardType) {
  if (actor === 'player') {
    const accent = getCardColor(cardType);
    return {
      accent,
      className: 'play-card-player',
      label: 'PLAYER',
      badge: 'RUN',
      badgeColor: accent,
    };
  }

  switch (intentType) {
    case 'Attack':
      return { accent: C.neonRed, className: 'play-card-enemy-attack', label: 'ATTACK', badge: getIntentIcon(intentType), badgeColor: C.neonRed };
    case 'Defense':
      return { accent: C.neonCyan, className: 'play-card-enemy-defense', label: 'DEFEND', badge: getIntentIcon(intentType), badgeColor: C.neonCyan };
    case 'Buff':
      return { accent: C.neonGreen, className: 'play-card-enemy-buff', label: 'BOOST', badge: getIntentIcon(intentType), badgeColor: C.neonGreen };
    case 'Debuff':
      return { accent: C.neonPurple, className: 'play-card-enemy-debuff', label: 'JAM', badge: getIntentIcon(intentType), badgeColor: C.neonPurple };
    default:
      return { accent: C.neonOrange, className: 'play-card-enemy-defense', label: 'SYSTEM', badge: getIntentIcon(intentType), badgeColor: C.neonOrange };
  }
}

function getEnemyActionCue(intentType, accent) {
  switch (intentType) {
    case 'Attack':
      return {
        title: 'Incoming attack',
        targetLabel: 'Targets you',
        shortLabel: 'TO YOU',
        targetZone: 'player',
        wash: `linear-gradient(180deg, transparent 0%, ${accent}12 22%, ${accent}0f 48%, transparent 100%)`,
        lane: `linear-gradient(180deg, ${accent}00 0%, ${accent}30 12%, ${accent}5c 46%, ${accent}18 82%, ${accent}00 100%)`,
        zone: `radial-gradient(circle at 50% 52%, ${accent}20 0%, ${accent}12 30%, transparent 72%)`,
      };
    case 'Defense':
      return {
        title: 'Enemy fortifying',
        targetLabel: 'Boosting self',
        shortLabel: 'FORTIFY',
        targetZone: 'enemy',
        wash: `linear-gradient(180deg, ${accent}0f 0%, ${accent}09 18%, transparent 58%, transparent 100%)`,
        lane: `linear-gradient(180deg, ${accent}00 0%, ${accent}24 20%, ${accent}46 50%, ${accent}0a 100%)`,
        zone: `radial-gradient(circle at 50% 40%, ${accent}1c 0%, ${accent}10 28%, transparent 70%)`,
      };
    case 'Buff':
      return {
        title: 'Enemy self-buff',
        targetLabel: 'Empowering self',
        shortLabel: 'BOOST',
        targetZone: 'enemy',
        wash: `linear-gradient(180deg, ${accent}12 0%, ${accent}08 22%, transparent 62%, transparent 100%)`,
        lane: `linear-gradient(180deg, ${accent}00 0%, ${accent}26 16%, ${accent}44 48%, ${accent}08 100%)`,
        zone: `radial-gradient(circle at 50% 42%, ${accent}22 0%, ${accent}11 30%, transparent 72%)`,
      };
    case 'Debuff':
      return {
        title: 'Incoming disruption',
        targetLabel: 'Status pressure',
        shortLabel: 'JAM YOU',
        targetZone: 'player',
        wash: `linear-gradient(180deg, transparent 0%, ${accent}10 20%, ${accent}0d 54%, transparent 100%)`,
        lane: `linear-gradient(180deg, ${accent}00 0%, ${accent}2a 10%, ${accent}4f 42%, ${accent}12 82%, ${accent}00 100%)`,
        zone: `radial-gradient(circle at 50% 52%, ${accent}22 0%, ${accent}12 28%, transparent 72%)`,
      };
    default:
      return {
        title: 'Enemy action',
        targetLabel: 'System effect',
        shortLabel: 'SYSTEM',
        targetZone: 'neutral',
        wash: `linear-gradient(180deg, transparent 0%, ${accent}0d 22%, ${accent}08 52%, transparent 100%)`,
        lane: `linear-gradient(180deg, ${accent}00 0%, ${accent}26 16%, ${accent}42 48%, ${accent}08 100%)`,
        zone: `radial-gradient(circle at 50% 50%, ${accent}1e 0%, ${accent}10 28%, transparent 72%)`,
      };
  }
}

function getActionZoneLayout(targetZone) {
  switch (targetZone) {
    case 'player':
      return {
        left: '50%',
        top: '77%',
        width: 'min(76vw, 560px)',
        height: 'min(28vh, 220px)',
      };
    case 'enemy':
      return {
        left: '69%',
        top: '19%',
        width: 'min(48vw, 360px)',
        height: 'min(22vh, 180px)',
      };
    default:
      return {
        left: '50%',
        top: '48%',
        width: 'min(58vw, 420px)',
        height: 'min(20vh, 150px)',
      };
  }
}

function getActionCaptionLayout(targetZone) {
  switch (targetZone) {
    case 'player':
      return {
        left: '50%',
        top: '67%',
      };
    case 'enemy':
      return {
        left: '69%',
        top: '27%',
      };
    default:
      return {
        left: '50%',
        top: '47%',
      };
  }
}

function getMutationAnimationInfo(mutationId, data) {
  const mutation = data?.mutations?.[mutationId];
  return {
    mutation,
    color: getMutColor(mutationId || 'A-01'),
    label: mutationId ? getMutLabel(mutationId) : '?',
    name: mutation?.name || mutationId || 'Mutation',
    lines: getMutationDetailLines(mutation),
  };
}

function MutationDiscoveryOverlay({ animation, data }) {
  const { color, label, name, lines } = getMutationAnimationInfo(animation.mutationId, data);
  const cardDef = data?.cards?.[animation.defId];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 790,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="mutation-discovery-popup"
        style={{
          width: 'min(88vw, 360px)',
          padding: '14px 16px 16px',
          borderRadius: 16,
          border: `1px solid ${color}70`,
          background: `linear-gradient(180deg, rgba(9,10,18,0.96) 0%, rgba(12,14,24,0.98) 100%)`,
          boxShadow: `0 0 30px ${color}28, 0 20px 44px rgba(0,0,0,0.55)`,
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              minWidth: 32,
              height: 32,
              padding: '0 10px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${color}24`,
              border: `1px solid ${color}60`,
              color,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </div>
          <div>
            <div style={{ fontFamily: MONO, color, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              New Mutation
            </div>
            <div style={{ fontFamily: MONO, color: C.textPrimary, fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {name}
            </div>
          </div>
        </div>

        {cardDef && (
          <div style={{ fontFamily: MONO, color: '#cbd3de', fontSize: 11, marginBottom: 8 }}>
            Applied to <span style={{ color: C.textPrimary, fontWeight: 700 }}>{cardDef.name}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {lines.slice(0, 3).map((line, index) => (
            <div key={`${animation.id}-line-${index}`} style={{ fontFamily: MONO, color: '#b9c2cf', fontSize: 11, lineHeight: 1.5 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MutationRepeatOverlay({ animation, data, cardInstances }) {
  const cardDef = data?.cards?.[animation.defId];
  const cardInstance = cardInstances?.[animation.cardInstanceId];
  const imgSrc = getCardImage(animation.defId);
  const cardColor = getCardColor(cardDef?.type);
  const { color: mutationColor, label, name } = getMutationAnimationInfo(animation.mutationId, data);

  if (!cardDef || !cardInstance) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 790,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="mutation-repeat-card"
        style={{
          position: 'relative',
          width: 'min(46vw, 188px)',
          aspectRatio: '13 / 18',
          borderRadius: 14,
          overflow: 'hidden',
          border: `2px solid ${cardColor}80`,
          backgroundColor: C.bgCard,
          boxShadow: `0 0 40px ${mutationColor}24, 0 20px 40px rgba(0,0,0,0.58)`,
        }}
      >
        <RuntimeArt
          src={imgSrc}
          alt={cardDef?.name || 'Mutation preview'}
          accent={mutationColor}
          label={cardDef?.name || 'Mutation preview'}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
          }}
          imageStyle={{
            objectFit: 'cover',
            objectPosition: 'center center',
            filter: 'saturate(1.06) brightness(0.92)',
          }}
          fallbackStyle={{
            background: `linear-gradient(145deg, ${cardColor}22 0%, ${C.bgCard} 48%, ${cardColor}0c 100%)`,
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(circle at 26% 18%, ${mutationColor}26 0%, transparent 34%),
              linear-gradient(180deg, rgba(8,10,16,0.08) 0%, rgba(8,10,16,0.24) 24%, rgba(8,10,16,0.76) 58%, rgba(8,10,16,0.94) 100%)
            `,
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 9,
            left: 9,
            width: 30,
            height: 30,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontFamily: MONO,
            backgroundColor: cardColor,
            color: '#000',
            boxShadow: `0 0 10px ${cardColor}80`,
            fontSize: 14,
          }}
        >
          {Math.max(0, (cardDef.costRAM || 0) + (cardInstance.ramCostDelta || 0))}
        </div>

        <div
          className="mutation-symbol-pop"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            minWidth: 34,
            height: 34,
            padding: '0 8px',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${mutationColor}24`,
            border: `1px solid ${mutationColor}66`,
            color: mutationColor,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.06em',
            boxShadow: `0 0 14px ${mutationColor}35`,
          }}
        >
          {label}
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            margin: 'auto 10px 10px',
            padding: '12px 10px 10px',
            borderRadius: 14,
            background: 'linear-gradient(180deg, rgba(8,10,16,0.16) 0%, rgba(8,10,16,0.74) 14%, rgba(8,10,16,0.92) 100%)',
            border: `1px solid ${cardColor}22`,
            boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: '46%',
          }}
        >
          <div style={{ fontFamily: MONO, fontWeight: 700, color: C.textPrimary, fontSize: 14, textShadow: '0 1px 10px rgba(0,0,0,0.55)' }}>
            {cardDef.name}
          </div>
          <div style={{ fontFamily: MONO, textTransform: 'uppercase', color: cardColor, fontSize: 9, letterSpacing: '0.1em' }}>
            {cardDef.type}
          </div>
          <div style={{ fontFamily: MONO, color: mutationColor, fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>
            {label} {name}
          </div>
          <div style={{ fontFamily: MONO, color: '#c0c8d3', fontSize: 9, lineHeight: 1.45 }}>
            Mutation reapplied. Symbol added before the card is filed away.
          </div>
        </div>
      </div>
    </div>
  );
}

function CombatPlayAnimationLayer({ animation, data, enemies = EMPTY_ARRAY, cardInstances = {} }) {
  if (!animation) return null;

  if (animation.kind === 'mutationPopup') {
    return <MutationDiscoveryOverlay animation={animation} data={data} />;
  }

  if (animation.kind === 'mutationRepeat') {
    return <MutationRepeatOverlay animation={animation} data={data} cardInstances={cardInstances} />;
  }

  const cardDef = data?.cards?.[animation.defId];
  const accentBase = animation.actor === 'player' ? cardDef?.type : animation.intentType;
  const meta = getPlayAnimationMeta(animation.actor, animation.intentType, accentBase);
  const accent = meta.accent;
  const imgSrc = getCardImage(animation.defId);
  const anchor = animation.actor === 'enemy'
    ? getEnemyAnimationAnchor(animation.enemyId, enemies)
    : { left: '74%', top: '74%' };
  const effectLines = cardDef?.effects ? formatEffectsLong(cardDef.effects) : [];
  const previewLine = effectLines[0] || (animation.actor === 'enemy' ? `${animation.intentType || 'Unknown'} action` : 'Executing card');
  const cost = Math.max(0, cardDef?.costRAM || 0);
  const bodyLabel = animation.actor === 'enemy'
    ? (animation.enemyName || 'Enemy protocol')
    : (cardDef?.type || 'Player');
  const cue = animation.actor === 'enemy'
    ? getEnemyActionCue(animation.intentType, accent)
    : null;
  const reactionTokens = buildAnimationEffectTokens(animation.effectSummary, animation.reactions);
  const cueZoneLayout = cue ? getActionZoneLayout(cue.targetZone) : null;
  const cueCaptionLayout = cue ? getActionCaptionLayout(cue.targetZone) : null;
  const playDuration = animation.duration || getPlayAnimationDuration(animation.actor, animation.intentType);
  const laneHeight = cue?.targetZone === 'player'
    ? '56vh'
    : cue?.targetZone === 'enemy'
      ? '18vh'
      : '34vh';
  const laneTop = cue?.targetZone === 'player'
    ? '18%'
    : cue?.targetZone === 'enemy'
      ? '12%'
      : '32%';
  const laneTilt = cue?.targetZone === 'player'
    ? '-3deg'
    : cue?.targetZone === 'enemy'
      ? '3deg'
      : '0deg';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 780,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {cue && (
        <>
          <div
            className="play-action-wash"
            style={{
              position: 'absolute',
              inset: 0,
              background: cue.wash,
              '--play-duration': `${playDuration}ms`,
            }}
          />
          <div
            className="play-action-lane"
            style={{
              position: 'absolute',
              left: cue.targetZone === 'neutral' ? '50%' : anchor.left,
              top: laneTop,
              width: cue.targetZone === 'player' ? 20 : 18,
              height: laneHeight,
              transform: `translateX(-50%) rotate(${laneTilt})`,
              transformOrigin: '50% 0%',
              borderRadius: 999,
              background: cue.lane,
              filter: `drop-shadow(0 0 16px ${accent}66)`,
              '--play-duration': `${playDuration}ms`,
            }}
          />
          <div
            className="play-action-zone"
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -50%)',
              borderRadius: 36,
              pointerEvents: 'none',
              background: cue.zone,
              border: `1px solid ${accent}38`,
              boxShadow: `0 0 26px ${accent}18`,
              '--play-duration': `${playDuration}ms`,
              ...(cueZoneLayout || EMPTY_OBJECT),
            }}
          />
          <div
            className="play-action-caption"
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -50%)',
              padding: '8px 12px',
              borderRadius: 14,
              border: `1px solid ${accent}4a`,
              background: `linear-gradient(180deg, ${accent}18 0%, rgba(6,9,15,0.92) 28%, rgba(6,9,15,0.98) 100%)`,
              boxShadow: `0 0 20px ${accent}18, 0 10px 24px rgba(0,0,0,0.34)`,
              backdropFilter: 'blur(6px)',
              pointerEvents: 'none',
              '--play-duration': `${playDuration}ms`,
              ...(cueCaptionLayout || EMPTY_OBJECT),
            }}
          >
            <div style={{ fontFamily: MONO, color: accent, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {cue.title}
            </div>
            <div style={{ fontFamily: MONO, color: '#d4dbe6', fontSize: 10, marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {cue.targetLabel}
            </div>
          </div>
        </>
      )}
      <div
        className={`play-card-overlay ${meta.className}`}
        style={{
          position: 'absolute',
          left: anchor.left,
          top: anchor.top,
          width: 'clamp(128px, 30vw, 172px)',
          minHeight: 184,
          borderRadius: 16,
          overflow: 'hidden',
          transform: 'translate(-50%, -50%)',
          border: `2px solid ${accent}88`,
          background: `linear-gradient(180deg, rgba(16,18,28,0.96) 0%, rgba(9,10,18,0.98) 100%)`,
          boxShadow: `0 0 34px ${accent}44, 0 18px 44px rgba(0,0,0,0.58)`,
          '--play-accent': accent,
          '--play-glow': `${accent}66`,
          '--play-duration': `${playDuration}ms`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, ${accent}12 0%, transparent 45%, ${accent}18 100%)`,
          }}
        />

        {animation.actor === 'player' && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              width: 28,
              height: 28,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: accent,
              color: '#000',
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 14,
              zIndex: 2,
            }}
          >
            {cost}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '4px 8px',
            borderRadius: 999,
            border: `1px solid ${meta.badgeColor}66`,
            backgroundColor: 'rgba(0,0,0,0.55)',
            color: meta.badgeColor,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          {meta.badge}
        </div>

        <div
          style={{
            height: 84,
            position: 'relative',
            overflow: 'hidden',
            borderBottom: `1px solid ${accent}30`,
            backgroundColor: `${accent}10`,
          }}
        >
          <RuntimeArt
            src={imgSrc}
            alt={cardDef?.name || 'Animated card'}
            accent={accent}
            label={cardDef?.name || 'Animated card'}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
            }}
            imageStyle={{
              objectFit: 'cover',
              objectPosition: 'top center',
              filter: animation.actor === 'enemy' ? 'saturate(0.9) brightness(0.9)' : 'none',
            }}
            fallbackStyle={{
              background: `linear-gradient(135deg, ${accent}1c 0%, ${C.bgCard} 52%, ${accent}08 100%)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, transparent 48%, rgba(9,10,18,0.94) 100%)',
            }}
          />
        </div>

        <div style={{ position: 'relative', padding: '12px 12px 14px' }}>
          <div
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              color: C.textPrimary,
              fontSize: 13,
              lineHeight: 1.25,
              marginBottom: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cardDef?.name || (animation.actor === 'enemy' ? 'Enemy action' : 'Player action')}
          </div>
          <div
            style={{
              fontFamily: MONO,
              color: accent,
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {meta.label}
          </div>
          {cue && (
            <div
              style={{
                marginBottom: 8,
                padding: '6px 8px',
                borderRadius: 10,
                border: `1px solid ${accent}28`,
                background: `linear-gradient(180deg, ${accent}12 0%, rgba(8,10,16,0.72) 100%)`,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  color: accent,
                  fontSize: 8,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {cue.title}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  color: '#cfd6e1',
                  fontSize: 9,
                  lineHeight: 1.45,
                }}
              >
                {cue.targetLabel}
              </div>
            </div>
          )}
          {reactionTokens.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {reactionTokens.map((token) => (
                <div
                  key={token.label}
                  style={{
                    padding: '4px 7px',
                    borderRadius: 999,
                    border: `1px solid ${token.color}42`,
                    background: `${token.color}16`,
                    color: token.color,
                    fontFamily: MONO,
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {token.label}
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              fontFamily: MONO,
              color: C.textSecondary,
              fontSize: 10,
              lineHeight: 1.45,
              minHeight: 28,
            }}
          >
            {previewLine}
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: `1px solid ${accent}24`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              fontFamily: MONO,
              fontSize: 9,
              color: C.textDim,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <span>{bodyLabel}</span>
            <span>{animation.actor === 'enemy' ? (animation.intentType || 'Unknown') : 'Play'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RAM BAR (large labeled pips)
// ============================================================
function RamBar({ ram, maxRam, compact = false, showLabel = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '5px' : '6px' }}>
      {showLabel && (
        <span style={{
          fontSize: compact ? 9 : 11,
          color: C.neonCyan,
          fontWeight: 700,
          fontFamily: MONO,
          letterSpacing: '0.08em',
          textShadow: `0 0 8px ${C.neonCyan}40`,
        }}>
          RAM
        </span>
      )}
      <div style={{ flex: 1, display: 'flex', gap: compact ? '2px' : '3px', alignItems: 'center' }}>
        {Array.from({ length: maxRam }).map((_, i) => {
          const filled = i < ram;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: compact ? 12 : 18,
                maxWidth: compact ? 24 : 32,
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
                fontSize: compact ? 6 : 7,
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
        fontSize: compact ? 10 : 12,
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
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useDialogAccessibility(true, {
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
  });

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
        ref={dialogRef}
        className="safe-area-bottom animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pile-viewer-title"
        tabIndex={-1}
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
          <h3 id="pile-viewer-title" style={{ fontFamily: MONO, fontWeight: 700, color: C.textPrimary, fontSize: 16 }}>
            {title}
            <span style={{ marginLeft: '8px', fontWeight: 400, color: C.textDim }}>({cards.length})</span>
          </h3>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={`Close ${title}`}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: C.bgCard,
              color: C.textSecondary,
              border: `1px solid ${C.borderLight}`,
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
              const { countdownValue: visibleCountdown, isDecaying, core: isCore } = getCardLifecycleDisplay(def, ci);
              const isBricked  = ci?.finalMutationId === 'J_BRICK';
              const isRewrite  = ci?.finalMutationId === 'J_REWRITE';
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
                  {(muts > 0 || visibleCountdown != null) && (
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
                      {visibleCountdown != null && !ci?.finalMutationId && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          fontFamily: MONO,
                          fontSize: isCore ? 6 : 7,
                          fontWeight: 700,
                          backgroundColor: isCore ? `${C.neonCyan}18` : (isDecaying ? `${C.neonOrange}25` : 'transparent'),
                          color: isCore ? C.neonCyan : (isDecaying ? C.neonOrange : C.textDim),
                          border: isCore ? `1px solid ${C.neonCyan}38` : (isDecaying ? `1px solid ${C.neonOrange}40` : `1px solid ${C.border}`),
                          boxShadow: isCore ? `0 0 6px ${C.neonCyan}22` : (isDecaying ? `0 0 6px ${C.neonOrange}40` : 'none'),
                          marginLeft: 'auto',
                        }}>
                          ⏱{visibleCountdown}
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
// ARC HAND — semi-circle fan of cards at the bottom
// ============================================================
function ArcHand({
  hand,
  cardInstances,
  data,
  activeCardId,
  onFocusCard,
  canPlayCard,
  locked = false,
  aiPaused,
  onHover,
  layoutMode = 'desktop',
}) {
  const n = hand.length;
  const containerRef = useRef(null);
  const cardRefs = useRef(new Map());
  const scrollFrameRef = useRef(null);
  const scrollIdleRef = useRef(null);
  const autoSnapRef = useRef(false);
  const autoSnapReleaseRef = useRef(null);
  const isPhonePortrait = layoutMode === 'phone-portrait';
  const isPhoneLandscape = layoutMode === 'phone-landscape';
  const CARD_W = isPhonePortrait ? 62 : isPhoneLandscape ? 72 : 78;
  const CARD_H = isPhonePortrait ? 90 : isPhoneLandscape ? 100 : 108;
  const CARD_STEP = isPhonePortrait ? 34 : isPhoneLandscape ? 40 : 44;
  const MAX_DROP = isPhonePortrait ? 16 : isPhoneLandscape ? 28 : 34;
  const MAX_ANGLE = isPhonePortrait ? 12 : isPhoneLandscape ? 18 : 20;
  const SLOT_H = CARD_H + MAX_DROP + 28;
  const visualCenterIndex = Math.max(0, hand.indexOf(activeCardId));
  const handWidth = isPhonePortrait
    ? '100%'
    : isPhoneLandscape
      ? 'min(56vw, 360px)'
      : 'min(60vw, 320px)';
  const handMaxWidth = isPhonePortrait ? 'none' : (isPhoneLandscape ? 360 : 320);
  const handMinWidth = isPhonePortrait ? 0 : 180;
  const handMarginLeft = isPhonePortrait ? 0 : 'auto';

  const setCardRef = useCallback((cid, node) => {
    if (node) cardRefs.current.set(cid, node);
    else cardRefs.current.delete(cid);
  }, []);

  const clearScrollIdle = useCallback(() => {
    if (scrollIdleRef.current != null) {
      window.clearTimeout(scrollIdleRef.current);
      scrollIdleRef.current = null;
    }
  }, []);

  const clearAutoSnapRelease = useCallback(() => {
    if (autoSnapReleaseRef.current != null) {
      window.clearTimeout(autoSnapReleaseRef.current);
      autoSnapReleaseRef.current = null;
    }
  }, []);

  const getNearestCardId = useCallback(() => {
    const container = containerRef.current;
    if (!container || hand.length === 0) return null;

    const centerX = container.scrollLeft + (container.clientWidth / 2);
    let nextCardId = hand[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cid of hand) {
      const cardNode = cardRefs.current.get(cid);
      if (!cardNode) continue;
      const cardCenterX = cardNode.offsetLeft + (cardNode.offsetWidth / 2);
      const distance = Math.abs(cardCenterX - centerX);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextCardId = cid;
      }
    }

    return nextCardId;
  }, [hand]);

  const syncFocusedCard = useCallback(() => {
    const nextCardId = getNearestCardId();
    if (nextCardId && nextCardId !== activeCardId) {
      onFocusCard(nextCardId);
    }
    return nextCardId;
  }, [activeCardId, getNearestCardId, onFocusCard]);

  const centerCard = useCallback((cid, behavior = 'smooth') => {
    const container = containerRef.current;
    const cardNode = cardRefs.current.get(cid);
    if (!container || !cardNode) return;

    const targetLeft = cardNode.offsetLeft - ((container.clientWidth - cardNode.offsetWidth) / 2);
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);

    container.scrollTo({
      left: Math.max(0, Math.min(targetLeft, maxScrollLeft)),
      behavior,
    });
  }, []);

  const settleFocusedCard = useCallback(() => {
    if (autoSnapRef.current) return;
    const nextCardId = syncFocusedCard();
    if (!nextCardId) return;
    autoSnapRef.current = true;
    centerCard(nextCardId, 'smooth');
    clearAutoSnapRelease();
    autoSnapReleaseRef.current = window.setTimeout(() => {
      autoSnapRef.current = false;
      autoSnapReleaseRef.current = null;
    }, 260);
  }, [centerCard, clearAutoSnapRelease, syncFocusedCard]);

  useEffect(() => {
    if (n === 0) return undefined;
    const rafId = requestAnimationFrame(() => syncFocusedCard());
    return () => cancelAnimationFrame(rafId);
  }, [n, syncFocusedCard]);

  useEffect(() => {
    return () => {
      clearScrollIdle();
      clearAutoSnapRelease();
      if (scrollFrameRef.current != null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [clearAutoSnapRelease, clearScrollIdle]);

  if (n === 0) {
    return (
      <div
        style={{
          width: handWidth,
          minWidth: handMinWidth,
          height: isPhonePortrait ? 84 : 92,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          marginLeft: handMarginLeft,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>— no cards —</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'visible',
        width: handWidth,
        maxWidth: handMaxWidth,
        minWidth: handMinWidth,
        marginLeft: handMarginLeft,
        pointerEvents: locked ? 'none' : 'auto',
        opacity: locked ? 0.82 : 1,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: isPhonePortrait ? 12 : 18,
          transform: 'translateX(-50%)',
          width: CARD_W + (isPhonePortrait ? 18 : 26),
          height: CARD_H + 10,
          borderRadius: 18,
          border: `1px solid ${C.neonCyan}20`,
          background: `linear-gradient(180deg, ${C.neonCyan}10 0%, transparent 72%)`,
          boxShadow: `0 0 28px ${C.neonCyan}12`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 6,
          bottom: 8,
          width: isPhonePortrait ? '88%' : '82%',
          height: CARD_H + (isPhonePortrait ? 18 : 24),
          borderRadius: '999px 999px 24px 24px',
          background: `radial-gradient(circle at 72% 100%, ${C.neonCyan}12 0%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        ref={containerRef}
        data-hand-scroll="true"
        onPointerDown={() => {
          autoSnapRef.current = false;
          clearAutoSnapRelease();
          clearScrollIdle();
        }}
        onScroll={() => {
          if (scrollFrameRef.current != null) return;
          scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            syncFocusedCard();
          });
          clearScrollIdle();
          if (!autoSnapRef.current) {
            scrollIdleRef.current = window.setTimeout(() => {
              settleFocusedCard();
            }, 150);
          }
        }}
        style={{
          height: SLOT_H,
          overflowX: 'auto',
          overflowY: 'visible',
          display: 'flex',
          alignItems: 'flex-start',
          paddingTop: isPhonePortrait ? 8 : 14,
          paddingBottom: isPhonePortrait ? 6 : 12,
          paddingInline: `calc(50% - ${CARD_W / 2}px)`,
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: `calc(50% - ${CARD_W / 2}px)`,
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          touchAction: 'pan-x',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          position: 'relative',
          zIndex: 1,
          maskImage: isPhonePortrait ? 'linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%)' : undefined,
        }}
      >
        {hand.map((cid, idx) => {
          const ci  = cardInstances[cid];
          const def = data?.cards?.[ci?.defId];
          const isActive = activeCardId === cid;
          const offset = idx - visualCenterIndex;
          const absOffset = Math.abs(offset);
          const angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, offset * 7));
          const yDrop = isActive ? 0 : Math.min(MAX_DROP, 8 + absOffset * absOffset * 4);
          const scale = isActive ? 1.02 : Math.max(0.84, 0.98 - absOffset * 0.05);
          const opacity = Math.max(0.52, 1 - absOffset * 0.12);
          const zIdx = isActive ? 100 : Math.max(10, 90 - absOffset);

          return (
            <div
              key={cid}
              ref={(node) => setCardRef(cid, node)}
              data-hand-card={cid}
              data-active={isActive ? 'true' : 'false'}
              style={{
                flex: `0 0 ${CARD_STEP}px`,
                width: CARD_STEP,
                height: SLOT_H,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                overflow: 'visible',
                scrollSnapAlign: 'center',
                scrollSnapStop: 'always',
                transformOrigin: '70% 100%',
                transform: `translateY(${yDrop}px) rotate(${angle}deg) scale(${scale})`,
                opacity,
                zIndex: zIdx,
                transition: 'transform 0.14s ease-out, opacity 0.14s ease-out',
                willChange: 'transform',
              }}
            >
              <HandCard
                cardInstance={ci}
                cardDef={def}
                isSelected={isActive}
                canPlay={canPlayCard(cid)}
                onSelect={() => {
                  onFocusCard(cid);
                  if (!isActive) centerCard(cid, 'auto');
                }}
                compact={true}
                showTooltip={aiPaused}
                onHover={onHover}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMBAT SCREEN
// ============================================================
export default function CombatScreen({ state, data, onAction, aiPaused = false, onOpenMenu, tutorialStep = null }) {
  const {
    enabled: playtestEnabled,
    sessionId: playtestSessionId,
    pendingCount: playtestPendingCount,
    lastSyncAt: playtestLastSyncAt,
    lastError: playtestLastError,
    record: recordPlaytest,
    flush: flushPlaytest,
  } = usePlaytestRecorder({ screen: 'combat' });
  const [activeCardId, setActiveCardId] = useState(null);
  const [centerCardDismissed, setCenterCardDismissed] = useState(false);
  const [viewingPile, setViewingPile] = useState(null);
  const [deckMenuOpen, setDeckMenuOpen] = useState(false);
  const [targetedEnemyIndex, setTargetedEnemyIndex] = useState(0);
  const [selectedTargetMode, setSelectedTargetMode] = useState('enemy');
  const [armedTarget, setArmedTarget] = useState({ kind: null, id: null });
  const [enemyInfoOpen, setEnemyInfoOpen] = useState(false);
  const [displayCombatState, setDisplayCombatState] = useState(null);
  const [animationQueue, setAnimationQueue] = useState([]);
  const [activeAnimation, setActiveAnimation] = useState(null);
  const [endTurnPending, setEndTurnPending] = useState(false);
  const [tooltip, setTooltip] = useState({ cardDef: null, x: 0, y: 0 });
  const [scryDiscard, setScryDiscard] = useState(new Set());
  const [floats, setFloats] = useState([]);
  const [enemyImpactMap, setEnemyImpactMap] = useState(EMPTY_OBJECT);
  const [playerImpact, setPlayerImpact] = useState(null);
  const [combatFlash, setCombatFlash] = useState(null);
  const lastLogLenRef = useRef(0);
  const floatIdRef = useRef(0);
  const playAnimationIdRef = useRef(0);
  const floatTimeoutsRef = useRef({});
  const prevHandRef = useRef([]);
  const logInitRef = useRef(false);
  const waitingForEndTurnLogsRef = useRef(false);
  const prevHeatAlertRef = useRef(null);
  const enemyImpactTimeoutsRef = useRef({});
  const playerImpactTimeoutRef = useRef(null);
  const combatFlashTimeoutRef = useRef(null);
  const armedTargetTimeoutRef = useRef(null);
  const enemyDialogRef = useRef(null);
  const enemyDialogCloseRef = useRef(null);
  const scryDialogRef = useRef(null);
  const scryConfirmRef = useRef(null);
  const screenRef = useRef(null);
  const portraitDeckMenuRef = useRef(null);
  const portraitPileAnchorRef = useRef(null);
  const tapTargetRef = useRef({ kind: null, id: null, timestamp: 0 });
  const playtestReadyRef = useRef(null);
  const playtestActiveCardRef = useRef(null);
  const playtestInfoRef = useRef(null);
  const playtestPileRef = useRef(null);
  const latestCombatSnapshotRef = useRef(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined'
      ? Math.round(window.visualViewport?.height || window.innerHeight)
      : 720,
  }));

  const triggerEnemyImpact = useCallback((enemyId, type = 'damage') => {
    if (!enemyId) return;
    const token = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setEnemyImpactMap((prev) => ({ ...prev, [enemyId]: { type, token } }));
    if (enemyImpactTimeoutsRef.current[enemyId]) {
      clearTimeout(enemyImpactTimeoutsRef.current[enemyId]);
    }
    enemyImpactTimeoutsRef.current[enemyId] = setTimeout(() => {
      setEnemyImpactMap((prev) => {
        if (!prev[enemyId]) return prev;
        const next = { ...prev };
        delete next[enemyId];
        return next;
      });
      delete enemyImpactTimeoutsRef.current[enemyId];
    }, type === 'defeat' ? 620 : type === 'heal' || type === 'status' ? 460 : 360);
  }, []);

  const triggerPlayerImpact = useCallback((type = 'damage') => {
    const token = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPlayerImpact({ type, token });
    if (playerImpactTimeoutRef.current) clearTimeout(playerImpactTimeoutRef.current);
    playerImpactTimeoutRef.current = setTimeout(() => {
      setPlayerImpact(null);
      playerImpactTimeoutRef.current = null;
    }, type === 'heal' || type === 'status' ? 520 : 420);
  }, []);

  const triggerCombatFlash = useCallback((type = 'damage', zone = 'enemy') => {
    const rgba =
      type === 'heal' ? 'rgba(0, 255, 107, 0.18)'
      : type === 'status' ? 'rgba(180, 74, 255, 0.18)'
      : type === 'shield' ? 'rgba(0, 240, 255, 0.16)'
      : type === 'defeat' ? 'rgba(255, 107, 0, 0.18)'
      : 'rgba(255, 68, 51, 0.18)';
    const token = `${type}-${zone}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCombatFlash({ type, zone, rgba, token });
    if (combatFlashTimeoutRef.current) clearTimeout(combatFlashTimeoutRef.current);
    combatFlashTimeoutRef.current = setTimeout(() => {
      setCombatFlash(null);
      combatFlashTimeoutRef.current = null;
    }, 320);
  }, []);

  const queueCombatFloat = useCallback((float) => {
    if (!float) return;
    const nextFloat = float.id ? float : { ...float, id: ++floatIdRef.current };
    setFloats((prev) => [...prev.slice(-11), nextFloat]);
    const timeoutId = setTimeout(() => {
      setFloats((prev) => prev.filter((entry) => entry.id !== nextFloat.id));
      delete floatTimeoutsRef.current[nextFloat.id];
    }, 1400);
    floatTimeoutsRef.current[nextFloat.id] = timeoutId;
  }, []);

  const emitCombatReaction = useCallback((reaction) => {
    if (!reaction) return;

    if (reaction.sound === 'damage') sfx.damage();
    else if (reaction.sound === 'block') sfx.block();
    else if (reaction.sound === 'heal') sfx.heal();
    else if (reaction.sound === 'status') sfx.status();

    if (reaction.zone === 'player') {
      triggerPlayerImpact(reaction.impactType || 'damage');
      triggerCombatFlash(reaction.impactType || 'damage', 'player');
    } else if (reaction.targetId) {
      triggerEnemyImpact(reaction.targetId, reaction.impactType || 'damage');
      triggerCombatFlash(reaction.impactType || 'damage', 'enemy');
    }

    if (reaction.float) {
      queueCombatFloat(reaction.float);
    }
  }, [queueCombatFloat, triggerCombatFlash, triggerEnemyImpact, triggerPlayerImpact]);

  const combat = state?.combat;
  const globalLog = state?.log ?? EMPTY_ARRAY;
  const player = combat?.player;
  const enemies = combat?.enemies ?? EMPTY_ARRAY;
  const visibleEnemies = enemies.filter((enemy) => enemy.hp > 0);
  const cardInstances = combat?.cardInstances || EMPTY_OBJECT;
  const hand = player?.piles?.hand ?? EMPTY_ARRAY;
  const drawPile = player?.piles?.draw ?? EMPTY_ARRAY;
  const discardPile = player?.piles?.discard ?? EMPTY_ARRAY;
  const exhaustPile = player?.piles?.exhaust ?? EMPTY_ARRAY;
  const powerPile = player?.piles?.power ?? EMPTY_ARRAY;
  const ram = player?.ram ?? 0;
  const maxRam = player?.maxRAM ?? 0;
  const heat = combat?.heat ?? 0;
  const maxHeat = combat?.maxHeat ?? 20;
  const arenaModifier = combat?.arenaModifier ?? null;
  const displayPlayer = displayCombatState?.player ?? player;
  const displayEnemies = displayCombatState?.enemies ?? enemies;
  const displayVisibleEnemies = displayEnemies.filter((enemy) => enemy.hp > 0);
  const displayRam = displayCombatState?.ram ?? ram;
  const displayMaxRam = displayCombatState?.maxRam ?? maxRam;
  const displayHeat = displayCombatState?.heat ?? heat;
  const displayMaxHeat = displayCombatState?.maxHeat ?? maxHeat;
  const hasQueuedAnimations = Boolean(activeAnimation) || animationQueue.length > 0;
  const interactionLocked = endTurnPending || hasQueuedAnimations;
  const layoutMode = viewport.width <= 820
    ? (viewport.height >= viewport.width ? 'phone-portrait' : 'phone-landscape')
    : 'desktop';
  const isPhoneLayout = layoutMode !== 'desktop';
  const isPhonePortrait = layoutMode === 'phone-portrait';
  const isPhoneLandscape = layoutMode === 'phone-landscape';
  const tutorialActive = Boolean(state?.run?.tutorial?.active);
  const combatTutorialFocus = getCombatTutorialFocus(tutorialStep);
  const tallDesktopLayout = !isPhoneLayout && viewport.height >= 1200;
  const compactTutorialPortrait = tutorialActive && isPhonePortrait;
  const landscapeFocusWidth = viewport.width < 720 ? 156 : 168;
  const landscapeSidebarWidth = viewport.width < 720 ? 224 : 244;
  const desktopEnemyZoneMinHeight = tallDesktopLayout
    ? 'clamp(196px, 23vh, 248px)'
    : 'clamp(216px, 27vh, 294px)';
  const desktopEnemyZonePadding = tallDesktopLayout ? '12px 10px 8px' : '14px 10px 10px';
  const desktopCenterZonePadding = tallDesktopLayout ? '6px 8px 16px' : '10px 8px 8px';
  const desktopCenterCardBottomPad = tallDesktopLayout ? 12 : 0;

  const activeInstance = activeCardId ? cardInstances[activeCardId] : null;
  const activeDef = activeInstance ? data?.cards?.[activeInstance.defId] : null;
  const targetedEnemy = visibleEnemies[targetedEnemyIndex] ?? visibleEnemies[0] ?? null;
  const targetedEnemyId = targetedEnemy?.id ?? null;
  const displayTargetedEnemy = (targetedEnemyId
    ? displayVisibleEnemies.find((enemy) => enemy.id === targetedEnemyId)
    : null) ?? displayVisibleEnemies[targetedEnemyIndex] ?? displayVisibleEnemies[0] ?? null;
  const targetedIntentCardDef = displayTargetedEnemy ? data?.cards?.[displayTargetedEnemy.intent?.cardDefId] : null;
  const targetedIntentBadges = displayTargetedEnemy ? getIntentEffectBadges(displayTargetedEnemy, targetedIntentCardDef) : EMPTY_ARRAY;
  const mutatedHandCount = hand.filter((cardId) => (cardInstances[cardId]?.appliedMutations?.length || 0) > 0).length;
  const targetedBossReadout = displayTargetedEnemy
    ? getBossDirectiveReadout(displayTargetedEnemy, {
      aliveAllies: displayVisibleEnemies.filter((enemy) => enemy.id !== displayTargetedEnemy.id).length,
      mutatedHandCount,
      cardsPlayedThisTurn: combat?._cardsPlayedThisTurn || 0,
    })
    : null;
  const activeTargetingProfile = activeCardId
    ? getCardTargetingProfile(state.combat, data, activeCardId)
    : { canTargetEnemy: false, canTargetSelf: false, targetHints: EMPTY_ARRAY };
  const defaultEnemyTargetId = targetedEnemy?.id ?? visibleEnemies[0]?.id ?? enemies.find((enemy) => enemy.hp > 0)?.id ?? null;
  const selectedEnemyId = targetedEnemy?.id ?? defaultEnemyTargetId;
  const canCastActiveOnSelf = Boolean(
    activeCardId
    && activeTargetingProfile.canTargetSelf
    && getCardPlayability(state.combat, data, activeCardId, defaultEnemyTargetId, true).playable,
  );
  const canCastActiveOnEnemy = Boolean(
    activeCardId
    && activeTargetingProfile.canTargetEnemy
    && getCardPlayability(state.combat, data, activeCardId, defaultEnemyTargetId, false).playable,
  );
  const canCastActiveOnAnyEnemy = Boolean(
    activeCardId
    && activeTargetingProfile.canTargetEnemy
    && visibleEnemies.some((enemy) => getCardPlayability(state.combat, data, activeCardId, enemy.id, false).playable),
  );
  const buildCombatSnapshot = useCallback(() => ({
    layoutMode,
    viewport,
    activeCard: activeCardId
      ? {
          id: activeCardId,
          name: activeDef?.name ?? activeCardId,
        }
      : null,
    selectedTargetMode,
    armedTarget,
    deckMenuOpen,
    viewingPile,
    enemyInfoOpen,
    canCastActiveOnSelf,
    canCastActiveOnEnemy: canCastActiveOnAnyEnemy,
    player: {
      hp: player?.hp ?? 0,
      maxHP: player?.maxHP ?? 0,
      firewall: player?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0,
      ram,
      maxRam,
      heat,
      maxHeat,
    },
    arenaModifier: arenaModifier?.label ?? null,
    target: targetedEnemy
      ? {
          id: targetedEnemy.id,
          name: targetedEnemy.name ?? 'Unknown Target',
          hp: targetedEnemy.hp,
          maxHP: targetedEnemy.maxHP,
        }
      : null,
    hand: hand.slice(0, 8).map((cardId) => {
      const instance = cardInstances[cardId];
      const def = instance ? data?.cards?.[instance.defId] : null;
      return {
        id: cardId,
        name: def?.name ?? cardId,
      };
    }),
    enemies: visibleEnemies.map((enemy) => ({
      id: enemy.id,
      name: enemy.name ?? 'Unknown Target',
      hp: enemy.hp,
      maxHP: enemy.maxHP,
      firewall: enemy?.statuses?.find((status) => status.id === 'Firewall')?.stacks ?? 0,
      intent: enemy.intent?.type ?? null,
    })),
    recentLog: globalLog.slice(-6).map((entry) => ({
      t: entry.t,
      msg: entry.msg,
    })),
  }), [
    activeCardId,
    activeDef?.name,
    armedTarget,
    canCastActiveOnAnyEnemy,
    canCastActiveOnSelf,
    cardInstances,
    data,
    deckMenuOpen,
    enemyInfoOpen,
    globalLog,
    hand,
    layoutMode,
    maxRam,
    player,
    ram,
    selectedTargetMode,
    targetedEnemy,
    viewingPile,
    viewport,
    visibleEnemies,
  ]);
  latestCombatSnapshotRef.current = buildCombatSnapshot();
  const playtestReadySignature = `${state?.mode || 'unknown'}|${state?.run?.floor ?? state?.run?.floorIndex ?? 'na'}|${visibleEnemies.map((enemy) => enemy.id).join(',')}`;

  useDialogAccessibility(enemyInfoOpen && !!displayTargetedEnemy, {
    containerRef: enemyDialogRef,
    initialFocusRef: enemyDialogCloseRef,
    onClose: () => setEnemyInfoOpen(false),
  });

  useDialogAccessibility(Boolean(combat?._scryPending), {
    containerRef: scryDialogRef,
    initialFocusRef: scryConfirmRef,
  });

  useEffect(() => {
    if (!playtestEnabled || !combat) return;
    if (playtestReadyRef.current === playtestReadySignature) return;
    playtestReadyRef.current = playtestReadySignature;
    recordPlaytest('combat_screen_ready', {
      snapshot: latestCombatSnapshotRef.current,
    });
  }, [combat, playtestEnabled, playtestReadySignature, recordPlaytest]);

  useEffect(() => {
    if (!playtestEnabled || !activeCardId) {
      playtestActiveCardRef.current = activeCardId ?? null;
      return;
    }
    if (playtestActiveCardRef.current === activeCardId) return;
    playtestActiveCardRef.current = activeCardId;
    recordPlaytest('active_card_selected', {
      cardId: activeCardId,
      cardName: activeDef?.name ?? activeCardId,
      snapshot: latestCombatSnapshotRef.current,
    });
  }, [activeCardId, activeDef?.name, playtestEnabled, recordPlaytest]);

  useEffect(() => {
    if (!playtestEnabled || !enemyInfoOpen || !displayTargetedEnemy) {
      playtestInfoRef.current = null;
      return;
    }
    const signature = `${displayTargetedEnemy.id}:${activeCardId ?? 'none'}`;
    if (playtestInfoRef.current === signature) return;
    playtestInfoRef.current = signature;
    recordPlaytest('enemy_info_opened', {
      enemyId: displayTargetedEnemy.id,
      enemyName: displayTargetedEnemy.name ?? 'Unknown Target',
      snapshot: latestCombatSnapshotRef.current,
    });
  }, [activeCardId, displayTargetedEnemy, enemyInfoOpen, playtestEnabled, recordPlaytest]);

  useEffect(() => {
    if (!playtestEnabled || !viewingPile) {
      playtestPileRef.current = null;
      return;
    }
    if (playtestPileRef.current === viewingPile) return;
    playtestPileRef.current = viewingPile;
    recordPlaytest('pile_view_opened', {
      pile: viewingPile,
      snapshot: latestCombatSnapshotRef.current,
    });
  }, [playtestEnabled, recordPlaytest, viewingPile]);

  useEffect(() => {
    if (!playtestEnabled || !combat?.combatOver) return;
    recordPlaytest('combat_finished', {
      victory: Boolean(combat?.victory),
      snapshot: latestCombatSnapshotRef.current,
    });
    void flushPlaytest('combat_finished');
  }, [combat?.combatOver, combat?.victory, playtestEnabled, recordPlaytest, flushPlaytest]);

  const scrollPortraitAnchorIntoView = useCallback((targetRef, block = 'end') => {
    if (!isPhonePortrait) return;
    const behavior = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    const runScroll = () => {
      const target = targetRef?.current;
      if (target?.scrollIntoView) {
        target.scrollIntoView({ behavior, block, inline: 'nearest' });
        return;
      }
      const container = screenRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior });
      }
    };
    if (typeof window === 'undefined') {
      runScroll();
      return;
    }
    window.requestAnimationFrame(runScroll);
  }, [isPhonePortrait]);

  const clearArmedTarget = useCallback(() => {
    if (armedTargetTimeoutRef.current) {
      clearTimeout(armedTargetTimeoutRef.current);
      armedTargetTimeoutRef.current = null;
    }
    setArmedTarget({ kind: null, id: null });
  }, []);

  const clearTapTarget = useCallback(() => {
    tapTargetRef.current = { kind: null, id: null, timestamp: 0 };
    clearArmedTarget();
  }, [clearArmedTarget]);

  const primeTapTarget = useCallback((kind, id, showArmed = false, timestamp = Date.now()) => {
    tapTargetRef.current = { kind, id, timestamp };
    clearArmedTarget();
    if (!showArmed || !kind || !id) return;
    setArmedTarget({ kind, id });
    armedTargetTimeoutRef.current = setTimeout(() => {
      setArmedTarget({ kind: null, id: null });
      armedTargetTimeoutRef.current = null;
    }, DOUBLE_TAP_WINDOW_MS);
  }, [clearArmedTarget]);

  const getPlayabilityForTarget = useCallback((cardId, targetMode = 'enemy', enemyId = defaultEnemyTargetId) => {
    if (!cardId || !state?.combat || !data) {
      return { playable: false, reason: 'missing_card' };
    }
    return getCardPlayability(
      state.combat,
      data,
      cardId,
      enemyId ?? defaultEnemyTargetId,
      targetMode === 'self',
    );
  }, [data, defaultEnemyTargetId, state?.combat]);

  const canPlayCard = useCallback((cardId) => {
    if (!cardId || !state?.combat || !data) return false;
    const profile = getCardTargetingProfile(state.combat, data, cardId);
    if (profile.canTargetEnemy && getPlayabilityForTarget(cardId, 'enemy').playable) return true;
    if (profile.canTargetSelf && getPlayabilityForTarget(cardId, 'self').playable) return true;
    return !profile.canTargetEnemy && !profile.canTargetSelf
      ? getPlayabilityForTarget(cardId, 'enemy').playable
      : false;
  }, [data, getPlayabilityForTarget, state?.combat]);

  const getPreferredTargetMode = useCallback((cardId) => {
    if (!cardId || !state?.combat || !data) return 'enemy';
    const profile = getCardTargetingProfile(state.combat, data, cardId);
    const preferred = profile.preferredTargetMode === 'self' ? 'self' : 'enemy';
    const fallback = preferred === 'self' ? 'enemy' : 'self';
    const preferredPlayable = getPlayabilityForTarget(cardId, preferred).playable;
    const fallbackPlayable = getPlayabilityForTarget(cardId, fallback).playable;
    if (preferredPlayable || !fallbackPlayable) return preferred;
    return fallback;
  }, [data, getPlayabilityForTarget, state?.combat]);

  const playCardToTarget = useCallback((cardId = activeCardId, targetMode = 'enemy', enemyId = defaultEnemyTargetId) => {
    const playability = getPlayabilityForTarget(cardId, targetMode, enemyId);
    if (interactionLocked || !cardId || !playability.playable) return false;
    recordPlaytest('card_play_dispatched', {
      cardId,
      cardName: (() => {
        const instance = cardInstances[cardId];
        const def = instance ? data?.cards?.[instance.defId] : null;
        return def?.name ?? cardId;
      })(),
      targetMode,
      targetEnemyId: enemyId ?? null,
      snapshot: buildCombatSnapshot(),
    });
    sfx.unlock();
    sfx.cardPlay();
    onAction?.({
      type: 'Combat_PlayCard',
      cardInstanceId: cardId,
      targetEnemyId: enemyId ?? null,
      targetSelf: targetMode === 'self',
    });
    clearTapTarget();
    setSelectedTargetMode(targetMode === 'self' ? 'self' : 'enemy');
    return true;
  }, [activeCardId, buildCombatSnapshot, cardInstances, clearTapTarget, data, defaultEnemyTargetId, getPlayabilityForTarget, interactionLocked, onAction, recordPlaytest]);

  const focusActiveCard = useCallback((cardId) => {
    clearTapTarget();
    if (enemyInfoOpen) setEnemyInfoOpen(false);
    setCenterCardDismissed(false);
    if (cardId && cardId !== activeCardId) {
      setSelectedTargetMode(getPreferredTargetMode(cardId));
    }
    setActiveCardId(cardId);
  }, [activeCardId, clearTapTarget, enemyInfoOpen, getPreferredTargetMode]);

  const handleEnemyTap = useCallback((enemy, enemyIndex) => {
    if (!enemy || interactionLocked) return;
    const now = Date.now();
    const sameTarget = tapTargetRef.current.kind === 'enemy' && tapTargetRef.current.id === enemy.id;
    const withinDoubleTap = sameTarget && (now - tapTargetRef.current.timestamp) <= DOUBLE_TAP_WINDOW_MS;
    const canUseOnEnemy = Boolean(
      activeCardId
      && activeTargetingProfile.canTargetEnemy
      && getPlayabilityForTarget(activeCardId, 'enemy', enemy.id).playable
    );

    setTargetedEnemyIndex(enemyIndex);
    setSelectedTargetMode('enemy');
    if (enemyInfoOpen) setEnemyInfoOpen(false);
    if (!sameTarget || activeCardId) {
      sfx.targetLock();
    }

    if (sameTarget) {
      if (canUseOnEnemy && withinDoubleTap) {
        recordPlaytest('enemy_double_tap_cast', {
          enemyId: enemy.id,
          enemyName: enemy.name ?? 'Unknown Target',
          snapshot: buildCombatSnapshot(),
        });
        playCardToTarget(activeCardId, 'enemy', enemy.id);
        return;
      }
      if (!canUseOnEnemy || !withinDoubleTap) {
        primeTapTarget('enemy', enemy.id, false, now);
        recordPlaytest('enemy_slow_second_tap', {
          enemyId: enemy.id,
          enemyName: enemy.name ?? 'Unknown Target',
          playable: canUseOnEnemy,
          openedInfo: true,
          snapshot: buildCombatSnapshot(),
        });
        setEnemyInfoOpen(true);
        clearArmedTarget();
        return;
      }
    }

    recordPlaytest(canUseOnEnemy ? 'enemy_target_armed' : 'enemy_target_tapped', {
      enemyId: enemy.id,
      enemyName: enemy.name ?? 'Unknown Target',
      playable: canUseOnEnemy,
      snapshot: buildCombatSnapshot(),
    });
    primeTapTarget('enemy', enemy.id, canUseOnEnemy, now);
  }, [
    activeCardId,
    activeTargetingProfile.canTargetEnemy,
    buildCombatSnapshot,
    clearArmedTarget,
    enemyInfoOpen,
    getPlayabilityForTarget,
    interactionLocked,
    playCardToTarget,
    primeTapTarget,
    recordPlaytest,
  ]);

  const handlePlayerTargetTap = useCallback(() => {
    if (interactionLocked || !activeCardId || !activeTargetingProfile.canTargetSelf) return;

    const now = Date.now();
    const sameTarget = tapTargetRef.current.kind === 'self' && tapTargetRef.current.id === PLAYER_TARGET_ID;
    const withinDoubleTap = sameTarget && (now - tapTargetRef.current.timestamp) <= DOUBLE_TAP_WINDOW_MS;
    const canUseOnSelf = getPlayabilityForTarget(activeCardId, 'self', defaultEnemyTargetId).playable;

    setSelectedTargetMode('self');
    sfx.targetLock();

    if (sameTarget && canUseOnSelf && withinDoubleTap) {
      recordPlaytest('self_double_tap_cast', {
        snapshot: buildCombatSnapshot(),
      });
      playCardToTarget(activeCardId, 'self', defaultEnemyTargetId);
      return;
    }

    recordPlaytest(canUseOnSelf ? 'self_target_armed' : 'self_target_tapped', {
      playable: canUseOnSelf,
      snapshot: buildCombatSnapshot(),
    });
    primeTapTarget('self', PLAYER_TARGET_ID, canUseOnSelf, now);
  }, [
    activeCardId,
    activeTargetingProfile.canTargetSelf,
    buildCombatSnapshot,
    defaultEnemyTargetId,
    getPlayabilityForTarget,
    interactionLocked,
    playCardToTarget,
    primeTapTarget,
    recordPlaytest,
  ]);

  const handleCenterCardSwipeCast = useCallback((targetMode) => {
    if (!activeCardId || interactionLocked) return false;
    if (targetMode === 'self') {
      return playCardToTarget(activeCardId, 'self', defaultEnemyTargetId);
    }
    return playCardToTarget(activeCardId, 'enemy', selectedEnemyId);
  }, [activeCardId, defaultEnemyTargetId, interactionLocked, playCardToTarget, selectedEnemyId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: Math.round(window.visualViewport?.height || window.innerHeight),
      });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);

    return () => {
      window.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('resize', syncViewport);
    };
  }, []);

  useEffect(() => () => {
    Object.values(floatTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
    Object.values(enemyImpactTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
    if (playerImpactTimeoutRef.current) clearTimeout(playerImpactTimeoutRef.current);
    if (combatFlashTimeoutRef.current) clearTimeout(combatFlashTimeoutRef.current);
    if (armedTargetTimeoutRef.current) clearTimeout(armedTargetTimeoutRef.current);
  }, []);

  useEffect(() => {
    clearTapTarget();
  }, [activeCardId, clearTapTarget, interactionLocked]);

  // Reset target when enemies change
  useEffect(() => {
    if (visibleEnemies.length <= 0) {
      if (targetedEnemyIndex !== 0) setTargetedEnemyIndex(0);
      if (selectedTargetMode !== 'enemy') setSelectedTargetMode('enemy');
      if (enemyInfoOpen) setEnemyInfoOpen(false);
      return;
    }
    if (targetedEnemyIndex >= visibleEnemies.length) {
      setTargetedEnemyIndex(Math.max(0, visibleEnemies.length - 1));
    }
  }, [enemyInfoOpen, selectedTargetMode, targetedEnemyIndex, visibleEnemies.length]);

  useEffect(() => {
    if (!activeCardId) {
      if (selectedTargetMode !== 'enemy') setSelectedTargetMode('enemy');
      return;
    }
    if (selectedTargetMode === 'self' && !activeTargetingProfile.canTargetSelf) {
      setSelectedTargetMode(getPreferredTargetMode(activeCardId));
      return;
    }
    if (selectedTargetMode === 'enemy' && !activeTargetingProfile.canTargetEnemy && activeTargetingProfile.canTargetSelf) {
      setSelectedTargetMode(getPreferredTargetMode(activeCardId));
    }
  }, [
    activeCardId,
    activeTargetingProfile.canTargetEnemy,
    activeTargetingProfile.canTargetSelf,
    getPreferredTargetMode,
    selectedTargetMode,
  ]);

  // Keep the centered card stable across hand changes
  useEffect(() => {
    const prevHand = prevHandRef.current;

    if (hand.length === 0) {
      if (activeCardId !== null) setActiveCardId(null);
      if (centerCardDismissed) setCenterCardDismissed(false);
      prevHandRef.current = hand;
      return;
    }

    if (!activeCardId || !hand.includes(activeCardId)) {
      const prevIndex = activeCardId ? prevHand.indexOf(activeCardId) : 0;
      const nextIndex = prevIndex >= 0 ? Math.min(prevIndex, hand.length - 1) : 0;
      const nextCardId = hand[nextIndex] ?? hand[0];
      setCenterCardDismissed(false);
      setSelectedTargetMode(getPreferredTargetMode(nextCardId));
      setActiveCardId(nextCardId);
    }

    prevHandRef.current = hand;
  }, [activeCardId, centerCardDismissed, getPreferredTargetMode, hand]);

  useEffect(() => {
    if (viewingPile) setDeckMenuOpen(false);
  }, [viewingPile]);

  useEffect(() => {
    if (!deckMenuOpen) return;
    scrollPortraitAnchorIntoView(portraitDeckMenuRef);
  }, [deckMenuOpen, scrollPortraitAnchorIntoView]);

  useEffect(() => {
    if (!viewingPile) return;
    scrollPortraitAnchorIntoView(portraitPileAnchorRef);
  }, [viewingPile, scrollPortraitAnchorIntoView]);

  // Parse global combat log for floating numbers, sound cues, and card-play animations.
  useLayoutEffect(() => {
    if (!combat) {
      setDisplayCombatState(null);
      logInitRef.current = false;
      lastLogLenRef.current = globalLog.length;
      waitingForEndTurnLogsRef.current = false;
      return;
    }

    if (!logInitRef.current) {
      lastLogLenRef.current = globalLog.length;
      logInitRef.current = true;
      return;
    }

    if (globalLog.length < lastLogLenRef.current) {
      lastLogLenRef.current = globalLog.length;
      return;
    }

    const newEntries = globalLog.slice(lastLogLenRef.current);
    lastLogLenRef.current = globalLog.length;
    if (!newEntries.length) {
      if (waitingForEndTurnLogsRef.current) {
        waitingForEndTurnLogsRef.current = false;
        setEndTurnPending(false);
      }
      return;
    }

    const newAnimations = [];
    const immediateReactions = [];
    let sawEnemyCard = false;
    let pendingEnemyAnimation = null;
    let lastEnemyAnimation = null;
    const resolvedPlayerId = player?.id ?? state?.run?.playerId ?? 'player';
    const buildLoggedDisplayState = (entryData) => buildCombatDisplayState(
      combat,
      entryData?.playerBefore ?? null,
      entryData?.enemiesBefore ?? EMPTY_ARRAY,
      {
        ram: entryData?.playerRamBefore,
        maxRam: entryData?.playerMaxRamBefore,
        heat: entryData?.heatBefore,
        maxHeat: entryData?.maxHeatBefore,
      },
    );

    const queueReaction = (reaction, { attachToPending = false, sourceId = null } = {}) => {
      const resolvedSourceId = reaction?.sourceId ?? sourceId ?? (attachToPending ? pendingEnemyAnimation?.enemyId ?? null : null);
      const sourceEnemyId = resolvedSourceId && !isPlayerEntityId(resolvedSourceId, resolvedPlayerId)
        ? resolvedSourceId
        : null;
      const resolvedReaction = {
        ...reaction,
        sourceId: resolvedSourceId,
        float: reaction?.float
          ? {
            ...reaction.float,
            anchorEnemyId: reaction.float.anchorEnemyId
              ?? (reaction.zone === 'player'
                ? sourceEnemyId
                : reaction.targetId ?? null),
            targetId: reaction.float.targetId ?? reaction.targetId ?? null,
          }
          : null,
      };
      if (
        attachToPending
        && pendingEnemyAnimation
        && (!resolvedSourceId || !pendingEnemyAnimation.enemyId || resolvedSourceId === pendingEnemyAnimation.enemyId)
      ) {
        pendingEnemyAnimation.reactions = [...(pendingEnemyAnimation.reactions || []), resolvedReaction];
        return;
      }
      immediateReactions.push(resolvedReaction);
    };

    for (const entry of newEntries) {
      if (entry.t === 'CardPlayed') {
        newAnimations.push({
          id: ++playAnimationIdRef.current,
          kind: 'cardPlay',
          actor: 'player',
          defId: entry.data?.defId,
          targetEnemyId: entry.data?.targetEnemyId ?? null,
          duration: getPlayAnimationDuration('player'),
        });
      } else if (entry.t === 'EnemyCardPlayed') {
        sawEnemyCard = true;
        sfx.enemyAction(entry.data?.intentType || 'Unknown');
        const displayBefore = buildLoggedDisplayState(entry.data);
        if (lastEnemyAnimation && !lastEnemyAnimation.displayAfter) {
          lastEnemyAnimation.displayAfter = displayBefore;
        }
        pendingEnemyAnimation = {
          id: ++playAnimationIdRef.current,
          kind: 'cardPlay',
          actor: 'enemy',
          enemyId: entry.data?.enemyId,
          enemyName: entry.data?.enemyName,
          defId: entry.data?.defId,
          intentType: entry.data?.intentType || 'Unknown',
          effectSummary: entry.data?.effectSummary || null,
          reactions: [],
          displayBefore,
          displayAfter: null,
          duration: getPlayAnimationDuration('enemy', entry.data?.intentType),
        };
        lastEnemyAnimation = pendingEnemyAnimation;
        newAnimations.push(pendingEnemyAnimation);
      } else if (entry.t === 'MutationApplied') {
        sfx.mutation();
        const mutationId = entry.data?.mutationId ?? null;
        const cardInstanceId = entry.data?.cardInstanceId ?? null;
        const cardInstance = cardInstanceId ? cardInstances[cardInstanceId] : null;
        const defId = entry.data?.cardDefId ?? cardInstance?.defId ?? null;
        if (mutationId && defId) {
          newAnimations.push({
            id: ++playAnimationIdRef.current,
            kind: entry.data?.isNewInRun ? 'mutationPopup' : 'mutationRepeat',
            mutationId,
            mutationName: entry.data?.mutationName ?? data?.mutations?.[mutationId]?.name ?? mutationId,
            cardInstanceId,
            defId,
            duration: entry.data?.isNewInRun ? MUTATION_DISCOVERY_MS : MUTATION_REPEAT_LINGER_MS,
          });
        }
      } else if (entry.t === 'MutPatch') {
        sfx.mutation();
      }

      if (entry.t === 'DamageDealt') {
        const {
          sourceId,
          targetId,
          finalDamage,
          protectionAbsorbed,
          firewallAbsorbed,
          blocked,
        } = entry.data || {};
        const absorbed = protectionAbsorbed ?? firewallAbsorbed ?? blocked ?? 0;
        const isPlayerTarget = isPlayerEntityId(targetId, resolvedPlayerId);
        const targetEnemy = !isPlayerTarget ? enemies.find((enemy) => enemy.id === targetId) : null;

        if (finalDamage > 0) {
          const impactType = isPlayerTarget ? 'damage' : targetEnemy?.hp <= 0 ? 'defeat' : 'damage';
          queueReaction({
            zone: isPlayerTarget ? 'player' : 'enemy',
            targetId: !isPlayerTarget ? targetId : null,
            impactType,
            sound: 'damage',
            float: {
              id: ++floatIdRef.current,
              text: `-${finalDamage}`,
              cssClass: 'float-dmg',
              color: '#ff4433',
              zone: isPlayerTarget ? 'player' : 'enemy',
            },
          }, {
            attachToPending: Boolean(isPlayerTarget || targetId),
            sourceId,
          });
        }

        if (absorbed > 0) {
          queueReaction({
            zone: isPlayerTarget ? 'player' : 'enemy',
            targetId: !isPlayerTarget ? targetId : null,
            impactType: 'shield',
            sound: 'block',
            float: {
              id: ++floatIdRef.current,
              text: `FW ${absorbed}`,
              cssClass: 'float-block',
              color: '#00f0ff',
              zone: isPlayerTarget ? 'player' : 'enemy',
            },
          }, {
            attachToPending: Boolean(isPlayerTarget || targetId),
            sourceId,
          });
        }
      } else if (entry.t === 'Info') {
        const msg = entry.msg || '';

        if (BOSS_PHASE_AUDIO_PATTERN.test(msg)) {
          sfx.bossPhase();
        }
        if (SYSTEM_WARNING_AUDIO_PATTERN.test(msg)) {
          sfx.systemWarning();
        }

        const exactHealMatch = msg.match(/^([A-Za-z0-9_:-]+)\s+healed?\s+(\d+)/i);
        const genericHealMatch = exactHealMatch ? null : msg.match(/healed? (\d+)/i);
        if (exactHealMatch || genericHealMatch) {
          const targetId = exactHealMatch?.[1] ?? null;
          const amount = exactHealMatch?.[2] ?? genericHealMatch?.[1] ?? '0';
          const isPlayerTarget = targetId ? isPlayerEntityId(targetId, resolvedPlayerId) : !msg.startsWith('enemy_');
          queueReaction({
            zone: isPlayerTarget ? 'player' : 'enemy',
            targetId: !isPlayerTarget ? targetId : null,
            impactType: 'heal',
            sound: 'heal',
            float: {
              id: ++floatIdRef.current,
              text: `+${amount}`,
              cssClass: 'float-heal',
              color: '#00ff6b',
              zone: isPlayerTarget ? 'player' : 'enemy',
            },
          }, {
            attachToPending: true,
          });
        }

        const firewallMatch = msg.match(/^([A-Za-z0-9_:-]+)\s+gained Firewall\((\d+)\)/i);
        if (firewallMatch) {
          const targetId = firewallMatch[1];
          const isPlayerTarget = isPlayerEntityId(targetId, resolvedPlayerId);
          queueReaction({
            zone: isPlayerTarget ? 'player' : 'enemy',
            targetId: !isPlayerTarget ? targetId : null,
            impactType: 'shield',
            sound: 'block',
            float: {
              id: ++floatIdRef.current,
              text: `FW ${firewallMatch[2]}`,
              cssClass: 'float-block',
              color: '#00f0ff',
              zone: isPlayerTarget ? 'player' : 'enemy',
            },
          }, {
            attachToPending: true,
          });
        }

        const statusGainMatch = msg.match(/^([A-Za-z0-9_:-]+)\s+gained\s+([A-Za-z][A-Za-z0-9_]*)\((\d+)\)/i);
        if (statusGainMatch && !/^Firewall$/i.test(statusGainMatch[2])) {
          const targetId = statusGainMatch[1];
          const statusId = normalizeStatusId(statusGainMatch[2]);
          const stacks = statusGainMatch[3];
          const statusMeta = getStatusMeta(statusId);
          const isPlayerTarget = isPlayerEntityId(targetId, resolvedPlayerId);
          queueReaction({
            zone: isPlayerTarget ? 'player' : 'enemy',
            targetId: !isPlayerTarget ? targetId : null,
            impactType: 'status',
            sound: 'status',
            float: {
              id: ++floatIdRef.current,
              text: `${humanizeStatusId(statusId)} ${stacks}`,
              cssClass: 'float-status',
              color: statusMeta.color,
              zone: isPlayerTarget ? 'player' : 'enemy',
            },
          }, {
            attachToPending: true,
          });
        } else if (msg.includes('gained ') && msg.includes('(')) {
          sfx.status();
        }
      }
    }

    if (lastEnemyAnimation && !lastEnemyAnimation.displayAfter) {
      lastEnemyAnimation.displayAfter = buildCombatDisplayState(combat);
    }

    immediateReactions.forEach((reaction) => emitCombatReaction(reaction));

    if (newAnimations.length) {
      const firstEnemyAnimation = newAnimations.find((animation) => animation.actor === 'enemy' && animation.displayBefore);
      if (firstEnemyAnimation?.displayBefore) {
        setDisplayCombatState(firstEnemyAnimation.displayBefore);
      }
      setAnimationQueue((prev) => [...prev, ...newAnimations]);
    }

    if (waitingForEndTurnLogsRef.current) {
      waitingForEndTurnLogsRef.current = false;
      if (!sawEnemyCard) setEndTurnPending(false);
    }
  }, [cardInstances, combat, data?.mutations, emitCombatReaction, globalLog, player?.id, state?.run?.playerId]);

  useEffect(() => {
    if (activeAnimation || animationQueue.length === 0) return;
    const [nextAnimation, ...rest] = animationQueue;
    setAnimationQueue(rest);
    setActiveAnimation(nextAnimation);
  }, [activeAnimation, animationQueue]);

  useLayoutEffect(() => {
    if (activeAnimation?.actor === 'enemy' && activeAnimation.displayBefore) {
      setDisplayCombatState(activeAnimation.displayBefore);
      return;
    }
    if (!activeAnimation && animationQueue.length === 0) {
      setDisplayCombatState(null);
    }
  }, [activeAnimation, animationQueue.length]);

  useEffect(() => {
    if (activeAnimation?.actor !== 'enemy' || !activeAnimation.displayAfter) return undefined;

    const totalDuration = activeAnimation.duration || PLAYER_PLAY_ANIMATION_MS;
    const revealDelay = Math.max(160, Math.min(totalDuration - 140, Math.round(totalDuration * 0.52)));
    const timeoutId = setTimeout(() => {
      setDisplayCombatState(activeAnimation.displayAfter);
    }, revealDelay);
    return () => clearTimeout(timeoutId);
  }, [activeAnimation]);

  useEffect(() => {
    if (!activeAnimation?.reactions?.length) return undefined;

    const totalDuration = activeAnimation.duration || PLAYER_PLAY_ANIMATION_MS;
    const timeouts = activeAnimation.reactions.map((reaction, index, reactions) => {
      const progress = reactions.length === 1
        ? 0.48
        : 0.34 + ((0.42 / Math.max(1, reactions.length - 1)) * index);
      const delay = Math.max(120, Math.min(totalDuration - 120, Math.round(totalDuration * progress)));
      return setTimeout(() => {
        emitCombatReaction(reaction);
      }, delay);
    });

    return () => {
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, [activeAnimation, emitCombatReaction]);

  useEffect(() => {
    if (!activeAnimation) return undefined;
    const timeoutId = setTimeout(() => {
      setActiveAnimation(null);
    }, activeAnimation.duration || PLAYER_PLAY_ANIMATION_MS);
    return () => clearTimeout(timeoutId);
  }, [activeAnimation]);

  useEffect(() => {
    if (!activeAnimation && animationQueue.length === 0 && endTurnPending && !waitingForEndTurnLogsRef.current) {
      setEndTurnPending(false);
    }
  }, [activeAnimation, animationQueue.length, endTurnPending]);

  const focusedEnemyPlayability = activeCardId && targetedEnemy && activeTargetingProfile.canTargetEnemy
    ? getPlayabilityForTarget(activeCardId, 'enemy', targetedEnemy.id)
    : { playable: false, reason: null };
  const selfTargetPlayability = activeCardId && activeTargetingProfile.canTargetSelf
    ? getPlayabilityForTarget(activeCardId, 'self', defaultEnemyTargetId)
    : { playable: false, reason: null };
  const enemyTargetArmed = Boolean(
    activeCardId
    && targetedEnemy
    && armedTarget.kind === 'enemy'
    && armedTarget.id === targetedEnemy.id,
  );
  const selfTargetArmed = Boolean(
    activeCardId
    && armedTarget.kind === 'self'
    && armedTarget.id === PLAYER_TARGET_ID,
  );
  const enemyBlockedReason = activeCardId && activeTargetingProfile.canTargetEnemy && !focusedEnemyPlayability.playable
    ? focusedEnemyPlayability.reason
    : null;
  const fallbackBlockedReason = selfTargetPlayability.reason || focusedEnemyPlayability.reason || 'disabled';
  const activeCardHint = !activeCardId
    ? 'Tap a hand card to center it'
    : enemyTargetArmed
      ? `Double tap ${targetedEnemy?.name ?? 'the target'} now`
      : selfTargetArmed
        ? 'Double tap the player panel now'
        : canCastActiveOnAnyEnemy && canCastActiveOnSelf
          ? 'Swipe up for the selected enemy, swipe down for self, or double tap a target'
          : canCastActiveOnSelf
            ? 'Swipe down or double tap the player panel to cast'
            : canCastActiveOnAnyEnemy
              ? 'Swipe up for the selected enemy, or double tap a target'
              : describeCardPlayabilityReason(fallbackBlockedReason);
  const activeCardHelperNote = !activeCardId
    ? 'A slower second tap on an enemy opens its details page.'
    : enemyTargetArmed || selfTargetArmed
      ? 'The armed state is brief. A slower second enemy tap opens intel instead.'
      : enemyBlockedReason && canCastActiveOnAnyEnemy
        ? 'The focused enemy is blocked for this card, but another enemy is still a valid target.'
      : canCastActiveOnAnyEnemy && canCastActiveOnSelf
        ? 'Swipes always use the selected enemy or yourself. Tap enemies only to change the current target.'
        : canCastActiveOnAnyEnemy
          ? 'Swiping up uses the selected enemy. A slower second tap on that enemy opens its dossier.'
          : canCastActiveOnSelf
            ? 'Swiping down applies the card to yourself right now.'
            : activeTargetingProfile.canTargetEnemy
              ? describeCardPlayabilityReason(focusedEnemyPlayability.reason, 'that enemy')
              : describeCardPlayabilityReason(fallbackBlockedReason);
  const activeCardHelperTone = enemyTargetArmed || selfTargetArmed
    ? C.neonYellow
    : canCastActiveOnAnyEnemy || canCastActiveOnSelf
      ? C.neonGreen
      : C.neonOrange;
  const activeCardHeatForecast = activeCardId && activeDef && activeInstance
    ? buildCardHeatForecast(activeDef, activeInstance, heat, maxHeat)
    : null;
  const activeCardTargetPreview = !activeCardId
    ? null
    : selectedTargetMode === 'self'
      ? {
        label: selfTargetArmed ? 'Self armed' : 'Self',
        tone: selfTargetArmed ? C.neonYellow : (canCastActiveOnSelf ? C.neonGreen : C.neonOrange),
        summary: selfTargetArmed
          ? 'The self route is armed. Swipe down now to apply the card to yourself.'
          : canCastActiveOnSelf
            ? 'Swipe down to resolve on yourself. The up route still uses the selected enemy.'
            : 'This card cannot currently route to self.',
        routes: [
          {
            label: 'Up',
            value: canCastActiveOnAnyEnemy ? (targetedEnemy?.name ?? 'Selected enemy') : 'Unavailable',
            tone: canCastActiveOnAnyEnemy ? C.neonRed : C.textDim,
          },
          {
            label: 'Down',
            value: 'Self',
            tone: selfTargetArmed ? C.neonYellow : (canCastActiveOnSelf ? C.neonGreen : C.textDim),
          },
        ],
        heatLabel: activeCardHeatForecast
          ? `Trace +${activeCardHeatForecast.gain} -> ${activeCardHeatForecast.nextState.label.toUpperCase()} (${activeCardHeatForecast.nextHeat}/${maxHeat})`
          : null,
        heatTone: activeCardHeatForecast?.nextState?.color || null,
      }
      : {
        label: enemyTargetArmed
          ? `${targetedEnemy?.name ?? 'Target'} locked`
          : (targetedEnemy?.name ?? 'Select target'),
        tone: enemyTargetArmed ? C.neonYellow : (canCastActiveOnAnyEnemy ? C.neonRed : C.neonOrange),
        summary: enemyTargetArmed
          ? 'The enemy route is armed. Swipe up to fire into the selected target.'
          : canCastActiveOnAnyEnemy
            ? `Swipe up to cast into ${targetedEnemy?.name ?? 'the selected enemy'}.`
            : 'No enemy route is valid for this card right now.',
        routes: [
          {
            label: 'Up',
            value: enemyTargetArmed
              ? `${targetedEnemy?.name ?? 'Target'} locked`
              : (targetedEnemy?.name ?? 'Select target'),
            tone: enemyTargetArmed ? C.neonYellow : (canCastActiveOnAnyEnemy ? C.neonRed : C.textDim),
          },
          {
            label: 'Down',
            value: canCastActiveOnSelf ? 'Self' : 'Unavailable',
            tone: canCastActiveOnSelf ? C.neonGreen : C.textDim,
          },
        ],
        heatLabel: activeCardHeatForecast
          ? `Trace +${activeCardHeatForecast.gain} -> ${activeCardHeatForecast.nextState.label.toUpperCase()} (${activeCardHeatForecast.nextHeat}/${maxHeat})`
          : null,
        heatTone: activeCardHeatForecast?.nextState?.color || null,
      };

  useEffect(() => {
    const alertLevel = getHeatState(heat, maxHeat).alertLevel;
    if (prevHeatAlertRef.current == null) {
      prevHeatAlertRef.current = alertLevel;
      return;
    }
    if (alertLevel > prevHeatAlertRef.current) {
      sfx.heatAlert(alertLevel);
    }
    prevHeatAlertRef.current = alertLevel;
  }, [heat, maxHeat]);

  const handleEndTurn = () => {
    if (interactionLocked) return;
    recordPlaytest('end_turn_pressed', {
      snapshot: buildCombatSnapshot(),
    });
    sfx.endTurn();
    waitingForEndTurnLogsRef.current = true;
    setEndTurnPending(true);
    onAction?.({ type: 'Combat_EndTurn' });
  };

  const enemyCardsStrip = (
    <div
      style={{
        minWidth: 0,
        display: 'flex',
        justifyContent: isPhoneLayout ? 'flex-start' : 'flex-end',
        overflowX: 'auto',
        overflowY: 'visible',
        padding: isPhonePortrait ? '0 0 2px' : '0 2px 4px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: isPhoneLayout ? 8 : 10,
          justifyContent: 'center',
          alignItems: 'stretch',
          minWidth: 'fit-content',
          padding: '0 4px',
        }}
      >
        {displayVisibleEnemies.map((enemy) => {
          const actualEnemy = visibleEnemies.find((candidate) => candidate.id === enemy.id) ?? enemy;
          const actualEnemyIndex = visibleEnemies.findIndex((candidate) => candidate.id === enemy.id);
          const enemyPlayability = activeCardId && activeTargetingProfile.canTargetEnemy
            ? getPlayabilityForTarget(activeCardId, 'enemy', actualEnemy.id)
            : null;
          return (
            <EnemyCard
              key={enemy.id}
              enemy={enemy}
              isTargeted={selectedEnemyId === enemy.id}
              onClick={() => handleEnemyTap(actualEnemy, actualEnemyIndex >= 0 ? actualEnemyIndex : 0)}
              actingType={activeAnimation?.actor === 'enemy' && activeAnimation.enemyId === enemy.id ? activeAnimation.intentType : null}
              data={data}
              compact={isPhoneLayout}
              impact={enemyImpactMap[enemy.id] ?? null}
              hasActiveCard={Boolean(activeCardId)}
              canActivate={Boolean(enemyPlayability?.playable)}
              isArmed={armedTarget.kind === 'enemy' && armedTarget.id === enemy.id}
            />
          );
        })}
      </div>
    </div>
  );

  const enemyFocusPanel = (
    <div style={getTutorialFocusFrameStyle(combatTutorialFocus.enemy, C.neonCyan, 8, 20) || undefined}>
      <EnemyFocusPanel
        enemy={displayTargetedEnemy}
        intentBadges={targetedIntentBadges}
        bossReadout={targetedBossReadout}
        compact={isPhoneLayout}
        onOpenMenu={isPhonePortrait ? () => {
          setDeckMenuOpen(false);
          onOpenMenu?.();
        } : null}
        hasActiveCard={Boolean(activeCardId)}
        canActivate={Boolean(focusedEnemyPlayability.playable)}
        isArmed={enemyTargetArmed}
        blockedReason={enemyBlockedReason}
      />
    </div>
  );

  const centeredCardPanel = (
    <div style={getTutorialFocusFrameStyle(combatTutorialFocus.center, C.neonYellow, 8, 24) || undefined}>
      <CenterCardDisplay
        cardInstance={activeInstance}
        cardDef={activeDef}
        data={data}
        dismissed={centerCardDismissed}
        onDismiss={() => setCenterCardDismissed(true)}
        onActivate={() => playCardToTarget(activeCardId, selectedTargetMode, defaultEnemyTargetId)}
        onSwipeCast={handleCenterCardSwipeCast}
        canActivate={!interactionLocked && !!activeCardId && canPlayCard(activeCardId)}
        activateHint={interactionLocked ? 'Resolving action' : activeCardHint}
        helperNote={interactionLocked ? 'Actions are resolving. Target input will unlock in a moment.' : activeCardHelperNote}
        targetPreview={activeCardTargetPreview}
        helperTone={interactionLocked ? C.neonCyan : activeCardHelperTone}
        layoutMode={layoutMode}
      />
    </div>
  );

  const combatOpsConsole = (
    <CombatOpsConsole
      activeAnimation={activeAnimation}
      activeCardDef={activeDef}
      targetedEnemy={displayTargetedEnemy}
      targetedIntentBadges={targetedIntentBadges}
      targetPreview={activeCardTargetPreview}
      heatForecast={activeCardHeatForecast}
      heat={displayHeat}
      maxHeat={displayMaxHeat}
      arenaModifier={arenaModifier}
      data={data}
    />
  );

  const handFan = (
    <ArcHand
      hand={hand}
      cardInstances={cardInstances}
      data={data}
      activeCardId={activeCardId}
      onFocusCard={focusActiveCard}
      canPlayCard={(cid) => !interactionLocked && canPlayCard(cid)}
      locked={interactionLocked}
      aiPaused={aiPaused}
      onHover={(cd, x, y) => setTooltip({ cardDef: cd, x, y })}
      layoutMode={layoutMode}
    />
  );

  const mobileBottomPanels = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isPhonePortrait ? 'minmax(0, 1fr)' : 'minmax(0, 1fr)',
        gap: 8,
        width: '100%',
      }}
    >
      {isPhonePortrait ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 3fr) minmax(96px, 1fr)',
            gap: 8,
            alignItems: 'stretch',
          }}
        >
          <MobilePlayerHud
            player={displayPlayer}
            ram={displayRam}
            maxRam={displayMaxRam}
            heat={displayHeat}
            maxHeat={displayMaxHeat}
            arenaModifier={arenaModifier}
            drawCount={drawPile.length}
            discardCount={discardPile.length}
            exhaustCount={exhaustPile.length}
            powerPile={powerPile}
            cardInstances={cardInstances}
            data={data}
            layoutMode={layoutMode}
            interactionLocked={interactionLocked}
            selfTargetable={Boolean(activeCardId && activeTargetingProfile.canTargetSelf)}
            selfTargetSelected={selectedTargetMode === 'self' && !!activeCardId && activeTargetingProfile.canTargetSelf}
            selfTargetArmed={selfTargetArmed}
            onTargetSelf={handlePlayerTargetTap}
          />
          <PortraitCombatRail
            interactionLocked={interactionLocked}
            onEndTurn={handleEndTurn}
            deckMenuOpen={deckMenuOpen}
            onToggleDeckMenu={setDeckMenuOpen}
            highlightEndTurn={combatTutorialFocus.actions}
          />
        </div>
      ) : (
        <MobilePlayerHud
          player={displayPlayer}
          ram={displayRam}
          maxRam={displayMaxRam}
          heat={displayHeat}
          maxHeat={displayMaxHeat}
          arenaModifier={arenaModifier}
          drawCount={drawPile.length}
          discardCount={discardPile.length}
          exhaustCount={exhaustPile.length}
          powerPile={powerPile}
          cardInstances={cardInstances}
          data={data}
          layoutMode={layoutMode}
          interactionLocked={interactionLocked}
          selfTargetable={Boolean(activeCardId && activeTargetingProfile.canTargetSelf)}
          selfTargetSelected={selectedTargetMode === 'self' && !!activeCardId && activeTargetingProfile.canTargetSelf}
          selfTargetArmed={selfTargetArmed}
          onTargetSelf={handlePlayerTargetTap}
        />
      )}
      {isPhonePortrait && deckMenuOpen && (
        <div
          ref={portraitDeckMenuRef}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 6,
          }}
        >
          <PileCountButton label="Draw" count={drawPile.length} color={C.neonCyan} onClick={() => setViewingPile('draw')} compact={true} />
          <PileCountButton label="Discard" count={discardPile.length} color={C.neonOrange} onClick={() => setViewingPile('discard')} compact={true} />
          <PileCountButton label="Exhaust" count={exhaustPile.length} color={C.neonRed} onClick={() => setViewingPile('exhaust')} compact={true} />
        </div>
      )}
      {!isPhonePortrait && (
        <CombatUtilityPanel
          handCount={hand.length}
          drawCount={drawPile.length}
          discardCount={discardPile.length}
          exhaustCount={exhaustPile.length}
          interactionLocked={interactionLocked}
          onViewPile={setViewingPile}
          onOpenSettings={() => {
            setDeckMenuOpen(false);
            onOpenMenu?.();
          }}
          onAuto={() => onAction?.({ type: 'Combat_Simulate', maxTurns: 50 })}
          onEndTurn={handleEndTurn}
          deckMenuOpen={deckMenuOpen}
          onToggleDeckMenu={setDeckMenuOpen}
          layoutMode={layoutMode}
          showDeckAction={!isPhonePortrait}
          showEndTurnAction={!isPhonePortrait}
          showDeckMenu={!isPhonePortrait}
          highlightActionKey={combatTutorialFocus.actions ? 'end-turn' : null}
        />
      )}
    </div>
  );

  const desktopBottomDock = (
    <div
      className="safe-area-bottom"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: '10px',
        margin: '0 10px 14px',
        padding: '10px 12px 12px',
        background: 'linear-gradient(180deg, rgba(9,12,20,0.94) 0%, rgba(6,9,16,0.98) 100%)',
        border: `1px solid ${C.borderLight}`,
        borderRadius: 18,
        boxShadow: '0 14px 32px rgba(0,0,0,0.34)',
      }}
    >
      <CompactPlayerHud
        player={displayPlayer}
        ram={displayRam}
        maxRam={displayMaxRam}
        heat={displayHeat}
        maxHeat={displayMaxHeat}
        arenaModifier={arenaModifier}
        powerPile={powerPile}
        cardInstances={cardInstances}
        data={data}
        selfTargetable={Boolean(activeCardId && activeTargetingProfile.canTargetSelf)}
        selfTargetSelected={selectedTargetMode === 'self' && !!activeCardId && activeTargetingProfile.canTargetSelf}
        selfTargetArmed={selfTargetArmed}
        onTargetSelf={handlePlayerTargetTap}
      />

      <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'space-between' }}>
        <CombatUtilityPanel
          handCount={hand.length}
          drawCount={drawPile.length}
          discardCount={discardPile.length}
          exhaustCount={exhaustPile.length}
          interactionLocked={interactionLocked}
          onViewPile={setViewingPile}
          onOpenSettings={() => {
            setDeckMenuOpen(false);
            onOpenMenu?.();
          }}
          onAuto={() => onAction?.({ type: 'Combat_Simulate', maxTurns: 50 })}
          onEndTurn={handleEndTurn}
          deckMenuOpen={deckMenuOpen}
          onToggleDeckMenu={setDeckMenuOpen}
          layoutMode={layoutMode}
          highlightActionKey={combatTutorialFocus.actions ? 'end-turn' : null}
        />
      </div>
    </div>
  );

  // Victory / Defeat sound (runs once when combatOver flips to true)
  useEffect(() => {
    if (!combat?.combatOver) return;
    if (combat.victory) sfx.victory();
    else sfx.defeat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat?.combatOver]);

  if ((!combat || combat.combatOver) && !hasQueuedAnimations) {
    const victory = combat?.victory;
    const accentColor = victory ? C.neonGreen : C.neonRed;

    // ── Compute combat stats from structured log ───────────────────────────
    const log = globalLog || [];
    let totalDmgDealt = 0;
    let totalDmgTaken = 0;
    let totalAbsorbed = 0;
    let cardsPlayedN  = 0;
    let killerName    = null;
    for (const entry of log) {
      if (entry.t === 'DamageDealt') {
        const d = entry.data || {};
        if (d.isPlayerSource) {
          totalDmgDealt += d.finalDamage || 0;
        } else {
          totalDmgTaken += d.finalDamage || 0;
          totalAbsorbed += d.protectionAbsorbed ?? d.firewallAbsorbed ?? d.blocked ?? 0;
          if (!victory) {
            const attacker = (combat?.enemies || []).find(e => e.id === d.sourceId);
            if (attacker) killerName = attacker.name;
          }
        }
      } else if (entry.t === 'CardPlayed') {
        cardsPlayedN++;
      }
    }
    const turns           = combat?.turn || 0;
    const hpFinal         = combat?.player?.hp ?? 0;
    const hpMax           = combat?.player?.maxHP ?? 75;
    const enemiesDefeated = (combat?.enemies || []).filter(e => e.hp <= 0).length;
    const totalEnemies    = (combat?.enemies || []).length;
    const absorbEff       = (totalAbsorbed + totalDmgTaken) > 0
      ? Math.round(100 * totalAbsorbed / (totalAbsorbed + totalDmgTaken))
      : 0;

    const StatRow = ({ label, value, valueColor }) => (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 0',
        borderBottom: `1px solid ${C.neonCyan}12`,
        fontFamily: MONO, fontSize: 13,
      }}>
        <span style={{ color: C.textDim }}>{label}</span>
        <span style={{ color: valueColor || C.text, fontWeight: 700 }}>{value}</span>
      </div>
    );

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
          backgroundImage: `
            linear-gradient(${C.neonCyan}03 1px, transparent 1px),
            linear-gradient(90deg, ${C.neonCyan}03 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      >
        {/* Header */}
        <div
          className="animate-slide-up"
          style={{
            fontSize: '32px',
            fontFamily: MONO,
            fontWeight: 900,
            marginBottom: '4px',
            letterSpacing: '0.15em',
            color: accentColor,
            textShadow: `0 0 24px ${accentColor}80`,
          }}
        >
          {victory ? '✓ VICTORY' : '✗ DEFEATED'}
        </div>
        <div style={{ fontFamily: MONO, marginBottom: '24px', color: C.textDim, fontSize: 12, letterSpacing: '0.06em', textAlign: 'center' }}>
          {victory
            ? 'All threats neutralised — systems operational'
            : `Connection lost${killerName ? ` — terminated by ${killerName}` : ''}`}
        </div>

        {/* Stats card */}
        <div style={{
          width: '100%', maxWidth: 340,
          backgroundColor: C.bgCard,
          border: `1px solid ${accentColor}30`,
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 28,
          boxShadow: `0 0 30px ${accentColor}10`,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 10, fontWeight: 700,
            color: accentColor, letterSpacing: '0.14em', marginBottom: 10,
          }}>
            ▸ COMBAT REPORT
          </div>
          <StatRow label="Turns"              value={turns} />
          <StatRow label="Cards played"       value={cardsPlayedN} />
          <StatRow
            label="HP remaining"
            value={`${hpFinal} / ${hpMax}`}
            valueColor={hpFinal > hpMax * 0.5 ? C.neonGreen : hpFinal > 0 ? C.neonOrange : C.neonRed}
          />
          <StatRow label="Enemies down"       value={`${enemiesDefeated} / ${totalEnemies}`} />
          <StatRow label="Damage dealt"       value={totalDmgDealt.toLocaleString()} valueColor={C.neonRed} />
          <StatRow
            label="Damage taken"
            value={totalDmgTaken.toLocaleString()}
            valueColor={totalDmgTaken > hpMax * 2 ? C.neonRed : C.text}
          />
          <StatRow
            label="Damage absorbed"
            value={`${totalAbsorbed.toLocaleString()}  (${absorbEff}% eff.)`}
            valueColor={C.neonCyan}
          />
        </div>

        <button
          onClick={() => onAction?.({ type: 'GoToMap' })}
          style={{
            padding: '14px 40px',
            borderRadius: '12px',
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: '16px',
            letterSpacing: '0.08em',
            transition: 'all 0.2s ease',
            backgroundColor: accentColor,
            color: '#000',
            border: 'none',
            cursor: 'pointer',
            boxShadow: `0 0 30px ${accentColor}40`,
          }}
        >
          Continue →
        </button>
      </div>
    );
  }

  return (
    <div
      ref={screenRef}
      style={{
        minHeight: '100vh',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: isPhoneLayout ? 'auto' : 'hidden',
        backgroundColor: C.bg,
        backgroundImage: `
          linear-gradient(${C.neonCyan}03 1px, transparent 1px),
          linear-gradient(90deg, ${C.neonCyan}03 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px',
        position: 'relative',
      }}
    >
      {/* ── Floating damage / heal numbers overlay ── */}
      {combatFlash && (
        <div
          key={`combat-flash-${combatFlash.token}`}
          className="combat-ui-flash"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 180,
            background: combatFlash.zone === 'player'
              ? `radial-gradient(circle at 50% 78%, ${combatFlash.rgba} 0%, transparent 38%)`
              : `radial-gradient(circle at 50% 20%, ${combatFlash.rgba} 0%, transparent 34%)`,
          }}
        />
      )}

      {playerImpact && (
        <div
          key={`player-impact-${playerImpact.token}`}
          className={`player-zone-impact-${playerImpact.type}`}
          style={{
            position: 'absolute',
            left: isPhoneLayout ? '4%' : '8%',
            right: isPhoneLayout ? '4%' : '8%',
            bottom: isPhoneLayout ? '12%' : '7%',
            height: isPhoneLayout ? '28%' : '23%',
            pointerEvents: 'none',
            zIndex: 170,
            borderRadius: 28,
            background: getPlayerImpactBackground(playerImpact.type),
          }}
        />
      )}

      {floats.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 500 }}>
          {floats.map((f) => {
            const floatLayout = getCombatFloatLayout(f, enemies, layoutMode);
            return (
              <div
                key={f.id}
                className={f.cssClass}
                style={{
                  position: 'absolute',
                // Enemy zone ≈ top 30%, player zone ≈ bottom 35%
                  top: floatLayout.top,
                  left: floatLayout.left,
                  transform: floatLayout.transform,
                  textAlign: floatLayout.textAlign,
                  fontFamily: MONO,
                  fontWeight: 900,
                  fontSize: f.cssClass === 'float-dmg' ? 22 : 16,
                  color: f.color,
                  textShadow: `0 0 12px ${f.color}, 0 0 4px #000`,
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.text}
              </div>
            );
          })}
        </div>
      )}

      <CombatPlayAnimationLayer animation={activeAnimation} data={data} enemies={enemies} cardInstances={cardInstances} />

      {!isPhoneLayout && (
        <>
          <div
            className="safe-area-top"
            style={{
              flex: '0 0 auto',
              minHeight: desktopEnemyZoneMinHeight,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: desktopEnemyZonePadding,
              overflow: 'visible',
            }}
          >
            <div
              style={{
                width: 'min(100%, 1120px)',
                display: 'grid',
                gridTemplateColumns: 'clamp(220px, 24vw, 268px) minmax(0, 1fr)',
                alignItems: 'start',
                gap: 12,
              }}
            >
              {enemyFocusPanel}
              {enemyCardsStrip}
            </div>
          </div>

          <div
            style={{
              flex: '0 0 auto',
              display: 'flex',
              justifyContent: 'center',
              padding: '0 18px 8px',
            }}
          >
            {combatOpsConsole}
          </div>

          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center',
            padding: desktopCenterZonePadding,
            minHeight: 0,
            overflow: 'hidden',
          }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', minHeight: 0, overflow: 'auto', width: '100%', paddingTop: 6, paddingBottom: desktopCenterCardBottomPad }}>
              {centeredCardPanel}
            </div>
          </div>

          {handFan}
          {desktopBottomDock}
        </>
      )}

      {isPhonePortrait && (
        <>
          <div
            className="safe-area-top"
            style={{
              flex: '0 0 auto',
              padding: compactTutorialPortrait ? '6px 8px 2px' : '8px 8px 4px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'minmax(118px, 34vw) minmax(0, 1fr)',
                gap: 6,
                alignItems: 'start',
              }}
            >
              {enemyFocusPanel}
              {enemyCardsStrip}
            </div>
          </div>

          <div
            style={{
              flex: '0 0 auto',
              padding: compactTutorialPortrait ? '0 8px 4px' : '0 8px 6px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {combatOpsConsole}
          </div>

          <div
            style={{
              flex: '0 0 auto',
              padding: compactTutorialPortrait ? '0 8px 2px' : '0 8px 0',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              minHeight: 0,
            }}
          >
            {centeredCardPanel}
          </div>

          <div className="safe-area-bottom" style={{ flex: '0 0 auto', padding: compactTutorialPortrait ? '0 8px 2px' : '0 8px 0' }}>
            {handFan}
          </div>

          <div className="safe-area-bottom" style={{ flex: '0 0 auto', padding: compactTutorialPortrait ? '0 8px 10px' : '0 8px 6px' }}>
            {mobileBottomPanels}
            <div ref={portraitPileAnchorRef} style={{ height: 1 }} />
          </div>
        </>
      )}

      {isPhoneLandscape && (
        <>
          <div
            className="safe-area-top"
            style={{
              flex: '0 0 auto',
              padding: '10px 10px 6px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: `${landscapeFocusWidth}px minmax(0, 1fr)`,
                gap: 10,
                alignItems: 'start',
              }}
            >
              {enemyFocusPanel}
              {enemyCardsStrip}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: `${landscapeSidebarWidth}px minmax(0, 1fr)`,
              gap: 10,
              padding: '0 10px 10px',
            }}
          >
            <div className="safe-area-bottom" style={{ minWidth: 0, display: 'flex', alignItems: 'stretch' }}>
              {mobileBottomPanels}
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'space-between' }}>
              <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
                {combatOpsConsole}
              </div>
              <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: 6 }}>
                {centeredCardPanel}
              </div>
              <div style={{ flex: '0 0 auto' }}>
                {handFan}
              </div>
            </div>
          </div>
        </>
      )}

      {enemyInfoOpen && displayTargetedEnemy && (
        <EnemyDetailDialog
          enemy={displayTargetedEnemy}
          data={data}
          intentBadges={targetedIntentBadges}
          intentCardDef={targetedIntentCardDef}
          onClose={() => setEnemyInfoOpen(false)}
          dialogRef={enemyDialogRef}
          closeButtonRef={enemyDialogCloseRef}
        />
      )}

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

      {playtestEnabled && (
        <div
          style={{
            position: 'fixed',
            left: 10,
            bottom: isPhoneLayout ? 10 : 14,
            zIndex: 260,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 9px',
            borderRadius: 12,
            background: 'rgba(4,8,14,0.92)',
            border: `1px solid ${playtestLastError ? C.neonOrange : C.neonCyan}44`,
            boxShadow: `0 10px 22px rgba(0,0,0,0.28), 0 0 16px ${playtestLastError ? C.neonOrange : C.neonCyan}10`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', color: C.neonCyan }}>
              PHONE PLAYTEST
            </span>
            <span style={{ fontFamily: MONO, fontSize: 8, color: C.textPrimary, whiteSpace: 'nowrap' }}>
              {playtestSessionId ? `#${playtestSessionId.slice(-6)}` : 'starting'} • {playtestPendingCount} queued
            </span>
            <span style={{ fontFamily: MONO, fontSize: 7, color: playtestLastError ? C.neonOrange : C.textDim }}>
              {playtestLastError
                ? `Upload pending: ${playtestLastError}`
                : playtestLastSyncAt
                  ? `Synced ${new Date(playtestLastSyncAt).toLocaleTimeString()}`
                  : 'Auto-syncs back to this PC'}
            </span>
          </div>
          <button
            onClick={() => { void flushPlaytest('manual_overlay'); }}
            style={{
              padding: '7px 8px',
              borderRadius: 10,
              border: `1px solid ${C.neonCyan}44`,
              background: `${C.neonCyan}14`,
              color: C.neonCyan,
              fontFamily: MONO,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Sync
          </button>
        </div>
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

      {/* ── Scry modal ── */}
      {combat._scryPending && (() => {
        const { n, cards: scryCards } = combat._scryPending;
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 800,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scry-title"
            aria-describedby="scry-desc"
            ref={scryDialogRef}
            tabIndex={-1}
          >
            {/* Header */}
            <div id="scry-title" style={{ fontFamily: MONO, color: C.neonCyan, fontSize: 22, fontWeight: 900, letterSpacing: '0.12em', marginBottom: 4 }}>
              SCRY {n}
            </div>
            <div id="scry-desc" style={{ fontFamily: MONO, color: C.textDim, fontSize: 13, marginBottom: 24, textAlign: 'center' }}>
              Tap cards to discard · The rest return to top of draw pile in order
            </div>

            {/* Scry cards */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 28 }}>
              {scryCards.map((cid) => {
                const ci = cardInstances[cid];
                const def = data?.cards?.[ci?.defId];
                if (!def) return null;
                const discarding = scryDiscard.has(cid);
                return (
                  <div
                    key={cid}
                    onClick={() => setScryDiscard(prev => {
                      const next = new Set(prev);
                      if (next.has(cid)) next.delete(cid); else next.add(cid);
                      return next;
                    })}
                    style={{
                      position: 'relative', cursor: 'pointer',
                      opacity: discarding ? 0.45 : 1,
                      transform: discarding ? 'scale(0.9) rotate(-2deg)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                      outline: discarding ? `2px solid ${C.neonRed}` : `2px solid ${C.neonCyan}55`,
                      outlineOffset: 3,
                      borderRadius: 10,
                    }}
                  >
                    <HandCard
                      cardInstance={ci}
                      cardDef={def}
                      isSelected={false}
                      canPlay={false}
                      onSelect={() => {}}
                      compact={false}
                      showTooltip={false}
                      onHover={() => {}}
                    />
                    {discarding && (
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: `${C.neonRed}18`, pointerEvents: 'none',
                      }}>
                        <span style={{
                          fontFamily: MONO, fontWeight: 900, fontSize: 11,
                          color: C.neonRed, letterSpacing: '0.15em',
                          textShadow: `0 0 8px ${C.neonRed}`,
                        }}>DISCARD</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Confirm button */}
            <button
              ref={scryConfirmRef}
              onClick={() => {
                const toDiscard = [...scryDiscard].filter(c => scryCards.includes(c));
                const top = scryCards.filter(c => !toDiscard.includes(c));
                onAction?.({ type: 'Combat_ScryResolve', discard: toDiscard, top });
                setScryDiscard(new Set());
              }}
              style={{
                padding: '14px 40px', borderRadius: 12, border: 'none',
                fontFamily: MONO, fontWeight: 700, fontSize: 15,
                backgroundColor: C.neonCyan, color: '#000',
                cursor: 'pointer', letterSpacing: '0.08em',
                boxShadow: `0 0 20px ${C.neonCyan}44`,
                transition: 'all 0.15s ease',
              }}
            >
              Confirm {scryDiscard.size > 0 ? `(discard ${scryDiscard.size})` : '(keep all)'}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
