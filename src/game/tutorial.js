import { push } from "./log.js";
import { createInitialState, dispatchGame } from "./game_core.js";
import { createRunDeckFromDefs } from "./run_deck.js";
import { startCombatFromRunDeck } from "./engine.js";
import { HEAT_MAX, createRunAdaptationProfile, getArenaModifierMeta } from "./combatMeta.js";

export const TUTORIAL_COMPLETED_STORAGE_KEY = "cb_tutorial_completed_v1";
export const DEFAULT_TUTORIAL_ID = "combat_basics";

const BASE_TUTORIAL_SEED = 0x51f7e0a1;
const COMBAT_BASICS_ID = "combat_basics";
const RUN_MODES_BRIEFING_ID = "run_modes_briefing";
const ADVANCED_MECHANICS_ID = "advanced_mechanics";
const PRESSURE_SYSTEMS_ID = "pressure_systems";
const BOSS_PROTOCOLS_ID = "boss_protocols";
const INSTABILITY_LAB_ID = "instability_lab";
const PRESSURE_SYSTEMS_EVENT_STEP_INDEX = 6;

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

const PRESSURE_SYSTEMS_DECK_DEF_IDS = [
  "C-011",
  "NC-011",
  "NC-074",
  "C-001",
  "C-002",
  "C-004",
  "NC-062",
  "C-006",
  "C-001",
  "C-002",
];

const BOSS_PROTOCOLS_DECK_DEF_IDS = [
  "C-011",
  "C-001",
  "C-006",
  "C-002",
  "C-003",
  "C-004",
  "NC-005",
  "C-010",
  "C-001",
  "C-002",
];

const INSTABILITY_LAB_DECK_DEF_IDS = [
  "C-011",
  "NC-062",
  "NC-011",
  "C-004",
  "C-001",
  "C-002",
  "C-006",
  "C-010",
  "C-003",
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

const RUN_MODES_BRIEFING_STEPS = [
  {
    id: "overview",
    mode: "MainMenu",
    menuView: "home",
    title: "Run Modes Briefing",
    body: "The front page stays lean on purpose. This briefing pans across the buried systems so classes, dailies, boss intel, and unlocks all have a clear place in the flow.",
    concepts: ["Run Setup", "Daily Run", "Intel", "Unlocks"],
    acknowledgeOnly: true,
    ctaLabel: "Open Briefing",
  },
  {
    id: "starter_profiles",
    mode: "MainMenu",
    menuView: "setup",
    title: "Starter Profiles Are Classes",
    body: "Starter Profiles are your classes: they change starting deck, relics, and identity tags. Difficulty and optional challenges live on the same page so the tradeoffs stay visible before launch.",
    concepts: ["Classes", "Difficulty", "Challenges"],
    acknowledgeOnly: true,
    ctaLabel: "Next Pane",
  },
  {
    id: "daily_run",
    mode: "MainMenu",
    menuView: "daily",
    title: "Daily Runs Are Shared Seeds",
    body: "Daily Runs package a fixed class, difficulty, challenges, and seed into one shared breach. They are meant to be comparable and replayable, not another buried toggle on the main launch card.",
    concepts: ["Daily Run", "Shared Seed", "Records"],
    acknowledgeOnly: true,
    ctaLabel: "Next Pane",
  },
  {
    id: "progress_archive",
    mode: "MainMenu",
    menuView: "intel",
    intelView: "progress",
    title: "Meta Progress Tracks The Long Game",
    body: "Unlocks, achievements, and daily records feed repeat runs. This archive view is where players can understand why new classes, ascensions, challenges, and cosmetic rewards are appearing.",
    concepts: ["Meta Progress", "Achievements", "Unlocks"],
    acknowledgeOnly: true,
    ctaLabel: "Boss Intel",
  },
  {
    id: "boss_archive",
    mode: "MainMenu",
    menuView: "intel",
    intelView: "bosses",
    title: "Boss Intel Should Be Readable",
    body: "Boss archive entries tell the player which phase mechanics they have seen and defeated. This is the bridge between one scary fight and future planning, so it belongs in onboarding too.",
    concepts: ["Boss Intel", "Phase Mechanics", "Archive"],
    acknowledgeOnly: true,
    ctaLabel: "Cosmetics",
  },
  {
    id: "callsigns",
    mode: "MainMenu",
    menuView: "intel",
    intelView: "callsigns",
    title: "Identity Rewards Live Here",
    body: "Callsigns are a cosmetic reward lane tied to achievements and repeat play. They do not change rules, but they reinforce progression and give the archive a personal hook.",
    concepts: ["Callsigns", "Cosmetics", "Achievements"],
    acknowledgeOnly: true,
    ctaLabel: "Wrap Up",
  },
  {
    id: "wrap_up",
    mode: "MainMenu",
    menuView: "home",
    title: "Use The Front Door, Know The Back Rooms",
    body: "That is the whole menu flow: launch from Home, tune loadout in Run Setup, check the shared Daily, and use Intel to understand unlocks and bosses between runs.",
    concepts: ["Home", "Loadout", "Daily", "Intel"],
    acknowledgeOnly: true,
    completeOnAcknowledge: true,
    ctaLabel: "Complete Briefing",
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

const PRESSURE_SYSTEMS_STEPS = [
  {
    id: "overview",
    title: "Pressure Systems",
    body: "This lesson covers the newer run pressure loop: arena modifiers, trace Heat, scrap recovery, and Reforge. The encounter and rest stop are scripted so each piece lands in order.",
    concepts: ["Arena Modifiers", "Heat", "Scrap", "Reforge"],
    acknowledgeOnly: true,
    ctaLabel: "Start Pressure Lesson",
  },
  {
    id: "breach_firewall",
    title: "Arena Modifiers Change The Fight",
    body: "Firewall Grid is online, so the Trace Warden starts with extra Firewall and keeps pulsing it back in. Center Shieldbreak Pulse, then double tap the Warden to cut through the arena bonus first.",
    concepts: ["Arena Modifiers", "Firewall"],
  },
  {
    id: "cache_ram",
    title: "Set Up Your Burst",
    body: "Center RAM Cache next, then double tap your own FW / HP / RAM panel. Burst turns usually need setup, and utility cards can bankroll the spike before you cash it out.",
    concepts: ["RAM", "Burst Setup"],
  },
  {
    id: "spike_heat",
    title: "Burst Cards Build Heat",
    body: "Center Broadcast Surge, then double tap the Trace Warden. Big x-cost bursts raise trace Heat fast, so watch the heat meter jump as you unload the turn.",
    concepts: ["Heat", "X-Cost"],
  },
  {
    id: "end_turn_heat",
    title: "Heat Pushes Back",
    body: "End Turn now. Once Heat is up, the network hardens and future turns get harsher, so pressure management matters just as much as raw damage.",
    concepts: ["Heat Thresholds", "Enemy Pressure"],
  },
  {
    id: "free_play",
    title: "Close The Fight",
    body: "Finish the Warden from here. In live runs, cards that burn through their instability clocks can final-mutate into bricks. After combat, the lesson will pivot into the salvage loop that turns those failures back into leverage.",
    concepts: ["Pressure Loop", "Recovery"],
  },
  {
    id: "rest_scrap",
    mode: "Event",
    title: "Scrap Funds Recovery",
    body: "Cleanup from the fight recovered enough scrap to fix one stressed card. Bricked code comes from failed final mutations, and the salvage loop turns that damage control into future momentum. Choose Reforge at the rest site.",
    concepts: ["Scrap", "Rest Sites", "Recovery"],
  },
  {
    id: "reforge_target",
    mode: "Event",
    title: "Reforge Bundles Repair",
    body: "Select Heat Sink. Reforge rolls repair, compile, and clock stabilisation into one action, which is how scrap turns damage control back into long-run momentum.",
    concepts: ["Reforge", "Compile", "Stabilise"],
  },
];

const BOSS_PROTOCOLS_STEPS = [
  {
    id: "overview",
    title: "Boss Protocols",
    body: "Bosses do more than hit harder. They carry directive text, phase thresholds, and bespoke punishers that turn the fight into a rules lesson as much as a damage race.",
    concepts: ["Bosses", "Directives", "Phase Thresholds"],
    acknowledgeOnly: true,
    ctaLabel: "Start Boss Drill",
  },
  {
    id: "phase_break",
    title: "Cross A Phase Threshold",
    body: "Center Shieldbreak Pulse, then double tap the Training Hydra. It is sitting just above a phase line, so one clean hit will trigger its boss protocol immediately.",
    concepts: ["Phase Change", "Shieldbreak", "Boss HUD"],
  },
  {
    id: "phase_read",
    title: "Read The Boss Response",
    body: "That threshold spawned support because this Hydra splits its process at phase breaks. Boss directive text is not flavor text; it tells you what extra problem just entered the fight.",
    concepts: ["Boss Directive", "Adds", "Target Priority"],
    acknowledgeOnly: true,
    ctaLabel: "Watch A Turn",
  },
  {
    id: "end_turn",
    title: "Boss Turns Stack Pressure",
    body: "End Turn now. Bosses usually make the board worse when you hand them time, which is why phases, adds, and intent reading all matter together.",
    concepts: ["Enemy Intent", "Phase Pressure", "Adds"],
  },
  {
    id: "free_play",
    title: "Finish The Protocol Drill",
    body: "Clean up the Hydra from here. The important part was seeing a directive trigger, reading the board change, and learning that boss fights are governed by more than raw HP.",
    concepts: ["Boss Flow", "Directive Reading", "Free Play"],
  },
  {
    id: "reward_screen",
    mode: "Reward",
    title: "Archive Boss Knowledge",
    body: "Boss intel belongs in the long game. After a real run, archive progress and future planning feed back into the next attempt instead of leaving the phase mechanic as a one-off surprise.",
    concepts: ["Archive", "Boss Intel", "Repeat Runs"],
  },
];

const INSTABILITY_LAB_STEPS = [
  {
    id: "overview",
    mode: "Event",
    title: "Instability Lab",
    body: "This follow-up links card maintenance to combat adaptation. You will compile one card, stabilise another, then fight a response that is already counter-tuned to an aggro run.",
    concepts: ["Compile", "Stabilise", "Adaptive Enemies"],
    acknowledgeOnly: true,
    ctaLabel: "Open Lab",
  },
  {
    id: "compile_open",
    mode: "Event",
    title: "Compile Is An Upgrade Node",
    body: "Open the Compile station. Compile permanently lowers a card's RAM cost for the run and adds a typed bonus when it resolves.",
    concepts: ["Compile", "Permanent Upgrade", "Node Value"],
  },
  {
    id: "compile_target",
    mode: "DeckView",
    title: "Compile Your Pressure Tool",
    body: "Pick Shieldbreak Pulse. It is a clean before-and-after example because you can immediately use the cheaper compiled version in the next combat.",
    concepts: ["Deck Picker", "Compile Target", "Cost Reduction"],
  },
  {
    id: "stabilise_intro",
    mode: "Event",
    title: "Stabilise Prevents Future Bricks",
    body: "Now the lab pivots to card safety. Stabilise increases a card's instability clocks, buying time before a future final mutation can collapse into a brick.",
    concepts: ["Stabilise", "Instability", "Bricks"],
    acknowledgeOnly: true,
    ctaLabel: "Open Rest Site",
  },
  {
    id: "stabilise_open",
    mode: "Event",
    title: "Open Stabilise",
    body: "Choose Stabilise at the Rest site. This is the maintenance side of the mutation system: not every answer is more power, sometimes it is keeping a key card alive.",
    concepts: ["Rest Site", "Maintenance", "Mutation Clocks"],
  },
  {
    id: "stabilise_target",
    mode: "DeckView",
    title: "Protect The Fragile Card",
    body: "Pick Heat Sink. Its clocks are intentionally short here so you can see Stabilise as the opposite of a brick spiral.",
    concepts: ["Deck Picker", "Clock Recovery", "Safety Valve"],
  },
  {
    id: "adaptive_intro",
    title: "The Network Adapts",
    body: "This next fight spawned with Adaptive Firewall because the run profile is heavily aggro-coded. Counterplay should be legible: the system reacts to what the player has been doing, not randomly.",
    concepts: ["Adaptive Firewall", "Counterplay", "Readability"],
    acknowledgeOnly: true,
    ctaLabel: "Use The Compile",
  },
  {
    id: "adaptive_breach",
    title: "Use The Compiled Answer",
    body: "Center the compiled Shieldbreak Pulse, then double tap the Adaptive Node. The bonus firewall came from adaptation, and the cheaper card came from the node you just used.",
    concepts: ["Compiled Card", "Adaptive Response", "Breach"],
  },
  {
    id: "end_turn",
    title: "Maintenance Buys You Time",
    body: "End Turn to let the counter-response act. This is the broader loop: compile raises your ceiling, stabilise lowers disaster risk, and adaptation punishes one-note plans over the run.",
    concepts: ["Counter-Response", "Stability", "Long Run"],
  },
  {
    id: "wrap_up",
    title: "Instability Lab Complete",
    body: "You have now seen both sides of card maintenance and the way the encounter layer reacts back. Pressure systems are not just Heat and scrap; they also include the upkeep decisions between fights.",
    concepts: ["Compile", "Stabilise", "Adaptive Enemies", "Bricks"],
    acknowledgeOnly: true,
    completeOnAcknowledge: true,
    ctaLabel: "Complete Lab",
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
    id: RUN_MODES_BRIEFING_ID,
    title: "Run Modes Briefing",
    menuDescription: "Classes, difficulty, challenges, dailies, boss archive, and cosmetic unlocks from the menu side.",
    concepts: ["Classes", "Daily", "Boss Intel", "Unlocks"],
    accent: "#00c8ff",
    recommended: false,
    steps: RUN_MODES_BRIEFING_STEPS,
    rewardStepIndex: RUN_MODES_BRIEFING_STEPS.length - 1,
    rewardConfig: {
      cardChoices: [],
      relicChoices: [],
    },
    completionVictoryBody: "You walked the layered front-end flow from launch surface through classes, dailies, boss archive, and unlock-driven identity systems.",
    completionReviewBody: "You reached the end of the run-modes briefing. The menu flow, archive surfaces, and long-run progression hooks were all introduced.",
    buildState: createRunModesBriefingState,
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
  {
    id: PRESSURE_SYSTEMS_ID,
    title: "Pressure Systems",
    menuDescription: "Arena modifiers, Heat, salvage scrap, and how Reforge folds recovery back into the run.",
    concepts: ["Heat", "Arena", "Scrap", "Reforge"],
    accent: "#ff8c39",
    recommended: false,
    steps: PRESSURE_SYSTEMS_STEPS,
    rewardStepIndex: PRESSURE_SYSTEMS_EVENT_STEP_INDEX,
    rewardConfig: {
      cardChoices: [],
      relicChoices: [],
    },
    completionVictoryBody: "You pushed through a scripted pressure fight, watched Heat and the arena push back, and then used scrap to reforge a stressed card at the rest site.",
    completionReviewBody: "You reached the end of the pressure lesson. Heat, arena pressure, salvage, and Reforge were all surfaced even if the run got messy.",
    buildState: createPressureSystemsRunState,
  },
  {
    id: BOSS_PROTOCOLS_ID,
    title: "Boss Protocols",
    menuDescription: "Phase thresholds, boss directive text, adds, and why boss fights are more than damage races.",
    concepts: ["Bosses", "Phases", "Directives", "Archive"],
    accent: "#ff4b7a",
    recommended: false,
    steps: BOSS_PROTOCOLS_STEPS,
    rewardStepIndex: 5,
    rewardConfig: {
      cardChoices: ["C-011", "C-010", "NC-005"],
      relicChoices: ["PatchNotes"],
    },
    completionVictoryBody: "You crossed a scripted boss phase, read the directive response, and finished a fight built around thresholds instead of raw damage alone.",
    completionReviewBody: "You reached the end of the boss drill. Directive text, phase thresholds, and add pressure were all surfaced even if the finish got messy.",
    buildState: createBossProtocolsRunState,
  },
  {
    id: INSTABILITY_LAB_ID,
    title: "Instability Lab",
    menuDescription: "Compile, stabilise, adaptive counterplay, and how bricking risk fits into the pressure loop.",
    concepts: ["Compile", "Stabilise", "Adaptive", "Bricks"],
    accent: "#ffb347",
    recommended: false,
    steps: INSTABILITY_LAB_STEPS,
    rewardStepIndex: INSTABILITY_LAB_STEPS.length - 1,
    rewardConfig: {
      cardChoices: [],
      relicChoices: [],
    },
    completionVictoryBody: "You linked node upgrades, card maintenance, adaptive counterplay, and brick prevention into one connected system pass.",
    completionReviewBody: "You reached the end of the instability lab. Compile, stabilise, adaptive pressure, and brick prevention were all introduced.",
    buildState: createInstabilityLabRunState,
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

export function getTutorialMenuState(state) {
  const step = getTutorialStep(state);
  if (!step || step.mode !== "MainMenu") return null;
  return {
    menuView: step.menuView || "home",
    intelView: step.intelView || "progress",
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
    followupGuard: takeInstanceId(idPool, "C-002"),
    patch: takeInstanceId(idPool, "C-003"),
    scanA: takeInstanceId(idPool, "C-004"),
    scanB: takeInstanceId(idPool, "C-004"),
    chargePack: takeInstanceId(idPool, "C-006"),
    corrodeDart: takeInstanceId(idPool, "NC-005"),
    shieldbreak: takeInstanceId(idPool, "C-011"),
    scatterfire: takeInstanceId(idPool, "C-010"),
    ramCache: takeInstanceId(idPool, "NC-011"),
    broadcastSurge: takeInstanceId(idPool, "NC-074"),
    heatSink: takeInstanceId(idPool, "NC-062"),
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
      followupGuard: cardRefs.followupGuard,
      patch: cardRefs.patch,
      corrodeDart: cardRefs.corrodeDart,
      shieldbreak: cardRefs.shieldbreak,
      scatterfire: cardRefs.scatterfire,
      ramCache: cardRefs.ramCache,
      broadcastSurge: cardRefs.broadcastSurge,
      reforgeTarget: cardRefs.heatSink,
    },
  };

  state.combat = startCombatFromRunDeck({
    data,
    seed: seed ^ 0x2468ace0,
    act: config.act ?? 1,
    runDeck: state.deck,
    enemyIds: config.enemyIds || ["E_CORRODE_RAT"],
    playerMaxHP,
    playerMaxRAM: config.playerMaxRAM ?? 3,
    playerRamRegen: config.playerRamRegen ?? 2,
    openingHand: 5,
    forcedMutationTier: config.forcedMutationTier ?? "A",
    relicIds,
    encounterId: config.encounterId ?? null,
    encounterName: config.encounterName ?? null,
    encounterKind: config.encounterKind ?? "normal",
    runAdaptationProfile: config.runAdaptationProfile ?? null,
  });
  state.run.act = Math.max(1, Number(config.act || state.run.act || 1));

  state.combat.player.hp = playerHp;
  state.combat.player.maxHP = playerMaxHP;
  state.combat.player.maxRAM = config.playerMaxRAM ?? 3;
  state.combat.player.ramRegen = config.playerRamRegen ?? 2;
  state.combat.player.ram = config.playerRam ?? Math.min(state.combat.player.maxRAM, state.combat.player.ramRegen);

  push(state.log, { t: "Info", msg: `Tutorial run started: ${definition.title}` });
  return { state, cardRefs };
}

function createRunModesBriefingState() {
  const definition = getTutorialRuntime(RUN_MODES_BRIEFING_ID);
  const state = createInitialState();
  state.run = {
    tutorialShell: true,
    tutorial: {
      id: RUN_MODES_BRIEFING_ID,
      active: true,
      stepIndex: 0,
      status: "in_progress",
      outcome: null,
      rewardConfigured: false,
      cardIds: {},
    },
  };
  push(state.log, { t: "Info", msg: `Tutorial run started: ${definition.title}` });
  return state;
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

function createPressureSystemsRunState(data) {
  const { state, cardRefs } = createTutorialBaseState(data, PRESSURE_SYSTEMS_ID, PRESSURE_SYSTEMS_DECK_DEF_IDS, {
    seedSalt: 0x33330000,
    playerMaxHP: 34,
    playerHp: 28,
    playerMaxRAM: 4,
    playerRamRegen: 3,
    playerRam: 2,
  });

  state.run.scrap = 0;
  state.combat.player.piles.hand = [
    cardRefs.shieldbreak,
    cardRefs.ramCache,
    cardRefs.broadcastSurge,
    cardRefs.guard,
    cardRefs.strike,
  ].filter(Boolean);
  state.combat.player.piles.draw = [
    cardRefs.scanA,
    cardRefs.heatSink,
    cardRefs.chargePack,
    cardRefs.followupStrike,
    cardRefs.followupGuard,
  ].filter(Boolean);
  state.combat.player.piles.discard = [];
  state.combat.player.piles.exhaust = [];
  state.combat.player.piles.power = [];
  state.combat.heat = 0;
  state.combat.maxHeat = HEAT_MAX;
  state.combat.arenaModifier = getArenaModifierMeta("firewall_grid", { act: 2, encounterKind: "normal" });

  const enemy = state.combat.enemies?.[0];
  if (enemy) {
    enemy.name = "Trace Warden";
    enemy.hp = 20;
    enemy.maxHP = 20;
    enemy.statuses = [{ id: "Firewall", stacks: 6 }];
    enemy.intent = createTutorialEnemyIntent(data, "EC-A1");
    if (state.combat.enemyAI?.cursorByEnemyId) {
      state.combat.enemyAI.cursorByEnemyId[enemy.id] = 1;
    }
  }

  const reforgeTarget = cardRefs.heatSink && state.deck?.cardInstances?.[cardRefs.heatSink];
  if (reforgeTarget) {
    reforgeTarget.appliedMutations = ["A-01"];
    reforgeTarget.useCounter = 2;
    reforgeTarget.finalMutationCountdown = 3;
    reforgeTarget.compileLevel = 0;
  }

  push(state.log, {
    t: "Info",
    msg: `Tutorial arena locked: ${state.combat.arenaModifier?.label || "Arena Modifier"}`,
  });

  return state;
}

function createBossProtocolsRunState(data) {
  const { state, cardRefs } = createTutorialBaseState(data, BOSS_PROTOCOLS_ID, BOSS_PROTOCOLS_DECK_DEF_IDS, {
    seedSalt: 0x44440000,
    playerMaxHP: 42,
    playerHp: 34,
    playerMaxRAM: 4,
    playerRamRegen: 3,
    playerRam: 3,
    act: 3,
    encounterKind: "boss",
    encounterId: "ENC_TUTORIAL_PULSE_HYDRA",
    encounterName: "Training Boss: Pulse Hydra",
    enemyIds: ["E_ARCHON_PULSE_HYDRA"],
  });

  state.run.floor = 9;
  state.combat.player.piles.hand = [
    cardRefs.shieldbreak,
    cardRefs.strike,
    cardRefs.chargePack,
    cardRefs.guard,
    cardRefs.patch,
  ].filter(Boolean);
  state.combat.player.piles.draw = [
    cardRefs.followupStrike,
    cardRefs.scatterfire,
    cardRefs.scanA,
    cardRefs.corrodeDart,
    cardRefs.followupGuard,
  ].filter(Boolean);
  state.combat.player.piles.discard = [];
  state.combat.player.piles.exhaust = [];
  state.combat.player.piles.power = [];

  const enemy = state.combat.enemies?.[0];
  if (enemy) {
    enemy.name = "Training Hydra";
    enemy.hp = 19;
    enemy.maxHP = 24;
    enemy.statuses = [{ id: "Firewall", stacks: 4 }];
    enemy.intent = createTutorialEnemyIntent(data, "EC-A1");
    if (state.combat.enemyAI?.cursorByEnemyId) {
      state.combat.enemyAI.cursorByEnemyId[enemy.id] = 1;
    }
  }

  return state;
}

function createAggroTutorialProfile() {
  const profile = createRunAdaptationProfile();
  profile.cardsPlayed = 9;
  profile.totalDamage = 36;
  profile.scores.aggro = 24;
  profile.scores.control = 4;
  profile.scores.engine = 3;
  profile.lastDominantStrategy = "aggro";
  return profile;
}

function beginInstabilityLabRestStep(nextState, definition) {
  const tutorial = nextState?.run?.tutorial;
  if (!tutorial) return nextState;

  nextState.mode = "Event";
  nextState.combat = null;
  nextState.map = null;
  nextState.reward = null;
  nextState.shop = null;
  nextState.deckView = null;
  nextState.event = { eventId: "RestSite", step: 0 };
  nextState.run.scrap = Math.max(3, Number(nextState.run.scrap || 0));
  setTutorialStepIndex(tutorial, definition, 3);
  push(nextState.log, { t: "Info", msg: "Tutorial transition: compile station -> rest site stabilise" });
  return nextState;
}

function beginInstabilityLabCombatStep(nextState, data, definition) {
  const tutorial = nextState?.run?.tutorial;
  const cardIds = tutorial?.cardIds || {};
  if (!tutorial) return nextState;

  nextState.mode = "Combat";
  nextState.event = null;
  nextState.shop = null;
  nextState.reward = null;
  nextState.map = null;
  nextState.deckView = null;
  nextState.run.act = 2;
  nextState.run.floor = 6;
  nextState.run.maxHP = nextState.run.maxHP || 34;
  nextState.run.hp = Math.min(nextState.run.hp || 28, nextState.run.maxHP);

  nextState.combat = startCombatFromRunDeck({
    data,
    seed: ((nextState.run?.seed || BASE_TUTORIAL_SEED) ^ 0x5aa55aa5) >>> 0,
    act: 2,
    runDeck: nextState.deck,
    enemyIds: ["E_CIPHER_WARDEN_NODE"],
    playerMaxHP: nextState.run.maxHP,
    playerMaxRAM: 4,
    playerRamRegen: 3,
    openingHand: 5,
    forcedMutationTier: "A",
    encounterId: "ENC_TUTORIAL_ADAPTIVE_NODE",
    encounterName: "Adaptive Countertest",
    encounterKind: "normal",
    runAdaptationProfile: createAggroTutorialProfile(),
  });
  nextState.combat.player.hp = nextState.run.hp;
  nextState.combat.player.maxHP = nextState.run.maxHP;
  nextState.combat.player.maxRAM = 4;
  nextState.combat.player.ramRegen = 3;
  nextState.combat.player.ram = 3;
  nextState.combat.player.piles.hand = [
    cardIds.compileTarget,
    cardIds.chargePack,
    cardIds.strike,
    cardIds.guard,
    cardIds.patch,
  ].filter(Boolean);
  nextState.combat.player.piles.draw = [
    cardIds.stabiliseTarget,
    cardIds.ramCache,
    cardIds.scatterfire,
    cardIds.followupStrike,
    cardIds.scanA,
  ].filter(Boolean);
  nextState.combat.player.piles.discard = [];
  nextState.combat.player.piles.exhaust = [];
  nextState.combat.player.piles.power = [];

  const enemy = nextState.combat.enemies?.[0];
  if (enemy) {
    enemy.name = "Adaptive Node";
    enemy.hp = 24;
    enemy.maxHP = 24;
    enemy.intent = createTutorialEnemyIntent(data, "EC-A1");
    if (nextState.combat.enemyAI?.cursorByEnemyId) {
      nextState.combat.enemyAI.cursorByEnemyId[enemy.id] = 1;
    }
  }

  setTutorialStepIndex(tutorial, definition, 6);
  push(nextState.log, { t: "Info", msg: "Tutorial encounter seeded with Adaptive Firewall" });
  return nextState;
}

function createInstabilityLabRunState(data) {
  const { state, cardRefs } = createTutorialBaseState(data, INSTABILITY_LAB_ID, INSTABILITY_LAB_DECK_DEF_IDS, {
    seedSalt: 0x55550000,
    playerMaxHP: 34,
    playerHp: 28,
    playerMaxRAM: 4,
    playerRamRegen: 3,
    playerRam: 3,
  });

  state.mode = "Event";
  state.combat = null;
  state.map = null;
  state.reward = null;
  state.shop = null;
  state.deckView = null;
  state.event = { eventId: "CompileStation", step: 0 };
  state.run.scrap = 3;
  state.run.floor = 4;

  state.run.tutorial.cardIds = {
    ...state.run.tutorial.cardIds,
    compileTarget: cardRefs.shieldbreak,
    stabiliseTarget: cardRefs.heatSink,
  };

  const compileTarget = cardRefs.shieldbreak && state.deck?.cardInstances?.[cardRefs.shieldbreak];
  if (compileTarget) {
    compileTarget.compileLevel = 0;
  }

  const stabiliseTarget = cardRefs.heatSink && state.deck?.cardInstances?.[cardRefs.heatSink];
  if (stabiliseTarget) {
    stabiliseTarget.appliedMutations = ["A-01"];
    stabiliseTarget.useCounter = 2;
    stabiliseTarget.finalMutationCountdown = 2;
    stabiliseTarget.compileLevel = 0;
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
  const nextState = {
    ...state,
    run: {
      ...state.run,
      tutorial: {
        ...tutorial,
        stepIndex: Math.min((tutorial.stepIndex ?? 0) + 1, definition.steps.length - 1),
      },
    },
  };
  if (step.completeOnAcknowledge) {
    return finalizeTutorialState(nextState, step.completionOutcome || "victory");
  }
  return nextState;
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

function canUsePressureSystemsAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial) return { allowed: true };
  const cardIds = tutorial.cardIds || {};
  const isCombatAction = isCombatTutorialAction(action);

  if (state?.mode === "Combat") {
    switch (tutorial.stepIndex) {
      case 0:
        if (isCombatAction) {
          return buildTutorialBlock("Start the lesson note first so the pressure cues land in order.");
        }
        break;
      case 1:
        if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.shieldbreak)) {
          return buildTutorialBlock("Shieldbreak Pulse is first. Use it on the Trace Warden so the arena bonus is obvious before the burst turn starts.");
        }
        break;
      case 2:
        if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.ramCache)) {
          return buildTutorialBlock("RAM Cache is next. Use it on yourself so you can see how burst turns get funded before they spike Heat.");
        }
        break;
      case 3:
        if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.broadcastSurge)) {
          return buildTutorialBlock("Broadcast Surge is the Heat lesson. Spend the burst now so the trace meter visibly climbs.");
        }
        break;
      case 4:
        if (isCombatAction && action.type !== "Combat_EndTurn") {
          return buildTutorialBlock("End Turn here so you can watch the hotter board state push back.");
        }
        break;
      default:
        break;
    }
  }

  if (state?.mode === "Event") {
    switch (tutorial.stepIndex) {
      case PRESSURE_SYSTEMS_EVENT_STEP_INDEX:
        if (action.type !== "Rest_Forge") {
          return buildTutorialBlock("Choose Reforge first so the scrap loop is introduced before any other rest action.");
        }
        break;
      case PRESSURE_SYSTEMS_EVENT_STEP_INDEX + 1:
        if (!(action.type === "SelectDeckCard" && action.instanceId === cardIds.reforgeTarget)) {
          return buildTutorialBlock("Select Heat Sink for the tutorial reforge so you can see repair, compile, and stabilisation bundle together.");
        }
        break;
      default:
        break;
    }
  }

  if (state?.mode === "Reward" && tutorial.stepIndex < PRESSURE_SYSTEMS_EVENT_STEP_INDEX && isRewardTutorialAction(action)) {
    return buildTutorialBlock("Finish the pressure drill first. The lesson moves straight into a scripted rest-site reforge.");
  }

  return { allowed: true };
}

function canUseBossProtocolsAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial) return { allowed: true };
  const cardIds = tutorial.cardIds || {};
  const isCombatAction = isCombatTutorialAction(action);

  if (state?.mode === "Combat") {
    switch (tutorial.stepIndex) {
      case 0:
        if (isCombatAction) {
          return buildTutorialBlock("Start the boss note first so the phase drill lands in order.");
        }
        break;
      case 1:
        if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.shieldbreak)) {
          return buildTutorialBlock("Shieldbreak Pulse is first. Use it on the Training Hydra so the phase threshold fires immediately.");
        }
        break;
      case 3:
        if (isCombatAction && action.type !== "Combat_EndTurn") {
          return buildTutorialBlock("End Turn now so you can watch the boss and its add turn that phase shift into board pressure.");
        }
        break;
      default:
        break;
    }
  }

  if (state?.mode === "Reward" && tutorial.stepIndex < getTutorialRuntime(BOSS_PROTOCOLS_ID).rewardStepIndex && isRewardTutorialAction(action)) {
    return buildTutorialBlock("Finish the boss drill first. The archive lesson lands after the fight.");
  }

  return { allowed: true };
}

function canUseInstabilityLabAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial) return { allowed: true };
  const cardIds = tutorial.cardIds || {};
  const compileTarget = cardIds.compileTarget;
  const stabiliseTarget = cardIds.stabiliseTarget;
  const isCombatAction = isCombatTutorialAction(action);

  if (state?.mode === "Event") {
    switch (tutorial.stepIndex) {
      case 0:
        if (action?.type) {
          return buildTutorialBlock("Start the lab note first so the upgrade and maintenance steps stay in order.");
        }
        break;
      case 1:
        if (action.type !== "Compile_Open") {
          return buildTutorialBlock("Open the Compile station first. This lesson starts with deliberate upgrading.");
        }
        break;
      case 4:
        if (action.type !== "Rest_Stabilise") {
          return buildTutorialBlock("Choose Stabilise here. The lab is demonstrating maintenance, not healing or reforging.");
        }
        break;
      default:
        break;
    }
  }

  if (state?.deckView) {
    switch (tutorial.stepIndex) {
      case 2:
        if (!(action.type === "SelectDeckCard" && action.instanceId === compileTarget)) {
          return buildTutorialBlock("Pick Shieldbreak Pulse so the compiled version can be demonstrated in the next combat.");
        }
        break;
      case 5:
        if (!(action.type === "SelectDeckCard" && action.instanceId === stabiliseTarget)) {
          return buildTutorialBlock("Pick Heat Sink here. Its short clocks make Stabilise's safety value obvious.");
        }
        break;
      default:
        break;
    }
  }

  if (state?.mode === "Combat") {
    switch (tutorial.stepIndex) {
      case 7:
        if (isCombatAction && !(action.type === "Combat_PlayCard" && action.cardInstanceId === compileTarget)) {
          return buildTutorialBlock("Use the compiled Shieldbreak Pulse first so the adaptive firewall and compile payoff are visible together.");
        }
        break;
      case 8:
        if (isCombatAction && action.type !== "Combat_EndTurn") {
          return buildTutorialBlock("End Turn now so the adaptive counter-response gets one visible answer before the lab wraps.");
        }
        break;
      default:
        break;
    }
  }

  return { allowed: true };
}

export function canUseTutorialAction(state, action) {
  const tutorial = state?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return { allowed: true };

  if (tutorial.id === RUN_MODES_BRIEFING_ID) {
    return { allowed: true };
  }
  if (tutorial.id === INSTABILITY_LAB_ID) {
    return canUseInstabilityLabAction(state, action);
  }
  if (tutorial.id === BOSS_PROTOCOLS_ID) {
    return canUseBossProtocolsAction(state, action);
  }
  if (tutorial.id === PRESSURE_SYSTEMS_ID) {
    return canUsePressureSystemsAction(state, action);
  }
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

function beginPressureSystemsRestStep(nextState, definition) {
  const tutorial = nextState?.run?.tutorial;
  if (!tutorial) return nextState;

  nextState.mode = "Event";
  nextState.reward = null;
  nextState.shop = null;
  nextState.map = null;
  nextState.combat = null;
  nextState.deckView = null;
  nextState.event = { eventId: "RestSite", step: 0 };
  nextState.run.scrap = Math.max(3, Number(nextState.run.scrap || 0));
  setTutorialStepIndex(tutorial, definition, PRESSURE_SYSTEMS_EVENT_STEP_INDEX);
  push(nextState.log, { t: "Info", msg: "Tutorial salvage recovered: 3 scrap ready for Reforge" });
  return nextState;
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

function advancePressureSystemsTutorial(nextState, action, definition) {
  const tutorial = nextState.run.tutorial;
  const cardIds = tutorial.cardIds || {};

  if (nextState.mode === "Reward") {
    return beginPressureSystemsRestStep(nextState, definition);
  }

  if (action.type === "SelectDeckCard" && action.instanceId === cardIds.reforgeTarget) {
    return finalizeTutorialState(nextState, "victory");
  }

  switch (tutorial.stepIndex) {
    case 1:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.shieldbreak) advanceTutorialStep(tutorial, definition);
      break;
    case 2:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.ramCache) advanceTutorialStep(tutorial, definition);
      break;
    case 3:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.broadcastSurge) advanceTutorialStep(tutorial, definition);
      break;
    case 4:
      if (action.type === "Combat_EndTurn") advanceTutorialStep(tutorial, definition);
      break;
    case PRESSURE_SYSTEMS_EVENT_STEP_INDEX:
      if (action.type === "Rest_Forge") advanceTutorialStep(tutorial, definition);
      break;
    default:
      break;
  }

  return nextState;
}

function advanceBossProtocolsTutorial(nextState, action, definition) {
  const tutorial = nextState.run.tutorial;
  const cardIds = tutorial.cardIds || {};

  if (handleRewardStepTransition(nextState, definition)) return nextState;

  if (action.type === "Reward_PickCard" || action.type === "Reward_Skip") {
    return finalizeTutorialState(nextState, "victory");
  }

  switch (tutorial.stepIndex) {
    case 1:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.shieldbreak) {
        advanceTutorialStep(tutorial, definition);
      }
      break;
    case 3:
      if (action.type === "Combat_EndTurn") {
        advanceTutorialStep(tutorial, definition);
      }
      break;
    default:
      break;
  }

  return nextState;
}

function advanceInstabilityLabTutorial(nextState, action, definition, data = null) {
  const tutorial = nextState.run.tutorial;
  const cardIds = tutorial.cardIds || {};

  switch (tutorial.stepIndex) {
    case 1:
      if (action.type === "Compile_Open") {
        advanceTutorialStep(tutorial, definition);
      }
      break;
    case 2:
      if (action.type === "SelectDeckCard" && action.instanceId === cardIds.compileTarget) {
        return beginInstabilityLabRestStep(nextState, definition);
      }
      break;
    case 4:
      if (action.type === "Rest_Stabilise") {
        advanceTutorialStep(tutorial, definition);
      }
      break;
    case 5:
      if (action.type === "SelectDeckCard" && action.instanceId === cardIds.stabiliseTarget) {
        if (!data) return nextState;
        return beginInstabilityLabCombatStep(nextState, data, definition);
      }
      break;
    case 7:
      if (action.type === "Combat_PlayCard" && action.cardInstanceId === cardIds.compileTarget) {
        advanceTutorialStep(tutorial, definition);
      }
      break;
    case 8:
      if (action.type === "Combat_EndTurn") {
        advanceTutorialStep(tutorial, definition);
      }
      break;
    default:
      break;
  }

  return nextState;
}

export function advanceTutorialState(nextState, action, data = null) {
  const tutorial = nextState?.run?.tutorial;
  if (!tutorial?.active || tutorial.status === "complete") return nextState;

  if (nextState.mode === "GameOver") {
    return finalizeTutorialState(nextState, "defeat");
  }

  const definition = getTutorialRuntime(tutorial.id);
  if (definition.id === RUN_MODES_BRIEFING_ID) {
    return nextState;
  }
  if (definition.id === INSTABILITY_LAB_ID) {
    return advanceInstabilityLabTutorial(nextState, action, definition, data);
  }
  if (definition.id === BOSS_PROTOCOLS_ID) {
    return advanceBossProtocolsTutorial(nextState, action, definition);
  }
  if (definition.id === PRESSURE_SYSTEMS_ID) {
    return advancePressureSystemsTutorial(nextState, action, definition);
  }
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
