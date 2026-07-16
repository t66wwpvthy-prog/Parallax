import puppeteer from 'puppeteer';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'verify-out');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'step3-2a-fidelity-1440.png');
const url = process.env.CAPTURE_URL || 'http://127.0.0.1:8825/index.html';

const launch = { headless: true, args: ['--no-sandbox'] };
for(const path of [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]){
  if(existsSync(path)){ launch.executablePath = path; break; }
}

const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });

await page.evaluate(() => {
  const key = 'parallax.households.v1';
  const active = localStorage.getItem('parallax.activeHouseholdId');
  const db = JSON.parse(localStorage.getItem(key) || '{}');
  const plan = db[active];
  if(!plan) throw new Error('No active household after boot');
  const year = new Date().getFullYear();
  plan.meta.primaryName = 'Client 1';
  plan.meta.spouseName = 'Client 2';
  plan.meta.filingStatus = 'marriedFilingJointly';
  plan.household.primary = {
    ...(plan.household.primary || {}),
    birthYear: year - 64,
    currentAge: 64,
    retirementAge: 66,
    planEndAge: 95,
  };
  plan.household.spouse = {
    ...(plan.household.spouse || {}),
    birthYear: year - 63,
    currentAge: 63,
    retirementAge: 65,
    planEndAge: 95,
  };
  plan.income = plan.income || {};
  plan.income.other = [
    { typeId: 'wages', owner: 'client', label: 'Wages or salary', amount: 120000, startAge: 64, endAge: 65, realGrowth: 0.03, taxablePct: 1 },
    { typeId: 'wages', owner: 'spouse', label: 'Wages or salary', amount: 60000, startAge: 63, endAge: 64, realGrowth: 0.03, taxablePct: 1 },
    { typeId: 'interest', owner: 'joint', label: 'Interest', amount: 4200, startAge: 64, endAge: 999, realGrowth: 0, taxablePct: 1 },
    { typeId: 'dividends', owner: 'joint', label: 'Dividends', amount: 8600, startAge: 64, endAge: 999, realGrowth: 0, taxablePct: 1, qualifiedPct: 0.85 },
    { typeId: 'long_term_capital_gain', owner: 'joint', label: 'Long-term capital gains', amount: 12000, startAge: 64, endAge: 64, realGrowth: 0, taxablePct: 0 },
    { typeId: 'short_term_capital_gain', owner: 'joint', label: 'Short-term capital gains', amount: 3500, startAge: 64, endAge: 64, realGrowth: 0, taxablePct: 1 },
  ];
  plan.income.socialSecurity = {
    primary: { pia: 34000, claimAge: 66 },
    spouse: { pia: 28000, claimAge: 65 },
  };
  plan.incomeTax = {
    adjustments: [
      { typeId: '401k', label: '401(k) contribution', owner: 'client', amount: 23000, whileWorkingOnly: true },
      { typeId: '401k', label: '401(k) contribution', owner: 'spouse', amount: 10000, whileWorkingOnly: true },
      { typeId: 'hsa', label: 'HSA contribution', owner: 'joint', amount: 4300, whileWorkingOnly: false },
    ],
    deductions: [
      { typeId: 'medical', label: 'Medical expenses', amount: 6500 },
      { typeId: 'charitable', label: 'Charitable contributions', amount: 12000 },
      { typeId: 'mortgage_interest', label: 'Mortgage interest', amount: 9800 },
      { typeId: 'salt', label: 'State & local taxes', amount: 10000 },
    ],
    credits: [],
    deductionMode: 'auto',
  };
  localStorage.setItem(key, JSON.stringify(db));
});

await page.reload({ waitUntil: 'networkidle2' });
await page.click('.htab[data-page="household"], #tab-household, [data-page="household"]');
await new Promise(r => setTimeout(r, 600));
await page.click('#hh-step-3');
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => {
  const workspace = document.querySelector('.hh-wiz-workspace');
  if(workspace) workspace.scrollTop = 0;
});

const pane = await page.$('#hh-view .hh-it') || await page.$('#hh-view');
await pane.screenshot({ path: outPath });
console.log(outPath);
await browser.close();
