---
name: ship
description: Build the standalone, run engine tests, run the visual verify probe, commit, and push to BOTH the working branch AND main. The two-branch push is non-negotiable — GitHub Pages serves main, and a session ago we lost half a day because main was a stale upload while the branch had all the work.
---

# Ship

Use when a change is verified and ready to deploy.

## Steps (in order, abort on any failure)

1. **Build** — `node build-standalone.mjs` regenerates `index.html` + `parallax.html` from the source `parallax_v2.html`. The built files MUST be committed (Pages serves them).
2. **Engine tests** — `node --test engine.test.js`. Must be ALL pass (currently 27/27). Engine is sacred.
3. **Visual verify** — `node scripts/verify.mjs`. Must exit 0. Screenshots land in `verify-out/`.
4. **Commit** — short title, body explains the WHY of the change. Include source file + built artifacts.
5. **Reconcile with main FIRST** — `git fetch origin main`, then `git merge origin/main` (or rebase onto it). This is the step that stops the half-day ghost: another session may have pushed work (a re-theme, a new feature) to main that your branch lacks. Skip it and force-push, and you SILENTLY DROP their work. After merging, re-run build + verify so the merged result is what ships.
6. **Push to branch** — `git push -u origin <current-branch>`.
7. **Push to main** — `git push origin <current-branch>:main`. After step 5 this is a clean fast-forward. GitHub Pages serves `main` so the live site at https://t66wwpvthy-prog.github.io/Parallax/ updates from this push.

## Rules

- If verify fails, FIX BEFORE PUSHING. The "I'll fix it in a follow-up" path is how we ship broken UIs.
- **NEVER force-push `main`.** If the push to main is rejected as non-fast-forward, main has commits you don't — STOP, go back to step 5 (fetch + merge), rebuild, re-verify, then push. A force-push to main drops whatever the other branch added. This exact mistake reverted the Goals board + healthcare work once already.
- Keep the canonical branches (`main`, `claude/laughing-einstein-*`, the active working branch) CONVERGED. If they've diverged, merge them to one superset before shipping — never let a branch ride as a stale subset, because the next push from it clobbers live work.
