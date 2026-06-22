/* ============================================================================
   TAX ENGINE — law data (constants)
   Versioned, citable tax-law values. This file holds DATA, never calculation
   logic. Rules read these tables; they do not hard-code numbers themselves.

   Each table is addressed by a (lawVersion → filingStatus) key and tagged with
   a dataSourceId so a result's audit can name exactly which data produced it.

   ⚠ VERIFICATION: The 2026 bracket thresholds below are transcribed from the
   IRS 2026 inflation-adjusted schedules (Rev. Proc. 2025-32). They are flagged
   for CFP / primary-source verification before this rule is trusted for client
   work — mirroring engine.js's treatment of the RMD Uniform Lifetime table.
   The bracket-stacking MATH is independently unit-tested regardless of these
   exact figures; swapping in verified numbers changes only the data, not logic.
   ============================================================================ */

// Recognized filing statuses (the only legal enum the engine accepts).
export const FILING_STATUSES = ['single', 'marriedFilingJointly', 'headOfHousehold', 'marriedFilingSeparately'];

// Recognized law regimes/scenarios. lawVersion separates "what code ran"
// (ruleVersion) from "which legal regime applies."
export const LAW_VERSIONS = ['2026_FINAL'];

// Controlled vocabulary for rule meta.triggerTags. These let Parallax query the
// ledger ("which rules move on a Roth conversion / trigger at age 73 / depend on
// AGI?"). Keeping them in one enum prevents tag drift across rules; the ledger
// test asserts every rule's tags are drawn from this set. Extend deliberately as
// new rules need new tags.
export const TRIGGER_TAGS = [
  'agi_threshold',
  'bracket_calculation',
  'roth_conversion',
  'charitable_planning',
  'ira_deductibility',
  'retirement_contribution',
  'capital_gains',
  'qualified_dividends',
  'social_security_taxation',
  'provisional_income',
  'standard_deduction',
];

// Ordinary-income brackets. Each entry: { rate, upTo } where `upTo` is the
// INCLUSIVE upper bound of taxable ordinary income taxed at `rate`. The final
// bracket uses Infinity. Brackets are ascending and contiguous from 0.
//
// Keyed: ORDINARY_BRACKETS[lawVersion][filingStatus]
export const ORDINARY_BRACKETS = {
  '2026_FINAL': {
    single: [
      { rate: 0.10, upTo: 12400 },
      { rate: 0.12, upTo: 50400 },
      { rate: 0.22, upTo: 105700 },
      { rate: 0.24, upTo: 201775 },
      { rate: 0.32, upTo: 256225 },
      { rate: 0.35, upTo: 640600 },
      { rate: 0.37, upTo: Infinity },
    ],
    marriedFilingJointly: [
      { rate: 0.10, upTo: 24800 },
      { rate: 0.12, upTo: 100800 },
      { rate: 0.22, upTo: 211400 },
      { rate: 0.24, upTo: 403550 },
      { rate: 0.32, upTo: 512450 },
      { rate: 0.35, upTo: 768700 },
      { rate: 0.37, upTo: Infinity },
    ],
    headOfHousehold: [
      { rate: 0.10, upTo: 17700 },
      { rate: 0.12, upTo: 67450 },
      { rate: 0.22, upTo: 105700 },
      { rate: 0.24, upTo: 201775 },
      { rate: 0.32, upTo: 256200 },
      { rate: 0.35, upTo: 640600 },
      { rate: 0.37, upTo: Infinity },
    ],
    marriedFilingSeparately: [
      { rate: 0.10, upTo: 12400 },
      { rate: 0.12, upTo: 50400 },
      { rate: 0.22, upTo: 105700 },
      { rate: 0.24, upTo: 201775 },
      { rate: 0.32, upTo: 256225 },
      { rate: 0.35, upTo: 384350 },
      { rate: 0.37, upTo: Infinity },
    ],
  },
};

// Maps a lawVersion to the dataSourceId that the bracket table came from. The
// rule records this in its audit (dataSourcesUsed) so the same inputs + same
// lawVersion + same data id reproduce the same result.
export const ORDINARY_BRACKETS_SOURCE = {
  '2026_FINAL': 'IRS_2026_TAX_TABLES_v1.0',
};

export const CAPITAL_GAINS_THRESHOLDS = {
  '2026_FINAL': {
    single: { zeroRateMax: 49450, fifteenRateMax: 545500 },
    marriedFilingJointly: { zeroRateMax: 98900, fifteenRateMax: 613700 },
    headOfHousehold: { zeroRateMax: 66200, fifteenRateMax: 579600 },
    marriedFilingSeparately: { zeroRateMax: 49450, fifteenRateMax: 306850 },
  },
};

export const CAPITAL_GAINS_THRESHOLDS_SOURCE = {
  '2026_FINAL': 'IRS_2026_CAPITAL_GAINS_RATES_v1.0',
};

export const TRADITIONAL_IRA_LIMITS = {
  '2026_FINAL': {
    baseContributionLimit: 7500,
    catchUpAge: 50,
    catchUpContribution: 1100,
    phaseouts: {
      activeParticipant: {
        single: { fullDeductionUpTo: 81000, noDeductionAtOrAbove: 91000 },
        headOfHousehold: { fullDeductionUpTo: 81000, noDeductionAtOrAbove: 91000 },
        marriedFilingJointly: { fullDeductionUpTo: 129000, noDeductionAtOrAbove: 149000 },
        marriedFilingSeparately: { fullDeductionUpTo: 0, noDeductionAtOrAbove: 10000 },
      },
      spouseActiveParticipant: {
        marriedFilingJointly: { fullDeductionUpTo: 242000, noDeductionAtOrAbove: 252000 },
        marriedFilingSeparately: { fullDeductionUpTo: 0, noDeductionAtOrAbove: 10000 },
      },
    },
  },
};

export const TRADITIONAL_IRA_LIMITS_SOURCE = {
  '2026_FINAL': 'IRS_2026_IRA_LIMITS_v1.0',
};

export const SOCIAL_SECURITY_TAXATION_THRESHOLDS = {
  '2026_FINAL': {
    single: { baseAmount: 25000, additionalAmount: 9000 },
    headOfHousehold: { baseAmount: 25000, additionalAmount: 9000 },
    marriedFilingJointly: { baseAmount: 32000, additionalAmount: 12000 },
    marriedFilingSeparatelyLivedApart: { baseAmount: 25000, additionalAmount: 9000 },
    marriedFilingSeparatelyLivedTogether: { baseAmount: 0, additionalAmount: 0 },
  },
};

export const SOCIAL_SECURITY_TAXATION_SOURCE = {
  '2026_FINAL': 'IRC_86_SOCIAL_SECURITY_TAXATION_v1.0',
};

export const STANDARD_DEDUCTION = {
  '2026_FINAL': {
    single: 15750,
    marriedFilingJointly: 31500,
    headOfHousehold: 23625,
    marriedFilingSeparately: 15750,
  },
};

export const STANDARD_DEDUCTION_SOURCE = {
  '2026_FINAL': 'IRS_2026_STANDARD_DEDUCTION_v1.0',
};
