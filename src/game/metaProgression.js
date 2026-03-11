import {
  STARTER_PROFILES,
  DIFFICULTY_PROFILES,
  CHALLENGE_MODES,
  isStarterProfileUnlocked,
  isDifficultyUnlocked,
  isChallengeUnlocked,
} from "./runProfiles";

export const META_PROGRESSION_STORAGE_KEY = "cb_meta_progress_v1";

export function createDefaultMetaProgress() {
  return {
    version: 1,
    totalRuns: 0,
    totalWins: 0,
    totalLosses: 0,
    bestActReached: 1,
    highestFloorReached: 1,
    totalBossesDefeated: 0,
    bossEncounterIdsSeen: [],
    bossEncounterIdsDefeated: [],
    mutationIdsSeen: [],
    totalUniqueMutations: 0,
    runHistory: [],
    lastUnlocks: [],
    lastRunSummary: null,
  };
}

function normalizeMetaProgress(raw) {
  const base = createDefaultMetaProgress();
  if (!raw || typeof raw !== "object") return base;
  const bossEncounterIdsSeen = Array.isArray(raw.bossEncounterIdsSeen)
    ? [...new Set(raw.bossEncounterIdsSeen.filter(Boolean))]
    : [];
  const bossEncounterIdsDefeated = Array.isArray(raw.bossEncounterIdsDefeated)
    ? [...new Set(raw.bossEncounterIdsDefeated.filter(Boolean))]
    : [];
  const mutationIdsSeen = Array.isArray(raw.mutationIdsSeen)
    ? [...new Set(raw.mutationIdsSeen.filter(Boolean))]
    : [];
  return {
    ...base,
    ...raw,
    bossEncounterIdsSeen,
    bossEncounterIdsDefeated,
    mutationIdsSeen,
    totalRuns: Math.max(0, Number(raw.totalRuns ?? base.totalRuns)),
    totalWins: Math.max(0, Number(raw.totalWins ?? base.totalWins)),
    totalLosses: Math.max(0, Number(raw.totalLosses ?? base.totalLosses)),
    bestActReached: Math.max(1, Number(raw.bestActReached ?? base.bestActReached)),
    highestFloorReached: Math.max(1, Number(raw.highestFloorReached ?? base.highestFloorReached)),
    totalBossesDefeated: Math.max(0, Number(raw.totalBossesDefeated ?? base.totalBossesDefeated)),
    totalUniqueMutations: mutationIdsSeen.length,
    runHistory: Array.isArray(raw.runHistory) ? raw.runHistory.slice(0, 12) : [],
    lastUnlocks: Array.isArray(raw.lastUnlocks) ? raw.lastUnlocks : [],
  };
}

export function readMetaProgress() {
  if (typeof window === "undefined") return createDefaultMetaProgress();
  try {
    const raw = window.localStorage.getItem(META_PROGRESSION_STORAGE_KEY);
    if (!raw) return createDefaultMetaProgress();
    return normalizeMetaProgress(JSON.parse(raw));
  } catch {
    return createDefaultMetaProgress();
  }
}

export function writeMetaProgress(metaProgress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(META_PROGRESSION_STORAGE_KEY, JSON.stringify(normalizeMetaProgress(metaProgress)));
}

function getUnlockedSet(definitions, isUnlocked, metaProgress) {
  return new Set(
    Object.keys(definitions).filter((id) => isUnlocked(id, metaProgress)),
  );
}

function getBossProgressFromRun(run) {
  const bossEntries = Array.isArray(run?.encounterHistory)
    ? run.encounterHistory.filter((entry) => entry?.kind === "boss")
    : [];
  const actReached = Math.max(1, Number(run?.act || 1));
  const seenBossIds = bossEntries.map((entry) => entry?.id).filter(Boolean);
  const defeatedBossIds = bossEntries
    .filter((entry) => {
      const bossAct = Math.max(1, Number(entry?.act || 1));
      return bossAct < actReached || (Boolean(run?.victory) && bossAct === actReached);
    })
    .map((entry) => entry?.id)
    .filter(Boolean);

  return {
    seenBossIds: [...new Set(seenBossIds)],
    defeatedBossIds: [...new Set(defeatedBossIds)],
  };
}

function summarizeRunForMeta(run) {
  if (!run || run.tutorial?.active) return null;
  const seenMutationIds = Array.isArray(run.seenMutationIds)
    ? [...new Set(run.seenMutationIds.filter(Boolean))]
    : [];
  const bossProgress = getBossProgressFromRun(run);
  const bossesDefeated = bossProgress.defeatedBossIds.length;
  return {
    seed: run.seed ?? Date.now(),
    victory: Boolean(run.victory),
    actReached: Math.max(1, Number(run.act || 1)),
    floorReached: Math.max(1, Number(run.floor || 1)),
    bossesDefeated,
    bossEncounterIdsSeen: bossProgress.seenBossIds,
    bossEncounterIdsDefeated: bossProgress.defeatedBossIds,
    starterProfileId: run.starterProfileId || "kernel",
    starterProfileName: run.starterProfileName || STARTER_PROFILES[run.starterProfileId || "kernel"]?.name || "Kernel Runner",
    difficultyId: run.difficultyId || "standard",
    difficultyName: DIFFICULTY_PROFILES[run.difficultyId || "standard"]?.name || "Standard",
    challengeIds: Array.isArray(run.challengeIds) ? run.challengeIds : [],
    seenMutationIds,
  };
}

export function applyRunResultToMetaProgress(currentMetaProgress, run) {
  const summary = summarizeRunForMeta(run);
  const current = normalizeMetaProgress(currentMetaProgress);
  if (!summary) return { nextMetaProgress: current, newUnlocks: [], summary: null };

  const unlockedProfilesBefore = getUnlockedSet(STARTER_PROFILES, isStarterProfileUnlocked, current);
  const unlockedDifficultiesBefore = getUnlockedSet(DIFFICULTY_PROFILES, isDifficultyUnlocked, current);
  const unlockedChallengesBefore = getUnlockedSet(CHALLENGE_MODES, isChallengeUnlocked, current);

  const bossEncounterIdsSeen = [...new Set([...current.bossEncounterIdsSeen, ...summary.bossEncounterIdsSeen])];
  const bossEncounterIdsDefeated = [...new Set([...current.bossEncounterIdsDefeated, ...summary.bossEncounterIdsDefeated])];
  const mutationIdsSeen = [...new Set([...current.mutationIdsSeen, ...summary.seenMutationIds])];
  const nextMetaProgress = normalizeMetaProgress({
    ...current,
    totalRuns: current.totalRuns + 1,
    totalWins: current.totalWins + (summary.victory ? 1 : 0),
    totalLosses: current.totalLosses + (summary.victory ? 0 : 1),
    bestActReached: Math.max(current.bestActReached, summary.actReached),
    highestFloorReached: Math.max(current.highestFloorReached, summary.floorReached),
    totalBossesDefeated: current.totalBossesDefeated + summary.bossesDefeated,
    bossEncounterIdsSeen,
    bossEncounterIdsDefeated,
    mutationIdsSeen,
    totalUniqueMutations: mutationIdsSeen.length,
    runHistory: [
      {
        seed: summary.seed,
        victory: summary.victory,
        actReached: summary.actReached,
        floorReached: summary.floorReached,
        bossesDefeated: summary.bossesDefeated,
        starterProfileId: summary.starterProfileId,
        difficultyId: summary.difficultyId,
      },
      ...(current.runHistory || []),
    ].slice(0, 12),
    lastRunSummary: summary,
  });

  const unlockedProfilesAfter = getUnlockedSet(STARTER_PROFILES, isStarterProfileUnlocked, nextMetaProgress);
  const unlockedDifficultiesAfter = getUnlockedSet(DIFFICULTY_PROFILES, isDifficultyUnlocked, nextMetaProgress);
  const unlockedChallengesAfter = getUnlockedSet(CHALLENGE_MODES, isChallengeUnlocked, nextMetaProgress);

  const newUnlocks = [];
  for (const [profileId, profile] of Object.entries(STARTER_PROFILES)) {
    if (!unlockedProfilesBefore.has(profileId) && unlockedProfilesAfter.has(profileId)) {
      newUnlocks.push({ type: "profile", id: profileId, name: profile.name });
    }
  }
  for (const [difficultyId, difficulty] of Object.entries(DIFFICULTY_PROFILES)) {
    if (!unlockedDifficultiesBefore.has(difficultyId) && unlockedDifficultiesAfter.has(difficultyId)) {
      newUnlocks.push({ type: "difficulty", id: difficultyId, name: difficulty.name });
    }
  }
  for (const [challengeId, challenge] of Object.entries(CHALLENGE_MODES)) {
    if (!unlockedChallengesBefore.has(challengeId) && unlockedChallengesAfter.has(challengeId)) {
      newUnlocks.push({ type: "challenge", id: challengeId, name: challenge.name });
    }
  }

  nextMetaProgress.lastUnlocks = newUnlocks;
  return { nextMetaProgress, newUnlocks, summary };
}

export function formatMetaUnlockSummary(newUnlocks = []) {
  if (!newUnlocks.length) return "";
  return newUnlocks.map((unlock) => unlock.name).join(", ");
}
