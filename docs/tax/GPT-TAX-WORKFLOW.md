# Parallax tax — GPT branch guide

**Read this first in every tax chat.**

## Active branch (use this)

| Branch | Purpose | Base |
|--------|---------|------|
| **`feat/tax-t4-planner-adapter`** | **Current tax work** — engine rows → tax facts | `main` @ `608bea6` |

**Worktree (recommended):** `C:\Dev\Parallax\.worktrees\Parallax-tax-t4`

```powershell
cd C:\Dev\Parallax\.worktrees\Parallax-tax-t4
npm test                                   # must be 172 passed before claiming done
node scripts/verify.mjs                    # required for T4 adapter/UI-touching work
```

## Closed / merged (do not extend)

| Branch | Status |
|--------|--------|
| `feat/tax-t1-benchmark` | Merged PR #80 |
| `feat/tax-t2-income-spine` | Merged PR #81 |
| `feat/tax-t3-schedule2` | Merged PR #82 |
| `main` | `608bea6` |

## Do NOT use for tax work

| Branch / tree | Reason |
|---------------|--------|
| `feat/household-wizard` | Household UI — separate workspace |
| Old `Parallax-tax-t2` / `Parallax-tax-t3` worktrees | Stale; use `Parallax-tax-t4` |

## Phase map

| Phase | Status | Validation |
|-------|--------|------------|
| T1 Benchmark | **Done** #80 | `npm test` |
| T2 Schedule D | **Done** #81 | `npm test` |
| T3 SE tax | **Done** #82 | `npm test` |
| **T4 Planner adapter** | **Active** | `npm test` + `verify.mjs` |
| T5 Sidecar + UI scope | Pending | `npm test` + `verify.mjs` |
| T6 Engine vs federal truth | Gate | evidence |

## Benchmark (annual-08)

- Line 24: $10,330.40 vs filed $10,331 (-$0.60, within $1)
- Line 23: $1,028 calculated SE + $543 supplied NIIT
- `taxTotalScope`: FULL_1040

## GPT session opener (paste)

```
PARALLAX TAX T4 — read docs/tax/GPT-TAX-WORKFLOW.md and docs/tax/T4-HANDOFF.md
Worktree: C:\Dev\Parallax\.worktrees\Parallax-tax-t4
Branch: feat/tax-t4-planner-adapter (NOT feat/household-wizard)
Base: main @ 608bea6 (T1–T3 merged)
Tests: npm test (172 baseline) + verify.mjs for T4
Scope: T4 adapter only — filing status, SS facts, gain fraction, zero-income years; no new tax rules, no UI redesign
```
