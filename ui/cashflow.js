import { selectedPathIndex } from './sequencing.js';

export const CF_BREAKDOWN_MODES = Object.freeze(['summary', 'income', 'draw', 'goals', 'tax']);

/** Lean default + one breakdown at a time. Clickable headers use `breakKey`. */
export function cashflowColumns(mode = 'summary', taxColumn = { label: 'Tax', title: 'Tax' }){
  const taxLabel = taxColumn.label || 'Tax';
  const taxTitle = taxColumn.title || 'Tax';
  if(mode === 'income'){
    return Object.freeze([
      { id: 'year', label: 'Year', align: 'left' },
      { id: 'age', label: 'Age', align: 'left' },
      { id: 'ss', label: 'SS', align: 'right' },
      { id: 'pension', label: 'Pension', align: 'right' },
      { id: 'other', label: 'Other', align: 'right' },
      { id: 'income', label: 'Income', align: 'right', breakKey: 'income', active: true },
      { id: 'ending', label: 'Ending', align: 'right' },
    ]);
  }
  if(mode === 'draw'){
    return Object.freeze([
      { id: 'year', label: 'Year', align: 'left' },
      { id: 'age', label: 'Age', align: 'left' },
      { id: 'taxableDraw', label: 'Taxable', align: 'right' },
      { id: 'traditionalDraw', label: 'Traditional', align: 'right' },
      { id: 'rothDraw', label: 'Roth', align: 'right' },
      { id: 'gain', label: 'Gain', align: 'right' },
      { id: 'rmd', label: 'RMD', align: 'right' },
      { id: 'draw', label: 'Draw', align: 'right', breakKey: 'draw', active: true },
      { id: 'ending', label: 'Ending', align: 'right' },
    ]);
  }
  if(mode === 'goals'){
    return Object.freeze([
      { id: 'year', label: 'Year', align: 'left' },
      { id: 'age', label: 'Age', align: 'left' },
      { id: 'goalsRecurring', label: 'Recurring', align: 'right' },
      { id: 'goalsOneTime', label: 'One-time', align: 'right' },
      { id: 'goals', label: 'Goals', align: 'right', breakKey: 'goals', active: true },
      { id: 'ending', label: 'Ending', align: 'right' },
    ]);
  }
  if(mode === 'tax'){
    return Object.freeze([
      { id: 'year', label: 'Year', align: 'left' },
      { id: 'age', label: 'Age', align: 'left' },
      { id: 'federalTax', label: 'Federal', align: 'right' },
      { id: 'engineTax', label: 'Engine', align: 'right' },
      { id: 'tax', label: taxLabel, align: 'right', breakKey: 'tax', active: true, taxMeta: true, title: taxTitle },
      { id: 'ending', label: 'Ending', align: 'right' },
    ]);
  }
  return Object.freeze([
    { id: 'year', label: 'Year', align: 'left' },
    { id: 'age', label: 'Age', align: 'left' },
    { id: 'income', label: 'Income', align: 'right', breakKey: 'income' },
    { id: 'goals', label: 'Goals', align: 'right', breakKey: 'goals' },
    { id: 'tax', label: taxLabel, align: 'right', breakKey: 'tax', taxMeta: true, title: taxTitle },
    { id: 'draw', label: 'Draw', align: 'right', breakKey: 'draw' },
    { id: 'ending', label: 'Ending', align: 'right' },
  ]);
}

export function normalizeCashBreakdown(mode){
  if(mode == null || mode === '' || mode === 'summary') return 'summary';
  return CF_BREAKDOWN_MODES.includes(mode) ? mode : 'summary';
}

export function cfWdColor(wd, shortfall) {
  if (shortfall) return 'var(--down-deep)';
  if (wd < 5) return 'var(--text-3)';
  if (wd < 7) return 'var(--down)';
  return 'var(--down-deep)';
}

export function goalTagFor(plan, r, age) {
  if (!(r.goals > 0)) return null;
  const g = (Array.isArray(plan.goals) ? plan.goals : [])
    .find((x) => (x.amount || 0) > 0 && x.startAge === x.endAge && x.startAge === age);
  return g ? g.name : null;
}

function goalsSplitForAge(plan, age){
  let recurring = 0;
  let oneTime = 0;
  for(const g of (Array.isArray(plan.goals) ? plan.goals : [])){
    const amount = Number(g.amount) || 0;
    if(!(amount > 0)) continue;
    const start = g.startAge != null ? g.startAge : 0;
    const end = g.endAge != null ? g.endAge : 999;
    if(age < start || age > end) continue;
    if(start === end) oneTime += amount;
    else recurring += amount;
  }
  return { recurring, oneTime };
}

export function buildPathRows(s, {
  simByIndex, baselineResult, plan, currentYear,
}) {
  if (!s.res) return [];
  const sim = simByIndex(s.res, selectedPathIndex(baselineResult()));
  if (!sim || !Array.isArray(sim.rows)) return [];
  const curAge = plan.household.primary.currentAge;
  const baseYear = currentYear;
  return sim.rows.map((r) => {
    const age = (r.age != null) ? r.age : curAge;
    const ss = r.socialSecurity || 0;
    const pension = r.pension || 0;
    const otherIncome = r.otherIncome || 0;
    const goalsParts = goalsSplitForAge(plan, age);
    const breakdown = r.accountBreakdown || {};
    return {
      year: baseYear + (age - curAge),
      age,
      accum: r.phase === 'accum',
      ret: (r.source != null && r.returnRate != null) ? r.returnRate : null,
      ss,
      pension,
      otherIncome,
      income: ss + pension + otherIncome,
      rmd: r.rmd || 0,
      rmdRequired: r.rmdRequired || 0,
      essential: r.expenses || 0,
      goals: r.goals || 0,
      goalsRecurring: goalsParts.recurring,
      goalsOneTime: goalsParts.oneTime,
      tax: r.taxes || 0,
      engineTax: r.taxes || 0,
      draw: r.withdrawal || 0,
      taxableDraw: breakdown.taxable || 0,
      traditionalDraw: breakdown.traditional || 0,
      rothDraw: breakdown.roth || 0,
      gain: r.taxableCapitalGain || 0,
      wdRate: (r.wdRate != null) ? r.wdRate : 0,
      ending: r.balance || 0,
      shortfall: (r.balance != null && r.balance <= 0),
      startPort: r.startBalance || 0,
      goalTag: goalTagFor(plan, r, age),
    };
  });
}

export function buildCashSummary(s, {
  simByIndex, baselineResult, pathDigest,
}) {
  if (!s.res) return {};
  const sim = simByIndex(s.res, selectedPathIndex(baselineResult()));
  if (!sim) return {};
  let d = {};
  try { d = (typeof pathDigest === 'function') ? pathDigest(sim) : {}; } catch { d = {}; }
  return { peakWdRate: d.peakWdRate, peakWdAge: d.peakWdAge };
}

export function taxSidecarFor(scn, { isTypicalPath, typicalPathFederalTax, pathFederalTax }) {
  if (scn?.res?.federalFunding?.semantics?.convergence === 'per-year-to-one-cent') {
    return {
      byAge: new Map(),
      byYear: new Map(),
      scope: 'MODELED_FEDERAL_LINE_24',
      path: 'converged-engine-row',
      totals: null,
      warnings: [],
    };
  }
  const raw = typeof pathFederalTax === 'function'
    ? pathFederalTax(scn)
    : (isTypicalPath() ? typicalPathFederalTax(scn) : (scn.res && scn.res.pathFederalTax));
  if (!raw) return null;
  const byAge = new Map(), byYear = new Map();
  const list = Array.isArray(raw) ? raw : (raw.years || raw.rows || []);
  list.forEach((e) => {
    if (e == null) return;
    const t = (e.federalTaxLiability != null) ? e.federalTaxLiability
            : (e.tax != null) ? e.tax : (e.federalTax != null ? e.federalTax : e.value);
    if (e.age != null)  byAge.set(e.age, t);
    if (e.year != null) byYear.set(e.year, t);
  });
  return {
    byAge,
    byYear,
    scope: Array.isArray(raw) ? null : (raw.scope ?? null),
    path: Array.isArray(raw) ? null : (raw.path ?? null),
    totals: Array.isArray(raw) ? null : (raw.totals ?? null),
    warnings: Array.isArray(raw) ? [] : (Array.isArray(raw.warnings) ? raw.warnings : []),
  };
}

export function taxComparisonFor(sidecar) {
  const totals = sidecar?.totals;
  if (!totals) return null;
  const federalTotal = totals.federalTaxLiability;
  const enginePathTotal = totals.enginePathTax;
  const delta = totals.deltaVsEnginePath;
  if (![federalTotal, enginePathTotal, delta].every(Number.isFinite)) return null;
  return { federalTotal, enginePathTotal, delta };
}

export function taxColumnMeta(sidecar) {
  if (!sidecar) {
    return {
      label: 'Tax',
      source: 'engine',
      scope: null,
      title: 'Engine row tax estimate',
    };
  }
  if (sidecar.scope === 'INCOME_TAX_ONLY') {
    return {
      label: 'Tax',
      source: 'federal-sidecar',
      scope: sidecar.scope,
      title: 'Federal sidecar · income tax only',
    };
  }
  if (sidecar.scope === 'MODELED_FEDERAL_LINE_24') {
    return {
      label: 'Tax',
      source: 'federal-converged-row',
      scope: sidecar.scope,
      title: 'Modeled federal Form 1040 line 24 · retirement rows funded and converged; working years reporting-only',
    };
  }
  return {
    label: 'Tax',
    source: 'federal-sidecar',
    scope: sidecar.scope,
    title: sidecar.scope === 'FULL_1040'
      ? 'Federal sidecar · full Form 1040 scope'
      : 'Federal sidecar',
  };
}

export function resolveRowTax(row, sidecar) {
  if (sidecar) {
    if (row.age != null && sidecar.byAge.has(row.age))   return sidecar.byAge.get(row.age);
    if (row.year != null && sidecar.byYear.has(row.year)) return sidecar.byYear.get(row.year);
  }
  return row.tax;
}

export function fmtParenMoney(n, fmtMoney) {
  const m = fmtMoney(n);
  return m === '—' ? m : '(' + m + ')';
}

export function fmtSignedMoney(n, fmtMoney) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  return (n < 0 ? '−' : '+') + fmtMoney(Math.abs(n));
}

export function federalScopeLabel(scope) {
  if (scope === 'INCOME_TAX_ONLY') return 'income tax only';
  if (scope === 'FULL_1040') return 'full Form 1040';
  if (scope === 'MODELED_FEDERAL_LINE_24') return 'modeled Form 1040 line 24; retirement rows funded and converged, working years reporting-only';
  return 'scope not specified';
}

export function federalWarningMessage(warning) {
  if (typeof warning === 'string') return warning;
  if (warning && typeof warning.message === 'string') return warning.message;
  if (warning && typeof warning.code === 'string') return warning.code;
  return 'Federal tax calculation warning';
}

export function groupPhases(rows, rmdStartAge = null) {
  if (!rows.length) return [];
  const start = Number.isFinite(rmdStartAge)
    ? rmdStartAge
    : (rows.find((r) => (r.rmdRequired || 0) > 0)?.age ?? null);
  if(start == null) return [{ rows }];
  return [
    { rows: rows.filter((r) => r.age < start) },
    { rows: rows.filter((r) => r.age >= start) },
  ].filter((p) => p.rows.length);
}

function moneyOrDash(n, fmtMoney){
  return n > 0 ? fmtMoney(n) : '—';
}

function cellTone(n, positiveColor = 'var(--text-2b)'){
  return n > 0 ? positiveColor : 'var(--text-mute)';
}

function renderCell(col, r, {
  tax, federalTax, esc, fmtMoney, num,
}) {
  const ending = (r.shortfall || r.ending <= 0) ? '$0' : fmtMoney(r.ending);
  const endColor = (r.shortfall || r.ending <= 0) ? 'var(--down-deep)' : 'var(--text-2)';
  const goalsColor = r.goals > 0 ? (r.goalTag ? '#d8c084' : '#c6a662') : 'var(--text-mute)';

  switch(col.id){
    case 'year':
      return null; // rendered with markers in rowHtml
    case 'age':
      return `<span class="cf-cell cf-cell--age">${esc(r.age)}</span>`;
    case 'ss':
      return `<span class="cf-cell" style="color:${cellTone(r.ss)};">${moneyOrDash(r.ss, fmtMoney)}</span>`;
    case 'pension':
      return `<span class="cf-cell" style="color:${cellTone(r.pension)};">${moneyOrDash(r.pension, fmtMoney)}</span>`;
    case 'other':
      return `<span class="cf-cell" style="color:${cellTone(r.otherIncome)};">${moneyOrDash(r.otherIncome, fmtMoney)}</span>`;
    case 'income':
      return `<span class="cf-cell" style="color:${cellTone(r.income)};">${moneyOrDash(r.income, fmtMoney)}</span>`;
    case 'taxableDraw':
      return `<span class="cf-cell ${r.taxableDraw > 0 ? 'cf-cell--draw' : 'cf-cell--zero'}">${r.taxableDraw > 0 ? fmtParenMoney(r.taxableDraw, fmtMoney) : '—'}</span>`;
    case 'traditionalDraw':
      return `<span class="cf-cell ${r.traditionalDraw > 0 ? 'cf-cell--draw' : 'cf-cell--zero'}">${r.traditionalDraw > 0 ? fmtParenMoney(r.traditionalDraw, fmtMoney) : '—'}</span>`;
    case 'rothDraw':
      return `<span class="cf-cell ${r.rothDraw > 0 ? 'cf-cell--draw' : 'cf-cell--zero'}">${r.rothDraw > 0 ? fmtParenMoney(r.rothDraw, fmtMoney) : '—'}</span>`;
    case 'gain':
      return `<span class="cf-cell" style="color:${cellTone(r.gain)};">${moneyOrDash(r.gain, fmtMoney)}</span>`;
    case 'rmd':
      return `<span class="cf-cell" style="color:var(--text-2b);">${r.rmd > 0 ? fmtMoney(r.rmd) : ''}</span>`;
    case 'draw':
      return `<span class="cf-cell ${r.draw > 0 ? 'cf-cell--draw' : 'cf-cell--zero'}">${fmtParenMoney(r.draw, fmtMoney)}</span>`;
    case 'goalsRecurring':
      return `<span class="cf-cell" style="color:${r.goalsRecurring > 0 ? '#c6a662' : 'var(--text-mute)'};">${moneyOrDash(r.goalsRecurring, fmtMoney)}</span>`;
    case 'goalsOneTime':
      return `<div class="cf-row__goals-wrap"><span class="cf-cell" style="color:${r.goalsOneTime > 0 ? '#d8c084' : 'var(--text-mute)'};">${moneyOrDash(r.goalsOneTime, fmtMoney)}</span>${r.goalTag ? `<span class="cf-row__goaltag">${esc(r.goalTag)}</span>` : ''}</div>`;
    case 'goals':
      return `<div class="cf-row__goals-wrap"><span class="cf-cell" style="color:${goalsColor};">${moneyOrDash(r.goals, fmtMoney)}</span>${r.goalTag ? `<span class="cf-row__goaltag">${esc(r.goalTag)}</span>` : ''}</div>`;
    case 'federalTax':
      return `<span class="cf-cell ${federalTax > 0 ? 'cf-cell--tax' : 'cf-cell--zero'}">${fmtMoney(federalTax)}</span>`;
    case 'engineTax':
      return `<span class="cf-cell ${r.engineTax > 0 ? 'cf-cell--tax' : 'cf-cell--zero'}">${fmtMoney(r.engineTax)}</span>`;
    case 'tax':
      return `<span class="cf-cell ${tax > 0 ? 'cf-cell--tax' : 'cf-cell--zero'}">${fmtMoney(tax)}</span>`;
    case 'ending':
      return `<span class="cf-cell cf-cell--ending" style="color:${endColor};">${ending}</span>`;
    default:
      return `<span class="cf-cell cf-cell--zero">—</span>`;
  }
}

export function renderCashflow(scn, allScns, {
  pathRows, cashSummary, cashFromRetirement, cashBreakdown = 'summary',
  isTypicalPath, typicalPathFederalTax, pathFederalTax,
  toneGlow, ring, wdColor, num, esc, fmtMoney,
}) {
  const mode = normalizeCashBreakdown(cashBreakdown);
  const allRows = pathRows(scn.raw);
  const rows = cashFromRetirement ? allRows.filter((r) => !r.accum) : allRows;
  const hasWorking = allRows.some((r) => r.accum);
  const summary = cashSummary(scn.raw);
  const typicalPath = isTypicalPath();
  const sidecar = taxSidecarFor(scn.raw, { isTypicalPath, typicalPathFederalTax, pathFederalTax });
  const taxColumn = taxColumnMeta(sidecar);
  const taxComparison = taxComparisonFor(sidecar);
  const federalAttachFailed = typicalPath && !!scn.raw.res && !sidecar;
  const taxDisclosureState = federalAttachFailed
    ? 'engine-fallback'
    : taxColumn.source === 'federal-converged-row'
      ? 'federal-converged-row'
      : 'federal-sidecar';
  const cols = cashflowColumns(mode, taxColumn);

  const pills = allScns.map((s) => (
    '<button class="cf-pill ' + (s.id === scn.id ? 'is-active' : '') + '" type="button" data-cash-pick="' + esc(s.id) + '" aria-pressed="' + (s.id === scn.id ? 'true' : 'false') + '" style="--tone:' + s.tone + ';">' +
      '<span class="cf-pill__dot"></span>' + esc(s.name) +
    '</button>'
  )).join('');

  const retStartAge = rows.find((r) => !r.accum)?.age ?? null;
  const rmdStartAge = Number.isFinite(scn.raw?.res?.params?.rmdStartAge)
    ? scn.raw.res.params.rmdStartAge
    : (rows.find((r) => (r.rmdRequired || 0) > 0)?.age ?? null);

  const taxComparisonHtml = taxComparison ? (
    '<div class="cf-tax-compare" data-tax-compare style="display:contents;"' +
      (sidecar?.path ? ' data-tax-path="' + esc(sidecar.path) + '"' : '') +
      ' data-federal-total="' + taxComparison.federalTotal + '"' +
      ' data-engine-path-total="' + taxComparison.enginePathTotal + '"' +
      ' data-delta="' + taxComparison.delta + '">' +
      '<div class="cf-stat"><div class="cf-stat__label">Federal Total</div><div class="cf-stat__value">' + (taxComparison.federalTotal === 0 ? '$0' : fmtMoney(taxComparison.federalTotal)) + '</div></div>' +
      '<div class="cf-stat"><div class="cf-stat__label">Engine Path</div><div class="cf-stat__value">' + (taxComparison.enginePathTotal === 0 ? '$0' : fmtMoney(taxComparison.enginePathTotal)) + '</div></div>' +
      '<div class="cf-stat"><div class="cf-stat__label">Delta</div><div class="cf-stat__value">' + fmtSignedMoney(taxComparison.delta, fmtMoney) + '</div></div>' +
    '</div>'
  ) : '';

  const summaryStrip = (
    '<div class="cf-summary" style="--tone:' + scn.tone + ';--tone-glow:' + toneGlow(scn.tone) + ';">' +
      '<div class="cf-summary__id">' +
        ring(40, 17, 2.5, scn.tone, scn.prob, '<span class="numeral" style="font-size:14px;">' + scn.probStr + '<span class="pct" style="font-size:10px;">%</span></span>') +
        '<div class="cf-summary__sub">Probability of success</div>' +
      '</div>' +
      '<div class="cf-summary__stats">' +
        '<div class="cf-stat"><div class="cf-stat__label">Median Ending</div><div class="cf-stat__value">' + scn.median + '</div></div>' +
        '<div class="cf-stat"><div class="cf-stat__label">Peak Withdrawal</div>' +
          '<div class="cf-stat__peak"><span class="cf-stat__value" style="color:' + wdColor(summary.peakWdRate, false) + ';">' + (summary.peakWdRate ? num(summary.peakWdRate, 1) + '%' : '—') + '</span><span class="cf-stat__peak-age">' + (summary.peakWdAge ? 'age ' + summary.peakWdAge : '') + '</span></div>' +
        '</div>' +
        taxComparisonHtml +
      '</div>' +
    '</div>'
  );

  const taxDisclosure = (typicalPath || sidecar) && scn.raw.res ? (
    '<div class="cf-tax-disclosure" data-tax-disclosure data-tax-state="' + taxDisclosureState + '">' +
      (federalAttachFailed
        ? '<div class="cf-tax-fallback" data-tax-fallback role="status">Federal tax detail isn\'t available for this run. The Tax column uses engine estimates.</div>'
        : '<div class="cf-tax-scope" data-tax-scope-disclosure>Federal tax scope: ' + esc(federalScopeLabel(sidecar.scope)) + '.</div>' +
          (sidecar.warnings.length
            ? '<div class="cf-tax-warnings" data-tax-warnings role="status" aria-label="Federal tax warnings">' +
                '<div class="cf-tax-warnings__label">Federal tax warnings</div>' +
                '<ul>' + sidecar.warnings.map((warning) => '<li>' + esc(federalWarningMessage(warning)) + '</li>').join('') + '</ul>' +
              '</div>'
            : '')) +
    '</div>'
  ) : '';

  const modeLabel = mode === 'income' ? 'Income detail'
    : mode === 'draw' ? 'Withdrawal detail'
    : mode === 'goals' ? 'Goals detail'
    : mode === 'tax' ? 'Tax detail'
    : null;

  const breakdownBar = mode !== 'summary'
    ? `<div class="cf-breakdown-bar" data-cf-breakdown-bar>
        <button class="cf-breakdown-bar__back" type="button" data-cf-breakdown="summary">← Summary</button>
        <span class="cf-breakdown-bar__label">${esc(modeLabel)}</span>
      </div>`
    : '';

  const rowHtml = (r) => {
    const tax = resolveRowTax(r, sidecar);
    const federalTax = sidecar ? tax : r.engineTax;
    const isRetStart = retStartAge != null && !r.accum && r.age === retStartAge;
    const isRmdStart = rmdStartAge != null && r.age === rmdStartAge;
    const yearMark = isRetStart
      ? '<span class="cf-row__mark-dot cf-row__mark-dot--ret"></span>'
      : (isRmdStart ? '<span class="cf-row__mark-dot cf-row__mark-dot--rmd"></span>' : '');
    const cells = cols.map((col) => {
      if(col.id === 'year'){
        return (
          '<span class="cf-row__year">' +
            '<span class="cf-row__mark" aria-hidden="true">' + yearMark + '</span>' +
            esc(r.year) +
          '</span>'
        );
      }
      return renderCell(col, r, { tax, federalTax, esc, fmtMoney, num });
    }).join('');
    return `<div class="cf-row cf-grid cf-grid--${esc(mode)}">${cells}</div>`;
  };

  const phases = groupPhases(rows, rmdStartAge).map((p, idx) => (
    '<div class="cf-band ' + (idx % 2 === 1 ? 'is-shaded' : '') + '">' + p.rows.map(rowHtml).join('') + '</div>'
  )).join('');

  const headCells = cols.map((col) => {
    const isRight = col.align === 'right';
    const taxAttrs = col.taxMeta
      ? ' data-tax-source="' + esc(taxColumn.source) + '"' +
        (taxColumn.scope ? ' data-tax-scope="' + esc(taxColumn.scope) + '"' : '') +
        ' title="' + esc(col.title || taxColumn.title) + '"'
      : (col.title ? ' title="' + esc(col.title) + '"' : '');
    if(col.breakKey){
      const pressed = col.active ? 'true' : 'false';
      const next = col.active ? 'summary' : col.breakKey;
      return (
        '<button type="button" class="cf-th cf-th--break' +
          (isRight ? ' cf-th--r' : '') +
          (col.active ? ' is-active' : '') +
          '" data-cf-breakdown="' + esc(next) + '"' +
          ' aria-pressed="' + pressed + '"' +
          taxAttrs + '>' +
          esc(col.label) +
          '<span class="cf-th__caret" aria-hidden="true"></span>' +
        '</button>'
      );
    }
    return '<span class="cf-th' + (isRight ? ' cf-th--r' : '') + '"' + taxAttrs + '>' + esc(col.label) + '</span>';
  }).join('');

  const empty = rows.length ? '' : '<div class="cf-band"><div style="padding:26px 18px;color:var(--text-5);">No cash-flow data yet. Press Run — or check the plan inputs if the status bar shows a warning.</div></div>';

  return (
    '<div class="cf" data-cf-mode="' + esc(mode) + '">' +
      '<div class="cf__head">' +
        '<div class="cf__pills">' + pills + '</div>' +
        '<div class="cf__path-controls" id="scn-cf-path-controls"></div>' +
        (hasWorking
          ? '<button class="cf-ret-toggle ' + (cashFromRetirement ? 'is-on' : '') + '" type="button" data-cash-retstart aria-pressed="' + (cashFromRetirement ? 'true' : 'false') + '">Start at retirement</button>'
          : '') +
      '</div>' +
      summaryStrip +
      taxDisclosure +
      breakdownBar +
      '<div class="cf-table">' +
        '<div class="cf-table__head cf-grid cf-grid--' + esc(mode) + '">' + headCells + '</div>' +
        (empty || phases) +
      '</div>' +
    '</div>'
  );
}
