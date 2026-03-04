import { RNG } from "./rng";
import { push } from "./log";
import { createInitialState as _init } from "./game_state";
import { createRunDeckFromDefs, addCardToRunDeck } from "./run_deck";
import { pickEncounter } from "./encounters";
import { startCombatFromRunDeck, dispatchCombat, forceNewMutation } from "./engine";
import { makeRelicChoices } from "./relic_rewards";
import { getRunMods } from "./rules_mods";
import { createBasicEventRegistry, pickRandomEventId, applyEventChoiceImmediate } from "./events";
import { getMinigameRewards, getMinigamePoolForAct } from "./minigames";
import { decodeDebugSeed, decodeSensibleDebugSeed } from "./debugSeed";

const EVENT_REG = createBasicEventRegistry();

function clone(x) { return structuredClone(x); }
function uid(rng, prefix) { return `${prefix}_${rng.nextUint().toString(16)}`; }

function generateMap(seed) {
  const rng = new RNG(seed ^ 0xA5A5A5A5);
  const nodes = {};
  function makeNode(type, x, y) {
    const id = uid(rng, "n");
    nodes[id] = { id, type, x, y, next: [], cleared: false };
    return id;
  }

  // ── StS-style path generation ───────────────────────────────────────────
  // 6 columns (0-5), 15 rows (0=Start, 1-13=content, 14=Boss).
  // 6 paths, each starting at a unique column. Each path meanders ±1 col/row.
  // Sorted-order invariant: after each row, path columns are sorted ascending.
  // This ensures edges never cross (planar graph).
  // Nodes at the same (row, col) are shared between paths.
  //
  //  Start (2.5, 0)      ← single centred node
  //  /  |  |  |  |  \   ← up to 6 row-1 nodes
  //   ...14 rows of meandering content...
  //  \  |  |  |  |  /   ← converge to Boss
  //  Boss (2.5, 14)

  const COLS   = 6;    // columns 0..5
  const PATH_N = 6;    // one path per column

  // Deterministic per-(row,col) type — independent of path iteration order
  function rowColType(row, col) {
    const tr = new RNG((seed ^ 0xDEADBEEF) ^ (row * 97 + col * 31) * 0x9E3779B1);
    if (row === 6)  return 'Elite';
    if (row === 7)  return tr.pick(['Rest', 'Rest', 'Shop']);
    if (row === 12) return 'Elite';
    if (row === 13) return tr.pick(['Rest', 'Shop', 'Event']);
    if (row <= 2)   return tr.pick(['Combat', 'Combat', 'Event', 'Shop']);
    if (row <= 5)   return tr.pick(['Combat', 'Event', 'Shop', 'Rest', 'Combat']);
    return               tr.pick(['Combat', 'Event', 'Shop', 'Rest', 'Combat']);
  }

  // Grid cache: "row,col" → nodeId
  const grid = {};
  function getNode(row, col) {
    const key = `${row},${col}`;
    if (grid[key]) return grid[key];
    grid[key] = makeNode(rowColType(row, col), col, row);
    return grid[key];
  }

  // Start and Boss — centred at x=2.5
  const startId = makeNode('Start', 2.5, 0);
  nodes[startId].cleared = true;
  const bossId = makeNode('Boss', 2.5, 14);
  nodes[bossId].next = [];

  // Generate paths — pathCols[p][r-1] = column for path p at row r (rows 1-13)
  const pathCols = Array.from({ length: PATH_N }, (_, p) => [p]);
  for (let r = 1; r <= 12; r++) {
    const proposals = pathCols.map(p => {
      const cur = p[r - 1];
      const d = rng.pick([-1, 0, 0, 1]); // slight stay-bias
      return Math.max(0, Math.min(COLS - 1, cur + d));
    });
    // Sort to maintain left-to-right order → edges never cross
    const sorted = [...proposals].sort((a, b) => a - b);
    pathCols.forEach((p, i) => p.push(sorted[i]));
  }

  // Build edges — deduplicated
  const edgeSet = new Set();
  function addEdge(fromId, toId) {
    const k = `${fromId}|${toId}`;
    if (!edgeSet.has(k)) { edgeSet.add(k); nodes[fromId].next.push(toId); }
  }

  // Start → row 1
  for (let p = 0; p < PATH_N; p++) addEdge(startId, getNode(1, pathCols[p][0]));

  // Row r → row r+1 (rows 1..12)
  for (let r = 1; r <= 12; r++) {
    for (let p = 0; p < PATH_N; p++) {
      addEdge(getNode(r, pathCols[p][r - 1]), getNode(r + 1, pathCols[p][r]));
    }
  }

  // Row 13 → Boss
  for (let p = 0; p < PATH_N; p++) addEdge(getNode(13, pathCols[p][12]), bossId);

  return {
    nodes,
    currentNodeId: startId,
    selectableNext: [...nodes[startId].next],
    detourEdges: [],
  };
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

function makeShop(data, seed, relicIds = []) {
  const rng = new RNG(seed ^ 0x0F0F0F0F);
  // Only offer player-usable cards (same filter as card rewards)
  const ids = Object.keys(data.cards).filter(id => {
    const c = data.cards[id];
    const tags = c.tags || [];
    return !tags.includes('EnemyCard') && !tags.includes('Core') && !id.startsWith('EC-');
  });
  // TheArchitect: all shop prices reduced by 15g
  const disc = relicIds.includes('TheArchitect') ? 15 : 0;
  const p = (base) => Math.max(5, base - disc);
  return {
    offers: [
      { kind: "Card", defId: rng.pick(ids), price: p(50) },
      { kind: "Card", defId: rng.pick(ids), price: p(50) },
      { kind: "Service", serviceId: "RemoveCard", price: p(75), requiresCard: true },
      { kind: "Service", serviceId: "Repair", price: p(60), requiresCard: true },
      { kind: "Service", serviceId: "Stabilise", price: p(60), requiresCard: true },
      { kind: "Service", serviceId: "Accelerate", price: p(40), requiresCard: true },
      { kind: "Service", serviceId: "Heal", price: p(60), requiresCard: false }
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

function service_RemoveCard(state, data, source = 'shop') {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  delete state.deck.cardInstances[sel];
  state.deck.master = state.deck.master.filter(x => x !== sel);
  // on_card_remove relic effects
  const relicIds = state.run?.relicIds || [];
  if (relicIds.includes('FragmentationCache')) {
    state.run.gold += 35;
    log({ t: 'Info', msg: 'FragmentationCache: +35g on remove' });
  }
  if (relicIds.includes('PurgeEngine') && source === 'event') {
    // Add a random player card to deck
    const cardIds = Object.keys(data?.cards || {}).filter(id => {
      const c = data.cards[id];
      return !c?.tags?.includes('EnemyCard') && !c?.tags?.includes('Status') && !c?.tags?.includes('Core');
    });
    if (cardIds.length > 0) {
      const peRng = new RNG((state.run.seed ^ 0xC0DE) >>> 0);
      const randomId = cardIds[peRng.int(cardIds.length)];
      const def = data.cards[randomId];
      const newCid = `pe_${peRng.int(0xFFFF).toString(16)}`;
      state.deck.cardInstances[newCid] = {
        defId: randomId,
        appliedMutations: [],
        useCounter: def.defaultUseCounter ?? 12,
        finalMutationCountdown: def.defaultFinalMutationCountdown ?? 8,
        ramCostDelta: 0,
      };
      state.deck.master.push(newCid);
      log({ t: 'Info', msg: `PurgeEngine: added ${randomId} to deck` });
    }
  }
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
function service_DuplicateCard(state, rng) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const ci = state.deck.cardInstances[sel];
  if (!ci) return false;
  const newId = `ci_${rng.nextUint().toString(16)}`;
  state.deck.cardInstances[newId] = { ...structuredClone(ci), id: newId };
  state.deck.master.push(newId);
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
      relicIds: state.run.relicIds || [],
    });
    state.combat.player.hp = state.run.hp;
    const debugTag = dbg ? ` [dbg: act${effectiveAct}/${effectiveKind}]` : '';
    log({ t: "Info", msg: `Encounter: ${encounterName}${debugTag}` });
    return state;
  }

  if (node.type === "Shop") {
    state.mode = "Shop";
    state.shop = makeShop(data, state.run.seed ^ state.run.floor, state.run.relicIds || []);
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
    const minigameIds = getMinigamePoolForAct(state.run.act);
    const allEventIds = [...EVENT_REG.pool, ...minigameIds];
    const eventRng = new RNG((state.run.seed ^ state.run.floor ^ 0xE17E17) >>> 0);
    const eid = eventRng.pick(allEventIds);
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

      // Starter deck: explicit debug list > default 5-card starter
      let starter;
      if (dbg?.startingCardIds?.length) {
        starter = dbg.startingCardIds;
      } else if (dbg?.startingCardCount != null) {
        starter = Object.keys(data.cards).slice(0, dbg.startingCardCount);
      } else {
        // Default: C-001 (Strike) + C-002 (Guard) + 1 random Utility + 1 random Attack + 1 random Defense
        const starterRng = new RNG((action.seed ^ 0x5EED5EED) >>> 0);
        const pick = (type, exclude) => {
          const pool = Object.entries(data.cards)
            .filter(([id, c]) => c.type === type
              && !c.tags?.includes('EnemyCard')
              && !c.tags?.includes('Status')
              && !exclude?.includes(id))
            .map(([id]) => id);
          return pool.length ? pool[starterRng.int(pool.length)] : null;
        };
        starter = [
          'C-001',
          'C-002',
          pick('Utility'),
          pick('Attack', ['C-001']),
          pick('Defense', ['C-002']),
        ].filter(Boolean);
      }
      state.deck = createRunDeckFromDefs(data, action.seed, starter.length ? starter : ['C-001', 'C-002']);
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

        // after_combat relic effects
        const nodeType2 = state.map?.nodes[state.map.currentNodeId]?.type;
        for (const rid of (state.run.relicIds || [])) {
          const r = data.relics?.[rid];
          if (!r || r.hook !== 'after_combat') continue;
          if (rid === 'DataTap') {
            state.run.gold += 12;
            log({ t: "Info", msg: 'DataTap: +12g after combat' });
          } else if (rid === 'Stimpak') {
            state.run.hp = Math.min(state.run.maxHP, state.run.hp + 4);
            log({ t: "Info", msg: 'Stimpak: +4 HP after combat' });
          } else if (rid === 'ExploitFramework' && (nodeType2 === 'Elite' || nodeType2 === 'Boss')) {
            state.run.gold += 25;
            log({ t: "Info", msg: 'ExploitFramework: +25g elite/boss bonus' });
          }
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
      // on_run_start effects fire when the relic is first acquired
      if (action.relicId === 'WornToolkit' && state.deck) {
        const instances = Object.values(state.deck.cardInstances);
        const repairable = instances.filter(ci => !ci.finalMutationId);
        if (repairable.length > 0) {
          const wtRng = new RNG((state.run.seed ^ 0x700C) >>> 0);
          const target = repairable[wtRng.int(repairable.length)];
          const def = data.cards[target.defId];
          const maxUse = def?.defaultUseCounter ?? 12;
          target.useCounter = Math.min(maxUse, target.useCounter + Math.ceil(maxUse * 0.35));
          log({ t: "Info", msg: `WornToolkit: repaired ${target.defId}` });
        }
      }
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

      // Pre-process GainCard ops (add random card to deck before applying other ops)
      {
        const evDef = EVENT_REG.events[state.event.eventId];
        const evChoice = evDef?.choices.find(c => c.id === action.choiceId);
        if (evChoice) {
          for (const op of evChoice.ops) {
            if (op.op === 'GainCard') {
              const cardRng = new RNG((state.run.seed ^ state.run.floor ^ 0xCA4DCA4D) >>> 0);
              const pool = Object.keys(data.cards).filter(id => {
                const c = data.cards[id];
                const tags = c.tags || [];
                if (tags.includes('EnemyCard') || tags.includes('Core') || id.startsWith('EC-')) return false;
                if (op.pool === 'power') return tags.includes('Power') || c.type === 'Power';
                return !tags.includes('Power') && c.type !== 'Power';
              });
              if (pool.length) addCardToRunDeck(data, state.deck, cardRng, cardRng.pick(pool));
            }
          }
        }
      }

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

    // ---------- Minigame complete ----------
    case "Minigame_Complete": {
      if (state.mode !== "Event" || !state.run) return state;

      const { eventId, tier } = action; // tier: 'gold' | 'silver' | 'fail' | 'skip'
      const ops = getMinigameRewards(eventId, tier);
      log({ t: "Info", msg: `Minigame ${eventId}: ${tier}` });

      for (const op of ops) {
        if (op.op === "GainGold")   state.run.gold  = (state.run.gold  || 0) + op.amount;
        if (op.op === "LoseGold")   state.run.gold  = Math.max(0, (state.run.gold || 0) - op.amount);
        if (op.op === "Heal")       state.run.hp    = Math.min(state.run.maxHP, (state.run.hp || 0) + op.amount);
        if (op.op === "LoseHP")     state.run.hp    = Math.max(0, (state.run.hp || 0) - op.amount);
        if (op.op === "GainMaxHP")  state.run.maxHP = (state.run.maxHP || 0) + op.amount;
        if (op.op === "GainMP")     state.run.mp    = (state.run.mp    || 0) + op.amount;

        // Card ops — open deck picker for player to select a card
        if (op.op === "AccelerateSelectedCard" || op.op === "StabiliseSelectedCard" ||
            op.op === "RepairSelectedCard"     || op.op === "RemoveSelectedCard") {
          state.deckView = { selectedInstanceId: null, returnMode: "Event" };
          state.event = { eventId, step: 0, pendingSelectOp: op.op };
          if (state.run.hp <= 0) {
            state.mode = "GameOver";
            log({ t: "Info", msg: "Run ended: died in minigame penalty" });
          }
          return state;
        }
      }

      if (state.run.hp <= 0) {
        state.mode = "GameOver";
        log({ t: "Info", msg: "Run ended: died in minigame penalty" });
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
        if (serviceId === "RemoveCard") ok = service_RemoveCard(state, data, 'shop');
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
        if (op === "RemoveSelectedCard") ok = service_RemoveCard(state, data, 'event');
        if (op === "RepairSelectedCard") ok = service_RepairCard(state, data);
        if (op === "StabiliseSelectedCard") ok = service_StabiliseCard(state, data);
        if (op === "AccelerateSelectedCard") ok = service_AccelerateCard(state);
        if (op === "DuplicateSelectedCard") {
          const dupRng = new RNG((state.run?.seed ^ state.run?.floor ^ 0xD0D0D0) >>> 0);
          ok = service_DuplicateCard(state, dupRng);
        }
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
