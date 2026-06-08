---
name: engine-guard
description: Run engine.test.js and report pass/fail. Use after any change to engine.js or anything the engine consumes. The engine is the single TRUTH SOURCE per CLAUDE.md — if these tests fail, STOP and reconcile before continuing.
---

# Engine Guard

The engine is sacred (see CLAUDE.md). It is pure computation, 98 years of real
return data, three account types, path-consistent Monte Carlo — and verified.

## Rule

You may NOT modify `engine.js` casually. If you must touch it:

1. Discuss the change with Nathan FIRST. Explain what truth is being added or
   refined and why. Get explicit agreement before editing.
2. Make the change.
3. Run this skill.
4. If any test fails, STOP. Reconcile. Do not silently rewrite the test to
   match new behavior — the test encodes a property we want to preserve.

## Run

```bash
node --test engine.test.js
```

Expected: 38 tests, all pass.

## What the tests lock

- Return data spans 1928–2025 (≥90 years).
- `runSimulation` returns a success rate in [0, 100] with terminal percentiles.
- Identical inputs + identical paths give identical results (reproducibility).
- Higher-equity allocations have higher expected returns.
- Retiring into 1973 is materially worse than the average (sequence risk).
- Reversing a historical path uses the SAME returns in opposite order.
- Historical paths honor overrides (e.g. a spending bump).
- Pension uses a discrete benefit-by-age map (no interpolation).
- Recurring liabilities reduce wealth, stop at endAge, erode in real terms.
- A pre-retirement lump sum debits the portfolio (no longer ignored).
- Empty liabilities = byte-identical to before (no regression).
- Property sales net commission, mortgage payoff, taxes, and proceeds.
- Healthcare real growth and other-income taxability flow through retirement rows.
- Savings splits and account buckets affect ending wealth as expected.

A failure in any of these = a behavior the project explicitly trusts has
changed. Treat it as a stop sign.
