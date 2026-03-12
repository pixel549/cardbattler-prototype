import assert from "node:assert/strict";
import test from "node:test";

import { dispatchCombat, getCardTargetingProfile } from "../src/game/engine.js";

function createCombatHarness(effect) {
  const cardInstanceId = "ci-test-card";
  const data = {
    cards: {
      TEST_CARD: {
        id: "TEST_CARD",
        name: "Test Card",
        type: "Utility",
        costRAM: 1,
        effects: [effect],
      },
    },
    mutations: {},
    statuses: {
      Firewall: { isNegative: false },
      Weak: { isNegative: true },
      Vulnerable: { isNegative: true },
    },
  };

  const state = {
    seed: 1,
    rngState: 1,
    turn: 1,
    act: 1,
    enemySeq: 2,
    combatOver: false,
    victory: false,
    log: [],
    dataRef: data,
    balance: { enemyDmgMult: 1 },
    encounterDirectives: [],
    ruleMods: {},
    relicIds: [],
    heat: 0,
    maxHeat: 20,
    _cardsPlayedThisTurn: 0,
    player: {
      id: "player",
      hp: 20,
      maxHP: 30,
      ram: 3,
      maxRAM: 3,
      ramRegen: 0,
      statuses: [],
      piles: {
        hand: [cardInstanceId],
        draw: [],
        discard: [],
        exhaust: [],
        power: [],
      },
    },
    enemies: [
      {
        id: "enemy_1",
        enemyDefId: "dummy",
        name: "Training Target",
        hp: 10,
        maxHP: 20,
        statuses: [],
        passives: [],
        combatFlags: {
          firstDebuffSeen: false,
          phaseTriggered: {},
          enemyTurn: 0,
          playsThisTurnOverride: null,
          extraPlaysNow: 0,
        },
      },
    ],
    enemyAI: {
      cursorByEnemyId: {},
    },
    cardInstances: {
      [cardInstanceId]: {
        instanceId: cardInstanceId,
        defId: "TEST_CARD",
        appliedMutations: [],
        useCounter: 3,
        finalMutationCountdown: 5,
        ramCostDelta: 0,
        compileLevel: 0,
      },
    },
  };

  return {
    state,
    data,
    cardInstanceId,
  };
}

test("player cards now expose unified targeting with sensible preferred defaults", () => {
  const selfHarness = createCombatHarness({ op: "Heal", amount: 5, target: "Self" });
  const selfProfile = getCardTargetingProfile(selfHarness.state, selfHarness.data, selfHarness.cardInstanceId);
  assert.equal(selfProfile.canTargetEnemy, true);
  assert.equal(selfProfile.canTargetSelf, true);
  assert.equal(selfProfile.preferredTargetMode, "self");
  assert.equal(selfProfile.nativeCanTargetEnemy, false);
  assert.equal(selfProfile.nativeCanTargetSelf, true);

  const enemyHarness = createCombatHarness({ op: "DealDamage", amount: 4, target: "Enemy" });
  const enemyProfile = getCardTargetingProfile(enemyHarness.state, enemyHarness.data, enemyHarness.cardInstanceId);
  assert.equal(enemyProfile.canTargetEnemy, true);
  assert.equal(enemyProfile.canTargetSelf, true);
  assert.equal(enemyProfile.preferredTargetMode, "enemy");
  assert.equal(enemyProfile.nativeCanTargetEnemy, true);
  assert.equal(enemyProfile.nativeCanTargetSelf, false);
});

test("self-targeted card effects can now be redirected onto an enemy", () => {
  const { state, data, cardInstanceId } = createCombatHarness({ op: "Heal", amount: 5, target: "Self" });

  dispatchCombat(state, data, {
    type: "PlayCard",
    cardInstanceId,
    targetEnemyId: "enemy_1",
  });

  assert.equal(state.enemies[0].hp, 15);
  assert.equal(state.player.hp, 20);
});

test("enemy-targeted card effects can now be redirected onto the player", () => {
  const { state, data, cardInstanceId } = createCombatHarness({ op: "DealDamage", amount: 4, target: "Enemy" });

  dispatchCombat(state, data, {
    type: "PlayCard",
    cardInstanceId,
    targetEnemyId: "enemy_1",
    targetSelf: true,
  });

  assert.equal(state.player.hp, 16);
  assert.equal(state.enemies[0].hp, 10);
});

test("all-enemy effects can now be redirected onto the player side", () => {
  const { state, data, cardInstanceId } = createCombatHarness({ op: "DealDamage", amount: 4, target: "AllEnemies" });

  dispatchCombat(state, data, {
    type: "PlayCard",
    cardInstanceId,
    targetEnemyId: "enemy_1",
    targetSelf: true,
  });

  assert.equal(state.player.hp, 16);
  assert.equal(state.enemies[0].hp, 10);
});
