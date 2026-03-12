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
  getTutorialMenuState,
  getTutorialStep,
} from "../src/game/tutorial.js";

const require = createRequire(import.meta.url);
const data = require("../src/data/gamedata.json");

function dispatchTutorialAction(state, action) {
  const next = dispatchGame(state, data, action);
  return advanceTutorialState(next, action, data);
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

test("run modes briefing walks the menu surfaces and completes from acknowledge steps", () => {
  const tutorialIds = getTutorialCatalog().map((entry) => entry.id);
  assert.ok(tutorialIds.includes("run_modes_briefing"));

  let state = createTutorialRunState(data, "run_modes_briefing");
  assert.equal(state.mode, "MainMenu");
  assert.deepEqual(getTutorialMenuState(state), {
    menuView: "home",
    intelView: "progress",
  });

  state = acknowledgeTutorialStep(state);
  assert.equal(getTutorialStep(state)?.id, "starter_profiles");
  assert.deepEqual(getTutorialMenuState(state), {
    menuView: "setup",
    intelView: "progress",
  });

  state = acknowledgeTutorialStep(state);
  state = acknowledgeTutorialStep(state);
  assert.equal(getTutorialStep(state)?.id, "progress_archive");
  assert.deepEqual(getTutorialMenuState(state), {
    menuView: "intel",
    intelView: "progress",
  });

  state = acknowledgeTutorialStep(state);
  assert.deepEqual(getTutorialMenuState(state), {
    menuView: "intel",
    intelView: "bosses",
  });

  state = acknowledgeTutorialStep(state);
  assert.deepEqual(getTutorialMenuState(state), {
    menuView: "intel",
    intelView: "callsigns",
  });

  state = acknowledgeTutorialStep(state);
  assert.equal(getTutorialStep(state)?.id, "wrap_up");

  state = acknowledgeTutorialStep(state);
  assert.equal(state.mode, "TutorialComplete");
  assert.equal(state.run?.tutorial?.outcome, "victory");
});

test("boss protocols tutorial teaches a phase break and transitions through rewards", () => {
  let state = createTutorialRunState(data, "boss_protocols");
  state = acknowledgeTutorialStep(state);

  const cardIds = { ...(state.run?.tutorial?.cardIds || {}) };
  const enemyId = state.combat?.enemies?.[0]?.id;
  assert.ok(enemyId);

  state = dispatchTutorialAction(state, {
    type: "Combat_PlayCard",
    cardInstanceId: cardIds.shieldbreak,
    targetEnemyId: enemyId,
  });
  assert.equal(state.run?.tutorial?.stepIndex, 2);

  state = acknowledgeTutorialStep(state);
  assert.equal(state.run?.tutorial?.stepIndex, 3);

  state = dispatchTutorialAction(state, { type: "Combat_EndTurn" });
  assert.equal(state.run?.tutorial?.stepIndex, 4);

  const rewardState = structuredClone(state);
  rewardState.mode = "Reward";
  rewardState.reward = { cardChoices: ["C-001"], relicChoices: ["PatchNotes"] };

  state = advanceTutorialState(rewardState, { type: "Combat_EndTurn" }, data);
  assert.equal(state.run?.tutorial?.stepIndex, 5);
  assert.equal(state.mode, "Reward");

  state = dispatchTutorialAction(state, { type: "Reward_Skip" });
  assert.equal(state.mode, "TutorialComplete");
  assert.equal(state.run?.tutorial?.outcome, "victory");
});

test("instability lab tutorial links compile, stabilise, and adaptive combat", () => {
  let state = createTutorialRunState(data, "instability_lab");
  state = acknowledgeTutorialStep(state);

  const cardIds = { ...(state.run?.tutorial?.cardIds || {}) };
  assert.equal(state.mode, "Event");
  assert.equal(state.event?.eventId, "CompileStation");

  state = dispatchTutorialAction(state, { type: "Compile_Open" });
  assert.equal(state.run?.tutorial?.stepIndex, 2);
  assert.equal(state.deckView?.returnMode, "Event");

  state = dispatchTutorialAction(state, {
    type: "SelectDeckCard",
    instanceId: cardIds.compileTarget,
  });
  assert.equal(state.mode, "Event");
  assert.equal(state.event?.eventId, "RestSite");
  assert.equal(state.run?.tutorial?.stepIndex, 3);

  state = acknowledgeTutorialStep(state);
  assert.equal(state.run?.tutorial?.stepIndex, 4);

  state = dispatchTutorialAction(state, { type: "Rest_Stabilise" });
  assert.equal(state.run?.tutorial?.stepIndex, 5);
  assert.equal(state.deckView?.returnMode, "Event");

  state = dispatchTutorialAction(state, {
    type: "SelectDeckCard",
    instanceId: cardIds.stabiliseTarget,
  });
  assert.equal(state.mode, "Combat");
  assert.equal(state.run?.tutorial?.stepIndex, 6);

  state = acknowledgeTutorialStep(state);
  assert.equal(state.run?.tutorial?.stepIndex, 7);

  const enemyId = state.combat?.enemies?.[0]?.id;
  assert.ok(enemyId);
  state = dispatchTutorialAction(state, {
    type: "Combat_PlayCard",
    cardInstanceId: cardIds.compileTarget,
    targetEnemyId: enemyId,
  });
  assert.equal(state.run?.tutorial?.stepIndex, 8);

  state = dispatchTutorialAction(state, { type: "Combat_EndTurn" });
  assert.equal(state.run?.tutorial?.stepIndex, 9);

  state = acknowledgeTutorialStep(state);
  assert.equal(state.mode, "TutorialComplete");
  assert.equal(state.run?.tutorial?.outcome, "victory");
});
