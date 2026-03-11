import { analyzeDeckState } from "./runInsights";

function hasName(enemyDef, pattern) {
  return pattern.test(String(enemyDef?.name || ""));
}

function hasRole(enemyDef, role) {
  return String(enemyDef?.role || "").toLowerCase() === String(role || "").toLowerCase();
}

export function getBossDirective(enemyDef, act = 1) {
  if (!enemyDef) return null;
  const actNumber = Math.max(1, Number(act || 1));
  const summonTemplate = actNumber >= 3 ? "E_FIREWALL_POD" : "E_SCRAP_MINION";

  if (hasName(enemyDef, /Hydra/i)) {
    return {
      type: "hydra",
      label: "Split Process",
      summary: "Thresholds spawn support drones. If the field is full, the Hydra hardens itself instead.",
      phaseThresholdsPct: [75, 50, 25],
      summonTemplate,
    };
  }
  if (hasName(enemyDef, /Mainframe/i)) {
    return {
      type: "mainframe",
      label: "Rule Rewrite",
      summary: "Rewrites combat rules mid-fight by taxing your next turn's draw and first card cost.",
      phaseThresholdsPct: [70, 40],
    };
  }
  if (hasName(enemyDef, /Oracle/i)) {
    return {
      type: "oracle",
      label: "Data Heist",
      summary: "Steals cards from your hand, then feeds them back into your deck a turn later.",
      phaseThresholdsPct: [66, 33],
    };
  }
  if (hasName(enemyDef, /Warden/i)) {
    return {
      type: "warden",
      label: "Mutation Lockdown",
      summary: "Targets mutated cards specifically, accelerating their clocks and locking them out for a turn.",
      phaseThresholdsPct: [70, 35],
    };
  }
  if (hasName(enemyDef, /Citadel/i)) {
    return {
      type: "citadel",
      label: "Defense Grid",
      summary: "Projects Firewall across the whole enemy side and reinforces any allied drones on the field.",
      phaseThresholdsPct: [70, 40],
      summonTemplate: "E_FIREWALL_POD",
    };
  }
  if (hasName(enemyDef, /Core/i)) {
    return {
      type: "core",
      label: "Static Shell",
      summary: "Phase shifts create an immune shell: break the Firewall first before HP can be damaged again.",
      phaseThresholdsPct: [75, 45],
    };
  }
  if (hasName(enemyDef, /Goliath/i)) {
    return {
      type: "goliath",
      label: "Impact Limit",
      summary: "Caps damage from each hit, forcing you to win with sequencing instead of one giant spike.",
      phaseThresholdsPct: [65, 35],
      hitCap: actNumber >= 3 ? 18 : actNumber === 2 ? 15 : 12,
    };
  }
  if (hasName(enemyDef, /Apex/i)) {
    return {
      type: "apex",
      label: "Combo Punisher",
      summary: "Punishes long player turns by retaliating once you overextend your combo chain.",
      phaseThresholdsPct: [70, 35],
    };
  }
  if (String(enemyDef?.role || "").toLowerCase() === "boss") {
    return {
      type: "boss",
      label: "Boss Protocol",
      summary: "A multi-action boss with elevated phase pressure.",
      phaseThresholdsPct: [70, 35],
    };
  }
  return null;
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
  for (const hint of enemy?.encounterHints || []) {
    if (hint?.summary) lines.push(hint.summary);
  }
  return lines;
}
