import { resolvePortfolioAccounts } from '../../household/resolvePortfolioAccounts.js';
import { isConfirmedBasisEnvelope } from '../../household/factEnvelope.js';

const BUCKET_META = Object.freeze({
  taxable: Object.freeze({ label: 'Taxable', taxTreatment: 'taxable' }),
  traditional: Object.freeze({ label: 'Tax-deferred', taxTreatment: 'tax-deferred' }),
  roth: Object.freeze({ label: 'Roth', taxTreatment: 'potentially-tax-free' }),
});

function freezeList(values){
  return Object.freeze([...values]);
}

function uniqueSorted(values){
  return freezeList([...new Set(values)].sort());
}

function valuationSummary(accounts){
  const material = accounts.filter(account => account.balance > 0);
  if(!material.length){
    return Object.freeze({ date: null, status: 'empty' });
  }
  const dates = material.map(account => account.valuationDate);
  if(dates.some(date => date === null)){
    return Object.freeze({ date: null, status: 'incomplete' });
  }
  const unique = [...new Set(dates)];
  return unique.length === 1
    ? Object.freeze({ date: unique[0], status: 'complete' })
    : Object.freeze({ date: null, status: 'mixed' });
}

function taxableBasisSummary(accounts){
  const material = accounts.filter(account => account.balance > 0);
  const capitalAssets = material.filter(account => account.taxCharacter === 'capital_asset');
  const bankAccounts = material.filter(account => account.taxCharacter === 'taxable_cash');
  const unclassified = material.filter(account => !['capital_asset', 'taxable_cash'].includes(account.taxCharacter));
  const confirmed = capitalAssets.filter(account => isConfirmedBasisEnvelope(account.basis));
  const complete = capitalAssets.length > 0
    && confirmed.length === capitalAssets.length
    && unclassified.length === 0;
  const status = capitalAssets.length === 0 && unclassified.length === 0
    ? 'not-applicable'
    : complete ? 'confirmed' : 'incomplete';
  const reportedCostBasis = complete
    ? confirmed.reduce((sum, account) => sum + account.basis.amount, 0)
    : null;
  const capitalAssetBalance = capitalAssets.reduce((sum, account) => sum + account.balance, 0);

  return Object.freeze({
    status,
    capitalAssetBalance,
    bankBalance: bankAccounts.reduce((sum, account) => sum + account.balance, 0),
    unclassifiedBalance: unclassified.reduce((sum, account) => sum + account.balance, 0),
    reportedCostBasis,
    unrealizedGain: reportedCostBasis === null ? null : capitalAssetBalance - reportedCostBasis,
  });
}

function buildBucket(key, fold){
  const bucket = fold.taxBuckets[key];
  const accounts = fold.accounts.filter(account => account.taxBucketGroup === key);
  const material = accounts.filter(account => account.balance > 0);
  return Object.freeze({
    id: key,
    ...BUCKET_META[key],
    balance: bucket.balance,
    accountCount: material.length,
    accountIds: freezeList(material.map(account => account.id)),
    taxCharacters: uniqueSorted(material.map(account => account.taxCharacter)),
    strategyRulesPendingAccountIds: freezeList(
      material.filter(account => account.strategyRulesPending).map(account => account.id)
    ),
  });
}

/**
 * Display-neutral current-account contract for later Tax Buckets views.
 * It contains no projection, withdrawal recommendation, or tax calculation.
 */
export function buildCurrentTaxBucketSnapshot(plan){
  const fold = resolvePortfolioAccounts(plan);
  const includedAccounts = fold.accounts.filter(account => account.taxBucketGroup);
  const materialPending = fold.pendingStrategyAccounts.filter(account => account.balance > 0);
  const status = fold.totalBalance === 0
    ? 'empty'
    : fold.issues.length > 0 || fold.includedBalance === 0
      ? 'incomplete'
      : 'ready';
  const taxableAccounts = includedAccounts.filter(account => account.taxBucketGroup === 'taxable');
  const excludedAccounts = fold.excludedAccounts.map(account => Object.freeze({
    id: account.id,
    typeId: account.typeId,
    label: account.label,
    balance: account.balance,
    reason: account.exclusionReason,
  }));

  return Object.freeze({
    schemaVersion: 1,
    householdId: plan?.meta?.householdId ?? null,
    householdName: plan?.meta?.name ?? null,
    status,
    totalBalance: fold.totalBalance,
    includedBalance: fold.includedBalance,
    excludedBalance: fold.excludedBalance,
    buckets: Object.freeze({
      taxable: buildBucket('taxable', fold),
      traditional: buildBucket('traditional', fold),
      roth: buildBucket('roth', fold),
    }),
    taxableBasis: taxableBasisSummary(taxableAccounts),
    valuation: valuationSummary(includedAccounts),
    strategyReadiness: Object.freeze({
      status: materialPending.length ? 'rules-pending' : 'not-evaluated',
      pendingAccountIds: freezeList(materialPending.map(account => account.id)),
    }),
    excludedAccounts: Object.freeze(excludedAccounts),
    issues: freezeList(fold.issues),
  });
}
