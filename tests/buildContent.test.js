import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assertUniqueField,
  parseCsv,
  preserveBuiltAtWhenContentUnchanged,
  rowsToObjects,
  writeJson,
} = require('../tools/build_content.cjs');

test('parseCsv keeps quoted commas and embedded line breaks intact', () => {
  const csv = 'id,name,notes\nA,"Alpha, Inc.","Line 1\nLine 2"\n';
  const rows = parseCsv(csv);

  assert.deepEqual(rows, [
    ['id', 'name', 'notes'],
    ['A', 'Alpha, Inc.', 'Line 1\nLine 2'],
  ]);
  assert.deepEqual(rowsToObjects(rows), [
    { id: 'A', name: 'Alpha, Inc.', notes: 'Line 1\nLine 2' },
  ]);
});

test('assertUniqueField rejects duplicate IDs before content generation', () => {
  assert.throws(
    () => assertUniqueField([{ id: 'CARD-001' }, { id: 'CARD-001' }], 'cards.csv', 'id'),
    /Duplicate id "CARD-001" in cards\.csv/,
  );
});

test('preserveBuiltAtWhenContentUnchanged keeps prior build metadata when payload matches', () => {
  const previous = {
    builtAt: '2026-03-10T12:00:00.000Z',
    cards: { A: { id: 'A', name: 'Ping' } },
  };
  const next = {
    builtAt: '2026-03-12T12:00:00.000Z',
    cards: { A: { id: 'A', name: 'Ping' } },
  };

  const normalized = preserveBuiltAtWhenContentUnchanged(previous, next);
  assert.equal(normalized.builtAt, previous.builtAt);
});

test('writeJson skips rewriting files when content is unchanged', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbattler-build-content-'));
  const outputPath = path.join(tempDir, 'gamedata.json');

  const first = writeJson(outputPath, { cards: { A: { id: 'A' } } });
  const second = writeJson(outputPath, { cards: { A: { id: 'A' } } });

  assert.equal(first.written, true);
  assert.equal(second.written, false);
  assert.equal(
    fs.readFileSync(outputPath, 'utf8'),
    JSON.stringify({ cards: { A: { id: 'A' } } }, null, 2),
  );
});
