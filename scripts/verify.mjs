/* Visual verification probe: test, serve the app, drive headless Chromium
   through the real index.html, and write screenshots to ./verify-out/.
   Exit non-zero if anything fails.

   Run: node scripts/verify.mjs */
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readFile, readFileSync, rmSync } from 'node:fs';
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

/* ── Household contract (static source assertions) ──────────────────────────
   Household is the EDITABLE plan-input console (Folio/glass). This asserts its
   boundaries: the three chapters exist with exactly one renderer each (rendered
   inline in index.html, reusing renderField); the surface is EDITABLE — it emits
   data-path inputs and a #hh-view delegate that writes edits back to `plan` and
   reseeds/dirties scenarios (hhCommit); no sample household ships; the stylesheet
   is linked once and every .hh- selector is scoped to the page key; and no
   competing Household layer survives in main.css. The editing BEHAVIOUR (edits
   reach the engine) is proved by the browser steps below. */
function verifyHousehold(){
  const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const fails = [];
  const ok = (cond, msg) => { if(!cond) fails.push(msg); };
  const html = read(join(ROOT, 'index.html'));
  const css  = read(join(ROOT, 'styles', 'household.css'));
  const main = read(join(ROOT, 'styles', 'main.css'));

  // three chapters: rail seam + renderer (rendered inline from index.html)
  ok(/hh-chap-demographics/.test(html) && /function renderHhDemographics\b/.test(html), 'Demographics chapter missing (hh-chap-demographics + renderHhDemographics)');
  ok(/hh-chap-networth/.test(html)     && /function renderHhNetWorth\b/.test(html),      'Net Worth chapter missing (hh-chap-networth + renderHhNetWorth)');
  ok(/hh-chap-cashflow/.test(html)     && /function renderHhCashflow\b/.test(html),      'Cash Flow chapter missing (hh-chap-cashflow + renderHhCashflow)');
  ok(/id=["']hh-view["']/.test(html), 'Household document mount (#hh-view) is missing');
  ok(/data-page=["']household["']/.test(html), 'Household container must carry data-page="household"');

  // exactly one renderer each, no reassignment
  ['renderHhDemographics', 'renderHhNetWorth', 'renderHhCashflow'].forEach(fn => {
    const defs = (html.match(new RegExp('function\\s+' + fn + '\\b', 'g')) || []).length;
    ok(defs === 1, 'Expected exactly one ' + fn + ' implementation; found ' + defs);
    ok(!new RegExp(fn + '\\s*=\\s*function').test(html), fn + ' function reassignment detected');
  });

  // EDITABLE console: inline data-path inputs + a #hh-view delegate that writes
  // back to `plan` and reseeds/dirties scenarios (parity with the rest of the
  // input layer). This is the non-negotiable — Household must not be static.
  ok(/function hhField\b/.test(html), 'Household inputs helper missing (hhField → renderField data-path controls)');
  ok(/\$\(\s*['"]#hh-view['"]\s*\)\.addEventListener\(\s*['"]change['"]/.test(html), 'Household edit delegate missing (#hh-view change handler)');
  ok(/function hhCommit\b/.test(html), 'Household commit (hhCommit) missing');
  ok(/function\s+hhCommit\b[\s\S]{0,160}reseedScenarios\(\)[\s\S]{0,80}plansDirty\s*=\s*true/.test(html), 'Household edits must reseed + dirty scenarios exactly like the input layer (hhCommit)');
  ok(/function syncHousehold\b/.test(html), 'syncHousehold() renderer missing');

  // no baked sample household
  ok(!/Whitmore/i.test(html), 'Sample household data (Whitmore) must not ship in production');

  // stylesheet hygiene
  const cssLinks = (html.match(/<link[^>]+styles\/household\.css[^>]*>/g) || []).length;
  ok(cssLinks === 1, 'styles/household.css must be linked exactly once; found ' + cssLinks);
  ok(!existsSync(join(ROOT, 'styles', 'household-production.css')), 'styles/household-production.css must not exist');
  ok(!existsSync(join(ROOT, 'styles', 'tokens.css')), 'A separate styles/tokens.css must not exist');

  // every Household selector in household.css must be scoped to the page key
  if(css){
    const offenders = css.split('}')
      .map(b => b.split('{')[0].trim())
      .filter(sel => /(^|[\s,])(\.hh-)/.test(sel))
      .filter(sel => !/\.page\[data-page="household"\]/.test(sel));
    ok(offenders.length === 0, 'Unscoped Household selectors in household.css: ' + offenders.slice(0, 5).join(' | '));
  }
  // no competing Household layer left behind in main.css
  if(main){
    const leftover = /(^|[\s,{])\.(hh-frame|hh-rail|hh-pillar|hh-fulcrum|hh-fact|hh-acct|hh-flow|hh-chapter)\b/.test(main);
    ok(!leftover, 'A competing Household rule still lives in styles/main.css');
  }

  // ── CP2 additions: reset/clear helpers, new action buttons, new input fields ──
  ok(/function hhResetToDemo\b/.test(html),    'hhResetToDemo helper missing from index.html');
  ok(/function hhClearHousehold\b/.test(html), 'hhClearHousehold helper missing from index.html');
  ok(/data-hh-action=.add-spouse/.test(html),    'add-spouse action button missing');
  ok(/data-hh-action=.remove-spouse/.test(html), 'remove-spouse action button missing');
  ok(/data-hh-action=.add-pension-age/.test(html),'add-pension-age action button missing');
  ok(/id=.hh-act-demo/.test(html),  'Demo rail button (hh-act-demo) missing');
  ok(/id=.hh-act-clear/.test(html), 'Clear rail button (hh-act-clear) missing');
  ok(/meta\.filingStatus/.test(html), 'Filing status field (meta.filingStatus) missing from Household');
  ok(/portfolio\.accounts\.taxable\.basisPct/.test(html), 'Taxable cost basis (basisPct) field missing from Household');
  ok(/income\.pension\.colaPct/.test(html), 'Pension COLA % field (income.pension.colaPct) missing from Household');
  // colaPct must use pctPoints (stores raw whole-number %); the engine itself divides by 100
  ok(/colaPct.*pctPoints|pctPoints.*colaPct/.test(html), 'pension colaPct must use data-type="pctPoints" not data-type="pct" (engine divides by 100 itself)');

  // no stale ui/household.js import or ensureHouseholdNetWorthView helper
  ok(!/import.*ui\/household/.test(html), 'stale ui/household.js import in index.html');
  ok(!/ensureHouseholdNetWorthView/.test(html), 'stale ensureHouseholdNetWorthView in index.html');

  // main.css: retired .hh-bar / .hh-f selectors must be gone (comments excluded)
  if(main){
    const mainCode = main.replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/(^|[\s,{])\.hh-bar\b/.test(mainCode), 'stale .hh-bar selector still in main.css');
    // .hh-f word-boundary check: avoid false-positive on .hh-frame / .hh-fulcrum
    ok(!/(^|[\s,{])\.hh-f[\s{,:]/.test(mainCode), 'stale .hh-f selector still in main.css');
  }

  // household.css: no !important (glass quality requires specificity layering, not !important brute-force)
  if(css){
    const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!cssCode.includes('!important'), 'household.css must not use !important');
  }

  if(fails.length){
    console.error('FAIL household contract:');
    fails.forEach(f => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('  OK household contract (editable console: 3 chapters, data-path write-back, reseed-on-edit, scoped CSS)');
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

/* The old ensureHouseholdNetWorthView() helper was removed with the retired
   Balance-Sheet / Map editor. Household is now the EDITABLE plan-input console
   (syncHousehold / renderHhDemographics / renderHhNetWorth / renderHhCashflow),
   rendered inline; ui/household.js no longer exists. */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('full test suite (npm test)');
const test = spawnSync(process.execPath, ['--test', 'engine.test.js', 'src/tax/federal/rules/ordinaryIncomeTax.test.js', 'src/tax/federal/rules/standardDeduction.test.js', 'src/tax/federal/rules/traditionalIraDeductibility.test.js', 'src/tax/federal/rules/capitalGainsStacking.test.js', 'src/tax/federal/rules/taxableSocialSecurity.test.js', 'src/tax/federal/composers/form1040Spine.test.js', 'src/tax/tests/integration.test.js', 'src/tax/tests/golden1040.test.js', 'src/tax/tests/intakeCompleteness.test.js', 'src/tax/tests/annual1040Fixtures.test.js', 'src/tax/tests/law2025.test.js', 'src/tax/tests/engineYearTo1040Input.test.js', 'src/tax/tests/demoWagesRegression.test.js', 'src/tax/tests/marginalRateSummary.test.js', 'src/planning/tax/runTaxForScenarioPath.test.js', 'src/planning/tax/attachTypicalPathFederalTax.test.js'], { cwd: ROOT, stdio: 'inherit' });
if(test.status !== 0){ console.error('npm test failed'); process.exit(1); }

console.log('household contract (static)');
verifyHousehold();

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

  await step('household console: three editable Folio chapters render from plan', async () => {
    // Household is the EDITABLE plan-input console: syncHousehold() renders the
    // Demographics / Net Worth / Cash Flow chapters into #hh-view from `plan`, with
    // every value an inline renderField() input. Here we assert the chapters render
    // AND expose editable data-path controls; the two steps below prove edits write
    // to `plan` and reach the engine.
    await page.click('.htab[data-page="household"]');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('.hdr-tabs .htab')].map(b => b.textContent.trim()),
      hasSubnav: !!document.querySelector('#np-subnav'),
      frame: !!document.querySelector('.page[data-page="household"] .hh-frame'),
      chapters: [...document.querySelectorAll('.hh-chapter .hh-chapter__label')].map(e => e.textContent.trim()),
      railName: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      people: document.querySelectorAll('#hh-view .hh-person').length,
      nameInputs: document.querySelectorAll('#hh-view input[data-path="meta.primaryName"], #hh-view input[data-path="meta.spouseName"]').length,
      ageInputs: document.querySelectorAll('#hh-view input[data-path$=".currentAge"], #hh-view input[data-path$=".retirementAge"]').length,
    }));
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Sequencing'];
    if(JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) throw new Error(`main nav mismatch: ${JSON.stringify(m.nav)}`);
    if(m.hasSubnav) throw new Error('old net-worth subnav is still rendered');
    if(!m.frame) throw new Error('household Folio app-frame (.hh-frame) missing');
    if(JSON.stringify(m.chapters) !== JSON.stringify(['Demographics','Net Worth','Cash Flow'])) throw new Error(`chapter rail mismatch: ${JSON.stringify(m.chapters)}`);
    if(!m.railName) throw new Error('rail household name not filled from plan');
    if(m.people < 2) throw new Error(`Demographics expected 2 person columns, got ${m.people}`);
    if(m.nameInputs < 2) throw new Error(`Demographics names must be editable inputs, got ${m.nameInputs}`);
    if(m.ageInputs < 3) throw new Error(`Demographics ages/retirement must be editable inputs, got ${m.ageInputs}`);

    // Net Worth (Equilibrium): two pillars + fulcrum + ownership; accounts have
    // editable balances + owner selects; the household-holdings editor is present.
    await page.click('#hh-chap-networth');
    await new Promise(r => setTimeout(r, 400));
    const nw = await page.evaluate(() => ({
      pillars: document.querySelectorAll('#hh-view .hh-pillar').length,
      fulcrum: !!document.querySelector('#hh-view .hh-fulcrum'),
      total: document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim() || '',
      own: !!document.querySelector('#hh-view .hh-own__bar'),
      acctInputs: document.querySelectorAll('#hh-view .hh-acct input[data-type="money"]').length,
      ownerSelects: document.querySelectorAll('#hh-view select[data-type="owner"]').length,
      holdings: !!document.querySelector('#hh-view .hh-holdings'),
      assume: document.querySelectorAll('#hh-view .hh-assume select, #hh-view .hh-assume input').length,
    }));
    if(nw.pillars !== 2) throw new Error(`Net Worth expected 2 pillars, got ${nw.pillars}`);
    if(!nw.fulcrum) throw new Error('Net Worth fulcrum missing');
    if(!/\$[\d,]/.test(nw.total)) throw new Error(`Net Worth total not formatted from plan: "${nw.total}"`);
    if(!nw.own) throw new Error('ownership bar missing');
    if(nw.acctInputs < 3) throw new Error(`account balances must be editable, got ${nw.acctInputs}`);
    if(nw.ownerSelects < 3) throw new Error(`account owner selects missing, got ${nw.ownerSelects}`);
    if(!nw.holdings) throw new Error('household holdings editor (joint/real/liabilities/assumptions) missing');
    if(nw.assume < 3) throw new Error(`assumptions (allocation/withdrawal/paths) not editable, got ${nw.assume}`);

    // Cash Flow: editable income + expense fields + a net-surplus headline.
    await page.click('#hh-chap-cashflow');
    await new Promise(r => setTimeout(r, 400));
    const cf = await page.evaluate(() => ({
      moneyInputs: document.querySelectorAll('#hh-view input[data-type="money"]').length,
      surplus: document.querySelector('#hh-view .hh-surplus__value')?.textContent.trim() || '',
      totals: document.querySelectorAll('#hh-view .hh-total__value').length,
    }));
    if(cf.moneyInputs < 5) throw new Error(`Cash Flow income/expenses must be editable, got ${cf.moneyInputs}`);
    if(!/\$[\d,]/.test(cf.surplus)) throw new Error(`net surplus not formatted: "${cf.surplus}"`);
    if(cf.totals < 2) throw new Error('Cash Flow totals missing');

    // Back to Demographics for the canonical Household screenshot.
    await page.click('#hh-chap-demographics');
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: join(OUT, '01-household.png'), fullPage: true });
  });

  await step('household inline edits write back to plan + derived totals update', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-chap-networth'); await sleep(300);
    const totalBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim());
    // Edit the client Traditional balance 1,600,000 → 1,700,000.
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="portfolio.accounts.traditional.balance"]'); el.value = '1,700,000'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const after = await page.evaluate(() => ({ total: document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim(), status: document.querySelector('#status')?.textContent }));
    if(after.total === totalBefore) throw new Error(`editing an account balance did not update the derived net-worth total (${totalBefore})`);
    if(!/Plan edited/.test(after.status||'')) throw new Error('account edit did not mark the plan dirty (status)');
    // Change the Roth owner spouse → client; the ownership split must shift.
    const ownBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-own__legend')?.textContent.replace(/\s+/g,' ').trim());
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.accounts.roth.owner"]'); el.value = 'client'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const ownAfter = await page.evaluate(() => document.querySelector('#hh-view .hh-own__legend')?.textContent.replace(/\s+/g,' ').trim());
    if(ownBefore === ownAfter) throw new Error(`changing an account owner did not shift the ownership split (${ownBefore})`);
    // Restore the demo (balance + owner).
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="portfolio.accounts.traditional.balance"]'); el.value = '1,600,000'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.accounts.roth.owner"]'); el.value = 'spouse'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
  });

  await step('household CP2 fields: filing status + cost basis + spouse toggle + extra screenshots', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const goHh = async (chapId) => {
      await page.click('.htab[data-page="household"]'); await sleep(300);
      await page.click('#'+chapId); await sleep(350);
    };

    // 1. Filing status select writes to plan.meta.filingStatus
    await goHh('hh-chap-demographics');
    const fsEl = await page.$('#hh-view select[data-path="meta.filingStatus"]');
    if(!fsEl) throw new Error('filing status <select> missing from Demographics chapter');
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="meta.filingStatus"]');
      el.value = 'single'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    const filingLine = await page.evaluate(() => document.querySelector('#hh-rail-filing')?.textContent.trim() || '');
    if(!/single/i.test(filingLine)) throw new Error(`rail filing line did not update after filingStatus change: "${filingLine}"`);
    // Restore married
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="meta.filingStatus"]');
      el.value = 'marriedFilingJointly'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);

    // 2. Taxable cost basis % writes to plan (basisPct = 0.9 → input shows 90)
    await goHh('hh-chap-networth');
    const basisEl = await page.$('#hh-view input[data-path="portfolio.accounts.taxable.basisPct"]');
    if(!basisEl) throw new Error('taxable basisPct input missing from Net Worth assumptions');
    const basisBefore = await basisEl.evaluate(el => el.value);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="portfolio.accounts.taxable.basisPct"]');
      el.value = '90'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(250);
    const basisAfter = await basisEl.evaluate(el => el.value);
    if(basisAfter === basisBefore) throw new Error(`basisPct input did not reflect written value (before=${basisBefore}, after=${basisAfter})`);
    // The input now shows 90; the plan now has basisPct=0.9 (confirmed by hhCommit writing via setPath)
    if(!/Plan edited/.test(await page.evaluate(() => document.querySelector('#status')?.textContent || '')))
      throw new Error('basisPct edit did not mark plan dirty');
    // Restore to original (55%)
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="portfolio.accounts.taxable.basisPct"]');
      el.value = '55'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);
    await page.screenshot({ path: join(OUT, '01b-household-networth.png'), fullPage: true });

    // 3. Cash Flow: pension COLA field present + add-pension-age button + liability add button
    await goHh('hh-chap-cashflow');
    const colaEl = await page.$('#hh-view input[data-path="income.pension.colaPct"]');
    if(!colaEl) throw new Error('pension COLA % input missing from Cash Flow chapter');
    const addPensionBtn = await page.$('[data-hh-action="add-pension-age"]');
    if(!addPensionBtn) throw new Error('add-pension-age button missing from Cash Flow');
    const addLiabBtn = await page.$('#hh-view [data-add="liability"]');
    if(!addLiabBtn) throw new Error('"+ Liability" button missing from Cash Flow chapter');
    await page.screenshot({ path: join(OUT, '01c-household-cashflow.png'), fullPage: true });

    // 4. Spouse remove → 'Add spouse' placeholder appears; re-add → spouse column restores
    await goHh('hh-chap-demographics');
    const removeBtnBefore = await page.$('[data-hh-action="remove-spouse"]');
    if(!removeBtnBefore) throw new Error('remove-spouse button missing from spouse column');
    await page.evaluate(() => {
      // Bypass the confirm() dialog by temporarily replacing it
      const orig = window.confirm;
      window.confirm = () => true;
      document.querySelector('[data-hh-action="remove-spouse"]').click();
      window.confirm = orig;
    });
    await sleep(350);
    const addSpouseVisible = await page.$('[data-hh-action="add-spouse"]');
    if(!addSpouseVisible) throw new Error('after removing spouse, "Add spouse" button did not appear');
    const railAfterRemove = await page.evaluate(() => document.querySelector('#hh-rail-name')?.textContent.trim() || '');
    if(/&/.test(railAfterRemove)) throw new Error(`rail name still shows "&" after spouse removal: "${railAfterRemove}"`);
    // Re-add spouse
    await page.click('[data-hh-action="add-spouse"]');
    await sleep(350);
    const addSpouseGone = await page.$('[data-hh-action="add-spouse"]');
    if(addSpouseGone) throw new Error('"Add spouse" button should disappear after adding spouse');
    const spouseInputs = await page.evaluate(() => document.querySelectorAll('#hh-view input[data-path^="household.spouse"]').length);
    if(spouseInputs < 2) throw new Error(`spouse column after add should have age/retirement inputs, got ${spouseInputs}`);
    // Restore retirement age to demo value
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="household.spouse.retirementAge"]');
      if(el){ el.value = '64'; el.dispatchEvent(new Event('change', { bubbles:true })); }
    });
    await sleep(200);
  });

  await step('household Demo/Clear rail buttons restore and blank the plan', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(300);

    // Override confirm so buttons fire without an interactive dialog
    await page.evaluate(() => { window.__origConfirm = window.confirm; window.confirm = () => true; });

    // Clear → plan blanked
    await page.click('#hh-act-clear'); await sleep(500);
    const afterClear = await page.evaluate(() => ({
      name: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      filing: document.querySelector('#hh-rail-filing')?.textContent.trim() || '',
      status: document.querySelector('#status')?.textContent || '',
    }));
    // After clear, primaryName is '', so rail shows '' not 'Client & Spouse'
    if(/Client/.test(afterClear.name) && /Spouse/.test(afterClear.name))
      throw new Error(`Clear did not blank household (rail still shows: "${afterClear.name}")`);

    // Demo → plan restored
    await page.click('#hh-act-demo'); await sleep(500);
    const afterDemo = await page.evaluate(() => ({
      name: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      status: document.querySelector('#status')?.textContent || '',
    }));
    if(!afterDemo.name.includes('Client')) throw new Error(`Demo did not restore household (got: "${afterDemo.name}")`);

    // Restore confirm
    await page.evaluate(() => { window.confirm = window.__origConfirm; });
  });

  await step('household edits reach the engine: Scenarios cash-flow responds after Run', async () => {
    // The non-negotiable: editing a Household input through the new inline UI must
    // write real plan data and change engine outputs. Edit on Household → open
    // Scenarios (re-runs the engine on the dirty plan) → assert the Cash Flow rows
    // changed. (Income is the 3rd cell of a .cf-row: [year, Age, Income, …].)
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const goHh = async (chapId) => { await page.click('.htab[data-page="household"]'); await sleep(300); await page.click('#'+chapId); await sleep(300); };
    const setHh = (path, value) => page.evaluate(({p,v}) => {
      const el = document.querySelector(`#hh-view input[data-path="${p}"]`);
      if(!el) throw new Error('missing household input: '+p);
      el.value = v; el.dispatchEvent(new Event('change', { bubbles:true }));
    }, { p:path, v:value });
    const openCashFlow = async () => { await page.click('button[data-page="scenarios"]'); await sleep(900); await setCashFlow(page, true); await waitCashRows(page, 4); };
    const incomeAtAge = (age) => page.evaluate(a => {
      const row = [...document.querySelectorAll('#scn-view .cf-row')].find(r => r.querySelector('.cf-cell--age')?.textContent.trim() === String(a));
      return row ? (row.children[2]?.textContent.trim() || '') : '';
    }, age);
    const firstAge = () => page.evaluate(() => { const a = [...document.querySelectorAll('#scn-view .cf-row .cf-cell--age')].map(e => parseInt(e.textContent.trim(),10)).filter(Number.isFinite); return a.length ? Math.min(...a) : null; });

    // (1) Spouse SS on vs off changes baseline income at age 72 (past both claims).
    await goHh('hh-chap-cashflow'); await setHh('income.socialSecurity.spouse.pia', '30,000');
    await openCashFlow(); const withSpouse = await incomeAtAge(72);
    await goHh('hh-chap-cashflow'); await setHh('income.socialSecurity.spouse.pia', '0');
    await openCashFlow(); const withoutSpouse = await incomeAtAge(72);
    if(!withSpouse || !withoutSpouse) throw new Error(`cash-flow income cell missing at age 72 (${withSpouse} vs ${withoutSpouse})`);
    if(withSpouse === withoutSpouse) throw new Error(`spouse SS edit via Household did not change engine income at 72 (${withSpouse} vs ${withoutSpouse})`);

    // (2) Delaying the spouse's retirement pushes the first retirement-phase row later.
    await goHh('hh-chap-cashflow'); await setHh('income.socialSecurity.spouse.pia', '30,000');
    await goHh('hh-chap-demographics'); await setHh('household.spouse.retirementAge', '64');
    await openCashFlow(); const firstEarly = await firstAge();
    await goHh('hh-chap-demographics'); await setHh('household.spouse.retirementAge', '67');
    await openCashFlow(); const firstLate = await firstAge();
    if(firstEarly == null || firstLate == null) throw new Error(`first cash-flow age missing (${firstEarly} vs ${firstLate})`);
    if(!(firstLate > firstEarly)) throw new Error(`delaying spouse retirement via Household did not push retirement later (${firstEarly} -> ${firstLate})`);

    // Restore the demo household and leave Cash Flow closed.
    await goHh('hh-chap-demographics'); await setHh('household.spouse.retirementAge', '64');
    await setCashFlow(page, false);
  });

  await step('household living expense increase lowers Scenarios success rate', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Get baseline success rate for Baseline scenario before changing anything
    await page.click('button[data-page="scenarios"]'); await sleep(900);
    await page.click('#scn-seg-compare'); await sleep(400);
    const baseSuccess = await page.evaluate(() => {
      const probs = [...document.querySelectorAll('#scn-view .scol__prob')];
      const base = probs.find(el => el.closest('.scol')?.querySelector('.tag-ref'));
      return base ? parseFloat(base.textContent) : null;
    });
    if(baseSuccess == null) throw new Error('Could not read baseline success rate for living-expense test');

    // Double living expenses: from demo ~$205k to $420k — plan should suffer
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-chap-cashflow'); await sleep(350);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      if(!el) throw new Error('expenses.living input missing');
      el.value = '420,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);

    // Navigate to Scenarios (triggers auto-run of the dirty plan)
    await page.click('button[data-page="scenarios"]'); await sleep(1800);
    await page.click('#scn-seg-compare'); await sleep(400);
    const highExpSuccess = await page.evaluate(() => {
      const probs = [...document.querySelectorAll('#scn-view .scol__prob')];
      const base = probs.find(el => el.closest('.scol')?.querySelector('.tag-ref'));
      return base ? parseFloat(base.textContent) : null;
    });
    if(highExpSuccess == null) throw new Error('Could not read success rate after expense increase');
    if(highExpSuccess >= baseSuccess) throw new Error(
      `High living expenses did not lower success rate: base=${baseSuccess}%, high-exp=${highExpSuccess}%`);

    // Restore expenses to demo value
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-chap-cashflow'); await sleep(350);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      el.value = '205,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);
  });

  await step('household pension COLA change updates Scenarios cash-flow income at late ages', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Read income at a late age with COLA = 0 (demo default)
    await page.click('button[data-page="scenarios"]'); await sleep(900);
    await setCashFlow(page, true); await waitCashRows(page, 10);
    const incomeAtAge = async (age) => page.evaluate(a => {
      const row = [...document.querySelectorAll('#scn-view .cf-row')]
        .find(r => r.querySelector('.cf-cell--age')?.textContent.trim() === String(a));
      return row ? parseFloat((row.children[2]?.textContent || '').replace(/[$,]/g,'')) : null;
    }, age);
    const income80base = await incomeAtAge(80);
    if(income80base == null) throw new Error('income cell at age 80 not found in cash-flow view');
    await setCashFlow(page, false);

    // Set pension COLA to 5% (nominal): pension grows in real terms → higher income at 80
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-chap-cashflow'); await sleep(350);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="income.pension.colaPct"]');
      if(!el) throw new Error('pension colaPct input missing');
      el.value = '5'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);

    await page.click('button[data-page="scenarios"]'); await sleep(2000);
    await setCashFlow(page, true); await waitCashRows(page, 10);
    const income80cola = await incomeAtAge(80);
    if(income80cola == null) throw new Error('income cell at age 80 not found after COLA change');
    if(income80cola <= income80base) throw new Error(
      `pension COLA=5% did not increase income at 80 (base=${income80base}, cola=${income80cola})`);
    await setCashFlow(page, false);

    // Restore COLA to 0
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-chap-cashflow'); await sleep(350);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="income.pension.colaPct"]');
      el.value = '0'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);
  });

  await step('goals renders Horizon view (title, timeline, rows, editor)', async () => {
    // Contract updated for the shipped Goals Horizon view: the Goals tab now renders
    // renderGoalsHorizon() -> #gl-horizon, which replaced the old tributary thread
    // (#goal-thread / .gt-spine). The retired renderGoalsPage()/goalsThreadSVG() are
    // preserved in index.html as dead code; this asserts the CURRENT Horizon DOM.
    await page.click('.htab[data-sub-target="goals"]');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const hz = document.querySelector('#gl-horizon');
      const host = document.querySelector('#np-content') || hz;
      const hostText = (host?.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        horizon: !!hz,
        title: /Lifestyle Spending & Goals/.test(hostText),
        svgs: document.querySelectorAll('#gl-horizon svg').length,
        rows: document.querySelectorAll('.gl-row').length,
        addControls: document.querySelectorAll('[data-add="goalRec"], [data-add="goalOnce"], .gl-add, .hp-add').length,
        editChips: document.querySelectorAll('.ga-chip').length,
        keeps: document.querySelectorAll('.gl-keep').length,
        textLen: hostText.length,
      };
    });
    if(!m.horizon) throw new Error('Goals Horizon (#gl-horizon) did not render');
    if(!m.title) throw new Error('Goals title "Lifestyle Spending & Goals" missing from rendered view');
    if(m.svgs < 1) throw new Error(`Goals timeline SVG missing (svgs=${m.svgs})`);
    if(m.rows < 1) throw new Error(`expected >=1 goal row, got ${m.rows}`);
    if(m.textLen < 40) throw new Error(`Goals page appears blank (textLen=${m.textLen})`);
    // recurring / one-time / add / edit controls — assert the editor surfaced at least one.
    if((m.addControls + m.editChips + m.keeps) < 1) throw new Error('recurring/one-time/add/edit goal controls did not render');
    await page.screenshot({ path: join(OUT, '02-goals.png'), fullPage: true });
  });

  await step('goals Horizon: add, delete, what-if drop, and select workflows', async () => {
    // Contract updated for the Goals Horizon view. Add/delete drive both the edit
    // rows (.gl-row) and the timeline (recurring -> .glh-band, one-time -> .glh-diamond);
    // the what-if toggle (.gl-keep) flips the edit row to .gl-row.dropped; selecting a
    // timeline lane (.glh-lane) highlights the lane (.glh-lane--sel) and its edit row
    // (.gl-row.sel). Replaces the retired tributary (#goal-thread / .gt-* ) assertions.
    await page.click('.htab[data-sub-target="goals"]');
    await new Promise(r => setTimeout(r, 350));
    const snap = () => page.evaluate(() => ({
      rows: document.querySelectorAll('.gl-row').length,
      lanes: document.querySelectorAll('.glh-lane').length,
      bands: document.querySelectorAll('.glh-band').length,
      diamonds: document.querySelectorAll('.glh-diamond').length,
      dropped: document.querySelectorAll('.gl-row.dropped').length,
      selLanes: document.querySelectorAll('.glh-lane--sel').length,
      selRows: document.querySelectorAll('.gl-row.sel').length,
      horizon: !!document.querySelector('#gl-horizon'),
      textLen: (document.querySelector('#gl-horizon')?.textContent || '').replace(/\s+/g, ' ').trim().length,
    }));

    const base = await snap();
    if(!base.horizon) throw new Error('Goals Horizon (#gl-horizon) did not render');
    if(base.rows < 1) throw new Error(`expected seed goal rows, got ${base.rows}`);

    // 1) add recurring → a new edit row + a recurring band in the timeline
    await page.click('[data-add="goalRec"]');
    await new Promise(r => setTimeout(r, 300));
    const addRec = await snap();
    if(addRec.rows !== base.rows + 1) throw new Error(`add recurring did not append a row (${base.rows} -> ${addRec.rows})`);
    if(addRec.bands < base.bands + 1) throw new Error(`add recurring did not add a timeline band (${base.bands} -> ${addRec.bands})`);

    // 2) delete → row + band removed
    await page.click('.gl-row:last-child .row-x');
    await new Promise(r => setTimeout(r, 300));
    let cur = await snap();
    if(cur.rows !== base.rows) throw new Error(`delete after add-recurring did not restore rows (got ${cur.rows}, want ${base.rows})`);
    if(cur.bands !== base.bands) throw new Error(`delete did not remove the timeline band (${cur.bands} vs ${base.bands})`);

    // 3) add one-time → a new edit row + a one-time diamond marker
    await page.click('[data-add="goalOnce"]');
    await new Promise(r => setTimeout(r, 300));
    const addOnce = await snap();
    if(addOnce.rows !== base.rows + 1) throw new Error(`add one-time did not append a row (${base.rows} -> ${addOnce.rows})`);
    if(addOnce.diamonds < base.diamonds + 1) throw new Error(`add one-time did not add a timeline diamond (${base.diamonds} -> ${addOnce.diamonds})`);

    // 4) delete → row + marker removed
    await page.click('.gl-row:last-child .row-x');
    await new Promise(r => setTimeout(r, 300));
    cur = await snap();
    if(cur.rows !== base.rows) throw new Error(`delete after add-one-time did not restore rows (got ${cur.rows}, want ${base.rows})`);
    if(cur.diamonds !== base.diamonds) throw new Error(`delete did not remove the timeline diamond (${cur.diamonds} vs ${base.diamonds})`);

    // 5) what-if drop toggle → edit row state flips to dropped, then restores
    await page.click('.gl-row .gl-keep');
    await new Promise(r => setTimeout(r, 300));
    const drop = await snap();
    if(drop.dropped !== 1) throw new Error(`what-if drop did not mark a row dropped (dropped=${drop.dropped})`);
    await page.click('.gl-row.dropped .gl-keep');
    await new Promise(r => setTimeout(r, 300));
    cur = await snap();
    if(cur.dropped !== 0) throw new Error(`what-if drop did not restore (dropped=${cur.dropped})`);

    // 6) select via timeline lane → lane + its edit row highlight (if the DOM supports lanes)
    if(cur.lanes > 0){
      await page.click('.glh-lane');
      await new Promise(r => setTimeout(r, 250));
      const sel = await snap();
      if(sel.selLanes < 1 && sel.selRows < 1) throw new Error(`lane select did not highlight a lane or row (${JSON.stringify({ selLanes: sel.selLanes, selRows: sel.selRows })})`);
      await page.click('.glh-lane'); // toggle selection back off
      await new Promise(r => setTimeout(r, 150));
    }

    // Goals page must remain rendered (not blank) after all interactions.
    const end = await snap();
    if(!end.horizon || end.rows < 1 || end.textLen < 40) throw new Error(`Goals page blank/broken after workflows (${JSON.stringify(end)})`);
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
    // Compare lever steppers now live in a .cmp-overlay wrapper (the stale selector
    // expected an intermediate .cmp-step). They still carry data-scn-id / data-lever-key
    // / data-dir and request a manual Run on click (live-verified: 36 steppers; click
    // sets #status "Adjusted · Run to update" and increments the value on re-render).
    const cmpSteppers = await page.evaluate(() => document.querySelectorAll('#scn-view .compare .stepper-btn[data-scn-id]').length);
    if(cmpSteppers < 6) throw new Error(`Compare editable steppers missing (found ${cmpSteppers})`);
    await page.evaluate(() => document.querySelector('#scn-view .compare .stepper-btn[data-dir="1"][data-scn-id]')?.click());
    await new Promise(r => setTimeout(r, 250));
    const cmpStatus = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
    if(!/Run to update/i.test(cmpStatus)) throw new Error(`Compare stepper did not request a manual Run: "${cmpStatus}"`);
    await page.evaluate(() => document.querySelector('#scn-view .compare .stepper-btn[data-dir="-1"][data-scn-id]')?.click());
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

  // Objective theme contract: the page BACKGROUND (not just foreground tokens) must be
  // the shared charcoal/champagne --page-bg on Scenarios, Goals, Sequencing, AND the
  // Household console — the whole app now reads as one charcoal surface (floor #0b0d11)
  // with a champagne accent. The retired Household warm bronze AND the old navy
  // (#111E31 = 17,30,49) must BOTH be gone everywhere. Computed-style assertions so a
  // navy/bronze regression fails loudly instead of relying on a human reading a screenshot.
  await step('visual contract: header is charcoal glass and tabs are correct', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('button[data-page="scenarios"]'); await sleep(400);
    const hdrBg = await page.evaluate(() => getComputedStyle(document.querySelector('.hdr')).backgroundImage);
    const WARM_BROWN = '28, 19, 11';  // rgba(28,19,11,...) old warm header colour
    const WARM_HDR   = '28, 17, 10';  // another warm header variant
    const NAVY       = '17, 30, 49';  // #111E31 — the retired navy glass base, must be gone
    const CHARCOAL   = '11, 13, 17';  // #0b0d11 — charcoal glass base (header gradient floor)
    const CHAMPAGNE  = '198, 166, 98';// #c6a662 — champagne accent note (top-right of header)
    if(hdrBg.includes(WARM_BROWN) || hdrBg.includes(WARM_HDR))
      throw new Error(`Header still uses warm-brown background: ${hdrBg}`);
    if(hdrBg.includes(NAVY))
      throw new Error(`Header still uses retired navy glass (${NAVY}) in backgroundImage: ${hdrBg}`);
    if(!hdrBg.includes(CHARCOAL))
      throw new Error(`Header is not on the charcoal base (${CHARCOAL}) in backgroundImage: ${hdrBg}`);
    if(!hdrBg.includes(CHAMPAGNE))
      throw new Error(`Header is missing the champagne accent note (${CHAMPAGNE}) in backgroundImage: ${hdrBg}`);
    // Run button should be champagne, not warm-brown or navy.
    const runBg = await page.evaluate(() => getComputedStyle(document.querySelector('.run-btn')).backgroundImage);
    if(!runBg || !runBg.includes(CHAMPAGNE)) throw new Error(`Run button is not champagne (${CHAMPAGNE}): ${runBg}`);
    // Active tab should use the champagne underline accent.
    const activeTab = await page.evaluate(() => {
      const el = document.querySelector('.htab.on');
      if(!el) return null;
      return { border: getComputedStyle(el).borderBottomColor };
    });
    if(!activeTab) throw new Error('No active tab found');
    // Champagne is rgb(198, 166, 98) — warm, not pure white and not navy (blue channel low).
    const [r,g,b] = (activeTab.border.match(/\d+/g)||[]).map(Number);
    if(!(r > 180 && g > 130 && b < 140)) throw new Error(`Active tab border-bottom-color is not champagne: ${activeTab.border}`);
  });
  await step('theme: Goals + Sequencing + Household all sit on the shared charcoal background', async () => {
    const CHARCOAL = '11, 13, 17';  // #0b0d11 — shared --page-bg gradient floor (scenarios + household)
    const NAVY = '17, 30, 49';      // #111E31 — retired Scenarios navy base, must be gone
    const BRONZE = '154, 102, 56';  // the retired Household warm background — must be gone
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const bgOf = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).backgroundImage : '(no element)';
    }, sel);

    await page.click('button[data-page="scenarios"]'); await sleep(500);
    const scnBg = await bgOf('.page[data-page="scenarios"]');
    if(!scnBg.includes(CHARCOAL)) throw new Error(`Scenarios page lost its charcoal --page-bg: ${scnBg}`);
    if(scnBg.includes(NAVY)) throw new Error(`Scenarios page still shows retired navy: ${scnBg}`);

    await page.click('.htab[data-sub-target="goals"]'); await sleep(600);
    // Goals mounts the Horizon view (#gl-horizon) now, not the retired .gl-wrap tributary.
    if(!await page.evaluate(() => !!document.querySelector('#np-content .gl-horizon'))) throw new Error('Goals view did not mount .gl-horizon');
    const goalsBg = await bgOf('.page[data-page="net-worth"]');

    await page.click('button[data-page="sequencing"]'); await sleep(450);
    const seqBg = await bgOf('.page[data-page="sequencing"]');

    await page.click('.htab[data-page="household"]'); await sleep(500);
    const hhBg = await bgOf('.page[data-page="household"]');

    for(const [name, bg] of [['goals', goalsBg], ['sequencing', seqBg], ['household', hhBg]]){
      if(!bg.includes(CHARCOAL)) throw new Error(`${name} page is NOT on the shared charcoal background: ${bg}`);
      if(bg.includes(NAVY)) throw new Error(`${name} page still shows the retired navy background: ${bg}`);
      if(bg.includes(BRONZE)) throw new Error(`${name} page still shows the retired Household bronze background: ${bg}`);
    }
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
