# Scenarios Visual Consistency QA

## Comparison target

- Source visual truth:
  - `verify-out/qa-reference-scenarios-compare.png`
  - `verify-out/qa-reference-scenarios-focus.png`
  - `verify-out/qa-reference-cashflow.png`
- Rendered implementation:
  - `verify-out/qa-implementation-scenarios-compare.png`
  - `verify-out/qa-implementation-scenarios-focus.png`
  - `verify-out/qa-implementation-cashflow.png`
- Viewport: 1535 x 896 CSS pixels, device scale factor 1.
- States: Scenarios Compare, Scenarios Focus with Baseline selected, and Scenarios Cash Flow with Baseline and Typical path selected.

## Full-view comparison evidence

- Compare uses the reference's centered 1320px planning stage, wide label gutter, three equal scenario columns, restrained near-black panel, warm hairlines, and flat delta treatment.
- Focus reproduces the reference's approximately 930px primary panel plus 360px scenario rail, including the subdued selected-card gold fade and distinct green, gold, and rust semantic accents.
- Cash Flow uses the reference's open ledger treatment: no enclosing glass card, quiet horizontal rules, serif financial figures, compact summary statistics, and restrained path controls.
- The mock-only supplemental header-state strip was intentionally excluded. Production header structure, live values, controls, disclosures, and tax columns remain authoritative.

## Focused region comparison evidence

- Success rings: reviewed at hero, comparison-column, rail-card, and Cash Flow summary sizes. Stroke weights were reduced to match the reference's quieter rings without changing the underlying values.
- Focus rail: reviewed selected and unselected cards, border opacity, panel fill, text hierarchy, and stress-result colors. The selected card retains a subtle warm fade rather than a bright gold fill.
- Cash Flow ledger: reviewed header spacing, row rhythm, column alignment, number typography, positive/negative returns, goal gold, and the retirement/RMD markers.

## Findings

- No actionable P0, P1, or P2 visual mismatches remain.
- Production-only content creates expected differences from the mock: current scenario results, the Federal Total / Engine Path comparison, editable controls, and the Probability of Success label remain because the implementation brief explicitly preserves live behavior and copy.
- No raster imagery is part of these three Scenarios views. The existing Parallax brand asset remains unchanged in the production header.

## Required fidelity surfaces

- Fonts and typography: Spectral remains the display and financial-number face; Hanken Grotesk remains the interface face. Weight, tracking, and hierarchy now follow the reference more closely.
- Spacing and layout rhythm: the 1320px stage and 930px/360px Focus split match the source proportions at the comparison viewport. No clipping or overlap was observed.
- Colors and visual tokens: near-black panels, champagne text, muted gold, sage success, and rust downside roles align with the source. Heavy bloom, fog, and elevation were removed.
- Image quality and asset fidelity: no new image assets were required; the production logo was preserved.
- Copy and content: production copy and engine-derived values were preserved intentionally.
- Accessibility and interaction states: focus rings remain present; buttons, tabs, toggles, steppers, scenario selection, Cash Flow paths, and persistence behavior passed the browser verification suite.

## Comparison history

1. Initial implementation comparison found a P2 mismatch: progress rings were visibly heavier than the reference.
2. Fix applied: Compare, Focus, rail, and Cash Flow ring strokes were reduced; the compact Compare and Cash Flow rings were also resized to the reference scale.
3. Post-fix evidence: the 1535 x 896 implementation captures listed above show the quieter ring hierarchy with unchanged values and interactions. No additional P0/P1/P2 issues were found.

## Verification

- `npm test`: 347 tests, 346 passed, 1 skipped, 0 failed.
- Full browser verification passed at both the standard 1920 x 1080 project viewport and the 1535 x 896 comparison viewport.
- Compare, Focus, Cash Flow, Sequencing, Household, Goals, persistence, and header contracts all passed.

final result: passed
