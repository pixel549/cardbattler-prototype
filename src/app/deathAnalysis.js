function getCombatEntityName(state, entityId) {
  if (!entityId) return null;
  if (state?.combat?.player?.id === entityId) return state.combat.player.name || 'Player';
  const enemy = (state?.combat?.enemies || []).find((candidate) => candidate?.id === entityId);
  return enemy?.name ?? enemy?.enemyDefId ?? entityId;
}

function formatRunEndSummary(logMessage, fallback) {
  const cleaned = String(logMessage || '')
    .replace(/^Run ended:\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + '.';
}

export function deriveCauseOfDeath(state, encounters = []) {
  if (!state?.run || state.run?.victory) return null;
  if (state.mode !== 'GameOver' && (state.run.hp ?? 1) > 0) return null;

  const log = Array.isArray(state.log) ? state.log : [];
  const reversedLog = [...log].reverse();
  const playerId = state?.combat?.player?.id ?? null;
  const latestRunEnd = reversedLog.find((entry) => entry?.t === 'Info' && /^Run ended:/i.test(entry.msg || ''));
  const lastDamageToPlayer = reversedLog.find((entry) => {
    if (entry?.t !== 'DamageDealt' || !entry.data) return false;
    const targetId = entry.data.targetId;
    if (!targetId) return false;
    if (playerId && targetId === playerId) return true;
    return targetId === 'player' || targetId === 'Player';
  });
  const lastLossEncounter = [...encounters].reverse().find((encounter) => encounter?.result === 'loss');
  const encounterReason = typeof lastLossEncounter?.outcomeReason === 'string' && lastLossEncounter.outcomeReason.trim()
    ? lastLossEncounter.outcomeReason.trim()
    : null;

  if (/travel damage/i.test(latestRunEnd?.msg || '')) {
    const travelTick = reversedLog.find((entry) => entry?.t === 'Info' && /^Travel at 0 MP:/i.test(entry.msg || ''));
    return {
      category: 'travel',
      summary: travelTick?.msg ? `${travelTick.msg}.` : 'Travel damage at 0 MP reduced you to 0 HP.',
      logMessage: latestRunEnd?.msg ?? null,
      sourceId: null,
      sourceName: null,
      damage: null,
    };
  }

  if (/died in event/i.test(latestRunEnd?.msg || '')) {
    return {
      category: 'event',
      summary: 'An event penalty reduced you to 0 HP.',
      logMessage: latestRunEnd?.msg ?? null,
      sourceId: null,
      sourceName: null,
      damage: null,
    };
  }

  if (/minigame penalty/i.test(latestRunEnd?.msg || '')) {
    return {
      category: 'minigame',
      summary: 'A minigame penalty reduced you to 0 HP.',
      logMessage: latestRunEnd?.msg ?? null,
      sourceId: null,
      sourceName: null,
      damage: null,
    };
  }

  if (latestRunEnd || lastDamageToPlayer || encounterReason) {
    const sourceId = lastDamageToPlayer?.data?.sourceId ?? null;
    const sourceName = sourceId
      ? (sourceId === playerId ? 'your own effect' : getCombatEntityName(state, sourceId))
      : null;
    const finalDamage = Number(lastDamageToPlayer?.data?.finalDamage ?? NaN);
    const damage = Number.isFinite(finalDamage) ? finalDamage : null;
    const absorbed = Number(lastDamageToPlayer?.data?.protectionAbsorbed
      ?? lastDamageToPlayer?.data?.firewallAbsorbed
      ?? lastDamageToPlayer?.data?.blocked
      ?? NaN);
    const absorbedDamage = Number.isFinite(absorbed) ? absorbed : null;

    let summary = null;
    if (sourceName && damage != null) {
      summary = `${sourceName} dealt the killing blow for ${damage} damage.`;
    } else if (sourceName) {
      summary = `${sourceName} dealt the killing blow.`;
    } else if (encounterReason) {
      summary = encounterReason;
    } else {
      summary = formatRunEndSummary(latestRunEnd?.msg, 'You were defeated in combat.');
    }

    return {
      category: 'combat',
      summary,
      logMessage: latestRunEnd?.msg ?? null,
      encounterReason,
      sourceId,
      sourceName,
      damage,
      absorbedDamage,
    };
  }

  return {
    category: 'unknown',
    summary: 'The run ended, but the exact cause could not be reconstructed.',
    logMessage: latestRunEnd?.msg ?? null,
    sourceId: null,
    sourceName: null,
    damage: null,
  };
}
