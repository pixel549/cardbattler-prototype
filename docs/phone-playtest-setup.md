# Phone Playtest Setup

This setup does not let Codex physically tap your phone.
What it does do is capture real touch-driven sessions from your phone and save them back into this workspace so they can be inspected after you play.

## What was added

- `npm run playtest:dev`
  Starts the app on the LAN with a live dev server.
- `npm run playtest:preview`
  Builds the app and serves a LAN preview build.
- `playtest_sessions/`
  Real phone playtest logs are written here as JSON files.
- In-app `Phone playtest mode`
  Toggle it from Settings / Pause Menu.

## How to use it

1. On the PC, run `npm run playtest:dev`
2. Open the LAN URL that Vite prints on your phone
3. Turn on `Phone playtest mode` in Settings if it is not already on
4. Play normally on the phone
5. The app will auto-upload captured sessions to `playtest_sessions/`

## Best URL shape

If you want the mode enabled immediately on first load, use a URL with `?playtest=1`.

Example:

```text
http://192.168.x.x:5173/?playtest=1
```

## What gets recorded

- Touch-targeting flow events in combat
- Armed target state, self-target use, enemy dossier opens, and card dispatches
- Viewport/device metadata
- Small combat state snapshots and recent log tails

## What Codex can do with it

- Read the generated session files
- Reconstruct what happened in the touch flow
- Spot missed double taps, blocked targets, accidental info opens, and layout issues tied to phone viewport state

## Current limitation

This is still not a live remote-control setup.
Codex can inspect real phone playtest data after or during a session, but cannot physically operate the handset itself.
