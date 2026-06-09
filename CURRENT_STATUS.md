# Current Status

Date: 2026-06-09

## Active Definition

Parallax is an advisor-led retirement decision simulator that uses one protected
engine to show how client choices behave across simulated and real historical
market paths.

The active product surfaces are Household / Plan, Scenarios, Sequencing, and
Cash-flow detail.

## Current Repo State

- `index.html` is the likely GitHub Pages entry file.
- `parallax_v2.html` is the source UI shell.
- `parallax.html` and `index.html` are generated standalone builds.
- `engine.js` is protected and was not changed by the cleanup.
- Old project-memory docs and static demo artifacts live under `archive/`.
- Positioning and prior-art materials live under `docs/positioning/`.

## Verification Status

Before shipping any branch to `main`:

1. Run `npm ci` if dependencies are missing or stale.
2. Run `npm test`.
3. Run `node scripts/verify.mjs`.
4. Review the generated screenshots in `verify-out/`.
5. Open the app locally and verify the main surfaces render without console
   errors.

## Manual Checks

- Household / Plan inputs render and accept edits.
- Scenario success rings calculate.
- Changing one scenario lever changes only that scenario.
- Goals board edits persist and rerun scenarios.
- Goal rank is visually preserved but does not pretend to change math.
- Sequencing uses the selected scenario, not only baseline allocation.
- Cash-flow drawer has rows and is not blank.
- RMD rows appear after age 73 when traditional balance exists.
- Healthcare does not move when the lifestyle spending lever changes.
