import { RNG } from "./rng";
import { addCardToRunDeck } from "./run_deck";
import { analyzeDeckState, getFactionRep, getHighestFaction } from "./runInsights";

function weightedPick(rng, defs) {
  const entries = defs.filter((entry) => entry && entry.weight > 0);
  if (entries.length === 0) return null;
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = (rng?.next?.() ?? Math.random()) * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function getEventChoiceWeight(eventDef, state, data, analysis) {
  if (typeof eventDef?.getWeight === "function") {
    return Math.max(0, Number(eventDef.getWeight(state, data, analysis) || 0));
  }
  return Math.max(1, Number(eventDef?.weight || 50));
}

function ensureRunSidecars(run) {
  if (!run) return;
  if (!run.factionRep || typeof run.factionRep !== "object") {
    run.factionRep = { ghosts: 0, architects: 0, scrappers: 0 };
  }
  if (!run.eventFlags || typeof run.eventFlags !== "object") {
    run.eventFlags = {};
  }
  if (!Array.isArray(run.eventSeen)) {
    run.eventSeen = [];
  }
}

function applyFactionRep(run, factionId, amount) {
  ensureRunSidecars(run);
  if (!factionId) return;
  run.factionRep[factionId] = Number(run.factionRep[factionId] || 0) + Number(amount || 0);
}

function applyFlag(run, flag, value = true) {
  ensureRunSidecars(run);
  if (!flag) return;
  run.eventFlags[flag] = value;
}

function clearFlag(run, flag) {
  ensureRunSidecars(run);
  if (!flag) return;
  delete run.eventFlags[flag];
}

function awardRandomPlayerCard(state, data, op, seedSalt = 0xCA4DCA4D) {
  if (!state?.deck || !state?.run || !data?.cards) return false;
  const rng = new RNG((state.run.seed ^ state.run.floor ^ seedSalt) >>> 0);
  const pool = Object.keys(data.cards).filter((id) => {
    const card = data.cards[id];
    const tags = card?.tags || [];
    if (tags.includes("EnemyCard") || tags.includes("Status") || tags.includes("Core") || id.startsWith("EC-")) return false;
    if (op.pool === "power") return tags.includes("Power") || card.type === "Power";
    if (op.pool === "rare") return String(card.rarity || "").toLowerCase() === "rare";
    if (op.pool === "uncommon") return String(card.rarity || "").toLowerCase() === "uncommon";
    return !tags.includes("Power") && card.type !== "Power";
  });
  if (pool.length === 0) return false;
  addCardToRunDeck(data, state.deck, rng, rng.pick(pool));
  return true;
}

function awardTaggedPlayerCard(state, data, tag, seedSalt = 0xCE571234) {
  if (!state?.deck || !state?.run || !data?.cards || !tag) return false;
  const rng = new RNG((state.run.seed ^ state.run.floor ^ seedSalt) >>> 0);
  const pool = Object.keys(data.cards).filter((id) => {
    const card = data.cards[id];
    const tags = card?.tags || [];
    return tags.includes(tag)
      && !tags.includes("EnemyCard")
      && !tags.includes("EnemyAbility")
      && !id.startsWith("EC-");
  });
  if (pool.length === 0) return false;
  addCardToRunDeck(data, state.deck, rng, rng.pick(pool));
  return true;
}

function cullBrickedCards(state, data, count = 3, replacementCount = 1) {
  if (!state?.deck) return false;
  const analysis = analyzeDeckState(data, state.deck);
  const doomed = analysis.brickedInstanceIds.length >= count
    ? analysis.brickedInstanceIds.slice(0, count)
    : analysis.unstableInstanceIds.slice(0, count);
  if (doomed.length < count) return false;
  for (const cid of doomed) {
    delete state.deck.cardInstances[cid];
    state.deck.master = state.deck.master.filter((entry) => entry !== cid);
  }
  for (let index = 0; index < replacementCount; index += 1) {
    awardRandomPlayerCard(state, data, { pool: "uncommon" }, 0xB11C000 + index);
  }
  return true;
}

function grantHighestFactionReward(state) {
  if (!state?.run) return false;
  ensureRunSidecars(state.run);
  const highestFaction = getHighestFaction(state.run);
  const rewardMap = {
    ghosts: "GhostProtocol",
    architects: "PatchNotes",
    scrappers: "MutationCatalyst",
  };
  const relicId = rewardMap[highestFaction] || "GhostProtocol";
  if (!state.run.relicIds.includes(relicId)) {
    state.run.relicIds.push(relicId);
    return true;
  }
  state.run.gold = (state.run.gold || 0) + 60;
  return true;
}

export function createBasicEventRegistry() {
  const events = {
    StreetDoc: {
      id: "StreetDoc",
      title: "Street Doc",
      icon: "+",
      text: "A back-alley clinic offers patch jobs for a price.",
      choices: [
        { id: "pay_heal", label: "Pay 40g - Heal 12 HP", ops: [{ op: "LoseGold", amount: 40 }, { op: "Heal", amount: 12 }] },
        { id: "free_repair", label: "Let them tinker - Repair a card", ops: [{ op: "RepairSelectedCard" }] },
        { id: "leave", label: "Leave", ops: [] },
      ],
    },

    DataCache: {
      id: "DataCache",
      title: "Data Cache",
      icon: "#",
      text: "An unsecured cache. Risky to access, profitable if clean.",
      choices: [
        { id: "grab", label: "Grab it - +60g, Accelerate a card", ops: [{ op: "GainGold", amount: 60 }, { op: "AccelerateSelectedCard" }] },
        { id: "play_safe", label: "Play safe - +20g", ops: [{ op: "GainGold", amount: 20 }] },
      ],
    },

    GlitchZone: {
      id: "GlitchZone",
      title: "Glitch Sector",
      icon: "*",
      text: "A corrupted sector crackles with unstable energy. Stabilise it or exploit the chaos.",
      choices: [
        { id: "stabilise", label: "Run diagnostics - 30g: Stabilise a card", ops: [{ op: "LoseGold", amount: 30 }, { op: "StabiliseSelectedCard" }] },
        { id: "exploit", label: "Exploit chaos - Free: Remove a card, +40g", ops: [{ op: "GainGold", amount: 40 }, { op: "RemoveSelectedCard" }] },
        { id: "leave", label: "Back away", ops: [] },
      ],
    },

    SalvageYard: {
      id: "SalvageYard",
      title: "Salvage Yard",
      icon: "S",
      text: "Piles of discarded tech. Most of it is junk, but something is worth keeping.",
      choices: [
        { id: "strip", label: "Strip parts - Free: +25g, Repair a card", ops: [{ op: "GainGold", amount: 25 }, { op: "RepairSelectedCard" }] },
        { id: "haul", label: "Full salvage - 45g: +90g, Remove a card", ops: [{ op: "LoseGold", amount: 45 }, { op: "GainGold", amount: 90 }, { op: "RemoveSelectedCard" }] },
        { id: "leave", label: "Move on", ops: [] },
      ],
    },

    NeuralBooster: {
      id: "NeuralBooster",
      title: "Neural Booster",
      icon: "N",
      text: "A black-market neural accelerator. Side effects are optional, according to the vendor.",
      choices: [
        { id: "install", label: "Install - +2 Max HP, Accelerate a card", ops: [{ op: "GainMaxHP", amount: 2 }, { op: "AccelerateSelectedCard" }] },
        { id: "trial", label: "Trial dose - Heal 20", ops: [{ op: "Heal", amount: 20 }] },
        { id: "sell", label: "Fence it - +50g", ops: [{ op: "GainGold", amount: 50 }] },
      ],
    },

    CorruptDataPurge: {
      id: "CorruptDataPurge",
      title: "Corrupt Data",
      icon: "X",
      text: "Corrupted code is degrading your systems. A purge will hurt, but it might be worth it.",
      choices: [
        { id: "purge", label: "Emergency purge - Remove a card, +45g", ops: [{ op: "GainGold", amount: 45 }, { op: "RemoveSelectedCard" }] },
        { id: "partial", label: "Suppress it - Lose 8 HP, +20g", ops: [{ op: "LoseHP", amount: 8 }, { op: "GainGold", amount: 20 }] },
        { id: "ignore", label: "Ignore it", ops: [] },
      ],
    },

    BlackMarketDeal: {
      id: "BlackMarketDeal",
      title: "Black Market",
      icon: "$",
      text: "Someone is offloading stolen data. Probably dirty. Definitely tempting.",
      choices: [
        { id: "bulk", label: "Buy bulk - Lose 15 HP: +90g", ops: [{ op: "LoseHP", amount: 15 }, { op: "GainGold", amount: 90 }] },
        { id: "quick", label: "Quick deal - Lose 6 HP: +40g", ops: [{ op: "LoseHP", amount: 6 }, { op: "GainGold", amount: 40 }] },
        { id: "pass", label: "Walk away", ops: [] },
      ],
    },

    AbandonedLab: {
      id: "AbandonedLab",
      title: "Abandoned Lab",
      icon: "L",
      text: "Mutation equipment is still running. The previous researcher left in a hurry.",
      choices: [
        { id: "accelerate", label: "Accelerate mutation - Accelerate a card", ops: [{ op: "AccelerateSelectedCard" }] },
        { id: "stabilise", label: "Stabilise - Stabilise a card", ops: [{ op: "StabiliseSelectedCard" }] },
        { id: "trash", label: "Gut the machine - Remove a card, +35g", ops: [{ op: "GainGold", amount: 35 }, { op: "RemoveSelectedCard" }] },
        { id: "leave", label: "Do not touch anything", ops: [] },
      ],
    },

    SystemRestore: {
      id: "SystemRestore",
      title: "Emergency Backup",
      icon: "R",
      text: "Emergency backup systems flicker to life. You have a few minutes before they die.",
      choices: [
        { id: "full", label: "Full restore - Heal 30 HP", ops: [{ op: "Heal", amount: 30 }] },
        { id: "repair", label: "Selective repair - Repair a card", ops: [{ op: "RepairSelectedCard" }] },
        { id: "boost", label: "Push systems - +4 MP, Lose 10 HP", ops: [{ op: "GainMP", amount: 4 }, { op: "LoseHP", amount: 10 }] },
      ],
    },

    CorporateSpy: {
      id: "CorporateSpy",
      title: "Corporate Spy",
      icon: "?",
      text: "A corp agent offers information and a deal. There is always a catch.",
      choices: [
        { id: "intel", label: "Buy intel - 25g: Heal 15, +2 MP", ops: [{ op: "LoseGold", amount: 25 }, { op: "Heal", amount: 15 }, { op: "GainMP", amount: 2 }] },
        { id: "extort", label: "Extort them - Take 10 damage: +70g", ops: [{ op: "LoseHP", amount: 10 }, { op: "GainGold", amount: 70 }] },
        { id: "walk", label: "Ghost them", ops: [] },
      ],
    },

    BionicUpgrade: {
      id: "BionicUpgrade",
      title: "Bionic Upgrade",
      icon: "B",
      text: "Illegal bionic augmentations. Pain is temporary. Power is probably temporary too.",
      choices: [
        { id: "max_hp", label: "Reinforce chassis - Lose 20g: +5 Max HP", ops: [{ op: "LoseGold", amount: 20 }, { op: "GainMaxHP", amount: 5 }] },
        { id: "hp_heal", label: "Patch wounds - Lose 15g: Heal 25", ops: [{ op: "LoseGold", amount: 15 }, { op: "Heal", amount: 25 }] },
        { id: "decline", label: "No thanks", ops: [] },
      ],
    },

    EchoChamber: {
      id: "EchoChamber",
      title: "Echo Chamber",
      icon: "=",
      text: "A recursive data loop - whatever enters, exits twice. Someone left it running.",
      choices: [
        { id: "duplicate", label: "Mirror the signal - Lose 20 HP: Duplicate a card", ops: [{ op: "LoseHP", amount: 20 }, { op: "DuplicateSelectedCard" }] },
        { id: "extract", label: "Extract the pattern - +35g", ops: [{ op: "GainGold", amount: 35 }] },
        { id: "leave", label: "Shut it down", ops: [] },
      ],
    },

    RogueDrone: {
      id: "RogueDrone",
      title: "Rogue Drone",
      icon: "D",
      text: "A corp drone is off-leash and carrying a data package. High risk, high reward.",
      choices: [
        { id: "intercept", label: "Full intercept - Lose 18 HP: +90g", ops: [{ op: "LoseHP", amount: 18 }, { op: "GainGold", amount: 90 }] },
        { id: "clip", label: "Clip it - Lose 8 HP: +40g", ops: [{ op: "LoseHP", amount: 8 }, { op: "GainGold", amount: 40 }] },
        { id: "avoid", label: "Let it pass", ops: [] },
      ],
    },

    DataLoop: {
      id: "DataLoop",
      title: "Open Data Feed",
      icon: ">",
      text: "An unencrypted data stream is free to access and full of useful patterns.",
      choices: [
        { id: "clone", label: "Download a pattern - Add a card to deck", ops: [{ op: "GainCard", pool: "standard" }] },
        { id: "sell", label: "Sell the access credentials - +55g", ops: [{ op: "GainGold", amount: 55 }] },
        { id: "ignore", label: "Move on", ops: [] },
      ],
    },

    Extraction: {
      id: "Extraction",
      title: "Emergency Extraction",
      icon: "E",
      text: "A fixer offers fast evac and a clean-up service. It costs money. It saves skin.",
      choices: [
        { id: "full", label: "Full package - Lose 35g: Heal 30 HP, Remove a card", ops: [{ op: "LoseGold", amount: 35 }, { op: "Heal", amount: 30 }, { op: "RemoveSelectedCard" }] },
        { id: "partial", label: "Patch job - Lose 20g: Heal 15 HP", ops: [{ op: "LoseGold", amount: 20 }, { op: "Heal", amount: 15 }] },
        { id: "decline", label: "Handle it yourself", ops: [] },
      ],
    },

    GhostTech: {
      id: "GhostTech",
      title: "Ghost Tech",
      icon: "G",
      text: "A military-grade subdermal chip, still in the wrapper. No serial number. Very illegal.",
      choices: [
        { id: "install", label: "Install it - Lose 30g: +10 Max HP", ops: [{ op: "LoseGold", amount: 30 }, { op: "GainMaxHP", amount: 10 }] },
        { id: "fence", label: "Fence it - +40g", ops: [{ op: "GainGold", amount: 40 }] },
        { id: "leave", label: "Do not touch it", ops: [] },
      ],
    },

    ShadowBroker: {
      id: "ShadowBroker",
      title: "Shadow Broker",
      icon: "B",
      text: "They deal in data patterns. Trade something old for something new, sight unseen.",
      choices: [
        { id: "trade", label: "Make the trade - Add a card, Remove a card", ops: [{ op: "GainCard", pool: "standard" }, { op: "RemoveSelectedCard" }] },
        { id: "browse", label: "Just browsing - +30g", ops: [{ op: "GainGold", amount: 30 }] },
        { id: "walk", label: "Walk away", ops: [] },
      ],
    },

    CorpAmbush: {
      id: "CorpAmbush",
      title: "Corp Ambush",
      icon: "!",
      text: "A corporate security team has your position. You have three seconds to decide.",
      choices: [
        { id: "bribe", label: "Bribe the captain - Lose 25g", ops: [{ op: "LoseGold", amount: 25 }] },
        { id: "fight", label: "Break through - Lose 18 HP: +60g loot", ops: [{ op: "LoseHP", amount: 18 }, { op: "GainGold", amount: 60 }] },
        { id: "flee", label: "Emergency retreat", ops: [] },
      ],
    },

    ReconReport: {
      id: "ReconReport",
      title: "Recon Report",
      icon: "R",
      text: "A runner left a stash with a full intel package on the area ahead. It costs to retrieve.",
      choices: [
        { id: "claim", label: "Claim the intel - Lose 12 HP: Add a card", ops: [{ op: "LoseHP", amount: 12 }, { op: "GainCard", pool: "standard" }] },
        { id: "gold", label: "Take the cash instead - +40g", ops: [{ op: "GainGold", amount: 40 }] },
        { id: "pass", label: "Leave it", ops: [] },
      ],
    },

    FactionBrokerage: {
      id: "FactionBrokerage",
      title: "Faction Brokerage",
      icon: "F",
      text: "Three network cells offer help. None of them work for free, but each one can tilt the rest of the run.",
      weight: 32,
      isEligible: (state) => Number(state?.run?.floor || 0) >= 3,
      choices: [
        { id: "ghosts", label: "Ghost cell - Duplicate a card, lose 6 HP, Ghost rep +2", ops: [{ op: "LoseHP", amount: 6 }, { op: "DuplicateSelectedCard" }, { op: "AdjustFactionRep", factionId: "ghosts", amount: 2 }] },
        { id: "architects", label: "Architect cell - Compile a card, lose 25g, Architect rep +2", ops: [{ op: "LoseGold", amount: 25 }, { op: "CompileSelectedCard" }, { op: "AdjustFactionRep", factionId: "architects", amount: 2 }] },
        { id: "scrappers", label: "Scrapper cell - Repair a card, gain 25g, Scrapper rep +2", ops: [{ op: "GainGold", amount: 25 }, { op: "RepairSelectedCard" }, { op: "AdjustFactionRep", factionId: "scrappers", amount: 2 }] },
      ],
    },

    FactionSafehouse: {
      id: "FactionSafehouse",
      title: "Faction Safehouse",
      icon: "H",
      text: "A safehouse opens its doors because your name means something now. Cash in the favour, or keep your profile quiet.",
      weight: 18,
      isEligible: (state) => {
        const rep = getFactionRep(state?.run);
        return Math.max(rep.ghosts, rep.architects, rep.scrappers) >= 2 && !state?.run?.eventFlags?.factionSafehouseClaimed;
      },
      choices: [
        { id: "cash_favour", label: "Call in the favour - gain a faction reward", ops: [{ op: "GainHighestFactionReward" }, { op: "SetRunFlag", flag: "factionSafehouseClaimed", value: true }] },
        { id: "cash_out", label: "Take quiet support - +60g and heal 10", ops: [{ op: "GainGold", amount: 60 }, { op: "Heal", amount: 10 }, { op: "SetRunFlag", flag: "factionSafehouseClaimed", value: true }] },
      ],
    },

    BlacksiteContract: {
      id: "BlacksiteContract",
      title: "Blacksite Contract",
      icon: "C",
      text: "A sealed relay offers immediate power in exchange for future leverage. The package is cursed, but the payout is real.",
      weight: 14,
      isEligible: (state) => !state?.run?.eventFlags?.blacksiteDebt,
      choices: [
        { id: "sign", label: "Sign it - gain a cursed relic, +110g, add a Curse, debt follows you", ops: [{ op: "GainRelic", relicId: "CursedCompiler" }, { op: "GainGold", amount: 110 }, { op: "GainCurseCard" }, { op: "SetRunFlag", flag: "blacksiteDebt", value: true }] },
        { id: "decline", label: "Decline - heal 8 and keep moving", ops: [{ op: "Heal", amount: 8 }] },
      ],
    },

    DebtCollectors: {
      id: "DebtCollectors",
      title: "Debt Collectors",
      icon: "!",
      text: "The contract catches up with you. Pay the ledger now, or let them carve the cost out of the run another way.",
      weight: 10,
      isEligible: (state) => !!state?.run?.eventFlags?.blacksiteDebt && Number(state?.run?.act || 1) >= 2,
      choices: [
        { id: "pay", label: "Pay them - lose 90g, debt cleared", ops: [{ op: "LoseGold", amount: 90 }, { op: "ClearRunFlag", flag: "blacksiteDebt" }] },
        { id: "bleed", label: "Refuse - lose 10 Max HP, debt cleared", ops: [{ op: "LoseMaxHP", amount: 10 }, { op: "ClearRunFlag", flag: "blacksiteDebt" }] },
      ],
    },

    BrickAmnesty: {
      id: "BrickAmnesty",
      title: "Brick Amnesty",
      icon: "X",
      text: "A maintenance lattice scans your loadout and highlights the dead weight. Surrender the broken code and walk away lighter.",
      weight: 22,
      isEligible: (state, data) => {
        const analysis = analyzeDeckState(data, state);
        return analysis.brickedCount >= 3 || analysis.unstableCount >= 4;
      },
      getWeight: (state, data) => {
        const analysis = analyzeDeckState(data, state);
        return analysis.brickedCount >= 3 ? 42 : analysis.unstableCount >= 4 ? 28 : 0;
      },
      choices: [
        { id: "trade_bricks", label: "Trade out three unstable cards - gain one clean uncommon", ops: [{ op: "CullBrickedCards", count: 3, replacementCount: 1 }] },
        { id: "patch_one", label: "Patch one card and move on - Repair a card, +20g", ops: [{ op: "RepairSelectedCard" }, { op: "GainGold", amount: 20 }] },
      ],
    },

    MutationAudit: {
      id: "MutationAudit",
      title: "Mutation Audit",
      icon: "M",
      text: "A live sandbox offers to freeze and catalogue your weirdest code. It is exactly as risky as that sounds.",
      weight: 20,
      isEligible: (state, data) => analyzeDeckState(data, state).mutatedCount >= 5,
      choices: [
        { id: "stabilise", label: "Stabilise the experiment - Stabilise a card, +25g", ops: [{ op: "StabiliseSelectedCard" }, { op: "GainGold", amount: 25 }, { op: "AdjustFactionRep", factionId: "architects", amount: 1 }] },
        { id: "lean_in", label: "Lean in - Gain Mutation Catalyst, lose 6 Max HP", ops: [{ op: "GainRelic", relicId: "MutationCatalyst" }, { op: "LoseMaxHP", amount: 6 }, { op: "AdjustFactionRep", factionId: "scrappers", amount: 1 }] },
      ],
    },
  };

  return { events, pool: Object.keys(events) };
}

export function pickRandomEventId(reg, seed) {
  const rng = new RNG(seed ^ 0xE17E17);
  return rng.pick(reg.pool);
}

export function pickContextualEventId(reg, data, state, seed, extraPool = []) {
  const rng = new RNG(seed ^ 0xE17E17);
  const analysis = analyzeDeckState(data, state);
  const eventSeen = Array.isArray(state?.run?.eventSeen) ? state.run.eventSeen : [];
  const eventEntries = Object.values(reg?.events || {})
    .filter((eventDef) => {
      if (!eventDef?.id) return false;
      if (typeof eventDef.isEligible === "function" && !eventDef.isEligible(state, data, analysis)) return false;
      return true;
    })
    .map((eventDef) => {
      let weight = getEventChoiceWeight(eventDef, state, data, analysis);
      if (eventSeen.includes(eventDef.id)) weight *= 0.35;
      return { value: eventDef.id, weight };
    });

  const minigameEntries = (extraPool || []).map((eventId, index) => ({
    value: eventId,
    weight: Math.max(6, 18 - index),
  }));

  return weightedPick(rng, [...eventEntries, ...minigameEntries]) || pickRandomEventId(reg, seed);
}

export function applyEventChoiceImmediate(state, data, reg, choiceId) {
  if (!state.event || !state.run) return { needsDeckTarget: null };
  ensureRunSidecars(state.run);
  const def = reg.events[state.event.eventId];
  const choice = def?.choices.find((entry) => entry.id === choiceId);
  if (!choice) return { needsDeckTarget: null };

  const deckOps = new Set([
    "RemoveSelectedCard",
    "RepairSelectedCard",
    "StabiliseSelectedCard",
    "AccelerateSelectedCard",
    "DuplicateSelectedCard",
    "CompileSelectedCard",
  ]);

  for (const op of choice.ops) {
    if (deckOps.has(op.op)) return { needsDeckTarget: op };

    switch (op.op) {
      case "GainGold":
        state.run.gold = (state.run.gold || 0) + op.amount;
        break;
      case "LoseGold":
        state.run.gold = Math.max(0, (state.run.gold || 0) - op.amount);
        break;
      case "Heal":
        state.run.hp = Math.min(state.run.maxHP, (state.run.hp || 0) + op.amount);
        break;
      case "LoseHP":
        state.run.hp = Math.max(0, (state.run.hp || 0) - op.amount);
        break;
      case "GainMP":
        state.run.mp = Math.min(state.run.maxMP || 99, (state.run.mp || 0) + op.amount);
        break;
      case "LoseMP":
        state.run.mp = Math.max(0, (state.run.mp || 0) - op.amount);
        break;
      case "GainMaxHP":
        state.run.maxHP = (state.run.maxHP || 50) + op.amount;
        break;
      case "LoseMaxHP":
        state.run.maxHP = Math.max(1, (state.run.maxHP || 50) - op.amount);
        state.run.hp = Math.min(state.run.hp, state.run.maxHP);
        break;
      case "GainRelic":
        if (op.relicId && !state.run.relicIds.includes(op.relicId)) state.run.relicIds.push(op.relicId);
        break;
      case "AdjustFactionRep":
        applyFactionRep(state.run, op.factionId, op.amount);
        break;
      case "SetRunFlag":
        applyFlag(state.run, op.flag, op.value ?? true);
        break;
      case "ClearRunFlag":
        clearFlag(state.run, op.flag);
        break;
      case "GainRandomCard":
        awardRandomPlayerCard(state, data, op, 0xABCD1000);
        break;
      case "GainCurseCard":
        awardTaggedPlayerCard(state, data, "Curse", 0xABCD2000);
        break;
      case "CullBrickedCards":
        cullBrickedCards(state, data, Number(op.count || 3), Number(op.replacementCount || 1));
        break;
      case "GainHighestFactionReward":
        grantHighestFactionReward(state);
        break;
      default:
        break;
    }
  }

  return { needsDeckTarget: null };
}
