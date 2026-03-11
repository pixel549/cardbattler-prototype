export const RUN_BASELINE = {
  playerMaxHP: 75,
  startingGold: 99,
  maxMP: 6,
  travelHpCost: 2,
  drawPerTurnDelta: 0,
  enemyHpMult: 1,
  enemyDmgMult: 1,
};

export const STARTER_PROFILES = {
  kernel: {
    id: "kernel",
    name: "Kernel Runner",
    accent: "#00f0ff",
    shortLabel: "Kernel",
    description: "Balanced intrusion kit with a little damage, a little defense, and enough utility to learn the lane you're drafting into.",
    unlockHint: "Available from the start.",
    deck: ["C-001", "C-002", "C-003", "C-004", "C-006", "NC-001", "NC-003", "NC-019", "NC-020"],
    startingRelicIds: ["NeuralCache"],
    modifiers: {},
    identityTags: ["Balanced", "Learn", "Adapt"],
    unlock: { defaultUnlocked: true },
  },
  bruteforce: {
    id: "bruteforce",
    name: "Bruteforce",
    accent: "#ff6b00",
    shortLabel: "Bruteforce",
    description: "Aggressive opener built around cheap hits, explosive finishers, and RAM spikes that reward ending fights fast.",
    unlockHint: "Unlock by finishing 1 run.",
    deck: ["C-001", "C-001", "C-002", "C-006", "NC-001", "NC-002", "NC-025", "NC-027", "NC-035"],
    startingRelicIds: ["Overclock"],
    modifiers: { playerMaxHPDelta: -4, startingGoldDelta: -12 },
    identityTags: ["Aggro", "Exploit", "Burst"],
    unlock: { totalRuns: 1 },
  },
  ghost: {
    id: "ghost",
    name: "Ghost",
    accent: "#6ce4ff",
    shortLabel: "Ghost",
    description: "Skittish control shell that leans on Scry, hand shaping, and evasive tempo instead of raw damage racing.",
    unlockHint: "Unlock by reaching Act 2.",
    deck: ["C-001", "C-002", "C-004", "C-006", "NC-040", "NC-041", "NC-043", "NC-045", "NC-057"],
    startingRelicIds: ["LatencyChip"],
    modifiers: { playerMaxHPDelta: -2, startingGoldDelta: 6 },
    identityTags: ["Control", "Tempo", "Scry"],
    unlock: { bestActReached: 2 },
  },
  architect: {
    id: "architect",
    name: "Architect",
    accent: "#7df37d",
    shortLabel: "Architect",
    description: "Firewall-first control deck that snowballs stable turns into impossible board states and safe scaling.",
    unlockHint: "Unlock by winning a run.",
    deck: ["C-001", "C-002", "C-002", "C-004", "C-006", "NC-003", "NC-014", "NC-016", "NC-059"],
    startingRelicIds: ["SignalJammer"],
    modifiers: { playerMaxHPDelta: 4, startingGoldDelta: -18 },
    identityTags: ["Firewall", "Power", "Control"],
    unlock: { totalWins: 1 },
  },
  scrapper: {
    id: "scrapper",
    name: "Scrapper",
    accent: "#ffe600",
    shortLabel: "Scrapper",
    description: "Mutation-hunting junk diver with cleanup tools, weird sequencing, and the highest ceiling once cards start warping.",
    unlockHint: "Unlock by discovering 10 mutations across runs.",
    deck: ["C-001", "C-003", "C-006", "NC-005", "NC-021", "NC-044", "NC-048", "NC-053", "NC-099"],
    startingRelicIds: ["WornToolkit"],
    modifiers: { startingGoldDelta: 10 },
    identityTags: ["Mutation", "Salvage", "Cleanup"],
    unlock: { totalUniqueMutations: 10 },
  },
};

export const DIFFICULTY_PROFILES = {
  standard: {
    id: "standard",
    name: "Standard",
    accent: "#00f0ff",
    description: "Baseline run balance.",
    unlockHint: "Available from the start.",
    modifiers: {},
    unlock: { defaultUnlocked: true },
  },
  veteran: {
    id: "veteran",
    name: "Veteran",
    accent: "#ffb347",
    description: "Enemies hit harder and hold the board more often. Recommended once you've cleared a run.",
    unlockHint: "Unlock by winning a run.",
    modifiers: {
      enemyHpMultMult: 1.16,
      enemyDmgMultMult: 1.14,
      startingGoldDelta: -10,
    },
    unlock: { totalWins: 1 },
  },
  blackout: {
    id: "blackout",
    name: "Blackout",
    accent: "#ff5a7a",
    description: "A pressure-cooker mode: tougher enemies, less setup room, and tighter resource starts.",
    unlockHint: "Unlock by winning 3 runs.",
    modifiers: {
      enemyHpMultMult: 1.28,
      enemyDmgMultMult: 1.24,
      drawPerTurnDelta: -1,
      startingGoldDelta: -25,
    },
    unlock: { totalWins: 3 },
  },
};

export const CHALLENGE_MODES = {
  low_bandwidth: {
    id: "low_bandwidth",
    name: "Low Bandwidth",
    accent: "#b44aff",
    description: "Start with more money, but draw one fewer card each turn.",
    unlockHint: "Unlock by finishing 2 runs.",
    modifiers: {
      drawPerTurnDelta: -1,
      startingGoldDelta: 35,
    },
    unlock: { totalRuns: 2 },
  },
  glass_route: {
    id: "glass_route",
    name: "Glass Route",
    accent: "#ff4444",
    description: "Start rich, but with reduced max HP. Great for testing risky lines.",
    unlockHint: "Unlock by winning a run.",
    modifiers: {
      playerMaxHPDelta: -12,
      startingGoldDelta: 60,
    },
    unlock: { totalWins: 1 },
  },
};

export function getStarterProfile(profileId) {
  return STARTER_PROFILES[profileId] || STARTER_PROFILES.kernel;
}

export function getDifficultyProfile(difficultyId) {
  return DIFFICULTY_PROFILES[difficultyId] || DIFFICULTY_PROFILES.standard;
}

export function getChallengeMode(challengeId) {
  return CHALLENGE_MODES[challengeId] || null;
}

function meetsUnlock(metaProgress, unlock = {}) {
  if (unlock.defaultUnlocked) return true;
  if ((metaProgress?.totalRuns || 0) < (unlock.totalRuns || 0)) return false;
  if ((metaProgress?.totalWins || 0) < (unlock.totalWins || 0)) return false;
  if ((metaProgress?.bestActReached || 0) < (unlock.bestActReached || 0)) return false;
  if ((metaProgress?.totalUniqueMutations || 0) < (unlock.totalUniqueMutations || 0)) return false;
  return true;
}

export function isStarterProfileUnlocked(profileId, metaProgress) {
  const profile = getStarterProfile(profileId);
  return meetsUnlock(metaProgress, profile.unlock);
}

export function isDifficultyUnlocked(difficultyId, metaProgress) {
  const difficulty = getDifficultyProfile(difficultyId);
  return meetsUnlock(metaProgress, difficulty.unlock);
}

export function isChallengeUnlocked(challengeId, metaProgress) {
  const challenge = getChallengeMode(challengeId);
  return meetsUnlock(metaProgress, challenge?.unlock);
}

export function getUnlockedStarterProfiles(metaProgress) {
  return Object.values(STARTER_PROFILES).filter((profile) => isStarterProfileUnlocked(profile.id, metaProgress));
}

export function getUnlockedDifficulties(metaProgress) {
  return Object.values(DIFFICULTY_PROFILES).filter((difficulty) => isDifficultyUnlocked(difficulty.id, metaProgress));
}

export function getUnlockedChallenges(metaProgress) {
  return Object.values(CHALLENGE_MODES).filter((challenge) => isChallengeUnlocked(challenge.id, metaProgress));
}

export function getProfileRelicChips(profile) {
  return [...(profile?.startingRelicIds || [])];
}

export function composeRunConfig(customConfig = {}, profileId = "kernel", difficultyId = "standard", challengeIds = []) {
  const profile = getStarterProfile(profileId);
  const difficulty = getDifficultyProfile(difficultyId);
  const challenges = (challengeIds || []).map((challengeId) => getChallengeMode(challengeId)).filter(Boolean);

  const merged = {
    ...RUN_BASELINE,
    ...(customConfig || {}),
  };

  if (merged.playerMaxHP == null) merged.playerMaxHP = RUN_BASELINE.playerMaxHP;
  if (merged.startingGold == null) merged.startingGold = RUN_BASELINE.startingGold;
  if (merged.maxMP == null) merged.maxMP = RUN_BASELINE.maxMP;
  if (merged.travelHpCost == null) merged.travelHpCost = RUN_BASELINE.travelHpCost;
  if (merged.drawPerTurnDelta == null) merged.drawPerTurnDelta = RUN_BASELINE.drawPerTurnDelta;
  if (merged.enemyHpMult == null) merged.enemyHpMult = RUN_BASELINE.enemyHpMult;
  if (merged.enemyDmgMult == null) merged.enemyDmgMult = RUN_BASELINE.enemyDmgMult;

  const allModifierSources = [profile, difficulty, ...challenges];
  for (const source of allModifierSources) {
    const modifiers = source?.modifiers || {};
    if (modifiers.playerMaxHPDelta) merged.playerMaxHP += modifiers.playerMaxHPDelta;
    if (modifiers.startingGoldDelta) merged.startingGold += modifiers.startingGoldDelta;
    if (modifiers.maxMPDelta) merged.maxMP += modifiers.maxMPDelta;
    if (modifiers.travelHpCostDelta) merged.travelHpCost += modifiers.travelHpCostDelta;
    if (modifiers.drawPerTurnDelta) merged.drawPerTurnDelta += modifiers.drawPerTurnDelta;
    if (modifiers.enemyHpMultMult) merged.enemyHpMult *= modifiers.enemyHpMultMult;
    if (modifiers.enemyDmgMultMult) merged.enemyDmgMult *= modifiers.enemyDmgMultMult;
  }

  merged.playerMaxHP = Math.max(20, Math.round(merged.playerMaxHP));
  merged.startingGold = Math.max(0, Math.round(merged.startingGold));
  merged.maxMP = Math.max(3, Math.round(merged.maxMP));
  merged.travelHpCost = Math.max(0, Math.round(merged.travelHpCost));
  merged.drawPerTurnDelta = Math.round(merged.drawPerTurnDelta);
  merged.enemyHpMult = Number(merged.enemyHpMult.toFixed(2));
  merged.enemyDmgMult = Number(merged.enemyDmgMult.toFixed(2));

  return merged;
}

export function getRunStartSummary(profileId = "kernel", difficultyId = "standard", challengeIds = []) {
  const profile = getStarterProfile(profileId);
  const difficulty = getDifficultyProfile(difficultyId);
  const challenges = (challengeIds || []).map((challengeId) => getChallengeMode(challengeId)).filter(Boolean);
  return {
    profile,
    difficulty,
    challenges,
  };
}
