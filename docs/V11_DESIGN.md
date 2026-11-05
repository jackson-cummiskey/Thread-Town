# Thread Town v11 design: the waterway, the boats, the kickers, the kiosk, the chase and the shop

Amends `docs/WORLD_DESIGN.md` for `docs/CONTRACT_V11.md`. Where this file and WORLD_DESIGN disagree, this file wins; where the contract and this file disagree, the contract wins. All numbers are tiles (1 tile = 1 world unit); a tile `(x, y)` covers world `x..x+1, y..y+1`, its center is `(x + 0.5, y + 0.5)`, y grows south. The plan is `js/cityplan.js` (`PLAN.version` is now 4); `validatePlan(PLAN, rasterizePlan(PLAN))` returns zero issues with everything below, and so does `validatePlan(PLAN, TT.state)` on the unchanged v10 sim.

## The idea

One connected sheet of boat water: the pond spills over a little weir into a creek that runs down through the park and the links into the lake; a channel leaves the lake's east shore beside the marina, cuts across hole 5 and joins the river; the river is open from the gorge to the south edge. Six docks, four boats. Three kicker ramps for the hoverboard, a shop kiosk by the subway stairs, an inspector and his dog in the runner.

## Water levels

| Body | Bed | Surface | Shore floor | Notes |
|---|---|---|---|---|
| The pond | 0 (the lot plateau) | `0.04` | the lot at 0 | unchanged |
| The creek, park reach | `-1.3` | `-0.9` | `-0.7` | the lake level, 0.4 deep |
| The creek, links reach | `-1.6` | `-0.9` | `-0.7` | the lake level, 0.7 deep |
| The lake | `-1.6` | `-0.9` | `-0.7` | unchanged |
| The channel | `-1.6` | `-0.9` | `-0.7` | the lake level |
| The river | `-1.4` | `-0.7` | `-0.5` | unchanged |

The creek runs at the lake level for its whole length, so every bridge on it keeps its deck well above the water (the contract blocks a deck under 1.2 above the surface). The bed is `-1.3` at the pond mouth and `-1.6` from the Links Road bridge down, non increasing from the pond to the lake; the terrain may interpolate the bed along each reach between those values. Levels step at two **weirs** (`PLAN.weirs`):

| Weir id | Lip | Upper | Lower | Drop | Reads as |
|---|---|---|---|---|---|
| `pond-weir` | the tile edge `y = 84` from `x = 50` to `52` (`axis: 'x', length: 2`), facing south | `0.04` (the pond) | `-0.9` (the creek) | 0.94 | the pond spilling into the creek mouth just east of the pier |
| `channel-sill` | the tile edge `x = 89` from `y = 119` to `122` (`axis: 'y', length: 3`), facing west | `-0.7` (the river) | `-0.9` (the channel) | 0.2 | a low sill where the river steps down into the channel |

The renderer draws a weir as a short lip mesh (a navy stone sill with a white water tongue) spanning `length` tiles along `axis` at the edge, from `lower` up to `upper`; the boat's hull eases over a weir over 1.5 tiles (the boat controller lerps its height between the two surfaces).

## The creek (`PLAN.waterways`, body `creek`)

Two reaches of one body, both `slow: true` (the boat slow zone, max 3, no wake), both at level `-0.9`, banks `[2, 2]`:

| Waterway id | Control points | Width | Bed | Joins |
|---|---|---|---|---|
| `creek-park` | `(51, 84.5) (51, 89.5) (51, 95.5)` | 2 (tiles x 50..51) | `-1.3` | `from: 'pond'` (next to the pond tiles on row 83), `to: 'creek-links'` |
| `creek-links` | `(50.5, 95.5) (49.5, 98.5) (49.5, 104.5) (49.5, 109.5)` | 3 (tiles x 48..50 from row 97) | `-1.6` | `from: 'creek-park'`, `to: 'lake'` (the last point is inside `LAKE`) |

Rasterization: a tile is water when its center lies within `width / 2 - 0.1` of a sample of the Catmull-Rom curve (samples every 0.2 tiles). The 0.1 margin makes a straight run on a tile center line exactly `width` tiles wide; at the bend below Links Road the creek is 2 to 3 tiles across a row. `rasterizePlan` stamps the creek as `WATER` before the roads (so the roads overwrite it and the bridges then cover the roads, exactly like the river), keeps the stamped tiles per waterway in `R.waterways[i].tiles` (keys `'x,y'`) and `R.waterways[i].mask`, and keeps the whole water layer before any later paint in `R.water` (one byte per tile) so the water under a bridge deck still counts for the boats. The shared helper is `waterwayMask(w, cols, rows)`; the terrain and the sim stamp the same mask.

The route, north to south:

- **The mouth** (rows 84 to 87, inside the pond lot, x 50..51): leaves the pond's south shore one tile east of the pier (the pier tile is `(49, 84)`, the pier deck `(49, 81..83)`, the swimmers' ladder `(50, 83)`). The pond's own tiles are untouched (53 tiles, as in v10); the creek starts at row 84 and connects to the pond tiles `(50, 83)` and `(51, 83)` by adjacency. The two mouth tiles `(50, 84)` and `(51, 84)` were shore tiles and are water now: the creek mouth tiles are not shore tiles (the sim's shore ring, computed from grass next to pond tiles, drops them on its own). The pond lot's south-east bench at `(52, 85)` stays (the creek is 2 wide here for that reason). The pond lot may hold waterway tiles: the lot conflict check exempts them.
- **The park** (rows 88 to 91, x 50..51): plain park lawn either side. The new **creek path** (`creek-path`, kind path) runs along row 89 from the park path's foot at `(41, 89)` east to the avenue's sidewalk at `(63, 89)`; it crosses the creek on the **creek footbridge** (`creek-footbridge`, kind `foot`, `a: [50, 89], b: [51, 89]`, width 1, `arch: 0`, `waterway: 'creek-park'`). The park lawn is at `+0.4`, the water at `-0.9`: 1.3 of clearance without an arch.
- **Links Road** (rows 92 and 93 are the road here, x 50..51 water): the **Links Road creek bridge** (`creek-road-bridge`, kind `low`, `a: [49, 93], b: [52, 93]`, width 3 so the deck covers rows 92..94 over x 49..52 (the two road rows and the south sidewalk row, so `(49, 94)` is deck, not paving) with one dry tile each side, `arch: 0.4`). The sidewalk rows 91 and 95 break at the water (the sidewalk never paints over water); walkers use the deck. The creek tiles under the span `(50..51, 92..94)` have their x 50 column at -0.70 and centers near -1.12, so the deck clears 1.23.
- **The bend** (rows 94 to 97): the creek shifts one tile west and widens to 3 (x 48..50) so it stays off the driving range lot (x 52..61, y 97..104).
- **Hole 9's bank** (rows 97 to 105, x 48..50): the creek runs down the right side of hole 9. The west cart path (`west-cart`) now turns south at `(45.5, 97.5)` and runs down the creek's west bank at x 46 (`(46.5, 100.5) (46.5, 104.5) (46.5, 106.5)`), one tile off the green.
- **The mouth into the lake** (rows 106 to 109): the lakeshore path crosses row 106 at x 47..51 and the cart path joins it there; both cross on the **creek mouth cart bridge** (`creek-cart-bridge`, kind `cart`, `a: [48, 106], b: [50, 106]`, width 2 so the deck covers rows 105..106, `arch: 1.0`, `waterway: 'creek-links'`), a humpbacked plank deck two planks wide (the cart fits on it like the links footbridge; a one tile deck is closed to the cart by the v10 rule) whose ends `(47, 106)` and `(51, 106)` are path tiles. The west cart path continues `(47.5, 106.5) (51.5, 106.5) (52.5, 106.5) (54.5, 107.5)` along the range's south edge to the clubhouse as before. The creek enters the lake at `(48..50, 108)`.

Tile counts: `creek-park` 24 tiles (rows 84..95, 2 per row), `creek-links` 47 tiles (rows 94..110, the overlap rows shared), 68 distinct creek tiles in all, about 26 rows long.

### The hole the creek crosses: hole 9, Homeward (par 4)

The creek runs down the right side of hole 9 to the lake, so the hole is reshaped to put it in play on the approach: the green moves two tiles east onto the creek's west bank and the dogleg gets a fourth line point so the fairway turns into it.

| | v10 | v11 |
|---|---|---|
| Tee | `(14, 102)`, elev 0.3 | unchanged |
| Cup | `(40, 100)` | `(42, 100)` |
| Line | `(14,102) (26,99) (40,100)` | `(14,102) (26,99) (36,100) (42,100)` |
| Length | 26.1 tiles, 261 yd | 28.07 tiles, 281 yd (par 4 range 22..32) |
| Bunkers | `(35,103) r 1.3` in the bend, `(44,98) r 1.1` behind the green | `(35,103) r 1.3` in the bend, `(38,98) r 1.1` short left under the cart path |
| Hazards | the lake short and right | the creek long and right (its bank is one cart path tile off the green's east edge at x 44), the lake short and right |

The green tiles are x 40..44, rows 98..102; the cart path at x 46; the bank x 47; the water x 48..50. The pars stay `4 3 5 4 4 3 5 3 4`, par 35; every hole stays inside `HOLE_LENGTHS`; the card total becomes 2,268 yards (was 2,248). Hole 9's story: "The dogleg around the hill foot: the fairway bends right around a knoll below Links Road and climbs to a green on the bank of the creek, which runs down the right side to the lake; anything long or right is wet, a short cart ride from the clubhouse."

## The channel (`PLAN.waterways`, body `channel`)

| Waterway id | Control points | Width | Level, bed | Slow | Joins |
|---|---|---|---|---|---|
| `channel` | `(55.5, 113.5) (58.5, 113.5) (64.5, 113.5) (70.5, 115.5) (76.5, 118.5) (81.5, 120.5) (86.5, 120.5) (88, 120.5)` | 3 | `-0.9`, `-1.6` | no | `from: 'lake'` (the first point is inside `LAKE`), `to: 'river'` (the last tile is 4-adjacent to the river's west bank at the sill; a waterway end joins a plan body when its end tile is inside the polygon or 4-adjacent to one of its tiles) |

106 tiles, rows 112 to 121 (the mask stops at x 88 on rows 119..121, so no channel tile lies inside the river ribbon and the only level steps are the three channel-sill edges at x 89). It leaves the lake's east shore just north of the marina (the marina tile is `(58, 115)`, its deck `(53..56, 115)`; the channel's mouth is rows 112..114 at x 55..58, so the marina deck's north slips open onto it), runs straight east along rows 112..114 to x 66, then bends south east across hole 5's fairway and runs straight along rows 119..121 to the river's west bank at x 88. The links footbridge is at y 100, nowhere near, so the channel gets its own bridges:

- **Marina footbridge** (`channel-footbridge`, kind `foot`, `a: [58, 112], b: [58, 114]`, width 1, `arch: 1.0`, `waterway: 'channel'`): the lakeshore path over the channel mouth; its ends are the path tile `(58, 111)` and the marina tile `(58, 115)`.
- **Channel cart bridge** (`channel-cart-bridge`, kind `cart`, `a: [85, 119], b: [85, 121]`, width 2 so the deck covers x 84..85, `arch: 0.8`, `waterway: 'channel'`): the west cart path's vertical run at x 85, on a deck two planks wide so the cart fits on it (rows 117..121 already run straight) over the channel three tiles before the river bank; its ends are the cart path tiles `(85, 118)` and `(85, 122)`.

The channel crosses **hole 5, Bankside (par 4)** as a water hazard without changing its tee `(82, 110)`, cup `(70, 131)`, line, bunkers or length (24.2 tiles): the links occupy the whole strip between the lake and the river, so any channel crosses hole 5. The band cuts the fairway diagonally between rows 115 and 121 (49 water tiles inside the hole's corridor box), its centerline passing the line point `(78, 118)` about nine tiles from the tee, so the drive carries about four tiles of water. Hole 5's story now reads: "the drive must carry the channel that cuts across the fairway on its way from the lake to the river, then the green sits between two bunkers." The rasterizer paints the course after the water, and `setCourse` never paints over water, so the fairway simply has a water band through it; `lieAt` returns `water` there from the sim tile.

The rack that stood at `(61, 113)` is in the channel; it moves to `(63, 110)` beside the lakeside bench `(61, 110)`, 7 tiles from the marina tile.

## Bridges and clearance

The contract lets boats under a bridge only when the deck is at least 1.2 above the water. `PLAN.bridges[].arch` (0 to 1.5) is new: the deck rises that much above the straight ramp between its ends at mid span (a humped deck, cosine profile, flat ends). The terrain reads it when it pins the approach rows and answers heightAt over the span; the city dressing builds the deck to the same profile. In the terrain's bridge pass a span row counts as over water when it is wet, adjacent to a wet row, or holds shore or bank vertices (pinned 5 or within 1.5 of the water), and such a row is only ever lowered to the deck floor, never raised. The mid span clearance is the number that must reach 1.2; the deck ends over a wet bank row can sit lower (the river bridge's end columns read about 0.9 over the water), which only a browser pass can judge for hull clipping.

| Bridge | Deck over water | Water | Deck mid span (about) | Clearance | `arch` |
|---|---|---|---|---|---|
| `bluff-bridge` | the gorge | `-0.7` | `+2.5` to `+5` | over 3 | none |
| `river-bridge` | the plaza reach | `-0.7` | 0 + 0.6 | 1.3 | 0.6 |
| `links-footbridge` | the links reach | `-0.7` | about `-0.3` + 1.0 | 1.4 | 1.0 |
| `creek-footbridge` | the creek, park reach | `-0.9` | `+0.4` | 1.3 | 0 |
| `creek-road-bridge` | the creek, park reach | `-0.9` | about `-0.08` + 0.4 | 1.23 | 0.4 |
| `creek-cart-bridge` | the creek mouth | `-0.9` | about `-0.6` + 1.0 | 1.3 | 1.0 |
| `channel-footbridge` | the channel mouth | `-0.9` | about `-0.6` + 1.0 | 1.3 | 1.0 |
| `channel-cart-bridge` | the channel | `-0.9` | about `-0.3` + 0.8 | 1.4 | 0.8 |
| `island-bridge` | the lake | `-0.9` | about `-0.6` | 0.3 | none: not on the boat network (the island ring is reached around it; the boat BFS reach counts the water under it, then `boatWater` clears its tiles from the mask (`boatWater.blocked`) so the sim, the validator and the boat controller all treat them as a bank) |

The terrain verification adds: every bridge with a `waterway` or on the river below the gorge clears 1.2 at mid span. A new bridge kind `cart` joins `high`, `low` and `foot`; a `cart` bridge is 2 wide, since the cart planner closes any one tile deck (the island spur rule); `validatePlan` requires at least one `cart` and one `foot` bridge over a waterway, and the "three river bridges" rule counts only bridges without a `waterway`.

## Docks (`PLAN.docks`, `state.docks`)

A dock is a dry tile (a bank tile or a deck tile) with open boat water on one side. `rot` is the plan's facing convention: the open water is at `rotVec(rot, 0, -1)` from the tile (0 north, 90 west, 180 south, 270 east); `yaw` is the heading of the slip direction in the sim's convention, `atan2(dir.x, dir.y)` (rot 0 gives PI, 180 gives 0, 90 gives -PI/2, 270 gives PI/2), the bow pointing into the open water; `rasterizePlan` derives it the same way and ignores any yaw written in the plan; the marina record uses the same `rot` and `yaw`. `rasterizePlan` returns `R.docks[] = { id, name, tile, slip, dir, rot, yaw }` where `slip` is the water tile.

| Dock id | Tile | rot | yaw | Slip (water) | Where |
|---|---|---|---|---|---|
| `marina-1` | `(56, 115)` deck | 0 | 3.1416 | `(56, 114)` | the marina deck's first plank, north side, on the channel mouth |
| `marina-2` | `(54, 115)` deck | 0 | 3.1416 | `(54, 114)` | the deck's third plank, north side |
| `marina-3` | `(55, 115)` deck | 180 | 0 | `(55, 116)` | the deck's second plank, south side, on the lake |
| `pier-east` | `(49, 85)` lawn | 270 | 1.5708 | `(50, 85)` | the lawn one tile south of the pier's foot `(49, 84)`; its east flank is the creek mouth one row below the pond weir's plunge row |
| `pond-landing` | `(52, 86)` lawn | 90 | -1.5708 | `(51, 86)` | the creek's east bank in the pond lot, one tile south of the lot's south-east bench |
| `river-landing` | `(112, 46)` bank | 90 | -1.5708 | `(111, 46)` | the river's east bank eight tiles west and two south of the bluff stairs' foot `(120, 44)`, between the riverside walk (x 118) and the water |

Why the pier dock is at the pier's foot and not on the planks: the contract blocks the swim spots plus one ring, and the swim spots (pond tiles whose four neighbours are pond tiles) cover the whole pond interior, planks included, so every pond tile east of the pier is blocked; the pond's only boat water is its mouth. The mooring is the creek mouth beside the pier's foot. The dock sits one tile south of the pier tile, not on it: row 84 is the weir's plunge row (its north corners sit on the pond lip at 0) and can never float a hull, while the slip `(50, 85)` reads -0.964 at its center under the -0.9 surface.

The marina keeps `slips: 4`; the fourth plank `(53, 115)` has no dock. Four boats at start (sim): `marina-1` a launch, `marina-2` a rowboat, `pier-east` a rowboat, `river-landing` a launch; `marina-3` and `pond-landing` start free for tying up. Terrain: a bank dock tile is pinned flat at its water's surface plus 0.3 (three bank docks: `pier-east` and `pond-landing` at `-0.6`, `river-landing` at `-0.4`); deck docks keep their heights, and the pier tile `(49, 84)` slopes 0.6 down to the dock pad (slope class steep, walkable). The slip center of every dock reads below its surface (`terrain.docks[].slipUnder`). City: a bank dock is a 1 by 1 plank platform at that height with a mooring post on the water side; a deck dock is a cleat on the plank. The sim protects a one tile ring around every dock from trees (the valley and the pond lot grow trees).

## The boat water and the BFS proof

`boatWater(R)` in `js/cityplan.js` builds the boat mask the sim and the validator share:

1. start from `R.water` (the river, the lake, the creek, the channel, as stamped before any road, bridge, lot or deck paints over them, so the water under every bridge deck counts);
2. add the pond tiles (`R.lots[pond].pondTiles`);
3. remove the island tiles (`R.islandTiles`) and every `DECK` tile (the pier planks `(49, 81..83)`, the marina planks `(53..56, 115)`);
4. remove the swim spots (31 pond tiles whose four neighbours are pond tiles, the sim's v10 set) plus their four neighbours (51 excluded keys in all);
5. re-open every dock's slip tile.

2,316 tiles open after step 5. The BFS (4-connected) starts at `marina-1`'s slip `(56, 114)` and reaches 2,314 of them; the two it misses are the pond's corner tiles `(45, 78)` and `(53, 78)`, open but walled in by the swim ring, which no dock uses. Every dock's slip is reached: `marina-1` `(56,114)`, `marina-2` `(54,114)`, `marina-3` `(55,116)`, `pier-east` `(50,85)` (35 tiles from the marina: the lake north shore, the creek mouth cart bridge, up the creek under Links Road and the footbridge), `pond-landing` `(51,86)` (35 tiles), `river-landing` `(111,46)` (133 tiles: the channel, the sill, up the river under the links footbridge and the River Street bridge to the gorge). The island ring (the lake tiles around the island, under the island bridge too) is in the reached set. After the BFS, `boatWater` clears the mask under every bridge flagged `island: true` (and any bridge without an `arch`, other than kind `high`): the 8 tiles `(44, 123..130)` under the island bridge, returned as `blocked`, so the mask is 2,308 tiles while `reach` still counts 2,314; `sim.boatWaterAt` and the player's boat mask follow the cleared mask. Residual: the weir plunge tiles `(50, 84)` and `(51, 84)` stay in the boat mask although their ground centers (-0.65 and -0.83) sit above the -0.9 surface. `validatePlan` fails if any slip is not reached, if a slip is not open water, if a dock tile is water, road, bridge, building, feature or course, or if two docks share a slip; the walking BFS from the spawn must reach every dock tile and the kiosk front.

## Kickers (`PLAN.kickers`)

A kicker is a two tile wooden ramp: the foot tile `(x, y)` and the lip tile one step toward the launch direction `rotVec(rot, 0, -1)` (0 north, 90 west, 180 south, 270 east). `rasterizePlan` returns `R.kickers[] = { id, name, foot, lip, launch, dir, rot, yaw }` (`launch` is the tile beyond the lip). Terrain: the foot tile's four vertices stay at the local ground, the lip tile's far edge is 0.8 above it and its near edge 0.4, pinned and flagged steep so the relax pass leaves the ramp; city builds a plank ramp 1 wide over the two tiles with two side rails. The scooter and the cart treat the two tiles as a low obstacle.

| Kicker id | Foot | Lip | rot | Launch | Run up |
|---|---|---|---|---|---|
| `bluff-kicker` | `(122, 29)` | `(122, 28)` | 0 (north) | `(122, 27)`, plain plateau at 5.06 beside Executive's lot (its x 124 edge stays 5.06); the ramp reads 5.06 / 5.46 / 5.86 and the wall drops at row 26 to the bank and the river | north along x 122 from Ledger Street's sidewalk at row 36 |
| `ridge-kicker` | `(43, 21)` | `(43, 20)` | 0 (north) | over the hill's north flank forest toward Harbor Lane (y 10..11 at x 43, about +1) from the crest at +9 | east along the ridge top from Ridge Road's end `(38, 22)` past the ridge top rack `(40, 21)` and the bench `(37, 20)`, then north |
| `marina-kicker` | `(60, 110)` | `(60, 111)` | 180 (south) | into the channel mouth: `(60, 112)` is channel water at `-0.9`, beside the lakeside bench; the ramp reads 0.34 / 0.74 / 1.14 | south along x 60 over the cart path |

All six tiles are plain grass, rough or open plateau off every road, path, lot, deck and course tile; the ridge and marina launch tiles are air over the hill flank and water, the bluff launch tile is the plateau before the wall. The kicker pass takes its ground from the mean of the foot tile's back edge only, and skips vertices pinned 1..4 (a lot plateau, the plaza or pond, a road, a deck), which is why the marina kicker moved off the lakeshore path corner at `(55, 110)`. The sim protects a one tile ring around each kicker from trees.

## The kiosk (`PLAN.kiosk`, `state.kiosk`)

`{ x: 77, y: 72, rot: 0, name: 'Thread shop kiosk' }`: a 1 by 1 booth on the plaza two tiles west of the subway footprint (`79..80, 71..72`), its window facing south onto the front tile `(77, 73)`, the same row as the subway's enter row `(79..80, 73)`. The raster paints the tile `FEATURE` (not walkable) and returns `R.kiosk = { tile, front, rot, yaw }`; the prompt `E  Shop` shows within 1.5 of the front tile's center. Look: a navy booth with an aqua roof and a silver counter, a salmon 'Shop' sign over the window, a coin icon on the side, lit at night like the plaza lamps. `validatePlan` checks the kiosk is on the plaza, clear of the fountain basin, the subway footprint and enter row, the spawn, the racks and the benches, within 6 tiles of the subway, with a clear paved front tile that the walking BFS reaches.

## The chaser look

- **The inspector**: the runner's humanoid rig style (aliens3d), 1.05 of the runner's scale. Navy uniform coat with two rows of silver buttons, a navy peaked cap with a silver badge, a salmon tie, silver cuffs. Grumpy face: brows down and in, a flat mouth, no smile; the eyes track the runner. Run pose with the arms pumping; in the stumble burst the arms reach forward (both arms out, hands open, 0.8 behind the runner); in the catch the inspector grabs the collar with both hands and hauls back, feet planted.
- **The dog**: a small quadruped from animals3d's quadruped pose set, 0.45 of the inspector's height, a silver grey coat with a navy collar and an aqua tag, ears up, a tail that wags in the run pose. Leash: a navy line from the inspector's left hand to the collar, drawn as a thin tube between the two pose points. In the stumble burst the dog leaps (the quadruped jump pose, front paws up); in the catch it jumps up at the runner and barks (a small white puff and a 'Woof' label, 1.2 s).
- Both chasers run in the runner's lane, visible for the first 1.5 s of every run bursting out of the station behind the runner, then drop back out of frame; pooled meshes, allocation free per frame, within the draw budget (the chasers reuse the runner's material set).

## The shop catalogue (`wallet.catalogue`)

Prices as in the contract. Ids, slots and labels are fixed here so the wallet, the shop and the picker agree.

| id | Label | Price | Kind | Slot | Effect |
|---|---|---|---|---|---|
| `hoverboard` | Hoverboard | 1,200 | one-time | | unlocks the town hoverboard and the runner power up (`H` in the runner, one crash forgiven within 30 s) |
| `magnet` | Coin magnet | 150 | consumable (a run) | | the next run starts with the magnet active |
| `jetpack` | Jetpack | 250 | consumable (a run) | | the next run starts with the jetpack active |
| `multiplier` | 2x multiplier | 200 | consumable (a run) | | the next run starts with the 2x multiplier active |
| `board-navy`, `board-aqua`, `board-salmon`, `board-silver`, `board-sand` | Navy, Aqua, Salmon, Silver, Sand board | 100 each | one-time | `board` | the hoverboard's deck colour (navy is the default and is owned with the hoverboard) |
| `hat-cap`, `hat-beanie`, `hat-crown`, `hat-cowboy`, `hat-visor` | Cap, Beanie, Crown, Cowboy hat, Thread visor | 300 each | one-time | `hat` | worn by the visitor in town and in the runner; the character picker lists the owned hats |

`wallet.equipped = { board: id | null, hat: id | null }`; `equip(slot, id)` refuses an item not owned; `consume(id)` spends one owned consumable. The near miss pays 2 coins and every 5 in a row raises the run multiplier by 1 (max +3) until the next hit, so a decent 1,500 m run (about 150 to 250 coins) buys a consumable and the hoverboard takes three or four runs.

## Plan fields added in `js/cityplan.js`

- `PLAN.version = 4`.
- `PLAN.waterways[]`: `{ id, name, body, pts, width, level, bed, bank, slow, from, to, purpose }` (exported as `WATERWAYS`).
- `PLAN.weirs[]`: `{ id, x, y, axis, length, upper, lower, purpose }` (exported as `WEIRS`).
- `PLAN.bridges[]`: new entries `creek-footbridge`, `creek-road-bridge`, `creek-cart-bridge`, `channel-footbridge`, `channel-cart-bridge`; new fields `arch` (0..1.5) and `waterway` (the waterway id a bridge spans); new kind `cart`; `arch` on `river-bridge` (0.6) and `links-footbridge` (1.0).
- `PLAN.docks[]`: `{ id, x, y, rot, yaw, name }` (exported as `DOCKS`).
- `PLAN.kickers[]`: `{ id, x, y, rot, name, purpose }` (exported as `KICKERS`).
- `PLAN.kiosk`: `{ x, y, rot, name }` (exported as `KIOSK`).
- `PLAN.roads[]`: new `creek-path`; `west-cart` re-routed after hole 9.
- `PLAN.golf.holes[8]` (hole 9) reshaped as above; `holes[4]` (hole 5) story updated.
- `PLAN.scooterRacks`: the marina rack moved from `(61, 113)` to `(63, 110)`.
- `rasterizePlan` returns, in addition to v10's fields: `water` (the water layer, `Uint8Array`), `waterways[]` (`{ id, body, width, level, bed, bank, slow, mask, tiles, samples }`), `waterwayAt(x, y)`, `kiosk`, `docks[]`, `kickers[]`; `inWater(x, y)` now includes the waterways.
- New exports: `waterwayMask(w, cols, rows)`, `boatWater(R)` (returns `{ mask, swim, excluded, start, reach, at(x, y), reaches(x, y) }`). Every v10 export stays.
- `validatePlan` new checks: waterway widths (2 or 3), bed below level, ends joining the bodies they name, no waterway through a building, deck, plaza or non pond lot; no road, path or cart path tile on a waterway outside a bridge deck; every bridge naming a waterway spans it with dry ends; a `cart` and a `foot` bridge over a waterway; bridge kinds and `arch` range; the six docks (three marina slips), their tiles and slips, the water BFS from the marina; the three kickers on plain ground; the kiosk rules; the walking BFS reaches every dock tile and the kiosk front.

## What the other modules must change

- **`js/sim.js`**: map the waterway tiles exactly as the raster gives them (they are already `WATER` marks, so the tile grid is right; nothing to stamp); keep `TT.sim.raster` (the rasterizePlan result) on the sim object so `boatWater` can be called by the player and the validator; `state.waterways = R.waterways.map(w => ({ id, body, level, bed, slow, tiles: [{x, y}] }))` and `state.weirs` from `plan.weirs`; swim spots must be pond tiles whose four neighbours are pond tiles (today the rule is four `WA` neighbours, which would make `(50, 83)` a swim spot now that `(50, 84)` is creek water; the v10 set of 31 must stay); `state.docks` from `R.docks` (`{ id, name, x, y, tile, slip, yaw, rot, boat: null }`; `nearestDock` measures the slip center and skips a dock whose slip is farther than its tile, the player's `pickDock` rule, so a boat is never hauled through a deck) and `state.kickers` from `R.kickers`, `state.kiosk` from `R.kiosk`, with `protectTileRing` on every dock, kicker tile and the kiosk so no tree or flower lands on or beside them; `state.boats` (four at start, as in Docks above); `state.bridges[]` carries `arch` and `waterway`; the pond lot's south-east bench keeps its tile `(52, 85)` (grass, no change needed) but if a future creek widening put water there the bench should step one tile east; `state.waterTiles` already picks up the creek and channel; agents never path over water so nothing else changes. The pier's landing and ladder are unchanged.
- **`js/terrain.js`**: add the waterways to `waters` with `tiles = waterwayMask(w, cols, rows)`, `height = w.bed`, `shore = w.level + 0.2` (not `bed + 0.9`, since the park reach is only 0.4 deep), `bank = w.bank` ([2, 2]); the bed may be interpolated along the reach (creek-park `-1.3`, creek-links `-1.6`, channel `-1.6`) and must be non increasing from the pond to the lake; the pond lot's plateau pinning must skip the creek's bed vertices inside the lot (they are wet); the wet class for a waterway is its body (`creek` 3, `channel` 4, or reuse 2 for lake level water); `terrain.water` gains `{ id: 'creek', kind: 'creek', bed: -1.6, shore: -0.7, surface: -0.9 }` and the same for `channel`; bridge decks honour `arch` (a cosine hump of that height at mid span, zero at the ends) in both the approach row pinning and `heightAt`/`slopeAt` over the span; bank dock tiles (`pond-landing`, `river-landing`) are pinned flat at surface + 0.3; kicker tiles are shaped last as 2 tile ramps (foot at the ground, lip far edge +0.8, near edge +0.4, pinned, steep); the verification adds the monotone creek bed, flat docks, shaped kickers and the 1.2 clearance of every bridge on the boat network.
- **`js/golf.js`**: nothing structural; `lieAt` already returns `water` from the sim's `WA` tile for the creek and the channel, and the plan's `water` polygons still cover the lake and the river. Add the raster's waterway tile sets to the course's water test where a polygon test alone is used (the aim preview's landing lie and the hover readout), read the sunk ball's rest height from the body's surface (`-0.9` on the creek and the channel), and use the new stories for holes 5 and 9 (they come from the plan). Hole 9's card reads 281 yards; the card total 2,268.
- **`js/city.js`**: drop the static moored rowboats at the marina slips (the boats are sim entities drawn by vehicles.js now; the boardwalks' decorative rowboats on the river and the lake's north shore may stay); build the five new bridges (plank decks for `foot` and `cart`, a stone deck for the Links Road `low` bridge) with the `arch` profile; the docks (plank platform and post on a bank tile, a cleat on a deck tile); the three kicker ramps; the kiosk booth; the two weir lips (navy stone sill, a white water tongue, `pond-weir` 2 long facing south, `channel-sill` 3 long facing west); the creek path is a path like the park path. Nothing stands on the pond lot's south-east bench tile.
- **`js/render3d.js`**: the water bodies list gains the creek and the channel (surface `-0.9`, their tiles from `R.waterways`, one merged mesh per body so each has one level; the `waterLevelAt` lookup tests the waterway tile sets before the polygons); the weir meshes; hoverboard and boat rendering, the minimap and shop wiring, the kiosk prompt and the chaser handoff as the contract lists; the walking BFS targets now include the dock tiles and the kiosk front.
- **`docs/WORLD_DESIGN.md`**: amended by this file for the creek, the channel, the hole 9 numbers, the west cart path, the creek path, the marina rack, the bridges table and the card total.
