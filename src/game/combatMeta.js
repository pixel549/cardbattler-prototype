const STRATEGY_KEYS = ["aggro", "defense", "control", "engine"];

export const HEAT_MAX = 20;

export function clampHeat(value, maxHeat = HEAT_MAX) {
  const safeMax = Math.max(1, Number(maxHeat || HEAT_MAX));
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(0, Math.min(safeMax, Math.round(safeValue)));
}

export function getHeatState(value, maxHeat = HEAT_MAX) {
  const heat = clampHeat(value, maxHeat);
  const safeMax = Math.max(1, Number(maxHeat || HEAT_MAX));
  const ratio = heat / safeMax;

  if (ratio >= 0.8) {
    return {
      heat,
      maxHeat: safeMax,
      ratio,
      alertLevel: 3,
      label: "Critical",
      shortLabel: "CRITICAL",
      color: "#ff5b2d",
      enemyDamageMult: 1.22,
      firewallPulse: 3,
      mutationPulse: 2,
      decay: 3,
      summary: "Trace is red-hot. Enemies harden, hit harder, and unstable code slips faster.",
    };
  }

  if (ratio >= 0.55) {
    return {
      heat,
      maxHeat: safeMax,
      ratio,
      alertLevel: 2,
      label: "Hot",
      shortLabel: "HOT",
      color: "#ff9a2f",
      enemyDamageMult: 1.12,
      firewallPulse: 2,
      mutationPulse: 1,
      decay: 3,
      summary: "The network is reacting. Enemy defenses climb and mutation clocks start to tighten.",
    };
  }

  if (ratio >= 0.3) {
    return {
      heat,
      maxHeat: safeMax,
      ratio,
      alertLevel: 1,
      label: "Warm",
      shortLabel: "WARM",
      color: "#ffd24a",
      enemyDamageMult: 1.05,
      firewallPulse: 1,
      mutationPulse: 0,
      decay: 2,
      summary: "You are building trace. Enemies start to lean into more aggressive responses.",
    };
  }

  return {
    heat,
    maxHeat: safeMax,
    ratio,
    alertLevel: 0,
    label: "Cool",
    shortLabel: "COOL",
    color: "#4de3ff",
    enemyDamageMult: 1,
    firewallPulse: 0,
    mutationPulse: 0,
    decay: 2,
    summary: "Systems are cool and the trace net is not reacting yet.",
  };
}

export function getCardHeatGain(card = {}) {
  const effectSummary = card.effectSummary || {};
  const tags = Array.isArray(card.tags) ? card.tags : [];
  let gain = 1;

  gain += Math.max(0, Number(card.cost || 0) - 1);
  if ((effectSummary.damage || 0) >= 8) gain += 1;
  if ((effectSummary.damage || 0) >= 14) gain += 1;
  if ((effectSummary.targetsAllEnemies || false) || (effectSummary.draw || 0) >= 2) gain += 1;
  if ((effectSummary.gainRAM || 0) >= 2 || effectSummary.xCost) gain += 1;
  if ((effectSummary.firewallSpend || false) || (effectSummary.firewallBreachAll || false)) gain += 1;
  if ((effectSummary.firewallBreach || 0) >= 4) gain += 1;
  if (Number(card.compileLevel || 0) > 0) gain += 1;
  if (Number(card.appliedMutationCount || 0) >= 2) gain += 1;
  if (card.type === "Power" || tags.includes("Power")) gain += 1;

  return Math.max(1, Math.min(6, gain));
}

function createScoreMap(values = {}) {
  return STRATEGY_KEYS.reduce((acc, key) => {
    acc[key] = Math.max(0, Number(values[key] || 0));
    return acc;
  }, {});
}

function createRoleMap(values = {}) {
  return {
    damage: Math.max(0, Number(values.damage || 0)),
    defense: Math.max(0, Number(values.defense || 0)),
    control: Math.max(0, Number(values.control || 0)),
    engine: Math.max(0, Number(values.engine || 0)),
  };
}

export function createRunAdaptationProfile() {
  return {
    cardsPlayed: 0,
    totalDamage: 0,
    totalDefense: 0,
    totalControl: 0,
    totalEngine: 0,
    scores: createScoreMap(),
    roleCounts: createRoleMap(),
    lastDominantStrategy: "balanced",
  };
}

export function normalizeRunAdaptationProfile(profile = null) {
  const base = createRunAdaptationProfile();
  return {
    ...base,
    ...(profile || {}),
    cardsPlayed: Math.max(0, Number(profile?.cardsPlayed || 0)),
    totalDamage: Math.max(0, Number(profile?.totalDamage || 0)),
    totalDefense: Math.max(0, Number(profile?.totalDefense || 0)),
    totalControl: Math.max(0, Number(profile?.totalControl || 0)),
    totalEngine: Math.max(0, Number(profile?.totalEngine || 0)),
    scores: createScoreMap(profile?.scores),
    roleCounts: createRoleMap(profile?.roleCounts),
    lastDominantStrategy: profile?.lastDominantStrategy || "balanced",
  };
}

export function getDominantStrategy(profile = null) {
  const normalized = normalizeRunAdaptationProfile(profile);
  const ranked = STRATEGY_KEYS
    .map((key) => ({ key, score: normalized.scores[key] }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.key.localeCompare(b.key);
    });
  const top = ranked[0] || { key: "balanced", score: 0 };
  const second = ranked[1] || { key: "balanced", score: 0 };
  const total = ranked.reduce((sum, entry) => sum + entry.score, 0);
  const confidence = total > 0 ? top.score / total : 0;
  const decisive = normalized.cardsPlayed >= 4 && top.score >= Math.max(6, second.score * 1.15) && confidence >= 0.34;

  return {
    strategy: decisive ? top.key : "balanced",
    confidence,
    topScore: top.score,
    secondScore: second.score,
    cardsPlayed: normalized.cardsPlayed,
  };
}

export function recordCardPlayForAdaptation(profile, play = {}) {
  const normalized = normalizeRunAdaptationProfile(profile);
  const effectSummary = play.effectSummary || {};
  const next = normalizeRunAdaptationProfile(normalized);

  const damage = Math.max(0, Number(effectSummary.damage || 0));
  const defense = Math.max(0, Number(effectSummary.defense || 0) + Number(effectSummary.firewallGain || 0));
  const control = Math.max(
    0,
    Number(effectSummary.debuff || 0)
      + Number(effectSummary.firewallBreach || 0)
      + (effectSummary.firewallBreachAll ? 4 : 0),
  );
  const engine = Math.max(
    0,
    Number(effectSummary.draw || 0)
      + Number(effectSummary.gainRAM || 0)
      + (effectSummary.xCost ? 2 : 0)
      + ((play.type || effectSummary.type) === "Power" ? 2 : 0),
  );

  const compileLevel = Math.max(0, Number(play.compileLevel || 0));
  const mutationDepth = Math.max(0, Number(play.appliedMutationCount || 0));
  const cost = Math.max(0, Number(play.cost || 0));

  next.cardsPlayed += 1;
  next.totalDamage += damage;
  next.totalDefense += defense;
  next.totalControl += control;
  next.totalEngine += engine;

  next.scores.aggro += damage + cost + (effectSummary.targetsAllEnemies ? 2 : 0);
  next.scores.defense += defense + (effectSummary.heal || 0);
  next.scores.control += control + ((effectSummary.primaryRole === "breach" || effectSummary.primaryRole === "status") ? 2 : 0);
  next.scores.engine += engine + compileLevel + mutationDepth;

  if (damage > 0) next.roleCounts.damage += 1;
  if (defense > 0 || (effectSummary.heal || 0) > 0) next.roleCounts.defense += 1;
  if (control > 0) next.roleCounts.control += 1;
  if (engine > 0) next.roleCounts.engine += 1;

  next.lastDominantStrategy = getDominantStrategy(next).strategy;
  return next;
}

function getEnemyDefsForEncounter(encounterDef, data) {
  if (Array.isArray(encounterDef?.enemyDefs) && encounterDef.enemyDefs.length > 0) {
    return encounterDef.enemyDefs.filter(Boolean);
  }
  return (encounterDef?.enemyIds || [])
    .map((enemyId) => data?.enemies?.[enemyId])
    .filter(Boolean);
}

function encounterRoleFlags(encounterDef, data) {
  const enemyDefs = getEnemyDefsForEncounter(encounterDef, data);
  const roleText = enemyDefs.map((enemyDef) => String(enemyDef?.role || "").toLowerCase());
  const nameText = enemyDefs.map((enemyDef) => String(enemyDef?.name || "")).join(" ");
  const fullText = `${String(encounterDef?.name || "")} ${nameText}`;
  return {
    hasTank: roleText.some((role) => role === "defense/tank") || /shield|wall|guard|citadel|fort/i.test(fullText),
    hasSupport: roleText.some((role) => role === "support/heal") || /patch|support|healer|medic|repair/i.test(fullText),
    hasSwarm: enemyDefs.length >= 3 || /swarm|pack|suite|horde|cell|pod/i.test(fullText),
    hasPressure: /oracle|warden|hacker|pressure|control|trace|breach|corrode/i.test(fullText),
    hasCleanse: /cleanse|purge|restore|reboot/i.test(fullText),
  };
}

export function getAdaptiveEncounterWeight(encounterDef, data, adaptationProfile, context = {}) {
  const { strategy, confidence } = getDominantStrategy(adaptationProfile);
  if (strategy === "balanced" || confidence < 0.34) return 1;
  if (context.encounterKind === "boss") return 1;

  const act = Math.max(1, Number(context.act || 1));
  const flags = encounterRoleFlags(encounterDef, data);
  let weight = 1;

  if (strategy === "aggro") {
    if (flags.hasTank) weight *= 1.16 + ((act - 1) * 0.03);
    if (flags.hasSupport) weight *= 1.05;
  } else if (strategy === "defense") {
    if (flags.hasPressure) weight *= 1.14;
    if (flags.hasSwarm) weight *= 1.06;
  } else if (strategy === "control") {
    if (flags.hasCleanse) weight *= 1.14;
    if (flags.hasSupport) weight *= 1.08;
  } else if (strategy === "engine") {
    if (flags.hasSwarm) weight *= 1.12;
    if (flags.hasPressure) weight *= 1.08;
  }

  return Math.max(0.85, Math.min(1.35, weight));
}

export function getAdaptiveEncounterDirective(adaptationProfile, context = {}) {
  const { strategy, confidence } = getDominantStrategy(adaptationProfile);
  const act = Math.max(1, Number(context.act || 1));

  if (context.encounterKind === "boss" || strategy !== "aggro" || confidence < 0.38 || act < 2) {
    return null;
  }

  return {
    type: "adaptive_firewall",
    label: "Adaptive Firewall",
    summary: "The network learned your burst route and spun up extra Firewall before the fight.",
    dominantStrategy: strategy,
    firewall: act >= 3 ? 6 : 4,
  };
}

const ARENA_MODIFIER_ORDER = ["emp_zone", "firewall_grid", "data_storm"];

function stringHash(text = "") {
  let hash = 2166136261;
  const source = String(text);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixSeed(seed) {
  let mixed = (seed ^ (seed >>> 16)) >>> 0;
  mixed = Math.imul(mixed, 0x45d9f3b) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x45d9f3b) >>> 0;
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function getArenaModifierMeta(id, context = {}) {
  const act = Math.max(1, Number(context.act || 1));
  const floor = Math.max(0, Number(context.floor || 0));
  const isBoss = context.encounterKind === "boss";
  const isEarlyActOneNormal = act === 1 && context.encounterKind === "normal" && floor > 0 && floor <= 3;

  if (id === "emp_zone") {
    return {
      id,
      label: "EMP Zone",
      summary: "Start of turn: one random card in your hand is scrambled and locked.",
      shortSummary: "Locks 1 random hand card each turn.",
      lockCount: 1,
      intensity: act >= 3 ? 2 : 1,
      color: "#ffe600",
    };
  }

  if (id === "firewall_grid") {
    return {
      id,
      label: "Firewall Grid",
      summary: "The arena hardens enemy processes with passive Firewall pulses.",
      shortSummary: "Enemies gain Firewall from the arena.",
      combatStartFirewall: isEarlyActOneNormal ? 1 : (isBoss ? 4 : (act >= 3 ? 3 : 2)),
      turnStartFirewall: isEarlyActOneNormal ? 0 : (isBoss ? 2 : 1),
      color: "#00f0ff",
    };
  }

  if (id === "data_storm") {
    return {
      id,
      label: "Data Storm",
      summary: "Start of turn: a static storm deals chip damage to both sides.",
      shortSummary: "All sides take 1 chip damage each turn.",
      chipDamage: 1,
      color: "#ff6b00",
    };
  }

  return null;
}

export function pickArenaModifier(seed, act = 1, encounterKind = "normal", encounterId = "", floor = 0) {
  const salt =
    encounterKind === "elite" ? 0xE11E7E :
    encounterKind === "boss" ? 0xB055E5 :
    0x0A0B0C;
  const mixed = mixSeed(((Number(seed || 0) ^ (Math.max(1, Number(act || 1)) * 4099) ^ salt ^ stringHash(encounterId)) >>> 0));
  const id = ARENA_MODIFIER_ORDER[mixed % ARENA_MODIFIER_ORDER.length];
  return getArenaModifierMeta(id, { act, floor, encounterKind, encounterId });
}
