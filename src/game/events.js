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

    // ── New events ───────────────────────────────────────────────────────────

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

  };

  return { events, pool: Object.keys(events) };
}

export function pickRandomEventId(reg, seed) {
  const rng = new RNG(seed ^ 0xE17E17);
  return rng.pick(reg.pool);
}

export function applyEventChoiceImmediate(state, data, reg, choiceId) {
  if (!state.event || !state.run) return { needsDeckTarget: null };
  const def = reg.events[state.event.eventId];
  const choice = def?.choices.find(c => c.id === choiceId);
  if (!choice) return { needsDeckTarget: null };

  const deckOps = new Set([
    "RemoveSelectedCard", "RepairSelectedCard",
    "StabiliseSelectedCard", "AccelerateSelectedCard",
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
