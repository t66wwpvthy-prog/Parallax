import { test } from 'node:test';
import assert from 'node:assert';
import { generateReturnPath, runSimulation, defaultPlan } from '../../../engine.js';
import { attachTypicalPathFederalTax } from './attachTypicalPathFederalTax.js';
import { buildPlanMetaFromEngineParams, buildRowPlanMetaFromOptions } from './buildPlanMetaFromEngineParams.js';

test('buildPlanMetaFromEngineParams requires filing status and optional overrides', () => {
  const planMeta = buildPlanMetaFromEngineParams({
    accounts: {
      taxable: { balance: 1000000, basis: 600000 },
      traditional: { balance: 0 },
      roth: { balance: 0 },
    },
  }, { filingStatus: 'marriedFilingJointly', baseTaxYear: 2025, taxableGainFraction: 0.4 });

  assert.strictEqual(planMeta.filingStatus, 'marriedFilingJointly');
  assert.strictEqual(planMeta.taxableGainFraction, 0.4);
  assert.deepStrictEqual(planMeta.deductions, { useStandard: true });

  const rowPlanMeta = buildRowPlanMetaFromOptions({ baseTaxYear: 2025 });
  assert.deepStrictEqual(rowPlanMeta({ year: 3 }), { taxYear: 2026 });
  assert.deepStrictEqual(rowPlanMeta({ year: 99 }), { taxYear: 2026 });
});

test('buildPlanMetaFromEngineParams uses household filing status without an MFJ default', () => {
  for(const filingStatus of [
    'single',
    'marriedFilingJointly',
    'headOfHousehold',
    'marriedFilingSeparately',
  ]){
    const planMeta = buildPlanMetaFromEngineParams({
      meta: { filingStatus },
      accounts: { taxable: { balance: 0, basis: 0 } },
    });
    assert.strictEqual(planMeta.filingStatus, filingStatus);
  }

  assert.throws(
    () => buildPlanMetaFromEngineParams({
      accounts: { taxable: { balance: 0, basis: 0 } },
    }),
    /plan\.meta\.filingStatus/
  );
});

test('attachTypicalPathFederalTax returns slim summary without mutating analysis', () => {
  const horizon = defaultPlan.household.primary.planEndAge - defaultPlan.household.primary.currentAge;
  const paths = Array.from({ length: 12 }, () => generateReturnPath(horizon));
  const analysis = runSimulation(defaultPlan, {}, paths);

  const beforeLifetimeTax = analysis.paths.p50.lifetimeTax;
  const beforeFirstRowTax = analysis.paths.p50.rows[0].taxes;

  const summary = attachTypicalPathFederalTax(analysis, {
    baseTaxYear: 2025,
    scenarioId: 'attach_test',
    filingStatus: 'marriedFilingJointly',
  });

  assert.strictEqual(analysis.paths.p50.lifetimeTax, beforeLifetimeTax);
  assert.strictEqual(analysis.paths.p50.rows[0].taxes, beforeFirstRowTax);
  assert.strictEqual(summary.path, 'p50');
  assert.strictEqual(typeof summary.simIndex, 'number');
  assert.ok(Array.isArray(summary.years));
  assert.ok(summary.years.length > 0);
  assert.strictEqual(typeof summary.totals.federalTaxLiability, 'number');
  assert.strictEqual(typeof summary.totals.enginePathTax, 'number');
  assert.strictEqual(summary.totals.engineLifetimeTax, beforeLifetimeTax);
  assert.ok(Math.abs(
    summary.totals.deltaVsEnginePath
    - (summary.totals.federalTaxLiability - summary.totals.enginePathTax)
  ) < 0.01);
  assert.ok(Array.isArray(summary.warnings));
  assert.ok(summary.scope);
  assert.ok(summary.years.every((year) =>
    year.engineTax != null
    && Math.abs(year.delta - (year.federalTaxLiability - year.engineTax)) < 0.01
  ));
});

test('attachTypicalPathFederalTax skips accumulation and failed filler rows', () => {
  const analysis = {
    params: { retirementAge: 65, currentAge: 60, accounts: { taxable: { balance: 0, basis: 0 } } },
    paths: {
      p50: {
        simIndex: 0,
        lifetimeTax: 5000,
        rows: [
          { year: 1, age: 61, phase: 'accum', taxes: 0, accountBreakdown: { taxable: 0, traditional: 0, roth: 0 } },
          {
            year: 6,
            source: 2025,
            age: 66,
            socialSecurity: 30000,
            pension: 0,
            taxes: 4000,
            accountBreakdown: { taxable: 0, traditional: 20000, roth: 0 },
            rmd: 0,
          },
          {
            year: 7,
            source: 2026,
            age: 67,
            socialSecurity: 0,
            pension: 0,
            otherIncome: 0,
            taxes: 0,
            accountBreakdown: { taxable: 0, traditional: 0, roth: 0 },
            rmd: 0,
          },
          {
            year: 8,
            source: null,
            age: 68,
            failed: true,
            socialSecurity: 0,
            otherIncome: 0,
            taxes: 0,
            accountBreakdown: { taxable: 0, traditional: 0, roth: 0 },
          },
        ],
      },
    },
  };

  const summary = attachTypicalPathFederalTax(analysis, { baseTaxYear: 2025, filingStatus: 'single' });
  const mfjSummary = attachTypicalPathFederalTax(analysis, {
    baseTaxYear: 2025,
    filingStatus: 'marriedFilingJointly',
  });
  assert.strictEqual(summary.years.length, 2);
  assert.strictEqual(summary.years[0].year, 6);
  assert.strictEqual(summary.years[1].year, 7);
  assert.strictEqual(summary.years[1].federalTaxLiability, 0);
  assert.strictEqual(summary.totals.enginePathTax, 4000);
  assert.ok(summary.totals.federalTaxLiability > mfjSummary.totals.federalTaxLiability);
});

test('attachTypicalPathFederalTax throws when p50 rows are missing', () => {
  assert.throws(
    () => attachTypicalPathFederalTax({ paths: {} }),
    /analysis\.paths\.p50\.rows is required/
  );
});
