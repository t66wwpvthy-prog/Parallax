# Real-dollar projection ↔ nominal tax contract

**Status:** Adopted target convention. Federal path does **not** fully implement the bridge yet — see § Current vs target.

**Owners:** `engine.js` (real cash flows, withdrawals, RMDs) · `src/tax/` (nominal Form 1040) · `src/planning/tax/` (boundary conversion)

**Related:** `docs/TaxEngineEngineJsBoundary.md` · `docs/tax/1040-basic-line-map.md` · `src/planning/tax/realNominalBridge.js`

---

## Target convention

Parallax projects in **today’s dollars** (real returns, real spending). Federal tax law is **nominal** (brackets, deductions, preferential thresholds, IRMAA).

For each modeled calendar year at projection lag \(k\) years from the as-of year:

1. **Inflate** that year’s real cash-flow facts into nominal dollars:  
   `nominal = real × (1 + LONGRUN_INFLATION)^k`
2. **Calculate tax** with the tax engine on those nominal facts using that year’s law tables.
3. **Deflate** the tax result (and any tax-driven cash retained) back to real:  
   `realTax = nominalTax / (1 + LONGRUN_INFLATION)^k`
4. Feed **real** tax into the simulation (funding / gap / reinvestment).

Do **not** maintain a parallel set of “real-dollar” tax brackets.

Inflation rate for the bridge: `LONGRUN_INFLATION` in `engine.js` (currently 2.5%), unless a path supplies a documented year-specific CPI series later.

---

## Conversion boundary

```
engine.js (real $)
  → planning adapter: inflate selected year facts
  → src/tax (nominal $ Form 1040)
  → planning adapter: deflate liability / line items needed by the sim
  → engine.js (real $ funding)
```

- Tax rules never import `engine.js` and never apply inflation themselves.
- Planning owns the bridge (`realNominalBridge.js`).
- UI must not invent a second convention.

---

## Topic checklist

| Topic | Real projection | Nominal tax | Notes |
|-------|-----------------|-------------|--------|
| **Wages / retirement income** | Real amounts on rows / streams | Inflate before ordinary income | `taxablePct` applies in real space before inflate |
| **Social Security** | PIA already today’s $; flat real once claimed | Inflate benefits + worksheet companions for §86 | Shortcut still uses 85% × ordinary (approximate) |
| **Capital gains** | Derived from taxable withdrawals / sale events | Preferential stacking on **nominal** preferential income | Not a free-floating wizard income driver; see § Capital gains |
| **Deductions** | Entered in today’s $ | Inflate itemized amounts; standard deduction stays table nominal | |
| **Brackets** | — | Always law-table nominal for the tax year | Never deflate brackets into real |
| **IRMAA** | — | Thresholds are nominal MAGI | **Not modeled** in tax engine today; UI discloses |
| **RMDs** | Required $ computed in real on Traditional sleeve | Inflate taxable IRA / RMD income for 1040 | Start age: `getRmdStartAge` / inferred birth year |
| **Tax → sim** | Liability and funding in real $ | After deflate | Federal funding converges on real gap today (see Current) |

---

## Capital gains (product rules)

Projected capital gains are almost always an **output of taxable funding**, not a wizard income amount.

### 1. Path / tax-bucket realization (primary)

- Spending, goals, or a funding counterfactual (“pay from taxable vs IRA”) drives a **taxable-sleeve withdrawal**.
- Withdrawal proceeds = cash; **balance and cost basis decline**.
- Only the gain portion is taxable income (`taxableCapitalGain`, `taxableGainFraction`).
- Cash flow and tax-bucket compares must use this same path — do **not** also type that gain as wizard “capital gains income.”

### 2. External sale events (exception)

- Sales **outside** the modeled brokerage path (property, business, known one-off with proceeds + basis).
- Structured as a **sale event** (proceeds, basis, timing), not a naked LTCG/STCG income line.
- Portfolio balances move only if the event sells modeled shares.

### 3. Tax-only facts (not projection drivers)

- `plan.incomeTax.realizedGains` (and similar current-year return facts) may inform a tax **snapshot**.
- They must **not** create engine cash or change withdrawals/balances (pinned by test).
- Do not use them to explore “what if we fund from taxable” — use a withdrawal / bucket lever instead.

### Consistency

| Allowed | Forbidden |
|---------|-----------|
| Taxable draw → implied gain → tax → lower balance | Book CG for tax with **no** portfolio decrease (phantom income) |
| Same need funded from IRA vs taxable (different tax shape) | Same sale counted as income row **and** full withdrawal |
| External sale event with proceeds + basis | Free-floating wizard “$LTCG” driving the multi-year plan |

### Asset sales (properties)

Earmarked property sales already use an inflate → tax-at-flat-CG-rate → deflate bridge inside `resolveInputs` (shortcut). Federal reconstruction of that sale gain remains a known gap (see T4 handoff).

---

## Current vs target

| Path | Current behavior | Target |
|------|------------------|--------|
| Default shortcut tax | Flat rates on **real** cash (implicit real≈nominal) | Acceptable interim; federal path is the accuracy path |
| Federal attach / funding | Real row cash fed to **calendar-year** brackets with **no** inflate/deflate | Inflate facts → 1040 → deflate liability → fund in real |
| Property asset sale | Inflate/deflate with `LONGRUN_INFLATION` (shortcut CG) | Keep; align federal sale gain when wired |
| IRMAA | Not modeled | Nominal MAGI after bridge, when rule exists |
| STCG vs LTCG character | Line 7 may fall back to all-LTCG without Schedule D | Preserve character through bridge |

Until the federal bridge is wired, treat current federal results as **same-year / real≈nominal** approximations and disclose that in advisor-facing tax copy where relevant.

---

## Implementation helpers

- `src/planning/tax/realNominalBridge.js` — `inflationFactor`, `toNominal`, `toReal`, `projectionLagYears`
- Tests pin bridge math and the capital-gains product rules above

Wiring the federal adapter to call this bridge is a follow-on change; this PR locks the contract.
