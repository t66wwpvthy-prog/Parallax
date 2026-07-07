# Backlog — "need to adds"

A dead-simple parking lot for future iterations. Drop a one-line bullet whenever
something comes up mid-flow; don't stop to design it. No status columns, no
process — just capture it so it isn't lost. Move an item into a real task/PR when
you're ready to build it. Newest at the top of each section.

Format: `- [YYYY-MM-DD] short description (why / context)`

## Ideas / features
- [2026-07-07] Survivor / early-death modeling — a death-age event that, from that
  year on, cuts household expenses by a set % (survivor spends ~70–80%), drops the
  smaller of the two Social Security benefits, and flips filing status MFJ → Single,
  while the horizon stays at the survivor's plan-end age. Today plan-end age only
  shortens the horizon; it does NOT model a death (and misleadingly improves success).

## Per-spouse modeling (planned — keep the path easy)
- [2026-07-07] Per-spouse retirement ages as independent scenario levers. Input +
  engine already store/use each person's own retirement age; what's still single is
  the Scenarios `retireAge` lever (shifts both via `retireDelay`). Split it into two
  levers so each spouse can retire at a different age within a scenario. Do NOT add
  rules that assume one household retirement age.
- [2026-07-07] Per-spouse savings. Today savings is ONE household stream
  (`plan.savings.annual`, $30k/yr) that stops when the LAST spouse retires. Move to
  per-person contributions where each portion stops at that person's own retirement
  age. Keep the current single-stream comment in createDemoHousehold from hardening
  into an invariant.

## Tech debt / structure
- [2026-07-07] Dead-code audit of index.html (test-guarded). Confirmed retired code
  still shipping: `renderGoalsHorizon()` (~line 3317) + `initGoalsHorizon()` (~line
  3522) — replaced by `renderGoalsChapters()`, comment says "preserved below" (~280
  lines); and the "PRESERVED richer lever editor" grid (~line 4218, `buildLevers`
  slider/type-in grid) that is unmounted in the Scenarios redesign. Before deleting:
  grep each symbol for LIVE callers (buildLevers is still invoked and no-ops when
  #scn-levers is absent, so it needs care), remove in small commits, run full verify
  after each. Goal: cut genuine bloat, not relocate it.
- [2026-07-07] Modularize index.html (currently ~5,790 lines; a single
  <script type="module">). Split into native ES modules (NO bundler needed — the app
  already imports engine.js as ESM and is served statically). Proposed layout: state
  (household store + scenarios), config (LEVCFG/levRange), engine-bridge
  (leversToOverrides/planForScenario/runAll), views (household / goals / scenarios /
  sequencing / notes), main.js boot. KEY CAVEAT: verify.mjs static checks regex the
  index.html string for symbols (e.g. /function createDemoHousehold/) — those must be
  repointed to scan the module files, or they'll fail even though behavior is intact.
  Do dead-code audit FIRST, then extract leaf/pure modules, then shared-state module,
  then big views — one phase per commit, full verify between phases.

## Flexibility / "don't trap the input"
- [2026-07-07] Spending lever range is a fixed $80k–$360k window (LEVCFG `spend`).
  Low-spend households (e.g. a $48k/yr retiree) get clamped, so a "−10%" scenario
  can't be expressed. Make the spend lever range flex to the household like the
  retirement-age fix did.
- [2026-07-07] SS claim-age lever when a benefit is already claimed — likely moot
  for already-retired households (same class as the retirement-age-inert fix). Decide
  whether to make it inert too.

## Demo data (optional polish)
- [2026-07-07] Demo currently has $0 working income while pre-retirement (64/63) with
  $30k/yr savings. Consider adding realistic pre-retirement earnings for the two
  years before they retire, if we want the accumulation phase to look real.

## Done (for reference; prune when stale)
- [2026-07-07] Retirement age goes inert once the household is already retired
  (hidden from Scenarios levers, no engine effect). Shipped + tested.
- [2026-07-07] Multi-household persistence + demo/blank factories, per-household
  scoped scenarios, New/Switch/Reset-Demo controls. Shipped + tested.
