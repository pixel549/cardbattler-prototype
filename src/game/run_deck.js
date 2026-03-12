import { RNG } from "./rng.js";

function uid(rng, prefix) { return `${prefix}_${rng.nextUint().toString(16)}`; }

// The finalMutationCountdown and useCounter come from gamedata.json, but every
// card currently has them equal â€” meaning the final mutation fires simultaneously
// with the very first guaranteed mutation cycle, so cards only ever get one
// mutation before bricking.  We enforce a minimum 3Ã— ratio here so cards
// survive at least three full useCounter cycles (= ~3 guaranteed mutations)
// before the final mutation.  This gives a meaningful progression over the
// 10-encounter-deep act maps.
function mkInstance(def, instanceId) {
  const uc = def.defaultUseCounter              ?? 12;
  const fc = def.defaultFinalMutationCountdown  ?? 8;
  return {
    instanceId,
    defId: def.id,
    useCounter:             uc,
    finalMutationCountdown: Math.max(fc, uc * 3),  // â† at least 3 mutation cycles
    appliedMutations:       [],
    finalMutationId:        null,
    ramCostDelta:           0,
    removeFromRunOnCombatEnd: false,
  };
}

export function createRunDeckFromDefs(data, seed, deckDefIds) {
  const rng = new RNG(seed ^ 0x1234abcd);
  const cardInstances = {};
  const master = [];

  for (const defId of deckDefIds) {
    const def = data.cards[defId];
    if (!def) throw new Error(`Missing card def: ${defId}`);

    const instanceId = uid(rng, "rc");
    cardInstances[instanceId] = mkInstance(def, instanceId);
    master.push(instanceId);
  }

  return { cardInstances, master };
}

export function addCardToRunDeck(data, runDeck, rng, defId) {
  const def = data.cards[defId];
  if (!def) throw new Error(`Missing card def: ${defId}`);
  const instanceId = uid(rng, "rc");

  runDeck.cardInstances[instanceId] = mkInstance(def, instanceId);
  runDeck.master.push(instanceId);
}

export function removeCardFromRunDeck(runDeck, instanceId) {
  delete runDeck.cardInstances[instanceId];
  runDeck.master = runDeck.master.filter(id => id !== instanceId);
}
