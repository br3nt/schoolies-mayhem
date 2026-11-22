// Input-only playthroughs for Round B: each one starts at a job brief (or a spot in free roam) and plays to the end
// with key presses, deciding what to press from what's on screen (the objective line, the prompt, the arrows).
'use strict';
const { dist } = require('./bot.cjs');

const ok = (cond, why) => { if (!cond) throw new Error(why); };
const lastMsgs = s => (s.msgs || []).join(' | ');

// ---------- shared pieces ----------
async function startFromBrief(bot) {
  const s = await bot.until(s => s.state === 'brief' && s.stateT > 1, 20); ok(s, 'no job brief');
  await bot.press('Enter'); await bot.tick(300);
  const t = await bot.peek(); ok(t.state === 'play' && t.job && t.job.started, 'the brief did not start the job'); bot.log(`job started: ${t.job.title}: ${t.obj}`);
  return t;
}
async function nextJob(bot, title, maxSec = 60) {
  const s = await bot.until(s => (s.state === 'brief' && s.stateT > 1) || (s.job && s.job.title === title && s.job.started), maxSec, 150);
  ok(s, `never reached the ${title} brief`);
  if (s.state === 'brief') { await bot.press('Enter'); await bot.tick(300); }
  const t = await bot.peek(); ok(t.job && t.job.title === title && t.job.started, `expected ${title}, got ${t.job && t.job.title}`); bot.log(`job started: ${title}: ${t.obj}`);
}
// plant three tubes: Space whenever the needle is in the green (the gauge is on screen)
async function plant(bot, miss = false) {
  for (let i = 0; i < 600; i++) {
    const s = await bot.peek(); const k = s.placing; if (!k) return;
    const inGreen = Math.abs(k.ang - k.band) < k.bw / 2 - 0.04;
    if (miss ? Math.abs(k.ang - k.band) > k.bw : inGreen) { await bot.press('Space'); await bot.tick(120); } else await bot.tick(15);
  }
}
async function setUpAt(bot, site, opts = {}) {
  await bot.walkTo(site, 1.5, 300);
  let s = await bot.until(s => /SET UP HERE/.test(s.obj) || /SET UP HERE/.test(s.prompt), 4, 100);
  if (!s) { await bot.walkTo(site, 0.8, 30); s = await bot.until(s => /SET UP HERE/.test(s.obj), 4, 100); }
  ok(s, `no "SET UP HERE" prompt at ${site.id} (objective: ${(await bot.peek()).obj})`);
  await bot.press('Space'); await bot.tick(200);
  ok((await bot.peek()).placing, 'the planting gauge did not open');
  await plant(bot, opts.miss);
  const t = await bot.peek(); bot.log(`${site.id}: ${t.msgs.slice(-1)[0] || ''} (suspicion ${t.susp.toFixed(0)})`);
}
// come alongside the fishing boat and stop; if we overshoot, come back in slowly (like a player would)
async function pullAlongside(bot) {
  for (let i = 0; i < 8; i++) {
    let s = await bot.peek(); if (/LOADING|RUN THE FIREWORKS|SPOTTED|GET BACK/.test(s.obj)) break;
    const fb = s.targets.find(t => /PELICAN/.test(t.label)); if (!fb) break;
    const far = Math.hypot(fb.x - s.x, fb.y - s.y) > 60;
    await sailGuarded(bot, fb, { arrive: 6, stop: true, maxV: far ? 30 : 6 });
    await bot.until(q => /LOADING|RUN THE FIREWORKS|SPOTTED/.test(q.obj), 2, 100);
  }
  const s = await bot.until(s => /RUN THE FIREWORKS|SPOTTED/.test(s.obj), 12); ok(s, 'loading never finished: ' + (await bot.peek()).obj);
  return s;
}
// take the nearest free boat (walk up, E); waits for a trailer launch to finish
async function takeBoat(bot, want, nearest) {
  let s = await bot.peek();
  const boats = await bot.call('boats', s.x, s.y); const arrow = s.targets.find(t => /JET SKI|SPEEDBOAT/.test(t.label));
  const b = (arrow && !want && !nearest ? boats.find(q => Math.hypot(q.x - arrow.x, q.y - arrow.y) < 3) : null) || boats.find(b => !want || (want === 'jetski' ? b.jetski : !b.jetski)) || boats[0]; ok(b, 'no free boat');
  bot.log(`walking to the ${b.type} ${b.d.toFixed(0)} m away${b.trailer ? ' (on its trailer)' : ''}`);
  if (b.d > 160) await bot.goLand(b, 2.5); else await bot.walkTo(b, 2.5, 200);
  ok(await bot.getIn(), 'could not get on the boat');
  s = await bot.until(s => s.v && s.v.boat && !s.v.trailer, 15, 150); ok(s, 'the boat never floated');
  await bot.wait(1500); // she swings round after the launch
}
// sail and fight off anything that happens on the way (boarding: shove, then the struggle)
async function sailGuarded(bot, p, opts = {}) {
  const r = await bot.sailTo(p, { ...opts, abort: s => s.board === 'police' || (opts.abort && opts.abort(s)) });
  if (r === 'abort') {
    const s = await bot.peek();
    if (s.board === 'police') { bot.log('being boarded: Space to shove, full throttle'); for (let i = 0; i < 40; i++) { const t = await bot.peek(); if (t.board !== 'police') break; await bot.hold(['KeyW']); await bot.press('Space'); await bot.tick(100); } }
    for (let i = 0; i < 300; i++) { const t = await bot.peek(); if (!t.tackle && t.board !== 'deck') break; await bot.struggle(t); await bot.tick(70); }
    await bot.hold([]);
    return sailGuarded(bot, p, opts);
  }
  return r;
}

// ================= scenarios =================
const S = {};

// get yourself caught, the way a player would, meeting Round A's police as they are (police.js): one patrol car per
// whole level of gossip, stood down as soon as the gossip drops below it, and while a car hasn't seen you the gossip
// cools at 0.09 a second; the cap starts at 1.4 and rises while you keep causing trouble (game.js). So:
//   1. warm up: kick bins and cones (about 0.04 each, and the gossip doesn't cool while you keep at it) until it's
//      near a whole level and the cap has risen;
//   2. one bigger bit of trouble (`bump`: a blown site, a borrowed car) takes it well past 1: a car responds;
//   3. run toward the car (it's on the minimap) until it's close enough to see you, then stand still for the officer,
//      and lose the struggle.
async function kickSomething(bot, q) {
  bot.skipK = bot.skipK || [];
  const ks = (await bot.call('kickables', q.x, q.y, 40)).filter(k => !bot.skipK.some(z => Math.hypot(z.x - k.x, z.y - k.y) < 1)); const k = ks[0];
  if (k) {
    await bot.walkTo(k, 1.1, 12); const a = await bot.peek();
    if (Math.hypot(a.x - k.x, a.y - k.y) > 2) { bot.skipK.push(k); return false; } // can't get to it (behind a fence, in a yard): another one
    const m0 = a.meter; await bot.press('KeyF'); await bot.wait(300); const b = await bot.peek(); bot.log(`kicked a bin or cone: gossip ${m0.toFixed(2)} to ${b.meter.toFixed(2)}`); return true;
  }
  // nothing standing to kick here: back to the street we started on (bins and cones along Ocean St), then look about
  if (bot.home && Math.hypot(bot.home.x - q.x, bot.home.y - q.y) > 40) { await bot.goLand(bot.home, 4); return false; }
  bot.wander = (bot.wander || 0) + 1; await bot.walkTo({ x: q.x + Math.cos(bot.wander) * 30, y: q.y + Math.sin(bot.wander) * 30 }, 3, 20); return false;
}
async function warmUp(bot, to = 0.7, maxSec = 240) {
  const t0 = (await bot.peek()).t;
  for (;;) {
    const q = await bot.peek(); if (q.meter >= to) { bot.log(`warmed up: gossip ${q.meter.toFixed(2)}`); return true; }
    if (q.t - t0 > maxSec) return false;
    if ((await bot.call('policeCars')).length) return true; // already coming
    await kickSomething(bot, q);
  }
}
async function getCaught(bot, bump, maxSec = 300) {
  ok(await warmUp(bot), `could not warm the gossip up by kicking things (${(await bot.peek()).meter.toFixed(2)})`);
  if (bump) await bump();
  bot.log(`after the bump: gossip ${(await bot.peek()).meter.toFixed(2)}`);
  bot.giveUp = true; const t0 = (await bot.peek()).t;
  for (;;) {
    const q = await bot.peek(); if (q.state === 'ride' || q.state === 'lockedUp') return q;
    if (q.t - t0 > maxSec) return null;
    if (q.tackle) { await bot.struggle(q); await bot.tick(80); continue; }
    if (q.state !== 'play') { await bot.tick(200); continue; }
    if (!q.onFoot) { await bot.getOut(); continue; }
    const cars = await bot.call('policeCars'); const c = cars.sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y))[0];
    if (c) { const d = Math.hypot(c.x - q.x, c.y - q.y); if (d <= 30) await bot.wait(500); else if (q.meter < 1.25 && d > 75) await kickSomething(bot, q); else await bot.walkTo(c, 25, 4); continue; } // keep the gossip up till it's close, then to where it can see you, then stand still
    if (q.meter < 1) { await warmUp(bot, 1.05, 60); if (bump) await bump(); } else await bot.wait(500);
  }
}

// ---- Jaz's fireworks night, job by job (also played one job at a time by playthrough.mjs through roundb.cjs) ----
const FW = {};
// (a) hidden fireworks: head for each search circle, search it, grab the sparkling box
FW.stash = async bot => {
  for (let n = 0; n < 3; n++) {
    let s = await bot.peek(); const circle = s.targets.find(t => /HINT/.test(t.label)); ok(circle, 'no search circle: ' + s.obj);
    bot.log(`hint ${n + 1}: ${s.obj}`);
    await bot.goLand(circle, 4);
    // search: a spiral round the circle until the box sparkles on screen
    let box = await bot.call('visibleBoxSafe');
    for (let r = 6; !box && r <= 36; r += 10) for (let a = 0; a < 6.28 && !box; a += 1.05) { await bot.walkTo({ x: circle.x + Math.cos(a) * r, y: circle.y + Math.sin(a) * r }, 2, 40); box = await bot.call('visibleBoxSafe'); }
    ok(box, 'never spotted the box in the circle');
    await bot.walkTo(box, 1.4, 60);
    s = await bot.until(s => /GRAB THE BOX/.test(s.obj), 5); ok(s, 'no grab prompt next to the box: ' + (await bot.peek()).obj);
    await bot.press('Space'); await bot.tick(300);
  }
};
// (b) the import: any boat, alongside the fishing boat, the boxes back to the Bluff ramp
FW.import = async bot => {
  let s = await bot.peek(); bot.log(s.obj);
  await takeBoat(bot, null, true); // any boat will do: the nearest, then round by sea
  s = await bot.peek(); const fb = s.targets.find(t => /PELICAN/.test(t.label)); ok(fb, 'no arrow to the fishing boat: ' + s.obj);
  s = await pullAlongside(bot);
  const ramp = s.targets.find(t => /RAMP/.test(t.label)); ok(ramp, 'no arrow to the ramp');
  await sailGuarded(bot, ramp, { arrive: 11, stop: true, maxSec: 300 });
};
// (c) setting up: the Bluff first (when we're at its ramp), the jetty and Granite Island by boat, then town, then the watch spot
FW.setup = async bot => {
  const sites = Object.fromEntries((await bot.call('sites')).map(q => [q.id, q]));
  let s = await bot.peek(); if (!s.onFoot) await bot.getOut();
  if (Math.hypot(sites.bluff.x - s.x, sites.bluff.y - s.y) < 1500) {
    // at the Bluff ramp after the import: the Bluff, then by boat to the jetty end, across the island, back to town
    await setUpAt(bot, sites.bluff);
    await takeBoat(bot);
    await sailGuarded(bot, sites.jetty, { arrive: 9, stop: true });
    await bot.getOut(); await setUpAt(bot, sites.jetty);
    await setUpAt(bot, sites.granite);
    await setUpAt(bot, sites.warland);
  } else {
    // starting in town (the job on its own): Warland, then over the causeway to the island and out along the jetty
    await bot.goLand(sites.warland, 2); await setUpAt(bot, sites.warland);
    await bot.goLand(sites.granite, 2); await setUpAt(bot, sites.granite);
    await setUpAt(bot, sites.jetty);
  }
  const fin = sites.bighouse; if (fin) { await bot.goLand(fin, 2); await setUpAt(bot, fin); }
  s = await bot.peek(); bot.log(s.obj); ok(/WATCH FROM HERE/.test(s.obj) || s.targets.some(t => /WATCH/.test(t.label)), 'no "watch from here" after the sites');
  const view = s.targets.find(t => /WATCH/.test(t.label));
  await bot.goLand(view, 2);
};
// (d) midnight: the clock strikes twelve and the show plays out
FW.midnight = async bot => {
  let s = await bot.until(s => s.show === 'clock', 10); ok(s, 'the show did not start');
  const h = s.hour; bot.log(`show starts at ${h.toFixed(2)}`); ok(h >= 23.9 || h < 0.2, 'the clock did not strike twelve');
  s = await bot.until(s => s.state === 'win' || s.state === 'week' || (s.msgs || []).some(m => /JOB REPLAYED/.test(m)), 120, 300); ok(s, 'no win screen after the show');
  return s;
};
FW.TITLES = ['HIDDEN FIREWORKS', 'THE IMPORT', 'SETTING UP', 'MIDNIGHT']; FW.STEPS = [FW.stash, FW.import, FW.setup, FW.midnight];
S['fireworks-night'] = {
  query: 'play=schoolie&night=4&brief=1', maxSec: 4800,
  async run(bot) {
    await startFromBrief(bot); await FW.stash(bot);
    await nextJob(bot, 'THE IMPORT', 30); await FW.import(bot);
    await nextJob(bot, 'SETTING UP', 30); await FW.setup(bot);
    await nextJob(bot, 'MIDNIGHT', 30); const s = await FW.midnight(bot);
    return `win screen; $${s.cash}`;
  },
};
// one job on its own (Round A's &job=, a replay): 0 hidden fireworks, 1 the import, 2 setting up, 3 midnight
FW.TITLES.forEach((title, j) => {
  S['fireworks-job-' + (j + 1)] = {
    query: `play=schoolie&night=4&job=${j}&brief=1`, maxSec: 1500, hidden: true,
    async run(bot) {
      await startFromBrief(bot); const s0 = await bot.peek(); ok(s0.job && s0.job.title === title, `expected ${title}, got ${s0.job && s0.job.title}`);
      await FW.STEPS[j](bot);
      const s = await bot.until(q => q.state === 'week' || q.state === 'win' || (q.msgs || []).some(m => /JOB REPLAYED/.test(m)) || (q.job && q.job.title !== title), j === 3 ? 5 : 60, 200);
      ok(s, title + ' never finished: ' + (await bot.peek()).obj); return title + ' done';
    },
  };
});
S.FW = FW;

S['fireworks-recovery'] = {
  query: 'play=schoolie&night=4&from=2&brief=1', maxSec: 1800,
  async run(bot) {
    await startFromBrief(bot);
    // lose your boat: load the fireworks, then step off on a beach; the objective sends you back to it
    await takeBoat(bot, null, true);
    let s = await bot.peek(); const fb = s.targets.find(t => /PELICAN/.test(t.label));
    void fb; s = await pullAlongside(bot);
    // step off at the old wharf under the Bluff, well short of the ramp
    const wharf = await bot.call('wharf'); ok(wharf, 'no wharf');
    await sailGuarded(bot, wharf, { arrive: 4, stop: true, maxV: 10 });
    ok(await bot.getOut(), 'could not step off at the wharf');
    s = await bot.until(s => /GET BACK ON YOUR/.test(s.obj), 4); ok(s, 'no "get back on your boat" objective after stepping off: ' + (await bot.peek()).obj);
    bot.log('recovery: ' + s.obj);
    const yb = s.targets.find(t => /YOUR/.test(t.label)); ok(yb, 'no arrow back to the boat');
    for (let k = 0; k < 4; k++) {
      // the old wharf has its own jet ski too: if we got on the wrong one, off again and closer to ours
      s = await bot.peek(); const t = s.targets.find(q => /YOUR/.test(q.label)); if (!t) break;
      if (!s.onFoot) await bot.getOut(); await bot.walkTo(t, k ? 0.8 : 2.2, 60); await bot.getIn();
    }
    s = await bot.until(q => q.targets.some(t => /RAMP/.test(t.label)) && !q.onFoot, 5); ok(s, 'could not get back on with the fireworks: ' + (await bot.peek()).obj);
    const ramp = s.targets.find(t => /RAMP/.test(t.label));
    await sailGuarded(bot, ramp, { arrive: 11, stop: true });
    // the boxes are in: setting up starts
    await nextJob(bot, 'SETTING UP', 90); // (the import is done: the next brief comes up)
    return 'stepped off with the fireworks aboard, got back on, delivered them';
  },
};

// busted in the middle of setting up, by ordinary play, from the big house on the hill (the lock-up: the police are
// right there; &atPlace=bighouse starts on its baked slot, and it's keys only from then on): fumble every tube so the
// site is blown, walk over to the patrol car that responds and lose the struggle. Then the paddy-wagon ride, the
// lock-up, the release at the gate (with the gate bike), the job starting over; set the big house properly, RESTART
// JOB (the site stays set), and QUIT TO TITLE / CONTINUE.
S['fireworks-busted'] = {
  query: 'play=schoolie&night=4&from=3&brief=1&atPlace=town', maxSec: 1200,
  async run(bot) {
    await startFromBrief(bot);
    { const h = await bot.peek(); bot.home = { x: h.x, y: h.y }; } // the Ocean St footpath we started on
    const sites = Object.fromEntries((await bot.call('sites')).map(q => [q.id, q]));
    // Warland Reserve, a short walk from Ocean St: fumble every tube so it's blown
    await bot.goLand(sites.warland, 2);
    let s, blown = false;
    const blow = async () => { if (blown) return; blown = true; await bot.goLand(sites.warland, 2); await setUpAt(bot, sites.warland, { miss: true }); const t = await bot.peek(); ok(t.msgs.some(m => /BLOWN/.test(m)), 'missing every tube did not blow the site: ' + lastMsgs(t)); bot.log(`blown: ${lastMsgs(t)} (gossip ${t.meter.toFixed(1)})`); };
    let rode = false; s = await getCaught(bot, blow);
    ok(s, `never got busted (gossip ${(await bot.peek()).meter.toFixed(1)})`); if (s.state === 'ride') rode = true;
    bot.log('busted: ' + s.state);
    s = await bot.until(q => { if (q.state === 'ride') rode = true; return q.state === 'lockedUp' && q.stateT > 1.3; }, 90, 200);
    ok(s, 'no locked-up card after the ride'); ok(rode, 'no paddy-wagon ride');
    await bot.press('Enter'); bot.giveUp = false;
    s = await bot.until(q => q.state === 'play', 20, 200); ok(s, 'not let out after the lock-up');
    const bike = await bot.call('nearestCar', s.x, s.y, ['bike', 'bmx']); ok(bike && bike.d < 40, 'no bike at the lock-up gate');
    bot.log('released: ' + lastMsgs(s));
    await nextJob(bot, 'SETTING UP', 30); // the job starts over from the gate
    s = await bot.peek(); ok(/0\/3/.test(s.obj), 'unexpected count after the bust: ' + s.obj);
    ok(s.targets.some(t => Math.hypot(t.x - sites.warland.x, t.y - sites.warland.y) < 2), 'the blown site was not offered again after the bust');
    // the big house is right by the gate: set it
    const fin = sites.bighouse; ok(fin, 'no site at the big house');
    await bot.goLand(fin, 2); await setUpAt(bot, fin);
    s = await bot.peek(); ok(/1\/3/.test(s.obj), 'the big house did not count: ' + s.obj);
    // RESTART JOB from the pause menu: the site set stays set
    await bot.press('Escape'); await bot.tick(200); ok((await bot.peek()).state === 'pause', 'no pause menu');
    await bot.press('ArrowDown'); await bot.press('Enter'); await bot.tick(200); await bot.press('ArrowUp'); await bot.press('Enter'); await bot.tick(400); // RESTART JOB, YES
    s = await bot.until(q => q.state === 'brief' && q.stateT > 1, 10); ok(s, 'RESTART JOB did not bring up the brief');
    await bot.press('Enter'); await bot.tick(300); s = await bot.peek();
    ok(s.job && s.job.title === 'SETTING UP' && /1\/3/.test(s.obj), 'the restarted job lost its site: ' + s.obj);
    ok(s.msgs.some(m => /STILL THERE/.test(m)), 'no "the site you set is still there" message');
    const saved = await bot.call('savedSites'); ok(saved.includes('bighouse'), 'the set site is not saved with the night: ' + JSON.stringify(saved));
    const left = s.targets.filter(t => Object.values(sites).some(q => Math.hypot(q.x - t.x, q.y - t.y) < 2)).length;
    ok(1 + left >= 3, `only ${left} sites still marked: not finishable`);
    // QUIT TO TITLE and CONTINUE (Round A: a quit abandons the night; CONTINUE goes to the week's first unfinished night)
    await bot.press('Escape'); await bot.tick(200); await bot.press('ArrowDown', 7); await bot.press('Enter'); await bot.tick(500);
    ok((await bot.peek()).state === 'title', 'quit did not reach the title');
    await bot.press('ArrowDown'); await bot.press('Enter'); await bot.tick(500);
    s = await bot.until(q => q.state === 'brief' && q.stateT > 1, 10); ok(s, 'continue did not bring up a night brief');
    await bot.press('Enter'); await bot.tick(300); s = await bot.peek(); ok(s.job && s.job.started, 'continue did not start a job');
    return `Warland blown, caught in town, the paddy wagon, let out at the gate by the bike, the job again: the big house set, RESTART JOB kept it (${1 + left} sites reachable); quit and continued (night ${s.night})`;
  },
};

S['fireworks-busted-kept'] = {
  query: 'play=schoolie&night=4&from=3&brief=1&atPlace=town', maxSec: 1200,
  async run(bot) {
    await startFromBrief(bot);
    { const h = await bot.peek(); bot.home = { x: h.x, y: h.y }; } // the Ocean St footpath we started on
    const sites = Object.fromEntries((await bot.call('sites')).map(q => [q.id, q]));
    const fin = sites.warland; // (a short walk from Ocean St, where the patrols go)
    await bot.goLand(fin, 2); await setUpAt(bot, fin);
    let s = await bot.peek(); ok(/1\/3/.test(s.obj), 'Warland did not count: ' + s.obj);
    const borrow = async () => { const q = await bot.peek(); const c = await bot.call('nearestCar', q.x, q.y, ['car']); if (!c || c.d > 250) return; bot.log(`borrowing a ${c.type} in full view`); await bot.walkTo(c, 1.4, 60); await bot.getIn(); await bot.wait(600); await bot.getOut(); };
    let rode = false; s = await getCaught(bot, borrow);
    ok(s, `never got busted (gossip ${(await bot.peek()).meter.toFixed(1)})`); if (s.state === 'ride') rode = true;
    s = await bot.until(q => { if (q.state === 'ride') rode = true; return q.state === 'lockedUp' && q.stateT > 1.3; }, 90, 200);
    ok(s, 'no locked-up card after the ride'); ok(rode, 'no paddy-wagon ride');
    await bot.press('Enter'); bot.giveUp = false;
    await nextJob(bot, 'SETTING UP', 30); // the job starts over from the gate
    s = await bot.peek(); bot.log('after the bust: ' + s.obj + ' | ' + lastMsgs(s));
    ok(/1\/3/.test(s.obj), 'Warland was lost in the bust: ' + s.obj);
    ok(!s.targets.some(t => Math.hypot(t.x - fin.x, t.y - fin.y) < 2), 'Warland is marked to set again');
    ok(s.msgs.some(m => /STILL THERE/.test(m)), 'no "the site you set is still there" message');
    return 'Warland set, caught after kicking bins in town, the paddy wagon, let out: Warland still counts (1/3) and is not marked again';
  },
};

// a restart in the middle of a game of bowls: RESTART JOB from the pause menu puts you back at the job's start, the
// bowls game is over (no bowls panel), and you can walk off (nothing frozen)
S['bowls-restart'] = {
  query: 'play=schoolie&at=2745,2580&brief=1', maxSec: 300,
  async run(bot) {
    await startFromBrief(bot);
    const mat = await bot.call('mat'); await bot.walkTo(mat, 1.5, 120);
    let s = await bot.until(q => /SECRETARY/.test(q.prompt), 4); ok(s, 'no bowls prompt at the mat');
    await bot.press('Space'); await bot.press('Space'); s = await bot.peek(); ok(s.mini && s.mini.kind === 'bowls', 'bowls did not start');
    await bot.press('Escape'); await bot.tick(200); ok((await bot.peek()).state === 'pause', 'no pause menu');
    await bot.press('ArrowDown'); await bot.press('Enter'); await bot.tick(200); await bot.press('ArrowUp'); await bot.press('Enter'); await bot.tick(400); // RESTART JOB, YES
    s = await bot.until(q => q.state === 'brief' && q.stateT > 1, 10); ok(s, 'RESTART JOB did not bring up the brief');
    await bot.press('Enter'); await bot.tick(400); s = await bot.peek();
    ok(!s.mini && !s.menu, 'the bowls game (or the secretary) is still up after the restart');
    const x0 = s.x, y0 = s.y; await bot.hold(['KeyW']); await bot.tick(1500); await bot.hold([]); const t = await bot.peek();
    ok(Math.hypot(t.x - x0, t.y - y0) > 3, 'frozen after the restart');
    return 'bowls started, RESTART JOB: no bowls game left, and you can walk';
  },
};

S['boarded-on-the-import'] = {
  query: 'play=schoolie&night=4&from=2&brief=1', maxSec: 900,
  async run(bot) {
    await startFromBrief(bot);
    await takeBoat(bot, null, true); // any boat will do: the nearest, then round by sea
    let s = await bot.peek(); const fb = s.targets.find(t => /PELICAN/.test(t.label));
    void fb; s = await pullAlongside(bot);
    // go and find the police boat, then sit still beside it
    let boarded = false;
    for (let i = 0; i < 60 && !boarded; i++) {
      const pb = await bot.call('policeBoat'); if (!pb) { await bot.tick(500); continue; }
      const r = await bot.sailTo(pb, { arrive: 8, stop: true, maxSec: 20, abort: s => s.board === 'police' || !!s.tackle });
      s = await bot.until(s => s.board === 'police' || s.board === 'deck' || !!s.tackle, 8, 100); if (s) boarded = true;
      void r;
    }
    ok(boarded, 'the police boat never came alongside');
    bot.log('boarded: ' + (await bot.peek()).obj);
    s = await bot.until(s => !!s.tackle, 10, 80); ok(s, 'no struggle on deck');
    for (let i = 0; i < 400; i++) { const t = await bot.peek(); if (!t.tackle) break; await bot.struggle(t); await bot.tick(60); }
    await bot.hold([]);
    s = await bot.until(s => /OVERBOARD/.test(s.callout) || s.state === 'ride', 5, 100);
    ok(s && s.state !== 'ride', 'lost the struggle (busted) instead of shoving the officer overboard');
    bot.log('struggle won: ' + s.callout);
    s = await bot.peek(); const ramp = s.targets.find(t => /RAMP/.test(t.label)); ok(ramp, 'no arrow to the ramp after the struggle: ' + s.obj);
    await sailGuarded(bot, ramp, { arrive: 11, stop: true, maxSec: 300 });
    s = await bot.until(s => s.job && s.job.title === 'SETTING UP', 30); ok(s, 'the import did not finish');
    return 'officer overboard, fireworks delivered';
  },
};

S['water-race'] = {
  query: 'play=roam&at=5050,2955', maxSec: 900,
  async run(bot) {
    await takeBoat(bot, 'jetski');
    const pad = await bot.call('racePad');
    let s = null;
    for (let k = 0; k < 4 && !s; k++) { await sailGuarded(bot, pad, { arrive: k ? 3 : 5, stop: true, maxV: k ? 5 : 30 }); s = await bot.until(q => /RACE THE RIVALS/.test(q.prompt), 3, 100); }
    ok(s, 'no race prompt in the ring: ' + (await bot.peek()).prompt);
    await bot.press('Space');
    s = await bot.until(s => s.race && s.race.cd <= 0, 6); ok(s, 'the race did not start');
    const t0 = s.t;
    for (let i = 0; i < 80; i++) {
      s = await bot.peek(); if (!s.race) break; const g = s.race.gate; if (!g) break;
      await bot.sailTo(g, { arrive: 7, stop: false, maxSec: 60, abort: q => !q.race || q.race.gi !== s.race.gi });
    }
    s = await bot.until(s => !s.race, 5); ok(s, 'the race never ended');
    const res = s.msgs.find(m => /WATER RACE/.test(m)); ok(res, 'no race result: ' + lastMsgs(s));
    bot.log(res + ` (${(s.t - t0).toFixed(0)}s)`);
    // and the buoy time trial
    s = null; for (let k = 0; k < 4 && !s; k++) { await sailGuarded(bot, pad, { arrive: k ? 3 : 5, stop: true, maxV: k ? 5 : 30 }); s = await bot.until(q => /BUOY TIME TRIAL/.test(q.prompt), 3, 100); }
    ok(s, 'no time-trial prompt');
    await bot.press('KeyH');
    s = await bot.until(s => s.race && s.race.cd <= 0, 6); ok(s, 'the trial did not start');
    for (let i = 0; i < 80; i++) { s = await bot.peek(); if (!s.race) break; const g = s.race.gate; if (!g) break; await bot.sailTo(g, { arrive: 7, stop: false, maxSec: 60, abort: q => !q.race || q.race.gi !== s.race.gi }); }
    s = await bot.until(s => !s.race, 5); const tr = s && s.msgs.find(m => /BUOY TRIAL/.test(m)); ok(tr, 'no trial result');
    return `${res}; ${tr}`;
  },
};

async function bmxJam(bot, park) {
  let s = await bot.peek();
  ok(await bot.borrowCar(['bmx']), 'could not get on a BMX');
  const pad = await bot.call('pad', park); s = await bot.peek(); await bot.followPath([[s.x, s.y], [pad.x, pad.y]], { arrive: 3, stop: true, maxV: 5, maxSec: 60, abort: q => !!q.jam });
  if (!(await bot.peek()).jam) { await bot.hold(['KeyS']); await bot.tick(600); await bot.hold([]); }
  s = await bot.until(s => !!s.jam, 6, 100); if (!s) { const q = await bot.peek(); const pd = await bot.call('pad', park); ok(false, 'no jam on the pad: ' + q.prompt + ' speed ' + (q.v && q.v.speed.toFixed(2)) + ' d ' + Math.hypot(q.x - pd.x, q.y - pd.y).toFixed(1) + ' state ' + q.state + ' veh ' + (q.v && q.v.type) + ' dbg ' + JSON.stringify(await bot.page.evaluate(() => ({ cool: VH.Sports.jamCool, err: VH.Game.lastError, mini: !!VH.Sports.mini, menu: !!VH.Sports.menu, z: VH.Game.player.vehicle.z })))); }
  const kicks = await bot.call('kickers', park); let tricks = 0;
  for (let lap = 0; lap < 12; lap++) {
    s = await bot.peek(); if (!s.jam) break; bot.log(`jam ${s.jam.t.toFixed(0)}s left, score ${s.jam.score}`);
    const k = kicks[lap % kicks.length]; const ca = Math.cos(k.a), sa = Math.sin(k.a);
    // line up 9 m short of the lip, then ride through it
    await bot.followPath([[s.x, s.y], [k.x - ca * 9, k.y - sa * 9]], { arrive: 1.5, stop: true, maxSec: 20 });
    s = await bot.peek(); const v = s.v; const da = Math.atan2(sa, ca) - v.ang;
    await bot.followPath([[v.x, v.y], [k.x - ca * 4, k.y - sa * 4], [k.x + ca * 4, k.y + sa * 4]], { arrive: 1.5, maxSec: 8, abort: q => q.v && q.v.z > 0.05 });
    void da;
    const air = await bot.until(q => q.v && q.v.z > 0.05, 2, 20);
    if (air) { const key = ['KeyA', 'KeyS', 'Space', 'KeyD'][lap % 4]; await bot.hold([key]); await bot.tick(lap % 4 === 2 ? 380 : 460); await bot.hold([]); await bot.until(q => !q.v || q.v.z === 0, 3, 30); const t = await bot.peek(); if (/(SPIN|FLIP|WHIP|360)/.test(JSON.stringify(t))) tricks++; }
  }
  s = await bot.until(s => !s.jam, 75, 100); ok(s, 'the jam never ended');
  const res = bot.saw(/JAM:/); ok(res, 'no jam result');
  return res;
}
S['bmx-skate-park'] = { query: 'play=roam&atPlace=skate', maxSec: 300, run: bot => bmxJam(bot, 'skate') };
S['bmx-dirt-jumps'] = { query: 'play=roam&atPlace=dirt', maxSec: 300, run: bot => bmxJam(bot, 'dirt') };

async function shootHoop(bot) {
  // hold Space; let go when the marker is in the green (the band is on screen)
  await bot.hold(['Space']);
  for (let i = 0; i < 300; i++) {
    const s = await bot.peek(); const m = s.mini; if (!m || m.meter == null) { await bot.tick(15); continue; }
    const d = Math.hypot(m.hoop.x - s.x, m.hoop.y - s.y); const ideal = Math.min(0.97, Math.max(0.3, 0.28 + d * 0.075));
    if (m.meter >= ideal - 0.015 && m.meter <= ideal + 0.04) break; await bot.tick(10);
  }
  await bot.hold([]); await bot.tick(1500);
}
S['hoops'] = {
  query: 'play=roam&at=4935,2300', maxSec: 600,
  async run(bot) {
    const c = await bot.call('court', 0);
    await bot.walkTo({ x: c.hoop.x + Math.cos(c.face) * 4, y: c.hoop.y + Math.sin(c.face) * 4 }, 1, 60);
    let s = await bot.until(s => /SHOOT HOOPS/.test(s.prompt), 4); ok(s, 'no hoops prompt on the court');
    await bot.press('Space'); s = await bot.peek(); ok(s.menu, 'no hoops menu');
    await bot.press('Space'); s = await bot.peek(); ok(s.mini && s.mini.mode === 'around', 'shoot-around did not start');
    for (let i = 0; i < 5; i++) await shootHoop(bot);
    s = await bot.peek(); bot.log(`shoot-around streak ${s.mini.streak}`); ok(s.mini.streak >= 2, 'shoot-around: no streak');
    // HORSE: set from here; when the kid sets, walk to the ring and match it
    await bot.press('KeyE'); await bot.press('Space'); await bot.press('ArrowDown'); await bot.press('Space');
    s = await bot.peek(); ok(s.mini && s.mini.mode === 'horse', 'HORSE did not start');
    for (let i = 0; i < 200; i++) {
      s = await bot.peek(); const m = s.mini; if (!m || m.over) break;
      if (m.ball !== 'held') { await bot.tick(300); continue; }
      if (m.horse.phase === 'match' && m.horse.spot && Math.hypot(m.horse.spot.x - s.x, m.horse.spot.y - s.y) > 1) { await bot.walkTo(m.horse.spot, 0.7, 20); continue; }
      await shootHoop(bot);
    }
    s = await bot.until(s => !s.mini || s.mini.over, 30); const hr = (await bot.peek()).msgs.find(m => /HORSE|YOU BEAT/.test(m)) || ''; bot.log('HORSE: ' + hr);
    await bot.until(s => !s.mini, 6);
    // the 60-second shootout
    s = await bot.until(s => /SHOOT HOOPS/.test(s.prompt), 6); ok(s, 'no hoops prompt after HORSE');
    await bot.press('Space'); await bot.press('ArrowDown', 2); await bot.press('Space');
    s = await bot.peek(); ok(s.mini && s.mini.mode === 'shootout', 'shootout did not start');
    for (let i = 0; i < 60; i++) { s = await bot.peek(); if (!s.mini || s.mini.over) break; if (s.mini.ball === 'held') await shootHoop(bot); else await bot.tick(100); }
    s = await bot.until(s => s.msgs.some(m => /SHOOTOUT/.test(m)), 10); ok(s, 'no shootout result');
    return `${hr}; ${s.msgs.find(m => /SHOOTOUT/.test(m))}`;
  },
};

async function bowlsMatch(bot, merv) {
  let s = await bot.peek(); if (!s.onFoot) await bot.getOut();
  const mat = await bot.call('mat'); await bot.walkTo(mat, 1.5, 120);
  s = await bot.until(s => /SECRETARY/.test(s.prompt), 4); ok(s, 'no bowls prompt at the mat');
  const cash0 = s.cash; await bot.press('Space'); s = await bot.peek(); ok(s.menu && /PLAY|A GAME/.test(s.menu.items[0]), 'no chat with the club secretary');
  await bot.press('Space'); s = await bot.peek(); ok(s.mini && s.mini.kind === 'bowls', 'bowls did not start');
  bot.log(`green fee: $${cash0 - s.cash}`);
  for (let i = 0; i < 2000; i++) {
    s = await bot.peek(); const m = s.mini; if (!m) break; if (m.phase === 'done') { await bot.tick(200); bot.result = (await bot.peek()).msgs.find(x => /WINS|BEAT|SQUARE/.test(x)); break; }
    if (m.phase !== 'aim' || m.turn !== 'you') { await bot.tick(250); continue; }
    const jd = Math.hypot(m.jack.x - m.mat.x, m.jack.y - m.mat.y);
    let want = Math.max(0, Math.min(1, (Math.sqrt(2 * 1.4 * (jd - 0.3)) - 5) / 6.2));
    if (merv) {
      // Merv sees where the line ends: nudge the aim until it finishes beside the jack
      for (let k = 0; k < 30; k++) { const g = await bot.call('bowlGuide', want); const t = await bot.peek(); const side = (g.x - t.mini.jack.x) * -Math.sin(mat.ang) + (g.y - t.mini.jack.y) * Math.cos(mat.ang); if (Math.abs(side) < 0.25) break; await bot.hold([side > 0 ? 'KeyA' : 'KeyD']); await bot.tick(60); await bot.hold([]); }
    }
    await bot.hold(['Space']);
    for (let k = 0; k < 400; k++) { const t = await bot.peek(); if (t.mini && t.mini.meter != null && t.mini.meter >= want) break; await bot.tick(12); }
    await bot.hold([]); await bot.tick(800);
  }
  s = await bot.until(s => !s.mini, 10); const res = bot.result || (s || await bot.peek()).msgs.find(m => /WINS|BEAT|SQUARE/.test(m)) || ''; ok(res, 'no bowls result'); ok(s, 'the bowls game did not end');
  return res;
}
S['bowls-merv'] = { query: 'play=grump&at=2745,2580', maxSec: 900, run: bot => bowlsMatch(bot, true) };
S['bowls-jaz'] = { query: 'play=roam&at=2745,2580', maxSec: 900, run: bot => bowlsMatch(bot, false) };

S['kev-boards-a-hoon'] = {
  query: 'play=cop&at=5850,3640', maxSec: 600,
  async run(bot) {
    await bot.getOut();
    await takeBoat(bot, 'speedboat');
    let s = await bot.peek(); await bot.sailTo({ x: s.v.x + 120, y: s.v.y - 60 }, { arrive: 15, stop: false, maxSec: 20 });
    let hoon = null; for (let i = 0; i < 60 && !hoon; i++) { const h = await bot.call('hoons'); hoon = h[0]; if (!hoon) await bot.tick(500); }
    ok(hoon, 'no water hoons turned up'); bot.log((await bot.peek()).msgs.find(m => /HOONS/.test(m)) || 'hoons out');
    // chase: aim a little ahead of them, ease off when alongside, E when the prompt says BOARD
    let boarded = false;
    for (let i = 0; i < 1200 && !boarded; i++) {
      s = await bot.peek(); const hs = await bot.call('hoons'); if (!hs.length) { await bot.tick(200); continue; }
      const h = hs.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      if (/BOARD THEM/.test(s.prompt)) { await bot.press('KeyE'); boarded = true; break; }
      if (/PULL OVER/.test(s.prompt) && !/ALONGSIDE/.test(s.prompt)) { bot.log('horn: pull over'); await bot.press('KeyH'); }
      const d = Math.hypot(h.x - s.x, h.y - s.y); const lead = Math.min(1.2, d / 25);
      const aim = { x: h.x + h.vx * lead + Math.cos(h.ang + 1.57) * 3, y: h.y + h.vy * lead + Math.sin(h.ang + 1.57) * 3 };
      const keys = bot.steerKeys(s, aim, { maxV: d < 25 ? h.speed + 2 : 30, stop: d < 25 && h.speed < 1 }); await bot.hold(keys); await bot.tick(60);
    }
    ok(boarded, 'never got alongside a hoon');
    s = await bot.until(s => !!s.tackle, 4, 60); ok(s, 'no struggle after boarding');
    for (let i = 0; i < 400; i++) { const t = await bot.peek(); if (!t.tackle) break; await bot.struggle(t); await bot.tick(60); }
    await bot.hold([]);
    s = await bot.until(s => s.board === 'cuffed' || s.msgs.some(m => /SLIPPED/.test(m)), 4); ok(s, 'no result from the struggle');
    if (s.board !== 'cuffed') return 'the hoon slipped away (Kev keeps the jet ski)';
    bot.log('cuffed: ' + s.obj + ' | ' + lastMsgs(s));
    await bot.press('KeyH');
    s = await bot.until(s => s.msgs.some(m => /COLLECTS THEM/.test(m)), 60, 200); ok(s, 'the police boat never collected them');
    return 'boarded, cuffed, collected by the police boat';
  },
};

S['motorbike-road'] = {
  query: 'play=roam&at=2770,3110', maxSec: 600,
  async run(bot) {
    // the road bike at the industrial estate: a wheelie, a stoppie, then straight into a wall for the tuck and roll
    ok(await bot.borrowCar(['roadbike']), 'could not get on the road bike');
    let s = await bot.peek(); ok(s.v && s.v.type === 'roadbike', 'not on the road bike: ' + (s.v && s.v.type));
    // pull away with Space held: a wheelie; then straight onto the brakes with Space still held: a stoppie
    for (let tryN = 0; tryN < 4 && !(bot.saw(/WHEELIE! [1-9]/) && bot.saw(/STOPPIE!/)); tryN++) {
      s = await bot.peek(); if (s.onFoot) { bot.log('came off: back on'); await bot.borrowCar(['roadbike']); }
      if (tryN) { const r1 = await bot.call('route', s.x, s.y, s.x + 300 - tryN * 200, s.y - 200 + tryN * 150); s = await bot.peek(); await bot.followPath([[s.x, s.y], ...(r1 || []).slice(0, 4)], { arrive: 5, stop: true, maxV: 8, maxSec: 20 }); }
      await bot.hold(['KeyW', 'Space']); await bot.until(q => /WHEELIE! [1-9]\d/.test(q.prompt) || q.onFoot, 4, 80);
      await bot.hold(['KeyS', 'Space']); await bot.until(q => /STOPPIE!/.test(q.prompt) || q.onFoot || (q.v && q.v.speed < 2), 4, 40);
      await bot.hold([]); await bot.tick(500);
    }
    ok(bot.saw(/WHEELIE!/), 'no wheelie'); ok(bot.saw(/STOPPIE!/), 'no stoppie');
    bot.log(`wheelie and stoppie: ${bot.saw(/WHEELIE! [1-9]/)} / ${bot.saw(/STOPPIE!/)}`);
    // the tuck and roll: full throttle at the nearest big building
    s = await bot.peek(); if (s.onFoot) await bot.borrowCar(['roadbike', 'postie']);
    const wall = await bot.page.evaluate(() => { const pl = VH.Game.player; let best = null, bd = 1e9; VH.World.buildingGrid.query(pl.x - 120, pl.y - 120, pl.x + 120, pl.y + 120, b => { const d = Math.hypot(b.cx - pl.x, b.cy - pl.y); if (d > 30 && d < bd && (b.bb[2] - b.bb[0]) > 12) { bd = d; best = { x: b.cx, y: b.cy }; } }); return best; });
    ok(wall, 'no wall nearby');
    for (let i = 0; i < 300; i++) { const q = await bot.peek(); if (q.onFoot || bot.saw(/TUCK AND ROLL|ROLLED IT|OFF YOU COME/)) break; const keys = bot.steerKeys(q, wall, { maxV: 40 }); await bot.hold(keys.filter(k => k !== 'KeyS').concat(['KeyW'])); await bot.tick(60); }
    await bot.hold([]);
    const roll = bot.saw(/TUCK AND ROLL|ROLLED IT|OFF YOU COME/); ok(roll, 'no tuck and roll after riding into a wall');
    return `wheelie, stoppie, ${roll}`;
  },
};
S['motorbike-dirt'] = {
  query: 'play=roam&atPlace=dirt', maxSec: 300,
  async run(bot) {
    // the dirt bike at the scrub jumps: ride the loop over the doubles with a spin in the air
    ok(await bot.borrowCar(['dirtbike']), 'could not get on the dirt bike');
    let s = await bot.peek(); ok(s.v && s.v.type === 'dirtbike', 'not on the dirt bike');
    const kicks = await bot.call('kickers', 'dirt'); let airs = 0;
    for (let lap = 0; lap < 4; lap++) {
      const k = kicks[lap % kicks.length]; const ca = Math.cos(k.a), sa = Math.sin(k.a); s = await bot.peek();
      await bot.followPath([[s.x, s.y], [k.x - ca * 12, k.y - sa * 12]], { arrive: 2, stop: true, maxSec: 30 });
      s = await bot.peek(); await bot.followPath([[s.x, s.y], [k.x - ca * 4, k.y - sa * 4], [k.x + ca * 5, k.y + sa * 5]], { arrive: 1.5, maxSec: 8, maxV: 14, abort: q => q.v && q.v.z > 0.05 });
      const air = await bot.until(q => q.v && q.v.z > 0.05, 2, 20);
      if (air) { airs++; await bot.hold(['KeyA']); await bot.tick(450); await bot.hold([]); await bot.until(q => !q.v || q.v.z === 0, 3, 30); }
    }
    ok(airs > 0, 'never got air on the dirt bike');
    return `${airs} jumps on the dirt bike; ${bot.saw(/SMOOTH|CASED/) || ''}`;
  },
};

// every Round B placement sits on a baked spawn slot that is still valid in the running game: the kinds Round B needs
// are all baked, land things stand on walkable ground you can reach on foot from the street (VH.Spawn.reachable),
// water things are on the water (read-only checks of what was placed)
S['spawn-slots'] = {
  query: 'play=roam', maxSec: 60,
  async run(bot) {
    const r = await bot.page.evaluate(() => {
      const RB = VH.RB, Wt = VH.Water, N = VH.Nav, bad = RB.checkSlots().map(k => 'missing slots: ' + k); let n = 0;
      const foot = (what, p) => { n++; if (!p || !N.walkable(p.x, p.y) || !VH.Spawn.reachable(p.x, p.y)) bad.push(what + ' (foot)'); };
      const wet = (what, p) => { n++; if (!p || !Wt.isWater(p.x, p.y)) bad.push(what + ' (water)'); };
      for (const s of VH.Fireworks.SITES) foot('site ' + s.id, s);
      for (const s of VH.Fireworks.stashSpots) if (s.id !== 'ute') foot('stash ' + s.id, s);
      foot('watch spot', VH.Fireworks.view);
      for (const r of Wt.ramps) { foot('ramp top ' + r.name, r.top); wet('ramp water ' + r.name, r.water); }
      for (const g of Wt.gates) wet('gate ' + g.i, g);
      for (const b of Wt.rampBuoys) wet('ramp buoy', b);
      wet('race start', Wt.start);
      for (const b of Wt.boats) if (b.moor) wet('mooring ' + b.type, b.moor);
      const Sp = VH.Sports; if (Sp.skate) foot('skate pad', Sp.skate.pad); if (Sp.dirt) foot('dirt pad', Sp.dirt.pad);
      for (const v of VH.Game.vehicles) if (!v.removed && (v.moto || v.type === 'bmx')) foot(v.type + ' parked', v);
      return { bad, n };
    });
    ok(!r.bad.length, 'invalid placements: ' + r.bad.join(', '));
    return `${r.n} placements, all on valid baked slots`;
  },
};

module.exports = S;
