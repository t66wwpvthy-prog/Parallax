import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeAnnualFederalTax } from '../federal/composers/annualFederalTax.js';
import { client1040IntakeToComposerInput } from '../adapters/client1040Intake.js';
import { LINE_STATUS, TAX_TOTAL_SCOPE } from '../core/form1040Lines.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

const ctx = () => ({
  calculatedAt: '2026-06-21T12:00:00.000Z',
  runId: 'golden_1040',
  scenarioId: 'golden',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

function loadFixtures(){
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const raw = readFileSync(join(fixturesDir, name), 'utf8');
      return JSON.parse(raw);
    });
}

for(const fixture of loadFixtures()){
  test(`golden 1040: ${fixture.id}`, () => {
    const input = client1040IntakeToComposerInput(fixture);
    const { result, audits } = composeAnnualFederalTax(input, ctx());
    const { expected } = fixture;

    assert.strictEqual(result.taxTotalScope, TAX_TOTAL_SCOPE.INCOME_TAX_ONLY);

    if(expected.line6b !== undefined){
      assert.strictEqual(result.form1040.line6b.value, expected.line6b);
    }
    if(expected.line10 !== undefined){
      assert.strictEqual(result.form1040.line10.value, expected.line10);
    }
    if(expected.line12e !== undefined){
      assert.strictEqual(result.form1040.line12e.status, LINE_STATUS.CALCULATED);
      assert.strictEqual(result.form1040.line12e.ruleId, 'FED_STANDARD_DEDUCTION');
      assert.strictEqual(result.form1040.line12e.value, expected.line12e);
    }
    if(expected.line15 !== undefined){
      assert.strictEqual(result.form1040.line15.value, expected.line15);
    }
    if(expected.line24 !== undefined){
      assert.strictEqual(result.form1040.line24.value, expected.line24);
      assert.strictEqual(result.totalFederalTax, expected.line24);
    }

    assert.ok(audits.length >= 1, `${fixture.id} should produce at least one audit`);
  });
}
