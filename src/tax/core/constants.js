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
