# PARALLAX — project history & decision log

Companion to `CLAUDE.md`. That file is the standing brief (what to do).
This file is the **why** — how decisions were reached, what was tried and rejected,
so you don't re-litigate settled choices or repeat dead ends. Chronological.
Sourced from work sessions on 2026-05-29 and 2026-05-30.

---

## Arc in one paragraph
Parallax began as a feature-rich, multi-tab advisor tool built incrementally over
many sessions. It accreted tabs and styling until the owner (Nathan, a CFP) judged
it "a bloated PowerPoint of disconnected concepts" — unreadable even to him. The
team stripped it to its one trustworthy asset (the Monte Carlo engine) and began a
deliberate rebuild around two principles: *model interactions* and *show truth,
advisor tells the story*. The current direction is a clean two-tab tool
(Scenarios + Sequencing) built on the untouched engine.

---

## Session 1 (05-29 eve) — Sequence Risk + Scenarios groundwork
- Ported a **Sequence Risk** tab wired to the real engine.
- Began engine extensions and a Scenarios revamp.
- Established the standing instruction: **dump full project memory to chat after
  each session.**

## Session 2 (05-29 late) — v2.39 / v2.40 / v2.41
- **v2.39:** Scenarios revamp + engine extensions shipped — pension, savings, LTC,
  retirement-age all added to the engine.
- **v2.40:** A pension COLA *dropdown* (Full/Partial/None) was built, then
  **scrapped** at Nathan's direction. Lesson logged: pension COLA should be a plain
  nominal escalator field like the SS COLA, not a mode dropdown.
- **v2.41 (in progress):** remove diagnostics, hide sidebar by default, restyle a
  "Best" badge teal, rework pension to a clean two-concept model (enter the benefit
  amount directly; a separate claim-age field; plain COLA % escalator).

## Session 3 (05-30 early) — CSS consolidation (the cautionary tale)
- The file had **23 stacked `<style>` blocks**. An attempt was made to consolidate
  them into one.
- A **property-level merge** was used (collapsing each selector to a single rule at
  its first-seen position). This **silently reordered the cascade** — when two
  equal-specificity selectors had relied on source order, the merge flipped the
  winner. Result: misaligned text, wrong sizing, broken flow.
- **Verification gave a false pass** (sampled selectors + pixel diffs explained
  away) so the regression shipped before Nathan caught it visually.
- **LESSON (now in CLAUDE.md): never optimize CSS for elegance/line-count. Faithful
  consolidation = concatenate blocks in source order. Faithful-and-ugly beats
  clever-and-broken. Verify by LOOKING, not by sampled metrics.**

## Session 4 (05-30 mid) — the pivot
- A small income-row race condition was found and fixed (two seeders competing;
  made deterministic).
- Then the **hard pivot**: Nathan looked at the whole tool and rejected it —
  "powerpoint of nothing," unreadable, "no real analysis anywhere other than the
  cash flow table." Decision: **scrap all tabs except the cash-flow ledger; keep
  the engine intact.**
- A near-miss proved the "don't guess" rule: the tab literally named `sequence` was
  **not** the cash-flow table (it was a "Plan Drivers" PowerPoint tab). The real
  ledger lived in the **playback** tab. Confirming before deleting prevented
  destroying the wrong thing.

## Session 5 (05-30, this session) — strip to engine, then rebuild design
1. **Stripped** the tool to {engine + sidebar inputs + the playback cash-flow
   ledger}, one tab. Engine verified intact: 15 pure functions, 98 years of return
   data, zero DOM access. Shipped as `v3.0-ledger` (this became `Parallax_rebuild`).
2. **Then Nathan called for a full rebuild** keeping ONLY the engine. Long design
   conversation produced the architecture now in CLAUDE.md. Key decisions, in order:
   - **Inputs are NOT a live control panel.** RightCapital-style data-entry pages
     feed up into analysis. No completion/staleness machinery (explicitly rejected).
   - **Scenarios tab** = compare CHOICES. MoneyGuidePro "Play Zone" layout: columns
     with a % success circle each, delta-vs-baseline shown on Run, levers as rows,
     circles pinned while levers scroll.
   - **The hero line** = each scenario's **deterministic expected wealth path**.
     This was hard-won (see below). Sequence noise must NOT appear here.
   - **Sequencing tab** = same plan, different MARKETS. Reuses the same visual
     shell; a small dropdown picks which scenario runs through real historical
     sequences (1973/1982/2000/1929). Mostly banked for later.
   - **The market is portfolio-centric on Scenarios:** it enters only through the
     allocation choice. Volatility/risk shows up in the % circle (aggressive can
     have a higher expected line but a lower success circle — that trade-off is the
     teaching moment).
   - **Dropped:** Desired Legacy lever; the "shape over time" probability-fan idea;
     bar charts. **Banked:** "Two Retirees" (only ever with REAL sequences, never
     sorted extremes), RightCapital two-tier nav, narrative/historical layer.
3. **Built `parallax_v2.html`** — engine wired into both tabs, first working
   iteration.

---

## The deterministic-line problem (important — don't undo this)
The Scenarios line first drew a single sampled Monte Carlo path, which carried
random sequence-of-returns noise — so two columns with identical levers produced
*different* lines (pure sampling noise). That breaks trust in the comparison.

Fix, in stages, ending at the right answer:
- Tried per-year median across all paths → still drifted (median stitches a
  different sim each year).
- Tried mean across shared paths → closer, but still touched random sims.
- **Final, correct approach:** the line is a **fully deterministic expected path** —
  start balance walked forward at the *allocation's expected real return*
  (Σ weightᵢ·meanᵢ from RISK_PROFILES × ASSET_STATS) with **return-independent cash
  flows** rebuilt from resolved inputs. No random sim touches the line.
- **Verified:** identical levers ⇒ identical lines (diff = 0). R3→R5 fans from
  ~$25M to ~$68M expected. R5's success circle is *lower* than R3's despite the
  higher line — correct risk/return honesty.
- A false "still off" reading during testing was a **test-harness race** (reading
  results before the deferred run finished), not a product bug. Lesson: await
  completion before asserting.

**Do not "simplify" this line back into a sampled path.** It is intentionally
deterministic. Sequence risk is the *other tab's* job.

---

## Engine provenance
`engine.js` was extracted as a contiguous slice from the known-good build, then its
helper closure was pulled in (`historicalProxyComponents`, `fundGap`, `effRateFor`,
`drawFrom`) plus the module constant `LONGRUN_INFLATION` (0.025). Verified: all 15
components present exactly once, 98 years of data, zero DOM references. The only
randomness in the engine is block-bootstrap path generation
(`generateReturnPath`, two `Math.random()` calls) — everything else is
deterministic given inputs + paths. Shared-path mode makes runs reproducible.

---

## Working-relationship notes (carry into Claude Code)
- Nathan is the domain expert/product owner, not an engineer. Short answers only;
  he has said he can't read long paragraphs. Format: what changed / what to check /
  decisions — one line each.
- He wants you to choose the efficient implementation path, but **never guess** —
  especially on destructive or present-fact questions. Verify or say you can't.
- He moves fast and corrects framing with concrete client examples. Trust those
  corrections over abstract reasoning.
- The engine is sacred. Protect it. Bloat is the enemy. Subtraction is the default.
