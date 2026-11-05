# Thread Town 3D, version 10: realism, geography, Thread National, and the cleanup

Adds to `docs/CONTRACT_V9.md` and earlier contracts; where they disagree, this file wins. This is the largest version: it reshapes the land, the roads, the course, and the look. Keep every gameplay feature working (walk mode, chase camera, interiors, stations, café, pond, subway, golf round with the cart, scooters, leaderboard, board mode, hover and click, agent simulation).

## Goals, in Jackson's words

- True geography: hills, a valley, a bluff, a lake; not a flat square plan.
- No visible grid: curved roads, blended ground, buildings at any angle.
- A bigger, more spacious map with forests, rocks, and detail.
- Thread National: nine holes, more spacious, real elevation, a par 3 over water, tee markers and hole signs on every hole, full rounds only on the leaderboard.
- Graphics cleanup for walking, interactions, golf, and the subway.
- Scooters that feel responsive (camera and controls), and racks that do not drain.

## Files

```
js/cityplan.js       plan v3: 192 by 144 map, curved road splines, districts with landforms, nine holes, lots at any angle
js/terrain.js        terrain v2: landforms, stronger relief, slope classes, road and lot flattening along splines
js/sim.js            rasterizes the v3 plan (the logic grid stays); nine holes; rack rebalancing
js/roads.js          new: road ribbons, sidewalks, curbs, markings, crosswalks and bridges as smooth meshes along splines
js/ground.js         new: splat-blended ground material (grass, dry grass, dirt, rock, sand, fairway, green, paving) driven by slope, height and tile class; no visible squares
js/nature.js         new: forests and tree clusters (four tree types), rocks and cliffs, grass tufts, flower beds; instanced
js/city.js           filler lots at any angle; dressing on the new roads; no cars
js/golf.js           nine holes, Thread National signage, markers on every hole, island green, cup and flag on terrain
js/player.js         scooter feel fix; golf nine-hole round; leaderboard full rounds only
js/render3d.js       integration: new ground and roads, lot rotation at any angle, nature, haze, polish items, chase camera for speed
js/depts/*.js        unchanged (they build in local space)
js/leaderboard.js    golf entries tagged with holes = 9; older six-hole entries archived
js/ui.js, index.html, css/style.css   Thread National labels, nine-hole card, polish
docs/WORLD_DESIGN.md written by the design phase: landforms, districts, the road network, the nine holes
```

## The plan v3 (js/cityplan.js)

- `cols: 192, rows: 144`. The existing districts keep their character but move onto real landforms designed in `docs/WORLD_DESIGN.md`: a **hill district** in the north-west (ridge with a switchback road, residential lots stepping up the slope), a **river valley** cutting diagonally with steeper banks, rock outcrops and three bridges (one high, one low, one footbridge), a **bluff** in the north-east where downtown sits above the river with a retaining wall and stairs down to the riverside, a **lake** in the south-west with a shoreline path and a small marina, the **links** (Thread National) in the south and south-east on rolling ground along the river and the lake, the **industrial** flats in the east, the **riverside** plaza district in the center.
- **Roads are splines**: `roads: [{ id, name, pts: [[x, y], ...], width, kind, sidewalks }]` interpreted as Catmull-Rom curves; the sim rasterizes them (for the logic grid) and `roads.js` draws them smoothly. Kinds: `avenue` (4, median), `boulevard` (3), `street` (2, sidewalks), `lane` (2), `path` (1, no sidewalks, parks and the links), `switchback` (2, the hill road with hairpins), `cartpath` (1, links only).
- **Lots can rotate to any angle**: `rot` is any number in degrees; the lot's canonical frame rotates about the lot center. The sim rasterizes the rotated footprint with a conservative fill (any tile whose center is inside the rotated footprint is `B`; the stub becomes the shortest rasterized line from the door to the nearest road tile; the station is the rotated 4 by 4 with its center tile as `workTile`). The renderer rotates groups by the exact angle.
- **Golf** per `## Thread National` below.
- `validatePlan` gains: curved roads must not pass through lots or the plaza; every lot's door connects to a road within 6 tiles by walkable tiles; nine holes with lengths by par; the island hole's green is surrounded by water with a bridge or a cart path to it; a BFS under visitor rules from the spawn reaches every lot door, every tee, the clubhouse, the subway, the pier, the marina, and every rack.

## Terrain v2 (js/terrain.js)

- Relief three to four times today's: base amplitude `4.5` at wavelength `70` tiles plus `1.4` at `20` plus `0.35` at `6`, shaped by district masks from the design: the hill district rises to `+9`, the bluff plateau sits at `+5` over the river at `-1.4`, the lake at `-1.6`, the links roll between `-0.5` and `+2.5`, the industrial flats near `0`, the plaza `0`.
- Rivers and the lake carve a valley: banks slope over 4 to 8 tiles, with **rock outcrops** where the slope exceeds `35` degrees (the ground material shows rock there and `nature.js` places boulders).
- Roads flatten along their splines (level cross-section, longitudinal grade capped at `12` percent, hairpins on the switchback allowed `14`), lots flatten to plateaus with retaining-wall edges where the plateau is more than `1.2` above or below the surround (the renderer draws low stone walls there), the plaza and pond are `0`, bridges span at the bank heights.
- Course shaping: elevated tees (`+0.8` to `+1.5` above the landing area where the design says), greens on plateaus with contours, bunkers as bowls, mounds, the island green at `+0.6` surrounded by lake water.
- Clamp and determinism as v8. Export `slopeClassAt(x, z)` → `'flat' | 'gentle' | 'steep' | 'cliff'` for the ground and nature modules.

## Roads as meshes (js/roads.js)

```js
export function buildRoads(ctx) -> { group, update(dt, time, night) }
```
For every road spline: a ribbon mesh following the curve at terrain height plus `0.03` (asphalt for avenue, boulevard, street, lane and switchback; packed gravel for path and cartpath), with curbs and sidewalks as separate ribbons where `sidewalks` is true, a median ribbon with planters for avenues, lane markings (dashed center, edge lines) as a canvas-textured strip, crosswalk zebra strips at intersections and stub mouths, intersection fillets so roads join smoothly, bridges as deck ribbons with railings and piers over water, and the switchback's hairpins with guard rails. The painted tile roads in the ground texture are removed (the ground module paints the base ground only; roads live in these meshes). Merge per material. The sim's `P/SW/CW/BR` tiles remain the logic layer for walking and riding.

## Blended ground (js/ground.js)

```js
export function buildGround(ctx) -> { mesh, material, update(dt, time, night) }
```
A heightfield mesh at 1 vertex per tile (the renderer's today) with a custom `ShaderMaterial` or `MeshStandardMaterial` with `onBeforeCompile`, blending up to eight ground layers by a splat map painted per tile with soft edges (the splat texture is 4 px per tile, blurred): grass, dry grass (sun-facing slopes), dirt (paths' edges and worn areas), rock (steep slopes and outcrops), sand (bunkers and beaches), fairway (mown stripes), green (fine stripes), paving (plaza and lots). Blend weights come from the tile class with the terrain's slope class overriding (steep → rock, cliff → rock dark). No tile edges are visible at any zoom. Triplanar or world-space UV so textures do not stretch on slopes. Procedural textures from canvases (no image files).

## Nature (js/nature.js)

```js
export function buildNature(ctx) -> { group, update(dt, time) }
```
Replaces the single tree look with four instanced types (round broadleaf, tall broadleaf, pine, cypress), placed by district rules from the design: forests on the hill flanks and along the lake, clusters in parks and along the links, street trees along avenues; boulders and cliff rocks on steep slopes and outcrops; grass tufts and flower beds in parks and yards; reeds at the lake and pond edges; a few fallen logs. All instanced; total under 60 draw calls. Trees tilt slightly to the normal and vary in scale and hue. The old `trees` list from the sim remains the logic layer for collision (the sim keeps `T` tiles for forest cores only, so paths through forests stay walkable).

## Thread National (js/golf.js, js/sim.js, js/player.js, js/leaderboard.js, UI)

- Name: **Thread National**. Entrance sign on the links road, clubhouse sign, the scorecard header, the HUD, the leaderboard tab (`Thread National · 9 holes`).
- Nine holes, pars `4 3 5 4 3 4 5 3 4` (par 35), each at least 50 percent longer than today's equivalents (par 3: 11 to 16 tiles, par 4: 22 to 32, par 5: 34 to 46), with elevation changes designed per hole in `docs/WORLD_DESIGN.md` (elevated tees, a downhill par 5 toward the river, a dogleg around a hill, an uphill par 4 to a plateau green).
- **Hole 6 is a par 3 over water**: tee on the lake shore, an island green with a sand collar and a wooden footbridge or cart path spur to it; the ball must carry the water.
- Every hole has: two tee markers in `dept`-free Thread colors, a hole sign at the tee with number, par and length in yards (1 tile = 10 yards for the sign), a numbered flag, yardage plates at 100 and 150 yards on par 4s and 5s, and a cart path.
- Round: starts at the clubhouse as v8, plays 1 to 9, the card shows nine holes with the running to-par; the round summary uses `roundTerm` (`Even par`, `3 under par`) and the per-hole `golfTerm` with the fixed table (birdie, eagle, albatross, condor; hole in one with its term).
- Leaderboard: only completed nine-hole rounds are recorded (`detail.holes = 9`); entries without `holes === 9` are moved to `archive` in storage and hidden; the tab label shows the course name; practice, range and abandoned rounds are never recorded.
- The cart stays on the links, the clubhouse lot and the cart paths; Tab auto-drive follows the cart path network when one connects (fallback straight line as today).

## Polish list (render3d.js, player.js, animators, subway.js)

- **Scooter feel**: the chase camera's spring and distance scale with speed (spring `10` at rest to `16` at full speed, distance `4.2` to `5.2`, look-ahead `0.4` to `1.6` units in front) and the camera yaw eases toward the heading faster while riding; throttle response `12` from rest with a short launch boost, steering `0.9` rad at low speed falling to `0.45` at full speed, braking `16`; the rider leans with the lean already there. Agents' scooters use the same feel values. Measure before and after with a headless ride and report the camera trail in units.
- **Scooter racks**: the sim rebalances: when a rack is empty for more than `60` s and another holds more than its slots' worth of free-parked scooters nearby, an idle agent walks a scooter back (a `return` trip); plus the plan places racks near every department and attraction so trips end at a rack.
- **Walking**: a proper foot plant (no sliding) by tying the walk cycle to distance traveled for agents and the visitor; idle fidgets; the turn-in-place animation when the chase camera rotates the character.
- **Interactions**: a soft highlight ring on the targeted interactable; the prompt pill with the key chip fades in; talk bubbles with a small tail pointing at the agent.
- **Golf**: the swing has a backswing pause and a follow-through; the ball gets a motion blur streak at speed, a landing puff, and a longer trail; the aim line shows the carry arc as a dotted curve on the ground; the cup has a flag shadow; birds fly over the links occasionally.
- **Subway**: tunnel lights streak with speed, a vignette, better train models with windows and lights, the coins spin and glint, a near-miss whoosh scale effect.
- **General**: distance haze tuned to the bigger map, soft shadows with the cascade bounds derived from the camera (two shadow cascades: near sharp, far soft), ambient occlusion decals at building bases, emissive windows pattern per building at night, a subtle color grade (ACES exposure 1.0, slight warm tint by day, cool by night).
- **Performance budget**: under 900 draw calls at the overview with the bigger map (merged roads and dressing, instanced nature and scooters, far scooters simplified), 60 fps on a discrete GPU, graceful at 30 fps on integrated graphics (a quality toggle in the header: `Quality: High / Balanced` that halves shadow resolution, disables cascades and ambient occlusion decals on Balanced).

## Verification

- cityplan: `validatePlan(PLAN)` zero issues; the BFS check with the rasterized state reaches every target.
- terrain: landform heights at the designed points (hill top `+9` within `0.5`, bluff `+5`, river `-1.4`, lake `-1.6`), road grades under the caps along every spline, lots flat, retaining-wall edges flagged where expected, island green above water, deterministic.
- roads: every spline produces a ribbon with finite geometry; intersections closed; bridges above water; mesh count under 80.
- ground: splat map covers the map; no NaN weights; steep slopes rock-weighted.
- nature: instance counts by district; no tree on roads, lots, course, water, racks, seats, stations; draw calls under 60.
- golf: nine holes play headlessly with scripted aim (cap 14 strokes per hole); the island hole's shot into water returns `water` and the drop is on the tee side; signs and markers exist for all nine; round recorded with `holes: 9`; old entries archived.
- scooters: headless ride measures camera trail under `1.0` unit at full speed (report before and after); rack rebalancing keeps every rack at least one scooter over 600 s.
- renderer: `node --check`; headless placement test; draw-call estimate under 900.
- No em dashes. Sentence case. No real brand names.
