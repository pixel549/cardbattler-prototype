// tools/list_encounters.cjs — list broken + working encounters and enemy pool
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('src/data/gamedata.json', 'utf8'));

const encs = d.encounters;
const enemies = d.enemies;

// Broken encounters
const broken = Object.entries(encs).filter(([k, v]) => !v.enemyIds || v.enemyIds.length === 0);
console.log('=== BROKEN ENCOUNTERS (' + broken.length + ') ===');
broken.forEach(([k, v]) => {
  console.log(JSON.stringify({ id: k, act: v.act, kind: v.kind, name: v.name }));
});

// Working encounters (for reference)
const working = Object.entries(encs).filter(([k, v]) => v.enemyIds && v.enemyIds.length > 0);
console.log('\n=== WORKING ENCOUNTERS (' + working.length + ') ===');
working.forEach(([k, v]) => {
  console.log(JSON.stringify({ id: k, act: v.act, kind: v.kind, name: v.name, enemyIds: v.enemyIds }));
});

// Enemy pool grouped by act-relevant prefix
const enemyKeys = Object.keys(enemies);
console.log('\n=== ENEMY POOL (' + enemyKeys.length + ') ===');
// Group by first word after E_
const groups = {};
enemyKeys.forEach(k => {
  const parts = k.replace(/^E_/, '').split('_');
  const prefix = parts[0];
  if (!groups[prefix]) groups[prefix] = [];
  groups[prefix].push(k);
});
Object.entries(groups).sort().forEach(([p, ks]) => {
  console.log(p + ': ' + ks.join(', '));
});
