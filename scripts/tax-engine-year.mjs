#!/usr/bin/env node
/* Run engine-year facts (or simulation row + planMeta) through the adapter pipeline.
   Usage:
     npm run tax:engine-year
     npm run tax:engine-year -- demo-wages
     npm run tax:engine-year -- path/to/engine-year.json
*/

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runEngineYearTax,
  buildDefaultTaxContext,
  engineYearTo1040Input,
  mapSimulationRowToYearFacts,
} from '../src/tax/annual1040.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultFixturesDir = join(here, '..', 'src', 'tax', 'tests', 'fixtures', 'engine-year');

function fmt(n){
  if(n === null || n === undefined) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function loadFixture(arg){
  const fixturesDir = process.env.TAX_ENGINE_FIXTURES_DIR
    ? resolve(process.env.TAX_ENGINE_FIXTURES_DIR)
    : defaultFixturesDir;

  if(!arg){
    return readdirSync(fixturesDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')));
  }

  const byId = readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, data: JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) }))
    .find(({ name, data }) => data.id === arg || basename(name, '.json') === arg);

  if(byId) return [byId.data];

  return [JSON.parse(readFileSync(resolve(arg), 'utf8'))];
}

function resolveEngineYearFacts(fixture){
  if(fixture.inputMode === 'row'){
    const planMeta = {
      ...fixture.planMeta,
      filingStatus: fixture.planMeta?.filingStatus ?? fixture.filingStatus,
      taxYear: fixture.planMeta?.taxYear ?? fixture.taxYear,
      id: fixture.id,
      label: fixture.label,
    };
    return mapSimulationRowToYearFacts(fixture.row, planMeta);
  }
  const { inputMode, row, planMeta, expected, label, id, ...facts } = fixture;
  if(id !== undefined) facts.id = id;
  if(label !== undefined) facts.label = label;
  return facts;
}

function printIncomeFacts(facts){
  const inc = facts.income || {};
  const rows = [
    ['wages', inc.wages],
    ['socialSecurityBenefits', inc.socialSecurityBenefits],
    ['pensionAmount', inc.pensionAmount],
    ['otherIncome', inc.otherIncome],
    ['iraDistributions', inc.iraDistributions],
    ['capitalGain', inc.capitalGain],
    ['taxableIra', inc.taxableIra],
    ['taxablePensions', inc.taxablePensions],
    ['taxableSocialSecurity', inc.taxableSocialSecurity ?? inc.taxableSS],
  ].filter(([, v]) => v !== undefined);

  if(facts.taxableOrdinaryIncome !== undefined){
    rows.unshift(['taxableOrdinaryIncome (shortcut)', facts.taxableOrdinaryIncome]);
  }

  for(const [key, value] of rows){
    console.log(`  ${key.padEnd(32)} ${fmt(value).padStart(14)}`);
  }

  if(facts.deductions){
    console.log(`  ${'deductions'.padEnd(32)} ${JSON.stringify(facts.deductions)}`);
  }
}

function printFixture(fixture){
  const taxYear = fixture.taxYear ?? fixture.planMeta?.taxYear ?? 2026;
  const context = buildDefaultTaxContext({
    scenarioId: fixture.id || 'engine-year',
    taxYear,
  });

  console.log('\n' + '═'.repeat(64));
  console.log(`${fixture.id || 'engine-year'}: ${fixture.label || ''}`);
  console.log(`Input mode: ${fixture.inputMode || 'facts'} · Law: ${context.lawVersion} (${context.taxYear})`);
  console.log('─'.repeat(64));

  if(fixture.inputMode === 'row'){
    console.log('Step 1 — Simulation row (engine-shaped cash flows)');
    const row = fixture.row;
    console.log(`  age ${row.age ?? '—'} · SS ${fmt(row.socialSecurity)} · pension ${fmt(row.pension)}`);
    console.log(`  withdrawals taxable ${fmt(row.accountBreakdown?.taxable)} · traditional ${fmt(row.accountBreakdown?.traditional)} · rmd ${fmt(row.rmd)}`);
    console.log('\nStep 2 — planMeta (filing status, wages, gain split, resolved overrides)');
    console.log(`  filingStatus: ${fixture.planMeta?.filingStatus ?? fixture.filingStatus}`);
    if(fixture.planMeta?.wages !== undefined) console.log(`  wages: ${fmt(fixture.planMeta.wages)}`);
    if(fixture.planMeta?.taxableGainFraction !== undefined){
      console.log(`  taxableGainFraction: ${fixture.planMeta.taxableGainFraction}`);
    }
    if(fixture.planMeta?.resolved){
      console.log(`  resolved overrides: ${JSON.stringify(fixture.planMeta.resolved)}`);
    }
    console.log('\nStep 3 — mapSimulationRowToYearFacts → engineYearFacts');
  } else {
    console.log('Step 1 — engineYearFacts (direct JSON)');
  }

  const facts = resolveEngineYearFacts(fixture);
  printIncomeFacts(facts);

  const intakeStep = fixture.inputMode === 'row' ? 4 : 2;
  const runStep = fixture.inputMode === 'row' ? 5 : 3;

  console.log(`\nStep ${intakeStep} — engineYearTo1040Input → client1040 intake`);
  const intake = engineYearTo1040Input(facts);
  console.log(`  filingStatus: ${intake.filingStatus}`);
  if(intake.taxableOrdinaryIncome !== undefined){
    console.log(`  shortcut taxableOrdinaryIncome: ${fmt(intake.taxableOrdinaryIncome)}`);
  } else if(intake.income){
    console.log(`  income keys: ${Object.keys(intake.income).join(', ')}`);
  }

  console.log(`\nStep ${runStep} — runEngineYearTax → annual1040Result`);
  const { annual1040Result, audits, report } = runEngineYearTax(facts, context);
  const r = annual1040Result;

  console.log('─'.repeat(64));
  console.log(`  line11 (AGI):        ${fmt(r.lines.line11.value)}`);
  console.log(`  line15 (taxable):    ${fmt(r.lines.line15.value)}`);
  console.log(`  line16 (income tax): ${fmt(r.lines.line16.value)}`);
  console.log(`  line24 (total tax):  ${fmt(r.lines.line24.value)}`);
  console.log(`  marginal rate:       ${r.federalSummary.marginalRate != null ? `${(r.federalSummary.marginalRate * 100).toFixed(0)}%` : '—'}`);
  console.log(`  scope:               ${r.federalSummary.taxTotalScope}`);
  console.log(`  audits:              ${audits.map((a) => a.ruleId).join(' → ')}`);

  if(report.validation.warnings.length){
    console.log('─'.repeat(64));
    console.log('Warnings');
    for(const w of report.validation.warnings){
      console.log(`  ⚠ ${w.code}: ${w.message}`);
    }
  }

  if(fixture.expected){
    console.log('─'.repeat(64));
    console.log('Expected vs computed:');
    for(const [key, value] of Object.entries(fixture.expected)){
      const lineKey = key.startsWith('line') ? key.replace(/^line/, 'line') : null;
      const computed = lineKey
        ? r.lines[lineKey.replace('line', 'line')]?.value
        : r.federalSummary.federalTaxLiability;
      const mapped = key === 'line11a' ? r.lines.line11.value
        : key === 'line15' ? r.lines.line15.value
        : key === 'line16' ? r.lines.line16.value
        : key === 'line24' ? r.lines.line24.value
        : computed;
      const ok = mapped === value ? '✓' : '✗';
      console.log(`  ${ok} ${key}: expected ${fmt(value)}, got ${fmt(mapped)}`);
    }
  }
}

const arg = process.argv[2];
for(const fixture of loadFixture(arg)){
  printFixture(fixture);
}
