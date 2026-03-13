import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { getAIAction } from "../src/game/aiPlayer.js";
import { dispatchWithJournal } from "../src/game/dispatch_with_journal.js";
import { createInitialState } from "../src/game/game_core.js";
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
  let state = dispatchWithJournal(createInitialState(), data, {
    type: "NewRun",
    seed: 12345,
    starterProfileId: "kernel",
    difficultyId: "standard",
    challengeIds: [],
  });

  for (let step = 0; step < 9; step += 1) {
    const action = getAIAction(state, data, "balanced");
    assert.ok(action, `expected AI action at setup step ${step}`);
    state = dispatchWithJournal(state, data, action);
  }

  assert.equal(state.mode, "Combat");
  assert.ok(state.combat?._lockedCards instanceof Set);
  assert.ok(state.combat._lockedCards.has("rc_dca3686a"));

  const action = getAIAction(state, data, "balanced");
  assert.ok(action);
  assert.notDeepEqual(action, {
    type: "Combat_PlayCard",
    cardInstanceId: "rc_dca3686a",
    targetEnemyId: "enemy_0",
  });
});
