# Parallax — running notes / punch list

Durable backlog so nothing gets lost between sessions. Newest on top.

## >>> NEXT SESSION (tonight): build #5 then #1 <<<
Order matters: saveable scenario objects first (clean foundation), then Solve-For
writes its answer INTO a scenario.

#5 — NAME / SAVE SCENARIOS (do first):
- Scenarios become named, saveable objects, not transient slider state. Baseline
  = anchor. This is the long-planned "household-centric data root."
- Both tabs read from this shared set; unlocks the Sequencing selector later.
- Scope check before coding: where do saved scenarios live (in-memory array now,
  localStorage later?), rename/duplicate/delete UI, how baseline stays special.
  Keep it minimal — don't build persistence machinery we don't need yet.

#1 — SOLVE FOR (do second): full spec below under "Big feature". DECIDE BEFORE
CODING: how you ARM the float lever (tap a lever to select it as the unknown?).
That interaction is the whole feature — nail it on paper first.


## Big feature — SOLVE FOR mode (NEXT — sharpened spec)
The "so what, everyone has scenarios" problem. Every tool runs FORWARD: move
levers → watch the %. That's a toy. The advisor's real job is BACKWARD:
"retire at 62 at 90% confidence — what spending does that take?" = SOLVE-FOR.
Client states the GOAL, engine finds the LEVER.

### Sharpened scope (revised 2026-06 after Nathan's eMoney + beach-house catch)
- NOT a generic "solve any lever" feature. That's a tech demo. The value is
  answering the 2-3 questions clients actually ask, and making the trade-off
  between them visible (Nathan's example: client wanted early retirement AND a
  $1M beach house — can't have both; advisor's job is showing why).
- Solve-For = a small palette of NAMED LIFE QUESTIONS:
  1. "Can I retire earlier?"  ← build FIRST
  2. "Can we afford this big goal?" (one-time event: house, college, wedding)
  3. (later) "Can we spend more in retirement?"
- ON-DEMAND, never precompute. Each solver is one engine job per click (eMoney
  pattern, ~3s with a spinner). Scales — adding solvers doesn't slow the page.
  Kills Nathan's "all those calcs at once makes me nervous" concern.
- OUTPUT = a new scenario column. Solver = scenario generator. "Solve early
  retirement" creates a column "Retire at 62" with solved levers filled in,
  sitting next to Baseline. Trade-off IS the comparison. No new viz/tab/mode.
  Fits the saveable-scenarios foundation we just built.
- TERSE output (Nathan's rule): if a lever can't reach the target alone, the
  row just shows the highest % it CAN reach (e.g. "79%"). No explanatory
  sentence — the advisor narrates, the program shows truth (doctrine #2).
- ONE WISH at a time first; layering multiple wishes ("early retire AND beach
  house") is a v2 feature once v1 proves the pattern.

Why it's on-doctrine, not bolt-on:
- Most tools can't do solve-for credibly — their engine is too weak to trust the
  answer. Parallax's engine is real/fast/verified, so this is the engine FLEXING
  the one thing it's actually better at. No new math (doctrine #5) — same truth
  engine run in reverse (numerically: bisection/solver calling runSimulation).
- Doctrine #1 (model interactions): the answer "this lever must move THIS much
  to hit your goal" IS an interaction made visible, not an isolated stat.

THE RULE that keeps it honest: lock everything, free EXACTLY ONE lever, solve
for it. One unknown. Multiple free levers = infinite answers = the tool guessing
instead of telling truth. Don't allow it.

The toggle (Nathan wants it slick/clever, easy to find, neat transition):
- Concept: the % CIRCLE ITSELF is the switch — reuse the hero element, add no new
  real estate (delete-before-adding). Normal = solid output ring showing result.
  Activate solve-for → ring hollows to a DASHED TARGET ring, the % becomes an
  editable field (type the % you want). Levers below dim except the ONE you pick
  to "float," which lights up; engine solves it and animates that lever's
  value/slider to the answer. The output literally becomes the input = the
  inversion made physical.
- Open Qs: which levers are solvable (spending/savings/retire-age clean;
  allocation is discrete 1-5 so "solve" = nearest profile; SS/pension bounded).
  How to pick the float lever (tap a lever to arm it?). Feasibility/no-solution
  state ("no spending level reaches 90% — even $0 only gets 84%"). Per-scenario
  or baseline-only first.
- NOT built — spec only, parked 2026-05. Real feature, own session.

## Idea bank — Sequencing (parked, not building)
- **Strategy Fork on one path.** Pick ONE fixed market path, then compare
  strategies on that exact same path (lower spend / delay SS / allocation /
  Roth conversion / guardrail spending). Isolates the planning DECISION from
  market luck. Nathan rated it his #1 advisor-use function. Parked because it
  OVERLAPS the Scenarios tab (which already runs every column through the same
  draws, only levers differ) — decide before building whether it's a Sequencing
  feature or really belongs in Scenarios, so the two tabs don't blur. Powerful
  either way; do it its own session once the order lesson is nailed.
- **Recovery Tunnel.** A "valley" view of years spent UNDERWATER — below the
  starting real balance. A plan can survive and still spend ~12 years beneath
  where it started, which matters emotionally/behaviorally even when it never
  fails. Honest factual metric (years-under-high-water), no invented score. Good
  secondary visual once the spine exists.

## Design — deferred
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

## Bug fixes
- **Cash-flow drawer "not loading" → runAll made resilient.** Root cause: any
  single throw (a degenerate plan input like plan-end ≤ current age, or an
  out-of-range saved scenario lever) aborted the WHOLE Run, leaving every res
  null so the circles + cash-flow drawer silently went blank. Fix: (1) guard the
  non-positive-horizon case with a clear status message and keep the last good
  results; (2) isolate each scenario in its own try/catch so one bad column can't
  blank the others (status notes "N scenarios could not run"); (3) cash-flow
  drawer shows a plain empty-state message instead of a headers-only blank table.

## Sequencing tab — v1 built (same returns, different order)
- Spine: pick a real historical start (1973/2000/1929/1982) + a scenario's plan;
  run the SAME plan forward vs EXACTLY reversed (identical returns, opposite
  order). Hero chart = 2 lines (forward solid, reversed dashed=counterfactual).
  Two Path Fingerprints below (Forward vs Reversed): first-10yr real return,
  deepest drawdown, lowest balance, outcome (ran-dry age / survived terminal).
- Engine touch: ONE additive optional param `transform` on runHistoricalPath
  (reorders the built real-return rows before the single-path runner; default =
  byte-identical forward run). engine.test.js locks "reversed = same returns,
  opposite order" → 8/8. No new math in the UI; every number is an engine read.
- Scale problem from the old multi-year chart is GONE: one plan's own path
  forward vs reversed lives in the same magnitude band, fully legible.
- OPEN — withdrawal-drag toggle (built, off by default) is MUDDY: the
  no-withdrawal ghost compounds to ~$18M over 37yr and that gap is mostly
  intended spending, not sequence damage — and it re-bloats the scale. The real
  "selling into a decline" insight is already in the fingerprint contrast
  (drawdown / lowest balance differ by order). DECIDE: pull the drag toggle, or
  rework it as the comparative (drag in bad order vs good order), own session.

## Design — done
- **Inputs tab — escaped the boxes-in-boxes grid.** Killed the bordered nested
  cards (tax-form feel). Now an open "household sheet": hairline eyebrow section
  headers, boxless fields (dashed baseline → gold on focus, same edit language as
  the Scenarios levers), two balanced flow-columns. Added a live one-line plan
  recap (age→retire→plan-end · investable · spending) and per-section running
  subtotals (Investable total; Total spending /yr + /mo). Totals are pure
  aggregation of the typed inputs — a VIEW, no engine math added (doctrine #5).
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
