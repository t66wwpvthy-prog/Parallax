import {
  ACCOUNT_SCHEMA_VERSION,
  UNSUPPORTED_TYPE_ID,
  getAccountTypeById,
  isValidEngineBucket,
  isValidOwner,
  isValidValuationDate,
  parseSchemaVersion,
  resolveTypeFromLabel,
} from './accountTypes.js';
import { createBlankTaxProfiles, validateFactEnvelope } from './factEnvelope.js';

export const ACCOUNT_MIGRATION_BLOCKED = 'ACCOUNT_MIGRATION_BLOCKED';
export const ACCOUNT_MIGRATION_READ_ONLY = 'ACCOUNT_MIGRATION_READ_ONLY';
export const ACCOUNT_SCHEMA_VERSION_UNSUPPORTED = 'ACCOUNT_SCHEMA_VERSION_UNSUPPORTED';

export const BLOCKED_MESSAGE = 'Household data could not be safely upgraded. No saved data was changed.';
export const READ_ONLY_MESSAGE = 'Household storage could not be upgraded. Viewing a read-only copy; reload after storage is available.';

const VALID_BASIS_METHODS = new Set(['reported-cost-basis', 'principal', 'legacy-proportional', 'unknown']);
const VALID_BASIS_STATUS = new Set(['confirmed', 'assumed', 'unknown']);
const VALID_BASIS_SOURCES = new Set(['household-entry', 'import', 'planner-assumption']);
const VALID_INCLUSION = new Set(['household-return', 'separate-return', 'unknown']);

function stableHash(input){
  const s = JSON.stringify(input);
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function deterministicLegacyAccountId(householdId, ledger, index, legacy){
  return `acct_legacy_${stableHash({
    householdId,
    ledger,
    index,
    type: legacy.type ?? null,
    bucket: legacy.bucket ?? null,
    owner: legacy.owner ?? null,
    balance: legacy.balance ?? null,
  })}`;
}

function assertFiniteNonNegativeBalance(value, path){
  if(typeof value === 'string'){
    throw new Error(`${path} has invalid balance`);
  }
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0){
    throw new Error(`${path} has invalid balance`);
  }
}

function parseLegacyBalance(value, path){
  if(value == null || value === ''){
    throw new Error(`${path} has invalid balance`);
  }
  if(typeof value === 'string'){
    throw new Error(`${path} has invalid balance`);
  }
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0){
    throw new Error(`${path} has invalid balance`);
  }
  return Math.round(n);
}

function parseLegacyOwner(owner, path){
  if(owner == null || owner === '') return 'joint';
  const o = String(owner).trim();
  if(!isValidOwner(o)){
    throw new Error(`${path} has invalid owner`);
  }
  return o;
}

function validateBasisEnvelope(basis, path){
  if(!basis || typeof basis !== 'object' || Array.isArray(basis)){
    throw new Error(`${path}.basis must be an object`);
  }
  if(!VALID_BASIS_METHODS.has(basis.method)){
    throw new Error(`${path}.basis.method is invalid`);
  }
  if(!VALID_BASIS_STATUS.has(basis.status)){
    throw new Error(`${path}.basis.status is invalid`);
  }
  if(basis.amount != null){
    const n = Number(basis.amount);
    if(!Number.isFinite(n) || n < 0){
      throw new Error(`${path}.basis.amount is invalid`);
    }
  }
  if(basis.version !== 1){
    throw new Error(`${path}.basis.version is invalid`);
  }
  if(basis.status === 'confirmed'){
    if(basis.source == null || !VALID_BASIS_SOURCES.has(basis.source)){
      throw new Error(`${path}.basis confirmed fact requires source`);
    }
    if(basis.confirmedAt == null || typeof basis.confirmedAt !== 'string'){
      throw new Error(`${path}.basis confirmed fact requires confirmedAt`);
    }
  }
}

function validateTaxReporting(record, path){
  if(!record || typeof record !== 'object'){
    throw new Error(`${path}.taxReporting must be an object`);
  }
  if(!VALID_INCLUSION.has(record.inclusion)){
    throw new Error(`${path}.taxReporting.inclusion is invalid`);
  }
  if(record.reportingTaxpayer != null && record.reportingTaxpayer !== 'client' && record.reportingTaxpayer !== 'spouse' && record.reportingTaxpayer !== 'return-level'){
    throw new Error(`${path}.taxReporting.reportingTaxpayer is invalid`);
  }
  if(record.householdReturnShare != null){
    const share = Number(record.householdReturnShare);
    if(!Number.isFinite(share) || share < 0 || share > 1){
      throw new Error(`${path}.taxReporting.householdReturnShare is invalid`);
    }
  }
}

function validateEmployerFacts(facts, path){
  if(facts == null) return;
  if(typeof facts !== 'object'){
    throw new Error(`${path}.employerPlanFacts is invalid`);
  }
  validateFactEnvelope(facts.afterTaxContributionBasis, `${path}.employerPlanFacts.afterTaxContributionBasis`);
  validateFactEnvelope(facts.planSubtypeConfirmed, `${path}.employerPlanFacts.planSubtypeConfirmed`);
}

function validateDesignatedFacts(facts, path){
  if(facts == null) return;
  if(typeof facts !== 'object'){
    throw new Error(`${path}.designatedRothFacts is invalid`);
  }
  validateFactEnvelope(facts.firstContributionYear, `${path}.designatedRothFacts.firstContributionYear`);
  validateFactEnvelope(facts.contributionBasis, `${path}.designatedRothFacts.contributionBasis`);
  validateFactEnvelope(facts.inPlanRolloverCohorts, `${path}.designatedRothFacts.inPlanRolloverCohorts`);
}

function validateTaxProfileOwner(profile, path){
  if(!profile || typeof profile !== 'object'){
    throw new Error(`${path} tax profile is required`);
  }
  if(!profile.traditionalIra || typeof profile.traditionalIra !== 'object' || Array.isArray(profile.traditionalIra)){
    throw new Error(`${path}.traditionalIra is required`);
  }
  if(!profile.rothIra || typeof profile.rothIra !== 'object' || Array.isArray(profile.rothIra)){
    throw new Error(`${path}.rothIra is required`);
  }
  validateFactEnvelope(profile.birthDate, `${path}.birthDate`);
  validateFactEnvelope(profile.blind, `${path}.blind`);
  validateFactEnvelope(profile.disabled, `${path}.disabled`);
  for(const key of Object.keys(profile.traditionalIra || {})){
    validateFactEnvelope(profile.traditionalIra[key], `${path}.traditionalIra.${key}`);
  }
  for(const key of Object.keys(profile.rothIra || {})){
    validateFactEnvelope(profile.rothIra[key], `${path}.rothIra.${key}`);
  }
}

function validateBaseSleeves(accounts, path){
  if(!accounts || typeof accounts !== 'object'){
    throw new Error(`${path}.portfolio.accounts is required`);
  }
  for(const sleeve of ['taxable', 'traditional', 'roth']){
    const acct = accounts[sleeve];
    if(!acct || typeof acct !== 'object'){
      throw new Error(`${path}.portfolio.accounts.${sleeve} is required`);
    }
    assertFiniteNonNegativeBalance(acct.balance, `${path}.portfolio.accounts.${sleeve}`);
  }
  const pct = accounts.taxable.basisPct;
  if(pct != null){
    const n = Number(pct);
    if(!Number.isFinite(n) || n < 0){
      throw new Error(`${path}.portfolio.accounts.taxable.basisPct is invalid`);
    }
  }
}

function validateCurrentAccount(acct, index){
  const path = `account[${index}]`;
  if(!acct || typeof acct !== 'object' || Array.isArray(acct)){
    throw new Error(`${path} must be an object`);
  }
  if(typeof acct.id !== 'string' || !acct.id.trim()){
    throw new Error(`${path}.id is required`);
  }
  if(typeof acct.typeId !== 'string' || !acct.typeId.trim()){
    throw new Error(`${path}.typeId is required`);
  }
  if(acct.typeId !== UNSUPPORTED_TYPE_ID && !getAccountTypeById(acct.typeId)){
    throw new Error(`${path}.typeId is unknown`);
  }
  if(!isValidOwner(acct.owner)){
    throw new Error(`${path}.owner is invalid`);
  }
  if(!isValidEngineBucket(acct.bucket)){
    throw new Error(`${path}.bucket is invalid`);
  }
  assertFiniteNonNegativeBalance(acct.balance, path);
  if(!isValidValuationDate(acct.valuationDate ?? null)){
    throw new Error(`${path}.valuationDate is invalid`);
  }
  validateBasisEnvelope(acct.basis, path);
  validateTaxReporting(acct.taxReporting, path);
  validateEmployerFacts(acct.employerPlanFacts, path);
  validateDesignatedFacts(acct.designatedRothFacts, path);
}

export function validateCurrentSchemaHousehold(plan, householdId = 'household'){
  if(!plan || typeof plan !== 'object' || Array.isArray(plan)){
    throw new Error(`${householdId}: household must be an object`);
  }
  if(!plan.meta || typeof plan.meta !== 'object'){
    throw new Error(`${householdId}: meta is required`);
  }
  const version = parseSchemaVersion(plan.meta.accountSchemaVersion);
  if(version !== ACCOUNT_SCHEMA_VERSION){
    throw new Error(`${householdId}: unsupported accountSchemaVersion`);
  }
  if(!plan.portfolio || typeof plan.portfolio !== 'object'){
    throw new Error(`${householdId}: portfolio is required`);
  }
  validateBaseSleeves(plan.portfolio.accounts, householdId);
  if(!Array.isArray(plan.portfolio.extraAccounts)){
    throw new Error(`${householdId}: portfolio.extraAccounts must be an array`);
  }
  const seen = new Set();
  plan.portfolio.extraAccounts.forEach((acct, index) => {
    validateCurrentAccount(acct, index);
    if(seen.has(acct.id)){
      throw new Error(`${householdId}: duplicate account id ${acct.id}`);
    }
    seen.add(acct.id);
  });
  if(!plan.taxProfiles || typeof plan.taxProfiles !== 'object'){
    throw new Error(`${householdId}: taxProfiles is required`);
  }
  validateTaxProfileOwner(plan.taxProfiles.client, `${householdId}.taxProfiles.client`);
  validateTaxProfileOwner(plan.taxProfiles.spouse, `${householdId}.taxProfiles.spouse`);
}

function basisFromLegacy(entry, balance, plan){
  if(entry.taxCharacter === 'taxable_cash'){
    return { amount: null, method: 'principal', status: 'unknown', source: null, confirmedAt: null, version: 1 };
  }
  if(entry.taxCharacter === 'capital_asset'){
    const pct = plan?.portfolio?.accounts?.taxable?.basisPct;
    if(typeof pct === 'number' && Number.isFinite(pct) && pct >= 0){
      return {
        amount: Math.round(balance * pct),
        method: 'legacy-proportional',
        status: 'assumed',
        source: 'planner-assumption',
        confirmedAt: null,
        version: 1,
      };
    }
    return { amount: null, method: 'unknown', status: 'unknown', source: null, confirmedAt: null, version: 1 };
  }
  return { amount: null, method: 'unknown', status: 'unknown', source: null, confirmedAt: null, version: 1 };
}

function migrateLegacyExtraAccount(legacy, index, householdId, plan){
  if(!legacy || typeof legacy !== 'object' || Array.isArray(legacy)){
    throw new Error(`${householdId}: invalid account at index ${index}`);
  }
  const path = `${householdId}: account[${index}]`;
  const balance = parseLegacyBalance(legacy.balance, path);
  const owner = parseLegacyOwner(legacy.owner, path);
  const resolved = resolveTypeFromLabel(legacy.type);
  const storedBucket = legacy.bucket;

  if(!resolved.known){
    if(!storedBucket || !isValidEngineBucket(storedBucket)){
      throw new Error(`${path}: unknown type with invalid bucket`);
    }
    return {
      id: deterministicLegacyAccountId(householdId, 'extraAccounts', index, legacy),
      typeId: UNSUPPORTED_TYPE_ID,
      type: String(legacy.type || 'Unknown account').trim() || 'Unknown account',
      owner,
      bucket: storedBucket,
      balance,
      valuationDate: null,
      basis: { amount: null, method: 'unknown', status: 'unknown', source: null, confirmedAt: null, version: 1 },
      taxReporting: { inclusion: 'unknown', reportingTaxpayer: null, householdReturnShare: null },
      employerPlanFacts: null,
      designatedRothFacts: null,
    };
  }

  const entry = getAccountTypeById(resolved.typeId);
  let bucket = resolved.engineBucket;
  if(storedBucket){
    if(!isValidEngineBucket(storedBucket)){
      throw new Error(`${path}: invalid bucket`);
    }
    bucket = storedBucket;
  }

  return {
    id: deterministicLegacyAccountId(householdId, 'extraAccounts', index, legacy),
    typeId: entry.id,
    type: entry.label,
    owner,
    bucket,
    balance,
    valuationDate: null,
    basis: basisFromLegacy(entry, balance, plan),
    taxReporting: defaultTaxReportingFor(entry, owner),
    employerPlanFacts: defaultEmployerFactsFor(entry),
    designatedRothFacts: defaultDesignatedFactsFor(entry),
  };
}

function defaultTaxReportingFor(entry, owner){
  const reportingTaxpayer = (owner === 'client' || owner === 'spouse') ? owner : null;
  const inclusion = (entry.id === 'joint_brokerage' || entry.id === 'trust_brokerage' || owner === 'joint' || owner === 'trust')
    ? 'unknown'
    : 'household-return';
  return {
    inclusion,
    reportingTaxpayer,
    householdReturnShare: inclusion === 'household-return' ? 1 : null,
  };
}

function defaultEmployerFactsFor(entry){
  if(entry.taxCharacter !== 'employer_pretax') return null;
  return {
    afterTaxContributionBasis: { value: null, status: 'unknown', source: null, confirmedAt: null, version: 1 },
    planSubtypeConfirmed: { value: null, status: 'unknown', source: null, confirmedAt: null, version: 1 },
  };
}

function defaultDesignatedFactsFor(entry){
  if(entry.taxCharacter !== 'designated_roth') return null;
  return {
    firstContributionYear: { value: null, status: 'unknown', source: null, confirmedAt: null, version: 1 },
    contributionBasis: { value: null, status: 'unknown', source: null, confirmedAt: null, version: 1 },
    inPlanRolloverCohorts: { value: null, status: 'unknown', source: null, confirmedAt: null, version: 1 },
  };
}

export function migrateHouseholdRecord(record, householdId){
  if(!record || typeof record !== 'object'){
    throw new Error('Invalid household record');
  }
  const rawVersion = record.meta?.accountSchemaVersion;
  if(rawVersion != null && rawVersion !== ''){
    const parsed = parseSchemaVersion(rawVersion);
    if(parsed > ACCOUNT_SCHEMA_VERSION){
      throw Object.assign(new Error('Unsupported account schema version'), { code: ACCOUNT_SCHEMA_VERSION_UNSUPPORTED });
    }
    if(parsed === ACCOUNT_SCHEMA_VERSION){
      const plan = JSON.parse(JSON.stringify(record));
      validateCurrentSchemaHousehold(plan, householdId);
      return { changed: false, plan };
    }
  }
  return { changed: true, plan: migrateLegacyHousehold(record, householdId) };
}

export function migrateLegacyHousehold(record, householdId){
  const plan = JSON.parse(JSON.stringify(record));
  if(!plan.meta || typeof plan.meta !== 'object') plan.meta = {};
  const version = plan.meta.accountSchemaVersion == null || plan.meta.accountSchemaVersion === ''
    ? null
    : parseSchemaVersion(plan.meta.accountSchemaVersion);
  if(version != null && version > ACCOUNT_SCHEMA_VERSION){
    throw Object.assign(new Error('Unsupported account schema version'), { code: ACCOUNT_SCHEMA_VERSION_UNSUPPORTED });
  }
  if(!plan.portfolio || typeof plan.portfolio !== 'object'){
    throw new Error(`${householdId}: portfolio is required`);
  }
  if(!Array.isArray(plan.portfolio.extraAccounts)){
    throw new Error(`${householdId}: portfolio.extraAccounts must be an array`);
  }
  validateBaseSleeves(plan.portfolio.accounts || {}, householdId);
  if(!plan.taxProfiles) plan.taxProfiles = createBlankTaxProfiles();
  const migrated = plan.portfolio.extraAccounts.map((acct, index) =>
    migrateLegacyExtraAccount(acct, index, householdId, plan)
  );
  plan.portfolio.extraAccounts = migrated;
  plan.meta.accountSchemaVersion = ACCOUNT_SCHEMA_VERSION;
  validateCurrentSchemaHousehold(plan, householdId);
  return plan;
}

export function deriveHouseholdIssues(plan){
  const issues = [];
  const base = plan?.portfolio?.accounts || {};
  const extras = plan?.portfolio?.extraAccounts || [];
  const baseTotal = ['taxable', 'traditional', 'roth']
    .reduce((s, key) => s + Math.max(0, Number(base[key]?.balance) || 0), 0);
  const typedTotal = extras.reduce((s, a) => s + Math.max(0, Number(a?.balance) || 0), 0);
  if(baseTotal > 0 && typedTotal > 0){
    issues.push('LEGACY_TYPED_OVERLAP');
  }
  extras.forEach(acct => {
    if(acct.typeId === UNSUPPORTED_TYPE_ID){
      issues.push(`ACCOUNT_UNSUPPORTED:${acct.id}`);
      return;
    }
    const canonical = getAccountTypeById(acct.typeId);
    if(!canonical){
      issues.push(`ACCOUNT_UNSUPPORTED:${acct.id}`);
      return;
    }
    if(acct.bucket !== canonical.engineBucket){
      issues.push(`ACCOUNT_BUCKET_CONFLICT:${acct.id}`);
    }
  });
  return issues;
}

export function mergeNonAccountDefaults(record, defaults){
  const merged = JSON.parse(JSON.stringify(record));
  const skipKeys = new Set(['accountSchemaVersion']);
  const fill = (target, source) => {
    Object.entries(source || {}).forEach(([key, value]) => {
      if(skipKeys.has(key)) return;
      if(!(key in target)){
        target[key] = JSON.parse(JSON.stringify(value));
      } else if(
        target[key] && value
        && typeof target[key] === 'object' && !Array.isArray(target[key])
        && typeof value === 'object' && !Array.isArray(value)
      ){
        fill(target[key], value);
      }
    });
  };
  fill(merged.meta || (merged.meta = {}), defaults.meta || {});
  fill(merged, defaults);
  return merged;
}

export function migrateHouseholdsDb(rawDb){
  if(!rawDb || typeof rawDb !== 'object' || Array.isArray(rawDb)){
    return { ok: false, code: ACCOUNT_MIGRATION_BLOCKED, error: 'Invalid household database' };
  }
  const entries = Object.entries(rawDb);
  if(!entries.length){
    return { ok: false, code: ACCOUNT_MIGRATION_BLOCKED, error: 'Empty household database' };
  }
  for(const [recordId, record] of entries){
    if(!record || typeof record !== 'object' || Array.isArray(record)){
      return { ok: false, code: ACCOUNT_MIGRATION_BLOCKED, error: `Invalid household record ${recordId}` };
    }
  }

  const migratedDb = {};
  const issuesByHousehold = {};
  let anyChanged = false;

  try{
    for(const [recordId, record] of entries){
      const { changed, plan } = migrateHouseholdRecord(record, recordId);
      migratedDb[recordId] = plan;
      issuesByHousehold[recordId] = deriveHouseholdIssues(plan);
      if(changed) anyChanged = true;
    }
  }catch(error){
    if(error?.code === ACCOUNT_SCHEMA_VERSION_UNSUPPORTED){
      return { ok: false, code: ACCOUNT_SCHEMA_VERSION_UNSUPPORTED, error: error.message };
    }
    return {
      ok: false,
      code: ACCOUNT_MIGRATION_BLOCKED,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return { ok: true, db: migratedDb, changed: anyChanged, issuesByHousehold };
}

export function getAccountMigrationReadOnlyMessage(){
  return READ_ONLY_MESSAGE;
}

export function getAccountMigrationBlockedMessage(){
  return BLOCKED_MESSAGE;
}

export function detectLegacyTypedOverlap(plan){
  return deriveHouseholdIssues(plan).includes('LEGACY_TYPED_OVERLAP');
}
