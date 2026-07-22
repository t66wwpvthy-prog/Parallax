# Parallax agent instructions

## Authority

Read these before any feature, fix, or refactor:

1. `PRINCIPLES.md` — product doctrine and what belongs in Parallax.
2. `docs/ARCHITECTURE.md` — repository layout and code ownership.
3. `README.md` and `package.json` — current commands and shipping behavior.

If they conflict, that order wins. Tool-specific files may add tool mechanics, but they must not restate or change product or architecture doctrine.

## Clean-work rule

- Do not commit directly to `main`.
- Before editing, confirm the absolute worktree path, branch, base commit, and `git status --short`.
- If a checkout contains unrelated or uncommitted work, do not switch, stash, reset, clean, or build on it. Create a dedicated worktree from the approved base.
- Keep one bounded purpose per branch. Do not mix opportunistic cleanup, redesign, or unrelated feature work into the task.
- Preserve user changes. Never transplant a historical branch or whole file into current `main` without a current-tree comparison.

## Architecture boundaries

- `index.html` is markup only and loads one module entry: `src/main.js`.
- Keep `src/main.js` to boot, orchestration, and listeners; extract feature logic when an area is touched.
- `engine.js` owns simulation truth.
- `src/tax/` owns federal tax rules and must not import `engine.js`.
- `src/planning/tax/` connects planner rows to tax inputs; it does not own tax-law math.
- `ui/*` renders and collects inputs; it must not invent engine or tax results.
- Reuse existing helpers. Do not add dependencies without explicit approval.

## Verification

- Engine, planning, or tax changes: `npm test`.
- UI, `src/main.js`, `index.html`, or CSS changes: `npm test` and `node scripts/verify.mjs`.
- Documentation-only changes: inspect links, paths, and commands for consistency; tests are optional.

Do not claim completion from static checks alone when rendered behavior changed.
