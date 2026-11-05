# Thread Town 3D, version 7: the city

Adds to `docs/CONTRACT_V6.md` and earlier contracts; where they disagree, this file wins.

## What version 7 changes

1. **A real city layout.** The uniform 5 by 4 grid is replaced by a hand-designed, asymmetric city plan modeled on open-world hubs (GTA, NBA 2K's city): a river with bridges, a downtown with taller filler buildings, a residential and park district, an industrial side, a main avenue with a median, diagonal streets, sidewalks, crosswalks, parking lots, street furniture, a riverside boardwalk. The map grows to `128` by `96` tiles.
2. **Department lots can face any street.** Lots rotate in 90 degree steps; building modules stay in local space.
3. **Golf grows to six holes** (par 3, 4, 5, 4, 3, 5) laid out along the river. Round flow and carts come in the next version; this version lays the course and keeps today's play working on six holes.
4. **Third person only.** First person is removed. Walk mode uses the chase camera; the overview (free roam and orbit) stays for the board view.
5. **Performance stays in budget** through merged static dressing.

## Files

```
js/cityplan.js       new: the city plan data plus validatePlan(plan)
js/city.js           new: filler buildings, street furniture, parked cars, bridges, boardwalk (static dressing)
js/sim.js            rasterizes the plan into tiles; lot rotation; six holes; spawn from the plan
js/data.js           departments lose slot; placement comes from the plan
js/render3d.js       ground painter for new tiles; lot rotation; dressing placement; first person removed
js/player.js         chase only; spawn from the plan; holes.length everywhere
js/ui.js, index.html, css/style.css   picker and legend without first person; crosshair removed
docs/CITY_PLAN.md    written by the design phase: a narrative and ASCII map of the plan
```

## The plan (js/cityplan.js)

ES module exporting `PLAN` (plain data, tile units unless noted) and `validatePlan(plan, rasterized?)`.

```js
export const PLAN = {
  cols: 128, rows: 96,
  spawn: { x, y },                                   // walk-mode spawn, on the plaza
  water: [ { pts: [[x, y], ...] } ],                 // polygons (river, lake); tiles with centers inside become WA
  roads: [ { pts: [[x, y], ...], width: 2 | 3 | 4, kind: 'avenue' | 'street' | 'lane', sidewalks: boolean } ],
  bridges: [ { a: [x, y], b: [x, y], width: 2 | 3 } ],  // straight spans over water, part of a road
  plaza: { pts: [[x, y], ...] },                      // polygon paved Z, with the fountain center
  fountain: { x, y },
  districts: [ { id: 'downtown' | 'riverside' | 'residential' | 'industrial' | 'park' | 'links', pts: [[x, y], ...], treeDensity: 0..0.5 } ],
  lots: [ { id, kind, x, y, w, h, rot: 0 | 90 | 180 | 270, style?, seed? } ],
  golf: { area: { pts }, clubhouse: { x, y, w: 6, h: 4, rot }, range: { x, y, w, h, rot } | null,
          holes: [ { n, par, tee: {x, y}, cup: {x, y}, line: [[x, y], ...], fairwayWidth, greenR, bunkers: [{x, y, r}], water: [{ pts }] } ] },
  scooterRacks: [ {x, y} ],
  subway: { x, y, rot },
  pier: { x, y, rot },                                // pond pier base tile and facing
  seatsExtra: [ { x, y, face: {x, y}, kind: 'bench' } ],
};
```

Lot kinds: `dept:<id>` (one per department; `w` and `h` are the canonical lot size, see Lots), `cafe`, `clubhouse`, `pond` (the park pond lot: an ellipse of water inside it plus the pier), `parking`, `courtyard`, and filler kinds `apartment`, `shop`, `office`, `tower`, `diner`, `gas`, `warehouse`, `rowhouse`, `church`, `school`. Filler lots carry `style` (a string the city module maps to a recipe) and `seed`.

**Lots and rotation.** Every lot is defined in a canonical frame: north edge at the top, the building footprint against the north side, a yard to the south, the door on the south face, a two-tile stub from the door south to the lot's south edge (which must touch a road or sidewalk), and for departments the 4 by 4 station in the yard on the `station` side. `rot` rotates the whole canonical layout clockwise (as seen from above) about the lot center in 90 degree steps so the door faces east (90), north (180), or west (270). The sim rasterizes the rotated layout; records keep `b.rot` and all tile fields (`door`, `doorTile`, `doorTile2`, `doorPos`, `workTile`, `workPos`, `station`) in world tile coordinates after rotation. Department lot size: `w = max(footprint.w, 10) + 2`, `h = footprint.h + 7` in the canonical frame (the rasterizer swaps w and h for 90 and 270). The dept modules build unchanged in local space; the renderer rotates their groups.

**Rasterization** (sim.js): paint in this order so later features win a tile: grass everywhere; districts set tree density; water polygons `WA`; roads: the polyline buffered by `width / 2` becomes `P`, plus one tile of `SW` (sidewalk) on each side when `sidewalks` is true; bridges: tiles along the span become `BR` (deck) replacing water; crosswalks `CW` one tile deep across each road where two roads meet or a stub meets a road (every crossing gets them); plaza polygon `Z`; lots: footprints `B`, stubs `P`, courtyards `Z`, parking `PK`; golf: fairway corridors along `line` with `fairwayWidth` → `FW`, green disc of `greenR` around the cup → `GR`, tee box 2 by 2 at `tee` → `TEE`, bunkers → `SA`, hole water → `WA`; pond ellipse → `WA`, pier tile; subway footprint `FT`; fountain basin `FT`; flowers `F` sprinkled on grass by district; trees by district density, never on lots, roads, sidewalks, course tiles, water, plaza, or within one tile of a door, stub, station, seat, rack, or the subway. One exception: the pond lot is a park, so trees grow on its grass outside the shore ring, the pier walk (pier tile to the lot's street edge), the bench rings and their walks to the shore, and the lamp tiles. Also keep `state.seats` (café, benches on the plaza and riverside), `state.hangouts` (plaza, café terrace, riverside boardwalk, park), `state.pier`, `state.pond` (the pond record: `{ center, rx, ry, tiles }`, the pond only; `state.waterTiles` holds every water tile, river and hazards included, for the water mesh), `state.swimSpots`, `state.shoreTiles` (pond only, not the river: the river is for looks and bridges; swimming stays in the pond), `state.subway`, `state.golf` (six holes, `clubhouse`, `range`), `state.racks`, `state.plaza` (bounding box plus polygon), `state.spawn`.

New tile types in `TT.sim.TILES`: `SW = 13` sidewalk, `CW = 14` crosswalk, `PK = 15` parking, `BR = 16` bridge deck. Agents' `walkable`: `G, P, Z, F, SW, CW, PK, BR`. Visitor `isEnterable`: those plus `FW, GR, SA, TEE`.

**validatePlan(plan)** returns `{ ok, issues: [string] }` checking: map size; every lot inside the map; no two lots overlap; no lot overlaps water, roads, plaza, or the golf area (filler lots may touch sidewalks); every lot's canonical south edge (after rotation) touches a road or sidewalk tile; one `dept:<id>` lot per department id in `js/data.js`; the café, clubhouse, pond, subway, plaza, fountain, spawn present; the spawn on the plaza; golf holes inside the area, greens not overlapping roads or lots, tee to cup straight-line lengths within par 3 `9..14`, par 4 `16..24`, par 5 `26..36` tiles, fairway lines inside the area; bridges span water with road on both ends; at least six scooter racks; after rasterization (when the second argument is given) a BFS from the spawn under visitor rules reaches every department workTile and doorTile, the café seats, the pier tile, the clubhouse door, every tee, the subway enter row, and every rack.

## City dressing (js/city.js)

```js
export function buildCity(ctx) -> { group, update(dt, time, night), lights: [PointLight] }
```

`ctx = { THREE, state, plan, sim, rng }`. Builds, in world space, merged per material where static:

- **Filler buildings** on filler lots by `style`: `apartment` (3 to 5 floors, balconies, varied facade colors), `rowhouse` (2 floors, stoops, bay windows, three or four joined units), `shop` (1 to 2 floors, awnings, big ground windows, a fictional sign canvas: coffee, books, bikes, flowers, deli, barber, records, pharmacy; no real brands), `office` (4 to 7 floors, glass bands), `tower` (8 to 14 floors, downtown only, setbacks, rooftop water tank and AC units, lit windows at night), `diner` (chrome trim, salmon neon sign), `gas` (canopy on columns, two pumps, a kiosk), `warehouse` (sawtooth or barrel roof, loading dock), `church` (steeple), `school` (long low building, flag). Every building gets a shared glass material per building so windows light at night (same rule as departments), roof details, an entrance, and ground-floor shadow bands (dark decal at wall bases) so they feel grounded.
- **Street furniture** along sidewalks: lamp posts every 8 tiles (reusing the town lamp look; only a subset carry point lights, by the existing budget), traffic lights at avenue intersections (red, amber, green cycling with the clock, emissive), street name signs at intersections (fictional names, canvas), fire hydrants, mailboxes, trash cans, bollards, bike racks, bus shelters on avenues, planters on medians, newspaper boxes, manhole decals, crosswalk zebra decals are painted by the renderer's ground painter instead.
- **Parked cars**: low-poly sedans and hatchbacks (body, cabin, wheels, lights) in parking lots and along avenues, varied colors, static, merged per lot.
- **River dressing**: shoreline rocks, a boardwalk with railings, benches and lamps along riverside stretches named in the plan, moored rowboats, bridges (deck, railings, lamps, piers into the water) at `plan.bridges`.
- **Scooter racks** (`state.racks`): a rail with three parked scooters each (the scooter model lives in `js/vehicles.js` next version; for now a simple kick-scooter primitive set in `city.js`, exported as `buildScooter(ctx)` so the next version reuses it).
- `update` only animates traffic lights and a flag or two. Allocation-free.

## Renderer (js/render3d.js)

- Ground painter: `SW` light concrete with seam lines every tile, `CW` zebra stripes across the road direction (determine direction from neighboring `P` tiles), `PK` dark asphalt with white bay lines every tile, `BR` plank deck; `P` gains lane markings: a dashed center line along road direction for width 3 and 4, and a solid median strip for width 4 avenues painted in the median color with planter dots; curbs: a 2 px darker edge where `P` meets `SW`.
- Department lots: rotate each building group and activity group by `b.rot` about the footprint center (`group.position` and `rotation.y`), transform `worldAnchor` and add `rot` to the station yaw; the sign sprite stays above the rotated bounding box; the merge pass and scale pivot (door foot) work in the rotated frame.
- Build `city.js` after the world; register its materials; drive its glass and lights with night like departments.
- Remove first person: `player.view` is always `'chase'`; delete the first-person camera branch, head bob, crosshair, FOV run change (keep a mild chase FOV ease), and the V toggle; V now toggles the chase distance between `4.2` and `6.5`. Pointer lock stays for mouse orbit.
- Overview camera and shadow bounds derive from the new size (already by `TT.sim`); `FIT_MARGIN` unchanged.
- Everything else (interiors, golf, subway, leaderboard, leisure, stations, hover, board mode) keeps working on the new map; positions come from the sim state, never from old block math (grep for `blockOrigin`, `PITCH`, `BLOCK` and remove such uses).

## Player (js/player.js)

- Remove the first-person branches; `view` is `'chase'`; `toggleView` toggles the distance preset; movement is camera-relative always; the spawn is `state.spawn`.
- Golf: use `holes.length` everywhere (card length, next hole, round done message `Round: <total> (par <sum of pars>)`).
- Interiors, stations, subway, café, pond unchanged, reading rotated lot fields from the sim.

## UI

- Picker: no first-person mention; the legend says `View: V near or far`; crosshair element removed; `#cam-hint` text updated for walk mode.

## Verification

- `cityplan.js`: `validatePlan(PLAN)` passes with zero issues before the sim exists; the design agent runs it.
- sim: headless load; `validatePlan(PLAN, TT.state)` passes including the BFS reachability; every agent reaches its workTile; seats, pier, swim, subway, golf tees reachable; rotated lots have doors adjacent to the stub and stations on grass; no trees on forbidden tiles.
- city.js: Node import test building the city for the real plan with a stub canvas; bounds inside the map; merged mesh count reported.
- renderer: `node --check`; grep that no `blockOrigin` math remains; all department groups rotate; first-person code removed.
- Smoke (final): the full v5/v6 headless scenario list on the new map (stations, interiors, golf hole 1, subway, leaderboard), plus a walk from the spawn to every department door via BFS-driven input.
- No em dashes. Sentence case.
