import { RNG } from "./rng.js";

export const RUN_BASELINE = {
  playerMaxHP: 75,
  startingGold: 99,
  maxMP: 6,
  travelHpCost: 2,
  playerMaxRAM: 8,
  playerRamRegen: 2,
  drawPerTurnDelta: 0,
  enemyHpMult: 1,
  enemyDmgMult: 1,
  finalCountdownTickDelta: 0,
  mutationTriggerChanceMult: 1,
};

const STARTER_LOADOUT_POOLS = {
  attack: {
    id: "attack",
    name: "Random Attack",
    accent: "#ff6b00",
    description: "Resolves into a non-core attack card at run start.",
  },
  defense: {
    id: "defense",
    name: "Random Defense",
    accent: "#7df37d",
    description: "Resolves into a non-core defense card at run start.",
  },
  support: {
    id: "support",
    name: "Random Support",
    accent: "#00ff6b",
    description: "Resolves into a non-core support card at run start.",
  },
  utility: {
    id: "utility",
    name: "Random Utility",
    accent: "#00f0ff",
    description: "Resolves into a non-core utility card at run start.",
  },
  firewall: {
    id: "firewall",
    name: "Random Firewall",
    accent: "#7df37d",
    description: "Resolves into a defense card from the firewall pool at run start.",
  },
};

function fixedCard(defId) {
  return { kind: "card", defId };
}

function randomCard(poolId, overrides = {}) {
  return { kind: "random", poolId, ...overrides };
}

export const STARTER_PROFILES = {
  kernel: {
    id: "kernel",
    name: "Kernel Runner",
    accent: "#00f0ff",
    shortLabel: "Kernel",
    description: "Balanced intrusion kit with a little damage, a little defense, and enough utility to learn the lane you're drafting into.",
    unlockHint: "Available from the start.",
    deck: ["C-001", "C-002", "C-003", "C-004", "C-006", "NC-001", "NC-003", "NC-019", "NC-020"],
    loadoutSlots: [
      fixedCard("C-001"),
      fixedCard("C-002"),
      fixedCard("C-003"),
      fixedCard("C-004"),
      fixedCard("C-006"),
      fixedCard("NC-001"),
      fixedCard("NC-003"),
      randomCard("support"),
      randomCard("utility"),
    ],
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
    loadoutSlots: [
      fixedCard("C-001"),
      fixedCard("C-001"),
      fixedCard("C-002"),
      fixedCard("C-006"),
      fixedCard("NC-001"),
      fixedCard("NC-002"),
      fixedCard("NC-025"),
      randomCard("attack"),
      randomCard("attack"),
    ],
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
    loadoutSlots: [
      fixedCard("C-001"),
      fixedCard("C-002"),
      fixedCard("C-004"),
      fixedCard("C-006"),
      fixedCard("NC-040"),
      fixedCard("NC-041"),
      fixedCard("NC-043"),
      randomCard("utility"),
      randomCard("support"),
    ],
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
    loadoutSlots: [
      fixedCard("C-001"),
      fixedCard("C-002"),
      fixedCard("C-002"),
      fixedCard("C-004"),
      fixedCard("C-006"),
      fixedCard("NC-003"),
      fixedCard("NC-014"),
      randomCard("defense"),
      randomCard("firewall"),
    ],
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
    loadoutSlots: [
      fixedCard("C-001"),
      fixedCard("C-003"),
      fixedCard("C-006"),
      fixedCard("NC-005"),
      fixedCard("NC-021"),
      fixedCard("NC-044"),
      fixedCard("NC-048"),
      randomCard("utility"),
      randomCard("support"),
    ],
    startingRelicIds: ["WornToolkit"],
    modifiers: { startingGoldDelta: 10 },
    identityTags: ["Mutation", "Salvage", "Cleanup"],
    unlock: { totalUniqueMutations: 10 },
  },
};

const ASCENSION_LEVELS = [
  {
    level: 1,
    accent: "#ffb347",
    description: "Enemies scale up immediately and early gold dries up. A clean first step once Standard is solved.",
    modifiers: {
      enemyHpMultMult: 1.1,
      enemyDmgMultMult: 1.08,
      startingGoldDelta: -10,
    },
    unlock: { totalWins: 1, highestDifficultyRankCleared: 0 },
  },
  {
    level: 2,
    accent: "#ffad5a",
    description: "Travel mistakes sting harder and frontline enemies survive long enough to force real sequencing.",
    modifiers: {
      enemyHpMultMult: 1.18,
      enemyDmgMultMult: 1.14,
      startingGoldDelta: -20,
      travelHpCostDelta: 1,
    },
    unlock: { highestDifficultyRankCleared: 1 },
  },
  {
    level: 3,
    accent: "#ff9966",
    description: "Draw slows down, so deck control matters more than raw hand extension.",
    modifiers: {
      enemyHpMultMult: 1.24,
      enemyDmgMultMult: 1.18,
      drawPerTurnDelta: -1,
      startingGoldDelta: -24,
    },
    unlock: { highestDifficultyRankCleared: 2 },
  },
  {
    level: 4,
    accent: "#ff826f",
    description: "Mutation clocks speed up. Strong cards get weird sooner, and bad sequencing snowballs faster.",
    modifiers: {
      enemyHpMultMult: 1.3,
      enemyDmgMultMult: 1.22,
      finalCountdownTickDelta: 1,
      mutationTriggerChanceMultMult: 1.08,
      startingGoldDelta: -30,
    },
    unlock: { highestDifficultyRankCleared: 3 },
  },
  {
    level: 5,
    accent: "#ff6c79",
    description: "Your RAM ceiling tightens while enemies keep scaling. Tempo decks need real discipline here.",
    modifiers: {
      enemyHpMultMult: 1.36,
      enemyDmgMultMult: 1.26,
      playerMaxRAMDelta: -1,
      mutationTriggerChanceMultMult: 1.12,
      startingGoldDelta: -34,
    },
    unlock: { highestDifficultyRankCleared: 4 },
  },
  {
    level: 6,
    accent: "#ff5a86",
    description: "Your shell gets thinner: less HP, less RAM regen, and more mutation pressure every combat.",
    modifiers: {
      enemyHpMultMult: 1.42,
      enemyDmgMultMult: 1.3,
      playerMaxHPDelta: -6,
      playerRamRegenDelta: -1,
      finalCountdownTickDelta: 1,
      mutationTriggerChanceMultMult: 1.18,
      startingGoldDelta: -38,
    },
    unlock: { highestDifficultyRankCleared: 5 },
  },
  {
    level: 7,
    accent: "#ff4a93",
    description: "Card velocity drops again and your RAM bar shrinks. Thin, decisive decks pull ahead.",
    modifiers: {
      enemyHpMultMult: 1.48,
      enemyDmgMultMult: 1.34,
      playerMaxRAMDelta: -1,
      drawPerTurnDelta: -1,
      startingGoldDelta: -42,
    },
    unlock: { highestDifficultyRankCleared: 6 },
  },
  {
    level: 8,
    accent: "#ff4aa8",
    description: "The route itself bites back. Mutations spiral faster and travel pressure punishes sloppy pathing.",
    modifiers: {
      enemyHpMultMult: 1.54,
      enemyDmgMultMult: 1.38,
      travelHpCostDelta: 1,
      finalCountdownTickDelta: 1,
      mutationTriggerChanceMultMult: 1.25,
      startingGoldDelta: -48,
    },
    unlock: { highestDifficultyRankCleared: 7 },
  },
  {
    level: 9,
    accent: "#ff52c1",
    description: "Recovery windows nearly disappear. Lower HP, lower draw, and lower regen force proactive lines.",
    modifiers: {
      enemyHpMultMult: 1.6,
      enemyDmgMultMult: 1.42,
      playerMaxHPDelta: -10,
      playerRamRegenDelta: -1,
      drawPerTurnDelta: -1,
      startingGoldDelta: -52,
    },
    unlock: { highestDifficultyRankCleared: 8 },
  },
  {
    level: 10,
    accent: "#ff5fe0",
    description: "Full pressure mode: harder fights, weaker economy, tighter RAM, and mutation decay at its meanest.",
    modifiers: {
      enemyHpMultMult: 1.68,
      enemyDmgMultMult: 1.48,
      playerMaxRAMDelta: -2,
      travelHpCostDelta: 1,
      finalCountdownTickDelta: 2,
      mutationTriggerChanceMultMult: 1.35,
      startingGoldDelta: -58,
    },
    unlock: { highestDifficultyRankCleared: 9 },
  },
];

const ASCENSION_DIFFICULTIES = Object.fromEntries(
  ASCENSION_LEVELS.map((entry) => {
    const id = `ascension_${entry.level}`;
    return [
      id,
      {
        id,
        rank: entry.level,
        name: `Ascension ${entry.level}`,
        accent: entry.accent,
        description: entry.description,
        unlockHint: entry.level === 1
          ? "Unlock by winning a Standard run."
          : `Unlock by clearing Ascension ${entry.level - 1}.`,
        modifiers: entry.modifiers,
        unlock: entry.unlock,
      },
    ];
  }),
);

export const DIFFICULTY_PROFILES = {
  standard: {
    id: "standard",
    rank: 0,
    name: "Standard",
    accent: "#00f0ff",
    description: "Baseline run balance.",
    unlockHint: "Available from the start.",
    modifiers: {},
    unlock: { defaultUnlocked: true },
  },
  ...ASCENSION_DIFFICULTIES,
};

const LEGACY_DIFFICULTY_ALIASES = {
  veteran: "ascension_1",
  blackout: "ascension_3",
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
  endless_protocol: {
    id: "endless_protocol",
    name: "Endless Protocol",
    accent: "#b44aff",
    description: "After Act 3 the run no longer ends. The network keeps generating harsher acts forever.",
    unlockHint: "Unlock by winning a run.",
    modifiers: {},
    unlock: { totalWins: 1 },
  },
};

export function getStarterProfile(profileId) {
  return STARTER_PROFILES[profileId] || STARTER_PROFILES.kernel;
}

export function getDifficultyProfile(difficultyId) {
  const resolvedId = LEGACY_DIFFICULTY_ALIASES[difficultyId] || difficultyId;
  return DIFFICULTY_PROFILES[resolvedId] || DIFFICULTY_PROFILES.standard;
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
  if ((metaProgress?.highestDifficultyRankCleared || 0) < (unlock.highestDifficultyRankCleared || 0)) return false;
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

function normalizeCardType(type = "") {
  return String(type || "").trim().toLowerCase();
}

function hasCardTag(cardDef, tag) {
  return (cardDef?.tags || []).some((entry) => String(entry || "").trim().toLowerCase() === String(tag || "").trim().toLowerCase());
}

function isStarterPoolCandidate(cardDef, poolId) {
  if (!cardDef || hasCardTag(cardDef, "EnemyCard")) return false;
  const type = normalizeCardType(cardDef.type);
  const isCore = hasCardTag(cardDef, "Core");
  switch (poolId) {
    case "attack":
      return type === "attack" && !isCore;
    case "defense":
      return type === "defense" && !isCore;
    case "support":
      return type === "support" && !isCore;
    case "utility":
      return type === "utility" && !isCore;
    case "firewall":
      return type === "defense" && hasCardTag(cardDef, "Firewall") && !isCore;
    default:
      return false;
  }
}

export function getStarterProfileLoadoutSlots(profileIdOrProfile = "kernel") {
  const profile = typeof profileIdOrProfile === "string"
    ? getStarterProfile(profileIdOrProfile)
    : profileIdOrProfile;
  if (!profile) return [];
  if (Array.isArray(profile.loadoutSlots) && profile.loadoutSlots.length) {
    return profile.loadoutSlots.map((slot) => ({ ...slot }));
  }
  return (profile.deck || []).map((defId) => fixedCard(defId));
}

export function getStarterProfileDeckSize(profileIdOrProfile = "kernel") {
  return getStarterProfileLoadoutSlots(profileIdOrProfile).length;
}

export function getStarterLoadoutPool(poolId) {
  return STARTER_LOADOUT_POOLS[poolId] || null;
}

export function getStarterLoadoutPoolCandidates(data, poolId, excludeIds = []) {
  if (!data?.cards || !STARTER_LOADOUT_POOLS[poolId]) return [];
  const excluded = new Set(excludeIds || []);
  return Object.values(data.cards)
    .filter((cardDef) => isStarterPoolCandidate(cardDef, poolId))
    .filter((cardDef) => !excluded.has(cardDef.id))
    .map((cardDef) => cardDef.id)
    .sort();
}

export function resolveStarterProfileDeck(data, seed, profileIdOrProfile = "kernel") {
  const profile = typeof profileIdOrProfile === "string"
    ? getStarterProfile(profileIdOrProfile)
    : profileIdOrProfile;
  const loadoutSlots = getStarterProfileLoadoutSlots(profile);
  const starter = [];
  const used = new Set();
  const rng = new RNG((seed >>> 0) || 1);

  for (const slot of loadoutSlots) {
    if (slot?.kind === "card" && slot.defId) {
      starter.push(slot.defId);
      used.add(slot.defId);
      continue;
    }
    if (slot?.kind !== "random") continue;

    const candidates = getStarterLoadoutPoolCandidates(data, slot.poolId, [...used, ...(slot.excludeIds || [])]);
    const fallbackCandidates = candidates.length
      ? candidates
      : getStarterLoadoutPoolCandidates(data, slot.poolId, slot.excludeIds || []);
    const chosenId = fallbackCandidates.length ? fallbackCandidates[rng.int(fallbackCandidates.length)] : null;
    if (!chosenId) continue;
    starter.push(chosenId);
    used.add(chosenId);
  }

  if (starter.length) return starter;
  return (profile?.deck || []).slice();
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
  if (merged.playerMaxRAM == null) merged.playerMaxRAM = RUN_BASELINE.playerMaxRAM;
  if (merged.playerRamRegen == null) merged.playerRamRegen = RUN_BASELINE.playerRamRegen;
  if (merged.drawPerTurnDelta == null) merged.drawPerTurnDelta = RUN_BASELINE.drawPerTurnDelta;
  if (merged.enemyHpMult == null) merged.enemyHpMult = RUN_BASELINE.enemyHpMult;
  if (merged.enemyDmgMult == null) merged.enemyDmgMult = RUN_BASELINE.enemyDmgMult;
  if (merged.finalCountdownTickDelta == null) merged.finalCountdownTickDelta = RUN_BASELINE.finalCountdownTickDelta;
  if (merged.mutationTriggerChanceMult == null) merged.mutationTriggerChanceMult = RUN_BASELINE.mutationTriggerChanceMult;

  const allModifierSources = [profile, difficulty, ...challenges];
  for (const source of allModifierSources) {
    const modifiers = source?.modifiers || {};
    if (modifiers.playerMaxHPDelta) merged.playerMaxHP += modifiers.playerMaxHPDelta;
    if (modifiers.startingGoldDelta) merged.startingGold += modifiers.startingGoldDelta;
    if (modifiers.maxMPDelta) merged.maxMP += modifiers.maxMPDelta;
    if (modifiers.travelHpCostDelta) merged.travelHpCost += modifiers.travelHpCostDelta;
    if (modifiers.playerMaxRAMDelta) merged.playerMaxRAM += modifiers.playerMaxRAMDelta;
    if (modifiers.playerRamRegenDelta) merged.playerRamRegen += modifiers.playerRamRegenDelta;
    if (modifiers.drawPerTurnDelta) merged.drawPerTurnDelta += modifiers.drawPerTurnDelta;
    if (modifiers.enemyHpMultMult) merged.enemyHpMult *= modifiers.enemyHpMultMult;
    if (modifiers.enemyDmgMultMult) merged.enemyDmgMult *= modifiers.enemyDmgMultMult;
    if (modifiers.finalCountdownTickDelta) merged.finalCountdownTickDelta += modifiers.finalCountdownTickDelta;
    if (modifiers.mutationTriggerChanceMultMult) merged.mutationTriggerChanceMult *= modifiers.mutationTriggerChanceMultMult;
  }

  merged.playerMaxHP = Math.max(20, Math.round(merged.playerMaxHP));
  merged.startingGold = Math.max(0, Math.round(merged.startingGold));
  merged.maxMP = Math.max(3, Math.round(merged.maxMP));
  merged.travelHpCost = Math.max(0, Math.round(merged.travelHpCost));
  merged.playerMaxRAM = Math.max(3, Math.round(merged.playerMaxRAM));
  merged.playerRamRegen = Math.max(0, Math.round(merged.playerRamRegen));
  merged.drawPerTurnDelta = Math.round(merged.drawPerTurnDelta);
  merged.enemyHpMult = Number(merged.enemyHpMult.toFixed(2));
  merged.enemyDmgMult = Number(merged.enemyDmgMult.toFixed(2));
  merged.finalCountdownTickDelta = Math.max(0, Math.round(merged.finalCountdownTickDelta));
  merged.mutationTriggerChanceMult = Number(merged.mutationTriggerChanceMult.toFixed(2));

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
