import { buildDefaultTaxContext, runClient1040Intake } from '../../tax/annual1040.js';
import {
  enteredAdjustmentTotal,
  enteredDeductionTotal,
  isSourceActiveNow,
  normalizedIncomeSource,
} from '../../household/incomeTaxModel.js';
import { CAPITAL_GAINS_THRESHOLDS, ORDINARY_BRACKETS } from '../../tax/core/constants.js';

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
    else if(source.typeId === 'dividends'){
      add(income, 'ordinaryDividends', amount);
      add(income, 'qualifiedDividends', amount * Math.max(0, Math.min(1, source.qualifiedPct || 0)));
    }else if(source.typeId === 'long_term_capital_gains'){
      add(income, 'capitalGain', amount);
    }else if(source.typeId === 'short_term_capital_gains'){
      add(income, 'otherIncome', amount);
    }else if(source.typeId === 'pension' || source.typeId === 'annuity'){
      add(income, 'pensionAmount', amount);
      add(income, 'taxablePensions', amount * Math.max(0, Math.min(1, source.taxablePct ?? 1)));
    }else if(source.typeId === 'rental'){
      add(income, 'otherIncome', source.netTaxable == null
        ? amount * Math.max(0, Math.min(1, source.taxablePct ?? 1))
        : source.netTaxable);
    }else add(income, 'otherIncome', amount * Math.max(0, Math.min(1, source.taxablePct ?? 1)));
  }

  const realizedGains = plan.incomeTax?.realizedGains || {};
  add(income, 'otherIncome', Math.max(0, Number(realizedGains.shortTerm) || 0));
  add(income, 'capitalGain', Math.max(0, Number(realizedGains.longTerm) || 0));

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
    key === 'qualifiedDividends' || key === 'taxablePensions' || key === 'socialSecurity'
      ? sum
      : sum + (Number(value) || 0), 0);
}

function socialSecurityOtherIncome(income){
  return ['wages', 'taxableInterest', 'ordinaryDividends', 'taxablePensions', 'capitalGain', 'otherIncome']
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
    .find(row => ['medical', 'salt', 'state_local_income_tax', 'real_estate_tax', 'personal_property_tax'].includes(row.typeId) && Number(row.amount) > 0);
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

export function buildCurrentIncomeTaxSummary(plan){
  const filingStatus = plan.meta?.filingStatus;
  const income = currentIncome(plan);
  const adjustments = enteredAdjustmentTotal(plan);
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
    const ordinaryTaxableIncome = ordinaryAudit?.inputsUsed?.taxableOrdinaryIncome;
    const bracket = ORDINARY_BRACKETS['2026_FINAL']?.[filingStatus]
      ?.find(row => ordinaryTaxableIncome <= row.upTo);
    const ordinaryBracketRoom = bracket && Number.isFinite(bracket.upTo)
      ? Math.max(0, bracket.upTo - ordinaryTaxableIncome)
      : null;
    const capitalRate = capAudit?.calculationSteps?.at(-1)?.rate ?? null;
    const capitalThresholds = CAPITAL_GAINS_THRESHOLDS['2026_FINAL']?.[filingStatus];
    let capitalGainsCaption = '';
    if(capitalRate != null && capitalThresholds){
      capitalGainsCaption = capitalRate === 0
        ? `$${Math.max(0, capitalThresholds.zeroRateMax - annual.federalSummary.taxableIncome).toLocaleString('en-US')} of room in the 0% band`
        : capitalRate === 0.15
          ? `0% band exceeded by $${Math.max(0, annual.federalSummary.taxableIncome - capitalThresholds.zeroRateMax).toLocaleString('en-US')}`
          : 'Income is in the 20% preferential band';
    }
    const primaryAge = plan.household?.primary?.currentAge ?? 0;
    const spouseAge = plan.household?.spouse?.currentAge ?? null;
    const hasSenior = primaryAge >= 65 || (spouseAge != null && spouseAge >= 65);
    return {
      status: 'ready',
      totalIncome: enteredTotal,
      adjustments,
      deductionUsed: annual.lines.line15.value == null ? null : Math.max(standardDeduction, itemizedDeduction),
      deductionMethod: itemizedDeduction > standardDeduction ? 'Itemized' : 'Standard',
      adjustedGrossIncome: annual.federalSummary.adjustedGrossIncome,
      taxableIncome: annual.federalSummary.taxableIncome,
      federalTaxLiability: annual.federalSummary.federalTaxLiability,
      marginalRate: annual.federalSummary.marginalRate ?? bracket?.rate ?? null,
      effectiveRate: annual.federalSummary.effectiveRate,
      capitalGainsRate: capitalRate,
      ordinaryBracketRoom,
      capitalGainsCaption,
      seniorDeductionStatus: hasSenior ? 'Not calculated' : 'Not applicable',
      seniorDeductionCaption: hasSenior
        ? 'current engine does not yet apply the age-65+ deduction'
        : 'no household member is currently 65+',
      rmdFirstYear: 2026 + Math.max(0, 73 - primaryAge),
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
