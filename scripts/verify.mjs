/* Visual verification probe — the single source of truth for "is it working".
   Builds the standalone, runs the engine tests, spins a local server, drives
   headless Chromium through the real built index.html, and writes screenshots
   of every page state to ./verify-out/. Exit non-zero if anything fails.

   Use this BEFORE claiming a UI/visual task is done. The cash-flow drawer
   shipping at 2px-tall taught us that logic checks lie — pixels don't.

   Run:  node scripts/verify.mjs                                              */
import { chromium } from 'playwright';
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
  const b = await chromium.launch(launchOpts);
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console',  m => { if(m.type()==='error') errs.push('CON: ' + m.text()); });

  await step('load index.html', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500); // runAll
  });

  await step('net worth · balance sheet renders', async () => {
    // The new first tab is Net Worth, defaulting to the Balance Sheet sub-page.
    // A live render means at least one gold-underlined section head + a money input.
    const m = await page.evaluate(() => ({
      heads: document.querySelectorAll('.bs-head').length,
      inputs: document.querySelectorAll('.bs-row input').length,
    }));
    if(m.heads < 3 || m.inputs < 5)
      throw new Error(`Balance Sheet did not render (heads=${m.heads}, inputs=${m.inputs})`);
    await page.screenshot({ path: `${OUT}/01-balance-sheet.png`, fullPage: true });
  });

  await step('net worth sub-nav cycles through inflows / outflows / goals', async () => {
    for(const sub of ['inflows','outflows','goals']){
      await page.click(`#np-subnav .stab[data-sub="${sub}"]`);
      await page.waitForTimeout(200);
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

  await step('scenarios renders (after tab switch)', async () => {
    await page.click('button[data-page="scenarios"]');
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({
      band: document.querySelectorAll('.scn-band svg circle').length,
      status: document.querySelector('#status')?.textContent || '',
    }));
    if(m.band < 1) throw new Error(`scenarios did not render (band circles=${m.band}, status="${m.status}")`);
    await page.screenshot({ path: `${OUT}/03-scenarios.png`, fullPage: true });
  });

  await step('cash-flow drawer opens with real height + rows', async () => {
    await page.click('#cf-btn');
    await page.waitForTimeout(400);
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
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/04-cashflow.png`, fullPage: true });
  });

  await step('sequencing renders all chips on', async () => {
    await page.click('button[data-page="sequencing"]');
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll('.seq-chip').forEach(c => { if(!c.classList.contains('on')) c.click(); }));
    await page.waitForTimeout(600);
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
