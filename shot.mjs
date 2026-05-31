// Internal dev tool: render parallax_v2.html headless, click Run, screenshot.
// Usage: node shot.mjs [outfile.png]
import puppeteer from 'puppeteer';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';

const ROOT = process.cwd();
const PORT = 8731;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/parallax_v2.html';
  const f = join(ROOT, p);
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'text/plain' });
  res.end(readFileSync(f));
});

await new Promise(r => server.listen(PORT, r));

const out = process.argv[2] || 'shot.png';
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1320, deviceScaleFactor: 2 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));

await page.goto(`http://localhost:${PORT}/parallax_v2.html`, { waitUntil: 'networkidle0' });
// click Run and wait for completion
await page.click('#run-btn').catch(()=>{});
await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Complete', { timeout: 15000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 700)); // let the ring animation settle

await page.screenshot({ path: out, fullPage: false });
if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n'));
console.log('wrote ' + out);
await browser.close();
server.close();
