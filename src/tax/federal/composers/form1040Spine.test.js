import { test } from 'node:test';
import assert from 'node:assert';
import { SPINE_LINE_IDS, LINE_STATUS, assertAllSpineLines } from '../../core/form1040Lines.js';
import { buildForm1040IncomeSpine } from './form1040Spine.js';

const ctx = () => ({
  calculatedAt: '2026-06-21T12:00:00.000Z',
  runId: 'spine_test',
  scenarioId: 'spine_scenario',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

test('every spine line is present with a valid status', () => {
  const { form1040 } = buildForm1040IncomeSpine(
    { filingStatus: 'single', taxableOrdinaryIncome: 50000 },
    ctx()
  );
  assertAllSpineLines(form1040);
  for(const lineId of SPINE_LINE_IDS){
    assert.ok(form1040[lineId], `missing ${lineId}`);
    assert.ok(Object.values(LINE_STATUS).includes(form1040[lineId].status));
  }
});

test('Phase-1 shortcut supplies line15 and defers upstream income lines', () => {
  const { form1040 } = buildForm1040IncomeSpine(
    { filingStatus: 'single', taxableOrdinaryIncome: 100000 },
    ctx()
  );
  assert.strictEqual(form1040.line15.status, LINE_STATUS.SUPPLIED);
  assert.strictEqual(form1040.line15.value, 100000);
  assert.strictEqual(form1040.line1z.status, LINE_STATUS.DEFERRED);
  assert.strictEqual(form1040.line9.status, LINE_STATUS.DEFERRED);
});

test('Social Security rule feeds line6b and rolls through to line15', () => {
  const { form1040, ordinaryTaxableIncome } = buildForm1040IncomeSpine({
    filingStatus: 'marriedFilingJointly',
    supplied: { line1z: 38000, line12e: 31500 },
    socialSecurity: {
      socialSecurityBenefits: 10000,
      otherIncome: 38000,
      taxExemptInterest: 2500,
      excludedIncomeAddBacks: 0,
      adjustments: 0,
      livedWithSpouse: true,
    },
  }, ctx());

  assert.strictEqual(form1040.line6b.status, LINE_STATUS.CALCULATED);
  assert.strictEqual(form1040.line6b.value, 6275);
  assert.strictEqual(form1040.line9.value, 44275);
  assert.strictEqual(form1040.line11a.value, 44275);
  assert.strictEqual(form1040.line15.value, 12775);
  assert.strictEqual(ordinaryTaxableIncome, 12775);
});

test('Traditional IRA deductibility feeds line10 and reduces line15', () => {
  const { form1040 } = buildForm1040IncomeSpine({
    filingStatus: 'marriedFilingJointly',
    supplied: { line1z: 100000, line12e: 31500 },
    traditionalIra: {
      modifiedAgi: 130000,
      contributionAmount: 7500,
      age: 40,
      taxableCompensation: 100000,
      taxpayerCoveredByWorkplacePlan: true,
      spouseCoveredByWorkplacePlan: false,
      livedWithSpouse: true,
    },
  }, ctx());

  assert.strictEqual(form1040.line10.status, LINE_STATUS.CALCULATED);
  assert.strictEqual(form1040.line10.value, 7130);
  assert.strictEqual(form1040.line11a.value, 92870);
  assert.strictEqual(form1040.line15.value, 61370);
});

test('SS and IRA together wire through the full income spine', () => {
  const { form1040 } = buildForm1040IncomeSpine({
    filingStatus: 'marriedFilingJointly',
    supplied: { line1z: 38000, line12e: 31500 },
    socialSecurity: {
      socialSecurityBenefits: 10000,
      otherIncome: 38000,
      taxExemptInterest: 2500,
      excludedIncomeAddBacks: 0,
      adjustments: 0,
      livedWithSpouse: true,
    },
    traditionalIra: {
      modifiedAgi: 130000,
      contributionAmount: 7500,
      age: 40,
      taxableCompensation: 100000,
      taxpayerCoveredByWorkplacePlan: true,
      spouseCoveredByWorkplacePlan: false,
      livedWithSpouse: true,
    },
  }, ctx());

  assert.strictEqual(form1040.line6b.value, 6275);
  assert.strictEqual(form1040.line10.value, 7130);
  assert.strictEqual(form1040.line9.value, 44275);
  assert.strictEqual(form1040.line11a.value, 37145);
  assert.strictEqual(form1040.line15.value, 5645);
});
