/* ============================================================================
   TAX ENGINE — rules ledger (master registry)
   The canonical, queryable + executable registry of every implemented rule.
   REGISTRY ONLY: no calculations, no projections, no optimization, no
   dependency resolution. (See docs/TaxEngineEngineJsBoundary.md.)
   ============================================================================ */

import { ordinaryIncomeTax } from '../federal/rules/ordinaryIncomeTax.js';

export const rulesLedger = [
  ordinaryIncomeTax,
];

// Find a rule object by its meta.ruleId (e.g. 'FED_ORDINARY_INCOME_TAX').
export function getRuleById(ruleId){
  return rulesLedger.find(r => r.meta.ruleId === ruleId) || null;
}

// Query the ledger by trigger tag (e.g. 'age_73', 'agi_threshold'). Lets
// Parallax ask "which rules are affected by AGI / trigger at 73 / move on a
// Roth conversion?" without the ledger itself knowing any tax math.
export function getRulesByTriggerTag(tag){
  return rulesLedger.filter(r => (r.meta.triggerTags || []).includes(tag));
}
