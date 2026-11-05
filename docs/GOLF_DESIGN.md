# Thread Town golf

Numeric spec for the golf park in `docs/CONTRACT_V5.md` (sections "Map v3" golf park, "Golf", and the golf parts of "Player v2"). The contract wins where this file disagrees; where the contract leaves a number open, this file closes it. Everything here was checked by a script against the block math in `js/sim.js` (`blockOrigin(c, r) = (2 + 16 c, 2 + 16 r)`, block row 3 spans y `50..63`, each block is 14 by 14 tiles, cart paths at x `16,17` and `32,33`, roads at x `48,49` and `64,65`, the south road at y `64,65`).

Conventions: tile coordinates are integers `(x, y)` where sim `y` is world `z`; a tile's center is `(x + 0.5, y + 0.5)`. Points that the controller uses (tee, cup, flag, props) are given as world coordinates `(x, z)` with one decimal. A tile belongs to an ellipse when its center satisfies `((cx - ex) / rx)^2 + ((cy - ey) / ry)^2 <= 1`; the resulting rows are listed after every ellipse so the sim can be typed either way and verified against the list. Painting order inside a block: rough `G` first, then fairway `FW` rectangles, then the green `GR`, bunkers `SA`, tee boxes `TEE` and water `WA`; a later feature replaces an earlier one on a shared tile, so fairway rectangles may overlap a green or a bunker. The cart paths stay `P`. No tree, flower `F` or lamp is placed on any `FW, GR, SA, TEE, WA` tile or within 1 tile (Chebyshev) of one. Hole bounds are the block rectangle; `parkBounds = { x0: 2, y0: 50, x1: 48, y1: 64 }` (world, upper edges exclusive) is the `out` test for hole play and the clamp for the walking phase.

Palette (brand and `docs/ART_DIRECTION.md`): navy `#002D4F`, aqua `#75CCD0`, salmon `#E7706F`, silver `#E2E9EE`, trim white `#F8F6F0`, wood `#A5774E`, dark wood `#6B4A2B`, iron `#2E3E50`, fairway `#7FBF5F` striped `#78B85A`, green `#9BD47A`, sand `#E7D9B0`, tee `#6FB356`.

## Course overview

- Three par-3 holes in blocks `[0,3]`, `[1,3]`, `[2,3]`, par 9 in total. They play west to east across the row, so the round ends at the cart path next to the clubhouse block `[3,3]`, with the driving range `[4,3]` beyond it.
- Hole 1 "Opener": straight, 10.0 tiles, plays east. One bunker short left, one long right. Iron or soft driver.
- Hole 2 "Pond": diagonal south-west to north-east, 13.4 tiles, the long hole. Pond on the right of the landing zone, bunker behind the green. Driver at about 0.7 power.
- Hole 3 "Twins": straight, 10.0 tiles, plays south from the north road. Two bunkers flank the green.
- Walking distances for the auto-walk between holes: hole 1 cup to hole 2 tee 7.8 tiles (1.5 s at 5.2 u/s), hole 2 cup to hole 3 tee 11.2 tiles (2.2 s), hole 3 cup to the clubhouse porch 16.6 tiles (the player walks this one).
- `state.golf.holes` summary (world units):

| n | tee | cup | greenCenter | greenR (rx, ry) | bounds | water tiles |
|---|---|---|---|---|---|---|
| 1 | (3.5, 57.5) | (13.5, 57.5) | (12.5, 57.5) | 2.6, 2.3 | x 2..16, y 50..64 | none |
| 2 | (19.5, 62.5) | (29.5, 53.5) | (28.5, 53.5) | 2.4, 2.2 | x 18..32, y 50..64 | 12 (listed under hole 2) |
| 3 | (40.5, 51.5) | (41.5, 61.5) | (40.5, 60.5) | 2.6, 2.1 | x 34..48, y 50..64 | none |

The contract's `greenR` is one number; store `greenR = max(rx, ry)` there and keep `rx, ry` as `greenRx, greenRy` beside it so `lieAt` can test the exact ellipse.

## Hole 1

Block `[0,3]`, origin `(2, 50)`, tiles x `2..15`, y `50..63`. Direction of play: +x (east). Tee to cup 10.0 tiles. Par 3.

- Tee tile `(3, 57)`, tee point `(3.5, 57.5)`. Tee box `TEE` rectangle x `2..4`, y `56..58` (9 tiles).
- Cup tile `(13, 57)`, cup center `(13.5, 57.5)`.
- Green ellipse center `(12.5, 57.5)`, radii `2.6 x 2.3`. Tiles: y 55 x 11..13; y 56 x 10..14; y 57 x 10..14; y 58 x 10..14; y 59 x 11..13 (21 tiles). The cup is 1.0 east of the green center.
- Fairway corridor: one rectangle x `5..9`, y `55..59` (25 tiles). It runs from the tee box to the green with a 1 tile rough fringe above and below.
- Bunker A (long right, south-east of the green): ellipse center `(11.5, 61.0)`, radii `1.7 x 1.1`. Tiles: y 60 x 10..12; y 61 x 10..12 (6 tiles).
- Bunker B (short left, north of the fairway end): ellipse center `(9.5, 54.5)`, radii `1.3 x 0.9`. Tiles: y 54 x 8..10 (3 tiles).
- Water: none.
- Trees (13, edge tiles only, all at least 2 tiles from every course tile): north edge `(2,50) (5,50) (8,50) (11,50) (14,50)`; south edge `(2,63) (5,63) (8,63) (11,63) (14,63)`; west edge `(2,53)`; east edge `(15,52) (15,62)`. Variety by `TT.rng(TT.hash(x + ',' + y))` as elsewhere. No trees at x 15 in y 55..59 because the green reaches x 14.
- Flag at the cup center, number `1`.
- Tee markers at `(3.5, 56.9)` and `(3.5, 58.1)` (0.6 either side of the tee point, perpendicular to the line of play).
- Yardage sign at `(3.5, 59.6)` facing north (readable from the tee): `Hole 1 · Par 3 · 10 tiles`.
- Bench at `(3.5, 54.6)` facing east (toward the green). Ball washer at `(2.5, 59.5)`.
- Ideal shot: driver at power 0.58 (total 10.1) or iron at 0.80 (total 9.9). Long right finds bunker A; a push at full iron runs to the cart path at x 16 (`path` lie, still in bounds); x 48 or farther is never reachable from here.

## Hole 2

Block `[1,3]`, origin `(18, 50)`, tiles x `18..31`, y `50..63`. Direction of play: north-east, unit vector `(0.743, -0.669)`. Tee to cup 13.45 tiles. Par 3.

- Tee tile `(19, 62)`, tee point `(19.5, 62.5)`. Tee box `TEE` rectangle x `18..20`, y `61..63` (9 tiles, in the south-west corner).
- Cup tile `(29, 53)`, cup center `(29.5, 53.5)`.
- Green ellipse center `(28.5, 53.5)`, radii `2.4 x 2.2`. Tiles: y 51 x 28; y 52 x 26..30; y 53 x 26..30; y 54 x 26..30; y 55 x 28 (17 tiles). The cup sits 1.0 east of the green center, 1 tile from the east edge (x 31 is rough, the cart path is x 32).
- Fairway corridor, two rectangles: x `21..25`, y `55..60` (the landing zone, 30 tiles, minus the 6 that the pond takes) and x `24..26`, y `53..56` (the approach neck into the green, 12 tiles, two shared with the green). Painted after rough and before green and water, so the pond and green win on shared tiles. Net fairway after overlaps: 32 tiles.
- Water hazard: ellipse center `(26.0, 59.5)`, radii `2.4 x 1.8`. Tiles: y 58 x 24..27; y 59 x 24..27; y 60 x 24..27 (12 `WA` tiles). Shore sand is painted around it by the renderer as elsewhere. The line of play passes `(26.0, 56.6)`, 1.4 tiles north of the pond edge, so a straight shot is dry and a push (right of the line, toward the south-east) is wet. These tiles are swimmable for the visitor and are not swim spots for agents.
- Bunker (behind the green, north): ellipse center `(26.0, 51.5)`, radii `1.5 x 0.9`. Tiles: y 51 x 24..27 (4 tiles).
- Trees (12): north edge `(18,50) (21,50) (30,50)`; west edge `(18,53) (18,56) (18,59)`; east edge `(31,57) (31,60) (31,63)`; south edge `(23,63) (26,63) (29,63)`. No trees at y 50 in x 23..29 (bunker and green nearby) and none at x 31 in y 51..55 (green).
- Flag at the cup center, number `2`.
- Tee markers at `(19.9, 62.9)` and `(19.1, 62.1)` (0.6 either side along the perpendicular `(0.669, 0.743)`).
- Yardage sign at `(18.5, 60.4)` facing south-east toward the tee: `Hole 2 · Par 3 · 13 tiles · Pond right`.
- Bench at `(21.5, 63.4)` facing north-east. Ball washer at `(20.5, 60.5)`.
- Ideal shot: driver at power 0.72 (carry 8.6, total 13.4). A full driver (total 19.9) runs through the green onto the cart path and the hole 3 rough, still inside `parkBounds`; only a shot that leaves y `50..64` or x `2..48` is `out`.

## Hole 3

Block `[2,3]`, origin `(34, 50)`, tiles x `34..47`, y `50..63`. Direction of play: +z (south). Tee to cup 10.05 tiles. Par 3.

- Tee tile `(40, 51)`, tee point `(40.5, 51.5)`. Tee box `TEE` rectangle x `39..41`, y `50..52` (9 tiles, against the north road).
- Cup tile `(41, 61)`, cup center `(41.5, 61.5)`.
- Green ellipse center `(40.5, 60.5)`, radii `2.6 x 2.1`. Tiles: y 58 x 40; y 59 x 38..42; y 60 x 38..42; y 61 x 38..42; y 62 x 40 (17 tiles). The cup is 1.0 east and 1.0 south of the center; a putt past it stays on rough inside the block (y 63 is rough, the road is y 64).
- Fairway corridor: one rectangle x `38..42`, y `53..58` (30 tiles, one shared with the green).
- Bunker West: ellipse center `(37.0, 60.5)`, radii `1.3 x 1.3`. Tiles: y 59 x 36..37; y 60 x 36..37; y 61 x 36..37 (6 tiles).
- Bunker East: ellipse center `(44.0, 60.5)`, radii `1.3 x 1.3`. Tiles: y 59 x 43..44; y 60 x 43..44; y 61 x 43..44 (6 tiles). Both touch the green fringe, which is intended.
- Water: none.
- Trees (12): west edge `(34,50) (34,53) (34,56) (34,59) (34,62)`; east edge `(47,50) (47,53) (47,56) (47,59) (47,62)`; north edge `(36,50) (45,50)`. No trees on the south edge row y 63 (the green and bunkers reach y 62).
- Flag at the cup center, number `3`.
- Tee markers at `(39.9, 51.5)` and `(41.1, 51.5)`.
- Yardage sign at `(42.6, 50.5)` facing west: `Hole 3 · Par 3 · 10 tiles`.
- Bench at `(37.5, 51.5)` facing south. Ball washer at `(42.6, 51.6)`.
- Ideal shot: driver at power 0.58 or iron at 0.81. A pull or push of 3 tiles at the green finds a bunker.

## Clubhouse block

Block `[3,3]`, origin `(50, 50)`, tiles x `50..63`, y `50..63`.

- Building record: `{ kind: 'clubhouse', name: 'Clubhouse', x: 54, y: 51, w: 6, h: 4, door: { x: 56, y: 54 }, doorPos: { x: 57, y: 55.5 }, doorTile: { x: 56, y: 55 }, doorTile2: { x: 57, y: 55 }, block: (50, 50), wall: '#F3EFE6', roof: '#75CCD0', accent: '#E7706F' }`. Footprint `B` tiles x `54..59`, y `51..54`; door on the south face at tiles `(56,54)` and `(57,54)`. Same silhouette as the cafe (one story, hip roof in aqua, trim white `#F8F6F0`, salmon door with `#F6D463` handles). Sign band on the south face, 2.6 x 0.32 x 0.04 at y 2.0, navy with a canvas `Thread Town golf` in Kanit 600 white; no plaque sprite. The interior is not part of this version (no room in `interiors.js`); walking into the door zone shows no prompt here.
- Porch: one row of plaza paving `Z` at x `54..59`, y `55` (6 tiles). Stub path `P` at x `56..57`, y `56..63` down to the south road, 2 wide like a department stub.
- Porch dressing (world positions, all on the `Z` row or the grass beside it): bag stand at `(54.6, 55.5)`: three iron legs r 0.02 h 0.9 leaning inward from a 0.3 base triangle, a golf bag cylinder r 0.14 h 0.8 in navy tilted 0.2 rad with a salmon band 0.08 tall at y 0.55 and a silver pocket plate, three club shafts r 0.012 h 0.5 rising from the bag top with one navy driver head, one silver blade and one aqua putter head (the same three heads the player's club prop uses). Scorecard board at `(59.4, 55.5)`: two dark wood posts 0.06 x 1.4 x 0.06 at x 59.1 and 59.7 with a navy board 0.9 x 0.6 x 0.04 at y 1.05 carrying a canvas (Kanit title `Course`, Inter rows `1 · Par 3 · 10`, `2 · Par 3 · 13`, `3 · Par 3 · 10`, `Par 9`). Two planters (`RoundedBoxGeometry(0.5, 0.3, 0.5, 2, 0.06)` in dark wood with a `#6FA860` hedge dome r 0.22) at `(55.5, 54.9)` and `(58.5, 54.9)` flanking the door step. A ball washer at `(58.5, 56.4)` and a bench at `(59.5, 56.6)` facing south (toward the road and range). String of three pennant flags (0.18 x 0.12 triangles, salmon, aqua, silver) on a 0.01 line from the sign band's left end to the scorecard post.
- Practice putting green: ellipse center `(53.0, 59.5)`, radii `2.2 x 2.0`, `GR` tiles: y 58 x 51..54; y 59 x 51..54; y 60 x 51..54 (12 tiles). Practice cup at tile `(53, 59)`, center `(53.5, 59.5)`, with a short pin (pole 1.2 tall, plain aqua flag, no number). It is dressing in this version: `lieAt` reports `green` there and the player can walk on it, but no tee prompt is attached. Listed in `state.golf.clubhouse.practiceGreen = { center: {x: 53.0, y: 59.5}, rx: 2.2, ry: 2.0, cup: {x: 53.5, y: 59.5} }` so a later version can add a putting mode.
- Benches: `(55.6, 59.5)` facing west toward the practice green; `(50.6, 56.5)` facing east; plus the porch bench above (three in the block).
- Lamps: `(55.5, 56.5)` and `(58.5, 56.5)` on the grass beside the stub, bulb only (no `PointLight`; the budget stays at 13 real lights).
- Trees (block edges only, 2 tiles from the practice green and the porch): `(50,50) (53,50) (56,50) (59,50) (62,50) (63,53) (63,57) (63,61) (50,53) (50,62) (53,63) (60,63)`. No tree north of the building footprint row (y 50 at x 53..60 is already two rows away, so these are fine; the sim's existing "nothing against a building's north wall" rule skips y 50 if it applies to the clubhouse record).

## Driving range

Block `[4,3]`, origin `(66, 50)`, tiles x `66..79`, y `50..63`.

- Tee line: `TEE` tiles x `68..77`, y `62` (10 tiles), per the contract (`by + 12`, `bx + 2 .. bx + 11`). `state.golf.range.teeLine = [{x: 68.5, y: 62.5}, ..., {x: 77.5, y: 62.5}]` (tile centers). `state.golf.range.bounds = { x0: 66, y0: 50, x1: 80, y1: 64 }`.
- Tee mats: ten, one per tee tile, each a box 0.8 x 0.02 x 0.6 in `#3F8A55` centered at `(x + 0.5, 0.01, 62.5)` with a white rubber tee dot (cylinder r 0.03 h 0.03 in `#F8F6F0`) at the mat center and a small ball basket (cylinder r 0.16 h 0.22 in iron, with 6 white spheres r 0.05 on top) 0.5 south-east of each mat. `E  Hit some balls` is offered when the player is within 1.6 of any tee line point; the nearest mat becomes the shot spot and the player stands 0.45 to its east (facing north, `aimYaw = pi` by default; the aim follows the look yaw as usual).
- Range fairway: `FW` rectangle x `68..77`, y `50..61` (120 tiles), mowed stripes alternating per tile as everywhere. Columns x 66, 67, 78, 79 and the row y 63 stay rough `G`, which keeps the edge trees 2 tiles from the fairway.
- Distance markers: boards 0.8 x 0.4 x 0.04 in navy on a dark wood post 0.06 x 1.0 x 0.06, white Kanit numeral, placed on the fairway center line x `73.0`: `5` at `(73.0, 57.5)` and `9` at `(73.0, 53.5)`. The third marker at 13 tiles would land at y 49.5, which is the north road, so the `13` is a 1.6 x 0.6 banner on the net's top rail at `(73.0, 6.1, 50.15)` and reads as "the net is 13". The shot message reports the measured carry anyway. Flat painted rings are not used (the ground texture is painted once).
- Net: posts cylinder r 0.06 h 6.2 in iron at x `66.5, 70.8, 75.2, 79.5`, z `50.15`; a top rail cylinder r 0.03 from x 66.5 to 79.5 at y 6.1; the net itself a `PlaneGeometry(13, 5.6)` centered `(73.0, 3.3, 50.15)`, `MeshBasicMaterial` with a 256 x 256 canvas grid (1.5 px lines `#2E3E50` alpha 0.55 on transparent, `RepeatWrapping`, repeat 26 x 11), `transparent true`, `DoubleSide`, `depthWrite false`, `fog true`. Ball interaction: in range mode `stepBall` is given `course = range` and a ball that crosses `z <= 50.3` while `pos.y < 6.0` has its velocity set to `(0, min(vel.y, 0), 0.4)` and drops to the ground (it hits the net and falls at its foot); the controller message is `Into the net. Carry <n> tiles.`. A ball above the net or beyond `range.bounds` returns `out`, which in range mode is `Over the net. Carry <n> tiles.` with no penalty.
- Benches at `(67.0, 63.4)` and `(79.0, 63.4)` facing north; a ball washer at `(66.6, 62.5)`; a small shelter at `(78.6, 63.3)`: four iron posts r 0.03 h 2.2 on a 1.2 x 0.9 footprint with an aqua and white striped awning plane (the cafe awning canvas) at y 2.2 tilted 0.2 rad.
- Trees (edges only, 2 tiles from fairway and tee): west edge `(66,50) (66,53) (66,56) (66,59)`; east edge `(79,50) (79,53) (79,56) (79,59)`. 8 trees. The north edge row y 50 is fairway from x 68 to 77, and x 67 and 78 at y 50 would be adjacent to it, so that edge stays bare and the net reads as the boundary. The south row y 63 is adjacent to the tee line and stays bare as well.

## Props

All props are `MeshStandardMaterial`, roughness 0.9, metalness 0 (lamp iron and the club heads 0.2), `castShadow true`, `receiveShadow true` except flags and the net (neither). Canvases use `Kanit 600` for numerals and titles, `Inter 500` for small text, `colorSpace SRGBColorSpace`, mipmaps and anisotropy as the art direction requires.

- Flag (one per hole, plus the practice pin): pole `CylinderGeometry(0.025, 0.03, 2.2, 10)` centered y 1.1 at the cup center in trim white `#F8F6F0`, base disc r 0.07 h 0.02 in iron, finial sphere r 0.04 in `#F6D463`. Cloth: `PlaneGeometry(0.55, 0.36, 6, 1)` hinged at the pole, spanning y 1.84 to 2.2, `DoubleSide`, salmon `#E7706F`, with a 128 x 84 canvas showing the hole number in Kanit 600 white 64 px right-aligned (the canvas is the map, salmon painted as the background). Wave: vertex x offsets `0.03 sin(4 u - 3 t)` on the far column only, and the cloth yaw eases toward the sun-side so it never clips the pole; one `update` for all flags, no allocation. The pole hides (`visible false`) while the ball is rolling on that hole's green within 2.5 of the cup and shows again at rest, so the pin never blocks a putt visually.
- Cup: dark disc `CircleGeometry(0.18, 24)` at y 0.012 in `#1E2A33`, a rim ring `RingGeometry(0.18, 0.22, 24)` at y 0.014 in `#F8F6F0`, and a shallow open cylinder `CylinderGeometry(0.18, 0.18, 0.08, 24, 1, true)` from y -0.07 to 0.01 in `#1E2A33` (`side BackSide`), so the ball disappears into a real hole on capture. Capture radius stays the contract's `0.22`.
- Tee markers: two per hole, each a sphere r 0.09 (16 x 12) in aqua `#75CCD0` on a dark wood peg r 0.02 h 0.1; centers at y 0.19. The practice and range tees have none.
- Yardage signs: dark wood post 0.06 x 0.95 x 0.06 at y 0.475, navy board 0.95 x 0.5 x 0.04 centered y 1.0, a salmon strip 0.95 x 0.04 along the board's bottom edge, canvas 512 x 270 with the title `Hole N` in Kanit 600 84 px white and a second line `Par 3 · 10 tiles` in Inter 500 56 px silver `#E2E9EE`, both centered. The board faces the tee point.
- Ball washer: iron post r 0.04 h 0.8 at y 0.4, salmon body cylinder r 0.12 h 0.28 centered y 0.9, silver cap r 0.13 h 0.03 at y 1.055, a tiny iron crank r 0.012 bent 0.1, and a towel `PlaneGeometry(0.16, 0.26)` in `#F8F6F0` hanging from a hook at y 0.78 on the south side.
- Benches: the art direction bench (two slats 1.0 x 0.06 x 0.17 at y 0.42 in wood, back slat 1.0 x 0.30 x 0.05 at y 0.62 tilted 0.15 rad, two iron legs 0.06 x 0.42 x 0.34 at x offsets +-0.42). The facing yaw is given with each bench above. These are decoration only: not in `state.seats`, so agents do not path onto the course for them.
- Fences along the cart paths: post-and-rail, visual only (collision stays tile based). Posts 0.07 x 0.6 x 0.07 in wood every 2.0 units, two rails 0.05 x 0.05 at y 0.26 and 0.5 in wood between posts. Four runs on the grass edge beside the paths: x `15.8` and x `18.2` (cart path 16,17), x `31.8` and x `34.2` (cart path 32,33), each from z 50.2 to 63.8 with two gaps so the auto-walk between holes crosses through an opening: a 3.0 unit gap centered at z 52.0 (hole 2 cup to hole 3 tee crosses the x 31.8 and 34.2 runs at z 53.1 and 52.6) and a 4.0 unit gap centered at z 60.5 (hole 1 cup to hole 2 tee crosses the x 15.8 and 18.2 runs at z 59.4 and 61.4). Merge each run into one geometry (4 draw calls). No fence along the x 48,49 road, so the walk to the clubhouse is open.
- Club prop (built by the renderer, attached to `handL`): shaft `CylinderGeometry(0.012, 0.014, L, 8)` in silver, grip 0.11 long in navy at the hand end; driver L 1.05 with a navy head `RoundedBoxGeometry(0.11, 0.075, 0.07, 2, 0.02)`, iron L 0.9 with a silver blade box 0.09 x 0.07 x 0.015 angled 0.45 rad, putter L 0.78 with a flat aqua head 0.1 x 0.03 x 0.035. Local -y along the shaft from the hand; the head sits at the far end, offset 0.02 toward +z.
- Ball: sphere r 0.11 (16 x 12), `#FFFFFF`, roughness 0.5; trail of 12 pooled spheres r 0.05 at alpha fading 0.5 to 0 over 0.45 s, emitted every 0.03 s while airborne faster than 4 u/s.
- Aim line: `Line` with `LineDashedMaterial` (aqua, `dashSize 0.3`, `gapSize 0.2`, `transparent`, opacity 0.85, `depthTest false`, `renderOrder 9`), 24 points from the ball along the aim yaw at y 0.03, length = carry estimate (see Swing and HUD), with a landing ring `RingGeometry(0.14, 0.2, 24)` at the end. Hidden during `swinging`, `flight`, `walking`, `holed` and `done`.

## Physics tuning

The contract constants were run through a flat fairway simulation (`g = 20`, 240 Hz, the bounce and roll rules as written). Two problems showed up, so three groups of constants are adjusted; everything else is confirmed.

1. Rollout is far too long with horizontal retention `0.8` and fairway deceleration `5.0`. A full driver (speed 22, elevation 0.32) carries 14.4 tiles, which is inside the required 11 to 15, but then bounces three times and rolls to a total of 32.9 tiles, more than two blocks. Even a 0.5 power drive travels 14.5 in total. Nothing shorter than full power would stay on a 14 by 14 hole, and the par-3 feel (tee shot to the green, two putts) is impossible.
2. The putter cannot pass the contract's own tests. With `maxSpeed 9`, green deceleration `3.0` and capture speed `3.2`, the 3 unit putt at power 0.5 reaches the cup at 3.69 u/s and lips out; the 1 unit putt at power 0.3 arrives at 3.50 u/s and lips out too.

Adjusted constants (world units, 1 tile = 1 unit):

```
g = 20                                                  (confirmed)
CLUBS.driver = { maxSpeed: 20.5, elevation: 0.36, spread: 0.06 }   (was 22, 0.32)
CLUBS.iron   = { maxSpeed: 14.5, elevation: 0.58, spread: 0.04 }   (was 15, 0.55)
CLUBS.putter = { maxSpeed: 7.5,  elevation: 0,    spread: 0.02 }   (was 9)
speed = maxSpeed * (0.25 + 0.75 * power) * lieMod        (confirmed; lieMod sand 0.5, rough 0.85, tee and fairway 1.0, green 1.0, path 1.0)
yaw error uniform in +- spread * (0.4 + power)           (confirmed)
bounce vertical restitution: fairway and rough 0.42, green 0.30, sand 0.10, path 0.5   (was 0.45 on fairway and rough; path added)
bounce horizontal retention: 0.62                       (was 0.8)
switch to rolling when the bounce's vertical speed < 1.2 (confirmed)
rolling deceleration: green 3.0, fairway 6.5, rough 9.5, sand 16, path 5.0   (was 5.0, 8.0, 4.0 for fairway, rough, path)
rest when speed < 0.15                                   (confirmed)
cup capture: within 0.22 and speed < 3.2 holed; faster lips out with deflection 0.6   (confirmed)
```

Resulting numbers on a flat fairway (carry is the first landing, total includes bounces and roll):

| Shot | Launch speed | Carry | Total | Air plus roll time |
|---|---|---|---|---|
| Driver 1.00 | 20.5 | 13.8 | 19.9 | 1.8 s |
| Driver 0.85 | 18.2 | 10.9 | 16.9 | 1.9 s |
| Driver 0.70 | 15.9 | 8.3 | 13.0 | 1.6 s |
| Driver 0.50 | 12.8 | 5.4 | 8.4 | 1.3 s |
| Iron 1.00 | 14.5 | 9.6 | 13.3 | 1.7 s |
| Iron 0.80 | 12.3 | 7.0 | 9.9 | 1.5 s |
| Iron 0.50 | 9.1 | 3.8 | 5.4 | 1.1 s |
| Putter 1.00 on green | 7.5 | roll 9.4 | | |
| Putter 0.50 on green | 4.7 | roll 3.7 | | |
| Putter 0.30 on green | 3.6 | roll 2.1 | | |

- Full driver carry 13.8 sits inside the required 11 to 15 and the ball rests 1.8 s after the strike, so the verification test passes with margin on both ends; a lower `hret` is the main lever that turns the 33 tile total into 20.
- Hole 2 (13.45 tiles) plays as a par 3: driver at power 0.72 lands at 8.6 on the fairway neck and rolls onto the green near the cup, then two putts. Holes 1 and 3 (10.0 tiles) want driver 0.58 or iron 0.80. The auto-select rule (driver when the cup is farther than 9) picks the driver on all three tees; the iron is the override for players who prefer a fuller swing with less roll.
- A full driver still overshoots every hole (total 19.9), which is what gives the ping-pong meter its point: the sweet spot for a tee shot is around 0.6 to 0.75, reached about 0.65 to 0.85 s into the charge.
- A full driver that lands on a green bounces once (restitution 0.3) and rolls about 11 tiles at deceleration 3.0, so it runs through; that is intended and reads as realistic.
- Putting: `maxSpeed 7.5` makes a full putt 9.4 tiles, longer than any green, so lag putts live between 0.35 and 0.6 power (2.5 to 5 tiles). The 3 unit putt at power 0.5 arrives at the cup at 1.99 u/s (holed), and the 1 unit putt at power 0.3 at 2.59 u/s (holed), both inside the capture speed of 3.2. A putt that misses by more than 0.22 rolls past by about the same distance it would have travelled, and a downhill feel is not modeled (the course is flat). Putter spread at power 0.5 is +-0.018 rad, 0.05 lateral over 3 tiles, so aim decides and luck does not.
- From sand (`lieMod 0.5`) a full iron carries 2.4 and rolls to about 3.3; from rough (`0.85`) a full driver carries 10.0 and totals about 15, enough to reach any green but with less control, which is the intended penalty.
- Water: a ball whose rest or bounce position is on a `WA` tile returns `water` at the contact point. The drop is at `lastRest` (the tee point on a tee shot) with one penalty stroke. `lastRest` updates only on `rest`, never on bounces.
- The green test for `lieAt` uses the exact ellipse (`greenRx, greenRy`) and falls back to the `GR` tile when outside the ellipse but on a `GR` tile (fringe), so a ball on the cup side of the green always reads `green`.
- Clamp every integration: `dt` at most 0.05 per step, speeds never above 30, positions clamped to the map, and any NaN resets the ball to `lastRest` resting.

## Swing and HUD

Phases follow the contract: `aim`, `charging`, `swinging`, `flight`, `walking`, `holed`, `done`.

- Address. The character stands at `ball + 0.45 * (dz, -dx)` where `d = (sin aimYaw, cos aimYaw)` is the aim direction, and faces `charYaw = aimYaw - pi / 2` (a right-handed stance: the target is on the character's left, the ball in front of the feet). The club head rests 0.02 behind the ball. Pose `golfIdle` while aiming; the character re-aims continuously while the look yaw changes (the stance point and yaw are recomputed from `aimYaw` every frame, eased at 12 rad/s).
- Charge meter. Holding Space sets `phase 'charging'` and `power = 1 - abs(((t - t0) / 1.1) mod 2 - 1)`: it rises 0 to 1 over 1.1 s, falls back to 0 over the next 1.1 s and repeats (period 2.2 s). The bar in `#golf-power` is 260 x 14 px, track `rgba(0, 45, 79, 0.55)` with a 1 px silver border, the fill is aqua and turns salmon above 0.9 to warn that the top is near; a thin white tick marks 0.7 (the aim preview) and a faint band marks 0.6 to 0.75 (the tee-shot sweet spot) only while the driver is selected. The meter also shows at low opacity (0.5) in `aim` with the fill at `aimPower = 0.7` so the preview and the bar agree. Release sets `phase 'swinging'`, `swingT 0`.
- Swing. `swingT` runs 0 to 1 over 0.35 s; `handle.golfPhase = swingT`. The strike happens at `swingT = 0.62` (impact), not at the end: `strike(ball, { club, power, yaw: aimYaw, lie })`, `strokes += 1`, a 0.04 s white flash sphere r 0.16 at the ball, then the swing finishes its follow-through while the ball is already flying and `phase` becomes `flight` at `swingT = 1`. The ball mesh stays at rest until impact.
- Aim line length. Carry estimate `est(p) = (maxSpeed * (0.25 + 0.75 p) * lieMod)^2 * sin(2 elev) / g` for driver and iron, plus a flat 30 percent rollout on fairway (`est * 1.3`), 15 percent on rough; for the putter `est(p) = speed^2 / (2 * decel(lie))`. In `aim` the line uses `p = aimPower = 0.7`; in `charging` it follows the live `power`. The line is capped at 18 units and stops at the park boundary.
- Camera during flight. `player.followBall = ball`; the ideal camera is `ball.pos - h * 3.5 cos(0.35) + up * 3.5 sin(0.35)` where `h` is the horizontal unit velocity (fallback: the aim direction when the horizontal speed is below 0.5), springing with `1 - exp(-6 dt)`; look target `ball.pos + (0, 0.2, 0)`. In first person the view also hands over to this ball camera at the strike (the body is already hidden); in chase view the character stays in the frame for the first 0.3 s because the spring starts from the chase pose. On `rest` the ball camera holds for 0.4 s (`phase 'flight'` stays until the hold ends), then `phase 'walking'` and the renderer blends back to the player's view over 0.35 s. On `holed` the camera holds on the cup for the whole 2.5 s. On `water` and `out` it blends back immediately.
- Walking phase. The player eases from its current position to `ball.pos - 0.6 * h0` (where `h0` is the unit vector from the previous position to the ball) at 5.2 u/s, pose `walk`, clamped inside `parkBounds`, ignoring tiles; the club stays in the hand. Arrival within 0.05 sets `phase 'aim'` and runs club auto-select (`putter` on green, `driver` when the cup is farther than 9, else `iron`; keys 1 2 3 override until the next strike). Keys and the mouse still turn the look during the walk.
- Pose `golfIdle`: the address stance for every rig. Pose `golf`: driven by `golfPhase` 0..1, 0 to 0.5 backswing, 0.5 to 1 downswing and follow-through, with impact at 0.62. Rotations are radians in the rig's local frame where +z is the face and the target is on the character's left (-x local for the stance above; mirror all x and z signs if the rig's handedness differs). `hold` means both hands close on the grip: `handR` is parented to `handL`'s world position by the renderer each frame while in golf (same mechanism as the balance pole, two hands on one prop).

Aliens (`js/aliens3d.js`, torso with armL, armR, head, antennae; legs in the rig):

| golfPhase | torso yaw (y) | torso lean (x, forward) | armL x / z | armR x / z | head yaw | notes |
|---|---|---|---|---|---|---|
| golfIdle | 0 | 0.25 | 0.9 / -0.15 | 0.9 / 0.15 | 0 (looks at the ball, pitch -0.35) | arms hang forward to the club, feet 0.3 apart |
| 0.00 | 0 | 0.25 | 0.9 / -0.15 | 0.9 / 0.15 | 0 | address |
| 0.25 | 0.55 | 0.22 | 1.6 / 0.9 | 1.7 / 0.6 | 0.1 | halfway back, club shaft horizontal |
| 0.50 | 0.95 | 0.20 | 2.4 / 1.4 | 2.5 / 1.1 | 0.15 | top of the backswing, club over the right shoulder, antennae lean 0.3 back |
| 0.62 | -0.1 | 0.28 | 0.9 / -0.1 | 0.9 / 0.1 | 0 | impact, arms through the address position, hips 0.1 open |
| 0.80 | -0.9 | 0.15 | -0.3 / -1.3 | -0.2 / -1.5 | -0.6 | follow-through, club wraps left and up |
| 1.00 | -1.1 | 0.05 | -0.4 / -1.5 | -0.3 / -1.7 | -0.8 | finish, chest to the target, hold 0.2 s then ease to golfIdle over 0.3 s |

Easing: linear between keyframes on `golfPhase` but with a quartic speed-up from 0.5 to 0.62 (the downswing is faster than the backswing; because `swingT` is linear in time, bend the lookup with `k = 0.5 + 0.5 * ((golfPhase - 0.5) / 0.5)^0.6` for the second half so the 0.5 to 0.62 segment covers 0.07 s). The body `yoff` dips 0.02 at 0.5 and rises 0.03 at 1.0. Antennae swing with the torso at 0.4 of its yaw, delayed one frame.

Bipeds (`js/animals3d.js`, `build 'biped'`: bear, panda, monkey, kangaroo, rabbit, frog, fox and the others that stand): the alien table applied to `armL`, `armR` (plus their `rz0` rest offsets), `torso.rotation.y` and `headGroup.rotation.y`, with the same keyframes. Add: legs `legL.rotation.x 0.1`, `legR.rotation.x -0.1` at address (weight centered), `legR.rotation.x 0.25` at the top and `legL.rotation.x -0.3` at the finish (weight shifts). Kangaroo and rabbit keep their `restArmX`; hoppers do not hop in golf. Tails (`tailRock`, `tailWag`) counter-rotate at -0.5 of the torso yaw.

Quadrupeds (`build 'quadruped'`: lion, tiger, elephant, giraffe, zebra, hippo, wolf, deer, koala, otter, seal, tortoise, crocodile): they rear onto the hind legs for the swing. `golfIdle`: the rig pitches the torso up by `-1.05` rad about x (chest toward +z, head above the hips), `legL`/`legR` straighten to 0 with the hips as the pivot so the hind paws stay on the ground, `armL`/`armR` (the front legs) reach forward and down to the club at `rotation.x 1.1` with the paws together at `z` offsets `-0.1 / 0.1`; the head pitches down 0.4 to watch the ball. The swing uses the alien arm and torso yaw table scaled 0.8 for the front legs (quadruped shoulders are narrower) and the full head values; the tail swings -0.6 of the torso yaw. Elephant trunk and giraffe neck: trunk hangs with a 0.2 sway, the giraffe head stays at 0.5 of the head values so the neck does not whip. Tortoise and crocodile use 0.6 of the torso pitch (they stand low) and the club prop scales 0.8. Seal: flippers as arms, same table; its body pitch is 0.8.

Birds (`build 'bird'`: penguin, flamingo, owl, falcon): the wings are the arms, so the club attaches to `handL` at the wing tip and the wings fold forward around the grip (`armL.rotation.z 0.9`, `armR.rotation.z -0.9` at address, both `rotation.x 0.7`). The swing applies the alien table to the wings with `x` scaled 0.7 and `z` scaled 1.2 (wings sweep wider), the torso yaw table in full, and a 0.08 hop (`yoff`) at impact for the penguin and owl. The flamingo keeps one leg up (`legR.rotation.x 1.5`) through the whole swing and sways 0.15 at the finish; the falcon and owl fan their tails 0.3 at the top. The beak tracks the ball (head pitch -0.5 at address, -0.2 at impact, then follows the torso yaw).

- Messages (`#golf-msg`, center banner, Kanit 600 26 px white on navy at 0.92, 2.5 s unless stated): `Splash. Penalty stroke.`, `Out of bounds. Penalty stroke.`, `Into the net. Carry <n> tiles.`, `Over the net. Carry <n> tiles.`, `Carry <n> tiles.` (range, after every rest), `Lip out.` (0.9 s, when the cup deflects the ball), `Hole <n>: <strokes> (par 3). <term>`, `Round: <total> (par 9). <round term>` with `E  Play again` and `X  Leave` shown under it while `done`.
- Golf terms by strokes on a par 3: 1 `Hole in one`, 2 `Birdie`, 3 `Par`, 4 `Bogey`, 5 `Double bogey`, 6 `Triple bogey`, 7 or more `<n> over`. Round terms: total 9 `Even par`, below `<9 - total> under par`, above `<total - 9> over par`.
- Prompts: `E  Tee off, hole <n> (par 3)` within 1.6 of a tee point; `E  Hit some balls` within 1.6 of any range tee line point. In golf the legend reads `Golf: hold Space to swing, 1 2 3 clubs, X leave`; `X` leaves at any time (ball removed, club dropped, `state 'idle'`, HUD hidden).

## Scorecard

`#golf-hud` is a top right card (navy at 0.9, silver text, Kanit for the first line, Inter for the rest, 12 px padding, radius 10 px, min width 220 px):

```
Hole 2 · Par 3 · Stroke 1          <- line 1, Kanit 600 15 px white; range mode shows "Driving range · Shot 4"
Driver                              <- line 2, Inter 500 12 px silver; the key hint "1 2 3" to the right at 60 percent
Hole    1   2   3   Total           <- scorecard header, Inter 600 11 px, letter-spacing 0.04 em
Par     3   3   3   9
You     3   ·   ·   3               <- "·" for holes not played; the current hole's column gets an aqua underline
```

- `golf.card = [null, null, null]` at the start of a round; `card[n - 1] = strokes` on `holed` (penalty strokes included). Total is the sum of the filled cells. A cell shows its stroke count colored by term: 1 or 2 salmon `#E7706F`, 3 white, 4 silver, 5 or more `#B9C4CC`.
- The card persists through the `done` state and is reset by `E  Play again` (which also returns the player to hole 1's tee at 5.2 u/s with the walk phase). Leaving with `X` keeps `player.lastCard` for the session so the HUD can show `Last round: 11 (par 9)` under the tee prompt next time the player approaches hole 1; this is the only remembered state and it is not written to storage.
- Range mode shows no scorecard rows; instead line 3 reads `Best carry: <n> tiles` and line 4 `Balls hit: <k>`.
- Hidden unless walk mode is on and `player.state === 'golf'`.
