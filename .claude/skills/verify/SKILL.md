---
name: verify
description: Build the standalone, run the engine tests, drive headless Chromium through the real built index.html, and capture screenshots of every page state. Use this before claiming a UI/visual task is done — logic checks lie, pixels don't. The cash-flow drawer shipped at 2-pixel height for ~10 messages because nobody looked at the rendered DOM.
---

# Verify

Single source of truth for "is the app actually working." Runs:

1. `node build-standalone.mjs` — produces the deployed `index.html`.
2. `node --test engine.test.js` — engine guard tests must pass.
3. Spins a static server on port 8765 and points headless Chromium at it.
4. Loads each page, exercises cash-flow and sequencing, captures screenshots.
5. Asserts the rendered DOM matches expectations (cash-flow has rows AND height,
   sequencing chart has paths). Fails loudly if not.

Screenshots land in `./verify-out/`:

- `01-balance-sheet.png` — Net Worth / Balance Sheet
- `02-cashflow.png` — Net Worth / Cash Flow
- `02-goals.png` — Net Worth / Goals priority board
- `02-snapshot.png` — Net Worth / Snapshot
- `03-scenarios.png` — scenarios tab with circles + levers
- `04-cashflow.png` — scenarios tab with cash-flow drawer open
- `05-sequencing.png` — sequencing chart with all chips enabled
- `06-property.png` — property card detail

## When to invoke

- **Before** reporting a UI/visual change as done. Always.
- After touching `engine.js` or anything the engine consumes.
- Before pushing to main.

## How to run

```bash
node scripts/verify.mjs
```

Exit 0 = green, screenshots ready to send. Exit non-0 = something's broken;
read the error and the screenshot directory before claiming a fix.
