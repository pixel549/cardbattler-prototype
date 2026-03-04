const r = JSON.parse(require('fs').readFileSync('sim-result.json','utf8'));
const log = r.state.log || [];
const muts = log.filter(e => e.msg && (
  e.msg.toLowerCase().indexOf('mutati') !== -1 ||
  e.msg.toLowerCase().indexOf('brick') !== -1 ||
  e.msg.toLowerCase().indexOf('tier') !== -1
));
console.log('Mutation log entries:', muts.length);
muts.slice(0,10).forEach(e => console.log(' ', e.msg));
console.log('Total log entries:', log.length);

const deck = r.state.deck;
if (deck && deck.cardInstances) {
  const mutated = Object.values(deck.cardInstances).filter(ci => ci.mutations && ci.mutations.length > 0);
  console.log('Cards with mutations applied:', mutated.length);
  mutated.slice(0,5).forEach(ci => console.log('  Card', ci.defId, '| muts:', JSON.stringify(ci.mutations)));
  const instances = Object.values(deck.cardInstances);
  const avg = instances.reduce((s,ci) => s + (ci.useCounter || 0), 0) / instances.length;
  console.log('Avg useCounter across deck:', avg.toFixed(1));
  const nearFinal = instances.filter(ci => (ci.finalMutationCountdown || 0) <= 3);
  console.log('Cards near final mutation (countdown <= 3):', nearFinal.length);
  nearFinal.forEach(ci => console.log('  ', ci.defId, 'countdown:', ci.finalMutationCountdown));
}
