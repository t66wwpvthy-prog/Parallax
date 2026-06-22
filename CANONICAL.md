# Canonical Parallax Paths

| Role | Path |
|------|------|
| **Live app (Phase A)** | `/parallax.html` — liquid-glass UI |
| **Pages redirect only** | `/index.html` — 10-line redirect to `parallax.html` (not the app) |
| **Legacy reference** | `/archive/legacy-monolith.html` — frozen monolith, never deployed |
| **Engine** | `/engine.js` |
| **Tax engine** | `/src/tax/` (CLI only) |

## Visual acceptance (Household / Map)

Reference: full-width desktop (~1400px+), **both** Client and Spouse orbs expanded.

- Three-column stage: Client orb | Household hub | Spouse orb
- Account pills arch along each orb toward center — no overlap, no jamming
- Household hub shows net worth + liquid/tangible breakdown

## Phase A rules

- `parallax.html` is a **verbatim copy** of `parallax-liquid-glass-merged.html`. No drive-by CSS tweaks.
- Do **not** put the app back in `index.html`. Root `index.html` is redirect-only for GitHub Pages.
- Phase A does **not** wire `engine.js` or `src/tax/`.
