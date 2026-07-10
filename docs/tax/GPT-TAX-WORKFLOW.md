# Parallax tax — GPT branch guide

**Read this first in every tax chat.**

## Active branch (use this)

| Branch | Purpose | Base |
|--------|---------|------|
| **`feat/tax-t4-planner-adapter`** | **Current tax work** — engine rows → tax facts | `main` @ `33a7cd4` |

**Worktree (recommended):** `C:\Dev\Parallax\.worktrees\Parallax-tax-t4`

```powershell
cd C:\Dev\Parallax\.worktrees\Parallax-tax-t4
git checkout main && git pull
git checkout -B feat/tax-t4-planner-adapter main
npm test                                   # must be 184 passed before claiming done
node scripts/verify.mjs                    # required for T4 adapter/UI-touching work
```

## Closed / merged (do not extend)

| Branch / PR | Status |
|-------------|--------|
| T1 Benchmark | Merged #80 |
| T2 Schedule D | Merged #81 |
| T3 SE tax | Merged #82 |
| T4.1 Filing status | Merged #83 |
| T4.2 Social Security | Merged #84 |
| T4.3 Gain fraction | Merged #86 |
| T4.4 Zero-income / filler | Merged #87 |
| `main` | `33a7cd4` |

## Do NOT use for tax work

| Branch / tree | Reason |
|---------------|--------|
| `feat/household-wizard` | Household UI — separate workspace (PR #85) |
| Old `Parallax-tax-t2` / `Parallax-tax-t3` worktrees | Stale; use `Parallax-tax-t4` |

## Phase map

| Phase | Status | Validation |
|-------|--------|------------|
| T1 Benchmark | **Done** #80 | `npm test` |
| T2 Schedule D | **Done** #81 | `npm test` |
| T3 SE tax | **Done** #82 | `npm test` |
| T4.1 Filing status | **Done** #83 | `npm test` + `verify.mjs` |
| T4.2 Social Security | **Done** #84 | `npm test` + `verify.mjs` |
| T4.3 Gain fraction | **Done** #86 | `npm test` + `verify.mjs` |
| T4.4 Zero-income / filler | **Done** #87 | `npm test` + `verify.mjs` |
| **T4.5 Other-income taxablePct** | **Active** | `npm test` + `verify.mjs` |
| T5 Sidecar + UI scope | Pending | `npm test` + `verify.mjs` |
| T6 Engine vs federal truth | Gate | evidence |

## Benchmark (annual-08)

- Line 24: $10,330.40 vs filed $10,331 (-$0.60, within $1)
- Line 23: $1,028 calculated SE + $543 supplied NIIT
- `taxTotalScope`: FULL_1040

## GPT session opener (paste)

```
PARALLAX TAX T4.5 — read docs/tax/GPT-TAX-WORKFLOW.md and docs/tax/T4-HANDOFF.md
Worktree: C:\Dev\Parallax\.worktrees\Parallax-tax-t4
Branch: feat/tax-t4-planner-adapter (NOT feat/household-wizard)
Base: main @ 33a7cd4 (T4.1–T4.4 merged)
Tests: npm test (184 baseline) + verify.mjs
Scope: T4.5 — other-income taxablePct via engine row fact + adapter; no UI, no new federal rules
```
