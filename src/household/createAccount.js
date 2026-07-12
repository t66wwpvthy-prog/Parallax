import {
  getAccountTypeById,
  isValidEngineBucket,
  isValidOwner,
  isValidValuationDate,
} from './accountTypes.js';
import { createFact } from './factEnvelope.js';

function newAccountId(){
  if(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'){
    return `acct_${crypto.randomUUID()}`;
  }
  return `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseBalanceInput(value, { allowOmitted = false } = {}){
  if(value == null || value === ''){
    if(allowOmitted) return 0;
    throw new Error('Balance is required');
  }
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0){
    throw new Error('Invalid balance');
  }
  return Math.round(n);
}

function defaultBasisForType(entry){
  if(entry.taxCharacter === 'taxable_cash'){
    return {
      amount: null,
      method: 'principal',
      status: 'unknown',
      source: null,
      confirmedAt: null,
      version: 1,
    };
  }
  if(entry.taxCharacter === 'capital_asset'){
    return {
      amount: null,
      method: 'unknown',
      status: 'unknown',
      source: null,
      confirmedAt: null,
      version: 1,
    };
  }
  return {
    amount: null,
    method: 'unknown',
    status: 'unknown',
    source: null,
    confirmedAt: null,
    version: 1,
  };
}

function defaultTaxReporting(entry, owner){
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

function defaultEmployerPlanFacts(entry){
  if(entry.taxCharacter !== 'employer_pretax') return null;
  return {
    afterTaxContributionBasis: createFact(null),
    planSubtypeConfirmed: createFact(null),
  };
}

function defaultDesignatedRothFacts(entry){
  if(entry.taxCharacter !== 'designated_roth') return null;
  return {
    firstContributionYear: createFact(null),
    contributionBasis: createFact(null),
    inPlanRolloverCohorts: createFact(null),
  };
}

/**
 * Create a new account at the current schema version.
 */
export function createAccount(typeId, options = {}){
  const entry = getAccountTypeById(typeId);
  if(!entry){
    throw new Error(`Unknown account typeId: ${typeId}`);
  }
  const owner = options.owner || entry.defaultOwner || 'client';
  if(!isValidOwner(owner)){
    throw new Error(`Invalid account owner: ${owner}`);
  }
  const balance = parseBalanceInput(options.balance, { allowOmitted: true });
  const valuationDate = options.valuationDate ?? null;
  if(!isValidValuationDate(valuationDate)){
    throw new Error('Invalid valuationDate');
  }
  return {
    id: newAccountId(),
    typeId: entry.id,
    type: entry.label,
    owner,
    bucket: entry.engineBucket,
    balance,
    valuationDate,
    basis: defaultBasisForType(entry),
    taxReporting: defaultTaxReporting(entry, owner),
    employerPlanFacts: defaultEmployerPlanFacts(entry),
    designatedRothFacts: defaultDesignatedRothFacts(entry),
  };
}

export function hasSpouseOwnedAccounts(plan){
  return (plan.portfolio?.extraAccounts || []).some(a => a && a.owner === 'spouse');
}

export { newAccountId, parseBalanceInput };
