import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDefaultTaxContext,
  engineYearTo1040Input,
  runEngineYearTax,
} from '../annual1040.js';

const here = dirname(fileURLToPath(import.meta.url));
const demoWagesPath = join(here, 'fixtures', 'engine-year', 'demo-wages.json');

function loadDemoWagesFacts(){
  const fixture = JSON.parse(readFileSync(demoWagesPath, 'utf8'));
  const { inputMode, row, planMeta, expected, label, id, ...facts } = fixture;
  if(id !== undefined) facts.id = id;
  if(label !== undefined) facts.label = label;
  return facts;
}

test('demo-wages regression: 2025 itemized return with dividends and LTCG', () => {
  const facts = loadDemoWagesFacts();
  const context = buildDefaultTaxContext({ taxYear: 2025, scenarioId: 'demo-wages-regression' });
  const intake = engineYearTo1040Input(facts);
  const { annual1040Result } = runEngineYearTax(facts, context);

  assert.strictEqual(context.lawVersion, '2025_FINAL');
  assert.strictEqual(intake.filingStatus, 'marriedFilingJointly');
  assert.strictEqual(annual1040Result.metadata.lawVersion, '2025_FINAL');
  assert.strictEqual(annual1040Result.lines.line11.value, 349961);
  assert.strictEqual(annual1040Result.lines.line15.value, 291198);
  assert.strictEqual(annual1040Result.lines.line16.value, 55493.05);
  assert.strictEqual(annual1040Result.lines.line24.value, 55493.05);
  assert.strictEqual(annual1040Result.federalSummary.marginalRate, 0.24);
});
