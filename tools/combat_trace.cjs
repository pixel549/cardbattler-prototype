// tools/combat_trace.cjs
// Runs one combat and traces HP every turn to find the balance issue.
const { createInitialState } = require('../src/game/game_state.js');

// We need to use vite-node for ES imports — write a wrapper
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Write a temp mjs that does the trace
const script = `
import { createInitialState } from '../src/game/game_state.js';
import { dispatchWithJournal  } from '../src/game/dispatch_with_journal.js';
import { getAIAction          } from '../src/game/aiPlayer.js';
import { readFileSync         } from 'fs';
import { fileURLToPath        } from 'url';
import { dirname, join        } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'src/data/gamedata.json'), 'utf-8'));

const seed = parseInt(process.argv[2]) || 1;
let state = dispatchWithJournal(createInitialState(), data, { type: 'NewRun', seed });
// Move to first combat
for (let i = 0; i < 5; i++) {
  const action = getAIAction(state, data, 'balanced');
  if (!action || state.mode === 'Combat') break;
  state = dispatchWithJournal(state, data, action);
}

if (state.mode !== 'Combat') {
  console.log('Not in combat after 5 moves');
  process.exit(1);
}

console.log('=== COMBAT TRACE (seed ' + seed + ') ===');
console.log('Player HP:', state.combat.player.hp, '/', state.combat.player.maxHP);
console.log('Player RAM:', state.combat.player.ram, '/', state.combat.player.maxRAM);
console.log('Enemies:', state.combat.enemies.map(e => e.enemyDefId + ' HP=' + e.hp + '/' + e.maxHP + ' block=' + (e.block||0)));
console.log('Hand size:', state.combat.player.piles.hand.length);

let step = 0;
while (state.mode === 'Combat' && step < 200) {
  const action = getAIAction(state, data, 'balanced');
  if (!action) break;

  const c = state.combat;
  if (action.type === 'Combat_PlayCard') {
    const ci  = c?.cardInstances?.[action.cardInstanceId];
    const def = ci ? data.cards?.[ci.defId] : null;
    process.stdout.write('  PLAY ' + (def?.name ?? '?') + ' (cost=' + (def?.costRAM??'?') + 'r)');
  }

  state = dispatchWithJournal(state, data, action);

  if (action.type === 'Combat_PlayCard') {
    const nc = state.combat;
    process.stdout.write(' → playerHP=' + nc?.player?.hp + ' block=' + nc?.player?.block + '\\n');
    // Show enemy HP
    nc?.enemies?.forEach(e => process.stdout.write('    enemy ' + e.enemyDefId + ': HP=' + e.hp + '/' + e.maxHP + ' block=' + (e.block||0) + '\\n'));
  }

  if (action.type === 'Combat_EndTurn') {
    const nc = state.combat;
    console.log('--- EndTurn → playerHP=' + nc?.player?.hp + ' block=' + nc?.player?.block);
    nc?.enemies?.forEach(e => console.log('    enemy ' + e.enemyDefId + ': HP=' + e.hp + '/' + e.maxHP));
  }

  step++;
}
console.log('=== FINAL: mode=' + state.mode + ' HP=' + (state.combat?.player?.hp ?? state.run?.hp) + ' ===');
`;
fs.writeFileSync('tools/_combat_trace_tmp.mjs', script);
try {
  const out = execSync('npx vite-node tools/_combat_trace_tmp.mjs ' + (process.argv[2] || '1'), { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.log(e.stdout || e.message);
}
fs.unlinkSync('tools/_combat_trace_tmp.mjs');
