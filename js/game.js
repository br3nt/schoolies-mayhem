// Game state, player, spawning, the gossip meter, busts and the lock-up flow, and world rendering.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, R = VH.MapRender, SP = VH.Sprites, FX = VH.FX, I = VH.Input, L = VH.Light, PK = SP.PK;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const Game = VH.Game = {
    state: 'loading', char: null, night: 1, hour: 19.5, clockRate: 1 / 60, cash: 0, meter: 0, quietT: 0, t: 0,
    vehicles: [], peds: [], gulls: [], whales: [], cop: null, watch: [], player: null, cam: { x: 4850, y: 2880 },
    stats: { smashed: 0, dives: 0, stolen: 0, tracks: 0, busted: 0, distance: 0, gulls: 0 }, msgs: [], timeOverride: null, partyOn: true, specials: {},
  };
  Game.CHARS = {
    schoolie: { name: 'JAZ', title: 'THE SCHOOLIE', blurb: 'Year 12 is done. Victor Harbor is yours. Ding-dong-ditch the town, borrow the tram, ride the steam train and become a Schoolies legend.', shirt: '#38e0c8', hair: '#d9b45a', hat: 'party', meter: 'GOSSIP' },
    grump: { name: 'MERV', title: 'THE GOPHER GRUMP', blurb: "81 years young, one mobility scooter, zero patience. The doof-doof at Warland Reserve has kept him up three nights running. It ends now.", shirt: '#c9b48a', hair: '#e8e8e8', hat: 'bucket', meter: 'GOSSIP' },
    cop: { name: 'CONSTABLE KEV', title: 'THE CONSTABLE', blurb: "Senior constable at the little Victor Harbor station: two junior constables, a sergeant on the radio, Schoolies on one side and gophers on the main road on the other.", shirt: '#7fa6d8', hair: '#1a2236', hat: 'cop', meter: 'COMPLAINTS' },
    roam: { name: 'YOU', title: 'FREE ROAM', blurb: 'No jobs, no plot. Just you, Victor Harbor and the whole night. T changes the time of day.', shirt: '#ff7a2f', hair: '#2a1a10', hat: '', meter: 'GOSSIP' },
  };
  Game.ENTER_R = 3.2; // how close you need to be to get in
  Game.JOG = 9.5; Game.SPRINT = 14; // on-foot speeds in m/s
  Game.RUN_AT = 0.7; // touch: the stick runs past this share of its radius
  Game.METER_LABELS = ['NOBODY SAW A THING', 'CURTAINS TWITCHING', 'PHONE TREE ACTIVATED', "IT'S ON THE COMMUNITY PAGE", 'NEIGHBOURHOOD WATCH MOBILISED', 'THE WHOLE TOWN KNOWS'];
  Game.COP_LABELS = ['ALL QUIET', 'A FEW GRUMBLES', 'TALKBACK RADIO CALLS', 'LETTERS TO THE EDITOR', 'COUNCIL IS ASKING QUESTIONS', "SERGEANT'S ON THE PHONE"];

  // ---------- places (real landmarks; coordinates come from the OSM data) ----------
  Game.places = {};
  Game.initPlaces = function () {
    const poi = (re, fx, fy) => { const p = W.poi(re); return p ? { x: p.x, y: p.y } : { x: fx, y: fy }; };
    const P = Game.places;
    P.warland = poi(/^Warland Reserve$/, 4872, 2907);
    P.fishShop = poi(/Original Fish Shop/, 4821, 2761);
    P.station = poi(/^Victor Harbour$/, 4897, 2707);
    P.police = poi(/Police Station/, 3281, 2945);
    P.bluff = { x: 3016, y: 6790 };
    P.bluffTop = { x: 3060, y: 6720 };
    P.whaleCentre = poi(/Whale Centre/, 4909, 2847);
    P.causewayCafe = poi(/Causeway Caf/, 4962, 2998);
    P.granite = { x: 5842, y: 3743 };
    P.golf = { x: 3150, y: 1950 };
    P.cemetery = { x: 3100, y: 1350 };
    P.industrial = { x: 2700, y: 3150 };
    P.oval = poi(/^Victor Harbor Oval$/, 3936, 2899);
    P.ebOval = { x: 2822, y: 2614 };
    P.grumpHome = { x: 4520, y: 2450 };
    P.grosvenor = poi(/Grosvenor Gardens/, 4651, 2635);
    for (const k of ['golf', 'cemetery', 'industrial', 'grumpHome', 'ebOval']) { const n = W.nearestEdge(P[k].x, P[k].y, 200); if (n) P[k + 'Road'] = { x: n.x, y: n.y, a: n.ang }; }
    const ga = W.areas.find(a => a.n === 'Victor Harbor Golf Club'); if (ga) { Game.golfArea = ga; let cx = 0, cy = 0; for (let i = 0; i < ga.p.length; i += 2) { cx += ga.p[i]; cy += ga.p[i + 1]; } P.golf = { x: cx / (ga.p.length / 2), y: cy / (ga.p.length / 2) }; }
    const wa = W.areas.find(a => a.n === 'Warland Reserve' && a.k === 'park'); if (wa) { Game.warlandArea = wa; let cx = 0, cy = 0; for (let i = 0; i < wa.p.length; i += 2) { cx += wa.p[i]; cy += wa.p[i + 1]; } P.warland = { x: cx / (wa.p.length / 2), y: cy / (wa.p.length / 2) }; }
  };

  // ---------- setup ----------
  Game.init = function () {
    // rail routes run from Victor Harbor outwards
    for (const k of ['train', 'tram']) {
      const r = W.railRoutes[k]; const p = r.p; const n = p.length / 2;
      const victorEnd = Math.hypot(p[0] - 4900, p[1] - 2880) < Math.hypot(p[2 * n - 2] - 4900, p[2 * n - 1] - 2880);
      if (!victorEnd) { const q = new Float32Array(p.length); for (let i = 0; i < n; i++) { q[i * 2] = p[(n - 1 - i) * 2]; q[i * 2 + 1] = p[(n - 1 - i) * 2 + 1]; } r.p = q; r.cum = U.cumLen(q); }
    }
    Game.initPlaces();
    VH.Props.init(W.propsRaw);
    VH.Lockup.init(); VH.Police.init(); VH.Acts.init(); VH.Street.init(); VH.Shops.init();
    // footies on the ovals and pitches, and a couple at Warland Reserve
    for (const a of W.areas) if (a.k === 'pitch' && Math.abs(a.bb[2] - a.bb[0]) > 40) { let cx = 0, cy = 0; for (let i = 0; i < a.p.length; i += 2) { cx += a.p[i]; cy += a.p[i + 1]; } VH.Props.add(PK.ball, cx / (a.p.length / 2), cy / (a.p.length / 2), 0); }
    for (let i = 0; i < 2; i++) VH.Props.add(PK.ball, Game.places.warland.x - 25 + i * 6, Game.places.warland.y + 14, 0);
    // helipads: the hospital's (from OpenStreetMap) and a pad on the oval by the Maude Street roundabout
    const open = (x, y) => { for (let r = 0; r < 80; r += 3) for (let a = 0; a < U.TAU; a += 0.5) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; const g = W.groundAt(px, py); let ok = g !== W.GC.BUILDING && g !== W.GC.SEA && g !== W.GC.WATER && W.roadDist(px, py) > 6; for (let k = 0; ok && k < 8; k++) { const qx = px + Math.cos(k * 0.8) * 7, qy = py + Math.sin(k * 0.8) * 7; if (W.groundAt(qx, qy) === W.GC.BUILDING) ok = false; } if (ok) return { x: px, y: py }; } return { x, y }; };
    Game.helipads = [{ ...open(3328.6, 3511.6), kind: 'rescue', label: 'HOSPITAL HELIPAD' }, { ...open(2774, 2922), kind: 'police', label: 'OVAL HELIPAD' }];
    // the Schoolies party at Warland Reserve
    const w = Game.places.warland; Game.partyProps = [];
    for (let i = 0; i < 4; i++) { const a = i / 4 * U.TAU + 0.4; Game.partyProps.push(VH.Props.add(PK.speaker, w.x + Math.cos(a) * 14, w.y + Math.sin(a) * 10, a, { party: true })); }
    for (let i = 0; i < 2; i++) Game.partyProps.push(VH.Props.add(PK.flamingo, w.x + (i ? 9 : -9), w.y + (i ? -6 : 7), i * 2, { party: true }));
    for (let i = 0; i < 6; i++) VH.Props.add(PK.esky, w.x + U.rand(-16, 16), w.y + U.rand(-12, 12), U.rand(0, 6));
    // shore foam points grid
    Game.shoreGrid = new U.Grid(32); for (let i = 0; i < W.shore.length; i += 2) Game.shoreGrid.add([W.shore[i], W.shore[i + 1], U.hash(i, 7)], W.shore[i], W.shore[i + 1]);
    // whales out in Encounter Bay
    for (const [x, y] of [[3600, 5600], [4300, 4700], [5200, 5600], [3900, 7000], [6300, 4300]]) { let px = x, py = y; for (let k = 0; k < 20 && W.seaDist(px, py) > -40; k++) { px += 40; py += 20; } Game.whales.push(new VH.Whale(px, py)); }
    Game.ghostWhale = new VH.Whale(Game.places.bluff.x + 60, Game.places.bluff.y - 20, true);
    // porch lights: a share of houses leave theirs on
    for (const d of W.doors) d.on = U.hash(Math.round(d.x), Math.round(d.y), 2) < 0.35;
  };

  // night 1 for a character (free roam has just the one night); their wallet and upgrades come from the save
  Game.newRun = function (char) { VH.Missions.playNight(char, 1); };
  Game.startNight = function () {
    VH.Tackle.on = null; VH.Shops.chat = null; VH.Shops.resetNight(); VH.Escort.reset(); Game.sunscreen = false;
    Game.hour = Game.char === 'roam' ? 19.2 : 19.5; Game.vehicles = []; Game.gateRides = null; Game.peds = []; Game.gulls = []; Game.cop = null; Game.watch = []; Game.meter = 0; Game.msgs = []; Game.callouts = { cur: null, queue: [] }; Game.forceGhost = false; Game.custody = []; VH.Police.reset(); VH.Lockup.gateOpen = VH.Lockup.gateWant = 0; VH.Lockup.ride = null;
    const P = Game.places;
    // special vehicles
    const tram = new VH.RailVehicle('tram', W.railRoutes.tram, 12); const train = new VH.RailVehicle('train', W.railRoutes.train, 60);
    Game.specials = { tram, train };
    Game.vehicles.push(tram, train);
    // park a vehicle on the nearest baked kerb slot to a place (the B-double at the depot, Kev's car at the station...)
    const park = Game.park = (type, at, opts = {}) => { if (!at) return null; const k = VH.Spawn.pick('kerb', { near: at, maxDist: 250, access: 'car', nearest: true, unoccupied: true }); if (!k) return null; return VH.Spawn.vehicle(type, k, { parked: true, ...opts }); };
    Game.specials.truck = park('truck', P.industrial, { colour: '#c9372e' });
    Game.specials.hearse = park('hearse', P.cemetery, { colour: '#1b1b22' });
    Game.specials.icecream = park('icecream', { x: 4750, y: 2760 }, { colour: '#f4eadf' });
    for (const h of Game.helipads) { const c = new VH.Vehicle('heli', h.x, h.y, -Math.PI / 2, { colour: '#fff' }); c.kind = h.kind; c.def.name = h.kind === 'rescue' ? 'rescue helicopter' : 'police helicopter'; Game.vehicles.push(c); Game.specials['heli_' + h.kind] = c; }
    // bikes to borrow along the foreshore
    const wl = Game.places.warland; [['bmx', -14, -30, '#ff4fa0'], ['cruiser', -10, -30, '#38e0c8'], ['escooter', -6, -30, '#222'], ['bmx', 60, -20, '#ffd23a']].forEach(([t, dx, dy, col]) => { const n = W.nearestEdge(wl.x + dx, wl.y + dy, 30); if (n) { const off = n.e.w / 2 + 1; Game.vehicles.push(new VH.Vehicle(t, n.x + Math.sin(n.ang) * off, n.y - Math.cos(n.ang) * off, n.ang, { colour: col, parked: true })); } });
    VH.Acts.newNight(); VH.Street.newNight();
    // the player
    const home = Game.homeFor(Game.char);
    Game.lastVeh = null; Game.waypoint = null; Game.offered = null; Game.carParks && Game.carParks.forEach(a => { a.cars = null; a.filledAt = null; });
    Game.player = { x: home.x, y: home.y, ang: 0, vx: 0, vy: 0, onFoot: true, vehicle: null, anim: 0, chips: 0, z: 0 };
    if (Game.char === 'cop') {
      const v = park('police', P.police, { colour: '#fff' }); v.parked = false; v.owned = true; Game.enter(v, true);
      // the station's paddy wagon is parked just behind: room for six in the back
      const n = W.nearestEdge(v.x - Math.cos(v.ang) * 9, v.y - Math.sin(v.ang) * 9, 30); if (n) { const off = n.e.w / 2 - 1.2; const w = new VH.Vehicle('paddy', n.x + Math.sin(n.ang) * off, n.y - Math.cos(n.ang) * off, n.ang, { colour: '#fff' }); w.owned = true; Game.vehicles.push(w); }
    }
    if (Game.char === 'grump') { const v = new VH.Vehicle('gopher', home.x, home.y, home.a || 0, { colour: '#c4372e' }); v.owned = true; Game.vehicles.push(v); Game.enter(v, true); VH.Shops.applyGopher(); }
    Game.cam.x = Game.player.x; Game.cam.y = Game.player.y; Game.helpOpen = false;
    if (Game.char !== 'roam' && Game.hintIdx == null && !U.store.get('hints', false)) { Game.hintIdx = Game.player.onFoot ? 0 : 3; Game.hintT = 0; Game.hintMoved = 0; Game.hintSprint = 0; }
    R.prefetch(Game.player.x, Game.player.y, 110);
    Game.populate(true);
  };
  Game.homeFor = function (c) {
    const P = Game.places;
    if (c === 'grump') return P.grumpHomeRoad || P.grumpHome;
    if (c === 'cop') return P.police;
    const n = W.nearestEdge(P.warland.x, P.warland.y - 30, 80); return n ? { x: n.x, y: n.y } : P.warland;
  };

  // ---------- player actions ----------
  Game.enter = function (v, silent) {
    const pl = Game.player; pl.onFoot = false; pl.vehicle = v; v.driver = 'player';
    if (v.def && v.def.gopher && VH.Shops.applyGopher) VH.Shops.applyGopher();
    if (v.gateRide) { silent = true; v.owned = true; v.gateRide = false; Game.gateRides = (Game.gateRides || []).filter(q => q !== v); } // yours: no theft
    if (v.ai && !silent) {
      const p = new VH.Ped(v.def && v.def.gopher ? 'retiree' : U.pick(['local', 'retiree', 'local']), v.x + 2, v.y + 2); p.state = 'flee'; p.ang = U.rand(0, U.TAU); p.t = 0; p.say(v.def && v.def.gopher ? 'MY GOPHER!' : 'OI! MY CAR!', 2.5); Game.peds.push(p);
      if (Game.char === 'cop') Game.addMeter(0.4, 'COMMANDEERED!'); else { Game.addMeter(1.0, 'CAR BORROWED'); VH.Police.witness(0.6, 'CAR THEFT, IN FULL VIEW!'); }
    } else if (!silent && !v.owned && Game.char === 'cop' && !v.rail && !v.def.heli && v.type !== 'police' && v.type !== 'paddy') {
      Game.addMeter(0.25, 'COMMANDEERED!');
    } else if (!silent && !v.owned) {
      if (v.rail) { Game.addMeter(0.9, v.kind === 'tram' ? 'TRAM BORROWED' : 'TRAIN BORROWED'); sfx(v.kind === 'tram' ? 'bell_tram' : 'whistle_train'); }
      else if (v.type === 'police' && Game.char !== 'cop') Game.addMeter(2.5, "YOU NICKED THE COP CAR?!", 3);
      else if (v.def.heli && Game.char !== 'cop') { Game.addMeter(v.kind === 'police' ? 4.6 - Game.meter : 3.2, v.kind === 'police' ? 'YOU NICKED THE POLICE CHOPPER?!' : 'YOU NICKED THE RESCUE CHOPPER?!', 4.2); Game.toast(I.touchMode ? 'UP: CLIMB   DOWN: DESCEND   DRAG: FLY' : 'SHIFT: CLIMB   SPACE: DESCEND   W/S: FLY   A/D: TURN', '#38e0c8'); }
      else if (v.def.heli) Game.toast(I.touchMode ? 'UP: CLIMB   DOWN: DESCEND   DRAG: FLY' : 'SHIFT: CLIMB   SPACE: DESCEND   W/S: FLY   A/D: TURN', '#38e0c8');
      else { Game.addMeter(0.6, 'CAR BORROWED'); VH.Police.witness(0.5, 'CAR THEFT, IN FULL VIEW!'); if (v.parked && Math.random() < 0.5) { Game.alarm = { v, t: 2.5 }; } }
    }
    if (!silent && !v.owned) Game.stats.stolen++;
    v.ai = null; v.parked = false; sfx('door');
    if (!v.rail) { Game.lastVeh = v; Game.lastGoneSaid = false; }
    if (Game.char === 'cop' && !v.rail && !v.def.heli && !v.def.bike && !v.def.gopher && v.type !== 'police' && v.type !== 'paddy' && !v.roofLight) Game.toast(VH.Input.touchMode ? 'LIGHT: SLAP THE MAGNETIC LIGHT ON THE ROOF' : 'L: SLAP THE MAGNETIC LIGHT ON THE ROOF', '#9fd4ec');
    if (Game.kitSaved && !v.rail) { Game.kitSaved = false; v.flat = false; v.damage = Math.max(0, v.damage - 0.4); v.dead = false; Game.toast('TYRE KIT USED: PATCHED UP', '#9be15d'); }
    VH.Missions.event('enter', v);
  };
  Game.exit = function (force) {
    const pl = Game.player, v = pl.vehicle; if (!v) return;
    if (force) { v.vx *= 0.2; v.vy *= 0.2; if (v.rail) v.v = 0; if (v.def && v.def.heli && v.z > 0.3) return; }
    if (v.def && v.def.heli && v.z > 0.3) { Game.toast('LAND FIRST (HOLD ' + (I.touchMode ? 'DOWN' : 'SPACE') + ')'); return; } // the one exception: not out of a helicopter in the air
    // E works at any speed: a step out at walking pace, otherwise a dive and a tuck-and-roll the way you were going
    const spd = v.speed, roll = !force && spd > 3; const spot = Game.exitSpot(v);
    pl.x = spot.x; pl.y = spot.y; pl.onFoot = true; pl.vehicle = null; v.driver = null; v.throttle = v.brake = v.steer = 0; v.siren = false;
    if (roll) Game.bailRoll(v.vx, v.vy, spd, v);
    else { v.handbrake = 1; if (v.rail) { v.throttle = 0; v.brake = 1; } sfx('door'); }
    VH.Missions.event('exit', v);
  };
  // somewhere to stand when you get out: the driver's side, the other side, then the nearest free spot. Never stuck.
  Game.exitSpot = function (v) {
    const parts = v.rail ? v.parts.filter(p => !p.horse) : [v]; const pl = Game.player; const at = parts.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0] || v;
    const ang = at.a != null ? at.a : v.ang; const d = (v.def.W || 2.6) / 2 + 0.9;
    const free = (x, y) => { if (!W.inBounds(x, y, 3) || W.groundAt(x, y) === W.GC.BUILDING || VH.Nav.crossesWall(at.x, at.y, x, y)) return false; let hit = false; for (const o of Game.vehicles) { if (o.removed || Math.abs(o.x - x) > 30 || Math.abs(o.y - y) > 30) continue; o.eachCircle((cx, cy, r) => { if (Math.hypot(cx - x, cy - y) < r + 0.35) hit = true; }); if (hit) return false; } return true; };
    const cands = [[ang + Math.PI / 2, d], [ang - Math.PI / 2, d]]; for (let r = d + 0.8; r < 9; r += 0.8) for (let k = 0; k < 12; k++) cands.push([ang + k * Math.PI / 6, r]);
    let wet = null; for (const [a, r] of cands) { const x = at.x + Math.cos(a) * r, y = at.y + Math.sin(a) * r; if (!free(x, y)) continue; if (!W.isWet(x, y)) return { x, y }; if (!wet) wet = { x, y }; }
    return wet || VH.Nav.snap(at.x, at.y, 12) || { x: at.x, y: at.y };
  };
  // a tuck-and-roll out of something moving: the faster it was going, the further you roll and the longer you're dizzy.
  // Nobody gets hurt. The empty vehicle coasts on (a tram or train keeps rolling on its rails).
  Game.bailRoll = function (vx, vy, spd, v) {
    const pl = Game.player, k = U.clamp(spd / 28, 0, 1);
    pl.vx = vx * 0.5; pl.vy = vy * 0.5; pl.ang = Math.atan2(vy, vx); pl.rollT = 0.35 + k * 0.85; pl.spin = 0; pl.dizzyT = 1 + k * 2; pl.dizzyMax = pl.dizzyT;
    if (v) { v.handbrake = 0; v.coastT = 6; if (v.rail) { v.brake = 0; v.throttle = 0; } }
    sfx('thud', { vol: 0.8, pitch: 0.7 }); sfx('dive', { vol: 0.5 }); FX.dust(pl.x, pl.y, '#c8bfa0', 8); FX.kick(0.2 + k * 0.35);
    Game.callout(spd > 15 ? 'TUCK AND ROLL!' : 'BAILED OUT!', '#ffd23a');
  };
  Game.nearestVehicle = function (x, y, maxD) {
    let best = null, bd = maxD;
    for (const v of Game.vehicles) { if (v.removed || v.sinking || v.police || v.patrol || v.block || v.backup || v.scripted || v.watch || v.delivery || v.missionDrive) continue; v.eachCircle((cx, cy, r) => { const d = Math.hypot(cx - x, cy - y) - r; if (d < bd) { bd = d; best = v; } }); }
    return best;
  };
  // the big centre-screen callout: one at a time. The same text again bumps a x2 counter; a related event a moment
  // later (a crash, then "in front of the police") replaces it; anything else waits in a short queue that drops stale entries.
  Game.callouts = { cur: null, queue: [] };
  Game.callout = function (str, col = '#ffd23a') {
    const c = Game.callouts, now = Game.t;
    if (c.cur && c.cur.str === str) { c.cur.n++; c.cur.t0 = now; return; }
    const q = c.queue.find(x => x.str === str); if (q) { q.n++; q.at = now; return; }
    if (!c.cur || now - c.cur.t0 < 0.4) { c.cur = { str, col, n: c.cur && now - c.cur.t0 < 0.4 ? 1 : 1, t0: now }; return; }
    c.queue.push({ str, col, n: 1, at: now }); if (c.queue.length > 2) c.queue.shift();
  };
  Game.nextCallout = function () {
    const c = Game.callouts, now = Game.t; if (c.cur && now - c.cur.t0 < 1.5) return c.cur;
    c.cur = null; while (c.queue.length) { const q = c.queue.shift(); if (now - q.at < 2) { c.cur = { str: q.str, col: q.col, n: q.n, t0: now }; break; } }
    return c.cur;
  };
  Game.toast = (str, col = '#fff') => { const dup = Game.msgs.find(m => m.str === str); if (dup) { dup.t = 2.6; return; } Game.msgs.push({ str, col, t: 2.6 }); if (Game.msgs.length > 3) Game.msgs.shift(); };

  // ---------- your vehicles: a light-blue marker back to the last one you drove (and, for Kev, his police car) ----------
  Game.MINE_COL = '#7fd4ff';
  const vName = v => (v.rail ? v.name : v.def.name).toUpperCase();
  Game.myMarkers = function () {
    const pl = Game.player; if (!pl || Game.demo) return []; const out = [];
    const lv = Game.lastVeh;
    if (lv) {
      const why = lv.removed && !lv.sinking ? 'GONE' : lv.sinking || lv.removed ? 'SUNK' : lv.dead ? 'WRECKED' : lv.driver && lv.driver !== 'player' ? 'TAKEN' : '';
      if (why) { if (!Game.lastGoneSaid) { Game.lastGoneSaid = true; Game.toast(`YOUR ${vName(lv)} IS ${why === 'GONE' ? 'GONE' : why === 'SUNK' ? 'AT THE BOTTOM OF THE BAY' : why === 'WRECKED' ? 'A WRECK' : 'GONE: SOMEONE ELSE HAS IT'}`, Game.MINE_COL); } Game.lastVeh = null; }
    }
    const cop = Game.char === 'cop' ? VH.Police.kevCar() : null;
    if (cop && pl.vehicle !== cop) out.push({ x: cop.x, y: cop.y, label: 'COP CAR', col: Game.MINE_COL, mine: true, v: cop });
    for (const gr of Game.gateRides || []) if (!gr.removed && pl.vehicle !== gr) out.push({ x: gr.x, y: gr.y, label: gr.def.bike ? 'YOUR BIKE' : 'OLD HATCHBACK', col: Game.MINE_COL, mine: true, v: gr });
    const of = Game.offered; if (of && !of.removed && pl.vehicle !== of) out.push({ x: of.x, y: of.y, label: 'A CAR', col: Game.MINE_COL, mine: true, v: of });
    const l2 = Game.lastVeh; if (l2 && l2 !== cop && pl.vehicle !== l2 && !(l2.def && l2.def.heli && l2.z > 1)) out.push({ x: l2.x, y: l2.y, label: (l2.owned && l2.type === 'police' ? 'COP CAR' : 'YOUR ' + vName(l2)), col: Game.MINE_COL, mine: true, v: l2 });
    return out;
  };

  // ---------- the meter ----------
  Game.HEAT_START = 1.4; Game.HEAT_LEVEL_SECS = 55; // the meter's ceiling starts here and rises a level per 55 s of sustained trouble
  Game.addMeter = function (amt, label, big) {
    if (Game.char === 'roam' && amt > 0) amt *= 0.8;
    if (amt > 0 && Game.char !== 'cop' && VH.Police.inGrace()) return; // just let out of the lock-up: nobody's counting yet
    if (Game.char !== 'cop' && amt > 0) { amt *= 0.7; if (big) Game.heatCeil = Math.max(Game.heatCeil || Game.HEAT_START, Math.min(big, Game.meter + amt)); } // something outrageous lifts the ceiling
    const cap = Game.char === 'cop' ? 5.2 : Math.max(Game.meter, Math.min(5.2, Game.heatCeil || Game.HEAT_START));
    const before = Math.floor(Game.meter); Game.meter = U.clamp(Game.meter + amt, 0, amt > 0 ? cap : 5.2); Game.quietT = 0;
    const after = Math.floor(Game.meter);
    if (after > before) { sfx(Game.char === 'cop' ? 'radio' : 'sms'); Game.toast((Game.char === 'cop' ? Game.COP_LABELS : Game.METER_LABELS)[Math.min(5, after)], '#ffd23a'); if ((Game.char === 'cop' || Game.char === 'grump') && VH.Street.levelPost) VH.Street.levelPost(after); }
    if (label && amt >= 0.3) Game.callout(label);
    if (Game.char === 'cop' && Game.meter >= 5) Game.sergeant();
  };
  Game.sergeant = function () {
    Game.meter = 1.5; const fine = Math.min(Game.cash, 40); Game.cash -= fine; Game.stats.sarge = (Game.stats.sarge || 0) + 1;
    Game.toast("SARGE: 'KEV. WHAT ARE YOU DOING.' -$" + fine, '#ff6a5a'); sfx('fail');
  };
  // busted (Jaz, Merv, free roam): the paddy wagon takes you up the hill to the lock-up, then you try again from the gate
  Game.busted = function () {
    Game.stats.busted++; const fine = Math.min(Game.cash, 25); Game.cash -= fine;
    Game.bustInfo = { fine, line: U.pick(["I KNOW YOUR MOTHER, YOU KNOW.", "THIS ISN'T THE CITY, MATE.", "I'VE A GOOD MIND TO RING YOUR NAN.", 'SCHOOLIES OR NOT, THAT LETTERBOX HAD FEELINGS.', "WE DON'T DO THAT AROUND HERE.", "RIGHT. WE'LL SAY NO MORE ABOUT IT. BUT I'M WRITING IT DOWN."]) };
    sfx('fail'); FX.flash = 0.6; VH.Street.grab = null; VH.Tackle.on = null; Game.player.inShop = null;
    const pl = Game.player; Game.lastBustPos = { x: pl.x, y: pl.y }; VH.Police.reset(); Game.watch.forEach(v => v.removed = true); Game.watch = [];
    VH.Lockup.startRide({ x: pl.x, y: pl.y });
  };
  Game.afterBust = function () {
    Game.meter = 0; Game.heatCeil = Game.HEAT_START; Game.hour = Math.min(Game.hour + 0.25, Game.hour < 5 ? 5.2 : 99); if (Game.hour >= 24) Game.hour -= 24;
    VH.Lockup.releasePlayer(); VH.Police.reset(); VH.Police.graceT = VH.Police.GRACE;
    // the current job starts over from the gate
    const M = VH.Missions; if (M.job && M.job.started) { M.job.cleanup && M.job.cleanup(); M.prepJob(); Game.pendingBrief = 1.2; Game.toast('LET OUT AT THE GATE. HAVE ANOTHER GO.', '#9be15d'); }
    else Game.toast('LET OUT AT THE GATE. BEHAVE.', '#9be15d');
    Game.state = 'play';
  };
  // the world keeps ticking while you ride in the back of the paddy wagon
  Game.updateRide = function (dt) {
    Game.t += dt; if (Game.timeOverride == null) Game.hour += dt * Game.clockRate; if (Game.hour >= 24) Game.hour -= 24;
    VH.Lockup.updateRide(dt); VH.Lockup.update(dt);
    const pl = Game.player; const active = Game.vehicles.filter(v => !v.removed && !v.scripted && Math.hypot(v.x - pl.x, v.y - pl.y) < 260);
    for (const v of active) { if (v.ai && !v.police && v.ai.mode !== 'pursue' && v.ai.mode !== 'hoon') VH.AI.drive(v, dt, active); else if (!v.rail && v.driver !== 'player') { v.throttle = 0; v.brake = 1; } v.update(dt); }
    for (const v of active) { VH.Collide.walls(v); VH.Props.collideVehicle(v); }
    VH.Collide.vehicles(active);
    const dodge = VH.Lockup.ride ? [...active, VH.Lockup.ride.v] : active;
    for (const p of Game.peds) if (Math.abs(p.x - pl.x) < 200 && Math.abs(p.y - pl.y) < 200) p.update(dt, dodge);
    for (const g of Game.gulls) g.update(dt, active.filter(v => v.speed > 2), null);
    FX.update(dt);
    for (const m of Game.msgs) m.t -= dt; Game.msgs = Game.msgs.filter(m => m.t > 0);
    Game.popT = (Game.popT || 0) - dt; if (Game.popT <= 0) { Game.popT = 0.5; Game.populate(false); }
    if (window.SFX) { SFX.engine({ speed: 0.4, throttle: 0.5, kind: 'police' }); SFX.skid(0); SFX.music('chase'); }
  };

  // ---------- hooks from the simulation ----------
  const SMASH_TXT = { [PK.lamp]: ['LIGHTS OUT!', 'POLE POSITION!'], [PK.signal]: ['RED LIGHT... GONE!'], [PK.letterbox]: ['RETURN TO SENDER!', 'MAIL CALL!'], [PK.fence]: ['GOOD FENCES...', 'COLORBOND CARNAGE!'],
    [PK.binR]: ['BIN-GO!', 'BIN NIGHT!'], [PK.binY]: ['RECYCLED!'], [PK.binG]: ['GREEN WASTE!'], [PK.bin]: ['BIN-GO!'], [PK.chair]: ['CAFE CHAOS!'], [PK.table]: ['TABLE FOR NONE!'], [PK.phonebox]: ['WRONG NUMBER!'], [PK.hydrant]: ['SPLASH!'], [PK.bench]: ['TAKE A SEAT!'], [PK.speaker]: ['DOOF... DOOF... D...'], [PK.flamingo]: ['FLAMINGONE!'] };
  Game.onSmash = function (p, by) {
    const pl = Game.player; const mine = by && (by === pl.vehicle || by === 'player');
    if (!mine) return;
    Game.stats.smashed++;
    const val = { [PK.lamp]: 5, [PK.signal]: 8, [PK.phonebox]: 6, [PK.fence]: 1, [PK.letterbox]: 2 }[p.k] || 1;
    if (Game.char !== 'cop') Game.cash += val;
    if (Math.random() < (p.k === PK.fence ? 0.1 : 0.45) || val >= 5) FX.text(p.x, p.y - 2, U.pick(SMASH_TXT[p.k] || ['SMASH!']) + (Game.char !== 'cop' ? ' +$' + val : ''), val >= 5 ? '#ffd23a' : '#ffffff');
    Game.addMeter(p.k === PK.fence ? 0.04 : val >= 5 ? 0.35 : 0.12);
    if (val >= 2 || Math.random() < 0.3) VH.Police.witness(0.4, 'THE POLICE SAW THAT!');
    VH.Missions.event('smash', p); VH.Acts.onSmash(p, val);
  };
  Game.onCrash = function (v, impact, other) {
    const pl = Game.player;
    if (Game.char === 'cop' && pl.vehicle && other && (v === pl.vehicle || other === pl.vehicle) && impact > 3) {
      const target = v === pl.vehicle ? other : v, me = pl.vehicle;
      if (target.ai && target.ai.flee) {
        const fx = Math.cos(target.ang), fy = Math.sin(target.ang); const dx = me.x - target.x, dy = me.y - target.y;
        const along = dx * fx + dy * fy, lat = -dx * fy + dy * fx;
        if (along < -target.def.L * 0.15 && !(target.ai.spun > 0)) { target.ai.spun = 1.6; target.av += (lat > 0 ? -1 : 1) * 4.5; target.vx *= 0.6; target.vy *= 0.6; FX.text(target.x, target.y - 4, 'PIT!', '#9fd4ec'); sfx('crunch'); }
        return; // police work on a fleeing car draws no complaints
      }
    }
    if (other && (other === pl.vehicle || v === pl.vehicle) && impact > 6) { const victim = v === pl.vehicle ? other : v; if (victim && victim.ai) { Game.addMeter(0.4, 'PRANG!'); victim.ai.angry = 3; VH.Police.witness(0.5, 'PRANG IN FRONT OF THE POLICE!'); } if (victim && (victim.patrol || victim.police)) { Game.addMeter(0.8, 'YOU HIT A POLICE CAR!'); VH.Police.witness(0.6); } }
    if (v === pl.vehicle && impact > 3) VH.Missions.event('crash', impact);
  };
  Game.onDive = function (ped, v) { const pl = Game.player; if (v === pl.vehicle) { Game.stats.dives++; if (Math.random() < 0.35) FX.text(ped.x, ped.y - 2, U.pick(['JUMP!', 'NICE ROLL!', 'TEN FROM THE JUDGES!', 'STUNTMAN!']), '#9be15d'); Game.addMeter(0.15); } };
  Game.onSink = function (v) {
    const pl = Game.player; if (v === pl.vehicle) {
      // you bail out and swim for it; the car is gone for good
      pl.vehicle = null; pl.onFoot = true; v.driver = null; pl.x = v.x; pl.y = v.y; pl.vx = v.vx * 0.3; pl.vy = v.vy * 0.3; pl.breath = 1; v.siren = false;
      Game.toast('YOU BAIL OUT AND SWIM FOR IT', '#9fd4ec'); VH.Missions.event('sink', v);
    }
    if (v === pl.vehicle || v.owned || v.driver === 'player' || Math.hypot(v.x - pl.x, v.y - pl.y) < 40) Game.sunkNotice(v);
  };
  // a car in the drink gets noticed: a patrol comes to look (Jaz, Merv), or the sergeant wants to know where it went (Kev)
  Game.sunkNotice = function (v) {
    const pl = Game.player, P = VH.Police; if (v.noticed) return; v.noticed = true;
    if (Game.char === 'cop') { if (v.owned || v.type === 'police') { Game.addMeter(1.2, 'POLICE CAR IN THE DRINK!'); Game.toast("SARGE: 'KEV. WHERE IS THE CAR.' (B FOR A SPARE)", '#7fa6ff'); sfx('radio'); } return; }
    Game.addMeter(0.8, 'CAR IN THE DRINK!'); if (!P.inGrace()) { Game.meter = Math.max(Game.meter, 1.7); P.seenT = 0; } P.last = { x: v.x, y: v.y };
    Game.toast('SOMEONE SAW THE CAR GO IN. THE POLICE ARE COMING TO LOOK', '#ff9a30');
  };
  Game.onLand = (v, air) => VH.Acts.onLand(v, air);
  Game.onDriftEnd = (v, t, kick) => { if (v === Game.player.vehicle && kick > 2) FX.text(v.x, v.y - 5, 'DRIFT BOOST!', '#38e0c8'); };
  // damage stages (dents, smoke, sparks, limping, disabled) are called out on your car and on the one you're after
  Game.onDamageStage = function (v, stage) {
    const pl = Game.player; const mine = v === pl.vehicle; const target = v.mission || v.hoon || v === (VH.Missions.chaseTarget && VH.Missions.chaseTarget());
    if (!mine && !target) return; const name = VH.DAMAGE.STAGES[stage][1]; if (!name || stage >= 5) return;
    FX.text(v.x, v.y - 5, (mine ? '' : target && v.hoon ? "HOON'S CAR: " : 'TARGET: ') + name + (stage === 4 ? '!' : ''), mine ? '#ff9a30' : '#9fd4ec');
    if (stage >= 3 && mine) Game.callout(stage === 4 ? 'LIMPING: SHE WON\'T TAKE MUCH MORE' : 'SPARKS FLYING!', '#ff9a30');
  };
  Game.onWreck = function (v) { if (v === Game.player.vehicle) Game.toast("SHE'S CARKED IT. PRESS E TO BAIL.", '#ff9a30'); };
  Game.onTracks = function (v, len) { if (v === Game.player.vehicle) { Game.stats.tracks += len; VH.Missions.event('tracks', { v, len }); } };
  Game.onGullSteal = function () { const pl = Game.player; if (pl.chips > 0) { pl.chips--; Game.stats.gulls++; FX.text(pl.x, pl.y - 3, 'CHIP THIEF! ' + pl.chips + ' LEFT', '#ff9a30'); VH.Missions.event('gull'); } };
  Game.sirenPullover = function (v) {
    const pl = Game.player; if (Game.char !== 'cop' || pl.onFoot || !pl.vehicle || !pl.vehicle.siren) return false;
    const d = Math.hypot(v.x - pl.vehicle.x, v.y - pl.vehicle.y); return d < 30;
  };

  // ---------- population: traffic, parked cars, pedestrians, gulls ----------
  Game.populate = function (initial) {
    const pl = Game.player, px = pl.x, py = pl.y;
    const view = Game.viewHalf || [90, 60];
    const offscreen = (x, y) => initial ? Math.hypot(x - px, y - py) > 25 : (Math.abs(x - Game.cam.x) > view[0] + 15 || Math.abs(y - Game.cam.y) > view[1] + 15);
    // despawn far things
    Game.vehicles = Game.vehicles.filter(v => { if (v.removed) return v === pl.vehicle; if (v.rail || v.owned || v === Game.lastVeh || v === Game.offered || v.gateRide || VH.Escort.inBack(v).length || v.delivery || v.tow || v.def.heli || v.police || v.patrol || v.block || v.backup || v.scripted || Game.watch.includes(v) || v.mission || Object.values(Game.specials).includes(v)) return true; return Math.hypot(v.x - px, v.y - py) < 380; });
    Game.peds = Game.peds.filter(p => p.tag || Math.hypot(p.x - px, p.y - py) < 190);
    Game.gulls = Game.gulls.filter(g => Math.hypot(g.x - px, g.y - py) < 220);
    let moving = 0, parked = 0, gophers = 0;
    for (const v of Game.vehicles) { if (v.ai && v.def.gopher) gophers++; else if (v.ai) moving++; else if (v.parked) parked++; }
    const wantMoving = Game.char === 'roam' ? 18 : 15, wantParked = 12, wantGophers = Game.char === 'cop' ? 4 : 2;
    for (let i = 0; i < 3 && moving < wantMoving; i++) {
      const n = W.randomRoadPoint(px, py, initial ? 40 : 140, initial ? 220 : 300, e => e.w >= 5 && e.speed > 6);
      if (!n || !offscreen(n.x, n.y) || Game.vehicles.some(v => Math.hypot(v.x - n.x, v.y - n.y) < 10)) continue;
      const dir = n.e.ow === -1 ? -1 : n.e.ow === 1 ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const ang = n.ang + (dir === -1 ? Math.PI : 0); const off = AI_LANE(n.e); const x = n.x + Math.sin(ang) * off, y = n.y - Math.cos(ang) * off;
      const v = new VH.Vehicle(Math.random() < 0.04 ? 'truck' : Math.random() < 0.06 ? 'icecream' : VH.randomCarType(), x, y, ang); VH.AI.attach(v, n, dir); v.vx = Math.cos(ang) * 8; v.vy = Math.sin(ang) * 8;
      Game.vehicles.push(v); moving++;
    }
    for (let i = 0; i < 2 && gophers < wantGophers; i++) {
      const n = W.randomRoadPoint(px, py, initial ? 40 : 110, initial ? 200 : 240, e => e.w >= 6 && e.speed > 8); if (!n || !offscreen(n.x, n.y)) continue;
      const dir = n.e.ow === -1 ? -1 : n.e.ow === 1 ? 1 : (Math.random() < 0.5 ? 1 : -1); const ang = n.ang + (dir === -1 ? Math.PI : 0); const off = Math.max(0, n.e.w / 2 - 0.8);
      const v = new VH.Vehicle('gopher', n.x + Math.sin(ang) * off, n.y - Math.cos(ang) * off, ang, { colour: U.pick(['#c4372e', '#2e5a9a', '#3d7a3a', '#b0b0b0']) }); VH.AI.attach(v, n, dir); v.rider = true; Game.vehicles.push(v); gophers++;
    }
    for (let i = 0; i < 3 && parked < wantParked; i++) {
      const n = W.randomRoadPoint(px, py, initial ? 15 : 90, initial ? 160 : 200, e => e.w >= 6 && e.w < 12 && !e.rb && !e.br); if (!n || !offscreen(n.x, n.y)) continue;
      const side = Math.random() < 0.5 ? 1 : -1; const ang = n.ang + (side === -1 ? Math.PI : 0); const off = n.e.w / 2 - 1.1;
      const x = n.x + Math.sin(ang) * off, y = n.y - Math.cos(ang) * off;
      if (Game.vehicles.some(v => Math.hypot(v.x - x, v.y - y) < 7) || W.groundAt(x, y) === W.GC.BUILDING) continue;
      Game.vehicles.push(new VH.Vehicle(VH.randomCarType(), x, y, ang, { parked: true })); parked++;
    }
    // car parks (the paved areas from OpenStreetMap: shops, the golf club, the ovals, the foreshore) get rows of parked
    // cars when you come near, refilled once they've been tidied away
    Game.fillCarParks(px, py, initial);
    // bikes and e-scooters left by the footpath
    if (Game.vehicles.filter(v => v.def.bike && !v.driver).length < 4) {
      const n = W.randomRoadPoint(px, py, initial ? 20 : 80, initial ? 140 : 180, e => e.speed < 17 && e.w < 9); if (n && offscreen(n.x, n.y)) { const s = Math.random() < 0.5 ? 1 : -1; const off = n.e.w / 2 + 1.2; const x = n.x + Math.sin(n.ang) * off * s, y = n.y - Math.cos(n.ang) * off * s; if (W.groundAt(x, y) !== W.GC.BUILDING && !W.isWet(x, y)) Game.vehicles.push(new VH.Vehicle(U.pick(['bmx', 'bmx', 'cruiser', 'escooter']), x, y, n.ang + (s < 0 ? Math.PI : 0), { colour: U.pick(['#ff4fa0', '#38e0c8', '#ffd23a', '#7c5cff', '#222']), parked: true })); }
    }
    // pedestrians
    const late = Game.hour >= 22 || Game.hour < 5; const foreshore = Math.hypot(px - 4850, py - 2800) < 600;
    for (let i = 0; i < 3 && Game.peds.filter(p => !p.tag).length < 24; i++) {
      const n = W.randomRoadPoint(px, py, initial ? 10 : 70, initial ? 120 : 140, e => e.speed < 17); if (!n || !offscreen(n.x, n.y)) continue;
      const kind = Math.random() < (foreshore ? 0.55 : late ? 0.35 : 0.15) ? 'schoolie' : Math.random() < 0.45 ? 'retiree' : 'local';
      const off = n.e.w / 2 + 1.3; const s = Math.random() < 0.5 ? 1 : -1;
      const qx = n.x + Math.sin(n.ang) * off * s, qy = n.y - Math.cos(n.ang) * off * s; if (!VH.Nav.walkable(qx, qy)) continue; // never in a building or the water
      Game.peds.push(new VH.Ped(kind, qx, qy));
    }
    // partygoers at Warland Reserve
    const w = Game.places.warland;
    if (Game.partyOn && Math.hypot(px - w.x, py - w.y) < 260 && !Game.peds.some(p => p.tag === 'party')) {
      for (let i = 0; i < 26; i++) { const p = new VH.Ped('schoolie', w.x + U.rand(-15, 15), w.y + U.rand(-11, 11), { state: 'dance', tag: 'party', home: { x: w.x + U.rand(-12, 12), y: w.y + U.rand(-9, 9) } }); Game.peds.push(p); }
    }
    // gulls along the beach
    if (W.seaDist(px, py) < 160 && Game.gulls.length < 18) {
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * U.TAU, r = U.rand(initial ? 10 : 50, 110); const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r; const sd = W.seaDist(x, y); const g = W.groundAt(x, y);
        if (sd > 1 && sd < 50 && g !== W.GC.BUILDING && g !== W.GC.WATER) for (let j = 0; j < 3; j++) Game.gulls.push(new VH.Gull(x + U.rand(-2, 2), y + U.rand(-2, 2)));
      }
    }
  };
  Game.fillCarParks = function (px, py, initial) {
    const pl = Game.player; if (!Game.carParks) Game.carParks = W.areas.filter(a => a.k === 'paved' && (a.bb[2] - a.bb[0]) * (a.bb[3] - a.bb[1]) > 250 && (a.bb[2] - a.bb[0]) * (a.bb[3] - a.bb[1]) < 40000);
    const view = Game.viewHalf || [90, 60];
    for (const a of Game.carParks) {
      const cx = (a.bb[0] + a.bb[2]) / 2, cy = (a.bb[1] + a.bb[3]) / 2; if (Math.abs(cx - px) > 240 || Math.abs(cy - py) > 240) continue;
      if (a.cars && a.cars.some(v => !v.removed && Game.vehicles.includes(v))) continue;
      if (a.filledAt && Game.t - a.filledAt < 20) continue; a.filledAt = Game.t; a.cars = [];
      const onScreen = (x, y) => Math.abs(x - Game.cam.x) < view[0] + 8 && Math.abs(y - Game.cam.y) < view[1] + 8;
      // its bays (baked car-park slots), some of them filled
      const rnd = U.seeded(Math.round(cx * 7 + cy) + Math.floor(Game.t / 600));
      VH.Spawn.inBox('carpark', a.bb[0], a.bb[1], a.bb[2], a.bb[3], s => {
        if (a.cars.length > 14 || rnd() > 0.5 || !U.pointInPoly(s.x, s.y, a.p) || onScreen(s.x, s.y) && Game.vehicles.length) return;
        if (Game.vehicles.some(v => Math.abs(v.x - s.x) < 4 && Math.abs(v.y - s.y) < 4)) return;
        const v = VH.Spawn.vehicle(VH.randomCarType(), { ...s, a: s.a + (rnd() < 0.5 ? Math.PI : 0) }, { parked: true }); a.cars.push(v);
      });
    }
  };
  // Never stranded: a job that needs wheels (job.needsVehicle) and nothing to borrow within 150 m gets a car parked
  // just out of view on the nearest street, with the light-blue marker on it ("A CAR · 90M")
  Game.offerCar = function (dt) {
    const pl = Game.player, M = VH.Missions, j = M.job; Game.offerT = (Game.offerT || 0) - dt;
    if (Game.offered && (Game.offered.removed || Game.offered.driver || Game.offered.sinking)) Game.offered = null;
    if (!j || !j.started || !j.needsVehicle || !pl.onFoot || Game.offerT > 0) return; Game.offerT = 2;
    if (Game.offered && Math.hypot(Game.offered.x - pl.x, Game.offered.y - pl.y) < 300) return;
    const near = Game.vehicles.some(v => !v.removed && !v.sinking && !v.dead && !v.rail && !v.police && !v.patrol && !v.block && !v.backup && !v.delivery && !v.missionDrive && !(v.def && (v.def.heli || v.def.gopher || v.def.bike)) && Math.hypot(v.x - pl.x, v.y - pl.y) < 150);
    if (near) return;
    // a kerb slot (baked and validated) just out of view
    const k = VH.Spawn.pick('kerb', { near: pl, minDist: 50, maxDist: 160, access: 'car', offscreen: true, unoccupied: true, optional: true }) || VH.Spawn.pick('kerb', { near: pl, minDist: 50, maxDist: 450, access: 'car', offscreen: true, unoccupied: true, nearest: true, optional: true }); if (!k) return;
    { const x = k.x, y = k.y; const v = VH.Spawn.vehicle(VH.randomCarType(), k, { parked: true }); Game.offered = v;
      Game.toast('THERE\'S A CAR YOU CAN BORROW ' + Math.round(Math.hypot(x - pl.x, y - pl.y)) + 'M AWAY (LIGHT BLUE)', '#7fd4ff'); return;
    }
  };
  const AI_LANE = e => e.ow !== 0 ? 0 : Math.min(e.w / 4, 1.9);

  // ---------- the police (see police.js) and Neighbourhood Watch on gophers ----------
  Game.updateCop = function (dt) {
    const P = VH.Police;
    if (Game.char === 'cop') { P.kevUpdate(dt); return; }
    P.update(dt);
    const pl = Game.player; const tgt = pl.onFoot ? pl : pl.vehicle;
    if (Game.meter >= 4 - VH.Street.notoriety * 0.4 && Game.watch.length < 2 && !(VH.Street.snagT > 0)) {
      const n = W.randomRoadPoint(pl.x, pl.y, 60, 120); if (n) { const v = new VH.Vehicle('gopher', n.x, n.y, n.ang, { colour: '#e8c33a' }); v.watch = true; v.def.maxV = 6; Game.watch.push(v); Game.vehicles.push(v); Game.toast('NEIGHBOURHOOD WATCH HAS SCRAMBLED', '#ffd23a'); }
    }
    for (const v of Game.watch) { if (v.removed) continue; if (VH.Street.snagT > 0) { v.throttle = 0; v.brake = 1; continue; } VH.AI.pursue(v, dt, tgt); v.siren = false; if (Math.random() < dt * 0.3) sfx('horn_gopher', { vol: 0.3 }); }
    if (Game.meter < 3) Game.watch = Game.watch.filter(v => { if (Math.hypot(v.x - pl.x, v.y - pl.y) > 150) { v.removed = true; return false; } v.ai = null; v.throttle = 0; return true; });
  };

  // ---------- main update ----------
  Game.update = function (dt) {
    VH.Nav.frame();
    Game.t += dt;
    if (Game.timeOverride == null) Game.hour += dt * Game.clockRate; else Game.hour = Game.timeOverride;
    if (Game.hour >= 24) Game.hour -= 24;
    const pl = Game.player;
    // controls
    if ((I.consume('enter') || I.consume('confirm')) && !VH.Street.grab && !VH.Police.arrest && !VH.Tackle.on && !(pl.inShop && VH.Shops.tryChat())) {
      if (VH.Escort.key()) { /* a prisoner: grab, put in the car, take out, hand over */ }
      else if (VH.Missions.event('board')) { /* E alongside a runaway tram or train: leap aboard */ }
      else if (pl.onFoot && !pl.inShop && VH.Missions.event('cuff')) { /* E next to a frozen or cornered runner: cuffs, not the car */ }
      else if (pl.onFoot && !pl.inShop) { const v = pl.stunT > 0 ? null : Game.nearestVehicle(pl.x, pl.y, Game.ENTER_R); if (v && !(v.rail && v.driver)) Game.enter(v); else if (!VH.Missions.event('use')) {} }
      else Game.exit();
    }
    if (I.consume('horn')) {
      if (!pl.onFoot) {
        const v = pl.vehicle;
        if (v.type === 'police' || v.type === 'paddy' || v.roofLight) { v.siren = !v.siren; Game.toast(v.siren ? 'SIREN ON' : 'SIREN OFF'); }
        else if (v.rail) { sfx(v.kind === 'tram' ? 'bell_tram' : 'whistle_train'); v.whistle = 1; }
        else sfx(v.def.gopher ? 'horn_gopher' : 'horn');
        for (const g of Game.gulls) if (Math.hypot(g.x - v.x, g.y - v.y) < 25 && g.state !== 'fly') g.takeOff(Math.atan2(g.y - v.y, g.x - v.x));
      } else { // on foot: shout
        if (Game.char === 'cop') { if (!VH.Missions.event('kevShout')) VH.Police.megaphone(); } // near a mission gopher, Kev calls it over instead
        else FX.text(pl.x, pl.y - 3, Game.char === 'grump' ? U.pick(['GET OFF MY LAWN!', 'TURN IT DOWN!', 'BACK IN MY DAY!']) : U.pick(['YEWW!', 'OI OI OI!', 'SCHOOLIES!']), '#fff');
        sfx('whoosh'); for (const g of Game.gulls) if (Math.hypot(g.x - pl.x, g.y - pl.y) < 14) g.takeOff(Math.atan2(g.y - pl.y, g.x - pl.x));
        VH.Missions.event('shout');
      }
    }
    if (!VH.Tackle.on && I.consume('action') && pl.onFoot && !VH.Street.grab && !pl.water) { if (!VH.Escort.key() && !(pl.inShop && VH.Shops.tryChat()) && !VH.Missions.event('use')) VH.Street.tag(); }
    if (I.consume('kick') && pl.onFoot && !(pl.stunT > 0) && !pl.water) Game.kick();
    VH.Tackle.update(dt);
    if (pl.aboard) Game.rideAboard(dt);
    else if (VH.Police.arrest || VH.Tackle.on) { pl.vx *= 0.5; pl.vy *= 0.5; if (pl.vehicle) { pl.vehicle.throttle = 0; pl.vehicle.brake = 1; pl.vehicle.steer = 0; } }
    else if (pl.onFoot) Game.updateFoot(dt);
    else {
      const v = pl.vehicle; const c = I.drive(v.ang, v.speed);
      if (v.rail) {
        let thr = c.throttle, brk = c.brake;
        if (I.stick.active && I.stick.mag > 0.2) { const dot = Math.cos(v.ang) * I.stick.x + Math.sin(v.ang) * I.stick.y; thr = dot > 0.2 ? dot : 0; brk = dot < -0.2 ? -dot : 0; }
        if (!I.stick.active) { const fwd = I.down('up') || (I.down('right') && Math.cos(v.ang) > 0.3) || (I.down('left') && Math.cos(v.ang) < -0.3); thr = fwd ? 1 : 0; brk = I.down('down') ? 1 : 0; }
        v.throttle = thr; v.brake = brk; v.boost = I.down('run');
      } else { v.throttle = c.throttle; v.brake = c.brake; v.steer = c.steer; v.handbrake = c.hb ? 1 : 0; v.boost = (I.down('run') && Game.upgrades.turbo && v.def.gopher) || (v.def.heli && I.down('run')) || v.boostT > 0;
        if (v.def.bike && I.consume('action') && v.z === 0) { v.vz = 4.2 + v.speed * 0.08; v.z = 0.01; sfx('hop'); } }
      pl.x = v.x; pl.y = v.y; pl.ang = v.ang; pl.vx = v.vx; pl.vy = v.vy;
      Game.stats.distance += v.speed * dt;
    }
    if (Game.alarm) { Game.alarm.t -= dt; if (Math.floor(Game.alarm.t * 3) !== Math.floor((Game.alarm.t + dt) * 3)) sfx('horn', { vol: 0.25, pitch: 1.2 }); if (Game.alarm.t <= 0) Game.alarm = null; }
    // AI
    const active = Game.vehicles.filter(v => !v.removed && (v.rail || v.missionDrive || Math.hypot(v.x - pl.x, v.y - pl.y) < 260)); // the tram and train run wherever you are (a runaway doesn't wait for you)
    for (const v of active) {
      const managed = v.police || v.backup || v.watch || v.scripted || v.delivery;
      if (v.ai && v.driver !== 'player' && !managed && v.ai.mode !== 'pursue' && v.ai.mode !== 'hoon') VH.AI.drive(v, dt, active);
      else if (!v.ai && v.driver !== 'player' && !v.rail && !managed && v.coastT > 0) { v.coastT -= dt; v.throttle = 0; v.brake = 0; v.handbrake = 0; v.steer = 0; } // bailed out of: it rolls on
      else if (!v.ai && v.driver !== 'player' && !v.rail && !managed) { v.throttle = 0; v.brake = v.speed > 0.2 ? 0.6 : 0; v.handbrake = v.parked || v.block ? 1 : 0; v.steer = 0; }
      if (v.rail && v.driver !== 'player' && !v.missionDrive) { v.throttle = 0; if (v.coastT > 0) { v.coastT -= dt; v.brake = 0; } else v.brake = 0.5; }
    }
    Game.updateCop(dt);
    for (const v of active) { v.update(dt); }
    for (const v of active) { VH.Collide.walls(v); VH.Props.collideVehicle(v); }
    VH.Collide.vehicles(active);
    // people dodge, gulls flap, whales cruise
    for (const p of Game.peds) if (Math.abs(p.x - pl.x) < 200 && Math.abs(p.y - pl.y) < 200) p.update(dt, active);
    const threats = [pl.onFoot ? { x: pl.x, y: pl.y, speed: 2 } : pl.vehicle, ...active.filter(v => v.speed > 2)];
    const chipCarrier = pl.chips > 0 && (pl.onFoot || (pl.vehicle && pl.vehicle.def.gopher)) ? pl : null;
    for (const g of Game.gulls) g.update(dt, threats, chipCarrier);
    for (const w of Game.whales) w.update(dt);
    Game.ghostWhale.update(dt);
    VH.Props.update(dt, pl.x, pl.y);
    FX.update(dt);
    // meter decay
    Game.quietT += dt;
    // the gossip cools when nobody's looking; with police about it only cools once they've lost sight of you, faster if you lie low
    const P = VH.Police;
    Game.meter = Math.max(0, Game.meter - dt * P.decay());
    // the ceiling: each level of the meter takes sustained mayhem to reach (it creeps up while you're at it, and
    // back down when you stop), so a minute of trouble is a car or two, not the whole station
    if (Game.char !== 'cop') { const busy = Game.quietT < 6 || (P.units.length && P.seenT < 2); Game.heatCeil = busy ? Math.min(5.2, (Game.heatCeil || Game.HEAT_START) + dt / Game.HEAT_LEVEL_SECS) : Math.max(Game.HEAT_START, Math.min(Game.heatCeil || Game.HEAT_START, Game.meter + 0.6)); }
    if (pl.stunT > 0) pl.stunT -= dt;
    if (Game.waypoint && Math.hypot(Game.waypoint.x - pl.x, Game.waypoint.y - pl.y) < 15) { Game.toast("YOU'VE ARRIVED: " + Game.waypoint.label, '#ffffff'); sfx('click'); Game.waypoint = null; }
    VH.Lockup.update(dt);
    for (const m of Game.msgs) m.t -= dt; Game.msgs = Game.msgs.filter(m => m.t > 0);
    // population upkeep
    Game.popT = (Game.popT || 0) - dt; if (Game.popT <= 0) { Game.popT = 0.5; Game.populate(false); }
    VH.Missions.update(dt); Game.offerCar(dt); if (Game.char === 'cop') VH.Escort.update(dt); if (Game.state === 'play') { VH.Acts.update(dt); VH.Street.update(dt); VH.Shops.update(dt); }
    Game.audio(dt);
  };
  // a proper boot: the nearest bin, cone, esky, chair or footy in front of you goes flying (never people or animals)
  Game.kick = function () {
    const pl = Game.player; let best = null, bd = 2.2; const fx = Math.cos(pl.ang), fy = Math.sin(pl.ang);
    VH.Props.near(pl.x, pl.y, 2.5, p => { if (!VH.Props.KICKABLE.includes(p.k) || p.fly) return; const dx = p.x - pl.x, dy = p.y - pl.y, d = Math.hypot(dx, dy); if (d > 2.2) return; const front = (dx * fx + dy * fy) / (d || 1); const score = d - front; if (front > -0.2 && score < bd) { bd = score; best = p; } });
    pl.kickT = 0.25;
    if (!best) { sfx('whoosh', { pitch: 1.6, vol: 0.4 }); return; }
    const power = 9 + Math.hypot(pl.vx, pl.vy) * 0.5; const to = Math.atan2(best.y - pl.y, best.x - pl.x); const dir = Math.atan2(Math.sin(to) + fy, Math.cos(to) + fx);
    VH.Props.kick(best, dir, power, 'player');
    FX.text(best.x, best.y - 3, best.k === PK.ball ? U.pick(['SPECKY!', 'BOOT!', 'TORPEDO!', 'BANANA!']) : U.pick(['BOOT!', 'HOOF!', 'THWACK!']), '#ffd23a');
    if (best.k === PK.ball) Game.addMeter(0.02); else Game.addMeter(0.06);
    VH.Missions.event('kick', best);
  };
  Game.updateFoot = function (dt) {
    // on a touch screen, pushing the stick past RUN_AT of its radius runs (the outer band of its ring); inside that, the
    // push sets the pace up to a jog
    const pl = Game.player; const stickRun = I.stick.active && I.stick.mag > Game.RUN_AT; const run = I.down('run') || stickRun;
    const pace = I.stick.active ? (stickRun ? 1 : Math.min(1, I.stick.mag / Game.RUN_AT)) : 1;
    let mx, my;
    // mid tuck-and-roll: no control, just the roll (through the same walking code, so never through a wall)
    if (pl.rollT > 0) {
      pl.rollT -= dt; pl.spin = (pl.spin || 0) + dt * 15; VH.Nav.move(pl, pl.vx * dt, pl.vy * dt, 0.4, { swim: true }); const f = Math.exp(-2.2 * dt); pl.vx *= f; pl.vy *= f;
      if (Math.random() < 0.5) FX.dust(pl.x, pl.y, '#c8bfa0', 1); if (pl.rollT <= 0) { pl.vx *= 0.2; pl.vy *= 0.2; sfx('thud', { vol: 0.4 }); }
      pl.water = Game.waterAt(pl.x, pl.y); pl.frame = 0; return;
    }
    if (Game.walkMode === 'screen') { [mx, my] = I.moveVec(); if (I.stick.active) { const m = Math.hypot(mx, my); if (m > 0) { mx = mx / m * pace; my = my / m * pace; } } }
    else {
      // "like a car" (the default): forward / back along your facing, left / right turn on the spot, snappily
      let fwd = 0;
      if (I.stick.active && I.stick.mag > 0.15) { const da = U.angDiff(pl.ang, Math.atan2(I.stick.y, I.stick.x)); pl.ang += U.clamp(da, -11 * dt, 11 * dt); fwd = pace * (Math.abs(da) > 1.6 ? 0.25 : 1); }
      else { pl.ang += ((I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0)) * 5.2 * dt; fwd = I.down('up') ? 1 : I.down('down') ? -0.5 : 0; }
      mx = Math.cos(pl.ang) * fwd; my = Math.sin(pl.ang) * fwd;
    }
    // a brisk jog by default, a proper sprint with Shift / BOOST; quick to start and stop
    // in the water: wading in the shallows is about 60% of your jog; out of your depth it's a slow swim (about 27%),
    // and Shift gives a short burst of strokes that costs breath, then a moment before the next
    const wet = pl.water = Game.waterAt(pl.x, pl.y); let sprinting = run && (mx * Math.cos(pl.ang) + my * Math.sin(pl.ang) > 0 || Game.walkMode === 'screen');
    if (wet === 2) { pl.burstT = (pl.burstT || 0) - dt; if (sprinting && pl.burstT <= -Game.SWIM_REST) { pl.burstT = Game.SWIM_BURST; pl.breath = Math.max(0, (pl.breath ?? 1) - Game.SWIM_BURST_COST); } sprinting = pl.burstT > 0; } else pl.burstT = 0;
    const land = (pl.boostT > 0 ? 1.3 : 1) * (sprinting ? Game.SPRINT : Game.JOG);
    const escorting = VH.Escort.leading ? (sprinting ? 0.62 : 0.5) : 1; // walking a prisoner: a walk, not a run
    const sp = pl.stunT > 0 || VH.Street.grab ? 0 : escorting < 1 && !wet ? Game.JOG * escorting : wet === 2 ? (sprinting ? Game.SWIM_FAST : Game.SWIM) : wet === 1 ? Game.JOG * (sprinting ? 0.68 : 0.6) : land;
    // dizzy after a roll: sluggish, drifting controls for a second or three
    let k = Math.min(1, dt * (mx || my ? 22 : 30));
    if (pl.dizzyT > 0) { pl.dizzyT -= dt; const dz = U.clamp(pl.dizzyT / (pl.dizzyMax || 1), 0, 1); const wob = Math.sin(Game.t * 3.1) * 0.9 * dz; const c = Math.cos(wob), s2 = Math.sin(wob); [mx, my] = [mx * c - my * s2, mx * s2 + my * c]; mx += Math.sin(Game.t * 1.7) * 0.35 * dz; my += Math.cos(Game.t * 1.3) * 0.35 * dz; k = Math.min(1, dt * 4); }
    pl.vx = U.lerp(pl.vx, mx * sp, k); pl.vy = U.lerp(pl.vy, my * sp, k);
    // the same walking code as everyone else (walls, trees, cars), except the player can wade and swim
    const shopB = pl.inShop && pl.inShop.b;
    VH.Nav.move(pl, pl.vx * dt, pl.vy * dt, 0.4, { swim: true, skipB: shopB }); const bumped = pl.bumped;
    const spd = Math.hypot(pl.vx, pl.vy); if (spd > 0.3) { if (Game.walkMode === 'screen') pl.ang = Math.atan2(pl.vy, pl.vx); pl.anim += spd * dt * 2.2; }
    pl.running = sprinting && spd > Game.JOG; if (pl.running && stickRun && !wet && Math.random() < dt * 12) FX.dust(pl.x - Math.cos(pl.ang) * 0.4, pl.y - Math.sin(pl.ang) * 0.4, '#c8bfa0', 1); // quick footfalls
    Game.stats.distance += spd * dt; Game.hintMoved = (Game.hintMoved || 0) + spd * dt; if (run && spd > 10) Game.hintSprint = (Game.hintSprint || 0) + dt;
    // walking into a parked vehicle's driver's door (the right-hand side) gets you in, but only on purpose: at a walk
    // (not sprinting), facing the door and pushing into it for 0.4 s. Strolling or running past parked cars just
    // brushes them; E (the "E · BORROW" prompt) is the main way in.
    if (bumped && (mx || my) && !sprinting && Math.abs(U.angDiff(pl.ang, Math.atan2(bumped.y - pl.y, bumped.x - pl.x))) < 0.7 && !bumped.rail && bumped.speed < 1 && !bumped.police && !bumped.scripted && !VH.Street.grab) {
      const v = bumped, fx = Math.cos(v.ang), fy = Math.sin(v.ang); const lat = (pl.x - v.x) * -fy + (pl.y - v.y) * fx, along = (pl.x - v.x) * fx + (pl.y - v.y) * fy;
      const push = mx * (v.x - pl.x) + my * (v.y - pl.y) > 0;
      const door = v.def.gopher || v.def.bike || (lat > 0.3 && along > -v.def.L * 0.25);
      Game.bumpT = push && door ? (Game.bumpT || 0) + dt : 0;
      if (Game.bumpT > 0.4) { Game.bumpT = 0; Game.enter(v); return; }
    } else Game.bumpT = 0;
    // kick small things over
    if (spd > 3) VH.Props.near(pl.x, pl.y, 0.8, p => { if (p.up && Math.hypot(p.x - pl.x, p.y - pl.y) < p.r + 0.4 && [PK.binR, PK.binY, PK.binG, PK.bin, PK.chair, PK.cone, PK.esky].includes(p.k)) VH.Props.topple(p, pl.ang, spd, 'player'); });
    pl.x = U.clamp(pl.x, 2, W.width - 2); pl.y = U.clamp(pl.y, 2, W.height - 2);
    Game.updateWater(dt, sprinting);
    pl.frame = VH.stride(pl, dt);
  };
  // aboard a runaway (on the tram's step, the train's footplate): carried along while the takeover plays out
  Game.rideAboard = function () {
    const pl = Game.player, v = pl.aboard; if (!v || v.removed) { pl.aboard = null; return; }
    const p = v.parts ? (v.parts.find(q => !q.horse) || v) : v; const a = (p.a != null ? p.a : v.ang) + Math.PI / 2;
    pl.x = p.x + Math.cos(a) * 1.6; pl.y = p.y + Math.sin(a) * 1.6; pl.ang = p.a != null ? p.a : v.ang; pl.vx = v.vx; pl.vy = v.vy;
  };
  // ---------- water: wading, swimming, your breath, and the wave that dumps you back on the beach ----------
  Game.SWIM = Game.JOG * 0.27; Game.SWIM_FAST = Game.JOG * 0.42; Game.BREATH = 22; // m/s; seconds of breath out of your depth
  Game.SWIM_BURST = 1.1; Game.SWIM_REST = 1.6; Game.SWIM_BURST_COST = 0.06; // a Shift burst: how long, the rest after it, the breath it costs
  // 0 dry, 1 the shallows (wading), 2 out of your depth (swimming)
  Game.waterAt = function (x, y) {
    if (!W.isWet(x, y)) return 0;
    if (W.groundAt(x, y) === W.GC.SEA) return W.seaDist(x, y) > -5 ? 1 : 2;
    for (let a = 0; a < U.TAU; a += Math.PI / 4) if (!W.isWet(x + Math.cos(a) * 3, y + Math.sin(a) * 3)) return 1; // lakes and rivers: deep unless the bank is close
    return 2;
  };
  Game.inWater = a => !!a && Game.waterAt(a.x, a.y) > 0;
  // Nobody is cuffed, tackled or arrested in the water, either way round. Other rules (boarding from a boat, say)
  // can be added with Game.arrestRules.push(actor => true | false | null); the first non-null answer wins.
  Game.arrestRules = [];
  Game.arrestAllowed = function (actor) {
    for (const f of Game.arrestRules) { const r = f(actor); if (r != null) return r; }
    const pl = Game.player; const a = actor === 'player' ? pl : actor;
    if (pl && pl.onFoot && Game.inWater(pl)) return false; // the player's in the water: no arrests by them or of them
    return !Game.inWater(a);
  };
  Game.updateWater = function (dt, sprinting) {
    const pl = Game.player; if (pl.breath == null) pl.breath = 1;
    const wet = pl.water || 0; const spd = Math.hypot(pl.vx, pl.vy);
    if (wet === 2) {
      pl.breath = Math.max(0, pl.breath - dt / Game.BREATH);
      pl.strokePh = ((pl.strokePh || 0) + dt * (1.5 + spd * 0.6)) % 4;
      pl.wakeT = (pl.wakeT || 0) - dt;
      if (pl.wakeT <= 0 && spd > 0.4) { pl.wakeT = 0.16; FX.wake(pl.x - Math.cos(pl.ang) * 0.6, pl.y - Math.sin(pl.ang) * 0.6, pl.ang); }
      if (Math.random() < dt * 3) FX.add({ type: 'drop', x: pl.x + Math.cos(pl.ang) * 0.9, y: pl.y + Math.sin(pl.ang) * 0.9, vx: U.rand(-1, 1), vy: U.rand(-1, 1), z: 0.1, vz: U.rand(1.5, 3), grav: 14, life: 0.5, col: '#e8f6ff', size: 1 });
      if (!pl.swimSaid) { pl.swimSaid = true; Game.toast('OUT OF YOUR DEPTH: SWIMMING. WATCH YOUR BREATH', '#9fd4ec'); sfx('splash', { vol: 0.4 }); }
      if (pl.breath <= 0) Game.dumpedByWave();
    } else {
      pl.breath = Math.min(1, pl.breath + dt * 0.5); pl.swimSaid = false;
      if (wet === 1) { pl.wakeT = (pl.wakeT || 0) - dt; if (pl.wakeT <= 0 && spd > 0.5) { pl.wakeT = 0.35; FX.ring(pl.x, pl.y, 'rgba(232,246,255,0.8)', 2.2, 0.7); if (Math.random() < 0.4) sfx('splash', { vol: 0.08, pitch: 1.6 }); } }
    }
  };
  // out of breath: a wave picks you up and dumps you on the nearest beach. Nobody drowns.
  Game.dumpedByWave = function () {
    const pl = Game.player; let best = null, any = null;
    for (let r = 4; r < 400 && !best; r += 3) for (let a = 0; a < U.TAU; a += 0.15) {
      const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r; if (!VH.Nav.walkable(x, y) || W.isWet(x, y)) continue;
      if (!any) any = { x, y }; if (W.groundAt(x, y) === W.GC.SAND) { best = { x, y }; break; }
      if (any && r > Math.hypot(any.x - pl.x, any.y - pl.y) + 60) { best = any; break; }
    }
    const to = best || any; FX.splash(pl.x, pl.y, 30);
    if (to) { pl.x = to.x; pl.y = to.y; }
    pl.vx = pl.vy = 0; pl.breath = 1; pl.stunT = 1.4; pl.water = 0; FX.splash(pl.x, pl.y, 24); FX.flash = 0.35; FX.kick(0.4);
    sfx('splash'); Game.callout('DUMPED BY A WAVE', '#9fd4ec'); Game.toast('YOU COUGH UP HALF THE BAY. NO HARM DONE.', '#9fd4ec');
  };
  Game.audio = function (dt) {
    if (!window.SFX) return;
    const pl = Game.player;
    if (pl.onFoot) SFX.engine({ speed: 0, throttle: 0, kind: 'foot' });
    else { const v = pl.vehicle; const kind = v.rail ? v.kind : v.def.heli ? 'truck' : v.def.bike ? (v.def.electric ? 'gopher' : 'foot') : v.def.gopher ? 'gopher' : v.type === 'truck' ? 'truck' : v.type === 'police' ? 'police' : v.type === 'ute' ? 'ute' : 'car'; SFX.engine({ speed: U.clamp(v.speed / (v.def.maxV || 16), 0, 1), throttle: v.throttle || 0, kind }); SFX.skid(v.rail ? 0 : U.clamp(v.skid, 0, 1)); }
    if (pl.onFoot) SFX.skid(0);
    const P = VH.Police; const copNear = P.units.some(v => Math.hypot(v.x - pl.x, v.y - pl.y) < 160) || P.blocks.some(b => Math.hypot(b.x - pl.x, b.y - pl.y) < 120) || P.backup.length > 0;
    const mySiren = !pl.onFoot && pl.vehicle.siren;
    SFX.siren(!!(copNear || mySiren));
    SFX.music(P.units.length && P.seenT < 10 ? 'chase' : 'night');
    Game.ambT = (Game.ambT || 0) - dt;
    if (Game.ambT <= 0) { Game.ambT = 0.3; const w = Game.places.warland; const sd = W.seaDist(pl.x, pl.y); SFX.ambience({ sea: U.clamp(1 - Math.max(0, sd) / 140, 0, 1) * 0.8, wind: Math.hypot(pl.x - Game.places.bluff.x, pl.y - Game.places.bluff.y) < 400 ? 0.6 : 0.15, party: Game.partyOn ? U.clamp(1 - Math.hypot(pl.x - w.x, pl.y - w.y) / 320, 0, 1) : 0 }); }
  };

  // ---------- rendering ----------
  Game.render = function (ctx, S, scale) {
    const vw = ctx.canvas.width, vh = ctx.canvas.height; const pl = Game.player;
    Game.viewHalf = [vw / 2 / S, vh / 2 / S];
    // camera with look-ahead
    const lead = pl.onFoot ? 0.4 : 1.05; const lx = U.clamp(pl.vx * lead, -vw / S * 0.32, vw / S * 0.32), ly = U.clamp(pl.vy * lead, -vh / S * 0.32, vh / S * 0.32);
    const k = 1 - Math.exp(-4 * (Game.frameDt || 0.016));
    Game.cam.x += (pl.x + lx - Game.cam.x) * k; Game.cam.y += (pl.y + ly - Game.cam.y) * k;
    if (Math.hypot(pl.x - Game.cam.x, pl.y - Game.cam.y) > 150) { Game.cam.x = pl.x; Game.cam.y = pl.y; }
    const dz = pl.dizzyT > 0 ? U.clamp(pl.dizzyT / (pl.dizzyMax || 1), 0, 1) : 0; // a little wobble while you're dizzy
    let left = Game.cam.x - vw / 2 / S + FX.shakeX / S + Math.sin(Game.t * 4.3) * dz * 0.8, top = Game.cam.y - vh / 2 / S + FX.shakeY / S + Math.cos(Game.t * 3.7) * dz * 0.6;
    left = Math.round(left * S) / S; top = Math.round(top * S) / S;
    Game.view = { left, top, S };
    R.pump(Game.cam.x, Game.cam.y, 7);
    R.draw(ctx, left, top, vw, vh);
    const t = Game.t; const hour = Game.hour; const night = L.lightsOn(hour) > 0.3;
    // surf foam + twinkles along the shore
    Game.shoreGrid.query(left - 4, top - 4, left + vw / S + 4, top + vh / S + 4, s => {
      const a = 0.5 + 0.5 * Math.sin(t * 1.7 + s[2] * 20);
      if (a > 0.55) { ctx.fillStyle = `rgba(240,250,255,${(a - 0.55) * 1.6})`; const sx = Math.round((s[0] - left) * S), sy = Math.round((s[1] - top) * S); ctx.fillRect(sx - 2, sy, 4, 1); if (a > 0.85) ctx.fillRect(sx - 1, sy - 1, 2, 1); }
    });
    for (const w of Game.whales) w.draw(ctx, left, top, S);
    VH.Yards.draw(ctx, left, top, S); // lawns, patios and decks, garden beds (and any backyard party)
    VH.Props.draw(ctx, left, top, S, vw, vh);
    VH.Acts.drawGround(ctx, left, top, S); VH.Street.drawGround(ctx, left, top, S); VH.Shops.draw(ctx, left, top, S);
    for (const h of Game.helipads) { const sx = Math.round((h.x - left) * S), sy = Math.round((h.y - top) * S); if (sx < -60 || sy < -60 || sx > ctx.canvas.width + 60 || sy > ctx.canvas.height + 60) continue; ctx.strokeStyle = '#f2f2f0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 7 * S, 0, U.TAU); ctx.stroke(); ctx.fillStyle = h.kind === 'rescue' ? '#d6302a' : '#ffd23a'; U.text(ctx, 'H', sx - 5 * S / 4, sy - 7 * S / 4 * 1.4, { scale: Math.max(1, S / 2 | 0), color: h.kind === 'rescue' ? '#ff6a5a' : '#ffd23a', shadow: false }); }
    VH.Police.drawGround(ctx, left, top, S);
    VH.Lockup.draw(ctx, left, top, S, t);
    // the player on foot and pedestrians
    for (const p of Game.peds) p.draw(ctx, left, top, S, night);
    VH.Police.drawPeople(ctx, left, top, S); VH.Escort.draw(ctx, left, top, S);
    if (pl.onFoot && !Game.demo && !pl.hidden) Game.drawPlayer(ctx, left, top, S);
    FX.draw(ctx, left, top, S, 'high');
    const vis = Game.vehicles.filter(v => !v.removed);
    vis.sort((a, b) => (a.rail ? 1 : 0) - (b.rail ? 1 : 0) + (a.z || 0) * 0.01 - (b.z || 0) * 0.01);
    for (const v of vis) v.draw(ctx, left, top, S, night);
    // gopher riders (heads)
    for (const v of vis) if (v.def && (v.def.gopher && (v.ai || v.driver || v.watch) || v.def.bike && v.driver)) { const sx = (v.x - left) * S, sy = (v.y - top) * S; const isP = v.driver === 'player'; const c = isP ? VH.Shops.look(Game.char) : null; VH.drawRot(ctx, SP.person(c ? c.shirt : '#c9b48a', c ? c.hair : '#e8e8e8', 0, { hat: c ? c.hat : 'bucket', sunnies: c && c.sunnies }), sx - Math.cos(v.ang) * 1, sy - Math.sin(v.ang) * 1, v.ang, 1, false, 0.7); }
    for (const g of Game.gulls) g.draw(ctx, left, top, S);
    FX.draw(ctx, left, top, S, 'low');
    // midnight on the Bluff: the ghost whale swims through the air
    const midnight = hour >= 23.6 || hour < 0.9; const bluffD = Math.hypot(pl.x - Game.places.bluff.x, pl.y - Game.places.bluff.y);
    if ((midnight && bluffD < 500) || Game.forceGhost) Game.ghostWhale.draw(ctx, left, top, S);
    // lighting
    const { sources, glows } = Game.collectLights(left, top, vw / S, vh / S, hour);
    L.apply(ctx, left, top, S, hour, sources, glows);
    // moonlight glints on the water at night
    if (night) Game.drawGlints(ctx, left, top, S, vw, vh, t);
    VH.Lockup.drawBeam(ctx, left, top, S, hour); VH.Street.drawCams(ctx, left, top, S); VH.Missions.drawTorch && VH.Missions.drawTorch(ctx, left, top, S);
    Game.drawSpeedLines(ctx, vw, vh);
    VH.Police.drawAir(ctx, left, top, S, night);
    const fogSpecial = (midnight && bluffD < 700 ? 0.85 : 0) + (Game.forceGhost ? 0.6 : 0);
    const nearSea = U.clamp(1 - Math.max(0, W.seaDist(Game.cam.x, Game.cam.y)) / 500, 0.25, 1);
    L.fog(ctx, left, top, S, L.fogLevel(hour, fogSpecial) * nearSea, t, midnight ? '#3a6a7a' : null);
    if ((midnight && bluffD < 500) || Game.forceGhost) { ctx.globalCompositeOperation = 'lighter'; Game.ghostWhale.draw(ctx, left, top, S); ctx.globalCompositeOperation = 'source-over'; }
    // mission markers and floating text sit above the lighting
    VH.Shops.drawMarkers(ctx, left, top, S); VH.Missions.drawWorld(ctx, left, top, S, scale);
    const ct = VH.Missions.chaseTarget && VH.Missions.chaseTarget(); if (ct && !ct.rail && !ct.removed) Game.drawDamageBar(ctx, ct, left, top, S);
    // your car (light blue) and the waypoint (white) when they're in view
    if (!Game.demo) {
      for (const m of Game.myMarkers()) { const sx = Math.round((m.x - left) * S), sy = Math.round((m.y - top) * S); if (sx < -30 || sy < -30 || sx > vw + 30 || sy > vh + 30) continue; const b = Math.abs(Math.sin(Game.t * 3)) * 3; ctx.fillStyle = '#120c24'; ctx.fillRect(sx - 3, sy - 19 - b, 7, 5); ctx.fillStyle = Game.MINE_COL; ctx.fillRect(sx - 2, sy - 18 - b, 5, 3); U.text(ctx, m.label, sx, sy - 29 - b, { align: 'center', color: Game.MINE_COL }); }
      const wp = Game.waypoint; if (wp) { const sx = (wp.x - left) * S, sy = (wp.y - top) * S; if (sx > -30 && sy > -30 && sx < vw + 30 && sy < vh + 30) { VH.UI.pin(ctx, sx, sy, 2); U.text(ctx, wp.label, sx, sy - 24, { align: 'center', color: '#fff' }); } }
    }
    FX.drawTexts(ctx, left, top, S, 1);
    // "E · borrow the ute" floating over the vehicle you're standing next to
    if (Game.state === 'play' && pl.onFoot && !pl.hidden && VH.UI && !VH.Missions.torch() && !VH.Tackle.on && !VH.Police.arrest && !pl.inShop) {
      const v = Game.nearestVehicle(pl.x, pl.y, Game.ENTER_R);
      if (v) { const str = VH.UI.enterPrompt(v); const tw = U.textWidth(str, 1); const sx = Math.round((v.x - left) * S), sy = Math.round((v.y - top) * S) - 22; ctx.fillStyle = 'rgba(18,12,36,0.82)'; ctx.fillRect(sx - tw / 2 - 3, sy - 3, tw + 6, 13); ctx.fillStyle = '#38e0c8'; ctx.fillRect(sx - tw / 2 - 3, sy - 3, tw + 6, 1); U.text(ctx, str, sx, sy, { align: 'center', color: '#fff' }); }
    }
    for (const p of Game.peds) if (p.bubbleT > 0) { const sx = (p.x - left) * S, sy = (p.y - top) * S - 10; U.text(ctx, p.bubble, sx, sy, { align: 'center', color: '#fff' }); }
    if (FX.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${FX.flash * 0.6})`; ctx.fillRect(0, 0, vw, vh); }
  };
  // a damage bar over the car you're chasing, with its stage (dented, smoking, sparking, limping, disabled)
  Game.dmgCol = d => d >= 0.75 ? '#ff6a5a' : d >= 0.35 ? '#ffd23a' : '#9be15d';
  Game.drawDamageBar = function (ctx, v, left, top, S) {
    const sx = Math.round((v.x - left) * S), sy = Math.round((v.y - top) * S) - Math.round(v.def.L * S / 2) - 10; const bw = 20;
    if (sx < -20 || sy < -20 || sx > ctx.canvas.width + 20 || sy > ctx.canvas.height + 20) return;
    ctx.fillStyle = '#120c24'; ctx.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, 4); ctx.fillStyle = '#3c2f6b'; ctx.fillRect(sx - bw / 2, sy, bw, 2);
    ctx.fillStyle = Game.dmgCol(v.damage); ctx.fillRect(sx - bw / 2, sy, Math.round(bw * (1 - v.damage)), 2);
    const name = VH.DAMAGE.STAGES[VH.DAMAGE.stage(v.damage)][1]; if (name) U.text(ctx, name, sx, sy - 9, { align: 'center', color: Game.dmgCol(v.damage) });
  };
  // speed lines streaming past at high speed
  Game.drawSpeedLines = function (ctx, vw, vh) {
    const pl = Game.player; const v = pl.vehicle; if (!v || v.rail) return; const spd = v.speed; if (spd < 30) return;
    const k = U.clamp((spd - 30) / 25, 0, 1); const a = Math.atan2(v.vy, v.vx); const cx = Math.cos(a), cy = Math.sin(a);
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.25})`; ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const h1 = U.hash(i, 3, 77), h2 = U.hash(i, 5, 78); const ph = (Game.t * (1.5 + h2) + h1) % 1;
      const r = Math.max(vw, vh) * (0.25 + 0.5 * h2); const ang = h1 * U.TAU; const x = vw / 2 + Math.cos(ang) * r, y = vh / 2 + Math.sin(ang) * r;
      const len = 10 + k * 40; const ox = -cx * ph * 120, oy = -cy * ph * 120;
      ctx.beginPath(); ctx.moveTo(Math.round(x + ox), Math.round(y + oy)); ctx.lineTo(Math.round(x + ox - cx * len), Math.round(y + oy - cy * len)); ctx.stroke();
    }
  };
  // moonlight glints: anchored to 5 m cells of sea, drifting slowly with the swell (east-south-east)
  Game.drawGlints = function (ctx, left, top, S, vw, vh, t) {
    const C = 5; ctx.fillStyle = 'rgba(220,235,255,0.8)';
    for (let cy = Math.floor(top / C) - 1; cy <= Math.floor((top + vh / S) / C); cy++) for (let cx = Math.floor(left / C) - 1; cx <= Math.floor((left + vw / S) / C); cx++) {
      if (U.hash(cx, cy, 9) > 0.1) continue;
      const ph = U.hash(cx, cy, 10); if (Math.sin(t * 1.3 + ph * U.TAU) < 0.55) continue;
      const drift = (t * 0.5 + ph * C) % C;
      const gx = cx * C + U.hash(cx, cy, 3) * C + drift, gy = cy * C + U.hash(cx, cy, 4) * C + drift * 0.3;
      if (W.groundAt(gx, gy) !== W.GC.SEA) continue;
      ctx.fillRect(Math.round((gx - left) * S), Math.round((gy - top) * S), 2, 1);
    }
  };
  Game.drawPlayer = function (ctx, left, top, S) {
    const pl = Game.player; const c = VH.Shops.look(Game.char || 'roam');
    const sx = (pl.x - left) * S, sy = (pl.y - top) * S; const spd = Math.hypot(pl.vx, pl.vy);
    const fr = pl.frame || 0; const wet = pl.water || 0;
    if (!wet) ctx.fillStyle = 'rgba(20,20,45,0.35)', ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 5, 5);
    ctx.strokeStyle = `rgba(255,210,58,${0.45 + Math.sin(Game.t * 6) * 0.25})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(Math.round(sx) + 0.5, Math.round(sy) + 0.5, 6, 5, 0, 0, U.TAU); ctx.stroke();
    // tackled: both on the ground, the officer on top
    const down = VH.Tackle.on && VH.Tackle.on.mode !== 'hold';
    if (wet === 2) {
      // swimming: head and shoulders, arms in a crawl, a ring of water round you; the breath bar over your head
      ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), 5 + Math.sin(Game.t * 5) * 0.6, 4, pl.ang, 0, U.TAU); ctx.stroke();
      VH.drawRot(ctx, SP.swimmer(c.shirt, c.hair, Math.floor(pl.strokePh || 0), c.hat), sx, sy, pl.ang);
    } else {
      VH.drawRot(ctx, SP.person(c.shirt, c.hair, down || pl.rollT > 0 ? 0 : fr, { hat: c.hat, sunnies: c.sunnies, wade: wet === 1 }), sx, sy, pl.rollT > 0 ? pl.ang + pl.spin : down ? pl.ang + Math.PI / 2 : pl.ang);
      // wading: the water line across your middle
      if (wet === 1) { ctx.strokeStyle = 'rgba(200,232,255,0.75)'; ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), 6, 4.5, pl.ang, 0, U.TAU); ctx.stroke(); }
    }
    if (pl.dizzyT > 0) for (let i = 0; i < 3; i++) { const a = Game.t * 6 + i * 2.1; ctx.fillStyle = i % 2 ? '#ffe94a' : '#fff'; ctx.fillRect(Math.round(sx + Math.cos(a) * 6), Math.round(sy - 9 + Math.sin(a) * 2.5), 2, 2); } // dizzy stars
    if (pl.breath != null && pl.breath < 0.999 && wet) { const bw = 14, by = Math.round(sy) - 15; ctx.fillStyle = '#120c24'; ctx.fillRect(Math.round(sx) - bw / 2 - 1, by - 1, bw + 2, 4); ctx.fillStyle = pl.breath < 0.3 && Math.floor(Game.t * 6) % 2 ? '#ff6a5a' : '#9fd4ec'; ctx.fillRect(Math.round(sx) - bw / 2, by, Math.round(bw * pl.breath), 2); }
    if (pl.chips > 0) { ctx.fillStyle = '#f4f0e0'; ctx.fillRect(Math.round(sx + Math.cos(pl.ang) * 4) - 1, Math.round(sy + Math.sin(pl.ang) * 4) - 1, 3, 3); ctx.fillStyle = '#f2c94a'; ctx.fillRect(Math.round(sx + Math.cos(pl.ang) * 4), Math.round(sy + Math.sin(pl.ang) * 4) - 1, 1, 2); }
    if (VH.Police.arrest) { ctx.fillStyle = '#e0b48a'; ctx.fillRect(Math.round(sx) - 4, Math.round(sy) - 7, 2, 3); ctx.fillRect(Math.round(sx) + 3, Math.round(sy) - 7, 2, 3); }
    // a little marker so you can find yourself
    const b = Math.sin(Game.t * 5) > 0 ? 0 : 1; ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 9 - b, 3, 1); ctx.fillRect(Math.round(sx), Math.round(sy) - 8 - b, 1, 1);
  };
  Game.collectLights = function (left, top, vw, vh, hour) {
    const sources = [], glows = []; const x1 = left + vw, y1 = top + vh; const pad = 20;
    VH.Props.lampsNear(left - pad, top - pad, x1 + pad, y1 + pad, p => {
      if (p.k === SP.PK.lamp) { const hx = p.x + Math.cos(p.a) * 1.6, hy = p.y + Math.sin(p.a) * 1.6; sources.push({ x: hx, y: hy, r: 13, col: '#ffd9a0', a: 0.85 }); glows.push({ x: hx, y: hy, r: 1.2, col: '#fff1c8', a: 0.9 }); }
      else { const ph = Math.floor((Game.t + p.x * 0.01) / 6) % 3; const col = ['#ff4040', '#ffc040', '#40ff70'][ph]; glows.push({ x: p.x, y: p.y, r: 1.4, col, a: 0.9 }); sources.push({ x: p.x, y: p.y, r: 4, col, a: 0.5 }); }
    });
    VH.Yards.lights(glows);
    for (const o of VH.Police.officers) if (o.state === 'search' && o.torch != null) sources.push({ x: o.x, y: o.y, r: 0, col: '#fff3c0', a: 1, cone: { ang: o.torch, len: 14 } }); // a searching officer's torch
    W.doorGrid.query(left - pad, top - pad, x1 + pad, y1 + pad, d => { if (d.on || d.lit > 0) { sources.push({ x: d.x, y: d.y, r: d.lit > 0 ? 9 : 5.5, col: '#ffcf80', a: d.lit > 0 ? 1 : 0.6 }); if (d.lit > 0) glows.push({ x: d.x, y: d.y, r: 1, col: '#fff', a: 1 }); } });
    // shop windows glow
    W.buildingGrid.query(left - pad, top - pad, x1 + pad, y1 + pad, b => { if (b.k !== 'house' && (b.seed % 3 === 0)) sources.push({ x: b.cx, y: b.bb[3] + 1, r: Math.min(14, (b.bb[2] - b.bb[0]) * 0.5 + 4), col: '#ffd890', a: 0.45 }); });
    for (const v of Game.vehicles) {
      if (v.removed || v.x < left - 40 || v.x > x1 + 40 || v.y < top - 40 || v.y > y1 + 40) continue;
      const parked = v.parked && v.driver !== 'player';
      if (v.rail) { const p = v.parts[0]; const len = v.kind === 'train' ? 26 : 12; sources.push({ x: p.x + Math.cos(p.a) * 2, y: p.y + Math.sin(p.a) * 2, r: 0, col: '#fff4c8', a: 0.85, cone: { ang: p.a, len } }); if (v.kind === 'tram') for (const q of v.parts) sources.push({ x: q.x, y: q.y, r: 6, col: '#ffcf80', a: 0.55 }); else glows.push({ x: p.x + Math.cos(p.a) * 5, y: p.y + Math.sin(p.a) * 5, r: 1.5, col: '#fff4c8', a: 1 }); continue; }
      if (v.def.heli) { if (Math.floor(Game.t * 2) % 2) glows.push({ x: v.x, y: v.y, r: 1.2, col: '#ff3030', a: 1 }); if (v.driver === 'player' && v.z > 1) sources.push({ x: v.x + v.z * 0.4, y: v.y + v.z * 0.6, r: 8, col: '#f4f8ff', a: 0.8 }); continue; }
      if (v.dead && !v.def.bike && !v.def.gopher && Math.floor(Game.t * 2.5) % 2) { const fx = Math.cos(v.ang), fy = Math.sin(v.ang), rx = -fy, ry = fx, L2 = v.def.L / 2 - 0.3, W2 = v.def.W / 2 - 0.2; for (const [o, l] of [[L2, W2], [L2, -W2], [-L2, W2], [-L2, -W2]]) glows.push({ x: v.x + fx * o + rx * l, y: v.y + fy * o + ry * l, r: 0.8, col: '#ffa020', a: 1 }); } // hazard lights on a wreck
      if (parked || v.dead) continue;
      const fx = Math.cos(v.ang), fy = Math.sin(v.ang); const L2 = v.def.L / 2;
      sources.push({ x: v.x + fx * L2, y: v.y + fy * L2, r: 0, col: '#fff2c0', a: v.def.gopher ? 0.4 : 0.8, cone: { ang: v.ang, len: v.def.gopher ? 6 : 18 } });
      glows.push({ x: v.x - fx * L2, y: v.y - fy * L2, r: 0.9, col: '#ff3030', a: v.brake > 0 ? 1 : 0.55 });
      if (v.siren && !v.block) { const ph = Math.floor(Game.t * 8) % 2; sources.push({ x: v.x, y: v.y, r: 11, col: ph ? '#ff3030' : '#3070ff', a: 0.9 }); glows.push({ x: v.x, y: v.y, r: 1.5, col: ph ? '#ff6060' : '#6090ff', a: 1 }); }
    }
    VH.Lockup.lights(sources, glows, Game.t); VH.Police.lights(sources, glows);
    if (Game.player.inShop) { const b = Game.player.inShop.b; sources.push({ x: b.cx, y: b.cy, r: 16, col: '#fff4d8', a: 1 }); }
    const tr = VH.Missions.torch && VH.Missions.torch(); if (tr) for (const t of [].concat(tr)) sources.push({ x: t.p.x, y: t.p.y, r: 0, col: '#fff3c0', a: 1, cone: { ang: t.torch, len: 17 } });
    // party lights at Warland Reserve
    if (Game.partyOn) { const w = Game.places.warland; for (let i = 0; i < 5; i++) { const a = Game.t * (0.7 + i * 0.13) + i * 1.3; const col = ['#ff3fa0', '#38e0c8', '#ffd23a', '#7c5cff', '#9be15d'][i]; sources.push({ x: w.x + Math.cos(a) * 12, y: w.y + Math.sin(a * 1.3) * 9, r: 12, col, a: 0.8 }); } }
    for (const p of Game.peds) if (p.glow && p.x > left && p.x < x1 && p.y > top && p.y < y1) glows.push({ x: p.x, y: p.y, r: 1, col: '#9bff8a', a: 0.7 });
    const pl = Game.player; if (pl.onFoot && !pl.hidden) sources.push({ x: pl.x, y: pl.y, r: 5, col: '#a0b0d0', a: 0.35 });
    // spooky lights on the Bluff around midnight
    if (hour >= 23.5 || hour < 1) { const b = Game.places.bluffTop; for (let i = 0; i < 4; i++) { const a = Game.t * 0.4 + i * 1.7; const x = b.x + Math.cos(a) * 30 + Math.sin(Game.t * 1.3 + i) * 5, y = b.y + Math.sin(a * 0.7) * 25; sources.push({ x, y, r: 9, col: '#80fff0', a: 0.7 }); glows.push({ x, y, r: 1.6, col: '#c0fff8', a: 0.9 }); } }
    return { sources, glows };
  };
})(window.VH);
