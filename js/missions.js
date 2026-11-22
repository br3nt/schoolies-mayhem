// Story and jobs for the three characters across three nights of Schoolies week.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, FX = VH.FX, SP = VH.Sprites, PK = SP.PK;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const M = VH.Missions = { char: null, night: 1, idx: 0, job: null, done: [] };
  const G = () => VH.Game;
  const pl = () => G().player;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const inVeh = () => !pl().onFoot && pl().vehicle;


  // Everything a job puts in the world goes on a baked spawn slot (VH.Spawn; tools/bake_slots.mjs): doors, backyards,
  // kerbs and so on, each checked at bake time to be outside buildings, off the water and reachable. Never raw x/y.
  const Spawn = () => VH.Spawn;
  // n doors near a centre, spread out (the door objects, sitting on their validated slots)
  function pickDoors(cx, cy, n, radius = 300, spacing = 45) {
    return Spawn().many('door', n, { near: { x: cx, y: cy }, maxDist: radius, spacing, access: 'foot' }).map(s => Spawn().door(s)).filter(Boolean);
  }
  function pickProps(kind, cx, cy, n, radius, spacing = 50) {
    const out = []; const cand = VH.Props.list.filter(p => kinds(kind).includes(p.k) && p.up && Math.hypot(p.x - cx, p.y - cy) < radius).sort(() => Math.random() - 0.5);
    for (const p of cand) { if (out.every(o => Math.hypot(o.x - p.x, o.y - p.y) > spacing)) out.push(p); if (out.length >= n) break; }
    return out;
  }
  const kinds = k => Array.isArray(k) ? k : [k];
  function roadNear(x, y, r = 120) { const n = W.nearestEdge(x, y, r); return n ? { x: n.x, y: n.y, a: n.ang, n } : { x, y, a: 0 }; }

  // the key for "use" (Space, or ACT on a phone) in a prompt
  const useKey = () => VH.Input.touchMode ? 'ACT' : 'SPACE';
  M.useKey = useKey;
  // nearby cover to hide behind: bushes and trees, fences, bins, letterboxes, benches, crates, parked cars
  M.coverNear = function (x, y, R = 16, n = 3) {
    const out = []; const add = (cx, cy, kind) => { const d = Math.hypot(cx - x, cy - y); if (d < R && VH.Nav.walkable(cx, cy)) out.push({ x: cx, y: cy, d, kind }); };
    VH.Props.trees.query(x - R, y - R, x + R, y + R, t => { const a = Math.atan2(y - t.y, x - t.x); add(t.x + Math.cos(a) * 1.4, t.y + Math.sin(a) * 1.4, 'tree'); });
    VH.Props.near(x, y, R, q => { if (q.up && [PK.fence, PK.binR, PK.binY, PK.binG, PK.bin, PK.letterbox, PK.bench, PK.crate].includes(q.k)) { const a = Math.atan2(y - q.y, x - q.x); add(q.x + Math.cos(a) * 1.0, q.y + Math.sin(a) * 1.0, q.k === PK.fence ? 'fence' : q.k === PK.letterbox ? 'box' : 'bin'); } });
    for (const v of G().vehicles) if (!v.removed && v.parked && !v.rail && Math.hypot(v.x - x, v.y - y) < R) { const a = Math.atan2(y - v.y, x - v.x); add(v.x + Math.cos(a) * 2.2, v.y + Math.sin(a) * 2.2, 'car'); }
    return out.sort((a, b) => a.d - b.d).filter((c, i, arr) => arr.findIndex(o => Math.hypot(o.x - c.x, o.y - c.y) < 3) === i).slice(0, n);
  };
  // ================= JOB FACTORIES =================
  const J = {};
  J.chipRun = () => ({
    title: 'CHIP RUN', from: 'THE CREW', pay: 15,
    brief: "STARVING. GRAB CHIPS FROM THE FISH SHOP ON THE FORESHORE AND BRING EM TO WARLAND RESERVE. WATCH THE GULLS, THEY'RE ORGANISED.",
    init() { this.stage = 0; this.time = 150; },
    targets() { return this.stage === 0 ? [{ ...G().places.fishShop, label: 'FISH SHOP' }] : [{ ...G().places.warland, label: 'THE CREW', r: 16 }]; },
    objective() { return this.stage === 0 ? 'GET THE CHIPS FROM THE FISH SHOP' : `DELIVER THE CHIPS (${pl().chips} LEFT, NEED 4)`; },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail("THE CREW ATE SOMEONE ELSE'S CHIPS");
      if (this.stage === 0 && dist(pl(), G().places.fishShop) < 9) { this.stage = 1; pl().chips = 12; sfx('pickup'); FX.text(pl().x, pl().y - 3, 'CHIPS! (12)', '#f2c94a'); G().toast('THE GULLS HAVE NOTICED', '#ff9a30'); }
      if (this.stage === 1) {
        if (pl().chips < 4) return this.fail('THE GULLS GOT THE CHIPS');
        if (dist(pl(), G().places.warland) < 18) { this.bonus = pl().chips * 2; pl().chips = 0; FX.confetti(pl().x, pl().y, 30); return 'done'; }
      }
    },
  });
  // hiding next to cover while standing still: bushes and trees, fences, bins, letterboxes, benches, parked cars
  M.inCover = function () {
    const p = pl(); if (!p.onFoot || Math.hypot(p.vx, p.vy) > 0.6) return false;
    let c = false; VH.Props.trees.query(p.x - 3, p.y - 3, p.x + 3, p.y + 3, t => { if (Math.hypot(t.x - p.x, t.y - p.y) < 2.6) c = true; });
    if (!c) VH.Props.near(p.x, p.y, 2, q => { if (q.up && [PK.fence, PK.binR, PK.binY, PK.binG, PK.bin, PK.letterbox, PK.bench, PK.crate].includes(q.k) && Math.hypot(q.x - p.x, q.y - p.y) < 1.8) c = true; });
    if (!c) for (const v of G().vehicles) if (!v.removed && !v.ai && !v.rail && Math.hypot(v.x - p.x, v.y - p.y) < 3.2) { c = true; break; }
    return c;
  };
  const GRUMBLES = ['WHO\'S THERE?!', 'BLOODY KIDS...', 'I KNOW YOU\'RE OUT THERE!', 'COME OUT, I WON\'T BITE!', 'NOT AGAIN...', 'I\'VE GOT A TORCH AND I\'M NOT AFRAID TO USE IT'];
  // Ding dong ditch. After the bell, the household comes out with torches and searches properly: the obvious hiding
  // spots near the door first (bushes, fences, bins, parked cars), then along the street, and back to anywhere they
  // heard a noise. Hiding is stealth, not magic: each searcher's suspicion rises while you're in their torch (slowly
  // if you're tucked behind cover and still, fast if you're in the open or moving; "?" then "!" over their head), and
  // falls when you're out of it. Some houses send out a couple, each with a torch, who split up and talk it over.
  const COUPLES = [
    { kind: 'older', who: ['DEN', 'BEV'], shirts: ['#7a8ab0', '#b07aa8'], lines: ["DID YOU SEE 'EM, {B}?", 'PROBABLY THE KID FROM NUMBER NINE AGAIN', "I'M MISSING MY SHOW, {B}", "MY KNEES AREN'T WHAT THEY WERE", 'IN MY DAY WE JUST KNOCKED AND RAN'] },
    { kind: 'young', who: ['JESS', 'TOM'], shirts: ['#c08a6a', '#4a6fa5'], lines: ["SHH, YOU'LL WAKE THE BABY", "HE'S BEEN UP ALL NIGHT ALREADY", 'IF THEY WAKE HIM AGAIN, {B}...', "I'LL DO THE FRONT, YOU DO THE SIDE"], baby: true },
    { kind: 'housemates', who: ['SKIP', 'TAZ'], shirts: ['#3d7a5a', '#d0a040'], lines: ['MATE. MATE. DID YOU HEAR THAT?', "IT'S YOUR TURN TO CHECK THE BINS", "I'M IN MY SOCKS, {B}", "THE ROSTER SAYS IT'S YOU"] },
  ];
  const coverWord = k => ({ tree: 'THE BUSHES', fence: 'THE FENCE', bin: 'THE BINS', car: 'THE CARS', box: 'THE LETTERBOX' }[k] || 'OVER THERE');
  J.dingDong = (n = 4, centre = { x: 4380, y: 2250 }) => ({
    title: 'DING DONG DITCH', from: 'THE CREW', pay: 40,
    brief: `CLASSIC. RING ${n} DOORBELLS (SPACE AT THE DOOR), THEN GET AWAY AND HIDE. THEY COME OUT WITH TORCHES AND THEY'RE NOT MUGS: THEY CHECK THE BUSHES, BINS, FENCES AND CARS BY THE DOOR FIRST, THEN THE STREET. BEST BET: RUN WELL CLEAR (OR ROUND A CORNER), THEN TUCK IN BEHIND COVER AND KEEP STILL. A '?' OVER A HEAD MEANS THEY'VE GLIMPSED YOU; '!' MEANS GOT YOU. MIND THE DOORBELL CAMERAS (BLINKING BLUE LIGHTS).`,
    help: [['SPACE', 'AT A DOOR: RING THE BELL'], ['HIDE', 'RUN WELL CLEAR FIRST; COVER BY THE DOOR GETS CHECKED FIRST'], ['KEEP STILL', 'MOVING IN A TORCH BEAM GIVES YOU AWAY FAST'], ['? THEN !', "THEIR SUSPICION: GET OUT OF THE BEAM BEFORE IT'S '!'"], ['COUPLES', 'TWO TORCHES; WHAT THEY SAY HINTS WHERE THEY LOOK NEXT']],
    init() { this.doors = pickDoors(centre.x, centre.y, n + 4, 380, 40).filter(d => !d.cam || Math.random() < 0.3); this.left = this.doors.slice(0, n); this.spare = this.doors.slice(n); this.done = 0; this.ring = null; this.res = null; this.time = 480; },
    targets() { if (this.ring || this.res) return M.inCover() ? [] : M.coverNear(pl().x, pl().y).map(c => ({ x: c.x, y: c.y, label: 'COVER', r: 1.2, col: '#9be15d' })); return this.left.map(d => ({ x: d.x, y: d.y, label: 'DOOR ' + (this.doors.indexOf(d) + 1), r: 2.5 })); },
    prompt() { if (this.ring) return 'RUN! GET WELL CLEAR OF THE DOOR, THEN HIDE'; if (this.res) return M.inCover() ? 'HIDDEN: KEEP STILL' : 'GET BEHIND COVER (GREEN RINGS) AND KEEP STILL'; return pl().onFoot && this.left.find(d => dist(pl(), d) < 3) ? useKey() + ' · RING THE DOORBELL' : ''; },
    objective() {
      if (this.res) { const sus = Math.max(...this.res.s.map(s => s.sus)); return (M.inCover() ? 'HIDDEN. KEEP STILL...' : 'HIDE! BEHIND COVER, OUT OF THE TORCHES') + (sus > 0.25 ? ' (THEY GLIMPSED YOU)' : ''); }
      return this.ring ? 'GET AWAY FROM THE DOOR BEFORE THEY OPEN IT!' : `DOORBELLS: ${this.done} OF ${n}`;
    },
    // who comes out: one grump (quick, thorough or with the dog), or a couple
    open(d) {
      const d0 = d.slot || d; const road = W.nearestEdge(d0.x, d0.y, 60); const out = road ? Math.atan2(road.y - d0.y, road.x - d0.x) : 0;
      const couple = Math.random() < 0.4 ? U.pick(COUPLES) : null; const type = couple ? 'couple' : U.pick(['quick', 'thorough', 'dog']);
      const repeat = Math.min(10, this.done * 4); const dur = Math.min(40, (type === 'quick' ? 20 : type === 'thorough' ? 32 : 26) + repeat);
      // where they look: cover by the door first, then the street either side, then back to the door
      const cover = M.coverNear(d0.x, d0.y, 18, couple ? 8 : 6).map(c => ({ x: c.x, y: c.y, kind: c.kind }));
      const street = road ? [-1, 1].map(sd => { const a = road.ang; return { x: road.x + Math.cos(a) * 22 * sd, y: road.y + Math.sin(a) * 22 * sd, kind: 'street' }; }).filter(q => VH.Nav.walkable(q.x, q.y)) : [];
      const n2 = couple ? 2 : 1; const s = [];
      for (let i = 0; i < n2; i++) {
        const side = n2 === 1 ? 0 : i ? 1 : -1; const mine = q => !side || Math.sign(Math.cos(out) * (q.y - d0.y) - Math.sin(out) * (q.x - d0.x)) === side || Math.abs(Math.cos(out) * (q.y - d0.y) - Math.sin(out) * (q.x - d0.x)) < 2;
        const pts = [...cover.filter(mine), ...street.filter(mine), { x: d0.x, y: d0.y, kind: 'door' }];
        const p = Spawn().ped('retiree', d.slot || { x: d0.x, y: d0.y, r: 0.6 }, { shirt: couple ? couple.shirts[i] : U.pick(['#b07aa8', '#7a8ab0', '#c08a6a']), tag: 'resident' }, side ? { d: 1, a: out + 1.6 * side } : null);
        p.state = 'idle'; p.stay = true; p.dog = type === 'dog';
        s.push({ p, pts, i: 0, sent: false, ang: out, torch: out, sus: 0, sniff: 0, name: couple ? couple.who[i] : '', grump: type === 'thorough' ? 1.35 : type === 'quick' ? 0.85 : 1, sp: type === 'quick' ? 3.4 : type === 'thorough' ? 2.0 : 2.4, heardT: 0 });
      }
      s[0].p.say(couple ? `WHO'S THERE?! ${couple.who[1]}, GET THE OTHER TORCH` : U.pick(GRUMBLES), 2.5);
      this.res = { s, d, d0, type, couple, t: 0, dur, chatT: 2.5, chat: 0 }; sfx('door'); d.lit = 30;
    },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('EVERYONE WENT TO BED');
      if (!this.ring && !this.res && this.left.length < n - this.done) return this.fail('THE WHOLE STREET IS AWAKE');
      if (this.ring) { this.ring.t -= dt; if (this.ring.t <= 0) { const d = this.ring.d; this.ring = null; this.open(d); } return; }
      if (!this.res) return;
      const r = this.res; r.t += dt; if (VH.Street.grab) return; // mid citizen's arrest
      const P = pl(), moving = Math.hypot(P.vx, P.vy) > 0.6, running = Math.hypot(P.vx, P.vy) > 6, hidden = M.inCover();
      for (const s of r.s) {
        const p = s.p; if (s.heardT > 0) s.heardT -= dt;
        // walk the list (the shared walking code does the moving), sweeping the torch
        const tgt = s.pts[Math.min(s.i, s.pts.length - 1)];
        if (p.state === 'goto' || p.state === 'idle') {
          if (p.state === 'idle' && Math.hypot(tgt.x - p.x, tgt.y - p.y) > 0.8 && !s.sent) { p.state = 'goto'; p.gx = tgt.x; p.gy = tgt.y; p.gotoSpeed = s.sp; s.sent = true; s.legT = 0; }
          else if ((p.state === 'idle' && (s.dwell = (s.dwell || 0) + dt) > 1.2) || (s.legT = (s.legT || 0) + dt) > 7) { if (s.i < s.pts.length - 1) s.i++; s.sent = false; s.dwell = 0; p.state = 'idle'; }
        }
        // the torch: pointed the way they walk, sweeping wider while they stand and look
        const want = p.state === 'goto' ? p.ang : s.ang; s.ang += U.angDiff(s.ang, want) * Math.min(1, dt * 3); p.ang = s.ang; s.torch = s.ang + Math.sin(r.t * (p.state === 'goto' ? 2.2 : 1.4) + s.sp) * (p.state === 'goto' ? 0.35 : 0.9);
        const px = P.x - p.x, py = P.y - p.y, pd = Math.hypot(px, py);
        const inBeam = pd < 16 && Math.abs(U.angDiff(s.torch, Math.atan2(py, px))) < 0.5 && VH.AI.los(p.x, p.y, P.x, P.y);
        const rate = !inBeam ? -0.35 : hidden ? (pd < 3 ? 1.2 : pd < 7 ? 0.4 : 0.1) : moving ? 2.4 : 1.3;
        s.sus = U.clamp(s.sus + rate * (rate > 0 ? s.grump : 1) * dt, 0, 1);
        if (s.sus > 0.25 && !s.said) { s.said = true; p.say('HELLO...?', 1.5); }
        if (s.sus < 0.1) s.said = false;
        // they heard that: a look over there next
        if (running && pd < 15 && !inBeam && !(s.heardT > 0)) { s.heardT = 4; s.pts.splice(s.i + (s.sent ? 1 : 0), 0, { x: P.x, y: P.y, kind: 'noise' }); p.say('WHAT WAS THAT?', 1.6); }
        // one of a couple glimpses you: calls the other over
        if (r.s.length > 1 && s.sus > 0.5 && !s.called) { s.called = true; const o = r.s.find(q => q !== s); o.pts.splice(o.i + 1, 0, { x: P.x, y: P.y, kind: 'call' }); o.sent = false; o.p.state = 'idle'; o.i = Math.min(o.i + 1, o.pts.length - 1); p.say(`OVER HERE, ${o.name}!`, 2); }
        if (s.p.dog) { if (pd < 6) { s.sniff += dt * (hidden ? 0.8 : 1.4); if (s.sniff > 0.8 && !s.barked) { s.barked = true; p.say('WOOF! WOOF!', 1.5); } } else s.sniff = Math.max(0, s.sniff - dt); }
        if (s.sus >= 1 || s.sniff > 1.6) {
          if (!P.onFoot) { s.sus = 0.5; s.sniff = 0; G().addMeter(0.6, 'SPOTTED FROM THE PORCH!'); continue; }
          FX.text(p.x, p.y - 4, s.sniff > 1.6 ? 'THE DOG FOUND YOU!' : 'GOT YOU!', '#ff6a5a'); G().addMeter(1, 'SPOTTED!');
          p.state = 'idle'; VH.Street.grabbed(p);
          this.left = this.left.filter(x => x !== r.d); if (this.spare.length) this.left.push(this.spare.shift());
          for (const q of r.s) { q.p.tag = null; q.p.stay = false; q.p.state = 'walk'; } this.res = null; return;
        }
      }
      // a couple talk it over, and give away where they're looking next
      if (r.couple) { r.chatT -= dt; if (r.chatT <= 0) { r.chatT = U.rand(3, 4.5); const a = r.s[r.chat % 2], b = r.s[(r.chat + 1) % 2]; r.chat++; const nx = a.pts[Math.min(a.i + 1, a.pts.length - 1)];
        const line = Math.random() < 0.5 && nx ? `I'LL CHECK ${coverWord(nx.kind)}, ${b.name}` : U.pick(r.couple.lines).replace('{B}', b.name); a.p.say(line, 2.6); if (r.couple.baby && Math.random() < 0.3) FX.text(r.d.x, r.d.y - 4, 'WAAAAH!', '#fff'); } }
      const far = dist(P, r.d0) > 45 && r.s.every(s => !VH.AI.los(s.p.x, s.p.y, P.x, P.y) || dist(s.p, P) > 30);
      r.farT = far ? (r.farT || 0) + dt : 0; const gaveUp = r.farT > 10 && r.t > 20; // well away and out of sight for 10 s, and they've looked for 20
      if (r.t > r.dur || gaveUp) { const far2 = gaveUp;
        // back inside, none the wiser
        this.done++; G().cash += 5; FX.text(r.d.x, r.d.y - 3, far2 ? 'MUST HAVE BEEN THE WIND' : r.couple ? 'BACK TO BED, ' + r.s[1].name : 'HMPH. BLOODY POSSUMS.', '#fff'); sfx('cash');
        this.left = this.left.filter(x => x !== r.d); for (const s of r.s) G().peds = G().peds.filter(q => q !== s.p); this.res = null;
        if (this.done >= n) return 'done';
      }
    },
    on(ev) {
      if (ev !== 'use' || this.ring || this.res || !pl().onFoot) return false;
      const d = this.left.find(d => dist(pl(), d) < 3); if (!d) return false;
      sfx('doorbell'); FX.text(d.x, d.y - 3, 'DING DONG!', '#ffd23a'); this.ring = { d, t: 3.2 }; return true;
    },
    cleanup() { if (this.res) { for (const s of this.res.s) { s.p.tag = null; s.p.stay = false; } this.res = null; } },
    torch() { return this.res ? this.res.s.map(s => ({ p: s.p, torch: s.torch, sus: s.sus })) : null; },
  });
  J.doughnuts = (metres = 250) => ({
    title: 'DOUGHNUTS ON THE GREEN', from: 'BRODIE', pay: 50, needsVehicle: true,
    requires() { const v = pl().vehicle; if (!pl().onFoot && v && !v.def.gopher && !v.def.bike) return null; const last = G().lastVeh; return last && !last.removed && !last.sinking && !last.dead ? null : M.Need.recover('A CAR', 'FIND ANOTHER CAR: THE LIGHT-BLUE MARKER SHOWS ONE NEARBY'); },
    brief: `LEGEND STATUS REQUIRES DOUGHNUTS ON THE GOLF COURSE. BORROW A CAR, GET TO THE VICTOR HARBOR GOLF CLUB AND CHEW UP ${metres}M OF FAIRWAY.`,
    init() { this.m = 0; this.time = 240; },
    targets() { return this.m > 0 ? [] : [{ ...G().places.golf, label: 'GOLF CLUB', r: 30 }]; },
    objective() { return !inVeh() ? 'BORROW A CAR (E NEAR ONE)' : `TYRE MARKS ON THE GOLF COURSE: ${Math.floor(this.m)}/${metres}M`; },
    update(dt) { this.time -= dt; if (this.time <= 0) return this.fail('THE GREENKEEPER WOKE UP'); if (this.m >= metres) return 'done'; },
    on(ev, d) {
      if (ev === 'tracks' && G().golfArea && U.pointInPoly(d.v.x, d.v.y, G().golfArea.p)) {
        const before = Math.floor(this.m / 50); this.m += d.len; if (Math.floor(this.m / 50) > before) { FX.text(pl().x, pl().y - 3, Math.floor(this.m) + 'M!', '#9be15d'); G().addMeter(0.15); }
      }
      return false;
    },
  });
  J.railRide = (kind, opts) => ({
    title: opts.title, from: opts.from, pay: opts.pay, brief: opts.brief, ownsVehicle(v) { return v === this.v; },
    init() { this.time = opts.time; this.v = G().specials[kind]; this.v.s = Math.min(this.v.s, 60); this.v.place(); },
    targets() { const v = this.v; if (pl().vehicle !== v) return [{ x: v.x, y: v.y, label: kind === 'tram' ? 'HORSE TRAM' : 'STEAM TRAIN', r: 4 }]; const [x, y] = U.alongPoly(v.route.p, v.route.cum, v.len - 8); return [{ x, y, label: opts.dest, r: 12, via: 'rail' }]; }, // reached by the tram or train you're driving
    objective() { return pl().vehicle === this.v ? `${opts.verb} (${Math.max(0, Math.floor(this.v.len - 20 - this.v.s))}M TO GO)` : `GET ON THE ${kind === 'tram' ? 'HORSE TRAM' : 'STEAM TRAIN'} (E)`; },
    update(dt) { this.time -= dt; if (this.time <= 0) return this.fail(opts.failMsg); if (pl().vehicle === this.v && this.v.s >= this.v.len - 20) { FX.confetti(pl().x, pl().y, 40); sfx(kind === 'tram' ? 'bell_tram' : 'whistle_train'); return 'done'; } },
  });
  J.bluff = (finale) => ({
    title: 'MIDNIGHT AT THE BLUFF', from: finale.from, pay: finale.pay, brief: finale.brief, needsVehicle: true,
    init() { this.stage = 0; this.t = 0; },
    targets() { return this.stage ? [] : [{ ...G().places.bluffTop, label: 'THE BLUFF', r: 30 }]; },
    objective() { return this.stage ? '...' : 'GET TO THE TOP OF THE BLUFF (ROSETTA HEAD)'; },
    update(dt) {
      if (this.stage === 0 && dist(pl(), G().places.bluffTop) < 45) {
        this.stage = 1; const h = G().hour; if (!(h >= 23.8 || h < 1)) { G().hour = 23.95; G().toast('YOU WAIT FOR MIDNIGHT. THE FOG ROLLS IN...', '#80fff0'); }
        const gw = G().ghostWhale; gw.x = pl().x + 40; gw.y = pl().y - 30; gw.home = { x: pl().x, y: pl().y - 20 }; G().forceGhost = true; sfx('ghost'); sfx('whale');
      }
      if (this.stage === 1) { this.t += dt; if (Math.random() < dt * 0.5) sfx('ghost', { vol: 0.4 }); if (this.t > 7) { G().forceGhost = false; return 'done'; } }
    },
  });
  // ---- grump ----
  J.letters = (n = 5) => ({
    title: 'STRONGLY WORDED LETTERS', from: 'MERV (TO HIMSELF)', pay: 15,
    brief: `FIVE LETTERS OF COMPLAINT. FIVE LETTERBOXES. PULL UP NEXT TO EACH ONE AND PRESS SPACE. NEATLY.`,
    init() { this.boxes = pickProps(PK.letterbox, 4300, 2500, n, 320, 60); this.boxes.forEach((b, i) => { b.no = i + 1; }); this.done = 0; this.time = 420; },
    targets() { return this.boxes.map((b, i) => ({ x: b.x, y: b.y, label: 'LETTERBOX ' + b.no, r: 3 })); },
    objective() { return `LETTERS: ${this.done} OF ${n}`; },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('THE POST HAS GONE');
      const b = this.boxes.find(b => dist(pl(), b) < 4 && (pl().onFoot || pl().vehicle.speed < 2.5));
      if (b && (this.auto || !pl().onFoot)) this.deliver(b);
      if (this.done >= n) return 'done';
    },
    deliver(b) { this.boxes = this.boxes.filter(x => x !== b); this.done++; sfx('pickup'); FX.paper(b.x, b.y, 3); FX.text(b.x, b.y - 3, b.up ? U.pick(['DEAR SIR OR MADAM...', 'TO WHOM IT MAY CONCERN', 'I AM WRITING TO COMPLAIN', 'FURTHERMORE...', 'P.S. TURN IT DOWN']) : 'POSTED... SORT OF', '#fff'); },
    on(ev) { if (ev === 'use') { const b = this.boxes.find(b => dist(pl(), b) < 4); if (b) { this.deliver(b); return true; } } return false; },
    prompt() { const b = this.boxes.find(b => dist(pl(), b) < 4); return b ? (pl().onFoot ? useKey() + ' · POST THE LETTER' : 'STOP HERE TO POST IT') : ''; },
  });
  J.unplug = (n = 3) => ({
    title: 'TURN THAT DOWN', from: 'MERV (TO HIMSELF)', pay: 30,
    reward(g) { g.upgrades.turbo = true; VH.Shops.applyGopher(); g.toast('YOUR GRANDSON SOUPED UP THE GOPHER. HOLD SHIFT TO BOOST!', '#38e0c8'); },
    brief: `THREE BACKYARD DOOF-DOOFS. GET CLOSE AND SHOUT (H) TO SCATTER THE KIDS, THEN KNOCK THE SPEAKER OVER.`,
    init() {
      // backyard parties: a backyard slot with room for the lot (speaker, esky, fairy lights, a trampoline if there's
      // space, and the partygoers dancing round it), reachable by gopher through the side gate
      this.spots = []; const yards = Spawn().many('backyard', n, { near: { x: 4100, y: 3000 }, maxDist: 700, spacing: 150, access: 'gopher', clearance: 4, claim: 900 });
      for (const y of yards) {
        const sp = VH.Props.add(PK.speaker, y.x, y.y, y.a, { mission: true });
        const e = Spawn().around(y, y.r - 1.2, y.a + Math.PI * 0.7); const esky = VH.Props.add(PK.esky, e.x, e.y, y.a, { mission: true });
        const kids = []; for (let i = 0; i < 5; i++) { const p = Spawn().ped('schoolie', y, { state: 'dance', tag: 'doof', home: { x: y.x, y: y.y } }, { d: 1.6 + (i % 2) * 1.1, a: i * 1.26 }); kids.push(p); }
        const party = VH.Yards ? VH.Yards.party(y) : null;
        this.spots.push({ sp, esky, kids, scattered: false, yard: y, party });
      }
      this.time = 300;
    },
    targets() { return this.spots.map((s, i) => ({ s, i })).filter(o => o.s.sp.up).map(o => ({ x: o.s.sp.x, y: o.s.sp.y, label: 'DOOF-DOOF ' + (o.i + 1), r: 8 })); },
    prompt() { const near = this.spots.find(s => s.sp.up && dist(pl(), s.sp) < 14); if (!near) return ''; if (!near.scattered) return (VH.Input.touchMode ? 'SHOUT' : 'H') + ' · SHOUT TO SCATTER THE KIDS'; return pl().onFoot ? (dist(pl(), near.sp) < 3 ? useKey() + ' · KNOCK THE SPEAKER OVER' : 'WALK UP TO THE SPEAKER') : 'GET OFF AND KNOCK THE SPEAKER OVER (OR DRIVE INTO IT)'; },
    objective() { const left = this.spots.filter(s => s.sp.up).length; return `DOOF-DOOFS: ${this.spots.length - left} OF ${this.spots.length}`; },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('THE DOOF GOES ON');
      for (const s of this.spots) if (s.sp.up && Math.random() < dt * 2 && dist(pl(), s.sp) < 120) FX.note(s.sp.x, s.sp.y);
      if (this.spots.every(s => !s.sp.up)) { this.cleanup(); return 'done'; }
    },
    cleanup() { for (const s of this.spots) { for (const k of s.kids) { k.tag = null; k.home = null; if (k.state === 'dance') k.state = 'walk'; } if (s.sp.up) { s.sp.up = false; s.sp.t = 1; s.sp.x = -999; s.sp.y = -999; } if (s.party && VH.Yards) VH.Yards.endParty(s.party); } },
    on(ev, p) {
      if (ev === 'shout') for (const s of this.spots) if (!s.scattered && dist(pl(), s.sp) < 14) { s.scattered = true; for (const k of s.kids) { k.state = 'flee'; k.t = -2; k.ang = Math.atan2(k.y - pl().y, k.x - pl().x); k.say(U.pick(['RUN!', 'ITS MERV!', 'SORRY MR!']), 2); } }
      if (ev === 'use') { const s = this.spots.find(s => s.sp.up && dist(pl(), s.sp) < 3); if (s) { VH.Props.topple(s.sp, pl().ang, 4, 'player'); return true; } }
      return false;
    },
  });
  J.bigRig = () => ({
    requires() { return pl().vehicle === this.truck || !this.truck ? null : M.Need.vehicle(this.truck, 'THE B-DOUBLE', 'THE B-DOUBLE IS GONE: THE JOB STARTS OVER WITH A NEW ONE AT THE DEPOT'); },
    title: 'THE BIG RIG', from: 'MERV (TO HIMSELF)', pay: 50,
    brief: "THERE'S A B-DOUBLE PARKED AT THE MAUDE STREET INDUSTRIAL ESTATE. 'BORROW' IT AND PARK IT ACROSS THE ESPLANADE BY WARLAND RESERVE. NOTHING GETS IN, NOTHING GETS OUT.",
    init() { let t = G().specials.truck; if (!t || t.removed || t.sinking || t.dead) { t = G().park('truck', G().places.industrial, { colour: '#c9372e' }); G().specials.truck = t; } this.truck = t; this.time = 360; this.goal = roadNear(G().places.warland.x, G().places.warland.y - 40, 120); },
    targets() { if (!this.truck) return []; if (pl().vehicle !== this.truck) return [{ x: this.truck.x, y: this.truck.y, label: 'B-DOUBLE', r: 6 }]; return [{ ...this.goal, label: 'PARK HERE', r: 14 }]; },
    objective() { return pl().vehicle !== this.truck ? 'GET IN THE B-DOUBLE' : this.truck.speed > 1 ? 'PARK IT BY WARLAND RESERVE' : 'STOP IN THE ZONE'; },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('THE PARTY GOT ITS ICE DELIVERY');
      if (!this.truck || this.truck.removed) return this.fail('YOU LOST THE TRUCK');
      if (pl().vehicle === this.truck && dist(this.truck, this.goal) < 16 && this.truck.speed < 1) { FX.text(this.truck.x, this.truck.y - 4, 'BLOCKED!', '#ffd23a'); return 'done'; }
    },
  });
  J.lightsOut = (n = 5) => ({
    requires() { let up = 0; VH.Props.near(G().places.warland.x, G().places.warland.y, 250, p => { if (p.k === PK.lamp && p.up && dist(p, G().places.warland) < 250) up++; }); return up < n - this.n ? M.Need.lost('THE STREET LIGHTS (NOT ENOUGH LEFT STANDING)') : null; },
    title: 'LIGHTS OUT', from: 'MERV (TO HIMSELF)', pay: 40,
    brief: `CAN'T PARTY IN THE DARK. KNOCK OVER ${n} STREET LIGHTS WITHIN 250M OF WARLAND RESERVE.`,
    init() { this.n = 0; this.time = 240; },
    targets() { const out = []; VH.Props.near(G().places.warland.x, G().places.warland.y, 250, p => { if (p.k === PK.lamp && p.up && out.length < 8 && dist(p, G().places.warland) < 250) out.push({ x: p.x, y: p.y, label: '', r: 1, small: true }); }); return out; },
    objective() { return `STREET LIGHTS: ${this.n} OF ${n}`; },
    update(dt) { this.time -= dt; if (this.time <= 0) return this.fail('THE PARTY IS STILL LIT'); if (this.n >= n) return 'done'; },
    on(ev, p) { if (ev === 'smash' && p.k === PK.lamp && dist(p, G().places.warland) < 250) this.n++; return false; },
  });
  J.shutdown = () => ({
    title: 'SHUT IT DOWN', from: 'MERV (TO HIMSELF)', pay: 100,
    brief: "SATURDAY. THE BIG ONE. GET TO WARLAND RESERVE, FLATTEN ALL FOUR SPEAKER STACKS AND BOTH INFLATABLE FLAMINGOS. BY GOPHER, BY TRUCK, BY WHATEVER.",
    init() { this.time = 300; },
    targets() { return G().partyProps.filter(p => p.up).map(p => ({ x: p.x, y: p.y, label: p.k === PK.speaker ? 'SPEAKER' : 'FLAMINGO', r: 2 })); },
    objective() { const all = G().partyProps.length, left = G().partyProps.filter(p => p.up).length; return `PARTY GEAR: ${all - left} OF ${all}`; },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('THE PARTY ROLLS ON TILL DAWN');
      if (G().partyProps.every(p => !p.up)) { G().partyOn = false; for (const p of G().peds) if (p.tag === 'party') { p.tag = null; p.home = null; p.state = 'flee'; p.t = -3; p.ang = U.rand(0, U.TAU); p.say(U.pick(['AWW MERV!', 'PARTY POOPER!', 'FAIR ENOUGH', 'SORRY MERV!']), 3); } return 'done'; }
    },
    on(ev) { if (ev === 'use') { const p = G().partyProps.find(p => p.up && dist(pl(), p) < 3); if (p) { VH.Props.topple(p, pl().ang, 4, 'player'); return true; } } return false; },
    prompt() { return pl().onFoot && G().partyProps.find(p => p.up && dist(pl(), p) < 3) ? useKey() + ' · KNOCK IT OVER' : ''; },
  });
  // ---- cop ----
  // Runners Kev catches on foot (the ding dong ditchers, the hoon once they bail). The walking code does the running
  // (state 'run' flees from Kev along routes that keep clear of him); this only decides the arrest:
  //   frozen by the megaphone, or cornered with nowhere to go, and Kev right there: E (or ACT) cuffs them, deliberately;
  //   still running and Kev runs into them: a flying tackle, then the struggle (keep hold till the cuffs are on).
  M.CUFF_R = 2.4;
  const Run = M.Run = {
    pinned: k => (k.frozen > 0 && k.frozen < 50) || k.cornered,
    canCuff(k) { const p = pl(); return p.onFoot && !k.cuffed && !k.caught && Run.pinned(k) && dist(k, p) < M.CUFF_R && G().arrestAllowed(k) && G().arrestAllowed('player'); },
    prompt(list) { const k = list.find(Run.canCuff); if (k) return (VH.Input.touchMode ? 'ACT' : 'E') + ' · CUFF'; const p = pl(); if (p.onFoot && list.some(k => !k.cuffed && !k.caught && !Run.pinned(k) && dist(k, p) < 28)) return (VH.Input.touchMode ? 'MEGA' : 'H') + ' · MEGAPHONE: FREEZE THEM'; return ''; },
    tryCuff(list) { if (M.cuffing) return false; const k = list.find(Run.canCuff); if (!k) return false; M.cuffing = { k, t: 0 }; sfx('clang', { pitch: 1.6, vol: 0.4 }); k.say(U.pick(['AW, COME ON...', 'OK, OK!', 'THIS IS SO UNFAIR']), 1.5); return true; },
    update(k, dt, rank, onCuffed, slipLine) {
      const p = pl();
      // the freeze countdown slows right down while Kev is beside them, so the cuffs are a choice, not a race
      if (k.frozen > 0 && k.frozen < 50 && p.onFoot && dist(k, p) < M.CUFF_R + 1) k.frozen += dt * 0.7;
      const c = M.cuffing;
      if (c && c.k === k) { k.frozen = Math.max(k.frozen || 0, 0.4); if (!p.onFoot || dist(k, p) > M.CUFF_R + 1.5) M.cuffing = null; else if ((c.t += dt) > 0.7) { M.cuffing = null; k.cuffed = true; k.frozen = 0; onCuffed(); } return; }
      if (p.onFoot && dist(k, p) < 1.6 && !k.cuffed && !Run.pinned(k) && !VH.Tackle.on && !(k.slipT > 0) && G().arrestAllowed(k) && G().arrestAllowed('player')) {
        k.frozen = 99; VH.Tackle.start({ mode: 'hold', rank, who: k, onWin: () => { k.frozen = 0; k.cuffed = true; onCuffed(); }, onLose: () => { k.frozen = 0; k.slipT = 2.5; k.cornered = false; k.path = null; k.say(slipLine || 'SEE YA, KEV!', 2); } });
      }
      if (k.slipT > 0) k.slipT -= dt;
      if (k.frozen >= 50 && (!VH.Tackle.on || VH.Tackle.on.who !== k)) k.frozen = 0;
    },
    // over a runner: the freeze ring and FROZEN: GET CLOSE, CORNERED, then E · CUFF and the cuffing ring
    draw(ctx, k, left, top, S) {
      if (k.caught || k.cuffed) return; const sx = Math.round((k.x - left) * S), sy = Math.round((k.y - top) * S);
      const c = M.cuffing && M.cuffing.k === k ? M.cuffing : null; const frozen = k.frozen > 0 && k.frozen < 50;
      if (!frozen && !k.cornered && !c) return;
      const R = 11; ctx.lineWidth = 2;
      if (c) { ctx.strokeStyle = '#9be15d'; ctx.beginPath(); ctx.arc(sx, sy, R, -Math.PI / 2, -Math.PI / 2 + U.TAU * Math.min(1, c.t / 0.7)); ctx.stroke(); }
      else if (frozen) { ctx.strokeStyle = 'rgba(18,12,36,0.7)'; ctx.beginPath(); ctx.arc(sx, sy, R, 0, U.TAU); ctx.stroke(); ctx.strokeStyle = '#9fd4ec'; ctx.beginPath(); ctx.arc(sx, sy, R, -Math.PI / 2, -Math.PI / 2 + U.TAU * Math.min(1, k.frozen / 2.5)); ctx.stroke(); }
      else { ctx.strokeStyle = Math.floor(G().t * 4) % 2 ? '#9fd4ec' : '#fff'; ctx.beginPath(); ctx.arc(sx, sy, R, 0, U.TAU); ctx.stroke(); }
      ctx.lineWidth = 1;
      const key = VH.Input.touchMode ? 'ACT' : 'E';
      const txt = c ? 'CUFFING...' : Run.canCuff(k) ? key + ' · CUFF' : frozen ? 'FROZEN: GET CLOSE' : 'CORNERED: GET CLOSE';
      const tw = U.textWidth(txt, 1); const ty = sy - R - 13; const hot = !c && Run.canCuff(k);
      ctx.fillStyle = hot ? 'rgba(20,60,30,0.9)' : 'rgba(18,12,36,0.85)'; ctx.fillRect(sx - tw / 2 - 3, ty - 3, tw + 6, 13); ctx.fillStyle = hot ? '#9be15d' : '#9fd4ec'; ctx.fillRect(sx - tw / 2 - 3, ty - 3, tw + 6, 1);
      U.text(ctx, txt, sx, ty, { align: 'center', color: hot ? '#fff' : '#9fd4ec' });
    },
  };
  // Gopher pull-overs, three ways: a police car with the siren on, sitting behind them; on foot, calling them over (H)
  // and staying close; or any commandeered car with the magnetic light on the roof (L). About two seconds in range.
  const RIDERS = [['MR', 'HARGREAVES'], ['MRS', 'PEMBERTON'], ['MR', 'OKONJO'], ['MRS', 'DELAHUNTY'], ['MR', 'FITZWALTER'], ['MRS', 'KOWALCZYK'], ['MR', 'TREGEAR'], ['MRS', 'ABERNATHY'], ['MR', 'VASSALLO'], ['MRS', 'McGILLICUDDY']];
  const CALLS = [
    r => `PULL OVER, ${r.sm}! YES, YOU, ON THE SCOOTER!`, r => `${r.sm === 'SIR' ? 'SIR' : 'MADAM'}, THAT'S A MAIN ROAD, NOT A FOOTPATH!`, r => `EASE OFF THE THROTTLE THERE, ${r.name}`,
    r => `KERBSIDE, PLEASE, ${r.name}!`, r => `${r.name}! A QUICK WORD!`, r => `HAZARDS ON AND PULL IN, ${r.sm}!`,
  ];
  M.PULL_T = 2;
  J.gopherPatrol = (n = 5) => ({
    title: 'GOPHER PATROL', from: 'SARGE', pay: 30,
    brief: `KEV, COMPLAINTS ABOUT GOPHERS ON THE MAIN ROADS AGAIN. PULL OVER ${n} OF THEM. STAY CLOSE FOR TWO SECONDS ANY OF THREE WAYS: IN A POLICE CAR WITH THE SIREN ON (H); ON FOOT, CALL THEM OVER (H) AND KEEP UP; OR IN ANY CAR WITH THE MAGNETIC LIGHT ON THE ROOF (L, THEN H). CAR WRECKED? RADIO FOR A SPARE (B).`,
    help: [['H IN A POLICE CAR', 'SIREN ON, STAY WITHIN 16M OF A GOPHER FOR 2 S'], ['H ON FOOT', 'NEAR A GOPHER: CALL THEM OVER, THEN STAY WITHIN 16M FOR 2 S'], ['L', 'IN A COMMANDEERED CAR: MAGNETIC LIGHT ON THE ROOF, THEN H FOR THE SIREN'], ['B', 'POLICE CAR WRECKED OR SUNK: A SPARE IS DROPPED OFF; THE WRECK IS TOWED'], ['RING', 'THE RING OVER A GOPHER FILLS AS YOU PULL THEM OVER']],
    init() { this.done = 0; this.time = 360; this.marked = []; this.names = RIDERS.slice().sort(() => Math.random() - 0.5); this.spawn(); },
    spawn() {
      while (this.marked.length < n - this.done) {
        const k = Spawn().pick('kerb', { near: pl(), minDist: 120, maxDist: 380, main: true, offscreen: true, unoccupied: true, claim: 30, optional: true }) || Spawn().pick('kerb', { near: pl(), minDist: 120, maxDist: 700, offscreen: true, unoccupied: true, claim: 30, optional: true }); if (!k) break; // none about: try again next frame
        const v = Spawn().vehicle('gopher', k, { colour: U.pick(['#c4372e', '#2e5a9a', '#3d7a3a']) }); Spawn().drive(v, k); v.mission = true; v.rider = true; v.pullT = 0; v.hailT = 0;
        const [t, nm] = this.names[(this.done + this.marked.length) % this.names.length]; v.riderName = { name: t + ' ' + nm, sm: t === 'MR' ? 'SIR' : 'MADAM' };
        this.marked.push(v);
      }
    },
    targets() { return this.marked.filter(v => !v.removed).map(v => ({ x: v.x, y: v.y, label: v.riderName.name, r: 3, col: v.pullT > 0 ? '#9be15d' : undefined })); },
    prompt() { return pl().onFoot && this.marked.some(v => !v.removed && dist(v, pl()) < 18) ? (VH.Input.touchMode ? 'MEGA' : 'H') + ' · CALL THE GOPHER OVER, THEN STAY CLOSE' : ''; },
    rings() { return this.marked.filter(v => !v.removed && v.pullT > 0).map(v => ({ x: v.x, y: v.y, p: v.pullT / M.PULL_T, txt: 'PULLING OVER' })); },
    cleanup() { for (const v of this.marked) { v.mission = false; v.hailT = 0; } },
    objective() { return `GOPHERS: ${this.done} OF ${n}`; },
    // H on foot near a gopher: call it over (instead of the megaphone)
    on(ev) {
      if (ev !== 'kevShout' || !pl().onFoot) return false;
      const v = this.marked.filter(v => !v.removed && dist(v, pl()) < 18).sort((a, b) => dist(a, pl()) - dist(b, pl()))[0]; if (!v) return false;
      v.hailT = 3; FX.text(pl().x, pl().y - 4, U.pick(CALLS)(v.riderName), '#9fd4ec'); sfx('megaphone', { vol: 0.6 }); return true;
    },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('THE GOPHERS GOT AWAY (SLOWLY)');
      const pv = pl().vehicle;
      for (const v of this.marked) {
        if (v.removed) continue; if (v.hailT > 0) v.hailT -= dt;
        const inCar = pv && pv.siren && dist(pv, v) < 16, onFoot = pl().onFoot && v.hailT > 0 && dist(pl(), v) < 16;
        if (inCar || onFoot) {
          v.pullT += dt;
          if (v.pullT > M.PULL_T) { this.done++; v.ai = null; v.mission = false; v.throttle = 0; v.hailT = 0; FX.text(v.x, v.y - 3, U.pick(["I'M DOING 10, OFFICER!", 'IS THIS ABOUT THE ROSES?', 'MY HIP, KEVIN!', 'I HAVE A PERMIT FOR THIS!']), '#fff'); FX.text(v.x, v.y - 6, 'TICKETED +$10', '#ffd23a'); G().cash += 10; sfx('cash'); v.pulled = true; }
        } else v.pullT = Math.max(0, v.pullT - dt * 0.5);
      }
      this.marked = this.marked.filter(v => !v.pulled && !v.removed);
      if (this.done >= n) return 'done';
      if (this.marked.length < n - this.done) this.spawn();
    },
  });
  const KIDS = ['TAYLA', 'BRAYDEN', 'MADDISON', 'KAI', 'JAYDEN', 'CHLOE'];
  J.catchDitchers = (n = 3) => ({
    title: 'DING DONG DITCHERS', from: 'SARGE', pay: 40,
    brief: `PHONE'S RINGING OFF THE HOOK: KIDS RINGING DOORBELLS IN ENCOUNTER BAY. CATCH ${n} OF THEM ON FOOT. 1) GET OUT AND CHASE. 2) THE MEGAPHONE (H) FREEZES EVERY KID WITHIN 30M FOR 2.5 SECONDS; THE RING OVER THEM SHOWS THE TIME LEFT. 3) GET RIGHT UP CLOSE AND PRESS E TO CUFF. CORNER ONE IN A YARD AND THEY GIVE UP: E TO CUFF. RUN INTO ONE THAT ISN'T FROZEN AND IT'S A TACKLE: HOLD SPACE TO KEEP HOLD TILL THE CUFFS ARE ON.`,
    help: [['H (MEGAPHONE)', 'FREEZES EVERY KID WITHIN 30M FOR 2.5 S; THE RING SHOWS THE TIME LEFT (IT SLOWS WHEN YOU\'RE CLOSE)'], ['E / ACT', 'NEXT TO A FROZEN OR CORNERED KID: CUFF THEM'], ['CORNER', 'BLOCK THE ONLY WAY OUT OF A YARD AND THEY GIVE UP'], ['RUN INTO ONE', 'A KID WHO ISN\'T FROZEN: A TACKLE. HOLD SPACE, KEEP THE MARK IN THE GREEN; ARROW THE WAY IT SAYS ON GRIP']],
    init() {
      this.kids = []; const doors = pickDoors(2900, 4300, 18, 450, 25).map(d => ({ d, at: d.slot }));
      for (let i = 0; i < n && doors.length; i++) {
        const route = doors.slice(i * 5, i * 5 + 6); const r = route.length >= 2 ? route : doors.slice(0, 6); const s = r[0].at;
        const p = Spawn().ped('schoolie', s, { tag: 'ditcher' }); p.label = 'DITCHER ' + (i + 1) + ': ' + KIDS[i % KIDS.length]; p.route = r; p.ri = 1; p.speed = 1.6; p.runSpeed = 7.6; p.threat = pl();
        p.state = 'goto'; p.gx = r[1 % r.length].at.x; p.gy = r[1 % r.length].at.y; this.kids.push(p);
      }
      this.done = 0; this.time = 300; M.cuffing = null;
    },
    targets() { return this.kids.filter(k => !k.caught).map(k => ({ x: k.x, y: k.y, label: k.label + (Run.pinned(k) ? (k.cornered ? ' (CORNERED)' : ' (FROZEN)') : ''), r: 2, col: Run.pinned(k) ? '#9fd4ec' : undefined, noWorldLabel: Run.pinned(k) })); },
    runners() { return this.kids; },
    cleanup() { for (const k of this.kids) { if (k.prisoner) continue; k.tag = null; k.threat = null; if (!k.caught) { k.state = 'walk'; k.ai = null; k.frozen = 0; } } M.cuffing = null; },
    objective() { const pin = this.kids.find(k => !k.caught && Run.pinned(k)); return `DITCHERS: ${this.done} OF ${n}` + (pin ? (Run.canCuff(pin) ? ' · E TO CUFF' : ' · ONE IS PINNED: GET CLOSE') : ''); },
    update(dt) {
      this.time -= dt; if (this.time <= 0) return this.fail('THEY ALL GOT HOME TO MUM');
      for (const k of this.kids) {
        if (k.caught || k.cuffed) continue;
        const dK = dist(k, pl());
        // doorbell rounds until Kev turns up; then they leg it (the walking code picks the route), and calm down once clear
        if (!k.fleeing && dK < 14) { k.fleeing = true; k.say(U.pick(['RUN!', "IT'S THE COPS!", 'LEG IT!'])); }
        if (k.fleeing && dK > 55) { k.fleeing = false; k.state = 'walk'; }
        if (k.fleeing && (k.state === 'goto' || k.state === 'idle' || k.state === 'walk')) k.state = 'run';
        else if (!k.fleeing && k.state === 'idle') { const d = k.route[k.ri % k.route.length]; if (d) { sfx('doorbell', { vol: dK < 80 ? 0.4 : 0 }); d.d.lit = 5; } k.ri++; const nd = k.route[k.ri % k.route.length].at; k.state = 'goto'; k.gx = nd.x; k.gy = nd.y; }
        else if (!k.fleeing && k.state === 'walk') { const nd = k.route[k.ri % k.route.length].at; k.state = 'goto'; k.gx = nd.x; k.gy = nd.y; }
        if (k.cornered && !k.saidCorner) { k.saidCorner = true; k.say(U.pick(['OK, OK! NOWHERE TO GO...', 'YOU GOT ME, KEV.', 'DEAD END. GREAT.']), 2.5); FX.text(k.x, k.y - 6, 'CORNERED!', '#9fd4ec'); } else if (!k.cornered) k.saidCorner = false;
        Run.update(k, dt, 'kid', () => this.caught(k));
      }
      if (this.done >= n) return 'done';
    },
    caught(k) {
      k.caught = true; k.cornered = false; sfx('clang', { pitch: 2.2, vol: 0.6 }); FX.text(k.x, k.y - 10, 'CLICK!', '#c9ccd8'); this.done++;
      k.say(U.pick(["WASN'T ME!", 'MY DAD KNOWS THE MAYOR!', 'FAIR COP.']), 3); FX.text(k.x, k.y - 7, 'NABBED +$10', '#ffd23a'); G().cash += 10; sfx('cash'); VH.Escort.add(k, 'A DING DONG DITCHER');
    },
    on(ev) { if (ev === 'cuff' || ev === 'use') return Run.tryCuff(this.kids.filter(k => !k.caught)); return false; },
    prompt() { return Run.prompt(this.kids.filter(k => !k.caught)); },
  });
  J.hoonChase = () => ({
    title: 'HOON ON THE ESPLANADE', from: 'SARGE', pay: 60,
    brief: "KEV, A HOON IN A RED HATCH IS DOING DOUGHNUTS DOWN ON THE ESPLANADE. STOP THEM: NUDGE A BACK CORNER TO SPIN THEM (PIT), DROP A SPIKE STRIP (X) IN THEIR PATH, OR CALL BACKUP (B) TO BOX THEM IN. THEN DRIVE THEM UP THE HILL TO THE LOCK-UP.",
    init() {
      const k = Spawn().pick('kerb', { near: { x: 4760, y: 2800 }, maxDist: 160, access: 'car', nearest: true, unoccupied: true }); if (!k) { this.v = null; this.broken = true; return; }
      const v = Spawn().vehicle('hatch', k, { colour: '#d6302a' }); Spawn().drive(v, k); v.ai.mode = 'hoon'; v.mission = true; v.hoon = true;
      this.v = v; this.stage = 0; this.time = 360; this.caughtT = 0; this.delivered = false; this.runner = null;
    },
    chase() { return this.stage === 0 && this.v && this.v.ai && this.v.ai.flee ? this.v : null; },
    targets() { if (this.stage === 0) { const t = this.runner || this.v; return [{ x: t.x, y: t.y, label: 'HOON', r: 4 }]; } return []; }, // then the prisoner and the desks are marked by the escort
    objective() {
      if (this.stage === 1) return VH.Escort.objective() || 'HAND THE HOON OVER AT THE LOCK-UP OR THE STATION';
      if (this.runner) return Run.canCuff(this.runner) ? 'E TO CUFF THE HOON' : Run.pinned(this.runner) ? 'THE HOON IS PINNED: GET CLOSE AND CUFF (E)' : 'THE HOON IS ON FOOT: MEGAPHONE (H) TO FREEZE, THEN E TO CUFF; OR TACKLE';
      return this.v.ai && this.v.ai.flee ? 'STOP THE HOON: PIT (RAM A BACK CORNER), SPIKES (X), BACKUP (B)' : 'FIND THE HOON ON THE ESPLANADE';
    },
    update(dt) {
      if (this.broken) return this.fail('THE HOON WENT HOME (NOWHERE TO START FROM)');
      if (this.stage === 0) { this.time -= dt; if (this.time <= 0) return this.fail('THE HOON WENT HOME FOR TEA'); } else this.timed = false; // no clock once they're cuffed
      const v = this.v;
      if (this.stage === 0) {
        if (v.removed || v.sinking) return this.fail('THE HOON ENDED UP IN THE DRINK. NO HARM DONE, LOTS OF PAPERWORK.');
        const ai = v.ai;
        if (this.runner) {
          const r = this.runner; r.fleeing = true; r.threat = pl();
          if (!r.cuffed && (r.state === 'walk' || r.state === 'flee' || r.state === 'idle' || r.state === 'goto')) r.state = 'run';
          Run.update(r, dt, 'hoon', () => {}, 'TOO SLIPPERY FOR YOU, KEV!');
          if (r.cuffed && this.stage === 0) {
            this.stage = 1; sfx('clang', { pitch: 2.2, vol: 0.6 }); FX.text(r.x, r.y - 10, 'CLICK!', '#c9ccd8');
            r.say(U.pick(['FAIR COP, OFFICER.', 'I WAS JUST WARMING THE TYRES!', "DON'T TELL MUM."]), 3); VH.Escort.add(r, 'THE HOON');
          }
          if (dist(pl(), r) > 400) return this.fail('THE HOON GOT AWAY ON FOOT');
        } else if (ai && ai.mode === 'hoon') {
          // doughnuts until Kev turns up
          v.throttle = 1; v.steer = 1; v.handbrake = Math.sin(G().t * 1.5) > -0.3 ? 1 : 0; v.brake = 0;
          if (dist(pl(), v) < 45) { ai.mode = 'cruise'; ai.flee = pl(); v.def.maxV = 33; ai.s = 0; const n = W.nearestEdge(v.x, v.y, 40); if (n) { ai.e = n.e; ai.s = n.s; ai.dir = 1; } G().toast('THE HOON HAS SPOTTED YOU!', '#ff6a5a'); sfx('horn'); }
        } else if (ai) {
          ai.flee = pl();
          const pv = pl().vehicle; const near = dist(pl(), v) < 12;
          const stopped = v.speed < 2.5 || v.dead || (v.flat && v.speed < 5);
          this.caughtT = near && stopped ? this.caughtT + dt : Math.max(0, this.caughtT - dt * 0.5);
          if (this.caughtT > 0.8 && !this.runner) {
            // the hoon bails out and legs it: Kev gets out and runs them down
            v.ai = null; v.mission = false; v.throttle = 0; v.brake = 1; v.handbrake = 1;
            const a = Math.atan2(v.y - pl().y, v.x - pl().x); const at = VH.Nav.snap(v.x + Math.cos(a) * 2, v.y + Math.sin(a) * 2, 6) || VH.Nav.snap(v.x, v.y, 12) || v; const r = new VH.Ped('schoolie', at.x, at.y, { tag: 'hoon', shirt: '#d6302a' }); // out of the car beside it, on standable ground
            r.state = 'run'; r.threat = pl(); r.runSpeed = 8; r.ang = a; r.say('NOT TODAY, KEV!', 2); r.label = 'HOON'; G().peds.push(r); this.runner = r; G().toast('THE HOON HAS BAILED! GET OUT AND CATCH THEM', '#ff6a5a');
          }
          if (dist(pl(), v) > 650) return this.fail('THE HOON GOT AWAY');
        }
      } else if (this.delivered) return 'done';
    },
    prompt() { return this.runner && this.stage === 0 ? Run.prompt([this.runner]) : ''; },
    requires() { if (this.delivered) return null; if (this.runner) return M.Need.ped(this.runner, 'THE HOON'); return null; },
    runners() { return this.runner && this.stage === 0 ? [this.runner] : []; },
    on(ev, d) { if (ev === 'deliver' && this.stage === 1 && d.includes('THE HOON')) this.delivered = true; if ((ev === 'cuff' || ev === 'use') && this.runner && this.stage === 0) return Run.tryCuff([this.runner]); return false; },
    cleanup() { if (this.v) { this.v.mission = false; if (this.v.ai) { this.v.ai.flee = null; this.v.ai.mode = 'cruise'; } } if (this.runner) { if (!this.runner.prisoner) { this.runner.tag = null; this.runner.threat = null; if (!this.runner.cuffed) this.runner.state = 'walk'; } this.runner = null; } M.cuffing = null; },
  });
  J.bins = (n = 8) => ({
    title: 'BIN NIGHT BANDITS', from: 'SARGE', pay: 30,
    brief: `SOME LITTLE DARLINGS KNOCKED OVER EVERY BIN IN THE STREET. COMMUNITY POLICING, KEV. ON FOOT, STAND ${n} BINS BACK UP (SPACE).`,
    init() {
      const c = pl(); this.bins = pickProps([PK.binR, PK.binY, PK.binG], c.x + 200, c.y - 100, n, 500, 6);
      if (this.bins.length < n) this.bins = this.bins.concat(pickProps([PK.binR, PK.binY, PK.binG], 4200, 2400, n - this.bins.length, 600, 6));
      for (const b of this.bins) { b.up = false; b.fa = U.rand(0, U.TAU); b.t = 1; }
      this.done = 0; this.time = 300;
    },
    targets() { return this.bins.map((b, i) => ({ b, i })).filter(o => !o.b.up).map(o => ({ x: o.b.x, y: o.b.y, label: 'BIN ' + (o.i + 1), r: 2 })); },
    prompt() { return pl().onFoot && this.bins.find(b => !b.up && dist(pl(), b) < 2.5) ? useKey() + ' · STAND THE BIN UP' : ''; },
    objective() { return `BINS: ${this.done} OF ${this.bins.length}` + (pl().onFoot ? '' : ' (GET OUT OF THE CAR)'); },
    update(dt) { this.time -= dt; if (this.time <= 0) return this.fail('THE BIN TRUCK CAME AND WENT'); if (this.done >= this.bins.length) return 'done'; },
    on(ev) { if (ev === 'use' && pl().onFoot) { const b = this.bins.find(b => !b.up && dist(pl(), b) < 2.5); if (b) { b.up = true; b.t = 1; this.done++; sfx('clang', { pitch: 1.2, vol: 0.5 }); FX.text(b.x, b.y - 3, U.pick(['TIDY!', 'COMMUNITY SPIRIT!', 'THERE WE GO.']), '#9be15d'); return true; } } return false; },
  });
  // Taking over a runaway: catch up, press E alongside to leap aboard (you ride the step and it keeps going), then win
  // the takeover struggle (the shared tackle.js struggle with its own words) to take the controls. Lose and you're thrown
  // off with a tuck-and-roll and have to catch up again. Shared, so other boardings (boats, say) can use it:
  //   M.Takeover.canBoard(vehicle, reach) and M.Takeover.board(vehicle, { rank, text, onWin, onLose })
  M.Takeover = {
    canBoard(v, reach = 4.5) {
      const p = pl(); if (p.aboard || VH.Tackle.on || !v || v.removed) return false;
      const parts = v.parts ? v.parts.filter(q => !q.horse) : [v]; const r = reach + (p.onFoot ? 0 : 2.5);
      return parts.some(q => Math.hypot(q.x - p.x, q.y - p.y) < r);
    },
    board(v, o) {
      const g = G(), p = pl();
      if (!p.onFoot && p.vehicle) { const car = p.vehicle; car.driver = null; car.throttle = car.brake = car.steer = 0; car.handbrake = 0; car.coastT = 6; car.siren = false; p.vehicle = null; p.onFoot = true; } // leap across from the car
      p.aboard = v; p.rollT = 0; p.dizzyT = 0; sfx('thud', { vol: 0.7 }); FX.dust(p.x, p.y, '#c8bfa0', 6);
      VH.Tackle.start({ mode: 'hold', rank: o.rank, who: v, text: o.text,
        onWin: () => { p.aboard = null; v.missionDrive = false; g.enter(v, true); o.onWin && o.onWin(); },
        onLose: () => { p.aboard = null; const s = g.exitSpot(v); p.x = s.x; p.y = s.y; g.bailRoll(v.vx, v.vy, Math.max(10, v.speed + 6), null); o.onLose && o.onLose(); } });
    },
  };
  J.runaway = (kind, o) => ({
    title: o.title, from: 'SARGE', pay: o.pay, brief: o.brief, help: o.help, ownsVehicle(v) { return v === this.t; },
    init() {
      const t = G().specials[kind]; t.s = o.startS; t.v = 0; t.place(); t.missionDrive = true; t.throttle = 1; t.brake = 0; this.age = 0; if (o.maxV) t.maxV = o.maxV; this.t = t; this.stage = 0; this.stopT = 0; this.time = null; this.throws = 0;
      if (o.crew) { this.crew = new VH.Ped('schoolie', t.x, t.y, { tag: 'tramkid' }); this.crew.state = 'ride'; G().peds.push(this.crew); }
    },
    part() { const t = this.t; return t.parts.find(q => !q.horse) || t; },
    targets() { if (this.stage === 1 || pl().aboard) return []; const q = this.part(); return [{ x: q.x, y: q.y, label: o.label, r: 6, via: 'rail' }]; }, // on the rails: you catch it alongside
    chase() { return this.stage === 0 ? this.t : null; },
    prompt() { return this.stage === 0 && M.Takeover.canBoard(this.t) ? (VH.Input.touchMode ? 'GET IN' : 'E') + ' · LEAP ABOARD' : ''; },
    objective() {
      if (this.stage === 1) return `NOW STOP IT: BRAKE (S). ${Math.round(this.t.speed * 3.6)} KM/H`;
      if (pl().aboard) return o.fightObj;
      return `CATCH UP AND PRESS E ALONGSIDE TO LEAP ABOARD (${Math.max(0, Math.round(this.t.len - 20 - this.t.s))}M OF TRACK LEFT)`;
    },
    update(dt) {
      const t = this.t; if (this.crew) { const cp = t.parts[1] || t; if (this.crew.state === 'ride') { this.crew.x = cp.x; this.crew.y = cp.y; this.crew.ang = cp.a || 0; } }
      if (this.stage === 0) {
        // it bolts once you're within a few hundred metres (or after a minute), so it's a chase you can win from anywhere
        this.age = (this.age || 0) + dt; const off = dist(pl(), t) < 250 || this.age > 60; t.missionDrive = true; t.throttle = off ? 1 : 0; t.brake = 0; // waiting: stands still (a rail brake at rest would reverse it) if (o.whistle && Math.random() < dt * 0.15) sfx('whistle_train', { vol: 0.5 });
        if (t.s >= t.len - 20) { t.missionDrive = false; return this.fail(o.failMsg); }
      } else {
        // you're driving it: bring it to a stop
        if (pl().vehicle !== t) { this.stage = 0; G().toast("YOU'VE LET GO. IT'S A RUNAWAY AGAIN!", '#ff6a5a'); return; }
        if (t.speed < 0.6) { this.stopT += dt; if (this.stopT > 0.3) { FX.text(t.x, t.y - 5, o.doneLine, '#fff'); if (this.crew && !this.crew.prisoner) { const s = G().exitSpot(t); this.crew.x = s.x; this.crew.y = s.y; VH.Escort.add(this.crew, o.culprit); } else if (!this.crew) VH.Escort.spawn(o.culprit, t.x, t.y); return 'done'; } } else this.stopT = 0;
        if (t.s >= t.len - 12) return this.fail(o.failMsg);
      }
    },
    on(ev) {
      if (ev !== 'board' || this.stage !== 0 || !M.Takeover.canBoard(this.t)) return false;
      M.Takeover.board(this.t, { rank: o.rank, text: o.text,
        onWin: () => { this.stage = 1; G().toast(o.winToast, '#9be15d'); if (this.crew) this.crew.say('WE WERE GONNA BRING IT BACK!', 3); },
        onLose: () => { this.throws++; G().toast("THROWN OFF! CATCH UP AND HAVE ANOTHER GO", '#ff6a5a'); } });
      return true;
    },
    cleanup() { const t = this.t; t.missionDrive = false; if (o.maxV) t.maxV = o.restoreV; if (pl().aboard === t) pl().aboard = null; if (VH.Tackle.on && VH.Tackle.on.who === t) VH.Tackle.on = null; if (this.crew && !this.crew.prisoner) { this.crew.tag = null; if (this.crew.state === 'ride') { this.crew.state = 'flee'; this.crew.t = 0; } } },
  });
  J.runawayTram = () => J.runaway('tram', {
    title: 'RUNAWAY TRAM', pay: 50, label: 'TRAM', startS: 30, crew: true, rank: 'horse', culprit: 'THE TRAM-JACKER', failMsg: 'THEY MADE IT TO GRANITE ISLAND',
    brief: "SCHOOLIES HAVE PINCHED THE HORSE TRAM AND THEY'RE HEADING FOR GRANITE ISLAND. 1) CATCH UP, ON FOOT OR IN THE CAR. 2) PRESS E ALONGSIDE TO LEAP ABOARD. 3) THE HORSE IS SPOOKED: HOLD SPACE TO KEEP THE REINS IN THE SWEET SPOT AS IT BUCKS, AND ARROW THE WAY IT SAYS. 4) WIN AND YOU'RE DRIVING: BRAKE (S) TO A STOP. LOSE AND YOU'RE THROWN OFF; CATCH UP AND TRY AGAIN.",
    help: [['E ALONGSIDE', 'LEAP ABOARD THE RUNAWAY (ON FOOT OR FROM THE CAR)'], ['HOLD SPACE', 'KEEP THE REINS IN THE SWEET SPOT; ARROW THE WAY IT SAYS'], ['S', 'ONCE YOU HAVE THE REINS: BRAKE TO A STOP'], ['THROWN OFF', 'A TUCK-AND-ROLL; CATCH UP AND GO AGAIN']],
    fightObj: 'CALM THE HORSE: HOLD SPACE, KEEP THE REINS IN THE SWEET SPOT', winToast: "YOU'VE GOT THE REINS. NOW BRAKE (S) TO A STOP", doneLine: 'WHOA THERE, BOY.',
    text: { head: 'CALM THE SPOOKED HORSE', mine: 'CALM', theirs: 'BOLTING', win: 'WHOA THERE!', lose: 'THROWN OFF!', good: 'EASY, BOY!', tip: 'HOLD: KEEP THE REINS IN THE SWEET SPOT', callout: 'ABOARD! GRAB THE REINS' },
  });
  J.midnightExpress = () => J.runaway('train', {
    title: 'MIDNIGHT EXPRESS', pay: 60, label: 'STEAM TRAIN', startS: 70, maxV: 11, restoreV: 22, whistle: true, rank: 'brake', culprit: 'THE TRAIN ROBBERS', failMsg: 'IT RAN OUT OF TRACK. AND MAP.',
    brief: "SOMEONE'S STOLEN THE STEAM TRAIN. YES, THE STEAM TRAIN. IT'S HEADING EAST OUT OF THE STATION. 1) CATCH UP ALONGSIDE THE ENGINE. 2) PRESS E TO LEAP ONTO THE FOOTPLATE. 3) HOLD SPACE TO HAUL THE BRAKE LEVER AGAINST THE PRESSURE, AND ARROW THE WAY IT SAYS. 4) WIN AND YOU'RE DRIVING: BRAKE (S) TO A STOP. LOSE AND YOU'RE THROWN OFF; CATCH UP AND TRY AGAIN.",
    help: [['E ALONGSIDE', 'LEAP ONTO THE FOOTPLATE (ON FOOT OR FROM THE CAR)'], ['HOLD SPACE', 'HAUL THE BRAKE: KEEP THE LEVER IN THE GREEN; ARROW THE WAY IT SAYS'], ['S', 'ONCE YOU HAVE THE CONTROLS: BRAKE TO A STOP'], ['THROWN OFF', 'A TUCK-AND-ROLL; CATCH UP AND GO AGAIN']],
    fightObj: 'HAUL THE BRAKE: HOLD SPACE, KEEP THE LEVER IN THE GREEN', winToast: "YOU'VE GOT THE CONTROLS. BRAKE (S) TO A STOP", doneLine: 'ALRIGHT, ALRIGHT!',
    text: { head: 'HAUL THE BRAKE AGAINST THE PRESSURE', mine: 'BRAKE', theirs: 'PRESSURE', win: 'BRAKE ON!', lose: 'THROWN OFF!', good: 'HEAVE!', tip: 'HOLD: KEEP THE LEVER IN THE GREEN', callout: 'ON THE FOOTPLATE! HAUL THE BRAKE' },
  });

  // ================= STORY =================
  // Each character's week is a list of nights; each night is a list of jobs (job prototypes from the factories above).
  // Nights unlock in order and the last night in the list ends with the win screen, so a new night or job slots in with
  //   M.addNight('schoolie', { id: 'fireworks', title: 'FIREWORKS', jobs: [M.J.myJob()], win: { title, text } })
  //   M.addJob('cop', 2, M.J.myJob())          // adds a job to night 2
  // and a new job factory is registered with M.defineJob('myJob', (...args) => ({ title, from, pay, brief, init, update, ... })).
  // Day names follow on from the last night (Thursday, Friday, Saturday, Sunday...), or set `day` on the night.
  M.J = J;
  M.defineJob = (name, factory) => { J[name] = factory; return factory; };
  M.DAYS = ['THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY'];
  const night = (jobs, extra = {}) => ({ ...extra, jobs });
  M.STORY = {
    schoolie: [
      night([J.chipRun(), J.dingDong(4)], { id: 'thu' }),
      night([J.doughnuts(250), J.railRide('tram', { title: 'TRAM-JACKING', from: 'THE CREW', pay: 60, time: 300, dest: 'GRANITE ISLAND', verb: 'GIDDY UP TO GRANITE ISLAND', failMsg: 'THE HORSE WANTS HIS BED', brief: "THE HORSE TRAM'S PARKED AT THE VICTOR END OF THE CAUSEWAY. TAKE IT ALL THE WAY TO GRANITE ISLAND. HOLD SHIFT TO GIDDY UP." })], { id: 'fri' }),
      night([J.railRide('train', { title: 'THE LAST TRAIN', from: 'BRODIE', pay: 80, time: 330, dest: 'END OF THE LINE', verb: 'FULL STEAM EAST', failMsg: 'OUT OF STEAM', brief: 'THE STEAM TRAIN IS SITTING AT THE STATION. NOBODY IS WATCHING IT. DRIVE IT EAST PAST HAYBOROUGH TO THE END OF THE LINE. TOOT TOOT (H).' }),
        J.bluff({ from: 'UNKNOWN NUMBER', pay: 100, brief: "THEY SAY IF YOU'RE ON TOP OF THE BLUFF AT MIDNIGHT IN SCHOOLIES WEEK, SOMETHING COMES OUT OF THE FOG. GO SEE. IF YOU DARE." })], { id: 'sat' }),
    ],
    grump: [
      night([J.letters(5), J.unplug(3)], { id: 'thu' }),
      night([J.bigRig(), J.lightsOut(5)], { id: 'fri' }),
      night([J.shutdown()], { id: 'sat' }),
    ],
    cop: [
      night([J.gopherPatrol(5), J.catchDitchers(3)], { id: 'thu' }),
      night([J.runawayTram(), J.hoonChase(), J.bins(8)], { id: 'fri' }),
      night([J.midnightExpress(), J.bluff({ from: 'SARGE', pay: 80, brief: 'KEV. STRANGE LIGHTS REPORTED ON TOP OF THE BLUFF. PROBABLY KIDS. GO HAVE A LOOK AND THEN GO HOME, MATE.' })], { id: 'sat' }),
    ],
    roam: [night([])],
  };
  M.WIN = {
    schoolie: { title: 'SCHOOLIES LEGEND', text: "THE GHOST WHALE WINKED AT YOU. NOBODY WILL BELIEVE IT. EVERYONE WILL TALK ABOUT IT FOR YEARS." },
    grump: { title: 'PEACE AND QUIET', text: "THE DOOF HAS STOPPED. MERV SLEEPS LIKE A BABY. NEXT YEAR'S SCHOOLIES ARE ALREADY PLANNING THEIR REVENGE." },
    cop: { title: 'CONSTABLE OF THE YEAR (RUNNER-UP)', text: 'KEV FILED HIS REPORT: "WHALE, GHOST, FLYING. NO FURTHER ACTION." THE SARGE HAS ASKED HIM TO TAKE SOME LEAVE.' },
  };
  M.addNight = function (char, n) { const list = M.STORY[char] || (M.STORY[char] = []); list.push(Array.isArray(n) ? night(n) : night(n.jobs || [], n)); return list.length; };
  M.addJob = function (char, n, proto) { const nt = (M.STORY[char] || [])[n - 1]; if (nt) nt.jobs.push(proto); return !!nt; };
  M.nights = char => M.STORY[char] || [];
  M.nightCount = char => M.nights(char).length;
  M.nightOf = (char, n) => M.nights(char)[n - 1] || null;
  M.dayName = (n, char) => { const nt = M.nightOf(char || M.char, n); return (nt && nt.day) || M.DAYS[(n - 1) % M.DAYS.length]; };
  M.winFor = char => { const list = M.nights(char); const last = list[list.length - 1]; return (last && last.win) || M.WIN[char] || { title: 'YOU WIN', text: '' }; };

  // ---------- progress, per character: which nights are done, and each night's record ----------
  // progress:<char> = { nights: { 1: { done, best (seconds), cash (best takings), clean (no busts) } }, cash, upgrades }
  M.progress = char => { const p = U.store.get('progress:' + char, null) || {}; p.nights = p.nights || {}; if (p.cash == null) p.cash = char === 'cop' ? 20 : 10; p.upgrades = p.upgrades || {}; return p; };
  M.saveProgress = (char, p) => U.store.set('progress:' + char, p);
  M.record = (char, n) => M.progress(char).nights[n] || null;
  M.unlocked = (char, n) => n <= 1 || !!(M.record(char, n - 1) || {}).done;
  M.firstUnfinished = char => { const k = M.nightCount(char); for (let n = 1; n <= k; n++) if (!(M.record(char, n) || {}).done) return n; return k; };
  M.allDone = char => { const k = M.nightCount(char); for (let n = 1; n <= k; n++) if (!(M.record(char, n) || {}).done) return false; return k > 0; };
  // saves from before the night select: save = { char, night, cash, upgrades } and wins = { char: true }
  M.migrateOld = function () {
    const old = U.store.get('save', null), wins = U.store.get('wins', null);
    if (old && old.char && old.char !== 'roam' && M.STORY[old.char] && !U.store.get('progress:' + old.char, null)) {
      const p = M.progress(old.char); for (let n = 1; n < old.night; n++) p.nights[n] = { done: true };
      if (old.cash != null) p.cash = old.cash; p.upgrades = old.upgrades || {}; M.saveProgress(old.char, p); U.store.set('last', old.char);
    }
    if (old) U.store.del('save');
    if (wins) { for (const c of Object.keys(wins)) if (wins[c] && M.STORY[c]) { const p = M.progress(c); for (let n = 1; n <= M.nightCount(c); n++) p.nights[n] = p.nights[n] || { done: true }; M.saveProgress(c, p); } U.store.del('wins'); }
  };

  // start a character's night N: their wallet and upgrades come from the save
  M.playNight = function (char, n, opts = {}) {
    const g = G(); const p = M.progress(char);
    g.demo = null; g.char = char; M.char = char; g.cash = opts.cash != null ? opts.cash : p.cash; g.upgrades = { ...(opts.upgrades || p.upgrades) };
    g.meter = 0; g.heatCeil = 0; g.quietT = 0; g.timeOverride = null; VH.Yards.reset(); g.partyOn = true; for (const q of g.partyProps) { q.up = true; q.t = 1; }
    if (char !== 'roam') U.store.set('last', char);
    // a night left part-way: carry on from the first unfinished job, with the wallet and upgrades as they were then
    const cur = opts.fromStart || opts.only != null ? null : p.cur && p.cur.night === n ? p.cur : null;
    if (cur && opts.cash == null) { g.cash = cur.cash; g.upgrades = { ...(cur.upgrades || g.upgrades) }; }
    M.only = opts.only != null ? opts.only : null; // replaying one finished job on its own
    M.job = null; M.toNight(n, M.only != null ? M.only : cur ? cur.idx : 0);
    if (cur && cur.idx > 0) g.toast(`CARRYING ON FROM JOB ${cur.idx + 1}`, '#9be15d');
  };
  // after each job: where you're up to in the night, so Continue (and the night select) pick up from the next job
  M.saveJob = function () {
    const g = G(); if (M.char === 'roam' || M.only != null) return; const p = M.progress(M.char);
    const nt = p.nights[M.night] = p.nights[M.night] || {}; nt.jobs = Array.from(new Set([...(nt.jobs || []), M.idx - 1]));
    p.cur = M.idx < M.jobs().length ? { night: M.night, idx: M.idx, cash: g.cash, upgrades: { ...g.upgrades } } : null; M.saveProgress(M.char, p);
  };
  M.jobDone = (char, n, i) => !!(((M.record(char, n) || {}).jobs || []).includes(i) || (M.record(char, n) || {}).done);
  M.resumeAt = (char, n) => { const c = M.progress(char).cur; return c && c.night === n ? c.idx : 0; };
  M.begin = function (char) { M.playNight(char, 1); };
  M.toNight = function (n, startIdx = 0) {
    const g = G(); M.night = n; M.idx = startIdx; g.night = n; M.cuffing = null; M.jobStart = null;
    g.stats = { smashed: 0, dives: 0, stolen: 0, tracks: 0, busted: 0, distance: 0, gulls: 0, sarge: 0 };
    g.startNight(); M.nightT = 0; M.startCash = g.cash; M.startUpgrades = { ...g.upgrades }; M.lastRecord = null;
    M.prepJob(); g.state = 'brief'; g.stateT = 0; g.briefNight = true;
  };
  // the night's work is done: keep the record, the wallet and any upgrades
  M.finishNight = function () {
    const g = G(), char = M.char, n = M.night; if (char === 'roam') return null;
    const p = M.progress(char); const was = p.nights[n] || {};
    const rec = { time: Math.round(M.nightT), cash: Math.round(g.cash - M.startCash), clean: char === 'cop' ? !g.stats.sarge : !g.stats.busted };
    p.cur = null; p.nights[n] = { jobs: was.jobs, done: true, best: was.best ? Math.min(was.best, rec.time) : rec.time, cash: Math.max(was.cash || 0, rec.cash), clean: !!was.clean || rec.clean };
    p.cash = g.cash; p.upgrades = { ...g.upgrades }; M.saveProgress(char, p);
    M.lastRecord = { ...rec, newBest: !!was.done && (!was.best || rec.time < was.best), firstTime: !was.done, star: rec.clean && !was.clean, unlocked: !was.done && n < M.nightCount(char) ? n + 1 : 0 };
    return M.lastRecord;
  };
  // a failed or abandoned night: the wallet goes back to how it was at the start of the night
  M.abandonNight = function () { const g = G(); if (M.startCash != null) g.cash = M.startCash; if (M.startUpgrades) g.upgrades = { ...M.startUpgrades }; };
  M.jobs = () => { const nt = M.nightOf(M.char, M.night); return nt ? nt.jobs : []; };
  M.prepJob = function () {
    const proto = M.jobs()[M.idx]; M.job = null;
    if (!proto) return;
    M.job = Object.create(proto); M.job.started = false;
  };
  M.startJob = function () {
    if (G().char === 'cop' && !VH.Police.spare) { const car = G().vehicles.find(v => v.owned && v.type === 'police' && !v.removed && !v.sinking && !v.dead); if (!car) { const v = G().park('police', G().places.police, { colour: '#fff' }); v.owned = true; v.parked = false; G().toast('THE SARGE LENT YOU A SPARE CAR (AT THE STATION)', '#7fa6ff'); } }
    if (!M.job) return;
    // where the job started from, for RESTART JOB
    const p = pl(); if (!M.jobStart || M.jobStart.job !== M.job) M.jobStart = { job: M.job, x: p.x, y: p.y, ang: p.ang, veh: p.onFoot ? null : p.vehicle, meter: 0, cash: G().cash };
    M.job.fail = reason => { M.failReason = reason; return 'fail'; };
    M.job.init(); M.job.started = true; M.job.bonus = 0;
  };
  // ---------- restarts (pause menu): safe from any state: in a vehicle, mid-chase, mid-struggle, aboard a runaway ----------
  M.settle = function () {
    const g = G(), p = pl(); if (VH.Escort.paddy && VH.Escort.paddy.v) VH.Escort.paddy.v.removed = true; VH.Escort.paddy = null;
    VH.Tackle.on = null; VH.Street.grab = null; VH.Shops.chat = null; M.cuffing = null; VH.Lockup.ride = null;
    p.aboard = null; p.rollT = 0; p.dizzyT = 0; p.stunT = 0; p.breath = 1; p.inShop = null; p.hidden = false;
    if (p.vehicle) { const v = p.vehicle; v.driver = null; v.throttle = v.brake = v.steer = 0; v.handbrake = 1; v.siren = false; if (v.rail) { v.v = 0; } v.vx = v.vy = 0; p.vehicle = null; p.onFoot = true; }
    VH.Police.reset(); g.meter = 0; g.heatCeil = 0; g.watch.forEach(v => { v.removed = true; }); g.watch = []; g.pendingBrief = 0;
  };
  M.restartJob = function () {
    const g = G(), p = pl(), j = M.job, st = M.jobStart && M.jobStart.job === j ? M.jobStart : null; M.settle();
    if (j && j.started) { j.cleanup && j.cleanup(); VH.Escort.dropJob(j); }
    if (st) {
      p.x = st.x; p.y = st.y; p.ang = st.ang || 0; p.vx = p.vy = 0; g.cash = st.cash; // no keeping what you earned on the abandoned attempt
      const v = st.veh; if (v && !v.removed && !v.sinking && !v.rail) { v.x = st.x; v.y = st.y; v.ang = st.ang || 0; v.vx = v.vy = 0; v.av = 0; if (v.dead) { v.dead = false; v.damage = Math.min(v.damage, 0.5); } g.enter(v, true); }
      g.cam.x = p.x; g.cam.y = p.y; VH.MapRender.prefetch(p.x, p.y, 110);
    }
    M.jobStart = null; M.prepJob(); g.state = 'brief'; g.stateT = 0; g.reviewBrief = false; g.briefNight = false; g.toast('JOB RESTARTED', '#9be15d');
  };
  M.restartNight = function () { M.settle(); M.abandonNight(); M.toNight(M.night); G().toast('NIGHT RESTARTED', '#9be15d'); };
  M.update = function (dt) {
    for (const d of W.doors) if (d.lit > 0) d.lit -= dt;
    if (G().char === 'roam') return;
    M.nightT = (M.nightT || 0) + dt;
    const h = G().hour; if (h >= 5.5 && h < 12) { M.abandonNight(); G().state = 'sunrise'; G().stateT = 0; sfx('fail'); return; }
    const j = M.job; if (!j || !j.started) return;
    if (M.checkDeadEnd(j, dt)) return; if (j.stalled) return; // can't be finished: wait for a restart from the card or the pause menu
    const r = j.update(dt);
    if (r === 'done') {
      const pay = j.pay + (j.bonus || 0); G().cash += pay; sfx('win'); FX.confetti(pl().x, pl().y, 40); FX.flash = 0.5;
      G().toast(`JOB DONE: ${j.title} +$${pay}`, '#9be15d'); j.cleanup && j.cleanup();
      if (j.reward) j.reward(G());
      M.idx++; M.jobStart = null; M.saveJob();
      if (M.only != null) { M.only = null; M.job = null; G().toast('JOB REPLAYED. BACK TO THE WEEK', '#9be15d'); G().pendingWeek = 2.5; return; } // a single replayed job: back to the week
      if (M.idx >= M.jobs().length) {
        M.finishNight();
        G().state = M.night >= M.nightCount(M.char) ? 'win' : 'nightEnd'; G().stateT = 0;
        M.job = null;
      } else { M.prepJob(); G().pendingBrief = 1.6; }
    } else if (r === 'fail') {
      sfx('fail'); M.failCount = (M.failCount || 0) + 1; G().toast('JOB FAILED: ' + (M.failReason || ''), '#ff6a5a'); j.cleanup && j.cleanup(); VH.Escort.dropJob(j); M.prepJob(); G().pendingBrief = 2;
    }
  };
  // ---------- dead ends: a job that can't be finished any more says so, and offers a way out ----------
  // A job lists what it can't do without in requires(): return null when all is well, or
  //   M.Need.lost('THE HOON')                      gone for good: the card (RESTART JOB / RESTART NIGHT / KEEP PLAYING)
  //   M.Need.recover('THE B-DOUBLE', 'A NEW ONE...') gone but coming back: just a hint, the job carries on
  // M.Need.vehicle(v, name, recoverHint) and M.Need.ped(p, name) check the usual ways things go missing (gone,
  // sunk, wrecked, out of bounds, stuck inside a building). The watchdog also offers the card when the objective
  // hasn't changed for 3 minutes and nothing the job marks can be reached.
  M.Need = {
    lost: thing => ({ thing, lost: true }), recover: (thing, hint) => ({ thing, hint }),
    vehicle(v, name, hint) { const bad = !v || v.removed || v.sinking || v.dead || !W.inBounds(v.x, v.y, 3); return bad ? (hint ? M.Need.recover(name, hint) : M.Need.lost(name)) : null; },
    ped(p, name) { const g = G(); if (p && p.prisoner && ['escort', 'car', 'done'].includes(p.prisoner.stage)) return null; // Kev has them
      const bad = !p || !g.peds.includes(p) || !W.inBounds(p.x, p.y, 3) || (!(p.prisoner && p.prisoner.stage === 'car') && VH.Nav.inBuilding(p.x, p.y) && !(g.player.inShop && U.pointInPoly(p.x, p.y, g.player.inShop.b.p))); return bad ? M.Need.lost(name) : null; },
  };
  M.checkDeadEnd = function (j, dt) {
    const g = G(); j.needT = (j.needT || 0) - dt; if (j.stalled || j.needT > 0) return false; j.needT = 0.5;
    let r = j.requires ? j.requires() : null;
    // the watchdog: no progress and nothing reachable for a long while
    // (getting closer to a target counts as progress; a far-off target is not a dead end, only one that's gone)
    const o = M.objective(), p = pl(), ts = M.targets(); const near = ts.length ? Math.min(...ts.map(t => Math.hypot(t.x - p.x, t.y - p.y))) : null;
    if (o !== j.lastObj || (near != null && near < (j.bestD ?? 1e9) - 30)) { j.lastObj = o; j.objT = 0; j.bestD = near ?? 1e9; } else j.objT = (j.objT || 0) + 0.5;
    if (!r && j.objT > 180) { const reach = ts.some(t => W.inBounds(t.x, t.y, 3)); if (!reach) r = M.Need.lost('ITS WAY FORWARD'); }
    if (!r) { j.hinted = null; return false; }
    if (!r.lost) { if (j.hinted !== r.thing) { j.hinted = r.thing; g.toast(r.hint, '#9fd4ec'); } return false; }
    j.stalled = true; M.deadEnd = { thing: r.thing, job: j.title }; g.state = 'deadEnd'; g.stateT = 0; sfx('fail'); return true;
  };
  M.event = function (name, data) { const j = M.job; if (j && j.started && j.on) return j.on(name, data); return false; };
  M.targets = function () {
    const t = (M.job && M.job.started ? M.job.targets() : []).concat(VH.Acts.targets());
    // Kev with someone in the back: the lock-up is always marked
    for (const x of VH.Escort.targets()) t.push(x); // prisoners, and the desks while one is on the way
    const mr = G().markRespray; if (mr) t.push({ x: mr.x, y: mr.y, label: 'RESPRAY', r: 6 });
    return t;
  };
  M.chaseTarget = () => (M.job && M.job.started && M.job.chase ? M.job.chase() : M.job && M.job.started && M.job.t && M.job.t.missionDrive ? M.job.t : null);
  M.objective = () => { if (G().char === 'roam') return 'FREE ROAM: T CHANGES THE TIME OF DAY'; if (M.job && M.job.stalled) return "THIS JOB CAN'T BE FINISHED: PAUSE (ESC) FOR RESTART JOB OR RESTART NIGHT"; const jo = M.job && M.job.started ? M.job.objective() : ''; const eo = VH.Escort.objective(); return eo && jo && !jo.includes(eo) ? jo + '\n' + eo : jo || eo; };
  // the job clock: a countdown for timed jobs (a number that only goes down), nothing at all for the rest
  M.timer = () => { const j = M.job; if (!j || !j.started || j.timed === false) return null; const t = j.time; return typeof t === 'number' && isFinite(t) ? Math.max(0, t) : null; };

  // the resident's torch: a light in the night, plus a faint visible cone so the sweep reads
  M.torch = () => (M.job && M.job.started && M.job.torch ? M.job.torch() : null);
  M.drawTorch = function (ctx, left, top, S) {
    const list = M.torch(); if (!list) return;
    for (const r of [].concat(list)) {
      const p = r.p; const sx = (p.x - left) * S, sy = (p.y - top) * S;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.fillStyle = '#fff3c0';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, 16 * S, r.torch - 0.5, r.torch + 0.5); ctx.closePath(); ctx.fill(); ctx.restore();
      if (r.sus > 0.25) U.text(ctx, r.sus > 0.75 ? '!' : '?', sx, sy - 22, { align: 'center', color: r.sus > 0.75 ? '#ff6a5a' : '#ffd23a', scale: 2 });
    }
    if (M.inCover()) { const q = pl(); U.text(ctx, 'HIDDEN', (q.x - left) * S, (q.y - top) * S - 16, { align: 'center', color: '#9be15d' }); }
  };
  // world markers: pulsing rings and bobbing arrows, the pull-over rings, and the freeze / cuff prompts over runners
  M.drawWorld = function (ctx, left, top, S, scale) {
    const t = performance.now() / 1000;
    for (const tg of M.targets()) {
      const sx = (tg.x - left) * S, sy = (tg.y - top) * S; if (sx < -50 || sy < -50 || sx > ctx.canvas.width + 50 || sy > ctx.canvas.height + 50) continue;
      const r = Math.max(3, (tg.r || 3) * S) * (1 + Math.sin(t * 4) * 0.08); const col = tg.col || '#ffd23a';
      ctx.strokeStyle = tg.small ? 'rgba(255,210,58,0.7)' : col; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.8, 0, 0, U.TAU); ctx.stroke();
      if (!tg.small) {
        const by = sy - r - 8 - Math.abs(Math.sin(t * 3)) * 5;
        ctx.fillStyle = '#1a1030'; ctx.beginPath(); ctx.moveTo(sx - 5, by - 1); ctx.lineTo(sx + 5, by - 1); ctx.lineTo(sx, by + 6); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(sx - 4, by); ctx.lineTo(sx + 4, by); ctx.lineTo(sx, by + 5); ctx.fill();
        if (tg.label && !tg.noWorldLabel) U.text(ctx, tg.label, sx, by - 10, { align: 'center', color: col });
      }
    }
    const j = M.job && M.job.started ? M.job : null; if (!j) return;
    if (j.rings) for (const rg of j.rings()) {
      const sx = Math.round((rg.x - left) * S), sy = Math.round((rg.y - top) * S); const R = 10;
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(18,12,36,0.7)'; ctx.beginPath(); ctx.arc(sx, sy, R, 0, U.TAU); ctx.stroke();
      ctx.strokeStyle = '#9be15d'; ctx.beginPath(); ctx.arc(sx, sy, R, -Math.PI / 2, -Math.PI / 2 + U.TAU * Math.min(1, rg.p)); ctx.stroke(); ctx.lineWidth = 1;
      if (rg.txt) U.text(ctx, rg.txt + ' ' + Math.min(99, Math.round(rg.p * 100)) + '%', sx, sy + R + 4, { align: 'center', color: '#9be15d' });
    }
    if (j.runners) for (const k of j.runners()) Run.draw(ctx, k, left, top, S);
  };
})(window.VH);
