/**
 * merge_slices.cjs
 *
 * Manages lightweight "slice" CSVs that expose a focused subset of columns from
 * the canonical content CSVs.  Slices live in content_src/slices/ and are the
 * recommended editing surface — each one is small enough to hand off to another
 * model or open in any editor without drowning in unrelated columns.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  enemies.csv          → Enemies - Stats.csv  +  Enemies - Abilities.csv  │
 * │  cards.csv            → Cards - Stats.csv  +  Cards - Effects.csv        │
 * │                         + Cards - Mutations.csv                          │
 * │  mutations.csv        → Mutations - Identity.csv  +  Mutations - Deltas  │
 * │                         + Mutations - Patch.csv                          │
 * │  events.csv           → Events - Meta.csv  +  Events - Choices.csv       │
 * │  encounters.csv       → Encounters - Meta.csv  +  Encounters -           │
 * │                         Composition.csv                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Tiny files kept whole (already readable):
 *   statuses.csv, mutation_pools.csv, act_balance.csv, relics.csv
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node tools/merge_slices.cjs            Merge slices → canonical CSVs
 *   node tools/merge_slices.cjs --split    Split canonical CSVs → slices
 *   node tools/merge_slices.cjs --build    Merge + run build_content.cjs
 *   node tools/merge_slices.cjs --split --build   Split then build (rare)
 *
 * ── Workflow ─────────────────────────────────────────────────────────────────
 *
 *   Normal editing:
 *     1. Edit one or more files in content_src/slices/
 *     2. node tools/merge_slices.cjs --build
 *
 *   After editing a canonical CSV directly (e.g. scale_enemy_hp.cjs):
 *     node tools/merge_slices.cjs --split   (refresh slices from canonical)
 *
 * ── Rules ────────────────────────────────────────────────────────────────────
 *
 *   • The FIRST slice listed defines row order.  To add a new row, add it to
 *     the first (primary) slice for that CSV and fill the other slices too.
 *   • Merge joins slices on the `id` column.  Unknown ids in secondary slices
 *     are silently ignored; missing ids get empty strings.
 *   • Canonical CSVs are the source of truth for the game engine.  Slices are
 *     derived — always merge before building.
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..');
const CONTENT_SRC = path.join(ROOT, 'content_src');
const SLICES_DIR  = path.join(CONTENT_SRC, 'slices');

// ── Slice configuration ───────────────────────────────────────────────────────
// Each canonical CSV maps to an ordered array of slices.
// - The FIRST slice is the "primary" — it defines row order.
// - cols: exact column names as they appear in the canonical CSV header.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  'enemies.csv': {
    canonicalColumns: [
      'id','name','actMin','actMax','maxHP','rotation','difficultyTier',
      'difficulty','actionsPerTurn','handSize','primaryPurpose','statusRefs',
      'specialAbilities','notes','spawnTable','extra',
    ],
    slices: [
      {
        file: 'Enemies - Stats.csv',
        // Human-friendly columns: what you edit when balancing / writing enemies.
        cols: ['id','name','actMin','actMax','difficultyTier','difficulty',
               'primaryPurpose','maxHP','actionsPerTurn','handSize','notes'],
      },
      {
        file: 'Enemies - Abilities.csv',
        // Complex / JSON-heavy columns: rotations, status refs, spawn tables.
        cols: ['id','rotation','statusRefs','specialAbilities','spawnTable','extra'],
      },
    ],
  },

  'cards.csv': {
    canonicalColumns: [
      'id','name','type','costRAM','tags','effects',
      'defaultUseCounter','defaultFinalMutationCountdown',
      'mutationOdds','finalMutation','extra',
    ],
    slices: [
      {
        file: 'Cards - Stats.csv',
        // Quick overview: id, display info, cost, tags.
        cols: ['id','name','type','costRAM','tags'],
      },
      {
        file: 'Cards - Effects.csv',
        // What the card actually does + final mutation destination.
        cols: ['id','effects','finalMutation','extra'],
      },
      {
        file: 'Cards - Mutations.csv',
        // Mutation decay / probability tuning.
        cols: ['id','defaultUseCounter','defaultFinalMutationCountdown','mutationOdds'],
      },
    ],
  },

  'mutations.csv': {
    canonicalColumns: [
      'id','name','tier','stackable',
      'ramCostDelta','useCounterDelta','finalCountdownDelta','patch',
    ],
    slices: [
      {
        file: 'Mutations - Identity.csv',
        // Core identity — name, tier, whether it stacks.
        cols: ['id','name','tier','stackable'],
      },
      {
        file: 'Mutations - Deltas.csv',
        // Numeric stat modifiers: RAM cost, use counter, final countdown.
        cols: ['id','ramCostDelta','useCounterDelta','finalCountdownDelta'],
      },
      {
        file: 'Mutations - Patch.csv',
        // The full JSON patch blob (description, polarity, effects, etc.).
        cols: ['id','patch'],
      },
    ],
  },

  'events.csv': {
    canonicalColumns: [
      'id','name','act','rarity','mp_cost','weight','special_flags','choices',
    ],
    slices: [
      {
        file: 'Events - Meta.csv',
        // Scheduling and appearance metadata.
        cols: ['id','name','act','rarity','mp_cost','weight','special_flags'],
      },
      {
        file: 'Events - Choices.csv',
        // The full JSON choices array.
        cols: ['id','choices'],
      },
    ],
  },

  'encounters.csv': {
    canonicalColumns: [
      'id','name','act','kind','compositionType',
      'enemyIds','generatorRules','rewardMin','rewardMax','notes','extra',
    ],
    slices: [
      {
        file: 'Encounters - Meta.csv',
        // Scheduling, kind, rewards, notes.
        cols: ['id','name','act','kind','compositionType','rewardMin','rewardMax','notes'],
      },
      {
        file: 'Encounters - Composition.csv',
        // Which enemies appear + generator rules.
        cols: ['id','enemyIds','generatorRules','extra'],
      },
    ],
  },
};

// ── CSV utilities ─────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function quoteIfNeeded(val) {
  if (typeof val !== 'string') val = String(val ?? '');
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  if (!lines.length) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = cols[j] ?? '';
    }
    rows.push(obj);
  }
  return { header, rows };
}

function writeCsv(filePath, header, rows) {
  const lines = [header.map(quoteIfNeeded).join(',')];
  for (const row of rows) {
    lines.push(header.map(col => quoteIfNeeded(row[col] ?? '')).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

// ── MERGE: slices → canonical ─────────────────────────────────────────────────

function mergeAll() {
  if (!fs.existsSync(SLICES_DIR)) {
    console.error('No slices/ directory found at', SLICES_DIR);
    console.error('Run with --split first to generate slice files from the canonical CSVs.');
    process.exit(1);
  }

  let totalMerged = 0;

  for (const [canonical, cfg] of Object.entries(CONFIG)) {
    const canonicalPath = path.join(CONTENT_SRC, canonical);
    let idOrder = null;
    const sliceMaps = [];

    for (const slice of cfg.slices) {
      const slicePath = path.join(SLICES_DIR, slice.file);
      const parsed = readCsv(slicePath);
      if (!parsed) {
        console.warn(`  WARN  Missing slice: ${slice.file}  (skipping columns: ${slice.cols.slice(1).join(', ')})`);
        sliceMaps.push(null);
        continue;
      }
      const map = new Map(parsed.rows.map(r => [r.id, r]));
      sliceMaps.push(map);
      if (idOrder === null) idOrder = parsed.rows.map(r => r.id);
    }

    if (idOrder === null) {
      console.warn(`  SKIP  ${canonical} — no usable slices found`);
      continue;
    }

    const outRows = idOrder.map(id => {
      const merged = {};
      for (const sliceMap of sliceMaps) {
        if (!sliceMap) continue;
        const sliceRow = sliceMap.get(id);
        if (sliceRow) Object.assign(merged, sliceRow);
      }
      // Ensure every canonical column is present (fills gaps from missing slices)
      for (const col of cfg.canonicalColumns) {
        if (!(col in merged)) merged[col] = '';
      }
      return merged;
    });

    writeCsv(canonicalPath, cfg.canonicalColumns, outRows);
    const sliceNames = cfg.slices.map(s => s.file.replace(/\.csv$/, '')).join(' + ');
    console.log(`  ✓  ${canonical.padEnd(18)} ${outRows.length} rows  ←  ${sliceNames}`);
    totalMerged++;
  }

  console.log(`\nMerge complete — ${totalMerged} canonical CSVs written.`);
}

// ── SPLIT: canonical → slices ─────────────────────────────────────────────────

function splitAll() {
  if (!fs.existsSync(SLICES_DIR)) {
    fs.mkdirSync(SLICES_DIR, { recursive: true });
    console.log('Created', SLICES_DIR);
  }

  let totalSlices = 0;

  for (const [canonical, cfg] of Object.entries(CONFIG)) {
    const canonicalPath = path.join(CONTENT_SRC, canonical);
    const parsed = readCsv(canonicalPath);
    if (!parsed) {
      console.warn(`  SKIP  ${canonical} not found`);
      continue;
    }

    for (const slice of cfg.slices) {
      const slicePath = path.join(SLICES_DIR, slice.file);
      writeCsv(slicePath, slice.cols, parsed.rows);
      const exists = fs.existsSync(slicePath);
      console.log(`  ✓  ${slice.file.padEnd(36)} ${parsed.rows.length} rows`);
      totalSlices++;
    }
  }

  console.log(`\nSplit complete — ${totalSlices} slice files written to content_src/slices/`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const doSplit = args.includes('--split');
const doBuild = args.includes('--build');

if (doSplit) {
  console.log('=== Splitting canonical CSVs → slices ===\n');
  splitAll();
}

if (!doSplit) {
  // Default action when no --split: merge
  console.log('=== Merging slices → canonical CSVs ===\n');
  mergeAll();
}

if (doBuild) {
  console.log('\n=== Rebuilding gamedata.json ===\n');
  require('./build_content.cjs');
}
