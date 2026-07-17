import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachCashFlowHistoricalPaths,
  normalizeCashFlowPathMode,
  mcPathKeyForMode,
  pathModeLabel,
  pickRandomSimIndex,
  selectedMcSimIndex,
  resolveCashFlowSim,
} from './cashFlowPathReplay.js';
import { defaultPlan, runSimulation } from '../../engine.js';

const analysis = {
  sims: [
    { simIndex: 0, rows: [{ age: 65 }] },
    { simIndex: 1, rows: [{ age: 65 }] },
    { simIndex: 2, rows: [{ age: 65 }] },
    { simIndex: 3, rows: [{ age: 65 }] },
  ],
  paths: { p50: { simIndex: 2 }, p75: { simIndex: 3 }, p10: { simIndex: 0 }, p90: { simIndex: 1 } },
  cashFlowHistorical: {
    'stressed-pp': { simIndex: -1, rows: [{ age: 66, source: 1966 }] },
    'sequence-dotcom-gfc': { simIndex: -2, rows: [{ age: 66, source: 2000 }] },
  },
};

const simByIndex = (res, idx) => res.sims.find(s => s.simIndex === idx) || res.sims[idx] || null;

test('normalizeCashFlowPathMode maps legacy values', () => {
  assert.equal(normalizeCashFlowPathMode('sequence-stress'), 'sequence-dotcom-gfc');
  assert.equal(normalizeCashFlowPathMode('stressed'), 'stressed-pp');
  assert.equal(normalizeCashFlowPathMode('bogus'), 'typical');
});

test('favorable maps to p75 not p90', () => {
  assert.equal(mcPathKeyForMode('favorable'), 'p75');
  assert.equal(selectedMcSimIndex(analysis, 'favorable', null), 3);
});

test('resolveCashFlowSim uses historical runs for stress modes', () => {
  const pp = resolveCashFlowSim(analysis, 'stressed-pp', null, simByIndex);
  assert.equal(pp?.rows?.[0]?.source, 1966);
  const seq = resolveCashFlowSim(analysis, 'sequence-dotcom-gfc', null, simByIndex);
  assert.equal(seq?.rows?.[0]?.source, 2000);
});

test('random mode uses chosen sim index', () => {
  assert.equal(selectedMcSimIndex(analysis, 'random', 1), 1);
  assert.equal(resolveCashFlowSim(analysis, 'random', 1, simByIndex)?.simIndex, 1);
});

test('pickRandomSimIndex returns a valid sim index', () => {
  const idx = pickRandomSimIndex(analysis, null);
  assert.ok(analysis.sims.some(s => s.simIndex === idx));
});

test('pathModeLabel uses product names', () => {
  assert.match(pathModeLabel('stressed-pp'), /purchasing power erosion/i);
  assert.match(pathModeLabel('random'), /Random path/);
});

test('attachCashFlowHistoricalPaths stores real historical runs', () => {
  const plan = structuredClone(defaultPlan);
  plan.meta.filingStatus = 'marriedFilingJointly';
  const analysis = runSimulation(plan, {}, undefined, { iterations: 20 });
  attachCashFlowHistoricalPaths(
    analysis,
    plan,
    {},
    { baseTaxYear: 2026, filingStatus: plan.meta.filingStatus, scenarioId: 'baseline' },
    'taxable-first'
  );
  assert.equal(analysis.cashFlowHistorical['stressed-pp']?.startYear, 1966);
  assert.equal(analysis.cashFlowHistorical['sequence-dotcom-gfc']?.startYear, 2000);
  assert.ok(Array.isArray(analysis.cashFlowHistorical['stressed-pp']?.rows));
});
