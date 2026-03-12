import assert from "node:assert/strict";
import test from "node:test";

import {
  HEAT_MAX,
  createRunAdaptationProfile,
  getAdaptiveEncounterDirective,
  getAdaptiveEncounterWeight,
  getCardHeatGain,
  getHeatState,
  getDominantStrategy,
  pickArenaModifier,
  recordCardPlayForAdaptation,
} from "../src/game/combatMeta.js";

test("getCardHeatGain scales with expensive burst cards and compiled mutations", () => {
  const gain = getCardHeatGain({
    cost: 3,
    type: "Power",
    compileLevel: 1,
    appliedMutationCount: 2,
    effectSummary: {
      damage: 16,
      draw: 2,
      xCost: true,
      targetsAllEnemies: true,
    },
  });

  assert.equal(gain, 6);
  assert.equal(getHeatState(HEAT_MAX).label, "Critical");
});

test("recordCardPlayForAdaptation identifies aggro-heavy play", () => {
  let profile = createRunAdaptationProfile();

  for (let index = 0; index < 5; index += 1) {
    profile = recordCardPlayForAdaptation(profile, {
      cost: 2,
      effectSummary: {
        damage: 12,
        defense: 0,
        draw: 0,
        gainRAM: 0,
        debuff: 0,
        firewallBreach: 0,
        firewallBreachAll: false,
        primaryRole: "damage",
        type: "Attack",
      },
      type: "Attack",
    });
  }

  const dominant = getDominantStrategy(profile);
  assert.equal(dominant.strategy, "aggro");
  assert.ok(dominant.confidence > 0.5);
});

test("adaptive encounter weighting leans toward tanks against aggro", () => {
  let profile = createRunAdaptationProfile();
  for (let index = 0; index < 4; index += 1) {
    profile = recordCardPlayForAdaptation(profile, {
      cost: 1,
      effectSummary: {
        damage: 10,
        primaryRole: "damage",
        type: "Attack",
      },
      type: "Attack",
    });
  }

  const data = {
    enemies: {
      tank: { name: "Shield Guardian", role: "Defense/Tank" },
      dps: { name: "Razor Hound", role: "Attack" },
    },
  };
  const tankEncounter = { name: "Firewall Nest", enemyIds: ["tank", "dps"] };
  const rushEncounter = { name: "Razor Pack", enemyIds: ["dps", "dps"] };

  assert.ok(getAdaptiveEncounterWeight(tankEncounter, data, profile, { act: 2, encounterKind: "normal" }) > 1);
  assert.ok(getAdaptiveEncounterWeight(rushEncounter, data, profile, { act: 2, encounterKind: "normal" }) <= 1.05);

  const directive = getAdaptiveEncounterDirective(profile, { act: 2, encounterKind: "normal" });
  assert.equal(directive?.type, "adaptive_firewall");
});

test("pickArenaModifier is deterministic for a seed and yields a supported modifier", () => {
  const first = pickArenaModifier(12345, 2, "normal", "EN-01");
  const second = pickArenaModifier(12345, 2, "normal", "EN-01");

  assert.deepEqual(first, second);
  assert.ok(["emp_zone", "firewall_grid", "data_storm"].includes(first.id));
});
