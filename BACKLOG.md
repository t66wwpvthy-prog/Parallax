# Backlog

This is a parking lot for unresolved product and modeling questions, not build
authority or permission to add a feature. Keep only items that can plausibly pass
`PRINCIPLES.md`; move an approved item into one bounded task and remove it here
when resolved. Newest items go at the top of each section.

Format: `- [YYYY-MM-DD] short description (why / context)`

## Ideas / features
- [2026-07-12] Decide whether to restore or replace the missing Sequencing advisor
  playback capabilities: retirement-year verdict, same-sequence withdrawal-order
  comparison, lifetime-tax comparison, and expandable year-by-year engine rows.
  Track those behaviors separately from visual styling; prior removal is not a
  final product decision and no historical branch should be restored wholesale.
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
- [2026-07-10] Thin `src/main.js` — continue extracting bounded seams alongside
  feature work. Reuse the existing `src/household/persistence.js`, `commit.js`, and
  `wizard.js`; do not run a standalone refactor sprint.
- [2026-07-10] Tax accuracy gaps — derive the next bounded gap from current tests,
  current tax contracts, and an approved product need. Do not resume a branch or
  worktree named by a dated handoff.
- [2026-07-10] Asset-class bucketing — reconcile the surviving branch evidence with
  current engine and tax boundaries before choosing an implementation scope.

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
