// Round B spawn slots: the water and sports places, baked by tools/bake_slots.mjs with the same validation as the rest
// (outside buildings, off or on the water as the kind needs, clearance free, reachable by its access modes), from
// data/features.json (tools/build_features.mjs: boat ramps, jetties, the skate park, courts, bowls greens, the club)
// and map.json. Nothing here is a hand-placed coordinate: every slot is found from a mapped feature or a named place.
//   slipway      top of a boat ramp, heading down it to the water (a boat on a trailer, Dez waiting)   extra: feature id
//   skatepark    the jam pad beside the skate park                                                  extra: 0
//   court        the middle of a basketball court                                                   extra: court index
//   bowls_green  the middle of a bowls green; bowls_club: the club door side, for the sign and the secretary
//   dirt_track   room for the invented scrub jumps (a 46 x 24 m loop) in the bush west of town      extra: -1
//   launch_site  fireworks launch spots                                         extra: 0 granite, 1 bluff, 2 jetty, 3 warland
//   stash        hidden fireworks boxes                                         extra: 0 under the causeway, 1 behind the bowls club
//   race_start   the water race start/finish ring; race_mark: its gates in order (extra = gate number); every leg
//                between them is checked to be on the water (under the causeway counts); ramp_buoy: jump ramps on
//                the three longest legs (extra = leg) and two free ones (extra -1 off the foreshore, -2 off the jetty)
//   mooring      (added to Round A's kind) alongside the jetties and the old wharf under the Bluff, not under the planks
// Feature ids for slipway.extra: 0..n for data slipways, 100+i for named boat ramps.
import fs from 'node:fs';
import path from 'node:path';

export const RB_KINDS = ['slipway', 'skatepark', 'court', 'bowls_green', 'bowls_club', 'dirt_track', 'launch_site', 'stash', 'race_start', 'race_mark', 'ramp_buoy'];
export const RB_WATER = ['race_start', 'race_mark', 'ramp_buoy'];

export function bakeRoundB(C) {
  const { map, dataDir, add, check, clearance, cellOf, ground, seaD, GC, CELL, GW, GH, ACCESS, inBuilding, waterOk, nearestEdge, log, slots } = C;
  const FOOT = ACCESS.foot | ACCESS.gopher, BOAT = ACCESS.boat;
  const fp = path.join(dataDir, 'features.json');
  if (!fs.existsSync(fp)) throw new Error('bake_slots (Round B): data/features.json is missing: run tools/build_features.mjs');
  const F = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const fail = msg => { throw new Error('bake_slots (Round B): ' + msg); };
  const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > y) !== (p[j + 1] > y) && x < (p[j] - p[i]) * (y - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
  const centroid = p => { let x = 0, y = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; } return { x: x / (p.length / 2), y: y / (p.length / 2) }; };
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // the nearest point to (x, y), out to R metres, where ok(x, y) passes
  const search = (x, y, R, ok, step = 1) => { for (let r = 0; r <= R; r += step) for (let a = 0; a < 6.283; a += r ? Math.min(0.5, step / r) : 7) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return { x: px, y: py }; } return null; };
  const put = (kind, p, r, acc, extra, a = 0) => { if (!add(kind, p.x, p.y, a, r, acc, extra)) fail(`'${kind}' at ${p.x.toFixed(1)},${p.y.toFixed(1)} fails once rounded`); return { x: p.x, y: p.y, r, a }; };
  // a land slot: the nearest valid point to a mapped place, with as much room as it has (min..max)
  const land = (kind, x, y, R, min, max, extra, o = {}) => {
    const p = search(x, y, R, (px, py) => (!o.ok || o.ok(px, py)) && !check(kind, px, py, min, FOOT)); if (!p) { if (o.optional) return null; fail(`no room for '${kind}' (${extra}) near ${x.toFixed(0)},${y.toFixed(0)}`); }
    return put(kind, p, clearance(kind, p.x, p.y, FOOT, min, max), FOOT, extra, o.a || 0);
  };
  const poi = re => { const p = map.pois.find(q => re.test(q.n || '')) || (map.places || []).find(q => re.test(q.n || '')); if (!p) fail('no mapped place matching ' + re); return { x: p.x / 10, y: p.y / 10 }; };

  // ---------- jetties, the causeway and the old wharf stand on piles: a boat goes underneath ----------
  const pier = new Uint8Array(GW * GH), pierWide = new Uint8Array(GW * GH);
  const markLine = (p, w, arr, pad) => { for (let i = 0; i + 3 < p.length; i += 2) { const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) || 1, nx = -(p[i + 3] - p[i + 1]) / L, ny = (p[i + 2] - p[i]) / L; for (let s = 0; s <= L; s += 0.8) for (let o = -w / 2 - pad; o <= w / 2 + pad; o += 0.8) { const k = cellOf(p[i] + (p[i + 2] - p[i]) * s / L + nx * o, p[i + 1] + (p[i + 3] - p[i + 1]) * s / L + ny * o); if (k >= 0) arr[k] = 1; } } };
  const markArea = (p, arr, pad) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } for (let x = x0 - pad; x <= x1 + pad; x += 0.8) for (let y = y0 - pad; y <= y1 + pad; y += 0.8) if (inPoly(x, y, p) || (pad && [[pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([dx, dy]) => inPoly(x + dx, y + dy, p)))) { const k = cellOf(x, y); if (k >= 0) arr[k] = 1; } };
  for (const pr of F.piers || []) { if (pr.area) { markArea(pr.p, pier, 0); markArea(pr.p, pierWide, 4); } else { markLine(pr.p, pr.w || 4, pier, 1); markLine(pr.p, pr.w || 4, pierWide, 4); } }
  for (const r of map.roads) if (r.c === 'pier') { const p = r.p.map(v => v / 10); markLine(p, 4, pier, 1); markLine(p, 4, pierWide, 4); }
  const boatOk = k => k >= 0 && (waterOk(k) || pier[k]);
  const openSea = k => k >= 0 && ground[k] === GC.SEA && !pier[k];
  const deepAt = (x, y, m) => { const k = cellOf(x, y); return k >= 0 && waterOk(k) && seaD[k] < -m; };
  const legOk = (a, b, allowPier) => { const L = d2(a, b); for (let s = 0; s <= L; s += 1.5) { const k = cellOf(a.x + (b.x - a.x) * s / L, a.y + (b.y - a.y) * s / L); if (!(allowPier ? boatOk(k) : waterOk(k) && !pier[k])) return false; } return true; };

  // ---------- boat ramps ----------
  const ramps = [];
  const rampFrom = (x, y, extra) => {
    // down the ramp: the nearest open water joined to the sea
    const w = search(x, y, 90, (px, py) => { const k = cellOf(px, py); return k >= 0 && C.waterNet[k] && seaD[k] < -1.5; }, 1.5); if (!w) return null;
    const a = Math.atan2(w.y - y, w.x - x);
    // the top: on the ramp, a few metres back from the water's edge, reachable on foot (and so from the car park)
    let top = null; for (let s = 3; s < 20 && !top; s += 0.5) { const q = { x: x - Math.cos(a) * s, y: y - Math.sin(a) * s }; if (!check('slipway', q.x, q.y, 1.5, FOOT)) top = q; }
    if (!top) return null;
    ramps.push({ top, water: w, a, extra }); return put('slipway', top, 1.5, FOOT, extra, a);
  };
  (F.slipways || []).forEach((s, i) => { if (!rampFrom(s.x, s.y, i)) fail('no ramp top/water at slipway ' + i); });
  (F.ramps || []).forEach((s, i) => { if (ramps.some(q => d2(q.top, s) < 40)) return; if (!rampFrom(s.x, s.y, 100 + i)) fail('no ramp top/water at ' + s.name); });

  // ---------- moorings alongside the jetties and the wharf (beside the planks, never under them) ----------
  // close enough to step aboard from the planks (Game.ENTER_R is 3.2 m): walkable ground within 2.6 m
  const stepFrom = (x, y) => { for (let r = 1; r <= 2.6; r += 0.4) for (let a = 0; a < 6.283; a += 0.3) { const k = cellOf(x + Math.cos(a) * r, y + Math.sin(a) * r); if (k >= 0 && C.footNet[k] && !waterOk(k)) return true; } return false; };
  const moorOk = (x, y) => { const k = cellOf(x, y); return k >= 0 && !pier[k] && C.waterNet[k] && !check('mooring', x, y, 1.5, BOAT) && stepFrom(x, y); };
  const moors = [];
  for (const pr of F.piers || []) {
    const ends = pr.area ? [centroid(pr.p)] : [{ x: pr.p[pr.p.length - 2], y: pr.p[pr.p.length - 1] }, { x: pr.p[0], y: pr.p[1] }];
    const sea = ends.sort((A, B) => (seaD[cellOf(A.x, A.y)] ?? 0) - (seaD[cellOf(B.x, B.y)] ?? 0))[0]; // the seaward end
    const m = search(sea.x, sea.y, 30, moorOk, 0.8); if (!m) continue;
    if (moors.some(q => d2(q, m) < 10)) continue; moors.push(m); put('mooring', m, 1.5, BOAT, -1, Math.atan2(sea.y - m.y, sea.x - m.x) + Math.PI / 2);
  }

  // ---------- the skate park, the courts, the bowls ----------
  if (!(F.skate || []).length) fail('no skate park in the features'); if (!(F.clubs || []).length) fail('no bowls club in the features'); if (!ramps.length) fail('no boat ramps found');
  for (const [i, s] of (F.skate || []).entries()) { const c = centroid(s.p); land('skatepark', c.x, c.y, 40, 7, 9, i, { ok: (x, y) => !inPoly(x, y, s.p) }); }
  let courts = 0; for (const [i, c] of (F.courts || []).entries()) { const q = c.p ? centroid(c.p) : c; if (land('court', q.x, q.y, 10, 3, 7, i, { optional: true })) courts++; }
  const greens = []; for (const [i, g] of (F.bowls || []).entries()) { const c = centroid(g.p); const s = land('bowls_green', c.x, c.y, 15, 4, 10, i, { optional: true }); if (s) greens.push({ ...s, i }); }
  const club = (F.clubs || [])[0];
  if (club) {
    // the clubhouse sign and the secretary: just outside the club, on the side facing its green
    const cc = centroid(club.p); const gr = greens.sort((a, b) => d2(a, cc) - d2(b, cc))[0] || cc; const a = Math.atan2(gr.y - cc.y, gr.x - cc.x);
    let s = 0; while (s < 40 && inBuilding(cc.x + Math.cos(a) * s, cc.y + Math.sin(a) * s)) s += 0.5;
    const door = land('bowls_club', cc.x + Math.cos(a) * (s + 1.5), cc.y + Math.sin(a) * (s + 1.5), 12, 1.2, 3, 0);
    // stash 1: behind the club building, on the side away from the street
    const rd = nearestEdge(cc.x, cc.y, 150); let rx = cc.x, ry = cc.y - 1, bd = 1e9; if (rd) for (let i = 0; i + 1 < rd.e.p.length; i += 2) { const d = Math.hypot(rd.e.p[i] - cc.x, rd.e.p[i + 1] - cc.y); if (d < bd) { bd = d; rx = rd.e.p[i]; ry = rd.e.p[i + 1]; } } const b = Math.atan2(cc.y - ry, cc.x - rx); // away from the street
    let t = 0; while (t < 40 && inBuilding(cc.x + Math.cos(b) * t, cc.y + Math.sin(b) * t)) t += 0.5;
    land('stash', cc.x + Math.cos(b) * (t + 2), cc.y + Math.sin(b) * (t + 2), 25, 1, 2, 1, { ok: (x, y) => d2({ x, y }, door) > 10 }); // round the back, out of sight of the door
  }

  // ---------- the scrub jumps: room for the loop in the bush (the wood and scrub areas), reachable on foot ----------
  let dirt = 0;
  for (const ar of map.areas) {
    if (ar.k !== 'scrub' && ar.k !== 'wood') continue; const p = ar.p.map(v => v / 10); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); }
    for (let x = x0 + 20; x < x1 - 20; x += 16) for (let y = y0 + 20; y < y1 - 20; y += 16) {
      if (!inPoly(x, y, p) || slots.dirt_track.some(s => Math.hypot(s[0] / 10 - x, s[1] / 10 - y) < 120)) continue;
      const r = clearance('dirt_track', x, y, FOOT, 26, 30); if (r) { put('dirt_track', { x, y }, r, FOOT, -1); dirt++; }
    }
  }
  if (!dirt) fail('no room for the scrub jumps anywhere in the bush');

  // ---------- Granite Island: its middle, from the land you can walk to from the island cafe (not over the causeway) ----------
  const cafe = poi(/Granite Island/i);
  let sx = 0, sy = 0, n = 0; { const k0 = cellOf(cafe.x, cafe.y), seen = new Uint8Array(GW * GH), q = [k0]; seen[k0] = 1;
    for (let h = 0; h < q.length; h++) { const k = q[h], x = k % GW, y = (k / GW) | 0; sx += x; sy += y; n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nk = ny * GW + nx; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || seen[nk] || waterOk(nk) || pierWide[nk]) continue; if (Math.hypot((nx + 0.5) * CELL - cafe.x, (ny + 0.5) * CELL - cafe.y) > 900) continue; seen[nk] = 1; q.push(nk); } } }
  const isle = { x: (sx / n + 0.5) * CELL, y: (sy / n + 0.5) * CELL }; log(`Round B: Granite Island ${Math.round(n * CELL * CELL / 1e4) / 100} km², middle ${isle.x.toFixed(0)},${isle.y.toFixed(0)}`);
  if (n * CELL * CELL > 1.5e6) fail('Granite Island flood leaked over the causeway');

  // ---------- fireworks launch sites and the box under the causeway ----------
  land('launch_site', isle.x, isle.y, 250, 3, 6, 0);
  land('launch_site', poi(/Rosetta Head|The Bluff/i).x, poi(/Rosetta Head|The Bluff/i).y, 120, 3, 6, 1);
  // the jetty: the end of the screw-pile jetty off the island, the pier end furthest out to sea
  const jetties = (F.piers || []).filter(p => !p.area && p.p.length >= 6).map(p => ({ x: p.p[p.p.length - 2], y: p.p[p.p.length - 1] })).sort((A, B) => (seaD[cellOf(A.x, A.y)] ?? 0) - (seaD[cellOf(B.x, B.y)] ?? 0));
  const je = jetties[0]; if (!je) fail('no jetty in the features');
  land('launch_site', je.x, je.y, 25, 1, 2, 2);
  land('launch_site', poi(/Warland Reserve/i).x, poi(/Warland Reserve/i).y, 70, 4, 6, 3);
  // the box under the causeway: on the sand by its landward end (where the tram goes out to sea)
  const cw = (F.piers || []).filter(p => !p.area && /Granite Island/i.test(p.name)).map(p => [{ x: p.p[0], y: p.p[1] }, { x: p.p[p.p.length - 2], y: p.p[p.p.length - 1] }]).flat().sort((A, B) => (seaD[cellOf(B.x, B.y)] ?? 0) - (seaD[cellOf(A.x, A.y)] ?? 0))[0];
  if (!cw) fail('no causeway in the features'); land('stash', cw.x, cw.y, 60, 1, 2, 0, { ok: (x, y) => ground[cellOf(x, y)] === GC.SAND });

  // ---------- the water race: a start off the Victor Harbor ramp, gates round Granite Island, back under the causeway ----------
  const vh = ramps.find(r => r.extra >= 100) || ramps[0]; const warland = poi(/Warland Reserve/i);
  const st = search(vh.water.x, vh.water.y, 200, (x, y) => { const k = cellOf(x, y); return k >= 0 && C.waterNet[k] && !pierWide[k] && deepAt(x, y, 6) && d2({ x, y }, vh.water) >= 80 && d2({ x, y }, warland) >= 250 && !check('race_start', x, y, 10, BOAT); }, 2); // a short ride out, clear of the ramp and the Warland foreshore
  if (!st) fail('no room for the race start off the ramp'); put('race_start', st, 10, BOAT, 0);
  // gates ring the island about 45 m off its furthest rock (jetty and breakwater included), clockwise from the north
  const extent = deg => { const a = deg * Math.PI / 180; let last = 0; for (let r = 0; r < 900; r += 4) { if (!openSea(cellOf(isle.x + Math.cos(a) * r, isle.y + Math.sin(a) * r))) last = r; else if (r - last >= 40) break; } return last; };
  // (out past the furthest reach within 15 degrees either side, so the ring sweeps wide of jetties and coves)
  const reach = deg => Math.max(...[-15, -10, -5, 0, 5, 10, 15].map(k => extent(deg + k)));
  const ringPt = deg => { const a = deg * Math.PI / 180; let r = reach(deg) + 45; let p; for (let k = 0; k < 40; k++, r += 6) { p = { x: isle.x + Math.cos(a) * r, y: isle.y + Math.sin(a) * r }; if (deepAt(p.x, p.y, 8) && !pierWide[cellOf(p.x, p.y)] && !check('race_mark', p.x, p.y, 8, BOAT)) return p; } fail('no open water for a race gate at ' + deg + '°'); };
  // the causeway's bearing from the island: the ring starts just clockwise of it and ends just before it
  const cwa = Math.atan2(cw.y - isle.y, cw.x - isle.x) * 180 / Math.PI;
  // a dense ring first (every 5 degrees), each leg checked; then as few gates as keep every leg on the water, no more
  // than 260 m apart. Boats slip under the jetties, so a leg may pass beneath one; the last leg runs back to the
  // start under the causeway.
  const dense0 = []; for (let d = 15; d <= 345; d += 5) dense0.push(ringPt(cwa + d));
  // where two neighbouring ring points cut across a point of land (a jetty's root, a rocky tip), put a point between
  // them, pushed out from the island until both halves are on the water
  const markOk = (x, y) => deepAt(x, y, 8) && !pierWide[cellOf(x, y)] && !check('race_mark', x, y, 8, BOAT);
  const bridge = (a, b) => {
    if (legOk(a, b, true)) return [b];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const m = search(mid.x, mid.y, 160, (x, y) => markOk(x, y) && legOk(a, { x, y }, true) && legOk({ x, y }, b, true), 3);
    if (!m) fail(`the ring round Granite Island crosses land near ${mid.x.toFixed(0)},${mid.y.toFixed(0)}`);
    return [m, b];
  };
  const dense = [dense0[0]]; for (let i = 1; i < dense0.length; i++) dense.push(...bridge(dense[dense.length - 1], dense0[i]));
  const fixed = [st, ...bridge(st, dense[0])]; let i0 = 0;
  while (i0 < dense.length - 1) { let j = i0 + 1; while (j + 1 < dense.length && d2(dense[i0], dense[j + 1]) < 260 && legOk(dense[i0], dense[j + 1], true)) j++; fixed.push(dense[j]); i0 = j; }
  fixed.push(...bridge(fixed[fixed.length - 1], st));
  for (let i = 1; i < fixed.length; i++) if (!legOk(fixed[i - 1], fixed[i], true)) fail(`race leg ${i} crosses land`);
  const gates = fixed.slice(1, -1); gates.forEach((p, i) => put('race_mark', p, 8, BOAT, i, Math.atan2(p.y - fixed[i].y, p.x - fixed[i].x)));
  // ramp buoys on the three longest legs (not the last: it runs under the causeway)
  const legs = fixed.slice(1, -1).map((p, i) => ({ a: fixed[i], b: p, i, L: d2(fixed[i], p) })).sort((x, y) => y.L - x.L).slice(0, 3);
  for (const l of legs) { let ok = null; for (const f of [0.55, 0.5, 0.62, 0.45, 0.7]) { const p = { x: l.a.x + (l.b.x - l.a.x) * f, y: l.a.y + (l.b.y - l.a.y) * f }; if (!check('ramp_buoy', p.x, p.y, 4, BOAT) && !pierWide[cellOf(p.x, p.y)]) { ok = p; break; } } if (!ok) fail('no water for a ramp buoy on leg ' + l.i); put('ramp_buoy', ok, 4, BOAT, l.i, Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x)); }
  // free ramps: one well off the foreshore (the Warland Reserve beach stays clear for gigs), one off the jetty end
  const freeOk = (x, y) => { const k = cellOf(x, y); return k >= 0 && C.waterNet[k] && !pierWide[k] && deepAt(x, y, 10) && !check('ramp_buoy', x, y, 8, BOAT); };
  const f1 = search(st.x, st.y, 600, (x, y) => d2({ x, y }, warland) >= 300 && d2({ x, y }, st) >= 120 && freeOk(x, y), 4); if (!f1) fail('no water for the free ramp buoy');
  put('ramp_buoy', f1, 8, BOAT, -1, 0.3);
  const f2 = search(je.x, je.y, 140, (x, y) => d2({ x, y }, je) >= 50 && freeOk(x, y), 4); if (f2) put('ramp_buoy', f2, 8, BOAT, -2, -0.6);
  log(`Round B slots: ${ramps.length} ramps, ${moors.length} pier moorings, ${courts} courts, ${greens.length} greens, ${dirt} scrub-jump spots, ${gates.length} race gates`);
}
