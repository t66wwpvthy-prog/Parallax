import test from 'node:test';
import assert from 'node:assert/strict';
import { itemizedDeductionLimitCopy } from './itemizedDeductionDisplay.js';

function summary(overrides = {}){
  return {
    status: 'ready',
    itemizedDeductionBreakdown: {
      medical: { enteredAmount:8000, appliedAmount:0, floorRate:.075, floorAmount:27843.75 },
      salt: { enteredAmount:44800, appliedAmount:40000, capAmount:40000 },
      direct: {},
    },
    ...overrides,
  };
}

test('medical copy explains a fully disallowed amount', () => {
  assert.equal(
    itemizedDeductionLimitCopy(summary(), 'medical'),
    'below 7.5% AGI floor — $0 applied'
  );
});

test('medical copy shows entered and partially applied amounts', () => {
  const value = summary();
  value.itemizedDeductionBreakdown.medical = {
    enteredAmount: 30000,
    appliedAmount: 2156.25,
    floorRate: .075,
    floorAmount: 27843.75,
  };
  assert.equal(
    itemizedDeductionLimitCopy(value, 'medical'),
    '$30,000 entered — $2,156 applied after 7.5% AGI floor'
  );
});

test('SALT copy uses the rolled-up entered amount and cap', () => {
  assert.equal(
    itemizedDeductionLimitCopy(summary(), 'real_estate_tax'),
    '$44,800 entered — capped at $40,000'
  );
});

test('copy is empty when no limitation applies or the summary is unavailable', () => {
  const value = summary();
  value.itemizedDeductionBreakdown.salt = {
    enteredAmount: 30000,
    appliedAmount: 30000,
    capAmount: 40000,
  };
  assert.equal(itemizedDeductionLimitCopy(value, 'salt'), '');
  assert.equal(itemizedDeductionLimitCopy({ status:'needs_facts' }, 'medical'), '');
  assert.equal(itemizedDeductionLimitCopy(summary(), 'charitable'), '');
});
