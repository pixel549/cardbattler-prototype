import { RNG } from "./rng";

export function createBasicEventRegistry() {
  const events = {

    // ── Original events ──────────────────────────────────────────────────────

    "StreetDoc": {
      id: "StreetDoc",
      title: "Street Doc",
      icon: "🩺",
      text: "A back-alley clinic offers patch jobs… for a price.",
      choices: [
        { id: "pay_heal",    label: "Pay 40g — Heal 12 HP",       ops: [{ op: "LoseGold", amount: 40 }, { op: "Heal", amount: 12 }] },
        { id: "free_repair", label: "Let them tinker — Repair a card", ops: [{ op: "RepairSelectedCard" }] },
        { id: "leave",       label: "Leave",                        ops: [] },
      ],
    },

    "DataCache": {
      id: "DataCache",
      title: "Data Cache",
      icon: "💾",
      text: "An unsecured cache. Risky to access, profitable if clean.",
      choices: [
        { id: "grab",      label: "Grab it — +60g, Accelerate a card", ops: [{ op: "GainGold", amount: 60 }, { op: "AccelerateSelectedCard" }] },
        { id: "play_safe", label: "Play safe — +20g",                   ops: [{ op: "GainGold", amount: 20 }] },
      ],
    },

    // ── New original events ───────────────────────────────────────────────────

    "GlitchZone": {
      id: "GlitchZone",
      title: "Glitch Sector",
      icon: "⚡",
      text: "A corrupted sector crackles with unstable energy. Stabilise it or exploit the chaos.",
      choices: [
        { id: "stabilise",   label: "Run diagnostics — 30g: Stabilise a card", ops: [{ op: "LoseGold", amount: 30 }, { op: "StabiliseSelectedCard" }] },
        { id: "exploit",     label: "Exploit chaos — Free: Remove a card, +40g", ops: [{ op: "GainGold", amount: 40 }, { op: "RemoveSelectedCard" }] },
        { id: "leave",       label: "Back away",                                  ops: [] },
      ],
    },

    "SalvageYard": {
      id: "SalvageYard",
      title: "Salvage Yard",
      icon: "🔧",
      text: "Piles of discarded tech. Most of it is junk — but something's worth keeping.",
      choices: [
        { id: "strip",   label: "Strip parts — Free: +25g, Repair a card",           ops: [{ op: "GainGold", amount: 25 }, { op: "RepairSelectedCard" }] },
        { id: "haul",    label: "Full salvage — 45g: +90g, Remove a card",            ops: [{ op: "LoseGold", amount: 45 }, { op: "GainGold", amount: 90 }, { op: "RemoveSelectedCard" }] },
        { id: "leave",   label: "Move on",                                            ops: [] },
      ],
    },

    "NeuralBooster": {
      id: "NeuralBooster",
      title: "Neural Booster",
      icon: "🧠",
      text: "A black-market neural accelerator. Side effects: headaches, euphoria, occasional system crashes.",
      choices: [
        { id: "install",  label: "Install — +2 Max HP, Accelerate a card",     ops: [{ op: "GainMaxHP", amount: 2 }, { op: "AccelerateSelectedCard" }] },
        { id: "trial",    label: "Trial dose — Heal 20",                        ops: [{ op: "Heal", amount: 20 }] },
        { id: "sell",     label: "Fence it — +50g",                             ops: [{ op: "GainGold", amount: 50 }] },
      ],
    },

    "CorruptDataPurge": {
      id: "CorruptDataPurge",
      title: "Corrupt Data",
      icon: "🗑️",
      text: "Corrupted code is degrading your systems. A purge will hurt — but might be worth it.",
      choices: [
        { id: "purge",    label: "Emergency purge — Remove a card, +45g",  ops: [{ op: "GainGold", amount: 45 }, { op: "RemoveSelectedCard" }] },
        { id: "partial",  label: "Suppress it — Lose 8 HP, +20g",          ops: [{ op: "LoseHP", amount: 8 }, { op: "GainGold", amount: 20 }] },
        { id: "ignore",   label: "Ignore it",                               ops: [] },
      ],
    },

    "BlackMarketDeal": {
      id: "BlackMarketDeal",
      title: "Black Market",
      icon: "💀",
      text: "Someone's offloading stolen data. Probably dirty. Definitely tempting.",
      choices: [
        { id: "bulk",    label: "Buy bulk — Lose 15 HP: +90g",   ops: [{ op: "LoseHP", amount: 15 }, { op: "GainGold", amount: 90 }] },
        { id: "quick",   label: "Quick deal — Lose 6 HP: +40g",  ops: [{ op: "LoseHP", amount: 6  }, { op: "GainGold", amount: 40 }] },
        { id: "pass",    label: "Walk away",                      ops: [] },
      ],
    },

    "AbandonedLab": {
      id: "AbandonedLab",
      title: "Abandoned Lab",
      icon: "🔬",
      text: "Mutation equipment, still running. The previous researcher left in a hurry.",
      choices: [
        { id: "accelerate", label: "Accelerate mutation — Accelerate a card",  ops: [{ op: "AccelerateSelectedCard" }] },
        { id: "stabilise",  label: "Stabilise — Stabilise a card",             ops: [{ op: "StabiliseSelectedCard" }] },
        { id: "trash",      label: "Gut the machine — Remove a card, +35g",    ops: [{ op: "GainGold", amount: 35 }, { op: "RemoveSelectedCard" }] },
        { id: "leave",      label: "Don't touch anything",                      ops: [] },
      ],
    },

    "SystemRestore": {
      id: "SystemRestore",
      title: "Emergency Backup",
      icon: "💊",
      text: "Emergency backup systems flicker to life. You've got a few minutes before they die.",
      choices: [
        { id: "full",    label: "Full restore — Heal 30 HP",                    ops: [{ op: "Heal", amount: 30 }] },
        { id: "repair",  label: "Selective repair — Repair a card",             ops: [{ op: "RepairSelectedCard" }] },
        { id: "boost",   label: "Push systems — +4 MP, Lose 10 HP",            ops: [{ op: "GainMP", amount: 4 }, { op: "LoseHP", amount: 10 }] },
      ],
    },

    "CorporateSpy": {
      id: "CorporateSpy",
      title: "Corporate Spy",
      icon: "🕵️",
      text: "A corp agent offers information — and a deal. Always a catch.",
      choices: [
        { id: "intel",   label: "Buy intel — 25g: Heal 15, +2 MP",              ops: [{ op: "LoseGold", amount: 25 }, { op: "Heal", amount: 15 }, { op: "GainMP", amount: 2 }] },
        { id: "extort",  label: "Extort them — Take 10 damage: +70g",           ops: [{ op: "LoseHP", amount: 10 }, { op: "GainGold", amount: 70 }] },
        { id: "walk",    label: "Ghost them",                                    ops: [] },
      ],
    },

    "BionicUpgrade": {
      id: "BionicUpgrade",
      title: "Bionic Upgrade",
      icon: "⚙️",
      text: "Illegal bionic augmentations. Pain is temporary. Power is… also temporary, probably.",
      choices: [
        { id: "max_hp",   label: "Reinforce chassis — Lose 20g: +5 Max HP",     ops: [{ op: "LoseGold", amount: 20 }, { op: "GainMaxHP", amount: 5 }] },
        { id: "hp_heal",  label: "Patch wounds — Lose 15g: Heal 25",            ops: [{ op: "LoseGold", amount: 15 }, { op: "Heal", amount: 25 }] },
        { id: "decline",  label: "No thanks",                                    ops: [] },
      ],
    },

    // ── Deck-culling events (conditional on deck size) ────────────────────────

    "DataPurge": {
      id: "DataPurge",
      title: "Fragmentation Alert",
      icon: "🗂️",
      text: "Your deck is bloated with redundant processes. Purge one voluntarily — but defrag will auto-scrap another alongside it.",
      deckSizeMin: 40,
      repeatable: true,
      choices: [
        { id: "purge", label: "Defrag — Remove a card (+ 1 random also removed)", ops: [{ op: "RemoveSelectedCardAndRandom" }] },
        { id: "leave", label: "Leave it", ops: [] },
      ],
    },

    // MassPurge, DataFence, TriviaChallenge, PatternMemory are handled
    // as special-case events (custom UI, no standard choices array needed).

    "MassPurge": {
      id: "MassPurge",
      title: "System Wipe",
      icon: "💣",
      text: "Your deck has reached critical mass. Select every card you want purged — the system will mirror your cull with an equal random sweep.",
      deckSizeMin: 50,
      choices: [],    // custom UI
    },

    // ── Energy / health events ────────────────────────────────────────────────

    "PowerDrain": {
      id: "PowerDrain",
      title: "Energy Siphon",
      icon: "🔋",
      text: "A power tap offers to convert a card's RAM allocation directly into your system health. The card is gone — but you feel better.",
      repeatable: true,
      choices: [
        { id: "siphon", label: "Siphon — Remove a card, gain HP equal to its RAM × 3", ops: [{ op: "FeedSelectedCardForHP" }] },
        { id: "leave",  label: "Leave",                                                  ops: [] },
      ],
    },

    // ── Mutation surgery events (require at least one mutated card) ───────────

    "MutationClinic_MaxHP": {
      id: "MutationClinic_MaxHP",
      title: "Back-Alley Surgeon",
      icon: "⚗️",
      text: "A rogue bio-technician can extract a card's most recent mutation. Each procedure permanently reduces your maximum integrity.",
      requiresMutation: true,
      repeatable: true,
      choices: [
        { id: "extract", label: "Extract mutation (−1 Max HP per op)", ops: [{ op: "LoseMaxHP", amount: 1 }, { op: "RemoveLastMutation" }] },
        { id: "leave",   label: "Leave",                                ops: [] },
      ],
    },

    "MutationClinic_HP": {
      id: "MutationClinic_HP",
      title: "Mutation Suppressor",
      icon: "💉",
      text: "Experimental suppressants can flush a card's most recent mutation. Effective — but the treatment stings.",
      requiresMutation: true,
      repeatable: true,
      choices: [
        { id: "suppress", label: "Suppress mutation (−10 HP per op)", ops: [{ op: "LoseHP", amount: 10 }, { op: "RemoveLastMutation" }] },
        { id: "leave",    label: "Leave",                               ops: [] },
      ],
    },

    "MutationReroll": {
      id: "MutationReroll",
      title: "Spliced Signal",
      icon: "🎲",
      text: "A signal interceptor scrambles a card's most recent mutation into a new one of the same tier. Could be better. Could be worse.",
      requiresMutation: true,
      repeatable: true,
      choices: [
        { id: "splice", label: "Splice mutation (−2 HP per op)", ops: [{ op: "LoseHP", amount: 2 }, { op: "RerollLastMutation" }] },
        { id: "leave",  label: "Leave",                           ops: [] },
      ],
    },

    "MutationTuner": {
      id: "MutationTuner",
      title: "Variance Adjuster",
      icon: "🎛️",
      text: "A variance modulator shifts a card's most recent mutation to a random severity tier — up or down. Gamble carefully.",
      requiresMutation: true,
      repeatable: true,
      choices: [
        { id: "adjust", label: "Adjust tier (−5 HP per op)", ops: [{ op: "LoseHP", amount: 5 }, { op: "ShiftMutationTier" }] },
        { id: "leave",  label: "Leave",                       ops: [] },
      ],
    },

    // ── Vendor event ─────────────────────────────────────────────────────────

    "DataFence": {
      id: "DataFence",
      title: "The Fence",
      icon: "🤝",
      text: "A shifty broker who'll buy your unwanted cards at a fair price — and sells rare goods at a steep mark-up.",
      choices: [],    // custom UI
    },

    // ── Minigame events ───────────────────────────────────────────────────────

    "TriviaChallenge": {
      id: "TriviaChallenge",
      title: "Knowledge Probe",
      icon: "📡",
      text: "An automated system scans your tactical knowledge. Answer correctly for rewards; answer wrong for penalties. Escalates with each question.",
      choices: [],    // custom UI
    },

    "PatternMemory": {
      id: "PatternMemory",
      title: "Neural Calibration",
      icon: "🔲",
      text: "A neural calibration grid tests your memory. Observe the pattern, then reproduce it. Each round adds more tiles — and more at stake.",
      choices: [],    // custom UI
    },

  };

  return { events, pool: Object.keys(events) };
}

export function pickRandomEventId(reg, seed, ctx = {}) {
  const { deckSize = 0, hasMutations = false } = ctx;
  const rng = new RNG(seed ^ 0xE17E17);
  const eligible = reg.pool.filter(id => {
    const def = reg.events[id];
    if (!def) return false;
    if (def.deckSizeMin && deckSize < def.deckSizeMin) return false;
    if (def.requiresMutation && !hasMutations) return false;
    return true;
  });
  const pool = eligible.length > 0 ? eligible : reg.pool.filter(id => !!reg.events[id]);
  return rng.pick(pool);
}

export function applyEventChoiceImmediate(state, data, reg, choiceId) {
  if (!state.event || !state.run) return { needsDeckTarget: null };
  const def = reg.events[state.event.eventId];
  const choice = def?.choices.find(c => c.id === choiceId);
  if (!choice) return { needsDeckTarget: null };

  const deckOps = new Set([
    "RemoveSelectedCard", "RepairSelectedCard",
    "StabiliseSelectedCard", "AccelerateSelectedCard",
    "RemoveSelectedCardAndRandom", "FeedSelectedCardForHP",
    "RemoveLastMutation", "RerollLastMutation", "ShiftMutationTier",
  ]);

  for (const op of choice.ops) {
    if (deckOps.has(op.op)) return { needsDeckTarget: op };

    switch (op.op) {
      case "GainGold":   state.run.gold   = (state.run.gold   || 0) + op.amount; break;
      case "LoseGold":   state.run.gold   = Math.max(0, (state.run.gold || 0) - op.amount); break;
      case "Heal":       state.run.hp     = Math.min(state.run.maxHP, (state.run.hp || 0) + op.amount); break;
      case "LoseHP":     state.run.hp     = Math.max(0, (state.run.hp || 0) - op.amount); break;
      case "GainMP":     state.run.mp     = Math.min(state.run.maxMP || 99, (state.run.mp || 0) + op.amount); break;
      case "LoseMP":     state.run.mp     = Math.max(0, (state.run.mp || 0) - op.amount); break;
      case "GainMaxHP":  state.run.maxHP  = (state.run.maxHP || 50) + op.amount; break;
      case "LoseMaxHP":  state.run.maxHP  = Math.max(1, (state.run.maxHP || 50) - op.amount); break;
      default: break;
    }
  }

  return { needsDeckTarget: null };
}
