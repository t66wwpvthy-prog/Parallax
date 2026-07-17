/** Cash Flow path replay: MC percentiles, historical eras, and random draw. */

import { runHistoricalPathWithFederalTax } from './tax/runHistoricalPathWithFederalTax.js';

export const CASH_FLOW_PATH_MODES = Object.freeze([
  'typical',
  'favorable',
  'stressed-pp',
  'sequence-dotcom-gfc',
  'random',
]);

export const HISTORICAL_CASH_FLOW_START = Object.freeze({
  'stressed-pp': 1966,
  'sequence-dotcom-gfc': 2000,
});

export function normalizeCashFlowPathMode(mode){
  if(mode === 'sequence-stress') return 'sequence-dotcom-gfc';
  if(mode === 'stressed') return 'stressed-pp';
  return CASH_FLOW_PATH_MODES.includes(mode) ? mode : 'typical';
}

export function isHistoricalCashFlowMode(mode){
  const m = normalizeCashFlowPathMode(mode);
  return m === 'stressed-pp' || m === 'sequence-dotcom-gfc';
}

export function mcPathKeyForMode(mode){
  const m = normalizeCashFlowPathMode(mode);
  if(m === 'typical') return 'p50';
  if(m === 'favorable') return 'p75';
  return null;
}

export function pathModeLabel(mode = 'typical'){
  return ({
    typical: 'Typical path',
    favorable: 'Favorable path',
    'stressed-pp': 'Stressed',
    'sequence-dotcom-gfc': 'Sequence',
    random: 'Random path',
  })[normalizeCashFlowPathMode(mode)] || 'Typical path';
}

export function pickRandomSimIndex(analysis, avoidIndex = null){
  const ns = analysis?.sims?.length || 0;
  if(ns <= 0) return 0;
  if(ns === 1) return analysis.sims[0].simIndex ?? 0;
  let idx = Math.floor(Math.random() * ns);
  let guard = 0;
  while(avoidIndex != null && idx === avoidIndex && guard++ < 24){
    idx = Math.floor(Math.random() * ns);
  }
  const sim = analysis.sims[idx];
  return sim?.simIndex != null ? sim.simIndex : idx;
}

export function selectedMcSimIndex(analysis, mode, randomSimIndex){
  if(!analysis?.sims?.length) return 0;
  const normalized = normalizeCashFlowPathMode(mode);
  if(normalized === 'random'){
    if(Number.isInteger(randomSimIndex)){
      return analysis.sims.some(s => s.simIndex === randomSimIndex)
        ? randomSimIndex
        : (analysis.sims[randomSimIndex]?.simIndex ?? randomSimIndex);
    }
    return analysis.sims[0].simIndex ?? 0;
  }
  const key = mcPathKeyForMode(normalized);
  if(key && analysis.paths?.[key]?.simIndex != null) return analysis.paths[key].simIndex;
  return analysis.paths?.p50?.simIndex ?? (analysis.sims[0].simIndex ?? 0);
}

export function resolveCashFlowSim(analysis, mode, randomSimIndex, simByIndex){
  if(!analysis) return null;
  const normalized = normalizeCashFlowPathMode(mode);
  if(isHistoricalCashFlowMode(normalized)){
    return analysis.cashFlowHistorical?.[normalized] ?? null;
  }
  return simByIndex(analysis, selectedMcSimIndex(analysis, normalized, randomSimIndex));
}

export function attachCashFlowHistoricalPaths(analysis, plan, overrides, options, strategy){
  if(!analysis) return;
  analysis.cashFlowHistorical = {
    'stressed-pp': runHistoricalPathWithFederalTax(
      plan, HISTORICAL_CASH_FLOW_START['stressed-pp'], strategy, undefined, overrides, options
    ),
    'sequence-dotcom-gfc': runHistoricalPathWithFederalTax(
      plan, HISTORICAL_CASH_FLOW_START['sequence-dotcom-gfc'], strategy, undefined, overrides, options
    ),
  };
}
