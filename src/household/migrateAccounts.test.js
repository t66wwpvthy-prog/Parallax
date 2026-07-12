import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_SCHEMA_VERSION,
  UNSUPPORTED_TYPE_ID,
  getAccountTypeRegistry,
  getWizardAccountTypes,
  resolveTypeFromLabel,
} from './accountTypes.js';
import { createAccount, parseBalanceInput } from './createAccount.js';
import { createBlankTaxProfiles, createFact, taxProfileHasConfirmedFacts } from './factEnvelope.js';
import {
  ACCOUNT_SCHEMA_VERSION_UNSUPPORTED,
  BLOCKED_MESSAGE,
  deriveHouseholdIssues,
  deterministicLegacyAccountId,
  mergeNonAccountDefaults,
  migrateHouseholdRecord,
  migrateHouseholdsDb,
  validateCurrentSchemaHousehold,
} from './migrateAccounts.js';
import {
  createMemoryStorage,
  prepareHouseholdStore,
  readHouseholdStore,
  commitPreparedHouseholdStore,
  HHDB_KEY,
  ACTIVE_KEY,
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

test('resolveTypeFromLabel matches aliases and never defaults unknown to taxable', () => {
  assert.equal(resolveTypeFromLabel('401(k)').typeId, '401k');
  assert.equal(resolveTypeFromLabel(' brokerage ').typeId, 'brokerage_taxable');
  const unknown = resolveTypeFromLabel('Mystery account');
  assert.equal(unknown.known, false);
  assert.equal(unknown.engineBucket, null);
});

test('registry exports are immutable', () => {
  const registry = getAccountTypeRegistry();
  assert.throws(() => { registry[0] = {}; });
  assert.throws(() => { registry[0].label = 'changed'; });
});

test('getWizardAccountTypes preserves approved five choices and order', () => {
  assert.deepEqual(getWizardAccountTypes().map(w => w.label), [
    'Traditional IRA', 'Roth IRA', 'Brokerage (taxable)', '401(k)', 'HSA',
  ]);
});

test('createFact preserves explicit status and confirmed empty arrays count', () => {
  const fact = createFact([], 'confirmed', 'household-entry', '2026-01-01T00:00:00.000Z');
  assert.equal(fact.status, 'confirmed');
  const profile = createBlankTaxProfiles().spouse;
  profile.rothIra.conversionCohorts = fact;
  assert.equal(taxProfileHasConfirmedFacts(profile), true);
});

test('createAccount rejects invalid balances and accepts omitted balance', () => {
  assert.throws(() => createAccount('brokerage_taxable', { balance: -1 }));
  assert.throws(() => createAccount('brokerage_taxable', { balance: Infinity }));
  assert.equal(createAccount('brokerage_taxable').balance, 0);
});

test('invalid legacy balance fails migration instead of becoming zero', () => {
  const legacy = {
    meta: { householdId: 'hh1' },
    portfolio: {
      accounts: { taxable: { balance: 0, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } },
      extraAccounts: [{ type: 'Brokerage (taxable)', bucket: 'taxable', owner: 'client', balance: -5 }],
    },
  };
  assert.throws(() => migrateHouseholdRecord(legacy, 'hh1'), /invalid balance/i);
});

test('future schema version blocks without mutation', () => {
  const future = createBlankHousehold('hh1');
  future.meta.accountSchemaVersion = 2;
  const result = migrateHouseholdsDb({ hh1: future });
  assert.equal(result.ok, false);
  assert.equal(result.code, ACCOUNT_SCHEMA_VERSION_UNSUPPORTED);
});

test('mixed valid and malformed database is rejected as a whole', () => {
  const good = {
    meta: { householdId: 'good' },
    portfolio: {
      accounts: { taxable: { balance: 0, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } },
      extraAccounts: [{ type: 'HSA', bucket: 'roth', owner: 'client', balance: 1000 }],
    },
  };
  const result = migrateHouseholdsDb({ good, bad: null });
  assert.equal(result.ok, false);
});

test('duplicate account IDs fail validation', () => {
  const acct = createAccount('hsa', { owner: 'client', balance: 1000 });
  const plan = createBlankHousehold('hh1');
  plan.portfolio.extraAccounts = [{ ...acct }, { ...acct, balance: 2000 }];
  assert.throws(() => validateCurrentSchemaHousehold(plan, 'hh1'), /duplicate account id/i);
});

test('deriveHouseholdIssues reports overlap and bucket conflict without changing balances', () => {
  const plan = createBlankHousehold('hh1');
  plan.portfolio.accounts.taxable.balance = 1000;
  const acct = createAccount('roth_ira', { owner: 'client', balance: 500 });
  acct.bucket = 'traditional';
  plan.portfolio.extraAccounts = [acct];
  const issues = deriveHouseholdIssues(plan);
  assert.ok(issues.includes('LEGACY_TYPED_OVERLAP'));
  assert.ok(issues.some(x => x.startsWith('ACCOUNT_BUCKET_CONFLICT:')));
  assert.equal(plan.portfolio.accounts.taxable.balance, 1000);
});

test('corrupt JSON performs zero writes', () => {
  const storage = createMemoryStorage({ [HHDB_KEY]: '{not json', [ACTIVE_KEY]: 'demo' });
  const read = readHouseholdStore(storage);
  assert.equal(read.kind, 'corrupt');
  const prepared = prepareHouseholdStore(read, deps);
  assert.equal(prepared.ok, false);
  assert.equal(storage.snapshot()[HHDB_KEY], '{not json');
});

test('missing key creates one current-schema demo and can persist', () => {
  const storage = createMemoryStorage();
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.changed, true);
  const commit = commitPreparedHouseholdStore(storage, prepared);
  assert.equal(commit.ok, true);
  assert.ok(storage.getItem(HHDB_KEY));
});

test('empty stored database blocks rather than reseeding', () => {
  const storage = createMemoryStorage({ [HHDB_KEY]: '{}', [ACTIVE_KEY]: 'demo' });
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.message, BLOCKED_MESSAGE);
});

test('write failure preserves original database and enters read-only clone', () => {
  const legacy = {
    meta: { householdId: 'hh1' },
    portfolio: {
      accounts: { taxable: { balance: 0, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } },
      extraAccounts: [{ type: 'HSA', bucket: 'roth', owner: 'client', balance: 5000 }],
    },
  };
  const storage = createMemoryStorage({ [HHDB_KEY]: JSON.stringify({ hh1: legacy }), [ACTIVE_KEY]: 'hh1' });
  storage.setItem = () => { throw new Error('quota'); };
  const prepared = prepareHouseholdStore(readHouseholdStore(storage), deps);
  assert.equal(prepared.ok, true);
  const commit = commitPreparedHouseholdStore(storage, prepared);
  assert.equal(commit.readOnly, true);
});

test('migration is idempotent after save/reload', () => {
  const legacy = {
    meta: { householdId: 'hh1' },
    portfolio: {
      accounts: { taxable: { balance: 0, basisPct: 1 }, traditional: { balance: 0 }, roth: { balance: 0 } },
      extraAccounts: [{ type: 'Brokerage (taxable)', bucket: 'taxable', owner: 'client', balance: 100000 }],
    },
  };
  const first = migrateHouseholdRecord(legacy, 'hh1').plan;
  const second = migrateHouseholdRecord(JSON.parse(JSON.stringify(first)), 'hh1');
  assert.equal(second.changed, false);
});

test('deterministicLegacyAccountId is stable', () => {
  const legacy = { type: '401(k)', bucket: 'traditional', owner: 'client', balance: 500000 };
  assert.equal(
    deterministicLegacyAccountId('hh1', 'extraAccounts', 0, legacy),
    deterministicLegacyAccountId('hh1', 'extraAccounts', 0, legacy),
  );
});

test('mergeNonAccountDefaults does not pre-stamp accountSchemaVersion', () => {
  const merged = mergeNonAccountDefaults({ meta: { name: 'Saved' } }, { meta: { accountSchemaVersion: 1 } });
  assert.equal(merged.meta.accountSchemaVersion, undefined);
});
