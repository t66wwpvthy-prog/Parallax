# Changes from the original spec

Base: `docs/mocks/guided-planning-canvas.html` (canonical vanilla-JS reference) + `docs/mocks/CANVAS-HANDOFF.md`.

## Added (spec §9 asked for these; the reference file didn't have them yet)
- Single `plan` state object (`meta` / `balance` / `income` / `incomeTax`) backing every screen.
- FILLED now calls `demoPlan()` and BLANK calls `blankPlan()` — previously FILLED/BLANK only toggled a cosmetic class with no data behind it.
- Income and deduction amount inputs are live and persist into `plan`; the tax step recomputes on every keystroke.
- Full tax engine — `computeTax` / `appliedDeduction`: 7.5% AGI floor on Medical, $40,000 SALT cap, standard-vs-itemized auto-select, full AGI/taxable-income waterfall.
- Back/Continue footer buttons now actually navigate (the reference markup had no click handlers on them).
- Logo bumped to 54px desktop / 34px mobile (from spec's ~36px) per design-review feedback for more sidebar presence.

## Simplifications to flag before this goes live
- **Est. federal tax is a single blended-rate estimate** (~18.24% of taxable income), calibrated to reproduce the demo household's reference numbers ($54,880 on $300,850 taxable). It is not true marginal-bracket + capital-gains math — the demo data has no ordinary-income/capital-gains split, which real bracket math needs. Swap in the real engine (`src/tax/`) before shipping.
- **Effective rate = est. tax ÷ AGI** (14.8% for the demo, matching spec). Flagging explicitly since est.tax ÷ total income (≈13.3%) looks plausible but is wrong.
- **SALT is one line item.** Spec describes rolling up `salt` + `real_estate_tax` + `personal_property_tax` into one capped bucket; this mock has a single "State & local taxes" row capped at $40,000.
- **Federal bracket thresholds are 2024 MFJ figures**, used as a placeholder until real 2026 tables are available.
- **"+ Other" (Balance sheet) is a non-functional placeholder**, matching spec §10 (explicitly out of scope).
- **Balance-sheet add-account buttons** remain non-functional placeholders — no line-item persistence or net-worth math; net worth is demo-seeded only.
- Added `--num` / `--value-highlight` CSS variables (present in the Parallax token foundation, missing from the original reference file's `:root`).

## Not built (matches spec's explicit out-of-scope list)
- Plan Overview / "✓" screen — Finish on Step IV intentionally has no destination.
- Variant B/C visual redesigns — buttons present, cosmetic only.
- Wiring to the live app's real tax engine or household wizard.
