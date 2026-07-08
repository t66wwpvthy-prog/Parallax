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
   Household is the 5-STEP SETUP WIZARD (Household → Accounts → Income →
   Retirement → Blueprint), an EDITABLE plan-input console. This asserts its
   boundaries: the stepper + five step renderers exist exactly once each
   (inline in index.html, reusing renderField); the surface is EDITABLE — it
   emits data-path inputs and a #hh-view delegate that writes edits back to
   `plan` and reseeds/dirties scenarios (hhCommit); the retired chapter console
   (Net Worth equilibrium / Cash Flow) is GONE; no sample household ships; the
   stylesheet is linked once and every .hh- selector is scoped to the page key;
   and no competing Household layer survives in main.css. The editing BEHAVIOUR
   (edits reach the engine) is proved by the browser steps below. */
function verifyHousehold(){
  const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const fails = [];
  const ok = (cond, msg) => { if(!cond) fails.push(msg); };
  const html = read(join(ROOT, 'index.html'));
  const css  = read(join(ROOT, 'styles', 'household.css'));
  const main = read(join(ROOT, 'styles', 'main.css'));

  // Wizard chrome: 5-step stepper + two-pane body (form column + plan rail).
  ok(/class="hh-stepper"/.test(html), 'wizard stepper (.hh-stepper) missing');
  [1,2,3,4,5].forEach(n => ok(new RegExp(`id="hh-step-${n}"`).test(html), `stepper button #hh-step-${n} missing`));
  ok(/id="hh-plan-rail"/.test(html), 'live "Plan so far" rail (#hh-plan-rail) missing');
  ok(/function renderWizRail\b/.test(html), 'plan-rail renderer (renderWizRail) missing');
  ok(/function hhDefaultStep\b/.test(html), 'hhDefaultStep() landing heuristic missing');
  ok(/data-hh-action="step-back"/.test(html) && /data-hh-action="step-next"/.test(html), 'wizard Back/Continue footer actions missing');
  // Tucked household controls menu (Switch / New / Demo / Clear).
  ok(/id="hh-menu-btn"/.test(html) && /id="hh-menu-pop"/.test(html), 'household controls menu (#hh-menu-btn / #hh-menu-pop) missing');

  // The RETIRED surfaces must be gone: Demographics, the chapter rail, the
  // Net Worth equilibrium and the Cash Flow chapter renderers.
  ok(!/hh-chap-demographics/.test(html) && !/function renderHhDemographics\b/.test(html), 'retired Demographics chapter still present');
  ok(!/hh-chap-networth/.test(html) && !/function renderHhNetWorth\b/.test(html), 'retired Net Worth chapter still present (hh-chap-networth / renderHhNetWorth)');
  ok(!/hh-chap-cashflow/.test(html) && !/function renderHhCashflow\b/.test(html), 'retired Cash Flow chapter still present (hh-chap-cashflow / renderHhCashflow)');
  ok(!/function renderHhBanner\b/.test(html), 'retired Household Basics banner renderer still present (renderHhBanner)');
  ok(!/function renderHhFulcrum\b/.test(html) && !/function renderHhPillar\b/.test(html), 'retired equilibrium renderers still present (fulcrum/pillar)');
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
  ok(!/meta\.inflationPct/.test(html), 'engine-inert Inflation field must not ship in the wizard');
  ok(/\['trust','Trust'\]/.test(html), 'Trust ownership option missing from HH_OWNERS');

  // exactly one renderer per step, no reassignment
  ['renderWizHousehold', 'renderWizAccounts', 'renderWizIncome', 'renderWizRetirement', 'renderWizBlueprint'].forEach(fn => {
    const defs = (html.match(new RegExp('function\\s+' + fn + '\\b', 'g')) || []).length;
    ok(defs === 1, 'Expected exactly one ' + fn + ' implementation; found ' + defs);
    ok(!new RegExp(fn + '\\s*=\\s*function').test(html), fn + ' function reassignment detected');
  });

  // Wizard data additions: addable children (engine-inert context), addable
  // primary home with the mortgage NESTED inside it, annual savings on the
  // Accounts step; working income must NOT render as a wizard input.
  ok(/household\.children/.test(html), 'household.children[] (addable children) missing');
  ok(/child:\s*\{\s*arr:'household\.children'/.test(html), 'ROW_KINDS child factory missing');
  ok(/data-hh-action="add-home"/.test(html), 'addable Primary home action (add-home) missing');
  ok(/data-hh-action="add-mortgage"/.test(html), 'nested mortgage add action (add-mortgage) missing');
  ok(/hhField\('savings\.annual','money'\)/.test(html), 'Annual savings field missing from the Accounts step');
  ok(!/hhField\('income\.workingIncome'/.test(html), 'working income must not render as a wizard input (engine-inert today)');

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

  // ── Multi-household state management: pure factories + records-by-id store ──
  // The app boots with a demo household but supports creating/switching custom
  // households, and demo values must never overwrite a custom household on reload.
  ok(/function createDemoHousehold\b/.test(html),  'createDemoHousehold() factory missing');
  ok(/function createBlankHousehold\b/.test(html), 'createBlankHousehold() factory missing');
  ok(/function hydratePlan\b/.test(html),          'hydratePlan() (in-place plan hydrate) missing');
  ok(/function bootstrapHouseholds\b/.test(html),  'bootstrapHouseholds() (first-load seed + reload hydrate) missing');
  ok(/function newHousehold\b/.test(html),         'newHousehold() action missing');
  ok(/function switchHousehold\b/.test(html),      'switchHousehold() action missing');
  ok(/function hhAlreadyRetired\b/.test(html),     'hhAlreadyRetired() helper missing (retirement age must go inert once retired)');
  ok(/meta\.householdId/.test(html), 'household record must carry meta.householdId');
  ok(/meta\.isDemo/.test(html),      'household record must carry meta.isDemo');
  ok(/meta\.name\s*=/.test(html),    'household record must carry meta.name');
  ok(/['"]parallax\.households\.v1['"]/.test(html),       'households store key (parallax.households.v1) missing');
  ok(/['"]parallax\.activeHouseholdId['"]/.test(html),    'active-household key (parallax.activeHouseholdId) missing');
  // Scenarios must be scoped per household (parallax.scenarios.<id>.v1) so demo
  // and custom scenario sets never collide; the old global key must be gone.
  ok(/['"]parallax\.scenarios\.['"]/.test(html) || /SCEN_PREFIX/.test(html), 'scoped scenario key prefix (parallax.scenarios.) missing');
  ok(!/['"]parallax\.scenarios\.v2['"]/.test(html), 'legacy global scenario key (parallax.scenarios.v2) must be gone');
  // No standalone demo subtab / demo data page — this is state management only.
  ok(!/data-page=["']demo["']/.test(html), 'a separate demo page/subtab must NOT exist (state management, not navigation)');
  // Household selector + New Household controls.
  ok(/id=.hh-switch/.test(html), 'household switcher (#hh-switch) missing');
  ok(/id=.hh-new/.test(html),    'New Household button (#hh-new) missing');
  ok(/meta\.filingStatus/.test(html), 'Filing status field (meta.filingStatus) missing from Household');
  // NO basis input: the taxable cost-basis % is an engine default now, never an
  // advisor-facing wizard field.
  ok(!/hhField\('portfolio\.accounts\.taxable\.basisPct'/.test(html), 'taxable cost-basis input must NOT ship in the wizard');
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
  console.log('  OK household contract (5-step wizard: stepper + step renderers, account-type bank, data-path write-back, reseed-on-edit, scoped CSS)');
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
    // Deterministic seed: households + scenarios persist to localStorage, so a
    // stale browser store would silently replace the demo seed (Baseline 66 /
    // Scenario B 68 / Aggressive risk 5) and make the per-scenario assertions
    // flaky. Clear ALL storage and reload so every run boots a fresh Demo
    // Household via bootstrapHouseholds() → demoScenarios().
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
  });

  // Wizard navigation helper: Household tab → stepper click (all steps are
  // freely clickable — advisor tool, no gating).
  const goStep = async (n) => {
    await page.click('.htab[data-page="household"]');
    await new Promise(r => setTimeout(r, 300));
    await page.click('#hh-step-' + n);
    await new Promise(r => setTimeout(r, 350));
  };

  await step('household wizard: stepper + landing + all five steps render from plan', async () => {
    // Household is the 5-step setup wizard: syncHousehold() renders the active
    // step into #hh-view + the live "Plan so far" rail, every value an inline
    // renderField() data-path input. A FILLED household (the demo) must land on
    // the Blueprint (step 5); the retired chapter console must NOT exist.
    await page.click('.htab[data-page="household"]');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('.hdr-tabs .htab')].map(b => b.textContent.trim()),
      hasSubnav: !!document.querySelector('#np-subnav'),
      wizard: !!document.querySelector('.page[data-page="household"] .hh-wizard'),
      steps: [...document.querySelectorAll('.hh-stepper .hh-step__label')].map(e => e.textContent.trim()),
      current: document.querySelector('.hh-stepper .hh-step.is-current')?.dataset.step || '',
      chapButtons: !!document.querySelector('#hh-chap-networth, #hh-chap-cashflow'),
      railName: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      planRail: document.querySelector('#hh-plan-rail .hh-prail__total')?.textContent.trim() || '',
      menuBtn: !!document.querySelector('#hh-menu-btn'),
      spouseText: /Spouse/.test(document.querySelector('.page[data-page="household"]')?.textContent || ''),
    }));
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Sequencing'];
    if(JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) throw new Error(`main nav mismatch: ${JSON.stringify(m.nav)}`);
    if(m.hasSubnav) throw new Error('old net-worth subnav is still rendered');
    if(!m.wizard) throw new Error('household wizard frame (.hh-wizard) missing');
    if(JSON.stringify(m.steps) !== JSON.stringify(['Household','Accounts','Income','Retirement','Blueprint'])) throw new Error(`stepper mismatch: ${JSON.stringify(m.steps)}`);
    if(m.current !== '5') throw new Error(`filled demo household must land on Blueprint (step 5), got "${m.current}"`);
    if(m.chapButtons) throw new Error('retired chapter rail buttons still rendered');
    if(!m.railName) throw new Error('household name not filled from plan');
    if(!/\$[\d,]/.test(m.planRail)) throw new Error(`"Plan so far" rail net worth not formatted: "${m.planRail}"`);
    if(!m.menuBtn) throw new Error('household controls menu button missing');
    if(m.spouseText) throw new Error('visible Household UI still says "Spouse"');

    // Controls menu: ⋯ toggles the popover housing Switch / New / Demo / Clear.
    await page.click('#hh-menu-btn'); await new Promise(r => setTimeout(r, 200));
    const menu = await page.evaluate(() => ({
      open: !document.querySelector('#hh-menu-pop').hidden,
      switcher: !!document.querySelector('#hh-menu-pop #hh-switch'),
      newBtn: !!document.querySelector('#hh-menu-pop #hh-new'),
      demoBtn: !!document.querySelector('#hh-menu-pop #hh-act-demo'),
      clearBtn: !!document.querySelector('#hh-menu-pop #hh-act-clear'),
    }));
    if(!menu.open) throw new Error('household menu did not open');
    if(!menu.switcher || !menu.newBtn || !menu.demoBtn || !menu.clearBtn) throw new Error('menu is missing household controls');
    await page.click('#hh-menu-btn'); await new Promise(r => setTimeout(r, 200));
    if(await page.evaluate(() => !document.querySelector('#hh-menu-pop').hidden)) throw new Error('household menu did not close');

    // Step 5 · Blueprint (the landing step): READ-ONLY overview.
    const bp = await page.evaluate(() => ({
      controls: document.querySelectorAll('#hh-view input, #hh-view select').length,
      total: document.querySelector('#hh-view .hh-bp__total')?.textContent.trim() || '',
      own: !!document.querySelector('#hh-view .hh-own__bar'),
    }));
    if(bp.controls !== 0) throw new Error(`Blueprint must be read-only, found ${bp.controls} controls`);
    if(!/\$[\d,]/.test(bp.total)) throw new Error(`Blueprint net worth not formatted from plan: "${bp.total}"`);
    if(!bp.own) throw new Error('Blueprint ownership bar missing');
    await page.screenshot({ path: join(OUT, '01-household.png'), fullPage: true });

    // Step 1 · Household: names, Born (drives age), filing, state, addable children.
    await page.click('#hh-step-1'); await new Promise(r => setTimeout(r, 350));
    const s1 = await page.evaluate(() => ({
      nameInputs: document.querySelectorAll('#hh-view input[data-path="meta.primaryName"], #hh-view input[data-path="meta.spouseName"]').length,
      bornInputs: document.querySelectorAll('#hh-view input[data-type="birthYear"]').length,
      filing: !!document.querySelector('#hh-view select[data-path="meta.filingStatus"]'),
      stateSel: !!document.querySelector('#hh-view select[data-path="meta.state"]'),
      coClientText: /Co-Client/.test(document.querySelector('#hh-view')?.textContent || ''),
      addChild: !!document.querySelector('#hh-view [data-add="child"]'),
      back: !!document.querySelector('#hh-view [data-hh-action="step-back"]'),
      next: !!document.querySelector('#hh-view [data-hh-action="step-next"]'),
    }));
    if(s1.nameInputs !== 2) throw new Error(`step 1 name inputs: want 2, got ${s1.nameInputs}`);
    if(s1.bornInputs < 2) throw new Error(`step 1 Born inputs missing, got ${s1.bornInputs}`);
    if(!s1.filing) throw new Error('Filing dropdown missing');
    if(!s1.stateSel) throw new Error('State dropdown missing');
    if(!s1.coClientText) throw new Error('step 1 does not say Co-Client');
    if(!s1.addChild) throw new Error('"+ Add child" missing');
    if(s1.back) throw new Error('Back button must not render on step 1');
    if(!s1.next) throw new Error('Continue button missing on step 1');

    // Children: add a row, confirm its inputs, remove it again.
    await page.click('#hh-view [data-add="child"]'); await new Promise(r => setTimeout(r, 350));
    const kid = await page.evaluate(() => ({
      name: !!document.querySelector('#hh-view input[data-path="household.children.0.name"]'),
      born: !!document.querySelector('#hh-view input[data-path="household.children.0.birthYear"]'),
    }));
    if(!kid.name || !kid.born) throw new Error('added child row did not render name + born inputs');
    await page.evaluate(() => document.querySelector('#hh-view .row-x[data-rmpath="household.children.0"]').click());
    await new Promise(r => setTimeout(r, 300));
    if(await page.evaluate(() => !!document.querySelector('#hh-view input[data-path="household.children.0.name"]')))
      throw new Error('removing the child row did not delete it');

    // Continue → step 2 (footer nav drives the stepper).
    await page.click('#hh-view [data-hh-action="step-next"]'); await new Promise(r => setTimeout(r, 350));
    const onStep2 = await page.evaluate(() => document.querySelector('.hh-stepper .hh-step.is-current')?.dataset.step);
    if(onStep2 !== '2') throw new Error(`Continue did not advance to step 2 (got ${onStep2})`);

    // Step 2 · Accounts: owner groups of TYPED rows; addable home; annual savings.
    const s2 = await page.evaluate(() => ({
      acctInputs: document.querySelectorAll('#hh-view .hh-acct input[data-type="money"]').length,
      ownerSelects: document.querySelectorAll('#hh-view select[data-type="owner"]').length,
      typeSelects: document.querySelectorAll('#hh-view select[data-type="acctType"]').length,
      coreSleeveInputs: document.querySelectorAll('#hh-view input[data-path^="portfolio.accounts."][data-path$=".balance"]').length,
      addAccountBtns: document.querySelectorAll('#hh-view [data-hh-action="open-account-form"]').length,
      basis: !!document.querySelector('#hh-view input[data-path="portfolio.accounts.taxable.basisPct"]'),
      addHome: !!document.querySelector('#hh-view [data-hh-action="add-home"]'),
      savings: !!document.querySelector('#hh-view input[data-path="savings.annual"]'),
    }));
    if(s2.acctInputs < 3) throw new Error(`typed account balances must be editable, got ${s2.acctInputs}`);
    if(s2.ownerSelects < 3) throw new Error(`account owner selects missing, got ${s2.ownerSelects}`);
    if(s2.typeSelects < 3) throw new Error(`account type-bank selects missing, got ${s2.typeSelects}`);
    if(s2.coreSleeveInputs > 0) throw new Error(`static core-sleeve rows still rendered (${s2.coreSleeveInputs} inputs)`);
    if(s2.addAccountBtns < 3) throw new Error(`per-group "+ Account" buttons missing, got ${s2.addAccountBtns}`);
    if(s2.basis) throw new Error('taxable cost-basis input must NOT render in the wizard');
    if(!s2.addHome) throw new Error('"+ Primary home" affordance missing (demo has no home)');
    if(!s2.savings) throw new Error('Annual savings input missing from the Accounts step');

    // Account Type Bank flow: the CLIENT group's "+ Account" prefills ownership.
    await page.click('#hh-view [data-hh-action="open-account-form"][data-owner="client"]');
    await new Promise(r => setTimeout(r, 300));
    const form = await page.evaluate(() => ({
      up: !!document.querySelector('#hh-acct-form'),
      owner: document.querySelector('#hh-acct-form .hh-form-owner')?.value || '',
    }));
    if(!form.up) throw new Error('account add-form did not open');
    if(form.owner !== 'client') throw new Error(`add-form ownership not prefilled from its group (got "${form.owner}")`);
    const before = await page.evaluate(() => ({
      rows: document.querySelectorAll('#hh-view .hh-acct').length,
      total: document.querySelector('#hh-plan-rail .hh-prail__total')?.textContent.trim(),
    }));
    await page.evaluate(() => {
      const f = document.querySelector('#hh-acct-form');
      const typeSel = f.querySelector('.hh-form-type');
      typeSel.value = String([...typeSel.options].findIndex(o => o.textContent.trim() === 'Savings'));
      f.querySelector('.hh-form-val').value = '50,000';
      f.querySelector('[data-hh-action="save-account"]').click();
    });
    await new Promise(r => setTimeout(r, 400));
    const added = await page.evaluate(() => ({
      rows: document.querySelectorAll('#hh-view .hh-acct').length,
      total: document.querySelector('#hh-plan-rail .hh-prail__total')?.textContent.trim(),
    }));
    if(added.rows !== before.rows + 1) throw new Error(`saving the account did not add a row (${before.rows} -> ${added.rows})`);
    if(added.total === before.total) throw new Error('added account did not reach the plan-rail net worth');
    // Delete the added account and confirm the rail restores. save-account
    // PUSHES, so the new account is the highest extraAccounts index (its row
    // renders inside its owner group, not last in the DOM).
    await page.evaluate(() => {
      const xs = [...document.querySelectorAll('#hh-view .hh-acct .row-x')];
      const idxs = xs.map(x => +x.dataset.rmpath.split('.').pop());
      xs[idxs.indexOf(Math.max(...idxs))].click();
    });
    await new Promise(r => setTimeout(r, 400));
    const afterDel = await page.evaluate(() => ({
      rows: document.querySelectorAll('#hh-view .hh-acct').length,
      total: document.querySelector('#hh-plan-rail .hh-prail__total')?.textContent.trim(),
    }));
    if(afterDel.rows !== before.rows) throw new Error(`deleting the added account did not remove its row (${afterDel.rows})`);
    if(afterDel.total !== before.total) throw new Error(`deleting the added account did not restore the rail (${before.total} vs ${afterDel.total})`);

    // Primary home: add → value input; + Mortgage nests inside it; remove home.
    await page.click('#hh-view [data-hh-action="add-home"]'); await new Promise(r => setTimeout(r, 350));
    const home = await page.evaluate(() => ({
      value: !!document.querySelector('#hh-view input[data-path="properties.0.value"]'),
      addMort: !!document.querySelector('#hh-view [data-hh-action="add-mortgage"]'),
      mortBal: !!document.querySelector('#hh-view input[data-path="properties.0.mortgage.balance"]'),
    }));
    if(!home.value) throw new Error('added home did not render its Value input');
    if(!home.addMort) throw new Error('"+ Mortgage" affordance missing on a fresh home');
    if(home.mortBal) throw new Error('mortgage inputs rendered before the mortgage was added');
    await page.click('#hh-view [data-hh-action="add-mortgage"]'); await new Promise(r => setTimeout(r, 350));
    const mort = await page.evaluate(() => ({
      bal: !!document.querySelector('#hh-view input[data-path="properties.0.mortgage.balance"]'),
      rate: !!document.querySelector('#hh-view input[data-path="properties.0.mortgage.rate"]'),
      term: !!document.querySelector('#hh-view input[data-path="properties.0.mortgage.termYears"]'),
    }));
    if(!mort.bal || !mort.rate || !mort.term) throw new Error('added mortgage did not render balance/rate/term inputs');
    await page.evaluate(() => document.querySelector('#hh-view .row-x[data-rmpath="properties.0"]').click());
    await new Promise(r => setTimeout(r, 350));
    if(!await page.evaluate(() => !!document.querySelector('#hh-view [data-hh-action="add-home"]')))
      throw new Error('removing the home did not restore the "+ Primary home" affordance');

    // Step 3 · Income: SS per spouse by default; pension renders NOTHING until
    // added; other income is addable; working income is absent.
    await page.click('#hh-step-3'); await new Promise(r => setTimeout(r, 350));
    const s3 = await page.evaluate(() => ({
      pia: document.querySelectorAll('#hh-view input[data-path^="income.socialSecurity."][data-path$=".pia"]').length,
      claim: document.querySelectorAll('#hh-view input[data-path^="income.socialSecurity."][data-path$=".claimAge"]').length,
      pensionInputs: document.querySelectorAll('#hh-view input[data-path^="income.pension."]').length,
      addPension: !!document.querySelector('#hh-view [data-hh-action="add-pension-age"]'),
      addIncome: !!document.querySelector('#hh-view [data-add="income"]'),
      working: !!document.querySelector('#hh-view input[data-path="income.workingIncome"]'),
    }));
    if(s3.pia !== 2) throw new Error(`SS benefit inputs: want 2 (per spouse), got ${s3.pia}`);
    if(s3.claim !== 2) throw new Error(`SS claim-age inputs: want 2, got ${s3.claim}`);
    if(s3.pensionInputs !== 0) throw new Error(`pension inputs rendered before a pension was added (${s3.pensionInputs})`);
    if(!s3.addPension) throw new Error('"+ Pension" affordance missing');
    if(!s3.addIncome) throw new Error('"+ Income source" missing');
    if(s3.working) throw new Error('working income input must not render in the wizard');

    // Pension appears only when added (quote → benefit row + start age + COLA),
    // and removing its only quote hides it again.
    await page.click('#hh-view [data-hh-action="add-pension-age"]'); await new Promise(r => setTimeout(r, 350));
    const pen = await page.evaluate(() => ({
      quote: !!document.querySelector('#hh-view input[data-path^="income.pension.benefitByAge."]'),
      cola: !!document.querySelector('#hh-view input[data-path="income.pension.colaPct"][data-type="pctPoints"]'),
      start: !!document.querySelector('#hh-view input[data-path="income.pension.startAge"]'),
    }));
    if(!pen.quote) throw new Error('added pension did not render its benefit quote');
    if(!pen.cola) throw new Error('pension COLA (pctPoints) input missing');
    if(!pen.start) throw new Error('pension start-age input missing');
    await page.evaluate(() => document.querySelector('#hh-view .row-x[data-rmpath^="income.pension.benefitByAge."]').click());
    await new Promise(r => setTimeout(r, 350));
    if(await page.evaluate(() => document.querySelectorAll('#hh-view input[data-path^="income.pension."]').length) !== 0)
      throw new Error('removing the only pension quote did not hide the pension section');

    // Step 4 · Retirement: per-person retire ages + plan horizon + ESSENTIAL
    // expenses only (living + healthcare — goals stay on the Goals page).
    await page.click('#hh-step-4'); await new Promise(r => setTimeout(r, 350));
    const s4 = await page.evaluate(() => ({
      retire: document.querySelectorAll('#hh-view input[data-path$=".retirementAge"]').length,
      planTo: document.querySelectorAll('#hh-view input[data-path="household.primary.planEndAge"]').length,
      living: !!document.querySelector('#hh-view input[data-path="expenses.living"]'),
      health: !!document.querySelector('#hh-view input[data-path="expenses.healthcare"]'),
      healthInfl: !!document.querySelector('#hh-view input[data-path="expenses.healthcareRealGrowth"]'),
      goals: document.querySelectorAll('#hh-view input[data-path^="goals."]').length,
    }));
    if(s4.retire !== 2) throw new Error(`retirement-age inputs: want 2, got ${s4.retire}`);
    if(s4.planTo !== 1) throw new Error(`plan-to inputs: want 1, got ${s4.planTo}`);
    if(!s4.living || !s4.health || !s4.healthInfl) throw new Error('essential expense inputs missing from step 4');
    if(s4.goals > 0) throw new Error('goals must not render inside the wizard');
  });

  await step('type floor: no household wizard text renders below 16px', async () => {
    // The wizard's design contract: every piece of text and every number on
    // the Household page is >= 16px computed. Scans all five steps, including
    // the add-account form (opened on step 2), covering text nodes AND inputs.
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(400);
    const offenders = [];
    for(const n of [1,2,3,4,5]){
      await page.click('#hh-step-'+n); await sleep(350);
      if(n === 2){
        await page.click('#hh-view [data-hh-action="open-account-form"][data-owner="client"]');
        await sleep(250);
      }
      const found = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('.page[data-page="household"] *').forEach(el => {
          if(el.tagName === 'OPTION') return;               // popup list, not page text
          if(!el.offsetParent) return;                      // hidden (e.g. closed menu)
          const hasText = [...el.childNodes].some(nd => nd.nodeType === 3 && nd.textContent.trim());
          if(!hasText && el.tagName !== 'INPUT') return;    // inputs render their value/placeholder
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if(fs < 15.9){
            const cls = (el.className || '').toString().split(' ')[0];
            bad.push(`${el.tagName.toLowerCase()}${cls ? '.'+cls : ''} ${fs.toFixed(1)}px "${(el.value || el.textContent || '').trim().slice(0, 24)}"`);
          }
        });
        return bad;
      });
      found.forEach(f => offenders.push(`step ${n}: ${f}`));
      if(n === 2){
        await page.evaluate(() => document.querySelector('[data-hh-action="cancel-account"]')?.click());
        await sleep(200);
      }
    }
    if(offenders.length) throw new Error('text below the 16px floor:\n  ' + [...new Set(offenders)].slice(0, 15).join('\n  '));
  });

  await step('household inline edits write back to plan + live plan-rail updates', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await goStep(2);
    const totalBefore = await page.evaluate(() => document.querySelector('#hh-plan-rail .hh-prail__total')?.textContent.trim());
    // Edit Client 1's Traditional IRA 1,213,686 → 1,313,686 (extraAccounts.3).
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="portfolio.extraAccounts.3.balance"]'); el.value = '1,313,686'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const after = await page.evaluate(() => ({ total: document.querySelector('#hh-plan-rail .hh-prail__total')?.textContent.trim(), status: document.querySelector('#status')?.textContent }));
    if(after.total === totalBefore) throw new Error(`editing an account balance did not update the plan-rail net worth (${totalBefore})`);
    if(!/Plan edited/.test(after.status||'')) throw new Error('account edit did not mark the plan dirty (status)');
    // Change Client 2's Roth IRA owner co-client → client; the row moves into
    // the Client group, so that group's investable total shifts (the Client
    // group is the first .hh-wsec on the Accounts step).
    const clientGroupTotal = () => page.evaluate(() => document.querySelector('#hh-view .hh-wsec .hh-wsec__total')?.textContent.trim());
    const ownBefore = await clientGroupTotal();
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.5.owner"]'); el.value = 'client'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const ownAfter = await clientGroupTotal();
    if(ownBefore === ownAfter) throw new Error(`changing an account owner did not move it between owner groups (${ownBefore})`);
    // Changing an account's TYPE re-derives its bucket (Roth IRA → Savings/taxable).
    const bucketShift = await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.5.type"]');
      if(!el) return null;
      el.value = 'Savings'; el.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    });
    if(!bucketShift) throw new Error('typed account is missing its type-bank select');
    await sleep(300);
    // Restore the demo (type + balance + owner).
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.5.type"]'); el.value = 'Roth IRA'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="portfolio.extraAccounts.3.balance"]'); el.value = '1,213,686'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
    await page.evaluate(() => { const el = document.querySelector('#hh-view select[data-path="portfolio.extraAccounts.5.owner"]'); el.value = 'spouse'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
  });

  await step('household step fields: filing/born writes + co-client toggle + screenshots', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 1. Filing status select (step 1) writes to plan.meta.filingStatus and the
    // wizard identity line re-derives.
    await goStep(1);
    const fsEl = await page.$('#hh-view select[data-path="meta.filingStatus"]');
    if(!fsEl) throw new Error('filing status <select> missing from step 1');
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="meta.filingStatus"]');
      el.value = 'single'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    const filingLine = await page.evaluate(() => document.querySelector('#hh-rail-filing')?.textContent.trim() || '');
    if(!/single/i.test(filingLine)) throw new Error(`identity filing line did not update after filingStatus change: "${filingLine}"`);
    // Restore married
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="meta.filingStatus"]');
      el.value = 'marriedFilingJointly'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);

    // 2. BORN year drives the person's current age (the engine input).
    const ageBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-derived')?.textContent.trim());
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="household.primary.birthYear"]');
      el.value = '1970'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    const ageAfter = await page.evaluate(() => document.querySelector('#hh-view .hh-derived')?.textContent.trim());
    if(ageBefore === ageAfter) throw new Error(`Born edit did not re-derive Age (${ageBefore} -> ${ageAfter})`);
    if(!/Plan edited/.test(await page.evaluate(() => document.querySelector('#status')?.textContent || '')))
      throw new Error('Born edit did not mark plan dirty');
    // Restore demo birth year (Client 1 born 1962 → age 64)
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="household.primary.birthYear"]');
      el.value = '1962'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);

    // 3. Step screenshots: Accounts (add-form open) + Income.
    await goStep(2);
    await page.click('#hh-view [data-hh-action="open-account-form"][data-owner="client"]'); await sleep(300);
    await page.screenshot({ path: join(OUT, '01b-household-accounts.png'), fullPage: true });
    await page.evaluate(() => document.querySelector('[data-hh-action="cancel-account"]')?.click()); await sleep(250);
    await goStep(3);
    await page.screenshot({ path: join(OUT, '01c-household-income.png'), fullPage: true });

    // 4. Co-client remove → '+ Add Co-Client' appears on step 1; re-add restores.
    await goStep(1);
    const removeBtnBefore = await page.$('#hh-view [data-hh-action="remove-spouse"]');
    if(!removeBtnBefore) throw new Error('Remove (co-client) action missing from step 1');
    await page.evaluate(() => {
      // Bypass the confirm() dialog by temporarily replacing it
      const orig = window.confirm;
      window.confirm = () => true;
      document.querySelector('#hh-view [data-hh-action="remove-spouse"]').click();
      window.confirm = orig;
    });
    await sleep(350);
    const addSpouseVisible = await page.$('#hh-view [data-hh-action="add-spouse"]');
    if(!addSpouseVisible) throw new Error('after removing co-client, "+ Add Co-Client" did not appear');
    const nameAfterRemove = await page.evaluate(() => document.querySelector('#hh-rail-name')?.textContent.trim() || '');
    if(/&/.test(nameAfterRemove)) throw new Error(`household name still shows "&" after co-client removal: "${nameAfterRemove}"`);
    // Re-add co-client
    await page.click('#hh-view [data-hh-action="add-spouse"]');
    await sleep(350);
    const addSpouseGone = await page.$('#hh-view [data-hh-action="add-spouse"]');
    if(addSpouseGone) throw new Error('"+ Add Co-Client" should disappear after adding co-client');
    const spouseInputs = await page.evaluate(() => document.querySelectorAll('#hh-view input[data-path^="household.spouse"]').length);
    if(spouseInputs < 1) throw new Error(`step 1 after add should have co-client born input, got ${spouseInputs}`);
    // Restore co-client retirement age to demo value (Client 2 retires at 65) —
    // retirement ages live on step 4 in the wizard.
    await goStep(4);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="household.spouse.retirementAge"]');
      if(el){ el.value = '65'; el.dispatchEvent(new Event('change', { bubbles:true })); }
    });
    await sleep(200);
  });

  await step('household Demo/Clear menu actions restore and blank the plan + set the landing step', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(300);

    // Override confirm so buttons fire without an interactive dialog
    await page.evaluate(() => { window.__origConfirm = window.confirm; window.confirm = () => true; });

    // Clear (via the ⋯ menu) → plan blanked, wizard lands on step 1.
    await page.click('#hh-menu-btn'); await sleep(200);
    await page.click('#hh-act-clear'); await sleep(500);
    const afterClear = await page.evaluate(() => ({
      name: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      step: document.querySelector('.hh-stepper .hh-step.is-current')?.dataset.step || '',
    }));
    if(/Client/.test(afterClear.name) && /Spouse/.test(afterClear.name))
      throw new Error(`Clear did not blank household (identity still shows: "${afterClear.name}")`);
    if(afterClear.step !== '1') throw new Error(`cleared (blank) household must land on step 1, got "${afterClear.step}"`);

    // Demo → plan restored, wizard lands on the Blueprint.
    await page.evaluate(() => document.querySelector('#hh-act-demo').click()); await sleep(500);
    const afterDemo = await page.evaluate(() => ({
      name: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      step: document.querySelector('.hh-stepper .hh-step.is-current')?.dataset.step || '',
    }));
    if(!afterDemo.name.includes('Client')) throw new Error(`Demo did not restore household (got: "${afterDemo.name}")`);
    if(afterDemo.step !== '5') throw new Error(`restored demo must land on the Blueprint (step 5), got "${afterDemo.step}"`);

    // Close the menu + restore confirm.
    await page.click('.hh-wiz-top'); await sleep(150);
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
    await page.evaluate(() => document.querySelector('#hh-act-clear').click()); await sleep(600);

    // Cleared plan → Scenarios Baseline median is '—' (no assets, fmtMoney(0)).
    await page.click('button[data-page="scenarios"]'); await sleep(900);
    const emptyMedian = await page.evaluate(() => document.querySelector('#scn-view .scol__median b')?.textContent.trim() || '');
    if(!/^—$/.test(emptyMedian)) throw new Error(`cleared plan should show an empty Baseline median, got "${emptyMedian}"`);

    // Add $1,000,000 Brokerage (taxable), owned by the client, via the bank
    // form on step 2 (the cleared household lands on step 1).
    await goStep(2);
    await page.click('#hh-view [data-hh-action="open-account-form"][data-owner="client"]'); await sleep(250);
    await page.evaluate(() => {
      const form = document.querySelector('#hh-acct-form');
      const sel = form.querySelector('.hh-form-type');
      sel.value = String([...sel.options].findIndex(o => o.textContent.trim() === 'Brokerage (taxable)'));
      form.querySelector('.hh-form-val').value = '1,000,000';
      form.querySelector('[data-hh-action="save-account"]').click();
    });
    await sleep(400);
    const nwTotal = await page.evaluate(() => document.querySelector('#hh-plan-rail .hh-prail__total')?.textContent.trim() || '');
    if(!/1,000,000/.test(nwTotal)) throw new Error(`added brokerage did not reach the plan-rail net worth: "${nwTotal}"`);

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
    await page.evaluate(() => document.querySelector('#hh-act-demo').click()); await sleep(800);
    await page.evaluate(() => { window.confirm = window.__origConfirm; });
  });

  await step('household edits reach the engine: Scenarios cash-flow responds after Run', async () => {
    // The non-negotiable: editing a Household input through the wizard must
    // write real plan data and change engine outputs. Edit on Household → open
    // Scenarios (re-runs the engine on the dirty plan) → assert the Cash Flow
    // rows changed. (Income is the 3rd cell of a .cf-row: [year, Age, Income, …].)
    const sleep = ms => new Promise(r => setTimeout(r, ms));
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

    // (1) Co-client SS on vs off changes baseline income at age 72 (past both
    // claims). SS lives on wizard step 3 (Income).
    await goStep(3); await setHh('income.socialSecurity.spouse.pia', '18,000');
    await openCashFlow(); const withSpouse = await incomeAtAge(72);
    await goStep(3); await setHh('income.socialSecurity.spouse.pia', '0');
    await openCashFlow(); const withoutSpouse = await incomeAtAge(72);
    if(!withSpouse || !withoutSpouse) throw new Error(`cash-flow income cell missing at age 72 (${withSpouse} vs ${withoutSpouse})`);
    if(withSpouse === withoutSpouse) throw new Error(`co-client SS edit via Household did not change engine income at 72 (${withSpouse} vs ${withoutSpouse})`);

    // (2) Delaying the co-client's retirement pushes the first retirement-phase
    // row later. The household retires when the LAST earner does, so raising the
    // co-client's Retires age extends accumulation and moves the first
    // retirement-phase row later. (Editing the co-client's age is a plan field,
    // not a lever, so it does not disturb the scenario retire-age deltas — unlike
    // editing the PRIMARY retire age, which the reseed re-derives.) Retirement
    // ages live on wizard step 4.
    await goStep(3); await setHh('income.socialSecurity.spouse.pia', '18,000');
    await goStep(4); await setHh('household.spouse.retirementAge', '65');
    await openCashFlow(); const firstEarly = await firstAge();
    await goStep(4); await setHh('household.spouse.retirementAge', '70');
    await openCashFlow(); const firstLate = await firstAge();
    if(firstEarly == null || firstLate == null) throw new Error(`first cash-flow age missing (${firstEarly} vs ${firstLate})`);
    if(!(firstLate > firstEarly)) throw new Error(`delaying co-client retirement via Household did not push retirement later (${firstEarly} -> ${firstLate})`);

    // Restore the demo household and leave Cash Flow closed.
    await goStep(4); await setHh('household.spouse.retirementAge', '65');
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

    // Quadruple living expenses: from demo $48k to $192k — plan should suffer.
    // Essential expenses live on wizard step 4 (Retirement).
    await goStep(4);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      if(!el) throw new Error('expenses.living input missing');
      el.value = '192,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
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

    // Restore expenses to demo value ($48k)
    await goStep(4);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      el.value = '48,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);
  });

  await step('goals renders Life Chapters view (title, cards, rows, composer)', async () => {
    // Contract updated for the shipped Life Chapters view: the Goals tab now
    // renders renderGoalsChapters() -> #gl-chapters (three derived chapter
    // cards + inline row editing + the two-mode goal composer), replacing the
    // retired Horizon (#gl-horizon), whose renderer (renderGoalsHorizon/
    // initGoalsHorizon) has since been removed as dead code; this asserts the
    // CURRENT DOM. The what-if drop mechanism was retired (2026-07-06).
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

  await step('goals: removing a goal from one chapter leaves it in the others', async () => {
    // Regression guard: a recurring goal is stored once but rendered as a slice
    // per chapter. Removing it from ONE chapter must trim only that chapter's
    // slice (splitting the goal if the slice was interior), NOT delete it plan-wide.
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const bandsFor = name => page.evaluate(nm =>
      [...document.querySelectorAll('.glc-row')]
        .filter(r => (r.querySelector('.glc-name')?.textContent || '').trim() === nm)
        .map(r => +r.dataset.band).sort(), name);

    await page.click('.htab[data-sub-target="goals"]'); await sleep(400);
    // Add a full-span recurring goal → renders in all three chapters.
    await page.click('#glc-a-name');
    await page.type('#glc-a-name', 'ChapterSplit');
    await page.click('#glc-a-add');
    await sleep(400);
    let where = await bandsFor('ChapterSplit');
    if(JSON.stringify(where) !== JSON.stringify([0,1,2]))
      throw new Error(`full-span goal should span all 3 chapters, got ${JSON.stringify(where)}`);

    // Open its Chapter II (band 1) row and REMOVE — only that chapter's slice.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.glc-row')]
        .find(r => (r.querySelector('.glc-name')?.textContent||'').trim()==='ChapterSplit' && r.dataset.band==='1');
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await sleep(200);
    await page.click('.glc-ed-remove');
    await sleep(400);

    where = await bandsFor('ChapterSplit');
    if(where.includes(1)) throw new Error(`goal still in Chapter II after per-chapter remove: ${JSON.stringify(where)}`);
    if(!(where.includes(0) && where.includes(2)))
      throw new Error(`per-chapter remove must keep the goal in Chapters I & III: ${JSON.stringify(where)}`);

    // Clean up: remove the remaining single-chapter slices so later steps see
    // only the seed goals. Each remaining slice lives in one chapter, so REMOVE
    // deletes it outright.
    for(let i = 0; i < 3; i++){
      const opened = await page.evaluate(() => {
        const r = [...document.querySelectorAll('.glc-row')]
          .find(r => (r.querySelector('.glc-name')?.textContent||'').trim()==='ChapterSplit');
        if(!r) return false;
        r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        return true;
      });
      if(!opened) break;
      await sleep(200);
      await page.click('.glc-ed-remove');
      await sleep(300);
    }
    const leftover = await bandsFor('ChapterSplit');
    if(leftover.length) throw new Error(`cleanup failed, ChapterSplit slices remain: ${JSON.stringify(leftover)}`);
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
    if(retireAge !== '66') throw new Error(`baseline retirement marker not at age 66 (got "${retireAge}")`);

    // The scenario pills switch which plan's cash flow is shown, and each plan's
    // retirement marker reflects ITS OWN retire age. demoScenarios seeds Baseline
    // at the household retire age (66 here, asserted just above) and Scenario B at
    // +2 years (68), so selecting the Scenario B pill must move the
    // "Retirement begins" marker from 66 to 68.
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
    if(bMarker !== '68') throw new Error(`Scenario B retirement marker not at age 68 (got "${bMarker}")`);
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

  await step('retirement age lever goes inert once the household is already retired', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.evaluate(() => { window.__origConfirm = window.confirm; window.confirm = () => true; });
    const leverNames = () => page.evaluate(() =>
      [...document.querySelectorAll('#scn-view .lever__name')].map(e => e.textContent.trim()));

    // Pre-retirement demo (Client 1 64/retire 66, Client 2 63/retire 65):
    // "Retirement Age" IS an active Scenarios lever.
    await page.click('button[data-page="scenarios"]'); await sleep(700);
    await page.click('#scn-seg-compare'); await sleep(400);
    const beforeNames = await leverNames();
    if(!beforeNames.includes('Retirement Age'))
      throw new Error(`Retirement Age lever should be present while pre-retirement: ${JSON.stringify(beforeNames)}`);

    // Make BOTH principals already retired (retire age below current age).
    const setHh = (p, v) => page.evaluate(({p,v}) => {
      const el = document.querySelector(`#hh-view input[data-path="${p}"]`);
      if(!el) throw new Error('missing household input: ' + p);
      el.value = v; el.dispatchEvent(new Event('change', { bubbles:true }));
    }, {p, v});
    await goStep(4);   // retirement ages live on wizard step 4
    await setHh('household.primary.retirementAge', '60');
    await setHh('household.spouse.retirementAge', '60');
    await sleep(200);

    // Now "Retirement Age" must DROP OUT of the Scenarios levers (it is no longer
    // a decision to pull), while the other levers remain.
    await page.click('button[data-page="scenarios"]'); await sleep(900);
    await page.click('#scn-seg-compare'); await sleep(400);
    const afterNames = await leverNames();
    if(afterNames.includes('Retirement Age'))
      throw new Error(`Retirement Age lever must disappear once already retired: ${JSON.stringify(afterNames)}`);
    if(!afterNames.includes('Allocation'))
      throw new Error(`other levers (Allocation) must remain when retired: ${JSON.stringify(afterNames)}`);

    // Restore the clean demo for the persistence steps that follow. (The Demo
    // button lives in the tucked ⋯ menu, so click it programmatically.)
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-act-demo').click()); await sleep(800);
    await page.evaluate(() => { window.confirm = window.__origConfirm; });
  });

  // ── Multi-household persistence & bootstrapping ────────────────────────────
  // These run LAST (they clear storage and reload) so they can't disturb the
  // demo-coupled steps above. They prove the state-management contract:
  // first-load seeds demo, a new household survives reload without the demo
  // overwriting it, scenario storage is scoped by householdId, and resetting the
  // demo restores ONLY the demo — never a custom household.
  await step('persistence: first load seeds the Demo Household + exposes controls', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1500);
    const s = await page.evaluate(() => ({
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
      active: localStorage.getItem('parallax.activeHouseholdId'),
    }));
    if(!s.db || typeof s.db !== 'object') throw new Error('households store not created on first load');
    if(!s.db.demo) throw new Error('first load did not seed a "demo" household record');
    if(s.active !== 'demo') throw new Error(`active household not "demo" on first load (got "${s.active}")`);
    if(!s.db.demo.meta || s.db.demo.meta.isDemo !== true) throw new Error('seeded demo record missing meta.isDemo=true');
    if(s.db.demo.meta.name !== 'Demo Household') throw new Error(`seeded demo meta.name wrong: "${s.db.demo.meta?.name}"`);
    // Controls present on the Household page (inside the tucked ⋯ menu).
    await page.click('.htab[data-page="household"]'); await sleep(400);
    const ctl = await page.evaluate(() => ({
      switcher: !!document.querySelector('#hh-menu-pop #hh-switch'),
      opts: document.querySelectorAll('#hh-switch option').length,
      newBtn: !!document.querySelector('#hh-menu-pop #hh-new'),
      demoEnabled: !document.querySelector('#hh-act-demo')?.disabled,
    }));
    if(!ctl.switcher) throw new Error('household switcher (#hh-switch) not rendered in the menu');
    if(ctl.opts < 1) throw new Error('household switcher has no options');
    if(!ctl.newBtn) throw new Error('New Household button (#hh-new) not rendered in the menu');
    if(!ctl.demoEnabled) throw new Error('Demo reset button should be enabled while the demo is active');
  });

  await step('persistence: New Household survives reload; demo does not overwrite it', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Persist the demo's scenarios first (so its scoped key exists), then create
    // a new blank household from the menu control (clicked programmatically —
    // it lives in the tucked ⋯ popover).
    await page.click('#save-btn'); await sleep(400);
    await page.evaluate(() => document.querySelector('#hh-new').click()); await sleep(700);
    const created = await page.evaluate(() => ({
      active: localStorage.getItem('parallax.activeHouseholdId'),
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
    }));
    if(!created.active || created.active === 'demo') throw new Error(`New Household did not become active (active="${created.active}")`);
    if(Object.keys(created.db).length !== 2) throw new Error(`expected 2 households after New (got ${Object.keys(created.db).length})`);
    const customId = created.active;
    if(!created.db[customId] || created.db[customId].meta.isDemo !== false) throw new Error('new household record is not marked isDemo=false');
    // Demo reset button must be DISABLED while a custom household is active.
    const demoDisabled = await page.evaluate(() => !!document.querySelector('#hh-act-demo')?.disabled);
    if(!demoDisabled) throw new Error('Demo reset must be disabled when the active household is not the demo');

    // Reload: the custom household must remain active (demo must NOT overwrite it).
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1500);
    const afterReload = await page.evaluate(() => ({
      active: localStorage.getItem('parallax.activeHouseholdId'),
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
    }));
    if(afterReload.active !== customId) throw new Error(`custom household did not survive reload (active="${afterReload.active}", want "${customId}")`);
    if(!afterReload.db.demo) throw new Error('demo record vanished after reload');
    if(afterReload.db[customId].meta.isDemo !== false) throw new Error('custom record overwritten by demo values on reload');
    if(afterReload.db[customId].meta.name !== 'New Household') throw new Error(`custom household name changed on reload: "${afterReload.db[customId].meta.name}"`);
  });

  await step('persistence: scenario localStorage is scoped by householdId', async () => {
    const customId = await page.evaluate(() => localStorage.getItem('parallax.activeHouseholdId'));
    const keys = await page.evaluate(() => Object.keys(localStorage));
    const demoKey   = 'parallax.scenarios.demo.v1';
    const customKey = `parallax.scenarios.${customId}.v1`;
    if(!keys.includes(demoKey)) throw new Error(`demo scenarios not scoped by id (missing ${demoKey}): ${JSON.stringify(keys)}`);
    if(!keys.includes(customKey)) throw new Error(`custom scenarios not scoped by id (missing ${customKey}): ${JSON.stringify(keys)}`);
    if(keys.includes('parallax.scenarios.v2')) throw new Error('legacy global scenario key parallax.scenarios.v2 must not be written');
  });

  await step('persistence: reset demo restores demo only, not custom households', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.evaluate(() => { window.__origConfirm = window.confirm; window.confirm = () => true; });
    const customId = await page.evaluate(() => localStorage.getItem('parallax.activeHouseholdId'));
    // Switch to the demo household via the selector.
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.select('#hh-switch', 'demo'); await sleep(700);
    const activeDemo = await page.evaluate(() => localStorage.getItem('parallax.activeHouseholdId'));
    if(activeDemo !== 'demo') throw new Error(`switching to demo failed (active="${activeDemo}")`);
    // Mutate the demo (living expense — wizard step 4) then reset it.
    await page.click('#hh-step-4'); await sleep(300);
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="expenses.living"]'); el.value = '999,999'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-act-demo').click()); await sleep(800);
    const after = await page.evaluate(() => ({
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
      active: localStorage.getItem('parallax.activeHouseholdId'),
    }));
    // Demo restored to its factory living expense…
    if(after.db.demo.expenses.living !== 48000) throw new Error(`reset demo did not restore living expense (got ${after.db.demo.expenses.living})`);
    // …and the custom household is untouched and still present.
    if(!after.db[customId]) throw new Error('reset demo destroyed the custom household record');
    if(after.db[customId].meta.isDemo !== false) throw new Error('reset demo altered the custom household');
    if(Object.keys(after.db).length !== 2) throw new Error(`reset demo changed household count (got ${Object.keys(after.db).length}, want 2)`);
    await page.evaluate(() => { window.confirm = window.__origConfirm; });
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
