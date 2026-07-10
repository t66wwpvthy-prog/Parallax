# AGENTS.md

## Architecture (read first)

**Before any feature or refactor, read `docs/ARCHITECTURE.md` and `PRINCIPLES.md`.**

Parallax is a static ES-module app. **No new monoliths.**

| File | Role |
|------|------|
| `index.html` | Markup only (~250 lines). One script: `src/main.js`. **Do not add JS here.** |
| `src/main.js` | Boot, `runAll`, listeners. **Keep thin** — extract new logic to `ui/*` or `src/household/` / `src/scenarios/`. |
| `src/state.js` | Mutable UI state (scenarios, replay, solver flags). No render/DOM. |
| `ui/*.js` | View modules (household, goals, scenarios, cashflow, sequencing, solver, …). Display only. |
| `engine.js` | Simulation truth. Test-guarded. Only place for wealth/path/bucket math. |
| `src/tax/` | Federal 1040 engine. Never imports `engine.js`. |
| `src/planning/tax/` | Glue: engine rows → tax input; typical-path attach. |

**Decision tree:** see `docs/ARCHITECTURE.md` § "Where new work goes".

**If ~50+ lines would land in `src/main.js`:** extract a module in the same change.

---

## Cursor Cloud specific instructions

Parallax is a static, single-page web app: `index.html` (markup) loads `src/main.js`, which wires the UI to `engine.js`. Styled by `styles/*.css`. Helpers in `ui/*.js`, orchestration in `src/`, tax in `src/tax/`. No backend or database.

Standard commands live in `package.json` and `README.md`:

- `npm test` — Node test suite (engine + tax rules). Fast, no browser needed.
- `node scripts/verify.mjs` — full visual verification: runs `npm test`, serves the repo, drives headless Chrome through `index.html`, writes screenshots to `verify-out/`. **Required before claiming UI work is done.**
- `node scripts/preview.mjs` — dev server at `http://127.0.0.1:8825/` (`PORT`/`HOST`). Must use HTTP, not `file://`.

Non-obvious caveats:

- `scripts/verify.mjs` scans `index.html` for markup and `index.html` + `src/**/*.js` + `ui/**/*.js` for JS symbols.
- `verify.mjs` Chrome discovery: `PUPPETEER_EXECUTABLE_PATH` or hard-coded paths — not puppeteer cache auto-discovery.
- `npm ci` postinstall downloads Chrome for Puppeteer.
- No lint step configured.
- `localStorage` persists scenarios/households; `verify.mjs` clears it for deterministic runs. Clear site data if manual testing looks wrong.

---

## Session handoff (paste when context is heavy)

```
PARALLAX — read docs/ARCHITECTURE.md. index.html = markup only. main.js = thin boot.
Truth: engine.js (sim), src/tax/ (federal). Views: ui/*. No math in UI. No tax in engine.
npm test for engine/tax; + verify.mjs for UI. Extract from main.js if >50 lines.
```
