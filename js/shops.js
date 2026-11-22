// Shops you can walk into (the roof fades away to show the inside, and the shop assistant has a word), the clothes
// that go with them, and the respray shops that give your car a new colour. Positions come from shops and buildings
// in the OpenStreetMap extract; every name here is invented. The extract has no car-repair tags, so the respray
// shops sit on light-industrial and retail buildings near the main roads.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, SP = VH.Sprites, FX = VH.FX;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const G = () => VH.Game; const I = () => VH.Input;
  const SH = VH.Shops = { list: [], resprays: [], chat: null };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // shirts, hats and sunnies for sale (cosmetic; changing out of sight also shakes your description)
  SH.SHIRTS = ['#ff4fa0', '#38e0c8', '#ffd23a', '#7c5cff', '#ff7a2f', '#9be15d', '#ffffff', '#4a6fa5', '#a54a4a', '#2a2a30', '#e3d3a8'];
  SH.HATS = ['', 'cap', 'bucket', 'beanie', 'party', 'sunhat'];
  const outfits = {};
  SH.outfit = c => (c in outfits ? outfits[c] : (outfits[c] = U.store.get('outfit:' + c, null)));
  SH.look = c => { const base = G().CHARS[c] || G().CHARS.roam; const o = SH.outfit(c) || {}; return { shirt: o.shirt || base.shirt, hair: base.hair, hat: o.hat != null ? o.hat : base.hat, sunnies: !!o.sunnies }; };
  function setOutfit(change) {
    const g = G(), c = g.char; const o = { ...(SH.outfit(c) || {}), ...change }; outfits[c] = o; U.store.set('outfit:' + c, o);
    // a change of clothes out of sight: the police and the community page are looking for someone else
    const P = VH.Police, SL = VH.Street;
    if (P.units.length && P.seenT > 1.5) { P.desc = null; P.seenT = Math.max(P.seenT, 10); g.meter = Math.max(0, g.meter - 1); g.toast("NEW LOOK. THEY'RE LOOKING FOR SOMEONE ELSE NOW", '#9be15d'); }
    if (SL.notoriety > 0) { SL.notoriety--; g.toast('HARDER TO RECOGNISE FROM THE DOORBELL CLIPS', '#9be15d'); }
    sfx('pickup');
  }

  // ---------- the shops ----------
  const SHOPS = [
    { id: 'fish', at: [4821, 2761], name: 'GULLS NIL FISH & CHIPS', floor: '#d8e4e8', who: { shirt: '#ffffff', hair: '#7a3a1a', hat: 'cap' },
      hello: () => "WHAT'LL IT BE, LOVE?", opts: [
        { txt: 'CHIPS, PLEASE', cost: 5, act: g => { g.player.chips = (g.player.chips || 0) + 6; return 'SALT AND VINEGAR. MIND THE GULLS. THEY\'VE BEEN WORKING OUT.'; } },
        { txt: "WHAT'S GOOD TODAY?", act: () => U.pick(["THE FISH. IT'S A FISH SHOP.", 'THE CHIPS ARE CRISPY AND THE GULLS ARE HUNGRY.', 'MY FEET. SITTING DOWN.']) },
        { txt: 'ANY GOSSIP?', act: () => gossip() }] },
    { id: 'bakery', at: [4803, 2801], name: 'CRUMBS BAKERY', floor: '#e8d8b8', who: { shirt: '#f4eadf', hair: '#d9b45a', hat: '' },
      hello: () => 'LAST FINGER BUN OF THE DAY. YOU LOOK LIKE A FINGER BUN PERSON.', opts: [
        { txt: 'FINGER BUN', cost: 3, act: g => { g.player.boostT = 30; return 'SUGAR RUSH! YOU\'LL BE QUICK ON YOUR FEET FOR A BIT.'; } },
        { txt: 'A PIE', cost: 4, act: () => 'CAREFUL, IT\'S THE TEMPERATURE OF THE SUN.' },
        { txt: 'ANY GOSSIP?', act: () => gossip() }] },
    { id: 'servo', at: [4602, 2640], name: 'SERVO 24', floor: '#d4d4d0', who: { shirt: '#3d7a3a', hair: '#2a1a10', hat: 'cap' },
      hello: () => 'PUMP NUMBER? OH, YOU WALKED. RIGHT.', opts: [
        { txt: 'SUNSCREEN (SLIPPERY)', cost: 6, act: g => { g.sunscreen = true; return 'SPF FIFTY. HANDY IF SOMEONE GRABS YOU. NOT THAT ANYONE WOULD.'; } },
        { txt: 'A SLUSHIE', cost: 3, act: g => { g.player.boostT = 20; return 'BRAIN FREEZE IN THREE, TWO...'; } },
        { txt: 'ANY GOSSIP?', act: () => gossip() }] },
    { id: 'mobility', at: [4234, 2975], name: 'SCOOT & SONS MOBILITY', floor: '#c8d4c0', who: { shirt: '#c9b48a', hair: '#e8e8e8', hat: 'bucket' },
      hello: () => G().char === 'grump' ? 'MERV! WHAT HAVE YOU DONE TO THAT POOR GOPHER?' : "LOOKING FOR SOMETHING WITH A BIT MORE GO?", opts: [
        { txt: 'DOUBLE BATTERY', cost: 40, act: g => { g.upgrades.doubleBattery = true; SH.applyGopher(); return 'TWICE THE JUICE. BOOSTS LAST LONGER AND SHE GOES FASTER. DON\'T TELL THE COUNCIL.'; } },
        { txt: 'RACING STRIPE', cost: 25, act: g => { g.upgrades.stripe = true; SH.applyGopher(); return 'EVERYONE KNOWS A STRIPE MAKES IT QUICKER. EVERYONE.'; } },
        { txt: 'WHERE DO I GET BATTERIES?', act: () => 'SPARE BATTERIES TURN UP ON THE FOOTPATHS, AND THE COUNCIL PUT BOOST PADS ON THE FORESHORE PATH. DON\'T ASK.' }] },
    { id: 'clothes', at: [4779, 2753], name: 'SURF & TURF THREADS', floor: '#e0d0e8', who: { shirt: '#ff4fa0', hair: '#111', hat: '' }, clothes: true,
      hello: () => 'NEW LOOK? NOBODY WILL RECOGNISE YOU. PROBABLY.', opts: [
        { txt: 'NEW SHIRT', cost: 20, act: g => { const o = SH.look(g.char); const i = SH.SHIRTS.indexOf(o.shirt); setOutfit({ shirt: SH.SHIRTS[(i + 1) % SH.SHIRTS.length] }); return 'SUITS YOU. EVERYTHING SUITS YOU. I\'M ON COMMISSION.'; } },
        { txt: 'A HAT', cost: 12, act: g => { const o = SH.look(g.char); const i = SH.HATS.indexOf(o.hat); setOutfit({ hat: SH.HATS[(i + 1) % SH.HATS.length] }); return 'VERY SCHOOLIES. VERY NOW.'; } },
        { txt: 'SUNNIES', cost: 15, act: g => { const o = SH.look(g.char); setOutfit({ sunnies: !o.sunnies }); return o.sunnies ? 'BACK TO THE NAKED EYE.' : 'COOL. AND AT NIGHT, TOO. BOLD.'; } }] },
    { id: 'op', at: [4802, 2536], name: 'SECOND CHANCE OP SHOP', floor: '#e8e0c8', who: { shirt: '#b07aa8', hair: '#f4f4f4', hat: '' }, clothes: true,
      hello: () => "EVERYTHING'S A DOLLAR. EXCEPT THE THINGS THAT AREN'T.", opts: [
        { txt: 'MYSTERY BAG', cost: 5, act: () => { setOutfit({ shirt: U.pick(SH.SHIRTS), hat: U.pick(SH.HATS) }); return U.pick(['THAT WAS MY HUSBAND\'S. HE\'D LOVE THAT YOU HAVE IT.', 'A BIT OF LAVENDER NEVER HURT ANYONE.', 'VINTAGE. THAT MEANS OLD.']); } },
        { txt: "DAD'S OLD SUNNIES", cost: 4, act: g => { setOutfit({ sunnies: true }); return 'VERY 1991. VERY NOW AGAIN.'; } },
        { txt: 'ANY GOSSIP?', act: () => gossip() }] },
  ];
  function gossip() {
    const g = G(), SL = VH.Street;
    if (SL.notoriety >= 3) return "THERE'S A KID ALL OVER THE COMMUNITY PAGE. LOOKS A BIT LIKE YOU, ACTUALLY.";
    if (g.meter >= 3) return 'THE POLICE ARE OUT IN FORCE TONIGHT. SOMEONE\'S BEEN A RIGHT DRONGO.';
    return U.pick(['THEY SAY THE BIG HOUSE ON THE HILL HAS A NEW SEARCHLIGHT.', 'SOMEONE SAW A PENGUIN THE SIZE OF A FRIDGE ON THE ISLAND.', 'BEV REPORTED HER HYDRANGEAS TO THE POLICE AGAIN.', 'MERV\'S BEEN IN HERE ASKING ABOUT EARPLUGS.', 'THE PANEL BEATERS WILL RESPRAY ANYTHING. NO QUESTIONS.']);
  }
  // Respray shops and tyre places are the real garages in js/garages.js (VH.GARAGES), with invented names.
  const RESPRAYS = VH.GARAGES || [];
  SH.RESPRAYS = RESPRAYS;

  // ---------- setup: find each shop's building, its door on the street side, and lay out the inside ----------
  function buildingAt(x, y) {
    let best = null, bd = 1e9; W.buildingGrid.query(x - 30, y - 30, x + 30, y + 30, b => { const inside = U.pointInPoly(x, y, b.p); const d = inside ? -1 : Math.hypot(b.cx - x, b.cy - y); if (d < bd) { bd = d; best = b; } });
    return best;
  }
  function doorOf(b) {
    const n = W.nearestEdge(b.cx, b.cy, 120); const rx = n ? n.x : b.cx, ry = n ? n.y + 10 : b.cy + 10;
    let best = null, bd = 1e9; const p = b.p;
    for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; const [d, qx, qy, t] = U.segPointDist(rx, ry, p[i], p[i + 1], p[j], p[j + 1]); const L = Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]); if (L > 2.5 && d < bd) { bd = d; best = { x: qx, y: qy }; } }
    best = best || { x: b.cx, y: b.bb[3] };
    const ix = b.cx - best.x, iy = b.cy - best.y, il = Math.hypot(ix, iy) || 1; best.nx = ix / il; best.ny = iy / il;
    return best;
  }
  SH.init = function () {
    for (const s of SHOPS) {
      const b = buildingAt(s.at[0], s.at[1]); if (!b) continue; const door = doorOf(b);
      let depth = 2; for (let t = 1; t < 40; t += 0.5) { if (U.pointInPoly(door.x + door.nx * t, door.y + door.ny * t, b.p)) depth = t; else if (t > 3) break; }
      // a shopfront: counter a few metres in from the door, the assistant behind it, shelves at the back
      const at = d => ({ x: door.x + door.nx * d, y: door.y + door.ny * d });
      const cd = Math.min(depth * 0.55, 4.5); const c = at(cd), a = at(cd + 1.4), sh = at(Math.min(depth * 0.9, cd + 4.5)); const px = -door.ny, py = door.nx;
      SH.list.push({ ...s, b, door, depth, counter: c, clerk: a, shelf: sh, px, py, reveal: 0, ped: null });
    }
    const P = G().places;
    // the front desks where Kev books prisoners in: the lock-up and the police station. Walk in like a shop: the roof
    // lifts to show the desk, the duty officer behind it, and a cell at the back.
    const desks = [{ id: 'desk-lockup', desk: 'lockup', b: VH.Lockup.b, name: (VH.Lockup.NAME || 'THE LOCK-UP') + ': FRONT DESK', who: { shirt: '#5a7ab8', hair: '#1a2236', hat: 'cop' }, officer: 'THE DUTY SERGEANT' },
      { id: 'desk-station', desk: 'station', b: P.police ? buildingAt(P.police.x, P.police.y) : null, name: 'POLICE STATION: FRONT DESK', who: { shirt: '#7fa6d8', hair: '#5a3a1a', hat: 'cop' }, officer: 'THE DESK CONSTABLE' }];
    for (const d of desks) {
      const b = d.b; if (!b) continue; const door = doorOf(b);
      let depth = 2; for (let t = 1; t < 40; t += 0.5) { if (U.pointInPoly(door.x + door.nx * t, door.y + door.ny * t, b.p)) depth = t; else if (t > 3) break; }
      const at = q => ({ x: door.x + door.nx * q, y: door.y + door.ny * q }); const cd = Math.min(depth * 0.5, 4); const px = -door.ny, py = door.nx;
      SH.list.push({ ...d, b, door, depth, counter: at(cd), clerk: at(cd + 1.4), shelf: at(Math.min(depth * 0.9, cd + 5)), px, py, reveal: 0, ped: null, floor: '#c8c4b8',
        hello: () => VH.Escort.leading ? "WHO'VE WE GOT HERE, KEV?" : G().char === 'cop' ? U.pick(['EVENING, KEV. NOTHING TO BOOK IN?', "QUIET ONE SO FAR. DON'T JINX IT."]) : U.pick(['CAN I HELP YOU?', "YOU'RE NOT HERE TO CONFESS, ARE YOU?"]),
        opts: [{ txt: 'ANY NEWS?', act: () => U.pick(["SOMEONE'S BEEN RINGING DOORBELLS. AGAIN.", 'THE SARGE WANTS HIS STAPLER BACK.', 'NOTHING. LOVELY.']) }] });
    }
    for (const r of RESPRAYS) {
      if (!r.at || !(r.does || []).some(d => d === 'respray' || d === 'tyres')) continue;
      let b = buildingAt(r.at[0], r.at[1]); if (b && Math.hypot(b.cx - r.at[0], b.cy - r.at[1]) > 60) b = null;
      let door, n;
      if (b) { door = doorOf(b); n = W.nearestEdge(door.x - door.nx * 4, door.y - door.ny * 4, 40); }
      else { // no footprint in the map data (a car yard, say): the lot at the address, facing its road
        n = W.nearestEdge(r.at[0], r.at[1], 40); if (n) { const dx = r.at[0] - n.x, dy = r.at[1] - n.y, L = Math.hypot(dx, dy) || 1; door = { x: n.x + dx / L * 3, y: n.y + dy / L * 3, nx: dx / L, ny: dy / L }; }
      }
      if (!n || n.d > 30) continue; // must have road access
      // where you pull up: the baked kerb slot nearest the garage's frontage (never a guessed point)
      const k = VH.Spawn.pick('kerb', { near: door || { x: r.at[0], y: r.at[1] }, maxDist: 80, access: 'car', nearest: true }); if (!k) continue;
      const tyres = !r.does.includes('respray');
      SH.resprays.push({ ...r, b, door, x: k.x, y: k.y, service: tyres ? 'tyres' : 'respray', cost: tyres ? 10 : 25, label: r.name + (tyres ? ': TYRES $10' : ': RESPRAY $25') });
    }
  };
  SH.nearestRespray = (x, y) => SH.resprays.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  SH.applyGopher = function () {
    const g = G(), up = g.upgrades || {};
    for (const v of g.vehicles) if (v.def.gopher && (v.owned || v.driver === 'player')) { v.def.maxV = (up.turbo ? 9 : 6.5) + (up.doubleBattery ? 1.5 : 0); v.def.accel = 5 * (up.stripe ? 1.3 : 1); v.stripe = !!up.stripe; }
  };

  // ---------- walking in and out ----------
  SH.inside = () => G().player.inShop || null;
  SH.resetNight = function () { for (const s of SH.list) { s.ped = null; s.lastIn = null; s.reveal = 0; } if (G().player) G().player.inShop = null; };
  SH.update = function (dt) {
    const g = G(), pl = g.player;
    for (const s of SH.list) s.reveal = U.clamp(s.reveal + (pl.inShop === s ? dt * 3 : -dt * 3), 0, 1);
    if (pl.inShop && !pl.onFoot) SH.leave();
    if (pl.inShop) {
      const s = pl.inShop;
      if (!s.ped || !g.peds.includes(s.ped)) { s.ped = new VH.Ped('local', s.clerk.x, s.clerk.y, { shirt: s.who.shirt, hair: s.who.hair, hat: s.who.hat, tag: 'clerk', state: 'idle' }); s.ped.ang = Math.atan2(-s.door.ny, -s.door.nx); g.peds.push(s.ped); }
      // stay inside the walls; walking back out through the door leaves
      if (!U.pointInPoly(pl.x, pl.y, s.b.p)) { if (dist(pl, s.door) < 2.2 || !s.lastIn) SH.leave(); else { pl.x = s.lastIn.x; pl.y = s.lastIn.y; pl.vx = pl.vy = 0; } }
      else s.lastIn = { x: pl.x, y: pl.y };
      return;
    }
    if (!pl.onFoot || pl.hidden) return;
    for (const s of SH.list) {
      if (Math.abs(s.door.x - pl.x) > 4 || Math.abs(s.door.y - pl.y) > 4) continue;
      const d = dist(s.door, pl); const push = pl.vx * s.door.nx + pl.vy * s.door.ny > 1;
      if (d < 1.8 && push) SH.enter(s);
    }
  };
  SH.enter = function (s) {
    const g = G(), pl = g.player; pl.inShop = s; pl.x = s.door.x + s.door.nx * 1.4; pl.y = s.door.y + s.door.ny * 1.4; s.lastIn = { x: pl.x, y: pl.y };
    const q = VH.Escort.leading; if (q) { let at = null; for (const o of [0.9, -0.9, 0]) { const x = s.door.x + s.door.nx * 2.2 + s.px * o, y = s.door.y + s.door.ny * 2.2 + s.py * o; if (U.pointInPoly(x, y, s.b.p)) { at = { x, y }; break; } } q.x = (at || pl).x; q.y = (at || pl).y; } // your prisoner comes in with you
    sfx('doorbell', { vol: 0.4, pitch: 1.5 }); g.callout(s.name, '#38e0c8');
  };
  SH.leave = function () { const g = G(), pl = g.player, s = pl.inShop; if (!s) return; pl.inShop = null; if (pl.onFoot) { pl.x = s.door.x - s.door.nx * 1.2; pl.y = s.door.y - s.door.ny * 1.2; } const q = VH.Escort.leading; if (q) { const o = VH.Nav.snap(pl.x + s.px * 0.9, pl.y + s.py * 0.9, 4) || VH.Nav.snap(pl.x, pl.y, 6) || pl; q.x = o.x; q.y = o.y; } if (s.ped) { g.peds = g.peds.filter(p => p !== s.ped); s.ped = null; } sfx('door'); };
  // E at the counter: have a chat
  SH.tryChat = function () {
    const g = G(), pl = g.player, s = pl.inShop; if (!s || dist(pl, s.clerk) > 3.6 || (s.desk && VH.Escort.leading)) return false;
    SH.chat = { s, line: s.hello(), sel: 0, reply: null }; g.state = 'chat'; g.stateT = 0; sfx('click'); return true;
  };
  SH.prompt = function () { const g = G(), pl = g.player, s = pl.inShop; if (s && dist(pl, s.clerk) < 3.6) return (I().touchMode ? 'ACT' : 'E') + (s.desk ? ' · TALK TO THE DESK' : ' · CHAT TO THE SHOP ASSISTANT'); if (s) return 'WALK OUT THE DOOR TO LEAVE'; return ''; };

  // ---------- the chat box ----------
  SH.drawChat = function (ctx, ts) {
    const g = G(), c = SH.chat; if (!c) { g.state = 'play'; return; }
    const w = ctx.canvas.width, h = ctx.canvas.height, In = I(); const s = c.s;
    const pw = Math.min(w - 16 * ts, 260 * ts); const n = Math.floor((pw - 20 * ts) / (6 * ts));
    const opts = c.reply ? [{ txt: 'BYE' }] : [...(c.opts || s.opts).map(o => ({ ...o, label: o.txt + (o.cost ? ` ($${o.cost})` : '') })), { txt: 'BYE', label: 'BYE' }];
    const lines = U.wrap('"' + (c.reply || c.line) + '"', n);
    const ph = (28 + lines.length * 10 + opts.length * 12 + 10) * ts; const x = Math.round(w / 2 - pw / 2), y = Math.round(h - ph - 30 * ts);
    VH.UI.panel(ctx, x, y, pw, ph, { accent: '#38e0c8', fill: '#120c24' });
    U.text(ctx, s.name, x + 8 * ts, y + 6 * ts, { color: '#38e0c8', scale: ts });
    lines.forEach((l, i) => U.text(ctx, l, x + 8 * ts, y + 20 * ts + i * 10 * ts, { color: '#f4f0ff', scale: ts }));
    const oy = y + (26 + lines.length * 10) * ts; const rects = [];
    opts.forEach((o, i) => { const yy = oy + i * 12 * ts; const sel = i === c.sel; if (sel) { ctx.fillStyle = 'rgba(255,79,160,0.25)'; ctx.fillRect(x + 4 * ts, yy - 2 * ts, pw - 8 * ts, 11 * ts); } U.text(ctx, (sel ? '> ' : '  ') + (o.label || o.txt), x + 8 * ts, yy, { color: sel ? '#ffd23a' : '#f4f0ff', scale: ts }); rects.push({ x: x + 4 * ts, y: yy - 2 * ts, w: pw - 8 * ts, h: 11 * ts }); });
    if (In.consume('up')) c.sel = (c.sel + opts.length - 1) % opts.length; if (In.consume('down')) c.sel = (c.sel + 1) % opts.length;
    const t = In.tap(); let pick = -1; if (t) pick = rects.findIndex(r => t.x >= r.x && t.y >= r.y && t.x <= r.x + r.w && t.y <= r.y + r.h);
    if (pick >= 0) c.sel = pick;
    if ((g.stateT || 0) > 0.3 && (pick >= 0 || In.consume('confirm') || In.consume('enter') || In.consume('action'))) {
      const o = opts[c.sel];
      if (o.txt === 'BYE' || !o.act) { SH.chat = null; g.state = 'play'; sfx('click'); return; }
      if (o.cost && g.cash < o.cost) { c.reply = "THAT'S $" + o.cost + '. COME BACK WHEN YOU\'RE FLUSH.'; c.sel = 0; sfx('fail'); return; }
      if (o.cost) { g.cash -= o.cost; sfx('cash'); }
      c.reply = o.act(g); c.sel = 0;
    }
    if (In.consume('pause') || In.consume('back')) { SH.chat = null; g.state = 'play'; }
  };

  // ---------- drawing: signs and doors outside, the inside when you're in ----------
  function poly(ctx, p, left, top, S, dy) { ctx.beginPath(); for (let i = 0; i < p.length; i += 2) { const x = (p[i] - left) * S, y = (p[i + 1] - top + dy) * S; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); }
  SH.draw = function (ctx, left, top, S) {
    const vw = ctx.canvas.width / S, vh = ctx.canvas.height / S; const inView = (q, m = 30) => q.x > left - m && q.y > top - m && q.x < left + vw + m && q.y < top + vh + m;
    const t = G().t;
    for (const s of SH.list) {
      if (!inView(s.door)) continue;
      if (s.reveal > 0) {
        // the roof fades away: back wall, floor, counter, shelves
        const b = s.b, off = Math.max(0.75, b.h * 0.3); ctx.save(); ctx.globalAlpha = s.reveal;
        for (let k = 0; k <= off * S; k++) { ctx.fillStyle = U.shade('#6a5a70', 0.7 + 0.3 * k / (off * S)); poly(ctx, b.p, left, top, S, -k / S); ctx.fill(); }
        ctx.fillStyle = s.floor; poly(ctx, b.p, left, top, S, 0); ctx.fill();
        ctx.save(); poly(ctx, b.p, left, top, S, 0); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = -40; i < 40; i++) { const x0 = (b.cx + i * 1.5 - left) * S; ctx.fillRect(Math.round(x0), (b.bb[1] - top) * S, 1, (b.bb[3] - b.bb[1]) * S); } ctx.restore();
        ctx.strokeStyle = '#3a2f4a'; ctx.lineWidth = 2; poly(ctx, b.p, left, top, S, 0); ctx.stroke();
        const bar = (c, len, wid, col) => { ctx.save(); ctx.translate((c.x - left) * S, (c.y - top) * S); ctx.rotate(Math.atan2(s.py, s.px)); ctx.fillStyle = 'rgba(20,20,45,0.3)'; ctx.fillRect(-len * S / 2 + 2, -wid * S / 2 + 2, len * S, wid * S); ctx.fillStyle = col; ctx.fillRect(-len * S / 2, -wid * S / 2, len * S, wid * S); ctx.fillStyle = U.shade(col, 1.25); ctx.fillRect(-len * S / 2, -wid * S / 2, len * S, 1); ctx.restore(); };
        bar(s.counter, Math.min(6, s.depth * 0.9), 0.9, '#8a5a3a');
        if (s.desk) { // a cell at the back: bars across the end of the room
          bar(s.shelf, Math.min(6, s.depth), 0.3, '#2a2a34'); for (let i = -3; i <= 3; i++) { const gx = s.shelf.x + s.px * i * 0.8 - s.door.nx * 0.6, gy = s.shelf.y + s.py * i * 0.8 - s.door.ny * 0.6; ctx.fillStyle = '#9aa0b0'; ctx.fillRect(Math.round((gx - left) * S) - 1, Math.round((gy - top) * S) - 1, 2, 2); }
          ctx.fillStyle = '#e8e2c8'; ctx.fillRect(Math.round((s.counter.x - left) * S) - 2, Math.round((s.counter.y - top) * S) - 2, 4, 3); // the day book
        }
        else bar(s.shelf, Math.min(7, s.depth), 0.7, '#5a6a7a');
        // goods on the shelf and the counter
        if (!s.desk) for (let i = -3; i <= 3; i++) { const gx = s.shelf.x + s.px * i * 0.8, gy = s.shelf.y + s.py * i * 0.8; ctx.fillStyle = ['#ff4fa0', '#ffd23a', '#38e0c8', '#9be15d', '#fff'][(i + 5) % 5]; ctx.fillRect(Math.round((gx - left) * S) - 1, Math.round((gy - top) * S) - 1, 3, 3); }
        ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round((s.counter.x + s.px * 1.5 - left) * S) - 2, Math.round((s.counter.y + s.py * 1.5 - top) * S) - 2, 4, 3); // the till
        ctx.restore();
      }
      // the door and the shop sign
      const dx = Math.round((s.door.x - left) * S), dy = Math.round((s.door.y - top) * S);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(dx - 4, dy - 2, 8, 4); ctx.fillStyle = '#7a5434'; ctx.fillRect(dx - 3, dy - 1, 6, 2);
    }
    // respray shops: a roller door striped with paint and a sign
    for (const r of SH.resprays) {
      if (!inView(r.door)) continue; const dx = (r.door.x - left) * S, dy = (r.door.y - top) * S; const ang = Math.atan2(r.door.ny, r.door.nx) + Math.PI / 2;
      ctx.save(); ctx.translate(Math.round(dx), Math.round(dy)); ctx.rotate(ang); ctx.fillStyle = '#c9ccd8'; ctx.fillRect(-4 * S / 2, -3, 4 * S, 6); ctx.fillStyle = '#8a8e9a'; for (let i = -2; i <= 2; i++) ctx.fillRect(-4 * S / 2, i * 1.2, 4 * S, 1);
      ['#ff4fa0', '#38e0c8', '#ffd23a'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-6 + i * 4, -3 + ((t * 2 + i) | 0) % 3, 3, 2); }); ctx.restore();
    }
  };
  // markers over the lighting, unlit and full colour so they read at any time of night: the respray can (bobbing, with
  // its name, and "RESPRAY · $25" as you come up to it) and the shop names
  SH.drawMarkers = function (ctx, left, top, S) {
    const vw = ctx.canvas.width / S, vh = ctx.canvas.height / S; const inView = (q, m = 30) => q.x > left - m && q.y > top - m && q.x < left + vw + m && q.y < top + vh + m;
    const g = G(), t = g.t, pl = g.player;
    for (const s of SH.list) { if (!inView(s.door) || pl.inShop) continue; const dx = Math.round((s.door.x - left) * S), dy = Math.round((s.door.y - top) * S); if (Math.hypot(s.door.x - pl.x, s.door.y - pl.y) < 60) U.text(ctx, s.name, dx, dy + 6, { align: 'center', color: '#38e0c8' }); }
    for (const r of SH.resprays) {
      if (!inView(r)) continue; const sx = Math.round((r.x - left) * S), sy = Math.round((r.y - top) * S); const bob = Math.round(Math.sin(t * 2.5 + r.x) * 2);
      ctx.strokeStyle = 'rgba(155,225,93,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, 7 * S, 5 * S, 0, 0, U.TAU); ctx.stroke();
      if (r.service === 'tyres') SH.drawTyre(ctx, sx, sy - 18 + bob, 2); else SH.drawCan(ctx, sx, sy - 18 + bob, 2);
      U.text(ctx, r.name, sx, sy - 44 + bob, { align: 'center', color: '#9be15d' });
      if (Math.hypot(r.x - pl.x, r.y - pl.y) < 45) U.text(ctx, (r.service === 'tyres' ? 'TYRES · $' : 'RESPRAY · $') + r.cost, sx, sy - 54 + bob, { align: 'center', color: '#ffffff' });
    }
  };
  // the spray-can icon used on the minimap, the full map and over the shops
  // a tyre: a dark ring with tread notches and a silver hub
  SH.drawTyre = function (ctx, x, y, k = 1) {
    const r = (px, py, pw, ph, col) => { ctx.fillStyle = col; ctx.fillRect(x + px * k, y + py * k, pw * k, ph * k); };
    r(-4, -3, 8, 7, '#120c24'); r(-3, -4, 6, 9, '#120c24'); r(-3, -2, 6, 5, '#3a3a44'); r(-2, -3, 4, 7, '#3a3a44'); r(-1, -1, 2, 2, '#c9ccd8'); r(-3, -2, 1, 1, '#6a6a78'); r(2, 2, 1, 1, '#6a6a78');
  };
  SH.drawCan = function (ctx, x, y, k = 1) {
    // a spray can at any size: dark outline, a bright teal can with a white label band, a grey cap, the nozzle off to
    // one side and a puff of paint coming out of it
    const r = (px, py, pw, ph, col) => { ctx.fillStyle = col; ctx.fillRect(x + px * k, y + py * k, pw * k, ph * k); };
    r(-3, -4, 7, 11, '#120c24'); r(-2, -6, 5, 3, '#120c24'); r(1, -8, 3, 3, '#120c24');
    r(-2, -3, 5, 9, '#38e0c8'); r(-2, -3, 1, 9, '#9ff6e8'); r(2, -3, 1, 9, '#1f9c8a');
    r(-2, 0, 5, 3, '#ffffff'); r(-2, 1, 5, 1, '#ff4fa0');
    r(-1, -5, 3, 2, '#c9ccd8'); r(2, -7, 1, 1, '#ffffff');
    r(4, -8, 1, 1, '#ff4fa0'); r(5, -9, 1, 1, '#ffd23a'); r(5, -7, 1, 1, '#38e0c8');
  };
  SH.markers = () => SH.resprays.map(r => ({ x: r.x, y: r.y, can: true }));
})(window.VH);
