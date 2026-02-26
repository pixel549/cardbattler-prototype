import { createInitialState, dispatchGame } from "./game_core";

export function replayFromSeed(data, seed, actions) {
  let state = createInitialState();
  state = dispatchGame(state, data, { type: "NewRun", seed });
  for (const a of actions || []) {
    state = dispatchGame(state, data, a);
  }
  return { finalState: state, actionsApplied: (actions || []).length };
}
