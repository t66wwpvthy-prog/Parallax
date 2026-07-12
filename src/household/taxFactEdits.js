import { getAccountTypeById } from './accountTypes.js';
import {
  createFact,
  isValidConfirmationTimestamp,
  validateBasisEnvelope,
} from './factEnvelope.js';
import {
  getAccountScalarFactDefinition,
  getOwnerScalarFactDefinition,
  semanticValueIsValid,
} from './taxFactDefinitions.js';

const REPORTING_INCLUSIONS = new Set([
  'unknown',
  'household-return',
  'separate-return',
]);

function assertRecord(value, label){
  if(!value || typeof value !== 'object' || Array.isArray(value)){
    throw new Error(`${label} must be an object`);
  }
}

function findAccount(plan, accountId){
  if(typeof accountId !== 'string' || !accountId.trim()){
    throw new Error('accountId is required');
  }
  const accounts = plan?.portfolio?.extraAccounts;
  if(!Array.isArray(accounts)){
    throw new Error('portfolio.extraAccounts must be an array');
  }
  const matches = accounts.filter(account => account?.id === accountId);
  if(matches.length !== 1){
    throw new Error(matches.length === 0
      ? `Unknown accountId: ${accountId}`
      : `Duplicate accountId: ${accountId}`);
  }
  return matches[0];
}

function resolveConfirmationTimestamp(now){
  const supplied = typeof now === 'function' ? now() : now;
  const timestamp = supplied === undefined ? new Date().toISOString() : supplied;
  if(!isValidConfirmationTimestamp(timestamp)){
    throw new Error('now must resolve to a valid ISO confirmation timestamp');
  }
  return timestamp;
}

function recordsEqual(left, right){
  return JSON.stringify(left) === JSON.stringify(right);
}

function replaceRecord(container, key, next, affectsCalculation){
  if(recordsEqual(container[key], next)){
    return { changed: false, affectsCalculation: false };
  }
  container[key] = next;
  return { changed: true, affectsCalculation };
}

function accountBasisCanAffectCalculation(account, entry){
  return Boolean(
    entry?.taxCharacter === 'capital_asset'
    && entry.supportedForTax
    && account.owner !== 'trust'
  );
}

function accountReportingCanAffectCalculation(account, entry){
  if(account.owner === 'trust') return false;
  return entry?.taxCharacter === 'taxable_cash'
    || (entry?.taxCharacter === 'capital_asset' && entry.supportedForTax);
}

function confirmAccountBasis(plan, edit, now){
  const account = findAccount(plan, edit.accountId);
  const entry = getAccountTypeById(account.typeId);
  if(entry?.taxCharacter !== 'capital_asset'){
    throw new Error('Cost basis can only be confirmed for taxable capital assets');
  }
  if(typeof edit.value !== 'number' || !Number.isFinite(edit.value) || edit.value < 0){
    throw new Error('Account basis must be a finite nonnegative number');
  }
  const next = {
    amount: edit.value,
    method: 'reported-cost-basis',
    status: 'confirmed',
    source: 'household-entry',
    confirmedAt: resolveConfirmationTimestamp(now),
    version: 1,
  };
  validateBasisEnvelope(next, 'basis');
  return replaceRecord(
    account,
    'basis',
    next,
    accountBasisCanAffectCalculation(account, entry)
  );
}

function clearAccountBasis(plan, edit){
  const account = findAccount(plan, edit.accountId);
  const entry = getAccountTypeById(account.typeId);
  if(entry?.taxCharacter !== 'capital_asset'){
    throw new Error('Cost basis can only be cleared for taxable capital assets');
  }
  const next = {
    amount: null,
    method: 'unknown',
    status: 'unknown',
    source: null,
    confirmedAt: null,
    version: 1,
  };
  validateBasisEnvelope(next, 'basis');
  return replaceRecord(
    account,
    'basis',
    next,
    accountBasisCanAffectCalculation(account, entry)
  );
}

function reportingRecord(inclusion, owner){
  if(!REPORTING_INCLUSIONS.has(inclusion)){
    throw new Error(`Unsupported tax-reporting inclusion: ${inclusion}`);
  }
  if(inclusion === 'unknown'){
    return {
      inclusion,
      reportingTaxpayer: null,
      householdReturnShare: null,
    };
  }
  const individualOwner = owner === 'client' || owner === 'spouse';
  if(inclusion === 'household-return'){
    return {
      inclusion,
      reportingTaxpayer: individualOwner ? owner : 'return-level',
      householdReturnShare: 1,
    };
  }
  return {
    inclusion,
    reportingTaxpayer: individualOwner ? owner : null,
    householdReturnShare: 0,
  };
}

function setAccountTaxReporting(plan, edit){
  const account = findAccount(plan, edit.accountId);
  const entry = getAccountTypeById(account.typeId);
  const next = reportingRecord(edit.inclusion, account.owner);
  return replaceRecord(
    account,
    'taxReporting',
    next,
    accountReportingCanAffectCalculation(account, entry)
  );
}

function ownerFactTarget(plan, edit){
  if(edit.owner !== 'client' && edit.owner !== 'spouse'){
    throw new Error(`Unsupported tax-profile owner: ${edit.owner}`);
  }
  if(edit.owner === 'spouse' && !plan?.household?.spouse){
    throw new Error('Cannot edit co-client tax facts without a co-client');
  }
  const definition = getOwnerScalarFactDefinition(edit.group, edit.key);
  if(!definition){
    throw new Error(`Unsupported owner tax fact: ${edit.group}.${edit.key}`);
  }
  const profile = plan?.taxProfiles?.[edit.owner];
  assertRecord(profile, `taxProfiles.${edit.owner}`);
  const container = edit.group === 'profile' ? profile : profile[edit.group];
  assertRecord(container, `taxProfiles.${edit.owner}.${edit.group}`);
  if(!Object.prototype.hasOwnProperty.call(container, edit.key)){
    throw new Error(`Missing owner tax fact: ${edit.group}.${edit.key}`);
  }
  return { container, definition };
}

function confirmOwnerFact(plan, edit, now){
  const { container, definition } = ownerFactTarget(plan, edit);
  if(!semanticValueIsValid(edit.value, definition.semantic)){
    throw new Error(`Invalid value for owner tax fact: ${edit.group}.${edit.key}`);
  }
  const next = createFact(
    edit.value,
    'confirmed',
    'household-entry',
    resolveConfirmationTimestamp(now)
  );
  return replaceRecord(container, edit.key, next, false);
}

function clearOwnerFact(plan, edit){
  const { container } = ownerFactTarget(plan, edit);
  return replaceRecord(container, edit.key, createFact(null), false);
}

function accountFactTarget(plan, edit){
  const account = findAccount(plan, edit.accountId);
  const entry = getAccountTypeById(account.typeId);
  const definition = getAccountScalarFactDefinition(edit.group, edit.key);
  if(!definition){
    throw new Error(`Unsupported account tax fact: ${edit.group}.${edit.key}`);
  }
  if(entry?.taxCharacter !== definition.taxCharacter){
    throw new Error(`Tax fact ${edit.group}.${edit.key} does not apply to account ${edit.accountId}`);
  }
  const container = account[edit.group];
  assertRecord(container, `${edit.accountId}.${edit.group}`);
  if(!Object.prototype.hasOwnProperty.call(container, edit.key)){
    throw new Error(`Missing account tax fact: ${edit.group}.${edit.key}`);
  }
  return { container, definition };
}

function confirmAccountFact(plan, edit, now){
  const { container, definition } = accountFactTarget(plan, edit);
  if(!semanticValueIsValid(edit.value, definition.semantic)){
    throw new Error(`Invalid value for account tax fact: ${edit.group}.${edit.key}`);
  }
  const next = createFact(
    edit.value,
    'confirmed',
    'household-entry',
    resolveConfirmationTimestamp(now)
  );
  return replaceRecord(container, edit.key, next, false);
}

function clearAccountFact(plan, edit){
  const { container } = accountFactTarget(plan, edit);
  return replaceRecord(container, edit.key, createFact(null), false);
}

/**
 * Apply one atomic Household tax-fact edit to the live plan.
 *
 * `options.now` may be an ISO timestamp string or a function returning one.
 * Omit it to stamp confirmations with the current time. Clear/reporting edits do
 * not read the clock. The function throws before mutation on invalid input.
 */
export function applyHouseholdTaxFactEdit(plan, edit, { now } = {}){
  assertRecord(plan, 'plan');
  assertRecord(edit, 'edit');
  switch(edit.kind){
    case 'confirm-account-basis': return confirmAccountBasis(plan, edit, now);
    case 'clear-account-basis': return clearAccountBasis(plan, edit);
    case 'set-account-tax-reporting': return setAccountTaxReporting(plan, edit);
    case 'confirm-owner-fact': return confirmOwnerFact(plan, edit, now);
    case 'clear-owner-fact': return clearOwnerFact(plan, edit);
    case 'confirm-account-fact': return confirmAccountFact(plan, edit, now);
    case 'clear-account-fact': return clearAccountFact(plan, edit);
    default: throw new Error(`Unsupported Household tax-fact edit: ${edit.kind}`);
  }
}
