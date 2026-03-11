import {
  STARTER_PROFILES,
  DIFFICULTY_PROFILES,
  CHALLENGE_MODES,
  isStarterProfileUnlocked,
  isDifficultyUnlocked,
  isChallengeUnlocked,
} from "./runProfiles";
import {
  getDefaultCallsignId,
  normalizeAchievementIds,
  normalizeCallsignIds,
  evaluateRunAchievements,
  getAchievementUnlockEntries,
  getUnlockedAchievementRewardState,
  getHighestActReached,
} from "./achievements";
import { scoreRunForDaily } from "./dailyRun";

export const META_PROGRESSION_STORAGE_KEY = "cb_meta_progress_v1";

export function createDefaultMetaProgress() {
  return {
    version: 1,
    totalRuns: 0,
    totalWins: 0,
    totalLosses: 0,
    highestDifficultyRankCleared: 0,
    bestActReached: 1,
    highestFloorReached: 1,
    totalBossesDefeated: 0,
    bossEncounterIdsSeen: [],
    bossEncounterIdsDefeated: [],
    mutationIdsSeen: [],
    totalUniqueMutations: 0,
    runHistory: [],
    achievementIdsUnlocked: [],
    unlockedCallsignIds: [getDefaultCallsignId()],
    dailyRunRecords: [],
    lastUnlocks: [],
    lastRunSummary: null,
  };
}

function normalizeDailyRunRecords(rawRecords) {
  return Array.isArray(rawRecords)
    ? rawRecords
        .filter((record) => record && typeof record === "object" && record.id)
        .map((record) => ({
          id: String(record.id),
          seed: Number(record.seed || 0),
          starterProfileId: record.starterProfileId || "kernel",
          starterProfileName: record.starterProfileName || STARTER_PROFILES.kernel.name,
          difficultyId: record.difficultyId || "standard",
          difficultyName: record.difficultyName || DIFFICULTY_PROFILES.standard.name,
          challengeIds: Array.isArray(record.challengeIds) ? record.challengeIds.filter(Boolean) : [],
          summary: record.summary || "",
          attempts: Math.max(0, Number(record.attempts || 0)),
          victories: Math.max(0, Number(record.victories || 0)),
          bestScore: Math.max(0, Number(record.bestScore || 0)),
          bestActReached: Math.max(1, Number(record.bestActReached || 1)),
          bestFloorReached: Math.max(1, Number(record.bestFloorReached || 1)),
          lastPlayedAt: Math.max(0, Number(record.lastPlayedAt || 0)),
          bestVictory: Boolean(record.bestVictory),
          recentResults: Array.isArray(record.recentResults)
            ? record.recentResults.slice(0, 5).map((result) => ({
                playedAt: Math.max(0, Number(result?.playedAt || 0)),
                score: Math.max(0, Number(result?.score || 0)),
                victory: Boolean(result?.victory),
                actReached: Math.max(1, Number(result?.actReached || 1)),
                floorReached: Math.max(1, Number(result?.floorReached || 1)),
              }))
            : [],
        }))
        .slice(0, 30)
    : [];
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
  const achievementIdsUnlocked = normalizeAchievementIds(raw.achievementIdsUnlocked);
  const unlockedAchievementRewards = getUnlockedAchievementRewardState(achievementIdsUnlocked);
  return {
    ...base,
    ...raw,
    bossEncounterIdsSeen,
    bossEncounterIdsDefeated,
    mutationIdsSeen,
    totalRuns: Math.max(0, Number(raw.totalRuns ?? base.totalRuns)),
    totalWins: Math.max(0, Number(raw.totalWins ?? base.totalWins)),
    totalLosses: Math.max(0, Number(raw.totalLosses ?? base.totalLosses)),
    highestDifficultyRankCleared: Math.max(0, Number(raw.highestDifficultyRankCleared ?? base.highestDifficultyRankCleared)),
    bestActReached: Math.max(1, Number(raw.bestActReached ?? base.bestActReached)),
    highestFloorReached: Math.max(1, Number(raw.highestFloorReached ?? base.highestFloorReached)),
    totalBossesDefeated: Math.max(0, Number(raw.totalBossesDefeated ?? base.totalBossesDefeated)),
    totalUniqueMutations: mutationIdsSeen.length,
    runHistory: Array.isArray(raw.runHistory) ? raw.runHistory.slice(0, 12) : [],
    achievementIdsUnlocked,
    unlockedCallsignIds: normalizeCallsignIds([
      ...(Array.isArray(raw.unlockedCallsignIds) ? raw.unlockedCallsignIds : []),
      ...unlockedAchievementRewards.unlockedCallsignIds,
    ]),
    dailyRunRecords: normalizeDailyRunRecords(raw.dailyRunRecords),
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
  const bossesDefeated = Math.max(
    bossProgress.defeatedBossIds.length,
    Math.max(0, Number(run?.telemetry?.bossesDefeated || 0)),
  );
  const highestActReached = getHighestActReached(run);
  const dailyScore = String(run?.runMode || "standard") === "daily"
    ? scoreRunForDaily(run)
    : null;
  return {
    seed: run.seed ?? Date.now(),
    victory: Boolean(run.victory),
    actReached: highestActReached,
    floorReached: Math.max(1, Number(run.floor || 1)),
    bossesDefeated,
    bossEncounterIdsSeen: bossProgress.seenBossIds,
    bossEncounterIdsDefeated: bossProgress.defeatedBossIds,
    starterProfileId: run.starterProfileId || "kernel",
    starterProfileName: run.starterProfileName || STARTER_PROFILES[run.starterProfileId || "kernel"]?.name || "Kernel Runner",
    difficultyId: run.difficultyId || "standard",
    difficultyName: DIFFICULTY_PROFILES[run.difficultyId || "standard"]?.name || "Standard",
    difficultyRank: Math.max(0, Number(DIFFICULTY_PROFILES[run.difficultyId || "standard"]?.rank || 0)),
    challengeIds: Array.isArray(run.challengeIds) ? run.challengeIds : [],
    runMode: run.runMode || "standard",
    dailyRunId: run.dailyRunId || null,
    dailyRunLabel: run.dailyRunLabel || null,
    dailyScore,
    repairsUsed: Math.max(0, Number(run?.telemetry?.repairsUsed || 0)),
    compileCount: Math.max(0, Number(run?.telemetry?.compileCount || 0)),
    bricksTriggered: Math.max(0, Number(run?.telemetry?.bricksTriggered || 0)),
    curseCount: Math.max(0, Number(run?.telemetry?.currentCurseCount || 0)),
    endlessDepthReached: Math.max(0, highestActReached - 3),
    seenMutationIds,
  };
}

function upsertDailyRunRecord(records, summary) {
  if (!summary?.dailyRunId) return normalizeDailyRunRecords(records);
  const normalized = normalizeDailyRunRecords(records);
  const next = [...normalized];
  const index = next.findIndex((record) => record.id === summary.dailyRunId);
  const existing = index >= 0 ? next[index] : null;
  const recentResults = [
    {
      playedAt: Date.now(),
      score: Math.max(0, Number(summary.dailyScore || 0)),
      victory: Boolean(summary.victory),
      actReached: summary.actReached,
      floorReached: summary.floorReached,
    },
    ...((existing?.recentResults || []).slice(0, 4)),
  ];
  const updated = {
    id: summary.dailyRunId,
    seed: summary.seed,
    starterProfileId: summary.starterProfileId,
    starterProfileName: summary.starterProfileName,
    difficultyId: summary.difficultyId,
    difficultyName: summary.difficultyName,
    challengeIds: Array.isArray(summary.challengeIds) ? summary.challengeIds : [],
    summary: summary.dailyRunLabel || "",
    attempts: (existing?.attempts || 0) + 1,
    victories: (existing?.victories || 0) + (summary.victory ? 1 : 0),
    bestScore: Math.max(existing?.bestScore || 0, Number(summary.dailyScore || 0)),
    bestActReached: Math.max(existing?.bestActReached || 1, summary.actReached || 1),
    bestFloorReached: Math.max(existing?.bestFloorReached || 1, summary.floorReached || 1),
    lastPlayedAt: Date.now(),
    bestVictory: Boolean(existing?.bestVictory || summary.victory),
    recentResults,
  };

  if (index >= 0) next[index] = updated;
  else next.unshift(updated);
  return next.slice(0, 30);
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
  const newlyUnlockedAchievementIds = evaluateRunAchievements(run, current.achievementIdsUnlocked);
  const achievementIdsUnlocked = normalizeAchievementIds([
    ...current.achievementIdsUnlocked,
    ...newlyUnlockedAchievementIds,
  ]);
  const achievementRewardState = getUnlockedAchievementRewardState(achievementIdsUnlocked);
  const nextMetaProgress = normalizeMetaProgress({
    ...current,
    totalRuns: current.totalRuns + 1,
    totalWins: current.totalWins + (summary.victory ? 1 : 0),
    totalLosses: current.totalLosses + (summary.victory ? 0 : 1),
    highestDifficultyRankCleared: summary.victory
      ? Math.max(current.highestDifficultyRankCleared || 0, summary.difficultyRank || 0)
      : Math.max(0, Number(current.highestDifficultyRankCleared || 0)),
    bestActReached: Math.max(current.bestActReached, summary.actReached),
    highestFloorReached: Math.max(current.highestFloorReached, summary.floorReached),
    totalBossesDefeated: current.totalBossesDefeated + summary.bossesDefeated,
    bossEncounterIdsSeen,
    bossEncounterIdsDefeated,
    mutationIdsSeen,
    totalUniqueMutations: mutationIdsSeen.length,
    achievementIdsUnlocked,
    unlockedCallsignIds: achievementRewardState.unlockedCallsignIds,
    dailyRunRecords: summary.runMode === "daily"
      ? upsertDailyRunRecord(current.dailyRunRecords, summary)
      : current.dailyRunRecords,
    runHistory: [
      {
        seed: summary.seed,
        victory: summary.victory,
        actReached: summary.actReached,
        floorReached: summary.floorReached,
        bossesDefeated: summary.bossesDefeated,
        starterProfileId: summary.starterProfileId,
        difficultyId: summary.difficultyId,
        runMode: summary.runMode,
        dailyRunId: summary.dailyRunId,
        dailyScore: summary.dailyScore,
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
  newUnlocks.push(...getAchievementUnlockEntries(newlyUnlockedAchievementIds));

  nextMetaProgress.lastUnlocks = newUnlocks;
  return { nextMetaProgress, newUnlocks, summary };
}

export function formatMetaUnlockSummary(newUnlocks = []) {
  if (!newUnlocks.length) return "";
  return newUnlocks.map((unlock) => unlock.name).join(", ");
}
