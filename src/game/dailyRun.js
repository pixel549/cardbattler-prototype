import { STARTER_PROFILES, DIFFICULTY_PROFILES, CHALLENGE_MODES } from "./runProfiles.js";

const DAILY_PROFILE_ROTATION = ["kernel", "bruteforce", "ghost", "architect", "scrapper"];
const DAILY_DIFFICULTY_ROTATION = ["standard", "ascension_1", "ascension_2", "ascension_3"];
const DAILY_CHALLENGE_ROTATION = [
  [],
  ["low_bandwidth"],
  ["glass_route"],
  ["low_bandwidth", "glass_route"],
  [],
];

function hashString(value) {
  let hash = 2166136261;
  const source = String(value ?? "");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatUtcDateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getProfileIdFromHash(hash) {
  return DAILY_PROFILE_ROTATION[hash % DAILY_PROFILE_ROTATION.length] || "kernel";
}

function getDifficultyIdFromHash(hash) {
  return DAILY_DIFFICULTY_ROTATION[Math.floor(hash / 7) % DAILY_DIFFICULTY_ROTATION.length] || "standard";
}

function getChallengeIdsFromHash(hash) {
  return DAILY_CHALLENGE_ROTATION[Math.floor(hash / 37) % DAILY_CHALLENGE_ROTATION.length] || [];
}

export function getDailyRunConfig(date = new Date()) {
  const id = formatUtcDateKey(date);
  const hash = hashString(`cardbattler_daily_${id}`);
  const starterProfileId = getProfileIdFromHash(hash);
  const difficultyId = getDifficultyIdFromHash(hash);
  const challengeIds = getChallengeIdsFromHash(hash);

  const starterProfile = STARTER_PROFILES[starterProfileId] || STARTER_PROFILES.kernel;
  const difficulty = DIFFICULTY_PROFILES[difficultyId] || DIFFICULTY_PROFILES.standard;
  const challengeNames = challengeIds
    .map((challengeId) => CHALLENGE_MODES[challengeId]?.name)
    .filter(Boolean);

  return {
    id,
    seed: hashString(`cardbattler_daily_seed_${id}`),
    resetLabel: "Resets at 00:00 UTC",
    starterProfileId,
    starterProfileName: starterProfile.name,
    difficultyId,
    difficultyName: difficulty.name,
    challengeIds,
    challengeNames,
    summary: challengeNames.length > 0
      ? `${starterProfile.name} • ${difficulty.name} • ${challengeNames.join(" + ")}`
      : `${starterProfile.name} • ${difficulty.name}`,
  };
}

export function scoreRunForDaily(run) {
  const actReached = Math.max(1, Number(run?.telemetry?.highestActReached ?? run?.act ?? 1));
  const floorReached = Math.max(1, Number(run?.floor ?? 1));
  const bossesDefeated = Math.max(0, Number(run?.telemetry?.bossesDefeated ?? 0));
  const repairsUsed = Math.max(0, Number(run?.telemetry?.repairsUsed ?? 0));
  const compileCount = Math.max(0, Number(run?.telemetry?.compileCount ?? 0));
  const bricksTriggered = Math.max(0, Number(run?.telemetry?.bricksTriggered ?? 0));
  const hp = Math.max(0, Number(run?.hp ?? 0));
  const gold = Math.max(0, Number(run?.gold ?? 0));
  const baseScore = (run?.victory ? 100000 : 0)
    + (actReached * 12000)
    + (floorReached * 260)
    + (bossesDefeated * 4500)
    + (compileCount * 220)
    + (bricksTriggered * 150)
    + (hp * 24)
    + (gold * 5)
    - (repairsUsed * 700);
  return Math.max(0, Math.round(baseScore));
}
