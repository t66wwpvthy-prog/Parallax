# Reference images

Inspiration and competitor-UI references. Each entry captures WHAT the image
is and WHY we kept it — the idea to steal or to avoid. Descriptions are
authoritative; the actual PNGs are nice-to-have and may not always be present
(they come through chat and can't always be saved to disk).

## Index

### `rightcapital-retirement-analysis.png` — RightCapital · Retirement Analysis
RightCapital's "Retirement Analysis" page showing **Proposed Plan** (96%
probability of success) side-by-side with **Current Plan** (91%) — each with
its own % circle and a single bar showing some terminal-wealth-ish dollar
figure. Below sits a two-column lever grid: "Financial goals" + "Strategies" +
"Savings and expenses" rows, each with a "Proposed" slider/value next to a
read-only "Current" value. Tab strip at the top: Probability / Confidence /
Scenario / Income. A green "ACTION ITEMS" button floats centered between the
two plans.

**Why we kept it:**
- **The pattern Parallax is intentionally subverting.** Most rows show the SAME
  value in both columns ("100% / 100%", "65 / 65", "Max / Max") — the screen
  repeats itself and the eye has to hunt for the one cell that differs. This is
  the exact "boxes-in-boxes burying the decision" problem the shared-track
  redesign in NOTES.md is built to kill.
- The side-by-side circles + bar pairing is a possible reference for a future
  "scenario detail" view (see CLAUDE.md note about seamless Scenarios →
  cashflow flow).
- The "Proposed vs Current" framing is the dual-snapshot pattern; ours uses
  named saveable scenarios instead, which is more flexible.

### `emoney-longevity-risk-insights.png` — eMoney · Decision Center / Insights
eMoney's "Decision Center" page for plan "Retire at 65 with Part-Time
Consulting." Top of the right pane: a green/yellow/red **Longevity Risk** bar
chart (~50 years), each year a vertical bar colored by survival-probability
band (green 82-100%, yellow 70-81%, red 0-69%). Confidence Age callout below
("95 / 94"). Left sidebar stacks several collapsible sections: Techniques
(Consulting / Living Expenses toggles), What-Ifs (dropdown + "Optionally
select a What-If to apply"), and — critically — **Insights → Solvers**: each
solver is a labeled row with its own **Run Solver** button:
- Earliest Retirement Age
- Maximum Retirement Spending
- Minimum Additional Savings Needed
- Life Insurance Gap Analysis
Plus "Probability of Success: 85%" as the implied target.

**Why we kept it:** this is the reference that resolved the Solve-For speed/
sustainability question.
- **What eMoney got RIGHT — adopt:** each solver is **on-demand** (Run Solver
  button). Nothing precomputes. The engine runs ONE solve when asked. Scales
  forever — adding more solvers doesn't slow the page. This is how Parallax's
  Solve-For will work, dodging the precompute-everything fragility Nathan
  flagged ("nervous, doesn't seem like a long-term solution").
- **What eMoney got WRONG — avoid:** the whole left rail is a wall of
  Techniques / What-Ifs / Insights / Solvers — five fighting concepts. The
  advisor has to HUNT for the solver in a busy sidebar. Pure clutter.
- **Parallax's version (per NOTES.md "Solve-For"):** keep eMoney's on-demand
  pattern, drop the sidebar. Solvers are a small set of **named life questions**
  ("Can I retire earlier?", "Can we afford this big goal?") — not a generic
  any-lever menu. Each solver, when run, GENERATES A NEW SCENARIO COLUMN with
  the solved levers filled in, sitting next to Baseline. The trade-off becomes
  the comparison itself — no new viz, no new tab, no new mode. Solver =
  scenario generator. Output is terse: just the solved %s/values, no
  explanatory sentences (advisor narrates; program shows truth).
