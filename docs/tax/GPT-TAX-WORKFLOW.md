# Parallax tax — GPT branch guide

**Read this first in every tax chat.**

## Active branch (use this)

| Branch | Purpose | Base |
|--------|---------|------|
| **`feat/tax-t3-schedule2`** | **Current tax work** — SE tax + NIIT, line 23 | `main` @ `d6e1e1b` |

**Worktree (recommended):** `C:\Dev\Parallax-tax-t3`

```powershell
cd C:\Dev\Parallax-tax-t3
git pull origin feat/tax-t3-schedule2   # after first push
npm test                                   # must be 167 passed before claiming done
```

If starting fresh:

```powershell
git fetch origin
git worktree add C:\Dev\Parallax-tax-t3 origin/main -b feat/tax-t3-schedule2
cd C:\Dev\Parallax-tax-t3
npm test
```

## Closed / merged (do not extend)

| Branch | Status | Notes |
|--------|--------|-------|
| `feat/tax-t1-benchmark` | **Merged** PR #80 | Benchmark lock |
| `feat/tax-t2-income-spine` | **Merged** PR #81 | Schedule D classification |
| `main` | `d6e1e1b` | Includes T1 + T2 |

## Do NOT use for tax work

| Branch / tree | Reason |
|---------------|--------|
| `feat/household-wizard` | Household UI — separate dirty workspace |
| `feat/tax-1040-spine` | Stale |
| `feat/tax-typical-path-attach` | Stale |

**Never mix tax work into the Household checkout.** Use `Parallax-tax-t3` worktree.

## Phase map

| Phase | Status | Branch | Validation |
|-------|--------|--------|------------|
| T1 Benchmark lock | **Done** PR #80 | merged | `npm test` |
| T2 Lines 1–16 / Schedule D | **Done** PR #81 | merged | `npm test` |
| **T3** Schedule 2 / line 23 | **Active** | `feat/tax-t3-schedule2` | `npm test` |
| T4 Planner adapter facts | Pending | `feat/tax-t4-planner-adapter` | `npm test` + `verify.mjs` |
| T5 Sidecar + UI scope | Pending | `feat/tax-t5-sidecar-validation` | `npm test` + `verify.mjs` |
| T6 Engine vs federal truth | Gate | evidence only | — |

**Rule:** One phase per branch/PR.

## Benchmark facts (annual-08)

- Filed line 24: **$10,331** | Parallax: **$10,330.40** | delta **-$0.60** (within **$1**)
- Line 23 today: **pass-through $1,571** ($1,028 SE + $543 NIIT) — **T3 must calculate this**
- Line 7a: **-$3,000** (from Schedule D, T2 done)
- Reconciliation doc: `docs/tax/T1-BENCHMARK-RECONCILIATION.md`

## Architecture (mandatory)

- Read `docs/ARCHITECTURE.md` and `PRINCIPLES.md`
- One rule = one file in `src/tax/federal/rules/` + test + `rulesLedger.js`
- `src/tax/` must **never** import `engine.js`
- No new npm dependencies without approval

## GPT session opener (paste)

```
PARALLAX TAX T3 — read docs/tax/GPT-TAX-WORKFLOW.md and docs/tax/T3-HANDOFF.md
Worktree: C:\Dev\Parallax-tax-t3
Branch: feat/tax-t3-schedule2 (NOT feat/household-wizard)
Base: main @ d6e1e1b (T1 #80 + T2 #81 merged)
Tests: npm test must pass (167 baseline)
Scope: T3 only — calculate SE tax + NIIT for line 23; no adapters, no UI
```
