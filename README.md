# CardBattler (Logic + Debug Harness)

This zip contains the core game logic modules (run loop, combat engine, mutation/decay, encounters, relic hooks, save/replay)
plus a debug-first `src/App.jsx` that can drive the whole system.

## Expected paths
- `src/App.jsx`
- `src/game/*`
- `src/data/gamedata.json` (stub included)
- `tools/build_gamedata.py` (xlsx -> json converter)

## Quick boot
If you're using Vite React:
1) Drop `src/` into your project
2) Ensure your bundler can import JSON (Vite can)
3) Run dev server; open the debug UI
4) Click: New Run -> Resolve Node -> Combat controls

## Notes
- The data schema is defined by the JSON stub and `tools/build_gamedata.py`.
- Everything is intentionally data-driven and logged.
