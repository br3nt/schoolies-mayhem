// Round B's nights for the input-only harness (playthrough.mjs): Jaz's fourth night, the fireworks, needs a bot that
// can sail (bot.cjs: boats, the water route planner, the planting gauge, boarding), so playthrough.mjs hands those
// nights here. Each is played by keys alone (scenarios.cjs: fireworks-night, or fireworks-job-N for one job on its own)
// and reported job by job in playthrough.mjs's format: { results: [{ job, ok, secs, fails, why, obj }], errors }.
'use strict';
const { runOne } = require('./playthrough.cjs');
const SCEN = require('./scenarios.cjs');

const NIGHTS = { 'schoolie:4': { whole: 'fireworks-night', job: j => 'fireworks-job-' + (j + 1), titles: SCEN.FW.TITLES } };
exports.has = (char, night) => !!NIGHTS[char + ':' + night];
exports.count = char => Math.max(0, ...Object.keys(NIGHTS).filter(k => k.startsWith(char + ':')).map(k => +k.split(':')[1]));
exports.jobs = (char, night) => NIGHTS[char + ':' + night].titles.length;

exports.playNight = async function (char, night, opts = {}) {
  const N = NIGHTS[char + ':' + night]; const tag = `${char} night ${night}` + (opts.job != null ? ` job ${opts.job + 1}` : '');
  // time each job from the peeks: a job passes when the next one starts (or the night is won)
  // (retries per job: the game's own failure count, M.failCount, as it moves on during each job)
  const seen = [];
  const onPeek = s => { const t = s.job && s.job.started ? s.job.title : null; if (t && (!seen.length || seen[seen.length - 1].job !== t)) seen.push({ job: t, t0: s.t || 0, t1: s.t || 0, obj: s.obj, f0: s.fails || 0, f1: s.fails || 0 }); if (seen.length) { const c = seen[seen.length - 1]; c.t1 = s.t || c.t1; c.obj = s.obj; c.f1 = s.fails || c.f1; } };
  const r = await runOne(opts.job != null ? N.job(opts.job) : N.whole, { onPeek, quiet: true });
  const results = seen.map((q, i) => { const last = i === seen.length - 1; const ok = !last || r.pass; return { job: q.job, ok, secs: Math.round(q.t1 - q.t0), fails: q.f1 - q.f0, why: ok ? '' : r.outcome.replace(/^FAIL: /, ''), obj: q.obj }; });
  if (!results.length) results.push({ job: opts.job != null ? N.titles[opts.job] : N.titles[0], ok: false, secs: 0, fails: 0, why: r.outcome, obj: '' });
  for (const q of results) console.log(`${tag} | ${q.job} | ${q.ok ? 'PASS' : 'FAIL (' + q.why + ')'} | ${q.secs}s | ${q.fails} retries${q.ok ? '' : ' | ' + (q.obj || '')}`);
  return { results, errors: r.errors || [] }; // (a console error also fails the last job above)
};
