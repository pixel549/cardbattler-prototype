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
  for (let i = 0; i < n; i++) {
    reshuffleIfNeeded(state, rng);
    if (state.player.piles.draw.length === 0) break;
    const top = state.player.piles.draw.shift();
    state.player.piles.hand.push(top);
  }
}

function discardHand(state) {
  const p = state.player.piles;
  while (p.hand.length) {
    p.discard.push(p.hand.pop());
  }
}

function endTurnEthereal(state, data) {
  const p = state.player.piles;
  const keep = [];
  for (const cid of p.hand) {
    const ci = state.cardInstances[cid];
    const def = data.cards[ci.defId];
    if (def.tags?.includes("Ethereal")) {
      p.exhaust.push(cid);
      push(state.log, { t: "Info", msg: `Ethereal exhausted: ${def.name}` });
    } else keep.push(cid);
  }
  p.hand = keep;
}

// Apply active status effects at the START of an entity's turn (before tick/decay).
// Each status that has a per-turn effect fires here.
function processStatusEffects(state, entity) {
  for (const s of (entity.statuses || [])) {
    if (s.stacks <= 0) continue;
    switch (s.id) {
      case 'Corrode':
        // Strips block each turn (armour decay — reduces existing block by stacks)
        if (entity.block > 0) {
          const stripped = Math.min(entity.block, s.stacks);
          entity.block = Math.max(0, entity.block - stripped);
          push(state.log, { t: 'Info', msg: `${entity.id} Corrode strips ${stripped} block` });
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

    // "Restore X RAM" or "Gain X RAM" or "Gain +X RAM"
    if ((m = s.match(/(?:Restore|Gain) \+?(\d+) RAM/i))) {
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
    // "Gain X Firewall"
    else if ((m = s.match(/Gain (\d+) Firewall/i))) {
      ops.push({ op: 'GainBlock', amount: parseInt(m[1]), target: 'Self' });
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
    // Scry X (look at top cards) - simplified as draw for now
    else if ((m = s.match(/^Scry (\d+)/i))) {
      // Scry is complex; skip for now
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
      for (const target of targets) {
        const wasHp = target.hp;
        const dmgMult = (state._cardMutMods?.effectMult ?? 1) * (state._cardMutMods?.damageMult ?? 1);
        applyDamage(state, sourceId, target, Math.floor((op.amount || 0) * dmgMult));
        // Phase change + Enemy death passives
        if (target.id && String(target.id).startsWith("enemy_")) {
          checkPhaseChange(state, rng, target, wasHp);
          if (wasHp > 0 && target.hp <= 0) {
            runEnemyPassives(state, "Death", rng, target.id);
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
        for (const pOp of parsed) {
          if (pOp.op === '_GainRAMFull') {
            const self = (sourceId === "player" || sourceId === state.player.id) ? state.player : null;
            if (self) { self.ram = self.maxRAM; push(state.log, { t: "Info", msg: `RAM fully restored` }); }
          } else if (pOp.op === '_HealFull') {
            const self = (sourceId === "player" || sourceId === state.player.id) ? state.player : null;
            if (self) { const before = self.hp; self.hp = self.maxHP; push(state.log, { t: "Info", msg: `Healed ${self.hp - before}` }); }
          } else if (pOp.op === '_LoseHP') {
            const self = (sourceId === "player" || sourceId === state.player.id) ? state.player : null;
            if (self) { self.hp = Math.max(0, self.hp - (pOp.amount || 0)); push(state.log, { t: "Info", msg: `Lost ${pOp.amount} HP` }); }
          } else {
            applyEffectOp(state, sourceId, pOp, rng);
          }
        }
      } else {
        push(state.log, { t: "Info", msg: `[RawText] ${op.text || ""}` });
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
  const mid = pool[rng.int(pool.length)];
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
  const tier = forced || rollTier(rng, normalizeTierOdds(tierOdds));
  if (forced) state.forcedMutationTier = null;

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
      const amt = parseInt(args[0]) || 0;
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
    // ---- no-ops / stubs ----
    case 'Fizzle':
    case 'TransferToEnemy':
    case 'LockHand':
    case 'CopySelf':
    case 'SelfReflect':
    case 'EchoEffect':
    case 'DelayedSelfDamage':
    case 'DealSelfDamage:EffectHalf':
      push(state.log, { t: 'Info', msg: `MutPatch stub: ${op}` });
      break;
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
  const basePlays = 1;
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
export function startCombatFromRunDeck(params) {
  const { data, seed, act, runDeck, enemyIds, playerMaxHP=50, playerMaxRAM=8, playerRamRegen=2, openingHand=5, ruleMods={}, forcedMutationTier=null, debugOverrides=null } = params;
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
      ram: playerMaxRAM,
      maxRAM: playerMaxRAM,
      ramRegen: playerRamRegen,
      piles: { draw, hand: [], discard: [], exhaust: [] }
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
    dataRef: data
  };

  push(state.log, { t: "Info", msg: `Combat started (seed=${seed})` });
  runEnemyPassives(state, "CombatStart", rng, null, { turn: 0 });
  drawCards(state, rng, openingHand);
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

      drawCards(state, rng, 5 + (state.ruleMods?.drawPerTurnDelta || 0));
      // Apply per-turn status effects (Corrode, Nanoflow, Overheat, …) before decaying stacks
      processStatusEffects(state, state.player);
      for (const e of state.enemies) processStatusEffects(state, e);
      tickStatuses(state.player, state.dataRef);
      for (const e of state.enemies) tickStatuses(e, state.dataRef);

      // onTurnStart patches for all cards in hand
      for (const cid of [...state.player.piles.hand]) {
        runPatchTrigger(state, data, rng, cid, 'onTurnStart');
      }

      push(state.log, { t: "Info", msg: `Turn ${state.turn} start` });
      return state;
    }

    case "PlayCard": {
      const cid = action.cardInstanceId;
      const ci = state.cardInstances[cid];
      if (!ci) { push(state.log, { t: "Info", msg: "Missing card instance" }); return state; }

      // must be in hand
      if (!state.player.piles.hand.includes(cid)) { push(state.log, { t: "Info", msg: "Card not in hand" }); return state; }

      const def = data.cards[ci.defId];

      // Compute RAM cost, accounting for NextCardFree flag
      let cost = Math.max(0, (def.costRAM || 0) + (ci.ramCostDelta || 0));
      if (state._nextCardFree) { cost = 0; state._nextCardFree = false; }
      if (state.player.ram < cost) { push(state.log, { t: "Info", msg: "Not enough RAM" }); return state; }

      state.player.ram -= cost;

      // Passive mutation modifiers for this play
      const mutPassives = computePassiveMods(state, data, cid);
      state._cardMutMods = mutPassives;

      // Set target override so effects hit the selected enemy
      if (action.targetEnemyId) state._targetOverride = action.targetEnemyId;

      // play effects (skipped if card is disabled by mutation)
      if (!mutPassives.disabled) {
        for (const op of def.effects) {
          applyEffectOp(state, "player", op, rng);
        }
      }

      delete state._targetOverride;
      delete state._cardMutMods;

      // onPlay mutation patches
      runPatchTrigger(state, data, rng, cid, 'onPlay');

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
          applyFinalMutation(state, data, rng, cid);
        }
      }

      // move card to discard/exhaust
      state.player.piles.hand = state.player.piles.hand.filter(x => x !== cid);
      if (def.tags?.includes("Exhaust") || ci.finalMutationId === "J_BRICK") state.player.piles.exhaust.push(cid);
      else state.player.piles.discard.push(cid);

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
      endTurnEthereal(state, data);
      discardHand(state);

      // enemy actions
      for (const e of state.enemies) enemyTurn(state, data, rng, e.id);

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

    default:
      push(state.log, { t: "Info", msg: `Unknown combat action ${action.type}` });
      return state;
  }
}
