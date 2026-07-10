# Parallax tax — GPT branch guide

**Read this first in every tax chat.**

## Active branch (use this)

| Branch | Purpose | Base |
|--------|---------|------|
| **`feat/tax-t2-income-spine`** | **Current tax work** — lines 1–16, Schedule D ST/LT | `main` @ `7f2d057` |

```powershell
git fetch origin
git checkout feat/tax-t2-income-spine
git pull origin feat/tax-t2-income-spine   # after first push; until then: git merge origin/main
npm test                                   # must be 167 passed before claiming done
```

Optional isolated worktree (keeps Household edits separate):

```powershell
git worktree add ../Parallax-tax-t2 origin/main -b feat/tax-t2-income-spine
cd ../Parallax-tax-t2
```

## Closed / merged (do not extend)

| Branch | Status | Notes |
|--------|--------|-------|
| `feat/tax-t1-benchmark` | **Merged** — PR #80 → `main` | T1 complete; do not commit new tax work here |
| `main` | Includes T1 @ `7f2d057` | Merge T2 PRs into `main` when ready |

## Do NOT use for tax work

| Branch / tree | Reason |
|---------------|--------|
| `feat/household-wizard` | Household UI — unrelated dirty workspace |
| `feat/tax-1040-spine` | Stale historical branch |
| `feat/tax-typical-path-attach` | Stale; sidecar attach already on `main` |

If the live checkout is `feat/household-wizard` or another non-tax branch, **do not switch it in place**. Checkout `feat/tax-t2-income-spine` in a new worktree or separate clone.

## Phase map

| Phase | Status | Branch | Validation |
|-------|--------|--------|------------|
| **T1** Benchmark lock | **Done** (PR #80) | merged to `main` | `npm test` |
| **T2** Lines 1–16 income spine | **Active** | `feat/tax-t2-income-spine` | `npm test` only |
| T3 Lines 17–23 (SE tax, NIIT, …) | Pending | `feat/tax-t3-schedule2` (future) | `npm test` |
| T4 Planner adapter facts | Pending | `feat/tax-t4-planner-adapter` (future) | `npm test` + `verify.mjs` |
| T5 Sidecar validation + UI scope | Pending | `feat/tax-t5-sidecar-validation` (future) | `npm test` + `verify.mjs` |
| T6 Engine vs federal truth decision | Gate | read-only until T5 passes | evidence |

**Rule:** One phase per branch/PR. Do not mix T2 rules with T4 adapter or UI changes.

## T1 baseline (on `main`)

- Authoritative fixture: `src/tax/tests/fixtures/annual/annual-08-authoritative-2025-mfj.json`
- Reconciliation: `docs/tax/T1-BENCHMARK-RECONCILIATION.md`
- Filed line 24: **$10,331** | Parallax: **$10,330.40** | delta **-$0.60** (within **$1** tolerance)
- `demo-wages.json` = legacy synthetic only — not authoritative
- Line 23 **$1,571** ($1,028 SE + $543 NIIT) = **pass-through until T3**

## T2 scope (current)

See `docs/tax/T2-HANDOFF.md`.

1. Schedule D short/long-term classification from fixture facts
2. Wire Schedule D → preferential income / line 16 without supplied shortcuts only
3. Optional: IRS Tax Table vs exact bracket to close $0.60 line 16 gap

**Out of scope for T2:** new Schedule 2 rules (T3), planner adapters (T4), UI (T5).

## Architecture (mandatory)

- Read `docs/ARCHITECTURE.md` and `PRINCIPLES.md`
- Tax rules → `src/tax/federal/rules/<name>.js` + test
- `src/tax/` must **never** import `engine.js`
- `engine.js` `row.taxes` = simulation truth until T6 gate passes
- No new `package.json` dependencies without approval

## GPT session opener (paste)

```
PARALLAX TAX — read docs/tax/GPT-TAX-WORKFLOW.md and docs/tax/T2-HANDOFF.md
Branch: feat/tax-t2-income-spine (NOT feat/household-wizard)
Base: main @ 7f2d057 (T1 merged PR #80)
Tests: npm test must pass (167 baseline on feat/tax-t2-income-spine)
Scope: T2 only — no T3 rules, no adapters, no UI
```
