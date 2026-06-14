/* ============================================================================
   COMPOSER: Annual Federal Tax  (composeAnnualFederalTax)
   Composers COMBINE rules and own the interactions between them. Rules stay
   narrow; the composer is where their outputs come together.

   Phase 1: this composer simply delegates to the ordinary income tax rule and
   collects its audit. As later rules land (capital-gains stacking, qualified
   dividends, taxable Social Security, …) the INTERACTIONS belong here — e.g.
   ordinary income setting the bracket floor that long-term gains stack on top
   of. We do not add those until each underlying rule exists and is tested.

   A composer never mutates input data and never recalculates law a rule owns.
   Zero dependency on engine.js.
   ============================================================================ */

import { ordinaryIncomeTax } from '../rules/ordinaryIncomeTax.js';

// Input (Phase 1): { filingStatus, taxableOrdinaryIncome }.
// Returns { result, audits } where `result` aggregates the component results and
// `audits` is the array of each underlying rule's audit trail (composers do not
// flatten away provenance — every number stays traceable to its rule).
export function composeAnnualFederalTax(input, context){
  const ordinary = ordinaryIncomeTax.calculate(input, context);

  // Phase 1 total = ordinary income tax only. As components are added, this sum
  // grows and the composer documents how the pieces interact.
  const totalFederalTax = ordinary.result.ordinaryTax;

  const result = {
    totalFederalTax,
    ordinaryIncomeTax: ordinary.result,
  };

  const audits = [ordinary.audit];

  return { result, audits };
}
