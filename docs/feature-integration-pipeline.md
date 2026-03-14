# Feature Integration Pipeline

This repo now keeps a checked-in feature integration manifest at [`docs/feature-pipeline.json`](./feature-pipeline.json).

The goal is simple: when we add a new system, we explicitly decide how it retrofits into the rest of the game instead of relying on memory. That includes tutorials, tests, meta progression, audio, narrative hooks, and debugging surfaces.

## How to use it

1. Add a new feature entry or update an existing one in [`docs/feature-pipeline.json`](./feature-pipeline.json).
2. Link the files that own the feature so future edits know where to start.
3. Fill out every touchpoint with one of:
   - `done`
   - `planned`
   - `blocked`
   - `n/a`
4. Add a short note for each touchpoint so the next pass knows what “done” or “planned” actually means.
5. Run `npm run validate:feature-pipeline`.

## Status rules

- `active`: the feature exists, but retrofit work is still allowed to be `planned` or `blocked`
- `live`: the feature is treated as fully integrated, so every touchpoint must be `done` or `n/a`
- `deprecated`: the feature remains documented for history, but should not guide new work

## Touchpoint intent

- `tutorials`: guided teaching, glossary, onboarding, first-time surfacing
- `ui`: visibility, state readability, affordances, failure feedback
- `content_balance`: encounter tables, tuning hooks, generated content, balance implications
- `ai`: autoplay, encounter logic, enemy reactions, systemic consumers
- `progression`: unlocks, save data, run history, dailies, persistent state
- `telemetry`: logs, debug traces, counters, balance diagnostics
- `tests`: unit and integration coverage for the risky logic
- `audio`: sound effects, music triggers, or stronger sensory feedback
- `narrative`: NPC reactions, worldbuilding, atmosphere, story framing
- `docs`: contributor-facing instructions for extending the system safely

## Enforcement

- [`tools/check_feature_pipeline.cjs`](../tools/check_feature_pipeline.cjs) validates the manifest.
- `npm run build` and CI both run the validator.
- If a feature is marked `live`, any remaining `planned` or `blocked` touchpoints fail validation.
- Active features are allowed to carry retrofit backlog, but the validator prints those follow-ups every run.

## Retrofit hotspots

When a new combat mechanic changes how a run feels, check these files immediately:

- [`src/game/tutorial.js`](../src/game/tutorial.js) for guided onboarding or pressure-system follow-up lessons
- [`src/game/aiPlayer.js`](../src/game/aiPlayer.js) so autoplay, shop logic, rest logic, and deck-targeting keep exercising the new mechanic
- [`tests/tutorial.test.js`](../tests/tutorial.test.js) and [`tests/aiPlayer.test.js`](../tests/aiPlayer.test.js) for baseline regression coverage on the retrofit

Those three surfaces are where new systems most often drift out of sync with the rest of the game.

## Run-mode composition

When you touch launch flow or progression tuning, remember that run config is layered, not flat:

1. [`RUN_BASELINE`](../src/game/runProfiles.js) defines the default economy and combat shell.
2. Custom run fields seed the editable baseline values.
3. Starter profile modifiers apply next.
4. Difficulty modifiers apply after the profile.
5. Enabled challenge modifiers stack last.

That order lives in [`composeRunConfig`](../src/game/runProfiles.js). If a new mode or modifier source is added, update both the code and the Progress archive so players can see why a profile or unlock state changed.

## Directive ownership

Boss and encounter directive work is split across a few specific homes:

- [`src/game/combatDirectives.js`](../src/game/combatDirectives.js) owns directive definitions, readouts, and counterplay text
- [`src/game/engine.js`](../src/game/engine.js) owns the runtime behavior and combat flags that make those directives real
- [`src/game/bossIntel.js`](../src/game/bossIntel.js) owns archive framing and future-planning surfaces
- [`tests/bossDirectives.test.js`](../tests/bossDirectives.test.js) is the first regression stop whenever directive text or thresholds change

If new boss mechanics land in only one of those surfaces, the archive and combat UI drift apart quickly.

## Suggested habit

When a mechanic lands, do not ask “is the code done?”

Ask:

- Does the player learn it?
- Does the UI explain it?
- Does AI react to it?
- Does progression remember it?
- Can we debug it later?
- Do we have at least one test protecting it?
- Does it need sound or narrative framing?

If the answer is “not yet”, it belongs in the pipeline entry before the work leaves your head.
