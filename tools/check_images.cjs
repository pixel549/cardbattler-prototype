const d = JSON.parse(require('fs').readFileSync('src/data/gamedata.json','utf8'));
const imgFile = require('fs').readFileSync('src/data/enemyImages.js','utf8');
const allEnemies = Object.keys(d.enemies);
const missing = allEnemies.filter(id => imgFile.indexOf(id) === -1);
console.log('Total enemies:', allEnemies.length);
console.log('Missing image mappings (' + missing.length + '):', missing.join('\n  '));

const byType = {};
Object.entries(d.cards).forEach(([id,c]) => {
  if (!c.tags || c.tags.indexOf('EnemyCard') === -1) {
    if (!byType[c.type]) byType[c.type] = [];
    byType[c.type].push(id);
  }
});
Object.entries(byType).forEach(([t,ids]) => console.log(t+': '+ids.length+' cards, e.g. '+ids[0]+' = '+d.cards[ids[0]].name));
console.log('C-001:', d.cards['C-001'] && d.cards['C-001'].name, d.cards['C-001'] && d.cards['C-001'].type);
console.log('C-002:', d.cards['C-002'] && d.cards['C-002'].name, d.cards['C-002'] && d.cards['C-002'].type);
