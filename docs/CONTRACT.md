# Thread Town 3D: module contract

This document is the single source of truth for how the modules fit together. Agents building modules in parallel must follow it exactly. If something here is ambiguous, pick the simplest reading and leave a `// CONTRACT:` comment explaining the choice.

## Goal

Replace the 16px pixel-art canvas renderer with a real 3D renderer (Three.js, isometric camera, real lighting and soft shadows, smooth low-poly geometry) while keeping the existing simulation (map grid, pathfinding, agent state machine, fake-run simulator, stats, events) and the existing side-panel UI.

Visual target: a polished low-poly 3D town in the spirit of Monument Valley, Two Point Hospital, or Crossy Road. Soft pastel materials, warm sun, long soft shadows, emissive windows at night, lamps that glow. Characters are smooth rounded aliens, not pixel sprites. Read `docs/ART_DIRECTION.md` (written by the art-direction phase) for palette, proportions, and material values.

## Files and load order

`index.html` loads, in order:

1. `js/data.js` (classic script, unchanged API) defines `TT.DEPARTMENTS`, `TT.SEED_AGENTS`, `TT.TASKS`, `TT.FAIL_RESULTS`. It also creates `TT.ready = new Promise(r => { TT._readyResolve = r; })`.
2. `js/sim.js` (classic script) defines `TT.sim`, `TT.state`, `TT.hash`, `TT.rng`, `TT.log`, `TT.deptStats`, `TT.darkness`, `TT.deptById`, `TT.startJob`.
3. `js/aliens3d.js` (ES module) exports `makeAlienMesh`, `animateAlien`, `ALIEN_HEIGHT`.
4. `js/render3d.js` (ES module) imports three and aliens3d, defines `TT.town`, then calls `TT._readyResolve()`.
5. `js/ui.js` (classic script) waits for `DOMContentLoaded` and then `TT.ready`, then calls `TT.town.init(document.getElementById('stage-host'))`.

Import map in `index.html` (exact):

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>
```

Use only `three` and `three/addons/` imports. Three.js 0.160.0 is installed locally under `node_modules/three` (npm) and the import map points there so the page works without internet; the jsdelivr URLs above are the equivalent CDN addresses if a hosted copy is ever needed. No other external scripts, no image files, no downloaded assets. All textures are generated at runtime with 2D canvas (`THREE.CanvasTexture`).

The old pixel renderer (`js/town.js`, `js/alien.js`) moves to `js/legacy/` and is no longer loaded.

## Coordinate system

- The map is a grid of `COLS = 62` by `ROWS = 40` tiles. Tile `(x, y)` in the simulation maps to world position `(x, 0, y)`: simulation `x` is world `x`, simulation `y` is world `z`, world `y` is up. One tile = one world unit.
- Tile `(x, y)` covers world `x` in `[x, x+1)` and `z` in `[y, y+1)`. The center of tile `(x, y)` is world `(x + 0.5, 0, y + 0.5)`.
- Agent positions `agent.pos = {x, y}` are already in tile units with fractional centers (an agent standing on tile `(3, 4)` has `pos = {x: 3.5, y: 4.5}`). World position is `(pos.x, 0, pos.y)`.
- `agent.facing` is `1` when moving toward +x, `-1` toward -x. The 3D renderer should rotate the alien to face its actual movement direction (track the last movement vector), falling back to facing the camera (toward +z) when standing still, and facing the building (toward -z) while working.
- Ground is at world `y = 0`. Buildings, trees, and props sit on it.

## Tile types (from `TT.sim.TILES`)

`G = 0` grass, `P = 1` path/road, `WA = 2` water, `B = 3` building footprint, `T = 4` tree, `Z = 5` plaza paving, `F = 6` grass with flowers, `FT = 8` fountain basin (not walkable). `TT.sim.at(x, y)` returns the type, or `-1` off map.

## `TT.sim` (js/sim.js, classic script)

Extracted from the current `js/town.js` with all canvas code removed. Public surface:

```js
TT.sim = {
  TILES: { G, P, WA, B, T, Z, F, FT },
  COLS, ROWS,
  state,                     // see below; also exposed as TT.state
  init(),                    // build the map and seed the roster. Idempotent.
  tick(dt),                  // advance time by dt seconds: run the simulator, update every agent
  at(x, y),                  // tile type
  walkable(x, y),            // boolean
  findPath(sx, sy, tx, ty),  // BFS over walkable tiles; array of {x, y} excluding start, or null
  startJob(agent, opts),     // opts: {task, result, duration, ok}
  finishJob(agent),
  addAgent(spec, opts),      // opts: {seedHistory: boolean}. Returns the agent.
  removeAgent(id),
  runNow(id),
  deptStats(),               // [{dept, agents, runs, fails, active}]
  darkness(),                // 0..0.62 from settings.lighting and the wall clock
  log(text, kind, agent),
};
```

`state` shape (unchanged from today):

```js
{
  time,                                   // seconds since load, advanced by tick()
  settings: { lighting: 'auto'|'day'|'night', simulate: true, showDemo: true },
  selected: null | {kind:'agent', id, agent} | {kind:'dept', id, dept, building},
  hover:    null | same shape,
  buildings: [{ kind: 'dept'|'cafe', dept?, name?, x, y, w, h, door: {x, y}, workTile: {x, y}, workPos: {x, y}, active, block: {x, y}, wall?, roof?, accent? }],
  trees:   [{ x, y, v }],                 // v in 0..2 is a variety index
  decos:   [{ type: 'fountain'|'bench'|'table', x, y }],   // x, y are tile-unit positions (may be fractional)
  lamps:   [{ x, y }],                    // tile-unit positions (fractional centers)
  waterTiles: [{ x, y }], plazaTiles: [{ x, y }], hangouts: [{ x, y, spot }],
  plaza:   { x, y, w, h },
  cafe:    building,
  agents:  [agent],
  events:  [{ at, text, kind, agentId }],
}
```

Agent shape:

```js
{
  id, spec, dept,
  pos: { x, y }, facing: 1|-1, frame, animT, yoff, speed,
  state: 'idle'|'commute'|'working'|'report'|'error',
  path: [{x, y}], waitUntil, job: null | { task, result, ok, duration, start, end },
  bubble: null | { text, until, kind: 'ok'|'error' },
  history: [{ at, task, result, ok, ms }],
  blinkAt, lookAt,
  // set by the renderer:
  mesh,          // the alien mesh handle from makeAlienMesh
  avatarURL,     // data URL of a small rendered portrait, for the side panel
  moveDir: { x, z },  // last movement direction, unit length, updated by the renderer or sim
}
```

Frame semantics are kept for compatibility but the 3D animator reads `state`, `animT`, `blinkAt`, `yoff`, and `job` directly: `0` stand, `1-4` walk cycle, `5-6` typing, `7` blink, `8` slump.

`sim.tick(dt)` must also update `agent.moveDir` when the agent moves (normalize the step vector), so the renderer never has to re-derive movement.

Behavior that must survive the extraction exactly: wander targets (plaza, hangouts, random walkable), per-agent stroll speed, blinking and looking around while standing, commute at 2.6 tiles/s, typing bursts with pauses, the report hop (`yoff`), the slump on error, simulator target of roughly 30 percent of visible agents busy, seeded 7-day history by cadence, `deptStats`, `darkness` schedule, and the event log.

## `js/aliens3d.js` (ES module)

```js
import * as THREE from 'three';
export const ALIEN_HEIGHT = 0.9;            // world units, feet to top of head, before antennae
export function makeAlienMesh(seed, colorHex, opts = {}) -> AlienHandle
export function animateAlien(handle, agent, time, dt)
export function disposeAlien(handle)
```

`AlienHandle`:

```js
{
  group: THREE.Group,       // add this to the scene; position it at the agent's feet (y = 0)
  traits: { shape: 'blob'|'tall'|'squat'|'pear', eyes: 1|2|3, antennae: 0|1|2, spotted: boolean },
  parts: { body, head?, eyes: [Mesh], pupils: [Mesh], lids: [Mesh], antennae: [Group], armL, armR, legL, legR, ring },
  color: THREE.Color,
}
```

Rules:

- Traits are seeded from `seed` with `TT.hash` and `TT.rng` (use `window.TT`), so the same agent always gets the same alien. Body color comes from `colorHex` (the department's `alien` color). Keep the pupil/eye highlight and antenna tip accent generated from the seed.
- Smooth geometry: spheres, capsules, rounded boxes (`RoundedBoxGeometry` from `three/addons/geometries/RoundedBoxGeometry.js`), with enough segments to look round at the camera distance (sphere 24x16 is fine). Materials: `MeshStandardMaterial` with roughness 0.6 to 0.9, no textures needed. Eyes are white spheres with dark pupils and a tiny specular highlight sphere. Every mesh casts shadows; the body receives none.
- `parts.ring` is a flat ring on the ground used as the selection/hover indicator. It is invisible by default; the renderer toggles `ring.visible` and `ring.material.color` (Aqua for hover, Aqua brighter for selected).
- Scale: feet at `y = 0`, body top at about `ALIEN_HEIGHT`, antennae above that. Width roughly 0.5 to 0.7 units.
- `animateAlien(handle, agent, time, dt)` sets the pose from the agent:
  - `idle` with a non-empty `agent.path`: walk cycle. Bob the body vertically with a sine at about 7 Hz scaled by speed, swing arms opposite to legs, tiny forward lean, antennae lag behind the motion.
  - `idle` standing: gentle breathing (scale y 1.0 to 1.03 at about 0.6 Hz), blink when `time < agent.blinkAt + 0.14` (scale eyes y toward 0.1 or show lids), occasional slow head turn.
  - `commute`: walk cycle, faster.
  - `working`: arms forward and down toward a desk at about chest height, alternating small up/down taps in bursts (use `agent.animT % 3.2 < 0.7` as the pause window, same as the simulation), head tilted slightly down, antennae twitch on each burst.
  - `report`: stand, apply `agent.yoff` (negative means up; convert tile-pixel units to world by multiplying by `-0.06`) as a hop, eyes wide (scale 1.15).
  - `error`: slump: body scale y 0.9, lean forward 0.25 rad, arms hanging, antennae droop, pupils look down.
  - Rotation: face `agent.moveDir` when moving. When working, face -z (toward the building north of the work spot). When standing idle, ease toward facing +z (camera side) with a small random yaw from the seed.
- Keep `animateAlien` allocation-free in the hot path (no `new Vector3` per frame; keep scratch vectors at module scope).

## `js/render3d.js` (ES module)

Owns the Three.js scene and replaces `TT.town`.

```js
TT.town = {
  init(container),      // builds renderer, scene, camera, controls, overlay; starts the rAF loop
  tick(seconds),        // advance the sim by `seconds` in 1/30 steps without rAF, then render once (used for testing in a hidden tab)
  agents(), events(), settings,
  select(p), startJob, runNow(id), addAgent(spec, opts), removeAgent(id),
  avatar(agent) -> dataURL,                      // 96x120 portrait rendered from the agent's alien mesh
  previewAvatar(name, role, deptId) -> dataURL,  // for the add-agent form
  setCinematic(on),     // slow auto-orbit for board mode
  resize(),
};
TT.deptStats = TT.sim.deptStats; TT.darkness = TT.sim.darkness;
TT.ready resolves after TT.town is defined.
```

Responsibilities:

- **Container**: `init(container)` appends the WebGL canvas (fills the container, `position: absolute; inset: 0`) and an overlay `div#overlay` (`position: absolute; inset: 0; pointer-events: none; overflow: hidden`) used for HTML labels. The container is `#stage-host` which is `position: relative` and flex-fills the stage area. Handle `ResizeObserver` on the container.
- **Camera**: `PerspectiveCamera` with a low FOV (about 28 degrees) placed to the south-east and above, looking at the map center `(COLS/2, 0, ROWS/2)`, framing the whole map at load for any aspect ratio (compute distance from the map's bounding box and the FOV). Use `OrbitControls` from `three/addons/controls/OrbitControls.js` with: damping on, zoom allowed between about 0.6x and 2.5x of the fit distance, polar angle between 0.55 and 1.15 rad, pan limited so the target stays inside the map, right-drag pans, left-drag rotates. `setCinematic(true)` enables `autoRotate` at a slow speed.
- **Lighting**: `HemisphereLight` (sky to ground) plus one `DirectionalLight` sun with `castShadow`, shadow map 2048 or 4096, orthographic shadow camera sized to the map, `PCFSoftShadowMap`. Day/night: read `TT.sim.darkness()` every frame and lerp sun intensity and color (warm white to deep blue, low intensity), hemisphere colors, background/fog color (sky gradient day to navy night), and the emissive intensity of window materials and lamp bulbs. Each lamp gets a `PointLight` (no shadows, distance about 6) whose intensity scales with darkness. The scene `background` is a vertical gradient `CanvasTexture` or a solid color that follows the time of day; add light `Fog` matching the background.
- **Ground**: one plane mesh covering the map with a `CanvasTexture` painted per tile at 32 px per tile (grass with subtle noise and variation, roads in warm beige with darker edges and faint sidewalk lines, plaza as stone tiles with grout, flower tiles with colored dots, shoreline sand around water). `NearestFilter` must not be used; use linear filtering with anisotropy for a soft, realistic look. Water tiles get a separate translucent plane slightly above the ground with a slowly animated normal-ish shimmer (animate an offset on a small canvas texture or modulate opacity/color over time).
- **Buildings** (from `state.buildings`): a group per building at world `(x, 0, y)` footprint `w` by `h`. Department buildings: two stories, walls in `dept.wall`, roof in `dept.accent` (hip roof with a small overhang; use a scaled `ConeGeometry` with 4 radial segments rotated 45 degrees, or an extruded trapezoid), chimney, a row of windows per story as thin boxes with a glass material whose `emissive` is driven by `darkness` and by `building.active > 0` (lit warm yellow while anyone is working), a double door in `dept.accent` on the south face centered on `door.x + 1`, a striped awning above the door, and a sign. The café: one story, cream walls, salmon roof, aqua door, umbrellas over its tables. Cast and receive shadows.
- **Signs and badges**: each department building gets a `Sprite` above the roof ridge with a `CanvasTexture` rendered at 4x resolution: a navy rounded plaque with the department name in Kanit 600 white and a thin accent underline, plus a second smaller line reading `N agents` (use `TT.sim.deptStats()` or count directly, refresh when the roster changes). Sprites use `sizeAttenuation` true and a scale that keeps the text legible at the fit distance (roughly 3.5 to 4.5 world units wide). Mark `sprite.renderOrder` high and `depthTest` true.
- **Trees** (from `state.trees`): trunk cylinder plus a canopy of two or three overlapping spheres (deciduous) or stacked cones (pine) chosen by `v`, with slight random scale and yaw from `TT.rng(TT.hash(x + ',' + y))`. Use `InstancedMesh` or merge geometry per variety for performance (around 300 trees). Cast shadows.
- **Props**: fountain (stone basin cylinder, inner water disc with animated ripple scale, a small center column with a water jet of a few tiny spheres bobbing), benches (two slats plus legs), café tables with umbrellas (pole, cone canopy in salmon and white stripes via canvas texture or alternating segments), lamp posts (dark pole, warm bulb sphere whose emissive follows darkness, plus the PointLight).
- **Agents**: on each frame, make sure every visible agent (`settings.showDemo || !spec.demo`) has a mesh (`makeAlienMesh(spec.name + '|' + spec.role, dept.alien || dept.accent)`), remove meshes for removed/hidden agents, set `group.position` from `pos`, call `animateAlien`. Also render a soft contact shadow blob (a small dark transparent circle on the ground) under each alien in addition to the cast shadow so they read as grounded.
- **Desk while working**: when `agent.state === 'working'`, show a small desk at the agent's work spot just south of the alien (toward +z, toward the camera) with a laptop whose screen is emissive aqua and blinks slowly. Pool desk meshes, one per building, and toggle visibility.
- **Tool bubble while working**: a small `Sprite` above the alien's head showing an icon drawn on a canvas for the agent's `spec.anim` (`write`, `build`, `stamp`, `mail`, `scan`, `compute`), with a 2-frame or 3-frame animation by swapping the texture every 0.25 s. Keep it simple and crisp.
- **Overlay labels (HTML)**: for every visible agent, maintain an HTML element in `#overlay` positioned by projecting the point above the alien's head (`ALIEN_HEIGHT + 0.5`) to screen space each frame. Show the name tag (`.tag`) when the agent is hovered, selected, or working. Show the speech bubble (`.bubble`, with `.ok` or `.error`) when `agent.bubble` is set, containing `bubble.text`. Hide elements for agents behind the camera (`projected.z > 1`) or off screen. Use the CSS classes from `css/style.css` (`.tag`, `.bubble`, `.bubble.error`) which the UI module defines; add them to the stylesheet if missing.
- **Picking**: `Raycaster` on `pointermove` against alien groups (prefer agents over buildings) and building groups. Set `TT.state.hover` to `{kind:'agent', id, agent}` or `{kind:'dept', id, dept, building}` or null, set the cursor, toggle the selection ring on hovered/selected aliens, and call `TT.onHover(hover, event)` if defined. On `click` (not drag: ignore if the pointer moved more than 4 px since pointerdown) set `TT.state.selected` and call `TT.onSelect(selected)` if defined. Building hover: brighten the building slightly (emissive 0.08).
- **Loop**: `requestAnimationFrame`; clamp `dt` to 0.05; `TT.sim.tick(dt)`; update agents, overlays, lights; `controls.update()`; render. `tick(seconds)` steps the sim in 1/30 increments and renders once (no rAF).
- **Avatars**: `avatar(agent)` renders the agent's alien into a 96x120 offscreen render target with its own small scene (neutral soft lighting, camera facing the alien at eye level, transparent background) and returns a data URL; cache on `agent.avatarURL`. `previewAvatar(name, role, deptId)` builds a temporary alien with the department's color, renders the same way, disposes it. Use `renderer.setRenderTarget`, `readRenderTargetPixels` into a canvas, or simply a second small `WebGLRenderer` with `preserveDrawingBuffer: true` and `canvas.toDataURL()`.
- **Performance**: target 60 fps on an integrated GPU at 1600x900. Reuse geometries and materials; avoid per-frame allocations; `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- **Cleanup**: `removeAgent` disposes the alien and its overlay elements.

## `js/ui.js` and `index.html` changes (small)

- Remove `<canvas id="stage">` from `index.html`; `#stage-host` stays and the renderer fills it. Keep `#ticker`, `#tip`, `#insp-card` inside `#stage-host`.
- Add the import map and switch `aliens3d.js` and `render3d.js` to `type="module"`.
- `ui.js`: initialize with `document.addEventListener('DOMContentLoaded', () => TT.ready.then(init))` and call `TT.town.init(document.getElementById('stage-host'))`.
- Avatar images use `a.avatarURL || TT.town.avatar(a)`. The add-agent preview uses `TT.town.previewAvatar(name, role, deptId)` and re-renders when name, role, or department changes.
- Board mode calls `TT.town.setCinematic(true)` on enter and `false` on exit.
- Add a header toggle `Cinematic camera` (checkbox `#toggle-cinematic`) wired to `setCinematic`.
- Add CSS for `#overlay .tag` (small navy pill, white text, Inter 11px) and `#overlay .bubble` (white rounded card with navy text, Inter 12.5px, max width 220px, subtle shadow, small tail; `.error` variant salmon background, white text).

## Copy and brand rules

Thread brand: Navy `#002D4F`, Aqua `#75CCD0`, Salmon `#E7706F`, Silver `#E2E9EE`. Kanit for display text at 16px or larger, Inter for body. No em dashes anywhere, in code comments or UI copy. Sentence case for headings.

## Verification each module must do before finishing

- Syntax check: copy the file to a `.mjs` in the scratchpad directory and run `node --check` on it (modules), or `node --check` directly (classic scripts).
- Grep your own file for any identifier from this contract you reference and confirm you spelled it exactly as written here.
- Do not start servers or open browsers; the integrator does the visual pass.
