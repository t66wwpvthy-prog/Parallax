# Parallax — running notes / punch list

Durable backlog so nothing gets lost between sessions. Newest on top.

## Design — deferred
- **Inputs tab — escape the boxes-in-boxes grid.** Every planning tool uses the
  same rigid nested-card layout — clean but boring. Explore a freestyle / open
  input layout that doesn't feel like a tax form. (Idea, not yet specced.)
- **Scenarios "shared-track" redesign (BIG — own session).** Kill the 3-column
  boxes-in-boxes repetition. One shared horizontal track per lever: when all
  scenarios AGREE, show a single calm value; when one DIVERGES, it splits into
  colored dots (brass/slate/mauve) at their positions, with value labels above.
  Eye goes straight to the actual decision instead of scanning identical cells.
  On-doctrine (surfaces the interaction). Mock sketched & approved-in-spirit
  2026-05; NOT built — it's a ground-up rebuild of the Scenarios layout, do it
  deliberately in a focused session, not impulsively. Open Qs: how to edit a
  merged value (click to expand all three?), how dots behave on tap/drag,
  pension's @age sub-label.

## Design — done
- Top banner height reduced (ring 148→118px, smaller %, tighter min-height) so
  it no longer crowds the Retirement Age row.
- Scenarios block capped + centered (max-width 790px) so columns don't stretch
  across a wide monitor.

## Done recently
- Scenarios levers now have type-in boxes (not just sliders): Monthly Spending
  (renamed from Annual; stored annual, edited monthly), One-Time Event (amount +
  AGE both typeable), Savings/yr. Slider + box stay in sync.
- Removed the Scenarios line chart (redundant with the % circles + cash-flow
  drawer). A richer wealth-path visual is planned for the Sequencing tab. Shared
  chart helpers (axes/smoothPath) kept for the Sequencing chart.
- Verified full Scenarios lever sweep through the engine on the real base plan
  (age 58 / retire 65 / $205k / $30k sav → 97.8%): retire age, allocation,
  spend, one-time event, savings all behave. SS is wired correctly (benefit
  dollars exact: 62→$25.2k, 67→$36k, 70→$44.6k) but moves the % little here —
  honest: SS is a small lever for a high-spend household. OPEN: decide how to
  frame SS (lifetime-dollars trade-off vs the % circle).
- Pension mechanics: (1) per-household slider range — the pension slider now
  spans ONLY the ages with a quoted benefit (benefitByAge keys), so it can't
  wander onto a $0 age. Add a quote and the range grows. (2) Smart-default link
  — pension claim age tracks retirement age by default (clamped to the quoted
  range), but grabbing the pension slider frees it to hold any age. Verified in
  browser: follows, clamps, breaks free, stays free. (SS could reuse this later.)
- Seeded the engine's bootstrap RNG (mulberry32, fixed default seed) so the
  Monte Carlo success % is reproducible — no more ±1 drift on page refresh.
  Distribution unchanged; engine.test.js still 7/7.
- Result color language (on the light theme): strong = muted deep moss green
  (#194a2c), caution = bronze/gold (#9a7322), at-risk = deep burgundy (#8f3340).
  Applies to the % number, ring, deltas, and historical outcomes.
- Switched theme to "Light Report" (warm paper ground, dark slate ink, brass +
  slate accents). Fixed invisible gold-on-cream wordmark/tabs → dark ink.
- Enlarged the success rings so the % number fits cleanly (was clipping).
- Repo hygiene: untracked stray screenshot PNGs, restored broad *.png gitignore.

## Standing guidance
- Green is allowed — just **no mint green**.
- Don't call Nathan "buddy."
