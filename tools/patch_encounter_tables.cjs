// tools/patch_encounter_tables.cjs
// Removes 3-enemy trio encounters from the ACT1_NORMAL table so the first
// fight is always 1 or 2 enemies (survivable with a starter deck).
// Also converts custom 3-enemy encounters to 2-enemy.
const fs   = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'src', 'data', 'gamedata.json');
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// ── 1. Fix custom 3-enemy encounter definitions to be 2-enemy ──────────────
// ENC-003 was our "3-enemy" custom placeholder — trim to 2 enemies
d.encounters['ENC-003'].enemyIds = ['E_HOLO_RAT_MK_II', 'E_HOLO_SHAMAN_CREW'];
d.encounters['ENC-003'].name = 'Standard Encounter (2 enemy)';
console.log('Fixed ENC-003 → 2 enemies');

// ENC-007 "Mixed encounter" — trim to 2
d.encounters['ENC-007'].enemyIds = ['E_HOLO_ENFORCER_MK_I', 'E_ION_RAT_SUITE'];
console.log('Fixed ENC-007 → 2 enemies');

// ENC_GEN_A1_MIX_1_3 — trim to 2
d.encounters['ENC_GEN_A1_MIX_1_3'].enemyIds = ['E_HOLO_SAPPER_CELL', 'E_ION_RAT_SUITE'];
d.encounters['ENC_GEN_A1_MIX_1_3'].name = 'Act 1 Random: Mixed (1–2)';
console.log('Fixed ENC_GEN_A1_MIX_1_3 → 2 enemies');

// ── 2. Remove N3_* (trio) encounters from ACT1_NORMAL table ───────────────
const act1NormalTable = d.encounterTables.find(t => t.act === 1 && t.kind === 'normal');
if (act1NormalTable) {
  const beforeCount = act1NormalTable.encounterIds.length;
  // Remove all ENC_A1_N3_* trios (they'll go to hard table below)
  act1NormalTable.encounterIds = act1NormalTable.encounterIds.filter(id => !id.startsWith('ENC_A1_N3_'));
  const removed = beforeCount - act1NormalTable.encounterIds.length;
  console.log(`Removed ${removed} trio encounters from ACT1_NORMAL (was ${beforeCount}, now ${act1NormalTable.encounterIds.length})`);
}

// ── 3. Add trio encounters to ACT1_HARD table (or create one) ─────────────
// "Hard" encounters appear at challenge nodes but not at normal combat nodes.
const act1HardId = 'ACT1_HARD';
let act1HardTable = d.encounterTables.find(t => t.id === act1HardId);
if (!act1HardTable) {
  act1HardTable = { id: act1HardId, act: 1, kind: 'hard', encounterIds: [] };
  d.encounterTables.push(act1HardTable);
  console.log('Created ACT1_HARD table');
}
// Add N3 trios to hard table if not already there
const trioIds = ['ENC_A1_N3_01','ENC_A1_N3_02','ENC_A1_N3_03','ENC_A1_N3_04','ENC_A1_N3_05','ENC_A1_N3_06'];
for (const tid of trioIds) {
  if (!act1HardTable.encounterIds.includes(tid)) {
    act1HardTable.encounterIds.push(tid);
  }
}
// Also add the GEN hard ones to ACT1_HARD
const genHardIds = ['ENC_GEN_A1_CONTROL_FOCUS','ENC_GEN_A1_DAMAGE_FOCUS','ENC_GEN_A1_LEAK_THEME'];
for (const gid of genHardIds) {
  if (!act1HardTable.encounterIds.includes(gid)) {
    act1HardTable.encounterIds.push(gid);
  }
}

// Also remove the GEN hard encounters from ACT1_NORMAL (they're hard-tier only)
if (act1NormalTable) {
  const n = act1NormalTable.encounterIds.length;
  act1NormalTable.encounterIds = act1NormalTable.encounterIds.filter(id => !genHardIds.includes(id));
  const removed2 = n - act1NormalTable.encounterIds.length;
  if (removed2) console.log(`Removed ${removed2} GEN_HARD encounters from ACT1_NORMAL`);
}

console.log('ACT1_HARD table now has:', act1HardTable.encounterIds);
console.log('ACT1_NORMAL now has', act1NormalTable?.encounterIds.length, 'encounters');

fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));
console.log('\nDone.');
