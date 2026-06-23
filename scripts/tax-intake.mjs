#!/usr/bin/env node
/* Run a client 1040 intake fixture through the tax engine.
   Usage:
     npm run tax:intake
     npm run tax:intake -- client-b-mfj-retiree
     npm run tax:intake -- path/to/custom-intake.json
*/

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClient1040Intake, buildDefaultTaxContext } from '../src/tax/annual1040.js';
import { INCOME_DETAIL_LINE_IDS, SPINE_LINE_IDS } from '../src/tax/core/form1040Lines.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultFixturesDir = join(here, '..', 'src', 'tax', 'tests', 'fixtures');

function buildContext(fixture){
  return buildDefaultTaxContext({
    scenarioId: fixture.id || 'manual',
    taxYear: fixture.taxYear ?? 2026,
  });
}

function fmt(n){
  if(n === null || n === undefined) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function loadFixture(arg){
  const fixturesDir = process.env.TAX_FIXTURES_DIR
    ? resolve(process.env.TAX_FIXTURES_DIR)
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

  const customPath = resolve(arg);
  return [JSON.parse(readFileSync(customPath, 'utf8'))];
}

function printSection(title, rows, formatter){
  if(!rows.length) return;
  console.log(`\n${title}`);
  console.log('─'.repeat(64));
  for(const row of rows){
    console.log(formatter(row));
  }
}

function printFixture(fixture){
  const context = buildContext(fixture);
  const { result, audits, report, annual1040Result } = runClient1040Intake(fixture, context);

  console.log('\n' + '═'.repeat(64));
  console.log(`${fixture.id || 'intake'}: ${fixture.label || ''}`);
  if(fixture.taxYear !== undefined){
    console.log(`Tax year (intake): ${fixture.taxYear} · Engine law: ${context.taxYear}`);
  }
  console.log('─'.repeat(64));

  printSection('Captured (from intake)', report.captured, (row) => {
    const path = row.intakePath ? ` (${row.intakePath})` : '';
    return `  ${row.lineId.padEnd(8)} ${fmt(row.value).padStart(14)}${path}`;
  });

  printSection('Calculated', report.calculated.filter((row) =>
    ['line9', 'line11a', 'line14', 'line15', 'line16', 'line18', 'line21', 'line22', 'line24'].includes(row.lineId)
    || row.lineId.startsWith('line1')
  ), (row) => {
    const rule = row.ruleId ? ` ← ${row.ruleId}` : '';
    return `  ${row.lineId.padEnd(8)} ${fmt(row.value).padStart(14)}${rule}`;
  });

  printSection('Pass-through (supplied, not independently calculated)', report.passThrough, (row) => {
    const note = row.notes ? ` · ${row.notes}` : '';
    return `  ${row.lineId.padEnd(8)} ${fmt(row.value).padStart(14)} ← INTAKE_PASS_THROUGH${note}`;
  });

  printSection('Unsupported (intentional — not calculated)', report.unsupportedIntentional, (row) => {
    return `  ${row.lineId.padEnd(12)} ${row.label}`;
  });

  printSection('Architecture later', report.architectureLater, (row) => {
    return `  ${row.lineId.padEnd(12)} ${row.label}${row.supplied ? ' (supplied)' : ''}`;
  });

  console.log('\nSpine detail');
  console.log('─'.repeat(64));
  for(const lineId of SPINE_LINE_IDS){
    const line = result.form1040[lineId];
    const rule = line.ruleId ? ` ← ${line.ruleId}` : '';
    console.log(`${lineId.padEnd(8)} ${line.status.padEnd(16)} ${fmt(line.value).padStart(14)}${rule}`);
  }
  for(const extra of INCOME_DETAIL_LINE_IDS){
    const line = result.form1040[extra];
    if(!line) continue;
    console.log(`${extra.padEnd(8)} ${line.status.padEnd(16)} ${fmt(line.value).padStart(14)} ← ${line.ruleId || 'composer'}`);
  }

  console.log('─'.repeat(64));
  console.log('Highlights (annual1040Result)');
  console.log(`  line11 (AGI):          ${fmt(annual1040Result.lines.line11.value)}`);
  console.log(`  line15 (taxable):      ${fmt(annual1040Result.lines.line15.value)}`);
  console.log(`  line16 (income tax):   ${fmt(annual1040Result.lines.line16.value)}`);
  console.log(`  line24 (total tax):    ${fmt(annual1040Result.lines.line24.value)}`);
  console.log(`  Tax total scope:         ${report.taxTotalScope}`);
  console.log(`  Audits: ${audits.map((a) => a.ruleId).join(' → ')}`);

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
      const lineKey = key.startsWith('line') ? key : null;
      const computed = lineKey ? result.form1040[lineKey]?.value : result.totalFederalTax;
      const ok = computed === value ? '✓' : '✗';
      console.log(`  ${ok} ${key}: expected ${fmt(value)}, got ${fmt(computed)}`);
    }
  }

  if(report.reconciliation){
    const recon = report.reconciliation;
    console.log('─'.repeat(64));
    console.log(`Reconciliation vs client 1040 line24: ${recon.withinTolerance ? 'PASS' : 'FAIL'}`);
    console.log(`  Their line24:     ${fmt(recon.theirLine24)}`);
    console.log(`  Computed line24:  ${fmt(recon.computedLine24)}`);
    console.log(`  Delta:            ${fmt(recon.delta)}`);
  }
}

const arg = process.argv[2];
for(const fixture of loadFixture(arg)){
  printFixture(fixture);
}
