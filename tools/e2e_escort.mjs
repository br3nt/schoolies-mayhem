// End-to-end check of Kev's prisoner escort, all three ways, each to the end of "HOON ON THE ESPLANADE":
//   1. cuff the hoon, walk them in on foot, E at the lock-up desk
//   2. cuff, E at the police car's rear door, drive to the station, E to take them out, E at the desk
//   3. cuff, lose the police car, radio for a spare (B), then as 2
// Needs Playwright (npm i -D playwright, or NODE_PATH pointing at an install) and the game served on a port:
//   cd game && python3 -m http.server 8765 &   node tools/e2e_escort.mjs [http://localhost:8765/index.html]
// Exits non-zero if any path doesn't finish the job, or the page logs an error.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(name, steps) {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '?play=cop&night=2&hour=21'); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  // straight to the hoon job, with the hoon already caught on foot right beside Kev
  await page.evaluate(() => {
    const M = VH.Missions, G = VH.Game; M.job.cleanup && M.job.cleanup(); M.idx = 1; M.prepJob(); M.startJob(); G.state = 'play';
    const j = M.job, pl = G.player; if (!pl.onFoot) G.exit(true);
    const s = VH.Nav.snap(pl.x + 1.4, pl.y, 3) || { x: pl.x + 1.2, y: pl.y }; const r = new VH.Ped('schoolie', s.x, s.y, { tag: 'hoon', shirt: '#d6302a' });
    G.peds.push(r); j.runner = r; r.cuffed = true; j.v.ai = null;
  });
  await sleep(300);
  // helpers: put Kev (and whoever he's escorting) at a spot, then press E
  const at = (x, y) => page.evaluate(([x, y]) => { const G = VH.Game, pl = G.player; const s = VH.Nav.snap(x, y, 6) || { x, y }; pl.x = s.x; pl.y = s.y; const q = VH.Escort.leading; if (q) { q.x = pl.x + 0.9; q.y = pl.y; } G.cam.x = pl.x; G.cam.y = pl.y; VH.MapRender.prefetch(pl.x, pl.y, 110); }, [x, y]);
  const E = async () => { await page.keyboard.press('KeyE'); await sleep(250); };
  // walk in the front door of a desk (0: the lock-up, 1: the station), up to the counter, E, and through the exchange
  const handOver = async k => {
    const d = await page.evaluate(k => VH.Escort.desks()[k], k); await at(d.x, d.y);
    await page.evaluate(k => { const s = VH.Escort.desks()[k].shop; VH.Shops.enter(s); const pl = VH.Game.player; pl.x = s.counter.x - s.door.nx * 0.9; pl.y = s.counter.y - s.door.ny * 0.9; }, k);
    await sleep(300); await E(); await sleep(300); await page.keyboard.press('Enter'); await sleep(400); await page.keyboard.press('Enter'); await sleep(300);
  };
  const state = () => page.evaluate(() => ({ job: VH.Missions.job && VH.Missions.job.title, idx: VH.Missions.idx, prisoners: VH.Escort.list.map(q => q.prisoner.stage), prompt: VH.Escort.prompt() }));
  let ok = false;
  try { await steps({ page, at, E, state, handOver }); await sleep(1600); const s = await state(); ok = s.idx === 2 && !s.prisoners.length; console.log(name, ok ? 'DONE' : 'NOT DONE', JSON.stringify(s)); }
  catch (e) { console.log(name, 'FAILED', e.message); }
  if (errors.length) { console.log(name, 'ERRORS', errors); ok = false; }
  await browser.close(); return ok;
}
const carDrive = async (h) => { const { page, at, E } = h;
  const q = await page.evaluate(() => { const q = VH.Escort.list[0]; return { x: q.x + 1, y: q.y }; }); await at(q.x, q.y); await E(); // up to the prisoner, grab
  const rd =await page.evaluate(() => VH.Escort.rearDoor(VH.Police.kevCar())); await at(rd.x, rd.y); await E(); // in the back
  await page.evaluate(() => { const G = VH.Game, c = VH.Police.kevCar(); const st = VH.Escort.desks()[1]; const n = VH.World.nearestEdge(st.x, st.y, 60); c.x = n.x; c.y = n.y; c.ang = n.ang; c.vx = c.vy = 0; G.enter(c, true); }); // drive to the station
  await sleep(300); await E(); // get out
  const rd2 = await page.evaluate(() => VH.Escort.rearDoor(VH.Police.kevCar())); await at(rd2.x, rd2.y); await E(); // take them out
  await h.handOver(1); // walk them in to the station's desk and hand them over
};
const results = [];
results.push(await run('on foot', async ({ page, E, handOver }) => {
  // a cuffed prisoner stays where they were cuffed
  const a = await page.evaluate(() => { const q = VH.Escort.list[0]; return { x: q.x, y: q.y, st: q.state }; }); await sleep(2500); const b = await page.evaluate(() => { const q = VH.Escort.list[0]; return { x: q.x, y: q.y, st: q.state }; });
  if (Math.hypot(a.x - b.x, a.y - b.y) > 1.5) throw new Error('the cuffed prisoner wandered off (' + b.st + ')');
  await E(); await handOver(0); }));
results.push(await run('by car', async h => { await h.page.evaluate(() => { const c = VH.Police.kevCar(), pl = VH.Game.player; c.x = pl.x + 6; c.y = pl.y; c.vx = c.vy = 0; }); await carDrive(h); }));
results.push(await run('spare car', async h => {
  await h.page.evaluate(() => { const c = VH.Police.kevCar(); c.addDamage(1); }); await sleep(200);
  await h.page.keyboard.press('KeyB'); // radio for a spare
  for (let i = 0; i < 80 && !(await h.page.evaluate(() => !!VH.Police.kevCar())); i++) await sleep(500);
  await carDrive(h);
}));
console.log(results.every(Boolean) ? 'ALL PATHS DONE' : 'SOME PATHS FAILED'); process.exit(results.every(Boolean) ? 0 : 1);
