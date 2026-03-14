import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { getAIAction } from "../src/game/aiPlayer.js";
import { startCombatFromRunDeck } from "../src/game/engine.js";
import { createRunDeckFromDefs } from "../src/game/run_deck.js";
import { createTutorialRunState } from "../src/game/tutorial.js";

const require = createRequire(import.meta.url);
const data = require("../src/data/gamedata.json");

function createForgeTargetDeck() {
  return {
    master: ["ci-heat-sink"],
    cardInstances: {
      "ci-heat-sink": {
        instanceId: "ci-heat-sink",
        defId: "NC-062",
        appliedMutations: ["A-01"],
        useCounter: 1,
        finalMutationCountdown: 3,
        ramCostDelta: 0,
        compileLevel: 0,
      },
    },
  };
}

test("AI buys forge with scrap when a strong target is available", () => {
  const deck = createForgeTargetDeck();
  const action = getAIAction({
    mode: "Shop",
    shop: {
      offers: [
        { kind: "Service", serviceId: "Forge", price: 4, currency: "scrap" },
      ],
    },
    run: {
      gold: 0,
      scrap: 5,
      hp: 40,
      maxHP: 40,
      maxRAM: 4,
    },
    deck,
  }, data, "preservation");

  assert.deepEqual(action, { type: "Shop_BuyOffer", index: 0 });
});

test("AI prefers rest-site reforge when healthy and scrap is available", () => {
  const deck = createForgeTargetDeck();
  const action = getAIAction({
    mode: "Event",
    event: { eventId: "RestSite" },
    run: {
      hp: 40,
      maxHP: 40,
      scrap: 3,
    },
    deck,
  }, data, "preservation");

  assert.deepEqual(action, { type: "Rest_Forge" });
});

test("AI can evaluate combat states that include Heat and arena modifiers", () => {
  const tutorialState = createTutorialRunState(data, "pressure_systems");
  const action = getAIAction({
    mode: "Combat",
    combat: tutorialState.combat,
  }, data, "balanced");

  assert.ok(action);
  assert.ok(["Combat_PlayCard", "Combat_EndTurn"].includes(action.type));
});

test("AI prioritizes immediate defense when lethal incoming damage is projected", () => {
  const runDeck = createRunDeckFromDefs(data, 98765, ["C-001", "C-002", "C-006"]);
  const combat = startCombatFromRunDeck({
    data,
    seed: 98765,
    act: 1,
    floor: 5,
    runDeck,
    enemyIds: ["E_HACKER_DRONE", "E_HOLO_SAPPER_CELL"],
    encounterKind: "normal",
    playerMaxHP: 75,
    playerMaxRAM: 8,
    playerRamRegen: 2,
  });

  const strikeId = Object.keys(combat.cardInstances).find((instanceId) => combat.cardInstances[instanceId]?.defId === "C-001");
  const guardId = Object.keys(combat.cardInstances).find((instanceId) => combat.cardInstances[instanceId]?.defId === "C-002");
  const chargeId = Object.keys(combat.cardInstances).find((instanceId) => combat.cardInstances[instanceId]?.defId === "C-006");

  combat.player.hp = 8;
  combat.player.ram = 1;
  combat.player.piles.hand = [strikeId, guardId, chargeId].filter(Boolean);
  combat.player.piles.draw = [];
  combat.player.piles.discard = [];

  const action = getAIAction({
    mode: "Combat",
    combat,
  }, data, "balanced");

  assert.ok(action);
  assert.equal(action.type, "Combat_PlayCard");
  assert.equal(action.cardInstanceId, guardId);
});

test("AI avoids low-threat combat stalls by taking a progress action", () => {
  const runDeck = createRunDeckFromDefs(data, 24680, ["C-001", "C-002"]);
  const combat = startCombatFromRunDeck({
    data,
    seed: 24680,
    act: 1,
    floor: 6,
    runDeck,
    enemyIds: ["E_HOLO_SNIPER_SHARD"],
    encounterKind: "normal",
    playerMaxHP: 75,
    playerMaxRAM: 8,
    playerRamRegen: 2,
  });

  const strikeId = Object.keys(combat.cardInstances).find((instanceId) => combat.cardInstances[instanceId]?.defId === "C-001");
  const guardId = Object.keys(combat.cardInstances).find((instanceId) => combat.cardInstances[instanceId]?.defId === "C-002");

  combat.turn = 12;
  combat.player.hp = 75;
  combat.player.ram = 1;
  combat.player.piles.hand = [strikeId, guardId].filter(Boolean);
  combat.player.piles.draw = [];
  combat.player.piles.discard = [];

  const action = getAIAction({
    mode: "Combat",
    combat,
  }, data, "defensive");

  assert.ok(action);
  assert.equal(action.type, "Combat_PlayCard");
  assert.equal(action.cardInstanceId, strikeId);
});

test("AI stops looping self-heal at full HP when a low-threat fight still needs damage", () => {
  const runDeck = createRunDeckFromDefs(data, 11223, ["C-001", "C-003"]);
  const combat = startCombatFromRunDeck({
    data,
    seed: 11223,
    act: 1,
    floor: 6,
    runDeck,
    enemyIds: ["E_HOLO_SNIPER_SHARD"],
    encounterKind: "normal",
    playerMaxHP: 75,
    playerMaxRAM: 8,
    playerRamRegen: 2,
  });

  const strikeId = Object.keys(combat.cardInstances).find((instanceId) => combat.cardInstances[instanceId]?.defId === "C-001");
  const patchId = Object.keys(combat.cardInstances).find((instanceId) => combat.cardInstances[instanceId]?.defId === "C-003");

  combat.turn = 12;
  combat.player.hp = 75;
  combat.player.ram = 2;
  combat.player.piles.hand = [strikeId, patchId].filter(Boolean);
  combat.player.piles.draw = [];
  combat.player.piles.discard = [];

  const action = getAIAction({
    mode: "Combat",
    combat,
  }, data, "defensive");

  assert.ok(action);
  assert.equal(action.type, "Combat_PlayCard");
  assert.equal(action.cardInstanceId, strikeId);
});

test("AI skips cards that are locked for the turn", () => {
  const runDeck = createRunDeckFromDefs(data, 12345, ["C-001", "NC-003", "NC-001"]);
  const combat = startCombatFromRunDeck({
    data,
    seed: 12345,
    act: 1,
    floor: 3,
    runDeck,
    enemyIds: ["E_ION_SNIPER_RIG"],
    encounterKind: "normal",
    playerMaxHP: 75,
    playerMaxRAM: 8,
    playerRamRegen: 2,
  });

  const preferredAction = getAIAction({
    mode: "Combat",
    combat,
  }, data, "balanced");
  assert.equal(preferredAction?.type, "Combat_PlayCard");

  const lockedCombat = structuredClone(combat);
  lockedCombat._lockedCards = new Set([preferredAction.cardInstanceId]);

  const action = getAIAction({
    mode: "Combat",
    combat: lockedCombat,
  }, data, "balanced");
  assert.ok(action);
  assert.notEqual(action.cardInstanceId, preferredAction.cardInstanceId);
});
