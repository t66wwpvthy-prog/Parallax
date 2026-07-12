import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultPlan } from '../../engine.js';
import { createAccount } from './createAccount.js';
import { createBlankTaxProfiles } from './factEnvelope.js';
import { applyHouseholdTaxFactEdit } from './taxFactEdits.js';
import { MAX_TAX_FACT_YEAR } from './taxFactDefinitions.js';

const CONFIRMED_AT = '2026-07-12T14:30:00.000Z';

function plan(){
  const value = structuredClone(defaultPlan);
  value.meta.filingStatus = 'single';
  value.household.spouse = null;
  value.portfolio.extraAccounts = [];
  value.taxProfiles = createBlankTaxProfiles();
  return value;
}

function account(typeId, id, { owner = 'client', balance = 100000 } = {}){
  const value = createAccount(typeId, { owner, balance });
  value.id = id;
  return value;
}

function confirmedFact(value){
  return {
    value,
    status: 'confirmed',
    source: 'household-entry',
    confirmedAt: CONFIRMED_AT,
    version: 1,
  };
}

function assertUnchangedAfterThrow(value, edit, options, pattern){
  const before = structuredClone(value);
  assert.throws(
    () => applyHouseholdTaxFactEdit(value, edit, options),
    pattern
  );
  assert.deepEqual(value, before);
}

test('account basis edits target a stable ID and replace the whole envelope atomically', () => {
  const value = plan();
  const first = account('brokerage_taxable', 'broker-one');
  const second = account('tod_brokerage', 'broker-two');
  value.portfolio.extraAccounts = [first, second];
  const untouched = structuredClone(first);

  const confirmed = applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-account-basis',
    accountId: 'broker-two',
    value: 0,
  }, { now: CONFIRMED_AT });

  assert.deepEqual(confirmed, { changed: true, affectsCalculation: true });
  assert.deepEqual(value.portfolio.extraAccounts[0], untouched);
  assert.deepEqual(value.portfolio.extraAccounts[1].basis, {
    amount: 0,
    method: 'reported-cost-basis',
    status: 'confirmed',
    source: 'household-entry',
    confirmedAt: CONFIRMED_AT,
    version: 1,
  });

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-account-basis', accountId: 'broker-two', value: 0,
  }, { now: () => CONFIRMED_AT }), { changed: false, affectsCalculation: false });

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'clear-account-basis', accountId: 'broker-two',
  }), { changed: true, affectsCalculation: true });
  assert.deepEqual(value.portfolio.extraAccounts[1].basis, {
    amount: null,
    method: 'unknown',
    status: 'unknown',
    source: null,
    confirmedAt: null,
    version: 1,
  });
  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'clear-account-basis', accountId: 'broker-two',
  }), { changed: false, affectsCalculation: false });
});

test('invalid basis edits reject before mutation', () => {
  for(const bad of [-1, '0', null, NaN, Infinity]){
    const value = plan();
    value.portfolio.extraAccounts = [account('brokerage_taxable', 'broker')];
    assertUnchangedAfterThrow(value, {
      kind: 'confirm-account-basis', accountId: 'broker', value: bad,
    }, { now: CONFIRMED_AT }, /finite nonnegative/i);
  }

  const invalidTime = plan();
  invalidTime.portfolio.extraAccounts = [account('brokerage_taxable', 'broker')];
  assertUnchangedAfterThrow(invalidTime, {
    kind: 'confirm-account-basis', accountId: 'broker', value: 10,
  }, { now: 'not-a-date' }, /ISO confirmation timestamp/i);

  const wrongType = plan();
  wrongType.portfolio.extraAccounts = [account('traditional_ira', 'ira')];
  assertUnchangedAfterThrow(wrongType, {
    kind: 'confirm-account-basis', accountId: 'ira', value: 10,
  }, { now: CONFIRMED_AT }, /taxable capital assets/i);

  const missing = plan();
  missing.portfolio.extraAccounts = [account('brokerage_taxable', 'broker')];
  assertUnchangedAfterThrow(missing, {
    kind: 'clear-account-basis', accountId: 'missing',
  }, {}, /Unknown accountId/i);
});

test('account reporting modes are atomic and derive taxpayer/share from ownership', () => {
  const value = plan();
  value.portfolio.extraAccounts = [
    account('joint_brokerage', 'joint', { owner: 'joint' }),
    account('traditional_ira', 'ira'),
  ];

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'set-account-tax-reporting',
    accountId: 'joint',
    inclusion: 'household-return',
  }), { changed: true, affectsCalculation: true });
  assert.deepEqual(value.portfolio.extraAccounts[0].taxReporting, {
    inclusion: 'household-return',
    reportingTaxpayer: 'return-level',
    householdReturnShare: 1,
  });

  applyHouseholdTaxFactEdit(value, {
    kind: 'set-account-tax-reporting',
    accountId: 'joint',
    inclusion: 'separate-return',
  });
  assert.deepEqual(value.portfolio.extraAccounts[0].taxReporting, {
    inclusion: 'separate-return',
    reportingTaxpayer: null,
    householdReturnShare: 0,
  });

  applyHouseholdTaxFactEdit(value, {
    kind: 'set-account-tax-reporting',
    accountId: 'joint',
    inclusion: 'unknown',
  });
  assert.deepEqual(value.portfolio.extraAccounts[0].taxReporting, {
    inclusion: 'unknown',
    reportingTaxpayer: null,
    householdReturnShare: null,
  });

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'set-account-tax-reporting',
    accountId: 'ira',
    inclusion: 'separate-return',
  }), { changed: true, affectsCalculation: false });
  assert.deepEqual(value.portfolio.extraAccounts[1].taxReporting, {
    inclusion: 'separate-return',
    reportingTaxpayer: 'client',
    householdReturnShare: 0,
  });

  assertUnchangedAfterThrow(value, {
    kind: 'set-account-tax-reporting', accountId: 'joint', inclusion: 'sometimes',
  }, {}, /Unsupported tax-reporting inclusion/i);
});

test('owner scalar facts preserve exact zero and false and clear to a valid unknown envelope', () => {
  const value = plan();
  value.household.spouse = { currentAge: 60, retirementAge: 65, planEndAge: 90 };

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-owner-fact',
    owner: 'client',
    group: 'profile',
    key: 'blind',
    value: false,
  }, { now: () => CONFIRMED_AT }), { changed: true, affectsCalculation: false });
  assert.deepEqual(value.taxProfiles.client.blind, confirmedFact(false));

  applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-owner-fact',
    owner: 'client',
    group: 'traditionalIra',
    key: 'priorYearCarryforwardBasis',
    value: 0,
  }, { now: CONFIRMED_AT });
  assert.deepEqual(
    value.taxProfiles.client.traditionalIra.priorYearCarryforwardBasis,
    confirmedFact(0)
  );

  applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-owner-fact',
    owner: 'spouse',
    group: 'rothIra',
    key: 'firstContributionYear',
    value: 1999,
  }, { now: CONFIRMED_AT });
  assert.deepEqual(value.taxProfiles.spouse.rothIra.firstContributionYear, confirmedFact(1999));

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'clear-owner-fact',
    owner: 'client',
    group: 'profile',
    key: 'blind',
  }), { changed: true, affectsCalculation: false });
  assert.deepEqual(value.taxProfiles.client.blind, {
    value: null, status: 'unknown', source: null, confirmedAt: null, version: 1,
  });
});

test('owner facts reject collections, invalid semantics, unknown fields, and inactive spouse edits', () => {
  const value = plan();
  const invalidEdits = [
    { group: 'profile', key: 'blind', value: 'false' },
    { group: 'profile', key: 'birthDate', value: '2026-99-99' },
    { group: 'traditionalIra', key: 'priorYearCarryforwardBasis', value: -1 },
    { group: 'rothIra', key: 'firstContributionYear', value: 0 },
    { group: 'rothIra', key: 'firstContributionYear', value: 1899 },
    { group: 'rothIra', key: 'firstContributionYear', value: MAX_TAX_FACT_YEAR + 1 },
    { group: 'rothIra', key: 'conversionCohorts', value: [] },
    { group: 'traditionalIra', key: 'madeUp', value: 0 },
  ];
  for(const invalid of invalidEdits){
    assertUnchangedAfterThrow(value, {
      kind: 'confirm-owner-fact', owner: 'client', ...invalid,
    }, { now: CONFIRMED_AT }, /Invalid value|Unsupported owner tax fact/i);
  }

  assertUnchangedAfterThrow(value, {
    kind: 'confirm-owner-fact',
    owner: 'spouse', group: 'profile', key: 'blind', value: false,
  }, { now: CONFIRMED_AT }, /without a co-client/i);
});

test('account scalar facts are allowlisted by account character and never expose cohort arrays', () => {
  const value = plan();
  value.portfolio.extraAccounts = [
    account('401k', 'work'),
    account('roth_401k', 'roth-work'),
  ];

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-account-fact',
    accountId: 'work',
    group: 'employerPlanFacts',
    key: 'afterTaxContributionBasis',
    value: 0,
  }, { now: CONFIRMED_AT }), { changed: true, affectsCalculation: false });
  assert.deepEqual(
    value.portfolio.extraAccounts[0].employerPlanFacts.afterTaxContributionBasis,
    confirmedFact(0)
  );

  applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-account-fact',
    accountId: 'work',
    group: 'employerPlanFacts',
    key: 'planSubtypeConfirmed',
    value: false,
  }, { now: CONFIRMED_AT });
  assert.deepEqual(
    value.portfolio.extraAccounts[0].employerPlanFacts.planSubtypeConfirmed,
    confirmedFact(false)
  );

  applyHouseholdTaxFactEdit(value, {
    kind: 'confirm-account-fact',
    accountId: 'roth-work',
    group: 'designatedRothFacts',
    key: 'firstContributionYear',
    value: 2010,
  }, { now: CONFIRMED_AT });
  assert.deepEqual(
    value.portfolio.extraAccounts[1].designatedRothFacts.firstContributionYear,
    confirmedFact(2010)
  );

  assert.deepEqual(applyHouseholdTaxFactEdit(value, {
    kind: 'clear-account-fact',
    accountId: 'work',
    group: 'employerPlanFacts',
    key: 'afterTaxContributionBasis',
  }), { changed: true, affectsCalculation: false });

  assertUnchangedAfterThrow(value, {
    kind: 'confirm-account-fact',
    accountId: 'work', group: 'designatedRothFacts', key: 'contributionBasis', value: 0,
  }, { now: CONFIRMED_AT }, /does not apply/i);
  assertUnchangedAfterThrow(value, {
    kind: 'confirm-account-fact',
    accountId: 'roth-work', group: 'designatedRothFacts', key: 'inPlanRolloverCohorts', value: [],
  }, { now: CONFIRMED_AT }, /Unsupported account tax fact/i);
});

test('unknown edit kinds and malformed commands fail without mutation', () => {
  const value = plan();
  value.portfolio.extraAccounts = [account('brokerage_taxable', 'broker')];
  assertUnchangedAfterThrow(value, { kind: 'invent-fact', accountId: 'broker' }, {}, /Unsupported Household/i);
  assertUnchangedAfterThrow(value, null, {}, /edit must be an object/i);
});
