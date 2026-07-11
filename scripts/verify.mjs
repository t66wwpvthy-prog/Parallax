/* Visual verification probe: test, serve the app, drive headless Chromium
   through the real index.html, and write screenshots to ./verify-out/.
   Exit non-zero if anything fails.

   Run: node scripts/verify.mjs */
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readFile, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verify-out');
const PORT = Number(process.env.PORT) || 8765;

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

function jsFilesUnder(dir){
  if(!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes:true }).flatMap(entry => {
    const filePath = join(dir, entry.name);
    if(entry.isDirectory()) return jsFilesUnder(filePath);
    return entry.isFile() && entry.name.endsWith('.js') ? [filePath] : [];
  });
}

function appSource(html){
  const rootModules = readdirSync(ROOT, { withFileTypes:true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => join(ROOT, entry.name));
  const moduleFiles = [
    ...rootModules,
    ...jsFilesUnder(join(ROOT, 'ui')),
    ...jsFilesUnder(join(ROOT, 'src')),
  ];
  return [html, ...moduleFiles.map(file => readFileSync(file, 'utf8'))].join('\n');
}

/* ── Household contract (static source assertions) ──────────────────────────
   Household is the 4-STEP BLUEPRINT WIZARD (People & Timeline → Balance Sheet
   → Cash Flow → Blueprint), an EDITABLE plan-input console. Renderers live in
   ui/householdWizard.js; src/main.js owns wiring, plan factories, and handlers.
   (edits reach the engine) is proved by the browser steps below. */
function verifyHousehold(){
  const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const fails = [];
  const ok = (cond, msg) => { if(!cond) fails.push(msg); };
  const html = read(join(ROOT, 'index.html'));
  const source = appSource(html);
  const css  = read(join(ROOT, 'styles', 'household.css'));
  const mainCss = read(join(ROOT, 'styles', 'main.css'));
// Wizard chrome: 4-step stepper + workspace (no side rail).
  ok(/class="hh-stepper"/.test(html), 'wizard stepper (.hh-stepper) missing');
  [1,2,3,4].forEach(n => ok(new RegExp(`id="hh-step-${n}"`).test(html), `stepper button #hh-step-${n} missing`));
  ok(!/id="hh-plan-rail"/.test(html), 'retired "Plan so far" rail (#hh-plan-rail) must be gone');
  ok(/createHouseholdWizard/.test(source), 'blueprint wizard module (createHouseholdWizard) missing');
  ok(/id="hh-wiz-footer"/.test(html), 'wizard footer mount (#hh-wiz-footer) missing');
  ok(/function hhDefaultStep\b/.test(source), 'hhDefaultStep() landing heuristic missing');
  ok(/data-hh-action="step-back"/.test(source) && /data-hh-action="step-next"/.test(source), 'wizard Back/Continue footer actions missing');
  // Tucked household controls menu (Switch / New / Demo / Clear).
  ok(/id="hh-menu-btn"/.test(html) && /id="hh-menu-pop"/.test(html), 'household controls menu (#hh-menu-btn / #hh-menu-pop) missing');

  // The RETIRED surfaces must be gone: Demographics, the chapter rail, the
  // Net Worth equilibrium and the Cash Flow chapter renderers.
  ok(!/hh-chap-demographics/.test(html) && !/function renderHhDemographics\b/.test(source), 'retired Demographics chapter still present');
  ok(!/hh-chap-networth/.test(html) && !/function renderHhNetWorth\b/.test(source), 'retired Net Worth chapter still present (hh-chap-networth / renderHhNetWorth)');
  ok(!/hh-chap-cashflow/.test(html) && !/function renderHhCashflow\b/.test(source), 'retired Cash Flow chapter still present (hh-chap-cashflow / renderHhCashflow)');
  ok(!/function renderHhBanner\b/.test(source), 'retired Household Basics banner renderer still present (renderHhBanner)');
  ok(!/function renderHhFulcrum\b/.test(source) && !/function renderHhPillar\b/.test(source), 'retired equilibrium renderers still present (fulcrum/pillar)');
  ok(/id=["']hh-view["']/.test(html), 'Household document mount (#hh-view) is missing');
  ok(/data-page=["']household["']/.test(html), 'Household container must carry data-page="household"');
  ok(/HH_WIZARD_ACCOUNT_TYPES/.test(source), 'Wizard account types (HH_WIZARD_ACCOUNT_TYPES) missing');
  ['Traditional IRA','Roth IRA','Brokerage (taxable)','401(k)','HSA'].forEach(t => {
    ok(source.includes(`'${t}'`), `Wizard account types missing: ${t}`);
  });
  ok(!/meta\.inflationPct/.test(source), 'engine-inert Inflation field must not ship in the wizard');
  ok(/\['trust','Trust'\]/.test(source), 'Trust ownership option missing from HH_OWNERS');

  // Blueprint wizard module + step wiring (renderers live in ui/householdWizard.js).
  ok(/ui\/householdWizard\.js/.test(source), 'ui/householdWizard.js import missing');
  ok(/ensureHouseholdWizard/.test(source), 'ensureHouseholdWizard() wiring missing');
  ok(/data-hh-action="goto-planning"/.test(source), 'Continue to planning action missing');
  ok(/data-hh-action="run-blueprint"/.test(source), 'RUN BLUEPRINT action missing');

  // Wizard data additions: addable children (engine-inert context); working
  // income must NOT render as a wizard input. Home/mortgage/pension/annual
  // savings UI are deferred in the blueprint wizard.
  ok(/household\.children/.test(source), 'household.children[] (addable children) missing');
  ok(/data-hh-action="open-add"/.test(source), 'child/income/spending add flow missing');
  ok(!/hhField\('savings\.annual','money'\)/.test(source), 'deferred annual savings field must not render in balance-sheet step');
  ok(!/hhField\('income\.workingIncome'/.test(source), 'working income must not render as a wizard input (engine-inert today)');

  // EDITABLE console: inline data-path inputs + a #hh-view delegate that writes
  // back to `plan` and reseeds/dirties scenarios (parity with the rest of the
  // input layer). This is the non-negotiable — Household must not be static.
  ok(/function hhField\b/.test(source), 'Household inputs helper missing (hhField → renderField data-path controls)');
  ok(/\$\(\s*['"]#hh-view['"]\s*\)\.addEventListener\(\s*['"]change['"]/.test(source), 'Household edit delegate missing (#hh-view change handler)');
  ok(/function hhCommit\b/.test(source), 'Household commit (hhCommit) missing');
  ok(/function\s+hhCommit\b[\s\S]{0,160}reseedScenarios\(\)[\s\S]{0,80}plansDirty\s*=\s*true/.test(source), 'Household edits must reseed + dirty scenarios exactly like the input layer (hhCommit)');
  ok(/function syncHousehold\b/.test(source), 'syncHousehold() renderer missing');

  // no baked sample household
  ok(!/Whitmore/i.test(source), 'Sample household data (Whitmore) must not ship in production');

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
  if(mainCss){
    const leftover = /(^|[\s,{])\.(hh-frame|hh-rail|hh-pillar|hh-fulcrum|hh-fact|hh-acct|hh-flow|hh-chapter)\b/.test(mainCss);
    ok(!leftover, 'A competing Household rule still lives in styles/main.css');
  }

  // ── CP2 additions: reset/clear helpers, new action buttons, new input fields ──
  ok(/function hhResetToDemo\b/.test(source),    'hhResetToDemo helper missing from app source');
  ok(/function hhClearHousehold\b/.test(source), 'hhClearHousehold helper missing from app source');
  ok(/data-hh-action=.add-spouse/.test(source),    'add-spouse action button missing');
  ok(/data-hh-action=.remove-spouse/.test(source), 'remove-spouse action button missing');
  ok(/add-pension-age/.test(source), 'add-pension-age handler missing (pension UI deferred but wiring retained)');
  ok(/id=.hh-act-demo/.test(html),  'Demo rail button (hh-act-demo) missing');
  ok(/id=.hh-act-clear/.test(html), 'Clear rail button (hh-act-clear) missing');

  // ── Multi-household state management: pure factories + records-by-id store ──
  // The app boots with a demo household but supports creating/switching custom
  // households, and demo values must never overwrite a custom household on reload.
  ok(/function createDemoHousehold\b/.test(source),  'createDemoHousehold() factory missing');
  ok(/function createBlankHousehold\b/.test(source), 'createBlankHousehold() factory missing');
  ok(/function hydratePlan\b/.test(source),          'hydratePlan() (in-place plan hydrate) missing');
  ok(/function bootstrapHouseholds\b/.test(source),  'bootstrapHouseholds() (first-load seed + reload hydrate) missing');
  ok(/function newHousehold\b/.test(source),         'newHousehold() action missing');
  ok(/function switchHousehold\b/.test(source),      'switchHousehold() action missing');
  ok(/function hhAlreadyRetired\b/.test(source),     'hhAlreadyRetired() helper missing (retirement age must go inert once retired)');
  ok(/meta\.householdId/.test(source), 'household record must carry meta.householdId');
  ok(/meta\.isDemo/.test(source),      'household record must carry meta.isDemo');
  ok(/meta\.name\s*=/.test(source),    'household record must carry meta.name');
  ok(/['"]parallax\.households\.v1['"]/.test(source),       'households store key (parallax.households.v1) missing');
  ok(/['"]parallax\.activeHouseholdId['"]/.test(source),    'active-household key (parallax.activeHouseholdId) missing');
  // Scenarios must be scoped per household (parallax.scenarios.<id>.v1) so demo
  // and custom scenario sets never collide; the old global key must be gone.
  ok(/['"]parallax\.scenarios\.['"]/.test(source) || /SCEN_PREFIX/.test(source), 'scoped scenario key prefix (parallax.scenarios.) missing');
  ok(!/['"]parallax\.scenarios\.v2['"]/.test(source), 'legacy global scenario key (parallax.scenarios.v2) must be gone');
  // No standalone demo subtab / demo data page — this is state management only.
  ok(!/data-page=["']demo["']/.test(html), 'a separate demo page/subtab must NOT exist (state management, not navigation)');
  // Household selector + New Household controls.
  ok(/id=.hh-switch/.test(html), 'household switcher (#hh-switch) missing');
  ok(/id=.hh-new/.test(html),    'New Household button (#hh-new) missing');
  ok(/meta\.filingStatus/.test(source), 'Filing status field (meta.filingStatus) missing from Household');
  // NO basis input: the taxable cost-basis % is an engine default now, never an
  // advisor-facing wizard field.
  ok(!/hhField\('portfolio\.accounts\.taxable\.basisPct'/.test(source), 'taxable cost-basis input must NOT ship in the wizard');
  ok(/colaPct/.test(source), 'Pension colaPct must remain in plan factories (UI deferred)');

  // index.html must stay markup-only — no inline app JS or stale household imports.
  ok(!/<script(?![^>]*type=["']module["'])[^>]*>/.test(html.replace(/<script[^>]*src=[^>]*><\/script>/gi, '')), 'inline app script blocks must not ship in index.html');
  ok(!/import.*ui\/household\.js/.test(html), 'stale ui/household.js import in index.html');
  ok(!/ensureHouseholdNetWorthView/.test(html), 'stale ensureHouseholdNetWorthView in index.html');

  // main.css: retired .hh-bar / .hh-f selectors must be gone (comments excluded)
  if(mainCss){
    const mainCode = mainCss.replace(/\/\*[\s\S]*?\*\//g, '');
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
  console.log('  OK household contract (4-step blueprint wizard: stepper + module renderers, account-type bank, data-path write-back, reseed-on-edit, scoped CSS)');
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

  await step('household wizard: stepper + landing + all four steps render from plan', async () => {
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
      gauge: !!document.querySelector('#hh-view .hh-bp-gauge'),
      menuBtn: !!document.querySelector('#hh-menu-btn'),
      coClientText: /co-client|&/i.test(document.querySelector('.page[data-page="household"]')?.textContent || ''),
    }));
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Sequencing'];
    if(JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) throw new Error(`main nav mismatch: ${JSON.stringify(m.nav)}`);
    if(m.hasSubnav) throw new Error('old net-worth subnav is still rendered');
    if(!m.wizard) throw new Error('household wizard frame (.hh-wizard) missing');
    if(JSON.stringify(m.steps) !== JSON.stringify(['People & Timeline','Balance Sheet','Cash Flow','Blueprint'])) throw new Error(`stepper mismatch: ${JSON.stringify(m.steps)}`);
    if(m.current !== '4') throw new Error(`filled demo household must land on Blueprint (step 4), got "${m.current}"`);
    if(m.chapButtons) throw new Error('retired chapter rail buttons still rendered');
    if(!m.railName) throw new Error('household name not filled from plan');
    if(!m.gauge) throw new Error('Blueprint arc gauge missing on landing step');
    if(!m.menuBtn) throw new Error('household controls menu button missing');
    if(!m.coClientText) throw new Error('visible Household UI must show co-client (label or joint name)');

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

    const bp = await page.evaluate(() => ({
      controls: document.querySelectorAll('#hh-view input, #hh-view select').length,
      gaugeVal: document.querySelector('#hh-view .hh-bp-gauge__v')?.textContent.trim() || '',
      runBtn: !!document.querySelector('#hh-view [data-hh-action="run-blueprint"]'),
    }));
    if(bp.controls !== 0) throw new Error(`Blueprint must be read-only, found ${bp.controls} controls`);
    if(!/\$[\d.,MK]/.test(bp.gaugeVal)) throw new Error(`Blueprint gauge net worth not formatted: "${bp.gaugeVal}"`);
    if(!bp.runBtn) throw new Error('RUN BLUEPRINT button missing');
    await page.screenshot({ path: join(OUT, '01-household.png'), fullPage: true });

    // Step 1 · Household: names, Born (drives age), filing, state, addable children.
    await page.click('#hh-step-1'); await new Promise(r => setTimeout(r, 350));
    const s1 = await page.evaluate(() => ({
      nameInputs: document.querySelectorAll('#hh-view input[data-path="meta.primaryName"], #hh-view input[data-path="meta.spouseName"]').length,
      bornInputs: document.querySelectorAll('#hh-view input[data-type="birthYear"]').length,
      filing: !!document.querySelector('#hh-view select[data-path="meta.filingStatus"]'),
      stateSel: !!document.querySelector('#hh-view select[data-path="meta.state"]'),
      coClientText: /co-client/i.test(document.querySelector('#hh-view')?.textContent || ''),
      addChild: !!document.querySelector('#hh-view [data-hh-action="open-add"][data-add-key="child"]'),
      back: !!document.querySelector('#hh-wiz-footer [data-hh-action="step-back"]'),
      next: !!document.querySelector('#hh-wiz-footer [data-hh-action="step-next"]'),
    }));
    if(s1.nameInputs !== 2) throw new Error(`step 1 name inputs: want 2, got ${s1.nameInputs}`);
    if(s1.bornInputs < 2) throw new Error(`step 1 Born inputs missing, got ${s1.bornInputs}`);
    if(!s1.filing) throw new Error('Filing dropdown missing');
    if(!s1.stateSel) throw new Error('State dropdown missing');
    if(!s1.coClientText) throw new Error('step 1 does not say co-client');
    if(!s1.addChild) throw new Error('"+ Add child" missing');
    if(s1.back) throw new Error('Back button must not render on step 1');
    if(!s1.next) throw new Error('Continue button missing on step 1');

    // Children: add a row, confirm its inputs, remove it again.
    await page.click('#hh-view [data-hh-action="open-add"][data-add-key="child"]'); await new Promise(r => setTimeout(r, 350));
    await page.click('#hh-view [data-hh-action="commit-add"]'); await new Promise(r => setTimeout(r, 350));
    const kid = await page.evaluate(() => ({
      row: /Child/.test(document.querySelector('#hh-view')?.textContent || ''),
    }));
    if(!kid.row) throw new Error('added child row did not render');

    // Continue → step 2 (footer nav drives the stepper).
    await page.click('#hh-wiz-footer [data-hh-action="step-next"]'); await new Promise(r => setTimeout(r, 350));
    const onStep2 = await page.evaluate(() => document.querySelector('.hh-stepper .hh-step.is-current')?.dataset.step);
    if(onStep2 !== '2') throw new Error(`Continue did not advance to step 2 (got ${onStep2})`);

    // Step 2 · Balance Sheet: two-column layout per handoff spec.
    const s2 = await page.evaluate(() => ({
      acctInputs: document.querySelectorAll('#hh-view input[data-path^="portfolio.extraAccounts."][data-path$=".balance"]').length,
      addAccountBtns: document.querySelectorAll('#hh-view [data-hh-action="open-account-form"]').length,
      grandTotal: document.querySelector('#hh-view .hh-grand-total__v')?.textContent.trim() || '',
    }));
    if(s2.acctInputs < 3) throw new Error(`typed account balances must be editable, got ${s2.acctInputs}`);
    if(s2.addAccountBtns < 2) throw new Error(`"+ Add account" buttons missing, got ${s2.addAccountBtns}`);
    if(!/\$[\d,]/.test(s2.grandTotal)) throw new Error(`grand total not formatted: "${s2.grandTotal}"`);
    if(!/\$2,800,000/.test(s2.grandTotal)) throw new Error(`demo grand total must be $2,800,000, got "${s2.grandTotal}"`);

    await page.click('#hh-view [data-hh-action="open-account-form"][data-owner="client"]');
    await new Promise(r => setTimeout(r, 300));
    const before = await page.evaluate(() => document.querySelectorAll('#hh-view input[data-path^="portfolio.extraAccounts."][data-path$=".balance"]').length);
    await page.evaluate(() => {
      const f = document.querySelector('#hh-acct-form');
      const typeSel = f.querySelector('.hh-form-type');
      typeSel.value = String([...typeSel.options].findIndex(o => o.textContent.trim() === 'Brokerage (taxable)'));
      f.querySelector('.hh-form-val').value = '50,000';
      f.querySelector('[data-hh-action="save-account"]').click();
    });
    await new Promise(r => setTimeout(r, 400));
    const added = await page.evaluate(() => document.querySelectorAll('#hh-view input[data-path^="portfolio.extraAccounts."][data-path$=".balance"]').length);
    if(added !== before + 1) throw new Error(`saving the account did not add a row (${before} -> ${added})`);

    await page.click('#hh-step-3'); await new Promise(r => setTimeout(r, 350));
    const s3 = await page.evaluate(() => ({
      pia: document.querySelectorAll('#hh-view input[data-path^="income.socialSecurity."][data-path$=".pia"]').length,
      living: !!document.querySelector('#hh-view input[data-path="expenses.living"]'),
      health: !!document.querySelector('#hh-view input[data-path="expenses.healthcare"]'),
      addIncome: !!document.querySelector('#hh-view [data-hh-action="open-add"][data-add-key="income"]'),
      goals: document.querySelectorAll('#hh-view [data-rmpath^="goals."]').length,
      working: !!document.querySelector('#hh-view input[data-path="income.workingIncome"]'),
      incomeHdr: document.querySelector('#hh-view .hh-col .hh-col__sum')?.textContent.trim() || '',
    }));
    if(s3.pia < 1) throw new Error(`SS benefit inputs missing, got ${s3.pia}`);
    if(!s3.living || !s3.health) throw new Error('core spending inputs missing from cash flow step');
    if(!s3.addIncome) throw new Error('"+ Add income" missing');
    if(s3.goals < 1) throw new Error('demo goals should render in cash flow step');
    if(s3.working) throw new Error('working income input must not render in the wizard');
    if(!/\$180,000/.test(s3.incomeHdr)) throw new Error(`cash flow income total must be working income only ($180,000), got "${s3.incomeHdr}"`);

    await page.click('#hh-step-4'); await new Promise(r => setTimeout(r, 350));
    const s4 = await page.evaluate(() => ({
      gauge: !!document.querySelector('#hh-view .hh-bp-gauge'),
      run: !!document.querySelector('#hh-view [data-hh-action="run-blueprint"]'),
      footNote: document.querySelector('#hh-wiz-footer .hh-wiz-foot-note')?.textContent.trim() || '',
      incomeVal: document.querySelector('#hh-view .hh-bp-flow__row:first-child .hh-bp-flow__val')?.textContent.trim() || '',
      ssRow: [...document.querySelectorAll('#hh-view .hh-bp-flow__row')].some(row =>
        /^Social Security$/i.test(row.querySelector('.hh-bp-flow__label')?.textContent.trim() || '')),
      ssVal: [...document.querySelectorAll('#hh-view .hh-bp-flow__row')].find(row =>
        /^Social Security$/i.test(row.querySelector('.hh-bp-flow__label')?.textContent.trim() || ''))
        ?.querySelector('.hh-bp-flow__val')?.textContent.trim() || '',
      allocLegend: document.querySelectorAll('#hh-view .hh-bp-alloc').length,
      gaugeLabel: document.querySelector('#hh-view .hh-bp-gauge__k')?.textContent.trim() || '',
    }));
    if(!s4.gauge) throw new Error('Blueprint gauge missing on step 4');
    if(!s4.run) throw new Error('RUN BLUEPRINT missing');
    if(s4.footNote !== 'Step 4 of 4') throw new Error(`footer note mismatch: "${s4.footNote}"`);
    if(!/\$180,000/.test(s4.incomeVal)) throw new Error(`Blueprint income must show working income, got "${s4.incomeVal}"`);
    if(!s4.ssRow) throw new Error('Blueprint must show a separate Social Security row');
    if(!/\$62,000/.test(s4.ssVal)) throw new Error(`Blueprint Social Security must total $62,000, got "${s4.ssVal}"`);
    if(s4.allocLegend < 3) throw new Error(`Blueprint account legend must list demo accounts, got ${s4.allocLegend}`);
    if(s4.gaugeLabel !== 'NET WORTH') throw new Error(`gauge label must read NET WORTH, got "${s4.gaugeLabel}"`);
  });

  await step('type floor: wizard values >= 16px; tracked labels may use micro type', async () => {
    // Inside .hh-wizard: running values, inputs, and buttons stay >= 16px.
    // Tracked uppercase micro-labels (9–13px) are allowed — decorative hierarchy only.
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(400);
    const offenders = [];
    for(const n of [1,2,3,4]){
      await page.click('#hh-step-'+n); await sleep(350);
      if(n === 2){
        await page.click('#hh-view [data-hh-action="open-account-form"][data-owner="client"]');
        await sleep(250);
      }
      const found = await page.evaluate(() => {
        const MICRO = new Set([
          'hh-wiz-id__eyebrow','hh-wiz-id__filing','hh-step__label','hh-step__num','hh-col__role','hh-kv__k',
          'hh-meta__k','hh-subhead','hh-tl__labels','hh-link-btn','hh-inline-form__k',
          'hh-grand-total__k','hh-grand-total__sub','hh-bp-eyebrow','hh-bp-filing',
          'hh-bp-facts__k','hh-bp-flow__label','hh-bp-flow__sub','hh-bp-gauge__k','hh-bp-gauge__sub',
          'hh-bp-alloc__pct','hh-bp-alloc__name','hh-wiz-foot-note','hh-bp-cta--run','hh-bp-cta--done',
          'hh-bp-cta__chip','hh-bp-cta__status','hh-bp-cta__sep','hh-bp-cta__link',
          'hh-empty','hh-future-row__note','hh-future-row__name','hh-ledger-row__name',
          'hh-dash-btn','hh-text-add','pre','hh-av','hh-avatar',
        ]);
        const allowMicro = el => {
          const inWizard = el.closest('.hh-wizard');
          const inChrome = el.closest('.hh-wiz-top') || el.closest('.hh-wiz-footer');
          if(!inWizard && !inChrome) return false;
          const classes = (el.className || '').toString().split(/\s+/).filter(Boolean);
          if(classes.some(c => MICRO.has(c))) return true;
          if(el.closest('.hh-wiz-footer') && classes.includes('hh-btn')) return true;
          return !!el.closest('.hh-tl__labels');
        };
        const bad = [];
        document.querySelectorAll('.page[data-page="household"] *').forEach(el => {
          if(el.tagName === 'OPTION') return;
          if(!el.offsetParent) return;
          const hasText = [...el.childNodes].some(nd => nd.nodeType === 3 && nd.textContent.trim());
          if(!hasText && el.tagName !== 'INPUT') return;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if(fs >= 15.9) return;
          if(allowMicro(el)) return;
          const cls = (el.className || '').toString().split(' ')[0];
          bad.push(`${el.tagName.toLowerCase()}${cls ? '.'+cls : ''} ${fs.toFixed(1)}px "${(el.value || el.textContent || '').trim().slice(0, 24)}"`);
        });
        return bad;
      });
      found.forEach(f => offenders.push(`step ${n}: ${f}`));
      if(n === 2){
        await page.evaluate(() => document.querySelector('[data-hh-action="cancel-account"]')?.click());
        await sleep(200);
      }
    }
    if(offenders.length) throw new Error('text below the 16px floor (outside micro-label allowlist):\n  ' + [...new Set(offenders)].slice(0, 15).join('\n  '));
  });

  await step('household inline edits write back to plan + live totals update', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await goStep(2);
    const totalBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-grand-total__v')?.textContent.trim());
    const edit = await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path^="portfolio.extraAccounts."][data-path$=".balance"]');
      if(!el) return { ok: false, reason: 'no editable account balance input on step 2' };
      const n = parseFloat(String(el.value).replace(/[^0-9.]/g, '')) || 0;
      el.value = String(n + 100000);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, path: el.dataset.path };
    });
    if(!edit.ok) throw new Error(edit.reason);
    await sleep(300);
    const after = await page.evaluate(() => ({ total: document.querySelector('#hh-view .hh-grand-total__v')?.textContent.trim(), status: document.querySelector('#status')?.textContent }));
    if(after.total === totalBefore) throw new Error(`editing an account balance did not update the balance-sheet total (${totalBefore})`);
    if(!/Plan edited/.test(after.status||'')) throw new Error('account edit did not mark the plan dirty (status)');
    // Cash flow: editing living expenses updates the spending column total.
    await goStep(3);
    const spendBefore = await page.evaluate(() => document.querySelectorAll('#hh-view .hh-cols--gap .hh-col')[1]?.querySelector('.hh-col__sum')?.textContent.trim());
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="expenses.living"]'); el.value = '99,999'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const spendAfter = await page.evaluate(() => document.querySelectorAll('#hh-view .hh-cols--gap .hh-col')[1]?.querySelector('.hh-col__sum')?.textContent.trim());
    if(spendBefore === spendAfter) throw new Error(`editing living expenses did not update the spending total (${spendBefore})`);
    // Restore demo via Demo menu (prior wizard steps mutate the plan).
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => { window.__origConfirm = window.confirm; window.confirm = () => true; });
    await page.click('#hh-menu-btn'); await sleep(200);
    await page.evaluate(() => document.querySelector('#hh-act-demo').click()); await sleep(500);
    await page.evaluate(() => { window.confirm = window.__origConfirm; });
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
    // retirement ages live on step 1 in the blueprint wizard.
    await goStep(1);
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
    if(afterDemo.step !== '4') throw new Error(`restored demo must land on the Blueprint (step 4), got "${afterDemo.step}"`);

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
    if(/\$|\d/.test(emptyMedian)) throw new Error(`cleared plan should show an empty Baseline median, got "${emptyMedian}"`);

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
    const nwTotal = await page.evaluate(() => document.querySelector('#hh-view .hh-grand-total__v')?.textContent.trim() || '');
    if(!/1,000,000/.test(nwTotal)) throw new Error(`added brokerage did not reach the balance-sheet total: "${nwTotal}"`);

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
    const firstRetAge = () => page.evaluate(() => {
      const marked = [...document.querySelectorAll('#scn-view .cf-row')].find(r => r.querySelector('.cf-row__mark-dot--ret'));
      if(marked){
        const age = parseInt(marked.querySelector('.cf-cell--age')?.textContent.trim() || '', 10);
        if(Number.isFinite(age)) return age;
      }
      const ages = [...document.querySelectorAll('#scn-view .cf-row .cf-cell--age')].map(e => parseInt(e.textContent.trim(),10)).filter(Number.isFinite);
      return ages.length ? Math.min(...ages) : null;
    });

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
    // ages live on wizard step 1 (People & Timeline).
    await goStep(3); await setHh('income.socialSecurity.spouse.pia', '18,000');
    await goStep(1); await setHh('household.spouse.retirementAge', '65');
    await openCashFlow(); const firstEarly = await firstRetAge();
    await goStep(1); await setHh('household.spouse.retirementAge', '70');
    await openCashFlow(); const firstLate = await firstRetAge();
    if(firstEarly == null || firstLate == null) throw new Error(`first cash-flow age missing (${firstEarly} vs ${firstLate})`);
    if(!(firstLate > firstEarly)) throw new Error(`delaying co-client retirement via Household did not push retirement later (${firstEarly} -> ${firstLate})`);

    // Restore the demo household and leave Cash Flow closed.
    await goStep(1); await setHh('household.spouse.retirementAge', '65');
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

    // Quadruple living expenses: from demo $38k to $152k — plan should suffer.
    // Essential expenses live on wizard step 3 (Cash Flow).
    await goStep(3);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      if(!el) throw new Error('expenses.living input missing');
      el.value = '152,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
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

    // Restore expenses to demo value ($38k)
    await goStep(3);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      el.value = '38,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);
  });

    await step('goals renders the Ledger view (title, columns, rows, adds, footer)', async () => {
    // Contract for the Goals Ledger: one always-editable sheet over flat
    // plan.goals (one goal = one row), replacing the retired Life Chapters
    // view (chapter cards + composers + inline editors — all removed).
    // Chapters survive as UI-only derivations: per-row range chips and a
    // one-line footer of per-chapter input sums. Demo household resolves
    // retirement 66 -> plan end 95, so derived chapters are 66-75/76-85/86-95.
    await page.click('.htab[data-sub-target="goals"]');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const led = document.querySelector('#gl-ledger');
      const text = (led?.textContent || '').replace(/\s+/g, ' ').trim();
      const px = sel => {
        const el = document.querySelector(sel);
        return el ? parseFloat(getComputedStyle(el).fontSize) : null;
      };
      return {
        ledger: !!led,
        title: /Lifestyle Goals/.test(text),
        caps: [...document.querySelectorAll('.glx-cap')].map(el => el.textContent.trim()),
        rows: document.querySelectorAll('.glx-row').length,
        names: [...document.querySelectorAll('.glx-name')].map(el => el.value),
        chipsPerRow: document.querySelector('.glx-row') ?
          document.querySelector('.glx-row').querySelectorAll('.glx-chip').length : 0,
        segs: document.querySelectorAll('.glx-row .glx-seg').length,
        quickAdds: document.querySelectorAll('.glx-qa').length,
        footer: (document.querySelector('.glx-footer')?.textContent || '').replace(/\s+/g, ' '),
        composersGone: !document.querySelector('.glc-csw, #glc-composer-a, #glc-composer-b, .glc-ed, .glc-card'),
        travelChips: (() => {
          const row = [...document.querySelectorAll('.glx-row')]
            .find(r => (r.querySelector('.glx-name')?.value || '').includes('Travel'));
          return row ? [...row.querySelectorAll('.glx-chip')].map(c =>
            c.classList.contains('glx-chip--on') ? 'on' :
            c.classList.contains('glx-chip--part') ? 'part' : 'off').join(',') : '';
        })(),
        fontFloor: Math.min(...['.glx-cap', '.glx-name', '.glx-amt', '.glx-row .glx-seg',
          '.glx-chip', '.glx-ain', '.glx-f-lbl', '.glx-f-note'].map(px).filter(v => v != null)),
        textLen: text.length,
      };
    });
    if(!m.ledger) throw new Error('Goals Ledger (#gl-ledger) did not render');
    if(!m.title) throw new Error('Goals title "Lifestyle Goals" missing from rendered view');
    if(!m.composersGone) throw new Error('retired Life Chapters DOM (composer/cards/editor) still renders');
    const wantCaps = ['GOAL','AMOUNT','HOW OFTEN','WHICH YEARS'];
    if(!wantCaps.every(c => m.caps.includes(c)))
      throw new Error(`ledger column captions wrong: ${JSON.stringify(m.caps)}`);
    if(m.rows < 1) throw new Error(`expected the demo goal row, got ${m.rows}`);
    if(!m.names.some(n => n.includes('Travel'))) throw new Error('demo goal name missing from name inputs');
    if(m.chipsPerRow !== 3) throw new Error(`expected 3 chapter chips per recurring row, got ${m.chipsPerRow}`);
    if(m.segs < m.rows * 2) throw new Error('cadence segments missing from rows');
    if(m.quickAdds !== 4) throw new Error(`expected 4 quick adds, got ${m.quickAdds}`);
    if(!/I \u00b7 66\u201375/.test(m.footer) || !/II \u00b7 76\u201385/.test(m.footer) || !/III \u00b7 86\u201395/.test(m.footer))
      throw new Error(`footer chapters not derived 66-75/76-85/86-95: "${m.footer}"`);
    if(!/Lifetime/.test(m.footer) || !/sum of entered goals/.test(m.footer))
      throw new Error(`footer must label sums honestly: "${m.footer}"`);
    if(m.travelChips !== 'on,part,off')
      throw new Error(`Travel & leisure 66\u201381 chips should be on,part,off \u2014 got "${m.travelChips}"`);
    if(m.fontFloor < 16) throw new Error(`ledger type floor broken: ${m.fontFloor}px < 16px`);
    if(m.textLen < 40) throw new Error(`Goals page appears blank (textLen=${m.textLen})`);
    await page.screenshot({ path: join(OUT, '02-goals.png'), fullPage: true });
  });

  await step('goals Ledger: add, type-through, steppers, cadence, chips, age boxes, delete', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-sub-target="goals"]');
    await sleep(350);
    const rowCount = () => page.evaluate(() => document.querySelectorAll('.glx-row').length);
    const rowVal = (gi, sel) => page.evaluate(({g, s}) =>
      document.querySelector(`${s}[data-i="${g}"]`)?.value ?? null, {g: gi, s: sel});
    const n0 = await rowCount();

    // 1) + Add a goal -> one new flat record, flashgold, name focused+selected
    await page.click('#glx-add');
    await sleep(400);
    const gi = n0;   // appended at the end of plan.goals
    let m = await page.evaluate(g => ({
      rows: document.querySelectorAll('.glx-row').length,
      flash: document.querySelectorAll('.glx-row--flash').length,
      name: document.querySelector(`.glx-name[data-i="${g}"]`)?.value,
      focused: document.activeElement?.classList.contains('glx-name'),
      status: document.querySelector('#status')?.textContent || '',
    }), gi);
    if(m.rows !== n0 + 1) throw new Error(`+ Add a goal did not append a row (${n0} -> ${m.rows})`);
    if(m.flash < 1) throw new Error('newly added row did not flash');
    if(m.name !== 'New goal') throw new Error(`new row name wrong: "${m.name}"`);
    if(!m.focused) throw new Error('new row name field not focused after add');
    if(!/Plan edited/.test(m.status)) throw new Error(`add did not arm the plan-edited status ("${m.status}")`);

    // 2) typing the name replaces the selected seed text and never re-renders
    await page.keyboard.type('Boat fund');
    await sleep(150);
    m = await page.evaluate(g => ({
      name: document.querySelector(`.glx-name[data-i="${g}"]`)?.value,
      stillFocused: document.activeElement?.classList.contains('glx-name'),
    }), gi);
    if(m.name !== 'Boat fund') throw new Error(`typed name did not write through ("${m.name}")`);
    if(!m.stillFocused) throw new Error('name typing lost focus (row re-rendered mid-keystroke)');

    // 3) amount typing: live commas, footer repaints, focus survives.
    // ($900k/yr so the compact Lifetime figure visibly moves — $3.1M -> $12M.)
    const lifeBefore = await page.evaluate(() => document.querySelector('#glx-life')?.textContent);
    await page.click(`.glx-amt[data-i="${gi}"]`);
    await page.evaluate(g => {
      const el = document.querySelector(`.glx-amt[data-i="${g}"]`);
      el.value = '900000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, gi);
    await sleep(150);
    m = await page.evaluate(g => ({
      amt: document.querySelector(`.glx-amt[data-i="${g}"]`)?.value,
      focused: document.activeElement?.classList.contains('glx-amt'),
      life: document.querySelector('#glx-life')?.textContent,
    }), gi);
    if(m.amt !== '900,000') throw new Error(`amount live-commas failed ("${m.amt}")`);
    if(!m.focused) throw new Error('amount typing lost focus (row re-rendered mid-keystroke)');
    if(m.life === lifeBefore) throw new Error('footer Lifetime sum did not repaint on amount typing');

    // 4) recurring stepper is +-$1,000
    await page.click(`.glx-step[data-act="plus"][data-i="${gi}"]`);
    await sleep(300);
    if(await rowVal(gi, '.glx-amt') !== '901,000')
      throw new Error('recurring + stepper did not add $1,000');

    // 5) cadence -> One-time: endAge=startAge, "at age" control, +-$5,000 stepper
    await page.click(`.glx-seg[data-act="cad-once"][data-i="${gi}"]`);
    await sleep(300);
    m = await page.evaluate(g => {
      const row = document.querySelector(`.glx-row[data-row="${g}"]`);
      return {
        onceVisible: !row.querySelector('.glx-agewrap').hidden,
        yrHidden: row.querySelector('.glx-when').hidden,
        age: row.querySelector('.glx-ageval')?.textContent,
      };
    }, gi);
    if(!m.onceVisible || !m.yrHidden) throw new Error('cadence -> One-time did not switch the which-years control');
    if(m.age !== '66') throw new Error(`one-time age should collapse to startAge 66, got ${m.age}`);
    await page.click(`.glx-step[data-act="plus"][data-i="${gi}"]`);
    await sleep(300);
    if(await rowVal(gi, '.glx-amt') !== '906,000')
      throw new Error('one-time + stepper did not add $5,000');
    await page.click(`.glx-step--sm[data-act="age-plus"][data-i="${gi}"]`);
    await sleep(300);
    m = await page.evaluate(g =>
      document.querySelector(`.glx-row[data-row="${g}"] .glx-ageval`)?.textContent, gi);
    if(m !== '67') throw new Error(`one-time age + did not step to 67 (got ${m})`);

    // 6) cadence -> Every year restores a real span (start+9, plan-end capped)
    await page.click(`.glx-seg[data-act="cad-yr"][data-i="${gi}"]`);
    await sleep(300);
    if(await rowVal(gi, '.glx-ain[data-t="s"]') !== '67' || await rowVal(gi, '.glx-ain[data-t="e"]') !== '76')
      throw new Error('cadence -> Every year did not restore a 67-76 span');

    // 7) chips set contiguous ranges over the derived chapters
    await page.click(`.glx-chip[data-ch="0"][data-i="${gi}"]`);   // no full chapters lit -> I
    await sleep(300);
    if(await rowVal(gi, '.glx-ain[data-t="s"]') !== '66' || await rowVal(gi, '.glx-ain[data-t="e"]') !== '75')
      throw new Error('chip I did not set 66-75');
    await page.click(`.glx-chip[data-ch="1"][data-i="${gi}"]`);   // I+II -> 66-85
    await sleep(300);
    if(await rowVal(gi, '.glx-ain[data-t="e"]') !== '85')
      throw new Error('chip II did not extend the range to 85');
    await page.click(`.glx-chip[data-ch="0"][data-i="${gi}"]`);   // drop I -> 76-85
    await sleep(300);
    if(await rowVal(gi, '.glx-ain[data-t="s"]') !== '76')
      throw new Error('unlighting chip I did not trim the range to 76-85');

    // 8) exact age boxes clamp to the resolved span and hold start <= end
    const setAge = (t, v) => page.evaluate(({g, tt, vv}) => {
      const el = document.querySelector(`.glx-ain[data-t="${tt}"][data-i="${g}"]`);
      el.value = vv;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, {g: gi, tt: t, vv: v});
    await setAge('s', '60'); await sleep(300);
    if(await rowVal(gi, '.glx-ain[data-t="s"]') !== '66')
      throw new Error('start age 60 did not clamp to retirement (66)');
    await setAge('e', '99'); await sleep(300);
    if(await rowVal(gi, '.glx-ain[data-t="e"]') !== '95')
      throw new Error('end age 99 did not clamp to plan end (95)');

    // 9) delete floats the row away and the store shrinks with it
    await page.click(`.glx-del[data-i="${gi}"]`);
    await sleep(300);
    m = await page.evaluate(() => ({
      rows: document.querySelectorAll('.glx-row').length,
      gone: ![...document.querySelectorAll('.glx-name')].some(el => el.value === 'Boat fund'),
    }));
    if(m.rows !== n0) throw new Error(`delete did not remove the row (${m.rows} rows, want ${n0})`);
    if(!m.gone) throw new Error('deleted goal still renders');
  });

  await step('goals Ledger: quick adds derive ages from the plan and reach Scenarios', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const goalPillCount = async () => {
      await page.click('button[data-page="scenarios"]'); await sleep(900);
      await page.click('#scn-seg-compare'); await sleep(400);
      const t = await page.evaluate(() =>
        document.querySelector('#scn-view .goal-pill, #scn-view .goal-note')?.textContent || '');
      const m = t.match(/(\d+)\s*active/);
      return m ? +m[1] : null;
    };

    // Baseline scenario goal count with the demo goal.
    const before = await goalPillCount();
    if(before == null) throw new Error('Scenarios goal pill missing (precondition)');

    // Quick add Travel: ages derive from the resolved demo plan (66-95).
    await page.click('.htab[data-sub-target="goals"]'); await sleep(400);
    const n0 = await page.evaluate(() => document.querySelectorAll('.glx-row').length);
    await page.click('.glx-qa[data-q="0"]');
    await sleep(400);
    const m = await page.evaluate(g => {
      const row = document.querySelector(`.glx-row[data-row="${g}"]`);
      return row ? {
        name: row.querySelector('.glx-name')?.value,
        amt: row.querySelector('.glx-amt')?.value,
        s: row.querySelector('.glx-ain[data-t="s"]')?.value,
        e: row.querySelector('.glx-ain[data-t="e"]')?.value,
        chips: [...row.querySelectorAll('.glx-chip')].every(c => c.classList.contains('glx-chip--on')),
      } : null;
    }, n0);
    if(!m) throw new Error('quick add did not append a row');
    if(m.name !== 'Travel' || m.amt !== '12,000') throw new Error(`Travel quick add wrong (${m.name} / ${m.amt})`);
    if(m.s !== '66' || m.e !== '95') throw new Error(`Travel ages must derive 66-95 from the plan, got ${m.s}-${m.e}`);
    if(!m.chips) throw new Error('full-span quick add should light all three chapter chips');

    // The new goal flows to the planning surface: Scenarios sees one more active goal.
    const after = await goalPillCount();
    if(after !== before + 1)
      throw new Error(`quick-added goal did not reach Scenarios (${before} -> ${after} active)`);

    // Cleanup: delete the Travel row; Scenarios returns to the seed count.
    await page.click('.htab[data-sub-target="goals"]'); await sleep(400);
    await page.click(`.glx-del[data-i="${n0}"]`); await sleep(300);

    // Blank household: clean first-run sheet — no rows, no column headers, no
    // helper copy; quick adds stay as the entry point and derive from THIS
    // plan (blank household resolves 65->90, so Home improvements = 65-80).
    await page.evaluate(() => { window.__origConfirm = window.confirm; window.confirm = () => true; });
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.click('#hh-menu-btn'); await sleep(200);
    await page.click('#hh-act-clear'); await sleep(600);
    await page.click('.htab[data-sub-target="goals"]'); await sleep(400);
    let b = await page.evaluate(() => ({
      rows: document.querySelectorAll('.glx-row').length,
      colsHidden: (document.querySelector('.glx-cols')?.style.display || '') === 'none',
      adds: !!document.querySelector('#glx-add'),
      quickAdds: document.querySelectorAll('.glx-qa').length,
      noCoaching: !/Every plan starts|Add one below/.test(document.querySelector('#gl-ledger')?.textContent || ''),
    }));
    if(b.rows !== 0) throw new Error(`blank household should show zero rows, got ${b.rows}`);
    if(!b.colsHidden) throw new Error('blank state should hide the column captions');
    if(!b.adds || b.quickAdds !== 4) throw new Error('blank state must keep the add line as the entry point');
    if(!b.noCoaching) throw new Error('helper/guiding copy leaked into the blank state');
    await page.click('.glx-qa[data-q="1"]');   // Home improvements
    await sleep(400);
    b = await page.evaluate(() => {
      const row = document.querySelector('.glx-row[data-row="0"]');
      return row ? {
        headers: (document.querySelector('.glx-cols')?.style.display || '') !== 'none',
        s: row.querySelector('.glx-ain[data-t="s"]')?.value,
        e: row.querySelector('.glx-ain[data-t="e"]')?.value,
      } : null;
    });
    if(!b) throw new Error('first quick add on a blank household did not create a row');
    if(!b.headers) throw new Error('first row should reveal the column captions');
    if(b.s !== '65' || b.e !== '80')
      throw new Error(`blank-household quick add must derive 65-80 from ITS plan, got ${b.s}-${b.e}`);

    // Restore the demo household for the steps that follow.
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-act-demo').click()); await sleep(800);
    await page.evaluate(() => { window.confirm = window.__origConfirm; });
    await page.click('.htab[data-sub-target="goals"]'); await sleep(400);
    const restored = await page.evaluate(() =>
      [...document.querySelectorAll('.glx-name')].map(el => el.value));
    if(!restored.some(n => n.includes('Travel')))
      throw new Error(`demo restore did not bring the seed goals back (${JSON.stringify(restored)})`);
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
        suggestBtn: !!document.querySelector('#scn-suggest'),   // removed control — must stay gone
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
    if(!m.solveBtn || !m.addBtn) throw new Error('Solve / Add toolbar actions missing from Scenarios');
    if(m.suggestBtn) throw new Error('removed Suggest button is still present in the Scenarios toolbar');
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
    const EXPECT = ['Year', 'Age', 'Income', 'RMD', 'Essential', 'Goals', 'Tax', 'Draw', 'Return', 'WD Rate', 'Ending'];
    const m = await page.evaluate(() => {
      const v = document.querySelector('#scn-view');
      return {
        cf: !!v?.querySelector('.cf'),
        rows: v?.querySelectorAll('.cf-row').length || 0,
        cols: [...(v?.querySelectorAll('.cf-table__head .cf-th') || [])].map(th => th.textContent.trim()),
        pills: [...(v?.querySelectorAll('.cf-pill') || [])].map(p => p.textContent.trim()),
        activePill: v?.querySelector('.cf-pill.is-active')?.textContent.trim() || '',
        stats: [...(v?.querySelectorAll('.cf-stat__label') || [])].map(s => s.textContent.trim()),
        pathControls: !!v?.querySelector('#scn-cf-path-controls #path-mode'),
        mode: v?.querySelector('#scn-cf-path-controls #path-mode')?.value || '',
        taxHeader: (() => {
          const th = v?.querySelector('.cf-table__head .cf-th[data-tax-source]');
          return th ? {
            label: th.textContent.trim(),
            source: th.dataset.taxSource || '',
            scope: th.dataset.taxScope || '',
            title: th.getAttribute('title') || '',
          } : null;
        })(),
        taxCompare: (() => {
          const el = v?.querySelector('[data-tax-compare]');
          return el ? {
            federalTotal: Number(el.dataset.federalTotal),
            enginePathTotal: Number(el.dataset.enginePathTotal),
            delta: Number(el.dataset.delta),
            labels: [...el.querySelectorAll('.cf-stat__label')].map(label => label.textContent.trim()),
            values: [...el.querySelectorAll('.cf-stat__value')].map(value => value.textContent.trim()),
          } : null;
        })(),
        hasCaption: !!v?.querySelector('.cf__caption'),
        hasCfEyebrow: !!v?.querySelector('.cf__head .eyebrow'),
        hasSummaryName: !!v?.querySelector('.cf-summary__name'),
      };
    });
    if(!m.cf) throw new Error('cash-flow view did not render');
    if(m.rows < 10) throw new Error(`cash-flow rows = ${m.rows} (expected >=10)`);
    if(JSON.stringify(m.cols) !== JSON.stringify(EXPECT)) throw new Error(`cash-flow columns are not the exact contract: ${JSON.stringify(m.cols)}`);
    if(m.cols.filter(c => /tax/i.test(c)).length !== 1) throw new Error(`cash flow must have exactly one scoped tax column: ${JSON.stringify(m.cols)}`);
    if(m.taxHeader?.source !== 'federal-sidecar' || m.taxHeader?.scope !== 'INCOME_TAX_ONLY') throw new Error(`typical path tax scope missing: ${JSON.stringify(m.taxHeader)}`);
    if(!/income tax only/i.test(m.taxHeader?.title || '')) throw new Error(`typical path tax tooltip missing scope: ${JSON.stringify(m.taxHeader)}`);
    if(!m.taxCompare) throw new Error('typical path federal-vs-engine summary is missing');
    if(JSON.stringify(m.taxCompare.labels) !== JSON.stringify(['Federal Total', 'Engine Path', 'Delta'])) throw new Error(`tax comparison labels mismatch: ${JSON.stringify(m.taxCompare)}`);
    if(![m.taxCompare.federalTotal, m.taxCompare.enginePathTotal, m.taxCompare.delta].every(Number.isFinite)) throw new Error(`tax comparison totals are not numeric: ${JSON.stringify(m.taxCompare)}`);
    if(Math.abs((m.taxCompare.federalTotal - m.taxCompare.enginePathTotal) - m.taxCompare.delta) > 0.01) throw new Error(`tax comparison delta does not match supplied totals: ${JSON.stringify(m.taxCompare)}`);
    if(m.cols.some(c => ['Withdraw', 'One-time', 'Return $', 'Starting value', 'Inflows', 'Outflows', 'Annual return', 'Ending value'].includes(c))) throw new Error(`old cash-flow columns still present: ${JSON.stringify(m.cols)}`);
    if(m.pills.length < 2) throw new Error(`scenario pills missing: ${JSON.stringify(m.pills)}`);
    if(!m.pathControls) throw new Error('path-replay controls not relocated into #scn-cf-path-controls');
    if(m.mode !== 'typical') throw new Error(`path replay default mode not typical (${m.mode})`);
    for(const label of ['Median Ending', 'Peak Withdrawal']){
      if(!m.stats.includes(label)) throw new Error(`cash-flow summary stat missing: ${label} (${JSON.stringify(m.stats)})`);
    }
    // Lifetime Draw / Funds Last were removed from the summary strip — stay gone.
    if(m.stats.some(s => /lifetime draw|funds last/i.test(s))) throw new Error(`removed summary stat still present: ${JSON.stringify(m.stats)}`);
    if(m.hasCaption) throw new Error('cash-flow caption should be removed');
    if(m.hasCfEyebrow) throw new Error('redundant Cash Flow eyebrow still in cf header');
    if(m.hasSummaryName) throw new Error('redundant scenario name still in summary strip');
    if(await page.evaluate(() => !!document.querySelector('#scn-view .cf-phase__name'))) throw new Error('phase header labels should be removed');

    // Retirement start = filled dot on the year column of the first non-accum row.
    const retirementStartAge = () => page.evaluate(() => {
      const row = document.querySelector('#scn-view .cf-row__mark-dot--ret')?.closest('.cf-row');
      return row ? (row.querySelector('.cf-cell--age')?.textContent.trim() || '') : '';
    });
    const retireAge = await retirementStartAge();
    if(retireAge !== '66') throw new Error(`baseline retirement start not at age 66 (got "${retireAge}")`);
    const rmdAge = await page.evaluate(() => {
      const row = document.querySelector('#scn-view .cf-row__mark-dot--rmd')?.closest('.cf-row');
      return row ? (row.querySelector('.cf-cell--age')?.textContent.trim() || '') : '';
    });
    if(rmdAge !== '73') throw new Error(`RMD start marker not at age 73 (got "${rmdAge}")`);

    // The scenario pills switch which plan's cash flow is shown, and each plan's
    // cash flow reflects ITS OWN retire age. demoScenarios seeds Baseline at the
    // household retire age (66 here, asserted just above) and Scenario B at
    // +2 years (68), so selecting the Scenario B pill must move the first
    // retirement-spending row from 66 to 68.
    const pickedB = await page.evaluate(() => {
      const pill = [...document.querySelectorAll('#scn-view .cf-pill')].find(p => /Scenario B/.test(p.textContent));
      if(!pill) return false;
      pill.click();
      return true;
    });
    if(!pickedB) throw new Error(`Scenario B pill not found among ${JSON.stringify(m.pills)}`);
    await new Promise(r => setTimeout(r, 450));
    await waitCashRows(page, 10);
    const bActive = await page.evaluate(() => document.querySelector('#scn-view .cf-pill.is-active')?.textContent.trim() || '');
    if(!/Scenario B/.test(bActive)) throw new Error(`cash-flow pill did not switch to Scenario B (got "${bActive}")`);
    const bMarker = await retirementStartAge();
    if(bMarker !== '68') throw new Error(`Scenario B retirement start not at age 68 (got "${bMarker}")`);
    // Restore Baseline for the path-replay checks below.
    await page.evaluate(() => [...document.querySelectorAll('#scn-view .cf-pill')].find(p => /Baseline/.test(p.textContent))?.click());
    await new Promise(r => setTimeout(r, 350));
    await waitCashRows(page, 10);

    // Path replay: named modes only. The advanced Path # / Seed inputs were
    // removed from the header — assert they stay gone. (#path-mode is the
    // production node relocated into the Cash Flow header — same element, same
    // bindings.)
    const advanced = await page.evaluate(() => ({
      chooseOpt: [...document.querySelectorAll('#path-mode option')].some(o => o.value === 'choose'),
      indexInput: !!document.querySelector('#path-index'),
      seedInput: !!document.querySelector('#path-seed'),
    }));
    if(advanced.chooseOpt || advanced.indexInput || advanced.seedInput) throw new Error(`removed path #/seed controls still present: ${JSON.stringify(advanced)}`);
    const hasFavorable = await page.evaluate(() => [...document.querySelectorAll('#path-mode option')].some(o => o.value === 'favorable'));
    if(!hasFavorable) throw new Error('favorable option missing from path-mode select');
    await page.select('#path-mode', 'favorable');
    await new Promise(r => setTimeout(r, 400));
    if(await waitCashRows(page, 10) < 10) throw new Error('favorable path emptied the cash-flow table');
    const engineTaxHeader = await page.evaluate(() => {
      const th = document.querySelector('#scn-view .cf-table__head .cf-th[data-tax-source]');
      return th ? {
        label: th.textContent.trim(),
        source: th.dataset.taxSource || '',
        scope: th.dataset.taxScope || '',
      } : null;
    });
    if(engineTaxHeader?.label !== 'Tax' || engineTaxHeader?.source !== 'engine' || engineTaxHeader?.scope) throw new Error(`non-typical path tax scope is not engine-scoped: ${JSON.stringify(engineTaxHeader)}`);
    if(await page.evaluate(() => !!document.querySelector('#scn-view [data-tax-compare]'))) throw new Error('federal-vs-engine summary must be hidden on non-typical paths');
    await page.select('#path-mode', 'typical');
    await new Promise(r => setTimeout(r, 300));
    const restoredTaxHeader = await page.evaluate(() => {
      const th = document.querySelector('#scn-view .cf-table__head .cf-th[data-tax-source]');
      return th ? { label: th.textContent.trim(), source: th.dataset.taxSource || '' } : null;
    });
    if(restoredTaxHeader?.label !== 'Tax' || restoredTaxHeader?.source !== 'federal-sidecar') throw new Error(`typical path tax scope did not restore: ${JSON.stringify(restoredTaxHeader)}`);
    if(!await page.evaluate(() => !!document.querySelector('#scn-view [data-tax-compare]'))) throw new Error('federal-vs-engine summary did not restore on typical path');
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
    // Goals mounts the Ledger view (.gl-ledger) now, not the retired Life Chapters.
    if(!await page.evaluate(() => !!document.querySelector('#np-content .gl-ledger'))) throw new Error('Goals view did not mount .gl-ledger');
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
    await goStep(1);   // retirement ages live on wizard step 1 (People & Timeline)
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
    // Mutate the demo (living expense — wizard step 3 Cash Flow) then reset it.
    await goStep(3);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      if(!el) throw new Error('expenses.living input missing on Cash Flow step');
      el.value = '999,999';
      el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-act-demo').click()); await sleep(800);
    const after = await page.evaluate(() => ({
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
      active: localStorage.getItem('parallax.activeHouseholdId'),
    }));
    // Demo restored to its factory living expense…
    if(after.db.demo.expenses.living !== 38000) throw new Error(`reset demo did not restore living expense (got ${after.db.demo.expenses.living})`);
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
