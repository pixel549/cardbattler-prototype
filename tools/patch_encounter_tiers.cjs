// tools/patch_encounter_tiers.cjs
// Moves the misclassified "Boss N" placeholder encounters out of the normal
// pool and into the elite pool, where their high-HP enemies belong.
const fs   = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'src', 'data', 'gamedata.json');
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const toPromote = ['ENC-009', 'ENC-010', 'ENC-011'];

// Remove from normal table
const act1Normal = d.encounterTables.find(t => t.act === 1 && t.kind === 'normal');
if (act1Normal) {
  const before = act1Normal.encounterIds.length;
  act1Normal.encounterIds = act1Normal.encounterIds.filter(id => !toPromote.includes(id));
  console.log(`Removed ${before - act1Normal.encounterIds.length} from ACT1_NORMAL`);
}

// Add to elite table
const act1Elite = d.encounterTables.find(t => t.act === 1 && t.kind === 'elite');
if (act1Elite) {
  for (const id of toPromote) {
    if (!act1Elite.encounterIds.includes(id)) {
      act1Elite.encounterIds.push(id);
      console.log(`Added ${id} to ACT1_ELITE`);
    }
  }
}

// Also fix their kind field in the encounter definitions
for (const id of toPromote) {
  if (d.encounters[id]) {
    d.encounters[id].kind = 'elite';
    console.log(`Set ${id} kind → elite`);
  }
}

// Give ENC-008 "Healing Support" lighter enemies — it's a 2-healer encounter
// that's intended to be more about whittling enemies who heal themselves.
// Current: HOLO_SHAMAN_MK_I (76 HP raw) + ION_CLERIC_PROXY (??). Keep as-is for now
// since cleric adds interesting gameplay.

console.log('\nACT1_NORMAL now:', act1Normal?.encounterIds.length, 'encounters');
console.log('ACT1_ELITE now:', act1Elite?.encounterIds.length, 'encounters');

fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));
console.log('Done.');
