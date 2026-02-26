import { RNG } from "./rng";

function uid(rng, prefix) { return `${prefix}_${rng.nextUint().toString(16)}`; }

export function createRunDeckFromDefs(data, seed, deckDefIds) {
  const rng = new RNG(seed ^ 0x1234abcd);
  const cardInstances = {};
  const master = [];

  for (const defId of deckDefIds) {
    const def = data.cards[defId];
    if (!def) throw new Error(`Missing card def: ${defId}`);

    const instanceId = uid(rng, "rc");
    cardInstances[instanceId] = {
      instanceId,
      defId,
      useCounter: def.defaultUseCounter ?? 12,
      finalMutationCountdown: def.defaultFinalMutationCountdown ?? 8,
      appliedMutations: [],
      finalMutationId: null,
      ramCostDelta: 0,
      removeFromRunOnCombatEnd: false
    };
    master.push(instanceId);
  }

  return { cardInstances, master };
}

export function addCardToRunDeck(data, runDeck, rng, defId) {
  const def = data.cards[defId];
  if (!def) throw new Error(`Missing card def: ${defId}`);
  const instanceId = uid(rng, "rc");

  runDeck.cardInstances[instanceId] = {
    instanceId,
    defId,
    useCounter: def.defaultUseCounter ?? 12,
    finalMutationCountdown: def.defaultFinalMutationCountdown ?? 8,
    appliedMutations: [],
    finalMutationId: null,
    ramCostDelta: 0,
    removeFromRunOnCombatEnd: false
  };
  runDeck.master.push(instanceId);
}

export function removeCardFromRunDeck(runDeck, instanceId) {
  delete runDeck.cardInstances[instanceId];
  runDeck.master = runDeck.master.filter(id => id !== instanceId);
}
