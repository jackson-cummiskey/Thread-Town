# Thread Town 3D, version 5: interiors, every activity, smooth movement, chase camera, golf

Adds to `docs/CONTRACT_V4.md` and earlier contracts; where they disagree, this file wins. Everything not mentioned here stays as it is.

## What version 5 adds

1. **Interiors.** Every department building has a room behind its front door. Walking into the door fades you inside; walking back to the door fades you out. Rooms are themed per department and show live information about the team.
2. **Every station is playable by the visitor**, including rooftop and tower stations, with the camera following, and an eased walk-out when leaving.
3. **Smooth first-person movement**: eased look, acceleration and deceleration, a footstep head bob, run FOV.
4. **A chase camera (third person, GTA style)**: the mouse orbits around the character, movement is camera-relative, the character turns to face its movement, the camera settles behind when walking, the wheel sets distance, buildings pull the camera in.
5. **Golf.** A fourth block row at the south of the town with a three-hole par-3 course, a clubhouse, and a driving range. The visitor plays with a charge-and-release swing, club selection, ball flight, bounce, roll, cup capture, and a scorecard HUD.

## Files

```
js/sim.js, js/data.js        map grows a fourth row; new tile types; golf park layout; interior door records
js/interiors.js             new: builds the twelve rooms and their live boards
js/golf.js                  new: course geometry, hole data, ball physics, scoring
js/player.js                v2: smoothing, chase view, interiors, station camera and walk-out, golf controller
js/render3d.js              integration: ground painter for new tiles, rooms, golf, chase camera input, fades, HUD writes
js/ui.js, index.html, css/style.css   golf HUD, interior hint, view label
docs/INTERIORS_DESIGN.md, docs/GOLF_DESIGN.md   written by the design phase
```

## Map v3 (js/sim.js)

- `ROWS = 68` (was 52). Block rows become 0 to 3: block row 3 spans y `50..63`, the horizontal road at y `64, 65`, border rows `66, 67`. Vertical roads run y `1..65`. Everything about rows 0 to 2 is unchanged.
- **Golf park**: blocks `[0,3]`, `[1,3]`, `[2,3]` hold holes 1, 2, 3 (one per block, each 14 by 14 tiles). The vertical roads at x `16,17` and `32,33` cross the park as cart paths and stay `P`. Block `[3,3]` is the **clubhouse** block (a small building 6 by 4 at `x = bx + 4, y = by + 1`, door on the south face at `bx + 6, bx + 7`, a practice putting green south of it) and block `[4,3]` is the **driving range** (a tee line along the south edge at `y = by + 12` from `bx + 2` to `bx + 11`, open fairway north of it with distance markers at 5, 9, and 13 tiles).
- New tile types in `TT.sim.TILES`: `FW = 9` fairway, `GR = 10` green, `SA = 11` sand, `TEE = 12` tee box. The golf layout per hole comes from `docs/GOLF_DESIGN.md` and is realized in the sim as tiles: fairway corridor, a green ellipse, one or two bunkers, hole 2 has a water hazard (`WA` tiles inside the park; swimmable for the visitor, not a swim spot for agents), rough is plain `G`. Trees only on the park edges and between holes, never on fairway, green, sand, tee, or within 1 tile of them.
- `state.golf = { holes: [{ n, par: 3, tee: {x, y}, cup: {x, y}, greenCenter: {x, y}, greenR, bounds: {x0, y0, x1, y1}, water: [{x, y}] }], clubhouse: building, range: { teeLine: [{x, y}], bounds } }` in tile units (world x and z are the same numbers). `cup` must be inside the green.
- Agents: `walkable()` for agents excludes `GR`, `SA`, `TEE`, and `FW` (they stay off the course); `TT.sim.isEnterable(x, y)` for the visitor returns true for `G, P, Z, F, FW, GR, SA, TEE`. The sim adds no golf behavior for agents in this version.
- **Door records**: every department building record gains `doorTile = {x: door.x, y: door.y + 1}` (the tile just outside the two-tile door, west half) and `doorTile2 = {x: door.x + 1, y: door.y + 1}`; the renderer uses the two tiles as the enter zone.
- `TT.sim` exposes `state.golf` and keeps every earlier export.

## Interiors (js/interiors.js, new ES module)

```js
import * as THREE from 'three';
export function buildInteriors(ctx) -> { group, rooms: Map<deptId, Room>, update(dt, time, activeRoomId | null) }
export function refreshBoards(rooms, deptStats, agentsByDept)   // repaints stats boards and portrait walls
```

`ctx = { THREE, state, deptById, depts: TT.DEPARTMENTS, getAvatar: (agent) => dataURL | '' }`.

- Rooms live far below the town so they never show through: room `i` (department order in `TT.DEPARTMENTS`) has its floor at world `y = -60`, centered at `x = 200 + i * 24`, `z = 0`. `Room = { id, group, floorY: -60, origin: {x, z} (south-west floor corner), w: 12, d: 9, door: {x, z} (world, on the south wall center), spawn: {x, z} (1.2 north of the door), obstacles: [{x0, z0, x1, z1}] (world AABBs of furniture the visitor cannot walk through), interactables: [{ kind: 'board' | 'portrait' | 'exit', x, z, label, agentId? }], lights: [PointLight] }`.
- Each room: floor (material by theme), four walls `3.4` high in `dept.wall` with a wainscot band in `dept.accent`, a ceiling, three windows on the north wall glowing a soft daylight `#DDEBF5` (emissive 0.9), a door frame on the south wall with a lit `EXIT` sign, a reception desk with the department plaque (canvas), a **stats board** canvas on the west wall (department name, agents, runs this week, clean rate, signature activity, refreshed by `refreshBoards`), a **portrait wall** on the east wall with the department's agents (one framed canvas per agent from `getAvatar`, name and role under each; empty slots show `Hiring` plates), a water cooler, two plants, a notice board, plus three to five themed props from `docs/INTERIORS_DESIGN.md` (the lighthouse-less Risk room is zoo themed: feeding charts, an aquarium, a terrarium). Two warm point lights per room (`castShadow` false), lit only for the active room (`update` sets intensity by `activeRoomId`).
- The exit zone is a 1.6 by 1.0 rectangle inside the door. The `board` and `portrait` interactables carry labels `E  Read the board` and `E  <agent name>`.

## Golf (js/golf.js, new ES module)

```js
import * as THREE from 'three';
export function buildGolf(ctx) -> { group, holes, range, update(dt, time), ballPool }
export function strike(ball, { club, power, yaw, lie })        // sets ball velocity for a shot
export function stepBall(ball, dt, course)                      // integrates flight, bounce, roll; returns an event or null
export function lieAt(course, x, z) -> 'tee' | 'fairway' | 'green' | 'sand' | 'rough' | 'water' | 'path'
export const CLUBS = { driver: {...}, iron: {...}, putter: {...} }
```

`ctx = { THREE, state, sim }`. Geometry: the ground tiles already carry fairway, green, sand, and tee colors (the renderer paints them), so `buildGolf` adds what sits on top: a flag pole and flag per hole (cloth in `BRAND.salmon`, number on a canvas), a cup (dark disc plus a shallow cylinder), tee markers, yardage signs, benches, ball washers, low fences along the cart paths, the clubhouse porch dressing (bag stand, clubs), the range tee mats, distance marker boards, and a net. The `ball` object: `{ mesh, pos: Vector3, vel: Vector3, rolling: boolean, resting: boolean, lastRest: Vector3, hole: n | null, strokes }` with a `0.11` radius white sphere and a short fading trail (pooled small spheres).

Physics (world units, 1 tile = 1 unit, gravity `g = 20`):

- `CLUBS.driver = { maxSpeed: 22, elevation: 0.32 rad, spread: 0.06 }`, `iron = { maxSpeed: 15, elevation: 0.55, spread: 0.04 }`, `putter = { maxSpeed: 9, elevation: 0, spread: 0.02 }`. `strike` sets `vel = dir * speed * cos(elev) + up * speed * sin(elev)` with `speed = maxSpeed * (0.25 + 0.75 * power)`, yaw error uniform in `+- spread * (0.4 + power)` radians, and for the putter a pure ground roll. Lie modifiers: sand halves speed, rough `0.85`, tee and fairway `1.0`.
- Flight: `vel.y -= g dt`, position integrates; on ground contact (`pos.y <= 0.11`): bounce with vertical restitution `0.45` on fairway and rough, `0.3` green, `0.1` sand, horizontal retention `0.8`; below vertical speed `1.2` the ball switches to rolling.
- Rolling deceleration: green `3.0`, fairway `5.0`, rough `8.0`, sand `16`, path `4.0`; rest when speed `< 0.15`. Water: the ball sinks (`event: 'water'`, position of the splash), the controller adds a penalty stroke and drops the ball at `lastRest`.
- Cup capture: when within `0.22` of the cup and speed `< 3.2` the ball drops (`event: 'holed'`); within `0.22` but faster it lips out (deflect `0.6` and keep rolling). Out of the park bounds: `event: 'out'` (penalty, drop at `lastRest`).
- `stepBall` returns `null`, `{ type: 'rest' }`, `{ type: 'holed' }`, `{ type: 'water', x, z }`, or `{ type: 'out' }`.

## Player v2 (js/player.js)

Keep the v4 API and add:

- **Smoothing.** Mouse deltas accumulate into `targetYaw`/`targetPitch`; `yaw`/`pitch` ease toward them with time constant `0.045` s. Velocity accelerates toward the wanted velocity at `18` units/s² and decelerates at `24`. First-person head bob: vertical `0.03 sin(2 pi c)`, lateral `0.015 sin(pi c)` where `c` advances one cycle per `1.2` units traveled (walking) and fades out within `0.25` s of stopping; while swimming a slow `0.02` bob at `0.6` Hz instead. Run widens the FOV from `68` to `74` over `0.25` s (the renderer reads `player.fovTarget`).
- **Views.** `view` is `'first'` or `'chase'` (the old follow view is replaced; V toggles). Chase: `orbitYaw`, `orbitPitch` (elevation above horizontal, clamped `0.12..1.05`, default `0.42`), `orbitDist` (default `4.2`, wheel adjusts `2.5..7`); the camera's ideal position is `head + spherical(orbitDist, orbitYaw, orbitPitch)` where `head = pos + (0, 1.1 + heightOffset, 0)`; the actual camera position springs toward the ideal with factor `1 - exp(-dt * 10)`; the look target is `head + 0.4 * forward`; movement input is relative to `orbitYaw`; the character's facing yaw eases toward the movement direction at `10` rad/s and keeps its last facing when idle; when moving for more than `1.5` s without mouse input, `orbitYaw` eases toward the character yaw at `0.8` rad/s. Camera collision: march from the head toward the ideal position in `0.25` steps and stop before a tile that is `B` or `T` (or an interior obstacle), minimum distance `1.2`. Switching views eases the camera over `0.35` s (the renderer lerps). `cameraPose(outPos, outTarget)` returns the view's pose; it also exposes `player.fovTarget`.
- **Stations.** While at a station the camera follows the handle's rendered position (`player.anchorPos`, set by the renderer each frame: the group position), so rooftop stations work in both views. Leaving a station runs a `0.6` s eased walk-out from the anchor to `workPos` (`state 'idle'` only after it ends; movement input is ignored during it; the renderer sees `player.exiting = {from, to, t}`).
- **Interiors.** `player.interior = null | Room`. When the visitor's radius circle overlaps a department door zone (the two door tiles) while outdoors and not seated, swimming, or at a station, the player requests `enterInterior(room)`: the renderer fades (`player.fade = 'out' | 'in'` with `player.fadeT`) and after `0.35` s the player is placed at `room.spawn` with `floorY = room.floorY`; while `interior` is set, movement collision uses the room rectangle (`origin` to `origin + (w, d)`, inset by the radius) and `room.obstacles` instead of the tile grid; the prompt list inside is: exit zone `E  Go outside` (also triggered by walking into the zone: fade and reappear at `b.doorPos` outside), `board`, `portrait`. `heightOffset` is `0` inside; the camera uses `floorY` as the ground.
- **Golf controller.** When within `1.6` of a hole's tee (`state.golf.holes[n].tee`) the prompt is `E  Tee off, hole <n> (par <par>)`; at the range tee line `E  Hit some balls`. On E the player enters `state 'golf'` with `golf = { mode: 'hole' | 'range', hole: n, ball, club, phase: 'aim' | 'charging' | 'swinging' | 'flight' | 'walking' | 'holed' | 'done', power: 0, strokes, card: [strokes per hole], message: null }`. The character holds a club prop (built by the renderer from `club`) and stands `0.45` beside the ball with yaw facing the aim. Aim: the aim yaw is the look yaw in first person or `orbitYaw` in chase view; a thin aim line (renderer) shows direction and the carry estimate (`golf.aimPower` previews at 70 percent). Space held: `phase 'charging'`, `power` rises `0 -> 1` over `1.1` s then falls back (ping-pong) so timing matters; release: `phase 'swinging'` for `0.35` s with pose `'golf'` (`handle.golfPhase` 0..1 drives backswing to follow-through in the animators; the renderer sets it from `golf.swingT`), then `strike(ball, { club, power, yaw, lie })`, `strokes += 1`, `phase 'flight'`. During flight the camera follows the ball (`player.followBall = ball` for the renderer's camera: chase behind the ball at `3.5`, `0.35` elevation, spring `1 - exp(-dt * 6)`). On `rest`: `phase 'walking'`: the player eases to a spot `0.6` behind the ball (toward the previous position) at `5.2` units/s ignoring the grid but staying inside the park bounds, then `phase 'aim'`. Club auto-select on each aim: putter on the green, driver when the cup is farther than `9`, otherwise iron; keys `1 2 3` override until the next shot. `water` and `out`: `strokes += 1`, message `Splash. Penalty stroke.` / `Out of bounds. Penalty stroke.`, ball dropped at `lastRest`. `holed`: message `Hole <n>: <strokes> (par <par>)` with the golf term (`Birdie`, `Par`, `Bogey`, `Double bogey`, `Hole in one`), `card[n] = strokes`, `phase 'holed'` for `2.5` s, then auto-walk to the next tee and `phase 'aim'`; after hole 3 `phase 'done'` with `Round: <total> (par 9)` and `E  Play again` / `X  Leave`. `X` leaves golf at any time (ball removed, club dropped, `state 'idle'`). Range mode: unlimited balls from the mat, message shows carry distance in tiles after each shot, `X` leaves.
- Poses: `'golf'` (new) for both character kinds: address stance with the club down, backswing to the right proportional to `handle.golfPhase` 0..0.5, downswing and follow-through 0.5..1. Also `'golfIdle'` = address stance.
- Everything stays allocation-free in `update`, never NaN, clamped.

## Animators (js/aliens3d.js, js/animals3d.js)

Add poses `golf` and `golfIdle` as described (both kinds), reading `handle.golfPhase` (0..1, default 0). Nothing else changes.

## Renderer integration (js/render3d.js)

- Ground painter: colors for `FW` (fairway `#7FBF5F` with mowing stripes alternating `#78B85A` every tile), `GR` (green `#9BD47A`, finer stripes, a dark cup dot is drawn by golf.js instead), `SA` (sand `#E7D9B0` with speckles), `TEE` (tee `#6FB356`). Shore sand around water inside the park as elsewhere. Map-size constants already derive from `TT.sim`.
- Build interiors (`buildInteriors`) and golf (`buildGolf`) after the world; call their `update` each frame; call `refreshBoards` when the roster changes (same trigger as building scale) and once after avatars exist.
- **Visitor fades and interiors.** Watch `player.fade`: fade the canvas with a full-screen navy overlay element `#fade` (opacity eased) rather than fading meshes; when the player is inside a room: render only that room lit, hide agent overlays and tags, set the sky and fog to the room's dark ceiling color, and keep the sun shadow camera unchanged. Agents keep simulating outside.
- **Chase camera input.** In walk mode the mouse deltas go to `player.setInput({lookDX, lookDY})` in both views; the wheel adjusts `orbitDist` in chase view (`player.setInput({zoom: deltaY})`) and does nothing in first person. `V` toggles views; the camera eases between poses over `0.35` s. FOV eases toward `player.fovTarget`. Head bob comes from `cameraPose` (no renderer work).
- **Stations.** Set `player.anchorPos` from the handle's group position every frame while at a station; for `enter === 'inside'` stations teleport the handle to the anchor after a `0.3` s fade; walk-out eases the group from the anchor to `workPos` using `player.exiting`.
- **Golf.** Build the club prop (`driver`: long shaft with a navy head; `iron`: shorter with a silver blade; `putter`: short with a flat aqua head) and attach it to `handL` while in golf; set `handle.golfPhase = player.golf.swingT`; draw the aim line (a thin `Line` from the ball along the aim yaw, length from `golf.aimPower` carry estimate, dashed, hidden in flight); the ball mesh and trail come from golf.js; the camera follows `player.followBall` during flight; HUD writes to `#golf-hud` (hole, par, strokes, club, round card) and `#golf-power` (a bar whose width is `power`), `#golf-msg` for messages.
- `TT.town.tick(seconds)` keeps stepping the player and golf; `TT.town.setWalkInput` accepts `zoom`, and keys `1 2 3 X`.
- `TT.town._debug` additionally exposes `player`, `interiors`, `golf`.

## UI (js/ui.js, index.html, css/style.css)

- Inside `#stage-host`: `#fade` (full-cover navy overlay, `pointer-events: none`, opacity 0), `#golf-hud` (top right card: `Hole 2 · Par 3 · Stroke 1`, club line, scorecard row for three holes and total), `#golf-power` (bottom center meter: outer track and inner bar, hidden unless charging or aiming), `#golf-msg` (center banner, hidden unless a message is set), `#interior-hint` (small pill `Inside <dept>. Walk to the door to leave`, hidden unless inside). All `pointer-events: none`, hidden unless walk mode and the relevant state.
- The walk-mode legend adds lines: `Golf: hold Space to swing, 1 2 3 clubs, X leave` and `View: V (first person / chase)`.
- No other UI changes. No em dashes. Sentence case.

## Verification each module must do

- Syntax via `node --check` (modules through `.mjs` copies); Node import tests with `three` rewritten to node_modules file URLs and `window.TT` stubbed.
- sim: headless load; assert `ROWS === 68`, the three holes have tee and cup inside their blocks, cups inside greens, no trees on course tiles, agents never path onto `GR/SA/TEE/FW` over 120 s, `isEnterable` true for course tiles, door tiles exist for all twelve departments.
- interiors: build with a fake state (twelve departments), assert twelve rooms with doors, spawns inside the floor rectangle, obstacles inside the room, at least one `board` and one `exit` interactable each, `refreshBoards` runs with fake stats and avatars without throwing.
- golf: `strike` plus `stepBall` with the driver at full power carries between `11` and `15` units on a flat fairway and comes to rest; a putt of power `0.5` from `3` units on the green reaches within `0.5` of the cup or holes; a putt aimed exactly at the cup from `1` unit at power `0.3` is `holed`; a shot into water yields `water`; a shot beyond bounds yields `out`.
- player: extend the v4 scenario test: smooth look (yaw reaches the target within `0.3` s and never overshoots), chase camera orbit and collision pull-in, interior enter and exit through a fake door zone with obstacles blocking, station walk-out timing, golf: tee off, charge, swing, flight, walk to ball, putt, holed, card updated, `X` leaves; no NaN anywhere.
- integration smoke (final agent): all twelve stations usable by the player in a headless run against the real map (enter, assert `state 'station'` and `rec.worker === 'player'`, assert the handle position changes or the activity updates without throwing over 2 s, leave and assert `worker` cleared and the walk-out ends at `workPos`); enter and exit every interior; play hole 1 to completion with scripted perfect aim.
