export const HH_VIEW_KEY = 'parallax.household.view';

export const HH_BUCKET = {
  taxable:     { label: 'Taxable', tone: 'var(--hh-taxable)' },
  traditional: { label: 'Pre-tax', tone: 'var(--hh-pre-tax)' },
  roth:        { label: 'Roth', tone: 'var(--hh-roth)' },
  real:        { label: 'Real estate', tone: 'var(--hh-real)' },
  liability:   { label: 'Liability', tone: 'var(--hh-liability)' },
};

const fallbackEsc = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function esc(ctx, value){
  return (ctx.escHtml || fallbackEsc)(value);
}

function money(ctx, value){
  return ctx.fmtMoney(value || 0);
}

export function compactMoney(value){
  const n = Math.round(Math.abs(value || 0));
  const sign = (value || 0) < 0 ? '-' : '';
  if(n >= 1000000) return `${sign}$${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if(n >= 1000) return `${sign}$${Math.round(n / 1000)}k`;
  return `${sign}$${n.toLocaleString('en-US')}`;
}

export function householdAccounts(plan){
  const accounts = (plan.portfolio && plan.portfolio.accounts) || {};
  const base = [
    {
      label: 'Taxable',
      bucket: 'taxable',
      path: 'portfolio.accounts.taxable.balance',
      value: (accounts.taxable && accounts.taxable.balance) || 0,
      core: true,
    },
    {
      label: 'Traditional',
      bucket: 'traditional',
      path: 'portfolio.accounts.traditional.balance',
      value: (accounts.traditional && accounts.traditional.balance) || 0,
      core: true,
    },
    {
      label: 'Roth',
      bucket: 'roth',
      path: 'portfolio.accounts.roth.balance',
      value: (accounts.roth && accounts.roth.balance) || 0,
      core: true,
    },
  ];
  const extra = (plan.portfolio.extraAccounts || []).map((account, index) => ({
    label: account.type || 'Account',
    bucket: account.bucket || 'taxable',
    value: account.balance || 0,
    extra: true,
    idx: index,
  }));
  return base.concat(extra).filter(account => account.core || account.value > 0);
}

export function householdRealAssets(plan){
  return (plan.properties || []).map((property, index) => ({
    label: property.name || `Property ${index + 1}`,
    bucket: 'real',
    value: property.value || 0,
    path: `properties.${index}.value`,
  }));
}

export function householdCurrentLiabilityRows(plan){
  const rows = [];
  (plan.properties || []).forEach((property, index) => {
    const mortgage = property.mortgage || {};
    if((mortgage.balance || 0) > 0){
      rows.push({
        label: `${property.name || `Property ${index + 1}`} mortgage`,
        bucket: 'liability',
        value: mortgage.balance || 0,
        path: `properties.${index}.mortgage.balance`,
        metaLabel: 'Current balance',
      });
    }
  });
  return rows;
}

export function householdPaymentLiabilityRows(plan){
  return (plan.liabilities || []).map((liability, index) => ({
    label: liability.label || `Liability ${index + 1}`,
    bucket: 'liability',
    value: liability.amount || 0,
    path: `liabilities.${index}.amount`,
    metaLabel: 'Annual payment stream',
    suffix: '/yr',
  }));
}

export function householdCurrentLiabilityTotal(plan){
  return householdCurrentLiabilityRows(plan).reduce((sum, row) => sum + (row.value || 0), 0);
}

export function householdNetWorthTotal(ctx){
  return ctx.investableTotal() + ctx.realAssetsTotal() - householdCurrentLiabilityTotal(ctx.plan);
}

function bucketMeta(bucket){
  return HH_BUCKET[bucket] || HH_BUCKET.taxable;
}

function renderHouseholdToggle(ctx){
  return `<div class="hh-view-toggle" role="group" aria-label="Household view">
    <button type="button" class="hh-toggle-btn ${ctx.householdView === 'map' ? 'on' : ''}" data-hh-view="map">Map</button>
    <button type="button" class="hh-toggle-btn ${ctx.householdView === 'networth' ? 'on' : ''}" data-hh-view="networth">Net Worth</button>
  </div>`;
}

function renderHouseholdPill(account, ctx){
  const meta = bucketMeta(account.bucket);
  return `<span class="hh-pill" style="--hh-pill:${meta.tone}">
    <span class="hh-pill-dot"></span>
    <span class="hh-pill-name">${esc(ctx, account.label)}</span>
    <span class="hh-pill-value">${compactMoney(account.value)}</span>
  </span>`;
}

function retirementStatus(person){
  const age = Number(person.age);
  const retireAge = Number(person.retireAge);
  if(!Number.isFinite(age) || !Number.isFinite(retireAge)) return '';
  return age >= retireAge ? 'Retired' : `Retires at ${retireAge}`;
}

function renderPersonOrb(person, ctx){
  const status = retirementStatus(person);
  return `<section class="hh-person-card">
    <div class="hh-orb">
      <div class="hh-orb-icon" aria-hidden="true"></div>
      <div class="hh-orb-name">${esc(ctx, person.name)}</div>
      <div class="hh-orb-age">Age ${esc(ctx, person.age || '')}</div>
      ${status ? `<div class="hh-orb-status">${esc(ctx, status)}</div>` : ''}
    </div>
    <div class="hh-person-stats">
      <label><span>Retire age</span><span class="field">${ctx.renderField({ path: person.retirePath, type: 'age' })}</span></label>
      <label><span>Social Security</span><span class="field">${ctx.renderField({ path: person.ssPath, type: 'money' })}</span></label>
    </div>
  </section>`;
}

function renderAccountBank(ctx){
  const rows = [['traditional', 'Retirement'], ['roth', 'Tax-free'], ['taxable', 'Taxable']].map(([bucket, label]) => {
    const chips = ctx.acctTypes.filter(type => type.bucket === bucket).map(type =>
      `<span class="acct-chip ${ctx.acctSel && ctx.acctSel.label === type.label ? 'sel' : ''}" data-label="${esc(ctx, type.label)}" data-bucket="${esc(ctx, type.bucket)}">${esc(ctx, type.label)}</span>`
    ).join('');
    return `<div class="acct-brow"><span class="acct-blabel ${bucket}">${label}</span><div class="acct-chips">${chips}</div></div>`;
  }).join('');

  return `<aside class="acct-picker hh-bankrail">
    <div class="hh-bank-head">
      <div class="hh-kicker">Account Bank</div>
      <h3>Add an account</h3>
      <div class="hh-bank-total">${money(ctx, ctx.investableTotal())} invested</div>
    </div>
    <div class="hh-bank-body">${rows}</div>
    <div class="acct-foot">
      <div><span class="lbl">Balance</span><input class="acct-amt" data-type="money" placeholder="$0"></div>
      <button class="acct-add" ${ctx.acctSel ? '' : 'disabled'}>${ctx.acctSel ? `Add ${esc(ctx, ctx.acctSel.label)}` : 'Add'}</button>
    </div>
  </aside>`;
}

function renderHouseholdMap(ctx){
  const { plan } = ctx;
  const accounts = householdAccounts(plan);
  const realAssets = householdRealAssets(plan);
  const currentLiabilities = householdCurrentLiabilityTotal(plan);
  const primary = plan.household.primary || {};
  const spouse = plan.household.spouse || {};
  const people = [
    {
      name: plan.meta.primaryName || 'Client',
      age: primary.currentAge,
      retireAge: primary.retirementAge,
      retirePath: 'household.primary.retirementAge',
      ssPath: 'income.socialSecurity.primary.pia',
    },
    {
      name: plan.meta.spouseName || 'Spouse',
      age: spouse.currentAge || '',
      retireAge: spouse.retirementAge,
      retirePath: 'household.spouse.retirementAge',
      ssPath: 'income.socialSecurity.spouse.pia',
    },
  ];

  return `<div class="hh-shell hh-map-shell">
    ${renderHouseholdToggle(ctx)}
    <div class="hh-map-grid">
      <div class="hh-map-main">
        <div class="hh-map-kpis">
          <div><span>Net worth</span><b>${money(ctx, householdNetWorthTotal(ctx))}</b></div>
          <div><span>Accounts</span><b>${accounts.length}</b></div>
          <div><span>Real assets</span><b>${money(ctx, ctx.realAssetsTotal())}</b></div>
          <div><span>Liabilities</span><b>${money(ctx, currentLiabilities)}</b></div>
        </div>
        <div class="hh-people">
          ${people.map(person => renderPersonOrb(person, ctx)).join('')}
        </div>
        <div class="hh-account-cloud">
          <div class="hh-cloud-label">Household-held accounts / ${accounts.length} accounts</div>
          <div class="hh-pills">${accounts.map(account => renderHouseholdPill(account, ctx)).join('')}</div>
        </div>
      </div>
      ${renderAccountBank(ctx)}
    </div>
  </div>`;
}

function renderStatementAccountRow(row, ctx){
  const meta = bucketMeta(row.bucket);
  const suffix = row.suffix ? `<span class="hh-row-suffix">${esc(ctx, row.suffix)}</span>` : '';
  const value = row.extra
    ? `<span class="field"><span class="pre">$</span><input class="acct-bal" data-type="money" data-acctidx="${row.idx}" value="${(row.value || 0).toLocaleString('en-US')}"><button class="acct-x" data-acctidx="${row.idx}" title="Remove">x</button></span>`
    : `<span class="field">${ctx.renderField({ path: row.path, type: 'money' })}${suffix}</span>`;

  return `<div class="hh-ledger-row" style="--hh-pill:${meta.tone}">
    <span class="hh-ledger-name"><i></i>${esc(ctx, row.label)}<small>${esc(ctx, row.metaLabel || meta.label)}</small></span>
    ${value}
  </div>`;
}

function renderStatementFieldRow(field, ctx){
  return `<div class="hh-ledger-row hh-field-row">
    <span class="hh-ledger-name">${esc(ctx, field.label)}</span>
    <span class="field">${ctx.renderField(field)}</span>
  </div>`;
}

function renderCompositionBar(ctx){
  const accounts = (ctx.plan.portfolio && ctx.plan.portfolio.accounts) || {};
  const parts = [
    { key: 'taxable', label: 'Taxable', value: (accounts.taxable && accounts.taxable.balance) || 0 },
    { key: 'traditional', label: 'Pre-tax', value: (accounts.traditional && accounts.traditional.balance) || 0 },
    { key: 'roth', label: 'Roth', value: (accounts.roth && accounts.roth.balance) || 0 },
    { key: 'real', label: 'Real estate', value: ctx.realAssetsTotal() },
  ].filter(part => part.value > 0);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if(!total) return '';
  const segments = parts.map(part =>
    `<i style="width:${(part.value / total * 100).toFixed(2)}%;background:${bucketMeta(part.key).tone}"></i>`
  ).join('');
  const legend = parts.map(part =>
    `<span><i style="background:${bucketMeta(part.key).tone}"></i>${part.label}<b>${compactMoney(part.value)}</b></span>`
  ).join('');
  return `<div class="hh-comp"><div class="hh-comp-bar">${segments}</div><div class="hh-comp-legend">${legend}</div></div>`;
}

function renderHouseholdNetWorth(ctx){
  const accounts = householdAccounts(ctx.plan);
  const realAssets = householdRealAssets(ctx.plan);
  const currentLiabilities = householdCurrentLiabilityRows(ctx.plan);
  const paymentLiabilities = householdPaymentLiabilityRows(ctx.plan);
  const currentLiabilityTotal = householdCurrentLiabilityTotal(ctx.plan);
  const assetsTotal = ctx.investableTotal() + ctx.realAssetsTotal();
  const fieldSections = ctx.balanceSheet.filter(section => section.head !== 'Investment accounts');
  const fieldHtml = fieldSections.map(section =>
    `<div class="hh-field-sec"><h4>${esc(ctx, section.head)}</h4>${(section.fields || []).map(field => renderStatementFieldRow(field, ctx)).join('')}</div>`
  ).join('');

  return `<div class="hh-shell hh-statement-shell">
    ${renderHouseholdToggle(ctx)}
    <section class="hh-statement-hero">
      <div>
        <div class="hh-kicker">Net worth statement</div>
        <h2>${esc(ctx, ctx.plan.meta.primaryName || 'Client')} / ${esc(ctx, ctx.plan.meta.spouseName || 'Spouse')}</h2>
      </div>
      <div class="hh-hero-figs">
        <div><span>Assets</span><b>${money(ctx, assetsTotal)}</b></div>
        <div><span>Liabilities</span><b>${money(ctx, currentLiabilityTotal)}</b></div>
        <div class="lead"><span>Net worth</span><b>${money(ctx, assetsTotal - currentLiabilityTotal)}</b></div>
      </div>
    </section>
    ${renderCompositionBar(ctx)}
    <div class="hh-statement-grid">
      <section class="hh-glass-card hh-assets-card">
        <div class="hh-card-head"><h3>Assets</h3><b>${money(ctx, assetsTotal)}</b></div>
        <div class="hh-subhead">Investment accounts</div>
        ${accounts.map(account => renderStatementAccountRow(account, ctx)).join('')}
        <div class="hh-subhead">Real assets</div>
        ${realAssets.length ? realAssets.map(asset => renderStatementAccountRow(asset, ctx)).join('') : '<div class="hh-empty-row">No real property entered</div>'}
      </section>
      <section class="hh-glass-card hh-fields-card">
        <div class="hh-card-head"><h3>Household inputs</h3></div>
        ${fieldHtml}
      </section>
      <section class="hh-glass-card hh-liab-card">
        <div class="hh-card-head"><h3>Liabilities</h3><b>${money(ctx, currentLiabilityTotal)}</b></div>
        <div class="hh-subhead">Current balances</div>
        ${currentLiabilities.length ? currentLiabilities.map(row => renderStatementAccountRow(row, ctx)).join('') : '<div class="hh-empty-row">No current liability balances entered</div>'}
        ${paymentLiabilities.length ? `<div class="hh-subhead">Payment streams</div>${paymentLiabilities.map(row => renderStatementAccountRow(row, ctx)).join('')}` : ''}
        <div class="hh-net-foot"><span>Household net worth</span><b>${money(ctx, assetsTotal - currentLiabilityTotal)}</b></div>
      </section>
    </div>
  </div>`;
}

export function renderHouseholdStatement(ctx){
  return ctx.householdView === 'networth'
    ? renderHouseholdNetWorth(ctx)
    : renderHouseholdMap(ctx);
}
