/**
 * aiPlayer.js — Pure AI decision functions for the auto-play debug feature.
 * No React imports, no side effects. Returns action objects or null.
 */

// ─── Playstyle Configurations ─────────────────────────────────────────────────

export const AI_PLAYSTYLES = {
  balanced: {
    label: 'Balanced',
    // combat scoring weights
    damageWeight: 1.0,
    blockWeight: 1.0,
    statusWeight: 1.6,           // raised: status effects are proven survival tools
    healWeight: 1.0,
    drawWeight: 1.0,
    ramWeight: 1.0,
    costPenalty: 3.0,
    useCounterPenalty: 10,       // subtracted when useCounter <= 1
    finalMutCounterPenalty: 25,  // subtracted when finalMutationCountdown <= 2
    posMutBonus: 5,
    negMutPenalty: 3,
    // map navigation
    restThreshold: 0.5,          // prefer Rest below this HP fraction
    shopGoldThreshold: 60,       // prefer Shop above this gold amount
    eliteBonus: 0,               // additive score bonus for selecting Elite nodes
    // reward
    rewardTypeWeights: { Attack: 5, Power: 14, Skill: 12, Defense: 8, Support: 10, Utility: 8 },
    rewardMutRiskCutoff: null,   // skip reward cards with countdown <= this
    // rest site priority order: tries each in sequence
    restPriority: ['heal', 'stabilise', 'repair'],
    // shop
    shopGoldReserve: 40,         // won't buy if it leaves less than this gold
    shopBuyCards: true,
    shopPreferCardTypes: ['Power', 'Skill'],
    shopAvoidCardTypes: [],
    shopBuyHeal: true,
    shopBuyRepair: false,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyRemoveCard: false,
    shopRemoveTargetTypes: [],   // card types to prioritise for RemoveCard
  },

  aggressive: {
    label: 'Aggressive',
    damageWeight: 1.8,
    blockWeight: 0.4,
    statusWeight: 1.9,           // raised: debuffs (Weak/Vulnerable) multiply damage output
    healWeight: 0.3,
    drawWeight: 0.8,
    ramWeight: 0.8,
    costPenalty: 2.0,
    useCounterPenalty: 4,        // low — risk is acceptable
    finalMutCounterPenalty: 8,   // low — mutation risk is acceptable
    posMutBonus: 7,
    negMutPenalty: 2,
    restThreshold: 0.25,         // only rest when critically low
    shopGoldThreshold: 80,       // only detour to shops when very gold-rich
    eliteBonus: 35,              // actively seeks elites
    rewardTypeWeights: { Attack: 18, Power: 16, Skill: 8, Defense: -5, Support: -3, Utility: 5 },
    rewardMutRiskCutoff: null,
    restPriority: ['heal'],      // just heal, don't bother with card maintenance
    shopGoldReserve: 20,
    shopBuyCards: true,
    shopPreferCardTypes: ['Attack', 'Power', 'Skill'],
    shopAvoidCardTypes: ['Defense', 'Support'],
    shopBuyHeal: false,
    shopBuyRepair: false,
    shopBuyStabilise: false,
    shopBuyAccelerate: false,
    shopBuyRemoveCard: true,     // prune non-attack cards
    shopRemoveTargetTypes: ['Defense', 'Support'],
  },

  defensive: {
    label: 'Defensive',
    damageWeight: 0.7,
    blockWeight: 2.2,
    statusWeight: 1.7,           // raised: enemy debuffs reduce incoming damage (pure synergy)
    healWeight: 2.0,
    drawWeight: 1.0,
    ramWeight: 1.0,
    costPenalty: 3.5,
    useCounterPenalty: 12,
    finalMutCounterPenalty: 30,
    posMutBonus: 4,
    negMutPenalty: 5,
    restThreshold: 0.7,          // rest very aggressively
    shopGoldThreshold: 50,
    eliteBonus: -25,             // avoid elites
    rewardTypeWeights: { Attack: 0, Power: 8, Skill: 14, Defense: 22, Support: 14, Utility: 6 },
    rewardMutRiskCutoff: null,
    restPriority: ['heal', 'stabilise', 'repair'],
    shopGoldReserve: 25,
    shopBuyCards: true,
    shopPreferCardTypes: ['Defense', 'Skill', 'Support', 'Power'],
    shopAvoidCardTypes: ['Attack'],
    shopBuyHeal: true,
    shopBuyRepair: true,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyRemoveCard: false,
    shopRemoveTargetTypes: [],
  },

  buffDebuff: {
    label: 'Buff / Debuff',
    damageWeight: 0.8,
    blockWeight: 1.5,            // raised: defense as explicit secondary priority
    statusWeight: 2.8,
    healWeight: 1.0,             // slightly raised to keep alive
    drawWeight: 1.3,
    ramWeight: 1.3,
    costPenalty: 2.8,
    useCounterPenalty: 12,
    finalMutCounterPenalty: 28,
    posMutBonus: 9,
    negMutPenalty: 4,
    restThreshold: 0.6,          // slightly more cautious now that defense matters
    shopGoldThreshold: 55,
    eliteBonus: 8,               // elites worth it for the XP/loot
    rewardTypeWeights: { Attack: -5, Power: 18, Skill: 16, Defense: 10, Support: 12, Utility: 12 },
    rewardMutRiskCutoff: null,
    restPriority: ['stabilise', 'heal', 'repair'],  // protect key status cards first
    shopGoldReserve: 25,
    shopBuyCards: true,
    shopPreferCardTypes: ['Skill', 'Power', 'Defense', 'Utility', 'Support'],
    shopAvoidCardTypes: ['Attack'],
    shopBuyHeal: true,           // stay alive to apply statuses
    shopBuyRepair: false,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyRemoveCard: false,
    shopRemoveTargetTypes: [],
  },

  preservation: {
    label: 'Card Preservation',
    damageWeight: 1.0,
    blockWeight: 1.2,
    statusWeight: 1.0,
    healWeight: 1.3,
    drawWeight: 1.0,
    ramWeight: 1.0,
    costPenalty: 3.5,
    useCounterPenalty: 30,       // very heavy — avoids playing cards about to exhaust
    finalMutCounterPenalty: 60,  // extreme — strongly protects cards near final mutation
    posMutBonus: 5,
    negMutPenalty: 10,
    restThreshold: 0.6,
    shopGoldThreshold: 50,
    eliteBonus: -12,             // avoid elites (risky for cards)
    rewardTypeWeights: {},
    rewardMutRiskCutoff: 3,      // skip any reward card with countdown <= 3
    restPriority: ['repair', 'stabilise', 'heal'],  // card maintenance over healing
    shopGoldReserve: 20,
    shopBuyCards: false,         // don't expand deck — maintain what we have
    shopPreferCardTypes: [],
    shopAvoidCardTypes: [],
    shopBuyHeal: true,
    shopBuyRepair: true,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyRemoveCard: false,
    shopRemoveTargetTypes: [],
  },

  mutationPusher: {
    label: 'Mutation Pusher',
    damageWeight: 1.2,
    blockWeight: 0.8,
    statusWeight: 1.0,
    healWeight: 0.7,
    drawWeight: 0.9,
    ramWeight: 0.9,
    costPenalty: 2.5,
    useCounterPenalty: -18,      // BONUS — wants cards to exhaust and mutate
    finalMutCounterPenalty: -25, // BONUS — wants final mutations to fire
    posMutBonus: 8,
    negMutPenalty: 1,            // doesn't care much about negative mutations
    restThreshold: 0.4,
    shopGoldThreshold: 60,
    eliteBonus: 12,              // elites = more combat = more mutations
    rewardTypeWeights: { Attack: 5, Power: 8, Skill: 5, Defense: 0, Support: 5, Utility: 5 },
    rewardMutRiskCutoff: null,   // never skips risky cards
    restPriority: ['heal', 'repair'],  // no stabilise — never protect cards from mutating
    shopGoldReserve: 25,
    shopBuyCards: true,
    shopPreferCardTypes: ['Attack', 'Power', 'Skill'],
    shopAvoidCardTypes: [],
    shopBuyHeal: false,
    shopBuyRepair: false,
    shopBuyStabilise: false,     // never stabilise — let mutations happen
    shopBuyAccelerate: true,     // push cards toward final mutation faster
    shopBuyRemoveCard: false,
    shopRemoveTargetTypes: [],
  },
};

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Returns the next action to dispatch, or null.
 * @param {object} state      Full game state
 * @param {object} data       Loaded gamedata
 * @param {string} playstyle  Key from AI_PLAYSTYLES (default 'balanced')
 */
export function getAIAction(state, data, playstyle = 'balanced') {
  if (!state || !data) return null;

  switch (state.mode) {
    case 'Combat':
      return getCombatAction(state.combat, data, playstyle);

    case 'Map':
      return getMapAction(state.map, state.run, playstyle);

    case 'Reward':
      return getRewardAction(state.reward, data, playstyle);

    case 'Shop':
      // Handle pending deck selection after buying a card-targeting service
      if (state.deckView && state.shop?.pendingService) {
        const deckAction = getDeckSelectionAction(state.deck, data, playstyle, state.shop.pendingService);
        return deckAction ?? { type: 'Shop_Exit' }; // fallback: exit if no valid target
      }
      return getShopAction(state.shop, state.run, state.deck, data, playstyle);

    case 'Event':
      // Handle pending deck selection for rest-site repair/stabilise
      if (state.deckView && state.event?.pendingSelectOp) {
        const deckAction = getDeckSelectionAction(state.deck, data, playstyle, state.event.pendingSelectOp);
        return deckAction ?? { type: 'GoToMap' }; // fallback: skip if no valid target
      }
      return getEventAction(state.event, state.run, state.deck, data, playstyle);

    default:
      return null;
  }
}

// ─── Combat ──────────────────────────────────────────────────────────────────

function getCombatAction(combat, data, playstyle) {
  if (!combat) return null;

  if (combat.combatOver) {
    return { type: 'GoToMap' };
  }

  const { player, enemies, cardInstances } = combat;
  const aliveEnemies = (enemies || []).filter(e => e.hp > 0);
  if (aliveEnemies.length === 0) return { type: 'Combat_EndTurn' };

  let bestScore = -Infinity;
  let bestAction = null;

  for (const cid of (player.piles.hand || [])) {
    const ci = cardInstances[cid];
    if (!ci) continue;
    const def = data.cards[ci.defId];
    if (!def) continue;

    const cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
    if (player.ram < cost) continue;

    const isAoE = (def.effects || []).some(e => e.target === 'AllEnemies');
    // AoE cards score against first enemy (effects hit all anyway)
    const targets = isAoE ? [aliveEnemies[0]] : aliveEnemies;

    for (const enemy of targets) {
      const score = scoreCard(def, ci, enemy, aliveEnemies, player, playstyle);
      if (score > bestScore) {
        bestScore = score;
        bestAction = {
          type: 'Combat_PlayCard',
          cardInstanceId: cid,
          targetEnemyId: enemy.id,
        };
      }
    }
  }

  return bestAction ?? { type: 'Combat_EndTurn' };
}

function scoreCard(def, ci, target, aliveEnemies, player, playstyle) {
  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
  let score = 0;

  // Estimate total incoming damage for block valuation
  const incoming = aliveEnemies.reduce((sum, e) => {
    const intent = e.intent;
    return sum + (intent?.type === 'Attack' && typeof intent.amount === 'number' ? intent.amount : 0);
  }, 0);

  for (const effect of (def.effects || [])) {
    switch (effect.op) {
      case 'DealDamage': {
        const isAoE = effect.target === 'AllEnemies';
        const dmg = effect.amount || 0;
        if (isAoE) {
          for (const e of aliveEnemies) {
            score += e.hp <= dmg
              ? (1000 + aliveEnemies.length * 50) * ps.damageWeight
              : dmg * 2 * ps.damageWeight;
          }
        } else {
          if (target.hp <= dmg) {
            score += (1000 + aliveEnemies.length * 50) * ps.damageWeight;
          } else {
            score += dmg * 2 * ps.damageWeight;
            score += (1 - target.hp / target.maxHP) * 20; // prefer low-HP targets
          }
        }
        break;
      }
      case 'GainBlock': {
        const blockGain = effect.amount || 0;
        const usefulBlock = Math.min(blockGain, Math.max(0, incoming - (player.block || 0)));
        score += usefulBlock * 1.5 * ps.blockWeight;
        break;
      }
      case 'DrawCards':   score += (effect.amount || 0) * 5 * ps.drawWeight;   break;
      case 'GainRAM':     score += (effect.amount || 0) * 4 * ps.ramWeight;    break;
      case 'ApplyStatus': score += (effect.stacks || 1) * 3 * ps.statusWeight; break;
      case 'Heal': {
        const healNeed = (player.maxHP || 0) - (player.hp || 0);
        const urgency = player.hp < player.maxHP * 0.5 ? 2 : 0.5;
        score += Math.min(effect.amount || 0, healNeed) * urgency * ps.healWeight;
        break;
      }
    }
  }

  score -= cost * ps.costPenalty;

  // Mutation risk — these are negative penalties by default, but mutation pusher
  // makes them positive bonuses by using negative config values.
  if ((ci.useCounter ?? 0) <= 1)               score -= ps.useCounterPenalty;
  if ((ci.finalMutationCountdown ?? 8) <= 2)   score -= ps.finalMutCounterPenalty;

  // Reward accumulated positive mutations; penalise negative ones
  const appliedMuts = ci.appliedMutations || [];
  const posMuts = appliedMuts.filter(m => String(m).includes('+')).length;
  const negMuts = appliedMuts.filter(m => String(m).includes('-')).length;
  score += posMuts * ps.posMutBonus;
  score -= negMuts * ps.negMutPenalty;

  return score;
}

// ─── Map ─────────────────────────────────────────────────────────────────────

function getMapAction(map, run, playstyle) {
  if (!map) return null;

  const selectableIds = map.selectableNext || [];
  if (selectableIds.length === 0) return null;

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const nodes = map.nodes || {};
  const hpPct = run ? run.hp / run.maxHP : 1;
  const gold = run?.gold ?? 0;

  let bestScore = -Infinity;
  let bestId = selectableIds[0];

  for (const id of selectableIds) {
    const node = nodes[id];
    if (!node) continue;
    let score = 0;

    switch (node.type) {
      case 'Rest':
        // Strongly prefer Rest when hurt; mild bonus when somewhat damaged.
        score = hpPct < ps.restThreshold ? 70 : (hpPct < 0.8 ? 25 : 3);
        break;
      case 'Shop':
        // Only strongly prefer Shop when healthy — damaged players need to
        // keep combat options open so they can reach the Rest node.
        if (gold >= ps.shopGoldThreshold) {
          score = hpPct >= 0.8 ? 35 : (hpPct >= 0.55 ? 18 : 6);
        } else {
          score = 8;
        }
        break;
      case 'Combat':
        score = 20;
        break;
      case 'Event':
        score = 15;
        break;
      case 'Elite':
        // Never rush an Elite at low HP — it's a death trap.
        score = hpPct >= 0.75 ? (20 + (ps.eliteBonus || 0)) : 5;
        break;
      case 'Boss':
        score = 30; // always prioritise boss (it's the goal)
        break;
      default:
        score = 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return { type: 'SelectNextNode', nodeId: bestId };
}

// ─── Reward ──────────────────────────────────────────────────────────────────

function getRewardAction(reward, data, playstyle) {
  if (!reward) return null;

  const choices = reward.cardChoices || [];
  if (choices.length === 0) return { type: 'Reward_Skip' };

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  let bestScore = -Infinity;
  let bestDefId = null;

  for (const defId of choices) {
    const def = data.cards?.[defId];
    if (!def) continue;

    let score = 10; // base value: taking a card is generally worthwhile

    // Type preference bonus
    score += (ps.rewardTypeWeights || {})[def.type] || 0;

    // Mutation risk cutoff for preservation playstyle
    if (ps.rewardMutRiskCutoff !== null) {
      const countdown = def.defaultFinalMutationCountdown ?? 8;
      if (countdown <= ps.rewardMutRiskCutoff) score -= 200;
    }

    // Mutation pusher: prefer cards that will mutate quickly
    if (playstyle === 'mutationPusher') {
      const countdown = def.defaultFinalMutationCountdown ?? 8;
      score += Math.max(0, 8 - countdown) * 4;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDefId = defId;
    }
  }

  // Skip if no card scores positively
  if (bestScore < 0 || !bestDefId) return { type: 'Reward_Skip' };

  return { type: 'Reward_PickCard', defId: bestDefId };
}

// ─── Shop ────────────────────────────────────────────────────────────────────

function getShopAction(shop, run, deck, data, playstyle) {
  if (!shop || !run) return { type: 'Shop_Exit' };

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const gold = run.gold;
  const offers = shop.offers || [];
  const instances = Object.values(deck?.cardInstances || {});

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    if (gold < offer.price) continue;
    if (gold - offer.price < ps.shopGoldReserve) continue; // keep a gold reserve

    if (offer.kind === 'Card' && ps.shopBuyCards) {
      const def = data.cards?.[offer.defId];
      if (!def) continue;
      if ((ps.shopAvoidCardTypes || []).includes(def.type)) continue;
      const preferred = (ps.shopPreferCardTypes || []).includes(def.type);
      const noPreference = !ps.shopPreferCardTypes || ps.shopPreferCardTypes.length === 0;
      if (preferred || noPreference) {
        return { type: 'Shop_BuyOffer', index: i };
      }
    }

    if (offer.kind === 'Service') {
      if (offer.serviceId === 'Heal' && ps.shopBuyHeal) {
        if (run.hp < run.maxHP * 0.85) {
          return { type: 'Shop_BuyOffer', index: i };
        }
      }

      if (offer.serviceId === 'RemoveCard' && ps.shopBuyRemoveCard) {
        const hasTarget = instances.some(ci => {
          const def = data.cards?.[ci.defId];
          return def && (ps.shopRemoveTargetTypes || []).includes(def.type);
        });
        if (hasTarget) return { type: 'Shop_BuyOffer', index: i };
      }

      if (offer.serviceId === 'Repair' && ps.shopBuyRepair) {
        const hasTarget = instances.some(ci => {
          const def = data.cards?.[ci.defId];
          if (!def || ci.finalMutationId) return false;
          const maxUse = def.defaultUseCounter ?? 12;
          return (ci.useCounter ?? maxUse) < maxUse * 0.6;
        });
        if (hasTarget) return { type: 'Shop_BuyOffer', index: i };
      }

      if (offer.serviceId === 'Stabilise' && ps.shopBuyStabilise) {
        const hasTarget = instances.some(ci =>
          !ci.finalMutationId && (ci.finalMutationCountdown ?? 8) <= 4
        );
        if (hasTarget) return { type: 'Shop_BuyOffer', index: i };
      }

      if (offer.serviceId === 'Accelerate' && ps.shopBuyAccelerate) {
        const hasTarget = instances.some(ci =>
          !ci.finalMutationId && (ci.finalMutationCountdown ?? 8) > 0
        );
        if (hasTarget) return { type: 'Shop_BuyOffer', index: i };
      }
    }
  }

  return { type: 'Shop_Exit' };
}

// ─── Deck Selection (card-targeting services and rest ops) ───────────────────

function getDeckSelectionAction(deck, data, playstyle, op) {
  if (!deck) return null;

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const instances = Object.values(deck.cardInstances || {});
  const active = instances.filter(ci => !ci.finalMutationId);

  if (op === 'RemoveCard') {
    // Try to remove a card matching the playstyle's remove targets first
    let target = null;
    if (ps.shopRemoveTargetTypes?.length > 0) {
      target = active.find(ci => {
        const def = data.cards?.[ci.defId];
        return def && ps.shopRemoveTargetTypes.includes(def.type);
      });
    }
    // Fallback: remove the most degraded card
    if (!target) {
      target = [...active].sort((a, b) => (a.useCounter ?? 0) - (b.useCounter ?? 0))[0];
    }
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'RepairSelectedCard' || op === 'Repair') {
    // Pick the card most degraded relative to its max use counter
    const scored = active.map(ci => {
      const def = data.cards?.[ci.defId];
      const max = def?.defaultUseCounter ?? 12;
      return { ci, ratio: (ci.useCounter ?? max) / max };
    }).sort((a, b) => a.ratio - b.ratio);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'StabiliseSelectedCard' || op === 'Stabilise') {
    // Pick the card closest to triggering final mutation
    const scored = active
      .map(ci => ({ ci, countdown: ci.finalMutationCountdown ?? 8 }))
      .sort((a, b) => a.countdown - b.countdown);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'AccelerateSelectedCard' || op === 'Accelerate') {
    // Mutation pusher: pick card with most remaining countdown to push toward mutation
    const scored = active
      .map(ci => ({ ci, countdown: ci.finalMutationCountdown ?? 8 }))
      .sort((a, b) => b.countdown - a.countdown);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  return null;
}

// ─── Event ───────────────────────────────────────────────────────────────────

function getEventAction(event, run, deck, data, playstyle) {
  if (!event) return null;

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const hpPct = run ? run.hp / run.maxHP : 1;

  if (event.eventId === 'RestSite') {
    // Try each priority option in sequence
    for (const choice of (ps.restPriority || ['heal'])) {
      if (choice === 'heal' && hpPct < 0.95) {
        return { type: 'Rest_Heal' };
      }
      if (choice === 'repair' && deck) {
        const instances = Object.values(deck.cardInstances || {});
        const hasTarget = instances.some(ci => {
          const def = data.cards?.[ci.defId];
          if (!def || ci.finalMutationId) return false;
          const maxUse = def.defaultUseCounter ?? 12;
          return (ci.useCounter ?? maxUse) < maxUse * 0.55;
        });
        if (hasTarget) return { type: 'Rest_Repair' };
      }
      if (choice === 'stabilise' && deck) {
        const instances = Object.values(deck.cardInstances || {});
        const hasTarget = instances.some(ci =>
          !ci.finalMutationId && (ci.finalMutationCountdown ?? 8) <= 3
        );
        if (hasTarget) return { type: 'Rest_Stabilise' };
      }
    }
    // Fallback
    return hpPct < 0.99 ? { type: 'Rest_Heal' } : { type: 'Rest_Leave' };
  }

  if (event.eventId === 'StreetDoc') {
    return (run && run.gold >= 40 && run.hp < run.maxHP * 0.75)
      ? { type: 'Event_Choose', choiceId: 'pay_heal' }
      : { type: 'Event_Choose', choiceId: 'leave' };
  }

  if (event.eventId === 'DataCache') {
    return { type: 'Event_Choose', choiceId: 'play_safe' };
  }

  // Unknown event: return null (will be retried next tick)
  return null;
}
