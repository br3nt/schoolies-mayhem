// Input-only playthroughs. A bot plays the game through the keyboard alone: it steers toward what the screen shows
// (the job's targets and their arrows), presses whatever the prompt line says ("E · CUFF", "SPACE · RING THE
// DOORBELL", "H · MEGAPHONE"...), plays the struggle by its visible bar and SLIP cues, and clicks through briefs,
// chats and end-of-night cards. It never writes game state: it only reads what's on screen (targets, prompt,
// objective, the struggle bar) plus a route planner (the same A* the walkers use) to choose its keys.
// If the bot needs to know something the screen doesn't show, that's a missing prompt: fix the game, not the bot.
// The exceptions are labelled: mayhem-ramp and merv-gentle are engine checks that set the meter directly.
//
//   cd game && python3 -m http.server 4433 &
//   node tests/playthrough.mjs                  # every night of every character
//   node tests/playthrough.mjs cop:2 grump:1     # just those nights
//   node tests/playthrough.mjs scenario:escort-foot   # one of the scenarios at the bottom
// Needs Playwright (npm i -D playwright, or NODE_PATH pointing at an install). BASE=http://... to point elsewhere.
// Prints one line per job (pass/fail, time) and exits non-zero if anything failed.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
// Round B: Jaz's fireworks night is played by the sailing bot (roundb.cjs, bot.cjs, playwright-core), loaded only when asked for
const RB = { NIGHTS: { schoolie: { 4: 4 } }, has: (c, n) => !!(RB.NIGHTS[c] || {})[n], count: c => Math.max(0, ...Object.keys(RB.NIGHTS[c] || {}).map(Number)), jobs: (c, n) => RB.NIGHTS[c][n], playNight: (...a) => require('./roundb.cjs').playNight(...a) };
const BASE = process.env.BASE || 'http://localhost:4433/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TICK = 70;

// ---------- what the screen shows (read only) ----------
const peek = () => {
  const G = VH.Game, M = VH.Missions, pl = G.player, v = pl && pl.vehicle, T = VH.Tackle.on;
  if (!pl) return { st: G.state };
  return {
    st: G.state, t: G.t, x: pl.x, y: pl.y, ang: pl.ang, onFoot: pl.onFoot, water: pl.water || 0, inShop: !!pl.inShop, shopOut: pl.inShop ? { x: pl.inShop.door.x - pl.inShop.door.nx * 0.3, y: pl.inShop.door.y - pl.inShop.door.ny * 0.3 } : null, aboard: !!pl.aboard, dizzy: pl.dizzyT > 0 || pl.rollT > 0,
    char: G.char, v: v ? { dead: !!v.dead || !!v.sinking, x: v.x, y: v.y, ang: v.ang, speed: v.speed, fwd: v.fwdSpeed, rail: !!v.rail, slow: !!(v.def && (v.def.gopher || v.def.bike)), type: v.type || v.kind, siren: !!v.siren, police: v.type === 'police' || v.type === 'paddy' || !!v.roofLight } : null,
    job: M.job && M.job.started ? M.job.title : null, next: M.job ? M.job.title : null, idx: M.idx, fails: M.failCount || 0, night: G.night, nights: M.nightCount(G.char), obj: M.objective() || '', prompt: (VH.UI.lastPrompt || ''),
    targets: M.targets().map(t => ({ x: t.x, y: t.y, label: t.label || '', small: !!t.small, col: t.col || '' })),
    mine: G.myMarkers().map(m => ({ x: m.x, y: m.y, label: m.label })),
    tackle: T ? { m: T.m, c: T.c, w: T.w, slip: T.slip ? T.slip.dir : 0, done: !!T.done } : null,
    msgs: G.msgs.map(m => m.str), chat: !!VH.Shops.chat, hour: G.hour,
    traffic: G.vehicles.filter(q => q.ai && !q.removed && !q.police && !q.patrol && !q.rail && !(q.def.gopher || q.def.bike) && Math.hypot(q.x - pl.x, q.y - pl.y) < 70).map(q => ({ x: q.x, y: q.y, ang: q.ang, speed: q.speed })),
  };
};
// every job target you'd have to walk or ride to must be reachable from the street (VH.Spawn.reachable: a flood over
// the walkers' grid out to a road). Targets on a moving vehicle are skipped (they're wherever the vehicle is).
// A target inside a shop or desk (the fish shop's counter, the lock-up desk) is reached through its door.
const unreachable = () => VH.Missions.targets().filter(t => {
  if (t.via || VH.Game.vehicles.some(v => !v.removed && Math.hypot(v.x - t.x, v.y - t.y) < 4) || VH.Game.peds.some(p => Math.hypot(p.x - t.x, p.y - t.y) < 1.5)) return false; // on a vehicle or a person on the move, or reached by rail
  const sh = VH.Shops.list.find(s => s.b && VH.U.pointInPoly(t.x, t.y, s.b.p)); const q = sh ? { x: sh.door.x - sh.door.nx * 1.2, y: sh.door.y - sh.door.ny * 1.2 } : t;
  return !VH.Spawn.reachable(q.x, q.y);
}).map(t => (t.label || 'TARGET') + '@' + Math.round(t.x) + ',' + Math.round(t.y));
// route planners (the walkers' A* on foot, the constable's road A* in a vehicle): read only, used to pick keys
const routeFoot = ([x0, y0, x1, y1]) => { const N = VH.Nav, c = N.calls; const p = N.path(x0, y0, x1, y1, { maxIter: 20000 }); N.calls = c; return p; };
// a goal off the road network (the golf course, a park): drive to the nearest road point, then the last bit
// (the nearest kerb slot to the goal: kerbs are only baked on the main road network, so the route joins up)
const routeRoad = ([x0, y0, x1, y1]) => { const W = VH.World; if (!W.nearestEdge(x0, y0, 80)) return null; const k = VH.Spawn.pick('kerb', { near: { x: x1, y: y1 }, maxDist: 900, nearest: true, optional: true }); const n = k || W.nearestEdge(x1, y1, 80); if (!n) return null; const r = VH.AI.route(x0, y0, n.x, n.y); return r ? r.concat([[x1, y1]]) : null; };
const nearestCar = ([x, y, r, notSlow]) => { const G = VH.Game; let best = null, bd = r; for (const v of G.vehicles) { if (v.removed || v.sinking || v.police || v.patrol || v.block || v.backup || v.scripted || v.watch || v.delivery || v.missionDrive || v.rail || v.dead || (v.def && v.def.heli)) continue; if (notSlow && v.def && (v.def.gopher || v.def.bike)) continue; const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = { x: v.x, y: v.y, ang: v.ang, d } } } return best; };
// a hiding place a careful player would pick: well away from the door, round a corner (no line of sight back to it)
const hideSpot = ([dx, dy, x, y]) => { const N = VH.Nav, AI = VH.AI; let best = null, bd = 1e9;
  for (let r = 34; r <= 60; r += 6) for (let a = 0; a < 6.28; a += 0.26) { const hx = dx + Math.cos(a) * r, hy = dy + Math.sin(a) * r;
    if (!N.walkable(hx, hy) || AI.los(dx, dy, hx, hy)) continue; const p = N.path(x, y, hx, hy, { maxIter: 8000 }); if (!p) continue;
    let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (len < bd) { bd = len; best = { x: hx, y: hy }; } }
  return best; };
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class Bot {
  constructor(page, log) { this.page = page; this.held = new Set(); this.log = log; this.tap = {}; this.route = null; this.routeFor = null; this.stuckT = 0; this.reverseT = 0; this.mode = null; }
  async keys(want) { // hold exactly these keys
    for (const k of [...this.held]) if (!want.has(k)) { await this.page.keyboard.up(k); this.held.delete(k); }
    for (const k of want) if (!this.held.has(k)) { await this.page.keyboard.down(k); this.held.add(k); }
  }
  async press(k, cool = 600) { const now = Date.now(); if (this.tap[k] && now - this.tap[k] < cool) return false; this.tap[k] = now; await this.keys(new Set()); await this.page.keyboard.press(k); return true; }
  async peek() { return this.page.evaluate(peek); }
  // steer toward a point: on foot (turn with A/D, walk with W, sprint far away) or driving (route along the roads)
  async goTo(s, goal, opt = {}) {
    const want = new Set(); const arrive = opt.arrive ?? 2;
    if (s.onFoot) {
      const d = dist(s, goal); if (d < arrive) return this.keys(want).then(() => true);
      const key = Math.round(goal.x / 3) + ',' + Math.round(goal.y / 3);
      // stuck against something on foot: plan again, and sidestep for a moment
      const moved = this.lastFoot ? Math.hypot(s.x - this.lastFoot.x, s.y - this.lastFoot.y) : 9; if (moved > 0.6 || !this.held.has('KeyW')) { this.lastFoot = { x: s.x, y: s.y, t: Date.now() }; } else if (Date.now() - this.lastFoot.t > 1800) { this.lastFoot = null; this.route = null; this.sideT = Date.now() + 600; this.side = Math.random() < 0.5 ? 'KeyA' : 'KeyD'; }
      if (this.sideT > Date.now()) { await this.keys(new Set(['KeyW', this.side])); return false; }
      if (this.routeFor !== key || !this.route || this.routeT < Date.now() - 4000) {
        this.route = opt.direct ? null : await this.page.evaluate(routeFoot, [s.x, s.y, goal.x, goal.y]);
        // too far for the walkers' planner: follow the streets (the road planner), walking to a point a little way along
        if (!this.route && !opt.direct && d > 60) { const rr = await this.page.evaluate(routeRoad, [s.x, s.y, goal.x, goal.y]); if (rr && rr.length) { const leg = rr.find(q => Math.hypot(q[0] - s.x, q[1] - s.y) > 60) || rr[rr.length - 1]; this.route = await this.page.evaluate(routeFoot, [s.x, s.y, leg[0], leg[1]]) || rr; } }
        this.routeFor = key; this.routeT = Date.now(); this.ri = 0; }
      let wp = goal; if (this.route && this.route.length) { while (this.ri < this.route.length - 1 && Math.hypot(this.route[this.ri][0] - s.x, this.route[this.ri][1] - s.y) < 1.5) this.ri++; wp = { x: this.route[this.ri][0], y: this.route[this.ri][1] }; }
      const da = angDiff(s.ang, Math.atan2(wp.y - s.y, wp.x - s.x));
      if (da > 0.18) want.add('KeyD'); else if (da < -0.18) want.add('KeyA');
      if (Math.abs(da) < 1.1) want.add('KeyW'); if (d > (opt.sprintBeyond ?? 8) && Math.abs(da) < 0.5 && !s.water) want.add('ShiftLeft');
      await this.keys(want); return false;
    }
    const v = s.v; if (v.rail) return false;
    if (v.dead) { if (v.speed < 3) await this.press('KeyE', 900); return false; } // wrecked: out, and find another way
    const d = dist(v, goal);
    const key = Math.round(goal.x / 8) + ',' + Math.round(goal.y / 8);
    if (this.routeFor !== key || !this.route || this.routeT < Date.now() - 5000) { this.route = d > 25 && !opt.direct ? await this.page.evaluate(routeRoad, [v.x, v.y, goal.x, goal.y]) : null; this.routeFor = key; this.routeT = Date.now(); this.ri = 0; }
    let wp = goal; if (this.route && this.route.length) { const look = Math.max(7, v.speed * 0.7); while (this.ri < this.route.length - 1 && Math.hypot(this.route[this.ri][0] - v.x, this.route[this.ri][1] - v.y) < look) this.ri++; wp = { x: this.route[this.ri][0], y: this.route[this.ri][1] }; }
    let da = angDiff(v.ang, Math.atan2(wp.y - v.y, wp.x - v.x));
    // stuck against something: back up with the wheel the other way
    if (this.reverseT > Date.now()) { want.add('KeyS'); want.add(this.revSteer); await this.keys(want); return false; }
    if (v.speed < 0.8 && d > arrive + 2 && this.held.has('KeyW')) { this.stuckT += TICK; if (this.stuckT > 1600) { this.stuckT = 0; this.reverseT = Date.now() + 1100; this.revSteer = da > 0 ? 'KeyA' : 'KeyD'; } } else this.stuckT = 0;
    const cruise = s.char === 'cop' ? 24 : d > 400 ? 21 : 16; // drive like you'd like to keep your licence (and the gossip down)
    const vmax = opt.ram ? 99 : Math.min(opt.vmax ?? cruise, Math.abs(da) > 0.45 ? 9 : 99, Math.max(3, (d - arrive) * 0.9), Math.abs(da) > 0.8 ? 7 : 99);
    if (da > 0.06) want.add('KeyD'); else if (da < -0.06) want.add('KeyA');
    if (d < arrive) { if (v.speed > 0.6) want.add('KeyS'); await this.keys(want); return v.speed < 1.5; }
    if (v.speed < vmax) want.add('KeyW'); else if (v.speed > vmax + 3) want.add('KeyS');
    await this.keys(want); return false;
  }
}

// ---------- tactics: which target, which vehicle, and when to press what ----------
const T = {};
const by = (s, re) => s.targets.filter(t => re.test(t.label));
const nearest = (s, list) => list.slice().sort((a, b) => dist(a, s) - dist(b, s))[0];
const jobTarget = s => nearest(s, s.targets.filter(t => !t.small && !/COVER|REAR DOOR|DESK|DOOR$|RESPRAY/.test(t.label))) || nearest(s, s.targets.filter(t => t.small));
async function act(bot, s) {
  const p = s.prompt;
  // presses straight off the prompt line
  if (/^E · (CUFF|GRAB|PUT IN CAR|TAKE OUT|HAND OVER|LEAP ABOARD)/.test(p)) return bot.press('KeyE', 700);
  if (/^SPACE · /.test(p)) return bot.press('Space', 700);
  if (/^H · (MEGAPHONE|SHOUT|CALL)/.test(p)) return bot.press('KeyH', 1500);
  if (/^H: SIREN/.test(p) && s.job && /GOPHER|TRAM|EXPRESS|HOON/.test(s.job)) return bot.press('KeyH', 1500);
  if (/^L: /.test(p) && s.job === 'GOPHER PATROL') return bot.press('KeyL', 1500);
  return false;
}
// get into a vehicle: walk to it and press E when the prompt offers it
async function board(bot, s, car) { if (dist(s, car) < 3.5 && /^E · /.test(s.prompt) && !/CUFF|GRAB|HAND OVER|TAKE OUT|PUT IN/.test(s.prompt)) return bot.press('KeyE', 900); return bot.goTo(s, car, { arrive: 1.2 }); } // only the one it walked up to
async function getOut(bot, s) { if (s.v && s.v.speed < 3) return bot.press('KeyE', 900); return bot.keys(new Set(['KeyS'])); }
// the general plan: go to the job's target, borrowing a car when it's a long way (and the job allows)
async function travel(bot, s, goal, o = {}) {
  if (s.shopOut && dist(s, goal) > 15) return bot.goTo(s, s.shopOut, { arrive: 0.1, sprintBeyond: 99, direct: true }); // wandered into a shop on the way: back out the door
  const far = dist(s, goal) > (o.carBeyond ?? 220);
  if (s.char === 'grump' && !o.allowCar) { o = { ...o, keepSlow: true, footOnly: s.onFoot && !o.footOnly ? false : o.footOnly }; if (s.onFoot && far) { const m = s.mine.find(q => /GOPHER/.test(q.label)); if (m) return board(bot, s, m); } } // Merv sticks to his gopher (a borrowed car isn't gentle)
  if (s.onFoot && far && !o.footOnly && !(s.char === 'grump' && !o.allowCar)) { const c = await bot.page.evaluate(nearestCar, [s.x, s.y, 90, true]); if (c) return board(bot, s, c); }
  if (!s.onFoot && s.v.slow && far && !o.keepSlow) { const c = await bot.page.evaluate(nearestCar, [s.x, s.y, 60, true]); if (c) return getOut(bot, s); }
  if (!s.onFoot && (o.footOnly || (o.footWithin && dist(s, goal) < o.footWithin))) return getOut(bot, s);
  return bot.goTo(s, goal, o);
}
T.default = async (bot, s) => { const g = jobTarget(s); if (g) return travel(bot, s, g, { arrive: 2 }); return bot.keys(new Set()); };
T['CHIP RUN'] = async (bot, s) => travel(bot, s, jobTarget(s), { arrive: 1, footOnly: true, sprintBeyond: 2 });
// careful: once the bell's rung, run well clear and round a corner, then into cover and keep still
T['DING DONG DITCH'] = async (bot, s) => {
  if (/RUN!|GET AWAY/.test(s.prompt + s.obj) || (bot.ditch && /HIDE/.test(s.obj) && !bot.ditch.there)) {
    if (!bot.ditch) { bot.ditch = { door: { x: s.x, y: s.y } }; bot.ditch.spot = await bot.page.evaluate(hideSpot, [s.x, s.y, s.x, s.y]); }
    const sp = bot.ditch.spot; if (sp && dist(s, sp) > 2) return bot.goTo(s, sp, { arrive: 2, sprintBeyond: 1 }); bot.ditch.there = true;
  }
  if (/HIDDEN/.test(s.prompt)) return bot.keys(new Set());
  if (/HIDE/.test(s.obj)) { const cover = nearest(s, by(s, /^COVER/)); if (cover && dist(s, cover) < 12) return bot.goTo(s, cover, { arrive: 0.6, sprintBeyond: 99 }); return bot.keys(new Set()); }
  bot.ditch = null;
  const g = jobTarget(s); return g ? travel(bot, s, g, { arrive: 2.2, footOnly: true }) : bot.keys(new Set());
};
T['DOUGHNUTS ON THE GREEN'] = async (bot, s) => {
  if (!s.onFoot && s.v.slow) return getOut(bot, s); // a bike or gopher won't do doughnuts
  if (s.onFoot) { const c = await bot.page.evaluate(nearestCar, [s.x, s.y, 120, true]); const m = s.mine.find(q => q.label === 'A CAR'); return c ? board(bot, s, c) : m ? board(bot, s, m) : bot.keys(new Set()); }
  const g = jobTarget(s); if (g && dist(s, g) > 30) return bot.goTo(s, g, { arrive: 10 });
  return bot.keys(new Set(['KeyW', 'KeyD', ...(Math.floor(Date.now() / 900) % 2 ? ['Space'] : [])])); // doughnuts
};
const rail = name => async (bot, s) => {
  if (s.v && s.v.rail) return bot.keys(new Set(['KeyW', 'ShiftLeft']));
  const g = jobTarget(s); if (!g) return bot.keys(new Set());
  if (dist(s, g) < 12) { if (!s.onFoot) return getOut(bot, s); if (/^E · /.test(s.prompt)) return bot.press('KeyE', 900); return bot.goTo(s, g, { arrive: 2 }); }
  return travel(bot, s, g, { arrive: 10, footWithin: 25 });
};
T['TRAM-JACKING'] = rail('tram'); T['THE LAST TRAIN'] = rail('train');
// a runaway: get ahead of it (its arrow moves; the bot watches it move), out of the car, and leap aboard as it passes
const runaway = async (bot, s) => {
  if (s.aboard || s.tackle) return bot.keys(new Set());
  if (s.v && s.v.rail) return bot.keys(new Set(['KeyS'])); // won the takeover: brake to a stop
  const g = jobTarget(s); if (!g) return bot.keys(new Set());
  const now = Date.now(); const pv = bot.rwPrev; let vx = 0, vy = 0; if (pv && now - pv.t > 200 && now - pv.t < 2000) { vx = (g.x - pv.x) / ((now - pv.t) / 1000); vy = (g.y - pv.y) / ((now - pv.t) / 1000); bot.rwV = { vx, vy }; } if (!pv || now - pv.t > 600) bot.rwPrev = { x: g.x, y: g.y, t: now };
  const v = bot.rwV || { vx: 0, vy: 0 }; const d = dist(s, g);
  if (s.onFoot) { if (d < 30) return bot.goTo(s, g, { arrive: 1, sprintBeyond: 1, direct: d < 12 }); const ahead = { x: g.x + v.vx * 6, y: g.y + v.vy * 6 }; return travel(bot, s, d > 120 ? ahead : g, { arrive: 3, carBeyond: 120 }); }
  if (d < 35) return getOut(bot, s);
  return bot.goTo(s, { x: g.x + v.vx * 5, y: g.y + v.vy * 5 }, { arrive: 15 });
};
T['RUNAWAY TRAM'] = runaway; T['MIDNIGHT EXPRESS'] = runaway;
T['MIDNIGHT AT THE BLUFF'] = async (bot, s) => { const g = jobTarget(s); if (!g) return bot.keys(new Set()); return travel(bot, s, g, { arrive: 25, carBeyond: 150 }); };
T['STRONGLY WORDED LETTERS'] = async (bot, s) => { if (/STOP HERE/.test(s.prompt)) return bot.keys(new Set(['KeyS'])); const g = jobTarget(s); return g ? travel(bot, s, g, { arrive: 2.5, carBeyond: 120 }) : bot.keys(new Set()); };
T['TURN THAT DOWN'] = async (bot, s) => {
  if (/GET OFF/.test(s.prompt)) return getOut(bot, s);
  const g = jobTarget(s); if (!g) return bot.keys(new Set());
  if (/WALK UP/.test(s.prompt) || (s.onFoot && dist(s, g) < 14)) return bot.goTo(s, g, { arrive: 1.5 });
  return travel(bot, s, g, { arrive: 9, keepSlow: true });
};
T['THE BIG RIG'] = async (bot, s) => {
  const truck = by(s, /B-DOUBLE/)[0]; if (truck) { if (dist(s, truck) < 14) { if (!s.onFoot) return getOut(bot, s); return board(bot, s, truck); } return travel(bot, s, truck, { arrive: 8, carBeyond: 100 }); }
  const park = by(s, /PARK HERE/)[0]; if (park) return bot.goTo(s, park, { arrive: 6, vmax: 20 }); return bot.keys(new Set());
};
T['LIGHTS OUT'] = async (bot, s) => { const g = nearest(s, s.targets.filter(t => t.small)) || jobTarget(s); return g ? travel(bot, s, g, { arrive: 0, ram: true, direct: dist(s, g) < 25, keepSlow: true }) : bot.keys(new Set(['KeyW'])); };
T['SHUT IT DOWN'] = async (bot, s) => { const g = jobTarget(s); return g ? travel(bot, s, g, { arrive: 0, ram: true, direct: dist(s, g) < 30, keepSlow: true }) : bot.keys(new Set()); };
T['GOPHER PATROL'] = async (bot, s) => {
  const g = jobTarget(s); if (!g) return bot.keys(new Set());
  if (s.onFoot) { const c = s.mine.find(m => /COP CAR/.test(m.label)); if (c && dist(s, c) < 200) return board(bot, s, c); return bot.goTo(s, g, { arrive: 6 }); }
  return bot.goTo(s, g, { arrive: 7, vmax: dist(s, g) < 25 ? 5 : 99 });
};
T['DING DONG DITCHERS'] = async (bot, s) => {
  const g = nearest(s, by(s, /^DITCHER/)); if (!g) return bot.keys(new Set());
  if (!s.onFoot) return dist(s, g) < 45 ? getOut(bot, s) : bot.goTo(s, g, { arrive: 30 });
  return bot.goTo(s, g, { arrive: 1.2, sprintBeyond: 1 });
};
T['HOON ON THE ESPLANADE'] = async (bot, s) => escortOr(bot, s, async () => {
  const g = by(s, /^HOON$/)[0] || jobTarget(s); if (!g) return bot.keys(new Set());
  if (/ON FOOT|PINNED|CUFF/.test(s.obj)) { if (!s.onFoot) return getOut(bot, s); return bot.goTo(s, g, { arrive: 1, sprintBeyond: 0 }); }
  if (s.onFoot) { const c = s.mine.find(m => /COP CAR/.test(m.label)); return c ? board(bot, s, c) : bot.goTo(s, g, { arrive: 3 }); }
  return bot.goTo(s, g, { arrive: 0, ram: dist(s, g) < 60, direct: dist(s, g) < 40 });
});
T['BIN NIGHT BANDITS'] = async (bot, s) => { const g = jobTarget(s); return g ? travel(bot, s, g, { arrive: 1.5, footWithin: 60, carBeyond: 260 }) : bot.keys(new Set()); };
// prisoners: grab, the rear door, drive to a desk, take out, walk in, hand over (all from what's marked)
async function escortOr(bot, s, otherwise) {
  const pris = s.targets.find(t => / · (CUFFED|WITH YOU|IN CAR|LOOSE!)$/.test(t.label)); if (!pris) return otherwise();
  const st = pris.label.split(' · ')[1];
  if (st === 'LOOSE!') { if (!s.onFoot) return getOut(bot, s); return bot.goTo(s, pris, { arrive: 1, sprintBeyond: 0 }); }
  if (st === 'CUFFED') { if (!s.onFoot) return getOut(bot, s); return bot.goTo(s, pris, { arrive: 1.2 }); }
  const desk = by(s, /^DESK$/)[0]; if (desk) return bot.goTo(s, desk, { arrive: 1.2 });
  const doors = by(s, / DOOR$/).filter(t => t.label !== 'REAR DOOR'); const door = nearest(s, doors);
  if (st === 'WITH YOU') {
    const rd = by(s, /^REAR DOOR$/)[0];
    if (door && dist(s, door) < 70) { // walk them in: into the front door
      const inside = { x: door.x + (door.x - s.x) / (dist(s, door) || 1) * 2.5, y: door.y + (door.y - s.y) / (dist(s, door) || 1) * 2.5 };
      return bot.goTo(s, dist(s, door) < 4 ? inside : door, { arrive: 0.5, sprintBeyond: 99 });
    }
    if (rd) return bot.goTo(s, rd, { arrive: 0.8, sprintBeyond: 99 });
    return door ? bot.goTo(s, door, { arrive: 1, sprintBeyond: 99 }) : bot.keys(new Set());
  }
  // in the car: drive to the nearest desk's door, get out, then the rear door
  if (!s.onFoot) { if (door && dist(s, door) < 22) return getOut(bot, s); return door ? bot.goTo(s, door, { arrive: 12 }) : bot.keys(new Set()); }
  const rd = by(s, /^REAR DOOR$/)[0]; if (rd && door && dist(s, door) < 40) return bot.goTo(s, rd, { arrive: 0.8 });
  const c = s.mine.find(m => /COP CAR|YOUR/.test(m.label)); return c ? board(bot, s, c) : bot.keys(new Set());
}

// ---------- one run: play a character's night through to its end card ----------
async function playNight(char, night, opts = {}) {
  if (RB.has(char, night)) return RB.playNight(char, night, opts); // (Round B hook)
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?play=${char}&night=${night}&hour=19.5${opts.job != null ? '&job=' + opts.job : ''}`); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const bot = new Bot(page); const results = []; let idx = -1, job = null, jobStart = Date.now(), jobT0 = 0, lastT = 0, fails0 = 0, failSeen = 0, done = false;
  const limit = opts.jobLimit || 500000; const tag = `${char} night ${night}` + (opts.job != null ? ` job ${opts.job + 1}` : '');
  const finish = (ok, s, why) => { const r = { job, ok, secs: Math.round(lastT - jobT0), wall: Math.round((Date.now() - jobStart) / 1000), fails: (s ? s.fails : failSeen) - fails0, why, obj: s && s.obj }; results.push(r); console.log(`${tag} | ${job} | ${ok ? 'PASS' : 'FAIL (' + why + ')'} | ${r.secs}s | ${r.fails} retries${ok ? '' : ' | ' + (r.obj || '')}`); };
  while (!done) {
    let s; try { s = await bot.peek(); } catch (e) { errors.push(String(e)); break; }
    if (process.env.SHOTS && Date.now() - (bot.shotT || 0) > 15000) { bot.shotT = Date.now(); await page.screenshot({ path: `${process.env.SHOTS}/${char}-${night}-${Math.round((Date.now() - jobStart) / 1000)}.png` }); } // SHOTS=dir: a picture every 15 s
    if (process.env.DEBUG && Date.now() - (bot.dbgT || 0) > 4000) { bot.dbgT = Date.now(); const g = jobTarget(s); console.log(`  [${tag}] ${s.st} ${Math.round(s.x)},${Math.round(s.y)} ${s.onFoot ? 'foot' : s.v.type + ' ' + Math.round(s.v.speed)} "${s.obj}" "${s.prompt}" goal ${g ? g.label + '@' + Math.round(dist(s, g)) : '-'} keys ${[...bot.held].join('+')} route ${bot.route ? bot.route.length + '@' + bot.ri : 'none'}`); }
    if (s.idx !== idx && s.st !== 'nightEnd' && s.st !== 'win') { if (idx >= 0 && job) finish(true, s); idx = s.idx; job = s.next; jobStart = Date.now(); jobT0 = s.t || 0; bot.reachT = 0; fails0 = s.fails; bot.route = null; }
    if (s.st === 'play' && job && Date.now() - (bot.reachT || 0) > 15000) { bot.reachT = Date.now(); const u = await page.evaluate(unreachable); if (u.length) { finish(false, s, 'unreachable target ' + u.join(' ')); idx = -2; job = null; if (opts.job != null) break; } }
    if (s.fails > failSeen) { failSeen = s.fails; console.log(`  ${tag} ${job}: ${s.msgs.find(m => /^JOB FAILED/.test(m)) || 'job failed'}`); }
    if (s.st === 'nightEnd' || s.st === 'win' || (opts.job != null && (s.st === 'week' || s.msgs.some(m => /JOB REPLAYED/.test(m))))) { if (job) finish(true, s); done = true; job = null; break; }
    lastT = s.t || lastT; // job time limits are in game seconds: a slow machine runs the game slower, not the bot faster
    if (s.st === 'sunrise' || (lastT - jobT0) * 1000 > limit || Date.now() - jobStart > limit * 4 || s.fails - fails0 >= 3 || s.st === 'deadEnd') { finish(false, s, s.st === 'sunrise' ? 'sunrise' : s.st === 'deadEnd' ? 'dead end' : s.fails - fails0 >= 3 ? 'failed 3 times' : 'too slow'); job = null; break; }
    if (['brief', 'chat', 'lockedUp', 'ride'].includes(s.st)) { await bot.keys(new Set()); await page.keyboard.press('Enter'); await sleep(350); continue; }
    if (s.st === 'pause') { await page.keyboard.press('Escape'); await sleep(200); continue; }
    if (s.st !== 'play') { await sleep(TICK); continue; }
    if (s.tackle) { // the struggle: keep the mark in the zone; press the way SLIP says
      const want = new Set(); if (s.tackle.m < s.tackle.c) want.add('Space'); await bot.keys(want);
      if (s.tackle.slip) { await page.keyboard.press(s.tackle.slip < 0 ? 'ArrowLeft' : 'ArrowRight'); }
      await sleep(TICK); continue;
    }
    if (s.dizzy) { await bot.keys(new Set()); await sleep(TICK); continue; }
    if (!(await act(bot, s))) await (T[s.job] || T.default)(bot, s);
    await sleep(TICK);
  }
  await browser.close();
  return { results, errors };
}

// ---------- scenarios: the new flows and their failure paths, by keys alone ----------
const SCEN = {
  // out of a moving police car at speed: a tuck-and-roll, dizzy for a moment, the car rolls on
  async bail(page, bot) {
    await page.keyboard.down('KeyW'); await sleep(1500); const before = await bot.peek(); await page.keyboard.press('KeyE'); await sleep(250); await page.keyboard.up('KeyW');
    const mid = await bot.peek(); await sleep(5000); const after = await bot.peek();
    return { ok: before.v && before.v.speed > 12 && mid.onFoot && mid.dizzy && !after.dizzy, note: `speed ${before.v && Math.round(before.v.speed * 3.6)} km/h, rolled ${mid.dizzy}, recovered ${!after.dizzy}` };
  },
  // walk into the sea, swim out of your depth, run out of breath: dumped back on a beach by a wave
  async swim(page, bot) {
    const sea = await page.evaluate(() => { const W = VH.World, p = VH.Game.player; for (let r = 10; r < 600; r += 10) for (let a = 0; a < 6.28; a += 0.2) { const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (W.seaDist(x, y) < -25) { let sx = x, sy = y; for (let k = 0; k < 200 && W.seaDist(sx, sy) < 3; k++) { sx -= Math.cos(a) * 2; sy -= Math.sin(a) * 2; } return { x, y, shore: { x: sx, y: sy } }; } } return null; });
    if (!sea) return { ok: false, note: 'no sea in sight' };
    let s, swam = false, dumped = false; const t0 = Date.now();
    while (Date.now() - t0 < 90000) { s = await bot.peek(); if (s.st === 'brief') { await page.keyboard.press('Enter'); await sleep(300); continue; } if (s.water === 2) swam = true; if (swam && s.water === 0 && s.msgs.some(m => /HALF THE BAY/.test(m))) { dumped = true; break; } await bot.goTo(s, s.water || dist(s, sea.shore) < 4 ? sea : sea.shore, { arrive: 1, sprintBeyond: 99 }); await sleep(TICK); }
    await bot.keys(new Set()); return { ok: swam && dumped, note: `swam ${swam}, dumped by a wave ${dumped}` };
  },
  // Kev on foot: call a gopher over with H and keep up till it's ticketed
  async 'gopher-foot'(page, bot) {
    let s = await bot.peek(); if (!s.onFoot) { await page.keyboard.press('KeyE'); await sleep(400); }
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) { s = await bot.peek(); if (/GOPHERS: 1 OF/.test(s.obj)) return { ok: true, note: `ticketed on foot in ${Math.round((Date.now() - t0) / 1000)}s` }; if (!s.onFoot) { await page.keyboard.press('KeyE'); await sleep(300); continue; } if (/^H · CALL/.test(s.prompt)) await bot.press('KeyH', 1800); const g = nearest(s, s.targets.filter(t => /^M(R|RS) /.test(t.label))); if (g) await bot.goTo(s, g, { arrive: 3, sprintBeyond: 6 }); await sleep(TICK); }
    return { ok: false, note: 'no gopher ticketed in 2 minutes' };
  },
  // pause, RESTART JOB, confirm: back to the start of the job
  async restart(page, bot) {
    await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
    await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('ArrowDown'); await sleep(150); await page.keyboard.press('Enter'); await sleep(300); // RESTART JOB
    await page.keyboard.press('ArrowUp'); await sleep(150); await page.keyboard.press('Enter'); await sleep(500); // YES
    const s = await bot.peek(); const ok1 = s.st === 'brief'; await sleep(900); await page.keyboard.press('Enter'); await sleep(600); const s2 = await bot.peek();
    return { ok: ok1 && s2.st === 'play' && /0 OF/.test(s2.obj), note: `after restart: ${s.st}, then ${s2.st} "${s2.obj}"` };
  },
};
// ding dong ditch, played carefully (run clear, round a corner, into cover, keep still): every door gets away
// with it. Played sloppily (stand in the open by the door): the household finds you and it's a citizen's arrest
async function ditchRun(page, bot, careful) {
  const t0 = Date.now(); let rung = 0, glimpsed = false;
  while (Date.now() - t0 < 360000) {
    const s = await bot.peek(); if (s.msgs.some(m => /JOB REPLAYED/.test(m)) || (s.st === 'play' && !s.next)) return { escaped: true, rung, glimpsed };
    if (s.tackle || s.st === 'lockedUp' || s.msgs.some(m => /PADDY WAGON|SPOTTED/.test(m))) return { escaped: false, caught: true, rung, glimpsed, obj: s.obj };
    if (/GLIMPSED/.test(s.obj)) glimpsed = true; if (process.env.DEBUG && Date.now() - (bot.dbgT || 0) > 5000) { bot.dbgT = Date.now(); console.log(Math.round((Date.now() - t0) / 1000), s.st, Math.round(s.x), Math.round(s.y), JSON.stringify(s.obj), JSON.stringify(s.prompt), s.targets.slice(0, 2).map(t => t.label + '@' + Math.round(dist(s, t))), s.shopOut ? 'shopOut ' + Math.round(s.shopOut.x) + ',' + Math.round(s.shopOut.y) : '', [...bot.held].join('+')); }
    if (s.st === 'brief' || s.st === 'chat') { await bot.keys(new Set()); await page.keyboard.press('Enter'); await sleep(350); continue; }
    if (s.st !== 'play') { await sleep(TICK); continue; }
    if (/RING THE DOORBELL/.test(s.prompt)) { if (await bot.press('Space', 1500)) rung++; await sleep(TICK); continue; }
    if (careful) await T['DING DONG DITCH'](bot, s);
    else if (/RUN!|HIDE|GET AWAY/.test(s.prompt + s.obj)) await bot.keys(new Set()); // just stands there on the doorstep
    else { const g = jobTarget(s); if (g) await travel(bot, s, g, { arrive: 2.2, footOnly: true }); }
    await sleep(TICK);
  }
  return { escaped: false, rung, timeout: true };
}
SCEN['ditch-careful'] = async (page, bot) => { const r = await ditchRun(page, bot, true); return { ok: r.escaped, note: `careful: ${r.escaped ? 'got away with all four doors' : r.caught ? 'caught at door ' + r.rung : 'ran out of time'} (${r.rung} rings${r.glimpsed ? ', glimpsed at least once' : ''})` }; };
SCEN['ditch-sloppy'] = async (page, bot) => { const r = await ditchRun(page, bot, false); return { ok: !!r.caught, note: `sloppy: ${r.caught ? 'caught at door ' + r.rung : 'not caught'}` }; };
// The escalation curve (an engine check, not input-only: it feeds the meter steady mayhem, about what a
// rampage gives, while the police can see you): reaching the chopper must take minutes, no level may have more cars
// than its cap, and once you're hidden and out of sight the meter must drain
SCEN['mayhem-ramp'] = async (page, bot) => {
  const r = await page.evaluate(async () => {
    const G = VH.Game, P = VH.Police, pl = G.player; const out = { levelAt: {}, maxCars: {}, heliAt: null };
    const wait = ms => new Promise(res => setTimeout(res, ms)); const hold = () => { P.tackleCool = 99; P.arrest = null; VH.Tackle.on = null; if (VH.Street) VH.Street.grab = null; if (G.state === 'pause') G.state = 'play'; };
    G.busted = () => {}; // this checks the curve, not the arrest: nobody (Neighbourhood Watch, a retiree) gets to end the run
    const t0 = G.t; let lastMay = 0;
    while (G.t - t0 < 330 && out.heliAt == null) {
      hold(); if (G.state !== 'play') { await wait(50); continue; }
      if (G.t - lastMay > 1) { lastMay = G.t; G.addMeter(0.3); }
      P.seenT = 0; P.last = { x: pl.x, y: pl.y };
      const lv = Math.floor(G.meter); if (out.levelAt[lv] == null) out.levelAt[lv] = Math.round(G.t - t0);
      out.maxCars[lv] = Math.max(out.maxCars[lv] || 0, P.units.length);
      if (P.heli) out.heliAt = Math.round(G.t - t0);
      await wait(30);
    }
    // then slip away somewhere hidden and well out of their sight: the meter should drain
    let spot = null; for (let r = 600; r < 2500 && !spot; r += 100) for (let a = 0; a < 6.28 && !spot; a += 0.3) { const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r; const g = VH.World.groundAt(x, y); if ((g === VH.World.GC.SCRUB || g === VH.World.GC.WOOD || g === VH.World.GC.GOLF) && VH.Nav.walkable(x, y)) spot = { x, y }; }
    if (!pl.onFoot) G.exit(true); pl.x = spot.x; pl.y = spot.y; pl.vx = pl.vy = 0; G.cam.x = pl.x; G.cam.y = pl.y;
    const m0 = G.meter, t1 = G.t; out.hint = []; out.hiddenFrac = 0; let n = 0;
    while (G.t - t1 < 40) { hold(); n++; if (P.isHidden()) out.hiddenFrac++; const h = P.coolHint(); const k = h && h.txt.replace(/\d+S$/, 'NS'); if (k && !out.hint.includes(k)) out.hint.push(k); await wait(100); }
    out.hiddenFrac = +(out.hiddenFrac / n).toFixed(2); out.cooled = +(m0 - G.meter).toFixed(2); out.m0 = +m0.toFixed(2);
    return out;
  });
  const caps = Object.entries(r.maxCars).every(([lv, n]) => n <= Math.max(0, Math.min(4, +lv)));
  const ok = r.heliAt != null && r.heliAt >= 180 && caps && r.cooled > 1;
  return { ok, note: `levels reached at ${JSON.stringify(r.levelAt)} s (game time); most cars per level ${JSON.stringify(r.maxCars)}; chopper at ${r.heliAt} s; then hidden 40 s (hidden ${Math.round(r.hiddenFrac * 100)}% of it): meter ${r.m0}, down ${r.cooled}; hints shown: ${r.hint.join(' / ')}` };
};
// Busted, then let out at the gate: ride off on the bike left there, and nobody gives chase (input only after the
// bust: the bot is caught by a ding dong household, rides in the paddy wagon, and takes the bike)
SCEN['release-bike'] = async (page, bot) => {
  const r = await ditchRun(page, bot, false); if (!r.caught) return { ok: false, note: 'never got caught' };
  let s, t0 = Date.now(), out = false;
  while (Date.now() - t0 < 120000) {
    s = await bot.peek(); if (s.tackle) { await bot.keys(new Set()); await sleep(TICK); continue; } // lose the struggle on purpose
    if (['brief', 'chat', 'lockedUp', 'ride'].includes(s.st)) { await bot.keys(new Set()); await page.keyboard.press('Enter'); await sleep(400); continue; }
    if (s.st === 'play' && s.mine.some(m => m.label === 'YOUR BIKE')) { out = true; break; }
    await sleep(TICK);
  }
  if (!out) return { ok: false, note: 'not let out with a bike at the gate (' + (s && s.st) + ')' };
  const bike = s.mine.find(m => m.label === 'YOUR BIKE'); t0 = Date.now();
  while (Date.now() - t0 < 30000) { s = await bot.peek(); if (!s.onFoot) break; if (s.st === 'brief') { await page.keyboard.press('Enter'); await sleep(300); continue; } await board(bot, s, bike); await sleep(TICK); }
  if (s.onFoot) return { ok: false, note: 'could not get on the gate bike' };
  const gate = { x: s.x, y: s.y }; let maxM = 0, maxCars = 0; t0 = Date.now();
  const away = await page.evaluate(([x, y]) => { const n = VH.World.randomRoadPoint(x, y, 250, 400, e => e.w >= 5); return n ? { x: n.x, y: n.y } : null; }, [gate.x, gate.y]);
  while (Date.now() - t0 < 60000) {
    s = await bot.peek(); if (s.st === 'brief') { await page.keyboard.press('Enter'); await sleep(300); continue; }
    const m = await page.evaluate(() => [VH.Game.meter, VH.Police.units.length]); maxM = Math.max(maxM, m[0]); maxCars = Math.max(maxCars, m[1]);
    if (away) await bot.goTo(s, away, { arrive: 10 }); await sleep(TICK);
  }
  return { ok: maxM < 0.01 && maxCars === 0, note: `rode ${Math.round(dist(s, gate))}m from the gate on the bike: meter peaked at ${maxM.toFixed(2)}, ${maxCars} police cars` };
};
// Merv on his gopher making a nuisance: one car tailing him, no roadblock or chopper (engine check: meter held at 4)
SCEN['merv-gentle'] = async (page, bot) => {
  const r = await page.evaluate(async () => {
    const G = VH.Game, P = VH.Police, pl = G.player; const wait = ms => new Promise(res => setTimeout(res, ms)); let cars = 0, blocks = 0, heli = false, lect = 0;
    const t0 = G.t; while (G.t - t0 < 60) { if (G.state === 'pause') G.state = 'play'; G.meter = 4.2; G.heatCeil = 4.4; P.seenT = 0; P.last = { x: pl.x, y: pl.y }; P.chaseT = 200; if (VH.Tackle.on) VH.Tackle.on = null; P.arrest = null; P.tackleCool = 99;
      cars = Math.max(cars, P.units.length); blocks = Math.max(blocks, P.blocks.length); heli = heli || !!P.heli; await wait(100); }
    return { cars, blocks, heli, gopher: !!(pl.vehicle && pl.vehicle.def.gopher) };
  });
  return { ok: r.gopher && r.cars <= 1 && !r.blocks && !r.heli, note: `${r.gopher ? 'on the gopher' : 'NOT on the gopher'} at gossip 4 for 60 s: at most ${r.cars} car, ${r.blocks} roadblocks, chopper ${r.heli}` };
};
// Stranded with no car about: stand in the road in front of passing traffic, it stops for you, walk up and press E
SCEN['flag-down'] = async (page, bot) => {
  let s = await bot.peek(); if (!s.onFoot) { await page.keyboard.press('KeyE'); await sleep(500); }
  const road = await page.evaluate(([x, y]) => { const W = VH.World; let best = null; for (let r = 10; r < 400 && !best; r += 15) for (let a = 0; a < 6.28 && !best; a += 0.4) { const n = W.nearestEdge(x + Math.cos(a) * r, y + Math.sin(a) * r, 12); if (n && n.e.speed > 8 && n.e.w >= 6 && !n.e.br && !n.e.rb) best = { x: n.x, y: n.y }; } return best; }, [s.x, s.y]);
  if (!road) return { ok: false, note: 'no through road nearby' };
  let t0 = Date.now(), stoodT = null, stopped = null;
  while (Date.now() - t0 < 180000) {
    s = await bot.peek(); if (s.st === 'brief') { await page.keyboard.press('Enter'); await sleep(300); continue; }
    if (!s.onFoot) return { ok: true, note: `stood in the road, a car stopped ${stopped ? Math.round(stopped) + 'm' : ''} short, and E got me in after ${Math.round((Date.now() - t0) / 1000)}s` };
    if (dist(s, road) > 30 && !stoodT) { await bot.goTo(s, road, { arrive: 3 }); await sleep(TICK); continue; }
    // a car coming: step into its path a little way ahead and wait for it to stop
    const coming = s.traffic.filter(c => c.speed > 3).map(c => ({ c, along: (s.x - c.x) * Math.cos(c.ang) + (s.y - c.y) * Math.sin(c.ang) })).filter(q => q.along > 12 && q.along < 60).sort((a, b) => a.along - b.along)[0];
    if (/^E · BORROW.*MIFFED/.test(s.prompt)) { await bot.press('KeyE', 900); await sleep(TICK); continue; } // a passing car, stopped for you
    const still = s.traffic.filter(c => c.speed < 1.5 && dist(s, c) < 16).sort((a, b) => dist(s, a) - dist(s, b))[0];
    if (still && stoodT) { stopped = stopped || dist(s, still); if (/^E · BORROW.*MIFFED/.test(s.prompt)) { await bot.press('KeyE', 900); await sleep(TICK); continue; } await bot.goTo(s, still, { arrive: 1, sprintBeyond: 99 }); await sleep(TICK); continue; }
    if (coming && !stoodT) { const c = coming.c; const spot = { x: c.x + Math.cos(c.ang) * (coming.along + 6), y: c.y + Math.sin(c.ang) * (coming.along + 6) }; if (dist(s, spot) > 1) { await bot.goTo(s, spot, { arrive: 0.8, sprintBeyond: 1 }); await sleep(TICK); continue; } }
    if (coming && dist(s, { x: coming.c.x, y: coming.c.y }) < 30) stoodT = stoodT || Date.now();
    await bot.keys(new Set()); await sleep(TICK);
    if (stoodT && Date.now() - stoodT > 15000) stoodT = null; // nobody stopped: try the next one
  }
  return { ok: false, note: 'no car stopped and let me in within 3 minutes' };
};
// Strolling and sprinting along a kerb lined with parked cars never gets you into one (engine setup: four cars parked on
// consecutive kerb slots; then keys only: walk along them pressed against their doors, then sprint back)
SCEN['kerb-walk'] = async (page, bot) => {
  const line = await page.evaluate(() => {
    const G = VH.Game, S = VH.Spawn, pl = G.player; if (!pl.onFoot) G.exit(true);
    const k0 = S.pick('kerb', { near: pl, maxDist: 400, nearest: true, filter: k => !k.main }); const e = k0.extra;
    const row = S.kinds.kerb.filter(k => k.extra === e && Math.abs(Math.cos(k.a - k0.a)) > 0.9 && Math.cos(k.a - k0.a) > 0).sort((a, b) => (a.x - k0.x) * Math.cos(k0.a) + (a.y - k0.y) * Math.sin(k0.a) - ((b.x - k0.x) * Math.cos(k0.a) + (b.y - k0.y) * Math.sin(k0.a)));
    const cars = []; for (const k of row.slice(0, 4)) { const v = S.vehicle(VH.randomCarType(), k, { parked: true }); cars.push(v); }
    // the driver's door side (right-hand side of each car), a little out from it
    const a = k0.a, nx = -Math.sin(a), ny = Math.cos(a); const f = cars[0], l = cars[cars.length - 1];
    const p0 = { x: f.x + nx * 1.6 - Math.cos(a) * 6, y: f.y + ny * 1.6 - Math.sin(a) * 6 }, p1 = { x: l.x + nx * 1.6 + Math.cos(a) * 6, y: l.y + ny * 1.6 + Math.sin(a) * 6 };
    pl.x = p0.x; pl.y = p0.y; pl.vx = pl.vy = 0; G.cam.x = pl.x; G.cam.y = pl.y; return { p0, p1, n: cars.length, side: { x: -nx, y: -ny } };
  });
  if (line.n < 2) return { ok: false, note: 'no row of kerb slots to park on' };
  let boarded = false; const t0 = Date.now();
  for (const [goal, sprint] of [[line.p1, false], [line.p0, true]]) {
    while (Date.now() - t0 < 60000) {
      const s = await bot.peek(); if (!s.onFoot) { boarded = true; break; } if (dist(s, goal) < 2) break;
      // hug the cars: aim a little into their side so you brush the doors the whole way
      const da = angDiff(s.ang, Math.atan2(goal.y + line.side.y * 1.2 - s.y, goal.x + line.side.x * 1.2 - s.x)); const want = new Set(['KeyW']); if (sprint) want.add('ShiftLeft'); if (da > 0.15) want.add('KeyD'); else if (da < -0.15) want.add('KeyA');
      await bot.keys(want); await sleep(TICK);
    }
    if (boarded) break;
  }
  await bot.keys(new Set());
  return { ok: !boarded, note: boarded ? 'got into a parked car without meaning to' : `walked and sprinted past ${line.n} parked cars, brushing their doors, and never got in` };
};
// After mayhem on foot a responding car pulls up near where you were seen and an officer searches on foot; standing
// still near the road, you're found, tackled and (not struggling) arrested within 60 s (engine setup: gossip 1.2 and
// the police's last sighting of you on foot; then nothing but waiting)
SCEN['foot-search'] = async (page, bot) => {
  await page.evaluate(() => { const G = VH.Game, P = VH.Police, pl = G.player; if (!pl.onFoot) G.exit(true); const n = VH.World.nearestEdge(pl.x, pl.y, 60); const q = n && VH.Nav.snap(n.x + Math.sin(n.ang) * (n.e.w / 2 + 2), n.y - Math.cos(n.ang) * (n.e.w / 2 + 2), 6); if (q) { pl.x = q.x; pl.y = q.y; } G.heatCeil = 1.5; G.meter = 1.2; G.quietT = 0; P.last = { x: pl.x, y: pl.y }; P.lastFoot = true; P.seenT = 5; });
  const t0 = Date.now(); let searching = false, tackled = false, busted = false, hud = '';
  while (Date.now() - t0 < 90000) {
    const s = await bot.peek(); await bot.keys(new Set());
    const r = await page.evaluate(() => ({ search: VH.Police.officers.some(o => o.state === 'search'), h: (VH.Police.coolHint() || {}).txt || '', gt: VH.Game.t }));
    if (r.search) { searching = true; hud = hud || r.h; } if (s.tackle) tackled = true; if (['ride', 'lockedUp'].includes(s.st)) { busted = true; break; }
    if (s.st === 'brief') await page.keyboard.press('Enter');
    await sleep(TICK);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  return { ok: tackled && busted && secs <= 75, note: `officer searched on foot first: ${searching} (HUD: "${hud}"), tackled: ${tackled}, arrested: ${busted} after ${secs}s` };
};
// play the current job by keys until the job index moves on (or time runs out)
async function playJob(page, bot, ms = 300000) {
  const t0 = Date.now(); const idx0 = (await bot.peek()).idx;
  while (Date.now() - t0 < ms) {
    const s = await bot.peek(); if (s.idx !== idx0 || s.st === 'nightEnd') return true;
    if (s.st === 'brief' || s.st === 'chat') { await bot.keys(new Set()); await page.keyboard.press('Enter'); await sleep(350); continue; }
    if (s.st === 'pause') { await page.keyboard.press('Escape'); await sleep(200); continue; }
    if (s.st !== 'play') { await sleep(TICK); continue; }
    if (s.tackle) { const want = new Set(); if (s.tackle.m < s.tackle.c) want.add('Space'); await bot.keys(want); if (s.tackle.slip) await page.keyboard.press(s.tackle.slip < 0 ? 'ArrowLeft' : 'ArrowRight'); await sleep(TICK); continue; }
    if (!(await act(bot, s))) await (T[s.job] || T.default)(bot, s);
    await sleep(TICK);
  }
  return false;
}
// finish job 1, reload, Continue lands on job 2; restarting job 2 keeps you on job 2
SCEN.resume = async (page, bot) => {
  if (!(await playJob(page, bot))) return { ok: false, note: 'job 1 not finished by keys' };
  await sleep(1000); await page.goto(BASE); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(800);
  const menu = await page.evaluate(() => VH.Game.state); await page.keyboard.press('ArrowDown'); await sleep(150); await page.keyboard.press('Enter'); await sleep(900);
  const a = await bot.peek(); await page.keyboard.press('Enter'); await sleep(700);
  await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('ArrowDown'); await sleep(150); await page.keyboard.press('Enter'); await sleep(300); await page.keyboard.press('ArrowUp'); await sleep(150); await page.keyboard.press('Enter'); await sleep(700);
  const b = await bot.peek();
  return { ok: menu === 'title' && a.st === 'brief' && a.idx === 1 && b.st === 'brief' && b.idx === 1, note: `after reload + Continue: ${a.st} job ${a.idx + 1} (${a.next}); after RESTART JOB: ${b.st} job ${b.idx + 1}` };
};
// the doughnuts job with the car sunk on the way: swim out, follow the light-blue "A CAR", and still finish
SCEN['doughnut-sink'] = async (page, bot) => {
  const t0 = Date.now(); let sunk = false;
  while (Date.now() - t0 < 120000 && !sunk) {
    const s = await bot.peek(); if (s.st === 'brief') { await page.keyboard.press('Enter'); await sleep(300); continue; }
    if (s.onFoot && s.water) { sunk = true; break; }
    if (s.onFoot) { await T['DOUGHNUTS ON THE GREEN'](bot, s); await sleep(TICK); continue; }
    const wet = await page.evaluate(([x, y]) => { const W = VH.World; let best = null; for (let r = 20; r < 500 && !best; r += 10) for (let a = 0; a < 6.28; a += 0.15) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (W.groundAt(px, py) === W.GC.WATER || W.seaDist(px, py) < -6) { best = { x: px, y: py }; break; } } return best; }, [s.x, s.y]);
    if (!wet) return { ok: false, note: 'no water near the car' };
    await bot.goTo(s, wet, { arrive: 0, ram: true, direct: dist(s, wet) < 60 }); await sleep(TICK);
  }
  if (!sunk) return { ok: false, note: 'never got the car into the water' };
  await bot.keys(new Set());
  const done = await playJob(page, bot, 330000); const s = await bot.peek();
  return { ok: done, note: `sank the car, then ${done ? 'finished the job' : 'did not finish: ' + s.obj}` };
};
const SCEN_URL = { 'kerb-walk': '?play=schoolie&hour=13', 'foot-search': '?play=schoolie&hour=22', 'flag-down': '?play=schoolie&hour=20', 'mayhem-ramp': '?play=roam&hour=21', 'release-bike': '?play=schoolie&job=1&hour=21', 'merv-gentle': '?play=grump&hour=21', 'ditch-careful': '?play=schoolie&job=1&hour=21', 'ditch-sloppy': '?play=schoolie&job=1&hour=21', resume: '?play=cop&hour=19.5', 'doughnut-sink': '?play=schoolie&night=2&hour=19.5', bail: '?play=cop&hour=21', swim: '?play=schoolie&hour=20', 'gopher-foot': '?play=cop&hour=21', restart: '?play=cop&hour=21' };
async function runScenario(name) {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + SCEN_URL[name]); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(800);
  for (let i = 0; i < 5; i++) { const st = await page.evaluate(() => VH.Game.state); if (st === 'pause') await page.keyboard.press('Escape'); else if (st === 'brief') await page.keyboard.press('Enter'); else break; await sleep(400); } // a lost-focus pause or a brief first
  let r; try { r = await SCEN[name](page, new Bot(page)); } catch (e) { r = { ok: false, note: e.message }; }
  await browser.close(); if (errors.length) { r.ok = false; r.note += ' | errors: ' + errors.slice(0, 2).join(' / '); }
  return r;
}

const all = { schoolie: 3, grump: 3, cop: 3 }; for (const c of Object.keys(all)) all[c] = Math.max(all[c], RB.count(c)); // (Round B hook: Jaz's fourth night)
const args = process.argv.slice(2);
const scenarios = args.filter(a => a.startsWith('scenario:')).map(a => a.slice(9)).flatMap(n => n === 'all' ? Object.keys(SCEN) : [n]);
const want = args.filter(a => !a.startsWith('scenario:'));
// char:night plays the night through; char:night:job plays one job on its own; 'jobs' plays every job of every night on its own
const JOBS = { schoolie: [2, 2, 2], grump: [2, 2, 1], cop: [2, 3, 2] }; for (const c of Object.keys(JOBS)) for (let n = JOBS[c].length + 1; n <= RB.count(c); n++) JOBS[c][n - 1] = RB.has(c, n) ? RB.jobs(c, n) : 0; // (Round B hook)
const runs = want.includes('jobs') ? Object.entries(JOBS).flatMap(([c, ns]) => ns.flatMap((k, i) => Array.from({ length: k }, (_, j) => [c, i + 1, j]))) : want.length ? want.map(a => a.split(':')).map(([c, n, j]) => [c, +n, j == null ? null : +j - 1]) : scenarios.length ? [] : Object.entries(all).flatMap(([c, n]) => Array.from({ length: n }, (_, i) => [c, i + 1]));
let bad = 0; const rows = [];
for (const name of scenarios) { const t0 = Date.now(); const r = await runScenario(name); rows.push(`scenario | ${name} | ${r.ok ? 'PASS' : 'FAIL'} | ${Math.round((Date.now() - t0) / 1000)}s | ${r.note}`); console.log(rows[rows.length - 1]); if (!r.ok) bad++; }
const CONC = +(process.env.CONC || 3);
for (let i = 0; i < runs.length; i += CONC) {
  const batch = await Promise.all(runs.slice(i, i + CONC).map(async ([c, n, j]) => ({ c, n, j, r: await playNight(c, n, j == null ? {} : { job: j }) })));
  for (const { c, n, j: jj, r } of batch) {
    for (const j of r.results) { rows.push(`${c} night ${n}${jj == null ? '' : ' job ' + (jj + 1)} | ${j.job} | ${j.ok ? 'PASS' : 'FAIL (' + j.why + ')'} | ${j.secs}s | ${j.fails} retries`); if (!j.ok) bad++; }
    if (r.errors.length) { rows.push(`${c} night ${n} | console errors | ${r.errors.slice(0, 3).join(' / ')}`); bad++; console.log(rows[rows.length - 1]); }
  }
}
console.log('\n' + rows.join('\n')); console.log(bad ? `${bad} problems` : 'ALL PASSED'); process.exit(bad ? 1 : 0);
