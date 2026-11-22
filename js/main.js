// Boot, the frame loop, screen scaling and the game state machine.
'use strict';
(function (VH) {
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const U = VH.U, W = VH.World, R = VH.MapRender, I = VH.Input, UI = VH.UI, FX = VH.FX, Game = VH.Game, M = VH.Missions;
  // #game is the input surface (and what the tests measure against); nothing is drawn on it, so it has no pixels.
  // The picture is three canvases under it, each kept at its own pixel-art scale and enlarged by the browser (nearest
  // neighbour): the world at its zoomable art scale (closer on foot, wider when driving), the full-screen backdrops
  // (menu dimming, letterbox bars) and the HUD and menus at the fixed UI scale, inside the safe area. Nothing is drawn
  // at the screen's full device resolution, so a Retina screen costs no more to draw than any other.
  const canvas = document.getElementById('game');
  const layer = (id, alpha) => { const c = document.createElement('canvas'); c.id = id; c.className = 'layer'; c.setAttribute('aria-hidden', 'true'); canvas.parentNode.insertBefore(c, canvas); return [c, c.getContext('2d', { alpha })]; };
  const [wb, wctx] = layer('world', false), [kb, kctx] = layer('backdrop', true), [bb, bctx] = layer('hud', true); bb.__ui = true;
  const size = (c, x, w, h) => { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } x.imageSmoothingEnabled = false; }; // (resizing resets the context)
  // a canvas whose pixels the browser dropped while the page was away comes back blank, with its settings reset
  for (const [c, x] of [[wb, wctx], [kb, kctx], [bb, bctx]]) c.addEventListener('contextrestored', () => { x.imageSmoothingEnabled = false; worldStale = true; kb._used = true; });
  // where a layer sits on the page, in device pixels; CSS pixels are worked out from #game's own box, as input is
  let kx = 1, ky = 1;
  const place = (c, x, y, w, h) => { const st = c.style, v = [x * kx, y * ky, w * kx, h * ky].map(n => n + 'px'); if (c._at !== v.join()) { c._at = v.join(); st.left = v[0]; st.top = v[1]; st.width = v[2]; st.height = v[3]; } };
  let scale = 2, ts = 1; let loadP = 0, loadMsg = 'Loading';
  let cw = 1, ch = 1, zoom = 1, wbW = 0, wbH = 0, lastWs = 1, camSpd = 0, camLvl = 0, worldStale = true;

  function resize() {
    const dpr = +(new URLSearchParams(location.search).get('dpr')) || Math.min(3, window.devicePixelRatio || 1); // ?dpr= simulates phones in tests
    cw = Math.floor(innerWidth * dpr); ch = Math.floor(innerHeight * dpr);
    canvas.width = cw; canvas.height = ch;
    { const r = canvas.getBoundingClientRect(); kx = (r.width || innerWidth) / cw; ky = (r.height || innerHeight) / ch; }
    scale = Math.max(1, Math.round(Math.max(cw, ch) / 820));
    if (Math.min(cw, ch) / scale < 300) scale = Math.max(1, Math.floor(Math.min(cw, ch) / 300));
    if (ch > cw) while (scale > 1 && cw / scale < 540) scale--; // portrait phones: keep enough width for the HUD
    // the HUD sits inside a safe area: the phone's notch and rounded corners (CSS safe-area insets), plus a small margin
    // when the game runs in a frame (a published artifact), whose edges can be covered by the page around it
    const sa = safeInsets(); const framed = window.self !== window.top || new URLSearchParams(location.search).has('framed');
    const m = framed ? 12 : 0; insL = Math.round((sa.l + m) * dpr); insT = Math.round((sa.t + m) * dpr); insR = Math.round((sa.r + m) * dpr); insB = Math.round((sa.b + m) * dpr);
    size(bb, bctx, Math.ceil((cw - insL - insR) / scale), Math.ceil((ch - insT - insB) / scale)); place(bb, insL, insT, bb.width * scale, bb.height * scale);
    size(kb, kctx, Math.ceil(cw / scale), Math.ceil(ch / scale)); place(kb, 0, 0, kb.width * scale, kb.height * scale);
    ts = Math.max(1, Math.ceil(9 * dpr / (7 * scale) - 0.15));
    I.scale = scale; I.offX = insL; I.offY = insT; UI.inset = { l: insL, t: insT, r: insR, b: insB, scale, dpr }; wbW = 0; worldStale = true;
  }
  let insL = 0, insT = 0, insR = 0, insB = 0;
  function safeInsets() {
    const fake = new URLSearchParams(location.search).get('inset'); // ?inset=l,t,r,b (CSS px) simulates a phone's safe area in tests
    if (fake) { const [l, t, r, b] = fake.split(',').map(Number); return { l: l || 0, t: t || 0, r: r || 0, b: b || 0 }; }
    try {
      const d = document.createElement('div'); d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(d);
      const cs = getComputedStyle(d); const r = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; d.remove(); return r;
    } catch (e) { return { t: 0, r: 0, b: 0, l: 0 }; }
  }
  // world pixel scale: the UI scale when driving, one step closer on foot
  const footScale = () => scale <= 3 ? scale + 1 : Math.round(scale * 1.34);
  function worldBuffer() {
    const pl = Game.player; const st = Game.state;
    const live = pl && !Game.demo && (st === 'play' || st === 'pause' || st === 'brief' || st === 'ride' || st === 'map' || st === 'chat');
    // close by default; pulls out as you pick up speed (or altitude in a chopper). The speed is smoothed and the level
    // has hysteresis, so tapping the brake doesn't pump the camera. Levels are whole art-pixel scales, so pixels stay square.
    if (live) {
      const v = !pl.onFoot && pl.vehicle; const spd = v ? v.speed : 0; const alt = v && v.def && v.def.heli ? v.z : 0;
      camSpd += (spd - camSpd) * Math.min(1, (Game.frameDt || 0.016) * (spd > camSpd ? 0.9 : 0.5));
      const pull = Math.max(camSpd / 42, alt / 22);
      if (camLvl === 0 && pull > 0.3) camLvl = 1; else if (camLvl === 1 && pull > 0.72) camLvl = 2; else if (camLvl === 2 && pull < 0.6) camLvl = 1; else if (camLvl === 1 && pull < 0.18) camLvl = 0;
    } else camLvl = 1;
    const inHeli = pl && pl.vehicle && pl.vehicle.def && pl.vehicle.def.heli; let close = footScale(), mid = scale, far = scale >= 3 || inHeli ? Math.max(1, scale - 1) : scale;
    // on a phone (a touch screen under 500 CSS px across) the levels come from how much world fits across the short side (whatever the pixel density):
    // about 50 m on foot and 80 m driving fast, so a phone sees about what a desktop does for its size
    if (I.touchMode && Math.min(innerWidth, innerHeight) < 500) { const sm = Math.min(cw, ch) / R.S; close = Math.max(1, Math.round(sm / 50)); far = Math.max(1, Math.round(sm / (inHeli ? 100 : 80))); mid = Math.max(far, Math.round((close + far) / 2)); Game.camMetres = { foot: sm / close, mid: sm / mid, fast: sm / far }; }
    // the player's zoom choice is an integer offset on top
    const base = live && VH.RB && VH.RB.zoomWant() ? far : camLvl === 0 ? close : camLvl === 1 ? mid : far; // Round B hook: the fireworks show pulls the camera out
    const ws0 = live ? U.clamp(base + (Game.zoomOff || 0), 1, Math.max(scale * 2 + 3, close + 3)) : base;
    const want = ws0 / scale;
    zoom += (want - zoom) * Math.min(1, (Game.frameDt || 0.016) * 2.5); if (Math.abs(want - zoom) < 0.02) zoom = want;
    const ws = Math.round(scale * zoom * 8) / 8;
    const w = Math.ceil(cw / ws), h = Math.ceil(ch / ws);
    if (w !== wbW || h !== wbH) { size(wb, wctx, w, h); wbW = w; wbH = h; }
    place(wb, 0, 0, w * ws, h * ws);
    return ws;
  }
  addEventListener('resize', resize); resize();

  // demo camera for the title screen: a slow drift along the foreshore
  Game.toTitle = function () {
    Game.state = 'title'; Game.char = 'roam'; M.char = 'roam'; M.job = null; Game.upgrades = {}; Game.partyOn = true;
    Game.startNight(); Game.timeOverride = null; Game.hour = 19.25; Game.demo = { s: 120 };
    UI.menuIdx = 0; window.SFX && SFX.music('title'); window.SFX && SFX.siren(false);
  };
  Game.beginRun = function (char) { Game.demo = null; Game.newRun(char); };
  // the week: pick a character, then a night (each night unlocks when the one before it is finished)
  Game.openWeek = function (char, n) { if (!Game.demo) Game.toTitle(); Game.state = 'week'; UI.weekChar = char; UI.weekIdx = (n || M.firstUnfinished(char)) - 1; UI.weekScroll = 0; };
  Game.playNight = function (char, n, opts) { Game.demo = null; M.playNight(char, n, opts); };
  function demoStep(dt) {
    const r = W.railRoutes.train; Game.demo.s += dt * 9; if (Game.demo.s > r.cum[r.cum.length - 1] - 50) Game.demo.s = 120;
    const [x, y] = U.alongPoly(r.p, r.cum, Game.demo.s); const pl = Game.player; pl.vx = (x - pl.x) / dt; pl.vy = (y - pl.y) / dt; pl.x = x; pl.y = y + 25;
  }

  const TIMES = [12, 18.7, 19.8, 21, 23.95, 2.5];
  const layoutCheck = new URLSearchParams(location.search).get('check') === 'layout';
  const S = VH.Settings;
  // ---------- pacing: how often a frame is drawn ----------
  // Playing: up to the frame-rate setting (60 by default, so a 120 Hz screen draws every other refresh). The title, and
  // the screens with the world still moving behind them: about 30. A menu over a paused world: at once when there's a
  // key or a tap, while a key or finger is held, and a few times a second for its blinking prompts; the world under it
  // isn't drawn again. A hidden page draws nothing at all, and picks up where it was when it comes back.
  const SIM = st => st === 'play' || st === 'ride' || st === 'title' || st === 'select' || st === 'week' || (st === 'help' && !Game.prevState) || ((st === 'credits' || st === 'settings') && Game.prevState !== 'pause');
  const LIVE = st => st === 'play' || st === 'ride' || st === 'chat';
  const IDLE = st => !SIM(st) && !LIVE(st) && st !== 'win' && st !== 'loading'; // (the win card has confetti falling on the world)
  const Perf = VH.Perf = { raf: 0, drawn: 0, fps: 0, work: 0, _n: 0, _t: 0, _w: 0 };
  Perf.info = () => ({ fps: Perf.fps, quality: S.level(), cap: S.fpsCap() || 'max', world: wb.width + 'x' + wb.height, hud: bb.width + 'x' + bb.height, frameMs: +Perf.work.toFixed(2) });
  function targetFps(st) {
    const cap = S.fpsCap() || 1000;
    if (LIVE(st)) return cap;
    if (!IDLE(st)) return Math.min(30, cap);
    if (I.anyDown()) return Math.min(60, cap); // dragging the map, holding a key to scroll
    return Math.min(UI.wantFps || 4, cap); // (a screen that animates asks for more)
  }
  // Frames are drawn on whole refreshes: every n-th, n from the screen's measured refresh interval (a 120 Hz screen
  // capped at 60 draws every other one; 144 Hz gives 72, 90 Hz stays at 90: an even beat, never a judder)
  let last = performance.now(), acc = 0, lastRaf = 0, rafIv = 1000 / 60, since = 0, lastDrawn = 0, lastSt = null, running = false, setV = -1;
  const every = fps => Math.max(1, Math.floor(1000 / fps / rafIv + 0.1));
  function loop(now) {
    if (document.hidden) { running = false; return; }
    requestAnimationFrame(loop); Perf.raf++;
    const gap = now - lastRaf; lastRaf = now; if (gap > 2 && gap < 100) rafIv += (gap - rafIv) * 0.05; // (the refresh, smoothed; hitches left out)
    since++;
    const st = Game.state, idle = IDLE(st);
    if (S.version !== setV) { setV = S.version; worldStale = true; } // a setting changed: show it, even under a menu
    const n = every(targetFps(st));
    // a still screen answers a key or a tap at once (no sooner than a 60 fps frame apart, while a finger or key is held)
    const fresh = idle && I.lastInput > lastDrawn && since >= every(60);
    const poke = st !== lastSt || frame.lastW !== innerWidth || frame.lastH !== innerHeight || (idle && worldStale) || fresh;
    if (!poke && since < n) return;
    since = 0;
    const t0 = performance.now(); lastDrawn = t0; lastSt = st; UI.wantFps = 0;
    frame(now);
    // the FPS counter, and AUTO quality's watch on how long frames take
    const t1 = performance.now(), work = t1 - t0; Perf.drawn++; Perf._n++; Perf._w += work;
    if (t1 - Perf._t > 1000) { Perf.fps = Math.round(Perf._n * 1000 / (t1 - Perf._t)); Perf.work = Perf._w / Math.max(1, Perf._n); Perf._n = 0; Perf._w = 0; Perf._t = t1; }
    if (LIVE(st) && st === Game.state) S.sample(now, work, n * rafIv); // (judged against the beat this screen can have)
  }
  function start() { if (running || document.hidden) return; running = true; last = performance.now(); lastRaf = 0; acc = 0; since = 99; lastSt = null; worldStale = true; S.resumed(); requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  function frame(now) {
    const st0 = Game.state, real = Math.max(0, (now - last) / 1000); last = now;
    const dt = Math.min(SIM(st0) ? 0.05 : 0.25, real); Game.frameDt = Math.min(0.05, dt); // (a still screen draws seldom, but its timers keep time)
    if (frame.lastW !== innerWidth || frame.lastH !== innerHeight) { frame.lastW = innerWidth; frame.lastH = innerHeight; resize(); }
    const st = Game.state; I.inStep = false;
    if (layoutCheck) U.layoutLog = { text: [], panels: [] };
    UI.backdrops.length = 0;
    // the touch buttons belong to the HUD: on any other screen (the map, the pause menu, the controls) a finger where
    // one was drawn is just a finger, so it pans, pinches or taps that screen instead of pressing MAP or PAUSE
    if (st !== 'play' && st !== 'chat') { if (I.buttons.length) I.setButtons([]); I.stickZone = 0; }
    if (st !== frame.st) { frame.st = st; frame.since = now; worldStale = true; } // (a new screen: the world under it as it is now)
    const stuck = !['play', 'title', 'select', 'week', 'pause', 'loading', 'map', 'help', 'credits', 'settings', 'deadEnd'].includes(st) && now - frame.since > 20000;
    try {
      if (st !== 'map' && UI._sel && UI._sel.style.display !== 'none') UI.hideSearch();
      if (st === 'loading') { UI.loading(bctx, ts, loadP, loadMsg); }
      else {
        const frozen = IDLE(st) && !worldStale; // a menu over a paused world: the world as it was
        if (SIM(st)) {
          if (FX.hitStop > 0) FX.hitStop -= dt;
          else { acc += dt; let n = 0; while (acc >= 1 / 60 && n < 4 && Game.state === st) { I.inStep = true; try { if (Game.demo) { demoStep(1 / 60); Game.updateDemo(1 / 60); } else if (st === 'ride') Game.updateRide(1 / 60); else Game.update(1 / 60); } finally { I.inStep = false; I.endStep(); } acc -= 1 / 60; n++; } if (n === 4) acc = 0; }
        } else { Game.stateT = (Game.stateT || 0) + dt; Game.t += dt * 0.25; if (!frozen) FX.update(dt * 0.5); }
        if (!frozen) { const ws = lastWs = worldBuffer(); Game.render(wctx, R.S, ts); Game.view.k = ws / scale; worldStale = false; }
        else if (Game.cam) R.pump(Game.cam.x, Game.cam.y, 3); // (the map tiles round a new start keep loading under its brief)
        bctx.clearRect(0, 0, bb.width, bb.height);
        if (st === 'play') {
          UI.hud(bctx, ts);
          if (I.consume('help')) { Game.helpOpen = !Game.helpOpen; sfx('click'); }
          const zi = I.consume('zoomIn'), zo = I.consume('zoomOut'), zr = I.consume('zoomReset');
          if (zi || zo || zr) { Game.zoomOff = zr ? 0 : U.clamp((Game.zoomOff || 0) + (zi ? 1 : -1), -2, 3); U.store.set('zoom', Game.zoomOff); Game.toast('ZOOM ' + (Game.zoomOff > 0 ? '+' : '') + Game.zoomOff + (zr ? ' (RESET)' : '')); }
          if (I.consume('pause')) { if (Game.helpOpen) Game.helpOpen = false; else { Game.state = 'pause'; UI.menuIdx = 0; } }
          if (I.consume('job') && M.job && M.job.started) { Game.state = 'brief'; Game.stateT = 0; Game.reviewBrief = true; sfx('click'); }
          if (I.consume('map')) Game.state = 'map';
          if (I.consume('mute')) { SFX.setMuted(!SFX.isMuted()); U.store.set('muted', SFX.isMuted()); Game.toast(SFX.isMuted() ? 'SOUND OFF' : 'SOUND ON'); }
          if (I.consume('time') && Game.char === 'roam') { const i = TIMES.findIndex(t => Math.abs(t - Game.hour) < 0.3); Game.hour = TIMES[(i + 1) % TIMES.length]; Game.toast('TIME: ' + String(Math.floor(Game.hour)).padStart(2, '0') + ':' + String(Math.floor((Game.hour % 1) * 60)).padStart(2, '0')); }
          if (Game.pendingWeek > 0) { Game.pendingWeek -= dt; if (Game.pendingWeek <= 0) Game.openWeek(Game.char, Game.night); }
          if (Game.pendingBrief > 0) { Game.pendingBrief -= dt; if (Game.pendingBrief <= 0 && M.job && !M.job.started) { Game.state = 'brief'; Game.stateT = 0; Game.reviewBrief = false; sfx('ring'); } }
        }
        else if (st === 'title') UI.title(bctx, ts);
        else if (st === 'select') UI.select(bctx, ts);
        else if (st === 'week') UI.week(bctx, ts);
        else if (st === 'deadEnd') UI.deadEnd(bctx, ts);
        else if (st === 'help') UI.help(bctx, ts);
        else if (st === 'settings') UI.settings(bctx, ts);
        else if (st === 'credits') UI.credits(bctx, ts);
        else if (st === 'brief') UI.brief(bctx, ts);
        else if (st === 'pause') UI.pause(bctx, ts);
        else if (st === 'map') { UI.fullMap(bctx, ts); if (UI.closeMap || (!UI.search.focus && (I.consume('map') || I.consume('pause')))) { UI.closeMap = false; Game.state = 'play'; UI.hideSearch(); for (const q of I.pointers.values()) q.lx = null; } }
        else if (st === 'ride') UI.ride(bctx, ts);
        else if (st === 'chat') { UI.hud(bctx, ts); VH.Shops.drawChat(bctx, ts); }
        else if (st === 'lockedUp') UI.lockedUp(bctx, ts);
        else if (st === 'nightEnd') UI.nightEnd(bctx, ts);
        else if (st === 'sunrise') UI.sunrise(bctx, ts);
        else if (st === 'win') UI.win(bctx, ts);
      }
    } catch (e) { console.error(e); Game.lastError = String(e && e.stack || e); }
    // the watchdog: a screen that has lasted over 20 seconds always offers Esc back to the game
    if (stuck && Game.state === st) {
      { const hw = U.textWidth('ESC: BACK TO THE GAME', ts); bctx.fillStyle = 'rgba(18,12,36,0.92)'; bctx.fillRect(bb.width - 9 * ts - hw, 0, hw + 9 * ts, 10 * ts); U.text(bctx, 'ESC: BACK TO THE GAME', bb.width - 5 * ts, 1.5 * ts, { align: 'right', color: '#ffd23a', scale: ts }); } // (on its own plate in the top strip, clear of a message card)
      if (I.consume('pause') || I.consume('back')) { VH.Missions.settle(); if (st === 'ride') { VH.Lockup.ride = null; Game.afterBust(); } else if (st === 'lockedUp') Game.afterBust(); else if (st === 'nightEnd' || st === 'sunrise' || st === 'win') Game.openWeek(Game.char, Game.night); else Game.state = 'play'; }
    }
    if (S.showFps) { const s = 'FPS ' + Perf.fps, w = U.textWidth(s, ts); bctx.fillStyle = 'rgba(18,12,36,0.8)'; bctx.fillRect(0, Math.round(bb.height * 0.45), w + 6 * ts, 11 * ts); U.text(bctx, s, 3 * ts, Math.round(bb.height * 0.45) + 2 * ts, { color: '#9be15d', scale: ts }); }
    if (layoutCheck) { window.__layout = { state: Game.state, W: bb.width, H: bb.height, ...U.layoutLog }; U.layoutLog = null; } // what the HUD drew this frame, for tests/mobile.mjs
    // full-screen backdrops go on their own layer, edge to edge (drawn in screen pixels, kept at the UI scale)
    if (UI.backdrops.length || kb._used) {
      kctx.setTransform(1, 0, 0, 1, 0, 0); kctx.clearRect(0, 0, kb.width, kb.height); kctx.setTransform(1 / scale, 0, 0, 1 / scale, 0, 0);
      for (const f of UI.backdrops) { if (typeof f === 'string') { kctx.fillStyle = f; kctx.fillRect(0, 0, cw, ch); } else f(kctx, cw, ch, y => Math.round((insT + y * scale) / scale) * scale); } // (edges on whole backdrop pixels)
      kctx.setTransform(1, 0, 0, 1, 0, 0); kb._used = UI.backdrops.length > 0;
    }
    // a press waits in the step store until a simulation step has seen it, and in the frame store for one frame;
    // screens without steps, and a change of screen, drop both
    const sim = st === 'play' || st === 'ride' || st === 'title' || st === 'select' || st === 'week';
    if (Game.state !== st || !!Game.helpOpen !== frame.help) I.newScreen(); else if (!sim) I.clearAll(); else I.endFrame();
    if (!!Game.helpOpen !== frame.help) UI.helpOvScroll = 0; frame.help = !!Game.helpOpen;
  }
  // world update for the title backdrop: traffic and people carry on without a player
  Game.updateDemo = function (dt) {
    Game.t += dt; Game.hour = 19.25; VH.Nav.frame();
    const pl = Game.player; const active = Game.vehicles.filter(v => !v.removed && Math.hypot(v.x - pl.x, v.y - pl.y) < 260);
    for (const v of active) { if (v.ai) VH.AI.drive(v, dt, active); v.update(dt); }
    for (const v of active) { VH.Collide.walls(v); VH.Props.collideVehicle(v); }
    VH.Collide.vehicles(active);
    for (const p of Game.peds) p.update(dt, active);
    for (const g of Game.gulls) g.update(dt, active.filter(v => v.speed > 2), null);
    for (const w of Game.whales) w.update(dt);
    FX.update(dt);
    Game.popT = (Game.popT || 0) - dt; if (Game.popT <= 0) { Game.popT = 0.5; Game.populate(false); }
    if (window.SFX) { SFX.engine({ speed: 0, throttle: 0, kind: 'foot' }); SFX.ambience({ sea: 0.6, wind: 0.1, party: 0.2 }); }
  };

  // Focus: the published game runs in a frame, and keys only arrive while it has focus. Clicking or tapping the canvas
  // takes focus back; losing it (another tab, a click on the page around the game) pauses with a "click to continue".
  Game.autoPause = function () {
    if (Game.state === 'play' || Game.state === 'chat') { if (Game.state === 'chat') VH.Shops.chat = null; Game.state = 'pause'; Game.autoPaused = true; UI.menuIdx = 0; UI.pauseAsk = null; }
    I.keys = {}; I.held = {};
  };
  canvas.tabIndex = 0; canvas.style.outline = 'none';
  canvas.addEventListener('pointerdown', () => { try { canvas.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } });
  // a phone loses focus all the time without leaving the game (the notification shade, a control-centre peek, a stray
  // edge swipe), so on a touch screen only hiding the page pauses; with a keyboard, losing focus still pauses, because
  // keys stop arriving until the game is clicked again
  addEventListener('blur', () => { if (I.touchMode) { I.keys = {}; I.held = {}; I.pointers.clear(); I.pinch = null; Object.assign(I.stick, { active: false, mag: 0, x: 0, y: 0 }); } else Game.autoPause(); }); // (fingers lifted while away)
  document.addEventListener('visibilitychange', () => { if (document.hidden) Game.autoPause(); });
  async function boot() {
    I.init(canvas); try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    wctx.fillStyle = '#120c24'; wctx.fillRect(0, 0, wb.width, wb.height); start();
    try {
      if (window.SFX && U.store.get('muted', false)) SFX.setMuted(true);
      Game.zoomOff = +U.store.get('zoom', 0) || 0; Game.walkMode = U.store.get('walk', 'car');
      await W.load((p, m) => { loadP = p; loadMsg = m; }); VH.Spawn.init(W.slotsRaw);
      R.initPatterns(); R.buildIndex(); loadP = 0.9; loadMsg = 'Painting the roofs';
      await new Promise(r => setTimeout(r, 0));
      R.buildOverview(); Game.init(); M.migrateOld(); loadP = 0.97; loadMsg = 'Waking the seagulls';
      await new Promise(r => setTimeout(r, 0));
      Game.toTitle();
      // test hooks: ?play=schoolie|grump|cop|roam&hour=21.5&at=x,y&night=2&job=1 (job: play just that job, as a replay)
      // &from=2: start on that job of the night and carry on through the rest; &brief=1: wait on the job brief, so a test presses Enter like a player (Round B test hooks)
      const q = new URLSearchParams(location.search);
      if (q.get('play')) {
        const night = +(q.get('night') || 1);
        if (q.get('play') === 'roam') Game.beginRun('roam'); else Game.playNight(q.get('play'), night, { fromStart: true, ...(night > 1 ? { cash: 50, upgrades: { turbo: q.get('play') === 'grump' } } : {}), ...(q.get('job') ? { only: +q.get('job') } : {}) });
        if (q.get('from')) M.toNight(night, Math.max(0, +q.get('from') - 1));
        if (q.get('brief')) { Game.state = 'brief'; Game.stateT = 0; Game.briefNight = false; Game.reviewBrief = false; }
        else { M.startJob(); Game.state = 'play'; Game.briefNight = false; }
        if (q.get('hour')) Game.hour = +q.get('hour');
        const atP = q.get('atPlace') && VH.RB && VH.RB.startAt(q.get('atPlace')); // Round B test hook: &atPlace=dirt|skate|bighouse|town starts beside that track's pad (from its baked slot)
        if (q.get('at') || atP) { const [x, y] = atP ? [atP.x, atP.y] : q.get('at').split(',').map(Number); const pl = Game.player; if (pl.vehicle) { pl.vehicle.x = x; pl.vehicle.y = y; } pl.x = x; pl.y = y; Game.cam.x = x; Game.cam.y = y; R.prefetch(x, y, 110); Game.populate(true); }
      }
      // ?check=walkers: the walking self-check (nobody inside a building or in the water); the result is logged and kept on window.__check
      if (q.get('check') === 'slots') { const r = VH.Spawn.selfCheck(+(q.get('n') || 200)); window.__check = r; console[r.bad.length ? 'error' : 'log']('slot check: ' + r.checked + ' slots, ' + r.bad.length + ' unreachable' + (r.bad.length ? ': ' + r.bad.slice(0, 10).join(' ') : '')); }
      if (q.get('check') === 'walkers') { const r = VH.Nav.selfCheck(+(q.get('secs') || 12)); window.__check = r; console[r.badCount ? 'error' : 'log']('walker check: ' + r.samples + ' samples, ' + r.badCount + ' bad', JSON.stringify(r.bad)); }
      window.__ready = true;
    } catch (e) { console.error(e); loadMsg = 'Something broke: ' + e.message; }
  }
  boot();
})(window.VH);
