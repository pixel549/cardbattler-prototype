/**
 * fix_enemy_rotations.cjs
 * Assigns role-appropriate card rotations to all enemies in gamedata.json.
 * Run: node tools/fix_enemy_rotations.cjs
 */

const fs   = require('fs');
const path = require('path');

const dataPath = path.resolve(__dirname, '../src/data/gamedata.json');
const data     = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// ---------------------------------------------------------------------------
// Rotation templates per role
// Each template is an array of card IDs.
// Multiple templates per role → assigned round-robin so enemies vary slightly.
// ---------------------------------------------------------------------------

const ROTATIONS = {
  'Attack': [
    ['C-001', 'C-001', 'NC-005'],            // strike, strike, corrode
    ['C-001', 'NC-018', 'C-001'],            // strike, leak tap, strike
    ['C-001', 'C-001', 'NC-018', 'C-001'],  // strike x2, leak, strike
  ],
  'Defense/Tank': [
    ['C-001', 'C-002', 'C-002'],             // strike, guard, guard
    ['C-001', 'C-002', 'C-001', 'C-002'],   // alternates attack/guard
    ['C-002', 'C-002', 'C-001', 'C-002'],   // guard-heavy
  ],
  'Support/Heal': [
    ['C-001', 'C-003', 'C-001'],             // strike, self-heal, strike
    ['C-001', 'NC-017', 'C-001'],            // strike, nanoflow, strike
    ['C-003', 'C-001', 'C-001', 'C-003'],   // heal-first, then two attacks
  ],
  'Control': [
    ['NC-006', 'C-001', 'NC-008', 'C-001'], // underclock, strike, sensor scramble, strike
    ['NC-008', 'C-001', 'NC-006', 'C-001'], // sensor glitch, strike, underclock, strike
    ['NC-007', 'C-001', 'NC-006', 'C-001'], // exposed ports, strike, underclock, strike
  ],
  'Debuff/DoT': [
    ['NC-005', 'NC-018', 'C-001'],           // corrode, leak, strike
    ['NC-005', 'C-001', 'NC-018', 'C-001'], // corrode, strike, leak, strike
    ['NC-018', 'NC-005', 'C-001', 'C-001'], // leak, corrode, strike, strike
  ],
  'Economy pressure': [
    ['NC-006', 'C-001', 'C-001'],            // underclock, strike, strike
    ['NC-006', 'C-001', 'NC-007', 'C-001'], // underclock, strike, exposed ports, strike
    ['C-001', 'NC-006', 'C-001', 'NC-008'], // strike, underclock, strike, sensor glitch
  ],
  'Minion': [
    ['C-001', 'C-001'],                      // simple double strike
  ],
  'Mixed threat': [
    ['NC-005', 'C-001', 'C-002', 'C-001'],  // corrode, strike, guard, strike
    ['C-001', 'NC-018', 'C-002', 'C-001'],  // strike, leak, guard, strike
  ],
  // Bosses get longer, more complex rotations
  'Boss': [
    ['C-001', 'NC-005', 'C-001', 'C-002', 'NC-018', 'C-001'],
    ['C-001', 'C-001', 'NC-006', 'C-001', 'C-002', 'NC-005'],
    ['NC-005', 'C-001', 'C-001', 'C-002', 'NC-018', 'C-001', 'C-001'],
    ['C-001', 'NC-018', 'C-001', 'C-002', 'C-001', 'NC-006', 'C-001'],
    ['C-002', 'C-001', 'NC-005', 'C-001', 'NC-018', 'C-001', 'C-002'],
  ],
};

// Fallback for unknown roles
const FALLBACK_ROTATION = ['C-001', 'C-001', 'C-001'];

const enemies = data.enemies;
const roleCounters = {};  // track rotation index per role for round-robin assignment

let changed = 0;
for (const [id, enemy] of Object.entries(enemies)) {
  const role = enemy.role || 'Attack';
  const templates = ROTATIONS[role];

  if (!templates) {
    // Unknown role, keep original or use fallback
    continue;
  }

  if (!roleCounters[role]) roleCounters[role] = 0;
  const rotation = templates[roleCounters[role] % templates.length];
  roleCounters[role]++;

  // Only change if it was the old all-C-001 placeholder
  const isPlaceholder = enemy.rotation.every(r => r === 'C-001');
  if (isPlaceholder && JSON.stringify(enemy.rotation) !== JSON.stringify(rotation)) {
    enemy.rotation = rotation;
    changed++;
  }
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Updated ${changed} enemy rotations.`);
console.log('Role counters:', JSON.stringify(roleCounters, null, 2));
