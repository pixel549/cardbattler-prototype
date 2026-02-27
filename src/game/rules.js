import { push } from "./log";

function getStacks(target, id) {
  return target.statuses?.find(s => s.id === id)?.stacks ?? 0;
}

export function applyDamage(state, sourceId, target, amount) {
  const rawAmount = amount; // pre-modifier base amount

  // Status modifiers (StS-ish)
  const source = (sourceId === state.player.id)
    ? state.player
    : state.enemies.find(e => e.id === sourceId);

  // Weak: attacker deals 25% less damage
  const weakStacks = source ? getStacks(source, "Weak") : 0;
  if (weakStacks > 0) amount = Math.floor(amount * 0.75);

  // SensorGlitch on the attacker: reduces outgoing damage (-15% per stack, max 60% reduction)
  const sensorGlitchStacks = source ? getStacks(source, "SensorGlitch") : 0;
  if (sensorGlitchStacks > 0) {
    const reduction = Math.min(0.6, sensorGlitchStacks * 0.15);
    amount = Math.floor(amount * (1 - reduction));
  }

  // Vulnerable: target takes 50% more damage
  const vulnStacks = getStacks(target, "Vulnerable");
  if (vulnStacks > 0) amount = Math.floor(amount * 1.5);

  // ExposedPorts: target takes 40% more damage (like Vulnerable but from Port Probe)
  const exposedPortsStacks = getStacks(target, "ExposedPorts");
  if (exposedPortsStacks > 0) amount = Math.floor(amount * 1.4);

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

  const statusModdedAmount = amount; // after status mods, before block
  const blocked = Math.min(target.block, amount);
  target.block -= blocked;
  const dmg = Math.max(0, amount - blocked);
  target.hp = Math.max(0, target.hp - dmg);

  // Emit structured damage event for analytics (replaces plain Info entry)
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
      isPlayerSource: !isEnemy,
      weakened: weakStacks > 0,
      sensorGlitched: sensorGlitchStacks > 0,
      vulnerable: vulnStacks > 0,
      exposedPorts: exposedPortsStacks > 0,
      enemyDmgMult: isEnemy ? enemyDmgMult : null,
    },
  });
  return dmg;
}

export function gainBlock(state, target, amount) {
  target.block += amount;
  push(state.log, { t: "Info", msg: `${target.id} gained ${amount} block` });
}

export function addStatus(state, target, id, stacks) {
  if (!target.statuses) target.statuses = [];
  const existing = target.statuses.find(s => s.id === id);
  if (existing) existing.stacks += stacks;
  else target.statuses.push({ id, stacks });
  push(state.log, { t: "Info", msg: `${target.id} gained ${id}(${stacks})` });
}
