import { RNG } from "./rng";
import { push } from "./log";
import { createInitialState as _init } from "./game_state";
import { createRunDeckFromDefs, addCardToRunDeck } from "./run_deck";
import { pickEncounter } from "./encounters";
import { startCombatFromRunDeck, dispatchCombat, forceNewMutation } from "./engine";
import { makeRelicChoices } from "./relic_rewards";
import { getRunMods } from "./rules_mods";
import { createBasicEventRegistry, pickRandomEventId, applyEventChoiceImmediate } from "./events";
import { decodeDebugSeed, decodeSensibleDebugSeed } from "./debugSeed";

const EVENT_REG = createBasicEventRegistry();

function clone(x) { return structuredClone(x); }
function uid(rng, prefix) { return `${prefix}_${rng.nextUint().toString(16)}`; }

function generateMap(seed) {
  const rng = new RNG(seed ^ 0xA5A5A5A5);
  const nodes = {};
  const makeNode = (type, x, y) => {
    const id = uid(rng, "n");
    nodes[id] = { id, type, x, y, next: [], cleared: false };
    return id;
  };

  const start = makeNode("Combat", 0, 0);
  const a1 = makeNode("Combat", -1, 1);
  const a2 = makeNode("Event", 1, 1);
  const b1 = makeNode("Shop", -1, 2);
  const b2 = makeNode("Combat", 1, 2);
  const c1 = makeNode("Elite", 0, 3);
  const c2 = makeNode("Rest", 2, 3);
  const d1 = makeNode("Combat", 0, 4);
  const boss = makeNode("Boss", 0, 5);

  nodes[start].next = [a1, a2];
  nodes[a1].next = [b1, b2];
  nodes[a2].next = [b2];
  nodes[b1].next = [c1];
  nodes[b2].next = [c1, c2];
  nodes[c1].next = [d1];
  nodes[c2].next = [d1];
  nodes[d1].next = [boss];
  nodes[boss].next = [];

  return { nodes, currentNodeId: start, selectableNext: [...nodes[start].next] };
}

function makeCardRewards(data, seed) {
  const rng = new RNG(seed ^ 0x55CCAA11);
  const all = Object.keys(data.cards);

  // pick distinct
  const pool = [...all];
  const choices = [];
  while (choices.length < 3 && pool.length > 0) {
    const idx = rng.int(pool.length);
    choices.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return { cardChoices: choices, canSkip: true };
}

function makeShop(data, seed) {
  const rng = new RNG(seed ^ 0x0F0F0F0F);
  const ids = Object.keys(data.cards);
  return {
    offers: [
      { kind: "Card", defId: rng.pick(ids), price: 50 },
      { kind: "Card", defId: rng.pick(ids), price: 50 },
      { kind: "Service", serviceId: "RemoveCard", price: 75, requiresCard: true },
      { kind: "Service", serviceId: "Repair", price: 60, requiresCard: true },
      { kind: "Service", serviceId: "Stabilise", price: 60, requiresCard: true },
      { kind: "Service", serviceId: "Accelerate", price: 40, requiresCard: true },
      { kind: "Service", serviceId: "Heal", price: 60, requiresCard: false }
    ]
  };
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Called after reward completes: if the current map has no more selectable nodes,
// advance to the next act and generate a fresh map.
function maybeAdvanceAct(state, data, log) {
  if (!state.map || !state.run) return;
  if (state.map.selectableNext && state.map.selectableNext.length > 0) return;

  const prevAct = state.run.act;
  state.run.act += 1;
  // Generate a new map seeded differently per act so layouts vary
  state.map = generateMap((state.run.seed ^ (state.run.act * 0x9E3779B9)) >>> 0);
  log({ t: "Info", msg: `Act ${prevAct} complete — entering Act ${state.run.act}` });
}

function service_RemoveCard(state) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  delete state.deck.cardInstances[sel];
  state.deck.master = state.deck.master.filter(x => x !== sel);
  return true;
}
function service_RepairCard(state, data) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const ci = state.deck.cardInstances[sel];
  if (!ci || ci.finalMutationId) return false;
  const def = data.cards[ci.defId];
  const maxUse = def.defaultUseCounter ?? 12;
  ci.useCounter = clamp(ci.useCounter + Math.ceil(maxUse * 0.35), 0, maxUse);
  return true;
}
function service_StabiliseCard(state, data) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const ci = state.deck.cardInstances[sel];
  if (!ci || ci.finalMutationId) return false;
  const def = data.cards[ci.defId];
  const base = def.defaultFinalMutationCountdown ?? 8;
  ci.finalMutationCountdown = clamp(ci.finalMutationCountdown + 2, 0, base + 6);
  return true;
}
function service_AccelerateCard(state) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const ci = state.deck.cardInstances[sel];
  if (!ci || ci.finalMutationId) return false;
  ci.finalMutationCountdown = clamp(ci.finalMutationCountdown - 2, 0, 999);
  return true;
}
function service_HealPlayer(state) {
  if (!state.run) return false;
  const heal = Math.ceil(state.run.maxHP * 0.25);
  state.run.hp = clamp(state.run.hp + heal, 0, state.run.maxHP);
  return true;
}

// IMPORTANT: auto-resolve node should NOT be recorded as a separate journal action.
// So we implement node resolution as an internal helper, not by dispatching ResolveNode.
function resolveCurrentNodeInternal(state, data, log) {
  if (state.mode !== "Map" || !state.map || !state.run || !state.deck) return state;
  const node = state.map.nodes[state.map.currentNodeId];
  if (!node) return state;
  if (node.cleared) return state;

  node.cleared = true;
  state.run.floor += 1;
  log({ t: "Info", msg: `Resolving node (${node.type})` });

  if (node.type === "Combat" || node.type === "Elite" || node.type === "Boss") {
    const dbg = state.run.debugOverrides;
    const naturalKind = node.type === "Elite" ? "elite" : node.type === "Boss" ? "boss" : "normal";
    const effectiveKind = dbg?.encounterKind ?? naturalKind;
    const effectiveAct  = dbg?.actOverride   ?? state.run.act;

    const mods = getRunMods(data, state.run.relicIds);

    // When a debug seed is active, pull enemies from the FULL enemy roster so
    // all 148+ enemies can appear, not just those in the encounter tables.
    let enemyIds, encounterName;
    if (dbg?.enemyPoolSeed != null) {
      const allEnemyIds = Object.keys(data.enemies);
      const poolRng = new RNG((dbg.enemyPoolSeed ^ state.run.floor) >>> 0);
      const count = dbg.enemyCount ?? 1;
      enemyIds = [];
      for (let i = 0; i < count; i++) {
        enemyIds.push(allEnemyIds[poolRng.int(allEnemyIds.length)]);
      }
      encounterName = `Debug pool (${enemyIds.length} enemies)`;
    } else {
      const enc = pickEncounter(data, state.run.seed ^ state.run.floor, effectiveAct, effectiveKind);
      enemyIds = enc.enemyIds;
      encounterName = enc.name;
    }

    state.mode = "Combat";
    state.combat = startCombatFromRunDeck({
      data,
      seed: state.run.seed ^ state.run.floor,
      act: effectiveAct,
      runDeck: state.deck,
      enemyIds,
      playerMaxHP: state.run.maxHP,
      playerMaxRAM: (dbg?.playerMaxRAM ?? 8) + (mods.maxRAMDelta ?? 0),
      playerRamRegen: (dbg?.playerRamRegen ?? 2) + (mods.ramRegenDelta ?? 0),
      openingHand: 5,
      ruleMods: mods,
      forcedMutationTier: state.run.forcedMutationTier ?? null,
      debugOverrides: dbg,
    });
    state.combat.player.hp = state.run.hp;
    const debugTag = dbg ? ` [dbg: act${effectiveAct}/${effectiveKind}]` : '';
    log({ t: "Info", msg: `Encounter: ${encounterName}${debugTag}` });
    return state;
  }

  if (node.type === "Shop") {
    state.mode = "Shop";
    state.shop = makeShop(data, state.run.seed ^ state.run.floor);
    log({ t: "Info", msg: "Entered shop" });
    return state;
  }

  if (node.type === "Rest") {
    state.mode = "Event";
    state.event = { eventId: "RestSite", step: 0 };
    log({ t: "Info", msg: "Entered rest site" });
    return state;
  }

  if (node.type === "Event") {
    state.mode = "Event";
    const eid = pickRandomEventId(EVENT_REG, state.run.seed ^ state.run.floor);
    state.event = { eventId: eid, step: 0 };
    log({ t: "Info", msg: `Entered event: ${eid}` });
    return state;
  }

  return state;
}

export function createInitialState() { return _init(); }

export function dispatchGame(stateIn, data, action) {
  const state = clone(stateIn);
  const log = (e) => push(state.log, e);

  switch (action.type) {
    case "NewRun": {
      const debugSeed = action.debugSeed ?? null;
      // Decode seed-based overrides first
      const seedOverrides = debugSeed !== null
        ? (action.debugSeedMode === 'sensible'
            ? decodeSensibleDebugSeed(debugSeed)
            : decodeDebugSeed(debugSeed))
        : null;
      // Merge priority: unlockedCustom < seed < lockedCustom
      // Locked custom values always beat the seed; unlocked yield to the seed
      // but still apply when the seed doesn't touch that field.
      const lockedKeySet  = new Set(action.lockedKeys ?? []);
      const customOvr     = action.customOverrides ?? {};
      const lockedOvr     = {};
      const unlockedOvr   = {};
      for (const [k, v] of Object.entries(customOvr)) {
        if (lockedKeySet.has(k)) lockedOvr[k] = v;
        else unlockedOvr[k] = v;
      }
      const hasAny = seedOverrides ||
                     Object.keys(unlockedOvr).length > 0 ||
                     Object.keys(lockedOvr).length  > 0;
      const dbg = hasAny
        ? { ...unlockedOvr, ...(seedOverrides ?? {}), ...lockedOvr }
        : null;

      const startMaxHP = dbg?.playerMaxHP ?? 75;
      const startGold  = dbg?.startingGold ?? 99;

      state.mode = "Map";
      state.run = {
        seed: action.seed,
        debugSeed,
        debugOverrides: dbg,
        act: 1,
        floor: 1,
        mp: 6,
        maxMP: 6,
        gold: startGold,
        hp: startMaxHP,
        maxHP: startMaxHP,
        travelHpCost: 2,
        relicIds: []
      };

      // Starter deck: explicit card list > count-based > default 20 cards
      let starter;
      if (dbg?.startingCardIds?.length) {
        starter = dbg.startingCardIds; // exact list; duplicates allowed for multiple copies
      } else {
        const cardCount = dbg?.startingCardCount ?? 20;
        starter = Object.keys(data.cards).slice(0, cardCount);
      }
      state.deck = createRunDeckFromDefs(data, action.seed, starter.length ? starter : ["C-001","C-002"]);
      state.map = generateMap(action.seed);
      state.combat = null;
      state.reward = null;
      state.shop = null;
      state.event = null;
      state.deckView = null;
      state.journal = { seed: action.seed, debugSeed, actions: [] };

      log({ t: "Info", msg: `New run (seed=${action.seed}, debugSeed=${debugSeed ?? 'none'})` });
      return state;
    }

    case "GoToMap": {
      state.mode = "Map";
      state.combat = null;
      state.reward = null;
      state.shop = null;
      state.event = null;
      state.deckView = null;
      log({ t: "Info", msg: "Returned to map" });
      return state;
    }

    case "SelectNextNode": {
      if (state.mode !== "Map" || !state.map || !state.run) return state;

      const toId = action.nodeId;
      const fromId = state.map.currentNodeId;

      // HARD GUARDS (fix illegal re-entry + keeps journal sane)
      if (!state.map.selectableNext.includes(toId)) {
        log({ t: "Info", msg: `Node not selectable: ${toId}` });
        return state;
      }
      if (toId === fromId) {
        log({ t: "Info", msg: `Node is already current: ${toId}` });
        return state;
      }
      const toNode = state.map.nodes[toId];
      if (!toNode) {
        log({ t: "Info", msg: `Node missing: ${toId}` });
        return state;
      }
      if (toNode.cleared) {
        log({ t: "Info", msg: `Node already cleared: ${toId}` });
        return state;
      }

      // MP cost; if 0 MP, HP cost
      if (state.run.mp > 0) state.run.mp = Math.max(0, state.run.mp - 1);
      else {
        const before = state.run.hp;
        state.run.hp = Math.max(0, state.run.hp - state.run.travelHpCost);
        log({ t: "Info", msg: `Travel at 0 MP: -${before - state.run.hp} HP` });
        if (state.run.hp <= 0) {
          state.mode = "GameOver";
          log({ t: "Info", msg: "Run ended: died to travel damage" });
          return state;
        }
      }

      state.map.currentNodeId = toId;
      state.map.selectableNext = [...toNode.next];
      log({ t: "Info", msg: `Moved to ${toId} (MP=${state.run.mp})` });

      // FINAL GAME BEHAVIOUR: auto-resolve immediately (WITHOUT journaling a separate ResolveNode action)
      return resolveCurrentNodeInternal(state, data, log);
    }

    // Debug-only: kept for harness, does not break final flow.
    case "ResolveNode": {
      return resolveCurrentNodeInternal(state, data, log);
    }

    // ---------- Combat bridge ----------
    case "Combat_StartTurn":
    case "Combat_PlayCard":
    case "Combat_EndTurn":
    case "Combat_Simulate": {
      if (state.mode !== "Combat" || !state.combat || !state.run || !state.deck) return state;

      const combatAction =
        action.type === "Combat_StartTurn" ? { type: "StartTurn" } :
        action.type === "Combat_EndTurn" ? { type: "EndTurn" } :
        action.type === "Combat_PlayCard" ? { type: "PlayCard", cardInstanceId: action.cardInstanceId, targetEnemyId: action.targetEnemyId } :
        { type: "SimulateEncounter", maxTurns: action.maxTurns };

      state.combat = dispatchCombat(state.combat, data, combatAction);

      // drain combat logs into global log
      for (const e of state.combat.log) push(state.log, e);
      state.combat.log = [];

      // sync run HP
      state.run.hp = Math.max(0, state.combat.player.hp);

      if (state.combat.combatOver) {
        if (!state.combat.victory) {
          state.mode = "GameOver";
          log({ t: "Info", msg: "Run ended: defeated" });
          return state;
        }

        // Remove any bricked cards flagged RemoveFromRun
        const toRemove = Object.values(state.deck.cardInstances)
          .filter(ci => ci.removeFromRunOnCombatEnd)
          .map(ci => ci.instanceId);
        for (const id of toRemove) {
          delete state.deck.cardInstances[id];
          state.deck.master = state.deck.master.filter(x => x !== id);
          log({ t: "Info", msg: `Removed bricked card from run: ${id}` });
        }

        // Gold reward by node type + act table
        const bal = (data.actBalance || []).find(b => b.act === state.run.act) || data.actBalance?.[0];
        const nodeType = state.map?.nodes[state.map.currentNodeId]?.type;
        const gold =
          nodeType === "Boss" ? (bal?.goldBoss ?? 99) :
          nodeType === "Elite" ? (bal?.goldElite ?? 50) :
          (bal?.goldNormal ?? 25);
        state.run.gold += gold;

        state.mode = "Reward";
        state.reward = makeCardRewards(data, state.run.seed ^ (state.run.floor * 777));

        // relic rewards
        if (nodeType === "Elite" || nodeType === "Boss") {
          const kind = nodeType === "Boss" ? "boss" : "elite";
          state.reward.relicChoices = makeRelicChoices(data, state.run.seed ^ state.run.floor, kind);
        }

        // Drain gold earned via mutation patches during combat (GainGold / DecompileRandom ops)
        if (state.combat._pendingGoldGain) {
          state.run.gold += state.combat._pendingGoldGain;
          log({ t: "Info", msg: `Mutation gold: +${state.combat._pendingGoldGain}` });
        }

        state.combat = null;
        log({ t: "Info", msg: "Combat victory -> rewards" });
      }
      return state;
    }

    // ---------- Reward ----------
    case "Reward_PickCard": {
      if (state.mode !== "Reward" || !state.reward || !state.deck || !state.run) return state;
      if (!state.reward.cardChoices.includes(action.defId)) return state;

      const rng = new RNG((state.run.seed ^ state.run.floor ^ 0xBEEF1234) >>> 0);
      addCardToRunDeck(data, state.deck, rng, action.defId);

      log({ t: "Info", msg: `Reward picked: ${action.defId}` });
      state.mode = "Map";
      state.reward = null;
      maybeAdvanceAct(state, data, log);
      return state;
    }

    case "Reward_Skip": {
      if (state.mode !== "Reward" || !state.reward) return state;
      log({ t: "Info", msg: "Reward skipped" });
      state.mode = "Map";
      state.reward = null;
      maybeAdvanceAct(state, data, log);
      return state;
    }

    case "Reward_PickRelic": {
      if (state.mode !== "Reward" || !state.reward || !state.run) return state;
      const choices = state.reward.relicChoices || [];
      if (!choices.includes(action.relicId)) return state;

      state.run.relicIds.push(action.relicId);
      log({ t: "Info", msg: `Picked relic: ${action.relicId}` });
      delete state.reward.relicChoices;
      return state;
    }

    // ---------- Shop ----------
    case "Shop_BuyOffer": {
      if (state.mode !== "Shop" || !state.shop || !state.run || !state.deck) return state;
      const offer = state.shop.offers[action.index];
      if (!offer) return state;
      if (state.run.gold < offer.price) { log({ t: "Info", msg: "Not enough gold" }); return state; }

      state.run.gold -= offer.price;

      if (offer.kind === "Card") {
        const rng = new RNG((state.run.seed ^ state.run.floor ^ 0xC0FFEE) >>> 0);
        addCardToRunDeck(data, state.deck, rng, offer.defId);
        log({ t: "Info", msg: `Bought card: ${offer.defId}` });
        return state;
      }

      // service
      if (offer.serviceId === "Heal") {
        if (!service_HealPlayer(state)) return state;
        log({ t: "Info", msg: "Bought service: Heal" });
        return state;
      }

      // card-targeting services
      state.deckView = { selectedInstanceId: null, returnMode: "Shop" };
      state.shop.pendingService = offer.serviceId;
      state.shop.pendingPrice = offer.price;
      log({ t: "Info", msg: `Select a card for service: ${offer.serviceId}` });
      return state;
    }

    case "Shop_Exit": {
      if (state.mode !== "Shop") return state;
      state.mode = "Map";
      state.shop = null;
      state.deckView = null;
      log({ t: "Info", msg: "Exited shop" });
      return state;
    }

    // ---------- Event ----------
    case "Event_Choose": {
      if (state.mode !== "Event" || !state.event || !state.run) return state;

      // Rest Site is handled by dedicated actions
      if (state.event.eventId === "RestSite") return state;

      const res = applyEventChoiceImmediate(state, data, EVENT_REG, action.choiceId);
      log({ t: "Info", msg: `Event choice: ${action.choiceId}` });

      if (state.run.hp <= 0) {
        state.mode = "GameOver";
        log({ t: "Info", msg: "Run ended: died in event" });
        return state;
      }

      if (res.needsDeckTarget) {
        state.deckView = { selectedInstanceId: null, returnMode: "Event" };
        state.event.pendingSelectOp = res.needsDeckTarget.op;
        log({ t: "Info", msg: `Select a card for event op: ${res.needsDeckTarget.op}` });
        return state;
      }

      state.mode = "Map";
      state.event = null;
      return state;
    }

    // ---------- Deck overlay ----------
    case "OpenDeck": {
      if (!state.deck) return state;
      state.deckView = { selectedInstanceId: null, returnMode: state.mode };
      log({ t: "Info", msg: "Opened deck" });
      return state;
    }
    case "CloseDeck": {
      state.deckView = null;
      log({ t: "Info", msg: "Closed deck" });
      return state;
    }
    case "SelectDeckCard": {
      if (!state.deckView || !state.deck) return state;
      if (!state.deck.cardInstances[action.instanceId]) return state;
      state.deckView.selectedInstanceId = action.instanceId;
      log({ t: "Info", msg: `Selected deck card: ${action.instanceId}` });

      // shop pending service apply
      if (state.mode === "Shop" && state.shop?.pendingService) {
        const serviceId = state.shop.pendingService;
        let ok = false;
        if (serviceId === "RemoveCard") ok = service_RemoveCard(state);
        if (serviceId === "Repair") ok = service_RepairCard(state, data);
        if (serviceId === "Stabilise") ok = service_StabiliseCard(state, data);
        if (serviceId === "Accelerate") ok = service_AccelerateCard(state);
        if (!ok) { log({ t: "Info", msg: `Service failed: ${serviceId}` }); return state; }
        log({ t: "Info", msg: `Applied service: ${serviceId}` });
        delete state.shop.pendingService;
        delete state.shop.pendingPrice;
        state.deckView = null;
      }

      // event pending op apply
      if (state.mode === "Event" && state.event?.pendingSelectOp) {
        const op = state.event.pendingSelectOp;
        let ok = false;
        if (op === "RemoveSelectedCard") ok = service_RemoveCard(state);
        if (op === "RepairSelectedCard") ok = service_RepairCard(state, data);
        if (op === "StabiliseSelectedCard") ok = service_StabiliseCard(state, data);
        if (op === "AccelerateSelectedCard") ok = service_AccelerateCard(state);
        if (!ok) { log({ t: "Info", msg: `Event card op failed: ${op}` }); return state; }
        log({ t: "Info", msg: `Event: applied card op ${op}` });
        state.event.pendingSelectOp = undefined;
        state.deckView = null;
        state.mode = "Map";
        state.event = null;
      }

      return state;
    }

    // ---------- Rest site ----------
    case "Rest_Heal": {
      if (state.mode !== "Event" || state.event?.eventId !== "RestSite" || !state.run) return state;
      const heal = Math.ceil(state.run.maxHP * 0.30);
      const before = state.run.hp;
      state.run.hp = Math.min(state.run.maxHP, state.run.hp + heal);
      log({ t: "Info", msg: `Rest: healed ${state.run.hp - before}` });
      state.mode = "Map";
      state.event = null;
      return state;
    }
    case "Rest_Stabilise": {
      if (state.mode !== "Event" || state.event?.eventId !== "RestSite") return state;
      state.deckView = { selectedInstanceId: null, returnMode: "Event" };
      state.event.pendingSelectOp = "StabiliseSelectedCard";
      log({ t: "Info", msg: "Rest: choose a card to Stabilise" });
      return state;
    }
    case "Rest_Repair": {
      if (state.mode !== "Event" || state.event?.eventId !== "RestSite") return state;
      state.deckView = { selectedInstanceId: null, returnMode: "Event" };
      state.event.pendingSelectOp = "RepairSelectedCard";
      log({ t: "Info", msg: "Rest: choose a card to Repair" });
      return state;
    }
    case "Rest_Leave": {
      if (state.mode !== "Event" || state.event?.eventId !== "RestSite") return state;
      log({ t: "Info", msg: "Left rest site" });
      state.mode = "Map";
      state.event = null;
      return state;
    }

    // ---------- Dev ----------
    case "Dev_AppendGold": {
      if (!state.run) return state;
      state.run.gold += action.amount;
      log({ t: "Info", msg: `Dev: gold += ${action.amount}` });
      return state;
    }
    case "Dev_ForceWinCombat": {
      if (state.mode !== "Combat" || !state.combat) return state;
      state.combat.combatOver = true;
      state.combat.victory = true;
      log({ t: "Info", msg: "Dev: forced combat win" });
      return state;
    }
    case "Dev_ForceMutationNew": {
      if (state.mode !== "Combat" || !state.combat || !state.run) return state;
      forceNewMutation(state.combat, data, state.run.seed ^ state.run.floor, action.cardInstanceId, action.tier);
      for (const e of state.combat.log) push(state.log, e);
      state.combat.log = [];
      return state;
    }

    default:
      return state;
  }
}
