/* Visual verification probe: test, serve the app, drive headless Chromium
   through the real index.html, and write screenshots to ./verify-out/.
   Exit non-zero if anything fails.

   Run: node scripts/verify.mjs */
import puppeteer from 'puppeteer';
const chromium = { launch: (opts) => puppeteer.launch({ ...opts, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined }) };
import { existsSync, mkdirSync, readFile, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verify-out');
const PORT = 8765;

function step(name, fn){
  return fn().then(
    r => { console.log(`  OK ${name}`); return r; },
    e => { console.error(`  FAIL ${name}\n${e.message || e}`); process.exit(1); }
  );
}

function contentType(filePath){
  const ext = filePath.split('.').pop();
  return ext === 'html' ? 'text/html'
    : ext === 'js' ? 'text/javascript'
    : ext === 'css' ? 'text/css'
    : 'application/octet-stream';
}

function startStaticServer(){
  const serverRoot = resolve(ROOT);
  const server = createServer((req, res) => {
    const rawPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const relPath = decodeURIComponent(rawPath).replace(/^\/+/, '');
    const filePath = resolve(serverRoot, relPath);

    if (filePath !== serverRoot && !filePath.startsWith(serverRoot + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }

    readFile(filePath, (err, body) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': contentType(filePath) });
      res.end(body);
    });
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(PORT, '127.0.0.1', () => ok(server));
  });
}

function closeServer(server){
  return new Promise(resolveClose => server.close(resolveClose));
}

async function ensureCashflowDrawer(page, open = true){
  await page.evaluate(wantOpen => {
    const d = document.querySelector('#cf-drawer');
    const b = document.querySelector('#cf-btn');
    if(!d || !b) return;
    const isOpen = d.style.display === 'block';
    if(isOpen !== wantOpen) b.click();
  }, open);
  await new Promise(r => setTimeout(r, 350));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('engine tests');
const test = spawnSync('node', ['--test', join(ROOT, 'engine.test.js'), join(ROOT, 'history.test.js')], { cwd: ROOT, stdio: 'inherit' });
if(test.status !== 0){ console.error('engine tests failed'); process.exit(1); }

console.log('serve + drive');
const srv = await startStaticServer();

try {
  const launchOpts = {};
  const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (existsSync(CONTAINER_CHROME)) {
    launchOpts.executablePath = CONTAINER_CHROME;
  }
  launchOpts.args = ['--no-sandbox'];

  const browser = await chromium.launch({ ...launchOpts, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 3 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errs.push('CON: ' + m.text()); });

  await step('load index.html', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
  });

  await step('household input page renders final prototype nav and fields', async () => {
    const m = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('.hdr-tabs .htab')].map(b => b.textContent.trim()),
      hasSubnav: !!document.querySelector('#np-subnav'),
      title: [...document.querySelectorAll('.bs-title')].map(e => e.textContent.trim()),
      heads: document.querySelectorAll('.bs-head').length,
      labels: [...document.querySelectorAll('.bs-row label')].map(e => e.textContent.trim()),
      fields: document.querySelectorAll('.bs-row input, .bs-row select').length,
      propertyCards: document.querySelectorAll('.prop').length,
      accountPicker: document.querySelectorAll('.acct-picker').length,
    }));
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Sequencing', 'History'];
    if(JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) throw new Error(`main nav mismatch: ${JSON.stringify(m.nav)}`);
    if(m.hasSubnav) throw new Error('old net-worth subnav is still rendered');
    if(m.title.length !== 2 || m.heads < 4 || m.fields < 20) {
      throw new Error(`Household page did not render enough inputs (titles=${m.title.length}, heads=${m.heads}, fields=${m.fields})`);
    }
    for(const label of ['Client name','Spouse name','Client age','Spouse age','Client retirement age','Spouse retirement age','Plan end age','Taxable','Traditional','Roth','Annual savings','Monthly spending','Working income','Client Social Security','Client SS age','Spouse Social Security','Spouse SS age','Pension','Healthcare','Risk profile','Withdrawal strategy','Simulation paths']){
      if(!m.labels.includes(label)) throw new Error(`Household label missing: ${label}`);
    }
    if(m.propertyCards || m.accountPicker) throw new Error(`parked detail UI still visible (propertyCards=${m.propertyCards}, accountPicker=${m.accountPicker})`);
    await page.screenshot({ path: join(OUT, '01-household.png'), fullPage: true });
  });

  await step('household spouse inputs flow into cash-flow engine rows', async () => {
    const before = await page.evaluate(() => {
      document.querySelector('input[data-path="income.socialSecurity.spouse.pia"]').value = '30,000';
      document.querySelector('input[data-path="income.socialSecurity.spouse.pia"]').dispatchEvent(new Event('change', { bubbles: true }));
      return {
        spouseAge: document.querySelector('input[data-path="household.spouse.currentAge"]')?.value,
        spouseRetirementAge: document.querySelector('input[data-path="household.spouse.retirementAge"]')?.value,
        spouseSS: document.querySelector('input[data-path="income.socialSecurity.spouse.pia"]')?.value,
      };
    });
    if(before.spouseAge !== '57' || before.spouseRetirementAge !== '64' || !/30,000/.test(before.spouseSS)) throw new Error(`spouse household inputs not visible (${JSON.stringify(before)})`);
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 900));
    await ensureCashflowDrawer(page, true);
    const withSpouse = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#cf-drawer .cf-table tbody tr')]
        .find(tr => tr.querySelector('td.age')?.textContent.trim() === '68');
      return row ? row.querySelectorAll('td')[3]?.textContent.trim() : '';
    });
    await page.click('button[data-sub-target="balance-sheet"]');
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const input = document.querySelector('input[data-path="income.socialSecurity.spouse.pia"]');
      input.value = '0';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 900));
    const withoutSpouse = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#cf-drawer .cf-table tbody tr')]
        .find(tr => tr.querySelector('td.age')?.textContent.trim() === '68');
      return row ? row.querySelectorAll('td')[3]?.textContent.trim() : '';
    });
    if(withSpouse === withoutSpouse) throw new Error(`spouse SS edit did not change baseline income at age 68 (${withSpouse} vs ${withoutSpouse})`);
    await page.click('button[data-sub-target="balance-sheet"]');
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const input = document.querySelector('input[data-path="income.socialSecurity.spouse.pia"]');
      input.value = '30,000';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const retire = document.querySelector('input[data-path="household.spouse.retirementAge"]');
      retire.value = '67';
      retire.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 900));
    await ensureCashflowDrawer(page, true);
    const laterSpouseRetirement = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#cf-drawer .cf-table tbody tr')]
        .find(tr => tr.querySelector('td.age')?.textContent.trim() === '67');
      const tds = row ? [...row.querySelectorAll('td')].map(td => td.textContent.trim()) : [];
      return { income: tds[3] || '', inflows: tds[5] || '' };
    });
    if(laterSpouseRetirement.income !== '-' || !/\$30,000/.test(laterSpouseRetirement.inflows)) {
      throw new Error(`spouse retirement age did not keep age 67 in accumulation (${JSON.stringify(laterSpouseRetirement)})`);
    }
    await page.click('button[data-sub-target="balance-sheet"]');
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const retire = document.querySelector('input[data-path="household.spouse.retirementAge"]');
      retire.value = '64';
      retire.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  await step('goals renders tributaries and statement rows', async () => {
    await page.click('.htab[data-sub-target="goals"]');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => ({
      svg: !!document.querySelector('#goal-thread svg'),
      svgH: Math.round(document.querySelector('#goal-thread svg')?.getBoundingClientRect().height || 0),
      flows: document.querySelectorAll('.gt-flow:not(.ghost)').length,
      once: document.querySelectorAll('.gt-once').length,
      spine: document.querySelectorAll('.gt-spine').length,
      hits: document.querySelectorAll('.gt-hit').length,
      rows: document.querySelectorAll('.gl-row').length,
      goals: window.__planGoalsCount ?? null,
      rowInputs: document.querySelector('.gl-row')?.querySelectorAll('input').length || 0,
      toggles: document.querySelectorAll('.gl-keep').length,
      facts: document.querySelector('.gl-facts')?.textContent || '',
      oldBoard: document.querySelectorAll('.g-board, .g-slot, .g-card, .gw-shell').length,
    }));
    if(!m.svg) throw new Error('goal thread svg missing');
    if(m.svgH < 150) throw new Error(`goal thread svg too short (${m.svgH}px)`);
    if(m.flows < 3) throw new Error(`expected >=3 recurring ribbons, got ${m.flows}`);
    if(m.once < 1) throw new Error('one-time diamond missing');
    if(m.spine !== 1) throw new Error(`expected one spine, got ${m.spine}`);
    if(m.hits < 4) throw new Error(`hit targets missing (${m.hits})`);
    if(m.rows < 4) throw new Error(`expected a statement row per goal, got ${m.rows}`);
    if(m.rowInputs < 3) throw new Error(`row inline inputs missing (${m.rowInputs})`);
    if(m.toggles !== m.rows) throw new Error(`keep toggles (${m.toggles}) != rows (${m.rows})`);
    if(!/\$/.test(m.facts)) throw new Error(`facts line missing dollar totals: "${m.facts}"`);
    if(m.oldBoard !== 0) throw new Error('old goals board/web DOM still present');
    // Engine-measured cost cells fill asynchronously - poll, don't sleep-assert.
    const deadline = Date.now() + 8000;
    let cost = '';
    while(Date.now() < deadline){
      cost = await page.evaluate(() => document.querySelector('.gl-cost')?.textContent || '');
      if(/pts/.test(cost)) break;
      await new Promise(r => setTimeout(r, 250));
    }
    if(!/pts/.test(cost) || !/\$/.test(cost)) throw new Error(`per-goal cost cell never filled: "${cost}"`);
    const runsLine = await page.evaluate(() => document.querySelector('#gl-runs')?.textContent || '');
    if(!/%/.test(runsLine) || !/\$/.test(runsLine) || !/all goals off/.test(runsLine)) {
      throw new Error(`kept/all-off engine fact lines missing: "${runsLine}"`);
    }
    await page.screenshot({ path: join(OUT, '02-goals.png'), fullPage: true });
  });

  await step('goals add, delete, what-if toggle and select workflows', async () => {
    await page.click('.htab[data-sub-target="goals"]');
    await new Promise(r => setTimeout(r, 300));
    const before = await page.evaluate(() => document.querySelectorAll('.gl-row').length);
    await page.click('[data-add="goalRec"]');
    await new Promise(r => setTimeout(r, 250));
    const after = await page.evaluate(() => document.querySelectorAll('.gl-row').length);
    if(after !== before + 1) throw new Error(`recurring goal did not append (before=${before}, after=${after})`);
    await page.click('.gl-row:last-child .row-x');
    await new Promise(r => setTimeout(r, 200));
    const final = await page.evaluate(() => document.querySelectorAll('.gl-row').length);
    if(final !== before) throw new Error(`recurring goal delete did not splice (final=${final})`);
    await page.click('[data-add="goalOnce"]');
    await new Promise(r => setTimeout(r, 250));
    const onceRow = await page.evaluate(() => {
      const r = document.querySelector('.gl-row:last-child');
      return { rows: document.querySelectorAll('.gl-row').length, text: r?.textContent || '' };
    });
    if(onceRow.rows !== before + 1 || !/once at/.test(onceRow.text)) throw new Error(`one-time goal did not append as once (${JSON.stringify(onceRow)})`);
    await page.click('.gl-row:last-child .row-x');
    await new Promise(r => setTimeout(r, 200));
    // What-if toggle: row drops, its ribbon turns ghost, plan.goals untouched
    // (the Scenarios goals-mirror step later asserts every goal still funded).
    await page.click('.gl-row .gl-keep');
    await new Promise(r => setTimeout(r, 250));
    const dropped = await page.evaluate(() => ({
      droppedRows: document.querySelectorAll('.gl-row.dropped').length,
      ghosts: document.querySelectorAll('.gt-flow.ghost, .gt-once.ghost').length,
      label: document.querySelector('.gl-row.dropped .gl-keep')?.textContent.trim() || '',
    }));
    if(dropped.droppedRows !== 1 || dropped.ghosts !== 1) throw new Error(`what-if drop did not ghost the ribbon (${JSON.stringify(dropped)})`);
    if(dropped.label !== 'dropped') throw new Error(`toggle label wrong: "${dropped.label}"`);
    // The dropped row's cell flips to the "if kept" phrasing once runs land.
    const dl = Date.now() + 8000;
    let droppedCost = '';
    while(Date.now() < dl){
      droppedCost = await page.evaluate(() => document.querySelector('.gl-row.dropped .gl-cost')?.textContent || '');
      if(/if kept/.test(droppedCost)) break;
      await new Promise(r => setTimeout(r, 250));
    }
    if(!/if kept/.test(droppedCost)) throw new Error(`dropped goal cost did not recompute: "${droppedCost}"`);
    await page.click('.gl-row.dropped .gl-keep');
    await new Promise(r => setTimeout(r, 250));
    const restored = await page.evaluate(() => document.querySelectorAll('.gl-row.dropped, .gt-flow.ghost').length);
    if(restored !== 0) throw new Error('what-if drop did not restore');
    // Click-select: svg hit path highlights its statement row.
    await page.evaluate(() => document.querySelector('.gt-hit').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await new Promise(r => setTimeout(r, 150));
    const sel = await page.evaluate(() => ({
      selRows: document.querySelectorAll('.gl-row.sel').length,
      onFlows: document.querySelectorAll('.gt-flow.on, .gt-once.on').length,
    }));
    if(sel.selRows !== 1 || sel.onFlows < 1) throw new Error(`svg click-select did not sync (${JSON.stringify(sel)})`);
    await page.evaluate(() => document.querySelector('.gt-hit').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  });

  await step('scenarios renders after tab switch', async () => {
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 800));
    const m = await page.evaluate(() => ({
      band: document.querySelectorAll('.scn-band svg circle').length,
      status: document.querySelector('#status')?.textContent || '',
      goalRows: document.querySelectorAll('#scn-goals .sg-name').length,
      goalCells: document.querySelectorAll('#scn-goals .sg-cell').length,
      goalTotal: document.querySelector('#scn-goals .sg-tcell')?.textContent || '',
      solve: !!document.querySelector('.solve-btn'),
      saleLever: [...document.querySelectorAll('.lev-lbl')].some(e => /^Sell\b/.test(e.textContent.trim())),
      scenarioNames: [...document.querySelectorAll('.col-name')].map(e => e.textContent.trim()),
    }));
    if(m.band < 1) throw new Error(`scenarios did not render (band circles=${m.band}, status="${m.status}")`);
    if(m.goalRows < 1) throw new Error(`scenarios goals section rendered no goal rows (goalRows=${m.goalRows})`);
    if(m.goalCells < m.goalRows) throw new Error(`goals not mirrored into columns (cells=${m.goalCells}, rows=${m.goalRows})`);
    if(!m.goalTotal.startsWith('$')) throw new Error(`goals total row missing a dollar figure (got "${m.goalTotal}")`);
    if(!m.solve) throw new Error('Solve-For button missing from scenarios');
    if(m.saleLever) throw new Error('parked property-sale lever is visible in scenarios');
    if(m.scenarioNames.some(n => /sell\s*home/i.test(n))) throw new Error(`stale sale scenario visible: ${JSON.stringify(m.scenarioNames)}`);
    await page.screenshot({ path: join(OUT, '03-scenarios.png'), fullPage: true });
  });

  await step('cash-flow drawer opens with path replay controls and rows', async () => {
    await ensureCashflowDrawer(page, true);
    const m = await page.evaluate(() => {
      const d = document.querySelector('#cf-drawer');
      return {
        rows: d?.querySelectorAll('.cf-table tbody tr').length || 0,
        height: d?.getBoundingClientRect().height || 0,
        mode: document.querySelector('#path-mode')?.value || '',
        header: d?.querySelector('.cf-drawer-head')?.textContent || '',
        columnLabels: [...(d?.querySelectorAll('.cf-table thead tr:nth-child(2) th') || [])].map(th => th.textContent.trim()),
        sources: [...(d?.querySelectorAll('td.source') || [])].slice(0, 8).map(td => td.textContent.trim()),
        sourceHead: !!d?.querySelector('th.source'),
        retireAges: [...(d?.querySelectorAll('td.retire-start') || [])]
          .map(td => td.parentElement.querySelector('td.age')?.textContent.trim())
          .filter(Boolean),
      };
    });
    if(m.rows < 10) throw new Error(`cash-flow rows = ${m.rows} (expected >=10)`);
    if(m.height < 100) throw new Error(`cash-flow height = ${m.height}px (expected >=100)`);
    if(m.mode !== 'typical') throw new Error(`path replay default mode not typical (${m.mode})`);
    if(!/Path Replay/.test(m.header) || !/Seed/.test(m.header) || !/Path/.test(m.header)) throw new Error(`path replay header missing metadata: "${m.header}"`);
    for(const label of ['Starting value','Income','Outflows','Inflows','Annual return','Ending value']){
      if(!m.columnLabels.includes(label)) throw new Error(`cash-flow column missing: ${label}`);
    }
    if(m.columnLabels.some(label => ['Withdraw','RMD','Goals','One-time','Return $'].includes(label))) {
      throw new Error(`old cash-flow columns still visible: ${JSON.stringify(m.columnLabels)}`);
    }
    if(!m.sourceHead || !m.sources.some(v => /^\d{4}$/.test(v))) throw new Error(`cash-flow source years missing: ${JSON.stringify(m.sources)}`);
    if(m.retireAges.length < 3) throw new Error(`cash-flow scenario retirement markers missing (${JSON.stringify(m.retireAges)})`);
    if(!new Set(m.retireAges).has('67')) throw new Error(`moved-retirement scenario marker missing (${JSON.stringify(m.retireAges)})`);
    await page.select('#path-mode', 'choose');
    await new Promise(r => setTimeout(r, 100));
    await page.evaluate(() => {
      const input = document.querySelector('#path-index');
      input.value = '47';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 250));
    const chosen = await page.evaluate(() => ({
      chooseVisible: document.querySelector('#path-choose')?.classList.contains('on') || false,
      seedVisible: document.querySelector('#path-seed-wrap')?.classList.contains('on') || false,
      header: document.querySelector('#cf-drawer .cf-drawer-head')?.textContent || '',
    }));
    if(!chosen.chooseVisible || !chosen.seedVisible) throw new Error(`choose-path advanced controls not visible: ${JSON.stringify(chosen)}`);
    if(!/Path 047/.test(chosen.header)) throw new Error(`chosen path header did not update: "${chosen.header}"`);
    const hasFavorable = await page.evaluate(() => [...document.querySelectorAll('#path-mode option')].some(o => o.value === 'favorable'));
    if(!hasFavorable) throw new Error('favorable option missing from path-mode select');
    await page.select('#path-mode', 'favorable');
    await new Promise(r => setTimeout(r, 250));
    const favHeader = await page.evaluate(() => document.querySelector('#cf-drawer .cf-drawer-head')?.textContent || '');
    if(!/Favorable path/.test(favHeader)) throw new Error(`favorable path did not relabel the drawer: "${favHeader}"`);
    await page.select('#path-mode', 'choose');
    await new Promise(r => setTimeout(r, 250));
    await page.evaluate(() => document.querySelector('#cf-drawer').scrollIntoView());
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: join(OUT, '04-cashflow.png'), fullPage: true });
  });

  await step('sequencing renders all chips on', async () => {
    await page.click('button[data-page="sequencing"]');
    await new Promise(r => setTimeout(r, 600));
    await page.evaluate(() => document.querySelectorAll('.seq-chip').forEach(c => { if(!c.classList.contains('on')) c.click(); }));
    await new Promise(r => setTimeout(r, 600));
    const ok = await page.evaluate(() => document.querySelectorAll('#seq-svg path').length > 4);
    if(!ok) throw new Error('sequencing chart missing paths');
    const el = await page.$('.seq-chart');
    await el.screenshot({ path: join(OUT, '05-sequencing.png') });
  });

  await step('playback verdict, strategy comparison and year table', async () => {
    await page.evaluate(() => [...document.querySelectorAll('[data-pb-year]')].find(b => b.textContent === '2000')?.click());
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => ({
      verdict: document.querySelector('#pb-verdict')?.textContent || '',
      sub: document.querySelector('#playback-panel .pb-sub')?.textContent || '',
      stratRows: document.querySelectorAll('#pb-strats tr').length,
      stratText: document.querySelector('#pb-strats')?.textContent || '',
      years: [...document.querySelectorAll('[data-pb-year]')].map(b => b.textContent.trim()),
    }));
    if(!/(survives 2000|2000 breaks the plan at age \d+)/.test(m.verdict)) throw new Error(`playback verdict wrong: "${m.verdict}"`);
    if(!/\$/.test(m.sub) && !/exhausted/.test(m.sub)) throw new Error(`playback subline missing figures: "${m.sub}"`);
    if(m.stratRows !== 4) throw new Error(`expected header + 3 strategy rows, got ${m.stratRows}`);
    if(!/the plan’s strategy/.test(m.stratText) || !/baseline/.test(m.stratText)) throw new Error('plan strategy row not marked as baseline');
    if(m.years.length < 6) throw new Error(`playback year picker too small: ${JSON.stringify(m.years)}`);
    await page.click('#pb-detail-btn');
    await new Promise(r => setTimeout(r, 300));
    const t = await page.evaluate(() => ({
      rows: document.querySelectorAll('#pb-table tr').length,
      heads: [...document.querySelectorAll('#pb-table th')].map(th => th.textContent.trim()),
      money: [...document.querySelectorAll('#pb-table td.end')].slice(0, 3).map(td => td.textContent.trim()),
    }));
    if(t.rows < 20) throw new Error(`year table too short (${t.rows} rows)`);
    for(const h of ['Age','Era','Return','Return $','Drawn','End']){
      if(!t.heads.includes(h)) throw new Error(`year table header missing: ${h} (${JSON.stringify(t.heads)})`);
    }
    if(!t.money.every(v => v.startsWith('$'))) throw new Error(`year table end balances not dollars: ${JSON.stringify(t.money)}`);
    await page.evaluate(() => document.querySelector('#playback-panel').scrollIntoView({ block: 'start' }));
    await new Promise(r => setTimeout(r, 250));
    await page.screenshot({ path: join(OUT, '06-playback.png') });
  });

  await step('history renders present block, reference set and selected detail', async () => {
    await page.click('button[data-page="history"]');
    await new Promise(r => setTimeout(r, 600));
    const m = await page.evaluate(() => ({
      stats: document.querySelectorAll('#hist-body .story-stat').length,
      rows: document.querySelectorAll('.hist-row').length,
      onRows: document.querySelectorAll('.hist-row.on').length,
      rowText: document.querySelector('.hist-row')?.textContent || '',
      ledger: document.querySelectorAll('#hist-body .ledger h5').length,
      notes: document.querySelectorAll('.hist-note').length,
      foot: document.querySelector('.hist-foot')?.textContent || '',
    }));
    if(m.stats < 8) throw new Error(`history stat lines incomplete (${m.stats})`);
    if(m.rows !== 5 || m.onRows !== 1) throw new Error(`reference rows wrong (rows=${m.rows}, on=${m.onRows})`);
    if(!/during \+?[\d.]+/.test(m.rowText) || !/next 3 yrs/.test(m.rowText)) throw new Error(`reference row missing during/next facts: "${m.rowText}"`);
    if(m.ledger !== 2 || m.notes < 3) throw new Error(`selected detail incomplete (ledger=${m.ledger}, notes=${m.notes})`);
    if(!/not a forecast/.test(m.foot) || !/not used in planning/.test(m.foot)) throw new Error(`context disclaimer missing: "${m.foot}"`);
    // Selecting another reference re-renders its detail.
    const firstDetail = await page.evaluate(() => document.querySelector('#hist-body .ledger')?.textContent || '');
    await page.evaluate(() => [...document.querySelectorAll('.hist-row')][1].click());
    await new Promise(r => setTimeout(r, 300));
    const m2 = await page.evaluate(() => ({
      on: document.querySelector('.hist-row.on')?.dataset.hist || '',
      detail: document.querySelector('#hist-body .ledger')?.textContent || '',
    }));
    if(m2.detail === firstDetail) throw new Error('selecting a reference did not change the detail');
    await page.screenshot({ path: join(OUT, '07-history.png'), fullPage: true });
  });

  if(errs.length){
    console.error('PAGE/CONSOLE ERRORS:');
    errs.forEach(e => console.error('  ' + e));
  }

  await browser.close();
  console.log(`\nOK verify passed - screenshots in ${OUT}`);
} finally {
  await closeServer(srv);
}
