import { escHtml } from './dom.js';
import {
  ADJUSTMENT_TYPES,
  CREDIT_TYPES,
  DEDUCTION_TYPES,
  INCOME_SOURCE_TYPES,
  adjustmentType,
  creditType,
  deductionType,
  enteredAdjustmentTotal,
  enteredCreditTotal,
  enteredDeductionTotal,
  enteredIncomeTotal,
  incomePhase,
  incomeType,
  isAdjustmentActiveNow,
  ownerLabel,
} from '../src/household/incomeTaxModel.js';

const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');
const rate = value => value == null ? '—' : `${Math.round(value * 1000) / 10}%`;
const ADDABLE_INCOME_SOURCE_TYPES = INCOME_SOURCE_TYPES.filter(row => row.id !== 'social_security');

function options(rows){
  return rows.map(row => `<option value="${row.id}">${escHtml(row.label)}</option>`).join('');
}

function ownerOptions(plan, selected){
  const rows = [['client', plan.meta?.primaryName || 'Client 1']];
  if(plan.household?.spouse) rows.push(['spouse', plan.meta?.spouseName || 'Client 2']);
  rows.push(['joint', 'Joint']);
  return rows.map(([value, label]) =>
    `<option value="${value}" ${value === selected ? 'selected' : ''}>${escHtml(label)}</option>`).join('');
}

function tinySelect(path, value, html, label){
  return `<select class="hh-it-inline-select" data-path="${path}" data-type="text" aria-label="${escHtml(label)}">${html}</select>`;
}

function sourceRow(plan, deps, source, index){
  const base = `income.other.${index}`;
  const type = incomeType(source.typeId);
  const currentYearOnly = type.timing === 'current';
  const taxNote = source.typeId === 'dividends'
    ? `qualified ${deps.field(`${base}.qualifiedPct`, 'pct')}`
    : source.typeId === 'tax_exempt_interest'
      ? 'current year · tax-exempt'
      : source.typeId === 'ira_distribution'
        ? `current year · ${deps.field(`${base}.taxablePct`, 'pct')} taxable`
        : source.typeId === 'roth_conversion'
          ? `current year · ${deps.field(`${base}.taxablePct`, 'pct')} taxable · strategy conversions downstream`
          : source.typeId === 'short_term_capital_gain'
            ? 'current year · ordinary-rate gain'
            : source.typeId === 'long_term_capital_gain'
              ? 'current year · preferential-rate gain'
    : ['interest', 'pension', 'annuity', 'deferred_comp', 'other'].includes(source.typeId)
      ? `${deps.field(`${base}.taxablePct`, 'pct')} taxable`
      : source.typeId === 'self_employment'
        ? 'net taxable · SE tax needs facts'
        : source.typeId === 'rental' ? 'net taxable' : 'taxable';
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy">
      <span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(source.label || type.label)}" aria-label="Income source name"></span>
      <span class="hh-it-row__meta">
        ${tinySelect(`${base}.owner`, source.owner, ownerOptions(plan, source.owner), 'Income owner')}
        ${currentYearOnly
          ? `<span>·</span><span>${taxNote}</span>`
          : `<span>·</span><span>${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'ageOrLife')}</span><span>·</span><span>${deps.field(`${base}.realGrowth`, 'signedPct')} /yr</span><span>·</span><span>${taxNote}</span>`}
      </span>
    </span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span><button class="row-x" data-rmpath="${base}" title="Remove income source">×</button></span>
  </div>`;
}

function socialSecurityRow(plan, deps, role){
  const key = role === 'spouse' ? 'spouse' : 'primary';
  const block = plan.income?.socialSecurity?.[key];
  if(!block || (role === 'spouse' && !plan.household?.spouse)) return '';
  const base = `income.socialSecurity.${key}`;
  const owner = role === 'spouse' ? 'spouse' : 'client';
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">Social Security</span><span class="hh-it-row__meta">${escHtml(ownerLabel(plan, owner))} · from ${deps.field(`${base}.claimAge`, 'age', { min:62, max:70 })} · COLA · <em>taxable auto</em></span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.pia`, 'money')}</span></span>
  </div>`;
}

function adjustmentRow(plan, deps, row, index){
  const base = `incomeTax.adjustments.${index}`;
  const type = adjustmentType(row.typeId);
  const active = isAdjustmentActiveNow(plan, row);
  return `<div class="hh-it-row${active ? '' : ' hh-it-row--inactive'}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(row.label || type.label)}" aria-label="Adjustment name"></span><span class="hh-it-row__meta">${tinySelect(`${base}.owner`, row.owner || 'client', ownerOptions(plan, row.owner || 'client'), 'Adjustment owner')} · ${escHtml(type.note)}${active ? '' : ' · not in this year\'s AGI'}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span><button class="row-x" data-rmpath="${base}" title="Remove adjustment">×</button></span>
  </div>`;
}

function deductionRow(deps, row, index){
  const base = `incomeTax.deductions.${index}`;
  const type = deductionType(row.typeId);
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy"><span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(row.label || type.label)}" aria-label="Deduction name"></span>${type.note ? `<span class="hh-it-row__meta">${escHtml(type.note)}</span>` : ''}</span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span><button class="row-x" data-rmpath="${base}" title="Remove deduction">×</button></span>
  </div>`;
}

function creditRow(deps, row, index){
  const base = `incomeTax.credits.${index}`;
  const type = creditType(row.typeId);
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy"><span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(row.label || type.label)}" aria-label="Credit name"></span><span class="hh-it-row__meta">${escHtml(type.note)}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span><button class="row-x" data-rmpath="${base}" title="Remove credit">×</button></span>
  </div>`;
}

function addForm(key, plan){
  if(key === 'income') return `<div class="hh-it-add-form hh-it-add-form--income" data-add-kind="income">
    <label><span>Source</span><select data-hh-draft="type" aria-label="Income type">${options(ADDABLE_INCOME_SOURCE_TYPES)}</select></label>
    <label><span>Owner</span><select data-hh-draft="owner" aria-label="Income owner">${ownerOptions(plan, 'client')}</select></label>
    <label><span>Annual amount</span><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual amount"></span></label>
    <label data-hide-for-income-types="tax_exempt_interest ira_distribution roth_conversion short_term_capital_gain long_term_capital_gain"><span>Start age</span><input type="number" data-hh-draft="startAge" min="0" max="120" placeholder="Auto" aria-label="Start age"></label>
    <label data-hide-for-income-types="tax_exempt_interest ira_distribution roth_conversion short_term_capital_gain long_term_capital_gain"><span>End age</span><input type="number" data-hh-draft="endAge" min="0" max="120" placeholder="Life" aria-label="End age"></label>
    <label data-hide-for-income-types="tax_exempt_interest ira_distribution roth_conversion short_term_capital_gain long_term_capital_gain"><span>Growth / COLA</span><span class="hh-it-add-form__pct"><input type="number" data-hh-draft="growthPct" min="-100" max="100" step="0.1" value="0" aria-label="Growth or COLA percentage"><span>%</span></span></label>
    <label data-income-types="interest pension annuity deferred_comp other ira_distribution roth_conversion" hidden><span>Taxable</span><span class="hh-it-add-form__pct"><input type="number" data-hh-draft="taxablePct" min="0" max="100" step="1" value="100" aria-label="Taxable percentage"><span>%</span></span></label>
    <label data-income-types="dividends" hidden><span>Qualified</span><span class="hh-it-add-form__pct"><input type="number" data-hh-draft="qualifiedPct" min="0" max="100" step="1" value="0" aria-label="Qualified dividend percentage"><span>%</span></span></label>
    <div class="hh-it-add-form__actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>
  </div>`;
  const rows = key === 'adjustment' ? ADJUSTMENT_TYPES : key === 'credit' ? CREDIT_TYPES : DEDUCTION_TYPES;
  return `<div class="hh-it-add-form" data-add-kind="${key}">
    <label><span>${key === 'adjustment' ? 'Adjustment' : key === 'credit' ? 'Credit' : 'Deduction'}</span><select data-hh-draft="type" aria-label="${key} type">${options(rows)}</select></label>
    ${key === 'adjustment' ? `<label><span>Owner</span><select data-hh-draft="owner" aria-label="Adjustment owner">${ownerOptions(plan, 'client')}</select></label>` : ''}
    <label><span>Annual amount</span><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual amount"></span></label>
    ${key === 'adjustment' ? `<label class="hh-it-add-form__check" data-adjustment-types="401k"><input type="checkbox" data-hh-draft="whileWorkingOnly" checked><span>While working only</span></label>` : ''}
    <div class="hh-it-add-form__actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>
  </div>`;
}

function addControl(state, key, label, plan){
  return state.hhAddingKey === key
    ? addForm(key, plan)
    : `<button class="hh-it-add" type="button" data-hh-action="open-add" data-add-key="${key}">+ Add ${label}</button>`;
}

function summaryStat(label, value, note = '', className = ''){
  return `<div class="hh-it-stat${className ? ` ${className}` : ''}"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
}

export function renderHouseholdIncomeTax(plan, deps, state){
  const summary = deps.incomeTaxSummary();
  const incomeTotal = enteredIncomeTotal(plan);
  const adjustments = enteredAdjustmentTotal(plan);
  const deductions = enteredDeductionTotal(plan);
  const credits = enteredCreditTotal(plan);
  const indexed = (plan.income?.other || []).map((source, index) => ({ ...source, index }));
  const working = indexed.filter(source => incomePhase(plan, source) === 'working');
  const retirement = indexed.filter(source => incomePhase(plan, source) === 'retirement');
  const summaryReady = summary.status === 'ready';
  const summaryMessage = summaryReady ? 'Computed by the federal tax engine' : (summary.message || 'Add required tax facts');
  const bracketNote = summaryReady
    ? (summary.ordinaryBracketRoom == null ? 'Top federal bracket' : `${money(summary.ordinaryBracketRoom)} of room to top of bracket`)
    : '';
  const rmdNote = summary.firstRmdYear ? `First required year ${summary.firstRmdYear}` : 'Current engine assumption';
  const deductionComparison = summaryReady
    ? (summary.deductionMethod === 'Itemized'
      ? `Itemized ${money(summary.itemizedDeduction)} > standard ${money(summary.standardDeduction)} — itemized applied`
      : `Standard ${money(summary.standardDeduction)} ≥ itemized ${money(summary.itemizedDeduction)} — standard applied`)
    : '';
  return `<div class="hh-step-pane hh-it">
    <h2 class="hh-step-title hh-it__title">Income &amp; Tax</h2>
    <p class="hh-it__intro">All known income, pre-tax contributions and deductions — the base year the tax engine works from.</p>

    <div class="hh-it-section-head"><span>INCOME SOURCES</span><strong>${money(incomeTotal)} <small>this year</small></strong></div>
    <div class="hh-it-grid">
      <section><div class="hh-it-subhead"><span>WORKING YEARS</span><small>${money(working.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))} /yr</small></div>${working.length ? working.map(row => sourceRow(plan, deps, row, row.index)).join('') : '<p class="hh-it-empty">No working-year income entered.</p>'}</section>
      <section><div class="hh-it-subhead"><span>RETIREMENT YEARS</span><small>${money((plan.income?.socialSecurity?.primary?.pia || 0) + (plan.household?.spouse ? (plan.income?.socialSecurity?.spouse?.pia || 0) : 0) + retirement.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))} /yr</small></div>${socialSecurityRow(plan, deps, 'client')}${socialSecurityRow(plan, deps, 'spouse')}${retirement.map(row => sourceRow(plan, deps, row, row.index)).join('')}</section>
    </div>
    <div class="hh-it-add-line">${addControl(state, 'income', 'income source', plan)}${state.hhAddingKey !== 'income' ? '<span>Income and current-year tax items · treatment opens by type</span>' : ''}</div>

    <div class="hh-it-grid hh-it-grid--lower">
      <section><div class="hh-it-section-head"><span>PRE-TAX &amp; ADJUSTMENTS</span><strong>−${money(adjustments)}</strong></div>
        <div class="hh-it-row hh-it-row--planning"><span class="hh-it-row__copy"><span class="hh-it-row__title">Annual portfolio savings</span><span class="hh-it-row__meta">planning input · separate from tax adjustments</span></span><span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field('savings.annual', 'money')}</span></span></div>
        ${(plan.incomeTax?.adjustments || []).map((row, index) => adjustmentRow(plan, deps, row, index)).join('') || '<p class="hh-it-empty">No tax adjustments entered.</p>'}${addControl(state, 'adjustment', 'adjustment', plan)}</section>
      <section><div class="hh-it-section-head"><span>DEDUCTIONS</span><strong>−${money(deductions)}</strong></div>${(plan.incomeTax?.deductions || []).map((row, index) => deductionRow(deps, row, index)).join('') || '<p class="hh-it-empty">No itemized deductions entered.</p>'}<div class="hh-it-auto-row"><span>${summaryReady ? `${summary.deductionMethod} deduction` : 'Deduction choice'} <b>AUTO</b></span><strong>${summaryReady ? money(summary.deductionUsed) : '—'}</strong></div><div class="hh-it-deduction-footer">${addControl(state, 'deduction', 'deduction', plan)}${deductionComparison ? `<span>${deductionComparison}</span>` : ''}</div><div class="hh-it-mini-head"><span>CREDITS</span><strong>+${money(credits)}</strong></div>${(plan.incomeTax?.credits || []).map((row, index) => creditRow(deps, row, index)).join('') || '<p class="hh-it-empty">No federal credits entered.</p>'}${addControl(state, 'credit', 'credit', plan)}</section>
    </div>

    <div class="hh-it-foundation">
      ${summaryStat('TOTAL INCOME', money(summary.totalIncome ?? incomeTotal), '', 'hh-it-stat--ledger')}
      ${summaryStat('AGI', summaryReady ? money(summary.adjustedGrossIncome) : '—', '', 'hh-it-stat--ledger')}
      ${summaryStat('DEDUCTION USED', summaryReady ? `−${money(summary.deductionUsed)}` : '—', summaryReady ? summary.deductionMethod : '', 'hh-it-stat--ledger')}
      ${summaryStat('INITIAL TAXABLE INCOME', summaryReady ? money(summary.taxableIncome) : '—', '', 'hh-it-stat--primary')}
    </div>
    <div class="hh-it-tax-head"><span>TAX POSITION · THIS YEAR</span><small>${escHtml(summaryMessage)}</small></div>
    <div class="hh-it-tax-grid">
      ${summaryStat('FEDERAL MARGINAL BRACKET', summaryReady ? rate(summary.marginalRate) : '—', bracketNote)}
      ${summaryStat('CAPITAL GAINS RATE', summaryReady ? rate(summary.capitalGainsRate) : '—', summaryReady ? summary.capitalGainsNote : '')}
      ${summaryStat('NEXT IRMAA TIER', 'Not modeled', 'Federal engine scope pending')}
      ${summaryStat('SENIOR DEDUCTION (65+)', 'Not modeled', 'Age enhancement is not yet in the engine', 'hh-it-stat--pending')}
      ${summaryStat('EFFECTIVE TAX RATE', summaryReady ? rate(summary.effectiveRate) : '—', summaryReady ? `${money(summary.federalTaxLiability)} est. federal tax before elective withdrawals` : '')}
      ${summaryStat('RMDS BEGIN', `Age ${summary.rmdAge || 73}`, rmdNote)}
    </div>
  </div>`;
}
