/* Phase A visual smoke: canonical liquid-glass index.html only.
   Legacy monolith is archived — not loaded or verified here.

   Run: node scripts/verify.mjs */
import puppeteer from 'puppeteer';
const chromium = {
  launch: (opts) => puppeteer.launch({
    ...opts,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  }),
};
import { existsSync, mkdirSync, readFile, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verify-out');
const PORT = Number(process.env.VERIFY_PORT || 8765);
const APP_URL = `http://127.0.0.1:${PORT}/parallax.html`;

function step(name, fn){
  return fn().then(
    (r) => { console.log(`  OK ${name}`); return r; },
    (e) => { console.error(`  FAIL ${name}\n${e.message || e}`); process.exit(1); },
  );
}

function contentType(filePath){
  const ext = filePath.split('.').pop();
  if (ext === 'html') return 'text/html';
  if (ext === 'js') return 'text/javascript';
  if (ext === 'css') return 'text/css';
  return 'application/octet-stream';
}

function startStaticServer(){
  const serverRoot = resolve(ROOT);
  const server = createServer((req, res) => {
    const rawPath = (req.url || '/') === '/' ? '/index.html' : (req.url || '/').split('?')[0];
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
      res.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' });
      res.end(body);
    });
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(PORT, '127.0.0.1', () => ok(server));
  });
}

function closeServer(server){
  return new Promise((resolveClose) => server.close(resolveClose));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('engine tests');
const test = spawnSync('node', ['--test', join(ROOT, 'engine.test.js'), join(ROOT, 'history.test.js')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (test.status !== 0) {
  console.error('engine tests failed');
  process.exit(1);
}

console.log('Phase A UI smoke');
const srv = await startStaticServer();

try {
  const launchOpts = { args: ['--no-sandbox'] };
  const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (existsSync(CONTAINER_CHROME)) launchOpts.executablePath = CONTAINER_CHROME;

  const browser = await chromium.launch({ ...launchOpts, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(`PAGE: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`CON: ${m.text()}`); });

  await step('parallax.html serves liquid-glass app (not legacy monolith)', async () => {
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 20000 });
    const m = await page.evaluate(() => ({
      title: document.title,
      hasEngineImport: [...document.querySelectorAll('script')].some((s) => /engine\.js/.test(s.src || s.textContent || '')),
      hasLegacyHdr: !!document.querySelector('.hdr-tabs'),
      nav: [...document.querySelectorAll('.nav button')].map((b) => b.textContent.trim()),
      householdStage: !!document.getElementById('householdStage'),
      householdHub: !!document.getElementById('netWorthHub'),
      clientOrb: !!document.querySelector('#wingClient .person-orb'),
      spouseOrb: !!document.querySelector('#wingSpouse .person-orb'),
    }));
    if (!/liquid glass/i.test(m.title)) throw new Error(`unexpected title: ${m.title}`);
    if (m.hasEngineImport || m.hasLegacyHdr) throw new Error('legacy monolith markup detected on live entry');
    const expectedNav = ['Household', 'Goals', 'Scenarios', 'Sequencing', 'History'];
    if (JSON.stringify(m.nav) !== JSON.stringify(expectedNav)) {
      throw new Error(`nav mismatch: ${JSON.stringify(m.nav)}`);
    }
    if (!m.householdStage || !m.householdHub || !m.clientOrb || !m.spouseOrb) {
      throw new Error('household map stage incomplete');
    }
    await page.screenshot({ path: join(OUT, '01-household-map.png'), fullPage: false });
  });

  await step('expanded orbs show arched account pills', async () => {
    await page.click('#wingClient .person-orb');
    await page.click('#wingSpouse .person-orb');
    await new Promise((r) => setTimeout(r, 600));
    const m = await page.evaluate(() => ({
      clientPills: document.querySelectorAll('#wingClient.hh-wing.expanded .pill-arc .account-pill').length,
      spousePills: document.querySelectorAll('#wingSpouse.hh-wing.expanded .pill-arc .account-pill').length,
      hubTotal: document.getElementById('householdTotal')?.textContent?.trim() || '',
    }));
    if (m.clientPills < 5 || m.spousePills < 5) {
      throw new Error(`expected 5 pills per wing (client=${m.clientPills}, spouse=${m.spousePills})`);
    }
    if (!/^\$[\d,]+$/.test(m.hubTotal)) throw new Error(`hub total missing: ${m.hubTotal}`);
    await page.screenshot({ path: join(OUT, '02-household-expanded.png'), fullPage: false });
  });

  if (errs.length) {
    console.error('PAGE/CONSOLE ERRORS:');
    errs.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }

  await browser.close();
  console.log(`\nOK Phase A verify passed — screenshots in ${OUT}`);
} finally {
  await closeServer(srv);
}
