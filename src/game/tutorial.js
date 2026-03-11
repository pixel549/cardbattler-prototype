import { push } from "./log";
import { createInitialState, dispatchGame } from "./game_core";
import { createRunDeckFromDefs } from "./run_deck";
import { startCombatFromRunDeck } from "./engine";

export const TUTORIAL_COMPLETED_STORAGE_KEY = "cb_tutorial_completed_v1";
export const DEFAULT_TUTORIAL_ID = "combat_basics";

const BASE_TUTORIAL_SEED = 0x51f7e0a1;
const COMBAT_BASICS_ID = "combat_basics";
const ADVANCED_MECHANICS_ID = "advanced_mechanics";

const COMBAT_BASICS_DECK_DEF_IDS = [
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

const ADVANCED_MECHANICS_DECK_DEF_IDS = [
  "NC-005",
  "C-001",
  "C-002",
  "C-003",
  "C-004",
  "C-004",
  "C-006",
  "C-011",
  "C-010",
  "C-001",
];

const COMBAT_BASICS_STEPS = [
  {
    id: "overview",
    title: "Welcome To Combat",
    body: "This encounter is fixed so each turn teaches one thing. Center a card from your hand, double tap an enemy to use it, and double tap your own FW / HP / RAM panel when a card can target you.",
    concepts: ["Turns", "RAM", "Firewall", "HP"],
    acknowledgeOnly: true,
    ctaLabel: "Start Basics",
  },
  {
    id: "strike_firewall",
    title: "Break Firewall First",
    body: "Center Strike, then double tap the Training Proxy. It starts with Firewall, so you can watch that defense soak damage before HP starts dropping.",
    concepts: ["Enemy Firewall", "Damage"],
  },
  {
    id: "charge_ram",
    title: "RAM Fuels Your Turn",
    body: "Center Charge Pack next, then double tap your own FW / HP / RAM panel. RAM is your action budget each turn, and some cards refill it so you can keep going.",
    concepts: ["RAM", "Utility"],
  },
  {
    id: "guard_firewall",
    title: "Build Your Own Firewall",
    body: "Center Guard, then double tap yourself again. Your Firewall sits in front of HP and absorbs incoming pressure first.",
    concepts: ["Player Firewall", "Defense"],
  },
  {
    id: "end_turn_attack",
    title: "Enemy Turns Follow Their Intent",
    body: "Press End Turn. The target panel previews the enemy's next action, so you can plan before you hand the turn over.",
    concepts: ["Enemy Turn", "Intent"],
  },
  {
    id: "status_and_mutation",
    title: "Statuses And Mutations",
    body: "Center Corrode Dart, then double tap the Training Proxy. Corrode is a lasting status, and this card is primed to mutate immediately so you can see card evolution start.",
    concepts: ["Status Effects", "Mutations"],
  },
  {
    id: "end_turn_status",
    title: "Statuses Tick Automatically",
    body: "End Turn again. Ongoing effects keep resolving even when you are not spending RAM, which is why enemy intents and status stacks both matter.",
    concepts: ["Turn Ticks", "Enemy Debuffs"],
  },
  {
    id: "free_play",
    title: "Finish The Drill",
    body: "You have seen turns, deck flow, RAM, Firewall, HP, intents, statuses, and mutation setup. Finish the fight and the lesson will continue to the reward screen.",
    concepts: ["Core Loop", "Deck Flow"],
  },
  {
    id: "reward_screen",
    mode: "Reward",
    title: "Rewards Grow The Run",
    body: "Victories usually end here. Card rewards get shuffled into your deck for future combats, so this is where a run starts changing shape. Pick a card or skip to close the basics lesson.",
    concepts: ["Rewards", "Deck Growth"],
  },
];

const ADVANCED_MECHANICS_STEPS = [
  {
    id: "overview",
    title: "Advanced Mechanics",
    body: "This lesson focuses on how effects, statuses, mutations, and relics differ. The proxy and opening hand are scripted so you can see those systems in a clean order.",
    concepts: ["Effects", "Statuses", "Mutations", "Relics"],
    acknowledgeOnly: true,
    ctaLabel: "Start Advanced Lesson",
  },
  {
    id: "play_corrode",
    title: "Cards Create Effects",
    body: "Center Corrode Dart, then double tap the testbed. Playing the card creates an immediate effect now, while the Corrode it applies stays behind as a lasting status.",
    concepts: ["Card Effects", "Statuses"],
  },
  {
    id: "end_turn_status",
    title: "Statuses Keep Working",
    body: "Press End Turn. You will hand control over, the proxy will answer with its own debuff, and the ongoing stacks will keep mattering without another card being played.",
    concepts: ["Status Timing", "Enemy Turns"],
  },
  {
    id: "patch_self",
    title: "Effects Resolve Immediately",
    body: "Center Patch, then double tap yourself. Healing is a one-shot card effect: it happens now, unlike Corrode or Firewall which stay on an entity and change future turns.",
    concepts: ["Self Targeting", "Instant Effects"],
  },
  {
    id: "free_play",
    title: "Mutations Change Future Plays",
    body: "Corrode Dart was primed to mutate after one use, so the card itself has already changed. Finish the proxy, then compare relic rewards against card rewards on the next screen.",
    concepts: ["Mutations", "Free Play"],
  },
  {
    id: "reward_screen",
    mode: "Reward",
    title: "Relics Vs Cards",
    body: "Cards join your deck and must be drawn and paid for in combat. Relics stay outside the deck and passively shape every fight. Pick a relic if you want, then take a card or skip to finish the advanced lesson.",
    concepts: ["Relics", "Cards", "Passive Bonuses"],
  },
];

const TUTORIAL_DEFINITIONS = [
  {
    id: COMBAT_BASICS_ID,
    title: "Combat Basics",
    menuDescription: "Turns, deck flow, HP, RAM, Firewall, intents, and the reward screen.",
    concepts: ["Turns", "Deck", "RAM", "Firewall", "Rewards"],
    accent: "#00f0ff",
    recommended: true,
    steps: COMBAT_BASICS_STEPS,
    rewardStepIndex: 8,
    rewardConfig: {
      cardChoices: ["C-001", "C-004", "C-006"],
      relicChoices: [],
    },
    completionVictoryBody: "You cleared the scripted fight and walked the full basics loop from opening hand through rewards.",
    completionReviewBody: "You reached the end of the basics lesson. Even if the proxy got messy, the turn flow, defenses, and reward screen were all introduced.",
    buildState: createCombatBasicsRunState,
  },
  {
    id: ADVANCED_MECHANICS_ID,
    title: "Advanced Mechanics",
    menuDescription: "Mutations, effect timing, status behavior, and relics versus cards.",
    concepts: ["Mutations", "Effects", "Statuses", "Relics"],
    accent: "#b44aff",
    recommended: false,
    steps: ADVANCED_MECHANICS_STEPS,
    rewardStepIndex: 5,
    rewardConfig: {
      cardChoices: ["C-011", "NC-099", "C-004"],
      relicChoices: ["MutationCatalyst", "PatchNotes"],
    },
    completionVictoryBody: "You stepped through effect timing, status carry-over, mutation payoff, and the difference between passive relics and active cards.",
    completionReviewBody: "You reached the end of the advanced lesson. The key ideas about mutations, status timing, and relics versus cards were still introduced.",
    buildState: createAdvancedMechanicsRunState,
  },
];

const TUTORIAL_DEFINITION_BY_ID = Object.fromEntries(
  TUTORIAL_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const ALL_TUTORIAL_IDS = TUTORIAL_DEFINITIONS.map((definition) => definition.id);

function getTutorialRuntime(tutorialId) {
  return TUTORIAL_DEFINITION_BY_ID[tutorialId] || TUTORIAL_DEFINITION_BY_ID[DEFAULT_TUTORIAL_ID];
}

export function getTutorialCatalog() {
  return TUTORIAL_DEFINITIONS.map((definition) => ({
    id: definition.id,
    title: definition.title,
    menuDescription: definition.menuDescription,
    concepts: [...definition.concepts],
    accent: definition.accent,
    recommended: definition.recommended,
  }));
}

export function getTutorialDefinition(tutorialId) {
  const definition = getTutorialRuntime(tutorialId);
  return {
    id: definition.id,
    title: definition.title,
    menuDescription: definition.menuDescription,
    concepts: [...definition.concepts],
    accent: definition.accent,
    recommended: definition.recommended,
    completionVictoryBody: definition.completionVictoryBody,
    completionReviewBody: definition.completionReviewBody,
  };
}

export function parseCompletedTutorialIds(rawValue) {
  if (!rawValue) return [];
  if (rawValue === "true") return [...ALL_TUTORIAL_IDS];

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed === true) return [...ALL_TUTORIAL_IDS];

    const ids = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.completedTutorialIds)
        ? parsed.completedTutorialIds
        : [];

    const validIds = new Set(ALL_TUTORIAL_IDS);
    return [...new Set(ids)].filter((id) => validIds.has(id));
  } catch {
    return [];
  }
}

export function serializeCompletedTutorialIds(completedIds) {
  const validIds = new Set(ALL_TUTORIAL_IDS);
  const normalized = [...new Set(completedIds || [])].filter((id) => validIds.has(id));
  return JSON.stringify(normalized);
}

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

function createTutorialBaseState(data, tutorialId, deckDefIds, config = {}) {
  const definition = getTutorialRuntime(tutorialId);
  const seed = (BASE_TUTORIAL_SEED ^ (config.seedSalt ?? 0)) >>> 0;
  const state = dispatchGame(createInitialState(), data, { type: "NewRun", seed });
  const tutorialDeck = createRunDeckFromDefs(data, seed ^ 0x13579bdf, deckDefIds);
  const cardRefs = buildTutorialCardRefs(tutorialDeck);
  const playerMaxHP = config.playerMaxHP ?? 40;
  const playerHp = config.playerHp ?? playerMaxHP;
  const relicIds = [...(config.relicIds || [])];

  state.mode = "Combat";
  state.map = null;
  state.reward = null;
  state.shop = null;
  state.event = null;
  state.deckView = null;
  state.deck = tutorialDeck;
  state.run.gold = 0;
  state.run.hp = playerHp;
  state.run.maxHP = playerMaxHP;
  state.run.relicIds = relicIds;
  state.run.tutorial = {
    id: tutorialId,
    active: true,
    stepIndex: 0,
    status: "in_progress",
    outcome: null,
    rewardConfigured: false,
    cardIds: {
      strike: cardRefs.strike,
      followupStrike: cardRefs.followupStrike,
      chargePack: cardRefs.chargePack,
      guard: cardRefs.guard,
      patch: cardRefs.patch,
      corrodeDart: cardRefs.corrodeDart,
      shieldbreak: cardRefs.shieldbreak,
      scatterfire: cardRefs.scatterfire,
    },
  };

  state.combat = startCombatFromRunDeck({
    data,
    seed: seed ^ 0x2468ace0,
    act: 1,
    runDeck: state.deck,
    enemyIds: config.enemyIds || ["E_CORRODE_RAT"],
    playerMaxHP,
    playerMaxRAM: config.playerMaxRAM ?? 3,
    playerRamRegen: config.playerRamRegen ?? 2,
    openingHand: 5,
    forcedMutationTier: config.forcedMutationTier ?? "A",
    relicIds,
  });

  state.combat.player.hp = playerHp;
  state.combat.player.maxHP = playerMaxHP;
  state.combat.player.maxRAM = config.playerMaxRAM ?? 3;
  state.combat.player.ramRegen = config.playerRamRegen ?? 2;
  state.combat.player.ram = config.playerRam ?? Math.min(state.combat.player.maxRAM, state.combat.player.ramRegen);

  push(state.log, { t: "Info", msg: `Tutorial run started: ${definition.title}` });
  return { state, cardRefs };
}

function createCombatBasicsRunState(data) {
  const { state, cardRefs } = createTutorialBaseState(data, COMBAT_BASICS_ID, COMBAT_BASICS_DECK_DEF_IDS, {
    seedSalt: 0x11110000,
    playerMaxHP: 40,
    playerHp: 40,
    playerMaxRAM: 3,
    playerRamRegen: 2,
    playerRam: 2,
  });

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

  return state;
}

function createAdvancedMechanicsRunState(data) {
  const { state, cardRefs } = createTutorialBaseState(data, ADVANCED_MECHANICS_ID, ADVANCED_MECHANICS_DECK_DEF_IDS, {
    seedSalt: 0x22220000,
    playerMaxHP: 30,
    playerHp: 22,
    playerMaxRAM: 3,
    playerRamRegen: 2,
    playerRam: 2,
  });

  state.combat.player.piles.hand = [
    cardRefs.corrodeDart,
    cardRefs.patch,
    cardRefs.strike,
    cardRefs.guard,
    cardRefs.scanA,
  ].filter(Boolean);
  state.combat.player.piles.draw = [
    cardRefs.followupStrike,
    cardRefs.shieldbreak,
    cardRefs.chargePack,
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
    enemy.name = "Mutation Testbed";
    enemy.hp = 18;
    enemy.maxHP = 18;
    enemy.statuses = [];
    enemy.intent = createTutorialEnemyIntent(data, "EC-DB1");
    if (state.combat.enemyAI?.cursorByEnemyId) {
      state.combat.enemyAI.cursorByEnemyId[enemy.id] = 1;
    }
  }

  return state;
}

export function createTutorialRunState(data, tutorialId = DEFAULT_TUTORIAL_ID) {
  return getTutorialRuntime(tutorialId).buildState(data);
}

export function getTutorialStep(state) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return null;

  const definition = getTutorialRuntime(tutorial.id);
  const stepIndex = Math.max(0, Math.min(tutorial.stepIndex ?? 0, definition.steps.length - 1));
  return definition.steps[stepIndex] || null;
}

export function acknowledgeTutorialStep(state) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return state;

  const step = getTutorialStep(state);
  if (!step?.acknowledgeOnly) return state;

  const definition = getTutorialRuntime(tutorial.id);
  return {
    ...state,
    run: {
      ...state.run,
      tutorial: {
        ...tutorial,
        stepIndex: Math.min((tutorial.stepIndex ?? 0) + 1, definition.steps.length - 1),
      },
    },
  };
}

function buildTutorialBlock(message) {
  return { allowed: false, message };
}

function isCombatTutorialAction(action) {
  return typeof action?.type === "string" && action.type.startsWith("Combat_");
}

function isRewardTutorialAction(action) {
  return typeof action?.type === "string" && action.type.startsWith("Reward_");
}

function canUseCombatBasicsAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial) return { allowed: true };
  const cardIds = tutorial.cardIds || {};
  const isCombatAction = isCombatTutorialAction(action);

  if (state?.mode === "Combat") {
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
          return buildTutorialBlock("End Turn again so you can watch ongoing effects keep working.");
        }
        break;
      default:
        break;
    }
  }

  if (state?.mode === "Reward" && tutorial.stepIndex < getTutorialRuntime(COMBAT_BASICS_ID).rewardStepIndex && isRewardTutorialAction(action)) {
    return buildTutorialBlock("Finish the combat lesson first, then the reward screen will make more sense.");
  }

  return { allowed: true };
}

function canUseAdvancedMechanicsAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial) return { allowed: true };
  const cardIds = tutorial.cardIds || {};
  const isCombatAction = isCombatTutorialAction(action);

  if (state?.mode === "Combat") {
    switch (tutorial.stepIndex) {
      case 0:
        if (isCombatAction) {
          return buildTutorialBlock("Start the lesson note first so the advanced cues land in order.");
        }
        break;
      case 1:
        if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.corrodeDart)) {
          return buildTutorialBlock("Corrode Dart is first. Use it on the testbed so you can compare immediate card effects with a lingering status.");
        }
        break;
      case 2:
        if (isCombatAction && action.type !== "Combat_EndTurn") {
          return buildTutorialBlock("End Turn now so the status timing and enemy response can play out.");
        }
        break;
      case 3:
        if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.patch)) {
          return buildTutorialBlock("Patch is next. Use it on yourself so the difference between an instant effect and a lasting status is obvious.");
        }
        break;
      default:
        break;
    }
  }

  if (state?.mode === "Reward" && tutorial.stepIndex < getTutorialRuntime(ADVANCED_MECHANICS_ID).rewardStepIndex && isRewardTutorialAction(action)) {
    return buildTutorialBlock("Clear the testbed first. The relic-vs-card lesson comes right after the fight.");
  }

  return { allowed: true };
}

export function canUseTutorialAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return { allowed: true };

  if (tutorial.id === ADVANCED_MECHANICS_ID) {
    return canUseAdvancedMechanicsAction(state, action);
  }
  return canUseCombatBasicsAction(state, action);
}

function setTutorialStepIndex(tutorial, definition, nextIndex) {
  tutorial.stepIndex = Math.max(0, Math.min(nextIndex, definition.steps.length - 1));
}

function advanceTutorialStep(tutorial, definition) {
  setTutorialStepIndex(tutorial, definition, (tutorial.stepIndex ?? 0) + 1);
}

function applyTutorialRewardConfig(nextState, definition) {
  const tutorial = nextState?.run?.tutorial;
  if (!nextState?.reward || !tutorial || tutorial.rewardConfigured) return;

  nextState.reward.cardChoices = [...(definition.rewardConfig?.cardChoices || nextState.reward.cardChoices || [])];
  if ((definition.rewardConfig?.relicChoices || []).length > 0) {
    nextState.reward.relicChoices = [...definition.rewardConfig.relicChoices];
  } else {
    delete nextState.reward.relicChoices;
  }
  tutorial.rewardConfigured = true;
}

function handleRewardStepTransition(nextState, definition) {
  if (nextState?.mode !== "Reward") return false;
  applyTutorialRewardConfig(nextState, definition);
  setTutorialStepIndex(nextState.run.tutorial, definition, definition.rewardStepIndex);
  return true;
}

function advanceCombatBasicsTutorial(nextState, action, definition) {
  const tutorial = nextState.run.tutorial;
  const cardIds = tutorial.cardIds || {};

  if (handleRewardStepTransition(nextState, definition)) return nextState;

  if (action.type === "Reward_PickCard" || action.type === "Reward_Skip") {
    return finalizeTutorialState(nextState, "victory");
  }

  switch (tutorial.stepIndex) {
    case 1:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.strike) advanceTutorialStep(tutorial, definition);
      break;
    case 2:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.chargePack) advanceTutorialStep(tutorial, definition);
      break;
    case 3:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.guard) advanceTutorialStep(tutorial, definition);
      break;
    case 4:
      if (action.type === "Combat_EndTurn") advanceTutorialStep(tutorial, definition);
      break;
    case 5:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.corrodeDart) advanceTutorialStep(tutorial, definition);
      break;
    case 6:
      if (action.type === "Combat_EndTurn") advanceTutorialStep(tutorial, definition);
      break;
    default:
      break;
  }

  return nextState;
}

function advanceAdvancedMechanicsTutorial(nextState, action, definition) {
  const tutorial = nextState.run.tutorial;
  const cardIds = tutorial.cardIds || {};

  if (handleRewardStepTransition(nextState, definition)) return nextState;

  if (action.type === "Reward_PickCard" || action.type === "Reward_Skip") {
    return finalizeTutorialState(nextState, "victory");
  }

  switch (tutorial.stepIndex) {
    case 1:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.corrodeDart) advanceTutorialStep(tutorial, definition);
      break;
    case 2:
      if (action.type === "Combat_EndTurn") advanceTutorialStep(tutorial, definition);
      break;
    case 3:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.patch) advanceTutorialStep(tutorial, definition);
      break;
    default:
      break;
  }

  return nextState;
}

export function advanceTutorialState(nextState, action) {
  const tutorial = nextState?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return nextState;

  if (nextState.mode === "GameOver") {
    return finalizeTutorialState(nextState, "defeat");
  }

  const definition = getTutorialRuntime(tutorial.id);
  if (definition.id === ADVANCED_MECHANICS_ID) {
    return advanceAdvancedMechanicsTutorial(nextState, action, definition);
  }
  return advanceCombatBasicsTutorial(nextState, action, definition);
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
