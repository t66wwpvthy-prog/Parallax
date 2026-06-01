---
name: ship
description: Build the standalone, run engine tests, run the visual verify probe, commit, and push to BOTH the working branch AND main. The two-branch push is non-negotiable — GitHub Pages serves main, and a session ago we lost half a day because main was a stale upload while the branch had all the work.
---

# Ship

Use when a change is verified and ready to deploy.

## Steps (in order, abort on any failure)

1. **Build** — `node build-standalone.mjs` regenerates `index.html` + `parallax.html` from the source `parallax_v2.html`. The built files MUST be committed (Pages serves them).
2. **Engine tests** — `node --test engine.test.js`. Must be 13/13 pass. Engine is sacred.
3. **Visual verify** — `node scripts/verify.mjs`. Must exit 0. Screenshots land in `verify-out/`.
4. **Commit** — short title, body explains the WHY of the change. Include source file + built artifacts.
5. **Push to branch** — `git push -u origin <current-branch>`.
6. **Push to main** — `git push origin <current-branch>:main`. GitHub Pages serves `main` so the live site at https://t66wwpvthy-prog.github.io/Parallax/ updates from this push.

## Rule

If verify fails, FIX BEFORE PUSHING. The "I'll fix it in a follow-up" path is how we ship broken UIs.
