import { escHtml } from './dom.js';

const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');

function expenseRow(deps, label, path, removable = false){
  return `<div class="hh-sg-row"><span>${label}</span><span class="hh-sg-row__end">${deps.field(path, 'money')}${removable ? `<button class="row-x" data-rmpath="${path.replace(/\.amount$/, '')}" title="Remove spending category">×</button>` : ''}</span></div>`;
}

function goalRow(deps, goal, index){
  const base = `goals.${index}`;
  const beforeRetirement = goal.fundFromPortfolioBeforeRetirement === true;
  return `<div class="hh-sg-goal">
    <span class="hh-sg-goal__copy"><input class="hh-sg-name" data-path="${base}.name" data-type="text" value="${escHtml(goal.name || 'Goal')}" aria-label="Goal name"><span>Age ${deps.field(`${base}.startAge`, 'age')} → ${deps.field(`${base}.endAge`, 'age')}</span><label><input type="checkbox" data-path="${base}.fundFromPortfolioBeforeRetirement" data-type="bool" ${beforeRetirement ? 'checked' : ''}> Use portfolio before both clients retire</label></span>
    <span class="hh-sg-row__end">${deps.field(`${base}.amount`, 'money')}<button class="row-x" data-rmpath="${base}" title="Remove goal">×</button></span>
  </div>`;
}

function addForm(key){
  return `<div class="hh-it-add-form"><input data-hh-draft="label" placeholder="${key === 'goal' ? 'Goal name' : 'Category'}"><span class="hh-it-add-form__money"><span>$</span><input data-hh-draft="amount" inputmode="numeric" placeholder="0"></span><button class="hh-btn hh-btn--primary" type="button" data-hh-action="commit-add">Add</button><button class="hh-btn hh-btn--ghost" type="button" data-hh-action="cancel-add">Cancel</button></div>`;
}

function addControl(state, key, label){
  return state.hhAddingKey === key ? addForm(key) : `<button class="hh-it-add" type="button" data-hh-action="open-add" data-add-key="${key}">+ Add ${label}</button>`;
}

export function renderHouseholdSpendingGoals(plan, deps, state){
  const extras = plan.expenses?.extra || [];
  const goals = Array.isArray(plan.goals) ? plan.goals : [];
  const spendingTotal = (plan.expenses?.living || 0) + (plan.expenses?.healthcare || 0)
    + (plan.expenses?.housing || 0) + (plan.expenses?.debt || 0)
    + extras.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const goalsTotal = goals.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return `<div class="hh-step-pane hh-sg">
    <h2 class="hh-step-title hh-it__title">Spending &amp; Goals</h2>
    <p class="hh-it__intro">Retirement lifestyle and planned goals. Working-year budgeting stays outside the analysis.</p>
    <div class="hh-it-grid">
      <section><div class="hh-it-section-head"><span>RETIREMENT SPENDING</span><strong>${money(spendingTotal)} /yr</strong></div>
        ${expenseRow(deps, 'Living', 'expenses.living')}
        ${expenseRow(deps, 'Healthcare', 'expenses.healthcare')}
        ${plan.expenses?.housing != null ? expenseRow(deps, 'Housing', 'expenses.housing') : ''}
        ${plan.expenses?.debt != null ? expenseRow(deps, 'Debt payments', 'expenses.debt') : ''}
        ${extras.map((row, index) => `<div class="hh-sg-row"><input class="hh-sg-name" data-path="expenses.extra.${index}.label" data-type="text" value="${escHtml(row.label || 'Category')}"><span class="hh-sg-row__end">${deps.field(`expenses.extra.${index}.amount`, 'money')}<button class="row-x" data-rmpath="expenses.extra.${index}" title="Remove category">×</button></span></div>`).join('')}
        ${addControl(state, 'spending', 'category')}
      </section>
      <section><div class="hh-it-section-head"><span>GOALS</span><strong>${money(goalsTotal)}</strong></div>
        ${goals.map((goal, index) => goalRow(deps, goal, index)).join('') || '<p class="hh-it-empty">No goals entered.</p>'}
        ${addControl(state, 'goal', 'goal')}
        <p class="hh-sg-doctrine">Before both clients retire, goals are assumed paid from working income unless the portfolio option is explicitly selected.</p>
      </section>
    </div>
    <div class="hh-sg-foundation"><span>ANALYSIS BOUNDARY</span><strong>Portfolio withdrawals begin when both clients are retired.</strong><small>Parallax does not test whether working-year income covers lifestyle spending.</small></div>
  </div>`;
}
