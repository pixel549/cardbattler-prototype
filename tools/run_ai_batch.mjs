import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AI_PLAYSTYLES } from '../src/game/aiPlaystyles.js';
import { loadGameData, runAiSimulation, summarizeSimulationBatch } from './aiSimulationCore.mjs';

function parseArgs(argv) {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.slice(2).split('=');
    options[rawKey.trim()] = rawValue == null ? 'true' : rawValue.trim();
  }

  const runs = Number(options.runs ?? options.count ?? 24);
  const maxSteps = Number(options['max-steps'] ?? options.maxSteps ?? 5000);
  const baseSeed = Number(options.seed ?? Date.now());
  const starterProfileId = options.starter ?? options.starterProfile ?? 'kernel';
  const difficultyId = options.difficulty ?? 'standard';
  const playstyles = String(options.playstyles ?? Object.keys(AI_PLAYSTYLES).join(','))
    .split(',')
    .map((playstyle) => playstyle.trim())
    .filter((playstyle) => AI_PLAYSTYLES[playstyle]);
  const challengeIds = String(options.challenges ?? '')
    .split(',')
    .map((challengeId) => challengeId.trim())
    .filter(Boolean);
  const outPath = options.out || '';

  return {
    runs: Number.isFinite(runs) ? Math.max(1, runs) : 24,
    maxSteps: Number.isFinite(maxSteps) ? Math.max(1, maxSteps) : 5000,
    baseSeed: Number.isFinite(baseSeed) ? baseSeed : Date.now(),
    starterProfileId,
    difficultyId,
    playstyles: playstyles.length > 0 ? playstyles : ['balanced'],
    challengeIds,
    outPath,
  };
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function buildDefaultOutputPath(rootDir) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const outputDir = path.join(rootDir, 'AI runs');
  fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, `ai_batch_${stamp}.json`);
}

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = loadGameData(rootDir);
const results = [];

for (let index = 0; index < args.runs; index += 1) {
  const playstyle = args.playstyles[index % args.playstyles.length];
  const seed = args.baseSeed + index;
  const result = runAiSimulation({
    data,
    seed,
    playstyle,
    starterProfileId: args.starterProfileId,
    difficultyId: args.difficultyId,
    challengeIds: args.challengeIds,
    maxSteps: args.maxSteps,
  });
  results.push(result);
  process.stdout.write(
    `[${index + 1}/${args.runs}] ${result.aiPlaystyleLabel} seed ${seed} -> ${result.outcome} at Act ${result.finalAct} Floor ${result.finalFloor}\n`,
  );
}

const outputPath = args.outPath
  ? path.resolve(rootDir, args.outPath)
  : buildDefaultOutputPath(rootDir);
const summary = summarizeSimulationBatch(results);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

process.stdout.write('\nBatch summary\n');
process.stdout.write(`Runs: ${summary.totalRuns}\n`);
process.stdout.write(`Completed: ${summary.completedRuns}\n`);
process.stdout.write(`Wins: ${summary.wins}\n`);
process.stdout.write(`Losses: ${summary.losses}\n`);
process.stdout.write(`Win rate: ${formatPercent(summary.winRate)}\n`);
process.stdout.write(`Average floor: ${summary.averageFloor.toFixed(2)}\n`);
process.stdout.write(`Average peak Heat: ${summary.averageHeatPeak.toFixed(2)}\n`);
process.stdout.write(`Average RAM-starved turns: ${summary.averageRamStarve.toFixed(2)}\n`);
process.stdout.write(`Average HP after first combat: ${summary.averageFirstCombatHpAfter.toFixed(2)}\n`);
process.stdout.write(`Average HP entering floor 5+: ${summary.averageHpEnteringFloorFive.toFixed(2)}\n`);
process.stdout.write(`Average encounter turns: ${summary.averageEncounterTurns.toFixed(2)}\n`);
if (summary.topDefeatingEncounters.length > 0) {
  process.stdout.write('Top defeating encounters:\n');
  for (const encounter of summary.topDefeatingEncounters) {
    process.stdout.write(
      `- ${encounter.label}: ${encounter.count} losses (avg floor ${encounter.averageFloor.toFixed(2)}, avg turns ${encounter.averageTurns.toFixed(2)})\n`,
    );
  }
}
process.stdout.write(`Errored runs: ${summary.erroredRuns}\n`);
process.stdout.write(`Saved: ${outputPath}\n`);

if (summary.erroredRuns > 0) {
  process.exitCode = 1;
}
