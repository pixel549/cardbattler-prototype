import { push } from "./log";
import { createInitialState, dispatchGame } from "./game_core";
import { createRunDeckFromDefs } from "./run_deck";
import { startCombatFromRunDeck } from "./engine";

export const TUTORIAL_COMPLETED_STORAGE_KEY = "cb_tutorial_completed_v1";

const TUTORIAL_SEED = 0x51f7e0a1;
const TUTORIAL_DECK_DEF_IDS = [
  "C-001",
  "C-001",
  "C-002",
  "C-003",
  "C-004",
  "C-004",
  "C-006",
  "NC-005",
  "C-011",
  "C-010",
];

const TUTORIAL_STEP_DEFS = [
  {
    id: "overview",
    title: "Welcome To Combat",
    body: "This encounter is fixed so each turn teaches one thing. Center a card from your hand, double tap an enemy to use it, and double tap your own FW / HP / RAM panel when a card can target you.",
    concepts: ["Intents", "RAM", "Firewall", "HP"],
    acknowledgeOnly: true,
    ctaLabel: "Start Tutorial",
  },
  {
    id: "strike_firewall",
    title: "Break Firewall First",
    body: "Center Strike, then double tap the Training Proxy. It starts with Firewall, so you can see shield damage get soaked before HP drops.",
    concepts: ["Enemy Firewall", "Damage"],
    requiredAction: "play_strike",
  },
  {
    id: "charge_ram",
    title: "RAM Fuels Your Turn",
    body: "Center Charge Pack next, then double tap your own FW / HP / RAM panel. RAM is your action budget each turn, and some cards refill it so you can keep going.",
    concepts: ["RAM", "Utility"],
    requiredAction: "play_charge_pack",
  },
  {
    id: "guard_firewall",
    title: "Build Your Own Firewall",
    body: "Center Guard, then double tap your own panel again. Your Firewall is your first layer of defense, and it sits in front of your HP.",
    concepts: ["Player Firewall", "Defense"],
    requiredAction: "play_guard",
  },
  {
    id: "end_turn_attack",
    title: "Enemy Turns Follow Their Intent",
    body: "Press End Turn. The enemy intent in the target panel is a preview of what it will do when control passes over.",
    concepts: ["Enemy Turn", "Intent"],
    requiredAction: "end_turn_once",
  },
  {
    id: "status_and_mutation",
    title: "Statuses And Mutations",
    body: "Center Corrode Dart, then double tap the Training Proxy. Corrode is a status effect that ticks each turn, and this card is rigged to mutate immediately so you can see the mutation system in action.",
    concepts: ["Status Effects", "Mutations"],
    requiredAction: "play_corrode_dart",
  },
  {
    id: "end_turn_status",
    title: "Statuses Tick Automatically",
    body: "End Turn again. The enemy will apply Corrode to you, and the next turn will show how ongoing effects trigger without spending RAM.",
    concepts: ["Enemy Debuffs", "Turn Start Effects"],
    requiredAction: "end_turn_twice",
  },
  {
    id: "free_play",
    title: "Finish The Drill",
    body: "You have seen the core loop: intents, RAM, Firewall, HP, statuses, mutations, and enemy turns. Finish the fight, or leave the tutorial and start a real run when you are ready.",
    concepts: ["Core Loop"],
    allowExit: true,
  },
];

function collectInstanceIdsByDefId(runDeck) {
  const out = new Map();
  for (const instanceId of runDeck?.master || []) {
    const defId = runDeck?.cardInstances?.[instanceId]?.defId;
    if (!defId) continue;
    if (!out.has(defId)) out.set(defId, []);
    out.get(defId).push(instanceId);
  }
  return out;
}

function takeInstanceId(idPool, defId) {
  const matches = idPool.get(defId) || [];
  return matches.shift() || null;
}

function createTutorialEnemyIntent(data, cardDefId) {
  const card = data?.cards?.[cardDefId];
  if (!card) return null;
  if (cardDefId === "EC-A1") {
    return { cardDefId, name: card.name, type: "Attack", amount: 7 };
  }
  if (cardDefId === "EC-DB1") {
    return { cardDefId, name: card.name, type: "Debuff", amount: 2 };
  }
  return { cardDefId, name: card.name, type: "Unknown", amount: null };
}

function buildTutorialCardRefs(runDeck) {
  const idPool = collectInstanceIdsByDefId(runDeck);
  return {
    strike: takeInstanceId(idPool, "C-001"),
    followupStrike: takeInstanceId(idPool, "C-001"),
    guard: takeInstanceId(idPool, "C-002"),
    patch: takeInstanceId(idPool, "C-003"),
    scanA: takeInstanceId(idPool, "C-004"),
    scanB: takeInstanceId(idPool, "C-004"),
    chargePack: takeInstanceId(idPool, "C-006"),
    corrodeDart: takeInstanceId(idPool, "NC-005"),
    shieldbreak: takeInstanceId(idPool, "C-011"),
    scatterfire: takeInstanceId(idPool, "C-010"),
  };
}

export function createTutorialRunState(data) {
  const state = dispatchGame(createInitialState(), data, { type: "NewRun", seed: TUTORIAL_SEED });
  const tutorialDeck = createRunDeckFromDefs(data, TUTORIAL_SEED ^ 0x13579bdf, TUTORIAL_DECK_DEF_IDS);
  const cardRefs = buildTutorialCardRefs(tutorialDeck);

  state.mode = "Combat";
  state.map = null;
  state.reward = null;
  state.shop = null;
  state.event = null;
  state.deckView = null;
  state.deck = tutorialDeck;
  state.run.gold = 0;
  state.run.hp = 40;
  state.run.maxHP = 40;
  state.run.tutorial = {
    active: true,
    stepIndex: 0,
    status: "in_progress",
    outcome: null,
    cardIds: {
      strike: cardRefs.strike,
      chargePack: cardRefs.chargePack,
      guard: cardRefs.guard,
      corrodeDart: cardRefs.corrodeDart,
    },
  };
  state.combat = startCombatFromRunDeck({
    data,
    seed: TUTORIAL_SEED ^ 0x2468ace0,
    act: 1,
    runDeck: state.deck,
    enemyIds: ["E_CORRODE_RAT"],
    playerMaxHP: state.run.maxHP,
    playerMaxRAM: 3,
    playerRamRegen: 2,
    openingHand: 5,
    forcedMutationTier: "A",
    relicIds: [],
  });

  state.combat.player.hp = state.run.hp;
  state.combat.player.maxHP = state.run.maxHP;
  state.combat.player.maxRAM = 3;
  state.combat.player.ramRegen = 2;
  state.combat.player.ram = 2;
  state.combat.player.piles.hand = [
    cardRefs.strike,
    cardRefs.chargePack,
    cardRefs.guard,
    cardRefs.patch,
    cardRefs.scanA,
  ].filter(Boolean);
  state.combat.player.piles.draw = [
    cardRefs.corrodeDart,
    cardRefs.followupStrike,
    cardRefs.shieldbreak,
    cardRefs.scanB,
    cardRefs.scatterfire,
  ].filter(Boolean);
  state.combat.player.piles.discard = [];
  state.combat.player.piles.exhaust = [];
  state.combat.player.piles.power = [];

  if (cardRefs.corrodeDart && state.combat.cardInstances?.[cardRefs.corrodeDart]) {
    state.combat.cardInstances[cardRefs.corrodeDart].useCounter = 1;
    state.combat.cardInstances[cardRefs.corrodeDart].finalMutationCountdown = 9;
  }

  const enemy = state.combat.enemies?.[0];
  if (enemy) {
    enemy.name = "Training Proxy";
    enemy.hp = 24;
    enemy.maxHP = 24;
    enemy.statuses = [{ id: "Firewall", stacks: 6 }];
    enemy.intent = createTutorialEnemyIntent(data, "EC-A1");
    if (state.combat.enemyAI?.cursorByEnemyId) {
      state.combat.enemyAI.cursorByEnemyId[enemy.id] = 1;
    }
  }

  push(state.log, { t: "Info", msg: "Tutorial run started" });
  return state;
}

export function getTutorialStep(state) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return null;
  return TUTORIAL_STEP_DEFS[tutorial.stepIndex] || TUTORIAL_STEP_DEFS[TUTORIAL_STEP_DEFS.length - 1];
}

function buildTutorialBlock(message) {
  return { allowed: false, message };
}

function isCombatTutorialAction(action) {
  return typeof action?.type === "string" && action.type.startsWith("Combat_");
}

export function canUseTutorialAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial?.active || state?.mode !== "Combat") return { allowed: true };
  const cardIds = tutorial.cardIds || {};
  const isCombatAction = isCombatTutorialAction(action);

  switch (tutorial.stepIndex) {
    case 0:
      if (isCombatAction) {
        return buildTutorialBlock("Start the tutorial note first so the screen layout makes sense.");
      }
      break;
    case 1:
      if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.strike)) {
        return buildTutorialBlock("Use Strike first. Center it, then double tap the Training Proxy so the Firewall lesson lands cleanly.");
      }
      break;
    case 2:
      if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.chargePack)) {
        return buildTutorialBlock("Charge Pack is next. Center it, then double tap your own FW / HP / RAM panel so the RAM lesson lands cleanly.");
      }
      break;
    case 3:
      if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.guard)) {
        return buildTutorialBlock("Guard is next. Center it, then double tap your own panel so you can see Firewall absorb the incoming hit.");
      }
      break;
    case 4:
      if (isCombatAction && action.type !== "Combat_EndTurn") {
        return buildTutorialBlock("End Turn now. Enemy intents only matter once you let the enemy act.");
      }
      break;
    case 5:
      if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.corrodeDart)) {
        return buildTutorialBlock("Corrode Dart is the tutorial card here. Center it, then double tap the Training Proxy to see a status effect and an immediate mutation.");
      }
      break;
    case 6:
      if (isCombatAction && action.type !== "Combat_EndTurn") {
        return buildTutorialBlock("End Turn again so you can watch the enemy apply Corrode and see statuses tick on their own.");
      }
      break;
    default:
      break;
  }

  return { allowed: true };
}

export function advanceTutorialState(nextState, action) {
  const tutorial = nextState?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return nextState;

  if (nextState.mode === "GameOver") {
    return finalizeTutorialState(nextState, "defeat");
  }
  if (nextState.mode === "Reward") {
    return finalizeTutorialState(nextState, "victory");
  }

  const cardIds = tutorial.cardIds || {};
  const advance = () => {
    tutorial.stepIndex = Math.min(TUTORIAL_STEP_DEFS.length - 1, tutorial.stepIndex + 1);
  };

  switch (tutorial.stepIndex) {
    case 1:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.strike) advance();
      break;
    case 2:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.chargePack) advance();
      break;
    case 3:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.guard) advance();
      break;
    case 4:
      if (action.type === "Combat_EndTurn") advance();
      break;
    case 5:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.corrodeDart) advance();
      break;
    case 6:
      if (action.type === "Combat_EndTurn") advance();
      break;
    default:
      break;
  }

  return nextState;
}

export function finalizeTutorialState(nextState, outcome = "complete") {
  if (!nextState?.run?.tutorial) return nextState;
  nextState.mode = "TutorialComplete";
  nextState.reward = null;
  nextState.shop = null;
  nextState.event = null;
  nextState.deckView = null;
  nextState.map = null;
  nextState.combat = null;
  nextState.run.tutorial.status = "complete";
  nextState.run.tutorial.outcome = outcome;
  push(nextState.log, {
    t: "Info",
    msg: outcome === "victory"
      ? "Tutorial complete: victory"
      : outcome === "defeat"
        ? "Tutorial complete: defeated"
        : "Tutorial complete",
  });
  return nextState;
}
