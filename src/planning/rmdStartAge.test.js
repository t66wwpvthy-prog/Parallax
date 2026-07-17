import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRmdStartAge,
  getRmdStartAgeFromBirthDate,
  inferBirthYear,
} from './rmdStartAge.js';

test('SECURE 2.0 RMD start ages by birth year', () => {
  assert.equal(getRmdStartAge(1960), 75);
  assert.equal(getRmdStartAge(1962), 75);
  assert.equal(getRmdStartAge(1959), 73);
  assert.equal(getRmdStartAge(1951), 73);
  assert.equal(getRmdStartAge(1950), 72);
  assert.equal(getRmdStartAge(1949), 72);
  assert.equal(getRmdStartAge(1948), 70.5);
  assert.equal(getRmdStartAge(null), null);
});

test('birth-date rule keeps the 1949 mid-year edge', () => {
  assert.equal(getRmdStartAgeFromBirthDate('1949-06-30'), 70.5);
  assert.equal(getRmdStartAgeFromBirthDate('1949-07-01'), 72);
  assert.equal(getRmdStartAgeFromBirthDate('1960-07-01'), 75);
});

test('inferBirthYear derives year from current age', () => {
  assert.equal(inferBirthYear(64, 2026), 1962);
  assert.equal(inferBirthYear(63, 2026), 1963);
  assert.equal(getRmdStartAge(inferBirthYear(64, 2026)), 75);
});
