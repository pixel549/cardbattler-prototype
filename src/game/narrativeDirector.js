export function getFixerLine({ mode = 'MainMenu', run = null, metaProgress = null, runAnalytics = null } = {}) {
  const lowerMode = String(mode || 'MainMenu').toLowerCase();
  const totalRuns = Math.max(0, Number(metaProgress?.totalRuns || runAnalytics?.totalRuns || 0));
  const totalWins = Math.max(0, Number(metaProgress?.totalWins || 0));
  const hpRatio = run?.maxHP ? Number(run.hp || 0) / Math.max(1, Number(run.maxHP || 1)) : 1;
  const scrap = Math.max(0, Number(run?.scrap || 0));
  const profileName = run?.starterProfileName || 'runner';
  const firstEliteLossRate = Math.max(0, Number(runAnalytics?.firstEliteLossRate || 0));

  if (lowerMode === 'combat') {
    if (Number(run?.telemetry?.peakHeat || 0) >= 14) return 'Fixer: Trace is already running hot. Buy yourself a turn before the network buys one for you.';
    if (hpRatio <= 0.35) return 'Fixer: You are one clean hit from a body bag. Stabilise before you chase style points.';
    if (scrap >= 6) return "Fixer: You have enough salvage to reforge your way out of bad sequencing. Don't die hoarding it.";
    return `Fixer: ${profileName} has enough tools to survive this lane. Pick the clean line and keep the trace honest.`;
  }

  if (lowerMode === 'reward') {
    return 'Fixer: Patch the hole that nearly killed you. Drafting greed is how good runs vanish.';
  }

  if (lowerMode === 'shop') {
    return scrap >= 4
      ? 'Fixer: Scrap in pocket means leverage. Reforge something that is actually dragging your turns down.'
      : 'Fixer: Spend for the next floor, not for the fantasy version of this deck.';
  }

  if (lowerMode === 'event') {
    return 'Fixer: Side channels always leave fingerprints. If you take the dirty option, make it worth the trace.';
  }

  if (lowerMode === 'gameover') {
    return run?.victory
      ? 'Fixer: Clean pull. Not clean enough for the board, but clean enough to get paid.'
      : 'Fixer: The network read your line before you finished it. Bring more breathing room next run.';
  }

  if (lowerMode === 'intel' || lowerMode === 'telemetry') {
    if (firstEliteLossRate >= 0.5) {
      return 'Fixer: Your first elite losses are still too high. That means the opening package is asking for more RAM or cleaner defense.';
    }
    return 'Fixer: Archives matter. Patterns beat instincts once the run count starts stacking.';
  }

  if (lowerMode === 'tutorial') {
    return 'Fixer: Learn the real interface now so you are not improvising under trace later.';
  }

  if (totalRuns === 0) {
    return 'Fixer: Keep the opener lean. First act is about surviving the trace net, not looking clever.';
  }
  if (totalWins === 0) {
    return 'Fixer: You are close enough to get punished, not close enough to get paid. Tighten the opener.';
  }
  if (firstEliteLossRate >= 0.5) {
    return 'Fixer: The archive says your runs are bleeding out before the first elite. More RAM, less vanity.';
  }
  return 'Fixer: You have a reputation now. Keep the deck flexible or the network will start writing your obituary for you.';
}
