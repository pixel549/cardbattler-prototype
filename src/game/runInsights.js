function getDeckPayload(deckOrState) {
  if (!deckOrState) return { master: [], cardInstances: {} };
  if (Array.isArray(deckOrState.master) || deckOrState.cardInstances) {
    return {
      master: Array.isArray(deckOrState.master) ? deckOrState.master : [],
      cardInstances: deckOrState.cardInstances || {},
    };
  }
  return {
    master: Array.isArray(deckOrState?.deck?.master) ? deckOrState.deck.master : [],
    cardInstances: deckOrState?.deck?.cardInstances || {},
  };
}

function getMutationData(data, mutationId) {
  return mutationId ? data?.mutations?.[mutationId] || null : null;
}

function isNegativeMutation(data, mutationId) {
  const mutation = getMutationData(data, mutationId);
  if (!mutation) return false;
  if (typeof mutation.isNegative === "boolean") return mutation.isNegative;
  const tier = String(mutation.tier || "").toLowerCase();
  return tier === "glitch" || tier === "junk" || tier === "brick" || tier === "curse";
}

export function analyzeDeckState(data, deckOrState) {
  const deck = getDeckPayload(deckOrState);
  const cards = [];
  const defCounts = {};

  for (const instanceId of deck.master || []) {
    const instance = deck.cardInstances?.[instanceId];
    if (!instance) continue;
    const def = data?.cards?.[instance.defId] || null;
    const appliedMutations = Array.isArray(instance.appliedMutations) ? instance.appliedMutations : [];
    const negativeMutations = appliedMutations.filter((mutationId) => isNegativeMutation(data, mutationId));
    const mutated = appliedMutations.length > 0 || !!instance.finalMutationId;
    const unstable = mutated && (
      Number(instance.useCounter ?? 99) <= 2
      || Number(instance.finalMutationCountdown ?? 99) <= 3
      || negativeMutations.length >= 2
    );
    const bricked = instance.finalMutationId === "J_BRICK"
      || (mutated && Number(instance.useCounter ?? 99) <= 0)
      || (negativeMutations.length >= 2 && Number(instance.finalMutationCountdown ?? 99) <= 2);
    const entry = {
      instanceId,
      defId: instance.defId,
      def,
      appliedMutations,
      negativeMutations,
      mutated,
      unstable,
      bricked,
      compiled: Number(instance.compileLevel || 0) > 0,
      isCore: !!def?.tags?.includes("Core"),
      isPower: !!(def?.type === "Power" || def?.tags?.includes("Power")),
      isCurse: !!def?.tags?.includes("Curse"),
      cost: Number(def?.costRAM || 0) + Number(instance.ramCostDelta || 0),
    };
    cards.push(entry);
    defCounts[entry.defId] = (defCounts[entry.defId] || 0) + 1;
  }

  const mutatedCards = cards.filter((card) => card.mutated);
  const unstableCards = cards.filter((card) => card.unstable);
  const brickedCards = cards.filter((card) => card.bricked);
  const curseCards = cards.filter((card) => card.isCurse);
  const duplicates = Object.entries(defCounts)
    .filter(([, count]) => count >= 2)
    .map(([defId, count]) => ({ defId, count }));

  return {
    totalCards: cards.length,
    mutatedCount: mutatedCards.length,
    unstableCount: unstableCards.length,
    brickedCount: brickedCards.length,
    curseCount: curseCards.length,
    compiledCount: cards.filter((card) => card.compiled).length,
    coreCount: cards.filter((card) => card.isCore).length,
    powerCount: cards.filter((card) => card.isPower).length,
    expensiveCount: cards.filter((card) => card.cost >= 3).length,
    duplicates,
    cards,
    mutatedCards,
    unstableCards,
    brickedCards,
    curseCards,
    mutatedInstanceIds: mutatedCards.map((card) => card.instanceId),
    unstableInstanceIds: unstableCards.map((card) => card.instanceId),
    brickedInstanceIds: brickedCards.map((card) => card.instanceId),
    curseInstanceIds: curseCards.map((card) => card.instanceId),
  };
}

export function getFactionRep(run) {
  return {
    ghosts: Number(run?.factionRep?.ghosts || 0),
    architects: Number(run?.factionRep?.architects || 0),
    scrappers: Number(run?.factionRep?.scrappers || 0),
  };
}

export function getHighestFaction(run) {
  const rep = getFactionRep(run);
  return Object.entries(rep)
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })[0]?.[0] || "ghosts";
}
