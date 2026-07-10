# T3 Schedule 2 handoff

**Branch:** `feat/tax-t3-schedule2`  
**Base:** `main` @ `d6e1e1b` (T1 #80 + T2 #81 merged)  
**Validation:** `npm test` only (no `verify.mjs` — no UI)

## Status (SE-only scope)

**Self-employment tax calculated** — `FED_SELF_EMPLOYMENT_TAX` rule wired through `annualFederalTax.js`.

- Schedule SE: $833 SS + $195 Medicare = **$1,028** (2025 IRS Schedule SE, whole-dollar rounding)
- Line 23: **$1,028 calculated SE + $543 supplied NIIT = $1,571**
- Line 24: **$10,330.40** (delta -$0.60 vs filed $10,331 — within $1 tolerance)
- `taxTotalScope`: **FULL_1040**
- **172 tests passing**
- NIIT explicitly **supplied** via `schedule2.netInvestmentIncomeTax` — no NIIT rule in this PR

## Authoritative benchmark

Fixture: `src/tax/tests/fixtures/annual/annual-08-authoritative-2025-mfj.json`

| Input | Value |
|-------|------:|
| scheduleSE[0].netEarningsFromSelfEmployment | $6,717 |
| schedule2.netInvestmentIncomeTax | $543 (supplied) |
| schedule2.additionalMedicareTax | $0 |
| Line 23 expected | $1,571 |
| Line 24 expected | $10,330.40 |

## Deferred

| Item | Phase |
|------|-------|
| NIIT rule (Form 8960) | T3+ or separate PR |
| AMT / line 17 | later |
| Credits lines 19–20 | later |
| Additional Medicare calculation | $0 on this return |
| Planner adapters | T4 |
| UI / sidecar | T5 |

## Success criteria

- [x] annual-08 line 23 = $1,571 (SE calculated, NIIT supplied)
- [x] annual-08 line 24 within $1 vs $10,331
- [x] `taxTotalScope` = `FULL_1040`
- [x] `npm test` — 172 passed
- [x] No `engine.js` or `ui/*` changes
