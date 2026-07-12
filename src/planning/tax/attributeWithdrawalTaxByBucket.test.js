import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WITHDRAWAL_TAX_COALITIONS,
  attributeWithdrawalTaxByBucket,
} from './attributeWithdrawalTaxByBucket.js';

function additiveTaxes({ baseline = 1000, taxable = 100, traditional = 200, roth = 0 } = {}){
  const values = {};
  for(const coalition of WITHDRAWAL_TAX_COALITIONS){
    values[coalition.id] = baseline
      + (coalition.buckets.includes('taxable') ? taxable : 0)
      + (coalition.buckets.includes('traditional') ? traditional : 0)
      + (coalition.buckets.includes('roth') ? roth : 0);
  }
  return values;
}

test('three-bucket attribution exactly reconciles additive coalition tax', () => {
  const result = attributeWithdrawalTaxByBucket(additiveTaxes());
  assert.deepEqual(result.byBucket, { taxable: 100, traditional: 200, roth: 0 });
  assert.deepEqual(result.exactSixthCentsByBucket, {
    taxable: 60000,
    traditional: 120000,
    roth: 0,
  });
  assert.deepEqual(result.displayByBucket, { taxable: 100, traditional: 200, roth: 0 });
  assert.equal(result.incrementalTax, 300);
  assert.equal(result.reconciliation.attributedTax, 300);
  assert.equal(result.reconciliation.differenceSixthCents, 0);
  assert.equal(result.reconciliation.difference, 0);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.byBucket), true);
});

test('attribution is symmetric, preserves a dummy Roth bucket, and retains signed interactions', () => {
  const values = {
    none: 100,
    taxable: 80,
    traditional: 130,
    roth: 100,
    'taxable+traditional': 120,
    'taxable+roth': 80,
    'traditional+roth': 130,
    'taxable+traditional+roth': 120,
  };
  const result = attributeWithdrawalTaxByBucket(values);
  assert.equal(result.byBucket.roth, 0);
  assert.ok(result.byBucket.taxable < 0, 'a legitimate tax-reducing marginal effect is retained');
  assert.equal(
    result.byBucket.taxable + result.byBucket.traditional + result.byBucket.roth,
    result.incrementalTax
  );

  const symmetric = attributeWithdrawalTaxByBucket(additiveTaxes({
    taxable: 123.45,
    traditional: 123.45,
  }));
  assert.equal(symmetric.byBucket.taxable, symmetric.byBucket.traditional);
});

test('fractional-cent symmetry is exact and display rounding stays separate', () => {
  const values = {
    none: 100,
    taxable: 100,
    traditional: 100,
    roth: 100,
    'taxable+traditional': 100.01,
    'taxable+roth': 100,
    'traditional+roth': 100,
    'taxable+traditional+roth': 100.01,
  };
  const result = attributeWithdrawalTaxByBucket(values);

  assert.deepEqual(result.exactSixthCentsByBucket, {
    taxable: 3,
    traditional: 3,
    roth: 0,
  });
  assert.equal(result.byBucket.taxable, 0.005);
  assert.equal(result.byBucket.taxable, result.byBucket.traditional);
  assert.equal(result.reconciliation.incrementalSixthCents, 6);
  assert.equal(result.reconciliation.attributedSixthCents, 6);
  assert.equal(result.reconciliation.differenceSixthCents, 0);
  assert.deepEqual(result.displayByBucket, {
    taxable: 0.01,
    traditional: 0.01,
    roth: 0,
  });
  assert.equal(result.displayReconciliation.attributedTax, 0.02);
  assert.equal(result.displayReconciliation.difference, -0.01);
});

test('attribution requires every canonical coalition and rejects invalid tax values', () => {
  const missing = additiveTaxes();
  delete missing.roth;
  assert.throws(() => attributeWithdrawalTaxByBucket(missing), /roth is required/);
  assert.throws(() => attributeWithdrawalTaxByBucket({
    ...additiveTaxes(),
    taxable: Number.NaN,
  }), /finite non-negative/);
});
