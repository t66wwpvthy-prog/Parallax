# AGENTS.md

## Cursor Cloud specific instructions

Parallax is a static, single-page web app: `index.html` (UI) imports the financial
engine from `engine.js` as an ES module, styled by `styles/*.css` with helpers in
`ui/*.js` and additional logic under `src/`. There is no backend or database — the
"application" is the static site, and all financial truth lives in `engine.js`
(see `README.md` and `PRINCIPLES.md`).

Standard commands live in `package.json` and `README.md`; use those. Key ones:

- `npm test` — Node test suite (engine + tax rules). Fast, no browser needed.
- `node scripts/verify.mjs` — full visual verification: runs `npm test`, serves the
  repo, drives headless Chrome through `index.html`, writes screenshots to
  `verify-out/`. Run this before claiming UI work is done.
- `node scripts/preview.mjs` — dev server for manual browsing. Serves the repo at
  `http://127.0.0.1:8825/` (override with `PORT`/`HOST`). `index.html` must be served
  over HTTP, not opened via `file://`, because it loads `engine.js` as a module.

Non-obvious caveats:

- `scripts/verify.mjs` only finds Chrome via `PUPPETEER_EXECUTABLE_PATH` or a few
  hard-coded paths — it does NOT auto-discover the puppeteer download cache. Run it as:
  `PUPPETEER_EXECUTABLE_PATH="$(find ~/.cache/puppeteer -name chrome -type f | head -1)" node scripts/verify.mjs`
- `npm ci` downloads Chrome for Puppeteer automatically (postinstall); no extra system
  browser is required for verification.
- There is no lint step configured in this repo.
- The app persists scenarios to `localStorage`; `verify.mjs` clears it on load to get a
  deterministic demo seed. When testing manually, a stale browser store can replace the
  demo seed, so clear site data if scenarios look unexpected.
