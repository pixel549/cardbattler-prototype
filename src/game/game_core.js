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

  // Re-roll helper: pick from pool, avoiding `blocked` type for variety
  function vary(pool, blocked) {
    const raw = rng.pick(pool);
    if (raw === blocked) {
      const alt = pool.filter(t => t !== blocked);
      return alt.length ? rng.pick(alt) : raw;
    }
    return raw;
  }

  // ── Per-row type selection ───────────────────────────────────────────────
  // 10-row layout: rows 1-3 (opening), row 4 (converge), row 5 (Elite),
  // row 6 (recovery), rows 7-8 (second half), row 9 (pre-Boss), row 10 (Boss)
  //
  // No Rest in rows 1-2 (too early).
  // Guaranteed Rest/Shop in row 6 (post-Elite recovery).
  // Guaranteed Rest on left in row 9 (last chance before Boss).

  // Shuffle helper — Fisher-Yates in-place using seeded rng
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Row 1 — opening (no Rest): always 3 DISTINCT types, random order
  const [r1L, r1M, r1R] = shuffle(['Combat', 'Event', 'Shop']);

  // Row 2 — early mid (no Rest; re-roll vs same-column row-1; dedup mid if all same)
  let r2L = vary(['Combat', 'Shop', 'Event', 'Combat'], r1L);
  let r2M = vary(['Combat', 'Event', 'Shop',  'Combat'], r1M);
  let r2R = vary(['Combat', 'Event', 'Shop',  'Combat'], r1R);
  if (r2L === r2M && r2M === r2R) r2M = vary(['Combat', 'Event', 'Shop'], r2M);

  // Row 3 — mid-act (Rest now available)
  const r3L = vary(['Combat', 'Event', 'Rest', 'Shop'], r2L);
  const r3M = vary(['Event',  'Rest',  'Combat', 'Shop'], r2M);
  const r3R = vary(['Rest',   'Combat', 'Event', 'Shop'], r2R);

  // Row 4 — pre-Elite converge: 2 nodes, no Rest, must differ from each other
  const r4L    = rng.pick(['Shop', 'Event', 'Combat']);
  const r4Rraw = rng.pick(['Event', 'Combat', 'Shop']);
  const r4R    = r4Rraw === r4L ? vary(['Event', 'Combat', 'Shop'], r4L) : r4Rraw;

  // Row 5 — both ELITE (hard-coded)

  // Row 6 — post-Elite recovery: GUARANTEED Rest on left, Rest or Shop on right
  const r6L = 'Rest';
  const r6R = rng.pick(['Rest', 'Shop']);

  // Row 7 — second half opening (no Rest): 3 DISTINCT types, random order
  const [r7L, r7M, r7R] = shuffle(['Combat', 'Event', 'Shop']);

  // Row 8 — combat-heavy stretch (bias toward Combat; dedup if all same)
  let r8L = vary(['Combat', 'Combat', 'Event', 'Shop'], r7L);
  let r8M = vary(['Combat', 'Event',  'Combat', 'Shop'], r7M);
  let r8R = vary(['Combat', 'Event',  'Shop', 'Combat'], r7R);
  if (r8L === r8M && r8M === r8R) r8M = vary(['Combat', 'Event', 'Shop'], r8M);

  // Row 9 — pre-Boss: guaranteed Rest on LEFT path, random on right
  const r9L = 'Rest';
  const r9R = rng.pick(['Shop', 'Event', 'Combat']);

  // ── Build node graph ────────────────────────────────────────────────────
  //
  //                    Start (0,0)
  //                  /     |     \
  //           L(-1,1)   M(0,1)   R(1,1)        Row 1 — opening
  //            /\ /       |       \/ \
  //       L(-1,2) M(0,2)         M(0,2) R(1,2) Row 2 — early mid
  //            /\ /       |       \/ \
  //       L(-1,3) M(0,3)         M(0,3) R(1,3) Row 3 — mid-act (Rest ok)
  //             \   /               \   /
  //          CL(-0.5,4)          CR(0.5,4)      Row 4 — converge
  //               |                   |
  //          EL(-0.5,5)          ER(0.5,5)      Row 5 — both ELITE
  //               |                   |
  //          PL(-0.5,6)          PR(0.5,6)      Row 6 — post-Elite RECOVERY
  //            /    \               /    \
  //       L(-1,7)  M(0,7)       M(0,7)  R(1,7) Row 7 — second half
  //            /\ /       |       \/ \
  //       L(-1,8) M(0,8)         M(0,8) R(1,8) Row 8 — combat stretch
  //             \   /               \   /
  //          BL(-0.5,9)          BR(0.5,9)      Row 9 — pre-Boss
  //                   \           /
  //                    Boss (0,10)
  //
  // PATH-LOCK (rows 1→2→3): L→L,M | M→L,M,R | R→M,R
  // CONVERGE (row 3→4):     L→CL | M→CL,CR | R→CR
  // ELITE (row 4→5):        CL→EL | CR→ER
  // RECOVERY (row 5→6):     EL→PL | ER→PR
  // REOPEN (row 6→7):       PL→L7,M7 | PR→M7,R7
  // PATH-LOCK (rows 7→8):   L→L,M | M→L,M,R | R→M,R
  // CONVERGE (row 8→9):     L→BL | M→BL,BR | R→BR

  const start = makeNode("Start", 0, 0);
  nodes[start].cleared = true;

  // Row 1
  const a1 = makeNode(r1L, -1, 1);
  const a2 = makeNode(r1M,  0, 1);
  const a3 = makeNode(r1R,  1, 1);

  // Row 2
  const b1 = makeNode(r2L, -1, 2);
  const b2 = makeNode(r2M,  0, 2);
  const b3 = makeNode(r2R,  1, 2);

  // Row 3
  const c1 = makeNode(r3L, -1, 3);
  const c2 = makeNode(r3M,  0, 3);
  const c3 = makeNode(r3R,  1, 3);

  // Row 4 — converge to 2 (pre-Elite)
  const d1 = makeNode(r4L, -0.5, 4);
  const d2 = makeNode(r4R,  0.5, 4);

  // Row 5 — both Elite
  const e1 = makeNode("Elite", -0.5, 5);
  const e2 = makeNode("Elite",  0.5, 5);

  // Row 6 — Recovery (guaranteed Rest/Shop)
  const f1 = makeNode(r6L, -0.5, 6);
  const f2 = makeNode(r6R,  0.5, 6);

  // Row 7 — second half reopens to 3 cols
  const g1 = makeNode(r7L, -1, 7);
  const g2 = makeNode(r7M,  0, 7);
  const g3 = makeNode(r7R,  1, 7);

  // Row 8 — combat stretch
  const h1 = makeNode(r8L, -1, 8);
  const h2 = makeNode(r8M,  0, 8);
  const h3 = makeNode(r8R,  1, 8);

  // Row 9 — pre-Boss (Rest guaranteed left)
  const i1 = makeNode(r9L, -0.5, 9);
  const i2 = makeNode(r9R,  0.5, 9);

  // Row 10 — Boss
  const boss = makeNode("Boss", 0, 10);

  // ── Connectivity ────────────────────────────────────────────────────────
  nodes[start].next = [a1, a2, a3];

  // Rows 1 → 2 → 3  (path-locked: L→L,M | M→L,M,R | R→M,R)
  nodes[a1].next = [b1, b2];
  nodes[a2].next = [b1, b2, b3];
  nodes[a3].next = [b2, b3];

  nodes[b1].next = [c1, c2];
  nodes[b2].next = [c1, c2, c3];
  nodes[b3].next = [c2, c3];

  // Row 3 → converge Row 4
  nodes[c1].next = [d1];
  nodes[c2].next = [d1, d2];
  nodes[c3].next = [d2];

  // Row 4 → Elite Row 5 (forced)
  nodes[d1].next = [e1];
  nodes[d2].next = [e2];

  // Elite Row 5 → Recovery Row 6 (forced)
  nodes[e1].next = [f1];
  nodes[e2].next = [f2];

  // Recovery Row 6 → Row 7 (paths broaden after elite)
  nodes[f1].next = [g1, g2];   // left recovery  → left or centre
  nodes[f2].next = [g2, g3];   // right recovery → centre or right

  // Rows 7 → 8  (path-locked again)
  nodes[g1].next = [h1, h2];
  nodes[g2].next = [h1, h2, h3];
  nodes[g3].next = [h2, h3];

  // Row 8 → pre-Boss Row 9
  nodes[h1].next = [i1];
  nodes[h2].next = [i1, i2];
  nodes[h3].next = [i2];

  // Row 9 → Boss
  nodes[i1].next = [boss];
  nodes[i2].next = [boss];
  nodes[boss].next = [];

  return { nodes, currentNodeId: start, selectableNext: [...nodes[start].next] };
}

function makeCardRewards(data, seed, act = 1, nodeType = 'Combat') {
  const rng = new RNG(seed ^ 0x55CCAA11);

  // Partition player-usable cards into POWER vs standard
  const powerIds   = [];
  const standardIds = [];
  for (const id of Object.keys(data.cards)) {
    const c = data.cards[id];
    const tags = c.tags || [];
    if (tags.includes('EnemyCard') || tags.includes('Core') || id.startsWith('EC-')) continue;
    const isPower = tags.includes('Power') || c.type === 'Power';
    if (isPower) powerIds.push(id);
    else standardIds.push(id);
  }

  // In Act 2+ bias toward higher-cost cards (costRAM >= act threshold)
  // by duplicating qualifying cards in the pool for weighted selection
  const costThreshold = act >= 3 ? 4 : act >= 2 ? 3 : 0;
  const weightedStd = [];
  for (const id of standardIds) {
    weightedStd.push(id);
    if (costThreshold > 0 && (data.cards[id].costRAM || 0) >= costThreshold) {
      weightedStd.push(id); // double-weight strong cards in later acts
    }
  }

  // Helper: pick N distinct from a pool (modifies a local copy)
  function pickDistinct(pool, n) {
    const p = [...pool];
    const out = [];
    while (out.length < n && p.length > 0) {
      const idx = rng.int(p.length);
      out.push(p[idx]);
      p.splice(idx, 1);
    }
    return out;
  }

  let choices;
  if ((nodeType === 'Elite' || nodeType === 'Boss') && powerIds.length > 0) {
    // Elite / Boss: 1 guaranteed POWER card + 2 standard cards
    const powerPick   = pickDistinct(powerIds, 1);
    const standardPick = pickDistinct(weightedStd, 2);
    // Shuffle so POWER card isn't always in the same slot
    choices = [...powerPick, ...standardPick];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
  } else {
    // Normal combat: 3 standard cards (no POWER cards)
    choices = pickDistinct(weightedStd, 3);
  }

  return { cardChoices: choices, canSkip: true };
}

function makeShop(data, seed) {
  const rng = new RNG(seed ^ 0x0F0F0F0F);
  // Only offer player-usable cards (same filter as card rewards)
  const ids = Object.keys(data.cards).filter(id => {
    const c = data.cards[id];
    const tags = c.tags || [];
    return !tags.includes('EnemyCard') && !tags.includes('Core') && !id.startsWith('EC-');
  });
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
// After Act 3, the run ends in victory.
const MAX_ACTS = 3;
function maybeAdvanceAct(state, data, log) {
  if (!state.map || !state.run) return;
  if (state.map.selectableNext && state.map.selectableNext.length > 0) return;

  const prevAct = state.run.act;

  // Win condition: cleared the final act
  if (prevAct >= MAX_ACTS) {
    state.run.victory = true;
    state.mode = "GameOver";
    log({ t: "Info", msg: `RUN COMPLETE — all ${MAX_ACTS} acts cleared!` });
    return;
  }

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
    case "Combat_Simulate":
    case "Combat_ScryResolve": {
      if (state.mode !== "Combat" || !state.combat || !state.run || !state.deck) return state;

      const combatAction =
        action.type === "Combat_StartTurn" ? { type: "StartTurn" } :
        action.type === "Combat_EndTurn" ? { type: "EndTurn" } :
        action.type === "Combat_PlayCard" ? { type: "PlayCard", cardInstanceId: action.cardInstanceId, targetEnemyId: action.targetEnemyId } :
        action.type === "Combat_ScryResolve" ? { type: "ScryResolve", discard: action.discard, top: action.top } :
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
        state.reward = makeCardRewards(data, state.run.seed ^ (state.run.floor * 777), state.run.act, nodeType);

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
