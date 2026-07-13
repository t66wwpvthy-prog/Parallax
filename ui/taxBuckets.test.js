import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTaxBucketsViewModel,
  renderTaxBucketsPage,
} from './taxBuckets.js';

function snapshot(overrides = {}){
  return {
    schemaVersion: 1,
    status: 'ready',
    buckets: {
      taxable: { balance: 487200, taxCharacters: ['capital_asset'] },
      traditional: { balance: 1142600, taxCharacters: ['traditional_ira'] },
      roth: { balance: 263900, taxCharacters: ['roth_ira'] },
    },
    taxableBasis: {
      status: 'confirmed',
      reportedCostBasis: 312400,
      unrealizedGain: 174800,
    },
    ...overrides,
  };
}

test('approved three-pod view renders live snapshot values without a replay control', () => {
  const html = renderTaxBucketsPage(snapshot(), { explored:true });
  assert.equal((html.match(/class="tb-pod tb-pod-/g) || []).length, 3);
  assert.match(html, /Taxable · Non‑Qualified/);
  assert.match(html, /\$487,200/);
  assert.match(html, /\$1,142,600/);
  assert.match(html, /\$263,900/);
  assert.match(html, /Cost basis/);
  assert.match(html, /\$312,400/);
  assert.match(html, /\+\$174,800/);
  assert.doesNotMatch(html, /Replay entrance/);
});

test('tax-character labels stay honest for cash and employer plans', () => {
  const input = snapshot({
    buckets: {
      taxable: { balance: 100000, taxCharacters: ['taxable_cash'] },
      traditional: { balance: 500000, taxCharacters: ['employer_pretax'] },
      roth: { balance: 0, taxCharacters: [] },
    },
    taxableBasis: {
      status: 'not-applicable',
      reportedCostBasis: null,
      unrealizedGain: null,
    },
  });
  const model = buildTaxBucketsViewModel(input);
  assert.equal(model.pods[0].character, 'Interest taxed as ordinary income');
  assert.equal(model.pods[0].rows.length, 0);
  assert.equal(model.pods[1].label, 'Tax‑Deferred · Employer Plans');
});

test('unknown basis is disclosed instead of calculated in the UI', () => {
  const input = snapshot({
    taxableBasis: {
      status: 'incomplete',
      reportedCostBasis: null,
      unrealizedGain: null,
    },
  });
  assert.deepEqual(buildTaxBucketsViewModel(input).pods[0].rows, [
    { label:'Cost basis', value:'Not confirmed' },
    { label:'Unrealized gain', value:'—' },
  ]);
});

test('empty and incomplete snapshots render fail-closed states', () => {
  const empty = renderTaxBucketsPage(snapshot({ status:'empty' }), { explored:true });
  assert.match(empty, /No accounts entered yet/);
  assert.doesNotMatch(empty, /class="tb-pods"/);

  const incomplete = renderTaxBucketsPage(snapshot({ status:'incomplete' }), { explored:true });
  assert.match(incomplete, /needs review in Household/);
  assert.doesNotMatch(incomplete, /class="tb-pods"/);
});
