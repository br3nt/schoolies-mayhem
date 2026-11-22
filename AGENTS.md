# AGENTS.md: working on Schoolies Mayhem

Read this before changing anything. It applies to every AI coding agent and every human contributor.

## What this is
- A browser game in plain JavaScript and Canvas 2D. Classic `<script>` tags share one `VH` namespace (see `index.html` for the load order). There's no build step and there are no runtime dependencies.
- Run it from any static server in this folder, e.g. `python3 -m http.server 8000`, then open http://localhost:8000/. It won't work from `file://`.
- **The map:** `data/map.json` plus `data/ground_*.png`, baked from OpenStreetMap by `tools/build_map.mjs` (needs a raw OSM extract; see `data/raw/SOURCES.md` for the query). Its last pass, `tools/bake_slots.mjs`, bakes the spawn slots into `map.json`; run it on its own (`node tools/bake_slots.mjs`) to re-bake them without the extract.

## Where things live
- `js/nav.js` (`VH.Nav`): the one walking path. `N.move` is the only place anyone on foot changes position (walls, water, trees, cars); `N.path` is A* over the 2 m ground grid; `N.update(o, dt)` runs a walker's intent (`goto`, `chase`, `flee`, `scatter`, `push`, `stay`).
- `js/spawn.js` (`VH.Spawn`): the only way jobs put things in the world (see rule 2).
- `js/missions.js`: the jobs and nights (`M.defineJob`, `M.addNight`, `M.addJob`), saves per job, the dead-end check (`requires()`).
- `js/police.js`: the police response (one car per gossip level, a roadblock at four, the chopper only at five after a long chase; Merv on his gopher gets one car and a lecture).
- `js/escort.js`: Kev's prisoners, from the cuffs to the desk.
- `js/ui.js`: the HUD, menus, map, credits (`VH.UI.CREDITS`: the credit, small print and links in one block).
- `js/update.js`: the new-version banner for published builds.

## Rules every change must follow
1. **One movement path.** Every walker moves through `VH.Nav` (`N.move`, or `N.update` with an intent); vehicles move through their own physics in `js/vehicles.js`, driven by `VH.AI` or the player. Mission and activity code sets goals and states only (`p.state = 'goto'`, `p.gx`, `p.gy`, an intent); it never writes positions directly.
2. **Spawns only from validated slots.** Use `VH.Spawn.pick(kind, { near, minDist, maxDist, access, clearance, main, offscreen, unoccupied, claim, nearest, optional })` or `VH.Spawn.many(kind, n, { ..., spacing })`, and place with `VH.Spawn.vehicle(type, slot)`, `VH.Spawn.ped(kind, slot, opts, { d, a })` and `VH.Spawn.drive(v, kerbSlot)`.
   - Kinds: `door`, `frontyard`, `backyard`, `kerb`, `carpark`, `footpath`, `beach`, `park_open`, `jetty_end`, `shopfront`, `roof_access` (always empty), `mooring`, `open_water`.
   - Never place people, vehicles or props at literal coordinates. Moving traffic (passing cars, patrols, Neighbourhood Watch) is the only exception: it joins the road graph at a point on a drivable edge.
   - With nothing that fits, `pick` throws in development (localhost or `?dev`) and returns null when published. Pass `optional: true` only where the caller simply skips; never fall back to a guessed position.
   - New kinds of spot go into `tools/bake_slots.mjs`. It validates every slot (outside buildings, on land or water as appropriate, a clear radius, reachable by the access modes it declares) and fails the build otherwise.
3. **No dead ends.** Every job declares what it needs (`requires()`), shows the next step on screen at all times, and recovers from losses (or offers RESTART JOB / RESTART NIGHT).
4. **Content:**
   - no weapons of any kind (no shooting, no tasers); an arrest is enough;
   - pedestrians are never hurt; they jump out of the way;
   - no drugs or alcohol; no real private people named; real businesses only with changed, affectionate names and no logos;
   - all art, sound and music original (no copyrighted tunes, not even recognisable riffs);
   - spell the town **Victor Harbor**.
5. **Readable UI.** Text never overlaps or crosses a border at any viewport (check 1280×800, 800×600, 390×844 and 844×390 at least). Every interaction has an on-screen prompt and a line in the `?` help.
6. **Keep it static.** No external scripts except pinned cdnjs; served file types only; keep the bundle small.

## Before you open a PR
- `node tests/lint_spawns.mjs` must pass (no raw spawns in mission code).
- With the game served on port 8765 (`python3 -m http.server 8765`), run the input-only bot on the jobs you touched: `node tests/playthrough.mjs cop:2` (a night), `node tests/playthrough.mjs cop:2:1` (one job), `node tests/playthrough.mjs jobs` (every job on its own) or `node tests/playthrough.mjs scenario:NAME`. It plays by key presses only, fails a job whose targets can't be reached from the street, and limits each job in game seconds. It's a second net, not a guarantee, and some jobs are hard for it; don't make your jobs worse.
- `?check=walkers` and `?check=slots` log the walking and slot self-checks in the browser console; `node tools/e2e_escort.mjs` checks Kev's prisoner deliveries.
- Play your change in a browser at desktop and phone sizes, and attach a screenshot or short clip.
- Keep PRs small and focused, with one fix or feature each, and describe what you changed and how you tested it.
