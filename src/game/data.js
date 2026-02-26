function die(msg) { throw new Error("[GameData] " + msg); }

export function buildPools(data) {
  // Build mutationPoolsByTier if mutations exist (optional)
  if (!data.mutationPoolsByTier) {
    const pools = { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [] };
    if (data.mutations) {
      for (const [id, m] of Object.entries(data.mutations)) {
        if (!m || !m.tier) continue;
        if (pools[m.tier]) pools[m.tier].push(id);
      }
    }
    data.mutationPoolsByTier = pools;
  }
  return data;
}

export function assertGameData(data) {
  if (!data || typeof data !== "object") die("data is not an object");
  for (const k of ["cards", "enemies", "encounters"]) {
    if (!data[k] || typeof data[k] !== "object") die(`missing or invalid '${k}'`);
  }
  // cards
  for (const [id, c] of Object.entries(data.cards)) {
    if (!c.name) die(`card ${id} missing name`);
    if (!c.type) die(`card ${id} missing type`);
    if (!Array.isArray(c.effects)) die(`card ${id} effects must be array`);
    // finalMutation is required for player cards, optional for enemy-only cards
    if (!c.finalMutation && !c.tags?.includes("EnemyAction")) {
      die(`card ${id} missing finalMutation`);
    }
  }
  // enemies
  for (const [id, e] of Object.entries(data.enemies)) {
    if (!e.name) die(`enemy ${id} missing name`);
    if (typeof e.maxHP !== "number") die(`enemy ${id} maxHP must be number`);
    if (!Array.isArray(e.rotation)) die(`enemy ${id} rotation must be array`);
    for (const cid of e.rotation) {
      if (!data.cards[cid]) die(`enemy ${id} rotation references missing card ${cid}`);
    }
  }
  // encounters and tables
  if (!data.encounterTables || !Array.isArray(data.encounterTables)) {
    die("missing encounterTables array");
  }
  for (const [eid, enc] of Object.entries(data.encounters)) {
    if (!Array.isArray(enc.enemyIds)) die(`encounter ${eid} enemyIds must be array`);
    for (const en of enc.enemyIds) {
      if (!data.enemies[en]) die(`encounter ${eid} references missing enemy ${en}`);
    }
  }
  if (!data.actBalance || !Array.isArray(data.actBalance)) {
    data.actBalance = [{ act: 1, enemyHpMult: 1, enemyDmgMult: 1, goldNormal: 25, goldElite: 50, goldBoss: 99 }];
  }
  if (!data.relics) data.relics = {};
  if (!data.relicRewardPools) data.relicRewardPools = { common: [], uncommon: [], rare: [], boss: [] };
  return true;
}
