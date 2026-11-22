// HUD, menus, minimap, full map and touch buttons, all drawn in the pixel back-buffer.
'use strict';
(function (VH) {
  const U = VH.U, W = VH.World, R = VH.MapRender, SP = VH.Sprites, I = VH.Input, FX = VH.FX;
  const UI = VH.UI = { menuIdx: 0, selIdx: 0 };
  const G = () => VH.Game; const M = () => VH.Missions;
  const sfx = (n, o) => window.SFX && SFX.play(n, o);
  const C = { ink: '#120c24', panel: 'rgba(18,12,36,0.86)', edge: '#3c2f6b', hi: '#ffd23a', pink: '#ff4fa0', teal: '#38e0c8', white: '#f4f0ff', dim: '#a99fc8', red: '#ff6a5a', green: '#9be15d' };
  UI.C = C;
  function panel(ctx, x, y, w, h, opts = {}) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (U.layoutLog && ctx.canvas.__ui) { const m = ctx.getTransform(); U.layoutLog.panels.push({ x: x + m.e, y: y + m.f, w, h }); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 2, y + 2, w, h);
    ctx.fillStyle = opts.fill || C.panel; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = opts.edge || C.edge; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    if (opts.accent) { ctx.fillStyle = opts.accent; ctx.fillRect(x, y, w, 2); }
  }
  UI.panel = panel;
  // a full-screen backdrop (a dim, a gradient, letterbox bars): painted by main.js on the whole canvas under the UI
  // layer, so it reaches the screen edges even where the HUD is inset (a notch, a framed build's margin). A colour, or
  // fn(ctx, W, H, y) painting in canvas pixels, where y(n) turns a UI-layer y into a canvas y.
  UI.backdrops = [];
  const backdrop = (ctx, fill) => { if (ctx.canvas.__ui) UI.backdrops.push(fill); else if (typeof fill === 'string') { ctx.fillStyle = fill; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); } else fill(ctx, ctx.canvas.width, ctx.canvas.height, n => n); };
  UI.backdrop = backdrop;
  const T = (ctx, s, x, y, o) => U.text(ctx, s, x, y, o);
  // cut text to fit a width (ending in a full stop when it had to be cut)
  const fit = (s, maxW, sc) => { s = String(s); if (U.textWidth(s, sc) <= maxW) return s; const n = Math.max(1, Math.floor((maxW + sc) / (6 * sc)) - 1); return s.slice(0, n).replace(/[ ·:,]+$/, '') + '.'; };
  UI.fit = fit;
  // short phrases joined two spaces apart, as many to a line as fit in n characters
  const pack = (segs, n) => { const out = []; for (const sg of segs) { const last = out[out.length - 1]; if (last && (last + '  ' + sg).length <= n) out[out.length - 1] = last + '  ' + sg; else out.push(sg); } return out; };
  // slogans (Brent, 22 Nov 2026): the title-screen tagline and the three-sides premise over the character select
  const TAGLINE = "SCHOOLIES WEEK IN VICTOR HARBOR. NOBODY'S GETTING ANY SLEEP.";
  const PREMISE = 'THE SCHOOLIES HAVE ARRIVED READY TO PARTY. THE LOCALS ARE FRUSTRATED. THE POLICE ARE ON HIGH ALERT.';
  // one line if it sits comfortably (under 70% of the width), otherwise a line per sentence, and any sentence
  // still too wide is word-wrapped
  const fitLines = (str, maxW, sc) => {
    if (U.textWidth(str, sc) <= maxW * 0.7) return [str];
    const out = [];
    for (const sent of str.match(/[^.!?]+[.!?]?/g).map(x => x.trim()).filter(Boolean)) {
      if (U.textWidth(sent, sc) <= maxW) out.push(sent); else out.push(...U.wrap(sent, Math.max(8, Math.floor(maxW / (6 * sc)))));
    }
    return out;
  };

  // curtain icon for the gossip meter
  function curtain(ctx, x, y, on, flash, s) {
    const w = 9 * s, h = 9 * s;
    ctx.fillStyle = on ? (flash ? '#ff4fa0' : '#ffd23a') : '#3c2f6b'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = on ? '#2a1a3a' : '#1c1530'; ctx.fillRect(x + s, y + s, w - 2 * s, h - 2 * s);
    if (on) { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x + 3 * s, y + 2 * s, 3 * s, 5 * s); ctx.fillStyle = flash ? '#ff9ccc' : '#e05a3a'; ctx.fillRect(x + s, y + s, 2 * s, h - 2 * s); ctx.fillRect(x + 6 * s, y + s, 2 * s, h - 2 * s); ctx.fillStyle = '#222'; ctx.fillRect(x + 4 * s, y + 3 * s, s, s); }
    else { ctx.fillStyle = '#4a3a70'; ctx.fillRect(x + s, y + s, 3 * s, h - 2 * s); ctx.fillRect(x + 5 * s, y + s, 3 * s, h - 2 * s); }
  }

  // ---------- controls: one table drives the "?" overlay, the controls card and the hints ----------
  const K = (key, touch) => () => (I.touchMode ? touch : key);
  const CONTROLS = {
    foot: { title: 'ON FOOT', get rows() { return [...(I.touchMode ? [['DRAG', G().walkMode === 'screen' ? 'WALK: DRAG ON THE LEFT HALF THE WAY YOU WANT TO GO; FURTHER TO RUN' : 'WALK: DRAG ON THE LEFT HALF; YOU TURN AND WALK TOWARD YOUR FINGER, FURTHER TO RUN']] : G().walkMode === 'screen' ? [['WASD / ARROWS', 'WALK (SCREEN DIRECTION)']] : [['W / UP', 'WALK FORWARD'], ['S / DOWN', 'STEP BACK'], ['A D / LEFT RIGHT', 'TURN']]), ...this.rest]; }, rest: [[K('SHIFT', 'BOOST'), 'SPRINT'], [K('E', 'GET IN'), 'GET IN / BORROW (WALK UP TO IT)'], [K('F', 'KICK'), 'KICK BINS, CONES, BALLS'], [K('SPACE', 'ACT'), 'USE, RING DOORBELLS, STAND BINS UP'], [K('H', 'SHOUT'), 'SHOUT'], ['DOORS', K('WALK INTO A SHOP DOOR TO GO IN; E AT THE COUNTER TO CHAT', 'WALK INTO A SHOP DOOR TO GO IN; ACT AT THE COUNTER TO CHAT')], [K('HOLD SPACE', 'HOLD'), K('TACKLED? KEEP THE MARK IN THE GREEN; ARROW (OR TAP) THE WAY IT SAYS WHEN IT FLASHES SLIP', 'TACKLED? HOLD THE HOLD BUTTON TO KEEP THE MARK IN THE GREEN; TAP THE SIDE IT SAYS WHEN IT FLASHES SLIP')]] },
    car: { title: 'DRIVING AND RIDING', get rows() { return [...(I.touchMode ? [['DRAG', 'DRIVE: DRAG ON THE LEFT HALF; THE VEHICLE STEERS AND SPEEDS TOWARD YOUR FINGER'], ['DRAG BEHIND', 'BRAKE, THEN REVERSE']] : [['W / UP', 'ACCELERATE'], ['S / DOWN', 'BRAKE, REVERSE'], ['A D / LEFT RIGHT', 'STEER']]), ...this.rest]; }, rest: [[K('SPACE', 'SKID'), 'HANDBRAKE (DRIFT); BUNNY-HOP ON A BIKE'], [K('H', 'HORN'), 'HORN'], [K('SHIFT', 'BOOST'), 'TURBO GOPHER'], [K('E', 'GET OUT'), 'GET OUT']] },
    rail: { title: 'TRAM AND TRAIN', get rows() { return [...(I.touchMode ? [['DRAG', 'DRAG THE WAY IT FACES TO GO, THE OTHER WAY TO BRAKE AND BACK UP']] : [['W / UP', 'FORWARD'], ['S / DOWN', 'BRAKE, BACK UP']]), ...this.rest]; }, rest: [[K('SHIFT', 'BOOST'), 'GIDDY UP / MORE STEAM'], [K('H', 'HORN'), 'BELL / WHISTLE'], [K('E', 'GET OUT'), 'GET OFF (WHEN STOPPED)']] },
    heli: { title: 'HELICOPTER', get rows() { return [...(I.touchMode ? [['DRAG', 'FLY: DRAG ON THE LEFT HALF; THE CHOPPER TURNS AND FLIES TOWARD YOUR FINGER']] : [['W / S', 'FLY FORWARD / BACK'], ['A D / LEFT RIGHT', 'TURN']]), ...this.rest]; }, rest: [[K('SHIFT', 'UP'), 'CLIMB'], [K('SPACE', 'DOWN'), 'DESCEND AND LAND (HELIPADS ARE GENTLEST)'], [K('E', 'GET OUT'), 'GET OUT (ONCE LANDED)']] },
    kev: { title: 'CONSTABLE KEV', rows: [[K('H', 'SIREN'), 'SIREN (IN A POLICE CAR, OR ANY CAR WITH THE ROOF LIGHT)'], [K('H', 'MEGA'), 'ON FOOT: MEGAPHONE, RUNNERS WITHIN 30M FREEZE FOR 2.5 S; NEAR A GOPHER, CALL IT OVER'], [K('E', 'ACT'), 'NEXT TO A FROZEN OR CORNERED RUNNER: CUFF THEM'], ['TACKLE', K('RUN INTO A RUNNER: A TACKLE, THEN HOLD SPACE TO KEEP HOLD', 'RUN INTO A RUNNER: A TACKLE, THEN THE HOLD BUTTON TO KEEP HOLD')], [K('L', 'LIGHT'), 'COMMANDEERED CAR: MAGNETIC FLASHING LIGHT ON THE ROOF'], [K('X', 'SPIKES'), 'DROP A SPIKE STRIP BEHIND YOU'], [K('B', 'BACKUP'), 'CALL BACKUP; NO WORKING COP CAR: A SPARE IS DROPPED OFF'], ['RAM', 'NUDGE A REAR CORNER TO SPIN THEM (PIT); CARS TAKE SEVERAL SOLID HITS']] },
    evade: { title: 'LOSING THE POLICE', rows: [['LEVELS', 'ONE CAR PER CURTAIN (FOUR AT MOST); A ROADBLOCK AT FOUR; THE CHOPPER ONLY AT FIVE, AFTER A LONG CHASE'], ['COOLING', 'THE LINE UNDER THE CURTAINS SAYS WHAT\'S COOLING THINGS RIGHT NOW; THE THIN BAR DRAINS AS IT DOES'], ['SIGHT', 'BREAK LINE OF SIGHT AND STAY OUT OF VIEW TILL THE HEAT COOLS'], ['HIDE', 'BUSHES, CAR PARKS, THE GOLF COURSE, THE CAR WASH, UNDER THE JETTY (GOSSIP COOLS FASTER)'], ['SWAP', 'CHANGE CARS (OR GET OUT) WHERE THEY CAN\'T SEE YOU'], ['RESPRAY', 'RESPRAY SHOPS (SPRAY-CAN ICON ON THE MAP, $25) WIPE YOUR CAR\'S DESCRIPTION'], ['CLOTHES', 'A NEW SHIRT, HAT OR SUNNIES OUT OF SIGHT (CLOTHES SHOP, OP SHOP) DOES THE SAME FOR YOU'], ['ROADBLOCK', 'THERE\'S ALWAYS A GAP, OR THE FOOTPATH'], ['OFFICERS', 'DRIVE OFF, SHOVE THROUGH (THEY JUMP OUT OF THE WAY) OR OUTRUN THEM. IF THEY CATCH YOU, THEY TACKLE AND CUFF'], ['LOCK-UP', 'LET OUT AT THE GATE: THE GOSSIP IS WIPED, NOBODY WATCHES THE GATE FOR A WHILE, AND YOUR BIKE\'S THERE'], ['MERV', 'ON THE GOPHER: ONE CAR TAILS YOU WITH A MEGAPHONE LECTURE; STOP AND THEY BOOK YOU']] },
    any: { title: 'ANY TIME', rows: [['CLOCK', 'THE TIME OF NIGHT (BY THE MOON) RUNS FAST: ONE GAME MINUTE A SECOND. FINISH BEFORE SUNRISE. TIMED JOBS HAVE THEIR OWN BOXED TIME LEFT'], [K('WHEEL / + -', 'PINCH'), K('ZOOM IN AND OUT (0 RESETS)', 'ZOOM IN AND OUT')], [K('M / TAB', 'MAP'), 'MAP'], [K('J', 'JOB'), 'CURRENT JOB BRIEF'], [K('?', '?'), 'THIS HELP'], [K('P / ESC', 'PAUSE'), 'PAUSE'], [K('N', 'PAUSE MENU'), 'MUTE']] },
  };
  CONTROLS.icons = { title: 'MAP ICONS', rows: [['YELLOW', 'JOB TARGETS (EACH WITH ITS OWN ARROW)'], ['LIGHT BLUE', 'YOUR LAST VEHICLE; KEV: THE COP CAR'], ['WHITE PIN', K('YOUR WAYPOINT (CLICK OR TAP THE MAP; FIND A STREET WITH ENTER)', 'YOUR WAYPOINT (TAP THE MAP; TAP THE SEARCH BOX TO FIND A STREET)')], ['ORANGE', 'KEV: A PRISONER'], ['SPRAY CAN', 'RESPRAY SHOP: $25 FOR A NEW COLOUR'], ['TYRE', 'TYRE PLACE: A FLAT FIXED FOR $10'], ['TEAL SQUARE', 'A SHOP YOU CAN WALK INTO'], ['M R G B T S H', 'MAYHEM MINUTE, RAMP, RACES, HELIPAD']] };
  UI.CONTROLS = CONTROLS;
  // the jobs' own help rows name keys; on a touch screen they name the buttons instead
  const TOUCH_KEY = { 'SPACE': 'ACT', 'HOLD SPACE': 'HOLD', 'H IN A POLICE CAR': 'SIREN', 'H ON FOOT': 'MEGA', 'H (MEGAPHONE)': 'MEGA', 'L': 'LIGHT', 'B': 'SPARE', 'E / ACT': 'ACT', 'E ALONGSIDE': 'GET IN ALONGSIDE', 'S': 'DRAG BEHIND' };
  const touchText = str => String(str).replace(/\bHOLD SPACE\b/g, 'HOLD THE HOLD BUTTON').replace(/\bARROW (\(OR TAP\) )?THE WAY IT SAYS\b/g, 'TAP THE SIDE IT SAYS').replace(/\bTHEN H FOR THE SIREN\b/g, 'THEN SIREN').replace(/\bSPACE\b/g, 'ACT').replace(/\bSHIFT\b/g, 'BOOST');
  UI.touchText = touchText;
  const keyText = k => typeof k === 'function' ? k() : k;
  UI.context = function () {
    const g = G(), pl = g.player; if (!pl) return 'foot';
    if (pl.onFoot) return 'foot'; if (pl.vehicle && pl.vehicle.rail) return 'rail'; if (pl.vehicle && pl.vehicle.def.heli) return 'heli'; return 'car';
  };
  const keyCol = ts => 17 * 6 * ts + 6 * ts;
  function controlsTable(ctx, ts, sections, x, y, w) {
    let yy = y; const kw = keyCol(ts);
    for (const sc of sections) {
      T(ctx, sc.title, x, yy, { color: C.hi, scale: ts }); yy += 11 * ts;
      for (const [k, what] of sc.rows) {
        const lines = U.wrap(keyText(what), Math.max(10, Math.floor((w - kw) / (6 * ts))));
        T(ctx, keyText(k), x, yy, { color: C.teal, scale: ts });
        lines.forEach((l, i) => T(ctx, l, x + kw, yy + i * 9 * ts, { color: C.white, scale: ts }));
        yy += lines.length * 9 * ts + 2 * ts;
      }
      yy += 5 * ts;
    }
    return yy - y;
  }
  UI.measureControls = (ts, sections, w) => { let h = 0; const kw = keyCol(ts); for (const sc of sections) { h += 16 * ts; for (const r of sc.rows) h += U.wrap(keyText(r[1]), Math.max(10, Math.floor((w - kw) / (6 * ts)))).length * 9 * ts + 2 * ts; } return h; };
  // the "?" overlay: only the keys that matter right now
  UI.helpOverlay = function (ctx, ts) {
    const g = G(), w = ctx.canvas.width, h = ctx.canvas.height; const cx = UI.context();
    const secs = [CONTROLS[cx]]; if (g.char === 'cop') secs.push(CONTROLS.kev); else secs.push(CONTROLS.evade); secs.push(CONTROLS.any, CONTROLS.icons);
    const job = M().job; if (job && job.started && job.help) secs.unshift({ title: 'THIS JOB: ' + job.title, rows: job.help.map(([k, d]) => [K(k, TOUCH_KEY[k] || touchText(k)), K(d, touchText(d))]) }); // the job's own steps first
    const pw = Math.min(w - 16 * ts, 260 * ts); const full = UI.measureControls(ts, secs, pw - 16 * ts); const ph = Math.min(h - 20 * ts, full + 26 * ts);
    const x = Math.round(w / 2 - pw / 2), y = Math.round(Math.max(8 * ts, h / 2 - ph / 2));
    // on a touch screen a drag scrolls it when it doesn't fit, and a tap (a short, still touch) closes it
    const maxS = Math.max(0, full + 26 * ts - ph); UI.helpOvScroll = U.clamp((UI.helpOvScroll || 0) - dragY(), 0, maxS);
    panel(ctx, x, y, pw, ph, { accent: C.teal, fill: 'rgba(18,12,36,0.93)' });
    T(ctx, 'CONTROLS', x + 8 * ts, y + 6 * ts, { color: C.white, scale: ts });
    T(ctx, I.touchMode ? (maxS ? 'DRAG: SCROLL  TAP: CLOSE' : 'TAP TO CLOSE') : '? OR ESC: CLOSE', x + pw - 8 * ts, y + 6 * ts, { color: C.dim, scale: ts, align: 'right' });
    ctx.save(); ctx.beginPath(); ctx.rect(x, y + 17 * ts, pw, ph - 17 * ts - 2); ctx.clip();
    controlsTable(ctx, ts, secs, x + 8 * ts, y + 20 * ts - Math.round(UI.helpOvScroll), pw - 16 * ts); ctx.restore();
    if (I.touchMode && I.click()) { g.helpOpen = false; sfx('click'); }
  };
  // how far the fingers on the screen (not on a button, not pinching) moved up or down since the last frame
  function dragY() { let d = 0; for (const q of I.pointers.values()) { if (q.btn || q.pinched || q.stale) continue; if (q.dy0 != null) d += q.y - q.dy0; q.dy0 = q.y; } return d; }

  // ---------- first-time hints: a short sequence that teaches the basics, once per browser ----------
  const HINTS = [
    { txt: () => I.touchMode ? 'DRAG ON THE LEFT HALF TO MOVE' : G().walkMode === 'screen' ? 'WASD OR ARROW KEYS: MOVE' : 'W: WALK  S: BACK  A/D: TURN (LIKE A CAR)', done: g => g.hintMoved > 8, foot: true },
    { txt: () => I.touchMode ? 'HOLD BOOST TO SPRINT' : 'HOLD SHIFT TO SPRINT', done: g => g.hintSprint > 0.8, foot: true },
    { txt: () => I.touchMode ? 'WALK UP TO A CAR, TAP GET IN TO BORROW IT' : 'WALK UP TO A CAR AND PRESS E TO BORROW IT', done: g => !g.player.onFoot, foot: true },
    { txt: () => I.touchMode ? 'SKID: HANDBRAKE  HORN: HORN  GET OUT: GET OUT' : 'SPACE: HANDBRAKE   H: HORN   E: GET OUT', done: g => g.hintT > 9 },
    { txt: () => I.touchMode ? 'MAP, JOB AND ? ARE TOP RIGHT' : 'M: MAP   J: JOB BRIEF   ?: CONTROLS', done: g => g.hintT > 9 },
  ];
  UI.hints = function (ctx, ts, bottomY, cx = ctx.canvas.width / 2, W0 = ctx.canvas.width) {
    const g = G();
    const tipBox = (str, accent, fill, icon) => {
      const room = Math.min(W0 - 16 * ts, 330 * ts) - 33 * ts - (icon ? 10 * ts : 0); const lines = U.wrap(str, Math.max(8, Math.floor(room / (6 * ts))));
      const bw = Math.max(...lines.map(l => U.textWidth(l, ts))) + 33 * ts + (icon ? 10 * ts : 0), bh = lines.length * 9 * ts + 7 * ts; const x = Math.round(cx - bw / 2), y = bottomY - bh - 4 * ts;
      if (UI.hudRects) UI.hudRects.tip = { x, y, w: bw, h: bh };
      UI.tipTop = y; panel(ctx, x, y, bw, bh, { accent, fill }); T(ctx, 'TIP', x + 5 * ts, y + 4 * ts, { color: accent, scale: ts }); lines.forEach((l, i) => T(ctx, l, x + 27 * ts, y + 4 * ts + i * 9 * ts, { color: C.white, scale: ts }));
      if (icon === 'can') VH.Shops.drawCan(ctx, x + bw - 7 * ts, y + bh / 2, ts);
    };
    if (g.tipNow && g.tipNow.t > 0) { g.tipNow.t -= g.frameDt || 0.016; tipBox(g.tipNow.str, C.hi, 'rgba(48,40,18,0.92)', g.tipNow.icon); return; }
    if (g.hintIdx == null || g.hintIdx >= HINTS.length) return;
    const hnt = HINTS[g.hintIdx];
    if (hnt.foot && !g.player.onFoot) { g.hintIdx++; g.hintT = 0; return; }
    g.hintT = (g.hintT || 0) + (g.frameDt || 0.016);
    if (hnt.done(g) || g.hintT > 14) { g.hintIdx++; g.hintT = 0; if (g.hintIdx >= HINTS.length) U.store.set('hints', true); return; }
    tipBox(hnt.txt(), C.teal, 'rgba(18,40,48,0.9)');
  };

  UI.hud = function (ctx, ts) {
    const g = G(), pl = g.player, w = ctx.canvas.width, h = ctx.canvas.height; const c = g.CHARS[g.char] || g.CHARS.roam;
    const pad = 4 * ts, ip = 5 * ts; // the screen margin, and the padding inside every panel
    const narrow = w < 380 * ts; UI.narrow = narrow;
    const PO = VH.Police; const lvl = g.meter; const flash = PO.units.length && PO.seenT < 0.5 && Math.floor(g.t * 4) % 2;
    // --- top-left: who, cash, meter; as wide as it needs (within reason), so the name and the cash never meet
    const kc = g.char === 'cop' ? PO.kevCar() : null; const nPris = VH.Escort.list.length;
    const kevLines = g.char === 'cop' ? [kc ? `BACKUP (B): ${PO.backupT > 0 ? Math.ceil(PO.backupT) + 'S' : 'READY'}` : PO.spare ? 'SPARE CAR: ON ITS WAY' : `SPARE CAR (B) · ${Math.max(0, Math.ceil(PO.recoverT || 0))}S`, `SPIKES (X): ${PO.spikesLeft} LEFT`, ...(nPris ? [`PRISONERS: ${nPris}` + (VH.Escort.paddy ? ' · WAGON COMING' : '')] : [])] : [];
    const cashS = '$' + Math.round(g.cash), cashW = U.textWidth(cashS, ts * 2);
    const maxPw = narrow ? Math.max(120 * ts, w - 92 * ts - 3 * pad) : 190 * ts;
    let name = c.name; if (U.textWidth(name, ts) + cashW + 2 * ip + 6 * ts > maxPw) name = name.replace('CONSTABLE ', '');
    const pw = Math.round(Math.min(maxPw, Math.max(128 * ts, U.textWidth(name, ts) + cashW + 2 * ip + 6 * ts, ...kevLines.map(l => U.textWidth(l, ts) + 2 * ip))));
    UI.leftW = pw;
    panel(ctx, pad, pad, pw, 40 * ts, { accent: C.pink });
    T(ctx, fit(name, pw - cashW - 2 * ip - 6 * ts, ts), pad + ip, pad + 5 * ts, { color: C.dim, scale: ts });
    T(ctx, cashS, pad + pw - ip, pad + 4 * ts, { color: C.green, scale: ts * 2, align: 'right' });
    for (let i = 0; i < 5; i++) curtain(ctx, pad + 5 * ts + i * 11 * ts, pad + 19 * ts, lvl >= i + 1 || (lvl > i && lvl - i > 0.5 && Math.floor(g.t * 3) % 2), flash, ts);
    { const bw = 54 * ts, bx = pad + 5 * ts, by = pad + 28 * ts; const cooling = PO.decay && PO.decay() > 0 && lvl > 0; ctx.fillStyle = 'rgba(10,8,25,0.8)'; ctx.fillRect(bx, by, bw, ts); ctx.fillStyle = cooling ? C.green : C.hi; ctx.fillRect(bx, by, Math.round(bw * Math.min(1, lvl / 5)), ts); } // the level, draining when it cools
    const lab = (g.char === 'cop' ? g.COP_LABELS : g.METER_LABELS)[Math.min(5, Math.floor(lvl))];
    T(ctx, c.meter, pad + 62 * ts, pad + 20 * ts, { color: g.char === 'cop' ? C.teal : C.hi, scale: ts });
    T(ctx, fit(lab, pw - 2 * ip, ts), pad + ip, pad + 31 * ts, { color: C.dim, scale: ts });
    // --- top-centre: night + clock + job timer
    const hh = Math.floor(g.hour), mm = Math.floor((g.hour - hh) * 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    // the time of night (a moon by it; one game minute a second), kept apart from the job's boxed countdown
    const nightTxt = g.char === 'roam' ? 'FREE ROAM · TIME OF DAY' : `NIGHT ${g.night} · ${M().dayName(g.night)}`;
    const tw = Math.max(U.textWidth(nightTxt, ts), U.textWidth(clock, ts * 2) + 14 * ts) + 2 * ip + 2 * ts;
    const short = h < 260 * ts; UI.short = short;
    const mmS = short && I.touchMode ? 64 * ts : 92 * ts; UI.mmS = mmS;
    const TL = I.touchMode && !VH.Tackle.on ? UI.touchLayout(w, h, ts) : null; // where the thumb buttons will go
    const rightEdge = w - pad - 96 * ts - (TL ? TL.blockW : 0); // the minimap (and on a phone on its side, MAP, PAUSE, JOB and ?)
    let cxp = narrow ? pad + tw / 2 : w / 2, cyp = narrow ? pad + 44 * ts : pad;
    if (!narrow && (cxp - tw / 2 < pad + pw + 4 * ts || cxp + tw / 2 > rightEdge)) { cxp = Math.max(pad + pw + 4 * ts + tw / 2, Math.min(cxp, rightEdge - tw / 2)); if (cxp + tw / 2 > rightEdge) { cxp = pad + tw / 2; cyp = pad + 44 * ts; } } // never over the left panel or the minimap
    panel(ctx, cxp - tw / 2, cyp, tw, 28 * ts, { accent: C.teal });
    T(ctx, nightTxt, cxp, cyp + 4 * ts, { align: 'center', color: C.dim, scale: ts });
    T(ctx, clock, cxp + 7 * ts, cyp + 13 * ts, { align: 'center', color: C.white, scale: ts * 2 });
    const mx0 = Math.round(cxp + 7 * ts - U.textWidth(clock, ts * 2) / 2 - 13 * ts), my0 = cyp + 14 * ts; // a crescent moon
    ctx.fillStyle = '#f2e6a0'; ctx.beginPath(); ctx.arc(mx0 + 5 * ts, my0 + 5 * ts, 5 * ts, 0, U.TAU); ctx.fill(); ctx.fillStyle = '#1a1230'; ctx.beginPath(); ctx.arc(mx0 + 7.5 * ts, my0 + 3.5 * ts, 4.4 * ts, 0, U.TAU); ctx.fill();

    // --- police status under the money panel
    let py = pad + 44 * ts; if (narrow) py = pad + 76 * ts;
    const near = g.char !== 'cop' && !PO.units.length && (PO.patrols.some(v => Math.hypot(v.x - pl.x, v.y - pl.y) < 90) || g.meter >= 0.05 || PO.inGrace());
    // the line (or two) under the police status says what's cooling things down right now
    const nChars = Math.max(8, Math.floor((pw - 2 * ip) / (6 * ts))); let polH = 0;
    if (near) {
      const ch = PO.coolHint && PO.coolHint(); const grace = PO.inGrace();
      const txt = ch ? ch.txt : PO.patrols.some(v => Math.hypot(v.x - pl.x, v.y - pl.y) < 90) ? 'PATROL CAR NEARBY. BEHAVE...' : 'MORE GOSSIP AND THEY COME';
      const lines = U.wrap(txt, nChars).slice(0, 2); polH = (13 + lines.length * 9) * ts;
      panel(ctx, pad, py, pw, polH, { accent: grace ? C.green : C.hi });
      T(ctx, grace ? 'LET OUT AT THE GATE' : 'POLICE INTERESTED', pad + ip, py + 4 * ts, { color: grace ? C.green : C.hi, scale: ts });
      lines.forEach((l, i) => T(ctx, fit(l, pw - 2 * ip, ts), pad + ip, py + 13 * ts + i * 9 * ts, { color: ch ? ch.col : C.dim, scale: ts }));
    } else if (g.char !== 'cop' && (PO.units.length || PO.heli || PO.boat || PO.blocks.length)) {
      const bits = [PO.units.length + (PO.units.length === 1 ? ' CAR' : ' CARS')]; if (PO.blocks.length) bits.push('BLOCK'); if (PO.boat) bits.push('BOAT'); if (PO.heli) bits.push('CHOPPER');
      const seen = PO.seenT < 0.6, ch = PO.coolHint && PO.coolHint(); const st = ch ? ch.txt : seen ? 'THEY CAN SEE YOU!' : PO.hidden ? 'HIDING. LIE LOW...' : 'SEARCHING. STAY OUT OF SIGHT';
      const col = seen && (!ch || /SEE YOU/.test(ch.txt)) ? (Math.floor(g.t * 5) % 2 ? C.red : '#ffb0a8') : ch ? ch.col : PO.hidden ? C.green : C.hi;
      const lines = U.wrap(st, nChars).slice(0, 2); polH = (22 + lines.length * 9) * ts;
      panel(ctx, pad, py, pw, polH, { accent: seen ? C.red : '#3070ff' });
      T(ctx, 'POLICE CHASING', pad + ip, py + 4 * ts, { color: C.white, scale: ts }); T(ctx, fit(bits.join(' · '), pw - 2 * ip, ts), pad + ip, py + 13 * ts, { color: C.dim, scale: ts });
      lines.forEach((l, i) => T(ctx, fit(l, pw - 2 * ip, ts), pad + ip, py + 22 * ts + i * 9 * ts, { color: col, scale: ts }));
    } else if (g.char === 'cop') {
      panel(ctx, pad, py, pw, (kevLines.length * 9 + 5) * ts, { accent: '#3070ff' });
      kevLines.forEach((l, i) => T(ctx, fit(l, pw - 2 * ip, ts), pad + ip, py + 4 * ts + i * 9 * ts, { color: i === 2 ? '#ff9a30' : C.white, scale: ts }));
    }
    const hasPolice = near || (g.char !== 'cop' && (PO.units.length || PO.heli || PO.boat || PO.blocks.length)) || g.char === 'cop';
    const actY = py + (hasPolice ? (g.char === 'cop' ? (kevLines.length * 9 + 9) * ts : polH + 4 * ts) : 0);
    UI.leftBottom = actY + VH.Acts.hud(ctx, ts, pad, actY, pw);
    const hr = UI.hudRects = { left: { x: pad, y: pad, w: pw, h: UI.leftBottom - pad } }; // where the HUD put things (read by tests/mobile.mjs)
    // --- toasts: at most three short status lines, wrapped so they never run off the edge
    // on narrow screens the status lines go below the left-hand panels (and the touch buttons), so nothing overlaps
    // between the left-hand panels and the minimap when there's room, otherwise below them
    const side = Math.max(pw, 92 * ts + (TL ? TL.blockW : 0)) + 2 * pad, mid = w - 2 * side; const under = narrow || mid < 170 * ts;
    let ty = under && short ? Math.max(UI.leftBottom + 4 * ts, pad + 44 * ts) : under ? Math.max(pad + 102 * ts, UI.leftBottom + 4 * ts, I.touchMode ? pad + 168 * ts : 0) : pad + 34 * ts; const tn = Math.max(12, Math.floor(((under ? w - 2 * pad : mid) - 4 * ts) / (6 * ts)));
    if (short && !under) ty = Math.max(ty, cyp + 32 * ts);
    for (const m of (short ? g.msgs.slice(-1) : g.msgs)) { const a = Math.min(1, m.t * 2); ctx.globalAlpha = a; for (const l of U.wrap(m.str, tn)) { T(ctx, l, w / 2, ty, { align: 'center', color: m.col, scale: ts }); ty += 10 * ts; } ctx.globalAlpha = 1; }
    // --- the one big callout
    const co = g.nextCallout && g.nextCallout();
    if (co) {
      const str = co.str + (co.n > 1 ? ' X' + co.n : ''); const age = g.t - co.t0; const big = Math.max(ts, Math.min(ts * 2, Math.floor((w - 16 * ts) / (str.length * 6))));
      const lines = U.textWidth(str, big) > w - 16 * ts ? U.wrap(str, Math.floor((w - 16 * ts) / (6 * big))) : [str];
      ctx.globalAlpha = Math.min(1, (1.5 - age) * 3); const cy = Math.max(Math.round(h * 0.37), ty + 6 * ts) - (age < 0.12 ? 2 * ts : 0);
      const bw = Math.max(...lines.map(l => U.textWidth(l, big))) + 10 * ts; ctx.fillStyle = 'rgba(18,12,36,0.55)'; ctx.fillRect(Math.round(w / 2 - bw / 2), cy - 3 * ts, Math.round(bw), lines.length * 9 * big + 4 * ts);
      lines.forEach((l, i) => T(ctx, l, w / 2, cy + i * 9 * big, { align: 'center', color: co.col, scale: big })); ctx.globalAlpha = 1;
    }
    // --- minimap
    UI.minimap(ctx, w - pad - mmS, pad, mmS, mmS, ts); hr.minimap = { x: w - pad - mmS, y: pad, w: mmS, h: mmS };
    // --- bottom: street + objective
    const street = UI.streetCache(pl.x, pl.y);
    // (on a touch screen it goes under the left-hand panels, cut to their width)
    if (!(I.touchMode && (narrow || short))) { const sy = I.touchMode ? UI.leftBottom + 4 * ts : h - pad - 9 * ts; const ss = I.touchMode ? fit(street, pw - 4, ts) : street; T(ctx, ss, pad + 2, sy, { color: C.white, scale: ts }); hr.street = { x: pad + 2, y: sy, w: U.textWidth(ss, ts), h: 7 * ts }; }
    const obj = M().objective(); let objTop = TL && !TL.wide ? TL.top - 4 * ts : h - pad - 22 * ts; const beside = TL && (TL.wide || !narrow); // the objective sits above the thumb buttons, or beside them
    if (obj) {
      const job = M().job; const tm = M().timer(); const secs = tm != null ? Math.max(0, Math.ceil(tm)) : null;
      const tstr = secs != null ? ' · ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') : ''; const tW = U.textWidth(tstr, ts);
      const btnW = beside ? w - TL.left + 4 * ts : 0; const ocx = (w - btnW) / 2; // on a phone on its side, clear of the thumb buttons
      const maxW = Math.min(w - btnW - 2 * pad - 2 * ip, 330 * ts); const head = job && job.started ? fit(job.title + (I.touchMode ? '' : '  (J: BRIEF)'), maxW, ts) : '';
      const paras = obj.split('\n'); const first = U.wrap(paras[0], Math.max(8, Math.floor((maxW - tW) / (6 * ts)))); const rest = paras.slice(1).flatMap(p => U.wrap(p, Math.max(8, Math.floor(maxW / (6 * ts)))));
      let lines = [...first, ...rest]; let lastFirst = first.length - 1;
      if (short && lines.length > 3) { const f2 = first.slice(0, 2); if (first.length > 2) f2[1] = fit(f2[1] + ' ' + first.slice(2).join(' '), maxW - tW, ts); lines = [...f2, ...rest.slice(0, 1).map(l => fit(l + (rest.length > 1 ? ' ' + rest.slice(1).join(' ') : ''), maxW, ts))]; lastFirst = f2.length - 1; } // short screens: two lines, then one
      const bw = Math.round(Math.max(U.textWidth(head, ts), ...lines.map((l, i) => U.textWidth(l, ts) + (i === lastFirst ? tW : 0))) + 2 * ip + 4 * ts), bh = lines.length * 9 * ts + 8 * ts + (head ? 9 * ts : 0);
      const by = (TL && !beside ? TL.top - 4 * ts : h - pad - (I.touchMode && narrow && !beside ? 116 : 22) * ts) - bh; objTop = by; // on phones, sit above the thumb buttons
      const fl = (g.objFlash || 0) > 0 && Math.floor(g.objFlash * 6) % 2; const bx = Math.round(ocx - bw / 2);
      panel(ctx, bx, by, bw, bh, { accent: C.hi, fill: fl ? 'rgba(120,80,10,0.92)' : C.panel, edge: fl ? C.hi : C.edge }); hr.obj = { x: bx, y: by, w: bw, h: bh };
      if (head) T(ctx, head, ocx, by + 4 * ts, { align: 'center', color: C.dim, scale: ts });
      lines.forEach((l, i) => {
        const yy = by + 5 * ts + (head ? 9 * ts : 0) + i * 9 * ts; const col = i < first.length ? C.hi : C.teal;
        if (i === lastFirst && tstr) { const lw = U.textWidth(l, ts); const x0 = Math.round(ocx - (lw + tW) / 2); T(ctx, l, x0, yy, { color: col, scale: ts }); T(ctx, tstr, x0 + lw, yy, { color: secs < 30 && Math.floor(g.t * 2) % 2 ? C.red : secs < 30 ? '#ffb0a8' : C.white, scale: ts }); }
        else T(ctx, l, ocx, yy, { align: 'center', color: col, scale: ts });
      });
    }
    if (g.objFlash > 0) g.objFlash -= g.frameDt || 0.016;
    UI.objTop = objTop;
    if (!I.touchMode) T(ctx, '? HELP', w - pad, h - pad - 9 * ts, { align: 'right', color: C.dim, scale: ts });
    // vehicle readout
    if (!pl.onFoot && pl.vehicle && !(short && I.touchMode)) { // (no room for it beside the thumb buttons on a phone on its side)
      const v = pl.vehicle; const kmh = Math.round(v.speed * 3.6);
      const vx = w - pad - 92 * ts, vy = pad + 96 * ts;
      panel(ctx, vx, vy, 92 * ts, 24 * ts); hr.speedo = { x: vx, y: vy, w: 92 * ts, h: 24 * ts };
      T(ctx, fit((v.rail ? v.name : v.def.name).toUpperCase(), 84 * ts, ts), vx + 4 * ts, vy + 4 * ts, { color: C.dim, scale: ts });
      T(ctx, kmh + ' KM/H', vx + 4 * ts, vy + 13 * ts, { color: C.white, scale: ts });
      if (!v.rail) { const bw = 30 * ts; ctx.fillStyle = '#2a2040'; ctx.fillRect(vx + 58 * ts, vy + 14 * ts, bw, 5 * ts); ctx.fillStyle = G().dmgCol(v.damage); ctx.fillRect(vx + 58 * ts, vy + 14 * ts, bw * (1 - v.damage), 5 * ts);
        // the damage stage takes the name's place once there is one (dented, smoking, sparking, limping, disabled)
        const stg = VH.DAMAGE.STAGES[VH.DAMAGE.stage(v.damage)][1]; if (stg && Math.floor(g.t * 0.7) % 2) { ctx.fillStyle = '#1a1230'; ctx.fillRect(vx + 2 * ts, vy + 3 * ts, 88 * ts, 9 * ts); T(ctx, stg, vx + 4 * ts, vy + 4 * ts, { color: G().dmgCol(v.damage), scale: ts }); } }
    }
    // context prompt
    let prompt = '';
    const jp = M().job && M().job.started && M().job.prompt ? M().job.prompt() : '';
    const ep = VH.Escort.prompt();
    if (ep) prompt = ep;
    else if (jp) prompt = jp;
    else if (pl.inShop) prompt = VH.Shops.prompt();
    else if (pl.onFoot && !VH.Tackle.on) { const v = g.nearestVehicle(pl.x, pl.y, g.ENTER_R); if (v) prompt = UI.enterPrompt(v); }
    else if (pl.vehicle && (pl.vehicle.type === 'police' || pl.vehicle.roofLight) && !pl.vehicle.siren && g.char === 'cop') prompt = (I.touchMode ? 'SIREN BUTTON' : 'H') + ': SIREN ON';
    else if (pl.vehicle && g.char === 'cop' && !pl.vehicle.rail && !pl.vehicle.def.heli && !pl.vehicle.def.bike && !pl.vehicle.def.gopher && pl.vehicle.type !== 'police' && pl.vehicle.type !== 'paddy' && !pl.vehicle.roofLight) prompt = (I.touchMode ? 'LIGHT' : 'L') + ': MAGNETIC LIGHT ON THE ROOF';
    // the bottom prompt sits just above the objective, and first-time tips above that
    UI.lastPrompt = prompt; let aboveY = UI.objTop || h - pad - 22 * ts;
    // (on a phone on its side, both stay left of the thumb buttons, like the objective)
    const colW = beside ? TL.left - 4 * ts : w, colX = colW / 2;
    if (prompt) { const pt = fit(prompt, colW - 2 * pad - 8 * ts, ts), pw2 = U.textWidth(pt, ts) + 2 * ip; panel(ctx, colX - pw2 / 2, aboveY - 15 * ts, pw2, 13 * ts, { fill: 'rgba(18,12,36,0.8)' }); T(ctx, pt, colX, aboveY - 12 * ts, { align: 'center', color: C.white, scale: ts }); hr.prompt = { x: colX - pw2 / 2, y: aboveY - 15 * ts, w: pw2, h: 13 * ts }; aboveY -= 17 * ts; }
    UI.tipTop = aboveY; if (!(short && I.touchMode)) UI.hints(ctx, ts, aboveY, colX, colW);
    // off-screen target arrows: every target gets its own arrow, label and distance (nearest first); labels shuffle
    // along the edge so they never sit on top of each other
    const vw = g.view; const wpt = g.waypoint ? [{ ...g.waypoint, col: '#ffffff' }] : [];
    const offs = [...wpt, ...g.myMarkers(), ...M().targets().filter(tg => !tg.small).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)).slice(0, 8)];
    const placed = [];
    if (vw && !VH.Tackle.on) for (const tg of offs) {
      const kz = vw.k || 1, io = UI.inset || { l: 0, t: 0, scale: 1 }; const sx = (tg.x - vw.left) * vw.S * kz - io.l / io.scale, sy = (tg.y - vw.top) * vw.S * kz - io.t / io.scale; const m = 14 * ts, mt = Math.max(narrow ? Math.max(Math.min(104 * ts, h * 0.3), (UI.leftBottom || 0) + 16 * ts) : Math.min(104 * ts, h * 0.3), TL && TL.wide ? TL.small[3].y + TL.small[3].h + 12 * ts : 0), mb = Math.max(64 * ts, h - Math.min(UI.objTop || h, UI.tipTop || h) + 16 * ts);
      if (sx > m && sy > m && sx < w - m && sy < h - m) continue;
      const cx = w / 2, cy = h / 2 + (mt - mb) / 2; const a = Math.atan2(sy - cy, sx - cx);
      const k = Math.min((w / 2 - m - 10 * ts) / Math.abs(Math.cos(a) || 1e-6), ((h - mt - mb) / 2) / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k; const col = tg.col || C.hi;
      ctx.save(); ctx.translate(Math.round(ax), Math.round(ay)); ctx.rotate(a); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(8 * ts, 0); ctx.lineTo(-5 * ts, -6 * ts); ctx.lineTo(-5 * ts, 6 * ts); ctx.fill();
      ctx.fillStyle = Math.floor(g.t * 3) % 2 ? col : '#fff4c0'; ctx.beginPath(); ctx.moveTo(6 * ts, 0); ctx.lineTo(-4 * ts, -4 * ts); ctx.lineTo(-4 * ts, 4 * ts); ctx.fill(); ctx.restore();
      const dm = Math.round(Math.hypot(tg.x - pl.x, tg.y - pl.y)); const lab = (tg.label ? tg.label + ' · ' : '') + dm + 'M';
      const lw = U.textWidth(lab, ts); let lx = U.clamp(Math.round(ax - Math.cos(a) * 22 * ts), lw / 2 + 4 * ts, w - lw / 2 - 4 * ts), ly = U.clamp(Math.round(ay - Math.sin(a) * 14 * ts) - 3, mt, h - mb);
      const side = Math.abs(Math.cos(a)) * (w / 2) > Math.abs(Math.sin(a)) * (h / 2); // on the left or right edge: shuffle up and down
      const hit = (x, y) => placed.some(r => Math.abs(r.x - x) < (r.w + lw) / 2 + 4 * ts && Math.abs(r.y - y) < 14 * ts);
      for (let i = 1, x0 = lx, y0 = ly; i < 12 && hit(lx, ly); i++) { const s = (i % 2 ? 1 : -1) * Math.ceil(i / 2); if (side) ly = U.clamp(y0 + s * 14 * ts, mt, h - mb); else lx = U.clamp(x0 + s * (lw + 8 * ts), lw / 2 + 4 * ts, w - lw / 2 - 4 * ts); }
      if (TL && lx + lw / 2 + 3 * ts > TL.left && ly + 10 * ts > TL.top) ly = Math.max(mt, TL.top - 12 * ts); // not over the thumb buttons
      placed.push({ x: lx, y: ly, w: lw });
      panel(ctx, lx - lw / 2 - 3 * ts, ly - 3 * ts, lw + 6 * ts, 13 * ts, { fill: 'rgba(18,12,36,0.8)', edge: tg.col || C.edge });
      T(ctx, lab, lx, ly, { align: 'center', color: col, scale: ts });
    }
    if (I.touchMode && g.helpOpen) { I.setButtons([]); I.stickZone = 0; } // the ? overlay takes the fingers: drag to scroll, tap to close
    else if (I.touchMode && !VH.Tackle.on) UI.touch(ctx, ts, TL); else if (!I.touchMode) I.setButtons([{ id: 'pause', x: w / 2 + tw / 2 + 40 * ts, y: pad, w: 0, h: 0 }]);
    VH.Street.drawFeed(ctx, ts);
    // notoriety: little blue camera dots after the gossip label (one per clip on the community page)
    if (VH.Street.notoriety > 0 && g.char !== 'cop') for (let k = 0; k < VH.Street.notoriety; k++) { ctx.fillStyle = '#120c24'; ctx.fillRect(pad + 100 * ts + k * 4 * ts, pad + 20 * ts, 3 * ts + 1, 3 * ts + 1); ctx.fillStyle = '#5fb0ff'; ctx.fillRect(pad + 100 * ts + k * 4 * ts, pad + 20 * ts, 3 * ts, 3 * ts); }
    VH.Tackle.draw(ctx, ts);
    if (g.helpOpen) UI.helpOverlay(ctx, ts);
  };
  UI.enterPrompt = function (v) {
    const g = G(); const k = I.touchMode ? 'GET IN' : 'E';
    const name = (v.rail ? v.name : v.def.name).toUpperCase();
    const what = v.rail ? 'BORROW THE ' + name : v.def.bike ? 'HOP ON THE ' + name : v.def.gopher ? (v.owned ? 'CLIMB ON YOUR GOPHER' : 'CLIMB ON THE GOPHER') : v.owned ? 'YOUR ' + name :
      v.ai ? 'BORROW THE ' + name + ' (DRIVER WILL BE MIFFED)' : (v.type === 'police' || v.type === 'paddy') && g.char !== 'cop' ? 'NICK THE ' + name + '?!' : 'BORROW THE ' + name;
    return k + ' · ' + what;
  };
  let stCache = { t: 0, s: '' };
  UI.streetCache = (x, y) => { const now = performance.now(); if (now - stCache.t > 400) { const st = W.streetName(x, y); stCache = { t: now, s: (st ? st + ', ' : '') + W.suburb(x, y) }; } return stCache.s.toUpperCase(); };

  UI.minimap = function (ctx, x, y, w, h, ts) {
    const g = G(), pl = g.player; const ov = R.overview; if (!ov) return;
    const sc = R.overviewScale; const zoom = 1.6 / ts; // metres per minimap px
    panel(ctx, x - 2, y - 2, w + 4, h + 4, { accent: C.teal });
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const mpp = 4.5; // metres per px
    const sw = w * mpp / sc, sh = h * mpp / sc; const sx = pl.x / sc - sw / 2, sy = pl.y / sc - sh / 2;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(ov, sx, sy, sw, sh, x, y, w, h);
    const toM = (wx, wy) => [x + (wx / sc - sx) / sw * w, y + (wy / sc - sy) / sh * h];
    for (const tg of M().targets()) { if (tg.small) continue; let [mx, my] = toM(tg.x, tg.y); mx = U.clamp(mx, x + 2, x + w - 3); my = U.clamp(my, y + 2, y + h - 3); ctx.fillStyle = Math.floor(g.t * 4) % 2 ? (tg.col || C.hi) : C.ink; ctx.fillRect(Math.round(mx) - 2, Math.round(my) - 2, 4, 4); ctx.fillStyle = tg.col || C.hi; ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 2, 2); }
    for (const m of g.myMarkers()) { const [mx, my] = toM(m.x, m.y); UI.carIcon(ctx, U.clamp(mx, x + 4, x + w - 5), U.clamp(my, y + 3, y + h - 4), 1); }
    if (g.waypoint) { const [mx, my] = toM(g.waypoint.x, g.waypoint.y); UI.pin(ctx, U.clamp(mx, x + 3, x + w - 4), U.clamp(my, y + 7, y + h - 2), 1); }
    const PO = VH.Police, LK = VH.Lockup; const blink = Math.floor(g.t * 6) % 2;
    for (const r of VH.Shops.resprays) { const [mx, my] = toM(r.x, r.y); if (mx < x || my < y || mx > x + w || my > y + h) continue; (r.service === 'tyres' ? VH.Shops.drawTyre : VH.Shops.drawCan)(ctx, Math.round(mx), Math.round(my), 1); }
    for (const m of [...VH.Acts.markers(), ...(g.helipads || []).map(h => ({ x: h.x, y: h.y, letter: 'H', col: '#ffffff' }))]) { const [mx, my] = toM(m.x, m.y); if (mx < x || my < y || mx > x + w || my > y + h) continue; ctx.fillStyle = 'rgba(18,12,36,0.8)'; ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 4, 7, 9); U.text(ctx, m.letter, Math.round(mx) - 2, Math.round(my) - 3, { color: m.col, shadow: false }); }
    if (LK.b) { const [mx, my] = toM(LK.centre.x, LK.centre.y); ctx.fillStyle = '#4a4f66'; ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 2, 7, 5); ctx.fillStyle = '#c9ccd8'; ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 4, 2, 2); ctx.fillRect(Math.round(mx) + 2, Math.round(my) - 4, 2, 2); }
    if (VH.Street.scannerT > 0) for (const v of PO.patrols) { const [mx, my] = toM(v.x, v.y); ctx.fillStyle = '#7fa6ff'; ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3); }
    for (const v of [...PO.units, ...PO.backup]) { const [mx, my] = toM(v.x, v.y); ctx.fillStyle = blink ? '#ff3030' : '#3070ff'; ctx.fillRect(Math.round(mx) - 2, Math.round(my) - 2, 4, 4); }
    for (const b of PO.blocks) { const [mx, my] = toM(b.x, b.y); ctx.fillStyle = '#ff3030'; ctx.fillRect(Math.round(mx) - 3, Math.round(my) - 1, 7, 3); }
    if (PO.boat) { const [mx, my] = toM(PO.boat.x, PO.boat.y); ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(mx) - 2, Math.round(my) - 1, 5, 3); }
    if (PO.heli) { const [mx, my] = toM(PO.heli.sx, PO.heli.sy); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx, my, 4, 0, U.TAU); ctx.stroke(); }
    for (const v of g.watch) { const [mx, my] = toM(v.x, v.y); ctx.fillStyle = '#e8c33a'; ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3); }
    // player arrow
    const [px, py] = toM(pl.x, pl.y); ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.rotate(pl.ang);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3); ctx.fill(); ctx.restore();
    ctx.restore();
    T(ctx, 'N', x + w - 7, y + 2, { color: C.white });
  };

  // ---------- the full map: zoom and pan, find a street or place, and drop a waypoint ----------
  // Everything you can search for: named streets (a point on each), named places and parks, landmarks and the shops.
  UI.searchIndex = function () {
    if (UI._sidx) return UI._sidx; const g = G(); const out = []; const seen = new Set();
    const add = (name, x, y, kind) => { if (!name) return; const key = kind + ':' + name.toUpperCase(); if (seen.has(key)) return; seen.add(key); out.push({ name: name.toUpperCase(), x, y, kind }); };
    const P = g.places; [['WARLAND RESERVE', P.warland], ['GRANITE ISLAND', P.granite], ['THE BLUFF (ROSETTA HEAD)', P.bluff], ['GOLF CLUB', P.golf], ['POLICE STATION', P.police], ['RAILWAY STATION', P.station], ['INDUSTRIAL ESTATE', P.industrial], ['CEMETERY', P.cemetery], ['FISH SHOP', P.fishShop], ['WHALE CENTRE', P.whaleCentre], ['OVAL', P.oval]].forEach(([n, p]) => p && add(n, p.x, p.y, 'PLACE'));
    if (VH.Lockup.centre) add(VH.Lockup.NAME || 'THE LOCK-UP', VH.Lockup.centre.x, VH.Lockup.centre.y, 'PLACE');
    for (const s of VH.Shops.list) add(s.name, s.door.x, s.door.y, 'SHOP'); for (const r of VH.Shops.resprays) add(r.name, r.x, r.y, 'SHOP');
    for (const p of W.pois) if (p.n) add(p.n, p.x, p.y, 'PLACE');
    for (const a of W.areas) if (a.n && typeof a.n === 'string') add(a.n, (a.bb[0] + a.bb[2]) / 2, (a.bb[1] + a.bb[3]) / 2, 'PLACE');
    // streets: the middle of the longest stretch with that name
    const best = new Map(); for (const e of W.edges) if (e.n) { const b = best.get(e.n); if (!b || e.len > b.len) best.set(e.n, e); }
    for (const [n, e] of best) { const [x, y] = U.alongPoly(e.p, e.cum, e.len / 2); add(n, x, y, 'STREET'); }
    return (UI._sidx = out);
  };
  // street-type abbreviations: typed short, shown short on the waypoint arrow
  const ABBR = [['ROAD', 'RD'], ['STREET', 'ST'], ['AVENUE', 'AVE'], ['DRIVE', 'DR'], ['TERRACE', 'TCE'], ['PARADE', 'PDE'], ['CRESCENT', 'CRES'], ['HIGHWAY', 'HWY'], ['COURT', 'CT'], ['PLACE', 'PL'], ['ESPLANADE', 'ESP'], ['BOULEVARD', 'BVD'], ['CLOSE', 'CL'], ['LANE', 'LN']];
  UI.longName = q => ABBR.reduce((s, [l, a]) => s.replace(new RegExp('\\b' + a + '\\b', 'g'), l), q);
  UI.shortName = q => ABBR.reduce((s, [l, a]) => s.replace(new RegExp('\\b' + l + '\\b', 'g'), a), q);
  UI.searchFind = function (q) {
    q = q.trim().toUpperCase(); if (!q) return []; q = UI.longName(q); // BAY RD finds BAY ROAD
    const res = []; for (const it of UI.searchIndex()) { const i = it.name.indexOf(q); if (i < 0) continue; const word = i === 0 || it.name[i - 1] === ' '; res.push({ it, score: (i === 0 ? 0 : word ? 1 : 2) * 100 + it.name.length }); }
    return res.sort((a, b) => a.score - b.score).slice(0, 6).map(r => r.it);
  };
  // a real (see-through) text box over the drawn one, so phones bring up their keyboard; the drawing is pixel font
  UI.searchEl = function () {
    if (UI._sel) return UI._sel; const el = document.createElement('input'); el.type = 'text'; el.autocomplete = 'off'; el.spellcheck = false; el.setAttribute('aria-label', 'Find a street or place');
    Object.assign(el.style, { position: 'fixed', opacity: '0.01', border: '0', padding: '0', margin: '0', fontSize: '16px', zIndex: 5, display: 'none', background: 'transparent', color: 'transparent', caretColor: 'transparent' });
    el.addEventListener('keydown', e => {
      const s = UI.search; e.stopPropagation();
      if (e.key === 'ArrowDown') { s.sel = Math.min((s.res.length || 1) - 1, s.sel + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { s.sel = Math.max(0, s.sel - 1); e.preventDefault(); }
      else if (e.key === 'Enter') { if (s.res[s.sel]) UI.pickPlace(s.res[s.sel]); el.blur(); e.preventDefault(); }
      else if (e.key === 'Tab') e.preventDefault();
      else if (e.key === 'Escape') { el.value = ''; s.q = ''; s.res = []; el.blur(); e.preventDefault(); }
    });
    el.addEventListener('input', () => { const s = UI.search; s.q = el.value.toUpperCase().slice(0, 28); s.res = UI.searchFind(s.q); s.sel = 0; });
    el.addEventListener('focus', () => { UI.search.focus = true; }); el.addEventListener('blur', () => { UI.search.focus = false; });
    document.body.appendChild(el); return (UI._sel = el);
  };
  UI.search = { q: '', res: [], sel: 0, focus: false };
  UI.hideSearch = () => { if (UI._sel) { UI._sel.style.display = 'none'; UI._sel.blur(); } };
  UI.pickPlace = function (it) {
    const g = G(); g.waypoint = { x: it.x, y: it.y, label: UI.shortName(it.name) }; const mz = UI.mapZ; if (mz) { mz.z = Math.max(mz.z, 3.375); mz.cx = it.x; mz.cy = it.y; }
    sfx('click'); g.toast('WAYPOINT: ' + it.name, '#ffffff'); const s = UI.search; s.res = []; s.q = ''; if (UI._sel) UI._sel.value = '';
  };
  UI.fullMap = function (ctx, ts) {
    const g = G(), pl = g.player, w = ctx.canvas.width, h = ctx.canvas.height; const ov = R.overview; const sc = R.overviewScale; const S = UI.search;
    backdrop(ctx, 'rgba(10,8,24,0.85)');
    // zoom (wheel, +/-, pinch) and pan (arrows / WASD / drag) the full map; 0 recentres
    const mz = UI.mapZ || (UI.mapZ = { z: 1, cx: pl.x, cy: pl.y });
    if (!S.focus) { if (I.consume('zoomIn')) mz.z = Math.min(8, mz.z * 1.5); if (I.consume('zoomOut')) mz.z = Math.max(1, mz.z / 1.5); if (I.consume('zoomReset')) { mz.z = 1; mz.cx = pl.x; mz.cy = pl.y; } }
    // the bottom block: the legend, the how-to line and the map credit, each wrapped to the screen (a phone in portrait
    // takes two or three rows); the map view ends where it starts
    const nC = Math.max(12, Math.floor((w - 8 * ts) / (6 * ts)));
    const credit = U.wrap('MAP DATA (C) OPENSTREETMAP CONTRIBUTORS (ODBL)', nC);
    const howto = pack(I.touchMode ? ['PINCH: ZOOM', 'DRAG: PAN', 'TAP: WAYPOINT'] : ['WHEEL / + -: ZOOM', 'ARROWS: PAN', 'CLICK: WAYPOINT', 'M: CLOSE'], nC);
    const legRows = UI.mapLegendRows(ts, w - 20 * ts).length;
    const extra = (legRows - 1) * 11 * ts + (howto.length - 1 + credit.length - 1) * 9 * ts;
    const k0 = Math.min((w - 20) / ov.width, (h - 40 * ts - extra) / ov.height); const k = k0 * mz.z;
    const pan = S.focus ? 0 : 400 / mz.z * (g.frameDt || 0.016); mz.cx += ((I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0)) * pan; mz.cy += ((I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0)) * pan;
    for (const q of I.pointers.values()) { if (q.lx != null && !q.btn) { mz.cx -= (q.x - q.lx) / k * sc; mz.cy -= (q.y - q.ly) / k * sc; } q.lx = q.x; q.ly = q.y; }
    if (mz.z === 1) { mz.cx = W.width / 2; mz.cy = W.height / 2; }
    const mw = ov.width * k, mh = ov.height * k; const vx0 = 10, vy0 = 22 * ts, vw0 = w - 20, vh0 = h - 40 * ts - extra;
    let mx = vx0 + vw0 / 2 - mz.cx / sc * k, my = vy0 + vh0 / 2 - mz.cy / sc * k;
    if (mz.z === 1) { mx = (w - mw) / 2; my = 22 * ts; }
    ctx.save(); ctx.beginPath(); ctx.rect(vx0 - 4, vy0 - 4, vw0 + 8, vh0 + 8); ctx.clip();
    panel(ctx, mx - 3, my - 3, mw + 6, mh + 6, { accent: C.teal });
    ctx.imageSmoothingEnabled = true; ctx.drawImage(ov, mx, my, mw, mh); ctx.imageSmoothingEnabled = false;
    const toM = (x, y) => [mx + x / sc * k, my + y / sc * k]; const fromM = (x, y) => [(x - mx) / k * sc, (y - my) / k * sc];
    // landmark labels
    const P = g.places; const labels = [['WARLAND RESERVE', P.warland], ['GRANITE ISLAND', P.granite], ['THE BLUFF', P.bluff], ['GOLF CLUB', P.golf], ['POLICE', P.police], ['STATION', P.station], ['INDUSTRIAL ESTATE', P.industrial], ['CEMETERY', P.cemetery], ['LOCK-UP', VH.Lockup.centre]];
    for (const [s, p] of labels) { if (!p) continue; const [x, y] = toM(p.x, p.y); ctx.fillStyle = C.white; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); T(ctx, s, x + 3, y - 3, { color: C.white, scale: 1 }); }
    if (R.drawMapLabels) R.drawMapLabels(ctx, toM, k / sc, ts, [vx0, vy0, vw0, vh0]); // [Round C map] street, suburb and park names
    for (const r of VH.Shops.resprays) { const [x, y] = toM(r.x, r.y); (r.service === 'tyres' ? VH.Shops.drawTyre : VH.Shops.drawCan)(ctx, Math.round(x), Math.round(y), 2); T(ctx, r.name, x + 8, y - 4, { color: '#9be15d', scale: 1 }); }
    for (const s of VH.Shops.list) { const [x, y] = toM(s.door.x, s.door.y); ctx.fillStyle = '#38e0c8'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4); }
    for (const m of [...VH.Acts.markers(), ...(g.helipads || []).map(h => ({ x: h.x, y: h.y, letter: 'H', col: '#ffffff' }))]) { const [x, y] = toM(m.x, m.y); ctx.fillStyle = 'rgba(18,12,36,0.85)'; ctx.fillRect(Math.round(x) - 4, Math.round(y) - 5, 9, 11); U.text(ctx, m.letter, Math.round(x) - 2, Math.round(y) - 3, { color: m.col, shadow: false }); }
    for (const tg of M().targets()) { if (tg.small) continue; const [x, y] = toM(tg.x, tg.y); ctx.fillStyle = Math.floor(g.t * 4) % 2 ? (tg.col || C.hi) : C.pink; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); }
    for (const m of g.myMarkers()) { const [x, y] = toM(m.x, m.y); UI.carIcon(ctx, x, y, 2); T(ctx, m.label, x + 8, y - 4, { color: g.MINE_COL, scale: 1 }); }
    if (g.waypoint) { const [x, y] = toM(g.waypoint.x, g.waypoint.y); UI.pin(ctx, x, y, 2); T(ctx, g.waypoint.label, x + 8, y - 12, { color: '#fff', scale: 1 }); }
    const [px, py] = toM(pl.x, pl.y); ctx.fillStyle = Math.floor(g.t * 5) % 2 ? '#fff' : C.pink; ctx.fillRect(Math.round(px) - 3, Math.round(py) - 3, 6, 6);
    ctx.restore();
    const creditY = h - 10 * ts - (credit.length - 1) * 9 * ts, howtoY = h - 20 * ts - (credit.length - 1) * 9 * ts - (howto.length - 1) * 9 * ts;
    UI.mapLegend(ctx, ts, w / 2, howtoY - 12 * ts, w - 20 * ts);
    T(ctx, 'MAP OF VICTOR HARBOR', w / 2, 6 * ts, { align: 'center', color: C.hi, scale: ts * 1.5 | 0 || 1 });
    howto.forEach((l, i) => T(ctx, l, w / 2, howtoY + i * 9 * ts, { align: 'center', color: C.dim, scale: ts }));
    credit.forEach((l, i) => T(ctx, l, w / 2, creditY + i * 9 * ts, { align: 'center', color: C.dim, scale: ts }));
    // the search box (top left of the map) and its results; CLOSE (top right)
    const bw = Math.min(w - 70 * ts, 190 * ts), bx = 14 * ts, by = vy0 + 4 * ts, bh = 14 * ts;
    panel(ctx, bx, by, bw, bh, { fill: S.focus ? 'rgba(18,12,36,0.96)' : 'rgba(18,12,36,0.85)', edge: S.focus ? C.teal : C.edge });
    const caret = S.focus && Math.floor(g.t * 2.5) % 2 ? '_' : ''; const maxC = Math.floor((bw - 10 * ts) / (6 * ts));
    T(ctx, S.q ? (S.q + caret).slice(-maxC) : S.focus ? caret || ' ' : (I.touchMode ? 'TAP: FIND A STREET OR PLACE' : 'ENTER: FIND A STREET OR PLACE').slice(0, maxC), bx + 5 * ts, by + 4 * ts, { color: S.q || S.focus ? C.white : C.dim, scale: ts });
    const rr = []; S.res.forEach((it, i) => { const ry = by + bh + i * 12 * ts; const sel = i === S.sel; panel(ctx, bx, ry, bw, 12 * ts, { fill: sel ? 'rgba(60,40,100,0.97)' : 'rgba(18,12,36,0.95)', edge: C.edge }); T(ctx, (it.name + ' · ' + it.kind).slice(0, maxC), bx + 5 * ts, ry + 3 * ts, { color: sel ? C.hi : C.white, scale: ts }); rr.push({ x: bx, y: ry, w: bw, h: 12 * ts, it }); });
    if (S.q && !S.res.length) { panel(ctx, bx, by + bh, bw, 12 * ts, { fill: 'rgba(18,12,36,0.95)' }); T(ctx, 'NOTHING BY THAT NAME', bx + 5 * ts, by + bh + 3 * ts, { color: C.dim, scale: ts }); }
    const cbw = 40 * ts, cbx = w - cbw - 12 * ts, cby = vy0 + 4 * ts; UI.mapClose = { x: cbx, y: cby, w: cbw, h: 14 * ts }; panel(ctx, cbx, cby, cbw, 14 * ts, { accent: C.pink }); T(ctx, 'CLOSE', cbx + cbw / 2, cby + 4 * ts, { align: 'center', color: C.white, scale: ts });
    // the real text box sits over the drawn one
    const el = UI.searchEl(); const cssK = I.scale / (I.canvas.width / I.canvas.getBoundingClientRect().width || 1), cssO = cssK / I.scale;
    Object.assign(el.style, { display: 'block', left: bx * cssK + (I.offX || 0) * cssO + 'px', top: by * cssK + (I.offY || 0) * cssO + 'px', width: bw * cssK + 'px', height: bh * cssK + 'px' });
    if (!S.focus && (I.consume('confirm') || I.consume('kick'))) { el.focus(); }
    // clicks and taps: a result, CLOSE, or anywhere on the map for a waypoint (on the waypoint again clears it)
    const c = I.click(); if (c) {
      const hit = rr.find(r => c.x >= r.x && c.y >= r.y && c.x <= r.x + r.w && c.y <= r.y + r.h);
      if (hit) UI.pickPlace(hit.it);
      else if (c.x >= cbx && c.y >= cby && c.x <= cbx + cbw && c.y <= cby + 14 * ts) UI.closeMap = true;
      else if (c.x >= bx && c.y >= by && c.x <= bx + bw && c.y <= by + bh) el.focus();
      else if (c.x > vx0 && c.y > vy0 && c.x < vx0 + vw0 && c.y < vy0 + vh0) {
        const [wx, wy] = fromM(c.x, c.y); const wp = g.waypoint;
        if (wp) { const [qx, qy] = toM(wp.x, wp.y); if (Math.hypot(qx - c.x, qy - c.y) < 10 * ts) { g.waypoint = null; g.toast('WAYPOINT CLEARED', '#ffffff'); sfx('click'); return; } }
        if (W.inBounds(wx, wy)) { const st = W.streetName(wx, wy); g.waypoint = { x: wx, y: wy, label: st ? UI.shortName(st.toUpperCase()) : 'WAYPOINT' }; sfx('click'); g.toast('WAYPOINT: ' + g.waypoint.label, '#ffffff'); }
        if (S.focus) el.blur();
      }
    }
  };
  // the key to the map icons, drawn as the icons themselves (one row, or two on a narrow screen), centred at x
  UI.MAP_KEY = [['job', 'JOB'], ['car', 'YOUR CAR'], ['pin', 'WAYPOINT'], ['can', 'RESPRAY'], ['tyre', 'TYRES'], ['shop', 'SHOP'], ['M', 'MAYHEM MINUTE'], ['R', 'RAMP'], ['G', 'RACES'], ['H', 'HELIPAD']];
  const legendItemW = ([ic, txt], ts) => 12 * ts + U.textWidth(txt, ts) + 8 * ts;
  UI.mapLegendRows = (ts, maxW) => { const rows = [[]]; let rw = 0; for (const it of UI.MAP_KEY) { const iw = legendItemW(it, ts); if (rw + iw > maxW && rows[rows.length - 1].length) { rows.push([]); rw = 0; } rows[rows.length - 1].push(it); rw += iw; } return rows; };
  UI.mapLegend = function (ctx, ts, cx, y, maxW) {
    const item = it => legendItemW(it, ts); const rows = UI.mapLegendRows(ts, maxW);
    const y0 = y - (rows.length - 1) * 11 * ts;
    rows.forEach((row, ri) => {
      let x = Math.round(cx - row.reduce((a, it) => a + item(it), 0) / 2); const yy = y0 + ri * 11 * ts;
      for (const it of row) {
        const [ic, txt] = it; const ix = x + 4 * ts, iy = yy + 3 * ts;
        if (ic === 'job') { ctx.fillStyle = C.hi; ctx.fillRect(ix - 2 * ts, iy - 2 * ts, 4 * ts, 4 * ts); }
        else if (ic === 'car') UI.carIcon(ctx, ix, iy, ts); else if (ic === 'pin') UI.pin(ctx, ix, iy + 3 * ts, ts); else if (ic === 'can') VH.Shops.drawCan(ctx, ix, iy, Math.max(1, ts * 0.6 | 0)); else if (ic === 'tyre') VH.Shops.drawTyre(ctx, ix, iy, Math.max(1, ts * 0.6 | 0));
        else if (ic === 'shop') { ctx.fillStyle = '#38e0c8'; ctx.fillRect(ix - 2 * ts, iy - 2 * ts, 4 * ts, 4 * ts); }
        else { ctx.fillStyle = 'rgba(18,12,36,0.85)'; ctx.fillRect(ix - 4 * ts, iy - 5 * ts, 9 * ts, 11 * ts); T(ctx, ic, ix - 2 * ts, iy - 3 * ts, { color: ic === 'M' ? '#ff4fa0' : ic === 'H' ? '#fff' : '#ff9a30', scale: ts, shadow: false }); }
        T(ctx, txt, x + 12 * ts, yy, { color: C.white, scale: ts }); x += item(it);
      }
    });
  };
  // the light-blue "your car" icon and the white waypoint pin, shared by the map and the minimap
  UI.carIcon = (ctx, x, y, s = 1) => { x = Math.round(x); y = Math.round(y); ctx.fillStyle = '#120c24'; ctx.fillRect(x - 3 * s - 1, y - 2 * s - 1, 6 * s + 2, 4 * s + 2); ctx.fillStyle = G().MINE_COL; ctx.fillRect(x - 3 * s, y - 2 * s, 6 * s, 4 * s); ctx.fillStyle = '#120c24'; ctx.fillRect(x - s, y - 2 * s, 2 * s, 4 * s); };
  UI.pin = (ctx, x, y, s = 1) => { x = Math.round(x); y = Math.round(y); ctx.fillStyle = '#120c24'; ctx.fillRect(x - 2 * s - 1, y - 6 * s - 1, 4 * s + 2, 4 * s + 2); ctx.fillRect(x - 1, y - 2 * s, 2 + (s > 1 ? 1 : 0), 2 * s + 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2 * s, y - 6 * s, 4 * s, 4 * s); ctx.fillRect(x, y - 2 * s, 1, 2 * s); };

  // ---------- touch controls ----------
  // Where the thumb buttons go. One size for every round button: big enough for a thumb (46 CSS px across) and for
  // its longest label, a word a line. Upright phones stack them in a tall cluster above the bottom-right corner; a
  // phone on its side spreads them wider and lower, with MAP, PAUSE, JOB and ? left of the minimap instead of under it.
  const TALL = { action: [0, 0], enter: [2.4, -0.7], horn: [0.2, 2.4], run: [2.4, 1.8], kick: [0, 4.6], spikes: [0, 4.6], backup: [2.4, 4.2], light: [4.8, -0.7] };
  const WIDE = { action: [0, 0], enter: [2.4, -0.7], horn: [0, 2.3], run: [2.4, 1.7], kick: [4.8, 1.7], spikes: [4.8, 1.7], backup: [4.8, -0.7], light: [7.2, -0.7] };
  UI.touchLayout = function (w, h, ts) {
    const g = G(), pl = g.player, v = pl.vehicle; const heli = v && v.def && v.def.heli, bike = v && v.def && v.def.bike;
    const io = UI.inset || { dpr: 1, scale: 1 }; const css = n => Math.ceil(n * io.dpr / io.scale); // CSS px in art px
    const wide = w > h, sh = UI.short;
    const list = [
      { id: 'action', label: pl.onFoot ? 'ACT' : heli ? 'DOWN' : bike ? 'HOP' : 'SKID', col: C.pink },
      { id: 'enter', label: pl.onFoot ? 'GET IN' : 'GET OUT', col: C.teal },
      { id: 'horn', label: pl.onFoot ? (g.char === 'cop' ? 'MEGA' : 'SHOUT') : (v && (v.type === 'police' || v.type === 'paddy' || v.roofLight)) ? 'SIREN' : 'HORN', col: C.hi },
      { id: 'run', label: heli ? 'UP' : 'BOOST', col: '#7c5cff' },
    ];
    if (pl.onFoot) list.push({ id: 'kick', label: 'KICK', col: '#ff9a30' });
    if (g.char === 'cop' && v && !v.rail && !heli) list.push({ id: 'spikes', label: 'SPIKES', col: '#ff9a30' }, { id: 'backup', label: 'BACKUP', col: '#7fa6ff' });
    if (g.char === 'cop' && v && !v.rail && !heli && !bike && !v.def.gopher && v.type !== 'police' && v.type !== 'paddy') list.push({ id: 'light', label: 'LIGHT', col: '#9fd4ec' });
    if (g.char === 'cop' && pl.onFoot && !VH.Police.kevCar()) list.push({ id: 'backup', label: 'SPARE', col: '#7fa6ff' });
    for (const b of list) b.lines = b.label.split(' ');
    const need = Math.max(...list.map(b => Math.hypot(Math.max(...b.lines.map(l => U.textWidth(l, ts))) / 2, (b.lines.length * 9 - 2) * ts / 2) + 2 * ts));
    const r = Math.ceil(Math.max((sh ? 13 : 15) * ts, need, css(23)));
    const at = wide ? WIDE : TALL; const ax = w - r - 6 * ts, ay = h - 1.7 * r - 6 * ts; // the action button's centre
    for (const b of list) { b.cx = Math.round(ax - at[b.id][0] * r); b.cy = Math.round(ay - at[b.id][1] * r); }
    // MAP, PAUSE, JOB and ?: a 2 x 2 block
    const cw = Math.max(css(46), U.textWidth(wide ? 'JOB' : 'PAUSE', ts) + 8 * ts), chh = Math.max(16 * ts, css(46)), gap = 4 * ts;
    const mmS = UI.mmS || 92 * ts, bw = 2 * cw + gap, bh = 2 * chh + gap;
    const x0 = wide ? w - 4 * ts - mmS - 4 * ts - bw : w - 4 * ts - bw, y0 = wide ? 4 * ts : 4 * ts + 124 * ts;
    const small = [['map', 'MAP'], ['pause', cw >= U.textWidth('PAUSE', ts) + 8 * ts ? 'PAUSE' : 'II'], ['job', 'JOB'], ['help', '?']].map(([id, lab], i) => ({ id, lab, x: x0 + (i % 2) * (cw + gap), y: y0 + (i >> 1) * (chh + gap), w: cw, h: chh }));
    const left = Math.min(...list.map(b => b.cx - r)), top = Math.min(...list.map(b => b.cy - r));
    return { r, btns: list, small, left, top, blockW: wide ? bw + 4 * ts : 0, wide };
  };
  UI.touch = function (ctx, ts, TL) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const L = TL || UI.touchLayout(w, h, ts), r = L.r;
    const rects = [...L.btns.map(b => ({ id: b.id, x: b.cx - r, y: b.cy - r, w: r * 2, h: r * 2, round: true })), ...L.small.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }))];
    I.setButtons(rects); I.stickZone = w * 0.5; I.stickR = 26 * ts;
    for (const b of L.btns) {
      const held = I.held[b.id];
      ctx.globalAlpha = held ? 0.9 : 0.55; ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(b.cx, b.cy, r, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = b.col; ctx.lineWidth = Math.max(1, ts); ctx.beginPath(); ctx.arc(b.cx, b.cy, r - 1, 0, U.TAU); ctx.stroke(); ctx.globalAlpha = 1;
      b.lines.forEach((l, i) => T(ctx, l, b.cx, Math.round(b.cy - (b.lines.length * 9 - 2) * ts / 2 + i * 9 * ts), { align: 'center', color: b.col, scale: ts }));
    }
    for (const b of L.small) { panel(ctx, b.x, b.y, b.w, b.h, { edge: b.id === 'help' && G().helpOpen ? C.teal : C.edge }); T(ctx, b.lab, b.x + b.w / 2, Math.round(b.y + b.h / 2 - 3.5 * ts), { align: 'center', scale: ts, color: b.id === 'help' ? C.teal : C.white }); }
    if (I.stick.active) {
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(I.stick.ox, I.stick.oy, I.stickR, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(I.stick.ox + I.stick.x * I.stickR, I.stick.oy + I.stick.y * I.stickR, 8 * ts, 0, U.TAU); ctx.fill(); ctx.globalAlpha = 1;
    } else { ctx.globalAlpha = 0.25; T(ctx, 'DRAG HERE TO MOVE', w * 0.2, h - 20 * ts, { align: 'center', scale: ts }); ctx.globalAlpha = 1; }
  };

  // ---------- menus ----------
  function logo(ctx, x, y, s, t) {
    const words = ['SCHOOLIES', 'MAYHEM'];
    const cols = ['#ff4fa0', '#ffd23a', '#38e0c8', '#7c5cff'];
    words.forEach((wd, wi) => {
      const ws = s * (wi ? 1.25 : 1); let px = x - U.textWidth(wd, ws) / 2;
      for (let i = 0; i < wd.length; i++) {
        const bob = Math.round(Math.sin(t * 3 + i * 0.6 + wi) * s * 0.6);
        U.text(ctx, wd[i], px, y + wi * 10 * s + bob, { scale: ws, color: cols[(i + wi * 2) % cols.length], shadow: '#120c24' });
        U.text(ctx, wd[i], px - Math.max(1, s / 2 | 0), y + wi * 10 * s + bob - Math.max(1, s / 2 | 0), { scale: ws, color: '#fff', shadow: false });
        U.text(ctx, wd[i], px, y + wi * 10 * s + bob, { scale: ws, color: cols[(i + wi * 2) % cols.length], shadow: false });
        px += 6 * ws;
      }
    });
  }
  // a vertical menu; on a short or narrow screen it drops to the small font and moves up so every item fits above the
  // footer line
  function menuList(ctx, items, x, y, ts, idx, minY = 4 * ts, foot = 14 * ts) {
    const taps = []; const W = ctx.canvas.width, H = ctx.canvas.height;
    let s = ts * 2, row = 18 * ts;
    const widest = Math.max(...items.map(it => U.textWidth('> ' + it + ' <', ts * 2)));
    if (y + items.length * row > H - foot || widest > W - 8 * ts) { s = ts; row = 12 * ts; }
    if (I.touchMode) return touchMenu(ctx, items, x, y, ts, idx, minY, foot, s, row);
    if (y + items.length * row > H - foot) y = Math.max(minY, H - foot - items.length * row);
    if (y + items.length * row > H - foot) row = Math.max(9 * ts, (H - foot - y) / items.length); // squeeze the rows a little rather than run off the screen
    items.forEach((it, i) => {
      const sel = i === idx; const yy = y + i * row; const wdt = U.textWidth(it, s) + 16 * ts;
      if (sel) { panel(ctx, x - wdt / 2, yy - (s > ts ? 4 : 2) * ts, wdt, row + (s > ts ? 4 : 1) * ts, { fill: 'rgba(255,79,160,0.25)', edge: C.pink }); }
      T(ctx, (sel ? '> ' : '') + it + (sel ? ' <' : ''), x, yy, { align: 'center', color: sel ? C.hi : C.white, scale: s });
      taps.push({ x: x - wdt / 2, y: yy - (s > ts ? 4 : 2) * ts, w: wdt, h: row });
    });
    UI.lastMenu = { items, rects: taps }; // read by tests/mobile.mjs
    return taps;
  }
  // the same menu for fingers: every row at least 46 CSS px tall, and when they won't all fit under the heading, columns
  function touchMenu(ctx, items, x, y, ts, idx, minY, foot, s, row) {
    const W = ctx.canvas.width, H = ctx.canvas.height, n = items.length; const io = UI.inset || { dpr: 1, scale: 1 };
    row = Math.max(row, Math.ceil(46 * io.dpr / io.scale));
    if (y + n * row > H - foot) y = Math.max(minY, H - foot - n * row);
    let per = Math.max(1, Math.floor((H - foot - y) / row)); const cols = Math.ceil(n / per); per = Math.ceil(n / cols);
    if (cols > 1) s = ts;
    const colW = cols === 1 ? Math.min(W - 8 * ts, Math.max(150 * ts, ...items.map(it => U.textWidth(it, s) + 16 * ts))) : Math.floor((W - 8 * ts) / cols);
    const x0 = Math.round(x - cols * colW / 2), taps = [];
    items.forEach((it, i) => {
      const c = Math.floor(i / per), cell = { x: x0 + c * colW, y: Math.round(y + (i % per) * row), w: colW, h: row }; const sel = i === idx;
      const chars = Math.max(6, Math.floor((colW - 8 * ts) / (6 * s))); let lines = U.textWidth(it, s) <= colW - 8 * ts ? [it] : U.wrap(it, chars);
      if (lines.length > 2) lines = [lines[0], fit(lines.slice(1).join(' '), colW - 8 * ts, s)];
      if (sel) panel(ctx, cell.x + ts, cell.y + ts, cell.w - 2 * ts, cell.h - 2 * ts, { fill: 'rgba(255,79,160,0.25)', edge: C.pink });
      const lh = 9 * s / ts * ts, ty = cell.y + Math.round((row - (lines.length * lh - 2 * s)) / 2);
      lines.forEach((l, j) => T(ctx, l, cell.x + cell.w / 2, ty + j * lh, { align: 'center', color: sel ? C.hi : C.white, scale: s }));
      taps.push(cell);
    });
    UI.lastMenu = { items, rects: taps };
    return taps;
  }
  function navigate(n, idxKey) {
    if (I.consume('up')) { UI[idxKey] = (UI[idxKey] + n - 1) % n; sfx('click'); }
    if (I.consume('down')) { UI[idxKey] = (UI[idxKey] + 1) % n; sfx('click'); }
  }
  function tappedIndex(rects) { UI.lastRects = rects; const t = I.tap(); if (!t) return -1; return rects.findIndex(r => t.x >= r.x && t.y >= r.y && t.x <= r.x + r.w && t.y <= r.y + r.h); }
  const confirm = () => I.consume('confirm') || I.consume('enter') || I.consume('action');

  // footer lines, wrapped to the screen and drawn up from the bottom edge; returns the height they take
  const footer = (ctx, ts, lines) => { const w = ctx.canvas.width, h = ctx.canvas.height, n = Math.max(12, Math.floor((w - 12 * ts) / (6 * ts))); const out = lines.flatMap(l => U.wrap(l, n)); out.forEach((l, i) => T(ctx, l, w / 2, h - (out.length - i) * 9 * ts - 3 * ts, { align: 'center', color: C.dim, scale: ts })); return (out.length * 9 + 5) * ts; };
  // credits and links, in one place (the game's own repo, and bug and idea links, slot in here later)
  UI.CREDITS = {
    year: 2026, author: 'BRENT JACOBS',
    // where: 'credits' (the credits page), 'menu' (the title and pause menus); all open in a new tab
    links: [
      { id: 'osm', label: 'OPENSTREETMAP.ORG/COPYRIGHT', url: 'https://www.openstreetmap.org/copyright', where: ['credits'] },
      { id: 'site', label: 'SCHOOLIES MAYHEM ONLINE', url: 'https://br3nt.github.io/schoolies-mayhem/', where: ['credits'] },
      { id: 'repo', label: 'THE CODE ON GITHUB', url: 'https://github.com/br3nt/schoolies-mayhem', where: ['credits'] },
      { id: 'bug', label: 'REPORT A BUG', url: 'https://github.com/br3nt/schoolies-mayhem/issues/new/choose', where: ['credits', 'menu'] },
      { id: 'idea', label: 'SUGGEST AN IDEA', url: 'https://github.com/br3nt/schoolies-mayhem/discussions/categories/ideas', where: ['credits', 'menu'] },
      { id: 'project', label: 'VICTOR HARBOR ROADS PROJECT', url: 'https://br3nt.github.io/victor-harbor-roads/', where: ['credits'] },
      { id: 'blog', label: "BRENT'S BLOG", url: 'https://br3nt.github.io/', where: ['credits'] },
    ],
    // the small print, documentary-reenactment style (tweak freely)
    disclaimers: ['NAMES HAVE BEEN CHANGED TO PROTECT THE IDENTITIES AND REPUTATIONS OF THOSE INVOLVED. MERV INSISTED.', 'ANY RESEMBLANCE TO REAL GOPHERS, LIVING OR DEAD, IS PURELY COINCIDENTAL.'],
    footer: 'AN ORIGINAL GAME. NO REAL PEOPLE WERE HARMED.', // on the title screen
    build: null, // filled in by update detection later
  };
  const link = id => UI.CREDITS.links.find(l => l.id === id && l.url);
  UI.menuLinks = () => UI.CREDITS.links.filter(l => l.url && (l.where || []).includes('menu'));
  UI.openLink = l => { try { window.open(l.url, '_blank', 'noopener'); } catch (e) { /* a sandboxed frame may refuse */ } };
  UI.credits = function (ctx, ts) {
    const w = ctx.canvas.width, h = ctx.canvas.height, g = G(); backdrop(ctx, 'rgba(18,12,36,0.94)');
    T(ctx, 'CREDITS', w / 2, 8 * ts, { align: 'center', color: C.hi, scale: ts * 2 });
    const n = Math.max(12, Math.floor((w - 16 * ts) / (6 * ts))), C0 = UI.CREDITS;
    const rows = [];
    const text = (str, color = C.white) => U.wrap(str, n).forEach(l => rows.push({ str: l, color }));
    const gap = () => rows.push({ gap: true });
    text(`SCHOOLIES MAYHEM · A GAME BY ${C0.author} · ${C0.year}`, C.hi); gap();
    text('MAP DATA (C) OPENSTREETMAP CONTRIBUTORS (ODBL)'); if (link('osm')) rows.push({ link: link('osm') }); gap();
    for (const d of C0.disclaimers) { text(d, C.dim); gap(); }
    text('SOUND AND MUSIC: ORIGINAL, SYNTHESISED IN THE BROWSER', C.dim); gap();
    for (const l of C0.links) if (l.url && l.id !== 'osm' && (l.where || ['credits']).includes('credits')) rows.push({ link: l });
    gap(); text('BUILD: ' + (window.VH_BUILD || C0.build || 'DEVELOPMENT COPY'), C.dim);
    const links = rows.filter(r => r.link); UI.creditIdx = U.clamp(UI.creditIdx || 0, 0, Math.max(0, links.length - 1));
    if (links.length && I.consume('up')) { UI.creditIdx = (UI.creditIdx + links.length - 1) % links.length; sfx('click'); }
    if (links.length && I.consume('down')) { UI.creditIdx = (UI.creditIdx + 1) % links.length; sfx('click'); }
    const L = 11 * ts, LK = 14 * ts, GP = 5 * ts, top = 26 * ts, view = h - top - 22 * ts;
    for (const r of rows) if (r.link) r.lines = U.wrap(r.link.label, n - 2);
    const hOf = r => r.gap ? GP : r.link ? LK + (r.lines.length - 1) * 9 * ts : L; const total = rows.reduce((t, r) => t + hOf(r), 0);
    const cur = links[UI.creditIdx] && links[UI.creditIdx].link;
    // scroll: slowly by itself when it doesn't fit, always keeping the chosen link in view
    let y = 0, selY = 0; for (const r of rows) { if (r.link && r.link === cur) selY = y; y += hOf(r); }
    const maxS = Math.max(0, total - view); UI.creditScroll = U.clamp((UI.creditScroll || 0) + (maxS ? (g.frameDt || 0.016) * 6 * ts : 0), 0, maxS);
    if (maxS) { if (selY < UI.creditScroll) UI.creditScroll = selY; if (selY + LK > UI.creditScroll + view) UI.creditScroll = Math.min(maxS, selY + LK - view); }
    const oy = top + Math.max(0, (view - total) / 2) - UI.creditScroll; const rects = [];
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - 1 * ts, w, view + 4 * ts); ctx.clip();
    y = oy; for (const r of rows) {
      if (r.gap) { y += GP; continue; }
      if (r.link) {
        const sel = r.link === cur; const lw = Math.max(...r.lines.map(l => U.textWidth(l, ts))) + 12 * ts, lh = 13 * ts + (r.lines.length - 1) * 9 * ts;
        if (sel) panel(ctx, w / 2 - lw / 2, y - 3 * ts, lw, lh, { fill: 'rgba(255,79,160,0.25)', edge: C.pink });
        r.lines.forEach((l, i) => T(ctx, l, w / 2, y + i * 9 * ts, { align: 'center', color: sel ? C.hi : C.teal, scale: ts })); rects.push({ x: w / 2 - lw / 2, y: y - 3 * ts, w: lw, h: lh, link: r.link }); y += hOf(r); continue;
      }
      T(ctx, r.str, w / 2, y, { align: 'center', color: r.color, scale: ts }); y += L;
    }
    ctx.restore();
    const hint = I.touchMode ? 'TAP A LINK TO OPEN IT · TAP HERE TO GO BACK' : 'UP/DOWN: CHOOSE A LINK · ENTER: OPEN (NEW TAB) · ESC: BACK';
    U.wrap(hint, n).slice(0, 2).forEach((l, i, a) => T(ctx, l, w / 2, h - (a.length - i) * 9 * ts - 4 * ts, { align: 'center', color: C.pink, scale: ts }));
    const close = () => { g.state = g.prevState || 'title'; g.prevState = null; UI.creditScroll = 0; sfx('click'); };
    const t = I.tap();
    if (t) { const hit = rects.find(r => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h); if (hit) { UI.openLink(hit.link); sfx('menu'); } else if (t.y > h - 24 * ts || t.y < top) close(); return; }
    if (I.consume('back') || I.consume('pause')) return close();
    if (confirm() && cur) { UI.openLink(cur); sfx('menu'); }
  };
  UI.title = function (ctx, ts) {
    const w = ctx.canvas.width, h = ctx.canvas.height; const g = G(); const t = g.t;
    backdrop(ctx, (c, W, H) => { const grad = c.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, 'rgba(18,12,36,0.75)'); grad.addColorStop(0.5, 'rgba(18,12,36,0.25)'); grad.addColorStop(1, 'rgba(18,12,36,0.8)'); c.fillStyle = grad; c.fillRect(0, 0, W, H); });
    const s = Math.max(2, Math.floor(Math.min(w / 100, h / 60)));
    const ly = Math.round(h * 0.07);
    logo(ctx, w / 2, ly, s, t);
    fitLines(TAGLINE, w - 16 * ts, ts).forEach((l, i) => T(ctx, l, w / 2, ly + 22 * s + i * 10 * ts, { align: 'center', color: C.teal, scale: ts }));
    // returning players: straight into the last character's first unfinished night (or their week, once it's all done)
    const last = U.store.get('last', null); const lc = last && g.CHARS[last] && M().nightCount(last) ? last : null;
    const short = lc ? g.CHARS[lc].name.replace('CONSTABLE ', '') : '';
    const cont = lc ? (M().allDone(lc) ? `CONTINUE: ${short}'S WEEK` : `CONTINUE: ${short} · NIGHT ${M().firstUnfinished(lc)}` + (M().resumeAt(lc, M().firstUnfinished(lc)) ? ` · JOB ${M().resumeAt(lc, M().firstUnfinished(lc)) + 1}` : '')) : null;
    const items = [lc ? 'PLAY' : 'NEW GAME', ...(cont ? [cont] : []), 'FREE ROAM', 'SOUND: ' + (window.SFX && SFX.isMuted() ? 'OFF' : 'ON'), 'CONTROLS', 'CREDITS', ...UI.menuLinks().map(l => l.label)];
    UI.menuIdx = Math.min(UI.menuIdx, items.length - 1);
    navigate(items.length, 'menuIdx');
    const footH = footer(ctx, ts, [`(C) ${UI.CREDITS.year} ${UI.CREDITS.author} · MAP DATA (C) OPENSTREETMAP CONTRIBUTORS`, UI.CREDITS.footer]); // wrapped, so it fits a phone
    const rects = menuList(ctx, items, w / 2, Math.max(ly + 20 * s + 22 * ts, h * 0.5), ts, UI.menuIdx, ly + 20 * s + 22 * ts, footH + 4 * ts);
    const ti = tappedIndex(rects); if (ti >= 0) UI.menuIdx = ti;
    if (ti >= 0 || confirm()) {
      sfx('menu'); const it = items[UI.menuIdx];
      if (it === 'NEW GAME' || it === 'PLAY') { g.state = 'select'; UI.selIdx = Math.max(0, ['schoolie', 'grump', 'cop'].indexOf(lc)); }
      else if (it.startsWith('CONTINUE')) { if (M().allDone(lc)) g.openWeek(lc); else g.playNight(lc, M().firstUnfinished(lc)); }
      else if (it === 'FREE ROAM') g.beginRun('roam');
      else if (it.startsWith('SOUND')) { SFX.setMuted(!SFX.isMuted()); U.store.set('muted', SFX.isMuted()); }
      else if (it === 'CONTROLS') { g.state = 'help'; }
      else if (it === 'CREDITS') { g.prevState = 'title'; g.state = 'credits'; UI.creditIdx = 0; UI.creditScroll = 0; }
      else { const l = UI.menuLinks().find(q => q.label === it); if (l) UI.openLink(l); }
    }
  };
  // the controls card (title screen and pause menu): every section, two columns when there's room
  UI.help = function (ctx, ts) {
    const w = ctx.canvas.width, h = ctx.canvas.height; backdrop(ctx, 'rgba(18,12,36,0.9)');
    T(ctx, 'CONTROLS', w / 2, 8 * ts, { align: 'center', color: C.hi, scale: ts * 2 });
    const all = [CONTROLS.foot, CONTROLS.car, CONTROLS.rail, CONTROLS.heli, CONTROLS.kev, CONTROLS.evade, CONTROLS.any, CONTROLS.icons];
    const two = w >= 420 * ts; const colW = two ? Math.min(250 * ts, (w - 30 * ts) / 2) : Math.min(w - 16 * ts, 300 * ts);
    const left = two ? [all[0], all[1], all[2], all[3]] : all, right = two ? [all[4], all[5], all[6], all[7]] : [];
    const hL = UI.measureControls(ts, left, colW), hR = UI.measureControls(ts, right, colW);
    const extra = ['GOSSIP: MAYHEM FILLS THE CURTAINS. MORE CURTAINS, MORE POLICE.', 'BREAK THEIR LINE OF SIGHT AND LIE LOW TO LOSE THEM: THE LINE UNDER THE CURTAINS SAYS WHAT IS COOLING THINGS.', 'IF THEY CATCH YOU, THEY TACKLE AND CUFF: AN ARREST IS ENOUGH.', 'BUSTED? THE PADDY WAGON TAKES YOU UP THE HILL TO THE LOCK-UP.', 'NOBODY GETS HURT: PEOPLE ALWAYS JUMP OUT OF THE WAY.'];
    const x0 = two ? w / 2 - colW - 5 * ts : w / 2 - colW / 2; const y0 = 26 * ts;
    // scroll with up/down when it doesn't fit (small phones)
    const total = Math.max(hL, two ? hR : 0) + extra.length * 9 * ts + 10 * ts; const view = h - 48 * ts;
    UI.helpScroll = U.clamp((UI.helpScroll || 0) + ((I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0)) * 4 * ts - dragY(), 0, Math.max(0, total - view)); // keys, or a finger
    ctx.save(); ctx.beginPath(); ctx.rect(0, 22 * ts, w, view + 4 * ts); ctx.clip(); ctx.translate(0, -Math.round(UI.helpScroll));
    controlsTable(ctx, ts, left, x0, y0, colW); if (two) controlsTable(ctx, ts, right, w / 2 + 5 * ts, y0, colW);
    const ey = y0 + Math.max(hL, two ? hR : 0) + 2 * ts; extra.forEach((l, i) => T(ctx, l, w / 2, ey + i * 9 * ts, { align: 'center', color: C.dim, scale: ts }));
    ctx.restore();
    T(ctx, (total > view ? (I.touchMode ? 'DRAG: SCROLL   ' : 'UP/DOWN: SCROLL   ') : '') + (I.touchMode ? 'TAP TO GO BACK' : 'ENTER / ESC: BACK'), w / 2, h - 14 * ts, { align: 'center', color: C.pink, scale: ts });
    if (confirm() || (I.touchMode ? I.click() : I.tap()) || I.consume('back') || I.consume('pause')) { G().state = G().prevState || 'title'; G().prevState = null; UI.helpScroll = 0; sfx('click'); }
  };
  // character select: cards sized to their content and centred as a group; side by side when there's room,
  // stacked rows otherwise, each row as tall as its wrapped text (with shorter blurbs when space is tight)
  const SEL = {
    schoolie: { plays: 'PLAYS LIKE: ON FOOT AND IN BORROWED CARS. STEALTH, STUNTS, MAYHEM.', veh: 'hatch', col: '#38e0c8', short: 'YEAR 12 IS DONE. BECOME A SCHOOLIES LEGEND.' },
    grump: { plays: 'PLAYS LIKE: A MOBILITY SCOOTER (TURBO LATER). COMPLAINT-LETTER DROPS, SHUTTING DOWN DOOFS, PARKING A B-DOUBLE WHERE IT HURTS.', veh: 'gopher', col: '#c4372e', short: 'MERV, 81, ONE GOPHER. SHUT DOWN THE PARTY.' },
    cop: { plays: 'PLAYS LIKE: POLICE CAR AND PADDY WAGON. SIREN, SPIKES, BACKUP, CUFFS.', veh: 'police', col: '#fff', short: 'SENIOR CONSTABLE KEV. HOUND THEM ALL EQUALLY.' },
  };
  function portrait(ctx, k, cx, cy, ps, t) {
    const c = VH.Shops.look(k); const spr = SP.person(c.shirt, c.hair, 1 + Math.floor(t * 5) % 4, { hat: c.hat, sunnies: c.sunnies });
    ctx.save(); ctx.translate(Math.round(cx), Math.round(cy)); ctx.rotate(-Math.PI / 2); ctx.drawImage(spr, -6 * ps, -6 * ps, 12 * ps, 12 * ps); ctx.restore();
  }
  function vehicleIcon(ctx, k, cx, cy, ps) {
    const sd = SEL[k]; const spr = SP.vehicle(sd.veh, sd.col); const sc = Math.max(1, Math.floor(ps / 2));
    ctx.drawImage(spr, Math.round(cx - spr.width * sc / 2), Math.round(cy - spr.height * sc / 2), spr.width * sc, spr.height * sc);
  }
  UI.select = function (ctx, ts) {
    const w = ctx.canvas.width, h = ctx.canvas.height; const g = G();
    backdrop(ctx, 'rgba(18,12,36,0.72)');
    const keys = ['schoolie', 'grump', 'cop'];
    if (I.consume('left') || I.consume('up')) { UI.selIdx = (UI.selIdx + 2) % 3; sfx('click'); } if (I.consume('right') || I.consume('down')) { UI.selIdx = (UI.selIdx + 1) % 3; sfx('click'); }
    const rects = []; const wins = Object.fromEntries(keys.map(k => [k, M().allDone(k)]));
    const jobsOf = k => M().nights(k).map((n, i) => `${i + 1}: ` + n.jobs.map(j => j.title).join(' · '));
    const L = 9 * ts; const titleY = 8 * ts; const footY = h - 12 * ts;
    const premise = fitLines(PREMISE, w - 16 * ts, ts);
    const top0 = titleY + 23 * ts + premise.length * L + 3 * ts, avail = footY - 6 * ts - top0;
    const cols = w >= 420 * ts;
    if (cols) {
      const cw = Math.min(175 * ts, (w - 28 * ts) / 3); const n = Math.floor((cw - 12 * ts) / (6 * ts));
      const build = (k, lvl) => { const c = g.CHARS[k]; return { blurb: U.wrap(lvl > 2 ? SEL[k].short : c.blurb, n), plays: lvl > 1 ? [] : U.wrap(SEL[k].plays, n), jobs: lvl > 0 ? [] : jobsOf(k).flatMap(j => U.wrap(j, n)) }; };
      const heightOf = b => 62 * ts + (b.blurb.length) * L + (b.plays.length ? b.plays.length * L + 5 * ts : 0) + (b.jobs.length ? (b.jobs.length + 1) * L + 5 * ts : 0) + 8 * ts;
      let lvl = 0, blocks, ch; for (; lvl <= 3; lvl++) { blocks = keys.map(k => build(k, lvl)); ch = Math.max(...blocks.map(heightOf)); if (ch <= avail) break; }
      ch = Math.min(ch, avail); const y = Math.round(top0 + Math.max(0, (avail - ch) / 2));
      const ps = Math.max(2, Math.min(4 * ts, Math.floor(cw / 40)));
      keys.forEach((k, i) => {
        const c = g.CHARS[k], b = blocks[i]; const x = Math.round(w / 2 - (cw * 3 + 12 * ts) / 2 + i * (cw + 6 * ts)); const sel = i === UI.selIdx;
        panel(ctx, x, y, cw, ch, { accent: sel ? C.pink : C.edge, edge: sel ? C.pink : C.edge, fill: sel ? 'rgba(40,20,70,0.94)' : C.panel }); rects.push({ x, y, w: cw, h: ch });
        portrait(ctx, k, x + cw / 2 - 16 * ts, y + 24 * ts, ps, g.t); vehicleIcon(ctx, k, x + cw / 2 + 20 * ts, y + 24 * ts, ps);
        let yy = y + 44 * ts;
        T(ctx, c.title, x + cw / 2, yy, { align: 'center', color: sel ? C.hi : C.white, scale: ts }); yy += 10 * ts;
        T(ctx, c.name + (wins[k] ? ' (BEATEN)' : ''), x + cw / 2, yy, { align: 'center', color: C.teal, scale: ts }); yy += 12 * ts;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch - 3 * ts); ctx.clip();
        for (const l of b.blurb) { T(ctx, l, x + 6 * ts, yy, { color: C.dim, scale: ts }); yy += L; }
        if (b.plays.length) { yy += 5 * ts; for (const l of b.plays) { T(ctx, l, x + 6 * ts, yy, { color: C.teal, scale: ts }); yy += L; } }
        if (b.jobs.length) { yy += 5 * ts; T(ctx, 'NIGHTS:', x + 6 * ts, yy, { color: C.hi, scale: ts }); yy += L; for (const l of b.jobs) { T(ctx, l, x + 6 * ts, yy, { color: C.white, scale: ts }); yy += L; } }
        ctx.restore();
      });
    } else {
      const rw = w - 12 * ts; const tx = 50 * ts; const n = Math.floor((rw - tx - 6 * ts) / (6 * ts));
      const build = (k, lvl) => ({ blurb: U.wrap(lvl > 1 ? SEL[k].short : g.CHARS[k].blurb, n), plays: lvl > 0 ? [] : U.wrap(SEL[k].plays, n) });
      const heightOf = b => Math.max(46 * ts, 18 * ts + (b.blurb.length + b.plays.length) * L + (b.plays.length ? 3 * ts : 0) + 4 * ts);
      let lvl = 0, blocks, hs; for (; lvl <= 2; lvl++) { blocks = keys.map(k => build(k, lvl)); hs = blocks.map(heightOf); if (hs.reduce((a, b) => a + b, 0) + 8 * ts <= avail) break; }
      const total = hs.reduce((a, b) => a + b, 0) + 8 * ts; let y = Math.round(top0 + Math.max(0, (avail - total) / 2));
      const ps = Math.max(2, Math.min(3 * ts, Math.floor((Math.min(...hs) - 8 * ts) / 14)));
      keys.forEach((k, i) => {
        const c = g.CHARS[k], b = blocks[i], rh = hs[i]; const x = 6 * ts; const sel = i === UI.selIdx;
        panel(ctx, x, y, rw, rh, { accent: sel ? C.pink : C.edge, edge: sel ? C.pink : C.edge, fill: sel ? 'rgba(40,20,70,0.94)' : C.panel }); rects.push({ x, y, w: rw, h: rh });
        portrait(ctx, k, x + 22 * ts, y + rh / 2, ps, g.t);
        let yy = y + 5 * ts;
        T(ctx, fit(c.name.replace('CONSTABLE ', '') + ' · ' + c.title + (wins[k] ? ' (BEATEN)' : ''), rw - tx - 4 * ts, ts), x + tx, yy, { color: sel ? C.hi : C.white, scale: ts }); yy += 12 * ts;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, rw, rh - 2); ctx.clip();
        for (const l of b.blurb) { T(ctx, l, x + tx, yy, { color: C.dim, scale: ts }); yy += L; }
        if (b.plays.length) { yy += 3 * ts; for (const l of b.plays) { T(ctx, l, x + tx, yy, { color: C.teal, scale: ts }); yy += L; } }
        ctx.restore();
        y += rh + 4 * ts;
      });
    }
    const pickSc = U.textWidth('PICK YOUR PLAYER', ts * 2) <= w - 16 * ts ? ts * 2 : Math.max(ts, Math.floor(ts * 1.5));
    T(ctx, 'PICK YOUR PLAYER', w / 2, titleY, { align: 'center', color: C.hi, scale: pickSc });
    premise.forEach((l, i) => T(ctx, l, w / 2, titleY + 23 * ts + i * L, { align: 'center', color: C.teal, scale: ts }));
    const ti = tappedIndex(rects);
    if (ti >= 0 && ti === UI.selIdx || confirm()) { sfx('menu'); g.openWeek(keys[UI.selIdx]); }
    else if (ti >= 0) { UI.selIdx = ti; sfx('click'); }
    if (I.consume('back') || I.consume('pause')) { g.state = 'title'; }
    T(ctx, I.touchMode ? 'TAP A CARD, TAP AGAIN TO PLAY' : 'ARROWS / WASD TO CHOOSE, ENTER TO PLAY', w / 2, footY, { align: 'center', color: C.dim, scale: ts });
  };
  // ---------- the week: one card per night; a night unlocks when the one before it is finished ----------
  const glyph = (ctx, rows, x, y, s, col) => { ctx.fillStyle = col; rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(Math.round(x + i * s), Math.round(y + j * s), s, s); }); };
  const TICK = ['......#', '.....#.', '#...#..', '.#.#...', '..#....'];
  const PADLOCK = ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'];
  const STAR = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];
  UI.drawStar = (ctx, x, y, s, on) => glyph(ctx, STAR, x, y, s, on ? C.hi : '#4a3f6e');
  const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;
  UI.fmtTime = fmtTime;
  UI.week = function (ctx, ts) {
    if (UI.weekPick) { const k0 = UI.weekChar || 'schoolie'; return UI.weekNightMenu(ctx, ts, k0); }
    const w = ctx.canvas.width, h = ctx.canvas.height; const g = G(), m = M(); const k = UI.weekChar || 'schoolie'; const c = g.CHARS[k];
    backdrop(ctx, 'rgba(18,12,36,0.8)');
    const items = [...m.nights(k).map((nt, i) => ({ n: i + 1, nt })), { roam: true }]; const N = items.length;
    UI.weekIdx = U.clamp(UI.weekIdx || 0, 0, N - 1);
    if (I.consume('left') || I.consume('up')) { UI.weekIdx = (UI.weekIdx + N - 1) % N; sfx('click'); }
    if (I.consume('right') || I.consume('down')) { UI.weekIdx = (UI.weekIdx + 1) % N; sfx('click'); }
    const next = m.firstUnfinished(k), allDone = m.allDone(k);
    T(ctx, 'SCHOOLIES WEEK', w / 2, 8 * ts, { align: 'center', color: C.hi, scale: ts * 2 });
    T(ctx, c.name + ' · ' + c.title + (allDone ? ' · WEEK DONE!' : ''), w / 2, 27 * ts, { align: 'center', color: allDone ? C.green : C.teal, scale: ts });
    const L = 9 * ts; const top0 = 40 * ts, footY = h - 13 * ts, avail = footY - 6 * ts - top0;
    // what each card says, wrapped to a width
    const content = (it, chars) => {
      const out = []; const add = (s, col, extra = {}) => U.wrap(s, chars).forEach(l => out.push({ s: l, col, ...extra }));
      if (it.roam) { add('FREE ROAM', C.hi); add('ALWAYS OPEN', C.green); add('NO JOBS, NO CLOCK. T CHANGES THE TIME OF DAY.', C.dim); return out; }
      const rec = m.record(k, it.n) || {}; const open = m.unlocked(k, it.n);
      add('NIGHT ' + it.n, open ? C.hi : C.dim); add(m.dayName(it.n, k) + (it.nt.title ? ': ' + it.nt.title : ''), open ? C.white : '#6a5f8e');
      out.push({ gap: 4 });
      it.nt.jobs.forEach((j, ji) => { const ok = m.jobDone(k, it.n, ji); U.wrap(j.title, chars - 2).forEach((l, li) => out.push({ s: l, col: open ? (ok ? C.green : C.white) : '#6a5f8e', tick: li === 0 ? ok : null, ind: true })); });
      out.push({ gap: 4 });
      if (!open) { out.push({ lock: true }); add('FINISH NIGHT ' + (it.n - 1) + ' FIRST', '#8a7fae'); }
      else if (rec.done) { out.push({ star: !!rec.clean, s: 'DONE', col: C.green }); if (rec.best) add('BEST TIME ' + fmtTime(rec.best), C.white); if (rec.cash != null) add('BEST TAKINGS $' + rec.cash, C.white); add(rec.clean ? (k === 'cop' ? 'STAR: NO CALLS FROM SARGE' : 'STAR: NO BUSTS') : (k === 'cop' ? 'NO SARGE CALLS FOR THE STAR' : 'NO BUSTS FOR THE STAR'), rec.clean ? C.hi : C.dim); }
      else add(it.n === next ? 'UP NEXT' : 'NOT PLAYED YET', it.n === next ? C.pink : C.dim);
      return out;
    };
    const lineH = l => l.gap ? l.gap * ts : l.lock ? 17 * ts : l.star != null ? 10 * ts : L;
    const blockH = ls => ls.reduce((a, l) => a + lineH(l), 0);
    const drawLines = (ls, x, y, cw) => { let yy = y; for (const l of ls) { if (l.lock) { glyph(ctx, PADLOCK, x, yy, 2 * ts, '#b0a6d0'); T(ctx, 'LOCKED', x + 14 * ts, yy + 4 * ts, { color: '#b0a6d0', scale: ts }); } else if (l.star != null) { UI.drawStar(ctx, x, yy, ts, l.star); T(ctx, l.s, x + 10 * ts, yy, { color: l.col, scale: ts }); } else if (l.ind) { if (l.tick) glyph(ctx, TICK, x, yy + ts, ts, C.green); else if (l.tick === false) T(ctx, '·', x, yy, { color: l.col, scale: ts }); T(ctx, l.s, x + 10 * ts, yy, { color: l.col, scale: ts }); } else if (l.s != null) T(ctx, l.s, x, yy, { color: l.col, scale: ts }); yy += lineH(l); } };
    const rects = []; const gap = 6 * ts;
    const cols = w >= N * 92 * ts + (N - 1) * gap + 12 * ts;
    if (cols) {
      // a wall calendar: a page per night, side by side
      const cw = Math.floor(Math.min(150 * ts, (w - 12 * ts - (N - 1) * gap) / N)); const chars = Math.floor((cw - 12 * ts) / (6 * ts));
      const blocks = items.map(it => content(it, chars)); const ch = Math.min(avail, Math.max(...blocks.map(blockH)) + 16 * ts);
      const x0 = Math.round(w / 2 - (N * cw + (N - 1) * gap) / 2), y = Math.round(top0 + Math.max(0, (avail - ch) / 2));
      items.forEach((it, i) => {
        const x = x0 + i * (cw + gap), sel = i === UI.weekIdx, open = it.roam || m.unlocked(k, it.n);
        panel(ctx, x, y, cw, ch, { accent: sel ? C.pink : open ? C.teal : C.edge, edge: sel ? C.pink : C.edge, fill: sel ? 'rgba(40,20,70,0.95)' : open ? C.panel : 'rgba(28,24,40,0.9)' });
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch - 2); ctx.clip(); drawLines(blocks[i], x + 6 * ts, y + 8 * ts, cw); ctx.restore();
        rects.push({ x, y, w: cw, h: ch });
      });
    } else {
      // a diary: one row per night, scrolled to keep the selected one in view
      const rw = Math.min(w - 12 * ts, 320 * ts); const chars = Math.floor((rw - 14 * ts) / (6 * ts));
      const blocks = items.map(it => content(it, chars)); const hs = blocks.map(b => blockH(b) + 12 * ts);
      const total = hs.reduce((a, b) => a + b + 4 * ts, 0); const ys = []; let acc = 0; for (const hh of hs) { ys.push(acc); acc += hh + 4 * ts; }
      const selTop = ys[UI.weekIdx], selBot = selTop + hs[UI.weekIdx];
      let sc = UI.weekScroll || 0; if (selTop - sc < 0) sc = selTop; if (selBot - sc > avail) sc = selBot - avail; UI.weekScroll = sc = U.clamp(sc, 0, Math.max(0, total - avail));
      const x = Math.round(w / 2 - rw / 2), y0 = Math.round(top0 + Math.max(0, (avail - total) / 2)) - sc;
      ctx.save(); ctx.beginPath(); ctx.rect(0, top0 - 2 * ts, w, avail + 4 * ts); ctx.clip();
      items.forEach((it, i) => {
        const y = y0 + ys[i], rh = hs[i], sel = i === UI.weekIdx, open = it.roam || m.unlocked(k, it.n);
        panel(ctx, x, y, rw, rh, { accent: sel ? C.pink : open ? C.teal : C.edge, edge: sel ? C.pink : C.edge, fill: sel ? 'rgba(40,20,70,0.95)' : open ? C.panel : 'rgba(28,24,40,0.9)' });
        drawLines(blocks[i], x + 7 * ts, y + 6 * ts, rw); rects.push({ x, y, w: rw, h: rh });
      });
      ctx.restore();
      if (total > avail) { T(ctx, sc > 0 ? '^' : ' ', w - 8 * ts, top0, { color: C.dim, scale: ts }); T(ctx, sc < total - avail ? '`' : ' ', w - 8 * ts, footY - 12 * ts, { color: C.dim, scale: ts }); }
    }
    if (UI.weekMsg && UI.weekMsg.t > 0) { UI.weekMsg.t -= g.frameDt || 0.016; const s = UI.weekMsg.str; const bw = U.textWidth(s, ts) + 12 * ts; panel(ctx, w / 2 - bw / 2, footY - 22 * ts, bw, 14 * ts, { accent: C.red, fill: 'rgba(48,18,30,0.95)' }); T(ctx, s, w / 2, footY - 18 * ts, { align: 'center', color: C.white, scale: ts }); }
    T(ctx, I.touchMode ? 'TAP A NIGHT, TAP AGAIN TO PLAY' : 'ARROWS: CHOOSE   ENTER: PLAY   ESC: BACK', w / 2, footY, { align: 'center', color: C.dim, scale: ts });
    const ti = tappedIndex(rects); let go = false;
    if (ti >= 0 && ti === UI.weekIdx) go = true; else if (ti >= 0) { UI.weekIdx = ti; sfx('click'); }
    if (confirm()) go = true;
    if (go) {
      const it = items[UI.weekIdx];
      if (it.roam) { sfx('menu'); g.beginRun('roam'); }
      else if (m.unlocked(k, it.n)) { sfx('menu'); const any = it.nt.jobs.some((j, ji) => m.jobDone(k, it.n, ji)); if (any) { UI.weekPick = it.n; UI.endIdx = 0; } else g.playNight(k, it.n); }
      else { sfx('fail'); UI.weekMsg = { str: 'LOCKED: FINISH NIGHT ' + (it.n - 1) + ' FIRST', t: 2 }; }
    }
    if (I.consume('back') || I.consume('pause')) { g.state = 'select'; UI.selIdx = Math.max(0, ['schoolie', 'grump', 'cop'].indexOf(k)); sfx('click'); }
  };
  // a night with some jobs done: carry on from the next job, start the night again, or replay one job on its own
  UI.weekNightMenu = function (ctx, ts, k) {
    const g = G(), m = M(), n = UI.weekPick, nt = m.nightOf(k, n); const w = ctx.canvas.width, h = ctx.canvas.height; const at = m.resumeAt(k, n);
    const opts = [...(at > 0 ? [{ lab: `CARRY ON: JOB ${at + 1}, ${nt.jobs[at].title}`, go: () => g.playNight(k, n) }] : []), { lab: 'THE WHOLE NIGHT FROM THE START', go: () => g.playNight(k, n, { fromStart: true }) },
      ...nt.jobs.map((j, ji) => ({ j, ji })).filter(o => m.jobDone(k, n, o.ji)).map(o => ({ lab: 'REPLAY JUST ' + o.j.title, go: () => g.playNight(k, n, { only: o.ji }) })), { lab: 'BACK', go: () => { UI.weekPick = null; } }];
    backdrop(ctx, 'rgba(18,12,36,0.86)'); const tsz = Math.min(ts * 2, Math.max(ts, Math.floor((w - 10) / ((`NIGHT ${n}: ${m.dayName(n, k)}`).length * 6))));
    T(ctx, `NIGHT ${n}: ${m.dayName(n, k)}`, w / 2, h * 0.16, { align: 'center', color: C.hi, scale: tsz });
    const labs = opts.map(o => UI.fit(o.lab, w - 30 * ts, ts * 2) === o.lab ? o.lab : UI.fit(o.lab, w - 30 * ts, ts * 2));
    UI.endIdx = Math.min(UI.endIdx || 0, opts.length - 1); navigate(opts.length, 'endIdx');
    const rects = menuList(ctx, labs, w / 2, h * 0.16 + 30 * ts, ts, UI.endIdx); const ti = tappedIndex(rects); if (ti >= 0) UI.endIdx = ti;
    if (ti >= 0 || confirm()) { sfx('menu'); const o = opts[UI.endIdx]; UI.endIdx = 0; o.go(); if (o.lab !== 'BACK') UI.weekPick = null; }
    if (I.consume('back') || I.consume('pause')) { UI.weekPick = null; sfx('click'); }
  };
  // the phone-style job brief
  UI.brief = function (ctx, ts) {
    const w = ctx.canvas.width, h = ctx.canvas.height; const g = G(); const j = M().job;
    backdrop(ctx, 'rgba(18,12,36,0.55)');
    const pw = Math.min(w - 16 * ts, 230 * ts);
    const txt = j ? (I.touchMode ? j.brief.replace(/SPACE/g, 'ACT').replace(/\(H\)/g, '(HORN)').replace(/SHIFT/g, 'BOOST') : j.brief) : '';
    const lines = j ? U.wrap(txt, Math.floor((pw - 24 * ts) / (6 * ts))) : [];
    // the night's header over the phone: big when it fits, otherwise small and wrapped to the screen
    const nt = g.briefNight && M().nightOf(g.char, g.night); const hd = !g.briefNight ? '' : g.char === 'roam' ? 'FREE ROAM' : `NIGHT ${g.night}: ${M().dayName(g.night)}` + (nt && nt.title ? ' · ' + nt.title : '');
    const hBig = U.textWidth(hd, ts * 2) <= w - 8 * ts; const hLines = !hd ? [] : hBig ? [hd] : fitLines(hd, w - 8 * ts, ts);
    const headH = !hd ? 0 : hBig ? 26 * ts : hLines.length * 9 * ts + 8 * ts;
    const ph = 60 * ts + lines.length * 10 * ts + headH; const x = w / 2 - pw / 2, y = Math.max(6 * ts, h / 2 - ph / 2);
    hLines.forEach((l, i) => T(ctx, l, w / 2, y + i * 9 * ts, { align: 'center', color: C.hi, scale: hBig ? ts * 2 : ts }));
    const py = y + headH;
    // phone
    panel(ctx, x, py, pw, ph - headH, { fill: '#1d2a22', edge: '#6a8a70', accent: '#9be15d' });
    ctx.fillStyle = '#9bbc6a'; ctx.fillRect(x + 6 * ts, py + 6 * ts, pw - 12 * ts, ph - headH - 22 * ts);
    const ink = '#1d2a12';
    if (j) {
      T(ctx, fit((g.reviewBrief ? 'CURRENT JOB · ' : 'NEW MSG · ') + 'FROM: ' + j.from, pw - 20 * ts, ts), x + 10 * ts, py + 10 * ts, { color: ink, scale: ts, shadow: false });
      T(ctx, fit(j.title + '  (+$' + j.pay + ')', pw - 20 * ts, ts), x + 10 * ts, py + 22 * ts, { color: '#3a1a5a', scale: ts, shadow: false });
      lines.forEach((l, i) => T(ctx, l, x + 10 * ts, py + 36 * ts + i * 10 * ts, { color: ink, scale: ts, shadow: false }));
    } else T(ctx, 'NO JOBS TONIGHT. GO NUTS.', x + 10 * ts, py + 20 * ts, { color: ink, scale: ts, shadow: false });
    if (Math.floor(g.t * 2) % 2 || g.reviewBrief) T(ctx, g.reviewBrief ? (I.touchMode ? 'TAP TO CARRY ON' : 'ENTER OR J: CARRY ON') : I.touchMode ? 'TAP TO GO' : 'PRESS ENTER', w / 2, py + ph - headH - 13 * ts, { align: 'center', color: '#9be15d', scale: ts });
    // only Enter, a tap or J closes it, after a short beat, so a key held while driving can't skip a new job
    const close = I.consume('confirm') || I.consume('job') || I.tap() || I.consume('pause') || I.consume('back');
    I.consume('enter'); I.consume('action');
    if ((g.stateT || 0) > 0.8 && close) {
      sfx('sms'); g.briefNight = false; g.state = 'play';
      if (g.reviewBrief) g.reviewBrief = false; else { M().startJob(); g.objFlash = 3; }
    }
  };
  UI.pause = function (ctx, ts) {
    const w = ctx.canvas.width, h = ctx.canvas.height; const g = G();
    backdrop(ctx, 'rgba(18,12,36,0.7)');
    const resume = () => { g.state = 'play'; g.autoPaused = false; UI.pauseAsk = null; };
    // paused because the game lost focus (another tab, a click outside the frame): any click or tap carries on
    if (g.autoPaused) {
      const s = I.touchMode ? 'PAUSED · TAP TO CONTINUE' : 'PAUSED · CLICK OR TAP TO CONTINUE'; const sc = U.textWidth(s, ts * 2) < w - 16 * ts ? ts * 2 : ts;
      T(ctx, s, w / 2, h * 0.45, { align: 'center', color: Math.floor(g.t * 2) % 2 ? C.hi : C.white, scale: sc });
      T(ctx, 'THE GAME PAUSES ITSELF WHEN IT LOSES FOCUS', w / 2, h * 0.45 + 22 * ts, { align: 'center', color: C.dim, scale: ts });
      if (I.click() || I.consume('confirm') || I.consume('pause') || I.consume('enter') || I.consume('action')) { resume(); sfx('click'); }
      return;
    }
    // a phone on its side (touch, not much height): a smaller heading and at most two objective lines, so the
    // finger-sized rows have room
    const compact = I.touchMode && h < 300 * ts; const hy = compact ? 6 * ts : h * 0.18, iy = compact ? hy + 18 * ts : h * 0.18 + 28 * ts;
    T(ctx, 'PAUSED', w / 2, hy, { align: 'center', color: C.hi, scale: compact ? ts * 2 : ts * 3 });
    const live = g.char !== 'roam';
    const items = UI.pauseAsk ? [UI.pauseAsk + ': YES', 'NO, CARRY ON'] : ['RESUME', ...(live && M().job ? ['RESTART JOB'] : []), ...(live ? ['RESTART NIGHT'] : []), 'CONTROLS', 'WALKING: ' + (g.walkMode === 'screen' ? 'SCREEN DIRECTION' : 'LIKE A CAR'), 'SOUND: ' + (window.SFX && SFX.isMuted() ? 'OFF' : 'ON'), ...(live ? ['SCHOOLIES WEEK'] : []), 'QUIT TO TITLE', 'CREDITS', ...UI.menuLinks().map(l => l.label)];
    const job = M().job; const wrapN = Math.floor((w - 20 * ts) / (6 * ts)); let infoH = 0;
    if (UI.pauseAsk) { const q = U.wrap(UI.pauseAsk === 'RESTART JOB' ? 'START ' + (job ? job.title : 'THE JOB') + ' AGAIN FROM THE TOP?' : `START NIGHT ${g.night} AGAIN FROM THE FIRST JOB?`, wrapN); q.forEach((l, i) => T(ctx, l, w / 2, iy + i * 9 * ts, { align: 'center', color: C.white, scale: ts })); infoH = q.length * 9 * ts; }
    else if (job && job.started) { T(ctx, fit('JOB: ' + job.title, w - 20 * ts, ts), w / 2, iy, { align: 'center', color: C.white, scale: ts }); let ol = U.wrap(M().objective(), wrapN); if (compact && ol.length > 2) ol = [ol[0], fit(ol.slice(1).join(' '), w - 20 * ts, ts)]; ol.forEach((l, i) => T(ctx, l, w / 2, iy + 11 * ts + i * 9 * ts, { align: 'center', color: C.hi, scale: ts })); infoH = 11 * ts + ol.length * 9 * ts; }
    navigate(items.length, 'menuIdx'); UI.menuIdx = Math.min(UI.menuIdx, items.length - 1);
    const top = compact ? iy + infoH + 6 * ts : h * 0.18 + 60 * ts;
    const rects = menuList(ctx, items, w / 2, compact ? top : Math.max(Math.min(h * 0.4, h - items.length * 18 * ts - 10 * ts), top), ts, UI.menuIdx, top); const ti = tappedIndex(rects); if (ti >= 0) UI.menuIdx = ti;
    if (I.consume('pause')) { if (UI.pauseAsk) { UI.pauseAsk = null; UI.menuIdx = 0; } else resume(); return; }
    if (ti >= 0 || confirm()) {
      sfx('menu'); const it = items[UI.menuIdx];
      if (UI.pauseAsk) { const ask = UI.pauseAsk; UI.pauseAsk = null; UI.menuIdx = 0; if (it.endsWith(': YES')) { if (ask === 'RESTART JOB') M().restartJob(); else M().restartNight(); } return; }
      if (it === 'RESUME') resume(); else if (it === 'CONTROLS') { g.prevState = 'pause'; g.state = 'help'; }
      else if (it === 'RESTART JOB' || it === 'RESTART NIGHT') { UI.pauseAsk = it; UI.menuIdx = 1; }
      else if (it.startsWith('WALKING')) { g.walkMode = g.walkMode === 'screen' ? 'car' : 'screen'; U.store.set('walk', g.walkMode); }
      else if (it.startsWith('SOUND')) { SFX.setMuted(!SFX.isMuted()); U.store.set('muted', SFX.isMuted()); }
      else if (it === 'CREDITS') { g.prevState = 'pause'; g.state = 'credits'; UI.creditIdx = 0; UI.creditScroll = 0; }
      else if (it === 'SCHOOLIES WEEK') { M().abandonNight(); g.openWeek(g.char, g.night); } else if (it === 'QUIT TO TITLE') { M().abandonNight(); g.toTitle(); }
      else { const l = UI.menuLinks().find(q => q.label === it); if (l) UI.openLink(l); } // a new tab: the game stays as it is
    }
  };
  function card(ctx, ts, title, col, lines, foot) {
    const w = ctx.canvas.width, h = ctx.canvas.height; backdrop(ctx, 'rgba(18,12,36,0.78)');
    const tsz = Math.max(ts * 2, Math.min(ts * 3, Math.floor((w - 10) / (title.length * 6))));
    T(ctx, title, w / 2, h * 0.16, { align: 'center', color: col, scale: tsz });
    lines.forEach((l, i) => T(ctx, l, w / 2, h * 0.16 + 32 * ts + i * 11 * ts, { align: 'center', color: i === 0 ? C.white : C.dim, scale: ts }));
    if (foot && Math.floor(G().t * 2) % 2) T(ctx, foot, w / 2, h - 22 * ts, { align: 'center', color: C.pink, scale: ts });
    return h * 0.16 + 32 * ts + lines.length * 11 * ts;
  }
  const statLines = () => { const s = G().stats; return [`STUFF KNOCKED OVER: ${s.smashed}`, `PEOPLE WHO JUMPED OUT OF THE WAY: ${s.dives}`, `VEHICLES BORROWED: ${s.stolen}`, `TYRE MARKS: ${Math.round(s.tracks)}M`, `DISTANCE: ${(s.distance / 1000).toFixed(1)}KM`, `TRIPS UP THE HILL: ${s.busted}`, `CASH: $${Math.round(G().cash)}`]; };
  // in the back of the paddy wagon: letterbox bars, a caption, and a skip
  UI.ride = function (ctx, ts) {
    const w = ctx.canvas.width, h = ctx.canvas.height; const r = VH.Lockup.ride; if (!r) return;
    const bar = Math.round(h * 0.11);
    backdrop(ctx, (c, W, H, y) => { c.fillStyle = '#000'; c.fillRect(0, 0, W, y(bar)); c.fillRect(0, y(h - bar), W, H - y(h - bar)); if (r.fade > 0) { c.fillStyle = `rgba(0,0,0,${r.fade})`; c.fillRect(0, y(bar), W, y(h - bar) - y(bar)); } });
    if (r.phase === 'load') { const s = Math.max(ts * 3, Math.min(ts * 5, Math.floor(w / 60))); T(ctx, 'BUSTED!', w / 2, h * 0.38, { align: 'center', color: '#ff6a5a', scale: s }); T(ctx, 'INTO THE BACK OF THE PADDY WAGON WITH YOU', w / 2, h * 0.38 + 10 * s, { align: 'center', color: C.white, scale: ts }); }
    T(ctx, r.phase === 'arrive' ? 'WELCOME TO ' + VH.Lockup.NAME : 'OFF UP THE HILL TO ' + VH.Lockup.NAME + '...', w / 2, Math.round(bar / 2 - 3 * ts), { align: 'center', color: C.hi, scale: ts });
    T(ctx, I.touchMode ? 'TAP TO SKIP' : 'ENTER: SKIP', w - 6 * ts, h - bar / 2 - 3 * ts, { align: 'right', color: C.dim, scale: ts });
    if (I.consume('confirm') || I.tap() || I.consume('pause')) VH.Lockup.skipRide();
  };
  UI.lockedUp = function (ctx, ts) {
    const b = G().bustInfo || {}; const wrapN = Math.floor(ctx.canvas.width / (6 * ts)) - 4;
    card(ctx, ts, 'LOCKED UP', '#7fa6ff', ['A SHORT STAY AT ' + VH.Lockup.NAME + '.', '', ...U.wrap('THE SERGEANT: "' + b.line + '"', wrapN), '', `FINE: $${b.fine} (DONATED TO THE FOOTY CLUB)`, "YOU'RE LET OUT AT THE GATE. THE JOB STARTS OVER."], 'PRESS ENTER / TAP');
    if (G().stateT > 1 && (I.consume('confirm') || I.tap() || I.consume('pause'))) G().afterBust();
  };
  // end-of-night cards: the record, then a choice (the next night, or back to the week)
  const recordLines = () => {
    const r = M().lastRecord; if (!r) return [];
    const k = G().char; const out = [`TIME: ${fmtTime(r.time)}` + (r.newBest ? ' (NEW BEST!)' : ''), `TAKINGS: $${r.cash}`];
    out.push(r.clean ? (k === 'cop' ? '* STAR: NOT ONE CALL FROM SARGE' : '* STAR: NOT BUSTED ONCE') : (k === 'cop' ? 'NO STAR: SARGE RANG' : 'NO STAR: YOU GOT BUSTED'));
    if (r.unlocked) out.push(`NIGHT ${r.unlocked} (${M().dayName(r.unlocked)}) UNLOCKED`);
    return out;
  };
  function endMenu(ctx, ts, items, y) {
    const h = ctx.canvas.height, w = ctx.canvas.width; UI.endIdx = Math.min(UI.endIdx || 0, items.length - 1);
    navigate(items.length, 'endIdx');
    const yy = Math.min(Math.max(y + 8 * ts, h - (items.length * 18 + 14) * ts), h - (items.length * 18 + 6) * ts);
    const rects = menuList(ctx, items, w / 2, yy, ts, UI.endIdx); const ti = tappedIndex(rects); if (ti >= 0) UI.endIdx = ti;
    const back = I.consume('back') || I.consume('pause');
    if (G().stateT <= 1) return -1;
    if (back) return items.length - 1;
    return ti >= 0 || confirm() ? UI.endIdx : -1;
  }
  UI.nightEnd = function (ctx, ts) {
    const g = G(); const s = g.stats; const n = g.night;
    const y = card(ctx, ts, `NIGHT ${n} DONE`, C.green, ['YOU STAGGER HOME AS THE SKY GOES GREY.', '', ...recordLines(), '', `STUFF KNOCKED OVER: ${s.smashed}   BORROWED: ${s.stolen}`, `CASH: $${Math.round(g.cash)}`], '');
    const pick = endMenu(ctx, ts, [`NIGHT ${n + 1}: ${M().dayName(n + 1)}`, 'SCHOOLIES WEEK'], y);
    if (pick === 0) { sfx('menu'); UI.endIdx = 0; M().toNight(n + 1); } else if (pick === 1) { sfx('click'); UI.endIdx = 0; g.openWeek(g.char, n + 1); }
  };
  UI.sunrise = function (ctx, ts) {
    const g = G();
    const y = card(ctx, ts, "SUN'S UP", C.hi, ["THE BIRDS ARE OUT, THE PARTY'S OVER, AND", "YOU DIDN'T GET IT ALL DONE.", '', 'TRY THE NIGHT AGAIN.'], '');
    const pick = endMenu(ctx, ts, ['TRY AGAIN', 'SCHOOLIES WEEK'], y);
    if (pick === 0) { sfx('menu'); UI.endIdx = 0; g.playNight(g.char, g.night); } else if (pick === 1) { sfx('click'); UI.endIdx = 0; g.openWeek(g.char, g.night); }
  };
  UI.win = function (ctx, ts) {
    const g = G(); const w = M().winFor(g.char); const wrapN = Math.floor(ctx.canvas.width / (6 * ts)) - 4;
    if (Math.random() < 0.3) FX.confetti(g.player.x + U.rand(-20, 20), g.player.y - 10, 4);
    card(ctx, ts, w.title, C.pink, [...U.wrap(w.text, wrapN), '', ...recordLines(), '', ...statLines()], I.touchMode ? 'TAP FOR THE WEEK' : 'ENTER: BACK TO THE WEEK');
    if (g.stateT > 2 && (confirm() || I.tap())) g.openWeek(g.char, g.night);
  };
  // a job that can't be finished: say why, and offer the ways out
  UI.deadEnd = function (ctx, ts) {
    const g = G(), d = M().deadEnd || { thing: 'SOMETHING', job: '' };
    const y = card(ctx, ts, "JOB CAN'T BE FINISHED", C.red, [`YOU LOST ${d.thing}.`, d.job ? `(${d.job})` : '', 'START IT AGAIN, OR THE NIGHT, OR CARRY ON IN FREE PLAY.'], '');
    const pick = endMenu(ctx, ts, ['RESTART JOB', 'RESTART NIGHT', 'KEEP PLAYING'], y);
    if (pick === 0) { UI.endIdx = 0; M().restartJob(); } else if (pick === 1) { UI.endIdx = 0; M().restartNight(); } else if (pick === 2) { UI.endIdx = 0; g.state = 'play'; g.toast("FREE PLAY. PAUSE MENU: RESTART JOB OR RESTART NIGHT WHEN YOU'RE READY", '#9fd4ec'); }
  };
  UI.loading = function (ctx, ts, p, msg) {
    const w = ctx.canvas.width, h = ctx.canvas.height; backdrop(ctx, '#120c24');
    logo(ctx, w / 2, h * 0.2, Math.max(2, Math.floor(Math.min(w / 100, h / 60))), performance.now() / 1000);
    const bw = Math.min(w - 40, 200 * ts); panel(ctx, w / 2 - bw / 2, h * 0.68, bw, 10 * ts); ctx.fillStyle = C.pink; ctx.fillRect(w / 2 - bw / 2 + 2, h * 0.68 + 2, (bw - 4) * p, 10 * ts - 4);
    T(ctx, (msg || '').toUpperCase(), w / 2, h * 0.68 + 16 * ts, { align: 'center', color: C.dim, scale: ts });
  };
})(window.VH);
