# Thread Town 3D, version 2: module contract

Supersedes `docs/CONTRACT.md` where the two disagree. Everything in v1 that is not mentioned here stays as it is (renderer, lighting, labels, picking, avatars, UI). Agents building modules in parallel must follow this exactly. If something is ambiguous, pick the simplest reading and leave a `// CONTRACT:` comment.

## What version 2 adds

1. **A roomier city.** Bigger blocks with front yards, so buildings breathe.
2. **Twelve unique buildings.** Each department gets its own recognizable building (lighthouse, observatory, vault, town hall, warehouse, playground...). No two look alike.
3. **Signature work activities.** When an agent works, it does something specific to its department at an outdoor or rooftop station next to its building (swinging, shooting hoops, spinning a vault wheel, scanning with a telescope, coding at a multi-monitor desk, painting a billboard...). Agents at computers face their screens, with the screen between the alien and the camera.
4. **Leisure.** Idle agents sit at the café with ice cream or coffee, sit on benches, and swim in the pond. Most swimmers walk out onto a diving board on the pier, jump in with a proper arc and a splash, swim, and climb out by the ladder.
5. **Buildings grow with the team.** Each department building is scaled by how many agents the department has (a small starter building for none, bigger with every agent), animated when the roster changes.
6. **Interactivity.** Hovering an alien freezes it (it turns to the camera and waves) while the tooltip is shown. Clicking an alien or building flies the camera to it. A Follow toggle keeps the camera on an agent. A Reset view control returns to the full-town framing.

## Files

```
js/data.js            departments gain footprint, station side, and activity id (see below)
js/sim.js             map v2, leisure behaviors, poses, hover pause
js/aliens3d.js        pose system v2 (named poses, hand attach points, fade support)
js/depts/common.js    shared 3D helpers (already written, read it; do not change its exports)
js/depts/<id>.js      one module per department: building + activity (12 files)
js/leisure3d.js       café props, bench sitting, swimming visuals
js/render3d.js        integration: dept modules, activities, leisure, camera fly-to and follow, hover pause
js/ui.js, css/style.css, index.html   small additions (Focus, Follow, Reset view, activity label)
docs/CITY_DESIGN.md   the creative spec per department (written by the design phase)
```

Import map: unchanged (`three` and `three/addons/` from `./node_modules/three/...`). Department modules import helpers from `./common.js` (they live in `js/depts/`). `leisure3d.js` imports from `./depts/common.js`.

## Map v2 (js/sim.js)

Constants: `PITCH = 16`, `BLOCK = 14`, `ORG = 2`, `COLS = 82`, `ROWS = 52`. Block origin for slot `[c, r]` is `(ORG + c * PITCH, ORG + r * PITCH)`, so blocks span x `2..15, 18..31, 34..47, 50..63, 66..79` and y `2..15, 18..31, 34..47`. Roads are 2 tiles wide at x `16, 32, 48, 64` (plus 1) running y `1..49`, and at y `16, 32, 48` (plus 1) running x `1..80`. Rows 50 and 51 and columns 0, 1, 80, 81 are a grass border with trees. Tile types are unchanged.

**Department block** (slot from `data.js`): the building footprint is `dept.footprint = {w, h}` (defaults `{w: 10, h: 6}`; maximum `w: 12, h: 7`). It is placed at `x = bx + 1 + floor((12 - w) / 2)`, `y = by + 1`. Footprint tiles are `B`. The door is two tiles wide on the south face, at `door = {x: bld.x + floor(w / 2) - 1, y: bld.y + h - 1}` (tiles `door.x` and `door.x + 1`). The stub path is two tiles wide at `door.x, door.x + 1` from `bld.y + h` down to `by + 15` (the road). The **station** is a 4 by 4 area in the yard on `dept.station` side (`'left'` or `'right'`): right side spans x `door.x + 3 .. door.x + 6`, left side spans x `door.x - 5 .. door.x - 2`; both span y `bld.y + h + 1 .. bld.y + h + 4`. Station tiles stay grass (type `G`) but no trees or flowers are placed on them or on the two tiles between the station and the stub. `building.station = {x, y, w: 4, h: 4, side}` and `building.workTile = {x: station.x + 1 (right side) or station.x + 2 (left side), y: station.y + 3}` (the tile on the stub side of the station, nearest the path). `building.workPos = {x: workTile.x + 0.5, y: workTile.y + 0.5}`. `building.doorPos = {x: door.x + 1, y: door.y + 1.5}` (world-ish tile units just outside the door).

**Plaza** `[2, 1]`: the whole 14 by 14 block is `Z`, with a 3 by 3 fountain basin `FT` at `bx + 6 .. bx + 8`, `by + 6 .. by + 8` and a fountain deco at `{x: bx + 7.5, y: by + 7.5}` (center of the basin, world units). Four benches (decos) and four lamps as before, scaled to the bigger plaza (benches at `bx + 3.5 / bx + 10.5`, `by + 4.5 / by + 9.5`; lamps at `bx + 1.5 / bx + 12.5`, `by + 1.5 / by + 12.5`).

**Café** `[1, 1]`: building 6 wide by 4 deep at `x = bx + 4, y = by + 1`, door at `x = bx + 6, bx + 7` on the south face, one-wide stub at `bx + 6` from `by + 5` to `by + 15`. Terrace east of the stub: four tables (decos `{type: 'table', x, y}`) at world `(bx + 9.5, by + 7.5)`, `(bx + 12.5, by + 7.5)`, `(bx + 9.5, by + 10.5)`, `(bx + 12.5, by + 10.5)`. Each table has two **seats** on the tiles west and east of it: `state.seats.push({ id, kind: 'cafe', x: tableTileX - 1, y: tableTileY, face: {x: tableX, y: tableY}, takenBy: null })` and the same for `+ 1`. Seat tiles stay grass with no trees. A string-light line over the terrace is decorative (renderer).

**Park** `[3, 1]`: pond ellipse center `(bx + 7, by + 7.5)`, radii `4.8` by `3.6` in tiles, tiles `WA`. `state.swimSpots` = water tiles whose four neighbors are all water (deep enough to swim). `state.shoreTiles` = grass tiles with at least one water neighbor (entry and exit points). Three benches as decos around the pond, each with one seat `{kind: 'bench', x, y, face}` on the bench's own tile, facing the pond. Two lamps. Extra trees.

**Pier and diving board** (south shore of the pond): the pier base tile is the shore tile directly south of the pond center column, `pierTile = {x: bx + 7, y: the southmost water row in that column + 1}` (a grass tile, kept free of trees along with its two neighbors). The pier runs north from the pier tile over the water for 2 tiles; the diving board continues north another 1.6 tiles. `state.pier = { tile: pierTile, base: {x: bx + 7.5, y: pierTile.y + 0.5}, boardStart: {x: bx + 7.5, y: pierTile.y - 1.5}, boardEnd: {x: bx + 7.5, y: pierTile.y - 3.1}, landing: {x: bx + 7.5, y: pierTile.y - 5.0}, ladder: {x: bx + 8.5, y: pierTile.y - 0.5}, height: 0.5 }` in tile units (world x and z are the same numbers). `landing` must be inside the water; if it is not, move it south until it is.

**Benches elsewhere**: every bench deco in the plaza also registers a `bench` seat (facing the fountain).

**Lamps**: at every road intersection (two per intersection as before), plaza corners, park. **Trees**: border probability 0.45, park 0.25, yards 0.10, never on station, seat, shore, or stub tiles, never directly in front of a door (the two columns of the door and stub), never within one tile of a building footprint on its south side.

`TT.sim` additionally exposes `BLOCK, PITCH, ORG`, `state.seats`, `state.swimSpots`, `state.shoreTiles`, `blockOrigin(c, r)`.

## data.js additions

Each department gains three fields. Values here are fixed by this contract so dept modules and the sim agree:

| id | footprint | station | activity id |
|---|---|---|---|
| exec | `{w: 12, h: 7}` | right | `podium` |
| embedded | `{w: 10, h: 6}` | right | `switchboard` |
| compliance | `{w: 10, h: 6}` | left | `stamp` |
| fcc | `{w: 9, h: 6}` | right | `watchtower` |
| ops | `{w: 11, h: 6}` | left | `crane` |
| data | `{w: 9, h: 6}` | right | `telescope` |
| credit | `{w: 10, h: 6}` | left | `vault` |
| finance | `{w: 8, h: 6}` | right | `ticker` |
| tech | `{w: 11, h: 6}` | left | `workstation` |
| risk | `{w: 7, h: 7}` | right | `lighthouse` |
| marketing | `{w: 10, h: 6}` | left | `hoops` |
| people | `{w: 9, h: 5}` | right | `swings` |

Also add `TT.ready` unchanged and keep every existing field (`slot, accent, wall, roof, alien`).

## Simulation v2 (js/sim.js)

Agent gains: `pose` (string, see pose list), `leisure` (`null` or `{kind, seat, until, phase, spot, dive}`), `paused` (boolean, set by the renderer while hovered), `lastLeisureAt`, `onBoard`, `jumpT`, `splash`.

**Poses the sim sets** (`agent.pose`): `'stand'` standing idle, `'walk'` moving, `'work'` working (the renderer replaces this with the activity's pose), `'sit'` seated leisure, `'swim'` swimming, `'dive'` in the air off the diving board, `'climb'` climbing the ladder, `'hop'` report, `'slump'` error, `'wave'` while paused by hover and not working.

**Hover pause**: when `agent.paused` is true and the agent is in `idle` (walking or standing), `commute`, or `leisure` with kind `swim`, the sim does not move it and does not advance `waitUntil` or leisure timers (push them forward by `dt`). Working, report, and error keep running. Pose becomes `'wave'` unless working, seated, or swimming (seated and swimming agents keep their pose; swimming agents stop moving).

**Leisure decisions**: when an idle agent finishes a wait and picks what to do next, roll: 22 percent café (if a free café seat exists and `time - lastLeisureAt > 20`), 14 percent swim (if `swimSpots.length`), 14 percent bench (free bench seat), otherwise wander as before. Agents whose `spec.cadence` includes `hourly` are workaholics and halve their leisure odds.

- **Café or bench**: reserve the seat (`seat.takenBy = agent.id`), path to the seat tile, state stays `idle` while walking with `agent.leisure = {kind: 'icecream'|'coffee'|'bench', seat, phase: 'going'}` (ice cream or coffee is chosen 50/50 for café seats). On arrival: state `'leisure'`, `phase: 'seated'`, `until = time + 12 + rand * 14`, pose `'sit'`, `facing` toward `seat.face`. `agent.moveDir` points from the seat toward the face point so the renderer can orient the alien. When done: free the seat, `lastLeisureAt = time`, state `idle`, `waitUntil = time + 0.5`.
- **Swim**: 75 percent of swims use the diving board (`leisure.dive = true`), the rest wade in from a random shore tile. Diving: path to `pier.tile`; on arrival state `'leisure'`, `kind: 'swim'`, `phase: 'boarding'`: glide from `pier.base` to `pier.boardEnd` at 1.1 tiles per second with pose `'walk'` and `agent.onBoard = true` (the renderer lifts the alien by `pier.height`). At the board end pause 0.6 s (`phase: 'bouncing'`, pose `'stand'`), then `phase: 'diving'` for 1.1 seconds: `agent.jumpT` runs 0 to 1, position interpolates linearly from `boardEnd` to `landing`, pose `'dive'`; the renderer adds the arc height. On landing: `agent.onBoard = false`, `agent.jumpT = 0`, `agent.splash = time` (the renderer reads it for the splash burst), `phase: 'swimming'`, `until = time + 14 + rand * 16`, pose `'swim'`, `spot` = a random swim spot. Wading: path to the shore tile, then `phase: 'swimming'` directly (also set `agent.splash = time`). While swimming, each tick glide straight toward `spot` center at 0.8 tiles per second (ignore the walkable grid, water is fine), picking a new spot when within 0.1. Update `moveDir`. When done: `phase: 'leaving'`: divers glide to `pier.ladder` at 1.0 tiles per second, then `phase: 'climbing'` for 0.8 s with pose `'climb'` (position eases from the ladder to `pier.base`; the renderer lifts it onto the pier), then state `idle` standing on `pier.tile`; waders glide back to the nearest shore tile center at 1.0 tiles per second, then state `idle`. Every agent has `onBoard` (false), `jumpT` (0), and `splash` (-1) with those defaults.
- **Interruptions**: `startJob` works from any state except `commute` and `working`. If seated, free the seat. If swimming, the commute path is `[nearestShoreTile, ...findPath(shore, workTile)]`, and the agent glides to the shore tile first (stepAlong already moves along path nodes without checking walkability). Clear `leisure`.
- **Demo visibility**: hidden demo agents still simulate (unchanged).
- `removeAgent` frees any seat the agent holds.

Everything else from v1 stays: wander targets, speeds, blinking, typing bursts, report hop, slump, simulator targeting roughly 30 percent of visible agents busy, seeded history, events, `deptStats`, `darkness`.

Expose `TT.sim.LEISURE = { CAFE: 0.22, SWIM: 0.14, BENCH: 0.14 }` for tuning.

## Aliens v2 (js/aliens3d.js)

Keep every export and the handle shape from v1 and add:

- `handle.parts.handL`, `handle.parts.handR`: `THREE.Object3D` at each hand tip (children of the arm groups) where props attach. `handle.parts.seatY`: the body drop (world units) that puts the alien's bottom on a seat surface at y = 0 when pose is `sit` (about 0.18 times `ALIEN_SCALE` is fine; expose the number).
- `animateAlien(handle, agent, time, dt, poseOverride)`: `poseOverride` (string or undefined) wins over `agent.pose`. Supported poses, all eased so nothing snaps:
  - `stand`, `walk` (speed from `agent.speed` or 2.6 when commuting), `work` (the v1 typing pose: arms forward and down in bursts), `hop` (uses `agent.yoff`), `slump`, `wave` (face +z, right arm up waving 2 Hz, head tilt), `sit` (legs forward, body lowered by `seatY`, arms resting; if a hand holds a prop, the arm rises to the mouth every 2.5 s for 0.6 s), `swim` (body pitched forward 1.2 rad, lowered so the body center sits at y about -0.12, legs kicking alternately 3 Hz, arms paddling in circles, slight bob), `swing` (sit pose with legs pumping in time with `handle.swingPhase` set by the activity), `throw` (two-handed overhead throw cycle 1.6 s: wind up, release, follow through), `lookUp` (head and body tilted back 0.5 rad, one hand shading the eyes), `cheer` (both arms up, small bounces), `lever` (two hands forward gripping, body leaning back and forth 0.8 Hz), `paint` (one arm sweeping up and down 1.2 Hz holding a brush point), `push` (body leaning forward, arms forward, legs stepping in place), `point` (one arm extended forward, slight bounce), `type` (same as `work` but head tilted down toward a screen at y 0.8), `dive` (arms stretched straight overhead, legs together, body pitch eased from 0 to 1.5 rad as `agent.jumpT` goes 0 to 1, antennae swept back), `climb` (arms alternating up and down at 2 Hz, legs stepping, body upright).
  - Rotation: unchanged rules; `wave` faces +z (the camera side); poses while working take the yaw the renderer sets on the group (the renderer owns yaw while working).
- `setAlienOpacity(handle, alpha)` for fade in and out (sets `transparent` and `opacity` on every material, including the ring).
- `makeAlienPortraitScene()` unchanged.

Pose state must live on the handle (`handle.poseState`), not on module globals, so many aliens can animate independently.

## Department modules (js/depts/<id>.js)

One ES module per department id listed above. Each exports:

```js
export const id = 'credit';                 // must equal the department id
export const activityLabel = 'Spinning the vault wheel';   // tooltip text while working, sentence case, no period
export function buildBuilding(ctx) -> { group, glass: [MeshStandardMaterial], lights: [PointLight], update(dt, time, night, active) }
export function buildActivity(ctx) -> { group, anchor: THREE.Vector3, yaw: number, pose: string, enter: 'walk' | 'inside', label?: string,
                                        update(dt, time, phase, alien, active) }
```

`ctx = { THREE, b, dept, design }` where `b` is the building record (`x, y, w, h, door, station, workTile, workPos, doorPos, block, dept`), `dept` the department from `data.js`, and `design` the department's section of `docs/CITY_DESIGN.md` as a string (for reference only).

**Coordinates.** `buildBuilding` builds in LOCAL space: the group's origin is the footprint's north-west corner at ground level, so local x runs `0..w` eastward and local z runs `0..h` southward; the south face (`z = h`) is the front and faces the camera. The door is centered at local `x = door.x - b.x + 1`, on the `z = h` face. The renderer places the group at world `(b.x, 0, b.y)`. Keep every part inside `-0.6 .. w + 0.6` by `-0.6 .. h + 0.6` horizontally and under 9 units tall (the Risk lighthouse may reach 13). Walls use `dept.wall`, the main roof or signature color uses `dept.accent`, trims use `BRAND.white`, and any extra colors come from `docs/CITY_DESIGN.md`. Windows use ONE glass material from `glass()` per building (several meshes may share it) and return it in `glass` so the renderer can light it at night and while active. Point lights are optional (at most two per building, `castShadow` false) and are returned in `lights`; the renderer scales their intensity with night.

`buildActivity` builds in LOCAL space with origin at the station's north-west corner at ground level, local x `0..4`, local z `0..4`, the stub path lies to the west for `right`-side stations and to the east for `left`-side stations, so orient the station toward the path. The renderer places the group at world `(station.x, 0, station.y)`. `anchor` is the LOCAL point where the alien stands or sits (y is the ground or seat height); `yaw` is the alien's facing (radians about +y, 0 means facing +z toward the camera); `pose` is one of the alien poses above. `enter` is `'walk'` when the alien simply walks to the anchor, or `'inside'` when the alien should walk to the door, fade out, and reappear at the anchor (use this for rooftop or indoor stations such as the lighthouse lamp or the observatory dome). `update(dt, time, phase, alien, active)` is called every frame: `phase = {working: boolean, t: seconds since the current run started or since it ended}`, `alien` is the alien handle while someone is at the station (else `null`), `active` is the same boolean as `phase.working`. The activity may move `alien.group.position` and `rotation` relative to the anchor (swing arc, climbing), set `alien.swingPhase`, spawn and animate props (balls, coins, papers, beams). Keep update allocation-free (module-scope scratch vectors) and make it idle gracefully when `alien` is null (props settle, lights dim).

**Agents at computers face the screen.** For `workstation`, `switchboard`, `ticker`, and any other screen-based station: the alien stands or sits with yaw 0 (facing +z, the camera), the desk and screen sit between the alien and the camera at local z = anchor.z + 0.55, and the screen faces -z (toward the alien). The viewer sees the alien's face over the top of the screen. Use `glow()` for the screen with intensity 0.6 to 1.0.

Every department's activity must be visibly different from every other one, and must read at the fit distance: props at least 1.2 units in their largest dimension, motion amplitude at least 0.3 units or a clear light change. Follow `docs/CITY_DESIGN.md` for the concept, colors, and dimensions; it is the creative brief.

Use only helpers from `./common.js` plus `three` and `three/addons/` imports. Do not import from `render3d.js`, `sim.js`, or other dept modules. Do not touch the DOM.

## Leisure module (js/leisure3d.js)

```js
export function buildLeisure(ctx) -> { group, update(dt, time, night) }
export function attachProp(handle, kind)       // kind 'icecream' | 'coffee'; adds a prop to handle.parts.handR
export function detachProp(handle)
export function animateLeisure(handle, agent, time, dt)   // called after animateAlien while agent.state === 'leisure'
export function swimOffsets(handle, agent, time)         // optional helper used by animateLeisure
```

`ctx = { THREE, state }` (the sim state). `buildLeisure` adds: a seat stool at every café seat (small cylinder, `BRAND.wood`), string lights over the café terrace (a sagging line of tiny glow spheres between two posts; emissive follows `night`), the pier and diving board from `state.pier` (planks on posts from `base` to `boardStart`, 1.2 units wide, deck at `pier.height`; a springboard from `boardStart` to `boardEnd`, 0.5 wide, `BRAND.aqua` with a white tip, on a short stand; a ladder with two rails and four rungs at `pier.ladder` from the water up to the deck), two floating inflatable rings (toruses, salmon and aqua, bobbing on the water), a pool of 12 ripple rings (flat toruses, white, transparent) that `animateLeisure` positions and fades under swimmers, and a pool of 24 splash droplets (small white spheres) for splash bursts. `animateLeisure` reads `agent.onBoard`, `agent.jumpT`, and `agent.splash`: on the board it lifts the alien by `pier.height` and flexes the board tip down 0.12 units under the alien's weight; while diving (`jumpT` between 0 and 1) it adds `pier.height + 1.4 * sin(pi * jumpT)` of height; when `time - agent.splash` is between 0 and 0.9 it plays a splash burst at the alien's position (droplets arc out and fall, two ripple rings expand fast) and dips the alien 0.25 units below its swim depth for the first 0.3 s; while climbing it lifts the alien from water level to `pier.height` over the climb.

`attachProp('icecream')` builds a cone (`cone` helper, 0.1 radius, 0.26 tall, `#E8C07A`) with two scoops (`sphere` 0.11, colors from `['#F8D9E0', '#8FD6C8', '#F6E6B4', '#E7706F']` seeded by `handle.seed`); `'coffee'` builds a cup (`cyl` 0.09 radius, 0.16 tall, white) with a handle (`torus` 0.05, 0.015) and a steam puff (two small white spheres that `animateLeisure` drifts up and fades). Props are 1.0 to 1.3 units in scale relative to the alien so they read at a distance. `animateLeisure` lifts the holding arm to the mouth every 2.5 s (coordinate with the alien's `sit` pose by setting `handle.sipPhase` in 0..1, which the alien pose reads) and for swimmers bobs the group, points `rotation.y` along `agent.moveDir`, drives two ripple rings per swimmer (expand 0.3 to 1.1 units over 1.4 s, opacity 0.6 to 0), and splashes a few white specks when a swimmer enters or leaves.

## Renderer integration (js/render3d.js)

Keep everything from v1 and:

- Build `FIT_CORNERS`, `TARGET`, shadow camera bounds, `clampTarget` limits, ground texture size, sky, stars, and the off-map skirt from `TT.sim.COLS` and `TT.sim.ROWS` instead of hard-coded 62 and 40.
- Replace the generic department building builder with the twelve dept modules: `import * as exec from './depts/exec.js'` and so on, indexed by `id`. For each dept building, call `buildBuilding`, place the group at `(b.x, 0, b.y)`, keep `glass` materials in the per-building record for the night and active lighting, add `lights` with intensity driven by night. Call `update` every frame. Keep the sign sprite and agents badge above each building (position the sign over the building's bounding box top, computed with `Box3.setFromObject` after build). Keep the café as a generic building (it is not a department) but add the terrace props from `leisure3d`.
- For each dept, call `buildActivity`, place at `(station.x, 0, station.y)`, store `{ activity, worldAnchor (Vector3 computed via localToWorld), yaw, pose, enter, label }` in the building record.
- **Working flow.** When an agent reaches `working` state: if `enter === 'walk'`, ease the alien from `workPos` to the station anchor over 0.6 s and set its yaw; if `enter === 'inside'`, walk it toward `b.doorPos` over 0.8 s, fade out over 0.4 s (`setAlienOpacity`), move to the anchor, fade in over 0.4 s. While working, every frame: set `group.position` to the anchor (plus any activity offset), `rotation.y = yaw`, call `animateAlien(handle, agent, time, dt, activity.pose)`, then `activity.update(dt, time, phase, handle, true)`. The desk and generic tool bubble from v1 are removed; the tool sprite is replaced by the activity itself. When the run ends (report or error), reverse: fade or ease back to `workPos`, then normal rendering. Speech bubbles and name tags project from the alien's actual rendered position (`group.position`), not from `agent.pos`, so they follow swings and rooftops.
- **Leisure flow.** When `agent.state === 'leisure'` and `agent.leisure.phase === 'seated'`: snap the group to the seat tile center, lower by `handle.parts.seatY` (and bench height 0.42 for `bench` seats), face `seat.face`, attach the prop on arrival (`attachProp`) and detach when leaving. Call `animateLeisure` after `animateAlien`. Swimmers: position from `agent.pos`, `animateLeisure` handles bob and ripples.
- **Hover pause.** On hover set `agent.paused = true` for the hovered agent (and clear it on the previous one); the renderer leaves movement to the sim. The hovered alien faces the camera: when `paused` and pose is `wave`, set `rotation.y` to face the camera position (yaw toward `camera.position` projected on the ground).
- **Camera.** `focusOn(target)` where target is an agent record or a building record: animate `controls.target` to the object's ground position and the camera distance to `0.32 * fitDistance` (buildings `0.42 * fitDistance`) over 1.1 s with ease-in-out, keeping the current polar and azimuth. `follow(agentId | null)`: while set, `controls.target` tracks the agent's rendered position each frame (lerp factor `1 - exp(-dt * 6)`). `resetView()`: animate back to `FIT_TARGET` and `fitDistance` over 1.2 s, and clear follow. Clicking an agent or building calls `focusOn` after `TT.onSelect`. Double-clicking empty ground calls `resetView`. Expose `TT.town.focusOn(kind, id)`, `TT.town.follow(id | null)`, `TT.town.resetView()`, and `TT.town.isDefaultView()` (true when within 2 percent of the fit distance and 0.5 units of `FIT_TARGET`). Cinematic auto-rotate pauses while a focus animation runs and resumes afterward.
- **Buildings grow with the team.** Every 0.5 s compute the visible agent count per department (`settings.showDemo || !spec.demo`). Target scale `s = clamp(0.78 + 0.10 * count, 0.78, 1.30)`. Ease each dept building group's uniform scale toward `s` with factor `1 - exp(-dt * 3)`. Scale about the door foot so the building stays on its lot: pivot `P = (door.x - b.x + 1, 0, h)` in local units; set `group.scale.setScalar(s)` and `group.position.set(b.x + P.x * (1 - s), 0, b.y + P.z * (1 - s))`. Re-measure the sign height with `Box3` whenever the scale changes by more than 0.002. Stations, stubs, and the sign's x and z are not scaled.
- **Diving.** Swimmers' rendered position comes from `agent.pos` plus the leisure offsets (`animateLeisure` handles board height, jump arc, splash dip, ladder climb). Speech bubbles and tags follow the rendered position.
- **Tooltip label.** While an agent is working, `TT.onHover` receives the same hover object; `ui.js` reads `agent.dept.building.activityLabel` (set by the renderer from the dept module) for the Now line.
- Keep `TT.town.tick(seconds)` working headlessly (no rAF), the `_debug` handle, avatars, and the overlay system.

## UI additions (js/ui.js, css/style.css, index.html)

- Tooltip Now line: `Working: <activityLabel>` while working, `Having ice cream at the café`, `Having coffee at the café`, `Taking a break on a bench`, `Swimming in the pond` (or `On the diving board` while `onBoard`, `Diving in` while `jumpT` is between 0 and 1) for leisure kinds, else the state label.
- Inspector (agent): buttons `Focus camera` (calls `TT.town.focusOn('agent', id)`) and `Follow` (toggles `TT.town.follow(id)`; label becomes `Stop following`). Inspector (department): button `Focus camera` (calls `TT.town.focusOn('dept', id)`), plus a line `Signature activity: <activityLabel>`.
- A `Reset view` pill button at the bottom left of `#stage-host` (`#btn-reset-view`, class `btn small`) that is visible only when `TT.town.isDefaultView()` is false (poll in the existing 400 ms interval). Escape also calls `resetView` when not in board mode.
- Roster rows show a short status for leisure (`Café`, `Bench`, `Swimming`) instead of `Wandering`.
- No em dashes anywhere. Sentence case.

## Verification each module must do

- Syntax: `node --check` (classic scripts) or copy to a `.mjs` in the scratchpad and `node --check` (modules).
- Names: grep your file for every identifier you take from this contract and confirm the spelling.
- Dept modules: a quick headless import test with Node is possible because `three` is installed in `node_modules`: write a scratch `.mjs` that stubs `window.TT = { hash, rng }` and `document.createElement('canvas')` is NOT available in Node, so do not call `canvasTex` or `decal` at module top level; call them only inside `buildBuilding` or `buildActivity`. If your module needs a canvas texture, guard with `typeof document !== 'undefined'` so the import test can still run.
- Do not start servers or open browsers; the integrator does the visual pass.
