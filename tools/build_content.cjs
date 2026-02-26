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

function buildEnemies(filename) {
  const p = path.join(CONTENT_DIR, filename);
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  const out = {};

  for (const r of rows) {
    const id = ensureId(r, filename);

    // CSV currently has rotation as either:
    // - a list of card ids (good), OR
    // - a number like "3" meaning "actions per turn" (bad for validator).
    let rot = splitList(r.rotation);

    // If rotation is just a single number (e.g. "3"), treat it as "repeat a basic move N times".
    if (rot.length === 1 && /^\d+$/.test(rot[0])) {
      const n = Math.max(1, Math.min(10, Number(rot[0]))); // clamp
      rot = Array.from({ length: n }, () => "C-001");       // C-001 exists (Strike)
    }

    // If any tokens are still numeric (e.g. "2"), replace with a real card id.
    rot = rot.map(x => (/^\d+$/.test(x) ? "C-001" : x));

    // Parse extra field for enemy metadata (role, difficulty, act, etc.)
    const extra = toJson(r.extra, {});
    const passives = toJson(r.passives, null) ?? extra.passives ?? [];
    const ai = toJson(r.ai, null) ?? extra.ai ?? null;
    const phaseThresholdsPct = toJson(r.phaseThresholdsPct, null) ?? extra.phaseThresholdsPct ?? null;

    out[id] = {
      id,
      name: r.name || id,
      maxHP: toNum(r.maxHP, 30),
      rotation: rot,
      passives: Array.isArray(passives) ? passives : [],
      ai: ai && typeof ai === "object" ? ai : null,
      phaseThresholdsPct: Array.isArray(phaseThresholdsPct) ? phaseThresholdsPct : null,
      // Include enemy metadata for generator filtering
      role: extra["Primary purpose"] || null,
      difficulty: extra["Difficulty"] || "Normal",
      act: extra["Act"] || "All"
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
  if (!exists(p)) return {};
  const rows = rowsToObjects(parseCsv(readText(p)));
  const out = {};
  for (const r of rows) {
    const id = ensureId(r, filename);
    out[id] = { id, name: r.name || id, mods: toJson(r.mods, {}) };
  }
  return out;
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

  const gamedata = {
    version: 1,
    builtAt: new Date().toISOString(),
    cards: buildCards("cards.csv"),
    mutations: buildMutations("mutations.csv"),
    mutationPoolsByTier: buildMutationPools("mutation_pools.csv"),
    enemies: buildEnemies("enemies.csv"),
    encounters: encountersById,
    encounterTables: buildEncounterTables(encountersById),
    relics: buildRelics("relics.csv"),
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
