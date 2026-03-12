let gameDataPromise = null;

/**
 * Load the compiled game data bundle.
 *
 * The data stays behind a Promise so the app can preload it as a separate
 * chunk without changing the existing call sites.
 *
 * @returns {Promise<object>} A promise that resolves with the game data.
 */
export function loadGameData() {
  if (!gameDataPromise) {
    gameDataPromise = import('./gamedata.json')
      .then((module) => module.default ?? module);
  }
  return gameDataPromise;
}
