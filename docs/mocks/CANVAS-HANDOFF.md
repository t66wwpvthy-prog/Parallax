# Parallax Guided Planning Canvas — Claude Handoff

**Purpose:** Render the onboarding wizard mock to match the approved spec. Layout and content come from the Claude onboarding design (`Parallax_Onboarding.dc_5bc9.html`); **colors, logo, and typography** use Parallax High Fidelity (dark charcoal + champagne/gold), not the original cream/forest-green palette.

**Canonical implementation (Cursor):** `canvas.html` on branch `cursor/wizard-parallax-branding-d470`  
**Also at:** `docs/mocks/guided-planning-canvas.html` (logo path `../../assets/parallax-logo.png`)

---

## 1. What to build

Single self-contained HTML file: interactive prototype with **6 navigable surfaces**:

| Key | Screen | Notes |
|-----|--------|-------|
| **W** | Plan Intake welcome | Centered hero, no sidebar |
| **1** | Step I — Family | Sidebar + main |
| **2** | Step II — Balance sheet | Sidebar + main |
| **3** | Step III — Income & expenses | Sidebar + main |
| **4** | Step IV — Tax | Sidebar + main |
| **✓** | Plan Overview (future) | Not built yet — see §8 |

**Prototype chrome (fixed, top-right):** Variant `A | B | C` · Fill `FILLED | BLANK` · Steps `W 1 2 3 4 ✓`  
**Edit FAB (fixed, bottom-right):** pill button, pencil icon + "Edit"

Demo household: **Aman & Awoman**

---

## 2. Parallax High Fidelity branding

Replace original design's cream (`#F7F4EF`) + forest green (`#274D3D`) with:

```css
:root {
  --bg: #0b0d11;
  --bg-deep: #080a0d;
  --ink: #ddd5c4;
  --ink-bright: #e7dec9;
  --ink-body: #9097a0;
  --ink-mute: #878e96;
  --ink-faint: #7d848c;
  --accent: #c6a662;
  --accent-bright: #d8c084;
  --accent-ink: #15181d;
  --line: rgba(231,222,201,0.10);
  --line-strong: rgba(231,222,201,0.16);
  --btn: linear-gradient(180deg, #d8c084, #c6a662);
  --fab: linear-gradient(180deg, #d4b06a, #a8863f);
  --font-sans: "Hanken Grotesk", system-ui, sans-serif;
  --font-serif: "Spectral", Georgia, serif;
}
```

**Fonts (Google):** Hanken Grotesk + Spectral  
**Logo:** `assets/parallax-logo.png` (HF orb + wordmark), height ~36px in sidebar — **not** `// Parallax` text mark  
**Background:** dark charcoal with subtle radial gradients (see `canvas.html` body)

---

## 3. Global layout shell (steps 1–4)

```
┌─────────────────────────────────────────────────────────┐
│ [proto bar top-right]                    [Edit FAB br]  │
├──────────┬──────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN                                         │
│ 248px    │ padding 48px 56px                            │
│          │                                              │
│ Logo     │ STEP X — TITLE (eyebrow, 11px caps)          │
│          │ Heading (Spectral, large)                    │
│ Nav:     │ Content                                      │
│ I Family │                                              │
│ II …     │                                              │
│ III …    │                                              │
│ IV …     │                                              │
│          │                                              │
│ ──────── │                                              │
│ Context  │ ← BACK              [CONTINUE / FINISH]      │
│ summary  │                                              │
└──────────┴──────────────────────────────────────────────┘
```

**Sidebar nav:** Roman numeral prefix via `data-num` (I, II, III, IV). Done steps: `✓` + muted text. Current: accent color + weight 500.

**Footer:** always `← BACK` (text, muted) + primary CTA (gold gradient button). Step 4 CTA label: **Finish** (not Continue).

---

## 4. Design discipline (mandatory)

These override any ledger/accounting patterns from the live app or filled-state reference:

1. **No accounting ledger style** — no row dividers between every line, no full-width underline fields with values floating far away or on top of the line.
2. **Compact but readable** — tight vertical spacing (7px between field rows); labels and inputs stay close.
3. **Amount inputs:** short boxed input (~68px) with `$` prefix inside the box. Pattern: `Salary · Aman` left, `[$ —]` right.
4. **Meta/select fields:** small bordered box (`min-width 108px`), not underline-only.
5. **Add actions:** outlined rectangular buttons (`+ Label`), same style as Balance sheet — not dashed ledger rows.
6. **Toggles:** segmented control (Still working / Retired; Standard / Itemized when used) — gold fill on active segment.
7. **Section headings:** Spectral serif, ~20px for sub-questions; eyebrow labels always small caps sans.

---

## 5. Screen-by-screen spec (BLANK state — primary)

### W — Plan Intake

- Eyebrow: `PLAN INTAKE`
- Title: `Aman & Awoman` (Spectral, large, centered)
- Accent rule (2px gold line)
- Button: `BEGIN`
- Footer nav (bottom-left): `I Family · II Balance sheet · III Income & expenses · IV Tax`

### Step I — Family

**Sidebar foot — THIS HOUSEHOLD:**
- Household: Aman & Awoman
- Filing status: Select…
- State: Select…
- Dependents: —

**Main:**
- Eyebrow: `STEP I — FAMILY`
- Title: `Household`
- Meta row (3 compact boxes): Filing status · State · Plan through
- Rule line
- Subhead: `Who is this plan for?`
- Person tabs: `Person 1` (active) | `Person 2` | `+ Dependent`

### Step II — Balance sheet

**Author note (from design file):** `+ Other` is where a soft dropdown to add any other account type goes.

**Sidebar foot:** Net worth → `$0` (Spectral, accent color)

**Main:**
- Eyebrow: `STEP II — BALANCE SHEET`
- Subtitle (Spectral): `Investment Accounts · Tangible Property · Debt`
- Add buttons row:
  - `+ Taxable Account`
  - `+ Traditional IRA`
  - `+ Roth IRA`
  - `+ Real estate`
  - `+ Other`

### Step III — Income & expenses

**Author note (from design file):** Top should be a **toggle** (Employed / Retired or "Still working" / "Retired"). Each choice populates a different set of default income rows below.

**Main:**
- Eyebrow: `STEP III — INCOME & EXPENSES`
- Toggle: `Still working` | `Retired`

**Still working defaults (4 rows):**
| Label | Person |
|-------|--------|
| Salary | Aman |
| Bonus | Aman |
| Salary | Awoman |
| Bonus | Awoman |

**Retired defaults (2 rows):**
| Label | Person |
|-------|--------|
| Social Security | Aman |
| Social Security | Awoman |

- Text links: `+ Add income stream` · `+ Add expense category`

### Step IV — Tax

**Scope:** Deductions only on this step. Do **not** put 401(k)/HSA adjustments here — those belong on Income in the 4-step IA (or filled-state Income & Tax in the live app).

**Sidebar foot — THIS HOUSEHOLD:**
- AGI: —
- Deductions applied: Standard · $32,600
- Federal bracket: —
- Next IRMAA tier: —

**Main:**
- Eyebrow: `STEP IV — TAX`
- Title: `The tax picture`
- Intro: `Deductions you claim, and what the planning engine computes from them. Results are read-only.`
- Panel (top + bottom border):
  - Subhead: `Any deductions to claim?`
  - Add buttons (4):
    - `+ Charitable`
    - `+ Mortgage interest`
    - `+ SALT`
    - `+ Medical`
  - Helper: `Until then, the standard deduction ($32,600 MFJ) applies automatically.`
- CTA: **Finish**

---

## 6. FILLED state reference (Step IV Tax)

When `FILLED` is active on step 4, reference content from `Parallax_Onboarding.dc_5bc9.html`:

**Deduction rows (2026 tax year):**
- Medical expenses — $8,000 entered, $0 applied (below 7.5% AGI floor)
- Charitable giving — $12,000
- Mortgage interest — $18,400
- State & local taxes — $44,800 entered, capped at $40,000

**Standard vs Itemized cards:**
- Standard: $32,600 (muted)
- Itemized: $70,400 — **AUTO-SELECTED**

**The math (read-only, computed by engine):**
- Total income: $413,000
- − Adjustments: $41,750 → AGI: $371,250
- − Deductions: $70,400 → **Taxable income: $300,850**
- Federal bracket: 24% · Capital gains: 15% · Effective rate: 14.8% · Est. federal tax: $54,880

**Filled sidebar values:** agi `$371,250`, ded `$70,400 · itemized`, bracket `24%`, irmaa `$408,000 MAGI`

---

## 7. FILLED state reference (other steps)

Use `Component.FILLED` in the design file for copy:

| Field | Filled value |
|-------|--------------|
| hh | Aman & Awoman |
| filing | Married filing jointly |
| state | California |
| investable | $4,800,000 |
| gross income | $413,000 |
| essential expense | $168,000 |

**Step 5 — Plan Overview** (screen ✓, not yet built):

**Author note:** "this section gets pushed to left side of page, summary page takes the hero"

- Title: `The household, assembled.`
- Sub: `Aman & Awoman · Married filing jointly · California`
- Rows: I Family · II Balance sheet · III Income · III Expenses · IV Tax — each with status + `EDIT →`
- CTA: `ENTER PLANNING`
- Note: "Every step stays editable after planning begins."

---

## 8. Component patterns (copy from `canvas.html`)

| Pattern | Class | Use |
|---------|-------|-----|
| Segmented toggle | `.work-toggle` | Income employed/retired |
| Add button row | `.acct-btns` | Balance sheet accounts, Tax deductions |
| Compact amount row | `.field-row` + `.field-in-wrap` + `.field-in` | Income defaults |
| Meta field | `.meta-field` + `.val` | Family filing/state/plan through |
| Person selector | `.person-tabs` | Family members |
| Text add links | `.add-links` | Income stream / expense category |
| Tax panel | `.tax-panel` | Bordered deduction section |
| Intro copy | `.wiz-main__intro` | Step IV description |

---

## 9. JavaScript behavior (minimum)

```javascript
// Screen navigation: W, 1, 2, 3, 4 via proto bar + Begin button
// Income toggle: employed ↔ retired swaps INCOME_DEFAULTS rows
// FILLED/BLANK: toggle should swap blank vs filled content per step (wired on step 4+ when built)
// Variant A/B/C: visual only for now (future layout variants)
```

Income defaults object:
```javascript
const INCOME_DEFAULTS = {
  employed: [
    { type: "Salary", person: "Aman" },
    { type: "Bonus", person: "Aman" },
    { type: "Salary", person: "Awoman" },
    { type: "Bonus", person: "Awoman" },
  ],
  retired: [
    { type: "Social Security", person: "Aman" },
    { type: "Social Security", person: "Awoman" },
  ],
};
```

---

## 10. Out of scope for this mock

- Wiring to Parallax `engine.js` or `src/tax/`
- Live app household wizard (`ui/householdWizard.js`) — different 4-step IA (Profile / Balance Sheet / Income & Tax combined / Summary)
- Variant B/C visual redesigns (only A is specced)
- Functional dropdown on `+ Other` (balance sheet) — placeholder button only
- Tax math — display only in filled state

---

## 11. Acceptance checklist

- [ ] Dark Parallax HF theme + logo on all wizard steps
- [ ] All 5 blank screens (W + 1–4) match content above
- [ ] No ledger-style row borders on income/tax inputs
- [ ] Income toggle swaps 4 vs 2 default rows
- [ ] Tax step has 4 deduction add-buttons, not adjustment fields
- [ ] Step 4 sidebar shows AGI / Deductions / Bracket / IRMAA
- [ ] Finish button on step 4
- [ ] Proto bar navigates between screens
- [ ] Mobile: sidebar stacks above main (@860px)

---

## 12. Paste prompt for Claude

```
Build a single self-contained HTML file: Parallax Guided Planning Canvas onboarding mock.

READ FIRST: docs/mocks/CANVAS-HANDOFF.md (this spec) and match canvas.html on branch cursor/wizard-parallax-branding-d470 as the implementation reference.

Requirements:
1. Layout/content from Parallax_Onboarding.dc_5bc9.html (variant A, blank states)
2. Colors/logo from Parallax High Fidelity: dark charcoal bg, champagne/gold accent, Hanken Grotesk + Spectral, assets/parallax-logo.png
3. Screens: W (welcome), Steps I–IV, proto bar W/1/2/3/4/✓
4. Design discipline: compact fields, short $ inputs in boxes, NO ledger row lines, NO full-width underlines
5. Step III: Still working/Retired toggle → 4 salary/bonus rows OR 2 SS rows
6. Step IV: "The tax picture" + 4 deduction add-buttons (+ Charitable, + Mortgage interest, + SALT, + Medical) + standard deduction helper; Finish CTA
7. Honor author notes: + Other dropdown placeholder; income toggle; overview page deferred

Deliver one HTML file with inline CSS + minimal JS for navigation and income toggle.
Optionally wire FILLED states using §6–7 of the handoff doc.
```

---

## 13. Files to attach when prompting Claude

1. This file: `docs/mocks/CANVAS-HANDOFF.md`
2. Reference implementation: `canvas.html`
3. Original layout reference: `Parallax_Onboarding.dc_5bc9.html`
4. Logo asset: `assets/parallax-logo.png`
