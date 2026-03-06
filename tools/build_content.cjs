#!/usr/bin/env node
/**
 * Option A content pipeline:
 *   content_src/*.csv  ->  src/data/gamedata.json
 *
 * No dependencies. Works on Windows.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content_src");
const OUT_PATH = path.join(ROOT, "src", "data", "gamedata.json");

// ---------- tiny utils ----------
function die(msg) { console.error(msg); process.exit(1); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function readText(p) { return fs.readFileSync(p, "utf8"); }
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

// Robust enough CSV parser (quoted fields, commas, CRLF)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(cur); cur = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i++; continue; }

    cur += ch; i++;
  }

  // last cell
  row.push(cur);
  // ignore trailing empty line
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);

  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => (h || "").trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      obj[key] = (cells[c] ?? "").trim();
    }
    // skip fully empty rows
    const any = Object.values(obj).some(v => (v ?? "").toString().trim() !== "");
    if (any) out.push(obj);
  }
  return out;
}

function toNum(v, fallback=null) {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
function toBool(v, fallback=false) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
  if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  return fallback;
}
function toJson(v, fallback) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
function splitList(v) {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s.split(/[;|]/g).map(x => x.trim()).filter(Boolean);
}
function ensureId(obj, filename) {
  if (!obj.id) die(`[content] Missing id in ${filename} row: ${JSON.stringify(obj)}`);
  return obj.id;
}

// ---------- per-file builders ----------
function buildCards(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  const out = {};
  for (const r of rows) {
    const id = ensureId(r, filename);
    out[id] = {
      id,
      name: r.name || id,
      type: r.type || "Skill",
      costRAM: toNum(r.costRAM, 1),
      tags: splitList(r.tags),
      effects: toJson(r.effects, []),
      defaultUseCounter: toNum(r.defaultUseCounter, 12),
      defaultFinalMutationCountdown: toNum(r.defaultFinalMutationCountdown, 8),
      mutationOdds: toJson(r.mutationOdds, { triggerChance: 0.25, tiers: { A: 1 } }),
      finalMutation: toJson(r.finalMutation, {
        outcomeWeights: { brick: 0.5, rewrite: 0.5 },
        brickBehavior: "Exhaust",
        rewritePoolDefIds: []
      })
    };
  }
  return out;
}

function buildMutations(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  const out = {};
  for (const r of rows) {
    const id = ensureId(r, filename);
    out[id] = {
      id,
      name: r.name || id,
      tier: (r.tier || "A").toUpperCase(),
      stackable: toBool(r.stackable, true),
      ramCostDelta: toNum(r.ramCostDelta, 0),
      useCounterDelta: toNum(r.useCounterDelta, 0),
      finalCountdownDelta: toNum(r.finalCountdownDelta, 0),
      patch: r.patch || null
    };
  }
  return out;
}

function buildMutationPools(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  // expected columns: tier, mutationIds  (mutationIds separated by ; or |)
  const out = {};
  for (const r of rows) {
    const tier = String(r.tier ?? "").trim().toUpperCase();
    if (!tier) continue;
    out[tier] = splitList(r.mutationIds);
  }
  return out;
}

// Parse specialAbilities JSON array strings into the passives format used by runEnemyPassives.
// Only handles patterns that map cleanly to ops. AI-preference notes are silently skipped.
function parseSpecialAbilitiesToPassives(specialAbilitiesJson) {
  let specs;
  try { specs = JSON.parse(specialAbilitiesJson || '[]'); } catch { return []; }
  if (!Array.isArray(specs)) return [];
  const passives = [];
  for (const spec of specs) {
    if (typeof spec !== 'string') continue;
    const s = spec.trim();

    // "On death: N damage to ALL active characters"
    {
      const m = s.match(/on death[:\s]+(\d+) damage to ALL/i);
      if (m) {
        passives.push({ trigger: 'Death', ops: [
          { op: 'DealDamage', target: 'AllEnemies', amount: parseInt(m[1]) },
          { op: 'DealDamage', target: 'Player', amount: parseInt(m[1]) },
        ]});
        continue;
      }
    }
    // "On death: N damage to all active characters" (lowercase variant)
    {
      const m = s.match(/on death[:\s]+deals? (\d+) damage to ALL/i);
      if (m) {
        passives.push({ trigger: 'Death', ops: [
          { op: 'DealDamage', target: 'AllEnemies', amount: parseInt(m[1]) },
          { op: 'DealDamage', target: 'Player', amount: parseInt(m[1]) },
        ]});
        continue;
      }
    }
    // "Starts combat with N Firewall"
    {
      const m = s.match(/starts combat with (\d+) Firewall/i);
      if (m) {
        passives.push({ trigger: 'CombatStart', ops: [
          { op: 'ApplyStatus', target: 'Self', statusId: 'Firewall', stacks: parseInt(m[1]) },
        ]});
        continue;
      }
    }
    // "First debuff each combat grants N Firewall"
    {
      const m = s.match(/first debuff.*grants (\d+) Firewall/i);
      if (m) {
        passives.push({ trigger: 'FirstDebuffAppliedToSelfThisCombat', ops: [
          { op: 'ApplyStatus', target: 'Self', statusId: 'Firewall', stacks: parseInt(m[1]) },
        ]});
        continue;
      }
    }
    // "Turn 1: plays 2 cards" / "Turn 1: plays N cards"
    {
      const m = s.match(/turn 1[:\s]+plays? (\d+) cards?/i);
      if (m) {
        passives.push({ trigger: 'TurnStart', when: { turn: 1 }, ops: [
          { op: '_SetPlaysThisTurn', amount: parseInt(m[1]) },
        ]});
        continue;
      }
    }
    // "Every N turns: apply N Corrode to player"
    {
      const m = s.match(/every (\d+) turns?[:\s]+apply (\d+) Corrode/i);
      if (m) {
        passives.push({ trigger: 'EveryNTurns', n: parseInt(m[1]), ops: [
          { op: 'ApplyStatus', target: 'Enemy', statusId: 'Corrode', stacks: parseInt(m[2]) },
        ]});
        continue;
      }
    }
    // "Each turn after acting: removes 1 stack of each negative status"
    {
      if (/removes? 1 stack of each negative status/i.test(s)) {
        passives.push({ trigger: 'AfterEnemyActs', ops: [
          { op: '_RemoveOneStackAllNegativeStatuses' },
        ]});
        continue;
      }
    }
    // "On phase change: plays N extra card(s) immediately" + optional "gains N Firewall"
    {
      const m = s.match(/on phase change[:\s]+plays? (\d+) extra cards?/i);
      if (m) {
        const fw = s.match(/gains? (\d+) Firewall/i);
        const ops = [{ op: '_SetPlaysThisTurn', amount: parseInt(m[1]) + 1 }];
        if (fw) ops.push({ op: 'ApplyStatus', target: 'Self', statusId: 'Firewall', stacks: parseInt(fw[1]) });
        passives.push({ trigger: 'PhaseChange', ops });
        continue;
      }
    }
    // "On phase change: gains N Firewall" (no extra card play)
    {
      const m = s.match(/on phase change[:\s]+gains? (\d+) Firewall/i);
      if (m) {
        passives.push({ trigger: 'PhaseChange', ops: [
          { op: 'ApplyStatus', target: 'Self', statusId: 'Firewall', stacks: parseInt(m[1]) },
        ]});
        continue;
      }
    }
    // Other patterns not parsed — silently skip
  }
  return passives;
}

// Extract phase threshold percentages from specialAbilities strings.
// Returns an array like [70, 35] or null if none found.
function extractPhaseThresholdsFromSpecials(specialAbilitiesJson) {
  let specs;
  try { specs = JSON.parse(specialAbilitiesJson || '[]'); } catch { return null; }
  if (!Array.isArray(specs)) return null;
  for (const spec of specs) {
    if (typeof spec !== 'string') continue;
    // "Phases at 70% and 35% HP" or "Phases at 50% HP"
    const m = spec.match(/phases? at\s+([\d%\s,and]+)HP/i);
    if (m) {
      const pcts = [...m[1].matchAll(/(\d+)%/g)].map(x => parseInt(x[1]));
      if (pcts.length > 0) return pcts.sort((a, b) => b - a); // descending
    }
  }
  return null;
}

// Role-based enemy ability card assignment.
// Each entry maps a role → { easy, normal, hard, boss } rotation arrays.
const ENEMY_ROLE_ROTATIONS = {
  'Attack':           { easy: ['EC-A1'], normal: ['EC-A2'], hard: ['EC-A3'], boss: ['EC-A3','EC-A2','EC-A4'] },
  'Defense/Tank':     { easy: ['EC-D1','EC-D3'], normal: ['EC-D2','EC-D3'], hard: ['EC-D2','EC-D2','EC-D3'], boss: ['EC-D2','EC-D3','EC-A2'] },
  'Support/Heal':     { easy: ['EC-S1'], normal: ['EC-S1','EC-A1'], hard: ['EC-S2','EC-A2'], boss: ['EC-S2','EC-S1','EC-A2'] },
  'Control':          { easy: ['EC-C1'], normal: ['EC-C1','EC-A1'], hard: ['EC-C2','EC-A2'], boss: ['EC-C2','EC-A2','EC-C2'] },
  'Debuff/DoT':       { easy: ['EC-DB1'], normal: ['EC-DB2'], hard: ['EC-DB3'], boss: ['EC-DB3','EC-A2','EC-DB3'] },
  'Economy pressure': { easy: ['EC-E1'], normal: ['EC-E2'], hard: ['EC-E2','EC-A2'], boss: ['EC-E2','EC-A3','EC-C1'] },
  'Mixed threat':     { easy: ['EC-M1'], normal: ['EC-M1','EC-A2'], hard: ['EC-A3','EC-DB1'], boss: ['EC-A3','EC-DB2','EC-D1'] },
  'Minion':           { easy: ['EC-A1'], normal: ['EC-A1'], hard: ['EC-A2'], boss: ['EC-A2'] },
  'Boss':             { easy: ['EC-A2','EC-D1'], normal: ['EC-A3','EC-D2','EC-C1'], hard: ['EC-A4','EC-DB2','EC-D2'], boss: ['EC-A4','EC-DB3','EC-D2','EC-A3'] },
};

function getEnemyRotationByRole(role, difficulty, act) {
  const tbl = ENEMY_ROLE_ROTATIONS[role] || ENEMY_ROLE_ROTATIONS['Attack'];
  // Difficulty tier: Easy → easy, Hard/Extreme → hard, Boss → boss, else normal
  const actNum = typeof act === 'string' ? parseInt(act.replace(/\D/g,'')) || 1 : (act || 1);
  const diff = (difficulty || '').toLowerCase();
  let tier;
  if (diff === 'boss' || role === 'Boss') tier = 'boss';
  else if (diff === 'hard' || diff === 'extreme' || actNum >= 3) tier = 'hard';
  else if (diff === 'easy' || diff === 'trivial') tier = 'easy';
  else tier = 'normal';
  return (tbl[tier] || tbl['normal'] || ['EC-A1']);
}

function buildEnemies(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  const out = {};

  for (const r of rows) {
    const id = ensureId(r, filename);

    // CSV currently has rotation as either:
    // - a list of card ids (good), OR
    // - a number like "3" meaning "actions per turn" (placeholder).
    let rot = splitList(r.rotation);

    // Parse role/difficulty/act from extra field early so we can use it for auto-assignment
    const extra = toJson(r.extra, {});
    const role = r.primaryPurpose || extra["Primary purpose"] || 'Attack';
    const difficulty = r.difficulty || extra["Difficulty"] || 'Normal';
    const actStr = extra["Act"] || r.actMin || '1';

    // If rotation is just a single number (e.g. "3"), auto-assign role-based abilities
    if (rot.length === 1 && /^\d+$/.test(rot[0])) {
      rot = getEnemyRotationByRole(role, difficulty, actStr);
    }

    // If any tokens are still numeric or still C-001 placeholders, replace with role-based abilities
    const hasRealAbilities = rot.some(x => x !== 'C-001' && !/^\d+$/.test(x));
    if (!hasRealAbilities) {
      rot = getEnemyRotationByRole(role, difficulty, actStr);
    }

    // Fallback: replace any remaining numeric tokens
    rot = rot.map(x => (/^\d+$/.test(x) ? 'EC-A1' : x));

    // extra already parsed above; continue with passives/ai
    // Parse specialAbilities column into passives ops, then merge with any explicit passives
    const specPassives = parseSpecialAbilitiesToPassives(r.specialAbilities || '[]');
    const explicitPassives = toJson(r.passives, null) ?? extra.passives ?? [];
    const passives = [...specPassives, ...(Array.isArray(explicitPassives) ? explicitPassives : [])];
    const ai = toJson(r.ai, null) ?? extra.ai ?? null;
    const phaseThresholdsPct = toJson(r.phaseThresholdsPct, null)
      ?? extra.phaseThresholdsPct
      ?? extractPhaseThresholdsFromSpecials(r.specialAbilities || '[]')
      ?? null;

    out[id] = {
      id,
      name: r.name || id,
      maxHP: toNum(r.maxHP, 30),
      actionsPerTurn: toNum(r.actionsPerTurn, 1),
      rotation: rot,
      passives: Array.isArray(passives) ? passives : [],
      ai: ai && typeof ai === "object" ? ai : null,
      phaseThresholdsPct: Array.isArray(phaseThresholdsPct) ? phaseThresholdsPct : null,
      // Include enemy metadata for generator filtering
      role: role || null,
      difficulty: difficulty || "Normal",
      act: actStr || "All"
    };
  }

  return out;
}


function buildEncounters(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));

  // expected columns: id,name,act,kind,enemyIds (list),extra (JSON with generator config)
  const out = {};
  for (const r of rows) {
    const id = ensureId(r, filename);
    const extra = toJson(r.extra, {});
    
    const enc = {
      id,
      name: r.name || id,
      act: toNum(r.act, 1),
      kind: (r.kind || "normal").toLowerCase(), // normal|elite|boss
      compositionType: (r.compositionType || "fixed").toLowerCase(), // fixed|generated
      enemyIds: splitList(r.enemyIds)
    };

    // Preserve generator config if present (for dynamic encounter generation)
    if (extra.generator) {
      enc.generator = extra.generator;
    }

    // Preserve weight if present
    if (typeof extra.weight === "number") {
      enc.weight = extra.weight;
    }

    out[id] = enc;
  }
  return out;
}


function buildRelics(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return { relics: {}, relicRewardPools: {} };
  const rows = rowsToObjects(parseCsv(readText(p)));

  const MOD_NUM_COLS = [
    'maxHPDelta','maxMPDelta','maxRAMDelta','startingGoldDelta','drawPerTurnDelta',
    'travelHpCostDelta','finalCountdownTickDelta','ramRegenDelta','mutationTriggerChanceMult',
  ];

  const relics = {};
  const relicRewardPools = {};

  for (const r of rows) {
    const id = ensureId(r, filename);

    const mods = {};
    for (const k of MOD_NUM_COLS) {
      const raw = r[`mod_${k}`];
      if (raw !== undefined && raw !== '') {
        const v = parseFloat(raw);
        if (!isNaN(v)) mods[k] = v;
      }
    }
    if (r.mod_mutationTierWeightMult && r.mod_mutationTierWeightMult !== '') {
      mods.mutationTierWeightMult = toJson(r.mod_mutationTierWeightMult, {});
    }

    const entry = {
      id,
      name:        r.name        || id,
      icon:        r.icon        || '',
      rarity:      r.rarity      || 'common',
      description: r.description || '',
    };
    if (Object.keys(mods).length > 0) entry.mods = mods;
    if (r.hook        && r.hook        !== '') entry.hook       = r.hook;
    if (r.hookEffect  && r.hookEffect  !== '') entry.hookEffect = r.hookEffect;

    relics[id] = entry;

    const pool = (r.pool || r.rarity || 'common').trim();
    if (!relicRewardPools[pool]) relicRewardPools[pool] = [];
    relicRewardPools[pool].push(id);
  }

  return { relics, relicRewardPools };
}

function buildEvents(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  const out = {};
  for (const r of rows) {
    const id = ensureId(r, filename);
    out[id] = {
      id,
      name: r.name || id,
      // choices is JSON array; each choice can include ops / needsDeckTarget etc (kept flexible)
      choices: toJson(r.choices, [])
    };
  }
  return out;
}

function buildStatuses(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  const out = {};
  for (const r of rows) {
    const id = ensureId(r, filename);
    out[id] = {
      id,
      name: r.name || id,
      isNegative: toBool(r.isNegative, false),
      decaysEachTurn: toBool(r.decaysEachTurn, false),
      decayAmount: toNum(r.decayAmount, 1),
      tags: splitList(r.tags),
      notes: r.notes || ""
    };
  }
  return out;
}

function buildActBalance(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return [];
  const rows = rowsToObjects(parseCsv(readText(p)));
  // expected columns: act, goldNormal, goldElite, goldBoss, enemyHpMult, enemyDmgMult
  return rows.map(r => ({
    act: toNum(r.act, 1),
    goldNormal: toNum(r.goldNormal, 25),
    goldElite: toNum(r.goldElite, 50),
    goldBoss: toNum(r.goldBoss, 99),
    enemyHpMult: toNum(r.enemyHpMult, 1),
    enemyDmgMult: toNum(r.enemyDmgMult, 1),
  })).filter(x => Number.isFinite(x.act));
}

function buildEncounterTables(encountersById) {
  const all = Object.values(encountersById || {});
  const kinds = ["normal", "elite", "boss"];
  const acts = [1, 2, 3]; // always present

  const tables = [];
  for (const act of acts) {
    for (const kind of kinds) {
      const ids = all
        .filter(e => Number(e.act) === act && e.kind === kind)
        .map(e => e.id);

      tables.push({
        id: `ACT${act}_${kind.toUpperCase()}`,
        act,
        kind,
        encounterIds: ids
      });
    }
  }
  return tables;
}

function ensureEncounterWeights(encountersById) {
  for (const enc of Object.values(encountersById || {})) {
    if (typeof enc.weight !== "number") enc.weight = 1.0;
  }
}

function ensureActBalance(actBalance) {
  if (actBalance && actBalance.length > 0) return actBalance;
  return [
    { act: 1, goldNormal: 25, goldElite: 50, goldBoss: 99, enemyHpMult: 1.0, enemyDmgMult: 1.0 },
    { act: 2, goldNormal: 30, goldElite: 60, goldBoss: 120, enemyHpMult: 1.3, enemyDmgMult: 1.2 },
    { act: 3, goldNormal: 35, goldElite: 70, goldBoss: 150, enemyHpMult: 1.6, enemyDmgMult: 1.4 }
  ];
}

// ---------- build ----------
function main() {
  const encountersById = buildEncounters("encounters.csv");
  ensureEncounterWeights(encountersById);

  // Preserve manual, non-generated sections from existing gamedata.json (eg mapRules)
  let prev = null;
  if (exists(OUT_PATH)) {
    try { prev = JSON.parse(readText(OUT_PATH)); } catch { prev = null; }
  }

  const { relics, relicRewardPools } = buildRelics("relics.csv");

  const gamedata = {
    version: 1,
    builtAt: new Date().toISOString(),
    cards: buildCards("cards.csv"),
    mutations: buildMutations("mutations.csv"),
    mutationPoolsByTier: buildMutationPools("mutation_pools.csv"),
    enemies: buildEnemies("enemies.csv"),
    encounters: encountersById,
    encounterTables: buildEncounterTables(encountersById),
    relics,
    relicRewardPools,
    events: buildEvents("events.csv"),
    statuses: buildStatuses("statuses.csv"),
    actBalance: ensureActBalance(buildActBalance("act_balance.csv")),
  };


  // Merge preserved sections
  if (prev && typeof prev === "object") {
    if (prev.mapRules && typeof prev.mapRules === "object") gamedata.mapRules = prev.mapRules;
  }

  // Write now; validate script can be run separately (or in the same step in package.json)
  writeJson(OUT_PATH, gamedata);
  console.log(`[content] Wrote ${path.relative(ROOT, OUT_PATH)}`);
}


main();
