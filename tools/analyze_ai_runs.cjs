#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function collectJsonFiles(targetPath, out = []) {
  if (!fs.existsSync(targetPath)) return out;
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      collectJsonFiles(path.join(targetPath, entry), out);
    }
    return out;
  }
  if (stat.isFile() && targetPath.toLowerCase().endsWith('.json')) out.push(targetPath);
  return out;
}

function readRunsFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const runs = Array.isArray(parsed) ? parsed : [parsed];
  return runs
    .filter((run) => run && typeof run === 'object')
    .map((run) => ({ ...run, __file: filePath }));
}

function inc(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function formatMap(map, limit = 8) {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (rows.length === 0) return 'none';
  return rows.map(([key, value]) => `${key}: ${value}`).join('\n');
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function maximum(values) {
  return values.length ? Math.max(...values) : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function eventKind(event) {
  return event?.type || event?.kind || event?.eventType || event?.action || event?.label || 'Unknown';
}

function main() {
  const args = process.argv.slice(2);
  const defaultTarget = fs.existsSync(path.join(process.cwd(), 'AI runs'))
    ? path.join(process.cwd(), 'AI runs')
    : process.cwd();
  const targets = args.length > 0 ? args : [defaultTarget];

  const files = [...new Set(targets.flatMap((target) => collectJsonFiles(path.resolve(target))))];
  if (files.length === 0) {
    console.error('No JSON files found.');
    process.exit(1);
  }

  const runs = files.flatMap(readRunsFromFile);
  if (runs.length === 0) {
    console.error('No runs found in the provided JSON files.');
    process.exit(1);
  }

  const telemetryVersions = new Map();
  const exportProfiles = new Map();
  const outcomes = new Map();
  const deathFloors = new Map();
  const floorEventKinds = new Map();
  const cardEventKinds = new Map();
  const lossEnemies = new Map();
  const lossReasons = new Map();
  const seeds = new Set();
  const playstyles = new Map();
  const starterSizes = [];
  const endingSizes = [];
  const finalFloors = [];
  const finalGold = [];
  const encounterTurns = [];
  const encounterActs = new Map();
  const stallEncounters = [];

  let encounters = 0;
  let mutationEvents = 0;
  let finalMutations = 0;
  let mutationChecks = 0;
  let rewardCardEvents = 0;
  let floorEventsTotal = 0;
  let cardEventsTotal = 0;
  let cardPlayTimelineEvents = 0;
  let enemyPlayTimelineEvents = 0;
  let runsWithHands = 0;
  let runsWithMutationChecks = 0;
  let runsWithFloorEvents = 0;
  let runsWithCardEvents = 0;
  let runsWithDeckSnapshots = 0;
  let runsWithTacticalTimelines = 0;
  let attackIntoProtectionTotal = 0;
  let attackIntoProtectionWithAffordableBreachTotal = 0;
  let breachIntoUnshieldedTargetTotal = 0;
  let firewallSpendWithoutFirewallTotal = 0;
  let enemyDefenseActionsTotal = 0;
  let enemyProtectionGainTotal = 0;
  let enemyFirewallGainTotal = 0;

  for (const run of runs) {
    inc(telemetryVersions, String(run.telemetryVersion ?? 'unknown'));
    inc(exportProfiles, run.exportProfile ?? 'unknown');
    inc(outcomes, run.outcome ?? 'unknown');
    inc(playstyles, run.aiPlaystyleLabel ?? run.aiPlaystyle ?? 'unknown');

    if (run.seed != null) seeds.add(run.seed);
    if (Number.isFinite(run.finalFloor)) finalFloors.push(run.finalFloor);
    if (Number.isFinite(run.finalGold)) finalGold.push(run.finalGold);
    if (Number.isFinite(run.startingDeck?.cardCount)) starterSizes.push(run.startingDeck.cardCount);
    if (Number.isFinite(run.endingDeck?.cardCount)) endingSizes.push(run.endingDeck.cardCount);
    if (run.outcome === 'defeat') {
      const key = `Act ${run.finalAct ?? '?'} / Floor ${run.finalFloor ?? '?'}`;
      inc(deathFloors, key);
    }

    const runFloorEvents = asArray(run.floorEvents);
    const runCardEvents = asArray(run.cardEvents);
    const runEncounters = asArray(run.encounters);
    const runDeckSnapshots = asArray(run.deckSnapshots);

    if (runFloorEvents.length > 0) runsWithFloorEvents += 1;
    if (runCardEvents.length > 0) runsWithCardEvents += 1;
    if (runDeckSnapshots.length > 0) runsWithDeckSnapshots += 1;

    floorEventsTotal += runFloorEvents.length;
    cardEventsTotal += runCardEvents.length;

    for (const event of runFloorEvents) {
      inc(floorEventKinds, eventKind(event));
      if (eventKind(event) === 'RewardCard') rewardCardEvents += 1;
    }
    for (const event of runCardEvents) inc(cardEventKinds, eventKind(event));

    let runHasHands = false;
    let runHasMutationChecks = false;
    let runHasTacticalTimelines = false;

    for (const encounter of runEncounters) {
      encounters += 1;
      if (Number.isFinite(encounter.turns)) encounterTurns.push(encounter.turns);
      inc(encounterActs, `Act ${encounter.act ?? '?'}`);

      const enemiesKey = asArray(encounter.enemies).join(' + ') || 'Unknown';
      if (encounter.result === 'loss') {
        inc(lossEnemies, enemiesKey);
        inc(lossReasons, encounter.outcomeReason ?? encounter.endMode ?? 'Unknown');
      }

      const turnCount = Number(encounter.turns || 0);
      if (turnCount >= 20) {
        stallEncounters.push({
          turns: turnCount,
          floor: encounter.floor ?? '?',
          act: encounter.act ?? '?',
          enemies: enemiesKey,
          file: path.basename(run.__file),
        });
      }

      const encounterMutationEvents = asArray(encounter.mutationEvents);
      const encounterMutationChecks = asArray(encounter.mutationTriggerChecks);
      const handTimeline = asArray(encounter.handTimeline);
      const cardPlayTimeline = asArray(encounter.cardPlayTimeline);
      const enemyPlayTimeline = asArray(encounter.enemyPlayTimeline);
      const tacticalSummary = encounter.tacticalSummary || {};
      mutationEvents += encounterMutationEvents.length;
      mutationChecks += encounterMutationChecks.length;
      finalMutations += encounterMutationEvents.filter((event) => event?.type === 'FinalMutation').length;
      cardPlayTimelineEvents += cardPlayTimeline.length;
      enemyPlayTimelineEvents += enemyPlayTimeline.length;
      attackIntoProtectionTotal += Number(tacticalSummary.attackIntoProtection || 0);
      attackIntoProtectionWithAffordableBreachTotal += Number(tacticalSummary.attackIntoProtectionWithAffordableBreach || 0);
      breachIntoUnshieldedTargetTotal += Number(tacticalSummary.breachIntoUnshieldedTarget || 0);
      firewallSpendWithoutFirewallTotal += Number(tacticalSummary.firewallSpendWithoutFirewall || 0);
      enemyDefenseActionsTotal += Number(
        tacticalSummary.enemyDefenseActions
        || enemyPlayTimeline.filter((event) => event.intentType === 'Defense').length
      );
      enemyProtectionGainTotal += Number(
        tacticalSummary.enemyProtectionGain
        || enemyPlayTimeline.reduce((sum, event) => sum + Number(event.effectSummary?.defense || 0), 0)
      );
      enemyFirewallGainTotal += Number(
        tacticalSummary.enemyFirewallGain
        || enemyPlayTimeline.reduce((sum, event) => sum + Number(event.effectSummary?.firewallGain || 0), 0)
      );
      if (encounterMutationChecks.length > 0) runHasMutationChecks = true;
      if (handTimeline.length > 0) runHasHands = true;
      if (cardPlayTimeline.length > 0 || enemyPlayTimeline.length > 0) runHasTacticalTimelines = true;

      if (turnCount >= 20) {
        const sequencingErrors = Number(tacticalSummary.attackIntoProtectionWithAffordableBreach || 0);
        const attackIntoProtection = Number(tacticalSummary.attackIntoProtection || 0);
        const enemyDefenseActions = Number(
          tacticalSummary.enemyDefenseActions
          || enemyPlayTimeline.filter((event) => event.intentType === 'Defense').length
        );
        const enemyProtectionGain = Number(
          tacticalSummary.enemyProtectionGain
          || enemyPlayTimeline.reduce((sum, event) => sum + Number(event.effectSummary?.defense || 0), 0)
        );
        let diagnosis = 'unclear';
        if (sequencingErrors >= 3 && sequencingErrors >= Math.max(2, Math.floor(attackIntoProtection * 0.4))) {
          diagnosis = 'likely sequencing';
        } else if (enemyDefenseActions >= 4 && enemyProtectionGain >= 20 && sequencingErrors === 0) {
          diagnosis = 'likely defense loop';
        } else if ((enemyDefenseActions >= 4 && sequencingErrors >= 2) || attackIntoProtection >= 5) {
          diagnosis = 'mixed';
        }
        stallEncounters[stallEncounters.length - 1] = {
          ...stallEncounters[stallEncounters.length - 1],
          diagnosis,
          sequencingErrors,
          attackIntoProtection,
          enemyDefenseActions,
          enemyProtectionGain,
        };
      }
    }

    if (runHasHands) runsWithHands += 1;
    if (runHasMutationChecks) runsWithMutationChecks += 1;
    if (runHasTacticalTimelines) runsWithTacticalTimelines += 1;
  }

  stallEncounters.sort((a, b) => b.turns - a.turns);

  const output = [
    `Files: ${files.length}`,
    `Runs: ${runs.length}`,
    `Unique seeds: ${seeds.size}`,
    '',
    'Run summary',
    `Outcomes: ${formatMap(outcomes, 12)}`,
    `Playstyles: ${formatMap(playstyles, 12)}`,
    `Telemetry versions: ${formatMap(telemetryVersions, 12)}`,
    `Export profiles: ${formatMap(exportProfiles, 12)}`,
    '',
    'Progression',
    `Final floor avg/median/max: ${average(finalFloors).toFixed(2)} / ${median(finalFloors)} / ${maximum(finalFloors)}`,
    `Final gold avg/median/max: ${average(finalGold).toFixed(1)} / ${median(finalGold)} / ${maximum(finalGold)}`,
    `Starter deck avg size: ${average(starterSizes).toFixed(2)}`,
    `Ending deck avg size: ${average(endingSizes).toFixed(2)}`,
    `Top death floors:\n${formatMap(deathFloors)}`,
    '',
    'Encounter pacing',
    `Encounters: ${encounters}`,
    `Turns avg/median/max: ${average(encounterTurns).toFixed(2)} / ${median(encounterTurns)} / ${maximum(encounterTurns)}`,
    `Encounters by act: ${formatMap(encounterActs, 12)}`,
    `20+ turn stalls: ${stallEncounters.length}`,
    `Top stall fights:\n${stallEncounters.slice(0, 8).map((row) => `Act ${row.act} Floor ${row.floor} | ${row.turns} turns | ${row.enemies} | ${row.file}`).join('\n') || 'none'}`,
    `Top loss enemies:\n${formatMap(lossEnemies)}`,
    `Top loss reasons:\n${formatMap(lossReasons)}`,
    '',
    'Telemetry coverage',
    `Runs with hand timelines: ${runsWithHands}/${runs.length}`,
    `Runs with mutation checks: ${runsWithMutationChecks}/${runs.length}`,
    `Runs with tactical timelines: ${runsWithTacticalTimelines}/${runs.length}`,
    `Runs with floor events: ${runsWithFloorEvents}/${runs.length}`,
    `Runs with card events: ${runsWithCardEvents}/${runs.length}`,
    `Runs with deck snapshots: ${runsWithDeckSnapshots}/${runs.length}`,
    `Floor events logged: ${floorEventsTotal}`,
    `Card events logged: ${cardEventsTotal}`,
    `Card play timeline events: ${cardPlayTimelineEvents}`,
    `Enemy play timeline events: ${enemyPlayTimelineEvents}`,
    `RewardCard floor events: ${rewardCardEvents}`,
    `Floor event kinds:\n${formatMap(floorEventKinds, 12)}`,
    `Card event kinds:\n${formatMap(cardEventKinds, 12)}`,
    '',
    'Tactical diagnostics',
    `Attacks into active protection: ${attackIntoProtectionTotal}`,
    `...with affordable breach alternative: ${attackIntoProtectionWithAffordableBreachTotal}`,
    `Breach played into unshielded target: ${breachIntoUnshieldedTargetTotal}`,
    `Firewall-spend played with zero Firewall: ${firewallSpendWithoutFirewallTotal}`,
    `Enemy defense actions: ${enemyDefenseActionsTotal}`,
    `Enemy protection generated: ${enemyProtectionGainTotal}`,
    `Enemy Firewall generated: ${enemyFirewallGainTotal}`,
    `Top tactical stall fights:\n${stallEncounters.slice(0, 8).map((row) => {
      const diagnosis = row.diagnosis ? ` | ${row.diagnosis}` : '';
      const strategy = row.sequencingErrors != null
        ? ` | seqErr ${row.sequencingErrors} | atkIntoProt ${row.attackIntoProtection ?? 0} | enemyDef ${row.enemyDefenseActions ?? 0}`
        : '';
      return `Act ${row.act} Floor ${row.floor} | ${row.turns} turns | ${row.enemies}${diagnosis}${strategy} | ${row.file}`;
    }).join('\n') || 'none'}`,
    '',
    'Mutation telemetry',
    `Mutation events: ${mutationEvents}`,
    `Final mutations: ${finalMutations}`,
    `Mutation trigger checks: ${mutationChecks}`,
    mutationChecks > 0
      ? `Mutation events per trigger check: ${(mutationEvents / mutationChecks).toFixed(3)}`
      : 'Mutation events per trigger check: n/a',
  ];

  console.log(output.join('\n'));
}

main();
