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
const positive = row => Number(row?.amount) > 0;
const ADDABLE_INCOME_SOURCE_TYPES = INCOME_SOURCE_TYPES.filter(row => row.id !== 'social_security');

const DEFAULT_INCOME_SLOTS = Object.freeze([
  { typeId:'wages', owner:'client' },
  { typeId:'wages', owner:'spouse' },
  { typeId:'interest', owner:'joint' },
  { typeId:'dividends', owner:'joint' },
]);
const DEFAULT_ADJUSTMENT_SLOTS = Object.freeze([
  { typeId:'401k', owner:'client' },
  { typeId:'401k', owner:'spouse' },
  { typeId:'hsa', owner:'joint' },
]);
const DEFAULT_DEDUCTION_SLOTS = Object.freeze([
  { typeId:'medical' },
  { typeId:'charitable' },
  { typeId:'mortgage_interest' },
  { typeId:'salt' },
]);

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

function allocateSlots(rows, definitions, matches){
  const used = new Set();
  const slots = definitions.map(definition => {
    const index = rows.findIndex((row, rowIndex) =>
      !used.has(rowIndex) && positive(row) && matches(row, definition));
    if(index >= 0) used.add(index);
    return { ...definition, row:index >= 0 ? rows[index] : null, index };
  });
  return { slots, used };
}

function fixedMoneyInput({ kind, typeId, owner = '', amount = 0, rowIndex = -1, label, disabled = false }){
  return `<span class="pre">$</span><input type="text" inputmode="numeric" data-type="money" data-hh-fixed-kind="${kind}" data-hh-fixed-type="${typeId}" data-hh-fixed-owner="${owner}" data-hh-fixed-index="${rowIndex}" value="${Math.round(Number(amount) || 0).toLocaleString('en-US')}" aria-label="${escHtml(label)} amount"${disabled ? ' disabled' : ''}>`;
}

function removeButton(path, label){
  return path ? `<button class="row-x" data-rmpath="${path}" title="Remove ${escHtml(label)}">×</button>` : '';
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
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span>${removeButton(base, 'income source')}</span>
  </div>`;
}

function fixedIncomeRow(plan, deps, slot){
  const { typeId, owner, row, index } = slot;
  const type = incomeType(typeId);
  const base = index >= 0 ? `income.other.${index}` : '';
  const spouseUnavailable = owner === 'spouse' && !plan.household?.spouse;
  let meta;
  if(typeId === 'wages'){
    const person = owner === 'spouse' ? plan.household?.spouse : plan.household?.primary;
    meta = row
      ? `${escHtml(ownerLabel(plan, owner))} · ${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'ageOrLife')} · ${deps.field(`${base}.realGrowth`, 'signedPct')}/yr`
      : `${escHtml(ownerLabel(plan, owner))} · ${person?.currentAge ?? '—'} → ${person ? Math.max(person.currentAge || 0, (person.retirementAge || 1) - 1) : '—'} · 0%/yr`;
  }else if(typeId === 'dividends'){
    meta = `${escHtml(ownerLabel(plan, owner))} · ongoing · qualified ${row ? deps.field(`${base}.qualifiedPct`, 'pct') : '0%'}`;
  }else{
    meta = `${escHtml(ownerLabel(plan, owner))} · ongoing · taxable`;
  }
  return `<div class="hh-it-row" data-income-tax-slot="${typeId}:${owner}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">${escHtml(type.label)}</span><span class="hh-it-row__meta">${meta}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${fixedMoneyInput({ kind:'income', typeId, owner, amount:row?.amount, rowIndex:index, label:type.label, disabled:spouseUnavailable })}</span>${removeButton(base, type.label)}</span>
  </div>`;
}

function socialSecurityRow(plan, deps, role){
  const key = role === 'spouse' ? 'spouse' : 'primary';
  const owner = role === 'spouse' ? 'spouse' : 'client';
  const block = plan.income?.socialSecurity?.[key];
  const available = role !== 'spouse' || Boolean(plan.household?.spouse);
  const base = `income.socialSecurity.${key}`;
  const amount = block && available
    ? deps.field(`${base}.pia`, 'money')
    : `<span class="pre">$</span><input type="text" inputmode="numeric" data-type="money" value="0" aria-label="${escHtml(ownerLabel(plan, owner))} Social Security amount" disabled>`;
  const claimAge = block && available ? deps.field(`${base}.claimAge`, 'age', { min:62, max:70 }) : '—';
  const clear = block && Number(block.pia) > 0
    ? `<button class="row-x" data-hh-clear-path="${base}.pia" title="Clear Social Security">×</button>`
    : '';
  return `<div class="hh-it-row" data-income-tax-slot="social_security:${owner}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">Social Security</span><span class="hh-it-row__meta">${escHtml(ownerLabel(plan, owner))} · from ${claimAge} · COLA · <em>taxable auto</em></span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${amount}</span>${clear}</span>
  </div>`;
}

function adjustmentRow(plan, deps, row, index){
  const base = `incomeTax.adjustments.${index}`;
  const type = adjustmentType(row.typeId);
  const active = isAdjustmentActiveNow(plan, row);
  return `<div class="hh-it-row${active ? '' : ' hh-it-row--inactive'}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(row.label || type.label)}" aria-label="Adjustment name"></span><span class="hh-it-row__meta">${tinySelect(`${base}.owner`, row.owner || 'client', ownerOptions(plan, row.owner || 'client'), 'Adjustment owner')} · ${escHtml(type.note)}${active ? '' : ' · not in this year\'s AGI'}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span>${removeButton(base, 'adjustment')}</span>
  </div>`;
}

function fixedAdjustmentRow(plan, slot){
  const { typeId, owner, row, index } = slot;
  const type = adjustmentType(typeId);
  const base = index >= 0 ? `incomeTax.adjustments.${index}` : '';
  const spouseUnavailable = owner === 'spouse' && !plan.household?.spouse;
  const active = !row || isAdjustmentActiveNow(plan, row);
  return `<div class="hh-it-row${active ? '' : ' hh-it-row--inactive'}" data-income-tax-slot="${typeId}:${owner}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">${escHtml(type.label)}</span><span class="hh-it-row__meta">${escHtml(ownerLabel(plan, owner))} · ${escHtml(type.note)}${active ? '' : ' · not in this year\'s AGI'}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${fixedMoneyInput({ kind:'adjustment', typeId, owner, amount:row?.amount, rowIndex:index, label:type.label, disabled:spouseUnavailable })}</span>${removeButton(base, type.label)}</span>
  </div>`;
}

function deductionRow(deps, row, index){
  const base = `incomeTax.deductions.${index}`;
  const type = deductionType(row.typeId);
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy"><span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(row.label || type.label)}" aria-label="Deduction name"></span>${type.note ? `<span class="hh-it-row__meta">${escHtml(type.note)}</span>` : ''}</span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span>${removeButton(base, 'deduction')}</span>
  </div>`;
}

function fixedDeductionRow(slot){
  const { typeId, row, index } = slot;
  const type = deductionType(typeId);
  const base = index >= 0 ? `incomeTax.deductions.${index}` : '';
  return `<div class="hh-it-row" data-income-tax-slot="${typeId}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">${escHtml(type.label)}</span>${type.note ? `<span class="hh-it-row__meta">${escHtml(type.note)}</span>` : ''}</span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${fixedMoneyInput({ kind:'deduction', typeId, amount:row?.amount, rowIndex:index, label:type.label })}</span>${removeButton(base, type.label)}</span>
  </div>`;
}

function creditRow(deps, row, index){
  const base = `incomeTax.credits.${index}`;
  const type = creditType(row.typeId);
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy"><span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(row.label || type.label)}" aria-label="Credit name"></span><span class="hh-it-row__meta">${escHtml(type.note)}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span>${removeButton(base, 'credit')}</span>
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
  const rows = key === 'adjustment' ? ADJUSTMENT_TYPES : DEDUCTION_TYPES;
  const creditOptions = key === 'deduction'
    ? `<optgroup label="Federal credits">${CREDIT_TYPES.map(row => `<option value="credit:${row.id}">${escHtml(row.label)}</option>`).join('')}</optgroup>`
    : '';
  return `<div class="hh-it-add-form" data-add-kind="${key}">
    <label><span>${key === 'adjustment' ? 'Adjustment' : 'Deduction'}</span><select data-hh-draft="type" aria-label="${key} type">${options(rows)}${creditOptions}</select></label>
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

  const incomeRows = plan.income?.other || [];
  const incomeSlots = allocateSlots(incomeRows, DEFAULT_INCOME_SLOTS,
    (row, slot) => row.typeId === slot.typeId && (row.owner || 'client') === slot.owner);
  const incomeIndexed = incomeRows.map((source, index) => ({ ...source, index }));
  const extraIncome = incomeIndexed.filter(row => positive(row) && !incomeSlots.used.has(row.index));
  const workingExtras = extraIncome.filter(source => incomePhase(plan, source) === 'working');
  const retirementExtras = extraIncome.filter(source => incomePhase(plan, source) === 'retirement');
  const workingTotal = incomeIndexed.filter(source => positive(source) && incomePhase(plan, source) === 'working')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const retirementTotal = (plan.income?.socialSecurity?.primary?.pia || 0)
    + (plan.household?.spouse ? (plan.income?.socialSecurity?.spouse?.pia || 0) : 0)
    + incomeIndexed.filter(source => positive(source) && incomePhase(plan, source) === 'retirement')
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const adjustmentRows = plan.incomeTax?.adjustments || [];
  const adjustmentSlots = allocateSlots(adjustmentRows, DEFAULT_ADJUSTMENT_SLOTS,
    (row, slot) => row.typeId === slot.typeId && (row.owner || 'client') === slot.owner);
  const extraAdjustments = adjustmentRows
    .map((row, index) => ({ ...row, index }))
    .filter(row => positive(row) && !adjustmentSlots.used.has(row.index));

  const deductionRows = plan.incomeTax?.deductions || [];
  const deductionSlots = allocateSlots(deductionRows, DEFAULT_DEDUCTION_SLOTS,
    (row, slot) => row.typeId === slot.typeId);
  const extraDeductions = deductionRows
    .map((row, index) => ({ ...row, index }))
    .filter(row => positive(row) && !deductionSlots.used.has(row.index));
  const visibleCredits = (plan.incomeTax?.credits || [])
    .map((row, index) => ({ ...row, index }))
    .filter(positive);

  const summaryReady = summary.status === 'ready';
  const summaryMessage = summaryReady
    ? 'Computed by the federal tax engine — updates as inputs change'
    : (summary.message || 'Add required tax facts');
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
      <section><div class="hh-it-subhead"><span>WORKING YEARS</span><small>${money(workingTotal)} /yr</small></div>${incomeSlots.slots.map(slot => fixedIncomeRow(plan, deps, slot)).join('')}${workingExtras.map(row => sourceRow(plan, deps, row, row.index)).join('')}</section>
      <section><div class="hh-it-subhead"><span>RETIREMENT YEARS</span><small>${money(retirementTotal)} /yr</small></div>${socialSecurityRow(plan, deps, 'client')}${socialSecurityRow(plan, deps, 'spouse')}${retirementExtras.map(row => sourceRow(plan, deps, row, row.index)).join('')}</section>
    </div>
    <div class="hh-it-add-line">${addControl(state, 'income', 'income source', plan)}${state.hhAddingKey !== 'income' ? '<span>Wages · Bonus · Self-employment · Social Security · Pension · Annuity · Rental · Interest · Dividends · Deferred comp · Other</span>' : ''}</div>

    <div class="hh-it-grid hh-it-grid--lower">
      <section><div class="hh-it-section-head"><span>PRE-TAX &amp; ADJUSTMENTS</span><strong>−${money(adjustments)}</strong></div>${adjustmentSlots.slots.map(slot => fixedAdjustmentRow(plan, slot)).join('')}${extraAdjustments.map(row => adjustmentRow(plan, deps, row, row.index)).join('')}${addControl(state, 'adjustment', 'adjustment', plan)}</section>
      <section><div class="hh-it-section-head"><span>DEDUCTIONS</span><strong>−${money(deductions)}</strong></div>${deductionSlots.slots.map(fixedDeductionRow).join('')}${extraDeductions.map(row => deductionRow(deps, row, row.index)).join('')}<div class="hh-it-auto-row"><span>Standard deduction <b>AUTO</b></span><strong>${summaryReady ? money(summary.standardDeduction) : '—'}</strong></div><div class="hh-it-deduction-footer">${addControl(state, 'deduction', 'deduction', plan)}${deductionComparison ? `<span>${deductionComparison}</span>` : ''}</div>${visibleCredits.length ? `<div class="hh-it-mini-head"><span>CREDITS</span><strong>+${money(credits)}</strong></div>${visibleCredits.map(row => creditRow(deps, row, row.index)).join('')}` : ''}</section>
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
