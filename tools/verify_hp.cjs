const gd = require('../src/data/gamedata.json');
const enemies = Object.values(gd.enemies);
// Show first enemy's full structure
console.log('First enemy keys:', Object.keys(enemies[0]).join(', '));
console.log('Sample:', JSON.stringify(enemies[0]).slice(0, 300));
console.log('\nHP distribution (all enemies):');
const hps = enemies.map(e => e.maxHP).sort((a,b) => a-b);
const p = pct => hps[Math.floor(pct * hps.length / 100)];
console.log('  min:', hps[0], '  p25:', p(25), '  p50:', p(50), '  p75:', p(75), '  p90:', p(90), '  max:', hps[hps.length-1]);
console.log('  count total:', hps.length);
console.log('  count > 100:', hps.filter(h=>h>100).length);
console.log('  count > 150:', hps.filter(h=>h>150).length);
