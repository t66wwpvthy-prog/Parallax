/* Attach federal 1040 tax summary for the typical (p50) scenario path only. */

import { ANNUAL_1040_MODULE_VERSION } from '../../tax/annual1040.js';
import { TaxInputError } from '../../tax/core/errors.js';
import { buildPlanMetaFromEngineParams, buildRowPlanMetaFromOptions } from './buildPlanMetaFromEngineParams.js';
import { buildRowTaxableGainPlanMeta } from './taxableBasisTracker.js';
import { runTaxForScenarioPath } from './runTaxForScenarioPath.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function assertAnalysis(analysis){
  if(analysis === null || typeof analysis !== 'object' || Array.isArray(analysis)){
    throw new TaxInputError('analysis must be a plain object', { received: typeof analysis });
  }
}

function isAccumulationRow(row, retirementAge){
  if(row.phase === 'accum') return true;
  if(retirementAge != null && row.age != null && row.age < retirementAge) return true;
  return false;
}

function selectRetirementRows(rows, retirementAge){
  if(!Array.isArray(rows)) return [];
  return rows.filter((row) => !isAccumulationRow(row, retirementAge));
}

function dedupeWarnings(warnings){
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.message}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptySummary(typical){
  const engineLifetimeTax = typical.lifetimeTax ?? null;
  return {
    path: 'p50',
    simIndex: typical.simIndex ?? null,
    moduleVersion: ANNUAL_1040_MODULE_VERSION,
    years: [],
    totals: {
      federalTaxLiability: 0,
      enginePathTax: 0,
      engineLifetimeTax,
      deltaVsEnginePath: 0,
      deltaVsEngineLifetime: engineLifetimeTax != null ? round2(-engineLifetimeTax) : null,
    },
    warnings: [],
    scope: 'INCOME_TAX_ONLY',
  };
}

/**
 * Run federal tax on analysis.paths.p50 retirement rows only.
 * Returns a slim summary — does not mutate analysis or engine tax fields.
 */
export function attachTypicalPathFederalTax(analysis, options = {}){
  assertAnalysis(analysis);

  const typical = analysis.paths?.p50;
  if(!typical || !Array.isArray(typical.rows)){
    throw new TaxInputError('analysis.paths.p50.rows is required');
  }

  const params = analysis.params ?? {};
  const retirementAge = params.retirementAge ?? params.currentAge ?? null;
  const rows = selectRetirementRows(typical.rows, retirementAge);
  if(rows.length === 0) return emptySummary(typical);

  const planMeta = buildPlanMetaFromEngineParams(params, options);
  const baseRowPlanMeta = buildRowPlanMetaFromOptions(options);
  const rowPlanMeta = options.taxableGainFraction !== undefined
    ? baseRowPlanMeta
    : buildRowTaxableGainPlanMeta(baseRowPlanMeta);
  const scenarioId = options.scenarioId ?? 'typical_path';

  const { results } = runTaxForScenarioPath(rows, planMeta, {
    contextOverrides: { ...(options.contextOverrides ?? {}), scenarioId },
    rowPlanMeta,
  });

  const years = [];
  const warnings = [];
  let federalTotal = 0;
  let enginePathTotal = 0;
  let scope = 'INCOME_TAX_ONLY';

  for(const entry of results){
    const sourceRow = rows[entry.rowIndex];
    const annual = entry.annual1040Result;
    const engineTax = sourceRow?.taxes ?? 0;
    const federalTaxLiability = annual.lines.line24.value ?? 0;

    federalTotal += federalTaxLiability;
    enginePathTotal += engineTax;
    scope = annual.federalSummary.taxTotalScope ?? scope;
    warnings.push(...(annual.warnings ?? []));

    years.push({
      year: entry.year,
      age: sourceRow?.age ?? null,
      agi: annual.lines.line11.value,
      taxableIncome: annual.lines.line15.value,
      federalTaxLiability,
      marginalRate: annual.federalSummary.marginalRate,
      engineTax: round2(engineTax),
      delta: round2(federalTaxLiability - engineTax),
    });
  }

  const engineLifetimeTax = typical.lifetimeTax ?? null;
  const federalTaxLiability = round2(federalTotal);
  const enginePathTax = round2(enginePathTotal);

  return {
    path: 'p50',
    simIndex: typical.simIndex ?? null,
    moduleVersion: ANNUAL_1040_MODULE_VERSION,
    years,
    totals: {
      federalTaxLiability,
      enginePathTax,
      engineLifetimeTax,
      deltaVsEnginePath: round2(federalTaxLiability - enginePathTax),
      deltaVsEngineLifetime: engineLifetimeTax != null
        ? round2(federalTaxLiability - engineLifetimeTax)
        : null,
    },
    warnings: dedupeWarnings(warnings),
    scope,
  };
}
