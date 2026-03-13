import { RNG } from "./rng.js";
import { getAdaptiveEncounterWeight } from "./combatMeta.js";

function weightedPick(rng, defs) {
  const sum = defs.reduce((a, d) => a + Math.max(0, d.weight || 1), 0);
  if (sum <= 0) return defs[0];
  const r = rng.next() * sum;
  let acc = 0;
  for (const d of defs) {
    acc += Math.max(0, d.weight || 1);
    if (r <= acc) return d;
  }
  return defs[defs.length - 1];
}

function mixSeed(seed) {
  let x = (seed >>> 0) || 1;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0 || 1;
}

function getEncounterSignature(def) {
  return [...(def?.enemyIds || [])].sort().join("|");
}

function getEncounterEnemyCount(def) {
  return Array.isArray(def?.enemyIds) ? def.enemyIds.length : 0;
}

function getEncounterTotalHP(def, data) {
  return (def?.enemyIds || []).reduce((sum, enemyId) => (
    sum + Number(data?.enemies?.[enemyId]?.maxHP || 0)
  ), 0);
}

function getEncounterDifficulty(def, data) {
  return (def?.enemyIds || []).reduce((sum, enemyId) => (
    sum + Number(data?.enemies?.[enemyId]?.difficulty || 0)
  ), 0);
}

function getEncounterMaxEnemyDifficulty(def, data) {
  return (def?.enemyIds || []).reduce((maxValue, enemyId) => (
    Math.max(maxValue, Number(data?.enemies?.[enemyId]?.difficulty || 0))
  ), 0);
}

function getEncounterRoleCounts(def, data) {
  const counts = {};
  for (const enemyId of def?.enemyIds || []) {
    const role = data?.enemies?.[enemyId]?.role || 'Unknown';
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

function getEncounterTier(def) {
  const id = String(def?.id || '');
  const explicitTier = id.match(/_N(\d+)_/i);
  if (explicitTier) {
    return Math.max(1, Number.parseInt(explicitTier[1], 10) || 1);
  }
  return Math.max(1, Math.min(3, getEncounterEnemyCount(def)));
}

function getEarlyActEncounterBudget(act, kind, floor) {
  if (act !== 1 || kind !== "normal" || !Number.isFinite(floor) || floor <= 0) return null;

  if (floor <= 2) {
    return {
      maxEncounterTier: 1,
      maxEnemyCount: 1,
      maxTotalHP: 90,
      maxDifficulty: 9,
      maxEnemyDifficulty: 9,
      maxPressureRoles: 1,
      forbidSupportTankCombo: true,
    };
  }

  if (floor === 3) {
    return {
      maxEncounterTier: 2,
      maxEnemyCount: 2,
      maxTotalHP: 104,
      maxDifficulty: 11,
      maxEnemyDifficulty: 8.6,
      maxPressureRoles: 1,
      forbidSupportTankCombo: true,
    };
  }

  if (floor === 4) {
    return {
      maxEncounterTier: 2,
      maxEnemyCount: 2,
      maxTotalHP: 118,
      maxDifficulty: 12.5,
      maxEnemyDifficulty: 9.8,
      maxPressureRoles: 2,
      forbidSupportTankCombo: true,
    };
  }

  if (floor <= 6) {
    return {
      maxEncounterTier: 2,
      maxEnemyCount: 2,
      maxTotalHP: 136,
      maxDifficulty: 15,
      maxEnemyDifficulty: 10.8,
      maxPressureRoles: 2,
      forbidSupportTankCombo: true,
    };
  }

  if (floor <= 8) {
    return {
      maxEncounterTier: 2,
      maxEnemyCount: 2,
      maxTotalHP: 150,
      maxDifficulty: 16.8,
      maxEnemyDifficulty: 11.8,
      maxPressureRoles: 2,
      forbidSupportTankCombo: false,
    };
  }

  if (floor <= 10) {
    return {
      maxEncounterTier: 3,
      maxEnemyCount: 3,
      maxTotalHP: 170,
      maxDifficulty: 19.2,
      maxEnemyDifficulty: 12.8,
      maxPressureRoles: 3,
      forbidSupportTankCombo: false,
    };
  }

  return {
    maxEncounterTier: 3,
    maxEnemyCount: 3,
    maxTotalHP: 184,
    maxDifficulty: 21.5,
    maxEnemyDifficulty: 14.5,
    maxPressureRoles: 3,
    forbidSupportTankCombo: false,
  };
}

function encounterFitsBudget(def, data, budget) {
  if (!budget) return true;

  const roles = getEncounterRoleCounts(def, data);
  const pressureRoles = (roles['Debuff/DoT'] || 0) + (roles['Control'] || 0) + (roles['Economy pressure'] || 0);
  const supportTankCombo = (roles['Support/Heal'] || 0) > 0 && (roles['Defense/Tank'] || 0) > 0;

  return getEncounterTier(def) <= budget.maxEncounterTier
    && getEncounterEnemyCount(def) <= budget.maxEnemyCount
    && getEncounterTotalHP(def, data) <= budget.maxTotalHP
    && getEncounterDifficulty(def, data) <= budget.maxDifficulty
    && getEncounterMaxEnemyDifficulty(def, data) <= budget.maxEnemyDifficulty
    && pressureRoles <= budget.maxPressureRoles
    && (!budget.forbidSupportTankCombo || !supportTankCombo);
}

function filterEarlyActEncounters(defs, data, act, kind, floor) {
  if (act !== 1 || kind !== "normal") return defs;
  if (!Number.isFinite(floor) || floor <= 0) return defs;

  const keepIfAny = (predicate) => {
    const filtered = defs.filter(predicate);
    return filtered.length > 0 ? filtered : defs;
  };

  const budget = getEarlyActEncounterBudget(act, kind, floor);
  return budget ? keepIfAny((def) => encounterFitsBudget(def, data, budget)) : defs;
}

function getEncounterRecencyMultiplier(def, recentHistory = []) {
  if (!recentHistory.length) return 1;

  const encounterId = def?.id || null;
  const signature = getEncounterSignature(def);
  const recentIds = recentHistory.map((entry) => entry?.id).filter(Boolean);
  const recentSignatures = recentHistory.map((entry) => entry?.signature).filter(Boolean);

  let multiplier = 1;

  if (encounterId) {
    if (recentIds.slice(-1).includes(encounterId)) multiplier *= 0.05;
    else if (recentIds.slice(-3).includes(encounterId)) multiplier *= 0.28;
    else if (recentIds.slice(-5).includes(encounterId)) multiplier *= 0.58;
  }

  if (signature) {
    if (recentSignatures.slice(-1).includes(signature)) multiplier *= 0.14;
    else if (recentSignatures.slice(-3).includes(signature)) multiplier *= 0.42;
    else if (recentSignatures.slice(-5).includes(signature)) multiplier *= 0.74;
  }

  return multiplier;
}

export function pickEncounter(data, seed, act, kind, options = {}) {
  const tables = data.encounterTables || [];
  const recentHistory = Array.isArray(options?.recentHistory) ? options.recentHistory : [];
  const floor = Number(options?.floor || 0);
  const adaptationProfile = options?.adaptationProfile || null;

  // Tables can be in two formats:
  // A) Flat: {act, kind, encounterIds: [...]}  (from build_content.cjs)
  // B) Merged: {act, normal: [...], elite: [...], boss: [...]}  (from build_gamedata.py)
  // Support both.

  function getEncounterIds(targetAct, targetKind) {
    // Try flat format first (one table per actÃ—kind)
    const flatTable = tables.find(t => t.act === targetAct && t.kind === targetKind);
    if (flatTable?.encounterIds?.length) return flatTable.encounterIds;

    // Try merged format (one table per act with nested kind keys)
    const mergedTable = tables.find(t => t.act === targetAct && t[targetKind]);
    if (mergedTable?.[targetKind]?.length) return mergedTable[targetKind];

    return [];
  }

  function resolveEncounters(ids) {
    return ids
      .map(id => data.encounters[id])
      .filter(def => (
        !!def
        && Array.isArray(def.enemyIds)
        && def.enemyIds.length > 0
        && def.enemyIds.every(enemyId => !!data.enemies?.[enemyId])
      ));
  }

  // 1) Try requested act + kind
  let ids = getEncounterIds(act, kind);
  let defs = resolveEncounters(ids);
  let finalKind = kind;

  // 2) Fallback within same act: try other kinds
  if (defs.length === 0) {
    const order = ["normal", "elite", "boss"];
    const uniqueOrder = [kind, ...order.filter(k => k !== kind)];
    for (const k of uniqueOrder) {
      ids = getEncounterIds(act, k);
      defs = resolveEncounters(ids);
      if (defs.length) { finalKind = k; break; }
    }
  }

  // 3) Fallback: any act, any kind
  if (defs.length === 0) {
    const acts = [...new Set(tables.map(t => t.act))].sort();
    const kinds = ["normal", "elite", "boss"];
    for (const a of acts) {
      for (const k of kinds) {
        ids = getEncounterIds(a, k);
        defs = resolveEncounters(ids);
        if (defs.length) { finalKind = k; act = a; break; }
      }
      if (defs.length) break;
    }
  }

  if (defs.length === 0) {
    throw new Error(`No encounter defs found anywhere (requested act ${act} kind ${kind})`);
  }

  defs = filterEarlyActEncounters(defs, data, act, finalKind, floor);

  const salt =
    finalKind === "elite" ? 0xE11E7E :
    finalKind === "boss"  ? 0xB055E5 :
    0x0A0B0C;

  const rngSeed = mixSeed(((seed ^ (act * 10007) ^ salt ^ (recentHistory.length * 0x9E3779B9)) >>> 0));
  const rng = new RNG(rngSeed);
  rng.nextUint();
  rng.nextUint();
  const weightedDefs = defs.map((def, index) => ({
    def,
    weight: Math.max(
      0.05,
      Math.max(0, def.weight || 1)
        * getEncounterRecencyMultiplier(def, recentHistory)
        * getAdaptiveEncounterWeight(def, data, adaptationProfile, { act, encounterKind: finalKind })
        * (0.96 + ((index % 4) * 0.02))
    ),
  }));
  return weightedPick(rng, weightedDefs).def;
}
