// Boot, the frame loop, screen scaling and the game state machine.
'use strict';
(function (VH) {
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const U = VH.U, W = VH.World, R = VH.MapRender, I = VH.Input, UI = VH.UI, FX = VH.FX, Game = VH.Game, M = VH.Missions;
  const canvas = document.getElementById('game'); const ctx = canvas.getContext('2d');
  let bb, bctx, scale = 2, ts = 1; let loadP = 0, loadMsg = 'Loading';
  // The world is drawn into its own buffer at a zoomable pixel scale (closer on foot, wider when driving);
  // the HUD and menus are drawn into a transparent buffer at the fixed UI scale and laid on top.
  let wb, wctx, cw = 1, ch = 1, zoom = 1, wbW = 0, wbH = 0, lastWs = 1, camSpd = 0, camLvl = 0;

  function resize() {
    const dpr = +(new URLSearchParams(location.search).get('dpr')) || Math.min(3, window.devicePixelRatio || 1); // ?dpr= simulates phones in tests
    cw = Math.floor(innerWidth * dpr); ch = Math.floor(innerHeight * dpr);
    canvas.width = cw; canvas.height = ch;
    scale = Math.max(1, Math.round(Math.max(cw, ch) / 820));
    if (Math.min(cw, ch) / scale < 300) scale = Math.max(1, Math.floor(Math.min(cw, ch) / 300));
    if (ch > cw) while (scale > 1 && cw / scale < 540) scale--; // portrait phones: keep enough width for the HUD
    // the HUD sits inside a safe area: the phone's notch and rounded corners (CSS safe-area insets), plus a small margin
    // when the game runs in a frame (a published artifact), whose edges can be covered by the page around it
    const sa = safeInsets(); const framed = window.self !== window.top || new URLSearchParams(location.search).has('framed');
    const m = framed ? 12 : 0; insL = Math.round((sa.l + m) * dpr); insT = Math.round((sa.t + m) * dpr); insR = Math.round((sa.r + m) * dpr); insB = Math.round((sa.b + m) * dpr);
    [bb, bctx] = U.canvas(Math.ceil((cw - insL - insR) / scale), Math.ceil((ch - insT - insB) / scale));
    ts = Math.max(1, Math.ceil(9 * dpr / (7 * scale) - 0.15));
    I.scale = scale; I.offX = insL; I.offY = insT; UI.inset = { l: insL, t: insT, scale, dpr }; ctx.imageSmoothingEnabled = false; wbW = 0;
  }
  let insL = 0, insT = 0, insR = 0, insB = 0;
  function safeInsets() {
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
    const inHeli = pl && pl.vehicle && pl.vehicle.def && pl.vehicle.def.heli; const close = footScale(), far = scale >= 3 || inHeli ? Math.max(1, scale - 1) : scale;
    // the player's zoom choice is an integer offset on top
    const base = camLvl === 0 ? close : camLvl === 1 ? scale : far;
    const ws0 = live ? U.clamp(base + (Game.zoomOff || 0), 1, scale * 2 + 3) : base;
    const want = ws0 / scale;
    zoom += (want - zoom) * Math.min(1, (Game.frameDt || 0.016) * 2.5); if (Math.abs(want - zoom) < 0.02) zoom = want;
    const ws = Math.round(scale * zoom * 8) / 8;
    const w = Math.ceil(cw / ws), h = Math.ceil(ch / ws);
    if (w !== wbW || h !== wbH) { [wb, wctx] = U.canvas(w, h); wbW = w; wbH = h; }
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
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; Game.frameDt = dt;
    if (frame.lastW !== innerWidth || frame.lastH !== innerHeight) { frame.lastW = innerWidth; frame.lastH = innerHeight; resize(); }
    const st = Game.state; let stepped = false;
    if (st !== frame.st) { frame.st = st; frame.since = now; }
    const stuck = !['play', 'title', 'select', 'week', 'pause', 'loading', 'map', 'help', 'credits', 'deadEnd'].includes(st) && now - frame.since > 20000;
    try {
      if (st !== 'map' && UI._sel && UI._sel.style.display !== 'none') UI.hideSearch();
      if (st === 'loading') { UI.loading(bctx, ts, loadP, loadMsg); }
      else {
        if (st === 'play' || st === 'ride' || st === 'title' || st === 'select' || st === 'week' || ((st === 'help' && !Game.prevState) || (st === 'credits' && Game.prevState !== 'pause'))) {
          if (FX.hitStop > 0) FX.hitStop -= dt;
          else { acc += dt; let n = 0; while (acc >= 1 / 60 && n < 4 && Game.state === st) { stepped = true; if (Game.demo) { demoStep(1 / 60); Game.updateDemo(1 / 60); } else if (st === 'ride') Game.updateRide(1 / 60); else Game.update(1 / 60); acc -= 1 / 60; n++; } if (n === 4) acc = 0; }
        } else { Game.stateT = (Game.stateT || 0) + dt; Game.t += dt * 0.25; FX.update(dt * 0.5); }
        const ws = lastWs = worldBuffer(); Game.render(wctx, R.S, ts); Game.view.k = ws / scale;
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
      U.text(bctx, 'ESC: BACK TO THE GAME', bb.width - 6 * ts, 4 * ts, { align: 'right', color: '#ffd23a', scale: ts });
      if (I.consume('pause') || I.consume('back')) { VH.Missions.settle(); if (st === 'ride') { VH.Lockup.ride = null; Game.afterBust(); } else if (st === 'lockedUp') Game.afterBust(); else if (st === 'nightEnd' || st === 'sunrise' || st === 'win') Game.openWeek(Game.char, Game.night); else Game.state = 'play'; }
    }
    ctx.imageSmoothingEnabled = false;
    if (st !== 'loading' && wb) ctx.drawImage(wb, 0, 0, wb.width * lastWs, wb.height * lastWs);
    ctx.drawImage(bb, insL, insT, bb.width * scale, bb.height * scale);
    // keep key presses until a simulation step has seen them
    const sim = st === 'play' || st === 'ride' || st === 'title' || st === 'select' || st === 'week';
    if (!sim || stepped || Game.state !== st) I.endFrame();
    requestAnimationFrame(frame);
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
  addEventListener('blur', () => Game.autoPause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Game.autoPause(); });
  async function boot() {
    I.init(canvas); try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    requestAnimationFrame(frame);
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
      const q = new URLSearchParams(location.search);
      if (q.get('play')) {
        const night = +(q.get('night') || 1);
        if (q.get('play') === 'roam') Game.beginRun('roam'); else Game.playNight(q.get('play'), night, { fromStart: true, ...(night > 1 ? { cash: 50, upgrades: { turbo: q.get('play') === 'grump' } } : {}), ...(q.get('job') ? { only: +q.get('job') } : {}) });
        M.startJob(); Game.state = 'play'; Game.briefNight = false;
        if (q.get('hour')) Game.hour = +q.get('hour');
        if (q.get('at')) { const [x, y] = q.get('at').split(',').map(Number); const pl = Game.player; if (pl.vehicle) { pl.vehicle.x = x; pl.vehicle.y = y; } pl.x = x; pl.y = y; Game.cam.x = x; Game.cam.y = y; R.prefetch(x, y, 110); Game.populate(true); }
      }
      // ?check=walkers: the walking self-check (nobody inside a building or in the water); the result is logged and kept on window.__check
      if (q.get('check') === 'slots') { const r = VH.Spawn.selfCheck(+(q.get('n') || 200)); window.__check = r; console[r.bad.length ? 'error' : 'log']('slot check: ' + r.checked + ' slots, ' + r.bad.length + ' unreachable' + (r.bad.length ? ': ' + r.bad.slice(0, 10).join(' ') : '')); }
      if (q.get('check') === 'walkers') { const r = VH.Nav.selfCheck(+(q.get('secs') || 12)); window.__check = r; console[r.badCount ? 'error' : 'log']('walker check: ' + r.samples + ' samples, ' + r.badCount + ' bad', JSON.stringify(r.bad)); }
      window.__ready = true;
    } catch (e) { console.error(e); loadMsg = 'Something broke: ' + e.message; }
  }
  boot();
})(window.VH);
