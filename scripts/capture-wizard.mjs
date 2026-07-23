import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verify-out');
const PORT = process.env.PORT || 8825;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const launchOpts = { headless: true, args: ['--no-sandbox'] };
const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
for (const chromePath of chromeCandidates) {
  if (existsSync(chromePath)) {
    launchOpts.executablePath = chromePath;
    break;
  }
}
if (!launchOpts.executablePath) {
  console.error('No Chrome executable found. Set PUPPETEER_EXECUTABLE_PATH.');
  process.exit(1);
}

const browser = await puppeteer.launch(launchOpts);
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1500);

await page.click('.htab[data-page="household"]');
await sleep(600);

await page.screenshot({ path: join(OUT, 'wizard-step4-blueprint.png'), fullPage: true });

for (const n of [1, 2, 3]) {
  await page.click('#hh-step-' + n);
  await sleep(500);
  if (n === 2) {
    await page.click('[data-hh-action="open-account-form"][data-owner="client"]');
    await sleep(400);
    await page.screenshot({ path: join(OUT, 'wizard-step2-account-form.png'), fullPage: true });
    await page.click('[data-hh-action="cancel-account"]');
    await sleep(300);
  }
  await page.screenshot({ path: join(OUT, 'wizard-step' + n + '.png'), fullPage: true });
}

await browser.close();
console.log('Screenshots saved to', OUT);
