# Parallax — Consolidated Roadmap & Checklist

One executable view of everything parked across `CLAUDE.md` and `NOTES.md`.
Details/rationale live in `NOTES.md`; this is the index you check against.
Status tags: **NEXT** · **BIG** (own session) · **PARKED** · **SKIP** · ✅ done.

---

## A. Engine — material gaps (the truth source)
- [x] ✅ **RMDs** — forced distributions from age 73 (Uniform Lifetime; excess reinvests to taxable; Roth exempt). ⚠ divisor table flagged for CFP verification in engine.js.
- [x] ✅ **Roth / taxable-brokerage contributions in accumulation** — savings split across sleeves (default 100% pre-tax). Backdoor-Roth / post-tax brokerage now modelable.
- [ ] **Contribution-side tax deduction → banked for the TAX ENGINE** (not now). Pre-tax contributions lower current taxable income; Roth don't. Engine currently treats `savings` as post-decision cash flow; withdrawal-side treatment IS modeled. Fold into the tax-planning engine when built.
- [ ] **Healthcare scales independently of lifestyle** — spendMult currently scales medical too; skews Solve-For.
- [ ] **Survivor SS benefits** — widow step-up (~100% of deceased's); major couples lever, unmodeled.
- [ ] **LTC cost escalation** — ~3–5%/yr above CPI; currently flat real.
- [ ] **One-time INFLOW support** — home relocation/downsizing; current lumpSum is outflow-only. (Engine change.)
- [ ] **Real assets in engine** — homes/property/business → "sell X to fund Y." **BIG**
- [ ] **Tax-planning engine** — Roth conversions, bracket mgmt, IRMAA, RMDs, **contribution-side deduction** (pre-tax lowers current taxable income; Roth doesn't). Its own engine. **BIG**
- [ ] **Map the other engines we'll need** (tax, estate, …) before building piecemeal.
- [ ] Cleanup: `ASSET_STATS[k].mean` computed but unused — deletable (doctrine #2).

## B. Core differentiators — the moat
- [ ] **Solve-For mode** — named life-questions palette: ① "Can I retire earlier?" (build first) ② "Can we afford this big goal?" ③ (later) "Spend more?". On-demand (one engine job/click), output = a new scenario column, exactly ONE free lever, the % circle itself is the toggle. **BIG / NEXT-ish**
- [ ] **Explainable constraint solver** — evolve solo-solver into multi-variable search returning a small Pareto set of least-disruptive paths; auditable replay. Also fixes the solo-vs-combined display confusion. **BIG**
- [ ] **Decision Surface heatmap** — retire-age × spend, confidence contours, saved scenarios as points, click = create scenario. Best embodiment of "models interactions." Alternate view in Scenarios. **BIG**

## C. High-value VIEWS of existing truth (low lift)
- [x] ✅ **Sequence duration / damage window** — built this session (Duration row + navy bar, drawdowns only).
- [ ] **Failure Anatomy** — click a % ring → depletion-age histogram, earliest pressure year, success/depleted split, one representative failed path in the cash-flow drawer. **Best ROI.**
- [ ] **Scenario Receipt** — per-scenario delta drawer (levers moved + confidence/median before→after + worst market). Meeting takeaway / export. Data, not prose.
- [ ] **Sequence Pressure Strip** — first ~10 retirement years as cells (return / withdrawal / ending balance), cursor synced to chart + drawer. Explains *why* 1973/2000 hurt.
- [ ] **Funding Bridge / bridge-years** — stacked age timeline of income layers; the pre-SS/pension gap.
- [ ] **Honest derived tiles** — longevity buffer, max sustainable withdrawal %, "could retire at X." Cheap reads off engine output.
- [ ] **Confidence-by-year bars** — green/yellow/red per-year success + a single "Confidence Age," only if it's real per-year data.

## D. Scenarios / input model
- [~] **Account types build** — "+ add an investment account" with type picker (401k/403b/457/401a/SEP/SIMPLE/solo-401k → pre-tax bucket); HSA + 529 skipped. **MOCK BUILT, awaiting Nathan's OK** (`verify-out/acct-types-mock.png`) — not shipped live (mock-first rule). Wire it once approved: added accounts sum into their tax sleeve, no double-count with base rows.
- [ ] **Scenarios "shared-track" redesign** — kill the 3-column repetition; one shared track per lever, dots split only on divergence. Approved-in-spirit, not built. **BIG**
- [ ] **Pension claim-age analysis** — sub-mode in Scenarios: claim-age sweep (62→70) + breakeven. Open Qs below.
- [ ] **Recurring liabilities → UI** — engine DONE; not wired. Open: base-plan input vs per-scenario.
- [ ] **Lifestyle goals** — dedicated goal-entry inputs.
- [ ] **Real assets input** — Money Pro balance-details layout (pairs with engine real-assets).
- [ ] **"Duplicate scenario"** action (distinct from Add) — never built.

## E. Sequencing (parked)
- [ ] **Strategy Fork on one path** — fix ONE market, compare strategies on it (Nathan's #1 advisor function). Decide Scenarios vs Sequencing home first (overlap).
- [ ] **Recovery Tunnel** — full years-underwater valley view (partially realized by the Duration metric now).

## F. Smaller wins / hygiene
- [ ] **Rename "Net Worth" tab → "Plan" / "Household"** (now holds inflows/outflows/goals/snapshot). Quick win.
- [ ] **Codify visual grammar** — dashed underline = editable; solid slate = result; brass = selected/caution; clay = pressure/failure; teal = baseline; scenario accents = identity only. Write it down.
- [ ] **Assumption ledger** — Entered/Derived/Simulated/Historical tags. ⚠ Watch scope — must NOT become the rejected "needs-review" machinery.
- [ ] **Close PR #1 as superseded** — branched pre-solver; merging would roll the live UI back. **DO NOT MERGE.**

## G. SKIP / do-not-relitigate (logged on purpose)
- Cash-flow River/Sankey — decorative, no new interaction.
- Resilience Matrix as a new tab — old Stress Test reincarnated; overlaps Sequencing + Scenarios. Salvage only the click-to-clone link.
- Rebrand away from "Parallax" — business decision, not eng.
- Reversed-sequence view — killed (a timeline that never happened).
- Allocation as a solve lever — re-add only with deliberate framing.

## H. This session's parked ideas
- "Experience" visual direction (fintech / Mercury–Stripe) — explored, **PARKED** (current light theme preferred).
- Captured-hover chart interaction (theme-independent): hover guide + tooltip + end-of-path value labels.
- Delta pill "± pts vs baseline" — neutral comparison cue.
- Outcome-weighted Sequencing lines — weight/opacity, not hue.
- `/mock` skill — formalize the throwaway-mock + screenshot harness so mock-first is one command.

## I. Open framing questions (decide when building)
- [ ] **SS framing** — lifetime-dollars trade-off vs the % circle (it's a weak % mover for high-spend households).
- [ ] **Solve-For display** — solo-vs-combined story so an advisor can't misread the column %.
- [ ] **Liabilities** — base-plan input vs per-scenario construct.
- [ ] **Pension** — placement (Scenarios sub-mode?), benefit schedule (explicit table vs base+deferral), COLA in a real-return engine.
- [ ] **Strategy Fork** — Sequencing feature or Scenarios feature?

## J. Future surfaces / views (parked 2026-06 — scope before building)
- **Comprehensive plan view (read-only).** One tab presenting the WHOLE plan —
  inputs, assumptions, results — as a consolidated, presentation-grade overview that
  is NOT editable inline (edits stay on the input pages). The advisor's deliverable /
  client summary. Strongest of the three; pairs with the parked Scenario Receipt
  (export artifact) and the "Net Worth → Plan" rename. On-doctrine if it stays a VIEW
  of existing truth — no new math, no narration.
- **Prospect-level view.** A lighter "quick illustration" tier for prospects/sales:
  minimal inputs, top-line projection to show value before a full plan is built. Real
  advisor workflow (prospect quick-look vs full client plan). Future onboarding/sales
  surface; keep it a REDUCED view of the same engine, never a second model.
- **Investment comparisons.** Compare portfolios/allocations head-to-head (proposed vs
  current, or the risk/return of allocation choices). Has legs but ⚠ OVERLAPS Scenarios
  (already compares allocation choices through the same market paths) — pin the distinct
  angle (proposed-vs-current · efficient-frontier · holdings-level) before building so
  the two don't blur. Holdings-level (individual funds) is OUT of the current engine's
  allocation-bucket model.

## K. Session adds — 2026-06-03 (detail in NOTES.md)
- [ ] **Home SALE event + cap-gains on sale** — proceeds = value − mortgage − cap-gains tax; needs $250k/$500k-MFJ primary-residence exclusion + `capitalImprovements` basis. (`purchasePrice` already captured, inert.) Extends A "real assets".
- [ ] **`taxClass` on income streams** — ordinary / tax-free / cap-gains; today all other income is flat ordinary. (Engine field, A.)
- [ ] **Sustainable-withdrawal solve** — safe annual draw framed as "sustainable withdrawal," not income. (Pairs with B Solve-For + C max-withdrawal tile.)
- [ ] **Income-stream COLA** — variable income is flat-real; let fixed annuities erode.
- [ ] **Rolling-period analysis (extended block bootstrap)** — sweep every real contiguous historical window, not just named Sequencing years. (Also in CLAUDE.md.)
- [ ] **Goals page interesting layout** — not the ledger style (end-date windows already built; visual redesign pinned). Two directions: (a) **timeline** — goals as bars on an age axis + stacked annual-spend curve (mocked 2026-06-04); (b) **priority board** (Nathan's idea) — drag-to-reorder floating translucent goal cards, capture-then-rank by priority (concepts zip on main).
- [ ] **Open:** demo mortgage keep (84.9%) vs paid-off (~86.5%); Net Worth → Assets as the wider column.
- [x] ✅ Done this session: add-row workflow · engine-native mortgages + amortization · mortgage→Liabilities mirror · recurring-goal end dates · Inflows+Outflows→Cash Flow tab · Snapshot to own tab · replacement-ratio = guaranteed only · cash-flow age/ sticky/ $0→"—" fixes · no-bright-white + glass-everywhere pass.

---

### Standing guidance / doctrine
- Green is allowed — **no mint green**.
- Mock visual changes first → screenshot → approve → then build the live HTML.
- Verify by looking (run `node scripts/verify.mjs`), not by logic checks.
- Engine is sacred; the UI never adds math — only views/levers of existing truth.
- Push to BOTH the working branch and `main` (Pages serves `main`).
- Subtraction is the default; delete before adding; don't let it re-bloat.
