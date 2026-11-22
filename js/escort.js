// Kev's prisoners, start to finish. Everyone Kev cuffs (the hoon, ding dong ditchers, the tram-jacker, the train
// robber) becomes a prisoner who stays where they were cuffed until Kev collects them:
//   E · GRAB          take them by the arm; they walk beside you (a walk, not a run)
//   E · PUT IN CAR    at the rear door of a police car (two in the back) or the paddy wagon (six); a prisoner in a car
//                     can't get away
//   E · TAKE OUT      at the rear door again, at the lock-up or the station
//   E · HAND OVER     at the duty officer's desk: the lock-up's front steps or the police station's door
// Walking a prisoner fills a RESTLESS meter (faster if you run or bump into things); full, they shove free and leg it,
// still cuffed and slower, and it's a tackle (an easy one) to grab them back. The walk from the car to the desk is a
// last small chance for them, with the odds well in Kev's favour. B with a prisoner waiting calls the paddy wagon to
// collect them instead. All moving goes through the shared walking code (VH.Nav): this only sets states.
'use strict';
(function (VH) {
  const U = VH.U, FX = VH.FX;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const G = () => VH.Game; const pl = () => G().player; const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const E = VH.Escort = { list: [], leading: null, paddy: null };
  const GRAB_R = 2.2, DOOR_R = 2.6, DESK_R = 4.5;
  E.reset = function () { E.list = []; E.leading = null; E.toCell = []; if (E.paddy && E.paddy.v) E.paddy.v.removed = true; E.paddy = null; };
  const key = () => VH.Input.touchMode ? 'ACT' : 'E';
  // the desks where a prisoner is handed over
  E.desks = () => VH.Shops.list.filter(s => s.desk).map(s => ({ x: s.door.x - s.door.nx * 1.5, y: s.door.y - s.door.ny * 1.5, label: s.desk === 'lockup' ? 'LOCK-UP' : 'STATION', who: s.officer, shop: s }));
  // cars a prisoner can go in: Kev's police cars and the paddy wagon (not wrecks under tow)
  const capacity = v => v.type === 'paddy' ? 6 : v.type === 'truck' ? 1 : 2;
  const carries = v => !v.rail && !(v.def && (v.def.heli || v.def.bike || v.def.gopher));
  E.cars = () => G().vehicles.filter(v => !v.removed && !v.sinking && !v.delivery && (E.inBack(v).length || (!v.tow && !v.dead)) && carries(v) && (v.owned || v === G().lastVeh || v === G().player.vehicle || E.inBack(v).length));
  E.rearDoor = v => { const b = -v.def.L * 0.18, a = v.ang, s = (v.def.W / 2 + 0.7); return { x: v.x + Math.cos(a) * b + Math.cos(a + Math.PI / 2) * s, y: v.y + Math.sin(a) * b + Math.sin(a + Math.PI / 2) * s }; };
  E.canTakeOut = c => c.dead || c.tow || E.desks().some(d => dist(d, c) < 45);
  E.nearCar = function () { const p = pl(); let best = null, bd = DOOR_R; for (const v of E.cars()) { const d = dist(E.rearDoor(v), p); if (d < bd) { bd = d; best = v; } } return best; };
  E.inBack = v => E.list.filter(q => q.prisoner.car === v);
  // at a front desk: inside, at the counter
  E.nearDesk = () => { const s = pl().inShop; return s && s.desk && dist(pl(), s.counter) < 3.6 ? E.desks().find(d => d.shop === s) : null; };

  // cuffed: a prisoner now, staying put till collected
  E.add = function (p, name, label) {
    const g = G(); p.prisoner = { name, label: label || p.label || name.replace(/^(A|THE) /, ''), stage: 'cuffed', restless: 0, walkedIn: false }; p.shirt = '#ff7a2f'; /* a bright prisoner's bib: never lost in a crowd */ p.prisoner.job = VH.Missions.job; p.tag = 'prisoner'; p.state = 'idle'; p.stay = true; p.frozen = 0; p.cornered = false; p.threat = null;
    if (!E.list.includes(p)) E.list.push(p);
    if (g.char === 'cop') { g.callout('CUFFED!', '#9fd4ec'); g.toast(`PUT THEM IN THE CAR (${key()} AT THE REAR DOOR) OR WALK THEM TO THE LOCK-UP`, '#9fd4ec'); }
    return p;
  };
  // a prisoner with no person to show (the train robber): one steps down where they're caught
  // the culprit off a runaway: on standable ground beside where it stopped, or else the nearest footpath slot
  E.spawn = function (name, x, y) { const s = VH.Nav.snap(x, y, 12) || VH.Spawn.pick('footpath', { near: { x, y }, nearest: true, maxDist: 600 }); if (!s) return null; const p = new VH.Ped('local', s.x, s.y, { shirt: '#6a5a8a' }); G().peds.push(p); return E.add(p, name); };

  // E (or ACT): grab, put in, take out, hand over, let go. True when it did something.
  E.key = function () {
    const g = G(), p = pl(); if (g.char !== 'cop' || !p.onFoot || VH.Tackle.on || !E.list.length) return false;
    const lead = E.leading;
    if (lead) {
      const desk = E.nearDesk(); if (desk) { E.handOver(lead, desk); return true; }
      const car = E.nearCar(); if (car) { if (E.inBack(car).length >= capacity(car)) { g.toast('NO ROOM IN THE BACK', '#ff9a30'); return true; } E.putIn(lead, car); return true; }
      lead.prisoner.stage = 'cuffed'; lead.state = 'idle'; E.leading = null; g.toast(`LET GO. ${key()} TO GRAB AGAIN`, '#9fd4ec'); return true;
    }
    const car = E.nearCar(); if (car && E.inBack(car).length && E.canTakeOut(car)) { const q = E.inBack(car)[0]; E.takeOut(q, car); return true; }
    const q = E.list.find(q => (q.prisoner.stage === 'cuffed' || (q.prisoner.stage === 'loose' && q.frozen > 0 && q.frozen < 50)) && dist(q, p) < GRAB_R && g.arrestAllowed(q) && g.arrestAllowed('player'));
    if (q) { E.grab(q); return true; }
    return false;
  };
  E.grab = function (q) { q.prisoner.stage = 'escort'; q.frozen = 0; q.state = 'chase'; q.target = E.side(); q.near = 0.15; q.runSpeed = 9; E.leading = q; sfx('click'); q.say(U.pick(['ALRIGHT, ALRIGHT.', 'MIND THE ARM!', 'THIS IS SO EMBARRASSING.', 'CAN WE NOT WALK PAST THE BAKERY?']), 2); };
  E.side = () => ({ x: 0, y: 0 }); // filled in each step: a spot at Kev's elbow
  E.putIn = function (q, car) {
    q.prisoner.stage = 'car'; q.prisoner.car = car; q.state = 'ride'; q.intent = null; E.leading = null; sfx('door');
    G().toast(`IN THE BACK (${E.inBack(car).length}/${capacity(car)}). DRIVE THEM TO THE LOCK-UP OR THE STATION`, '#9fd4ec'); q.say(U.pick(['THE SEATS ARE STICKY.', "I WANT MY PHONE CALL.", 'CAN WE PUT THE SIREN ON?']), 2);
  };
  E.takeOut = function (q, car) {
    const s = G().exitSpot(car); q.x = s.x; q.y = s.y; q.prisoner.car = null; q.prisoner.walkedIn = true; sfx('door'); E.grab(q);
  };
  E.handOver = function (q, desk) {
    const g = G(), s = desk.shop; E.list = E.list.filter(x => x !== q); E.leading = null; q.prisoner.stage = 'done';
    // led away to the cell at the back, then gone
    q.state = 'goto'; q.gx = s.shelf.x + s.door.nx * 0.4; q.gy = s.shelf.y + s.door.ny * 0.4; q.gotoSpeed = 1.6; E.toCell = E.toCell || []; E.toCell.push({ q, t: 4 });
    VH.Shops.chat = { s, line: U.pick([`ONE ${q.prisoner.name}? NAME, ADDRESS, AND WHAT YOUR NAN WOULD SAY.`, `BOOKING IN ${q.prisoner.name}. EMPTY YOUR POCKETS, PLEASE.`, `${q.prisoner.name}, IS IT? WE'VE GOT A LOVELY CELL WITH A VIEW OF THE CAR PARK.`]), sel: 0, reply: null, opts: [{ txt: U.pick(['THEY RANG ONE DOORBELL TOO MANY.', 'CAUGHT IN THE ACT, SARGE.', 'ALL YOURS. MIND THE ELBOWS.']), act: () => U.pick(['IN YOU GO. THE KETTLE\'S ON, KEV.', 'SIGNED, SEALED, LOCKED UP. NICE WORK.', "THAT'S THE PAPERWORK DONE. MOSTLY."]) }] }; g.state = 'chat'; g.stateT = 0;
    const pay = 15 + (q.prisoner.walkedIn ? 0 : 10); g.cash += pay; sfx('cash'); FX.confetti(desk.x, desk.y, 18);
    g.toast(`HANDED OVER AT THE ${desk.label}: ${q.prisoner.name} +$${pay}`, '#9be15d'); g.stats.delivered = (g.stats.delivered || 0) + 1;
    VH.Missions.event('deliver', [q.prisoner.name]);
  };
  // B with a prisoner waiting (not in a car): the paddy wagon comes and collects them
  E.dropJob = function (job) {
    const g = G(); const gone = E.list.filter(q => q.prisoner.job === job); if (!gone.length) return;
    E.list = E.list.filter(q => !gone.includes(q)); if (gone.includes(E.leading)) E.leading = null; for (const q of gone) { q.tag = null; g.peds = g.peds.filter(x => x !== q); }
  };
  E.waiting = () => E.list.filter(q => q.prisoner.stage === 'cuffed' || q.prisoner.stage === 'escort');
  E.callPaddy = function () {
    const g = G(); if (E.paddy) { g.toast('THE PADDY WAGON IS ALREADY ON ITS WAY', '#7fa6ff'); return; }
    E.paddy = { t: 6, phase: 'radio' }; sfx('radio'); g.toast("SARGE: 'BAZZA'S BRINGING THE PADDY WAGON FOR YOUR PRISONER.'", '#7fa6ff');
  };
  E.updatePaddy = function (dt) {
    const g = G(), pz = E.paddy; if (!pz) return; pz.t -= dt;
    const want = E.waiting()[0];
    if (pz.phase === 'radio' && pz.t <= 0) { const v = VH.Police.spawnCar(pl(), 70, 150, null, 'paddy'); if (!v) { pz.t = 1; return; } v.delivery = true; v.siren = true; pz.v = v; pz.phase = 'drive'; pz.t = 40; }
    if (pz.phase === 'drive') {
      const v = pz.v; if (!v || v.removed || v.sinking || v.dead) { E.paddy = null; return; }
      if (!want) { v.delivery = false; v.tow = true; v.siren = false; E.paddy = null; return; }
      VH.AI.pursue(v, dt, { x: want.x, y: want.y, vx: 0, vy: 0 }); const close = dist(v, want) < 10; if (close) { v.throttle = 0; v.brake = 1; }
      if ((close && v.speed < 1.5) || pz.t <= 0) {
        const got = E.waiting().filter(q => dist(q, v) < 16 || pz.t <= 0); let pay = 0; const names = [];
        for (const q of got) { q.prisoner.stage = 'done'; E.list = E.list.filter(x => x !== q); if (E.leading === q) E.leading = null; q.tag = null; g.peds = g.peds.filter(x => x !== q); pay += 10; names.push(q.prisoner.name); }
        g.cash += pay; sfx('door'); FX.text(v.x, v.y - 6, "BAZZA: 'GOT 'EM, KEV.'", '#9fd4ec'); if (names.length) { g.toast(`THE PADDY WAGON TOOK ${names.length} TO THE LOCK-UP +$${pay}`, '#9be15d'); VH.Missions.event('deliver', names); }
        v.delivery = false; v.siren = false; v.tow = true; const n = VH.World.nearestEdge(v.x, v.y, 40); if (n) VH.AI.attach(v, n, 1); E.paddy = null;
      }
    }
  };

  E.update = function (dt) {
    const g = G(), p = pl(); E.updatePaddy(dt);
    if (E.toCell && E.toCell.length) E.toCell = E.toCell.filter(c => { c.t -= dt; if (c.t > 0) return true; c.q.tag = null; g.peds = g.peds.filter(x => x !== c.q); return false; }); // led away to the cell
    for (const q of E.list) {
      const pr = q.prisoner;
      if (pr.stage === 'car') {
        const c = pr.car; if (!c || c.removed || c.sinking || !G().vehicles.includes(c)) { const s = VH.Nav.snap(c ? c.x : q.x, c ? c.y : q.y, 60) || VH.Nav.snap(G().player.x, G().player.y, 30) || VH.Spawn.pick('footpath', { near: G().player, nearest: true }) || q; q.x = s.x; q.y = s.y; pr.car = null; pr.stage = 'cuffed'; q.state = 'idle'; g.toast('YOUR PRISONER SCRAMBLED OUT OF THE CAR, STILL CUFFED', '#ff9a30'); continue; }
        const b = -c.def.L * 0.15; q.x = c.x + Math.cos(c.ang) * b; q.y = c.y + Math.sin(c.ang) * b; q.ang = c.ang; continue;
      }
      if (pr.stage === 'escort') {
        if (E.leading !== q || !p.onFoot) { pr.stage = 'cuffed'; q.state = 'idle'; if (E.leading === q) E.leading = null; continue; }
        // walking beside Kev at his elbow
        const a = p.ang + Math.PI / 2; q.target = { x: p.x + Math.cos(a) * 0.9 - Math.cos(p.ang) * 0.2, y: p.y + Math.sin(a) * 0.9 - Math.sin(p.ang) * 0.2 }; q.state = 'chase';
        // restless: rises as you walk, faster if you run or barge about; the last walk in from the car is short odds
        const spd = Math.hypot(p.vx, p.vy); let rate = 1 / 60 * (spd > 6 ? 3 : spd > 0.5 ? 1 : 0.4) * (pr.walkedIn ? 0.35 : 1);
        if (p.bumped && !(pr.bumpT > 0)) { pr.restless += 0.08; pr.bumpT = 0.6; q.say('OI! WATCH IT!', 1.2); } if (pr.bumpT > 0) pr.bumpT -= dt;
        if (dist(q, p) > 4) rate *= 2.5; // dragged along
        pr.restless = Math.min(1, pr.restless + rate * dt);
        if (pr.restless >= 1) { // shove free and leg it, still cuffed
          pr.stage = 'loose'; pr.restless = 0.4; E.leading = null; q.cuffed = false; q.slipT = 0; q.state = 'run'; q.threat = p; q.runSpeed = 5.6; p.stunT = 0.5; sfx('thud');
          q.say(U.pick(["I'M OUTTA HERE!", 'SEE YA, KEV!', 'NOT TODAY!']), 2); g.callout('THE PRISONER SHOVED FREE!', '#ff6a5a'); g.toast(`CATCH THEM: A TACKLE, OR THE MEGAPHONE (H) AND ${key()} TO GRAB`, '#ff9a30');
        }
        continue;
      }
      if (pr.stage === 'loose') {
        if (q.state !== 'run' && q.state !== 'dive' && q.state !== 'sit') { q.state = 'run'; q.threat = p; }
        VH.Missions.Run.update(q, dt, 'cuffed', () => { pr.stage = 'cuffed'; q.state = 'idle'; q.say('FINE. FINE!', 1.5); }, 'TOO SLOW, KEV!');
      }
    }
  };
  // the job (and the HUD) see prisoners as targets: each prisoner not in a car, and the desks while any are about
  E.targets = function () {
    if (!E.list.length || G().char !== 'cop') return [];
    const st = { cuffed: 'CUFFED', escort: 'WITH YOU', loose: 'LOOSE!', car: 'IN CAR' };
    const out = E.list.map(q => { const c = q.prisoner.car; const at = c || q; return { x: at.x, y: at.y, label: q.prisoner.label + ' · ' + st[q.prisoner.stage], r: c ? 3 : 2, prisoner: true }; });
    const ins = pl().inShop;
    if (ins && ins.desk && E.leading) out.push({ x: ins.counter.x, y: ins.counter.y, label: 'DESK', r: 1.5, col: '#9be15d' }); // inside: up to the counter
    else if (E.leading || E.list.some(q => q.prisoner.stage === 'car')) for (const d of E.desks()) out.push({ x: d.x, y: d.y, label: d.label + ' DOOR', r: 4, col: '#9be15d' });
    // the rear door of the nearest car that can take them (or the car they're in, to take them out)
    if (pl().onFoot && !(ins && ins.desk)) { const want = E.leading ? E.cars().filter(v => E.inBack(v).length < capacity(v)) : E.cars().filter(v => E.inBack(v).length); const c = want.sort((a, b) => dist(a, pl()) - dist(b, pl()))[0]; if (c && dist(c, pl()) < 120) { const d = E.rearDoor(c); out.push({ x: d.x, y: d.y, label: 'REAR DOOR', r: 1.2, col: '#7fd4ff' }); } }
    return out;
  };
  // the line just above the objective
  E.prompt = function () {
    const p = pl(); if (G().char !== 'cop' || !p.onFoot || !E.list.length) return '';
    if (E.leading) { const desk = E.nearDesk(); if (desk) return key() + ' · HAND OVER'; const car = E.nearCar(); if (car) return key() + ' · PUT IN CAR'; return ''; }
    const car = E.nearCar(); if (car && E.inBack(car).length && E.canTakeOut(car)) return key() + ' · TAKE OUT';
    const q = E.list.find(q => (q.prisoner.stage === 'cuffed' || (q.prisoner.stage === 'loose' && q.frozen > 0 && q.frozen < 50)) && dist(q, p) < GRAB_R); if (q) return key() + ' · GRAB';
    return '';
  };
  E.objective = function () {
    if (!E.list.length) return '';
    const p = pl(); const lead = E.leading; const inCar = E.list.filter(q => q.prisoner.stage === 'car').length; const loose = E.list.some(q => q.prisoner.stage === 'loose');
    if (loose) return 'A PRISONER IS LOOSE: CATCH THEM AGAIN';
    if (lead) return p.inShop && p.inShop.desk ? `UP TO THE DESK: ${key()} TO HAND THEM OVER` : `ESCORTING (RESTLESS ${Math.round(lead.prisoner.restless * 100)}%): ${key()} AT A CAR'S REAR DOOR, OR WALK THEM INTO THE LOCK-UP OR THE STATION`;
    if (inCar) { const c = E.list.find(q => q.prisoner.stage === 'car').prisoner.car; return p.vehicle || !E.canTakeOut(c) ? `${inCar} IN THE BACK: ${p.vehicle ? '' : 'GET IN AND '}DRIVE TO THE LOCK-UP OR THE STATION` : `${inCar} IN THE BACK: ${key()} AT THE REAR DOOR, THEN WALK THEM IN TO THE DESK`; }
    return `${key()} TO GRAB THE PRISONER: PUT THEM IN YOUR CAR, OR WALK THEM TO THE LOCK-UP (B: THE PADDY WAGON)`;
  };
  // cuffs on the prisoners, the restless bar, heads in the back seat
  E.draw = function (ctx, left, top, S) {
    for (const q of E.list) {
      const pr = q.prisoner;
      if (pr.stage === 'car') { const c = pr.car; if (!c) continue; const n = E.inBack(c).indexOf(q); const b = -c.def.L * 0.15, l = (n % 2 ? 0.45 : -0.45); const x = c.x + Math.cos(c.ang) * b + Math.cos(c.ang + Math.PI / 2) * l, y = c.y + Math.sin(c.ang) * b + Math.sin(c.ang + Math.PI / 2) * l; const sx = Math.round((x - left) * S), sy = Math.round((y - top) * S); ctx.fillStyle = '#120c24'; ctx.fillRect(sx - 2, sy - 2, 5, 5); ctx.fillStyle = q.hair || '#5a3a1a'; ctx.fillRect(sx - 1, sy - 1, 3, 3); continue; }
      const sx = Math.round((q.x - left) * S), sy = Math.round((q.y - top) * S);
      ctx.fillStyle = '#c9ccd8'; ctx.fillRect(sx - Math.round(Math.cos(q.ang) * 3) - 1, sy - Math.round(Math.sin(q.ang) * 3) - 1, 3, 2); // cuffs behind the back
      if (pr.stage === 'escort') { const bw = 14, by = sy - 15; ctx.fillStyle = '#120c24'; ctx.fillRect(sx - bw / 2 - 1, by - 1, bw + 2, 4); ctx.fillStyle = pr.restless > 0.7 && Math.floor(G().t * 6) % 2 ? '#ff6a5a' : '#ff9a30'; ctx.fillRect(sx - bw / 2, by, Math.round(bw * pr.restless), 2); U.text(ctx, 'RESTLESS', sx, by - 9, { align: 'center', color: '#ff9a30' }); }
    }
  };
})(window.VH);
