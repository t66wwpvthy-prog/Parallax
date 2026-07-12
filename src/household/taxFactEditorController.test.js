import test from 'node:test';
import assert from 'node:assert/strict';

import { taxFactEditFromControl } from './taxFactEditorController.js';

function control(value, dataset){
  return { value, dataset };
}

test('tax detail controls preserve zero and parse formatted basis amounts', () => {
  assert.deepEqual(taxFactEditFromControl(control('$1,234', {
    hhTaxEdit: 'basis', hhTaxAccountId: 'broker',
  })), {
    kind: 'confirm-account-basis', accountId: 'broker', value: 1234,
  });
  assert.equal(taxFactEditFromControl(control('0', {
    hhTaxEdit: 'basis', hhTaxAccountId: 'broker',
  })).value, 0);
  assert.deepEqual(taxFactEditFromControl(control('', {
    hhTaxEdit: 'basis', hhTaxAccountId: 'broker',
  })), {
    kind: 'clear-account-basis', accountId: 'broker',
  });
});

test('tax detail controls map reporting and scalar fact values to domain edits', () => {
  assert.deepEqual(taxFactEditFromControl(control('', {
    hhTaxEdit: 'reporting', hhTaxAccountId: 'joint',
  })), {
    kind: 'set-account-tax-reporting', accountId: 'joint', inclusion: 'unknown',
  });
  assert.deepEqual(taxFactEditFromControl(control('false', {
    hhTaxEdit: 'account-fact', hhTaxAccountId: 'work',
    hhTaxGroup: 'employerPlanFacts', hhTaxKey: 'planSubtypeConfirmed',
    hhTaxSemantic: 'boolean',
  })), {
    kind: 'confirm-account-fact', accountId: 'work',
    group: 'employerPlanFacts', key: 'planSubtypeConfirmed', value: false,
  });
  assert.deepEqual(taxFactEditFromControl(control('1999', {
    hhTaxEdit: 'owner-fact', hhTaxOwner: 'client', hhTaxGroup: 'rothIra',
    hhTaxKey: 'firstContributionYear', hhTaxSemantic: 'year',
  })), {
    kind: 'confirm-owner-fact', owner: 'client', group: 'rothIra',
    key: 'firstContributionYear', value: 1999,
  });
});

test('invalid or incomplete tax detail controls fail before reaching the domain layer', () => {
  assert.throws(() => taxFactEditFromControl(control('maybe', {
    hhTaxEdit: 'owner-fact', hhTaxOwner: 'client', hhTaxGroup: 'profile',
    hhTaxKey: 'blind', hhTaxSemantic: 'boolean',
  })), /Choose Yes/);
  assert.throws(() => taxFactEditFromControl(control('10', {
    hhTaxEdit: 'account-fact', hhTaxAccountId: 'work',
  })), /hhTaxSemantic/);
});
