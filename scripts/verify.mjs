/* Visual verification probe: test, serve the app, drive headless Chromium
   through the real index.html, and write screenshots to ./verify-out/.
   Exit non-zero if anything fails.

   Run: node scripts/verify.mjs */
import puppeteer from 'puppeteer';
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

// Cash Flow is a view inside the ScenariosUI layer, toggled by #scn-cash-toggle
// (state.cashActive). Click the chip only when it isn't already in the wanted
// state, then let the single authoritative sync repaint #scn-view.
async function setCashFlow(page, open = true){
  await page.evaluate(wantOpen => {
    const chip = document.querySelector('#scn-cash-toggle');
    const isOn = !!chip?.classList.contains('is-on');
    if(isOn !== wantOpen) chip?.click();
  }, open);
  await new Promise(r => setTimeout(r, 400));
}

// Poll until the Cash Flow view has painted its engine-backed rows. The run is
// async (runAll defers, computes, then ScenariosUI.sync repaints), so a fixed
// sleep is unreliable.
async function waitCashRows(page, min = 1, ms = 8000){
  const deadline = Date.now() + ms;
  while(Date.now() < deadline){
    const n = await page.evaluate(() => document.querySelectorAll('#scn-view .cf-row').length);
    if(n >= min) return n;
    await new Promise(r => setTimeout(r, 250));
  }
  return page.evaluate(() => document.querySelectorAll('#scn-view .cf-row').length);
}

async function ensureHouseholdNetWorthView(page){
  await page.click('.htab[data-page="net-worth"]');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-hh-view="networth"]');
  await new Promise(r => setTimeout(r, 350));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('full test suite (npm test)');
const test = spawnSync(process.execPath, ['--test', 'engine.test.js', 'src/tax/federal/rules/ordinaryIncomeTax.test.js', 'src/tax/federal/rules/standardDeduction.test.js', 'src/tax/federal/rules/traditionalIraDeductibility.test.js', 'src/tax/federal/rules/capitalGainsStacking.test.js', 'src/tax/federal/rules/taxableSocialSecurity.test.js', 'src/tax/federal/composers/form1040Spine.test.js', 'src/tax/tests/integration.test.js', 'src/tax/tests/golden1040.test.js', 'src/tax/tests/intakeCompleteness.test.js', 'src/tax/tests/annual1040Fixtures.test.js', 'src/tax/tests/law2025.test.js', 'src/tax/tests/engineYearTo1040Input.test.js', 'src/tax/tests/demoWagesRegression.test.js', 'src/tax/tests/marginalRateSummary.test.js', 'src/planning/tax/runTaxForScenarioPath.test.js', 'src/planning/tax/attachTypicalPathFederalTax.test.js'], { cwd: ROOT, stdio: 'inherit' });
if(test.status !== 0){ console.error('npm test failed'); process.exit(1); }

console.log('serve + drive');
const srv = await startStaticServer();

try {
  const launchOpts = { args: ['--no-sandbox'] };
  const chromeCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for(const chromePath of chromeCandidates){
    if(existsSync(chromePath)){
      launchOpts.executablePath = chromePath;
      break;
    }
  }
  if(!launchOpts.executablePath){
    console.error(
      'No Chrome/Chromium executable found for verify.\n' +
      '  Windows: install Google Chrome, or run: npx puppeteer browsers install chrome\n' +
      '  Or set PUPPETEER_EXECUTABLE_PATH to your chrome.exe path'
    );
    process.exit(1);
  }

  const browser = await puppeteer.launch({ ...launchOpts, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 3 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errs.push('CON: ' + m.text()); });

  await step('load index.html', async () => {
    // Deterministic seed: scenarios persist to localStorage and boot via
    // `loadScenarios() || demoScenarios()`, and reseedScenarios() re-derives each
    // scenario from its delta to baseSnapshot — so a stale browser store would
    // silently replace the demo seed (Baseline 65 / Scenario B 67 / Aggressive
    // risk 5) and make the per-scenario assertions flaky. Clear it and reload so
    // every run starts from demoScenarios().
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
  });

  await step('household packet renders map and net worth inputs', async () => {
    const m = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('.hdr-tabs .htab')].map(b => b.textContent.trim()),
      hasSubnav: !!document.querySelector('#np-subnav'),
      shell: !!document.querySelector('#np-content .hh-shell'),
      personCards: document.querySelectorAll('.hh-person-card').length,
      toggles: document.querySelectorAll('.hh-toggle-btn').length,
      accountBank: !!document.querySelector('.hh-bankrail, .acct-picker'),
    }));
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Sequencing'];
    if(JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) throw new Error(`main nav mismatch: ${JSON.stringify(m.nav)}`);
    if(m.hasSubnav) throw new Error('old net-worth subnav is still rendered');
    if(!m.shell) throw new Error('household shell missing from #np-content');
    if(m.personCards < 2) throw new Error(`expected 2 person cards, got ${m.personCards}`);
    if(m.toggles < 2) throw new Error('household map/networth toggle missing');
    if(!m.accountBank) throw new Error('household account bank missing from map view');

    await page.click('[data-hh-view="networth"]');
    await new Promise(r => setTimeout(r, 400));
    const nw = await page.evaluate(() => {
      const rootText = document.querySelector('#np-content')?.textContent || '';
      return {
        statement: !!document.querySelector('.hh-statement-shell'),
        fieldSections: document.querySelectorAll('.hh-field-sec').length,
        fields: document.querySelectorAll('#np-content input[data-path], #np-content select[data-path]').length,
        labels: [...document.querySelectorAll('.hh-field-row .hh-ledger-name')].map(e => e.textContent.trim()),
        rootText,
      };
    });
    if(!nw.statement) throw new Error('net worth statement shell missing after toggle');
    if(nw.fieldSections < 2 || nw.fields < 20) {
      throw new Error(`net worth inputs thin (sections=${nw.fieldSections}, fields=${nw.fields})`);
    }
    for(const label of ['Client name','Spouse name','Client age','Spouse age','Client retirement age','Spouse retirement age','Plan end age','Annual savings','Monthly spending','Working income','Client Social Security','Client SS age','Spouse Social Security','Spouse SS age','Pension','Healthcare','Risk profile','Withdrawal strategy','Simulation paths']){
      if(!nw.labels.includes(label)) throw new Error(`Household label missing: ${label}`);
    }
    for(const label of ['Taxable','Traditional','Roth']){
      if(!nw.rootText.includes(label)) throw new Error(`Investment account missing: ${label}`);
    }
    await page.screenshot({ path: join(OUT, '01-household.png'), fullPage: true });
  });

  await step('household spouse inputs flow into cash-flow engine rows', async () => {
    // The Cash Flow view shows the baseline plan's engine rows. Editing a
    // Household spouse input, returning to Scenarios (which re-runs the engine on
    // a dirty plan), and opening Cash Flow must change those rows. Income is the
    // third cell of a .cf-row: [year-wrap, Age, Income, RMD, Essential, …].
    const setHH = (path, value) => page.evaluate(({ p, v }) => {
      const el = document.querySelector(`input[data-path="${p}"]`);
      el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { p: path, v: value });
    const openCashFlow = async () => {
      await page.click('button[data-page="scenarios"]');
      await new Promise(r => setTimeout(r, 900));
      await setCashFlow(page, true);
      await waitCashRows(page, 4);
    };
    const incomeAtAge = (age) => page.evaluate(a => {
      const row = [...document.querySelectorAll('#scn-view .cf-row')]
        .find(r => r.querySelector('.cf-cell--age')?.textContent.trim() === String(a));
      return row ? (row.children[2]?.textContent.trim() || '') : '';
    }, age);
    const firstAge = () => page.evaluate(() => {
      const ages = [...document.querySelectorAll('#scn-view .cf-row .cf-cell--age')]
        .map(e => parseInt(e.textContent.trim(), 10)).filter(Number.isFinite);
      return ages.length ? Math.min(...ages) : null;
    });

    // Sanity: the demo spouse inputs are present and editable.
    await ensureHouseholdNetWorthView(page);
    const seed = await page.evaluate(() => ({
      spouseAge: document.querySelector('input[data-path="household.spouse.currentAge"]')?.value,
      spouseRetirementAge: document.querySelector('input[data-path="household.spouse.retirementAge"]')?.value,
    }));
    if(seed.spouseAge !== '57' || seed.spouseRetirementAge !== '64') throw new Error(`spouse household inputs not visible (${JSON.stringify(seed)})`);

    // (1) Spouse Social Security on vs off changes baseline income. Age 72 is past
    // both spouses' claim ages, so the $30k benefit is fully flowing there.
    await setHH('income.socialSecurity.spouse.pia', '30,000');
    await openCashFlow(); const withSpouse = await incomeAtAge(72);
    await ensureHouseholdNetWorthView(page); await setHH('income.socialSecurity.spouse.pia', '0');
    await openCashFlow(); const withoutSpouse = await incomeAtAge(72);
    if(!withSpouse || !withoutSpouse) throw new Error(`cash-flow income cell missing at age 72 (${withSpouse} vs ${withoutSpouse})`);
    if(withSpouse === withoutSpouse) throw new Error(`spouse SS edit did not change baseline income at age 72 (${withSpouse} vs ${withoutSpouse})`);

    // (2) Delaying the spouse's retirement raises the household retirement age on
    // the primary timeline (engine.js), so the first retirement-phase row appears
    // at a later age. Restore SS first so the only change is the retirement age.
    await ensureHouseholdNetWorthView(page); await setHH('income.socialSecurity.spouse.pia', '30,000');
    await openCashFlow(); const firstWhenEarly = await firstAge();
    await ensureHouseholdNetWorthView(page); await setHH('household.spouse.retirementAge', '67');
    await openCashFlow(); const firstWhenLate = await firstAge();
    if(firstWhenEarly == null || firstWhenLate == null) throw new Error(`first cash-flow age missing (${firstWhenEarly} vs ${firstWhenLate})`);
    if(!(firstWhenLate > firstWhenEarly)) throw new Error(`delaying spouse retirement did not push the retirement start later (${firstWhenEarly} -> ${firstWhenLate})`);

    // Restore the demo household and leave Cash Flow closed.
    await ensureHouseholdNetWorthView(page); await setHH('household.spouse.retirementAge', '64');
    await setCashFlow(page, false);
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

  await step('scenarios Compare view: columns, rings, levers, goals', async () => {
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 900));
    await page.click('#scn-seg-compare');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const v = document.querySelector('#scn-view');
      return {
        compare: !!v?.querySelector('.compare'),
        cols: v?.querySelectorAll('.scol').length || 0,
        rings: v?.querySelectorAll('.ring__arc').length || 0,
        probs: [...(v?.querySelectorAll('.scol__prob') || [])].map(e => e.textContent.trim()),
        names: [...(v?.querySelectorAll('.scol__name') || [])].map(e => e.textContent.trim()),
        leverNames: [...(v?.querySelectorAll('.lever__name') || [])].map(e => e.textContent.trim()),
        goalCells: v?.querySelectorAll('.cell--goal').length || 0,
        goalPill: v?.querySelector('.goal-pill, .goal-note')?.textContent || '',
        reference: !!v?.querySelector('.tag-ref'),
        solveBtn: !!document.querySelector('#scn-solve'),
        addBtn: !!document.querySelector('#scn-add'),
        suggestBtn: !!document.querySelector('#scn-suggest'),
        status: document.querySelector('#status')?.textContent || '',
        segActive: document.querySelector('#scn-seg-compare')?.classList.contains('is-active') || false,
      };
    });
    if(!m.compare) throw new Error(`Compare view did not render (status="${m.status}")`);
    if(m.cols < 1) throw new Error(`no scenario columns rendered (cols=${m.cols}, status="${m.status}")`);
    if(m.rings < m.cols) throw new Error(`success rings missing (rings=${m.rings}, cols=${m.cols})`);
    if(!m.probs.some(p => /\d/.test(p))) throw new Error(`scenario probabilities not populated: ${JSON.stringify(m.probs)}`);
    if(!m.leverNames.includes('Plan Levers')) throw new Error(`Plan Levers header missing: ${JSON.stringify(m.leverNames)}`);
    if(m.goalCells < m.cols) throw new Error(`goals row not mirrored across columns (cells=${m.goalCells}, cols=${m.cols})`);
    if(!/active/.test(m.goalPill)) throw new Error(`goals summary cell missing an active count: "${m.goalPill}"`);
    if(!m.reference) throw new Error('baseline Reference tag missing from Compare');
    if(!m.solveBtn || !m.addBtn || !m.suggestBtn) throw new Error('Solve / Add / Suggest toolbar actions missing from Scenarios');
    if(!m.segActive) throw new Error('Compare segment did not mark itself active');
    if(m.names.some(n => /sell\s*home/i.test(n))) throw new Error(`stale sale scenario visible: ${JSON.stringify(m.names)}`);

    // Compare is editable: every lever cell carries per-column −/+ steppers
    // (data-scn-id) that mutate that scenario and request a manual Run. Step up
    // then back down so the baseline is left as found (the Cash-Flow step checks
    // the baseline retirement marker is at 65).
    const cmpSteppers = await page.evaluate(() => document.querySelectorAll('#scn-view .compare .cmp-step .stepper-btn[data-scn-id]').length);
    if(cmpSteppers < 6) throw new Error(`Compare editable steppers missing (found ${cmpSteppers})`);
    await page.evaluate(() => document.querySelector('#scn-view .compare .cmp-step .stepper-btn[data-dir="1"]')?.click());
    await new Promise(r => setTimeout(r, 250));
    const cmpStatus = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
    if(!/Run to update/i.test(cmpStatus)) throw new Error(`Compare stepper did not request a manual Run: "${cmpStatus}"`);
    await page.evaluate(() => document.querySelector('#scn-view .compare .cmp-step .stepper-btn[data-dir="-1"]')?.click());
    await new Promise(r => setTimeout(r, 250));

    await page.screenshot({ path: join(OUT, '03-scenarios.png'), fullPage: true });
  });

  await step('scenarios Focus view: hero ring, lever steppers, goals, rail', async () => {
    await page.click('#scn-seg-focus');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const v = document.querySelector('#scn-view');
      return {
        focus: !!v?.querySelector('.focus'),
        heroRing: !!v?.querySelector('.hero .ring__arc'),
        heroNumeral: v?.querySelector('.hero__numeral')?.textContent || '',
        steppers: v?.querySelectorAll('.assum__stepper .stepper-btn[data-lever-key]').length || 0,
        goalRows: v?.querySelectorAll('.goal-row').length || 0,
        railCards: v?.querySelectorAll('.rail-card[data-pick]').length || 0,
        railFocus: !!v?.querySelector('.rail-card__tag--focus'),
        segActive: document.querySelector('#scn-seg-focus')?.classList.contains('is-active') || false,
      };
    });
    if(!m.focus) throw new Error('Focus view did not render');
    if(!m.heroRing) throw new Error('Focus hero ring missing');
    if(!/\d/.test(m.heroNumeral)) throw new Error(`Focus hero probability not populated: "${m.heroNumeral}"`);
    if(m.steppers < 2) throw new Error(`Focus lever steppers missing (${m.steppers})`);
    if(m.goalRows < 1) throw new Error(`Focus goals list rendered no rows (${m.goalRows})`);
    if(m.railCards < 1) throw new Error(`Focus scenario rail rendered no cards (${m.railCards})`);
    if(!m.railFocus) throw new Error('Focus rail did not mark the in-focus scenario');
    if(!m.segActive) throw new Error('Focus segment did not mark itself active');

    // A lever stepper mutates the focused scenario and asks for a manual Run
    // (existing production flow — no auto-run). Step up then back down so the
    // scenario's levers are left exactly as found (no Run fires, so s.res and the
    // baseline retirement marker the Cash Flow step checks stay consistent).
    await page.evaluate(() => document.querySelector('#scn-view .assum__stepper .stepper-btn[data-dir="1"]')?.click());
    await new Promise(r => setTimeout(r, 250));
    const status = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
    if(!/Run to update/i.test(status)) throw new Error(`lever stepper did not request a manual Run: "${status}"`);
    await page.evaluate(() => document.querySelector('#scn-view .assum__stepper .stepper-btn[data-dir="-1"]')?.click());
    await new Promise(r => setTimeout(r, 250));
    await page.screenshot({ path: join(OUT, '03b-scenarios-focus.png'), fullPage: true });
  });

  await step('cash-flow view: exact columns, rows, summary, path controls, pills', async () => {
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 600));
    await setCashFlow(page, true);
    await waitCashRows(page, 10);
    const EXPECT = ['Year', 'Age', 'Income', 'RMD', 'Essential', 'Goals', 'Tax', 'Portfolio Draw', 'WD Rate', 'Ending'];
    const m = await page.evaluate(() => {
      const v = document.querySelector('#scn-view');
      return {
        cf: !!v?.querySelector('.cf'),
        rows: v?.querySelectorAll('.cf-row').length || 0,
        cols: [...(v?.querySelectorAll('.cf-table__head .cf-th') || [])].map(th => th.textContent.trim()),
        pills: [...(v?.querySelectorAll('.cf-pill') || [])].map(p => p.textContent.trim()),
        summaryName: v?.querySelector('.cf-summary__name')?.textContent.trim() || '',
        stats: [...(v?.querySelectorAll('.cf-stat__label') || [])].map(s => s.textContent.trim()),
        pathControls: !!v?.querySelector('#scn-cf-path-controls #path-mode'),
        mode: v?.querySelector('#scn-cf-path-controls #path-mode')?.value || '',
        caption: v?.querySelector('.cf__caption')?.textContent || '',
      };
    });
    if(!m.cf) throw new Error('cash-flow view did not render');
    if(m.rows < 10) throw new Error(`cash-flow rows = ${m.rows} (expected >=10)`);
    if(JSON.stringify(m.cols) !== JSON.stringify(EXPECT)) throw new Error(`cash-flow columns are not the exact contract: ${JSON.stringify(m.cols)}`);
    // The diagnostic Engine-tax / Federal-tax columns must NOT appear in this view.
    if(m.cols.some(c => /engine tax|federal tax/i.test(c))) throw new Error(`diagnostic tax column leaked into cash flow: ${JSON.stringify(m.cols)}`);
    if(m.cols.some(c => ['Withdraw', 'One-time', 'Return $', 'Starting value', 'Inflows', 'Outflows', 'Annual return', 'Ending value'].includes(c))) throw new Error(`old cash-flow columns still present: ${JSON.stringify(m.cols)}`);
    if(m.pills.length < 2) throw new Error(`scenario pills missing: ${JSON.stringify(m.pills)}`);
    if(!m.pathControls) throw new Error('path-replay controls not relocated into #scn-cf-path-controls');
    if(m.mode !== 'typical') throw new Error(`path replay default mode not typical (${m.mode})`);
    for(const label of ['Median Ending', 'Lifetime Draw', 'Funds Last', 'Peak Withdrawal']){
      if(!m.stats.includes(label)) throw new Error(`cash-flow summary stat missing: ${label} (${JSON.stringify(m.stats)})`);
    }
    if(!/nominal/.test(m.caption)) throw new Error(`cash-flow caption missing nominal-$ note: "${m.caption}"`);

    // The baseline plan's retirement marker (lifeTag) lands on the retirement age.
    const retireAge = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#scn-view .cf-row')]
        .find(r => /Retirement begins/.test(r.querySelector('.cf-row__lifetag')?.textContent || ''));
      return row ? (row.querySelector('.cf-cell--age')?.textContent.trim() || '') : '';
    });
    if(retireAge !== '65') throw new Error(`baseline retirement marker not at age 65 (got "${retireAge}")`);

    // The scenario pills switch which plan's cash flow is shown, and each plan's
    // retirement marker reflects ITS OWN retire age. demoScenarios seeds Baseline
    // at 65 (asserted just above) and Scenario B at 67 (s[1].lev.retireAge = 67),
    // so selecting the Scenario B pill — the NEW mechanism; there is no longer a
    // .cf-chip path — must move the "Retirement begins" marker from 65 to 67.
    const markerAge = () => page.evaluate(() => {
      const row = [...document.querySelectorAll('#scn-view .cf-row')]
        .find(r => /Retirement begins/.test(r.querySelector('.cf-row__lifetag')?.textContent || ''));
      return row ? (row.querySelector('.cf-cell--age')?.textContent.trim() || '') : '';
    });
    const pickedB = await page.evaluate(() => {
      const pill = [...document.querySelectorAll('#scn-view .cf-pill')].find(p => /Scenario B/.test(p.textContent));
      if(!pill) return false;
      pill.click();
      return true;
    });
    if(!pickedB) throw new Error(`Scenario B pill not found among ${JSON.stringify(m.pills)}`);
    await new Promise(r => setTimeout(r, 450));
    await waitCashRows(page, 10);
    const bName = await page.evaluate(() => document.querySelector('#scn-view .cf-summary__name')?.textContent.trim() || '');
    if(bName !== 'Scenario B') throw new Error(`cash-flow pill did not switch to Scenario B (got "${bName}")`);
    const bMarker = await markerAge();
    if(bMarker !== '67') throw new Error(`Scenario B retirement marker not at age 67 (got "${bMarker}")`);
    // Restore Baseline for the path-replay checks below.
    await page.evaluate(() => [...document.querySelectorAll('#scn-view .cf-pill')].find(p => /Baseline/.test(p.textContent))?.click());
    await new Promise(r => setTimeout(r, 350));
    await waitCashRows(page, 10);

    // Path replay: choose mode reveals the advanced controls and re-renders the
    // table; favorable mode is available and also re-renders. (#path-mode is the
    // production node relocated into the Cash Flow header — same element, same
    // bindings.)
    await page.select('#path-mode', 'choose');
    await new Promise(r => setTimeout(r, 300));
    const chosen = await page.evaluate(() => ({
      chooseOn: document.querySelector('#path-choose')?.classList.contains('on') || false,
      seedOn: document.querySelector('#path-seed-wrap')?.classList.contains('on') || false,
    }));
    if(!chosen.chooseOn || !chosen.seedOn) throw new Error(`choose-path advanced controls not revealed: ${JSON.stringify(chosen)}`);
    await page.evaluate(() => {
      const input = document.querySelector('#path-index');
      input.value = '47'; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 400));
    if(await waitCashRows(page, 10) < 10) throw new Error('choosing path 47 emptied the cash-flow table');
    const hasFavorable = await page.evaluate(() => [...document.querySelectorAll('#path-mode option')].some(o => o.value === 'favorable'));
    if(!hasFavorable) throw new Error('favorable option missing from path-mode select');
    await page.select('#path-mode', 'favorable');
    await new Promise(r => setTimeout(r, 400));
    if(await waitCashRows(page, 10) < 10) throw new Error('favorable path emptied the cash-flow table');
    await page.select('#path-mode', 'typical');
    await new Promise(r => setTimeout(r, 300));
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

  if(errs.length){
    console.error('PAGE/CONSOLE ERRORS:');
    errs.forEach(e => console.error('  ' + e));
  }

  await browser.close();
  console.log(`\nOK verify passed - screenshots in ${OUT}`);
} finally {
  await closeServer(srv);
}
