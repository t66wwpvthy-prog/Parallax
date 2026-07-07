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
