# T3 Schedule 2 handoff

**Branch:** `feat/tax-t3-schedule2`  
**Base:** `main` @ `d6e1e1b` (T1 #80 + T2 #81 merged)  
**Validation:** `npm test` only (no `verify.mjs` — no UI)

## Goal

Calculate **Form 1040 line 23** taxes independently so annual-08 reaches honest `FULL_1040` without pass-through shortcuts.

Today line 23 **$1,571** is supplied as pass-through:
- Schedule 2 line 4 self-employment tax: **$1,028**
- Schedule 2 line 12 NIIT: **$543**
- Additional Medicare Tax: **$0** (W-2 box 5 = $204,218)

## Authoritative benchmark (do not break)

Fixture: `src/tax/tests/fixtures/annual/annual-08-authoritative-2025-mfj.json`

| Result | Value |
|--------|------:|
| Line 16 | $8,759.40 |
| Line 23 (filed) | $1,571 |
| Line 24 (filed) | $10,331 |
| Parallax line 24 today | $10,330.40 |
| Tolerance | $1.00 — must still pass |

## T3 work items

### 1. Self-employment tax rule

- File: `src/tax/federal/rules/selfEmploymentTax.js` + test
- Output: Schedule 2 line 4 amount
- Register in `rulesLedger.js`

### 2. NIIT rule

- File: `src/tax/federal/rules/netInvestmentIncomeTax.js` + test
- Output: Schedule 2 line 12 amount
- Register in `rulesLedger.js`

### 3. Composer wiring

- `annualFederalTax.js` — calculate line 23 from Schedule 2 roll-up when inputs present
- Remove annual-08 `passThrough.line23`
- Supply rule inputs in fixture (SE income facts, NII components from dividends/gains evidence)

### 4. Tests

- Per-rule unit tests
- annual-08 integration: line 23 = $1,571 calculated, line 24 within tolerance
- Existing synthetic fixtures unchanged unless intake shape requires it

## Out of scope (T3)

| Item | Phase |
|------|-------|
| AMT / Schedule 2 lines 2–3 (line 17) | later |
| Child tax credit / Schedule 3 (lines 19–20) | later |
| IRS Tax Table ($0.60 line 16 gap) | optional |
| Additional Medicare Tax calculation | only if benchmark needs it ($0 here) |
| Planner adapters | T4 |
| UI / sidecar | T5 |

## Success criteria

- [ ] annual-08 line 23 calculated as $1,571 (not pass-through)
- [ ] annual-08 line 24 still within $1 vs $10,331
- [ ] `taxTotalScope` = `FULL_1040`
- [ ] `npm test` — all pass
- [ ] No `engine.js`, `src/planning/tax/*`, or `ui/*` changes
