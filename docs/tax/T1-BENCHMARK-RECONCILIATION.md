# T1 authoritative benchmark reconciliation

**Status:** locked 2026-07-10

**Fixture:** `src/tax/tests/fixtures/annual/annual-08-authoritative-2025-mfj.json`

**Return:** redacted 2025 married filing jointly

**Tolerance:** $1.00 on Form 1040 line 24

## Result

| Line | Filed return | Parallax | Difference |
|------|-------------:|---------:|-----------:|
| Form 1040 line 16 | $8,760.00 | $8,759.40 | -$0.60 |
| Form 1040 line 23 | $1,571.00 | $1,571.00 pass-through | $0.00 |
| Form 1040 line 24 | $10,331.00 | $10,330.40 | **-$0.60** |

The benchmark passes the agreed $1.00 tolerance. Parallax uses exact bracket math for the $76,970 ordinary-taxable portion. The filed Qualified Dividends and Capital Gain Tax Worksheet uses the IRS Tax Table and reports $8,760, producing the $0.60 difference.

## Source evidence locked in the fixture

The fixture records only redacted dollar facts; it contains no names, addresses, Social Security numbers, employer names, or account numbers.

### Form 1040

| Line | Amount |
|------|-------:|
| 1z | $190,868 |
| 3a | $3,358 |
| 3b | $17,838 |
| 7 | -$3,000 |
| 11 | $283,193 |
| 12 | $201,486 |
| 13 | $1,379 |
| 15 | $80,328 |
| 16 | $8,760 |
| 17 | $0 |
| 18 | $8,760 |
| 19 | $0 |
| 20 | $0 |
| 21 | $0 |
| 22 | $8,760 |
| 23 | $1,571 |
| 24 | $10,331 |

### Supporting forms

- W-2 box 5 Medicare wages total: **$204,218**.
- Schedule 2 line 4 self-employment tax: **$1,028**.
- Schedule 2 line 11 Additional Medicare Tax: **$0**.
- Schedule 2 line 12 Net Investment Income Tax: **$543**.
- Schedule 2 line 21: **$1,571** (`$1,028 + $543`).
- Schedule D line 7: **-$7,668**; line 15: **$12**; line 16: **-$7,656**; lines 18 and 19: **$0**.
- Form 1040 line 16 uses the **Qualified Dividends and Capital Gain Tax Worksheet**.

The originally transcribed `$1,071` for Schedule 2 line 21 and Form 1040 line 23 was confirmed as `$1,571`. The correction is independently cross-footed by both Schedule 2 (`$1,028 + $543`) and Form 1040 (`$8,760 + $1,571 = $10,331`).

## Line 16 worksheet bridge

Schedule D line 16 is a loss. Under the Qualified Dividends and Capital Gain Tax Worksheet, the Schedule D gain component is therefore `$0`; the preferential component is only the `$3,358` of qualified dividends.

| Worksheet fact | Amount |
|----------------|-------:|
| Taxable income | $80,328 |
| Qualified dividends | $3,358 |
| Schedule D gain used by worksheet | $0 |
| Ordinary-taxable portion | $76,970 |
| Filed Tax Table result | $8,760 |
| Parallax exact-bracket result | $8,759.40 |

Primary references:

- IRS 2025 Form 1040 instructions, Qualified Dividends and Capital Gain Tax Worksheet: https://www.irs.gov/instructions/i1040gi
- IRS 2025 Schedule 2: https://www.irs.gov/pub/irs-prior/f1040s2--2025.pdf
- IRS 2025 Schedule D instructions: https://www.irs.gov/instructions/i1040sd

## T1/T2/T3 attribution

| Fact or difference | Phase treatment |
|--------------------|-----------------|
| Filed line 15 and worksheet split | **T1 fixture fact**; sufficient to benchmark line 16 without inventing missing income categories |
| $0.60 line 16/24 difference | **Accepted T1 tolerance**; exact bracket math versus the IRS Tax Table interval |
| Schedule D short-/long-term classification | **T2 calculation work**; captured in T1, not independently calculated yet |
| $1,028 self-employment tax | **T3 rule work**; passed through on line 23 in T1 |
| $543 NIIT | **T3 rule work**; passed through on line 23 in T1 |
| $0 Additional Medicare Tax | **T1 evidence**; the previous estimated Additional Medicare gap does not apply to this return |

## Retired legacy comparison

`src/tax/tests/fixtures/engine-year/demo-wages.json` remains as a synthetic regression case only. Its former `$56,815` client target and `$1,321.95` gap were not supported by complete client-return evidence and are no longer authoritative.

No tax rule, planner adapter, engine, or UI behavior changed in T1.
