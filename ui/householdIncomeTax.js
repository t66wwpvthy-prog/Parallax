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
  incomeType,
  normalizedIncomeSource,
  ownerLabel,
  retirementAgeForOwner,
} from '../src/household/incomeTaxModel.js';

const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');
const rate = value => value == null ? '—' : `${Math.round(value * 1000) / 10}%`;
const ADDABLE_INCOME_SOURCE_TYPES = INCOME_SOURCE_TYPES.filter(row => row.projectionEnabled !== false);

function options(rows, selected = null){
  return rows.map(row => `<option value="${row.id}" ${row.id === selected ? 'selected' : ''}>${escHtml(row.label)}</option>`).join('');
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

function detailField(label, control){
  return `<label class="hh-it-detail-field"><span>${label}</span>${control}</label>`;
}

function typeOptions(selected){
  const selectedType = incomeType(selected);
  const rows = ADDABLE_INCOME_SOURCE_TYPES.some(row => row.id === selectedType.id)
    ? ADDABLE_INCOME_SOURCE_TYPES
    : [...ADDABLE_INCOME_SOURCE_TYPES, selectedType];
  return options(rows, selectedType.id);
}

function taxCaption(source){
  if(source.typeId === 'dividends') return `${Math.round((source.qualifiedPct || 0) * 100)}% qualified`;
  if(source.typeId === 'rental') return `${money(source.netTaxable || 0)} net taxable`;
  if(source.typeId === 'long_term_capital_gains') return 'legacy external gain · preferential rate';
  if(source.typeId === 'short_term_capital_gains') return 'legacy external gain · ordinary rate';
  if(source.typeId === 'interest') return source.taxablePct > 0 ? 'taxable interest' : 'tax-exempt interest';
  if(['pension', 'annuity', 'deferred_comp', 'other'].includes(source.typeId)){
    return `${Math.round((source.taxablePct ?? 1) * 100)}% taxable`;
  }
  if(source.typeId === 'self_employment') return 'net taxable · Schedule SE facts needed';
  return 'taxable';
}

function sourceTaxDetail(deps, source, base){
  if(source.typeId === 'dividends') return detailField('Qualified dividends', deps.field(`${base}.qualifiedPct`, 'pct'));
  if(source.typeId === 'rental') return detailField('Net taxable income', deps.field(`${base}.netTaxable`, 'money'));
  if(['interest', 'pension', 'annuity', 'deferred_comp', 'other'].includes(source.typeId)){
    return detailField('Taxable portion', deps.field(`${base}.taxablePct`, 'pct'));
  }
  return '';
}

function sourceRow(plan, deps, source, index){
  const base = `income.other.${index}`;
  const type = incomeType(source.typeId);
  const endAge = source.endAge >= 999 ? 'ongoing' : source.endAge;
  const growth = `${Math.round((source.realGrowth || 0) * 1000) / 10}% /yr`;
  const customName = source.label && source.label !== type.label ? `<span class="hh-it-row__custom">${escHtml(source.label)}</span>` : '';
  return `<div class="hh-it-row">
    <div class="hh-it-row__copy">
      <div class="hh-it-row__title"><select class="hh-it-type-select" data-path="${base}.typeId" data-type="incomeType" aria-label="Income type">${typeOptions(source.typeId)}</select>${customName}</div>
      <div class="hh-it-row__meta"><span>Age ${source.startAge} → ${endAge}</span><span>·</span><span>${growth}</span><span>·</span><span>${escHtml(taxCaption(source))}</span></div>
      <details class="hh-it-row__details">
        <summary>Details</summary>
        <div class="hh-it-detail-grid">
          ${detailField('Assigned to', tinySelect(`${base}.owner`, source.owner, ownerOptions(plan, source.owner), 'Income owner'))}
          ${detailField('Start age', deps.field(`${base}.startAge`, 'age'))}
          ${detailField('End age', deps.field(`${base}.endAge`, 'age'))}
          ${detailField('Growth / COLA', deps.field(`${base}.realGrowth`, 'signedPct'))}
          ${sourceTaxDetail(deps, source, base)}
        </div>
      </details>
    </div>
    <div class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field(`${base}.amount`, 'money')}</span><button class="row-x" data-rmpath="${base}" title="Remove income source">×</button></div>
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
  const timing = type.id === '401k'
    ? ` · <label class="hh-it-inline-check"><input type="checkbox" data-path="${base}.whileWorkingOnly" data-type="bool" ${row.whileWorkingOnly !== false ? 'checked' : ''}> while working</label>`
    : '';
  return `<div class="hh-it-row">
    <span class="hh-it-row__copy"><span class="hh-it-row__title"><input data-path="${base}.label" data-type="text" value="${escHtml(row.label || type.label)}" aria-label="Adjustment name"></span><span class="hh-it-row__meta">${tinySelect(`${base}.owner`, row.owner || 'client', ownerOptions(plan, row.owner || 'client'), 'Adjustment owner')} · ${escHtml(type.note)}${timing}</span></span>
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

function draftField(label, control, visibleFor = ''){
  const visibility = visibleFor ? ` data-visible-for="${visibleFor}" hidden` : '';
  return `<label class="hh-it-draft-field"${visibility}><span>${label}</span>${control}</label>`;
}

function addForm(key, plan){
  if(key === 'savings'){
    return `<div class="hh-it-add-card hh-it-add-card--compact" data-hh-add-form="savings"><div class="hh-it-add-grid">
      ${draftField('Annual portfolio savings', '<span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual portfolio savings"></span>')}
    </div><div class="hh-it-add-actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add savings</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div></div>`;
  }
  if(key === 'income'){
    const seed = normalizedIncomeSource(plan, { typeId:'wages', owner:'client' });
    const incomeTypes = ADDABLE_INCOME_SOURCE_TYPES;
    return `<div class="hh-it-add-card" data-hh-add-form="income">
      <div class="hh-it-add-grid">
        ${draftField('Source', `<select data-hh-draft="type" aria-label="Income type">${options(incomeTypes, 'wages')}</select>`)}
        ${draftField('Owner', `<select data-hh-draft="owner" aria-label="Income owner">${ownerOptions(plan, 'client')}</select>`)}
        ${draftField('Annual amount', `<span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual amount"></span>`)}
        ${draftField('Start age', `<input data-hh-draft="startAge" type="number" min="0" max="120" value="${seed.startAge}" aria-label="Start age">`)}
        ${draftField('End age', `<input data-hh-draft="endAge" type="number" min="0" max="120" value="${seed.endAge}" aria-label="End age">`)}
        ${draftField('Growth / COLA', `<span class="hh-it-add-form__pct"><input data-hh-draft="growthPct" type="number" step="0.1" value="0" aria-label="Growth or COLA percentage"><span>%</span></span>`)}
        ${draftField('Interest treatment', '<select data-hh-draft="interestTreatment"><option value="taxable">Taxable</option><option value="tax_exempt">Tax-exempt</option></select>', 'interest')}
        ${draftField('Qualified dividends', '<span class="hh-it-add-form__pct"><input data-hh-draft="qualifiedPct" type="number" min="0" max="100" step="1" value="0"><span>%</span></span>', 'dividends')}
        ${draftField('Taxable portion', '<span class="hh-it-add-form__pct"><input data-hh-draft="taxablePct" type="number" min="0" max="100" step="1" value="100"><span>%</span></span>', 'pension annuity deferred_comp other')}
        ${draftField('Net taxable income', '<span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="netTaxable" inputmode="numeric" value="0"></span>', 'rental')}
        ${draftField('Tax treatment', '<span class="hh-it-auto-copy">Computed automatically</span>', 'social_security')}
      </div>
      <div class="hh-it-add-actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add income source</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>
    </div>`;
  }
  const rows = key === 'adjustment' ? ADJUSTMENT_TYPES : DEDUCTION_TYPES;
  return `<div class="hh-it-add-card hh-it-add-card--compact" data-hh-add-form="${key}"><div class="hh-it-add-grid">
    ${draftField(key === 'adjustment' ? 'Adjustment' : 'Deduction', `<select data-hh-draft="type" aria-label="${key} type">${options(rows)}</select>`)}
    ${key === 'adjustment' ? draftField('Owner', `<select data-hh-draft="owner" aria-label="Adjustment owner">${ownerOptions(plan, 'client')}</select>`) : ''}
    ${draftField('Annual amount', `<span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0" aria-label="Annual amount"></span>`)}
    ${key === 'adjustment' ? draftField('Timing', '<label class="hh-it-check"><input data-hh-draft="whileWorkingOnly" type="checkbox" checked> While working only</label>') : ''}
  </div><div class="hh-it-add-actions"><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add ${key}</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div></div>`;
}

function addControl(state, key, label, plan){
  return state.hhAddingKey === key
    ? addForm(key, plan)
    : `<button class="hh-it-add" type="button" data-hh-action="open-add" data-add-key="${key}">+ Add ${label}</button>`;
}

function summaryStat(label, value, note = '', className = ''){
  return `<div class="hh-it-stat${className ? ` ${className}` : ''}"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
}

function annualSavings(plan, deps, state){
  const amount = Math.max(0, Number(plan.savings?.annual) || 0);
  if(amount > 0){
    return `<div class="hh-it-row"><span class="hh-it-row__copy"><span class="hh-it-row__title">Annual portfolio savings</span><span class="hh-it-row__meta">engine accumulation input · while either client is working</span></span><span class="hh-it-row__end"><span class="hh-it-row__amount">${deps.field('savings.annual', 'money')}</span><button class="row-x" type="button" data-hh-action="remove-annual-savings" title="Remove annual savings">×</button></span></div>`;
  }
  return addControl(state, 'savings', 'annual savings', plan);
}

function realizedGains(plan, deps){
  const legacy = (plan.income?.other || []).some(row =>
    ['short_term_capital_gains', 'long_term_capital_gains'].includes(row.typeId) && Number(row.amount) > 0);
  return `<section class="hh-it-gains" aria-labelledby="hh-realized-gains-title">
    <div class="hh-it-gains__copy"><span id="hh-realized-gains-title">CURRENT-YEAR REALIZED GAINS</span><small>Tax-only inputs. They do not create projected cash flow or reduce portfolio balances.</small></div>
    <div class="hh-it-gains__fields">
      <label><span>Short-term</span><span class="hh-it-gains__money">${deps.field('incomeTax.realizedGains.shortTerm', 'money')}</span></label>
      <label><span>Long-term</span><span class="hh-it-gains__money">${deps.field('incomeTax.realizedGains.longTerm', 'money')}</span></label>
    </div>
    <p>Gains created by modeled taxable-account withdrawals remain calculated from account basis.${legacy ? ' Legacy projected-gain rows are still present above and should be reviewed.' : ''}</p>
  </section>`;
}

export function renderHouseholdIncomeTax(plan, deps, state){
  const summary = deps.incomeTaxSummary();
  const incomeTotal = enteredIncomeTotal(plan);
  const taxOnlyGains = Math.max(0, Number(plan.incomeTax?.realizedGains?.shortTerm) || 0)
    + Math.max(0, Number(plan.incomeTax?.realizedGains?.longTerm) || 0);
  const currentIncomeTotal = Math.max(0, (summary.totalIncome ?? incomeTotal) - taxOnlyGains);
  const adjustments = enteredAdjustmentTotal(plan);
  const deductions = enteredDeductionTotal(plan);
  const indexed = (plan.income?.other || []).map((source, index) => ({ ...normalizedIncomeSource(plan, source), index }));
  const working = indexed.filter(source => source.startAge < retirementAgeForOwner(plan, source.owner));
  const retirement = indexed.filter(source => source.startAge >= retirementAgeForOwner(plan, source.owner));
  const summaryReady = summary.status === 'ready';
  const summaryMessage = summaryReady ? 'Computed by the federal tax engine' : (summary.message || 'Add required tax facts');
  return `<div class="hh-step-pane hh-it">
    <h2 class="hh-step-title hh-it__title">Income &amp; Tax</h2>
    <p class="hh-it__intro">Projected income streams and current-year tax facts — each kept in the calculation path where it belongs.</p>

    <div class="hh-it-section-head"><span>PROJECTED INCOME SOURCES</span><strong>${money(currentIncomeTotal)} <small>this year</small></strong></div>
    <div class="hh-it-grid">
      <section><div class="hh-it-subhead"><span>WORKING YEARS</span><small>${money(working.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))} /yr</small></div>${working.length ? working.map(row => sourceRow(plan, deps, row, row.index)).join('') : '<p class="hh-it-empty">No working-year income entered.</p>'}</section>
      <section><div class="hh-it-subhead"><span>RETIREMENT YEARS</span><small>${money((plan.income?.socialSecurity?.primary?.pia || 0) + (plan.household?.spouse ? (plan.income?.socialSecurity?.spouse?.pia || 0) : 0) + retirement.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))} /yr</small></div>${socialSecurityRow(plan, deps, 'client')}${socialSecurityRow(plan, deps, 'spouse')}${retirement.map(row => sourceRow(plan, deps, row, row.index)).join('')}</section>
    </div>
    <div class="hh-it-add-line">${addControl(state, 'income', 'income source', plan)}${state.hhAddingKey !== 'income' ? `<span>${ADDABLE_INCOME_SOURCE_TYPES.map(row => row.label).join(' · ')}</span>` : ''}</div>
    ${realizedGains(plan, deps)}

    <div class="hh-it-grid hh-it-grid--lower">
      <section><div class="hh-it-section-head"><span>PRE-TAX &amp; ADJUSTMENTS</span><strong>−${money(adjustments)}</strong></div>
        ${annualSavings(plan, deps, state)}
        ${(plan.incomeTax?.adjustments || []).map((row, index) => adjustmentRow(plan, deps, row, index)).join('') || '<p class="hh-it-empty">No tax adjustments entered.</p>'}${addControl(state, 'adjustment', 'adjustment', plan)}</section>
      <section><div class="hh-it-section-head"><span>DEDUCTIONS</span><strong>−${money(deductions)}</strong></div>${(plan.incomeTax?.deductions || []).map((row, index) => deductionRow(deps, row, index)).join('') || '<p class="hh-it-empty">No itemized deductions entered.</p>'}<div class="hh-it-auto-row"><span>${summaryReady ? `${summary.deductionMethod} deduction` : 'Deduction choice'} <b>AUTO</b></span><strong>${summaryReady ? money(summary.deductionUsed) : '—'}</strong></div>${addControl(state, 'deduction', 'deduction', plan)}${summaryReady ? `<p class="hh-it-deduction-note">${summary.deductionMethod === 'Itemized' ? `Itemized ${money(deductions)} exceeds standard — <em>itemized applied</em>` : `Standard ${money(summary.deductionUsed)} exceeds entered itemized deductions — <em>standard applied</em>`}</p>` : ''}</section>
    </div>

    <div class="hh-it-foundation">
      ${summaryStat('TOTAL INCOME', money(summary.totalIncome ?? incomeTotal))}
      ${summaryStat('AGI', summaryReady ? money(summary.adjustedGrossIncome) : '—')}
      ${summaryStat('DEDUCTION USED', summaryReady ? `−${money(summary.deductionUsed)}` : '—', summaryReady ? summary.deductionMethod : '')}
      ${summaryStat('INITIAL TAXABLE INCOME', summaryReady ? money(summary.taxableIncome) : '—', '', 'hh-it-stat--final')}
    </div>
    <div class="hh-it-tax-head"><span>TAX POSITION · THIS YEAR</span><small>${escHtml(summaryMessage)}${summaryReady ? ' — updates as inputs change' : ''}</small></div>
    <div class="hh-it-tax-grid">
      ${summaryStat('FEDERAL MARGINAL BRACKET', summaryReady ? rate(summary.marginalRate) : '—', summaryReady && summary.ordinaryBracketRoom != null ? `${money(summary.ordinaryBracketRoom)} of room to top of bracket` : '')}
      ${summaryStat('CAPITAL GAINS RATE', summaryReady ? rate(summary.capitalGainsRate) : '—', summaryReady ? (summary.capitalGainsCaption || 'No preferential income entered') : '')}
      ${summaryStat('NEXT IRMAA TIER', 'Not calculated', 'requires Medicare threshold rule support')}
      ${summaryStat('SENIOR DEDUCTION (65+)', summary.seniorDeductionStatus || 'Not calculated', summary.seniorDeductionCaption || 'requires senior-deduction rule support')}
      ${summaryStat('EFFECTIVE TAX RATE', summaryReady ? rate(summary.effectiveRate) : '—', summaryReady ? `${money(summary.federalTaxLiability)} estimated federal tax` : '')}
      ${summaryStat('RMDS BEGIN', 'Age 73', summary.rmdFirstYear ? `First required year ${summary.rmdFirstYear}` : 'current engine assumption')}
    </div>
  </div>`;
}
