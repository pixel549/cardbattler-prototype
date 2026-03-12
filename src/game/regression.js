import { replayFromSeed } from "./replay.js";

export function runGolden(data, golden) {
  const { finalState } = replayFromSeed(data, golden.seed, golden.actions || []);
  const run = finalState.run;
  const deckSize = finalState.deck?.master?.length ?? 0;

  const ok =
    finalState.mode === golden.expected.mode &&
    (run?.hp ?? -1) === golden.expected.hp &&
    (run?.gold ?? -1) === golden.expected.gold &&
    deckSize === golden.expected.deckSize;

  return {
    ok,
    details: ok ? "OK" : `Mismatch: mode=${finalState.mode}, hp=${run?.hp}, gold=${run?.gold}, deckSize=${deckSize}`
  };
}
