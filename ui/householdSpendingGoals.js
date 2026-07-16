import { escHtml } from './dom.js';

const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');

function expenseRow(deps, label, path, removable = false){
  return `<div class="hh-sg-row"><span>${label}</span><span class="hh-sg-row__end">${deps.field(path, 'money')}${removable ? `<button class="row-x" data-rmpath="${path.replace(/\.amount$/, '')}" title="Remove spending category">×</button>` : ''}</span></div>`;
}

function addForm(){
  return `<div class="hh-it-add-form"><input data-hh-draft="label" placeholder="Category"><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0"></span><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>`;
}

function addControl(state){
  return state.hhAddingKey === 'spending'
    ? addForm()
    : `<button class="hh-it-add" type="button" data-hh-action="open-add" data-add-key="spending">+ Add category</button>`;
}

/** Retirement spending block embedded in Profile (goals stay on the Goals page). */
export function renderHouseholdSpending(plan, deps, state){
  const extras = plan.expenses?.extra || [];
  const spendingTotal = (plan.expenses?.living || 0) + (plan.expenses?.healthcare || 0)
    + (plan.expenses?.housing || 0) + (plan.expenses?.debt || 0)
    + extras.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return `<div class="hh-sg hh-sg--profile">
    <div class="hh-it-section-head"><span>RETIREMENT SPENDING</span><strong>${money(spendingTotal)} /yr</strong></div>
    ${expenseRow(deps, 'Living', 'expenses.living')}
    ${expenseRow(deps, 'Healthcare', 'expenses.healthcare')}
    ${plan.expenses?.housing != null ? expenseRow(deps, 'Housing', 'expenses.housing') : ''}
    ${plan.expenses?.debt != null ? expenseRow(deps, 'Debt payments', 'expenses.debt') : ''}
    ${extras.map((row, index) => `<div class="hh-sg-row"><input class="hh-sg-name" data-path="expenses.extra.${index}.label" data-type="text" value="${escHtml(row.label || 'Category')}"><span class="hh-sg-row__end">${deps.field(`expenses.extra.${index}.amount`, 'money')}<button class="row-x" data-rmpath="expenses.extra.${index}" title="Remove category">×</button></span></div>`).join('')}
    ${addControl(state)}
    <div class="hh-sg-foundation"><span>ANALYSIS BOUNDARY</span><strong>Portfolio withdrawals begin when both clients are retired.</strong><small>Parallax does not test whether working-year income covers lifestyle spending. Goals are edited on the Goals page.</small></div>
  </div>`;
}
