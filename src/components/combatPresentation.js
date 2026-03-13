import { getHeatState } from '../game/combatMeta.js';

const PALETTE = {
  neonCyan: '#00f0ff',
  neonOrange: '#ff6b00',
  neonRed: '#ff2a2a',
  neonGreen: '#00ff6b',
  neonYellow: '#ffe600',
  bgDark: '#0d0d14',
};

export const HEAT_THRESHOLD_MARKERS = [
  { ratio: 0.3, label: 'W', color: PALETTE.neonYellow },
  { ratio: 0.55, label: 'H', color: PALETTE.neonOrange },
  { ratio: 0.8, label: 'C', color: '#ff5b2d' },
];

export const BOSS_PHASE_AUDIO_PATTERN = /armed Purge Charge|entered a shielded phase|forced a rule rewrite|tightened its combo punish threshold|was exposed:/i;
export const SYSTEM_WARNING_AUDIO_PATTERN = /armed Purge Charge|entered a shielded phase|Trace spike:/i;

export function getHeatVisualState(heat = 0, maxHeat = 20) {
  const heatState = getHeatState(heat, maxHeat);
  const glow = heatState.alertLevel >= 3
    ? 'rgba(255,91,45,0.22)'
    : heatState.alertLevel === 2
      ? 'rgba(255,107,0,0.18)'
      : heatState.alertLevel === 1
        ? 'rgba(255,230,0,0.14)'
        : 'rgba(0,240,255,0.12)';

  return {
    color: heatState.color,
    glow,
    label: heatState.shortLabel,
    alertLevel: heatState.alertLevel,
  };
}

export function getBossReadoutTone(emphasis = 'neutral') {
  switch (emphasis) {
    case 'critical':
      return { color: PALETTE.neonRed, background: `${PALETTE.neonRed}12`, border: `${PALETTE.neonRed}36` };
    case 'warning':
      return { color: PALETTE.neonOrange, background: `${PALETTE.neonOrange}12`, border: `${PALETTE.neonOrange}36` };
    case 'good':
      return { color: PALETTE.neonGreen, background: `${PALETTE.neonGreen}12`, border: `${PALETTE.neonGreen}36` };
    default:
      return { color: PALETTE.neonCyan, background: `${PALETTE.neonCyan}12`, border: `${PALETTE.neonCyan}30` };
  }
}

export function getEnemyAnimationAnchor(enemyId, enemies) {
  const count = Math.max(1, enemies?.length || 0);
  const index = Math.max(0, enemies?.findIndex((enemy) => enemy.id === enemyId) ?? 0);
  const pct = 54 + (((index + 0.5) / count) * 30);
  return { left: `${pct}%`, top: '18%' };
}

export function getCombatFloatLayout(float, enemies, layoutMode = 'desktop') {
  const isDesktop = layoutMode === 'desktop';
  const isPortraitPhone = layoutMode === 'phone-portrait';
  if (float?.anchorEnemyId) {
    const anchor = getEnemyAnimationAnchor(float.anchorEnemyId, enemies);
    return {
      left: anchor.left,
      top: anchor.top,
      transform: 'translateX(-50%)',
      textAlign: 'center',
    };
  }
  if (float?.zone === 'enemy' && float?.targetId) {
    const anchor = getEnemyAnimationAnchor(float.targetId, enemies);
    return {
      left: anchor.left,
      top: anchor.top,
      transform: 'translateX(-50%)',
      textAlign: 'center',
    };
  }
  if (float?.zone === 'player') {
    return {
      left: isDesktop ? '5%' : '6%',
      top: isPortraitPhone ? '74%' : '67%',
      transform: 'none',
      textAlign: 'left',
    };
  }
  return {
    left: '50%',
    top: float?.zone === 'enemy' ? '18%' : '62%',
    transform: 'translateX(-50%)',
    textAlign: 'center',
  };
}

export function getHeatBarTextColor() {
  return PALETTE.bgDark;
}
