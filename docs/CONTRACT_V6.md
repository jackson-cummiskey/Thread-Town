# Thread Town 3D, version 6: the subway runner

Adds to `docs/CONTRACT_V5.md` and earlier contracts; where they disagree, this file wins. Everything not mentioned here stays as it is.

## What version 6 adds

An endless-runner mini game ("Thread Metro") in the spirit of Subway Surfers: three lanes, automatic forward motion that speeds up, lane switching, jumping, ducking, obstacles, coins, power-ups, distance tracking (run, best, lifetime), entered from a subway entrance in the plaza while in walk mode.

## Files

```
js/subway.js        new ES module: the whole mini game (scene, track generator, player runner, obstacles, pickups, physics, scoring, HUD data)
js/sim.js           the subway entrance record on the plaza
js/render3d.js      integration (second phase): entrance geometry, the game scene switch, input routing, HUD writes, character handoff
js/ui.js, index.html, css/style.css   runner HUD and summary card
docs/SUBWAY_DESIGN.md   written by the design phase
```

## Entrance (js/sim.js)

- `state.subway = { tile: {x, y}, pos: {x, y}, yaw }`: the entrance sits on the plaza's south edge, centered, two tiles north of the road: `tile = {x: plaza.x + 7, y: plaza.y + 12}`, `pos = {x: tile.x + 0.5, y: tile.y + 0.5}`, `yaw = 0` (stairs descend toward the south). The entrance footprint is the 2 by 2 tiles `plaza.x + 6 .. plaza.x + 7`, `plaza.y + 11 .. plaza.y + 12`; those tiles become type `FT` (not walkable for agents) so nobody walks through the railing. The visitor's enter zone is the tile row just south of the footprint (`plaza.y + 13`, both columns).

## The game module (js/subway.js)

```js
import * as THREE from 'three';
export function createSubwayGame(ctx) -> Game
```

`ctx = { THREE, makeCharacter: (spec) => handle, animate: (handle, fakeAgent, time, dt, poseOverride) => void, storage: { get(key), set(key, value) } }`.

`Game` API:

- `scene`, `camera` (its own `PerspectiveCamera`, fov 70), `group` (everything the game renders lives in its own scene, so the town is never visible from inside).
- `start(spec)`: builds (or rebuilds) the runner from the visitor's character spec, resets the run, starts in a `ready` state (a 3-2-1 countdown of `2.4` s during which the track scrolls slowly).
- `setInput({ left, right, jump, duck, restart, quit })`: edge inputs for left, right, jump, restart, quit; `duck` is held.
- `update(dt, time)`: advances the run. Returns `null` or one of `{ type: 'quit' }`, `{ type: 'gameover', distance, coins, best, lifetime }`.
- `hud()`: `{ state: 'ready' | 'running' | 'dead', distance, coins, best, lifetime, speed, powerUp: null | { kind, remaining }, shield: boolean, multiplier: 1 | 2, countdown }` for the renderer to write each frame.
- `resize(w, h)`, `dispose()`.

**Track.** Three lanes at x `-1.6, 0, 1.6` (world units; the runner is the same character scale as the town, `ALIEN_SCALE` 1.3). The track scrolls toward the runner (the runner stays near z = 0, the world moves). Tunnel segments `24` units long are generated ahead (keep `6` ahead, recycle behind): tunnel walls with tiled brick texture (canvas), arched ceiling lights every `6` units, rails and sleepers in each lane, occasional open-air segments (every 4th to 6th segment) with city silhouettes and sky. Pooled meshes only; no allocation after start.

**Speed.** Starts at `9` units/s, rises `+0.35` per second to a cap of `24`. Distance in meters = world units traveled times `1.5`, shown rounded.

**Obstacles** (spawned by a seeded pattern generator with difficulty rising with speed, never an unavoidable row):
- `barrier` (low, jump over; height 0.9; hit if not airborne above 0.6),
- `sign` (overhead, duck under; bottom at 1.1; hit if not ducking and not sliding),
- `train` (parked, fills a lane for 12 to 20 units; hit on contact; the roof is reachable by jumping from a `ramp` placed in front of some trains, running on the roof at height 2.0 and dropping off the end),
- `oncoming` (a moving train in a lane, approaching at `+8` units/s relative; a warning headlight and horn flash 1.5 s before it reaches the runner),
- `gap` rows never block all three lanes at once; at most two lanes of hard obstacles per 6 units.

**Pickups.** Coins (Thread aqua discs, `0.22` radius) in rows of 5 to 10 along a lane, sometimes in jump arcs over barriers; collected within `0.5` units (or `3.0` with Magnet). Power-ups appear every 90 to 150 units on a random free lane: `magnet` (8 s), `shield` (until hit, max 25 s), `double` (12 s, coin value 2), `jet` (6 s: the runner flies at height 3.2 above everything, lanes still switch, coins at that height appear). Only one timed power-up at a time; shield stacks with the others.

**Runner physics.** Lane switch eases over `0.18` s. Jump: initial vertical speed `7.5`, gravity `22`, hold-jump adds nothing (fixed arc). Duck: slide for `0.7` s with the body lowered (pose `slide`). Collision uses the runner's AABB (`0.5` wide, height `1.1` standing, `0.55` sliding) against obstacle AABBs. Hit with a shield: the shield pops (`0.6` s invulnerability); without: `gameover`.

**Scoring.** `distance` for the run; `best` and `lifetime` persisted through `ctx.storage` under `threadtown.subway.v1` as `{ best, lifetime, coins }`. `coins` accumulate lifetime too.

**Character animation.** Use `ctx.animate` with a fake agent `{ state: 'idle', pose, animT, speed, moveDir: {x: 0, z: 1}, yoff }`: pose `walk` with `speed` set to the current run speed (the animators scale the cycle by speed), `hop` while airborne (`yoff` from the jump height), `slide` while sliding (new pose: both character kinds crouch low with arms back), `stand` in `ready` and `slump` on death. The runner faces +z... the track moves toward -z, so the runner faces away from the camera (`rotation.y = Math.PI`) and the camera sits `4.5` behind and `2.2` above, looking `3` units ahead, with a soft lateral follow of the lane (`1 - exp(-dt * 8)`), slight FOV increase with speed (`70` to `78`), and a shake on hits.

**Audio.** None.

## Animators (js/aliens3d.js, js/animals3d.js)

Add pose `slide`: body lowered to about 55 percent height, pitched back 0.3 rad, arms swept back, legs forward (quadrupeds belly-slide, birds tuck). Nothing else changes.

## Renderer integration (js/render3d.js, second phase)

- Build the subway entrance geometry at `state.subway`: a stair well cut as a dark rectangle (recessed box) with descending steps, green railings with globe lamps, a "THREAD METRO" sign on a post (canvas decal in Kanit), a mosaic tile band; add it to the merge pass if static.
- Walk mode: when the visitor stands in the enter zone the prompt is `E  Take the subway`; on E (or walking down the stairs: entering the footprint from the south) the renderer fades out, sets `gameMode = 'subway'`, calls `subway.start(playerSpec)`, and renders the game's scene and camera instead of the town until `update` returns `quit` or the summary's exit; input in game mode: A/D/Left/Right lanes, W/Space/Up jump, S/Down/Ctrl duck (held), R restart (on the summary), E or Esc quit back to the town (fade in at `state.subway.pos` facing north, walk mode still on). The town keeps simulating underneath (agents, lights) but is not rendered.
- HUD: `#runner-hud` (top: distance, coins, best; a power-up chip with a shrinking bar), `#runner-center` (countdown numbers, `Game over` summary card with distance, coins, best, lifetime, and `R  Run again` / `E  Back to town`).
- `TT.town.setSubwayInput(input)` for headless tests; `TT.town.tick` steps the game while in game mode; `_debug.subway`.

## UI

- `#runner-hud` and `#runner-center` inside `#stage-host`, hidden unless `body.subway`; the walk legend gains `Subway: A D lanes, W jump, S duck`.

## Verification

- subway.js: Node test (three rewritten; `document` canvas stubbed or guarded; `makeCharacter` returns `{ group: new THREE.Group(), parts: {} }`; `animate` a no-op; storage a Map): start, countdown ends, running for 60 simulated seconds with scripted inputs never hitting an obstacle when the generator's rows are read back and dodged (use `game._debug.rowsAhead()` to script), distance grows monotonically, speed caps at 24, a scripted hit without shield returns `gameover` with the right numbers, best and lifetime persist across two runs, a shield absorbs one hit, magnet collects coins from a neighboring lane, jet passes over a train, quit returns `{type: 'quit'}`, no NaN, no allocation growth after start (heap delta under 2 MB over 3000 frames).
- No em dashes. Sentence case.

## Leaderboard (js/leaderboard.js, new ES module; wired in the integration phase)

```js
export function createLeaderboard(storage) -> { record(game, entry), top(game, n = 10), all(), clear(game) }
```

- Storage key `threadtown.leaderboard.v1`: `{ subway: [entry], golf: [entry] }` where `entry = { name, character: 'alien' | speciesId, score, detail, at: epoch ms }`. The `name` is the walk-mode display name (`TT.player.spec.name`), the character the species or `'alien'`.
- `subway` entries: `score` = distance in meters (higher is better), `detail = { coins, seconds }` where seconds is the run duration. Recorded by the renderer on every `gameover` event.
- `golf` entries: `score` = total strokes for a completed three-hole round (lower is better), `detail = { seconds, card: [h1, h2, h3] }` where seconds runs from the first charge on hole 1 to the `done` phase. Recorded by the renderer when `player.golf.phase` becomes `done`. Range sessions are not recorded.
- `top(game)` sorts subway descending by score and golf ascending by score, then by earlier `at`, and keeps at most 50 entries per game in storage.
- **UI**: a header button `Leaderboard` opens `#leaderboard-modal` with two tabs (Subway, Golf) listing rank, name with a tiny character badge, score, detail, and date; `Clear` per tab with a confirm. The sidebar gets a compact `Leaderboard` section showing the top three of each game. Refresh both when a record is added.
- **In the town**: a scoreboard sign at the clubhouse porch (golf top five) and one beside the subway entrance (subway top five), canvas decals in Kanit refreshed when records change; built by the renderer's integration phase.
- The game-over summary card and the golf round summary show the player's rank for that result (`Rank 2 of 7`).
