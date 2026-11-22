#!/usr/bin/env node
// Spawn-slot baker: a separate pass after build_map.mjs (which calls it), or on its own:
//   node game/tools/bake_slots.mjs          reads game/data/map.json and the ground rasters, writes map.json's `slots`
//
// The game only ever spawns things (party gear, residents, ditchers, gophers, parked cars, crates...) on these slots,
// through VH.Spawn.pick (js/spawn.js). Every slot is checked here, and the bake fails if one doesn't pass:
//   - outside every building footprint, and off the water (or on it, for the water kinds);
//   - its clearance radius free of buildings, walls, water and solid props (trees, lamps, poles, fences...);
//   - connected, for each access mode it declares, to the network that mode moves on: a flood fill over the same
//     2 m ground grid the walkers' A* uses (foot and gopher), the drivable cells joined to the main road graph (car),
//     or the open sea (boat), each seeded from the town centre / open water.
// Slots are stored per kind as [x, y, heading, clearance, access, extra] (decimetres, milliradians, decimetres,
// access bits FOOT 1, GOPHER 2, CAR 4, BOAT 8, MAIN_ROAD 16; extra = a door or building index, or -1).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { RB_KINDS, RB_WATER, bakeRoundB } from './bake_slots_rb.mjs'; // Round B: water and sports kinds

export const ACCESS = { foot: 1, gopher: 2, car: 4, boat: 8, main: 16 };
export const KINDS = ['door', 'frontyard', 'backyard', 'kerb', 'carpark', 'footpath', 'beach', 'jetty_end', 'park_open', 'shopfront', 'roof_access', 'mooring', 'open_water', ...RB_KINDS];

// ---------- PNG (RGB, 8-bit) decoding, standard library only ----------
function decodePng(buf) {
  let p = 8, w = 0, h = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 2) throw new Error('bake_slots: expected an 8-bit RGB png'); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = 3, stride = w * bpp; const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i], a = i >= bpp ? out[dst + i - bpp] : 0, b = y ? out[dst - stride + i] : 0, c = y && i >= bpp ? out[dst - stride + i - bpp] : 0;
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  return { w, h, rgb: out };
}

export function bakeSlots(map, dataDir, log = console.log) {
  const M = map.meta, GC = M.groundClasses, CELL = M.cell, GW = M.gw, GH = M.gh;
  const ground = new Uint8Array(GW * GH), seaD = new Int16Array(GW * GH), roadD = new Uint8Array(GW * GH);
  for (const part of M.raster) {
    const { w, h, rgb } = decodePng(fs.readFileSync(path.join(dataDir, part.f)));
    if (w !== GW) throw new Error('bake_slots: raster width mismatch');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (part.y0 + y) * GW + x, o = (y * w + x) * 3; ground[k] = rgb[o]; seaD[k] = rgb[o + 1] - 128; roadD[k] = rgb[o + 2]; }
  }
  const dm = a => a.map(v => v / 10);
  const cellOf = (x, y) => { const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL); return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? -1 : gy * GW + gx; };
  const gAt = (x, y) => { const k = cellOf(x, y); return k < 0 ? GC.SEA : ground[k]; };
  const WET = g => g === GC.SEA || g === GC.WATER;
  const BLOCKED = g => g === GC.BUILDING || WET(g); // the walkers' A* (js/nav.js N.blockedG)

  // ---------- buildings (point-in-footprint), walls, solid props ----------
  const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > y) !== (p[j + 1] > y) && x < (p[j] - p[i]) * (y - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
  const BS = 32; const bGrid = new Map(); const bkey = (gx, gy) => gx * 100000 + gy;
  const buildings = map.buildings.map((b, i) => { const p = dm(b.p); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, cx = 0, cy = 0; for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); cx += p[k]; cy += p[k + 1]; } let A = 0; for (let k = 0; k < p.length; k += 2) { const j = (k + 2) % p.length; A += p[k] * p[j + 1] - p[j] * p[k + 1]; } return { i, k: b.k, ov: b.ov, p, bb: [x0, y0, x1, y1], cx: cx / (p.length / 2), cy: cy / (p.length / 2), area: Math.abs(A / 2) }; });
  for (const b of buildings) for (let gx = Math.floor(b.bb[0] / BS); gx <= Math.floor(b.bb[2] / BS); gx++) for (let gy = Math.floor(b.bb[1] / BS); gy <= Math.floor(b.bb[3] / BS); gy++) { const k = bkey(gx, gy); if (!bGrid.has(k)) bGrid.set(k, []); bGrid.get(k).push(b); }
  // every footprint counts, canopies included (js/nav.js N.inBuilding: nobody stands inside one)
  const inBuilding = (x, y) => { const l = bGrid.get(bkey(Math.floor(x / BS), Math.floor(y / BS))); if (l) for (const b of l) if (x >= b.bb[0] && x <= b.bb[2] && y >= b.bb[1] && y <= b.bb[3] && inPoly(x, y, b.p)) return b; return null; };
  // walls (bridge railings): their cells are off limits to the flood fills and to any clearance circle
  const wallCell = new Uint8Array(GW * GH);
  for (const w of map.walls || []) { const p = dm(w.p); for (let i = 0; i + 3 < p.length; i += 2) { const l = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); for (let s = 0; s <= l; s += 0.5) { const k = cellOf(p[i] + (p[i + 2] - p[i]) * s / (l || 1), p[i + 1] + (p[i + 3] - p[i + 1]) * s / (l || 1)); if (k >= 0) wallCell[k] = 1; } } }
  // solid props (js/sprites.js PK): lamp 0, signal 1, fence 4, bench 7, tree 8, bollard 10, sign 11, hydrant 15, phonebox 16
  const SOLID = new Map([[0, 0.3], [1, 0.3], [4, 0.6], [7, 0.8], [8, 1.2], [10, 0.25], [11, 0.25], [15, 0.3], [16, 0.7]]);
  const PS = 16; const pGrid = new Map();
  for (const q of map.props) { const r = SOLID.get(q[0]); if (r == null) continue; const x = q[1] / 10, y = q[2] / 10; const k = bkey(Math.floor(x / PS), Math.floor(y / PS)); if (!pGrid.has(k)) pGrid.set(k, []); pGrid.get(k).push([x, y, r]); }
  const propHit = (x, y, r) => { for (let gx = Math.floor((x - r - 2) / PS); gx <= Math.floor((x + r + 2) / PS); gx++) for (let gy = Math.floor((y - r - 2) / PS); gy <= Math.floor((y + r + 2) / PS); gy++) { const l = pGrid.get(bkey(gx, gy)); if (l) for (const [px, py, pr] of l) if (Math.hypot(px - x, py - y) < r + pr) return true; } return false; };

  // ---------- the networks each access mode moves on ----------
  const flood = (seedK, ok) => { const seen = new Uint8Array(GW * GH); if (seedK < 0 || !ok(seedK)) return seen; const q = new Int32Array(GW * GH); let h = 0, t = 0; q[t++] = seedK; seen[seedK] = 1;
    while (h < t) { const k = q[h++], x = k % GW, y = (k / GW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const nk = ny * GW + nx; if (seen[nk] || !ok(nk)) continue;
        if (dx && dy && (!ok(y * GW + nx) || !ok(ny * GW + x))) continue; seen[nk] = 1; q[t++] = nk; } }
    return seen; };
  const footOk = k => !BLOCKED(ground[k]) && !wallCell[k];
  const driveOk = k => (ground[k] === GC.ROAD || ground[k] === GC.PAVED) && !wallCell[k];
  const waterOk = k => WET(ground[k]);
  const town = (map.pois.find(p => p.k === 'town') || { x: GW * CELL * 5, y: GH * CELL * 5 }); const tx = town.x / 10, ty = town.y / 10;
  const nearCell = (x, y, ok, R = 200) => { for (let r = 0; r <= R; r += CELL) for (let a = 0; a < 6.283; a += r ? CELL / r : 7) { const k = cellOf(x + Math.cos(a) * r, y + Math.sin(a) * r); if (k >= 0 && ok(k)) return k; } return -1; };
  const footNet = flood(nearCell(tx, ty, driveOk), footOk);
  const driveNet = flood(nearCell(tx, ty, driveOk), driveOk);
  let deepK = -1, deepest = 0; for (let k = 0; k < GW * GH; k++) if (ground[k] === GC.SEA && seaD[k] < deepest) { deepest = seaD[k]; deepK = k; }
  const waterNet = flood(deepK, waterOk);
  const count = a => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i]; return n; };
  log(`slot networks: foot ${count(footNet)} cells, drive ${count(driveNet)}, water ${count(waterNet)}`);

  // the road graph: the main component (by edges) and a lookup of the nearest edge
  const gn = dm(map.graph.nodes); const edges = map.graph.edges.map((e, i) => ({ i, a: e[0], b: e[1], ow: e[2], w: e[3] / 10, speed: e[4], rb: e[6], p: dm(e[7]) }));
  const parent = gn.map((_, i) => i); const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const e of edges) parent[find(e.a)] = find(e.b);
  const ES = 24; const eGrid = new Map();
  for (const e of edges) for (let i = 0; i + 3 < e.p.length; i += 2) { const x = (e.p[i] + e.p[i + 2]) / 2, y = (e.p[i + 1] + e.p[i + 3]) / 2; const k = bkey(Math.floor(x / ES), Math.floor(y / ES)); if (!eGrid.has(k)) eGrid.set(k, []); eGrid.get(k).push([e, i]); }
  const segD = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return Math.hypot(x - ax - dx * t, y - ay - dy * t); };
  const nearestEdge = (x, y, R) => { let best = null, bd = R; for (let gx = Math.floor((x - R) / ES) - 1; gx <= Math.floor((x + R) / ES) + 1; gx++) for (let gy = Math.floor((y - R) / ES) - 1; gy <= Math.floor((y + R) / ES) + 1; gy++) { const l = eGrid.get(bkey(gx, gy)); if (l) for (const [e, i] of l) { const d = segD(x, y, e.p[i], e.p[i + 1], e.p[i + 2], e.p[i + 3]); if (d < bd) { bd = d; best = e; } } } return best ? { e: best, d: bd } : null; };
  const te = nearestEdge(tx, ty, 300); if (!te) throw new Error('bake_slots: no road near the town centre to seed the road graph');
  const mainRoot = find(te.e.a);
  const bridgeRoads = map.roads.filter(r => r.br).map(r => dm(r.p));
  const nearBridge = (x, y, R) => bridgeRoads.some(p => { for (let i = 0; i + 3 < p.length; i += 2) if (segD(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) < R) return true; return false; });
  const degree = new Map(); for (const e of edges) { degree.set(e.a, (degree.get(e.a) || 0) + 1); degree.set(e.b, (degree.get(e.b) || 0) + 1); }

  // ---------- the check every slot must pass (also run, independently, over the finished table) ----------
  const FOOT_KINDS = new Set(['door', 'frontyard', 'backyard', 'footpath', 'beach', 'jetty_end', 'park_open', 'shopfront']);
  const CAR_KINDS = new Set(['kerb', 'carpark']);
  const WATER_KINDS = new Set(['mooring', 'open_water', ...RB_WATER]);
  function check(kind, x, y, r, acc) {
    const k = cellOf(x, y); if (k < 0) return 'outside the world';
    if (WATER_KINDS.has(kind)) {
      if (!waterOk(k)) return 'not on the water'; if ((acc & ACCESS.boat) && !waterNet[k]) return 'not joined to the open water';
      for (let a = 0; a < 6.283; a += 0.4) for (const f of [0.5, 1]) { const kk = cellOf(x + Math.cos(a) * r * f, y + Math.sin(a) * r * f); if (kk < 0 || !waterOk(kk)) return 'land inside the clearance'; }
      return null;
    }
    if (inBuilding(x, y)) return 'inside a building';
    if (WET(ground[k])) return 'in the water';
    if (wallCell[k]) return 'on a wall';
    if (CAR_KINDS.has(kind)) { if (!driveOk(k)) return 'not on a drivable surface'; if ((acc & ACCESS.car) && !driveNet[k]) return 'not joined to the road network'; }
    else if (ground[k] === GC.BUILDING) return 'on a building cell';
    if ((acc & (ACCESS.foot | ACCESS.gopher)) && !footNet[k]) return 'not reachable on foot from the street';
    // the clearance circle: no building, water or wall, and no solid prop
    for (let a = 0; a < 6.283; a += 0.3) for (const f of [0.4, 0.75, 1]) {
      const px = x + Math.cos(a) * r * f, py = y + Math.sin(a) * r * f; const kk = cellOf(px, py);
      if (kk < 0 || BLOCKED(ground[kk]) || wallCell[kk] || inBuilding(px, py)) return 'blocked inside the clearance';
    }
    if (propHit(x, y, r * (CAR_KINDS.has(kind) ? 0.7 : 1))) return 'a solid prop inside the clearance';
    if (kind === 'backyard' && ground[k] === GC.ROAD) return 'a backyard on the road';
    return null;
  }
  // the biggest clearance (up to max) that passes at a point
  const clearance = (kind, x, y, acc, min, max) => { if (check(kind, x, y, min, acc)) return 0; let r = min; while (r + 0.5 <= max && !check(kind, x, y, r + 0.5, acc)) r += 0.5; return r; };

  const slots = Object.fromEntries(KINDS.map(k => [k, []]));
  const rej = Object.fromEntries(KINDS.map(k => [k, 0]));
  // stored in decimetres: the rounded slot has to pass too (it's what the game reads)
  const add = (kind, x, y, a, r, acc, extra = -1) => { const s = [Math.round(x * 10), Math.round(y * 10), Math.round(a * 1000), Math.floor(r * 10), acc, extra]; if (check(kind, s[0] / 10, s[1] / 10, s[3] / 10, acc)) { rej[kind]++; return false; } slots[kind].push(s); return true; };
  const FOOT = ACCESS.foot | ACCESS.gopher;

  // doors and front yards: from the doorbell doors (on the house's street side)
  const doorBuilding = [];
  map.doors.forEach((d, i) => {
    const dx = d[0] / 10, dy = d[1] / 10, lx = d[2] / 10, ly = d[3] / 10; const a = Math.atan2(ly - dy, lx - dx);
    let ok = null; for (let s = 0; s <= 3; s += 0.5) { const x = dx + Math.cos(a) * s, y = dy + Math.sin(a) * s; if (!check('door', x, y, 0.6, FOOT)) { ok = { x, y }; break; } }
    if (!ok) { rej.door++; return; }
    add('door', ok.x, ok.y, a, 0.6, FOOT, i);
    // the house it belongs to: the nearest footprint behind the door
    const b = inBuilding(dx - Math.cos(a) * 1.5, dy - Math.sin(a) * 1.5) || inBuilding(dx - Math.cos(a) * 3, dy - Math.sin(a) * 3); doorBuilding[i] = b;
    let fy = null; for (const s of [3, 4, 5, 2.5]) { const x = ok.x + Math.cos(a) * s, y = ok.y + Math.sin(a) * s; const r = clearance('frontyard', x, y, FOOT, 1.2, 3); if (r && ground[cellOf(x, y)] !== GC.ROAD) { fy = { x, y, r }; break; } }
    if (fy) add('frontyard', fy.x, fy.y, a, fy.r, FOOT, i); else rej.frontyard++;
  });
  // backyards: behind (or beside) each house with a door, away from the street, with room for a party (patio, lawn,
  // garden). Reachable on foot means there's a side path or a gate round to it.
  map.doors.forEach((d, i) => {
    const b = doorBuilding[i]; if (!b || b.area < 50 || b.area > 600) return;
    const dx = d[0] / 10, dy = d[1] / 10; const back = Math.atan2(b.cy - dy, b.cx - dx);
    // how far the house runs that way
    let far = 0; for (let s = 0; s < 40; s += 0.5) if (inBuilding(b.cx + Math.cos(back) * s, b.cy + Math.sin(back) * s) === b) far = s;
    let best = null;
    for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.57, -1.57]) {
      const a = back + da;
      for (const off of [3.5, 5, 6.5, 8]) {
        const x = b.cx + Math.cos(a) * (far * (da ? Math.cos(da) * 0.9 : 1) + off), y = b.cy + Math.sin(a) * (far * (da ? Math.cos(da) * 0.9 : 1) + off);
        const k = cellOf(x, y); if (k < 0 || roadD[k] < 6) continue;
        const r = clearance('backyard', x, y, FOOT, 3, 7); if (r && (!best || r > best.r + 0.5)) best = { x, y, r, a: Math.atan2(b.cy - y, b.cx - x) };
      }
      if (best && best.r >= 4) break;
    }
    if (best) add('backyard', best.x, best.y, best.a, best.r, FOOT, b.i); else rej.backyard++;
  });
  // kerbs (parked cars; gophers and hoons set off from them) and footpaths, along the main road network
  for (const e of edges) {
    if (find(e.a) !== mainRoot || e.w < 5) continue;
    const p = e.p; let cum = 0; const main = e.speed >= 50 && e.w >= 6.5;
    const L = []; for (let i = 0; i + 3 < p.length; i += 2) L.push(Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1])); const len = L.reduce((s, v) => s + v, 0);
    const at = s => { let acc = 0; for (let i = 0, j = 0; i + 3 < p.length; i += 2, j++) { if (acc + L[j] >= s || i + 4 >= p.length) { const t = Math.min(1, (s - acc) / (L[j] || 1)); return [p[i] + (p[i + 2] - p[i]) * t, p[i + 1] + (p[i + 3] - p[i + 1]) * t, Math.atan2(p[i + 3] - p[i + 1], p[i + 2] - p[i])]; } acc += L[j]; } return [p[0], p[1], 0]; };
    const ends = [[gn[e.a * 2], gn[e.a * 2 + 1], degree.get(e.a)], [gn[e.b * 2], gn[e.b * 2 + 1], degree.get(e.b)]];
    for (let s = 10; s < len - 10; s += 30) {
      const [x0, y0, ang] = at(s);
      if (ends.some(([ex, ey, dg]) => dg >= 3 && Math.hypot(ex - x0, ey - y0) < 14) || nearBridge(x0, y0, 8)) continue;
      for (const side of e.ow ? [1] : [1, -1]) {
        const off = e.w / 2 - 1.1, x = x0 + Math.sin(ang) * off * side, y = y0 - Math.cos(ang) * off * side, a = side > 0 ? ang : ang + Math.PI;
        const acc = ACCESS.car | (footNet[cellOf(x, y)] ? FOOT : 0) | (main ? ACCESS.main : 0);
        if (!check('kerb', x, y, 2.2, acc)) add('kerb', x, y, a, 2.2, acc, e.i); else rej.kerb++;
      }
      if (s % 60 < 30) for (const side of [1, -1]) {
        const off = e.w / 2 + 1.6, x = x0 + Math.sin(ang) * off * side, y = y0 - Math.cos(ang) * off * side;
        const k = cellOf(x, y); if (k < 0 || ground[k] === GC.ROAD) { rej.footpath++; continue; }
        if (!check('footpath', x, y, 0.8, FOOT)) add('footpath', x, y, ang, 0.8, FOOT | (main ? ACCESS.main : 0), e.i); else rej.footpath++;
      }
    }
  }
  // car parks: bays in the paved areas, off the street itself
  for (const ar of map.areas) {
    if (ar.k !== 'paved') continue; const p = dm(ar.p); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); }
    const area = (x1 - x0) * (y1 - y0); if (area < 250 || area > 40000) continue;
    const wide = x1 - x0 > y1 - y0, a = wide ? Math.PI / 2 : 0; let n = 0;
    for (let x = x0 + 2.5; x < x1 - 2 && n < 24; x += wide ? 3 : 6) for (let y = y0 + 2.5; y < y1 - 2 && n < 24; y += wide ? 6 : 3) {
      if (!inPoly(x, y, p)) continue; const k = cellOf(x, y); if (k < 0 || roadD[k] < 3) continue;
      if (!check('carpark', x, y, 1.6, ACCESS.car | FOOT)) { add('carpark', x, y, a, 1.6, ACCESS.car | FOOT); n++; } else rej.carpark++;
    }
  }
  // beaches, open parkland and the jetty ends
  for (let gy = 2; gy < GH - 2; gy += 10) for (let gx = (gy * 7) % 10; gx < GW - 2; gx += 10) {
    const k = gy * GW + gx; if (ground[k] !== GC.SAND || seaD[k] < 4) continue; const x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
    if (!check('beach', x, y, 3, FOOT)) add('beach', x, y, 0, 3, FOOT); else rej.beach++;
  }
  for (const ar of map.areas) {
    if (!['park', 'grass', 'pitch', 'campus'].includes(ar.k)) continue; const p = dm(ar.p); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); }
    for (let x = x0 + 8; x < x1 - 8; x += 22) for (let y = y0 + 8; y < y1 - 8; y += 22) {
      if (!inPoly(x, y, p) || ground[cellOf(x, y)] === GC.ROAD) continue; const r = clearance('park_open', x, y, FOOT, 5, 10);
      if (r) add('park_open', x, y, 0, r, FOOT); else rej.park_open++;
    }
  }
  for (const r of map.roads) {
    if (r.c !== 'pier') continue; const p = dm(r.p); const ends = [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]];
    const [x, y] = ends.sort((A, B) => (seaD[cellOf(A[0], A[1])] ?? 0) - (seaD[cellOf(B[0], B[1])] ?? 0))[0];
    let ok = null; for (let s = 0; s < 30 && !ok; s += 1) { const o = ends[1][0] === x ? ends[0] : ends[1]; const l = Math.hypot(o[0] - x, o[1] - y) || 1; const px = x + (o[0] - x) / l * s, py = y + (o[1] - y) / l * s; if (!check('jetty_end', px, py, 1, FOOT)) ok = { x: px, y: py }; }
    if (ok) add('jetty_end', ok.x, ok.y, 0, 1, FOOT); else rej.jetty_end++;
  }
  // shopfronts: in front of the named shops, on the street side
  for (const b of buildings) {
    if (!['shop', 'retail', 'commercial', 'big', 'hotel'].includes(b.k)) continue;
    const ne = nearestEdge(b.cx, b.cy, 80); if (!ne) continue; const e = ne.e; let bd = 1e9, ex = 0, ey = 0;
    for (let i = 0; i + 3 < e.p.length; i += 2) { const d = segD(b.cx, b.cy, e.p[i], e.p[i + 1], e.p[i + 2], e.p[i + 3]); if (d < bd) { bd = d; const dx = e.p[i + 2] - e.p[i], dy = e.p[i + 3] - e.p[i + 1], l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((b.cx - e.p[i]) * dx + (b.cy - e.p[i + 1]) * dy) / l2)); ex = e.p[i] + dx * t; ey = e.p[i + 1] + dy * t; } }
    const a = Math.atan2(ey - b.cy, ex - b.cx); let ok = null;
    for (let s = 0; s < 60 && !ok; s += 0.5) { const x = b.cx + Math.cos(a) * s, y = b.cy + Math.sin(a) * s; if (inBuilding(x, y)) continue; const k = cellOf(x, y); if (k >= 0 && ground[k] !== GC.ROAD && !check('shopfront', x, y, 1, FOOT)) ok = { x, y }; }
    if (ok) add('shopfront', ok.x, ok.y, a + Math.PI, 1, FOOT, b.i); else rej.shopfront++;
  }
  // the water (for boats): moorings off the slipways and jetties, and open water further out
  const anchors = [...map.pois.filter(p => /slipway|ramp|marina|jetty|pier/i.test(p.k + ' ' + (p.n || ''))).map(p => [p.x / 10, p.y / 10]), ...slots.jetty_end.map(s => [s[0] / 10, s[1] / 10])];
  for (const [ax, ay] of anchors) for (let rr = 25; rr <= 120; rr += 20) for (let a = 0; a < 6.283; a += 0.5) {
    const x = ax + Math.cos(a) * rr, y = ay + Math.sin(a) * rr; const k = cellOf(x, y); if (k < 0 || ground[k] !== GC.SEA || seaD[k] > -8) continue;
    if (slots.mooring.some(s => Math.hypot(s[0] / 10 - x, s[1] / 10 - y) < 18)) continue;
    if (!check('mooring', x, y, 4, ACCESS.boat)) add('mooring', x, y, a, 4, ACCESS.boat); else rej.mooring++;
  }
  for (let gy = 5; gy < GH - 5; gy += 60) for (let gx = 5; gx < GW - 5; gx += 60) {
    const k = gy * GW + gx; if (ground[k] !== GC.SEA || seaD[k] > -60) continue; const x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
    if (!check('open_water', x, y, 12, ACCESS.boat)) add('open_water', x, y, 0, 12, ACCESS.boat); else rej.open_water++;
  }
  // roof_access: none (nothing is ever placed on a roof)
  // Round B: ramps, the skate park, courts, bowls, the scrub jumps, fireworks sites and stashes, the water race (bake_slots_rb.mjs)
  bakeRoundB({ map, dataDir, slots, add, check, clearance, cellOf, ground, seaD, GC, CELL, GW, GH, ACCESS, inBuilding, waterOk, waterNet, footNet, driveNet, nearestEdge, log });

  // ---------- the final, independent pass: every slot in the table must pass, or the build fails ----------
  const bad = [];
  for (const kind of KINDS) for (const s of slots[kind]) { const why = check(kind, s[0] / 10, s[1] / 10, s[3] / 10, s[4]); if (why) bad.push(`${kind} at ${(s[0] / 10).toFixed(1)},${(s[1] / 10).toFixed(1)}: ${why}`); }
  if (bad.length) throw new Error(`bake_slots: ${bad.length} slots fail validation:\n  ` + bad.slice(0, 20).join('\n  '));
  const counts = Object.fromEntries(KINDS.map(k => [k, slots[k].length]));
  log('slots', Object.entries(counts).map(e => e.join(':')).join(' '));
  log('rejected candidates', Object.entries(rej).filter(e => e[1]).map(e => e.join(':')).join(' '));
  return { slots, counts };
}

// run on its own: bake into the existing map.json
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
  const f = path.join(dataDir, 'map.json'); const map = JSON.parse(fs.readFileSync(f, 'utf8'));
  const { slots } = bakeSlots(map, dataDir);
  map.slots = { v: 1, access: ACCESS, kinds: slots };
  const json = JSON.stringify(map); fs.writeFileSync(f, json); console.log('wrote map.json', json.length);
}
