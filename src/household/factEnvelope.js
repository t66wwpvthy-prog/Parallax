/** Persisted tax-fact envelope — see Tax Buckets implementation plan §6. */

import { isValidValuationDate } from './accountTypes.js';

const VALID_STATUSES = new Set(['unknown', 'assumed', 'confirmed']);
const VALID_SOURCES = new Set(['household-entry', 'import', 'planner-assumption']);
const FACT_KEYS = ['value', 'status', 'source', 'confirmedAt', 'version'];
const VALID_BASIS_METHODS = new Set(['reported-cost-basis', 'principal', 'legacy-proportional', 'unknown']);
const VALID_BASIS_STATUSES = new Set(['confirmed', 'assumed', 'unknown']);
const BASIS_KEYS = ['amount', 'method', 'status', 'source', 'confirmedAt', 'version'];

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function isValidFactSource(value){
  return value === null || VALID_SOURCES.has(value);
}

export function isValidConfirmationTimestamp(value){
  if(typeof value !== 'string') return false;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)){
    return false;
  }
  return isValidValuationDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function assertFactMetadata(status, source, confirmedAt, path){
  if(!isValidFactSource(source)){
    throw new Error(`${path} has invalid source`);
  }
  if(confirmedAt !== null && !isValidConfirmationTimestamp(confirmedAt)){
    throw new Error(`${path} has invalid confirmedAt`);
  }
  if(status === 'unknown'){
    if(source !== null || confirmedAt !== null){
      throw new Error(`${path} unknown fact cannot have provenance`);
    }
    return;
  }
  if(source === null){
    throw new Error(`${path} ${status} fact requires source`);
  }
  if(status === 'confirmed' && confirmedAt === null){
    throw new Error(`${path} confirmed fact requires confirmedAt`);
  }
  if(status === 'assumed' && confirmedAt !== null){
    throw new Error(`${path} assumed fact cannot have confirmedAt`);
  }
}

export function createFact(value = null, status = 'unknown', source = null, confirmedAt = null){
  if(!VALID_STATUSES.has(status)){
    throw new Error(`Invalid fact status: ${status}`);
  }
  assertFactMetadata(status, source, confirmedAt, 'Fact');
  if(status === 'confirmed' && (value === null || value === undefined)){
    throw new Error('Confirmed facts require a value');
  }
  return {
    value,
    status,
    source,
    confirmedAt,
    version: 1,
  };
}

export function validateFactEnvelope(fact, path){
  if(!fact || typeof fact !== 'object' || Array.isArray(fact)){
    throw new Error(`${path} must be a fact envelope`);
  }
  for(const key of FACT_KEYS){
    if(!hasOwn(fact, key)){
      throw new Error(`${path}.${key} is required`);
    }
  }
  if(!VALID_STATUSES.has(fact.status)){
    throw new Error(`${path} has invalid status`);
  }
  if(fact.version !== 1){
    throw new Error(`${path} has invalid version`);
  }
  assertFactMetadata(fact.status, fact.source, fact.confirmedAt, path);
  if(fact.status === 'confirmed' && (fact.value === null || fact.value === undefined)){
    throw new Error(`${path} confirmed fact requires value`);
  }
}

/** Validate the persisted cost-basis envelope used by Household accounts. */
export function validateBasisEnvelope(basis, path){
  if(!basis || typeof basis !== 'object' || Array.isArray(basis)){
    throw new Error(`${path} must be an object`);
  }
  for(const key of BASIS_KEYS){
    if(!hasOwn(basis, key)){
      throw new Error(`${path}.${key} is required`);
    }
  }
  if(!VALID_BASIS_METHODS.has(basis.method)){
    throw new Error(`${path}.method is invalid`);
  }
  if(!VALID_BASIS_STATUSES.has(basis.status)){
    throw new Error(`${path}.status is invalid`);
  }
  if(basis.amount != null && (
    typeof basis.amount !== 'number'
    || !Number.isFinite(basis.amount)
    || basis.amount < 0
  )){
    throw new Error(`${path}.amount is invalid`);
  }
  if(basis.version !== 1){
    throw new Error(`${path}.version is invalid`);
  }
  if(!isValidFactSource(basis.source)){
    throw new Error(`${path}.source is invalid`);
  }
  if(basis.confirmedAt !== null && !isValidConfirmationTimestamp(basis.confirmedAt)){
    throw new Error(`${path}.confirmedAt is invalid`);
  }
  if(basis.status === 'unknown'){
    if(basis.amount !== null || basis.source !== null || basis.confirmedAt !== null){
      throw new Error(`${path} unknown fact has invalid metadata`);
    }
    return;
  }
  if(basis.amount === null){
    throw new Error(`${path} ${basis.status} fact requires amount`);
  }
  if(basis.source === null){
    throw new Error(`${path} ${basis.status} fact requires source`);
  }
  if(basis.status === 'confirmed'){
    if(basis.confirmedAt === null){
      throw new Error(`${path} confirmed fact requires confirmedAt`);
    }
  }else if(basis.confirmedAt !== null){
    throw new Error(`${path} assumed fact cannot have confirmedAt`);
  }
}

export function isConfirmedBasisEnvelope(basis){
  try{
    validateBasisEnvelope(basis, 'basis');
    return basis.status === 'confirmed';
  }catch{
    return false;
  }
}

export function createBlankTraditionalIraFacts(){
  return {
    priorYearCarryforwardBasis: createFact(null),
    currentYearNondeductibleContributions: createFact(null),
    yearEndAggregateValueOverride: createFact(null),
    outstandingRolloversAtYearEnd: createFact(null),
    otherForm8606Adjustments: createFact(null),
  };
}

export function createBlankRothIraFacts(){
  return {
    firstContributionYear: createFact(null),
    contributionBasis: createFact(null),
    conversionCohorts: createFact(null),
  };
}

export function createBlankTaxProfileOwner(){
  return {
    birthDate: createFact(null),
    blind: createFact(null),
    disabled: createFact(null),
    traditionalIra: createBlankTraditionalIraFacts(),
    rothIra: createBlankRothIraFacts(),
  };
}

export function createBlankTaxProfiles(){
  return {
    client: createBlankTaxProfileOwner(),
    spouse: createBlankTaxProfileOwner(),
  };
}

export function taxProfileHasConfirmedFacts(ownerProfile){
  if(!ownerProfile || typeof ownerProfile !== 'object') return false;
  const walk = (node) => {
    if(!node || typeof node !== 'object') return false;
    if('status' in node && node.status === 'confirmed'){
      if(node.value === null || node.value === undefined) return false;
      return true;
    }
    return Object.values(node).some(walk);
  };
  return walk(ownerProfile);
}
