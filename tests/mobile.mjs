// Touch checks on emulated phones. Input goes only through touch: page.touchscreen.tap for taps and CDP
// Input.dispatchTouchEvent for drags and pinches (plus the keyboard for the desktop keys-once check). page.evaluate
// only reads state: the game's own hooks (VH.UI.lastMenu, lastRects, mapClose, hudRects, VH.Input.buttons) say where
// things are, and ?check=layout makes the HUD log every text and panel it drew in the last frame (window.__layout).
//
//   cd game && python3 -m http.server 8765 &
//   node tests/mobile.mjs                 # every check on every phone
//   node tests/mobile.mjs tap-once map    # just those checks
//   SHOTS=/tmp/m node tests/mobile.mjs    # with a screenshot per step
// Needs Playwright (npm i -D playwright, or NODE_PATH pointing at an install). BASE=http://... to point elsewhere.
// Headless Chromium draws at about 120 frames a second, so frames without a simulation step happen all the time:
// that's what makes a single tap fire twice when input isn't cleared per frame.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/index.html';
const SHOTS = process.env.SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PHONES = [
  { id: 'iphone-port', dev: 'iPhone 13' },
  { id: 'iphone-land', dev: 'iPhone 13', land: true },
  { id: 'iphone-notch', dev: 'iPhone 13', land: true, inset: '47,0,47,21' }, // a notched phone on its side (simulated safe area)
  { id: 'pixel-port', dev: 'Pixel 7' },
  { id: 'pixel-land', dev: 'Pixel 7', land: true },
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
      const si = menu.items.findIndex(i => i.startsWith('SOUND')); const m0 = await s.ev(() => SFX.isMuted());
      await s.tapRect(menu.rects[si]); const m1 = await s.ev(() => SFX.isMuted());
      check(T + ': title SOUND toggles once', m1 !== m0, `muted ${m0} -> ${m1}`);
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
      const items = await ev(() => VH.UI.lastMenu.items); const si = items.findIndex(i => i.startsWith('SOUND'));
      for (let i = 0; i < si; i++) { await page.keyboard.press('ArrowDown'); await sleep(120); }
      const m0 = await ev(() => SFX.isMuted()); await page.keyboard.press('Enter'); await sleep(250);
      check(T + ': Enter on SOUND toggles once', (await ev(() => SFX.isMuted())) !== m0);
      for (let i = 0; i < si; i++) { await page.keyboard.press('ArrowUp'); await sleep(120); }
      await page.keyboard.press('Enter'); await sleep(300); check(T + ': Enter on NEW GAME opens the select', (await ev(() => VH.Game.state)) === 'select');
      const s0 = await ev(() => VH.UI.selIdx); await page.keyboard.press('ArrowRight'); await sleep(250);
      check(T + ': one Right moves one card', (await ev(() => VH.UI.selIdx)) === (s0 + 1) % 3 && (await ev(() => VH.Game.state)) === 'select');
      await page.keyboard.press('Enter'); await sleep(300); check(T + ': Enter opens the week', (await ev(() => VH.Game.state)) === 'week');
      await page.keyboard.press('Enter'); await sleep(500); check(T + ': Enter on night 1 opens its brief', (await ev(() => VH.Game.state)) === 'brief', await ev(() => VH.Game.state));
      await sleep(900); await page.keyboard.press('Enter'); await sleep(400); check(T + ': Enter starts the job', (await ev(() => VH.Game.state)) === 'play');
      await page.keyboard.press('m'); await sleep(300); check(T + ': M opens the map', (await ev(() => VH.Game.state)) === 'map');
      await page.keyboard.press('m'); await sleep(300); check(T + ': M closes the map', (await ev(() => VH.Game.state)) === 'play');
      await page.keyboard.press('Escape'); await sleep(300); check(T + ': Esc pauses', (await ev(() => VH.Game.state)) === 'pause');
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
      const c = document.getElementById('game'), x = c.getContext('2d'), io = VH.UI.inset; const lum = (px, py) => { const d = x.getImageData(px, py, 1, 1).data; return 0.3 * d[0] + 0.59 * d[1] + 0.11 * d[2] + 1; };
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
