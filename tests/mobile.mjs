// Touch checks on emulated phones. Input goes only through touch: page.touchscreen.tap for taps and CDP
// Input.dispatchTouchEvent for drags and pinches (plus the keyboard for the desktop keys-once check). page.evaluate
// only reads state: the game's own hooks (VH.UI.lastMenu, lastRects, mapClose, hudRects, VH.Input.buttons) say where
// things are, and ?check=layout makes the HUD log every text and panel it drew in the last frame (window.__layout).
//
//   cd game && python3 -m http.server 4433 &
//   node tests/mobile.mjs                 # every check on every phone
//   node tests/mobile.mjs tap-once map    # just those checks
//   SHOTS=/tmp/m node tests/mobile.mjs    # with a screenshot per step
// Needs Playwright (npm i -D playwright, or NODE_PATH pointing at an install). BASE=http://... to point elsewhere.
// Headless Chromium draws at about 120 frames a second, so frames without a simulation step happen all the time:
// that's what makes a single tap fire twice when input isn't cleared per frame.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4433/index.html';
const SHOTS = process.env.SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PHONES = [
  { id: 'iphone-port', dev: 'iPhone 13' },
  { id: 'iphone-land', dev: 'iPhone 13', land: true },
  { id: 'iphone-notch', dev: 'iPhone 13', land: true, inset: '47,0,47,21' }, // a notched phone on its side (simulated safe area)
  { id: 'pixel-port', dev: 'Pixel 7' },
  { id: 'pixel-land', dev: 'Pixel 7', land: true },
  { id: 'se-port', dev: 'iPhone SE' }, // a small phone
  { id: 'se-land', dev: 'iPhone SE', land: true }, // a small phone on its side: the short layout
];
const MIN_TARGET = 44; // CSS px: the smallest comfortable touch target

let browser;
async function phone(ph, query = '') {
  const d = devices[ph.dev]; const vp = ph.land ? { width: d.viewport.height, height: d.viewport.width } : d.viewport;
  const ctx = await browser.newContext({ ...d, viewport: vp, screen: vp });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const q = 'check=layout' + (ph.inset ? '&inset=' + ph.inset : '') + (query ? '&' + query : '');
  await page.goto(BASE + '?' + q); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(600);
  const cdp = await ctx.newCDPSession(page);
  const ev = (f, a) => page.evaluate(f, a);
  // art pixels (the HUD buffer) to CSS pixels
  const css = r => ev(r => { const c = document.getElementById('game'), b = c.getBoundingClientRect(), k = b.width / c.width, I = VH.Input; return { x: b.left + (r.x * I.scale + I.offX) * k, y: b.top + (r.y * I.scale + I.offY) * k, w: r.w * I.scale * k, h: r.h * I.scale * k }; }, r);
  const centre = async r => { const c = await css(r); return [c.x + c.w / 2, c.y + c.h / 2]; };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const s = {
    ctx, page, errors, ev, css, vp,
    tag: ph.id,
    state: () => ev(() => VH.Game.state),
    layout: () => ev(() => window.__layout),
    tap: async (x, y, wait = 350) => { await page.touchscreen.tap(x, y); await sleep(wait); },
    tapRect: async (r, wait = 350) => { const [x, y] = await centre(r); await page.touchscreen.tap(x, y); await sleep(wait); },
    // a real finger's tap: down, a tenth of a second, up (the release lands a few frames after the press)
    slowTap: async (r, ms = 120) => { const [x, y] = await centre(r); await touch('touchStart', [{ x, y, id: 1 }]); await sleep(ms); await touch('touchEnd', []); await sleep(350); },
    button: id => ev(id => { const b = VH.Input.buttons.find(b => b.id === id); return b ? { ...b } : null; }, id),
    drag: async (x, y, dx, dy, steps = 8, during) => { await touch('touchStart', [{ x, y, id: 1 }]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: x + dx * i / steps, y: y + dy * i / steps, id: 1 }]); await sleep(25); } await sleep(80); if (during) await during(); await touch('touchEnd', []); await sleep(300); },
    pinch: async (x, y, d0, d1, steps = 8) => { const pts = d => [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }]; await touch('touchStart', pts(d0)); for (let i = 1; i <= steps; i++) { await touch('touchMove', pts(d0 + (d1 - d0) * i / steps)); await sleep(25); } await sleep(80); await touch('touchEnd', []); await sleep(300); },
    touch,
    // hold the stick: a finger down on the left half, pushed `frac` of the stick's radius in direction (dx, dy)
    stickDown: async (frac, dx = 0, dy = -1, x0 = vp.width * 0.25, y0 = vp.height * 0.62) => {
      const R = await ev(() => { const c = document.getElementById('game'); return VH.Input.stickR * VH.Input.scale * c.getBoundingClientRect().width / c.width; });
      await touch('touchStart', [{ x: x0, y: y0, id: 1 }]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: x0 + dx * R * frac * i / 6, y: y0 + dy * R * frac * i / 6, id: 1 }]); await sleep(30); }
      return { x: x0 + dx * R * frac, y: y0 + dy * R * frac };
    },
    shot: async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ph.id}_${name}.png` }); },
    close: async () => { check(`${ph.id}: no console errors`, !errors.length, errors[0]); await ctx.close(); },
  };
  return s;
}
// play straight into a night with the menus skipped (?play=), at night, with the first-time tips showing
const play = (ph, char = 'schoolie', extra = '') => phone(ph, `play=${char}&night=1&hour=21${extra ? '&' + extra : ''}`);

let fails = 0; const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail }); if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); }
const inside = (t, W) => t.x >= 0 && t.x + t.w <= W;
const overlap = (a, b, m = 0) => a.x < b.x + b.w - m && b.x < a.x + a.w - m && a.y < b.y + b.h - m && b.y < a.y + a.h - m;
const offEdge = L => L.text.filter(t => !inside(t, L.W)).map(t => `"${t.s}" ${Math.round(t.x)}..${Math.round(t.x + t.w)}/${L.W}`);

// ---------- the checks ----------
const CHECKS = {
  // one tap fires once: the title's SOUND toggles once; a tap on another character card selects it (and doesn't start it)
  async 'tap-once'(ph) {
    const s = await phone(ph); const T = s.tag + ' tap-once';
    try {
      const menu = await s.ev(() => VH.UI.lastMenu);
      await s.tapRect(menu.rects[menu.items.indexOf('SETTINGS')]); const sm = await s.ev(() => VH.UI.lastMenu);
      const si = sm.items.findIndex(i => i.startsWith('SOUND')); const m0 = await s.ev(() => SFX.isMuted());
      await s.tapRect(sm.rects[si]); const m1 = await s.ev(() => SFX.isMuted());
      check(T + ': SETTINGS > SOUND toggles once', (await s.state()) === 'settings' && m1 !== m0, `${await s.state()}, muted ${m0} -> ${m1}`);
      const sm2 = await s.ev(() => VH.UI.lastMenu); await s.tapRect(sm2.rects[sm2.items.indexOf('BACK')]);
      const menu2 = await s.ev(() => VH.UI.lastMenu); const pi = menu2.items.findIndex(i => i === 'NEW GAME' || i === 'PLAY');
      await s.tapRect(menu2.rects[pi]); await s.shot('title-tapped');
      check(T + ': title NEW GAME opens the character select', (await s.state()) === 'select', await s.state());
      await sleep(300);
      const sel0 = await s.ev(() => VH.UI.selIdx), rects = await s.ev(() => VH.UI.lastRects); const want = (sel0 + 1) % 3;
      await s.tapRect(rects[want]); await s.shot('select-card');
      const st = await s.state(), sel1 = await s.ev(() => VH.UI.selIdx);
      check(T + ': a tap on another card selects it', st === 'select' && sel1 === want, `state ${st}, selIdx ${sel0} -> ${sel1}, wanted ${want}`);
      if (st === 'select') { await s.tapRect(rects[want]); check(T + ': a second tap on it opens the week', (await s.state()) === 'week', await s.state()); }
      // the week: night 1 is already picked, so one tap plays it; its brief (with the night's header) has to fit
      if ((await s.state()) === 'week') {
        await sleep(300); const wr = await s.ev(() => VH.UI.lastRects); await s.tapRect(wr[0], 900); const L = await s.layout(); await s.shot('night-brief');
        check(T + ': one tap on the picked night opens its brief', L.state === 'brief', L.state);
        const head = L.text.find(t => /^NIGHT 1:/.test(t.s));
        check(T + ': the night brief and its header fit', L.state === 'brief' && !!head && !offEdge(L).length && L.text.every(t => t.y >= 0 && t.y + t.h <= L.H) && L.panels.every(p => p.y >= 0 && p.y + p.h <= L.H + 2), (head ? '' : 'no header; ') + offEdge(L).join('; ') + ' ' + JSON.stringify(L.panels.filter(p => p.y < 0 || p.y + p.h > L.H + 2)));
      }
    } finally { await s.close(); }
  },
  // the keyboard is unchanged: one key press moves one step
  async 'keys-once'() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(600);
    const ev = f => page.evaluate(f); const T = 'desktop keys-once';
    try {
      await page.keyboard.press('ArrowDown'); await sleep(250); check(T + ': one Down moves the title menu one row', (await ev(() => VH.UI.menuIdx)) === 1, 'menuIdx ' + await ev(() => VH.UI.menuIdx));
      await page.keyboard.press('ArrowUp'); await sleep(250);
      const items = await ev(() => VH.UI.lastMenu.items); const gi = items.indexOf('SETTINGS');
      for (let i = 0; i < gi; i++) { await page.keyboard.press('ArrowDown'); await sleep(120); }
      await page.keyboard.press('Enter'); await sleep(250); const si = (await ev(() => VH.UI.lastMenu.items)).findIndex(i => i.startsWith('SOUND'));
      for (let i = 0; i < si; i++) { await page.keyboard.press('ArrowDown'); await sleep(120); }
      const m0 = await ev(() => SFX.isMuted()); await page.keyboard.press('Enter'); await sleep(250);
      check(T + ': Enter on SETTINGS > SOUND toggles once', (await ev(() => VH.Game.state)) === 'settings' && (await ev(() => SFX.isMuted())) !== m0);
      for (let i = 0; i < si; i++) { await page.keyboard.press('ArrowUp'); await sleep(120); }
      const g0 = await ev(() => VH.Settings.gfx); await page.keyboard.press('ArrowRight'); await sleep(250); const g1 = await ev(() => VH.Settings.gfx);
      await page.keyboard.press('ArrowLeft'); await sleep(250); const g2 = await ev(() => VH.Settings.gfx);
      check(T + ': Right and Left on GRAPHICS step it one each way', g1 !== g0 && g2 === g0, `${g0} -> ${g1} -> ${g2}`);
      await page.keyboard.press('Escape'); await sleep(250); check(T + ': Esc leaves SETTINGS for the title, on SETTINGS', (await ev(() => VH.Game.state)) === 'title' && (await ev(() => VH.UI.menuIdx)) === gi);
      for (let i = 0; i < gi; i++) { await page.keyboard.press('ArrowUp'); await sleep(120); }
      await page.keyboard.press('Enter'); await sleep(300); check(T + ': Enter on NEW GAME opens the select', (await ev(() => VH.Game.state)) === 'select');
      const s0 = await ev(() => VH.UI.selIdx); await page.keyboard.press('ArrowRight'); await sleep(250);
      check(T + ': one Right moves one card', (await ev(() => VH.UI.selIdx)) === (s0 + 1) % 3 && (await ev(() => VH.Game.state)) === 'select');
      await page.keyboard.press('Enter'); await sleep(300); check(T + ': Enter opens the week', (await ev(() => VH.Game.state)) === 'week');
      await page.keyboard.press('Enter'); await sleep(500); check(T + ': Enter on night 1 opens its brief', (await ev(() => VH.Game.state)) === 'brief', await ev(() => VH.Game.state));
      await sleep(900); await page.keyboard.press('Enter'); await sleep(400); check(T + ': Enter starts the job', (await ev(() => VH.Game.state)) === 'play');
      await page.keyboard.press('m'); await sleep(300); check(T + ': M opens the map', (await ev(() => VH.Game.state)) === 'map');
      await page.keyboard.press('m'); await sleep(300); check(T + ': M closes the map', (await ev(() => VH.Game.state)) === 'play');
      await page.keyboard.press('Escape'); await sleep(300); check(T + ': Esc pauses', (await ev(() => VH.Game.state)) === 'pause');
      // the pause menu draws seldom (nothing moves), but a key answers while it's still held down, not when it's let go
      await sleep(200); const i0 = await ev(() => VH.UI.menuIdx); await page.keyboard.down('ArrowDown'); await sleep(70); const i1 = await ev(() => VH.UI.menuIdx); await page.keyboard.up('ArrowDown'); await sleep(150);
      check(T + ': a still menu answers a key while it is held', i1 === i0 + 1, `menuIdx ${i0} -> ${i1} 70 ms after the key went down`);
      await page.keyboard.press('ArrowUp'); await sleep(200);
      await page.keyboard.press('Escape'); await sleep(300); check(T + ': Esc resumes', (await ev(() => VH.Game.state)) === 'play');
      check(T + ': no console errors', !errors.length, errors[0]);
    } finally { await ctx.close(); }
  },
  // the full map: pinch zooms, drag pans, neither closes it or drops a waypoint; a tap on CLOSE closes it
  async map(ph) {
    const s = await play(ph); const T = s.tag + ' map';
    try {
      const hud = await s.ev(() => VH.Input.buttons.map(b => ({ ...b }))); const at = async id => { const r = await s.css(hud.find(b => b.id === id)); return [r.x + r.w / 2, r.y + r.h / 2]; };
      await s.tapRect(await s.button('map')); check(T + ': MAP opens the map', (await s.state()) === 'map', await s.state());
      const { width: W, height: H } = s.vp;
      // fingers where the HUD's MAP and PAUSE buttons were: a drag from one, a pinch with a finger on the other
      { const [x, y] = await at('pause'); await s.drag(x, y, -90, 60); check(T + ': a drag from where PAUSE was keeps it open', (await s.state()) === 'map', await s.state()); }
      if ((await s.state()) === 'map') { const [x, y] = await at('map'); await s.pinch(x - 60, y + 40, 120, 150); check(T + ': a pinch with a finger where MAP was keeps it open', (await s.state()) === 'map', await s.state()); }
      if ((await s.state()) !== 'map') await s.tapRect(await s.button('map'));
      await s.pinch(W / 2, H / 2, 60, 220); await s.shot('map-pinched');
      const z1 = await s.ev(() => VH.UI.mapZ.z), st1 = await s.state();
      check(T + ': pinch zooms and the map stays open', st1 === 'map' && z1 > 1, `state ${st1}, zoom ${z1}`);
      // a pinch where the HUD's buttons were (bottom right), and one across the whole screen
      if ((await s.state()) === 'map') { await s.pinch(W * 0.75, H * 0.8, 40, 120); check(T + ': a pinch over the bottom right keeps it open', (await s.state()) === 'map', await s.state()); }
      if ((await s.state()) === 'map') { const c0 = await s.ev(() => [VH.UI.mapZ.cx, VH.UI.mapZ.cy]); await s.drag(W * 0.5, H * 0.55, -80, -60); const c1 = await s.ev(() => [VH.UI.mapZ.cx, VH.UI.mapZ.cy]);
        check(T + ': a drag pans and keeps it open', (await s.state()) === 'map' && Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 5, `state ${await s.state()}, moved ${Math.round(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]))}m`); }
      if ((await s.state()) === 'map') { const r = await s.css(await s.ev(() => VH.UI.mapClose)); await s.drag(r.x + r.w / 2, r.y + r.h / 2, -70, 50); check(T + ': a drag that starts on CLOSE keeps it open', (await s.state()) === 'map', await s.state()); }
      check(T + ': no waypoint from pinches or drags', !(await s.ev(() => VH.Game.waypoint)), JSON.stringify(await s.ev(() => VH.Game.waypoint)));
      if ((await s.state()) === 'map') { await s.tapRect(await s.ev(() => VH.UI.mapClose)); check(T + ': a tap on CLOSE closes it', (await s.state()) === 'play', await s.state()); }
    } finally { await s.close(); }
  },
  // text fits: the HUD with a tip showing, the map legend and hint, the brief, the button labels
  async text(ph) {
    const s = await play(ph); const T = s.tag + ' text';
    try {
      await sleep(400); let L = await s.layout(); await s.shot('hud');
      const tip = L.text.find(t => t.s === 'TIP'), short = await s.ev(() => VH.UI.short); // (short screens have no room for tips)
      check(T + ': HUD text (with a tip showing) stays on screen', (!!tip || short) && !offEdge(L).length, (tip || short ? '' : 'no tip showing; ') + offEdge(L).slice(0, 4).join('; '));
      // button labels inside their circles (and on foot: KICK, SHOUT, BOOST, GET IN)
      const btnText = async (what) => { const L = await s.layout(), B = await s.ev(() => VH.Input.buttons.map(b => ({ ...b })));
        const bad = []; for (const b of B.filter(b => b.round)) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.w / 2;
          for (const t of L.text.filter(t => Math.abs(t.x + t.w / 2 - cx) < r && Math.abs(t.y + t.h / 2 - cy) < r)) { const far = Math.max(...[[t.x, t.y], [t.x + t.w, t.y], [t.x, t.y + t.h], [t.x + t.w, t.y + t.h]].map(([x, y]) => Math.hypot(x - cx, y - cy))); if (far > r) bad.push(t.s); } }
        check(T + `: button labels inside their circles (${what})`, B.some(b => b.round) && !bad.length, B.some(b => b.round) ? bad.join(', ') : 'no round buttons flagged'); };
      await btnText('on foot');
      await s.tapRect(await s.button('job')); await sleep(900); L = await s.layout(); await s.shot('brief');
      check(T + ': the job brief fits', L.state === 'brief' && !offEdge(L).length && L.text.every(t => t.y >= 0 && t.y + t.h <= L.H) && L.panels.every(p => p.y >= 0 && p.y + p.h <= L.H + 2), L.state + ' ' + offEdge(L).join('; '));
      await s.tap(s.vp.width / 2, s.vp.height / 2, 500);
      await s.tapRect(await s.button('map')); await sleep(300); L = await s.layout(); await s.shot('map');
      const keyWords = new Set(L.text.filter(t => t.y > L.H * 0.6).map(t => t.s));
      const legend = L.text.filter(t => ['JOB', 'YOUR CAR', 'WAYPOINT', 'RESPRAY', 'TYRES', 'SHOP', 'MAYHEM MINUTE', 'RAMP', 'RACES', 'HELIPAD'].includes(t.s) && t.y > L.H * 0.5);
      const hint = L.text.filter(t => /PINCH|OPENSTREETMAP/.test(t.s));
      const clash = legend.filter(a => hint.some(b => overlap(a, b)));
      check(T + ': map legend on screen and clear of the hint lines', legend.length >= 8 && legend.every(t => inside(t, L.W)) && !clash.length && hint.every(t => inside(t, L.W)), `${legend.length} legend items; off: ${legend.filter(t => !inside(t, L.W)).map(t => t.s).join(',')}; clash: ${clash.map(t => t.s).join(',')}; ${[...keyWords].length}`);
      await s.tapRect(await s.ev(() => VH.UI.mapClose));
      await s.close();
      // in a police car (Kev starts in his)
      const k = await play(ph, 'cop'); await sleep(400);
      try {
        const L2 = await k.layout(), B = await k.ev(() => VH.Input.buttons.map(b => ({ ...b }))); await k.shot('kev-car');
        const bad = []; for (const b of B.filter(b => b.round)) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.w / 2;
          for (const t of L2.text.filter(t => Math.abs(t.x + t.w / 2 - cx) < r && Math.abs(t.y + t.h / 2 - cy) < r)) { const far = Math.max(...[[t.x, t.y], [t.x + t.w, t.y], [t.x, t.y + t.h], [t.x + t.w, t.y + t.h]].map(([x, y]) => Math.hypot(x - cx, y - cy))); if (far > r) bad.push(t.s); } }
        check(T + ': button labels inside their circles (Kev in his car)', B.some(b => b.round) && !bad.length, bad.join(', '));
        check(T + ': HUD text stays on screen (Kev in his car)', !offEdge(L2).length, offEdge(L2).slice(0, 4).join('; '));
      } finally { await k.close(); }
    } catch (e) { await s.close().catch(() => {}); throw e; }
  },
  // the "?" overlay and the pause menu's CONTROLS page: a drag scrolls, a tap closes
  async scroll(ph) {
    const s = await play(ph); const T = s.tag + ' scroll';
    try {
      const { width: W, height: H } = s.vp;
      await s.tapRect(await s.button('help')); check(T + ': ? opens the overlay', await s.ev(() => !!VH.Game.helpOpen));
      const y0 = await s.ev(() => VH.UI.helpOvScroll || 0); let stickMid = null; await s.drag(W * 0.3, H * 0.7, 0, -H * 0.4, 8, async () => { stickMid = await s.ev(() => VH.Input.stick.active); }); await s.shot('help-dragged');
      const y1 = await s.ev(() => VH.UI.helpOvScroll || 0), open1 = await s.ev(() => !!VH.Game.helpOpen);
      check(T + ': a drag scrolls the ? overlay and leaves it open', open1 && y1 > y0, `open ${open1}, scroll ${y0} -> ${y1}`);
      check(T + ': a drag on the overlay (left half) doesn\'t work the stick', stickMid === false, 'stick active mid-drag: ' + stickMid);
      if (open1) { await s.tap(W * 0.5, H * 0.5); check(T + ': a tap closes the ? overlay', await s.ev(() => !VH.Game.helpOpen)); }
      await s.tapRect(await s.button('pause')); check(T + ': PAUSE pauses', (await s.state()) === 'pause', await s.state());
      const m = await s.ev(() => VH.UI.lastMenu); await s.slowTap(m.rects[m.items.indexOf('CONTROLS')]); check(T + ': a finger\'s tap on CONTROLS opens the controls page (and its release doesn\'t close it)', (await s.state()) === 'help', await s.state());
      if ((await s.state()) === 'help') {
        const c0 = await s.ev(() => VH.UI.helpScroll || 0); await s.drag(W * 0.5, H * 0.75, 0, -H * 0.45); await s.shot('controls-dragged');
        const c1 = await s.ev(() => VH.UI.helpScroll || 0), st = await s.state();
        check(T + ': a drag scrolls the controls page and leaves it open', st === 'help' && c1 > c0, `state ${st}, scroll ${c0} -> ${c1}`);
        if (st === 'help') { await s.tap(W * 0.5, H * 0.5); check(T + ': a tap goes back to the pause menu', (await s.state()) === 'pause', await s.state()); }
      }
    } finally { await s.close(); }
  },
  // touch layout: targets of 44 CSS px or more, nothing overlapping, pause rows that a tap can't miss
  async layout(ph) {
    const T = ph.id + ' layout';
    for (const [char, what] of [['schoolie', 'on foot'], ['cop', 'Kev in his car']]) {
      const s = await play(ph, char); await sleep(400);
      try {
        const B = await s.ev(() => VH.Input.buttons.map(b => ({ ...b }))); const cs = await Promise.all(B.map(b => s.css(b)));
        const small = B.filter((b, i) => cs[i].w < MIN_TARGET - 0.5 || cs[i].h < MIN_TARGET - 0.5).map(b => `${b.id} ${Math.round(cs[B.indexOf(b)].w)}x${Math.round(cs[B.indexOf(b)].h)}`);
        check(`${T}: touch buttons at least ${MIN_TARGET} CSS px (${what})`, B.length > 4 && !small.length, small.join(', '));
        const clash = []; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j];
          const hit = a.round && b.round ? Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) < (a.w + b.w) / 2 : overlap(a, b); if (hit) clash.push(a.id + '/' + b.id); }
        check(`${T}: touch buttons don't overlap (${what})`, !clash.length, clash.join(', '));
        const L = await s.layout(), hr = await s.ev(() => VH.UI.hudRects); await s.shot('layout-' + char);
        const vsHud = []; for (const b of B) for (const [k, r] of Object.entries(hr)) if (r && overlap(b, r)) vsHud.push(b.id + '/' + k);
        check(`${T}: touch buttons clear of the HUD panels (${what})`, !vsHud.length, vsHud.join(', '));
        if (hr.street) check(`${T}: street name clear of the top-left panel (${what})`, !overlap(hr.street, hr.left), JSON.stringify(hr.street));
        if (hr.speedo) check(`${T}: speed panel clear of the minimap and buttons (${what})`, !overlap(hr.speedo, hr.minimap) && !B.some(b => overlap(b, hr.speedo)), JSON.stringify(hr.speedo));
        const io = await s.ev(() => VH.UI.inset); check(`${T}: HUD inside the safe area (${what})`, !ph.inset || io.l > 0 && L.text.every(t => t.x >= 0), JSON.stringify(io));
        if (char === 'schoolie') {
          await s.tapRect(await s.button('pause')); await sleep(200); const m = await s.ev(() => VH.UI.lastMenu); const rc = await Promise.all(m.rects.map(r => s.css(r))); await s.shot('pause');
          const lowRow = rc.map((r, i) => [m.items[i], r.h]).filter(([, h]) => h < MIN_TARGET - 0.5);
          const ov = []; for (let i = 0; i < rc.length; i++) for (let j = i + 1; j < rc.length; j++) if (overlap(rc[i], rc[j], 0.5)) ov.push(m.items[i] + '/' + m.items[j]);
          check(`${T}: pause rows at least ${MIN_TARGET} CSS px apart and not overlapping`, !lowRow.length && !ov.length, `low: ${lowRow.map(([i, h]) => i + ' ' + Math.round(h)).join(', ')}; overlap: ${ov.join(', ')}`);
          check(`${T}: pause rows on screen`, rc.every(r => r.y >= 0 && r.y + r.h <= s.vp.height + 1 && r.x >= 0 && r.x + r.w <= s.vp.width + 1), rc.map(r => Math.round(r.x) + ',' + Math.round(r.y) + '+' + Math.round(r.h)).join(' '));
          const L = await s.layout(); check(`${T}: pause text on screen and inside its rows`, !offEdge(L).length && L.text.every(t => t.y >= 0 && t.y + t.h <= L.H), offEdge(L).join('; '));
          // tap the middle of each harmless row (WALKING toggles the walking style) and check it took
          const wi = m.items.findIndex(i => i.startsWith('WALKING')); const w0 = await s.ev(() => VH.Game.walkMode); await s.tapRect(m.rects[wi]);
          check(`${T}: a tap on WALKING toggles the walking style once`, (await s.ev(() => VH.Game.walkMode)) !== w0);
        }
      } finally { await s.close(); }
    }
  },
  // help on a touch device names the touch buttons, not keys or "thumb"
  // full-screen backdrops (the title's gradient, the pause dim, the map) reach the screen edges, even where the HUD is
  // inset (a notch, or the margin a framed build keeps): the band outside the inset is as dim as just inside it
  async backdrop(ph) {
    if (ph.id !== 'iphone-port' && ph.id !== 'iphone-notch') return; // one framed phone, one with a notch
    const extra = ph.id === 'iphone-port' ? 'framed' : '';
    const ratio = s => s.ev(() => {
      // the picture is the layer canvases under #game, each enlarged by the browser: put them together as the screen shows them
      const c = document.getElementById('game'), io = VH.UI.inset, k = c.width / innerWidth; const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const x = cc.getContext('2d'); x.imageSmoothingEnabled = false;
      for (const l of document.querySelectorAll('canvas.layer')) x.drawImage(l, parseFloat(l.style.left) * k, parseFloat(l.style.top) * k, parseFloat(l.style.width) * k, parseFloat(l.style.height) * k);
      const lum = (px, py) => { const d = x.getImageData(px, py, 1, 1).data; return 0.3 * d[0] + 0.59 * d[1] + 0.11 * d[2] + 1; };
      const edge = io.l > 4 ? 'l' : 't'; const out = [], inn = [];
      // pairs of pixels 3 px either side of the inset line: the world under them is all but the same, so any step in
      // brightness is a backdrop that stops at the inset (sampled away from the middle, where menus and text sit)
      for (let k = 0; k < 24; k++) { const f = k < 12 ? 0.03 + k * 0.012 : 0.83 + (k - 12) * 0.012;
        if (edge === 'l') { const y = Math.round(c.height * f); out.push(lum(io.l - 3, y)); inn.push(lum(io.l + 3, y)); }
        else { const xx = Math.round(c.width * f); out.push(lum(xx, io.t - 3)); inn.push(lum(xx, io.t + 3)); }
      }
      const med = a => a.sort((p, q) => p - q)[a.length >> 1]; return { r: med(out.map((o, i) => o / inn[i])), edge, inset: io.l || io.t };
    });
    const T = ph.id + ' backdrop' + (extra ? ' (framed)' : ' (inset)');
    for (const scr of ['title', 'pause', 'map']) {
      const s = scr === 'title' ? await phone(ph, extra) : await play(ph, 'schoolie', extra);
      try {
        if (scr === 'pause') await s.tapRect(await s.button('pause')); if (scr === 'map') await s.tapRect(await s.button('map'));
        await sleep(300); const r = await ratio(s); await s.shot('backdrop-' + scr + (extra ? '-framed' : ''));
        check(`${T}: the ${scr} screen's dim reaches the screen edge`, (await s.state()) === scr && r.inset > 0 && r.r < 1.3, `${await s.state()}, edge/inside brightness ${r.r.toFixed(2)} (${r.edge} inset ${r.inset})`);
      } finally { await s.close(); }
    }
  },
  // run = push the stick further: half way walks (a jog), past about 70% runs; and a second finger on a thumb button
  // while the stick is held still presses it
  async run(ph) {
    const s = await play(ph); const T = s.tag + ' run';
    try {
      const sp = () => s.ev(() => Math.hypot(VH.Game.player.vx, VH.Game.player.vy));
      const peak = async () => { let m = 0; for (let i = 0; i < 8; i++) { await sleep(90); m = Math.max(m, await sp()); } return m; };
      await s.stickDown(0.5); const walk = await peak(); await s.shot('stick-half'); await s.touch('touchEnd', []); await sleep(500);
      const p = await s.stickDown(0.85); const run = await peak(); await s.shot('stick-run'); const lab = (await s.layout()).text.some(t => t.s === 'RUN');
      // a second finger on empty screen while walking (well after the first): no pinch, the stick keeps going
      await s.touch('touchStart', [{ x: p.x, y: p.y, id: 1 }, { x: s.vp.width * 0.6, y: s.vp.height * 0.35, id: 2 }]); await sleep(150);
      const mid = await s.ev(() => ({ stick: VH.Input.stick.active, pinch: !!VH.Input.pinch }));
      check(T + ': a stray second finger while walking doesn\'t start a pinch or drop the stick', mid.stick && !mid.pinch, JSON.stringify(mid));
      await s.touch('touchEnd', []);
      const J = await s.ev(() => VH.Game.JOG), S = await s.ev(() => VH.Game.SPRINT);
      check(T + ': half a push walks', walk > 2 && walk < J * 1.02, `${walk.toFixed(1)} m/s (jog ${J})`);
      check(T + ': a push past 70% runs', run > J * 1.15, `${run.toFixed(1)} m/s (sprint ${S})`);
      check(T + ': RUN shows under the stick while running', lab);
      const B = await s.ev(() => VH.Input.buttons.map(b => b.id)); check(T + ': no BOOST button on foot', !B.includes('run'), B.join(','));
    } finally { await s.close(); }
    const k = await play(ph, 'cop'); const K = ph.id + ' run (Kev in his car)';
    try {
      await sleep(300); const s0 = await k.ev(() => !!VH.Game.player.vehicle.siren); const p = await k.stickDown(0.9);
      const b = await k.button('horn'); const c = await k.css(b);
      await k.touch('touchStart', [{ x: p.x, y: p.y, id: 1 }, { x: c.x + c.w / 2, y: c.y + c.h / 2, id: 2 }]); await sleep(150);
      await k.touch('touchMove', [{ x: p.x, y: p.y, id: 1 }]); await sleep(300); // (finger 2 lifts: it's left out of the touch list)
      const s1 = await k.ev(() => !!VH.Game.player.vehicle.siren), held = await k.ev(() => VH.Input.stick.active);
      check(K + ': a second finger on SIREN while steering switches the siren', s1 !== s0, `siren ${s0} -> ${s1}`);
      check(K + ': and the stick stays held', held);
      // and SIREN stays in its place after it's switched (a thumb tapping the same spot switches it back)
      const before = await k.ev(() => VH.Input.buttons.find(b => b.id === 'horn')); const c2 = await k.css(before);
      await k.touch('touchStart', [{ x: p.x, y: p.y, id: 1 }, { x: c2.x + c2.w / 2, y: c2.y + c2.h / 2, id: 2 }]); await sleep(120); await k.touch('touchMove', [{ x: p.x, y: p.y, id: 1 }]); await sleep(300);
      const after = await k.ev(() => VH.Input.buttons.find(b => b.id === 'horn'));
      check(K + ': SIREN keeps its place when it switches', !!after && after.x === before.x && after.y === before.y, JSON.stringify([before && [before.x, before.y], after && [after.x, after.y]]));
      await k.touch('touchEnd', []);
    } finally { await k.close(); }
  },
  // no accidental pauses: swipes from the edges and across the screen, the stick dragged anywhere, every thumb button,
  // and the window losing focus (a notification, the control centre) never pause; only the PAUSE button does
  async 'no-pause'(ph) {
    const s = await play(ph); const T = s.tag + ' no-pause'; const { width: W, height: H } = s.vp;
    try {
      const old = [[W * 0.85, H * 0.25], [W * 0.75, H * 0.3], [W * 0.9, H * 0.85], [W * 0.7, H * 0.9]]; // where MAP / PAUSE / JOB / ? and the cluster sat
      for (const [x, y] of old) await s.drag(x, y, -W * 0.3, H * 0.1);
      for (const [x, y, dx, dy] of [[W - 3, H * 0.5, -W * 0.4, 0], [3, H * 0.5, W * 0.4, 0], [W * 0.5, 3, 0, H * 0.4], [W * 0.8, 3, 0, H * 0.3], [W * 0.5, H - 3, 0, -H * 0.3]]) await s.drag(x, y, dx, dy); // edge swipes
      check(T + ': drags and edge swipes never pause', (await s.state()) === 'play', await s.state());
      await s.stickDown(1, 1, -1); await s.touch('touchMove', [{ x: W * 0.9, y: H * 0.1, id: 1 }]); await sleep(200); await s.touch('touchMove', [{ x: W * 0.95, y: H * 0.05, id: 1 }]); await sleep(200); await s.touch('touchEnd', []); await sleep(300);
      check(T + ': the stick dragged up to the top right never pauses', (await s.state()) === 'play', await s.state());
      // taps along the edges (the OS gesture zones) press nothing
      const hits = []; for (let i = 1; i < 10; i++) for (const [x, y] of [[W * i / 10, 4], [W * i / 10, H - 4], [4, H * i / 10], [W - 4, H * i / 10]]) { await s.page.touchscreen.tap(x, y); await sleep(40); if ((await s.state()) !== 'play') { hits.push(`${Math.round(x)},${Math.round(y)}:${await s.state()}`); break; } }
      check(T + ': taps in the edge zones press nothing', !hits.length, hits.join(' '));
      await s.touch('touchStart', [{ x: 4, y: H * 0.6, id: 1 }]); await s.touch('touchMove', [{ x: 40, y: H * 0.5, id: 1 }]); await sleep(150);
      check(T + ': a touch from the left edge still drives the stick', await s.ev(() => VH.Input.stick.active)); await s.touch('touchEnd', []); await sleep(200);
      for (const b of await s.ev(() => VH.Input.buttons.filter(b => b.round).map(b => ({ ...b })))) { await s.tapRect(b, 250); if ((await s.state()) !== 'play') { check(T + ': thumb button ' + b.id + ' doesn\'t pause', false, await s.state()); break; } }
      check(T + ': no thumb button pauses', (await s.state()) === 'play', await s.state());
      await s.ev(() => { window.dispatchEvent(new Event('blur')); return 1; }); await sleep(300); // (the one scripted event: the OS taking focus away)
      check(T + ': losing focus (blur) doesn\'t pause', (await s.state()) === 'play', await s.state());
      await s.tapRect(await s.button('pause')); check(T + ': the PAUSE button pauses', (await s.state()) === 'pause', await s.state());
      const pr = await s.ev(() => VH.UI.stripRects && { ...VH.UI.stripRects.pause }); const pb = pr && await s.css(pr);
      check(T + ': PAUSE is up in the top strip, away from the thumbs', !!pb && pb.y + pb.h < H * 0.25 && pb.w >= MIN_TARGET - 0.5 && pb.h >= MIN_TARGET - 0.5, JSON.stringify(pb));
    } finally { await s.close(); }
  },
  // a closer camera on phones: about 45-55 m across the short side on foot, about 80 m driving fast; pinch is remembered
  async camera(ph) {
    const s = await play(ph); const T = s.tag + ' camera';
    try {
      await sleep(1500); const m = await s.ev(() => { const c = document.getElementById('game'); return Math.min(c.width, c.height) / (VH.Game.view.k * VH.Input.scale) / VH.MapRender.S; });
      check(T + ': on foot, 45-55 m across the short side', m >= 45 && m <= 56, m.toFixed(1) + ' m');
      const far = await s.ev(() => VH.Game.camMetres && VH.Game.camMetres.fast); check(T + ': driving fast, about 80 m', far >= 68 && far <= 95, String(far && far.toFixed(1)));
      const { width: W, height: H } = s.vp; await s.pinch(W * 0.6, H * 0.45, 40, 200); const z = await s.ev(() => VH.Game.zoomOff);
      await s.page.reload(); await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(500);
      check(T + ': pinch zooms the world and is remembered', z !== 0 && (await s.ev(() => VH.Game.zoomOff)) === z, `zoomOff ${z} after pinch, ${await s.ev(() => VH.Game.zoomOff)} after reload`);
      const L = await s.layout(); check(T + ': compact HUD: no "NOBODY SAW A THING" line on a phone', !L.text.some(t => t.s === 'NOBODY SAW A THING'));
    } finally { await s.close(); }
  },
  // at most three action buttons, chosen by context; ACT says what it will do; the rest sit in a "..." fan
  async buttons(ph) {
    const T = ph.id + ' buttons';
    for (const [char, what, extra] of [['schoolie', 'Jaz on foot', ''], ['cop', 'Kev in his car', ''], ['grump', 'Merv on his gopher', ''], ['cop', 'Kev in a chase', 'night=2&job=1&at=4740,2790']]) {
      const s = await phone(ph, `play=${char}&hour=21&` + (extra || 'night=1')); await sleep(500);
      try {
        const B = await s.ev(() => VH.Input.buttons.filter(b => b.round && b.id !== 'more').map(b => ({ ...b }))); await s.shot('buttons-' + what.replace(/ /g, '-'));
        check(`${T}: at most 3 action buttons (${what})`, B.length >= 1 && B.length <= 3, B.map(b => b.label || b.id).join(', '));
        const act = B.find(b => b.act); check(`${T}: one big ACT button that says what it does (${what})`, !!act && !!act.label && act.w >= Math.max(...B.map(b => b.w)), act ? act.label : 'none');
        if (char === 'schoolie') check(`${T}: on foot with nothing else to do, ACT kicks (${what})`, !!act && act.id === 'kick' && act.label === 'KICK', act && act.id + ' ' + act.label);
        if (what === 'Kev in a chase') check(`${T}: SPIKES or BACKUP in reach during a chase`, B.some(b => b.id === 'spikes' || b.id === 'backup'), B.map(b => b.id).join(','));
        if (what === 'Kev in his car') {
          const more = await s.button('more'); check(`${T}: a "..." button holds the rest (${what})`, !!more);
          if (more) { await s.tapRect(more); const F = await s.ev(() => VH.Input.buttons.filter(b => b.fan).map(b => ({ ...b }))); check(`${T}: "..." opens the rest (${what})`, F.length >= 1, F.map(b => b.label).join(', '));
            const sp = F.find(b => b.id === 'spikes'); check(`${T}: SPIKES waits in the fan (${what})`, !!sp); if (sp) { const n0 = await s.ev(() => VH.Police.spikesLeft); await s.tapRect(sp); check(`${T}: a fan item works and the fan closes (${what})`, (await s.ev(() => VH.Police.spikesLeft)) === n0 - 1 && !(await s.ev(() => VH.Input.buttons.some(b => b.fan))), `spikes ${n0} -> ${await s.ev(() => VH.Police.spikesLeft)}`); } }
        }
        check(`${T}: context actions are a registry (${what})`, await s.ev(() => Array.isArray(VH.UI.contextActions) && VH.UI.contextActions.length > 0 && VH.UI.contextActions.every(f => typeof f === 'function')));
      } finally { await s.close(); }
    }
    // Kev in his car: ACT says GET OUT; out beside it, ACT says GET IN and gets back in
    const s = await play(ph, 'cop'); try {
      await sleep(400); let act = await s.ev(() => ({ ...VH.Input.buttons.find(b => b.act) })); check(T + ': in a car, ACT says GET OUT', act.label === 'GET OUT', act.label);
      await s.tapRect(act, 700); act = await s.ev(() => ({ ...VH.Input.buttons.find(b => b.act) }));
      check(T + ': out beside it, ACT says GET IN', (await s.ev(() => VH.Game.player.onFoot)) && act.label === 'GET IN', act.label);
      await s.tapRect(act, 700); check(T + ': and gets in', await s.ev(() => !VH.Game.player.onFoot));
    } finally { await s.close(); }
  },
  // Round B: a minigame on screen (hoops on a court). ACT offers the court, then PICK in the menu, then SHOOT; never more
  // than three action buttons; the left-hand panels (with the game's own) stay clear of the buttons and the screen edge
  async minigame(ph) {
    const T = ph.id + ' minigame';
    const s = await phone(ph, 'play=roam&hour=21&at=4935,2300'); await sleep(500);
    try {
      const round = () => s.ev(() => VH.Input.buttons.filter(b => b.round && b.id !== 'more').map(b => ({ ...b })));
      let B = await round(), act = B.find(b => b.act); check(`${T}: on the court, ACT offers the hoops`, !!act && act.label === 'HOOPS', act && act.label);
      if (act) await s.tapRect(act, 500);
      B = await round(); act = B.find(b => b.act); check(`${T}: the court menu: ACT picks`, (await s.ev(() => !!VH.Sports.menu)) && !!act && act.label === 'PICK', act && act.label);
      if (act) await s.tapRect(act, 600);
      check(`${T}: the hoops game starts`, await s.ev(() => !!VH.Sports.mini && VH.Sports.mini.kind === 'hoops'));
      B = await round(); act = B.find(b => b.act); await s.shot('minigame-hoops');
      check(`${T}: at most 3 action buttons in the game`, B.length >= 1 && B.length <= 3, B.map(b => b.label || b.id).join(', '));
      check(`${T}: the big button shoots`, !!act && act.label === 'SHOOT', act && act.label);
      const L = await s.layout(); const hr = await s.ev(() => VH.UI.hudRects && VH.UI.hudRects.left);
      check(`${T}: no text off the edge`, !offEdge(L).length, offEdge(L).slice(0, 3).join(' | '));
      check(`${T}: the left-hand panels clear of the buttons`, !!hr && !B.some(b => overlap(hr, b)), B.filter(b => hr && overlap(hr, b)).map(b => b.label).join(','));
    } finally { await s.close(); }
  },
  // SETTINGS, from the title and the pause menu: fits the phone (no text off the edge, rows a thumb can hit, nothing
  // overlapping), a tap changes a row, the choice is saved, SHOW FPS shows the counter, BACK goes back where it came from
  async settings(ph) {
    const T = ph.id + ' settings';
    let s = await phone(ph);
    try {
      const menu = await s.ev(() => VH.UI.lastMenu); check(T + ': the title has SETTINGS', menu.items.includes('SETTINGS'), menu.items.join(','));
      await s.tapRect(menu.rects[menu.items.indexOf('SETTINGS')]); await s.shot('settings');
      const L = await s.layout(); const m = await s.ev(() => VH.UI.lastMenu);
      check(T + ': a tap on SETTINGS opens it', L.state === 'settings', L.state);
      check(T + ': every option is there', ['GRAPHICS', 'FRAME RATE', 'BATTERY SAVER', 'SOUND', 'MUSIC', 'SHOW FPS', 'SCREEN SHAKE', 'BACK'].every(k => m.items.some(i => i.startsWith(k))), m.items.join(','));
      check(T + ': no text off the edge', !offEdge(L).length, offEdge(L).slice(0, 3).join(' | '));
      const rc = await Promise.all(m.rects.map(r => s.css(r)));
      check(T + ': every row is a comfortable target', rc.every(r => r.h >= MIN_TARGET - 1), rc.map(r => Math.round(r.h)).join(','));
      check(T + ': no rows overlap', !m.rects.some((a, i) => m.rects.some((b, j) => j > i && overlap(a, b, 1))));
      const rows = L.text.filter(t => m.items.some(i => i === t.s)); const others = L.text.filter(t => !rows.includes(t) && t.y > Math.min(...m.rects.map(r => r.y)));
      check(T + ': the note and hint clear the rows', !others.some(t => m.rects.some(r => overlap(t, r, 1))), others.filter(t => m.rects.some(r => overlap(t, r, 1))).map(t => t.s).slice(0, 2).join(' | '));
      const at = id => s.ev(id => { const m = VH.UI.lastMenu; return m.rects[m.items.findIndex(i => i.startsWith(id))]; }, id);
      await s.tapRect(await at('GRAPHICS')); const q = await s.ev(() => [VH.Settings.gfx, VH.Settings.level()]);
      check(T + ': a tap on GRAPHICS changes it (AUTO to LOW)', q[0] === 'low' && q[1] === 'low', q.join(' '));
      await s.tapRect(await at('FRAME RATE')); check(T + ': a tap on FRAME RATE changes it (60 to MAX)', (await s.ev(() => VH.Settings.fps)) === 0);
      await s.tapRect(await at('SHOW FPS')); check(T + ': SHOW FPS turns on', await s.ev(() => VH.Settings.showFps));
      await s.tapRect(await at('BACK')); check(T + ': BACK goes back to the title', (await s.state()) === 'title', await s.state());
      await s.page.reload(); await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(500);
      const kept = await s.ev(() => [VH.Settings.gfx, VH.Settings.fps, VH.Settings.showFps]);
      check(T + ': the choices are saved', kept[0] === 'low' && kept[1] === 0 && kept[2] === true, JSON.stringify(kept));
      const fps = (await s.layout()).text.find(t => /^FPS \d+$/.test(t.s)); check(T + ': the FPS counter shows, on the screen', !!fps && inside(fps, (await s.layout()).W), fps && fps.s);
    } finally { await s.close(); }
    s = await play(ph);
    try {
      await s.tapRect(await s.button('pause')); const m = await s.ev(() => VH.UI.lastMenu);
      check(T + ': the pause menu has SETTINGS', m.items.includes('SETTINGS'), m.items.join(','));
      await s.tapRect(m.rects[m.items.indexOf('SETTINGS')]); const L = await s.layout(); await s.shot('settings-pause');
      check(T + ': SETTINGS opens from the pause menu, and fits', L.state === 'settings' && !offEdge(L).length, L.state + ' ' + offEdge(L).slice(0, 2).join(' | '));
      const m2 = await s.ev(() => VH.UI.lastMenu); await s.tapRect(m2.rects[m2.items.indexOf('BACK')]);
      check(T + ': BACK goes back to the pause menu', (await s.state()) === 'pause', await s.state());
    } finally { await s.close(); }
  },
  async 'help-names'(ph) {
    for (const char of ['schoolie', 'cop']) await helpNames(ph, char);
  },
};
async function helpNames(ph, char) {
  {
    const s = await play(ph, char); const T = s.tag + ' help-names ' + char;
    const KEYISH = /\bTHUMB\b|\bSHIFT\b|\bSPACE\b|\bWASD\b|\bW \/ UP\b|\bESC\b|\bENTER\b|\bTAB\b|\bWHEEL\b|^(?:[HLBEXFJMNPT]|[HE] .*)$/; // (a key column that's one letter, or starts H or E; not S, which ends "2 S" lines)
    try {
      await s.tapRect(await s.button('help')); await sleep(200); let L = await s.layout();
      const ov = L.text.slice(L.text.findIndex(t => t.s === 'CONTROLS')); // the overlay is drawn last, over the HUD (whose minimap has letters)
      const bad1 = [...new Set(ov.filter(t => KEYISH.test(t.s)).map(t => t.s))];
      check(T + ': the ? overlay names touch controls', ov.length > 20 && !bad1.length, bad1.slice(0, 5).join(' | '));
      await s.tap(s.vp.width / 2, s.vp.height / 2); await s.tapRect(await s.button('pause'));
      const m = await s.ev(() => VH.UI.lastMenu); await s.tapRect(m.rects[m.items.indexOf('CONTROLS')]); L = await s.layout();
      const bad2 = [...new Set(L.text.filter(t => KEYISH.test(t.s)).map(t => t.s))];
      check(T + ': the CONTROLS page names touch controls', L.state === 'help' && !bad2.length, L.state + ' ' + bad2.slice(0, 5).join(' | '));
    } finally { await s.close(); }
  }
}

const args = process.argv.slice(2); const names = args.length ? args : Object.keys(CHECKS);
browser = await chromium.launch();
try {
  for (const n of names) {
    if (!CHECKS[n]) { console.log('no such check: ' + n); fails++; continue; }
    if (n === 'keys-once') { await CHECKS[n](); continue; }
    for (const ph of PHONES) {
      try { await CHECKS[n](ph); } catch (e) { check(`${ph.id} ${n}: ran`, false, e.message.split('\n')[0]); }
    }
  }
} finally { await browser.close(); }
console.log(`\n${results.length - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
