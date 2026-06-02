# Parallax — running notes / punch list

Durable backlog so nothing gets lost between sessions. Newest on top.

## SOLVER v2 (selectable goal · solo per-lever) — current
- The solver now takes a GOAL the client actually wants and shows what EACH lever
  alone must be to reach it (holding all else at today's plan). Neutral: no
  weighting, no bundling. Goals: reach confidence, retire by age, afford a big
  one-time purchase, gift/fund-education yearly (time-limited liability, real-
  constant), leave a legacy ("X% chance of ≥ $Y", uses terminal distribution).
- Realistic per-lever BANDS (solveBand): spend ±30%, savings ≤2×base, retire ±5yr.
  If a lever can't reach within its band it honestly says "best hits X%".
- PARKED in idea bank (Nathan's call):
  • ALLOCATION/risk removed as a solo lever — "take more risk to hit a goal" isn't
    a clean planning recommendation. Bring back only with a deliberate framing.
  • SS stays but is a WEAK % mover for high-spend households (its value is lifetime
    dollars / survivor insurance, not the success circle). OPEN: how to frame SS —
    lifetime-dollars trade-off vs the % bar. Survivor step-up still unmodeled.
  • HOME RELOCATION / downsizing as a goal needs a one-time INFLOW in the engine
    (current lumpSum is outflow-only, Math.max(0,…)). Parked pending engine change.
- Audit/PR #1 (overnight): correctly found dead module-scope drawFrom/effRateFor in
  engine.js (lines 13–39) — applied that 28-line deletion directly on our branch
  instead. DO NOT MERGE PR #1: it branched off the pre-solver main and its built
  index.html/parallax.html would roll the live UI back. Close it as superseded.

## >>> DONE (built in the frozen session) <<<
- #5 NAME/SAVE SCENARIOS — done. Named, saveable scenario objects in `scenarios[]`,
  auto-saved to localStorage (SCEN_KEY), inline rename, add/remove, baseline locked,
  delta-preserving reseed, forward-compat backfill. Both tabs read the shared set.
- #1 SOLVE-FOR ("Can I retire earlier?") — done. Inline solver form in the band
  gutter, bisection over spend/savings/ssAge/risk against a frozen soloBase, per-lever
  solve pulse, writes its answer into a new scenario column.
- STILL TODO on Solve-For: the "Duplicate scenario" action (distinct from Add) was
  never built. And see ENGINE BANK #4 below re: the combined-vs-solo display.

## >>> ENGINE IDEA BANK — prioritized (2026-06, Claude review) <<<
Reviewed the engine. Below is the punch list, ordered by Nathan's calls.

UPCOMING SESSION:
- RMDs (Required Minimum Distributions). Biggest material gap. A large traditional
  balance forces taxable distributions from age 73 whether or not the client needs
  the cash — pushes income, taxes, and depletion timing. Target client has big
  pre-tax balances, so this materially moves results. (Was "just haven't modeled
  them in yet.")
- Roth / after-tax brokerage CONTRIBUTIONS in accumulation. Today accumulation
  savings flow to TRADITIONAL only — no Roth or taxable-brokerage contribution path.
  High earners (backdoor Roth, post-tax brokerage) can't be modeled. Engine already
  HAS the three account types on the withdrawal side; this is the contribution side.

RESOLVED (no action — already consistent):
- "Same return calc across the board." Investigated: the old arithmetic-mean
  deterministic expected-wealth LINE was REMOVED from this build (see comment in the
  scenarios section of index.html). Every displayed number now derives from ONE
  source — the block-bootstrap Monte Carlo on real historical returns (geometric).
  Scenarios "Median end" reads envelope p50; cash-flow reads the central sim path;
  Sequencing uses runHistoricalPath. No second/inconsistent return calc is in play.
  Loose end (optional cleanup, not a bug): `ASSET_STATS[k].mean` is still COMPUTED
  but consumed nowhere — could be deleted per doctrine #2 (delete before adding).

FUTURE SESSION (known, not next):
- Healthcare scales INDEPENDENTLY of lifestyle. Today spendMult scales everything
  incl. healthcare — but you can cut lifestyle, not medical. Also skews Solve-For's
  spending answer. (Not started; known.)
- Solve-For display: each lever is solved SOLO ("this lever alone needs X"), but the
  column's final % shows ALL solo answers applied at once (far exceeds target) — an
  advisor could misread it. Clarify the solo-vs-combined story. (Function noted as
  unused for now.)
- Survivor benefits. Spousal/widow SS (survivor takes ~100% of deceased's) is a major
  couples claiming lever; spouse SS amount is modeled but not the survivor step-up.
- LTC cost escalation. Treated as flat real today; LTC historically grows ~3–5%/yr
  ABOVE CPI, so a real onset cost should escalate over the horizon.

## >>> EXTERNAL REVIEW IDEA TRIAGE (2026-06, Codex review filtered through doctrine) <<<
Reviewer pitched a product thesis + 8 views + naming/flow. Filtered HARD — adding all
of it = re-bloat (the exact failure mode that killed the last build). Verdict per idea:

PRODUCT THESIS (bank as our north star, not a feature):
- The moat is NOT "Monte Carlo + sliders" (MoneyGuide PlayZone, RightCapital,
  ProjectionLab, Income Lab, T. Rowe Income Solver all do that). The defensible layer
  is DETERMINISTIC, EXPLAINABLE, MULTI-VARIABLE decision-solving: same market paths
  across every comparison + a solver that answers a human question + auditable replay.
  This reframes everything below. Keep it front of mind.

ABSOLUTELY BANK (core differentiators):
- EXPLAINABLE CONSTRAINT SOLVER (the big one). Evolve the solo-lever solver into a
  multi-variable search that returns a SMALL set of viable paths (a Pareto frontier of
  least-disruptive ways to hit a goal), e.g. "retire 62 @ 85%: A) spend -$850/mo;
  B) save +$14k/yr & SS at 69; C) retire 63 & spend -$300/mo. Allocation alone can't.
  1973/2000 still break it." Preserve deterministic replay so each rec is auditable.
  ALSO resolves the logged solo-vs-combined display confusion (#4 engine bank).
- DECISION SURFACE. Heatmap: retire age (x) × monthly spend (y), confidence as contour
  bands; saved scenarios plotted as points; click a point = create a scenario. This is
  the single BEST embodiment of "Parallax models interactions" — it shows the feasible/
  fragile BOUNDARY, not isolated stats. Reuses shared paths (grid of engine runs, no
  new math). Lives as an alternate view inside Scenarios.

PRIORITY TO ADD (high value, mostly a VIEW of truth the engine already emits, low lift):
- FAILURE ANATOMY. Click a scenario's % ring → what actually breaks: depletion-age
  histogram, earliest pressure year, success-vs-depleted split, one representative
  failed path that opens in the cash-flow drawer. Best ROI on the list — the sims
  already carry this data. Turns an abstract 76% into "here's what fails and when."
- SCENARIO RECEIPT. Baseline-delta summary drawer per scenario (levers moved +
  confidence/median before→after + worst historical market). The client-meeting
  takeaway / future export artifact. Mostly a view of already-computed deltas. Keep it
  data, not prose (no editorial sentences).

SMALLER BUT BENEFICIAL:
- RENAME "Net Worth" tab → "Plan" or "Household" (now holds inflows/outflows/goals/
  snapshot — current label undersells it). Quick win.
- FUNDING BRIDGE (on Snapshot): stacked age timeline of income layers (work/savings →
  portfolio bridge → pension → SS). Overlaps the already-banked bridge-years idea;
  makes delayed-claim decisions legible. Medium lift.
- SEQUENCE PRESSURE STRIP (under Sequencing): first ~10 retirement years as cells
  (return / withdrawal / ending balance) with a cursor synced to chart + drawer.
  Explains WHY 1973/2000 hurt (early drawdown × withdrawals) instead of just that they
  do. Strong fit for Sequencing's whole purpose. Sync interaction is the fiddly part.
- SEQUENCE DURATION / DAMAGE-WINDOW on each bottom card: show how LONG the bad
  stretch lasts, not just that it happened. '08–09 is a sharp but short shock
  (~1yr, V-shaped — recovers fast); '66 / '73 are long grinding stretches (a
  decade of flat-real + inflation) that do far more damage to a withdrawing
  portfolio. The card should label each sequence with its character/length
  (e.g. "short shock" vs "long grind") so the advisor can explain WHY two equal-
  depth crashes land so differently. Data's already in the historical path —
  it's a label + maybe a small duration bar, not new math.
- CODIFY VISUAL GRAMMAR (design-system hygiene): dashed underline = editable input;
  solid slate = engine result; brass = selected/caution; clay = pressure/failure;
  teal = baseline/stable; scenario accents = identity ONLY. Mostly already true — write
  it down so it stays consistent.
- ASSUMPTION LEDGER (light, passive): tag values Entered / Derived / Simulated /
  Historical for auditability. Aligns with truth-source obsession. WATCH SCOPE — must
  NOT become the "stale/needs-review status machinery" we already rejected.

SKEPTICAL / DO NOT PRIORITIZE (bloat risk or redundant):
- CASH-FLOW RIVER (Table|River toggle): a Sankey/river is decorative here — duplicates
  the table without showing a new INTERACTION, and competitors already saturate Sankey
  cash flows. Skip unless it reveals something the ledger can't.
- RESILIENCE MATRIX as a NEW TAB: this is largely the old Stress Test reincarnated +
  overlaps Sequencing (historical rows) and Scenarios (planning stressors). A whole new
  tab is exactly the scope-add doctrine resists. SALVAGE only the linking idea (click a
  stressor → clone into Scenarios / open in Sequencing); fold into existing surfaces.
- REBRAND away from "Parallax": name is crowded in fintech (payments, resource-planning,
  two wealth firms). This is a business/clearance decision for Nathan, not an eng task.
  Keep "Parallax" as working name; park the descriptor idea ("Retirement decisions,
  brought into focus"). Not now.

FLOW (north-star nav, depends on building the above): Household → Snapshot →
Scenarios → Sequencing → (Resilience, if ever) → Decision Receipt.


## Idea bank — Pension claim-age analysis (2026-06, from frozen chat)
NOT building now. Captured before ideas were lost.

Core question: where does sophisticated pension claim-age analysis live?
Nathan's lean: a sub-mode inside the Scenarios tab — a toggle that carries the same sim over
but constrains the levers to pension-specific controls (claim age sweep, benefit/COLA).

Key modeling decisions still open (not resolved before chat froze):
1. PLACEMENT: sub-mode in Scenarios vs own tab vs just a scenario template.
   Nathan leaning toward Scenarios sub-mode. No final call.
2. BENEFIT SCHEDULE: Current engine uses `benefitByAge` explicit table (advisor enters
   amounts for the ages they have). Open question: do we also support a
   "base + deferral schedule" model (base amount at reference age + per-year credit/
   reduction rates) for pensions where the advisor only has the deferral rule, not a
   full table? SS already uses SSA's actual actuarial schedule (ssAdjust fn in engine).
   Most DB pensions have their own non-linear tables — a single flat rate is wrong.
3. COLA vs REAL-RETURN ENGINES: The real-return engines discard the inflation path, so
   a non-COLA pension can't properly erode — it looks identical to a fully CPI-indexed
   pension. Three options discussed: (a) attach an assumed inflation rate to deflate
   non-/partial-COLA streams in real terms [current engine already has LONGRUN_INFLATION
   constant — could use that]; (b) run pension mode on the legacy nominal engines that
   carry a CPI path; (c) accept the limitation and treat all pensions as real (wrong,
   understates non-COLA cost). No final call. Option (a) is lowest-lift given engine shape.
4. INCOME SOURCES: Engine already supports SS primary + spouse + pension + other income.
   Future: generalize to a list of income sources, each with claim age, benefit schedule,
   COLA rule, and taxable fraction. Not scoped yet.

The natural output of pension mode: a claim-age sweep showing success rate + terminal
distribution per age (e.g. 62→70), with a breakeven crossover. Decision-useful artifact.

OPEN: SS claim-age lever in Scenarios already works (ssDelayYears override). Pension
claim age also works (pensionStartAge override + benefitByAge lookup). The engine IS
ready for a claim-age sweep — it's a UI/presentation question, not an engine question.

## Screenshot bank — reference & reactions (2026-06, Nathan's idea dump)
Not building now; captured so the ideas aren't lost. Verdicts are doctrine-first.

1. eMONEY Decision Center (Longevity Risk). STRONGEST signal — it's our parked
   SOLVE-FOR, already shipping elsewhere: "Run Solver" on Earliest Retirement Age,
   Maximum Retirement Spending, Minimum Additional Savings. Validates our spec
   (on-demand, one engine job per click, output = a scenario). STEAL: the solver
   palette framing. Also the green/yellow/red CONFIDENCE-BY-YEAR bars + a single
   "Confidence Age (95/94)" — an honest probability-over-time read IF it's real
   per-year success (no invented score). Could live near Sequencing.
2. RIGHTCAPITAL Retirement Analysis. The Scenarios/Play-Zone reference we already
   draw from: Proposed vs Current, % circles + wealth bars, goal sliders,
   strategy dropdowns. New bits worth noting: LIFESTYLE-GOALS slider (matches the
   banked lifestyle-goals input) and a DEBT-STRATEGY dropdown (pairs with the new
   liabilities engine — a future "how to fund/pay down" lever).
3. FINANCIALALPHA Retirement Planning. Tile dashboard. Worth stealing the HONEST
   tiles: "Portfolio lasts YES/NO", "Max sustainable withdrawal %", "Longevity
   buffer +14 yrs", "Could retire at 58" (= a solver output). AVOID the rule-of-
   thumb gimmicks ("25x target", canned "All scenarios pass"). Its multi-line
   "Portfolio Balance Over Retirement" (Conservative/Base/Optimistic + "Bridge
   before Pension") ~ our Sequencing shell; the BRIDGE-YEARS concept (the gap
   before SS/pension starts) is a real, showable truth worth a view someday.
4. WEALTHCARE "Ultimate Retirement Checklist" (Russ Thornton; staged 5yr→annual,
   age-tagged). A client-facing CONTENT/action-items artifact, not a sim feature.
   Bank under the parked narrative/action-items layer — the advisor's deliverable,
   not the engine's. Type style there: Playfair Display + DM Sans (we stay Sora/
   Inter). Low priority for the engine-driven core.

Cross-cutting takeaways: (a) Solve-For keeps showing up — it's the real
differentiator, build it well when we get there. (b) "Honest derived tiles"
(buffer, max withdrawal, could-retire-at) are cheap reads off existing engine
output and on-doctrine. (c) Bridge-years (pre-SS/pension gap) is a latent view.

## Banked — bigger build-outs (Nathan's running list, 2026-06)
- REAL ASSETS in the engine (homes, property, business). Unlocks "sell asset X to
  fund goal Y" — deliberately NOT built yet (the engine only knows taxable/
  traditional/Roth; funding from the portfolio already works via lump sum). Pairs
  with the parked Net Worth input (Money Pro balance-details layout).
- LIFESTYLE GOALS inputs (dedicated goal entry beyond the flat goals bucket).
- SOPHISTICATED TAX-PLANNING ENGINE (Roth conversions, bracket management, RMDs,
  IRMAA, etc.) — its own engine, big.
- Map out what OTHER engines we'll eventually need (tax, estate, ...?) before
  building piecemeal.
- Nathan to send a LIBRARY OF SCREENSHOTS (reference material — incoming).

## DONE — recurring liabilities (engine, 2026-06)
- New plan field `liabilities: [{label, amount, startAge, endAge, colaPct}]`. A
  fixed mortgage = 0% COLA, which the real-dollar engine erodes at
  −LONGRUN_INFLATION (gets cheaper in real terms), eroded from its OWN start age.
  Not scaled by the spend lever (fixed obligation). Charged in the retirement
  loop like other expenses (working years covered by income, per engine design).
- Also fixed: a pre-retirement lumpSum was IGNORED in accumulation — now a
  purchase-now debits the portfolio (taxable→trad→Roth, principal only).
- Vacation-home test case (correct model): $200k now + $48k/mo*... $48k/yr
  mortgage → Baseline survives 7/9 markets, with the home only 3/9. The drag is
  the retirement withdrawal, not the entry balance.
- NOT yet wired into the UI. OPEN: liability as a BASE-PLAN input (Inputs tab) or
  a PER-SCENARIO construct (so Baseline-vs-Vacation compares cleanly)? Use-case
  says per-scenario, but the slider lever-table is awkward for a 4-field item.
- Engine verified: 13/13 tests; all risk profiles + all 98 historical start years
  (incl. wrap) clean, no NaN/negative; liability edge cases safe; seeded
  determinism holds; app builds + loads with zero JS errors.

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

## Sequencing tab — REBUILT (same plan, real markets)
- REVERSED ORDER SCRAPPED (Nathan): a reversed sequence is a timeline that never
  happened — proves a mechanism to a scientist, not the truth a client faces.
  Replaced with the ORIGINAL spec: hold ONE plan fixed, run it through several
  REAL retirement markets (1966 lost decade / 1973 stagflation / 1995 90s boom /
  2000 dot-com→GFC). Each line = same plan, different real market.
- Shared entry balance: all lines start at the plan's MEDIAN projected balance at
  retirement (read from engine envelope p50 — not invented), via a "retire-now"
  clone, so the ONLY thing differing between lines is the market.
- Adaptive y-cap: a well-funded plan in a kind market compounds 10x and flattens
  the downside; if the top line runs away (>2x the 2nd) the axis caps just above
  the 2nd and the runaway rises off the top (clipped), true terminal still in its
  card. Keeps the sequence-risk downside legible for any selected scenario.
- Year picker removed (set is curated); euphoric bulls (1982/85) deliberately
  excluded — they crush the scale. Scenario selector still picks WHICH plan.
- MARKET LIBRARY: 9 selectable real markets as toggle chips (chips double as the
  legend; lit = drawn). Defaults to 4 (1966/1973/1995/2000); also available:
  1929 Great Depression, 1937 relapse, 1968 the 60s top, 1987 Black Monday,
  2008 financial crisis. At least one stays on. Euphoric pure bulls still omitted.
- Cap rule changed to a DECISION-ZONE ceiling (entry balance × 1.8): for sequence
  risk the readable region is entry→0, so kind markets that compound past it clip
  off the top (true terminal in their card) and the downside fan stays legible;
  when nothing exceeds the ceiling (all-stress sets) the real max is used.


- FIX (Nathan caught it): the chosen year is now the RETIREMENT year, not
  current age. Before, "retire into 2008" started the sequence at age 58, so the
  crash landed in the WORKING years (where it helps) and never tested retirement
  sequence risk; recent years also truncated. Now: working years use the real
  years just before retirement, and the path's RETIREMENT portion is what gets
  reversed — crash lands at age 65 where sequence risk lives. 1973 now shows the
  real lesson: forward ran dry @ 81 vs reversed survived $2.8M (same returns).
  Fingerprints rescoped to the retirement phase; truncated recent years (2000/
  2008) labelled honestly "$X at age Y (data ends)" instead of "Survived".
  Year list = retirement years 1937-2008 (need ~7 prior yrs of data). No engine
  change. Working years DROPPED from the chart (Nathan: no analytic value since
  identical in both orders) — chart starts at retirement (age 65), both lines
  begin at the shared retirement balance; accumulation still sets that balance.
  change (reuses the transform param). OPEN: whether to keep showing working
  years on the chart at all (they're identical in both orders = no analytic value).

- Polish (mobile + trust): (a) Sequencing page now scrolls (overflow-y:auto) so
  the fingerprint cards aren't cut off; (b) "Retire into" expanded from 4 to 10
  curated real start years (1929–2009, bad+good), default 1973; (c) PULLED the
  "Deepest drawdown" fingerprint stat — it read as a crash but is really
  peak-to-final-low erosion over ~37yr (no single dip), and the shared y-axis
  (scaled to the reversed line's peak) hides it, so the number didn't match the
  picture = trust killer. Kept the 3 stats that DO line up: first-10yr return
  (cause), lowest balance (visible floor), outcome. Recoverable if relabeled later.

- Plan selector now HONORS THE FULL SCENARIO (was allocation-only = silently
  fake). Allocation via the plan clone + every other lever via the same
  leversToOverrides mapping the Scenarios tab uses, threaded through a second
  additive optional param `overrides` on runHistoricalPath (default {} =
  identical). engine.test.js locks overrides flow → 9/9. Verified: Baseline
  1973 fwd $691K, Scenario B (retire +2yr) fwd $4.2M — the selector is real.
- Withdrawal-drag toggle PULLED entirely (Nathan's call). Tab stays lean:
  hero (forward vs reversed) + two fingerprints. No drawer (decided: keep lean).

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
- Withdrawal-drag toggle PULLED (Nathan's call): the no-withdrawal ghost
  conflated intended spending with sequence damage and re-bloated the scale. The
  "selling into a decline" insight already lives in the fingerprint contrast
  (drawdown / lowest balance differ by order). If revisited, rework as the
  comparative drag (bad order vs good order), own session.

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
