#!/usr/bin/env node
/* Quick manual flow check: feed composer inputs, print 1040 spine lines.
   Usage:
     node scripts/tax-smoke.mjs              # run built-in scenarios
     node scripts/tax-smoke.mjs phase1      # one scenario by id
   Not a test runner — for eyeballing input → line flow. */

import { composeAnnualFederalTax } from '../src/tax/federal/composers/annualFederalTax.js';
import { SPINE_LINE_IDS } from '../src/tax/core/form1040Lines.js';

const ctx = {
  calculatedAt: new Date().toISOString(),
  runId: 'tax_smoke',
  scenarioId: 'manual',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
};

const scenarios = {
  phase1: {
    label: 'Phase 1 shortcut — ordinary income only',
    input: { filingStatus: 'single', taxableOrdinaryIncome: 100_000 },
  },
  capitalGains: {
    label: 'Shortcut + LTCG stacking',
    input: {
      filingStatus: 'single',
      taxableOrdinaryIncome: 49_000,
      capitalGains: { netLongTermCapitalGains: 1_000, qualifiedDividends: 0 },
    },
  },
  fullSpine: {
    label: 'Full spine — wages + SS + IRA deduction',
    input: {
      filingStatus: 'marriedFilingJointly',
      supplied: { line1z: 38_000, line12e: 31_500 },
      socialSecurity: {
        socialSecurityBenefits: 10_000,
        otherIncome: 38_000,
        taxExemptInterest: 2_500,
        excludedIncomeAddBacks: 0,
        adjustments: 0,
        livedWithSpouse: true,
      },
      traditionalIra: {
        modifiedAgi: 130_000,
        contributionAmount: 7_500,
        age: 40,
        taxableCompensation: 100_000,
        taxpayerCoveredByWorkplacePlan: true,
        spouseCoveredByWorkplacePlan: false,
        livedWithSpouse: true,
      },
    },
  },
};

function fmt(n){
  if(n === null || n === undefined) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function printResult(id, { label, input }){
  const { result, audits } = composeAnnualFederalTax(input, ctx);
  console.log('\n' + '═'.repeat(60));
  console.log(`Scenario: ${id}`);
  console.log(label);
  console.log('Input:', JSON.stringify(input, null, 2));
  console.log('─'.repeat(60));

  for(const lineId of SPINE_LINE_IDS){
    const line = result.form1040[lineId];
    const rule = line.ruleId ? `  ← ${line.ruleId}` : '';
    console.log(
      `${lineId.padEnd(8)} ${line.status.padEnd(16)} ${fmt(line.value).padStart(14)}${rule}`
    );
  }

  const extra = ['line3b', 'line6b', 'line7a'].filter(k => result.form1040[k]);
  for(const lineId of extra){
    const line = result.form1040[lineId];
    console.log(
      `${lineId.padEnd(8)} ${line.status.padEnd(16)} ${fmt(line.value).padStart(14)}  ← ${line.ruleId || 'composer'}`
    );
  }

  console.log('─'.repeat(60));
  console.log(`Total federal tax (line24): ${fmt(result.totalFederalTax)}`);
  console.log(`Audits: ${audits.map(a => a.ruleId).join(' → ') || '(none)'}`);
}

const pick = process.argv[2];
if(pick){
  if(!scenarios[pick]){
    console.error(`Unknown scenario "${pick}". Choose: ${Object.keys(scenarios).join(', ')}`);
    process.exit(1);
  }
  printResult(pick, scenarios[pick]);
} else {
  for(const [id, scenario] of Object.entries(scenarios)){
    printResult(id, scenario);
  }
}
