# CardBattler

CardBattler is a React + Vite roguelike deckbuilder prototype with a data-driven combat engine, generated game content, and a heavy debug/playtest surface for AI and manual balancing.

## Commands

- `npm run dev`: rebuild content, validate assets, then start the Vite dev server
- `npm run build`: rebuild content, validate it, validate runtime art, then produce a production bundle
- `npm test`: run the baseline Node test suite
- `npm run validate:feature-pipeline`: validate the retrofit checklist for major systems
- `npm run analyze:runs`: inspect archived AI run exports

## Content pipeline

The source-of-truth spreadsheets live in [`content_src/`](content_src).
The build step converts those CSV files into [`src/data/gamedata.json`](src/data/gamedata.json) via [`tools/build_content.cjs`](tools/build_content.cjs).

The content builder now:

- validates duplicate IDs in CSV-backed tables before generating output
- keeps `builtAt` stable when the semantic content has not changed
- skips rewriting `src/data/gamedata.json` when the generated payload is already up to date

## Tests

The project now includes a small baseline `node --test` suite under [`tests/`](tests) covering:

- run profile and difficulty composition
- meta-progression unlock tracking
- CSV parsing and generated-content safeguards
- tutorial onboarding flow for the new pressure-systems lesson
- autoplay integration for forge/scrap and pressure-aware combat states
- feature pipeline validation

It is still only a starting point, but it gives refactors a real safety net where there previously was none.

## Feature integration pipeline

Major player-facing systems are tracked in [`docs/feature-pipeline.json`](docs/feature-pipeline.json).

This is the retrofit checklist for the project: when a new mechanic lands, we explicitly decide how it connects to tutorials, UI, balance/content, AI, progression, telemetry, tests, audio, narrative, and docs.

- Use [`docs/feature-integration-pipeline.md`](docs/feature-integration-pipeline.md) for the workflow.
- `npm run validate:feature-pipeline` validates the manifest.
- `npm run build` and CI both run the validator.
- Features marked `live` must have every touchpoint resolved as `done` or `n/a`.

## Notes

- The current app remains heavily centered around [`src/App.jsx`](src/App.jsx) and [`src/components/CombatScreen.jsx`](src/components/CombatScreen.jsx).
- Production deploys should always use `npm run build` so the generated data stays in sync with `content_src`.
