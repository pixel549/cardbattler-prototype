import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGameData, runAiSimulation } from './aiSimulationCore.mjs';

function parseArgs(argv) {
  const positional = [];
  const options = {};

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [rawKey, rawValue] = arg.slice(2).split('=');
      const key = rawKey.trim();
      const value = rawValue == null ? 'true' : rawValue.trim();
      options[key] = value;
    } else {
      positional.push(arg);
    }
  }

  const seed = Number(options.seed ?? positional[0] ?? Date.now());
  const playstyle = options.playstyle ?? positional[1] ?? 'balanced';
  const maxSteps = Number(options['max-steps'] ?? options.maxSteps ?? positional[2] ?? 5000);
  const starterProfileId = options.starter ?? options.starterProfile ?? 'kernel';
  const difficultyId = options.difficulty ?? 'standard';
  const challengeIds = String(options.challenges ?? '')
    .split(',')
    .map((challengeId) => challengeId.trim())
    .filter(Boolean);

  return {
    seed: Number.isFinite(seed) ? seed : Date.now(),
    playstyle,
    maxSteps: Number.isFinite(maxSteps) ? maxSteps : 5000,
    starterProfileId,
    difficultyId,
    challengeIds,
  };
}

function buildSummaryLines(record) {
  const lines = [
    'CARDBATTLER HEADLESS SIMULATION',
    '================================',
    `Seed: ${record.seed}`,
    `Playstyle: ${record.aiPlaystyleLabel}`,
    `Starter: ${record.starterProfileName}`,
    `Difficulty: ${record.difficultyName}`,
    `Outcome: ${record.outcome}`,
    `Act / Floor: ${record.finalAct} / ${record.finalFloor}`,
    `Final HP: ${record.finalHP}`,
    `Final Gold: ${record.finalGold}`,
    `Steps: ${record.steps}`,
    `Peak Heat: ${record.runTelemetry?.peakHeat ?? 0}`,
    `RAM-starved turns: ${record.runTelemetry?.ramStarvedTurns ?? 0}`,
    `Encounters: ${record.encounters?.length ?? 0}`,
  ];

  if (record.errors?.length) {
    lines.push('Errors:');
    for (const error of record.errors) lines.push(`- ${error}`);
  }

  if ((record.encounters?.length ?? 0) > 0) {
    lines.push('Encounter summary:');
    for (const encounter of record.encounters) {
      lines.push(
        `- Act ${encounter.act} Floor ${encounter.floor} ${encounter.nodeType}: ${encounter.result} in ${encounter.turns} turns (${encounter.enemies.join(', ')})`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = loadGameData(rootDir);
const result = runAiSimulation({
  data,
  seed: args.seed,
  playstyle: args.playstyle,
  starterProfileId: args.starterProfileId,
  difficultyId: args.difficultyId,
  challengeIds: args.challengeIds,
  maxSteps: args.maxSteps,
});

const outputText = buildSummaryLines(result);
const outTextPath = path.join(rootDir, 'sim-output.txt');
const outJsonPath = path.join(rootDir, 'sim-result.json');

fs.writeFileSync(outTextPath, outputText, 'utf8');
fs.writeFileSync(outJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

process.stdout.write(outputText);
process.stdout.write(`Wrote ${outTextPath}\n`);
process.stdout.write(`Wrote ${outJsonPath}\n`);

if (result.errors?.length) {
  process.exitCode = 1;
}
