import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNT_SCHEMA_VERSION } from './accountTypes.js';
import { createBlankTaxProfiles } from './factEnvelope.js';
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
