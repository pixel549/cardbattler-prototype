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

export function pickEncounter(data, seed, act, kind) {
  const tables = data.encounterTables || [];

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
      .filter(Boolean);
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

  const salt =
    finalKind === "elite" ? 0xE11E7E :
    finalKind === "boss"  ? 0xB055E5 :
    0x0A0B0C;

  const rng = new RNG(((seed ^ (act * 10007) ^ salt) >>> 0));
  return weightedPick(rng, defs);
}
