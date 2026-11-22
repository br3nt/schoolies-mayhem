// Lint: mission and job code never spawns at raw coordinates. Everything it puts in the world goes through
// VH.Spawn (baked, validated slots: js/spawn.js, tools/bake_slots.mjs). Fails (exit 1) on:
//   new VH.Ped('kind', 1234, ...) / new VH.Vehicle('type', 1234, ...)   a person or vehicle at a literal position
//   VH.Props.add(PK.x, 1234, ...)                                       a prop at a literal position
//   Nav.snap(1234, ...)                                                 "the nearest standable spot to this number"
//   W.randomRoadPoint(...)                                              an unvalidated road point (use a kerb slot)
//   W.doors.filter / W.doors[...]                                       raw doors (use Spawn door slots)
// Run: node game/tests/lint_spawns.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js');
const FILES = ['missions.js', 'activities.js', 'streetlife.js', 'shops.js', 'escort.js', 'lockup.js', 'yards.js',
  'sports.js', 'watercraft.js', 'fireworks.js', 'motorbikes.js']; // (the last four: Round B)
const RULES = [
  [/new VH\.(Ped|Vehicle)\(\s*[^,()]+,\s*-?\d/, 'a person or vehicle at a literal position'],
  [/Props\.add\(\s*[^,()]+,\s*-?\d/, 'a prop at a literal position'],
  [/Nav\.snap\(\s*-?\d/, 'snapping a literal position'],
  [/randomRoadPoint\(/, 'an unvalidated road point (use a kerb slot)'],
  [/W\.doors\s*(\.filter|\[)/, 'raw doors (use Spawn door slots)'],
];
let bad = 0;
for (const f of FILES) {
  const p = path.join(JS, f); if (!fs.existsSync(p)) continue;
  fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const [re, why] of RULES) if (re.test(code)) { bad++; console.log(`${f}:${i + 1}: ${why}\n    ${line.trim().slice(0, 160)}`); }
  });
}
console.log(bad ? `${bad} raw spawns` : 'no raw spawns in mission code');
process.exit(bad ? 1 : 0);
