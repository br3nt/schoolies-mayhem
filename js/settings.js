// The player's settings: graphics quality, frame rate, battery saver, music volume, the FPS counter and screen shake
// (sound on/off keeps its own save, 'muted'). Saved with U.store under 'settings'. The SETTINGS screen is in ui.js.
'use strict';
(function (VH) {
  const U = VH.U;
  // what each quality level draws. light: the light map's resolution (soft light, so half looks the same);
  // bloom: the little glows at the bulbs; fog: drifting fog layers; parts: the most particles at once, thin: the
  // share of cosmetic ones (smoke, chips, sparks) skipped; glints: moonlight on the sea and the surf's twinkles;
  // shadows: the shadow under a flying chip
  const QUALITY = {
    high: { light: 1, bloom: true, fog: 2, parts: 900, thin: 0, glints: true, shadows: true },
    medium: { light: 0.5, bloom: true, fog: 2, parts: 500, thin: 0, glints: true, shadows: true },
    low: { light: 0.5, bloom: false, fog: 1, parts: 220, thin: 0.4, glints: false, shadows: false },
  };
  const LEVELS = ['low', 'medium', 'high'];
  const DEF = { gfx: 'auto', fps: 60, battery: null, music: 1, showFps: false, shake: true };
  const saved = U.store.get('settings', {}) || {};
  // only values this version knows (an old or hand-edited save falls back to the default)
  const ok = { gfx: v => ['auto', 'low', 'medium', 'high'].includes(v), fps: v => [30, 60, 0].includes(v), battery: v => v === null || typeof v === 'boolean', music: v => typeof v === 'number' && v >= 0 && v <= 1, showFps: v => typeof v === 'boolean', shake: v => typeof v === 'boolean' };
  const S = VH.Settings = Object.assign({}, DEF);
  for (const k of Object.keys(DEF)) if (k in saved && ok[k](saved[k])) S[k] = saved[k];
  S.QUALITY = QUALITY;
  S.version = 0; // goes up on every change (main.js redraws the world under a menu when it does)
  S.save = () => { S.version++; U.store.set('settings', { gfx: S.gfx, fps: S.fps, battery: S.battery, music: S.music, showFps: S.showFps, shake: S.shake }); };

  // Battery saver: on or off when the player says; until then, on while the device is unplugged and low
  S.batteryLow = false;
  try {
    if (navigator.getBattery) navigator.getBattery().then(b => { const f = () => { const low = !b.charging && b.level <= 0.2; if (low !== S.batteryLow) { S.batteryLow = low; S.version++; } }; f(); b.addEventListener('chargingchange', f); b.addEventListener('levelchange', f); }).catch(() => {});
  } catch (e) { /* no Battery API */ }
  S.saver = () => S.battery == null ? S.batteryLow : !!S.battery;

  // AUTO: a level from the device (a few cores or little memory: lower), then one step down at a time if frames keep
  // running long while playing. It never steps back up by itself in a session.
  function guess() {
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
    if (mem <= 1) return 'low';
    if (cores <= 4 || mem <= 2 || phone) return 'medium'; // (some browsers report few cores for privacy, so cores alone never mean LOW)
    return 'high';
  }
  S.autoLevel = guess();
  S.level = () => S.saver() ? 'low' : S.gfx === 'auto' ? S.autoLevel : S.gfx;
  const SAVER = Object.assign({}, QUALITY.low, { light: 0.25 });
  S.q = () => S.saver() ? SAVER : QUALITY[S.level()];
  S.fpsCap = () => S.saver() ? 30 : S.fps; // 0: as fast as the screen refreshes

  // the watch: 4-second windows while playing; two slow windows in a row (frames often late, or the frame's own work
  // taking most of its time) step AUTO down a level. iv is the beat the screen can give (a browser that holds every page
  // to 30 Hz isn't a slow device)
  let win = null, strikes = 0;
  S.resumed = () => { win = null; }; // (after a hidden tab, a pause: start the window again)
  S.sample = function (now, work, iv) {
    if (S.gfx !== 'auto' || S.saver() || S.autoLevel === 'low') { win = null; return; }
    if (!win) { win = { t0: now, last: now, n: 0, late: 0, work: 0 }; return; }
    const gap = now - win.last; win.last = now; if (gap > 400) { win = null; return; } // a hitch from something else (a menu, a tab switch)
    win.n++; win.work += work; if (gap > Math.max(iv, 1000 / 60) * 1.6) win.late++;
    if (now - win.t0 < 4000) return;
    const slow = win.late / win.n > 0.3 || win.work / win.n > Math.max(iv, 1000 / 60) * 0.75;
    strikes = slow ? strikes + 1 : 0; win = null;
    if (strikes >= 2) { strikes = 0; S.autoLevel = LEVELS[Math.max(0, LEVELS.indexOf(S.autoLevel) - 1)]; S.backedOff = (S.backedOff || 0) + 1; S.version++; }
  };

  // music volume (sound on/off is the 'muted' save, as before)
  S.applyAudio = () => { if (window.SFX && SFX.setMusicVolume) SFX.setMusicVolume(S.music); };
  S.applyAudio();
})(window.VH);
