# HANDOFF — Goals priority board (sage), approved design

**Date:** 2026-06-04 · **Working branch:** `claude/gifted-feynman-X1wqg`.

## Status: design APPROVED by Nathan ("stunning"), not yet wired into the live app.
The approved Goals-tab redesign is saved as a tracked prototype: **`goals-board.html`**
(self-contained, static demo data, no engine). Open it in a browser — cards drag and
the interaction is live.

## What the design is (all screenshot-verified at 5760×3240)
The Goals tab as a **priority board**, built on the REAL app chrome (PARALLAX header +
NET WORTH · CASH FLOW · GOALS · SNAPSHOT sub-tabs), on the **live sage glass theme**
(`#1e3d2b` ground, copper `#fb8d26` accent, faint 64px grid):
- **Commanding header** — `$22,000 / year` annual goal spend as a big copper hero,
  "today's dollars · $40,000 one-time planned" under it. Add-a-goal + legend top-right.
- **Priority axis** down the left (Must fund ↑ / ↓ If we can) — card height = priority.
- **Ghost slots** — 6 faint dashed rectangles with rank numbers, barely visible when
  empty; a slot lights copper as a card nears and **absorbs** it on drop (snap + flash).
- **Tray on the RIGHT** ("Goals to place") holds the cards at start — no slot is
  pre-occupied, so nothing conflicts on load.
- **Cards** are compact sage-glass with a fading **copper left border**; the one-time
  goal (New car) is a distinct copper-tinted card with a "ONE-TIME" tag.
- **Swap, not bounce** — dropping on a filled slot displaces the resident card to the
  dragged card's old slot (or back to its tray home).
- Smooth drag + snap (cubic-bezier), the movement Nathan called out as feeling right.

Content is OUR real `plan.goals` (Travel $12K/yr, Home improvements $5K/yr, Gifts
$5K/yr — all 65–95; New car $40K one-time at 72 → annual goal spend $22K). The board is
a VIEW of those entries — no new math.

## ⚠️ Branch hazard — read before shipping
The branches have DIVERGED. **Do not push this branch to `main`** without reconciling:
- `origin/main` = **sage** theme (`Re-theme to light sage glass` + `Brighter sage ground`)
  — this is what GitHub Pages serves live.
- This branch `claude/gifted-feynman-X1wqg` = still the **old Aurora bronze** theme, and
  carries 3 commits main lacks (incl. `c42bd52` Cash Flow Goals column).
- Pushing this branch to main as-is would **roll the live site back off sage.**

Reconcile path (next session): bring this branch up to `origin/main` (rebase/merge so it
gets the sage theme + the code-audit), confirm the Cash Flow Goals column survives, THEN
wire the board into the live Goals view.

## Next step — wire it into the live app
The live Goals view renders into `#np-content` (inside `.page[data-page="net-worth"]`
under `.subnav`), currently the **ledger** (RECURRING table + ONE-TIME + annual spend).
Replace that with the priority board:
1. Reconcile branch to sage `main` first (see hazard above).
2. Port `goals-board.html`'s board markup/CSS/JS into `parallax_v2.html`, reading real
   `plan.goals` instead of the hardcoded demo array; map recurring→/yr, one-time→tag.
3. `node scripts/verify.mjs` (now renders at 5760×3240), LOOK at the shots.
4. Build + ship to BOTH branches (`/ship`).

## Verify (mock-first; LOOK at pixels)
`verify.mjs` now captures at 1920×1080 @ 3× = **5760×3240**. The throwaway shot harnesses
(`_shot_*.mjs`, gitignored) drive `goals-board.html` / the live `index.html` at the same
fidelity; outputs land in `verify-out/` (gitignored).

## Principles Nathan is ingraining (surface them when relevant)
- **Verify by pixels, not assumptions** — logic checks lie; render and look before claiming.
- Mock-first → screenshot → approve → then touch the live HTML.
- Engine is the single truth source; the UI only views/levers it, never new math.
- Push to BOTH the working branch and `main` (Pages serves `main`) — but NOT before the
  branch is reconciled to sage.
