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
import { composeAnnualFederalTax } from '../src/tax/federal/composers/annualFederalTax.js';
import { client1040IntakeToComposerInput, reconcileTaxTotal } from '../src/tax/adapters/client1040Intake.js';
import { SPINE_LINE_IDS } from '../src/tax/core/form1040Lines.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultFixturesDir = join(here, '..', 'src', 'tax', 'tests', 'fixtures');

const ctx = {
  calculatedAt: new Date().toISOString(),
  runId: 'tax_intake',
  scenarioId: 'manual',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
};

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
    .find(({ data }) => data.id === arg || basename(name, '.json') === arg);

  if(byId) return [byId.data];

  const customPath = resolve(arg);
  return [JSON.parse(readFileSync(customPath, 'utf8'))];
}

function printFixture(fixture){
  const input = client1040IntakeToComposerInput(fixture);
  const { result, audits } = composeAnnualFederalTax(input, ctx());

  console.log('\n' + '═'.repeat(64));
  console.log(`${fixture.id}: ${fixture.label || ''}`);
  console.log('─'.repeat(64));

  for(const lineId of SPINE_LINE_IDS){
    const line = result.form1040[lineId];
    const rule = line.ruleId ? ` ← ${line.ruleId}` : '';
    console.log(`${lineId.padEnd(8)} ${line.status.padEnd(16)} ${fmt(line.value).padStart(14)}${rule}`);
  }

  for(const extra of ['line3b', 'line6b', 'line7a']){
    const line = result.form1040[extra];
    if(!line) continue;
    console.log(`${extra.padEnd(8)} ${line.status.padEnd(16)} ${fmt(line.value).padStart(14)} ← ${line.ruleId || 'composer'}`);
  }

  console.log('─'.repeat(64));
  console.log(`Total federal tax (line24): ${fmt(result.totalFederalTax)}`);
  console.log(`Tax total scope: ${result.taxTotalScope}`);
  console.log(`Audits: ${audits.map((a) => a.ruleId).join(' → ')}`);

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

  const recon = reconcileTaxTotal(result, fixture.reconciliation?.theirLine24, fixture.reconciliation?.tolerance ?? 1);
  if(recon){
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
