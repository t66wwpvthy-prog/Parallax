import { escHtml } from './dom.js';
import { hhMoney, hhCompact, hhNetWorthTotal, hhAllAccounts } from './household.js';
import { renderGaugeSvg, accountTreatment } from './householdWizard.js';
import { deductionType, enteredDeductionTotal, incomeType, ownerLabel } from '../src/household/incomeTaxModel.js';

const FS_OPTS = [
  ['marriedFilingJointly', 'Married filing jointly'],
  ['single', 'Single'],
  ['headOfHousehold', 'Head of household'],
  ['marriedFilingSeparately', 'Married filing separately'],
];

const FS_LABELS = Object.fromEntries(FS_OPTS);

const STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado',
  CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho',
  IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
  MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
  NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina',
  ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas',
  UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington', WV:'West Virginia',
  WI:'Wisconsin', WY:'Wyoming', DC:'District of Columbia',
};

/** Guided canvas balance-sheet catalog — maps to canonical account type IDs. */
export const GPC_ACCOUNT_CATALOG = Object.freeze([
  {
    heading: 'Tax-Deferred',
    items: Object.freeze([
      { typeId: '401k', label: 'Traditional 401(k)', owner: 'client' },
      { typeId: '403b', label: 'Traditional 403(b)', owner: 'client' },
      { typeId: '457', label: '457(b)', owner: 'client' },
      { typeId: 'traditional_ira', label: 'Traditional IRA', owner: 'client' },
      { typeId: 'rollover_ira', label: 'Rollover IRA', owner: 'client' },
      { typeId: 'sep_ira', label: 'SEP IRA', owner: 'client' },
      { typeId: 'simple_ira', label: 'SIMPLE IRA', owner: 'client' },
      { typeId: 'solo_401k', label: 'Solo 401(k) (Traditional)', owner: 'client' },
      { typeId: 'tsp', label: 'Traditional TSP', owner: 'client' },
    ]),
  },
  {
    heading: 'Tax-Free (Roth)',
    items: Object.freeze([
      { typeId: 'roth_401k', label: 'Roth 401(k)', owner: 'client' },
      { typeId: 'roth_403b', label: 'Roth 403(b)', owner: 'client' },
      { typeId: 'roth_ira', label: 'Roth IRA', owner: 'client' },
      { typeId: 'roth_401k', label: 'Roth Solo 401(k)', owner: 'client' },
      { typeId: 'roth_tsp', label: 'Roth TSP', owner: 'client' },
    ]),
  },
  {
    heading: 'Taxable',
    items: Object.freeze([
      { typeId: 'brokerage_taxable', label: 'Individual Brokerage', owner: 'client' },
      { typeId: 'joint_brokerage', label: 'Joint Brokerage (JTWROS)', owner: 'joint' },
      { typeId: 'trust_brokerage', label: 'Revocable Living Trust', owner: 'trust' },
      { typeId: 'tod_brokerage', label: 'Custodial Account (UTMA/UGMA)', owner: 'client' },
    ]),
  },
]);

export const GPC_DEDUCTION_TYPES = Object.freeze([
  { id: 'charitable', label: 'Charitable giving' },
  { id: 'mortgage_interest', label: 'Mortgage interest' },
  { id: 'salt', label: 'State & local taxes' },
  { id: 'medical', label: 'Medical expenses' },
]);

const money = v => '$' + Math.round(Number(v) || 0).toLocaleString('en-US');
const rate = v => v == null ? '—' : `${Math.round(v * 1000) / 10}%`;

function filingStateLine(plan){
  const fs = FS_LABELS[plan.meta?.filingStatus] || (plan.household?.spouse ? 'Married filing jointly' : 'Single');
  const st = STATE_NAMES[plan.meta?.state] || plan.meta?.state || '—';
  return `${fs} · ${st}`;
}

function fixedMoneyInput({ kind, typeId, owner = '', amount = 0, rowIndex = -1, label, disabled = false }){
  return `<span class="gpc-in-wrap"><span class="gpc-in-wrap__pre">$</span>` +
    `<input class="gpc-in" type="text" inputmode="numeric" data-type="money" data-hh-fixed-kind="${kind}" ` +
    `data-hh-fixed-type="${typeId}" data-hh-fixed-owner="${owner}" data-hh-fixed-index="${rowIndex}" ` +
    `value="${Math.round(Number(amount) || 0) ? Math.round(Number(amount)).toLocaleString('en-US') : ''}" ` +
    `placeholder="—" aria-label="${escHtml(label)}"${disabled ? ' disabled' : ''}></span>`;
}

function findIncomeRow(plan, typeId, owner){
  const rows = plan.income?.other || [];
  const index = rows.findIndex(r => r.typeId === typeId && (r.owner || 'client') === owner);
  return index >= 0 ? { row: rows[index], index } : { row: null, index: -1 };
}

function incomeSlotRow(plan, { typeId, owner, label, personLabel }){
  const match = findIncomeRow(plan, typeId, owner);
  const amount = match.row?.amount || 0;
  const display = personLabel || ownerLabel(plan, owner);
  const typeLabel = label || incomeType(typeId).label;
  return `<div class="gpc-field-row">` +
    `<label class="gpc-field-row__lbl">${escHtml(typeLabel)} <em>· ${escHtml(display)}</em></label>` +
    fixedMoneyInput({ kind: 'income', typeId, owner, amount, rowIndex: match.index, label: `${typeLabel} for ${display}` }) +
    `</div>`;
}

function ssRow(plan, deps, role){
  const isClient = role === 'client';
  if(!isClient && !plan.household?.spouse) return '';
  const base = isClient ? 'income.socialSecurity.primary' : 'income.socialSecurity.spouse';
  const name = isClient ? (plan.meta?.primaryName || 'Client') : (plan.meta?.spouseName || 'Co-client');
  const pia = isClient ? (plan.income?.socialSecurity?.primary?.pia || 0) : (plan.income?.socialSecurity?.spouse?.pia || 0);
  return `<div class="gpc-field-row">` +
    `<label class="gpc-field-row__lbl">Social Security <em>· ${escHtml(name)}</em></label>` +
    `<span class="gpc-in-wrap"><span class="gpc-in-wrap__pre">$</span>` +
    `<input class="gpc-in" type="text" inputmode="numeric" data-path="${base}.pia" data-type="money" ` +
    `value="${Math.round(Number(pia) || 0) ? Math.round(Number(pia)).toLocaleString('en-US') : ''}" placeholder="—" ` +
    `aria-label="Social Security for ${escHtml(name)}"></span></div>`;
}

function deductionRow(deps, row, index){
  const type = deductionType(row.typeId);
  return `<div class="gpc-field-row gpc-field-row--ded">` +
    `<span class="gpc-field-row__lbl">${escHtml(row.label || type.label)}</span>` +
    fixedMoneyInput({ kind: 'deduction', typeId: row.typeId, amount: row.amount, rowIndex: index, label: type.label }) +
    `<button type="button" class="row-x" data-rmpath="incomeTax.deductions.${index}" aria-label="Remove ${escHtml(type.label)}">×</button></div>`;
}

function taxMathRow(label, val, borderTop, big){
  return `<div class="gpc-tax-math__row${borderTop ? ' gpc-tax-math__row--top' : ''}">` +
    `<span>${label}</span><span class="gpc-tax-math__val${big ? ' gpc-tax-math__val--big' : ''}">${val}</span></div>`;
}

export function createGuidedPlanningWizard(deps){
  const state = deps.uiState;

  function stepFamily(){
    const plan = deps.plan;
    const defaultFs = plan.household?.spouse ? 'marriedFilingJointly' : 'single';
    const fsVal = plan.meta?.filingStatus || defaultFs;
    const tab = state.gpcPersonTab || 'primary';
    const pn = plan.meta?.primaryName || 'Client';
    const sn = plan.meta?.spouseName || 'Co-client';
    const planEnd = plan.household?.primary?.planEndAge ?? '—';

    let personPane = '';
    if(tab === 'primary'){
      personPane = `<div class="gpc-person-pane">
        <div class="gpc-field-row"><label class="gpc-field-row__lbl">Name</label>${deps.field('meta.primaryName', 'text', { ph: 'Client name' })}</div>
        <div class="gpc-field-row"><label class="gpc-field-row__lbl">Born</label>
          <input type="number" class="gpc-meta-in" data-path="household.primary.birthYear" data-type="birthYear" value="${plan.household?.primary?.birthYear || ''}" step="1" aria-label="Client birth year"></div>
        <div class="gpc-field-row"><label class="gpc-field-row__lbl">Retires at</label>${deps.field('household.primary.retirementAge', 'age')}</div>
        <div class="gpc-field-row"><label class="gpc-field-row__lbl">Plan to age</label>${deps.field('household.primary.planEndAge', 'age')}</div>
      </div>`;
    }else if(tab === 'spouse'){
      if(!plan.household?.spouse){
        personPane = `<button type="button" class="gpc-dash-btn" data-hh-action="add-spouse">+ Add co-client</button>`;
      }else{
        personPane = `<div class="gpc-person-pane">
          <div class="gpc-field-row"><label class="gpc-field-row__lbl">Name</label>${deps.field('meta.spouseName', 'text', { ph: 'Co-client name' })}</div>
          <div class="gpc-field-row"><label class="gpc-field-row__lbl">Born</label>
            <input type="number" class="gpc-meta-in" data-path="household.spouse.birthYear" data-type="birthYear" value="${plan.household.spouse.birthYear || ''}" step="1" aria-label="Co-client birth year"></div>
          <div class="gpc-field-row"><label class="gpc-field-row__lbl">Retires at</label>${deps.field('household.spouse.retirementAge', 'age')}</div>
          <button type="button" class="gpc-link-btn" data-hh-action="remove-spouse">Remove co-client</button>
        </div>`;
      }
    }else{
      const kids = plan.household?.children || [];
      const childAdd = state.hhAddingKey === 'child'
        ? `<div class="gpc-inline-form">
            <input class="gpc-inline-in" data-hh-draft="label" placeholder="Dependent name" value="${escHtml(state.hhDraftLabel || '')}">
            <input class="gpc-inline-in" data-hh-draft="year" type="number" placeholder="Born" value="${escHtml(state.hhDraftAmount || '')}">
            <button class="gpc-btn gpc-btn--primary" type="button" data-hh-action="commit-add">Add</button>
            <button class="gpc-btn gpc-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button>
          </div>`
        : `<button type="button" class="gpc-dash-btn" data-hh-action="open-add" data-add-key="child">+ Add dependent</button>`;
      personPane = `<div class="gpc-person-pane">${kids.map((k, i) =>
        `<div class="gpc-field-row"><span class="gpc-field-row__lbl">${escHtml(k.name || 'Dependent')}</span>
          <span>${k.birthYear || '—'} <button type="button" class="row-x" data-rmpath="household.children.${i}">×</button></span></div>`
      ).join('')}${childAdd}</div>`;
    }

    return `<div class="gpc-step">
      <p class="gpc-eyebrow">Step I — Family</p>
      <h1 class="gpc-title">Household</h1>
      <div class="gpc-meta-row">
        <div class="gpc-meta"><span class="gpc-meta__k">Filing status</span>
          <div class="gpc-meta__v">${deps.select('meta.filingStatus', fsVal, FS_OPTS, 'text')}</div></div>
        <div class="gpc-meta"><span class="gpc-meta__k">State</span>
          <div class="gpc-meta__v">${deps.select('meta.state', plan.meta?.state || 'VA', deps.states, 'text')}</div></div>
        <div class="gpc-meta"><span class="gpc-meta__k">Plan through</span>
          <span class="gpc-meta__v gpc-meta__v--static">${planEnd}</span></div>
      </div>
      <hr class="gpc-rule">
      <h2 class="gpc-section-head">Who is this plan for?</h2>
      <div class="gpc-person-tabs" role="tablist">
        <button type="button" role="tab" class="${tab === 'primary' ? 'is-on' : ''}" data-hh-action="gpc-person-tab" data-person-tab="primary" aria-selected="${tab === 'primary'}">Person 1</button>
        <button type="button" role="tab" class="${tab === 'spouse' ? 'is-on' : ''}" data-hh-action="gpc-person-tab" data-person-tab="spouse" aria-selected="${tab === 'spouse'}">Person 2</button>
        <button type="button" role="tab" class="${tab === 'child' ? 'is-on' : ''}" data-hh-action="gpc-person-tab" data-person-tab="child" aria-selected="${tab === 'child'}">+ Dependent</button>
      </div>
      ${personPane}
    </div>`;
  }

  function stepBalance(){
    const plan = deps.plan;
    const accounts = deps.allAccounts();

    const rows = accounts.map(a =>
      `<div class="gpc-field-row">` +
        `<span class="gpc-field-row__lbl">${escHtml(a.label)}</span>` +
        `<span class="gpc-in-wrap"><span class="gpc-in-wrap__pre">$</span>` +
        `<input class="gpc-in gpc-in--wide" type="text" inputmode="numeric" data-path="${a.balPath}" data-type="money" ` +
        `value="${Math.round(Number(a.balance) || 0) ? Math.round(Number(a.balance)).toLocaleString('en-US') : ''}" placeholder="—" aria-label="${escHtml(a.label)} balance"></span>` +
        `<button type="button" class="row-x" data-rmpath="portfolio.extraAccounts.${a.idx}" aria-label="Remove ${escHtml(a.label)}">×</button></div>`
    ).join('');

    const propRows = (plan.properties || []).map((p, i) =>
      `<div class="gpc-field-row">` +
        `<span class="gpc-field-row__lbl">${escHtml(p.name || 'Real estate')}</span>` +
        `<span class="gpc-in-wrap"><span class="gpc-in-wrap__pre">$</span>` +
        `<input class="gpc-in gpc-in--wide" type="text" inputmode="numeric" data-path="properties.${i}.value" data-type="money" ` +
        `value="${Math.round(Number(p.value) || 0) ? Math.round(Number(p.value)).toLocaleString('en-US') : ''}" placeholder="—"></span>` +
        `<button type="button" class="row-x" data-rmpath="properties.${i}" aria-label="Remove property">×</button></div>`
    ).join('');

    const catalog = GPC_ACCOUNT_CATALOG.map(group =>
      `<section class="gpc-acct-group">
        <h2 class="gpc-acct-group__head">${escHtml(group.heading)}</h2>
        <div class="gpc-acct-btns">
          ${group.items.map(item =>
            `<button type="button" data-hh-action="gpc-add-account" data-acct-type-id="${item.typeId}" data-acct-owner="${item.owner}" data-acct-label="${escHtml(item.label)}">+ ${escHtml(item.label)}</button>`
          ).join('')}
        </div>
      </section>`
    ).join('');

    return `<div class="gpc-step">
      <p class="gpc-eyebrow">Step II — Balance sheet</p>
      <h1 class="gpc-subtitle">Investment Accounts · Tangible Property · Debt</h1>
      <div class="gpc-acct-catalog">${catalog}</div>
      <div class="gpc-acct-list">${rows}${propRows}</div>
    </div>`;
  }

  function stepIncome(){
    const plan = deps.plan;
    const mode = state.gpcWorkMode || 'employed';
    const employedOn = mode === 'employed';

    const employedRows = employedOn
      ? incomeSlotRow(plan, { typeId: 'wages', owner: 'client', label: 'Salary', personLabel: plan.meta?.primaryName || 'Client' })
        + incomeSlotRow(plan, { typeId: 'bonus', owner: 'client', label: 'Bonus', personLabel: plan.meta?.primaryName || 'Client' })
        + (plan.household?.spouse
          ? incomeSlotRow(plan, { typeId: 'wages', owner: 'spouse', label: 'Salary', personLabel: plan.meta?.spouseName || 'Co-client' })
            + incomeSlotRow(plan, { typeId: 'bonus', owner: 'spouse', label: 'Bonus', personLabel: plan.meta?.spouseName || 'Co-client' })
          : '')
      : ssRow(plan, deps, 'client') + ssRow(plan, deps, 'spouse');

    const expenseRows = `<div class="gpc-field-row"><label class="gpc-field-row__lbl">Essential expenses</label>${deps.field('expenses.living', 'money')}</div>`;

    const addIncome = state.hhAddingKey === 'income'
      ? `<div class="gpc-inline-form gpc-inline-form--wide">
          <select class="gpc-sel" data-hh-draft="type">${['wages','bonus','interest','dividends','rental','pension','other'].map(id =>
            `<option value="${id}">${escHtml(incomeType(id).label)}</option>`).join('')}</select>
          <select class="gpc-sel" data-hh-draft="owner">${ownerOptions(plan, 'client')}</select>
          <span class="gpc-in-wrap"><span class="gpc-in-wrap__pre">$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0"></span>
          <button class="gpc-btn gpc-btn--primary" type="button" data-hh-action="commit-add">Add</button>
          <button class="gpc-btn gpc-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button>
        </div>`
      : `<button type="button" class="gpc-text-add" data-hh-action="open-add" data-add-key="income">+ Add income stream</button>`;

    const addExpense = state.hhAddingKey === 'spending'
      ? `<div class="gpc-inline-form">
          <input class="gpc-inline-in" data-hh-draft="label" placeholder="Category">
          <span class="gpc-in-wrap"><span class="gpc-in-wrap__pre">$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0"></span>
          <button class="gpc-btn gpc-btn--primary" type="button" data-hh-action="commit-add">Add</button>
          <button class="gpc-btn gpc-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button>
        </div>`
      : `<button type="button" class="gpc-text-add" data-hh-action="open-add" data-add-key="spending">+ Add expense category</button>`;

    const extras = (plan.expenses?.extra || []).map((row, i) =>
      `<div class="gpc-field-row"><input class="gpc-inline-in" data-path="expenses.extra.${i}.label" data-type="text" value="${escHtml(row.label || 'Category')}">
        <span class="gpc-in-wrap"><span class="gpc-in-wrap__pre">$</span>${deps.field(`expenses.extra.${i}.amount`, 'money')}</span>
        <button type="button" class="row-x" data-rmpath="expenses.extra.${i}">×</button></div>`
    ).join('');

    return `<div class="gpc-step">
      <p class="gpc-eyebrow">Step III — Income &amp; expenses</p>
      <div class="gpc-work-toggle" role="group" aria-label="Employment status">
        <button type="button" class="${employedOn ? 'is-on' : ''}" data-hh-action="gpc-work-mode" data-work-mode="employed" aria-pressed="${employedOn}">Still working</button>
        <button type="button" class="${!employedOn ? 'is-on' : ''}" data-hh-action="gpc-work-mode" data-work-mode="retired" aria-pressed="${!employedOn}">Retired</button>
      </div>
      <div class="gpc-income-list">${employedRows}</div>
      <div class="gpc-income-list">${expenseRows}${extras}</div>
      <div class="gpc-add-links">${addIncome}${addExpense}</div>
    </div>`;
  }

  function ownerOptions(plan, selected){
    const rows = [['client', plan.meta?.primaryName || 'Client 1']];
    if(plan.household?.spouse) rows.push(['spouse', plan.meta?.spouseName || 'Client 2']);
    rows.push(['joint', 'Joint']);
    return rows.map(([value, label]) =>
      `<option value="${value}" ${value === selected ? 'selected' : ''}>${escHtml(label)}</option>`).join('');
  }

  function stepTax(){
    const plan = deps.plan;
    const summary = deps.incomeTaxSummary();
    const deductions = plan.incomeTax?.deductions || [];
    const ready = summary.status === 'ready';

    const dedBtns = GPC_DEDUCTION_TYPES.map(d => {
      const has = deductions.some(r => r.typeId === d.id);
      return `<button type="button" data-hh-action="gpc-add-deduction" data-ded-type="${d.id}" ${has ? 'disabled' : ''}>+ ${escHtml(d.label.replace(' giving', '').replace(' expenses', ''))}</button>`;
    }).join('');

    const dedRows = deductions.map((row, i) => deductionRow(deps, row, i)).join('');

    const stdDed = ready ? summary.standardDeduction : null;
    const itemDed = ready ? summary.itemizedDeduction : enteredDeductionTotal(plan);
    const useItemized = ready && summary.deductionMethod === 'Itemized';

    const cards = ready ? `
      <div class="gpc-tax-cards">
        <div class="gpc-tax-card${useItemized ? ' gpc-tax-card--muted' : ''}">
          <div class="gpc-tax-card__k">Standard</div>
          <div class="gpc-tax-card__v">${money(stdDed)}</div></div>
        <div class="gpc-tax-card${useItemized ? ' gpc-tax-card--win' : ''}">
          <div class="gpc-tax-card__k">${useItemized ? 'Itemized · Auto-selected' : 'Itemized'}</div>
          <div class="gpc-tax-card__v">${money(itemDed)}</div></div>
      </div>
      <div class="gpc-tax-math">
        ${taxMathRow('Total income', money(summary.totalIncome))}
        ${taxMathRow('− Adjustments', money(summary.adjustments || 0))}
        ${taxMathRow('AGI', money(summary.adjustedGrossIncome), true)}
        ${taxMathRow('− Deductions', money(summary.deductionUsed))}
        ${taxMathRow('Taxable income', money(summary.taxableIncome), true, true)}
        <div class="gpc-tax-rates">
          <span>Federal bracket <strong>${rate(summary.marginalRate)}</strong></span>
          <span>Capital gains <strong>${rate(summary.capitalGainsRate)}</strong></span>
          <span>Effective rate <strong>${rate(summary.effectiveRate)}</strong></span>
          <span>Est. federal tax <strong class="gpc-tax-rates__hi">${money(summary.federalTaxLiability)}</strong></span>
        </div>
      </div>` : `<p class="gpc-intro gpc-intro--note">${escHtml(summary.message || 'Enter filing status and income on prior steps.')}</p>`;

    return `<div class="gpc-step">
      <p class="gpc-eyebrow">Step IV — Tax</p>
      <h1 class="gpc-title">The tax picture</h1>
      <p class="gpc-intro">Deductions you claim, and what the planning engine computes from them. Results are read-only.</p>
      <div class="gpc-tax-panel">
        <h2 class="gpc-section-head">Any deductions to claim?</h2>
        <div class="gpc-acct-btns">${dedBtns}</div>
        <div class="gpc-ded-list">${dedRows}</div>
        ${deductions.length === 0 ? `<p class="gpc-helper">Until then, the standard deduction applies automatically when filing status is set.</p>` : ''}
        ${cards}
      </div>
    </div>`;
  }

  function stepSummary(){
    const plan = deps.plan;
    const all = deps.allAccounts();
    const visible = plan.household?.spouse ? all : all.filter(a => a.owner === 'client' || a.owner === 'joint' || a.owner === 'trust');
    const total = hhNetWorthTotal(plan);
    const pn = plan.meta?.primaryName || 'Client';
    const sn = plan.meta?.spouseName || 'Co-client';
    const householdName = plan.household?.spouse ? `${pn} & ${sn}` : pn;
    const denom = total || 1;
    const alloc = visible.slice().sort((a, b) => (b.balance || 0) - (a.balance || 0)).map(a => {
      const tr = accountTreatment(a.label);
      const pct = Math.round((a.balance || 0) / denom * 100);
      return `<div class="gpc-bp-alloc"><span class="gpc-bp-alloc__name"><span class="gpc-bp-alloc__dot" style="background:${tr.color}"></span>${escHtml(a.label)}</span>
        <span class="gpc-bp-alloc__nums"><span>${pct}%</span><span>${hhMoney(a.balance)}</span></span></div>`;
    }).join('');

    return `<div class="gpc-step gpc-step--summary">
      <p class="gpc-eyebrow">Summary</p>
      <h1 class="gpc-title">The household, assembled.</h1>
      <p class="gpc-intro">${escHtml(householdName)} · ${escHtml(filingStateLine(plan))}</p>
      <div class="gpc-summary-grid">
        <div class="gpc-summary-read">
          <div class="gpc-summary-row"><span>I Family</span><span>Complete</span></div>
          <div class="gpc-summary-row"><span>II Balance sheet</span><span>${visible.length} accounts</span></div>
          <div class="gpc-summary-row"><span>III Income</span><span>${money(deps.incomeTaxSummary().totalIncome || 0)}</span></div>
          <div class="gpc-summary-row"><span>IV Tax</span><span>${deps.incomeTaxSummary().status === 'ready' ? money(deps.incomeTaxSummary().federalTaxLiability) + ' est.' : '—'}</span></div>
        </div>
        <div class="gpc-bp-gauge-wrap">
          <div class="gpc-bp-gauge">
            ${renderGaugeSvg(visible, visible.reduce((s, a) => s + (a.balance || 0), 0))}
            <div class="gpc-bp-gauge__center">
              <div class="gpc-bp-gauge__k">NET WORTH</div>
              <div class="gpc-bp-gauge__v">${hhCompact(total)}</div>
              <div class="gpc-bp-gauge__sub">${visible.length} account${visible.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div class="gpc-bp-alloc-list">${alloc}</div>
        </div>
      </div>
    </div>`;
  }

  function sidebarFoot(step){
    const plan = deps.plan;
    const summary = deps.incomeTaxSummary();
    if(step === 2){
      return `<div class="gpc-foot-k">Net worth</div><div class="gpc-foot-nw">${hhMoney(hhNetWorthTotal(plan))}</div>`;
    }
    if(step === 4){
      const ready = summary.status === 'ready';
      return `<div class="gpc-foot-k">This household</div>
        <div class="gpc-foot-row"><strong>AGI</strong><br>${ready ? money(summary.adjustedGrossIncome) : '—'}</div>
        <div class="gpc-foot-row"><strong>Deductions applied</strong><br>${ready ? `${money(summary.deductionUsed)} · ${summary.deductionMethod?.toLowerCase() || 'standard'}` : 'Standard · —'}</div>
        <div class="gpc-foot-row"><strong>Federal bracket</strong><br>${ready ? rate(summary.marginalRate) : '—'}</div>
        <div class="gpc-foot-row"><strong>Next IRMAA tier</strong><br>Not modeled</div>`;
    }
    if(step === 1){
      const pn = plan.meta?.primaryName || 'Client';
      const sn = plan.meta?.spouseName || 'Co-client';
      const hh = plan.household?.spouse ? `${pn} & ${sn}` : pn;
      return `<div class="gpc-foot-k">This household</div>
        <div class="gpc-foot-row"><strong>Household</strong><br>${escHtml(hh)}</div>
        <div class="gpc-foot-row"><strong>Filing status</strong><br>${escHtml(FS_LABELS[plan.meta?.filingStatus] || 'Select…')}</div>
        <div class="gpc-foot-row"><strong>State</strong><br>${escHtml(STATE_NAMES[plan.meta?.state] || plan.meta?.state || 'Select…')}</div>`;
    }
    return '';
  }

  function footer(step){
    const back = step > 1
      ? `<button type="button" class="gpc-btn gpc-btn--ghost" data-hh-action="step-back">← Back</button>`
      : `<span></span>`;
    const label = step < 5 ? (step === 4 ? 'Finish' : 'Continue') : '';
    const right = step < 5
      ? `<button type="button" class="gpc-btn gpc-btn--primary" data-hh-action="step-next">${label}</button>`
      : `<span class="gpc-foot-note">Step 5 of 5</span>`;
    return `<div class="gpc-footer">${back}${right}</div>`;
  }

  return {
    steps: { 1: stepFamily, 2: stepBalance, 3: stepIncome, 4: stepTax, 5: stepSummary },
    footer,
    sidebarFoot,
    stepLabels: ['Family', 'Balance sheet', 'Income & expenses', 'Tax', 'Summary'],
    stepNums: ['I', 'II', 'III', 'IV', '✓'],
  };
}
