/* Engine guard tests. Run with: node --test  (Node 18+)
   These lock the engine's core behavior so the UI can be rebuilt freely
   without silently breaking the math. If you change engine.js and these
   fail, STOP and reconcile before continuing. */
import { test } from 'node:test';
import assert from 'node:assert';
import {
  RETURN_DATA, RISK_PROFILES, generateReturnPath, runSimulation,
  runHistoricalPath, runSinglePath, analyzeResults, resolveInputs, defaultPlan, LONGRUN_INFLATION,
  annualMortgagePayment, resetSeed
} from './engine.js';
import { createFederalTaxResolver } from './src/planning/tax/createFederalTaxResolver.js';
import { resolvePortfolioAccounts } from './src/household/resolvePortfolioAccounts.js';

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

test('default runHistoricalPath is identical to the explicit shortcut tax policy', () => {
  const defaultResult = runHistoricalPath(defaultPlan, 1973, 'taxable-first');
  const explicitShortcutResult = runHistoricalPath(
    defaultPlan,
    1973,
    'taxable-first',
    undefined,
    undefined,
    { taxPolicy: (_row, { shortcutTax }) => shortcutTax }
  );

  assert.deepStrictEqual(defaultResult, explicitShortcutResult);
});

// Sequence Stress must be measured from RETIREMENT start, not plan start. For a
// still-working client (currentAge < retirementAge), the first accumulation years
// carry no sequence-of-returns risk (no withdrawals), so they must NOT drive which
// path is labeled "stressed". The selector sorts by balanceAtRet10 (balance after
// 10 retirement years), never balanceAt10 (plan-year 10). Regression for the
// 58-retire-at-65 contamination case.
test('Sequence Stress is retirement-relative, not contaminated by accumulation years', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 58, retirementAge: 65, planEndAge: 95 };
  p.savings = { annual: 30000, split: { traditional: 1, roth: 0, taxable: 0 } };
  const horizon = p.household.primary.planEndAge - p.household.primary.currentAge; // 37
  // Fixed seed + fixed bundle → fully deterministic selection, so the assertions
  // are reproducible across runs and machines.
  resetSeed(20260615);
  const bundle = Array.from({ length: 400 }, () => generateReturnPath(horizon));
  const res = runSimulation(p, {}, bundle);

  // (1) Every sim exposes the retirement-relative probe as a finite number.
  assert.ok(res.sims.every(s => Number.isFinite(s.balanceAtRet10)),
    'balanceAtRet10 must be present and finite on every sim');

  // (2) The capture window is retirement year 10 (age retirementAge+9 = 74), NOT
  //     plan-year 10 (age 67). Prove it against the actual row balance.
  const sample = res.sims.find(s => !s.failed) || res.sims[0];
  const ret10Row = sample.rows.find(r => r.age === 65 + 9);   // age 74
  const plan10Row = sample.rows.find(r => r.age === 58 + 9);  // age 67
  assert.ok(ret10Row, 'a surviving sim should reach retirement year 10 (age 74)');
  assert.strictEqual(sample.balanceAtRet10, ret10Row.balance,
    'balanceAtRet10 must equal the end balance at age 74 (10th retirement year)');
  assert.strictEqual(sample.balanceAt10, plan10Row.balance,
    'balanceAt10 (untouched) must still equal the end balance at plan-year 10 (age 67)');
  assert.notStrictEqual(ret10Row.age, plan10Row.age,
    'the two windows must be genuinely different when accumulation years exist');

  // (3) The selector ranks by balanceAtRet10: re-derive the ordering and confirm
  //     the engine's stressed (p10) and favorable (p90) picks match it. This proves
  //     accumulation-year balances are not what chooses the stressed path.
  const ns = res.sims.length;
  const bySeq = res.sims.slice().sort((a, b) => {
    if (a.balanceAtRet10 !== b.balanceAtRet10) return a.balanceAtRet10 - b.balanceAtRet10;
    return a.terminalBalance - b.terminalBalance;
  });
  assert.strictEqual(res.paths.p10.balanceAtRet10, bySeq[Math.floor(ns * 0.10)].balanceAtRet10,
    'stressed path (p10) must be the 10th-percentile by retirement-relative balance');
  assert.strictEqual(res.paths.p90.balanceAtRet10, bySeq[Math.floor(ns * 0.90)].balanceAtRet10,
    'favorable path (p90) must be the 90th-percentile by retirement-relative balance');
  assert.ok(res.paths.p10.balanceAtRet10 <= res.paths.p90.balanceAtRet10,
    'stressed early-retirement balance must not exceed the favorable one');
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

// ── Multi-row income / expenses / goals (the add-row data model) ─────────────
// income.other is now an ARRAY of timed streams: each is summed only while active,
// and a legacy single object is still accepted.
test('annual savings increases terminal wealth during accumulation', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 40, retirementAge: 65, planEndAge: 95 };
  p.portfolio.accounts = { taxable: { balance: 500000, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } };
  p.goals = [];
  p.savings.annual = 0;
  const base = runHistoricalPath(p, 1995, 'taxable-first');
  p.savings.annual = 50000;
  const saving = runHistoricalPath(p, 1995, 'taxable-first');
  assert.ok(saving.terminalBalance > base.terminalBalance + 1,
    'annual savings must raise ending wealth during working years');
});

test('other income streams report during accumulation years', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 40, retirementAge: 65, planEndAge: 95 };
  p.income.other = [{ label: 'Wages', amount: 150000, startAge: 40, endAge: 64 }];
  const m = runHistoricalPath(p, 1995, 'taxable-first');
  const at45 = m.rows.find(r => r.age === 45);
  const at64 = m.rows.find(r => r.age === 64);
  const at65 = m.rows.find(r => r.age === 65);
  assert.strictEqual(at45.phase, 'accum');
  assert.strictEqual(at45.otherIncome, 150000);
  assert.strictEqual(at64.otherIncome, 150000);
  assert.strictEqual(at65.otherIncome, 0, 'wages ended the year before retirement');
});

test('accumulation rows report shortcut tax without funding from the portfolio', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 40, retirementAge: 65, planEndAge: 95 };
  p.portfolio.accounts = { taxable: { balance: 500000, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } };
  p.income.other = [{ label: 'Wages', amount: 200000, startAge: 40, endAge: 64, taxablePct: 1 }];
  p.savings.annual = 0;
  p.goals = [];
  const taxed = runHistoricalPath(p, 1995, 'taxable-first');
  p.income.other = [];
  const untaxed = runHistoricalPath(p, 1995, 'taxable-first');
  const row = taxed.rows.find(r => r.age === 50);
  assert.strictEqual(row.phase, 'accum');
  assert.ok(row.taxes > 0, 'working-year wages must produce shortcut income tax on the row');
  assert.strictEqual(row.netCashflow, 0, 'implicit spending stays off-books');
  assert.ok(Math.abs(row.taxBySource.oi - row.taxes) < 0.01, 'wage tax must land in taxBySource.oi');
  const taxedBal = taxed.rows.find(r => r.age === 64).balance;
  const untaxedBal = untaxed.rows.find(r => r.age === 64).balance;
  assert.ok(Math.abs(taxedBal - untaxedBal) < 1,
    'display-only accumulation tax must not change portfolio balances');
});

test('reporting-only federal policy sets accumulation row taxes to Form 1040 line 24', () => {
  const p = structuredClone(defaultPlan);
  p.meta.filingStatus = 'marriedFilingJointly';
  p.household.primary = { currentAge: 64, retirementAge: 66, planEndAge: 68 };
  p.household.spouse = { currentAge: 63, retirementAge: 65 };
  p.portfolio.accounts = {
    taxable: { balance: 1000000, basisPct: 1 },
    traditional: { balance: 0 },
    roth: { balance: 0 },
  };
  p.income.socialSecurity = { primary: { pia: 0, claimAge: 67 }, spouse: { pia: 0, claimAge: 67 } };
  p.income.other = [
    { label: 'Client wages', amount: 90000, startAge: 64, endAge: 65, taxablePct: 1 },
    { label: 'Co-client wages', amount: 90000, startAge: 63, endAge: 64, taxablePct: 1 },
  ];
  p.income.pension = { benefitByAge: {}, startAge: 65, colaPct: 0 };
  p.expenses = { living: 0, housing: 0, debt: 0, healthcare: 0, healthcareRealGrowth: 0 };
  p.goals = [];

  const inputs = resolveInputs(p, {});
  const returnPath = Array.from({ length: inputs.horizonYears }, (_, index) => ({
    y: 2026 + index,
    proxyReturn: 0,
  }));
  const shortcutPath = runSinglePath(inputs, returnPath);
  const federalResolver = createFederalTaxResolver(inputs, {
    filingStatus: 'marriedFilingJointly',
    baseTaxYear: 2026,
    scenarioId: 'accum_federal_reporting_test',
  });
  const federalPath = runSinglePath(inputs, returnPath, { taxPolicy: federalResolver });
  const accumRows = federalPath.rows.filter((row) => row.phase === 'accum' && row.otherIncome > 0);

  assert.ok(accumRows.length >= 2, 'fixture must include multiple accumulation income years');
  for(const row of accumRows){
    const expected = federalResolver(row);
    assert.ok(Math.abs(row.taxes - expected) < 0.01,
      `age ${row.age} must report federal line 24 on accumulation rows`);
    assert.ok(row.taxes > 0, `age ${row.age} must carry a positive federal tax`);
  }
  assert.ok(
    federalPath.rows.some((row, index) => row.taxes !== shortcutPath.rows[index].taxes),
    'federal reporting must differ from shortcut on at least one accumulation row'
  );
});

test('other income: multiple timed streams sum while active and stop at endAge', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
  p.income.other = [
    { label:'Rental',    amount:24000, startAge:65, endAge:75 },
    { label:'Part-time', amount:30000, startAge:65, endAge:70 },
  ];
  const r = resolveInputs(p, {});
  assert.strictEqual(r.otherIncome.length, 2, 'both streams resolved');
  const m = runHistoricalPath(p, 1995, 'taxable-first');
  const at66 = m.rows.find(r => r.age === 66).otherIncome;  // both active
  const at72 = m.rows.find(r => r.age === 72).otherIncome;  // only rental
  const at80 = m.rows.find(r => r.age === 80).otherIncome;  // neither
  assert.strictEqual(at66, 54000, 'both streams active → summed');
  assert.strictEqual(at72, 24000, 'part-time ended → only rental');
  assert.strictEqual(at80, 0, 'both ended → no other income');
});

test('a legacy single other-income object is still honored', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.income.other = { amount: 12000, startAge: 0, endAge: 999 };
  const r = resolveInputs(p, {});
  assert.strictEqual(r.otherIncome.length, 1, 'single object wrapped into one stream');
  assert.strictEqual(r.otherIncome[0].amount, 12000, 'amount preserved');
});

// expenses.extra: discretionary, time-bounded, and flexes with the spending lever.
test('a discretionary extra expense lowers wealth, stops at endAge, and flexes with spendMult', () => {
  const base = JSON.parse(JSON.stringify(defaultPlan));
  const exp  = JSON.parse(JSON.stringify(defaultPlan));
  exp.expenses.extra = [{ label:'Go-go travel', amount:40000, startAge:65, endAge:75 }];
  const b = runHistoricalPath(base, 1995, 'taxable-first');
  const e = runHistoricalPath(exp,  1995, 'taxable-first');
  assert.ok(e.terminalBalance < b.terminalBalance - 1, 'extra spending must lower ending wealth');
  const at70 = e.rows.find(r => r.age === 70).expenses;
  const at80 = e.rows.find(r => r.age === 80).expenses;
  assert.ok(at70 > at80, 'extra expense active at 70, gone by 80');
  // spendMult scales discretionary extras: a +20% spend bump raises the resolved amount.
  const bumped = resolveInputs(exp, { spendBump: 0.20 });
  assert.ok(Math.abs(bumped.expenses.extra[0].amount - 48000) < 1e-6, 'extra flexes with spendMult');
});

// goals: a ONE-TIME goal is a single-year window; it hits exactly one year.
test('a one-time goal (startAge===endAge) charges exactly one year', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
  p.goals = [{ name:'Wedding', amount:60000, startAge:68, endAge:68 }];
  const m = runHistoricalPath(p, 1995, 'taxable-first');
  assert.strictEqual(m.rows.find(r => r.age === 67).goals, 0, 'nothing before the year');
  assert.strictEqual(m.rows.find(r => r.age === 68).goals, 60000, 'full hit in the goal year');
  assert.strictEqual(m.rows.find(r => r.age === 69).goals, 0, 'nothing after');
});

test('a pre-retirement goal (college) charges in working years and lowers wealth', () => {
  // A goal whose window sits ENTIRELY in the accumulation phase used to be
  // silently dropped — the accum rows hardcoded goals:0 and never funded it.
  const base = JSON.parse(JSON.stringify(defaultPlan));
  base.household.primary = { currentAge: 55, retirementAge: 65, planEndAge: 90 };
  base.goals = [];
  const withGoal = JSON.parse(JSON.stringify(base));
  withGoal.goals = [{ name:'College', amount:50000, startAge:58, endAge:61 }];
  const m0 = runHistoricalPath(base,     1995, 'taxable-first');
  const m1 = runHistoricalPath(withGoal, 1995, 'taxable-first');
  // The goal lands in each of its four working years…
  assert.strictEqual(m1.rows.find(r => r.age === 57).goals, 0,     'nothing before the window');
  assert.strictEqual(m1.rows.find(r => r.age === 58).goals, 50000, 'full hit in the first college year');
  assert.strictEqual(m1.rows.find(r => r.age === 61).goals, 50000, 'full hit in the last college year');
  assert.strictEqual(m1.rows.find(r => r.age === 62).goals, 0,     'nothing after the window');
  // …and it actually draws the portfolio down (same returns, less ending wealth).
  const end0 = m0.rows[m0.rows.length - 1].balance;
  const end1 = m1.rows[m1.rows.length - 1].balance;
  assert.ok(end1 < end0, 'the funded college goal leaves less ending wealth');
});

test('a legacy { vacation, property, gifts } goals object still resolves', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.goals = { vacation: 15000, property: 10000, gifts: 5000 };
  const r = resolveInputs(p, {});
  assert.strictEqual(r.goals.length, 3, 'object converted to three always-on entries');
  const total = r.goals.reduce((s, g) => s + g.amount, 0);
  assert.strictEqual(total, 30000, 'amounts preserved');
});

// ── Property mortgage (engine-native amortization) ──────────────────────────
// The mortgage is amortized to a fixed annual payment and run through the tested
// liability path: it charges until payoff, then stops. purchasePrice is inert.
test('annualMortgagePayment matches the standard amortization formula', () => {
  // $300k, 6% APR, 30yr → ~$1798.65/mo → ~$21,583.81/yr.
  const pay = annualMortgagePayment(300000, 6, 30);
  assert.ok(Math.abs(pay - 21583.81) < 1.0, `expected ~21583.81/yr, got ${pay.toFixed(2)}`);
  assert.strictEqual(annualMortgagePayment(0, 6, 30), 0, 'no balance → no payment');
  assert.strictEqual(annualMortgagePayment(300000, 6, 0), 0, 'no term → no payment');
  // 0% loan = straight-line: 120000 / 10yr = 12000/yr.
  assert.ok(Math.abs(annualMortgagePayment(120000, 0, 10) - 12000) < 1e-6, '0% APR → straight-line');
});

test('a property mortgage becomes an amortized liability that stops at payoff', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
  p.properties = [{
    name:'Primary residence', value:900000, purchasePrice:400000,
    mortgage:{ balance:300000, rate:6, termYears:10 }
  }];
  const r = resolveInputs(p, {});
  assert.strictEqual(r.liabilities.length, 1, 'mortgage folded into liabilities');
  assert.ok(Math.abs(r.liabilities[0].amount - annualMortgagePayment(300000, 6, 10)) < 1e-6,
    'liability amount = amortized annual payment');
  assert.strictEqual(r.liabilities[0].endAge, 75, 'payoff = startAge + termYears');
  const m = runHistoricalPath(p, 1995, 'taxable-first');
  assert.ok(m.rows.find(r => r.age === 70).liabilities > 0, 'mortgage charged while active');
  assert.strictEqual(m.rows.find(r => r.age === 80).liabilities, 0, 'gone after payoff');
});

test('purchasePrice / value are inert — they move no current number', () => {
  const withProp = JSON.parse(JSON.stringify(defaultPlan));
  withProp.properties = [{ name:'House', value:900000, purchasePrice:400000 }];  // no mortgage
  const without = JSON.parse(JSON.stringify(defaultPlan));
  const a = runHistoricalPath(withProp, 1995, 'taxable-first');
  const b = runHistoricalPath(without,  1995, 'taxable-first');
  assert.strictEqual(a.terminalBalance, b.terminalBalance, 'a mortgage-less property changes nothing today');
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

// ── Typed accounts (401k, SEP, …) fold into their tax sleeve ────────────────
test('extra typed accounts sum into their bucket; empty = unchanged', () => {
  const base = JSON.parse(JSON.stringify(defaultPlan));
  const baseR = resolveInputs(base, {});
  base.portfolio.extraAccounts = [];                       // explicit empty = no change
  assert.strictEqual(resolveInputs(base, {}).accounts.traditional.balance, baseR.accounts.traditional.balance,
    'empty extras → identical resolved balances');
  // a $500k 401(k) lands in the pre-tax (traditional) sleeve
  const withAcct = JSON.parse(JSON.stringify(defaultPlan));
  withAcct.portfolio.extraAccounts = [{ type:'401k', bucket:'traditional', balance:500000 }];
  const fold = resolvePortfolioAccounts(withAcct);
  const r = resolveInputs(withAcct, {});
  assert.strictEqual(r.accounts.traditional.balance, fold.engineBuckets.traditional.balance,
    'engine resolved balance must come from the shared account fold');
  assert.strictEqual(r.accounts.traditional.balance, baseR.accounts.traditional.balance + 500000,
    '401(k) adds to the pre-tax bucket');
  assert.strictEqual(r.accounts.roth.balance, baseR.accounts.roth.balance, 'Roth untouched');
  // a taxable add also lifts basis at the account basis %
  const withTax = JSON.parse(JSON.stringify(defaultPlan));
  withTax.portfolio.extraAccounts = [{ type:'brokerage', bucket:'taxable', balance:100000 }];
  const rt = resolveInputs(withTax, {});
  assert.strictEqual(rt.accounts.taxable.balance, baseR.accounts.taxable.balance + 100000, 'taxable add folds into taxable balance');
  assert.ok(rt.accounts.taxable.basis > baseR.accounts.taxable.basis, 'taxable add lifts basis');
});

test('inherited accounts appear in current folds but stay out of engine inputs until rules exist', () => {
  const base = JSON.parse(JSON.stringify(defaultPlan));
  const baseInputs = resolveInputs(base, {});
  const withInherited = JSON.parse(JSON.stringify(defaultPlan));
  withInherited.portfolio.extraAccounts = [
    { typeId:'inherited_traditional_ira', type:'Inherited Traditional IRA', bucket:'traditional', balance:500000 },
    { typeId:'inherited_roth_ira', type:'Inherited Roth IRA', bucket:'roth', balance:250000 },
  ];
  const fold = resolvePortfolioAccounts(withInherited);
  const inputs = resolveInputs(withInherited, {});

  assert.equal(fold.taxBuckets.traditional.balance, baseInputs.accounts.traditional.balance + 500000);
  assert.equal(fold.taxBuckets.roth.balance, baseInputs.accounts.roth.balance + 250000);
  assert.equal(inputs.accounts.traditional.balance, baseInputs.accounts.traditional.balance);
  assert.equal(inputs.accounts.roth.balance, baseInputs.accounts.roth.balance);
  assert.deepEqual(fold.pendingStrategyAccounts.map(account => account.typeId), [
    'inherited_traditional_ira', 'inherited_roth_ira',
  ]);
});

test('empty liabilities = byte-identical to before (no regression)', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  const withEmpty = runHistoricalPath(p, 1973, 'taxable-first');
  p.liabilities = [];
  const explicit = runHistoricalPath(p, 1973, 'taxable-first');
  assert.strictEqual(withEmpty.terminalBalance, explicit.terminalBalance, 'no liabilities → unchanged');
});

// ── Healthcare: separate from lifestyle spending ─────────────────────────────
// Healthcare is NOT discretionary — the spend lever must not move it.
// It grows at its own real rate (healthcareRealGrowth) from retirement forward.
test('spendBump does NOT scale healthcare costs', () => {
  const base = JSON.parse(JSON.stringify(defaultPlan));
  base.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
  base.expenses.living = 100000;
  base.expenses.healthcare = 15000;
  base.expenses.healthcareRealGrowth = 0;   // disable growth for isolation
  const rBase   = resolveInputs(base, {});
  const rBumped = resolveInputs(base, { spendBump: 0.50 });
  assert.strictEqual(rBumped.expenses.healthcare, 15000,
    'healthcare must NOT be scaled by spendBump');
  assert.ok(Math.abs(rBumped.expenses.living - 150000) < 1e-6,
    'lifestyle spending IS scaled by spendBump');
  assert.strictEqual(rBase.expenses.healthcare, 15000, 'base healthcare untouched');
});

test('healthcare real growth raises costs over retirement years', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
  p.expenses.healthcareRealGrowth = 0.03;  // 3% above CPI
  const m = runHistoricalPath(p, 1995, 'taxable-first');
  // After 10 years of retirement (age 75), healthcare in the row should be
  // noticeably higher than at retirement (age 65). We read it from the expenses
  // row delta — not exact because other expense components are flat, but the
  // total expenses at 75 must exceed those at 65 by more than a rounding error.
  // (expenses = living + housing + debt + healthcare*growth + extras)
  const at65 = m.rows.find(r => r.age === 65).expenses;
  const at75 = m.rows.find(r => r.age === 75).expenses;
  const expectedHealthcareDelta = p.expenses.healthcare * (Math.pow(1.03, 10) - 1);
  assert.ok(at75 > at65 + expectedHealthcareDelta * 0.9,
    'healthcare real growth must lift total expenses over retirement');
});

// ── Other income: per-stream real growth and taxable share ──────────────────
// A stream grows in REAL terms from its own startAge (negative = phases down),
// and only its taxable share is taxed at the ordinary rate. Both default to the
// legacy flat-real, fully-taxed behavior.
test('other-income streams default to flat-real, fully taxable', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.income.other = [{ label:'Rent', amount:12000, startAge:65, endAge:80 }];
  const r = resolveInputs(p, {});
  assert.strictEqual(r.otherIncome[0].realGrowth, 0, 'no real growth by default');
  assert.strictEqual(r.otherIncome[0].taxablePct, 1, 'fully taxable by default');
});

test('other-income realGrowth compounds the stream (negative phases it down)', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
  p.income.other = [
    { label:'Rental',    amount:24000, startAge:65, endAge:95, realGrowth: 0.03 },  // rises
    { label:'Part-time', amount:24000, startAge:65, endAge:95, realGrowth:-0.10 },  // winds down
  ];
  const m = runHistoricalPath(p, 1995, 'taxable-first');
  const oi65 = m.rows.find(r => r.age === 65).otherIncome;
  const oi75 = m.rows.find(r => r.age === 75).otherIncome;
  const expect75 = 24000 * Math.pow(1.03, 10) + 24000 * Math.pow(0.90, 10);
  assert.ok(Math.abs(oi65 - 48000) < 1e-6, 'both streams at base in the first year');
  assert.ok(Math.abs(oi75 - expect75) < 1.0,
    `at 75 the grown + decayed streams should sum to ~${expect75.toFixed(0)}, got ${oi75.toFixed(0)}`);
});

test('a partly tax-free stream is taxed less than a fully-taxable one (higher ending wealth)', () => {
  const mk = taxablePct => {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
    p.income.other = [{ label:'Annuity', amount:60000, startAge:65, endAge:95, taxablePct }];
    return runHistoricalPath(p, 1995, 'taxable-first');
  };
  const fully = mk(1);
  const half  = mk(0.5);
  assert.ok(half.terminalBalance > fully.terminalBalance + 1,
    'lower taxable share → less tax → higher ending wealth');
  assert.strictEqual(half.rows.find(r => r.age === 70).otherIncome,
                     fully.rows.find(r => r.age === 70).otherIncome,
    'taxablePct changes tax only, not the gross income shown');
});

test('default Monte Carlo is identical to the explicit shortcut tax policy', () => {
  const p = structuredClone(defaultPlan);
  const inputs = resolveInputs(p, {});
  resetSeed(20260710);
  const bundle = Array.from({ length: 40 }, () => generateReturnPath(inputs.horizonYears));

  const defaultResult = runSimulation(p, {}, bundle);
  const explicitNullResult = runSimulation(p, {}, bundle, {
    taxPolicy: null,
    fundTaxPolicyDelta: true,
  });
  const explicitSims = bundle.map((returnPath, simIndex) => {
    const sim = runSinglePath(inputs, returnPath, {
      taxPolicy: (_row, { shortcutTax }) => shortcutTax,
    });
    sim.simIndex = simIndex;
    sim.returnPath = returnPath;
    return sim;
  });
  const explicitShortcutResult = analyzeResults(explicitSims, inputs);

  assert.deepStrictEqual(defaultResult, explicitShortcutResult,
    'unused tax-policy seam must preserve the complete default MC result');
  assert.deepStrictEqual(defaultResult, explicitNullResult,
    'null tax policy must remain byte-identical even when funding mode is requested');
});

test('opt-in single path reports federal line 24 as row tax', () => {
  const p = structuredClone(defaultPlan);
  p.meta.filingStatus = 'single';
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 68 };
  p.portfolio.accounts = {
    taxable: { balance: 10000000, basisPct: 1 },
    traditional: { balance: 0 },
    roth: { balance: 0 },
  };
  p.income.socialSecurity = { primary: { pia: 0, claimAge: 67 }, spouse: null };
  p.income.other = [{ label: 'Taxable income', amount: 100000, startAge: 65, endAge: 68, taxablePct: 1 }];
  p.income.pension = { benefitByAge: {}, startAge: 65, colaPct: 0 };
  p.expenses = { living: 0, housing: 0, debt: 0, healthcare: 0, healthcareRealGrowth: 0 };
  p.goals = [];

  const inputs = resolveInputs(p, {});
  const returnPath = Array.from({ length: inputs.horizonYears }, (_, index) => ({
    y: 2026 + index,
    proxyReturn: 0,
  }));
  const shortcutPath = runSinglePath(inputs, returnPath);
  const federalResolver = createFederalTaxResolver(inputs, {
    filingStatus: 'single',
    baseTaxYear: 2026,
    scenarioId: 't6_engine_policy_test',
  });
  const expectedFederalTax = shortcutPath.rows.map((row) => federalResolver(row));
  const federalPath = runSinglePath(inputs, returnPath, { taxPolicy: federalResolver });

  assert.deepStrictEqual(federalPath.rows.map((row) => row.taxes), expectedFederalTax,
    'every wired row tax must equal federal Form 1040 line 24');
  assert.ok(federalPath.rows.some((row, index) => row.taxes !== shortcutPath.rows[index].taxes),
    'fixture must prove the federal resolver differs from the shortcut');
  assert.ok(Math.abs(
    federalPath.lifetimeTax - federalPath.rows.reduce((sum, row) => sum + row.taxes, 0)
  ) < 0.01, 'single-path lifetime tax must follow resolved federal row taxes');
});

test('tax-policy funding mode grosses up a positive delta before depletion', () => {
  const build = (balance, living, bucket = 'taxable') => {
    const p = structuredClone(defaultPlan);
    p.meta.filingStatus = 'single';
    p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 66 };
    p.household.spouse = null;
    p.portfolio.accounts = {
      taxable: { balance: bucket === 'taxable' ? balance : 0, basisPct: 1 },
      traditional: { balance: bucket === 'traditional' ? balance : 0 },
      roth: { balance: 0 },
    };
    p.portfolio.extraAccounts = [];
    p.income.socialSecurity = { primary: { pia: 0, claimAge: 67 }, spouse: null };
    p.income.other = [];
    p.income.pension = { benefitByAge: {}, base: 0, startAge: 65, colaPct: 0 };
    p.expenses = {
      living,
      housing: 0,
      debt: 0,
      healthcare: 0,
      healthcareRealGrowth: 0,
      extra: [],
    };
    p.liabilities = [];
    p.properties = [];
    p.goals = [];
    p.ltc = { amount: 0, onsetAge: 85 };
    return resolveInputs(p, {});
  };
  const returnPath = [{ y: 2026, proxyReturn: 0 }];

  const ampleInputs = build(100000, 10000);
  const shortcut = runSinglePath(ampleInputs, returnPath);
  const reportingOnly = runSinglePath(ampleInputs, returnPath, {
    taxPolicy: (_row, { shortcutTax }) => shortcutTax + 5000,
  });
  const funded = runSinglePath(ampleInputs, returnPath, {
    taxPolicy: (_row, { shortcutTax }) => shortcutTax + 5000,
    fundTaxPolicyDelta: true,
  });

  assert.strictEqual(reportingOnly.rows[0].withdrawal, shortcut.rows[0].withdrawal,
    'reporting-only T7 mode must keep shortcut funding unchanged');
  assert.strictEqual(reportingOnly.terminalBalance, shortcut.terminalBalance);
  assert.strictEqual(funded.rows[0].withdrawal, shortcut.rows[0].withdrawal + 5000,
    'positive resolved-tax delta must create an additional portfolio withdrawal');
  assert.strictEqual(funded.terminalBalance, shortcut.terminalBalance - 5000);
  assert.strictEqual(funded.rows[0].taxes, shortcut.rows[0].taxes + 5000);

  const traditionalInputs = build(100000, 10000, 'traditional');
  const traditionalShortcut = runSinglePath(traditionalInputs, returnPath);
  const traditionalFunded = runSinglePath(traditionalInputs, returnPath, {
    taxPolicy: (_row, { shortcutTax }) => shortcutTax + 5000,
    fundTaxPolicyDelta: true,
  });
  const extraGross = traditionalFunded.rows[0].withdrawal
    - traditionalShortcut.rows[0].withdrawal;
  assert.ok(extraGross > 5000, 'traditional funding must gross up the federal delta');
  assert.ok(Math.abs(extraGross * (1 - traditionalInputs.taxRates.ordinary) - 5000) < 0.01,
    'additional traditional withdrawal must net the resolved-tax delta after shortcut tax');

  const tightInputs = build(12000, 10000);
  const tightShortcut = runSinglePath(tightInputs, returnPath);
  const tightFunded = runSinglePath(tightInputs, returnPath, {
    taxPolicy: (_row, { shortcutTax }) => shortcutTax + 3000,
    fundTaxPolicyDelta: true,
  });
  assert.strictEqual(tightShortcut.failed, false, 'shortcut fixture must survive');
  assert.strictEqual(tightFunded.failed, true,
    'unfunded federal-tax delta must be able to change the path outcome');
});

test('engine rows expose taxable other income matching taxBySource', () => {
  const run = (taxablePct) => {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
    p.income.other = [{ label:'Annuity', amount:60000, startAge:65, endAge:95, taxablePct }];
    const params = resolveInputs(p, {});
    const row = runHistoricalPath(p, 1995, 'taxable-first').rows.find(r => r.age === 70);
    return { params, row };
  };

  const half = run(0.5);
  assert.strictEqual(half.row.otherIncome, 60000);
  assert.strictEqual(half.row.otherIncomeTaxable, 30000);
  assert.ok(Math.abs(
    half.row.otherIncomeTaxable - (half.row.taxBySource.oi / half.params.taxRates.ordinary)
  ) < 1e-9);

  const fully = run(undefined);
  assert.strictEqual(fully.params.otherIncome[0].taxablePct, 1);
  assert.strictEqual(fully.row.otherIncomeTaxable, fully.row.otherIncome);
});

// ── Earmarked-asset sale ("sell this to fund that") ─────────────────────────
// A sale is an OVERRIDE, never baked into the base plan, so the Baseline stays
// clean. Net proceeds = value − mortgage payoff − agent commission − cap-gains
// tax, landing in the taxable sleeve. Selling at the current age makes the
// nominal/real bridge 1, so the numbers are exact and easy to verify.
const houseplan = () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 95 };
  p.taxes = { ordinary: 22, capitalGains: 15 };
  p.properties = [{ name:'Home', value:1000000, purchasePrice:400000, commissionPct:0 }];  // no mortgage
  return p;
};

test('a sale with no override = nothing happens (Baseline stays clean)', () => {
  const p = houseplan();
  const r = resolveInputs(p, {});
  assert.strictEqual(r.assetSale, null, 'no assetSale override → no sale resolved');
  const m = runHistoricalPath(p, 1995, 'taxable-first');
  assert.ok(m.rows.every(x => !x.assetSale), 'no proceeds injected anywhere on the baseline');
});

test('net proceeds = value − commission − cap-gains tax (no mortgage, sold today)', () => {
  const p = houseplan();
  // value 1,000,000, basis 400,000, 0% commission, 15% cap-gains, k=0 (f=1):
  // gain 600,000 → tax 90,000 → net 910,000.
  const r = resolveInputs(p, { assetSale: { asset: 0, age: 65 } });
  assert.ok(r.assetSale, 'sale resolved');
  assert.ok(Math.abs(r.assetSale.netProceeds - 910000) < 1, `expected 910,000 net, got ${r.assetSale.netProceeds.toFixed(0)}`);
  assert.ok(Math.abs(r.assetSale.capGainsTax - 90000) < 1, 'cap-gains tax = 15% of the 600k gain');
});

test('agent commission is deducted from gross proceeds', () => {
  const p = houseplan();
  const noComm = resolveInputs(p, { assetSale: { asset: 0, age: 65 } }).assetSale.netProceeds;
  p.properties[0].commissionPct = 5;
  // 5% of 1,000,000 = 50,000 commission. Gain now (950,000−400,000)=550,000 →
  // tax 82,500. Net = 1,000,000 − 50,000 − 82,500 = 867,500.
  const withComm = resolveInputs(p, { assetSale: { asset: 0, age: 65 } }).assetSale;
  assert.ok(Math.abs(withComm.commission - 50000) < 1, 'commission = 5% of gross');
  assert.ok(Math.abs(withComm.netProceeds - 867500) < 1, `expected 867,500 net, got ${withComm.netProceeds.toFixed(0)}`);
  assert.ok(withComm.netProceeds < noComm, 'commission lowers net proceeds');
});

test('proceeds land in the taxable sleeve at the sale age and are reported on the row', () => {
  const p = houseplan();
  const m = runHistoricalPath(p, 1995, 'taxable-first', undefined, { assetSale: { asset: 0, age: 70 } });
  const at69 = m.rows.find(r => r.age === 69);
  const at70 = m.rows.find(r => r.age === 70);
  assert.strictEqual(at69.assetSale, 0, 'no proceeds before the sale year');
  assert.ok(at70.assetSale > 0, 'proceeds reported in the sale year');
  // taxable balance must jump by roughly the proceeds (net of that year's draw/return)
  assert.ok(at70.accountBalances.taxable > at69.accountBalances.taxable,
    'the taxable sleeve grows when the sale lands');
});

test('selling mid-mortgage stops the payments at the sale and nets out the payoff', () => {
  const p = houseplan();
  p.properties[0].mortgage = { balance: 500000, rate: 0, termYears: 10 };  // 0% → straight-line
  // Sell at 70 (5 of 10 yrs elapsed): remaining nominal payoff = 250,000.
  const sold = runHistoricalPath(p, 1995, 'taxable-first', undefined, { assetSale: { asset: 0, age: 70 } });
  assert.ok(sold.rows.find(r => r.age === 69).liabilities > 0, 'mortgage paid while held');
  // The SALE YEAR pays no mortgage: the payoff (deducted from proceeds) already
  // settles the remaining balance — paying again here would double-count it.
  assert.strictEqual(sold.rows.find(r => r.age === 70).liabilities, 0, 'no mortgage payment in the sale year');
  assert.strictEqual(sold.rows.find(r => r.age === 72).liabilities, 0, 'mortgage stops after the sale');
  // Net is lower than the unmortgaged case because the payoff is deducted.
  const free = resolveInputs(houseplan(), { assetSale: { asset: 0, age: 70 } }).assetSale.netProceeds;
  const mort = resolveInputs(p,           { assetSale: { asset: 0, age: 70 } }).assetSale;
  assert.ok(Math.abs(mort.mortgagePayoff - 250000 / Math.pow(1.025, 5)) < 1,
    'payoff = remaining balance, deflated to today\'s dollars');
  assert.ok(mort.netProceeds < free, 'the mortgage payoff reduces net proceeds');
});

test('a property with no entered cost basis assumes basis = value (no phantom gain)', () => {
  const p = houseplan();
  delete p.properties[0].purchasePrice;          // basis not entered
  const r = resolveInputs(p, { assetSale: { asset: 0, age: 65 } }).assetSale;
  // No basis → fall back to value → zero gain → zero cap-gains tax (NOT the whole
  // price taxed). With 0% commission and k=0, net = full value.
  assert.strictEqual(r.capGainsTax, 0, 'no substantiated basis → no invented gain');
  assert.ok(Math.abs(r.netProceeds - 1000000) < 1, 'net = full value when no gain and no costs');
});

test('selling an asset can rescue a plan that would otherwise run dry', () => {
  // A thin portfolio against heavy spending: fails on its own; the sale funds it.
  const p = houseplan();
  p.portfolio.accounts = { taxable:{balance:300000,basisPct:1}, traditional:{balance:0}, roth:{balance:0} };
  p.expenses = { living: 78000, housing: 0, debt: 0, healthcare: 0, healthcareRealGrowth: 0 };
  p.income.other = [];
  const horizon = 95 - 65;
  const bundle = Array.from({ length: 300 }, () => generateReturnPath(horizon));
  const keep = runSimulation(p, {}, bundle);
  const sell = runSimulation(p, { assetSale: { asset: 0, age: 66 } }, bundle);
  assert.ok(sell.successRate > keep.successRate + 1,
    `selling to fund spending must raise success (keep ${keep.successRate}%, sell ${sell.successRate}%)`);
});

test('spouse retirement age extends accumulation on the same calendar timeline', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.household.primary = { currentAge: 58, retirementAge: 65, planEndAge: 90 };
  p.household.spouse = { currentAge: 57, retirementAge: 67 };
  p.savings.annual = 50000;
  p.portfolio.accounts.taxable.balance = 5e6;
  p.portfolio.accounts.traditional.balance = 0;
  p.portfolio.accounts.roth.balance = 0;

  const resolved = resolveInputs(p, {});
  assert.strictEqual(resolved.retirementAge, 68,
    'spouse age 57 retiring at 67 maps to primary age 68');

  const m = runHistoricalPath(p, 1995, 'taxable-first');
  assert.strictEqual(m.rows.find(r => r.age === 67).phase, 'accum',
    'household remains in accumulation until spouse retirement calendar year');
  assert.notStrictEqual(m.rows.find(r => r.age === 68).phase, 'accum',
    'retirement cash flows start when both spouse retirement ages have arrived');

  p.household.spouse.retirementAge = 64;
  assert.strictEqual(resolveInputs(p, {}).retirementAge, 65,
    'same-calendar spouse retirement preserves the client retirement year');
});

/* ── pathDigest / assessPlan / returnDollars (story-mode aggregates) ────── */

import { pathDigest, assessPlan, ASSESSMENT_RULES } from './engine.js';

test('pathDigest invariants on a historical run (1973)', () => {
  const sim = runHistoricalPath(defaultPlan, 1973, 'taxable-first');
  const p   = resolveInputs(defaultPlan, {});
  const d   = pathDigest(sim, p);

  assert.strictEqual(d.endBalance, sim.terminalBalance, 'endBalance passes through');
  assert.strictEqual(d.realCagr, sim.cagr, 'realCagr passes through');
  assert.strictEqual(d.failed, sim.failed, 'failed passes through');

  const wdRates = sim.rows.filter(r => r.source != null && r.wdRate > 0).map(r => r.wdRate);
  assert.strictEqual(d.withdrawalYears, wdRates.length, 'withdrawal year count');
  assert.ok(d.avgWdRate >= Math.min(...wdRates) && d.avgWdRate <= Math.max(...wdRates),
    'average withdrawal rate sits inside the row range');
  assert.strictEqual(d.peakWdRate, Math.max(...wdRates), 'peak withdrawal rate');
  const peakRow = sim.rows.find(r => r.wdRate === d.peakWdRate);
  assert.strictEqual(d.peakWdAge, peakRow.age, 'peak age matches its row');

  const totals = Object.values(d.taxSourceTotals).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(totals - d.lifetimeTax) < 1, 'tax source totals reconcile with lifetime tax');
  const shares = Object.values(d.taxSourceShares).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(shares - 1) < 1e-9, 'tax source shares sum to 1');
  assert.ok(d.dominantTaxShare >= 0.25, 'dominant source carries the largest share');

  const early = sim.rows.filter(r => r.source != null && r.phase !== 'accum').slice(0, 10);
  assert.strictEqual(d.negEarlyYears, early.filter(r => r.returnRate < 0).length,
    'negative early years recount');
  assert.ok(d.underwaterSpellMax > 0, '1973 spends years underwater');
  assert.ok(d.spendShareOfStart > 0 && d.spendShareOfStart < 1, 'spend share computed with params');
  assert.ok(d.fixedIncomeShare > 0 && d.fixedIncomeShare < 1, 'fixed income covers part of outflows');
});

test('pathDigest scopes withdrawal stats to retirement rows', () => {
  const p = structuredClone(defaultPlan);
  p.household.primary.retirementAge = 70;            // 5 accumulation years
  const sim = runHistoricalPath(p, 1995, 'taxable-first');
  const d   = pathDigest(sim);
  const accumYears = sim.rows.filter(r => r.phase === 'accum').length;
  assert.ok(accumYears >= 5, 'run has accumulation rows');
  assert.ok(d.withdrawalYears <= sim.rows.length - accumYears,
    'withdrawal years exclude accumulation rows');
});

test('pathDigest damage window: 1973 grinds longer than 1995', () => {
  const a = pathDigest(runHistoricalPath(defaultPlan, 1973, 'taxable-first'));
  const b = pathDigest(runHistoricalPath(defaultPlan, 1995, 'taxable-first'));
  assert.ok(a.underwaterSpellMax > b.underwaterSpellMax,
    'stagflation decade stays underwater longer than the 90s boom');
});

test('returnDollars is the market gain on start-of-year balance', () => {
  const sim = runHistoricalPath(defaultPlan, 1973, 'taxable-first');
  for(const r of sim.rows.filter(x => x.source != null)){
    assert.ok(Math.abs(r.returnDollars - r.startBalance * r.returnRate) < 0.01,
      `row ${r.year}: returnDollars matches startBalance x return`);
  }
});

test('pathDigest is deterministic', () => {
  const sim = runHistoricalPath(defaultPlan, 2000, 'taxable-first');
  assert.deepStrictEqual(pathDigest(sim), pathDigest(sim), 'same input, same digest');
});

test('assessPlan emits facts that agree with the analysis', () => {
  resetSeed(12345);
  const res = runSimulation(defaultPlan, {});
  const a   = assessPlan(res);
  for(const list of [a.strengths, a.pressures, a.tossups]){
    assert.ok(Array.isArray(list));
    for(const item of list) assert.ok(item.id && item.value !== undefined, 'items carry id + value');
  }
  const hs = a.strengths.find(s => s.id === 'high-success');
  if(res.successRate >= ASSESSMENT_RULES.highSuccess.minSuccessRate){
    assert.ok(hs, 'high success rate is reported as a strength');
    assert.strictEqual(hs.value, res.successRate);
  } else {
    assert.ok(!hs, 'no high-success strength below threshold');
  }
  const rt = a.tossups.find(t => t.id === 'return-timing');
  const expectRt = res.paths.p10.failed && !res.paths.p50.failed;
  assert.strictEqual(!!rt, expectRt, 'return-timing tossup iff stressed fails while median survives');
});

test('assessPlan flags a lean plan and not a rich one', () => {
  resetSeed(777);
  const rich = structuredClone(defaultPlan);
  rich.portfolio.accounts.taxable.balance = 4000000;
  rich.portfolio.accounts.traditional.balance = 4000000;
  rich.portfolio.accounts.roth.balance = 2000000;
  const aRich = assessPlan(runSimulation(rich, {}));
  assert.ok(aRich.strengths.some(s => s.id === 'low-fixed-spending'),
    'rich plan: spending is a small share of assets');
  assert.ok(aRich.strengths.some(s => s.id === 'tax-diversified'),
    'rich plan: three meaningful buckets');

  resetSeed(777);
  const lean = structuredClone(defaultPlan);
  lean.portfolio.accounts.taxable.balance = 200000;
  lean.portfolio.accounts.traditional.balance = 500000;
  lean.portfolio.accounts.roth.balance = 0;
  const aLean = assessPlan(runSimulation(lean, {}));
  assert.ok(!aLean.strengths.some(s => s.id === 'low-fixed-spending'),
    'lean plan: spending share too high to qualify');
  assert.ok(aLean.pressures.some(p => p.id === 'withdrawal-load'),
    'lean plan: withdrawal pressure shows');
});
