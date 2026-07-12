import test from 'node:test';
import assert from 'node:assert/strict';

import { createAccount } from '../../household/createAccount.js';
import { buildCurrentTaxBucketSnapshot } from './buildCurrentTaxBucketSnapshot.js';

function planWithBase(taxable = 0, traditional = 0, roth = 0){
  return {
    meta: { householdId: 'hh1', name: 'Test Household' },
    portfolio: {
      accounts: {
        taxable: { balance: taxable, basisPct: 0.6 },
        traditional: { balance: traditional },
        roth: { balance: roth },
      },
      extraAccounts: [],
    },
  };
}

function account(typeId, id, balance, options = {}){
  return {
    ...createAccount(typeId, {
      balance,
      owner: options.owner ?? 'client',
      valuationDate: options.valuationDate ?? '2026-07-12',
    }),
    id,
    ...options,
  };
}

function confirmedBasis(amount){
  return {
    amount,
    method: 'reported-cost-basis',
    status: 'confirmed',
    source: 'household-entry',
    confirmedAt: '2026-07-12T12:00:00Z',
    version: 1,
  };
}

test('snapshot reports approved current buckets and preserves inherited rule gates', () => {
  const plan = planWithBase();
  plan.portfolio.extraAccounts = [
    account('brokerage_taxable', 'broker', 100000, { basis: confirmedBasis(60000) }),
    account('checking', 'checking', 20000),
    account('401k', 'trad', 200000),
    account('inherited_traditional_ira', 'inherited-trad', 50000),
    account('roth_ira', 'roth', 40000),
    account('inherited_roth_ira', 'inherited-roth', 25000),
    account('hsa', 'hsa', 10000),
  ];

  const snapshot = buildCurrentTaxBucketSnapshot(plan);
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.totalBalance, 445000);
  assert.equal(snapshot.includedBalance, 435000);
  assert.equal(snapshot.excludedBalance, 10000);
  assert.equal(snapshot.buckets.taxable.balance, 120000);
  assert.equal(snapshot.buckets.traditional.balance, 250000);
  assert.equal(snapshot.buckets.roth.balance, 65000);
  assert.deepEqual(snapshot.buckets.traditional.strategyRulesPendingAccountIds, ['inherited-trad']);
  assert.deepEqual(snapshot.buckets.roth.strategyRulesPendingAccountIds, ['inherited-roth']);
  assert.equal(snapshot.strategyReadiness.status, 'rules-pending');
  assert.deepEqual(snapshot.strategyReadiness.pendingAccountIds, ['inherited-trad', 'inherited-roth']);
  assert.deepEqual(snapshot.excludedAccounts, [{
    id: 'hsa', typeId: 'hsa', label: 'HSA', balance: 10000,
    reason: 'outside-current-tax-buckets-scope',
  }]);
  assert.deepEqual(snapshot.taxableBasis, {
    status: 'confirmed',
    capitalAssetBalance: 100000,
    bankBalance: 20000,
    unclassifiedBalance: 0,
    reportedCostBasis: 60000,
    unrealizedGain: 40000,
  });
  assert.deepEqual(snapshot.valuation, { date: '2026-07-12', status: 'complete' });
});

test('unknown brokerage basis remains unknown rather than becoming a plausible number', () => {
  const plan = planWithBase();
  plan.portfolio.extraAccounts = [account('brokerage_taxable', 'broker', 100000)];
  const snapshot = buildCurrentTaxBucketSnapshot(plan);
  assert.equal(snapshot.taxableBasis.status, 'incomplete');
  assert.equal(snapshot.taxableBasis.reportedCostBasis, null);
  assert.equal(snapshot.taxableBasis.unrealizedGain, null);
});

test('incomplete confirmed-basis provenance is never reported as confirmed', () => {
  const plan = planWithBase();
  plan.portfolio.extraAccounts = [account('brokerage_taxable', 'broker', 100000, {
    basis: { amount: 60000, status: 'confirmed' },
  })];
  const snapshot = buildCurrentTaxBucketSnapshot(plan);
  assert.equal(snapshot.taxableBasis.status, 'incomplete');
  assert.equal(snapshot.taxableBasis.reportedCostBasis, null);
  assert.equal(snapshot.taxableBasis.unrealizedGain, null);
});

test('bank-only taxable balances do not create a fictional capital-gain basis', () => {
  const plan = planWithBase();
  plan.portfolio.extraAccounts = [
    account('checking', 'checking', 10000),
    account('savings', 'savings', 20000),
    account('money_market', 'mm', 30000),
    account('certificate_of_deposit', 'cd', 40000),
  ];
  const snapshot = buildCurrentTaxBucketSnapshot(plan);
  assert.equal(snapshot.buckets.taxable.balance, 100000);
  assert.equal(snapshot.taxableBasis.status, 'not-applicable');
  assert.equal(snapshot.taxableBasis.bankBalance, 100000);
  assert.equal(snapshot.taxableBasis.reportedCostBasis, null);
});

test('legacy overlap is preserved numerically but blocks a ready snapshot', () => {
  const plan = planWithBase(100000, 0, 0);
  plan.portfolio.extraAccounts = [account('brokerage_taxable', 'broker', 50000)];
  const snapshot = buildCurrentTaxBucketSnapshot(plan);
  assert.equal(snapshot.totalBalance, 150000);
  assert.equal(snapshot.buckets.taxable.balance, 150000);
  assert.equal(snapshot.status, 'incomplete');
  assert.deepEqual(snapshot.issues, ['LEGACY_TYPED_OVERLAP']);
  assert.equal(snapshot.taxableBasis.status, 'incomplete');
  assert.equal(snapshot.taxableBasis.reportedCostBasis, null);
});

test('out-of-scope-only household is not mislabeled as having no accounts', () => {
  const plan = planWithBase();
  plan.portfolio.extraAccounts = [account('hsa', 'hsa', 50000)];
  const snapshot = buildCurrentTaxBucketSnapshot(plan);
  assert.equal(snapshot.totalBalance, 50000);
  assert.equal(snapshot.includedBalance, 0);
  assert.equal(snapshot.status, 'incomplete');
  assert.equal(snapshot.excludedBalance, 50000);
});

test('valuation summary distinguishes complete, mixed, and missing dates', () => {
  const plan = planWithBase();
  plan.portfolio.extraAccounts = [
    account('roth_ira', 'one', 100, { valuationDate: '2026-07-12' }),
    account('traditional_ira', 'two', 200, { valuationDate: '2026-07-11' }),
  ];
  assert.deepEqual(buildCurrentTaxBucketSnapshot(plan).valuation, { date: null, status: 'mixed' });
  plan.portfolio.extraAccounts[1].valuationDate = null;
  assert.deepEqual(buildCurrentTaxBucketSnapshot(plan).valuation, { date: null, status: 'incomplete' });
});

test('empty and frozen snapshot is deterministic and does not mutate the plan', () => {
  const plan = planWithBase();
  const before = structuredClone(plan);
  const first = buildCurrentTaxBucketSnapshot(plan);
  const second = buildCurrentTaxBucketSnapshot(plan);
  assert.equal(first.status, 'empty');
  assert.deepEqual(first, second);
  assert.deepEqual(plan, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.buckets), true);
  assert.equal(Object.isFrozen(first.buckets.taxable), true);
  assert.throws(() => { first.buckets.taxable.balance = 1; }, TypeError);
});
