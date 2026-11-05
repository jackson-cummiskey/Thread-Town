# Thread Town 3D, version 8: terrain, the golf round, and carts

Adds to `docs/CONTRACT_V7.md` and earlier contracts; where they disagree, this file wins.

## What version 8 adds

1. **Terrain.** A heightmap gives the map real geography: rolling hills across the city, a shallow river valley, contoured greens, sunken bunkers with lips, mounds along the fairways. Everything sits on the terrain (buildings on flattened plateaus, roads following gentle grades, trees, furniture, characters, props, the ball) and the ball rolls with the slopes.
2. **The golf round.** A round starts at the clubhouse: walk to the pro-shop door, press E, and you get a cart and play holes 1 to 6 in order with a full scorecard. The round score to par and the round time go on the leaderboard. Tees still offer single-hole practice (not recorded).
3. **Golf carts.** You drive a cart between shots (or anywhere on the links), get in and out with E, and the cart parks itself at each tee.

## Files

```
js/terrain.js        new: heightmap build, heightAt, slopeAt, normalAt, flattening rules
js/vehicles.js       new: cart model (the driving model lives in player.js; scooters reuse the model next version)
js/golf.js           ball physics on slopes; round data; cup and flag on terrain
js/player.js         round flow from the clubhouse, cart driving state, practice vs round
js/sim.js            clubhouse door record as a round start zone; TT.sim.terrainSeed
js/render3d.js       terrain mesh and shadows, every placement on heightAt, cart rendering, HUD for the round
js/city.js, js/leisure3d.js, js/depts/*.js   placement uses the ctx height function the renderer supplies (depts stay in local space; the renderer lifts groups)
js/ui.js, index.html, css/style.css   round card, cart hint
docs/TERRAIN_DESIGN.md   written by the design phase
```

## Terrain (js/terrain.js)

```js
export function buildTerrain(ctx) -> Terrain
// Terrain = { cols, rows, heights: Float32Array((cols + 1) * (rows + 1)), heightAt(x, z), slopeAt(x, z, out), normalAt(x, z, out), lotHeight(lot) }
```

`ctx = { plan, state, sim, seed }`. Heights are per grid vertex (tile corners) in world units; `heightAt` is bilinear, `slopeAt` returns the gradient (dh/dx, dh/dz), `normalAt` the unit normal.

Rules, applied in order:

1. **Base hills**: two octaves of seeded value noise, amplitude `1.6` at wavelength `48` tiles plus `0.5` at `14` tiles, offset so the plaza area averages `0`. Steeper in the north-west residential hills (multiply by `1.4` inside the `residential` district), flatter downtown (`0.5`).
2. **River valley**: tiles within `6` of water blend toward `-0.9` with a smoothstep by distance; water tiles sit at `-0.9` (the water surface mesh stays at `y = 0.04`, so banks read as 0.9 high; bridges keep their deck at road height with the span sloping gently). The pond lot is a flat plateau at `0` (pier, swimming, and shore code assume ground `0` there).
3. **Flattening**: every lot (departments, café, clubhouse, filler, parking, courtyard) becomes a plateau at the mean base height of its rectangle, blended over `2` tiles outside the lot with a smoothstep; the plaza polygon is a plateau at `0`; the subway footprint `0`; roads, sidewalks, crosswalks, bridges and parking get a smoothed profile: along each road the base height is averaged with a `9` tile moving window so grades stay under `10` percent, and the road's cross-section is level.
4. **Course shaping** (inside the golf area): fairways follow the smoothed base with mounds of `+0.6` to `+0.9` placed alternately along each hole's line every `6` tiles, `1.5` tiles outside the fairway edge (radius `2.5`, smooth); greens are plateaus at the mean height with a gentle contour (`0.12` amplitude value noise at wavelength `4`) and a `0.4` collar ring sloping to the surround; bunkers are bowls: depth `0.45` at the center with a raised lip of `0.12` on the far side from the tee, radius from the plan; tee boxes flat; water hazards `-0.6` with sloped banks.
5. **Clamp**: heights within `[-1.0, 3.2]`; no vertex differs from its neighbor by more than `0.9` (relax by averaging where it does, except water edges).

Determinism: same seed, same heights (`TT.sim.terrainSeed`, default `20261020`).

## Everything on the terrain (js/render3d.js and modules)

- The ground mesh becomes a `PlaneGeometry(cols, rows, cols, rows)` with vertex heights from `terrain.heights`, normals computed, the same tile texture mapped; it casts and receives shadows. The skirt follows the edge heights outward. Water planes stay where they are.
- Every placement call adds `terrain.heightAt(x, z)`: trees (also tilt a little with the normal), lamps, benches, furniture, cars, racks, decos, the subway entrance (plateau `0`), fountain, pier (plateau `0`), golf props (flags, cups, markers, signs at local heights), scoreboards, the clubhouse group (plateau height).
- Department and filler building groups are placed at their lot plateau height; the station and activity group at the same height; `worldAnchor.y += plateau`. Sign sprites follow.
- Characters: `group.position.y = terrain.heightAt(pos.x, pos.y) + leisure offset`; tags, bubbles and contact shadows follow; the shadow blob tilts with the normal. The player's camera uses the same height. While swimming or on the pier the pond plateau is `0` so nothing changes there.
- The free and orbit cameras clamp their minimum height to `terrain.heightAt + 1.6`; the chase camera's collision march also stops below the terrain (`cam.y >= heightAt + 0.6`).
- The ground painter is unchanged; shading from the lit terrain provides the depth.
- Interiors are far away and flat; untouched.

Modules get the height through `ctx.heightAt` (the renderer passes it to `buildCity`, `buildGolf`, `buildLeisure`, and the interior and dept builders do not need it).

## Ball physics on slopes (js/golf.js)

- Ground height at the ball = `terrain.heightAt(x, z)` (the renderer passes `terrain` in `course.terrain`); the ball rests on `ground + BALL_R`.
- Rolling: acceleration adds `-g * slope` (gradient scaled by `0.9`) so the ball runs downhill and slows uphill; deceleration by lie as before; rest only when speed `< 0.15` and the slope magnitude `< 0.06` (otherwise it keeps creeping).
- Bounce: reflect the velocity about the surface normal with the lie's restitution.
- Cup capture unchanged (the cup sits in the green plateau).
- A ball that rolls into water follows the existing water rule.

## The round and the cart (js/player.js, js/vehicles.js)

**Clubhouse start.** The clubhouse door zone (its `doorTile`, `doorTile2`) gives `E  Start a round` when the player is idle and not already golfing. On E: `golf.mode = 'round'`, `round = { startedAt, card: [null x 6], strokes: 0 }`, a cart spawns on the clubhouse parking stub, the player is seated in it (`state 'cart'`), and the HUD shows the scorecard with pars. The hole 1 tee prompt reads `E  Tee off (round)`; other tees during a round say `Play holes in order`. Practice from a tee outside a round: `golf.mode = 'hole'` as today, with `E  Practice hole <n>`.

**Cart** (`js/vehicles.js`): `makeCart(ctx) -> { group, parts: { wheels: [], seat, bag }, animate(cart, speed, steer, dt) }` (white body, navy roof on four posts, two seats, a bag rack with two bags, wheels that spin, headlights emissive at night). Driving model in player.js: `state 'cart'`, W/S throttle and brake, A/D steer (max `0.55` rad at low speed, less at high speed), max speed `8.5` on paths and fairway, `6` on rough, `3.5` on sand, `0` into water (stops at the shore), acceleration `6`, braking `12`, friction `2.5`, collision with `B` and `T` tiles and lot edges by the same four-point test using a `0.45` radius, slides along walls, cannot leave the links area plus the clubhouse lot and parking (prompt `The cart stays on the links` when pushed against the boundary). The player's handle sits in the seat (`pose 'sit'`), the cart yaws with steering, the chase camera follows the cart. `E` gets out (the cart stays where parked; `E` near it gets back in). After each shot in a round, the cart is where you left it; `Tab` auto-drives the cart to the ball at max speed along a straight line that respects the boundary, stopping `1.5` short. When a hole is holed, the HUD shows the hole result for `2.5` s and the next tee becomes active; the cart auto-drives to the next tee when you press Tab.

**Round end.** After hole 6: `Round: <total> (<+/- to par>)` with the golf term for the total, the round is recorded on the leaderboard (score = strokes, detail `{ seconds, card, toPar }`), the summary card offers `E  Back to the clubhouse` (auto-drive and park) or `X  Done`. `X` during a round asks once (`X again to abandon the round`); abandoning records nothing.

**HUD.** `#golf-hud` shows `Round · Hole 2 of 6 · Par 4 · Stroke 1`, the six-hole card with pars and running total to par, the club line, and a cart line (`Tab  Drive to ball` or `E  Get in the cart`). Practice shows the old single-hole card.

## Leaderboard

Golf entries from rounds: `score` = total strokes, `detail = { seconds, card: [6], toPar }`; the modal shows `To par` and the card. Practice is never recorded.

## Verification

- terrain: Node test building the terrain for the real plan: plateaus flat (max height difference inside any lot under `0.01`), road grades under `10` percent along every road polyline, water at `-0.9`, pond and plaza at `0`, bunkers lower than their surround, greens within `0.15` of flat, neighbor delta under `0.9`, deterministic across two builds.
- golf: ball on a `6` percent slope rolls downhill and rests on the flat below; uphill putt with low power rolls back; cup capture on the contoured green from `2` units with power `0.4`.
- player: round flow headless on the real map: start at the clubhouse door, cart spawned, drive to tee 1 with scripted input (never crossing water or leaving the links), tee off, auto-drive to the ball, play all six holes with scripted aim (cap 12 strokes each), round recorded with `toPar` and time; practice from a tee not recorded; abandon records nothing; cart boundary respected.
- renderer: `node --check`; headless build placing every object with heightAt (no object below the terrain by more than `0.05`).
- No em dashes. Sentence case.
