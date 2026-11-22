// Round B: things that float. Speedboats (moored at the Granite Island jetty, on a trailer at the Bluff boat ramp)
// and jet skis (the Victor Harbor boat ramp, the Rosetta Head wharf), with planing, wakes, a rolling swell you can
// jump, ramp buoys and tricks. Stealing one is an escape: police cars stop at the water's edge, but the police boat
// comes out, and it can come alongside and board you (shove them off or out-pace them). Kev can board other craft
// the same way. The jet-ski water race around Granite Island (against rivals or the clock) lives here too.
// Boats slip under jetties and the causeway (they stand on piles); breakwaters are solid. Nobody gets hurt.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, SP = VH.Sprites, FX = VH.FX, I = VH.Input;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const G = () => VH.Game;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const store = (k, d) => U.store.get('rb:' + k, d), save = (k, v) => U.store.set('rb:' + k, v);
  const S4 = 4; // art pixels per metre

  Object.assign(VH.VDEF, {
    speedboat: { name: 'speedboat', L: 6, W: 2.3, mass: 1300, accel: 12, maxV: 27, grip: 2, turn: 1.6, brake: 9, hp: 1.6, boat: true, planeV: 8, slip: 2.0 },
    jetski: { name: 'jet ski', L: 3, W: 1.2, mass: 380, accel: 17, maxV: 23, grip: 3, turn: 3.4, brake: 11, hp: 0.9, boat: true, jetski: true, planeV: 5, slip: 3.2 },
    fishing: { name: 'fishing boat', L: 11, W: 3.6, mass: 9000, accel: 3, maxV: 8, grip: 1.5, turn: 0.6, brake: 3, hp: 4, boat: true, planeV: 99, slip: 1.5 },
    policeboat: { name: 'police boat', L: 8, W: 2.8, mass: 2600, accel: 10, maxV: 20, grip: 2, turn: 1.7, brake: 9, hp: 3, boat: true, planeV: 8, slip: 2.2 },
  });

  // ---------- sprites (top-down, facing east) ----------
  const sprite = (type, col) => SP.get('boat:' + type + col, () => {
    const sh = U.shade;
    if (type === 'jetski') {
      const [c, x] = U.canvas(13, 6); x.fillStyle = '#1a1a24'; x.fillRect(1, 0, 9, 6); x.fillRect(10, 1, 2, 4); x.fillRect(12, 2, 1, 2);
      x.fillStyle = col; x.fillRect(1, 1, 9, 4); x.fillRect(10, 2, 2, 2); x.fillStyle = sh(col, 1.3); x.fillRect(2, 1, 7, 1);
      x.fillStyle = '#26262e'; x.fillRect(3, 2, 4, 2); x.fillStyle = '#c0c0c8'; x.fillRect(8, 1, 1, 4); x.fillStyle = '#f4f4f0'; x.fillRect(9, 2, 1, 2);
      return c;
    }
    if (type === 'fishing') {
      const [c, x] = U.canvas(45, 16); x.fillStyle = '#121826'; x.beginPath(); x.moveTo(0, 2); x.lineTo(34, 1); x.lineTo(45, 8); x.lineTo(34, 15); x.lineTo(0, 14); x.closePath(); x.fill();
      x.fillStyle = col; x.beginPath(); x.moveTo(1, 3); x.lineTo(34, 2); x.lineTo(43, 8); x.lineTo(34, 14); x.lineTo(1, 13); x.closePath(); x.fill();
      x.fillStyle = '#d8d2c0'; x.fillRect(3, 4, 22, 8); x.fillStyle = '#f2f2ea'; x.fillRect(26, 4, 8, 8); x.fillStyle = '#5a7a9a'; x.fillRect(32, 5, 2, 6);
      x.fillStyle = '#8a5a2a'; for (let i = 0; i < 3; i++) x.fillRect(5 + i * 6, 6, 4, 4); x.fillStyle = '#e0402e'; x.fillRect(6, 7, 2, 2); x.fillStyle = '#ffd23a'; x.fillRect(12, 7, 2, 2);
      return c;
    }
    // speedboat: white hull, a coloured stripe, a windscreen, the outboard at the back
    const [c, x] = U.canvas(25, 10); x.fillStyle = '#141420'; x.beginPath(); x.moveTo(1, 1); x.lineTo(17, 0); x.lineTo(25, 5); x.lineTo(17, 10); x.lineTo(1, 9); x.closePath(); x.fill();
    x.fillStyle = '#f2f2ee'; x.beginPath(); x.moveTo(2, 2); x.lineTo(17, 1); x.lineTo(23, 5); x.lineTo(17, 9); x.lineTo(2, 8); x.closePath(); x.fill();
    x.fillStyle = col; x.fillRect(2, 2, 15, 1); x.fillRect(2, 7, 15, 1); x.fillRect(17, 2, 3, 1); x.fillRect(17, 7, 3, 1);
    x.fillStyle = '#c9b48a'; x.fillRect(4, 3, 7, 4); x.fillStyle = '#a8946a'; x.fillRect(5, 4, 2, 2); x.fillRect(8, 4, 2, 2);
    x.fillStyle = '#6a9ac8'; x.fillRect(13, 3, 2, 4); x.fillStyle = '#2a2a34'; x.fillRect(0, 3, 2, 4);
    return c;
  });
  const trailerSprite = () => SP.get('boat:trailer', () => { const [c, x] = U.canvas(28, 10); x.fillStyle = '#4a4e58'; x.fillRect(0, 2, 24, 1); x.fillRect(0, 7, 24, 1); x.fillRect(22, 2, 1, 6); x.fillRect(23, 4, 5, 2); x.fillStyle = '#1a1a20'; x.fillRect(9, 0, 4, 2); x.fillRect(9, 8, 4, 2); return c; });

  // ================= the module =================
  const Wt = VH.Water = { boats: [], wakes: [], ramps: [], gates: [], rampBuoys: [], race: null, board: null, hoons: [], pierCells: new Set() };
  // a point a little way off a water slot, inside its clearance and on the water (VH.Spawn.around is for ground)
  Wt.around = (s, d, a) => { const r = Math.min(d, (s.r || 0) - 0.4), x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r; return Wt.isWater(x, y) ? { x, y } : { x: s.x, y: s.y }; };
  Wt.isWater = (x, y) => { const k = W.cellIdx(x, y); if (k < 0) return true; const g = W.ground[k]; return g === W.GC.SEA || g === W.GC.WATER || Wt.pierCells.has(k); };
  Wt.deep = (x, y, m = 3) => Wt.isWater(x, y) && W.seaDist(x, y) < -m;
  // the swell rolls in from the south-west; bigger out in the bay, almost flat near the beach
  const D1 = (() => { const a = Math.atan2(-1, 0.28); return [Math.cos(a), Math.sin(a)]; })(), D2 = (() => { const a = Math.atan2(-1, -0.15); return [Math.cos(a), Math.sin(a)]; })();
  const K1 = U.TAU / 30, W1 = Math.sqrt(9.8 * K1), K2 = U.TAU / 17, W2 = Math.sqrt(9.8 * K2);
  Wt.amp = (x, y) => 0.12 + 0.95 * U.clamp((-W.seaDist(x, y) - 12) / 110, 0, 1);
  Wt.waveH = (x, y, t) => { const A = Wt.amp(x, y); return A * (Math.sin(K1 * (D1[0] * x + D1[1] * y) - W1 * t) + 0.4 * Math.sin(K2 * (D2[0] * x + D2[1] * y) - W2 * t + 1.3)); };

  // ---------- a boat ----------
  class Boat extends VH.Vehicle {
    constructor(type, x, y, ang, opts = {}) {
      super(type, x, y, ang, opts);
      this.boat = true; this.base = this.sprite = type === 'policeboat' ? SP.boat() : sprite(type, this.colour); this.plane = 0; this.lastH = 0; this.airCool = 0; this.bob = Math.random() * 6;
      this.moor = opts.moor || null; this.trailer = opts.trailer || null; this.home = { x, y, ang }; this.wakeT = 0;
    }
    trickInput() { if (this.driver !== 'player') return this.aiTrick || {}; return { spin: this.steer, flip: this.throttle - this.brake }; }
    update(dt) {
      if (this.removed) return;
      const d = this.def, t = G().t;
      // on its trailer at the ramp: get in and it rolls back down into the water, stern first
      if (this.trailer && this.trailer.on) {
        this.vx = this.vy = 0;
        if (this.driver === 'player') {
          const tr = this.trailer; if (!tr.t) { tr.t = 0.01; sfx('whoosh', { pitch: 0.6 }); G().toast('LAUNCHING... SHE ROLLS DOWN THE RAMP', '#9fd4ec'); }
          tr.t += dt; const back = -Math.cos(this.ang), backy = -Math.sin(this.ang); this.x += back * 3 * dt; this.y += backy * 3 * dt;
          // roll back until the whole hull floats, then swing her round to face the open water
          if ((Wt.isWater(this.x + Math.cos(this.ang) * d.L * 0.5, this.y + Math.sin(this.ang) * d.L * 0.5) && W.seaDist(this.x, this.y) < -1) || tr.t > 8) { tr.on = false; FX.splash(this.x + back * d.L / 2, this.y + backy * d.L / 2, 25); sfx('splash'); this.vx = back * 1.5; this.vy = backy * 1.5; this.launchTurn = Math.PI; G().toast('AFLOAT! SHE SWINGS ROUND. W TO GO', '#38e0c8'); }
        }
        return;
      }
      if (this.launchTurn > 0) { const st = Math.min(this.launchTurn, 2.6 * dt); this.ang += st; this.launchTurn -= st; }
      const wet = Wt.isWater(this.x, this.y);
      const h = wet ? Wt.waveH(this.x, this.y, t) : 0; this.waveZ = h;
      if (this.z > 0 || this.vz > 0) { // airborne off a wave or a ramp buoy
        this.air += dt; this.vz -= 16 * dt; this.z = Math.max(0, this.z + this.vz * dt); this.x += this.vx * dt; this.y += this.vy * dt;
        if (d.jetski && (this.driver === 'player' || this.aiTrick)) VH.Tricks.air(this, dt, this.trickInput());
        if (this.z <= 0) {
          const air = this.air; this.z = 0; this.vz = 0; this.air = 0; this.airCool = 0.5;
          if (Wt.isWater(this.x, this.y)) { FX.splash(this.x, this.y, 10 + Math.min(30, air * 25)); sfx('splash', { vol: Math.min(1, 0.3 + air) }); } else { sfx('thud'); FX.dust(this.x, this.y, '#c8bfa0', 10); this.hit(6, this.x, this.y, null); }
          if (air > 0.3) FX.kick(Math.min(0.35, air * 0.25));
          VH.Game && VH.Game.onLand && VH.Game.onLand(this, air);
        }
        this.x = U.clamp(this.x, 2, W.width - 2); this.y = U.clamp(this.y, 2, W.height - 2);
        return;
      }
      const fx = Math.cos(this.ang), fy = Math.sin(this.ang), rx = -fy, ry = fx;
      let vF = this.vx * fx + this.vy * fy, vR = this.vx * rx + this.vy * ry;
      let thr = this.throttle, brk = this.brake, steer = this.steer;
      if (this.bailT > 0) { this.bailT -= dt; thr = 0; brk = 0; steer = 0; }
      if (this.boardedT > 0 || (this.driver === 'player' && VH.Tackle.on)) { thr = 0; steer = 0; brk = 0; }
      if (this.holdT > 0) { this.holdT -= dt; thr = 0; brk = 0; } // the race countdown: engines idling on the line
      if (this.boostT > 0) this.boostT -= dt;
      const ramp = Wt.onRamp(this.x, this.y);
      const maxV = wet ? d.maxV * (this.boostT > 0 ? 1.25 : 1) * (1 - this.damage * 0.3) * (this.cargo ? 0.9 : 1) : 2.5;
      if (thr > 0 && vF < maxV) vF += d.accel * thr * dt * (1 - Math.max(0, vF) / maxV * 0.65);
      if (brk > 0) { if (vF > 0.5) vF -= d.brake * brk * dt; else if (vF > -maxV * 0.3) vF -= d.accel * 0.4 * brk * dt; }
      this.plane += ((wet && vF > d.planeV ? 1 : 0) - this.plane) * Math.min(1, dt * 2.2);
      vF -= vF * (wet ? 0.32 - 0.2 * this.plane : 3.5) * dt; if (!thr && !brk) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 0.8 * dt);
      const slide = d.jetski && this.handbrake && wet ? 0.3 : 1;
      vR -= vR * Math.min(1, d.slip * slide * (wet ? 1 : 4) * dt);
      const spd = Math.abs(vF);
      let turn = d.turn * steer * U.clamp(0.4 + spd / 6, 0, 1) * Math.sign(vF || 1) / (1 + spd / 45) * (slide < 1 ? 1.6 : 1) * (wet ? 1 : 0.3);
      if (d.jetski && spd > 8 && wet) turn += Math.sin(t * 9 + this.id) * 0.22 * this.plane * Math.min(1, Wt.amp(this.x, this.y) * 1.5); // twitchy on the chop
      this.av = U.lerp(this.av, turn, Math.min(1, (d.jetski ? 12 : 4) * dt)); this.ang += this.av * dt;
      this.vx = fx * vF + rx * vR; this.vy = fy * vF + ry * vR;
      let nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      // the shore: a little way up a beach or a ramp is fine (to push off); any further and you run aground
      if (!Wt.isWater(nx, ny) && !ramp) {
        const sd = W.seaDist(nx, ny); if (sd > Math.max(2.5, W.seaDist(this.x, this.y))) {
          const sp = this.speed; if (sp > 5 && this.driver === 'player') { this.hit(sp * 1.2, nx, ny, null); G().callout('RUN AGROUND!', '#ff9a30'); FX.dust(nx, ny, '#e6d4a0', 8); }
          this.vx *= -0.2; this.vy *= -0.2; nx = this.x; ny = this.y;
        }
      }
      this.x = nx; this.y = ny;
      // the swell: ride over it, or hit a steep face fast and take off
      const dh = (h - this.lastH) / dt; this.lastH = h; if (this.airCool > 0) this.airCool -= dt;
      if (wet && this.plane > 0.6 && vF > 11 && dh > 2.6 && this.airCool <= 0) { this.vz = Math.min(9, dh * 0.95 + 1); this.z = 0.01; this.air = 0; this.trick = null; FX.splash(this.x + fx * d.L / 2, this.y + fy * d.L / 2, 8); if (this.driver === 'player') { sfx('whoosh', { pitch: 1.2 }); FX.text(this.x, this.y - 4, U.pick(['WAVE JUMP!', 'AIRBORNE!', 'SENT IT!']), '#9fd4ec'); } }
      Wt.rampCheck(this);
      // moored or left alone: drift back to the mooring and bob
      if (!this.driver && this.moor) { this.vx += (this.moor.x - this.x) * 0.6 * dt; this.vy += (this.moor.y - this.y) * 0.6 * dt; this.vx *= Math.exp(-1.5 * dt); this.vy *= Math.exp(-1.5 * dt); this.ang += U.angDiff(this.ang, this.moor.ang) * dt; }
      // wake and spray
      this.wakeT -= dt;
      if (wet && this.speed > 1.5 && this.wakeT <= 0) { this.wakeT = 0.07; Wt.wakes.push({ x: this.x - fx * d.L * 0.45, y: this.y - fy * d.L * 0.45, ang: this.ang, t: 0, w: d.W, s: Math.min(25, this.speed), id: this.id }); }
      if (wet && this.plane > 0.5 && (Math.abs(vR) > 2.5 || slide < 1) && Math.random() < 0.7) { const side = vR > 0 ? -1 : 1; FX.add({ type: 'drop', x: this.x + rx * side * d.W / 2, y: this.y + ry * side * d.W / 2, vx: rx * side * U.rand(3, 7) - fx * 2, vy: ry * side * U.rand(3, 7) - fy * 2, z: 0.3, vz: U.rand(2, 5), grav: 18, life: 0.7, col: U.pick(['#e8f6ff', '#ffffff', '#bfe4f4']), size: 1 }); }
      if (this.damage > 0.6 && Math.random() < 0.2) FX.smoke(this.x - fx * d.L / 2, this.y - fy * d.L / 2, '#8a8a90', 1, 1);
      if (this.damage >= 1 && !this.dead) { this.dead = true; if (this.driver === 'player') G().toast('THE ENGINE HAS CONKED OUT. PADDLE... OR PRESS E NEAR LAND', '#ff9a30'); }
      this.x = U.clamp(this.x, 2, W.width - 2); this.y = U.clamp(this.y, 2, W.height - 2);
    }
    draw(ctx, left, top, S) {
      if (this.removed) return;
      const sx = (this.x - left) * S, sy = (this.y - top) * S;
      if (sx < -80 || sy < -80 || sx > ctx.canvas.width + 80 || sy > ctx.canvas.height + 80) return;
      if (this.trailer) { const tr = this.trailer; VH.drawRot(ctx, trailerSprite(), (tr.x - left) * S, (tr.y - top) * S, tr.ang, 1, true); }
      const bob = Math.round((this.waveZ || 0) * S * 0.35 + Math.sin(G().t * 2 + this.bob) * 0.6);
      if (this.z > 0.05) { ctx.fillStyle = 'rgba(20,40,70,0.35)'; ctx.beginPath(); ctx.ellipse(Math.round(sx + this.z * 2), Math.round(sy + this.z * 2), this.def.L * S / 2, this.def.W * S / 2, this.ang, 0, U.TAU); ctx.fill(); }
      const y = sy - this.z * S - bob - (this.trailer && this.trailer.on ? 2 : 0);
      const scale = 1 + this.z * 0.04 + this.plane * 0.03;
      const under = this.z < 0.5 && W.groundAt(this.x, this.y) !== W.GC.SEA && Wt.pierCells.has(W.cellIdx(this.x, this.y)); // under a jetty or the causeway: seen through the planks
      const al = under ? 0.35 : 1; ctx.globalAlpha = al;
      if (this.trick) VH.Tricks.drawSprite(ctx, this.sprite, sx, y, this.ang, this.trick, scale);
      else VH.drawRot(ctx, this.sprite, sx, y, this.ang, al, false, scale);
      // the rider (or the driver at the console); after a bail the rider is in the water alongside
      const rider = this.driver === 'player' ? VH.Shops.look(G().char) : this.rider ? this.rider : null;
      if (rider && !(this.boardHop)) {
        const off = this.def.jetski ? -0.3 : -0.6; const bail = this.bailT > 0;
        const rx = bail ? sx + Math.sin(this.ang) * 9 : sx + Math.cos(this.ang) * off * S, ry = bail ? sy - Math.cos(this.ang) * 9 : y + Math.sin(this.ang) * off * S;
        const spr = SP.person(rider.shirt, rider.hair, 0, { hat: rider.hat, sunnies: rider.sunnies });
        if (this.trick && !bail) VH.Tricks.drawSprite(ctx, spr, rx, ry, this.ang, this.trick, 0.75 * scale); else VH.drawRot(ctx, spr, rx, ry, this.ang, al, false, 0.75);
        if (this.trick && !bail) VH.Tricks.drawSwoosh(ctx, sx, y, this.trick, this.ang);
        if (bail && Math.random() < 0.2) FX.ring(this.x + Math.sin(this.ang) * 9 / S, this.y - Math.cos(this.ang) * 9 / S, '#e8f6ff', 2);
      }
      ctx.globalAlpha = 1;
      if (this.cuffed) U.text(ctx, 'CUFFED', sx, y - 14, { align: 'center', color: '#9fd4ec' });
    }
  }
  VH.Boat = Boat;
  Wt.onRamp = (x, y) => Wt.ramps.some(r => U.segPointDist(x, y, r.top.x, r.top.y, r.water.x, r.water.y)[0] < 4);

  // ================= setup =================
  // somewhere to head for on the open water (a baked open_water slot near a point); for steering, never for spawning
  Wt.openNear = (p, maxDist = 220) => VH.RB.pick('open_water', { near: p, maxDist, optional: true }) || VH.RB.pick('open_water', { near: p, nearest: true, optional: true }) || p;
  // Round A's arrest rules: nobody's arrested in the water, but on a deck, afloat, the water police can try (the
  // scuffle on deck when they've come alongside). Everyone else's rules are unchanged.
  Wt.arrestRule = actor => (actor === 'player' && afloat() && Wt.board && (Wt.board.kind === 'police' || Wt.board.kind === 'deck') ? true : null);
  Wt.init = function () {
    const g = G(); if (g.arrestRules && !g.arrestRules.includes(Wt.arrestRule)) g.arrestRules.push(Wt.arrestRule);
    const F = W.features || {};
    // jetties and the causeway: boats slip underneath
    for (const pr of F.piers || []) {
      const p = pr.p; const mark = (x, y) => { const k = W.cellIdx(x, y); if (k >= 0) Wt.pierCells.add(k); };
      if (pr.area) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); b = Math.min(b, p[i + 1]); c = Math.max(c, p[i]); d = Math.max(d, p[i + 1]); } for (let x = a; x <= c; x += 1) for (let y = b; y <= d; y += 1) if (U.pointInPoly(x, y, p)) mark(x, y); }
      else for (let i = 0; i + 3 < p.length; i += 2) { const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); const nx = -(p[i + 3] - p[i + 1]) / (L || 1), ny = (p[i + 2] - p[i]) / (L || 1); for (let s = 0; s <= L; s += 0.8) for (let o = -pr.w / 2 - 1; o <= pr.w / 2 + 1; o += 0.8) mark(p[i] + (p[i + 2] - p[i]) * s / (L || 1) + nx * o, p[i + 1] + (p[i + 3] - p[i + 1]) * s / (L || 1) + ny * o); }
    }
    // the causeway's bridge deck isn't tagged as a pier everywhere: the tram line over the sea counts too
    const tr = W.railRoutes.tram; for (let s = 0; s < tr.cum[tr.cum.length - 1]; s += 1) { const [x, y] = U.alongPoly(tr.p, tr.cum, s); if (W.seaDist(x, y) < 4) for (let o = -3; o <= 3; o += 1) { const k = W.cellIdx(x + o, y); const k2 = W.cellIdx(x, y + o); if (W.groundAt(x + o, y) !== W.GC.BUILDING && k >= 0 && W.seaDist(x + o, y) > -6 && W.seaDist(x + o, y) < 3.5) Wt.pierCells.add(k); if (k2 >= 0 && W.seaDist(x, y + o) > -6 && W.seaDist(x, y + o) < 3.5) Wt.pierCells.add(k2); } }
    // boat ramps (baked slipway slots: the top of the ramp, heading down it): the Bluff, and the Victor Harbor ramp
    for (const s of VH.RB.slots('slipway')) {
      const fr = s.extra >= 100 && (F.ramps || [])[s.extra - 100]; const name = fr ? fr.name.toUpperCase() : 'BLUFF BOAT RAMP';
      let w = null; for (let d = 2; d < 90 && !w; d += 1) { const x = s.x + Math.cos(s.a) * d, y = s.y + Math.sin(s.a) * d; if (Wt.isWater(x, y) && W.seaDist(x, y) < -1.5) w = { x: x + Math.cos(s.a) * 3, y: y + Math.sin(s.a) * 3 }; }
      if (w) Wt.ramps.push({ name, top: { x: s.x, y: s.y }, water: w, a: s.a, x: s.x, y: s.y, slot: s });
    }
    // moorings (baked, alongside the planks): the end of the Granite Island jetty, and the old wharf under the Bluff
    const je = VH.RB.one('launch_site', 2); // the jetty end
    const moorAt = (near, maxDist) => { const m = near && VH.RB.pick('mooring', { near, maxDist, nearest: true, access: 'boat', optional: true }); return m ? { x: m.x, y: m.y, ang: m.a, slot: m } : null; };
    Wt.jetty = je ? { end: { x: je.x, y: je.y }, moor: moorAt(je, 40) } : null; if (Wt.jetty && !Wt.jetty.moor) Wt.jetty = null;
    const wharf = (F.piers || []).find(p => /Rosetta/i.test(p.name));
    if (wharf) { let cx = 0, cy = 0; for (let i = 0; i < wharf.p.length; i += 2) { cx += wharf.p[i]; cy += wharf.p[i + 1]; } cx /= wharf.p.length / 2; cy /= wharf.p.length / 2; Wt.wharf = { x: cx, y: cy, moor: moorAt({ x: cx, y: cy }, 40) }; }
    Wt.buildRace();
  };
  // ---- the water race: buoy gates out of the Victor Harbor ramp, round Granite Island (under the causeway) and back ----
  Wt.buildRace = function () {
    // all baked (bake_slots_rb.mjs): the start off the Victor Harbor ramp, gates round Granite Island (every leg checked
    // to be on the water; the last ducks under the causeway), ramp buoys on the three longest legs and two free ones
    const start = VH.RB.one('race_start'); if (!start) return;
    const marks = VH.RB.slots('race_mark').sort((a, b) => a.extra - b.extra);
    const fixed = [start, ...marks, start];
    Wt.course = fixed; Wt.start = start;
    Wt.gates = fixed.slice(1).map((p, i) => { const q = fixed[i]; const a = Math.atan2(p.y - q.y, p.x - q.x); return { x: p.x, y: p.y, a, i, last: i === fixed.length - 2 }; });
    // free ramps sit well off the foreshore: the beach by Warland Reserve stays clear for gigs
    Wt.rampBuoys = VH.RB.slots('ramp_buoy').map(s => ({ x: s.x, y: s.y, a: s.a, L: 4, Wd: 3, free: s.extra < 0 }));
  };
  Wt.rampCheck = function (v) {
    if (v.z > 0 || v.speed < 6) return;
    for (const r of Wt.rampBuoys) {
      if (Math.abs(v.x - r.x) > 6 || Math.abs(v.y - r.y) > 6) continue;
      const ca = Math.cos(r.a), sa = Math.sin(r.a); const lx = (v.x - r.x) * ca + (v.y - r.y) * sa, ly = -(v.x - r.x) * sa + (v.y - r.y) * ca;
      if (lx > r.L / 2 - 1.3 && lx < r.L / 2 + 0.2 && Math.abs(ly) < r.Wd / 2 + 0.3 && (v.vx * ca + v.vy * sa) / v.speed > 0.5) {
        v.vz = Math.min(11, v.speed * 0.45); v.z = 0.01; v.air = 0; v.trick = null; v.airCool = 0.5;
        if (v.driver === 'player') { sfx('whoosh'); FX.text(v.x, v.y - 4, U.pick(['SEND IT!', 'RAMP!', 'HUCK IT!']), '#ffd23a'); }
        if (v.rival && Math.random() < 0.6) v.aiTrick = U.pick([{ spin: 1 }, { flip: -1 }, { spin: -1 }]); else v.aiTrick = null;
      }
    }
  };

  // ---- per night: the boats go back where they belong ----
  Wt.newNight = function () {
    const g = G(); Wt.boats = []; Wt.wakes = []; Wt.race = null; Wt.board = null; Wt.hoons = []; Wt.patrol = null; Wt.collector = null; Wt.leaving = null; Wt.copsOff = null;
    const add = (type, x, y, ang, col, opts = {}) => { const b = new Boat(type, x, y, ang, { colour: col, ...opts }); g.vehicles.push(b); Wt.boats.push(b); g.specials['boat' + Wt.boats.length] = b; return b; };
    if (Wt.jetty) { const m = Wt.jetty.moor; add('speedboat', m.x, m.y, m.ang, '#e0402e', { moor: m, label: 'JETTY' }); }
    if (Wt.wharf && Wt.wharf.moor) { const m = Wt.wharf.moor; add('jetski', m.x, m.y, m.ang, '#ffd23a', { moor: m }); }
    for (const r of Wt.ramps) {
      const bluff = /BLUFF/.test(r.name); const type = bluff ? 'speedboat' : 'jetski';
      const back = r.top; // on its trailer at the top of the ramp
      add(type, back.x, back.y, r.a + Math.PI, bluff ? '#2e6ad8' : '#38e0c8', { trailer: { x: back.x, y: back.y, ang: r.a + Math.PI, on: true } });
      if (bluff) g.park && g.park('ute', r.top, { colour: '#e9e6dc' }); // its tow ute, on the nearest kerb
    }
    // one jet ski afloat by the race start
    if (Wt.start) { const q = Wt.around(Wt.start, 8, Math.PI * 0.85); add('jetski', q.x, q.y, 0, '#ff4fa0', { moor: { x: q.x, y: q.y, ang: 0 } }); }
  };

  // ================= every frame =================
  const afloat = () => { const pl = G().player; const v = pl && !pl.onFoot && pl.vehicle; return v && v.boat && !(v.trailer && v.trailer.on) ? v : null; };
  Wt.afloat = afloat;
  Wt.preVehicles = function (dt) {
    const g = G(), pl = g.player;
    // cars never drive into the sea: anything heading for the water brakes at the edge
    for (const v of g.vehicles) {
      if (v.removed || v.boat || v.rail || v.driver === 'player' || v.def.heli || v.scripted || v.speed < 1) continue;
      if (!(v.police || v.ai || v.backup || v.watch || v.block)) continue;
      const k = 3 + v.speed * 0.45; const ax = v.x + v.vx / v.speed * k, ay = v.y + v.vy / v.speed * k;
      if (W.isWet(ax, ay) && W.seaDist(ax, ay) < 0.5) { v.throttle = 0; v.brake = 1; v.handbrake = 0; }
    }
    // officers on foot stop at the water's edge
    const b = afloat();
    if (b && g.char !== 'cop') for (const o of VH.Police.officers) if (o.state === 'chase' && (W.isWet(o.x, o.y) || W.seaDist(b.x, b.y) < -2)) o.state = 'return';
    // rivals and water hoons steer themselves
    if (Wt.race) { for (const r of Wt.race.rivals) Wt.driveRival(r, dt); if (Wt.race.cd > 0) { const me = afloat(); if (me) me.holdT = 0.05; } }
    for (const h of Wt.hoons) Wt.driveHoon(h, dt);
  };

  // ---- the police boat: a real boat (the shared vehicle path), steered by throttle and rudder ----
  // it chases (and boards) you when you're afloat, and patrols with its spotlight for the fireworks import
  function steerBoat(b, aim, spd) {
    const want0 = Math.atan2(aim.y - b.y, aim.x - b.x); let chosen = null;
    for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6]) { const a = want0 + da; let ok = true; for (const r of [7, 14]) if (!Wt.isWater(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r)) ok = false; if (ok) { chosen = a; break; } }
    if (chosen == null) { b.throttle = 0; b.brake = 1; b.steer = 1; return; }
    b.steer = U.clamp(U.angDiff(b.ang, chosen) * 2, -1, 1); const sp = b.fwdSpeed;
    b.throttle = sp < spd ? 1 : 0; b.brake = sp > spd + 2 ? 0.6 : 0; b.handbrake = 0;
  }
  Wt.policeBoat = function (dt) {
    const g = G(), P = VH.Police; if (g.char === 'cop') return false;
    const me = afloat(); const patrol = Wt.patrol; const mine = P.boat && P.boat.boat;
    if (!me && !patrol && !mine) return false; // ashore: the usual foreshore boat
    const want = (me && g.meter >= 1.5) || patrol;
    if (want && !mine) {
      const c = P.boat || (patrol ? patrol.pts[0] : me);
      // the foreshore boat takes to the water where it is; otherwise one comes out of view, on open water
      const at = P.boat ? { x: P.boat.x, y: P.boat.y, a: P.boat.ang || 0 } : VH.RB.pick('open_water', patrol ? { near: c, maxDist: 160, nearest: true, access: 'boat', optional: true } : { near: c, minDist: 120, maxDist: 320, offscreen: true, access: 'boat', optional: true });
      if (at) { const b = new Boat('policeboat', at.x, at.y, Math.atan2(c.y - at.y, c.x - at.x), { colour: '#fff' }); b.police = true; b.pboat = true; b.siren = true; b.pi = 0; g.vehicles.push(b); P.boat = b; if (!patrol && !mine) g.toast('THE POLICE BOAT IS OUT', '#7fa6ff'); }
    }
    const b = P.boat; if (!b || !b.boat) return true; b.t = (b.t || 0) + dt;
    if (b.overboard > 0) { b.overboard -= dt; b.throttle = 0; b.brake = 0.5; b.steer = 0;
      // the officer in the water beside their boat: ripples, a line or two, then hauled back aboard (nobody hurt)
      b.rippleT = (b.rippleT || 0) - dt; if (b.rippleT <= 0) { b.rippleT = 0.7; const d = b.dunk || b; FX.ring(U.lerp(d.x, b.x, 0.5), U.lerp(d.y, b.y, 0.5), '#e8f6ff', 3); }
      if (b.overboard < 2.5 && !b.climbSaid) { b.climbSaid = true; FX.text(b.x, b.y - 5, U.pick(['HAULED BACK ABOARD, DRIPPING', 'BACK ON DECK. SOGGY BUT FINE', 'CLIMBS BACK ABOARD, BOOTS FULL OF WATER']), '#9fd4ec'); }
      if (b.overboard <= 0) { b.dunk = null; b.climbSaid = false; g.toast("THEY'VE FISHED THEIR OFFICER OUT. THEY'RE REGROUPING", '#7fa6ff'); Wt.regroup(b, false); } b.beam = (b.beam || 0) + dt; return true; }
    // a challenge, not a lock: after a shove-off (or an officer overboard) they hang back and regroup for most of a
    // minute; after three in a job they give up on you for that job, unless you stir things up again
    const M = VH.Missions; if (Wt.shoveJob !== M.job) { Wt.shoveJob = M.job; Wt.shoves = 0; Wt.gaveUp = null; }
    if (Wt.gaveUp != null && g.meter > Wt.gaveUp + 1) { Wt.gaveUp = null; Wt.shoves = 0; g.toast('THE WATER POLICE ARE BACK ON YOUR TAIL', '#ff6a5a'); }
    if (b.regroupT > 0) b.regroupT -= dt;
    const chasing = me && Wt.gaveUp == null && (g.meter >= 1.5 || (patrol && patrol.spotted));
    if (chasing && b.regroupT > 0) {
      // hanging back, well off you, with the spotlight still on
      const d = dist(b, me), a = Math.atan2(b.y - me.y, b.x - me.x); steerBoat(b, d < 70 ? { x: me.x + Math.cos(a) * 90, y: me.y + Math.sin(a) * 90 } : me, d < 70 ? 14 : 3); b.beam = Math.atan2(me.y - b.y, me.x - b.x);
      b.sayT = (b.sayT || 0) - dt; if (b.sayT <= 0) { b.sayT = 3; FX.text(b.x, b.y - 5, `REGROUPING ${Math.ceil(b.regroupT)}`, '#9fd4ec'); }
      if (Wt.board && Wt.board.kind === 'police') Wt.board = null;
    } else if (chasing) {
      const aim = { x: me.x + me.vx * 0.6, y: me.y + me.vy * 0.6 };
      steerBoat(b, aim, dist(b, me) < 12 ? Math.max(3, me.speed + 1) : (patrol ? patrol.speed || 16 : b.def.maxV)); b.beam = Math.atan2(me.y - b.y, me.x - b.x);
      Wt.boarding(b, me, dt);
    } else if (patrol) {
      const tgt = patrol.pts[b.pi % patrol.pts.length]; steerBoat(b, tgt, 8); if (dist(b, tgt) < 20) b.pi++;
      b.beam = b.ang + Math.sin(b.t * 0.9) * 0.9; if (Wt.board && Wt.board.kind === 'police') Wt.board = null;
    } else { steerBoat(b, { x: b.x + Math.cos(b.ang) * 60, y: b.y + Math.sin(b.ang) * 60 }, 12); b.beam = b.ang; }
    if (!want && dist(b, g.player) > 300) { b.removed = true; P.boat = null; }
    return true;
  };
  // the water police come alongside and board: shove them off (Space) or open the throttle before they're aboard
  // they hang back for a while (a shove, an officer overboard); `shoved` counts toward giving up and cools the gossip a little
  Wt.regroup = function (b, shoved) {
    const g = G(); b.regroupT = U.rand(45, 60); b.sayT = 0; Wt.board = null;
    if (shoved) { Wt.shoves = (Wt.shoves || 0) + 1; g.meter = Math.max(0, g.meter - 0.3); }
    if (Wt.shoves >= 3) { Wt.gaveUp = g.meter; g.toast("THE WATER POLICE HAVE HAD ENOUGH OF YOU FOR NOW", '#9be15d'); }
    else g.toast(shoved ? "SHOVED OFF! THEY'RE REGROUPING" : "THEY'RE REGROUPING", '#9be15d');
  };
  Wt.boarding = function (b, me, dt) {
    const g = G(); if (VH.Tackle.on || g.state !== 'play') return;
    // they only try to board when the gossip's high (Round A's calmer police), or when they've spotted you running the
    // fireworks; never in the shallows by a ramp or a beach (too shallow for the police boat)
    const patrol = Wt.patrol; if (!(g.meter >= 3 || (patrol && patrol.spotted)) || W.seaDist(me.x, me.y) > -4) { if (Wt.board && Wt.board.kind === 'police') Wt.board = null; return; }
    const rel = Math.hypot(me.vx - b.vx, me.vy - b.vy);
    const close = dist(b, me) < 7.5 && rel < 5 && me.z === 0;
    let k = Wt.board;
    if (!k || k.kind !== 'police') { if (!close) return; k = Wt.board = { kind: 'police', t: 0, shove: 0 }; g.callout('THE WATER POLICE ARE BOARDING!', '#ff6a5a'); sfx('megaphone'); }
    if (!close) { k.away = (k.away || 0) + dt; k.t = Math.max(0, k.t - dt * 2); if (k.t <= 0 && k.away > 1) { if (k.shove) Wt.regroup(b, true); else { Wt.board = null; g.toast('OUT-PACED THEM!', '#9be15d'); b.regroupT = 20; } } return; }
    k.away = 0; k.t += dt;
    if (I.consume('action')) { k.t = Math.max(0, k.t - 0.45); k.shove++; const a = Math.atan2(b.y - me.y, b.x - me.x); b.vx += Math.cos(a) * 2.5; b.vy += Math.sin(a) * 2.5; me.vx -= Math.cos(a) * 1.5; me.vy -= Math.sin(a) * 1.5; FX.text(me.x, me.y - 5, U.pick(['SHOVE!', 'GET OFF!', 'NOT TODAY!']), '#ffd23a'); sfx('thud', { pitch: 1.3 }); }
    if (k.t > 1.8 && g.arrestAllowed('player')) {
      // aboard: a scuffle on deck, the same struggle as a tackle on land (allowed by the "on a deck, afloat" arrest rule)
      const o = { x: me.x, y: me.y, ang: me.ang + Math.PI, rank: g.meter >= 4.5 ? 'sergeant' : 'senior', state: 'tackle' }; Wt.board = { kind: 'deck', o, t: 0 }; sfx('door');
      FX.text(me.x, me.y - 6, "'ELLO 'ELLO! WATER POLICE!", '#9fd4ec');
      VH.Tackle.start({ mode: 'escape', rank: o.rank, who: o,
        onWin: () => { Wt.board = null; b.overboard = 5; Wt.shoves = (Wt.shoves || 0) + 1; const sx = me.x + Math.sin(me.ang) * 3, sy = me.y - Math.cos(me.ang) * 3; b.dunk = { x: sx, y: sy }; FX.splash(sx, sy, 30); /* no one left standing in the water: a splash, then they climb back aboard their boat */ sfx('splash'); g.callout('OFFICER OVERBOARD! (THEY HAUL HIM OUT, NO HARM DONE)', '#9be15d'); g.addMeter(0.4); },
        onLose: () => { Wt.board = null; Wt.bustAshore(); } });
    }
  };
  // busted on the water: they run you in to the nearest beach, then it's the paddy wagon as usual
  Wt.bustAshore = function () {
    const g = G(), pl = g.player; const v = pl.vehicle; let best = null;
    for (let r = 4; r < 400 && !best; r += 4) for (let a = 0; a < U.TAU; a += 0.25) { const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r; if (!W.isWet(x, y) && W.groundAt(x, y) !== W.GC.BUILDING && W.roadDist(x, y) < 30) { best = { x, y }; break; } }
    if (v) { v.driver = null; v.throttle = 0; v.vx *= 0.1; v.vy *= 0.1; }
    pl.vehicle = null; pl.onFoot = true; if (best) { pl.x = best.x; pl.y = best.y; }
    VH.Police.boat = null; g.busted();
  };

  // ---- Kev: water hoons to board ----
  Wt.driveHoon = function (h, dt) {
    if (h.cuffed || h.driver === 'player' || !h.rider || !h.hoon) { if (!h.driver) { h.throttle = 0; h.steer = 0; } return; }
    const pl = G().player; const near = dist(h, pl) < 40;
    if (!h.wp || dist(h, h.wp) < 15) h.wp = Wt.openNear(h.base, 200);
    const aim = near ? { x: h.x + (h.x - pl.x), y: h.y + (h.y - pl.y) } : h.wp;
    const want = Math.atan2(aim.y - h.y, aim.x - h.x); let a = want; for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) { if (Wt.isWater(h.x + Math.cos(want + da) * 14, h.y + Math.sin(want + da) * 14)) { a = want + da; break; } }
    h.steer = U.clamp(U.angDiff(h.ang, a) * 2, -1, 1); h.throttle = near ? 1 : 0.55; h.brake = 0; h.handbrake = 0;
    if (h.boardedT > 0) { h.boardedT -= dt; h.throttle = 0; }
    // told to pull over (Kev's horn): they idle, grumbling, for a few seconds
    if (h.pullT > 0) { h.pullT -= dt; h.throttle = 0; h.steer = 0; h.holdT = 0.05; if (h.pullT <= 0) FX.text(h.x, h.y - 4, 'NAH, SEE YA!', '#ff9a30'); }
  };
  Wt.updateHoons = function (dt) {
    const g = G(); if (g.char !== 'cop') return;
    const me = afloat(); Wt.hoons = Wt.hoons.filter(h => !h.removed && (h.cuffed || dist(h, g.player) < 700));
    if (me && Wt.hoons.filter(h => !h.cuffed).length < 2 && Math.random() < dt * 0.5) {
      const at = VH.RB.pick('open_water', { near: me, minDist: 100, maxDist: 230, offscreen: true, access: 'boat', optional: true });
      if (at) { const h = new Boat('jetski', at.x, at.y, U.rand(0, U.TAU), { colour: U.pick(['#ff7a2f', '#7c5cff', '#9be15d']) }); h.rider = { shirt: U.pick(['#ff4fa0', '#ffd23a', '#38e0c8']), hair: '#2a1a10', hat: 'cap' }; h.hoon = true; h.base = { x: at.x, y: at.y }; G().vehicles.push(h); Wt.hoons.push(h); if (!Wt.hoonTip) { Wt.hoonTip = true; g.toast('WATER HOONS ON JET SKIS: PULL ALONGSIDE AND PRESS E TO BOARD', '#9fd4ec'); } }
    }
  };
  // Kev pulls alongside (close, matched speed) and presses E: a hop across, then cuffs on deck
  Wt.boardable = function () {
    const g = G(), me = afloat(); if (g.char !== 'cop' || !me || Wt.board) return null;
    let best = null, bd = 6.5;
    for (const v of g.vehicles) { if (!v.boat || v === me || v.removed || v.cuffed || !v.hoon || !v.rider || v.driver || v.z > 0) continue; const d = dist(v, me); const rel = Math.hypot(v.vx - me.vx, v.vy - me.vy); if (d < bd && rel < 4.5) { bd = d; best = v; } }
    return best;
  };
  Wt.startKevBoard = function (tgt) {
    const g = G(), me = afloat(); Wt.board = { kind: 'kev', from: me, to: tgt, t: 0 }; me.boardHop = true; tgt.boardedT = 3; sfx('whoosh', { pitch: 1.4 }); FX.text(me.x, me.y - 5, 'HUP!', '#9fd4ec');
  };
  Wt.updateKevBoard = function (dt) {
    const k = Wt.board; if (!k || k.kind !== 'kev') return; const g = G(), pl = g.player;
    k.t += dt;
    if (k.t < 0.6) { k.from.throttle = 0; k.from.brake = 1; return; }
    if (k.landed && !VH.Tackle.on && pl.aboard !== k.to) { k.to.boardedT = 0; Wt.board = null; return; } // cancelled from outside (a restart): let go
    if (!k.landed) {
      if (VH.Tackle.on) return; // wait for any other struggle to finish first
      k.landed = true; const me = k.from, tgt = k.to; me.boardHop = false; FX.ring(tgt.x, tgt.y, '#9fd4ec', 4);
      // Round A's takeover (M.Takeover, shared with the runaway tram and train): you're aboard their jet ski and the
      // struggle decides it. Win: they're cuffed on deck and you have the controls. Lose: over the side you go (a
      // splash, then you swim) and they're off. Nobody hurt either way.
      tgt.boardedT = 99;
      VH.Missions.Takeover.board(tgt, { rank: 'hoon',
        text: { head: 'TAKE THE JET SKI OFF THE HOON', mine: 'KEV', theirs: 'HOON', win: 'CUFFED ON DECK!', lose: 'OVER THE SIDE!', good: 'GOT YA!', tip: 'HOLD: KEEP THEM IN THE SWEET SPOT', callout: 'ABOARD! KEEP HOLD' },
        onWin: () => { tgt.boardedT = 0; tgt.cuffed = true; tgt.hoon = false; me.throttle = 0; me.brake = 1; Wt.board = { kind: 'cuffed', v: tgt, t: 0 }; sfx('clang', { pitch: 2.2, vol: 0.6 }); g.toast('CUFFED ON DECK. DRIVE THEM TO SHORE AND GET OUT, OR H: CALL THE POLICE BOAT', '#9fd4ec'); },
        onLose: () => { tgt.boardedT = 0; Wt.board = null; tgt.pullT = 0; FX.splash(pl.x, pl.y, 25); sfx('splash'); g.toast('THROWN OVER THE SIDE! SWIM BACK TO YOUR JET SKI (THE LIGHT-BLUE ARROW) OR TO SHORE', '#ff9a30'); } });
    }
  };
  Wt.handOver = function (how) {
    const g = G(), k = Wt.board; if (!k || k.kind !== 'cuffed') return; const v = k.v;
    g.cash += 15; sfx('cash'); FX.confetti(v.x, v.y, 15); v.rider = null; Wt.board = null; if (Wt.collector && Wt.collector.b) Wt.leaving = { b: Wt.collector.b, t: 0 }; Wt.collector = null; g.stats.delivered = (g.stats.delivered || 0) + 1;
    g.toast(how === 'boat' ? 'THE POLICE BOAT COLLECTS THEM +$15' : 'HANDED OVER TO TEGAN ON THE BEACH +$15', '#9be15d');
  };

  // ---- the water race ----
  const RIVALS = [['KAI', '#ff7a2f'], ['MADDI', '#7c5cff'], ['JONO', '#9be15d']];
  Wt.startRace = function (mode) {
    const g = G(); const s = Wt.start; const a0 = Wt.gates.length ? Math.atan2(Wt.gates[0].y - s.y, Wt.gates[0].x - s.x) : 0;
    const rivals = [];
    if (mode === 'race') RIVALS.forEach(([name, col], i) => { const q = Wt.around(s, (i + 1) * 3, a0 + (i % 2 ? -1 : 1) * Math.PI * (i > 1 ? 0.62 : 0.5)); /* lined up beside you in the start ring */ const v = new Boat('jetski', q.x, q.y, a0, { colour: col }); v.rival = { name, gi: 0, skill: [0.93, 0.89, 0.86][i], lane: U.rand(-3, 3), done: false }; v.mission = true; v.rider = { shirt: col, hair: '#2a1a10', hat: '' }; v.def.maxV *= v.rival.skill; g.vehicles.push(v); rivals.push(v); });
    Wt.race = { mode, gi: 0, t: 0, cd: 3, rivals, bonus: 0, tricks: 0, finished: [] };
    sfx('menu'); g.toast(mode === 'race' ? 'WATER RACE: THROUGH EVERY GATE, ROUND THE ISLAND. FLIPS GIVE A BOOST!' : 'BUOY TIME TRIAL: EVERY FLIP TAKES A SECOND OFF', '#38e0c8');
  };
  Wt.driveRival = function (v, dt) {
    const r = Wt.race; const rv = v.rival; if (v.driver === 'player' || v.removed) return;
    if (r.cd > 0) { v.throttle = 0; v.brake = 0; v.holdT = 0.05; return; }
    const gate = Wt.gates[Math.min(rv.gi, Wt.gates.length - 1)]; if (!gate) return;
    const aim = { x: gate.x - Math.sin(gate.a) * rv.lane, y: gate.y + Math.cos(gate.a) * rv.lane };
    const da = U.angDiff(v.ang, Math.atan2(aim.y - v.y, aim.x - v.x)); v.steer = U.clamp(da * 2.2, -1, 1); v.throttle = Math.abs(da) > 1.2 ? 0.5 : 1; v.brake = 0; v.handbrake = Math.abs(da) > 0.9 ? 1 : 0;
    // a little rubber band so it stays a race
    const pl = G().player; const behind = (r.gi - rv.gi) * 1 + (dist(v, gate) - dist(pl, gate)) / 100; v.boostT = behind > 1.5 ? 0.2 : 0;
    if (rv.done) { v.throttle = 0.2; return; }
    if (dist(v, gate) < 10) { rv.gi++; if (rv.gi >= Wt.gates.length) { rv.done = true; r.finished.push(rv.name); } }
  };
  Wt.updateRace = function (dt) {
    const g = G(), r = Wt.race, me = afloat();
    if (!r) return;
    if (!me || !me.def.jetski) { Wt.endRace('RACE ABANDONED (YOU NEED A JET SKI)'); return; }
    if (r.cd > 0) { const b = Math.ceil(r.cd); r.cd -= dt; if (Math.ceil(r.cd) !== b) sfx(r.cd <= 0 ? 'boost' : 'click'); return; }
    r.t += dt;
    const gate = Wt.gates[r.gi];
    if (gate && dist(me, gate) < 9) { r.gi++; sfx('pickup'); if (Wt.pierCells.has(W.cellIdx((me.x + gate.x) / 2, (me.y + gate.y) / 2))) FX.text(me.x, me.y - 4, 'UNDER THE CAUSEWAY!', '#9fd4ec'); }
    if (r.gi >= Wt.gates.length) {
      const place = r.finished.length + 1; const time = +(r.t - r.bonus).toFixed(2);
      if (r.mode === 'race') { const pay = [80, 40, 20, 5][place - 1]; g.cash += pay; sfx(place === 1 ? 'win' : 'cash'); if (place === 1) FX.confetti(me.x, me.y, 50); g.toast(`WATER RACE: ${['1ST!', '2ND', '3RD', '4TH'][place - 1]} IN ${VH.Acts.fmt(r.t)} +$${pay}`, place === 1 ? '#9be15d' : '#38e0c8'); const w = store('race:wins', 0); if (place === 1) save('race:wins', w + 1); }
      else { const best = store('race:trial', 0); const pb = !best || time < best; if (pb) save('race:trial', time); const pay = pb ? 40 : 10; g.cash += pay; sfx(pb ? 'win' : 'cash'); if (pb) FX.confetti(me.x, me.y, 50); g.toast(`BUOY TRIAL: ${VH.Acts.fmt(time)}${r.bonus ? ' (FLIPS -' + r.bonus + 'S)' : ''}${pb ? ' NEW BEST!' : ''} +$${pay}`, pb ? '#9be15d' : '#38e0c8'); }
      Wt.endRace(); return;
    }
    if (r.t > 600) Wt.endRace('RACE TIMED OUT');
  };
  Wt.endRace = function (why) { const r = Wt.race; if (!r) return; for (const v of r.rivals) if (v.driver !== 'player') v.removed = true; else { v.rival = null; v.rider = null; } Wt.race = null; if (why) G().toast(why, '#ff9a30'); };
  Wt.onTrick = function (v, pts) {
    const r = Wt.race; if (!r || r.cd > 0 || v !== afloat()) return;
    if (r.mode === 'trial') { const s = pts >= 400 ? 2 : 1; r.bonus += s; FX.text(v.x, v.y - 8, `-${s}S FLIP BONUS`, '#9be15d'); }
    else { v.boostT = 2.5; FX.text(v.x, v.y - 8, 'FLIP BOOST!', '#9be15d'); }
  };

  Wt.settle = function () { if (Wt.race) Wt.endRace(); Wt.board = null; };
  Wt.update = function (dt) {
    const g = G();
    { const k = Wt.board; if (k && ((k.v && k.v.removed) || (k.to && k.to.removed) || (k.from && k.from.removed))) { if (k.to) k.to.boardedT = 0; Wt.board = null; } } // what you were boarding (or cuffed on) is gone
    for (const w of Wt.wakes) w.t += dt; Wt.wakes = Wt.wakes.filter(w => w.t < 3.2); if (Wt.wakes.length > 900) Wt.wakes.splice(0, Wt.wakes.length - 900);
    Wt.updateRace(dt); Wt.updateHoons(dt); Wt.updateKevBoard(dt);
    // a police boat that's been stood down (or reset by a bust) leaves the water
    for (const v of g.vehicles) if (v.pboat && v !== VH.Police.boat) v.removed = true;
    // Kev with a cuffed hoon: H calls the police boat, or step ashore to hand them over
    const k = Wt.board;
    if (k && k.kind === 'cuffed') {
      k.t += dt; const me = afloat();
      const c = Wt.collector;
      if (c && me) {
        c.t += dt;
        if (!c.b) { const at = VH.RB.pick('open_water', { near: me, minDist: 80, maxDist: 300, offscreen: true, access: 'boat', optional: true }); if (at) { c.b = new Boat('policeboat', at.x, at.y, Math.atan2(me.y - at.y, me.x - at.x), { colour: '#fff' }); c.b.police = true; c.b.siren = true; g.vehicles.push(c.b); } }
        if (c.b) { steerBoat(c.b, me, dist(c.b, me) < 15 ? 3 : 16); if (dist(c.b, me) < 9) { Wt.handOver('boat'); c.leave = c.b; } }
        if (c.t > 40 && !c.leave) { Wt.handOver('boat'); }
      }
    }
    if (g.char !== 'cop' && Wt.board && Wt.board.kind === 'police' && !afloat()) Wt.board = null;
    // the collecting police boat heads off again
    const lv = Wt.leaving; if (lv) { lv.t += dt; steerBoat(lv.b, { x: lv.b.x + Math.cos(lv.b.ang) * 80, y: lv.b.y + Math.sin(lv.b.ang) * 80 }, 14); if (lv.t > 12) { lv.b.removed = true; Wt.leaving = null; } }
    // race rivals out of the game's update range still race (the shared vehicle update, just called from here)
    if (Wt.race) for (const v of Wt.race.rivals) if (!v.removed && v.driver !== 'player' && Math.hypot(v.x - g.player.x, v.y - g.player.y) >= 260) v.update(dt); // (steered once a frame in preVehicles)
  };
  // getting out: only where there's somewhere to step (a jetty, a beach, the ramp). Kev alongside a craft boards it.
  Wt.exitBoat = function (v, force) {
    const g = G(), pl = g.player;
    if (g.char === 'cop' && !force) { const tgt = Wt.boardable(); if (tgt) { Wt.startKevBoard(tgt); return true; } }
    if (v.trailer && v.trailer.on) return false; // still on the trailer: step down as normal
    let best = null;
    if (v.speed <= 4) for (let r = 1.2; r < 7.5 && !best; r += 0.6) for (let a = 0; a < U.TAU; a += 0.26) { const x = v.x + Math.cos(a) * r, y = v.y + Math.sin(a) * r; const gc = W.groundAt(x, y); if (!W.isWet(x, y) && gc !== W.GC.BUILDING) { best = { x, y }; break; } }
    if (Wt.race) Wt.endRace('RACE ABANDONED');
    if (!best) {
      // nowhere to step: over the side (Round A's way out: a dive and a roll at speed, into the water to swim)
      if (Wt.board && Wt.board.kind === 'cuffed' && Wt.board.v === v) { if (!force) g.toast(v.speed > 4 ? 'SLOW DOWN TO STEP ASHORE' : 'NOT WITH SOMEONE CUFFED ON DECK: GET THEM TO SHORE, OR H FOR THE POLICE BOAT', '#9fd4ec'); return true; }
      const sp = g.exitSpot(v); if (W.isWet(sp.x, sp.y)) { FX.splash(v.x, v.y, 22); sfx('splash'); if (!force && !Wt.swimTip) { Wt.swimTip = true; g.toast('SPLASH! SWIM BACK TO IT (THE LIGHT-BLUE ARROW) OR FOR THE SHORE', '#9fd4ec'); } }
      return false;
    }
    pl.x = best.x; pl.y = best.y; pl.onFoot = true; pl.vehicle = null; v.driver = null; v.throttle = v.brake = v.steer = 0; v.handbrake = 0;
    if (Wt.board && Wt.board.kind === 'cuffed' && Wt.board.v === v) Wt.handOver('beach');
    sfx('door'); VH.Missions.event('exit', v); return true;
  };
  // keys the core game would otherwise take (Space, H) in the race ring or with someone cuffed on deck
  Wt.preUpdate = function () {
    const g = G(); if (g.state !== 'play') return false; const me = afloat();
    if (me && me.def.jetski && !Wt.race && Wt.start && me.speed < 2.5 && dist(me, Wt.start) < 12) { if (I.consume('action')) Wt.startRace('race'); else if (I.consume('horn')) Wt.startRace('trial'); }
    // Kev: the horn tells a water hoon nearby to pull over
    if (g.char === 'cop' && me && !Wt.board) { const h = Wt.hoons.find(h => h.hoon && h.rider && !h.driver && dist(h, me) < 45 && !(h.pullT > 0)); if (h && I.consume('horn')) { h.pullT = 9; sfx('megaphone'); FX.text(me.x, me.y - 5, 'OI! PULL OVER!', '#9fd4ec'); FX.text(h.x, h.y - 4, U.pick(['ALRIGHT, ALRIGHT', 'WHAT DID I DO?', 'FAIR ENOUGH...']), '#fff'); } }
    const k = Wt.board; if (k && k.kind === 'cuffed' && me === k.v && !Wt.collector && I.consume('horn')) { Wt.collector = { t: 0 }; g.toast("SARGE: 'BOAT'S ON ITS WAY, KEV. SIT TIGHT.'", '#7fa6ff'); sfx('radio'); }
    return false;
  };
  Wt.onEnter = function (v) { v.moor = null; if (v.hoon && !v.cuffed) { v.hoon = false; v.rider = null; Wt.hoons = Wt.hoons.filter(h => h !== v); } };

  // ================= drawing =================
  const P2 = (x, y, l, t, S) => [Math.round((x - l) * S), Math.round((y - t) * S)];
  Wt.drawSurface = function (ctx, left, top, S) {
    const g = G(), t = g.t; const vw = ctx.canvas.width / S, vh = ctx.canvas.height / S;
    // swell crests: short pale strokes along each crest, stronger out in the bay
    const C = 5, px = -D1[1], py = D1[0];
    for (let cy = Math.floor(top / C) - 1; cy <= Math.floor((top + vh) / C) + 1; cy++) for (let cx = Math.floor(left / C) - 1; cx <= Math.floor((left + vw) / C) + 1; cx++) {
      if (U.hash(cx, cy, 31) > 0.55) continue;
      const x = cx * C + U.hash(cx, cy, 32) * C, y = cy * C + U.hash(cx, cy, 33) * C; if (W.groundAt(x, y) !== W.GC.SEA) continue;
      const A = Wt.amp(x, y); if (A < 0.2) continue;
      const s = Math.sin(K1 * (D1[0] * x + D1[1] * y) - W1 * t); if (s < 0.9) continue;
      const [sx, sy] = P2(x, y, left, top, S); const L = 1 + A * 3.5;
      ctx.strokeStyle = `rgba(235,248,255,${((s - 0.9) * 6 * A).toFixed(2)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - px * L, sy - py * L); ctx.lineTo(sx + px * L, sy + py * L); ctx.stroke();
    }
    // wakes: two arms spreading out behind each boat, and churned water down the middle
    const byId = new Map(); for (const w of Wt.wakes) { let l = byId.get(w.id); if (!l) byId.set(w.id, l = []); l.push(w); }
    ctx.lineWidth = 1;
    for (const list of byId.values()) {
      for (const side of [-1, 1]) {
        let prev = null;
        for (const w of list) {
          const spread = w.w / 2 + w.t * Math.min(w.s, 20) * 0.32; const [sx, sy] = P2(w.x - Math.sin(w.ang) * spread * side, w.y + Math.cos(w.ang) * spread * side, left, top, S);
          if (prev && Math.abs(prev[0] - sx) + Math.abs(prev[1] - sy) < 40) { ctx.strokeStyle = `rgba(240,250,255,${(0.75 * (1 - w.t / 3.2)).toFixed(2)})`; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(sx, sy); ctx.stroke(); }
          prev = [sx, sy];
        }
      }
      // churned white water down the middle, breaking up as it spreads
      for (let i = 0; i < list.length; i++) { const w = list[i]; if (w.t > 1.4) continue; for (let k = 0; k < 3; k++) { const o = (U.hash(i, k, w.id & 255) - 0.5) * w.w * (1 + w.t * 1.5); const [sx, sy] = P2(w.x - Math.sin(w.ang) * o, w.y + Math.cos(w.ang) * o, left, top, S); ctx.fillStyle = `rgba(255,255,255,${(0.65 * (1 - w.t / 1.4)).toFixed(2)})`; ctx.fillRect(sx, sy, 1 + (k === 0 ? 1 : 0), 1); } }
    }
    // trailers and ramps
    for (const r of Wt.ramps) { const [ax, ay] = P2(r.top.x, r.top.y, left, top, S), [bx, by] = P2(r.water.x, r.water.y, left, top, S); if (Math.min(ax, bx) > ctx.canvas.width + 40 || Math.max(ax, bx) < -40 || Math.min(ay, by) > ctx.canvas.height + 40 || Math.max(ay, by) < -40) continue; ctx.strokeStyle = 'rgba(150,150,150,0.8)'; ctx.lineWidth = Math.max(2, 4 * S); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.strokeStyle = 'rgba(120,120,120,0.9)'; ctx.lineWidth = 1; ctx.stroke(); }
    // ramp buoys: orange floating kickers with stripes
    for (const r of Wt.rampBuoys) {
      const [sx, sy] = P2(r.x, r.y, left, top, S); if (sx < -40 || sy < -40 || sx > ctx.canvas.width + 40 || sy > ctx.canvas.height + 40) continue;
      ctx.save(); ctx.translate(sx, sy + Math.round(Math.sin(t * 2 + r.x) * 1)); ctx.rotate(r.a);
      const grd = ctx.createLinearGradient(-r.L * S / 2, 0, r.L * S / 2, 0); grd.addColorStop(0, '#c05a10'); grd.addColorStop(1, '#ffa040'); ctx.fillStyle = grd; ctx.fillRect(-r.L * S / 2, -r.Wd * S / 2, r.L * S, r.Wd * S);
      ctx.fillStyle = '#fff'; for (let i = 0; i < r.Wd * S; i += 4) ctx.fillRect(r.L * S / 2 - 2, -r.Wd * S / 2 + i, 2, 2); ctx.restore();
    }
    // race gates: a red and a yellow buoy either side, and the start ring
    const race = Wt.race;
    for (const gt of Wt.gates) {
      const [sx, sy] = P2(gt.x, gt.y, left, top, S); if (sx < -60 || sy < -60 || sx > ctx.canvas.width + 60 || sy > ctx.canvas.height + 60) continue;
      const next = race && race.gi === gt.i; const done = race && race.gi > gt.i;
      for (const s of [-1, 1]) { const bx = sx - Math.sin(gt.a) * 7 * S * s, by = sy + Math.cos(gt.a) * 7 * S * s + Math.round(Math.sin(t * 2.4 + s) * 1); ctx.fillStyle = 'rgba(20,40,70,0.4)'; ctx.fillRect(Math.round(bx) - 1, Math.round(by) + 1, 4, 2); ctx.fillStyle = done ? '#8a8a90' : s > 0 ? '#e0402e' : '#ffd23a'; ctx.fillRect(Math.round(bx) - 2, Math.round(by) - 2, 4, 4); ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 2, 1, 1); }
      if (next) { ctx.strokeStyle = 'rgba(56,224,200,0.8)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(sx - Math.sin(gt.a) * 7 * S, sy + Math.cos(gt.a) * 7 * S); ctx.lineTo(sx + Math.sin(gt.a) * 7 * S, sy - Math.cos(gt.a) * 7 * S); ctx.stroke(); ctx.setLineDash([]); }
    }
    if (Wt.start && !race) { const [sx, sy] = P2(Wt.start.x, Wt.start.y, left, top, S); const p = 1 + Math.sin(t * 3) * 0.08; ctx.strokeStyle = '#38e0c8'; ctx.beginPath(); ctx.ellipse(sx, sy, 10 * S * p, 8 * S * p, 0, 0, U.TAU); ctx.stroke(); U.text(ctx, 'WATER RACE', sx, sy - 8 * S - 10, { align: 'center', color: '#38e0c8' }); }
  };
  Wt.drawTop = function (ctx, left, top, S) {
    const k = Wt.board; if (!k) return;
    // a water police officer on your deck, mid-scuffle
    if (k.kind === 'deck') { const me = afloat(); if (me) { const [sx, sy] = P2(me.x - Math.sin(me.ang) * 1.2, me.y + Math.cos(me.ang) * 1.2, left, top, S); VH.drawRot(ctx, SP.person('#7fa6d8', '#1a2236', Math.floor(G().t * 8) % 3, { hat: 'cop' }), sx, sy - Math.round((me.waveZ || 0) * S * 0.35), me.ang + Math.PI / 2 + Math.sin(G().t * 9) * 0.3); } return; }
    // Kev mid-hop between boats
    if (k.kind !== 'kev' || k.landed) return;
    const f = Math.min(1, k.t / 0.6); const x = U.lerp(k.from.x, k.to.x, f), y = U.lerp(k.from.y, k.to.y, f); const z = Math.sin(f * Math.PI) * 2.2;
    const c = VH.Shops.look('cop'); const [sx, sy] = P2(x, y, left, top, S);
    ctx.fillStyle = 'rgba(20,20,45,0.35)'; ctx.fillRect(sx - 2, sy, 5, 3); VH.drawRot(ctx, SP.person(c.shirt, c.hair, 1, { hat: 'cop' }), sx, sy - z * S, Math.atan2(k.to.y - k.from.y, k.to.x - k.from.x));
  };
  Wt.lights = function (sources, glows) {
    const t = G().t;
    for (const gt of Wt.gates) for (const s of [-1, 1]) glows.push({ x: gt.x - Math.sin(gt.a) * 7 * s, y: gt.y + Math.cos(gt.a) * 7 * s, r: 0.8, col: s > 0 ? '#ff6050' : '#ffe060', a: 0.6 + 0.4 * Math.sin(t * 3 + gt.i) });
    for (const r of Wt.rampBuoys) glows.push({ x: r.x, y: r.y, r: 1, col: '#ffb060', a: 0.8 });
    if (Wt.start) sources.push({ x: Wt.start.x, y: Wt.start.y, r: 9, col: '#38e0c8', a: 0.4 });
  };

  // ================= HUD, help, map =================
  Wt.hud = function (ctx, ts) {
    const g = G(), w = ctx.canvas.width, h = ctx.canvas.height, C = VH.UI.C; const T2 = (s, x, y, o) => U.text(ctx, s, x, y, o);
    const r = Wt.race; const lines = [];
    if (r) {
      if (r.cd > 0) T2(String(Math.ceil(r.cd)), w / 2, h * 0.3, { align: 'center', color: C.teal, scale: ts * 6 });
      const me = afloat(); let pos = 1; if (me && r.mode === 'race') { const gate = Wt.gates[r.gi]; for (const v of r.rivals) { const rv = v.rival; if (rv.gi > r.gi || (rv.gi === r.gi && gate && dist(v, gate) < dist(me, gate)) || rv.done) pos++; } }
      lines.push([r.mode === 'race' ? `WATER RACE  ${['1ST', '2ND', '3RD', '4TH'][pos - 1]}` : 'BUOY TIME TRIAL', C.teal], [`GATE ${Math.min(r.gi + 1, Wt.gates.length)}/${Wt.gates.length}  ${VH.Acts.fmt(Math.max(0, r.t - r.bonus))}`, C.white]);
      if (r.mode === 'trial') lines.push([`BEST ${store('race:trial', 0) ? VH.Acts.fmt(store('race:trial', 0)) : '-'}`, C.dim]);
    }
    const me = afloat(); if (me && me.trick) { const n = VH.Tricks.names(me.trick); if (n.out.length) lines.push([n.out.join('+').slice(0, 24), C.hi]); }
    const k = Wt.board;
    if (k && k.kind === 'police') { const bw = Math.min(160 * ts, w * 0.6); VH.UI.panel(ctx, w / 2 - bw / 2, h * 0.24, bw, 24 * ts, { accent: C.red }); T2('BEING BOARDED! SPACE: SHOVE · W: GUN IT', w / 2, h * 0.24 + 4 * ts, { align: 'center', color: C.white, scale: ts }); ctx.fillStyle = '#2a2040'; ctx.fillRect(w / 2 - bw / 2 + 4 * ts, h * 0.24 + 14 * ts, bw - 8 * ts, 5 * ts); ctx.fillStyle = C.red; ctx.fillRect(w / 2 - bw / 2 + 4 * ts, h * 0.24 + 14 * ts, (bw - 8 * ts) * Math.min(1, k.t / 1.8), 5 * ts); }
    if (k && k.kind === 'cuffed') lines.push(['CUFFED ON DECK', '#9fd4ec'], [Wt.collector ? 'POLICE BOAT ON ITS WAY' : 'SHORE, OR H: POLICE BOAT', C.dim]);
    if (lines.length) {
      const x = VH.UI.leftX || 4 * ts, y = (VH.UI.leftBottom || 120 * ts) + 4 * ts, pw = VH.UI.leftW || 128 * ts, nC = Math.max(8, Math.floor((pw - 10 * ts) / (6 * ts))); // (the core's left column: same margin and width, compact on phones)
      VH.UI.panel(ctx, x, y, pw, (lines.length * 9 + 5) * ts, { accent: '#2e6ad8' });
      lines.forEach(([s, c], i) => T2(s.slice(0, nC), x + 5 * ts, y + 4 * ts + i * 9 * ts, { color: c, scale: ts })); VH.UI.leftBottom = y + (lines.length * 9 + 5) * ts;
    }
  };
  Wt.prompt = function () {
    const g = G(), me = afloat(), kE = I.touchMode ? 'GET OUT' : 'E', kS = I.touchMode ? 'SLIDE' : 'SPACE', kH = I.touchMode ? 'HORN' : 'H';
    if (me && g.char === 'cop' && Wt.boardable()) return `${kE} · BOARD THEM`;
    if (me && Wt.board && Wt.board.kind === 'cuffed') return Wt.collector ? 'THE POLICE BOAT IS COMING ALONGSIDE' : `${kH} · CALL THE POLICE BOAT (OR STEP ASHORE WITH ${kE})`;
    if (me && g.char === 'cop' && !Wt.board) { const h = Wt.hoons.find(h => h.hoon && h.rider && !h.driver && dist(h, me) < 45); if (h) return h.pullT > 0 ? 'PULL UP ALONGSIDE THEM, SLOWLY' : `${kH} · TELL THEM TO PULL OVER`; }
    if (me && me.def.jetski && !Wt.race && Wt.start && dist(me, Wt.start) < 12 && me.speed < 2.5) return `${kS} · RACE THE RIVALS   ${kH} · BUOY TIME TRIAL`;
    if (me && Wt.start && !Wt.race && me.def.jetski && dist(me, Wt.start) < 30) return 'STOP IN THE RING TO RACE';
    return '';
  };
  Wt.touchActions = () => { const me = afloat(); if (!me) return null; if (Wt.board && Wt.board.kind === 'police') return { id: 'action', label: 'SHOVE', priority: 97 }; return { id: 'action', label: me.def.jetski ? 'SLIDE' : 'SKID', priority: 58 }; };
  Wt.helpContext = () => { const me = afloat(); return me ? (me.def.jetski ? 'jetski' : 'boat') : ''; };
  Wt.markers = function () {
    const out = [];
    for (const b of Wt.boats) if (!b.removed && !b.driver) out.push(VH.RB.mark(b.x, b.y, b.def.jetski ? 'jetski' : 'speedboat'));
    if (Wt.start) out.push(VH.RB.mark(Wt.start.x, Wt.start.y, 'buoy'));
    return out;
  };
  Wt.targets = function () {
    const r = Wt.race; if (!r || r.cd > 0) return []; const gt = Wt.gates[r.gi]; return gt ? [{ x: gt.x, y: gt.y, label: gt.last ? 'FINISH' : 'GATE ' + (gt.i + 1), r: 8 }] : [];
  };
  Wt.camFocus = function () { const k = Wt.board; if (k && k.kind === 'kev' && !k.landed) return { x: (k.from.x + k.to.x) / 2, y: (k.from.y + k.to.y) / 2 }; return null; };
})(window.VH);
