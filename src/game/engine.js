import { RNG } from "./rng";
import { push } from "./log";
import { applyDamage, gainBlock, addStatus } from "./rules";

// ---------- enemy passives ----------
function runEnemyPassives(state, trigger, rng, enemyId=null, ctx=null) {
  const enemies = enemyId ? state.enemies.filter(e => e.id === enemyId) : state.enemies;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const passives = Array.isArray(e.passives) ? e.passives : [];
    for (const p of passives) {
      if (!p || p.trigger !== trigger) continue;

      // Optional filters
      if (p.when && typeof p.when === "object") {
        if (typeof p.when.turn === "number") {
          const t = ctx?.enemyTurn ?? ctx?.turn ?? null;
          if (t !== p.when.turn) continue;
        }
      }

      if (trigger === "EveryNTurns") {
        const n = Number(p.n);
        const t = Number(ctx?.enemyTurn ?? 0);
        if (!Number.isFinite(n) || n <= 0) continue;
        if (!Number.isFinite(t) || t <= 0) continue;
        if (t % n !== 0) continue;
      }

      const ops = Array.isArray(p.ops) ? p.ops : [];
      if (!ops.length) continue;
      push(state.log, { t: "Info", msg: `Passive trigger: ${e.id} -> ${trigger}` });
      for (const op of ops) {
        try { applyEffectOp(state, e.id, op, rng); }
        catch (err) { push(state.log, { t: "Warn", msg: `Passive op failed: ${String(err)}` }); }
      }
    }
  }
}

// ---------- piles ----------
function reshuffleIfNeeded(state, rng) {
  const p = state.player.piles;
  if (p.draw.length > 0) return;
  if (p.discard.length === 0) return;

  p.draw = p.discard.splice(0, p.discard.length);
  for (let i = p.draw.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [p.draw[i], p.draw[j]] = [p.draw[j], p.draw[i]];
  }
  push(state.log, { t: "Info", msg: `Reshuffled discard into draw (${p.draw.length})` });
}

export function drawCards(state, rng, n) {
  const isFirstDraw = !state._firstDrawDoneThisTurn && state.turn > 0;
  for (let i = 0; i < n; i++) {
    reshuffleIfNeeded(state, rng);
    if (state.player.piles.draw.length === 0) break;
    const top = state.player.piles.draw.shift();
    state.player.piles.hand.push(top);
  }
  // POWER: NC-061 Signal Amplifier — first draw each turn gets +1 bonus card
  if (isFirstDraw && n > 0) {
    state._firstDrawDoneThisTurn = true;
    runPowerTriggers(state, state.dataRef, rng, 'FirstDraw', {});
  }
}

function discardHand(state, keepCid) {
  const p = state.player.piles;
  const toKeep = [];
  while (p.hand.length) {
    const cid = p.hand.pop();
    if (cid === keepCid) toKeep.push(cid); // NC-068 Memory Compression
    else p.discard.push(cid);
  }
  p.hand.push(...toKeep); // kept cards stay in hand for next turn
}

function endTurnEthereal(state, data) {
  const p = state.player.piles;
  const keep = [];

  for (const cid of p.hand) {
    const ci = state.cardInstances[cid];
    if (!ci) { push(state.log, { t: 'Warn', msg: `endTurnEthereal: missing instance ${cid}` }); keep.push(cid); continue; }
    const def = data.cards[ci.defId];
    if (!def) { push(state.log, { t: 'Warn', msg: `endTurnEthereal: missing def ${ci.defId}` }); keep.push(cid); continue; }
    const tags = def.tags || [];
    const rawText = (def.effects || []).filter(e => e.op === 'RawText').map(e => e.text).join(' ');

    // --- Status/Junk end-of-turn effects ---

    // NC-086 Burn Stack: deal 2 damage to player at end of turn
    if (tags.includes('Status') || tags.includes('Junk')) {
      if (/At end of turn.*take (\d+) damage/i.test(rawText)) {
        const dmg = parseInt(rawText.match(/take (\d+) damage/i)?.[1] || '2');
        state.player.hp = Math.max(0, state.player.hp - dmg);
        push(state.log, { t: 'Info', msg: `${def.name} end-of-turn: dealt ${dmg} damage to player` });
      }

      // NC-091 Overheat: lose N Firewall at end of turn
      if (/lose (\d+) Firewall/i.test(rawText)) {
        const loseFW = parseInt(rawText.match(/lose (\d+) Firewall/i)?.[1] || '4');
        const fwStatus = state.player.statuses?.find(s => s.id === 'Firewall');
        if (fwStatus && fwStatus.stacks > 0) {
          const lost = Math.min(fwStatus.stacks, loseFW);
          fwStatus.stacks -= lost;
          if (fwStatus.stacks <= 0) state.player.statuses = state.player.statuses.filter(s => s.id !== 'Firewall');
          push(state.log, { t: 'Info', msg: `${def.name} end-of-turn: lost ${lost} Firewall` });
        }
      }

      // NC-085 Dazed Packet / any Status tagged "auto-purge" at end of turn: exhaust instead of discard
      if (/place this into Removed/i.test(rawText)) {
        p.exhaust.push(cid);
        push(state.log, { t: 'Info', msg: `${def.name} auto-purged from hand` });
        continue; // skip keep — already exhausted
      }
    }

    // Ethereal: exhaust instead of discard
    if (tags.includes("Ethereal")) {
      p.exhaust.push(cid);
      push(state.log, { t: "Info", msg: `Ethereal exhausted: ${def.name}` });
    } else {
      keep.push(cid);
    }
  }

  p.hand = keep;
}

// Compute per-turn damage bonus from Trace Beacon status cards in hand
// Called during enemy attacks to add passive hand-penalty damage
export function getTraceBeaconHandBonus(state, data) {
  let bonus = 0;
  for (const cid of state.player.piles.hand) {
    const ci = state.cardInstances?.[cid];
    if (!ci) continue;
    const def = data.cards[ci.defId];
    if (!def) continue;
    const rawText = (def.effects || []).filter(e => e.op === 'RawText').map(e => e.text).join(' ');
    const m = rawText.match(/enemies deal \+(\d+) damage/i);
    if (m) bonus += parseInt(m[1]);
  }
  return bonus;
}

// ============================================================
// POWER CARD TRIGGER SYSTEM
// POWER cards go to piles.power when played (permanent zone).
// runPowerTriggers fires on specific game events.
// ============================================================
function runPowerTriggers(state, data, rng, event, ctx = {}) {
  for (const cid of (state.player.piles?.power || [])) {
    const ci = state.cardInstances[cid];
    if (!ci) continue;
    const def = data.cards[ci.defId];
    if (!def) continue;
    const rawTexts = (def.effects || []).filter(e => e.op === 'RawText').map(e => e.text);
    for (const rawText of rawTexts) {
      if (!/POWER:/i.test(rawText)) continue;
      const powerText = rawText.replace(/^POWER:\s*/i, '').trim();
      _applyPowerEffect(state, data, rng, powerText, event, ctx);
    }
  }
}

function _applyPowerEffect(state, data, rng, text, event, ctx) {
  // ── StartTurn triggers ──
  if (event === 'StartTurn') {
    // NC-058: At the start of your turn, gain +1 RAM
    if (/start of your turn.*gain \+?1 ram/i.test(text)) {
      state.player.ram = Math.min(state.player.maxRAM, state.player.ram + 1);
      push(state.log, { t: 'Info', msg: 'Power: +1 RAM (Daemon Thread)' });
    }
    // NC-067: At the start of your turn, remove 1 Debuff from yourself
    if (/start of your turn.*remove 1 debuff/i.test(text)) {
      const debuffs = (state.player.statuses || []).filter(s => {
        const def = state.dataRef?.statuses?.[s.id];
        return def ? !!def.isNegative : false;
      });
      if (debuffs.length > 0) {
        debuffs[0].stacks = Math.max(0, debuffs[0].stacks - 1);
        push(state.log, { t: 'Info', msg: `Power: removed 1 ${debuffs[0].id} stack` });
        state.player.statuses = state.player.statuses.filter(s => s.stacks > 0);
      }
    }
    // NC-072: If your hand is empty, draw 2
    if (/hand is empty.*draw 2/i.test(text)) {
      if (state.player.piles.hand.length === 0) {
        drawCards(state, rng, 2);
        push(state.log, { t: 'Info', msg: 'Power: drew 2 (I/O Prioritiser, empty hand)' });
      }
    }
  }

  // ── EndTurn triggers ──
  if (event === 'EndTurn') {
    // NC-059: At the end of your turn, gain 4 Firewall
    const fwMatch = text.match(/end of your turn.*gain (\d+) firewall/i);
    if (fwMatch) {
      addStatus(state, state.player, 'Firewall', parseInt(fwMatch[1]));
      push(state.log, { t: 'Info', msg: `Power: +${fwMatch[1]} Firewall (Adaptive Firewall)` });
    }
    // NC-064: If you did not take damage this turn, heal N HP
    const healMatch = text.match(/did not take damage this turn.*heal (\d+) hp/i);
    if (healMatch && !state._tookDamageThisTurn) {
      const amt = parseInt(healMatch[1]);
      state.player.hp = Math.min(state.player.maxHP, state.player.hp + amt);
      push(state.log, { t: 'Info', msg: `Power: healed ${amt} HP (Patch Scheduler, no damage taken)` });
    }
    // NC-069: Put top of discard on top of draw
    if (/top card of your discard pile on top of your draw/i.test(text)) {
      if (state.player.piles.discard.length > 0) {
        const top = state.player.piles.discard.pop();
        state.player.piles.draw.unshift(top);
        const topDef = data.cards[state.cardInstances[top]?.defId];
        push(state.log, { t: 'Info', msg: `Power: recycled ${topDef?.name || '?'} to draw (Recursive Loop)` });
      }
    }
    // NC-068: Keep 1 card in hand (auto: keep highest-cost non-OneShot card)
    if (/you may keep 1 card in your hand/i.test(text)) {
      const hand = state.player.piles.hand;
      if (hand.length > 0) {
        // Score each card by cost descending; keep highest value
        let best = hand[0], bestScore = -Infinity;
        for (const c of hand) {
          const d = data.cards[state.cardInstances[c]?.defId];
          const score = (d?.costRAM || 0) * 10 + (d?.tags?.includes('OneShot') ? -5 : 0);
          if (score > bestScore) { bestScore = score; best = c; }
        }
        state._keepOneCard = best;
        const kDef = data.cards[state.cardInstances[best]?.defId];
        push(state.log, { t: 'Info', msg: `Power: keeping ${kDef?.name || '?'} in hand (Memory Compression)` });
      }
    }
  }

  // ── PlayCard triggers ──
  if (event === 'PlayAttack') {
    // NC-063: Whenever you play an Attack, gain 1 RAM
    if (/whenever you play an attack.*gain 1 ram/i.test(text)) {
      if (state.player.ram < state.player.maxRAM) {
        state.player.ram++;
        push(state.log, { t: 'Info', msg: 'Power: +1 RAM (Backdoor Cache)' });
      }
    }
  }

  if (event === 'PlayOneShotOrVolatile') {
    // NC-065: When you play a One-Shot or Volatile card, draw 1
    if (/one-shot or volatile.*draw 1/i.test(text)) {
      drawCards(state, rng, 1);
      push(state.log, { t: 'Info', msg: 'Power: drew 1 (Exploit Collector)' });
    }
  }

  // ── Debuff applied to enemy ──
  if (event === 'ApplyDebuff') {
    // NC-060: Whenever you apply a Debuff, deal 3 damage to that enemy
    if (/whenever you apply a debuff.*deal (\d+) damage/i.test(text)) {
      const target = ctx.target;
      const dmg = parseInt(text.match(/deal (\d+) damage/i)?.[1] || '3');
      if (target && target.hp > 0) {
        applyDamage(state, state.player.id, target, dmg);
        push(state.log, { t: 'Info', msg: `Power: ${dmg} bonus damage (Packet Leech)` });
      }
    }
  }

  // ── Gain Firewall ──
  if (event === 'GainFirewall') {
    // NC-062: Whenever you gain Firewall, gain +2 additional (guard against recursion)
    if (/whenever you gain firewall.*gain \+(\d+) additional firewall/i.test(text) && !ctx._heatSinkLock) {
      const bonus = parseInt(text.match(/gain \+(\d+) additional/i)?.[1] || '2');
      ctx._heatSinkLock = true; // prevent recursion
      addStatus(state, state.player, 'Firewall', bonus);
      push(state.log, { t: 'Info', msg: `Power: +${bonus} Firewall bonus (Heat Sink)` });
    }
  }

  // ── First draw each turn ──
  if (event === 'FirstDraw') {
    // NC-061: The first time you draw each turn, draw 1 additional card
    if (/first time you draw each turn.*draw 1 additional/i.test(text)) {
      drawCards(state, rng, 1);
      push(state.log, { t: 'Info', msg: 'Power: +1 card draw (Signal Amplifier)' });
    }
  }

  // ── First damage this turn ──
  if (event === 'FirstDamage') {
    // NC-066: First time each turn you deal damage, deal +6 additional
    if (/first time each turn you deal damage.*deal \+(\d+) additional/i.test(text)) {
      const bonus = parseInt(text.match(/\+(\d+) additional/i)?.[1] || '6');
      const target = ctx.target;
      if (target && target.hp > 0) {
        applyDamage(state, state.player.id, target, bonus);
        push(state.log, { t: 'Info', msg: `Power: +${bonus} killchain damage (Killchain Protocol)` });
      }
    }
  }

  // ── Enemy dies ──
  if (event === 'EnemyDeath') {
    // NC-070: When you defeat an enemy, gain +10 Credits
    if (/defeat an enemy.*gain \+?(\d+) credits/i.test(text)) {
      const gold = parseInt(text.match(/\+?(\d+) credits/i)?.[1] || '10');
      state._pendingGoldGain = (state._pendingGoldGain || 0) + gold;
      push(state.log, { t: 'Info', msg: `Power: +${gold}g on kill (Dark Web Broker)` });
    }
  }

  // ── Enemy heal attempt ──
  if (event === 'EnemyHeal') {
    // NC-071: First time an enemy intends to heal, cancel that heal
    if (/first time an enemy intends to heal.*cancel/i.test(text)) {
      if (!state._watchdogUsedThisCombat) {
        state._watchdogUsedThisCombat = true;
        ctx.cancelHeal = true; // signal to cancel
        push(state.log, { t: 'Info', msg: 'Power: enemy heal cancelled! (System Watchdog)' });
      }
    }
  }
}

// Apply active status effects at the START of an entity's turn (before tick/decay).
// Each status that has a per-turn effect fires here.
function processStatusEffects(state, entity) {
  for (const s of (entity.statuses || [])) {
    if (s.stacks <= 0) continue;
    switch (s.id) {
      case 'Corrode':
        // Strips block each turn AND deals 1 direct damage per stack.
        // The direct damage makes Corrode Dart and corrosion builds viable even
        // against enemies that don't naturally build block.
        {
          if (entity.block > 0) {
            const stripped = Math.min(entity.block, s.stacks);
            entity.block = Math.max(0, entity.block - stripped);
            push(state.log, { t: 'Info', msg: `${entity.id} Corrode strips ${stripped} block` });
          }
          // Deal 1 damage per Corrode stack (acid burn DoT); CorrodeCore relic adds +1/stack
          const corrodeDmgBonus = (state.relicIds || []).includes('CorrodeCore') ? 1 : 0;
          const corrodeDmg = s.stacks + s.stacks * corrodeDmgBonus;
          entity.hp = Math.max(0, entity.hp - corrodeDmg);
          push(state.log, { t: 'Info', msg: `${entity.id} Corrode burns ${corrodeDmg}` });
        }
        break;
      case 'Nanoflow':
        // Healing-over-time: restore HP equal to stacks (capped at maxHP)
        if (entity.maxHP && entity.hp < entity.maxHP) {
          const heal = Math.min(s.stacks, entity.maxHP - entity.hp);
          entity.hp += heal;
          push(state.log, { t: 'Info', msg: `${entity.id} Nanoflow heals ${heal}` });
        }
        break;
      case 'Overheat':
        // Deals stacks damage to the entity each turn (self-damage DoT)
        if (s.stacks > 0) {
          entity.hp = Math.max(0, entity.hp - s.stacks);
          push(state.log, { t: 'Info', msg: `${entity.id} Overheat deals ${s.stacks} damage` });
        }
        break;
      case 'Underclock':
        // Sets a per-turn damage reduction flag consumed in applyDamage.
        // Each stack reduces the entity's outgoing damage by 10% (capped at 50%).
        {
          const reduction = Math.min(0.5, s.stacks * 0.10);
          entity._underclockMult = 1 - reduction;
          push(state.log, { t: 'Info', msg: `${entity.id} Underclock: -${Math.round(reduction*100)}% damage` });
        }
        break;
      case 'Burn':
        // DoT: 2 damage per stack each turn (decays by 1 per turn via tickStatuses)
        {
          const burnDmg = s.stacks * 2;
          entity.hp = Math.max(0, entity.hp - burnDmg);
          push(state.log, { t: 'Info', msg: `${entity.id} Burn deals ${burnDmg} damage` });
        }
        break;
      case 'Leak':
        // DoT: 1 damage per stack each turn (data hemorrhage)
        {
          const leakDmg = s.stacks;
          entity.hp = Math.max(0, entity.hp - leakDmg);
          push(state.log, { t: 'Info', msg: `${entity.id} Leak deals ${leakDmg} damage` });
        }
        break;
      case 'Overclock':
        // Boosts outgoing damage +25% per stack (max +150%); flag consumed in applyDamage
        {
          const boost = Math.min(1.5, s.stacks * 0.25);
          entity._overclockMult = 1 + boost;
          push(state.log, { t: 'Info', msg: `${entity.id} Overclock: +${Math.round(boost*100)}% damage` });
        }
        break;
      case 'TargetSpoof':
        // Confuses attacker — reduces outgoing damage -25% per stack (max 75%)
        {
          const reduction = Math.min(0.75, s.stacks * 0.25);
          entity._targetSpoofMult = 1 - reduction;
          push(state.log, { t: 'Info', msg: `${entity.id} TargetSpoof: -${Math.round(reduction*100)}% damage` });
        }
        break;
      case 'Throttled':
        // Throttles outgoing damage -15% per stack (max 60%)
        {
          const reduction = Math.min(0.60, s.stacks * 0.15);
          entity._throttledMult = 1 - reduction;
          push(state.log, { t: 'Info', msg: `${entity.id} Throttled: -${Math.round(reduction*100)}% damage` });
        }
        break;
      case 'TraceBeacon':
        // Tracking beacon: target takes +20% damage per stack
        entity._traceBeaconStacks = s.stacks;
        break;
      case 'CorruptedSector':
        // Prevents block gain this turn
        entity._corruptedSector = true;
        push(state.log, { t: 'Info', msg: `${entity.id} CorruptedSector: no block gain this turn` });
        break;
      case 'DazedPackets':
        // Scrambled targeting: -20% damage per stack (max 80%)
        {
          const reduction = Math.min(0.80, s.stacks * 0.20);
          entity._dazedPacketsMult = 1 - reduction;
          push(state.log, { t: 'Info', msg: `${entity.id} DazedPackets: -${Math.round(reduction*100)}% damage` });
        }
        break;
      default:
        break;
    }
  }
}

function tickStatuses(entity, dataRef) {
  const statusDefs = dataRef?.statuses || {};
  const fallbackTimed = new Set(["Weak", "Vulnerable"]);
  for (const s of entity.statuses || []) {
    const def = statusDefs[s.id];
    const decays = def ? !!def.decaysEachTurn : fallbackTimed.has(s.id);
    const amt = def ? (Number(def.decayAmount) || 1) : 1;
    if (decays && s.stacks > 0) s.stacks -= amt;
  }
  entity.statuses = (entity.statuses || []).filter(s => s.stacks > 0);
}

// ---------- RawText interpreter ----------
// Parses descriptive card text into executable effect ops.
// Handles the most common patterns; unrecognized text falls through to log-only.
const STATUS_NAMES = {
  "Sensor Glitch": "SensorGlitch", "Corrode": "Corrode", "Exposed Ports": "ExposedPorts",
  "Underclock": "Underclock", "Leak": "Leak", "Overclock": "Overclock", "Nanoflow": "Nanoflow",
  "Weak": "Weak", "Vulnerable": "Vulnerable", "Target Spoof": "TargetSpoof",
  "Throttled": "Throttled", "Trace Beacon": "TraceBeacon", "Overheat": "Overheat",
  "Burn": "Burn", "Firewall": "Firewall", "Dazed Packets": "DazedPackets",
  "Corrupted Sector": "CorruptedSector",
};

function parseRawText(text) {
  const ops = [];
  // Split on sentence boundaries (. ; |) but keep complex sentences together
  const sentences = text.split(/(?:\.\s*|\s*;\s*|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);

  for (const s of sentences) {
    let m;

    // === X-Cost ops: must precede regular patterns to avoid substring false-matches ===
    // "Spend all remaining RAM"
    if (/Spend all remaining RAM/i.test(s)) {
      ops.push({ op: '_SpendAllRAM' });
    }
    // "Deal N damage to ALL enemies per RAM spent"
    else if ((m = s.match(/Deal (\d+) damage to ALL enemies per RAM spent/i))) {
      ops.push({ op: 'DealDamage', amount: parseInt(m[1]), target: 'AllEnemies', scaleByRAM: true });
    }
    // "For each RAM spent: Deal N damage and gain N Firewall"
    else if ((m = s.match(/For each RAM spent: Deal (\d+) damage and gain (\d+) Firewall/i))) {
      ops.push({ op: 'DealDamage', amount: parseInt(m[1]), target: 'Enemy', scaleByRAM: true });
      ops.push({ op: 'ApplyStatus', statusId: 'Firewall', stacks: parseInt(m[2]), target: 'Self', scaleByRAM: true });
    }
    // "Deal N damage per RAM spent"
    else if ((m = s.match(/Deal (\d+) damage per RAM spent/i))) {
      ops.push({ op: 'DealDamage', amount: parseInt(m[1]), target: 'Enemy', scaleByRAM: true });
    }
    // "Gain N Firewall per RAM spent"
    else if ((m = s.match(/Gain (\d+) Firewall per RAM spent/i))) {
      ops.push({ op: 'ApplyStatus', statusId: 'Firewall', stacks: parseInt(m[1]), target: 'Self', scaleByRAM: true });
    }
    // "Heal N HP per RAM spent"
    else if ((m = s.match(/Heal (\d+) HP per RAM spent/i))) {
      ops.push({ op: 'Heal', amount: parseInt(m[1]), target: 'Self', scaleByRAM: true });
    }
    // "Draw N card(s) per RAM spent (max M)"
    else if ((m = s.match(/Draw (\d+) cards? per RAM spent(?:\s*\(max (\d+)\))?/i))) {
      ops.push({ op: 'DrawCards', amount: parseInt(m[1]), maxAmount: m[2] ? parseInt(m[2]) : 999, target: 'Self', scaleByRAM: true });
    }
    // "Next turn, gain N RAM per RAM spent"
    else if ((m = s.match(/Next turn,? gain (\d+) RAM per RAM spent/i))) {
      ops.push({ op: '_NextTurnRAMPerRAM', amount: parseInt(m[1]) });
    }
    // "Apply N stack(s) of X to (a/target) enemy per RAM spent"
    else if ((m = s.match(/Apply (\d+) stack(?:s)? of ([A-Za-z ]+?) to (?:a )?(?:target )?enem(?:y|ies) per RAM spent/i))) {
      const statusId = STATUS_NAMES[m[2].trim()] || m[2].trim().replace(/\s+/g, '');
      ops.push({ op: 'ApplyStatus', statusId, stacks: parseInt(m[1]), target: 'Enemy', scaleByRAM: true });
    }
    // "At end of turn, lose N HP per RAM spent"
    else if ((m = s.match(/At end of turn,? lose (\d+) HP per RAM spent/i))) {
      ops.push({ op: '_EotLoseHPPerRAM', amount: parseInt(m[1]) });
    }
    // "If the target has any debuff, gain N RAM back per M RAM spent"
    else if ((m = s.match(/If the target has any debuff, gain (\d+) RAM back per (\d+) RAM spent/i))) {
      ops.push({ op: '_ConditionalRAMRefund', gainPerN: parseInt(m[1]), perN: parseInt(m[2]) });
    }
    // "Remove (Exhaust) N random non-core card from your hand per RAM spent"
    else if (/Remove \(Exhaust\) \d+ random non-core card from your hand per RAM spent/i.test(s)) {
      ops.push({ op: '_ExhaustHandPerRAM' });
    }
    // Follow-up text for NC-080 / NC-084 — handled by their respective ops above; skip to avoid misparse
    else if (/Threads Exhaust|Draw that many cards|Add \d+ temporary/i.test(s)) {
      // intentionally no-op
    }
    // "Shuffle your hand into your draw pile" (NC-054 Cold Boot)
    else if (/Shuffle your hand into your draw pile/i.test(s)) {
      ops.push({ op: '_ShuffleHandIntoDraw' });
    }

    // === Scry ===
    else if ((m = s.match(/^Scry (\d+)/i))) {
      ops.push({ op: '_Scry', amount: parseInt(m[1]) });
    }

    // === Standard ops ===
    // "Restore X RAM" or "Gain X RAM" or "Gain +X RAM"
    else if ((m = s.match(/(?:Restore|Gain) \+?(\d+) RAM/i))) {
      ops.push({ op: 'GainRAM', amount: parseInt(m[1]) });
    }
    // "Restore all RAM"
    else if (/Restore all RAM/i.test(s)) {
      ops.push({ op: '_GainRAMFull' });
    }
    // "Restore all health"
    else if (/Restore all health/i.test(s)) {
      ops.push({ op: '_HealFull' });
    }
    // "Gain X Firewall" — Firewall is a persistent status shield (not regular block)
    else if ((m = s.match(/Gain (\d+) Firewall/i))) {
      ops.push({ op: 'ApplyStatus', statusId: 'Firewall', stacks: parseInt(m[1]), target: 'Self' });
    }
    // "Gain X StatusName" (Overclock, Nanoflow, etc.)
    else if ((m = s.match(/Gain (\d+) (Overclock|Nanoflow|Underclock|Weak|Vulnerable)/i))) {
      ops.push({ op: 'ApplyStatus', statusId: m[2], stacks: parseInt(m[1]), target: 'Self' });
    }
    // "Apply X StatusName to all enemies"
    else if ((m = s.match(/Apply (\d+) ([A-Za-z ]+?) to all enemies/i))) {
      const statusId = STATUS_NAMES[m[2].trim()] || m[2].trim().replace(/\s+/g, '');
      ops.push({ op: 'ApplyStatus', statusId, stacks: parseInt(m[1]), target: 'AllEnemies' });
    }
    // "Apply Target Spoof to all enemies"
    else if (/Apply Target Spoof to all enemies/i.test(s)) {
      ops.push({ op: 'ApplyStatus', statusId: 'TargetSpoof', stacks: 1, target: 'AllEnemies' });
    }
    // "Apply X StatusName"
    else if ((m = s.match(/Apply (\d+) ([A-Za-z ]+?)$/i))) {
      const statusId = STATUS_NAMES[m[2].trim()] || m[2].trim().replace(/\s+/g, '');
      ops.push({ op: 'ApplyStatus', statusId, stacks: parseInt(m[1]), target: 'Enemy' });
    }
    // "Apply Target Spoof" (no number)
    else if (/Apply Target Spoof/i.test(s)) {
      ops.push({ op: 'ApplyStatus', statusId: 'TargetSpoof', stacks: 1, target: 'Enemy' });
    }
    // "Deal X damage to ALL enemies"
    else if ((m = s.match(/Deal (\d+) damage to ALL enemies/i))) {
      ops.push({ op: 'DealDamage', amount: parseInt(m[1]), target: 'AllEnemies' });
    }
    // "Deal X damage"
    else if ((m = s.match(/Deal (\d+) damage/i))) {
      ops.push({ op: 'DealDamage', amount: parseInt(m[1]), target: 'Enemy' });
    }
    // "Heal X HP"
    else if ((m = s.match(/Heal (\d+) HP/i))) {
      ops.push({ op: 'Heal', amount: parseInt(m[1]), target: 'Self' });
    }
    // "Lose X HP"
    else if ((m = s.match(/Lose (\d+)\s*HP/i))) {
      ops.push({ op: '_LoseHP', amount: parseInt(m[1]) });
    }
    // "Draw X"
    else if ((m = s.match(/^Draw (\d+)/i))) {
      ops.push({ op: 'DrawCards', amount: parseInt(m[1]), target: 'Self' });
    }
    // Unrecognized — skip (caller logs the full RawText)
  }

  return ops;
}

// ---------- effects interpreter ----------
function resolveTargets(state, sourceId, targetHint) {
  const sourceIsPlayer = (sourceId === "player" || sourceId === state.player.id);

  if (targetHint === "Self") {
    const t = sourceIsPlayer ? state.player : state.enemies.find(e => e.id === sourceId);
    return t ? [t] : [];
  }

  if (targetHint === "AllEnemies") {
    return state.enemies.filter(e => e.hp > 0);
  }

  if (targetHint === "AllPlayers") {
    return [state.player];
  }

  if (targetHint === "Enemy") {
    // Relative targeting:
    // - if player is acting, "Enemy" means an enemy (prefer the targeted enemy)
    // - if an enemy is acting, "Enemy" means the player
    const t = sourceIsPlayer
      ? (state._targetOverride
          ? state.enemies.find(e => e.id === state._targetOverride && e.hp > 0)
          : null)
        || state.enemies.find(e => e.hp > 0)
        || state.enemies[0]
      : state.player;
    return t ? [t] : [];
  }

  if (targetHint === "Player") return [state.player];
  return [state.player];
}

function isNegativeStatus(state, statusId) {
  const def = state.dataRef?.statuses?.[statusId];
  return def ? !!def.isNegative : false;
}

function checkPhaseChange(state, rng, enemy, wasHp) {
  const thresholds = Array.isArray(enemy.phaseThresholdsPct) ? enemy.phaseThresholdsPct : [];
  if (!thresholds.length) return;
  if (!enemy.combatFlags) enemy.combatFlags = {};
  if (!enemy.combatFlags.phaseTriggered) enemy.combatFlags.phaseTriggered = {};
  const wasPct = enemy.maxHP ? (wasHp / enemy.maxHP) * 100 : 0;
  const nowPct = enemy.maxHP ? (enemy.hp / enemy.maxHP) * 100 : 0;
  for (const th of thresholds) {
    const t = Number(th);
    if (!Number.isFinite(t)) continue;
    if (enemy.combatFlags.phaseTriggered[t]) continue;
    if (wasPct > t && nowPct <= t && enemy.hp > 0) {
      enemy.combatFlags.phaseTriggered[t] = true;
      runEnemyPassives(state, "PhaseChange", rng, enemy.id, { thresholdPct: t });
    }
  }
}

export function applyEffectOp(state, sourceId, op, rng) {
  const targets = resolveTargets(state, sourceId, op.target || "Enemy");
  if (!targets.length) return;

  switch (op.op) {
    case "DealDamage": {
      const isPlayerSource = sourceId === state.player.id;
      for (const target of targets) {
        const wasHp = target.hp;
        const dmgMult = (state._cardMutMods?.effectMult ?? 1) * (state._cardMutMods?.damageMult ?? 1);

        // POWER: NC-066 Killchain Protocol — first damage this turn deals +6 bonus
        if (isPlayerSource && !state._firstDamageThisTurn) {
          state._firstDamageThisTurn = true;
          runPowerTriggers(state, state.dataRef, rng, 'FirstDamage', { target });
        }

        applyDamage(state, sourceId, target, Math.floor((op.amount || 0) * dmgMult));

        // Phase change + Enemy death passives
        if (target.id && String(target.id).startsWith("enemy_")) {
          checkPhaseChange(state, rng, target, wasHp);
          if (wasHp > 0 && target.hp <= 0) {
            runEnemyPassives(state, "Death", rng, target.id);
            // POWER: NC-070 Dark Web Broker — gain gold on kill
            runPowerTriggers(state, state.dataRef, rng, 'EnemyDeath', { target });
          }
        }
      }
      return;
    }
    case "GainBlock": {
      const blockMult = state._cardMutMods?.effectMult ?? 1;
      for (const target of targets) gainBlock(state, target, Math.floor((op.amount || 0) * blockMult));
      return;
    }
    case "ApplyStatus":
      for (const target of targets) {
        addStatus(state, target, op.statusId, op.stacks || 1);

        // First debuff each combat hook (enemies only)
        if (target.id && String(target.id).startsWith("enemy_") && isNegativeStatus(state, op.statusId)) {
          if (!target.combatFlags) target.combatFlags = {};
          if (!target.combatFlags.firstDebuffSeen) {
            target.combatFlags.firstDebuffSeen = true;
            runEnemyPassives(state, "FirstDebuffAppliedToSelfThisCombat", rng, target.id);
          }
          // POWER: NC-060 Packet Leech — debuff applied to enemy → deal 3 damage
          if (sourceId === state.player.id) {
            runPowerTriggers(state, state.dataRef, rng, 'ApplyDebuff', { target });
          }
        }

        // POWER: NC-062 Heat Sink — gain Firewall → gain +2 more
        if (op.statusId === 'Firewall' && target === state.player) {
          const ctx = {};
          runPowerTriggers(state, state.dataRef, rng, 'GainFirewall', ctx);
        }
      }
      return;
    case "CleanseNegatives": {
      const stacksPer = Number(op.stacksPerStatus ?? 1);
      for (const target of targets) {
        if (!target.statuses) continue;
        for (const s of target.statuses) {
          if (!isNegativeStatus(state, s.id)) continue;
          s.stacks = Math.max(0, s.stacks - stacksPer);
        }
        target.statuses = target.statuses.filter(s => s.stacks > 0);
        push(state.log, { t: "Info", msg: `${target.id} cleansed negatives (${stacksPer}/status)` });
      }
      return;
    }
    case "SetPlaysThisTurn": {
      // Only meaningful for enemy self targeting
      const self = resolveTargets(state, sourceId, "Self")[0];
      if (!self || !String(self.id).startsWith("enemy_")) return;
      if (!self.combatFlags) self.combatFlags = {};
      self.combatFlags.playsThisTurnOverride = Math.max(1, Number(op.plays ?? 1));
      push(state.log, { t: "Info", msg: `${self.id} plays set to ${self.combatFlags.playsThisTurnOverride} this turn` });
      return;
    }
    case "GrantExtraPlaysNow": {
      const self = resolveTargets(state, sourceId, "Self")[0];
      if (!self || !String(self.id).startsWith("enemy_")) return;
      if (!self.combatFlags) self.combatFlags = {};
      self.combatFlags.extraPlaysNow = (self.combatFlags.extraPlaysNow || 0) + Math.max(1, Number(op.extraPlays ?? 1));
      push(state.log, { t: "Info", msg: `${self.id} gained +${op.extraPlays ?? 1} extra plays (queued)` });
      return;
    }
    case "SummonEnemy": {
      const templateId = String(op.templateId ?? "").trim();
      if (!templateId) return;
      const min = Math.max(1, Number(op.countMin ?? 1));
      const max = Math.max(min, Number(op.countMax ?? min));
      const count = rng ? (min + (rng.int(max - min + 1))) : min;

      const MAX_ENEMIES = 5;
      const freeSlots = Math.max(0, MAX_ENEMIES - state.enemies.filter(e => e.hp > 0).length);
      if (freeSlots <= 0) {
        if (op.ifNoSlot) applyEffectOp(state, sourceId, op.ifNoSlot, rng);
        return;
      }

      const toSpawn = Math.min(count, freeSlots);
      for (let i = 0; i < toSpawn; i++) {
        const ed = state.dataRef?.enemies?.[templateId];
        if (!ed) {
          push(state.log, { t: "Warn", msg: `Summon failed: missing enemy template ${templateId}` });
          return;
        }
        const id = `enemy_${state.enemySeq++}`;
        const hp = Math.max(1, Math.floor(ed.maxHP * (state.balance?.enemyHpMult ?? 1)));
        const enemy = {
          id,
          enemyDefId: templateId,
          name: ed.name,
          hp,
          maxHP: hp,
          block: 0,
          statuses: [],
          intent: undefined,
          passives: Array.isArray(ed.passives) ? ed.passives : [],
          phaseThresholdsPct: Array.isArray(ed.phaseThresholdsPct) ? ed.phaseThresholdsPct : null,
          ai: ed.ai ?? null,
          combatFlags: { firstDebuffSeen: false, phaseTriggered: {}, enemyTurn: 0, playsThisTurnOverride: null, extraPlaysNow: 0 }
        };
        state.enemies.push(enemy);
        state.enemyAI.cursorByEnemyId[id] = 0;
        setEnemyIntent(state, state.dataRef, id);
        push(state.log, { t: "Info", msg: `Summoned ${enemy.name} (${id})` });
      }
      return;
    }
    case "DrawCards": {
      const self = (sourceId === "player" || sourceId === state.player.id)
        ? state.player : null;
      if (!self) return;
      // rng may not be passed for enemy effects — safe fallback
      if (rng) drawCards(state, rng, op.amount || 1);
      else push(state.log, { t: "Info", msg: `DrawCards skipped (no rng)` });
      return;
    }
    case "Heal": {
      const amt = op.amount || 0;
      for (const target of targets) {
        // POWER: NC-071 System Watchdog — cancel first enemy heal
        if (target.id && String(target.id).startsWith("enemy_") && sourceId !== state.player.id) {
          const ctx = { cancelHeal: false };
          runPowerTriggers(state, state.dataRef, rng, 'EnemyHeal', ctx);
          if (ctx.cancelHeal) continue;
        }
        const before = target.hp;
        target.hp = Math.min(target.maxHP || target.hp + amt, target.hp + amt);
        push(state.log, { t: "Info", msg: `${target.id} healed ${target.hp - before}` });
      }
      return;
    }
    case "GainRAM": {
      const self = (sourceId === "player" || sourceId === state.player.id)
        ? state.player : null;
      if (!self) return;
      self.ram = Math.min(self.maxRAM, self.ram + (op.amount || 0));
      push(state.log, { t: "Info", msg: `Gained ${op.amount} RAM` });
      return;
    }
    case "LoseRAM": {
      const self = (sourceId === "player" || sourceId === state.player.id)
        ? state.player : null;
      if (!self) return;
      self.ram = Math.max(0, self.ram - (op.amount || 0));
      push(state.log, { t: "Info", msg: `Lost ${op.amount} RAM` });
      return;
    }
    case "RawText": {
      // Parse common RawText patterns into executable ops
      const parsed = parseRawText(op.text || "");
      if (parsed.length > 0) {
        // Track RAM spent by _SpendAllRAM within this card's resolution (local; doesn't leak into state)
        let ramSpent = 0;
        for (const pOp of parsed) {
          const self = (sourceId === "player" || sourceId === state.player.id) ? state.player : null;

          if (pOp.op === '_GainRAMFull') {
            if (self) { self.ram = self.maxRAM; push(state.log, { t: "Info", msg: `RAM fully restored` }); }

          } else if (pOp.op === '_HealFull') {
            if (self) { const before = self.hp; self.hp = self.maxHP; push(state.log, { t: "Info", msg: `Healed ${self.hp - before}` }); }

          } else if (pOp.op === '_LoseHP') {
            if (self) { self.hp = Math.max(0, self.hp - (pOp.amount || 0)); push(state.log, { t: "Info", msg: `Lost ${pOp.amount} HP` }); }

          } else if (pOp.op === '_SpendAllRAM') {
            // Drain all player RAM; subsequent scaleByRAM ops scale by this amount
            if (self) {
              ramSpent = self.ram;
              self.ram = 0;
              push(state.log, { t: "Info", msg: `Spent all RAM (${ramSpent})` });
            }

          } else if (pOp.op === '_NextTurnRAMPerRAM') {
            // Queue bonus RAM for next turn's StartTurn
            const bonus = ramSpent * (pOp.amount || 1);
            if (bonus > 0) {
              state._nextTurnBonusRAM = (state._nextTurnBonusRAM || 0) + bonus;
              push(state.log, { t: "Info", msg: `Next turn: +${bonus} RAM queued` });
            }

          } else if (pOp.op === '_EotLoseHPPerRAM') {
            // Queue end-of-turn HP loss (consumed in EndTurn handler)
            const dmg = ramSpent * (pOp.amount || 1);
            if (dmg > 0) {
              state._eotLoseHPPerRAM = (state._eotLoseHPPerRAM || 0) + dmg;
              push(state.log, { t: "Info", msg: `End of turn: will lose ${dmg} HP` });
            }

          } else if (pOp.op === '_ConditionalRAMRefund') {
            // Gain RAM back if target has any debuff (NC-082)
            if (self && ramSpent > 0) {
              const tgt = resolveTargets(state, sourceId, 'Enemy')[0];
              const hasDebuff = tgt?.statuses?.some(s => isNegativeStatus(state, s.id));
              if (hasDebuff) {
                const refund = Math.floor(ramSpent / (pOp.perN || 2)) * (pOp.gainPerN || 1);
                self.ram = Math.min(self.maxRAM, self.ram + refund);
                push(state.log, { t: "Info", msg: `Conditional RAM refund: +${refund}` });
              }
            }

          } else if (pOp.op === '_ExhaustHandPerRAM') {
            // Exhaust 1 random non-core card per RAM spent, then draw that many (NC-084)
            if (self && rng && ramSpent > 0) {
              const maxExhaust = Math.min(ramSpent, state.player.piles.hand.length);
              const toExhaust = [];
              const handCopy = [...state.player.piles.hand];
              for (let i = 0; i < maxExhaust; i++) {
                const nonCore = handCopy.filter(cid => {
                  const def = state.dataRef?.cards?.[state.cardInstances[cid]?.defId];
                  return def && !def.tags?.includes('Core');
                });
                if (!nonCore.length) break;
                const pick = nonCore[rng.int(nonCore.length)];
                toExhaust.push(pick);
                handCopy.splice(handCopy.indexOf(pick), 1);
              }
              for (const cid of toExhaust) {
                state.player.piles.hand = state.player.piles.hand.filter(x => x !== cid);
                state.player.piles.exhaust.push(cid);
              }
              if (toExhaust.length > 0) {
                push(state.log, { t: "Info", msg: `Exhausted ${toExhaust.length} cards from hand` });
                drawCards(state, rng, toExhaust.length);
              }
            }

          } else if (pOp.op === '_ShuffleHandIntoDraw') {
            // Move all hand cards (except the currently-played one) to draw pile, shuffled in
            if (rng) {
              const currentCard = state.cardInstances[state._currentlyPlayingCard || ''];
              const handToShuffle = state.player.piles.hand.filter(
                cid => cid !== state._currentlyPlayingCard
              );
              // Remove from hand
              state.player.piles.hand = state.player.piles.hand.filter(
                cid => cid === state._currentlyPlayingCard
              );
              // Shuffle into draw pile (insert at random positions)
              for (const cid of handToShuffle) {
                const pos = rng.int(state.player.piles.draw.length + 1);
                state.player.piles.draw.splice(pos, 0, cid);
              }
              push(state.log, { t: "Info", msg: `Shuffled ${handToShuffle.length} cards into draw` });
            }

          } else if (pOp.op === '_Scry') {
            // Take top N cards from draw pile; set scryPending for UI or AI to resolve
            const n = Math.max(0, pOp.amount || 1);
            const scryCards = state.player.piles.draw.slice(0, Math.min(n, state.player.piles.draw.length));
            if (scryCards.length > 0) {
              state._scryPending = { n, cards: [...scryCards] };
              push(state.log, { t: "Info", msg: `Scrying ${scryCards.length} cards` });
            }

          } else {
            // For scaleByRAM ops: multiply amount/stacks by ramSpent (skip if no RAM was spent)
            if (pOp.scaleByRAM) {
              if (ramSpent > 0) {
                const scaledOp = { ...pOp };
                if (scaledOp.op === 'DrawCards' && scaledOp.maxAmount !== undefined) {
                  scaledOp.amount = Math.min(scaledOp.maxAmount, (scaledOp.amount || 1) * ramSpent);
                } else if (scaledOp.op === 'ApplyStatus') {
                  // ApplyStatus uses 'stacks' not 'amount'
                  scaledOp.stacks = (scaledOp.stacks || 1) * ramSpent;
                } else {
                  scaledOp.amount = (scaledOp.amount || 0) * ramSpent;
                }
                delete scaledOp.scaleByRAM;
                delete scaledOp.maxAmount;
                const effectiveVal = scaledOp.op === 'ApplyStatus' ? scaledOp.stacks : scaledOp.amount;
                if (effectiveVal > 0) applyEffectOp(state, sourceId, scaledOp, rng);
              }
              // If ramSpent === 0, card had 0 RAM to spend — all per-RAM effects produce nothing
            } else {
              applyEffectOp(state, sourceId, pOp, rng);
            }
          }
        }
      } else {
        push(state.log, { t: "Info", msg: `[RawText] ${op.text || ""}` });
      }
      return;
    }
    // --- Enemy passive ops ---
    case '_SetPlaysThisTurn': {
      // Set how many times the enemy acts this turn (e.g. "Turn 1: plays 2 cards" passive)
      const enemy = state.enemies.find(e => e.id === sourceId);
      if (enemy) {
        if (!enemy.combatFlags) enemy.combatFlags = {};
        enemy.combatFlags.playsThisTurnOverride = op.amount || 1;
        push(state.log, { t: 'Info', msg: `${enemy.id} plays ${op.amount} times this turn` });
      }
      return;
    }
    case '_RemoveOneStackAllNegativeStatuses': {
      // Self-cleanse: remove 1 stack of each negative status on this enemy
      const enemy2 = state.enemies.find(e => e.id === sourceId);
      if (enemy2 && enemy2.statuses) {
        for (const s of enemy2.statuses) {
          if (isNegativeStatus(state, s.id) && s.stacks > 0) s.stacks -= 1;
        }
        enemy2.statuses = enemy2.statuses.filter(s => s.stacks > 0);
        push(state.log, { t: 'Info', msg: `${enemy2.id} self-cleansed 1 stack of each negative status` });
      }
      return;
    }

    default:
      push(state.log, { t: "Info", msg: `Unknown op ${op.op}` , data: op});
      return;
  }
}

// ---------- mutation helpers ----------
function normalizeTierOdds(tiers) {
  const entries = Object.entries(tiers || {}).filter(([, v]) => typeof v === "number" && v > 0);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum <= 0) return [["A", 1]];
  return entries.map(([t, v]) => [t, v / sum]);
}

function rollTier(rng, norm) {
  const r = rng.next();
  let acc = 0;
  for (const [tier, w] of norm) {
    acc += w;
    if (r <= acc) return tier;
  }
  return norm[norm.length - 1][0];
}

export function forceNewMutation(state, data, seed, cardInstanceId, tier) {
  const rng = new RNG((seed ^ 0xDEADBEEF) >>> 0);
  const ci = state.cardInstances[cardInstanceId];
  if (!ci) return;

  const chosenTier = tier || rng.pick(["A","B","C","D","E","F","G","H","I"]);
  const pool = data.mutationPoolsByTier?.[chosenTier] || [];
  const candidates = pool.filter(mid => {
    const m = data.mutations[mid];
    if (!m) return false;
    if (m.stackable) return true;
    return !ci.appliedMutations.includes(mid);
  });
  if (candidates.length === 0) {
    push(state.log, { t: "Info", msg: `No NEW mutations in tier ${chosenTier} for ${ci.defId}` });
    return;
  }
  const pickId = candidates[rng.int(candidates.length)];
  const mut = data.mutations[pickId];
  ci.appliedMutations.push(pickId);
  if (mut.ramCostDelta) ci.ramCostDelta += mut.ramCostDelta;
  if (mut.useCounterDelta) ci.useCounter += mut.useCounterDelta;
  if (mut.finalCountdownDelta) ci.finalMutationCountdown += mut.finalCountdownDelta;

  push(state.log, { t: "MutationApplied", msg: `Applied mutation ${pickId}`, data: { cardInstanceId, tier: mut.tier } });
  runPatchTrigger(state, data, rng, cardInstanceId, 'onApply');
}

function removeCardEverywhere(state, cid) {
  const p = state.player.piles;
  p.draw = p.draw.filter(x => x !== cid);
  p.hand = p.hand.filter(x => x !== cid);
  p.discard = p.discard.filter(x => x !== cid);
  p.exhaust = p.exhaust.filter(x => x !== cid);
}

function weightedPick(rng, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  if (sum <= 0) return entries[0]?.[0] || "brick";
  const r = rng.next() * sum;
  let acc = 0;
  for (const [k, w] of entries) {
    acc += w;
    if (r <= acc) return k;
  }
  return entries[entries.length - 1][0];
}

function applyFinalMutation(state, data, rng, cardInstanceId) {
  const ci = state.cardInstances[cardInstanceId];
  if (!ci || ci.finalMutationId) return;

  const def = data.cards[ci.defId];
  const fm = def.finalMutation;

  const isCore = def.tags?.includes("Core");
  const outcome = isCore ? "rewrite" : weightedPick(rng, fm.outcomeWeights);

  if (outcome === "brick") {
    ci.finalMutationId = "J_BRICK";
    push(state.log, { t: "FinalMutation", msg: `Final Mutation BRICK`, data: { cardInstanceId } });

    const behavior = fm.brickBehavior || "Exhaust";
    runPatchTrigger(state, data, rng, cardInstanceId, 'onBrick');
    removeCardEverywhere(state, cardInstanceId);
    state.player.piles.exhaust.push(cardInstanceId);
    if (behavior === "RemoveFromRun") ci.removeFromRunOnCombatEnd = true;
    return;
  }

  // rewrite
  const pool = fm.rewritePoolDefIds || [];
  const newDefId = pool.length ? pool[rng.int(pool.length)] : ci.defId;
  if (!data.cards[newDefId]) {
    push(state.log, { t: "Info", msg: `Rewrite pool missing defId ${newDefId}; fallback self` });
  }
  ci.finalMutationId = "J_REWRITE";
  push(state.log, { t: "FinalMutation", msg: `Final Mutation REWRITE -> ${newDefId}`, data: { cardInstanceId } });

  ci.defId = data.cards[newDefId] ? newDefId : ci.defId;
  ci.appliedMutations = [];
  ci.ramCostDelta = 0;
  ci.finalMutationCountdown = 0;
}

// apply A-I mutation (simple): just record and apply deltas
function applyMutation(state, data, rng, cardInstanceId, tier) {
  const pool = data.mutationPoolsByTier?.[tier] || [];
  if (pool.length === 0) return;

  // PatchNotes: roll 3 candidates and pick the best (prefer non-negative effects)
  const numCandidates = (state.relicIds || []).includes('PatchNotes') ? 3 : 1;
  let mid = pool[rng.int(pool.length)];
  if (numCandidates > 1) {
    const candidates = [mid];
    for (let i = 1; i < numCandidates; i++) candidates.push(pool[rng.int(pool.length)]);
    // Score: prefer positive ramCostDelta (−), positive useCounterDelta (+), no Disabled passive
    const score = (id) => {
      const m = data.mutations[id];
      if (!m) return -99;
      let s = 0;
      if (m.ramCostDelta  < 0) s += 2;   // cheaper is better
      if (m.ramCostDelta  > 0) s -= 2;
      if (m.useCounterDelta > 0) s += 1;
      if (m.useCounterDelta < 0) s -= 1;
      if (m.patch?.includes('disabled:true')) s -= 3;
      return s;
    };
    mid = candidates.reduce((best, c) => score(c) >= score(best) ? c : best, candidates[0]);
  }

  const mut = data.mutations[mid];
  const ci = state.cardInstances[cardInstanceId];
  if (!ci || !mut) return;

  // non-stackables skip if already present
  if (!mut.stackable && ci.appliedMutations.includes(mid)) return;

  ci.appliedMutations.push(mid);
  if (mut.ramCostDelta) ci.ramCostDelta += mut.ramCostDelta;
  if (mut.useCounterDelta) ci.useCounter += mut.useCounterDelta;
  if (mut.finalCountdownDelta) ci.finalMutationCountdown += mut.finalCountdownDelta;

  push(state.log, { t: "MutationApplied", msg: `Mutation ${mid}`, data: { cardInstanceId, tier } });
  runPatchTrigger(state, data, rng, cardInstanceId, 'onApply');
  // on_card_mutate relic hooks (e.g. CascadeProtocol: +8g on mutate)
  runRelicHooks(state, data, 'on_card_mutate', { rng, cardInstanceId, tier });
}

function maybeTriggerMutation(state, data, rng, cardInstanceId) {
  const ci = state.cardInstances[cardInstanceId];
  if (!ci) return;
  const def = data.cards[ci.defId];

  // Core cards never decay or mutate (per design brief)
  if (def.tags?.includes("Core")) return;

  const odds = def.mutationOdds;
  const mods = state.ruleMods || {};
  let triggerChance = (odds?.triggerChance ?? 0.25);
  if (typeof mods.mutationTriggerChanceMult === "number") triggerChance *= mods.mutationTriggerChanceMult;
  // OverclockSuite: mutations fire 2x more often (downside: mutations are 1 tier weaker)
  if ((state.relicIds || []).includes('OverclockSuite')) triggerChance = Math.min(1, triggerChance * 2);

  const guaranteed = ci.useCounter === 0;
  const roll = rng.next();
  push(state.log, { t: "RNG", msg: "MutationTrigger", data: { roll, triggerChance, guaranteed } });
  if (!guaranteed && roll > triggerChance) return;

  let tierOdds = { ...(odds?.tiers ?? { A: 1 }) };
  if (mods.mutationTierWeightMult) {
    for (const [t, m] of Object.entries(mods.mutationTierWeightMult)) {
      tierOdds[t] = (tierOdds[t] ?? 0) * m;
    }
  }

  const forced = state.forcedMutationTier;
  let tier = forced || rollTier(rng, normalizeTierOdds(tierOdds));
  if (forced) state.forcedMutationTier = null;

  // OverclockSuite: applied mutations are 1 tier weaker (A→B, B→C, etc.)
  if ((state.relicIds || []).includes('OverclockSuite') && !forced) {
    const tierOrder = ['A','B','C','D','E'];
    const idx = tierOrder.indexOf(tier);
    if (idx >= 0 && idx < tierOrder.length - 1) tier = tierOrder[idx + 1];
  }

  applyMutation(state, data, rng, cardInstanceId, tier);
  runPatchTrigger(state, data, rng, cardInstanceId, 'onMutate');

  // Reset the use-counter cycle after a guaranteed trigger so the card
  // keeps accumulating toward its next guaranteed mutation.
  if (guaranteed) {
    ci.useCounter = def?.defaultUseCounter ?? 12;
  }
}

// ---------- mutation patch system ----------

/**
 * Parse a patch DSL string into an array of entries.
 * Format: "trigger[:chance:N][:IfCondition]:op[:arg...]" separated by "|"
 * Example: "onPlay:DealSelfDamage:1|passive:EffectMult:0.8"
 */
function parsePatch(patchStr) {
  if (!patchStr) return [];
  const entries = [];
  for (const segment of patchStr.split('|')) {
    const tokens = segment.split(':');
    if (tokens.length < 2) continue;
    let i = 0;
    const trigger = tokens[i++];
    let chance = null;
    let condition = null;
    if (tokens[i] === 'chance') { i++; chance = parseFloat(tokens[i++]) || null; }
    if (tokens[i]?.startsWith('If')) { condition = tokens[i++]; }
    const op = tokens[i++];
    const args = tokens.slice(i);
    if (trigger && op) entries.push({ trigger, chance, condition, op, args });
  }
  return entries;
}

/**
 * Check whether a named condition passes.
 */
function checkCondition(state, condition, cardInstanceId, ctx) {
  if (!condition) return true;
  const player = state.player;
  switch (condition) {
    case 'IfInHand':
      return player.piles.hand.includes(cardInstanceId);
    case 'IfExactKill':
      return !!(ctx?.exactKill);
    case 'IfEnemyWeak':
      return state.enemies.some(e => e.hp > 0 && (e.statuses || []).some(s => s.id === 'Weak'));
    default:
      return true;
  }
}

/**
 * Collect passive modifiers from all mutations applied to a card.
 * Returns an object with cumulative multipliers / flags.
 */
function computePassiveMods(state, data, cardInstanceId) {
  const ci = state.cardInstances[cardInstanceId];
  const mods = {
    effectMult: 1,
    damageMult: 1,
    disabled: false,
    mutationChanceMult: 1,
  };
  if (!ci) return mods;
  for (const mid of ci.appliedMutations) {
    const mut = data.mutations[mid];
    if (!mut?.patch) continue;
    for (const e of parsePatch(mut.patch)) {
      if (e.trigger !== 'passive') continue;
      switch (e.op) {
        case 'EffectMult':    mods.effectMult    *= parseFloat(e.args[0]) || 1; break;
        case 'DamageMult':    mods.damageMult    *= parseFloat(e.args[0]) || 1; break;
        case 'Disabled':
        case 'NoEffect':      mods.disabled = true; break;
        case 'MutationChanceMult': mods.mutationChanceMult *= parseFloat(e.args[0]) || 1; break;
        // All other passives are handled at engine-hook points or are future work
      }
    }
  }
  return mods;
}

/**
 * Execute a single patch op.
 */
function execPatchOp(state, data, rng, cardInstanceId, op, args, ctx) {
  const ci   = state.cardInstances[cardInstanceId];
  const p    = state.player;
  const log  = (msg) => push(state.log, { t: 'MutPatch', msg, data: { cardInstanceId, op } });

  switch (op) {
    // ---- damage / healing ----
    case 'DealSelfDamage': {
      let amt;
      if (args[0] === 'EffectHalf') {
        // Deal self-damage equal to half the card's base attack damage (D-02 Execution Backblast)
        const def = data.cards[ci?.defId];
        let baseDmg = 0;
        for (const eff of (def?.effects || [])) {
          if (eff.op === 'DealDamage' || eff.op === 'DealDamageX') baseDmg += (eff.amount || 0);
        }
        amt = Math.max(1, Math.floor(baseDmg / 2));
      } else {
        amt = parseInt(args[0]) || 0;
      }
      if (amt > 0) { p.hp = Math.max(0, p.hp - amt); log(`DealSelfDamage ${amt}`); }
      break;
    }
    case 'DealDamage':
    case 'DealBonusDamage': {
      const amt = parseInt(args[0]) || 0;
      const enemy = state.enemies.find(e => e.hp > 0);
      if (enemy && amt > 0) { applyDamage(state, 'player', enemy, amt); log(`${op} ${amt}`); }
      break;
    }
    case 'HPtoRAM': {
      const hpCost = parseInt(args[0]) || 3;
      const ramGain = parseInt(args[1]) || 2;
      if (p.hp > hpCost) {
        p.hp -= hpCost;
        p.ram = Math.min(p.maxRAM, p.ram + ramGain);
        log(`HPtoRAM hp-${hpCost} ram+${ramGain}`);
      }
      break;
    }
    // ---- RAM ----
    case 'LoseRAM': {
      const amt = parseInt(args[0]) || 1;
      p.ram = Math.max(0, p.ram - amt);
      log(`LoseRAM ${amt}`);
      break;
    }
    case 'RAMDoubleTurn': {
      p.ram = Math.min(p.maxRAM, p.ram * 2);
      log('RAMDoubleTurn');
      break;
    }
    case 'ReduceMaxRAM': {
      const amt = parseInt(args[0]) || 1;
      p.maxRAM = Math.max(1, p.maxRAM - amt);
      p.ram    = Math.min(p.ram, p.maxRAM);
      log(`ReduceMaxRAM ${amt}`);
      break;
    }
    case 'ReduceMaxHP': {
      const amt = parseInt(args[0]) || 5;
      p.maxHP = Math.max(1, p.maxHP - amt);
      p.hp    = Math.min(p.hp, p.maxHP);
      log(`ReduceMaxHP ${amt}`);
      break;
    }
    // ---- firewall / block ----
    case 'GainFirewall': {
      const amt = parseInt(args[0]) || 1;
      gainBlock(state, p, amt);
      log(`GainFirewall ${amt}`);
      break;
    }
    case 'LoseFirewall': {
      const amt = parseInt(args[0]) || 1;
      p.block = Math.max(0, p.block - amt);
      log(`LoseFirewall ${amt}`);
      break;
    }
    case 'ClearSelfFirewall': {
      p.block = 0;
      log('ClearSelfFirewall');
      break;
    }
    // ---- statuses ----
    case 'ApplySelfStatus': {
      addStatus(state, p, args[0], parseInt(args[1]) || 1);
      log(`ApplySelfStatus ${args[0]} x${args[1]}`);
      break;
    }
    case 'ApplyEnemyStatus': {
      const enemy = state._targetOverride
        ? state.enemies.find(e => e.id === state._targetOverride && e.hp > 0)
        : state.enemies.find(e => e.hp > 0);
      if (enemy) { addStatus(state, enemy, args[0], parseInt(args[1]) || 1); log(`ApplyEnemyStatus ${args[0]}`); }
      break;
    }
    case 'ConvertNegStatus': {
      let n = parseInt(args[0]) || 1;
      p.statuses = (p.statuses || []).filter(s => {
        if (n <= 0) return true;
        const def = state.dataRef?.statuses?.[s.id];
        if (def?.isNegative) { n--; return false; }
        return true;
      });
      log(`ConvertNegStatus ${args[0]}`);
      break;
    }
    // ---- cards / piles ----
    case 'DrawCards': {
      if (rng) drawCards(state, rng, parseInt(args[0]) || 1);
      log(`DrawCards ${args[0]}`);
      break;
    }
    case 'ExileDraw': {
      const n = parseInt(args[0]) || 1;
      const exiled = p.piles.draw.splice(0, n);
      p.piles.exhaust.push(...exiled);
      log(`ExileDraw ${n}`);
      break;
    }
    case 'RecycleDiscard': {
      const n = parseInt(args[0]) || 1;
      const moved = p.piles.discard.splice(0, n);
      p.piles.hand.push(...moved);
      log(`RecycleDiscard ${n}`);
      break;
    }
    case 'ReturnToHand': {
      p.piles.discard = p.piles.discard.filter(x => x !== cardInstanceId);
      p.piles.hand.push(cardInstanceId);
      log('ReturnToHand');
      break;
    }
    case 'NextCardFree': {
      state._nextCardFree = true;
      log('NextCardFree');
      break;
    }
    // ---- mutations on self ----
    case 'RemoveLastMutation': {
      if (ci) { ci.appliedMutations.pop(); log('RemoveLastMutation'); }
      break;
    }
    case 'RemoveMutation': {
      const n = parseInt(args[0]) || 1;
      if (ci) { ci.appliedMutations.splice(-n, n); log(`RemoveMutation ${n}`); }
      break;
    }
    case 'PurgeNegMutation': {
      let n = parseInt(args[0]) || 1;
      if (ci) {
        ci.appliedMutations = ci.appliedMutations.filter(mid => {
          if (n <= 0) return true;
          if (mid.includes('-') && !mid.startsWith('C-S')) { n--; return false; }
          return true;
        });
        log(`PurgeNegMutation ${args[0]}`);
      }
      break;
    }
    case 'ClearMutations': {
      if (ci) { ci.appliedMutations = []; log('ClearMutations'); }
      break;
    }
    case 'AccelerateCountdown': {
      const n = parseInt(args[0]) || 1;
      if (ci) { ci.finalMutationCountdown = Math.max(0, (ci.finalMutationCountdown || 0) - n); log(`AccelerateCountdown ${n}`); }
      break;
    }
    case 'IncreaseCostPermanent': {
      const n = parseInt(args[0]) || 1;
      if (ci) { ci.ramCostDelta = (ci.ramCostDelta || 0) + n; log(`IncreaseCostPermanent ${n}`); }
      break;
    }
    case 'SwapNegToPosMutation': {
      if (!ci) break;
      const negIdx = ci.appliedMutations.findIndex(mid => mid.includes('-') && !mid.startsWith('C-S'));
      if (negIdx >= 0) {
        const posPool = Object.values(data.mutations || {})
          .filter(m => m.id.includes('+'))
          .map(m => m.id);
        if (posPool.length && rng) { ci.appliedMutations[negIdx] = posPool[rng.int(posPool.length)]; log('SwapNegToPosMutation'); }
      }
      break;
    }
    // ---- mutations on other cards ----
    case 'SpreadMutation': {
      const n = parseInt(args[0]) || 1;
      const others = Object.keys(state.cardInstances).filter(cid => cid !== cardInstanceId);
      for (let i = 0; i < Math.min(n, others.length); i++) {
        const tid = rng ? others[rng.int(others.length)] : others[0];
        applyMutation(state, data, rng, tid, 'A');
      }
      log(`SpreadMutation ${n}`);
      break;
    }
    case 'CopyMutationTo': {
      if (!ci || !ci.appliedMutations.length) break;
      const lastMid = ci.appliedMutations[ci.appliedMutations.length - 1];
      const others = Object.keys(state.cardInstances).filter(cid => cid !== cardInstanceId);
      if (others.length && rng) {
        const tci = state.cardInstances[others[rng.int(others.length)]];
        if (tci) { tci.appliedMutations.push(lastMid); log(`CopyMutationTo ${lastMid}`); }
      }
      break;
    }
    // ---- run-level (deferred until combat end) ----
    case 'RemoveFromRun': {
      if (ci) { ci.removeFromRunOnCombatEnd = true; log('RemoveFromRun'); }
      break;
    }
    case 'RemoveSelf': {
      removeCardEverywhere(state, cardInstanceId);
      if (ci) ci.removeFromRunOnCombatEnd = true;
      log('RemoveSelf');
      break;
    }
    case 'GainGold': {
      // Gold is run-level; record in log for game_core to pick up
      const amt = parseInt(args[0]) || 0;
      state._pendingGoldGain = (state._pendingGoldGain || 0) + amt;
      log(`GainGold ${amt}`);
      break;
    }
    case 'DecompileRandom': {
      const others = Object.keys(state.cardInstances).filter(cid => cid !== cardInstanceId);
      if (others.length && rng) {
        const tid = others[rng.int(others.length)];
        removeCardEverywhere(state, tid);
        const tci = state.cardInstances[tid];
        if (tci) tci.removeFromRunOnCombatEnd = true;
        state._pendingGoldGain = (state._pendingGoldGain || 0) + 15;
        log(`DecompileRandom ${tid}`);
      }
      break;
    }
    // ---- rewrites ----
    case 'RewriteAs': {
      const newDefId = args[0];
      if (ci && data.cards?.[newDefId]) { ci.defId = newDefId; log(`RewriteAs ${newDefId}`); }
      break;
    }
    // ---- fizzle (handled pre-effects in PlayCard; this is a post-check no-op) ----
    case 'Fizzle':
      // fizzle was already resolved before card effects ran — nothing to do here
      break;

    // ---- transfer card to enemy network (J-04 Network Hop) ----
    case 'TransferToEnemy': {
      // Card jumps to the enemy network — remove it from the player's deck and deal recoil damage
      removeCardEverywhere(state, cardInstanceId);
      if (ci) ci.removeFromRunOnCombatEnd = true;
      const recoil = parseInt(args[0]) || 5;
      p.hp = Math.max(0, p.hp - recoil);
      log(`TransferToEnemy: card purged, ${recoil} recoil damage`);
      break;
    }

    // ---- lock all cards currently in hand for this turn (J-05 Hand Lock) ----
    case 'LockHand': {
      state._lockedCards = new Set([...p.piles.hand]);
      log(`LockHand: ${state._lockedCards.size} cards locked this turn`);
      break;
    }

    // ---- copy this card into discard (D+03 Last Safe Commit, fires onBrick) ----
    case 'CopySelf': {
      if (!ci) break;
      const copyCid = `${cardInstanceId}_cp${rng ? rng.int(99999) : Math.floor(Math.random() * 99999)}`;
      state.cardInstances[copyCid] = {
        defId: ci.defId,
        appliedMutations: [],
        useCounter: 3,
        finalMutationCountdown: 5,
        ramCostDelta: 0,
      };
      p.piles.discard.push(copyCid);
      log(`CopySelf: copy of ${ci.defId} added to discard`);
      break;
    }

    // ---- reflect a fraction of card damage back to the player (A-12 Soft Mirror) ----
    case 'SelfReflect': {
      const ratio = parseFloat(args[0]) || 0.1;
      const sdef = data.cards[ci?.defId];
      let baseDmg = 0;
      for (const eff of (sdef?.effects || [])) {
        if (eff.op === 'DealDamage' || eff.op === 'DealDamageX') baseDmg += (eff.amount || 0);
      }
      if (baseDmg > 0) {
        const selfDmg = Math.max(1, Math.floor(baseDmg * ratio));
        p.hp = Math.max(0, p.hp - selfDmg);
        log(`SelfReflect: ${selfDmg} reflected`);
      }
      break;
    }

    // ---- chance to replay all card effects (C-18 Universal Echo) ----
    case 'EchoEffect': {
      const echoChance = parseFloat(args[0]) || 0.2;
      if (!rng || rng.next() > echoChance) break;
      const edef = data.cards[ci?.defId];
      if (!edef) break;
      log(`EchoEffect: replaying ${edef.name}`);
      for (const eff of (edef.effects || [])) {
        applyEffectOp(state, 'player', eff, rng);
      }
      break;
    }

    // ---- queue self-damage to fire at end of turn (D-06 Delayed Recoil) ----
    case 'DelayedSelfDamage': {
      const dmg = parseInt(args[0]) || 3;
      state._pendingEndTurnSelfDamage = (state._pendingEndTurnSelfDamage || 0) + dmg;
      log(`DelayedSelfDamage: ${dmg} queued for end of turn`);
      break;
    }
    default:
      push(state.log, { t: 'Info', msg: `MutPatch unknown op: ${op}` });
  }
}

/**
 * Run all patch entries for a given trigger on a card.
 * ctx: optional context object (e.g. { exactKill: true })
 */
function runPatchTrigger(state, data, rng, cardInstanceId, trigger, ctx) {
  const ci = state.cardInstances[cardInstanceId];
  if (!ci) return;
  for (const mid of [...ci.appliedMutations]) {
    const mut = data.mutations[mid];
    if (!mut?.patch) continue;
    for (const e of parsePatch(mut.patch)) {
      if (e.trigger !== trigger) continue;
      if (e.chance !== null && rng && rng.next() > e.chance) continue;
      if (!checkCondition(state, e.condition, cardInstanceId, ctx)) continue;
      execPatchOp(state, data, rng, cardInstanceId, e.op, e.args, ctx);
    }
  }
}

// ---------- enemy intent ----------
function inferIntentType(effects) {
  // Walk effects (including RawText) to determine the dominant intent category.
  let hasDamage = false, hasBlock = false, hasHeal = false, hasDebuff = false, hasBuff = false;
  for (const eff of (effects || [])) {
    if (eff.op === 'DealDamage') { hasDamage = true; continue; }
    if (eff.op === 'GainBlock')  { hasBlock  = true; continue; }
    if (eff.op === 'Heal')       { hasHeal   = true; continue; }
    if (eff.op === 'ApplyStatus') {
      // Positive statuses applied to self = buff; negative to enemy = debuff
      if (eff.target === 'Self') hasBuff = true; else hasDebuff = true;
      continue;
    }
    if (eff.op === 'RawText') {
      const t = eff.text || '';
      if (/Deal \d+ damage/i.test(t))              hasDamage = true;
      if (/Gain \d+ Firewall/i.test(t))            hasBlock  = true;
      if (/Heal \d+ HP/i.test(t))                  hasHeal   = true;
      if (/Gain \d+ Nanoflow/i.test(t))            hasBuff   = true;
      if (/Gain \d+ Overclock/i.test(t))           hasBuff   = true;
      // Everything else (Apply X Status) is a debuff directed at the player
      if (/Apply \d+ /i.test(t) || /Apply [A-Z]/i.test(t)) hasDebuff = true;
    }
  }
  // Priority order: damage beats everything (if mixed), then debuff, buff/heal, block
  if (hasDamage)  return 'Attack';
  if (hasDebuff)  return 'Debuff';
  if (hasBuff || hasHeal) return 'Buff';
  if (hasBlock)   return 'Defense';
  return 'Unknown';
}

function setEnemyIntent(state, data, enemyId) {
  const enemy = state.enemies.find(e => e.id === enemyId);
  if (!enemy?.enemyDefId) return;
  const enemyDef = data.enemies[enemy.enemyDefId];
  const cursor = state.enemyAI.cursorByEnemyId[enemyId] ?? 0;
  const nextCardDefId = enemyDef.rotation[cursor % enemyDef.rotation.length];
  const def = data.cards[nextCardDefId];

  // Compute intent amount from card effects (damage, block, heal, etc.)
  let amount = null;
  for (const eff of (def.effects || [])) {
    if (eff.op === 'DealDamage') {
      amount = (amount || 0) + (eff.amount || 0);
    } else if (eff.op === 'GainBlock') {
      amount = (amount || 0) + (eff.amount || 0);
    } else if (eff.op === 'RawText') {
      // Parse damage/block from text
      const dmgMatch = eff.text?.match(/Deal (\d+) damage/i);
      if (dmgMatch) amount = (amount || 0) + parseInt(dmgMatch[1]);
      const blkMatch = eff.text?.match(/Gain (\d+) Firewall/i);
      if (blkMatch) amount = (amount || 0) + parseInt(blkMatch[1]);
      // Also grab heal/status amounts for intent display
      const healMatch = eff.text?.match(/Heal (\d+) HP/i);
      if (healMatch) amount = (amount || 0) + parseInt(healMatch[1]);
      const applyMatch = eff.text?.match(/Apply (\d+)/i);
      if (applyMatch && !dmgMatch) amount = (amount || 0) + parseInt(applyMatch[1]);
    }
  }

  // Infer intent type from what the card actually does
  const intentType = inferIntentType(def.effects);

  // Scale by enemy damage multiplier for attack intents
  if (amount != null && intentType === 'Attack' && state.balance?.enemyDmgMult) {
    amount = Math.floor(amount * state.balance.enemyDmgMult);
  }

  enemy.intent = { cardDefId: nextCardDefId, name: def.name, type: intentType, amount };
}

function enemyTurn(state, data, rng, enemyId) {
  const enemy = state.enemies.find(e => e.id === enemyId);
  if (!enemy?.enemyDefId || enemy.hp <= 0) return;

  if (!enemy.combatFlags) enemy.combatFlags = { firstDebuffSeen: false, phaseTriggered: {}, enemyTurn: 0, playsThisTurnOverride: null, extraPlaysNow: 0 };
  enemy.combatFlags.enemyTurn += 1;

  // Turn-start passives
  runEnemyPassives(state, "TurnStart", rng, enemyId, { enemyTurn: enemy.combatFlags.enemyTurn, turn: state.turn });
  runEnemyPassives(state, "EveryNTurns", rng, enemyId, { enemyTurn: enemy.combatFlags.enemyTurn, turn: state.turn });

  const enemyDef = data.enemies[enemy.enemyDefId];
  const basePlays = enemyDef?.actionsPerTurn || 1;
  const overridePlays = Number(enemy.combatFlags.playsThisTurnOverride ?? basePlays);
  const extra = Number(enemy.combatFlags.extraPlaysNow ?? 0);
  const plays = Math.max(1, overridePlays) + Math.max(0, extra);
  enemy.combatFlags.playsThisTurnOverride = null;
  enemy.combatFlags.extraPlaysNow = 0;

  for (let p = 0; p < plays; p++) {
    const cursor = state.enemyAI.cursorByEnemyId[enemyId] ?? 0;
    const cardDefId = enemyDef.rotation[cursor % enemyDef.rotation.length];
    state.enemyAI.cursorByEnemyId[enemyId] = cursor + 1;

    const def = data.cards[cardDefId];
    push(state.log, { t: "Info", msg: `${enemy.name} plays ${def.name}` });
    for (const op of def.effects) applyEffectOp(state, enemyId, op, rng);

    // early exit if combat ended or enemy died mid-sequence
    if (state.combatOver || enemy.hp <= 0) break;
  }

  // After-acting passives
  runEnemyPassives(state, "AfterEnemyActs", rng, enemyId, { enemyTurn: enemy.combatFlags.enemyTurn, turn: state.turn });

  setEnemyIntent(state, data, enemyId);
}

// ---------- combat start ----------
// ---------- relic hooks ----------
function runRelicHooks(state, data, hook, ctx = {}) {
  for (const rid of (state.relicIds || [])) {
    const relic = data.relics?.[rid];
    if (!relic || relic.hook !== hook) continue;
    applyRelicHook(state, data, relic, ctx);
  }
}

function applyRelicHook(state, data, relic, ctx) {
  const rid = relic.id;
  switch (rid) {
    // --- on_combat_start ---
    case 'NeuralCache':
      // +2 RAM (may exceed maxRAM, treated as a bonus start)
      state.player.ram = Math.min(state.player.maxRAM + 2, state.player.ram + 2);
      push(state.log, { t: 'Info', msg: 'NeuralCache: +2 RAM' });
      break;
    case 'SignalJammer':
      state._relicSignalJammerActive = true;
      push(state.log, { t: 'Info', msg: 'SignalJammer: first enemy hit -2 dmg' });
      break;
    case 'GhostProtocol':
      state._nextCardFree = true;
      push(state.log, { t: 'Info', msg: 'GhostProtocol: first card free' });
      break;
    case 'LatencyChip':
      // handled separately after opening draw (ctx.postDraw = true)
      if (ctx.postDraw) {
        const lRng = ctx.rng || new RNG((state.seed ^ 0xAB7) >>> 0);
        drawCards(state, lRng, 2);
        state.player.ram = Math.max(0, state.player.ram - 1);
        push(state.log, { t: 'Info', msg: 'LatencyChip: +2 draw, -1 RAM' });
      }
      break;
    case 'FirewallPrime':
      state._relicFirewallPrimeHits = 3;
      push(state.log, { t: 'Info', msg: 'FirewallPrime: 3-hit immune' });
      break;
    case 'TheDaemon':
      // +3 outgoing damage tracked; also apply 3 Corrode to self
      state._relicDaemonDmgBonus = 3;
      addStatus(state, state.player, 'Corrode', 3);
      push(state.log, { t: 'Info', msg: 'TheDaemon: +3 dmg bonus, 3 self Corrode' });
      break;

    // --- on_turn_start ---
    case 'Overclock':
      state._relicOverclockCostMod = -1;
      break;
    case 'NeuralBurnout':
      state.player.hp = Math.max(0, state.player.hp - 2);
      push(state.log, { t: 'Info', msg: 'NeuralBurnout: -2 HP' });
      break;
    case 'TheSingularity': {
      // Download 1 of 3 random non-Core cards from the draw pile into hand
      const rng2 = ctx.rng || new RNG((state.seed ^ 0x5199) >>> 0);
      const candidates = state.player.piles.draw
        .filter(cid2 => {
          const ci2 = state.cardInstances[cid2];
          const def2 = state.dataRef?.cards?.[ci2?.defId];
          return def2 && !def2.tags?.includes('Core');
        })
        .slice(0, 6);
      if (candidates.length > 0) {
        const pick = rng2.pick(candidates);
        state.player.piles.draw = state.player.piles.draw.filter(x => x !== pick);
        state.player.piles.hand.push(pick);
        push(state.log, { t: 'Info', msg: 'TheSingularity: downloaded card to hand' });
      }
      break;
    }

    // --- on_turn_end ---
    case 'BufferOverflow':
      if (state.player.ram <= 0) {
        const rng3 = ctx.rng || new RNG((state.seed ^ 0xBF) >>> 0);
        drawCards(state, rng3, 1);
        push(state.log, { t: 'Info', msg: 'BufferOverflow: +1 draw (0 RAM)' });
      }
      break;

    // --- on_card_play ---
    case 'NeuralOverride':
      // Draw 1 when you play a 0-cost card
      if (ctx.cost === 0) {
        const r2 = ctx.rng || new RNG((state.seed ^ 0xAB0) >>> 0);
        drawCards(state, r2, 1);
        push(state.log, { t: 'Info', msg: 'NeuralOverride: +1 draw (0-cost)' });
      }
      break;
    case 'ViralPayload':
      // Apply 1 Corrode to target on each card play
      {
        const target = state.enemies.find(e => e.hp > 0);
        if (target) {
          addStatus(state, target, 'Corrode', 1);
          push(state.log, { t: 'Info', msg: 'ViralPayload: +1 Corrode on enemy' });
        }
      }
      break;
    case 'ProtocolBreach': {
      // Track unique card types played this turn; grant +1 RAM when 3 distinct types reached (once/turn)
      if (!state._protocolBreachTriggered) {
        if (!state._protocolBreachTypes) state._protocolBreachTypes = [];
        const cardType = ctx.def?.type || 'Unknown';
        if (!state._protocolBreachTypes.includes(cardType)) {
          state._protocolBreachTypes.push(cardType);
        }
        if (state._protocolBreachTypes.length >= 3) {
          state.player.ram = Math.min(state.player.maxRAM, state.player.ram + 1);
          state._protocolBreachTriggered = true;
          push(state.log, { t: 'Info', msg: 'ProtocolBreach: 3 types played — +1 RAM' });
        }
      }
      break;
    }
    case 'DebugLog':
      // Every 5th card played this combat is free
      {
        state._debugLogCount = (state._debugLogCount || 0) + 1;
        if (state._debugLogCount % 5 === 0) {
          state._nextCardFree = true;
          push(state.log, { t: 'Info', msg: 'DebugLog: 5th card — next is free' });
        }
      }
      break;
    case 'CoolingFan':
      // If this card has a Repair effect, gain 4 block
      if (ctx.def?.effects?.some(e => e.op === 'RepairSelectedCard' || e.op === 'RepairCard')) {
        gainBlock(state, state.player, 4);
        push(state.log, { t: 'Info', msg: 'CoolingFan: +4 block (repair)' });
      }
      break;

    // --- on_card_discard ---
    case 'GlitchFilter': {
      const aliveEnemies = state.enemies.filter(e => e.hp > 0);
      if (aliveEnemies.length > 0) {
        const gfRng = ctx.rng || new RNG((state.seed ^ 0xD1C5) >>> 0);
        const target = gfRng.pick(aliveEnemies);
        applyDamage(state, state.player.id, target, 3);
        push(state.log, { t: 'Info', msg: `GlitchFilter: 3 dmg on discard` });
      }
      break;
    }

    // --- on_card_mutate ---
    case 'CascadeProtocol':
      // +8g when any card mutates during combat
      state._pendingGoldGain = (state._pendingGoldGain || 0) + 8;
      push(state.log, { t: 'Info', msg: 'CascadeProtocol: +8g on mutate' });
      break;
    case 'RecursiveLoop': {
      // When a card mutates, add a fresh copy of the base card to discard
      const rlCi = state.cardInstances[ctx.cardInstanceId];
      if (rlCi) {
        const rlRng = ctx.rng || new RNG((state.seed ^ 0xC0DE) >>> 0);
        const newCid = `rl_${rlRng.int(0xFFFF).toString(16)}`;
        state.cardInstances[newCid] = {
          defId: rlCi.defId,
          appliedMutations: [],
          useCounter: (state.dataRef?.cards?.[rlCi.defId]?.defaultUseCounter ?? 12),
          finalMutationCountdown: (state.dataRef?.cards?.[rlCi.defId]?.defaultFinalMutationCountdown ?? 8),
          ramCostDelta: 0,
        };
        state.player.piles.discard.push(newCid);
        push(state.log, { t: 'Info', msg: 'RecursiveLoop: base copy added to discard' });
      }
      break;
    }

    case 'CursedCompiler': {
      // Add a Junk Data card (NC-085 Dazed Packet) to the discard pile each time a card is played
      const ccRng = ctx.rng || new RNG((state.seed ^ 0xC0DE5) >>> 0);
      const junkDefId = 'NC-085';
      if (state.dataRef?.cards?.[junkDefId]) {
        const junkCid = `cc_${ccRng.int(0xFFFF).toString(16)}_${state._ccJunkCount || 0}`;
        state._ccJunkCount = (state._ccJunkCount || 0) + 1;
        state.cardInstances[junkCid] = {
          defId: junkDefId,
          appliedMutations: [],
          useCounter: state.dataRef.cards[junkDefId].defaultUseCounter ?? 7,
          finalMutationCountdown: state.dataRef.cards[junkDefId].defaultFinalMutationCountdown ?? 7,
          ramCostDelta: 0,
        };
        state.player.piles.discard.push(junkCid);
        push(state.log, { t: 'Info', msg: 'CursedCompiler: Junk Data added to discard' });
      }
      break;
    }

    // --- on_enemy_kill (called manually from applyDamage result) ---
    case 'KillSwitch':
      state.player.hp = Math.min(state.player.maxHP, state.player.hp + 3);
      push(state.log, { t: 'Info', msg: 'KillSwitch: +3 HP on kill' });
      break;

    default:
      break;
  }
}

export function startCombatFromRunDeck(params) {
  const { data, seed, act, runDeck, enemyIds, playerMaxHP=50, playerMaxRAM=8, playerRamRegen=2, openingHand=5, ruleMods={}, forcedMutationTier=null, debugOverrides=null, relicIds=[] } = params;
  // ThrottledProc: cap RAM at 3, max card cost 1 (passive_combat)
  const effectiveMaxRAM = relicIds.includes('ThrottledProc') ? Math.min(3, playerMaxRAM) : playerMaxRAM;
  const rng = new RNG(seed);
  const draw = [...runDeck.master];

  for (let i = draw.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [draw[i], draw[j]] = [draw[j], draw[i]];
  }

  const bal = (data.actBalance || []).find(b => b.act === act) || data.actBalance?.[0] || { enemyHpMult: 1, enemyDmgMult: 1 };

  // Debug overrides apply on top of act balance
  const effectiveEnemyHpMult  = debugOverrides?.enemyHpMult  ?? (bal.enemyHpMult  ?? 1);
  const effectiveEnemyDmgMult = debugOverrides?.enemyDmgMult ?? (bal.enemyDmgMult ?? 1);

  // Debug draw override replaces ruleMods value when set
  const effectiveRuleMods = { ...ruleMods };
  if (debugOverrides?.drawPerTurnDelta != null) {
    effectiveRuleMods.drawPerTurnDelta = debugOverrides.drawPerTurnDelta;
  }

  const enemies = enemyIds.map((eid, idx) => {
    const ed = data.enemies[eid];
    if (!ed) throw new Error(`Unknown enemy id: ${eid}`);
    const hp = Math.max(1, Math.floor(ed.maxHP * effectiveEnemyHpMult));
    return {
      id: `enemy_${idx}`,
      enemyDefId: eid,
      name: ed.name,
      hp,
      maxHP: hp,
      block: 0,
      statuses: [],
      intent: undefined,
      passives: Array.isArray(ed.passives) ? ed.passives : [],
      phaseThresholdsPct: Array.isArray(ed.phaseThresholdsPct) ? ed.phaseThresholdsPct : null,
      ai: ed.ai ?? null,
      combatFlags: { firstDebuffSeen: false, phaseTriggered: {}, enemyTurn: 0, playsThisTurnOverride: null, extraPlaysNow: 0 }
    };
  });

  const cursorByEnemyId = {};
  for (const e of enemies) cursorByEnemyId[e.id] = 0;

  const state = {
    seed,
    turn: 0,
    player: {
      id: "player",
      name: "Player",
      hp: playerMaxHP,
      maxHP: playerMaxHP,
      block: 0,
      statuses: [],
      ram: effectiveMaxRAM,
      maxRAM: effectiveMaxRAM,
      ramRegen: playerRamRegen,
      piles: { draw, hand: [], discard: [], exhaust: [], power: [] }
    },
    enemies,
    enemyAI: { cursorByEnemyId },
    enemySeq: enemies.length,
    cardInstances: runDeck.cardInstances,
    log: [],
    combatOver: false,
    victory: false,
    balance: { enemyDmgMult: effectiveEnemyDmgMult, enemyHpMult: effectiveEnemyHpMult },
    ruleMods: effectiveRuleMods,
    forcedMutationTier,
    relicIds,
    dataRef: data
  };

  push(state.log, { t: "Info", msg: `Combat started (seed=${seed})` });
  runRelicHooks(state, data, 'on_combat_start', { rng });
  runEnemyPassives(state, "CombatStart", rng, null, { turn: 0 });
  drawCards(state, rng, openingHand);
  runRelicHooks(state, data, 'on_combat_start', { postDraw: true, rng });
  for (const e of enemies) setEnemyIntent(state, data, e.id);
  return state;
}

// ---------- dispatcher ----------
export function dispatchCombat(state, data, action) {
  const rng = new RNG((state.seed ^ (state.turn * 1337)) >>> 0);

  if (state.combatOver) return state;

  switch (action.type) {
    case "StartTurn": {
      state.turn += 1;
      state.player.block = 0;
      state.player.ram = Math.min(state.player.maxRAM, state.player.ram + state.player.ramRegen);

      // Consume queued bonus RAM from X-cost cards (e.g. NC-079 "Next turn, gain N RAM per RAM spent")
      if (state._nextTurnBonusRAM) {
        state.player.ram = Math.min(state.player.maxRAM, state.player.ram + state._nextTurnBonusRAM);
        push(state.log, { t: "Info", msg: `X-cost bonus: +${state._nextTurnBonusRAM} RAM this turn` });
        delete state._nextTurnBonusRAM;
      }

      // EntropyEngine: draw cards queued from damage taken last turn
      if (state._entropyEngineDrawPending > 0) {
        drawCards(state, rng, state._entropyEngineDrawPending);
        push(state.log, { t: 'Info', msg: `EntropyEngine: +${state._entropyEngineDrawPending} draw from damage` });
        delete state._entropyEngineDrawPending;
      }
      drawCards(state, rng, 5 + (state.ruleMods?.drawPerTurnDelta || 0));
      // Reset transient per-turn combat flags before recomputing them via processStatusEffects
      const _clearFlags = (ent) => {
        ent._underclockMult = undefined;
        ent._overclockMult = undefined;
        ent._targetSpoofMult = undefined;
        ent._throttledMult = undefined;
        ent._traceBeaconStacks = undefined;
        ent._corruptedSector = undefined;
        ent._dazedPacketsMult = undefined;
      };
      _clearFlags(state.player);
      for (const e of state.enemies) _clearFlags(e);

      // Reset per-turn POWER tracking flags
      state._tookDamageThisTurn = false;
      state._firstDrawDoneThisTurn = false;
      state._firstDamageThisTurn = false;
      state._killchainUsedThisTurn = false;
      delete state._keepOneCard;
      delete state._protocolBreachTypes;
      delete state._protocolBreachTriggered;
      // Clear mutation-patch per-turn flags
      delete state._lockedCards;
      state._pendingEndTurnSelfDamage = 0;

      // Apply per-turn status effects (Corrode, Nanoflow, Overheat, Underclock…) before decaying stacks
      processStatusEffects(state, state.player);
      for (const e of state.enemies) processStatusEffects(state, e);
      tickStatuses(state.player, state.dataRef);
      for (const e of state.enemies) tickStatuses(e, state.dataRef);

      // Win / defeat check after DoT — Burn/Leak can kill before the player acts
      if (state.player.hp <= 0) {
        state.combatOver = true;
        state.victory = false;
        push(state.log, { t: "Info", msg: "Player defeated by status DoT" });
        return state;
      }
      if (!state.enemies.some(e => e.hp > 0)) {
        state.combatOver = true;
        state.victory = true;
        push(state.log, { t: "Info", msg: "Combat victory (enemy killed by DoT)" });
        return state;
      }

      // onTurnStart patches for all cards in hand
      for (const cid of [...state.player.piles.hand]) {
        runPatchTrigger(state, data, rng, cid, 'onTurnStart');
      }

      // POWER: StartTurn triggers (NC-058 +1 RAM, NC-067 remove debuff, NC-072 draw 2 if empty)
      runPowerTriggers(state, data, rng, 'StartTurn', {});

      // Relic on_turn_start hooks
      runRelicHooks(state, data, 'on_turn_start', { rng });

      push(state.log, { t: "Info", msg: `Turn ${state.turn} start` });
      return state;
    }

    case "PlayCard": {
      const cid = action.cardInstanceId;
      const ci = state.cardInstances[cid];
      if (!ci) { push(state.log, { t: "Info", msg: "Missing card instance" }); return state; }

      // must be in hand
      if (!state.player.piles.hand.includes(cid)) { push(state.log, { t: "Info", msg: "Card not in hand" }); return state; }

      // locked cards (J-05 Hand Lock) cannot be played this turn
      if (state._lockedCards?.has(cid)) { push(state.log, { t: "Info", msg: "Card is locked this turn" }); return state; }

      const def = data.cards[ci.defId];

      // Compute RAM cost, accounting for NextCardFree flag
      let cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
      if (state._nextCardFree) { cost = 0; state._nextCardFree = false; }
      // Overclock relic: first card each turn costs 1 less RAM
      if (state._relicOverclockCostMod != null) {
        cost = Math.max(0, cost + state._relicOverclockCostMod);
        delete state._relicOverclockCostMod;
      }
      if (state.player.ram < cost) { push(state.log, { t: "Info", msg: "Not enough RAM" }); return state; }

      state.player.ram -= cost;

      // Emit structured card-played event for stats tracking
      push(state.log, { t: "CardPlayed", data: { defId: ci.defId, cost, ramAfter: state.player.ram } });

      // Track currently-playing card so effects like _ShuffleHandIntoDraw can exclude it
      state._currentlyPlayingCard = cid;

      // MemoryLeak: every 3rd card played is exhausted + deals double effect
      const hasMemoryLeak = (state.relicIds || []).includes('MemoryLeak');
      if (hasMemoryLeak) {
        state._memoryLeakCount = (state._memoryLeakCount || 0) + 1;
        if (state._memoryLeakCount % 3 === 0) {
          state._memoryLeakThisCard = true;
          push(state.log, { t: 'Info', msg: 'MemoryLeak: 3rd card — double effect + exhaust' });
        }
      }

      // QuantumProcessor: 50% chance to double all effects OR exhaust the card
      const hasQuantumProcessor = (state.relicIds || []).includes('QuantumProcessor');
      if (hasQuantumProcessor) {
        const qpRoll = rng.next();
        if (qpRoll < 0.5) {
          state._qpDoubleThisCard = true;
          push(state.log, { t: 'Info', msg: 'QuantumProcessor: doubled!' });
        } else {
          state._qpExhaustThisCard = true;
          push(state.log, { t: 'Info', msg: 'QuantumProcessor: exhausted!' });
        }
      }

      // VoidPointer: cards with Exhaust tag deal double effects (they still exhaust)
      const hasVoidPointer = (state.relicIds || []).includes('VoidPointer');
      if (hasVoidPointer && def.tags?.includes('Exhaust')) {
        state._voidPointerDoubleThisCard = true;
        push(state.log, { t: 'Info', msg: 'VoidPointer: Exhaust card plays twice' });
      }

      // Passive mutation modifiers for this play
      const mutPassives = computePassiveMods(state, data, cid);
      // MemoryLeak doubles the effectMult for this card
      if (state._memoryLeakThisCard) {
        mutPassives.effectMult = (mutPassives.effectMult || 1) * 2;
        mutPassives.damageMult = (mutPassives.damageMult || 1) * 2;
      }
      // QuantumProcessor double roll
      if (state._qpDoubleThisCard) {
        mutPassives.effectMult = (mutPassives.effectMult || 1) * 2;
        mutPassives.damageMult = (mutPassives.damageMult || 1) * 2;
      }
      // VoidPointer doubles Exhaust-tagged cards
      if (state._voidPointerDoubleThisCard) {
        mutPassives.effectMult = (mutPassives.effectMult || 1) * 2;
        mutPassives.damageMult = (mutPassives.damageMult || 1) * 2;
      }
      state._cardMutMods = mutPassives;

      // Set target override so effects hit the selected enemy
      if (action.targetEnemyId) state._targetOverride = action.targetEnemyId;

      // Pre-effects fizzle check (A-07 Latency Spike, B-05 Signal Loss)
      // Fizzle must resolve BEFORE effects so the card's effects are skipped on proc
      let fizzled = false;
      for (const mid of (ci.appliedMutations || [])) {
        if (fizzled) break;
        const fmut = data.mutations?.[mid];
        if (!fmut?.patch) continue;
        for (const fe of parsePatch(fmut.patch)) {
          if (fe.trigger !== 'onPlay' || fe.op !== 'Fizzle') continue;
          if (fe.chance !== null && rng && rng.next() > fe.chance) continue;
          fizzled = true;
          push(state.log, { t: 'MutPatch', msg: `${def.name} fizzled!`, data: { cardInstanceId: cid, op: 'Fizzle' } });
          break;
        }
      }

      // play effects (skipped if card is disabled by mutation or fizzled)
      if (!mutPassives.disabled && !fizzled) {
        for (const op of def.effects) {
          applyEffectOp(state, "player", op, rng);
        }
      }

      delete state._targetOverride;
      delete state._cardMutMods;
      delete state._currentlyPlayingCard;

      // onPlay mutation patches
      runPatchTrigger(state, data, rng, cid, 'onPlay');

      // Relic on_card_play hooks
      runRelicHooks(state, data, 'on_card_play', { cid, rng, def, cost });

      // decay tick (non-core only)
      const isCore = def.tags?.includes("Core");
      if (!isCore) {
        ci.useCounter = Math.max(0, (ci.useCounter || 0) - 1);
        ci.finalMutationCountdown = Math.max(0, (ci.finalMutationCountdown || 0) - 1);
        const extraTick = state.ruleMods?.finalCountdownTickDelta || 0;
        if (extraTick) ci.finalMutationCountdown = Math.max(0, ci.finalMutationCountdown - extraTick);

        maybeTriggerMutation(state, data, rng, cid);

        // final mutation check
        if (ci.finalMutationCountdown <= 0 && !ci.finalMutationId) {
          // RedundantSystems: once per card, restore 2 countdown ticks before final mutation
          if ((state.relicIds || []).includes('RedundantSystems') && !ci._redundantSystemsUsed) {
            ci._redundantSystemsUsed = true;
            ci.finalMutationCountdown = 2;
            push(state.log, { t: 'Info', msg: `RedundantSystems: final mutation delayed +2 for ${ci.defId}` });
          } else {
            applyFinalMutation(state, data, rng, cid);
          }
        }
      }

      // move card to power/exhaust/discard
      const memoryLeakExhaust = state._memoryLeakThisCard;
      const qpExhaust = state._qpExhaustThisCard;
      delete state._memoryLeakThisCard;
      delete state._qpDoubleThisCard;
      delete state._qpExhaustThisCard;
      delete state._voidPointerDoubleThisCard;
      state.player.piles.hand = state.player.piles.hand.filter(x => x !== cid);
      if (def.tags?.includes("Power") || def.type === "Power") {
        // POWER cards stay in play permanently
        state.player.piles.power = state.player.piles.power || [];
        state.player.piles.power.push(cid);
        push(state.log, { t: 'Info', msg: `${def.name} is now active (Power)` });
      } else if (memoryLeakExhaust || qpExhaust || def.tags?.includes("Exhaust") || ci.finalMutationId === "J_BRICK") {
        state.player.piles.exhaust.push(cid);
      } else {
        state.player.piles.discard.push(cid);
      }

      // POWER: fire PlayAttack trigger
      if (def.type === 'Attack') runPowerTriggers(state, data, rng, 'PlayAttack', {});
      // POWER: fire PlayOneShotOrVolatile trigger
      if (def.tags?.includes('OneShot') || def.tags?.includes('Volatile')) {
        runPowerTriggers(state, data, rng, 'PlayOneShotOrVolatile', {});
      }

      // win check
      const alive = state.enemies.some(e => e.hp > 0);
      if (!alive) {
        state.combatOver = true;
        state.victory = true;
        push(state.log, { t: "Info", msg: "Combat victory" });
      }

      return state;
    }

    case "EndTurn": {
      // onDiscard patches before hand is discarded
      for (const cid of [...state.player.piles.hand]) {
        runPatchTrigger(state, data, rng, cid, 'onDiscard');
      }
      // POWER: EndTurn triggers (NC-059 Firewall, NC-064 heal, NC-068 keep, NC-069 recycle)
      runPowerTriggers(state, data, rng, 'EndTurn', {});
      // Relic on_turn_end hooks (e.g. BufferOverflow: draw 1 if 0 RAM)
      runRelicHooks(state, data, 'on_turn_end', { rng });

      endTurnEthereal(state, data);

      // on_card_discard relic hooks (e.g. GlitchFilter: 3 dmg per discard)
      // Fire once per card being discarded from hand
      {
        const keepCid = state._keepOneCard;
        const discardCount = state.player.piles.hand.filter(c => c !== keepCid).length;
        for (let _di = 0; _di < discardCount; _di++) {
          runRelicHooks(state, data, 'on_card_discard', { rng, cardIdx: _di });
          if (state.combatOver) break;
        }
      }

      // Compute TraceBeacon hand-penalty BEFORE discarding (card was in hand this turn)
      state._traceBeaconHandBonus = getTraceBeaconHandBonus(state, data);

      // NC-068 Memory Compression: keep one chosen card (exclude from discard)
      discardHand(state, state._keepOneCard);

      // End-of-turn HP loss from X-cost cards (e.g. NC-083 "lose N HP per RAM spent")
      if (state._eotLoseHPPerRAM) {
        state.player.hp = Math.max(0, state.player.hp - state._eotLoseHPPerRAM);
        push(state.log, { t: "Info", msg: `X-cost EOT: lost ${state._eotLoseHPPerRAM} HP` });
        delete state._eotLoseHPPerRAM;
      }

      // Delayed self-damage from mutation patches (D-06 Delayed Recoil)
      if (state._pendingEndTurnSelfDamage > 0) {
        state.player.hp = Math.max(0, state.player.hp - state._pendingEndTurnSelfDamage);
        push(state.log, { t: "Info", msg: `Delayed recoil: ${state._pendingEndTurnSelfDamage} self-damage` });
        state._pendingEndTurnSelfDamage = 0;
      }

      // enemy actions (TraceBeacon bonus is active during enemy attacks)
      for (const e of state.enemies) enemyTurn(state, data, rng, e.id);
      delete state._traceBeaconHandBonus;

      // defeat check
      if (state.player.hp <= 0) {
        state.combatOver = true;
        state.victory = false;
        push(state.log, { t: "Info", msg: "Player defeated" });
        return state;
      }

      // win check after enemy turn
      const alive = state.enemies.some(e => e.hp > 0);
      if (!alive) {
        state.combatOver = true;
        state.victory = true;
        push(state.log, { t: "Info", msg: "Combat victory" });
      }

      push(state.log, { t: "Info", msg: "Turn end" });

      // Auto-start next turn if combat continues
      if (!state.combatOver) {
        dispatchCombat(state, data, { type: "StartTurn" });
      }

      return state;
    }

    case "SimulateEncounter": {
      const maxTurns = action.maxTurns ?? 50;
      for (let i = 0; i < maxTurns && !state.combatOver; i++) {
        // First iteration needs explicit StartTurn; subsequent turns auto-start via EndTurn
        if (i === 0) dispatchCombat(state, data, { type: "StartTurn" });
        // naive: play first playable cards until no RAM
        let played = true;
        while (played && !state.combatOver) {
          played = false;
          // Auto-resolve any pending Scry: keep all cards (put them back in same order)
          if (state._scryPending) {
            const { cards } = state._scryPending;
            dispatchCombat(state, data, { type: "ScryResolve", discard: [], top: cards });
          }
          for (const cid of [...state.player.piles.hand]) {
            const ci = state.cardInstances[cid];
            const def = data.cards[ci.defId];
            const cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
            if (state.player.ram >= cost) {
              dispatchCombat(state, data, { type: "PlayCard", cardInstanceId: cid, targetEnemyId: state.enemies[0]?.id });
              played = true;
              break;
            }
          }
        }
        if (!state.combatOver) dispatchCombat(state, data, { type: "EndTurn" });
      }
      return state;
    }

    case "ScryResolve": {
      // action.discard = [cardInstanceIds to send to discard pile]
      // action.top    = [cardInstanceIds to put back on top of draw, in order]
      const pending = state._scryPending;
      if (!pending) {
        push(state.log, { t: "Info", msg: `ScryResolve: nothing pending` });
        return state;
      }
      const { cards } = pending;

      // Remove scried cards from the top of the draw pile (they were peeked, not drawn)
      state.player.piles.draw = state.player.piles.draw.filter(c => !cards.includes(c));

      // Discard the ones the player chose to discard (must be in scried set)
      const toDiscard = Array.isArray(action.discard) ? action.discard.filter(c => cards.includes(c)) : [];
      for (const cid of toDiscard) state.player.piles.discard.push(cid);

      // Put kept cards back on top in specified order (or natural order if unspecified)
      const kept = Array.isArray(action.top)
        ? action.top.filter(c => cards.includes(c) && !toDiscard.includes(c))
        : cards.filter(c => !toDiscard.includes(c));
      state.player.piles.draw = [...kept, ...state.player.piles.draw];

      delete state._scryPending;
      push(state.log, { t: "Info", msg: `Scry resolved: discarded ${toDiscard.length}, kept ${kept.length}` });
      return state;
    }

    default:
      push(state.log, { t: "Info", msg: `Unknown combat action ${action.type}` });
      return state;
  }
}
