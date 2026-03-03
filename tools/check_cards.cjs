const data = JSON.parse(require('fs').readFileSync('src/data/gamedata.json','utf8'));
const c054 = data.cards['NC-054'];
if (c054) console.log('NC-054:', JSON.stringify({name:c054.name,costRAM:c054.costRAM,type:c054.type,effects:c054.effects,tags:c054.tags},null,2));

const volatileCards = Object.entries(data.cards).filter(([,c]) => (c.tags||[]).includes('Volatile'));
const oneshotCards = Object.entries(data.cards).filter(([,c]) => (c.tags||[]).includes('OneShot'));
console.log('\nVolatile cards:', volatileCards.length);
volatileCards.slice(0,5).forEach(([id,c]) => console.log(' ', id, c.name, '- costRAM:', c.costRAM));
console.log('\nOneShot cards:', oneshotCards.length);
oneshotCards.slice(0,5).forEach(([id,c]) => console.log(' ', id, c.name, '- costRAM:', c.costRAM));
