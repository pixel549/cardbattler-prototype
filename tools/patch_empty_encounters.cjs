// tools/patch_empty_encounters.cjs
// Populates the 24 broken encounters that have empty enemyIds arrays.
// Enemy assignments are matched by act, kind, and encounter name/theme.
// Run: node tools/patch_empty_encounters.cjs

const fs   = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'src', 'data', 'gamedata.json');
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// ── Act 1 normal (ENC-001 … ENC-012, ENC_GEN_A1_MIX_1_3) ─────────────────
// Light HOLO/ION enemies — the tutorial tier of Act 1.
const ACT1_NORMAL = {
  'ENC-001': ['E_HOLO_SHAMAN_CREW'],                                        // 1 enemy — gentle intro
  'ENC-002': ['E_HOLO_RAT_MK_II', 'E_HOLO_SCOUT_PROXY'],                   // 2 enemies
  'ENC-003': ['E_HACKER_DRONE', 'E_HOLO_RAT_MK_II', 'E_HOLO_SCOUT_PROXY'], // 3 enemies
  'ENC-005': ['E_PULSE_BRUISER_FRAME', 'E_ION_SNIPER_RIG'],                 // damage-heavy
  'ENC-006': ['E_GLITCH_WARDEN_SUITE', 'E_HOLO_POD_NODE'],                  // defensive pair
  'ENC-007': ['E_HOLO_ENFORCER_MK_I', 'E_ION_RAT_SUITE', 'E_HOLO_SAPPER_CELL'], // mixed
  'ENC-008': ['E_HOLO_SHAMAN_MK_I', 'E_ION_CLERIC_PROXY'],                 // healing support
  // These three are mis-labelled "Boss N" but have kind=normal — treat as
  // late-act-1 encounters that ramp up the pressure a little.
  'ENC-009': ['E_ECHO_SHAMAN_SWARM', 'E_KILO_SNIPER_ARRAY'],
  'ENC-010': ['E_FLUX_SHAMAN_CREW',  'E_CIPHER_POD_SHARD'],
  'ENC-011': ['E_VECTOR_GOON_PROXY', 'E_ECHO_SENTINEL_SHARD'],
  'ENC-012': ['E_HOLO_RUNNER_NODE',  'E_HOLO_SCOUT_PROXY'],                 // "Runner"
  'ENC_GEN_A1_MIX_1_3': ['E_HOLO_SAPPER_CELL', 'E_ION_RAT_SUITE', 'E_HOLO_SHAMAN_CREW'],
};

// ── Act 1 elite / hard ─────────────────────────────────────────────────────
const ACT1_OTHER = {
  'ENC-004':                   ['E_ECHO_SHAMAN_SWARM', 'E_CIPHER_HACKER_MK_II'],   // elite challenge
  'ENC_GEN_A1_CONTROL_FOCUS': ['E_ECHO_SENTINEL_SHARD', 'E_NEON_SAPPER_MK_II'],   // control theme
  'ENC_GEN_A1_DAMAGE_FOCUS':  ['E_GLITCH_WARDEN_SUITE', 'E_PULSE_BRUISER_FRAME'],  // damage theme
  'ENC_GEN_A1_LEAK_THEME':    ['E_LEAK_WRAITH', 'E_CORRODE_RAT'],                  // leak/corrode theme
};

// ── Act 2 ──────────────────────────────────────────────────────────────────
const ACT2 = {
  'ENC_GEN_A2_MIX_1_3':        ['E_VANTA_DRONE_FRAME', 'E_VECTOR_COURIER_ARRAY', 'E_CHROME_SAPPER_CREW'],
  'ENC_GEN_A2_CONTROL_FOCUS':  ['E_STATIC_SAPPER_CELL', 'E_CIRCUIT_BRUISER_MK_III'],
  'ENC_GEN_A2_DAMAGE_FOCUS':   ['E_VANTA_BRUISER_PROXY', 'E_VECTOR_MARAUDER_PROXY'],
  'ENC_GEN_A2_LEAK_THEME':     ['E_CORRODE_RAT', 'E_GLITCH_RUNNER_NODE', 'E_STATIC_IMP_RIG'],
};

// ── Act 3 ──────────────────────────────────────────────────────────────────
const ACT3 = {
  'ENC_GEN_A3_MIX_1_3':        ['E_NEON_WARDEN_SUITE', 'E_STATIC_WARDEN_ARRAY', 'E_CHROME_SAPPER_CREW'],
  'ENC_GEN_A3_CONTROL_FOCUS':  ['E_OBSIDIAN_TECH_RIG', 'E_RAZOR_CLERIC_MK_II'],
  'ENC_GEN_A3_DAMAGE_FOCUS':   ['E_OBSIDIAN_BRUISER_PACK', 'E_RAZOR_ENFORCER_FRAME'],
  'ENC_GEN_A3_LEAK_THEME':     ['E_OBSIDIAN_SNIPER_MK_III', 'E_ROGUE_SCOUT_SWARM'],
};

const ALL_PATCHES = { ...ACT1_NORMAL, ...ACT1_OTHER, ...ACT2, ...ACT3 };

// Validate that every enemy ID exists in the pool
const enemyPool = new Set(Object.keys(d.enemies));
let validationOk = true;
for (const [encId, ids] of Object.entries(ALL_PATCHES)) {
  for (const eid of ids) {
    if (!enemyPool.has(eid)) {
      console.error(`ERROR: encounter ${encId} references unknown enemy "${eid}"`);
      validationOk = false;
    }
  }
}
if (!validationOk) {
  process.exit(1);
}

// Apply patches
let patched = 0;
let skipped = 0;
for (const [encId, ids] of Object.entries(ALL_PATCHES)) {
  if (!d.encounters[encId]) {
    console.warn(`WARN: encounter "${encId}" not found in gamedata — skipping`);
    skipped++;
    continue;
  }
  const enc = d.encounters[encId];
  if (enc.enemyIds && enc.enemyIds.length > 0) {
    console.log(`SKIP: ${encId} already has enemyIds: [${enc.enemyIds.join(', ')}]`);
    skipped++;
    continue;
  }
  enc.enemyIds = ids;
  console.log(`OK:   ${encId} → [${ids.join(', ')}]`);
  patched++;
}

fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));
console.log(`\nDone. Patched ${patched} encounters, skipped ${skipped}.`);
