# Visual QA

This repo now has a lightweight visual smoke-test path for inspecting real UI states without needing an Android emulator or a desktop browser session you have to steer manually.

## What it does

- Adds stable `?scene=` entry points for key menu and tutorial surfaces.
- Starts a local preview build.
- Uses a fresh Microsoft Edge profile in headless mode to capture screenshots for those scenes.
- Writes the images and a manifest to `artifacts/visual-smoke/`.

## Run it

```bash
npm run visual:capture
```

That command builds the app first, then captures the current scene set.

## Scene URLs

You can also open any scene directly in a browser while the app is running:

- `/?scene=menu-home`
- `/?scene=menu-setup`
- `/?scene=menu-tutorials`
- `/?scene=menu-daily`
- `/?scene=menu-intel-progress`
- `/?scene=menu-intel-achievements`
- `/?scene=menu-intel-bosses`
- `/?scene=menu-intel-callsigns`
- `/?scene=menu-recovery`
- `/?scene=tutorial-basics-combat`
- `/?scene=tutorial-run-modes-menu`
- `/?scene=tutorial-boss-combat`
- `/?scene=tutorial-pressure-combat`
- `/?scene=tutorial-instability-event`
- `/?scene=tutorial-instability-picker`
- `/?scene=tutorial-complete`

Menu scenes deliberately ignore autosaves so captures stay stable instead of reflecting whatever run happened last.

## Browser selection

The capture script looks for Microsoft Edge at the standard Windows install paths. If you want to use another Chromium-based browser, set:

```powershell
$env:CARD_BATTLER_BROWSER="C:\path\to\browser.exe"
```

## Why this instead of an emulator

For visual regression checks, layout review, and quick smoke passes, the browser build is already the real product surface. Stable scene URLs plus screenshots give us a repeatable baseline faster than introducing an emulator stack or a second app shell.
