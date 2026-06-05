# PARALLAX — STANDING ORDERS

**The General's coordination log. Every Claude session, sub-agent, and job reads this
on startup (see "CHAIN OF COMMAND" in `CLAUDE.md`). This file is the current source of
truth for command, canonical state, and field status — where it conflicts with older
notes elsewhere, ORDERS wins.**

---

## Chain of command
- **Commanding officer:** the General of the Parallax Code Militia — **callsign "Guppi"**
  — the lead session reporting directly to Nathan. Owns code, branches, quality,
  coordination. "Guppi" = the General/CO.
- **Reporting line:** soldiers (other sessions / sub-agents / jobs) → the General → Nathan.
- **Authority:** only the General (with Nathan) authorizes destructive, irreversible, or
  cross-branch moves (force-push, branch deletion, pushing `main`, deploy/Pages changes).

## Canonical state — as of 2026-06-05
- **Canonical build branch:** `claude/zealous-albattani-Zr9wb` — the real engine + all
  features + 38 passing tests + iOS/mobile responsive layout & touch. THIS is the build
  everything new lands on. Do not rebuild on any other lineage.
- **Deploy branch:** `main` — GitHub Pages. (Pages enablement is blocked on a one-time
  owner setting; tracking — do not keep re-attempting Actions-based Pages deploys, they
  fail with "Resource not accessible by integration".)
- **Live theme:** dark **copper-glass** (charcoal ground, gold glass, copper accent —
  see `:root` in `parallax_v2.html`). **Ink rule: no bright white anywhere; muted
  champagne only.**
- **Rejected — do NOT resurrect:** the green restyle, the dark "Midnight Analyst" navy
  theme, the light "paper" theme, the "two retirees same returns opposite order" idea,
  the UI-side expected-return formula.
- **Active parallel work:** `claude/serene-ritchie-*` (header logo mark). Coordinate;
  sync `main` before pushing; do not clobber.

## Standing orders
1. **Sync before push.** `git fetch origin main && git rebase origin/main`. Never clobber
   `main`/canonical with a stale fork. Force-push only with `--force-with-lease` + reason.
2. **Protect the mobile build.** Do not regress the iOS work: Scenarios tap-to-switch
   (sticky circle strip + active-column levers), Goals pointer-drag with `touch-action`,
   16px inputs (no iOS zoom), single-column reflow on phones.
3. **The engine is sacred.** Pure computation in `engine.js`; 38 tests must pass
   (`node --test engine.test.js`). Do not add UI-side math.
4. **Mock visual changes first**, then verify by screenshot (`node scripts/verify.mjs`)
   before claiming any UI task done. Pixels don't lie; logic checks do.
5. **No bright white. Muted champagne ink.** (Nathan's standing rule.)
6. **Report short to Nathan** in the 3-line format: what changed / what to check /
   decisions (only if real). Address him as "mate" or nothing — never "buddy."

## Parked (future — not now)
- **UI typeface upgrade.** Nathan wants the interface font moved off Sora to something
  "less basic" eventually. The logo's serif wordmark stays logo-only — do NOT run the
  whole UI on it. Mock options first, get Nathan's pick, before changing.

## Dead branches — cut on sight (0 unique commits)
`affectionate-goldberg`, `awesome-darwin`, `confident-franklin`,
`exciting-lovelace-5dOpY`, `exciting-lovelace-S3qhW`, `hopeful-euler`.

## Status log — append one line per finished unit (newest on top)
- 2026-06-05 · General · canonical+main · Audit quick-wins: age inputs clamped [1,120] (no garbage horizon); goal age fields Number-coerced (no attr injection); console.error gated behind window.PXDEBUG; engine withdrawal-factor derivation documented (comment only). Ring %-number + dot now match the ring band color (uses ringColor). Engine 38/38.
- 2026-06-05 · General · canonical+main · Cash-flow Return % + Return $ columns (real return on start balance; signed + green/red), shows sequencing directly. Pure view of engine field (realReturnUsed), no engine change.
- 2026-06-05 · General · canonical+main · Combo solver fix (QA-reviewed): was showing 1 option when goal pinned a lever; now surfaces up to 3 distinct balance-points (pair variety + extra trade-off points), with display-value + dominance dedup so no duplicate/strictly-worse card. Engine untouched, 38/38.
- 2026-06-05 · General · canonical+main · Logo enlarged in header (48→80px desktop, 60px mobile) — prominent brand anchor, tabs/RUN still comfortable.
- 2026-06-05 · General · canonical+main · RMD display fix (QA-reviewed): engine exposes gross required RMD (rmdRequired, additive, no math change); cash-flow shows it as its own column from age 73 in every scenario, italic+labeled as already-in-Withdraw to prevent over-counting. Cash flow now 2 columns (Baseline + selectable). Engine 40 assertions / 38 tests pass.
- 2026-06-05 · General · canonical+main · Sequencing chart hover (crosshair + dots + tooltip) + end-of-path $ labels; HTML overlay over the non-uniform SVG. Polish: smaller axis fonts, bigger market chips, brighter low-% sangria ring. Engine 38/38.
- 2026-06-05 · General · canonical+main · Tax-rate inputs on Household (Ordinary + Cap-gains %), whole-% type, no engine change. Verified: edits flow through engine (45% ordinary drops circles ~26pts).
- 2026-06-05 · General · canonical+main · Suggest mode shipped — in-app tap-to-note review overlay, captures locator + before→after value, Copy for Guppi / Download. Engine 38/38.
- 2026-06-05 · General · canonical+main · Logo seam fixed: flood-filled the baked-in dark-navy panel to transparent, dropped screen-blend; logo now floats clean on header.
- 2026-06-05 · General · canonical+main · Established chain of command (CLAUDE.md ★ section + this file).
- 2026-06-05 · General · canonical+main `bedf60b` · iOS/mobile responsive layout + full touch (Scenarios tap-to-switch, Goals touch-drag, single-column reflow). Pages enablement blocked on owner setting.
- 2026-06-05 · serene-ritchie · main · Added Parallax logo mark to header.
- 2026-06-05 · serene-ritchie · main `8068982` · Retheme to dark copper-glass (current live look).
