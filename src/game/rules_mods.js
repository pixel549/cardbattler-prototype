export function getRunMods(data, relicIds) {
  let mods = {};
  for (const rid of relicIds || []) {
    const r = data.relics?.[rid];
    if (!r?.mods) continue;
    mods = mergeMods(mods, r.mods);
  }
  return mods;
}

function mergeMods(base, add) {
  const out = { ...base };
  for (const k of [
    "maxHPDelta","startingGoldDelta","maxMPDelta","travelHpCostDelta",
    "maxRAMDelta","ramRegenDelta","drawPerTurnDelta",
    "finalCountdownTickDelta"
  ]) {
    if (typeof add[k] === "number") out[k] = (out[k] || 0) + add[k];
  }
  if (typeof add.mutationTriggerChanceMult === "number") {
    const cur = out.mutationTriggerChanceMult ?? 1;
    out.mutationTriggerChanceMult = cur * add.mutationTriggerChanceMult;
  }
  if (add.mutationTierWeightMult) {
    out.mutationTierWeightMult = out.mutationTierWeightMult || {};
    for (const [t, m] of Object.entries(add.mutationTierWeightMult)) {
      const cur = out.mutationTierWeightMult[t] ?? 1;
      out.mutationTierWeightMult[t] = cur * m;
    }
  }
  return out;
}
