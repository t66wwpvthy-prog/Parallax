/* Integration tests: rule + composer + adapter working together.
   Run with: node --test  (Node 18+)
   Still zero dependency on engine.js — the adapter is exercised with a plain
   fixture object shaped like an engine year result. */

import { test } from 'node:test';
import assert from 'node:assert';
import { composeAnnualFederalTax } from '../federal/composers/annualFederalTax.js';
import { adaptEngineYearToTaxInput } from '../adapters/engineToTaxInput.js';
import { rulesLedger, getRuleById, getRulesByTriggerTag } from '../core/rulesLedger.js';
import { TRIGGER_TAGS } from '../core/constants.js';

const ctx = () => ({
  calculatedAt: '2026-06-14T12:00:00.000Z',
  runId: 'integration_run',
  scenarioId: 'integration_scenario',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

test('composer total equals the ordinary rule total in Phase 1', () => {
  const input = { filingStatus: 'single', taxableOrdinaryIncome: 100000 };
  const { result, audits } = composeAnnualFederalTax(input, ctx());
  assert.strictEqual(result.totalFederalTax, 16712);
  assert.strictEqual(result.totalFederalTax, result.ordinaryIncomeTax.ordinaryTax);
  assert.strictEqual(audits.length, 1);
  assert.strictEqual(audits[0].ruleId, 'FED_ORDINARY_INCOME_TAX');
});

test('adapter reshapes an engine-like year fact bundle into the narrow tax input', () => {
  const engineYearResult = {
    // extra engine fields the rule must never see directly:
    age: 67, balance: 1_500_000, withdrawal: 80000,
    // resolved facts the adapter passes through:
    filingStatus: 'marriedFilingJointly',
    taxableOrdinaryIncome: 180000,
  };
  const taxInput = adaptEngineYearToTaxInput(engineYearResult);
  assert.deepStrictEqual(taxInput, { filingStatus: 'marriedFilingJointly', taxableOrdinaryIncome: 180000 });

  const { result } = composeAnnualFederalTax(taxInput, ctx());
  assert.strictEqual(result.totalFederalTax, 29024);
});

test('adapter throws when a required fact is missing (no silent default)', () => {
  assert.throws(() => adaptEngineYearToTaxInput({ filingStatus: 'single' }));
  assert.throws(() => adaptEngineYearToTaxInput({ taxableOrdinaryIncome: 100000 }));
});

test('every ledger rule satisfies the rule contract', () => {
  assert.ok(rulesLedger.length >= 1);
  for(const rule of rulesLedger){
    assert.strictEqual(typeof rule.calculate, 'function');
    assert.strictEqual(typeof rule.validate, 'function');
    assert.ok(rule.meta && typeof rule.meta.ruleId === 'string');
    assert.ok(Array.isArray(rule.meta.triggerTags));
  }
});

test('every ledger rule uses only controlled trigger tags', () => {
  for(const rule of rulesLedger){
    for(const tag of rule.meta.triggerTags){
      assert.ok(TRIGGER_TAGS.includes(tag),
        `rule ${rule.meta.ruleId} uses unknown trigger tag: ${tag}`);
    }
  }
});

test('ledger is queryable by id and trigger tag', () => {
  assert.ok(getRuleById('FED_ORDINARY_INCOME_TAX'));
  assert.strictEqual(getRuleById('NOPE'), null);
  const byTag = getRulesByTriggerTag('bracket_calculation');
  assert.ok(byTag.some(r => r.meta.ruleId === 'FED_ORDINARY_INCOME_TAX'));
  assert.deepStrictEqual(getRulesByTriggerTag('no_such_tag'), []);
});

test('no tax module file imports engine.js', async () => {
  // Boundary guard: the tax engine must never depend on engine.js.
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));   // src/tax/
  const offenders = [];
  const walk = (dir) => {
    for(const name of readdirSync(dir)){
      const full = join(dir, name);
      if(statSync(full).isDirectory()){ walk(full); continue; }
      if(!full.endsWith('.js')) continue;
      const src = readFileSync(full, 'utf8');
      // Match an actual import/require of engine.js, not prose mentions in comments.
      if(/(?:from|import|require)\s*\(?\s*['"][^'"]*engine\.js['"]/.test(src)) offenders.push(full);
    }
  };
  walk(root);
  assert.deepStrictEqual(offenders, [], `tax files referencing engine.js: ${offenders.join(', ')}`);
});
