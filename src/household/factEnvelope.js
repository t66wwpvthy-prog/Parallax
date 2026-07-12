/** Persisted tax-fact envelope — see Tax Buckets implementation plan §6. */

const VALID_STATUSES = new Set(['unknown', 'assumed', 'confirmed']);
const VALID_SOURCES = new Set(['household-entry', 'import', 'planner-assumption']);

export function createFact(value = null, status = 'unknown', source = null, confirmedAt = null){
  if(!VALID_STATUSES.has(status)){
    throw new Error(`Invalid fact status: ${status}`);
  }
  if(status === 'confirmed'){
    if(source == null || !VALID_SOURCES.has(source)){
      throw new Error('Confirmed facts require a valid source');
    }
    if(confirmedAt == null || typeof confirmedAt !== 'string'){
      throw new Error('Confirmed facts require confirmedAt');
    }
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
  if(!VALID_STATUSES.has(fact.status)){
    throw new Error(`${path} has invalid status`);
  }
  if(fact.version !== 1){
    throw new Error(`${path} has invalid version`);
  }
  if(fact.status === 'confirmed'){
    if(fact.source == null || !VALID_SOURCES.has(fact.source)){
      throw new Error(`${path} confirmed fact requires source`);
    }
    if(fact.confirmedAt == null){
      throw new Error(`${path} confirmed fact requires confirmedAt`);
    }
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
