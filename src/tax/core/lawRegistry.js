/* Map calendar tax years to versioned federal law tables. */

import { LAW_VERSIONS } from './constants.js';
import { TaxDataError } from './errors.js';

const TAX_YEAR_TO_LAW = {
  2025: '2025_FINAL',
  2026: '2026_FINAL',
};

export function resolveLawVersionForTaxYear(taxYear){
  const lawVersion = TAX_YEAR_TO_LAW[taxYear];
  if(!lawVersion){
    throw new TaxDataError(`No lawVersion registered for taxYear ${taxYear}`, { taxYear });
  }
  if(!LAW_VERSIONS.includes(lawVersion)){
    throw new TaxDataError(`lawVersion ${lawVersion} is not in LAW_VERSIONS`, { lawVersion });
  }
  return lawVersion;
}

export function supportedTaxYears(){
  return Object.keys(TAX_YEAR_TO_LAW).map(Number).sort();
}

export function buildTaxContext(overrides = {}){
  const taxYear = overrides.taxYear ?? 2026;
  return {
    calculatedAt: overrides.calculatedAt ?? new Date().toISOString(),
    runId: overrides.runId ?? 'annual_1040',
    scenarioId: overrides.scenarioId ?? 'annual',
    ...overrides,
    taxYear,
    lawVersion: overrides.lawVersion ?? resolveLawVersionForTaxYear(taxYear),
  };
}
