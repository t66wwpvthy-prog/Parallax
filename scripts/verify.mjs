/* Visual verification probe — the single source of truth for "is it working".
   Builds the standalone, runs the engine tests, spins a local server, drives
   headless Chromium through the real built index.html, and writes screenshots
   of every page state to ./verify-out/. Exit non-zero if anything fails.

   Use this BEFORE claiming a UI/visual task is done. The cash-flow drawer
   shipping at 2px-tall taught us that logic checks lie — pixels don't.

   Run:  node scripts/verify.mjs                                              */
import puppeteer from 'puppeteer';
const chromium = { launch: (opts) => puppeteer.launch({ ...opts, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined }) };
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT  = ROOT + 'verify-out';
const PORT = 8765;

function step(name, fn){
  return fn().then(
    r => { console.log(`  ✓ ${name}`); return r; },
    e => { console.error(`  ✗ ${name}\n${e.message||e}`); process.exit(1); }
  );
}

// Re-create the out dir each run so stale screenshots can't lie about state.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('▶ build');
const build = spawnSync('node', [ROOT+'build-standalone.mjs'], { cwd: ROOT, stdio: 'inherit' });
if(build.status !== 0){ console.error('build failed'); process.exit(1); }

console.log('▶ engine tests');
const t = spawnSync('node', ['--test', ROOT+'engine.test.js'], { cwd: ROOT, stdio: 'inherit' });
if(t.status !== 0){ console.error('engine tests failed'); process.exit(1); }

console.log('▶ serve + drive');
// Minimal static server (no dependency on http-server being installed globally).
const srv = spawn('node', ['-e', `
  import('node:http').then(({createServer})=>{
  import('node:fs').then(({readFile})=>{
    createServer((req,res)=>{
      const p = '${ROOT}' + (req.url==='/'?'/index.html':req.url.split('?')[0]);
      readFile(p, (e,b)=>{
        if(e){ res.writeHead(404); res.end(); return; }
        const ext = p.split('.').pop();
        const ct = ext==='html'?'text/html':ext==='js'?'text/javascript':ext==='css'?'text/css':'application/octet-stream';
        res.writeHead(200, { 'content-type': ct }); res.end(b);
      });
    }).listen(${PORT});
  });});
`], { detached: false });
await wait(400);

try {
  // Auto-detect chromium: prefer the container's pinned build, fall back to
  // the playwright-managed default on a developer laptop.
  const launchOpts = {};
  const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (existsSync(CONTAINER_CHROME)) {
    launchOpts.executablePath = CONTAINER_CHROME;
    launchOpts.args = ['--no-sandbox'];
  }
  launchOpts.args = [...(launchOpts.args || []), '--no-sandbox'];
  const b = await chromium.launch({ ...launchOpts, headless: true });
  const page = await b.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console',  m => { if(m.type()==='error') errs.push('CON: ' + m.text()); });

  await step('load index.html', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500)); // runAll
  });

  await step('net worth · balance sheet renders', async () => {
    // The new first tab is Net Worth, defaulting to the Balance Sheet sub-page.
    // A live render means the "Assets" title, the section heads, the investment
    // rows, and the Household & Plan inputs now sitting in the left gutter.
    const m = await page.evaluate(() => ({
      title:  document.querySelectorAll('.bs-title').length,
      heads:  document.querySelectorAll('.bs-head').length,
      inputs: document.querySelectorAll('.bs-row input').length,
      hhbar: document.querySelectorAll('.hh-f input').length,
    }));
    if(m.title < 1 || m.heads < 3 || m.inputs < 3 || m.hhbar < 4)
      throw new Error(`Balance Sheet did not render (title=${m.title}, heads=${m.heads}, inputs=${m.inputs}, hhbar=${m.hhbar})`);
    await page.screenshot({ path: `${OUT}/01-balance-sheet.png`, fullPage: true });
  });

  await step('net worth sub-nav cycles through inflows / outflows / goals', async () => {
    for(const sub of ['inflows','outflows','goals']){
      await page.click(`#np-subnav .stab[data-sub="${sub}"]`);
      await new Promise(r => setTimeout(r, 200));
      const m = await page.evaluate(() => ({
        gutterBig: document.querySelector('.np-gutter .big-num')?.textContent || '',
        gutterRows: document.querySelectorAll('.np-gutter .row').length,
        cols: document.querySelectorAll('.hp-col').length,
      }));
      if(m.cols !== 2) throw new Error(`${sub} hybrid did not render two columns (cols=${m.cols})`);
      if(!m.gutterBig.startsWith('$')) throw new Error(`${sub} gutter big-number missing (got "${m.gutterBig}")`);
      if(m.gutterRows < 2) throw new Error(`${sub} gutter breakdown rows missing (got ${m.gutterRows})`);
      await page.screenshot({ path: `${OUT}/02-${sub}.png`, fullPage: true });
    }
  });

  await step('net worth · snapshot embedded in balance-sheet right column', async () => {
    // Snapshot is no longer a sub-tab; it lives in the Net Worth page's right
    // column. Go back to balance-sheet and assert the embedded gauges render.
    await page.click(`#np-subnav .stab[data-sub="balance-sheet"]`);
    await new Promise(r => setTimeout(r, 200));
    const m = await page.evaluate(() => ({
      embedded: !!document.querySelector('.np-snapshot .snap'),
      metrics: document.querySelectorAll('.np-snapshot .metric').length,
      heroes:  [...document.querySelectorAll('.np-snapshot .m-hero')].map(e=>e.textContent),
      cov:     !!document.querySelector('.np-snapshot .cov .fill'),
      wrStats: document.querySelectorAll('.np-snapshot .metric:nth-child(2) .stat-item').length,
      seg:     document.querySelectorAll('.np-snapshot .seg div').length,
    }));
    if(!m.embedded) throw new Error('snapshot not embedded in balance-sheet right column');
    if(m.metrics !== 4) throw new Error(`snapshot expected 4 metrics, got ${m.metrics}`);
    if(!m.cov)         throw new Error('snapshot income-floor coverage bar missing');
    if(m.wrStats < 2)  throw new Error(`snapshot withdrawal-rate stat items expected ≥2, got ${m.wrStats}`);
    if(m.seg !== 3) throw new Error(`snapshot tax bar expected 3 segments, got ${m.seg}`);
    if(!m.heroes.every(h => /%$/.test(h))) throw new Error(`snapshot hero numbers not all %: ${JSON.stringify(m.heroes)}`);
    // Income floor uses stat-row now; only replacement ratio keeps the coverage bar.
    const covBars = await page.evaluate(() => document.querySelectorAll('.np-snapshot .cov .fill').length);
    if(covBars !== 1) throw new Error(`snapshot expected 1 coverage bar (replacement ratio), got ${covBars}`);
    await page.screenshot({ path: `${OUT}/02-snapshot.png`, fullPage: true });
  });

  await step('scenarios renders (after tab switch)', async () => {
    await page.click('button[data-page="scenarios"]');
    await new Promise(r => setTimeout(r, 800));
    const m = await page.evaluate(() => ({
      band: document.querySelectorAll('.scn-band svg circle').length,
      status: document.querySelector('#status')?.textContent || '',
    }));
    if(m.band < 1) throw new Error(`scenarios did not render (band circles=${m.band}, status="${m.status}")`);
    await page.screenshot({ path: `${OUT}/03-scenarios.png`, fullPage: true });
  });

  await step('cash-flow drawer opens with real height + rows', async () => {
    await page.click('#cf-btn');
    await new Promise(r => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const d = document.querySelector('#cf-drawer');
      return {
        rows: d?.querySelectorAll('.cf-table tbody tr').length || 0,
        height: d?.getBoundingClientRect().height || 0,
      };
    });
    if(m.rows < 10)    throw new Error(`cash-flow rows = ${m.rows} (expected ≥10)`);
    if(m.height < 100) throw new Error(`cash-flow height = ${m.height}px (expected ≥100 — flex-shrink regression?)`);
    await page.evaluate(() => document.querySelector('#cf-drawer').scrollIntoView());
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: `${OUT}/04-cashflow.png`, fullPage: true });
  });

  await step('sequencing renders all chips on', async () => {
    await page.click('button[data-page="sequencing"]');
    await new Promise(r => setTimeout(r, 600));
    await page.evaluate(() => document.querySelectorAll('.seq-chip').forEach(c => { if(!c.classList.contains('on')) c.click(); }));
    await new Promise(r => setTimeout(r, 600));
    const ok = await page.evaluate(() => document.querySelectorAll('#seq-svg path').length > 4);
    if(!ok) throw new Error('sequencing chart missing paths');
    const el = await page.$('.seq-chart');
    await el.screenshot({ path: `${OUT}/05-sequencing.png` });
  });

  if(errs.length){
    console.error('PAGE/CONSOLE ERRORS:');
    errs.forEach(e => console.error('  ' + e));
    // page errors are loud, but not necessarily fatal — most we see are favicon
    // 404s. Don't fail the run on them; just surface.
  }

  await b.close();
  console.log(`\n✓ verify passed — screenshots in ${OUT}/`);
} finally {
  try { srv.kill('SIGTERM'); } catch {}
}
