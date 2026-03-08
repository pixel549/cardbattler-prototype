import { RNG } from "./rng";

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

function getEncounterRoleCounts(def, data) {
  const counts = {};
  for (const enemyId of def?.enemyIds || []) {
    const role = data?.enemies?.[enemyId]?.role || 'Unknown';
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

function filterEarlyActEncounters(defs, data, act, kind, floor) {
  if (act !== 1 || kind !== "normal") return defs;
  if (!Number.isFinite(floor) || floor <= 0) return defs;

  const keepIfAny = (predicate) => {
    const filtered = defs.filter(predicate);
    return filtered.length > 0 ? filtered : defs;
  };

  if (floor <= 2) {
    return keepIfAny((def) => (
      getEncounterEnemyCount(def) <= 2
      && getEncounterTotalHP(def, data) <= 138
      && (() => {
        const roles = getEncounterRoleCounts(def, data);
        const slowRoles = (roles['Support/Heal'] || 0) + (roles['Defense/Tank'] || 0) + (roles['Control'] || 0);
        return slowRoles <= 1 && !((roles['Support/Heal'] || 0) > 0 && (roles['Defense/Tank'] || 0) > 0);
      })()
    ));
  }

  if (floor <= 4) {
    return keepIfAny((def) => (
      (() => {
        const roles = getEncounterRoleCounts(def, data);
        const slowRoles = (roles['Support/Heal'] || 0) + (roles['Defense/Tank'] || 0) + (roles['Control'] || 0);
        const supportTankCombo = (roles['Support/Heal'] || 0) > 0 && (roles['Defense/Tank'] || 0) > 0;
        return !supportTankCombo
          && slowRoles <= 2
          && (
            getEncounterEnemyCount(def) <= 2
            || getEncounterTotalHP(def, data) <= 152
          );
      })()
    ));
  }

  if (floor <= 7) {
    return keepIfAny((def) => {
      const roles = getEncounterRoleCounts(def, data);
      const supportTankCombo = (roles['Support/Heal'] || 0) > 0 && (roles['Defense/Tank'] || 0) > 0;
      if (!supportTankCombo) return true;
      return getEncounterTotalHP(def, data) <= 156;
    });
  }

  return defs;
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

  // Tables can be in two formats:
  // A) Flat: {act, kind, encounterIds: [...]}  (from build_content.cjs)
  // B) Merged: {act, normal: [...], elite: [...], boss: [...]}  (from build_gamedata.py)
  // Support both.

  function getEncounterIds(targetAct, targetKind) {
    // Try flat format first (one table per act×kind)
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
        * (0.96 + ((index % 4) * 0.02))
    ),
  }));
  return weightedPick(rng, weightedDefs).def;
}
