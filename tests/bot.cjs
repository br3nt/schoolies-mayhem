// An input-only player for scripted playthroughs.
// It drives the game with key presses only (W/A/S/D, E, Space, Shift, H, Enter, Esc, arrows). It may look at the
// game (read-only peeks: where you are, the objective line, the prompt, the target arrows, what's on screen, the
// map) to decide which key to press, but it never sets game state, never teleports and never calls mission code.
// Path planning (A* over the map's ground grid, or the road graph) is done by a helper injected into the page that
// only reads the map, the same knowledge a player has from the screen and the full map.
'use strict';

// read-only helpers injected before the game loads; they never write to the game
const PAGE_HELPERS = `
window.__bot = {
  peek() {
    const g = VH.Game, pl = g.player, M = VH.Missions, T = VH.Tackle && VH.Tackle.on;
    if (!pl) return { state: g.state };
    const v = pl.vehicle;
    const tg = (M.targets ? M.targets() : []).filter(t => !t.small).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
    let prompt = VH.RB ? VH.RB.prompt() : '';
    if (!prompt && pl.onFoot && !pl.inShop) { const nv = g.nearestVehicle(pl.x, pl.y, g.ENTER_R); if (nv) prompt = VH.UI.enterPrompt(nv); }
    const S = VH.Sports, Fw = VH.Fireworks, Wt = VH.Water;
    return { fails: M.failCount || 0,
      state: g.state, stateT: g.stateT || 0, x: pl.x, y: pl.y, ang: pl.ang, onFoot: pl.onFoot, t: g.t,
      v: v ? { type: v.type || v.kind, boat: !!v.boat, jetski: !!(v.def && v.def.jetski), bike: !!(v.def && v.def.bike), x: v.x, y: v.y, ang: v.ang, speed: v.speed, fwd: v.fwdSpeed, z: v.z || 0, trailer: !!(v.trailer && v.trailer.on), rail: !!v.rail } : null,
      job: M.job ? { title: M.job.title, started: M.job.started } : null, obj: M.objective ? M.objective() : '', prompt,
      targets: tg.slice(0, 8).map(t => ({ x: t.x, y: t.y, label: t.label || '', r: t.r || 3 })),
      msgs: g.msgs.map(m => m.str), callout: g.callouts && g.callouts.cur ? g.callouts.cur.str : '', hour: g.hour, night: g.night, cash: g.cash, meter: g.meter,
      tackle: T ? { c: T.c, m: T.m, mv: T.mv, w: T.w, slip: T.slip ? T.slip.dir : null, mode: T.mode } : null,
      // what the HUD shows for the mini-games
      menu: S && S.menu ? { i: S.menu.i, items: S.menu.items.map(x => x.label) } : null,
      mini: S && S.mini ? (S.mini.kind === 'hoops' ? { kind: 'hoops', mode: S.mini.mode, ball: S.mini.ball.state, meter: S.mini.meter ? S.mini.meter.p : null, over: !!S.mini.over, hoop: S.mini.c.hoop, horse: S.mini.horse ? { you: S.mini.horse.you, kid: S.mini.horse.kid, phase: S.mini.horse.phase, setter: S.mini.horse.setter, spot: S.mini.horse.spot } : null, pts: S.mini.pts, streak: S.mini.streak }
        : { kind: 'bowls', phase: S.mini.phase, turn: S.mini.turn, end: S.mini.end, score: S.mini.score, hand: S.mini.hand, aim: S.mini.aim, meter: S.mini.meter ? S.mini.meter.p : null, jack: { x: S.mini.jack.x, y: S.mini.jack.y }, mat: S.green.mat, merv: S.mini.merv }) : null,
      jam: S && S.jam ? { t: S.jam.t, score: S.jam.score } : null,
      placing: Fw && Fw.placing ? { n: Fw.placing.n, ang: Fw.placing.ang, band: Fw.placing.band, bw: Fw.placing.bw } : null, susp: Fw ? Fw.susp : 0, show: Fw && Fw.show ? Fw.show.phase : null,
      race: Wt && Wt.race ? { cd: Wt.race.cd, gi: Wt.race.gi, n: Wt.gates.length, gate: Wt.gates[Wt.race.gi] || null } : null,
      board: Wt && Wt.board ? Wt.board.kind : null,
      err: g.lastError || null,
    };
  },
  // A* over the ground grid. mode 'foot' walks anything but buildings and open water; 'water' sails anything a boat
  // floats on (jetties and the causeway count, boats pass under them). Returns a smoothed list of points.
  path(x0, y0, x1, y1, mode, cell, margin) {
    const W = VH.World, Wt = VH.Water, GC = W.GC;
    const ok = mode === 'water' ? (x, y) => Wt.isWater(x, y) && (W.seaDist(x, y) < -6 || Wt.pierCells.has(W.cellIdx(x, y)) || W.groundAt(x, y) === GC.WATER)
      : (x, y) => { const g = W.groundAt(x, y); return g !== GC.BUILDING && g !== GC.SEA && g !== GC.WATER; };
    const bx0 = Math.min(x0, x1) - margin, by0 = Math.min(y0, y1) - margin, bx1 = Math.max(x0, x1) + margin, by1 = Math.max(y0, y1) + margin;
    const nx = Math.ceil((bx1 - bx0) / cell), ny = Math.ceil((by1 - by0) / cell); if (nx * ny > 900000) return null;
    const idx = (i, j) => j * nx + i, cx = i => bx0 + (i + 0.5) * cell, cy = j => by0 + (j + 0.5) * cell;
    const pass = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pass[idx(i, j)] = ok(cx(i), cy(j)) ? 1 : 0;
    // railings, fences and walls (bridges, the causeway) are solid for people: rasterise them into the grid
    if (mode !== 'water') W.wallGrid.query(bx0, by0, bx1, by1, sg => { if (!sg.wall) return; const L = Math.hypot(sg.bx - sg.ax, sg.by - sg.ay); for (let d = 0; d <= L; d += cell * 0.4) { const t = d / (L || 1); const i = Math.floor((sg.ax + (sg.bx - sg.ax) * t - bx0) / cell), j = Math.floor((sg.ay + (sg.by - sg.ay) * t - by0) / cell); if (i >= 0 && j >= 0 && i < nx && j < ny) pass[idx(i, j)] = 0; } });
    const near = (x, y) => { let bi = Math.floor((x - bx0) / cell), bj = Math.floor((y - by0) / cell); if (pass[idx(bi, bj)]) return [bi, bj]; for (let r = 1; r < 30; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = bi + di, j = bj + dj; if (i >= 0 && j >= 0 && i < nx && j < ny && pass[idx(i, j)]) return [i, j]; } return null; };
    const s = near(x0, y0), e = near(x1, y1); if (!s || !e) return null;
    const G = new Float32Array(nx * ny).fill(1e9), came = new Int32Array(nx * ny).fill(-1), closed = new Uint8Array(nx * ny);
    const heap = []; const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const sk = idx(s[0], s[1]), ek = idx(e[0], e[1]); G[sk] = 0; push(0, sk);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, it = 0;
    while (heap.length && it++ < 2000000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === ek) { found = true; break; }
      const i = k % nx, j = (k - i) / nx;
      for (const [di, dj, c] of D) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const kk = idx(a, b); if (!pass[kk] || closed[kk]) continue; if (di && dj && (!pass[idx(i + di, j)] || !pass[idx(i, j + dj)])) continue; const ng = G[k] + c; if (ng < G[kk]) { G[kk] = ng; came[kk] = k; push(ng + Math.hypot(a - e[0], b - e[1]), kk); } }
    }
    if (!found) return null;
    const raw = []; for (let k = ek; k !== -1; k = came[k]) { const i = k % nx, j = (k - i) / nx; raw.push([cx(i), cy(j)]); } raw.reverse();
    // smooth: skip ahead while the straight line stays passable
    const clear = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d <= L; d += cell * 0.5) { const t = d / (L || 1); const i = Math.floor((a[0] + (b[0] - a[0]) * t - bx0) / cell), j = Math.floor((a[1] + (b[1] - a[1]) * t - by0) / cell); if (i < 0 || j < 0 || i >= nx || j >= ny || !pass[idx(i, j)]) return false; } return true; };
    const out = [raw[0]]; let i = 0; while (i < raw.length - 1) { let j = raw.length - 1; while (j > i + 1 && !clear(raw[i], raw[j])) j--; out.push(raw[j]); i = j; }
    out.push([x1, y1]);
    return out;
  },
  route(x0, y0, x1, y1) { return VH.AI.route(x0, y0, x1, y1); },
  // the nearest thing you could borrow (what the "E · BORROW" prompt would offer when you walk up to it)
  nearestCar(x, y, kinds) {
    let best = null, bd = 1e9;
    for (const v of VH.Game.vehicles) { if (v.removed || v.sinking || v.rail || v.police || v.patrol || v.block || v.backup || v.scripted || v.watch || v.boat || (v.def && v.def.heli) || v.dead || v.ai || v.type === 'truck') continue;
      const k = v.def.motor ? 'moto' : v.def.bike ? 'bike' : v.def.gopher ? 'gopher' : 'car'; if (kinds && !kinds.includes(k) && !kinds.includes(v.type)) continue;
      const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = { x: v.x, y: v.y, d, k, type: v.type }; } }
    return best;
  },
  boats(x, y) { return VH.Water.boats.filter(b => !b.removed && !b.driver).map(b => ({ x: b.x, y: b.y, type: b.type, jetski: !!b.def.jetski, trailer: !!(b.trailer && b.trailer.on), d: Math.hypot(b.x - x, b.y - y) })).sort((a, b) => a.d - b.d); },
  isWater(x, y) { return VH.Water.isWater(x, y); },
  ground(x, y) { return VH.World.groundAt(x, y); },
  hoons() { return VH.Water.hoons.filter(h => !h.removed && h.hoon && h.rider && !h.driver).map(h => ({ x: h.x, y: h.y, vx: h.vx, vy: h.vy, speed: h.speed, ang: h.ang })); },
  policeBoat() { const b = VH.Police.boat; return b ? { x: b.x, y: b.y, beam: b.beam || b.ang } : null; },
  kickers(park) { const p = VH.Sports[park]; return p ? p.obs.filter(o => o.k === 'kick').map(o => ({ x: o.x, y: o.y, a: o.a, L: o.L })) : []; },
  pad(park) { const p = VH.Sports[park]; return p ? { x: p.pad.x, y: p.pad.y } : null; },
  court(i) { const c = VH.Sports.courts[i]; return c ? { x: c.box.x, y: c.box.y, hoop: c.hoop, face: c.face } : null; },
  mat() { const g = VH.Sports.green; return g ? { x: g.mat.x, y: g.mat.y, ang: g.box.ang } : null; },
  // the line Merv sees on his home green (the guide is drawn on screen for him): where would this bowl stop?
  bowlGuide(p) { const m = VH.Sports.mini; if (!m) return null; const r = VH.Sports._sim ? VH.Sports._sim(m.aim, m.hand, p) : null; return r; },
  racePad() { return VH.Water.start ? { x: VH.Water.start.x, y: VH.Water.start.y } : null; },
  kickables(x, y, r) { const out = []; VH.Props.near(x, y, r, p => { if (VH.Props.KICKABLE.includes(p.k) && !p.fly && p.up !== false && Math.hypot(p.x - x, p.y - y) < r) out.push({ x: p.x, y: p.y, d: Math.hypot(p.x - x, p.y - y) }); }); return out.sort((a, b) => a.d - b.d).slice(0, 8); }, // (bins and cones you can see)
  savedSites() { return VH.U.store.get('fw:sites:' + VH.Game.char, []); }, // (what's saved with the night)
  policeCars() { return VH.Police.units.filter(v => !v.removed).map(v => ({ x: v.x, y: v.y, speed: v.speed })); }, // (the patrol cars on the minimap)
  sites() { return VH.Fireworks.SITES.map(s => ({ id: s.id, x: s.x, y: s.y, set: VH.Fireworks.sites.includes(s) })); },
  view() { return VH.Fireworks.view; },
  visibleBoxSafe() { return VH.Fireworks && VH.Fireworks.visibleBox ? VH.Fireworks.visibleBox() : null; },
  wharf() { const w = VH.Water.wharf; return w && w.moor ? { x: w.moor.x, y: w.moor.y } : null; },
  ramps() { return VH.Water.ramps.map(r => ({ name: r.name, top: r.top, water: r.water })); },
};
`;

const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class Bot {
  constructor(page, name) { this.page = page; this.name = name; this.held = new Set(); this.keylog = []; this.t0 = Date.now(); this.notes = []; }
  log(s) { this.notes.push(`[${this.gameT ? this.gameT.toFixed(1) : '0.0'}] ${s}`); }
  async tick(ms = 80) { await this.page.clock.runFor(ms); }
  // every toast and callout the bot has seen (they only stay up for a couple of seconds)
  saw(re) { return (this.seen || []).find(m => re.test(m)) || null; }
  async peek() { const s = await this.page.evaluate(() => window.__bot.peek()); this.gameT = s.t; this.last = s; this.seen = this.seen || []; for (const m of [...(s.msgs || []), s.callout, s.prompt].filter(Boolean)) if (!this.seen.includes(m)) { this.seen.push(m); } if (s.err && !this.errSeen) { this.errSeen = true; this.log('GAME ERROR: ' + s.err.slice(0, 200)); } return s; }
  async call(fn, ...args) { return this.page.evaluate(([fn, args]) => window.__bot[fn](...args), [fn, args]); }
  // hold exactly this set of keys
  async hold(keys) {
    const want = new Set(keys);
    for (const k of this.held) if (!want.has(k)) { await this.page.keyboard.up(k); this.keylog.push(`-${k}`); }
    for (const k of want) if (!this.held.has(k)) { await this.page.keyboard.down(k); this.keylog.push(`+${k}`); }
    this.held = want;
  }
  async press(k, n = 1) { for (let i = 0; i < n; i++) { await this.hold([]); await this.page.keyboard.down(k); await this.tick(50); await this.page.keyboard.up(k); this.keylog.push(k); await this.tick(60); } }
  async wait(ms) { await this.hold([]); await this.tick(ms); }
  // keep going until fn(state) is truthy (returns the state) or the game time runs out
  async until(fn, maxSec, every = 100) { const end = (await this.peek()).t + maxSec; for (;;) { const s = await this.peek(); if (fn(s)) return s; if (s.t > end) return null; await this.tick(every); } }

  // dismiss a job brief or a card like a player (Enter)
  async handleCards(s) {
    if (s.state === 'brief' && s.stateT > 1) { await this.press('Enter'); this.log('brief: Enter'); return true; }
    if ((s.state === 'lockedUp' || s.state === 'nightEnd' || s.state === 'sunrise') && s.stateT > 1.3) { await this.press('Enter'); this.log(s.state + ': Enter'); return true; }
    if (s.state === 'ride') { await this.press('Enter'); return true; }
    return false;
  }
  // the struggle: keep the mark in the green, and press the way SLIP says
  async struggle(s) {
    const k = s.tackle; if (!k) return false;
    // where the mark will be in a moment (it has momentum) against the middle of the green zone
    const keys = k.m + (k.mv || 0) * 0.3 < k.c ? ['Space'] : [];
    if (this.giveUp) keys.length = 0;
    await this.hold(keys);
    if (k.slip && !this.giveUp) { const key = k.slip < 0 ? 'ArrowLeft' : 'ArrowRight'; await this.page.keyboard.down(key); await this.tick(30); await this.page.keyboard.up(key); this.keylog.push(key); }
    return true;
  }

  // one steering update toward a point; returns the keys to hold
  steerKeys(s, p, opts = {}) {
    const me = s.v || s; const heading = s.v ? s.v.ang : s.ang;
    const da = angDiff(heading, Math.atan2(p.y - me.y, p.x - me.x)); const d = dist(me, p);
    const keys = [];
    const turnTol = opts.tol != null ? opts.tol : s.v ? 0.12 : 0.18;
    if (s.v && s.v.z > 0) return []; // in the air: hands off (no accidental tricks)
    if (da > turnTol) keys.push('KeyD'); else if (da < -turnTol) keys.push('KeyA');
    const speed = s.v ? s.v.speed : 0;
    const maxV = opts.maxV || (s.v ? 30 : 99);
    if (s.v) {
      const slowFor = Math.abs(da) > 1.2 ? 4 : Math.abs(da) > 0.6 ? 9 : maxV;
      const brakeDist = opts.stop ? Math.max(4, speed * speed / 14) : 0;
      if (opts.stop && d < brakeDist + 2) { if (speed > 1.2) keys.push('KeyS'); }
      else if (speed < slowFor) keys.push('KeyW');
      else if (speed > slowFor + 4) keys.push('KeyS');
    } else if (Math.abs(da) < 1.1 && d > (opts.arrive || 0.6)) { keys.push('KeyW'); if (d > 10 && Math.abs(da) < 0.4 && !s.water && !opts.noSprint) keys.push('ShiftLeft'); } // sprint on the straights
    return keys;
  }
  // follow a list of points; stops when within `arrive` of the last one
  async followPath(path, opts = {}) { path = path.slice();
    let i = 1, stuckT = 0, lastPos = null, lastCheck = 0, bestD = 1e9, bestT = 0, wp = -1, replans = 0; const arrive = opts.arrive || 1.5; const maxSec = opts.maxSec || 400;
    const s0 = await this.peek(); const end = s0.t + maxSec;
    while (i < path.length) {
      const s = await this.peek();
      if (await this.handleCards(s)) continue;
      if (s.tackle) { await this.struggle(s); await this.tick(80); continue; }
      if (s.state !== 'play') { await this.tick(150); continue; }
      if (opts.abort && opts.abort(s)) { await this.hold([]); return 'abort'; }
      if (s.t > end) { await this.hold([]); return 'timeout'; }
      // walking, and suddenly driving: Round A gets you in when you walk into a driver's door. Out again, carry on
      if (s0.onFoot && !s.onFoot && s.v && !(s.v.boat)) { this.log(`walked into a ${s.v.type}'s door and got in: getting out`); await this.getOut(); continue; }
      const me = s.v || s; const p = { x: path[i][0], y: path[i][1] };
      const last = i === path.length - 1;
      const reach = last ? arrive : (s.v ? (s.v.boat ? 12 : 7) : 2.2);
      if (dist(me, p) < reach) { i++; continue; }
      // no progress toward this waypoint for a few seconds (sliding along a wall, say): plan again from here
      if (wp !== i) { wp = i; bestD = dist(me, p); bestT = s.t; } else if (dist(me, p) < bestD - 1) { bestD = dist(me, p); bestT = s.t; }
      else if (s.t - bestT > 5 && opts.replan && replans < 6) { replans++; this.log('no progress: planning again'); const np = await opts.replan(me); if (np && np.length > 1) { path = np; i = 1; wp = -1; } await this.hold(s.v ? ['KeyS'] : [Math.random() < 0.5 ? 'KeyA' : 'KeyD']); await this.tick(s.v ? 900 : 350); continue; }
      await this.hold([...this.steerKeys(s, p, { stop: last && opts.stop, maxV: opts.maxV, arrive }), ...(opts.extraKeys || [])]);
      // stuck? (wedged on a wall, a fence, a parked car, a beach) back off and swing round
      if (s.t - lastCheck > 1.5) { if (lastPos && dist(lastPos, me) < 0.8 && this.held.has('KeyW')) stuckT++; else stuckT = 0; lastPos = { x: me.x, y: me.y }; lastCheck = s.t; }
      if (stuckT >= 2) { stuckT = 0; this.log('stuck: backing off'); if (s.v) { await this.hold(['KeyS', Math.random() < 0.5 ? 'KeyA' : 'KeyD']); await this.tick(1200); } else { await this.hold([Math.random() < 0.5 ? 'KeyA' : 'KeyD']); await this.tick(400); await this.hold(['KeyW']); await this.tick(700); } }
      await this.tick(70);
    }
    if (opts.stop) { for (let k = 0; k < 120; k++) { const q = await this.peek(); if (!q.v || q.v.speed < 1) break; await this.hold(q.v.fwd > 0.5 ? ['KeyS'] : q.v.fwd < -0.5 ? ['KeyW'] : []); await this.tick(50); } }
    await this.hold([]);
    return 'ok';
  }
  async walkTo(p, arrive = 1.2, maxSec = 300) {
    const s = await this.peek(); if (dist(s, p) < arrive) return 'ok';
    const plan = async me => (await this.call('path', me.x, me.y, p.x, p.y, 'foot', 2, 60 + 30 * Math.random())) || [[me.x, me.y], [p.x, p.y]];
    return this.followPath(await plan(s), { arrive, maxSec, replan: plan });
  }
  async sailTo(p, opts = {}) {
    const s = await this.peek(); const me = s.v || s;
    const plan = async q => (await this.call('path', q.x, q.y, p.x, p.y, 'water', 6, 250)) || [[q.x, q.y], [p.x, p.y]];
    return this.followPath(await plan(me), { replan: plan, arrive: opts.arrive || 10, stop: opts.stop !== false, maxV: opts.maxV || 30, maxSec: opts.maxSec || 400, abort: opts.abort });
  }
  async driveTo(p, opts = {}) {
    const s = await this.peek();
    const r = await this.call('route', s.x, s.y, p.x, p.y);
    const path = [[s.x, s.y], ...(r || []).map(q => [q[0], q[1]])]; if (!r) path.push([p.x, p.y]);
    return this.followPath(path, { arrive: opts.arrive || 8, stop: true, maxV: opts.maxV || 17, maxSec: opts.maxSec || 400, abort: opts.abort });
  }
  // get in (or out) with E, like a player standing at the door
  async getIn(maxTry = 6) { for (let i = 0; i < maxTry; i++) { const s = await this.peek(); if (!s.onFoot) return true; if (s.tackle) { for (let k = 0; k < 400; k++) { const t = await this.peek(); if (!t.tackle) break; await this.struggle(t); await this.tick(70); } i--; continue; } await this.press('KeyE'); await this.tick(200); } return !(await this.peek()).onFoot; }
  async getOut(maxTry = 8) { for (let i = 0; i < maxTry; i++) { let s = await this.peek(); if (s.onFoot) return true; if (s.v && s.v.speed > 3) { await this.hold(['KeyS']); await this.tick(400); await this.hold([]); continue; } await this.press('KeyE'); await this.tick(250); } return (await this.peek()).onFoot; }
  // walk up to the nearest car and borrow it
  async borrowCar(kinds) {
    const s = await this.peek(); const c = await this.call('nearestCar', s.x, s.y, kinds || ['car']); if (!c) return false;
    this.log(`borrowing a ${c.type} ${c.d.toFixed(0)}m away`);
    await this.walkTo(c, 1.4, 120); await this.getIn();
    // got into something else parked alongside? out, step closer, try again
    let q = await this.peek(); if (q.v && kinds && !kinds.includes(q.v.type) && !(kinds.includes('car') && !q.v.bike && !q.v.boat) && !(kinds.includes('bike') && q.v.bike)) { await this.getOut(); await this.walkTo(c, 0.6, 30); await this.getIn(); q = await this.peek(); }
    return !q.onFoot;
  }
  // travel anywhere on land: walk if close, otherwise borrow a car, drive by road, then walk the last bit
  async goLand(p, arrive = 1.5) {
    let s = await this.peek();
    if (s.v && s.v.boat) await this.getOut();
    s = await this.peek();
    if (s.v && !s.v.boat && !s.v.rail && dist(s, p) > 60) { await this.driveTo(p, { arrive: 20 }); await this.getOut(); return this.walkTo(p, arrive); } // already on wheels: ride there
    if (dist(s, p) > 1200) { // walk anything up to a couple of kilometres (the bot's walking is surer than its driving in traffic)
      if (s.onFoot) await this.borrowCar();
      s = await this.peek();
      if (!s.onFoot) { await this.driveTo(p, { arrive: 25 }); await this.getOut(); }
    } else if (!s.onFoot && !(s.v && s.v.boat)) await this.getOut();
    return this.walkTo(p, arrive);
  }
}
module.exports = { Bot, PAGE_HELPERS, angDiff, dist };
