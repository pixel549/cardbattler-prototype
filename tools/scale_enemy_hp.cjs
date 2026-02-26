/**
 * scale_enemy_hp.cjs
 * Rescales enemy maxHP values in content_src/enemies.csv to hit-count targets:
 *   Easy   → 30–55   (tutorial/intro enemies)
 *   Normal → 50–80   (standard 4–6 turn fights)
 *   Hard   → 70–100  (late-act threats, upper Normal-level)
 *   Elite  → 100–160 (8–12 turn fights)
 *   Boss   → 150–250 (12–18 turn fights, linear scale preserving relative order)
 *   Minion → 12      (unchanged; one-shot add)
 *
 * Within each tier, primaryPurpose nudges the value:
 *   Defense/Tank   → upper end (they're meant to absorb hits)
 *   Attack         → middle
 *   Mixed threat   → upper-middle
 *   Control        → middle
 *   Debuff/DoT     → lower-middle
 *   Economy press. → lower-middle
 *   Support/Heal   → lower end (healing extends fights; don't need raw HP)
 *
 * Usage:
 *   node tools/scale_enemy_hp.cjs
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'content_src', 'enemies.csv');

// ---------------------------------------------------------------------------
// Tier target ranges [lo, hi] (inclusive)
// ---------------------------------------------------------------------------
const TIER_RANGES = {
  Easy:   [30,  55 ],
  Normal: [50,  80 ],
  Hard:   [70,  100],
  Elite:  [100, 160],
  Boss:   [150, 250],
  Minion: [12,  12 ],
};

// ---------------------------------------------------------------------------
// Purpose → bias within tier range  (0 = lo, 1 = hi)
// ---------------------------------------------------------------------------
const PURPOSE_BIAS = {
  'Defense/Tank':     0.85,
  'Attack':           0.50,
  'Mixed threat':     0.75,
  'Control':          0.45,
  'Debuff/DoT':       0.35,
  'Economy pressure': 0.30,
  'Support/Heal':     0.20,
  'Minion':           0.00,
};

// ---------------------------------------------------------------------------
// Minimal quoted-CSV parser (handles "..." fields that may contain commas)
// ---------------------------------------------------------------------------
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
  if (typeof val !== 'string') val = String(val);
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// ---------------------------------------------------------------------------
// Compute new HP
// ---------------------------------------------------------------------------
function computeNewHP(tier, purpose, oldHP, bossMeta) {
  if (tier === 'Minion') return 12;

  const range = TIER_RANGES[tier];
  if (!range) return oldHP; // unknown tier → leave as-is

  const [lo, hi] = range;

  if (tier === 'Boss') {
    // Linear scale preserving relative difficulty among bosses
    const { min: bMin, max: bMax } = bossMeta;
    const t = bMax === bMin ? 0.5 : (oldHP - bMin) / (bMax - bMin);
    return Math.round(lo + t * (hi - lo));
  }

  // Purpose-based target
  const bias     = PURPOSE_BIAS[purpose] ?? 0.50;
  const target   = lo + (hi - lo) * bias;

  return Math.max(lo, Math.min(hi, Math.round(target)));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const raw   = fs.readFileSync(CSV_PATH, 'utf8');
const lines = raw.split('\n');

const header  = parseCsvLine(lines[0]);
const hpIdx   = header.indexOf('maxHP');
const tierIdx = header.indexOf('difficultyTier');
const purpIdx = header.indexOf('primaryPurpose');

if (hpIdx < 0 || tierIdx < 0 || purpIdx < 0) {
  console.error('Could not find required columns (maxHP / difficultyTier / primaryPurpose) in CSV');
  process.exit(1);
}

// First pass: collect boss HP range for linear scaling
const bossMeta = { min: Infinity, max: -Infinity };
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = parseCsvLine(lines[i]);
  if (cols[tierIdx] === 'Boss') {
    const hp = parseInt(cols[hpIdx], 10);
    if (!isNaN(hp)) {
      bossMeta.min = Math.min(bossMeta.min, hp);
      bossMeta.max = Math.max(bossMeta.max, hp);
    }
  }
}

// Second pass: rewrite HP
const out = [lines[0]]; // header unchanged
let changed = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) { out.push(line); continue; }

  const cols   = parseCsvLine(line);
  const oldHP  = parseInt(cols[hpIdx], 10);
  const tier   = cols[tierIdx]?.trim();
  const purp   = cols[purpIdx]?.trim();

  if (isNaN(oldHP) || !tier) { out.push(line); continue; }

  const newHP = computeNewHP(tier, purp, oldHP, bossMeta);

  if (newHP !== oldHP) {
    cols[hpIdx] = String(newHP);
    out.push(cols.map(quoteIfNeeded).join(','));
    console.log(`  ${cols[0].padEnd(45)} ${tier.padEnd(7)} ${purp?.padEnd(20)} ${String(oldHP).padStart(4)} → ${String(newHP).padStart(4)}`);
    changed++;
  } else {
    out.push(line);
  }
}

const TMP_PATH = CSV_PATH + '.tmp';
fs.writeFileSync(TMP_PATH, out.join('\n'), 'utf8');
// Try to overwrite the original; if locked, leave the .tmp for manual replacement
try {
  fs.renameSync(TMP_PATH, CSV_PATH);
  console.log(`\nDone. ${changed} enemies updated → ${CSV_PATH}`);
} catch (e) {
  console.log(`\nDone. ${changed} enemies updated.`);
  console.log(`NOTICE: enemies.csv is locked. Updated file written to:\n  ${TMP_PATH}`);
  console.log('Close any editor/tool that has enemies.csv open, then run:');
  console.log('  move /Y "content_src\\enemies.csv.tmp" "content_src\\enemies.csv"');
}
