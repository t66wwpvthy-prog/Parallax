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

  // Household Basics banner + two chapters: rail seam + renderer (inline in index.html).
  // The retired Demographics chapter must be GONE (its data lives in the banner).
  ok(!/hh-chap-demographics/.test(html) && !/function renderHhDemographics\b/.test(html), 'retired Demographics chapter still present (hh-chap-demographics / renderHhDemographics)');
  ok(/function renderHhBanner\b/.test(html), 'Household Basics banner renderer (renderHhBanner) missing');
  ok(/hh-chap-networth/.test(html)     && /function renderHhNetWorth\b/.test(html),      'Net Worth chapter missing (hh-chap-networth + renderHhNetWorth)');
  ok(/hh-chap-cashflow/.test(html)     && /function renderHhCashflow\b/.test(html),      'Cash Flow chapter missing (hh-chap-cashflow + renderHhCashflow)');
  ok(/id=["']hh-view["']/.test(html), 'Household document mount (#hh-view) is missing');
  ok(/data-page=["']household["']/.test(html), 'Household container must carry data-page="household"');
  // Account Type Bank present with the required types (529 intentionally excluded for now)
  ok(/HH_ACCOUNT_TYPES/.test(html), 'Account Type Bank (HH_ACCOUNT_TYPES) missing');
  ['Checking','Savings','Money Market','CD','Brokerage (taxable)','Joint brokerage','Trust brokerage',
   'Traditional IRA','Rollover IRA','Roth IRA','401(k)','Roth 401(k)','403(b)','457','SEP IRA','SIMPLE IRA',
   'Solo 401(k)','Qualified Plan'].forEach(t => {
    ok(html.includes(`'${t}'`), `Account Type Bank missing type: ${t}`);
  });
  ok(!html.includes(`'529'`), 'retired 529 account type still present in the bank');
  ok(!/meta\.inflationPct/.test(html), 'engine-inert Inflation field must not ship in the banner');
  ok(/\['trust','Trust'\]/.test(html), 'Trust ownership option missing from HH_OWNERS');

  // exactly one renderer each, no reassignment
  ['renderHhBanner', 'renderHhNetWorth', 'renderHhCashflow'].forEach(fn => {
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
  console.log('  OK household contract (editable console: basics banner + 2 chapters, account-type bank, data-path write-back, reseed-on-edit, scoped CSS)');
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

  await step('household console: basics banner + two editable chapters render from plan', async () => {
    // Household is the EDITABLE plan-input console: syncHousehold() renders the
    // Household Basics banner + the Net Worth / Cash Flow chapters into #hh-view
    // from `plan`, with every value an inline renderField() input. The retired
    // Demographics chapter must NOT exist; its data lives in the banner.
    await page.click('.htab[data-page="household"]');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('.hdr-tabs .htab')].map(b => b.textContent.trim()),
      hasSubnav: !!document.querySelector('#np-subnav'),
      frame: !!document.querySelector('.page[data-page="household"] .hh-frame'),
      chapters: [...document.querySelectorAll('.hh-chapter .hh-chapter__label')].map(e => e.textContent.trim()),
      demographicsBtn: !!document.querySelector('#hh-chap-demographics'),
      railName: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      banner: !!document.querySelector('#hh-view .hh-banner'),
      bornInputs: document.querySelectorAll('#hh-view .hh-banner input[data-type="birthYear"]').length,
      retireInputs: document.querySelectorAll('#hh-view .hh-banner input[data-path$=".retirementAge"]').length,
      planToInputs: document.querySelectorAll('#hh-view .hh-banner input[data-path="household.primary.planEndAge"]').length,
      filing: !!document.querySelector('#hh-view .hh-banner select[data-path="meta.filingStatus"]'),
      stateSel: !!document.querySelector('#hh-view .hh-banner select[data-path="meta.state"]'),
      coClientText: /Co-Client/.test(document.querySelector('#hh-view .hh-banner')?.textContent || ''),
      spouseText: /Spouse/.test(document.querySelector('.page[data-page="household"]')?.textContent || ''),
    }));
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Sequencing'];
    if(JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) throw new Error(`main nav mismatch: ${JSON.stringify(m.nav)}`);
    if(m.hasSubnav) throw new Error('old net-worth subnav is still rendered');
    if(!m.frame) throw new Error('household Folio app-frame (.hh-frame) missing');
    if(m.demographicsBtn) throw new Error('retired Demographics chapter button still rendered');
    if(JSON.stringify(m.chapters) !== JSON.stringify(['Net Worth','Cash Flow'])) throw new Error(`chapter rail mismatch: ${JSON.stringify(m.chapters)}`);
    if(!m.railName) throw new Error('rail household name not filled from plan');
    if(!m.banner) throw new Error('Household Basics banner missing');
    if(m.bornInputs < 2) throw new Error(`banner Born inputs missing, got ${m.bornInputs}`);
    if(m.retireInputs < 2) throw new Error(`banner Retires inputs missing, got ${m.retireInputs}`);
    if(m.planToInputs < 2) throw new Error(`banner Plan To inputs missing, got ${m.planToInputs}`);
    if(!m.filing) throw new Error('banner Filing dropdown missing');
    if(!m.stateSel) throw new Error('banner State dropdown missing');
    if(!m.coClientText) throw new Error('banner does not say Co-Client');
    if(m.spouseText) throw new Error('visible Household UI still says "Spouse"');

    // Net Worth (Equilibrium): two pillars + fulcrum + ownership; TYPED accounts
    // (from the Account Type Bank) with editable balances + owner + type selects.
    await page.click('#hh-chap-networth');
    await new Promise(r => setTimeout(r, 400));
    const nw = await page.evaluate(() => ({
      banner: !!document.querySelector('#hh-view .hh-banner'),
      pillars: document.querySelectorAll('#hh-view .hh-pillar').length,
      fulcrum: !!document.querySelector('#hh-view .hh-fulcrum'),
      total: document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim() || '',
      own: !!document.querySelector('#hh-view .hh-own__bar'),
      acctInputs: document.querySelectorAll('#hh-view .hh-acct input[data-type="money"]').length,
      ownerSelects: document.querySelectorAll('#hh-view select[data-type="owner"]').length,
      typeSelects: document.querySelectorAll('#hh-view select[data-type="acctType"]').length,
      coreSleeveInputs: document.querySelectorAll('#hh-view input[data-path^="portfolio.accounts."][data-path$=".balance"]').length,
      holdings: !!document.querySelector('#hh-view .hh-holdings'),
      addAccountBtn: !!document.querySelector('#hh-view [data-hh-action="open-account-form"]'),
      assume: document.querySelectorAll('#hh-view .hh-assume select, #hh-view .hh-assume input').length,
      basis: !!document.querySelector('#hh-view .hh-basis-row input[data-path="portfolio.accounts.taxable.basisPct"]'),
      tangible: /Tangible assets/i.test(document.querySelector('#hh-view .hh-holdings')?.textContent || ''),
      mortgage: !!document.querySelector('#hh-view input[data-path="properties.0.mortgage.balance"]'),
    }));
    if(!nw.banner) throw new Error('banner missing above Net Worth');
    if(nw.pillars !== 2) throw new Error(`Net Worth expected 2 pillars, got ${nw.pillars}`);
    if(!nw.fulcrum) throw new Error('Net Worth fulcrum missing');
    if(!/\$[\d,]/.test(nw.total)) throw new Error(`Net Worth total not formatted from plan: "${nw.total}"`);
    if(!nw.own) throw new Error('ownership bar missing');
    if(nw.acctInputs < 3) throw new Error(`typed account balances must be editable, got ${nw.acctInputs}`);
    if(nw.ownerSelects < 3) throw new Error(`account owner selects missing, got ${nw.ownerSelects}`);
    if(nw.typeSelects < 3) throw new Error(`account type-bank selects missing, got ${nw.typeSelects}`);
    if(nw.coreSleeveInputs > 0) throw new Error(`static core-sleeve rows still rendered (${nw.coreSleeveInputs} inputs)`);
    if(!nw.holdings) throw new Error('household holdings editor missing');
    if(!nw.addAccountBtn) throw new Error('"+ Account" (Account Type Bank) button missing');
    if(nw.assume > 0) throw new Error('retired Assumptions block still rendered on Net Worth');
    if(!nw.basis) throw new Error('taxable cost-basis field missing from the Accounts group');
    if(!nw.tangible) throw new Error('Tangible assets section missing');
    if(!nw.mortgage) throw new Error('Mortgage liability row missing');

    // Account Type Bank flow: + Account → choose type → value → ownership → Add.
    await page.click('#hh-view [data-hh-action="open-account-form"]');
    await new Promise(r => setTimeout(r, 300));
    const formUp = await page.evaluate(() => !!document.querySelector('#hh-acct-form'));
    if(!formUp) throw new Error('account add-form did not open');
    const before = await page.evaluate(() => ({
      rows: document.querySelectorAll('#hh-view .hh-acct').length,
      total: document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim(),
    }));
    await page.evaluate(() => {
      const form = document.querySelector('#hh-acct-form');
      const typeSel = form.querySelector('.hh-form-type');
      const savingsIdx = [...typeSel.options].findIndex(o => o.textContent.trim() === 'Savings');
      typeSel.value = String(savingsIdx);
      form.querySelector('.hh-form-val').value = '50,000';
      form.querySelector('.hh-form-owner').value = 'joint';
      form.querySelector('[data-hh-action="save-account"]').click();
    });
    await new Promise(r => setTimeout(r, 400));
    const added = await page.evaluate(() => ({
      rows: document.querySelectorAll('#hh-view .hh-acct').length,
      total: document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim(),
    }));
    if(added.rows !== before.rows + 1) throw new Error(`saving the account did not add a row (${before.rows} -> ${added.rows})`);
    if(added.total === before.total) throw new Error('added account did not aggregate into the net-worth total');
    // Delete the added account (last row's ×) and confirm the total restores.
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#hh-view .hh-acct .row-x')];
      rows[rows.length - 1].click();
    });
    await new Promise(r => setTimeout(r, 400));
    const afterDel = await page.evaluate(() => ({
      rows: document.querySelectorAll('#hh-view .hh-acct').length,
      total: document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim(),
    }));
    if(afterDel.rows !== before.rows) throw new Error(`deleting the added account did not remove its row (${afterDel.rows})`);
    if(afterDel.total !== before.total) throw new Error(`deleting the added account did not restore the total (${before.total} vs ${afterDel.total})`);

    // Cash Flow: banner above it + editable income/expense fields + net surplus.
    await page.click('#hh-chap-cashflow');
    await new Promise(r => setTimeout(r, 400));
    const cf = await page.evaluate(() => ({
      banner: !!document.querySelector('#hh-view .hh-banner'),
      moneyInputs: document.querySelectorAll('#hh-view input[data-type="money"]').length,
      surplus: document.querySelector('#hh-view .hh-surplus__value')?.textContent.trim() || '',
      totals: document.querySelectorAll('#hh-view .hh-total__value').length,
    }));
    if(!cf.banner) throw new Error('banner missing above Cash Flow');
    if(cf.moneyInputs < 5) throw new Error(`Cash Flow income/expenses must be editable, got ${cf.moneyInputs}`);
    if(!/\$[\d,]/.test(cf.surplus)) throw new Error(`net surplus not formatted: "${cf.surplus}"`);
    if(cf.totals < 2) throw new Error('Cash Flow totals missing');

    // Back to Net Worth for the canonical Household screenshot.
    await page.click('#hh-chap-networth');
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: join(OUT, '01-household.png'), fullPage: true });
  });

  await step('household inline edits write back to plan + derived totals update', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-chap-networth'); await sleep(300);
    const totalBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim());
    // Edit the Traditional IRA typed account 1,600,000 → 1,700,000 (extraAccounts.1).
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="portfolio.extraAccounts.1.balance"]'); el.value = '1,700,000'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const after = await page.evaluate(() => ({ total: document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim(), status: document.querySelector('#status')?.textContent }));
    if(after.total === totalBefore) throw new Error(`editing an account balance did not update the derived net-worth total (${totalBefore})`);
    if(!/Plan edited/.test(after.status||'')) throw new Error('account edit did not mark the plan dirty (status)');
    // Change the Roth IRA owner co-client → client; the ownership split must shift.
    const ownBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-own__legend')?.textContent.replace(/\s+/g,' ').trim());
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.2.owner"]'); el.value = 'client'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const ownAfter = await page.evaluate(() => document.querySelector('#hh-view .hh-own__legend')?.textContent.replace(/\s+/g,' ').trim());
    if(ownBefore === ownAfter) throw new Error(`changing an account owner did not shift the ownership split (${ownBefore})`);
    // Changing an account's TYPE re-derives its bucket (Savings → taxable).
    const bucketShift = await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.2.type"]');
      if(!el) return null;
      el.value = 'Savings'; el.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    });
    if(!bucketShift) throw new Error('typed account is missing its type-bank select');
    await sleep(300);
    // Restore the demo (balance + owner + type).
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.2.type"]'); el.value = 'Roth IRA'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="portfolio.extraAccounts.1.balance"]'); el.value = '1,600,000'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.2.owner"]'); el.value = 'spouse'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
  });

  await step('household CP2 fields: banner filing/born + co-client toggle + extra screenshots', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const goHh = async (chapId) => {
      await page.click('.htab[data-page="household"]'); await sleep(300);
      await page.click('#'+chapId); await sleep(350);
    };

    // 1. Filing status select (banner) writes to plan.meta.filingStatus
    await goHh('hh-chap-networth');
    const fsEl = await page.$('#hh-view .hh-banner select[data-path="meta.filingStatus"]');
    if(!fsEl) throw new Error('filing status <select> missing from Household Basics banner');
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view .hh-banner select[data-path="meta.filingStatus"]');
      el.value = 'single'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    const filingLine = await page.evaluate(() => document.querySelector('#hh-rail-filing')?.textContent.trim() || '');
    if(!/single/i.test(filingLine)) throw new Error(`rail filing line did not update after filingStatus change: "${filingLine}"`);
    // Restore married
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view .hh-banner select[data-path="meta.filingStatus"]');
      el.value = 'marriedFilingJointly'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);

    // 2. Banner BORN year drives the person's current age (the engine input).
    const ageBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-banner .hh-derived')?.textContent.trim());
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view .hh-banner input[data-path="household.primary.birthYear"]');
      el.value = '1970'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    const ageAfter = await page.evaluate(() => document.querySelector('#hh-view .hh-banner .hh-derived')?.textContent.trim());
    if(ageBefore === ageAfter) throw new Error(`banner Born edit did not re-derive Age (${ageBefore} -> ${ageAfter})`);
    if(!/Plan edited/.test(await page.evaluate(() => document.querySelector('#status')?.textContent || '')))
      throw new Error('banner Born edit did not mark plan dirty');
    // Restore demo birth year
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view .hh-banner input[data-path="household.primary.birthYear"]');
      el.value = '1968'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);

    // 2b. Taxable cost basis % (Accounts group) writes to plan (0.9 → input shows 90)
    const basisEl = await page.$('#hh-view .hh-basis-row input[data-path="portfolio.accounts.taxable.basisPct"]');
    if(!basisEl) throw new Error('taxable basisPct input missing from the Accounts group');
    const basisBefore = await basisEl.evaluate(el => el.value);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view .hh-basis-row input[data-path="portfolio.accounts.taxable.basisPct"]');
      el.value = '90'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(250);
    const basisAfter = await page.evaluate(() => document.querySelector('#hh-view .hh-basis-row input[data-path="portfolio.accounts.taxable.basisPct"]')?.value);
    if(basisAfter === basisBefore) throw new Error(`basisPct input did not reflect written value (before=${basisBefore}, after=${basisAfter})`);
    if(!/Plan edited/.test(await page.evaluate(() => document.querySelector('#status')?.textContent || '')))
      throw new Error('basisPct edit did not mark plan dirty');
    // Restore to original (55%)
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view .hh-basis-row input[data-path="portfolio.accounts.taxable.basisPct"]');
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

    // 4. Co-client remove → '+ Add Co-Client' appears in the banner; re-add restores.
    await goHh('hh-chap-networth');
    const removeBtnBefore = await page.$('#hh-view .hh-banner [data-hh-action="remove-spouse"]');
    if(!removeBtnBefore) throw new Error('Remove (co-client) action missing from banner');
    await page.evaluate(() => {
      // Bypass the confirm() dialog by temporarily replacing it
      const orig = window.confirm;
      window.confirm = () => true;
      document.querySelector('#hh-view .hh-banner [data-hh-action="remove-spouse"]').click();
      window.confirm = orig;
    });
    await sleep(350);
    const addSpouseVisible = await page.$('#hh-view .hh-banner [data-hh-action="add-spouse"]');
    if(!addSpouseVisible) throw new Error('after removing co-client, "+ Add Co-Client" did not appear in banner');
    const railAfterRemove = await page.evaluate(() => document.querySelector('#hh-rail-name')?.textContent.trim() || '');
    if(/&/.test(railAfterRemove)) throw new Error(`rail name still shows "&" after co-client removal: "${railAfterRemove}"`);
    // Re-add co-client
    await page.click('#hh-view .hh-banner [data-hh-action="add-spouse"]');
    await sleep(350);
    const addSpouseGone = await page.$('#hh-view .hh-banner [data-hh-action="add-spouse"]');
    if(addSpouseGone) throw new Error('"+ Add Co-Client" should disappear after adding co-client');
    const spouseInputs = await page.evaluate(() => document.querySelectorAll('#hh-view input[data-path^="household.spouse"]').length);
    if(spouseInputs < 2) throw new Error(`banner after add should have co-client born/retires inputs, got ${spouseInputs}`);
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

  await step('typed accounts feed the engine: cleared plan + $1M brokerage drives scenario results', async () => {
    // The account bank must reach the ENGINE, not just the Household display:
    // clear the household ($0 everywhere → Baseline median renders '—'), add a
    // $1,000,000 Brokerage (taxable) via the form, Run, and the engine-computed
    // Baseline median must become a $-figure of $1M scale (growth over a 30-year
    // horizon with zero spending). Median comes from s.res.envelope — engine output.
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.evaluate(() => { window.__origConfirm = window.confirm; window.confirm = () => true; });
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-act-clear'); await sleep(600);

    // Cleared plan → Scenarios Baseline median is '—' (no assets, fmtMoney(0)).
    await page.click('button[data-page="scenarios"]'); await sleep(900);
    const emptyMedian = await page.evaluate(() => document.querySelector('#scn-view .scol__median b')?.textContent.trim() || '');
    if(!/^—$/.test(emptyMedian)) throw new Error(`cleared plan should show an empty Baseline median, got "${emptyMedian}"`);

    // Add $1,000,000 Brokerage (taxable), owned by the client, via the bank form.
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-chap-networth'); await sleep(300);
    await page.click('#hh-view [data-hh-action="open-account-form"]'); await sleep(250);
    await page.evaluate(() => {
      const form = document.querySelector('#hh-acct-form');
      const sel = form.querySelector('.hh-form-type');
      sel.value = String([...sel.options].findIndex(o => o.textContent.trim() === 'Brokerage (taxable)'));
      form.querySelector('.hh-form-val').value = '1,000,000';
      form.querySelector('.hh-form-owner').value = 'client';
      form.querySelector('[data-hh-action="save-account"]').click();
    });
    await sleep(400);
    const nwTotal = await page.evaluate(() => document.querySelector('#hh-view .hh-fulcrum__total')?.textContent.trim() || '');
    if(!/1,000,000/.test(nwTotal)) throw new Error(`added brokerage did not reach the net-worth display: "${nwTotal}"`);

    // Run → engine recomputes from the dirty plan; Baseline median must now be $1M-scale.
    await page.click('button[data-page="scenarios"]'); await sleep(600);
    await page.click('#run-btn');
    let status = '';
    for(let i = 0; i < 60; i++){
      await sleep(500);
      status = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
      if(/Complete/i.test(status)) break;
    }
    if(!/Complete/i.test(status)) throw new Error(`Run did not complete after adding the account (status: "${status}")`);
    const medianTxt = await page.evaluate(() => document.querySelector('#scn-view .scol__median b')?.textContent.trim() || '');
    const parsed = (() => {
      const m = medianTxt.match(/^\$([\d.,]+)\s*([MK]?)$/i);
      if(!m) return null;
      const n = parseFloat(m[1].replace(/,/g, ''));
      return m[2].toUpperCase() === 'M' ? n * 1e6 : m[2].toUpperCase() === 'K' ? n * 1e3 : n;
    })();
    if(parsed == null) throw new Error(`Baseline median not a $-figure after Run: "${medianTxt}"`);
    if(parsed < 500000) throw new Error(`engine starting assets do not reflect the $1M account (median ${medianTxt})`);

    // Restore the demo household for the steps that follow.
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-act-demo'); await sleep(800);
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

    // (2) Delaying the co-client's retirement pushes the first retirement-phase row
    // later. The Retires input lives in the Household Basics banner (any chapter).
    await goHh('hh-chap-cashflow'); await setHh('income.socialSecurity.spouse.pia', '30,000');
    await goHh('hh-chap-networth'); await setHh('household.spouse.retirementAge', '64');
    await openCashFlow(); const firstEarly = await firstAge();
    await goHh('hh-chap-networth'); await setHh('household.spouse.retirementAge', '67');
    await openCashFlow(); const firstLate = await firstAge();
    if(firstEarly == null || firstLate == null) throw new Error(`first cash-flow age missing (${firstEarly} vs ${firstLate})`);
    if(!(firstLate > firstEarly)) throw new Error(`delaying co-client retirement via Household did not push retirement later (${firstEarly} -> ${firstLate})`);

    // Restore the demo household and leave Cash Flow closed.
    await goHh('hh-chap-networth'); await setHh('household.spouse.retirementAge', '64');
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

  await step('goals renders Life Chapters view (title, cards, rows, composer)', async () => {
    // Contract updated for the shipped Life Chapters view: the Goals tab now
    // renders renderGoalsChapters() -> #gl-chapters (three derived chapter
    // cards + inline row editing + the two-mode goal composer), replacing the
    // retired Horizon (#gl-horizon). renderGoalsHorizon()/initGoalsHorizon()
    // are preserved in index.html as dead code; this asserts the CURRENT DOM.
    // The what-if drop mechanism was retired by design decision (2026-07-06).
    await page.click('.htab[data-sub-target="goals"]');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const ch = document.querySelector('#gl-chapters');
      const host = document.querySelector('#np-content') || ch;
      const hostText = (host?.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        chapters: !!ch,
        title: /Spending & Lifestyle Goals/.test(hostText),
        cards: document.querySelectorAll('.glc-card').length,
        romans: [...document.querySelectorAll('.glc-roman')].map(el => el.textContent.trim()).join(','),
        rows: document.querySelectorAll('.glc-row').length,
        totals: [...document.querySelectorAll('.glc-total')].map(el => el.textContent.trim()),
        switchTabs: document.querySelectorAll('.glc-csw').length,
        composerA: !!document.querySelector('#glc-composer-a'),
        composerB: !!document.querySelector('#glc-composer-b'),
        catChips: document.querySelectorAll('#glc-a-cats .glc-cchip').length,
        textLen: hostText.length,
      };
    });
    if(!m.chapters) throw new Error('Goals Life Chapters (#gl-chapters) did not render');
    if(!m.title) throw new Error('Goals title "Spending & Lifestyle Goals" missing from rendered view');
    if(m.cards !== 3) throw new Error(`expected 3 chapter cards, got ${m.cards}`);
    if(m.romans !== 'I,II,III') throw new Error(`chapter numerals wrong (${m.romans})`);
    if(m.rows < 1) throw new Error(`expected >=1 goal row, got ${m.rows}`);
    if(m.totals.some(t => !/^\$/.test(t))) throw new Error(`chapter totals malformed (${m.totals.join(' / ')})`);
    if(m.switchTabs !== 2 || !m.composerA || !m.composerB)
      throw new Error('composer (TIMELINE/QUICK-TAP switch + both panels) did not render');
    if(m.catChips < 1) throw new Error('composer category chips did not render');
    if(m.textLen < 40) throw new Error(`Goals page appears blank (textLen=${m.textLen})`);
    await page.screenshot({ path: join(OUT, '02-goals.png'), fullPage: true });
  });

  await step('goals Life Chapters: composer add, inline edit, Escape, cadence, remove', async () => {
    // Add via composer A writes ONE flat plan.goals record; its rows derive
    // into every overlapped chapter (data-gi ties them) and flash gold.
    // Pointerdown on a row opens the inline editor; closing commits to the
    // flat store (whole-goal amount semantics); Escape cancels and restores
    // the store-derived render. All assertions are DOM-level (the app script
    // is a module — `plan` is not a window global).
    await page.click('.htab[data-sub-target="goals"]');
    await new Promise(r => setTimeout(r, 350));
    const maxGi = () => page.evaluate(() =>
      Math.max(-1, ...[...document.querySelectorAll('.glc-row')].map(r => +r.dataset.gi)));
    const rowsFor = gi => page.evaluate(g =>
      document.querySelectorAll(`.glc-row[data-gi="${g}"]`).length, gi);
    const chapterTotals = () => page.evaluate(() =>
      [...document.querySelectorAll('.glc-total')].map(el => el.textContent.trim()));
    const openRow = (gi, band) => page.evaluate((g, b) => {
      const row = document.querySelector(`.glc-row[data-gi="${g}"][data-band="${b}"]`) ||
                  document.querySelector(`.glc-row[data-gi="${g}"]`);
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }, gi, band);
    const closeOutside = () => page.evaluate(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 4 }));
    });

    const gi0 = await maxGi();
    if(gi0 < 0) throw new Error('no seed goal rows rendered');

    // 1) composer add (recurring, default full span) → one new goal index,
    //    one flashing row in each of the 3 chapters, name field refocused
    await page.click('#glc-a-name');
    await page.type('#glc-a-name', 'Verify goal');
    await page.click('#glc-a-add');
    await new Promise(r => setTimeout(r, 400));
    const newGi = await maxGi();
    if(newGi !== gi0 + 1) throw new Error(`composer add did not append a goal (maxGi ${gi0} -> ${newGi})`);
    let m = await page.evaluate(g => ({
      rows: document.querySelectorAll(`.glc-row[data-gi="${g}"]`).length,
      flash: document.querySelectorAll('.glc-row--flash').length,
      named: [...document.querySelectorAll(`.glc-row[data-gi="${g}"] .glc-name`)].every(el => el.textContent === 'Verify goal'),
      refocused: document.activeElement && document.activeElement.id === 'glc-a-name',
    }), newGi);
    if(m.rows !== 3) throw new Error(`full-span goal should render in all 3 chapters, got ${m.rows} rows`);
    if(m.flash < 1) throw new Error('newly added rows did not flash');
    if(!m.named) throw new Error('added rows do not carry the typed goal name');

    // 2) inline edit: open the new goal's row, change the amount, click
    //    outside → commits to the whole flat goal (all slices re-render)
    const totalsSeed = await chapterTotals();
    await openRow(newGi, 0);
    await new Promise(r => setTimeout(r, 200));
    if(!await page.evaluate(() => !!document.querySelector('.glc-ed')))
      throw new Error('inline editor did not open on row pointerdown');
    await page.evaluate(() => {
      const amt = document.querySelector('.glc-ed-amt');
      amt.value = '7000';
      amt.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await closeOutside();
    await new Promise(r => setTimeout(r, 400));
    m = await page.evaluate(g => ({
      editorGone: !document.querySelector('.glc-ed'),
      totals: [...document.querySelectorAll('.glc-total')].map(el => el.textContent.trim()),
      subs: [...document.querySelectorAll(`.glc-row[data-gi="${g}"] .glc-sub`)].map(el => el.textContent),
    }), newGi);
    if(!m.editorGone) throw new Error('inline editor did not close on outside click');
    if(JSON.stringify(m.totals) === JSON.stringify(totalsSeed))
      throw new Error('inline amount edit did not commit (chapter totals unchanged)');
    if(!m.subs.every(s => s.includes('$7,000')))
      throw new Error(`whole-goal amount did not propagate to all slices (${m.subs.join(' | ')})`);

    // 3) Escape cancels a dirty edit and restores the store-derived render
    const beforeCancel = await page.evaluate(() => ({
      totals: [...document.querySelectorAll('.glc-total')].map(el => el.textContent.trim()),
      subs: [...document.querySelectorAll('.glc-sub')].map(el => el.textContent.trim()),
    }));
    await openRow(newGi, 0);
    await new Promise(r => setTimeout(r, 200));
    const midTotals = await page.evaluate(() => {
      const amt = document.querySelector('.glc-ed-amt');
      amt.value = '99000';
      amt.dispatchEvent(new Event('input', { bubbles: true }));
      return [...document.querySelectorAll('.glc-total')].map(el => el.textContent.trim());
    });
    if(JSON.stringify(midTotals) === JSON.stringify(beforeCancel.totals))
      throw new Error('live edit did not update chapter totals (test precondition failed)');
    await page.evaluate(() => {
      document.querySelector('.glc-ed').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 400));
    m = await page.evaluate(() => ({
      totals: [...document.querySelectorAll('.glc-total')].map(el => el.textContent.trim()),
      subs: [...document.querySelectorAll('.glc-sub')].map(el => el.textContent.trim()),
      editorGone: !document.querySelector('.glc-ed'),
    }));
    if(!m.editorGone) throw new Error('Escape did not close the editor');
    if(JSON.stringify(m.totals) !== JSON.stringify(beforeCancel.totals))
      throw new Error(`Escape did not restore chapter totals (${m.totals} vs ${beforeCancel.totals})`);
    if(JSON.stringify(m.subs) !== JSON.stringify(beforeCancel.subs))
      throw new Error('Escape did not restore row subtitles');

    // 4) cadence round-trip: recurring multi-chapter -> one-time collapses to
    //    a single chapter row on commit; one-time -> recurring defaults to the
    //    chapter's full band (a real span again)
    await openRow(newGi, 0);
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => document.querySelector('.glc-ed-cad[data-cad="once"]').click());
    await closeOutside();
    await new Promise(r => setTimeout(r, 400));
    if(await rowsFor(newGi) !== 1)
      throw new Error('cadence -> one-time did not collapse the goal to a single chapter row');
    m = await page.evaluate(g =>
      document.querySelector(`.glc-row[data-gi="${g}"] .glc-sub`).textContent, newGi);
    if(!/One-time/.test(m)) throw new Error(`collapsed row sub-line is not one-time ("${m}")`);
    await openRow(newGi, 0);
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => document.querySelector('.glc-ed-cad[data-cad="yr"]').click());
    await closeOutside();
    await new Promise(r => setTimeout(r, 400));
    m = await page.evaluate(g =>
      document.querySelector(`.glc-row[data-gi="${g}"] .glc-sub`).textContent, newGi);
    if(!/\/yr/.test(m)) throw new Error(`cadence -> recurring did not restore a /yr span ("${m}")`);

    // 5) remove: reopen the row, click REMOVE → goal deleted from the store
    await openRow(newGi, 0);
    await new Promise(r => setTimeout(r, 200));
    await page.click('.glc-ed-remove');
    await new Promise(r => setTimeout(r, 400));
    m = await page.evaluate(() => ({
      maxGi: Math.max(-1, ...[...document.querySelectorAll('.glc-row')].map(r => +r.dataset.gi)),
      verifyGone: ![...document.querySelectorAll('.glc-name')].some(el => el.textContent === 'Verify goal'),
      chapters: !!document.querySelector('#gl-chapters'),
      rows: document.querySelectorAll('.glc-row').length,
      textLen: (document.querySelector('#gl-chapters')?.textContent || '').replace(/\s+/g, ' ').trim().length,
    }));
    if(m.maxGi !== gi0) throw new Error(`remove did not restore goal count (maxGi=${m.maxGi}, want ${gi0})`);
    if(!m.verifyGone) throw new Error('removed goal still renders in a chapter');

    // Goals page must remain rendered (not blank) after all interactions.
    if(!m.chapters || m.rows < 1 || m.textLen < 40)
      throw new Error(`Goals page blank/broken after workflows (${JSON.stringify(m)})`);
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

    // Compare is editable: discrete levers (ages, allocation) now show always-visible
    // .cmp-step-btn[data-scn-id] buttons; dollar levers show .cmp-lev-in type-in inputs.
    // Both carry data-scn-id. Step up then back so the baseline is left as found.
    const cmpStepBtns = await page.evaluate(() => document.querySelectorAll('#scn-view .compare .cmp-step-btn[data-scn-id]').length);
    const cmpInputs   = await page.evaluate(() => document.querySelectorAll('#scn-view .compare .cmp-lev-in[data-scn-id]').length);
    if(cmpStepBtns < 2 && cmpInputs < 1) throw new Error(`Compare lever controls missing (stepBtns=${cmpStepBtns}, inputs=${cmpInputs})`);
    await page.evaluate(() => document.querySelector('#scn-view .compare .cmp-step-btn[data-dir="1"][data-scn-id]')?.click());
    await new Promise(r => setTimeout(r, 250));
    const cmpStatus = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
    if(!/Run to update/i.test(cmpStatus)) throw new Error(`Compare step button did not request a manual Run: "${cmpStatus}"`);
    await page.evaluate(() => document.querySelector('#scn-view .compare .cmp-step-btn[data-dir="-1"][data-scn-id]')?.click());
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
    // Goals mounts the Life Chapters view (.gl-chapters) now, not the retired Horizon.
    if(!await page.evaluate(() => !!document.querySelector('#np-content .gl-chapters'))) throw new Error('Goals view did not mount .gl-chapters');
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
