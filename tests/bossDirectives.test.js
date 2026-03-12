import assert from "node:assert/strict";
import test from "node:test";

import {
  getBossDirective,
  getBossDirectiveReadout,
  getEnemyDirectiveSummaries,
} from "../src/game/combatDirectives.js";

test("mainframe boss directives include charge counterplay metadata", () => {
  const directive = getBossDirective({ name: "Vector Mainframe", role: "Boss" }, 2);

  assert.equal(directive.type, "mainframe");
  assert.match(directive.objective, /Purge Charge/i);
  assert.ok(directive.chargeFirewall >= 8);
  assert.ok(directive.chargeDamage >= 12);
});

test("boss directive readout reflects active charge windows and remaining phases", () => {
  const enemy = {
    name: "Vector Mainframe",
    maxHP: 120,
    hp: 72,
    phaseThresholdsPct: [70, 40],
    statuses: [{ id: "Firewall", stacks: 8 }],
    bossDirective: getBossDirective({ name: "Vector Mainframe", role: "Boss" }, 2),
    combatFlags: {
      enemyTurn: 3,
      phaseTriggered: { 70: true },
      mainframeChargeActive: true,
    },
  };

  const readout = getBossDirectiveReadout(enemy);

  assert.equal(readout.emphasis, "critical");
  assert.match(readout.progress, /Break all Firewall/i);
  assert.equal(readout.nextPhase, "Next phase at 40% HP");
});

test("enemy directive summaries include boss counterplay text", () => {
  const enemy = {
    bossDirective: getBossDirective({ name: "Ghost Hydra", role: "Boss" }, 3),
    encounterHints: [{ summary: "Swarm pressure ramps while adds survive." }],
  };

  const summaries = getEnemyDirectiveSummaries(enemy);

  assert.ok(summaries.some((line) => /Cull spawned heads/i.test(line)));
  assert.ok(summaries.some((line) => /Swarm pressure/i.test(line)));
});

test("apex boss readout tracks the combo ceiling", () => {
  const enemy = {
    name: "Rogue Apex",
    maxHP: 100,
    hp: 52,
    phaseThresholdsPct: [70, 35],
    statuses: [],
    bossDirective: getBossDirective({ name: "Rogue Apex", role: "Boss" }, 1),
    combatFlags: {
      phaseTriggered: { 70: true },
      apexNextThreshold: 4,
    },
  };

  const readout = getBossDirectiveReadout(enemy, { cardsPlayedThisTurn: 3 });

  assert.equal(readout.emphasis, "warning");
  assert.match(readout.progress, /Current chain: 3/i);
  assert.equal(readout.nextPhase, "Next phase at 35% HP");
});
