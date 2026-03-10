# Combat Targeting QoL Record

The tap-plus-double-tap targeting model on `codex/combat-targeting-experiment` is the current plan.
This note exists so we can keep the useful improvements even if we later compare it against the older control scheme again.

## Implemented on the experiment branch

- First-tap target arming is now visible instead of hidden in timing logic.
  The focused enemy card and the player panel both show when they are armed for a cast.
- Focused enemy intel now shows `READY`, `ARMED`, or `BLOCKED` when a card is selected.
  Blocked states also explain why the card cannot fire at that enemy.
- The centered card now shows a targeting helper strip on mobile.
  It explains whether the player should arm a target, double tap immediately, or why the play is blocked.
- Self-target casts now mirror the same feedback as enemy casts.
  The player HUD can show a ready state and a short-lived armed state.
- The slower second enemy tap still opens the full enemy dossier, and the combat UI now calls that out more clearly.

## Portable improvements if we test the old controls again

- The enemy dossier and expanded focused-enemy panel should stay.
- The playability reason text should stay, even if casting goes back to a single tap.
- The mobile helper strip under the centered card should stay.
- The player self-target status cue should stay.
- `READY` and `BLOCKED` target states would still help even with a legacy tap-to-play flow.

## Good next QoL candidates

- Add a short first-combat onboarding overlay for the new controls, separate from the full tutorial.
- Add distinct haptic or audio feedback for `arm`, `cast`, and `inspect`.
- Draw a subtle target line or reticle from the centered card to the armed target on phone.
- Add an accessibility setting for a slightly longer double-tap window while testing.
- Add an A/B testing setting that swaps between the new targeting flow and the legacy one without changing branches.
- Explore a temporary one-card target lock for combo turns where the player wants to fire multiple cards at the same enemy.
