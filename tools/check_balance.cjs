// tools/check_balance.cjs — balance analysis
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('src/data/gamedata.json', 'utf8'));

// Check Act 1 enemy stats
const act1Enemies = [
  'E_HOLO_RUNNER_NODE','E_HOLO_SCOUT_PROXY','E_HOLO_SHAMAN_CREW','E_HOLO_SHAMAN_MK_I',
  'E_HOLO_ENFORCER_MK_I','E_HOLO_RAT_MK_II','E_HOLO_SAPPER_CELL','E_HOLO_POD_NODE',
  'E_HOLO_SNIPER_SHARD','E_ION_RAT_SUITE','E_ION_SENTINEL_NODE','E_ION_SNIPER_RIG',
  'E_ION_CLERIC_PROXY','E_KILO_SNIPER_ARRAY','E_HACKER_DRONE','E_LEAK_WRAITH',
  'E_CORRODE_RAT','E_GLITCH_WARDEN_SUITE','E_ECHO_SHAMAN_SWARM','E_ECHO_SENTINEL_SHARD',
  'E_KILO_SNIPER_ARRAY','E_FLUX_SHAMAN_CREW','E_CIPHER_POD_SHARD','E_VECTOR_GOON_PROXY',
  'E_NEON_SAPPER_MK_II','E_PULSE_BRUISER_FRAME',
];

console.log('=== ACT 1 ENEMY STATS ===');
const seen = new Set();
act1Enemies.forEach(id => {
  if (seen.has(id)) return;
  seen.add(id);
  const e = d.enemies[id];
  if (!e) { console.log(id + ': NOT FOUND'); return; }
  const totalDmgPerTurn = (e.abilities || []).reduce((sum, a) => sum + (a.damage || 0), 0);
  const hasHeal = (e.abilities || []).some(a => a.heal || a.type === 'Heal');
  console.log(id + ': HP=' + e.hp + ' dmgPerTurn=' + totalDmgPerTurn + (hasHeal ? ' HEALS' : ''));
});

// Check starter card damages
console.log('\n=== STARTER CARD STATS ===');
const starters = ['Strike','Guard','Patch','Scan'];
Object.entries(d.cards).forEach(([id, card]) => {
  if (starters.includes(card.name)) {
    const dmg = (card.effects || []).filter(e => e.op === 'DealDamage');
    const block = (card.effects || []).filter(e => e.op === 'GainBlock');
    console.log(card.name + ': cost=' + (card.costRAM||0) + 'r dmg=' + JSON.stringify(dmg.map(e=>e.amount)) + ' block=' + JSON.stringify(block.map(e=>e.amount)));
  }
});

// Also show average damage for common Act 1 cards
console.log('\n=== ALL DAMAGE CARDS (costRAM 0-2) ===');
Object.entries(d.cards)
  .filter(([id, c]) => c.tags && c.tags.includes('PlayerCard') && (c.costRAM || 0) <= 2)
  .forEach(([id, card]) => {
    const dmg = (card.effects || []).filter(e => e.op === 'DealDamage');
    if (dmg.length > 0) {
      const totalDmg = dmg.reduce((s, e) => s + (e.amount || 0), 0);
      console.log(card.name + ': cost=' + (card.costRAM||0) + 'r dmg=' + totalDmg);
    }
  });
