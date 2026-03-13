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
