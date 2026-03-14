import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { getEarlyCombatRecovery, makeCardRewards } from "../src/game/game_core.js";

const require = createRequire(import.meta.url);
const data = require("../src/data/gamedata.json");

function isStabilityCard(defId) {
  const card = data.cards?.[defId];
  const text = (card?.effects || [])
    .filter((effect) => effect?.op === "RawText" && effect.text)
    .map((effect) => effect.text)
    .join(" | ");
  return /\bRAM\b/i.test(text)
    || /\bDraw\b/i.test(text)
    || /\bScry\b/i.test(text)
    || /\bGain\s+\d+\s+Firewall\b/i.test(text)
    || /\bHeal\b/i.test(text)
    || /\bThe next card you play costs -1 RAM\b/i.test(text);
}

test("early act 1 combat rewards always include one stabilizer option", () => {
  for (let seed = 1; seed <= 64; seed += 1) {
    const reward = makeCardRewards(data, seed, 1, "Combat", { floor: 6 });
    assert.ok(Array.isArray(reward.cardChoices));
    assert.ok(
      reward.cardChoices.some((defId) => isStabilityCard(defId)),
      `expected a stabilizer reward for seed ${seed}, got ${reward.cardChoices.join(", ")}`,
    );
  }
});

test("early combat recovery grants extra HP on act 1 normal floors only", () => {
  assert.deepEqual(getEarlyCombatRecovery({ act: 1, floor: 1 }, "Combat"), { hp: 6 });
  assert.deepEqual(getEarlyCombatRecovery({ act: 1, floor: 3 }, "Combat"), { hp: 4 });
  assert.deepEqual(getEarlyCombatRecovery({ act: 1, floor: 5 }, "Combat"), { hp: 2 });
  assert.equal(getEarlyCombatRecovery({ act: 1, floor: 7 }, "Combat"), null);
  assert.equal(getEarlyCombatRecovery({ act: 1, floor: 3 }, "Elite"), null);
  assert.equal(getEarlyCombatRecovery({ act: 2, floor: 3 }, "Combat"), null);
});
