import { escHtml } from './dom.js';

const FS_LABELS = {
  marriedFilingJointly: 'Married filing jointly',
  single: 'Single',
  headOfHousehold: 'Head of household',
  marriedFilingSeparately: 'Married filing separately',
};

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

export function hhMoney(v){
  const n = Math.round(Number(v) || 0);
  return (n < 0 ? '–$' : '$') + Math.abs(n).toLocaleString('en-US');
}

export function hhCompact(v){
  const x = Math.abs(Number(v) || 0);
  if(x >= 1e6) return '$' + (x / 1e6).toFixed(x % 1e6 === 0 ? 0 : (x / 1e6 >= 10 ? 1 : 2)).replace(/\.?0+$/, '') + 'M';
  if(x >= 1e3) return '$' + Math.round(x / 1e3) + 'K';
  return '$' + Math.round(x);
}

export function accountTreatment(type){
  const t = (type || '').toLowerCase();
  if(/roth|hsa|529/.test(t)) return { label: 'Tax-free', color: '#879a86' };
  if(/brokerage|taxable|checking|savings|trust|money market|cd|joint/.test(t)) return { label: 'Taxable', color: '#7688a0' };
  return { label: 'Tax-deferred', color: '#c3a56a' };
}

export function renderGaugeSvg(accounts, total){
  const ringR = 100, ringC = 2 * Math.PI * ringR, arcLen = ringC * 0.75;
  const denom = total || 1;
  const sorted = accounts.slice().sort((a, b) => (b.balance || 0) - (a.balance || 0));
  let acc = 0;
  const circles = [
    `<circle cx="120" cy="120" r="${ringR}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="6" stroke-linecap="butt" stroke-dasharray="${arcLen} ${ringC - arcLen}"></circle>`,
  ];
  sorted.forEach((a, i) => {
    const frac = (a.balance || 0) / denom;
    const segGap = sorted.length > 1 ? 7 : 0;
    const len = Math.max(0.5, frac * arcLen - segGap);
    const off = -(acc * arcLen);
    const color = accountTreatment(a.label || a.type).color;
    circles.push(`<circle cx="120" cy="120" r="${ringR}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="butt" stroke-dasharray="${len} ${ringC - len}" stroke-dashoffset="${off}"></circle>`);
    acc += frac;
  });
  return `<svg class="hh-bp-gauge__svg" viewBox="0 0 240 240" aria-hidden="true">${circles.join('')}</svg>`;
}

function filingStateLine(plan){
  const fs = FS_LABELS[plan.meta?.filingStatus] || (plan.household?.spouse ? 'Married filing jointly' : 'Single');
  const st = STATE_NAMES[plan.meta?.state] || plan.meta?.state || '—';
  return `${fs} · ${st}`;
}

function personColumn(role, plan, deps){
  const isC = role === 'client';
  if(!isC && !plan.household?.spouse){
    return `<div class="hh-col hh-col--placeholder">
      <button class="hh-dash-btn" type="button" data-hh-action="add-spouse">+ Add co-client</button>
    </div>`;
  }
  const p = plan.household[isC ? 'primary' : 'spouse'] || {};
  const base = isC ? 'household.primary' : 'household.spouse';
  const nameP = isC ? 'meta.primaryName' : 'meta.spouseName';
  const born = p.birthYear || (p.currentAge != null ? new Date().getFullYear() - p.currentAge : '');
  const init = deps.initial(getPath(plan, nameP), isC ? 'C' : 'CC');
  const derivedIn = (val) =>
    `<input type="text" class="hh-derived-in" readonly tabindex="-1" aria-readonly="true" value="${val ?? '—'}">`;
  const rows = [
    ['Name', deps.field(nameP, 'text', { ph: isC ? 'Client name' : 'Co-client name' })],
    ['Born', `<input type="number" data-path="${base}.birthYear" data-type="birthYear" value="${born}" step="1" class="hh-born-in">`],
    ['Age', derivedIn(p.currentAge)],
    ['Retires at', deps.field(base + '.retirementAge', 'age')],
    ['Plan to age', isC ? deps.field('household.primary.planEndAge', 'age') : derivedIn(plan.household.primary?.planEndAge)],
  ];
  const rowHtml = rows.map(([k, v], i) =>
    `<div class="hh-kv${i < rows.length - 1 ? ' hh-kv--rule' : ''}"><span class="hh-kv__k">${k}</span><span class="hh-kv__v">${v}</span></div>`
  ).join('');
  const headAct = isC ? '' : `<button class="hh-link-btn" type="button" data-hh-action="remove-spouse">Remove</button>`;
  return `<div class="hh-col">
    <div class="hh-col__head">
      <span class="hh-col__id"><span class="hh-av hh-av--${isC ? 'c' : 's'}">${init}</span><span class="hh-col__role">${isC ? 'CLIENT' : 'CO-CLIENT'}</span></span>
      ${headAct}
    </div>
    <div class="hh-kv-stack">${rowHtml}</div>
  </div>`;
}

function getPath(o, p){ return p.split('.').reduce((a, k) => a && a[k], o); }

function acctRow(a, deps){
  return `<div class="hh-ledger-row">
    <span class="hh-ledger-row__name">${escHtml(a.label)}</span>
    <span class="hh-ledger-row__end">
      <span class="hh-ledger-row__amt">${deps.field(a.balPath, 'money')}</span>
      <button class="row-x" title="Remove account" data-rmpath="portfolio.extraAccounts.${a.idx}">×</button>
    </span>
  </div>`;
}

function acctAddForm(owner, deps, state){
  if(state.hhAcctFormOwner !== owner) return '';
  const typeOpts = deps.accountTypes.map((t, i) => `<option value="${i}">${escHtml(t.label)}</option>`).join('');
  return `<div class="hh-inline-form" id="hh-acct-form">
    <div class="hh-inline-form__field"><span class="hh-inline-form__k">Account type</span>
      <select class="hh-sel hh-form-type" aria-label="Account type">${typeOpts}</select></div>
    <div class="hh-inline-form__field"><span class="hh-inline-form__k">Amount</span>
      <span class="hh-inline-form__money"><span class="pre">$</span><input class="hh-form-val" type="text" inputmode="numeric" data-type="money" placeholder="0" aria-label="Account value"></span></div>
    <div class="hh-inline-form__acts">
      <button class="hh-btn hh-btn--primary" type="button" data-hh-action="save-account">Add</button>
      <button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-account">Cancel</button>
    </div>
  </div>`;
}

function acctOwnerColumn(owner, plan, deps, state){
  const isC = owner === 'client';
  const accts = deps.allAccounts().filter(x => {
    if(isC) return x.owner === 'client' || x.owner === 'joint' || x.owner === 'trust';
    return x.owner === 'spouse';
  });
  const inv = accts.reduce((s, x) => s + (x.balance || 0), 0);
  if(!isC && !plan.household?.spouse){
    return `<div class="hh-col hh-col--placeholder">
      <button class="hh-dash-btn" type="button" data-hh-action="add-spouse">+ Add co-client</button>
    </div>`;
  }
  const init = isC ? deps.initial(plan.meta?.primaryName, 'C')
    : deps.initial(plan.meta?.spouseName, 'CC');
  const title = isC ? 'CLIENT' : 'CO-CLIENT';
  const rows = accts.map(a => acctRow(a, deps)).join('');
  return `<div class="hh-col">
    <div class="hh-col__head hh-col__head--total">
      <span class="hh-col__id"><span class="hh-av hh-av--${isC ? 'c' : 's'}">${init}</span><span class="hh-col__role">${title}</span></span>
      <span class="hh-col__sum">${hhMoney(inv)}</span>
    </div>
    ${rows}
    ${acctAddForm(owner, deps, state)}
    ${state.hhAcctFormOwner !== owner ? `<button class="hh-dash-btn" type="button" data-hh-action="open-account-form" data-owner="${owner}">+ Add account</button>` : ''}
  </div>`;
}

function workingIncomeSum(plan){
  return (plan.income?.other || []).reduce((s, x) => s + (x.amount || 0), 0);
}

function housingExpense(plan){
  const extra = plan.expenses?.extra || [];
  const extraIdx = extra.findIndex(x => (x.label || '').trim().toLowerCase() === 'housing');
  if(extraIdx >= 0) return { path: `expenses.extra.${extraIdx}.amount`, amount: extra[extraIdx].amount || 0 };
  const amount = plan.expenses?.housing || 0;
  return amount ? { path: 'expenses.housing', amount } : null;
}

function fixedSpendingTotal(plan){
  const extra = plan.expenses?.extra || [];
  const housingInExtra = extra.some(x => (x.label || '').trim().toLowerCase() === 'housing');
  return (plan.expenses?.living || 0)
    + (plan.expenses?.healthcare || 0)
    + extra.reduce((s, x) => s + (x.amount || 0), 0)
    + (housingInExtra ? 0 : (plan.expenses?.housing || 0));
}

function deferredIncomeSum(plan){
  const ss = plan.income?.socialSecurity || {};
  let total = 0;
  if(ss.primary?.pia) total += ss.primary.pia;
  if(plan.household?.spouse && ss.spouse?.pia) total += ss.spouse.pia;
  return total;
}

function blueprintFlowRows(plan, spendTotal){
  const income = workingIncomeSum(plan);
  const ss = deferredIncomeSum(plan);
  const savings = plan.savings?.annual || 0;
  return `<div class="hh-bp-flow">
    <div class="hh-bp-flow__row">
      <span class="hh-bp-flow__label">Income</span>
      <b class="hh-bp-flow__val">${hhMoney(income)}</b>
    </div>
    ${savings > 0 ? `<div class="hh-bp-flow__row">
      <span class="hh-bp-flow__label">Annual savings</span>
      <b class="hh-bp-flow__val hh-bp-flow__val--sage">${hhMoney(savings)}</b>
    </div>` : ''}
    <div class="hh-bp-flow__row">
      <span class="hh-bp-flow__label">Spending</span>
      <b class="hh-bp-flow__val">${hhMoney(spendTotal)}</b>
    </div>
    <div class="hh-bp-flow__row">
      <span class="hh-bp-flow__label">Social Security</span>
      <b class="hh-bp-flow__val hh-bp-flow__val--sage">${hhMoney(ss)}</b>
    </div>
  </div>`;
}

export function createHouseholdWizard(deps){
  const state = deps.uiState;

  function stepPeople(){
    const plan = deps.plan;
    const FS_OPTS = [
      ['marriedFilingJointly', 'Married filing jointly'],
      ['single', 'Single'],
      ['headOfHousehold', 'Head of household'],
      ['marriedFilingSeparately', 'Married filing separately'],
    ];
    const defaultFs = plan.household?.spouse ? 'marriedFilingJointly' : 'single';
    const fsVal = plan.meta?.filingStatus || defaultFs;
    const kids = plan.household?.children || [];
    const childAdd = state.hhAddingKey === 'child'
      ? `<div class="hh-inline-form hh-inline-form--slim">
          <input class="hh-inline-input" data-hh-draft="label" placeholder="Child's name" value="${escHtml(state.hhDraftLabel || '')}">
          <input class="hh-inline-input hh-born-in" data-hh-draft="year" type="number" placeholder="Born" value="${escHtml(state.hhDraftAmount || '')}">
          <button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button>
          <button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button>
        </div>`
      : `<button class="hh-text-add" type="button" data-hh-action="open-add" data-add-key="child">+ Add</button>`;
    const childRows = kids.map((k, i) => {
      const base = `household.children.${i}`;
      const age = deps.ageFromYear(k.birthYear);
      return `<div class="hh-kv hh-kv--rule">
        <span class="hh-kv__k">${escHtml(k.name || 'Child')}</span>
        <span class="hh-kv__v">${k.birthYear || '—'}${age != null ? ` · age ${age}` : ''}
          <button class="row-x" data-rmpath="${base}" title="Remove child">×</button></span>
      </div>`;
    }).join('');
    return `<div class="hh-step-pane">
      <h2 class="hh-step-title">Household</h2>
      <div class="hh-cols hh-cols--split">
        ${personColumn('client', plan, deps)}
        <div class="hh-cols__div" aria-hidden="true"></div>
        ${personColumn('spouse', plan, deps)}
      </div>
      <div class="hh-meta-row">
        <div class="hh-meta"><span class="hh-meta__k">Filing</span>
          <div class="hh-meta__v">${deps.select('meta.filingStatus', fsVal, FS_OPTS, 'text')}</div></div>
        <div class="hh-meta"><span class="hh-meta__k">State</span>
          <div class="hh-meta__v">${deps.select('meta.state', plan.meta?.state || 'VA', deps.states, 'text')}</div></div>
        <div class="hh-meta"><span class="hh-meta__k">Children</span>
          <div class="hh-meta__v">${childRows}${childAdd}</div></div>
      </div>
    </div>`;
  }

  function stepBalance(){
    const plan = deps.plan;
    const all = deps.allAccounts();
    const visible = plan.household?.spouse ? all : all.filter(a => a.owner === 'client' || a.owner === 'joint' || a.owner === 'trust');
    const total = visible.reduce((s, a) => s + (a.balance || 0), 0);
    const count = visible.length;
    return `<div class="hh-step-pane">
      <h2 class="hh-step-title">Net Worth</h2>
      <div class="hh-cols hh-cols--split">
        ${acctOwnerColumn('client', plan, deps, state)}
        <div class="hh-cols__div" aria-hidden="true"></div>
        ${acctOwnerColumn('spouse', plan, deps, state)}
      </div>
      <div class="hh-grand-total">
        <div><div class="hh-grand-total__k">Total investable</div><div class="hh-grand-total__sub">${count} account${count === 1 ? '' : 's'}</div></div>
        <div class="hh-grand-total__v">${hhMoney(total)}</div>
      </div>
    </div>`;
  }

  function incomeRows(plan, deps){
    const items = (plan.income?.other || []);
    return items.map((it, i) => {
      const base = `income.other.${i}`;
      const startAge = it.startAge ?? plan.household?.primary?.currentAge ?? '—';
      const endAge = it.endAge ?? plan.household?.primary?.retirementAge ?? '—';
      return `<div class="hh-ledger-row hh-ledger-row--cf hh-ledger-row--income">
        <span class="hh-ledger-row__source">
          <input type="text" class="hh-ledger-row__name hh-ledger-row__name--in" data-path="${base}.label" data-type="text" placeholder="Source" value="${escHtml(it.label || '')}">
          <span class="hh-ledger-row__note">&middot; ${startAge}&ndash;${endAge}</span>
        </span>
        <span class="hh-ledger-row__end">
          <span class="hh-ledger-row__ages">
            <label><span class="hh-ledger-row__age-label">Start</span>${deps.field(base + '.startAge', 'age')}</label>
            <label><span class="hh-ledger-row__age-label">End</span>${deps.field(base + '.endAge', 'age')}</label>
          </span>
          <span class="hh-ledger-row__amt hh-ledger-row__amt--cf">${deps.field(base + '.amount', 'money')}</span>
          <button class="row-x" data-rmpath="${base}" title="Remove">×</button>
        </span>
      </div>`;
    }).join('');
  }

  function futureIncomeRows(plan){
    const rows = [];
    const ss = plan.income?.socialSecurity || {};
    const addSs = role => {
      const key = role === 'client' ? 'primary' : 'spouse';
      const block = ss[key];
      if(!block) return;
      if(role === 'spouse' && !plan.household?.spouse) return;
      const nm = role === 'client' ? (plan.meta?.primaryName || 'Client 1') : (plan.meta?.spouseName || 'Client 2');
      const base = `income.socialSecurity.${key}`;
      rows.push(`<div class="hh-future-row">
        <span class="hh-future-row__name">Social Security · ${escHtml(nm)}</span>
        <span class="hh-future-row__end">
          <label class="hh-future-row__claim">Claim age ${deps.field(base + '.claimAge', 'age', { min: 62, max: 70 })}</label>
          <span class="hh-future-row__amt">${deps.field(base + '.pia', 'money')}</span>
        </span>
      </div>`);
    };
    addSs('client');
    addSs('spouse');
    return rows.join('');
  }

  function spendingRows(plan, deps){
    const fixedRow = (label, path) =>
      `<div class="hh-ledger-row hh-ledger-row--cf">
        <span class="hh-ledger-row__name">${label}</span>
        <span class="hh-ledger-row__end"><span class="hh-ledger-row__amt hh-ledger-row__amt--cf">${deps.field(path, 'money')}</span></span>
      </div>`;
    const extra = plan.expenses?.extra || [];
    const housingIdx = extra.findIndex(x => (x.label || '').trim().toLowerCase() === 'housing');
    const extraRow = i => {
      const base = `expenses.extra.${i}`;
      return `<div class="hh-ledger-row hh-ledger-row--cf">
        <input type="text" class="hh-ledger-row__name hh-ledger-row__name--in" data-path="${base}.label" data-type="text" placeholder="Category" value="${escHtml(extra[i].label || '')}">
        <span class="hh-ledger-row__end">
          <span class="hh-ledger-row__amt hh-ledger-row__amt--cf">${deps.field(base + '.amount', 'money')}</span>
          <button class="row-x" data-rmpath="${base}" title="Remove">×</button>
        </span>
      </div>`;
    };
    let html = fixedRow('Living', 'expenses.living');
    html += fixedRow('Healthcare', 'expenses.healthcare');
    const housing = housingExpense(plan);
    if(housing) html += fixedRow('Housing', housing.path);
    extra.forEach((_, i) => { if(i !== housingIdx) html += extraRow(i); });
    return html;
  }

  function inlineAdd(key, placeholders){
    if(state.hhAddingKey !== key) return '';
    return `<div class="hh-inline-form hh-inline-form--slim">
      <input class="hh-inline-input" data-hh-draft="label" placeholder="${placeholders.label}" value="${escHtml(state.hhDraftLabel || '')}">
      ${placeholders.amount ? `<span class="hh-inline-form__money"><span class="pre">$</span><input class="hh-inline-input" data-hh-draft="amount" inputmode="numeric" placeholder="0" value="${escHtml(state.hhDraftAmount || '')}"></span>` : ''}
      <button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button>
      <button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button>
    </div>`;
  }

  function stepCashFlow(){
    const plan = deps.plan;
    const spendTotal = fixedSpendingTotal(plan);
    return `<div class="hh-step-pane">
      <h2 class="hh-step-title">Cash flow</h2>
      <div class="hh-cols hh-cols--gap">
        <div class="hh-col">
          <div class="hh-col__head hh-col__head--total hh-col__head--cf">
            <span class="hh-col__role">INCOME</span>
            <span class="hh-col__sum hh-col__sum--cf">${hhMoney(workingIncomeSum(plan))}</span>
          </div>
          ${incomeRows(plan, deps)}
          ${inlineAdd('income', { label: 'Source', amount: true })}
          ${state.hhAddingKey !== 'income' ? `<button class="hh-text-add" type="button" data-hh-action="open-add" data-add-key="income">+ Add income</button>` : ''}
          <div class="hh-subhead">Saving</div>
          <div class="hh-ledger-row hh-ledger-row--cf hh-ledger-row--savings">
            <span class="hh-ledger-row__name">Annual savings</span>
            <span class="hh-ledger-row__end"><span class="hh-ledger-row__amt hh-ledger-row__amt--cf">${deps.field('savings.annual', 'money')}</span></span>
          </div>
          <div class="hh-subhead">Begins at retirement</div>
          ${futureIncomeRows(plan)}
        </div>
        <div class="hh-col">
          <div class="hh-col__head hh-col__head--total hh-col__head--cf"><span class="hh-col__role">SPENDING</span><span class="hh-col__sum hh-col__sum--cf">${hhMoney(spendTotal)}</span></div>
          ${spendingRows(plan, deps)}
          ${inlineAdd('spending', { label: 'Category', amount: true })}
          ${state.hhAddingKey !== 'spending' ? `<button class="hh-text-add" type="button" data-hh-action="open-add" data-add-key="spending">+ Add category</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  function stepBlueprint(){
    const plan = deps.plan;
    const all = deps.allAccounts();
    const visible = plan.household?.spouse ? all : all.filter(a => a.owner === 'client' || a.owner === 'joint' || a.owner === 'trust');
    const total = visible.reduce((s, a) => s + (a.balance || 0), 0);
    const spendTotal = fixedSpendingTotal(plan);
    const pn = plan.meta?.primaryName || 'Client';
    const sn = plan.meta?.spouseName || 'Co-Client';
    const householdName = plan.household?.spouse ? `${pn} & ${sn}` : pn;
    const retireAges = plan.household?.spouse
      ? `${plan.household.primary?.retirementAge} & ${plan.household.spouse?.retirementAge}`
      : String(plan.household?.primary?.retirementAge ?? '—');
    const denom = total || 1;
    const alloc = visible.slice().sort((a, b) => (b.balance || 0) - (a.balance || 0)).map(a => {
      const tr = accountTreatment(a.label);
      const pct = Math.round((a.balance || 0) / denom * 100);
      return `<div class="hh-bp-alloc">
        <span class="hh-bp-alloc__name"><span class="hh-bp-alloc__dot" style="background:${tr.color}"></span>${escHtml(a.label)}</span>
        <span class="hh-bp-alloc__nums"><span class="hh-bp-alloc__pct">${pct}%</span><span class="hh-bp-alloc__amt">${hhMoney(a.balance)}</span></span>
      </div>`;
    }).join('');
    const cInit = deps.initial(pn, 'C');
    const sInit = deps.initial(sn, 'CC');
    return `<div class="hh-step-pane hh-step-pane--bp">
      <div class="hh-bp-sheet">
        <span class="hh-bp-corner hh-bp-corner--tl" aria-hidden="true"></span>
        <span class="hh-bp-corner hh-bp-corner--tr" aria-hidden="true"></span>
        <span class="hh-bp-corner hh-bp-corner--bl" aria-hidden="true"></span>
        <span class="hh-bp-corner hh-bp-corner--br" aria-hidden="true"></span>
        <div class="hh-bp-read">
          <div class="hh-bp-eyebrow">BLUEPRINT</div>
          <div class="hh-bp-house">
            <span class="hh-bp-avs"><span class="hh-av hh-av--c hh-av--lg">${cInit}</span>${plan.household?.spouse ? `<span class="hh-av hh-av--s hh-av--lg hh-av--overlap">${sInit}</span>` : ''}</span>
            <span class="hh-bp-house__name">${escHtml(householdName)}</span>
          </div>
          <div class="hh-bp-filing">${escHtml(filingStateLine(plan))}</div>
          <div class="hh-bp-facts">
            <div><span class="hh-bp-facts__k">RETIRE</span><span class="hh-bp-facts__v">${retireAges}</span></div>
            <div><span class="hh-bp-facts__k">HORIZON</span><span class="hh-bp-facts__v">${plan.household?.primary?.planEndAge ?? '—'}</span></div>
          </div>
          ${blueprintFlowRows(plan, spendTotal)}
        </div>
        <div class="hh-bp-inst">
          <div class="hh-bp-gauge">
            ${renderGaugeSvg(visible, total)}
            <div class="hh-bp-gauge__center">
              <div class="hh-bp-gauge__k">NET WORTH</div>
              <div class="hh-bp-gauge__v">${hhCompact(total)}</div>
              <div class="hh-bp-gauge__sub">${visible.length} account${visible.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div class="hh-bp-alloc-list" aria-label="Account allocation">${alloc}</div>
        </div>
      </div>
    </div>`;
  }

  function footer(step){
    const back = step > 1
      ? `<button class="hh-btn hh-btn--outline" type="button" data-hh-action="step-back">← Back</button>`
      : `<span></span>`;
    const right = step < 4
      ? `<button class="hh-btn hh-btn--primary" type="button" data-hh-action="step-next">${step === 3 ? 'Review →' : 'Continue →'}</button>`
      : `<span class="hh-wiz-foot-note">Step 4 of 4</span>`;
    return `<div class="hh-wiz-footer">${back}${right}</div>`;
  }

  return {
    steps: { 1: stepPeople, 2: stepBalance, 3: stepCashFlow, 4: stepBlueprint },
    footer,
    stepLabels: ['People & Timeline', 'Balance Sheet', 'Cash Flow', 'Blueprint'],
  };
}
