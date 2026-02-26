import gamedata from "./gamedata.json";

/**
 * Single compiled bundle for the whole game.
 * Keep this as the only import point so swapping data sources is painless.
 */
/**
 * Load the compiled game data bundle.
 *
 * Some parts of the UI expect this function to return a Promise so that
 * they can call `.then()` on the result. To maintain backwards
 * compatibility with that behaviour, we wrap the static game data in a
 * resolved Promise. Returning a plain object would cause a TypeError
 * when `.then` is accessed on the object.
 *
 * @returns {Promise<object>} A promise that resolves with the game data
 */
export function loadGameData() {
  return Promise.resolve(gamedata);
}
