# Claude — Guided Planning Canvas (slim spec)

**Branch:** `cursor/wizard-parallax-branding-d470`  
**Reference file:** `canvas.html` (match structure/CSS; improve per this doc)  
**Logo:** `assets/parallax-logo.png` (~36px sidebar height)

---

## Deliverable

One self-contained HTML file. Inline CSS + JS. Parallax HF theme (dark charcoal + gold `#c6a662`, Hanken Grotesk + Spectral).

**No Parallax engine.js** — but the mock **must compute** sidebar + summary from state (same pattern the real app will use).

---

## Screens (proto bar: `W | 1 | 2 | 3 | 4 | ✓`)

| Key | Screen |
|-----|--------|
| W | Welcome — centered, `Aman & Awoman`, BEGIN |
| 1 | Family — sidebar + meta fields + person tabs |
| 2 | Balance sheet — 5 add buttons |
| 3 | Income — Still working/Retired toggle + default rows |
| 4 | Tax — deduction inputs → computed read-only summary |
| ✓ | Plan Overview — **defer** |

Chrome: top-right `A|B|C` · `FILLED|BLANK` · step keys; bottom-right Edit FAB.

---

## Design rules (mandatory)

- Compact boxed `$` inputs (~68px), label left — **not** ledger rows or full-width underlines
- Add actions = outlined `+ Label` buttons (same as balance sheet)
- Segmented toggles: gold active segment
- Sidebar 248px; footer `← Back` + gold CTA (`Finish` on step 4)

---

## Data model (single source of truth)

Do **not** maintain separate hardcoded HTML for FILLED vs BLANK. One state object; render from it.

```javascript
const plan = {
  meta: { filingStatus: "marriedFilingJointly" },
  income: { total: 0, adjustments: 0 },       // from step 3 later; seed in FILLED demo
  incomeTax: {
    deductions: [],  // { typeId, amount } — typeId: medical|charitable|mortgage_interest|salt
  },
};

// FILLED toggle → Object.assign(plan, DEMO_PLAN) then re-render
// BLANK toggle → reset deductions [], income zeros, re-render
// + button → push { typeId, amount: 0 }; re-render
// $ input change → update amount; re-render
```

**DEMO_PLAN** (FILLED seed — same shape, not a separate UI):

```javascript
const DEMO_PLAN = {
  income: { total: 413000, adjustments: 41750 },
  incomeTax: {
    deductions: [
      { typeId: "medical", amount: 8000 },
      { typeId: "charitable", amount: 12000 },
      { typeId: "mortgage_interest", amount: 18400 },
      { typeId: "salt", amount: 44800 },
    ],
  },
};
```

---

## Step IV — Tax compute (client-side prototype)

```javascript
const RULES = {
  standardDeductionMFJ: 32600,
  saltCapMFJ: 40000,
  medicalAgiFloorPct: 0.075,
  // simplified bracket lookup for demo — or flat effective rate from demo
};

function appliedDeduction(typeId, entered, agi) {
  if (typeId === "medical") {
    const floor = agi * RULES.medicalAgiFloorPct;
    return { applied: Math.max(0, entered - floor), note: entered > 0 && entered <= floor ? "below 7.5% AGI floor" : null };
  }
  if (typeId === "salt") {
    const applied = Math.min(entered, RULES.saltCapMFJ);
    return { applied, note: entered > RULES.saltCapMFJ ? `capped at $${RULES.saltCapMFJ.toLocaleString()}` : null };
  }
  return { applied: entered, note: null };
}

function computeTaxSummary(plan) {
  const agi = plan.income.total - plan.income.adjustments;
  const rows = plan.incomeTax.deductions.map(d => {
    const { applied, note } = appliedDeduction(d.typeId, d.amount, agi);
    return { ...d, applied, note };
  });
  const itemized = rows.reduce((s, r) => s + r.applied, 0);
  const standard = RULES.standardDeductionMFJ;
  const deductionUsed = Math.max(standard, itemized);
  const method = itemized > standard ? "itemized" : "standard";
  const taxableIncome = Math.max(0, agi - deductionUsed);
  // bracket / effective / estTax — simplified table or demo formulas OK for mock
  return { agi, rows, standard, itemized, deductionUsed, method, taxableIncome, /* bracket, estTax */ };
}
```

**Render loop:** `computeTaxSummary(plan)` → paint deduction rows (entered + applied + note), Standard/Itemized cards, sidebar, "The math" block. Every input change re-runs compute.

**Row UI:** label left, `$` input for **entered** amount; show **applied** + note inline when `applied !== entered` or note present.

---

## Step IV — Tax UI

**Inputs:** `+ Charitable` · `+ Mortgage interest` · `+ SALT` · `+ Medical` (append row if not duplicate, or allow multiples — prefer one row per type)

**Blank helper:** *Until then, the standard deduction ($32,600 MFJ) applies automatically.*

**Read-only (always from compute):** sidebar AGI / deductions / bracket; Standard vs Itemized cards; "The math" block.

**No** wages, 401(k), HSA on this step.

---

## Step III — Income toggle

Same pattern as tax: state + render, not two HTML blocks.

```javascript
const INCOME_DEFAULTS = { employed: [...], retired: [...] };
// toggle swaps income rows in state, re-render
```

---

## CSS tokens

```css
:root {
  --bg:#0b0d11; --bg-deep:#080a0d; --ink:#ddd5c4; --ink-bright:#e7dec9;
  --ink-body:#9097a0; --ink-mute:#878e96; --accent:#c6a662; --accent-bright:#d8c084;
  --accent-ink:#15181d; --line:rgba(231,222,201,0.10);
  --btn:linear-gradient(180deg,#d8c084,#c6a662);
  --font-sans:"Hanken Grotesk",system-ui,sans-serif;
  --font-serif:"Spectral",Georgia,serif;
}
```

---

## Out of scope

- Parallax `engine.js` / `src/tax/` integration (real app replaces `computeTaxSummary` with `buildCurrentIncomeTaxSummary`)
- Plan Overview (✓), variant B/C
- Functional `+ Other` dropdown

---

## Acceptance

- [ ] HF dark theme + logo all steps
- [ ] Tax step: + buttons add rows; `$` edits recalculate applied amounts live
- [ ] Medical shows 7.5% floor; SALT shows $40k cap — **computed**, not static copy
- [ ] FILLED seeds DEMO_PLAN; BLANK clears; **same render path**
- [ ] Income toggle swaps 4 vs 2 rows via state
- [ ] No ledger-style inputs
