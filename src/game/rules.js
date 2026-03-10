import { push } from "./log";

function getStatusEntry(target, id) {
  if (!target) return null;
  return target.statuses?.find(s => s.id === id) ?? null;
}

export function getStatusStacks(target, id) {
  return getStatusEntry(target, id)?.stacks ?? 0;
}

export function getFirewallStacks(target) {
  return getStatusStacks(target, "Firewall");
}

export function getFirewallCap(target) {
  return Math.max(0, Math.floor(Number(target?.hp ?? 0)));
}

export function loseFirewall(state, target, amount, { silent = false } = {}) {
  const toLose = Math.max(0, Math.floor(Number(amount) || 0));
  if (toLose <= 0) return 0;

  const firewallStatus = getStatusEntry(target, "Firewall");
  if (!firewallStatus || firewallStatus.stacks <= 0) return 0;

  const lost = Math.min(firewallStatus.stacks, toLose);
  firewallStatus.stacks -= lost;
  if (firewallStatus.stacks <= 0) {
    target.statuses = (target.statuses || []).filter(s => s.id !== "Firewall");
  }
  if (!silent) {
    push(state.log, { t: "Info", msg: `${target.id} lost ${lost} Firewall` });
  }
  return lost;
}

export function clearFirewall(state, target, options) {
  return loseFirewall(state, target, getFirewallStacks(target), options);
}

export function enforceFirewallCap(state, target, { silent = false } = {}) {
  if (!target) return 0;
  const cap = getFirewallCap(target);
  const current = getFirewallStacks(target);
  if (current <= cap) return 0;
  const trimmed = loseFirewall(state, target, current - cap, { silent: true });
  if (trimmed > 0 && !silent) {
    push(state.log, { t: "Info", msg: `${target.id} Firewall capped at ${cap}` });
  }
  return trimmed;
}

export function applyDamage(state, sourceId, target, amount) {
  const rawAmount = amount; // pre-modifier base amount

  // Status modifiers (StS-ish)
  const source = (sourceId === state.player.id)
    ? state.player
    : state.enemies.find(e => e.id === sourceId);

  // Weak: attacker deals 25% less damage
  const weakStacks = source ? getStatusStacks(source, "Weak") : 0;
  if (weakStacks > 0) amount = Math.floor(amount * 0.75);

  // SensorGlitch on the attacker: reduces outgoing damage (-15% per stack, max 60% reduction)
  const sensorGlitchStacks = source ? getStatusStacks(source, "SensorGlitch") : 0;
  if (sensorGlitchStacks > 0) {
    const reduction = Math.min(0.6, sensorGlitchStacks * 0.15);
    amount = Math.floor(amount * (1 - reduction));
  }

  // Overclock: attacker deals more damage (+25% per stack, max +150%)
  if (source?._overclockMult != null && source._overclockMult > 1) {
    amount = Math.floor(amount * source._overclockMult);
  }

  // TargetSpoof on attacker: attacks hit the wrong target (-25% per stack, max 75% reduction)
  if (source?._targetSpoofMult != null && source._targetSpoofMult < 1) {
    amount = Math.floor(amount * source._targetSpoofMult);
  }

  // Throttled: attacker's output throttled (-15% per stack, max 60%)
  if (source?._throttledMult != null && source._throttledMult < 1) {
    amount = Math.floor(amount * source._throttledMult);
  }

  // DazedPackets on attacker: chance to deal reduced damage (each stack = -20% accuracy)
  if (source?._dazedPacketsMult != null && source._dazedPacketsMult < 1) {
    amount = Math.floor(amount * source._dazedPacketsMult);
  }

  // Vulnerable: target takes 50% more damage
  const vulnStacks = getStatusStacks(target, "Vulnerable");
  if (vulnStacks > 0) amount = Math.floor(amount * 1.5);

  // ExposedPorts: target takes 40% more damage (like Vulnerable but from Port Probe)
  const exposedPortsStacks = getStatusStacks(target, "ExposedPorts");
  if (exposedPortsStacks > 0) amount = Math.floor(amount * 1.4);

  // TraceBeacon: target has a tracking beacon — takes +20% damage per stack
  if (target._traceBeaconStacks) {
    amount = Math.floor(amount * (1 + target._traceBeaconStacks * 0.2));
  }

  // Underclock: attacker's outgoing damage reduced (set each turn by processStatusEffects)
  if (source?._underclockMult != null && source._underclockMult < 1) {
    amount = Math.floor(amount * source._underclockMult);
  }

  // Act scaling: enemies deal more damage
  const isEnemy = sourceId !== state.player.id;
  const enemyDmgMult = (isEnemy && state.balance?.enemyDmgMult) ? state.balance.enemyDmgMult : 1;
  if (isEnemy && enemyDmgMult !== 1) {
    amount = Math.floor(amount * enemyDmgMult);
  }

  // --- passive_combat relic effects on outgoing player damage ---
  const relics = state.relicIds || [];
  const playerDealing = !isEnemy;
  if (playerDealing) {
    // GlassCannon: player deals 50% more damage (but takes 50% more — handled on intake)
    if (relics.includes('GlassCannon')) amount = Math.floor(amount * 1.5);
    // TheDaemon: flat +N bonus damage
    if (state._relicDaemonDmgBonus && amount > 0) amount += state._relicDaemonDmgBonus;
  }

  // TraceBeacon (NC-088): while in hand, enemies deal +N damage to player
  if (isEnemy && state._traceBeaconHandBonus) {
    amount += state._traceBeaconHandBonus;
  }

  const statusModdedAmount = amount; // after status mods, before shields

  // --- relic damage intake modifiers (enemy → player only) ---
  if (isEnemy && target === state.player) {
    const relics2 = state.relicIds || [];
    if (state._mutationTurnDamageReduce && amount > 0) {
      const reduction = Math.min(amount, Math.max(0, state._mutationTurnDamageReduce));
      amount -= reduction;
      push(state.log, { t: 'Info', msg: `Mutation dampening: reduced ${reduction} incoming damage` });
    }
    if (state._mutationTurnDamageSink && amount > 0) {
      const sunk = Math.min(amount, Math.max(0, state._mutationTurnDamageSink));
      amount -= sunk;
      state._mutationTurnDamageSink = Math.max(0, state._mutationTurnDamageSink - sunk);
      push(state.log, { t: 'Info', msg: `Mutation sink: absorbed ${sunk} incoming damage` });
    }
    // GlassCannon: player takes 50% more damage
    if (relics2.includes('GlassCannon')) amount = Math.floor(amount * 1.5);
    // ScrapPlating: reduce FIRST hit per combat by 4
    if (relics2.includes('ScrapPlating') && !state._scrapPlatingUsed && amount > 0) {
      const reduction = Math.min(4, amount);
      amount -= reduction;
      state._scrapPlatingUsed = true;
      push(state.log, { t: 'Info', msg: `ScrapPlating: absorbed ${reduction} dmg` });
    }
    // FirewallPrime: first 3 hits are fully negated
    if (relics2.includes('FirewallPrime') && state._relicFirewallPrimeHits > 0 && amount > 0) {
      state._relicFirewallPrimeHits -= 1;
      push(state.log, { t: 'Info', msg: `FirewallPrime: hit negated (${state._relicFirewallPrimeHits} remaining)` });
      amount = 0;
    }
    // MirrorArray: first enemy attack each combat is fully reflected back
    if (relics2.includes('MirrorArray') && !state._mirrorArrayUsed && amount > 0) {
      const attacker = state.enemies.find(e => e.id === sourceId);
      if (attacker && attacker.hp > 0) {
        attacker.hp = Math.max(0, attacker.hp - amount);
        enforceFirewallCap(state, attacker, { silent: true });
        push(state.log, { t: 'Info', msg: `MirrorArray: reflected ${amount} to ${attacker.id}` });
      }
      state._mirrorArrayUsed = true;
      amount = 0; // player takes no damage from the reflected hit
    }
  }

  // Firewall: persistent shield that absorbs damage before HP
  let firewallAbsorbed = 0;
  if (amount > 0) {
    firewallAbsorbed = loseFirewall(state, target, amount, { silent: true });
    if (firewallAbsorbed > 0) {
      amount -= firewallAbsorbed;
      push(state.log, { t: 'Info', msg: `${target.id} Firewall absorbed ${firewallAbsorbed}` });
    }
  }

  const protectionAbsorbed = firewallAbsorbed;
  const blocked = protectionAbsorbed; // legacy telemetry field retained for compatibility
  const dmg = Math.max(0, amount);
  target.hp = Math.max(0, target.hp - dmg);

  // Track whether player took damage this turn (for NC-064 Patch Scheduler)
  if (dmg > 0 && target === state.player) {
    state._tookDamageThisTurn = true;
  }

  // --- post-damage relic effects ---
  const relicsPost = state.relicIds || [];
  // DeadMansChip: save from lethal once per run
  if (target === state.player && target.hp <= 0 && !state._deadMansChipUsed && relicsPost.includes('DeadMansChip')) {
    target.hp = 1;
    state._deadMansChipUsed = true;
    push(state.log, { t: 'Info', msg: 'DeadMansChip: lethal save! HP → 1' });
  }
  // BlackIce: reflect 3 damage to attacker on being hit
  if (dmg > 0 && target === state.player && isEnemy && relicsPost.includes('BlackIce')) {
    const attacker = state.enemies.find(e => e.id === sourceId);
    if (attacker && attacker.hp > 0) {
      const reflect = Math.min(3, attacker.hp);
      attacker.hp -= reflect;
      enforceFirewallCap(state, attacker, { silent: true });
      push(state.log, { t: 'Info', msg: `BlackIce: reflected ${reflect} to ${attacker.id}` });
    }
  }
  // VampiricAPI: player heals 20% of damage dealt to enemies
  if (dmg > 0 && playerDealing && target !== state.player && relicsPost.includes('VampiricAPI')) {
    const heal = Math.max(1, Math.floor(dmg * 0.2));
    state.player.hp = Math.min(state.player.maxHP, state.player.hp + heal);
    push(state.log, { t: 'Info', msg: `VampiricAPI: +${heal} HP (lifesteal)` });
  }
  // KillSwitch: heal 3 HP when you kill an enemy
  if (playerDealing && target.hp <= 0 && relicsPost.includes('KillSwitch')) {
    state.player.hp = Math.min(state.player.maxHP, state.player.hp + 3);
    push(state.log, { t: 'Info', msg: 'KillSwitch: +3 HP on kill' });
  }
  // EntropyEngine: draw 1 when player takes damage
  if (dmg > 0 && target === state.player && isEnemy && relicsPost.includes('EntropyEngine')) {
    state._entropyEngineDrawPending = (state._entropyEngineDrawPending || 0) + 1;
  }
  // SingularityChip: when player HP drops below 50%, heal 20 (once per combat)
  if (target === state.player && target.hp > 0 && target.hp < target.maxHP * 0.5 && !state._singularityChipUsed && relicsPost.includes('SingularityChip')) {
    const healAmt = Math.min(20, target.maxHP - target.hp);
    target.hp += healAmt;
    state._singularityChipUsed = true;
    push(state.log, { t: 'Info', msg: `SingularityChip: threshold heal +${healAmt}` });
  }

  enforceFirewallCap(state, target, { silent: true });

  // Emit structured damage event for analytics
  push(state.log, {
    t: "DamageDealt",
    msg: `${sourceId} dealt ${dmg} dmg`,
    data: {
      sourceId,
      targetId: target.id,
      rawAmount,
      statusModdedAmount,
      finalDamage: dmg,
      blocked,
      protectionAbsorbed,
      firewallAbsorbed,
      isPlayerSource: !isEnemy,
      weakened: weakStacks > 0,
      sensorGlitched: sensorGlitchStacks > 0,
      overclocked: !!(source?._overclockMult && source._overclockMult > 1),
      targetSpoofed: !!(source?._targetSpoofMult && source._targetSpoofMult < 1),
      vulnerable: vulnStacks > 0,
      exposedPorts: exposedPortsStacks > 0,
      enemyDmgMult: isEnemy ? enemyDmgMult : null,
    },
  });
  return dmg;
}

export function addStatus(state, target, id, stacks) {
  // HardenedKernel: player is immune to Vulnerable status
  if (id === 'Vulnerable' && target === state.player && (state.relicIds || []).includes('HardenedKernel')) {
    push(state.log, { t: 'Info', msg: 'HardenedKernel: Vulnerable blocked' });
    return;
  }
  if (id === "Firewall" && target._corruptedSector) {
    push(state.log, { t: "Info", msg: `${target.id} Firewall gain blocked by CorruptedSector` });
    return;
  }
  if (!target.statuses) target.statuses = [];
  const prevStacks = id === "Firewall" ? getFirewallStacks(target) : 0;
  const existing = target.statuses.find(s => s.id === id);
  if (existing) existing.stacks += stacks;
  else target.statuses.push({ id, stacks });
  if (id === "Firewall") {
    const trimmed = enforceFirewallCap(state, target, { silent: true });
    const after = getFirewallStacks(target);
    const gained = Math.max(0, after - prevStacks);
    push(state.log, { t: "Info", msg: `${target.id} gained Firewall(${gained})${trimmed > 0 ? ` [cap ${getFirewallCap(target)}]` : ''}` });
    return;
  }
  push(state.log, { t: "Info", msg: `${target.id} gained ${id}(${stacks})` });
}
