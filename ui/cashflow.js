import { selectedPathIndex } from './sequencing.js';



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

export function buildPathRows(s, {
    simByIndex, baselineResult, findSimByTerminalBalance, plan, currentYear,
  }) {
    if (!s.res) return [];
    const sim = simByIndex(s.res, selectedPathIndex(baselineResult(), findSimByTerminalBalance));
    if (!sim || !Array.isArray(sim.rows)) return [];
    const curAge = plan.household.primary.currentAge;
    const baseYear = currentYear;
    return sim.rows.map((r) => {
      const age = (r.age != null) ? r.age : curAge;
      return {
        year: baseYear + (age - curAge),
        age: age,
        accum: r.phase === 'accum',
        ret: (r.source != null && r.returnRate != null) ? r.returnRate : null,   // engine's applied return; null on failed filler rows
        income: (r.socialSecurity || 0) + (r.pension || 0) + (r.otherIncome || 0),
        rmd: r.rmd || 0,
        essential: r.expenses || 0,
        goals: r.goals || 0,
        tax: r.taxes || 0,
        draw: r.withdrawal || 0,
        wdRate: (r.wdRate != null) ? r.wdRate : 0,
        ending: r.balance || 0,
        shortfall: (r.balance != null && r.balance <= 0),
        startPort: r.startBalance || 0,
        goalTag: goalTagFor(plan, r, age),
      };
    });
  }

export function buildCashSummary(s, {
    simByIndex, baselineResult, findSimByTerminalBalance, pathDigest,
  }) {
    if (!s.res) return {};
    const sim = simByIndex(s.res, selectedPathIndex(baselineResult(), findSimByTerminalBalance));
    if (!sim) return {};
    let d = {};
    try { d = (typeof pathDigest === 'function') ? pathDigest(sim) : {}; } catch (e) { d = {}; }
    return { peakWdRate: d.peakWdRate, peakWdAge: d.peakWdAge };
  }

export function taxSidecarFor(scn, { isTypicalPath, typicalPathFederalTax }) {
    const raw = isTypicalPath() ? typicalPathFederalTax(scn) : (scn.res && scn.res.pathFederalTax);
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
    return { byAge: byAge, byYear: byYear };
  }

export function resolveRowTax(row, sidecar) {
    if (sidecar) {
      if (row.age != null && sidecar.byAge.has(row.age))   return sidecar.byAge.get(row.age);
      if (row.year != null && sidecar.byYear.has(row.year)) return sidecar.byYear.get(row.year);
    }
    return row.tax;                       // engine row tax (always present)
  }

export function fmtParenMoney(n, fmtMoney) {
    const m = fmtMoney(n);
    return m === '—' ? m : '(' + m + ')';
  }

export function groupPhases(rows) {
    if (!rows.length) return [];
    const RMD_START_AGE = 73;
    return [
      { rows: rows.filter((r) => r.age < RMD_START_AGE) },
      { rows: rows.filter((r) => r.age >= RMD_START_AGE) },
    ].filter((p) => p.rows.length);
  }

export function renderCashflow(scn, allScns, {
    pathRows, cashSummary, cashFromRetirement, isTypicalPath, typicalPathFederalTax,
    toneGlow, ring, wdColor, num, esc, fmtMoney, cfCols,
  }) {
    const allRows = pathRows(scn.raw);
    // "Start at retirement" hides the working (accum) years. Retirement rows
    // begin only once BOTH spouses have retired (engine rule), so this starts
    // the ledger at the second retirement.
    const rows = cashFromRetirement ? allRows.filter((r) => !r.accum) : allRows;
    const hasWorking = allRows.some((r) => r.accum);
    const summary = cashSummary(scn.raw);
    const sidecar = taxSidecarFor(scn.raw, { isTypicalPath, typicalPathFederalTax });

    const pills = allScns.map((s) => (
      '<button class="cf-pill ' + (s.id === scn.id ? 'is-active' : '') + '" type="button" data-cash-pick="' + esc(s.id) + '" aria-pressed="' + (s.id === scn.id ? 'true' : 'false') + '" style="--tone:' + s.tone + ';">' +
        '<span class="cf-pill__dot"></span>' + esc(s.name) +
      '</button>'
    )).join('');

    const retStartAge = rows.find((r) => !r.accum)?.age ?? null;
    const RMD_START_AGE = 73;
    const rmdStartAge = rows.find((r) => r.age >= RMD_START_AGE)?.age ?? null;

    const summaryStrip = (
      '<div class="cf-summary" style="--tone:' + scn.tone + ';--tone-glow:' + toneGlow(scn.tone) + ';">' +
        '<div class="cf-summary__id">' +
          ring(56, 24, 4.5, scn.tone, scn.prob, '<span class="numeral" style="font-size:15px;">' + scn.probStr + '<span class="pct" style="font-size:11px;">%</span></span>') +
          '<div class="cf-summary__sub">Probability of success</div>' +
        '</div>' +
        '<div class="cf-summary__stats">' +
          '<div class="cf-stat"><div class="cf-stat__label">Median Ending</div><div class="cf-stat__value">' + scn.median + '</div></div>' +
          '<div class="cf-stat"><div class="cf-stat__label">Peak Withdrawal</div>' +
            '<div class="cf-stat__peak"><span class="cf-stat__value" style="color:' + wdColor(summary.peakWdRate, false) + ';">' + (summary.peakWdRate ? num(summary.peakWdRate, 1) + '%' : '—') + '</span><span class="cf-stat__peak-age">' + (summary.peakWdAge ? 'age ' + summary.peakWdAge : '') + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    const rowHtml = (r) => {
      const tax = resolveRowTax(r, sidecar);
      const ending = (r.shortfall || r.ending <= 0) ? '$0' : fmtMoney(r.ending);
      const endColor = (r.shortfall || r.ending <= 0) ? 'var(--down-deep)' : 'var(--text-2)';
      const goalsColor = r.goals > 0 ? (r.goalTag ? '#d8c084' : '#c6a662') : 'var(--text-mute)';
      const isRetStart = retStartAge != null && !r.accum && r.age === retStartAge;
      const isRmdStart = rmdStartAge != null && r.age === rmdStartAge;
      const yearMark = isRetStart
        ? '<span class="cf-row__mark-dot cf-row__mark-dot--ret"></span>'
        : (isRmdStart ? '<span class="cf-row__mark-dot cf-row__mark-dot--rmd"></span>' : '');
      return (
        '<div class="cf-row cf-grid">' +
          '<span class="cf-row__year">' +
            '<span class="cf-row__mark" aria-hidden="true">' + yearMark + '</span>' +
            esc(r.year) +
          '</span>' +
          '<span class="cf-cell cf-cell--age">' + esc(r.age) + '</span>' +
          '<span class="cf-cell" style="color:' + (r.income > 0 ? 'var(--text-2b)' : 'var(--text-mute)') + ';">' + (r.income > 0 ? fmtMoney(r.income) : '—') + '</span>' +
          '<span class="cf-cell" style="color:var(--text-2b);">' + (r.rmd > 0 ? fmtMoney(r.rmd) : '') + '</span>' +
          '<span class="cf-cell ' + (r.essential > 0 ? 'cf-cell--essential' : 'cf-cell--zero') + '">' + fmtMoney(r.essential) + '</span>' +
          '<div class="cf-row__goals-wrap">' +
            '<span class="cf-cell" style="color:' + goalsColor + ';">' + (r.goals > 0 ? fmtMoney(r.goals) : '—') + '</span>' +
            (r.goalTag ? '<span class="cf-row__goaltag">' + esc(r.goalTag) + '</span>' : '') +
          '</div>' +
          '<span class="cf-cell ' + (tax > 0 ? 'cf-cell--tax' : 'cf-cell--zero') + '">' + fmtMoney(tax) + '</span>' +
          '<span class="cf-cell ' + (r.draw > 0 ? 'cf-cell--draw' : 'cf-cell--zero') + '">' + fmtParenMoney(r.draw, fmtMoney) + '</span>' +
          '<span class="cf-cell cf-cell--ret" style="color:' + (r.ret == null ? 'var(--text-mute)' : (r.ret < 0 ? 'var(--down)' : 'var(--tone-green)')) + ';">' + (r.ret == null ? '—' : (r.ret < 0 ? '−' : '+') + num(Math.abs(r.ret) * 100, 1) + '%') + '</span>' +
          '<span class="cf-cell cf-cell--wd" style="color:' + (!r.accum && r.startPort > 0 ? cfWdColor(r.wdRate, r.shortfall) : 'var(--text-mute)') + ';">' + (!r.accum && r.startPort > 0 ? num(r.wdRate, 1) + '%' : '—') + '</span>' +
          '<span class="cf-cell cf-cell--ending" style="color:' + endColor + ';">' + ending + '</span>' +
        '</div>'
      );
    };

    const phases = groupPhases(rows).map((p, idx) => (
      '<div class="cf-band ' + (idx % 2 === 1 ? 'is-shaded' : '') + '">' + p.rows.map(rowHtml).join('') + '</div>'
    )).join('');

    const headCells = cfCols.map((h, i) => '<span class="cf-th ' + (i >= 2 ? 'cf-th--r' : '') + '">' + h + '</span>').join('');
    const empty = rows.length ? '' : '<div class="cf-band"><div style="padding:26px 18px;color:var(--text-5);">No cash-flow data yet. Press Run — or check the plan inputs if the status bar shows a warning.</div></div>';

    return (
      '<div class="cf">' +
        '<div class="cf__head">' +
          '<div class="cf__pills">' + pills + '</div>' +
          '<div class="cf__path-controls" id="scn-cf-path-controls"></div>' +
          (hasWorking
            ? '<button class="cf-ret-toggle ' + (cashFromRetirement ? 'is-on' : '') + '" type="button" data-cash-retstart aria-pressed="' + (cashFromRetirement ? 'true' : 'false') + '">Start at retirement</button>'
            : '') +
        '</div>' +
        summaryStrip +
        '<div class="cf-table">' +
          '<div class="cf-table__head cf-grid">' + headCells + '</div>' +
          (empty || phases) +
        '</div>' +
      '</div>'
    );
  }

