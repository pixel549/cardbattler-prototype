import { RNG } from "./rng.js";
import { push } from "./log.js";
import { createInitialState as _init } from "./game_state.js";
import { createRunDeckFromDefs, addCardToRunDeck } from "./run_deck.js";
import { pickEncounter } from "./encounters.js";
import { startCombatFromRunDeck, dispatchCombat, forceNewMutation } from "./engine.js";
import { makeRelicChoices } from "./relic_rewards.js";
import { getRunMods } from "./rules_mods.js";
import { createBasicEventRegistry, applyEventChoiceImmediate, pickContextualEventId } from "./events.js";
import { getMinigameRewards, getMinigamePoolForAct } from "./minigames.js";
import { decodeDebugSeed, decodeSensibleDebugSeed } from "./debugSeed.js";
import { getCardBalanceMeta } from "./card_balance.js";
import { getStarterProfile, resolveStarterProfileDeck } from "./runProfiles.js";
import { getCompilePreview, applyCompileToCardInstance } from "./cardCompile.js";
import { analyzeDeckState } from "./runInsights.js";
import {
  createRunAdaptationProfile,
  getHeatState,
  normalizeRunAdaptationProfile,
  recordCardPlayForAdaptation,
} from "./combatMeta.js";
import {
  createRunTelemetry,
  ensureRunTelemetry,
  incrementRunTelemetry,
  maxRunTelemetry,
  trackRunScrapSpend,
} from "./runTelemetry.js";
import {
  isCardUnlockedByAchievements,
  isRelicUnlockedByAchievements,
} from "./achievements.js";

const EVENT_REG = createBasicEventRegistry();

function clone(x) { return structuredClone(x); }
function uid(rng, prefix) { return `${prefix}_${rng.nextUint().toString(16)}`; }

export function getCardUseCounterLimit(data, ci) {
  const def = data?.cards?.[ci?.defId];
  let maxUse = Number(def?.defaultUseCounter ?? 12);
  for (const mid of ci?.appliedMutations || []) {
    maxUse += Number(data?.mutations?.[mid]?.useCounterDelta ?? 0);
  }
  return Math.max(1, Number.isFinite(maxUse) ? maxUse : 12);
}

export function getCardFinalCountdownBase(data, ci) {
  const def = data?.cards?.[ci?.defId];
  const baseUse = Number(def?.defaultUseCounter ?? 12);
  const baseFinal = Number(def?.defaultFinalMutationCountdown ?? 8);
  return Math.max(
    Number.isFinite(baseFinal) ? baseFinal : 8,
    (Number.isFinite(baseUse) ? baseUse : 12) * 3,
  );
}

export function normalizeDeckServiceId(rawId) {
  switch (rawId) {
    case "RemoveSelectedCard":
      return "RemoveCard";
    case "RepairSelectedCard":
      return "Repair";
    case "StabiliseSelectedCard":
      return "Stabilise";
    case "AccelerateSelectedCard":
      return "Accelerate";
    case "CompileSelectedCard":
      return "Compile";
    case "ForgeSelectedCard":
      return "Forge";
    default:
      return rawId ?? null;
  }
}

const REPEATABLE_SHOP_SERVICE_IDS = new Set(["Repair", "Stabilise", "Accelerate"]);

function isRepeatableShopService(serviceId) {
  return REPEATABLE_SHOP_SERVICE_IDS.has(normalizeDeckServiceId(serviceId));
}

function getCardUseCounterState(data, ci) {
  const maxValue = getCardUseCounterLimit(data, ci);
  const currentValue = Math.max(0, Math.min(maxValue, Number(ci?.useCounter ?? maxValue)));
  return { currentValue, maxValue };
}

function getCardFinalCountdownState(data, ci) {
  const baseValue = getCardFinalCountdownBase(data, ci);
  const currentValue = Math.max(0, Math.min(999, Number(ci?.finalMutationCountdown ?? baseValue)));
  return { currentValue, baseValue, maxValue: 999 };
}

function getTenPercentDelta(value) {
  const currentValue = Math.max(0, Number(value ?? 0));
  if (currentValue <= 0) return 0;
  return Math.max(1, Math.round(currentValue * 0.1));
}

function previewMutationClockScale(data, ci, direction = "up") {
  const useState = getCardUseCounterState(data, ci);
  const finalState = getCardFinalCountdownState(data, ci);
  const useDelta = getTenPercentDelta(useState.currentValue);
  const finalDelta = getTenPercentDelta(finalState.currentValue);
  const increase = direction === "up";
  const nextUseCounter = increase
    ? Math.max(0, Math.min(useState.maxValue, useState.currentValue + useDelta))
    : Math.max(0, Math.min(useState.maxValue, useState.currentValue - useDelta));
  const nextFinalCountdown = increase
    ? Math.max(0, Math.min(finalState.maxValue, finalState.currentValue + finalDelta))
    : Math.max(0, Math.min(finalState.maxValue, finalState.currentValue - finalDelta));

  return {
    currentUseCounter: useState.currentValue,
    nextUseCounter,
    maxUseCounter: useState.maxValue,
    useCounterChange: nextUseCounter - useState.currentValue,
    currentFinalCountdown: finalState.currentValue,
    nextFinalCountdown,
    finalCountdownChange: nextFinalCountdown - finalState.currentValue,
    changed: nextUseCounter !== useState.currentValue || nextFinalCountdown !== finalState.currentValue,
  };
}

function previewRepairMutationRemoval(data, ci) {
  const mutationIds = Array.isArray(ci?.appliedMutations) ? ci.appliedMutations : [];
  const removedMutationId = mutationIds[mutationIds.length - 1] ?? null;
  if (!removedMutationId) {
    return {
      eligible: false,
      reason: "No applied mutations to remove.",
    };
  }

  const removedMutation = data?.mutations?.[removedMutationId] ?? null;
  const nextAppliedMutations = mutationIds.slice(0, -1);
  const useState = getCardUseCounterState(data, ci);
  const finalState = getCardFinalCountdownState(data, ci);
  const nextUseCounterMax = getCardUseCounterLimit(data, { ...ci, appliedMutations: nextAppliedMutations });
  const nextUseCounter = Math.max(
    0,
    Math.min(
      nextUseCounterMax,
      useState.currentValue - Number(removedMutation?.useCounterDelta ?? 0),
    ),
  );
  const nextFinalCountdown = Math.max(
    0,
    Math.min(
      finalState.maxValue,
      finalState.currentValue - Number(removedMutation?.finalCountdownDelta ?? 0),
    ),
  );

  return {
    eligible: true,
    removedMutationId,
    removedMutationName: removedMutation?.name ?? removedMutationId,
    currentMutationCount: mutationIds.length,
    nextMutationCount: nextAppliedMutations.length,
    nextAppliedMutations,
    currentUseCounter: useState.currentValue,
    nextUseCounter,
    maxUseCounter: nextUseCounterMax,
    currentFinalCountdown: finalState.currentValue,
    nextFinalCountdown,
    currentRamCostDelta: Number(ci?.ramCostDelta ?? 0),
    nextRamCostDelta: Number(ci?.ramCostDelta ?? 0) - Number(removedMutation?.ramCostDelta ?? 0),
  };
}

function getShopOfferPrice(offer) {
  return Math.max(0, Number(offer?.price ?? 0));
}

function getOfferCurrency(offer) {
  return offer?.currency === "scrap" ? "scrap" : "gold";
}

function getRunCurrencyAmount(run, currency = "gold") {
  if (!run) return 0;
  if (currency === "scrap") return Math.max(0, Number(run.scrap || 0));
  return Math.max(0, Number(run.gold || 0));
}

function canAffordRunCurrency(run, amount, currency = "gold") {
  return getRunCurrencyAmount(run, currency) >= Math.max(0, Number(amount || 0));
}

function addRunCurrency(run, amount, currency = "gold") {
  if (!run) return 0;
  const gain = Math.max(0, Number(amount || 0));
  if (currency === "scrap") {
    run.scrap = Math.max(0, Number(run.scrap || 0) + gain);
    return run.scrap;
  }
  run.gold = Math.max(0, Number(run.gold || 0) + gain);
  return run.gold;
}

function spendRunCurrency(run, amount, currency = "gold", source = "service") {
  const cost = Math.max(0, Number(amount || 0));
  if (!canAffordRunCurrency(run, cost, currency)) return false;
  if (currency === "scrap") {
    run.scrap = Math.max(0, Number(run.scrap || 0) - cost);
    trackRunScrapSpend(run, cost, source);
    return true;
  }
  run.gold = Math.max(0, Number(run.gold || 0) - cost);
  return true;
}

function formatCurrencyForLog(amount, currency = "gold") {
  const safeAmount = Math.max(0, Number(amount || 0));
  return currency === "scrap" ? `${safeAmount} scrap` : `${safeAmount}g`;
}

function salvageRemovedCard(state, ci, log, reason = "salvaged") {
  if (!ci || ci.finalMutationId !== "J_BRICK") return 0;
  addRunCurrency(state.run, 2, "scrap");
  log?.({ t: "Info", msg: `Recovered 2 scrap from ${ci.defId} (${reason})` });
  return 2;
}

function syncRunDeckTelemetry(state, data) {
  if (!state?.run || !state?.deck || !data) return null;
  const telemetry = ensureRunTelemetry(state.run);
  const analysis = analyzeDeckState(data, state);
  telemetry.currentCurseCount = analysis.curseCount;
  telemetry.peakCurseCount = Math.max(Number(telemetry.peakCurseCount || 0), analysis.curseCount);
  telemetry.currentCompiledCount = analysis.compiledCount;
  telemetry.peakCompiledCount = Math.max(Number(telemetry.peakCompiledCount || 0), analysis.compiledCount);
  telemetry.currentBrickedCount = analysis.brickedCount;
  telemetry.peakBrickedCount = Math.max(Number(telemetry.peakBrickedCount || 0), analysis.brickedCount);
  telemetry.highestActReached = Math.max(
    Number(telemetry.highestActReached || 1),
    Number(state.run.act || 1),
  );
  return analysis;
}

function getCardRuntimeCost(cardDef, instance) {
  return Math.max(0, Number(cardDef?.costRAM || 0) + Number(instance?.ramCostDelta || 0));
}

function syncRunCombatTelemetry(state) {
  if (!state?.run || !state?.combat) return ensureRunTelemetry(state?.run);
  const telemetry = ensureRunTelemetry(state.run);
  const heatState = getHeatState(state.combat.heat, state.combat.maxHeat);
  maxRunTelemetry(state.run, "peakHeat", heatState.heat);
  return telemetry;
}

function recordRunTurnPressure(state, data) {
  if (!state?.run || !state?.combat || !data) return null;
  const player = state.combat.player;
  if (!player) return null;
  const telemetry = syncRunCombatTelemetry(state);
  const currentRam = Math.max(0, Number(player.ram || 0));
  if (currentRam <= 1) incrementRunTelemetry(state.run, "lowRamTurns", 1);
  if (getHeatState(state.combat.heat, state.combat.maxHeat).alertLevel >= 3) {
    incrementRunTelemetry(state.run, "criticalHeatTurns", 1);
  }
  const hand = Array.isArray(player.piles?.hand) ? player.piles.hand : [];
  if (!hand.length) return telemetry;

  const affordableCardExists = hand.some((cardInstanceId) => {
    const instance = state.combat.cardInstances?.[cardInstanceId];
    if (!instance) return false;
    const cardDef = data?.cards?.[instance.defId];
    if (!cardDef || instance.finalMutationId === "J_BRICK") return false;
    return getCardRuntimeCost(cardDef, instance) <= currentRam;
  });
  if (!affordableCardExists) incrementRunTelemetry(state.run, "ramStarvedTurns", 1);
  return telemetry;
}

function getRunUnlockedCardIds(run) {
  return Array.isArray(run?.metaUnlocks?.cardIds) ? run.metaUnlocks.cardIds : [];
}

function getRunUnlockedRelicIds(run) {
  return Array.isArray(run?.metaUnlocks?.relicIds) ? run.metaUnlocks.relicIds : [];
}

function isEndlessRun(run) {
  return Array.isArray(run?.challengeIds) && run.challengeIds.includes("endless_protocol");
}

function getContentActForRun(run) {
  return Math.max(1, Math.min(MAX_ACTS, Number(run?.debugOverrides?.actOverride ?? run?.act ?? 1)));
}

function getEndlessDepth(run) {
  return Math.max(0, Number(run?.act ?? 1) - MAX_ACTS);
}

function buildCombatDebugOverrides(run) {
  const base = run?.debugOverrides ? { ...run.debugOverrides } : {};
  if (!isEndlessRun(run)) return Object.keys(base).length > 0 ? base : null;

  const depth = getEndlessDepth(run);
  if (depth <= 0) return Object.keys(base).length > 0 ? base : null;

  const hpMult = Number(base.enemyHpMult ?? 1);
  const dmgMult = Number(base.enemyDmgMult ?? 1);
  const drawDelta = Number(base.drawPerTurnDelta ?? 0);
  const finalDelta = Number(base.finalCountdownTickDelta ?? 0);
  const mutationMult = Number(base.mutationTriggerChanceMult ?? 1);

  base.enemyHpMult = Number((hpMult * (1 + depth * 0.14)).toFixed(2));
  base.enemyDmgMult = Number((dmgMult * (1 + depth * 0.1)).toFixed(2));
  base.drawPerTurnDelta = drawDelta - Math.floor(depth / 3);
  base.finalCountdownTickDelta = finalDelta + Math.floor((depth + 1) / 2);
  base.mutationTriggerChanceMult = Number((mutationMult * (1 + depth * 0.08)).toFixed(2));

  return base;
}

function markShopCardOfferSold(shop, defId) {
  if (!shop?.offers || !defId) return;
  for (const offer of shop.offers) {
    if (offer?.kind === "Card" && offer?.defId === defId) offer.sold = true;
  }
}

function getShopServiceOffer(shop, serviceId, offerIndex = null) {
  const normalizedId = normalizeDeckServiceId(serviceId);
  if (Number.isInteger(offerIndex)) {
    const indexedOffer = shop?.offers?.[offerIndex];
    if (indexedOffer?.kind === "Service" && normalizeDeckServiceId(indexedOffer.serviceId) === normalizedId) {
      return indexedOffer;
    }
  }
  return (shop?.offers || []).find(
    (offer) => offer?.kind === "Service" && normalizeDeckServiceId(offer.serviceId) === normalizedId,
  ) || null;
}

function advanceRepeatableShopServiceOffer(shop, serviceId, offerIndex = null, paidPrice = null) {
  if (!isRepeatableShopService(serviceId)) return;
  const offer = getShopServiceOffer(shop, serviceId, offerIndex);
  if (!offer) return;
  const currentPrice = Math.max(0, Number(paidPrice ?? offer.price ?? offer.basePrice ?? 0));
  offer.basePrice = Math.max(0, Number(offer.basePrice ?? currentPrice));
  offer.timesPurchased = Math.max(0, Number(offer.timesPurchased ?? 0)) + 1;
  offer.price = Math.max(0, Math.ceil(currentPrice * 2));
}

function getServiceCardPreview(serviceId, data, ci) {
  const normalizedId = normalizeDeckServiceId(serviceId);
  if (!ci) {
    return { serviceId: normalizedId, eligible: false, reason: "Card missing." };
  }
  if (ci.finalMutationId && normalizedId !== "RemoveCard") {
    return {
      serviceId: normalizedId,
      eligible: false,
      reason: "Final mutation cards cannot use this service.",
    };
  }

  if (normalizedId === "RemoveCard") {
    return {
      serviceId: normalizedId,
      eligible: true,
      summary: "Remove this card from your deck permanently.",
      reason: null,
    };
  }

  if (normalizedId === "Repair") {
    const preview = previewRepairMutationRemoval(data, ci);
    return {
      serviceId: normalizedId,
      ...preview,
      summary: preview.eligible
        ? `Remove latest mutation (${preview.removedMutationName}). Use ${preview.currentUseCounter} -> ${preview.nextUseCounter}/${preview.maxUseCounter}; final ${preview.currentFinalCountdown} -> ${preview.nextFinalCountdown}.`
        : "No applied mutations to remove.",
      reason: preview.eligible ? null : preview.reason,
    };
  }

  if (normalizedId === "Stabilise") {
    const preview = previewMutationClockScale(data, ci, "up");
    return {
      serviceId: normalizedId,
      ...preview,
      eligible: preview.changed,
      summary: preview.changed
        ? `Extend mutation clocks by 10%. Use ${preview.currentUseCounter} -> ${preview.nextUseCounter}/${preview.maxUseCounter}; final ${preview.currentFinalCountdown} -> ${preview.nextFinalCountdown}.`
        : "Mutation clocks are already at their ceiling.",
      reason: preview.changed ? null : "Mutation clocks are already at their ceiling.",
    };
  }

  if (normalizedId === "Accelerate") {
    const preview = previewMutationClockScale(data, ci, "down");
    return {
      serviceId: normalizedId,
      ...preview,
      eligible: preview.changed,
      summary: preview.changed
        ? `Reduce mutation clocks by 10%. Use ${preview.currentUseCounter} -> ${preview.nextUseCounter}/${preview.maxUseCounter}; final ${preview.currentFinalCountdown} -> ${preview.nextFinalCountdown}.`
        : "Mutation clocks are already at zero.",
      reason: preview.changed ? null : "Mutation clocks are already at zero.",
    };
  }

  if (normalizedId === "Compile") {
    const preview = getCompilePreview(data?.cards?.[ci?.defId], ci);
    return {
      serviceId: normalizedId,
      ...preview,
      summary: preview.summary,
      reason: preview.reason,
    };
  }

  if (normalizedId === "Forge") {
    const compilePreview = getCompilePreview(data?.cards?.[ci?.defId], ci);
    const repairPreview = previewRepairMutationRemoval(data, ci);
    const stabilisePreview = previewMutationClockScale(data, ci, "up");
    const steps = [];
    if (repairPreview.eligible) steps.push("strip the latest mutation");
    if (compilePreview.eligible) steps.push("compile the card");
    if (stabilisePreview.changed) steps.push("stabilise its clocks");
    return {
      serviceId: normalizedId,
      eligible: steps.length > 0,
      steps,
      summary: steps.length > 0
        ? `Reforge this card: ${steps.join(", ")}.`
        : "Nothing on this card can be reforged right now.",
      reason: steps.length > 0 ? null : "Nothing on this card can be reforged right now.",
      compilePreview,
      repairPreview,
      stabilisePreview,
    };
  }

  return {
    serviceId: normalizedId,
    eligible: false,
    reason: "Unknown service.",
  };
}

export function getServiceTargetPreview(serviceId, state, data, instanceId = null) {
  const normalizedId = normalizeDeckServiceId(serviceId);
  if (normalizedId === "Heal") {
    const maxHP = state?.run?.maxHP ?? 0;
    const currentHP = state?.run?.hp ?? 0;
    const baseAmount = Math.ceil(maxHP * 0.25);
    const amount = Math.max(0, Math.min(baseAmount, maxHP - currentHP));
    return {
      serviceId: normalizedId,
      eligible: amount > 0,
      amount,
      baseAmount,
      currentValue: currentHP,
      maxValue: maxHP,
      summary: amount > 0
        ? `Restore ${amount} HP now (${baseAmount} max, capped at full).`
        : "Already at full HP.",
      reason: amount > 0 ? null : "Already at full HP.",
    };
  }

  const ci = instanceId ? state?.deck?.cardInstances?.[instanceId] : null;
  const def = data?.cards?.[ci?.defId];
  if (!def || def.tags?.includes("EnemyCard")) {
    return {
      serviceId: normalizedId,
      eligible: false,
      reason: "This card cannot be targeted.",
    };
  }
  return {
    defId: ci?.defId ?? null,
    name: def?.name ?? ci?.defId ?? instanceId ?? null,
    ...getServiceCardPreview(normalizedId, data, ci),
  };
}

export function getServiceOfferPreview(serviceId, state, data) {
  const normalizedId = normalizeDeckServiceId(serviceId);
  if (normalizedId === "Heal") {
    const preview = getServiceTargetPreview(normalizedId, state, data);
    return {
      ...preview,
      serviceId: normalizedId,
      targeted: false,
      available: preview.eligible,
      detail: preview.eligible ? "Applies immediately." : "Unavailable while HP is already full.",
    };
  }

  const targetCards = (state?.deck?.master || [])
    .map((instanceId) => {
      const ci = state?.deck?.cardInstances?.[instanceId];
      const def = data?.cards?.[ci?.defId];
      if (!ci || !def || def.tags?.includes("EnemyCard")) return null;
      return {
        instanceId,
        defId: ci.defId,
        name: def.name ?? ci.defId ?? instanceId,
        ...getServiceCardPreview(normalizedId, data, ci),
      };
    })
    .filter(Boolean);

  const eligibleCount = targetCards.filter((entry) => entry.eligible).length;
  const countLabel = `${eligibleCount} eligible card${eligibleCount === 1 ? "" : "s"}`;
  const isScrapService = normalizedId === "Forge";
  const repeatableDetail = isRepeatableShopService(normalizedId)
    ? " Gold is charged when you apply the service. Cost doubles after each use in this shop."
    : (isScrapService ? " Scrap is charged when you apply the service." : " Gold is charged when you apply the service.");
  const genericDetail = targetCards.length > 0
    ? `${countLabel}.${repeatableDetail}`
    : "No cards are available to target.";

  let summary = "Choose a card.";
  if (normalizedId === "RemoveCard") {
    summary = "Choose 1 card and permanently delete it from your deck.";
  } else if (normalizedId === "Repair") {
    summary = "Choose 1 mutated non-final card. Remove its latest applied mutation.";
  } else if (normalizedId === "Stabilise") {
    summary = "Choose 1 non-final card. Extend its use and final mutation clocks by 10%.";
  } else if (normalizedId === "Accelerate") {
    summary = "Choose 1 non-final card. Reduce its use and final mutation clocks by 10%.";
  } else if (normalizedId === "Forge") {
    summary = "Choose 1 non-final card. Spend scrap to reforge it: repair, compile, and stabilise what you can.";
  }

  return {
    serviceId: normalizedId,
    targeted: true,
    available: eligibleCount > 0,
    eligibleCount,
    totalCount: targetCards.length,
    targetCards,
    summary,
    detail: eligibleCount > 0 ? genericDetail : "No eligible cards in your deck right now.",
  };
}

function pickWeighted(rng, weightedTypes) {
  const totalWeight = weightedTypes.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.int(totalWeight);
  for (const [type, weight] of weightedTypes) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return weightedTypes[weightedTypes.length - 1]?.[0] || "Combat";
}

function countTypes(types) {
  const counts = {};
  for (const type of types) counts[type] = (counts[type] || 0) + 1;
  return counts;
}

function replaceRandomType(types, rng, fromType, toType) {
  const candidates = [];
  for (let i = 0; i < types.length; i++) {
    if (types[i] === fromType) candidates.push(i);
  }
  if (candidates.length === 0) return false;
  types[candidates[rng.int(candidates.length)]] = toType;
  return true;
}

function getRowTypeWeights(row) {
  if (row === 6 || row === 12) return { Elite: 1 };
  if (row === 2) return { Combat: 3, Event: 1, Shop: 1, Rest: 2 };
  if (row === 7) return { Rest: 4, Shop: 2 };
  if (row === 5 || row === 10) return { Combat: 3, Event: 1, Shop: 1, Rest: 1, Compile: 2 };
  if (row === 13) return { Rest: 2, Shop: 2, Event: 2 };
  if (row <= 1) return { Combat: 4, Event: 1, Shop: 1 };
  return { Combat: 4, Event: 2, Shop: 2, Rest: 1, Compile: 1 };
}

function rebalanceRowTypes(row, types, rng, allowedTypes) {
  const recount = () => countTypes(types);

  if (row <= 2) {
    let counts = recount();
    while ((counts.Combat || 0) > 4) {
      const replacement = (counts.Event || 0) <= (counts.Shop || 0) ? "Event" : "Shop";
      if (!replaceRandomType(types, rng, "Combat", replacement)) break;
      counts = recount();
    }
    counts = recount();
    if ((counts.Event || 0) === 0) {
      replaceRandomType(types, rng, "Combat", "Event");
      counts = recount();
    }
    if ((counts.Shop || 0) === 0) {
      replaceRandomType(types, rng, "Combat", "Shop");
    }
  }

  if (row === 7) {
    const counts = recount();
    if ((counts.Rest || 0) === 0) replaceRandomType(types, rng, "Shop", "Rest");
    if ((counts.Shop || 0) === 0) replaceRandomType(types, rng, "Rest", "Shop");
  }

  if (new Set(types).size <= 1 && allowedTypes.length > 1) {
    const dominant = types[0];
    const alternatives = allowedTypes.filter((type) => type !== dominant);
    if (alternatives.length > 0) {
      replaceRandomType(types, rng, dominant, alternatives[rng.int(alternatives.length)]);
    }
  }
}

function buildRowTypeTable(seed, cols) {
  const table = {};
  for (let row = 1; row <= 13; row++) {
    const weights = Object.entries(getRowTypeWeights(row));
    const rowRng = new RNG((seed ^ 0xDEADBEEF ^ ((row + 17) * 0x9E3779B1)) >>> 0);
    const rowTypes = Array.from({ length: cols }, () => pickWeighted(rowRng, weights));
    rebalanceRowTypes(row, rowTypes, rowRng, weights.map(([type]) => type));
    table[row] = rowTypes;
  }
  return table;
}

function getRowCoverage(pathCols, row) {
  const coverage = new Map();
  const rowIndex = row - 1;
  for (const path of pathCols) {
    const col = path[rowIndex];
    if (!Number.isInteger(col)) continue;
    coverage.set(col, (coverage.get(col) || 0) + 1);
  }
  return [...coverage.entries()]
    .map(([col, count]) => ({ col, count }))
    .sort((a, b) => b.count - a.count || Math.abs(a.col - 2.5) - Math.abs(b.col - 2.5));
}

function ensureRecoveryRowType(rowTypeTable, pathCols, row) {
  const coverage = getRowCoverage(pathCols, row);
  if (coverage.length === 0) return;
  if (coverage.some(({ col }) => rowTypeTable[row]?.[col] === "Rest")) return;

  const preferred = coverage.filter(({ col }) => rowTypeTable[row]?.[col] === "Combat");
  const chosen = preferred[0] || coverage[0];
  if (!chosen) return;
  rowTypeTable[row][chosen.col] = "Rest";
}

function getCardPoolEntry(id, card) {
  const meta = getCardBalanceMeta(id, card);
  return { id, card, meta };
}

function getRewardCardPool(data, unlockedCardIds = []) {
  return Object.entries(data?.cards || {})
    .map(([id, card]) => getCardPoolEntry(id, card))
    .filter(({ id, card, meta }) => {
      const tags = card?.tags || [];
      return isCardUnlockedByAchievements(id, unlockedCardIds)
        && meta.rewardEligible
        && !String(id || "").startsWith("EC-")
        && !tags.includes("EnemyAbility")
        && !tags.includes("Status")
        && !tags.includes("Junk");
    });
}

function getShopCardPool(data, unlockedCardIds = []) {
  return Object.entries(data?.cards || {})
    .map(([id, card]) => getCardPoolEntry(id, card))
    .filter(({ id, card, meta }) => {
      const tags = card?.tags || [];
      return isCardUnlockedByAchievements(id, unlockedCardIds)
        && meta.shopEligible
        && !String(id || "").startsWith("EC-")
        && !tags.includes("EnemyAbility")
        && !tags.includes("Status")
        && !tags.includes("Junk");
    });
}

function getCardRarityWeight(entry, act = 1) {
  const card = entry?.card;
  let weight = Number(entry?.meta?.rewardWeight ?? 1);
  if ((card?.costRAM ?? 0) >= 3 && act >= 2) weight *= 1.12;
  if ((card?.costRAM ?? 0) >= 4 && act >= 3) weight *= 1.08;
  return Math.max(0.01, weight);
}

function weightedPickEntry(rng, items, weightFn = null) {
  if (!items.length) return null;
  const weights = items.map((item) => {
    const raw = weightFn ? weightFn(item) : 1;
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return items[rng.int(items.length)];
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function chooseWeightedRarity(rng, tables, fallbackOrder = []) {
  const entries = Object.entries(tables || {}).filter(([, weight]) => weight > 0);
  if (entries.length === 0) return fallbackOrder[0] || "common";
  return pickWeighted(rng, entries);
}

function makeDistinctCardSelection(rng, pool, rarityTables, act = 1) {
  const remaining = [...pool];
  const picks = [];
  for (const rarityTable of rarityTables) {
    let rarity = chooseWeightedRarity(rng, rarityTable, ["common", "uncommon", "rare"]);
    let candidates = remaining.filter((entry) => entry.meta.rarity === rarity);
    if (candidates.length === 0) {
      candidates = remaining.filter((entry) => entry.meta.rarity !== "starter" && entry.meta.rarity !== "special");
      if (candidates.length === 0) break;
      rarity = candidates[0].meta.rarity;
    }
    const picked = weightedPickEntry(rng, candidates, (entry) => getCardRarityWeight(entry, act));
    if (!picked) break;
    picks.push(picked.id);
    const index = remaining.findIndex((entry) => entry.id === picked.id);
    if (index >= 0) remaining.splice(index, 1);
  }
  return picks;
}

function getEarlyStabilityRewardPool(data, unlockedCardIds = []) {
  return getRewardCardPool(data, unlockedCardIds).filter((entry) => {
    const card = entry?.card;
    if (!card) return false;
    const tags = card.tags || [];
    if (tags.includes("Tradeoff") || tags.includes("Volatile") || tags.includes("OneShot")) return false;
    if ((card.costRAM ?? 99) > 2) return false;

    const text = getStarterCardText(card);
    return /\bRAM\b/i.test(text)
      || /\bDraw\b/i.test(text)
      || /\bScry\b/i.test(text)
      || /\bGain\s+\d+\s+Firewall\b/i.test(text)
      || /\bHeal\b/i.test(text)
      || /\bThe next card you play costs -1 RAM\b/i.test(text);
  });
}

function ensureEarlyStabilityRewardChoice(rng, picks, data, act = 1, nodeType = "Combat", options = {}) {
  const floor = Number(options?.floor || 0);
  if (act !== 1 || nodeType !== "Combat" || !Number.isFinite(floor) || floor > 4 || floor <= 0) {
    return picks;
  }
  const current = Array.isArray(picks) ? [...picks] : [];
  const pool = getEarlyStabilityRewardPool(data, options?.unlockedCardIds || []);
  if (pool.length === 0 || current.some((id) => pool.some((entry) => entry.id === id))) return current;

  const available = pool.filter((entry) => !current.includes(entry.id));
  if (available.length === 0) return current;

  const replacementIndex = current.length > 0 ? current.length - 1 : 0;
  const picked = weightedPickEntry(rng, available, (entry) => getCardRarityWeight(entry, act));
  if (!picked) return current;

  if (current.length === 0) return [picked.id];
  current[replacementIndex] = picked.id;
  return current;
}

function getCombatRewardRarityTables(nodeType, act) {
  if (nodeType === "Boss") {
    return [
      { rare: act >= 3 ? 0.72 : 0.62, uncommon: act >= 3 ? 0.28 : 0.38 },
      { uncommon: 0.68, rare: 0.32 },
      { common: 0.2, uncommon: 0.55, rare: 0.25 },
    ];
  }
  if (nodeType === "Elite") {
    if (act >= 3) {
      return [
        { uncommon: 0.62, rare: 0.38 },
        { common: 0.28, uncommon: 0.5, rare: 0.22 },
        { common: 0.28, uncommon: 0.5, rare: 0.22 },
      ];
    }
    if (act === 2) {
      return [
        { uncommon: 0.72, rare: 0.28 },
        { common: 0.38, uncommon: 0.44, rare: 0.18 },
        { common: 0.38, uncommon: 0.44, rare: 0.18 },
      ];
    }
    return [
      { uncommon: 0.8, rare: 0.2 },
      { common: 0.5, uncommon: 0.38, rare: 0.12 },
      { common: 0.5, uncommon: 0.38, rare: 0.12 },
    ];
  }
  if (act >= 3) return Array.from({ length: 3 }, () => ({ common: 0.62, uncommon: 0.26, rare: 0.12 }));
  if (act === 2) return Array.from({ length: 3 }, () => ({ common: 0.72, uncommon: 0.22, rare: 0.06 }));
  return Array.from({ length: 3 }, () => ({ common: 0.82, uncommon: 0.16, rare: 0.02 }));
}

function getShopCardRarityTables(act) {
  if (act >= 3) {
    return [
      { common: 0.46, uncommon: 0.38, rare: 0.16 },
      { common: 0.2, uncommon: 0.5, rare: 0.3 },
    ];
  }
  if (act === 2) {
    return [
      { common: 0.58, uncommon: 0.3, rare: 0.12 },
      { common: 0.34, uncommon: 0.44, rare: 0.22 },
    ];
  }
  return [
    { common: 0.72, uncommon: 0.24, rare: 0.04 },
    { common: 0.52, uncommon: 0.36, rare: 0.12 },
  ];
}

function isStarterLowTierCard(id, card) {
  const tags = card?.tags || [];
  const numericId = parseInt(String(id || '').split('-')[1], 10);
  const meta = getCardBalanceMeta(id, card);
  return String(id || '').startsWith('NC-')
    && Number.isFinite(numericId)
    && numericId <= 60
    && !tags.includes('EnemyCard')
    && !tags.includes('EnemyAbility')
    && !tags.includes('Status')
    && !tags.includes('Junk')
    && !tags.includes('Power')
    && card?.type !== 'Power'
    && meta.starterEligible
    && (card?.costRAM ?? 99) <= 2;
}

function getStarterCardText(card) {
  return (card?.effects || [])
    .filter((effect) => effect?.op === 'RawText' && effect?.text)
    .map((effect) => effect.text)
    .join(' | ');
}

function classifyStarterCard(card) {
  const text = getStarterCardText(card);
  let directDamage = 0;
  let pressure = false;
  let sustain = false;
  let utility = false;

  for (const effect of (card?.effects || [])) {
    if (!effect) continue;
    switch (effect.op) {
      case 'DealDamage':
        directDamage += Number(effect.amount || 0);
        pressure = true;
        break;
      case 'ApplyStatus':
        if (effect.target === 'Self' && (effect.statusId === 'Firewall' || effect.statusId === 'Nanoflow')) {
          sustain = true;
        }
        if ((effect.target === 'Enemy' || effect.target === 'AllEnemies') && [
          'Corrode',
          'Leak',
          'ExposedPorts',
          'Vulnerable',
          'Weak',
          'Underclock',
          'SensorGlitch',
          'Overheat',
          'Burn',
        ].includes(effect.statusId)) {
          pressure = true;
        }
        break;
      case 'Heal':
      case 'GainBlock':
        sustain = true;
        break;
      case 'DrawCards':
      case 'GainRAM':
        utility = true;
        break;
      default:
        break;
    }
  }

  if (/\bDeal\s+\d+\s+damage\b/i.test(text) || /\bApply\s+\d+\s+(Corrode|Leak|Exposed Ports|Vulnerable|Weak|Underclock|Sensor Glitch|Overheat|Burn)\b/i.test(text)) {
    pressure = true;
  }
  if (/\bStrip\s+all\s+Firewall\b/i.test(text) || /\bStrip\s+\d+\s+Firewall\b/i.test(text)) {
    pressure = true;
  }
  if (/\bGain\s+\d+\s+Firewall\b/i.test(text) || /\bHeal\b/i.test(text) || /\bNanoflow\b/i.test(text)) {
    sustain = true;
  }
  if (/\bDraw\b/i.test(text) || /\bRestore\b.*\bRAM\b/i.test(text) || /\bGain\b.*\bRAM\b/i.test(text) || /\bScry\b/i.test(text) || /\bSearch your draw pile\b/i.test(text) || /\bshuffle\b/i.test(text)) {
    utility = true;
  }

  if (card?.type === 'Attack') pressure = true;
  if (card?.type === 'Defense' || card?.type === 'Support') sustain = true;
  if (card?.type === 'Utility' || String(card?.type || '').includes('Utility')) utility = true;

  return {
    directDamage,
    pressure,
    sustain,
    utility,
    cheap: (card?.costRAM ?? 99) <= 1,
  };
}

function buildDefaultStarterDeck(data, seed) {
  const starterRng = new RNG((seed ^ 0x5EED5EED) >>> 0);
  const baseCards = ['C-001', 'C-002', 'C-003', 'C-004', 'C-006'].filter((id) => data?.cards?.[id]);
  const extras = [];
  const seen = new Set(baseCards);

  const drawUnique = (pool) => {
    const remaining = pool.filter((id) => !seen.has(id));
    if (remaining.length === 0) return null;
    const picked = remaining[starterRng.int(remaining.length)];
    seen.add(picked);
    extras.push(picked);
    return picked;
  };

  const fillFromPool = (pool) => {
    while (extras.length < 4 && drawUnique(pool)) {
      // Keep drawing unique cards until the starter is full or the pool is exhausted.
    }
  };

  const lowTierPool = Object.entries(data?.cards || {})
    .filter(([id, card]) => isStarterLowTierCard(id, card))
    .map(([id]) => id);
  const classified = new Map(lowTierPool.map((id) => [id, classifyStarterCard(data?.cards?.[id])]));
  const pressureDamagePool = lowTierPool.filter((id) => {
    const card = data?.cards?.[id];
    const info = classified.get(id);
    return info?.pressure && (info.directDamage >= 6 || card?.type === 'Attack');
  });
  const pressurePool = lowTierPool.filter((id) => classified.get(id)?.pressure);
  const sustainPool = lowTierPool.filter((id) => classified.get(id)?.sustain);
  const cheapUtilityPool = lowTierPool.filter((id) => {
    const info = classified.get(id);
    return info?.utility && info.cheap;
  });
  const utilityPool = lowTierPool.filter((id) => classified.get(id)?.utility);

  drawUnique(pressureDamagePool);
  drawUnique(pressurePool);
  drawUnique(sustainPool);
  drawUnique(cheapUtilityPool.length > 0 ? cheapUtilityPool : utilityPool);

  if (extras.length < 4) {
    const fallbackPool = Object.entries(data?.cards || {})
      .filter(([id, card]) => {
        const tags = card?.tags || [];
        return !seen.has(id)
          && !String(id || '').startsWith('EC-')
          && !tags.includes('EnemyCard')
          && !tags.includes('EnemyAbility')
          && !tags.includes('Status')
          && !tags.includes('Junk')
          && !tags.includes('Power')
          && card?.type !== 'Power'
          && (card?.costRAM ?? 99) <= 2;
      })
      .map(([id]) => id);
    fillFromPool(lowTierPool);
    fillFromPool(fallbackPool);
  }

  return [...baseCards, ...extras];
}

export function generateMap(seed) {
  const rng = new RNG(seed ^ 0xA5A5A5A5);
  const nodes = {};
  function makeNode(type, x, y) {
    const id = uid(rng, "n");
    nodes[id] = { id, type, x, y, next: [], cleared: false };
    return id;
  }

  // â”€â”€ StS-style path generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 6 columns (0-5), 15 rows (0=Start, 1-13=content, 14=Boss).
  // 6 paths, each starting at a unique column. Each path meanders Â±1 col/row.
  // Sorted-order invariant: after each row, path columns are sorted ascending.
  // This ensures edges never cross (planar graph).
  // Nodes at the same (row, col) are shared between paths.
  //
  //  Start (2.5, 0)      â† single centred node
  //  /  |  |  |  |  \   â† up to 6 row-1 nodes
  //   ...14 rows of meandering content...
  //  \  |  |  |  |  /   â† converge to Boss
  //  Boss (2.5, 14)

  const COLS   = 6;    // columns 0..5
  const PATH_N = 6;    // one path per column

  const rowTypeTable = buildRowTypeTable(seed, COLS);

  // Deterministic per-(row,col) type table, generated row-by-row.
  // The old per-cell xorshift seed only produced a handful of opening signatures.
  function rowColType(row, col) {
    return rowTypeTable[row]?.[col] || "Combat";
  }

  // Grid cache: "row,col" â†’ nodeId
  const grid = {};
  function getNode(row, col) {
    const key = `${row},${col}`;
    if (grid[key]) return grid[key];
    grid[key] = makeNode(rowColType(row, col), col, row);
    return grid[key];
  }

  // Start and Boss â€” centred at x=2.5
  const startId = makeNode('Start', 2.5, 0);
  nodes[startId].cleared = true;
  const bossId = makeNode('Boss', 2.5, 14);
  nodes[bossId].next = [];

  // Generate paths â€” pathCols[p][r-1] = column for path p at row r (rows 1-13)
  const pathCols = Array.from({ length: PATH_N }, (_, p) => [p]);
  for (let r = 1; r <= 12; r++) {
    const proposals = pathCols.map(p => {
      const cur = p[r - 1];
      const d = rng.pick([-1, 0, 0, 1]); // slight stay-bias
      return Math.max(0, Math.min(COLS - 1, cur + d));
    });
    // Sort to maintain left-to-right order â†’ edges never cross
    const sorted = [...proposals].sort((a, b) => a - b);
    pathCols.forEach((p, i) => p.push(sorted[i]));
  }

  // Ensure the displayed "floor 3" layer always offers at least one true
  // recovery route on an actually used lane before we instantiate the nodes.
  ensureRecoveryRowType(rowTypeTable, pathCols, 2);

  // Build edges â€” deduplicated
  const edgeSet = new Set();
  function addEdge(fromId, toId) {
    const k = `${fromId}|${toId}`;
    if (!edgeSet.has(k)) { edgeSet.add(k); nodes[fromId].next.push(toId); }
  }

  // Start â†’ row 1
  for (let p = 0; p < PATH_N; p++) addEdge(startId, getNode(1, pathCols[p][0]));

  // Row r â†’ row r+1 (rows 1..12)
  for (let r = 1; r <= 12; r++) {
    for (let p = 0; p < PATH_N; p++) {
      addEdge(getNode(r, pathCols[p][r - 1]), getNode(r + 1, pathCols[p][r]));
    }
  }

  // Row 13 â†’ Boss
  for (let p = 0; p < PATH_N; p++) addEdge(getNode(13, pathCols[p][12]), bossId);

  return {
    nodes,
    currentNodeId: startId,
    selectableNext: [...nodes[startId].next],
    detourEdges: [],
  };
}

export function makeCardRewards(data, seed, act = 1, nodeType = 'Combat', options = {}) {
  const rng = new RNG(seed ^ 0x55CCAA11);
  const pool = getRewardCardPool(data, options?.unlockedCardIds || []);
  const cardChoices = ensureEarlyStabilityRewardChoice(
    rng,
    makeDistinctCardSelection(rng, pool, getCombatRewardRarityTables(nodeType, act), act),
    data,
    act,
    nodeType,
    options,
  );
  return { cardChoices, canSkip: true };
}

export function getEarlyCombatRecovery(run, nodeType) {
  const act = Number(run?.act || 1);
  const floor = Number(run?.floor || 1);
  if (act !== 1 || nodeType !== "Combat") return null;
  if (floor <= 2) return { hp: 6 };
  if (floor <= 4) return { hp: 4 };
  return null;
}

function makeShop(data, seed, relicIds = [], act = 1, options = {}) {
  const rng = new RNG(seed ^ 0x0F0F0F0F);
  const pool = getShopCardPool(data, options?.unlockedCardIds || []);
  // TheArchitect: all shop prices reduced by 15g
  const disc = relicIds.includes('TheArchitect') ? 15 : 0;
  const p = (base) => Math.max(5, base - disc);

  // Pick one relic offer from common pool (act 1) or uncommon pool (act 2+)
  // Never offer a relic the player already owns
  const relicPool = act <= 1
    ? (data.relicRewardPools?.common || [])
    : [...(data.relicRewardPools?.common || []), ...(data.relicRewardPools?.uncommon || [])];
  const availableRelics = relicPool.filter(
    (rid) => !relicIds.includes(rid) && isRelicUnlockedByAchievements(rid, options?.unlockedRelicIds || []),
  );
  let relicOffer = null;
  if (availableRelics.length > 0) {
    const rid = rng.pick(availableRelics);
    const r = data.relics?.[rid];
    const relicPrice = r?.rarity === 'uncommon' ? p(150) : p(100);
    relicOffer = { kind: "Relic", relicId: rid, price: relicPrice };
  }

  const cardOfferIds = makeDistinctCardSelection(rng, pool, getShopCardRarityTables(act), act);
  const cardOffers = cardOfferIds.map((defId) => {
    const meta = getCardBalanceMeta(defId, data?.cards?.[defId]);
    return { kind: "Card", defId, price: p(meta.shopPrice), sold: false };
  });

  const offers = [
    ...cardOffers,
    { kind: "Service", serviceId: "RemoveCard", price: p(75), basePrice: p(75), requiresCard: true },
    { kind: "Service", serviceId: "Repair", price: p(60), basePrice: p(60), requiresCard: true, timesPurchased: 0 },
    { kind: "Service", serviceId: "Stabilise", price: p(60), basePrice: p(60), requiresCard: true, timesPurchased: 0 },
    { kind: "Service", serviceId: "Accelerate", price: p(40), basePrice: p(40), requiresCard: true, timesPurchased: 0 },
    { kind: "Service", serviceId: "Forge", price: 4, basePrice: 4, requiresCard: true, currency: "scrap" },
    { kind: "Service", serviceId: "Heal", price: p(60), basePrice: p(60), requiresCard: false },
  ];
  if (relicOffer) offers.push(relicOffer);
  return { offers };
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
  const telemetry = ensureRunTelemetry(state.run);
  const endless = isEndlessRun(state.run);

  // Win condition: cleared the final act
  if (prevAct >= MAX_ACTS && !endless) {
    state.run.victory = true;
    state.mode = "GameOver";
    log({ t: "Info", msg: `RUN COMPLETE â€” all ${MAX_ACTS} acts cleared!` });
    return;
  }

  state.run.act += 1;
  telemetry.highestActReached = Math.max(Number(telemetry.highestActReached || 1), Number(state.run.act || 1));
  // Generate a new map seeded differently per act so layouts vary
  state.map = generateMap((state.run.seed ^ (state.run.act * 0x9E3779B9)) >>> 0);
  if (endless && prevAct >= MAX_ACTS) {
    log({ t: "Info", msg: `Endless Protocol stabilised Ã¢â‚¬â€ entering Act ${state.run.act}` });
    return;
  }
  log({ t: "Info", msg: `Act ${prevAct} complete â€” entering Act ${state.run.act}` });
}

function service_RemoveCard(state, data, source = 'shop', log = null) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const removed = state.deck.cardInstances[sel];
  salvageRemovedCard(state, removed, log, source === "shop" ? "market salvage" : "manual salvage");
  delete state.deck.cardInstances[sel];
  state.deck.master = state.deck.master.filter(x => x !== sel);
  // on_card_remove relic effects
  const relicIds = state.run?.relicIds || [];
  if (relicIds.includes('FragmentationCache')) {
    state.run.gold += 35;
    log?.({ t: 'Info', msg: 'FragmentationCache: +35g on remove' });
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
      addCardToRunDeck(data, state.deck, peRng, randomId);
      log?.({ t: 'Info', msg: `PurgeEngine: added ${randomId} to deck` });
    }
  }
  return true;
}
function service_RepairCard(state, data, source = "manual") {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const preview = getServiceTargetPreview("Repair", state, data, sel);
  if (!preview.eligible) return false;
  const ci = state.deck.cardInstances[sel];
  if (!ci) return false;
  ci.appliedMutations = [...(preview.nextAppliedMutations || [])];
  ci.ramCostDelta = Number(preview.nextRamCostDelta ?? ci.ramCostDelta ?? 0);
  ci.useCounter = preview.nextUseCounter;
  ci.finalMutationCountdown = preview.nextFinalCountdown;
  if (source !== "auto") incrementRunTelemetry(state.run, "repairsUsed", 1);
  return true;
}
function service_StabiliseCard(state, data) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const preview = getServiceTargetPreview("Stabilise", state, data, sel);
  if (!preview.eligible) return false;
  const ci = state.deck.cardInstances[sel];
  if (!ci) return false;
  ci.useCounter = preview.nextUseCounter;
  ci.finalMutationCountdown = preview.nextFinalCountdown;
  return true;
}
function service_AccelerateCard(state, data) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const preview = getServiceTargetPreview("Accelerate", state, data, sel);
  if (!preview.eligible) return false;
  const ci = state.deck.cardInstances[sel];
  if (!ci) return false;
  ci.useCounter = preview.nextUseCounter;
  ci.finalMutationCountdown = preview.nextFinalCountdown;
  return true;
}
function service_ForgeCard(state, data) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const preview = getServiceTargetPreview("Forge", state, data, sel);
  if (!preview.eligible) return false;

  const ci = state.deck.cardInstances[sel];
  if (!ci) return false;
  let changed = false;

  if (preview.repairPreview?.eligible) {
    ci.appliedMutations = [...(preview.repairPreview.nextAppliedMutations || [])];
    ci.ramCostDelta = Number(preview.repairPreview.nextRamCostDelta ?? ci.ramCostDelta ?? 0);
    ci.useCounter = preview.repairPreview.nextUseCounter;
    ci.finalMutationCountdown = preview.repairPreview.nextFinalCountdown;
    incrementRunTelemetry(state.run, "repairsUsed", 1);
    changed = true;
  }

  if (preview.compilePreview?.eligible && service_CompileCard(state, data)) {
    changed = true;
  }

  const stabilisePreview = previewMutationClockScale(data, ci, "up");
  if (stabilisePreview.changed) {
    ci.useCounter = stabilisePreview.nextUseCounter;
    ci.finalMutationCountdown = stabilisePreview.nextFinalCountdown;
    changed = true;
  }

  return changed;
}
function service_CompileCard(state, data) {
  const sel = state.deckView?.selectedInstanceId;
  if (!state.deck || !sel) return false;
  const ci = state.deck.cardInstances[sel];
  const def = data?.cards?.[ci?.defId];
  if (!ci || !def) return false;
  const applied = applyCompileToCardInstance(def, ci);
  if (applied) incrementRunTelemetry(state.run, "compileCount", 1);
  return applied;
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
  const preview = getServiceTargetPreview("Heal", state, null, null);
  if (!preview.eligible) return false;
  state.run.hp = clamp(state.run.hp + preview.amount, 0, state.run.maxHP);
  return true;
}

// IMPORTANT: auto-resolve node should NOT be recorded as a separate journal action.
// So we implement node resolution as an internal helper, not by dispatching ResolveNode.
function resolveCurrentNodeInternal(state, data, log) {
  if (state.mode !== "Map" || !state.map || !state.run || !state.deck) return state;
  const node = state.map.nodes[state.map.currentNodeId];
  if (!node) return state;
  if (node.cleared) return state;

  const resolvedFloor = state.run.floor + 1;
  const markNodeResolved = () => {
    node.cleared = true;
    state.run.floor = resolvedFloor;
  };
  log({ t: "Info", msg: `Resolving node (${node.type})` });

  if (node.type === "Combat" || node.type === "Elite" || node.type === "Boss") {
    const dbg = buildCombatDebugOverrides(state.run);
    const naturalKind = node.type === "Elite" ? "elite" : node.type === "Boss" ? "boss" : "normal";
    const effectiveKind = dbg?.encounterKind ?? naturalKind;
    const effectiveAct  = dbg?.actOverride ?? getContentActForRun(state.run);

    const mods = getRunMods(data, state.run.relicIds);

    // When a debug seed is active, pull enemies from the FULL enemy roster so
    // all 148+ enemies can appear, not just those in the encounter tables.
    let enemyIds, encounterName, encounterId = null;
    if (dbg?.enemyPoolSeed != null) {
      const allEnemyIds = Object.keys(data.enemies);
      const poolRng = new RNG((dbg.enemyPoolSeed ^ resolvedFloor) >>> 0);
      const count = dbg.enemyCount ?? 1;
      enemyIds = [];
      for (let i = 0; i < count; i++) {
        enemyIds.push(allEnemyIds[poolRng.int(allEnemyIds.length)]);
      }
      encounterName = `Debug pool (${enemyIds.length} enemies)`;
    } else {
      let enc = null;
        try {
          enc = pickEncounter(data, state.run.seed ^ resolvedFloor, effectiveAct, effectiveKind, {
            floor: resolvedFloor,
            recentHistory: state.run.encounterHistory || [],
            adaptationProfile: state.run.adaptationProfile || null,
          });
        } catch (err) {
        log({ t: "Error", msg: `Encounter selection failed: ${String(err?.message || err)}` });
        return state;
      }
      enemyIds = enc?.enemyIds?.length ? enc.enemyIds : null;
      encounterId = enc?.id ?? enc?.name ?? null;
      encounterName = enc?.name ?? 'Unknown';
      if (!enemyIds) {
        log({ t: "Error", msg: `Encounter "${encounterName}" returned no enemyIds â€” keeping combat node unresolved` });
        return state;
      }
    }

    if (!dbg?.enemyPoolSeed && enemyIds?.length) {
      state.run.encounterHistory = [
        ...(state.run.encounterHistory || []),
        {
          id: encounterId ?? encounterName,
          name: encounterName,
          signature: [...enemyIds].sort().join('|'),
          act: state.run.act,
          kind: effectiveKind,
          floor: resolvedFloor,
        },
      ].slice(-12);
    }

    markNodeResolved();
    state.mode = "Combat";
    state.combat = startCombatFromRunDeck({
      data,
      seed: state.run.seed ^ resolvedFloor,
      act: effectiveAct,
      floor: resolvedFloor,
      runDeck: state.deck,
      enemyIds,
      encounterId,
      encounterName,
      encounterKind: effectiveKind,
      playerMaxHP: state.run.maxHP,
      playerMaxRAM: (dbg?.playerMaxRAM ?? 8) + (mods.maxRAMDelta ?? 0),
      playerRamRegen: (dbg?.playerRamRegen ?? 2) + (mods.ramRegenDelta ?? 0),
      openingHand: 5,
        ruleMods: mods,
        forcedMutationTier: state.run.forcedMutationTier ?? null,
        debugOverrides: dbg,
        relicIds: state.run.relicIds || [],
        runAdaptationProfile: state.run.adaptationProfile || null,
      });
    state.combat.player.hp = state.run.hp;
    if (node.type === "Elite") incrementRunTelemetry(state.run, "eliteCombatsEntered", 1);
    if (node.type === "Boss") incrementRunTelemetry(state.run, "bossCombatsEntered", 1);
    syncRunCombatTelemetry(state);
    const debugTag = dbg ? ` [dbg: act${effectiveAct}/${effectiveKind}]` : '';
    log({ t: "Info", msg: `Encounter: ${encounterName}${debugTag}` });
    return state;
  }

  if (node.type === "Shop") {
    markNodeResolved();
    state.mode = "Shop";
    state.shop = makeShop(
      data,
      state.run.seed ^ resolvedFloor,
      state.run.relicIds || [],
      getContentActForRun(state.run),
      {
        unlockedCardIds: getRunUnlockedCardIds(state.run),
        unlockedRelicIds: getRunUnlockedRelicIds(state.run),
      },
    );
    log({ t: "Info", msg: "Entered shop" });
    return state;
  }

  if (node.type === "Rest") {
    markNodeResolved();
    state.mode = "Event";
    state.event = { eventId: "RestSite", step: 0 };
    log({ t: "Info", msg: "Entered rest site" });
    return state;
  }

  if (node.type === "Compile") {
    markNodeResolved();
    state.mode = "Event";
    state.event = { eventId: "CompileStation", step: 0 };
    log({ t: "Info", msg: "Entered compile station" });
    return state;
  }

  if (node.type === "Event") {
    markNodeResolved();
    state.mode = "Event";
    const minigameIds = getMinigamePoolForAct(getContentActForRun(state.run));
    const eid = pickContextualEventId(
      EVENT_REG,
      data,
      state,
      (state.run.seed ^ resolvedFloor ^ 0xE17E17) >>> 0,
      minigameIds,
    );
    state.event = { eventId: eid, step: 0 };
    state.run.eventSeen = [...(state.run.eventSeen || []), eid].slice(-18);
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
      const starterProfile = getStarterProfile(action.starterProfileId);
      const starterRelicIds = [...(starterProfile.startingRelicIds || [])];
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
      const startMaxMP = dbg?.maxMP ?? 6;
      const travelHpCost = dbg?.travelHpCost ?? 2;

      state.mode = "Map";
      state.run = {
        seed: action.seed,
        debugSeed,
        debugOverrides: dbg,
        act: 1,
        floor: 1,
        mp: startMaxMP,
        maxMP: startMaxMP,
        gold: startGold,
        scrap: 0,
        hp: startMaxHP,
        maxHP: startMaxHP,
        travelHpCost,
        relicIds: starterRelicIds,
        seenMutationIds: [],
        encounterHistory: [],
        eventSeen: [],
        eventFlags: {},
        factionRep: { ghosts: 0, architects: 0, scrappers: 0 },
        starterProfileId: starterProfile.id,
        starterProfileName: starterProfile.name,
        difficultyId: action.difficultyId || "standard",
        challengeIds: Array.isArray(action.challengeIds) ? action.challengeIds : [],
        runMode: action.runMode || "standard",
        dailyRunId: action.dailyRunId || null,
        dailyRunLabel: action.dailyRunLabel || null,
        metaUnlocks: {
          achievementIds: Array.isArray(action.unlockedAchievementIds) ? action.unlockedAchievementIds : [],
          cardIds: Array.isArray(action.unlockedCardIds) ? action.unlockedCardIds : [],
          relicIds: Array.isArray(action.unlockedRelicIds) ? action.unlockedRelicIds : [],
          callsignIds: Array.isArray(action.unlockedCallsignIds) ? action.unlockedCallsignIds : [],
        },
        adaptationProfile: createRunAdaptationProfile(),
        telemetry: createRunTelemetry(),
      };

      // Starter deck: explicit debug list > default 9-card starter
      let starter;
      if (dbg?.startingCardIds?.length) {
        starter = dbg.startingCardIds;
      } else if (dbg?.startingCardCount != null) {
        starter = Object.keys(data.cards).slice(0, dbg.startingCardCount);
      } else if (starterProfile?.deck?.length || starterProfile?.loadoutSlots?.length) {
        starter = resolveStarterProfileDeck(data, action.seed, starterProfile);
      } else {
        starter = buildDefaultStarterDeck(data, action.seed);
      }
      state.deck = createRunDeckFromDefs(data, action.seed, starter.length ? starter : ['C-001', 'C-002', 'C-003', 'C-004', 'C-006']);
      state.map = generateMap(action.seed);
      state.combat = null;
      state.reward = null;
      state.shop = null;
      state.event = null;
      state.deckView = null;
      state.journal = { seed: action.seed, debugSeed, actions: [] };
      syncRunDeckTelemetry(state, data);

      log({
        t: "Info",
        msg: `New run (${starterProfile.name}, seed=${action.seed}, debugSeed=${debugSeed ?? 'none'})`,
      });
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
      const previousHp = state.run.hp;
      const previousMp = state.run.mp;
      const previousSelectableNext = [...state.map.selectableNext];

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
      const resolved = resolveCurrentNodeInternal(state, data, log);
      if (resolved.mode === "Map" && !resolved.map?.nodes?.[toId]?.cleared) {
        resolved.run.hp = previousHp;
        resolved.run.mp = previousMp;
        resolved.map.currentNodeId = fromId;
        resolved.map.selectableNext = previousSelectableNext;
        log({ t: "Error", msg: `Failed to resolve node ${toId}; movement reverted` });
      }
      return resolved;
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

      if (action.type === "Combat_EndTurn") {
        recordRunTurnPressure(state, data);
      }

      const combatAction =
        action.type === "Combat_StartTurn" ? { type: "StartTurn" } :
        action.type === "Combat_EndTurn" ? { type: "EndTurn" } :
        action.type === "Combat_PlayCard"
          ? { type: "PlayCard", cardInstanceId: action.cardInstanceId, targetEnemyId: action.targetEnemyId, targetSelf: !!action.targetSelf }
          :
        action.type === "Combat_ScryResolve" ? { type: "ScryResolve", discard: action.discard, top: action.top } :
        { type: "SimulateEncounter", maxTurns: action.maxTurns };

      state.combat = dispatchCombat(state.combat, data, combatAction);

      // drain combat logs into global log and mark mutation discoveries per run
      const seenMutationIds = new Set(state.run.seenMutationIds || []);
      state.run.adaptationProfile = normalizeRunAdaptationProfile(state.run.adaptationProfile);
      for (const e of state.combat.log) {
        if (e.t === "MutationApplied") {
          const mutationId = e.data?.mutationId
            ?? e.msg?.replace(/^(?:Applied )?Mutation\s+/i, "")
            ?? null;
          const isNewInRun = mutationId ? !seenMutationIds.has(mutationId) : true;
          if (mutationId) seenMutationIds.add(mutationId);
          push(state.log, {
            ...e,
            data: {
              ...(e.data || {}),
              mutationId,
              isNewInRun,
            },
          });
          continue;
        }
        if (e.t === "CardPlayed") {
          const currentInstance = state.deck?.cardInstances?.[e.data?.cardInstanceId] || null;
          state.run.adaptationProfile = recordCardPlayForAdaptation(state.run.adaptationProfile, {
            cost: e.data?.cost,
            effectSummary: e.data?.effectSummary,
            type: currentInstance?.defId ? data?.cards?.[currentInstance.defId]?.type : null,
            compileLevel: currentInstance?.compileLevel ?? 0,
            appliedMutationCount: currentInstance?.appliedMutations?.length ?? 0,
          });
        }
        if (e.t === "FinalMutation" && e.data?.outcome === "brick") {
          incrementRunTelemetry(state.run, "bricksTriggered", 1);
          addRunCurrency(state.run, 1, "scrap");
          push(state.log, { t: "Info", msg: `Recovered 1 scrap from ${e.data?.cardDefId || "bricked card"}` });
        }
        push(state.log, e);
      }
      state.run.seenMutationIds = [...seenMutationIds];
      state.combat.log = [];

      // sync run HP
      state.run.hp = Math.max(0, state.combat.player.hp);
      syncRunCombatTelemetry(state);
      syncRunDeckTelemetry(state, data);

      if (state.combat.combatOver) {
        if (!state.combat.victory) {
          const nodeType = state.map?.nodes[state.map.currentNodeId]?.type;
          if (nodeType === "Elite") incrementRunTelemetry(state.run, "eliteCombatsLost", 1);
          if (nodeType === "Boss") incrementRunTelemetry(state.run, "bossCombatsLost", 1);
          state.mode = "GameOver";
          log({ t: "Info", msg: "Run ended: defeated" });
          return state;
        }

        // Remove any bricked cards flagged RemoveFromRun
        const toRemove = Object.values(state.deck.cardInstances)
          .filter(ci => ci.removeFromRunOnCombatEnd)
          .map(ci => ci.instanceId);
        for (const id of toRemove) {
          const removed = state.deck.cardInstances[id];
          salvageRemovedCard(state, removed, log, "post-combat salvage");
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
        if (nodeType === "Boss") incrementRunTelemetry(state.run, "bossesDefeated", 1);

        const earlyRecovery = getEarlyCombatRecovery(state.run, nodeType);
        if (earlyRecovery?.hp > 0) {
          const beforeRecovery = state.run.hp;
          state.run.hp = Math.min(state.run.maxHP, state.run.hp + earlyRecovery.hp);
          const recovered = state.run.hp - beforeRecovery;
          if (recovered > 0) {
            log({ t: "Info", msg: `Early combat recovery: +${recovered} HP` });
          }
        }

        state.mode = "Reward";
        state.reward = makeCardRewards(
          data,
          state.run.seed ^ (state.run.floor * 777),
          getContentActForRun(state.run),
          nodeType,
          {
            floor: state.run.floor,
            unlockedCardIds: getRunUnlockedCardIds(state.run),
          },
        );

        // relic rewards
        if (nodeType === "Elite" || nodeType === "Boss") {
          const kind = nodeType === "Boss" ? "boss" : "elite";
          state.reward.relicChoices = makeRelicChoices(data, state.run.seed ^ state.run.floor, kind, {
            unlockedRelicIds: getRunUnlockedRelicIds(state.run),
          });
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
        syncRunDeckTelemetry(state, data);
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
      syncRunDeckTelemetry(state, data);

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

      // Apply run-level stat mods immediately on pickup
      const pickedRelic = data.relics?.[action.relicId];
      const pm = pickedRelic?.mods || {};
      if (pm.maxHPDelta) {
        state.run.maxHP += pm.maxHPDelta;
        // Increase or decrease current HP proportionally (cap at new max, floor at 1)
        state.run.hp = Math.max(1, Math.min(state.run.hp + pm.maxHPDelta, state.run.maxHP));
      }
      if (pm.maxMPDelta) {
        state.run.maxMP = (state.run.maxMP || 6) + pm.maxMPDelta;
        state.run.mp = Math.min((state.run.mp ?? state.run.maxMP), state.run.maxMP);
      }
      if (pm.startingGoldDelta) {
        state.run.gold = Math.max(0, state.run.gold + pm.startingGoldDelta);
        log({ t: "Info", msg: `Relic: ${pm.startingGoldDelta > 0 ? '+' : ''}${pm.startingGoldDelta}g` });
      }
      if (pm.travelHpCostDelta) {
        state.run.travelHpCost = Math.max(0, (state.run.travelHpCost || 2) + pm.travelHpCostDelta);
      }

      // on_run_start effects fire when the relic is first acquired
      if (action.relicId === 'WornToolkit' && state.deck) {
        const instances = Object.values(state.deck.cardInstances);
        const repairable = instances.filter(ci => !ci.finalMutationId);
        if (repairable.length > 0) {
          const wtRng = new RNG((state.run.seed ^ 0x700C) >>> 0);
          const target = repairable[wtRng.int(repairable.length)];
          const maxUse = getCardUseCounterLimit(data, target);
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
      if (offer.sold) { log({ t: "Info", msg: "Offer sold out" }); return state; }
      const offerPrice = getShopOfferPrice(offer);
      const offerCurrency = getOfferCurrency(offer);
      if (!canAffordRunCurrency(state.run, offerPrice, offerCurrency)) {
        log({ t: "Info", msg: `Not enough ${offerCurrency}` });
        return state;
      }

      if (offer.kind === "Card") {
        spendRunCurrency(state.run, offerPrice, offerCurrency, "shop");
        const rng = new RNG((state.run.seed ^ state.run.floor ^ 0xC0FFEE) >>> 0);
        addCardToRunDeck(data, state.deck, rng, offer.defId);
        markShopCardOfferSold(state.shop, offer.defId);
        syncRunDeckTelemetry(state, data);
        log({ t: "Info", msg: `Bought card: ${offer.defId}` });
        return state;
      }

      if (offer.kind === "Relic") {
        if (state.run.relicIds.includes(offer.relicId)) return state; // already owned
        spendRunCurrency(state.run, offerPrice, offerCurrency, "shop");
        state.run.relicIds.push(offer.relicId);
        // Apply run-level stat mods (same logic as Reward_PickRelic)
        const boughtRelic = data.relics?.[offer.relicId];
        const bm = boughtRelic?.mods || {};
        if (bm.maxHPDelta) {
          state.run.maxHP += bm.maxHPDelta;
          state.run.hp = Math.max(1, Math.min(state.run.hp + bm.maxHPDelta, state.run.maxHP));
        }
        if (bm.maxMPDelta) {
          state.run.maxMP = (state.run.maxMP || 6) + bm.maxMPDelta;
          state.run.mp = Math.min((state.run.mp ?? state.run.maxMP), state.run.maxMP);
        }
        if (bm.startingGoldDelta) {
          state.run.gold = Math.max(0, state.run.gold + bm.startingGoldDelta);
        }
        if (bm.travelHpCostDelta) {
          state.run.travelHpCost = Math.max(0, (state.run.travelHpCost || 2) + bm.travelHpCostDelta);
        }
        offer.sold = true;
        log({ t: "Info", msg: `Bought relic: ${offer.relicId}` });
        return state;
      }

      // service
      if (offer.serviceId === "Heal") {
        const healPreview = getServiceOfferPreview("Heal", state, data);
        if (!healPreview.available) {
          log({ t: "Info", msg: "Service unavailable: Heal" });
          return state;
        }
        if (!service_HealPlayer(state)) return state;
        spendRunCurrency(state.run, offerPrice, offerCurrency, "shop");
        log({ t: "Info", msg: `Bought service: Heal (+${healPreview.amount} HP, ${formatCurrencyForLog(offerPrice, offerCurrency)})` });
        return state;
      }

      // card-targeting services
      const servicePreview = getServiceOfferPreview(offer.serviceId, state, data);
      if (!servicePreview.available) {
        log({ t: "Info", msg: `Service unavailable: ${offer.serviceId}` });
        return state;
      }
      state.deckView = { selectedInstanceId: null, returnMode: "Shop" };
      state.shop.pendingService = offer.serviceId;
      state.shop.pendingPrice = offerPrice;
      state.shop.pendingCurrency = offerCurrency;
      state.shop.pendingOfferIndex = action.index;
      log({ t: "Info", msg: `Select a card for service: ${offer.serviceId}` });
      return state;
    }

    case "Shop_Reroll": {
      if (state.mode !== "Shop" || !state.shop || !state.run) return state;
      const rerollsUsed = state.shop.rerollsUsed || 0;
      // SystemAdminKey: first reroll each shop is free
      const hasSysKey = (state.run.relicIds || []).includes('SystemAdminKey');
      const rerollCost = hasSysKey && rerollsUsed === 0 ? 0 : 30 + rerollsUsed * 10;
      if (state.run.gold < rerollCost) { log({ t: "Info", msg: "Not enough gold to reroll" }); return state; }
      state.run.gold -= rerollCost;
      // Regenerate shop with a shifted seed so we get different items
      const newSeed = (state.run.seed ^ state.run.floor ^ (0x4E11 * (rerollsUsed + 1))) >>> 0;
      const newShop = makeShop(
        data,
        newSeed,
        state.run.relicIds || [],
        getContentActForRun(state.run),
        {
          unlockedCardIds: getRunUnlockedCardIds(state.run),
          unlockedRelicIds: getRunUnlockedRelicIds(state.run),
        },
      );
      newShop.rerollsUsed = rerollsUsed + 1;
      newShop.rerollCostNext = hasSysKey && rerollsUsed === 0 ? 30 : 30 + (rerollsUsed + 1) * 10;
      state.shop = newShop;
      log({ t: "Info", msg: `Shop rerolled (cost ${rerollCost}g)` });
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
      syncRunDeckTelemetry(state, data);
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

        // Card ops â€” open deck picker for player to select a card
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
      syncRunDeckTelemetry(state, data);

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
      if (state.mode === "Shop" && state.shop?.pendingService) {
        delete state.shop.pendingService;
        delete state.shop.pendingPrice;
        delete state.shop.pendingCurrency;
        delete state.shop.pendingOfferIndex;
        log({ t: "Info", msg: "Cancelled shop service selection" });
      }
      if (state.mode === "Event" && state.event?.pendingSelectOp) {
        delete state.event.pendingPrice;
        delete state.event.pendingCurrency;
      }
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
        const servicePrice = Math.max(0, Number(state.shop.pendingPrice ?? 0));
        const serviceCurrency = state.shop.pendingCurrency === "scrap" ? "scrap" : "gold";
        const serviceOfferIndex = Number.isInteger(state.shop.pendingOfferIndex) ? state.shop.pendingOfferIndex : null;
        if (!canAffordRunCurrency(state.run, servicePrice, serviceCurrency)) {
          log({ t: "Info", msg: `Not enough ${serviceCurrency} for service: ${serviceId}` });
          return state;
        }
        let ok = false;
        if (serviceId === "RemoveCard") ok = service_RemoveCard(state, data, 'shop', log);
        if (serviceId === "Repair") ok = service_RepairCard(state, data, "shop");
        if (serviceId === "Stabilise") ok = service_StabiliseCard(state, data);
        if (serviceId === "Accelerate") ok = service_AccelerateCard(state, data);
        if (serviceId === "Forge") ok = service_ForgeCard(state, data);
        if (serviceId === "Compile") ok = service_CompileCard(state, data);
        if (!ok) { log({ t: "Info", msg: `Service failed: ${serviceId}` }); return state; }
        spendRunCurrency(state.run, servicePrice, serviceCurrency, "service");
        advanceRepeatableShopServiceOffer(state.shop, serviceId, serviceOfferIndex, servicePrice);
        syncRunDeckTelemetry(state, data);
        log({ t: "Info", msg: `Applied service: ${serviceId} (${formatCurrencyForLog(servicePrice, serviceCurrency)})` });
        delete state.shop.pendingService;
        delete state.shop.pendingPrice;
        delete state.shop.pendingCurrency;
        delete state.shop.pendingOfferIndex;
        state.deckView = null;
      }

      // event pending op apply
      if (state.mode === "Event" && state.event?.pendingSelectOp) {
        const op = state.event.pendingSelectOp;
        const eventPrice = Math.max(0, Number(state.event.pendingPrice ?? 0));
        const eventCurrency = state.event.pendingCurrency === "scrap" ? "scrap" : "gold";
        if (eventPrice > 0 && !canAffordRunCurrency(state.run, eventPrice, eventCurrency)) {
          log({ t: "Info", msg: `Not enough ${eventCurrency} for event action: ${op}` });
          return state;
        }
        let ok = false;
        if (op === "RemoveSelectedCard") ok = service_RemoveCard(state, data, 'event', log);
        if (op === "RepairSelectedCard") ok = service_RepairCard(state, data, "event");
        if (op === "StabiliseSelectedCard") ok = service_StabiliseCard(state, data);
        if (op === "AccelerateSelectedCard") ok = service_AccelerateCard(state, data);
        if (op === "ForgeSelectedCard") ok = service_ForgeCard(state, data);
        if (op === "CompileSelectedCard") ok = service_CompileCard(state, data);
        if (op === "DuplicateSelectedCard") {
          const dupRng = new RNG((state.run?.seed ^ state.run?.floor ^ 0xD0D0D0) >>> 0);
          ok = service_DuplicateCard(state, dupRng);
        }
        if (!ok) { log({ t: "Info", msg: `Event card op failed: ${op}` }); return state; }
        if (eventPrice > 0) {
        spendRunCurrency(state.run, eventPrice, eventCurrency, "event");
        }
        syncRunDeckTelemetry(state, data);
        log({ t: "Info", msg: `Event: applied card op ${op}${eventPrice > 0 ? ` (${formatCurrencyForLog(eventPrice, eventCurrency)})` : ""}` });
        state.event.pendingSelectOp = undefined;
        delete state.event.pendingPrice;
        delete state.event.pendingCurrency;
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
    case "Rest_Forge": {
      if (state.mode !== "Event" || state.event?.eventId !== "RestSite" || !state.run) return state;
      const forgeCost = 3;
      if (!canAffordRunCurrency(state.run, forgeCost, "scrap")) {
        log({ t: "Info", msg: "Not enough scrap to reforge at the rest site" });
        return state;
      }
      state.deckView = { selectedInstanceId: null, returnMode: "Event" };
      state.event.pendingSelectOp = "ForgeSelectedCard";
      state.event.pendingPrice = forgeCost;
      state.event.pendingCurrency = "scrap";
      log({ t: "Info", msg: `Rest: choose a card to Reforge (${forgeCost} scrap)` });
      return state;
    }
    case "Rest_Leave": {
      if (state.mode !== "Event" || state.event?.eventId !== "RestSite") return state;
      log({ t: "Info", msg: "Left rest site" });
      state.mode = "Map";
      state.event = null;
      return state;
    }
    case "Compile_Open": {
      if (state.mode !== "Event" || state.event?.eventId !== "CompileStation") return state;
      state.deckView = { selectedInstanceId: null, returnMode: "Event" };
      state.event.pendingSelectOp = "CompileSelectedCard";
      log({ t: "Info", msg: "Compile: choose a card to upgrade" });
      return state;
    }
    case "Compile_Leave": {
      if (state.mode !== "Event" || state.event?.eventId !== "CompileStation") return state;
      log({ t: "Info", msg: "Left compile station" });
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
