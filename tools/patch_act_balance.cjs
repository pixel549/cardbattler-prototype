// tools/patch_act_balance.cjs
// Rebalances enemy HP and damage multipliers per act so fights are
// challenging but winnable with the starter deck.
//
// Design target:
//   Act 1 normal: player should win ~70% of runs from a fresh start.
//   Act 2 normal: about 50% given a mid-run deck.
//   Act 3 normal: harder, 40%, requires a good deck.
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'src', 'data', 'gamedata.json');
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

d.actBalance = [
  {
    act: 1,
    goldNormal: 25,
    goldElite: 50,
    goldBoss: 99,
    // 0.6× HP makes Act 1 normal enemies manageable with the starter deck.
    // E.g. HOLO_SCOUT_PROXY goes from 76 → ~46 HP.
    enemyHpMult: 0.6,
    enemyDmgMult: 0.9,   // slight damage discount in Act 1 to ease the learning curve
  },
  {
    act: 2,
    goldNormal: 30,
    goldElite: 60,
    goldBoss: 120,
    enemyHpMult: 1.0,    // full HP in Act 2 (was 1.3 — too punishing mid-run)
    enemyDmgMult: 1.1,
  },
  {
    act: 3,
    goldNormal: 35,
    goldElite: 70,
    goldBoss: 150,
    enemyHpMult: 1.35,   // solid Act 3 bump (was 1.6 — too extreme)
    enemyDmgMult: 1.25,
  },
];

fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));
console.log('actBalance patched:');
d.actBalance.forEach(b => console.log(`  Act ${b.act}: HP×${b.enemyHpMult}, DMG×${b.enemyDmgMult}`));
