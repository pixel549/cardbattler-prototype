/**
 * Debug Seed System
 *
 * A 32-bit integer that seeds an RNG to produce fully-random combat variable
 * overrides from wide continuous ranges. Same seed â†’ same configuration every
 * time, but the value space covers the entire playable range for every variable.
 *
 * Variables generated per seed:
 *   playerMaxHP        10 â€“ 500  (log-uniform)
 *   startingCardCount  1  â€“ 100  (log-uniform)
 *   enemyHpMult        0.1â€“ 10x  (log-uniform)
 *   enemyDmgMult       0.1â€“ 10x  (log-uniform)
 *   playerMaxRAM       1  â€“ 32   (log-uniform)
 *   drawPerTurnDelta   -4 â€“ +12  (uniform)
 *   actOverride        null | 1â€“7 (35 % null)
 *   encounterKind      null | normal | elite | boss
 *   enemyCount         1â€“5       (how many enemies to pull from full pool)
 *   enemyPoolSeed      u32       (which enemies to use from full roster)
 *
 * When a debug seed is active, enemies are drawn from the FULL enemy roster
 * using enemyPoolSeed, guaranteeing all 148+ enemies can appear.
 *
 * null debugSeed = standard game, no overrides.
 */

import { RNG } from './rng.js';

// ---------------------------------------------------------------------------
// Core decode â€” seed â†’ override object
// ---------------------------------------------------------------------------
export function decodeDebugSeed(seed) {
  const s = (seed >>> 0);
  const rng = new RNG((s ^ 0xDEBDF00D) >>> 0);
  const n    = () => rng.next();
  // Log-uniform covers both tiny and huge values with equal density per decade
  const logU = (lo, hi) => lo * Math.pow(hi / lo, n());

  const playerMaxHP       = Math.max(1, Math.round(logU(10, 500)));
  const startingCardCount = Math.max(1, Math.round(logU(1, 100)));
  const enemyHpMult       = parseFloat(logU(0.1, 10).toFixed(2));
  const enemyDmgMult      = parseFloat(logU(0.1, 10).toFixed(2));
  const playerMaxRAM      = Math.max(1, Math.round(logU(1, 32)));
  const drawPerTurnDelta  = Math.round(n() * 16) - 4;   // -4 to +12

  const actRoll     = n();
  // 35 % chance of null (use real act), else pick 1â€“7
  const actOverride = actRoll < 0.35
    ? null
    : Math.max(1, Math.min(7, Math.ceil(actRoll * 7)));

  const kindRoll = n();
  // 35 % null, 25 % normal, 20 % elite, 20 % boss
  const encounterKind =
    kindRoll < 0.35 ? null    :
    kindRoll < 0.60 ? 'normal':
    kindRoll < 0.80 ? 'elite' : 'boss';

  // Enemy count (1â€“5) + a seed to pick which enemies from the full roster
  const enemyCount    = Math.max(1, Math.min(5, Math.ceil(n() * 5)));
  const enemyPoolSeed = rng.nextUint();

  return {
    playerMaxHP,
    startingCardCount,
    enemyHpMult,
    enemyDmgMult,
    playerMaxRAM,
    drawPerTurnDelta,
    actOverride,
    encounterKind,
    enemyCount,
    enemyPoolSeed,
    _seed: s,
  };
}

// ---------------------------------------------------------------------------
// Human-readable summary (only shows values that differ from game defaults)
// ---------------------------------------------------------------------------
export function describeDebugSeed(ovr) {
  if (!ovr) return 'No debug overrides';
  const parts = [];
  if (ovr.playerMaxHP !== 50)       parts.push(`HP:${ovr.playerMaxHP}`);
  if (ovr.startingCardCount !== 20) parts.push(`Cards:${ovr.startingCardCount}`);
  if (ovr.enemyHpMult !== 1.0)      parts.push(`EnemyHP:${ovr.enemyHpMult}x`);
  if (ovr.enemyDmgMult !== 1.0)     parts.push(`EnemyDMG:${ovr.enemyDmgMult}x`);
  if (ovr.playerMaxRAM !== 8)       parts.push(`RAM:${ovr.playerMaxRAM}`);
  if (ovr.drawPerTurnDelta !== 0)   parts.push(`Draw:${ovr.drawPerTurnDelta >= 0 ? '+' : ''}${ovr.drawPerTurnDelta}`);
  if (ovr.actOverride != null)      parts.push(`Act:${ovr.actOverride}`);
  if (ovr.encounterKind != null)    parts.push(`Fights:${ovr.encounterKind}`);
  parts.push(`${ovr.enemyCount}Ã—rnd`);  // enemy count always shown (always from full pool)
  return parts.join(' Â· ');
}

// ---------------------------------------------------------------------------
// Sensible decode â€” same structure, tighter ranges tuned for survivable runs
//
//   playerMaxHP        45  â€“ 150   (vs wild 10â€“500)
//   startingCardCount  12  â€“ 25    (vs wild 1â€“100)  â€” cuts deck-bloat extremes
//   enemyHpMult        0.65â€“ 1.8x  (vs wild 0.1â€“10x) â€” 3x was one-shotting turn 1
//   enemyDmgMult       0.65â€“ 1.5x  (vs wild 0.1â€“10x) â€” 1.72x already lethal
//   playerMaxRAM       5   â€“ 14    (vs wild 1â€“32)
//   drawPerTurnDelta   -1  â€“ +4    (vs wild -4â€“+12)  â€” removes worst deck-stall combos
//   act/kind/enemy logic identical to wild
// ---------------------------------------------------------------------------
export function decodeSensibleDebugSeed(seed) {
  const s   = (seed >>> 0);
  // Different XOR salt so the same integer produces different config than wild
  const rng  = new RNG((s ^ 0x5E5EC0DE) >>> 0);
  const n    = () => rng.next();
  const logU = (lo, hi) => lo * Math.pow(hi / lo, n());

  const playerMaxHP       = Math.max(1, Math.round(logU(45, 150)));
  const startingCardCount = Math.max(1, Math.round(logU(12, 25)));
  const enemyHpMult       = parseFloat(logU(0.65, 1.8).toFixed(2));
  const enemyDmgMult      = parseFloat(logU(0.65, 1.5).toFixed(2));
  const playerMaxRAM      = Math.max(1, Math.round(logU(5, 14)));
  const drawPerTurnDelta  = Math.round(n() * 5) - 1;   // -1 to +4

  const actRoll     = n();
  const actOverride = actRoll < 0.35
    ? null
    : Math.max(1, Math.min(7, Math.ceil(actRoll * 7)));

  const kindRoll = n();
  const encounterKind =
    kindRoll < 0.35 ? null     :
    kindRoll < 0.60 ? 'normal' :
    kindRoll < 0.80 ? 'elite'  : 'boss';

  const enemyCount    = Math.max(1, Math.min(5, Math.ceil(n() * 5)));
  const enemyPoolSeed = rng.nextUint();

  return {
    playerMaxHP,
    startingCardCount,
    enemyHpMult,
    enemyDmgMult,
    playerMaxRAM,
    drawPerTurnDelta,
    actOverride,
    encounterKind,
    enemyCount,
    enemyPoolSeed,
    _seed: s,
    _mode: 'sensible',
  };
}

// ---------------------------------------------------------------------------
// Generate a random 32-bit seed (for "randomize each run" mode)
// The same seed value decodes differently depending on which decoder is used.
// ---------------------------------------------------------------------------
export function randomDebugSeed() {
  return (Math.random() * 0x100000000 | 0) >>> 0;
}

// ---------------------------------------------------------------------------
// Pre-computed preset seeds
// (found by brute-force search for seeds where the key variable is extreme)
//
// seed 8194  â†’ HP:411  Cards:3   EnemyHP:0.41x  EnemyDMG:1.81x  RAM:16  Draw:-2  Act:3   Kind:normal  5Ã—rnd
// seed 6146  â†’ HP:14   Cards:95  EnemyHP:0.22x  EnemyDMG:1.32x  RAM:7   Draw:+2  Act:null Kind:null   4Ã—rnd
// seed 48    â†’ HP:63   Cards:82  EnemyHP:2.84x  EnemyDMG:0.73x  RAM:7   Draw:-3  Act:null Kind:elite  3Ã—rnd
// seed 0     â†’ HP:62   Cards:3   EnemyHP:5.65x  EnemyDMG:0.37x  RAM:2   Draw:+2  Act:4   Kind:null   2Ã—rnd
// seed 73    â†’ HP:61   Cards:1   EnemyHP:7.34x  EnemyDMG:6.59x  RAM:1   Draw:+1  Act:null Kind:null  2Ã—rnd
// seed 12    â†’ HP:62   Cards:1   EnemyHP:0.15x  EnemyDMG:0.10x  RAM:24  Draw:+2  Act:null Kind:elite 4Ã—rnd
// seed 8     â†’ HP:62   Cards:1   EnemyHP:0.35x  EnemyDMG:3.63x  RAM:2   Draw:-4  Act:4   Kind:elite  4Ã—rnd
// seed 14    â†’ HP:62   Cards:1   EnemyHP:0.30x  EnemyDMG:0.59x  RAM:1   Draw:+1  Act:5   Kind:boss   3Ã—rnd
// seed 10    â†’ HP:62   Cards:2   EnemyHP:0.75x  EnemyDMG:1.92x  RAM:15  Draw:-1  Act:3   Kind:elite  5Ã—rnd
// seed 133   â†’ HP:60   Cards:2   EnemyHP:0.35x  EnemyDMG:6.32x  RAM:2   Draw:+12 Act:7   Kind:elite  3Ã—rnd
// ---------------------------------------------------------------------------
export const DEBUG_PRESETS = {
  'Tank (411 HP)':        8194,
  'Glass Cannon (14 HP)': 6146,
  'Card Hoarder (82)':    48,
  'Tiny Deck (3)':        0,
  'Brutal Enemies':       73,
  'Pushover Enemies':     12,
  'Elite Gauntlet':       8,
  'Boss Rush':            14,
  'Act 3 Enemies':        10,
  'High RAM (24)':        12,
  'Big Hand (+12 draw)':  133,
  'Small Hand (-4 draw)': 8,
  'Enemy Swarm (5)':      10,
};
