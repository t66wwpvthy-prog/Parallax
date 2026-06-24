# AGENTS.md

## Cursor Cloud specific instructions

Parallax is a single, fully client-side static web app (vanilla JS ES modules, no
framework/bundler). The financial engine (`engine.js`) is the only source of truth;
the UI in `index.html` + `ui/` only collects inputs and renders engine output. There
is no backend, database, or external service.

Standard commands live in `README.md` and `package.json` `scripts`. Notes that are
non-obvious in this environment:

- **Serve over HTTP, never `file://`.** `index.html` imports `engine.js` as an ES
  module, so it must be served. Run the app with `npm run preview` (serves at
  `http://127.0.0.1:8825/`, override with `HOST`/`PORT`). This is a long-running
  server — start it in a background/tmux session, not as a blocking foreground call.
- **Visual verification needs an explicit Chrome path.** `node scripts/verify.mjs`
  (runs `npm test`, then drives headless Chromium through the real UI and writes
  screenshots to `verify-out/`) only auto-detects Chrome at hardcoded paths that do
  NOT exist on this VM. Run it as
  `PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/google-chrome node scripts/verify.mjs`.
  Puppeteer also downloads its own Chrome to `~/.cache/puppeteer` during install if
  you prefer pointing at that instead.
- Node 22 is installed here; CI uses Node 20. The test suite (`npm test`, 166 tests)
  passes on both.
