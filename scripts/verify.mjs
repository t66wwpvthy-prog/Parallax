/* Visual verification probe: build, test, serve the standalone app, drive
   headless Chromium through the real built index.html, and write screenshots
   to ./verify-out/. Exit non-zero if anything fails.

   Run: node scripts/verify.mjs */
import puppeteer from 'puppeteer';
const chromium = { launch: (opts) => puppeteer.launch({ ...opts, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined }) };
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

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('build');
const build = spawnSync('node', [join(ROOT, 'build-standalone.mjs')], { cwd: ROOT, stdio: 'inherit' });
if(build.status !== 0){ console.error('build failed'); process.exit(1); }

console.log('engine tests');
const test = spawnSync('node', ['--test', join(ROOT, 'engine.test.js')], { cwd: ROOT, stdio: 'inherit' });
if(test.status !== 0){ console.error('engine tests failed'); process.exit(1); }

console.log('serve + drive');
const srv = await startStaticServer();

try {
  const launchOpts = {};
  const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (existsSync(CONTAINER_CHROME)) {
    launchOpts.executablePath = CONTAINER_CHROME;
  }
  launchOpts.args = ['--no-sandbox'];

  const browser = await chromium.launch({ ...launchOpts, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 3 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errs.push('CON: ' + m.text()); });

  await step('load index.html', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
  });

  await step('net worth balance sheet renders', async () => {
    const m = await page.evaluate(() => ({
      title: document.querySelectorAll('.bs-title').length,
      heads: document.querySelectorAll('.bs-head').length,
      inputs: document.querySelectorAll('.bs-row input').length,
      hhbar: document.querySelectorAll('.hh-f input').length,
    }));
    if(m.title < 1 || m.heads < 3 || m.inputs < 3 || m.hhbar < 4) {
      throw new Error(`Balance Sheet did not render (title=${m.title}, heads=${m.heads}, inputs=${m.inputs}, hhbar=${m.hhbar})`);
    }
    await page.screenshot({ path: join(OUT, '01-balance-sheet.png'), fullPage: true });
  });

  await step('net worth cash flow renders two hybrid columns + gutter', async () => {
    await page.click('#np-subnav .stab[data-sub="cashflow"]');
    await new Promise(r => setTimeout(r, 200));
    const m = await page.evaluate(() => ({
      gutterBig: document.querySelector('.np-gutter .big-num')?.textContent || '',
      gutterRows: document.querySelectorAll('.np-gutter .row').length,
      cols: document.querySelectorAll('.hp-col').length,
    }));
    if(m.cols !== 2) throw new Error(`cashflow hybrid did not render two columns (cols=${m.cols})`);
    if(!m.gutterBig.startsWith('$')) throw new Error(`cashflow gutter big-number missing (got "${m.gutterBig}")`);
    if(m.gutterRows < 2) throw new Error(`cashflow gutter breakdown rows missing (got ${m.gutterRows})`);
    await page.screenshot({ path: join(OUT, '02-cashflow.png'), fullPage: true });
  });

  await step('net worth goals renders the priority board', async () => {
    await page.click('#np-subnav .stab[data-sub="goals"]');
    await new Promise(r => setTimeout(r, 300));
    const m = await page.evaluate(() => ({
      board: !!document.querySelector('#np-content.g-mode .g-board'),
      hero: document.querySelector('.g-big')?.textContent || '',
      cards: document.querySelectorAll('.g-card').length,
      once: document.querySelectorAll('.g-card.once').length,
      slots: document.querySelectorAll('.g-slot').length,
      boardH: Math.round(document.querySelector('.g-board')?.getBoundingClientRect().height || 0),
    }));
    if(!m.board) throw new Error('goals board did not render');
    if(!m.hero.startsWith('$')) throw new Error(`goals hero annual-spend missing (got "${m.hero}")`);
    if(m.cards < 1) throw new Error(`goals board rendered no cards (cards=${m.cards})`);
    if(m.once < 1) throw new Error(`goals board missing the one-time card (once=${m.once})`);
    if(m.slots < 6) throw new Error(`goals board expected >=6 ghost slots (slots=${m.slots})`);
    if(m.boardH < 200) throw new Error(`goals board height = ${m.boardH}px (expected >=200)`);
    await page.screenshot({ path: join(OUT, '02-goals.png'), fullPage: true });
  });

  await step('net worth snapshot renders four gauges', async () => {
    await page.click('#np-subnav .stab[data-sub="snapshot"]');
    await new Promise(r => setTimeout(r, 200));
    const m = await page.evaluate(() => ({
      page: !!document.querySelector('.np-snapshot-page .snap'),
      metrics: document.querySelectorAll('.np-snapshot-page .metric').length,
      heroes: [...document.querySelectorAll('.np-snapshot-page .m-hero')].map(e => e.textContent),
      cov: !!document.querySelector('.np-snapshot-page .cov .fill'),
      seg: document.querySelectorAll('.np-snapshot-page .seg div').length,
    }));
    if(!m.page) throw new Error('snapshot page did not render');
    if(m.metrics !== 4) throw new Error(`snapshot expected 4 metrics, got ${m.metrics}`);
    if(!m.cov) throw new Error('snapshot coverage bar missing');
    if(m.seg !== 3) throw new Error(`snapshot tax bar expected 3 segments, got ${m.seg}`);
    if(!m.heroes.every(h => /%$/.test(h))) throw new Error(`snapshot hero numbers not all %: ${JSON.stringify(m.heroes)}`);
    await page.screenshot({ path: join(OUT, '02-snapshot.png'), fullPage: true });
  });

  await step('net worth property card with engine-derived mortgage', async () => {
    await page.click('#np-subnav .stab[data-sub="balance-sheet"]');
    await new Promise(r => setTimeout(r, 200));
    const m = await page.evaluate(() => ({
      props: document.querySelectorAll('.prop').length,
      meta: document.querySelector('.prop-meta')?.textContent || '',
      mortInputs: document.querySelectorAll('.prop-mort input').length,
    }));
    if(m.props < 1) throw new Error('no property card rendered');
    if(m.mortInputs < 3) throw new Error(`property mortgage inputs missing (got ${m.mortInputs})`);
    if(!/paid off at age/.test(m.meta)) throw new Error(`property meta missing engine payoff line: "${m.meta}"`);
    const card = await page.$('.prop');
    await card.screenshot({ path: join(OUT, '06-property.png') });
  });

  await step('add-row workflow appends and deletes an editable row', async () => {
    await page.click('#np-subnav .stab[data-sub="cashflow"]');
    await new Promise(r => setTimeout(r, 200));
    const before = await page.evaluate(() => document.querySelectorAll('.hp-col .erow').length);
    await page.click('.hp-add[data-add="income"]');
    await new Promise(r => setTimeout(r, 200));
    const after = await page.evaluate(() => document.querySelectorAll('.hp-col .erow').length);
    if(after !== before + 1) throw new Error(`add-row did not append (before=${before}, after=${after})`);
    await page.click('.erow .row-x');
    await new Promise(r => setTimeout(r, 150));
    const final = await page.evaluate(() => document.querySelectorAll('.hp-col .erow').length);
    if(final !== before) throw new Error(`row delete did not splice (final=${final}, expected ${before})`);
  });

  await step('scenarios renders after tab switch', async () => {
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 800));
    const m = await page.evaluate(() => ({
      band: document.querySelectorAll('.scn-band svg circle').length,
      status: document.querySelector('#status')?.textContent || '',
      goalRows: document.querySelectorAll('#scn-goals .sg-name').length,
      goalCells: document.querySelectorAll('#scn-goals .sg-cell').length,
      goalTotal: document.querySelector('#scn-goals .sg-tcell')?.textContent || '',
    }));
    if(m.band < 1) throw new Error(`scenarios did not render (band circles=${m.band}, status="${m.status}")`);
    if(m.goalRows < 1) throw new Error(`scenarios goals section rendered no goal rows (goalRows=${m.goalRows})`);
    if(m.goalCells < m.goalRows) throw new Error(`goals not mirrored into columns (cells=${m.goalCells}, rows=${m.goalRows})`);
    if(!m.goalTotal.startsWith('$')) throw new Error(`goals total row missing a dollar figure (got "${m.goalTotal}")`);
    await page.screenshot({ path: join(OUT, '03-scenarios.png'), fullPage: true });
  });

  await step('cash-flow drawer opens with real height + rows', async () => {
    await page.click('#cf-btn');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const d = document.querySelector('#cf-drawer');
      return {
        rows: d?.querySelectorAll('.cf-table tbody tr').length || 0,
        height: d?.getBoundingClientRect().height || 0,
        retireAges: [...(d?.querySelectorAll('td.retire-start') || [])]
          .map(td => td.parentElement.querySelector('td.age')?.textContent.trim())
          .filter(Boolean),
      };
    });
    if(m.rows < 10) throw new Error(`cash-flow rows = ${m.rows} (expected >=10)`);
    if(m.height < 100) throw new Error(`cash-flow height = ${m.height}px (expected >=100)`);
    if(m.retireAges.length < 3) throw new Error(`cash-flow scenario retirement markers missing (${JSON.stringify(m.retireAges)})`);
    if(!new Set(m.retireAges).has('67')) throw new Error(`moved-retirement scenario marker missing (${JSON.stringify(m.retireAges)})`);
    await page.evaluate(() => document.querySelector('#cf-drawer').scrollIntoView());
    await new Promise(r => setTimeout(r, 200));
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

  if(errs.length){
    console.error('PAGE/CONSOLE ERRORS:');
    errs.forEach(e => console.error('  ' + e));
  }

  await browser.close();
  console.log(`\nOK verify passed - screenshots in ${OUT}`);
} finally {
  await closeServer(srv);
}
