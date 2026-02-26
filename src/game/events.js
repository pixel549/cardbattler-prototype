import { RNG } from "./rng";

export function createBasicEventRegistry() {
  const events = {
    "StreetDoc": {
      id: "StreetDoc",
      title: "Street Doc",
      text: "A back-alley clinic offers patch jobs… for a price.",
      choices: [
        { id: "pay_heal", label: "Pay 40g: Heal 12", ops: [{ op: "LoseGold", amount: 40 }, { op: "Heal", amount: 12 }] },
        { id: "free_repair", label: "Let them tinker: Repair a card", ops: [{ op: "RepairSelectedCard" }] },
        { id: "leave", label: "Leave", ops: [] }
      ]
    },
    "DataCache": {
      id: "DataCache",
      title: "Data Cache",
      text: "An unsecured cache. Risky to access, profitable if clean.",
      choices: [
        { id: "grab_gold", label: "Grab it: Gain 60g, Accelerate a card", ops: [{ op: "GainGold", amount: 60 }, { op: "AccelerateSelectedCard" }] },
        { id: "play_safe", label: "Play safe: Gain 20g", ops: [{ op: "GainGold", amount: 20 }] }
      ]
    }
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
  const choice = def.choices.find(c => c.id === choiceId);
  if (!choice) return { needsDeckTarget: null };

  for (const op of choice.ops) {
    if (["RemoveSelectedCard","RepairSelectedCard","StabiliseSelectedCard","AccelerateSelectedCard"].includes(op.op)) {
      return { needsDeckTarget: op };
    }
    switch (op.op) {
      case "GainGold": state.run.gold += op.amount; break;
      case "LoseGold": state.run.gold = Math.max(0, state.run.gold - op.amount); break;
      case "Heal": state.run.hp = Math.min(state.run.maxHP, state.run.hp + op.amount); break;
      case "LoseHP": state.run.hp = Math.max(0, state.run.hp - op.amount); break;
      case "GainMP": state.run.mp = Math.min(state.run.maxMP, state.run.mp + op.amount); break;
      case "LoseMP": state.run.mp = Math.max(0, state.run.mp - op.amount); break;
      default: break;
    }
  }

  return { needsDeckTarget: null };
}
