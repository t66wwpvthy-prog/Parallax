# Tax + planning handoff (historical index)

Snapshot date: 2026-07-10

This file is retained only as an index to the completed early tax phases. It is
not current branch, worktree, test-count, gap, or sequencing authority. Git
history contains the original detailed snapshot.

For new work:

1. Follow `AGENTS.md`, `PRINCIPLES.md`, and `docs/ARCHITECTURE.md`.
2. Start from the approved current base in a dedicated clean worktree.
3. Establish the current baseline from code and `npm test`; never reuse a test
   count or “next phase” instruction from a dated handoff.
4. Keep federal rules in `src/tax/`, planning adapters in `src/planning/tax/`,
   and simulation truth in `engine.js`.

## Durable references

- `docs/TaxEngineArchitecture.md` — federal rule/composer design.
- `docs/TaxEngineEngineJsBoundary.md` — tax/planner boundary.
- `docs/tax/real-vs-nominal-tax-contract.md` — dollar-basis contract.
- `docs/tax/T1-BENCHMARK-RECONCILIATION.md` — authoritative benchmark evidence.
- `docs/tax/T1-HANDOFF.md` through `T4-HANDOFF.md` — phase completion provenance,
  not active branch instructions.
- `src/tax/tests/` and `src/planning/tax/*.test.js` — current executable evidence.

Current commands live only in `README.md` and `package.json`.
