/**
 * patch_rewrite_pools.cjs
 * Populates rewritePoolDefIds for all player cards that have a rewrite outcome.
 * Strategy: each card's pool = other player cards of the same type, excluding
 * itself, core cards, and enemy cards. Cards with similar RAM cost are weighted
 * first (within ±1 cost), then broadened.
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve(__dirname, '../src/data/gamedata.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const cards = data.cards;

// Build buckets: type → [id, ...] (player cards only, sorted by costRAM)
const byType = {};
for (const [id, c] of Object.entries(cards)) {
  const isEnemy = (c.tags || []).includes('EnemyCard') || id.startsWith('EC-');
  const isCore  = (c.tags || []).includes('Core');
  if (isEnemy || isCore) continue;
  const t = c.type || 'Utility';
  if (!byType[t]) byType[t] = [];
  byType[t].push(id);
}

console.log('Player card pools by type:');
for (const [t, ids] of Object.entries(byType)) {
  console.log(`  ${t}: ${ids.length} cards`);
}

let patched = 0;
let skipped = 0;

for (const [id, c] of Object.entries(cards)) {
  const fm = c.finalMutation;
  if (!fm) continue;
  const rewriteChance = fm.outcomeWeights?.rewrite || 0;
  if (rewriteChance <= 0) continue;

  // Only populate if the pool is currently empty
  if ((fm.rewritePoolDefIds || []).length > 0) {
    skipped++;
    continue;
  }

  const myType = c.type || 'Utility';
  const myCost = c.costRAM || 0;
  const pool = byType[myType] || [];

  // Tier 1: same type, cost within ±1
  const tier1 = pool.filter(oid => {
    if (oid === id) return false;
    const diff = Math.abs((cards[oid].costRAM || 0) - myCost);
    return diff <= 1;
  });

  // Tier 2: same type, any cost (exclude self)
  const tier2 = pool.filter(oid => oid !== id && !tier1.includes(oid));

  // Combine: prefer tier1, pad with tier2 up to 8 entries
  const combined = [...tier1, ...tier2].slice(0, 8);

  // Fallback: if type has no other cards, use all player cards ≤ 2 cost
  if (combined.length === 0) {
    const allPlayer = Object.entries(cards)
      .filter(([oid, oc]) => {
        if (oid === id) return false;
        if ((oc.tags || []).includes('EnemyCard') || oid.startsWith('EC-')) return false;
        if ((oc.tags || []).includes('Core')) return false;
        return true;
      })
      .map(([oid]) => oid)
      .slice(0, 6);
    fm.rewritePoolDefIds = allPlayer;
  } else {
    fm.rewritePoolDefIds = combined;
  }
  patched++;
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
console.log(`\nPatched ${patched} cards, skipped ${skipped} (already had pools).`);
