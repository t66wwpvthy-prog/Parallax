import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessAnnual1040EngineReadiness,
  buildAnnual1040Result,
  buildDefaultTaxContext,
  runClient1040Intake,
  validateClient1040Intake,
  ANNUAL_1040_MODULE_VERSION,
} from '../annual1040.js';

const here = dirname(fileURLToPath(import.meta.url));
const annualFixturesDir = join(here, 'fixtures', 'annual');

function loadAnnualFixtures(){
  return readdirSync(annualFixturesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(annualFixturesDir, name), 'utf8')));
}

function assertStableResultShape(result){
  assert.strictEqual(result.moduleVersion, ANNUAL_1040_MODULE_VERSION);
  assert.ok(result.filingStatus);
  assert.ok(result.lines.line11);
  assert.ok(result.lines.line15);
  assert.ok(result.lines.line16);
  assert.ok(result.lines.line24);
  assert.ok(Array.isArray(result.calculated));
  assert.ok(Array.isArray(result.captured));
  assert.ok(Array.isArray(result.passThrough));
  assert.ok(Array.isArray(result.unsupportedIntentional));
  assert.ok(Array.isArray(result.architectureLater));
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.audit));
  assert.ok(result.federalSummary);
  assert.strictEqual(result.federalSummary.federalTaxLiability, result.lines.line24.value);
}

for(const fixture of loadAnnualFixtures()){
  test(`annual fixture pack: ${fixture.id}`, () => {
    const context = buildDefaultTaxContext({ scenarioId: fixture.id, taxYear: fixture.taxYear ?? 2026 });
    const { annual1040Result, result, report } = runClient1040Intake(fixture, context);

    assertStableResultShape(annual1040Result);

    if(fixture.expected?.line11a !== undefined){
      assert.strictEqual(annual1040Result.lines.line11.value, fixture.expected.line11a);
    }
    if(fixture.expected?.line15 !== undefined){
      assert.strictEqual(annual1040Result.lines.line15.value, fixture.expected.line15);
    }
    if(fixture.expected?.line16 !== undefined){
      assert.strictEqual(annual1040Result.lines.line16.value, fixture.expected.line16);
    }
    if(fixture.expected?.line24 !== undefined){
      assert.strictEqual(annual1040Result.lines.line24.value, fixture.expected.line24);
      assert.strictEqual(annual1040Result.federalSummary.federalTaxLiability, fixture.expected.line24);
    }
    if(fixture.expected?.line18 !== undefined){
      assert.strictEqual(annual1040Result.line24Breakdown.line18, fixture.expected.line18);
    }
    if(fixture.expected?.line21 !== undefined){
      assert.strictEqual(annual1040Result.line24Breakdown.line21, fixture.expected.line21);
    }
    if(fixture.expected?.line22 !== undefined){
      assert.strictEqual(annual1040Result.line24Breakdown.line22, fixture.expected.line22);
    }
    if(fixture.expected?.taxTotalScope !== undefined){
      assert.strictEqual(annual1040Result.federalSummary.taxTotalScope, fixture.expected.taxTotalScope);
    }

    if(fixture.expectPassThrough){
      for(const lineId of fixture.expectPassThrough){
        assert.ok(
          annual1040Result.passThrough.some((row) => row.lineId === lineId),
          `pass-through ${lineId} should appear in annual1040Result`
        );
      }
    }

    assert.ok(annual1040Result.unsupportedIntentional.length >= 1);
    assert.ok(annual1040Result.audit.length >= 1);

    if(fixture.expectWarnings){
      for(const code of fixture.expectWarnings){
        assert.ok(annual1040Result.warnings.some((w) => w.code === code));
      }
    }

    assert.strictEqual(annual1040Result.errors.length, 0);
    assert.ok(report.calculated.length >= 1);
  });
}

test('annual1040 pipeline exports stable contract fields', () => {
  const fixture = loadAnnualFixtures()[0];
  const context = buildDefaultTaxContext({ scenarioId: fixture.id });
  const pipeline = runClient1040Intake(fixture, context);

  assert.ok(pipeline.annual1040Result);
  assert.ok(pipeline.validation);
  assert.ok(pipeline.report);
  assert.ok(buildAnnual1040Result(
    fixture,
    pipeline.result,
    pipeline.audits,
    pipeline.validation,
    context,
    pipeline.report
  ));
});

test('validation errors are fatal; warnings are non-fatal', () => {
  const invalid = {
    filingStatus: 'single',
    income: { ordinaryDividends: 100, qualifiedDividends: 500 },
  };
  const validation = validateClient1040Intake(invalid);
  assert.ok(validation.errors.length > 0);
  assert.throws(() => runClient1040Intake(invalid, buildDefaultTaxContext()), /qualifiedDividends cannot exceed/);

  const warned = runClient1040Intake({
    filingStatus: 'single',
    taxYear: 2025,
    income: { wages: 50000 },
    deductions: { useStandard: true },
  }, buildDefaultTaxContext({ taxYear: 2026 }), { strict: true });

  assert.ok(warned.annual1040Result.warnings.some((w) => w.code === 'TAX_YEAR_LAW_MISMATCH'));
  assert.strictEqual(warned.annual1040Result.errors.length, 0);
});

test('engine readiness assessment documents blockers and stable exports', () => {
  const readiness = assessAnnual1040EngineReadiness();
  assert.strictEqual(readiness.readyForOneYearEngineAdapter, true);
  assert.ok(readiness.blockers.length >= 1);
  assert.ok(readiness.stableExports.includes('runClient1040Intake'));
});
