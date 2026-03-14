import React, { useEffect, useState } from 'react';
import RuntimeArt from './RuntimeArt.jsx';
import { getCardImage } from '../data/cardImages.js';
import { sfx } from '../game/sounds.js';
import {
  composeRunConfig,
  getStarterLoadoutPool,
  getStarterLoadoutPoolCandidates,
  getStarterProfileDeckSize,
  getStarterProfileLoadoutSlots,
  RUN_BASELINE,
} from '../game/runProfiles.js';
import { getBossArchiveEntries } from '../game/bossIntel.js';
import {
  getCallsignTheme,
  getDefaultCallsignId,
  getUnlockedAchievementRewardState,
  isCardUnlockedByAchievements,
  isRelicUnlockedByAchievements,
} from '../game/achievements.js';
import { MINIGAME_REGISTRY } from '../game/minigames.js';
import { getFixerLine } from '../game/narrativeDirector.js';

const C = {
  bg: '#0a0a0f',
  bgCard: '#12121a',
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
const DISPLAY_FONT = "'Rajdhani', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace";
const EMPTY_ARRAY = [];

const CARD_TYPE_COLORS = {
  Attack: C.red,
  Skill: C.green,
  Power: C.purple,
  Status: C.yellow,
  Curse: C.orange,
  Enemy: C.red,
  default: C.cyan,
};

function getCardColor(type) {
  return CARD_TYPE_COLORS[type] || CARD_TYPE_COLORS.default;
}

const UNLOCK_PROGRESS_KEYS = {
  totalRuns: {
    label: 'Runs',
    getCurrent: (metaProgress) => Math.max(0, Number(metaProgress?.totalRuns || 0)),
  },
  totalWins: {
    label: 'Wins',
    getCurrent: (metaProgress) => Math.max(0, Number(metaProgress?.totalWins || 0)),
  },
  bestActReached: {
    label: 'Best Act',
    getCurrent: (metaProgress) => Math.max(1, Number(metaProgress?.bestActReached || 1)),
  },
  totalUniqueMutations: {
    label: 'Mutations',
    getCurrent: (metaProgress) => Math.max(0, Number(metaProgress?.totalUniqueMutations || 0)),
  },
  highestDifficultyRankCleared: {
    label: 'Highest Rank',
    getCurrent: (metaProgress) => Math.max(0, Number(metaProgress?.highestDifficultyRankCleared || 0)),
  },
};

function getUnlockRequirementRows(unlock = {}, metaProgress = null) {
  return Object.entries(UNLOCK_PROGRESS_KEYS)
    .filter(([key]) => Number(unlock?.[key] || 0) > 0)
    .map(([key, config]) => {
      const target = Math.max(0, Number(unlock?.[key] || 0));
      const current = config.getCurrent(metaProgress);
      return {
        key,
        label: config.label,
        current,
        target,
        complete: current >= target,
      };
    });
}

function formatUnlockRequirementSummary(unlock = {}, metaProgress = null) {
  const rows = getUnlockRequirementRows(unlock, metaProgress);
  if (!rows.length) return 'Available from the start.';
  return rows.map((row) => `${row.label} ${Math.min(row.current, row.target)}/${row.target}`).join(' | ');
}

const MENU_LABELS = {
  home: 'Main Menu',
  load: 'Load Save',
  new: 'New Run',
  intel: 'Intel',
  tutorial: 'Tutorial',
  settings: 'Settings',
};

const CONFIGURABLE_RUN_FIELDS = [
  {
    key: 'playerMaxHP',
    label: 'Max HP',
    type: 'number',
    min: 20,
    max: 300,
    step: 1,
    placeholder: String(RUN_BASELINE.playerMaxHP),
    description: 'Override the base HP budget before class and difficulty modifiers apply.',
  },
  {
    key: 'startingGold',
    label: 'Starting Gold',
    type: 'number',
    min: 0,
    max: 9999,
    step: 1,
    placeholder: String(RUN_BASELINE.startingGold),
    description: 'Adjust opening gold for the run package.',
  },
  {
    key: 'playerMaxRAM',
    label: 'Max RAM',
    type: 'number',
    min: 1,
    max: 16,
    step: 1,
    placeholder: String(RUN_BASELINE.playerMaxRAM),
    description: 'Set the player RAM ceiling before relics and other run effects stack on top.',
  },
  {
    key: 'playerRamRegen',
    label: 'RAM / Turn',
    type: 'number',
    min: 0,
    max: 16,
    step: 1,
    placeholder: String(RUN_BASELINE.playerRamRegen),
    description: 'Adjust passive RAM regeneration each turn.',
  },
  {
    key: 'drawPerTurnDelta',
    label: 'Draw Delta',
    type: 'number',
    min: -5,
    max: 5,
    step: 1,
    placeholder: String(RUN_BASELINE.drawPerTurnDelta),
    description: 'Add or subtract cards drawn each turn.',
  },
  {
    key: 'enemyHpMult',
    label: 'Enemy HP x',
    type: 'number',
    min: 0.1,
    max: 5,
    step: 0.1,
    placeholder: String(RUN_BASELINE.enemyHpMult),
    description: 'Scale enemy health before the encounter begins.',
  },
  {
    key: 'enemyDmgMult',
    label: 'Enemy Dmg x',
    type: 'number',
    min: 0.1,
    max: 5,
    step: 0.1,
    placeholder: String(RUN_BASELINE.enemyDmgMult),
    description: 'Scale enemy outgoing damage.',
  },
  {
    key: 'enemyCount',
    label: 'Enemy Count',
    type: 'number',
    min: 1,
    max: 6,
    step: 1,
    placeholder: 'Auto',
    description: 'Force a specific enemy count when the encounter generator allows it.',
  },
  {
    key: 'actOverride',
    label: 'Act Override',
    type: 'select',
    options: [
      { value: '', label: 'Auto' },
      { value: 1, label: 'Act 1' },
      { value: 2, label: 'Act 2' },
      { value: 3, label: 'Act 3' },
      { value: 4, label: 'Act 4' },
      { value: 5, label: 'Act 5' },
      { value: 6, label: 'Act 6' },
      { value: 7, label: 'Act 7' },
    ],
    description: 'Force the run to start from a specific act lane.',
  },
  {
    key: 'encounterKind',
    label: 'Encounter Kind',
    type: 'select',
    options: [
      { value: '', label: 'Auto' },
      { value: 'normal', label: 'Normal' },
      { value: 'elite', label: 'Elite' },
      { value: 'boss', label: 'Boss' },
    ],
    description: 'Bias or lock the generated combat encounter type.',
  },
];

function mapLegacyMenuState(menuView = 'home', intelView = 'progress') {
  if (menuView === 'setup') {
    return { menuView: 'new', newRunView: 'standard', configureView: 'root', tutorialView: 'root', intelView: 'progress' };
  }
  if (menuView === 'daily') {
    return { menuView: 'new', newRunView: 'daily', configureView: 'root', tutorialView: 'root', intelView: 'progress' };
  }
  if (menuView === 'intel') {
    return { menuView: 'intel', newRunView: 'root', configureView: 'root', tutorialView: 'root', intelView: intelView || 'progress' };
  }
  if (menuView === 'tutorials') {
    return { menuView: 'tutorial', newRunView: 'root', configureView: 'root', tutorialView: 'root', intelView: 'progress' };
  }
  if (menuView === 'recovery') {
    return { menuView: 'load', newRunView: 'root', configureView: 'root', tutorialView: 'root', intelView: 'progress' };
  }
  if (menuView === 'settings') {
    return { menuView: 'settings', newRunView: 'root', configureView: 'root', tutorialView: 'root', intelView: 'progress' };
  }
  return { menuView: 'home', newRunView: 'root', configureView: 'root', tutorialView: 'root', intelView: 'progress' };
}

function isBeginnerTutorial(tutorial) {
  return tutorial?.title === 'Combat Basics' || tutorial?.title === 'Run Modes Briefing';
}

function getSeedSummary(debugSeed = '', seedMode = 'wild', randomizeDebugSeed = false) {
  const trimmed = String(debugSeed || '').trim();
  if (trimmed) return `Seed ${trimmed} (${seedMode})`;
  if (randomizeDebugSeed) return `Random ${seedMode} seed each launch`;
  return 'Auto seed at launch';
}

function formatCardDescription(cardDef = {}) {
  const effects = Array.isArray(cardDef.effects) ? cardDef.effects : [];
  const lines = effects.map((effect) => {
    if (effect?.op === 'RawText') return String(effect.text || '');
    if (effect?.op === 'DealDamage') return `Deal ${effect.amount ?? '?'} damage${effect.target === 'AllEnemies' ? ' to all enemies' : ''}.`;
    if (effect?.op === 'Heal') return `Heal ${effect.amount ?? '?'} HP.`;
    if (effect?.op === 'DrawCards') return `Draw ${effect.amount ?? '?'} cards.`;
    if (effect?.op === 'GainRAM') return `Gain ${effect.amount ?? '?'} RAM.`;
    if (effect?.op === 'ApplyStatus') return `Apply ${effect.statusId || 'status'} ${effect.stacks ?? '?'}.`;
    return effect?.op || '';
  }).filter(Boolean);
  return lines.join(' ') || 'No card text available.';
}

function buildLoadoutSlotKey(slot, index) {
  if (slot?.kind === 'random') return `random:${slot.poolId}:${index}`;
  return `card:${slot?.defId || 'unknown'}:${index}`;
}

function formatConfigFieldValue(field, value) {
  if (value == null || value === '') return 'Auto';
  if (field.type === 'select') {
    return field.options?.find((option) => option.value === value)?.label || String(value);
  }
  if (field.step && field.step < 1 && Number.isFinite(Number(value))) {
    return Number(value).toFixed(1);
  }
  return String(value);
}

function formatPercent(value = 0) {
  return `${Math.round(Math.max(0, Number(value || 0)) * 100)}%`;
}

function formatAverage(value = 0) {
  return Number(value || 0).toFixed(1);
}

function buildModeSummary(runConfig) {
  const summary = [];
  if (runConfig.playerMaxHP !== RUN_BASELINE.playerMaxHP) {
    summary.push(`${runConfig.playerMaxHP > RUN_BASELINE.playerMaxHP ? '+' : ''}${runConfig.playerMaxHP - RUN_BASELINE.playerMaxHP} max HP`);
  }
  if (runConfig.startingGold !== RUN_BASELINE.startingGold) {
    summary.push(`${runConfig.startingGold > RUN_BASELINE.startingGold ? '+' : ''}${runConfig.startingGold - RUN_BASELINE.startingGold} starting gold`);
  }
  if (runConfig.drawPerTurnDelta !== RUN_BASELINE.drawPerTurnDelta) {
    summary.push(`${runConfig.drawPerTurnDelta > 0 ? '+' : ''}${runConfig.drawPerTurnDelta} draw / turn`);
  }
  if (runConfig.enemyHpMult !== RUN_BASELINE.enemyHpMult) {
    summary.push(`${Math.round((runConfig.enemyHpMult - 1) * 100)}% enemy HP`);
  }
  if (runConfig.enemyDmgMult !== RUN_BASELINE.enemyDmgMult) {
    summary.push(`${Math.round((runConfig.enemyDmgMult - 1) * 100)}% enemy damage`);
  }
  return summary;
}

function makeSurface(accent, emphasis = 'default') {
  const backgrounds = {
    default: `
      linear-gradient(135deg, rgba(255,255,255,0.028) 0%, transparent 22%, transparent 76%, rgba(255,255,255,0.02) 100%),
      radial-gradient(circle at 12% 18%, ${accent}20 0%, transparent 32%),
      radial-gradient(circle at 88% 16%, rgba(255,255,255,0.04) 0%, transparent 16%),
      linear-gradient(160deg, rgba(10, 14, 24, 0.98) 0%, rgba(7, 9, 16, 0.98) 100%)
    `,
    bright: `
      linear-gradient(140deg, rgba(255,255,255,0.035) 0%, transparent 18%, transparent 82%, rgba(255,255,255,0.026) 100%),
      radial-gradient(circle at 18% 18%, ${accent}28 0%, transparent 34%),
      radial-gradient(circle at 82% 20%, rgba(255,255,255,0.06) 0%, transparent 18%),
      radial-gradient(circle at 76% 100%, ${accent}0e 0%, transparent 24%),
      linear-gradient(160deg, rgba(12, 18, 28, 0.98) 0%, rgba(6, 8, 14, 0.99) 100%)
    `,
    soft: `
      linear-gradient(135deg, rgba(255,255,255,0.022) 0%, transparent 22%, transparent 78%, rgba(255,255,255,0.016) 100%),
      radial-gradient(circle at 18% 18%, ${accent}16 0%, transparent 30%),
      linear-gradient(180deg, rgba(8, 10, 18, 0.96) 0%, rgba(6, 7, 13, 0.98) 100%)
    `,
  };

  return {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    border: `1px solid ${accent}2a`,
    background: backgrounds[emphasis] || backgrounds.default,
    boxShadow: `0 26px 54px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)`,
    backdropFilter: 'blur(10px)',
  };
}

function MainAction({
  accent,
  title,
  body,
  onClick,
  meta = '',
  status = '',
  solid = false,
  disabled = false,
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="panel-chrome"
      style={{
        width: '100%',
        borderRadius: 20,
        padding: '16px 16px 18px',
        border: `1px solid ${solid ? `${accent}00` : `${accent}36`}`,
        background: solid
          ? `linear-gradient(135deg, ${accent} 0%, ${accent}d4 70%, ${accent}b6 100%)`
          : `
            linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 22%, transparent 78%, rgba(255,255,255,0.018) 100%),
            radial-gradient(circle at 18% 18%, ${accent}18 0%, transparent 30%),
            linear-gradient(160deg, rgba(10, 14, 24, 0.98) 0%, rgba(7, 9, 16, 0.98) 100%)
          `,
        color: solid ? '#041015' : C.text,
        boxShadow: solid
          ? `0 22px 42px ${accent}32`
          : `0 18px 34px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)`,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        display: 'grid',
        gap: 10,
        opacity: disabled ? 0.58 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: solid ? '#08313c' : accent }}>
          {meta}
        </div>
        {status ? (
          <div
            style={{
              padding: '5px 8px',
              borderRadius: 999,
              border: `1px solid ${solid ? '#08313c33' : `${accent}32`}`,
              background: solid ? 'rgba(8,49,60,0.12)' : `${accent}12`,
              color: solid ? '#08313c' : accent,
              fontFamily: UI_MONO,
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {status}
          </div>
        ) : null}
      </div>

      <div style={{ fontFamily: DISPLAY_FONT, fontSize: 28, fontWeight: 700, letterSpacing: '0.04em', color: solid ? '#041015' : C.text }}>
        {title}
      </div>

      <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.65, color: solid ? '#08313c' : C.textDim }}>
        {body}
      </div>
    </button>
  );
}

function DataChip({ accent, children, selected = false }) {
  return (
    <div
      className="signal-chip"
      style={{
        padding: '8px 11px',
        borderRadius: 999,
        border: `1px solid ${selected ? `${accent}72` : `${accent}2c`}`,
        background: selected ? `linear-gradient(180deg, ${accent}1a 0%, rgba(8, 12, 18, 0.68) 100%)` : 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(8,12,18,0.5) 100%)',
        color: accent,
        fontFamily: UI_MONO,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

function SectionIntro({ accent, eyebrow, title, body }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.2em', color: accent, textTransform: 'uppercase' }}>
        {eyebrow}
      </div>
      {title ? (
        <div style={{ fontFamily: DISPLAY_FONT, fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '0.03em', lineHeight: 0.98 }}>
          {title}
        </div>
      ) : null}
      <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.7, color: C.textDim }}>
        {body}
      </div>
    </div>
  );
}

function StatTile({ accent, label, value }) {
  return (
    <div
      style={{
        padding: '12px 10px',
        borderRadius: 18,
        border: `1px solid ${accent === C.text ? C.border : `${accent}24`}`,
        background: accent === C.text ? 'rgba(255,255,255,0.03)' : `${accent}0f`,
        display: 'grid',
        gap: 4,
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.12em', color: C.textMuted }}>
        {label}
      </div>
      <div style={{ fontFamily: DISPLAY_FONT, fontSize: 28, fontWeight: 700, color: accent }}>
        {value}
      </div>
    </div>
  );
}

export default function MainMenuHub({
  ScreenShell,
  data = null,
  tutorialStep = null,
  initialMenuView = 'home',
  initialIntelView = 'progress',
  forcedMenuView = null,
  forcedIntelView = null,
  onBlockedNavigation = null,
  canContinue = false,
  onContinue,
  onImportSave,
  onStartTutorial,
  onStartDailyRun,
  onNewGame,
  onSettings,
  debugSaveSlots = {},
  debugSaveSlotIds = [],
  onLoadDebugSave,
  tutorialCatalog = [],
  completedTutorialIds = [],
  metaProgress = null,
  runAnalytics = null,
  recentUnlocks = [],
  achievements = [],
  dailyRunConfig = null,
  dailyRunRecord = null,
  recentDailyRecords = [],
  callsignCatalog = [],
  unlockedCallsignIds = [],
  selectedCallsignId = null,
  onSelectCallsign,
  starterProfiles = [],
  unlockedStarterProfileIds = [],
  selectedStarterProfileId = 'kernel',
  onSelectStarterProfile,
  difficultyProfiles = [],
  unlockedDifficultyIds = [],
  selectedDifficultyId = 'standard',
  onSelectDifficulty,
  challengeModes = [],
  unlockedChallengeIds = [],
  selectedChallengeIds = [],
  onToggleChallenge,
  debugSeed = '',
  onDebugSeedChange,
  seedMode = 'wild',
  onSeedModeChange,
  randomizeDebugSeed = false,
  onRandomizeDebugSeed,
  onRandomizeSeed,
  onRandomizeSensibleSeed,
  customConfig = {},
  onSetCustomField,
  onClearCustomConfig,
}) {
  const initialPath = mapLegacyMenuState(initialMenuView, initialIntelView);
  const forcedPath = forcedMenuView != null || forcedIntelView != null
    ? mapLegacyMenuState(forcedMenuView ?? initialMenuView, forcedIntelView ?? initialIntelView)
    : null;

  const [menuView, setMenuView] = useState(initialPath.menuView);
  const [newRunView, setNewRunView] = useState(initialPath.newRunView);
  const [configureView, setConfigureView] = useState(initialPath.configureView);
  const [tutorialView, setTutorialView] = useState(initialPath.tutorialView);
  const [intelView, setIntelView] = useState(initialPath.intelView);

  const activeMenuView = forcedPath?.menuView ?? menuView;
  const activeNewRunView = forcedPath?.newRunView ?? newRunView;
  const activeConfigureView = forcedPath?.configureView ?? configureView;
  const activeTutorialView = forcedPath?.tutorialView ?? tutorialView;
  const activeIntelView = forcedPath?.intelView ?? intelView;
  const completedSet = new Set(completedTutorialIds);
  const unlockedStarterSet = new Set(unlockedStarterProfileIds);
  const unlockedDifficultySet = new Set(unlockedDifficultyIds);
  const unlockedChallengeSet = new Set(unlockedChallengeIds);
  const unlockedCallsignSet = new Set(unlockedCallsignIds);
  const selectedChallenges = new Set(selectedChallengeIds);
  const unlockedRewardState = getUnlockedAchievementRewardState(metaProgress?.achievementIdsUnlocked || []);
  const narrativeMode = activeMenuView === 'intel'
    ? activeIntelView
    : activeMenuView === 'new'
      ? (activeNewRunView === 'daily' ? 'daily' : 'setup')
      : activeMenuView;

  const callsignId = selectedCallsignId || getDefaultCallsignId();
  const activeCallsign = callsignCatalog.find((theme) => theme.id === callsignId) || getCallsignTheme(callsignId);
  const selectedProfile = starterProfiles.find((profile) => profile.id === selectedStarterProfileId) || starterProfiles[0] || null;
  const selectedDifficulty = difficultyProfiles.find((difficulty) => difficulty.id === selectedDifficultyId) || difficultyProfiles[0] || null;
  const selectedRunConfig = composeRunConfig(customConfig || {}, selectedStarterProfileId, selectedDifficultyId, selectedChallengeIds);
  const selectedModeSummary = buildModeSummary(selectedRunConfig);
  const fixerLine = getFixerLine({
    mode: narrativeMode,
    metaProgress,
    runAnalytics,
  });

  const selectedProfileAccent = selectedProfile?.accent || C.orange;
  const selectedDifficultyAccent = selectedDifficulty?.accent || C.purple;
  const activeCallsignAccent = activeCallsign?.accent || C.cyan;

  const activeChallengeList = challengeModes.filter((challenge) => selectedChallenges.has(challenge.id));
  const activeChallengeSummary = activeChallengeList.length
    ? activeChallengeList.map((challenge) => challenge.name).join(', ')
    : 'No optional challenges active.';
  const unlockProgressRows = [
    ...starterProfiles
      .filter((profile) => !unlockedStarterSet.has(profile.id))
      .map((profile) => ({
        id: `starter:${profile.id}`,
        name: profile.name,
        category: 'Starter Profile',
        accent: profile.accent || C.cyan,
        description: profile.unlockHint,
        progress: formatUnlockRequirementSummary(profile.unlock, metaProgress),
      })),
    ...difficultyProfiles
      .filter((difficulty) => !unlockedDifficultySet.has(difficulty.id))
      .map((difficulty) => ({
        id: `difficulty:${difficulty.id}`,
        name: difficulty.name,
        category: 'Difficulty',
        accent: difficulty.accent || C.purple,
        description: difficulty.unlockHint,
        progress: formatUnlockRequirementSummary(difficulty.unlock, metaProgress),
      })),
    ...challengeModes
      .filter((challenge) => !unlockedChallengeSet.has(challenge.id))
      .map((challenge) => ({
        id: `challenge:${challenge.id}`,
        name: challenge.name,
        category: 'Challenge',
        accent: challenge.accent || C.orange,
        description: challenge.unlockHint,
        progress: formatUnlockRequirementSummary(challenge.unlock, metaProgress),
      })),
  ];

  const selectedProfileRelics = (selectedProfile?.startingRelicIds || []).map((relicId) => data?.relics?.[relicId]?.name || relicId);
  const selectedProfileLoadoutSlots = getStarterProfileLoadoutSlots(selectedProfile);
  const selectedProfileDeckSize = getStarterProfileDeckSize(selectedProfile);
  const loadoutPreviewEntries = selectedProfileLoadoutSlots.map((slot, index) => {
    const key = buildLoadoutSlotKey(slot, index);
    if (slot?.kind === 'random') {
      const pool = getStarterLoadoutPool(slot.poolId);
      const candidateIds = getStarterLoadoutPoolCandidates(data, slot.poolId, slot.excludeIds || []);
      const candidateNames = candidateIds.map((cardId) => data?.cards?.[cardId]?.name || cardId);
      return {
        key,
        kind: 'random',
        accent: slot.accent || pool?.accent || C.orange,
        title: slot.label || pool?.name || 'Random Slot',
        summary: `${candidateNames.length || 0} candidate${candidateNames.length === 1 ? '' : 's'}`,
        body: slot.description || pool?.description || 'Resolves at run start.',
        candidateNames,
        candidateIds,
        poolName: pool?.name || slot.poolId || 'Random pool',
      };
    }
    const cardDef = data?.cards?.[slot?.defId] || null;
    const accent = getCardColor(cardDef?.type);
    return {
      key,
      kind: 'card',
      accent,
      cardId: slot?.defId,
      cardDef,
      title: cardDef?.name || slot?.defId || 'Unknown card',
      summary: `${cardDef?.type || 'Card'}${cardDef?.costRAM != null ? ` • ${cardDef.costRAM} RAM` : ''}`,
      body: formatCardDescription(cardDef),
      tags: cardDef?.tags || EMPTY_ARRAY,
    };
  });
  const selectedProfileDeckNames = loadoutPreviewEntries.map((entry) => entry.title);

  const featuredTutorial = tutorialCatalog.find((tutorial) => tutorial.recommended && !completedSet.has(tutorial.id)) || tutorialCatalog[0] || null;
  const beginnerTutorials = tutorialCatalog.filter((tutorial) => isBeginnerTutorial(tutorial));
  const advancedTutorials = tutorialCatalog.filter((tutorial) => !isBeginnerTutorial(tutorial));
  const availableDebugSlots = debugSaveSlotIds
    .map((slotId, index) => ({ slotId, index, slot: debugSaveSlots?.[slotId] }))
    .filter((entry) => entry.slot);
  const hasRecovery = availableDebugSlots.length > 0;

  const recentUnlockLabels = recentUnlocks.map((unlock) => unlock?.name).filter(Boolean);
  const achievementUnlockCount = achievements.filter((achievement) => unlockedRewardState.unlockedAchievementIds.includes(achievement.id)).length;
  const callsignUnlockCount = callsignCatalog.filter((theme) => unlockedCallsignSet.has(theme.id)).length;
  const currentSeedSummary = getSeedSummary(debugSeed, seedMode, randomizeDebugSeed);
  const activeOverrideFields = CONFIGURABLE_RUN_FIELDS.filter(({ key }) => customConfig?.[key] != null && customConfig[key] !== '');
  const activeOverrideSummary = activeOverrideFields.length
    ? activeOverrideFields.map((field) => `${field.label}: ${formatConfigFieldValue(field, customConfig[field.key])}`).join(' | ')
    : 'No direct overrides active.';
  const [selectedLoadoutSlotKey, setSelectedLoadoutSlotKey] = useState(loadoutPreviewEntries[0]?.key || null);
  const activeLoadoutEntry = loadoutPreviewEntries.find((entry) => entry.key === selectedLoadoutSlotKey) || loadoutPreviewEntries[0] || null;

  const bossArchiveEntries = data ? getBossArchiveEntries(data, metaProgress, 6) : [];
  const totalBossCount = Object.values(data?.encounters || {}).filter((encounter) => encounter?.kind === 'boss').length;
  const seenBossCount = metaProgress?.bossEncounterIdsSeen?.length ?? 0;
  const defeatedBossCount = metaProgress?.bossEncounterIdsDefeated?.length ?? 0;

  const panelStyle = (accent, emphasis = 'default', padding = '18px') => ({
    ...makeSurface(accent, emphasis),
    padding,
  });
  const tutorialMenuActive = tutorialStep?.mode === 'MainMenu';
  const tutorialPaneLabel = activeMenuView === 'intel'
    ? `Intel / ${activeIntelView === 'root' ? 'Index' : activeIntelView}`
    : activeMenuView === 'new'
      ? `New Run / ${activeNewRunView === 'configure' ? `Configure / ${activeConfigureView}` : activeNewRunView}`
      : MENU_LABELS[activeMenuView] || 'Main Menu';

  const pillButtonStyle = (accent, active = false, disabled = false) => ({
    appearance: 'none',
    borderRadius: 999,
    padding: '10px 12px',
    border: `1px solid ${active ? `${accent}84` : `${accent}24`}`,
    background: active ? `${accent}16` : 'rgba(255,255,255,0.03)',
    color: disabled ? C.textDim : active ? accent : C.text,
    fontFamily: UI_MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: disabled ? 'default' : 'pointer',
    whiteSpace: 'nowrap',
  });

  const ghostButtonStyle = {
    appearance: 'none',
    borderRadius: 999,
    padding: '10px 12px',
    border: `1px solid ${C.border}`,
    background: 'rgba(255,255,255,0.04)',
    color: C.text,
    fontFamily: UI_MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  };

  useEffect(() => {
    if (forcedPath) return;
    const nextPath = mapLegacyMenuState(initialMenuView, initialIntelView);
    setMenuView(nextPath.menuView);
    setNewRunView(nextPath.newRunView);
    setConfigureView(nextPath.configureView);
    setTutorialView(nextPath.tutorialView);
    setIntelView(nextPath.intelView);
  }, [forcedPath, initialMenuView, initialIntelView]);

  useEffect(() => {
    if (loadoutPreviewEntries.some((entry) => entry.key === selectedLoadoutSlotKey)) return;
    setSelectedLoadoutSlotKey(loadoutPreviewEntries[0]?.key || null);
  }, [loadoutPreviewEntries, selectedLoadoutSlotKey]);

  useEffect(() => {
    setSelectedLoadoutSlotKey(loadoutPreviewEntries[0]?.key || null);
  }, [selectedProfile?.id]);

  useEffect(() => {
    if (!fixerLine) return;
    sfx.fixerPing();
  }, [fixerLine]);

  const handleMenuViewChange = (nextView) => {
    if (forcedPath && nextView !== forcedPath.menuView) {
      onBlockedNavigation?.();
      return;
    }
    if (nextView === 'intel') sfx.archiveOpen();
    else sfx.menuOpen();
    setMenuView(nextView);
  };

  const handleIntelViewChange = (nextView) => {
    if (forcedPath && (forcedPath.menuView !== 'intel' || forcedPath.intelView !== nextView)) {
      onBlockedNavigation?.();
      return;
    }
    sfx.archiveOpen();
    setMenuView('intel');
    setIntelView(nextView);
  };

  const handleNewRunViewChange = (nextView) => {
    if (forcedPath && (forcedPath.menuView !== 'new' || forcedPath.newRunView !== nextView)) {
      onBlockedNavigation?.();
      return;
    }
    if (nextView === 'standard' || nextView === 'daily') sfx.runStart();
    else sfx.menuOpen();
    setMenuView('new');
    setNewRunView(nextView);
  };

  const handleConfigureViewChange = (nextView) => {
    if (forcedPath && (forcedPath.menuView !== 'new' || forcedPath.newRunView !== 'configure' || forcedPath.configureView !== nextView)) {
      onBlockedNavigation?.();
      return;
    }
    setMenuView('new');
    setNewRunView('configure');
    setConfigureView(nextView);
  };

  const handleTutorialViewChange = (nextView) => {
    if (forcedPath && (forcedPath.menuView !== 'tutorial' || forcedPath.tutorialView !== nextView)) {
      onBlockedNavigation?.();
      return;
    }
    setMenuView('tutorial');
    setTutorialView(nextView);
  };

  const handleBack = () => {
    if (activeMenuView === 'new') {
      if (activeNewRunView === 'configure' && activeConfigureView !== 'root') {
        handleConfigureViewChange('root');
        return;
      }
      if (activeNewRunView !== 'root') {
        handleNewRunViewChange('root');
        return;
      }
    }
    if (activeMenuView === 'intel' && activeIntelView !== 'root') {
      handleIntelViewChange('root');
      return;
    }
    if (activeMenuView === 'tutorial' && activeTutorialView !== 'root') {
      handleTutorialViewChange('root');
      return;
    }
    handleMenuViewChange('home');
  };

  const activeHeaderMeta = (() => {
    if (activeMenuView === 'home') {
      return {
        eyebrow: 'MAIN MENU',
        title: 'Ops Console',
        body: 'Only the five top-level doors stay visible on launch. Every detailed system is one deliberate click deeper now.',
        accent: C.cyan,
      };
    }
    if (activeMenuView === 'load') {
      return {
        eyebrow: 'LOAD SAVE',
        title: 'Resume Or Recover',
        body: 'Autosaves, save import, and recovery tools are tucked behind one parent menu.',
        accent: C.green,
      };
    }
    if (activeMenuView === 'new' && activeNewRunView === 'standard') {
      return {
        eyebrow: 'STANDARD RUN',
        title: 'Choose A Loadout',
        body: 'This leaf is now just player/loadout selection plus the live seed snapshot. Modifier editing stays under Configure Run.',
        accent: selectedProfileAccent,
      };
    }
    if (activeMenuView === 'new' && activeNewRunView === 'daily') {
      return {
        eyebrow: 'DAILY RUN',
        title: 'Shared Breach',
        body: 'Shared seed, shared loadout, shared challenge. Records stay in this lane.',
        accent: C.cyan,
      };
    }
    if (activeMenuView === 'new' && activeNewRunView === 'configure' && activeConfigureView === 'seed') {
      return {
        eyebrow: 'CONFIGURE RUN',
        title: 'Seed Controls',
        body: 'This is where the seed editor lives now instead of cluttering the first launch surface.',
        accent: C.cyan,
      };
    }
    if (activeMenuView === 'new' && activeNewRunView === 'configure' && activeConfigureView === 'modifiers') {
      return {
        eyebrow: 'CONFIGURE RUN',
        title: 'Modifiers',
        body: 'Difficulty, challenge modes, and every editable run override live together here instead of leaking into the launch surface.',
        accent: C.purple,
      };
    }
    if (activeMenuView === 'new') {
      return {
        eyebrow: 'NEW RUN',
        title: 'Choose A Run Lane',
        body: 'Start a standard run, jump into the daily, or open the deeper configuration surfaces.',
        accent: C.yellow,
      };
    }
    if (activeMenuView === 'intel') {
      return {
        eyebrow: 'INTEL',
        title: activeIntelView === 'root' ? 'Archive Index' : `${activeIntelView[0].toUpperCase()}${activeIntelView.slice(1)} Archive`,
        body: activeIntelView === 'root' ? 'Archive categories stay hidden until you open them.' : 'This archive page only appears after you choose its category.',
        accent: activeIntelView === 'bosses' ? C.red : activeIntelView === 'callsigns' ? activeCallsignAccent : C.green,
      };
    }
    if (activeMenuView === 'tutorial') {
      return {
        eyebrow: 'TUTORIAL',
        title: activeTutorialView === 'beginner' ? 'Beginner Mechanics' : activeTutorialView === 'advanced' ? 'Advanced Mechanics' : 'Training Index',
        body: activeTutorialView === 'root' ? 'Lessons are now split into beginner and advanced lanes.' : 'Tutorial modules only appear after you choose the lane they belong to.',
        accent: activeTutorialView === 'advanced' ? C.purple : C.cyan,
      };
    }
    return {
      eyebrow: 'SETTINGS',
      title: 'Control Room',
      body: 'The settings panel still exists, but it is now hidden behind one clean parent option.',
      accent: C.purple,
    };
  })();

  const renderHeader = () => {
    const meta = activeHeaderMeta;
    return (
      <div className="panel-chrome" style={{ ...panelStyle(meta.accent, 'bright', '22px'), display: 'grid', gap: 18 }}>
        <div
          style={{
            position: 'absolute',
            inset: 'auto -80px -80px auto',
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: `${meta.accent}12`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
            gap: 18,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.24em', color: meta.accent, textTransform: 'uppercase' }}>
              {meta.eyebrow}
            </div>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 52, fontWeight: 700, lineHeight: 0.92, letterSpacing: '0.03em', color: C.text, textShadow: `0 0 24px ${meta.accent}18` }}>
              {meta.title}
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 13, lineHeight: 1.75, color: C.textDim, maxWidth: 640 }}>
              {meta.body}
            </div>
          </div>

          <div className="panel-chrome" style={{ ...panelStyle(activeCallsignAccent, 'soft', '16px'), display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.16em', color: activeCallsignAccent }}>
                ACTIVE CALLSIGN
              </div>
              {activeMenuView !== 'home' ? (
                <button onClick={handleBack} style={ghostButtonStyle}>
                  Back
                </button>
              ) : null}
            </div>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 28, fontWeight: 700, color: C.text }}>
              {activeCallsign?.name || 'Kernel Runner'}
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
              {currentSeedSummary}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <DataChip accent={selectedProfileAccent}>{selectedProfile?.name || 'No starter'}</DataChip>
              <DataChip accent={selectedDifficultyAccent}>{selectedDifficulty?.name || 'Standard'}</DataChip>
              {activeChallengeList.length > 0 ? (
                <DataChip accent={C.purple}>{activeChallengeList.length} challenge{activeChallengeList.length === 1 ? '' : 's'}</DataChip>
              ) : null}
            </div>
          </div>
        </div>
        {tutorialMenuActive ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 16,
              border: `1px solid ${meta.accent}32`,
              background: `${meta.accent}10`,
              fontFamily: UI_MONO,
              fontSize: 11,
              lineHeight: 1.5,
              color: C.textDim,
            }}
          >
            <span style={{ color: meta.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Briefing focus</span>
            <span style={{ color: C.text }}>{tutorialPaneLabel}</span>
          </div>
        ) : null}
      </div>
    );
  };

  const renderProfilePreview = () => {
    if (!selectedProfile) return null;

    return (
      <div style={{ ...panelStyle(selectedProfileAccent, 'default', '18px'), display: 'grid', gap: 16 }}>
        <SectionIntro
          accent={selectedProfileAccent}
          eyebrow="ACTIVE LOADOUT"
          title={selectedProfile.name}
          body={selectedProfile.description}
        />

        {selectedProfile.identityTags?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selectedProfile.identityTags.map((tag) => (
              <DataChip key={tag} accent={selectedProfileAccent}>
                {tag}
              </DataChip>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
              STARTING RELICS
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
              {selectedProfileRelics.join(', ') || 'No starting relic'}
            </div>
          </div>

          <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
              RUN MODIFIERS
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
              {selectedModeSummary.join(' | ') || 'Standard baseline'}
            </div>
          </div>

          <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
              LOADOUT SIZE
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
              {selectedProfileDeckSize} cards, including {loadoutPreviewEntries.filter((entry) => entry.kind === 'random').length} random slot{loadoutPreviewEntries.filter((entry) => entry.kind === 'random').length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
            LOADOUT CARDS
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(82px, 1fr))', gap: 10 }}>
            {loadoutPreviewEntries.map((entry) => {
              const selected = activeLoadoutEntry?.key === entry.key;
              return (
                <button
                  key={entry.key}
                  onClick={() => setSelectedLoadoutSlotKey(entry.key)}
                  style={{
                    appearance: 'none',
                    display: 'grid',
                    gap: 6,
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  {entry.kind === 'card' && entry.cardDef ? (
                    <RuntimeArt
                      src={getCardImage(entry.cardId)}
                      alt={entry.title}
                      accent={entry.accent}
                      label={entry.title}
                      style={{
                        width: '100%',
                        aspectRatio: '0.72',
                        borderRadius: 14,
                        overflow: 'hidden',
                        border: `2px solid ${selected ? `${entry.accent}88` : `${entry.accent}24`}`,
                        background: C.bgCard,
                        boxShadow: selected ? `0 0 20px ${entry.accent}26` : 'none',
                        display: 'block',
                      }}
                      imageStyle={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: 'saturate(1.03) contrast(1.02) brightness(0.94)',
                      }}
                      fallbackStyle={{
                        borderRadius: 14,
                        border: `2px solid ${selected ? `${entry.accent}88` : `${entry.accent}24`}`,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '0.72',
                        borderRadius: 14,
                        border: `2px solid ${selected ? `${entry.accent}88` : `${entry.accent}24`}`,
                        background: `linear-gradient(145deg, ${entry.accent}14 0%, ${C.bgCard} 56%, rgba(8,10,16,0.98) 100%)`,
                        boxShadow: selected ? `0 0 20px ${entry.accent}26` : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        color: entry.accent,
                      }}
                    >
                      <div style={{ fontFamily: DISPLAY_FONT, fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
                        ?
                      </div>
                      <div style={{ fontFamily: UI_MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', padding: '0 6px' }}>
                        {entry.poolName}
                      </div>
                    </div>
                  )}
                  <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.45, color: selected ? entry.accent : C.text }}>
                    {entry.title}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ ...panelStyle(activeLoadoutEntry?.accent || selectedProfileAccent, 'soft', '16px'), display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: 700, color: activeLoadoutEntry?.accent || selectedProfileAccent }}>
                {activeLoadoutEntry?.title || 'Loadout slot'}
              </div>
              <DataChip accent={activeLoadoutEntry?.accent || selectedProfileAccent} selected>
                {activeLoadoutEntry?.summary || 'Preview'}
              </DataChip>
            </div>

            <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.65, color: C.text }}>
              {activeLoadoutEntry?.body || 'Select a loadout card to inspect it.'}
            </div>

            {activeLoadoutEntry?.kind === 'card' && activeLoadoutEntry.cardDef ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <DataChip accent={activeLoadoutEntry.accent}>{activeLoadoutEntry.cardDef.type || 'Card'}</DataChip>
                  {activeLoadoutEntry.cardDef.costRAM != null ? <DataChip accent={C.cyan}>{activeLoadoutEntry.cardDef.costRAM} RAM</DataChip> : null}
                  {(activeLoadoutEntry.tags || []).map((tag) => (
                    <DataChip key={tag} accent={activeLoadoutEntry.accent}>{tag}</DataChip>
                  ))}
                </div>
              </>
            ) : activeLoadoutEntry?.kind === 'random' ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <DataChip accent={activeLoadoutEntry.accent}>{activeLoadoutEntry.poolName}</DataChip>
                  <DataChip accent={C.cyan}>{activeLoadoutEntry.candidateIds?.length || 0} candidates</DataChip>
                </div>
                <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.65, color: C.textDim }}>
                  Possible cards: {activeLoadoutEntry.candidateNames?.join(', ') || 'No candidates available in the current data build.'}
                </div>
              </>
            ) : null}
          </div>

          <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
            Full loadout: {selectedProfileDeckNames.join(', ')}
          </div>
        </div>
      </div>
    );
  };

  const renderLoadView = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ ...panelStyle(C.green, 'default', '18px'), display: 'grid', gap: 14 }}>
        <SectionIntro
          accent={C.green}
          eyebrow="LOAD SAVE"
          title="Recovery Paths"
          body="Resume the last autosaved game, import a compatible save file, or dip into buried recovery slots if you need them."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <MainAction
            accent={C.green}
            title="Continue Last Game"
            body={canContinue ? 'Return to the latest autosaved run immediately.' : 'No compatible autosave is currently available.'}
            onClick={onContinue}
            meta="Resume"
            status={canContinue ? 'Ready' : 'Empty'}
            solid
            disabled={!canContinue}
          />
          <MainAction
            accent={C.cyan}
            title="Import Save File"
            body={onImportSave ? 'Load a compatible save snapshot from disk.' : 'Import hooks are not wired yet, but the slot is now correctly buried here.'}
            onClick={onImportSave}
            meta="Import"
            status={onImportSave ? 'File' : 'Unavailable'}
            disabled={!onImportSave}
          />
        </div>
      </div>

      {hasRecovery ? (
        <div style={{ ...panelStyle(C.orange, 'soft', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={C.orange}
            eyebrow="RECOVERY SLOTS"
            title="Internal Snapshots"
            body="These stay out of the first impression, but they are still available once you deliberately open Load Save."
          />
          <div style={{ display: 'grid', gap: 12 }}>
            {availableDebugSlots.map(({ slotId, index, slot }) => (
              <MainAction
                key={slotId}
                accent={C.orange}
                title={`Slot ${index + 1}`}
                body={slot.label}
                onClick={() => onLoadDebugSave?.(slotId)}
                meta="Recovery"
                status="Debug"
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderHomeView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
      <MainAction accent={C.green} title="Load Save" body="Continue the last autosave, import a run snapshot, or open buried recovery tools." onClick={() => handleMenuViewChange('load')} meta="Menu" status={canContinue ? 'Autosave' : 'No save'} />
      <MainAction accent={C.yellow} title="New Run" body="Standard runs, daily runs, and deeper configuration now branch from here." onClick={() => handleNewRunViewChange('root')} meta="Menu" status={selectedProfile?.name || 'Ready'} solid />
      <MainAction accent={C.green} title="Intel" body="Relics, cards, enemies, minigames, bosses, and progression live in the archive." onClick={() => { handleIntelViewChange('root'); handleMenuViewChange('intel'); }} meta="Menu" status={`${recentUnlockLabels.length || 0} recent`} />
      <MainAction accent={C.cyan} title="Tutorial" body="Beginner and advanced lessons are split so you only see the lane you asked for." onClick={() => { handleTutorialViewChange('root'); handleMenuViewChange('tutorial'); }} meta="Menu" status={`${tutorialCatalog.length} modules`} />
      <MainAction accent={C.purple} title="Settings" body="Open the existing settings and utility controls without polluting the front page." onClick={() => handleMenuViewChange('settings')} meta="Menu" status="Control room" />
    </div>
  );

  const renderNewRunRootView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
      <MainAction accent={selectedProfileAccent} title="Standard Run" body="Choose a class/loadout, preview the package, and launch it." onClick={() => handleNewRunViewChange('standard')} meta="Run" status={selectedProfile?.name || 'Ready'} solid />
      <MainAction accent={C.cyan} title="Daily Run" body="Shared seed, shared modifiers, and a comparable run package for everyone." onClick={() => handleNewRunViewChange('daily')} meta="Shared" status={dailyRunConfig?.id || 'Offline'} />
      <MainAction accent={C.orange} title="Configure Run" body="Seed controls and modifier tuning live one layer deeper so they stay out of the launch flow." onClick={() => handleConfigureViewChange('root')} meta="Advanced" status={selectedChallenges.size > 0 ? `${selectedChallenges.size} mods` : 'Baseline'} />
    </div>
  );

  const renderConfigureRootView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
      <MainAction accent={C.cyan} title="Seed" body="Explicit seed entry, seed mode, and randomize-on-launch controls." onClick={() => handleConfigureViewChange('seed')} meta="Config" status={currentSeedSummary} />
      <MainAction accent={C.purple} title="Modifiers" body="Difficulty, challenges, and the run modifiers the player can actually edit." onClick={() => handleConfigureViewChange('modifiers')} meta="Config" status={selectedModeSummary.length ? `${selectedModeSummary.length} active` : 'Baseline'} />
    </div>
  );

  const renderSeedConfigView = () => (
    <div style={{ ...panelStyle(C.cyan, 'default', '18px'), display: 'grid', gap: 14 }}>
      <SectionIntro accent={C.cyan} eyebrow="SEED" title="Determinism Controls" body="This is where the seed editor lives now instead of cluttering the first launch surface." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => onSeedModeChange?.('wild')} style={pillButtonStyle(C.cyan, seedMode === 'wild')}>Wild</button>
        <button onClick={() => onSeedModeChange?.('sensible')} style={pillButtonStyle(C.green, seedMode === 'sensible')}>Sensible</button>
        <button onClick={() => onRandomizeDebugSeed?.(!randomizeDebugSeed)} style={pillButtonStyle(C.yellow, randomizeDebugSeed)}>Randomize Each Run</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <label style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 8 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
            OVERRIDE SEED
          </div>
          <input
            type="text"
            value={debugSeed || ''}
            onChange={(event) => onDebugSeedChange?.(event.target.value)}
            placeholder="Leave blank for auto"
            style={{
              width: '100%',
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.04)',
              color: C.text,
              padding: '12px 14px',
              fontFamily: UI_MONO,
              fontSize: 13,
              outline: 'none',
            }}
          />
          <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
            Current: {currentSeedSummary}
          </div>
        </label>
        <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 10 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
            GENERATE
          </div>
          <MainAction accent={C.cyan} title="Random Wild Seed" body="Generate a fresh numeric seed using the wild decoder." onClick={onRandomizeSeed} meta="Seed" status="Wild" />
          <MainAction accent={C.green} title="Random Sensible Seed" body="Generate a fresh numeric seed using the sensible decoder." onClick={onRandomizeSensibleSeed} meta="Seed" status="Sensible" />
        </div>
      </div>
    </div>
  );

  const renderStarterProfilePanel = () => (
    <div style={{ ...panelStyle(C.orange, 'default', '18px'), display: 'grid', gap: 14 }}>
      <SectionIntro
        accent={C.orange}
        eyebrow="STARTER PROFILES"
        title="Select A Runner"
        body="Standard Run is now the clean loadout leaf. Pick the class, check the package, and launch."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {starterProfiles.map((profile) => {
          const locked = !unlockedStarterSet.has(profile.id);
          const selected = profile.id === selectedStarterProfileId;
          return (
            <button
              key={profile.id}
              onClick={() => !locked && onSelectStarterProfile?.(profile.id)}
              style={{
                appearance: 'none',
                ...panelStyle(profile.accent || C.orange, selected ? 'bright' : 'soft', '14px'),
                display: 'grid',
                gap: 8,
                opacity: locked ? 0.58 : 1,
                cursor: locked ? 'default' : 'pointer',
                textAlign: 'left',
              }}
              title={locked ? profile.unlockHint : profile.description}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: 700, color: profile.accent || C.orange }}>
                  {profile.name}
                </div>
                <DataChip accent={profile.accent || C.orange} selected={selected}>
                  {locked ? 'Locked' : selected ? 'Selected' : 'Ready'}
                </DataChip>
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
                {profile.description}
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: locked ? C.textDim : C.text }}>
                {locked ? profile.unlockHint : `Starts with ${profile.startingRelicIds?.length || 0} relic and ${getStarterProfileDeckSize(profile)} cards.`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderDifficultyPanel = () => (
    <div style={{ ...panelStyle(selectedDifficultyAccent, 'default', '18px'), display: 'grid', gap: 12 }}>
      <SectionIntro
        accent={selectedDifficultyAccent}
        eyebrow="DIFFICULTY"
        title={selectedDifficulty?.name || 'Standard'}
        body={selectedDifficulty?.description || 'Standard baseline run.'}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {difficultyProfiles.map((difficulty) => {
          const locked = !unlockedDifficultySet.has(difficulty.id);
          const selected = difficulty.id === selectedDifficultyId;
          return (
            <button
              key={difficulty.id}
              onClick={() => !locked && onSelectDifficulty?.(difficulty.id)}
              style={pillButtonStyle(difficulty.accent || C.purple, selected, locked)}
              title={locked ? difficulty.unlockHint : difficulty.description}
            >
              {difficulty.name}
            </button>
          );
        })}
      </div>

      <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
        <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
          MODE SUMMARY
        </div>
        <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
          {selectedModeSummary.join(' | ') || 'Standard baseline'}
        </div>
      </div>
    </div>
  );

  const renderChallengePanel = () => (
    <div style={{ ...panelStyle(C.purple, 'default', '18px'), display: 'grid', gap: 12 }}>
      <SectionIntro
        accent={C.purple}
        eyebrow="CHALLENGES"
        title="Optional Variants"
        body="Only the challenge list and other editable modifiers live here now."
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {challengeModes.map((challenge) => {
          const locked = !unlockedChallengeSet.has(challenge.id);
          const selected = selectedChallenges.has(challenge.id);
          return (
            <button
              key={challenge.id}
              onClick={() => !locked && onToggleChallenge?.(challenge.id)}
              style={pillButtonStyle(challenge.accent || C.purple, selected, locked)}
              title={locked ? challenge.unlockHint : challenge.description}
            >
              {challenge.name}
            </button>
          );
        })}
      </div>

      <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
        <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
          ACTIVE STACK
        </div>
        <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
          {activeChallengeSummary}
        </div>
      </div>
    </div>
  );

  const renderDirectOverridePanel = () => (
    <div style={{ ...panelStyle(C.cyan, 'default', '18px'), display: 'grid', gap: 14 }}>
      <SectionIntro
        accent={C.cyan}
        eyebrow="DIRECT OVERRIDES"
        title="Editable Run Fields"
        body="These are the concrete fields the player can modify without opening the AI tooling."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {CONFIGURABLE_RUN_FIELDS.map((field) => {
          const value = customConfig?.[field.key] ?? '';
          const active = value !== '' && value != null;
          return (
            <label
              key={field.key}
              style={{
                ...panelStyle(active ? C.cyan : C.border, active ? 'soft' : 'default', '14px'),
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: active ? C.cyan : C.textMuted }}>
                  {field.label.toUpperCase()}
                </div>
                <DataChip accent={active ? C.cyan : C.textMuted} selected={active}>
                  {active ? 'Active' : 'Auto'}
                </DataChip>
              </div>
              {field.type === 'select' ? (
                <select
                  value={value}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    if (rawValue === '') {
                      onSetCustomField?.(field.key, null);
                      return;
                    }
                    const numericValue = Number(rawValue);
                    onSetCustomField?.(field.key, Number.isNaN(numericValue) ? rawValue : numericValue);
                  }}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: `1px solid ${active ? `${C.cyan}38` : C.border}`,
                    background: 'rgba(255,255,255,0.04)',
                    color: C.text,
                    padding: '11px 12px',
                    fontFamily: UI_MONO,
                    fontSize: 12,
                    outline: 'none',
                  }}
                >
                  {field.options.map((option) => (
                    <option key={`${field.key}-${option.label}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={value}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    if (rawValue === '') {
                      onSetCustomField?.(field.key, null);
                      return;
                    }
                    const nextValue = field.step && field.step < 1 ? Number.parseFloat(rawValue) : Number.parseInt(rawValue, 10);
                    onSetCustomField?.(field.key, Number.isNaN(nextValue) ? null : nextValue);
                  }}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: `1px solid ${active ? `${C.cyan}38` : C.border}`,
                    background: 'rgba(255,255,255,0.04)',
                    color: C.text,
                    padding: '11px 12px',
                    fontFamily: UI_MONO,
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
              )}
              <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textDim }}>
                {field.description}
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
            ACTIVE OVERRIDES
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
            {activeOverrideSummary}
          </div>
        </div>
        <div style={{ alignSelf: 'stretch' }}>
          <MainAction
            accent={C.red}
            title="Clear Direct Overrides"
            body="Reset every manual field back to auto while keeping your selected class, difficulty, and challenge choices."
            onClick={onClearCustomConfig}
            meta="Cleanup"
            status={activeOverrideFields.length > 0 ? `${activeOverrideFields.length} active` : 'Already clean'}
            disabled={activeOverrideFields.length === 0}
          />
        </div>
      </div>
    </div>
  );

  const renderStandardRunView = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 18 }}>
        {renderStarterProfilePanel()}

        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ ...panelStyle(C.cyan, 'default', '18px'), display: 'grid', gap: 12 }}>
            <SectionIntro
              accent={C.cyan}
              eyebrow="RUN PACKAGE"
              title="Seed And Launch"
              body="Standard Run now shows the live seed number and the currently configured rule stack, but editing stays one layer deeper."
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <DataChip accent={C.cyan}>{currentSeedSummary}</DataChip>
              <DataChip accent={selectedDifficultyAccent}>{selectedDifficulty?.name || 'Standard'}</DataChip>
              <DataChip accent={C.purple}>{selectedChallenges.size > 0 ? `${selectedChallenges.size} modifier${selectedChallenges.size === 1 ? '' : 's'}` : 'Baseline rules'}</DataChip>
              {activeOverrideFields.length > 0 ? <DataChip accent={C.orange}>{activeOverrideFields.length} override{activeOverrideFields.length === 1 ? '' : 's'}</DataChip> : null}
            </div>
            <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
                CURRENT MODIFIER STACK
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                {selectedModeSummary.join(' | ') || 'Standard baseline'}
              </div>
            </div>
            <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
                DIRECT OVERRIDES
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                {activeOverrideSummary}
              </div>
            </div>
            <MainAction
              accent={C.yellow}
              title={selectedProfile ? `Deploy ${selectedProfile.shortLabel || selectedProfile.name}` : 'New Game'}
              body="Launch the selected class and current seed package immediately."
              onClick={onNewGame}
              meta="Run"
              status={selectedDifficulty?.name || 'Standard'}
              solid
            />
          </div>
        </div>
      </div>

      {renderProfilePreview()}
    </div>
  );

  const renderModifierConfigView = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 18 }}>
        {renderDifficultyPanel()}
        {renderChallengePanel()}
      </div>

      {renderDirectOverridePanel()}

      <div style={{ ...panelStyle(C.orange, 'soft', '18px'), display: 'grid', gap: 14 }}>
        <SectionIntro
          accent={C.orange}
          eyebrow="LAUNCH SUMMARY"
          title="Configured Package"
          body="These modifier edits feed the same Standard Run leaf. Nothing new is exposed on the first launch surface."
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <DataChip accent={selectedProfileAccent}>{selectedProfile?.name || 'No runner selected'}</DataChip>
          <DataChip accent={selectedDifficultyAccent}>{selectedDifficulty?.name || 'Standard'}</DataChip>
          <DataChip accent={C.cyan}>{currentSeedSummary}</DataChip>
          {activeOverrideFields.length > 0 ? <DataChip accent={C.orange}>{activeOverrideFields.length} direct override{activeOverrideFields.length === 1 ? '' : 's'}</DataChip> : null}
        </div>
        <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.7, color: C.textDim }}>
          {selectedModeSummary.join(' | ') || 'Standard baseline'}
        </div>
      </div>
    </div>
  );

  const renderTutorialCategory = (tutorials, accent, title) => (
    <div style={{ ...panelStyle(accent, 'default', '18px'), display: 'grid', gap: 14 }}>
      <SectionIntro
        accent={accent}
        eyebrow={title.toUpperCase()}
        title={title}
        body="Tutorial modules only appear after you open the lane they belong to."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {tutorials.map((tutorial) => {
          const completed = completedSet.has(tutorial.id);
          const tutorialAccent = tutorial.accent || accent;
          return (
            <button
              key={tutorial.id}
              onClick={() => onStartTutorial?.(tutorial.id)}
              style={{
                appearance: 'none',
                ...panelStyle(tutorialAccent, tutorial.recommended && !completed ? 'bright' : 'soft', '16px'),
                display: 'grid',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: 700, color: tutorialAccent }}>
                  {tutorial.title}
                </div>
                <DataChip accent={tutorialAccent} selected>
                  {completed ? 'Replay' : tutorial.recommended ? 'Recommended' : 'New'}
                </DataChip>
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
                {tutorial.menuDescription}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderTutorialsView = () => {
    if (activeTutorialView === 'root') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
          <MainAction accent={C.cyan} title="Beginner Mechanics" body="Combat basics and menu/run-mode orientation for first-touch onboarding." onClick={() => handleTutorialViewChange('beginner')} meta="Training" status={`${beginnerTutorials.length} modules`} solid />
          <MainAction accent={C.purple} title="Advanced Mechanics" body="Pressure systems, boss protocols, compile, stabilise, and deeper tactical rules." onClick={() => handleTutorialViewChange('advanced')} meta="Training" status={`${advancedTutorials.length} modules`} />
        </div>
      );
    }

    if (activeTutorialView === 'advanced') {
      return renderTutorialCategory(advancedTutorials, C.purple, 'Advanced Mechanics');
    }

    return renderTutorialCategory(beginnerTutorials, C.cyan, 'Beginner Mechanics');
  };

  const renderDailyView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 18 }}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ ...panelStyle(C.cyan, 'bright', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={C.cyan}
            eyebrow="TODAY"
            title={dailyRunConfig?.id || 'Daily run unavailable'}
            body={dailyRunConfig?.summary || 'Shared seed run'}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <DataChip accent={C.cyan}>Seed {dailyRunConfig?.seed ?? 0}</DataChip>
            <DataChip accent={C.cyan}>{dailyRunConfig?.resetLabel || 'Resets daily'}</DataChip>
          </div>

          {dailyRunRecord ? (
            <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
                YOUR RECORD
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                Attempts {dailyRunRecord.attempts} | Best score {dailyRunRecord.bestScore} | Best floor {dailyRunRecord.bestFloorReached}
              </div>
            </div>
          ) : null}

          <div style={{ maxWidth: 360 }}>
            <MainAction
              accent={C.cyan}
              title="Launch Daily"
              body="Jump into the fixed-seed shared breach from here."
              onClick={onStartDailyRun}
              meta="Shared"
              status="Today"
              solid
            />
          </div>
        </div>
      </div>

      <div style={{ ...panelStyle(C.cyan, 'default', '18px'), display: 'grid', gap: 14 }}>
        <SectionIntro
          accent={C.cyan}
          eyebrow="LOCAL STANDINGS"
          title="Recent Runs"
          body="Recent device-local results stay here until a real backend leaderboard exists."
        />

        {recentDailyRecords.slice(0, 5).length > 0 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {recentDailyRecords.slice(0, 5).map((record) => (
              <div
                key={record.id}
                style={{
                  ...panelStyle(C.border, 'soft', '14px'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 700, color: C.text }}>
                    {record.id}
                  </div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.5, color: C.textDim }}>
                    {record.starterProfileName} | {record.difficultyName}
                  </div>
                </div>
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 30, fontWeight: 700, color: record.bestVictory ? C.green : C.yellow }}>
                  {record.bestScore}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...panelStyle(C.border, 'soft', '14px'), fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
            No local daily records yet.
          </div>
        )}
      </div>
    </div>
  );

  const renderArchiveList = (entries, accent, emptyLabel) => (
    entries.length ? (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {entries.map((entry) => (
          <div key={entry.id} style={{ ...panelStyle(accent, 'soft', '14px'), display: 'grid', gap: 8 }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 700, color: accent }}>
              {entry.name}
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.text }}>
              {entry.description}
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.5, color: C.textMuted }}>
              {entry.id}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div style={{ ...panelStyle(C.border, 'soft', '14px'), fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
        {emptyLabel}
      </div>
    )
  );

  const renderIntelView = () => {
    if (activeIntelView === 'root') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
          <MainAction accent={C.yellow} title="Progress" body="Runs, wins, mutations, and the long-game signal." onClick={() => handleIntelViewChange('progress')} meta="Archive" status={`${metaProgress?.totalRuns ?? 0} runs`} />
          <MainAction accent={C.green} title="Relics" body="Unlocked relics and their archive descriptions." onClick={() => handleIntelViewChange('relics')} meta="Archive" status={`${Object.values(data?.relics || {}).filter((relic) => isRelicUnlockedByAchievements(relic.id, unlockedRewardState.unlockedRelicIds)).length}`} />
          <MainAction accent={C.cyan} title="Cards" body="Unlocked cards, costs, types, and text." onClick={() => handleIntelViewChange('cards')} meta="Archive" status={`${Object.values(data?.cards || {}).filter((card) => isCardUnlockedByAchievements(card.id, unlockedRewardState.unlockedCardIds)).length}`} />
          <MainAction accent={C.red} title="Enemies" body="The active enemy roster and its baseline details." onClick={() => handleIntelViewChange('enemies')} meta="Archive" status={`${Object.keys(data?.enemies || {}).length}`} />
          <MainAction accent={C.orange} title="Minigames" body="All current minigame variants and their act lanes." onClick={() => handleIntelViewChange('minigames')} meta="Archive" status={`${Object.keys(MINIGAME_REGISTRY).length}`} />
          <MainAction accent={C.red} title="Bosses" body="Seen and defeated bosses with composition snapshots." onClick={() => handleIntelViewChange('bosses')} meta="Archive" status={`${bossArchiveEntries.length}/${totalBossCount}`} />
          <MainAction accent={C.orange} title="Telemetry" body="Starter stress, Heat spikes, scrap spend, and first elite or boss wipe rates." onClick={() => handleIntelViewChange('telemetry')} meta="Archive" status={`${runAnalytics?.totalRuns ?? 0} logs`} />
          <MainAction accent={C.green} title="Achievements" body="Milestones and the unlocks attached to them." onClick={() => handleIntelViewChange('achievements')} meta="Archive" status={`${achievementUnlockCount}/${achievements.length}`} />
          <MainAction accent={activeCallsignAccent} title="Callsigns" body="Cosmetic identity rewards and equipped theme selection." onClick={() => handleIntelViewChange('callsigns')} meta="Archive" status={`${callsignUnlockCount} unlocked`} />
        </div>
      );
    }

    if (activeIntelView === 'progress') {
      return (
        <div style={{ ...panelStyle(C.yellow, 'default', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro accent={C.yellow} eyebrow="META PROGRESSION" title="Long-Term Signal" body="Permanent unlocks, discovery counts, and active run context live here instead of the front page." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <StatTile accent={C.text} label="Runs" value={metaProgress?.totalRuns ?? 0} />
            <StatTile accent={C.green} label="Wins" value={metaProgress?.totalWins ?? 0} />
            <StatTile accent={C.cyan} label="Best Act" value={metaProgress?.bestActReached ?? 1} />
            <StatTile accent={C.purple} label="Mutations" value={metaProgress?.totalUniqueMutations ?? 0} />
            <StatTile accent={C.green} label="Achievements" value={achievementUnlockCount} />
            <StatTile accent={activeCallsignAccent} label="Callsigns" value={callsignUnlockCount} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ ...panelStyle(C.green, 'soft', '14px'), display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.green }}>RECENT UNLOCKS</div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>{recentUnlockLabels.join(' | ') || 'No recent unlocks yet'}</div>
            </div>
            <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>ACTIVE MODE STACK</div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>{selectedDifficulty?.name || 'Standard'} | {activeChallengeSummary}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.yellow }}>
              UNLOCK LADDER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {unlockProgressRows.length > 0 ? unlockProgressRows.map((entry) => (
                <div key={entry.id} style={{ ...panelStyle(entry.accent, 'soft', '14px'), display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 700, color: C.text }}>{entry.name}</div>
                    <DataChip accent={entry.accent}>{entry.category}</DataChip>
                  </div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                    {entry.description}
                  </div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textMuted }}>
                    {entry.progress}
                  </div>
                </div>
              )) : (
                <div style={{ ...panelStyle(C.yellow, 'soft', '14px'), fontFamily: UI_MONO, fontSize: 12, color: C.text }}>
                  Every current profile, difficulty, and challenge lane is already unlocked in this local archive.
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeIntelView === 'achievements') {
      return renderArchiveList(
        achievements.map((achievement) => ({
          id: achievement.id,
          name: achievement.name,
          description: `${achievement.description} Reward: ${achievement.reward?.label || 'None'}${unlockedRewardState.unlockedAchievementIds.includes(achievement.id) ? ' | Unlocked' : ' | Locked'}`,
        })),
        C.green,
        'No achievement catalog available.',
      );
    }

    if (activeIntelView === 'relics') {
      return renderArchiveList(
        Object.values(data?.relics || {})
          .filter((relic) => isRelicUnlockedByAchievements(relic.id, unlockedRewardState.unlockedRelicIds))
          .map((relic) => ({ id: relic.id, name: relic.name, description: relic.description || relic.desc || 'No relic description.' })),
        C.green,
        'No unlocked relics yet.',
      );
    }

    if (activeIntelView === 'cards') {
      return renderArchiveList(
        Object.values(data?.cards || {})
          .filter((card) => isCardUnlockedByAchievements(card.id, unlockedRewardState.unlockedCardIds))
          .map((card) => ({ id: card.id, name: card.name, description: `${card.type || 'Card'} | ${card.costRAM ?? 0} RAM | ${formatCardDescription(card)}` })),
        C.cyan,
        'No unlocked cards yet.',
      );
    }

    if (activeIntelView === 'enemies') {
      return renderArchiveList(
        Object.values(data?.enemies || {}).map((enemy) => ({
          id: enemy.id,
          name: enemy.name,
          description: `${enemy.maxHP ?? enemy.hp ?? '?'} HP | ${enemy.description || enemy.desc || 'Full roster archive currently visible.'}`,
        })),
        C.red,
        'No enemy archive entries available.',
      );
    }

    if (activeIntelView === 'minigames') {
      return renderArchiveList(
        Object.entries(MINIGAME_REGISTRY).map(([id, minigame]) => ({
          id,
          name: minigame.title,
          description: `Act ${minigame.act} | ${String(minigame.type || '').toUpperCase()} | ${minigame.desc || 'No notes.'}`,
        })),
        C.orange,
        'No minigames available.',
      );
    }

    if (activeIntelView === 'bosses') {
      return renderArchiveList(
        bossArchiveEntries.map((boss) => ({
          id: boss.id,
          name: boss.name,
          description: `${boss.defeated ? 'Defeated' : boss.seen ? 'Seen' : 'Unknown'} | Act ${boss.act} | ${(boss.enemies || []).map((enemy) => enemy.name).slice(0, 3).join(', ') || 'Unknown composition'}`,
        })),
        C.red,
        'No boss archive entries yet.',
      );
    }

    if (activeIntelView === 'telemetry') {
      const profileRows = runAnalytics?.profileRows || [];
      const tutorialRows = runAnalytics?.tutorialRows || [];
      return (
        <div style={{ ...panelStyle(C.orange, 'default', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={C.orange}
            eyebrow="OPS TELEMETRY"
            title="Balance Pressure Readout"
            body="This local archive tracks where runs are starving on RAM, overheating, failing their first elite or boss checks, and dropping out of onboarding."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <StatTile accent={C.text} label="Tracked Runs" value={runAnalytics?.totalRuns ?? 0} />
            <StatTile accent={C.green} label="Win Rate" value={formatPercent(runAnalytics?.winRate)} />
            <StatTile accent={C.cyan} label="Avg RAM Starve" value={formatAverage(runAnalytics?.averageRamStarvedTurns)} />
            <StatTile accent={C.orange} label="Avg Heat Peak" value={formatAverage(runAnalytics?.averagePeakHeat)} />
            <StatTile accent={C.yellow} label="Avg Scrap Spend" value={formatAverage(runAnalytics?.averageScrapSpent)} />
            <StatTile accent={C.red} label="1st Elite Loss" value={formatPercent(runAnalytics?.firstEliteLossRate)} />
            <StatTile accent={C.red} label="1st Boss Loss" value={formatPercent(runAnalytics?.firstBossLossRate)} />
            <StatTile accent={C.cyan} label="Tutorial Clear" value={formatPercent(runAnalytics?.tutorialCompletionRate)} />
            <StatTile accent={C.orange} label="Tutorial Exit" value={formatPercent(runAnalytics?.tutorialExitRate)} />
          </div>
          <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>RECENT SIGNAL</div>
            <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
              {(runAnalytics?.recentRuns || []).slice(0, 3).map((run) => (
                `${run.starterProfileName} ${run.victory ? 'won' : 'lost'} Act ${run.actReached} / Floor ${run.floorReached} | RAM ${run.ramStarvedTurns} | Heat ${run.peakHeat}`
              )).join(' || ') || 'No local telemetry captured yet.'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {tutorialRows.length > 0 ? tutorialRows.map((tutorial) => (
              <div key={tutorial.id} style={{ ...panelStyle(C.cyan, 'soft', '14px'), display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 700, color: C.text }}>{tutorial.title}</div>
                  <DataChip accent={tutorial.completionRate >= 0.7 ? C.green : C.orange}>
                    {formatPercent(tutorial.completionRate)} clear
                  </DataChip>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <StatTile accent={C.text} label="Starts" value={tutorial.started} compact />
                  <StatTile accent={C.red} label="Exits" value={tutorial.exited} compact />
                  <StatTile accent={C.cyan} label="Avg Steps" value={formatAverage(tutorial.averageStepAdvances)} compact />
                  <StatTile accent={C.orange} label="Top Drop-Off" value={tutorial.topExitStepId || '--'} compact />
                </div>
              </div>
            )) : (
              <div style={{ ...panelStyle(C.cyan, 'soft', '14px'), fontFamily: UI_MONO, fontSize: 12, color: C.text }}>
                Tutorial telemetry starts filling in once local training runs are launched or abandoned.
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {profileRows.length > 0 ? profileRows.map((profile) => (
              <div key={profile.id} style={{ ...panelStyle(C.orange, 'soft', '14px'), display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 700, color: C.text }}>{profile.name}</div>
                  <DataChip accent={profile.winRate >= 0.5 ? C.green : C.red}>{formatPercent(profile.winRate)} win</DataChip>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <StatTile accent={C.text} label="Runs" value={profile.runs} compact />
                  <StatTile accent={C.red} label="Losses" value={profile.losses} compact />
                  <StatTile accent={C.cyan} label="Avg RAM Starve" value={formatAverage(profile.averageRamStarvedTurns)} compact />
                  <StatTile accent={C.orange} label="Avg Heat" value={formatAverage(profile.averagePeakHeat)} compact />
                  <StatTile accent={C.yellow} label="Avg Scrap" value={formatAverage(profile.averageScrapSpent)} compact />
                  <StatTile accent={C.red} label="1st Elite Loss" value={formatPercent(profile.firstEliteLossRate)} compact />
                </div>
              </div>
            )) : (
              <div style={{ ...panelStyle(C.orange, 'soft', '14px'), fontFamily: UI_MONO, fontSize: 12, color: C.text }}>
                Play a few runs and this archive will start highlighting which starter packages are underperforming.
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={{ ...panelStyle(activeCallsignAccent, 'default', '18px'), display: 'grid', gap: 14 }}>
        <SectionIntro accent={activeCallsignAccent} eyebrow="CALLSIGNS" title={activeCallsign?.name || 'Kernel Runner'} body={activeCallsign?.description || 'Default runner callsign.'} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {callsignCatalog.map((theme) => {
            const unlocked = unlockedCallsignSet.has(theme.id);
            const selected = theme.id === callsignId;
            return (
              <button
                key={theme.id}
                onClick={() => unlocked && onSelectCallsign?.(theme.id)}
                style={pillButtonStyle(theme.accent || C.cyan, selected, !unlocked)}
                title={unlocked ? theme.description : 'Unlock through achievements'}
              >
                {theme.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSettingsView = () => (
    <div style={{ ...panelStyle(C.purple, 'default', '18px'), display: 'grid', gap: 14 }}>
      <SectionIntro
        accent={C.purple}
        eyebrow="SETTINGS"
        title="Open The Existing Controls"
        body="The settings and utility panel still exists. It is just hidden behind this parent menu now."
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <DataChip accent={C.cyan}>{currentSeedSummary}</DataChip>
        <DataChip accent={selectedDifficultyAccent}>{selectedDifficulty?.name || 'Standard'}</DataChip>
        <DataChip accent={C.purple}>{selectedChallenges.size > 0 ? `${selectedChallenges.size} active modifiers` : 'Baseline rules'}</DataChip>
      </div>
      <div style={{ maxWidth: 360 }}>
        <MainAction accent={C.purple} title="Open Settings" body="Launch the existing settings / utility panel." onClick={onSettings} meta="Control" status="Drawer" solid />
      </div>
    </div>
  );

  let content = renderHomeView();
  if (activeMenuView === 'load') content = renderLoadView();
  if (activeMenuView === 'new' && activeNewRunView === 'root') content = renderNewRunRootView();
  if (activeMenuView === 'new' && activeNewRunView === 'standard') content = renderStandardRunView();
  if (activeMenuView === 'new' && activeNewRunView === 'daily') content = renderDailyView();
  if (activeMenuView === 'new' && activeNewRunView === 'configure' && activeConfigureView === 'root') content = renderConfigureRootView();
  if (activeMenuView === 'new' && activeNewRunView === 'configure' && activeConfigureView === 'seed') content = renderSeedConfigView();
  if (activeMenuView === 'new' && activeNewRunView === 'configure' && activeConfigureView === 'modifiers') content = renderModifierConfigView();
  if (activeMenuView === 'intel') content = renderIntelView();
  if (activeMenuView === 'tutorial') content = renderTutorialsView();
  if (activeMenuView === 'settings') content = renderSettingsView();

  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div
        className="menu-hub-shell"
        style={{
          width: 'min(1120px, 100%)',
          display: 'grid',
          gap: 18,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '-60px auto auto -80px',
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: `${C.cyan}12`,
            filter: 'blur(26px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '280px -90px auto auto',
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: `${selectedProfileAccent}10`,
            filter: 'blur(32px)',
            pointerEvents: 'none',
          }}
        />

        {renderHeader()}
        <div className="panel-chrome" style={{ ...panelStyle(C.cyan, 'soft', '14px'), display: 'grid', gap: 8, maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 12px ${C.cyan}` }} />
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.16em', color: C.cyan }}>FIXER WIRE</div>
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.65, color: C.text }}>
            {fixerLine}
          </div>
        </div>
        {content}
      </div>
    </ScreenShell>
  );
}
