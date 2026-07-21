import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGuidedSummaryAllocation, guidedSummaryConic } from './guidedPlanningWizard.js';

function planWith({ spouse = true } = {}){
  return {
    household: { primary: {}, spouse: spouse ? {} : null },
    portfolio: {
      extraAccounts: [
        { owner: 'client', bucket: 'traditional', balance: 2100000 },
        { owner: 'joint', bucket: 'taxable', balance: 1380000 },
        { owner: 'spouse', bucket: 'roth', balance: 420000 },
      ],
    },
    properties: [{ value: 1600000 }],
  };
}

test('guided summary groups real balances into the reference allocation order', () => {
  const allocation = buildGuidedSummaryAllocation(planWith());

  assert.equal(allocation.assetTotal, 5500000);
  assert.deepEqual(allocation.segments.map(segment => segment.label), [
    'Tax-deferred',
    'Property',
    'Taxable',
    'Roth',
  ]);
  assert.equal(allocation.segments.reduce((sum, segment) => sum + segment.amount, 0), allocation.assetTotal);
});

test('guided summary excludes spouse-owned accounts for a single-person household', () => {
  const allocation = buildGuidedSummaryAllocation(planWith({ spouse: false }));

  assert.equal(allocation.assetTotal, 5080000);
  assert.equal(allocation.segments.some(segment => segment.label === 'Roth'), false);
});

test('guided summary renders an empty track and subtle segment separators', () => {
  assert.equal(guidedSummaryConic([]), 'conic-gradient(rgba(231,222,201,0.055) 0 100%)');

  const allocation = buildGuidedSummaryAllocation(planWith());
  const conic = guidedSummaryConic(allocation.segments);
  assert.match(conic, /^conic-gradient\(from -90deg,/);
  assert.match(conic, /rgba\(11,13,17,0\.96\)/);
});
