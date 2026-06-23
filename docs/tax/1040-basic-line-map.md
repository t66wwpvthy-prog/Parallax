# Form 1040 basic line map

Client intake is **line-for-line** with Form 1040. This map classifies each basic line before `engine.js` integration.

## Coverage statuses

| Status | Meaning |
|--------|---------|
| **CAPTURED** | Intake accepts the value from the return; may or may not drive calculation yet. |
| **CALCULATED** | Engine computes this line from rules and upstream lines. |
| **PASS_THROUGH** | Intake accepts the value; rolls into roll-ups (e.g. line 24) but is **not** independently calculated. |
| **UNSUPPORTED_INTENTIONAL** | Not in scope yet by design (NIIT, AMT, full credit rules). |
| **ARCHITECTURE_LATER** | Needs additional form structure before calculation (Schedule D ST/LT split). |
| **BUG** | Design says one thing; implementation does another. None open for basic spine lines. |

Machine-readable source: `src/tax/core/1040BasicLineMap.js`.

---

## Header

| 1040 | Intake field | Status | Notes |
|------|--------------|--------|-------|
| Filing status | `filingStatus` | CAPTURED | Required |
| Tax year | `taxYear` | CAPTURED | Warns if engine law year differs |

---

## Income (lines 1–8)

| 1040 | Intake field | Status | Notes |
|------|--------------|--------|-------|
| 1z Wages | `income.wages` | CAPTURED → CALCULATED spine | |
| 2b Taxable interest | `income.taxableInterest` | CAPTURED | |
| 3a Qualified dividends | `income.qualifiedDividends` | CAPTURED | Feeds line 16 preferential stacking |
| 3b Ordinary dividends | `income.ordinaryDividends` | CAPTURED | |
| 4a IRA distributions | `income.iraDistributions` | CAPTURED | Gross; 4b used in spine |
| 4b Taxable IRA | `income.taxableIra` | CAPTURED | |
| 5a Pensions (gross) | `income.pensionAmount` | CAPTURED | |
| 5b Taxable pensions | `income.taxablePensions` | CAPTURED | |
| 6a Social Security (gross) | `income.socialSecurityBenefits` | CAPTURED | Worksheet via `income.socialSecurity` |
| 6b Taxable SS | `income.taxableSS` or rule | CAPTURED / CALCULATED | |
| 7 Capital gain/(loss) | `income.capitalGain` | CAPTURED | Preferential stacking; Schedule D split ARCHITECTURE_LATER |
| 8 Other income | `income.otherIncome` | CAPTURED | Alias: `income.schedule1Income` |

---

## AGI and deductions (lines 9–15)

| 1040 | Intake field | Status | Notes |
|------|--------------|--------|-------|
| 9 Total income | — | CALCULATED | |
| 10 Adjustments | `adjustments.total` or `adjustments.ira` | CAPTURED / CALCULATED | |
| 11a AGI | `passThrough.line11a` | CALCULATED | Pass-through value validation only |
| 12e Deduction | `deductions.useStandard` / `deductions.itemizedAmount` | CALCULATED / CAPTURED | Standard deduction rule when `useStandard: true` |
| 13a QBI | `deductions.qbi` | PASS_THROUGH | QBI rule not built |
| 13b Additional deductions | `deductions.additional` | PASS_THROUGH | |
| 14 Total deductions | — | CALCULATED | |
| 15 Taxable income | `passThrough.line15` | CALCULATED | Pass-through value validation only |

---

## Tax and credits (lines 16–24)

| 1040 | Intake field | Status | Notes |
|------|--------------|--------|-------|
| 16 Tax | — | CALCULATED | Ordinary + LTCG/QD stacking |
| 17 Sch 2 line 3 | `passThrough.line17` | PASS_THROUGH | |
| 18 Total before credits | — | CALCULATED | |
| 19 Credits (CTC, etc.) | `passThrough.line19` | PASS_THROUGH | Full credit rules UNSUPPORTED_INTENTIONAL |
| 20 Sch 3 line 8 | `passThrough.line20` | PASS_THROUGH | |
| 21 Total credits | — | CALCULATED | From pass-through 19+20 |
| 22 Tax after credits | — | CALCULATED | |
| 23 Other taxes (Sch 2 line 21) | `passThrough.line23` | PASS_THROUGH | |
| 24 Total tax | — | CALCULATED | Includes pass-through 17 and 23; compare `reconciliation.theirLine24` |

---

## Deferred by design

| Topic | Status |
|-------|--------|
| NIIT | UNSUPPORTED_INTENTIONAL |
| AMT | UNSUPPORTED_INTENTIONAL |
| Full Schedule 1/2/3 logic | UNSUPPORTED_INTENTIONAL |
| Schedule D short/long split | ARCHITECTURE_LATER |
| Withholding / payments (25–33) | PASS_THROUGH via `passThrough.payments` |

---

## Example intake shape

```json
{
  "id": "client-example",
  "label": "MFJ W-2 + itemized",
  "filingStatus": "marriedFilingJointly",
  "taxYear": 2025,
  "income": {
    "wages": 348867,
    "ordinaryDividends": 111,
    "qualifiedDividends": 111,
    "capitalGain": 983
  },
  "deductions": {
    "itemizedAmount": 58763
  },
  "passThrough": {
    "line17": 0,
    "line19": 0,
    "line20": 0,
    "line23": 0
  },
  "reconciliation": {
    "theirLine24": 56815
  }
}
```

## Public module

Stable entry point: `src/tax/annual1040.js`

```text
client1040Input
→ validateClient1040Intake()
→ runClient1040Intake()
→ annual1040Result
```

Fixture pack: `src/tax/tests/fixtures/annual/`
