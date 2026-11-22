// Round B: sports, tricks and the glue for the water and fireworks modules.
//  - VH.RB: one place the core game calls into (init, per-night setup, update, drawing, HUD, help, map markers),
//    so the hooks in game.js, ui.js and friends stay one line each.
//  - VH.Tricks: air tricks shared by the jet ski and the BMX (spins, flips, tailwhips, barspins), scored on landing.
//  - VH.Sports: the skate park (bowl, quarter pipes, kickers, a rail), an invented dirt-jump track in the scrub,
//    hoops at the basketball half-courts (shoot-around, HORSE against a local kid, a timed shootout) and lawn bowls
//    at the club green (the invented Bay Bowls & Bickering Club) against the regulars (Merv gets a home-ground bonus). High scores in localStorage.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, SP = VH.Sprites, FX = VH.FX, I = VH.Input;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const G = () => VH.Game;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const store = (k, d) => U.store.get('rb:' + k, d), save = (k, v) => U.store.set('rb:' + k, v);
  const pv = () => { const pl = G().player; return pl && !pl.onFoot ? pl.vehicle : null; };
  const mods = () => [VH.Sports, VH.Water, VH.Fireworks, VH.Moto].filter(Boolean);

  // ================= pixel icons for the map, minimap and HUD =================
  const PAL = { w: '#f4f4f0', k: '#1a1a24', b: '#2e6ad8', B: '#8fd0ff', r: '#e0402e', y: '#ffd23a', o: '#ff8a2a', g: '#3d9a4a', G: '#9be15d', t: '#38e0c8', n: '#8a5a2a', p: '#ff4fa0', s: '#a0a0a8', c: '#d8c8a0' };
  const ICONS = {
    speedboat: ['.......', '...B...', '..wBw..', 'wwwwwww', '.bbbbb.', '..bbb..', '.......'],
    jetski: ['.......', '...k...', '..tkt..', '.ttttt.', '..ttt..', '...t...', '.......'],
    buoy: ['...y...', '..yyy..', '.rrrrr.', '.rrrrr.', '..rrr..', 'BBBBBBB', '.B.B.B.'],
    bmx: ['.......', '.ww.ww.', 'w..p..w', 'w.ppp.w', '.ww.ww.', '.......', '.......'],
    hoops: ['.wwwww.', '.w...w.', '..ooo..', '..o.o..', '..wow..', '...o...', '..ooo..'],
    bowls: ['..www..', '.wkkkw.', 'wkkkkkw', 'wkkykkw', '.wkkkw.', '..www..', 'GGGGGGG'],
    box: ['.......', '.nnnnn.', '.nyyyn.', '.nypyn.', '.nyyyn.', '.nnnnn.', '.......'],
    rocket: ['...y...', '..yyy..', '..rrr..', '..rrr..', '..rrr..', '.r.n.r.', '...o...'],
    dirt: ['.......', '.......', '..nnn..', '.nnnnn.', 'nnnnnnn', 'nnnnnnn', '.......'],
    moto: ['.......', '.......', 'kk.y.kk', 'krrrrrk', 'kk.r.kk', '.......', '.......'],
    fishing: ['...k...', '..wkw..', '.wwwww.', 'bbbbbbb', '.bbbbb.', '..bbb..', '.......'],
  };
  const RB = VH.RB = {};
  RB.icon = function (ctx, kind, x, y, s = 1) {
    const m = ICONS[kind]; if (!m) return; x = Math.round(x - 3.5 * s); y = Math.round(y - 3.5 * s);
    ctx.fillStyle = 'rgba(18,12,36,0.85)'; ctx.fillRect(x - s, y - s, 9 * s, 9 * s);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) { const ch = m[r][c]; if (ch !== '.') { ctx.fillStyle = PAL[ch]; ctx.fillRect(x + c * s, y + r * s, s, s); } }
  };
  // a marker that draws as a pixel icon on the minimap and the full map
  RB.mark = (x, y, kind) => ({ x, y, kind, draw: (ctx, mx, my, s) => RB.icon(ctx, kind, mx, my, s || 1) });

  // ================= glue: each call fans out to the Round B modules =================
  RB.init = () => { for (const m of mods()) m.init && m.init(); RB.addControls(); RB.registerTouch(); };
  RB.newNight = () => { for (const m of mods()) m.newNight && m.newNight(); };
  // at the top of Game.update: mini-games take the keys they need; returns true while the player is frozen in place
  RB.preUpdate = dt => { let busy = false; for (const m of mods()) if (m.preUpdate && m.preUpdate(dt)) busy = true; return busy; };
  RB.preVehicles = dt => { for (const m of mods()) m.preVehicles && m.preVehicles(dt); };
  RB.update = dt => { for (const m of mods()) m.update && m.update(dt); };
  RB.onLand = (v, air) => { const r = v.trick ? VH.Tricks.land(v, air) : null; if (v.def && v.def.bike && v.driver === 'player' && !(r && !r.ok)) S.onBikeLand(v); };
  RB.camFocus = () => { for (const m of mods()) { const f = m.camFocus && m.camFocus(); if (f) return f; } return null; };
  RB.zoomWant = () => { for (const m of mods()) { const z = m.zoomWant && m.zoomWant(); if (z) return z; } return 0; };
  const each = (fn, ...a) => { for (const m of mods()) if (m[fn]) m[fn](...a); };
  RB.drawSurface = (ctx, l, t, S) => each('drawSurface', ctx, l, t, S);
  RB.drawWorld = (ctx, l, t, S) => each('drawWorld', ctx, l, t, S);
  RB.drawTop = (ctx, l, t, S) => each('drawTop', ctx, l, t, S);
  RB.drawAir = (ctx, l, t, S) => each('drawAir', ctx, l, t, S);
  RB.lights = (src, glows) => each('lights', src, glows);
  RB.hud = (ctx, ts) => each('hud', ctx, ts);
  // a restart, a bust, a reset: drop whatever mini-game, menu or race was going (M.settle and Game.busted call this)
  RB.settle = () => each('settle');
  RB.cinema = (ctx, ts) => VH.Fireworks && VH.Fireworks.cinema && VH.Fireworks.drawCinema(ctx, ts);
  RB.markers = () => mods().flatMap(m => m.markers ? m.markers() : []);
  RB.targets = () => mods().flatMap(m => m.targets ? m.targets() : []);
  RB.prompt = base => { for (const m of mods()) { const p = m.prompt && m.prompt(base); if (p) return p; } return ''; }; // base: the prompt the game would show
  // the phone's thumb buttons: each module offers its actions through Round A's UI.contextActions ({ id, label,
  // priority }, id = the input it presses), high while a mini-game is on so it takes the big button; at most three show
  RB.touchActions = () => { const out = []; for (const m of mods()) { const a = m.touchActions && m.touchActions(); if (a) out.push(...[].concat(a)); } return out; };
  RB.registerTouch = () => { const UI = VH.UI; if (UI && UI.contextActions && !UI.contextActions.includes(RB.touchActions)) UI.contextActions.push(RB.touchActions); };
  RB.helpContext = () => { for (const m of mods()) { const p = m.helpContext && m.helpContext(); if (p) return p; } return ''; };
  // the controls overlay and the controls card
  const K = (key, touch) => () => (I.touchMode ? touch : key);
  const BOARD_ROWS = { shove: [K('SPACE', 'SLIDE'), 'BOARDED? SHOVE THEM OFF, OR GUN IT'], kev: [K('H, THEN E', 'HORN, THEN GET OUT'), 'HOON NEARBY: H TELLS THEM TO PULL OVER; ALONGSIDE, E BOARDS AND CUFFS. THEN SHORE, OR H: POLICE BOAT'] };
  const boardRow = () => (VH.Game && VH.Game.char === 'cop' ? BOARD_ROWS.kev : BOARD_ROWS.shove);
  RB.CONTROLS = {
    boat: { title: 'SPEEDBOAT', get rows() { return [[K('W / UP', 'DRAG'), 'THROTTLE (SHE PLANES ONCE SHE GETS GOING)'], [K('S / DOWN', 'DRAG BEHIND'), 'SLOW DOWN, REVERSE'], [K('A D / LEFT RIGHT', 'DRAG'), 'STEER'], ['WAVES', 'HIT A WAVE FACE FAST TO JUMP IT'], [K('H', 'HORN'), 'HORN'], [K('E', 'GET OUT'), 'STEP OFF AT A JETTY, BEACH OR RAMP'], ['POLICE', 'CARS CAN\'T FOLLOW YOU ONTO THE WATER. THE POLICE BOAT CAN'], boardRow()]; } },
    jetski: { title: 'JET SKI', get rows() { return [[K('W / UP', 'DRAG'), 'THROTTLE'], [K('S / DOWN', 'DRAG BEHIND'), 'SLOW DOWN, REVERSE'], [K('A D / LEFT RIGHT', 'DRAG'), 'STEER (TWITCHY!)'], [K('SPACE', 'SLIDE'), 'POWER SLIDE'], ['AIR', 'WAVES AND ORANGE RAMP BUOYS LAUNCH YOU'], [K('A D IN THE AIR', 'DRAG SIDEWAYS'), 'SPIN'], [K('W S IN THE AIR', 'DRAG UP/DOWN'), 'FRONTFLIP / BACKFLIP'], ['LANDING', 'LAND STRAIGHT TO SCORE; HALF A TURN IS A SPLASHY BAIL'], [K('SPACE / H IN THE RING', 'ACT / HORN IN THE RING'), I.touchMode ? 'WATER RACE: STOP IN THE START RING OFF THE RAMP; ACT RACES THE RIVALS, HORN RUNS A BUOY TIME TRIAL' : 'WATER RACE: STOP IN THE START RING OFF THE RAMP; SPACE RACES THE RIVALS, H RUNS A BUOY TIME TRIAL'], [K('E', 'GET OUT'), 'STEP OFF AT A JETTY, BEACH OR RAMP; OUT AT SEA, OVER THE SIDE TO SWIM'], boardRow()]; } },
    bmx: { title: 'BMX', rows: [[K('W / UP', 'DRAG'), 'PEDAL'], [K('A D / LEFT RIGHT', 'DRAG'), 'STEER'], [K('SPACE', 'HOP'), 'BUNNY-HOP'], [K('A D IN THE AIR', 'DRAG SIDEWAYS'), 'SPIN (360, 720...)'], [K('W S IN THE AIR', 'DRAG UP/DOWN'), 'FRONTFLIP / BACKFLIP'], [K('HOLD SPACE IN THE AIR', 'HOLD HOP'), 'TAILWHIP'], [K('HOLD SHIFT IN THE AIR', 'HOLD BOOST'), 'BARSPIN'], ['JAMS', 'STOP ON THE SKATE PARK OR DIRT JUMPS PAD: 60 SECONDS, BEST SCORE KEPT'], ['RAILS', 'LAND ON THE RAIL LINED UP TO GRIND']] },
    moto: { title: 'MOTORBIKE', rows: [[K('W / UP', 'DRAG'), 'THROTTLE'], [K('S / DOWN', 'DRAG BEHIND'), 'BRAKE, REVERSE'], [K('A D / LEFT RIGHT', 'DRAG'), 'STEER (SHE LEANS INTO IT)'], [K('HOLD SPACE + W', 'HOLD SKID + DRAG'), 'WHEELIE'], [K('HOLD SPACE + S', 'HOLD SKID, PULL BACK'), 'STOPPIE (AT SPEED)'], ['DIRT BIKE', 'GREAT ON SAND, GRASS AND THE DIRT JUMPS; AIR TRICKS LIKE THE BMX'], ['CRASH', 'COME OFF AT SPEED AND YOU TUCK AND ROLL (NOBODY HURT)'], [K('E', 'GET OUT'), 'GET OFF']] },
    hoops: { title: 'HOOPS', rows: [[K('W A S D', 'DRAG'), 'MOVE ABOUT THE COURT'], [K('HOLD SPACE', 'HOLD SHOOT'), 'RAISE THE SHOT; LET GO IN THE GREEN'], ['HORSE', 'MAKE ONE AND THE KID HAS TO MATCH IT FROM THERE. MISS A MATCH, TAKE A LETTER'], ['SHOOTOUT', '60 SECONDS. 3 POINTS FROM OUTSIDE THE ARC'], [K('E', 'GET OUT'), 'LEAVE THE COURT']] },
    bowls: { title: 'LAWN BOWLS', rows: [[K('A D / LEFT RIGHT', 'DRAG SIDEWAYS'), 'AIM'], [K('W S (OR H)', 'DRAG UP/DOWN OR HORN'), 'FOREHAND / BACKHAND (WHICH WAY IT CURVES)'], [K('HOLD SPACE', 'HOLD BOWL'), 'WEIGHT; LET GO TO BOWL'], ['SCORING', 'CLOSEST TO THE JACK TAKES THE END, ONE POINT A BOWL'], [K('E', 'GET OUT'), 'LEAVE THE GREEN']] },
    setup: { title: 'FIREWORKS: SETTING UP', rows: [[K('SPACE', 'ACT'), 'AT A ROCKET ON THE MAP, ON FOOT: START SETTING UP'], [K('SPACE', 'PLANT'), 'PLANT EACH OF THREE TUBES WHEN THE NEEDLE IS IN THE GREEN; A MISS RAISES SUSPICION'], ['SUSPICION', 'NEIGHBOURHOOD WATCH, PATROLS AND NOSY LOCALS RAISE IT. FULL BAR: THE SITE IS BLOWN'], [K('E', 'GET IN'), 'WALK AWAY TO STOP']] },
  };
  RB.addControls = function () { if (VH.UI && VH.UI.CONTROLS) Object.assign(VH.UI.CONTROLS, RB.CONTROLS); };
  RB.helpSections = () => [RB.CONTROLS.boat, RB.CONTROLS.jetski, RB.CONTROLS.moto, RB.CONTROLS.bmx, RB.CONTROLS.hoops, RB.CONTROLS.bowls, RB.CONTROLS.setup];
  RB.legend = function (ctx, w, y, ts) {
    const items = [['speedboat', 'SPEEDBOAT'], ['jetski', 'JET SKI'], ['buoy', 'WATER RACE'], ['moto', 'MOTORBIKE'], ['bmx', 'SKATE PARK'], ['dirt', 'DIRT JUMPS'], ['hoops', 'HOOPS'], ['bowls', 'BOWLS']];
    const widths = items.map(([, s]) => 12 * ts + U.textWidth(s, ts) + 8 * ts); const total = widths.reduce((a, b) => a + b, 0);
    const rows = total > w - 8 ? [items.slice(0, 4), items.slice(4)] : [items];
    rows.forEach((row, ri) => {
      const ws = row.map(([, s]) => 12 * ts + U.textWidth(s, ts) + 8 * ts); let x = Math.round(w / 2 - ws.reduce((a, b) => a + b, 0) / 2); const yy = y - (rows.length - 1 - ri) * 10 * ts;
      row.forEach(([k, s], i) => { RB.icon(ctx, k, x + 4 * ts, yy + 3 * ts, ts); U.text(ctx, s, x + 10 * ts, yy, { color: '#f4f0ff', scale: ts }); x += ws[i]; });
    });
  };

  // ================= Round B spawn slots =================
  // Everything Round B puts in the world sits on a baked spawn slot (tools/bake_slots.mjs, Round B's kinds in
  // tools/bake_slots_rb.mjs), each validated at bake time, and is picked through Round A's VH.Spawn.pick: boat ramps
  // (slipway), moorings, the skate park's jam pad, courts, greens, the club, the scrub jumps, fireworks launch sites and
  // stashes, the race start, its gates and ramp buoys, kerbs for parked bikes and gophers, open water for boats that
  // turn up. Nothing is placed at a raw coordinate.
  RB.pick = (kind, o = {}) => VH.Spawn.pick(kind, o);
  RB.slots = (kind, extra) => (VH.Spawn.kinds[kind] || []).filter(s => extra == null || s.extra === extra).map(s => ({ x: s.x, y: s.y, a: s.a, r: s.r, extra: s.extra, slot: s }));
  RB.one = (kind, extra) => RB.slots(kind, extra)[0] || null;
  // the kinds Round B can't do without (the playthrough harness asserts this list is empty)
  RB.NEEDS = [['slipway', 1], ['skatepark', 1], ['dirt_track', 1], ['bowls_club', 1], ['launch_site', 4], ['stash', 2], ['race_start', 1], ['race_mark', 3], ['ramp_buoy', 1], ['mooring', 1], ['open_water', 1]];
  // where a test starts beside a track (main.js &atPlace=): a few metres off its jam pad
  RB.startAt = name => { const S = VH.Sports; if (name === 'town') { const P = G().places; return VH.Spawn.pick('footpath', { near: P.fishShop, maxDist: 200, nearest: true, access: 'foot', optional: true }); } // a footpath slot on Ocean St, by the fish shop
    if (name === 'bighouse') { const f = VH.Fireworks && (VH.Fireworks.SITES || []).find(q => q.id === 'bighouse'); return f ? { x: f.x, y: f.y } : null; } // (its site is a baked front-yard slot)
    const k = name === 'dirt' ? S.dirt : name === 'skate' ? S.skate : null; if (!k) return null; return k.kind === 'dirt' ? VH.Spawn.around(k.slot, 22, Math.atan2(k.pad.y - k.slot.y, k.pad.x - k.slot.x) + 0.5) : VH.Spawn.around(k.pad, 5, 0); };
  RB.checkSlots = () => RB.NEEDS.filter(([k, n]) => VH.Spawn.count(k) < n).map(([k, n]) => `${k} (${VH.Spawn.count(k)}/${n})`);

  // ================= air tricks (jet ski, BMX) =================
  // Hold a direction to rotate; let go mid-turn and it finishes the turn it's on. Land with every axis on a whole
  // turn to score; land halfway round and it's a bail (a splash or a tumble, nobody hurt).
  const T = VH.Tricks = {};
  T.RATE = { spin: 9, flip: 8.5, whip: 12, bar: 13 };
  const TAU = U.TAU;
  T.air = function (v, dt, inp) {
    const ax = { spin: inp.spin || 0, flip: inp.flip || 0, whip: inp.whip ? 1 : 0, bar: inp.bar ? 1 : 0 };
    // keys already held at take-off (the throttle you rode up the ramp with) don't count until you let go of them once
    const k = v.trick || (v.trick = { spin: 0, flip: 0, whip: 0, bar: 0, dir: { spin: 0, flip: 0, whip: 0, bar: 0 }, t: 0, held: { spin: Math.sign(ax.spin), flip: Math.sign(ax.flip), whip: ax.whip, bar: ax.bar } });
    k.t += dt;
    for (const a in ax) { if (Math.sign(ax[a]) !== k.held[a]) k.held[a] = 0; else if (k.held[a]) ax[a] = 0; }
    for (const a of ['spin', 'flip', 'whip', 'bar']) {
      const rate = T.RATE[a] * (v.def && v.def.jetski ? 0.9 : v.def && v.def.bike ? 1.3 : 1); // bikes are light and the air is short
      if (Math.abs(ax[a]) > 0.3) { k.dir[a] = Math.sign(ax[a]); k[a] += rate * k.dir[a] * dt; continue; }
      // released: finish the turn we're on (or settle back if we barely started)
      const r = k[a] / TAU; const frac = r - Math.round(r);
      if (Math.abs(frac) < 0.02) { k[a] = Math.round(r) * TAU; continue; }
      const target = Math.abs(frac) < 0.12 ? Math.round(r) * TAU : (k.dir[a] >= 0 ? Math.ceil(r) : Math.floor(r)) * TAU;
      const step = rate * dt; const d = target - k[a]; k[a] = Math.abs(d) <= step ? target : k[a] + Math.sign(d) * step;
    }
  };
  T.names = function (k) {
    const n = a => Math.round(Math.abs(k[a]) / TAU); const out = []; let pts = 0;
    const s = n('spin'); if (s) { out.push((s * 360) + (s > 1 ? ' SPIN' : '')); pts += 100 * s * (s + 1) / 2; }
    const f = n('flip'); if (f) { out.push((f > 1 ? (f === 2 ? 'DOUBLE ' : 'TRIPLE ') : '') + (k.flip > 0 ? 'FRONTFLIP' : 'BACKFLIP')); pts += 250 * f * (f + 1) / 2; }
    const w = n('whip'); if (w) { out.push((w > 1 ? w + 'X ' : '') + 'TAILWHIP'); pts += 150 * w; }
    const b = n('bar'); if (b) { out.push((b > 1 ? b + 'X ' : '') + 'BARSPIN'); pts += 90 * b; }
    if (out.length > 1) pts = Math.round(pts * (1 + 0.5 * (out.length - 1)));
    return { out, pts };
  };
  // landing: returns { ok, pts, label } and does the celebration or the bail
  T.land = function (v, air) {
    const k = v.trick; v.trick = null; if (!k) return null;
    const off = a => { const r = Math.abs(k[a]) / TAU; return Math.abs(r - Math.round(r)) * TAU; };
    const bad = ['spin', 'flip', 'whip', 'bar'].some(a => off(a) > 0.6);
    const { out, pts } = T.names(k); const g = G(); const mine = v === (g.player && g.player.vehicle);
    if (bad) {
      v.bailT = 1.2; v.vx *= 0.15; v.vy *= 0.15; v.av = 0;
      if (v.boat) { FX.splash(v.x, v.y, 30); sfx('splash'); } else { FX.dust(v.x, v.y, '#c8bfa0', 10); sfx('thud'); }
      if (mine) { FX.text(v.x, v.y - 5, U.pick(['BAIL! NO HARM DONE', 'WIPEOUT!', 'SPLAT. UP YOU GET.']), '#ff9a30'); g.toast(v.boat ? 'BAILED. YOU CLAMBER BACK ON, SOAKED BUT FINE' : 'BAILED. YOU DUST YOURSELF OFF', '#ff9a30'); }
      return { ok: false, pts: 0, label: '' };
    }
    if (!out.length) return { ok: true, pts: 0, label: '' };
    const label = out.join(' + ');
    if (mine) { FX.text(v.x, v.y - 6, `${label} +${pts}`, '#ffd23a', { big: pts >= 400 }); sfx('collect'); if (pts >= 400) FX.confetti(v.x, v.y, 20); }
    const best = store('bestTrick', 0); if (mine && pts > best) { save('bestTrick', pts); if (best) g.toast(`BEST TRICK EVER: ${label} (${pts})`, '#9be15d'); }
    if (mine) { g.cash += Math.max(1, Math.round(pts / 100)); for (const m of mods()) m.onTrick && m.onTrick(v, pts, label); }
    return { ok: true, pts, label };
  };
  // draw a vehicle sprite mid-trick: spin turns it, a flip shortens it (and shows the underside past 90 degrees)
  T.drawSprite = function (ctx, spr, sx, sy, ang, k, scale = 1) {
    const flip = k ? k.flip : 0; const c = Math.cos(flip); const spin = k ? k.spin : 0;
    ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(ang + spin);
    ctx.scale(Math.max(0.15, Math.abs(c)) * scale, scale);
    ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
    if (c < 0) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#1a1a24'; ctx.fillRect(-spr.width / 2, -spr.height / 2, spr.width, spr.height); ctx.globalAlpha = 1; }
    ctx.restore();
  };
  // a swoosh round the rider so a rotation reads at a glance: a ring for a spin, a tall loop for a flip
  T.drawSwoosh = function (ctx, sx, sy, k, ang) {
    if (!k) return; const r = 9; ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.lineWidth = 1;
    const arc = (rx, ry, rot, a0, col) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, rot, a0, a0 + 4.2); ctx.stroke(); };
    if (Math.abs(k.spin) > 0.2) arc(r, r * 0.8, 0, k.spin * (k.dir.spin || 1), 'rgba(255,210,58,0.8)');
    if (Math.abs(k.flip) > 0.2) arc(r * 0.35, r * 1.15, ang, k.flip, 'rgba(56,224,200,0.85)');
    if (Math.abs(k.whip) > 0.2) arc(r * 0.9, r * 0.5, ang, k.whip, 'rgba(255,79,160,0.8)');
    ctx.restore();
  };

  // ================= the sports module =================
  const S = VH.Sports = { skate: null, dirt: null, courts: [], green: null, jam: null, mini: null };

  // ---- geometry helpers ----
  const centroid = p => { let x = 0, y = 0; const n = p.length / 2; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; } return { x: x / n, y: y / n }; };
  // an oriented box from a polygon: the longest edge sets the long axis
  function obox(p) {
    let best = 0, ang = 0; const n = p.length;
    for (let i = 0; i + 3 < n; i += 2) { const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); if (L > best) { best = L; ang = Math.atan2(p[i + 3] - p[i + 1], p[i + 2] - p[i]); } }
    const ux = Math.cos(ang), uy = Math.sin(ang); let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; const c = centroid(p);
    for (let i = 0; i < n; i += 2) { const dx = p[i] - c.x, dy = p[i + 1] - c.y; const a = dx * ux + dy * uy, b = -dx * uy + dy * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const mx = (a0 + a1) / 2, my = (b0 + b1) / 2;
    return { x: c.x + ux * mx - uy * my, y: c.y + uy * mx + ux * my, ang, L: a1 - a0, Wd: b1 - b0, ux, uy };
  }
  const local = (o, x, y) => { const dx = x - o.x, dy = y - o.y; return [dx * o.ux + dy * o.uy, -dx * o.uy + dy * o.ux]; };
  const world = (o, a, b) => ({ x: o.x + o.ux * a - o.uy * b, y: o.y + o.uy * a + o.ux * b });
  const inBox = (o, x, y, m = 0) => { const [a, b] = local(o, x, y); return Math.abs(a) <= o.L / 2 + m && Math.abs(b) <= o.Wd / 2 + m; };
  const walkable = (x, y) => { const g = W.groundAt(x, y); return g !== W.GC.BUILDING && g !== W.GC.SEA && g !== W.GC.WATER; };

  S.init = function () {
    const F = W.features || {}; const P = G().places;
    // ---- skate park: a bowl, two quarter pipes facing each other, a kicker and a flat rail ----
    const sk = (F.skate || [])[0];
    const padSlot = RB.one('skatepark'); // the jam pad, beside the park
    const box = sk ? obox(sk.p) : padSlot ? { x: padSlot.x, y: padSlot.y, ang: 0, L: 28, Wd: 26, ux: 1, uy: 0 } : null;
    S.skate = null; if (box) {
    const L = Math.max(18, box.L), Wd = Math.max(16, box.Wd);
    S.skate = { box: { ...box, L, Wd }, name: 'THE FORESHORE SKATE PARK', kind: 'skate', obs: [] };
    const o = S.skate.box, ob = S.skate.obs;
    ob.push({ k: 'bowl', ...world(o, -L * 0.22, -Wd * 0.18), r: Math.min(6, Wd * 0.26) });
    ob.push({ k: 'qp', ...world(o, L / 2 - 1.6, Wd * 0.2), a: o.ang, L: 3, Wd: 6 });
    ob.push({ k: 'qp', ...world(o, -L / 2 + 1.6, Wd * 0.28), a: o.ang + Math.PI, L: 3, Wd: 6 });
    ob.push({ k: 'kick', ...world(o, L * 0.12, Wd * 0.25), a: o.ang, L: 2.6, Wd: 3, lift: 1.0 });
    ob.push({ k: 'kick', ...world(o, L * 0.15, -Wd * 0.25), a: o.ang + Math.PI, L: 2.6, Wd: 3, lift: 1.0 });
    const ra = world(o, -L * 0.25, Wd * 0.38), rb = world(o, L * 0.2, Wd * 0.38); ob.push({ k: 'rail', ax: ra.x, ay: ra.y, bx: rb.x, by: rb.y });
    S.skate.pad = padSlot || world(o, 0, 0);
    }
    // ---- the dirt jumps: an invented track in the scrub west of the oval (no BMX track is mapped) ----
    const dc = RB.pick('dirt_track', { near: S.skate ? S.skate.pad : G().places.oval, nearest: true, optional: true }); S.dirt = null; if (dc) { const dang = 0.12; /* the nearest room in the bush */ const dux = Math.cos(dang), duy = Math.sin(dang);
    const D = S.dirt = { box: { x: dc.x, y: dc.y, ang: dang, L: 46, Wd: 24, ux: dux, uy: duy }, slot: dc, name: 'THE SCRUB JUMPS', kind: 'dirt', obs: [] };
    // an oval loop: two straights with a pair of doubles each, berms at the ends
    D.loop = []; for (let i = 0; i < 48; i++) { const a = i / 48 * U.TAU; D.loop.push(world(D.box, Math.cos(a) * 19, Math.sin(a) * 8.5)); }
    for (const [s, side] of [[-9, 1], [5, 1], [9, -1], [-5, -1]]) {
      const lip = world(D.box, s, side * 8.5), land = world(D.box, s + side * 8.5, side * 8.5);
      D.obs.push({ k: 'kick', ...lip, a: dang + (side > 0 ? 0 : Math.PI), L: 2.4, Wd: 3.2, lift: 0.95, dirt: true, land });
    }
    D.pad = world(D.box, -19, 0);
    } // (no room baked for the jumps: no dirt track)
    // ---- basketball courts ----
    const kids = ['MIKAYLA', 'TJ', 'RUBY', 'ZAC', 'IMOGEN'];
    S.courts = (F.courts || []).map((c, i) => ({ c, i, slot: RB.one('court', i) })).filter(o => o.slot).map(({ c, i, slot }) => {
      const b = c.p ? obox(c.p) : { x: c.x, y: c.y, ang: 0, L: 15, Wd: 14, ux: 1, uy: 0 };
      const half = b.L / b.Wd < 1.4 && !(c.hoops > 1); // a half-court has its one hoop on the long side's end
      const hoop = world(b, b.L / 2 - 1.4, 0); const face = b.ang + Math.PI;
      return { id: i, box: b, hoop, face, half, kid: kids[i % kids.length], slot };
    });
    // ---- the bowls green (an invented club on the mapped green: the Bay Bowls & Bickering Club) ----
    const club = (F.clubs || [])[0]; const door = RB.one('bowls_club'); const cc = club ? centroid(club.p) : door;
    const greens = (F.bowls || []).map((g, i) => ({ g, c: centroid(g.p), slot: RB.one('bowls_green', i) })).filter(o => o.slot).sort((a, b) => dist(a.c, cc) - dist(b.c, cc));
    if (greens.length) {
      // the longest 5 m-wide rink that fits on the green (inside its outline, clear of the clubhouse), either way round
      const gp = greens[0].g.p, gb = obox(gp); let best = null;
      const fits = (o) => { for (let a = -o.L / 2; a <= o.L / 2 + 0.01; a += 2) for (const b of [-3.5, 0, 3.5]) { const q = world(o, a, b); if (!U.pointInPoly(q.x, q.y, gp) || W.groundAt(q.x, q.y) === W.GC.BUILDING) return false; } return true; };
      for (const ang of [gb.ang, gb.ang + Math.PI / 2]) {
        const ux = Math.cos(ang), uy = Math.sin(ang);
        for (let len = 34; len >= 16 && !(best && best.L >= len); len -= 2) for (let ox = -30; ox <= 30; ox += 3) for (let oy = -30; oy <= 30; oy += 3) {
          const o = { x: gb.x + ox, y: gb.y + oy, ang, L: len, Wd: 5, ux, uy }; if (fits(o) && (!best || len > best.L)) best = o;
        }
      }
      const rink = best || { ...gb, L: Math.min(34, gb.L - 6), Wd: 5 }; const len = rink.L;
      // the mat sits 2 m in from one end
      S.green = { box: rink, club: club ? { p: club.p, ...cc } : null, door, slot: greens[0].slot, name: 'THE BAY BOWLS & BICKERING CLUB' }; // door: the clubhouse sign and the secretary
      S.green.mat = world(S.green.box, -len / 2 + 2, 0);
      S.green.regulars = [world(S.green.box, -len / 2 + 8, 4.5), world(S.green.box, -len / 2 + 10.5, 5)]; // beside the rink, out of the mat's prompt range
    }
    S.bests = { skate: store('jam:skate', 0), dirt: store('jam:dirt', 0) };
  };
  S.newNight = function () {
    S.jam = null; S.mini = null; S.grind = null; S.regulars = []; S.menu = null; S.jamCool = 0;
    const g = G();
    // a BMX left at the skate park and one at the dirt jumps
    for (const [park, col] of [[S.skate, '#ff4fa0'], [S.dirt, '#38e0c8']]) {
      if (!park) continue; const at = park.kind === 'dirt' ? VH.Spawn.around(park.slot, 25, Math.atan2(park.pad.y - park.slot.y, park.pad.x - park.slot.x) + 0.25) : VH.Spawn.around(park.pad, 7, park.box.ang); // just outside the jam ring
      const v = VH.Spawn.vehicle('bmx', { ...at, a: park.box.ang }, { colour: col, parked: true }); g.specials['bmx_' + park.kind] = v;
    }
    // two club regulars by the bowls green (at night they're having a cheeky roll-up under the lights)
    // out of the clubhouse door (its baked slot), strolling to their spot beside the rink, clear of the mat
    if (S.green) S.regulars = S.green.regulars.map((q, i) => { const sl = S.green.door || S.green.slot; const p = VH.Spawn.ped('retiree', sl, { tag: 'regular', shirt: '#f4f4f0', hat: i ? 'sunhat' : 'bucket' }, { d: 1 + i, a: i * 2 }); p.state = 'goto'; p.gx = q.x; p.gy = q.y; p.gotoSpeed = 1.1; p.ang = S.green.box.ang + Math.PI / 2; p.name = i ? 'NOEL' : 'BEV'; return p; });
  };

  // ================= BMX: parks, jams, tricks, rails =================
  const bikeInput = () => ({ spin: (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0) || (I.stick.active && Math.abs(I.stick.x) > 0.5 ? Math.sign(I.stick.x) : 0), flip: (I.down('up') ? 1 : 0) - (I.down('down') ? 1 : 0) || (I.stick.active && Math.abs(I.stick.y) > 0.5 ? -Math.sign(I.stick.y) : 0), whip: I.down('action'), bar: I.down('run') });
  function bikeAir(dt) { // `this` is the bike; runs while it's airborne
    if (this.driver !== 'player') return;
    T.air(this, dt, bikeInput());
    if (this.qpTurn) { const st = Math.sign(this.qpTurn) * Math.min(Math.abs(this.qpTurn), 6 * dt); this.ang += st; this.qpTurn -= st; }
  }
  S.bikeDraw = function (...a) { return bikeDraw.apply(this, a); };
  function bikeDraw(ctx, left, top, S2) {
    if (!this.trick && !(S.grind && S.grind.v === this)) return false;
    const sx = (this.x - left) * S2, sy = (this.y - top) * S2 - this.z * S2;
    ctx.fillStyle = 'rgba(20,20,45,0.35)'; ctx.beginPath(); ctx.ellipse(Math.round((this.x - left) * S2 + this.z * 2), Math.round((this.y - top) * S2 + this.z * 2), 4, 2, this.ang, 0, U.TAU); ctx.fill();
    const k = this.trick; const scale = 1 + this.z * 0.04;
    // tailwhip: the frame swings round the bars while the rider stays put
    if (k && Math.abs(Math.sin(k.whip / 2)) > 0.05) T.drawSprite(ctx, this.sprite, sx, sy, this.ang + k.whip, { flip: k.flip, spin: k.spin }, scale);
    else T.drawSprite(ctx, this.sprite, sx, sy, this.ang, k, scale);
    if (k && k.bar) { const a = this.ang + k.spin + k.bar; const hx = sx + Math.cos(this.ang + k.spin) * 3, hy = sy + Math.sin(this.ang + k.spin) * 3; ctx.fillStyle = '#c0c0c8'; ctx.fillRect(Math.round(hx + Math.cos(a + 1.57) * 2), Math.round(hy + Math.sin(a + 1.57) * 2), 1, 1); ctx.fillRect(Math.round(hx - Math.cos(a + 1.57) * 2), Math.round(hy - Math.sin(a + 1.57) * 2), 1, 1); }
    const c = VH.Shops.look(G().char); T.drawSprite(ctx, SP.person(c.shirt, c.hair, 0, this.def.motor ? { hat: 'helmet', helmetCol: '#ff7a2f' } : { hat: c.hat, sunnies: c.sunnies }), sx - Math.cos(this.ang) * 1, sy - Math.sin(this.ang) * 1, this.ang, k, 0.7 * scale);
    T.drawSwoosh(ctx, sx, sy, k, this.ang);
    return true;
  }
  S.parks = () => [S.skate, S.dirt].filter(Boolean);
  S.parkAt = (x, y) => S.parks().find(p => inBox(p.box, x, y, 3));
  function launch(v, lift, speed) { v.vz = Math.min(12, speed * lift); v.z = 0.01; v.air = 0; v.trick = null; sfx('whoosh', { pitch: 1.3, vol: 0.5 }); }
  S.updateBike = function (dt) {
    const v = pv(); if (!v || !v.def.bike) return;
    v.airHook = bikeAir; v.drawHook = bikeDraw;
    const park = S.parkAt(v.x, v.y);
    if (park && park.kind === 'dirt' && v.z === 0 && inBox(park.box, v.x, v.y)) { const f = v.fwdSpeed; if (f > 0) { v.vx += Math.cos(v.ang) * f * 0.42 * dt; v.vy += Math.sin(v.ang) * f * 0.42 * dt; } } // packed dirt rolls fast
    // a grind: locked to the rail until the end, then pop off
    const gr = S.grind;
    if (gr && gr.v === v) {
      gr.s += gr.sp * dt; const L = Math.hypot(gr.r.bx - gr.r.ax, gr.r.by - gr.r.ay); const t = gr.dir > 0 ? gr.s / L : 1 - gr.s / L;
      v.x = gr.r.ax + (gr.r.bx - gr.r.ax) * t; v.y = gr.r.ay + (gr.r.by - gr.r.ay) * t; v.vx = Math.cos(v.ang) * gr.sp; v.vy = Math.sin(v.ang) * gr.sp; v.z = 0;
      gr.pts += dt * 120; if (Math.random() < 0.6) FX.sparks(v.x, v.y, 1, v.ang + Math.PI);
      if (gr.s >= L) { S.grind = null; const pts = Math.round(gr.pts); FX.text(v.x, v.y - 5, `RAIL GRIND +${pts}`, '#ffd23a'); S.score(pts, 'GRIND'); launch(v, 0.3, gr.sp); }
      return;
    }
    if (!park || v.z > 0) return;
    const sp = v.speed; if (sp < 2.5) return;
    const ux = v.vx / sp, uy = v.vy / sp;
    for (const ob of park.obs) {
      if (ob.k === 'kick' || ob.k === 'qp') {
        const ca = Math.cos(ob.a), sa = Math.sin(ob.a); const lx = (v.x - ob.x) * ca + (v.y - ob.y) * sa, ly = -(v.x - ob.x) * sa + (v.y - ob.y) * ca;
        if (lx > ob.L / 2 - 0.9 && lx < ob.L / 2 + 0.2 && Math.abs(ly) < ob.Wd / 2 && ux * ca + uy * sa > 0.55) {
          if (ob.k === 'qp') { launch(v, 1.1, sp); v.vx *= -0.22; v.vy *= -0.22; v.qpTurn = Math.PI; }
          else launch(v, ob.lift, sp);
          if (ob.land) v.aimLand = ob.land; return;
        }
      } else if (ob.k === 'bowl') {
        const dx = v.x - ob.x, dy = v.y - ob.y, d = Math.hypot(dx, dy); const rv = (v.vx * dx + v.vy * dy) / (d || 1);
        if (d > ob.r - 0.9 && d < ob.r + 0.3 && rv > 3.2) { launch(v, 0.85, rv + sp * 0.3); const nx = dx / d, ny = dy / d; v.vx -= nx * rv * 1.25; v.vy -= ny * rv * 1.25; FX.dust(v.x, v.y, '#c8c8c8', 3); return; }
      }
    }
  };
  // a landing on the rail lined up starts a grind; a landing near a dirt double's landing mound keeps the speed
  S.onBikeLand = function (v) {
    const park = S.parkAt(v.x, v.y); if (!park) return;
    for (const ob of park.obs) if (ob.k === 'rail') {
      const [d, , , t] = U.segPointDist(v.x, v.y, ob.ax, ob.ay, ob.bx, ob.by); const ra = Math.atan2(ob.by - ob.ay, ob.bx - ob.ax); const al = Math.cos(v.ang - ra);
      if (d < 1.1 && Math.abs(al) > 0.82 && v.speed > 3 && t > 0.02 && t < 0.95) { const L = Math.hypot(ob.bx - ob.ax, ob.by - ob.ay); S.grind = { v, r: ob, dir: al > 0 ? 1 : -1, s: al > 0 ? t * L : (1 - t) * L, sp: Math.max(5, v.speed), pts: 0 }; v.ang = al > 0 ? ra : ra + Math.PI; sfx('clang', { pitch: 2, vol: 0.4 }); FX.text(v.x, v.y - 4, 'GRIND!', '#38e0c8'); return; }
    }
    if (v.aimLand) { const ok = dist(v, v.aimLand) < 3.5; FX.text(v.x, v.y - 3, ok ? 'SMOOTH!' : 'CASED IT!', ok ? '#9be15d' : '#ff9a30'); if (!ok) { v.vx *= 0.5; v.vy *= 0.5; } v.aimLand = null; }
  };
  S.score = function (pts, label) { if (S.jam) { S.jam.score += pts; S.jam.last = label; } };
  S.onTrick = function (v, pts, label) { if (v.def && v.def.bike) S.score(pts, label); };
  S.updateJam = function (dt) {
    const g = G(), v = pv();
    if (S.jam) {
      S.jam.t -= dt; const park = S.jam.park;
      if (!v || !v.def.bike) { S.jam = null; g.toast('JAM OVER: YOU GOT OFF THE BIKE', '#ff9a30'); return; }
      if (S.jam.t <= 0 || dist(v, park.box) > 90) {
        const sc = S.jam.score, best = store('jam:' + park.kind, 0); const pb = sc > best; if (pb) { save('jam:' + park.kind, sc); S.bests[park.kind] = sc; }
        const pay = Math.min(60, Math.round(sc / 80)); g.cash += pay; sfx(pb ? 'win' : 'cash'); if (pb) FX.confetti(v.x, v.y, 40);
        g.toast(`${park.name} JAM: ${sc}${pb ? ' NEW HIGH SCORE!' : ' (BEST ' + best + ')'} +$${pay}`, pb ? '#9be15d' : '#38e0c8'); S.jam = null;
      }
      return;
    }
    if (S.jamCool > 0) S.jamCool -= dt; // a short breather between jams (it used to wait for you to leave the pad, which could strand you on it)
    if (!v || !v.def.bike || v.speed > 2) return;
    for (const park of S.parks()) if (dist(v, park.pad) < 5.5 && !(S.jamCool > 0)) { S.jam = { park, t: 60, score: 0, last: '' }; S.jamCool = 4; sfx('boost'); g.toast(`${park.name}: 60-SECOND JAM. TRICKS IN THE AIR!`, '#38e0c8'); }
  };

  // ================= hoops =================
  const HORSE = 'HORSE';
  function courtAt(x, y) { return S.courts.find(c => inBox(c.box, x, y, 0.5)); }
  function newBall(c) { return { state: 'held', x: 0, y: 0, z: 0, t: 0 }; }
  S.startHoops = function (c, mode) {
    const g = G(); const pl = g.player;
    const m = S.mini = { kind: 'hoops', c, mode, ball: newBall(c), meter: null, made: 0, shots: 0, streak: 0, pts: 0, t: mode === 'shootout' ? 60 : 0, back: 0 };
    if (mode === 'horse') {
      const sp = world(c.box, c.box.L / 2 - 6, 3); const kid = VH.Spawn.ped('schoolie', c.slot, { tag: 'hoops', shirt: '#ffd23a', hat: 'cap' }, { d: dist(c.slot, sp), a: Math.atan2(sp.y - c.slot.y, sp.x - c.slot.x) }); kid.state = 'idle'; kid.name = c.kid; // on the court's slot
      m.kid = kid; m.horse = { you: 0, kid: 0, setter: 'you', spot: null, phase: 'set' }; kid.say(U.pick(["YOU'RE ON. LOSER BUYS CHIPS.", 'HORSE? EASY.', "I DON'T MISS."]), 2.5);
    }
    sfx('menu'); g.toast(mode === 'horse' ? `HORSE AGAINST ${c.kid}: YOU SET FIRST` : mode === 'shootout' ? '60-SECOND SHOOTOUT: GO!' : 'SHOOT-AROUND. HOLD SPACE, LET GO IN THE GREEN', '#ffd23a');
    void pl;
  };
  const idealPow = d => U.clamp(0.28 + d * 0.075, 0.3, 0.97);
  function shoot(m, from, p, who) {
    const c = m.c; const d = Math.hypot(c.hoop.x - from.x, c.hoop.y - from.y);
    const ideal = idealPow(d); const err = p - ideal; const tol = 0.07 + Math.max(0, 2.2 - d) * 0.05;
    const make = Math.abs(err) < tol; const rim = !make && Math.abs(err) < tol * 2.2;
    const ax = (c.hoop.x - from.x) / (d || 1), ay = (c.hoop.y - from.y) / (d || 1);
    const over = make ? 0 : U.clamp(err * 7, -2.5, 2.5) + (rim ? Math.sign(err || 1) * 0.3 : 0);
    const tx = c.hoop.x + ax * over + (make ? 0 : U.rand(-0.4, 0.4)), ty = c.hoop.y + ay * over;
    m.ball = { state: 'flight', fx: from.x, fy: from.y, tx, ty, t: 0, dur: 0.55 + d * 0.06, peak: 3.6 + d * 0.28, make, rim, who, three: d > 6.75, d };
    m.shots++; sfx('whoosh', { pitch: 1.5, vol: 0.4 });
  }
  function kidShot(m, d) { return Math.random() < U.clamp(0.78 - d * 0.065, 0.22, 0.82); }
  function shotLanded(m) {
    const b = m.ball, g = G(), c = m.c; const you = b.who === 'you';
    if (b.make) { sfx('collect'); FX.text(c.hoop.x, c.hoop.y - 4, U.pick(b.d < 2 ? ['LAY-UP!', 'EASY TWO'] : b.three ? ['FROM DOWNTOWN!', 'SPLASH!'] : ['SWISH!', 'BUCKET!', 'NOTHING BUT NET']), you ? '#9be15d' : '#ffd23a'); m.netT = 0.6; }
    else { sfx(b.rim ? 'clang' : 'thud', { pitch: b.rim ? 2.4 : 1.6, vol: 0.5 }); FX.text(c.hoop.x, c.hoop.y - 4, b.rim ? U.pick(['RIM OUT!', 'SO CLOSE']) : U.pick(['AIRBALL!', 'BRICK!', 'OFF THE BOARD']), '#ff9a30'); }
    if (m.mode === 'around' && you) { m.streak = b.make ? m.streak + 1 : 0; const best = store('hoops:streak', 0); if (m.streak > best) { save('hoops:streak', m.streak); if (m.streak >= 3) g.toast(`BEST STREAK: ${m.streak} IN A ROW`, '#9be15d'); } if (b.make) g.cash += 1; }
    if (m.mode === 'shootout' && you && b.make) m.pts += b.three ? 3 : 2;
    if (m.mode === 'horse') horseStep(m, b);
    m.ball = { state: 'back', t: 0, x: b.tx, y: b.ty, z: 0 }; m.back = m.mode === 'shootout' ? 0.45 : 0.9;
  }
  function horseStep(m, b) {
    const h = m.horse, g = G(), you = b.who === 'you';
    const other = you ? 'kid' : 'you';
    if (h.phase === 'set') {
      if (b.make) { h.phase = 'match'; h.spot = { x: b.fx, y: b.fy }; if (you) m.kid.say(U.pick(['OK OK, WATCH THIS', 'PFFT, EASY', 'LUCKY...']), 2); else g.toast(`${m.kid.name} MADE IT. STAND ON THE SPOT AND MATCH IT`, '#ffd23a'); }
      else { h.setter = other; h.spot = null; if (!you) g.toast(`${m.kid.name} MISSED. YOUR SHOT`, '#9be15d'); else m.kid.say('MY TURN TO SET', 2); }
    } else {
      if (!b.make) { h[b.who]++; const L = HORSE.slice(0, h[b.who]); if (you) g.toast(`YOU MISSED THE MATCH: ${L}`, '#ff9a30'); else { m.kid.say(U.pick(['NOOO', 'WIND!', 'THAT DOESN\'T COUNT']), 2); g.toast(`${m.kid.name} GETS A LETTER: ${L}`, '#9be15d'); } }
      h.phase = 'set'; h.spot = null;
    }
    if (h.you >= 5 || h.kid >= 5) {
      const won = h.kid >= 5; m.over = true; sfx(won ? 'win' : 'fail');
      if (won) { g.cash += 15; save('hoops:horseWins', store('hoops:horseWins', 0) + 1); FX.confetti(g.player.x, g.player.y, 30); m.kid.say('RUN IT BACK TOMORROW?', 3); g.toast(`YOU BEAT ${m.kid.name} AT HORSE! +$15`, '#9be15d'); }
      else { m.kid.say(U.pick(['H-O-R-S-E. GG!', 'TOLD YOU I DON\'T MISS']), 3); g.toast(`${m.kid.name} WINS. YOU'RE A HORSE`, '#ff9a30'); }
    }
  }
  S.updateHoops = function (dt) {
    const m = S.mini, g = G(), pl = g.player, c = m.c;
    if (m.netT > 0) m.netT -= dt;
    if (m.mode === 'shootout' && !m.over) { m.t -= dt; if (m.t <= 0) { m.over = true; const best = store('hoops:shootout', 0); const pb = m.pts > best; if (pb) save('hoops:shootout', m.pts); const pay = Math.round(m.pts / 3); g.cash += pay; sfx(pb ? 'win' : 'cash'); g.toast(`SHOOTOUT: ${m.pts} POINTS${pb ? ' NEW HIGH SCORE!' : ' (BEST ' + best + ')'} +$${pay}`, pb ? '#9be15d' : '#38e0c8'); } }
    const b = m.ball;
    if (b.state === 'flight') {
      b.t += dt; const k = Math.min(1, b.t / b.dur); b.x = U.lerp(b.fx, b.tx, k); b.y = U.lerp(b.fy, b.ty, k); b.z = U.lerp(2, 3.05, k) + 4 * (b.peak - 3) * k * (1 - k);
      if (k >= 1) shotLanded(m);
    } else if (b.state === 'back') { b.t += dt; if (b.t > m.back) m.ball = { state: m.mode === 'horse' && m.horse.setter === 'kid' && m.horse.phase === 'set' || (m.mode === 'horse' && m.horse.phase === 'match' && m.horse.setter === 'you') ? 'kid' : 'held', t: 0 }; }
    // the kid's turn: walk to a spot (or the spot to match) and shoot
    if (m.mode === 'horse' && !m.over && m.ball.state === 'kid') {
      const h = m.horse, kid = m.kid;
      if (!h.kidGo) { h.kidGo = h.phase === 'match' ? h.spot : (() => { for (let i = 0; i < 20; i++) { const a = U.rand(-1.3, 1.3), r = U.rand(2.2, 7.4); const q = { x: c.hoop.x + Math.cos(c.face + a) * r, y: c.hoop.y + Math.sin(c.face + a) * r }; if (inBox(c.box, q.x, q.y)) return q; } return world(c.box, 0, 0); })(); }
      kid.state = 'goto'; kid.gx = h.kidGo.x; kid.gy = h.kidGo.y;
      if (dist(kid, h.kidGo) < 0.5) { kid.state = 'idle'; kid.ang = Math.atan2(c.hoop.y - kid.y, c.hoop.x - kid.x); h.kidT = (h.kidT || 0) + dt; if (h.kidT > 0.8) { const d = dist(kid, c.hoop); const mk = kidShot(m, d); shoot(m, kid, mk ? idealPow(d) : idealPow(d) + U.pick([-1, 1]) * U.rand(0.1, 0.25), 'kid'); h.kidGo = null; h.kidT = 0; } }
    }
    // holding the shot: a meter that runs up and back; let go in the green
    if (m.ball.state === 'held' && !m.over) {
      const can = inBox(c.box, pl.x, pl.y, 0.5); const d = dist(pl, c.hoop);
      const needSpot = m.mode === 'horse' && m.horse.phase === 'match' && m.horse.spot && dist(pl, m.horse.spot) > 1.3;
      if (I.down('action') && can && !needSpot && d > 0.8) { if (!m.meter) m.meter = { p: 0, dir: 1 }; m.meter.p += m.meter.dir * dt * 1.25; if (m.meter.p > 1) { m.meter.p = 1; m.meter.dir = -1; } if (m.meter.p < 0) { m.meter.p = 0; m.meter.dir = 1; } pl.ang = Math.atan2(c.hoop.y - pl.y, c.hoop.x - pl.x); }
      else if (m.meter) { if (can && !needSpot) shoot(m, pl, m.meter.p, 'you'); m.meter = null; }
      else if (I.down('action') && needSpot) m.hint = 'STAND ON THE RING TO MATCH THE SHOT';
    }
    if (I.consume('action')) { /* held above */ }
    if (m.over && m.ball.state !== 'flight') { m.overT = (m.overT || 0) + dt; if (m.overT > 3) S.endMini(); }
    if (!inBox(c.box, pl.x, pl.y, 6)) S.endMini('YOU WANDER OFF THE COURT');
  };

  // ================= lawn bowls =================
  const BOWL_R = 0.13, JACK_R = 0.08, DECEL = 1.4, BIAS = 0.6;
  function rinkLocal(x, y) { return local(S.green.box, x, y); }
  // the green fee: a few dollars for anyone, members (Merv) free; on the clubhouse sign and from the secretary
  S.FEE = 5; S.fee = () => (G().char === 'grump' ? 0 : S.FEE);
  S.payAndBowl = function () {
    const g = G(), fee = S.fee();
    if (g.cash < fee) { g.toast(`THE GREEN FEE IS $${fee}. COME BACK WITH SOME CASH`, '#ff9a30'); sfx('fail'); return; }
    if (fee) { g.cash -= fee; sfx('cash'); g.toast(`GREEN FEE PAID: $${fee}`, '#ffd23a'); }
    S.startBowls();
  };
  S.startBowls = function () {
    const g = G(), gr = S.green; if (!gr) return;
    const merv = g.char === 'grump'; const opp = S.regulars[(S.bowlsN = (S.bowlsN || 0) + 1) % S.regulars.length] || { name: 'BEV', x: gr.mat.x, y: gr.mat.y, say() {} };
    const jd = U.rand(Math.min(20, gr.box.L * 0.6), gr.box.L - 5);
    S.mini = { kind: 'bowls', opp, oppName: opp.name || 'BEV', merv, end: 1, ends: 3, per: 2, bowls: [], jack: { ...world(gr.box, -gr.box.L / 2 + 2 + jd, 0), vx: 0, vy: 0, r: JACK_R, m: 0.3, jack: true }, turn: 'you', lead: 'you', aim: 0, hand: 1, meter: null, phase: 'aim', score: { you: 0, opp: 0 }, thrown: { you: 0, opp: 0 }, t: 0 };
    const pl = g.player; pl.vx = pl.vy = 0; pl.ang = gr.box.ang; // you bowl from where you stand at the mat (frozen in place, not moved)
    if (opp.say) opp.say(merv ? U.pick(["EVENING, MERV. THE GREEN'S RUNNING FAST TONIGHT.", 'MERV! YOUR USUAL RINK.']) : U.pick(['A ROLL-UP? GO ON THEN, LOVE.', 'MIND THE BIAS. IT ALWAYS CURVES.']), 3.5);
    g.toast(merv ? "HOME GREEN: MERV KNOWS EVERY BLADE (YOU SEE THE BOWL'S LINE)" : 'LAWN BOWLS: AIM, PICK A HAND, HOLD SPACE FOR WEIGHT', '#9be15d'); sfx('menu');
  };
  // roll one bowl forward in time (used for real and for the regulars' planning and Merv's guide line)
  function stepBowl(b, dt) {
    const sp = Math.hypot(b.vx, b.vy); if (sp < 0.02) { b.vx = b.vy = 0; b.moving = false; return; }
    const ux = b.vx / sp, uy = b.vy / sp; const ns = Math.max(0, sp - DECEL * dt);
    let lat = 0; if (b.bias) { const k = 1 - ns / b.v0; lat = BIAS * k * k * b.bias * dt; }
    b.vx = ux * ns - uy * lat * 1; b.vy = uy * ns + ux * lat * 1;
    // keep the speed what friction says (the bias bends the path rather than adding pace)
    const s2 = Math.hypot(b.vx, b.vy) || 1; b.vx *= ns / s2; b.vy *= ns / s2;
    b.x += b.vx * dt; b.y += b.vy * dt; b.moving = ns > 0.02;
  }
  S._sim = (aim, hand, p) => { const r = simulate(aim, hand, p); return { x: r.b.x, y: r.b.y }; }; // where the guide line ends (what Merv sees)
  function throwVel(aim, p) { const gr = S.green; const a = gr.box.ang + aim; const v0 = 5 + p * 6.2; return { vx: Math.cos(a) * v0, vy: Math.sin(a) * v0, v0 }; }
  function simulate(aim, hand, p, steps = 400) { const tv = throwVel(aim, p); const b = { x: S.green.mat.x, y: S.green.mat.y, ...tv, bias: hand, moving: true }; const pts = []; for (let i = 0; i < steps && b.moving !== false; i++) { stepBowl(b, 1 / 30); if (i % 3 === 0) pts.push([b.x, b.y]); } return { b, pts }; }
  function deliver(m, who, aim, hand, p) {
    const tv = throwVel(aim, p); const b = { x: S.green.mat.x, y: S.green.mat.y, ...tv, bias: hand, moving: true, owner: who, r: BOWL_R, m: 1.5 };
    m.bowls.push(b); m.thrown[who]++; m.phase = 'rolling'; m.t = 0; sfx('whoosh', { pitch: 0.6, vol: 0.4 });
  }
  function oppPlan(m) {
    let best = null; const j = m.jack;
    for (const hand of [1, -1]) for (let ai = -7; ai <= 7; ai++) {
      const aim = ai * 0.024; let lo = 0, hi = 1; // weight: binary search on distance along the rink
      for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; const r = simulate(aim, hand, mid, 260); const [a] = rinkLocal(r.b.x, r.b.y); const [ja] = rinkLocal(j.x, j.y); if (a < ja) lo = mid; else hi = mid; }
      const p = (lo + hi) / 2; const r = simulate(aim, hand, p, 260); const d = dist(r.b, j); if (!best || d < best.d) best = { aim, hand, p, d };
    }
    return best;
  }
  function bowlsCollide(m) {
    const all = [...m.bowls.filter(b => !b.dead), m.jack];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), rr = a.r + b.r; if (d >= rr || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d; const pen = rr - d; a.x -= nx * pen / 2; a.y -= ny * pen / 2; b.x += nx * pen / 2; b.y += ny * pen / 2;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (vn >= 0) continue;
      const jimp = -1.9 * vn / (1 / a.m + 1 / b.m); a.vx -= jimp * nx / a.m; a.vy -= jimp * ny / a.m; b.vx += jimp * nx / b.m; b.vy += jimp * ny / b.m;
      for (const q of [a, b]) { q.moving = true; q.v0 = Math.max(q.v0 || 0, Math.hypot(q.vx, q.vy)); q.bias = q.jack ? 0 : q.bias * 0.3; }
      sfx('clang', { pitch: 3, vol: 0.25 }); if (b.jack || a.jack) FX.text(m.jack.x, m.jack.y - 2, 'KISSED THE JACK!', '#fff');
    }
  }
  function endScore(m) {
    const live = m.bowls.filter(b => !b.dead).map(b => ({ b, d: dist(b, m.jack) })).sort((a, b) => a.d - b.d);
    if (!live.length) return { who: null, n: 0 };
    const who = live[0].b.owner; let n = 0; for (const q of live) { if (q.b.owner !== who) break; n++; }
    return { who, n };
  }
  S.updateBowls = function (dt) {
    const m = S.mini, g = G(), gr = S.green; m.t += dt; const pl = g.player;
    if (dist(pl, gr.mat) > 6) { S.endMini('YOU WANDER OFF THE GREEN'); return; } // (like hoops: walk away and the game's off)
    pl.vx = pl.vy = 0;
    if (m.phase === 'aim' && m.turn === 'you') {
      const steer = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0) || (I.stick.active ? U.clamp(I.stick.x * 1.5, -1, 1) : 0);
      m.aim = U.clamp(m.aim + steer * dt * 0.18, -0.2, 0.2); pl.ang = gr.box.ang + m.aim;
      const sy = I.stick.active ? I.stick.y : 0; const flick = Math.abs(sy) > 0.6 && !(Math.abs(m.lastSy || 0) > 0.6); m.lastSy = sy;
      if (I.consume('up') || I.consume('down') || I.consume('horn') || flick) { m.hand = -m.hand; sfx('click'); }
      if (I.down('action')) { if (!m.meter) m.meter = { p: 0, dir: 1 }; m.meter.p += m.meter.dir * dt * (m.merv ? 0.55 : 0.7); if (m.meter.p > 1) { m.meter.p = 1; m.meter.dir = -1; } if (m.meter.p < 0) { m.meter.p = 0; m.meter.dir = 1; } }
      else if (m.meter) { deliver(m, 'you', m.aim, m.hand, m.meter.p); m.meter = null; }
      I.consume('action');
    } else if (m.phase === 'aim' && m.turn === 'opp') {
      if (!m.plan) { m.plan = oppPlan(m); m.planT = 0; }
      m.planT += dt; if (m.planT > 1.4) { const p = m.plan; deliver(m, 'opp', p.aim + U.rand(-0.012, 0.012), p.hand, U.clamp(p.p + U.rand(-0.035, 0.035) * (m.merv ? 1.25 : 1), 0, 1)); m.plan = null; }
    } else if (m.phase === 'rolling') {
      for (let k = 0; k < 2; k++) { for (const b of [...m.bowls, m.jack]) if (b.moving !== false && !b.dead) stepBowl(b, dt / 2); bowlsCollide(m); }
      // off the end into the ditch, or off the side of the rink: a dead bowl
      for (const b of m.bowls) if (!b.dead) { const [a, l] = rinkLocal(b.x, b.y); if (a > gr.box.L / 2 + 0.4 || Math.abs(l) > gr.box.Wd / 2 + 1.5) { b.dead = true; b.moving = false; FX.text(b.x, b.y - 2, a > gr.box.L / 2 ? 'IN THE DITCH' : 'WIDE', '#ff9a30'); } }
      const [ja] = rinkLocal(m.jack.x, m.jack.y); if (ja > gr.box.L / 2 + 0.4) { m.jack.vx = m.jack.vy = 0; m.jack.moving = false; const q = world(gr.box, gr.box.L / 2 - 0.5, 0); m.jack.x = q.x; m.jack.y = q.y; }
      if ([...m.bowls, m.jack].every(b => b.moving === false || b.dead) && m.t > 0.5) {
        const last = m.bowls[m.bowls.length - 1]; if (last && !last.dead) { const d = dist(last, m.jack); FX.text(last.x, last.y - 2, d < 0.3 ? 'TOUCHER! LOVELY BOWL' : d < 1 ? U.pick(['GOOD WEIGHT', 'NICE LINE']) : d < 3 ? 'NOT BAD' : U.pick(['A BIT HEAVY', 'NARROW', 'TOO SHORT']), last.owner === 'you' ? '#9be15d' : '#ffd23a'); }
        if (m.thrown.you + m.thrown.opp >= m.per * 2) { m.phase = 'endScore'; m.t = 0; const r = endScore(m); m.endRes = r; if (r.who) m.score[r.who] += r.n; sfx(r.who === 'you' ? 'cash' : 'click'); g.toast(r.who ? `END ${m.end}: ${r.who === 'you' ? 'YOURS' : m.oppName + "'S"}, ${r.n} SHOT${r.n > 1 ? 'S' : ''}` : `END ${m.end}: DEAD END`, r.who === 'you' ? '#9be15d' : '#ffd23a'); }
        else { m.phase = 'aim'; m.t = 0; m.turn = m.turn === 'you' ? 'opp' : 'you'; m.aim = 0; }
      }
    } else if (m.phase === 'endScore') {
      if (m.t > 2.6) {
        if (m.end >= m.ends) {
          m.phase = 'done'; m.t = 0; const won = m.score.you > m.score.opp; const draw = m.score.you === m.score.opp;
          if (won) { const pay = 30; g.cash += pay; save('bowls:wins', store('bowls:wins', 0) + 1); sfx('win'); FX.confetti(pl.x, pl.y, 30); g.toast(`YOU BEAT ${m.oppName} ${m.score.you}-${m.score.opp} +$${pay}`, '#9be15d'); m.opp.say && m.opp.say(m.merv ? 'WELL BOWLED, MERV. SAME TIME TOMORROW.' : 'BEGINNER\'S LUCK!', 3); }
          else if (draw) { g.toast(`ALL SQUARE ${m.score.you}-${m.score.opp}. A HANDSHAKE AND A CUPPA`, '#ffd23a'); }
          else { sfx('fail'); g.toast(`${m.oppName} WINS ${m.opp && m.score.opp}-${m.score.you}. THE REGULARS ARE GRACIOUS ABOUT IT`, '#ff9a30'); }
        } else {
          // next end: the loser of the last end leads, and the jack goes somewhere new
          m.end++; const r = m.endRes; m.lead = r.who === 'you' ? 'opp' : r.who === 'opp' ? 'you' : m.lead; m.turn = m.lead; m.bowls = []; m.thrown = { you: 0, opp: 0 }; m.phase = 'aim'; m.t = 0; m.aim = 0;
          const jd = U.rand(Math.min(20, gr.box.L * 0.6), gr.box.L - 5); Object.assign(m.jack, world(gr.box, -gr.box.L / 2 + 2 + jd, 0), { vx: 0, vy: 0, moving: false });
        }
      }
    } else if (m.phase === 'done') { if (m.t > 3) S.endMini(); }
  };

  // ================= mini-game plumbing =================
  S.menu = null;
  S.settle = function () { if (S.mini) S.endMini(); S.mini = null; S.menu = null; S.jam = null; S.grind = null; };
  S.endMini = function (why) {
    const m = S.mini; if (!m) return; if (m.kid) { m.kid.tag = null; m.kid.state = 'walk'; m.kid.ai = null; }
    S.mini = null; if (why) G().toast(why, '#a99fc8');
  };
  S.near = function () {
    const g = G(), pl = g.player; if (!pl || !pl.onFoot || S.mini || pl.inShop) return null;
    const c = courtAt(pl.x, pl.y); if (c) return { kind: 'hoops', c };
    if (S.green && dist(pl, S.green.mat) < 4) return { kind: 'bowls' };
    return null;
  };
  S.prompt = function (base) {
    const k = I.touchMode ? 'ACT' : 'SPACE';
    if (S.menu) return '';
    const n = S.near(); if (n && base && VH.Missions.job && VH.Missions.job.started) return ''; // a job's own prompt here wins over the court or the green
    if (n) return n.kind === 'hoops' ? `${k} · SHOOT HOOPS` : `${k} · ASK THE SECRETARY FOR A GAME (${S.fee() ? '$' + S.fee() : 'MERV PLAYS FREE'})`;
    const v = pv(); if (v && v.def.bike && !S.jam) { const p = S.parks().find(p => dist(v, p.pad) < 14); if (p) return S.jamCool > 0 ? `NEXT JAM IN ${Math.ceil(S.jamCool)}S` : dist(v, p.pad) < 5.5 ? `STOP HERE (${I.touchMode ? 'PULL BACK' : 'S'}) FOR A 60-SECOND JAM` : 'RIDE INTO THE JAM RING AND STOP: A 60-SECOND JAM'; }
    return '';
  };
  S.touchActions = () => {
    if (S.menu) return [{ id: 'action', label: 'PICK', priority: 96 }, { id: 'enter', label: 'NOT NOW', priority: 94 }];
    const m = S.mini; if (!m) { const n = S.near(); return n ? { id: 'action', label: n.kind === 'hoops' ? 'HOOPS' : 'BOWLS', priority: 85 } : null; } // (a job's own ACT, at 90, still wins)
    if (m.kind === 'hoops') return [{ id: 'action', label: 'SHOOT', priority: 96 }, { id: 'enter', label: 'QUIT', priority: 93 }];
    return [{ id: 'action', label: 'BOWL', priority: 96 }, { id: 'horn', label: 'HAND', priority: 95 }, { id: 'enter', label: 'QUIT', priority: 93 }]; // (HAND: forehand or backhand)
  };
  S.helpContext = function () { if (S.mini) return S.mini.kind; const v = pv(); if (v && v.def.bike && !v.def.motor) return 'bmx'; return ''; };
  // the start menu: shoot-around, HORSE, shootout (hoops) or straight into a game of bowls
  S.preUpdate = function (dt) {
    const g = G(), pl = g.player; if (!pl || g.state !== 'play') return false;
    if (S.menu) {
      const n = S.menu.items.length;
      if (I.consume('up')) { S.menu.i = (S.menu.i + n - 1) % n; sfx('click'); } if (I.consume('down')) { S.menu.i = (S.menu.i + 1) % n; sfx('click'); }
      const tp = I.tap(); if (tp && S.menu.rects) { const hit = S.menu.rects.findIndex(r => tp.x >= r.x && tp.y >= r.y && tp.x <= r.x + r.w && tp.y <= r.y + r.h); if (hit >= 0) { S.menu.i = hit; S.menu.go = true; } }
      if (I.consume('action') || I.consume('confirm') || S.menu.go) { const it = S.menu.items[S.menu.i]; const c = S.menu.c; S.menu = null; if (it.mode) S.startHoops(c, it.mode); if (it.bowls) S.payAndBowl(); }
      if (I.consume('enter') || I.consume('back')) S.menu = null;
      return true;
    }
    if (S.mini) {
      if (I.consume('enter')) { S.endMini('YOU CALL IT A NIGHT'); return true; }
      if (S.mini.kind === 'hoops') { S.updateHoops(dt); return false; }
      S.updateBowls(dt); return true;
    }
    const n = S.near();
    if (n && I.pressed('action')) {
      if (VH.Missions.event('use')) { I.consume('action'); return false; } // the job gets Space first (a job target on the court, say)
      I.consume('action');
      if (n.kind === 'bowls') { const fee = S.fee(); S.menu = { title: 'THE CLUB SECRETARY', say: fee ? `"A GAME WITH THE REGULARS? $${fee} GREEN FEE, LOVE."` : '"EVENING, MERV. MEMBERS PLAY FREE, AS ALWAYS."', i: 0, items: [{ label: fee ? `PAY $${fee} AND PLAY` : 'A GAME, THANKS', bowls: true }, { label: 'NOT TONIGHT' }] }; sfx('menu'); }
      else { S.menu = { c: n.c, i: 0, items: [{ label: 'SHOOT-AROUND', mode: 'around' }, { label: `HORSE AGAINST ${n.c.kid}`, mode: 'horse' }, { label: '60-SECOND SHOOTOUT', mode: 'shootout' }, { label: 'NOT NOW' }] }; sfx('menu'); }
      return true;
    }
    return false;
  };
  S.update = function (dt) {
    S.updateBike(dt); S.updateJam(dt);
    if (S.mini && S.mini.kind === 'hoops' && S.mini.kid) { const k = S.mini.kid; if (!G().peds.includes(k)) S.endMini(); }
    // leaving a bike drops its trick hooks
    for (const v of G().vehicles) if (v.airHook && v.driver !== 'player') { v.airHook = null; v.drawHook = null; v.trick = null; }
  };
  S.camFocus = function () {
    const m = S.mini; if (!m) return null;
    if (m.kind === 'bowls') { const gr = S.green; const p = m.phase === 'rolling' && m.bowls.length ? m.bowls[m.bowls.length - 1] : m.jack; const q = world(gr.box, Math.min(local(gr.box, p.x, p.y)[0], gr.box.L / 2) - 6, 0); return { x: U.lerp(gr.mat.x, q.x, 0.75), y: U.lerp(gr.mat.y, q.y, 0.75) }; }
    if (m.kind === 'hoops') { const pl = G().player; return { x: U.lerp(pl.x, m.c.hoop.x, 0.35), y: U.lerp(pl.y, m.c.hoop.y, 0.35) }; }
    return null;
  };
  S.markers = function () {
    const out = [];
    for (const p of S.parks()) out.push(RB.mark(p.box.x, p.box.y, p.kind === 'skate' ? 'bmx' : 'dirt'));
    for (const c of S.courts) out.push(RB.mark(c.box.x, c.box.y, 'hoops'));
    if (S.green) out.push(RB.mark(S.green.box.x, S.green.box.y, 'bowls'));
    return out;
  };
  S.targets = function () {
    const m = S.mini; if (m && m.kind === 'hoops' && m.mode === 'horse' && m.horse.phase === 'match' && m.horse.spot && m.ball.state === 'held') return [{ x: m.horse.spot.x, y: m.horse.spot.y, label: 'MATCH FROM HERE', r: 1.2 }];
    return [];
  };

  // ================= drawing =================
  const inView = (ctx, left, top, S2, x, y, m) => { const vw = ctx.canvas.width / S2, vh = ctx.canvas.height / S2; return x > left - m && y > top - m && x < left + vw + m && y < top + vh + m; };
  const P = (x, y, left, top, S2) => [Math.round((x - left) * S2), Math.round((y - top) * S2)];
  function polyBox(ctx, o, left, top, S2, fill, stroke) {
    const c = [world(o, -o.L / 2, -o.Wd / 2), world(o, o.L / 2, -o.Wd / 2), world(o, o.L / 2, o.Wd / 2), world(o, -o.L / 2, o.Wd / 2)];
    ctx.beginPath(); c.forEach((q, i) => { const [x, y] = P(q.x, q.y, left, top, S2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function drawRampBox(ctx, ob, left, top, S2, col0, col1) {
    ctx.save(); const [sx, sy] = P(ob.x, ob.y, left, top, S2); ctx.translate(sx, sy); ctx.rotate(ob.a);
    const g = ctx.createLinearGradient(-ob.L * S2 / 2, 0, ob.L * S2 / 2, 0); g.addColorStop(0, col0); g.addColorStop(1, col1); ctx.fillStyle = g; ctx.fillRect(-ob.L * S2 / 2, -ob.Wd * S2 / 2, ob.L * S2, ob.Wd * S2);
    ctx.fillStyle = 'rgba(20,20,45,0.35)'; ctx.fillRect(ob.L * S2 / 2, -ob.Wd * S2 / 2 + 1, 2, ob.Wd * S2); ctx.fillStyle = '#8a8a92'; ctx.fillRect(ob.L * S2 / 2 - 1, -ob.Wd * S2 / 2, 1, ob.Wd * S2);
    ctx.restore();
  }
  S.drawWorld = function (ctx, left, top, S2) {
    const t = G().t;
    // skate park
    const sk = S.skate;
    if (sk && inView(ctx, left, top, S2, sk.box.x, sk.box.y, 40)) {
      polyBox(ctx, sk.box, left, top, S2, '#a8a8a4', '#7a7a78');
      for (const ob of sk.obs) {
        if (ob.k === 'bowl') { const [x, y] = P(ob.x, ob.y, left, top, S2); const g = ctx.createRadialGradient(x, y, 0, x, y, ob.r * S2); g.addColorStop(0, '#7c7c80'); g.addColorStop(0.7, '#a2a2a6'); g.addColorStop(1, '#d0d0cc'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, ob.r * S2, 0, U.TAU); ctx.fill(); ctx.strokeStyle = '#e8e8e0'; ctx.lineWidth = 2; ctx.stroke(); }
        else if (ob.k === 'qp') drawRampBox(ctx, ob, left, top, S2, '#a0a0a4', '#e4e4de');
        else if (ob.k === 'kick') drawRampBox(ctx, ob, left, top, S2, '#9a9aa0', '#d8d8d2');
        else if (ob.k === 'rail') { const [ax, ay] = P(ob.ax, ob.ay, left, top, S2), [bx, by] = P(ob.bx, ob.by, left, top, S2); ctx.strokeStyle = 'rgba(20,20,45,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax + 2, ay + 2); ctx.lineTo(bx + 2, by + 2); ctx.stroke(); ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke(); ctx.fillStyle = '#6a6e7a'; for (let k = 0; k <= 4; k++) ctx.fillRect(Math.round(U.lerp(ax, bx, k / 4)), Math.round(U.lerp(ay, by, k / 4)) - 2, 1, 3); }
      }
    }
    // the dirt jumps
    const D = S.dirt;
    if (D && inView(ctx, left, top, S2, D.box.x, D.box.y, 50)) {
      ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = Math.max(2, 3.4 * S2); ctx.lineJoin = 'round'; ctx.beginPath(); D.loop.forEach((q, i) => { const [x, y] = P(q.x, q.y, left, top, S2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = '#a4825a'; ctx.lineWidth = Math.max(1, 1.6 * S2); ctx.stroke();
      for (const ob of D.obs) { drawRampBox(ctx, ob, left, top, S2, '#7a5a34', '#c49a64'); if (ob.land) { const [x, y] = P(ob.land.x, ob.land.y, left, top, S2); ctx.fillStyle = '#9a7448'; ctx.beginPath(); ctx.ellipse(x, y, 1.8 * S2, 1.5 * S2, ob.a, 0, U.TAU); ctx.fill(); ctx.fillStyle = '#b48a58'; ctx.beginPath(); ctx.ellipse(x - 1, y - 1, 1.2 * S2, 1 * S2, ob.a, 0, U.TAU); ctx.fill(); } }
      const [sx, sy] = P(D.box.x, D.box.y, left, top, S2); U.text(ctx, D.name, sx, sy - 2, { align: 'center', color: '#f2d8a8' });
    }
    // jam pads
    for (const p of S.parks()) if (inView(ctx, left, top, S2, p.pad.x, p.pad.y, 20) && !S.jam) { const [x, y] = P(p.pad.x, p.pad.y, left, top, S2); const pulse = 1 + Math.sin(t * 3) * 0.08; ctx.strokeStyle = '#38e0c8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, 3.5 * S2 * pulse, 2.8 * S2 * pulse, 0, 0, U.TAU); ctx.stroke(); U.text(ctx, p.kind === 'skate' ? 'BMX JAM' : 'DIRT JAM', x, y - 4 * S2 - 9, { align: 'center', color: '#38e0c8' }); }
    // courts: the key and the three-point arc
    for (const c of S.courts) {
      if (!inView(ctx, left, top, S2, c.box.x, c.box.y, 30)) continue;
      polyBox(ctx, c.box, left, top, S2, 'rgba(96,110,132,0.85)', 'rgba(240,240,230,0.55)');
      ctx.strokeStyle = 'rgba(240,240,230,0.55)'; ctx.lineWidth = 1;
      const [hx, hy] = P(c.hoop.x, c.hoop.y, left, top, S2);
      ctx.beginPath(); ctx.arc(hx, hy, 6.75 * S2, c.face - 1.35, c.face + 1.35); ctx.stroke();
      const k0 = world(c.box, c.box.L / 2 - 0.2, -2.45), k1 = world(c.box, c.box.L / 2 - 5.8, -2.45), k2 = world(c.box, c.box.L / 2 - 5.8, 2.45), k3 = world(c.box, c.box.L / 2 - 0.2, 2.45);
      ctx.beginPath(); [k0, k1, k2, k3].forEach((q, i) => { const [x, y] = P(q.x, q.y, left, top, S2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      const ft = world(c.box, c.box.L / 2 - 5.8, 0); const [fx, fy] = P(ft.x, ft.y, left, top, S2); ctx.beginPath(); ctx.arc(fx, fy, 1.8 * S2, 0, U.TAU); ctx.stroke();
    }
    // the bowls rink, the jack and the bowls
    const gr = S.green;
    // the clubhouse sign: the green fee
    if (gr && gr.club && inView(ctx, left, top, S2, gr.club.x, gr.club.y, 60)) { const [cx, cy] = P(gr.club.x, gr.club.y, left, top, S2); const t1 = 'BAY BOWLS & BICKERING', t2 = `A GAME $${S.FEE} · MERV FREE`; const bw = U.textWidth(t2, 1) + 8; ctx.fillStyle = '#1d3a2a'; ctx.fillRect(cx - bw / 2, cy - 22, bw, 20); ctx.fillStyle = '#9be15d'; ctx.fillRect(cx - bw / 2, cy - 22, bw, 1); U.text(ctx, t1, cx, cy - 19, { align: 'center', color: '#f4f0d8' }); U.text(ctx, t2, cx, cy - 10, { align: 'center', color: '#ffd23a' }); }
    if (gr && inView(ctx, left, top, S2, gr.box.x, gr.box.y, 40)) {
      polyBox(ctx, gr.box, left, top, S2, 'rgba(120,190,90,0.35)', 'rgba(240,240,230,0.5)');
      const [mx, my] = P(gr.mat.x, gr.mat.y, left, top, S2); ctx.save(); ctx.translate(mx, my); ctx.rotate(gr.box.ang); ctx.fillStyle = '#2a2a30'; ctx.fillRect(-1 * S2, -0.6 * S2, 2 * S2, 1.2 * S2); ctx.restore();
      const m = S.mini && S.mini.kind === 'bowls' ? S.mini : null;
      if (m) {
        // aim guide: a short line for everyone; Merv, on his home green, sees the whole curve
        if (m.phase === 'aim' && m.turn === 'you') {
          const p = m.meter ? m.meter.p : 0.42; const r = simulate(m.aim, m.hand, p, m.merv ? 400 : 26);
          ctx.fillStyle = m.merv ? 'rgba(255,240,160,0.85)' : 'rgba(255,255,255,0.7)'; for (const [x, y] of r.pts) { const [px, py] = P(x, y, left, top, S2); ctx.fillRect(px, py, 1, 1); }
        }
        const [jx, jy] = P(m.jack.x, m.jack.y, left, top, S2); ctx.fillStyle = '#121218'; ctx.fillRect(jx - 1, jy, 3, 2); ctx.fillStyle = '#f8f8f0'; ctx.fillRect(jx - 1, jy - 1, 2, 2);
        for (const b of m.bowls) { if (b.dead) continue; const [bx, by] = P(b.x, b.y, left, top, S2); ctx.fillStyle = 'rgba(20,20,45,0.4)'; ctx.fillRect(bx - 1, by, 3, 3); ctx.fillStyle = b.owner === 'you' ? '#2a2a34' : '#8a2a2a'; ctx.fillRect(bx - 1, by - 1, 3, 3); ctx.fillStyle = b.owner === 'you' ? '#ffd23a' : '#f4f4f0'; ctx.fillRect(bx, by, 1, 1); }
        if (m.phase === 'endScore' && m.endRes && m.endRes.who) { const live = m.bowls.filter(b => !b.dead && b.owner === m.endRes.who).sort((a, b) => dist(a, m.jack) - dist(b, m.jack)).slice(0, m.endRes.n); for (const b of live) { const [bx, by] = P(b.x, b.y, left, top, S2); ctx.strokeStyle = m.endRes.who === 'you' ? '#9be15d' : '#ffd23a'; ctx.beginPath(); ctx.arc(bx, by, 4, 0, U.TAU); ctx.stroke(); } }
      }
    }
  };
  // above the people: hoops (pole, board, rim and net) and the ball in the air
  S.drawTop = function (ctx, left, top, S2) {
    const m = S.mini && S.mini.kind === 'hoops' ? S.mini : null;
    for (const c of S.courts) {
      if (!inView(ctx, left, top, S2, c.hoop.x, c.hoop.y, 30)) continue;
      const [hx, hy] = P(c.hoop.x, c.hoop.y, left, top, S2); const lift = Math.round(3.05 * S2 * 0.8);
      const bx = c.hoop.x + Math.cos(c.face + Math.PI) * 0.4, by = c.hoop.y + Math.sin(c.face + Math.PI) * 0.4; const [px, py] = P(bx, by, left, top, S2);
      ctx.fillStyle = 'rgba(20,20,45,0.35)'; ctx.fillRect(px + 1, py, 2, 2); ctx.fillStyle = '#5a5e6a'; ctx.fillRect(px, py - lift, 1, lift);
      ctx.save(); ctx.translate(px, py - lift - 2); ctx.rotate(c.face + Math.PI / 2); ctx.fillStyle = '#f4f4f0'; ctx.fillRect(-Math.round(0.9 * S2), -2, Math.round(1.8 * S2), 4); ctx.strokeStyle = '#e0402e'; ctx.strokeRect(-2.5, -1.5, 5, 3); ctx.restore();
      const net = m && m.c === c && m.netT > 0 ? 1 : 0;
      ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(hx, hy - lift, 2.5, 1.5, 0, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = net ? '#ffffff' : 'rgba(240,240,240,0.7)'; ctx.fillRect(hx - 1, hy - lift + 2 + net, 1, 1); ctx.fillRect(hx + 1, hy - lift + 2 + net, 1, 1); ctx.fillRect(hx, hy - lift + 3 + net, 1, 1);
    }
    if (!m) return;
    const g = G(), pl = g.player; let b = m.ball; let bx, by, bz;
    if (b.state === 'held') { bx = pl.x + Math.cos(pl.ang) * 0.5; by = pl.y + Math.sin(pl.ang) * 0.5; bz = m.meter ? 1.6 + m.meter.p * 0.6 : 1; }
    else if (b.state === 'kid') { const k = m.kid; bx = k.x + Math.cos(k.ang) * 0.5; by = k.y + Math.sin(k.ang) * 0.5; bz = 1; }
    else if (b.state === 'flight') { bx = b.x; by = b.y; bz = b.z; }
    else { const k = Math.min(1, b.t / (m.back || 1)); bx = U.lerp(b.x, pl.x, k); by = U.lerp(b.y, pl.y, k); bz = Math.abs(Math.sin(k * 9)) * (1 - k) * 1.2; }
    const [sx, sy] = P(bx, by, left, top, S2); const lift = Math.round(bz * S2 * 0.8);
    ctx.fillStyle = 'rgba(20,20,45,0.4)'; ctx.fillRect(sx, sy, 2, 1);
    const sz = bz > 2.5 ? 3 : 2; ctx.fillStyle = '#e8731e'; ctx.fillRect(sx - 1, sy - lift - 1, sz, sz); ctx.fillStyle = '#5a2a10'; ctx.fillRect(sx, sy - lift - 1, 1, sz);
    if (m.mode === 'horse' && m.horse.spot && m.horse.phase === 'match') { const [x, y] = P(m.horse.spot.x, m.horse.spot.y, left, top, S2); ctx.strokeStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(x, y, 1.2 * S2, 1 * S2, 0, 0, U.TAU); ctx.stroke(); }
  };
  S.lights = function (sources, glows) {
    if (S.green) { const g = S.green.box; for (const k of [-0.4, 0, 0.4]) { const q = world(g, g.L * k, 0); sources.push({ x: q.x, y: q.y, r: 12, col: '#f4f0d8', a: 0.55 }); } }
    for (const c of S.courts) sources.push({ x: c.box.x, y: c.box.y, r: 10, col: '#f4f0d8', a: 0.4 });
    if (S.skate) sources.push({ x: S.skate.box.x, y: S.skate.box.y, r: 16, col: '#f4f0d8', a: 0.45 });
  };

  // ================= HUD =================
  function meterBar(ctx, x, y, w, h, p, ideal, tol, ts) {
    VH.UI.panel(ctx, x - 2 * ts, y - 2 * ts, w + 4 * ts, h + 4 * ts);
    ctx.fillStyle = '#2a2040'; ctx.fillRect(x, y, w, h);
    if (ideal != null) { ctx.fillStyle = 'rgba(155,225,93,0.65)'; ctx.fillRect(Math.round(x + w * (ideal - tol)), y, Math.max(2, Math.round(w * tol * 2)), h); }
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(x, y + h - Math.max(2, h / 3), Math.round(w * p), Math.max(2, h / 3));
    ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x + w * p) - 1, y - ts, 2, h + 2 * ts);
  }
  S.hud = function (ctx, ts) {
    const g = G(), w = ctx.canvas.width, h = ctx.canvas.height; const C = VH.UI.C; const T2 = (s, x, y, o) => U.text(ctx, s, x, y, o);
    const lines = [];
    if (S.jam) lines.push([`${S.jam.park.kind === 'skate' ? 'SKATE' : 'DIRT'} JAM ${Math.ceil(S.jam.t)}S  ${S.jam.score}`, C.teal], [`BEST ${S.bests[S.jam.park.kind] || 0}${S.jam.last ? '  · ' + S.jam.last : ''}`.slice(0, 26), C.dim]);
    const v = pv(); if (v && v.trick) { const n = T.names(v.trick); if (n.out.length) lines.push([n.out.join('+').slice(0, 24), C.hi]); }
    if (S.grind) lines.push([`GRINDING ${Math.round(S.grind.pts)}`, C.hi]);
    const m = S.mini;
    if (m && m.kind === 'hoops') {
      if (m.mode === 'around') lines.push(['SHOOT-AROUND', C.hi], [`STREAK ${m.streak}  BEST ${store('hoops:streak', 0)}`, C.white]);
      if (m.mode === 'shootout') lines.push([`SHOOTOUT ${Math.max(0, Math.ceil(m.t))}S`, C.hi], [`${m.pts} PTS  BEST ${store('hoops:shootout', 0)}`, C.white]);
      if (m.mode === 'horse') { const L = n => HORSE.split('').map((c, i) => i < n ? c : '.').join(' '); lines.push([`YOU  ${L(m.horse.you)}`, C.white], [`${m.kid.name.slice(0, 7).padEnd(7)}${L(m.horse.kid)}`, C.white], [m.over ? 'GAME OVER' : m.ball.state === 'kid' || (m.horse.setter === 'kid' && m.horse.phase === 'set') ? `${m.kid.name}'S SHOT` : m.horse.phase === 'match' ? 'MATCH IT!' : 'YOU SET', C.hi]); }
      if (m.meter) { const d = dist(g.player, m.c.hoop); const mw = Math.min(140 * ts, w * 0.5); meterBar(ctx, w / 2 - mw / 2, (VH.UI.objTop || h * 0.8) - 26 * ts, mw, 7 * ts, m.meter.p, idealPow(d), 0.07 + Math.max(0, 2.2 - d) * 0.05, ts); }
    }
    if (m && m.kind === 'bowls') {
      lines.push([`BOWLS V ${m.oppName}  END ${m.end}/${m.ends}`, C.hi], [`YOU ${m.score.you}  ${m.oppName} ${m.score.opp}`, C.white], [m.phase === 'aim' ? (m.turn === 'you' ? `YOUR BOWL · ${m.hand > 0 ? 'FOREHAND' : 'BACKHAND'}` : `${m.oppName} IS BOWLING`) : m.phase === 'rolling' ? 'ROLLING...' : m.phase === 'done' ? 'MATCH OVER' : 'END SCORED', C.dim]);
      if (m.meter) { const mw = Math.min(140 * ts, w * 0.5); meterBar(ctx, w / 2 - mw / 2, (VH.UI.objTop || h * 0.8) - 26 * ts, mw, 7 * ts, m.meter.p, null, 0, ts); T2('WEIGHT', w / 2, (VH.UI.objTop || h * 0.8) - 36 * ts, { align: 'center', color: C.white, scale: ts }); }
    }
    if (lines.length) {
      const x = VH.UI.leftX || 4 * ts, y = (VH.UI.leftBottom || 120 * ts) + 4 * ts, pw = VH.UI.leftW || 128 * ts, nC = Math.max(8, Math.floor((pw - 10 * ts) / (6 * ts))); // (the core's left column: same margin and width, compact on phones)
      VH.UI.panel(ctx, x, y, pw, (lines.length * 9 + 5) * ts, { accent: C.teal });
      lines.forEach(([s, c], i) => T2(s.length > nC ? s.slice(0, nC) : s, x + 5 * ts, y + 4 * ts + i * 9 * ts, { color: c, scale: ts }));
      VH.UI.leftBottom = y + (lines.length * 9 + 5) * ts;
    }
    if (S.menu) {
      const items = S.menu.items; const pw = Math.min(w - 16 * ts, 180 * ts), ph = (items.length * 14 + 24) * ts; const x = Math.round(w / 2 - pw / 2), y = Math.round(h * 0.4 - ph / 2);
      const sayL = S.menu.say ? U.wrap(S.menu.say, Math.floor((pw - 12 * ts) / (6 * ts))) : []; VH.UI.panel(ctx, x, y, pw, ph + sayL.length * 9 * ts, { accent: C.hi, fill: 'rgba(18,12,36,0.94)' }); T2(S.menu.title || 'HOOPS', x + pw / 2, y + 6 * ts, { align: 'center', color: C.hi, scale: ts }); sayL.forEach((l, i) => T2(l, x + pw / 2, y + 16 * ts + i * 9 * ts, { align: 'center', color: C.white, scale: ts }));
      S.menu.rects = items.map((it, i) => { const yy = y + (20 + i * 14) * ts + sayL.length * 9 * ts; const sel = i === S.menu.i; if (sel) { ctx.fillStyle = 'rgba(255,79,160,0.25)'; ctx.fillRect(x + 4 * ts, yy - 3 * ts, pw - 8 * ts, 13 * ts); } T2((sel ? '> ' : '') + it.label, x + pw / 2, yy, { align: 'center', color: sel ? C.hi : C.white, scale: ts }); return { x: x + 4 * ts, y: yy - 3 * ts, w: pw - 8 * ts, h: 13 * ts }; });
    }
    if (m && m.hint) { T2(m.hint, w / 2, h * 0.3, { align: 'center', color: C.hi, scale: ts }); m.hint = null; }
  };
})(window.VH);
