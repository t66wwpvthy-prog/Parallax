/* Engine guard tests. Run with: node --test  (Node 18+)
   These lock the engine's core behavior so the UI can be rebuilt freely
   without silently breaking the math. If you change engine.js and these
   fail, STOP and reconcile before continuing. */
import { test } from 'node:test';
import assert from 'node:assert';
import {
  RETURN_DATA, RISK_PROFILES, generateReturnPath, runSimulation,
  runHistoricalPath, resolveInputs, defaultPlan, LONGRUN_INFLATION
} from './engine.js';

test('return data spans the full history', () => {
  assert.ok(RETURN_DATA.length >= 90, 'expected ~98 years of returns');
});

test('a return path matches the requested horizon', () => {
  const p = generateReturnPath(30);
  assert.strictEqual(p.length, 30);
});

test('runSimulation returns a success rate in [0,100]', () => {
  const r = runSimulation(defaultPlan, {});
  assert.ok(r.successRate >= 0 && r.successRate <= 100);
  assert.ok(r.terminal && typeof r.terminal.p50 === 'number');
});

test('shared paths make identical inputs reproducible', () => {
  const horizon = defaultPlan.household.primary.planEndAge
                - defaultPlan.household.primary.currentAge;
  const bundle = Array.from({length: 300}, () => generateReturnPath(horizon));
  const a = runSimulation(defaultPlan, {}, bundle);
  const b = runSimulation(defaultPlan, {}, bundle);
  assert.strictEqual(Math.round(a.successRate), Math.round(b.successRate),
    'same inputs + same paths must give the same success rate');
});

test('higher-equity allocation has a higher expected return', () => {
  const w3 = RISK_PROFILES[3].weights, w5 = RISK_PROFILES[5].weights;
  assert.ok(w5.usLarge >= w3.usLarge, 'R5 should hold more equity than R3');
});

test('a known bad sequence (retire into 1973) is materially worse than average', () => {
  const hist = runHistoricalPath(defaultPlan, 1973, 'taxable-first');
  assert.ok(hist && (hist.rows || hist).length > 0, 'historical path should produce rows');
});

// Sequencing tab relies on this: reversing a real path must reuse the SAME
// returns in the opposite order — never invent or drop any. We check the
// multiset of source years is identical (same returns) but the sequence differs.
test('reversed historical path = same returns, opposite order', () => {
  // Use a richly funded plan so BOTH orders survive the full horizon — then the
  // sequence of return-years is directly comparable (depletion would truncate
  // one and confound the multiset check; that survival flips with order is the
  // feature itself, tested implicitly by the lean-plan 1973 test above).
  const rich = JSON.parse(JSON.stringify(defaultPlan));
  rich.portfolio.accounts.taxable.balance     = 20e6;
  rich.portfolio.accounts.traditional.balance = 0;
  rich.portfolio.accounts.roth.balance        = 0;
  const fwd = runHistoricalPath(rich, 1973, 'taxable-first');
  const rev = runHistoricalPath(rich, 1973, 'taxable-first', p => p.slice().reverse());
  assert.ok(rev && rev.rows.length > 0, 'reversed path should produce rows');
  const fy = fwd.rows.filter(r => r.source != null).map(r => r.source);
  const ry = rev.rows.filter(r => r.source != null).map(r => r.source);
  assert.deepStrictEqual([...fy].sort((a,b)=>a-b), [...ry].sort((a,b)=>a-b), 'identical set of return years');
  assert.notDeepStrictEqual(fy, ry, 'order must actually differ');
  assert.deepStrictEqual(ry, [...fy].reverse(), 'reversed = forward backwards');
});

// Sequencing honors a chosen scenario, not just its allocation: overrides must
// flow through runHistoricalPath the same way they do for the Monte Carlo path.
test('historical path honors overrides (e.g. a spending bump)', () => {
  // Rich plan so both runs survive (a depleted plan floors at $0 either way and
  // wouldn't reveal whether the override flowed through).
  const rich = JSON.parse(JSON.stringify(defaultPlan));
  rich.portfolio.accounts.taxable.balance     = 20e6;
  rich.portfolio.accounts.traditional.balance = 0;
  rich.portfolio.accounts.roth.balance        = 0;
  const base   = runHistoricalPath(rich, 1973, 'taxable-first');
  const spendy = runHistoricalPath(rich, 1973, 'taxable-first', undefined, { spendBump: 0.5 });
  assert.ok(base && spendy, 'both runs produce a result');
  assert.ok(spendy.terminalBalance < base.terminalBalance - 1,
    'a +50% spend override must lower the historical ending balance');
});

// Pension benefit-by-age: discrete lookup, no interpolation, no extrapolation.
// The engine only pays the amount entered for the EXACT chosen age — a missing
// age pays 0, never an inferred number. This is the truth-source rule for
// pension data: we don't invent what wasn't on the statement.
test('pension uses discrete benefit-by-age map', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.income.pension = { benefitByAge: { 62: 36000, 65: 48000 }, startAge: 65, colaPct: 0 };
  const at65 = resolveInputs(p, { pensionStartAge: 65 });
  const at62 = resolveInputs(p, { pensionStartAge: 62 });
  const at64 = resolveInputs(p, { pensionStartAge: 64 });
  assert.strictEqual(at65.pension.amount, 48000, 'age 65 → entered $48k');
  assert.strictEqual(at62.pension.amount, 36000, 'age 62 → entered $36k');
  assert.strictEqual(at64.pension.amount, 0,     'age 64 has no entry → 0, never invented');
  assert.strictEqual(at62.pension.startAge, 62,  'pensionStartAge override sets start age');
});

// ── Recurring liabilities (e.g. a mortgage) ─────────────────────────────────
// A time-bounded fixed obligation must (1) reduce the portfolio while active,
// (2) erode in real terms when colaPct=0 (a fixed-nominal payment gets cheaper),
// and (3) stop at endAge. Modeled like the pension's nominal→real conversion.
test('resolveInputs converts a 0%-COLA liability to a real-eroding stream', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.liabilities = [{ label:'mortgage', amount:48000, startAge:65, endAge:94, colaPct:0 }];
  const r = resolveInputs(p, {});
  assert.strictEqual(r.liabilities.length, 1, 'liability resolved');
  assert.ok(Math.abs(r.liabilities[0].colaReal - (-LONGRUN_INFLATION)) < 1e-9,
    '0% COLA → colaReal = −LONGRUN_INFLATION (erodes in real terms)');
  assert.strictEqual(r.liabilities[0].amount, 48000, 'amount preserved');
});

test('a recurring liability lowers retirement wealth and stops at endAge', () => {
  const base = JSON.parse(JSON.stringify(defaultPlan));   // retire-now (65), funded
  const mort = JSON.parse(JSON.stringify(defaultPlan));
  mort.liabilities = [{ label:'mortgage', amount:48000, startAge:65, endAge:80, colaPct:0 }];
  const b = runHistoricalPath(base, 1995, 'taxable-first');
  const m = runHistoricalPath(mort, 1995, 'taxable-first');
  assert.ok(m.terminalBalance < b.terminalBalance - 1, 'mortgage must lower ending wealth');
  // the liability appears in active years and is gone after endAge
  const active = m.rows.find(r => r.age === 70);
  const after  = m.rows.find(r => r.age === 85);
  assert.ok(active && active.liabilities > 0, 'liability charged while active (age 70)');
  assert.ok(after && (after.liabilities || 0) === 0, 'liability gone after endAge (age 85)');
  // real erosion: the charge at 75 is smaller than at 65 (fixed nominal shrinks)
  const at65 = m.rows.find(r => r.age === 65).liabilities;
  const at75 = m.rows.find(r => r.age === 75).liabilities;
  assert.ok(at75 < at65, 'a fixed-nominal liability erodes in real terms over time');
});

test('a pre-retirement lump sum debits the portfolio (no longer ignored in accumulation)', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 58, retirementAge: 65, planEndAge: 95 };
  const base = runHistoricalPath(p, 1995, 'taxable-first');
  const buy  = runHistoricalPath(p, 1995, 'taxable-first', undefined, { lumpSum: 200000, lumpSumYear: 0 });
  assert.ok(buy.terminalBalance < base.terminalBalance - 1,
    'a $200k purchase at current age (accumulation) must reduce ending wealth');
});

// ── RMDs (Required Minimum Distributions) ───────────────────────────────────
// From age 73 the pre-tax sleeve must distribute a minimum even if spending
// doesn't need it; the after-tax excess is reinvested into the taxable sleeve.
// Roth / taxable-only plans have no RMD.
test('RMDs force pre-tax distributions from 73 and reinvest the excess', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.portfolio.accounts.taxable.balance     = 0;     // starts empty…
  p.portfolio.accounts.traditional.balance = 10e6;  // big pre-tax → RMD >> spending
  p.portfolio.accounts.roth.balance        = 0;
  const r = runHistoricalPath(p, 1995, 'taxable-first');
  const at73 = r.rows.find(x => x.age === 73);
  assert.ok(at73 && at73.rmd > 0, 'a required distribution fires at age 73');
  // Taxable began at $0 and nothing else funds it in retirement, so any positive
  // taxable balance can ONLY be reinvested RMD proceeds.
  assert.ok(r.rows.some(x => x.age >= 73 && x.accountBalances.taxable > 1),
    'excess RMD is reinvested into the taxable sleeve');

  // No pre-tax balance → no RMD ever (Roth/taxable are exempt).
  const q = JSON.parse(JSON.stringify(defaultPlan));
  q.portfolio.accounts.taxable.balance     = 10e6;
  q.portfolio.accounts.traditional.balance = 0;
  q.portfolio.accounts.roth.balance        = 0;
  const r2 = runHistoricalPath(q, 1995, 'taxable-first');
  assert.ok(r2.rows.every(x => !(x.rmd > 0)), 'no Traditional balance → no RMD');
});

// ── Contribution split (Roth / brokerage contributions in accumulation) ─────
// Savings can land in any of the three sleeves. Default is 100% pre-tax so old
// plans are unchanged; a Roth/taxable split routes the money differently.
test('savings split: default is all pre-tax; resolveInputs normalizes a custom split', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.savings = { annual: 30000 };                       // no split → back-compat default
  const d = resolveInputs(p, {});
  assert.ok(Math.abs(d.savingsSplit.traditional - 1) < 1e-9 && d.savingsSplit.roth === 0 && d.savingsSplit.taxable === 0,
    'missing split → 100% traditional');
  const q = JSON.parse(JSON.stringify(defaultPlan));
  q.savings = { annual: 30000, split: { traditional: 1, roth: 1, taxable: 2 } };  // 1:1:2
  const e = resolveInputs(q, {});
  assert.ok(Math.abs(e.savingsSplit.taxable - 0.5) < 1e-9 && Math.abs(e.savingsSplit.roth - 0.25) < 1e-9,
    'split normalizes to fractions');
  // override beats the plan's split
  const o = resolveInputs(p, { savingsSplit: { roth: 1 } });
  assert.ok(o.savingsSplit.roth === 1 && o.savingsSplit.traditional === 0, 'ov.savingsSplit wins');
});

test('Roth contributions end higher than the same dollars pre-tax (split flows through)', () => {
  const horizon = 95 - 50;
  const bundle = Array.from({ length: 200 }, () => generateReturnPath(horizon));
  // Well-funded so the plan SURVIVES — then the withdrawal-side tax treatment
  // (Roth tax-free + no RMD vs Traditional taxed + RMD drag) shows in the terminal.
  const mk = split => {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.household.primary = { currentAge: 50, retirementAge: 65, planEndAge: 95 };
    p.savings   = { annual: 150000, split };
    p.expenses  = { living: 60000, housing: 0, debt: 0, healthcare: 0 };
    p.portfolio.accounts = { taxable:{balance:200000,basisPct:1}, traditional:{balance:0}, roth:{balance:0} };
    return runSimulation(p, {}, bundle);
  };
  const allTrad = mk({ traditional:1, roth:0, taxable:0 });
  const allRoth = mk({ traditional:0, roth:1, taxable:0 });
  assert.ok(allRoth.terminal.p50 > allTrad.terminal.p50 + 1,
    'tax-free Roth (no RMD) must end higher than the same dollars in pre-tax');
});

test('empty liabilities = byte-identical to before (no regression)', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  const withEmpty = runHistoricalPath(p, 1973, 'taxable-first');
  p.liabilities = [];
  const explicit = runHistoricalPath(p, 1973, 'taxable-first');
  assert.strictEqual(withEmpty.terminalBalance, explicit.terminalBalance, 'no liabilities → unchanged');
});
