// Round B: Jaz's fireworks night, the last night of her story (Sunday, after the Bluff).
//  (a) HIDDEN FIREWORKS: three boxes hidden round town, found from Dez's texted hints (search circles on the map).
//  (b) THE IMPORT: meet a mate's fishing boat off the Bluff by jet ski or speedboat and run the rest in to the
//      Bluff boat ramp, past the water police and their spotlight.
//  (c) SETTING UP: three to five launch sites (Granite Island, the top of the Bluff, the end of the jetty,
//      Warland Reserve, and a cheeky finale at The Big House on the Hill), each a quick tube-planting game, with
//      Neighbourhood Watch, patrols and nosy locals raising suspicion.
//  (d) MIDNIGHT: the clock strikes twelve and every site goes off at once; the finale lights up the bay and the
//      comments roll in on Victor Harbor Locals Talk.
// A light show only: nobody is hurt and nothing catches fire. Dez, his mate and the boat are invented.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, SP = VH.Sprites, FX = VH.FX, I = VH.Input;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const G = () => VH.Game;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pl = () => G().player;
  const Fw = VH.Fireworks = { parts: [], sites: [], placing: null, susp: 0, nw: [], show: null, cinema: false, boxes: [] };
  const DEZ = 'DEZ'; // (short, to fit the message card's header; the first brief says who he is)
  const BOAT_NAME = 'THE RUSTY PELICAN';
  Fw.night = () => [Fw.jobStash(), Fw.jobImport(), Fw.jobSetup(), Fw.jobMidnight()].map(j => { j.needs = j.requires; j.requires = function () { return Fw.need(this.needs()); }; return j; });
  Fw.active = () => { const j = VH.Missions && VH.Missions.job; return j && j.started && j.fw ? j : null; };

  // ---------- places: every one a baked spawn slot (bake_slots_rb.mjs: launch_site, stash), picked through VH.Spawn ----------
  const RB = () => VH.RB;
  Fw.init = function () {
    const P = G().places;
    const under = RB().one('stash', 0), shed = RB().one('stash', 1);
    // the ute's kerb before it's parked (and where its box sits if no kerb is free tonight)
    const uk = RB().pick('kerb', { near: P.industrial, maxDist: 300, nearest: true, access: 'car', optional: true }) || RB().pick('footpath', { near: P.industrial, nearest: true });
    Fw.stashSpots = [{ id: 'jetty', name: 'UNDER THE JETTY', x: under.x, y: under.y, hint: "HINT 1: WHERE THE TRAM GOES OUT TO SEA, LOOK UNDERNEATH. MIND THE SEAGULLS." },
      { id: 'bowls', name: 'BEHIND THE BOWLS CLUB SHED', x: shed.x, y: shed.y, hint: 'HINT 2: THE BAY BOWLS & BICKERING CLUB. ROUND THE BACK OF THE SHED, BEHIND THE ROLLER.' },
      { id: 'ute', name: 'A UTE TRAY AT THE INDUSTRIAL ESTATE', x: uk.x, y: uk.y, hint: 'HINT 3: A WHITE UTE IN THE MAUDE STREET INDUSTRIAL ESTATE. CHECK THE TRAY.' }]; // (the ute parks on a kerb each night)
    // launch sites: four baked ones, and the finale in the front yard of the big house on the hill
    const LK = VH.Lockup; const site = i => { const s = RB().one('launch_site', i); return { x: s.x, y: s.y }; };
    const yard = LK && LK.door && (RB().pick('frontyard', { near: LK.door, maxDist: 40, nearest: true, optional: true }) || RB().pick('footpath', { near: LK.door, maxDist: 80, nearest: true, optional: true }));
    Fw.SITES = [
      { id: 'granite', name: 'GRANITE ISLAND', ...site(0) },
      { id: 'bluff', name: 'TOP OF THE BLUFF', ...site(1) },
      { id: 'jetty', name: 'END OF THE JETTY', ...site(2) },
      { id: 'warland', name: 'WARLAND RESERVE', ...site(3) },
    ];
    if (yard) Fw.SITES.push({ id: 'bighouse', name: LK.NAME || 'THE BIG HOUSE ON THE HILL', x: yard.x, y: yard.y, finale: true });
    else Fw.SITES[Fw.SITES.length - 1].finale = true;
    // where you watch from: the footpath by the causeway cafe
    const v = RB().pick('footpath', { near: P.causewayCafe || P.warland, nearest: true, optional: true }) || Fw.SITES[3]; Fw.view = { x: v.x, y: v.y };
  };
  // the sites you've set are saved with the night (per character), so QUIT + CONTINUE and a MIDNIGHT replay use them;
  // starting the night from its first jobs clears them
  Fw.saveSites = () => U.store.set('fw:sites:' + G().char, Fw.sites.map(s => s.id));
  Fw.newNight = function () {
    Fw.clockSaid = false; Fw.held = false; Fw.parts = []; Fw.sites = []; Fw.placing = null; Fw.susp = 0; Fw.show = null; Fw.cinema = false; Fw.found = 0; Fw.cargo = false;
    for (const v of Fw.nw) v.removed = true; Fw.nw = [];
    const g = G(); const nt = VH.Missions.nightOf && VH.Missions.nightOf('schoolie', g.night); const on = g.char === 'schoolie' && !!nt && nt.id === 'sun'; // Jaz's fireworks night
    G().clockRate = on ? 1 / 85 : 1 / 60; // a big night: the clock runs a little slower
    Fw.boxes = []; Fw.ute = null; for (const s of Fw.stashSpots || []) s.fell = false;
    if (on) { const M = VH.Missions; const keep = (M.idx || 0) >= 2 ? U.store.get('fw:sites:' + g.char, []) : []; if (!keep.length) Fw.saveSites(); else { Fw.sites = Fw.SITES.filter(q => keep.includes(q.id)); G().toast(`THE ${Fw.sites.length} SITE${Fw.sites.length > 1 ? 'S' : ''} YOU SET ARE STILL THERE`, '#9be15d'); } }
    if (on) {
      // the ute with a box in the tray
      const s = Fw.stashSpots[2]; const P = g.places;
      // on a street in the estate, clear of the B-double that parks there too
      const k = RB().pick('kerb', { near: P.industrial, maxDist: 300, access: 'car', filter: q => g.vehicles.every(v => v.removed || Math.hypot(v.x - q.x, v.y - q.y) > 18), optional: true });
      const ute = k && VH.Spawn.vehicle('ute', k, { colour: '#f4f4f0', parked: true }); if (ute) { ute.stash = true; Fw.ute = ute; g.specials.stashUte = ute; s.x = ute.x; s.y = ute.y; }
    }
  };

  // ================= the jobs =================
  // Each job lists what it needs: [{ what, ok, fatal, hint }]. Round A's dead-end detector (M.checkDeadEnd) reads it
  // through requires(): the first thing lost for good brings up "JOB CAN'T BE FINISHED: YOU LOST <what>" (restart the
  // job or the night), and a recoverable one shows its hint while the job carries on.
  Fw.need = function (list) {
    const N = VH.Missions.Need, bad = (list || []).filter(r => !r.ok);
    const f = bad.find(r => r.fatal); if (f) return N.lost(f.what);
    const h = bad.find(r => r.hint); return h ? N.recover(h.what, h.hint) : null;
  };
  const K = (key, touch) => (I.touchMode ? touch : key);
  Fw.jobStash = () => ({
    fw: true, title: 'HIDDEN FIREWORKS', from: DEZ, pay: 30,
    brief: "JAZ! DEZ HERE, THE BLOKE WITH THE DINGHY. THE FIREWORKS FOR TONIGHT'S BIG SHOW GOT SPLIT UP AND HIDDEN ROUND TOWN. THREE BOXES. I'LL TEXT A HINT AT A TIME AND IT GOES ON YOUR MAP AS A CIRCLE: WALK ROUND INSIDE IT TILL YOU SPOT A SPARKLING BOX, THEN SPACE TO GRAB IT. NOBODY GETS HURT, NOTHING CATCHES FIRE, JUST PRETTY LIGHTS.",
    init() { this.i = Math.min(3, Fw.found || 0); this.time = 720; this.circle = null; if (this.i < 3) this.hint(); },
    hint() { const s = Fw.stashSpots[this.i]; const a = Math.random() * U.TAU, r = U.rand(6, 22); this.circle = { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r, r: 32 }; G().toast('DEZ: ' + s.hint, '#ffd23a'); sfx('sms'); },
    box() {
      const s = Fw.stashSpots[this.i];
      if (s.id === 'ute' && Fw.ute) {
        const u = Fw.ute;
        // driven off and dunked? the box bobs out and washes up on the nearest dry spot
        if (u.removed || u.sinking) { if (!s.fell) { s.fell = true; const q = RB().pick('beach', { near: u, maxDist: 300, nearest: true, optional: true }) || RB().pick('footpath', { near: u, nearest: true }); s.x = q.x; s.y = q.y; G().toast('THE BOX FELL OUT OF THE UTE. IT WASHED UP NEARBY', '#ffd23a'); this.circle = { x: s.x, y: s.y, r: 20 }; } return s; }
        return { x: u.x - Math.cos(u.ang) * 1.5, y: u.y - Math.sin(u.ang) * 1.5 };
      }
      return s;
    },
    requires() { return [{ what: 'THE FIREWORKS', ok: true }]; }, // nothing here can be lost for good: a dunked ute drops its box on the shore
    targets() { return this.circle ? [{ ...this.circle, label: `HINT ${this.i + 1}: SEARCH HERE` }] : []; },
    objective() {
      if (this.i >= 3) return 'ALL THREE BOXES FOUND';
      const b = this.box(), d = dist(pl(), b), R = this.reach();
      if (d < R && pl().onFoot) return `${K('SPACE', 'ACT')}: GRAB THE BOX (${this.i}/3)`;
      if (d < R) return 'GET OUT (E) TO GRAB THE BOX';
      if (d < 22) return `THERE IT IS, SPARKLING: WALK RIGHT UP TO IT (${this.i}/3)`;
      if (this.circle && dist(pl(), this.circle) < this.circle.r) return `SEARCH INSIDE THE CIRCLE FOR A SPARKLING BOX (${this.i}/3)`;
      return `HINT ${this.i + 1}: HEAD FOR THE SEARCH CIRCLE ON THE MAP (${this.i}/3 BOXES)`;
    },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('SOMEONE ELSE FOUND THE BOXES');
      if (this.i < 3) this.box(); // (the ute's box is placed once the first two are found)
      return this.i >= 3 ? 'done' : undefined;
    },
    grab() { const b = this.box(); FX.text(b.x, b.y - 3, 'GOT ONE! ' + (this.i + 1) + '/3', '#ffd23a'); sfx('pickup'); FX.confetti(b.x, b.y, 12); G().cash += 5; this.i++; Fw.found = this.i; if (this.i < 3) this.hint(); else { this.circle = null; G().toast("DEZ: LEGEND. THE REST OF THE FIREWORKS ARE ON A BOAT.", '#ffd23a'); } },
    // the ute's box is in its tray: reachable from beside the tailgate or the back wheels, not just from on top of it
    reach() { return Fw.stashSpots[this.i] && Fw.stashSpots[this.i].id === 'ute' && Fw.ute && !Fw.ute.removed ? 3.4 : 2.6; },
    on(ev) { if (ev === 'use' && pl().onFoot && this.i < 3 && dist(pl(), this.box()) < this.reach()) { this.grab(); return true; } return false; },
    draw(ctx, left, top, S) { if (this.i < 3) { const b = this.box(); const d = dist(pl(), b); drawBox(ctx, b, left, top, S, d < 26); if (d < 26) { const sx = (b.x - left) * S, sy = (b.y - top) * S, r = 6 + Math.sin(G().t * 5) * 2; ctx.strokeStyle = 'rgba(255,210,58,0.85)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(Math.round(sx), Math.round(sy), r, 0, U.TAU); ctx.stroke(); } } },
  });
  Fw.jobImport = () => ({
    fw: true, title: 'THE IMPORT', from: DEZ, pay: 60,
    brief: `THE REST OF THE FIREWORKS ARE ON MY MATE'S FISHING BOAT, ${BOAT_NAME}, SITTING OFF THE BLUFF. TAKE THE SPEEDBOAT ON ITS TRAILER AT THE BLUFF BOAT RAMP (OR THE JET SKI AT THE OLD WHARF UNDER THE BLUFF). PULL ALONGSIDE HER AND STOP, THEN RUN THE BOXES IN TO THE BLUFF BOAT RAMP. THE WATER POLICE PATROL AT NIGHT: KEEP OUT OF THEIR SPOTLIGHT, AND IF THEY COME ALONGSIDE, SHOVE THEM OFF (SPACE) OR GUN IT.`,
    init() {
      const Wt = VH.Water; const g = G(); this.stage = 0; this.time = 900; this.load = 0; this.cargoBoat = null;
      const ramp = Wt.ramps.find(r => /BLUFF/.test(r.name)) || Wt.ramps[0]; this.drop = ramp.water;
      // the fishing boat: out on open water off the Bluff, half a mile or so from the ramp
      const sea = RB().pick('open_water', { near: this.drop, minDist: 550, maxDist: 900, access: 'boat', clearance: 10, optional: true }) || RB().pick('open_water', { near: this.drop, minDist: 300, nearest: true, access: 'boat' }); this.boat = new VH.Boat('fishing', sea.x, sea.y, -0.4, { colour: '#3a5a8a' }); this.boat.scripted = true; this.boat.mission = true; this.boat.rider = { shirt: '#c4372e', hair: '#e8e8e8', hat: 'beanie' }; g.vehicles.push(this.boat);
      // the water police patrol between the boat and the ramp
      const mid = Wt.openNear({ x: (sea.x + this.drop.x) / 2, y: (sea.y + this.drop.y) / 2 }, 200), far = Wt.openNear(sea, 220);
      Wt.patrol = { pts: [mid, far, Wt.openNear({ x: (sea.x + mid.x) / 2, y: (sea.y + mid.y) / 2 }, 200)], spotted: false, speed: 16, lostT: 0 };
      this.dez = VH.Spawn.ped('local', ramp.slot, { tag: 'dez', shirt: '#4a8a5a', hat: 'bucket' }); this.dez.state = 'idle'; // waiting at the top of the ramp
    },
    // the arrow points at the boats by the Bluff (the brief's jet ski and speedboat), or the nearest one if they've gone
    craft() { const free = VH.Water.boats.filter(b => !b.removed && !b.driver && b.type !== 'fishing'); const bluff = free.filter(b => dist(b, this.drop) < 900); return bluff.length ? bluff.sort((a, b) => dist(a, this.drop) - dist(b, this.drop))[0] : free.sort((a, b) => dist(a, pl()) - dist(b, pl()))[0]; }, // the speedboat at the ramp first: easy to reach by road
    requires() {
      const cb = this.cargoBoat;
      return [{ what: 'THE FISHING BOAT', ok: !this.boat.removed, fatal: true },
        { what: 'A BOAT TO USE', ok: this.stage === 2 || !!VH.Water.afloat() || !!this.craft(), fatal: true },
        { what: 'THE FIREWORKS', ok: this.stage < 2 || (cb && !cb.removed), fatal: true },
        { what: 'YOUR BOAT', ok: this.stage < 2 || !cb || cb.driver === 'player', hint: `THE FIREWORKS ARE STILL ON YOUR ${cb ? cb.def.name.toUpperCase() : 'BOAT'}. GET BACK ON IT (E)` }];
    },
    targets() {
      const me = VH.Water.afloat(), cb = this.cargoBoat;
      if (this.stage === 2) return cb && me !== cb ? [{ x: cb.x, y: cb.y, label: 'YOUR ' + cb.def.name.toUpperCase(), r: 4 }] : [{ ...this.drop, label: 'THE BLUFF BOAT RAMP', r: 10 }];
      if (!me) { const c = this.craft(); return c ? [{ x: c.x, y: c.y, label: c.def.jetski ? 'JET SKI' : 'SPEEDBOAT', r: 4 }] : []; }
      return [{ x: this.boat.x, y: this.boat.y, label: BOAT_NAME, r: 9 }];
    },
    objective() {
      const me = VH.Water.afloat(), cb = this.cargoBoat; const sp = VH.Water.patrol && VH.Water.patrol.spotted;
      if (this.stage < 2 && !me) { const c = this.craft(); return c && dist(c, pl()) < 4 ? `${K('E', 'GET IN')}: GET ON THE ${c.def.name.toUpperCase()}` : `GET A BOAT: THE ${c && c.def.jetski ? 'JET SKI' : 'SPEEDBOAT'} ON THE ARROW`; }
      if (this.stage < 2) { if (this.load > 0) return `LOADING THE FIREWORKS... ${Math.round(this.load / 1.6 * 100)}%`; const d = dist(me, this.boat); return d < 12 ? `STOP ALONGSIDE ${BOAT_NAME} (${K('S', 'PULL BACK')} TO SLOW)` : `MEET ${BOAT_NAME} OFF THE BLUFF: PULL ALONGSIDE AND STOP`; }
      if (cb && me !== cb) return `GET BACK ON YOUR ${cb.def.name.toUpperCase()}: THE FIREWORKS ARE ABOARD`;
      return sp ? 'SPOTTED! OUT-RUN THE POLICE BOAT, THEN GET TO THE BLUFF BOAT RAMP' : 'RUN THE FIREWORKS IN TO THE BLUFF BOAT RAMP. STAY OUT OF THE SPOTLIGHT';
    },
    update(dt) {
      const Wt = VH.Water, g = G(), me = Wt.afloat(); this.time -= dt; if (this.time <= 0) return this.fail(`${BOAT_NAME} WENT HOME`);
      if (this.stage < 2 && me) {
        const close = dist(me, this.boat) < 10 && me.speed < 3;
        this.load = close ? this.load + dt : Math.max(0, this.load - dt);
        if (this.load > 1.6) { this.stage = 2; me.cargo = true; this.cargoBoat = me; Fw.cargo = true; sfx('door'); FX.text(me.x, me.y - 5, 'FIREWORKS ABOARD!', '#ffd23a'); g.toast("DEZ'S MATE: 'THERE YOU GO. DON'T GET PINCHED.'", '#9fd4ec'); }
      }
      if (this.stage === 2) {
        const pt = Wt.patrol, P = VH.Police, b = P.boat;
        if (pt && b && me) {
          const d = dist(b, me); const inBeam = d < 60 && Math.abs(U.angDiff(b.beam || b.ang, Math.atan2(me.y - b.y, me.x - b.x))) < 0.35;
          if (!pt.spotted && (inBeam || d < 20)) { pt.spotted = true; g.addMeter(0.8, 'SPOTTED BY THE WATER POLICE!'); sfx('megaphone'); }
          if (pt.spotted) { pt.lostT = d > 120 ? pt.lostT + dt : 0; if (pt.lostT > 4) { pt.spotted = false; pt.lostT = 0; g.meter = Math.min(g.meter, 1.2); g.toast('LOST THEM IN THE DARK', '#9be15d'); } }
        }
        const cb = this.cargoBoat;
        if (cb && dist(cb, this.drop) < 14) { cb.cargo = false; Fw.cargo = false; this.dez.say("YOU BEAUTY! NOW LET'S SET 'EM UP.", 3); FX.confetti(cb.x, cb.y, 30); return 'done'; }
      }
    },
    cleanup() { const Wt = VH.Water; Wt.patrol = null; if (VH.Police.boat && !Wt.afloat()) VH.Police.boat = null; this.boat.removed = true; if (this.dez) { this.dez.tag = null; this.dez.state = 'walk'; } for (const b of Wt.boats) b.cargo = false; Fw.cargo = false; },
  });
  Fw.jobSetup = () => ({
    fw: true, title: 'SETTING UP', from: DEZ, pay: 50,
    get brief() { return `${['NO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][Fw.SITES ? Fw.SITES.length : 5]} SPOTS, ONE SHOW. SET UP AT THREE OR MORE (MORE SITES, BIGGER SHOW): GRANITE ISLAND, THE TOP OF THE BLUFF, THE END OF THE JETTY, WARLAND RESERVE... AND IF YOU'RE GAME, ${VH.Lockup ? VH.Lockup.NAME : 'THE BIG HOUSE ON THE HILL'}. ON FOOT AT EACH ROCKET ON THE MAP: SPACE, THEN SPACE AGAIN TO PLANT EACH TUBE WHEN THE NEEDLE'S IN THE GREEN. KEEP IT QUIET: NEIGHBOURHOOD WATCH IS OUT, AND NOSY LOCALS DOB. THEN WATCH FROM THE FORESHORE.`; },
    // sites already set tonight stay set if you have another go (after a bust, say); blown sites are cleared
    init() { this.time = 720; Fw.sites = Fw.sites || []; Fw.susp = 0; Fw.blown = []; if (Fw.sites.length) G().toast(`THE ${Fw.sites.length} SITE${Fw.sites.length > 1 ? 'S' : ''} YOU SET ARE STILL THERE`, '#9be15d'); },
    left() { return Fw.SITES.filter(s => !Fw.sites.includes(s) && !Fw.blown.includes(s)); },
    requires() { return [{ what: 'ENOUGH LAUNCH SITES', ok: Fw.sites.length + this.left().length >= 3, fatal: true }]; },
    targets() { const t = this.left().map(s => ({ x: s.x, y: s.y, label: s.name, r: 3 })); if (Fw.sites.length >= 3) t.push({ ...Fw.view, label: 'WATCH FROM HERE', r: 8 }); return t; },
    objective() {
      if (Fw.placing) return `PLANT THE TUBES ${Fw.placing.n}/3: ${K('SPACE', 'PLANT')} WHEN THE NEEDLE'S IN THE GREEN`;
      const s = Fw.near(); if (s) return `${K('SPACE', 'ACT')}: SET UP HERE (${s.name})`;
      const near = Fw.SITES.filter(q => !Fw.sites.includes(q) && !Fw.blown.includes(q)).find(q => dist(q, pl()) < 12); if (near && !pl().onFoot) return `GET OUT (${K('E', 'GET OUT')}) AND WALK TO THE SITE`;
      const n = Fw.sites.length; if (n >= 3 && dist(pl(), Fw.view) < 30) return pl().onFoot ? 'WALK INTO THE RING TO WAIT FOR MIDNIGHT' : `GET OUT (${K('E', 'GET OUT')}) TO WATCH`;
      return n >= 3 ? `${n}/5 SITES SET. MORE FOR A BIGGER SHOW, OR "WATCH FROM HERE" ON THE FORESHORE` : `SET UP LAUNCH SITES: ${n}/3 (UP TO 5). FOLLOW THE ARROWS`;
    },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('THE NIGHT GOT AWAY FROM YOU');
      Fw.updateNW(dt);
      if (Fw.sites.length >= 3 && pl().onFoot && !Fw.placing && dist(pl(), Fw.view) < 10) return 'done';
      if (Fw.sites.length === 5 && !this.allSaid) { this.allSaid = true; G().toast('ALL FIVE SITES! THE FINALE IS GOING TO BE ENORMOUS', '#9be15d'); }
    },
    cleanup() { Fw.placing = null; for (const v of Fw.nw) { v.removed = true; } Fw.nw = []; },
  });
  Fw.jobMidnight = () => ({
    fw: true, title: 'MIDNIGHT', from: DEZ, pay: 150,
    brief: "EVERYTHING'S SET. STAY ON THE FORESHORE AND WATCH THE SKY. (ENTER OR A TAP SKIPS TO THE NEXT SHOT.) HAPPY SCHOOLIES, JAZ.",
    init() { Fw.startShow(); },
    requires() { return []; },
    targets() { return []; },
    objective() { return Fw.show ? 'WATCH THE SKY' : 'MIDNIGHT'; },
    update() { if (!Fw.show) return 'done'; },
    cleanup() { Fw.endShow(); },
  });

  // ---------- Neighbourhood Watch on patrol near the sites ----------
  Fw.updateNW = function (dt) {
    const g = G(); Fw.nw = Fw.nw.filter(v => !v.removed);
    const site = Fw.SITES.filter(s => !Fw.sites.includes(s)).sort((a, b) => dist(a, pl()) - dist(b, pl()))[0];
    if (site && dist(site, pl()) < 220 && Fw.nw.length < 2 && Math.random() < dt) {
      // a Neighbourhood Watch gopher sets off from a kerb near the site, out of view
      const k = RB().pick('kerb', { near: site, minDist: 25, maxDist: 160, access: 'gopher', offscreen: true, optional: true });
      if (k) { const v = VH.Spawn.vehicle('gopher', k, { colour: '#e8c33a' }); VH.Spawn.drive(v, k); v.rider = true; v.nwFw = true; v.mission = true; Fw.nw.push(v); }
    }
    for (const v of Fw.nw) if (dist(v, pl()) > 400) v.removed = true;
  };

  // ---------- planting tubes: a needle sweeps; Space when it's in the green ----------
  // the hidden box, once it's close enough to see sparkling on screen
  Fw.visibleBox = function () { const j = Fw.active(); if (!j || j.title !== 'HIDDEN FIREWORKS' || j.i >= 3) return null; const b = j.box(); return dist(b, pl()) < 26 ? { x: b.x, y: b.y } : null; };
  Fw.near = function () { const j = Fw.active(); if (!j || j.title !== 'SETTING UP' || !pl().onFoot || Fw.placing) return null; return j.left().find(s => dist(s, pl()) < 4.5) || null; };
  Fw.watchers = function (s) {
    const g = G(), P = VH.Police; let rate = 0, who = '';
    for (const v of Fw.nw) if (dist(v, s) < 38 && VH.AI.los(v.x, v.y, s.x, s.y)) { rate += 24; who = 'NEIGHBOURHOOD WATCH'; }
    for (const v of [...P.patrols, ...P.units]) if (dist(v, s) < 55 && VH.AI.los(v.x, v.y, s.x, s.y)) { rate += 34; who = 'A PATROL CAR'; }
    let n = 0; for (const p of g.peds) if (!p.tag && dist(p, s) < 12 && n < 3) { n++; rate += 7; who = who || 'A NOSY LOCAL'; }
    if (s.id === 'bighouse') { rate += 12; who = who || 'THE SEARCHLIGHT'; }
    if (P.isHidden && P.isHidden()) rate *= 0.5;
    return { rate, who };
  };
  Fw.settle = function () { Fw.placing = null; };
  Fw.preUpdate = function (dt) {
    const g = G(); if (g.state !== 'play') return false;
    if (Fw.show) { Fw.updateShow(dt); return true; }
    const k = Fw.placing;
    if (k) {
      if (I.consume('enter')) { Fw.placing = null; g.toast('YOU BACK AWAY QUIETLY', '#a99fc8'); return true; }
      k.ang += k.dir * k.speed * dt; if (k.ang > 1.25) { k.ang = 1.25; k.dir = -1; } if (k.ang < -1.25) { k.ang = -1.25; k.dir = 1; }
      const w = Fw.watchers(k.site); Fw.susp = U.clamp(Fw.susp + w.rate * dt, 0, 100); Fw.who = w.who; k.speed = 2.2 + Fw.susp * 0.02;
      if (I.consume('action')) {
        if (Math.abs(k.ang - k.band) < k.bw / 2) { k.n++; sfx('clang', { pitch: 1.8, vol: 0.4 }); FX.text(k.site.x, k.site.y - 3, U.pick(['THUNK!', 'PLANTED!', 'NICE.']), '#9be15d'); k.band = U.rand(-0.95, 0.95); k.bw = Math.max(0.2, k.bw - 0.02); }
        else { Fw.susp = Math.min(100, Fw.susp + 12); sfx('crash', { vol: 0.3, pitch: 1.6 }); FX.text(k.site.x, k.site.y - 3, 'CLATTER!', '#ff9a30'); }
        if (k.n >= 3) { Fw.sites.push(k.site); Fw.saveSites(); Fw.placing = null; g.cash += 10; sfx('cash'); FX.text(k.site.x, k.site.y - 5, 'SITE SET!', '#ffd23a'); g.toast(`SITE SET: ${k.site.name} (${Fw.sites.length}/5)`, '#9be15d'); }
      }
      if (Fw.susp >= 100) { const s = k.site; Fw.placing = null; Fw.blown.push(s); Fw.susp = 35; g.addMeter(1.6, 'SOMEONE CALLED IT IN!'); g.toast(`${Fw.who || 'SOMEONE'} SAW YOU. ${s.name} IS BLOWN`, '#ff6a5a'); }
      return true;
    }
    Fw.susp = Math.max(0, Fw.susp - dt * 6);
    const s = Fw.near();
    if (s && I.pressed('action')) { I.consume('action'); Fw.placing = { site: s, n: 0, ang: -1, dir: 1, speed: 2.2, band: U.rand(-0.8, 0.8), bw: s.finale ? 0.28 : 0.36 }; sfx('menu'); return true; }
    return false;
  };
  Fw.prompt = function () { const s = Fw.near(); if (s) return (I.touchMode ? 'ACT' : 'SPACE') + ' · SET UP HERE: ' + s.name; const j = Fw.active(); if (j && j.title === 'HIDDEN FIREWORKS' && pl().onFoot && j.i < 3 && dist(pl(), j.box()) < 2.6) return (I.touchMode ? 'ACT' : 'SPACE') + ' · GRAB THE BOX'; return ''; };
  Fw.touchActions = () => (Fw.placing ? { id: 'action', label: 'PLANT', priority: 96 } : null);
  Fw.helpContext = () => Fw.placing ? 'setup' : '';

  // ================= the midnight show =================
  const COLS = [['#ff4fa0', '#ffb0d8'], ['#38e0c8', '#b0fff0'], ['#ffd23a', '#fff0a0'], ['#7c5cff', '#c8b8ff'], ['#ff6a3a', '#ffc0a0'], ['#9be15d', '#e0ffc0'], ['#f4f4ff', '#ffffff']];
  Fw.startShow = function () {
    const g = G(); const h = g.hour; const late = h < 5;
    if (!late) g.hour = 23.985;
    VH.Police.reset(); for (const v of g.watch) v.removed = true; g.watch = [];
    const sites = Fw.sites.length ? Fw.sites.slice() : [Fw.SITES[3]];
    const fin = sites.find(s => s.finale) || sites[sites.length - 1];
    const tour = sites.filter(s => s !== fin);
    Fw.show = { t: 0, phase: 'clock', sites, fin, tour, i: 0, late, launchT: {}, said: false };
    Fw.cinema = true; g.timeOverride = null; sfx('ring');
    // you are already standing at the viewing spot (the setup job ends there); the show only moves the camera
  };
  Fw.endShow = function () { const g = G(); Fw.show = null; Fw.cinema = false; g.timeOverride = null; };
  const PH = { clock: 6, wide: 7, site: 4, finale: 9, feed: 8 };
  Fw.updateShow = function (dt) {
    const s = Fw.show, g = G(); s.t += dt;
    if (I.consume('confirm') || I.consume('enter') || I.tap()) s.t = 1e3; // skip to the next shot
    const next = ph => { s.phase = ph; s.t = 0; };
    if (s.phase === 'clock') {
      if (!s.late) g.hour = Math.min(24, 23.985 + s.t / PH.clock * 0.015); if (g.hour >= 24) g.hour = 0.0001;
      const bong = Math.floor((s.t - 1.4) / 0.32); if (s.t > 1.4 && bong < 12 && bong !== s.lastBong) { s.lastBong = bong; sfx('chime', { pitch: 1 }); }
      if (s.t > PH.clock) { next('wide'); sfx('boom'); }
    } else if (s.phase === 'wide') { if (s.t > PH.wide) { if (s.tour.length) next('site'); else next('finale'); R().prefetch((s.tour[0] || s.fin).x, (s.tour[0] || s.fin).y, 110); } }
    else if (s.phase === 'site') { if (s.t > PH.site) { s.i++; if (s.i >= s.tour.length) { next('finale'); R().prefetch(s.fin.x, s.fin.y, 110); } else { s.t = 0; R().prefetch(s.tour[s.i].x, s.tour[s.i].y, 110); } } }
    else if (s.phase === 'finale') { if (s.t > PH.finale) { next('feed'); Fw.postFeed(); R().prefetch(Fw.view.x, Fw.view.y, 110); } }
    else if (s.phase === 'feed') { if (s.t > PH.feed) { Fw.show = null; Fw.cinema = false; return; } }
    if (s.phase !== 'clock') g.hour = s.late ? g.hour : 0.0001 + Math.min(0.08, (g.hour || 0) + dt / 3600);
    // every site goes off together; the one on camera (and the finale) the hardest
    if (s.phase !== 'clock') for (const site of s.sites) {
      const focus = Fw.focusSite(); const bay = s.phase === 'finale' && Fw.bayShot(); const fin = (site === s.fin && s.phase === 'finale') || bay;
      const rate = bay ? 5 : site === focus ? (fin ? 7 : 3.2) : s.phase === 'feed' ? 1.2 : 1.4;
      s.launchT[site.id] = (s.launchT[site.id] || Math.random() * 0.4) - dt;
      if (s.launchT[site.id] <= 0) { s.launchT[site.id] = U.rand(0.5, 1.4) / rate; Fw.launch(site, fin, site === focus); }
    }
    // the town reacts
    if (Math.random() < dt * 1.5) for (const p of g.peds) if (!p.tag && dist(p, g.cam) < 80 && Math.random() < 0.15) p.say(U.pick(['OOOOH!', 'AAAAH!', 'WHO DID THAT?!', 'BEAUTIFUL!', 'GO ON THEN!']), 2);
  };
  const R = () => VH.MapRender;
  // the finale is two shots: the finale site itself, then the bay from the foreshore as every site lets go at once
  Fw.bayShot = () => { const s = Fw.show; return s && ((s.phase === 'finale' && s.t > PH.finale / 2) || s.phase === 'feed'); };
  // the bay shot: a site out on the water if there is one (the jetty, the island), so the bursts light up the sea round it
  Fw.nearView = () => { const ss = Fw.show.sites; return ['jetty', 'granite', 'bluff', 'warland', 'bighouse'].map(id => ss.find(q => q.id === id)).find(Boolean) || ss[0]; };
  Fw.focusSite = function () { const s = Fw.show; if (!s) return null; if (s.phase === 'site') return s.tour[s.i]; if (Fw.bayShot()) return Fw.nearView(); if (s.phase === 'finale') return s.fin; return null; };
  Fw.launch = function (site, big, onCam) {
    const kinds = big ? ['peony', 'willow', 'ring', 'crackle', 'peony', 'palm'] : ['peony', 'ring', 'willow', 'crackle'];
    const n = big ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const a = U.rand(0, U.TAU), r = U.rand(0, 4); const col = U.pick(COLS);
      Fw.parts.push({ kind: 'rocket', x: site.x + Math.cos(a) * r, y: site.y + Math.sin(a) * r, z: 0, vx: U.rand(-2, 2), vy: U.rand(-2, 2), vz: U.rand(30, 40) * (big ? 1.15 : 1), life: U.rand(1.2, 1.7), max: 2, col, burst: U.pick(kinds), big });
    }
    if (onCam) sfx('whoosh', { pitch: U.rand(1.6, 2.2), vol: 0.3 });
    if (big && Math.random() < 0.4) for (let i = 0; i < 12; i++) Fw.parts.push({ kind: 'fountain', x: site.x + U.rand(-3, 3), y: site.y + U.rand(-3, 3), z: 0, vx: U.rand(-2, 2), vy: U.rand(-2, 2), vz: U.rand(8, 14), life: U.rand(0.8, 1.4), max: 1.4, col: ['#ffe8a0', '#ffffff'], grav: 12, drag: 0.6 });
  };
  function burst(p) {
    const [c0, c1] = p.col; const sp = p.big ? 17 : 13; const near = Fw.focusSite() && dist(p, Fw.focusSite()) < 120;
    if (near) sfx(p.burst === 'crackle' ? 'crackle' : 'boom', { vol: p.big ? 0.8 : 0.5, pitch: U.rand(0.8, 1.2) });
    const n = p.burst === 'willow' ? 46 : p.burst === 'ring' ? 36 : 56;
    for (let i = 0; i < n; i++) {
      let vx, vy, vz;
      if (p.burst === 'ring') { const a = i / n * U.TAU; vx = Math.cos(a) * sp; vy = Math.sin(a) * sp * 0.3; vz = -Math.sin(a) * sp * 0.7; } // reads as a ring on screen
      else { const u = Math.random() * 2 - 1, a = Math.random() * U.TAU, r = Math.sqrt(1 - u * u); const m = sp * (0.85 + Math.random() * 0.15); vx = Math.cos(a) * r * m; vy = Math.sin(a) * r * m; vz = u * m; }
      const willow = p.burst === 'willow';
      Fw.parts.push({ kind: 'star', x: p.x, y: p.y, z: p.z, vx, vy, vz, life: willow ? U.rand(2.4, 3.2) : U.rand(1.3, 1.9), max: willow ? 3.2 : 1.9, col: willow ? ['#ffcf70', '#fff0c0'] : [c0, c1], grav: willow ? 5 : 7, drag: willow ? 1.6 : 1.1, crackle: p.burst === 'crackle', palm: p.burst === 'palm' });
    }
    Fw.flashes.push({ x: p.x, y: p.y, z: p.z, t: 0, col: c0, big: p.big });
  }
  Fw.flashes = [];
  Fw.update = function (dt) {
    // Jaz's fireworks night: the clock waits at half eleven until you're watching (midnight is the show)
    const g = G(), j = Fw.active();
    // latched: once it's half eleven it stays there, even if a ride in the paddy wagon carried the clock past midnight
    if (j && j.title !== 'MIDNIGHT' && !Fw.show && (Fw.held || (g.hour >= 23.5 && g.hour < 24))) { Fw.held = true; g.hour = 23.5; if (!Fw.clockSaid) { Fw.clockSaid = true; g.toast("DEZ: NO RUSH. MIDNIGHT WAITS FOR US", '#ffd23a'); } }
    if (!Fw.parts.length && !Fw.flashes.length) return;
    for (let i = Fw.parts.length - 1; i >= 0; i--) {
      const p = Fw.parts[i]; p.life -= dt; p.px = p.x; p.py = p.y; p.pz = p.z;
      if (p.kind === 'rocket') { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 9 * dt; if (p.life <= 0) { burst(p); Fw.parts.splice(i, 1); } continue; }
      if (p.life <= 0 || p.z < 0) { Fw.parts.splice(i, 1); continue; }
      const d = Math.exp(-(p.drag || 1) * dt); p.vx *= d; p.vy *= d; p.vz = p.vz * d - (p.grav || 6) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    if (Fw.parts.length > 3000) Fw.parts.splice(0, Fw.parts.length - 3000);
    for (const f of Fw.flashes) f.t += dt; Fw.flashes = Fw.flashes.filter(f => f.t < 0.6);
  };
  Fw.camFocus = function () {
    const s = Fw.show; if (!s) return null;
    if (Fw.bayShot() && Fw.show.phase === 'finale') { const b = Fw.nearView(); return { x: b.x, y: b.y - 18 }; }
    const f = Fw.focusSite(); if (f) return { x: f.x, y: f.y - 32 };
    return { x: Fw.view.x, y: Fw.view.y - 28 };
  };
  Fw.zoomWant = () => Fw.show ? 1 : 0;
  Fw.fogScale = () => Fw.show ? 0.2 : 1; // the sea fog lifts for the show
  // fireworks sit above the lighting, added on (so they glow in the night palette)
  Fw.drawAir = function (ctx, left, top, S) {
    if (!Fw.parts.length && !Fw.flashes.length) return;
    const k = 0.75; const W0 = ctx.canvas.width, H0 = ctx.canvas.height;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const f of Fw.flashes) { const sx = (f.x - left) * S, sy = (f.y - top - f.z * k) * S; const r = (f.big ? 20 : 13) * S * (0.4 + f.t); if (sx < -r || sy < -r || sx > W0 + r || sy > H0 + r) continue; ctx.globalAlpha = Math.max(0, 0.16 * (1 - f.t / 0.6)); ctx.drawImage(SP.light(f.col, 64), sx - r, sy - r, r * 2, r * 2); }
    for (const p of Fw.parts) {
      const sx = (p.x - left) * S, sy = (p.y - top - p.z * k) * S; if (sx < -10 || sy < -10 || sx > W0 + 10 || sy > H0 + 10) continue;
      const a = U.clamp(p.life / (p.max || 1.5) * 1.6, 0, 1); const tw = p.crackle && p.life < 0.7 ? (Math.random() < 0.5 ? 1 : 0) : 1;
      if (!tw) continue;
      if (p.kind === 'rocket') { ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff4d0'; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 2); ctx.fillStyle = 'rgba(255,200,120,0.5)'; ctx.fillRect(Math.round(sx), Math.round(sy) + 2, 1, 3); continue; }
      const fr = p.life / (p.max || 1.5); const col = fr > 0.85 ? p.col[1] : fr > 0.3 ? p.col[0] : p.col[1]; // a white-hot flash, the colour, then glitter
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 1; const tx = (p.px - left) * S, ty = (p.py - top - p.pz * k) * S;
      ctx.beginPath(); ctx.moveTo(Math.round(tx), Math.round(ty)); ctx.lineTo(Math.round(sx), Math.round(sy)); ctx.stroke();
      const sz = p.palm || p.life / (p.max || 1.5) > 0.55 ? 2 : 1; ctx.fillStyle = col; ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  };
  // the bursts light the ground and the water below them
  Fw.lights = function (sources, glows) {
    for (const f of Fw.flashes) sources.push({ x: f.x, y: f.y - 10, r: f.big ? 42 : 28, col: f.col, a: 0.45 * (1 - f.t / 0.6) });
    const s = Fw.show; if (s && Fw.bayShot() && s.phase === 'finale') { const b = Fw.nearView(); for (let i = 0; i < 5; i++) sources.push({ x: b.x + Math.cos(G().t * 1.7 + i * 1.3) * 45, y: b.y + Math.sin(G().t * 1.1 + i) * 30, r: 38, col: COLS[(i + Math.floor(G().t * 2)) % COLS.length][0], a: 0.32 }); } // the bay lights up
    for (const v of Fw.nw) if (!v.removed) sources.push({ x: v.x + Math.cos(v.ang) * 2, y: v.y + Math.sin(v.ang) * 2, r: 0, col: '#fff3c0', a: 0.8, cone: { ang: v.ang, len: 14 } });
    for (const site of Fw.sites) glows.push({ x: site.x, y: site.y, r: 0.8, col: '#ff4040', a: 0.5 + 0.5 * Math.sin(G().t * 4) });
  };
  // the night's comments on the community page
  Fw.postFeed = function () {
    const s = Fw.show; const big = s.sites.length >= 5; const house = s.sites.some(q => q.finale);
    const pool = ['WHO DID THE FIREWORKS??', 'BEST SCHOOLIES EVER', 'MY DOG IS UNDER THE BED', 'COUNCIL SHOULD HIRE THEM', 'FILMED IT FROM THE CAUSEWAY', 'NOBODY HURT. NOTHING BURNT.', 'IN MY DAY WE HAD SPARKLERS', 'SOMEONE OWES THE GULLS A SORRY', big ? 'FIVE SITES. ORGANISED FUN.' : 'THE BLUFF WENT PINK!'].sort(() => Math.random() - 0.5);
    const comments = [...(house ? ['THE LOCK-UP ONE?! CHEEKY'] : []), ...pool].slice(0, 6);
    if (VH.Street) VH.Street.feed = { t: 0, post: 'DID ANYONE ELSE SEE THAT AT MIDNIGHT?? THE WHOLE BAY LIT UP', comments, likes: 400 + s.sites.length * 120 };
    sfx('sms');
  };

  // ================= drawing: boxes, racks, the tube-planting game, the cinema =================
  function drawBox(ctx, b, left, top, S, sparkle) {
    const sx = Math.round((b.x - left) * S), sy = Math.round((b.y - top) * S); if (sx < -20 || sy < -20 || sx > ctx.canvas.width + 20 || sy > ctx.canvas.height + 20) return;
    ctx.fillStyle = 'rgba(20,20,45,0.4)'; ctx.fillRect(sx - 2, sy - 1, 7, 6); ctx.fillStyle = '#7a5434'; ctx.fillRect(sx - 3, sy - 3, 7, 6); ctx.fillStyle = '#c99a5a'; ctx.fillRect(sx - 2, sy - 2, 5, 4); ctx.fillStyle = '#ff4fa0'; ctx.fillRect(sx - 1, sy - 1, 1, 1); ctx.fillStyle = '#ffd23a'; ctx.fillRect(sx + 1, sy - 1, 1, 1);
    if (sparkle && Math.floor(G().t * 6) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(sx + 3, sy - 5, 1, 1); ctx.fillRect(sx - 4, sy - 4, 1, 1); }
  }
  Fw.drawWorld = function (ctx, left, top, S) {
    const j = Fw.active(); if (j && j.draw) j.draw(ctx, left, top, S);
    // launch racks at the sites that are set (and empty spots at the ones still to do)
    if (!(j && (j.title === 'SETTING UP' || j.title === 'MIDNIGHT')) && !Fw.show) return;
    for (const s of Fw.SITES) {
      const sx = Math.round((s.x - left) * S), sy = Math.round((s.y - top) * S); if (sx < -30 || sy < -30 || sx > ctx.canvas.width + 30 || sy > ctx.canvas.height + 30) continue;
      const set = Fw.sites.includes(s), blown = Fw.blown && Fw.blown.includes(s);
      if (set) { ctx.fillStyle = 'rgba(20,20,45,0.4)'; ctx.fillRect(sx - 4, sy - 1, 10, 5); ctx.fillStyle = '#5a3c22'; ctx.fillRect(sx - 5, sy - 2, 10, 4); for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#ff4fa0', '#38e0c8', '#ffd23a', '#7c5cff'][i]; ctx.fillRect(sx - 4 + i * 2, sy - 5, 2, 4); ctx.fillStyle = '#222'; ctx.fillRect(sx - 4 + i * 2, sy - 5, 2, 1); } }
      else if (blown) U.text(ctx, 'BLOWN', sx, sy - 10, { align: 'center', color: '#ff6a5a' });
    }
  };
  Fw.drawTop = function (ctx, left, top, S) {
    const k = Fw.placing; if (!k) return;
    // the tubes going in, one by one
    const s = k.site; const sx = Math.round((s.x - left) * S), sy = Math.round((s.y - top) * S);
    for (let i = 0; i < k.n; i++) { ctx.fillStyle = ['#ff4fa0', '#38e0c8', '#ffd23a'][i]; ctx.fillRect(sx - 4 + i * 3, sy - 6, 2, 5); }
  };
  Fw.hud = function (ctx, ts) {
    const g = G(), w = ctx.canvas.width, h = ctx.canvas.height, C = VH.UI.C; const T2 = (s, x, y, o) => U.text(ctx, s, x, y, o);
    const j = Fw.active();
    if (j && j.title === 'SETTING UP' || Fw.placing) {
      const x = VH.UI.leftX || 4 * ts, y = (VH.UI.leftBottom || 120 * ts) + 4 * ts, pw = VH.UI.leftW || 128 * ts, nC = Math.max(8, Math.floor((pw - 10 * ts) / (6 * ts))); // (the core's left column: same margin and width, compact on phones)
      VH.UI.panel(ctx, x, y, pw, 23 * ts, { accent: Fw.susp > 70 ? C.red : C.hi });
      T2(`SUSPICION${Fw.who && Fw.placing && Fw.susp > 5 ? ': ' + Fw.who.split(' ')[0] : ''}`.slice(0, nC), x + 5 * ts, y + 4 * ts, { color: Fw.susp > 70 ? C.red : C.hi, scale: ts });
      ctx.fillStyle = '#2a2040'; ctx.fillRect(x + 5 * ts, y + 14 * ts, pw - 10 * ts, 5 * ts); ctx.fillStyle = Fw.susp > 70 ? C.red : Fw.susp > 40 ? C.hi : C.green; ctx.fillRect(x + 5 * ts, y + 14 * ts, (pw - 10 * ts) * Fw.susp / 100, 5 * ts);
      VH.UI.leftBottom = y + 23 * ts;
    }
    const k = Fw.placing; if (!k) return;
    // a gauge: the green band, the needle, three tube slots
    const R0 = Math.min(56 * ts, w * 0.22); const cx = w / 2, cy = Math.round(h * 0.58);
    VH.UI.panel(ctx, cx - R0 - 10 * ts, cy - R0 - 22 * ts, R0 * 2 + 20 * ts, R0 + 40 * ts, { accent: C.pink, fill: 'rgba(18,12,36,0.9)' });
    T2(k.site.name, cx, cy - R0 - 16 * ts, { align: 'center', color: C.hi, scale: ts });
    ctx.lineWidth = 4 * ts; ctx.strokeStyle = '#3c2f6b'; ctx.beginPath(); ctx.arc(cx, cy, R0 * 0.8, -Math.PI / 2 - 1.3, -Math.PI / 2 + 1.3); ctx.stroke();
    ctx.strokeStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, R0 * 0.8, -Math.PI / 2 + k.band - k.bw / 2, -Math.PI / 2 + k.band + k.bw / 2); ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * ts; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(k.ang) * R0 * 0.9, cy - Math.cos(k.ang) * R0 * 0.9); ctx.stroke(); ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < k.n ? ['#ff4fa0', '#38e0c8', '#ffd23a'][i] : '#3c2f6b'; ctx.fillRect(cx - 14 * ts + i * 10 * ts, cy + 6 * ts, 6 * ts, 8 * ts); }
    T2(I.touchMode ? 'TAP PLANT IN THE GREEN · GET IN: STOP' : 'SPACE IN THE GREEN · E: STOP', cx, cy + 16 * ts, { align: 'center', color: C.dim, scale: ts });
  };
  // the cinema: the clock striking twelve, the wide shot of every site at once, close-ups, the feed
  Fw.drawCinema = function (ctx, ts) {
    const s = Fw.show; if (!s) return false; const w = ctx.canvas.width, h = ctx.canvas.height; const C = VH.UI.C; const T2 = (str, x, y, o) => U.text(ctx, str, x, y, o); const g = G();
    if (s.phase === 'wide') Fw.drawWide(ctx, ts);
    const bar = Math.round(h * 0.09); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
    if (s.phase === 'clock') {
      const R0 = Math.min(w, h) * 0.22, cx = w / 2, cy = h / 2; ctx.fillStyle = 'rgba(8,8,24,0.6)'; ctx.fillRect(0, bar, w, h - bar * 2);
      ctx.fillStyle = '#f4ecd8'; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, U.TAU); ctx.fill(); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = Math.max(2, 3 * ts); ctx.stroke(); ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) { const a = i / 12 * U.TAU; ctx.fillStyle = '#3a2a1a'; ctx.fillRect(Math.round(cx + Math.sin(a) * R0 * 0.84) - ts, Math.round(cy - Math.cos(a) * R0 * 0.84) - ts, 2 * ts, 2 * ts); }
      const k = Math.min(1, s.t / 1.4); const mA = (-0.03 + 0.03 * k) * U.TAU, hA = mA / 12; // the minute hand reaches twelve
      const hand = (a, L, wd, col) => { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * L, cy - Math.cos(a) * L); ctx.stroke(); };
      hand(hA, R0 * 0.5, 4 * ts, '#1a1410'); hand(mA, R0 * 0.78, 2 * ts, '#1a1410'); ctx.lineWidth = 1;
      const n = Math.max(0, Math.min(12, Math.floor((s.t - 1.4) / 0.32) + 1));
      T2(s.late ? 'FASHIONABLY LATE...' : n ? 'BONG '.repeat(Math.min(n, 4)).trim() + (n > 4 ? ' ... ' + n : '') : 'ELEVEN FIFTY-NINE...', cx, cy + R0 + 10 * ts, { align: 'center', color: C.hi, scale: ts * 2 });
      T2('MIDNIGHT, SCHOOLIES WEEK, VICTOR HARBOR', w / 2, bar / 2 - 3 * ts, { align: 'center', color: C.white, scale: ts });
    } else if (s.phase === 'wide') T2('MIDNIGHT. EVERY SITE AT ONCE.', w / 2, bar / 2 - 3 * ts, { align: 'center', color: C.hi, scale: ts });
    else if (s.phase === 'site' || s.phase === 'finale') { const f = Fw.focusSite(); T2((s.phase === 'finale' ? 'THE FINALE: ' : '') + (f ? f.name : ''), w / 2, bar / 2 - 3 * ts, { align: 'center', color: s.phase === 'finale' ? C.pink : C.hi, scale: ts }); }
    else if (s.phase === 'feed') { T2('MEANWHILE, ONLINE', w / 2, bar / 2 - 3 * ts, { align: 'center', color: C.white, scale: ts }); Fw.drawFeed(ctx, ts, bar); }
    T2(I.touchMode ? 'TAP: NEXT' : 'ENTER: NEXT', w - 6 * ts, h - bar / 2 - 3 * ts, { align: 'right', color: C.dim, scale: ts });
    void g; return true;
  };
  // the community page, full width so the comments can be read on a phone too
  Fw.drawFeed = function (ctx, ts, bar) {
    const f = VH.Street && VH.Street.feed; if (!f) return; const w = ctx.canvas.width, h = ctx.canvas.height; const C = VH.UI.C;
    const pw = Math.min(w - 12 * ts, 300 * ts), x = Math.round(w / 2 - pw / 2), n = Math.min(f.comments.length, Math.floor(f.t / 1.1) + 1), cols = Math.floor((pw - 12 * ts) / (6 * ts));
    const post = U.wrap('"' + f.post + '"', cols); const cl = []; for (let i = 0; i < n; i++) for (const l of U.wrap('> ' + f.comments[i], cols)) cl.push(l);
    const ph = (24 + post.length * 9 + cl.length * 9 + 12) * ts; const y = Math.round(Math.max(bar + 4 * ts, h / 2 - ph / 2));
    VH.UI.panel(ctx, x, y, pw, ph, { accent: '#3070ff', fill: 'rgba(14,20,40,0.94)' });
    U.text(ctx, VH.Street.PAGE, x + 6 * ts, y + 5 * ts, { color: '#7fa6ff', scale: ts });
    post.forEach((l, i) => U.text(ctx, l, x + 6 * ts, y + 16 * ts + i * 9 * ts, { color: C.white, scale: ts }));
    cl.forEach((l, i) => U.text(ctx, l, x + 6 * ts, y + (20 + post.length * 9 + i * 9) * ts, { color: '#c9d4f0', scale: ts }));
    U.text(ctx, `${f.likes} LIKES`, x + pw - 6 * ts, y + ph - 10 * ts, { align: 'right', color: '#ff4fa0', scale: ts });
  };
  // the wide shot: the town map in the night palette, with every site bursting at once
  Fw.drawWide = function (ctx, ts) {
    const s = Fw.show, w = ctx.canvas.width, h = ctx.canvas.height; const ov = VH.MapRender.overview, sc = VH.MapRender.overviewScale; if (!ov) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of [...s.sites, Fw.view]) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    x0 -= 350; y0 -= 250; x1 += 350; y1 += 250; const bar = Math.round(h * 0.09), top = bar + 4 * ts, hh = h - 2 * bar - 8 * ts; const k = Math.min(w / (x1 - x0), hh / (y1 - y0)); const ox = w / 2 - (x0 + x1) / 2 * k, oy = top + hh / 2 - (y0 + y1) / 2 * k;
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(ov, x0 / sc, y0 / sc, (x1 - x0) / sc, (y1 - y0) / sc, ox + x0 * k, oy + y0 * k, (x1 - x0) * k, (y1 - y0) * k); ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#2a3060'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const site of s.sites) {
      const sx = ox + site.x * k, sy = oy + site.y * k;
      for (let b = 0; b < 3; b++) {
        const ph = ((s.t * 0.7 + b / 3 + U.hash(site.x | 0, b, 3)) % 1); const col = COLS[(b + Math.floor(s.t * 0.7 + b / 3 + U.hash(site.x | 0, b, 3)) + site.id.length) % COLS.length];
        const bx = sx + (U.hash(site.x | 0, b, 5) - 0.5) * 20 * ts, by = sy - (14 + U.hash(site.y | 0, b, 6) * 14) * ts; const r = (6 + ph * 22) * ts * (site.finale ? 1.5 : 1);
        ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = col[0];
        for (let i = 0; i < 24; i++) { const a = i / 24 * U.TAU; ctx.fillRect(Math.round(bx + Math.cos(a) * r), Math.round(by + Math.sin(a) * r + ph * ph * 6 * ts), ts, ts); }
        ctx.globalAlpha = (1 - ph) * 0.25; ctx.drawImage(SP.light(col[0], 64), bx - r * 2, by - r * 2, r * 4, r * 4);
        ctx.globalAlpha = (1 - ph) * 0.12; ctx.drawImage(SP.light(col[0], 64), sx - r * 2, sy - r, r * 4, r * 3); // the glow on the water and the ground below
      }
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(sx) - ts, Math.round(sy) - ts, 2 * ts, 2 * ts);
    }
    ctx.restore();
    for (const site of s.sites) { const hw = U.textWidth(site.name, ts) / 2 + 2; U.text(ctx, site.name, U.clamp(ox + site.x * k, hw, w - hw), oy + site.y * k + 5 * ts, { align: 'center', color: '#c9c4e8', scale: ts }); }
  };
  Fw.markers = function () {
    const j = Fw.active(); if (!j) return [];
    if (j.title === 'HIDDEN FIREWORKS' && j.circle) return [VH.RB.mark(j.circle.x, j.circle.y, 'box')];
    if (j.title === 'THE IMPORT') return [VH.RB.mark(j.boat.x, j.boat.y, 'fishing')];
    if (j.title === 'SETTING UP') return j.left().map(s => VH.RB.mark(s.x, s.y, 'rocket'));
    return [];
  };
})(window.VH);
