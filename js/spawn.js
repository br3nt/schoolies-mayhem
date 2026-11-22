// Spawning, only on baked slots. tools/bake_slots.mjs writes typed, validated places into map.json (doors, front
// yards, backyards, kerbs, car-park bays, footpaths, beaches, open parkland, jetty ends, shopfronts, moorings, open
// water), each with a heading, a clearance radius and the ways you can reach it (foot, gopher, car, boat). Mission
// and job code asks for one of those and never places anything at raw coordinates:
//
//   VH.Spawn.pick('backyard', { near: { x, y }, minDist: 0, maxDist: 400, access: 'gopher', clearance: 4 })
//   VH.Spawn.many('door', 5, { near, maxDist: 380, spacing: 40 })
//
// A slot comes back as { kind, x, y, a, r, access, extra, main } (metres, radians; extra is the door index for doors,
// the building index for backyards and shopfronts, the road edge for kerbs). If nothing fits, pick() throws in
// development (localhost, or ?dev) and returns null in a published build: it never quietly places something elsewhere.
// Options: near, minDist, maxDist, access ('foot' | 'gopher' | 'car' | 'boat', or a list), clearance, main (main
// roads only), unoccupied (no vehicle within 6 m), offscreen (out of the camera's view), avoid (points to keep `spacing` metres from), filter(slot),
// claim (seconds to keep the slot for this caller), nearest (the closest instead of a random one), optional (return
// null quietly when nothing fits: for callers that simply skip, never for ones that would place something anyway).
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World;
  const S = VH.Spawn = { kinds: {}, ACCESS: { foot: 1, gopher: 2, car: 4, boat: 8, main: 16 }, grids: {}, ready: false };
  S.DEV = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.test$/.test(location.hostname) || /[?&]dev\b/.test(location.search);
  const CELL = 64;
  S.init = function (raw) {
    S.kinds = {}; S.grids = {};
    const kinds = raw && raw.kinds || {};
    for (const [kind, list] of Object.entries(kinds)) {
      const out = list.map((s, i) => ({ kind, i, x: s[0] / 10, y: s[1] / 10, a: s[2] / 1000, r: s[3] / 10, access: s[4], extra: s[5], main: !!(s[4] & 16), busyUntil: 0 }));
      S.kinds[kind] = out; const g = new Map(); S.grids[kind] = g;
      for (const s of out) { const k = Math.floor(s.x / CELL) * 100000 + Math.floor(s.y / CELL); if (!g.has(k)) g.set(k, []); g.get(k).push(s); }
    }
    // a door's spot is its validated slot (a step out from the wall, never inside it); doors without a slot are skipped
    for (const s of S.kinds.door || []) { const d = W.doors[s.extra]; if (d) { d.x = s.x; d.y = s.y; d.slot = s; } }
    S.ready = Object.keys(S.kinds).length > 0;
  };
  S.count = kind => (S.kinds[kind] || []).length;
  const bits = a => (Array.isArray(a) ? a : a ? [a] : []).reduce((m, k) => m | (S.ACCESS[k] || 0), 0);
  // every slot of a kind in a box (for drawing yards and the like)
  S.inBox = function (kind, x0, y0, x1, y1, fn) {
    const g = S.grids[kind]; if (!g) return;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) { const l = g.get(gx * 100000 + gy); if (l) for (const s of l) if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) fn(s); }
  };
  S.candidates = function (kind, o = {}) {
    const list = S.kinds[kind]; if (!list) return [];
    const need = bits(o.access), clr = o.clearance || 0, now = VH.Game ? VH.Game.t : 0;
    const G = VH.Game, view = G && G.viewHalf || [90, 60];
    const ok = s => (s.access & need) === need && s.r >= clr && (!o.main || s.main) && !(s.busyUntil > now) &&
      (!o.offscreen || !G || Math.abs(s.x - G.cam.x) > view[0] + 8 || Math.abs(s.y - G.cam.y) > view[1] + 8) &&
      (!o.avoid || o.avoid.every(p => Math.hypot(p.x - s.x, p.y - s.y) >= (o.spacing || 0))) &&
      (!o.filter || o.filter(s)) && (!o.unoccupied || !G || !G.vehicles.some(v => !v.removed && Math.abs(v.x - s.x) < 6 && Math.abs(v.y - s.y) < 6)) && (!(s.access & 3) || !VH.Nav || VH.Nav.walkable(s.x, s.y)); // nothing has since been built on it
    if (!o.near) return list.filter(ok);
    const out = [], mn = o.minDist || 0, mx = o.maxDist == null ? 1e9 : o.maxDist;
    if (mx < 4000) { S.inBox(kind, o.near.x - mx, o.near.y - mx, o.near.x + mx, o.near.y + mx, s => { const d = Math.hypot(s.x - o.near.x, s.y - o.near.y); if (d >= mn && d <= mx && ok(s)) out.push(s); }); return out; }
    for (const s of list) { const d = Math.hypot(s.x - o.near.x, s.y - o.near.y); if (d >= mn && d <= mx && ok(s)) out.push(s); }
    return out;
  };
  const view = s => ({ kind: s.kind, i: s.i, x: s.x, y: s.y, a: s.a, r: s.r, access: s.access, extra: s.extra, main: s.main, slot: s });
  S.pick = function (kind, o = {}) {
    const c = S.candidates(kind, o);
    if (!c.length) {
      const msg = `Spawn.pick: no '${kind}' slot fits ${JSON.stringify({ near: o.near && { x: Math.round(o.near.x), y: Math.round(o.near.y) }, minDist: o.minDist, maxDist: o.maxDist, access: o.access, clearance: o.clearance, main: o.main })}`;
      if (o.optional) return null; // the caller copes without one (and places nothing)
      if (S.DEV) throw new Error(msg); console.warn(msg); return null;
    }
    let s;
    if (o.nearest && o.near) s = c.reduce((b, q) => Math.hypot(q.x - o.near.x, q.y - o.near.y) < Math.hypot(b.x - o.near.x, b.y - o.near.y) ? q : b);
    else s = c[Math.floor((o.rnd || Math.random)() * c.length)];
    if (o.claim) s.busyUntil = (VH.Game ? VH.Game.t : 0) + o.claim;
    return view(s);
  };
  // several, at least `spacing` apart (fewer if there aren't enough; throws in development if there are none)
  S.many = function (kind, n, o = {}) {
    const out = []; const pool = S.candidates(kind, o).sort(() => Math.random() - 0.5);
    for (const s of pool) { if (out.length >= n) break; if (out.every(q => Math.hypot(q.x - s.x, q.y - s.y) >= (o.spacing || 0))) out.push(view(s)); }
    if (!out.length && !o.optional) { const msg = `Spawn.many: no '${kind}' slots fit`; if (S.DEV) throw new Error(msg); console.warn(msg); }
    if (o.claim) for (const s of out) s.slot.busyUntil = (VH.Game ? VH.Game.t : 0) + o.claim;
    return out;
  };
  // a point near a slot for a second person or a prop, kept inside the slot's clearance (and on walkable ground)
  S.around = function (s, dist, ang) { const d = Math.min(dist, Math.max(0, s.r - 0.4)); const x = s.x + Math.cos(ang) * d, y = s.y + Math.sin(ang) * d; return !VH.Nav || VH.Nav.walkable(x, y) ? { x, y } : { x: s.x, y: s.y }; };
  // put things on a slot: a vehicle (parked on it, facing its heading), a person (optionally a little way off, within
  // the slot's clearance), and set a vehicle driving off along the road its kerb slot sits on
  S.vehicle = function (type, s, opts) { const v = new VH.Vehicle(type, s.x, s.y, s.a, opts || {}); VH.Game.vehicles.push(v); return v; };
  S.ped = function (kind, s, opts, off) { const q = off ? S.around(s, off.d, off.a) : s; const p = new VH.Ped(kind, q.x, q.y, opts || {}); VH.Game.peds.push(p); return p; };
  S.drive = function (v, s) {
    const n = W.nearestEdge(s.x, s.y, 14); if (!n) return false; const e = n.e;
    const dir = e.ow === 1 ? 1 : e.ow === -1 ? -1 : (Math.cos(s.a - n.ang) >= 0 ? 1 : -1); VH.AI.attach(v, n, dir); return true;
  };
  // can you get to (x, y) on foot from the street? A flood over the same 2 m grid the walkers' A* uses (no buildings,
  // no water, no cutting corners), out from the point until it reaches a road. For tests (?check=slots, the bot).
  S.reachable = function (x, y, maxCells = 400000) {
    const N = VH.Nav, GC = W.GC; const st = N.snap(x, y, 2); if (!st) return false;
    const gw = W.gw, gh = W.gh, k0 = W.cellIdx(st.x, st.y); if (k0 < 0) return false;
    const ok = k => !N.blockedG(W.ground[k]); const seen = new Set([k0]); const q = [k0];
    for (let h = 0; h < q.length && q.length < maxCells; h++) {
      const k = q[h]; if (W.ground[k] === GC.ROAD) return true; const cx = k % gw, cy = (k / gw) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const nk = ny * gw + nx; if (seen.has(nk) || !ok(nk)) continue; if (dx && dy && (!ok(cy * gw + nx) || !ok(ny * gw + cx))) continue; seen.add(nk); q.push(nk); }
    }
    return false;
  };
  // ?check=slots: every slot near a point (or a sample of all of them) still stands and can be walked to
  S.selfCheck = function (n = 300) {
    const bad = [], kinds = ['door', 'frontyard', 'backyard', 'footpath', 'shopfront', 'park_open', 'beach'];
    for (const kind of kinds) { const l = S.kinds[kind] || []; for (let i = 0; i < Math.min(n, l.length); i++) { const s = l[Math.floor(i * l.length / Math.min(n, l.length))]; if (!VH.Nav.walkable(s.x, s.y) || !S.reachable(s.x, s.y)) bad.push(kind + '@' + s.x.toFixed(1) + ',' + s.y.toFixed(1)); } }
    return { checked: kinds.reduce((t, k) => t + Math.min(n, S.count(k)), 0), bad };
  };
  // the door object (doorbell camera, porch light) behind a door slot
  S.door = s => W.doors[s.extra];
})(window.VH);
