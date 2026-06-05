/* iPhone screenshotter — drives the real built index.html at iPhone viewport
   so we can SEE the mobile state (logic checks lie; pixels don't).
   Run:  node scripts/shot-mobile.mjs                                          */
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT  = ROOT + 'verify-out';
const PORT = 8771;

const srv = spawn('node', ['-e', `
  import('node:http').then(({createServer})=>{import('node:fs').then(({readFile})=>{
    createServer((req,res)=>{
      const p='${ROOT}'+(req.url==='/'?'/index.html':req.url.split('?')[0]);
      readFile(p,(e,b)=>{ if(e){res.writeHead(404);res.end();return;}
        const ext=p.split('.').pop();
        const ct=ext==='html'?'text/html':ext==='js'?'text/javascript':ext==='css'?'text/css':'application/octet-stream';
        res.writeHead(200,{'content-type':ct});res.end(b);});
    }).listen(${PORT});});});`]);
await wait(400);

const launchOpts = { headless:true, args:['--no-sandbox'] };
const CC='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if(existsSync(CC)) launchOpts.executablePath=CC;
if(process.env.PUPPETEER_EXECUTABLE_PATH) launchOpts.executablePath=process.env.PUPPETEER_EXECUTABLE_PATH;

const b = await puppeteer.launch(launchOpts);
const page = await b.newPage();
// iPhone 14 Pro logical viewport, 3x retina, touch.
await page.setViewport({ width:393, height:852, deviceScaleFactor:3, isMobile:true, hasTouch:true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil:'networkidle2', timeout:20000 });
await wait(1500);

const shots = [
  ['m-01-networth', null],
  ['m-02-scenarios', 'button[data-page="scenarios"]'],
  ['m-03-sequencing', 'button[data-page="sequencing"]'],
];
for(const [name, sel] of shots){
  if(sel){ try{ await page.click(sel); }catch(e){ console.log('no sel', sel);} await wait(900); }
  await page.screenshot({ path:`${OUT}/${name}.png`, fullPage:true });
  console.log('shot', name);
}
await b.close();
try{ srv.kill('SIGTERM'); }catch{}
