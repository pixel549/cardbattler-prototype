const data = JSON.parse(require('fs').readFileSync('src/data/gamedata.json', 'utf8'));
const cards = data.cards;
const samples = ['NC-001', 'NC-040', 'NC-073', 'NC-100'];
for (const id of samples) {
  const c = cards[id];
  if (!c) { console.log(id, 'NOT FOUND'); continue; }
  const pool = c.finalMutation?.rewritePoolDefIds || [];
  const names = pool.map(pid => cards[pid]?.name || pid);
  console.log(id, c.name, '(' + c.type + ') -> pool:', names.join(', '));
}
const sizes = Object.values(cards)
  .map(c => (c.finalMutation?.rewritePoolDefIds || []).length)
  .filter(n => n > 0);
if (sizes.length) {
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
  console.log('Pool size stats: min=' + min + ' max=' + max + ' avg=' + avg + ' count=' + sizes.length);
}
