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

test("act 1 floors 4-6 avoid the nastiest pressure duos", () => {
  const blockedSignatures = new Set([
    "E_HACKER_DRONE|E_HOLO_RAT_MK_II",
    "E_HOLO_ENFORCER_MK_I|E_HOLO_RUNNER_NODE",
    "E_HOLO_SAPPER_CELL|E_HOLO_SHAMAN_MK_I",
  ]);

  for (let seed = 1; seed <= 256; seed += 1) {
    for (const floor of [4, 5, 6]) {
      const encounter = pickEncounter(data, seed, 1, "normal", { floor, recentHistory: [] });
      const signature = [...(encounter?.enemyIds || [])].sort().join("|");
      assert.ok(
        !blockedSignatures.has(signature),
        `floor ${floor} seed ${seed} returned a blocked early-pressure duo: ${encounter?.id || signature}`,
      );
    }
  }
});

test("act 1 floor 7 elites stay inside the first-elite guardrail", () => {
  for (let seed = 1; seed <= 128; seed += 1) {
    const encounter = pickEncounter(data, seed, 1, "elite", { floor: 7, recentHistory: [] });
    assert.ok(encounter, `expected elite encounter for seed ${seed}`);
    assert.equal((encounter.enemyIds || []).length, 1, `seed ${seed} returned a multi-enemy first elite: ${encounter.id}`);
    assert.ok(getEncounterDifficulty(encounter) <= 22.5, `seed ${seed} returned an over-budget first elite: ${encounter.id}`);
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

test("generated maps keep the first elite row optional instead of mandatory", () => {
  for (const seed of [1, 2, 3, 17, 42, 99, 1337]) {
    const map = generateMap(seed);
    const firstEliteRow = Object.values(map.nodes).filter((node) => node.y === 6);
    assert.ok(
      firstEliteRow.some((node) => node.type === "Elite"),
      `expected at least one elite option on row 6 for seed ${seed}`,
    );
    assert.ok(
      firstEliteRow.some((node) => node.type !== "Elite"),
      `expected at least one safer alternative on row 6 for seed ${seed}`,
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

test("act 1 first elites receive lighter tuning than later elites", () => {
  const runDeck = { master: [], cardInstances: {} };

  const floorSevenElite = startCombatFromRunDeck({
    data,
    seed: 200,
    act: 1,
    floor: 7,
    runDeck,
    enemyIds: ["E_FLUX_SHAMAN_CREW"],
    encounterKind: "elite",
  });

  const floorTenElite = startCombatFromRunDeck({
    data,
    seed: 201,
    act: 1,
    floor: 10,
    runDeck,
    enemyIds: ["E_FLUX_SHAMAN_CREW"],
    encounterKind: "elite",
  });

  assert.ok(floorSevenElite.balance.enemyDmgMult < floorTenElite.balance.enemyDmgMult);
  assert.ok(floorSevenElite.balance.enemyHpMult < floorTenElite.balance.enemyHpMult);
});
