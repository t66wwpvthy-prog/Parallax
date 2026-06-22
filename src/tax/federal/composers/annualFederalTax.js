/* ============================================================================
   COMPOSER: Annual Federal Tax  (composeAnnualFederalTax)
   ============================================================================ */

import {
  calculatedLine,
  deferredLine,
  lineAmount,
  LINE_STATUS,
  resolveTaxTotalScope,
} from '../../core/form1040Lines.js';
import { buildForm1040IncomeSpine } from './form1040Spine.js';
import { capitalGainsStacking } from '../rules/capitalGainsStacking.js';
import { ordinaryIncomeTax } from '../rules/ordinaryIncomeTax.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildTaxLines(input, context, form1040, ordinaryTaxableIncome, preferentialIncome, audits){
  const ordinaryInput = {
    filingStatus: input.filingStatus,
    taxableOrdinaryIncome: ordinaryTaxableIncome,
  };
  const ordinary = ordinaryIncomeTax.calculate(ordinaryInput, context);
  audits.push(ordinary.audit);

  let line16Tax = ordinary.result.ordinaryTax;
  let line16RuleId = 'FED_ORDINARY_INCOME_TAX';
  let line16AuditIndex = audits.length - 1;

  if(input.capitalGains && preferentialIncome > 0){
    const capitalGains = capitalGainsStacking.calculate({
      filingStatus: input.filingStatus,
      ordinaryTaxableIncome,
      netLongTermCapitalGains: input.capitalGains.netLongTermCapitalGains ?? 0,
      qualifiedDividends: input.capitalGains.qualifiedDividends ?? 0,
    }, context);
    audits.push(capitalGains.audit);
    line16Tax = round2(line16Tax + capitalGains.result.preferentialIncomeTax);
    line16RuleId = 'FED_ORDINARY_INCOME_TAX+FED_CAPITAL_GAINS_STACKING';
  }

  const line16 = calculatedLine('line16', line16Tax, {
    ruleId: line16RuleId,
    auditIndex: line16AuditIndex,
  });

  const line17 = deferredLine('line17');
  const line18 = calculatedLine('line18', round2(lineAmount(line16) + lineAmount(line17)));
  const line19 = deferredLine('line19');
  const line20 = deferredLine('line20');
  const line21 = (line19.status === LINE_STATUS.DEFERRED && line20.status === LINE_STATUS.DEFERRED)
    ? deferredLine('line21')
    : calculatedLine('line21', round2(lineAmount(line19) + lineAmount(line20)));
  const line22 = calculatedLine('line22', Math.max(0, round2(lineAmount(line18) - lineAmount(line21))));
  const line23 = deferredLine('line23');
  const line24 = calculatedLine('line24', round2(lineAmount(line22) + lineAmount(line23)));

  return {
    ...form1040,
    line16,
    line17,
    line18,
    line19,
    line20,
    line21,
    line22,
    line23,
    line24,
  };
}

export function composeAnnualFederalTax(input, context){
  const { form1040: incomeSpine, ordinaryTaxableIncome, preferentialIncome, audits } =
    buildForm1040IncomeSpine(input, context);

  const form1040 = buildTaxLines(
    input,
    context,
    incomeSpine,
    ordinaryTaxableIncome,
    preferentialIncome,
    audits
  );

  const totalFederalTax = form1040.line24.value;
  const taxTotalScope = resolveTaxTotalScope(form1040);

  return {
    result: {
      form1040,
      totalFederalTax,
      taxTotalScope,
    },
    audits,
  };
}
