import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { pickEncounter } from "../src/game/encounters.js";
import { generateMap } from "../src/game/game_core.js";
import { startCombatFromRunDeck } from "../src/game/engine.js";

const require = createRequire(import.meta.url);
const data = require("../src/data/gamedata.json");

function getEncounterDifficulty(encounter) {
  return (encounter?.enemyIds || []).reduce((sum, enemyId) => (
    sum + Number(data.enemies?.[enemyId]?.difficulty || 0)
  ), 0);
}

test("act 1 floor 3 normal encounters stay inside the early-game difficulty budget", () => {
  for (let seed = 1; seed <= 128; seed += 1) {
    const encounter = pickEncounter(data, seed, 1, "normal", { floor: 3, recentHistory: [] });
    assert.ok(encounter, `expected encounter for seed ${seed}`);
    assert.ok((encounter.enemyIds || []).length <= 2, `seed ${seed} returned too many enemies: ${encounter.id}`);
    assert.ok(getEncounterDifficulty(encounter) <= 11, `seed ${seed} returned an over-budget encounter: ${encounter.id}`);
  }
});

test("generated maps always expose a recovery node on the displayed floor 3 row", () => {
  for (const seed of [1, 2, 3, 17, 42, 99, 1337]) {
    const map = generateMap(seed);
    const floorThreeNodes = Object.values(map.nodes).filter((node) => node.y === 2);
    assert.ok(
      floorThreeNodes.some((node) => node.type === "Rest"),
      `expected at least one Rest node on row 2 for seed ${seed}`,
    );
  }
});

test("act 1 normal combat damage ramps up gradually over the opening floors", () => {
  const runDeck = { master: [], cardInstances: {} };

  const floorTwoCombat = startCombatFromRunDeck({
    data,
    seed: 100,
    act: 1,
    floor: 2,
    runDeck,
    enemyIds: ["E_ION_SNIPER_RIG"],
    encounterKind: "normal",
  });

  const floorThreeCombat = startCombatFromRunDeck({
    data,
    seed: 101,
    act: 1,
    floor: 3,
    runDeck,
    enemyIds: ["E_ION_SNIPER_RIG"],
    encounterKind: "normal",
  });

  const floorFiveCombat = startCombatFromRunDeck({
    data,
    seed: 102,
    act: 1,
    floor: 5,
    runDeck,
    enemyIds: ["E_ION_SNIPER_RIG"],
    encounterKind: "normal",
  });

  assert.ok(floorTwoCombat.balance.enemyDmgMult < floorThreeCombat.balance.enemyDmgMult);
  assert.ok(floorThreeCombat.balance.enemyDmgMult < floorFiveCombat.balance.enemyDmgMult);
  assert.ok(floorTwoCombat.balance.enemyHpMult < floorThreeCombat.balance.enemyHpMult);
  assert.ok(floorThreeCombat.balance.enemyHpMult <= floorFiveCombat.balance.enemyHpMult);
});
