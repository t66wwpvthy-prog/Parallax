import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultPlan } from '../engine.js';
import { renderHouseholdIncomeTax } from './householdIncomeTax.js';

function plan(){
  const value = structuredClone(defaultPlan);
  value.meta.filingStatus = 'marriedFilingJointly';
  value.meta.primaryName = 'Client 1';
  value.meta.spouseName = 'Client 2';
  value.household.primary = { currentAge:64, retirementAge:67, planEndAge:95 };
  value.household.spouse = { currentAge:63, retirementAge:66, planEndAge:95 };
  value.income.other = [];
  value.incomeTax = { adjustments:[], deductions:[], deductionMode:'auto' };
  return value;
}

const deps = {
  field: (path, type) => `<input data-path="${path}" data-type="${type}">`,
  incomeTaxSummary: () => ({
    status:'ready', totalIncome:0, adjustedGrossIncome:0, deductionUsed:31500,
    deductionMethod:'Standard', taxableIncome:0, marginalRate:0.1,
    capitalGainsRate:null, federalTaxLiability:0, effectiveRate:0,
    seniorDeductionStatus:'Not applicable', rmdFirstYear:2035,
  }),
};

test('income add flow exposes the complete timing and conditional-tax contract', () => {
  const html = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey:'income' });
  for(const key of [
    'type','owner','amount','startAge','endAge','growthPct','interestTreatment',
    'qualifiedPct','taxablePct','netTaxable',
  ]) assert.match(html, new RegExp(`data-hh-draft="${key}"`), key);
  for(const type of [
    'wages','bonus','self_employment','social_security','pension','annuity','rental',
    'interest','dividends','short_term_capital_gains','long_term_capital_gains',
    'deferred_comp','other',
  ]) assert.match(html, new RegExp(`option value="${type}"`), type);
});

test('adjustment and deduction add flows expose their full approved vocabularies', () => {
  const adjustment = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey:'adjustment' });
  assert.match(adjustment, /data-hh-draft="whileWorkingOnly"/);
  for(const type of ['401k','hsa','ira_deduction','other']){
    assert.match(adjustment, new RegExp(`option value="${type}"`));
  }

  const deduction = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey:'deduction' });
  for(const type of [
    'medical','charitable','mortgage_interest','investment_interest',
    'state_local_income_tax','real_estate_tax','personal_property_tax','other',
  ]) assert.match(deduction, new RegExp(`option value="${type}"`), type);
});

test('tax position retains all six required reference outputs without inventing unsupported rules', () => {
  const html = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey:null });
  for(const label of [
    'FEDERAL MARGINAL BRACKET','CAPITAL GAINS RATE','NEXT IRMAA TIER',
    'SENIOR DEDUCTION (65+)','EFFECTIVE TAX RATE','RMDS BEGIN',
  ]) assert.ok(html.includes(label), label);
  assert.match(html, /requires Medicare threshold rule support/);
});
