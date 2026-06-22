/* TAX ENGINE — data-source registry (registry only, no calculations). */

import { TaxDataError } from './errors.js';

export const DATA_SOURCES = {
  IRS_2026_TAX_TABLES_v1_0: {
    id: 'IRS_2026_TAX_TABLES_v1.0',
    description: 'Federal ordinary income tax rate schedules, tax year 2026',
    authority: 'IRS Rev. Proc. 2025-32',
    taxYear: 2026,
    lawVersion: '2026_FINAL',
    status: 'unverified',
    retrievedAt: '2026-06-14',
  },
  IRS_2026_CAPITAL_GAINS_RATES_v1_0: {
    id: 'IRS_2026_CAPITAL_GAINS_RATES_v1.0',
    description: 'Federal long-term capital gains and qualified dividend threshold amounts, tax year 2026',
    authority: 'IRS Rev. Proc. 2025-32',
    taxYear: 2026,
    lawVersion: '2026_FINAL',
    status: 'unverified',
    retrievedAt: '2026-06-19',
  },
  IRS_2026_IRA_LIMITS_v1_0: {
    id: 'IRS_2026_IRA_LIMITS_v1.0',
    description: 'Traditional IRA contribution limits and deductibility phaseout ranges, tax year 2026',
    authority: 'IRS Notice 2025-67; IRS Publication 590-A (2025), What\'s New for 2026',
    taxYear: 2026,
    lawVersion: '2026_FINAL',
    status: 'unverified',
    retrievedAt: '2026-06-19',
  },
  IRC_86_SOCIAL_SECURITY_TAXATION_v1_0: {
    id: 'IRC_86_SOCIAL_SECURITY_TAXATION_v1.0',
    description: 'Social Security taxable-benefit base amounts and 50% / 85% worksheet mechanics',
    authority: 'IRC section 86; IRS Publication 915 worksheet mechanics',
    taxYear: 2026,
    lawVersion: '2026_FINAL',
    status: 'unverified',
    retrievedAt: '2026-06-19',
  },
  IRS_2026_STANDARD_DEDUCTION_v1_0: {
    id: 'IRS_2026_STANDARD_DEDUCTION_v1.0',
    description: 'Federal standard deduction amounts by filing status, tax year 2026',
    authority: 'IRS Form 1040 (2025); Rev. Proc. 2025-32',
    taxYear: 2026,
    lawVersion: '2026_FINAL',
    status: 'unverified',
    retrievedAt: '2026-06-21',
  },
};

export function getDataSource(id){
  const entry = Object.values(DATA_SOURCES).find(s => s.id === id);
  if(!entry){
    throw new TaxDataError(`Unknown tax data source: ${id}`, { id });
  }
  return entry;
}
