import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultPlan } from '../engine.js';
import { createAccount } from '../src/household/createAccount.js';
import { createBlankTaxProfiles } from '../src/household/factEnvelope.js';
import { buildHouseholdTaxFactContract } from '../src/planning/tax/buildHouseholdTaxFactContract.js';
import { renderHouseholdTaxFacts } from './householdTaxFacts.js';

function plan(){
  const value = structuredClone(defaultPlan);
  value.meta.filingStatus = 'marriedFilingJointly';
  value.meta.primaryName = 'Client';
  value.meta.spouseName = 'Co-Client';
  value.household.spouse = { currentAge: 60, retirementAge: 65, planEndAge: 95 };
  value.portfolio.extraAccounts = [];
  value.taxProfiles = createBlankTaxProfiles();
  return value;
}

function account(typeId, id, owner = 'client'){
  const value = createAccount(typeId, { owner, balance: 100000 });
  value.id = id;
  return value;
}

test('tax-detail renderer exposes only allowlisted scalar edits and honest scope copy', () => {
  const value = plan();
  value.portfolio.extraAccounts = [
    account('brokerage_taxable', 'broker'),
    account('traditional_ira', 'ira'),
    account('roth_ira', 'roth', 'spouse'),
    account('401k', 'work'),
    account('roth_401k', 'roth-work'),
    account('hsa', 'hsa'),
  ];
  const html = renderHouseholdTaxFacts(value, {
    uiState: { hhTaxDetailsOpen: true },
    taxFactContract: () => buildHouseholdTaxFactContract(value),
  });

  assert.match(html, /data-hh-tax-details-root open/);
  for(const kind of ['basis', 'owner-fact', 'account-fact']){
    assert.match(html, new RegExp(`data-hh-tax-edit="${kind}"`));
  }
  assert.match(html, /Saved for later/);
  assert.match(html, /HSA tax treatment is outside this phase/);
  assert.match(html, /option value="household-return" selected>Yes/);
  assert.doesNotMatch(html, /data-hh-tax-key="(?:conversionCohorts|inPlanRolloverCohorts)"/);
});

test('tax-detail renderer stays absent without material typed accounts and escapes account copy', () => {
  const empty = plan();
  assert.equal(renderHouseholdTaxFacts(empty, { uiState: {} }), '');

  const value = plan();
  const brokerage = account('brokerage_taxable', 'broker');
  brokerage.type = '<img src=x onerror=alert(1)>';
  value.portfolio.extraAccounts = [brokerage];
  const html = renderHouseholdTaxFacts(value, {
    uiState: {},
    taxFactContract: () => buildHouseholdTaxFactContract(value),
  });
  assert.doesNotMatch(html, /<img src=/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('tax-detail control IDs stay unique for account IDs with similar punctuation', () => {
  const value = plan();
  value.portfolio.extraAccounts = [
    account('brokerage_taxable', 'a/b'),
    account('brokerage_taxable', 'a-b'),
  ];
  const html = renderHouseholdTaxFacts(value, {
    uiState: {},
    taxFactContract: () => buildHouseholdTaxFactContract(value),
  });
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
