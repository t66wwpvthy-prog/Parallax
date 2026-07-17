import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cashflowColumns,
  normalizeCashBreakdown,
  renderCashflow,
} from './cashflow.js';

test('cashflowColumns summary is lean with clickable break keys', () => {
  const cols = cashflowColumns('summary');
  assert.deepEqual(cols.map(c => c.label), ['Year', 'Age', 'Income', 'Goals', 'Tax', 'Draw', 'Ending']);
  assert.deepEqual(
    cols.filter(c => c.breakKey).map(c => c.breakKey),
    ['income', 'goals', 'tax', 'draw'],
  );
});

test('income / draw / goals / tax breakdowns expose sourced columns', () => {
  assert.deepEqual(
    cashflowColumns('income').map(c => c.label),
    ['Year', 'Age', 'SS', 'Pension', 'Other', 'Income', 'Ending'],
  );
  assert.deepEqual(
    cashflowColumns('draw').map(c => c.id),
    ['year', 'age', 'taxableDraw', 'traditionalDraw', 'rothDraw', 'gain', 'rmd', 'draw', 'ending'],
  );
  assert.ok(cashflowColumns('goals').some(c => c.id === 'goalsRecurring'));
  assert.ok(cashflowColumns('tax').some(c => c.id === 'federalTax'));
});

test('normalizeCashBreakdown rejects unknown modes', () => {
  assert.equal(normalizeCashBreakdown('income'), 'income');
  assert.equal(normalizeCashBreakdown('nope'), 'summary');
  assert.equal(normalizeCashBreakdown(null), 'summary');
});

test('renderCashflow marks breakdown headers and summary restore', () => {
  const row = {
    year: 2026, age: 66, accum: false,
    ss: 20000, pension: 0, otherIncome: 0, income: 20000,
    rmd: 0, rmdRequired: 0, essential: 40000,
    goals: 5000, goalsRecurring: 5000, goalsOneTime: 0,
    tax: 3000, engineTax: 3000, draw: 10000,
    taxableDraw: 10000, traditionalDraw: 0, rothDraw: 0, gain: 4000,
    ret: 0.04, wdRate: 4, ending: 900000, shortfall: false, startPort: 1000000, goalTag: null,
  };
  const scn = { raw: { res: {} }, id: '0', name: 'Baseline', tone: '#c6a662', prob: 80, probStr: '80', median: '$900K' };
  const deps = {
    pathRows: () => [row],
    cashSummary: () => ({}),
    cashFromRetirement: false,
    cashBreakdown: 'income',
    isTypicalPath: () => false,
    typicalPathFederalTax: () => null,
    pathFederalTax: () => null,
    toneGlow: () => 'transparent',
    ring: () => '',
    wdColor: () => 'inherit',
    num: (n) => String(n),
    esc: (value) => String(value),
    fmtMoney: (n) => '$' + Math.round(n).toLocaleString('en-US'),
  };
  const html = renderCashflow(scn, [scn], deps);
  assert.match(html, /data-cf-mode="income"/);
  assert.match(html, /data-cf-breakdown-bar/);
  assert.match(html, /data-cf-breakdown="summary"/);
  assert.match(html, /SS/);
  assert.match(html, /Pension/);
});
