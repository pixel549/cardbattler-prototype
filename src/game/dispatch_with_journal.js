import { dispatchGame } from "./game_core.js";

// A set of action types that should not be recorded into the journal.
// These actions represent UI-only transitions (such as opening or closing
// the deck view) which are not meaningful to replaying a run. Keeping
// them out of the journal prevents them from polluting replays.
const NON_REPLAYABLE = new Set(["OpenDeck", "CloseDeck"]);

/**
 * Dispatches a game action and records it into the journal if applicable.
 *
 * This helper wraps the core {@code dispatchGame} function to ensure that
 * actions which should be replayable are persisted into the runâ€™s journal.
 * Certain UI-only actions (defined in {@link NON_REPLAYABLE}) are ignored so
 * that things like opening and closing the deck donâ€™t pollute the journal.
 *
 * @param {object} state - The current game state
 * @param {object} data - Static game data (cards, encounters, etc.)
 * @param {object} action - The action being dispatched
 * @returns {object} The next game state after applying the action
 */
export function dispatchGameRecorded(state, data, action) {
  // Delegate to the core game dispatcher first.
  const next = dispatchGame(state, data, action);
  // Only append to the journal if it exists and the action is replayable.
  if (next?.journal && !NON_REPLAYABLE.has(action?.type)) {
    next.journal.actions.push(action);
  }
  return next;
}

// Alias dispatchGameRecorded as dispatchWithJournal for backward compatibility.
// Some parts of the UI import { dispatchWithJournal } from this module. By
// exporting this alias we avoid breaking those imports without duplicating
// code.
export const dispatchWithJournal = dispatchGameRecorded;
