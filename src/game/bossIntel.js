import { pickEncounter } from "./encounters.js";
import { getBossDirective } from "./combatDirectives.js";

function getEncounterIds(data, act, kind) {
  const tables = data?.encounterTables || [];
  const flatTable = tables.find((table) => table.act === act && table.kind === kind);
  if (flatTable?.encounterIds?.length) return flatTable.encounterIds;

  const mergedTable = tables.find((table) => table.act === act && Array.isArray(table?.[kind]));
  if (mergedTable?.[kind]?.length) return mergedTable[kind];

  return [];
}

export function getBossEncounterPool(data, act = null) {
  const encounterIds = act == null
    ? [...new Set((data?.encounterTables || []).flatMap((table) => {
        if (Array.isArray(table?.encounterIds) && table.kind === "boss") return table.encounterIds;
        if (Array.isArray(table?.boss)) return table.boss;
        return [];
      }))]
    : getEncounterIds(data, act, "boss");

  return encounterIds
    .map((encounterId) => data?.encounters?.[encounterId])
    .filter((encounter) => encounter?.kind === "boss" && Array.isArray(encounter?.enemyIds) && encounter.enemyIds.length > 0);
}

export function getProjectedBossEncounter(data, run) {
  if (!data || !run) return null;
  if (run?.debugOverrides?.enemyPoolSeed != null) return { debugPool: true };
  if (run?.debugOverrides?.encounterKind && run.debugOverrides.encounterKind !== "boss") {
    return {
      debugPool: true,
      notes: `Debug encounter kind "${run.debugOverrides.encounterKind}" is overriding boss selection.`,
    };
  }

  const rawAct = Number(run?.debugOverrides?.actOverride ?? run?.act ?? 1);
  const act = Math.max(1, Math.min(3, rawAct));
  const floor = Math.max(1, Number(run?.floor ?? 0) + 1);
  try {
    return pickEncounter(data, (run.seed ^ floor) >>> 0, act, "boss", {
      floor,
      recentHistory: run?.encounterHistory || [],
    });
  } catch {
    return null;
  }
}

export function summarizeBossEncounter(data, encounter) {
  if (!encounter || encounter.debugPool) {
    return {
      id: "debug_pool",
      name: "Debug pool active",
      act: null,
      totalHp: null,
      enemyCount: 0,
      roleSummary: [],
      enemies: [],
      notes: encounter?.notes || "Debug enemy pool is overriding structured boss selection.",
    };
  }

  const enemies = (encounter.enemyIds || [])
    .map((enemyId) => {
      const enemy = data?.enemies?.[enemyId];
      const directive = getBossDirective(enemy, encounter?.act || 1);
      return enemy
        ? {
            id: enemyId,
            name: enemy.name || enemyId,
            role: enemy.role || "Unknown",
            hp: Number(enemy.maxHP || 0),
            gimmick: directive?.label || null,
            gimmickSummary: directive?.summary || null,
          }
        : null;
    })
    .filter(Boolean);

  const roleCounts = {};
  for (const enemy of enemies) {
    roleCounts[enemy.role] = (roleCounts[enemy.role] || 0) + 1;
  }

  return {
    id: encounter.id,
    name: encounter.name || encounter.id,
    act: Number(encounter.act || 1),
    totalHp: enemies.reduce((sum, enemy) => sum + enemy.hp, 0),
    enemyCount: enemies.length,
    roleSummary: Object.entries(roleCounts)
      .map(([role, count]) => `${count}x ${role}`)
      .slice(0, 3),
    enemies,
    notes: encounter.notes || "",
  };
}

export function getBossArchiveEntries(data, metaProgress, limit = 6) {
  const seenSet = new Set(metaProgress?.bossEncounterIdsSeen || []);
  const defeatedSet = new Set(metaProgress?.bossEncounterIdsDefeated || []);

  const allBosses = Object.values(data?.encounters || {})
    .filter((encounter) => encounter?.kind === "boss")
    .map((encounter) => {
      const summary = summarizeBossEncounter(data, encounter);
      return {
        ...summary,
        seen: seenSet.has(encounter.id),
        defeated: defeatedSet.has(encounter.id),
      };
    })
    .sort((a, b) => {
      if (a.defeated !== b.defeated) return a.defeated ? -1 : 1;
      if (a.seen !== b.seen) return a.seen ? -1 : 1;
      if ((a.act || 0) !== (b.act || 0)) return (a.act || 0) - (b.act || 0);
      return String(a.name).localeCompare(String(b.name));
    });

  return allBosses.slice(0, limit);
}
