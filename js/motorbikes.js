// Round B: motorbikes. A road bike (quick, leans into corners), a dirt bike (happy on sand, grass and the dirt-jump
// track; air tricks like the BMX) and a postie-style step-through (slow and cheerful). They're ordinary vehicles on
// the shared vehicle path; this file adds their sprites, the wheelie (hold Space while you accelerate) and the
// stoppie (hold Space while you brake hard) with distance scores, the rider in a helmet, and the tuck-and-roll when
// you come off at speed (nobody hurt). A few are parked round town.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, SP = VH.Sprites, FX = VH.FX, I = VH.Input;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const G = () => VH.Game;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const store = (k, d) => U.store.get('rb:' + k, d), save = (k, v) => U.store.set('rb:' + k, v);

  Object.assign(VH.VDEF, {
    roadbike: { name: 'road bike', L: 2.1, W: 0.8, mass: 220, accel: 26, maxV: 52, grip: 9, turn: 3.4, brake: 30, hp: 0.6, bike: true, motor: true },
    dirtbike: { name: 'dirt bike', L: 2.0, W: 0.8, mass: 120, accel: 20, maxV: 30, grip: 9, turn: 4.0, brake: 22, hp: 0.6, bike: true, motor: true, offroad: true },
    postie: { name: 'postie bike', L: 1.9, W: 0.75, mass: 100, accel: 9, maxV: 21, grip: 8, turn: 3.6, brake: 14, hp: 0.5, bike: true, motor: true },
  });
  const sprite = (type, col) => SP.get('moto:' + type + col, () => {
    const L = type === 'postie' ? 8 : 9; const [c, x] = U.canvas(L + 1, 5);
    x.fillStyle = '#1a1a24'; x.fillRect(0, 1, 2, 3); x.fillRect(L - 1, 1, 2, 3); // tyres, front and back
    x.fillStyle = col; x.fillRect(2, 1, L - 4, 3); x.fillStyle = U.shade(col, 1.3); x.fillRect(3, 1, L - 6, 1);
    x.fillStyle = '#2a2a30'; x.fillRect(3, 2, 3, 1); // seat
    x.fillStyle = '#c0c0c8'; x.fillRect(L - 3, 0, 1, 5); // handlebars
    if (type === 'postie') { x.fillStyle = '#8a5a2a'; x.fillRect(0, 0, 3, 5); x.fillStyle = '#e0402e'; x.fillRect(L - 2, 2, 1, 1); } // the rack and its box
    if (type === 'dirtbike') { x.fillStyle = '#f4f4f0'; x.fillRect(L - 2, 1, 1, 3); } // number plate
    return c;
  });
  const M = VH.Moto = { list: [] };
  const HELMETS = { roadbike: '#2e6ad8', dirtbike: '#ff7a2f', postie: '#f4f4f0' };
  M.make = function (type, x, y, ang, col) { const v = new VH.Vehicle(type, x, y, ang, { colour: col, parked: true }); v.base = v.sprite = sprite(type, col); v.moto = true; return v; };

  M.init = function () {};
  M.newNight = function () {
    const g = G(), P = g.places; M.list = []; M.wheelie = null; M.best = { wheelie: store('moto:wheelie', 0), stoppie: store('moto:stoppie', 0) };
    // every bike on a baked slot: kerbs in the industrial estate, front yards (driveways) in town, a kerb by the skate
    // park, and the dirt bike beside the scrub jumps
    const clear = q => g.vehicles.every(v => v.removed || Math.hypot(v.x - q.x, v.y - q.y) > 14);
    const add = (type, s, col) => { if (!s) return; const v = M.make(type, s.x, s.y, s.a, col); g.vehicles.push(v); g.specials['moto' + M.list.length] = v; M.list.push(v); };
    const kerb = (near, o = {}) => VH.RB.pick('kerb', { near, access: 'car', maxDist: 300, filter: clear, optional: true, ...o });
    add('roadbike', kerb(P.industrial, { minDist: 120 }), '#c4372e'); // a street away from the B-double
    add('postie', kerb(P.industrial, { minDist: 40, maxDist: 220 }), '#e0402e');
    const S = VH.Sports; const town = (S && S.skate && S.skate.pad) || P.warland;
    for (let i = 0; i < 2; i++) add(i ? 'postie' : 'roadbike', VH.RB.pick('frontyard', { near: town, minDist: 150, maxDist: 700, filter: clear, optional: true }), i ? '#e0402e' : '#1a1a24');
    if (S && S.skate) add('roadbike', kerb(S.skate.pad, { maxDist: 120, nearest: true }), '#38e0c8');
    if (S && S.dirt) { const q = VH.Spawn.around(S.dirt.slot, 25, Math.atan2(S.dirt.pad.y - S.dirt.slot.y, S.dirt.pad.x - S.dirt.slot.x) - 0.25); const v = M.make('dirtbike', q.x, q.y, S.dirt.box.ang, '#ff7a2f'); g.vehicles.push(v); g.specials.motoDirt = v; M.list.push(v); }
  };
  const me = () => { const pl = G().player; const v = pl && !pl.onFoot ? pl.vehicle : null; return v && v.def && v.def.motor ? v : null; };

  // wheelies and stoppies: hold Space with the throttle (front up) or with the brakes at speed (back up)
  M.update = function (dt) {
    const v = me(); const g = G();
    for (const b of g.vehicles) if (b.def && b.def.motor && b !== v) { b.stoppie = Math.max(0, (b.stoppie || 0) - dt * 3); }
    if (!v) { M.wheelie = null; return; }
    v.drawHook = M.draw; // the rider, the helmet, the lean (the BMX trick hook takes over in the air)
    if (v.z > 0) return;
    const space = I.down('action'), fwd = v.fwdSpeed;
    const up = space && v.throttle > 0 && fwd > 4, stop = space && v.brake > 0 && fwd > (v.stoppie > 0.3 ? 2.5 : 8);
    if (up) v.wheelie = Math.min(1, (v.wheelie || 0) + dt * 6); // (the core lets it settle by itself each frame)
    v.stoppie = stop ? Math.min(1, (v.stoppie || 0) + dt * 5) : Math.max(0, (v.stoppie || 0) - dt * 4);
    // up on the front wheel the brakes bite more gently, so a good stoppie rolls on a way
    if (v.stoppie > 0.3 && fwd > 0) { const k = v.def.brake * 0.65 * dt; v.vx += Math.cos(v.ang) * k; v.vy += Math.sin(v.ang) * k; }
    const kind = v.wheelie > 0.6 ? 'wheelie' : v.stoppie > 0.6 ? 'stoppie' : null;
    const w = M.wheelie;
    if (kind && (!w || w.kind === kind)) { if (!w) M.wheelie = { kind, d: 0 }; M.wheelie.d += v.speed * dt; if (Math.random() < 0.3) FX.dust(v.x - Math.cos(v.ang) * (kind === 'wheelie' ? 1 : -1), v.y - Math.sin(v.ang) * (kind === 'wheelie' ? 1 : -1), '#c8c0b0', 1); }
    else if (w && (!kind || kind !== w.kind)) {
      M.wheelie = null; const m = Math.round(w.d);
      if (m >= 5) { const pay = Math.max(1, Math.round(m / 15)); g.cash += pay; FX.text(v.x, v.y - 4, `${w.kind.toUpperCase()} ${m}M +$${pay}`, '#ffd23a', { big: m > 60 }); sfx('collect'); if (m > M.best[w.kind]) { M.best[w.kind] = m; save('moto:' + w.kind, m); if (m > 20) g.toast(`BEST ${w.kind.toUpperCase()}: ${m}M`, '#9be15d'); } }
    }
  };
  // coming off at speed: a tuck and roll onto the grass, a dazed moment, nobody hurt
  M.onCrash = function (v, impact) {
    const g = G(); if (v !== me() || impact < 13 || v.z > 0) return;
    v.vx *= 0.3; v.vy *= 0.3; g.exit(true);
    const pl = g.player; if (!pl.onFoot) return;
    pl.stunT = 1.1; FX.dust(pl.x, pl.y, '#c8bfa0', 10); sfx('thud'); g.callout(U.pick(['TUCK AND ROLL!', 'OFF YOU COME! (YOU\'RE FINE)', 'ROLLED IT. ALL GOOD.']), '#ff9a30');
  };
  M.draw = function (ctx, left, top, S) {
    if (this.trick) return VH.Sports.bikeDraw.call(this, ctx, left, top, S); // in the air: the BMX trick drawing
    const sx = (this.x - left) * S, sy = (this.y - top) * S - this.z * S; const wl = this.wheelie || 0, st = this.stoppie || 0;
    const lean = U.clamp(this.av * 0.12, -0.35, 0.35); // leaning into the corner
    ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(this.ang);
    ctx.fillStyle = 'rgba(20,20,45,0.35)'; ctx.fillRect(-this.sprite.width / 2 + 1, -1, this.sprite.width, 3);
    ctx.scale(1 - Math.max(wl, st) * 0.2, 1 - Math.abs(lean) * 0.5); ctx.translate((st - wl) * 1.5, 0);
    ctx.drawImage(this.sprite, -this.sprite.width / 2, -this.sprite.height / 2 - (wl + st) * 1.5);
    ctx.restore();
    const c = this.driver === 'player' ? VH.Shops.look(G().char) : { shirt: '#4a6fa5', hair: '#2a1a10' };
    VH.drawRot(ctx, SP.person(c.shirt, c.hair, 0, { hat: 'helmet', helmetCol: HELMETS[this.type] }), sx - Math.cos(this.ang) * 1 - Math.sin(this.ang) * lean * 4, sy - Math.sin(this.ang) * 1 + Math.cos(this.ang) * lean * 4 - (wl + st) * 2, this.ang, 1, false, 0.7);
    return true;
  };
  M.markers = () => M.list.filter(v => !v.removed && !v.driver).map(v => VH.RB.mark(v.x, v.y, 'moto'));
  M.helpContext = () => (me() ? 'moto' : '');
  M.touchActions = () => (me() ? { id: 'action', label: 'WHEELIE', priority: 58 } : null); // (Space with the throttle: a wheelie; with the brakes: a stoppie)
  M.prompt = function () { const v = me(); if (!v || v.z > 0) return ''; if (M.wheelie) return `${M.wheelie.kind.toUpperCase()}! ${Math.round(M.wheelie.d)}M`; return ''; };
  M.hud = function (ctx, ts) {
    const v = me(); if (!v) return; const C = VH.UI.C; const x = VH.UI.leftX || 4 * ts, y = (VH.UI.leftBottom || 120 * ts) + 4 * ts, pw = VH.UI.leftW || 128 * ts, nC = Math.max(8, Math.floor((pw - 10 * ts) / (6 * ts))); // (the core's left column: same margin and width, compact on phones)
    VH.UI.panel(ctx, x, y, pw, 23 * ts, { accent: C.hi });
    U.text(ctx, `BEST WHEELIE ${M.best.wheelie}M`.slice(0, nC), x + 5 * ts, y + 4 * ts, { color: C.white, scale: ts });
    U.text(ctx, `BEST STOPPIE ${M.best.stoppie}M`.slice(0, nC), x + 5 * ts, y + 13 * ts, { color: C.dim, scale: ts });
    VH.UI.leftBottom = y + 23 * ts;
  };
})(window.VH);
