/* Throwaway mock shooter — loads a standalone _mock.html and screenshots it at
   the PNG's aspect so we can eyeball the design against the reference before
   any of it touches the live build. Mock-first, build-second.
   Run:  node scripts/shot-mock.mjs [file] [out]                              */
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const FILE = process.argv[2] || (ROOT + '_mock.html');
const OUT  = process.argv[3] || (ROOT + 'verify-out/mock.png');

const launchOpts = { headless: true, args: ['--no-sandbox'] };
const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if (existsSync(CONTAINER_CHROME)) launchOpts.executablePath = CONTAINER_CHROME;
if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

const b = await puppeteer.launch(launchOpts);
const page = await b.newPage();
await page.setViewport({ width: 1672, height: 946, deviceScaleFactor: 2 });
await page.goto('file://' + FILE, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 600)); // let webfonts settle
await page.screenshot({ path: OUT });
await b.close();
console.log('shot →', OUT);
