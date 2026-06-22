/* ============================================================================
   TAX ENGINE — schemas
   Shapes only — no calculation logic.
   ============================================================================ */

export const CONTEXT_SCHEMA = {
  fields: {
    calculatedAt: 'string',
    runId:        'string',
    scenarioId:   'string',
    taxYear:      'number',
    lawVersion:   'string',
  },
  required: ['calculatedAt', 'runId', 'scenarioId', 'taxYear', 'lawVersion'],
};

export const ORDINARY_INCOME_INPUT_SCHEMA = {
  fields: {
    filingStatus:         'string',
    taxableOrdinaryIncome: 'number',
  },
  required: ['filingStatus', 'taxableOrdinaryIncome'],
};

export const CAPITAL_GAINS_STACKING_INPUT_SCHEMA = {
  fields: {
    filingStatus:             'string',
    ordinaryTaxableIncome:    'number',
    netLongTermCapitalGains:  'number',
    qualifiedDividends:       'number',
  },
  required: ['filingStatus', 'ordinaryTaxableIncome', 'netLongTermCapitalGains', 'qualifiedDividends'],
};

export const TRADITIONAL_IRA_DEDUCTIBILITY_INPUT_SCHEMA = {
  fields: {
    filingStatus:                     'string',
    modifiedAgi:                      'number',
    contributionAmount:               'number',
    age:                              'number',
    taxableCompensation:              'number',
    taxpayerCoveredByWorkplacePlan:   'boolean',
    spouseCoveredByWorkplacePlan:     'boolean',
    livedWithSpouse:                  'boolean',
  },
  required: [
    'filingStatus',
    'modifiedAgi',
    'contributionAmount',
    'age',
    'taxableCompensation',
    'taxpayerCoveredByWorkplacePlan',
    'spouseCoveredByWorkplacePlan',
    'livedWithSpouse',
  ],
};

export const TAXABLE_SOCIAL_SECURITY_INPUT_SCHEMA = {
  fields: {
    filingStatus:             'string',
    socialSecurityBenefits:   'number',
    otherIncome:              'number',
    taxExemptInterest:        'number',
    excludedIncomeAddBacks:   'number',
    adjustments:              'number',
    livedWithSpouse:          'boolean',
  },
  required: [
    'filingStatus',
    'socialSecurityBenefits',
    'otherIncome',
    'taxExemptInterest',
    'excludedIncomeAddBacks',
    'adjustments',
    'livedWithSpouse',
  ],
};

export const STANDARD_DEDUCTION_INPUT_SCHEMA = {
  fields: {
    filingStatus: 'string',
  },
  required: ['filingStatus'],
};

export const FORM1040_LINE_STATUSES = ['CALCULATED', 'SUPPLIED', 'DEFERRED', 'NOT_APPLICABLE'];

export const ANNUAL_FEDERAL_TAX_INPUT_SCHEMA = {
  fields: {
    filingStatus:           'string',
    taxableOrdinaryIncome:  'number',
    ordinaryTaxableIncome:  'number',
    supplied:               'object',
    deductions:             'object',
    socialSecurity:         'object',
    traditionalIra:         'object',
    capitalGains:           'object',
  },
  required: ['filingStatus'],
};
