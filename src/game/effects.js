import { applyEffectOp as _applyEffectOp } from "./engine.js";

/**
 * Wrapper: player plays a card -> sourceId = "player"
 */
export function applyPlayerEffect(state, op, rng) {
  return _applyEffectOp(state, "player", op, rng);
}
