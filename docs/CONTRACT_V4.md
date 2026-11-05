# Thread Town 3D, version 4: walk mode (first-person visitor)

Adds to `docs/CONTRACT_V3.md`, `docs/CONTRACT_V2.md`, and `docs/CONTRACT.md`; where they disagree, this file wins. Everything not mentioned here stays as it is.

## What version 4 adds

A **walk mode** where the viewer becomes a character in the town: walk the streets in first person (or a third-person follow view), talk to agents, grab an ice cream or coffee at the café and sit down, swim in the pond, dive off the board, climb out by the ladder, ride the swings, walk the high wire, and try any department's station when nobody is working there.

## Files

```
js/player.js        new ES module: the player character, movement, collision, interactions, camera placement
js/render3d.js      integration: mode switching, input (keys, pointer lock), per-frame player sync, prompts, talk pause
js/ui.js, index.html, css/style.css   Walk button, avatar picker, HUD, prompt pill, crosshair
js/sim.js           seat reservation helpers for the player
```

## The player object (`TT.player`, owned by js/player.js)

The player is shaped like an agent so the existing animators work on it unchanged (`animateAlien` / `animateAnimal`, `animateLeisure`, `swimOffsets`, `attachProp`, `detachProp` all read the same fields):

```js
TT.player = {
  active: false,
  spec: { name: 'You', role: 'Visitor', kind: 'alien' | 'animal', species: null | speciesId, color: '#75CCD0', demo: false },
  id: 'player',
  // agent-like fields read by the animators
  pos: { x, y }, moveDir: { x: 0, z: 1 }, facing: 1, speed: 3.0, animT: 0, yoff: 0, blinkAt: 0, lookAt: 0, paused: false,
  state: 'idle' | 'leisure' | 'station',
  pose: 'stand' | 'walk' | 'sit' | 'swim' | 'dive' | 'climb' | 'hop' | <activity pose>,
  leisure: null | { kind: 'icecream' | 'coffee' | 'bench' | 'swim', seat, phase, spot, dive, until, t0 },
  onBoard: false, jumpT: 0, splash: -1,
  held: null | 'icecream' | 'coffee',
  // walk-mode fields
  view: 'first' | 'third', yaw: number, pitch: number,
  station: null | buildingRec,        // the department station the player is using
  talkingTo: null | agentId,
  prompt: null | { text: string, key: 'E' | 'Space' },   // what the HUD shows
  mesh: handle | null,
};
```

`state` and `leisure.phase` reuse the exact agent vocabulary so `animateLeisure` behaves: seated leisure is `state: 'leisure', leisure.phase: 'seated'`; swimming is `leisure.kind: 'swim'` with phases `'wading'`, `'boarding'`, `'bouncing'`, `'diving'`, `'swimming'`, `'leaving'`, `'climbing'` (same meanings as `docs/CONTRACT_V2.md`).

## js/player.js (new ES module)

```js
import * as THREE from 'three';
export function createPlayer(ctx) -> Player
```

`ctx = { THREE, sim: TT.sim, state: TT.state, deptById: TT.deptById, getRecs: () => buildingRecs, getAgentHandle: (agentId) => handle | null, log: TT.log }` (the renderer supplies the accessors).

`Player` API (also assigned to `TT.player` by the renderer):

- `enter(spawn?)`: activates walk mode at the plaza spawn point (plaza center plus `(0.5, 4.5)` tiles south of the fountain, facing north, yaw `Math.PI`), resets state, releases any seat.
- `exit()`: deactivates, releases seats, leaves any station, drops the held prop, clears `talkingTo` and any agent pause it set.
- `setInput(input)`: the renderer feeds `{ fwd: -1..1, side: -1..1, run: bool, jump: bool (edge), interact: bool (edge), lookDX: px, lookDY: px, toggleView: bool (edge) }` once per frame; the module consumes edges.
- `update(dt, time)`: moves the player, resolves collisions, runs the state machine (walk, swim, board, dive, climb, sit, station, talk), computes `prompt`, updates `moveDir`, `pose`, `animT`, `yoff`, `onBoard`, `jumpT`, `splash`.
- `cameraPose(outPos, outTarget)`: fills the camera position and look target for the current view and look angles. First person: eye at `pos + (0, 1.35 + heightOffset, 0)` plus `0.12` forward, looking along `(yaw, pitch)`; third person: `3.6` units behind along `-forward` (ground-projected), `2.1` up, looking at the head (`pos + (0, 1.1, 0)`), with the camera raised when the ray from the head to the camera crosses a blocked tile (step the camera closer until clear, minimum `1.2`). `heightOffset` is the leisure height (board, dive arc, swim depth) so the eye follows the body.
- `interactables()`: returns the current list (for debugging and tests).
- `debugState()`: a compact snapshot for tests.

**Movement.** WASD or arrows move relative to the look yaw (ground plane). Speeds: walk `3.0` tiles/s, run (Shift) `5.2`, swim `1.6`, on the pier `2.4`. Acceleration eases over about `0.12` s so stops are not abrupt. The player has radius `0.28`. A position is allowed when the tile under each of the four radius points is enterable. Enterable: `G, P, Z, F` tiles always; `WA` tiles only while swimming or when stepping into water from a shore tile (that step begins swimming: `state 'leisure', leisure {kind: 'swim', phase: 'wading', dive: false}`, then `'swimming'` once the center is over water, with `splash = time`); the pier rectangle (`pier.base.x +- 0.6`, z from `pier.boardEnd.y - 0.15` to `pier.base.y + 0.5`) is walkable at height `pier.height` even over water, and the springboard part (`z < pier.boardStart.y`) sets `onBoard = true`. Buildings (`B`), trees (`T`), the fountain (`FT`), and off-map are blocked. Sliding: try the x move and the z move separately so you slide along walls.

**Swimming and diving.** While swimming, WASD moves at swim speed over water tiles; shore tiles are enterable from water (you wade out: `phase 'leaving'` for the half tile, then `state 'idle'`). On the board end (`z <= pier.boardEnd.y + 0.2` while `onBoard`) the prompt is `Space  Dive`; Space runs the agent dive: `phase 'diving'`, `jumpT` 0 to 1 over `1.1` s moving linearly from the current position to `pier.landing`, then `splash = time`, `phase 'swimming'`. Space anywhere else on land is a small hop (`yoff` arc, `0.55` s) and does nothing in water. Near the ladder (`within 0.9 of pier.ladder` while swimming) the prompt is `E  Climb out`; E runs `phase 'climbing'` for `0.8` s easing to `pier.base`, then `state 'idle'` standing on the pier.

**Interactions (E).** Every frame compute the nearest interactable within `1.7` units in this priority order and set `prompt`:
1. An agent (`TT.state.agents`, visible ones): `E  Talk to <name>`. On E: `talkingTo = id`; set `agent.talkUntil = time + 6`, `agent.bubble = { text: greeting, until: time + 5.5, kind: 'ok' }` where greeting is `Hi, I'm <name>, the <role>. <now>` and `<now>` is `Right now I'm <activityLabel lowercased>.` while working, `Having ice cream at the café.` / `Having coffee at the café.` / `Taking a break on a bench.` / `Swimming in the pond.` for leisure, `Heading to work.` while commuting, else `Just taking a stroll.`; select the agent (`TT.state.selected = {kind: 'agent', id, agent}` and call `TT.onSelect`). Clear the bubble yourself when `time > bubble.until` if the agent is still idle (the sim only clears report and error bubbles).
2. The café counter (within `1.7` of the café `doorPos`): `E  Grab an ice cream` (alternates with coffee on each use); on E: `held = 'icecream' | 'coffee'` (the renderer attaches the prop). If already holding: `E  Put it back`.
3. A free seat (`state.seats`, `takenBy` null, within `1.7`): `E  Sit down`; on E: `TT.sim.reserveSeat(seat.id, 'player')`, `state 'leisure'`, `leisure { kind: seat.kind === 'cafe' ? (held || 'icecream') : 'bench', seat, phase: 'seated', until: Infinity }`, position snaps to the seat tile center, `moveDir` faces `seat.face`. While seated: `E  Stand up` releases the seat. Movement keys also stand up.
4. The ladder while swimming (above).
5. A department station with no worker (`rec.worker == null`, within `1.7` of the station center): `E  <activityLabel>` (for example `E  Walking the high wire` reads oddly, so use the label with the verb form the module gives; if it starts with a gerund, prefix `Try: `). On E: `state 'station'`, `station = rec`; the renderer positions the player at the anchor and runs the activity with the player's handle exactly as for a working agent (walk-in only, no inside fade; if `enter === 'inside'` teleport to the anchor). While at a station: `E  Leave`.
6. A department building door (within `1.9` of `b.doorPos`): `E  Visit <dept name>`; on E select the department (`TT.state.selected = {kind: 'dept', ...}`, `TT.onSelect`).
Otherwise `prompt = null`.

**Pose.** Standing `'stand'`, moving `'walk'`, seated `'sit'`, swimming `'swim'`, diving `'dive'`, climbing `'climb'`, hop `'hop'` with `yoff`, at a station the activity's pose. Keep `animT` advancing while moving so the walk cycle plays; `speed` reflects the current speed so the cycle rate matches.

**Robustness.** Never set NaN; clamp inside the map; if the spawn tile is blocked, search outward for a walkable tile. Allocation-free in `update` (module-scope scratch vectors). No DOM access inside player.js (the renderer owns the HUD).

## Renderer integration (js/render3d.js)

- Create the player once after the world is built: `player = createPlayer({...})`, `TT.player = player`. Build its handle with the same character factory used for agents (`makeAlienMesh(seed, color)` or `makeAnimalMesh(seed, color, species)` by `spec.kind`), scale `ALIEN_SCALE`, add a contact shadow, add to the scene only while active.
- `TT.town.setWalkMode(on, spec?)`: on enter, exit board cinematic, store the previous camera mode, set `camMode = 'walk'` (a third mode: OrbitControls disabled, the free-roam pointer handlers disabled, hover picking disabled), call `player.enter()`, show the HUD; on exit call `player.exit()`, restore the previous camera mode, and `resetView()`. `TT.town.walkMode()` returns the boolean. Walk mode also exits when board mode is entered.
- **Input.** In walk mode: keys W A S D and arrows (movement), Shift (run), Space (jump or dive), E (interact), V (toggle view), Esc (release pointer lock; a second Esc with the pointer already released exits walk mode). Mouse look uses the Pointer Lock API on the renderer canvas (`canvas.requestPointerLock()` on click while in walk mode; read `movementX/Y` from `pointermove` while locked). Without pointer lock, right-drag also looks (reuse the drag deltas). Sensitivity `0.0022` rad per pixel; pitch clamped to `[-1.2, 0.9]` (you can look up at the lighthouse). Feed `player.setInput` once per frame; ignore keys when typing in a form field.
- **Per-frame sync** (after `TT.sim.tick`, before rendering): `player.update(dt, time)`; place the handle: `group.position` from `player.pos` plus leisure offsets (reuse the same code path as agents: `swimOffsets` / `animateLeisure` for `state === 'leisure'`, activity anchor and `activity.update(dt, time, {working: true, t}, playerHandle, true)` for `state === 'station'` with the station marked busy so agents do not take it: set `rec.worker = 'player'` while the player uses it and clear it on leave); rotation from `player.yaw` when walking (face the look direction) or the seat/anchor yaw; `rec.animate(handle, player, time, dt, poseOverride)`; attach/detach the held prop via `attachProp(handle, held)` / `detachProp(handle)` when `held` changes; hide the body meshes in first-person view (keep the shadow) and show them in third person. Then `player.cameraPose(camera.position, controls.target)` and `camera.lookAt(controls.target)`; `controls.update()` is skipped in walk mode.
- **Talk pause.** Change the hover pause assignment to `a.paused = isHov || (a.talkUntil !== undefined && a.talkUntil > time)`; while `a.talkUntil > time`, the agent faces the player position (not the camera) when its pose is `wave`.
- **Prompt and HUD.** Each frame copy `player.prompt` to the HUD prompt element (`#walk-prompt`, text `<kbd>E</kbd> Talk to Zorp`), toggling its visibility; the crosshair (`#walk-crosshair`) shows only in first person; `#walk-hud` (controls legend) shows while walk mode is on. The renderer writes these DOM elements (ids fixed here) because it owns the per-frame loop; ui.js creates them.
- Overlays: the player gets no name tag; agent tags and bubbles keep working. Hover picking and the tooltip are off in walk mode.
- `TT.town.tick(seconds)` steps the player too, and `TT.town.setWalkInput(input)` lets tests feed input headlessly.

## UI (js/ui.js, index.html, css/style.css)

- Header button `#btn-walk` labeled `Walk the town` (becomes `Exit walk mode` while active). Tab key toggles it as well (when not typing).
- Avatar picker: the first time the button is pressed, a small modal `#walk-modal` asks for a display name (default `You`) and a character: radio `Alien` with a color swatch row of the twelve department colors (default Aqua), or `Animal` with a species select (the 24 species, title case). Remember the choice in `localStorage` key `threadtown.player.v1` and skip the modal next time (a small `Change character` link in the HUD reopens it). On confirm call `TT.town.setWalkMode(true, spec)`.
- HUD elements inside `#stage-host`: `#walk-hud` (top left card: `Walk mode`, legend lines for Move, Look, Run, Jump or dive, Interact, View, Exit), `#walk-prompt` (bottom center pill with a `kbd` key chip), `#walk-crosshair` (a 6 px dot with a soft ring at the center), all `pointer-events: none`, hidden unless walk mode is on. Hide `#cam-hint`, `#tip`, and the Reset view pill during walk mode.
- Board mode exits walk mode first.

## Sim additions (js/sim.js)

- `TT.sim.reserveSeat(seatId, holderId)` sets `takenBy` if free and returns the seat or null; `TT.sim.releaseSeat(seatId, holderId)` clears it only if held by that holder. Agents never pick a seat whose `takenBy` is set (already true).
- `TT.sim.isEnterable(x, y)` returns true for `G, P, Z, F` tile types (the player module adds its own water and pier rules).

## Verification each module must do

- Syntax: `node --check` on `.mjs` copies (modules) or directly (classic scripts).
- player.js: a Node import test (stub `window.TT` with `hash`, `rng`; rewrite `three` imports to node_modules file URLs) that builds a fake sim state (grid helpers `at`, `isEnterable`, seats, pier, shoreTiles, swimSpots, plaza, a building record with `doorPos`, `station`, `workTile`, `activityLabel`, a fake agent) and drives `update` with scripted input: walk 3 s north and assert the position changed and never entered a blocked tile; walk into a building and assert sliding; walk into the pond and assert `leisure.kind === 'swim'`; walk onto the pier to the board end and press Space, assert `jumpT` reaches 1 and `splash` is set; swim to the ladder and press E, assert `phase 'climbing'` then idle on the pier; approach a seat and press E, assert `takenBy === 'player'`, press E again and assert released; approach the agent and press E, assert `talkUntil` and `bubble` set and `TT.state.selected` set; `cameraPose` returns finite vectors in both views. No NaN anywhere.
- Integration: node --check; grep that `setWalkMode`, `walkMode`, `setWalkInput` exist on `TT.town`; the paused line includes `talkUntil`.
- No em dashes anywhere. Sentence case.
