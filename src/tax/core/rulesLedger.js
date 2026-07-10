/* TAX ENGINE — rules ledger (registry only). */

import { ordinaryIncomeTax } from '../federal/rules/ordinaryIncomeTax.js';
import { standardDeduction } from '../federal/rules/standardDeduction.js';
import { traditionalIraDeductibility } from '../federal/rules/traditionalIraDeductibility.js';
import { capitalGainsStacking } from '../federal/rules/capitalGainsStacking.js';
import { scheduleDClassification } from '../federal/rules/scheduleDClassification.js';
import { taxableSocialSecurity } from '../federal/rules/taxableSocialSecurity.js';

export const rulesLedger = [
  ordinaryIncomeTax,
  standardDeduction,
  traditionalIraDeductibility,
  capitalGainsStacking,
  scheduleDClassification,
  taxableSocialSecurity,
];

export function getRuleById(ruleId){
  return rulesLedger.find(r => r.meta.ruleId === ruleId) || null;
}

export function getRulesByTriggerTag(tag){
  return rulesLedger.filter(r => (r.meta.triggerTags || []).includes(tag));
}
