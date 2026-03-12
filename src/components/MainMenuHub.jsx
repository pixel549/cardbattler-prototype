import React, { useState } from 'react';
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
  if (runConfig.playerMaxHP !== RUN_BASELINE.playerMaxHP) summary.push(`${runConfig.playerMaxHP > RUN_BASELINE.playerMaxHP ? '+' : ''}${runConfig.playerMaxHP - RUN_BASELINE.playerMaxHP} max HP`);
  if (runConfig.startingGold !== RUN_BASELINE.startingGold) summary.push(`${runConfig.startingGold > RUN_BASELINE.startingGold ? '+' : ''}${runConfig.startingGold - RUN_BASELINE.startingGold} starting gold`);
  if (runConfig.drawPerTurnDelta !== RUN_BASELINE.drawPerTurnDelta) summary.push(`${runConfig.drawPerTurnDelta > 0 ? '+' : ''}${runConfig.drawPerTurnDelta} draw / turn`);
  if (runConfig.enemyHpMult !== RUN_BASELINE.enemyHpMult) summary.push(`${Math.round((runConfig.enemyHpMult - 1) * 100)}% enemy HP`);
  if (runConfig.enemyDmgMult !== RUN_BASELINE.enemyDmgMult) summary.push(`${Math.round((runConfig.enemyDmgMult - 1) * 100)}% enemy damage`);
  return summary;
}

export default function MainMenuHub({
  ScreenShell,
  data = null,
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
  const [menuView, setMenuView] = useState('home');
  const [intelView, setIntelView] = useState('progress');
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
  const selectedProfileRelics = (selectedProfile?.startingRelicIds || []).map((relicId) => data?.relics?.[relicId]?.name || relicId);
  const selectedProfileDeckNames = (selectedProfile?.deck || []).map((cardId) => data?.cards?.[cardId]?.name || cardId);
  const selectedProfileAccent = selectedProfile?.accent || C.orange;
  const selectedDifficultyAccent = selectedDifficulty?.accent || C.purple;
  const activeCallsignAccent = activeCallsign?.accent || C.cyan;
  const activeChallengeList = challengeModes.filter((challenge) => selectedChallenges.has(challenge.id));
  const activeChallengeSummary = activeChallengeList.length ? activeChallengeList.map((challenge) => challenge.name).join(', ') : 'No optional challenges active.';
  const recentUnlockLabels = recentUnlocks.map((unlock) => unlock?.name).filter(Boolean);
  const featuredTutorial = tutorialCatalog.find((tutorial) => tutorial.recommended && !completedSet.has(tutorial.id)) || tutorialCatalog[0] || null;
  const bossArchiveEntries = data ? getBossArchiveEntries(data, metaProgress, 6) : [];
  const totalBossCount = Object.values(data?.encounters || {}).filter((encounter) => encounter?.kind === 'boss').length;
  const seenBossCount = metaProgress?.bossEncounterIdsSeen?.length ?? 0;
  const defeatedBossCount = metaProgress?.bossEncounterIdsDefeated?.length ?? 0;
  const achievementUnlockCount = achievements.filter((achievement) => unlockedAchievementSet.has(achievement.id)).length;
  const callsignUnlockCount = callsignCatalog.filter((theme) => unlockedCallsignSet.has(theme.id)).length;
  const availableDebugSlots = debugSaveSlotIds.map((slotId, index) => ({ slotId, index, slot: debugSaveSlots?.[slotId] })).filter((entry) => entry.slot);
  const previewDeckCards = (selectedProfile?.deck || []).map((cardId) => ({ cardId, cardDef: data?.cards?.[cardId] })).filter(({ cardDef }) => cardDef).slice(0, 6);

  const menuActionStyle = (accent, solid = false) => ({
    width: '100%', padding: '18px', borderRadius: 18, border: `1px solid ${accent}${solid ? '00' : '55'}`,
    background: solid ? `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)` : `linear-gradient(180deg, ${accent}14 0%, rgba(9,11,18,0.96) 100%)`,
    color: solid ? '#041015' : accent, fontFamily: UI_MONO, fontWeight: 700, fontSize: 14, letterSpacing: '0.08em',
    textTransform: 'uppercase', boxShadow: solid ? `0 16px 32px ${accent}24` : `0 12px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)`,
    cursor: 'pointer', textAlign: 'left',
  });
  const tutorialActionStyle = (accent, solid = false) => ({
    width: '100%', padding: '16px 16px 14px', borderRadius: 18, border: `1px solid ${accent}${solid ? '00' : '44'}`,
    background: solid ? `linear-gradient(135deg, ${accent} 0%, ${accent}d6 100%)` : `linear-gradient(180deg, ${accent}12 0%, rgba(8,10,16,0.96) 100%)`,
    color: solid ? '#031014' : C.text, boxShadow: solid ? `0 18px 34px ${accent}26` : `0 12px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)`,
    cursor: 'pointer', textAlign: 'left', display: 'grid', gap: 10,
  });
  const optionCardStyle = (accent, selected, locked = false) => ({
    width: '100%', padding: '14px 14px 12px', borderRadius: 18, border: `1px solid ${selected ? `${accent}88` : `${accent}24`}`,
    background: selected ? `linear-gradient(180deg, ${accent}24 0%, rgba(8,10,16,0.96) 100%)` : 'linear-gradient(180deg, rgba(8,10,16,0.96) 0%, rgba(5,7,12,0.98) 100%)',
    color: C.text, boxShadow: selected ? `0 18px 34px ${accent}22` : '0 12px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)',
    cursor: locked ? 'default' : 'pointer', textAlign: 'left', opacity: locked ? 0.56 : 1, display: 'grid', gap: 8,
  });
  const selectorPillStyle = (accent, selected, locked = false) => ({
    padding: '10px 12px', borderRadius: 999, border: `1px solid ${selected ? `${accent}88` : `${accent}28`}`,
    background: selected ? `${accent}18` : 'rgba(255,255,255,0.03)', color: locked ? C.textDim : selected ? accent : C.text,
    fontFamily: UI_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: locked ? 'default' : 'pointer',
  });
  const sectionShellStyle = (accent = C.cyan) => ({
    padding: '18px 18px 20px', borderRadius: 22, border: `1px solid ${accent}26`,
    background: 'linear-gradient(180deg, rgba(9,14,22,0.96) 0%, rgba(6,8,14,0.99) 100%)',
    boxShadow: '0 22px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.03)', display: 'grid', gap: 14,
  });
  const infoPanelStyle = (accent = C.border) => ({
    padding: '14px 15px', borderRadius: 16, border: `1px solid ${accent === C.border ? C.border : `${accent}28`}`,
    background: accent === C.border ? 'rgba(255,255,255,0.03)' : `${accent}10`, display: 'grid', gap: 8,
  });
  const statTileStyle = (accent = C.text) => ({
    padding: '12px 10px', borderRadius: 16, border: `1px solid ${accent === C.text ? C.border : `${accent}24`}`,
    background: accent === C.text ? 'rgba(255,255,255,0.03)' : `${accent}10`, textAlign: 'center', display: 'grid', gap: 4,
  });
  const utilityButtonStyle = {
    padding: '10px 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text,
    fontFamily: UI_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
  };

  const sectionCopy = (accent, eyebrow, body) => (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.18em', color: accent }}>{eyebrow}</div>
      <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.65, color: C.textDim }}>{body}</div>
    </div>
  );

  const header = (accent, eyebrow, title, body) => (
    <div style={sectionShellStyle(accent)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 10, flex: '1 1 320px' }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 12, letterSpacing: '0.22em', color: C.textDim }}>{eyebrow}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 30, color: C.text }}>{title}</div>
            <div style={{ padding: '6px 10px', borderRadius: 999, border: `1px solid ${activeCallsignAccent}44`, background: `${activeCallsignAccent}12`, color: activeCallsignAccent, fontFamily: UI_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{activeCallsign?.name || 'Kernel Runner'}</div>
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 13, lineHeight: 1.7, color: C.textDim }}>{body}</div>
        </div>
        {menuView !== 'home' && <button onClick={() => setMenuView('home')} style={utilityButtonStyle}>Back to home</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={selectorPillStyle(selectedProfileAccent, true)}>{selectedProfile?.name || 'No starter'}</div>
        <div style={selectorPillStyle(selectedDifficultyAccent, true)}>{selectedDifficulty?.name || 'Standard'}</div>
        {activeChallengeList.slice(0, 2).map((challenge) => <div key={challenge.id} style={selectorPillStyle(challenge.accent || C.purple, true)}>{challenge.name}</div>)}
        {activeChallengeList.length > 2 && <div style={selectorPillStyle(C.purple, true)}>+{activeChallengeList.length - 2} more</div>}
      </div>
    </div>
  );

  const profilePreview = selectedProfile && (
    <div style={sectionShellStyle(selectedProfileAccent)}>
      {sectionCopy(selectedProfileAccent, 'ACTIVE LOADOUT', 'Starter identity, relics, and run modifiers now live here instead of cluttering the front page.')}
      <div style={infoPanelStyle(selectedProfileAccent)}>
        <div style={{ fontFamily: UI_MONO, fontSize: 16, fontWeight: 700, color: selectedProfileAccent }}>{selectedProfile.name}</div>
        <div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>{selectedProfile.description}</div>
        {!!selectedProfile.identityTags?.length && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{selectedProfile.identityTags.map((tag) => <span key={tag} style={{ padding: '5px 8px', borderRadius: 999, border: `1px solid ${selectedProfileAccent}24`, background: `${selectedProfileAccent}10`, color: selectedProfileAccent, fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tag}</span>)}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div style={infoPanelStyle(C.border)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>STARTING RELICS</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{selectedProfileRelics.join(', ') || 'No starting relic'}</div></div>
          <div style={infoPanelStyle(C.border)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>RUN MODIFIERS</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{selectedModeSummary.join(' | ') || 'Standard baseline'}</div></div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>DECK PREVIEW</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))', gap: 10 }}>
            {previewDeckCards.map(({ cardId, cardDef }) => {
              const accent = getCardColor(cardDef.type);
              return (
                <div key={cardId} style={{ display: 'grid', gap: 6 }}>
                  <RuntimeArt src={getCardImage(cardId)} alt={cardDef.name} accent={accent} label={cardDef.name} style={{ width: '100%', aspectRatio: '0.72', display: 'block', borderRadius: 12, overflow: 'hidden', border: `1px solid ${accent}24`, background: C.bgCard }} imageStyle={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.02) contrast(1.02) brightness(0.94)' }} fallbackStyle={{ borderRadius: 12, border: `1px solid ${accent}24` }} />
                  <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.4, color: C.text }}>{cardDef.name}</div>
                  <div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.4, color: C.textDim }}>{cardDef.type} | {Math.max(0, Number(cardDef.costRAM ?? 0))} RAM</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textDim }}>Full deck: {selectedProfileDeckNames.join(', ')}</div>
        </div>
      </div>
    </div>
  );

  let content = (
    <>
      {header(C.cyan, 'CARD BATTLER', 'Boot Sequence', 'The front door now stays focused: play, continue, or dive into a single submenu for setup, tutorials, intel, and recovery.')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={sectionShellStyle(C.yellow)}>
          {sectionCopy(C.yellow, 'QUICK ACTIONS', 'Launch from here. Variants and details live behind dedicated sections now.')}
          <div style={{ display: 'grid', gap: 10 }}>
            {canContinue && <button onClick={onContinue} style={menuActionStyle(C.green, true)}>Continue Run</button>}
            <button onClick={onNewGame} style={menuActionStyle(C.yellow, true)}>{selectedProfile ? `Deploy ${selectedProfile.shortLabel || selectedProfile.name}` : 'New Game'}</button>
            <button onClick={() => setMenuView('setup')} style={menuActionStyle(selectedProfileAccent)}>Run Setup</button>
            <button onClick={() => setMenuView('tutorials')} style={menuActionStyle(C.cyan)}>Tutorials</button>
            <button onClick={() => setMenuView('daily')} style={menuActionStyle(C.cyan)}>Daily Run</button>
            <button onClick={() => { setIntelView('progress'); setMenuView('intel'); }} style={menuActionStyle(C.green)}>Intel and Unlocks</button>
            {availableDebugSlots.length > 0 && <button onClick={() => setMenuView('recovery')} style={menuActionStyle(C.orange)}>Recovery Slots</button>}
            <button onClick={onSettings} style={menuActionStyle(C.purple)}>Settings</button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {profilePreview}
          <div style={sectionShellStyle(C.green)}>
            {sectionCopy(C.green, 'RUN SNAPSHOT', 'A compact overview of progress and the recommended next action.')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
              {[{ label: 'Runs', value: metaProgress?.totalRuns ?? 0, color: C.text }, { label: 'Wins', value: metaProgress?.totalWins ?? 0, color: C.green }, { label: 'Best Act', value: metaProgress?.bestActReached ?? 1, color: C.cyan }, { label: 'Mutations', value: metaProgress?.totalUniqueMutations ?? 0, color: C.purple }].map((stat) => <div key={stat.label} style={statTileStyle(stat.color)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.12em', color: C.textMuted }}>{stat.label}</div><div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 17, color: stat.color }}>{stat.value}</div></div>)}
            </div>
            {featuredTutorial && <div style={infoPanelStyle(C.cyan)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.cyan }}>FEATURED TUTORIAL</div><div style={{ fontFamily: UI_MONO, fontSize: 13, color: C.text }}>{featuredTutorial.title}</div><div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textDim }}>{featuredTutorial.menuDescription}</div><button onClick={() => onStartTutorial?.(featuredTutorial.id)} style={menuActionStyle(C.cyan)}>{completedSet.has(featuredTutorial.id) ? 'Replay Tutorial' : 'Start Tutorial'}</button></div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div style={infoPanelStyle(C.border)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>TODAY'S DAILY</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{dailyRunConfig?.id || 'Daily run unavailable'}</div><div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textDim }}>{dailyRunConfig?.summary || 'Fixed seed and shared loadout.'}</div></div>
              <div style={infoPanelStyle(C.border)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>LATEST UNLOCKS</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{recentUnlockLabels.slice(0, 3).join(' | ') || 'No recent unlocks yet'}</div></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (menuView === 'setup') {
    content = (
      <>
        {header(selectedProfileAccent, 'RUN SETUP', 'Loadout Bay', 'Profiles, difficulty, and challenge variants live here instead of on the landing page.')}
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={sectionShellStyle(C.orange)}>
            {sectionCopy(C.orange, 'STARTER PROFILES', 'Pick the runner archetype first. Locked profiles stay visible here, but not on the front page.')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {starterProfiles.map((profile) => {
                const locked = !unlockedStarterSet.has(profile.id);
                const selected = selectedStarterProfileId === profile.id;
                return <button key={profile.id} onClick={() => !locked && onSelectStarterProfile?.(profile.id)} style={optionCardStyle(profile.accent || C.orange, selected, locked)} title={locked ? profile.unlockHint : profile.description}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', color: profile.accent || C.orange }}>{profile.name}</div><div style={{ padding: '5px 8px', borderRadius: 999, border: `1px solid ${locked ? `${C.textMuted}26` : `${profile.accent || C.orange}28`}`, background: locked ? 'rgba(255,255,255,0.04)' : `${profile.accent || C.orange}12`, color: locked ? C.textDim : profile.accent || C.orange, fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{locked ? 'Locked' : selected ? 'Selected' : 'Ready'}</div></div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.textDim }}>{profile.description}</div><div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.5, color: locked ? C.textDim : C.text }}>{locked ? profile.unlockHint : `Starts with ${profile.startingRelicIds?.length || 0} relic and ${profile.deck?.length || 0} cards.`}</div></button>;
              })}
            </div>
          </div>
          {profilePreview}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={sectionShellStyle(selectedDifficultyAccent)}>{sectionCopy(selectedDifficultyAccent, 'DIFFICULTY', 'Baseline and ascension tuning stay in this pane.')}<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{difficultyProfiles.map((difficulty) => { const locked = !unlockedDifficultySet.has(difficulty.id); const selected = selectedDifficultyId === difficulty.id; return <button key={difficulty.id} onClick={() => !locked && onSelectDifficulty?.(difficulty.id)} style={selectorPillStyle(difficulty.accent || C.purple, selected, locked)} title={locked ? difficulty.unlockHint : difficulty.description}>{difficulty.name}</button>; })}</div><div style={infoPanelStyle(selectedDifficultyAccent)}><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{selectedDifficulty?.description || 'Standard baseline run.'}</div><div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textDim }}>Mode summary: {selectedModeSummary.join(' | ') || 'Standard baseline'}</div></div></div>
            <div style={sectionShellStyle(C.purple)}>{sectionCopy(C.purple, 'OPTIONAL CHALLENGES', 'Variations are still available, just no longer on the front page.')}<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{challengeModes.map((challenge) => { const locked = !unlockedChallengeSet.has(challenge.id); const selected = selectedChallenges.has(challenge.id); return <button key={challenge.id} onClick={() => !locked && onToggleChallenge?.(challenge.id)} style={selectorPillStyle(challenge.accent || C.purple, selected, locked)} title={locked ? challenge.unlockHint : challenge.description}>{challenge.name}</button>; })}</div><div style={infoPanelStyle(C.purple)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.purple }}>ACTIVE STACK</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{activeChallengeSummary}</div></div></div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button onClick={onNewGame} style={menuActionStyle(C.yellow, true)}>{selectedProfile ? `Deploy ${selectedProfile.shortLabel || selectedProfile.name}` : 'New Game'}</button>
            <button onClick={() => { setIntelView('callsigns'); setMenuView('intel'); }} style={menuActionStyle(activeCallsignAccent)}>Callsign Cosmetics</button>
          </div>
        </div>
      </>
    );
  } else if (menuView === 'tutorials') {
    content = (
      <>
        {header(C.cyan, 'TUTORIALS', 'Training Deck', 'Guided lessons stay together here, with the recommended entry point surfaced first.')}
        <div style={{ display: 'grid', gap: 16 }}>
          {featuredTutorial && <div style={sectionShellStyle(C.cyan)}>{sectionCopy(C.cyan, 'RECOMMENDED START', 'Combat Basics is the intended first stop.')}<div style={infoPanelStyle(C.cyan)}><div style={{ fontFamily: UI_MONO, fontSize: 16, fontWeight: 700, color: C.cyan }}>{featuredTutorial.title}</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: C.textDim }}>{featuredTutorial.menuDescription}</div><button onClick={() => onStartTutorial?.(featuredTutorial.id)} style={menuActionStyle(C.cyan, !completedSet.has(featuredTutorial.id))}>{completedSet.has(featuredTutorial.id) ? 'Replay Tutorial' : 'Start Recommended Tutorial'}</button></div></div>}
          <div style={sectionShellStyle(C.cyan)}>
            {sectionCopy(C.cyan, 'LESSON LIST', 'Every tutorial and its covered concepts are grouped here instead of being mixed into run setup.')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {tutorialCatalog.map((tutorial) => { const completed = completedSet.has(tutorial.id); const accent = tutorial.accent || C.cyan; const solid = tutorial.recommended && !completed; return <button key={tutorial.id} onClick={() => onStartTutorial?.(tutorial.id)} style={tutorialActionStyle(accent, solid)}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: solid ? '#031014' : accent }}>{tutorial.title}</div><div style={{ padding: '5px 8px', borderRadius: 999, border: `1px solid ${solid ? '#03101433' : `${accent}30`}`, background: solid ? 'rgba(3,16,20,0.12)' : `${accent}14`, color: solid ? '#031014' : accent, fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{completed ? 'Replay' : tutorial.recommended ? 'Recommended' : 'New'}</div></div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.6, color: solid ? '#052027' : C.textDim }}>{tutorial.menuDescription}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(tutorial.concepts || []).slice(0, 4).map((concept) => <span key={concept} style={{ padding: '5px 8px', borderRadius: 999, border: `1px solid ${solid ? '#03101422' : `${accent}24`}`, background: solid ? 'rgba(3,16,20,0.1)' : `${accent}10`, color: solid ? '#04161d' : accent, fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{concept}</span>)}</div></button>; })}
            </div>
          </div>
        </div>
      </>
    );
  } else if (menuView === 'daily') {
    content = (
      <>
        {header(C.cyan, 'DAILY RUN', 'Shared Breach', 'The shared-seed run has its own space now, with standings and schedule details tucked behind this submenu.')}
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={sectionShellStyle(C.cyan)}>{sectionCopy(C.cyan, 'TODAY', 'Fixed seed, fixed loadout, same breach for everyone on the same UTC day.')}<div style={infoPanelStyle(C.cyan)}><div style={{ fontFamily: UI_MONO, fontSize: 13, color: C.text }}>{dailyRunConfig?.id || 'Daily run unavailable'} | {dailyRunConfig?.summary || 'Shared seed run'}</div><div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textDim }}>Seed {dailyRunConfig?.seed ?? 0} | {dailyRunConfig?.resetLabel || 'Resets daily'}</div>{dailyRunRecord && <div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.55, color: C.textDim }}>Attempts {dailyRunRecord.attempts} | Best score {dailyRunRecord.bestScore} | Best floor {dailyRunRecord.bestFloorReached}</div>}</div><button onClick={onStartDailyRun} style={menuActionStyle(C.cyan, true)}>Launch Daily Run</button></div>
          <div style={sectionShellStyle(C.cyan)}>{sectionCopy(C.cyan, 'LOCAL STANDINGS', 'Recent device-local daily records stay here until there is a backend leaderboard.')}<div style={{ display: 'grid', gap: 8 }}>{recentDailyRecords.slice(0, 3).length ? recentDailyRecords.slice(0, 3).map((record) => <div key={record.id} style={{ ...infoPanelStyle(C.border), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><div style={{ display: 'grid', gap: 4 }}><div style={{ fontFamily: UI_MONO, fontSize: 11, color: C.text }}>{record.id}</div><div style={{ fontFamily: UI_MONO, fontSize: 10, color: C.textDim }}>{record.starterProfileName} | {record.difficultyName}</div></div><div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 12, color: record.bestVictory ? C.green : C.yellow }}>{record.bestScore}</div></div>) : <div style={infoPanelStyle(C.border)}><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.textDim }}>No local daily records yet.</div></div>}</div></div>
        </div>
      </>
    );
  } else if (menuView === 'intel') {
    const tabs = [{ id: 'progress', label: 'Progress', accent: C.yellow }, { id: 'achievements', label: 'Achievements', accent: C.green }, { id: 'bosses', label: 'Bosses', accent: C.red }, { id: 'callsigns', label: 'Callsigns', accent: activeCallsignAccent }];
    let panel = <div style={sectionShellStyle(C.yellow)}>{sectionCopy(C.yellow, 'META PROGRESSION', 'Permanent unlocks, run counts, and recent discoveries live here instead of taking over the front page.')}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>{[{ label: 'Runs', value: metaProgress?.totalRuns ?? 0, color: C.text }, { label: 'Wins', value: metaProgress?.totalWins ?? 0, color: C.green }, { label: 'Best Act', value: metaProgress?.bestActReached ?? 1, color: C.cyan }, { label: 'Mutations', value: metaProgress?.totalUniqueMutations ?? 0, color: C.purple }, { label: 'Achievements', value: achievementUnlockCount, color: C.green }, { label: 'Callsigns', value: callsignUnlockCount, color: activeCallsignAccent }].map((stat) => <div key={stat.label} style={statTileStyle(stat.color)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.12em', color: C.textMuted }}>{stat.label}</div><div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 17, color: stat.color }}>{stat.value}</div></div>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}><div style={infoPanelStyle(C.green)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.green }}>RECENT UNLOCKS</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{recentUnlockLabels.join(' | ') || 'No recent unlocks yet'}</div></div><div style={infoPanelStyle(C.border)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.14em', color: C.textMuted }}>ACTIVE MODE STACK</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.text }}>{selectedDifficulty?.name || 'Standard'} | {activeChallengeSummary}</div></div></div></div>;
    if (intelView === 'achievements') panel = <div style={sectionShellStyle(C.green)}>{sectionCopy(C.green, 'ACHIEVEMENTS', 'Run goals and reward unlocks are grouped here with their current state.')}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>{achievements.map((achievement) => { const unlocked = unlockedAchievementSet.has(achievement.id); return <div key={achievement.id} style={{ padding: '12px 14px', borderRadius: 16, border: `1px solid ${unlocked ? `${C.green}30` : C.border}`, background: unlocked ? `${C.green}0d` : 'rgba(255,255,255,0.03)', display: 'grid', gap: 6, opacity: unlocked ? 1 : 0.84 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><div style={{ fontFamily: UI_MONO, fontSize: 12, fontWeight: 700, color: unlocked ? C.green : C.text }}>{achievement.name}</div><div style={{ fontFamily: UI_MONO, fontSize: 10, color: unlocked ? C.green : C.textDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{unlocked ? 'Unlocked' : 'Locked'}</div></div><div style={{ fontFamily: UI_MONO, fontSize: 11, lineHeight: 1.5, color: C.textDim }}>{achievement.description}</div><div style={{ fontFamily: UI_MONO, fontSize: 10, lineHeight: 1.5, color: unlocked ? C.text : C.textMuted }}>Reward: {achievement.reward?.label || 'None'}</div></div>; })}</div></div>;
    if (intelView === 'bosses') panel = <div style={sectionShellStyle(C.red)}>{sectionCopy(C.red, 'BOSS ARCHIVE', 'Act bosses and sightings sit in their own archive instead of crowding the front page.')}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>{[{ label: 'Seen', value: seenBossCount, color: C.yellow }, { label: 'Defeated', value: defeatedBossCount, color: C.green }, { label: 'Pool', value: totalBossCount, color: C.red }].map((stat) => <div key={stat.label} style={statTileStyle(stat.color)}><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.12em', color: C.textMuted }}>{stat.label}</div><div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 17, color: stat.color }}>{stat.value}</div></div>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>{bossArchiveEntries.map((boss) => { const statusColor = boss.defeated ? C.green : boss.seen ? C.yellow : C.red; const statusLabel = boss.defeated ? 'Defeated' : boss.seen ? 'Seen' : 'Unknown'; return <div key={boss.id} style={{ padding: '12px 14px', borderRadius: 16, border: `1px solid ${statusColor}24`, background: `${statusColor}0d`, display: 'grid', gap: 6 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><div style={{ fontFamily: UI_MONO, fontWeight: 700, fontSize: 12, color: statusColor }}>{boss.name}</div><div style={{ fontFamily: UI_MONO, fontSize: 10, letterSpacing: '0.08em', color: statusColor, textTransform: 'uppercase' }}>{statusLabel}</div></div><div style={{ fontFamily: UI_MONO, fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>Act {boss.act} | {boss.enemyCount} enemy{boss.enemyCount === 1 ? '' : 'ies'} | {boss.totalHp || '?'} total HP</div><div style={{ fontFamily: UI_MONO, fontSize: 11, color: C.text, lineHeight: 1.5 }}>{(boss.enemies || []).map((enemy) => enemy.name).slice(0, 3).join(', ') || 'Unknown composition'}</div></div>; })}</div></div>;
    if (intelView === 'callsigns') panel = <div style={sectionShellStyle(activeCallsignAccent)}>{sectionCopy(activeCallsignAccent, 'CALLSIGNS', 'Cosmetic identity is tucked into Intel, where you can browse and equip unlocked themes.')}<div style={infoPanelStyle(activeCallsignAccent)}><div style={{ fontFamily: UI_MONO, fontSize: 16, fontWeight: 700, color: activeCallsignAccent }}>{activeCallsign?.name || 'Kernel Runner'}</div><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.textDim }}>{activeCallsign?.description || 'Default runner callsign.'}</div></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{callsignCatalog.map((theme) => { const unlocked = unlockedCallsignSet.has(theme.id); const selected = theme.id === callsignId; return <button key={theme.id} onClick={() => unlocked && onSelectCallsign?.(theme.id)} style={selectorPillStyle(theme.accent || C.cyan, selected, !unlocked)} title={unlocked ? theme.description : 'Unlock through achievements'}>{theme.name}</button>; })}</div></div>;
    content = <><>{header(C.green, 'INTEL', 'Archive and Unlocks', 'Progress, achievements, boss intel, and cosmetics now live behind one archive-style submenu.')}</><div style={{ display: 'grid', gap: 16 }}><div style={sectionShellStyle(C.green)}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{tabs.map((tab) => <button key={tab.id} onClick={() => setIntelView(tab.id)} style={selectorPillStyle(tab.accent, intelView === tab.id)}>{tab.label}</button>)}</div></div>{panel}</div></>;
  } else if (menuView === 'recovery') {
    content = <><>{header(C.orange, 'RECOVERY', 'Debug Slots', 'Recovery and debug saves are now tucked away unless you explicitly open them.')}</><div style={{ display: 'grid', gap: 16 }}><div style={sectionShellStyle(C.orange)}>{sectionCopy(C.orange, 'DEBUG SAVES', 'Use these only when you intentionally want to jump back into a stored internal slot.')}{availableDebugSlots.length ? <div style={{ display: 'grid', gap: 10 }}>{availableDebugSlots.map(({ slotId, index, slot }) => <button key={slotId} onClick={() => onLoadDebugSave?.(slotId)} style={{ ...menuActionStyle(C.orange), padding: '14px 16px', fontSize: 12 }}>Slot {index + 1}: {slot.label}</button>)}</div> : <div style={infoPanelStyle(C.border)}><div style={{ fontFamily: UI_MONO, fontSize: 12, lineHeight: 1.55, color: C.textDim }}>No recovery slots currently stored.</div></div>}</div></div></>;
  }

  return (
    <ScreenShell extraStyle={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(880px, 100%)', display: 'grid', gap: 18 }}>
        {content}
      </div>
    </ScreenShell>
  );
}
