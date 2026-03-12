import { analyzeDeckState } from "./runInsights.js";

function hasName(enemyDef, pattern) {
  return pattern.test(String(enemyDef?.name || ""));
}

function hasRole(enemyDef, role) {
  return String(enemyDef?.role || "").toLowerCase() === String(role || "").toLowerCase();
}

function createBossDirective(config) {
  return {
    phaseThresholdsPct: [70, 35],
    objective: "",
    counterplay: "",
    ...config,
  };
}

function getBossDirectiveConfig(enemyDef, actNumber, summonTemplate) {
  if (hasName(enemyDef, /Hydra/i)) {
    return createBossDirective({
      type: "hydra",
      label: "Split Process",
      summary: "Thresholds spawn support drones. If the field is full, the Hydra hardens itself instead.",
      objective: "Cull spawned heads before phase breaks or the Hydra converts them into shell strength.",
      counterplay: "Keep the field clear before HP thresholds to earn a softer phase transition.",
      phaseThresholdsPct: [75, 50, 25],
      summonTemplate,
      phaseExposeStatus: "ExposedPorts",
      phaseExposeStacks: actNumber >= 3 ? 3 : 2,
    });
  }

  if (hasName(enemyDef, /Mainframe/i)) {
    return createBossDirective({
      type: "mainframe",
      label: "Rule Rewrite",
      summary: "Rewrites combat rules mid-fight by taxing your next turn's draw and first card cost.",
      objective: "When Purge Charge is armed, break all Firewall before its next action to interrupt it.",
      counterplay: "Watch for charge windows and save breach tools instead of dumping them into routine turns.",
      phaseThresholdsPct: [70, 40],
      chargeFirewall: actNumber >= 3 ? 10 : actNumber === 2 ? 8 : 6,
      chargeDamage: actNumber >= 3 ? 16 : actNumber === 2 ? 12 : 8,
    });
  }

  if (hasName(enemyDef, /Oracle/i)) {
    return createBossDirective({
      type: "oracle",
      label: "Data Heist",
      summary: "Steals cards from your hand, then feeds them back into your deck a turn later.",
      objective: "Protect combo turns and hand setup, because stolen cards return late instead of disappearing forever.",
      counterplay: "Spend fragile setup pieces before the Oracle cycles its theft and forces awkward redraws.",
      phaseThresholdsPct: [66, 33],
    });
  }

  if (hasName(enemyDef, /Warden/i)) {
    return createBossDirective({
      type: "warden",
      label: "Mutation Lockdown",
      summary: "Targets mutated cards specifically, accelerating their clocks and locking them out for a turn.",
      objective: "Mutated hand cards are priority targets. Stabilise them or spend them before lockdown windows.",
      counterplay: "Treat mutation-heavy hands as a timed puzzle instead of sitting on value.",
      phaseThresholdsPct: [70, 35],
    });
  }

  if (hasName(enemyDef, /Citadel/i)) {
    return createBossDirective({
      type: "citadel",
      label: "Defense Grid",
      summary: "Projects Firewall across the whole enemy side and reinforces any allied drones on the field.",
      objective: "Clear support nodes before phase breaks or the grid refresh comes back harder.",
      counterplay: "Use downtime to collapse the formation before the next reinforcement spike.",
      phaseThresholdsPct: [70, 40],
      summonTemplate: "E_FIREWALL_POD",
      phaseExposeStatus: "ExposedPorts",
      phaseExposeStacks: actNumber >= 3 ? 3 : 2,
    });
  }

  if (hasName(enemyDef, /Core/i)) {
    return createBossDirective({
      type: "core",
      label: "Static Shell",
      summary: "Phase shifts create an immune shell: break the Firewall first before HP can be damaged again.",
      objective: "Strip Firewall during shell phases to resume HP damage.",
      counterplay: "Hold breach and multi-hit turns for the moment the shell comes online.",
      phaseThresholdsPct: [75, 45],
    });
  }

  if (hasName(enemyDef, /Goliath/i)) {
    return createBossDirective({
      type: "goliath",
      label: "Impact Limit",
      summary: "Caps damage from each hit, forcing you to win with sequencing instead of one giant spike.",
      objective: "Single-hit burst is capped. Win with repeated hits, breach, and persistent pressure.",
      counterplay: "Treat the fight like a tempo test, not a one-shot check.",
      phaseThresholdsPct: [65, 35],
      hitCap: actNumber >= 3 ? 18 : actNumber === 2 ? 15 : 12,
    });
  }

  if (hasName(enemyDef, /Apex/i)) {
    return createBossDirective({
      type: "apex",
      label: "Combo Punisher",
      summary: "Punishes long player turns by retaliating once you overextend your combo chain.",
      objective: "Stay under the combo ceiling or feed the boss extra actions.",
      counterplay: "Sometimes the right line is ending a little early instead of giving the Apex a free punish window.",
      phaseThresholdsPct: [70, 35],
      baseComboThreshold: 4,
    });
  }

  if (hasRole(enemyDef, "boss")) {
    return createBossDirective({
      type: "boss",
      label: "Boss Protocol",
      summary: "A multi-action boss with elevated phase pressure.",
      objective: "Expect multiple pressure spikes and phase shifts during the fight.",
      counterplay: "Do not spend every answer the moment it appears.",
    });
  }

  return null;
}

function getEnemyFirewall(enemy) {
  return (enemy?.statuses || []).find((status) => status.id === "Firewall")?.stacks ?? 0;
}

function getRemainingPhaseThresholds(enemy) {
  const thresholds = Array.isArray(enemy?.phaseThresholdsPct) ? enemy.phaseThresholdsPct : [];
  const triggered = enemy?.combatFlags?.phaseTriggered || {};
  return thresholds
    .map((threshold) => Number(threshold))
    .filter((threshold) => Number.isFinite(threshold) && !triggered[threshold]);
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getBossDirective(enemyDef, act = 1) {
  if (!enemyDef) return null;
  const actNumber = Math.max(1, Number(act || 1));
  const summonTemplate = actNumber >= 3 ? "E_FIREWALL_POD" : "E_SCRAP_MINION";
  return getBossDirectiveConfig(enemyDef, actNumber, summonTemplate);
}

export function getBossDirectiveReadout(enemy, context = {}) {
  const directive = enemy?.bossDirective;
  if (!directive) return null;

  const aliveAllies = Math.max(0, Number(context.aliveAllies || 0));
  const mutatedHandCount = Math.max(0, Number(context.mutatedHandCount || 0));
  const cardsPlayedThisTurn = Math.max(0, Number(context.cardsPlayedThisTurn || 0));
  const firewall = getEnemyFirewall(enemy);
  const remainingPhases = getRemainingPhaseThresholds(enemy);
  const nextPhasePct = remainingPhases[0] ?? null;

  let progress = directive.counterplay || directive.summary;
  let emphasis = "neutral";

  switch (directive.type) {
    case "hydra":
      progress = aliveAllies > 0
        ? `${formatCountLabel(aliveAllies, "spawned head")} online. Clear them before the next split.`
        : "No spawned heads online. The next split will expose the chassis instead of feeding it.";
      emphasis = aliveAllies > 0 ? "warning" : "good";
      break;
    case "mainframe": {
      const enemyTurn = Math.max(0, Number(enemy?.combatFlags?.enemyTurn || 0));
      const turnsUntilCharge = Math.max(1, 3 - (enemyTurn % 3 || 0));
      progress = enemy?.combatFlags?.mainframeChargeActive
        ? `Purge Charge armed. Break all Firewall before its next action (${firewall} FW left).`
        : `Next Purge Charge in about ${turnsUntilCharge} enemy turn${turnsUntilCharge === 1 ? "" : "s"}.`;
      emphasis = enemy?.combatFlags?.mainframeChargeActive ? "critical" : (turnsUntilCharge === 1 ? "warning" : "neutral");
      break;
    }
    case "oracle": {
      const stashCount = enemy?.combatFlags?.oracleStash?.length || 0;
      const returnTurn = enemy?.combatFlags?.oracleReturnTurn || 0;
      progress = stashCount > 0
        ? `${formatCountLabel(stashCount, "stolen card")} in cold storage${returnTurn > 0 ? ` until enemy turn ${returnTurn}` : ""}.`
        : "No stolen cards in cold storage right now.";
      emphasis = stashCount > 0 ? "warning" : "good";
      break;
    }
    case "warden":
      progress = mutatedHandCount > 0
        ? `${formatCountLabel(mutatedHandCount, "mutated hand card")} exposed to lockdown.`
        : "No mutated hand cards are exposed right now.";
      emphasis = mutatedHandCount > 0 ? "warning" : "good";
      break;
    case "citadel":
      progress = aliveAllies > 0
        ? `${formatCountLabel(aliveAllies, "support node")} online. Clear them before the next grid refresh.`
        : "The defense grid has no support nodes online. The next phase break will be softer.";
      emphasis = aliveAllies > 0 ? "warning" : "good";
      break;
    case "core":
      progress = enemy?.combatFlags?.hpPhaseShield
        ? (firewall > 0
          ? `Phase shell active. Strip ${firewall} Firewall to crack the shell.`
          : "Phase shell destabilized. HP is exposed again.")
        : "Phase shell dormant until the next threshold.";
      emphasis = enemy?.combatFlags?.hpPhaseShield && firewall > 0 ? "critical" : "good";
      break;
    case "goliath": {
      const hitCap = Math.max(0, Number(enemy?.combatFlags?.damageCapPerHit || directive.hitCap || 0));
      progress = `Impact limit: ${hitCap} damage per hit. Sequence multiple hits instead of one spike.`;
      emphasis = "warning";
      break;
    }
    case "apex": {
      const comboThreshold = Math.max(1, Number(enemy?.combatFlags?.apexNextThreshold || directive.baseComboThreshold || 4));
      progress = `Punishes at ${comboThreshold} cards in a turn. Current chain: ${cardsPlayedThisTurn}.`;
      emphasis = cardsPlayedThisTurn >= comboThreshold - 1 ? "warning" : "neutral";
      break;
    }
    default:
      progress = directive.counterplay || directive.summary;
      emphasis = "neutral";
      break;
  }

  return {
    title: directive.label,
    summary: directive.summary,
    objective: directive.objective || directive.summary,
    counterplay: directive.counterplay || null,
    progress,
    emphasis,
    nextPhase: nextPhasePct != null ? `Next phase at ${nextPhasePct}% HP` : "Final phase active",
  };
}

export function getEncounterDirectives({ enemyDefs = [], deckAnalysis = null, encounterName = "", encounterKind = "normal" } = {}) {
  const directives = [];
  const safeEnemyDefs = enemyDefs.filter(Boolean);
  const analysis = deckAnalysis || analyzeDeckState(null, { master: [], cardInstances: {} });
  const names = safeEnemyDefs.map((enemyDef) => String(enemyDef.name || ""));
  const enemyCount = safeEnemyDefs.length;
  const supportCount = safeEnemyDefs.filter((enemyDef) => hasRole(enemyDef, "Support/Heal")).length;
  const tankCount = safeEnemyDefs.filter((enemyDef) => hasRole(enemyDef, "Defense/Tank")).length;
  const mutationHunterCount = safeEnemyDefs.filter((enemyDef) => /Warden|Oracle|Hacker/i.test(String(enemyDef.name || ""))).length;
  const looksSwarmy = names.some((name) => /Swarm|Pack|Suite|Cell|Imp|Pod/i.test(name));

  if (enemyCount >= 3 || looksSwarmy) {
    directives.push({
      type: "swarm",
      label: "Swarm Pressure",
      summary: "Enemy attacks hit harder while three or more hostiles are still online.",
      minEnemies: 3,
    });
  }

  if (supportCount > 0 && (enemyCount - supportCount) > 0) {
    directives.push({
      type: "linked_support",
      label: "Linked Support",
      summary: "Support units patch the weakest ally after acting, making target priority matter more.",
      supportCount,
    });
  } else if (tankCount > 0 && enemyCount > 1) {
    directives.push({
      type: "shield_wall",
      label: "Shield Wall",
      summary: "Defensive units project extra Firewall to the formation if you leave the line intact.",
      tankCount,
    });
  }

  if (analysis.mutatedCount >= 3 && mutationHunterCount > 0 && encounterKind !== "boss") {
    directives.push({
      type: "mutation_hunters",
      label: "Mutation Hunters",
      summary: "This group scans for mutated cards and tries to accelerate or lock them down.",
      hunterCount: mutationHunterCount,
    });
  }

  if (/Control|Pressure|Stack|Screen|Swarm|Horde/i.test(String(encounterName || "")) && directives.length === 0) {
    directives.push({
      type: "formed",
      label: "Coordinated Pack",
      summary: "A structured encounter with cleaner enemy coordination than a random skirmish.",
    });
  }

  return directives;
}

export function getEnemyDirectiveSummaries(enemy) {
  const lines = [];

  if (enemy?.bossDirective?.summary) lines.push(enemy.bossDirective.summary);
  if (enemy?.bossDirective?.objective) lines.push(enemy.bossDirective.objective);
  if (enemy?.bossDirective?.counterplay) lines.push(enemy.bossDirective.counterplay);

  for (const hint of enemy?.encounterHints || []) {
    if (hint?.summary) lines.push(hint.summary);
  }

  return [...new Set(lines.filter(Boolean))];
}
