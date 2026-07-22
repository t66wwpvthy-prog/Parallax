import { escHtml } from './dom.js';
import {
  ADJUSTMENT_TYPES,
  DEDUCTION_TYPES,
  INCOME_SOURCE_TYPES,
  adjustmentType,
  deductionType,
  enteredAdjustmentTotal,
  enteredDeductionTotal,
  enteredIncomeTotal,
  findLikelyGpcDuplicateWageRows,
  incomePhase,
  incomeType,
  isAdjustmentActiveNow,
  isSourceActiveNow,
  ownerLabel,
} from '../src/household/incomeTaxModel.js';

const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');
const rate = value => value == null ? '—' : `${Math.round(value * 1000) / 10}%`;
const positive = row => Number(row?.amount) > 0;

/** Ordinary income types for the primary add catalog. Path CG is withdrawal-derived. */
const ADDABLE_INCOME_IDS = Object.freeze([
  'wages', 'bonus', 'self_employment', 'pension', 'annuity', 'rental',
  'interest', 'dividends', 'deferred_comp', 'other',
]);
/** Rare sales outside the modeled brokerage path — not for funding lifestyle from taxable. */
const EXTERNAL_SALE_INCOME_IDS = Object.freeze([
  'long_term_capital_gain', 'short_term_capital_gain',
]);
const ADDABLE_INCOME_SOURCE_TYPES = INCOME_SOURCE_TYPES.filter(row => ADDABLE_INCOME_IDS.includes(row.id));
const EXTERNAL_SALE_SOURCE_TYPES = INCOME_SOURCE_TYPES.filter(row => EXTERNAL_SALE_INCOME_IDS.includes(row.id));
const ADDABLE_DEDUCTION_TYPES = DEDUCTION_TYPES.filter(row =>
  ['medical', 'charitable', 'mortgage_interest', 'salt', 'other'].includes(row.id));

const INCOME_ADD_HINT = 'Wages · Bonus · Self-employment · Pension · Annuity · Rental · Interest · Dividends · Deferred comp · Other';

const DEFAULT_INCOME_SLOTS = Object.freeze([
  { typeId: 'wages', owner: 'client' },
  { typeId: 'wages', owner: 'spouse' },
  { typeId: 'interest', owner: 'joint' },
  { typeId: 'dividends', owner: 'joint' },
]);
const DEFAULT_ADJUSTMENT_SLOTS = Object.freeze([
  { typeId: '401k', owner: 'client' },
  { typeId: '401k', owner: 'spouse' },
  { typeId: 'hsa', owner: 'joint' },
]);
const DEFAULT_DEDUCTION_SLOTS = Object.freeze([
  { typeId: 'medical' },
  { typeId: 'charitable' },
  { typeId: 'mortgage_interest' },
  { typeId: 'salt' },
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
    return { ...definition, row: index >= 0 ? rows[index] : null, index };
  });
  return { slots, used };
}

function fixedMoneyInput({ kind, typeId, owner = '', amount = 0, rowIndex = -1, label, disabled = false }){
  return `<span class="pre">$</span><input type="text" inputmode="numeric" data-type="money" data-hh-fixed-kind="${kind}" data-hh-fixed-type="${typeId}" data-hh-fixed-owner="${owner}" data-hh-fixed-index="${rowIndex}" value="${Math.round(Number(amount) || 0).toLocaleString('en-US')}" aria-label="${escHtml(label)} amount"${disabled ? ' disabled' : ''}>`;
}

function removeButton(path, label){
  return path ? `<button class="row-x" data-rmpath="${path}" title="Remove ${escHtml(label)}">×</button>` : '';
}

function growthLabel(value){
  const pct = Math.round((Number(value) || 0) * 1000) / 10;
  return `${pct >= 0 ? '+' : ''}${pct}%/yr`;
}

function sourceMeta(plan, deps, source, index){
  const base = `income.other.${index}`;
  const type = incomeType(source.typeId);
  const owner = escHtml(ownerLabel(plan, source.owner));
  if(source.typeId === 'dividends'){
    return `${owner} · ongoing · qualified ${deps.field(`${base}.qualifiedPct`, 'pct')}`;
  }
  if(source.typeId === 'interest'){
    const taxable = (source.taxablePct == null || source.taxablePct > 0) ? 'taxable' : 'tax-exempt';
    return `${owner} · ongoing · ${taxable}`;
  }
  if(source.typeId === 'long_term_capital_gain'){
    return `${owner} · external sale · preferential · not a taxable-sleeve draw`;
  }
  if(source.typeId === 'short_term_capital_gain'){
    return `${owner} · external sale · ordinary · not a taxable-sleeve draw`;
  }
  if(type.timing === 'current'){
    return `${owner} · current year · ${source.typeId === 'tax_exempt_interest' ? 'tax-exempt' : 'taxable'}`;
  }
  if(source.typeId === 'rental'){
    return `${owner} · ${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'ageOrLife')} · net taxable`;
  }
  if(['pension', 'annuity', 'deferred_comp', 'other'].includes(source.typeId)){
    return `${owner} · ${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'ageOrLife')} · ${deps.field(`${base}.taxablePct`, 'pct')} taxable`;
  }
  if(source.typeId === 'self_employment'){
    return `${owner} · ${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'ageOrLife')} · net taxable`;
  }
  return `${owner} · ${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'ageOrLife')} · ${deps.field(`${base}.realGrowth`, 'signedPct')}/yr`;
}

function sourceRow(plan, deps, source, index){
  const base = `income.other.${index}`;
  const type = incomeType(source.typeId);
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy">
      <span class="hh-it-row__title">${escHtml(source.label || type.label)}</span>
      <span class="hh-it-row__meta">${sourceMeta(plan, deps, source, index)}</span>
    </span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span>${removeButton(base, 'income source')}</span>
  </div>`;
}

function fixedIncomeRow(plan, deps, slot){
  const { typeId, owner, row, index } = slot;
  const type = incomeType(typeId);
  const base = index >= 0 ? `income.other.${index}` : '';
  const spouseUnavailable = owner === 'spouse' && !plan.household?.spouse;
  const who = escHtml(ownerLabel(plan, owner));
  let meta;
  if(typeId === 'wages'){
    const person = owner === 'spouse' ? plan.household?.spouse : plan.household?.primary;
    meta = row
      ? `${who} · ${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'ageOrLife')} · ${deps.field(`${base}.realGrowth`, 'signedPct')}/yr`
      : `${who} · ${person?.currentAge ?? '—'} → ${person ? Math.max(person.currentAge || 0, (person.retirementAge || 1) - 1) : '—'} · ${growthLabel(0)}`;
  }else if(typeId === 'dividends'){
    meta = row
      ? `${who} · ongoing · qualified ${deps.field(`${base}.qualifiedPct`, 'pct')}`
      : `${who} · ongoing · qualified 0%`;
  }else{
    meta = `${who} · ongoing · taxable`;
  }
  return `<div class="hh-it-row" data-income-tax-slot="${typeId}:${owner}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">${escHtml(type.label)}</span><span class="hh-it-row__meta">${meta}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${fixedMoneyInput({ kind: 'income', typeId, owner, amount: row?.amount, rowIndex: index, label: type.label, disabled: spouseUnavailable })}</span>${removeButton(base, type.label)}</span>
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
  const claimAge = block && available ? deps.field(`${base}.claimAge`, 'age', { min: 62, max: 70 }) : '—';
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
    <span class="hh-it-row__copy"><span class="hh-it-row__title">${escHtml(row.label || type.label)}</span><span class="hh-it-row__meta">${tinySelect(`${base}.owner`, row.owner || 'client', ownerOptions(plan, row.owner || 'client'), 'Adjustment owner')} · ${escHtml(type.note)}${active ? '' : ' · not in this year\'s AGI'}</span></span>
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
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${fixedMoneyInput({ kind: 'adjustment', typeId, owner, amount: row?.amount, rowIndex: index, label: type.label, disabled: spouseUnavailable })}</span>${removeButton(base, type.label)}</span>
  </div>`;
}

function deductionRow(deps, row, index){
  const base = `incomeTax.deductions.${index}`;
  const type = deductionType(row.typeId);
  const hint = type.note ? ` <span class="hh-it-row__hint">· ${escHtml(type.note)}</span>` : '';
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">${escHtml(row.label || type.label)}${hint}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span>${removeButton(base, 'deduction')}</span>
  </div>`;
}

function fixedDeductionRow(slot){
  const { typeId, row, index } = slot;
  const type = deductionType(typeId);
  const base = index >= 0 ? `incomeTax.deductions.${index}` : '';
  const hint = type.note ? ` <span class="hh-it-row__hint">· ${escHtml(type.note)}</span>` : '';
  return `<div class="hh-it-row" data-income-tax-slot="${typeId}">
    <span class="hh-it-row__copy"><span class="hh-it-row__title">${escHtml(type.label)}${hint}</span></span>
    <span class="hh-it-row__end"><span class="hh-it-row__amount">${fixedMoneyInput({ kind: 'deduction', typeId, amount: row?.amount, rowIndex: index, label: type.label })}</span>${removeButton(base, type.label)}</span>
  </div>`;
}

function addForm(key, plan){
  if(key === 'income' || key === 'external-sale'){
    const types = key === 'external-sale' ? EXTERNAL_SALE_SOURCE_TYPES : ADDABLE_INCOME_SOURCE_TYPES;
    const note = key === 'external-sale'
      ? `<p class="hh-it-add-form__note">For sales outside the modeled brokerage path. Funding goals from taxable accounts realizes gain on the cash-flow path automatically.</p>`
      : '';
    return `<div class="hh-it-add-form hh-it-add-form--income" data-add-kind="${key}">
      ${note}
      <label><span>Source</span><select data-hh-draft="type" aria-label="Income type">${options(types)}</select></label>
      <label><span>Owner</span><select data-hh-draft="owner" aria-label="Income owner">${ownerOptions(plan, 'client')}</select></label>
      <label data-income-types="rental" hidden><span>Net taxable</span><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="netTaxable" inputmode="numeric" placeholder="0" aria-label="Net taxable income"></span></label>
      <label data-hide-for-income-types="rental"><span>Annual amount</span><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual amount"></span></label>
      <label data-hide-for-income-types="short_term_capital_gain long_term_capital_gain"><span>Start age</span><input type="number" data-hh-draft="startAge" min="0" max="120" placeholder="Auto" aria-label="Start age"></label>
      <label data-hide-for-income-types="short_term_capital_gain long_term_capital_gain"><span>End age</span><input type="number" data-hh-draft="endAge" min="0" max="120" placeholder="Life" aria-label="End age"></label>
      <label data-hide-for-income-types="short_term_capital_gain long_term_capital_gain"><span>Growth / COLA</span><span class="hh-it-add-form__pct"><input type="number" data-hh-draft="growthPct" min="-100" max="100" step="0.1" value="0" aria-label="Growth or COLA percentage"><span>%</span></span></label>
      <label data-income-types="interest" hidden><span>Treatment</span><select data-hh-draft="interestTreatment" aria-label="Interest tax treatment"><option value="taxable">Taxable</option><option value="tax_exempt">Tax-exempt</option></select></label>
      <label data-income-types="pension annuity deferred_comp other" hidden><span>Taxable</span><span class="hh-it-add-form__pct"><input type="number" data-hh-draft="taxablePct" min="0" max="100" step="1" value="100" aria-label="Taxable percentage"><span>%</span></span></label>
      <label data-income-types="dividends" hidden><span>Qualified</span><span class="hh-it-add-form__pct"><input type="number" data-hh-draft="qualifiedPct" min="0" max="100" step="1" value="0" aria-label="Qualified dividend percentage"><span>%</span></span></label>
      <div class="hh-it-add-form__actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>
    </div>`;
  }
  if(key === 'adjustment'){
    return `<div class="hh-it-add-form" data-add-kind="adjustment">
      <label><span>Adjustment</span><select data-hh-draft="type" aria-label="Adjustment type">${options(ADJUSTMENT_TYPES)}</select></label>
      <label><span>Owner</span><select data-hh-draft="owner" aria-label="Adjustment owner">${ownerOptions(plan, 'client')}</select></label>
      <label><span>Annual amount</span><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual amount"></span></label>
      <label class="hh-it-add-form__check" data-adjustment-types="401k"><input type="checkbox" data-hh-draft="whileWorkingOnly" checked><span>While working only</span></label>
      <div class="hh-it-add-form__actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>
    </div>`;
  }
  return `<div class="hh-it-add-form" data-add-kind="deduction">
    <label><span>Deduction</span><select data-hh-draft="type" aria-label="Deduction type">${options(ADDABLE_DEDUCTION_TYPES)}</select></label>
    <label><span>Annual amount</span><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual amount"></span></label>
    <div class="hh-it-add-form__actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>
  </div>`;
}

function addControl(state, key, label, plan){
  return state.hhAddingKey === key
    ? addForm(key, plan)
    : `<button class="hh-it-add" type="button" data-hh-action="open-add" data-add-key="${key}">+ Add ${label}</button>`;
}

function taxStat(label, value, note = '', className = ''){
  return `<div class="hh-it-stat${className ? ` ${className}` : ''}"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
}

export function renderHouseholdIncomeTax(plan, deps, state){
  const summary = deps.incomeTaxSummary();
  const duplicateWages = findLikelyGpcDuplicateWageRows(plan);
  const incomeTotal = enteredIncomeTotal(plan);
  const adjustments = enteredAdjustmentTotal(plan);
  const deductions = enteredDeductionTotal(plan);

  const incomeRows = plan.income?.other || [];
  const incomeSlots = allocateSlots(incomeRows, DEFAULT_INCOME_SLOTS,
    (row, slot) => row.typeId === slot.typeId
      && (row.owner || 'client') === slot.owner
      && (slot.typeId === 'wages' || isSourceActiveNow(plan, row)));
  const incomeIndexed = incomeRows.map((source, index) => ({ ...source, index }));
  const extraIncome = incomeIndexed.filter(row => positive(row) && !incomeSlots.used.has(row.index));
  const workingExtras = extraIncome.filter(source => incomePhase(plan, source) === 'working');
  const retirementExtras = extraIncome.filter(source => incomePhase(plan, source) === 'retirement');
  const workingTotal = incomeIndexed
    .filter(source => positive(source) && incomePhase(plan, source) === 'working')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const retirementTotal = (plan.income?.socialSecurity?.primary?.pia || 0)
    + (plan.household?.spouse ? (plan.income?.socialSecurity?.spouse?.pia || 0) : 0)
    + incomeIndexed
      .filter(source => positive(source) && incomePhase(plan, source) === 'retirement')
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

  const summaryReady = summary.status === 'ready';
  const summaryMessage = summaryReady
    ? 'Computed by the tax engine — updates as inputs change'
    : (summary.message || 'Add required tax facts');
  const totalIncome = duplicateWages.length ? null : (summary.totalIncome ?? incomeTotal);
  const incomeTotalLabel = duplicateWages.length ? 'Review required' : money(incomeTotal);
  const agi = summaryReady ? summary.adjustedGrossIncome : null;
  const deductionUsed = summaryReady ? summary.deductionUsed : null;
  const taxable = summaryReady ? summary.taxableIncome : null;
  const bracketNote = summaryReady
    ? (summary.ordinaryBracketRoom == null ? 'Top federal bracket' : `${money(summary.ordinaryBracketRoom)} of room to top of bracket`)
    : '';
  const rmdNote = summary.firstRmdYear ? `First required year ${summary.firstRmdYear}` : 'Current engine assumption';
  const deductionComparison = summaryReady
    ? (summary.deductionMethod === 'Itemized'
      ? `Itemized ${money(summary.itemizedDeduction)} > standard — <em>itemized applied</em>`
      : `Standard ${money(summary.standardDeduction)} ≥ itemized — <em>standard applied</em>`)
    : '';
  const effectiveNote = summaryReady
    ? `${money(summary.federalTaxLiability)} est. federal tax on taxable income`
    : '';

  return `<div class="hh-step-pane hh-it">
    <h2 class="hh-step-title hh-it__title">Income &amp; Tax</h2>
    <p class="hh-it__intro">All known income, pre-tax contributions and deductions — the base year the tax engine works from.</p>
    ${duplicateWages.length ? `<p class="hh-it__intro" role="alert"><strong>Review duplicate salary entries.</strong> A prior wizard save bug created identical rows. Remove the extra row before running Scenarios; no income fact was deleted automatically.</p>` : ''}

    <div class="hh-it-section-head"><span>INCOME SOURCES</span><strong>${incomeTotalLabel} <small>this year</small></strong></div>
    <div class="hh-it-grid">
      <section>
        <div class="hh-it-subhead"><span>Working years</span><small>${money(workingTotal)} /yr</small></div>
        ${incomeSlots.slots.map(slot => fixedIncomeRow(plan, deps, slot)).join('')}
        ${workingExtras.map(row => sourceRow(plan, deps, row, row.index)).join('')}
      </section>
      <section>
        <div class="hh-it-subhead"><span>Retirement years</span><small>${money(retirementTotal)} /yr</small></div>
        ${socialSecurityRow(plan, deps, 'client')}
        ${socialSecurityRow(plan, deps, 'spouse')}
        ${retirementExtras.map(row => sourceRow(plan, deps, row, row.index)).join('')}
      </section>
    </div>
    <div class="hh-it-add-line">${addControl(state, 'income', 'income source', plan)}${state.hhAddingKey !== 'income' && state.hhAddingKey !== 'external-sale' ? `<span>${INCOME_ADD_HINT}</span>` : ''}</div>
    <div class="hh-it-add-line hh-it-add-line--secondary">${addControl(state, 'external-sale', 'external sale', plan)}${state.hhAddingKey !== 'external-sale' ? `<span>Rare — outside modeled brokerage draws</span>` : ''}</div>

    <div class="hh-it-grid hh-it-grid--lower">
      <section>
        <div class="hh-it-section-head"><span>PRE-TAX &amp; ADJUSTMENTS</span><strong>−${money(adjustments)}</strong></div>
        ${adjustmentSlots.slots.map(slot => fixedAdjustmentRow(plan, slot)).join('')}
        ${extraAdjustments.map(row => adjustmentRow(plan, deps, row, row.index)).join('')}
        ${addControl(state, 'adjustment', 'adjustment', plan)}
      </section>
      <section>
        <div class="hh-it-section-head"><span>DEDUCTIONS</span><strong>−${money(deductions)}</strong></div>
        ${deductionSlots.slots.map(fixedDeductionRow).join('')}
        ${extraDeductions.map(row => deductionRow(deps, row, row.index)).join('')}
        <div class="hh-it-auto-row"><span>Standard · MFJ + senior 65+ <b>AUTO</b></span><strong>${summaryReady ? money(summary.standardDeduction) : '—'}</strong></div>
        <div class="hh-it-deduction-footer">${addControl(state, 'deduction', 'deduction', plan)}${deductionComparison ? `<span>${deductionComparison}</span>` : ''}</div>
      </section>
    </div>

    <div class="hh-it-position">
      <div class="hh-it-equation" role="group" aria-label="Taxable income equation">
        <div class="hh-it-equation__cell">
          <span>Total income</span>
          <strong>${totalIncome == null ? 'Review required' : money(totalIncome)}</strong>
          <small aria-hidden="true">&nbsp;</small>
        </div>
        <div class="hh-it-equation__op" aria-hidden="true">−</div>
        <div class="hh-it-equation__cell">
          <span>AGI → MAGI</span>
          <strong>${agi == null ? '—' : money(agi)}</strong>
          <small>adjustments ${money(summary.adjustments ?? adjustments)}</small>
        </div>
        <div class="hh-it-equation__op" aria-hidden="true">−</div>
        <div class="hh-it-equation__cell">
          <span>Deduction</span>
          <strong>${deductionUsed == null ? '—' : money(deductionUsed)}</strong>
          <small aria-hidden="true">&nbsp;</small>
        </div>
        <div class="hh-it-equation__op hh-it-equation__op--eq" aria-hidden="true">=</div>
        <div class="hh-it-equation__cell hh-it-equation__cell--result">
          <span>Initial taxable income</span>
          <strong>${taxable == null ? '—' : money(taxable)}</strong>
          <small aria-hidden="true">&nbsp;</small>
        </div>
      </div>
      <p class="hh-it-position__note">${escHtml(summaryMessage)}</p>
      <div class="hh-it-tax-grid">
        ${taxStat('Federal marginal bracket', summaryReady ? rate(summary.marginalRate) : '—', bracketNote)}
        ${taxStat('Capital gains rate', summaryReady ? rate(summary.capitalGainsRate) : '—', summaryReady ? (summary.capitalGainsNote || '') : '')}
        ${taxStat('Next IRMAA tier', 'Not modeled', 'Requires Medicare threshold rule support')}
        ${taxStat('Senior deduction (65+)', 'Not modeled', 'Age enhancement is not yet in the engine', 'hh-it-stat--pending')}
        ${taxStat('Effective tax rate', summaryReady ? rate(summary.effectiveRate) : '—', effectiveNote)}
        ${taxStat('RMDs begin', `Age ${summary.rmdAge ?? '—'}`, rmdNote)}
      </div>
    </div>
  </div>`;
}
