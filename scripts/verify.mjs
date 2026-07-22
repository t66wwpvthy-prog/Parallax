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
import { generateReturnPath, resetSeed, runSimulation } from '../engine.js';
import { runMonteCarloWithFederalFunding } from '../src/planning/tax/runMonteCarloWithFederalFunding.js';
import { createBlankTaxProfiles } from '../src/household/factEnvelope.js';

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
    : ext === 'png' ? 'image/png'
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
   Household is the 4-STEP WIZARD: Profile (people + spending) → Balance Sheet →
   Income & Tax → Summary. Goals stay on the Goals page. Renderers live in
   ui/householdWizard.js, ui/householdIncomeTax.js, and ui/householdSpendingGoals.js;
   src/main.js owns wiring, plan factories, and handlers.
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
  ok(!/id="hh-step-5"/.test(html), 'retired 5th wizard step (#hh-step-5) must be gone');
  ok(/hh-step__label">Profile</.test(html), 'Profile step label missing');
  ok(/hh-step__label">Summary</.test(html), 'Summary step label missing');
  ok(!/People &amp; Timeline|Spending &amp; Goals|Blueprint/.test(html), 'retired wizard step labels must be gone');
  ok(!/id="hh-plan-rail"/.test(html), 'retired "Plan so far" rail (#hh-plan-rail) must be gone');
  ok(/createHouseholdWizard/.test(source), 'household wizard module (createHouseholdWizard) missing');
  ok(/id="hh-wiz-footer"/.test(html), 'wizard footer mount (#hh-wiz-footer) missing');
  ok(/function defaultStep\b/.test(source), 'Household wizard landing heuristic missing');
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
  ok(/HOUSEHOLD_WIZARD_ACCOUNT_TYPES/.test(source), 'Wizard account type registry binding missing');
  ['Traditional IRA','Roth IRA','Brokerage (taxable)','401(k)','HSA'].forEach(t => {
    ok(source.includes(`'${t}'`), `Wizard account types missing: ${t}`);
  });
  ok(!/meta\.inflationPct/.test(source), 'engine-inert Inflation field must not ship in the wizard');
  ok(/VALID_OWNERS\s*=\s*new Set\(\[[\s\S]{0,100}['"]trust['"]/.test(source), 'Trust ownership must remain valid in the account registry');

  // Wizard module + step wiring (renderers live in ui/householdWizard.js).
  ok(/ui\/householdWizard\.js/.test(source), 'ui/householdWizard.js import missing');
  ok(/function ensureWizard\b/.test(source), 'Household wizard lazy wiring missing');
  ok(!/data-hh-action="run-blueprint"/.test(source), 'RUN BLUEPRINT action must be removed');
  ok(!/data-hh-action="goto-planning"/.test(source), 'goto-planning action must be removed');
  ok(/styles\/header\.css/.test(html), 'styles/header.css must be linked');

  // Wizard data additions: addable children (engine-inert context) and annual
  // savings; working income must NOT render as a separate wizard input.
  // Goals CRUD stays on the Goals page — not in the wizard.
  ok(/household\.children/.test(source), 'household.children[] (addable children) missing');
  ok(/addControl\(state,\s*['"]income['"]/.test(source), 'income add flow missing');
  ok(/data-add-key="spending"/.test(source), 'spending category add flow missing');
  ok(!/data-add-key="goal"/.test(source), 'wizard must not offer goal adds (Goals page owns goals)');
  ok(/renderHouseholdSpending\b/.test(source), 'Profile spending renderer missing');
  ok(!/class="hh-tl/.test(source) && !/\.hh-tl/.test(css), 'retired person timeline bars must be removed');
  ok(/Annual savings/.test(source), 'annual savings must still appear on the Summary flow');
  ok(/data-add-key="savings"/.test(source) || /data-savings-addon/.test(source), 'optional annual contribution add-on missing');
  ok(/addControl\(state,\s*['"]external-sale['"]/.test(source), 'external-sale income add path missing');
  ok(/data-joint-accounts/.test(source), 'joint accounts section missing');
  ok(!/hhField\('income\.workingIncome'/.test(source), 'working income must not render as a wizard input (engine-inert today)');

  // EDITABLE console: inline data-path inputs + a #hh-view delegate that writes
  // back to `plan` and reseeds/dirties scenarios (parity with the rest of the
  // input layer). This is the non-negotiable — Household must not be static.
  ok(/createHouseholdWizardController\(\{[\s\S]{0,180}renderField:\s*\(path,\s*type,\s*extra\)\s*=>\s*renderField\(/.test(source), 'Household wizard must receive renderField data-path controls');
  ok(/bindHouseholdEditor\(\{[\s\S]{0,160}root:\s*\$\(\s*['"]#hh-view['"]\s*\)/.test(source), 'Household editor must bind to #hh-view');
  ok(/root\.addEventListener\(\s*['"]change['"]/.test(source), 'Household edit delegate missing (module-owned change handler)');
  ok(/function hhCommit\b/.test(source), 'Household commit (hhCommit) missing');
  ok(/function\s+hhCommit\b[\s\S]{0,160}reseedScenarios\(\)[\s\S]{0,80}plansDirty\s*=\s*true/.test(source), 'Household edits must reseed + dirty scenarios exactly like the input layer (hhCommit)');
  ok(/function syncHousehold\b/.test(source), 'syncHousehold() renderer missing');

  // no baked sample household
  ok(!/Whitmore/i.test(source), 'Sample household data (Whitmore) must not ship in production');
  ok(!/Nathan|Maci/.test(source), 'Fictional demo household names must not ship in production');
  ok(!/DEMO_SEED_VERSION|refreshStaleDemoRecord/.test(source), 'demo seed-version overwrite path must be removed');

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
  ok(/data-hh-action=.add-spouse/.test(source),    'add-spouse action button missing');
  ok(/data-hh-action=.remove-spouse/.test(source), 'remove-spouse action button missing');
  ok(/add-pension-age/.test(source), 'add-pension-age handler missing (pension UI deferred but wiring retained)');
  ok(/deps\.field\(`\$\{base\}\.claimAge`,\s*['"]age['"]/.test(source), 'editable Social Security claim-age field missing');
  ok(/min:\s*62,\s*max:\s*70/.test(source), 'Social Security claim-age field must be limited to 62-70');

  // ── Multi-household state management: pure factories + records-by-id store ──
  // The app boots with a demo household but supports creating/switching custom
  // households, and demo values must never overwrite a custom household on reload.
  ok(/function createDemoHousehold\b/.test(source),  'createDemoHousehold() factory missing');
  ok(/function createBlankHousehold\b/.test(source), 'createBlankHousehold() factory missing');
  ok(/function hydratePlan\b/.test(source),          'hydratePlan() (in-place plan hydrate) missing');
  ok(/function bootstrapHouseholds\b/.test(source),  'bootstrapHouseholds() (first-load seed + reload hydrate) missing');
  ok(/readHouseholdStore\b/.test(source), 'readHouseholdStore() missing');
  ok(/prepareHouseholdStore\b/.test(source), 'prepareHouseholdStore() missing');
  ok(/commitPreparedHouseholdStore\b/.test(source), 'commitPreparedHouseholdStore() missing');
  ok(/function guardPlanMutation\b/.test(source), 'guardPlanMutation() missing');
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
  ok(/id=.hh-save-as/.test(html), 'Save As household button (#hh-save-as) missing');
  ok(/id=.hh-rename/.test(html), 'Rename household button (#hh-rename) missing');
  ok(/id=.hh-new/.test(html),    'New Household button (#hh-new) missing');
  ok(/id=.hh-load-demo/.test(html), 'Load Demo button (#hh-load-demo) missing');
  ok(!/id=.hh-act-demo|id=.hh-act-clear|class=.hh-menu__row/.test(html), 'retired Demo reset / Clear menu controls must be gone');
  ok(!/<label[^>]+for=.hh-switch/.test(html), 'redundant Household label must be removed from the menu');
  ok(/meta\.filingStatus/.test(source), 'Filing status field (meta.filingStatus) missing from Household');
  // Tax facts are edited through their atomic Household gateway. The retired
  // aggregate basisPct remains an engine fallback only and must never return as
  // an advisor-facing field.
  ok(!/hhField\('portfolio\.accounts\.taxable\.basisPct'/.test(source), 'legacy taxable basisPct input must NOT ship in the wizard');
  ok(/data-hh-tax-details-root/.test(source), 'Household Tax details disclosure is missing');
  ok(/['"]data-hh-tax-edit['"]\s*:\s*['"]basis['"]/.test(source), 'account cost-basis controls are missing');
  ok(/applyHouseholdTaxFactEdit/.test(source) && /taxFactEditFromControl/.test(source), 'Household tax facts must use the atomic edit API');
  const taxFactsUi = read(join(ROOT, 'ui', 'householdTaxFacts.js'));
  ok(!/key:\s*['"](?:conversionCohorts|inPlanRolloverCohorts)['"]/.test(taxFactsUi), 'cohort-array controls must remain deferred');
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
  console.log('  OK household contract (5-step blueprint wizard: stepper + module renderers, account-type bank, data-path write-back, reseed-on-edit, scoped CSS)');
}

function verifyTaxBuckets(){
  const read = path => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  const fails = [];
  const ok = (condition, message) => { if(!condition) fails.push(message); };
  const html = read(join(ROOT, 'index.html'));
  const main = read(join(ROOT, 'src', 'main.js'));
  const view = read(join(ROOT, 'ui', 'taxBuckets.js'));
  const css = read(join(ROOT, 'styles', 'tax-buckets.css'));

  ok(/styles\/tax-buckets\.css\?v=1/.test(html), 'Tax Buckets stylesheet is not linked');
  ok(/data-page="scenarios"[\s\S]*data-page="tax-buckets"[\s\S]*data-page="sequencing"/.test(html), 'Tax Buckets must sit between Scenarios and Sequencing');
  ok(/<section class="page" data-page="tax-buckets">[\s\S]*id="tax-buckets-view"/.test(html), 'Tax Buckets page mount is missing');
  ok(/buildCurrentTaxBucketSnapshot/.test(main), 'current Tax Buckets snapshot is not wired');
  ok(/createTaxBucketsController/.test(main), 'Tax Buckets view controller is not wired');
  ok(!/(?:engine\.js|src\/tax\/|annual1040|ordinaryIncomeTax)/.test(view), 'Tax Buckets UI must not own engine or federal-tax math');
  ok(!/replay/i.test(view), 'production Tax Buckets UI must not ship a replay control');
  ok(/grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(css), 'three-column pod grid is missing');
  ok(/gap:\s*26px/.test(css), '26px pod gap is missing');
  ok(/border-radius:\s*18px/.test(css), '18px pod radius is missing');
  ok(/backdrop-filter:\s*blur\(26px\)\s+saturate\(1\.35\)/.test(css), 'locked 26px glass blur is missing');
  ok(/\.tb-glow-field\s*\{[\s\S]*position:\s*fixed/.test(css), 'locked fixed ambient glow field is missing');

  if(fails.length){
    console.error('FAIL Tax Buckets contract:');
    fails.forEach(failure => console.error('  - ' + failure));
    process.exit(1);
  }
  console.log('  OK Tax Buckets contract (live snapshot, display-only view, approved three-pod glass treatment)');
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
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const test = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', npmCmd, 'test'], { cwd: ROOT, stdio: 'inherit' })
  : spawnSync(npmCmd, ['test'], { cwd: ROOT, stdio: 'inherit' });
if(test.status !== 0){ console.error('npm test failed'); process.exit(1); }

console.log('household contract (static)');
verifyHousehold();

console.log('Tax Buckets contract (static)');
verifyTaxBuckets();

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
  const rawPage = await browser.newPage();
  await rawPage.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 3 });
  // Puppeteer can briefly retain a detached main-frame handle while a prior
  // reload settles. Retry only that transport-level condition; all assertion,
  // selector, and application errors still fail immediately.
  const retryDetachedFrame = async (label, action) => {
    let lastError;
    for(let attempt = 0; attempt < 3; attempt++){
      try{
        return await action();
      }catch(error){
        lastError = error;
        if(!/(?:detached.*frame|frame.*detached)/i.test(error?.message || '') || attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        try{
          await rawPage.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 });
        }catch(waitError){
          if(!/(?:detached.*frame|frame.*detached|Execution context was destroyed)/i.test(waitError?.message || '')) throw waitError;
        }
      }
    }
    throw new Error(`${label}: ${lastError?.message || lastError}`);
  };
  // Most verifier operations intentionally use Puppeteer's concise page API.
  // Protect those operations at the page boundary so a transient detached frame
  // cannot fail an otherwise-correct assertion hundreds of lines away. Methods
  // that return element handles are retried only while locating the handle; a
  // genuinely stale handle or application error still fails normally.
  const retryablePageMethods = new Set([
    'click', 'evaluate', '$', '$$', '$eval', '$$eval', 'screenshot', 'setViewport',
  ]);
  const page = new Proxy(rawPage, {
    get(target, property){
      const value = Reflect.get(target, property, target);
      if(typeof value !== 'function') return value;
      const bound = value.bind(target);
      if(!retryablePageMethods.has(property)) return bound;
      return (...args) => retryDetachedFrame(`${String(property)} operation`, () => bound(...args));
    },
  });
  const stableClick = selector => retryDetachedFrame(`click ${selector}`, () => rawPage.click(selector));
  const stableEvaluate = (label, fn, ...args) => retryDetachedFrame(label, () => rawPage.evaluate(fn, ...args));
  const stableGoto = (url, options) => retryDetachedFrame(`navigate ${url}`, () => rawPage.goto(url, options));
  const stableReload = options => retryDetachedFrame('reload page', () => rawPage.reload(options));
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console', m => {
    if(m.type() !== 'error') return;
    const message = m.text();
    const sourceUrl = m.location()?.url || '';
    const blockedGoogleFont = message === 'Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED'
      && /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(sourceUrl);
    if(blockedGoogleFont) return;
    errs.push('CON: ' + message + (sourceUrl ? ` @ ${sourceUrl}` : ''));
  });

  await step('load index.html', async () => {
    // Deterministic seed: households + scenarios persist to localStorage, so a
    // stale browser store would silently replace the demo seed (Baseline 66 /
    // Scenario B 68 / Aggressive risk 5) and make the per-scenario assertions
    // flaky. Clear ALL storage and reload so every run boots a fresh Demo
    // Household via bootstrapHouseholds() → demoScenarios().
    await stableGoto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    const firstRun = await page.evaluate(() => ({
      active: localStorage.getItem('parallax.activeHouseholdId'),
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
    }));
    const blank = firstRun.db?.demo;
    if(firstRun.active !== 'demo' || !blank) throw new Error('first run did not create the blank demo slot');
    if(blank.meta?.name !== 'Demo Household' || blank.meta?.isDemo !== true) throw new Error('blank demo metadata is wrong');
    if(blank.meta?.primaryName || blank.household?.spouse || blank.income?.socialSecurity?.primary?.pia !== 0 || blank.income?.socialSecurity?.primary?.claimAge !== 67)
      throw new Error(`first-run demo contains fictional values: ${JSON.stringify(blank)}`);

    await page.evaluate(() => {
      const key = 'parallax.households.v1';
      const db = JSON.parse(localStorage.getItem(key));
      const demo = db.demo;
      demo.meta.primaryName = 'Test Client';
      demo.meta.spouseName = 'Test Co-Client';
      demo.meta.filingStatus = 'marriedFilingJointly';
      demo.household.primary = { currentAge: 64, retirementAge: 66, planEndAge: 95, birthYear: 1962 };
      demo.household.spouse = { currentAge: 63, retirementAge: 65, birthYear: 1963 };
      demo.portfolio.extraAccounts = [
        { type:'Traditional IRA', bucket:'traditional', owner:'client', balance:1600000 },
        { type:'Brokerage (taxable)', bucket:'taxable', owner:'spouse', balance:800000 },
        { type:'Roth IRA', bucket:'roth', owner:'spouse', balance:400000 },
      ];
      demo.expenses.living = 38000;
      demo.expenses.healthcare = 18000;
      demo.expenses.extra = [
        { label:'Housing', amount:34000, startAge:64, endAge:95 },
        { label:'Vacation budget', amount:0, startAge:66, endAge:80 },
      ];
      demo.income.socialSecurity.primary = { pia:34000, claimAge:67 };
      demo.income.socialSecurity.spouse = { pia:28000, claimAge:67 };
      demo.income.other = [
        { typeId:'wages', owner:'client', label:'Client wages', amount:120000, startAge:64, endAge:65, realGrowth:0, taxablePct:1 },
        { typeId:'wages', owner:'spouse', label:'Co-client wages', amount:60000, startAge:63, endAge:64, realGrowth:0, taxablePct:1 },
      ];
      demo.goals = [{ name:'Travel & leisure', amount:30000, startAge:66, endAge:81 }];
      // Filled demo uses legacy-shaped accounts; strip v1 stamp so one-time migration runs.
      delete demo.meta.accountSchemaVersion;
      localStorage.setItem(key, JSON.stringify(db));
    });
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
  });

  await step('Tax Buckets: entrance reveals three live current-account pods', async () => {
    await page.setViewport({ width:1440, height:900, deviceScaleFactor:1 });
    await stableClick('.htab[data-page="tax-buckets"]');
    await new Promise(r => setTimeout(r, 250));

    const entry = await page.evaluate(() => ({
      active: document.querySelector('.page.on')?.dataset.page || '',
      title: document.querySelector('[data-tb-entry] h1')?.textContent.trim() || '',
      cta: document.querySelector('[data-tb-explore]')?.textContent.trim() || '',
      entryVisible: !document.querySelector('[data-tb-entry]')?.hidden,
      viewHidden: !!document.querySelector('[data-tb-view]')?.hidden,
    }));
    if(entry.active !== 'tax-buckets' || entry.title !== 'Tax Buckets' || entry.cta !== 'Explore Tax Buckets' || !entry.entryVisible || !entry.viewHidden){
      throw new Error(`Tax Buckets entrance is incomplete: ${JSON.stringify(entry)}`);
    }
    await page.screenshot({ path:join(OUT, '02-tax-buckets-entry.png') });

    await stableClick('[data-tb-explore]');
    await new Promise(r => setTimeout(r, 1800));
    const live = await page.evaluate(() => {
      const pods = [...document.querySelectorAll('.tb-pod')];
      const styleKeys = pod => {
        const style = getComputedStyle(pod);
        return {
          background:style.backgroundImage,
          border:style.border,
          radius:style.borderRadius,
          shadow:style.boxShadow,
          backdrop:style.backdropFilter || style.webkitBackdropFilter,
          padding:style.padding,
        };
      };
      return {
        live:document.querySelector('[data-tb-view]')?.classList.contains('tb-live') || false,
        podCount:pods.length,
        labels:pods.map(pod => pod.querySelector('.tb-pod-label')?.textContent.trim() || ''),
        balances:pods.map(pod => pod.querySelector('.tb-pod-balance')?.textContent.trim() || ''),
        taxableRows:pods[0]?.querySelector('.tb-pod-rows')?.textContent.replace(/\s+/g, ' ').trim() || '',
        styles:pods.map(styleKeys),
        gridGap:getComputedStyle(document.querySelector('.tb-pods')).columnGap,
        balanceFont:getComputedStyle(document.querySelector('.tb-pod-balance')).fontFamily,
        replay:/replay entrance/i.test(document.querySelector('.page.on')?.textContent || ''),
        footnote:document.querySelector('.tb-footnote')?.textContent.trim() || '',
      };
    });
    if(!live.live || live.podCount !== 3) throw new Error(`Tax Buckets live view did not reveal exactly three pods: ${JSON.stringify(live)}`);
    if(JSON.stringify(live.balances) !== JSON.stringify(['$800,000', '$1,600,000', '$400,000'])){
      throw new Error(`Tax Buckets balances are not bound to the demo account snapshot: ${JSON.stringify(live.balances)}`);
    }
    if(!/Not confirmed/.test(live.taxableRows) || !/—/.test(live.taxableRows)){
      throw new Error(`Taxable basis must fail closed when unconfirmed: "${live.taxableRows}"`);
    }
    if(live.replay) throw new Error('production Tax Buckets view exposed a replay control');
    if(live.footnote !== 'Derived from Household account data.') throw new Error(`Tax Buckets footnote mismatch: "${live.footnote}"`);
    if(live.gridGap !== '26px' || !/Spectral/i.test(live.balanceFont)) throw new Error(`Tax Buckets grid/type treatment drifted: ${JSON.stringify(live)}`);
    if(live.styles.some(style => style.radius !== '18px' || !style.backdrop.includes('blur(26px)'))){
      throw new Error(`Tax Buckets glass constants drifted: ${JSON.stringify(live.styles)}`);
    }
    if(live.styles.some(style => JSON.stringify(style) !== JSON.stringify(live.styles[0]))){
      throw new Error(`Tax Bucket pods do not share identical glass: ${JSON.stringify(live.styles)}`);
    }
    await page.screenshot({ path:join(OUT, '02-tax-buckets.png') });
    await page.setViewport({ width:1920, height:1080, deviceScaleFactor:3 });
  });

  // Wizard navigation helper: Household tab → stepper click (all steps are
  // freely clickable — advisor tool, no gating).
  const goStep = async (n) => {
    await stableClick('.htab[data-page="household"]');
    await new Promise(r => setTimeout(r, 300));
    await stableClick('#hh-step-' + n);
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
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Tax Buckets', 'Sequencing'];
    if(JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) throw new Error(`main nav mismatch: ${JSON.stringify(m.nav)}`);
    if(m.hasSubnav) throw new Error('old net-worth subnav is still rendered');
    if(!m.wizard) throw new Error('household wizard frame (.hh-wizard) missing');
    if(JSON.stringify(m.steps) !== JSON.stringify(['Profile','Balance Sheet','Income & Tax','Summary'])) throw new Error(`stepper mismatch: ${JSON.stringify(m.steps)}`);
    if(m.current !== '4') throw new Error(`filled demo household must land on Summary (step 4), got "${m.current}"`);
    if(m.chapButtons) throw new Error('retired chapter rail buttons still rendered');
    if(!m.railName) throw new Error('household name not filled from plan');
    if(!m.gauge) throw new Error('Summary arc gauge missing on landing step');
    if(!m.menuBtn) throw new Error('household controls menu button missing');
    if(!m.coClientText) throw new Error('visible Household UI must show co-client (label or joint name)');

    // Controls menu: ⋯ toggles the popover housing Switch / New / Demo / Clear.
    await page.click('#hh-menu-btn'); await new Promise(r => setTimeout(r, 200));
    const menu = await page.evaluate(() => ({
      open: !document.querySelector('#hh-menu-pop').hidden,
      switcher: !!document.querySelector('#hh-menu-pop #hh-switch'),
      saveAsBtn: !!document.querySelector('#hh-menu-pop #hh-save-as'),
      renameBtn: !!document.querySelector('#hh-menu-pop #hh-rename'),
      newBtn: !!document.querySelector('#hh-menu-pop #hh-new'),
      loadDemoBtn: !!document.querySelector('#hh-menu-pop #hh-load-demo'),
      retired: !!document.querySelector('#hh-menu-pop #hh-act-demo, #hh-menu-pop #hh-act-clear, #hh-menu-pop .hh-menu__row'),
      redundantLabel: !!document.querySelector('#hh-menu-pop label[for="hh-switch"]'),
      functions: document.querySelectorAll('#hh-menu-pop select, #hh-menu-pop button').length,
    }));
    if(!menu.open) throw new Error('household menu did not open');
    if(!menu.switcher || !menu.saveAsBtn || !menu.renameBtn || !menu.newBtn || !menu.loadDemoBtn){
      throw new Error('menu is missing Open / Save As / Rename / New / Load Demo controls');
    }
    if(menu.retired || menu.redundantLabel || menu.functions !== 5) throw new Error(`household menu is not minimal: ${JSON.stringify(menu)}`);
    await page.click('#hh-menu-btn'); await new Promise(r => setTimeout(r, 200));
    if(await page.evaluate(() => !document.querySelector('#hh-menu-pop').hidden)) throw new Error('household menu did not close');

    const bp = await page.evaluate(() => ({
      controls: document.querySelectorAll('#hh-view input, #hh-view select').length,
      gaugeVal: document.querySelector('#hh-view .hh-bp-gauge__v')?.textContent.trim() || '',
      cta: !!document.querySelector('#hh-view .hh-bp-cta, #hh-view [data-hh-action="run-blueprint"], #hh-view [data-hh-action="goto-planning"]'),
    }));
    if(bp.controls !== 0) throw new Error(`Summary must be read-only, found ${bp.controls} controls`);
    if(!/\$[\d.,MK]/.test(bp.gaugeVal)) throw new Error(`Summary gauge net worth not formatted: "${bp.gaugeVal}"`);
    if(bp.cta) throw new Error('Run Blueprint CTA must not render');
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
      personTimelines: document.querySelectorAll('#hh-view .hh-tl').length,
      back: !!document.querySelector('#hh-wiz-footer [data-hh-action="step-back"]'),
      next: !!document.querySelector('#hh-wiz-footer [data-hh-action="step-next"]'),
    }));
    if(s1.nameInputs !== 2) throw new Error(`step 1 name inputs: want 2, got ${s1.nameInputs}`);
    if(s1.bornInputs < 2) throw new Error(`step 1 Born inputs missing, got ${s1.bornInputs}`);
    if(!s1.filing) throw new Error('Filing dropdown missing');
    if(!s1.stateSel) throw new Error('State dropdown missing');
    if(!s1.coClientText) throw new Error('step 1 does not say co-client');
    if(!s1.addChild) throw new Error('"+ Add child" missing');
    if(s1.personTimelines) throw new Error(`step 1 still renders ${s1.personTimelines} person timeline bars`);
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
      claimAges: [...document.querySelectorAll('#hh-view input[data-path^="income.socialSecurity."][data-path$=".claimAge"]')]
        .map(el => ({ path: el.dataset.path, value: el.value, min: el.min, max: el.max })),
      slots: [...document.querySelectorAll('#hh-view [data-income-tax-slot]')].map(el => el.dataset.incomeTaxSlot),
      addIncome: !!document.querySelector('#hh-view [data-hh-action="open-add"][data-add-key="income"]'),
      addAdjustment: !!document.querySelector('#hh-view [data-hh-action="open-add"][data-add-key="adjustment"]'),
      addDeduction: !!document.querySelector('#hh-view [data-hh-action="open-add"][data-add-key="deduction"]'),
      addCredit: !!document.querySelector('#hh-view [data-hh-action="open-add"][data-add-key="credit"]'),
      working: !!document.querySelector('#hh-view input[data-path="income.workingIncome"]'),
      incomeHdr: document.querySelector('#hh-view .hh-it-section-head strong')?.textContent.trim() || '',
      position: !!document.querySelector('#hh-view .hh-it-position'),
      equation: !!document.querySelector('#hh-view .hh-it-equation'),
      taxPosition: document.querySelectorAll('#hh-view .hh-it-tax-grid .hh-it-stat').length,
      taxLabels: [...document.querySelectorAll('#hh-view .hh-it-tax-grid .hh-it-stat > span')].map(el => el.textContent.trim()),
      standardAuto: /Standard · MFJ \+ senior 65\+/i.test(document.querySelector('#hh-view')?.textContent || ''),
      amountLayout: (() => {
        const amount = document.querySelector('#hh-view .hh-it-row__amount');
        const input = amount?.querySelector('input[data-type="money"]');
        if(!amount || !input) return null;
        const wrapperStyle = getComputedStyle(amount);
        const inputStyle = getComputedStyle(input);
        return { display:wrapperStyle.display, whiteSpace:wrapperStyle.whiteSpace, fontSize:parseFloat(inputStyle.fontSize) };
      })(),
      scrollbarColor: getComputedStyle(document.querySelector('.hh-wiz-workspace')).scrollbarColor,
    }));
    if(s3.pia < 1) throw new Error(`SS benefit inputs missing, got ${s3.pia}`);
    if(s3.claimAges.length !== 2 || s3.claimAges.some(field => field.value !== '67' || field.min !== '62' || field.max !== '70'))
      throw new Error(`SS claim-age inputs missing/defaulted incorrectly: ${JSON.stringify(s3.claimAges)}`);
    for(const slot of [
      'wages:client','wages:spouse','interest:joint','dividends:joint',
      'social_security:client','social_security:spouse',
      '401k:client','401k:spouse','hsa:joint',
      'medical','charitable','mortgage_interest','salt',
    ]){
      if(!s3.slots.includes(slot)) throw new Error(`Income & Tax default slot missing: ${slot}`);
    }
    if(!s3.addIncome) throw new Error('"+ Add income" missing');
    if(!s3.addAdjustment || !s3.addDeduction) throw new Error('Income & Tax add controls missing');
    if(s3.addCredit) throw new Error('Credits must not have a standing Add control on Income & Tax');
    if(s3.working) throw new Error('working income input must not render in the wizard');
    if(!/\$180,000/.test(s3.incomeHdr)) throw new Error(`Income & Tax total must be $180,000, got "${s3.incomeHdr}"`);
    if(!s3.position || !s3.equation || s3.taxPosition !== 6)
      throw new Error(`tax summary structure missing: ${JSON.stringify(s3)}`);
    if(JSON.stringify(s3.taxLabels) !== JSON.stringify([
      'Federal marginal bracket','Capital gains rate','Next IRMAA tier',
      'Senior deduction (65+)','Effective tax rate','RMDs begin',
    ]))
      throw new Error(`Income & Tax position cells drifted from the six-slot design: ${JSON.stringify(s3.taxLabels)}`);
    if(!s3.standardAuto) throw new Error('Standard deduction AUTO row missing MFJ + senior copy');
    if(!s3.amountLayout || s3.amountLayout.display !== 'flex' || s3.amountLayout.whiteSpace !== 'nowrap' || s3.amountLayout.fontSize < 16)
      throw new Error(`Income & Tax money inputs must stay readable and unwrapped: ${JSON.stringify(s3.amountLayout)}`);
    if(!s3.scrollbarColor || s3.scrollbarColor === 'auto') throw new Error(`wizard scrollbar is not subtly styled: ${s3.scrollbarColor}`);

    // Wage growth stays editable on populated default wage slots.
    const growthPath = await page.evaluate(() =>
      document.querySelector('#hh-view input[data-path$=".realGrowth"]')?.dataset.path || '');
    if(!growthPath) throw new Error('demo wage growth input missing on Income & Tax');
    await page.evaluate((path) => {
      const el = document.querySelector(`#hh-view input[data-path="${path}"]`);
      el.value = '3';
      el.dispatchEvent(new Event('change', { bubbles:true }));
    }, growthPath);
    await new Promise(r => setTimeout(r, 300));
    const editedGrowth = await page.evaluate((path) =>
      document.querySelector(`#hh-view input[data-path="${path}"]`)?.value || '', growthPath);
    if(editedGrowth !== '3') throw new Error(`income growth edit did not preserve percentage-point display: "${editedGrowth}"`);
    await page.evaluate((path) => {
      const el = document.querySelector(`#hh-view input[data-path="${path}"]`);
      el.value = '0';
      el.dispatchEvent(new Event('change', { bubbles:true }));
    }, growthPath);
    await new Promise(r => setTimeout(r, 250));

    // Expanded add form: ordinary income catalog (path CG is withdrawal-derived).
    await page.click('#hh-view [data-hh-action="open-add"][data-add-key="income"]'); await new Promise(r => setTimeout(r, 200));
    const incomeDraft = await page.evaluate(() => ({
      options: [...document.querySelectorAll('#hh-view [data-hh-draft="type"] option')].map(option => option.value),
      fields: ['amount','startAge','endAge','growthPct'].every(name => !!document.querySelector(`#hh-view [data-hh-draft="${name}"]`)),
    }));
    if(incomeDraft.options.includes('social_security'))
      throw new Error('Social Security must use the dedicated per-client rows, not duplicate generic income');
    for(const typeId of ['pension','annuity','deferred_comp']){
      if(!incomeDraft.options.includes(typeId))
        throw new Error(`income add catalog missing ${typeId}: ${JSON.stringify(incomeDraft.options)}`);
    }
    for(const typeId of ['long_term_capital_gain','short_term_capital_gain','tax_exempt_interest','ira_distribution','roth_conversion']){
      if(incomeDraft.options.includes(typeId))
        throw new Error(`path/advanced income type must stay out of primary Add catalog: ${typeId}`);
    }
    if(!incomeDraft.fields) throw new Error('expanded income draft is missing amount, timing, or growth fields');
    await page.evaluate(() => {
      const set = (name, value, eventName = 'input') => {
        const el = document.querySelector(`#hh-view [data-hh-draft="${name}"]`);
        el.value = value;
        el.dispatchEvent(new Event(eventName, { bubbles:true }));
      };
      set('type', 'dividends', 'change');
      set('owner', 'joint', 'change');
      set('amount', '8600');
      set('startAge', '66');
      set('endAge', '');
      set('growthPct', '2');
      set('qualifiedPct', '85');
    });
    const conditionalDraft = await page.evaluate(() => ({
      qualifiedVisible: !document.querySelector('[data-income-types="dividends"]')?.hidden,
      taxableHidden: document.querySelector('[data-income-types~="interest"]')?.hidden,
    }));
    if(!conditionalDraft.qualifiedVisible || !conditionalDraft.taxableHidden)
      throw new Error(`income-specific draft controls did not toggle correctly: ${JSON.stringify(conditionalDraft)}`);
    const beforeOtherCount = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      return JSON.parse(localStorage.getItem('parallax.households.v1') || '{}')?.[active]?.income?.other?.length || 0;
    });
    await page.click('#hh-view [data-hh-action="commit-add"]'); await new Promise(r => setTimeout(r, 350));
    await page.click('#save-btn'); await new Promise(r => setTimeout(r, 300));
    const addedIncome = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const other = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}')?.[active]?.income?.other || [];
      const saved = other.at(-1);
      const amountInputs = [...document.querySelectorAll('#hh-view input[data-path^="income.other."][data-path$=".amount"]')];
      const row = amountInputs.at(-1)?.closest('.hh-it-row');
      return {
        count: other.length,
        retirementColumn: /Retirement years/i.test(row?.closest('section')?.querySelector('.hh-it-subhead span')?.textContent || ''),
        rowText: row?.textContent || '',
        saved,
      };
    });
    if(addedIncome.count !== beforeOtherCount + 1 || !addedIncome.retirementColumn
      || addedIncome.saved?.typeId !== 'dividends' || addedIncome.saved?.owner !== 'joint'
      || addedIncome.saved?.amount !== 8600 || addedIncome.saved?.endAge !== 999
      || addedIncome.saved?.realGrowth !== .02 || addedIncome.saved?.qualifiedPct !== .85)
      throw new Error(`expanded income source did not render and persist correctly: ${JSON.stringify(addedIncome)}`);
    await page.evaluate(() => {
      const amountInputs = [...document.querySelectorAll('#hh-view input[data-path^="income.other."][data-path$=".amount"]')];
      amountInputs.at(-1)?.closest('.hh-it-row')?.querySelector('[data-rmpath]')?.click();
    });
    await new Promise(r => setTimeout(r, 300));

    // External sale (rare) uses compact add and is not a taxable-sleeve draw.
    await page.click('#hh-view [data-hh-action="open-add"][data-add-key="external-sale"]'); await new Promise(r => setTimeout(r, 150));
    await page.evaluate(() => {
      const set = (name, value, eventName = 'input') => {
        const el = document.querySelector(`#hh-view [data-hh-draft="${name}"]`);
        el.value = value;
        el.dispatchEvent(new Event(eventName, { bubbles:true }));
      };
      set('type', 'long_term_capital_gain', 'change');
      set('owner', 'joint', 'change');
      set('amount', '12000');
    });
    const currentYearDraft = await page.evaluate(() => ({
      timingHidden: ['startAge', 'endAge', 'growthPct'].every(name =>
        document.querySelector(`#hh-view [data-hh-draft="${name}"]`)?.closest('[data-hide-for-income-types]')?.hidden === true),
      note: document.querySelector('#hh-view .hh-it-add-form__note')?.textContent || '',
    }));
    if(!currentYearDraft.timingHidden)
      throw new Error(`external-sale controls did not stay compact: ${JSON.stringify(currentYearDraft)}`);
    if(!/outside the modeled brokerage path/i.test(currentYearDraft.note))
      throw new Error(`external-sale note missing: ${JSON.stringify(currentYearDraft)}`);
    await page.click('#hh-view [data-hh-action="commit-add"]'); await new Promise(r => setTimeout(r, 250));
    await page.click('#save-btn'); await new Promise(r => setTimeout(r, 250));
    const addedCurrentYearItem = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const other = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}')?.[active]?.income?.other || [];
      const saved = other.at(-1);
      const amountInputs = [...document.querySelectorAll('#hh-view input[data-path^="income.other."][data-path$=".amount"]')];
      const row = amountInputs.at(-1)?.closest('.hh-it-row');
      return {
        rowText: row?.textContent || '',
        workingColumn: /Working years/i.test(row?.closest('section')?.querySelector('.hh-it-subhead span')?.textContent || ''),
        hasTimingInput: !!row?.querySelector('input[data-path$=".startAge"], input[data-path$=".endAge"]'),
        saved,
      };
    });
    if(addedCurrentYearItem.hasTimingInput || !addedCurrentYearItem.workingColumn
      || !/not a taxable-sleeve draw/i.test(addedCurrentYearItem.rowText)
      || addedCurrentYearItem.saved?.typeId !== 'long_term_capital_gain' || addedCurrentYearItem.saved?.amount !== 12000)
      throw new Error(`external sale did not render and persist correctly: ${JSON.stringify(addedCurrentYearItem)}`);
    await page.evaluate(() => {
      const amountInputs = [...document.querySelectorAll('#hh-view input[data-path^="income.other."][data-path$=".amount"]')];
      amountInputs.at(-1)?.closest('.hh-it-row')?.querySelector('[data-rmpath]')?.click();
    });
    await new Promise(r => setTimeout(r, 250));

    // Adjustment and deduction add flows persist without a standing Credits control.
    await page.click('#hh-view [data-hh-action="open-add"][data-add-key="adjustment"]'); await new Promise(r => setTimeout(r, 150));
    const adjustmentOptions = await page.evaluate(() => {
      const type = document.querySelector('#hh-view [data-hh-draft="type"]');
      const amount = document.querySelector('#hh-view [data-hh-draft="amount"]');
      amount.value = '23000';
      return [...type.options].map(option => option.value);
    });
    if(!adjustmentOptions.includes('ira_deduction')) throw new Error('deductible IRA contribution missing from adjustment add flow');
    await page.click('#hh-view [data-hh-action="commit-add"]'); await new Promise(r => setTimeout(r, 250));
    await page.click('#hh-view [data-hh-action="open-add"][data-add-key="deduction"]'); await new Promise(r => setTimeout(r, 150));
    const deductionOptions = await page.evaluate(() => {
      const type = document.querySelector('#hh-view [data-hh-draft="type"]');
      const amount = document.querySelector('#hh-view [data-hh-draft="amount"]');
      const options = [...type.options].map(option => option.value);
      type.value = 'charitable';
      type.dispatchEvent(new Event('change', { bubbles:true }));
      amount.value = '12000';
      return options;
    });
    if(!deductionOptions.includes('salt') || !deductionOptions.includes('other'))
      throw new Error(`deduction add catalog drifted: ${JSON.stringify(deductionOptions)}`);
    await page.click('#hh-view [data-hh-action="commit-add"]'); await new Promise(r => setTimeout(r, 250));
    await page.click('#save-btn'); await new Promise(r => setTimeout(r, 300));
    const savedTaxInputs = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const plan = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}')?.[active];
      return {
        adjustment: plan?.incomeTax?.adjustments?.at(-1),
        deduction: plan?.incomeTax?.deductions?.at(-1),
      };
    });
    if(savedTaxInputs.adjustment?.typeId !== '401k' || savedTaxInputs.adjustment?.amount !== 23000 || savedTaxInputs.adjustment?.whileWorkingOnly !== true
      || savedTaxInputs.deduction?.typeId !== 'charitable' || savedTaxInputs.deduction?.amount !== 12000)
      throw new Error(`Income & Tax adjustments/deductions did not persist: ${JSON.stringify(savedTaxInputs)}`);
    await page.evaluate(() => {
      document.querySelector('.hh-it-row [data-rmpath^="incomeTax.adjustments."]')?.click();
      document.querySelector('.hh-it-row [data-rmpath^="incomeTax.deductions."]')?.click();
    });
    await new Promise(r => setTimeout(r, 300));

    await page.click('#hh-step-1'); await new Promise(r => setTimeout(r, 350));
    const profileSpend = await page.evaluate(() => ({
      living: !!document.querySelector('#hh-view input[data-path="expenses.living"]'),
      health: !!document.querySelector('#hh-view input[data-path="expenses.healthcare"]'),
      extras: document.querySelectorAll('#hh-view input[data-path^="expenses.extra."][data-path$=".label"]').length,
      goals: document.querySelectorAll('#hh-view input[data-path^="goals."][data-path$=".name"]').length,
      fundingChoices: document.querySelectorAll('#hh-view input[data-path$=".fundFromPortfolioBeforeRetirement"]').length,
      addCategory: !!document.querySelector('#hh-view [data-add-key="spending"]'),
      addGoal: !!document.querySelector('#hh-view [data-add-key="goal"]'),
      doctrine: /withdrawals begin when both clients are retired/i.test(document.querySelector('#hh-view')?.textContent || ''),
      board: !!document.querySelector('#hh-view .hh-profile__board'),
    }));
    if(!profileSpend.living || !profileSpend.health) throw new Error('core spending inputs missing from Profile');
    if(profileSpend.extras < 1) throw new Error(`spending category rows missing: ${JSON.stringify(profileSpend)}`);
    if(profileSpend.goals !== 0 || profileSpend.fundingChoices !== 0 || profileSpend.addGoal)
      throw new Error(`wizard Profile must not edit goals: ${JSON.stringify(profileSpend)}`);
    if(!profileSpend.addCategory || !profileSpend.doctrine || !profileSpend.board)
      throw new Error(`Profile spending controls or boundary missing: ${JSON.stringify(profileSpend)}`);

    // Annual savings lives outside Income & Tax; set it on the plan for Summary checks.
    await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const store = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}');
      if(!store[active]) return;
      store[active].savings = store[active].savings || {};
      store[active].savings.annual = 12000;
      localStorage.setItem('parallax.households.v1', JSON.stringify(store));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 700));
    await page.click('.htab[data-page="household"]'); await new Promise(r => setTimeout(r, 400));
    await page.click('#hh-step-4'); await new Promise(r => setTimeout(r, 350));
    const s4 = await page.evaluate(() => ({
      gauge: !!document.querySelector('#hh-view .hh-bp-gauge'),
      cta: !!document.querySelector('#hh-view .hh-bp-cta, #hh-view [data-hh-action="run-blueprint"], #hh-view [data-hh-action="goto-planning"]'),
      footNote: document.querySelector('#hh-wiz-footer .hh-wiz-foot-note')?.textContent.trim() || '',
      incomeVal: document.querySelector('#hh-view .hh-bp-flow__row:first-child .hh-bp-flow__val')?.textContent.trim() || '',
      ssRow: [...document.querySelectorAll('#hh-view .hh-bp-flow__row')].some(row =>
        /^Social Security$/i.test(row.querySelector('.hh-bp-flow__label')?.textContent.trim() || '')),
      ssVal: [...document.querySelectorAll('#hh-view .hh-bp-flow__row')].find(row =>
        /^Social Security$/i.test(row.querySelector('.hh-bp-flow__label')?.textContent.trim() || ''))
        ?.querySelector('.hh-bp-flow__val')?.textContent.trim() || '',
      spendingVal: [...document.querySelectorAll('#hh-view .hh-bp-flow__row')].find(row =>
        /^Spending$/i.test(row.querySelector('.hh-bp-flow__label')?.textContent.trim() || ''))
        ?.querySelector('.hh-bp-flow__val')?.textContent.trim() || '',
      savingsVal: [...document.querySelectorAll('#hh-view .hh-bp-flow__row')].find(row =>
        /^Annual savings$/i.test(row.querySelector('.hh-bp-flow__label')?.textContent.trim() || ''))
        ?.querySelector('.hh-bp-flow__val')?.textContent.trim() || '',
      allocLegend: document.querySelectorAll('#hh-view .hh-bp-alloc').length,
      gaugeLabel: document.querySelector('#hh-view .hh-bp-gauge__k')?.textContent.trim() || '',
      eyebrow: document.querySelector('#hh-view .hh-bp-eyebrow')?.textContent.trim() || '',
    }));
    if(!s4.gauge) throw new Error('Summary gauge missing on step 4');
    if(s4.cta) throw new Error('Run Blueprint CTA must not render on step 4');
    if(s4.footNote !== 'Step 4 of 4') throw new Error(`footer note mismatch: "${s4.footNote}"`);
    if(s4.eyebrow !== 'SUMMARY') throw new Error(`Summary eyebrow mismatch: "${s4.eyebrow}"`);
    if(!/\$180,000/.test(s4.incomeVal)) throw new Error(`Summary income must show working income, got "${s4.incomeVal}"`);
    if(!s4.ssRow) throw new Error('Summary must show a separate Social Security row');
    if(!/\$62,000/.test(s4.ssVal)) throw new Error(`Summary Social Security must total $62,000, got "${s4.ssVal}"`);
    if(!/\$90,000/.test(s4.spendingVal)) throw new Error(`Summary spending must be fixed baseline only ($90,000), got "${s4.spendingVal}"`);
    if(!/\$12,000/.test(s4.savingsVal)) throw new Error(`Summary must summarize entered annual savings, got "${s4.savingsVal}"`);
    if(s4.allocLegend < 3) throw new Error(`Summary account legend must list demo accounts, got ${s4.allocLegend}`);
    if(s4.gaugeLabel !== 'NET WORTH') throw new Error(`gauge label must read NET WORTH, got "${s4.gaugeLabel}"`);

    // Restore the shared demo fixture for downstream engine and persistence checks.
    await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const store = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}');
      if(!store[active]?.savings) return;
      store[active].savings.annual = 0;
      localStorage.setItem('parallax.households.v1', JSON.stringify(store));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 700));
    await page.click('.htab[data-page="household"]'); await new Promise(r => setTimeout(r, 400));
    await page.click('#hh-step-4'); await new Promise(r => setTimeout(r, 250));
  });

  await step('recovery: exact GPC duplicate wages stay visible and block modeling until reviewed', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const injected = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const store = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}');
      const rows = store[active]?.income?.other;
      const wage = Array.isArray(rows)
        ? rows.find(row => row?.typeId === 'wages' && Number(row.amount) > 0)
        : null;
      if(!wage) throw new Error('shared fixture has no positive wage row to duplicate');
      const originalCount = rows.length;
      rows.push(structuredClone(wage));
      localStorage.setItem('parallax.households.v1', JSON.stringify(store));
      return { originalCount, duplicateIndex: rows.length - 1 };
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(700);
    await page.click('.htab[data-page="household"]');
    await page.click('#hh-step-3');
    await sleep(350);

    const blocked = await page.evaluate(index => ({
      warning: document.querySelector('#hh-view [role="alert"]')?.textContent || '',
      status: document.querySelector('#status')?.textContent || '',
      duplicateVisible: !!document.querySelector(`#hh-view [data-rmpath="income.other.${index}"]`),
      headline: document.querySelector('#hh-view .hh-it-section-head strong')?.textContent || '',
    }), injected.duplicateIndex);
    if(!/duplicate salary entries/i.test(blocked.warning)
      || !/duplicate salary entries/i.test(blocked.status)
      || !blocked.duplicateVisible
      || !/Review required/i.test(blocked.headline)){
      throw new Error(`duplicate-wage recovery gate is incomplete: ${JSON.stringify(blocked)}`);
    }

    await page.click('#run-btn');
    await sleep(250);
    const runStatus = await page.$eval('#status', el => el.textContent || '');
    if(!/duplicate salary entries/i.test(runStatus)){
      throw new Error(`planning run did not stay blocked for duplicate wages: ${runStatus}`);
    }

    await page.click(`#hh-view [data-rmpath="income.other.${injected.duplicateIndex}"]`);
    await sleep(350);
    await page.click('#save-btn');
    await sleep(350);
    const resolved = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const store = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}');
      return {
        count: store[active]?.income?.other?.length || 0,
        warning: document.querySelector('#hh-view [role="alert"]')?.textContent || '',
        status: document.querySelector('#status')?.textContent || '',
      };
    });
    if(resolved.count !== injected.originalCount || resolved.warning){
      throw new Error(`duplicate-wage review did not restore the original facts: ${JSON.stringify(resolved)}`);
    }
  });

  await step('household tax details: accessible basis edits persist and reach engine truth', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await goStep(2);
    const detailsSelector = '#hh-view [data-hh-tax-details-root]';
    if(!await page.$(detailsSelector)) throw new Error('Tax details disclosure missing from Balance Sheet');
    if(!await page.$eval(detailsSelector, el => el.open)){
      await page.click(`${detailsSelector} > summary`);
      await sleep(250);
    }

    const contract = await page.evaluate(selector => {
      const details = document.querySelector(selector);
      const controls = [...details.querySelectorAll('[data-hh-tax-edit]')];
      const labels = [...details.querySelectorAll('label')];
      const ids = controls.map(el => el.id).filter(Boolean);
      const describedByMissing = controls.flatMap(el => (
        (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
          .filter(id => !document.getElementById(id))
      ));
      const unlabelled = controls.filter(el => (
        !el.id || !labels.some(label => label.htmlFor === el.id)
      )).map(el => el.id || el.dataset.hhTaxEdit || el.tagName);
      return {
        open: details.open,
        summaryFocusable: details.querySelector(':scope > summary')?.tabIndex >= 0,
        fieldsets: details.querySelectorAll('fieldset > legend').length,
        controls: controls.length,
        basis: [...details.querySelectorAll('[data-hh-tax-edit="basis"]')].map(el => ({
          accountId: el.dataset.hhTaxAccountId,
          value: el.value,
        })),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        describedByMissing,
        unlabelled,
        cohortControls: details.querySelectorAll('[data-hh-tax-key="conversionCohorts"], [data-hh-tax-key="inPlanRolloverCohorts"]').length,
      };
    }, detailsSelector);
    if(!contract.open || !contract.summaryFocusable) throw new Error(`Tax details disclosure accessibility failed: ${JSON.stringify(contract)}`);
    if(!contract.fieldsets || !contract.controls || !contract.basis.length) throw new Error(`Tax details fields are incomplete: ${JSON.stringify(contract)}`);
    if(contract.duplicateIds.length || contract.describedByMissing.length || contract.unlabelled.length)
      throw new Error(`Tax details labels/descriptions are invalid: ${JSON.stringify(contract)}`);
    if(contract.cohortControls) throw new Error('Deferred cohort-array controls rendered in Household');
    if(contract.basis.some(item => !item.accountId)) throw new Error(`Basis control is missing a stable account ID: ${JSON.stringify(contract.basis)}`);

    const targets = contract.basis.map((item, index) => ({
      accountId: item.accountId,
      value: (index + 1) * 10000,
    }));
    for(const target of targets){
      await page.evaluate(item => {
        const input = [...document.querySelectorAll('[data-hh-tax-edit="basis"]')]
          .find(el => el.dataset.hhTaxAccountId === item.accountId);
        if(!input) throw new Error(`Basis input disappeared for ${item.accountId}`);
        input.value = String(item.value);
        input.dispatchEvent(new Event('change', { bubbles:true }));
      }, target);
      await sleep(250);
    }

    const dirty = await page.evaluate(() => ({
      status: document.querySelector('#status')?.textContent.trim() || '',
      saveDisabled: document.querySelector('#save-btn')?.disabled,
      saveText: document.querySelector('#save-btn')?.textContent.trim() || '',
    }));
    if(!/Plan edited/.test(dirty.status) || dirty.saveDisabled || !/^Save$/.test(dirty.saveText))
      throw new Error(`Tax detail edit did not arm Save and stale scenarios: ${JSON.stringify(dirty)}`);
    await page.screenshot({ path: join(OUT, '01b-household-tax-details.png'), fullPage: true });

    await page.click('#save-btn');
    await sleep(400);
    const saved = await page.evaluate(items => {
      const db = JSON.parse(localStorage.getItem('parallax.households.v1') || 'null');
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const accounts = db?.[active]?.portfolio?.extraAccounts || [];
      return items.map(item => ({
        expected: item,
        basis: accounts.find(account => account.id === item.accountId)?.basis || null,
      }));
    }, targets);
    for(const item of saved){
      const basis = item.basis;
      if(!basis
        || basis.amount !== item.expected.value
        || basis.method !== 'reported-cost-basis'
        || basis.status !== 'confirmed'
        || basis.source !== 'household-entry'
        || basis.version !== 1
        || typeof basis.confirmedAt !== 'string'
        || !Number.isFinite(Date.parse(basis.confirmedAt))){
        throw new Error(`Saved basis envelope is invalid: ${JSON.stringify(item)}`);
      }
    }

    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(900);
    await goStep(2);
    if(!await page.$eval(detailsSelector, el => el.open)){
      await page.click(`${detailsSelector} > summary`);
      await sleep(250);
    }
    const reloaded = await page.evaluate(items => items.map(item => {
      const input = [...document.querySelectorAll('[data-hh-tax-edit="basis"]')]
        .find(el => el.dataset.hhTaxAccountId === item.accountId);
      return {
        accountId: item.accountId,
        expected: item.value,
        actual: Number(String(input?.value || '').replace(/[^0-9.-]/g, '')),
      };
    }), targets);
    if(reloaded.some(item => item.actual !== item.expected))
      throw new Error(`Saved basis values did not survive reload: ${JSON.stringify(reloaded)}`);

    const engineBasis = await page.evaluate(async items => {
      const db = JSON.parse(localStorage.getItem('parallax.households.v1') || 'null');
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const savedPlan = db?.[active];
      const { resolveInputs } = await import('/engine.js');
      const params = resolveInputs(savedPlan, {});
      return {
        actual: params.accounts.taxable.basis,
        expected: items.reduce((sum, item) => sum + item.value, 0),
        fallback: params.accounts.taxable.balance * savedPlan.portfolio.accounts.taxable.basisPct,
      };
    }, targets);
    if(engineBasis.actual !== engineBasis.expected || engineBasis.actual === engineBasis.fallback)
      throw new Error(`Engine did not consume the complete confirmed basis override: ${JSON.stringify(engineBasis)}`);

    // Restore the shared fixture: clearing replaces each envelope atomically
    // with unknown metadata, then Save makes that restoration durable.
    for(const target of targets){
      await page.evaluate(accountId => {
        const input = [...document.querySelectorAll('[data-hh-tax-edit="basis"]')]
          .find(el => el.dataset.hhTaxAccountId === accountId);
        if(!input) throw new Error(`Basis input disappeared for ${accountId}`);
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles:true }));
      }, target.accountId);
      await sleep(200);
    }
    await page.click('#save-btn');
    await sleep(400);
    const cleared = await page.evaluate(items => {
      const db = JSON.parse(localStorage.getItem('parallax.households.v1') || 'null');
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const accounts = db?.[active]?.portfolio?.extraAccounts || [];
      return items.map(item => accounts.find(account => account.id === item.accountId)?.basis || null);
    }, targets);
    if(cleared.some(basis => !basis
      || basis.amount !== null
      || basis.method !== 'unknown'
      || basis.status !== 'unknown'
      || basis.source !== null
      || basis.confirmedAt !== null
      || basis.version !== 1)){
      throw new Error(`Cleared basis facts did not restore unknown envelopes: ${JSON.stringify(cleared)}`);
    }
  });

  await step('type floor: wizard values stay readable; approved dense ledgers use compact type', async () => {
    // General wizard values stay >= 16px. The approved Income & Tax / Spending
    // ledgers intentionally use compact desktop rows; interactive type stays at
    // least 10.5px while non-interactive hierarchy may use micro type.
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
          'hh-step__label','hh-step__num','hh-col__role','hh-kv__k',
          'hh-meta__k','hh-subhead','hh-link-btn','hh-inline-form__k',
          'hh-grand-total__k','hh-grand-total__sub','hh-bp-eyebrow','hh-bp-filing',
          'hh-bp-facts__k','hh-bp-flow__label','hh-bp-flow__sub','hh-bp-gauge__k','hh-bp-gauge__sub',
          'hh-bp-alloc__pct','hh-bp-alloc__name','hh-wiz-foot-note',
          'hh-empty','hh-future-row__note','hh-future-row__name','hh-future-row__claim','hh-ledger-row__name',
          'hh-ledger-row__note','hh-ledger-row__age-label',
          'hh-dash-btn','hh-text-add','pre','hh-av','hh-avatar',
          'hh-tax-microcopy','hh-tax-details__state','hh-tax-fieldset__eyebrow',
          'hh-tax-badge','hh-tax-limit__eyebrow','hh-profile__eyebrow','hh-joint-block__eyebrow',
        ]);
        const allowMicro = el => {
          const inWizard = el.closest('.hh-wizard');
          const inChrome = el.closest('.hh-wiz-top') || el.closest('.hh-wiz-footer');
          if(!inWizard && !inChrome) return false;
          const classes = (el.className || '').toString().split(/\s+/).filter(Boolean);
          if(classes.some(c => MICRO.has(c))) return true;
          if(el.closest('.hh-tax-details') && (
            el.matches('.hh-tax-field > label')
            || el.matches('.hh-tax-limit strong')
            || el.matches('.hh-tax-money > span')
          )) return true;
          if(el.closest('.hh-wiz-footer') && classes.includes('hh-btn')) return true;
          const denseLedger = el.closest('.hh-it, .hh-sg');
          if(denseLedger){
            const fs = parseFloat(getComputedStyle(el).fontSize);
            const interactive = el.matches('input, select, button');
            if(interactive) return fs >= 10.4;
            return fs >= 8;
          }
          return !!el.closest('.hh-inline-form');
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
    if(offenders.length) throw new Error('text below its approved readability floor:\n  ' + [...new Set(offenders)].slice(0, 15).join('\n  '));
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
      return { ok: true, path: el.dataset.path, original: n };
    });
    if(!edit.ok) throw new Error(edit.reason);
    await sleep(300);
    const after = await page.evaluate(() => ({ total: document.querySelector('#hh-view .hh-grand-total__v')?.textContent.trim(), status: document.querySelector('#status')?.textContent }));
    if(after.total === totalBefore) throw new Error(`editing an account balance did not update the balance-sheet total (${totalBefore})`);
    if(!/Plan edited/.test(after.status||'')) throw new Error('account edit did not mark the plan dirty (status)');
    // Profile spending: editing living expenses updates the section total.
    await goStep(1);
    const spendBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-sg--profile .hh-it-section-head strong')?.textContent.trim());
    await page.evaluate(() => { const el = document.querySelector('#hh-view input[data-path="expenses.living"]'); el.value = '99,999'; el.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(300);
    const spendAfter = await page.evaluate(() => document.querySelector('#hh-view .hh-sg--profile .hh-it-section-head strong')?.textContent.trim());
    if(spendBefore === spendAfter) throw new Error(`editing living expenses did not update the spending total (${spendBefore})`);
    // Restore the two fields explicitly; Load Demo is a switch, not a reset.
    await goStep(2);
    await page.evaluate(({ path, value }) => {
      const el = document.querySelector(`#hh-view input[data-path="${path}"]`);
      el.value = String(value); el.dispatchEvent(new Event('change', { bubbles:true }));
    }, { path: edit.path, value: edit.original });
    await goStep(1);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      el.value = '38,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(250);
  });

  await step('household step fields: filing/born writes + co-client toggle + screenshots', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 1. Filing status select (step 1) writes to plan.meta.filingStatus.
    await goStep(1);
    const fsEl = await page.$('#hh-view select[data-path="meta.filingStatus"]');
    if(!fsEl) throw new Error('filing status <select> missing from step 1');
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="meta.filingStatus"]');
      el.value = 'single'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    const filingVal = await page.evaluate(() => document.querySelector('#hh-view select[data-path="meta.filingStatus"]')?.value || '');
    if(filingVal !== 'single') throw new Error(`filing status did not update after change: "${filingVal}"`);
    // Restore married
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view select[data-path="meta.filingStatus"]');
      el.value = 'marriedFilingJointly'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);

    // 2. BORN year drives the person's current age (the engine input).
    const ageBefore = await page.evaluate(() => document.querySelector('#hh-view .hh-derived-in')?.value.trim());
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="household.primary.birthYear"]');
      el.value = '1970'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    const ageAfter = await page.evaluate(() => document.querySelector('#hh-view .hh-derived-in')?.value.trim());
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
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="income.socialSecurity.primary.claimAge"]');
      el.value = '70'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(250);
    let claimAge = await page.evaluate(() => document.querySelector('#hh-view input[data-path="income.socialSecurity.primary.claimAge"]')?.value || '');
    if(claimAge !== '70') throw new Error(`primary SS claim age did not persist edit (got ${claimAge})`);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="income.socialSecurity.primary.claimAge"]');
      el.value = '71'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(250);
    claimAge = await page.evaluate(() => document.querySelector('#hh-view input[data-path="income.socialSecurity.primary.claimAge"]')?.value || '');
    if(claimAge !== '70') throw new Error(`primary SS claim age escaped the 62-70 limit (got ${claimAge})`);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="income.socialSecurity.primary.claimAge"]');
      el.value = '67'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);

    // 4. Co-client remove is blocked while spouse-owned accounts exist; reassign first.
    await goStep(1);
    let coClientBlockMsg = null;
    const onBlockDialog = async dialog => {
      coClientBlockMsg = dialog.message();
      await dialog.dismiss();
    };
    page.on('dialog', onBlockDialog);
    await page.evaluate(() => {
      document.querySelector('#hh-view [data-hh-action="remove-spouse"]')?.click();
    });
    await sleep(400);
    page.off('dialog', onBlockDialog);
    if(!/Reassign or remove Co-Client accounts before removing the Co-Client\./.test(coClientBlockMsg || ''))
      throw new Error(`co-client removal must block with ownership message, got "${coClientBlockMsg}"`);

    // Reassign spouse-owned accounts by removing them so co-client removal can proceed.
    await goStep(2);
    for(let i = 0; i < 4; i++){
      const removed = await page.evaluate(() => {
        const col = [...document.querySelectorAll('#hh-view .hh-col')].find(el => /CO-CLIENT/i.test(el.textContent || ''));
        const btn = col?.querySelector('.row-x[data-rmpath^="portfolio.extraAccounts."]');
        if(!btn) return false;
        btn.click();
        return true;
      });
      if(!removed) break;
      await sleep(250);
    }
    await page.click('#save-btn');
    await sleep(300);

    // Confirmed co-client tax facts require the explicit discard warning and
    // must reset only after that warning is accepted.
    await page.evaluate(() => {
      const dbKey = 'parallax.households.v1';
      const activeKey = 'parallax.activeHouseholdId';
      const active = localStorage.getItem(activeKey);
      const db = JSON.parse(localStorage.getItem(dbKey) || '{}');
      if(!active || !db[active]?.taxProfiles?.spouse?.birthDate){
        throw new Error('co-client tax profile missing before discard probe');
      }
      db[active].taxProfiles.spouse.birthDate = {
        value: '1963-01-01',
        status: 'confirmed',
        source: 'household-entry',
        confirmedAt: '2026-07-11T12:00:00Z',
        version: 1,
      };
      localStorage.setItem(dbKey, JSON.stringify(db));
    });
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(800);
    await goStep(1);

    const removeBtnBefore = await page.$('#hh-view [data-hh-action="remove-spouse"]');
    if(!removeBtnBefore) throw new Error('Remove (co-client) action missing from step 1');
    let removeConfirmed = false;
    let removePrompt = null;
    const onRemoveDialog = async dialog => {
      removeConfirmed = true;
      removePrompt = dialog.message();
      await dialog.accept();
    };
    page.on('dialog', onRemoveDialog);
    await page.evaluate(() => {
      document.querySelector('#hh-view [data-hh-action="remove-spouse"]').click();
    });
    await sleep(400);
    page.off('dialog', onRemoveDialog);
    if(!removeConfirmed) throw new Error('co-client removal confirm dialog did not appear');
    const discardPrompt = 'Remove co-client from this household? Confirmed co-client tax facts will be discarded.';
    if(removePrompt !== discardPrompt){
      throw new Error(`confirmed co-client removal must use the discard warning, got "${removePrompt}"`);
    }
    await sleep(350);
    const addSpouseVisible = await page.$('#hh-view [data-hh-action="add-spouse"]');
    if(!addSpouseVisible) throw new Error('after removing co-client, "+ Add Co-Client" did not appear');
    const nameAfterRemove = await page.evaluate(() => document.querySelector('#hh-rail-name')?.textContent.trim() || '');
    if(/&/.test(nameAfterRemove)) throw new Error(`household name still shows "&" after co-client removal: "${nameAfterRemove}"`);
    await page.click('#save-btn');
    await sleep(300);
    const spouseProfileAfterRemove = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const db = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}');
      return active ? db[active]?.taxProfiles?.spouse : null;
    });
    const expectedBlankSpouse = createBlankTaxProfiles().spouse;
    if(JSON.stringify(spouseProfileAfterRemove) !== JSON.stringify(expectedBlankSpouse)){
      throw new Error('accepted co-client removal must reset the spouse tax profile to the blank current schema');
    }
    // Re-add co-client
    await page.click('#hh-view [data-hh-action="add-spouse"]');
    await sleep(350);
    const addSpouseGone = await page.$('#hh-view [data-hh-action="add-spouse"]');
    if(addSpouseGone) throw new Error('"+ Add Co-Client" should disappear after adding co-client');
    const spouseInputs = await page.evaluate(() => document.querySelectorAll('#hh-view input[data-path^="household.spouse"]').length);
    if(spouseInputs < 1) throw new Error(`step 1 after add should have co-client born input, got ${spouseInputs}`);
    await page.evaluate(() => {
      const born = document.querySelector('#hh-view input[data-path="household.spouse.birthYear"]');
      if(born){ born.value = String(new Date().getFullYear() - 63); born.dispatchEvent(new Event('change', { bubbles:true })); }
    });
    await sleep(200);
    await goStep(3);
    const spouseClaimAge = await page.evaluate(() => document.querySelector('#hh-view input[data-path="income.socialSecurity.spouse.claimAge"]')?.value || '');
    if(spouseClaimAge !== '67') throw new Error(`new co-client SS claim age must default to 67 (got ${spouseClaimAge})`);
    // Restore co-client retirement age to demo value (Client 2 retires at 65) —
    // retirement ages live on step 1 in the blueprint wizard.
    await goStep(1);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="household.spouse.retirementAge"]');
      if(el){ el.value = '65'; el.dispatchEvent(new Event('change', { bubbles:true })); }
    });
    await sleep(200);

    // Restore spouse-owned accounts removed for the ownership block probe.
    const restoreAccount = async (owner, label, amount) => {
      await page.click(`#hh-view [data-hh-action="open-account-form"][data-owner="${owner}"]`);
      await sleep(250);
      await page.evaluate(({ label, amount }) => {
        const form = document.querySelector('#hh-acct-form');
        const typeSel = form.querySelector('.hh-form-type');
        typeSel.value = String([...typeSel.options].findIndex(o => o.textContent.trim() === label));
        form.querySelector('.hh-form-val').value = amount;
        form.querySelector('[data-hh-action="save-account"]').click();
      }, { label, amount });
      await sleep(350);
    };
    await goStep(2);
    await restoreAccount('spouse', 'Brokerage (taxable)', '800,000');
    await restoreAccount('spouse', 'Roth IRA', '400,000');
    const spouseTotal = await page.evaluate(() => {
      const col = [...document.querySelectorAll('#hh-view .hh-col')].find(el => /CO-CLIENT/i.test(el.textContent || ''));
      return col?.querySelector('.hh-col__sum')?.textContent.trim() || '';
    });
    if(!/\$1,200,000/.test(spouseTotal)) throw new Error(`restoring spouse accounts must restore the co-client total, got "${spouseTotal}"`);
  });

  await step('household menu: New creates blank; Load Demo switches without resetting it', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-new').click()); await sleep(600);
    const afterNew = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const db = JSON.parse(localStorage.getItem('parallax.households.v1') || 'null');
      return {
        active,
        record: db?.[active],
        name: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
        step: document.querySelector('.hh-stepper .hh-step.is-current')?.dataset.step || '',
      };
    });
    if(!afterNew.active || afterNew.active === 'demo' || afterNew.record?.meta?.isDemo !== false)
      throw new Error(`New Household did not create a custom blank record: ${JSON.stringify(afterNew)}`);
    if(afterNew.record?.income?.socialSecurity?.primary?.claimAge !== 67 || afterNew.record?.income?.socialSecurity?.primary?.pia !== 0)
      throw new Error(`new household SS defaults are wrong: ${JSON.stringify(afterNew.record?.income?.socialSecurity)}`);
    if(afterNew.step !== '1') throw new Error(`new blank household must land on step 1, got "${afterNew.step}"`);

    await page.click('.htab[data-page="tax-buckets"]'); await sleep(350);
    await page.evaluate(() => document.querySelector('[data-tb-explore]')?.click()); await sleep(650);
    const emptyBuckets = await page.evaluate(() => ({
      message:document.querySelector('.tb-empty')?.textContent.trim() || '',
      pods:document.querySelectorAll('.tb-pod').length,
    }));
    if(emptyBuckets.message !== 'No accounts entered yet — add accounts in Household to populate buckets.' || emptyBuckets.pods !== 0){
      throw new Error(`blank household Tax Buckets state is not honest: ${JSON.stringify(emptyBuckets)}`);
    }

    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-load-demo').click()); await sleep(700);
    const afterDemo = await page.evaluate(() => ({
      active: localStorage.getItem('parallax.activeHouseholdId'),
      name: document.querySelector('#hh-rail-name')?.textContent.trim() || '',
      step: document.querySelector('.hh-stepper .hh-step.is-current')?.dataset.step || '',
    }));
    if(afterDemo.active !== 'demo' || !/Test Client/.test(afterDemo.name))
      throw new Error(`Load Demo did not reopen the saved demo record: ${JSON.stringify(afterDemo)}`);
    if(afterDemo.step !== '4') throw new Error(`filled saved demo must land on Summary, got "${afterDemo.step}"`);
  });

  await step('household menu: Save As creates a named copy loadable from the switcher', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(300);
    const before = await page.evaluate(() => ({
      active: localStorage.getItem('parallax.activeHouseholdId'),
      keys: Object.keys(JSON.parse(localStorage.getItem('parallax.households.v1') || '{}')),
    }));
    page.once('dialog', async dialog => { await dialog.accept('Save As Fixture'); });
    await page.evaluate(() => document.querySelector('#hh-save-as').click());
    await sleep(700);
    const after = await page.evaluate(() => {
      const active = localStorage.getItem('parallax.activeHouseholdId');
      const db = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}');
      const names = [...document.querySelectorAll('#hh-switch option')].map(o => o.textContent.trim());
      return {
        active,
        name: db?.[active]?.meta?.name || '',
        isDemo: db?.[active]?.meta?.isDemo,
        keys: Object.keys(db),
        names,
        switchValue: document.querySelector('#hh-switch')?.value || '',
      };
    });
    if(after.active === before.active || after.active === 'demo')
      throw new Error(`Save As did not activate a new household id: ${JSON.stringify({ before, after })}`);
    if(after.name !== 'Save As Fixture' || after.isDemo !== false)
      throw new Error(`Save As did not persist the named copy: ${JSON.stringify(after)}`);
    if(!after.names.includes('Save As Fixture') || after.switchValue !== after.active)
      throw new Error(`Save As copy missing from switcher: ${JSON.stringify(after)}`);
    if(after.keys.length <= before.keys.length)
      throw new Error(`Save As did not add a household record: ${JSON.stringify({ before, after })}`);
  });

  await step('typed accounts feed the engine: blank plan + $1M brokerage drives scenario results', async () => {
    // The account bank must reach the ENGINE, not just the Household display:
    // clear the household ($0 everywhere → Baseline median renders '—'), add a
    // $1,000,000 Brokerage (taxable) via the form, Run, and the engine-computed
    // Baseline median must become a $-figure of $1M scale (growth over a 30-year
    // horizon with zero spending). Median comes from s.res.envelope — engine output.
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-new').click()); await sleep(600);

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
    if(status.trim() !== 'Complete'){
      throw new Error(`All blank-household scenarios must complete after adding the account (status: "${status}")`);
    }
    const medianTxt = await page.evaluate(() => document.querySelector('#scn-view .scol__median b')?.textContent.trim() || '');
    const parsed = (() => {
      const m = medianTxt.match(/^\$([\d.,]+)\s*([MK]?)$/i);
      if(!m) return null;
      const n = parseFloat(m[1].replace(/,/g, ''));
      return m[2].toUpperCase() === 'M' ? n * 1e6 : m[2].toUpperCase() === 'K' ? n * 1e3 : n;
    })();
    if(parsed == null) throw new Error(`Baseline median not a $-figure after Run: "${medianTxt}"`);
    if(parsed < 500000) throw new Error(`engine starting assets do not reflect the $1M account (median ${medianTxt})`);

    // Return to the saved demo household for the steps that follow.
    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-load-demo').click()); await sleep(800);
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
    if(!withSpouse || !withoutSpouse){
      const cashFlowState = await page.evaluate(() => ({
        rows: document.querySelectorAll('#scn-view .cf-row').length,
        ages: [...document.querySelectorAll('#scn-view .cf-row .cf-cell--age')].map(el => el.textContent.trim()).slice(0, 40),
        text: document.querySelector('#scn-view .cf-ledger')?.textContent.trim().slice(0, 240) || '',
      }));
      throw new Error(`cash-flow income cell missing at age 72 (${withSpouse} vs ${withoutSpouse}); state=${JSON.stringify(cashFlowState)}`);
    }
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
    // Essential expenses live on wizard step 1 (Profile).
    await goStep(1);
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
    await goStep(1);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      el.value = '38,000'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);
  });

    await step('goals Horizon: timeline, glass card, lanes, and no lifetime aggregate', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-sub-target="goals"]');
    await sleep(450);
    const m = await page.evaluate(() => {
      const pageRoot = document.querySelector('.gh-page');
      const text = (pageRoot?.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        page: !!pageRoot,
        card: !!document.querySelector('.gh-card'),
        title: document.querySelector('.gh-title')?.textContent.trim() || '',
        lanes: document.querySelectorAll('.gh-lane').length,
        chips: document.querySelectorAll('.gh-chip').length,
        marks: document.querySelectorAll('.gh-band, .gh-diamond').length,
        ticks: document.querySelectorAll('.gh-tick').length,
        add: !!document.querySelector('.gh-add-toggle'),
        lifetime: /Lifetime goal spend|Lifetime total|Lifetime/i.test(text),
        legacy: !!document.querySelector('#gl-ledger, .glx-row, .glc-card, .ga-board'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if(!m.page || !m.card) throw new Error('Goals Horizon page/card did not render');
    if(m.title !== 'Retirement Lifestyle') throw new Error(`Goals Horizon title wrong: "${m.title}"`);
    if(m.lanes < 1 || m.chips !== m.lanes || m.marks !== m.lanes)
      throw new Error(`Goals Horizon lanes incomplete (${JSON.stringify(m)})`);
    if(m.ticks < 5 || !m.add) throw new Error(`Goals Horizon axis/add control incomplete (${JSON.stringify(m)})`);
    if(m.lifetime) throw new Error('Goals Horizon must not render Lifetime goal spend');
    if(m.legacy) throw new Error('retired Goals implementation still renders');
    if(m.overflow > 2) throw new Error(`Goals Horizon caused ${m.overflow}px document overflow`);
    await page.screenshot({ path: join(OUT, '02-goals.png'), fullPage: true });
  });

  await step('goals Horizon: add, edit, cadence, timing, category, duplicate, delete, undo', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-sub-target="goals"]');
    await sleep(300);
    const before = await page.evaluate(() => document.querySelectorAll('.gh-lane').length);
    await page.click('.gh-add-toggle');
    await sleep(150);
    const starters = await page.evaluate(() => document.querySelectorAll('.gh-starter').length);
    if(starters !== 8) throw new Error(`expected 8 goal starters, got ${starters}`);
    await page.click('.gh-starter[data-add-category="travel"]');
    await sleep(450);
    let m = await page.evaluate(() => ({
      lanes: document.querySelectorAll('.gh-lane').length,
      rail: !!document.querySelector('.gh-rail'),
      name: document.querySelector('.gh-name-input')?.value || '',
      amount: document.querySelector('.gh-amount-input')?.value || '',
      status: document.querySelector('#status')?.textContent || '',
    }));
    if(m.lanes !== before + 1 || !m.rail || m.name !== 'Travel' || m.amount !== '10,000')
      throw new Error(`Travel starter did not create the expected editable lane (${JSON.stringify(m)})`);
    if(!/Plan edited/.test(m.status)) throw new Error(`goal add did not arm plan status: "${m.status}"`);

    await page.click('.gh-name-input');
    await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
    await page.keyboard.type('European summers');
    await page.evaluate(() => {
      const el = document.querySelector('.gh-amount-input');
      el.value = '24000';
      el.dispatchEvent(new Event('input', { bubbles:true }));
    });
    await sleep(150);
    m = await page.evaluate(() => ({
      railName: document.querySelector('.gh-name-input')?.value,
      chipName: [...document.querySelectorAll('.gh-chip__name')].some(el => el.textContent === 'European summers'),
      amount: document.querySelector('.gh-amount-input')?.value,
      chipAmount: [...document.querySelectorAll('.gh-chip__amount')].find(el => el.closest('.gh-chip')?.querySelector('.gh-chip__name')?.textContent === 'European summers')?.textContent,
    }));
    if(m.railName !== 'European summers' || !m.chipName || m.amount !== '24,000' || !/24k/.test(m.chipAmount || ''))
      throw new Error(`live goal editing failed (${JSON.stringify(m)})`);

    await page.click('[data-action="per-month"]'); await sleep(250);
    m = await page.evaluate(() => ({
      amount: document.querySelector('.gh-amount-input')?.value,
      monthly: document.querySelector('[data-action="per-month"]')?.classList.contains('is-selected'),
    }));
    if(m.amount !== '2,000' || !m.monthly) throw new Error(`monthly cadence conversion failed (${JSON.stringify(m)})`);
    await page.click('[data-action="kind-once"]'); await sleep(250);
    if(!await page.evaluate(() => !!document.querySelector('[data-field="once-age"]')))
      throw new Error('one-time cadence did not expose a single age control');
    await page.click('[data-action="kind-rec"]'); await sleep(250);
    if(!await page.evaluate(() => !!document.querySelector('[data-field="start-age"]') && !!document.querySelector('[data-field="end-age"]')))
      throw new Error('recurring cadence did not restore a range');
    await page.click('[data-action="preset"][data-preset="later"]'); await sleep(250);
    m = await page.evaluate(() => ({
      start: document.querySelector('[data-field="start-age"]')?.value,
      end: document.querySelector('[data-field="end-age"]')?.value,
    }));
    if(!m.start || !m.end || +m.start >= +m.end) throw new Error(`later preset produced an invalid range (${JSON.stringify(m)})`);
    await page.click('[data-action="category"][data-category="home"]'); await sleep(250);
    if(!await page.evaluate(() => document.querySelector('.gh-rail__icon img')?.getAttribute('src')?.endsWith('/home.svg')))
      throw new Error('category change did not update the source icon');

    const beforeDuplicate = await page.evaluate(() => document.querySelectorAll('.gh-lane').length);
    await page.click('[data-action="duplicate"]'); await sleep(350);
    m = await page.evaluate(() => ({
      lanes: document.querySelectorAll('.gh-lane').length,
      name: document.querySelector('.gh-name-input')?.value || '',
    }));
    if(m.lanes !== beforeDuplicate + 1 || !m.name.endsWith(' copy'))
      throw new Error(`duplicate failed (${JSON.stringify(m)})`);
    await page.click('[data-action="delete"]'); await sleep(350);
    m = await page.evaluate(() => ({
      lanes: document.querySelectorAll('.gh-lane').length,
      toast: document.querySelector('.gh-toast')?.textContent || '',
    }));
    if(m.lanes !== beforeDuplicate || !/Undo/.test(m.toast)) throw new Error(`delete/toast failed (${JSON.stringify(m)})`);
    await page.click('[data-action="undo"]'); await sleep(350);
    if(await page.evaluate(() => document.querySelectorAll('.gh-lane').length) !== beforeDuplicate + 1)
      throw new Error('undo did not restore the deleted goal');
    await page.click('#save-btn'); await sleep(250);
  });

  await step('goals Horizon: drag preserves a lane span and reaches Scenarios', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-sub-target="goals"]'); await sleep(300);
    const target = await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.gh-chip')]
        .find(el => el.querySelector('.gh-chip__name')?.textContent.includes('European summers'));
      if(!chip) return null;
      const rect = chip.getBoundingClientRect();
      return { x:rect.left + rect.width/2, y:rect.top + rect.height/2, title:chip.title };
    });
    if(!target) throw new Error('drag target missing');
    await page.mouse.move(target.x,target.y);
    await page.mouse.down();
    await page.mouse.move(target.x-100,target.y,{steps:8});
    await page.mouse.up();
    await sleep(450);
    const after = await page.evaluate(() => [...document.querySelectorAll('.gh-chip')]
      .find(el => el.querySelector('.gh-chip__name')?.textContent.includes('European summers'))?.title || '');
    if(after === target.title || !/Every year, ages/.test(after))
      throw new Error(`goal drag did not shift the recurring range ("${target.title}" -> "${after}")`);

    const laneCount = await page.evaluate(() => document.querySelectorAll('.gh-lane').length);
    await page.click('button[data-page="scenarios"]'); await sleep(900);
    await page.click('#scn-seg-compare'); await sleep(350);
    const active = await page.evaluate(() => {
      const text = document.querySelector('#scn-view .goal-pill, #scn-view .goal-note')?.textContent || '';
      return +(text.match(/(\d+)\s*active/)?.[1] || -1);
    });
    if(active !== laneCount) throw new Error(`Goals Horizon inventory did not reach Scenarios (${laneCount} lanes / ${active} active)`);
  });

  await step('goals Horizon: blank household stays blank and derives starter timing from its plan', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('.htab[data-page="household"]'); await sleep(250);
    await page.evaluate(() => document.querySelector('#hh-new').click()); await sleep(650);
    await page.click('.htab[data-sub-target="goals"]'); await sleep(350);
    let m = await page.evaluate(() => ({
      lanes: document.querySelectorAll('.gh-lane').length,
      empty: document.querySelector('.gh-empty')?.textContent || '',
      lifetime: /Lifetime/i.test(document.querySelector('.gh-page')?.textContent || ''),
    }));
    if(m.lanes !== 0 || !/Nothing on the horizon yet/.test(m.empty) || m.lifetime)
      throw new Error(`blank Goals Horizon state wrong (${JSON.stringify(m)})`);
    await page.click('.gh-add-toggle'); await page.click('.gh-starter[data-add-category="home"]'); await sleep(350);
    m = await page.evaluate(() => ({
      lanes: document.querySelectorAll('.gh-lane').length,
      name: document.querySelector('.gh-name-input')?.value,
      age: document.querySelector('[data-field="once-age"]')?.value,
    }));
    if(m.lanes !== 1 || m.name !== 'Home improvements' || m.age !== '68')
      throw new Error(`blank-household starter did not derive from its 65 retirement age (${JSON.stringify(m)})`);

    await page.click('.htab[data-page="household"]'); await sleep(250);
    await page.evaluate(() => document.querySelector('#hh-load-demo').click()); await sleep(850);
    await page.click('.htab[data-sub-target="goals"]'); await sleep(350);
    const restored = await page.evaluate(() => [...document.querySelectorAll('.gh-chip__name')].map(el => el.textContent));
    if(!restored.includes('European summers') || !restored.some(name => name.endsWith(' copy')))
      throw new Error(`saved demo Goals Horizon inventory did not persist (${JSON.stringify(restored)})`);
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
    // Re-anchor the demo plan + scenario levers after earlier household edits.
    await page.evaluate(() => {
      const key = 'parallax.households.v1';
      const db = JSON.parse(localStorage.getItem(key) || '{}');
      const demo = db.demo;
      if(!demo) return;
      demo.meta.primaryName = 'Test Client';
      demo.meta.spouseName = 'Test Co-Client';
      demo.meta.filingStatus = 'marriedFilingJointly';
      demo.household.primary = { currentAge: 64, retirementAge: 66, planEndAge: 95, birthYear: 1962 };
      demo.household.spouse = { currentAge: 63, retirementAge: 65, birthYear: 1963 };
      demo.portfolio.extraAccounts = [
        { type:'Traditional IRA', bucket:'traditional', owner:'client', balance:1600000 },
        { type:'Brokerage (taxable)', bucket:'taxable', owner:'spouse', balance:800000 },
        { type:'Roth IRA', bucket:'roth', owner:'spouse', balance:400000 },
      ];
      delete demo.meta.accountSchemaVersion;
      localStorage.setItem(key, JSON.stringify(db));
      localStorage.removeItem('parallax.scenarios.demo.v1');
    });
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    await page.click('#run-btn');
    for(let i = 0; i < 60; i++){
      await new Promise(r => setTimeout(r, 500));
      const status = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
      if(/Complete/i.test(status)) break;
    }

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
        taxDisclosure: (() => {
          const el = v?.querySelector('[data-tax-disclosure]');
          return el ? {
            state: el.dataset.taxState || '',
            scope: el.querySelector('[data-tax-scope-disclosure]')?.textContent.trim() || '',
            fallback: el.querySelector('[data-tax-fallback]')?.textContent.trim() || '',
            warnings: [...el.querySelectorAll('[data-tax-warnings] li')].map(item => item.textContent.trim()),
          } : null;
        })(),
        accumTax: (() => {
          const row = [...(v?.querySelectorAll('.cf-row') || [])].find(el =>
            el.querySelector('.cf-cell--age')?.textContent.trim() === '64'
          );
          return row?.querySelector('.cf-cell--tax')?.textContent.trim() || '';
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
    if(m.taxHeader?.source !== 'federal-converged-row' || m.taxHeader?.scope !== 'MODELED_FEDERAL_LINE_24') throw new Error(`typical path converged tax scope missing: ${JSON.stringify(m.taxHeader)}`);
    if(!/retirement rows funded and converged; working years reporting-only/i.test(m.taxHeader?.title || '')) throw new Error(`typical path tax tooltip missing phase scope: ${JSON.stringify(m.taxHeader)}`);
    if(m.taxCompare) throw new Error(`obsolete federal-vs-engine comparison is still shown: ${JSON.stringify(m.taxCompare)}`);
    if(m.taxDisclosure?.state !== 'federal-converged-row' || !/retirement rows funded and converged, working years reporting-only/i.test(m.taxDisclosure?.scope || '')) throw new Error(`typical path converged federal scope disclosure missing: ${JSON.stringify(m.taxDisclosure)}`);
    if(m.taxDisclosure?.fallback) throw new Error(`typical path unexpectedly uses engine fallback: ${JSON.stringify(m.taxDisclosure)}`);
    if(!/^\$[\d,]+/.test(m.accumTax)) throw new Error(`accumulation-year Tax cell is not populated: "${m.accumTax}"`);
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
    if(rmdAge !== '75') throw new Error(`RMD start marker not at age 75 (got "${rmdAge}")`);

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
    const availableModes = await page.evaluate(() => [...document.querySelectorAll('#path-mode option')].map(o => o.value));
    const expectedModes = ['typical', 'favorable', 'stressed-pp', 'sequence-dotcom-gfc', 'random'];
    if(JSON.stringify(availableModes) !== JSON.stringify(expectedModes)){
      throw new Error(`path-mode options mismatch: ${JSON.stringify(availableModes)}`);
    }
    if(await page.evaluate(() => !!document.querySelector('#path-seed, #path-index'))) {
      throw new Error('seed/index path controls must stay removed');
    }
    for(const mode of ['favorable', 'stressed-pp', 'sequence-dotcom-gfc']){
      if(!availableModes.includes(mode)) throw new Error(`${mode} option missing from path-mode select`);
      await page.select('#path-mode', mode);
      await new Promise(r => setTimeout(r, 400));
      if(await waitCashRows(page, 10) < 10) throw new Error(`${mode} path emptied the cash-flow table`);
      const federalPath = await page.evaluate(() => {
        const th = document.querySelector('#scn-view .cf-table__head .cf-th[data-tax-source]');
        const compare = document.querySelector('#scn-view [data-tax-compare]');
        const disclosure = document.querySelector('#scn-view [data-tax-disclosure]');
        return {
          mode: document.querySelector('#path-mode')?.value || '',
          cols: [...document.querySelectorAll('#scn-view .cf-table__head .cf-th')].map(el => el.textContent.trim()),
          rowWidths: [...document.querySelectorAll('#scn-view .cf-row')].map(el => el.children.length),
          returnColors: [...document.querySelectorAll('#scn-view .cf-cell--ret')].map(el => el.style.color),
          wdColors: [...document.querySelectorAll('#scn-view .cf-cell--wd')].map(el => el.style.color),
          header: th ? {
            label: th.textContent.trim(),
            source: th.dataset.taxSource || '',
            scope: th.dataset.taxScope || '',
          } : null,
          compare: compare ? {
            path: compare.dataset.taxPath || '',
            federalTotal: Number(compare.dataset.federalTotal),
            enginePathTotal: Number(compare.dataset.enginePathTotal),
            delta: Number(compare.dataset.delta),
          } : null,
          disclosure: disclosure ? {
            state: disclosure.dataset.taxState || '',
            scope: disclosure.querySelector('[data-tax-scope-disclosure]')?.textContent.trim() || '',
          } : null,
        };
      });
      if(federalPath.mode !== mode) throw new Error(`${mode} path mode did not stay selected: ${JSON.stringify(federalPath)}`);
      if(JSON.stringify(federalPath.cols) !== JSON.stringify(EXPECT)) throw new Error(`${mode} changed the rich Cash Flow columns: ${JSON.stringify(federalPath.cols)}`);
      if(!federalPath.rowWidths.length || federalPath.rowWidths.some(width => width !== 11)) throw new Error(`${mode} changed the 11-cell Cash Flow rows: ${JSON.stringify(federalPath.rowWidths)}`);
      if(!federalPath.returnColors.length || federalPath.returnColors.some(color => !['var(--text-mute)', 'var(--down)', 'var(--tone-green)'].includes(color))) throw new Error(`${mode} changed portfolio Return colors: ${JSON.stringify(federalPath.returnColors)}`);
      if(!federalPath.wdColors.length || federalPath.wdColors.some(color => !['var(--text-mute)', 'var(--text-3)', 'var(--down)', 'var(--down-deep)'].includes(color))) throw new Error(`${mode} changed WD Rate colors: ${JSON.stringify(federalPath.wdColors)}`);
      if(federalPath.header?.label !== 'Tax' || federalPath.header?.source !== 'federal-converged-row' || federalPath.header?.scope !== 'MODELED_FEDERAL_LINE_24') throw new Error(`${mode} path tax scope is not converged federal: ${JSON.stringify(federalPath)}`);
      if(federalPath.compare) throw new Error(`${mode} path still shows an obsolete sidecar comparison: ${JSON.stringify(federalPath)}`);
      if(federalPath.disclosure?.state !== 'federal-converged-row' || !/retirement rows funded and converged, working years reporting-only/i.test(federalPath.disclosure?.scope || '')) throw new Error(`${mode} converged federal scope disclosure missing: ${JSON.stringify(federalPath)}`);
      await new Promise(r => setTimeout(r, 700));
      await page.screenshot({ path: join(OUT, `04-cashflow-${mode}.png`), fullPage: true });
    }
    await page.select('#path-mode', 'typical');
    await new Promise(r => setTimeout(r, 300));
    const restoredTaxHeader = await page.evaluate(() => {
      const th = document.querySelector('#scn-view .cf-table__head .cf-th[data-tax-source]');
      return th ? { label: th.textContent.trim(), source: th.dataset.taxSource || '' } : null;
    });
    if(restoredTaxHeader?.label !== 'Tax' || restoredTaxHeader?.source !== 'federal-converged-row') throw new Error(`typical path tax scope did not restore: ${JSON.stringify(restoredTaxHeader)}`);
    if(await page.evaluate(() => !!document.querySelector('#scn-view [data-tax-compare]'))) throw new Error('obsolete federal-vs-engine summary restored on typical path');
    if(!await page.evaluate(() => /retirement rows funded and converged, working years reporting-only/i.test(document.querySelector('#scn-view [data-tax-scope-disclosure]')?.textContent || ''))) throw new Error('readable phase-scoped federal disclosure did not restore on typical path');

    await page.select('#path-mode', 'random');
    await new Promise(r => setTimeout(r, 300));
    if(await waitCashRows(page, 10) < 10) throw new Error('random path emptied the cash-flow table');
    const randomUi = await page.evaluate(() => ({
      mode: document.querySelector('#path-mode')?.value || '',
      regenHidden: document.querySelector('#path-regenerate')?.hidden,
      label: document.querySelector('#path-mode option:checked')?.textContent.trim() || '',
      cols: [...document.querySelectorAll('#scn-view .cf-table__head .cf-th')].map(el => el.textContent.trim()),
      rowWidths: [...document.querySelectorAll('#scn-view .cf-row')].map(el => el.children.length),
      returnColors: [...document.querySelectorAll('#scn-view .cf-cell--ret')].map(el => el.style.color),
      wdColors: [...document.querySelectorAll('#scn-view .cf-cell--wd')].map(el => el.style.color),
      taxHeader: (() => {
        const th = document.querySelector('#scn-view .cf-table__head .cf-th[data-tax-source]');
        return th ? { source: th.dataset.taxSource || '', scope: th.dataset.taxScope || '' } : null;
      })(),
      taxDisclosure: (() => {
        const el = document.querySelector('#scn-view [data-tax-disclosure]');
        return el ? { state: el.dataset.taxState || '', scope: el.querySelector('[data-tax-scope-disclosure]')?.textContent.trim() || '' } : null;
      })(),
    }));
    if(randomUi.mode !== 'random') throw new Error(`Random path did not stay selected: ${JSON.stringify(randomUi)}`);
    if(randomUi.regenHidden) throw new Error('Regenerate must show for Random path');
    if(/seed/i.test(randomUi.label)) throw new Error(`Random path must not expose seed label: ${JSON.stringify(randomUi)}`);
    if(JSON.stringify(randomUi.cols) !== JSON.stringify(EXPECT) || randomUi.rowWidths.some(width => width !== 11)) throw new Error(`Random path changed the rich Cash Flow table: ${JSON.stringify(randomUi)}`);
    if(!randomUi.returnColors.length || randomUi.returnColors.some(color => !['var(--text-mute)', 'var(--down)', 'var(--tone-green)'].includes(color))) throw new Error(`Random path changed portfolio Return colors: ${JSON.stringify(randomUi.returnColors)}`);
    if(!randomUi.wdColors.length || randomUi.wdColors.some(color => !['var(--text-mute)', 'var(--text-3)', 'var(--down)', 'var(--down-deep)'].includes(color))) throw new Error(`Random path changed WD Rate colors: ${JSON.stringify(randomUi.wdColors)}`);
    if(randomUi.taxHeader?.source !== 'federal-converged-row' || randomUi.taxHeader?.scope !== 'MODELED_FEDERAL_LINE_24') throw new Error(`Random path changed the converged federal tax header: ${JSON.stringify(randomUi)}`);
    if(randomUi.taxDisclosure?.state !== 'federal-converged-row' || !/retirement rows funded and converged, working years reporting-only/i.test(randomUi.taxDisclosure?.scope || '')) throw new Error(`Random path changed the federal tax disclosure: ${JSON.stringify(randomUi)}`);

    await page.click('#path-regenerate');
    await new Promise(r => setTimeout(r, 300));
    if(await waitCashRows(page, 10) < 10) throw new Error('regenerating Random path emptied the cash-flow table');

    await page.click('#scn-seg-compare');
    await new Promise(r => setTimeout(r, 350));
    await page.click('#scn-cash-toggle');
    await new Promise(r => setTimeout(r, 350));
    await waitCashRows(page, 10);
    const reopened = await page.evaluate(() => ({
      mode: document.querySelector('#path-mode')?.value || '',
      regenHidden: document.querySelector('#path-regenerate')?.hidden,
      cols: [...document.querySelectorAll('#scn-view .cf-table__head .cf-th')].map(el => el.textContent.trim()),
    }));
    if(reopened.mode !== 'typical' || !reopened.regenHidden) throw new Error(`Cash Flow must reopen on Typical path: ${JSON.stringify(reopened)}`);
    if(JSON.stringify(reopened.cols) !== JSON.stringify(EXPECT)) throw new Error(`reopened Typical path changed the rich Cash Flow columns: ${JSON.stringify(reopened.cols)}`);

    // Exercise warning and attach-failure states directly through the production
    // Cash Flow renderer. This avoids changing real scenario or Household state.
    const disclosureStates = await page.evaluate(async () => {
      const { renderCashflow } = await import('./ui/cashflow.js');
      const row = { year: 2026, age: 66, accum: false, income: 50000, rmd: 0, essential: 40000, goals: 0, tax: 5000, draw: 0, ret: 0.04, wdRate: 4, ending: 900000, shortfall: false, startPort: 1000000, goalTag: null };
      const raw = { res: { typicalPathFederalTax: {
        years: [{ year: 2026, age: 66, federalTaxLiability: 4500 }],
        totals: { federalTaxLiability: 4500, enginePathTax: 5000, deltaVsEnginePath: -500 },
        scope: 'INCOME_TAX_ONLY',
        warnings: [{ code: 'VERIFY_WARNING', message: 'A supplied tax fact needs review.' }],
      } } };
      const scn = { raw, id: '0', name: 'Baseline', tone: '#c6a662', prob: 80, probStr: '80', median: '$900K' };
      const deps = {
        pathRows: () => [row], cashSummary: () => ({}), cashFromRetirement: false,
        isTypicalPath: () => true, typicalPathFederalTax: (s) => s.res.typicalPathFederalTax,
        toneGlow: () => 'transparent', ring: () => '', wdColor: () => 'inherit', num: (n) => String(n),
        esc: (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
        fmtMoney: (n) => '$' + Math.round(n).toLocaleString('en-US'),
        cfCols: ['Year', 'Age', 'Income', 'RMD', 'Essential', 'Goals', 'Tax', 'Draw', 'Return', 'WD Rate', 'Ending'],
      };
      const inspect = () => {
        const host = document.createElement('div');
        host.innerHTML = renderCashflow(scn, [scn], deps);
        return {
          state: host.querySelector('[data-tax-disclosure]')?.dataset.taxState || '',
          warning: host.querySelector('[data-tax-warnings] li')?.textContent.trim() || '',
          fallback: host.querySelector('[data-tax-fallback]')?.textContent.trim() || '',
          source: host.querySelector('.cf-th[data-tax-source]')?.dataset.taxSource || '',
        };
      };
      const warned = inspect();
      raw.res.typicalPathFederalTax = null;
      const failed = inspect();
      return { warned, failed };
    });
    if(disclosureStates.warned.state !== 'federal-sidecar' || disclosureStates.warned.warning !== 'A supplied tax fact needs review.') throw new Error(`sidecar warnings were not surfaced: ${JSON.stringify(disclosureStates)}`);
    if(disclosureStates.failed.state !== 'engine-fallback' || disclosureStates.failed.source !== 'engine' || !/tax column uses engine estimates/i.test(disclosureStates.failed.fallback)) throw new Error(`sidecar attach-failure fallback is unclear: ${JSON.stringify(disclosureStates)}`);
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

  await step('sequencing excludes deferred Playback', async () => {
    const playbackSelectors = await page.evaluate(() => ({
      panel: Boolean(document.querySelector('#playback-panel')),
      verdict: Boolean(document.querySelector('#pb-verdict')),
      yearPicker: Boolean(document.querySelector('[data-pb-year]')),
      detail: Boolean(document.querySelector('#pb-detail-btn')),
    }));
    if(Object.values(playbackSelectors).some(Boolean)){
      throw new Error(`deferred Playback rendered unexpectedly: ${JSON.stringify(playbackSelectors)}`);
    }
    await page.screenshot({ path: join(OUT, '06-sequencing-full.png'), fullPage: true });
  });

  // Objective theme contract: the page BACKGROUND (not just foreground tokens) must be
  // the shared charcoal/champagne --page-bg on Scenarios, Goals, Sequencing, AND the
  // Household console — the whole app now reads as one charcoal surface (floor #0b0d11)
  // with a champagne accent. The retired Household warm bronze AND the old navy
  // (#111E31 = 17,30,49) must BOTH be gone everywhere. Computed-style assertions so a
  // navy/bronze regression fails loudly instead of relying on a human reading a screenshot.
  await step('visual contract: flush 56px header rail and tabs are correct', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.click('button[data-page="scenarios"]'); await sleep(400);
    const hdr = await page.evaluate(() => {
      const el = document.querySelector('.hdr');
      if(!el) return null;
      const cs = getComputedStyle(el);
      const logo = document.querySelector('.hdr__logo img, .brand-logo');
      const tab = document.querySelector('.htab.on');
      const tabAfter = tab ? getComputedStyle(tab, '::after') : null;
      return {
        height: cs.height,
        bg: cs.backgroundColor,
        borderBottom: cs.borderBottomWidth,
        logo: logo?.getAttribute('src') || '',
        logoH: logo ? getComputedStyle(logo).height : '',
        runBg: getComputedStyle(document.querySelector('.run-btn')).backgroundColor,
        runColor: getComputedStyle(document.querySelector('.run-btn')).color,
        tabAfterBg: tabAfter?.backgroundColor || '',
      };
    });
    if(!hdr) throw new Error('Header element missing');
    if(hdr.height !== '56px') throw new Error(`Header height must be 56px, got ${hdr.height}`);
    if(hdr.borderBottom !== '1px') throw new Error(`Header must have 1px bottom hairline, got ${hdr.borderBottom}`);
    if(!hdr.logo.includes('parallax-logo.png')) throw new Error(`Header logo must use parallax-logo.png, got ${hdr.logo}`);
    if(hdr.logoH !== '48px') throw new Error(`Logo must be 48px tall, got ${hdr.logoH}`);
    if(hdr.bg !== 'rgba(0, 0, 0, 0)' && hdr.bg !== 'transparent')
      throw new Error(`Header must be flush/transparent, got ${hdr.bg}`);
    if(hdr.runBg !== 'rgba(0, 0, 0, 0)' && hdr.runBg !== 'transparent')
      throw new Error(`Run button must be unboxed (transparent bg), got ${hdr.runBg}`);
    const [r,g,b] = (hdr.runColor.match(/\d+/g)||[]).map(Number);
    if(!(r > 180 && g > 130 && b < 140)) throw new Error(`Run button text must be champagne: ${hdr.runColor}`);
    const [ar,ag,ab] = (hdr.tabAfterBg.match(/\d+/g)||[]).map(Number);
    if(!(ar > 180 && ag > 130 && ab < 140)) throw new Error(`Active tab underline must be champagne: ${hdr.tabAfterBg}`);
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
    // Goals mounts the Horizon card, with the retired ledger/chapters absent.
    if(!await page.evaluate(() => !!document.querySelector('#np-content .gh-card'))) throw new Error('Goals view did not mount .gh-card');
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
    const leverNames = () => stableEvaluate('read scenario lever names', () =>
      [...document.querySelectorAll('#scn-view .lever__name')].map(e => e.textContent.trim()));

    // Pre-retirement demo (Client 1 64/retire 66, Client 2 63/retire 65):
    // "Retirement Age" IS an active Scenarios lever.
    await stableClick('button[data-page="scenarios"]'); await sleep(700);
    await stableClick('#scn-seg-compare'); await sleep(400);
    const beforeNames = await leverNames();
    if(!beforeNames.includes('Retirement Age'))
      throw new Error(`Retirement Age lever should be present while pre-retirement: ${JSON.stringify(beforeNames)}`);

    // Make BOTH principals already retired (retire age below current age).
    const setHh = (p, v) => stableEvaluate(`set household field ${p}`, ({p,v}) => {
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
    await stableClick('button[data-page="scenarios"]'); await sleep(900);
    await stableClick('#scn-seg-compare'); await sleep(400);
    const afterNames = await leverNames();
    if(afterNames.includes('Retirement Age'))
      throw new Error(`Retirement Age lever must disappear once already retired: ${JSON.stringify(afterNames)}`);
    if(!afterNames.includes('Allocation'))
      throw new Error(`other levers (Allocation) must remain when retired: ${JSON.stringify(afterNames)}`);

    // Restore the edited fields explicitly; Load Demo never resets saved data.
    await goStep(1);
    await setHh('household.primary.retirementAge', '66');
    await setHh('household.spouse.retirementAge', '65');
    await sleep(250);
  });

  await step('tax-funded probability is the only probability shown after Run', async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const controlledPlan = await page.evaluate(() => {
      const storageKey = 'parallax.households.v1';
      const db = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const plan = db.demo;
      if(!plan) throw new Error('demo household is unavailable for the probability fixture');

      const currentYear = new Date().getFullYear();
      plan.meta = { ...(plan.meta || {}), primaryName: 'Probability Fixture', spouseName: '', filingStatus: 'single' };
      plan.household = {
        primary: { currentAge: 65, retirementAge: 65, planEndAge: 66, birthYear: currentYear - 65 },
        spouse: null,
        children: [],
      };
      plan.portfolio = {
        ...(plan.portfolio || {}),
        riskProfile: 3,
        withdrawalStrategy: 'taxable-first',
        accounts: {
          taxable: { balance: 0, basisPct: 1 },
          traditional: { balance: 400000 },
          roth: { balance: 0 },
        },
        extraAccounts: [],
      };
      plan.savings = { ...(plan.savings || {}), annual: 0 };
      plan.income = {
        socialSecurity: { primary: { pia: 0, claimAge: 67 }, spouse: null },
        pension: { benefitByAge: {}, base: 0, startAge: 65, colaPct: 0 },
        other: [],
      };
      plan.expenses = {
        living: 300000,
        housing: 0,
        debt: 0,
        healthcare: 0,
        healthcareRealGrowth: 0,
        extra: [],
      };
      plan.liabilities = [];
      plan.properties = [];
      plan.goals = [];
      plan.ltc = { amount: 0, onsetAge: 85 };
      plan.taxes = { ordinary: 22, capitalGains: 15 };
      plan.simulation = { ...(plan.simulation || {}), iterations: 40 };

      db.demo = plan;
      localStorage.setItem(storageKey, JSON.stringify(db));
      localStorage.setItem('parallax.activeHouseholdId', 'demo');
      localStorage.removeItem('parallax.scenarios.demo.v1');
      localStorage.removeItem('parallax.pathReplay.v1');
      return plan;
    });

    resetSeed(20260609);
    const returnPaths = Array.from({ length: 40 }, () => generateReturnPath(1));
    const shortcut = runSimulation(controlledPlan, {}, returnPaths);
    const funded = runMonteCarloWithFederalFunding(shortcut, controlledPlan, {}, {
      filingStatus: 'single',
      baseTaxYear: new Date().getFullYear(),
      scenarioId: 'verify_t9_probability',
    });
    if(shortcut.successRate === funded.federalSuccessRate)
      throw new Error(`probability fixture did not diverge (${shortcut.successRate})`);

    await stableReload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    await page.waitForSelector('#run-btn:not([disabled])', { timeout: 10000 });
    await page.click('#run-btn');
    await page.waitForFunction(() => /Complete/i.test(document.querySelector('#status')?.textContent || ''), { timeout: 30000 });
    await page.click('button[data-page="scenarios"]');
    await sleep(600);
    await page.click('#scn-seg-compare');
    await sleep(400);

    const expected = Number(funded.federalSuccessRate.toFixed(1));
    const oldShortcut = Number(shortcut.successRate.toFixed(1));
    const compareProb = await page.evaluate(() => {
      const baseline = [...document.querySelectorAll('#scn-view .scol')]
        .find(column => /Baseline/i.test(column.querySelector('.scol__name')?.textContent || ''));
      return Number.parseFloat(baseline?.querySelector('.scol__prob')?.textContent || '');
    });
    if(compareProb !== expected) throw new Error(`Compare probability ${compareProb} does not match tax-funded ${expected}`);
    if(compareProb === oldShortcut) throw new Error(`Compare still shows shortcut-only probability ${oldShortcut}`);

    await page.click('#scn-seg-focus');
    await sleep(400);
    const focus = await page.evaluate(() => ({
      hero: Number.parseFloat(document.querySelector('#scn-view .hero__numeral')?.textContent || ''),
      rail: Number.parseFloat([...document.querySelectorAll('#scn-view .rail-card')]
        .find(card => /Baseline/i.test(card.textContent || ''))?.querySelector('.rail-card__prob')?.textContent || ''),
    }));
    if(focus.hero !== expected || focus.rail !== expected)
      throw new Error(`Focus probabilities do not match tax-funded ${expected}: ${JSON.stringify(focus)}`);

    await setCashFlow(page, true);
    await waitCashRows(page, 1);
    const cashFlowProb = await page.evaluate(() =>
      Number.parseFloat(document.querySelector('#scn-view .cf-summary__id .numeral')?.textContent || ''));
    if(cashFlowProb !== expected) throw new Error(`Cash Flow probability ${cashFlowProb} does not match tax-funded ${expected}`);
    await setCashFlow(page, false);
    await sleep(300);

    await page.click('#scn-solve');
    await page.waitForSelector('#sf-pct', { visible: true });
    const solverScope = await page.$eval('.solve-scope', el => el.textContent.trim());
    if(!/simplified tax estimate/i.test(solverScope) || !/recalculated with modeled federal tax/i.test(solverScope))
      throw new Error(`Solver tax scope disclosure missing: ${solverScope}`);
    const solverTarget = await page.$eval('#sf-pct', input => Number(input.value));
    const expectedTarget = Math.min(95, Math.ceil((expected + 1) / 5) * 5);
    const shortcutTarget = Math.min(95, Math.ceil((oldShortcut + 1) / 5) * 5);
    if(solverTarget !== expectedTarget)
      throw new Error(`Solver target ${solverTarget} does not derive from tax-funded ${expected} (expected ${expectedTarget})`);
    if(solverTarget === shortcutTarget)
      throw new Error(`Solver target still derives from shortcut-only probability ${oldShortcut}`);
  });

  // ── Multi-household persistence & bootstrapping ────────────────────────────
  // These run LAST (they clear storage and reload) so they can't disturb the
  // demo-coupled steps above. They prove the state-management contract:
  // first-load seeds a blank demo, saved values survive reload, scenario storage
  // is scoped by householdId, and Load Demo can recreate a missing demo slot.
  await step('persistence: first load seeds one blank Demo Household + exposes minimal controls', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
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
    if(s.db.demo.meta.primaryName || s.db.demo.household.spouse || s.db.demo.income.socialSecurity.primary.pia !== 0 || s.db.demo.income.socialSecurity.primary.claimAge !== 67)
      throw new Error(`first-run demo is not blank: ${JSON.stringify(s.db.demo)}`);
    if((s.db.demo.portfolio.extraAccounts || []).length || (s.db.demo.income.other || []).length)
      throw new Error('first-run demo contains hardcoded accounts or income');
    // Controls present on the Household page (inside the tucked ⋯ menu).
    await page.click('.htab[data-page="household"]'); await sleep(400);
    const ctl = await page.evaluate(() => ({
      switcher: !!document.querySelector('#hh-menu-pop #hh-switch'),
      opts: document.querySelectorAll('#hh-switch option').length,
      saveAsBtn: !!document.querySelector('#hh-menu-pop #hh-save-as'),
      renameBtn: !!document.querySelector('#hh-menu-pop #hh-rename'),
      newBtn: !!document.querySelector('#hh-menu-pop #hh-new'),
      loadDemoBtn: !!document.querySelector('#hh-menu-pop #hh-load-demo'),
      retired: !!document.querySelector('#hh-act-demo, #hh-act-clear, .hh-menu__row'),
    }));
    if(!ctl.switcher) throw new Error('household switcher (#hh-switch) not rendered in the menu');
    if(ctl.opts < 1) throw new Error('household switcher has no options');
    if(!ctl.saveAsBtn) throw new Error('Save As button (#hh-save-as) not rendered in the menu');
    if(!ctl.renameBtn) throw new Error('Rename button (#hh-rename) not rendered in the menu');
    if(!ctl.newBtn) throw new Error('New Household button (#hh-new) not rendered in the menu');
    if(!ctl.loadDemoBtn || ctl.retired) throw new Error(`minimal Load Demo menu contract failed: ${JSON.stringify(ctl)}`);
  });

  await step('persistence: saved demo values and New Household survive reload', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await goStep(1);
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="meta.primaryName"]');
      el.value = 'Saved Client'; el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await goStep(3);
    await page.evaluate(() => {
      const pia = document.querySelector('#hh-view input[data-path="income.socialSecurity.primary.pia"]');
      pia.value = '12,345'; pia.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(200);
    await page.evaluate(() => {
      const age = document.querySelector('#hh-view input[data-path="income.socialSecurity.primary.claimAge"]');
      age.value = '70'; age.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(300);
    // Persist the demo's scenarios first (so its scoped key exists), then create
    // a new blank household from the menu control (clicked programmatically —
    // it lives in the tucked ⋯ popover).
    await page.click('#save-btn'); await sleep(400);
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1200);
    const savedDemo = await page.evaluate(() => JSON.parse(localStorage.getItem('parallax.households.v1') || 'null')?.demo);
    if(savedDemo?.meta?.primaryName !== 'Saved Client' || savedDemo?.income?.socialSecurity?.primary?.pia !== 12345 || savedDemo?.income?.socialSecurity?.primary?.claimAge !== 70)
      throw new Error(`saved demo values were overwritten on reload: ${JSON.stringify(savedDemo)}`);
    await page.evaluate(() => document.querySelector('#hh-new').click()); await sleep(700);
    const created = await page.evaluate(() => ({
      active: localStorage.getItem('parallax.activeHouseholdId'),
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
    }));
    if(!created.active || created.active === 'demo') throw new Error(`New Household did not become active (active="${created.active}")`);
    if(Object.keys(created.db).length !== 2) throw new Error(`expected 2 households after New (got ${Object.keys(created.db).length})`);
    const customId = created.active;
    if(!created.db[customId] || created.db[customId].meta.isDemo !== false) throw new Error('new household record is not marked isDemo=false');
    if(created.db[customId].income.socialSecurity.primary.claimAge !== 67)
      throw new Error(`new household primary claim age must default to 67: ${JSON.stringify(created.db[customId].income.socialSecurity)}`);

    // Reload: the custom household must remain active (demo must NOT overwrite it).
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1500);
    const afterReload = await page.evaluate(() => ({
      active: localStorage.getItem('parallax.activeHouseholdId'),
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
    }));
    if(afterReload.active !== customId) throw new Error(`custom household did not survive reload (active="${afterReload.active}", want "${customId}")`);
    if(!afterReload.db.demo) throw new Error('demo record vanished after reload');
    if(afterReload.db.demo.meta.primaryName !== 'Saved Client' || afterReload.db.demo.income.socialSecurity.primary.claimAge !== 70)
      throw new Error(`saved demo was reset during custom-household reload: ${JSON.stringify(afterReload.db.demo)}`);
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

  await step('persistence: schema merge preserves values; Load Demo recreates a missing blank slot', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const customId = await page.evaluate(() => localStorage.getItem('parallax.activeHouseholdId'));
    await page.evaluate((id) => {
      const key = 'parallax.households.v1';
      const db = JSON.parse(localStorage.getItem(key));
      db[id].meta.primaryName = 'Custom Saved';
      db[id].income.socialSecurity.primary.pia = 7777;
      delete db[id].income.socialSecurity.primary.claimAge;
      delete db.demo;
      localStorage.setItem(key, JSON.stringify(db));
      localStorage.setItem('parallax.activeHouseholdId', id);
    }, customId);
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1400);
    const merged = await page.evaluate((id) => {
      const db = JSON.parse(localStorage.getItem('parallax.households.v1') || 'null');
      return { active: localStorage.getItem('parallax.activeHouseholdId'), db, record: db?.[id] };
    }, customId);
    if(merged.active !== customId || merged.record?.meta?.primaryName !== 'Custom Saved' || merged.record?.income?.socialSecurity?.primary?.pia !== 7777)
      throw new Error(`schema merge overwrote saved custom values: ${JSON.stringify(merged)}`);
    if(merged.record.income.socialSecurity.primary.claimAge !== 67)
      throw new Error(`schema merge did not add missing claimAge=67: ${JSON.stringify(merged.record.income.socialSecurity)}`);
    if(merged.db.demo) throw new Error('bootstrap recreated demo before Load Demo was requested');

    await page.click('.htab[data-page="household"]'); await sleep(300);
    await page.evaluate(() => document.querySelector('#hh-load-demo').click()); await sleep(800);
    const after = await page.evaluate((id) => ({
      db: JSON.parse(localStorage.getItem('parallax.households.v1') || 'null'),
      active: localStorage.getItem('parallax.activeHouseholdId'),
      customId: id,
    }), customId);
    if(after.active !== 'demo' || !after.db.demo || after.db.demo.meta.isDemo !== true)
      throw new Error(`Load Demo did not recreate and activate demo: ${JSON.stringify(after)}`);
    if(after.db.demo.meta.primaryName || after.db.demo.household.spouse || after.db.demo.income.socialSecurity.primary.pia !== 0 || after.db.demo.income.socialSecurity.primary.claimAge !== 67)
      throw new Error(`Load Demo recreated fictional values: ${JSON.stringify(after.db.demo)}`);
    if(after.db[customId]?.meta?.primaryName !== 'Custom Saved' || after.db[customId]?.income?.socialSecurity?.primary?.pia !== 7777)
      throw new Error(`Load Demo altered the saved custom household: ${JSON.stringify(after.db[customId])}`);
  });

  await step('persistence: BLOCKED is inert, truthful, and preserves every recovery byte', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const blocked = 'Household data could not be safely upgraded. No saved data was changed.';
    const corrupt = '{not-json';
    const seededScenarios = JSON.stringify([
      { name:'Baseline', base:true, lev:{} },
      { name:'Scenario B', base:false, lev:{} },
    ]);
    await page.evaluate(({ raw, scenarios }) => {
      localStorage.clear();
      localStorage.setItem('parallax.households.v1', raw);
      localStorage.setItem('parallax.activeHouseholdId', 'demo');
      localStorage.setItem('parallax.scenarios.demo.v1', scenarios);
    }, { raw: corrupt, scenarios: seededScenarios });
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1000);

    const readRecoveryBytes = () => page.evaluate(() => {
      const scenarios = {};
      const scenarioKeys = [];
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(key?.startsWith('parallax.scenarios.')) scenarioKeys.push(key);
      }
      for(const key of scenarioKeys.sort()) scenarios[key] = localStorage.getItem(key);
      return {
        db: localStorage.getItem('parallax.households.v1'),
        active: localStorage.getItem('parallax.activeHouseholdId'),
        scenarios,
      };
    });
    const beforeBytes = await readRecoveryBytes();
    if(beforeBytes.db !== corrupt) throw new Error('blocked bootstrap replaced corrupt household bytes');
    if(beforeBytes.active !== 'demo') throw new Error(`blocked bootstrap changed the active pointer to "${beforeBytes.active}"`);
    if(beforeBytes.scenarios['parallax.scenarios.demo.v1'] !== seededScenarios) throw new Error('blocked bootstrap changed scenario bytes');

    const assertPinned = async label => {
      const status = await page.$eval('#status', el => el.textContent.trim());
      if(status !== blocked) throw new Error(`${label}: blocked status was not pinned (got "${status}")`);
    };
    await assertPinned('initial load');
    const blockedTaxEditor = await page.$('#hh-view [data-hh-tax-details-root], #hh-view [data-hh-tax-edit]');
    if(blockedTaxEditor) throw new Error('blocked Household surface exposed the Tax details editor');

    const blockedControls = await page.evaluate(() => {
      const disabled = selector => {
        const el = document.querySelector(selector);
        return { selector, exists: !!el, disabled: !!el?.disabled };
      };
      return [
        disabled('#save-btn'), disabled('#run-btn'), disabled('#hh-menu-btn'), disabled('#hh-switch'),
        disabled('#hh-new'), disabled('#hh-load-demo'), disabled('#scn-add'), disabled('#scn-solve'),
        disabled('#path-mode'), disabled('#path-regenerate'), disabled('#seq-select'),
      ];
    });
    const missingBlockedControls = blockedControls.filter(x => !x.exists || !x.disabled);
    if(missingBlockedControls.length) throw new Error(`blocked mutation controls must exist and be disabled: ${JSON.stringify(missingBlockedControls)}`);

    // Every product surface may still be navigated for recovery context, but no
    // default-plan input or prior financial result may leak into a blocked view.
    for(const selector of [
      '.htab[data-page="household"]',
      '.htab[data-sub-target="goals"]',
      '.htab[data-page="scenarios"]',
      '.htab[data-page="tax-buckets"]',
      '.htab[data-page="sequencing"]',
    ]){
      await stableClick(selector);
      await sleep(400);
      const exposed = await page.evaluate(() => {
        const active = document.querySelector('.page.on');
        if(!active) return { missingPage:true, controls:[], financialText:'' };
        const visible = el => !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        const controls = [...active.querySelectorAll('[data-path], input[type="number"], input[inputmode="numeric"]')]
          .filter(visible)
          .map(el => ({ tag:el.tagName, path:el.dataset.path || '', value:el.value || '' }));
        const financialText = (active.textContent || '').match(/\$\s*[\d,]+|\b\d+(?:\.\d+)?\s*%/g) || [];
        return { missingPage:false, controls, financialText };
      });
      if(exposed.missingPage) throw new Error(`${selector}: active page did not render`);
      if(exposed.controls.length) throw new Error(`${selector}: blocked mode exposed fake financial inputs: ${JSON.stringify(exposed.controls.slice(0, 5))}`);
      if(exposed.financialText.length) throw new Error(`${selector}: blocked mode exposed fake financial results: ${JSON.stringify(exposed.financialText.slice(0, 8))}`);
      await assertPinned(selector);
    }

    await stableClick('.htab[data-page="scenarios"]');
    await sleep(300);
    await page.evaluate(() => {
      document.querySelector('#run-btn')?.click();
      document.querySelector('#scn-add')?.click();
      document.querySelector('#scn-solve')?.click();
    });
    await sleep(500);
    const blockedEngine = await page.evaluate(() => ({
      status: document.querySelector('#status')?.textContent.trim() || '',
      probs: [...document.querySelectorAll('#scn-view .scol__prob')].map(el => el.textContent.trim()),
      medians: [...document.querySelectorAll('#scn-view .scol__median b')].map(el => el.textContent.trim()),
      solverStarted: !!document.querySelector('#solver-form, #solve-panel .solve-searching'),
      scenarioColumns: document.querySelectorAll('#scn-view .scol').length,
    }));
    if(blockedEngine.status !== blocked) throw new Error(`blocked engine attempt replaced pinned status with "${blockedEngine.status}"`);
    if(blockedEngine.solverStarted) throw new Error('blocked recovery allowed solver startup');
    if(blockedEngine.scenarioColumns) throw new Error('blocked recovery rendered scenario columns from fake/default state');
    if(blockedEngine.probs.some(p => /\d/.test(p))) throw new Error(`blocked recovery showed probabilities: ${JSON.stringify(blockedEngine.probs)}`);
    if(blockedEngine.medians.some(m => /\$[\d,]/.test(m))) throw new Error(`blocked recovery showed medians: ${JSON.stringify(blockedEngine.medians)}`);

    const afterBytes = await readRecoveryBytes();
    if(JSON.stringify(afterBytes) !== JSON.stringify(beforeBytes)){
      throw new Error(`blocked interactions changed recovery bytes: ${JSON.stringify({ beforeBytes, afterBytes })}`);
    }
  });

  await step('persistence: READ_ONLY disables every mutation but preserves navigation and bytes', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const readOnly = 'Household storage could not be upgraded. Viewing a read-only copy; reload after storage is available.';
    await page.evaluateOnNewDocument(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value){
        if(key === 'parallax.households.v1') throw new Error('QuotaExceededError');
        return orig.call(this, key, value);
      };
    });
    await page.evaluate(() => {
      localStorage.clear();
      const base = (id, name, spouse) => ({
        meta: { householdId:id, name, isDemo:id === 'demo', primaryName:name, spouseName:spouse ? 'Co-Client' : '', filingStatus:spouse ? 'marriedFilingJointly' : 'single', state:'VA', accountSchemaVersion:0 },
        household: { primary:{ currentAge:60, retirementAge:65, planEndAge:90, birthYear:1966 }, spouse:spouse ? { currentAge:59, retirementAge:65, birthYear:1967 } : null, children:[] },
        portfolio: {
          accounts: { taxable:{ balance:0, basisPct:1 }, traditional:{ balance:0 }, roth:{ balance:0 } },
          extraAccounts: spouse
            ? [
                { type:'Brokerage (taxable)', bucket:'taxable', owner:'client', balance:1000 },
                { type:'Roth IRA', bucket:'roth', owner:'spouse', balance:2000 },
              ]
            : [{ type:'Traditional IRA', bucket:'traditional', owner:'client', balance:3000 }],
        },
        expenses: {
          living:spouse ? 24000 : 12000,
          healthcare:0,
          healthcareRealGrowth:0.02,
          extra:[{ label:'Travel', amount:1200, startAge:65, endAge:80 }],
        },
        income: {
          socialSecurity:{ primary:{ pia:0, claimAge:67 }, spouse:spouse ? { pia:0, claimAge:67 } : null },
          pension:{ benefitByAge:{}, base:0, startAge:65, colaPct:0 },
          other:[{ label:'Consulting', amount:2400, startAge:60, endAge:64, realGrowth:0, taxablePct:1 }],
          workingIncome:0,
        },
        savings: { annual:0 }, goals:[], simulation:{ iterations:1000 },
      });
      const db = { demo:base('demo', 'Read Only Demo', true), other:base('other', 'Read Only Other', false) };
      localStorage.setItem('parallax.households.v1', JSON.stringify(db));
      localStorage.setItem('parallax.activeHouseholdId', 'demo');
      localStorage.setItem('parallax.scenarios.demo.v1', JSON.stringify([
        { name:'Baseline', base:true, lev:{} }, { name:'Scenario B', base:false, lev:{} },
      ]));
      localStorage.setItem('parallax.scenarios.other.v1', JSON.stringify([
        { name:'Baseline', base:true, lev:{} }, { name:'Other B', base:false, lev:{} },
      ]));
    });
    await stableReload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1200);

    const readRecoveryBytes = () => page.evaluate(() => {
      const scenarios = {};
      const scenarioKeys = [];
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(key?.startsWith('parallax.scenarios.')) scenarioKeys.push(key);
      }
      for(const key of scenarioKeys.sort()) scenarios[key] = localStorage.getItem(key);
      return {
        db: localStorage.getItem('parallax.households.v1'),
        active: localStorage.getItem('parallax.activeHouseholdId'),
        scenarios,
      };
    });
    const beforeBytes = await readRecoveryBytes();
    const assertPinned = async label => {
      const status = await page.$eval('#status', el => el.textContent.trim());
      if(status !== readOnly) throw new Error(`${label}: read-only status was not pinned (got "${status}")`);
    };
    const assertBytesUnchanged = async label => {
      const current = await readRecoveryBytes();
      if(JSON.stringify(current) !== JSON.stringify(beforeBytes)){
        throw new Error(`${label}: read-only interaction changed DB/pointer/scenario bytes`);
      }
    };
    await assertPinned('initial load');

    const globalControls = await page.evaluate(() => ({
      save: document.querySelector('#save-btn')?.disabled,
      newHousehold: document.querySelector('#hh-new')?.disabled,
      switchDisabled: document.querySelector('#hh-switch')?.disabled,
      loadDemoDisabled: document.querySelector('#hh-load-demo')?.disabled,
      householdStepCount: document.querySelectorAll('.hh-step').length,
      householdStepsDisabled: [...document.querySelectorAll('.hh-step')].some(el => el.disabled),
    }));
    if(!globalControls.save || !globalControls.newHousehold) throw new Error(`read-only Save/New must be disabled: ${JSON.stringify(globalControls)}`);
    if(!globalControls.householdStepCount || globalControls.switchDisabled || globalControls.loadDemoDisabled || globalControls.householdStepsDisabled){
      throw new Error(`read-only navigation must stay enabled: ${JSON.stringify(globalControls)}`);
    }

    // The Goals surface shares the same read-only orchestration boundary. Its
    // inputs and action controls must expose a disabled state, while the top
    // navigation that reaches the surface remains usable.
    await stableClick('.htab[data-sub-target="goals"]');
    await sleep(500);
    const goalsControls = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('#np-content input, #np-content select, #np-content textarea, #np-content button, #np-content [role="button"], #np-content [data-add], #np-content [data-act]')];
      const locked = el => el.disabled === true || el.getAttribute('aria-disabled') === 'true';
      return {
        count:controls.length,
        enabled:controls.filter(el => !locked(el)).map(el => el.id || el.dataset.path || el.dataset.act || el.textContent.trim()).slice(0, 8),
      };
    });
    if(!goalsControls.count || goalsControls.enabled.length){
      throw new Error(`read-only Goals controls must all be disabled: ${JSON.stringify(goalsControls)}`);
    }
    await assertPinned('goals controls');
    await assertBytesUnchanged('goals controls');

    // Household scalar field: force an event despite disabled UI, then re-render
    // from plan truth. Both the visible value and storage must remain unchanged.
    await goStep(1);
    const householdControlState = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('#hh-view input[data-path], #hh-view select[data-path]')];
      return {
        count:controls.length,
        enabled:controls.filter(el => !el.disabled).map(el => el.dataset.path),
        living:document.querySelector('#hh-view input[data-path="expenses.living"]')?.value || '',
      };
    });
    if(!householdControlState.count || householdControlState.enabled.length){
      throw new Error(`read-only Household fields must all be disabled: ${JSON.stringify(householdControlState.enabled)}`);
    }
    await page.evaluate(() => {
      const el = document.querySelector('#hh-view input[data-path="expenses.living"]');
      if(!el) throw new Error('read-only living input missing');
      el.value = '12,345';
      el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await goStep(2); await goStep(1);
    const livingAfter = await page.$eval('#hh-view input[data-path="expenses.living"]', el => el.value);
    if(livingAfter !== householdControlState.living){
      throw new Error(`read-only Household edit changed in-memory/UI state (${householdControlState.living} -> ${livingAfter})`);
    }
    await assertPinned('household field edit');
    await assertBytesUnchanged('household field edit');

    // Generic ledger row add/remove is independent of account management.
    // Both entry points must be visibly disabled and inert under a forced event.
    await goStep(1);
    const rowBefore = await page.evaluate(() => ({
      count:document.querySelectorAll('#hh-view .row-x[data-rmpath^="expenses.extra."]').length,
      removeDisabled:[...document.querySelectorAll('#hh-view .row-x[data-rmpath^="expenses.extra."]')].every(el => el.disabled),
      addCount:document.querySelectorAll('#hh-view [data-hh-action="open-add"][data-add-key="spending"]').length,
      addDisabled:[...document.querySelectorAll('#hh-view [data-hh-action="open-add"][data-add-key="spending"]')].every(el => el.disabled),
    }));
    if(!rowBefore.count || !rowBefore.removeDisabled || !rowBefore.addCount || !rowBefore.addDisabled){
      throw new Error(`read-only ledger row controls are not disabled: ${JSON.stringify(rowBefore)}`);
    }
    await page.evaluate(() => {
      document.querySelector('#hh-view .row-x[data-rmpath^="expenses.extra."]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      document.querySelector('#hh-view [data-hh-action="open-add"][data-add-key="spending"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    });
    await goStep(2); await goStep(1);
    const rowAfter = await page.evaluate(() => ({
      count:document.querySelectorAll('#hh-view .row-x[data-rmpath^="expenses.extra."]').length,
      form:!!document.querySelector('#hh-view .hh-it-add-form'),
    }));
    if(rowAfter.count !== rowBefore.count || rowAfter.form){
      throw new Error(`read-only ledger row add/remove changed immediate state: ${JSON.stringify({ rowBefore, rowAfter })}`);
    }
    await assertPinned('ledger row add/remove');
    await assertBytesUnchanged('ledger row add/remove');

    // Account row removal/addition and co-client removal are disabled and also
    // rejected by the mutation boundary when a synthetic event is dispatched.
    await goStep(2);
    const accountBefore = await page.evaluate(() => ({
      rows:document.querySelectorAll('#hh-view input[data-path^="portfolio.extraAccounts."][data-path$=".balance"]').length,
      rowRemoveDisabled:[...document.querySelectorAll('#hh-view .row-x[data-rmpath^="portfolio.extraAccounts."]')].every(el => el.disabled),
      addCount:document.querySelectorAll('#hh-view [data-hh-action="open-account-form"]').length,
      addDisabled:[...document.querySelectorAll('#hh-view [data-hh-action="open-account-form"]')].every(el => el.disabled),
      taxCount:document.querySelectorAll('#hh-view [data-hh-tax-edit="basis"]').length,
      taxDisabled:[...document.querySelectorAll('#hh-view [data-hh-tax-edit]')].every(el => el.disabled),
      taxValue:document.querySelector('#hh-view [data-hh-tax-edit="basis"]')?.value || '',
    }));
    if(!accountBefore.rows || !accountBefore.rowRemoveDisabled || !accountBefore.addCount || !accountBefore.addDisabled
      || !accountBefore.taxCount || !accountBefore.taxDisabled){
      throw new Error(`read-only account controls are not disabled: ${JSON.stringify(accountBefore)}`);
    }
    await page.evaluate(() => {
      document.querySelector('#hh-view .row-x[data-rmpath^="portfolio.extraAccounts."]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      document.querySelector('#hh-view [data-hh-action="open-account-form"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      const taxInput = document.querySelector('#hh-view [data-hh-tax-edit="basis"]');
      if(taxInput){
        taxInput.value = '999';
        taxInput.dispatchEvent(new Event('change', { bubbles:true }));
      }
    });
    await goStep(1); await goStep(2);
    const accountAfter = await page.evaluate(() => ({
      rows:document.querySelectorAll('#hh-view input[data-path^="portfolio.extraAccounts."][data-path$=".balance"]').length,
      form:!!document.querySelector('#hh-acct-form'),
      taxValue:document.querySelector('#hh-view [data-hh-tax-edit="basis"]')?.value || '',
    }));
    if(accountAfter.rows !== accountBefore.rows || accountAfter.form || accountAfter.taxValue !== accountBefore.taxValue){
      throw new Error(`read-only account/tax edit changed immediate state: ${JSON.stringify({ accountBefore, accountAfter })}`);
    }
    await assertPinned('account add/remove and tax edit');
    await assertBytesUnchanged('account add/remove and tax edit');

    await goStep(1);
    const removeSpouseDisabled = await page.$eval('#hh-view [data-hh-action="remove-spouse"]', el => el.disabled);
    if(!removeSpouseDisabled) throw new Error('read-only co-client removal control must be disabled');
    let unexpectedDialog = null;
    const dismissUnexpectedDialog = async dialog => { unexpectedDialog = dialog.message(); await dialog.dismiss(); };
    page.on('dialog', dismissUnexpectedDialog);
    await page.evaluate(() => document.querySelector('#hh-view [data-hh-action="remove-spouse"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles:true })));
    await sleep(250);
    page.off('dialog', dismissUnexpectedDialog);
    if(unexpectedDialog) throw new Error(`read-only co-client removal opened a dialog: ${unexpectedDialog}`);
    if(!await page.$('#hh-view [data-hh-action="remove-spouse"]')) throw new Error('read-only co-client was removed in memory');
    await assertPinned('co-client removal');
    await assertBytesUnchanged('co-client removal');

    // New Household is a mutation and must remain inert.
    const optionCountBefore = await page.$$eval('#hh-switch option', els => els.length);
    await page.evaluate(() => document.querySelector('#hh-new')?.dispatchEvent(new MouseEvent('click', { bubbles:true })));
    await sleep(250);
    const optionCountAfter = await page.$$eval('#hh-switch option', els => els.length);
    if(optionCountAfter !== optionCountBefore) throw new Error('read-only New Household changed the in-memory household list');
    await assertPinned('new household');
    await assertBytesUnchanged('new household');

    // Scenarios: every mutation control is disabled; forced events cannot add,
    // open solver/rename/delete UI, or alter a lever or scenario bytes.
    await stableClick('button[data-page="scenarios"]');
    await sleep(900);
    await stableClick('#scn-seg-compare');
    await sleep(300);
    const scenarioBefore = await page.evaluate(() => ({
      names:[...document.querySelectorAll('#scn-view .scol__name')].map(el => el.textContent.trim()),
      addDisabled:document.querySelector('#scn-add')?.disabled,
      solveDisabled:document.querySelector('#scn-solve')?.disabled,
      menuCount:document.querySelectorAll('#scn-view .scol__menu').length,
      menuDisabled:[...document.querySelectorAll('#scn-view .scol__menu')].every(el => el.disabled),
      stepCount:document.querySelectorAll('#scn-view .cmp-step-btn').length,
      stepsDisabled:[...document.querySelectorAll('#scn-view .cmp-step-btn')].every(el => el.disabled),
      inputCount:document.querySelectorAll('#scn-view .cmp-lev-in, #scn-view .cmp-goal-in').length,
      inputsDisabled:[...document.querySelectorAll('#scn-view .cmp-lev-in, #scn-view .cmp-goal-in')].every(el => el.disabled),
      firstLever:document.querySelector('#scn-view .cmp-lev-in')?.value || '',
    }));
    if(!scenarioBefore.names.length || !scenarioBefore.addDisabled || !scenarioBefore.solveDisabled ||
       !scenarioBefore.menuCount || !scenarioBefore.menuDisabled || !scenarioBefore.stepCount ||
       !scenarioBefore.stepsDisabled || !scenarioBefore.inputCount || !scenarioBefore.inputsDisabled){
      throw new Error(`read-only scenario mutation controls are not disabled: ${JSON.stringify(scenarioBefore)}`);
    }
    await page.evaluate(() => {
      document.querySelector('#scn-add')?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      document.querySelector('#scn-solve')?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      document.querySelector('#scn-view .scol__menu')?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      document.querySelector('#scn-view .cmp-step-btn')?.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      document.querySelectorAll('#scn-reset, [data-scn-reset], [data-action="reset-scenarios"]')
        .forEach(el => el.dispatchEvent(new MouseEvent('click', { bubbles:true })));
      const input = document.querySelector('#scn-view .cmp-lev-in');
      if(input){ input.value = '999999'; input.dispatchEvent(new Event('change', { bubbles:true })); }
    });
    await sleep(400);
    // The direct value assignment above can change a disabled DOM input even
    // when the application correctly rejects the event. Re-render from model
    // state before asserting that no in-memory scenario value changed.
    await stableClick('#scn-seg-focus');
    await sleep(200);
    await stableClick('#scn-seg-compare');
    await sleep(300);
    const scenarioAfter = await page.evaluate(() => ({
      names:[...document.querySelectorAll('#scn-view .scol__name')].map(el => el.textContent.trim()),
      solver:!!document.querySelector('#solver-form, #solve-panel .solve-searching'),
      menu:!!document.querySelector('#scn-view .scol__pop, #scn-view .scol__rename'),
      firstLever:document.querySelector('#scn-view .cmp-lev-in')?.value || '',
      enabledReset:[...document.querySelectorAll('#scn-reset, [data-scn-reset], [data-action="reset-scenarios"]')].some(el => !el.disabled),
    }));
    if(JSON.stringify(scenarioAfter.names) !== JSON.stringify(scenarioBefore.names) || scenarioAfter.solver || scenarioAfter.menu || scenarioAfter.enabledReset){
      throw new Error(`read-only scenario add/solve/delete/rename/reset changed immediate state: ${JSON.stringify({ scenarioBefore, scenarioAfter })}`);
    }
    if(scenarioAfter.firstLever !== scenarioBefore.firstLever){
      throw new Error(`read-only scenario lever changed immediate UI state (${scenarioBefore.firstLever} -> ${scenarioAfter.firstLever})`);
    }
    await assertPinned('scenario mutations');
    await assertBytesUnchanged('scenario mutations');

    // Switching is navigation in read-only mode. It must update the transient
    // household while leaving the durable DB, active pointer, and all scenario
    // records byte-for-byte unchanged.
    await stableClick('.htab[data-page="household"]'); await sleep(250);
    const switchState = await page.evaluate(() => ({
      disabled:document.querySelector('#hh-switch')?.disabled,
      values:[...document.querySelectorAll('#hh-switch option')].map(el => el.value),
    }));
    if(switchState.disabled || !switchState.values.includes('other')) throw new Error(`read-only household switch is unavailable: ${JSON.stringify(switchState)}`);
    await page.evaluate(() => {
      const sel = document.querySelector('#hh-switch');
      sel.value = 'other';
      sel.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(600);
    const otherState = await page.evaluate(() => ({
      selected:document.querySelector('#hh-switch')?.value || '',
      rail:document.querySelector('#hh-rail-name')?.textContent.trim() || '',
    }));
    if(otherState.selected !== 'other' || !/Read Only Other/.test(otherState.rail)){
      throw new Error(`read-only switch did not navigate the transient household: ${JSON.stringify(otherState)}`);
    }
    await assertPinned('switch to other');
    await assertBytesUnchanged('switch to other');

    await goStep(1);
    const addSpouse = await page.$('#hh-view [data-hh-action="add-spouse"]');
    if(!addSpouse || !await addSpouse.evaluate(el => el.disabled)) throw new Error('read-only Add Co-Client control must exist and be disabled');
    await addSpouse.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles:true })));
    await sleep(200);
    if(await page.$('#hh-view [data-hh-action="remove-spouse"]')) throw new Error('read-only Add Co-Client changed immediate household state');
    await assertPinned('co-client add');
    await assertBytesUnchanged('co-client add');

    await page.evaluate(() => {
      const sel = document.querySelector('#hh-switch');
      sel.value = 'demo';
      sel.dispatchEvent(new Event('change', { bubbles:true }));
    });
    await sleep(600);
    await assertPinned('switch back to demo');
    await assertBytesUnchanged('switch back to demo');

    await stableReload({ waitUntil:'networkidle2', timeout:20000 });
    await sleep(1000);
    await assertPinned('read-only reload');
    await assertBytesUnchanged('read-only reload');
  });

  if(errs.length){
    console.error('PAGE/CONSOLE ERRORS:');
    errs.forEach(e => console.error('  ' + e));
    throw new Error(`${errs.length} page/console error(s) — verify must fail on application errors`);
  }

  await browser.close();
  console.log(`\nOK verify passed - screenshots in ${OUT}`);
} finally {
  await closeServer(srv);
}
