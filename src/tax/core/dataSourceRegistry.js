/* ============================================================================
   TAX ENGINE — data-source registry
   The single place that describes each versioned tax-data dependency: what it
   is, where it came from, and its verification status. A rule names the data it
   used (audit.dataSourcesUsed); this registry lets anyone resolve that id back
   to a citable, dated source.

   Registry only — no calculation logic, no projections.
   ============================================================================ */

import { TaxDataError } from './errors.js';

// id → descriptor. `status` is one of: 'verified' | 'unverified'.
// 'unverified' means transcribed from the cited source but not yet checked
// against the primary document by a CFP / reviewer (see constants.js note).
export const DATA_SOURCES = {
  'IRS_2026_TAX_TABLES_v1.0': {
    id: 'IRS_2026_TAX_TABLES_v1.0',
    description: 'Federal ordinary income tax rate schedules, tax year 2026',
    authority: 'IRS Rev. Proc. 2025-32',
    taxYear: 2026,
    lawVersion: '2026_FINAL',
    status: 'unverified',
    retrievedAt: '2026-06-14',
  },
};

// Resolve a dataSourceId (e.g. 'IRS_2026_TAX_TABLES_v1.0') to its descriptor.
// Throws TaxDataError on an unknown id so a typo can never silently pass.
export function getDataSource(id){
  const entry = Object.values(DATA_SOURCES).find(s => s.id === id);
  if(!entry){
    throw new TaxDataError(`Unknown tax data source: ${id}`, { id });
  }
  return entry;
}
