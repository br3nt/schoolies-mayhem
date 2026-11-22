// Free Roam is locked until night 1 has been finished as Jaz, Merv and Kev. Input only: the menu is driven by key
// presses (and one finger tap on a phone); page.evaluate only reads state. Save data is seeded into localStorage with
// the real keys (progress:<char>), which is what a returning player has, not game state.
//
//   cd game && python3 -m http.server 4433 &
//   node tests/free_roam.mjs
// Needs Playwright. BASE=http://... to point elsewhere; SHOTS=/dir for a screenshot of the locked menu.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4433/index.html';
const SHOTS = process.env.SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const done1 = { nights: { 1: { done: true, best: 300, cash: 100, clean: true } }, cash: 10, upgrades: {} };

async function open(browser, seeded, dev, extra = {}) {
  const ctx = await browser.newContext(dev ? { ...devices[dev] } : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(([seeded, done1, extra]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    for (const c of seeded) localStorage.setItem('schoolies-mayhem:progress:' + c, JSON.stringify(done1));
    for (const k of Object.keys(extra)) localStorage.setItem('schoolies-mayhem:' + k, JSON.stringify(extra[k]));
  }, [seeded, done1, extra]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE); await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); await sleep(600);
  return { ctx, page, errors };
}
const roamIdx = page => page.evaluate(() => VH.UI.lastMenu.items.indexOf('FREE ROAM'));
const state = page => page.evaluate(() => ({ state: VH.Game.state, char: VH.Game.char, note: !!(VH.UI.roamNote && VH.UI.roamNote.t > 0) }));
async function chooseRoam(page) {
  const i = await roamIdx(page);
  for (let k = 0; k < i; k++) { await page.keyboard.press('ArrowDown'); await sleep(120); }
  await page.keyboard.press('Enter'); await sleep(500);
}

const browser = await chromium.launch();
{
  const { ctx, page, errors } = await open(browser, []);
  check('fresh profile: FREE ROAM is still listed on the title menu', (await roamIdx(page)) > 0);
  await chooseRoam(page); const s = await state(page);
  check('fresh profile: choosing FREE ROAM stays on the title and explains', s.state === 'title' && s.note, JSON.stringify(s));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/locked-title.png' });
  check('fresh profile: no console errors', !errors.length, errors[0]); await ctx.close();
}
{
  const { ctx, page } = await open(browser, ['schoolie', 'grump']);
  await chooseRoam(page); const s = await state(page);
  check('night 1 done as Jaz and Merv only: still locked', s.state === 'title' && s.note, JSON.stringify(s)); await ctx.close();
}
{
  const { ctx, page, errors } = await open(browser, ['schoolie', 'grump', 'cop']);
  const callout = await page.evaluate(() => !!(VH.UI.roamNote && VH.UI.roamNote.fresh));
  check('all three done: the one-off "FREE ROAM UNLOCKED" callout shows on the title', callout);
  await chooseRoam(page); const s = await state(page);
  check('all three done: FREE ROAM enters free roam', s.state !== 'title' && s.char === 'roam', JSON.stringify(s));
  check('all three done: no console errors', !errors.length, errors[0]); await ctx.close();
}
{ // the callout is shown once, not on every visit
  const { ctx, page } = await open(browser, ['schoolie', 'grump', 'cop'], null, { roamNoted: true });
  check('callout is one-off: not shown again once it has been noted', !(await page.evaluate(() => !!VH.UI.roamNote))); await ctx.close();
}
{ // a finger on a phone
  const { ctx, page } = await open(browser, ['schoolie'], 'iPhone 13');
  const r = await page.evaluate(() => { const m = VH.UI.lastMenu, r = m.rects[m.items.indexOf('FREE ROAM')], c = document.getElementById('game'), b = c.getBoundingClientRect(), k = b.width / c.width, I = VH.Input; return { x: b.left + (r.x * I.scale + I.offX + r.w * I.scale / 2) * k, y: b.top + (r.y * I.scale + I.offY + r.h * I.scale / 2) * k }; });
  await page.touchscreen.tap(r.x, r.y); await sleep(500); const s = await state(page);
  check('phone, locked: tapping FREE ROAM explains and stays on the title', s.state === 'title' && s.note, JSON.stringify(s));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/locked-title-phone.png' });
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
