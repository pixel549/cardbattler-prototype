import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { dispatchGame } from "../src/game/game_core.js";
import {
  acknowledgeTutorialStep,
  advanceTutorialState,
  canUseTutorialAction,
  createTutorialRunState,
  getTutorialCatalog,
} from "../src/game/tutorial.js";

const require = createRequire(import.meta.url);
const data = require("../src/data/gamedata.json");

function dispatchTutorialAction(state, action) {
  const next = dispatchGame(state, data, action);
  return advanceTutorialState(next, action);
}

test("pressure systems tutorial appears in the catalog with scripted pressure state", () => {
  const tutorialIds = getTutorialCatalog().map((entry) => entry.id);
  assert.ok(tutorialIds.includes("pressure_systems"));

  const state = createTutorialRunState(data, "pressure_systems");
  assert.equal(state.combat?.arenaModifier?.id, "firewall_grid");
  assert.equal(state.combat?.heat, 0);
  assert.equal(state.run?.scrap, 0);
  assert.ok(state.run?.tutorial?.cardIds?.reforgeTarget);
});

test("pressure systems tutorial gates the lesson and transitions into a scripted reforge", () => {
  let state = createTutorialRunState(data, "pressure_systems");
  state = acknowledgeTutorialStep(state);

  const cardIds = { ...(state.run?.tutorial?.cardIds || {}) };
  const enemyId = state.combat?.enemies?.[0]?.id;
  assert.ok(enemyId);

  const blocked = canUseTutorialAction(state, {
    type: "Combat_PlayCard",
    cardInstanceId: cardIds.strike,
    targetEnemyId: enemyId,
  });
  assert.equal(blocked.allowed, false);

  state = dispatchTutorialAction(state, {
    type: "Combat_PlayCard",
    cardInstanceId: cardIds.shieldbreak,
    targetEnemyId: enemyId,
  });
  assert.equal(state.run?.tutorial?.stepIndex, 2);

  state = dispatchTutorialAction(state, {
    type: "Combat_PlayCard",
    cardInstanceId: cardIds.ramCache,
    targetEnemyId: enemyId,
    targetSelf: true,
  });
  assert.equal(state.run?.tutorial?.stepIndex, 3);

  state = dispatchTutorialAction(state, {
    type: "Combat_PlayCard",
    cardInstanceId: cardIds.broadcastSurge,
    targetEnemyId: enemyId,
  });
  assert.equal(state.run?.tutorial?.stepIndex, 4);
  assert.ok((state.combat?.heat || 0) >= 6);

  state = dispatchTutorialAction(state, { type: "Combat_EndTurn" });
  assert.equal(state.run?.tutorial?.stepIndex, 5);

  const rewardState = structuredClone(state);
  rewardState.mode = "Reward";
  rewardState.reward = { cardChoices: ["C-001"] };

  state = advanceTutorialState(rewardState, { type: "Combat_EndTurn" });
  assert.equal(state.mode, "Event");
  assert.equal(state.event?.eventId, "RestSite");
  assert.equal(state.run?.scrap, 3);
  assert.equal(state.run?.tutorial?.stepIndex, 6);

  const blockedRest = canUseTutorialAction(state, { type: "Rest_Heal" });
  assert.equal(blockedRest.allowed, false);

  state = dispatchTutorialAction(state, { type: "Rest_Forge" });
  assert.equal(state.run?.tutorial?.stepIndex, 7);
  assert.equal(state.event?.pendingSelectOp, "ForgeSelectedCard");
  assert.equal(state.deckView?.returnMode, "Event");

  const wrongTarget = state.deck?.master?.find((instanceId) => instanceId !== cardIds.reforgeTarget);
  assert.ok(wrongTarget);

  const blockedTarget = canUseTutorialAction(state, {
    type: "SelectDeckCard",
    instanceId: wrongTarget,
  });
  assert.equal(blockedTarget.allowed, false);

  state = dispatchTutorialAction(state, {
    type: "SelectDeckCard",
    instanceId: cardIds.reforgeTarget,
  });
  assert.equal(state.mode, "TutorialComplete");
  assert.equal(state.run?.tutorial?.outcome, "victory");
});
