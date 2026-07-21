#!/usr/bin/env node
/**
 * Comprehensive GPC wizard audit — all steps, buttons, inputs.
 * Run: node scripts/audit-gpc-wizard.mjs
 */
import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { extname, join } from 'path';

const PORT = 8850;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const fp = join('/workspace', p);
  try {
    const data = readFileSync(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

const failures = [];
const passes = [];

function pass(label){ passes.push(label); }
function fail(label, detail){ failures.push({ label, detail }); }

async function sleep(ms){ await new Promise(r => setTimeout(r, ms)); }

async function blurActive(page){
  await page.evaluate(() => {
    if(document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await sleep(150);
}

async function tap(page, sel){
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate(s => {
    const el = document.querySelector(s);
    el?.scrollIntoView({ block: 'nearest' });
    el?.click();
  }, sel);
}

/** Set input/select value and fire input+change (matches real user commit path). */
async function setField(page, sel, value){
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate((s, v) => {
    const el = document.querySelector(s);
    if(!el) throw new Error(`missing ${s}`);
    el.focus();
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, sel, value);
  await sleep(200);
}

async function planSnapshot(page){
  return page.evaluate(() => {
    const active = localStorage.getItem('parallax.activeHouseholdId');
    const db = JSON.parse(localStorage.getItem('parallax.households.v1') || '{}');
    const p = db[active] || {};
    return {
      primaryName: p.meta?.primaryName,
      spouseName: p.meta?.spouseName,
      spouse: !!p.household?.spouse,
      children: (p.household?.children || []).map(c => ({ name: c.name, birthYear: c.birthYear })),
      birthYear: p.household?.primary?.birthYear,
      retirementAge: p.household?.primary?.retirementAge,
      accounts: (p.portfolio?.extraAccounts || []).map(a => ({ type: a.type, balance: a.balance })),
      incomeOther: (p.income?.other || []).map(r => ({ typeId: r.typeId, amount: r.amount, owner: r.owner })),
      ssPrimary: p.income?.socialSecurity?.primary?.pia,
      living: p.expenses?.living,
      extraExpenses: (p.expenses?.extra || []).map(e => ({ label: e.label, amount: e.amount })),
      deductions: (p.incomeTax?.deductions || []).map(d => ({ typeId: d.typeId, amount: d.amount })),
      filingStatus: p.meta?.filingStatus,
      state: p.meta?.state,
    };
  });
}

async function step(page){ return page.evaluate(() => document.querySelector('.hh-step.is-current')?.dataset.step); }

async function boot(page, viewport){
  await page.setViewport(viewport);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('#hh-view .gpc-step, #hh-view input', { timeout: 15000 });
  await sleep(800);
}

async function runAudit(viewport, label){
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await boot(page, viewport);
  const prefix = `[${label}]`;

  // ── Step 1 ──
  if ((await step(page)) !== '1') fail(`${prefix} step1`, 'did not start on step 1');
  else pass(`${prefix} step1 boot`);

  await setField(page, '#hh-view input[data-path="meta.primaryName"]', 'Audit Client');
  await blurActive(page);
  let snap = await planSnapshot(page);
  if (snap.primaryName !== 'Audit Client') fail(`${prefix} step1 name`, JSON.stringify(snap));
  else pass(`${prefix} step1 name saves`);

  await setField(page, '#hh-view select[data-path="meta.filingStatus"]', 'single');
  snap = await planSnapshot(page);
  if (snap.filingStatus !== 'single') fail(`${prefix} step1 filing`, JSON.stringify(snap));
  else pass(`${prefix} step1 filing saves`);

  await setField(page, '#hh-view select[data-path="meta.state"]', 'CA');
  snap = await planSnapshot(page);
  if (snap.state !== 'CA') fail(`${prefix} step1 state`, JSON.stringify(snap));
  else pass(`${prefix} step1 state saves`);

  await setField(page, '#hh-view input[data-path="household.primary.birthYear"]', '1965');
  await setField(page, '#hh-view input[data-path="household.primary.retirementAge"]', '62');
  snap = await planSnapshot(page);
  if (snap.birthYear !== 1965 || snap.retirementAge !== 62) fail(`${prefix} step1 ages`, JSON.stringify(snap));
  else pass(`${prefix} step1 birth/retire saves`);

  // Person tabs
  await tap(page, '#hh-view [data-hh-action="gpc-person-tab"][data-person-tab="spouse"]');
  await sleep(200);
  await tap(page, '#hh-view [data-hh-action="add-spouse"]');
  await sleep(400);
  snap = await planSnapshot(page);
  if (!snap.spouse) fail(`${prefix} step1 add spouse`, JSON.stringify(snap));
  else pass(`${prefix} step1 add spouse`);

  await setField(page, '#hh-view input[data-path="meta.spouseName"]', 'Audit Spouse');
  await blurActive(page);
  snap = await planSnapshot(page);
  if (snap.spouseName !== 'Audit Spouse') fail(`${prefix} step1 spouse name`, JSON.stringify(snap));
  else pass(`${prefix} step1 spouse name saves`);

  await tap(page, '#hh-view [data-hh-action="gpc-person-tab"][data-person-tab="child"]');
  await sleep(200);
  await tap(page, '#hh-view [data-hh-action="open-add"][data-add-key="child"]');
  await sleep(200);
  await setField(page, '#hh-view [data-hh-draft="label"]', 'Kid One');
  await setField(page, '#hh-view [data-hh-draft="year"]', '2015');
  await tap(page, '#hh-view [data-hh-action="commit-add"]');
  await sleep(400);
  snap = await planSnapshot(page);
  if (snap.children.length !== 1 || snap.children[0].name !== 'Kid One') fail(`${prefix} step1 child`, JSON.stringify(snap));
  else pass(`${prefix} step1 child add`);

  await tap(page, '#hh-view [data-hh-action="gpc-person-tab"][data-person-tab="primary"]');
  await sleep(200);
  if (!(await page.$('#hh-view input[data-path="meta.primaryName"]'))) fail(`${prefix} step1 primary tab`, 'tab switch failed');
  else pass(`${prefix} step1 person tabs`);

  await tap(page, '#hh-wiz-footer [data-hh-action="step-next"]');
  await sleep(400);
  if ((await step(page)) !== '2') fail(`${prefix} step1→2`, await step(page));
  else pass(`${prefix} step1→2 nav`);

  // ── Step 2 ──
  const acctTypes = ['401k', 'roth_ira', 'brokerage_taxable'];
  for (const t of acctTypes){
    await tap(page, `#hh-view [data-hh-action="gpc-add-account"][data-acct-type-id="${t}"]`);
    await sleep(350);
  }

  let acctInputs = await page.$$('#hh-view input[data-path^="portfolio.extraAccounts."][data-path$=".balance"]');
  if (acctInputs.length < 3) fail(`${prefix} step2 add accounts`, `rows=${acctInputs.length}`);
  else pass(`${prefix} step2 add 3 accounts`);

  await setField(page, '#hh-view input[data-path="portfolio.extraAccounts.0.balance"]', '250000');
  await tap(page, '#hh-view [data-hh-action="gpc-add-account"][data-acct-type-id="traditional_ira"]');
  await sleep(500);
  snap = await planSnapshot(page);
  const k401 = snap.accounts.find(a => /401/i.test(a.type));
  if (!k401 || k401.balance !== 250000) fail(`${prefix} step2 acct flush`, JSON.stringify(snap.accounts));
  else pass(`${prefix} step2 account flush on add`);

  await setField(page, '#hh-view input[data-path="portfolio.extraAccounts.1.balance"]', '80000');
  await setField(page, '#hh-view input[data-path="portfolio.extraAccounts.2.balance"]', '50000');
  await blurActive(page);

  // Remove last added account (traditional_ira)
  const rmBtns = await page.$$('#hh-view button[data-rmpath^="portfolio.extraAccounts."]');
  if (rmBtns.length >= 4){
    await rmBtns[rmBtns.length - 1].evaluate(el => el.click());
    await sleep(400);
    snap = await planSnapshot(page);
    if (snap.accounts.length !== 3) fail(`${prefix} step2 remove account`, JSON.stringify(snap.accounts));
    else pass(`${prefix} step2 remove account`);
  }

  await tap(page, '#hh-wiz-footer [data-hh-action="step-next"]');
  await sleep(500);
  snap = await planSnapshot(page);
  if (snap.accounts.length < 3) fail(`${prefix} step2 accounts persist`, JSON.stringify(snap.accounts));
  else pass(`${prefix} step2 accounts persist nav`);

  // ── Step 3 ──
  if ((await step(page)) !== '3') fail(`${prefix} step2→3`, await step(page));
  else pass(`${prefix} step2→3 nav`);

  await setField(page, '#hh-view input[data-path="expenses.living"]', '48000');
  await blurActive(page);
  snap = await planSnapshot(page);
  if (snap.living !== 48000) fail(`${prefix} step3 living`, String(snap.living));
  else pass(`${prefix} step3 living saves`);

  await tap(page, '#hh-view [data-hh-action="gpc-work-mode"][data-work-mode="retired"]');
  await sleep(400);
  await setField(page, '#hh-view input[data-path="income.socialSecurity.primary.pia"]', '34000');
  await sleep(200);
  snap = await planSnapshot(page);
  if (snap.ssPrimary !== 34000) fail(`${prefix} step3 ss pia`, String(snap.ssPrimary));
  else pass(`${prefix} step3 ss pia saves`);

  await tap(page, '#hh-view [data-hh-action="gpc-work-mode"][data-work-mode="employed"]');
  await sleep(400);

  const wageSel = '#hh-view input[data-hh-fixed-kind="income"][data-hh-fixed-type="wages"]';
  if (await page.$(wageSel)){
    await setField(page, wageSel, '120000');
    await tap(page, '#hh-view [data-hh-action="open-add"][data-add-key="spending"]');
    await sleep(400);
    snap = await planSnapshot(page);
    const wages = snap.incomeOther.find(r => r.typeId === 'wages');
    if (!wages || wages.amount !== 120000) fail(`${prefix} step3 wage flush`, JSON.stringify(snap.incomeOther));
    else pass(`${prefix} step3 wage flush on add`);
  } else fail(`${prefix} step3 wage input`, 'missing');

  await setField(page, '#hh-view [data-hh-draft="label"]', 'Travel');
  await setField(page, '#hh-view [data-hh-draft="amount"]', '8000');
  await tap(page, '#hh-view [data-hh-action="commit-add"]');
  await sleep(400);
  snap = await planSnapshot(page);
  if (!snap.extraExpenses.some(e => e.label === 'Travel' && e.amount === 8000)) fail(`${prefix} step3 expense add`, JSON.stringify(snap.extraExpenses));
  else pass(`${prefix} step3 expense add`);

  // Add income stream
  await tap(page, '#hh-view [data-hh-action="open-add"][data-add-key="income"]');
  await sleep(200);
  await setField(page, '#hh-view [data-hh-draft="amount"]', '5000');
  await tap(page, '#hh-view [data-hh-action="commit-add"]');
  await sleep(400);
  snap = await planSnapshot(page);
  if (!snap.incomeOther.some(r => r.amount === 5000)) fail(`${prefix} step3 income add`, JSON.stringify(snap.incomeOther));
  else pass(`${prefix} step3 income stream add`);

  await tap(page, '#hh-wiz-footer [data-hh-action="step-next"]');
  await sleep(500);

  // ── Step 4 ──
  if ((await step(page)) !== '4') fail(`${prefix} step3→4`, await step(page));
  else pass(`${prefix} step3→4 nav`);

  for (const type of ['charitable', 'mortgage_interest', 'salt', 'medical']){
    const btn = `#hh-view [data-hh-action="gpc-add-deduction"][data-ded-type="${type}"]`;
    const el = await page.$(btn);
    if (el && !(await el.evaluate(n => n.disabled))){
      await tap(page, btn);
      await sleep(350);
    }
  }

  const dedInputs = await page.$$('#hh-view input[data-path^="incomeTax.deductions."][data-path$=".amount"]');
  if (dedInputs.length < 4) fail(`${prefix} step4 add deductions`, `rows=${dedInputs.length}`);
  else pass(`${prefix} step4 add all 4 deductions`);

  await setField(page, '#hh-view input[data-path="incomeTax.deductions.0.amount"]', '12000');
  await blurActive(page);
  snap = await planSnapshot(page);
  if (!snap.deductions.some(d => d.typeId === 'charitable' && d.amount === 12000)) fail(`${prefix} step4 charitable save`, JSON.stringify(snap.deductions));
  else pass(`${prefix} step4 charitable amount saves`);

  // Focus charitable, add another — rows must not delete (mobile bug regression)
  await page.focus('#hh-view input[data-path="incomeTax.deductions.0.amount"]');
  await sleep(100);
  snap = await planSnapshot(page);
  if (snap.deductions.length < 4) fail(`${prefix} step4 ded rows kept`, JSON.stringify(snap.deductions));
  else pass(`${prefix} step4 all deduction rows kept`);

  await setField(page, '#hh-view input[data-path="incomeTax.deductions.1.amount"]', '18000');
  await setField(page, '#hh-view input[data-path="incomeTax.deductions.2.amount"]', '5000');
  await setField(page, '#hh-view input[data-path="incomeTax.deductions.3.amount"]', '3000');
  await blurActive(page);
  snap = await planSnapshot(page);
  const dedMap = Object.fromEntries(snap.deductions.map(d => [d.typeId, d.amount]));
  if (dedMap.charitable !== 12000 || dedMap.mortgage_interest !== 18000 || dedMap.salt !== 5000 || dedMap.medical !== 3000){
    fail(`${prefix} step4 all ded amounts`, JSON.stringify(snap.deductions));
  } else pass(`${prefix} step4 all deduction amounts save`);

  // Remove one deduction
  const dedRm = await page.$('#hh-view button[data-rmpath="incomeTax.deductions.3"]');
  if (dedRm){
    await dedRm.evaluate(el => el.click());
    await sleep(400);
    snap = await planSnapshot(page);
    if (snap.deductions.some(d => d.typeId === 'medical')) fail(`${prefix} step4 remove ded`, JSON.stringify(snap.deductions));
    else pass(`${prefix} step4 remove deduction`);
  }

  await tap(page, '#hh-wiz-footer [data-hh-action="step-next"]');
  await sleep(500);

  // ── Step 5 ──
  if ((await step(page)) !== '5') fail(`${prefix} step4→5`, await step(page));
  else pass(`${prefix} step4→5 nav`);

  const controls = await page.evaluate(() => document.querySelectorAll('#hh-view input, #hh-view select, #hh-view button[data-hh-action]').length);
  if (controls !== 0) fail(`${prefix} step5 read-only`, `controls=${controls}`);
  else pass(`${prefix} step5 read-only`);

  // Back through all steps — data must persist
  for (let s = 4; s >= 1; s--){
    await tap(page, '#hh-wiz-footer [data-hh-action="step-back"]');
    await sleep(400);
    if ((await step(page)) !== String(s)) fail(`${prefix} back to step ${s}`, await step(page));
  }
  pass(`${prefix} back nav all steps`);

  snap = await planSnapshot(page);
  if (snap.primaryName !== 'Audit Client') fail(`${prefix} back name persist`, JSON.stringify(snap));
  else pass(`${prefix} back nav preserves name`);

  await tap(page, '#hh-wiz-footer [data-hh-action="step-next"]');
  await sleep(300);
  await tap(page, '#hh-wiz-footer [data-hh-action="step-next"]');
  await sleep(300);
  snap = await planSnapshot(page);
  if (snap.living !== 48000) fail(`${prefix} forward living persist`, String(snap.living));
  else pass(`${prefix} forward nav preserves living`);

  if (errs.length) fail(`${prefix} js errors`, errs.join('; '));

  await browser.close();
}

await new Promise(r => server.listen(PORT, '127.0.0.1', r));

try {
  await runAudit({ width: 1280, height: 900, deviceScaleFactor: 1 }, 'desktop');
  await runAudit({ width: 390, height: 844, isMobile: true, hasTouch: true }, 'mobile');
} finally {
  server.close();
}

console.log(`\nGPC Wizard Audit: ${passes.length} passed, ${failures.length} failed\n`);
for (const p of passes) console.log('  ✓', p);
for (const f of failures) console.log('  ✗', f.label, '—', f.detail);

process.exit(failures.length ? 1 : 0);
