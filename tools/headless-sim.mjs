/**
 * headless-sim.mjs
 * Run a full cardbattler game with the AI player, no browser required.
 *
 * Usage (from project root):
 *   npx vite-node tools/headless-sim.mjs [seed] [playstyle] [maxActions]
 *
 * Playstyles: balanced, aggressive, defensive, greedy
 *
 * Writes:
 *   sim-output.txt  — human-readable run log
 *   sim-result.json — machine-readable summary (deck, encounters, events, errors)
 */

import { createInitialState } from '../src/game/game_state.js';
import { dispatchWithJournal  } from '../src/game/dispatch_with_journal.js';
import { getAIAction          } from '../src/game/aiPlayer.js';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join  } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const data   = JSON.parse(readFileSync(join(ROOT, 'src/data/gamedata.json'), 'utf-8'));

// ── Args ──────────────────────────────────────────────────────────────────────
const seed       = parseInt(process.argv[2]) || Date.now();
const playstyle  = process.argv[3] || 'balanced';
const MAX_ACTS   = parseInt(process.argv[4]) || 3000;

// ── Output buffers ────────────────────────────────────────────────────────────
const lines      = [];
const encounters = [];
const events_log = [];
const errors_log = [];
let   prevMode   = null;
let   combatStart= null;

function line(s) { lines.push(s); process.stdout.write(s + '\n'); }
function sep(ch = '─') { line(ch.repeat(52)); }

// ── Boot ─────────────────────────────────────────────────────────────────────
sep('═');
line(`  CARDBATTLER HEADLESS SIMULATION`);
sep('═');
line(`  Seed      : ${seed}`);
line(`  Playstyle : ${playstyle}`);
line(`  Max steps : ${MAX_ACTS}`);
sep('═');

let state = dispatchWithJournal(createInitialState(), data, {
  type: 'NewRun', seed,
});

// ── Main loop ─────────────────────────────────────────────────────────────────
let step = 0;
while (state.mode !== 'GameOver' && step < MAX_ACTS) {
  const mode = state.mode;
  const run  = state.run;

  // ── Mode transition banner ─────────────────────────────────────────────────
  if (mode !== prevMode) {
    sep();
    line(`  [${String(step).padStart(4)}] ${mode.toUpperCase()} — Act ${run?.act ?? '?'}, Floor ${run?.floor ?? '?'}, HP ${run?.hp ?? '?'}/${run?.maxHP ?? '?'}, Gold ${run?.gold ?? '?'}g`);
    prevMode = mode;

    // Track combat start
    if (mode === 'Combat' && state.combat) {
      const enemyDebug = (state.combat.enemies || []).map(e =>
        `${e.enemyDefId ?? e.id}(hp=${e.hp},maxHp=${e.maxHP})`);
      line(`    [DBG] enemies at start: ${enemyDebug.join(', ')}`);
      line(`    [DBG] player ram=${state.combat.player?.ram}/${state.combat.player?.maxRAM} hand=${state.combat.player?.piles?.hand?.length ?? 0} cards`);
      combatStart = {
        act:    run?.act,
        floor:  run?.floor,
        hpBefore: run?.hp,
        enemies: (state.combat.enemies || []).map(e => e.enemyDefId ?? e.id),
      };
    }
  }

  // ── Get AI action ──────────────────────────────────────────────────────────
  let action;
  try {
    action = getAIAction(state, data, playstyle);
  } catch (e) {
    const msg = `[ERROR] getAIAction threw in mode ${mode}: ${e.message}`;
    line(msg); errors_log.push(msg); break;
  }

  if (!action) {
    const msg = `[STUCK] No AI action for mode: ${mode}`;
    line(msg); errors_log.push(msg); break;
  }

  // ── Log interesting actions ────────────────────────────────────────────────
  switch (action.type) {
    case 'Combat_PlayCard': {
      const c   = state.combat;
      const ci  = c?.cardInstances?.[action.cardInstanceId];
      const def = ci ? data.cards?.[ci.defId] : null;
      line(`    ▶  Play: ${def?.name ?? action.cardInstanceId} (${def?.costRAM ?? '?'}r) RAM=${c?.player?.ram ?? '?'}/${c?.player?.maxRAM ?? '?'}`);
      break;
    }
    case 'Combat_EndTurn': {
      const c = state.combat;
      const handIds  = c?.player?.piles?.hand ?? [];
      const ram      = c?.player?.ram ?? '?';
      const maxRam   = c?.player?.maxRAM ?? '?';
      const handNames = handIds.map(id => {
        const ci  = c?.cardInstances?.[id];
        const def = ci ? data.cards?.[ci.defId] : null;
        return def ? `${def.name}(${def.costRAM ?? 0}r)` : `??(${id.slice(-4)})`;
      });
      line(`    ↩  End Turn  (turn ${c?.turn ?? '?'}) RAM=${ram}/${maxRam} hand=[${handNames.join(', ') || 'EMPTY'}]`);
      break;
    }
    case 'Reward_PickCard':
      line(`    ★  Picked card: ${data.cards?.[action.defId]?.name ?? action.defId}`);
      break;
    case 'Reward_Skip':
      line(`    ✗  Skipped reward`);
      break;
    case 'Shop_BuyOffer': {
      const offer = state.shop?.offers?.[action.index];
      const name  = offer?.kind === 'Card'
        ? (data.cards?.[offer.defId]?.name ?? offer.defId)
        : offer?.serviceId;
      line(`    🛒  Bought: ${name} (${offer?.price ?? '?'}g)`);
      break;
    }
    case 'Shop_Exit':
      line(`    ← Left shop`);
      break;
    case 'Event_Choose':
      line(`    ?  Event choice: ${action.choiceId}`);
      events_log.push({ act: run?.act, floor: run?.floor, eventId: state.event?.eventId, choice: action.choiceId });
      break;
    case 'SelectNextNode': {
      const ntype = state.map?.nodes?.[action.nodeId]?.type;
      line(`    →  Moving to: ${ntype} (node ${action.nodeId.slice(-4)})`);
      break;
    }
    case 'Rest_Heal':
      line(`    ♥  Resting: Heal`);
      break;
    case 'Rest_Repair':
      line(`    🔧  Resting: Repair`);
      break;
    case 'Rest_Stabilise':
      line(`    ◆  Resting: Stabilise`);
      break;
    case 'Rest_Leave':
      line(`    ← Left rest site`);
      break;
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  try {
    state = dispatchWithJournal(state, data, action);
  } catch (e) {
    const msg = `[ERROR] dispatchWithJournal threw on ${action.type}: ${e.message}`;
    line(msg); errors_log.push(msg); break;
  }

  // ── Capture combat result when it ends ────────────────────────────────────
  // state.combat is cleared by game_core after combat ends, so we detect
  // win vs loss by checking whether the mode transitioned to GameOver.
  if (prevMode === 'Combat' && state.mode !== 'Combat' && combatStart) {
    const result  = state.mode !== 'GameOver' ? 'win' : 'loss';
    const hpAfter = state.run?.hp ?? 0;
    line(`    ── Combat result: ${result.toUpperCase()}, HP ${combatStart.hpBefore} → ${hpAfter}`);
    encounters.push({ ...combatStart, result, hpAfter });
    combatStart = null;
  }

  step++;
}

// ── Final summary ─────────────────────────────────────────────────────────────
sep('═');
line(`  FINAL STATE`);
sep('═');
const run  = state.run  || {};
const deck = state.deck || {};
const deckNames = (deck.master || []).map(iid => {
  const ci  = deck.cardInstances?.[iid];
  const def = ci ? data.cards?.[ci.defId] : null;
  return def?.name ?? ci?.defId ?? iid;
});

line(`  Mode   : ${state.mode}`);
line(`  Act    : ${run.act ?? '?'}`);
line(`  Floor  : ${run.floor ?? '?'}`);
line(`  HP     : ${run.hp ?? '?'} / ${run.maxHP ?? '?'}`);
line(`  Gold   : ${run.gold ?? '?'}g`);
line(`  MP     : ${run.mp ?? '?'}`);
line(`  Steps  : ${step}`);
line(`  Deck   : ${deckNames.length} cards`);
if (deckNames.length) line(`           ${deckNames.join(', ')}`);
line(`  Errors : ${errors_log.length}`);
if (errors_log.length) errors_log.forEach(e => line(`    ${e}`));
sep('═');

// ── Write files ───────────────────────────────────────────────────────────────
const outTxt  = join(ROOT, 'sim-output.txt');
const outJson = join(ROOT, 'sim-result.json');

writeFileSync(outTxt, lines.join('\n') + '\n', 'utf-8');

const summary = {
  seed, playstyle,
  finalMode:  state.mode,
  act:        run.act,
  floor:      run.floor,
  hp:         run.hp,
  maxHP:      run.maxHP,
  gold:       run.gold,
  deckSize:   deckNames.length,
  deck:       deckNames,
  steps:      step,
  encounters,
  events:     events_log,
  errors:     errors_log,
};
writeFileSync(outJson, JSON.stringify(summary, null, 2), 'utf-8');

line(`\n  Wrote: sim-output.txt`);
line(`  Wrote: sim-result.json`);

process.exit(errors_log.length > 0 ? 1 : 0);
