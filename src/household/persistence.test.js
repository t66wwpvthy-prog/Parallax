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

test('readHouseholdStore distinguishes missing, corrupt, and valid data', () => {
  assert.equal(readHouseholdStore(createMemoryStorage()).kind, 'missing');
  assert.equal(readHouseholdStore(createMemoryStorage({ [HHDB_KEY]: '{' })).kind, 'corrupt');
  assert.equal(readHouseholdStore(createMemoryStorage({ [HHDB_KEY]: '[]' })).kind, 'corrupt');
  const valid = createDemoHousehold();
  const read = readHouseholdStore(createMemoryStorage({ [HHDB_KEY]: JSON.stringify({ demo: valid }) }));
  assert.equal(read.kind, 'valid');
});

test('storage read exception is unreadable', () => {
  const storage = {
    getItem(){ throw new Error('blocked'); },
    setItem(){},
  };
  assert.equal(readHouseholdStore(storage).kind, 'unreadable');
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

test('pointer write failure rolls back successful database write', () => {
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
  assert.equal(storage.data[HHDB_KEY], originalDb);
});
