import { isValidValuationDate } from './accountTypes.js';

export const MIN_TAX_FACT_YEAR = 1900;
export const MAX_TAX_FACT_YEAR = new Date().getUTCFullYear();

function freezeSpec(spec){
  return Object.freeze({
    ...spec,
    path: spec.path ? Object.freeze([...spec.path]) : undefined,
  });
}

function freezeSpecs(specs){
  return Object.freeze(specs.map(freezeSpec));
}

export const PROFILE_FACTS = freezeSpecs([
  { id: 'birthDate', group: 'profile', key: 'birthDate', path: ['birthDate'], semantic: 'date', rule: 'OWNER_PROFILE_RULE_PENDING' },
  { id: 'blind', group: 'profile', key: 'blind', path: ['blind'], semantic: 'boolean', rule: 'STANDARD_DEDUCTION_AGE_BLIND_RULE_PENDING' },
  { id: 'disabled', group: 'profile', key: 'disabled', path: ['disabled'], semantic: 'boolean', rule: 'OWNER_PROFILE_RULE_PENDING' },
]);

export const TRADITIONAL_IRA_FACTS = freezeSpecs([
  {
    id: 'traditionalIra.priorYearCarryforwardBasis',
    group: 'traditionalIra',
    key: 'priorYearCarryforwardBasis',
    path: ['traditionalIra', 'priorYearCarryforwardBasis'],
    semantic: 'nonnegative-number',
    rule: 'FORM_8606_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'traditionalIra.currentYearNondeductibleContributions',
    group: 'traditionalIra',
    key: 'currentYearNondeductibleContributions',
    path: ['traditionalIra', 'currentYearNondeductibleContributions'],
    semantic: 'nonnegative-number',
    rule: 'FORM_8606_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'traditionalIra.yearEndAggregateValueOverride',
    group: 'traditionalIra',
    key: 'yearEndAggregateValueOverride',
    path: ['traditionalIra', 'yearEndAggregateValueOverride'],
    semantic: 'nonnegative-number',
    rule: 'FORM_8606_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'traditionalIra.outstandingRolloversAtYearEnd',
    group: 'traditionalIra',
    key: 'outstandingRolloversAtYearEnd',
    path: ['traditionalIra', 'outstandingRolloversAtYearEnd'],
    semantic: 'nonnegative-number',
    rule: 'FORM_8606_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'traditionalIra.otherForm8606Adjustments',
    group: 'traditionalIra',
    key: 'otherForm8606Adjustments',
    path: ['traditionalIra', 'otherForm8606Adjustments'],
    semantic: 'finite-number',
    rule: 'FORM_8606_DISTRIBUTION_RULE_PENDING',
  },
]);

export const ROTH_IRA_FACTS = freezeSpecs([
  {
    id: 'rothIra.firstContributionYear',
    group: 'rothIra',
    key: 'firstContributionYear',
    path: ['rothIra', 'firstContributionYear'],
    semantic: 'year',
    rule: 'ROTH_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'rothIra.contributionBasis',
    group: 'rothIra',
    key: 'contributionBasis',
    path: ['rothIra', 'contributionBasis'],
    semantic: 'nonnegative-number',
    rule: 'ROTH_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'rothIra.conversionCohorts',
    group: 'rothIra',
    key: 'conversionCohorts',
    path: ['rothIra', 'conversionCohorts'],
    semantic: 'array',
    rule: 'ROTH_DISTRIBUTION_RULE_PENDING',
  },
]);

export const EMPLOYER_FACTS = freezeSpecs([
  {
    id: 'employerPlanFacts.afterTaxContributionBasis',
    group: 'employerPlanFacts',
    key: 'afterTaxContributionBasis',
    semantic: 'nonnegative-number',
    taxCharacter: 'employer_pretax',
    rule: 'EMPLOYER_AFTER_TAX_BASIS_RULE_PENDING',
  },
  {
    id: 'employerPlanFacts.planSubtypeConfirmed',
    group: 'employerPlanFacts',
    key: 'planSubtypeConfirmed',
    semantic: 'boolean',
    taxCharacter: 'employer_pretax',
    rule: 'EMPLOYER_PLAN_SUBTYPE_RULE_PENDING',
  },
]);

export const DESIGNATED_ROTH_FACTS = freezeSpecs([
  {
    id: 'designatedRothFacts.firstContributionYear',
    group: 'designatedRothFacts',
    key: 'firstContributionYear',
    semantic: 'year',
    taxCharacter: 'designated_roth',
    rule: 'DESIGNATED_ROTH_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'designatedRothFacts.contributionBasis',
    group: 'designatedRothFacts',
    key: 'contributionBasis',
    semantic: 'nonnegative-number',
    taxCharacter: 'designated_roth',
    rule: 'DESIGNATED_ROTH_DISTRIBUTION_RULE_PENDING',
  },
  {
    id: 'designatedRothFacts.inPlanRolloverCohorts',
    group: 'designatedRothFacts',
    key: 'inPlanRolloverCohorts',
    semantic: 'array',
    taxCharacter: 'designated_roth',
    rule: 'DESIGNATED_ROTH_DISTRIBUTION_RULE_PENDING',
  },
]);

export const OWNER_SCALAR_FACTS = Object.freeze([
  ...PROFILE_FACTS,
  ...TRADITIONAL_IRA_FACTS,
  ...ROTH_IRA_FACTS,
].filter(spec => spec.semantic !== 'array'));

export const ACCOUNT_SCALAR_FACTS = Object.freeze([
  ...EMPLOYER_FACTS,
  ...DESIGNATED_ROTH_FACTS,
].filter(spec => spec.semantic !== 'array'));

export function semanticValueIsValid(value, semantic){
  switch(semantic){
    case 'boolean': return typeof value === 'boolean';
    case 'date': return typeof value === 'string' && isValidValuationDate(value);
    case 'year': return Number.isInteger(value)
      && value >= MIN_TAX_FACT_YEAR
      && value <= MAX_TAX_FACT_YEAR;
    case 'nonnegative-number': return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    case 'finite-number': return typeof value === 'number' && Number.isFinite(value);
    case 'array': return Array.isArray(value);
    default: return false;
  }
}

export function getOwnerScalarFactDefinition(group, key){
  return OWNER_SCALAR_FACTS.find(spec => spec.group === group && spec.key === key) ?? null;
}

export function getAccountScalarFactDefinition(group, key){
  return ACCOUNT_SCALAR_FACTS.find(spec => spec.group === group && spec.key === key) ?? null;
}
