import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNT_SCHEMA_VERSION } from './accountTypes.js';
import { createAccount } from './createAccount.js';
import { createBlankTaxProfiles, createFact } from './factEnvelope.js';
import { findLikelyGpcDuplicateWageRows } from './incomeTaxModel.js';
import {
  ACTIVE_KEY,
  HHDB_KEY,
  commitPreparedHouseholdStore,
  createMemoryStorage,
  prepareHouseholdStore,
  readHouseholdStore,
} from './persistence.js';

const pristinePlan = { meta: {}, household: { primary: { currentAge: 60, retirementAge: 65, planEndAge: 90 } }, portfolio: { accounts: { taxable: { balance: 0, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } }, extraAccounts: [] }, income: {}, expenses: {}, savings: {}, simulation: {} };

function createBlankHousehold(id){
  const p = JSON.parse(JSON.stringify(pristinePlan));
  p.meta = { householdId: id, name: 'New Household', accountSchemaVersion: ACCOUNT_SCHEMA_VERSION };
  p.taxProfiles = createBlankTaxProfiles();
  return p;
}

function createDemoHousehold(){
  const p = createBlankHousehold('demo');
  p.meta.name = 'Demo Household';
  p.meta.isDemo = true;
  return p;
}

const deps = {
  createDemoHousehold,
  createBlankHousehold,
  pristinePlan,
  currentYear: () => 2026,
};

function createCountingStorage(initial = {}){
  const storage = createMemoryStorage(initial);
  const setItem = storage.setItem.bind(storage);
  let writes = 0;
  storage.setItem = (key, value) => {
    writes += 1;
    setItem(key, value);
  };
  storage.writeCount = () => writes;
  return storage;
}

test('readHouseholdStore distinguishes missing, corrupt, and valid data', () => {
  assert.equal(readHouseholdStore(createMemoryStorage()).kind, 'missing');
  assert.equal(readHouseholdStore(createMemoryStorage({ [HHDB_KEY]: '{' })).kind, 'corrupt');
  assert.equal(readHouseholdStore(createMemoryStorage({ [HHDB_KEY]: '[]' })).kind, 'corrupt');
  const valid = createDemoHousehold();
  const read = readHouseholdStore(createMemoryStorage({ [HHDB_KEY]: JSON.stringify({ demo: valid }) }));
  assert.equal(read.kind, 'valid');
});

test('invalid root shapes and an empty database block with zero writes', () => {
  for(const raw of ['null', '[]', '"text"', '{}']){
    const storage = createCountingStorage({ [HHDB_KEY]: raw, [ACTIVE_KEY]: 'demo' });
    const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
    assert.equal(prepared.ok, false);
    assert.equal(storage.writeCount(), 0);
    assert.equal(storage.getItem(HHDB_KEY), raw);
    assert.equal(storage.getItem(ACTIVE_KEY), 'demo');
  }
});

test('storage read exception is unreadable', () => {
  let writes = 0;
  const storage = {
    getItem(){ throw new Error('blocked'); },
    setItem(){ writes += 1; },
  };
  const read = readHouseholdStore(storage);
  assert.equal(read.kind, 'unreadable');
  assert.equal(prepareHouseholdStore(read, deps).ok, false);
  assert.equal(writes, 0);
});

test('missing key creates exactly one validated current-schema demo', () => {
  const storage = createMemoryStorage();
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, true);
  assert.deepEqual(Object.keys(prepared.db), ['demo']);
  assert.equal(prepared.db.demo.meta.accountSchemaVersion, ACCOUNT_SCHEMA_VERSION);
  assert.ok(prepared.db.demo.taxProfiles.client.rothIra);
});

test('unchanged current-schema database does not rewrite on commit', () => {
  const demo = createDemoHousehold();
  const storage = createMemoryStorage({
    [HHDB_KEY]: JSON.stringify({ demo }),
    [ACTIVE_KEY]: 'demo',
  });
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.changed, false);
  const commit = commitPreparedHouseholdStore(storage, prepared);
  assert.equal(commit.wrote, false);
});

test('current GPC-shaped household survives restored persistence without silent fact loss', () => {
  const id = 'gpc-current';
  const confirmedAt = '2026-07-21T12:00:00.000Z';
  const household = createBlankHousehold(id);
  household.meta = {
    ...household.meta,
    name: 'Current guided household',
    primaryName: 'Client',
    spouseName: 'Co-client',
    filingStatus: 'marriedFilingJointly',
    state: 'VA',
  };
  household.household.primary = {
    currentAge: 60,
    retirementAge: 65,
    planEndAge: 95,
    birthYear: 1966,
  };
  household.household.spouse = {
    currentAge: 58,
    retirementAge: 64,
    planEndAge: 94,
    birthYear: 1968,
  };
  household.household.children = [{ name: 'Child', birthYear: 2010 }];

  const taxable = createAccount('brokerage_taxable', { owner: 'client', balance: 850000 });
  taxable.id = 'acct_gpc_taxable';
  taxable.basis = {
    amount: 510000,
    method: 'reported-cost-basis',
    status: 'confirmed',
    source: 'household-entry',
    confirmedAt,
    version: 1,
  };
  const trust = createAccount('trust_brokerage', { owner: 'client', balance: 250000 });
  trust.id = 'acct_gpc_trust';
  const employer = createAccount('401k', { owner: 'client', balance: 430000 });
  employer.id = 'acct_gpc_401k';
  employer.employerPlanFacts.afterTaxContributionBasis = createFact(
    12000, 'confirmed', 'household-entry', confirmedAt
  );
  employer.employerPlanFacts.planSubtypeConfirmed = createFact(
    true, 'confirmed', 'household-entry', confirmedAt
  );
  const designatedRoth = createAccount('roth_401k', { owner: 'spouse', balance: 190000 });
  designatedRoth.id = 'acct_gpc_roth_401k';
  designatedRoth.designatedRothFacts.firstContributionYear = createFact(
    2012, 'confirmed', 'household-entry', confirmedAt
  );
  designatedRoth.designatedRothFacts.contributionBasis = createFact(
    78000, 'confirmed', 'household-entry', confirmedAt
  );
  const joint = createAccount('joint_brokerage', { owner: 'joint', balance: 110000 });
  joint.id = 'acct_gpc_joint';
  household.portfolio.extraAccounts = [taxable, trust, employer, designatedRoth, joint];
  household.taxProfiles.client.birthDate = createFact(
    '1966-04-02', 'confirmed', 'household-entry', confirmedAt
  );

  household.expenses = {
    living: 72000,
    healthcare: 18000,
    healthcareRealGrowth: 0.03,
    extra: [
      { label: 'Housing', amount: 24000, startAge: 60, endAge: 95 },
      { label: 'Debt', amount: 12000, startAge: 60, endAge: 68 },
    ],
  };
  household.savings = {
    annual: 24000,
    split: { traditional: 0.5, roth: 0.25, taxable: 0.25 },
  };
  const duplicatedWage = {
    typeId: 'wages', label: 'Wages or salary', owner: 'client', amount: 180000,
    startAge: 60, endAge: 64, realGrowth: 0.02, taxablePct: 1,
  };
  household.income = {
    workingIncome: 0,
    socialSecurity: {
      primary: { pia: 36000, claimAge: 70 },
      spouse: { pia: 28000, claimAge: 67 },
    },
    pension: { benefitByAge: { 65: 18000 }, base: 0, startAge: 65, colaPct: 0.02 },
    other: [
      duplicatedWage,
      { ...duplicatedWage },
      { typeId: 'pension', label: 'Pension A', owner: 'client', amount: 22000, startAge: 65, endAge: 95, realGrowth: 0.01, taxablePct: 1 },
      { typeId: 'pension', label: 'Pension B', owner: 'client', amount: 14000, startAge: 67, endAge: 95, realGrowth: 0, taxablePct: 1 },
      { typeId: 'dividends', label: 'Qualified dividends', owner: 'joint', amount: 9000, startAge: 60, endAge: 95, realGrowth: 0, taxablePct: 1, qualifiedPct: 0.8 },
    ],
  };
  household.incomeTax = {
    deductionMode: 'itemized',
    adjustments: [{ typeId: 'hsa', label: 'HSA contribution', owner: 'client', amount: 8300, whileWorkingOnly: false }],
    deductions: [
      { typeId: 'medical', label: 'Medical expenses', amount: 16000 },
      { typeId: 'salt', label: 'State & local taxes', amount: 42000 },
    ],
    credits: [{ typeId: 'premium_tax_credit', label: 'Premium Tax Credit', amount: 1200 }],
  };
  household.properties = [{
    name: 'Primary home',
    value: 900000,
    purchasePrice: 540000,
  }];
  household.liabilities = [{
    label: 'Auto loan', amount: 6000, startAge: 60, endAge: 63, colaPct: 0,
  }];
  household.goals = [{ name: 'Travel', amount: 25000, startAge: 66, endAge: 75 }];

  const original = JSON.parse(JSON.stringify(household));
  const originalDb = JSON.stringify({ [id]: household });
  const storage = createMemoryStorage({
    [HHDB_KEY]: originalDb,
    [ACTIVE_KEY]: id,
  });

  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);

  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.mode, 'normal');
  assert.equal(prepared.activeHouseholdId, id);
  assert.equal(prepared.pointerChanged, false);
  assert.equal(prepared.changed, false);
  assert.deepEqual(prepared.db[id], original);
  assert.equal(prepared.db[id].household.spouse.planEndAge, 94);
  assert.equal(prepared.db[id].savings.annual, 24000);
  assert.equal(prepared.db[id].portfolio.extraAccounts[0].basis.amount, 510000);
  assert.equal(prepared.db[id].portfolio.extraAccounts[2].employerPlanFacts.afterTaxContributionBasis.value, 12000);
  assert.equal(prepared.db[id].portfolio.extraAccounts[3].designatedRothFacts.firstContributionYear.value, 2012);
  assert.equal(prepared.db[id].portfolio.extraAccounts[4].owner, 'joint');
  assert.equal(prepared.db[id].taxProfiles.client.birthDate.value, '1966-04-02');
  assert.equal(prepared.db[id].income.socialSecurity.primary.claimAge, 70);
  assert.equal(prepared.db[id].income.other.filter(row => row.typeId === 'pension').length, 2);
  assert.deepEqual(findLikelyGpcDuplicateWageRows(prepared.db[id]).map(row => row.duplicateIndex), [1]);
  assert.deepEqual(prepared.db[id].incomeTax.deductions.map(row => row.typeId), ['medical', 'salt']);
  assert.equal(prepared.db[id].properties[0].mortgage, undefined);
  assert.equal(prepared.db[id].liabilities[0].amount, 6000);

  const commit = commitPreparedHouseholdStore(storage, prepared);
  assert.deepEqual(commit, { ok: true, wrote: false });
  assert.equal(storage.getItem(HHDB_KEY), originalDb);
  assert.equal(storage.getItem(ACTIVE_KEY), id);
});

test('dangling active pointer resolves only after validation', () => {
  const demo = createDemoHousehold();
  const storage = createMemoryStorage({
    [HHDB_KEY]: JSON.stringify({ demo }),
    [ACTIVE_KEY]: 'missing-id',
  });
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.activeHouseholdId, 'demo');
  assert.equal(prepared.pointerChanged, true);
});

test('a valid active pointer is preserved after all households migrate', () => {
  const one = createBlankHousehold('one');
  delete one.meta.accountSchemaVersion;
  const two = createBlankHousehold('two');
  delete two.meta.accountSchemaVersion;
  const storage = createMemoryStorage({
    [HHDB_KEY]: JSON.stringify({ one, two }),
    [ACTIVE_KEY]: 'two',
  });
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.activeHouseholdId, 'two');
  assert.equal(prepared.pointerChanged, false);
  assert.equal(prepared.db.one.meta.accountSchemaVersion, 1);
  assert.equal(prepared.db.two.meta.accountSchemaVersion, 1);
});

test('a mixed valid and malformed database blocks as a whole with zero writes', () => {
  const valid = createBlankHousehold('valid');
  const raw = JSON.stringify({ valid, malformed: null });
  const storage = createCountingStorage({ [HHDB_KEY]: raw, [ACTIVE_KEY]: 'valid' });
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, false);
  assert.equal(storage.writeCount(), 0);
  assert.equal(storage.getItem(HHDB_KEY), raw);
  assert.equal(storage.getItem(ACTIVE_KEY), 'valid');
});

test('current v1 required account and tax-profile fields are validated before defaults', () => {
  const cases = [
    plan => { delete plan.portfolio.extraAccounts; },
    plan => { delete plan.portfolio.accounts.roth; },
    plan => { delete plan.taxProfiles.client.rothIra; },
  ];
  for(const mutate of cases){
    const plan = createBlankHousehold('strict');
    mutate(plan);
    const raw = JSON.stringify({ strict: plan });
    const storage = createCountingStorage({ [HHDB_KEY]: raw, [ACTIVE_KEY]: 'strict' });
    const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
    assert.equal(prepared.ok, false);
    assert.equal(storage.writeCount(), 0);
    assert.equal(storage.getItem(HHDB_KEY), raw);
  }
});

test('validated records still receive only non-account defaults', () => {
  const plan = createBlankHousehold('defaults');
  delete plan.meta.name;
  const storage = createMemoryStorage({
    [HHDB_KEY]: JSON.stringify({ defaults: plan }),
    [ACTIVE_KEY]: 'defaults',
  });
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.changed, true);
  assert.equal(prepared.db.defaults.meta.name, 'New Household');
});

test('database write failure preserves original bytes and pointer while exposing only the validated clone', () => {
  const legacy = {
    meta: { householdId: 'legacy' },
    portfolio: {
      accounts: { taxable: { balance: 0, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } },
      extraAccounts: [{ type: 'HSA', bucket: 'roth', owner: 'client', balance: 5000 }],
    },
  };
  const originalDb = JSON.stringify({ legacy });
  const storage = createMemoryStorage({ [HHDB_KEY]: originalDb, [ACTIVE_KEY]: 'legacy' });
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.db.legacy.meta.accountSchemaVersion, 1);
  assert.ok(prepared.db.legacy.portfolio.extraAccounts[0].id);
  storage.setItem = () => { throw new Error('quota'); };
  const commit = commitPreparedHouseholdStore(storage, prepared);
  assert.equal(commit.ok, false);
  assert.equal(commit.readOnly, true);
  assert.equal(commit.partialWrite, false);
  assert.equal(commit.databasePersisted, false);
  assert.equal(storage.getItem(HHDB_KEY), originalDb);
  assert.equal(storage.getItem(ACTIVE_KEY), 'legacy');
  assert.equal(JSON.parse(originalDb).legacy.meta.accountSchemaVersion, undefined);
});

test('first-use pointer failure leaves the completed database and clearly reports partial persistence', () => {
  const data = {};
  const storage = {
    getItem(key){ return data[key] ?? null; },
    setItem(key, value){
      if(key === ACTIVE_KEY) throw new Error('pointer failed');
      data[key] = value;
    },
  };
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  const commit = commitPreparedHouseholdStore(storage, prepared);
  assert.equal(commit.ok, false);
  assert.equal(commit.readOnly, true);
  assert.equal(commit.partialWrite, true);
  assert.equal(commit.databasePersisted, true);
  assert.equal(commit.pointerPersisted, false);
  assert.equal(JSON.parse(data[HHDB_KEY]).demo.meta.accountSchemaVersion, 1);
  assert.equal(data[ACTIVE_KEY], undefined);
});

test('commit performs no new storage reads after preparation', () => {
  const written = {};
  const storage = {
    getItem(){ throw new Error('commit must not read'); },
    setItem(key, value){ written[key] = value; },
  };
  const demo = createDemoHousehold();
  const commit = commitPreparedHouseholdStore(storage, {
    ok: true,
    mode: 'normal',
    changed: true,
    pointerChanged: true,
    db: { demo },
    activeHouseholdId: 'demo',
  });
  assert.equal(commit.ok, true);
  assert.ok(written[HHDB_KEY]);
  assert.equal(written[ACTIVE_KEY], 'demo');
});

test('pointer write failure reports partial persistence without destructive rollback', () => {
  const legacy = {
    meta: { householdId: 'hh1' },
    portfolio: {
      accounts: { taxable: { balance: 0, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } },
      extraAccounts: [{ type: 'HSA', bucket: 'roth', owner: 'client', balance: 5000 }],
    },
  };
  const originalDb = JSON.stringify({ hh1: legacy });
  const storage = {
    data: { [HHDB_KEY]: originalDb, [ACTIVE_KEY]: 'missing-id' },
    getItem(key){ return this.data[key] ?? null; },
    setItem(key, value){
      if(key === ACTIVE_KEY) throw new Error('pointer failed');
      this.data[key] = value;
    },
  };
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.changed, true);
  assert.equal(prepared.pointerChanged, true);
  const commit = commitPreparedHouseholdStore(storage, prepared);
  assert.equal(commit.ok, false);
  assert.equal(commit.readOnly, true);
  assert.equal(commit.wrote, false);
  assert.equal(commit.partialWrite, true);
  assert.equal(commit.databasePersisted, true);
  assert.equal(commit.pointerPersisted, false);
  assert.notEqual(storage.data[HHDB_KEY], originalDb);
  assert.equal(JSON.parse(storage.data[HHDB_KEY]).hh1.meta.accountSchemaVersion, 1);
  assert.equal(storage.data[ACTIVE_KEY], 'missing-id');
});
