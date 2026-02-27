#!/usr/bin/env node
/**
 * patch_enemy_rotations.cjs
 *
 * Adds enemy archetype cards (EC-* prefix) to gamedata.json and assigns
 * meaningful rotations to every enemy based on their role + name keywords.
 *
 * Run: node tools/patch_enemy_rotations.cjs
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'gamedata.json');

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// ─────────────────────────────────────────────────────────
// 1.  DEFINE ENEMY ARCHETYPE CARDS
// ─────────────────────────────────────────────────────────
// These use the EC- prefix so they never appear in player shop.
// Enemies source = "Enemy"; Heals / Blocks = "Self".

const ENEMY_CARDS = {
  // ── Attacks ──────────────────────────────────────────────
  'EC-A1': {
    id: 'EC-A1', name: 'Light Strike', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'DealDamage', target: 'Enemy', amount: 8 }],
  },
  'EC-A2': {
    id: 'EC-A2', name: 'Strike', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'DealDamage', target: 'Enemy', amount: 12 }],
  },
  'EC-A3': {
    id: 'EC-A3', name: 'Heavy Strike', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'DealDamage', target: 'Enemy', amount: 16 }],
  },
  'EC-A4': {
    id: 'EC-A4', name: 'Crushing Blow', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'DealDamage', target: 'Enemy', amount: 22 }],
  },
  'EC-A5': {
    id: 'EC-A5', name: 'Devastating Strike', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'DealDamage', target: 'Enemy', amount: 28 }],
  },
  'EC-A6': {
    id: 'EC-A6', name: 'Sniper Shot', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'DealDamage', target: 'Enemy', amount: 18 }],
  },
  'EC-A7': {
    id: 'EC-A7', name: 'Corrosive Bite', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 8 },
      { op: 'ApplyStatus', statusId: 'Corrode', stacks: 3, target: 'Enemy' },
    ],
  },
  'EC-A8': {
    id: 'EC-A8', name: 'Vulnerable Slash', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 10 },
      { op: 'ApplyStatus', statusId: 'Vulnerable', stacks: 1, target: 'Enemy' },
    ],
  },
  'EC-A9': {
    id: 'EC-A9', name: 'Weakening Blow', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 10 },
      { op: 'ApplyStatus', statusId: 'Weak', stacks: 1, target: 'Enemy' },
    ],
  },
  'EC-A10': {
    id: 'EC-A10', name: 'Shield Bash', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 8 },
      { op: 'GainBlock', target: 'Self', amount: 6 },
    ],
  },

  // ── Defense / Healing ─────────────────────────────────────
  'EC-D1': {
    id: 'EC-D1', name: 'Raise Shield', type: 'Defense', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'GainBlock', target: 'Self', amount: 8 }],
  },
  'EC-D2': {
    id: 'EC-D2', name: 'Iron Wall', type: 'Defense', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'GainBlock', target: 'Self', amount: 14 }],
  },
  'EC-D3': {
    id: 'EC-D3', name: 'Fortify', type: 'Defense', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'GainBlock', target: 'Self', amount: 10 }],
  },
  'EC-H1': {
    id: 'EC-H1', name: 'Patch Routine', type: 'Support', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'Heal', target: 'Self', amount: 12 }],
  },
  'EC-H2': {
    id: 'EC-H2', name: 'System Restore', type: 'Support', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'Heal', target: 'Self', amount: 18 }],
  },
  'EC-H3': {
    id: 'EC-H3', name: 'Emergency Patch', type: 'Support', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'Heal', target: 'Self', amount: 10 },
      { op: 'GainBlock', target: 'Self', amount: 6 },
    ],
  },

  // ── Debuffs / Status ──────────────────────────────────────
  'EC-S1': {
    id: 'EC-S1', name: 'Corrode Pulse', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Corrode', stacks: 3, target: 'Enemy' }],
  },
  'EC-S2': {
    id: 'EC-S2', name: 'Corrode Burst', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Corrode', stacks: 5, target: 'Enemy' }],
  },
  'EC-S3': {
    id: 'EC-S3', name: 'Leak Tap', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Leak', stacks: 3, target: 'Enemy' }],
  },
  'EC-S4': {
    id: 'EC-S4', name: 'Leak Flood', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Leak', stacks: 5, target: 'Enemy' }],
  },
  'EC-S5': {
    id: 'EC-S5', name: 'Underclock Pulse', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Underclock', stacks: 2, target: 'Enemy' }],
  },
  'EC-S6': {
    id: 'EC-S6', name: 'Vulnerability Scan', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Vulnerable', stacks: 2, target: 'Enemy' }],
  },
  'EC-S7': {
    id: 'EC-S7', name: 'Weak Signal', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Weak', stacks: 2, target: 'Enemy' }],
  },
  'EC-S8': {
    id: 'EC-S8', name: 'Port Expose', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'ExposedPorts', stacks: 2, target: 'Enemy' }],
  },
  'EC-S9': {
    id: 'EC-S9', name: 'Sensor Glitch', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'SensorGlitch', stacks: 1, target: 'Enemy' }],
  },
  'EC-S10': {
    id: 'EC-S10', name: 'Overheat Charge', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [{ op: 'ApplyStatus', statusId: 'Overheat', stacks: 3, target: 'Enemy' }],
  },

  // ── Boss patterns ─────────────────────────────────────────
  'EC-B1': {
    id: 'EC-B1', name: 'Acid Assault', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 16 },
      { op: 'ApplyStatus', statusId: 'Corrode', stacks: 3, target: 'Enemy' },
    ],
  },
  'EC-B2': {
    id: 'EC-B2', name: 'Expose Strike', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 14 },
      { op: 'ApplyStatus', statusId: 'Vulnerable', stacks: 2, target: 'Enemy' },
    ],
  },
  'EC-B3': {
    id: 'EC-B3', name: 'Fortified Recovery', type: 'Defense', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'GainBlock', target: 'Self', amount: 12 },
      { op: 'Heal', target: 'Self', amount: 10 },
    ],
  },
  'EC-B4': {
    id: 'EC-B4', name: 'System Overload', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'ApplyStatus', statusId: 'Corrode', stacks: 4, target: 'Enemy' },
      { op: 'ApplyStatus', statusId: 'Underclock', stacks: 2, target: 'Enemy' },
    ],
  },
  'EC-B5': {
    id: 'EC-B5', name: 'Annihilate', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 20 },
      { op: 'ApplyStatus', statusId: 'Weak', stacks: 2, target: 'Enemy' },
    ],
  },
  'EC-B6': {
    id: 'EC-B6', name: 'Cascade Leak', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'ApplyStatus', statusId: 'Leak', stacks: 4, target: 'Enemy' },
      { op: 'ApplyStatus', statusId: 'ExposedPorts', stacks: 2, target: 'Enemy' },
    ],
  },
  'EC-B7': {
    id: 'EC-B7', name: 'Null Strike', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 18 },
      { op: 'ApplyStatus', statusId: 'SensorGlitch', stacks: 1, target: 'Enemy' },
    ],
  },
  'EC-B8': {
    id: 'EC-B8', name: 'Power Surge', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 24 },
    ],
  },
  'EC-B9': {
    id: 'EC-B9', name: 'Total Lockdown', type: 'Utility', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'ApplyStatus', statusId: 'Underclock', stacks: 3, target: 'Enemy' },
      { op: 'ApplyStatus', statusId: 'Weak', stacks: 2, target: 'Enemy' },
    ],
  },
  'EC-B10': {
    id: 'EC-B10', name: 'Final Reckoning', type: 'Attack', costRAM: 0, tags: ['EnemyCard'],
    effects: [
      { op: 'DealDamage', target: 'Enemy', amount: 26 },
      { op: 'ApplyStatus', statusId: 'Corrode', stacks: 4, target: 'Enemy' },
    ],
  },
};

// ─────────────────────────────────────────────────────────
// 2.  ROTATION POOLS BY ROLE
// ─────────────────────────────────────────────────────────
// Each pool is an infinite cycle; we slice rotLen items from it.

const POOLS = {
  minion:    ['EC-A1', 'EC-A1', 'EC-A2', 'EC-A1'],
  attack:    ['EC-A2', 'EC-A3', 'EC-A2', 'EC-A2', 'EC-A3'],
  defense:   ['EC-D1', 'EC-A2', 'EC-D2', 'EC-A1', 'EC-D3', 'EC-A2'],
  support:   ['EC-H1', 'EC-A1', 'EC-H1', 'EC-A2', 'EC-H2', 'EC-A1'],
  corrode:   ['EC-S1', 'EC-A1', 'EC-S2', 'EC-A2', 'EC-S1', 'EC-A1'],
  leak:      ['EC-S3', 'EC-A1', 'EC-S4', 'EC-A2', 'EC-S3', 'EC-A1'],
  underclock:['EC-S5', 'EC-A2', 'EC-S5', 'EC-A1', 'EC-S5', 'EC-A2'],
  control:   ['EC-S5', 'EC-A2', 'EC-S8', 'EC-A2', 'EC-S9', 'EC-A1'],
  debuff:    ['EC-S6', 'EC-A2', 'EC-S7', 'EC-A2', 'EC-S8', 'EC-A1'],
  economy:   ['EC-A2', 'EC-S6', 'EC-A3', 'EC-S7', 'EC-A2', 'EC-S8'],
  mixed:     ['EC-A2', 'EC-S1', 'EC-D1', 'EC-A3', 'EC-S6', 'EC-A2'],
  sniper:    ['EC-A6', 'EC-A2', 'EC-A6', 'EC-A3', 'EC-A6', 'EC-A2'],
  corrosive_strike: ['EC-A7', 'EC-A2', 'EC-A7', 'EC-S1', 'EC-A7', 'EC-A1'],
  ghost:     ['EC-S9', 'EC-A2', 'EC-S8', 'EC-A1', 'EC-S6', 'EC-A2'],
  daemon:    ['EC-S1', 'EC-A2', 'EC-S6', 'EC-A1', 'EC-S10', 'EC-A2'],
  shaman:    ['EC-S5', 'EC-S6', 'EC-A2', 'EC-S1', 'EC-S5', 'EC-A3'],
  enforcer:  ['EC-A3', 'EC-D1', 'EC-A2', 'EC-A3', 'EC-D3', 'EC-A2'],
  // Boss pool: varied, escalating
  boss:      [
    'EC-A4', 'EC-B1', 'EC-D3', 'EC-B2', 'EC-A4', 'EC-B4',
    'EC-D2', 'EC-B3', 'EC-A4', 'EC-B5', 'EC-B7', 'EC-B6',
    'EC-B8', 'EC-B9', 'EC-A5', 'EC-B10', 'EC-B3', 'EC-B1',
  ],
};

// ─────────────────────────────────────────────────────────
// 3.  NAME KEYWORD → POOL MAPPING
// ─────────────────────────────────────────────────────────
// Checked in order; first match wins. Lower-case name checked.

const KEYWORD_POOLS = [
  // Specific enemy keywords first (most specific → least specific)
  { kw: 'corrode',     pool: 'corrode' },
  { kw: 'leak wraith', pool: 'leak' },
  { kw: 'leak',        pool: 'leak' },
  { kw: 'patch',       pool: 'support' },
  { kw: 'cleric',      pool: 'support' },
  { kw: 'medic',       pool: 'support' },
  { kw: 'firewall',    pool: 'defense' },
  { kw: 'sentinel',    pool: 'defense' },
  { kw: 'warden',      pool: 'defense' },
  { kw: 'shield',      pool: 'defense' },
  { kw: 'pod',         pool: 'defense' },
  { kw: 'sniper',      pool: 'sniper' },
  { kw: 'sapper',      pool: 'underclock' },
  { kw: 'signal',      pool: 'underclock' },
  { kw: 'hacker',      pool: 'control' },
  { kw: 'shaman',      pool: 'shaman' },
  { kw: 'oracle',      pool: 'shaman' },
  { kw: 'ghost',       pool: 'ghost' },
  { kw: 'daemon',      pool: 'daemon' },
  { kw: 'bruiser',     pool: 'enforcer' },
  { kw: 'goon',        pool: 'enforcer' },
  { kw: 'enforcer',    pool: 'enforcer' },
  { kw: 'marauder',    pool: 'enforcer' },
  { kw: 'scout',       pool: 'economy' },
  { kw: 'runner',      pool: 'economy' },
  { kw: 'courier',     pool: 'economy' },
  { kw: 'rat',         pool: 'corrode' },     // rats typically corrode
  { kw: 'imp',         pool: 'support' },     // imps support allies
  { kw: 'drone',       pool: 'attack' },
  { kw: 'tech',        pool: 'control' },
  { kw: 'wraith',      pool: 'ghost' },
  { kw: 'minion',      pool: 'minion' },
  { kw: 'scrap',       pool: 'minion' },
];

// ─────────────────────────────────────────────────────────
// 4.  ROLE → FALLBACK POOL MAPPING
// ─────────────────────────────────────────────────────────

const ROLE_POOL_MAP = {
  'Attack':          'attack',
  'Defense/Tank':    'defense',
  'Support/Heal':    'support',
  'Debuff/DoT':      'corrode',
  'Control':         'control',
  'Economy pressure':'economy',
  'Minion':          'minion',
  'Mixed threat':    'mixed',
  'Boss':            'boss',
};

// ─────────────────────────────────────────────────────────
// 5.  BOSS-SPECIFIC ROTATIONS
// ─────────────────────────────────────────────────────────
// Hand-crafted for key boss archetypes to give each boss personality.
// Key = enemy id; value = card id array (exactly rotLen long or we trim/extend).

const BOSS_ROTATIONS = {
  // Kilo Core — Aggressive + DoT
  'E_ADMINISTRATOR_KILO_CORE': [
    'EC-A4','EC-S1','EC-B1','EC-A4','EC-S2','EC-D3',
    'EC-B4','EC-A4','EC-B5','EC-A5',
  ],
  // Null Goliath — Heavy tank
  'E_ADMINISTRATOR_NULL_GOLIATH': [
    'EC-A4','EC-D2','EC-B1','EC-A4','EC-D2','EC-B3',
  ],
  // Pulse Citadel — Status overload
  'E_ADMINISTRATOR_PULSE_CITADEL': [
    'EC-B6','EC-A4','EC-B9','EC-A4','EC-B4','EC-B6',
    'EC-A5','EC-B2','EC-B9','EC-A4',
  ],
  // Cipher Mainframe — Corrode + Vulnerable
  'E_ADMINISTRATOR_CIPHER_MAINFRAME': [
    'EC-B2','EC-A4','EC-B1','EC-S2','EC-B4','EC-A4',
    'EC-B2','EC-B3','EC-A5',
  ],
  // Ghost Hydra — status effects + heavy damage
  'E_LEVIATHAN_GHOST_HYDRA': [
    'EC-B7','EC-S8','EC-A4','EC-B6','EC-S9','EC-A4',
    'EC-B7','EC-B4','EC-A5',
  ],
  // Vanta Goliath — pure brutality
  'E_OVERSEER_VANTA_GOLIATH': [
    'EC-A4','EC-B5','EC-D2','EC-A4','EC-B8','EC-D2',
    'EC-A5','EC-B5','EC-B3',
  ],
  // Rogue Oracle — control focus
  'E_NEXUS_ROGUE_ORACLE': [
    'EC-B9','EC-A4','EC-B4','EC-A4','EC-B6','EC-S5','EC-A4',
  ],
  // Ion Goliath — heavy physical
  'E_NEXUS_ION_GOLIATH': [
    'EC-A4','EC-A4','EC-B5','EC-A5','EC-B8','EC-D2','EC-A4','EC-B2',
  ],
  // Holo Apex — heal + tank + retaliate
  'E_TITAN_HOLO_APEX': [
    'EC-B3','EC-A4','EC-D2','EC-B2','EC-H2','EC-A4','EC-B5',
  ],
  // Static Core — debuff storm
  'E_OVERSEER_STATIC_CORE': [
    'EC-B4','EC-A4','EC-B9','EC-B6','EC-A4','EC-B4',
    'EC-S1','EC-B2','EC-A5',
  ],
  // Archon Null Goliath — final boss tier
  'E_ARCHON_NULL_GOLIATH': [
    'EC-B8','EC-B4','EC-D2','EC-B1','EC-A5','EC-B5',
    'EC-B3','EC-B9','EC-A5',
  ],
  // Neon Mainframe — data stream attacks
  'E_BOSS_NEON_MAINFRAME': [
    'EC-B6','EC-A4','EC-B2','EC-A4','EC-B4','EC-S2',
    'EC-B7','EC-A4','EC-B10',
  ],
  // Vector Mainframe
  'E_BOSS_VECTOR_MAINFRAME': [
    'EC-A4','EC-B1','EC-D3','EC-A4','EC-B2','EC-B3','EC-A5',
  ],
  // Chrome Warden — defensive boss
  'E_NEXUS_CHROME_WARDEN': [
    'EC-D2','EC-A4','EC-D2','EC-B3','EC-A10','EC-D2','EC-B5','EC-A4',
  ],
  // Chrome Oracle — control
  'E_OVERSEER_CHROME_ORACLE': [
    'EC-B9','EC-A4','EC-B6','EC-A4','EC-B4','EC-A4',
  ],
  // Circuit Hydra
  'E_DIRECTOR_CIRCUIT_HYDRA': [
    'EC-A4','EC-B7','EC-B4','EC-B1','EC-A4','EC-D2','EC-B5',
  ],
  // Pulse Mainframe
  'E_DIRECTOR_PULSE_MAINFRAME': [
    'EC-B2','EC-A4','EC-B4','EC-A4','EC-B5','EC-S2','EC-B10',
  ],
  // Ghost Oracle
  'E_DIRECTOR_GHOST_ORACLE': [
    'EC-B9','EC-B7','EC-A4','EC-B6','EC-S9','EC-A4','EC-B4','EC-A5',
  ],
  // Rogue Apex
  'E_OVERSEER_ROGUE_APEX': [
    'EC-A4','EC-B5','EC-B1','EC-A5','EC-B9','EC-A4','EC-B10',
    'EC-B3','EC-A5','EC-B5',
  ],
  // Pulse Core
  'E_LEVIATHAN_PULSE_CORE': [
    'EC-B2','EC-A4','EC-B1','EC-B4','EC-A4','EC-D3','EC-B5','EC-A5',
  ],
  // Neon Apex
  'E_LEVIATHAN_NEON_APEX': [
    'EC-B6','EC-A4','EC-B2','EC-B4','EC-A4','EC-B7','EC-D2','EC-B5','EC-A5',
  ],
  // Chrome Oracle (leviathan)
  'E_LEVIATHAN_CHROME_ORACLE': [
    'EC-B4','EC-A4','EC-B9','EC-A4','EC-B6','EC-B3','EC-A5','EC-B2',
  ],
  // Pulse Hydra
  'E_ARCHON_PULSE_HYDRA': [
    'EC-B1','EC-A4','EC-B4','EC-B2','EC-A4','EC-B5','EC-B3','EC-A5',
  ],
  // Ghost Goliath
  'E_LEVIATHAN_GHOST_GOLIATH': [
    'EC-B7','EC-A4','EC-B9','EC-B5','EC-A5','EC-D2','EC-B4','EC-A4',
  ],
  // Static Warden
  'E_OVERSEER_STATIC_WARDEN': [
    'EC-D2','EC-B4','EC-A4','EC-D2','EC-B3','EC-A4',
  ],
  // Holo Oracle
  'E_ARCHON_HOLO_ORACLE': [
    'EC-B9','EC-A4','EC-D2','EC-B2','EC-B6','EC-A4','EC-B5','EC-B3',
  ],
  // Vanta Core
  'E_LEVIATHAN_VANTA_CORE': [
    'EC-A4','EC-B5','EC-B4','EC-D2','EC-B1','EC-A5','EC-B9','EC-D2','EC-B10',
  ],
  // Kilo Mainframe
  'E_ARCHON_KILO_MAINFRAME': [
    'EC-B1','EC-A4','EC-B2','EC-A4','EC-B4','EC-A4',
  ],
  // Vanta Scout Node (elite, hp=145)
  'E_VANTA_SCOUT_NODE': ['EC-A2', 'EC-S6', 'EC-A3', 'EC-S1', 'EC-A3', ...Array(0)].slice(0, 3),
  // Obsidian Hacker Swarm (elite, hp=145)
  'E_OBSIDIAN_HACKER_SWARM': ['EC-S5', 'EC-A2', 'EC-S9'],
};

// ─────────────────────────────────────────────────────────
// 6.  ROTATION ASSIGNMENT LOGIC
// ─────────────────────────────────────────────────────────
// Strategy:
//  - Use ROLE as the primary signal (Attack → attack pool, etc.)
//  - Use name keywords only to disambiguate WITHIN ambiguous roles
//    (Debuff/DoT: corrode vs leak; Control: underclock vs sensor; etc.)
//  - For pure Attack / Defense/Tank / Support/Heal roles the role wins.

// Keywords that override role, but ONLY for ambiguous roles
const DEBUFF_KEYWORDS = [
  { kw: 'corrode', pool: 'corrode' },
  { kw: 'leak',    pool: 'leak'    },
  { kw: 'wraith',  pool: 'leak'    },
  { kw: 'ghost',   pool: 'ghost'   },
  { kw: 'daemon',  pool: 'daemon'  },
  { kw: 'shaman',  pool: 'shaman'  },
  { kw: 'sapper',  pool: 'underclock' },
  { kw: 'signal',  pool: 'underclock' },
  { kw: 'tech',    pool: 'control' },
];

const CONTROL_KEYWORDS = [
  { kw: 'hacker',  pool: 'control'    },
  { kw: 'sapper',  pool: 'underclock' },
  { kw: 'signal',  pool: 'underclock' },
  { kw: 'shaman',  pool: 'shaman'     },
  { kw: 'ghost',   pool: 'ghost'      },
  { kw: 'runner',  pool: 'ghost'      },
  { kw: 'oracle',  pool: 'shaman'     },
  { kw: 'tech',    pool: 'control'    },
];

const ECONOMY_KEYWORDS = [
  { kw: 'scout',   pool: 'economy'  },
  { kw: 'runner',  pool: 'economy'  },
  { kw: 'courier', pool: 'economy'  },
  { kw: 'sapper',  pool: 'underclock' },
  { kw: 'daemon',  pool: 'daemon'   },
  { kw: 'drone',   pool: 'attack'   },
];

// High-priority full overrides (only a handful of specific enemies)
const FULL_OVERRIDES = {
  'E_CORRODE_RAT':    'corrode',
  'E_LEAK_WRAITH':    'leak',
  'E_SIGNAL_IMP':     'underclock',
  'E_PATCH_SPRITE':   'support',
  'E_FIREWALL_POD':   'defense',
  'E_HACKER_DRONE':   'attack',
  'E_SCRAP_MINION':   'minion',
  'E_VANTA_SCOUT_NODE': 'mixed',
};

function getPool(enemy) {
  if (BOSS_ROTATIONS[enemy.id]) return null; // hand-crafted

  const id   = enemy.id;
  const name = (enemy.name || id).toLowerCase();
  const role = enemy.role || '';

  // Hard override for specific named enemies
  if (FULL_OVERRIDES[id]) return POOLS[FULL_OVERRIDES[id]];

  // Boss role → use boss pool
  if (role === 'Boss') return POOLS.boss;

  // Role-first for clear roles; keywords only used to sub-specialize
  switch (role) {
    case 'Attack':
      // Snipers get high-damage pool
      if (name.includes('sniper')) return POOLS.sniper;
      if (name.includes('bruiser') || name.includes('goon') || name.includes('marauder'))
        return POOLS.enforcer;
      return POOLS.attack;

    case 'Defense/Tank':
      // Sentinel / Warden stay in defense; cleric-tanks go support
      if (name.includes('cleric')) return POOLS.support;
      return POOLS.defense;

    case 'Support/Heal':
      // All healer/support types use support pool regardless of name
      return POOLS.support;

    case 'Debuff/DoT':
      for (const { kw, pool } of DEBUFF_KEYWORDS) {
        if (name.includes(kw)) return POOLS[pool];
      }
      return POOLS.corrode; // default DoT

    case 'Control':
      for (const { kw, pool } of CONTROL_KEYWORDS) {
        if (name.includes(kw)) return POOLS[pool];
      }
      return POOLS.control;

    case 'Economy pressure':
      for (const { kw, pool } of ECONOMY_KEYWORDS) {
        if (name.includes(kw)) return POOLS[pool];
      }
      return POOLS.economy;

    case 'Minion':
      return POOLS.minion;

    case 'Mixed threat':
      return POOLS.mixed;

    default:
      return POOLS.attack;
  }
}

function makeRotation(enemy) {
  // Hand-crafted boss?
  if (BOSS_ROTATIONS[enemy.id]) {
    const rot = BOSS_ROTATIONS[enemy.id];
    const n   = enemy.rotation.length;
    // Extend or trim to match original rotation length
    if (rot.length >= n) return rot.slice(0, n);
    // If hand-crafted is shorter than expected, cycle
    const out = [];
    for (let i = 0; i < n; i++) out.push(rot[i % rot.length]);
    return out;
  }

  const pool = getPool(enemy);
  const n    = Math.max(1, enemy.rotation.length);
  const out  = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

// ─────────────────────────────────────────────────────────
// 7.  APPLY PATCH
// ─────────────────────────────────────────────────────────

// Add enemy cards to the cards dictionary
let added = 0;
for (const [id, card] of Object.entries(ENEMY_CARDS)) {
  if (!data.cards[id]) {
    data.cards[id] = card;
    added++;
  }
}
console.log(`Added ${added} enemy archetype cards.`);

// Update enemy rotations
let updated = 0;
for (const enemy of Object.values(data.enemies)) {
  const oldRot = enemy.rotation;
  const newRot = makeRotation(enemy);

  // Check if all cards in the new rotation exist
  for (const cid of newRot) {
    if (!data.cards[cid]) {
      console.warn(`WARN: Card ${cid} not found for enemy ${enemy.id}`);
    }
  }

  enemy.rotation = newRot;
  updated++;
}
console.log(`Updated rotations for ${updated} enemies.`);

// ─────────────────────────────────────────────────────────
// 8.  WRITE OUTPUT
// ─────────────────────────────────────────────────────────

data.version = (data.version || 1) + 1;
data.builtAt = new Date().toISOString();

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
console.log(`\nWrote updated gamedata.json (v${data.version})`);
console.log(`Total cards: ${Object.keys(data.cards).length}`);
console.log(`Total enemies: ${Object.keys(data.enemies).length}`);

// Quick sanity check
const allCards = new Set(Object.keys(data.cards));
let bad = 0;
for (const enemy of Object.values(data.enemies)) {
  for (const cid of enemy.rotation) {
    if (!allCards.has(cid)) { console.error(`  MISSING: ${cid} in ${enemy.id}`); bad++; }
  }
}
if (bad === 0) console.log('Sanity check: all rotation cards exist. ✓');
else console.error(`Sanity check FAILED: ${bad} missing cards!`);
