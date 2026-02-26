#!/usr/bin/env node
/**
 * Validates src/data/gamedata.json and exits nonzero on errors.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "src", "data", "gamedata.json");

function die(msg) { console.error(msg); process.exit(1); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function err(list, msg) { list.push(msg); }

const KNOWN_OPS = new Set([
  "DealDamage","GainBlock","ApplyStatus",
  "DrawCards","GainRAM","LoseRAM","Heal",
  "AddMaxRAM","SetRAM",
  "RawText"
]);

function main() {
  if (!fs.existsSync(DATA_PATH)) die(`[validate] Missing ${path.relative(ROOT, DATA_PATH)}. Run: node tools/build_content.js`);

  const data = readJson(DATA_PATH);
  const errors = [];

  const cards = data.cards || {};
  const muts = data.mutations || {};
  const pools = data.mutationPoolsByTier || {};
  const enemies = data.enemies || {};
  const encountersRaw = data.encounters || {};
  const encounters = Array.isArray(encountersRaw)
  ? encountersRaw
  : Object.values(encountersRaw || {});


  // Cards
  for (const [id, c] of Object.entries(cards)) {
    if (!c.name) err(errors, `Card ${id} missing name`);
    if (!Array.isArray(c.effects)) err(errors, `Card ${id} effects must be array`);
    for (const op of (c.effects || [])) {
      if (!op || typeof op !== "object") { err(errors, `Card ${id} has non-object op`); continue; }
      if (!KNOWN_OPS.has(op.op)) {
        // Allow unknown ops but warn strongly (keeps pipeline flexible)
        err(errors, `Card ${id} uses unknown op "${op.op}"`);
      }
    }
  }

  // Mutation pools -> mutations exist
  for (const [tier, ids] of Object.entries(pools)) {
    if (!Array.isArray(ids)) { err(errors, `mutationPoolsByTier.${tier} must be array`); continue; }
    for (const mid of ids) {
      if (!muts[mid]) err(errors, `Tier ${tier} references missing mutation ${mid}`);
    }
  }

  // Enemies -> card defs exist
  for (const [eid, e] of Object.entries(enemies)) {
    if (!Array.isArray(e.rotation) || e.rotation.length === 0) err(errors, `Enemy ${eid} rotation missing/empty`);
    for (const cd of (e.rotation || [])) {
      if (!cards[cd]) err(errors, `Enemy ${eid} rotation references missing card ${cd}`);
    }
  }

  // Encounters -> enemies exist
  for (const enc of encounters) {
    if (!enc.id) err(errors, `Encounter missing id`);
    // Generated encounters pick enemies at runtime from generatorRules — skip static enemyIds check
    if (enc.compositionType !== 'generated') {
      if (!Array.isArray(enc.enemyIds) || enc.enemyIds.length === 0) err(errors, `Encounter ${enc.id} missing enemyIds`);
      for (const eid of (enc.enemyIds || [])) {
        if (!enemies[eid]) err(errors, `Encounter ${enc.id} references missing enemy ${eid}`);
      }
    }
  }

  if (errors.length) {
    console.error(`\n[validate] FAILED (${errors.length} issues)\n`);
    for (const e of errors) console.error(" - " + e);
    console.error("");
    process.exit(1);
  }

  console.log("[validate] OK");
}

main();
