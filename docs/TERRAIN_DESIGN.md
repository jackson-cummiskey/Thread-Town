# Thread Town terrain

Numeric spec for `docs/CONTRACT_V8.md` ("Terrain", "Ball physics on slopes", "The round and the cart") on the real plan in `js/cityplan.js` and `docs/CITY_PLAN.md`. The contract wins where this file disagrees; where the contract leaves a number open, this file closes it. Every rule below was run as a reference build in Node against the plan (seed `20261020` and three other seeds) and passes the contract's verification list; the reference values quoted in "Clamp and determinism" come from that build and are informative, not normative.

Conventions. The map is 128 by 96 tiles, 1 tile = 1 world unit, x grows east, world z is plan y and grows south. Heights live on the vertex grid: vertex `(i, j)` for `i` in `0..128`, `j` in `0..96`, stored at `heights[j * 129 + i]`, in world units. A tile `(x, y)` has corners `(x, y)`, `(x + 1, y)`, `(x, y + 1)`, `(x + 1, y + 1)`. `heightAt(x, z)` is the bilinear blend of the four corners of the tile `(floor x, floor z)` (clamped to the map). `slopeAt` returns the analytic gradient of that bilinear patch: with `fx = x - floor x`, `fz = z - floor z` and corner heights `h00, h10, h01, h11`, `dh/dx = (1 - fz) (h10 - h00) + fz (h11 - h01)` and `dh/dz = (1 - fx) (h01 - h00) + fx (h11 - h10)`. `normalAt = normalize(-dh/dx, 1, -dh/dz)`. `smooth(t) = t t (3 - 2 t)` on `t` clamped to `0..1`; `lerp(a, b, t) = a + (b - a) t`. Distance from a vertex to a rectangle is the Euclidean distance to the closed rectangle (0 inside or on the edge). A lot's vertex set is `x..x+w` by `y..y+h` inclusive (its world rectangle), so neighbouring lots share an edge of vertices.

Vertex classes used by the rules, written once and read by every later step: `wet` (river bed 1, hazard bed 2) and `pinned` (1 lot plateau, 2 plaza or pond, 3 road, 4 bridge deck, 5 water shore floor, 6 sidewalk only). A rule that says "skips pinned vertices" never moves a vertex of a class it does not name.

Rules run in this order: base hills, river valley, plaza and pond, roads, bridges, lots, course shaping, clamp and relax.

## Noise and districts

Seeded value noise. The hash maps an integer lattice point and the seed to `0..1`:

```
hash2(ix, iz, seed):
  h = (imul(ix, 374761393) + imul(iz, 668265263) + imul(seed, 1274126177)) | 0
  h = imul(h ^ (h >>> 13), 1103515245)
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
```

`vnoise(x, z, wl, seed)` returns `-1..1`: `u = x / wl`, `v = z / wl`, `i = floor u`, `j = floor v`, `su = smooth(u - i)`, `sv = smooth(v - j)`, corners `a = hash2(i, j)`, `b = hash2(i + 1, j)`, `c = hash2(i, j + 1)`, `d = hash2(i + 1, j + 1)` (all with `seed`), value `2 lerp(lerp(a, b, su), lerp(c, d, su), sv) - 1`. The noise is sampled at integer vertex coordinates (`x = i`, `z = j`), never at tile centers.

Base hills, two octaves as the contract fixes them: `raw(i, j) = 1.6 vnoise(i, j, 48, seed) + 0.5 vnoise(i, j, 14, seed + 1)`.

District fields. Each vertex takes the multiplier and offset of the district polygon containing the point `(i + 0.0001, j + 0.0001)` (`plan.districts`, point in polygon by the even odd rule); outside every polygon the multiplier is `1.0` and the offset `0`:

| district | multiplier | offset |
|---|---|---|
| residential | 1.4 (contract) | +1.0 |
| downtown | 0.5 (contract) | 0.0 |
| riverside | 1.0 | +0.1 |
| industrial | 0.7 | +0.2 |
| park | 1.0 | +0.3 |
| links | 0.6 | +0.6 |

Both fields are box blurred three times with a 3 by 3 kernel (edge vertices average their in map neighbours) so district edges do not step. `base(i, j) = mulBlur(i, j) raw(i, j) + offBlur(i, j)`. The offsets lift the hills above the river's shore level (the residential south west corner is the deepest noise low with this seed) and keep the links above the water planes of the two hazards.

Plaza offset. `plazaOffset` is the mean of `base` over the plaza rectangle's vertices `x 48..61` by `y 28..44` (14 by 17 vertices), and every vertex becomes `base - plazaOffset`, so the plaza area averages exactly 0 before it is flattened. Reference value for seed `20261020`: `0.44`.

Resulting slopes of the raw field: at most about `0.1` per tile from the 48 octave and `0.1` from the 14 octave, times the district multiplier, so up to `0.28` in the residential hills and `0.12` on the links before the course rules below.

## River valley and pond

River water tiles are `plan.water[0]` (the ribbon, half width 3) rasterized by tile center. A vertex is a river bed vertex (`wet = 1`) when all four tiles around it are river water; it sits at `-0.9` exactly. The pond and the hole hazards are not river water.

Shore floor and bank. The contract's "blend toward -0.9 within 6 tiles" is read as a bank that descends to the bed: for every other vertex, `d` = Euclidean distance to the nearest bed vertex (shore vertices have `d = 1`). For `d < 6`: `h = lerp(0.25, max(h, 0.25), smooth((d - 1) / 5))`; vertices with `d <= 1.5` are marked `pinned = 5` (shore floor). For `6 <= d < 12`: `h = max(h, lerp(0.25, h, smooth((d - 6) / 6)))`, a floor that tapers to the field. The shore floor `0.25` is `0.21` above the water plane at `y = 0.04`, so the bank reads `0.9` high from bed to water line plus a short freeboard, no land vertex next to water sits under the water surface (that would show as a dry trench), and the bed to shore step `1.15` is a water edge, exempt from the neighbour rule. Water tiles on the shore have two vertices at `-0.9` and two at `0.25` or more; the water plane crosses that slope inside the water tile, which is the visible water line.

A shore floor vertex may rise later (a lot plateau or the relax pass may lift it) but nothing lowers it.

Bridges keep the water under them: deck vertices are set in "Plateaus and roads".

Pond. The pond lot `(26, 53) 14 by 13` is a plateau at `0` over its whole vertex set `x 26..40` by `y 53..66` (`pinned = 2`), blended over 2 tiles outside (`h = lerp(0, h, smooth(d / 2))` for `0 < d < 2`, skipping pinned and wet vertices). The pond ellipse, the pier tile `(33, 62)`, the shore ring and the swim tiles all sit on ground `0`, as today. The lot's east edge `x = 40` touches the river's diagonal reach: those vertices stay at `0`, `0.04` under the river plane, a flush bank like today's pond edge.

Hole water hazards are shaped in "Course shaping".

## Plateaus and roads

Order inside this rule: plaza, roads, bridges, lots.

Plaza. The plaza rectangle `x 48..61` by `y 28..44` (vertices inclusive) is a plateau at `0` (`pinned = 2`), blended 2 tiles out like the pond. The subway footprint `54..55` by `41..42` and the fountain basin are inside it, so they are `0` by the same rule.

Zero rectangles. The plaza, the pond lot and every lot that touches the plaza rectangle (in this plan only `rs-parking`, the subway parking lot at `(50, 44)`) are "zero rectangles": they sit at `0` and roads beside them are pinned to `0`.

Roads as a network. For each road polyline (`plan.roads`, in order) take samples every tile along it: for each segment of length `L` use `n = max(1, round L)` equal steps (the first sample of a later segment is the previous segment's last). For a road of width `w` the half width is `hw = w / 2`, the band `hw + 1.5`.

1. Base of a sample: the mean of the current field over all non wet vertices within the band of the sample point. If any vertex in the band lies on a zero rectangle the sample is a zero pin (`h = 0`, fixed).
2. Grade cap of a sample: `0.095` per tile; beside a lot the cap is `min(cap, 0.3 / L_group)` where `L_group` is the larger side of the bounding box of that lot's group (groups are defined under Lots) and "beside" means the sample point is within the band of the lot rectangle. The downtown block groups (up to 26 tiles) get caps near `0.012`, the 14 by 14 department lots `0.021`, rowhouses `0.03`.
3. Moving window: each non zero sample becomes the mean of the samples `i - 4 .. i + 4` (9 samples, the window shrinks at the ends), the contract's 9 tile window.
4. Junctions: a sample within `other.hw + 1.0` of another road's centerline is a junction sample with that road. Zero pins propagate across junctions (three sweeps: a junction sample whose partner's nearest sample is a zero pin becomes a zero pin at `0`).
5. Twelve relaxation rounds over all roads in plan order. In a round, each road first sets every non zero junction sample to the mean of its own value and the partner roads' nearest sample values, then runs four clamp passes (forward then backward along the samples) that hold a sample within `cap * spacing` of its neighbour; in the first two passes the junction samples are held fixed so the constraint propagates along the road, in the last two they are free so the junction itself smooths. Zero pins are always fixed. After the rounds every road's grade is at most `0.095` per tile (the diagonal Commerce Boulevard reports `0.096` because its samples are `0.989` apart; the clamp uses `cap * spacing`).
6. Cross section, level. For every tile of the road (center within `hw` of the line, `MARK.ROAD`) each of its four vertices takes the height of the nearest sample and is `pinned = 3`; for every sidewalk tile (within `hw + 1`, not water) the vertices not already road take the nearest sample height and are `pinned = 6`. A vertex already pinned 2, 3 or 4 is left alone, so an earlier road or the plaza wins a shared vertex; shore floor vertices (5) are overwritten (the road is above `0.25` near the river by the network's own means).
7. Blend: non pinned vertices between the band edge (`hw + 1` for sidewalk roads, `hw` for lanes, plus `0.5`) and 2 tiles beyond take `lerp(nearestSampleHeight, h, smooth(d / 2))`.

Crosswalks, parking stubs and lot stubs are road or sidewalk tiles already and need no extra rule; parking lots are lots (below).

Bridges. For each bridge `a .. b` of width `w` (deck columns `c - 1 .. c` for width 2, `c - 1 .. c + 1` for width 3, as the raster paints them): `ha` = mean height of the four vertices of the road tile just before `a`, `hb` = the same just after `b`, span length `len = |b - a| + 2`. Deck tile `k` (1 based from `a`) sets all its vertices to `lerp(ha, hb, k / len)`, `pinned = 4`, and clears `wet` on them, so `heightAt` on a deck returns the deck profile and walkers, carts and cameras ride the deck. The ground mesh under the deck is covered by the deck mesh; the water tiles beside it keep their bed vertices. Deck grades for seed `20261020`: West Street bridge `0.006`, Thread Avenue bridge `0.009`, East Street bridge `0.042`, all gentle as the contract asks. Bridge approaches need no ramp: the bank road tiles already carry the smoothed profile and the deck starts at that height.

Lots. Lots whose world rectangles touch (share an edge or a corner vertex) form a group and share one plateau, because the shared vertices cannot have two heights. Groups in this plan: `dept-compliance + dt-shop-1 + dt-office + dt-tower + dt-parking`, `dept-fcc + cafe + rs-shop-2 + rs-shop-3`, `dept-data + dept-embedded`, `dept-people + rh-1`, `rh-2 + rh-3 + school`, `dept-risk + rs-diner`; every other lot is its own group. For a group:

- `mean` = mean height of the current field over the union of the rectangles' vertex sets (the contract's mean base height; it already carries the valley and the road blends).
- A group containing the pond or touching the plaza has plateau `0`.
- Frontage: the road and sidewalk vertices (`pinned` 3 or 6) within 1 tile of the union. With `fmid = (fmin + fmax) / 2` of those heights, the plateau is `fmid + clamp(mean - fmid, -0.25, 0.25)`, so the stub meets the sidewalk with a curb step and no retaining wall; the road grade cap along frontages keeps `fmax - fmin` under about `0.7`, so every lot edge to road edge step across the one tile sidewalk stays under `0.85`.
- A group with a vertex within 2 tiles of a river bed vertex has plateau at least `0.3` (its back edge is a river bank, never under the water plane).
- Every vertex of every rectangle in the group is set to the plateau (`pinned = 1`), overriding road (3), sidewalk (6) and shore (5) vertices on its boundary; the lanes without sidewalks (Meadow, Elm, South) abut lots directly, so their lot side edge takes the plateau and the lane has a camber of at most `0.4` across its two tiles there. Then the 2 tile blend outside the rectangle, skipping pinned and wet vertices.

Reference plateaus, seed `20261020`: clubhouse `0.11`, links parking `0.04`, cafe group `-0.17`, downtown core groups `0.03` (compliance block), `-0.34` (tech), `-0.31` (exec), `-0.23` (finance), `-0.10` (credit), `-0.40` (marketing), data and embedded `0.21`, ops `0.01`, gas `0.30` (river bank lot), people and rh-1 `0.30`, north shore apartments `1.16` and `1.20`, zoo and diner `-0.42`, church `0.42`, south residential `-0.54` to `-1.07`.

## Course shaping

All shaping applies to vertices inside or near the golf area polygon; nothing moves a pinned or wet vertex, and every displacement is multiplied by `fade(i, j) = smooth(dPin / 2)` where `dPin` is the distance to the nearest pinned vertex, so the course rolls up to Links Road, the clubhouse lot and the parking lot without a step. Order: fairway profiles, mounds, hazard surround lift, water hazards, tee boxes, greens, bunkers, range.

Geometry from the plan (the sim's own conventions): a hole's fairway corridor is the set of tiles whose center is within `fairwayWidth / 2 = 2.5` of the polyline `line` (raw tile corner coordinates, not centers); tee point `(tee.x + 1, tee.y + 1)`; cup center `(cup.x + 0.5, cup.y + 0.5)`; bunker center `(b.x + 0.5, b.y + 0.5)` with radius `r`; hazard tiles by center in the polygon. Direction of play along a segment is the unit vector `u`; right of play is `(-u.y, u.x)` (y grows south), left is `(u.y, -u.x)`.

Fairways follow the smoothed base. Each hole gets a profile along `line` exactly like a road: samples every tile, sample base = mean of the field within `hw + 1.5 = 4.0` of the sample, the 9 sample moving window, then six forward and backward clamp passes at grade `0.05` per tile. Vertices within `1.5` of the line take the profile height of the nearest sample (level across the inner corridor); vertices from `1.5` to `4.0` blend back to the field with weight `1 - smooth((d - 1.5) / 2.5)`. Reference profile grades: `0.024, 0.018, 0.027, 0.030, 0.016, 0.026` for holes 1 to 6; tee to cup heights: hole 1 `0.33` to `0.48`, hole 2 `0.67` to `0.52`, hole 3 `0.40` to `0.13`, hole 4 `0.02` to `0.12`, hole 5 `-0.17` to `-0.28`, hole 6 `-0.23` to `0.04`.

Mounds. Along each hole's line at arc length `s = 6, 12, 18, ...` while `s <= length - (greenR + 3.5)`, index `k` from 0, amplitude `amp_k = 0.6 + 0.3 frac((7 n + 13 k) 0.6180339887)` rounded to `0.01`, radius `2.5`, profile `amp 0.5 (1 + cos(pi d / 2.5))` for `d < 2.5` (added to the field). Side alternates starting on the right; the center sits on the perpendicular at offset `4.0` from the line (`2.5` fairway half width plus `1.5`), pushed outward in `0.25` steps until its distance to the polyline is at least `3.95` (inner corners). A candidate is rejected and the rule tries, in order, the arc offsets `+1.5, -1.5, +3, -3` and the other side, when the center is: less than `1.0` inside the area polygon; closer than `3.95` to its own line or `3.5` to another hole's line; within `greenR + 2.9` of any cup; within `4.0` of any tee point; within `r + 2.0` of any bunker center; inside or within `3.0` of a hazard polygon; within `3.5` of a river water tile center; within `3.0` of a lot or the range rectangle; within `5.0` of an accepted mound. If every candidate fails the mound is dropped. On the real plan this gives nine mounds (the band is only 24 tiles deep, so the south side of holes 3 to 5 and the range side of hole 6 have no room):

| hole | k | s | side | center (x, z) | amp | distance to own line |
|---|---|---|---|---|---|---|
| 1 | 0 | 6 | right | (80.3, 78.9) | 0.70 | 3.96 |
| 2 | 0 | 6 | right | (96.1, 77.1) | 0.80 | 4.00 |
| 2 | 1 | 12 | left | (104.8, 71.9) | 0.81 | 3.96 |
| 3 | 0 | 6 | right | (103.0, 87.2) | 0.89 | 4.15 |
| 3 | 1 | 12 | dropped (own bunker at (97.5, 89.5) and the south edge) | | | |
| 3 | 2 | 19.5 | right | (94.3, 87.8) | 0.61 | 4.03 |
| 4 | 0 | 6 | right | (73.9, 85.9) | 0.69 | 4.00 |
| 4 | 1 | 12 | left | (67.2, 93.0) | 0.70 | 4.00 |
| 5 | 0 | 6 | right | (49.0, 87.0) | 0.79 | 4.00 |
| 6 | 0, 1 | 6, 12 | dropped (range to the north, hole 5 green and bunkers to the south) | | | |
| 6 | 2 | 19.5 | right | (51.9, 82.8) | 0.61 | 3.96 |

All nine centers are at least `1.0` inside the area (the shallowest is hole 4's second mound at `1.0`, its skirt runs onto the two grass rows south of the area edge, which are not pinned) and at least `3.5` from every other hole's line. A mound's foot reaches `1.0` tile into its fairway, as the contract's offset and radius imply: the fairway edge rolls up and a ball that lands there runs back into the corridor.

Hazard surround lift. The two hazards sit at an absolute level because the water plane stays at `y = 0.04`. Before the water is cut, every non pinned vertex within 8 tiles of a hazard bed vertex (defined below) is floored: `h = max(h, lerp(0.35, h, smooth((d - 2) / 6)))`, so the water never sits above the surround.

Water hazards (holes 2 and 4). Bed vertices have all four tiles around them inside the hazard polygon and are set to `-0.6` (`wet = 2`). Other vertices with `d < 4` to the nearest bed vertex form the bank: if the field is at least `0.3`, `h = lerp(0.3, h, smooth((d - 1) / 3))`; otherwise `h = lerp(0.3, h, smooth((d - 1.5) / 2.5))`; vertices with `d <= 1.5` become shore floor (`pinned = 5`) at `0.3` or more. The shore sits `0.26` above the water plane and the bank drops `0.9` into the pond over one tile at the water line. Hole 2's pond (27 bed vertices) is crossed by the fairway line on purpose; hole 4's pond (27 bed vertices) is `1.5` from the line, so the inner corridor's north edge there is the bank.

Tee boxes. Each 2 by 2 tee box (`tee.x .. tee.x + 1`, `tee.y .. tee.y + 1`) is a plateau at the mean of its 3 by 3 vertices, blended `1.5` tiles out with `1 - smooth(d / 1.5)`. Reference tee heights: `0.34, 0.67, 0.40, 0.02, -0.17, -0.23`.

Greens. For each hole with cup center `c` and `greenR = 2.5`: plateau `p` = mean of the field over the vertices within `2.5` of `c`. Vertices with `d <= 2.9` (the green plus the `0.4` collar) take `p + contour`, where `contour = 0.12 vnoise(i, j, 4, seed + 2) smooth((d - 1.0) / 1.5) (1 - smooth((d - 2.5) / 0.4))`: the contour is the contract's `0.12` amplitude at wavelength 4, zero within `1.0` of the cup (the cup sits in a flat spot and short putts read true), full from `2.5` out, and fading to zero across the collar. From `2.9` to `4.9` the surface slopes to the surround with weight `1 - smooth((d - 2.9) / 2)` toward `p` (the collar ring sloping to the surround, spread over two tiles so the vertex grid can resolve it). Reference plateaus: `0.48, 0.50, 0.12, 0.12, -0.28, 0.04`; max height difference inside every green disc `0.064 .. 0.105` (under the contract's `0.15`); share of green area steeper than 6 percent `1 .. 6` percent; slope at every cup `0`.

Bunkers. Center `c`, radius `r`, lip direction `u = normalize(c - teePoint)` (the far side from the tee). Let `hc = heightAt(c)` before the bowl. For `d <= r`: level first, `h = lerp(h, hc, 1 - smooth(d / r))`, then the bowl `h -= 0.45 (1 - smooth((d - 0.3 r) / (0.7 r)))` (flat floor, full `0.45` depth at the center, zero at the rim; a plain cosine bowl sampled on a 1 tile grid reads only `0.2` deep). For `r < d < r + 1.0`: the lip `h += 0.12 max(0, dot((v - c) / d, u)) sin(pi (d - r))`, a `0.12` crest half a tile beyond the rim on the far side, nothing on the tee side. All twelve plan bunkers checked: centers inside the area by `1.5` (hole 4's (62.5, 92.5), whose lip points west along the bottom edge, not south) to `9.5`; ten are off their fairway corridor (center `2.35` to `4.53` from the line, with hole 3's (97.5, 89.5) and hole 5's (45.5, 88.5) touching the corridor edge) and hole 6's two cross bunkers at (44.5, 82.5) and (52.5, 78.5) sit in the corridor by the plan's design (the sim paints sand over fairway, `lieAt` reads sand). Hole 1's (89.5, 73.5) is `2.1` from hole 2's tee point and its lip faces east, away from that tee. Reference bowl depths below the mean of the ring at `r + 1`: `0.25 .. 0.38` at the tile center sample (the bowl floor vertex is `0.45` down).

| hole | bunker center | r | lip direction (far side) |
|---|---|---|---|
| 1 | (84.5, 79.5) | 1.4 | (0.88, 0.47) |
| 1 | (89.5, 73.5) | 1.2 | (0.99, -0.11) |
| 2 | (106.5, 83.5) | 1.4 | (0.81, 0.59) |
| 2 | (111.5, 76.5) | 1.2 | (0.98, 0.18) |
| 3 | (89.5, 88.5) | 1.4 | (-1.00, 0.07) |
| 3 | (97.5, 89.5) | 1.2 | (-0.99, 0.17) |
| 4 | (56.5, 86.5) | 1.3 | (-0.97, -0.23) |
| 4 | (62.5, 92.5) | 1.3 | (-1.00, 0.03) |
| 5 | (45.5, 88.5) | 1.3 | (-0.95, -0.32) |
| 5 | (37.5, 90.5) | 1.1 | (-1.00, -0.08) |
| 6 | (44.5, 82.5) | 1.2 | (0.87, -0.49) |
| 6 | (52.5, 78.5) | 1.2 | (0.88, -0.47) |

Range. The range rectangle `(30, 70) 12 by 11` is a plateau at its mean (reference `-0.11`), blended 2 tiles out, so the tee line and the net stand level; the net on Links Road's sidewalk is at road height.

Clubhouse. The clubhouse lot plateau is `0.11` and the links parking lot `0.04` (reference); Links Road at the avenue bridge is `0.27`, so the stub climbs `0.16` over its six tiles. The course east of the clubhouse lot rises from `0.11` to `0.29 .. 0.39` across the 2 tile blend; the cart drives it at a grade under 15 percent.

## Clamp and determinism

Clamp: every height to `-1.0 .. 3.2`. Relax: up to eight passes over all horizontal and vertical vertex pairs in row major order; a pair whose difference exceeds `0.85` (target, so the contract's `0.9` holds with margin) moves the free vertex or vertices by the excess (half each when both are free). Free: unpinned vertices, sidewalk only vertices (6), and shore floor vertices (5) when the move raises them. Fixed: plateau (1, 2), road (3), deck (4), bed vertices. Pairs with a bed vertex are water edges and are skipped. With the rules above no pair is left over `0.85` on any of the four seeds tried, and plateaus stay flat to `0.000`.

Determinism: every rule is a pure function of the plan and `TT.sim.terrainSeed` (default `20261020`); the only random source is `hash2`. Two builds of the same seed produce identical `Float32Array` heights (checked bit for bit). Changing the seed changes the hills, not the plateau logic, the course positions or the mound list (only the mound amplitudes are seed free; everything else that depends on the field re derives).

Reference values, seed `20261020`, for the contract's verification list: lots flat (max difference inside any lot `0.000`); road grades per tile: Thread Avenue `0.095`, Harbor `0.095`, Ledger `0.023`, River `0.095`, Mint `0.021`, East `0.030`, Foundry `0.013`, Commerce `0.096` (0.989 sample spacing), Cafe Lane `0.013`, West `0.075`, West south `0.095`, Orchard `0.024`, Meadow `0.038`, Links Road `0.037`, South Lane `0.037`, Elm `0.037`; river bed `718` vertices all at `-0.9`; plaza `0` on all 238 vertices; pond lot `0` on all 210 vertices; every bunker center lower than its surround; greens within `0.105` of flat; max neighbour difference `0.85`; height range `-1.0 .. 1.79`; three pairs relaxed. Land vertices below the water plane next to water: none, except the pond lot's east edge and the zero pinned vertices at River Street's start, `(48..50, 53..54)`, all at `0` (flush banks).

## Placement rules

Everything that stands on the ground adds `terrain.heightAt(x, z)` at its anchor; the renderer passes `heightAt` and `normalAt` to `buildCity`, `buildGolf` and `buildLeisure` as `ctx.heightAt` and `ctx.normalAt`. Specifics:

| thing | height | tilt |
|---|---|---|
| department and filler buildings, station groups, sign sprites, `worldAnchor` | the lot plateau (`terrain.lotHeight(lot)`, the plateau value) | none |
| clubhouse group, porch, practice green, porch lamps | clubhouse plateau | none |
| subway entrance, fountain, plaza furniture | `0` | none |
| pier, pond dressing, swim spots | `0` | none |
| lamps, benches, hydrants, mailboxes, bollards, bus shelters, racks, scoreboards, signs | `heightAt` at the base center | none (they stand on level road, sidewalk, plateau or green) |
| cars on roads | `heightAt` at the car center | none (road cross section is level; along the road the car follows the grade through its two sample points: pitch `atan((h_front - h_back) / wheelbase)`) |
| trees | `heightAt` at the trunk | tilt toward the normal: up vector `normalize(lerp(up, normalAt, 0.35))`, capped at 8 degrees; trunk base extended `0.3` into the ground |
| flowers, decos, rocks, rowboats on the verge | `heightAt` | flowers none; rocks and boats align to the normal fully |
| flags, cups, tee markers, yardage signs, ball washers, hole benches | `heightAt` at each prop's own point (the green plateau for the flag and cup) | none |
| ball | `heightAt + 0.11` (`BALL_R`) | the ball mesh rolls, not tilts |
| cart | `heightAt` at the cart center; pitch and roll from `normalAt` at the center, eased at `10` per second | yes |
| characters, the player | `heightAt(pos) + leisure offset`; the contact shadow blob at `heightAt + 0.02` aligned to `normalAt` | the body stays upright, only the shadow tilts |
| tags and bubbles | follow the character's lifted group | none |

Rules of thumb: an object's anchor height is sampled once at its center, never per vertex, so objects on the 2 tile blend rings around plateaus can float or sink by at most the ring slope times half their footprint; objects wider than 2 tiles (bus shelters, the sawtooth warehouse's dock) sit on plateaus or roads only. The contract's headless check (no object below the terrain by more than `0.05`) holds when the anchor is the lowest point of the footprint, so objects on slopes use the minimum `heightAt` over their four footprint corners as the anchor and let the ground painter hide the gap on the uphill side.

Ground mesh: `PlaneGeometry(128, 96, 128, 96)` with the vertex heights copied in row major order, `computeVertexNormals`, the same tile texture, casts and receives shadows; the skirt takes the edge vertex heights and drops `3` below them. Water planes stay at `y = 0.04`.

Cameras: free and orbit cameras keep `cam.y >= heightAt(cam.x, cam.z) + 1.6`; the chase camera's collision march stops at `heightAt + 0.6`.

## Ball on slopes

Ground under the ball: `g0 = terrain.heightAt(x, z)`, the ball rests at `g0 + BALL_R`. `course.terrain` carries the terrain; without it the old flat rules apply unchanged.

Constants kept from version 7: `GRAVITY 20`, `BALL_R 0.11`, `ROLL_DECEL` (green `3.0`, fairway `6.5`, rough `9.5`, sand `16`, path `5.0`, tee `6.5`), `RESTITUTION` (fairway `0.42`, green `0.30`, sand `0.10`, path `0.5`), `HRET 0.62`, `ROLL_SWITCH 1.2`, `REST_SPEED 0.15`, `CUP_R 0.22`, `CUP_SPEED 3.2`, `SUB_DT 1/120`. New: `SLOPE_K 0.9`, `REST_SLOPE 0.06`, `SLOPE_EPS 0.0005`, `CREEP_MAX 1.2`, `CREEP_K 0.35`, `CREEP_TIMEOUT 6`.

Rolling, per sub step `h`:

1. `grad = slopeAt(x, z)` (the analytic bilinear gradient), `slope = |grad|`, `steep = slope >= REST_SLOPE - SLOPE_EPS`. One predicate serves both the rest test and the creep test; a plane built from `(10 - x) 0.06` evaluates to `0.05999..` in floating point and would otherwise neither rest nor move.
2. Gravity along the slope: `vx -= SLOPE_K GRAVITY grad.x h`, `vz -= SLOPE_K GRAVITY grad.z h` (`18` times the gradient, downhill).
3. Rolling resistance: `s = |v|`; `decel = ROLL_DECEL[lie]`, except in the creep regime (`steep` and `s < CREEP_MAX`) where `decel = min(ROLL_DECEL[lie], CREEP_K SLOPE_K GRAVITY slope)`; `s' = max(0, s - decel h)`, scale `v` to `s'`.
4. Move `pos += v h`, then `pos.y = heightAt + BALL_R` (the velocity is horizontal in state; the vertical motion is implied by the ground).
5. Cup capture and lip out exactly as before (`CUP_R`, `CUP_SPEED`, `LIP_DEFLECT`); the cup sits in the flat `1.0` radius of its green.
6. Rest when `s' < REST_SPEED` and (`not steep` or the ball has been in the creep regime for more than `CREEP_TIMEOUT` seconds in a row).

Why the creep regime: with the lie decelerations as they are, `18 * 0.06 = 1.08` is far below the fairway's `6.5`, so a ball on a 6 percent slope would freeze with zero speed and never rest or move. In the creep regime the resistance is capped at `0.35` of the downhill pull, the ball accelerates at `0.65 * 18 * slope` (`0.70` on 6 percent) until `1.2`, where the full resistance returns and knocks it back under `1.2`, so it trickles downhill at about `1.2` per second until the slope eases under 6 percent, then rests. Reference run: from rest on a 6 percent fairway the ball reaches the flat 9 tiles below in `8.5` seconds and rests at slope `0.044`; the same on a green `8.7` seconds; a putt hit `2.0` per second up that 6 percent green from 2 tiles below the crest climbs `0.5`, turns and rolls back to the flat in `4.4` seconds (max speed `1.97`). The timeout exists only for a ball parked on a pinned ridge with no downhill exit, which the shaping above does not produce.

Bounce on landing: when a flying ball reaches `pos.y <= heightAt + BALL_R`, set `pos.y = heightAt + BALL_R`, `n = normalAt(x, z)`, `vn = dot(v, n)` (negative), `vt = v - vn n`; `v' = HRET vt - e vn n` with `e = RESTITUTION[lie]`. If `dot(v', n) < ROLL_SWITCH` the ball starts rolling with `v = (v'.x, 0, v'.z)` (the tangent plane handles the rest), else it flies on with `v'`. On a 10 percent slope the normal tilts `5.7` degrees, which throws a landing ball a little downhill, as it should.

Tuning checks: a 6 percent slope rolls (above). Greens are puttable: the contour is at most `0.12` high at wavelength 4 and zero near the cup, so 94 to 99 percent of each green is under 6 percent and a ball stops where it is hit; the contract's capture test, putter at power `0.4` (`7.5 (0.25 + 0.75 0.4) = 4.125` per second) from 2 tiles, arrives at the cup at `2.16 .. 2.78` per second on the six real greens (under `CUP_SPEED 3.2`; on a flat green the arrival is `2.24` and the ball would run `2.82` tiles without the cup). An uphill putt with low power rolls back on any stretch at 6 percent or more. Fairway corridors are graded at `0.05` or less along the line and level across their inner three tiles, except where a hazard bank, a green apron or a cross bunker crosses them (on the real plan 4 to 30 percent of inner corridor tiles are over 6 percent, nearly all beside the two ponds and on hole 6), so a drive that lands in the corridor stops; the outer tile of the corridor, the mound feet and the hazard banks are steeper and feed the ball back or into trouble; the rough keeps the hills (about 40 percent of it is over 6 percent) and a ball there creeps to the nearest hollow.

Water: the water event is unchanged; a ball creeping into a hazard or the river triggers it when its tile is water.

## Cart driving feel

Cart state in `js/player.js` (`state 'cart'`), model in `js/vehicles.js`. Numbers from the contract first, then the closing of the open ones.

Speeds by lie (the tile under the cart center): `8.5` on paths and fairway (`P`, `PK`, `Z`, `FW`, `GR`, `TEE`, `BR`), `6` on rough (`G`, `F`), `3.5` on sand (`SA`), `0` into water (`WA`, river and hazards: the cart stops at the shore, the four point test treats water as blocked). Acceleration `6`, braking `12`, rolling friction `2.5` (speed decays at `2.5` per second with no throttle), reverse at `0.4` of the forward max. Slopes: along the heading the cart feels `-0.35 GRAVITY dot(grad, heading) = -7 dot(grad, heading)`, so a 10 percent climb costs `0.7` per second squared against the `6` of throttle and a descent adds it; the max speed is not scaled by slope.

Steering: bicycle model, wheelbase `1.4`. Max steer angle `steerMax(v) = 0.55 (1 - 0.6 clamp(v / 8.5))` radians (`0.55` at rest, `0.22` at top speed); the steer angle eases toward the input at `4` radians per second and back to center at `6`; yaw rate `v / 1.4 tan(steer)` (`0.78` radians per second at `2` per second, `1.36` at `8.5`). The cart yaws with the steer; wheels spin at `v / 0.22` radians per second (wheel radius `0.22`); front wheels turn with the steer angle; the body rolls `-0.08 steer v / 8.5` radians into the turn and pitches and rolls with the terrain normal (eased at `10` per second).

Collision: the four point test of `player.js` at radius `0.45` (points at the four corners of the `0.45` square around the center) against `B`, `T` and `WA` tiles and the boundary; a blocked step is retried with the x and z components separately so the cart slides along walls; when both fail the speed is zeroed.

Boundary: the cart's allowed region is the golf area polygon union the clubhouse lot rectangle `(59, 70) 14 by 12` union the links parking rectangle `(42, 70) 10 by 6`, tested at the four points (so the cart center stays `0.45` inside). Pushing against it shows `The cart stays on the links` and the cart slides along the edge. Links Road is outside the region (its sidewalk is the north edge of the area), so the cart never reaches the street.

Spawn and parking: at the round start the cart spawns on the clubhouse stub at `(66.0, 73.0)`, heading north (yaw `pi`, direction `(0, -1)`), and the player is seated. The park spot of a tee is `2.2` tiles behind the tee point along the first segment's direction and `1.6` to the right of play, falling back to the left, then `3.0` straight behind, the first spot that lies on plain course ground or fairway (`G` or `FW`), at least `0.6` inside the region and `0.6` from any lot:

| hole | park spot (x, z) | side | heading yaw (faces the line) |
|---|---|---|---|
| 1 | (74.1, 73.1) | left | 1.41 |
| 2 | (90.2, 71.0) | left | 1.37 |
| 3 | (112.1, 84.3) | right | -0.67 |
| 4 | (82.5, 90.9) | right | -1.77 |
| 5 | (59.0, 92.0) | behind | -1.57 |
| 6 | (31.6, 91.4) | right | 1.99 |

(`yaw = atan2(u.x, u.y)` with the game's `(sin yaw, cos yaw)` convention; holes 1 and 2 use the left spot because the right one lands on hole 1's second bunker at (89.5, 73.5) or inside the clubhouse lot; hole 5 uses the straight back spot because both sides sit on hole 4's green.) After hole 6 the clubhouse spot is the spawn point.

Auto drive (`Tab`): the target is the ball's rest point minus `1.5` along the line from the cart (stop `1.5` short), or the next tee's park spot. Path rule: sample the straight segment every `0.5` tile with the four point test; if every sample is clear the cart drives the straight line. Otherwise it runs a BFS on the tile grid over cart passable tiles inside the region (`G, F, FW, GR, SA, TEE, P, PK, Z, BR`, never `B, T, WA`) from the cart's tile to the target's tile, converts the tile path to tile centers, and string pulls it (drop any waypoint whose predecessor and successor see each other by the same 0.5 tile line test), driving the waypoints in turn. Driving: throttle to the lie's max speed, steer toward the current waypoint with the bicycle model (a waypoint counts as reached within `0.6`), brake when the remaining distance to the final point is under `v v / (2 * 12) + 0.3`, stop at `0.3` from the final point and face the ball (or the tee line direction at a park spot), speed `0`. A BFS that finds no route (the ball in the river's notch behind a lot) leaves the cart where it is and shows `No cart route, walk from here`.

Getting in and out: `E` within `1.2` of the seat gets in; `E` in the cart gets out to the left side at `1.0` from the center, on a tile that passes the walker's four point test (else the right side, else behind). The chase camera follows the cart with the same spring as the walker, `2.2` behind and `1.3` up in the cart's frame, and keeps `cam.y >= heightAt + 0.6` on the collision march.
