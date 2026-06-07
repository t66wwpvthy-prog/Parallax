# PARALLAX — AI PRODUCT MEMORY
**Vision · Philosophy · Design Language · Decisions · Roadmap · Institutional Knowledge**

> Companion to `AI_HANDOFF_MASTER.md` and `AI_SYSTEM_MAP.md`.
> This file is the **why** — product vision, doctrine, design decisions, the
> lessons learned the hard way, and the parked roadmap. Read it before proposing
> any change to scope, design, or direction. Written as if the lead architect is
> leaving permanently.
>
> Sourced from `CLAUDE.md`, `HISTORY.md`, `NOTES.md`, `ROADMAP.md`,
> `CODE_IMPROVEMENTS.md`, `IP-RECORD.md`, and the git history, on 2026-06-07.

---

## 1. WHO THIS IS FOR (the human)

**Nathan Robinson, CFP** — a wealth manager running a personal-CFO practice
(200+ households, $300M+ AUM). He is the **domain expert and product owner, NOT a
software engineer.** Working with him:

- **Short answers only.** He has plainly said he can't read long paragraphs.
  Default report format for any change: **(1) what changed — one line. (2) what to
  check — one line. (3) decisions needed — short list, only if real.**
- **Don't lecture or re-explain engineering.** Show the running result instead.
- **Address him as "mate" or nothing — NEVER "buddy."** Casual, direct, fast.
- **Pick the efficient implementation path yourself** — but **NEVER guess on
  destructive/irreversible moves; confirm first.**
- **No guessing, ever.** If you can't verify something (run it, read it, check
  it), say "I can't verify that." Never dress a guess as confident fact.
- He corrects framing with concrete client examples — **trust those over abstract
  reasoning.** (e.g. the "early retirement AND a $1M beach house — can't have
  both" example that sharpened Solve-For.)

---

## 2. WHAT PARALLAX IS

A **retirement-planning simulator for financial advisors.** Not a consumer app,
not a robo-advisor, not a sales/suitability tool. A **professional instrument.**

### The core thesis (the moat, the reason it exists)
Every existing retirement tool is built around a **bias** — conservative outputs
that exist to sell products and manage fear. **Parallax has no thesis.** It runs
the math and reports what's there, equally willing to tell a client *"you're fine,
spend more"* as *"this won't last, cut back."* **That neutrality IS the product** —
it's why an advisor can trust it in front of a client.

> Showing the upside is not "adding optimism to balance the pessimism." It's
> *removing a distortion.* A truth engine that hides good news is lying by
> omission. The same gauge reads green when the news is good and red when it
> isn't. This is why the upside views ("how much more can you safely spend?") are
> **required, not optional flavor.**

### The defensible layer (per the external-review triage, banked as north star)
The moat is NOT "Monte Carlo + sliders" (MoneyGuidePro PlayZone, RightCapital,
ProjectionLab, Income Lab all do that). It is **deterministic, explainable,
multi-variable decision-solving**: the same market paths across every comparison
+ a solver that answers a human question + auditable replay. Parallax's engine is
real/fast/verified, so it can credibly do **Solve-For** ("what must move to hit
this goal?") where weaker engines can't.

---

## 3. THE THREE CORE PRINCIPLES (everything serves these)

1. **Parallax models INTERACTIONS.** The value is levers moving each other and the
   client *seeing* the effect — not isolated stats. Every view must show an
   interaction or a truth, or it shouldn't exist.
2. **Parallax shows the TRUTH of reality, as close as we can get.** The PROGRAM
   shows the story; the ADVISOR tells it. Any anecdotal sentence the program
   delivers is doing the advisor's job — **cut it.** If the visual is right, the
   sentence is redundant. (No editorializing prose anywhere in the UI.)
3. **NEUTRALITY.** No opinion about whether retirement is scary or joyful. Runs the
   math, reports what's there. (See §2.)

---

## 4. PARALLAX DOCTRINE (apply to EVERY decision)

1. **Make requirements less dumb** — challenge assumptions, trace to fundamentals.
2. **Delete before adding** — subtraction is the default. Ask "what would removing
   cost?"
3. **Simplify the process** — fewer steps, fewer abstractions.
4. **Cut beats refactor** — fewer rules = less code.
5. **The engine is the single TRUTH SOURCE.** It drives every sim calculation. The
   UI only changes the *controlled variables, views, concepts, what-ifs, and
   representations* of that truth — it **never adds its own formulas or re-derives
   numbers.** Do NOT modify the truth source or add math to it unless Nathan
   EXPLICITLY agrees to a major change. (Lesson: a UI-side "expected return"
   formula once drew the hero line instead of the engine — deleted.)
6. **Default to the implementation most faithful to PURPOSE.** Scenarios compares
   apples-to-apples: every column runs through the SAME market draws; only the
   levers differ, so any difference is the *decision*, never sampling luck.

> **History to never forget:** the prior build became *"a bloated PowerPoint of
> disconnected concepts"* — unreadable even to its author. It was torn down to the
> engine and rebuilt deliberately. **Do not let it bloat again.** When tempted to
> add scope, SAY SO instead of doing it.

---

## 5. PRODUCT PHILOSOPHY (design / UX / IA / data / decisions)

- **Design philosophy.** Faithful-and-ugly beats clever-and-broken. Depth, real
  type hierarchy, and chart-craft make it feel designed — not recolored tables and
  stock donut rings. Go DEEP on one thing, not wide on five.
- **UX philosophy.** The hero number is always on screen (success circles pin to
  the top while levers scroll). Some scrolling is OK; keep as much on one screen as
  is comfortable, not cramped. Editable = dashed underline; result = solid.
- **Information architecture.** Inputs are a **data-entry workflow on dedicated
  pages** (RightCapital-style), feeding UP into analysis — **NOT a live control
  panel.** No "stale/needs-review" status machinery (explicitly rejected). Build
  only the input pages the engine actually consumes; stub the rest.
- **Data presentation.** Show the interaction, not the anecdote. No narrative
  sentences. Neutral comparison cues (deltas, pills) are fine; editorial framing
  is not.
- **Decision philosophy.** Terminal wealth is **NOT** the planning objective — it's
  only a sort/rank device. Planning solves for spending security, sequence-risk
  cushion, survival, meeting goals.

### What must NEVER change (preserve through any redesign)
- The engine as the single truth source (Doctrine #5).
- Neutrality / no-thesis / no editorial prose.
- "Same market draws across every Scenarios column" (apples-to-apples).
- The deterministic, sequence-noise-free comparison logic.
- "Verify by pixels" before claiming visual work done.
- Push to BOTH the working branch and `main`.

### Common mistakes future developers make
- Re-deriving a number in the UI instead of reading it from the engine.
- Adding a tab/view/concept because it's "cool" → re-bloat.
- "Optimizing" CSS for elegance and silently reordering the cascade.
- Claiming a UI task done from a logic check without looking at pixels.
- Resurrecting a rejected idea (dark theme, reversed-sequence view, allocation as
  a solve lever) without Nathan explicitly asking.

---

## 6. THE BUILD: two analysis tabs

### Scenarios tab — compare CHOICES
Mirrors MoneyGuidePro "Play Zone." Columns = scenarios (a Baseline anchor + 1–2
others), each topped by a **% success circle** (Monte Carlo) with **delta vs
baseline** the instant you Run. Circles pin to the top. Levers: Retirement Age, SS
Start Age, Annual/Monthly Spending, One-Time Event (amount + age), Portfolio
Allocation, Annual Savings, Pension claim age, (conditional) Sell-asset age.

> The market enters this tab ONLY through the allocation choice. Volatility/risk
> lives in the % circle — an aggressive allocation can show a higher expected
> outcome but a LOWER success circle. **That trade-off is the teaching moment.**

> ⚠ **Spec drift to verify:** CLAUDE.md describes a deterministic expected-wealth
> **hero LINE** on Scenarios. NOTES.md records the line was **REMOVED** (redundant
> with circles + cash-flow drawer); the wealth-path visual moved to Sequencing.
> Confirm in the running app. (See AI_SYSTEM_MAP §9.)

### Sequencing tab — same plan, different MARKETS
Holds the plan fixed; varies the **return sequence** across lines by retiring into
real historical years (`runHistoricalPath`). A small dropdown picks WHICH named
scenario runs through the sequences. Each line = the same plan living through a
different market order — shows sequence-of-returns risk directly.

**Market library (`SEQ_YEARS`):** 1929 Depression, 1966 lost decade, 1973
stagflation, 1987 Black Monday, 1995 90s boom, 2000 dot-com, 2008 financial
crisis, 2009 recovery bull. Four on by default (1966/1973/1995/2000). Chips double
as the legend; at least one stays lit. Euphoric pure bulls (1982/85) deliberately
excluded — they crush the scale. All lines start at the plan's **median projected
balance at retirement** (envelope p50 via a retire-now clone), so the only thing
differing is the market. Adaptive y-cap (entry × 1.8 decision-zone ceiling) keeps
the downside legible. Outcome cards per line: first-decade return, lowest balance,
survived-$ or ran-dry-age.

---

## 7. DESIGN LANGUAGE (current = "Sage Glass")

> **AUTHORITATIVE SOURCE: the running `:root` in `parallax_v2.html:10`.** The
> theme prose in CLAUDE.md is stale (it describes light "paper" and an older dark
> "Sage-Brass" palette). The ACTUAL live theme is **Sage Glass** — confirmed in
> code and the git log ("Revert to copper theme — porcelain rejected").

- **Ground:** sage-green `--bg:#1e3d2b` / deep `#1a3526`, with a layered radial +
  64px grid + diagonal gradient body background.
- **Surfaces:** translucent sage glass (`--surface:rgba(170,210,180,.18)`),
  frosted via `backdrop-filter: blur(16px) saturate(1.15)`, lifted with a soft
  drop shadow + faint inner rim-light. **No hard borders** — the glass edge is a
  whisper-faint inset ring. One rule covers all floating cards (`:54`).
- **Ink:** `--ink:#F4F6F0`, bright `#FBFCF7`, muted `#BDCDC0`. **No bright white**
  anywhere (warm off-white only).
- **Accent (single, sparing):** **copper / "soft desert clay"** `--gold:#D9A07E`
  (bright `#E3B194`). The historic `--gold-*` tokens now carry clay so existing
  rules re-theme in place. **No saturated orange anywhere.**
- **Teal:** `--teal:#8cc69e` (secondary).
- **Hero financial values:** "Muted Champagne" `#E5D9C4` (never orange).
- **Result color band (% circle, deltas, outcomes):** strong = deep green
  `#7AA76C` (≥80%); caution = bronze/gold `#D8B371` (71–79%); at-risk = sangria/
  deep burgundy `#5E1916` (<71%). `ringColor`, `parallax_v2.html:2551`.
- **Scenario line colors:** clay `#D9A07E`, green `#82daa1`, teal `#b3ded7`.
- **Type:** **Sora** (UI), **Inter** (numbers). **No monospace/code fonts ever.**
- **Motion:** ring fill transitions on a `cubic-bezier(.4,0,.2,1)` ease; goal-board
  drag/snap uses cubic-bezier (the movement Nathan called "feeling right").

**Intended emotional response:** a calm, premium, trustworthy *instrument* — not a
fear-driven calculator. Atmospheric depth and air, one confident accent.

**Rule:** **green is allowed — just no MINT green.**

### Lever input grammar (DECIDED — don't revert) `[CONFIRMED]`
**Steppers** for discrete levers (retirement / SS / pension age, allocation);
**sliders** for the dollar levers (spending, savings, one-time event), each over a
static fill+dot position bar. All-sliders read "cheap/finicky" — the split was
chosen deliberately.

### Visual grammar to codify (parked)
Dashed underline = editable input; solid slate = engine result; brass/clay =
selected/caution; clay = pressure/failure; teal = baseline/stable; scenario
accents = identity ONLY.

---

## 8. ROADMAP (parked work, by priority)

> Full index in `ROADMAP.md` (sections A–L); detail in `NOTES.md`. Status tags:
> **NEXT · BIG (own session) · PARKED · SKIP · ✅ done.**

### Already built ✅
Named/saveable scenario objects + localStorage; Solve-For v1 ("Can I retire
earlier?", bisection solver writing a new column); RMDs; Roth/taxable contribution
split; engine-native mortgages + amortization; recurring liabilities;
income.other[] / expenses.extra[] / goals[] as timed arrays; properties[] +
asset-sale override; Sequencing tab (real markets + outcome cards); Goals priority
board; Snapshot gauges; cash-flow view with Return %/$ columns.

### NEXT / BIG
- **TAX ENGINE** (ROADMAP §L) — the next big undertaking, **explicitly agreed
  with Nathan**. Replace the flat-rate stub with a real progressive computation in
  its own pure module (`tax.js`) the engine calls per year: brackets + standard
  deduction + SS provisional tiers (replacing the flat 85%), cap-gains stacking,
  optionally IRMAA/NIIT/state. `fundGap`'s gross-up must become marginal. Add
  `tax.test.js` locking each boundary against hand-computed IRS figures.
  **Open DECIDEs:** fidelity tier, filing status (MFJ first?), bracket basis
  (2025 held flat-real vs inflated), Roth conversions in v1?, SS tiers in v1?
- **Explainable constraint solver** — evolve the solo-lever solver into
  multi-variable search returning a small Pareto set of least-disruptive paths,
  with auditable replay. Resolves the solo-vs-combined display confusion.
- **Decision Surface heatmap** — retire-age × spend, confidence contours, saved
  scenarios as points, click = create scenario. The best embodiment of "models
  interactions."
- **Solve-For palette** — named life questions (retire earlier / afford a goal /
  spend more); on-demand, one engine job per click, output = a new scenario column,
  exactly ONE free lever. (THE RULE: lock everything, free exactly one lever.)

### High-value VIEWS of existing truth (low lift)
- **Failure Anatomy** — click a % ring → depletion-age histogram + earliest
  pressure year + representative failed path in the cash-flow drawer. **Best ROI.**
- **Scenario Receipt** — per-scenario delta drawer (levers moved + confidence/median
  before→after + worst market). Data, not prose.
- **Funding Bridge** — stacked age timeline of income layers (the pre-SS/pension
  gap).
- **Honest derived tiles** — longevity buffer, max sustainable withdrawal %,
  "could retire at X." Cheap reads off engine output.
- **Sequence Pressure Strip** — first ~10 retirement years as cells (return /
  withdrawal / ending balance), cursor synced to chart.
- **Rolling-period analysis** — sweep EVERY valid contiguous historical start year
  (not just the named ones); block = full horizon. `runHistoricalPath` already
  exists; iterate + aggregate.
- **Captured-hover chart interaction** — hover guide + tooltip + end-of-path value
  labels (theme-independent, reusable).
- **Delta pill** "± pts vs baseline" under each % the instant you Run.

### Engine gaps (material, parked)
Survivor SS step-up (most material couples simplification); healthcare scaling
independent of lifestyle; LTC cost escalation; one-time INFLOW support (downsizing
— current lumpSum is outflow-only); real assets (homes/business → "sell X to fund
Y"); §121 home-sale exclusion; taxClass on income streams; income-stream COLA;
sustainable-withdrawal solve.

### REJECTED / do-not-relitigate (logged on purpose)
- **Dark "Midnight Analyst" navy theme** — built, rejected. (Note: the *current*
  theme is sage-green glass, which IS dark-ish — but don't resurrect the navy one.)
- **Reversed-sequence view** ("two retirees, same returns, opposite order") —
  killed twice. A timeline that never happened proves a mechanism to a scientist,
  not the truth a client faces. Replaced by real-markets Sequencing. **Do not
  resurface.**
- **Allocation as a solo solve lever** — "take more risk to hit a goal" isn't a
  clean recommendation. Re-add only with deliberate framing.
- **Desired Legacy lever** — dropped.
- **Probability fan / "shape over time" / bar charts on Scenarios** — dropped.
- **Cash-flow River/Sankey** — decorative, no new interaction. Skip.
- **Resilience Matrix as a new tab** — old Stress Test reincarnated; overlaps
  Sequencing + Scenarios. Salvage only the click-to-clone link.
- **Rebrand away from "Parallax"** — business decision, not eng.
- **Pension COLA mode dropdown** — scrapped; pension COLA is a plain nominal
  escalator field (like SS COLA), not a mode dropdown.
- **"Stale/needs-review" input status machinery** — explicitly rejected.

### PARKED design directions
- "Experience" fintech/Mercury-Stripe visual direction (explored; current sage
  theme preferred — revisit only to elevate the whole app to an *experience*).
- Scenarios "shared-track" redesign (kill the 3-column repetition; one shared
  track per lever, dots split only on divergence). Approved-in-spirit, BIG, not
  built.
- RightCapital two-tier nav for when the app grows.
- Comprehensive read-only plan view; prospect-level quick-illustration tier;
  investment/allocation comparisons (⚠ overlaps Scenarios — pin the distinct angle
  first).

---

## 9. INSTITUTIONAL KNOWLEDGE — HARD-WON LESSONS

> These cost real time/trust. Don't relearn them.

1. **Logic checks lie; pixels don't.** The cash-flow drawer shipped at **2-pixel
   height for ~10 messages** because the DOM said "rendered" and nobody looked.
   **Run `node scripts/verify.mjs` and LOOK at `verify-out/` before claiming any
   visual task done.** Non-negotiable.

2. **Never optimize CSS for elegance/line-count.** A property-level merge of 23
   `<style>` blocks silently reordered the cascade and visually degraded
   everything — and a sampled-selector verification gave a *false pass*, so it
   shipped. Faithful consolidation = concatenate in source order. **Faithful-and-
   ugly beats clever-and-broken.**

3. **The deterministic-line problem (don't undo it).** The Scenarios comparison
   must be sequence-noise-free: identical levers ⇒ identical result. The fix went
   through several wrong stages (per-year median drifted; mean across shared paths
   still touched random sims) before landing on the right answer. **Don't
   "simplify" a comparison back into a single sampled path.** Sequence risk is the
   *Sequencing tab's* job. (The shared-paths bundle in `runAll` enforces this.)

4. **Mock-first, build-second for VISUAL changes.** A full dark theme was pushed
   live, Nathan rejected it; a 5-minute throwaway mock would have caught it. Mock →
   screenshot → approve → THEN touch live HTML.

5. **Push to BOTH the working branch and `main`.** GitHub Pages serves `main`; a
   feature branch that doesn't also update main means the live site goes stale and
   the next session fights a ghost. **Worse: never force-push `main`** — a
   non-fast-forward force-push silently drops another session's work (this exact
   mistake reverted the Goals board + healthcare work once). Reconcile (fetch +
   merge) FIRST, then push. The `/ship` skill encodes this.

6. **Don't guess — confirm before deleting.** A tab literally named `sequence` was
   NOT the cash-flow table (it was a "Plan Drivers" PowerPoint tab); the real
   ledger lived in `playback`. Confirming before deleting prevented destroying the
   wrong thing.

7. **Await completion before asserting.** A "still off" reading during testing was
   a **test-harness race** (reading results before the deferred run finished), not
   a product bug.

8. **Charts must be smooth and trackable.** Earlier attempts were too wide/jagged
   ("looks like a toddler drew it"). Tight spacing, smooth curves (`monoPath`).

9. **The engine is provenance-verified.** Extracted as a contiguous slice from the
   known-good build; all 15 components present once; 98 years of data; zero DOM
   references; the only randomness is the seeded block-bootstrap. Protect it.

10. **Surprising-but-correct (don't "fix"):** RMD timing uses prior-Dec-31 balance
    ÷ current-age divisor — a reviewer wrongly flagged it "critical"; applying
    `(1+r)` would be wrong. SS actuarial schedule matches SSA. (CODE_IMPROVEMENTS
    lists the verified-correct items so they don't get "fixed.")

---

## 10. PROJECT MEMORY — ARC IN ONE PARAGRAPH

Parallax began as a feature-rich multi-tab advisor tool built incrementally over
many sessions. It accreted tabs and styling until Nathan judged it "a bloated
PowerPoint of disconnected concepts" — unreadable even to him. The team stripped
it to its one trustworthy asset (the Monte Carlo engine) and rebuilt deliberately
around two principles: *model interactions* and *show truth, advisor tells the
story.* The current direction is a clean tool — Net Worth inputs + Scenarios +
Sequencing — built on the untouched, verified engine. The next frontier is a real
progressive **tax engine** and the **explainable multi-variable solver** that is
the genuine moat. The standing discipline that keeps it from re-bloating:
**subtract before adding, the engine is sacred, verify by pixels, neutrality is
the product.**
</content>
