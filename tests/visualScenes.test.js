import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  VISUAL_SCENE_CAPTURE_TARGETS,
  createVisualSceneState,
  getVisualSceneMenuState,
  isVisualScene,
} from "../src/playtest/visualScenes.js";

const require = createRequire(import.meta.url);
const data = require("../src/data/gamedata.json");

test("menu scenes expose stable submenu state", () => {
  assert.deepEqual(getVisualSceneMenuState("menu-home"), {
    menuView: "home",
    intelView: "progress",
  });
  assert.deepEqual(getVisualSceneMenuState("menu-intel-bosses"), {
    menuView: "intel",
    intelView: "bosses",
  });
  assert.equal(getVisualSceneMenuState("tutorial-pressure-combat"), null);
});

test("new tutorial scenes boot into stable scripted onboarding states", () => {
  const menuState = createVisualSceneState(data, "tutorial-run-modes-menu");
  assert.equal(menuState?.mode, "MainMenu");
  assert.equal(menuState?.run?.tutorial?.id, "run_modes_briefing");
  assert.equal(menuState?.run?.tutorial?.stepIndex, 0);

  const bossState = createVisualSceneState(data, "tutorial-boss-combat");
  assert.equal(bossState?.mode, "Combat");
  assert.equal(bossState?.run?.tutorial?.id, "boss_protocols");
  assert.equal(bossState?.run?.tutorial?.stepIndex, 1);

  const instabilityEvent = createVisualSceneState(data, "tutorial-instability-event");
  assert.equal(instabilityEvent?.mode, "Event");
  assert.equal(instabilityEvent?.event?.eventId, "CompileStation");
  assert.equal(instabilityEvent?.run?.tutorial?.stepIndex, 1);

  const instabilityPicker = createVisualSceneState(data, "tutorial-instability-picker");
  assert.equal(Boolean(instabilityPicker?.deckView), true);
  assert.equal(instabilityPicker?.run?.tutorial?.stepIndex, 2);
});

test("pressure combat scene boots directly into the scripted tutorial combat", () => {
  const state = createVisualSceneState(data, "tutorial-pressure-combat");

  assert.equal(state?.mode, "Combat");
  assert.equal(state?.run?.tutorial?.id, "pressure_systems");
  assert.equal(state?.run?.tutorial?.stepIndex, 1);
  assert.equal(state?.combat?.arenaModifier?.id, "firewall_grid");
});

test("tutorial complete scene lands on the completion popup state", () => {
  const state = createVisualSceneState(data, "tutorial-complete");

  assert.equal(state?.mode, "TutorialComplete");
  assert.equal(state?.run?.tutorial?.status, "complete");
  assert.equal(state?.run?.tutorial?.outcome, "victory");
});

test("capture targets only reference registered scenes and use unique output files", () => {
  const fileNames = new Set();

  for (const target of VISUAL_SCENE_CAPTURE_TARGETS) {
    assert.equal(isVisualScene(target.id), true);
    assert.equal(fileNames.has(target.fileName), false);
    fileNames.add(target.fileName);
  }

  assert.ok(fileNames.size >= 12);
});
