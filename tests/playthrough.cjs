#!/usr/bin/env node
// Input-only playthroughs. Serves game/ on a local port, opens each scenario in headless Chromium (Playwright),
// fast-forwards the page clock and plays with key presses only. Writes a key log and notes per scenario to
// game/tests/out/ (git-ignored) and prints a pass/fail table.
//
//   NODE_PATH=/path/to/node_modules node game/tests/playthrough.cjs            # every scenario
//   NODE_PATH=... node game/tests/playthrough.cjs water-race hoops             # just these
//
// Needs `playwright-core` (npm i -D playwright-core) and a Chromium from `npx playwright install chromium`.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const { Bot, PAGE_HELPERS } = require('./bot.cjs');
const SCEN = require('./scenarios.cjs'); if (process.env.EXTRA) require(require('path').resolve(process.env.EXTRA)); // extra scenarios for debugging

const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// one scenario in its own browser (pages sharing a browser compete for keyboard focus, and key presses go astray).
// opts.port: a server already running; opts.onPeek(s): sees every peek (roundb.cjs uses it to time each job)
async function runOne(name, opts = {}) {
    let srv = null, port = opts.port; if (!port) { srv = await serve(); port = srv.address().port; } fs.mkdirSync(OUT, { recursive: true });
    const sc = SCEN[name]; const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install(); await page.addInitScript(PAGE_HELPERS);
    await page.goto(`http://127.0.0.1:${port}/index.html?${sc.query}`);
    for (let i = 0; i < 600 && !(await page.evaluate(() => window.__ready)); i++) await page.clock.runFor(100);
    await page.clock.runFor(800);
    const bot = new Bot(page, name); const t0 = Date.now(); let pass = false, outcome = '';
    if (opts.onPeek) { const peek = bot.peek.bind(bot); bot.peek = async () => { const s = await peek(); opts.onPeek(s); return s; }; }
    try {
      outcome = await Promise.race([sc.run(bot), new Promise((_, rej) => setTimeout(() => rej(new Error('real-time limit')), (sc.maxSec || 600) * 1000 * 2))]);
      pass = true;
    } catch (e) { outcome = 'FAIL: ' + e.message; try { await page.screenshot({ path: path.join(OUT, name + '-fail.png') }); } catch (e2) { /* closed */ } }
    const s = await bot.peek().catch(() => ({}));
    if (errors.length || s.err) { pass = false; outcome += ' | errors: ' + [...errors, s.err].filter(Boolean).slice(0, 3).join(' / '); }
    const r = { name, pass, outcome, gameSec: +(s.t || 0).toFixed(0), realSec: Math.round((Date.now() - t0) / 1000), keys: bot.keylog.length, notes: bot.notes };
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ ...r, keylog: bot.keylog }, null, 1));
    if (!opts.quiet) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${r.gameSec}s game, ${r.realSec}s real, ${r.keys} key events)  ${outcome}`);
    await browser.close(); if (srv) srv.close();
    return { ...r, errors };
}
module.exports = { runOne, serve };

if (require.main === module) (async () => {
  const only = process.argv.slice(2); const names = Object.keys(SCEN).filter(n => SCEN[n].run && (only.length ? only.includes(n) : !SCEN[n].hidden));
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(); const port = srv.address().port;
  const results = [];
  // a couple at a time: many pages at once starve each other and the bot's key timing goes to pot
  const CONC = +(process.env.CONC || 2); const queue = names.slice();
  await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) results.push(await runOne(queue.shift(), { port })); }));
  srv.close();
  console.log('\n| scenario | result | game time | key events | outcome |\n|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.name} | ${r.pass ? 'pass' : 'FAIL'} | ${r.gameSec}s | ${r.keys} | ${r.outcome.replace(/\|/g, '/')} |`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
})();
