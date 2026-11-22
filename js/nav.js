// Getting about on foot: everyone who walks (pedestrians, ditchers, residents, officers) stays out of buildings and
// out of the water. Moves are checked against building walls and the shoreline; longer trips are planned with A* over
// the 2 m ground grid (footpaths, driveways, roads, yards and parks), then smoothed so people walk in straight lines
// where they can and go round buildings where they can't.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, GC = W.GC;
  const N = VH.Nav = { calls: 0, budget: 6 };
  // ground a walker can stand on: anything but a building, the sea or a lake / river
  N.blockedG = g => g === GC.BUILDING || g === GC.SEA || g === GC.WATER;
  N.inBuilding = (x, y) => { let hit = false; W.buildingGrid.query(x, y, x, y, b => { if (!hit && x >= b.bb[0] && x <= b.bb[2] && y >= b.bb[1] && y <= b.bb[3] && U.pointInPoly(x, y, b.p)) hit = true; }); return hit; };
  N.walkable = (x, y) => { const k = W.cellIdx(x, y); return k >= 0 && !N.blockedG(W.ground[k]) && !N.inBuilding(x, y); };
  N.dry = (x, y) => W.inBounds(x, y, 1) && !W.isWet(x, y);
  // does the segment cross a building wall?
  const cross = (ax, ay, bx, by, cx, cy, dx, dy) => { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false; const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
  N.crossesWall = function (x0, y0, x1, y1, skipB, swim) {
    let hit = false; W.wallGrid.query(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), s => { if (!hit && s.b !== skipB && !(swim && s.wall) && cross(x0, y0, x1, y1, s.ax, s.ay, s.bx, s.by)) hit = true; });
    return hit;
  };
  // can you walk straight from one point to the other (dry, no walls, no building in between)?
  N.clear = function (x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 1));
    for (let i = 1; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; if (!N.dry(x, y) || W.groundAt(x, y) === GC.BUILDING && i < n) return false; }
    return !N.crossesWall(x0, y0, x1, y1);
  };
  // move a walker by (dx, dy). This is the one place anyone on foot moves: never into the water (they slide along the
  // shore instead; only the player can swim, with opts.swim), never through a building wall, pushed off trees and
  // vehicles. o.bumped is the vehicle they leant on this step. Returns how far it actually got (0 when stopped dead).
  N.move = function (o, dx, dy, r, opts) {
    r = r || o.r || 0.4; const swim = opts && opts.swim, skipB = opts && opts.skipB; const ok = (x, y) => swim ? W.inBounds(x, y, 2) : N.dry(x, y);
    const x0 = o.x, y0 = o.y; let nx = x0 + dx, ny = y0 + dy; o.bumped = null;
    if (!ok(nx, ny)) { if (ok(x0 + dx, y0)) ny = y0; else if (ok(x0, y0 + dy)) nx = x0; else return 0; }
    const sw = swim && (W.isWet(x0, y0) || W.isWet(nx, ny)); // in the water: under or round bridge railings
    if (N.crossesWall(x0, y0, nx, ny, skipB, sw)) { if (!N.crossesWall(x0, y0, x0 + dx, y0, skipB, sw)) ny = y0; else if (!N.crossesWall(x0, y0, x0, y0 + dy, skipB, sw)) nx = x0; else return 0; }
    o.x = nx; o.y = ny; N.pushOut(o, r, skipB, sw);
    VH.Props.solidNear(o.x, o.y, r, (tx, ty, tr) => { const d = Math.hypot(o.x - tx, o.y - ty); if (d < r + tr && d > 1e-6) { o.x = tx + (o.x - tx) / d * (r + tr); o.y = ty + (o.y - ty) / d * (r + tr); } });
    const g = VH.Game; if (g && g.vehicles && !(opts && opts.noCars)) for (const v of g.vehicles) {
      if (v.removed || v.sinking || (v.z || 0) > 0.6 || Math.abs(v.x - o.x) > 30 || Math.abs(v.y - o.y) > 30) continue;
      v.eachCircle((cx, cy, cr) => { const d = Math.hypot(o.x - cx, o.y - cy); if (d < r + cr + 0.05 && d > 1e-6) { if (d < r + cr) { o.x = cx + (o.x - cx) / d * (r + cr); o.y = cy + (o.y - cy) / d * (r + cr); } o.bumped = v; } });
    }
    if (!ok(o.x, o.y) || N.crossesWall(x0, y0, o.x, o.y, skipB, sw)) { o.x = x0; o.y = y0; return 0; }
    return Math.hypot(o.x - x0, o.y - y0);
  };
  N.pushOut = function (o, r = 0.4, skipB, swim) {
    W.wallGrid.query(o.x - r - 0.1, o.y - r - 0.1, o.x + r + 0.1, o.y + r + 0.1, s => { if ((skipB && s.b === skipB) || (swim && s.wall)) return; const [d, qx, qy] = U.segPointDist(o.x, o.y, s.ax, s.ay, s.bx, s.by); if (d < r && d > 1e-6) { o.x = qx + (o.x - qx) / d * r; o.y = qy + (o.y - qy) / d * r; } });
  };
  // the nearest standable spot to a point (doors sit on a building's edge, for one)
  N.snap = function (x, y, maxR = 6) {
    if (N.walkable(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r += 1) for (let a = 0; a < U.TAU; a += Math.PI / 6) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (N.walkable(px, py)) return { x: px, y: py }; }
    return null;
  };

  // ---------- A* over the 2 m ground grid, in a window around the trip ----------
  const COST = []; for (let i = 0; i < 32; i++) COST[i] = 1.1;
  COST[GC.PAVED] = 1; COST[GC.ROAD] = 1.1; COST[GC.LAWN] = 1.05; COST[GC.GRASS] = 1.1; COST[GC.PITCH] = 1.1; COST[GC.GOLF] = 1.15; COST[GC.SAND] = 1.3; COST[GC.SCRUB] = 1.6; COST[GC.WOOD] = 1.6; COST[GC.WETLAND] = 2.2; COST[GC.CROP] = 1.5;
  const MAXW = 220; let buf = null;
  function bufs(n) { if (!buf || buf.n < n) buf = { n, g: new Float32Array(n), came: new Int32Array(n), seen: new Uint32Array(n), shut: new Uint32Array(n), heap: new Int32Array(n * 2), f: new Float32Array(n * 2), stamp: 0 }; return buf; }
  N.canPlan = () => N.calls < N.budget;
  N.frame = () => { N.calls = 0; };
  // opts.avoid = { x, y, r }: a pursuer to keep away from (the cells right by them are off limits, near them dear)
  N.path = function (x0, y0, x1, y1, opts = {}) {
    N.calls++;
    const s = N.snap(x0, y0, 4), e = N.snap(x1, y1, 8); if (!s || !e) return null;
    if (N.clear(s.x, s.y, e.x, e.y) && !opts.avoid) return [[e.x, e.y]];
    const C = W.cell; const pad = opts.pad || 40;
    let gx0 = Math.floor((Math.min(s.x, e.x) - pad) / C), gy0 = Math.floor((Math.min(s.y, e.y) - pad) / C), gx1 = Math.ceil((Math.max(s.x, e.x) + pad) / C), gy1 = Math.ceil((Math.max(s.y, e.y) + pad) / C);
    if (gx1 - gx0 > MAXW || gy1 - gy0 > MAXW) return null; // too far to plan on foot
    gx0 = Math.max(0, gx0); gy0 = Math.max(0, gy0); gx1 = Math.min(W.gw - 1, gx1); gy1 = Math.min(W.gh - 1, gy1);
    const ww = gx1 - gx0 + 1, hh = gy1 - gy0 + 1, n = ww * hh; const B = bufs(MAXW * MAXW + 2 * MAXW + 1); const st = ++B.stamp;
    const li = (x, y) => (Math.floor(y / C) - gy0) * ww + (Math.floor(x / C) - gx0);
    const si = li(s.x, s.y), ei = li(e.x, e.y); const ex = ei % ww, ey = (ei / ww) | 0;
    const av = opts.avoid; const avR = av ? av.r || 10 : 0; const avHard = av ? Math.max(0, Math.min(3.5, Math.hypot(s.x - av.x, s.y - av.y) - 1.2)) : 0; // never fence the walker in where they stand
    const cellCost = (cx, cy) => {
      const g = W.ground[(cy + gy0) * W.gw + cx + gx0]; if (N.blockedG(g)) return -1; let c = COST[g] || 1.1;
      if (av) { const wx = (cx + gx0 + 0.5) * C, wy = (cy + gy0 + 0.5) * C; const d = Math.hypot(wx - av.x, wy - av.y); if (d < avHard) return -1; if (d < avR) c *= 1 + 8 * (1 - d / avR); }
      return c;
    };
    let hn = 0; const push = (i, f) => { let k = hn++; B.heap[k] = i; B.f[k] = f; while (k > 0) { const p = (k - 1) >> 1; if (B.f[p] <= B.f[k]) break; [B.heap[p], B.heap[k]] = [B.heap[k], B.heap[p]]; [B.f[p], B.f[k]] = [B.f[k], B.f[p]]; k = p; } };
    const pop = () => { const top = B.heap[0]; hn--; if (hn > 0) { B.heap[0] = B.heap[hn]; B.f[0] = B.f[hn]; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < hn && B.f[l] < B.f[m]) m = l; if (r < hn && B.f[r] < B.f[m]) m = r; if (m === k) break; [B.heap[m], B.heap[k]] = [B.heap[k], B.heap[m]]; [B.f[m], B.f[k]] = [B.f[k], B.f[m]]; k = m; } } return top; };
    const h = i => { const x = i % ww, y = (i / ww) | 0; const dx = Math.abs(x - ex), dy = Math.abs(y - ey); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); };
    B.g[si] = 0; B.seen[si] = st; B.came[si] = -1; push(si, h(si));
    let found = false, iter = 0; const maxIter = opts.maxIter || 12000;
    while (hn && iter++ < maxIter) {
      const cur = pop(); if (B.shut[cur] === st) continue; B.shut[cur] = st;
      if (cur === ei) { found = true; break; }
      const cx = cur % ww, cy = (cur / ww) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= ww || ny >= hh) continue;
        const c = cellCost(nx, ny); if (c < 0) continue;
        if (dx && dy && (cellCost(cx + dx, cy) < 0 || cellCost(cx, cy + dy) < 0)) continue; // no cutting corners
        const ni = ny * ww + nx; if (B.shut[ni] === st) continue;
        const ng = B.g[cur] + c * (dx && dy ? 1.414 : 1);
        if (B.seen[ni] !== st || ng < B.g[ni]) { B.seen[ni] = st; B.g[ni] = ng; B.came[ni] = cur; push(ni, ng + h(ni)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let i = ei; i !== -1 && cells.length < n; i = B.came[i]) cells.push(i); cells.reverse();
    const pts = cells.map(i => [(i % ww + gx0 + 0.5) * C, (((i / ww) | 0) + gy0 + 0.5) * C]); pts[pts.length - 1] = [e.x, e.y];
    // string-pull: walk straight to the furthest point you can see
    const out = []; let cx = s.x, cy = s.y, i = 0;
    while (i < pts.length - 1) { let j = Math.min(pts.length - 1, i + 24); while (j > i + 1 && !N.clear(cx, cy, pts[j][0], pts[j][1])) j--; out.push(pts[j]); cx = pts[j][0]; cy = pts[j][1]; i = j; }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  };
  // walk a planned path; returns 'done', 'moving' or 'stuck' (blocked for a while, time to re-plan)
  N.follow = function (o, speed, dt) {
    const p = o.path; if (!p || o.pi >= p.length) return 'done';
    const [tx, ty] = p[o.pi]; const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
    if (d < 0.4) { o.pi++; return o.pi >= p.length ? 'done' : 'moving'; }
    const st = Math.min(d, speed * dt); const got = N.move(o, dx / d * st, dy / d * st);
    o.ang = Math.atan2(dy, dx); o.anim = (o.anim || 0) + got * 3;
    if (got < st * 0.3) { o.stuckT = (o.stuckT || 0) + dt; if (o.stuckT > 0.5) { o.stuckT = 0; return 'stuck'; } } else o.stuckT = 0;
    return 'moving';
  };
  // head somewhere: re-plans when the goal moves or the walker gets stuck; falls back to a guarded straight line
  N.goTo = function (o, x, y, speed, dt, opts) {
    const far = Math.hypot(x - o.x, y - o.y); if (far < 0.3) return 'done';
    const moved = !o.goal || Math.hypot(o.goal.x - x, o.goal.y - y) > (opts && opts.slack || 2);
    if (o.noPathT > 0) o.noPathT -= dt; // no route last time: wait a little before trying again (failed searches are the slow ones)
    if ((moved || (o.replan && !(o.noPathT > 0))) && N.canPlan()) { o.path = N.path(o.x, o.y, x, y, opts); o.pi = 0; o.goal = { x, y }; o.replan = false; o.noPath = !o.path; if (o.noPath) o.noPathT = 2; }
    if (o.path) { const r = N.follow(o, speed, dt); if (r === 'stuck') { o.replan = true; return 'stuck'; } if (r === 'done') { o.path = null; return 'done'; } return 'moving'; }
    // no plan yet (or none possible): edge straight there without going through walls or into the water
    const st = Math.min(far, speed * dt); const got = N.move(o, (x - o.x) / far * st, (y - o.y) / far * st); o.ang = Math.atan2(y - o.y, x - o.x); o.anim = (o.anim || 0) + got * 3;
    if (got < st * 0.3) { o.stuckT = (o.stuckT || 0) + dt; if (o.stuckT > 0.6) { o.stuckT = 0; o.replan = true; return 'stuck'; } }
    return 'moving';
  };
  // ---------- intents: the one way anyone on foot gets about ----------
  // Game code says what a walker wants (o.intent) and N.update moves them there through N.move. Nobody else writes x/y.
  //   { kind: 'goto', x, y, speed }        walk somewhere (footpaths, yards, round buildings)
  //   { kind: 'chase', target, speed }     run at someone (straight when there's a clear run, else the way round)
  //   { kind: 'flee', from, speed }        get away from someone along a route that keeps clear of them; o.cornered
  //                                        is set when there's nowhere left to go
  //   { kind: 'scatter', ang, speed }      bolt mostly that way, round walls (bystanders)
  //   { kind: 'push', vx, vy }             a jump or a shove, slowing down (diving out of a car's way)
  //   { kind: 'stay' }                     stand still
  // Returns 'done' when a goto arrives (or a chase catches up), else 'moving' / 'stuck'.
  N.update = function (o, dt) {
    const it = o.intent; if (!it || it.kind === 'stay') return 'idle';
    if (it.kind === 'goto') return N.goTo(o, it.x, it.y, it.speed, dt, it);
    if (it.kind === 'chase') {
      const t = it.target, near = it.near || 0.8; const d = Math.hypot(t.x - o.x, t.y - o.y); if (d <= near) return 'done';
      if (d < 30 && N.clear(o.x, o.y, t.x, t.y)) { const st = Math.min(d - near, it.speed * dt); N.move(o, (t.x - o.x) / d * st, (t.y - o.y) / d * st); o.ang = Math.atan2(t.y - o.y, t.x - o.x); o.path = null; o.goal = null; return 'moving'; }
      return N.goTo(o, t.x, t.y, it.speed, dt, { slack: 4 });
    }
    if (it.kind === 'flee') return N.evade(o, it.from, it.speed, dt);
    if (it.kind === 'scatter') {
      o.scatterT = (o.scatterT || 0) - dt; if (o.scatterT <= 0) { o.scatterT = 0.45; o.ang = N.fleeDir(o, it.ang); }
      if (N.move(o, Math.cos(o.ang) * it.speed * dt, Math.sin(o.ang) * it.speed * dt) < it.speed * dt * 0.3) o.scatterT = 0; return 'moving';
    }
    if (it.kind === 'push') { if (!N.move(o, it.vx * dt, it.vy * dt)) { it.vx *= -0.3; it.vy *= -0.3; } const k = Math.exp(-3 * dt); it.vx *= k; it.vy *= k; return 'moving'; }
    return 'idle';
  };
  // running from someone: a route to somewhere that leaves more room between you, re-planned every couple of seconds
  // or when they cut across it. Nowhere to go and them close by: cornered (they give up until the pursuer backs off).
  N.evade = function (o, from, speed, dt) {
    const dK = Math.hypot(o.x - from.x, o.y - from.y); o.replanT = (o.replanT || 0) - dt;
    if (o.cornered) { if (dK > 10) { o.cornered = false; o.replanT = 0; } else return 'cornered'; }
    const next = o.path && o.path[o.pi];
    const bad = !o.path || o.pi >= o.path.length || o.replanT <= 0 || (next && Math.hypot(next[0] - from.x, next[1] - from.y) < 5 && dK > 3);
    if (bad && N.canPlan()) {
      const t = N.fleeTarget(o, from);
      if (t && !t.busy) { o.path = t.path; o.pi = 0; o.replanT = 2.2; }
      else if (!t) { o.path = null; o.replanT = 0.6; if (dK < 9) { o.cornered = true; return 'cornered'; } }
    }
    if (o.path) { const r = N.follow(o, speed, dt); if (r === 'stuck') o.replanT = 0; return r === 'stuck' ? 'stuck' : 'moving'; }
    // nothing planned yet: edge away
    const a = N.fleeDir(o, Math.atan2(o.y - from.y, o.x - from.x)); o.ang = a; N.move(o, Math.cos(a) * speed * dt * 0.6, Math.sin(a) * speed * dt * 0.6); return 'moving';
  };
  // somewhere to run to, away from a pursuer: a reachable spot that leaves more room between you, routed so it doesn't
  // pass the pursuer. Null when there's nowhere left to go (cornered).
  N.fleeTarget = function (o, from, opts = {}) {
    const away = Math.atan2(o.y - from.y, o.x - from.x); const dHere = Math.hypot(o.x - from.x, o.y - from.y);
    const cands = [];
    for (const r of opts.radii || [22, 34]) for (let k = -4; k <= 4; k++) {
      const a = away + k * 0.42; const p = N.snap(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 3); if (!p) continue;
      const dFrom = Math.hypot(p.x - from.x, p.y - from.y); if (dFrom < dHere + 6) continue;
      cands.push({ p, score: dFrom - Math.abs(k) * 2 + Math.random() * 4 });
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands.slice(0, 3)) { if (!N.canPlan()) return { busy: true }; const path = N.path(o.x, o.y, c.p.x, c.p.y, { avoid: { x: from.x, y: from.y, r: 9 }, pad: 25, maxIter: 6000 }); if (path) return { x: c.p.x, y: c.p.y, path }; }
    return null;
  };
  // Self-check (?check=walkers): every kind of walker, in every way of moving, near houses, shops and the shore, for a
  // simulated 12 seconds; nobody may end up inside a building footprint or in the water. Returns { samples, bad: [...] }.
  N.selfCheck = function (secs = 12) {
    const G = VH.Game; const bad = []; let samples = 0; const saved = G.peds; G.peds = [];
    const inside = (x, y) => { let hit = false; W.buildingGrid.query(x, y, x, y, b => { if (!hit && U.pointInPoly(x, y, b.p)) hit = true; }); return hit; };
    for (const [cx, cy, where] of [[4850, 2860, 'foreshore'], [4420, 2290, 'town'], [3270, 4205, 'encounter bay'], [4960, 3000, 'causeway']]) {
      const c = N.snap(cx, cy, 30) || { x: cx, y: cy }; let sea = null; for (let r = 5; r < 300 && !sea; r += 5) for (let a = 0; a < U.TAU; a += 0.4) { const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (W.isWet(x, y)) { sea = { x, y }; break; } }
      const threat = { x: c.x + 6, y: c.y + 2 }; const doors = W.doors.filter(d => Math.hypot(d.x - c.x, d.y - c.y) < 150).slice(0, 8);
      const spot = () => N.snap(c.x + U.rand(-25, 25), c.y + U.rand(-25, 25), 8) || c;
      const people = [];
      for (const kind of ['schoolie', 'retiree', 'local', 'cop']) for (const st of ['walk', 'flee', 'run', 'goto', 'chase', 'dance']) {
        const s = spot(); const p = new VH.Ped(kind, s.x, s.y, { state: st, home: st === 'dance' ? { x: s.x, y: s.y } : null }); p.threat = threat; p.runSpeed = 7.6;
        if (st === 'goto') { const d = doors[people.length % Math.max(1, doors.length)] || sea || c; p.gx = d.x; p.gy = d.y; }
        if (st === 'chase') p.target = sea || c; if (st === 'flee') p.ang = sea ? Math.atan2(sea.y - s.y, sea.x - s.x) : 0;
        people.push(p); G.peds.push(p);
      }
      // officers on foot and a resident with a torch, the way police.js and the ding dong job drive them
      const off = { x: c.x, y: c.y, ang: 0, r: 0.5, intent: { kind: 'chase', target: sea || c, speed: 10.5, near: 0.8 } }; const res = new VH.Ped('retiree', c.x, c.y, { tag: 'resident' }); res.state = 'goto'; res.gx = (doors[0] || c).x; res.gy = (doors[0] || c).y; people.push(res); G.peds.push(res);
      const steps = Math.round(secs * 60);
      for (let i = 0; i < steps; i++) {
        N.frame(); threat.x = c.x + Math.cos(i / 60) * 8; threat.y = c.y + Math.sin(i / 60) * 8;
        for (const p of people) { if (p.state === 'idle' && p.gx != null) { p.state = 'goto'; } p.update(1 / 60, []); }
        N.update(off, 1 / 60);
        if (i % 6 === 0) for (const o of [...people, off]) { samples++; const ins = inside(o.x, o.y), wet = W.isWet(o.x, o.y); if (ins || wet) bad.push({ where, who: o.kind || 'officer', state: o.state || 'chase', inside: ins, wet, x: Math.round(o.x), y: Math.round(o.y) }); }
      }
    }
    G.peds = saved; const by = {}; for (const b of bad) { const k = b.where + '/' + b.who + '/' + b.state + (b.inside ? '/inside' : '/wet'); by[k] = (by[k] || 0) + 1; }
    return { samples, badCount: bad.length, by, bad: bad.filter((b, i) => i === 0 || bad[i - 1].who !== b.who || bad[i - 1].state !== b.state).slice(0, 12) };
  };
  // a quick direction to bolt in (bystanders scattering): the clearest way that's mostly away from the threat
  N.fleeDir = function (o, ang) {
    let best = ang, bs = -1e9;
    for (let k = 0; k < 10; k++) { const a = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45; const ok = N.clear(o.x, o.y, o.x + Math.cos(a) * 5, o.y + Math.sin(a) * 5); const sc = (ok ? 10 : 0) + Math.cos(a - ang) * 3; if (sc > bs) { bs = sc; best = a; } }
    return best;
  };
})(window.VH);
