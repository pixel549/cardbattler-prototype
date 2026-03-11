const DEFAULT_CALLSIGN_ID = "kernel_runner";

export const CALLSIGN_THEMES = {
  [DEFAULT_CALLSIGN_ID]: {
    id: DEFAULT_CALLSIGN_ID,
    name: "Kernel Runner",
    accent: "#00f0ff",
    description: "The stock callsign that ships with the runner shell.",
    defaultUnlocked: true,
  },
  compiler_saint: {
    id: "compiler_saint",
    name: "Compiler Saint",
    accent: "#7df37d",
    description: "Reserved for operators who can deliberately improve their code under pressure.",
  },
  daily_ghost: {
    id: "daily_ghost",
    name: "Daily Ghost",
    accent: "#6ce4ff",
    description: "Proof that you cleared the rotating daily breach window.",
  },
  endless_signal: {
    id: "endless_signal",
    name: "Endless Signal",
    accent: "#b44aff",
    description: "Earned by surviving past the end of the scripted network.",
  },
};

export const ACHIEVEMENTS = {
  iron_maintenance: {
    id: "iron_maintenance",
    name: "Iron Maintenance",
    description: "Win a run without using Repair even once.",
    reward: {
      type: "relic",
      id: "EntropyEngine",
      label: "Entropy Engine",
      description: "Unlocks the Entropy Engine relic for future boss reward pools.",
    },
    check: (run) => Boolean(run?.victory) && getTelemetryValue(run, "repairsUsed") === 0,
  },
  bricklayer: {
    id: "bricklayer",
    name: "Bricklayer",
    description: "Brick 5 cards in a single run.",
    reward: {
      type: "card",
      id: "P-011",
      label: "Binary Staircase",
      description: "Unlocks Binary Staircase for future rewards and shops.",
    },
    check: (run) => getTelemetryValue(run, "bricksTriggered") >= 5,
  },
  compiler_spree: {
    id: "compiler_spree",
    name: "Compile Spree",
    description: "Compile 3 cards in one run.",
    reward: {
      type: "cosmetic",
      id: "compiler_saint",
      label: "Compiler Saint",
      description: "Unlocks the Compiler Saint callsign.",
    },
    check: (run) => getTelemetryValue(run, "compileCount") >= 3,
  },
  curse_runner: {
    id: "curse_runner",
    name: "Curse Runner",
    description: "Win while carrying at least 2 Curse cards.",
    reward: {
      type: "relic",
      id: "CursedCompiler",
      label: "Cursed Compiler",
      description: "Unlocks the Cursed Compiler relic for future boss reward pools.",
    },
    check: (run) => Boolean(run?.victory) && getTelemetryValue(run, "currentCurseCount") >= 2,
  },
  daily_ghost: {
    id: "daily_ghost",
    name: "Daily Ghost",
    description: "Clear a Daily Run.",
    reward: {
      type: "cosmetic",
      id: "daily_ghost",
      label: "Daily Ghost",
      description: "Unlocks the Daily Ghost callsign.",
    },
    check: (run) => isDailyRun(run) && Boolean(run?.victory),
  },
  endless_protocol: {
    id: "endless_protocol",
    name: "Endless Protocol",
    description: "Reach Act 5 in Endless Mode.",
    reward: {
      type: "card",
      id: "P-006",
      label: "Forked Compiler",
      description: "Unlocks Forked Compiler for future rewards and shops.",
    },
    check: (run) => isEndlessRun(run) && getHighestActReached(run) >= 5,
  },
};

const ACHIEVEMENT_CARD_IDS = new Set(
  Object.values(ACHIEVEMENTS)
    .map((achievement) => achievement.reward)
    .filter((reward) => reward?.type === "card")
    .map((reward) => reward.id),
);

const ACHIEVEMENT_RELIC_IDS = new Set(
  Object.values(ACHIEVEMENTS)
    .map((achievement) => achievement.reward)
    .filter((reward) => reward?.type === "relic")
    .map((reward) => reward.id),
);

export function getDefaultCallsignId() {
  return DEFAULT_CALLSIGN_ID;
}

export function getCallsignCatalog() {
  return Object.values(CALLSIGN_THEMES);
}

export function getCallsignTheme(themeId) {
  return CALLSIGN_THEMES[themeId] || CALLSIGN_THEMES[DEFAULT_CALLSIGN_ID];
}

export function normalizeAchievementIds(rawIds) {
  return Array.isArray(rawIds)
    ? [...new Set(rawIds.filter((achievementId) => ACHIEVEMENTS[achievementId]))]
    : [];
}

export function normalizeCallsignIds(rawIds) {
  const normalized = Array.isArray(rawIds)
    ? rawIds.filter((themeId) => CALLSIGN_THEMES[themeId])
    : [];
  return [...new Set([DEFAULT_CALLSIGN_ID, ...normalized])];
}

export function getAchievementCatalog() {
  return Object.values(ACHIEVEMENTS);
}

export function getAchievementDefinition(achievementId) {
  return ACHIEVEMENTS[achievementId] || null;
}

export function getUnlockedAchievementRewardState(unlockedAchievementIds = []) {
  const unlockedIds = new Set(normalizeAchievementIds(unlockedAchievementIds));
  const unlockedCardIds = [];
  const unlockedRelicIds = [];
  const unlockedCallsignIds = [DEFAULT_CALLSIGN_ID];

  for (const achievement of Object.values(ACHIEVEMENTS)) {
    if (!unlockedIds.has(achievement.id)) continue;
    const reward = achievement.reward;
    if (!reward) continue;
    if (reward.type === "card") unlockedCardIds.push(reward.id);
    if (reward.type === "relic") unlockedRelicIds.push(reward.id);
    if (reward.type === "cosmetic") unlockedCallsignIds.push(reward.id);
  }

  return {
    unlockedAchievementIds: [...unlockedIds],
    unlockedCardIds: [...new Set(unlockedCardIds)],
    unlockedRelicIds: [...new Set(unlockedRelicIds)],
    unlockedCallsignIds: normalizeCallsignIds(unlockedCallsignIds),
  };
}

export function isAchievementRewardCard(cardId) {
  return ACHIEVEMENT_CARD_IDS.has(cardId);
}

export function isAchievementRewardRelic(relicId) {
  return ACHIEVEMENT_RELIC_IDS.has(relicId);
}

export function isCardUnlockedByAchievements(cardId, unlockedCardIds = []) {
  return !isAchievementRewardCard(cardId) || new Set(unlockedCardIds).has(cardId);
}

export function isRelicUnlockedByAchievements(relicId, unlockedRelicIds = []) {
  return !isAchievementRewardRelic(relicId) || new Set(unlockedRelicIds).has(relicId);
}

export function evaluateRunAchievements(run, unlockedAchievementIds = []) {
  const unlockedSet = new Set(normalizeAchievementIds(unlockedAchievementIds));
  return Object.values(ACHIEVEMENTS)
    .filter((achievement) => !unlockedSet.has(achievement.id) && achievement.check(run))
    .map((achievement) => achievement.id);
}

export function getAchievementUnlockEntries(achievementIds = []) {
  const entries = [];
  for (const achievementId of normalizeAchievementIds(achievementIds)) {
    const achievement = ACHIEVEMENTS[achievementId];
    if (!achievement) continue;
    entries.push({
      type: "achievement",
      id: achievement.id,
      name: achievement.name,
    });
    if (achievement.reward?.label) {
      entries.push({
        type: achievement.reward.type,
        id: achievement.reward.id,
        name: achievement.reward.label,
      });
    }
  }
  return entries;
}

export function getHighestActReached(run) {
  return Math.max(
    1,
    Number(run?.telemetry?.highestActReached ?? run?.act ?? 1),
  );
}

export function isDailyRun(run) {
  return String(run?.runMode || "standard") === "daily";
}

export function isEndlessRun(run) {
  return Array.isArray(run?.challengeIds) && run.challengeIds.includes("endless_protocol");
}

export function getTelemetryValue(run, key) {
  return Math.max(0, Number(run?.telemetry?.[key] || 0));
}
