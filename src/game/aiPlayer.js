import { createBasicEventRegistry } from "./events.js";
import { MINIGAME_REGISTRY, isMinigameEvent } from "./minigames.js";
import { dispatchCombat, getCardPlayability, getCardTargetingProfile } from "./engine.js";
import { getCompilePreview } from "./cardCompile.js";
import { getHeatState } from "./combatMeta.js";

/**
 * aiPlayer.js â€” Pure AI decision functions for the auto-play debug feature.
 * No React imports, no side effects. Returns action objects or null.
 */

// â”€â”€â”€ Playstyle Configurations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    rewardSkipFloor: -18,        // skip only truly bad reward cards
    // rest site priority order: tries each in sequence
    restPriority: ['heal', 'forge', 'stabilise', 'repair'],
    // shop
    shopGoldReserve: 40,         // won't buy if it leaves less than this gold
    shopScrapReserve: 0,
    shopBuyCards: true,
    shopPreferCardTypes: ['Attack', 'Power', 'Skill', 'Defense'],
    shopAvoidCardTypes: [],
    shopBuyHeal: true,
    shopBuyRepair: false,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyForge: true,
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
    useCounterPenalty: 4,        // low â€” risk is acceptable
    finalMutCounterPenalty: 8,   // low â€” mutation risk is acceptable
    posMutBonus: 7,
    negMutPenalty: 2,
    restThreshold: 0.25,         // only rest when critically low
    shopGoldThreshold: 80,       // only detour to shops when very gold-rich
    eliteBonus: 35,              // actively seeks elites
    rewardTypeWeights: { Attack: 18, Power: 16, Skill: 8, Defense: -5, Support: -3, Utility: 5 },
    rewardMutRiskCutoff: null,
    rewardSkipFloor: -24,
    restPriority: ['heal'],      // just heal, don't bother with card maintenance
    shopGoldReserve: 20,
    shopScrapReserve: 0,
    shopBuyCards: true,
    shopPreferCardTypes: ['Attack', 'Power', 'Skill'],
    shopAvoidCardTypes: ['Defense', 'Support'],
    shopBuyHeal: false,
    shopBuyRepair: false,
    shopBuyStabilise: false,
    shopBuyAccelerate: false,
    shopBuyForge: false,
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
    rewardSkipFloor: -16,
    restPriority: ['heal', 'forge', 'stabilise', 'repair'],
    shopGoldReserve: 25,
    shopScrapReserve: 0,
    shopBuyCards: true,
    shopPreferCardTypes: ['Defense', 'Skill', 'Support', 'Power'],
    shopAvoidCardTypes: ['Attack'],
    shopBuyHeal: true,
    shopBuyRepair: true,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyForge: true,
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
    rewardSkipFloor: -16,
    restPriority: ['stabilise', 'heal', 'forge', 'repair'],  // protect key status cards first
    shopGoldReserve: 25,
    shopScrapReserve: 0,
    shopBuyCards: true,
    shopPreferCardTypes: ['Skill', 'Power', 'Defense', 'Utility', 'Support'],
    shopAvoidCardTypes: ['Attack'],
    shopBuyHeal: true,           // stay alive to apply statuses
    shopBuyRepair: false,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyForge: true,
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
    useCounterPenalty: 30,       // very heavy â€” avoids playing cards about to exhaust
    finalMutCounterPenalty: 60,  // extreme â€” strongly protects cards near final mutation
    posMutBonus: 5,
    negMutPenalty: 10,
    restThreshold: 0.6,
    shopGoldThreshold: 50,
    eliteBonus: -12,             // avoid elites (risky for cards)
    rewardTypeWeights: {},
    rewardMutRiskCutoff: 3,      // skip any reward card with countdown <= 3
    rewardSkipFloor: 6,
    restPriority: ['forge', 'repair', 'stabilise', 'heal'],  // card maintenance over healing
    shopGoldReserve: 20,
    shopScrapReserve: 1,
    shopBuyCards: false,         // don't expand deck â€” maintain what we have
    shopPreferCardTypes: [],
    shopAvoidCardTypes: [],
    shopBuyHeal: true,
    shopBuyRepair: true,
    shopBuyStabilise: true,
    shopBuyAccelerate: false,
    shopBuyForge: true,
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
    useCounterPenalty: -18,      // BONUS â€” wants cards to exhaust and mutate
    finalMutCounterPenalty: -25, // BONUS â€” wants final mutations to fire
    posMutBonus: 8,
    negMutPenalty: 1,            // doesn't care much about negative mutations
    restThreshold: 0.4,
    shopGoldThreshold: 60,
    eliteBonus: 12,              // elites = more combat = more mutations
    rewardTypeWeights: { Attack: 5, Power: 8, Skill: 5, Defense: 0, Support: 5, Utility: 5 },
    rewardMutRiskCutoff: null,   // never skips risky cards
    rewardSkipFloor: -30,
    restPriority: ['heal', 'repair'],  // no stabilise â€” never protect cards from mutating
    shopGoldReserve: 25,
    shopScrapReserve: 0,
    shopBuyCards: true,
    shopPreferCardTypes: ['Attack', 'Power', 'Skill'],
    shopAvoidCardTypes: [],
    shopBuyHeal: false,
    shopBuyRepair: false,
    shopBuyStabilise: false,     // never stabilise â€” let mutations happen
    shopBuyAccelerate: true,     // push cards toward final mutation faster
    shopBuyForge: false,
    shopBuyRemoveCard: false,
    shopRemoveTargetTypes: [],
  },
};

const EVENT_REG = createBasicEventRegistry();
const REST_FORGE_COST = 3;

const STATUS_NAME_ALIASES = {
  firewall: "Firewall",
  weak: "Weak",
  vulnerable: "Vulnerable",
  leak: "Leak",
  "exposed ports": "ExposedPorts",
  "sensor glitch": "SensorGlitch",
  corrode: "Corrode",
  underclock: "Underclock",
  overclock: "Overclock",
  overclocked: "Overclock",
  nanoflow: "Nanoflow",
  "target spoof": "TargetSpoof",
  throttled: "Throttled",
  "trace beacon": "TraceBeacon",
  overheat: "Overheat",
  burn: "Burn",
  "corrupted sector": "CorruptedSector",
  "dazed packets": "DazedPackets",
};

const RAW_STATUS_NAMES = Object.keys(STATUS_NAME_ALIASES).sort((a, b) => b.length - a.length);

const SELF_BUFF_STATUSES = new Set(["Firewall", "Nanoflow", "Overclock"]);
const SELF_DEBUFF_STATUSES = new Set([
  "Weak",
  "Vulnerable",
  "Leak",
  "ExposedPorts",
  "SensorGlitch",
  "Corrode",
  "Underclock",
  "TargetSpoof",
  "Throttled",
  "TraceBeacon",
  "Overheat",
  "Burn",
  "CorruptedSector",
  "DazedPackets",
]);
const ENEMY_DEBUFF_STATUSES = new Set([
  "Weak",
  "Vulnerable",
  "Leak",
  "ExposedPorts",
  "SensorGlitch",
  "Corrode",
  "Underclock",
  "TargetSpoof",
  "Throttled",
  "TraceBeacon",
  "Overheat",
  "Burn",
]);
const ENEMY_BUFF_STATUSES = new Set(["Firewall", "Nanoflow", "Overclock"]);

const POSITIVE_MUTATION_OPS = new Set([
  "EffectMult",
  "DamageMult",
  "ApplyEnemyStatus",
  "AddCopyToHand",
  "MutationResist",
  "SelfDamageResist",
  "RAMBufferMod",
  "GainFirewall",
]);
const NEGATIVE_MUTATION_OPS = new Set([
  "DealSelfDamage",
  "FirstPlayExtraCost",
  "RandomizeEffectMult",
  "LoseRAM",
  "LoseFirewall",
  "ClearSelfFirewall",
  "Fizzle",
  "SwapTarget",
  "DeferredPlay",
  "NotFirst",
  "MustPlayFirst",
  "DelayedSelfDamage",
  "AccelerateCountdown",
  "IncreaseCostPermanent",
  "ReduceMaxRAM",
  "ReduceMaxHP",
  "SplitDamageSelf",
  "DelayEffect",
  "RandomizeCost",
  "InvertEffects",
  "UnstableTiming",
  "ChokePenalty",
  "GrantEnemyEffect",
  "HiddenInvert",
  "LoseType",
  "RequireHPAbove",
  "ConditionalPenalty",
  "DisabledBelowHP",
  "RequireEnemyStatus",
  "CannotFollowPrevious",
  "LockedSlot",
  "PlayWindowTurns",
  "Disabled",
  "NoEffect",
  "TransferToEnemy",
  "LockHand",
]);

function getStatusStacks(entity, statusId) {
  return (entity?.statuses || []).find((status) => status.id === statusId)?.stacks || 0;
}

function getFirewall(entity) {
  return getStatusStacks(entity, "Firewall");
}

function getProtection(entity) {
  return getFirewall(entity);
}

function getEnemyDef(enemy, data) {
  return data?.enemies?.[enemy?.enemyDefId] || null;
}

function getDamageAmpStacks(entity) {
  return (entity?.statuses || [])
    .filter((status) => status.id === "Vulnerable" || status.id === "ExposedPorts")
    .reduce((sum, status) => sum + (status.stacks || 1), 0);
}

function getDamageAmpMultiplier(entity) {
  return 1 + (getDamageAmpStacks(entity) * 0.2);
}

function getEnemyThreatScore(enemy, data, livingEnemyCount = 1) {
  if (!enemy || enemy.hp <= 0) return -Infinity;

  const enemyDef = getEnemyDef(enemy, data);
  const role = enemyDef?.role || enemyDef?.primaryPurpose || "";
  const protection = getProtection(enemy);
  const firewall = getFirewall(enemy);
  const hpPct = enemy.maxHP > 0 ? enemy.hp / enemy.maxHP : 1;
  let score = 0;

  switch (enemy.intent?.type) {
    case 'Attack':
      score += 24 + ((enemy.intent?.amount || 0) * 1.8);
      break;
    case 'Debuff':
      score += 20 + ((enemy.intent?.amount || 0) * 1.3);
      break;
    case 'Buff':
      score += 12 + ((enemy.intent?.amount || 0) * 0.8);
      break;
    case 'Defense':
      score += 8 + Math.min(protection, 18);
      break;
    default:
      score += 6;
      break;
  }

  if (role === 'Support/Heal') score += livingEnemyCount > 1 ? 22 : 10;
  else if (role === 'Defense/Tank') score += livingEnemyCount > 1 ? 16 : 8;
  else if (role === 'Debuff/DoT') score += 12;
  else if (role === 'Control' || role === 'Economy pressure') score += 9;

  if (enemyIsHealer(enemy, data)) score += 16;
  if (getStatusStacks(enemy, 'Nanoflow') > 0) score += 8;
  if (getStatusStacks(enemy, 'Overclock') > 0) score += 6;
  if (firewall > 0) score += Math.min(firewall, 16) * 0.5;
  if (protection > 0 && enemy.intent?.type !== 'Defense') score += Math.min(protection, 20) * 0.3;
  if (enemy.intent?.type === 'Defense' && livingEnemyCount > 1) score += 12 + Math.min(protection, 18) * 0.45;
  if (hpPct <= 0.35) score += 10;
  if (hpPct <= 0.18) score += 14;

  return score;
}

function findMentionedStatus(text) {
  const haystack = String(text || "").toLowerCase();
  for (const rawName of RAW_STATUS_NAMES) {
    if (haystack.includes(rawName)) return STATUS_NAME_ALIASES[rawName];
  }
  return null;
}

function splitRawTextClauses(text) {
  return String(text || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function summarizeCombatCard(def) {
  const summary = {
    damage: 0,
    defense: 0,
    heal: 0,
    draw: 0,
    gainRAM: 0,
    firewallGain: 0,
    firewallBreach: 0,
    firewallBreachAll: false,
    firewallSpend: false,
    xCost: false,
    targetsAllEnemies: false,
    type: def?.type ?? null,
  };

  for (const effect of (def?.effects || [])) {
    if (!effect) continue;
    switch (effect.op) {
      case 'DealDamage':
        summary.damage += effect.amount || 0;
        if (effect.target === 'AllEnemies') summary.targetsAllEnemies = true;
        break;
      case 'GainBlock':
        summary.defense += effect.amount || 0;
        summary.firewallGain += effect.amount || 0;
        break;
      case 'Heal':
        summary.heal += effect.amount || 0;
        break;
      case 'DrawCards':
        summary.draw += effect.amount || 0;
        break;
      case 'GainRAM':
        summary.gainRAM += effect.amount || 0;
        break;
      case 'ApplyStatus':
        if (effect.statusId === 'Firewall' && effect.target === 'Self') {
          summary.firewallGain += effect.stacks || 0;
        }
        if (effect.target === 'AllEnemies') summary.targetsAllEnemies = true;
        break;
      case 'RawText':
        for (const line of splitRawTextClauses(effect.text || '')) {
          let match = null;
          if ((match = line.match(/\bDeal\s+([+-]?\d+)\s+damage per RAM(?: spent)?\b/i))) {
            summary.damage += parseInt(match[1], 10);
            summary.xCost = true;
          } else if ((match = line.match(/\bDeal\s+([+-]?\d+)\s+damage to ALL enemies\b/i))) {
            summary.damage += parseInt(match[1], 10);
            summary.targetsAllEnemies = true;
          } else if ((match = line.match(/\bDeal\s+([+-]?\d+)\s+damage\b/i))) {
            summary.damage += parseInt(match[1], 10);
          }
          if ((match = line.match(/\bGain\s+([+-]?\d+)\s+Firewall per RAM spent\b/i))) {
            summary.firewallGain += parseInt(match[1], 10);
            summary.xCost = true;
          } else if ((match = line.match(/\bGain\s+([+-]?\d+)\s+Firewall\b/i))) {
            summary.firewallGain += parseInt(match[1], 10);
          }
          if ((match = line.match(/\b(?:Gain|Restore)\s+([+-]?\d+)\s+RAM\b/i))) {
            summary.gainRAM += parseInt(match[1], 10);
          }
          if ((match = line.match(/\bDraw\s+([+-]?\d+)\b/i))) {
            summary.draw += parseInt(match[1], 10);
          }
          if (/\bStrip\s+all\s+Firewall from ALL enemies\b/i.test(line)) {
            summary.firewallBreachAll = true;
            summary.targetsAllEnemies = true;
          } else if ((match = line.match(/\bStrip\s+([+-]?\d+)\s+Firewall from ALL enemies\b/i))) {
            summary.firewallBreachAll = true;
            summary.firewallBreach = Math.max(summary.firewallBreach, parseInt(match[1], 10));
            summary.targetsAllEnemies = true;
          } else if (/\bStrip\s+all\s+Firewall\b/i.test(line)) {
            summary.firewallBreach = Number.MAX_SAFE_INTEGER;
          } else if ((match = line.match(/\bStrip\s+([+-]?\d+)\s+Firewall\b/i))) {
            summary.firewallBreach = Math.max(summary.firewallBreach, parseInt(match[1], 10));
          }
          if (/Lose all Firewall/i.test(line) && /that much damage/i.test(line)) {
            summary.firewallSpend = true;
            summary.damage = Math.max(summary.damage, 1);
          }
          if (/Spend all remaining RAM/i.test(line)) {
            summary.xCost = true;
          }
        }
        break;
      default:
        break;
    }
  }

  return summary;
}

function getCardRulesText(def) {
  return (def?.effects || [])
    .filter((effect) => effect?.op === 'RawText' && effect?.text)
    .map((effect) => effect.text)
    .join(' | ');
}

function cardProvidesPressure(def) {
  const summary = summarizeCombatCard(def);
  const text = getCardRulesText(def);
  return summary.damage >= 6
    || summary.firewallBreachAll
    || summary.firewallBreach > 0
    || /\bApply\s+\d+\s+(Corrode|Leak|Exposed Ports|Vulnerable|Weak|Underclock|Sensor Glitch|Overheat|Burn)\b/i.test(text);
}

function cardProvidesSustain(def) {
  const summary = summarizeCombatCard(def);
  const text = getCardRulesText(def);
  return summary.firewallGain > 0
    || summary.heal > 0
    || /\bNanoflow\b/i.test(text);
}

function cardProvidesUtility(def) {
  const summary = summarizeCombatCard(def);
  const text = getCardRulesText(def);
  return summary.draw > 0
    || summary.gainRAM > 0
    || /\bScry\b/i.test(text)
    || /\bSearch your draw pile\b/i.test(text)
    || /\bshuffle\b/i.test(text);
}

function getDeckRoleProfile(deck, data) {
  const profile = {
    pressureCount: 0,
    sustainCount: 0,
    utilityCount: 0,
  };

  for (const cardInstance of Object.values(deck?.cardInstances || {})) {
    if (!cardInstance || cardInstance.finalMutationId) continue;
    const def = data?.cards?.[cardInstance.defId];
    if (!def) continue;
    if (cardProvidesPressure(def)) profile.pressureCount += 1;
    if (cardProvidesSustain(def)) profile.sustainCount += 1;
    if (cardProvidesUtility(def)) profile.utilityCount += 1;
  }

  return profile;
}

function scoreStatusApplication(statusId, stacks, targetKind, context) {
  const { player, target, aliveEnemies, ps, scoreBlockGain } = context;
  const clampedStacks = Math.max(0, stacks || 0);
  if (clampedStacks <= 0 || !statusId) return 0;

  if (targetKind === "AllEnemies") {
    return aliveEnemies.reduce((sum, enemy) => (
      sum + scoreStatusApplication(statusId, clampedStacks, "Enemy", { ...context, target: enemy })
    ), 0);
  }

  if (targetKind === "Self") {
    if (statusId === "Firewall") {
      return scoreBlockGain(clampedStacks * 1.15);
    }
    if (statusId === "Nanoflow") {
      const missingHp = Math.max(0, (player?.maxHP || 0) - (player?.hp || 0));
      return Math.min(clampedStacks * 3, missingHp || clampedStacks * 3) * ps.healWeight;
    }
    if (statusId === "Overclock") {
      return clampedStacks * 7 * ps.damageWeight;
    }
    if (SELF_DEBUFF_STATUSES.has(statusId)) {
      const base = STATUS_BASE_SCORES[statusId] ?? 4;
      return -clampedStacks * base * Math.max(1, ps.statusWeight * 0.9);
    }
    return clampedStacks * 2.5 * ps.statusWeight;
  }

  if (statusId === "Firewall" || ENEMY_BUFF_STATUSES.has(statusId)) {
    return -clampedStacks * (STATUS_BASE_SCORES[statusId] ?? 5) * Math.max(0.8, ps.statusWeight * 0.7);
  }

  const base = STATUS_BASE_SCORES[statusId] ?? 3;
  let score = clampedStacks * base * ps.statusWeight;
  const existingStacks = getStatusStacks(target, statusId);
  if (existingStacks > 0) {
    score *= 1 + Math.min(0.6, existingStacks * 0.15);
  }
  if (!ENEMY_DEBUFF_STATUSES.has(statusId) && !SELF_BUFF_STATUSES.has(statusId)) {
    score *= 0.75;
  }
  return score;
}

function scoreMutationSentiment(mutationId, data) {
  const mutation = data?.mutations?.[mutationId];
  if (!mutation) return 0;

  let score = 0;
  if ((mutation.ramCostDelta || 0) < 0) score += 2;
  if ((mutation.ramCostDelta || 0) > 0) score -= 2;
  if ((mutation.useCounterDelta || 0) > 0) score += 1;
  if ((mutation.useCounterDelta || 0) < 0) score -= 1;
  if ((mutation.finalCountdownDelta || 0) > 0) score += 1;
  if ((mutation.finalCountdownDelta || 0) < 0) score -= 2;

  const patch = String(mutation.patch || "");
  for (const op of POSITIVE_MUTATION_OPS) {
    if (patch.includes(`:${op}`)) score += 1;
  }
  for (const op of NEGATIVE_MUTATION_OPS) {
    if (patch.includes(`:${op}`)) score -= 1;
  }

  return score === 0 ? 0 : (score > 0 ? 1 : -1);
}

function scoreRawTextLine(line, context) {
  const { player, ps, scoreBlockGain, scoreDamage } = context;
  const text = String(line || "").trim();
  if (!text) return 0;

  const playerRam = Math.max(0, player?.ram || 0);
  const playerMaxRam = Math.max(playerRam, player?.maxRAM || 0);
  const playerFirewall = getFirewall(player);
  const targetFirewall = getFirewall(context.target);
  const totalEnemyFirewall = (context.aliveEnemies || []).reduce((sum, enemy) => sum + getFirewall(enemy), 0);
  const isPower = /POWER:/i.test(text);
  let score = 0;
  let match = null;

  if ((match = text.match(/\b(?:Gain|Restore)\s+([+-]?\d+)\s+RAM\b/i))) {
    score += parseInt(match[1], 10) * 4 * ps.ramWeight;
  }
  if ((match = text.match(/\bNext turn,\s+gain\s+([+-]?\d+)\s+RAM\b/i))) {
    score += parseInt(match[1], 10) * 3 * ps.ramWeight;
  }
  if (/Double your current RAM/i.test(text)) {
    const ramHeadroom = Math.max(0, playerMaxRam - playerRam);
    score += Math.min(playerRam, ramHeadroom) * 4.5 * ps.ramWeight;
  }
  if (/playing cards does not consume RAM/i.test(text)) {
    score += Math.max(8, playerRam * 4) * ps.ramWeight;
  }

  if ((match = text.match(/\bGain\s+([+-]?\d+)\s+Firewall per RAM spent\b/i))) {
    score += scoreBlockGain(parseInt(match[1], 10) * Math.max(1, playerRam));
  } else if ((match = text.match(/\bGain\s+([+-]?\d+)\s+Firewall\b/i))) {
    score += scoreBlockGain(parseInt(match[1], 10));
  }

  if ((match = text.match(/\bHeal\s+([+-]?\d+)\s+HP per RAM spent\b/i))) {
    const missingHp = Math.max(0, (player?.maxHP || 0) - (player?.hp || 0));
    score += Math.min(parseInt(match[1], 10) * Math.max(1, playerRam), missingHp) * Math.max(0.6, ps.healWeight);
  } else if ((match = text.match(/\bHeal\s+([+-]?\d+)\s+HP\b/i))) {
    const missingHp = Math.max(0, (player?.maxHP || 0) - (player?.hp || 0));
    score += Math.min(parseInt(match[1], 10), missingHp) * Math.max(0.6, ps.healWeight);
  }

  if ((match = text.match(/\bDeal\s+([+-]?\d+)\s+damage per RAM(?: spent)?\b/i))) {
    score += scoreDamage(parseInt(match[1], 10) * Math.max(1, playerRam), /ALL enemies/i.test(text));
  } else if ((match = text.match(/\bDeal\s+([+-]?\d+)\s+damage to ALL enemies\b/i))) {
    score += scoreDamage(parseInt(match[1], 10), true);
  } else if ((match = text.match(/\bDeal\s+([+-]?\d+)\s+damage\b/i))) {
    score += scoreDamage(parseInt(match[1], 10), false);
  }

  if (/Lose all Firewall/i.test(text) && /(?:Deal|Apply) that much damage to ALL enemies/i.test(text)) {
    score += scoreDamage(playerFirewall, true);
  } else if (/Lose all Firewall/i.test(text) && /(?:Deal|Apply) that much damage/i.test(text)) {
    score += scoreDamage(playerFirewall, false);
  }

  if (/\bStrip\s+all\s+Firewall from ALL enemies\b/i.test(text)) {
    score += totalEnemyFirewall * 1.8;
  } else if (/\bStrip\s+all\s+Firewall\b/i.test(text)) {
    score += targetFirewall * 1.8;
  } else if ((match = text.match(/\bStrip\s+([+-]?\d+)\s+Firewall from ALL enemies\b/i))) {
    score += Math.min(parseInt(match[1], 10), totalEnemyFirewall) * 1.8;
  } else if ((match = text.match(/\bStrip\s+([+-]?\d+)\s+Firewall\b/i))) {
    score += Math.min(parseInt(match[1], 10), targetFirewall) * 1.8;
  }

  if ((match = text.match(/\bDraw\s+([+-]?\d+)\b/i))) {
    score += parseInt(match[1], 10) * 5 * ps.drawWeight;
  }

  const statusId = findMentionedStatus(text);
  if (statusId && !/that much damage/i.test(text)) {
    const baseStacks = parseInt(text.match(/\b(?:Apply|Gain)\s+([+-]?\d+)/i)?.[1] || "1", 10);
    const perRam = /per RAM spent/i.test(text) ? Math.max(1, playerRam) : 1;
    const stacks = Math.max(1, baseStacks) * perRam;
    if (/\bApply\b/i.test(text)) {
      const targetKind = /ALL enemies/i.test(text)
        ? "AllEnemies"
        : (ENEMY_DEBUFF_STATUSES.has(statusId) ? "Enemy" : "Self");
      score += scoreStatusApplication(statusId, stacks, targetKind, context);
    } else if (/\bGain\b/i.test(text) && statusId !== "Firewall") {
      score += scoreStatusApplication(statusId, stacks, "Self", context);
    }
  }

  if ((match = text.match(/\bLose\s+([+-]?\d+)\s+HP per RAM spent\b/i))) {
    score -= parseInt(match[1], 10) * Math.max(1, playerRam) * 4.5 * Math.max(0.8, ps.healWeight);
  } else if ((match = text.match(/\bLose\s+([+-]?\d+)\s+HP\b/i))) {
    score -= parseInt(match[1], 10) * 4 * Math.max(0.8, ps.healWeight);
  }
  if ((match = text.match(/\btake\s+([+-]?\d+)\s+damage\b/i))) {
    score -= parseInt(match[1], 10) * 4.2 * Math.max(0.8, ps.healWeight);
  }

  if (/ignore a random negative mutation trigger/i.test(text)) {
    score += Math.max(6, ps.negMutPenalty * 2.5);
  }
  if (/place it into Removed for this combat/i.test(text)) {
    score -= 18;
  }
  if (/No effect/i.test(text)) {
    score -= 6;
  }

  if (isPower && score > 0) {
    score *= 2.2;
  }

  return score;
}

function getBaseFinalMutationCountdown(def) {
  const baseUse = Number(def?.defaultUseCounter ?? 12);
  const baseFinal = Number(def?.defaultFinalMutationCountdown ?? 8);
  return Math.max(
    Number.isFinite(baseFinal) ? baseFinal : 8,
    (Number.isFinite(baseUse) ? baseUse : 12) * 3,
  );
}

function getCardUseCounterLimit(ci, data) {
  const def = data?.cards?.[ci?.defId];
  let maxUse = Number(def?.defaultUseCounter ?? 12);
  for (const mid of ci?.appliedMutations || []) {
    maxUse += Number(data?.mutations?.[mid]?.useCounterDelta ?? 0);
  }
  return Math.max(1, Number.isFinite(maxUse) ? maxUse : 12);
}

function getMutationPassiveMultiplier(ci, data, op) {
  let mult = 1;
  for (const mid of ci?.appliedMutations || []) {
    const patch = data?.mutations?.[mid]?.patch || '';
    for (const segment of patch.split('|')) {
      const [trigger, entryOp, rawValue] = segment.split(':');
      if (trigger !== 'passive' || entryOp !== op) continue;
      const value = Number(rawValue);
      if (Number.isFinite(value) && value > 0) mult *= value;
    }
  }
  return Math.max(0.25, mult);
}

function getPlaysUntilMutation(ci, data) {
  const remaining = Math.max(0, Number(ci?.useCounter ?? getCardUseCounterLimit(ci, data)));
  const step = getMutationPassiveMultiplier(ci, data, 'MutationChanceMult');
  return Math.max(0, Math.ceil(remaining / step));
}

function getPlaysUntilFinalMutation(ci, data) {
  const def = data?.cards?.[ci?.defId];
  const remaining = Math.max(0, Number(ci?.finalMutationCountdown ?? getBaseFinalMutationCountdown(def)));
  const step = getMutationPassiveMultiplier(ci, data, 'CountdownMult');
  return Math.max(0, Math.ceil(remaining / step));
}

function getMutationRiskPreference(playstyle) {
  switch (playstyle) {
    case 'mutationPusher': return 1.2;
    case 'aggressive': return 0.2;
    case 'balanced': return -0.15;
    case 'buffDebuff': return -0.1;
    case 'defensive': return -0.55;
    case 'preservation': return -0.9;
    default: return -0.1;
  }
}

function makeVirtualCardInstance(def, overrides = {}) {
  return {
    defId: def?.id,
    useCounter: def?.defaultUseCounter ?? 12,
    finalMutationCountdown: getBaseFinalMutationCountdown(def),
    appliedMutations: [],
    ramCostDelta: 0,
    ...overrides,
  };
}

function scoreCardForPickup(def, data, playstyle, run = null, deck = null, cardInstance = null) {
  if (!def) return -Infinity;

  const player = {
    hp: run?.hp ?? 42,
    maxHP: run?.maxHP ?? 75,
    statuses: [],
    ram: Math.max(2, Math.min(run?.maxRAM ?? 8, def.costRAM ?? 2)),
    maxRAM: run?.maxRAM ?? 8,
  };
  const target = { hp: 36, maxHP: 36, statuses: [] };
  const aliveEnemies = [target, { hp: 32, maxHP: 32, statuses: [] }];
  const instance = cardInstance || makeVirtualCardInstance(def);
  let score = scoreCard(def, instance, target, aliveEnemies, player, playstyle, data);
  const offersPressure = cardProvidesPressure(def);
  const offersSustain = cardProvidesSustain(def);
  const offersUtility = cardProvidesUtility(def);

  if (deck) {
    const sameTypeCount = Object.values(deck.cardInstances || {})
      .filter((ci) => data.cards?.[ci.defId]?.type === def.type)
      .length;
    if (sameTypeCount >= 5 && def.type === "Attack") score -= 2;

    const earlyAct = (run?.act ?? 1) === 1 && (run?.floor ?? 0) <= 4;
    if (earlyAct) {
      const profile = getDeckRoleProfile(deck, data);
      if (profile.pressureCount < 5) {
        if (offersPressure) score += 10 + Math.max(0, 5 - profile.pressureCount) * 1.5;
        else if (offersSustain && profile.sustainCount >= 3 && !offersUtility) score -= 6;
      }
      if (profile.utilityCount < 2 && offersUtility) score += 4;
    }
  }

  return score;
}

function chooseMinigameTier(playstyle, eventId) {
  const type = MINIGAME_REGISTRY[eventId]?.type;
  if (!type) return "silver";

  if (playstyle === "aggressive" || playstyle === "mutationPusher") {
    return (type === "timing" || type === "rapid") ? "gold" : "silver";
  }
  if (playstyle === "defensive" || playstyle === "preservation") {
    return (type === "memory" || type === "sequence") ? "gold" : "silver";
  }
  if (playstyle === "buffDebuff") {
    return type === "sequence" ? "gold" : "silver";
  }
  return "silver";
}

function getDeckCardValue(ci, data, playstyle, deck = null, run = null) {
  const def = data.cards?.[ci?.defId];
  if (!def) return -Infinity;
  return scoreCardForPickup(def, data, playstyle, run, deck, ci);
}

function getRunCurrencyAmount(run, currency = "gold") {
  if (currency === "scrap") return Math.max(0, Number(run?.scrap || 0));
  return Math.max(0, Number(run?.gold || 0));
}

function scoreForgeTarget(ci, data, playstyle, deck, run = null) {
  if (!ci || ci.finalMutationId) return -Infinity;

  const def = data.cards?.[ci.defId];
  if (!def) return -Infinity;

  const compilePreview = getCompilePreview(def, ci);
  const mutationIds = ci.appliedMutations || [];
  const latestMutationId = mutationIds[mutationIds.length - 1] || null;
  const latestIsNegative = !!latestMutationId && latestMutationId.includes("-") && !latestMutationId.startsWith("C-S");
  const maxUse = getCardUseCounterLimit(ci, data);
  const useRatio = maxUse > 0 ? ((ci.useCounter ?? maxUse) / maxUse) : 1;
  const countdown = ci.finalMutationCountdown ?? getBaseFinalMutationCountdown(def);
  const cardValue = getDeckCardValue(ci, data, playstyle, deck, run);

  let score = 0;
  score += mutationIds.length * 5;
  if (latestIsNegative) score += 7;
  if (compilePreview?.eligible) score += 8;
  score += Math.max(0, 1 - useRatio) * 12;
  score += Math.max(0, 6 - countdown) * 2.5;
  score += Math.max(0, cardValue * 0.14);

  if (playstyle === "preservation") score += 6;
  if (playstyle === "defensive" || playstyle === "buffDebuff") score += 3;
  if (playstyle === "mutationPusher") score -= 6;

  return score;
}

function scoreDeckOperation(op, deck, data, playstyle, run = null) {
  if (!deck?.cardInstances) return -Infinity;

  const active = Object.values(deck.cardInstances).filter((ci) => !ci.finalMutationId);
  if (active.length === 0) return -Infinity;

  const selectTarget = (selectionOp) => {
    const action = getDeckSelectionAction(deck, data, playstyle, selectionOp, run);
    return deck.cardInstances?.[action?.instanceId] || null;
  };

  if (op === "RemoveCard" || op === "RemoveSelectedCard") {
    const target = selectTarget("RemoveCard");
    if (!target) return -Infinity;
    const def = data.cards?.[target.defId];
    const cardValue = getDeckCardValue(target, data, playstyle, deck, run);
    const typeBias = (AI_PLAYSTYLES[playstyle]?.shopRemoveTargetTypes || []).includes(def?.type) ? 8 : 0;
    return Math.max(-12, 12 - (cardValue * 0.35)) + typeBias;
  }

  if (op === "Repair" || op === "RepairSelectedCard") {
    const target = selectTarget("Repair");
    if (!target) return -Infinity;
    const mutationIds = target.appliedMutations || [];
    const latestMutationId = mutationIds[mutationIds.length - 1] || null;
    const latestIsNegative = !!latestMutationId && latestMutationId.includes('-') && !latestMutationId.startsWith('C-S');
    const cardValue = getDeckCardValue(target, data, playstyle, deck, run);
    return (mutationIds.length * 4.5) + (latestIsNegative ? 6 : 0) + Math.max(0, cardValue * 0.18);
  }

  if (op === "Stabilise" || op === "StabiliseSelectedCard") {
    const target = selectTarget("Stabilise");
    if (!target) return -Infinity;
    const maxUse = getCardUseCounterLimit(target, data);
    const useRatio = maxUse > 0 ? ((target.useCounter ?? maxUse) / maxUse) : 1;
    const useUrgency = Math.max(0, 1 - useRatio);
    const countdown = target.finalMutationCountdown ?? 8;
    const urgency = Math.max(0, 6 - countdown);
    const cardValue = getDeckCardValue(target, data, playstyle, deck, run);
    const styleBias =
      playstyle === "preservation" ? 5.5 :
      playstyle === "defensive" ? 4.2 :
      playstyle === "mutationPusher" ? -4 :
      3.5;
    return (useUrgency * 9) + (urgency * styleBias) + Math.max(0, cardValue * 0.12);
  }

  if (op === "Accelerate" || op === "AccelerateSelectedCard") {
    const target = selectTarget("Accelerate");
    if (!target) return -Infinity;
    const maxUse = getCardUseCounterLimit(target, data);
    const remainingUses = Math.max(0, target.useCounter ?? maxUse);
    const countdown = Math.max(0, target.finalMutationCountdown ?? 8);
    const styleBias =
      playstyle === "mutationPusher" ? 4.8 :
      playstyle === "preservation" ? -5 :
      playstyle === "aggressive" ? 1.8 :
      0.8;
    return (countdown + (remainingUses * 0.65)) * styleBias;
  }

  if (op === "Forge" || op === "ForgeSelectedCard") {
    const target = selectTarget("Forge");
    if (!target) return -Infinity;
    return scoreForgeTarget(target, data, playstyle, deck, run);
  }

  if (op === "DuplicateSelectedCard") {
    const best = active.reduce((bestSoFar, ci) => {
      const value = getDeckCardValue(ci, data, playstyle, deck, run);
      return !bestSoFar || value > bestSoFar.value ? { ci, value } : bestSoFar;
    }, null);
    return best ? Math.max(6, best.value * 0.55) : -Infinity;
  }

  return 0;
}

function estimateCardPoolValue(pool, data, playstyle, run = null, deck = null) {
  const candidates = Object.keys(data.cards || {}).filter((id) => {
    const def = data.cards[id];
    const tags = def?.tags || [];
    if (tags.includes("EnemyCard") || tags.includes("Core") || id.startsWith("EC-")) return false;
    if (pool === "power") return tags.includes("Power") || def?.type === "Power";
    return !tags.includes("Power") && def?.type !== "Power";
  });

  if (candidates.length === 0) return 0;

  const scores = candidates
    .map((id) => scoreCardForPickup(data.cards[id], data, playstyle, run, deck))
    .sort((a, b) => b - a);

  const slice = scores.slice(0, Math.max(1, Math.ceil(scores.length * 0.25)));
  const avg = slice.reduce((sum, score) => sum + score, 0) / slice.length;
  return avg;
}

function scoreEventChoice(choice, run, deck, data, playstyle) {
  if (!choice) return -Infinity;

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const gold = run?.gold ?? 0;
  const hp = run?.hp ?? 0;
  const maxHP = run?.maxHP ?? 0;
  const missingHp = Math.max(0, maxHP - hp);

  let goldLoss = 0;
  let hpLoss = 0;
  for (const op of choice.ops || []) {
    if (op.op === "LoseGold") goldLoss += op.amount || 0;
    if (op.op === "LoseHP") hpLoss += op.amount || 0;
  }
  if (goldLoss > gold) return -Infinity;
  if (hpLoss >= hp && hp > 0) return -Infinity;

  let score = 0;
  for (const op of choice.ops || []) {
    switch (op.op) {
      case "GainGold":
        score += (op.amount || 0) * 0.7;
        break;
      case "LoseGold":
        score -= (op.amount || 0) * 0.75;
        break;
      case "Heal":
        score += Math.min(op.amount || 0, missingHp) * Math.max(0.8, ps.healWeight * 1.4);
        break;
      case "LoseHP":
        score -= (op.amount || 0) * Math.max(3.2, ps.healWeight * 3.8);
        break;
      case "GainMaxHP":
        score += (op.amount || 0) * (2.5 + ps.healWeight);
        break;
      case "GainMP":
        score += (op.amount || 0) * 10;
        break;
      case "GainCard":
        score += estimateCardPoolValue(op.pool || "standard", data, playstyle, run, deck) * 0.5;
        break;
      case "RemoveSelectedCard":
      case "RepairSelectedCard":
      case "StabiliseSelectedCard":
      case "AccelerateSelectedCard":
      case "ForgeSelectedCard":
      case "DuplicateSelectedCard":
        score += scoreDeckOperation(op.op, deck, data, playstyle, run);
        break;
      default:
        break;
    }
  }

  if ((choice.ops || []).length === 0) {
    score += 0.5;
  }

  return score;
}

function getMapNodeImmediateScore(node, run, playstyle, deck = null) {
  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const hpPct = run ? run.hp / run.maxHP : 1;
  const gold = run?.gold ?? 0;
  const act = run?.act ?? 1;
  const floor = run?.floor ?? 0;
  const deckSize = deck?.master?.length ?? Object.keys(deck?.cardInstances || {}).length;
  const earlyAct = act === 1 && floor <= 3;
  const underdevelopedDeck = deckSize > 0 && deckSize <= 9;

  switch (node?.type) {
    case "Rest":
      return hpPct < ps.restThreshold ? 70 : (hpPct < 0.8 ? 25 : 3);
    case "Shop":
      if (earlyAct && underdevelopedDeck) {
        return gold >= (ps.shopGoldThreshold + 40) && hpPct >= 0.9 ? 14 : 3;
      }
      if (gold >= ps.shopGoldThreshold) {
        return hpPct >= 0.8 ? 35 : (hpPct >= 0.55 ? 18 : 6);
      }
      return 8;
    case "Combat":
      if (earlyAct && underdevelopedDeck) return 34;
      if (act === 1 && floor <= 6) return 24;
      return 20;
    case "Event":
      if (earlyAct && underdevelopedDeck) return 12;
      return 15;
    case "Elite":
      return hpPct >= 0.75 ? (20 + (ps.eliteBonus || 0)) : 5;
    case "Boss":
      return 30;
    default:
      return 10;
  }
}

function scoreMapPath(nodeId, nodes, run, playstyle, deck, depth, memo = new Map()) {
  const key = `${nodeId}:${depth}`;
  if (memo.has(key)) return memo.get(key);

  const node = nodes[nodeId];
  if (!node) return -Infinity;

  const immediate = getMapNodeImmediateScore(node, run, playstyle, deck);
  if (depth <= 0 || !node.next?.length) {
    memo.set(key, immediate);
    return immediate;
  }

  const future = Math.max(...node.next.map((nextId) => scoreMapPath(nextId, nodes, run, playstyle, deck, depth - 1, memo)));
  const total = immediate + (Number.isFinite(future) ? future * 0.55 : 0);
  memo.set(key, total);
  return total;
}

// â”€â”€â”€ Main entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      return getMapAction(state.map, state.run, playstyle, state.deck);

    case 'Reward':
      return getRewardAction(state.reward, data, playstyle, state.run, state.deck);

    case 'Shop':
      // Handle pending deck selection after buying a card-targeting service
      if (state.deckView && state.shop?.pendingService) {
        const deckAction = getDeckSelectionAction(state.deck, data, playstyle, state.shop.pendingService, state.run);
        return deckAction ?? { type: 'Shop_Exit' }; // fallback: exit if no valid target
      }
      return getShopAction(state.shop, state.run, state.deck, data, playstyle);

    case 'Event':
      // Handle pending deck selection for rest-site repair/stabilise
      if (state.deckView && state.event?.pendingSelectOp) {
        const deckAction = getDeckSelectionAction(state.deck, data, playstyle, state.event.pendingSelectOp, state.run);
        return deckAction ?? { type: 'GoToMap' }; // fallback: skip if no valid target
      }
      return getEventAction(state.event, state.run, state.deck, data, playstyle);

    default:
      return null;
  }
}

// â”€â”€â”€ Combat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// AI auto-resolves Scry by scoring each card and discarding the bottom half
function resolveScryAction(scryPending, cardInstances, data, playstyle) {
  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const { cards } = scryPending;

  const scored = cards.map(cid => {
    const ci = cardInstances[cid];
    const def = data.cards[ci?.defId];
    let score = 0;
    if (def) {
      // Cheap cards are more playable
      const cost = def.costRAM || 0;
      score += Math.max(0, 3 - cost) * 2;
      // Score by effect quality
      for (const eff of (def.effects || [])) {
        if (eff.op === 'DealDamage')   score += (eff.amount || 0) * 0.4 * ps.damageWeight;
        if (eff.op === 'GainBlock')    score += (eff.amount || 0) * 0.3 * ps.blockWeight;
        if (eff.op === 'DrawCards')    score += (eff.amount || 0) * 2.0 * ps.drawWeight;
        if (eff.op === 'ApplyStatus')  score += (eff.stacks || 1) * 1.5 * ps.statusWeight;
      }
    }
    return { cid, score };
  });
  scored.sort((a, b) => a.score - b.score); // ascending: worst first

  // Discard the worst quarter (or any with clearly negative utility)
  const discardCount = Math.floor(cards.length / 4);
  const toDiscard = scored.slice(0, discardCount).map(x => x.cid);
  const top = cards.filter(c => !toDiscard.includes(c)); // keep natural order

  return { type: 'Combat_ScryResolve', discard: toDiscard, top };
}

function getEntityStatusMap(entity) {
  const map = new Map();
  for (const status of (entity?.statuses || [])) {
    if (!status?.id) continue;
    map.set(status.id, (map.get(status.id) || 0) + Math.max(0, status.stacks || 0));
  }
  return map;
}

function createBlockGainScorer(player, aliveEnemies, playstyle) {
  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const incoming = (aliveEnemies || []).reduce((sum, enemy) => {
    const intent = enemy.intent;
    return sum + (intent?.type === 'Attack' && typeof intent.amount === 'number' ? intent.amount : 0);
  }, 0);
  const hpPct = (player?.hp || 0) / Math.max(1, player?.maxHP || 75);
  const blockUrgency = hpPct < 0.35 ? 2.2 : hpPct < 0.55 ? 1.5 : 1.0;

  return (blockGain) => {
    if (blockGain <= 0) return 0;
    const existingProtection = getProtection(player);
    let blockBase;
    if (incoming > 0) {
      const usefulBlock = Math.min(blockGain, Math.max(0, incoming - existingProtection));
      const extraBlock = Math.max(0, blockGain - usefulBlock);
      blockBase = usefulBlock * 1.5 + extraBlock * 0.3;
    } else {
      blockBase = blockGain * 0.85;
    }
    return blockBase * ps.blockWeight * blockUrgency;
  };
}

function scoreStatusDelta(beforeEntity, afterEntity, targetKind, context) {
  const beforeMap = getEntityStatusMap(beforeEntity);
  const afterMap = getEntityStatusMap(afterEntity);
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  let score = 0;

  for (const statusId of ids) {
    const delta = (afterMap.get(statusId) || 0) - (beforeMap.get(statusId) || 0);
    if (!delta) continue;
    const deltaScore = scoreStatusApplication(statusId, Math.abs(delta), targetKind, context);
    score += delta > 0 ? deltaScore : -deltaScore;
  }

  return score;
}

function scoreCardPlayBias(def, ci, playstyle, data) {
  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  let score = 0;
  const cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
  score -= cost * ps.costPenalty;

  const playsUntilMutation = getPlaysUntilMutation(ci, data);
  const playsUntilFinalMutation = getPlaysUntilFinalMutation(ci, data);
  if (playsUntilMutation <= 1) score -= ps.useCounterPenalty;
  if (playsUntilFinalMutation <= 2) score -= ps.finalMutCounterPenalty;

  for (const mutationId of (ci.appliedMutations || [])) {
    const sentiment = scoreMutationSentiment(mutationId, data);
    if (sentiment > 0) score += ps.posMutBonus;
    if (sentiment < 0) score -= ps.negMutPenalty;
  }

  return score;
}

function cloneCombatForSimulation(combat, data) {
  let cloned = null;
  try {
    cloned = structuredClone(combat);
  } catch {
    cloned = JSON.parse(JSON.stringify(combat));
  }
  if (cloned && typeof cloned === 'object') cloned.dataRef = data;
  return cloned;
}

function scoreSimulatedCombatAction(beforeCombat, afterCombat, action, playstyle, data) {
  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const beforePlayer = beforeCombat?.player || {};
  const afterPlayer = afterCombat?.player || beforePlayer;
  const beforeAliveEnemies = (beforeCombat?.enemies || []).filter((enemy) => enemy.hp > 0);
  const afterAliveEnemies = (afterCombat?.enemies || []).filter((enemy) => enemy.hp > 0);
  const targetEnemy = beforeAliveEnemies.find((enemy) => enemy.id === action.targetEnemyId)
    || beforeAliveEnemies[0]
    || afterAliveEnemies.find((enemy) => enemy.id === action.targetEnemyId)
    || afterAliveEnemies[0]
    || null;
  const scoreBlockGain = createBlockGainScorer(beforePlayer, beforeAliveEnemies, playstyle);
  const baseContext = {
    player: beforePlayer,
    target: targetEnemy,
    aliveEnemies: beforeAliveEnemies,
    ps,
    scoreBlockGain,
  };

  let score = 0;

  if (afterCombat?.combatOver && afterCombat?.victory) {
    score += 5000 + (beforeAliveEnemies.length * 220);
  }
  if ((afterPlayer.hp || 0) <= 0 && (beforePlayer.hp || 0) > 0) {
    score -= 9000;
  }

  const playerHpDelta = (afterPlayer.hp || 0) - (beforePlayer.hp || 0);
  if (playerHpDelta > 0) score += playerHpDelta * 8 * Math.max(0.6, ps.healWeight);
  else if (playerHpDelta < 0) score += playerHpDelta * 12 * Math.max(0.8, ps.healWeight);

  const playerProtectionDelta = getProtection(afterPlayer) - getProtection(beforePlayer);
  if (playerProtectionDelta > 0) score += scoreBlockGain(playerProtectionDelta);
  else if (playerProtectionDelta < 0) score += playerProtectionDelta * 1.6 * Math.max(0.7, ps.blockWeight);

  const playerRamDelta = (afterPlayer.ram || 0) - (beforePlayer.ram || 0);
  if (playerRamDelta > 0) score += playerRamDelta * 5 * ps.ramWeight;

  const handDelta = ((afterPlayer.piles?.hand || []).length - (beforePlayer.piles?.hand || []).length);
  if (handDelta > 0) score += handDelta * 5 * ps.drawWeight;

  score += scoreStatusDelta(beforePlayer, afterPlayer, 'Self', baseContext);

  if (afterCombat?._scryPending && !beforeCombat?._scryPending) score += 6 * ps.drawWeight;
  if (afterCombat?._nextCardFree && !beforeCombat?._nextCardFree) score += 10 * ps.ramWeight;

  const damageBonusDelta = Math.max(0, (afterCombat?._nextCardDamageBonus || 0) - (beforeCombat?._nextCardDamageBonus || 0));
  if (damageBonusDelta > 0) score += damageBonusDelta * 1.8 * ps.damageWeight;

  const delayedDelta = ((afterCombat?._delayedCardEffects || []).length - (beforeCombat?._delayedCardEffects || []).length);
  if (delayedDelta > 0) score += delayedDelta * 8;

  const beforeHeatState = getHeatState(beforeCombat?.heat || 0, beforeCombat?.maxHeat || 20);
  const afterHeatState = getHeatState(
    afterCombat?.heat ?? beforeCombat?.heat ?? 0,
    afterCombat?.maxHeat || beforeCombat?.maxHeat || 20,
  );
  const heatDelta = afterHeatState.heat - beforeHeatState.heat;
  const heatCare =
    playstyle === "aggressive" || playstyle === "mutationPusher" ? 0.45 :
    playstyle === "balanced" ? 0.8 :
    1.05;
  if (!(afterCombat?.combatOver && afterCombat?.victory)) {
    if (heatDelta > 0) {
      score -= heatDelta * (beforeHeatState.alertLevel >= 1 ? 2.2 : 1.25) * heatCare;
    } else if (heatDelta < 0) {
      score += Math.abs(heatDelta) * 1.8 * heatCare;
    }
    if (afterHeatState.alertLevel > beforeHeatState.alertLevel) {
      score -= (afterHeatState.alertLevel - beforeHeatState.alertLevel) * 12 * heatCare;
    }
  }

  if ((beforeCombat?.arenaModifier?.id || afterCombat?.arenaModifier?.id) === "data_storm" && !afterCombat?.combatOver) {
    score -= Math.max(0, afterAliveEnemies.length) * 6;
  }

  const beforeEnemyMap = new Map(beforeAliveEnemies.map((enemy) => [enemy.id, enemy]));
  const afterEnemyMap = new Map(afterAliveEnemies.map((enemy) => [enemy.id, enemy]));
  const enemyIds = new Set([...beforeEnemyMap.keys(), ...afterEnemyMap.keys()]);

  for (const enemyId of enemyIds) {
    const beforeEnemy = beforeEnemyMap.get(enemyId) || null;
    const afterEnemy = afterEnemyMap.get(enemyId) || null;
    const enemyContext = {
      ...baseContext,
      target: beforeEnemy || afterEnemy || targetEnemy,
    };

    if (beforeEnemy && !afterEnemy) {
      score += (beforeEnemy.hp || 0) * 10 * ps.damageWeight;
      score += getProtection(beforeEnemy) * 1.8;
      score += 1200 + Math.max(0, getEnemyThreatScore(beforeEnemy, data, beforeAliveEnemies.length));
      continue;
    }

    if (!beforeEnemy && afterEnemy) {
      score -= 250 + Math.max(0, getEnemyThreatScore(afterEnemy, data, Math.max(1, afterAliveEnemies.length)));
      continue;
    }

    if (!beforeEnemy || !afterEnemy) continue;

    const enemyHpDelta = (beforeEnemy.hp || 0) - (afterEnemy.hp || 0);
    if (enemyHpDelta > 0) score += enemyHpDelta * 10 * ps.damageWeight;
    else if (enemyHpDelta < 0) score += enemyHpDelta * 8 * ps.damageWeight;

    const enemyProtectionDelta = getProtection(beforeEnemy) - getProtection(afterEnemy);
    if (enemyProtectionDelta > 0) score += enemyProtectionDelta * 2.1;
    else if (enemyProtectionDelta < 0) score += enemyProtectionDelta * 1.5;

    score += scoreStatusDelta(beforeEnemy, afterEnemy, 'Enemy', enemyContext);
  }

  return score;
}

function getCombatAction(combat, data, playstyle) {
  if (!combat) return null;

  if (combat.combatOver) {
    return { type: 'GoToMap' };
  }

  // If a Scry is pending, resolve it before doing anything else
  if (combat._scryPending) {
    return resolveScryAction(combat._scryPending, combat.cardInstances, data, playstyle);
  }

  const { player, enemies, cardInstances } = combat;
  const aliveEnemies = (enemies || []).filter(e => e.hp > 0);
  // No alive enemies: trigger EndTurn so the engine's win-check fires.
  // If enemies array itself is empty (bad encounter), return null to avoid a phantom win.
  if (aliveEnemies.length === 0) {
    return (enemies || []).length > 0 ? { type: 'Combat_EndTurn' } : null;
  }

  let bestScore = -Infinity;
  let bestAction = null;
  const defaultEnemyId = aliveEnemies[0]?.id ?? null;

  for (const cid of (player.piles.hand || [])) {
    const ci = cardInstances[cid];
    if (!ci) continue;
    const def = data.cards[ci.defId];
    if (!def) continue;

    const targetingProfile = getCardTargetingProfile(combat, data, cid);
    const enemyContexts = aliveEnemies.length > 0 ? aliveEnemies : [null];
    const candidateActions = [];

    const isXCost = (def.tags || []).includes('XCost')
      || (def.effects || []).some((effect) => effect.op === 'RawText' && /spend all remaining RAM/i.test(effect.text || ''));
    let xCostPenalty = 0;
    if (isXCost) {
      for (const otherId of (player.piles.hand || [])) {
        if (otherId === cid) continue;
        const otherCi = cardInstances[otherId];
        const otherDef = data.cards[otherCi?.defId];
        if (!otherDef) continue;
        const otherEnemyId = defaultEnemyId;
        const otherProfile = getCardTargetingProfile(combat, data, otherId);
        const otherPlayableOnEnemy = (otherProfile.canTargetEnemy || (!otherProfile.canTargetEnemy && !otherProfile.canTargetSelf))
          && getCardPlayability(combat, data, otherId, otherEnemyId, false).playable;
        const otherPlayableOnSelf = otherProfile.canTargetSelf
          && getCardPlayability(combat, data, otherId, otherEnemyId, true).playable;
        if (otherPlayableOnEnemy || otherPlayableOnSelf) xCostPenalty += 30;
      }
    }

    const enemyTargetContexts = targetingProfile.canTargetEnemy
      ? enemyContexts
      : (!targetingProfile.canTargetSelf ? [enemyContexts[0]] : []);

    for (const enemy of enemyTargetContexts) {
      const targetEnemyId = enemy?.id ?? defaultEnemyId;
      const playability = getCardPlayability(combat, data, cid, targetEnemyId, false);
      if (!playability.playable) continue;
      candidateActions.push({
        action: {
          type: 'Combat_PlayCard',
          cardInstanceId: cid,
          targetEnemyId,
        },
        targetEnemy: enemy || aliveEnemies[0] || null,
      });
    }

    if (targetingProfile.canTargetSelf) {
      for (const enemy of enemyContexts) {
        const targetEnemyId = enemy?.id ?? defaultEnemyId;
        const playability = getCardPlayability(combat, data, cid, targetEnemyId, true);
        if (!playability.playable) continue;
        candidateActions.push({
          action: {
            type: 'Combat_PlayCard',
            cardInstanceId: cid,
            targetEnemyId,
            targetSelf: true,
          },
          targetEnemy: enemy || aliveEnemies[0] || null,
        });
      }
    }

    if (candidateActions.length === 0) continue;

    const playBias = scoreCardPlayBias(def, ci, playstyle, data) - xCostPenalty;

    for (const candidate of candidateActions) {
      const simulatedCombat = cloneCombatForSimulation(combat, data);
      if (!simulatedCombat) continue;
      const nextCombat = dispatchCombat(simulatedCombat, data, {
        type: 'PlayCard',
        cardInstanceId: candidate.action.cardInstanceId,
        targetEnemyId: candidate.action.targetEnemyId,
        targetSelf: !!candidate.action.targetSelf,
      });

      let score = playBias + scoreSimulatedCombatAction(combat, nextCombat, candidate.action, playstyle, data);

      if (!candidate.action.targetSelf && candidate.targetEnemy) {
        score += Math.max(0, getEnemyThreatScore(candidate.targetEnemy, data, aliveEnemies.length)) * 0.45;
        if (candidate.targetEnemy.intent?.type === 'Attack') score += 6;
        if (candidate.targetEnemy.intent?.type === 'Debuff') score += 4;
        if (enemyIsHealer(candidate.targetEnemy, data)) score += 8;
      }

      const fallbackTarget = candidate.targetEnemy || aliveEnemies[0] || null;
      const isDualTargetCard = targetingProfile.canTargetEnemy && targetingProfile.canTargetSelf;
      if (!isDualTargetCard && fallbackTarget) {
        score += Math.max(-90, Math.min(180, scoreCard(def, ci, fallbackTarget, aliveEnemies, player, playstyle, data) * 0.15));
      }

      if (combat?.arenaModifier?.id === "emp_zone" && ((def.costRAM || 0) >= 2 || def.type === "Power" || isXCost)) {
        score += 6;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAction = candidate.action;
      }
    }
  }

  const simulatedEndTurn = cloneCombatForSimulation(combat, data);
  if (simulatedEndTurn) {
    const resolvedEndTurn = dispatchCombat(simulatedEndTurn, data, { type: "EndTurn" });
    const endTurnAction = { type: "Combat_EndTurn", targetEnemyId: defaultEnemyId };
    const endTurnScore = scoreSimulatedCombatAction(combat, resolvedEndTurn, endTurnAction, playstyle, data);
    if (endTurnScore > bestScore) {
      bestScore = endTurnScore;
      bestAction = endTurnAction;
    }
  }

  return bestAction && bestScore > 0 ? bestAction : { type: 'Combat_EndTurn' };
}

// Returns true if an enemy's definition can heal itself.
function enemyIsHealer(enemy, data) {
  const rotation = getEnemyDef(enemy, data)?.rotation || [];
  for (const cardId of rotation) {
    const def = data?.cards?.[cardId];
    if (!def) continue;
    for (const eff of (def.effects || [])) {
      if (eff.op === 'Heal' && eff.target === 'Self') return true;
    }
  }
  return false;
}

// Per-status base score values: how many points each stack is worth as a raw number.
// Multiplied by ps.statusWeight afterward.
const STATUS_BASE_SCORES = {
  Corrode:      9,   // DoT every player turn + strips Firewall â€” compound value
  Overheat:     7,   // Pure DoT, still strong
  Vulnerable:   8,   // +50% damage taken â€” huge multiplier effect
  ExposedPorts: 8,   // Similar to Vulnerable
  Weak:         5,   // âˆ’25% enemy attack â€” good but situational
  Underclock:   5,   // âˆ’1 RAM/card â€” reduces enemy plays per turn
  Leak:         4,   // Reduces enemy max-HP ceiling â€” good for healers
  Firewall:     5,   // Persistent shield gain â€” solid sustained defense
  Nanoflow:     6,   // Player heals each turn â€” strong when low HP
  Surge:        4,   // Player deals +1 dmg â€” offensive bonus
};

STATUS_BASE_SCORES.Overclock = 6;
STATUS_BASE_SCORES.SensorGlitch = 5;
STATUS_BASE_SCORES.TargetSpoof = 5;
STATUS_BASE_SCORES.Throttled = 5;
STATUS_BASE_SCORES.TraceBeacon = 6;
STATUS_BASE_SCORES.Burn = 6;
STATUS_BASE_SCORES.CorruptedSector = 5;
STATUS_BASE_SCORES.DazedPackets = 4;

function scoreCard(def, ci, target, aliveEnemies, player, playstyle, data) {
  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
  let score = 0;

  const incoming = aliveEnemies.reduce((sum, enemy) => {
    const intent = enemy.intent;
    return sum + (intent?.type === 'Attack' && typeof intent.amount === 'number' ? intent.amount : 0);
  }, 0);

  const hpPct = player.hp / (player.maxHP || 75);
  const blockUrgency = hpPct < 0.35 ? 2.2 : hpPct < 0.55 ? 1.5 : 1.0;

  const scoreBlockGain = (blockGain) => {
    if (blockGain <= 0) return 0;
    const existingProtection = getProtection(player);
    let blockBase;
    if (incoming > 0) {
      const usefulBlock = Math.min(blockGain, Math.max(0, incoming - existingProtection));
      const extraBlock = Math.max(0, blockGain - usefulBlock);
      blockBase = usefulBlock * 1.5 + extraBlock * 0.3;
    } else {
      blockBase = blockGain * 0.85;
    }
    return blockBase * ps.blockWeight * blockUrgency;
  };

  const scoreDamage = (rawDmg, isAoE) => {
    const scoreAgainstEnemy = (enemy) => {
      const protection = getProtection(enemy);
      const effectiveDamage = Math.max(0, rawDmg - protection) * getDamageAmpMultiplier(enemy);
      if (enemy.hp <= effectiveDamage) {
        return (1000 + aliveEnemies.length * 50) * ps.damageWeight;
      }

      let damageScore = effectiveDamage * 2 * ps.damageWeight;
      damageScore += (1 - enemy.hp / enemy.maxHP) * 30;
      if (enemyIsHealer(enemy, data)) damageScore += 40;
      damageScore += getDamageAmpStacks(enemy) * 8;
      damageScore -= Math.min(protection, rawDmg) * 1.1;
      return damageScore;
    };

    if (isAoE) {
      return aliveEnemies.reduce((sum, enemy) => sum + scoreAgainstEnemy(enemy), 0);
    }
    return scoreAgainstEnemy(target);
  };

  for (const effect of (def.effects || [])) {
    switch (effect.op) {
      case 'DealDamage': {
        score += scoreDamage(effect.amount || 0, effect.target === 'AllEnemies');
        break;
      }
      case 'GainBlock': {
        score += scoreBlockGain(effect.amount || 0);
        break;
      }
      case 'DrawCards':   score += (effect.amount || 0) * 5 * ps.drawWeight;   break;
      case 'GainRAM':     score += (effect.amount || 0) * 4 * ps.ramWeight;    break;
      case 'ApplyStatus': {
        score += scoreStatusApplication(effect.statusId || '', effect.stacks || 1, effect.target || 'Enemy', {
          player,
          target,
          aliveEnemies,
          ps,
          scoreBlockGain,
        });
        break;
      }
      case 'Heal': {
        const healNeed = (player.maxHP || 0) - (player.hp || 0);
        const urgency = player.hp < player.maxHP * 0.5 ? 2 : 0.5;
        score += Math.min(effect.amount || 0, healNeed) * urgency * ps.healWeight;
        break;
      }
      case 'RawText': {
        for (const line of splitRawTextClauses(effect.text || '')) {
          score += scoreRawTextLine(line, {
            player,
            target,
            aliveEnemies,
            ps,
            scoreBlockGain,
            scoreDamage,
          });
        }
        /*
        // "Gain X Firewall" or "gain X Firewall" â†’ immediate block
        const fwMatch = t.match(/[Gg]ain (\d+) Firewall/);
        if (fwMatch) score += scoreBlockGain(parseInt(fwMatch[1]));
        // "POWER.*gain X Firewall" â€” persistent per-turn block; value ~3 turns
        const pwrFwMatch = t.match(/POWER[^]*gain (\d+) Firewall/i);
        if (pwrFwMatch) score += scoreBlockGain(parseInt(pwrFwMatch[1]) * 3);
        // "Deal X damage" â€” single-target
        const dmgMatch = t.match(/[Dd]eal (\d+) damage(?! to ALL)/);
        if (dmgMatch) score += scoreDamage(parseInt(dmgMatch[1]), false);
        // "Deal X damage to ALL enemies"
        const aoeMatch = t.match(/[Dd]eal (\d+) damage to ALL/i);
        if (aoeMatch) score += scoreDamage(parseInt(aoeMatch[1]), true);
        // "Deal X damage per RAM" / "Spend all remaining RAM. Deal X damage per RAM"
        const ramDmgMatch = t.match(/[Dd]eal (\d+) damage[^]*per RAM/i);
        if (ramDmgMatch) {
          const dmgPerRam = parseInt(ramDmgMatch[1]);
          const isAoe = /to ALL/i.test(t);
          score += scoreDamage(dmgPerRam * Math.max(1, player.ram), isAoe);
        }
        if (/Lose all Firewall/i.test(t) && /(?:Deal|Apply) that much damage to ALL enemies/i.test(t)) {
          score += scoreDamage(playerFirewall, true);
        } else if (/Lose all Firewall/i.test(t) && /(?:Deal|Apply) that much damage/i.test(t)) {
          score += scoreDamage(playerFirewall, false);
        }
        if (/Strip all Firewall from ALL enemies/i.test(t)) {
          score += totalEnemyFirewall * 1.5;
        }
        const breachAllMatch = t.match(/Strip (\d+) Firewall from ALL enemies/i);
        if (breachAllMatch) score += Math.min(parseInt(breachAllMatch[1]), totalEnemyFirewall) * 1.5;
        if (/Strip all Firewall/i.test(t) && !/ALL enemies/i.test(t)) {
          score += targetFirewall * 1.5;
        }
        const breachOneMatch = t.match(/Strip (\d+) Firewall/i);
        if (breachOneMatch && !/ALL enemies/i.test(t)) {
          score += Math.min(parseInt(breachOneMatch[1]), targetFirewall) * 1.5;
        }
        // "Draw X card"
        const drawMatch = t.match(/[Dd]raw (\d+)/);
        if (drawMatch) score += parseInt(drawMatch[1]) * 5 * ps.drawWeight;
        // "Heal X HP"
        const healMatch = t.match(/[Hh]eal (\d+) HP/);
        if (healMatch) {
          const healNeed = (player.maxHP || 0) - (player.hp || 0);
          const urgency = player.hp < player.maxHP * 0.5 ? 2 : 0.5;
          score += Math.min(parseInt(healMatch[1]), healNeed) * urgency * ps.healWeight;
        }
        */
        break;
      }
    }
  }

  score -= cost * ps.costPenalty;

  // Mutation risk â€” these are negative penalties by default, but mutation pusher
  // makes them positive bonuses by using negative config values.
  const playsUntilMutation = getPlaysUntilMutation(ci, data);
  const playsUntilFinalMutation = getPlaysUntilFinalMutation(ci, data);
  if (playsUntilMutation <= 1) score -= ps.useCounterPenalty;
  if (playsUntilFinalMutation <= 2) score -= ps.finalMutCounterPenalty;

  // Reward accumulated positive mutations; penalise negative ones
  for (const mutationId of (ci.appliedMutations || [])) {
    const sentiment = scoreMutationSentiment(mutationId, data);
    if (sentiment > 0) score += ps.posMutBonus;
    if (sentiment < 0) score -= ps.negMutPenalty;
  }

  return score;
}

// â”€â”€â”€ Map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getMapAction(map, run, playstyle, deck = null) {
  if (!map) return null;

  const selectableIds = map.selectableNext || [];
  if (selectableIds.length === 0) return null;

  const nodes = map.nodes || {};

  let bestScore = -Infinity;
  let bestId = selectableIds[0];
  const memo = new Map();

  for (const id of selectableIds) {
    const score = scoreMapPath(id, nodes, run, playstyle, deck, 3, memo);

    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return { type: 'SelectNextNode', nodeId: bestId };
}

// â”€â”€â”€ Reward â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Score a relic by how useful its mods are for this playstyle
function scoreRelic(relic, playstyle = 'balanced') {
  if (!relic?.mods) return 0;
  const m = relic.mods;
  let score = 0;
  const mutationRiskPreference = getMutationRiskPreference(playstyle);
  // Higher tier = base value
  score += relic.tier === 'boss' ? 30 : relic.tier === 'rare' ? 20 : 10;
  // Additive bonuses
  if (m.maxRAMDelta)               score += m.maxRAMDelta * 15;
  if (m.ramRegenDelta)             score += m.ramRegenDelta * 12;
  if (m.drawPerTurnDelta)          score += m.drawPerTurnDelta * 10;
  if (m.maxHPDelta)                score += m.maxHPDelta * 1.5;
  if (m.travelHpCostDelta)         score += m.travelHpCostDelta * -5; // negative = good
  if (m.mutationTriggerChanceMult) score += (m.mutationTriggerChanceMult - 1) * 20 * mutationRiskPreference;
  if (m.finalCountdownTickDelta)   score += (-m.finalCountdownTickDelta) * 10 * mutationRiskPreference;
  if (m.mutationTierWeightMult) {
    const boosts = Object.values(m.mutationTierWeightMult).reduce((a, v) => a + (v - 1), 0);
    score += boosts * 5;
  }
  return score;
}

function getRewardAction(reward, data, playstyle, run = null, deck = null) {
  if (!reward) return null;

  // Handle relic choices first (before card choices)
  const relicChoices = reward.relicChoices || [];
  if (relicChoices.length > 0) {
    let bestScore = -Infinity, bestRelicId = relicChoices[0];
    for (const rid of relicChoices) {
      const relic = data.relics?.[rid];
      const s = scoreRelic(relic, playstyle);
      if (s > bestScore) { bestScore = s; bestRelicId = rid; }
    }
    return { type: 'Reward_PickRelic', relicId: bestRelicId };
  }

  const choices = reward.cardChoices || [];
  if (choices.length === 0) return { type: 'Reward_Skip' };

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const deckSize = deck?.master?.length ?? Object.keys(deck?.cardInstances || {}).length;
  const rewardGrowthBias = Math.max(0, 10 - deckSize) * 1.75;
  const skipFloor = ps.rewardSkipFloor ?? -12;
  let bestScore = -Infinity;
  let bestDefId = null;

  for (const defId of choices) {
    const def = data.cards?.[defId];
    if (!def) continue;

    let score = scoreCardForPickup(def, data, playstyle, run, deck) + 10 + rewardGrowthBias;
    score += (ps.rewardTypeWeights || {})[def.type] || 0;

    // Mutation risk cutoff for preservation playstyle
    if (ps.rewardMutRiskCutoff !== null) {
      const countdown = getBaseFinalMutationCountdown(def);
      if (countdown <= ps.rewardMutRiskCutoff) score -= 200;
    }

    // Mutation pusher: prefer cards that will mutate quickly
    if (playstyle === 'mutationPusher') {
      const countdown = getBaseFinalMutationCountdown(def);
      score += Math.max(0, 8 - countdown) * 4;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDefId = defId;
    }
  }

  if (bestScore < skipFloor || !bestDefId) return { type: 'Reward_Skip' };

  return { type: 'Reward_PickCard', defId: bestDefId };
}

// â”€â”€â”€ Shop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getShopAction(shop, run, deck, data, playstyle) {
  if (!shop || !run) return { type: 'Shop_Exit' };

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const offers = shop.offers || [];
  let bestIndex = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    if (offer?.sold) continue;
    const currency = offer?.currency === "scrap" ? "scrap" : "gold";
    const funds = getRunCurrencyAmount(run, currency);
    const reserve = currency === "scrap"
      ? Math.max(0, Number(ps.shopScrapReserve ?? 0))
      : Math.max(0, Number(ps.shopGoldReserve ?? 0));
    if (funds < offer.price) continue;
    if (funds - offer.price < reserve) continue;

    let score = -Infinity;

    if (offer.kind === 'Card' && ps.shopBuyCards) {
      const def = data.cards?.[offer.defId];
      if (!def || (ps.shopAvoidCardTypes || []).includes(def.type)) continue;
      score = scoreCardForPickup(def, data, playstyle, run, deck);
      if ((ps.shopPreferCardTypes || []).includes(def.type)) score += 8;
      score -= offer.price * 0.35;
    } else if (offer.kind === 'Relic') {
      const relic = data.relics?.[offer.relicId];
      score = scoreRelic(relic, playstyle) - offer.price * 0.28;
    } else if (offer.kind === 'Service') {
      if (offer.serviceId === 'Heal' && ps.shopBuyHeal) {
        const missingHp = Math.max(0, (run.maxHP || 0) - (run.hp || 0));
        score = Math.min(missingHp, Math.ceil((run.maxHP || 0) * 0.3)) * Math.max(0.8, ps.healWeight * 1.1) - offer.price * 0.32;
      }
      if (offer.serviceId === 'RemoveCard' && ps.shopBuyRemoveCard) {
        score = scoreDeckOperation('RemoveCard', deck, data, playstyle, run) - offer.price * 0.3;
      }
      if (offer.serviceId === 'Repair' && ps.shopBuyRepair) {
        score = scoreDeckOperation('Repair', deck, data, playstyle, run) - offer.price * 0.3;
      }
      if (offer.serviceId === 'Stabilise' && ps.shopBuyStabilise) {
        score = scoreDeckOperation('Stabilise', deck, data, playstyle, run) - offer.price * 0.3;
      }
      if (offer.serviceId === 'Accelerate' && ps.shopBuyAccelerate) {
        score = scoreDeckOperation('Accelerate', deck, data, playstyle, run) - offer.price * 0.3;
      }
      if (offer.serviceId === 'Forge' && ps.shopBuyForge) {
        score = scoreDeckOperation('Forge', deck, data, playstyle, run) - offer.price * 1.15;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0 && bestScore > 0) {
    return { type: 'Shop_BuyOffer', index: bestIndex };
  }

  return { type: 'Shop_Exit' };
}

// â”€â”€â”€ Deck Selection (card-targeting services and rest ops) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getDeckSelectionAction(deck, data, playstyle, op, run = null) {
  if (!deck) return null;

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const instances = Object.values(deck.cardInstances || {});
  const active = instances.filter(ci => !ci.finalMutationId);

  if (op === 'RemoveCard' || op === 'RemoveSelectedCard') {
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
      target = [...active].sort((a, b) => {
        const aMax = getCardUseCounterLimit(a, data);
        const bMax = getCardUseCounterLimit(b, data);
        return ((a.useCounter ?? aMax) / aMax) - ((b.useCounter ?? bMax) / bMax);
      })[0];
    }
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'RepairSelectedCard' || op === 'Repair') {
    const scored = active
      .filter(ci => (ci.appliedMutations || []).length > 0)
      .map(ci => {
        const mutationIds = ci.appliedMutations || [];
        const latestMutationId = mutationIds[mutationIds.length - 1] || null;
        const latestIsNegative = !!latestMutationId && latestMutationId.includes('-') && !latestMutationId.startsWith('C-S');
        return {
          ci,
          score: (latestIsNegative ? 100 : 0) + (mutationIds.length * 12) + getDeckCardValue(ci, data, playstyle, deck, run),
        };
      })
      .sort((a, b) => b.score - a.score);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'StabiliseSelectedCard' || op === 'Stabilise') {
    // Pick the card under the most immediate mutation pressure.
    const scored = active
      .map(ci => {
        const maxUse = getCardUseCounterLimit(ci, data);
        const useRatio = maxUse > 0 ? ((ci.useCounter ?? maxUse) / maxUse) : 1;
        const countdown = ci.finalMutationCountdown ?? 8;
        return {
          ci,
          score: ((1 - useRatio) * 14) + Math.max(0, 8 - countdown) * 2,
        };
      })
      .sort((a, b) => b.score - a.score);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'AccelerateSelectedCard' || op === 'Accelerate') {
    // Mutation pusher: pick card with the most clock value left to shave down.
    const scored = active
      .map(ci => {
        const maxUse = getCardUseCounterLimit(ci, data);
        const remainingUses = Math.max(0, ci.useCounter ?? maxUse);
        const countdown = ci.finalMutationCountdown ?? 8;
        return {
          ci,
          score: countdown + (remainingUses * 0.7),
        };
      })
      .sort((a, b) => b.score - a.score);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'ForgeSelectedCard' || op === 'Forge') {
    const scored = active
      .map((ci) => ({
        ci,
        score: scoreForgeTarget(ci, data, playstyle, deck, run),
      }))
      .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  if (op === 'DuplicateSelectedCard') {
    const scored = active
      .map(ci => ({
        ci,
        score: getDeckCardValue(ci, data, playstyle, deck, run),
      }))
      .sort((a, b) => b.score - a.score);
    const target = scored[0]?.ci;
    return target ? { type: 'SelectDeckCard', instanceId: target.instanceId } : null;
  }

  return null;
}

// â”€â”€â”€ Event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getEventAction(event, run, deck, data, playstyle) {
  if (!event) return null;

  const ps = AI_PLAYSTYLES[playstyle] || AI_PLAYSTYLES.balanced;
  const hpPct = run ? run.hp / run.maxHP : 1;

  if (isMinigameEvent(event.eventId)) {
    return { type: 'Minigame_Complete', eventId: event.eventId, tier: chooseMinigameTier(playstyle, event.eventId) };
  }

  if (event.eventId === 'RestSite') {
    // Try each priority option in sequence
    for (const choice of (ps.restPriority || ['heal'])) {
      if (choice === 'heal' && hpPct < 0.95) {
        return { type: 'Rest_Heal' };
      }
      if (choice === 'repair' && deck) {
        const instances = Object.values(deck.cardInstances || {});
        const hasTarget = instances.some(ci => !ci.finalMutationId && (ci.appliedMutations || []).length > 0);
        if (hasTarget) return { type: 'Rest_Repair' };
      }
      if (choice === 'stabilise' && deck) {
        const instances = Object.values(deck.cardInstances || {});
        const hasTarget = instances.some(ci => {
          if (ci.finalMutationId) return false;
          const maxUse = getCardUseCounterLimit(ci, data);
          const useRatio = maxUse > 0 ? ((ci.useCounter ?? maxUse) / maxUse) : 1;
          return useRatio <= 0.65 || (ci.finalMutationCountdown ?? 8) <= 5;
        });
        if (hasTarget) return { type: 'Rest_Stabilise' };
      }
      if (choice === 'forge' && deck && getRunCurrencyAmount(run, 'scrap') >= REST_FORGE_COST) {
        const target = getDeckSelectionAction(deck, data, playstyle, 'Forge', run);
        if (target) return { type: 'Rest_Forge' };
      }
    }
    // Fallback
    if (deck && getRunCurrencyAmount(run, 'scrap') >= REST_FORGE_COST && hpPct >= 0.8) {
      const target = getDeckSelectionAction(deck, data, playstyle, 'Forge', run);
      if (target) return { type: 'Rest_Forge' };
    }
    return hpPct < 0.99 ? { type: 'Rest_Heal' } : { type: 'Rest_Leave' };
  }

  const choose = (id) => ({ type: 'Event_Choose', choiceId: id });
  const eventDef = EVENT_REG.events[event.eventId];
  const choices = eventDef?.choices || [];
  if (choices.length === 0) return choose('leave');

  let bestChoice = choices[choices.length - 1];
  let bestScore = -Infinity;

  for (const choice of choices) {
    const score = scoreEventChoice(choice, run, deck, data, playstyle);
    if (score > bestScore) {
      bestScore = score;
      bestChoice = choice;
    }
  }

  if (!bestChoice?.id) {
    return choose('leave');
  }

  return choose(bestChoice.id);
}
