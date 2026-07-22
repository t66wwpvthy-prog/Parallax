import { buildDefaultTaxContext, runClient1040Intake } from '../../tax/annual1040.js';
import { CAPITAL_GAINS_THRESHOLDS, ORDINARY_BRACKETS } from '../../tax/core/constants.js';
import {
  enteredAdjustmentTotal,
  enteredCreditTotal,
  enteredDeductionTotal,
  findLikelyGpcDuplicateWageRows,
  isSourceActiveNow,
  normalizedIncomeSource,
} from '../../household/incomeTaxModel.js';
import { getRmdStartAge, inferBirthYear } from '../rmdStartAge.js';

const add = (target, key, amount) => { target[key] = (target[key] || 0) + amount; };

function currentIncome(plan){
  const income = {};
  for(const raw of plan.income?.other || []){
    if(!isSourceActiveNow(plan, raw)) continue;
    const source = normalizedIncomeSource(plan, raw);
    const amount = source.amount;
    if(source.typeId === 'wages' || source.typeId === 'bonus') add(income, 'wages', amount);
    else if(source.typeId === 'interest'){
      const taxablePct = Math.max(0, Math.min(1, source.taxablePct ?? 1));
      add(income, 'taxableInterest', amount * taxablePct);
      add(income, 'taxExemptInterest', amount * (1 - taxablePct));
    }
    else if(source.typeId === 'tax_exempt_interest') add(income, 'taxExemptInterest', amount);
    else if(source.typeId === 'dividends'){
      add(income, 'ordinaryDividends', amount);
      add(income, 'qualifiedDividends', amount * Math.max(0, Math.min(1, source.qualifiedPct || 0)));
    }else if(source.typeId === 'ira_distribution' || source.typeId === 'roth_conversion'){
      add(income, 'iraDistributions', amount);
      add(income, 'taxableIra', amount * Math.max(0, Math.min(1, source.taxablePct ?? 1)));
    }else if(source.typeId === 'short_term_capital_gain'){
      add(income, 'capitalGain', amount);
    }else if(source.typeId === 'long_term_capital_gain'){
      add(income, 'capitalGain', amount);
      add(income, 'netLongTermCapitalGains', amount);
    }else if(source.typeId === 'pension' || source.typeId === 'annuity'){
      add(income, 'pensionAmount', amount);
      add(income, 'taxablePensions', amount * Math.max(0, Math.min(1, source.taxablePct ?? 1)));
    }else add(income, 'otherIncome', amount * Math.max(0, Math.min(1, source.taxablePct ?? 1)));
  }

  const primaryAge = plan.household?.primary?.currentAge ?? 0;
  const spouseAge = plan.household?.spouse?.currentAge ?? primaryAge;
  const ss = plan.income?.socialSecurity || {};
  const primarySs = ss.primary && primaryAge >= (ss.primary.claimAge ?? 67) ? Number(ss.primary.pia) || 0 : 0;
  const spouseSs = plan.household?.spouse && ss.spouse && spouseAge >= (ss.spouse.claimAge ?? 67)
    ? Number(ss.spouse.pia) || 0 : 0;
  if(primarySs + spouseSs > 0) income.socialSecurityBenefits = primarySs + spouseSs;

  const pension = plan.income?.pension || {};
  const pensionAmount = pension.benefitByAge?.[pension.startAge] ?? pension.base ?? 0;
  if(primaryAge >= (pension.startAge ?? 999) && pensionAmount > 0){
    income.pensionAmount = pensionAmount;
    income.taxablePensions = pensionAmount;
  }
  return income;
}

function totalIncome(income){
  return Object.entries(income).reduce((sum, [key, value]) =>
    key === 'qualifiedDividends' || key === 'taxablePensions' || key === 'taxableIra'
      || key === 'netLongTermCapitalGains' || key === 'socialSecurity'
      ? sum
      : sum + (Number(value) || 0), 0);
}

function socialSecurityOtherIncome(income){
  return ['wages', 'taxableInterest', 'ordinaryDividends', 'taxablePensions', 'taxableIra', 'capitalGain', 'otherIncome']
    .reduce((sum, key) => sum + (Number(income[key]) || 0), 0);
}

function unsupportedCurrentInputs(plan, filingStatus, income){
  const activeSources = (plan.income?.other || [])
    .filter(source => isSourceActiveNow(plan, source) && Number(source.amount) > 0)
    .map(source => normalizedIncomeSource(plan, source));
  if(activeSources.some(source => source.typeId === 'self_employment')){
    return 'Self-employment tax needs Schedule SE facts';
  }
  const unsupportedAdjustment = (plan.incomeTax?.adjustments || [])
    .find(row => row.typeId === 'ira_deduction' && Number(row.amount) > 0);
  if(unsupportedAdjustment) return 'Deductible IRA treatment needs workplace-plan facts';
  const unsupportedDeduction = (plan.incomeTax?.deductions || [])
    .find(row => ['medical', 'salt', 'real_estate_tax', 'personal_property_tax'].includes(row.typeId) && Number(row.amount) > 0);
  if(unsupportedDeduction){
    return unsupportedDeduction.typeId === 'medical'
      ? 'Medical deduction needs the federal AGI-floor rule'
      : 'SALT deduction needs the federal cap rule';
  }
  if(filingStatus === 'marriedFilingSeparately' && Number(income.socialSecurityBenefits) > 0){
    return 'Social Security taxation needs the lived-with-spouse fact for MFS';
  }
  return '';
}

function run(intake, suffix){
  const context = buildDefaultTaxContext({
    taxYear: 2026,
    calculatedAt: new Date().toISOString(),
    runId: `wizard_current_${suffix}`,
    scenarioId: 'household_wizard',
  });
  return runClient1040Intake(intake, context);
}

function ordinaryBracketRoom(filingStatus, taxableOrdinaryIncome){
  const bracket = ORDINARY_BRACKETS['2026_FINAL']?.[filingStatus]
    ?.find(row => taxableOrdinaryIncome <= row.upTo);
  if(!bracket || !Number.isFinite(bracket.upTo)) return null;
  return Math.max(0, bracket.upTo - taxableOrdinaryIncome);
}

function capitalGainsPosition(filingStatus, taxableIncome, marginalRate, preferentialIncome){
  if(!(preferentialIncome > 0) || marginalRate == null){
    return { room: null, note: 'No qualified dividends or long-term gains' };
  }
  const thresholds = CAPITAL_GAINS_THRESHOLDS['2026_FINAL']?.[filingStatus];
  if(!thresholds) return { room: null, note: '' };
  if(marginalRate === 0){
    const room = Math.max(0, thresholds.zeroRateMax - taxableIncome);
    return { room, note: `$${Math.round(room).toLocaleString('en-US')} of room in the 0% bracket` };
  }
  if(marginalRate === 0.15){
    const exceeded = Math.max(0, taxableIncome - thresholds.zeroRateMax);
    return { room: Math.max(0, thresholds.fifteenRateMax - taxableIncome), note: `0% bracket exceeded by $${Math.round(exceeded).toLocaleString('en-US')}` };
  }
  return { room: null, note: 'Income reaches the 20% capital-gains band' };
}

function rmdSchedule(plan){
  const asOfYear = Number.isFinite(plan.meta?.asOfYear)
    ? plan.meta.asOfYear
    : new Date().getFullYear();
  const currentAge = Number(plan.household?.primary?.currentAge);
  const birthYear = Number.isFinite(currentAge)
    ? inferBirthYear(currentAge, asOfYear)
    : Number(plan.household?.primary?.birthYear);
  const rmdAge = getRmdStartAge(birthYear);
  if(rmdAge == null || !Number.isFinite(birthYear)){
    return { rmdAge: null, firstRmdYear: null };
  }
  return { rmdAge, firstRmdYear: birthYear + rmdAge };
}

export function buildCurrentIncomeTaxSummary(plan){
  const duplicateWages = findLikelyGpcDuplicateWageRows(plan);
  if(duplicateWages.length){
    return {
      status: 'needs_facts',
      message: 'Review duplicate salary entries saved by the prior wizard before calculating tax',
      totalIncome: null,
      duplicateIncomeRows: duplicateWages,
    };
  }
  const filingStatus = plan.meta?.filingStatus;
  const income = currentIncome(plan);
  const adjustments = enteredAdjustmentTotal(plan);
  const premiumTaxCredit = enteredCreditTotal(plan);
  const itemizedAmount = enteredDeductionTotal(plan);
  const enteredTotal = totalIncome(income);
  if(!filingStatus){
    return { status: 'needs_facts', message: 'Filing status required', totalIncome: enteredTotal };
  }
  const unsupportedMessage = unsupportedCurrentInputs(plan, filingStatus, income);
  if(unsupportedMessage){
    return { status: 'needs_facts', message: unsupportedMessage, totalIncome: enteredTotal };
  }
  try{
    const base = { taxYear: 2026, filingStatus, income };
    if(premiumTaxCredit > 0) base.passThrough = { line20: premiumTaxCredit };
    if(income.socialSecurityBenefits > 0){
      base.income = {
        ...income,
        socialSecurity: {
          socialSecurityBenefits: income.socialSecurityBenefits,
          otherIncome: socialSecurityOtherIncome(income),
          taxExemptInterest: Number(income.taxExemptInterest) || 0,
          excludedIncomeAddBacks: 0,
          adjustments,
          livedWithSpouse: false,
        },
      };
    }
    if(adjustments > 0) base.adjustments = { total: adjustments };
    const standard = run({ ...base, deductions: { useStandard: true } }, 'standard');
    const itemized = itemizedAmount > 0
      ? run({ ...base, deductions: { itemizedAmount } }, 'itemized')
      : null;
    const standardDeduction = standard.result?.form1040?.line12e?.value ?? 0;
    const itemizedDeduction = itemized?.result?.form1040?.line12e?.value ?? 0;
    const selected = itemizedDeduction > standardDeduction ? itemized : standard;
    const annual = selected.annual1040Result;
    const capAudit = selected.audits?.find(entry => entry.ruleId === 'FED_CAPITAL_GAINS_STACKING');
    const ordinaryAudit = selected.audits?.find(entry => entry.ruleId === 'FED_ORDINARY_INCOME_TAX');
    const taxableOrdinaryIncome = Number(ordinaryAudit?.inputsUsed?.taxableOrdinaryIncome) || 0;
    const capitalGainsRate = capAudit?.calculationSteps?.at(-1)?.rate ?? null;
    const capitalGains = capitalGainsPosition(
      filingStatus,
      annual.federalSummary.taxableIncome,
      capitalGainsRate,
      annual.federalSummary.preferentialIncome,
    );
    return {
      status: 'ready',
      totalIncome: enteredTotal,
      adjustments,
      premiumTaxCredit,
      deductionUsed: annual.lines.line15.value == null ? null : Math.max(standardDeduction, itemizedDeduction),
      deductionMethod: itemizedDeduction > standardDeduction ? 'Itemized' : 'Standard',
      standardDeduction,
      itemizedDeduction,
      adjustedGrossIncome: annual.federalSummary.adjustedGrossIncome,
      taxableIncome: annual.federalSummary.taxableIncome,
      federalTaxLiability: annual.federalSummary.federalTaxLiability,
      marginalRate: annual.federalSummary.marginalRate,
      ordinaryBracketRoom: ordinaryBracketRoom(filingStatus, taxableOrdinaryIncome),
      effectiveRate: annual.federalSummary.effectiveRate,
      capitalGainsRate,
      capitalGainsRoom: capitalGains.room,
      capitalGainsNote: capitalGains.note,
      ...rmdSchedule(plan),
      warnings: annual.warnings || [],
    };
  }catch(error){
    return {
      status: 'unavailable',
      message: error?.message || 'Tax summary unavailable',
      totalIncome: enteredTotal,
      adjustments,
      deductionUsed: null,
    };
  }
}
