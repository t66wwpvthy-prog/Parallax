# Canonical Parallax Paths

| Role | Path |
|------|------|
| **App (Phase A)** | `/index.html` — liquid-glass UI (verbatim from design mock) |
| **Legacy reference** | `/archive/legacy-monolith.html` — frozen engine-wired monolith |
| **Engine** | `/engine.js` |
| **Tax engine** | `/src/tax/` (CLI only; not wired to UI) |

## Visual acceptance (Household / Map)

Reference: full-width desktop (~1400px+), **both** Client and Spouse orbs expanded.

- Three-column stage: Client orb | Household hub | Spouse orb
- Account pills arch along each orb toward center — no overlap, no jamming
- Household hub shows net worth + liquid/tangible breakdown

Phase A ships the mock as-is. Click each orb to expand pills. Do **not** tweak arc CSS in-repo unless the design mock changed first.

## Phase A rules

- `index.html` is a **verbatim copy** of `parallax-liquid-glass-merged.html`. No drive-by CSS tweaks.
- Phase A does **not** wire `engine.js` or `src/tax/`.
- Mock scenario/cash-flow numbers are illustrative until Phase B.

## Source of truth for UI

Design mock: `DESIGN REF UPDATED/parallax-liquid-glass-merged.html` (outside repo).

When updating Phase A, replace `index.html` from that file — do not edit styling in-repo unless the mock changed first.
