import assert from 'node:assert/strict';
import test from 'node:test';

import { getFixerLine } from '../src/game/narrativeDirector.js';

test('getFixerLine reacts to high elite failure pressure in the archive', () => {
  const line = getFixerLine({
    mode: 'telemetry',
    runAnalytics: {
      totalRuns: 6,
      firstEliteLossRate: 0.67,
    },
  });

  assert.match(line, /elite/i);
  assert.match(line, /RAM|opening/i);
});

test('getFixerLine reacts to dangerous combat states', () => {
  const line = getFixerLine({
    mode: 'combat',
    run: {
      hp: 12,
      maxHP: 50,
      telemetry: { peakHeat: 15 },
      starterProfileName: 'Ghost',
      scrap: 1,
    },
  });

  assert.match(line, /Trace|hot|turn/i);
});
