import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculate,
  meta,
  validate,
} from './qualifiedRothDistribution.js';

test('qualified Roth rule requires both age 59.5 and five completed taxable years', () => {
  const qualified = calculate({
    distributionDate: '2026-01-01',
    ownerBirthDate: '1960-07-01',
    firstContributionYear: 2021,
  }).result;
  assert.deepEqual(qualified, {
    qualified: true,
    ageTestMet: true,
    fiveYearTestMet: true,
    ageQualificationDate: '2020-01-01',
  });

  assert.equal(calculate({
    distributionDate: '2026-01-01',
    ownerBirthDate: '1966-07-02',
    firstContributionYear: 2021,
  }).result.qualified, false);
  assert.equal(calculate({
    distributionDate: '2026-01-01',
    ownerBirthDate: '1960-07-01',
    firstContributionYear: 2022,
  }).result.qualified, false);
});

test('age 59.5 is tested against the exact conservative distribution date', () => {
  assert.equal(calculate({
    distributionDate: '2026-01-01',
    ownerBirthDate: '1966-07-01',
    firstContributionYear: 2020,
  }).result.qualified, true);
  assert.equal(calculate({
    distributionDate: '2026-01-01',
    ownerBirthDate: '1966-07-02',
    firstContributionYear: 2020,
  }).result.qualified, false);
});

test('qualified Roth rule exposes its supported route and rejects impossible years', () => {
  assert.equal(meta.ruleId, 'FED_QUALIFIED_ROTH_DISTRIBUTION');
  assert.ok(meta.limitations.some(item => item.includes('age 59.5')));
  assert.throws(() => validate({
    distributionDate: '2026-01-01',
    ownerBirthDate: '1960-07-01',
    firstContributionYear: 2027,
  }), /cannot be after/);
  assert.throws(() => validate({
    distributionDate: '2026-02-30',
    ownerBirthDate: '1960-07-01',
    firstContributionYear: 2020,
  }), /valid ISO date/);
});
