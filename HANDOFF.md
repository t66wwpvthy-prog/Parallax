# HANDOFF — Goals priority board (sage), WIRED INTO THE LIVE APP

**Date:** 2026-06-04 · **Working branch:** `claude/gifted-feynman-X1wqg`.

## Status: WIRED IN. The Goals sub-tab now renders the approved board, live.
`parallax_v2.html` → Household → **Goals** is no longer the ledger; it's the priority
board, reading real `plan.goals` (recurring → /yr card, one-time → copper ONE-TIME
card). Hero sums the recurring goals (annual goal spend) + notes the one-time total.
Drag/snap/swap works. Screenshot-verified at 5760×3240 (`verify-out/02-goals.png`).
- New code in `parallax_v2.html`: `renderGoalsBoard()` + `initGoalsBoard()` + the
  `#np-content.g-mode` flex-fill + `.g-*` CSS; `SUB_PAGES.goals.layout='board'`;
  `renderInputs()` dispatches board + tears down the resize-observer on re-render.
- The approved standalone prototype **`goals-board.html`** is kept as a reference.

### ⚠️ Known gap — flag for Nathan (next step, NOT a bug)
The board is a VIEW + a prioritisation interaction. Cards are **not yet editable on
the board** (no inline name/amount/age edit), and the drag rank is **not persisted /
not fed to the engine** (the engine has no goal-priority lever). The old ledger's
inline editing is gone from the Goals tab. Goal amounts/ages can still be changed by
editing `plan.goals` — but the on-card edit affordance is the clear next build. The
old `renderHybrid('goals')` path + `recGoalRow`/`onceGoalRow` are now dead (harmless).

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

## Branch hazard — RESOLVED
The earlier Aurora-vs-sage divergence is reconciled: `origin/main` (sage) was merged
into this branch, the Cash Flow Goals column survived, and both branch + `main` ship
the sage theme. Keep pushing to BOTH (Pages serves `main`).

## Next step — make the board goals editable
The board is wired in as a VIEW. The natural follow-up: bring editing back ONTO the
board (inline name/amount/age on each card, or a quick edit affordance), so the Goals
tab is a full replacement for the old ledger — not just a prettier display. Optional:
persist the drag rank somewhere meaningful (today it's purely visual; the engine has no
goal-priority lever, so this is a product decision, not a wiring one).

## Verify (mock-first; LOOK at pixels)
`verify.mjs` now captures at 1920×1080 @ 3× = **5760×3240**. The throwaway shot harnesses
(`_shot_*.mjs`, gitignored) drive `goals-board.html` / the live `index.html` at the same
fidelity; outputs land in `verify-out/` (gitignored).

## Principles Nathan is ingraining (surface them when relevant)
- **Verify by pixels, not assumptions** — logic checks lie; render and look before claiming.
- Mock-first → screenshot → approve → then touch the live HTML.
- Engine is the single truth source; the UI only views/levers it, never new math.
- Push to BOTH the working branch and `main` (Pages serves `main`).
