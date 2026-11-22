#!/usr/bin/env node
// Schoolies Siege: water and sports features baker.
// Reads the same raw OpenStreetMap extract as build_map.mjs (game/data/raw/G-01-victor-harbor-all.osm, ODbL)
// and writes game/data/features.json: boat ramps, jetties and piers, the skate park, basketball courts and
// lawn-bowls greens, in the same local-metre projection as map.json. Kept separate from map.json so the big
// map file doesn't need re-baking. No dependencies. Run: node game/tools/build_features.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const RAW = path.join(GAME, 'data/raw/G-01-victor-harbor-all.osm');
const OUT = path.join(GAME, 'data/features.json');

// the same projection as build_map.mjs
const BBOX = { minLon: 138.57, maxLon: 138.66, minLat: -35.598, maxLat: -35.53 };
const LAT0 = (BBOX.minLat + BBOX.maxLat) / 2;
const MPX = 111320 * Math.cos(LAT0 * Math.PI / 180);
const MPY = 110574;
const proj = (lon, lat) => [(lon - BBOX.minLon) * MPX, (BBOX.maxLat - lat) * MPY];

const xml = fs.readFileSync(RAW, 'utf8');
const attrs = s => { const o = {}; for (const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) o[m[1]] = m[2]; return o; };
const tagsOf = body => { const t = {}; if (body) for (const m of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\s*\/>/g)) t[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"'); return t; };
const nodes = new Map();
for (const m of xml.matchAll(/<node\s([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) { const a = attrs(m[1]); const [x, y] = proj(+a.lon, +a.lat); nodes.set(a.id, { x, y, t: m[2] ? tagsOf(m[2]) : null }); }
const ways = [];
for (const m of xml.matchAll(/<way\s([^>]*?)>([\s\S]*?)<\/way>/g)) {
  const nd = [...m[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map(x => x[1]);
  ways.push({ id: attrs(m[1]).id, nd, t: tagsOf(m[2]) });
}
const r1 = v => Math.round(v * 10) / 10;
const pts = w => { const p = []; for (const id of w.nd) { const n = nodes.get(id); if (n) p.push(r1(n.x), r1(n.y)); } return p; };
const closed = w => w.nd.length > 3 && w.nd[0] === w.nd[w.nd.length - 1];
const centroid = p => { let x = 0, y = 0; const n = p.length / 2; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; } return [r1(x / n), r1(y / n)]; };

const out = { source: 'OpenStreetMap contributors (ODbL), ' + ((xml.match(/<meta osm_base="([^"]+)"/) || [])[1] || 'unknown'), slipways: [], ramps: [], piers: [], skate: [], courts: [], bowls: [], clubs: [] };
for (const [id, n] of nodes) {
  if (!n.t) continue;
  if (n.t.leisure === 'slipway') out.slipways.push({ x: r1(n.x), y: r1(n.y) });
  if (n.t.sport === 'basketball') out.courts.push({ x: r1(n.x), y: r1(n.y), hoops: +(n.t.hoops || 1) });
}
for (const w of ways) {
  const t = w.t; const p = pts(w); if (p.length < 4) continue;
  if (t.leisure === 'slipway') { const [x, y] = centroid(p); out.slipways.push({ x, y }); }
  if (/boat ramp/i.test(t.name || '') && t.highway) { const [x, y] = centroid(p); out.ramps.push({ x, y, name: t.name, p }); }
  // jetties and the causeway stand on piles, so a boat can slip underneath; breakwaters are solid and left out
  if (t.man_made === 'pier') out.piers.push({ p, w: +(t.width || 4), area: closed(w) || t.area === 'yes', name: t.name || '' });
  if (t.sport === 'skateboard') out.skate.push({ p });
  if (t.sport === 'basketball') out.courts.push({ p, hoops: +(t.hoops || 1) });
  if (t.sport === 'bowls') out.bowls.push({ p, name: t.name || '' });
  if (/bowls club/i.test(t.name || '') && t.building) out.clubs.push({ p, name: '' }); // (the game's club is invented: the real name isn't kept)
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, Object.entries(out).filter(([k]) => k !== 'source').map(([k, v]) => k + ' ' + v.length).join(', '));
