# Claude — Guided Planning Canvas (slim spec)

**Branch:** `cursor/wizard-parallax-branding-d470`  
**Reference file:** `canvas.html` (match structure/CSS; improve per this doc)  
**Logo:** `assets/parallax-logo.png` (~36px sidebar height)

---

## Deliverable

One self-contained HTML file. Inline CSS + minimal JS. Parallax HF theme (dark charcoal + gold `#c6a662`, Hanken Grotesk + Spectral). **No** engine/tax backend.

---

## Screens (proto bar: `W | 1 | 2 | 3 | 4 | ✓`)

| Key | Screen |
|-----|--------|
| W | Welcome — centered, `Aman & Awoman`, BEGIN |
| 1 | Family — sidebar + meta fields + person tabs |
| 2 | Balance sheet — 5 add buttons |
| 3 | Income — Still working/Retired toggle + default rows |
| 4 | Tax — deductions panel + read-only summary (filled) |
| ✓ | Plan Overview — **defer** |

Chrome: top-right `A|B|C` · `FILLED|BLANK` · step keys; bottom-right Edit FAB.

---

## Design rules (mandatory)

- Compact boxed `$` inputs (~68px), label left — **not** ledger rows or full-width underlines
- Add actions = outlined `+ Label` buttons (same as balance sheet)
- Segmented toggles: gold active segment
- Sidebar 248px; footer `← Back` + gold CTA (`Finish` on step 4)

---

## Step IV — Tax (important)

**Inputs only:** deductions. No wages, 401(k), HSA here (Income step).

**Blank:** subhead *Any deductions to claim?* + buttons:
`+ Charitable` · `+ Mortgage interest` · `+ SALT` · `+ Medical`  
Helper: *Until then, the standard deduction ($32,600 MFJ) applies automatically.*

**Sidebar blank:** AGI — · Deductions Standard · $32,600 · Bracket — · IRMAA —

### FILLED state (hardcode display — no live math)

When user clicks **FILLED** on step 4, show:

**Deduction rows** (compact `$` rows or list, not ledger):
| Row | Entered | Applied / note |
|-----|---------|----------------|
| Medical expenses | $8,000 | $0 — *below 7.5% AGI floor* |
| Charitable giving | $12,000 | $12,000 |
| Mortgage interest | $18,400 | $18,400 |
| State & local taxes | $44,800 | $40,000 — *capped at $40,000* |

**Rule labels (copy only — do not calculate):**
- Medical floor: **7.5% of AGI**
- SALT cap: **$40,000** (MFJ)

**Standard vs Itemized cards:** Standard $32,600 (muted) · Itemized **$70,400** AUTO-SELECTED

**The math** (read-only block):
- Total income $413,000 → − Adjustments $41,750 → **AGI $371,250**
- − Deductions $70,400 → **Taxable income $300,850**
- Federal 24% · LTCG 15% · Effective 14.8% · Est. tax **$54,880**

**Sidebar filled:** AGI $371,250 · Deductions $70,400 itemized · Bracket 24% · IRMAA $408,000 MAGI

Clicking `+ Medical` / `+ SALT` in blank may append an empty `$` row; filled toggle swaps to table above.

---

## Step III — Income toggle

```javascript
const INCOME_DEFAULTS = {
  employed: [
    { type:"Salary", person:"Aman" }, { type:"Bonus", person:"Aman" },
    { type:"Salary", person:"Awoman" }, { type:"Bonus", person:"Awoman" },
  ],
  retired: [
    { type:"Social Security", person:"Aman" },
    { type:"Social Security", person:"Awoman" },
  ],
};
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

- Real tax math, engine.js, live app wizard
- Plan Overview (✓), variant B/C layouts
- Functional `+ Other` dropdown

---

## Acceptance

- [ ] HF dark theme + logo all steps
- [ ] W + steps 1–4 blank match above
- [ ] FILLED step 4 shows deduction limits copy (7.5% floor, $40k SALT cap) + math block
- [ ] Income toggle swaps 4 vs 2 rows
- [ ] No ledger-style inputs
