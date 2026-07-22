# T1 benchmark handoff (historical)

**Status:** complete (2026-07-10). This is benchmark provenance, not an active
branch instruction.

**Completion validation:** `npm test` — 158 passed, 0 failed.

## Authoritative benchmark

Fixture: `src/tax/tests/fixtures/annual/annual-08-authoritative-2025-mfj.json`

Reconciliation: `docs/tax/T1-BENCHMARK-RECONCILIATION.md`

| Metric | Value |
|--------|------:|
| Filed line 24 | $10,331 |
| Parallax line 24 | $10,330.40 |
| Delta | -$0.60 |
| Tolerance | $1.00 — **passed** |

## Retired legacy case

`src/tax/tests/fixtures/engine-year/demo-wages.json` remains a **legacy synthetic regression** only. The former `$56,815` client target was not supported by complete return evidence.

## T1 scope delivered

- Redacted client evidence locked in authoritative fixture
- Cross-foot and lines 15–24 assertions in `annual1040Fixtures.test.js`
- Dedicated tolerance test in `authoritativeBenchmark.test.js`
- No tax rules, engine logic, adapters, or UI changes
