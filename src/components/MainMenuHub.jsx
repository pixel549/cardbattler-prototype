import React, { useEffect, useState } from 'react';
import RuntimeArt from './RuntimeArt.jsx';
import { getCardImage } from '../data/cardImages.js';
import { composeRunConfig, RUN_BASELINE } from '../game/runProfiles.js';
import { getBossArchiveEntries } from '../game/bossIntel.js';
import { getCallsignTheme, getDefaultCallsignId } from '../game/achievements.js';

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
      radial-gradient(circle at 12% 18%, ${accent}18 0%, transparent 32%),
      linear-gradient(160deg, rgba(10, 14, 24, 0.98) 0%, rgba(7, 9, 16, 0.98) 100%)
    `,
    bright: `
      radial-gradient(circle at 18% 18%, ${accent}24 0%, transparent 34%),
      radial-gradient(circle at 82% 20%, rgba(255,255,255,0.05) 0%, transparent 18%),
      linear-gradient(160deg, rgba(12, 18, 28, 0.98) 0%, rgba(6, 8, 14, 0.99) 100%)
    `,
    soft: `
      radial-gradient(circle at 18% 18%, ${accent}14 0%, transparent 30%),
      linear-gradient(180deg, rgba(8, 10, 18, 0.96) 0%, rgba(6, 7, 13, 0.98) 100%)
    `,
  };

  return {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    border: `1px solid ${accent}2a`,
    background: backgrounds[emphasis] || backgrounds.default,
    boxShadow: `0 22px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.03)`,
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
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        borderRadius: 20,
        padding: '16px 16px 18px',
        border: `1px solid ${solid ? `${accent}00` : `${accent}36`}`,
        background: solid
          ? `linear-gradient(135deg, ${accent} 0%, ${accent}d0 100%)`
          : `
            radial-gradient(circle at 18% 18%, ${accent}18 0%, transparent 30%),
            linear-gradient(160deg, rgba(10, 14, 24, 0.98) 0%, rgba(7, 9, 16, 0.98) 100%)
          `,
        color: solid ? '#041015' : C.text,
        boxShadow: solid
          ? `0 20px 38px ${accent}2a`
          : `0 16px 30px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)`,
        cursor: 'pointer',
        textAlign: 'left',
        display: 'grid',
        gap: 10,
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
      style={{
        padding: '8px 11px',
        borderRadius: 999,
        border: `1px solid ${selected ? `${accent}72` : `${accent}2c`}`,
        background: selected ? `${accent}18` : 'rgba(255,255,255,0.03)',
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
      <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.18em', color: accent }}>
        {eyebrow}
      </div>
      {title ? (
        <div style={{ fontFamily: DISPLAY_FONT, fontSize: 26, fontWeight: 700, color: C.text }}>
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
}) {
  const [menuView, setMenuView] = useState(initialMenuView);
  const [intelView, setIntelView] = useState(initialIntelView);
  const activeMenuView = forcedMenuView ?? menuView;
  const activeIntelView = forcedIntelView ?? intelView;
  const completedSet = new Set(completedTutorialIds);
  const unlockedStarterSet = new Set(unlockedStarterProfileIds);
  const unlockedDifficultySet = new Set(unlockedDifficultyIds);
  const unlockedChallengeSet = new Set(unlockedChallengeIds);
  const unlockedAchievementSet = new Set(metaProgress?.achievementIdsUnlocked || []);
  const unlockedCallsignSet = new Set(unlockedCallsignIds);
  const selectedChallenges = new Set(selectedChallengeIds);

  const callsignId = selectedCallsignId || getDefaultCallsignId();
  const activeCallsign = callsignCatalog.find((theme) => theme.id === callsignId) || getCallsignTheme(callsignId);
  const selectedProfile = starterProfiles.find((profile) => profile.id === selectedStarterProfileId) || starterProfiles[0] || null;
  const selectedDifficulty = difficultyProfiles.find((difficulty) => difficulty.id === selectedDifficultyId) || difficultyProfiles[0] || null;
  const selectedRunConfig = composeRunConfig({}, selectedStarterProfileId, selectedDifficultyId, selectedChallengeIds);
  const selectedModeSummary = buildModeSummary(selectedRunConfig);

  const selectedProfileAccent = selectedProfile?.accent || C.orange;
  const selectedDifficultyAccent = selectedDifficulty?.accent || C.purple;
  const activeCallsignAccent = activeCallsign?.accent || C.cyan;

  const activeChallengeList = challengeModes.filter((challenge) => selectedChallenges.has(challenge.id));
  const activeChallengeSummary = activeChallengeList.length
    ? activeChallengeList.map((challenge) => challenge.name).join(', ')
    : 'No optional challenges active.';

  const selectedProfileRelics = (selectedProfile?.startingRelicIds || []).map((relicId) => data?.relics?.[relicId]?.name || relicId);
  const selectedProfileDeckNames = (selectedProfile?.deck || []).map((cardId) => data?.cards?.[cardId]?.name || cardId);
  const previewDeckCards = (selectedProfile?.deck || [])
    .map((cardId) => ({ cardId, cardDef: data?.cards?.[cardId] }))
    .filter(({ cardDef }) => cardDef)
    .slice(0, 6);

  const featuredTutorial = tutorialCatalog.find((tutorial) => tutorial.recommended && !completedSet.has(tutorial.id)) || tutorialCatalog[0] || null;
  const availableDebugSlots = debugSaveSlotIds
    .map((slotId, index) => ({ slotId, index, slot: debugSaveSlots?.[slotId] }))
    .filter((entry) => entry.slot);
  const hasRecovery = availableDebugSlots.length > 0;

  const recentUnlockLabels = recentUnlocks.map((unlock) => unlock?.name).filter(Boolean);
  const achievementUnlockCount = achievements.filter((achievement) => unlockedAchievementSet.has(achievement.id)).length;
  const callsignUnlockCount = callsignCatalog.filter((theme) => unlockedCallsignSet.has(theme.id)).length;

  const bossArchiveEntries = data ? getBossArchiveEntries(data, metaProgress, 6) : [];
  const totalBossCount = Object.values(data?.encounters || {}).filter((encounter) => encounter?.kind === 'boss').length;
  const seenBossCount = metaProgress?.bossEncounterIdsSeen?.length ?? 0;
  const defeatedBossCount = metaProgress?.bossEncounterIdsDefeated?.length ?? 0;

  const pageMeta = {
    home: {
      eyebrow: 'CARD BATTLER',
      title: 'Ops Console',
      body: 'Clean launch surface up front, deeper systems one layer down. The front page is now about starting runs, not browsing every subsystem at once.',
      accent: C.cyan,
    },
    setup: {
      eyebrow: 'RUN SETUP',
      title: 'Loadout Bay',
      body: 'Profiles, difficulty, and run variations are grouped here so the main menu can stay focused.',
      accent: selectedProfileAccent,
    },
    tutorials: {
      eyebrow: 'TUTORIALS',
      title: 'Training Deck',
      body: 'Guided onboarding, refreshers, and system primers live in one place.',
      accent: C.cyan,
    },
    daily: {
      eyebrow: 'DAILY RUN',
      title: 'Shared Breach',
      body: 'Shared seed, shared loadout, shared challenge. Records and reset timing are tucked into this lane.',
      accent: C.cyan,
    },
    intel: {
      eyebrow: 'INTEL',
      title: 'Archive and Unlocks',
      body: 'Meta progress, boss intel, achievements, and cosmetic identity are now grouped behind one archive view.',
      accent: C.green,
    },
    recovery: {
      eyebrow: 'RECOVERY',
      title: 'Debug Slots',
      body: 'Save-slot recovery and internal tooling stay out of the way until you deliberately open them.',
      accent: C.orange,
    },
  };

  const navItems = [
    { id: 'home', label: 'Home', accent: C.cyan },
    { id: 'setup', label: 'Run Setup', accent: selectedProfileAccent },
    { id: 'tutorials', label: 'Tutorials', accent: C.cyan },
    { id: 'daily', label: 'Daily Run', accent: C.cyan },
    { id: 'intel', label: 'Intel', accent: C.green },
    ...(hasRecovery ? [{ id: 'recovery', label: 'Recovery', accent: C.orange }] : []),
  ];

  const panelStyle = (accent, emphasis = 'default', padding = '18px') => ({
    ...makeSurface(accent, emphasis),
    padding,
  });
  const tutorialMenuActive = tutorialStep?.mode === 'MainMenu';
  const tutorialPaneLabel = tutorialStep?.intelView === 'bosses'
    ? 'Boss archive'
    : tutorialStep?.intelView === 'callsigns'
      ? 'Callsign archive'
      : tutorialStep?.menuView === 'setup'
        ? 'Run setup'
        : tutorialStep?.menuView === 'daily'
          ? 'Daily run'
          : tutorialStep?.menuView === 'intel'
            ? 'Progress archive'
            : 'Active pane';

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
    if (forcedMenuView != null) return;
    setMenuView(initialMenuView);
  }, [forcedMenuView, initialMenuView]);

  useEffect(() => {
    if (forcedIntelView != null) return;
    setIntelView(initialIntelView);
  }, [forcedIntelView, initialIntelView]);

  const handleMenuViewChange = (nextView) => {
    if (forcedMenuView != null && nextView !== forcedMenuView) {
      onBlockedNavigation?.();
      return;
    }
    setMenuView(nextView);
  };

  const handleIntelViewChange = (nextView) => {
    if (forcedIntelView != null && nextView !== forcedIntelView) {
      onBlockedNavigation?.();
      return;
    }
    setIntelView(nextView);
  };

  const renderHeader = () => {
    const meta = pageMeta[activeMenuView];
    return (
      <div style={{ ...panelStyle(meta.accent, 'bright', '22px'), display: 'grid', gap: 18 }}>
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
            <div style={{ fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.24em', color: C.textDim }}>
              {meta.eyebrow}
            </div>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 48, fontWeight: 700, lineHeight: 0.96, color: C.text }}>
              {meta.title}
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 13, lineHeight: 1.75, color: C.textDim, maxWidth: 640 }}>
              {meta.body}
            </div>
          </div>

          <div style={{ ...panelStyle(activeCallsignAccent, 'soft', '16px'), display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.16em', color: activeCallsignAccent }}>
                ACTIVE CALLSIGN
              </div>
              {activeMenuView !== 'home' ? (
                <button onClick={() => handleMenuViewChange('home')} style={ghostButtonStyle}>
                  Back
                </button>
              ) : null}
            </div>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 28, fontWeight: 700, color: C.text }}>
              {activeCallsign?.name || 'Kernel Runner'}
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
              {dailyRunConfig?.id || 'Daily run offline'} | {dailyRunConfig?.resetLabel || 'Resets daily'}
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleMenuViewChange(item.id)}
              style={pillButtonStyle(item.accent, item.id === activeMenuView)}
            >
              {item.label}
            </button>
          ))}
          <button onClick={onSettings} style={ghostButtonStyle}>
            Settings
          </button>
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
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
            DECK PREVIEW
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(82px, 1fr))', gap: 10 }}>
            {previewDeckCards.map(({ cardId, cardDef }) => {
              const accent = getCardColor(cardDef.type);
              return (
                <div key={cardId} style={{ display: 'grid', gap: 6 }}>
                  <RuntimeArt
                    src={getCardImage(cardId)}
                    alt={cardDef.name}
                    accent={accent}
                    label={cardDef.name}
                    style={{
                      width: '100%',
                      aspectRatio: '0.72',
                      borderRadius: 14,
                      overflow: 'hidden',
                      border: `1px solid ${accent}24`,
                      background: C.bgCard,
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
                      border: `1px solid ${accent}24`,
                    }}
                  />
                  <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.45, color: C.text }}>
                    {cardDef.name}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
            Full deck: {selectedProfileDeckNames.join(', ')}
          </div>
        </div>
      </div>
    );
  };

  const renderHomeView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 18 }}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ ...panelStyle(C.yellow, 'bright', '18px'), display: 'grid', gap: 12 }}>
          <SectionIntro
            accent={C.yellow}
            eyebrow="PRIMARY ACTIONS"
            title="Launch"
            body="The main screen now stays disciplined: resume, deploy, or head into one submenu for the rest."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {canContinue ? (
              <MainAction
                accent={C.green}
                title="Continue"
                body="Jump back into the last autosaved run without browsing setup first."
                onClick={onContinue}
                meta="Resume"
                status="Autosave"
                solid
              />
            ) : null}
            <MainAction
              accent={C.yellow}
              title={selectedProfile ? `Deploy ${selectedProfile.shortLabel || selectedProfile.name}` : 'New Game'}
              body="Start from the current loadout, difficulty, and challenge selection."
              onClick={onNewGame}
              meta="Run"
              status={selectedDifficulty?.name || 'Standard'}
              solid={!canContinue}
            />
            <MainAction
              accent={C.cyan}
              title="Daily Run"
              body="Shared seed, shared breach, separate lane. This keeps the landing page from turning back into a wall of details."
              onClick={() => handleMenuViewChange('daily')}
              meta="Shared"
              status={dailyRunConfig?.id || 'Offline'}
            />
          </div>
        </div>

        <div style={{ ...panelStyle(C.cyan, 'default', '18px'), display: 'grid', gap: 12 }}>
          <SectionIntro
            accent={C.cyan}
            eyebrow="SUBMENUS"
            title="Organize"
            body="Everything noisy lives behind a clear door now."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <MainAction accent={selectedProfileAccent} title="Run Setup" body="Profiles, difficulty, and challenge layers." onClick={() => handleMenuViewChange('setup')} meta="Configure" />
            <MainAction accent={C.cyan} title="Tutorials" body="Recommended onboarding and replayable lessons." onClick={() => handleMenuViewChange('tutorials')} meta="Learn" status={featuredTutorial?.title || 'Ready'} />
            <MainAction accent={C.green} title="Intel" body="Progress, unlocks, bosses, and callsigns." onClick={() => { handleIntelViewChange('progress'); handleMenuViewChange('intel'); }} meta="Archive" />
            {hasRecovery ? <MainAction accent={C.orange} title="Recovery" body="Internal save slots and debug recovery tools." onClick={() => handleMenuViewChange('recovery')} meta="Utility" status={`${availableDebugSlots.length} slot${availableDebugSlots.length === 1 ? '' : 's'}`} /> : null}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {renderProfilePreview()}

        <div style={{ ...panelStyle(C.green, 'default', '18px'), display: 'grid', gap: 12 }}>
          <SectionIntro
            accent={C.green}
            eyebrow="FIELD SNAPSHOT"
            title="Current Signal"
            body="A quick at-a-glance panel for the live build state."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
            <StatTile accent={C.text} label="Runs" value={metaProgress?.totalRuns ?? 0} />
            <StatTile accent={C.green} label="Wins" value={metaProgress?.totalWins ?? 0} />
            <StatTile accent={C.cyan} label="Act" value={metaProgress?.bestActReached ?? 1} />
            <StatTile accent={C.purple} label="Muts" value={metaProgress?.totalUniqueMutations ?? 0} />
          </div>

          {featuredTutorial ? (
            <div style={{ ...panelStyle(C.cyan, 'soft', '14px'), display: 'grid', gap: 8 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.cyan }}>
                FEATURED TUTORIAL
              </div>
              <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: 700, color: C.text }}>
                {featuredTutorial.title}
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
                {featuredTutorial.menuDescription}
              </div>
              <button onClick={() => onStartTutorial?.(featuredTutorial.id)} style={ghostButtonStyle}>
                {completedSet.has(featuredTutorial.id) ? 'Replay Tutorial' : 'Start Tutorial'}
              </button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
                TODAY'S DAILY
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                {dailyRunConfig?.id || 'Daily run unavailable'}
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
                {dailyRunConfig?.summary || 'Fixed seed and shared loadout.'}
              </div>
            </div>

            <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
                RECENT UNLOCKS
              </div>
              <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                {recentUnlockLabels.slice(0, 4).join(' | ') || 'No recent unlocks yet'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSetupView = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 18 }}>
        <div style={{ ...panelStyle(C.orange, 'default', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={C.orange}
            eyebrow="STARTER PROFILES"
            title="Select A Runner"
            body="The archetype browser now lives here, not on the landing page."
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
                    {locked ? profile.unlockHint : `Starts with ${profile.startingRelicIds?.length || 0} relic and ${profile.deck?.length || 0} cards.`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
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

          <div style={{ ...panelStyle(C.purple, 'default', '18px'), display: 'grid', gap: 12 }}>
            <SectionIntro
              accent={C.purple}
              eyebrow="CHALLENGES"
              title="Optional Variants"
              body="Extra run modifiers stay available without cluttering the front page."
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

          <MainAction
            accent={C.yellow}
            title={selectedProfile ? `Deploy ${selectedProfile.shortLabel || selectedProfile.name}` : 'New Game'}
            body="Launch the selected run package immediately."
            onClick={onNewGame}
            meta="Run"
            status={selectedDifficulty?.name || 'Standard'}
            solid
          />
        </div>
      </div>

      {renderProfilePreview()}
    </div>
  );

  const renderTutorialsView = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      {featuredTutorial ? (
        <div style={{ ...panelStyle(C.cyan, 'bright', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={C.cyan}
            eyebrow="RECOMMENDED START"
            title={featuredTutorial.title}
            body={featuredTutorial.menuDescription}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(featuredTutorial.concepts || []).slice(0, 4).map((concept) => (
              <DataChip key={concept} accent={C.cyan}>
                {concept}
              </DataChip>
            ))}
          </div>

          <div style={{ maxWidth: 360 }}>
            <MainAction
              accent={C.cyan}
              title={completedSet.has(featuredTutorial.id) ? 'Replay Tutorial' : 'Start Tutorial'}
              body="Recommended first touchpoint for the current ruleset."
              onClick={() => onStartTutorial?.(featuredTutorial.id)}
              meta="Guide"
              status={completedSet.has(featuredTutorial.id) ? 'Replay' : 'Recommended'}
              solid
            />
          </div>
        </div>
      ) : null}

      <div style={{ ...panelStyle(C.cyan, 'default', '18px'), display: 'grid', gap: 14 }}>
        <SectionIntro
          accent={C.cyan}
          eyebrow="LESSON LIST"
          title="Training Modules"
          body="Every tutorial and its covered concepts are grouped here instead of being mixed into run setup."
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {tutorialCatalog.map((tutorial) => {
            const completed = completedSet.has(tutorial.id);
            const accent = tutorial.accent || C.cyan;
            return (
              <button
                key={tutorial.id}
                onClick={() => onStartTutorial?.(tutorial.id)}
                style={{
                  appearance: 'none',
                  ...panelStyle(accent, tutorial.recommended && !completed ? 'bright' : 'soft', '16px'),
                  display: 'grid',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: 700, color: accent }}>
                    {tutorial.title}
                  </div>
                  <DataChip accent={accent} selected>
                    {completed ? 'Replay' : tutorial.recommended ? 'Recommended' : 'New'}
                  </DataChip>
                </div>
                <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
                  {tutorial.menuDescription}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(tutorial.concepts || []).slice(0, 4).map((concept) => (
                    <DataChip key={concept} accent={accent}>
                      {concept}
                    </DataChip>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

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

  const renderIntelView = () => {
    const intelTabs = [
      { id: 'progress', label: 'Progress', accent: C.yellow },
      { id: 'achievements', label: 'Achievements', accent: C.green },
      { id: 'bosses', label: 'Bosses', accent: C.red },
      { id: 'callsigns', label: 'Callsigns', accent: activeCallsignAccent },
    ];

    let panel = (
      <div style={{ ...panelStyle(C.yellow, 'default', '18px'), display: 'grid', gap: 14 }}>
        <SectionIntro
          accent={C.yellow}
          eyebrow="META PROGRESSION"
          title="Long-Term Signal"
          body="Permanent unlocks, discovery counts, and active run context live here instead of the front page."
        />

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
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.green }}>
              RECENT UNLOCKS
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
              {recentUnlockLabels.join(' | ') || 'No recent unlocks yet'}
            </div>
          </div>

          <div style={{ ...panelStyle(C.border, 'soft', '14px'), display: 'grid', gap: 6 }}>
            <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>
              ACTIVE MODE STACK
            </div>
            <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
              {selectedDifficulty?.name || 'Standard'} | {activeChallengeSummary}
            </div>
          </div>
        </div>
      </div>
    );

    if (activeIntelView === 'achievements') {
      panel = (
        <div style={{ ...panelStyle(C.green, 'default', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={C.green}
            eyebrow="ACHIEVEMENTS"
            title="Run Goals"
            body="Reward unlocks and milestone tracking now sit in one focused archive panel."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {achievements.map((achievement) => {
              const unlocked = unlockedAchievementSet.has(achievement.id);
              return (
                <div
                  key={achievement.id}
                  style={{
                    ...panelStyle(unlocked ? C.green : C.border, unlocked ? 'soft' : 'default', '14px'),
                    display: 'grid',
                    gap: 8,
                    opacity: unlocked ? 1 : 0.84,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: 700, color: unlocked ? C.green : C.text }}>
                      {achievement.name}
                    </div>
                    <DataChip accent={unlocked ? C.green : C.textDim} selected>
                      {unlocked ? 'Unlocked' : 'Locked'}
                    </DataChip>
                  </div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
                    {achievement.description}
                  </div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.5, color: unlocked ? C.text : C.textMuted }}>
                    Reward: {achievement.reward?.label || 'None'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeIntelView === 'bosses') {
      panel = (
        <div style={{ ...panelStyle(C.red, 'default', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={C.red}
            eyebrow="BOSS ARCHIVE"
            title="Threat Registry"
            body="Bosses now have their own archive instead of taking over the front page."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <StatTile accent={C.yellow} label="Seen" value={seenBossCount} />
            <StatTile accent={C.green} label="Defeated" value={defeatedBossCount} />
            <StatTile accent={C.red} label="Pool" value={totalBossCount} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {bossArchiveEntries.map((boss) => {
              const statusColor = boss.defeated ? C.green : boss.seen ? C.yellow : C.red;
              const statusLabel = boss.defeated ? 'Defeated' : boss.seen ? 'Seen' : 'Unknown';
              return (
                <div key={boss.id} style={{ ...panelStyle(statusColor, 'soft', '14px'), display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: 700, color: statusColor }}>
                      {boss.name}
                    </div>
                    <DataChip accent={statusColor} selected>
                      {statusLabel}
                    </DataChip>
                  </div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.textDim }}>
                    Act {boss.act} | {boss.enemyCount} enemy{boss.enemyCount === 1 ? '' : 'ies'} | {boss.totalHp || '?'} total HP
                  </div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.6, color: C.text }}>
                    {(boss.enemies || []).map((enemy) => enemy.name).slice(0, 3).join(', ') || 'Unknown composition'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeIntelView === 'callsigns') {
      panel = (
        <div style={{ ...panelStyle(activeCallsignAccent, 'default', '18px'), display: 'grid', gap: 14 }}>
          <SectionIntro
            accent={activeCallsignAccent}
            eyebrow="CALLSIGNS"
            title={activeCallsign?.name || 'Kernel Runner'}
            body={activeCallsign?.description || 'Default runner callsign.'}
          />

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
    }

    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ ...panelStyle(C.green, 'soft', '16px'), display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {intelTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleIntelViewChange(tab.id)}
              style={pillButtonStyle(tab.accent, activeIntelView === tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {panel}
      </div>
    );
  };

  const renderRecoveryView = () => (
    <div style={{ ...panelStyle(C.orange, 'default', '18px'), display: 'grid', gap: 14 }}>
      <SectionIntro
        accent={C.orange}
        eyebrow="DEBUG SAVES"
        title="Recovery Slots"
        body="These are internal run snapshots. They stay buried here so the main menu remains player-facing."
      />

      {availableDebugSlots.length > 0 ? (
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
      ) : (
        <div style={{ ...panelStyle(C.border, 'soft', '14px'), fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>
          No recovery slots currently stored.
        </div>
      )}
    </div>
  );

  let content = renderHomeView();
  if (activeMenuView === 'setup') content = renderSetupView();
  if (activeMenuView === 'tutorials') content = renderTutorialsView();
  if (activeMenuView === 'daily') content = renderDailyView();
  if (activeMenuView === 'intel') content = renderIntelView();
  if (activeMenuView === 'recovery') content = renderRecoveryView();

  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div
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
        {content}
      </div>
    </ScreenShell>
  );
}
