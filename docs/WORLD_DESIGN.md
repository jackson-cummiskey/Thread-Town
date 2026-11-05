# Thread Town world design (plan v3)

The geography behind `js/cityplan.js` for `docs/CONTRACT_V10.md` ("The plan v3", "Terrain v2", "Thread National"). The contract wins where this file disagrees; where the contract leaves a number open, this file closes it. This file is the geographic truth for the terrain, roads, nature, city and golf modules: landforms, roads, lots, holes.

All distances are tiles (1 tile = 1 world unit = 10 yards on the hole signs). x grows east, y grows south, a tile's center is `(x + 0.5, y + 0.5)`. The map is `192` by `144`. `validatePlan(PLAN, rasterizePlan(PLAN))` returns zero issues, including the BFS from the spawn under visitor rules.

## The idea

A river town on real ground. A river enters the north edge east of center, cuts a gorge between the downtown bluff and the north bank terrace, widens past the plaza, then runs south through the links to leave by the south edge. West of the river the land climbs to a hill with a ridge at +9 in the north-west, reached by a switchback road with three hairpins. East of the river the downtown sits on a bluff at +5 above the water, with a retaining wall and stairs down to a riverside walk. South-west, below the hill, a lake at -1.6 fills a basin with a shoreline path, a small marina and an island. The links (Thread National) take the whole south band on both banks of the river and the lake shore. The industrial flats sit east of the river at 0. The plaza district is the center of the map on the river's west bank at 0: plaza, fountain, cafe, subway, the park pond with its pier, and a boardwalk on the river bank.

The visitor spawns on the plaza by the fountain. The cafe is one block north, downtown is over the high bridge to the north-east, the hill is west up Orchard Street, the lake and the clubhouse are south down Thread Avenue, the industrial flats are over the low bridge to the east.

## Landforms (districts with `landform`)

Every district in `PLAN.districts` carries `landform: { kind, center or polygon, radius, height, ... }` for terrain v2. Heights are world units above the plaza (0). The district order matters for `TT.sim.districtAt` (the first polygon containing a tile wins); the landforms are independent and the terrain reads them by kind.

| District id | Name | Landform kind | Center and extent | Target height |
|---|---|---|---|---|
| `residential` | The hill | `hill` | center `(33, 27)`, radius `36`, ridge line `(18, 34)` to `(33, 27)` to `(46, 16)`; polygon x 0..62, y 0..96 | `+9` at the ridge, falling to about `+1` at the avenue and `0` at Links Road |
| `northbank` | The north bank terrace | `hill` | center `(84, 10)`, radius `40`; polygon `(62,0) (104,0) (114,20) (108,36) (104,40) (62,40)` | `+3` at the north edge, `+2.5` at the high bridge's west end, blending to `0` at Bluff Road |
| `downtown` | The bluff | `bluff` | plateau polygon `(130,0) (192,0) (192,56) (126,56) (120,48) (118,40) (118,32) (123,22) (127,10)`; the wall runs along the river side `(127,10) (123,22) (118,32) (118,40) (120,48) (126,56)` | `+5` flat plateau, a near vertical retaining wall down to the riverside walk at about `-0.5` |
| `valley` | The river valley | `valley` | the ribbon of half width 11 about `RIVER_CENTER` (`line`), banks `4..8` tiles wide | river bed `-1.4`; banks slope from the bed to the surround; rock outcrops where the slope exceeds 35 degrees (the gorge x 106..124, y 18..50 is the steepest reach) |
| `riverside` | Riverside | `flats` | center `(77, 66)`, radius `24`; polygon `(62,40) (104,40) (100,58) (88,74) (86,96) (62,96)` | `0` (the plaza, the subway and the fountain are exactly 0) |
| `park` | The park | `flats` | center `(49, 81)`, radius `14`; polygon x 36..63, y 70..92 | `+0.4` lawn, the pond lot plateau at `0` |
| `industrial` | The flats | `flats` | center `(150, 80)`, radius `50`; polygon `(100,58) (126,56) (192,56) (192,102) (98,102) (96,96) (88,74)` | `0` with the bluff's south slope coming down to it between y 56 and 62 |
| `lake` | The lake | `lake` | the `LAKE` polygon, x 11..57.5, y 104..132 | water `-1.6`, banks `3..6` tiles |
| `links` | Thread National | `links` | the golf area polygon (the whole south band, both banks, the lake included) | rolling `-0.5` to `+2.5`, designed per hole below |

Fixed points for the terrain check: hill top `(33, 27)` at `+9` (within `0.5`), the bluff `(150, 30)` at `+5`, the river bed `(96, 70)` at `-1.4`, the lake `(30, 118)` at `-1.6`, the plaza `(77, 65)` at `0`, the island `(45, 118)` at `+0.6`.

## Water

- **The river**: centerline `RIVER_CENTER = (128,-6) (125,6) (121,18) (116,30) (111,40) (106,50) (100,60) (95,70) (91,80) (89,90) (90,100) (92,112) (94,126) (95,138) (96,150)`, half width `4` (`ribbon`). The gorge reach (y 18..50) runs between the bluff wall and the north bank terrace; the plaza reach (y 56..80) has the plaza boardwalk on the west bank and the riverside walk on the east bank; the links reach (y 90..144) divides the two halves of the course.
- **The lake**: `LAKE` polygon, a blob 46 wide and 28 tall centered near `(34, 118)`. The island for hole 6 is the ellipse `ISLAND` centered `(45.5, 118.5)`, radii `4.6` by `4.2`, surrounded by at least 8 tiles of water on the tee side and 5 on the shore side.
- **The pond**: the park pond lot (`pond`, 14 by 13 at center `(49, 81.5)`), the ellipse 4.8 by 3.6 placed by the pier at `(49, 84)` facing north, exactly as before. Swimming and diving stay in the pond; the lake and the river are for looks, bridges, the marina and the island hole.

## Roads (splines)

`PLAN.roads[]` are Catmull-Rom splines through `pts` (two points give a straight line). Widths follow the kind: avenue 4 with a median, boulevard 3, street 2 with sidewalks, lane 2, path 1, switchback 2, cartpath 1. The rasterizer samples each curve every 0.2 tiles and stamps width / 2 as road and one more tile as sidewalk where `sidewalks` is true; width 1 kinds stamp the tile under each sample and stay 4-connected.

| Road id | Name | Kind | Runs | Purpose |
|---|---|---|---|---|
| `thread-avenue` | Thread Avenue | avenue | `(62,0)` curving to `(66,30)`, straight past the plaza at x 66, to Links Road at `(68,92)` | the north to south spine on the west bank: the hill foot, Financial Crimes, the cafe, the plaza, River Street, the clubhouse |
| `bluff-road` | Bluff Road | street | `(68,40) (84,40) (96,39) (104,38)` | from the avenue east to the high bridge; the cafe, Financial Crimes, Marketing and the riverside shops front it |
| `river-street` | River Street | street | `(68,77)` to `(86,77)` | the plaza south edge to the low bridge; the subway parking and the diner |
| `orchard-street` | Orchard Street | street | `(63,61) (48,61) (36,64) (28,67) (26,68) (2,68)` | the hill south flank: People, the zoo, the church, the foot of the switchback |
| `ridge-road` | Ridge Road | switchback | `(46,62)` up the south-east face with hairpins at `(22,47)`, `(52,36)` and `(20.5,26)` to the ridge top `(38,22)` | the hill road; the residential lots step up its legs |
| `harbor-lane` | Harbor Lane | lane | `(63,14) (50,12) (36,10) (20,10) (6,12)` | the hill north foot from the avenue to the west edge |
| `west-lane` | West Lane | lane | `(6,12) (4,30) (4,50) (6,68)` | the hill west foot, Harbor Lane to Orchard Street |
| `meadow-lane` | Meadow Lane | lane | `(6,68) (8,84) (14,95)` | Orchard Street down to Links Road past the school |
| `links-road` | Links Road | street | `(2,96) (20,95) (40,94) (60,93) (68,93) (78,92) (82,92)` | the links north edge from the west edge to the river bank: the school, the park gate, the range, the clubhouse |
| `ledger-street` | Ledger Street | street | `(120,38)` to `(191,38)` | downtown main street on the bluff from the high bridge east; five departments front it |
| `harbor-street` | Harbor Street | street | `(130,12)` to `(191,12)` | the bluff north street: apartments, shops, the downtown parking |
| `mint-street` | Mint Street | street | `(152,2) (154,12) (154,38) (155,52)` | downtown cross street between the two department blocks |
| `east-street` | East Street | street | `(182,2) (182,12) (182,36) (180,50) (176,62) (172,77)` | the bluff east street, descending the bluff's south slope to Foundry Street |
| `foundry-street` | Foundry Street | street | `(99,77)` to `(191,77)` | the industrial flats from the low bridge east; Operations, Data and Embedded Banking front it |
| `mill-road` | Mill Road | street | `(104,78) (106,88) (104,96) (103,99)` | the east bank south from Foundry Street to the links east gate |
| `riverside-walk` | Riverside walk | path | `(119.5,44.5) (117.5,50.5) (111.5,58.5) (106.5,66.5) (102.5,72.5) (100.5,76.5)` | the east bank walk under the bluff wall, from the stairs to the low bridge |
| `bluff-stairs` | Bluff stairs | path | `(120.5,40.5)` to `(120.5,44.5)` | the stairs from Ledger Street down the retaining wall (drop 5) to the riverside walk |
| `park-path` | Park path | path | `(62.5,76.5) (56.5,73.5) (41,73.5) (40.5,80.5) (41.5,90.5)` | from the avenue through the park around the pond lot to Links Road |
| `lakeshore-path` | Lakeshore path | path | the `LAKE` polygon offset 1.6 tiles outward, closed | the shoreline walk around the lake past the marina, hole 6's tee and the island bridge |
| `cart-link` | Clubhouse cart link | cartpath | `(79.5,107.5) (81.5,103.5) (83.5,100.5)` | from the clubhouse to the links footbridge and the east bank loop |
| `west-cart` | West cart path | cartpath | a loop from the clubhouse past tees 5, 6, 7, 8 and 9 around the lake and back; it passes tee 6's box on the south side | the cart loop for holes 5 to 9 (no path or cart path tile touches a tee box, so every box stays level) |
| `island-path` | Island spur | cartpath | `(44.5,135.5)` to `(44.5,131.5)` | the spur from the cart loop to the island footbridge |
| `east-cart` | East cart path | cartpath | a loop from the footbridge past tees 1, 2, 3 and 4 and back; it passes tee 2's box on the south side | the cart loop for holes 1 to 4 on the east bank |

Grades: the terrain flattens roads along their splines with the longitudinal grade capped at 12 percent (14 at the switchback hairpins). Ridge Road climbs about 9 units over about 120 tiles of road (7.5 percent average, steeper on the legs, flat through the hairpins). East Street drops 5 units from the bluff to Foundry Street over about 45 tiles (11 percent). Thread Avenue descends about 3 units from the north edge to Bluff Road over 40 tiles.

## Bridges

| Bridge id | Name | Span | Width | Kind | Notes |
|---|---|---|---|---|---|
| `bluff-bridge` | Bluff bridge | `(105,38)` to `(119,38)` | 3 | high | Bluff Road to Ledger Street over the gorge; the deck rises from the north bank terrace (+2.5) to the bluff (+5), piers in the gorge |
| `river-bridge` | River Street bridge | `(86,77)` to `(98,77)` | 2 | low | River Street to Foundry Street, a low deck just above the plaza reach (both banks at 0) |
| `links-footbridge` | Links footbridge | `(84,100)` to `(96,100)` | 2 | foot | a wooden deck for the cart path and walkers between the two halves of the course |
| `island-bridge` | Island footbridge | `(44,123)` to `(44,130)` | 1 | foot, `island: true` | the wooden spur from the south shore to the hole 6 island |

Each deck ramps between the heights of the two road ends. The terrain pins only the approach rows (the dry bank) to that ramp; the rows over water stay at the bed, so the water continues under every deck and the piers stand in it. The terrain's heightAt and slopeAt read the deck over the span, which is where walkers, the cart and the scooters stand.

## The plaza district (center)

- Plaza: the octagon `(71,56) (83,56) (86,59) (86,71) (83,74) (71,74) (68,71) (68,59)`, 293 paved tiles (the fountain basin and the subway footprint inside it), at 0. The avenue's east sidewalk touches its west edge.
- Fountain `(77, 65)`; four benches around it at `(73,62) (82,62) (73,69) (82,69)`.
- Subway `(80, 72)` on the plaza's south edge (footprint 79..80 by 71..72, enter row 73).
- Spawn `(73, 60)` by the north-west bench.
- Boardwalk `plaza-bank`: a vertical stretch at x 88 from y 58 to 73 on the river's west bank (`axis: 'y'`), two benches at `(89,60)` and `(89,70)` facing the water.
- Racks at `(72,58)` and `(84,72)`.

## Lots (48)

Lots are given by center `cx, cy`, canonical size `w, h` and `rot` (any angle in degrees; the door is on the canonical south face, turned clockwise as seen from above the way `rotVec` turns it: 90 east, 180 north, 270 west). `x, y` are the north-west tile of the bounding box for readers of the old shape. Departments use `deptLotSize(DEPT_FOOTPRINTS[id])`.

### Downtown on the bluff (+5)

| Lot | Kind | Center, rot | Faces | Why here |
|---|---|---|---|---|
| `dept-exec` | Executive 14 by 14 | `(131, 29)`, 0 | south onto Ledger Street | the bluff's west end over the gorge, the first building seen from the high bridge |
| `dept-tech` | Technology 13 by 13 | `(145.5, 29.5)`, 0 | south onto Ledger Street | beside Executive on the main downtown block |
| `dept-compliance` | Compliance 12 by 13 | `(162, 29.5)`, 0 | south onto Ledger Street | across Mint Street, the second block |
| `dept-finance` | Accounting 12 by 13 | `(174, 29.5)`, 0 | south onto Ledger Street | the east end by East Street |
| `dept-credit` | Credit 12 by 13 | `(131, 46.5)`, 180 | north onto Ledger Street | the south side of Ledger above the gorge, behind it the bluff's south slope |
| `dt-tower-1` | tower, glass 12 by 12 | `(144, 46)`, 180 | Ledger Street | the downtown skyline over the river |
| `dt-office-1`, `dt-office-2` | offices 10 by 10 | `(162, 45)`, `(174, 45)`, 180 | Ledger Street | fill the south side of the second block |
| `dt-shop-1`, `dt-shop-2` | shops (coffee, barber) 6 by 6 | `(140, 17)`, `(147, 17)`, 180 | Harbor Street | the north block corners |
| `dt-parking` | parking 10 by 6 | `(170, 17)`, 180 | Harbor Street | downtown parking |
| `dt-tower-2` | tower, stone 8 by 8 | `(188, 29)`, 270 | west onto East Street | the east end tower at the map edge |
| `dt-ap-1`, `dt-ap-2` | apartments 8 by 8 | `(140, 6)`, `(162, 6)`, 0 | south onto Harbor Street | the north edge |

### Riverside and the north bank terrace (0 to +3)

| Lot | Kind | Center, rot | Faces | Why here |
|---|---|---|---|---|
| `dept-fcc` | Financial Crimes 12 by 13 | `(75.5, 30)`, 270 | west onto Thread Avenue | one block north of the cafe on the terrace, its watchtower looks over the gorge |
| `dept-marketing` | Marketing 12 by 13 | `(90.5, 31)`, 6 | south onto Bluff Road | turned to follow Bluff Road's slant toward the high bridge (the first lot at a non right angle) |
| `cafe` | cafe 12 by 12 | `(76, 50)`, 0 | south, the terrace toward the plaza | between Bluff Road and the plaza, the door 3 tiles from the avenue sidewalk |
| `rs-shop-1`, `rs-shop-2` | shops (books, flowers) 6 by 6 | `(86, 47)`, `(93, 47)`, 180 | Bluff Road | the river bank side of Bluff Road |
| `rs-parking` | parking 10 by 6 | `(73, 82)`, 180 | River Street | the subway parking south of the plaza |
| `rs-diner` | diner 6 by 6 | `(82, 82)`, 180 | River Street | by the low bridge |
| `pond` | the park pond lot 14 by 13 | `(49, 81.5)`, 0 | opens south toward the park path | the park west of the avenue; the pier at `(49, 84)` faces north |

### The hill (north-west, ridge +9)

| Lot | Kind | Center, rot | Faces | Why here |
|---|---|---|---|---|
| `dept-people` | People 12 by 12 | `(54, 53)`, 0 | south onto Orchard Street | the hill foot by the avenue, the swings on the slope above the street |
| `dept-risk` | Risk, the zoo 14 by 14 | `(20, 77)`, 180 | north onto Orchard Street | the flat ground below the hill between Meadow Lane and the church, the high wire against the hillside |
| `church` | church 7 by 8 | `(34, 74)`, 180 | Orchard Street | the steeple against the hill |
| `school` | school 16 by 6 | `(24, 89)`, 0 | south onto Links Road | the playing field runs down to Links Road |
| `hn-1`, `hn-3` | apartments 8 by 8 | `(40, 5)`, `(54, 7)`, 0 | Harbor Lane | the north foot |
| `hn-2` | rowhouse 10 by 5 | `(26, 6)`, 0 | Harbor Lane | the north foot |
| `hw-1` | rowhouse 8 by 5 | `(9.5, 40)`, 270 | West Lane | the west foot |
| `ap-nw-1`, `ap-nw-2` | apartments 8 by 8 | `(57, 22)`, `(58, 32)`, 90 | east onto Thread Avenue | the avenue frontage on the hill's east slope; `ap-nw-2` sits one tile east of `ap-nw-1` so its footprint shares no vertex with Ridge Road's hairpin behind it (the hairpin side gets the retaining wall) |
| `rh-av` | rowhouse 10 by 5 | `(58.5, 42)`, 90 | east onto Thread Avenue | the avenue frontage |
| `hl-1` | rowhouse 10 by 5 | `(34, 57.5)`, 150, below leg 1 of Ridge Road | the road | the first step up the slope |
| `hl-2` | apartment 8 by 6 | `(36.5, 46.5)`, 190, below leg 2 | the road | the second step |
| `hl-3` | rowhouse 10 by 5 | `(35.5, 35.5)`, 173, below leg 3 | the road | the third step |
| `hl-4` | rowhouse 10 by 5 | `(31.5, 26)`, 187, below leg 4 | the road | the fourth step, just under the ridge |
| `hl-5` | rowhouse 8 by 5 | `(30.5, 17.5)`, 7, above leg 4 | the road | the ridge top house with the view north |

The five `hl-*` lots are placed by `lotAlong` 1.7 tiles off Ridge Road's centerline and turned to face it, so each sits on its own terrace with a retaining wall on the uphill side. The rack at `(40, 21)` marks the ridge top.

### The industrial flats (east, 0)

| Lot | Kind | Center, rot | Faces | Why here |
|---|---|---|---|---|
| `dept-ops` | Operations 13 by 13 | `(120.5, 68.5)`, 0 | south onto Foundry Street | the crane at the river end of the flats, by the low bridge |
| `dept-data` | Data 12 by 13 | `(134, 68.5)`, 0 | south onto Foundry Street | the observatory on the open flats with a dark sky |
| `dept-embedded` | Embedded Banking 12 by 13 | `(160, 68.5)`, 0 | south onto Foundry Street | the switchboard between the warehouses and the bluff road |
| `in-ware-1`, `in-ware-4` | warehouses 10 by 12, 8 by 12 | `(147, 69)`, `(183, 69)`, 0 | Foundry Street | the north side of the flats |
| `in-gas` | gas station 10 by 6 | `(118, 82)`, 180 | Foundry Street | the bridge end |
| `in-ware-2`, `in-ware-3` | warehouses 10 by 10, 12 by 10 | `(134, 84)`, `(166, 84)`, 180 | Foundry Street | the south side of the flats, their backs to the links |
| `in-parking` | parking 10 by 6 | `(150, 82)`, 180 | Foundry Street | industrial parking |

### The links

| Lot | Kind | Center, rot | Faces | Why here |
|---|---|---|---|---|
| `clubhouse` | clubhouse 14 by 12 | `(72, 101)`, 180 | north onto Links Road | straight down the avenue from the plaza, on the strip between the river and the lake; the building rect `golf.clubhouse = { x: 69, y: 102, w: 6, h: 4, rot: 180 }`, the practice green west of the stub, the cart link leaving the south-east corner |

The driving range `golf.range = { x: 52, y: 97, w: 10, h: 8, rot: 180 }` sits west of the clubhouse between Links Road and the lake's north shore, hitting south toward the water. The entrance sign stands at `golf.entranceSign = (64, 93)` on Links Road.

## Thread National (nine holes, par 35)

Pars in order: `4 3 5 4 4 3 5 3 4`. The contract's list reads `4 3 5 4 3 4 5 3 4` and also makes hole 6 the par 3 over water; the two cannot both hold, so holes 5 and 6 swap pars here (hole 6 stays the island par 3, the total stays 35 and the three par 3s and two par 5s are kept). Straight line lengths are inside `HOLE_LENGTHS` (par 3: 11..16, par 4: 22..32, par 5: 34..46 tiles). The card total is 2,248 yards.

The round: the cart link leaves the clubhouse's south-east corner over the links footbridge to the east bank loop (holes 1 to 4), returns over the footbridge, and the west loop takes holes 5 to 9 around the lake back to the clubhouse. Every hole has two tee markers, a hole sign (number, par, yards), a numbered flag, yardage plates at 100 and 150 yards on the par 4s and 5s, and a cart path beside it.

| Hole | Name | Par | Tee, elev | Cup | Length | Elevation story | Hazards |
|---|---|---|---|---|---|---|---|
| 1 | Flats | 4 | `(116,104)`, +0.4 | `(142,110)` | 26.7 tiles, 267 yd | a gentle opener east along the foot of the flats; the tee sits 0.4 above a fairway that rolls down to a green at 0 | bunkers `(138,113) r 1.5`, `(145,107) r 1.3` right of the green |
| 2 | Drop | 3 | `(148,114)`, +1.2 | `(160,124)` | 15.6 tiles, 156 yd | an elevated tee 1.2 above a green in a hollow at -0.3 | bunkers `(157,127) r 1.4`, `(163,121) r 1.2` pinch the front |
| 3 | Riverward | 5 | `(162,132)`, +1.5 | `(122,138)` | 40.4 tiles, 404 yd | the downhill par 5 toward the river: from the highest tee on the course the fairway falls 2.5 over forty tiles to a green on the river bank at -0.5 | bunkers `(130,135) r 1.5`, `(144,134) r 1.3`, `(119,135) r 1.2`; the river long and right |
| 4 | The Climb | 4 | `(114,134)`, 0 | `(108,112)` | 22.8 tiles, 228 yd | the uphill par 4 to a plateau green 1.2 above the fairway beside the footbridge; the fairway climbs steadily north | bunkers `(105,115) r 1.4` front left, `(112,110) r 1.2` back right; the river long and left |
| 5 | Bankside | 4 | `(82,110)`, +0.8 | `(70,131)` | 24.2 tiles, 242 yd | back on the west bank behind the clubhouse, a tee 0.8 up on the river bank plays down the strip between the river and the lake, the fairway dropping to a green at -0.2 | bunkers `(74,129) r 1.3`, `(66,127) r 1.2`; the river right, the lake left |
| 6 | The Island | 3 | `(60,119)`, +1.0 | `(45,118)` | 15.0 tiles, 150 yd | the par 3 over water: a tee 1.0 above the lake's east shore, 8 tiles of carry to the island green at +0.6 with a sand collar (`collarR 4.0`); the wooden footbridge from the south shore is the walk out. A ball in the lake returns `water` and drops on the tee side | the lake all round; the sand collar |
| 7 | Shoreline | 5 | `(54,138)`, +0.6 | `(14,140)` | 40.0 tiles, 400 yd | a long run west along the lake's south shore on rolling ground between the water and the map edge; mounds on the lake side kick balls back toward the fairway; the green sits in a bowl at 0 | bunkers `(30,137) r 1.4`, `(18,137) r 1.3` on the lake side |
| 8 | West Wind | 3 | `(5,130)`, +0.5 | `(6,116)` | 14.0 tiles, 140 yd | north along the lake's west shore to a small green at +0.3 between a bunker and the water | bunkers `(3,120) r 1.2`, `(9,119) r 1.2`; the lake right |
| 9 | Homeward | 4 | `(14,102)`, +0.3 | `(40,100)` | 26.1 tiles, 261 yd | the dogleg around the hill foot: the fairway bends right around a knoll below Links Road (+1.5 on the inside of the bend) and climbs to a green at +1 above the lake's north shore, a short cart ride from the clubhouse | bunkers `(35,103) r 1.3` in the bend, `(44,98) r 1.1` behind the green; the lake short and right |

Hole data in `PLAN.golf.holes[]`: `n, name, par, tee { x, y, elev }, cup { x, y }, line, fairwayWidth, greenR, bunkers, water, story`, plus on hole 6 `collarR`, `island { pts, height }` and `bridge: 'island-bridge'`.

## Attractions and furniture

- **Marina**: `marina = { x: 58, y: 115, rot: 90, slips: 4 }` on the lake's east shore beside the lakeshore path; the dock runs west over four water tiles with four slips and rowboats. A bench at `(61,110)` faces the lake, the rack at `(61,113)`.
- **Pier**: `pier = { x: 49, y: 84, rot: 0 }` inside the pond lot, as before (swimming, diving board, ladder).
- **Bluff stairs**: `stairs = [{ id: 'bluff-stairs', from: [120, 40], to: [120, 44], drop: 5 }]` with the path `bluff-stairs`; two benches on the bluff edge at `(121,30)` and `(121,34)` look over the gorge; the rack at `(117,45)` stands at the foot beside the riverside walk (`(122,45)` lies on the wall's slope).
- **Boardwalks**: `plaza-bank` (vertical, x 88, y 58..73) and `lake-north` (x 24..36 at y 101, the lake's north shore below hole 9).
- **Benches** (`seatsExtra`, 12): four on the plaza, two on the plaza boardwalk, two on the bluff edge, three around the lake (the north shore one at `(30,103)` on the grass between the lakeshore path and the water, off hole 9's fairway), one on the ridge top at `(37,20)` facing the valley. No bench stands on a fairway, green, tee or bunker.
- **Scooter racks** (`scooterRacks`, 24, each with a `near` label): plaza (2), cafe, Financial Crimes, Marketing, Executive, Credit and Technology, Compliance and Accounting, downtown north, the bluff stairs (`(117,45)`), Operations and Data, Embedded, industrial south, industrial east, People, the zoo, the ridge top (`(40,21)`), Harbor Lane (`(16,11)`, on the lane's level west reach), the park gate, the clubhouse, the marina, River Street, the links east gate, the first tee. Every rack stands on flat or gentle ground (the terrain levels the rack tile). Every department door, the cafe, the clubhouse, the subway, the pier, the marina, the fountain and the first tee have a rack within 14 tiles.

## Nature by district (for nature.js)

- The hill: forests on the north and west flanks (pines and tall broadleaf above +5, round broadleaf below), rocks along the ridge line, grass tufts in the yards. Tree density 0.22.
- The north bank terrace: clusters of round broadleaf, a thin line of trees along the gorge rim. 0.12.
- The bluff: street trees on Ledger and Harbor Street only, the wall face bare rock. 0.05.
- The valley: cypress and reeds along the banks, boulders on the gorge outcrops, fallen logs below the footbridge. 0.08.
- Riverside: street trees on the avenue, flower beds on the plaza edges, a tree line along the boardwalk. 0.14.
- The park: the leafiest district, round broadleaf around the pond outside the shore ring. 0.4.
- The flats: a few pines along Foundry Street, nothing in the yards. 0.04.
- The lake: reeds around the shore, none on the island beyond the collar. 0.
- The links: clusters of pine and cypress between fairways, forest along the south map edge and the lake's west shore, a tree line along the river banks on both sides. 0.12. The sim keeps `T` tiles for forest cores only so the paths through them stay walkable.

## Rasterization notes

`rasterizePlan(PLAN)` paints in the sim's order and returns the logic grid with `MARK` values (the seven v7 values plus `BUILDING, STUB, PARKING, COURTYARD, FAIRWAY, GREEN, TEE, SAND, PATH, CARTPATH, STATION, DECK, FEATURE`) and records for every lot (rotated corners, footprint tiles, door tiles, the stub as the shortest rasterized line from the door to the nearest street tile, the rotated 4 by 4 station with its center tile as `workTile`), every hole (tee and cup tiles), the racks, the subway, the pier and the marina. `validatePlan(PLAN, rasterizePlan(PLAN))` runs the BFS on that raster; `validatePlan(PLAN, TT.state)` runs it on the sim's grid.
