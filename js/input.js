// Keyboard, mouse and touch input. Touch: floating joystick on the left, buttons on the right.
'use strict';
(function (VH) {
  const U = VH.U;
  // Presses are kept twice: the step store (edge, stepTaps) is cleared after every simulation step, the frame store
  // (fEdge, tapped, clicks) after every drawn frame. Code inside a step reads the first, menus and overlays the second,
  // so a press is seen once by each however the steps and frames fall (at 120 fps half the frames run no step).
  // Using a press (consume) clears it from both.
  const I = VH.Input = { keys: {}, edge: {}, fEdge: {}, pointers: new Map(), buttons: [], held: {}, tapped: [], stepTaps: [], clicks: [], inStep: false, touchMode: false, stick: { x: 0, y: 0, mag: 0, active: false, ox: 0, oy: 0 }, scale: 1 };
  const press = a => { I.edge[a] = true; I.fEdge[a] = true; };
  const MAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'action', KeyE: 'enter', Enter: 'confirm', NumpadEnter: 'confirm', KeyF: 'kick', Slash: 'help', KeyH: 'horn', KeyM: 'map', KeyP: 'pause', Escape: 'pause',
    KeyT: 'time', KeyN: 'mute', KeyJ: 'job', KeyO: 'job', KeyX: 'spikes', KeyB: 'backup', KeyL: 'light', Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Digit0: 'zoomReset', Numpad0: 'zoomReset', ShiftLeft: 'run', ShiftRight: 'run', Tab: 'map', Backspace: 'back', KeyQ: 'back', KeyC: 'camera',
  };
  I.init = function (canvas) {
    I.canvas = canvas;
    const poke = () => { I.lastInput = performance.now(); }; // (a still screen draws again at once)
    addEventListener('keydown', e => {
      poke(); if (e.target && e.target.tagName === 'INPUT') return; // typing in the map search box
      const a = MAP[e.code]; if (!a) return; if (['up', 'down', 'left', 'right', 'action', 'map'].includes(a) || e.code === 'Space') e.preventDefault();
      if (!I.keys[a]) press(a); I.keys[a] = true; if (a === 'confirm') { I.edge.enter = I.edge.enter || false; }
      I.touchMode = false; window.SFX && SFX.init();
    });
    addEventListener('keyup', e => { poke(); const a = MAP[e.code]; if (a) I.keys[a] = false; });
    addEventListener('blur', () => { I.keys = {}; });
    // mouse wheel zooms (one step per notch, throttled so a trackpad flick isn't ten steps)
    let wheelT = 0;
    canvas.addEventListener('wheel', e => { e.preventDefault(); poke(); const now = performance.now(); if (now - wheelT < 120 || Math.abs(e.deltaY) < 2) return; wheelT = now; press(e.deltaY < 0 ? 'zoomIn' : 'zoomOut'); }, { passive: false });
    const toArt = e => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) * (canvas.width / r.width) - (I.offX || 0)) / I.scale, ((e.clientY - r.top) * (canvas.height / r.height) - (I.offY || 0)) / I.scale]; };
    canvas.addEventListener('pointerdown', e => {
      // preventDefault stops the browser moving focus here, so take it back ourselves: inside the published
      // artifact's iframe the keyboard only works while this window has focus
      e.preventDefault(); poke(); window.focus(); window.SFX && SFX.init(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') I.touchMode = true;
      const [x, y] = toArt(e); const p = { x, y, sx: x, sy: y, btn: null, stick: false, t: performance.now() };
      // a touch that starts in the screen's edge zone (where the phone's own swipes live: the notification shade, the
      // home bar, back) never presses a button; it can still drive the stick
      const edge = e.pointerType === 'touch' && (e.clientX < I.EDGE || e.clientY < I.EDGE || innerWidth - e.clientX < I.EDGE || innerHeight - e.clientY < I.EDGE);
      const b = edge ? null : I.hit(x, y);
      // a second finger down (neither on a button) starts a pinch instead of moving, but only when both land together:
      // a thumb already steering keeps steering, and a near miss beside a button doesn't stop the car
      const free = [...I.pointers.values()].filter(q => !q.btn);
      if (!b && I.touchMode && free.length === 1 && !edge && (!free[0].stick || p.t - free[0].t < 250)) { const o = free[0]; if (o.stick) { I.stick.active = false; I.stick.mag = 0; o.stick = false; } I.pinch = { a: o, d0: Math.hypot(x - o.x, y - o.y) || 1 }; o.pinched = true; }
      if (b) { p.btn = b.id; I.held[b.id] = true; press(b.id); I.lastBtn = b.id; }
      else if (I.pinch && !I.pinch.b) { I.pinch.b = p; p.pinched = true; }
      else if (I.touchMode && I.stickZone && x < I.stickZone && !I.stick.active) { p.stick = true; I.stick.active = true; I.stick.ox = x; I.stick.oy = y; I.stick.x = I.stick.y = I.stick.mag = 0; }
      else if (I.touchMode) I.lastBtn = 'none'; // a finger on the open screen (closes the "..." fan)
      I.pointers.set(e.pointerId, p);
      if (!b) { I.tapped.push({ x, y }); I.stepTaps.push({ x, y }); } // a press on a thumb button is that button, not a tap on the screen
    });
    canvas.addEventListener('pointermove', e => {
      const p = I.pointers.get(e.pointerId); if (!p) return; poke(); const [x, y] = toArt(e); p.x = x; p.y = y;
      if (I.pinch && I.pinch.b && (p === I.pinch.a || p === I.pinch.b)) { const d = Math.hypot(I.pinch.a.x - I.pinch.b.x, I.pinch.a.y - I.pinch.b.y); if (d > I.pinch.d0 * 1.3) { press('zoomIn'); I.pinch.d0 = d; } else if (d < I.pinch.d0 / 1.3) { press('zoomOut'); I.pinch.d0 = d; } }
      if (p.stick) { const R = I.stickR || 30; let dx = x - I.stick.ox, dy = y - I.stick.oy; const d = Math.hypot(dx, dy); if (d > R) { I.stick.ox = x - dx / d * R; I.stick.oy = y - dy / d * R; dx = x - I.stick.ox; dy = y - I.stick.oy; } I.stick.x = dx / R; I.stick.y = dy / R; I.stick.mag = Math.min(1, Math.hypot(dx, dy) / R); }
    });
    const up = e => { const p = I.pointers.get(e.pointerId); if (!p) return; poke(); // a click or tap (not a drag) is kept for the full map
      if (!p.btn && !p.pinched && !p.stale && Math.hypot(p.x - p.sx, p.y - p.sy) < 6 && performance.now() - p.t < 450) I.clicks.push({ x: p.x, y: p.y });
      if (p.btn) I.held[p.btn] = false; if (p.stick) { I.stick.active = false; I.stick.mag = 0; I.stick.x = I.stick.y = 0; } if (I.pinch && (p === I.pinch.a || p === I.pinch.b)) I.pinch = null; I.pointers.delete(e.pointerId); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    if (matchMedia && matchMedia('(pointer: coarse)').matches) I.touchMode = true;
  };
  I.EDGE = 16; // CSS px: the edge zone
  // which button is under a point: round buttons by their circle (a touch generous), the rest by their box
  I.hit = (x, y) => { let best = null, bd = Infinity; for (const b of I.buttons) { const d = Math.hypot(x - b.x - b.w / 2, y - b.y - b.h / 2); if ((b.round ? d <= b.w / 2 * 1.12 : x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) && d < bd) { best = b; bd = d; } } return best; }; // (the nearest, where two overlap)
  I.down = a => !!(I.keys[a] || I.held[a]);
  I.lastInput = 0;
  I.anyDown = () => I.pointers.size > 0 || Object.values(I.keys).some(Boolean); // any key or finger down
  I.pressed = a => !!(I.inStep ? I.edge : I.fEdge)[a];
  I.consume = a => { const v = I.pressed(a); if (v) { I.edge[a] = false; I.fEdge[a] = false; } return v; };
  I.endStep = () => { I.edge = {}; I.stepTaps.length = 0; };
  I.endFrame = () => { I.fEdge = {}; I.tapped.length = 0; I.clicks.length = 0; };
  I.clearAll = () => { I.endStep(); I.endFrame(); };
  // a new screen: drop every press, and a finger already down (the one that opened it) doesn't tap it when it lifts
  I.newScreen = () => { I.clearAll(); I.buttons = []; I.stickZone = 0; for (const p of I.pointers.values()) p.stale = true; }; // (the HUD puts its buttons back)
  I.click = () => I.clicks[0] || null;
  I.setButtons = list => { I.buttons = list; };
  I.tap = () => (I.inStep ? I.stepTaps : I.tapped)[0] || null;
  // movement intent for walking: screen-relative vector
  I.moveVec = function () {
    let x = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0), y = (I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0);
    if (I.stick.active && I.stick.mag > 0.15) { x = I.stick.x; y = I.stick.y; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } return [x, y];
  };
  // driving intent given the vehicle heading
  I.drive = function (ang, speed) {
    if (I.stick.active && I.stick.mag > 0.15) {
      const want = Math.atan2(I.stick.y, I.stick.x); const da = U.angDiff(ang, want);
      if (Math.abs(da) > 2.2 && speed < 3) return { throttle: 0, brake: I.stick.mag, steer: U.clamp(-da * 1.5, -1, 1), hb: I.down('action') };
      return { throttle: I.stick.mag * (Math.abs(da) > 1.6 ? 0.4 : 1), brake: Math.abs(da) > 2.2 ? 0.6 : 0, steer: U.clamp(da * 1.8, -1, 1), hb: I.down('action') };
    }
    return { throttle: I.down('up') ? 1 : 0, brake: I.down('down') ? 1 : 0, steer: (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0), hb: I.down('action') };
  };
})(window.VH);
