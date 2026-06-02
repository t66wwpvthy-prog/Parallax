# PARALLAX — project brief for Claude Code

You are helping Nathan build **Parallax**, a retirement-planning simulator for
financial advisors. Read this whole file before doing anything.

## Who you're working with
Nathan — CFP / wealth manager (personal-CFO model, 200+ households, $300M+ AUM).
He is the domain expert and product owner, **not** a software engineer. So:
- Keep explanations SHORT. He has said plainly he can't read long paragraphs.
- Default format for every change: **(1) what you changed — one line. (2) what to
  check — one line. (3) decisions needed — short list, only if real.**
- Do NOT lecture or re-explain engineering. Show the running result instead.
- He calls you "buddy." Casual, direct, fast. He wants you to pick the efficient
  path on implementation, but NEVER guess on destructive/irreversible moves —
  confirm first.

## The core principles (everything serves these)
1. **Parallax models interactions.** The value is levers moving each other and the
   client *seeing* the effect. Not isolated stats. Every view must show an
   interaction or a truth, or it shouldn't exist.
2. **Parallax shows the truth of reality, as close as we can get.** The PROGRAM
   shows the story; the ADVISOR tells it. Any anecdotal sentence the program
   delivers is doing the advisor's job — cut it. If the visual is right, the
   sentence is redundant.
3. **Neutrality.** Parallax has no thesis about whether retirement is scary or
   joyful — it has no opinion at all. It runs the math and reports what's there,
   equally willing to say "you're fine, spend more" as "this won't last, cut
   back." Showing the upside is not adding optimism to balance the pessimism;
   it's removing a distortion. A truth engine that hides good news is lying by
   omission — every other tool is built around fear, which is itself a bias.
   The same gauge reads green when the news is good and red when it isn't. That
   neutrality *is* the product: it's why an advisor can trust it in front of a
   client. (This is why the upside views — e.g. "how much more can you safely
   spend?" — are required, not optional flavor.)

## PARALLAX DOCTRINE (apply to every decision)
1. Make requirements less dumb — challenge assumptions, trace to fundamentals.
2. Delete before adding — subtraction is the default. Ask "what would removing cost?"
3. Simplify the process — fewer steps, fewer abstractions.
4. Cut beats refactor — fewer rules = less code.
5. The engine is the single TRUTH SOURCE. It drives every sim calculation in the
   tool. The UI only changes the *controlled variables, views, concepts, what-ifs,
   and representations* of that truth — it never adds its own formulas or re-derives
   numbers. Do NOT modify the truth source or add new math to it unless Nathan and
   you EXPLICITLY agree to a major change. (Lesson: a UI-side "expected return"
   formula was drawing the hero line instead of the engine — deleted; the line now
   reads the engine's median directly.)
6. When choosing between implementations, default to the one most faithful to the
   tool's PURPOSE (truth based on what we know). Scenarios compares apples-to-apples:
   the engine runs every column through the SAME market draws; only the controlled
   levers differ, so any difference between columns is the *decision*, never sampling
   luck. The hero line therefore uses the engine's stable median band (envelope p50),
   not a single random path that would make columns non-comparable.

History: the prior build became "a bloated PowerPoint of disconnected concepts" —
unreadable even to its author. We tore it down to the engine and are rebuilding
deliberately. Do not let it bloat again. When tempted to add scope, say so instead
of doing it.

## THE ENGINE IS SACRED
`engine.js` is the heart of the model and is VERIFIED. It is pure computation —
no DOM, no UI. 15 components, 98 years of real return data (1928–2025), block
bootstrap, three account types (taxable/traditional/Roth), accumulation + pension
+ LTC, path-consistent Monte Carlo.

- Do NOT casually rewrite it. If you must change it, `engine.test.js` MUST still pass.
- **Terminal wealth is NOT the planning objective.** It's only a sort/rank device.
  Planning solves for spending security, sequence-risk cushion, survival, meeting
  goals. Never default to "highest ending balance wins."
- Key entry points:
  - `runSimulation(plan, overrides = {}, returnPaths = null)` → results object
    (`successRate`, `terminal` percentiles, `envelope`, `sims`, `metrics`, ...).
  - `runHistoricalPath(plan, startYear, strategy)` → one coherent path retiring
    into a real historical year (e.g. 1973).
  - `resolveInputs(plan, overrides)` → resolved inputs (ages, balances, cash flows).
  - `generateReturnPath(horizonYears)` → one block-bootstrap return path.
  - `defaultPlan` → the plan object shape (household, accounts, income, expenses,
    goals, taxes, simulation).

### Engine overrides (the lever surface)
`overrides` understood by `resolveInputs`: `retireDelay`, `ssDelayYears`,
`spendBump`/`spendCut`, `lumpSum` + `lumpSumYear`, `savingsBump`, `riskProfile`
(via a plan clone — allocation change needs a new plan, not an override),
`initialShock`, `returnAdj`, `taxMult`, `ssCut`, `healthcareAdj`, `longevityYears`.

## THE BUILD: two tabs (this is what we're making)

### Scenarios tab — compare CHOICES
Mirrors MoneyGuidePro "Play Zone" (reference image in /reference if provided).
- Columns across = scenarios (a Baseline anchor + 1–2 others).
- Each column topped by a **% success circle** (Monte Carlo), with **delta vs the
  baseline** shown the instant you Run. Circles **pin to the top / stay visible**
  while levers scroll (hero number always on screen). Some scrolling is OK; keep
  as much on one screen as is comfortable, not cramped.
- Levers (sliders + value): Retirement Age, SS Start Age, Annual Spending,
  One-Time Spending Event (amount + age), Portfolio Allocation, Annual Savings
  (pre-retirement). (Legacy was dropped.)
- **The hero line chart** = each scenario's **expected wealth path** in today's
  dollars, current age → plan end. CRITICAL: this line is the DETERMINISTIC
  expected path (start balance walked forward at the allocation's expected return
  with return-independent cash flows). It must NOT carry random sequence noise:
  identical levers ⇒ identical lines; changing only allocation ⇒ the lines fan
  apart by exactly the compounding effect of that allocation. Sequence-of-returns
  risk does NOT appear here — that's the Sequencing tab's job.
- The market enters this tab ONLY through the allocation choice (portfolio-centric).
  The % circle is where volatility/risk lives (aggressive can show a higher
  expected line but a LOWER success circle — that trade-off is the point).
- NO bar chart, NO probability fan/bands, NO "shape over time" abstraction.

### Sequencing tab — same plan, different MARKETS (mostly banked for later)
- Reuse the SAME visual shell (line chart + columns).
- Hold the plan fixed; vary the **return sequence** across lines (retire into 1973
  / 1982 / 2000 / 1929 — real historical paths via `runHistoricalPath`).
- A small lightweight selector (dropdown — NOT a big column) picks WHICH named
  scenario is run through the sequences.
- Each line = the same plan living through a different market order. Shows
  sequence-of-returns risk directly. (A prior "two retirees, same returns,
  opposite order" idea was killed for good — the real-markets view replaces it.
  Do not resurface it.)

## Input model (decided, for later)
RightCapital-style: inputs are a data-entry workflow on dedicated pages
(Net Worth, Goals, Income, Expenses…), feeding UP into the analysis. NOT a live
control panel. No "stale/needs-review" status machinery (rejected). Build the
minimum input pages the engine actually consumes first; stub the rest.
- Net Worth section: model the layout on **Money Pro's balance details** view
  (Nathan will provide the screenshot).

## Scenario objects (architecture)
Scenarios should become NAMED, SAVEABLE objects (not transient slider state), so
the Sequencing selector can point at them. Baseline = anchor. Both tabs read from
this shared set. This is the long-planned "household-centric data root."

## Idea bank (NOT building now — keep parked)
- RightCapital two-tier nav (domains row + sections row) for when Parallax grows.
- Historical-context / narrative layer.
- **Seamless Scenarios → Sequencing flow + per-scenario annual cash-flow view**
  (the north star). Model the GENERAL flow on RightCapital: adjust scenario inputs
  in the columns (we do this now), and open a cash-flow view inside that same window
  showing year-by-year annual cash flows for each scenario being modeled. Don't
  reinvent the design — that flow works; OUR edge is the engine behind it. Low-lift
  on the data side: the engine ALREADY emits per-year rows per sim (balance,
  withdrawal, socialSecurity, otherIncome, pension), so the cash-flow table is
  mostly a VIEW of existing truth, not new math. Keep the visual shell shared.
- **"Experience" visual direction (fintech / Mercury–Stripe bar) — explored, PARKED.**
  Nathan currently prefers the live light "paper" theme; revisit ONLY if he wants to
  elevate the whole app to feel like an *experience*, not a calculator. What landed in
  the study (see `verify-out/exp-*.png` in that session): an atmospheric canvas (tonal
  gradient + one faint accent glow, glassy floating top bar); the chart as a STAGE —
  large, paths visibly separating, with a captured live moment (hover guide + tooltip +
  end-of-path value labels) that signals "explore me"; scenarios rendered as floating
  PLAN CARDS (pricing-page energy: big confidence number + delta pill + levers + ending
  wealth), not a spreadsheet grid; area gradient under the anchor line; ONE confident
  accent used sparingly; big type + lots of air. The ANTI-pattern (rejected twice):
  flat "token-swap on wireframes" — recolored tables, stock donut rings, raw polylines,
  multi-board palette suites. They read cheap. Depth, real type hierarchy, and
  chart-craft are what make it feel designed; go DEEP on one, not wide on five.

## Hard-won lessons (do not relearn the hard way)
- Don't optimize CSS for elegance/line-count. A clever property-level style merge
  silently reordered the cascade and visually degraded everything. Faithful-and-
  ugly beats clever-and-broken.
- Verify by LOOKING (run it, screenshot it), not by sampled selector checks or
  vanity metrics. Success = "Nathan looks at it and it's right."
- Charts: lines must be smooth and trackable. Earlier attempts were too wide /
  jagged ("looks like a toddler drew it"). Tight spacing, smooth curves.
- No monospace/code fonts anywhere — theme text only.
- The cash-flow drawer once shipped at 2-pixel height for ~10 messages because
  the DOM said "rendered" and nobody looked at the rendered layout. **Logic
  checks lie; pixels don't.** Before claiming any UI/visual task is done, run
  `node scripts/verify.mjs` and look at the screenshots in `verify-out/`. This
  is the verify-before-claim rule — non-negotiable for visual work.
- GitHub Pages serves `main`, but feature work happens on a `claude/*` branch.
  Push to BOTH every time, or the live site goes stale and the next session
  spends an hour fighting a ghost. Use the `/ship` skill.
- VISUAL changes get MOCKED first (static study → screenshot → Nathan approves)
  BEFORE touching the live HTML. We pushed a full dark theme live; he rejected it;
  a 5-minute throwaway mock would have caught it. Mock-first, build-second.
- The live theme is the LIGHT "paper" report (warm off-white ground, slate ink,
  brass + teal accents — see the running `:root` in `parallax_v2.html`, which is the
  source of truth). A dark theme ("Midnight Analyst" navy) was built and REJECTED —
  do NOT resurrect it unless Nathan explicitly asks. (The "Theme tokens" section
  below still describes the older dark palette; treat it as historical, not current.)

## Theme tokens (dark "Sage-Brass")
Background `#0b1118` / deep `#070b10`; surfaces `#101820`/`#151f2a`; rules `#26313d`.
Ink `#e8eef6` / bright `#f8fbff` / muted `#9aa7bb`. Gold `#d6aa59`/bright `#f0c773`.
Teal `#7aa39e`/bright `#a9d5cf`. Positive `#a9d3bc`, negative `#f0918d`.
Fonts: Sora (UI), Inter (numbers). Scenario line colors: teal `#a9d5cf`,
gold `#f0c773`, blue `#9db4e0`.

## How to work here
- Keep the engine in `engine.js`, isolated. UI imports from it.
- When you finish a change, RUN the app and confirm the result, then report in the
  short 3-line format above.
- Current working prototype: `parallax_v2.html` (single-file; engine is currently
  inlined there). A near-term task is splitting that file so it imports `engine.js`
  and adding `engine.test.js` so the engine can never silently break.

## Skills (slash commands in this repo)
Three skills live in `.claude/skills/` — invoke them by name:
- `/verify` — build + engine tests + headless screenshot of every page. Run this
  before claiming a visual change is done. Screenshots land in `verify-out/`.
- `/ship` — verify, commit, push to working branch AND main (Pages serves main).
- `/engine-guard` — run engine.test.js. Use after touching `engine.js`.

The verify probe lives at `scripts/verify.mjs` — runnable directly with
`node scripts/verify.mjs` from your laptop too.
