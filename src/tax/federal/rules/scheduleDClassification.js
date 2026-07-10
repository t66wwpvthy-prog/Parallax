/* RULE: Schedule D classification (FED_SCHEDULE_D_CLASSIFICATION) */

import { FILING_STATUSES } from '../../core/constants.js';
import { SCHEDULE_D_CLASSIFICATION_INPUT_SCHEMA, CONTEXT_SCHEMA } from '../../core/schemas.js';
import { validateAgainstSchema, assertOneOf } from '../../core/validators.js';
import { TaxInputError } from '../../core/errors.js';

export const WORKSHEET_TYPES = {
  QUALIFIED_DIVIDENDS_AND_CAPITAL_GAIN: 'QUALIFIED_DIVIDENDS_AND_CAPITAL_GAIN',
  SCHEDULE_D_TAX_WORKSHEET: 'SCHEDULE_D_TAX_WORKSHEET',
};

export const meta = {
  ruleId: 'FED_SCHEDULE_D_CLASSIFICATION',
  ruleVersion: '1.0.0',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
  jurisdiction: 'federal',
  category: 'capital_gains_classification',
  authority: ['IRS 2025 Form 1040 instructions', 'IRS 2025 Schedule D instructions'],
  dataSourcesRequired: [],
  inputsRequired: ['filingStatus', 'line7', 'line15', 'line16'],
  outputs: [
    'form1040Line7',
    'preferentialScheduleDGain',
    'netLongTermCapitalGains',
    'worksheetType',
    'scheduleDLine16',
  ],
  limitations: [
    'Does not run the Schedule D Tax Worksheet when lines 18 or 19 are positive',
    'Does not classify individual transactions; expects Schedule D summary lines',
  ],
  triggerTags: ['capital_gains'],
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function capitalLossLimit(filingStatus){
  return filingStatus === 'marriedFilingSeparately' ? 1500 : 3000;
}

export function validate(input){
  validateAgainstSchema(input, SCHEDULE_D_CLASSIFICATION_INPUT_SCHEMA, 'scheduleDClassification input');
  assertOneOf(input.filingStatus, FILING_STATUSES, 'filingStatus', 'scheduleDClassification input');
  return input;
}

export function calculate(input, context){
  validate(input);
  validateAgainstSchema(context, CONTEXT_SCHEMA, 'context');

  const {
    filingStatus,
    line7,
    line15,
    line16,
    line18 = 0,
    line19 = 0,
  } = input;

  const expectedLine16 = round2(line7 + line15);
  if(round2(line16) !== expectedLine16){
    throw new TaxInputError('Schedule D line 16 must equal line 7 plus line 15', {
      line7,
      line15,
      line16,
      expectedLine16,
    });
  }

  if(line18 > 0 || line19 > 0){
    throw new TaxInputError(
      'Schedule D lines 18 or 19 require the Schedule D Tax Worksheet; basic preferential stacking does not apply.',
      { line18, line19 }
    );
  }

  let form1040Line7 = 0;
  if(line16 < 0){
    form1040Line7 = -Math.min(Math.abs(line16), capitalLossLimit(filingStatus));
  } else if(line16 > 0){
    form1040Line7 = line16;
  }

  let preferentialScheduleDGain = 0;
  if(line15 > 0 && line16 > 0){
    preferentialScheduleDGain = Math.min(line15, line16);
  }

  const result = {
    form1040Line7: round2(form1040Line7),
    preferentialScheduleDGain: round2(preferentialScheduleDGain),
    netLongTermCapitalGains: round2(preferentialScheduleDGain),
    worksheetType: WORKSHEET_TYPES.QUALIFIED_DIVIDENDS_AND_CAPITAL_GAIN,
    scheduleDLine16: round2(line16),
    capitalLossLimitApplied: line16 < 0 ? capitalLossLimit(filingStatus) : null,
  };

  const audit = {
    ruleId: meta.ruleId,
    ruleVersion: meta.ruleVersion,
    taxYear: context.taxYear,
    lawVersion: context.lawVersion,
    calculatedAt: context.calculatedAt,
    runId: context.runId,
    scenarioId: context.scenarioId,
    inputsUsed: { filingStatus, line7, line15, line16, line18, line19 },
    dataSourcesUsed: [],
    calculationSteps: [
      { step: 'verify_line16', line7, line15, line16, expectedLine16 },
      { step: 'form1040_line7', value: result.form1040Line7 },
      { step: 'preferential_schedule_d_gain', value: result.preferentialScheduleDGain },
    ],
    authority: meta.authority,
    limitations: meta.limitations,
  };

  return { result, audit };
}

export const scheduleDClassification = { meta, validate, calculate };
