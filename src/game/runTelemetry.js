export const RUN_ANALYTICS_STORAGE_KEY = 'cb_run_analytics_v1';

function createTutorialStats() {
  return {
    id: 'combat_basics',
    title: 'Combat Basics',
    started: 0,
    completed: 0,
    exited: 0,
    stepAdvances: 0,
    lastExitStepId: null,
    exitSteps: {},
  };
}

export function createRunTelemetry() {
  return {
    repairsUsed: 0,
    compileCount: 0,
    bricksTriggered: 0,
    bossesDefeated: 0,
    highestActReached: 1,
    currentCurseCount: 0,
    peakCurseCount: 0,
    currentCompiledCount: 0,
    peakCompiledCount: 0,
    currentBrickedCount: 0,
    peakBrickedCount: 0,
    lowRamTurns: 0,
    ramStarvedTurns: 0,
    peakHeat: 0,
    criticalHeatTurns: 0,
    scrapSpent: 0,
    shopScrapSpent: 0,
    serviceScrapSpent: 0,
    eventScrapSpent: 0,
    eliteCombatsEntered: 0,
    eliteCombatsLost: 0,
    bossCombatsEntered: 0,
    bossCombatsLost: 0,
  };
}

export function ensureRunTelemetry(run) {
  if (!run) return createRunTelemetry();
  if (!run.telemetry || typeof run.telemetry !== 'object') {
    run.telemetry = createRunTelemetry();
    return run.telemetry;
  }
  run.telemetry = {
    ...createRunTelemetry(),
    ...run.telemetry,
  };
  return run.telemetry;
}

export function incrementRunTelemetry(run, key, amount = 1) {
  const telemetry = ensureRunTelemetry(run);
  telemetry[key] = Math.max(0, Number(telemetry[key] || 0) + Number(amount || 0));
  return telemetry[key];
}

export function maxRunTelemetry(run, key, value) {
  const telemetry = ensureRunTelemetry(run);
  telemetry[key] = Math.max(Number(telemetry[key] || 0), Number(value || 0));
  return telemetry[key];
}

export function trackRunScrapSpend(run, amount = 0, source = 'service') {
  const spent = Math.max(0, Number(amount || 0));
  if (!spent) return 0;
  incrementRunTelemetry(run, 'scrapSpent', spent);
  if (source === 'shop') incrementRunTelemetry(run, 'shopScrapSpent', spent);
  else if (source === 'event') incrementRunTelemetry(run, 'eventScrapSpent', spent);
  else incrementRunTelemetry(run, 'serviceScrapSpent', spent);
  return spent;
}

function createStarterProfileStats() {
  return {
    id: 'kernel',
    name: 'Kernel Runner',
    runs: 0,
    wins: 0,
    losses: 0,
    ramStarvedTurns: 0,
    peakHeatTotal: 0,
    scrapSpent: 0,
    firstEliteAttempts: 0,
    firstEliteLosses: 0,
    firstBossAttempts: 0,
    firstBossLosses: 0,
  };
}

export function createRunAnalytics() {
  return {
    version: 2,
    totalRuns: 0,
    totalWins: 0,
    totalLosses: 0,
    ramStarvedTurnsTotal: 0,
    peakHeatTotal: 0,
    scrapSpentTotal: 0,
    criticalHeatTurnsTotal: 0,
    firstEliteAttempts: 0,
    firstEliteLosses: 0,
    firstBossAttempts: 0,
    firstBossLosses: 0,
    tutorialSessionsStarted: 0,
    tutorialSessionsCompleted: 0,
    tutorialSessionsExited: 0,
    tutorialStepAdvances: 0,
    starterProfiles: {},
    tutorials: {},
    recentRuns: [],
  };
}

function normalizeTutorialStats(raw) {
  const base = createTutorialStats();
  const normalizedExitSteps = Object.fromEntries(
    Object.entries(raw?.exitSteps || {})
      .filter(([stepId]) => Boolean(stepId))
      .map(([stepId, count]) => [stepId, Math.max(0, Number(count || 0))]),
  );
  return {
    ...base,
    ...(raw || {}),
    id: raw?.id || base.id,
    title: raw?.title || base.title,
    started: Math.max(0, Number(raw?.started || 0)),
    completed: Math.max(0, Number(raw?.completed || 0)),
    exited: Math.max(0, Number(raw?.exited || 0)),
    stepAdvances: Math.max(0, Number(raw?.stepAdvances || 0)),
    lastExitStepId: raw?.lastExitStepId || null,
    exitSteps: normalizedExitSteps,
  };
}

function normalizeStarterProfileStats(raw) {
  const base = createStarterProfileStats();
  return {
    ...base,
    ...(raw || {}),
    id: raw?.id || base.id,
    name: raw?.name || base.name,
    runs: Math.max(0, Number(raw?.runs || 0)),
    wins: Math.max(0, Number(raw?.wins || 0)),
    losses: Math.max(0, Number(raw?.losses || 0)),
    ramStarvedTurns: Math.max(0, Number(raw?.ramStarvedTurns || 0)),
    peakHeatTotal: Math.max(0, Number(raw?.peakHeatTotal || 0)),
    scrapSpent: Math.max(0, Number(raw?.scrapSpent || 0)),
    firstEliteAttempts: Math.max(0, Number(raw?.firstEliteAttempts || 0)),
    firstEliteLosses: Math.max(0, Number(raw?.firstEliteLosses || 0)),
    firstBossAttempts: Math.max(0, Number(raw?.firstBossAttempts || 0)),
    firstBossLosses: Math.max(0, Number(raw?.firstBossLosses || 0)),
  };
}

function normalizeRecentRun(raw) {
  return {
    endedAt: raw?.endedAt || new Date().toISOString(),
    victory: Boolean(raw?.victory),
    starterProfileId: raw?.starterProfileId || 'kernel',
    starterProfileName: raw?.starterProfileName || 'Kernel Runner',
    difficultyId: raw?.difficultyId || 'standard',
    difficultyName: raw?.difficultyName || 'Standard',
    actReached: Math.max(1, Number(raw?.actReached || 1)),
    floorReached: Math.max(1, Number(raw?.floorReached || 1)),
    ramStarvedTurns: Math.max(0, Number(raw?.ramStarvedTurns || 0)),
    peakHeat: Math.max(0, Number(raw?.peakHeat || 0)),
    scrapSpent: Math.max(0, Number(raw?.scrapSpent || 0)),
    criticalHeatTurns: Math.max(0, Number(raw?.criticalHeatTurns || 0)),
    firstEliteAttempt: Boolean(raw?.firstEliteAttempt),
    firstEliteLoss: Boolean(raw?.firstEliteLoss),
    firstBossAttempt: Boolean(raw?.firstBossAttempt),
    firstBossLoss: Boolean(raw?.firstBossLoss),
  };
}

export function normalizeRunAnalytics(rawAnalytics) {
  const base = createRunAnalytics();
  if (!rawAnalytics || typeof rawAnalytics !== 'object') return base;
  const starterProfiles = Object.fromEntries(
    Object.entries(rawAnalytics.starterProfiles || {}).map(([profileId, profile]) => [
      profileId,
      normalizeStarterProfileStats({ ...profile, id: profile?.id || profileId }),
    ]),
  );
  const tutorials = Object.fromEntries(
    Object.entries(rawAnalytics.tutorials || {}).map(([tutorialId, tutorial]) => [
      tutorialId,
      normalizeTutorialStats({ ...tutorial, id: tutorial?.id || tutorialId }),
    ]),
  );
  return {
    ...base,
    ...rawAnalytics,
    totalRuns: Math.max(0, Number(rawAnalytics.totalRuns || 0)),
    totalWins: Math.max(0, Number(rawAnalytics.totalWins || 0)),
    totalLosses: Math.max(0, Number(rawAnalytics.totalLosses || 0)),
    ramStarvedTurnsTotal: Math.max(0, Number(rawAnalytics.ramStarvedTurnsTotal || 0)),
    peakHeatTotal: Math.max(0, Number(rawAnalytics.peakHeatTotal || 0)),
    scrapSpentTotal: Math.max(0, Number(rawAnalytics.scrapSpentTotal || 0)),
    criticalHeatTurnsTotal: Math.max(0, Number(rawAnalytics.criticalHeatTurnsTotal || 0)),
    firstEliteAttempts: Math.max(0, Number(rawAnalytics.firstEliteAttempts || 0)),
    firstEliteLosses: Math.max(0, Number(rawAnalytics.firstEliteLosses || 0)),
    firstBossAttempts: Math.max(0, Number(rawAnalytics.firstBossAttempts || 0)),
    firstBossLosses: Math.max(0, Number(rawAnalytics.firstBossLosses || 0)),
    tutorialSessionsStarted: Math.max(0, Number(rawAnalytics.tutorialSessionsStarted || 0)),
    tutorialSessionsCompleted: Math.max(0, Number(rawAnalytics.tutorialSessionsCompleted || 0)),
    tutorialSessionsExited: Math.max(0, Number(rawAnalytics.tutorialSessionsExited || 0)),
    tutorialStepAdvances: Math.max(0, Number(rawAnalytics.tutorialStepAdvances || 0)),
    starterProfiles,
    tutorials,
    recentRuns: Array.isArray(rawAnalytics.recentRuns)
      ? rawAnalytics.recentRuns.slice(0, 18).map(normalizeRecentRun)
      : [],
  };
}

export function recordTutorialAnalyticsEvent(currentAnalytics, event = {}) {
  const next = normalizeRunAnalytics(currentAnalytics);
  const tutorialId = event?.tutorialId || 'combat_basics';
  const tutorial = normalizeTutorialStats({
    ...(next.tutorials[tutorialId] || createTutorialStats()),
    id: tutorialId,
    title: event?.title || next.tutorials[tutorialId]?.title || tutorialId,
  });
  const stepId = event?.stepId || null;

  switch (event?.type) {
    case 'start':
      next.tutorialSessionsStarted += 1;
      tutorial.started += 1;
      break;
    case 'complete':
      next.tutorialSessionsCompleted += 1;
      tutorial.completed += 1;
      break;
    case 'exit':
      next.tutorialSessionsExited += 1;
      tutorial.exited += 1;
      if (stepId) {
        tutorial.lastExitStepId = stepId;
        tutorial.exitSteps[stepId] = Math.max(0, Number(tutorial.exitSteps[stepId] || 0)) + 1;
      }
      break;
    case 'advance':
      next.tutorialStepAdvances += 1;
      tutorial.stepAdvances += 1;
      break;
    default:
      return next;
  }

  next.tutorials[tutorialId] = tutorial;
  return next;
}

export function summarizeRunRecordForAnalytics(runRecord) {
  const telemetry = runRecord?.runTelemetry || {};
  const encounters = Array.isArray(runRecord?.encounters) ? runRecord.encounters : [];
  const firstElite = encounters.find((encounter) => encounter?.nodeType === 'Elite') || null;
  const firstBoss = encounters.find((encounter) => encounter?.nodeType === 'Boss') || null;
  const victory = runRecord?.outcome === 'victory' || Boolean(runRecord?.victory);
  return normalizeRecentRun({
    endedAt: runRecord?.endTime || new Date().toISOString(),
    victory,
    starterProfileId: runRecord?.starterProfileId || 'kernel',
    starterProfileName: runRecord?.starterProfileName || 'Kernel Runner',
    difficultyId: runRecord?.difficultyId || 'standard',
    difficultyName: runRecord?.difficultyName || 'Standard',
    actReached: runRecord?.finalAct || 1,
    floorReached: runRecord?.finalFloor || 1,
    ramStarvedTurns: telemetry.ramStarvedTurns,
    peakHeat: telemetry.peakHeat,
    scrapSpent: telemetry.scrapSpent,
    criticalHeatTurns: telemetry.criticalHeatTurns,
    firstEliteAttempt: Boolean(firstElite),
    firstEliteLoss: Boolean(firstElite && firstElite.result === 'loss'),
    firstBossAttempt: Boolean(firstBoss),
    firstBossLoss: Boolean(firstBoss && firstBoss.result === 'loss'),
  });
}

export function ingestRunRecordAnalytics(currentAnalytics, runRecord) {
  const next = normalizeRunAnalytics(currentAnalytics);
  const summary = summarizeRunRecordForAnalytics(runRecord);
  const profileId = summary.starterProfileId || 'kernel';
  const profile = normalizeStarterProfileStats({
    ...(next.starterProfiles[profileId] || createStarterProfileStats()),
    id: profileId,
    name: summary.starterProfileName || next.starterProfiles[profileId]?.name || 'Kernel Runner',
  });

  next.totalRuns += 1;
  next.totalWins += summary.victory ? 1 : 0;
  next.totalLosses += summary.victory ? 0 : 1;
  next.ramStarvedTurnsTotal += summary.ramStarvedTurns;
  next.peakHeatTotal += summary.peakHeat;
  next.scrapSpentTotal += summary.scrapSpent;
  next.criticalHeatTurnsTotal += summary.criticalHeatTurns;
  if (summary.firstEliteAttempt) next.firstEliteAttempts += 1;
  if (summary.firstEliteLoss) next.firstEliteLosses += 1;
  if (summary.firstBossAttempt) next.firstBossAttempts += 1;
  if (summary.firstBossLoss) next.firstBossLosses += 1;

  profile.runs += 1;
  profile.wins += summary.victory ? 1 : 0;
  profile.losses += summary.victory ? 0 : 1;
  profile.ramStarvedTurns += summary.ramStarvedTurns;
  profile.peakHeatTotal += summary.peakHeat;
  profile.scrapSpent += summary.scrapSpent;
  if (summary.firstEliteAttempt) profile.firstEliteAttempts += 1;
  if (summary.firstEliteLoss) profile.firstEliteLosses += 1;
  if (summary.firstBossAttempt) profile.firstBossAttempts += 1;
  if (summary.firstBossLoss) profile.firstBossLosses += 1;
  next.starterProfiles[profileId] = profile;

  next.recentRuns = [summary, ...next.recentRuns].slice(0, 18);
  return next;
}

export function buildRunAnalyticsDashboard(analytics) {
  const normalized = normalizeRunAnalytics(analytics);
  const safeRuns = Math.max(1, normalized.totalRuns);
  const profileRows = Object.values(normalized.starterProfiles)
    .map((profile) => ({
      ...profile,
      winRate: profile.runs > 0 ? profile.wins / profile.runs : 0,
      averageRamStarvedTurns: profile.runs > 0 ? profile.ramStarvedTurns / profile.runs : 0,
      averagePeakHeat: profile.runs > 0 ? profile.peakHeatTotal / profile.runs : 0,
      averageScrapSpent: profile.runs > 0 ? profile.scrapSpent / profile.runs : 0,
      firstEliteLossRate: profile.firstEliteAttempts > 0 ? profile.firstEliteLosses / profile.firstEliteAttempts : 0,
      firstBossLossRate: profile.firstBossAttempts > 0 ? profile.firstBossLosses / profile.firstBossAttempts : 0,
    }))
    .sort((a, b) => {
      if (b.losses !== a.losses) return b.losses - a.losses;
      if (a.winRate !== b.winRate) return a.winRate - b.winRate;
      return a.name.localeCompare(b.name);
    });
  const tutorialRows = Object.values(normalized.tutorials)
    .map((tutorial) => {
      const exitEntries = Object.entries(tutorial.exitSteps || {}).sort((a, b) => b[1] - a[1]);
      const [topExitStepId, topExitCount] = exitEntries[0] || [null, 0];
      return {
        ...tutorial,
        completionRate: tutorial.started > 0 ? tutorial.completed / tutorial.started : 0,
        exitRate: tutorial.started > 0 ? tutorial.exited / tutorial.started : 0,
        averageStepAdvances: tutorial.started > 0 ? tutorial.stepAdvances / tutorial.started : 0,
        topExitStepId,
        topExitCount,
      };
    })
    .sort((a, b) => {
      if (b.started !== a.started) return b.started - a.started;
      if (a.completionRate !== b.completionRate) return a.completionRate - b.completionRate;
      return a.title.localeCompare(b.title);
    });
  const safeTutorialStarts = Math.max(1, normalized.tutorialSessionsStarted);

  return {
    ...normalized,
    winRate: normalized.totalWins / safeRuns,
    averageRamStarvedTurns: normalized.ramStarvedTurnsTotal / safeRuns,
    averagePeakHeat: normalized.peakHeatTotal / safeRuns,
    averageScrapSpent: normalized.scrapSpentTotal / safeRuns,
    averageCriticalHeatTurns: normalized.criticalHeatTurnsTotal / safeRuns,
    firstEliteLossRate: normalized.firstEliteAttempts > 0 ? normalized.firstEliteLosses / normalized.firstEliteAttempts : 0,
    firstBossLossRate: normalized.firstBossAttempts > 0 ? normalized.firstBossLosses / normalized.firstBossAttempts : 0,
    profileRows,
    tutorialCompletionRate: normalized.tutorialSessionsCompleted / safeTutorialStarts,
    tutorialExitRate: normalized.tutorialSessionsExited / safeTutorialStarts,
    tutorialRows,
  };
}

export function readRunAnalytics() {
  if (typeof window === 'undefined') return createRunAnalytics();
  try {
    const raw = window.localStorage.getItem(RUN_ANALYTICS_STORAGE_KEY);
    if (!raw) return createRunAnalytics();
    return normalizeRunAnalytics(JSON.parse(raw));
  } catch {
    return createRunAnalytics();
  }
}

export function writeRunAnalytics(analytics) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RUN_ANALYTICS_STORAGE_KEY, JSON.stringify(normalizeRunAnalytics(analytics)));
}
