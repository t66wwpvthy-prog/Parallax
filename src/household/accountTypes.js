/** Canonical account registry — single source of classification truth. */

const ACCOUNT_TYPES = Object.freeze([
  Object.freeze({ id: 'checking', label: 'Checking', aliases: Object.freeze(['Checking']), engineBucket: 'taxable', taxCharacter: 'taxable_cash', basisRequired: false, supportedForTax: false, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'savings', label: 'Savings', aliases: Object.freeze(['Savings']), engineBucket: 'taxable', taxCharacter: 'taxable_cash', basisRequired: false, supportedForTax: false, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'money_market', label: 'Money Market', aliases: Object.freeze(['Money Market']), engineBucket: 'taxable', taxCharacter: 'taxable_cash', basisRequired: false, supportedForTax: false, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'certificate_of_deposit', label: 'CD', aliases: Object.freeze(['CD']), engineBucket: 'taxable', taxCharacter: 'taxable_cash', basisRequired: false, supportedForTax: false, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'brokerage_taxable', label: 'Brokerage (taxable)', aliases: Object.freeze(['Brokerage', 'Brokerage (taxable)']), engineBucket: 'taxable', taxCharacter: 'capital_asset', basisRequired: true, supportedForTax: true, wizardEnabled: true, wizardOrder: 30, defaultOwner: null }),
  Object.freeze({ id: 'joint_brokerage', label: 'Joint brokerage', aliases: Object.freeze(['Joint brokerage']), engineBucket: 'taxable', taxCharacter: 'capital_asset', basisRequired: true, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: 'joint' }),
  Object.freeze({ id: 'trust_brokerage', label: 'Trust brokerage', aliases: Object.freeze(['Trust brokerage']), engineBucket: 'taxable', taxCharacter: 'capital_asset', basisRequired: true, supportedForTax: false, wizardEnabled: false, wizardOrder: null, defaultOwner: 'trust' }),
  Object.freeze({ id: 'traditional_ira', label: 'Traditional IRA', aliases: Object.freeze(['Traditional IRA']), engineBucket: 'traditional', taxCharacter: 'traditional_ira', basisRequired: false, supportedForTax: true, wizardEnabled: true, wizardOrder: 10, defaultOwner: null }),
  Object.freeze({ id: 'rollover_ira', label: 'Rollover IRA', aliases: Object.freeze(['Rollover IRA']), engineBucket: 'traditional', taxCharacter: 'traditional_ira', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'sep_ira', label: 'SEP IRA', aliases: Object.freeze(['SEP IRA']), engineBucket: 'traditional', taxCharacter: 'traditional_ira', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'simple_ira', label: 'SIMPLE IRA', aliases: Object.freeze(['SIMPLE IRA']), engineBucket: 'traditional', taxCharacter: 'traditional_ira', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: '401k', label: '401(k)', aliases: Object.freeze(['401(k)']), engineBucket: 'traditional', taxCharacter: 'employer_pretax', basisRequired: false, supportedForTax: true, wizardEnabled: true, wizardOrder: 40, defaultOwner: null }),
  Object.freeze({ id: '403b', label: '403(b)', aliases: Object.freeze(['403(b)']), engineBucket: 'traditional', taxCharacter: 'employer_pretax', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: '457', label: '457', aliases: Object.freeze(['457']), engineBucket: 'traditional', taxCharacter: 'employer_pretax', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: '401a', label: '401(a)', aliases: Object.freeze(['401(a)']), engineBucket: 'traditional', taxCharacter: 'employer_pretax', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'solo_401k', label: 'Solo 401(k)', aliases: Object.freeze(['Solo 401(k)']), engineBucket: 'traditional', taxCharacter: 'employer_pretax', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'qualified_plan', label: 'Qualified Plan', aliases: Object.freeze(['Qualified Plan']), engineBucket: 'traditional', taxCharacter: 'employer_pretax', basisRequired: false, supportedForTax: false, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'roth_ira', label: 'Roth IRA', aliases: Object.freeze(['Roth IRA']), engineBucket: 'roth', taxCharacter: 'roth_ira', basisRequired: false, supportedForTax: true, wizardEnabled: true, wizardOrder: 20, defaultOwner: null }),
  Object.freeze({ id: 'roth_401k', label: 'Roth 401(k)', aliases: Object.freeze(['Roth 401(k)']), engineBucket: 'roth', taxCharacter: 'designated_roth', basisRequired: false, supportedForTax: true, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
  Object.freeze({ id: 'hsa', label: 'HSA', aliases: Object.freeze(['HSA']), engineBucket: 'roth', taxCharacter: 'hsa', basisRequired: false, supportedForTax: false, wizardEnabled: true, wizardOrder: 50, defaultOwner: null }),
  Object.freeze({ id: 'legacy_529', label: '529', aliases: Object.freeze(['529']), engineBucket: 'roth', taxCharacter: 'unsupported', basisRequired: false, supportedForTax: false, wizardEnabled: false, wizardOrder: null, defaultOwner: null }),
]);

const byId = new Map(ACCOUNT_TYPES.map(t => [t.id, t]));
const aliasIndex = new Map();
for(const entry of ACCOUNT_TYPES){
  for(const alias of entry.aliases){
    aliasIndex.set(normalizeAlias(alias), entry.id);
  }
  aliasIndex.set(normalizeAlias(entry.label), entry.id);
}

export const ACCOUNT_SCHEMA_VERSION = 1;
export const UNSUPPORTED_TYPE_ID = 'unsupported';

const VALID_BUCKETS = new Set(['taxable', 'traditional', 'roth']);
const VALID_OWNERS = new Set(['client', 'spouse', 'joint', 'trust']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeAlias(text){
  return String(text || '').trim().toLowerCase();
}

function cloneEntry(entry){
  return Object.freeze({
    ...entry,
    aliases: Object.freeze([...entry.aliases]),
  });
}

export function getAccountTypeRegistry(){
  return Object.freeze(ACCOUNT_TYPES.map(cloneEntry));
}

export function getAccountTypeById(typeId){
  const entry = byId.get(typeId);
  return entry ? cloneEntry(entry) : null;
}

export function resolveTypeFromLabel(label){
  const key = normalizeAlias(label);
  const typeId = aliasIndex.get(key);
  if(!typeId){
    return {
      typeId: null,
      label: String(label || '').trim() || 'Unknown account',
      engineBucket: null,
      taxCharacter: 'unsupported',
      known: false,
      entry: null,
    };
  }
  const entry = byId.get(typeId);
  return {
    typeId: entry.id,
    label: entry.label,
    engineBucket: entry.engineBucket,
    taxCharacter: entry.taxCharacter,
    known: true,
    entry: cloneEntry(entry),
  };
}

export function getWizardAccountTypes(){
  return ACCOUNT_TYPES
    .filter(t => t.wizardEnabled)
    .sort((a, b) => a.wizardOrder - b.wizardOrder)
    .map(t => ({ typeId: t.id, label: t.label, bucket: t.engineBucket }));
}

export function engineBucketForTypeId(typeId){
  return getAccountTypeById(typeId)?.engineBucket ?? null;
}

export function accountDisplayTreatment(typeIdOrLabel){
  const entry = getAccountTypeById(typeIdOrLabel) || resolveTypeFromLabel(typeIdOrLabel).entry;
  if(!entry){
    return { label: 'Unsupported', color: '#7688a0' };
  }
  switch(entry.taxCharacter){
    case 'capital_asset':
    case 'taxable_cash':
      return { label: 'Taxable', color: '#7688a0' };
    case 'traditional_ira':
    case 'employer_pretax':
      return { label: 'Tax-deferred', color: '#c3a56a' };
    case 'roth_ira':
    case 'designated_roth':
      return { label: 'Tax-free', color: '#879a86' };
    case 'hsa':
      return { label: 'HSA', color: '#879a86' };
    default:
      return { label: 'Unsupported', color: '#7688a0' };
  }
}

export function isValidOwner(owner){
  return VALID_OWNERS.has(owner);
}

export function isValidEngineBucket(bucket){
  return VALID_BUCKETS.has(bucket);
}

export function isValidValuationDate(value){
  if(value === null) return true;
  if(typeof value !== 'string') return false;
  if(!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if(year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function parseSchemaVersion(value){
  if(typeof value !== 'number' || !Number.isInteger(value) || value < 0){
    throw new Error('Invalid accountSchemaVersion');
  }
  return value;
}
