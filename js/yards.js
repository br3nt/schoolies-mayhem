// Backyards. Every house with room behind it (a baked 'backyard' slot: outside the house, clear of walls and trees,
// reachable on foot through a side path or gate) gets a yard drawn on the ground: a lawn, a patio or timber deck by
// the back wall, a garden bed along the far side, sometimes a clothes line. Backyard parties (Merv's doof-doofs)
// add a trampoline when there's space and a string of fairy lights round the patio, lit at night.
'use strict';
(function (VH) {
  const U = VH.U;
  const Y = VH.Yards = { parties: [] };
  const LIGHTS = ['#ff5a7a', '#ffd23a', '#5ae0ff', '#9be15d', '#ff9a30', '#c08aff'];
  Y.party = function (slot) { const p = { slot, trampoline: slot.r >= 5, on: true }; Y.parties.push(p); return p; };
  Y.endParty = function (p) { p.on = false; Y.parties = Y.parties.filter(q => q !== p); };
  Y.reset = function () { Y.parties = []; };
  const partyAt = s => Y.parties.find(p => p.slot.slot === s || p.slot === s);
  // the fairy lights: points on an arc round the patio side of the yard
  const lightPts = s => { const out = []; const n = 9; for (let i = 0; i < n; i++) { const a = s.a + Math.PI * (0.45 + 1.1 * i / (n - 1)); out.push([s.x + Math.cos(a) * (s.r - 0.6), s.y + Math.sin(a) * (s.r - 0.6), LIGHTS[i % LIGHTS.length]]); } return out; };
  Y.draw = function (ctx, left, top, S) {
    if (!VH.Spawn || !VH.Spawn.ready) return;
    const vw = ctx.canvas.width / S, vh = ctx.canvas.height / S, t = VH.Game.t;
    VH.Spawn.inBox('backyard', left - 10, top - 10, left + vw + 10, top + vh + 10, s => {
      const sx = (s.x - left) * S, sy = (s.y - top) * S; const h = U.hash(s.i, 7, 3), h2 = U.hash(s.i, 11, 5);
      ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(s.a);
      // lawn (a slightly kept patch), facing the house (+x)
      ctx.fillStyle = 'rgba(120,190,90,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, s.r * S, s.r * 0.85 * S, 0, 0, U.TAU); ctx.fill();
      // patio pavers or a timber deck against the back of the house
      const pw = Math.min(3.2, s.r * 0.6) * S, ph = Math.min(5, s.r * 1.2) * S, px = (s.r * 0.95) * S - pw;
      if (h < 0.5) { ctx.fillStyle = '#b9ad99'; ctx.fillRect(px, -ph / 2, pw, ph); ctx.fillStyle = 'rgba(80,70,60,0.35)'; for (let k = 4; k < pw; k += 4) ctx.fillRect(px + k, -ph / 2, 1, ph); for (let k = 4; k < ph; k += 4) ctx.fillRect(px, -ph / 2 + k, pw, 1); }
      else { ctx.fillStyle = '#8a6040'; ctx.fillRect(px, -ph / 2, pw, ph); ctx.fillStyle = 'rgba(40,24,14,0.4)'; for (let k = 3; k < ph; k += 3) ctx.fillRect(px, -ph / 2 + k, pw, 1); }
      // garden bed along the far side, with a few plants
      ctx.fillStyle = '#5a4030'; ctx.fillRect(-s.r * S, -s.r * 0.7 * S, Math.max(3, S * 1.1), s.r * 1.4 * S);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = ['#3d8a3a', '#e07aa0', '#ffd23a', '#4aa050'][(k + Math.floor(h2 * 4)) % 4]; ctx.fillRect(-s.r * S + 1, (-0.55 + k * 0.36) * s.r * S, 2, 2); }
      // a clothes line now and then
      if (h2 > 0.6 && s.r >= 4) { ctx.strokeStyle = 'rgba(220,220,220,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s.r * 0.3 * S, -s.r * 0.55 * S); ctx.lineTo(-s.r * 0.3 * S, s.r * 0.55 * S); ctx.stroke(); }
      const party = partyAt(s);
      if (party && party.trampoline) { const tx = -s.r * 0.45 * S, ty = s.r * 0.35 * S, tr = 1.6 * S; ctx.fillStyle = '#20263a'; ctx.beginPath(); ctx.arc(tx, ty, tr, 0, U.TAU); ctx.fill(); ctx.strokeStyle = '#4a90d0'; ctx.lineWidth = Math.max(1, S * 0.3); ctx.beginPath(); ctx.arc(tx, ty, tr, 0, U.TAU); ctx.stroke(); }
      ctx.restore();
      if (party) for (const [x, y, c] of lightPts(s)) { const on = Math.sin(t * 3 + x) > -0.3; ctx.fillStyle = on ? c : '#3a3040'; ctx.fillRect(Math.round((x - left) * S) - 1, Math.round((y - top) * S) - 1, 2, 2); }
    });
  };
  // fairy lights glow at night (added to the game's light list)
  Y.lights = function (glows) { for (const p of Y.parties) for (const [x, y, c] of lightPts(p.slot)) glows.push({ x, y, r: 0.9, col: c, a: 0.8 }); };
})(window.VH);
