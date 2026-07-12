import { TaxInputError } from '../../core/errors.js';

export const meta = Object.freeze({
  ruleId: 'FED_QUALIFIED_ROTH_DISTRIBUTION',
  ruleVersion: '1.1.0',
  taxYear: 'projection-year',
  lawVersion: 'current-general-rule',
  jurisdiction: 'federal',
  category: 'retirement_distribution',
  authority: Object.freeze([
    'IRS Publication 590-B: qualified Roth IRA distributions',
    'IRC section 402A(d): qualified designated Roth distributions',
  ]),
  dataSourcesRequired: Object.freeze([]),
  inputsRequired: Object.freeze([
    'distributionDate',
    'ownerBirthDate',
    'firstContributionYear',
  ]),
  outputs: Object.freeze([
    'qualified',
    'ageTestMet',
    'fiveYearTestMet',
    'ageQualificationDate',
  ]),
  limitations: Object.freeze([
    'Supports the age 59.5 qualification route only.',
    'Does not model death, disability, first-home, corrective-distribution, or rollover exceptions.',
  ]),
  triggerTags: Object.freeze(['roth_distribution']),
});

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertIntegerYear(value, path){
  if(!Number.isInteger(value) || value < 1900){
    throw new TaxInputError(`${path} must be an integer year`, { value });
  }
  return value;
}

function daysInMonth(year, month){
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDate(value, path){
  if(typeof value !== 'string'){
    throw new TaxInputError(`${path} must be an ISO date`);
  }
  const match = DATE_RE.exec(value);
  if(!match) throw new TaxInputError(`${path} must be an ISO date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if(year < 1900 || month < 1 || month > 12
    || day < 1 || day > daysInMonth(year, month)){
    throw new TaxInputError(`${path} must be a valid ISO date`);
  }
  return Object.freeze({ value, year, month, day });
}

function addMonthsClamped(date, months){
  const zeroBased = (date.month - 1) + months;
  const year = date.year + Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  const day = Math.min(date.day, daysInMonth(year, month));
  return Object.freeze({
    value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year,
    month,
    day,
  });
}

function dateNumber(date){
  return Date.UTC(date.year, date.month - 1, date.day);
}

export function validate(input){
  if(input === null || typeof input !== 'object' || Array.isArray(input)){
    throw new TaxInputError('qualified Roth distribution input must be a plain object');
  }
  const distributionDate = parseDate(input.distributionDate, 'distributionDate');
  const ownerBirthDate = parseDate(input.ownerBirthDate, 'ownerBirthDate');
  const firstContributionYear = assertIntegerYear(
    input.firstContributionYear,
    'firstContributionYear'
  );
  if(dateNumber(ownerBirthDate) >= dateNumber(distributionDate)){
    throw new TaxInputError('ownerBirthDate must be before distributionDate');
  }
  if(firstContributionYear > distributionDate.year){
    throw new TaxInputError('firstContributionYear cannot be after distributionYear');
  }
  return Object.freeze({ distributionDate, ownerBirthDate, firstContributionYear });
}

export function calculate(input, context = {}){
  const normalized = validate(input);
  const ageQualificationDate = addMonthsClamped(
    normalized.ownerBirthDate,
    (59 * 12) + 6
  );
  const ageTestMet = dateNumber(normalized.distributionDate)
    >= dateNumber(ageQualificationDate);
  const fiveYearTestMet = normalized.distributionDate.year
    - normalized.firstContributionYear >= 5;
  const result = Object.freeze({
    qualified: ageTestMet && fiveYearTestMet,
    ageTestMet,
    fiveYearTestMet,
    ageQualificationDate: ageQualificationDate.value,
  });
  return Object.freeze({
    result,
    audit: Object.freeze({
      ruleId: meta.ruleId,
      ruleVersion: meta.ruleVersion,
      calculatedAt: context.calculatedAt ?? null,
      runId: context.runId ?? null,
      scenarioId: context.scenarioId ?? null,
      inputsUsed: Object.freeze({
        distributionDate: normalized.distributionDate.value,
        ownerBirthDate: normalized.ownerBirthDate.value,
        firstContributionYear: normalized.firstContributionYear,
      }),
      dataSourcesUsed: meta.dataSourcesRequired,
      calculationSteps: Object.freeze([
        Object.freeze({
          test: 'age-at-least-59.5-on-distribution-date',
          qualificationDate: ageQualificationDate.value,
          passed: ageTestMet,
        }),
        Object.freeze({ test: 'five-taxable-years-complete', passed: fiveYearTestMet }),
      ]),
      authority: meta.authority,
      limitations: meta.limitations,
    }),
  });
}

export const qualifiedRothDistribution = Object.freeze({ meta, validate, calculate });
