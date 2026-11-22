// How hard the game works the machine, per screen. For each scenario it gets into the state with input only (or the
// ?play= / &hour= / &at= test hooks), lets it settle, then samples and records:
//   fps      frames actually drawn to the screen per second (a frame counts when any on-page canvas was drawn to
//            between two display refreshes; counted by a tiny hook on the canvas API, so it doesn't depend on the game)
//   busy     main-thread busy time, ms per second (CDP Performance.getMetrics TaskDuration delta)
//   script   of which JavaScript, ms per second (ScriptDuration delta)
//   canvas   the on-page canvas backing size, and the world buffer when the game says (VH.Perf.info)
// Headless Chromium draws in software and its display runs at about 120 Hz, so treat the numbers as relative and
// compare like with like (the same scenario, the same machine, the same run of this script).
//
//   cd game && python3 -m http.server 4433 &
//   node tests/perf.mjs                        # every scenario
//   node tests/perf.mjs foot drive             # just those
//   SETTINGS='{"gfx":"low"}' node tests/perf.mjs   # with saved settings (merged into the 'settings' save)
//   OUT=/tmp/perf.json LABEL=before node tests/perf.mjs   # also write the results as JSON
//   SETTLE=5 SAMPLE=10 SHOTS=/tmp/p node tests/perf.mjs   # seconds; a screenshot per scenario
// Needs Playwright (NODE_PATH, or PW=/path/to/playwright/index.mjs). BASE=http://... to point elsewhere.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch (e) { if (!process.env.PW) throw e; pw = await import(process.env.PW); }
const { chromium, devices } = pw;
const BASE = process.env.BASE || 'http://localhost:4433/index.html';
const SETTLE = +(process.env.SETTLE || 5) * 1000, SAMPLE = +(process.env.SAMPLE || 10) * 1000;
const SETTINGS = process.env.SETTINGS ? JSON.parse(process.env.SETTINGS) : null;
const SHOTS = process.env.SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOWN = '4870,2790'; // the town centre, by the station and the fish shop

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHONE = () => ({ ...devices['iPhone 13'] });

// counts frames drawn to the screen: a draw call on a canvas that's in the page marks the current display refresh
const FRAME_HOOK = () => {
  const P = CanvasRenderingContext2D.prototype; let drew = false; window.__frames = 0;
  for (const k of ['drawImage', 'fillRect', 'clearRect', 'putImageData', 'fill', 'stroke']) { const f = P[k]; P[k] = function (...a) { if (!drew && this.canvas.isConnected) drew = true; return f.apply(this, a); }; }
  const tick = () => { if (drew) { window.__frames++; drew = false; } requestAnimationFrame(tick); }; requestAnimationFrame(tick);
};

// ---------- getting about: a small driver that follows a planned route with the keys or a thumb on the stick ----------
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const peek = () => { const pl = VH.Game.player, v = pl.vehicle; const o = v && !pl.onFoot ? v : pl; return { x: o.x, y: o.y, ang: o.ang, speed: v && !pl.onFoot ? v.speed : Math.hypot(pl.vx, pl.vy), onFoot: pl.onFoot, st: VH.Game.state }; };
const planFoot = ([x0, y0, x1, y1]) => { const N = VH.Nav, c = N.calls; const p = N.path(x0, y0, x1, y1, { maxIter: 20000 }); N.calls = c; return p; };
const planRoad = ([x0, y0, x1, y1]) => VH.AI.route(x0, y0, x1, y1);
class Driver {
  constructor(s, goals) { this.s = s; this.goals = goals; this.gi = 0; this.route = null; this.ri = 0; this.held = new Set(); this.stop = false; this.stuck = 0; }
  async keys(want) { const kb = this.s.page.keyboard; for (const k of [...this.held]) if (!want.has(k)) { await kb.up(k); this.held.delete(k); } for (const k of want) if (!this.held.has(k)) { await kb.down(k); this.held.add(k); } }
  async run() { while (!this.stop) { try { await this.step(); } catch (e) { /* page closing */ return; } await sleep(80); } await this.keys(new Set()).catch(() => {}); if (this.s.stick) await this.s.touch('touchEnd', []).catch(() => {}); }
  async step() {
    const p = await this.s.page.evaluate(peek); if (p.st !== 'play') return;
    const g = this.goals[this.gi % this.goals.length];
    if (!this.route || Math.hypot(g[0] - p.x, g[1] - p.y) < 6 || this.ri >= this.route.length) {
      if (this.route) this.gi++; const g2 = this.goals[this.gi % this.goals.length];
      this.route = await this.s.page.evaluate(p.onFoot ? planFoot : planRoad, [p.x, p.y, g2[0], g2[1]]) || [g2]; this.ri = 0;
    }
    const look = p.onFoot ? 1.5 : Math.max(8, p.speed * 0.8);
    while (this.ri < this.route.length - 1 && Math.hypot(this.route[this.ri][0] - p.x, this.route[this.ri][1] - p.y) < look) this.ri++;
    const wp = this.route[this.ri]; const want = Math.atan2(wp[1] - p.y, wp[0] - p.x); const da = angDiff(p.ang, want);
    if (p.speed < 0.5) { if (++this.stuck > 25) { this.route = null; this.gi++; this.stuck = 0; } } else this.stuck = 0;
    if (this.s.stick) { // a thumb on the stick, pushed toward the next point (the stick steers by direction)
      const { x0, y0, R } = this.s.stick; const k = p.onFoot ? 0.95 : 1; const pt = [{ x: x0 + Math.cos(want) * R * k, y: y0 + Math.sin(want) * R * k, id: 1 }];
      if (!this.down) { await this.s.touch('touchStart', [{ x: x0, y: y0, id: 1 }]); this.down = true; await sleep(30); }
      await this.s.touch('touchMove', pt); return;
    }
    const w = new Set();
    if (da > 0.08) w.add('KeyD'); else if (da < -0.08) w.add('KeyA');
    if (p.onFoot) { if (Math.abs(da) < 1.1) w.add('KeyW'); }
    else { const vmax = Math.abs(da) > 0.8 ? 8 : Math.abs(da) > 0.4 ? 14 : 99; if (p.speed < vmax) w.add('KeyW'); else if (p.speed > vmax + 4) w.add('KeyS'); }
    await this.keys(w);
  }
}

// ---------- the scenarios ----------
async function open(browser, ctxOpts, query) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(FRAME_HOOK);
  if (SETTINGS) await ctx.addInitScript(s => { try { const k = 'schoolies-mayhem:settings'; const o = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...o, ...s })); } catch (e) { /* no storage */ } }, SETTINGS);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + (query ? '?' + query : '')); await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }); await sleep(300);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  const s = { ctx, page, cdp, errors, touch: (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints }) };
  if (ctxOpts.hasTouch) { const vp = page.viewportSize(); const R = await page.evaluate(() => { const c = document.getElementById('game'); return (VH.Input.stickR || 30) * VH.Input.scale * c.getBoundingClientRect().width / c.width; }); s.stick = { x0: vp.width * 0.25, y0: vp.height * 0.62, R }; }
  return s;
}
const SCEN = {
  title: { dev: 'desktop', what: 'title screen', q: '', async go(s) { /* the title, as it loads */ } },
  foot: { dev: 'desktop', what: 'Jaz on foot, night, town', q: `play=schoolie&hour=21.5&at=${TOWN}`, drive: [[4905, 2745], [4830, 2800]] },
  drive: { dev: 'desktop', what: 'Kev driving fast, night, siren', q: 'play=cop&hour=22', async go(s) { await s.page.keyboard.press('KeyH'); }, drive: [[3100, 1350], [3326, 3001]] },
  pause: { dev: 'desktop', what: 'pause menu (over Jaz at night)', q: `play=schoolie&hour=21.5&at=${TOWN}`, async go(s) { for (let i = 0; i < 3 && (await s.page.evaluate(() => VH.Game.state)) !== 'pause'; i++) { await s.page.keyboard.press('Escape'); await sleep(300); } } },
  map: { dev: 'desktop', what: 'full map (Jaz at night)', q: `play=schoolie&hour=21.5&at=${TOWN}`, async go(s) { await s.page.keyboard.press('KeyM'); await sleep(300); } },
  // the page hidden (another tab): document.hidden is faked and visibilitychange sent, as a browser does; it should
  // draw nothing, then come back paused, with a normal-sized first step
  hidden: { dev: 'desktop', what: 'page hidden (Jaz at night, then hidden)', q: `play=schoolie&hour=21.5&at=${TOWN}`, hide: true },
  'phone-foot': { dev: 'phone', what: 'iPhone 13: Jaz on foot, night, town', q: `play=schoolie&hour=21.5&at=${TOWN}`, drive: [[4905, 2745], [4830, 2800]] },
  'phone-drive': { dev: 'phone', what: 'iPhone 13: Kev driving, night, siren', q: 'play=cop&hour=22', async go(s) { const b = await s.page.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(), k = r.width / c.width, I = VH.Input; const b = I.buttons.find(b => b.id === 'horn' || b.id === 'siren'); return b ? { x: r.left + ((b.x + b.w / 2) * I.scale + I.offX) * k, y: r.top + ((b.y + b.h / 2) * I.scale + I.offY) * k } : null; }); if (b) await s.page.touchscreen.tap(b.x, b.y); }, drive: [[3100, 1350], [3326, 3001]] },
};
async function measure(browser, name) {
  const sc = SCEN[name]; const s = await open(browser, sc.dev === 'phone' ? PHONE() : DESKTOP, sc.q);
  try {
    if (sc.go) await sc.go(s);
    let drv = null; if (sc.drive) { drv = new Driver(s, sc.drive); drv.p = drv.run(); }
    await sleep(SETTLE);
    if (sc.hide) await s.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const m0 = await s.cdp.send('Performance.getMetrics'); const f0 = await s.page.evaluate(() => window.__frames); const t0 = Date.now();
    await sleep(SAMPLE);
    const m1 = await s.cdp.send('Performance.getMetrics'); const f1 = await s.page.evaluate(() => window.__frames); const secs = (Date.now() - t0) / 1000;
    const info = await s.page.evaluate(() => ({ state: VH.Game.state, canvases: [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height), extra: VH.Perf && VH.Perf.info ? VH.Perf.info() : null, pos: VH.Game.player ? [Math.round(VH.Game.player.x), Math.round(VH.Game.player.y)] : null, speed: VH.Game.player && VH.Game.player.vehicle && !VH.Game.player.onFoot ? +VH.Game.player.vehicle.speed.toFixed(1) : null, siren: !!(VH.Game.player && VH.Game.player.vehicle && VH.Game.player.vehicle.siren) }));
    if (sc.hide) {
      await s.page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
      const f2 = await s.page.evaluate(() => window.__frames); await sleep(1000);
      info.back = await s.page.evaluate(f2 => ({ fps: window.__frames - f2, state: VH.Game.state, dt: VH.Game.frameDt }), f2);
    }
    if (SHOTS) await s.page.screenshot({ path: `${SHOTS}/${name}.png` });
    if (drv) { drv.stop = true; await drv.p; }
    const get = (m, k) => (m.metrics.find(q => q.name === k) || { value: 0 }).value;
    const d = k => (get(m1, k) - get(m0, k)) * 1000 / secs;
    return { name, what: sc.what, fps: +((f1 - f0) / secs).toFixed(1), busy: +d('TaskDuration').toFixed(0), script: +d('ScriptDuration').toFixed(0), ...info, errors: s.errors.slice(0, 3) };
  } finally { await s.ctx.close(); }
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCEN);
const browser = await chromium.launch(); const out = [];
try {
  for (const n of names) {
    if (!SCEN[n]) { console.log('no such scenario: ' + n); continue; }
    try { const r = await measure(browser, n); out.push(r); console.log(`${n.padEnd(12)} ${String(r.fps).padStart(6)} fps  ${String(r.busy).padStart(4)} ms/s busy  ${String(r.script).padStart(4)} ms/s script  ${r.state}  canvas ${r.canvases.join(' + ')}${r.extra ? '  ' + JSON.stringify(r.extra) : ''}${r.pos ? '  at ' + r.pos : ''}${r.back ? '  shown again: ' + JSON.stringify(r.back) : ''}${r.speed != null ? '  speed ' + r.speed + (r.siren ? ' siren' : '') : ''}${r.errors.length ? '  ERRORS ' + r.errors.join(' | ') : ''}`); }
    catch (e) { console.log(`${n}: failed: ${e.message.split('\n')[0]}`); }
  }
} finally { await browser.close(); }
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ label: process.env.LABEL || '', settings: SETTINGS, at: new Date().toISOString(), results: out }, null, 1));
