# Thread Town city plan

The design behind `js/cityplan.js` for `docs/CONTRACT_V7.md`. The contract wins where this file disagrees; where the contract leaves a number open, this file closes it. All distances are tiles (1 tile = 1 world unit), x grows east, y grows south, and a tile's center is `(x + 0.5, y + 0.5)`.

The map is 128 by 96. `validatePlan(PLAN)` passes with zero issues on the geometry checks; the reachability check runs when `TT.state` is passed as the second argument after the sim rasterizes the plan.

## The idea

A small river town that reads like an open-world hub: one spine (Thread Avenue), one diagonal that breaks the grid (Commerce Boulevard), a river that splits the map into a busy north-east and a quieter south-west, and a golf course stretched along the south bank so the water is always in view from the course. The player spawns on the plaza by the fountain, with the cafe one block north, downtown across the avenue, the park across the river by the west bridge, and the clubhouse straight down the avenue over the big bridge.

The river enters at the north-west edge (y about 18), runs east for twenty tiles, then dives south-east in a long diagonal reach to about (40, 50), turns east along y 60 under downtown, and bends south again at x 110 to leave through the south-east corner. Three bridges cross it: West Street (two lanes, into the north shore), Thread Avenue (three lane deck, the main crossing, aimed straight at the clubhouse) and East Street (two lanes, from the industrial side down to Links Road).

## Districts

**Downtown** (north-east of the river, x 61..103, y 0..50, plus Marketing across East Street). The grid is tight: Harbor Street along the top, Ledger Street through the middle, River Street along the bank, Mint Street and East Street north to south. Five department lots sit on the two blocks either side of Mint Street: Technology and Executive face south onto Ledger Street; Accounting turns to face Thread Avenue; Compliance faces north onto Ledger Street; Credit faces south onto River Street. The south-east block carries the fillers: a twelve story glass tower on River Street, a narrow shop and office on East Street, and the downtown parking lot on the River Street corner. Marketing sits just across East Street facing back at downtown, so both of the "near downtown" lots (Marketing and Financial Crimes, see riverside) are one street away from the core. Tree density is low (0.05) so the towers read against the sky.

**Riverside** (x 26..61 between the diagonal reach and Thread Avenue, plus the north bank strip under downtown). The plaza is a 13 by 16 paved square (208 tiles, more than today's 196) between Commerce Boulevard and the avenue, with the fountain basin at tiles 53..55 by 34..36, four benches facing it, two scooter racks, and the subway entrance on its south edge (footprint 54..55 by 41..42, enter row 43). The spawn is at (52, 31) by the north-west bench. North of the plaza across Cafe Lane sit the Cafe (12 by 12 lot, building against the north side, terrace to the south-east as today) and the Financial Crimes lot, with three small shops on Harbor Street behind them. South of the plaza, between the subway and River Street, is the subway parking lot. East of the avenue the bank strip between River Street and the water (rows 53..56) is the boardwalk: planks along y 55 from x 67 to 97 with four benches facing the river. Commerce Boulevard runs the length of the district at a 25 degree slant, from the plaza's south-west corner up to Harbor Street, and is the only non-orthogonal road on the map; it follows the diagonal reach of the river with a one tile grass verge, which is where the rowboats and shoreline rocks go.

**Residential** (south-west, x 0..30 below the river's west reach, plus the north shore pocket x 0..24 north of it). West Street is the district's spine and carries the west bridge. The north shore pocket has two apartment blocks on Harbor Street. South of the river: the People lot and a rowhouse row face Orchard Street; two rowhouse rows face it from the south; the school faces Meadow Lane (a width 2 lane without sidewalks); the church sits across West Street with its steeple toward the river. Below Meadow Lane the zoo (dept:risk, 14 by 14) takes the block down to Links Road with a diner beside it; the park with the pond is across West Street. The south blocks hold rowhouses on Links Road, apartments either side of Elm Lane (the second lane) down to South Lane (the third), and a last apartment and deli below South Lane. Tree density 0.25.

**Park** (x 25..41, y 52..66). The pond lot is 14 by 13 with the pond ellipse (radii 4.8 by 3.6, as today) in the middle and the pier on the shore tile south of the pond center column at (33, 62), facing north. Two benches on the lot's edges face the pond and a scooter rack stands at the park gate on Links Road. Tree density 0.4, the leafiest district. The pond lot is the one lot that keeps trees: they grow on its grass outside the shore ring, the pier walk down to Links Road, the bench rings and their walks to the shore, and the lamp tiles. The sim publishes the pond as `state.pond` (center, radii and tiles) so the pond dressing is sized from the pond alone.

**Industrial** (east, x 103..127, y 0..60). Foundry Street splits it. North of Foundry: Operations faces south onto Foundry Street, with a sawtooth warehouse beside it and the industrial parking lot on Harbor Street. South of Foundry: Data and Embedded Banking side by side facing River Street. Below River Street on the bank: the gas station and a barrel roof warehouse facing north. Tree density 0.04.

**Links** (south bank, x 30..114, y 70..94). Links Road runs the whole south bank from the residential district to the east bridge and is the course's north edge; the clubhouse lot sits on it directly opposite the avenue bridge so the avenue ends on the clubhouse door. The course is an out and back loop around the clubhouse (see Golf). Tree density 0.12, mostly along the road and the river bank.

## Street names

| Name | Kind | Width | Sidewalks | Runs |
|---|---|---|---|---|
| Thread Avenue | avenue, median | 4 | yes | (64, 0) to (64, 53), then the avenue bridge to Links Road |
| Commerce Boulevard | street, diagonal | 3 | yes | (45, 46) to (25, 4) |
| Harbor Street | street | 2 | yes | the whole north edge, y 4 |
| Ledger Street | street | 2 | yes | downtown, y 22, avenue to East Street |
| River Street | street | 2 | yes | north bank, y 52, x 46 to the east edge |
| Mint Street | street | 2 | yes | downtown, x 82 |
| East Street | street | 2 | yes | x 102, Harbor Street to the east bridge |
| Foundry Street | street | 2 | yes | industrial, y 35, East Street to the east edge |
| Cafe Lane | street | 2 | yes | y 26, the boulevard to the avenue |
| West Street | street | 2 | yes | x 24, in two parts joined by the west bridge |
| Orchard Street | street | 2 | yes | y 36, west edge to the river |
| Links Road | street | 2 | yes | y 68, the whole south bank |
| Meadow Lane | lane | 2 | no | y 50, residential |
| Elm Lane | lane | 2 | no | x 11, Links Road to South Lane |
| South Lane | lane | 2 | no | y 84, residential |

Bridges: West Street bridge, deck tiles (24, 18) to (24, 27), width 2. Thread Avenue bridge, (64, 56) to (64, 66), width 3 (the median ends at the ramp). East Street bridge, (102, 59) to (102, 66), width 2. Each deck starts on the last road or sidewalk tile of one bank and ends on the first of the other.

## Map (1 character per 2 tiles)

Each character is the most significant feature in a 2 by 2 tile cell. Rows are labeled with the tile y of their top row, columns with tile x every ten tiles.

```
    0    1    2    3    4    5    6    7    8    9    0    1    2
  0 ..............................-##-..............................
  2 ################################################################
  4 ################################################################
  6 .aaaa.aaaa.###-....ssss.ssssss-##-TTTTTT##EEEEEEE.##MMMMMMMppppp
  8 .aaaa.aaaa.####....ssss.ssssss-##-TTTTTT##EEEEEEE.##MMMMMMMppppp
 10 .aaaa.aaaa.####-...ssss.ssssss-##-TTTTTT##EEEEEEE.##MMMMMMMppppp
 12 .aaaa.aaaa.#####..cccccccFFFFF-##-TTTTTT##EEEEEEE.##MMMMMMM.....
 14 ~~.........##-##-.cccccccFFFFF-##-TTTTTT##EEEEEEE.##MMMMMMM.....
 16 ~~~~~~~~~~.##.###.cccccccFFFFF-##-TTTTTT##EEEEEEE.##MMMMMMM.....
 18 ~~~~~~~~~~~~=.-##-cccccccFFFFF-##-TTTTTT##EEEEEEE.##............
 20 ~~~~~~~~~~~~~~.###cccccccFFFFF-#####################OOOOOOOwwwww
 22 .PPPPPP~~~~~~~~-##-ccccccFFFFF-#####################OOOOOOOwwwww
 24 .PPPPPP....~~~~~#################-FFFFFF##CCCCCCss##OOOOOOOwwwww
 26 .PPPPPP....=~~~~~################-FFFFFF##CCCCCCss##OOOOOOOwwwww
 28 .PPPPPPrrrr##~~~~~##....ZZZZZZ-##-FFFFFF##CCCCCCss##OOOOOOOwwwww
 30 .PPPPPPrrrr##.~~~~##-...ZZZZZZ-##-FFFFFF##CCCCCCoo##OOOOOOOwwwww
 32 .PPPPPPrrrr##.~~~~###...ZZZZZZ-##-FFFFFF##CCCCCCoo##---------w--
 34 ###############~~~~##-..ZZZOZZ-##-FFFFFF##CCCCCCoo##############
 36 ###############~~~~###..ZZZZZZ-##-CCCCCC##CCCCCCoo##------------
 38 .rrrrrrrrrr##...~~~~##-.ZZZZZZ-##-CCCCCC##ttttttoo##DDDDDDEEEEEE
 40 .rrrrrrrrrr##ccc~~~~###.ZZZZZZ-##-CCCCCC##tttttt..##DDDDDDEEEEEE
 42 .ssssssss..##cccc~~~~##-ZZZZZZ-##-CCCCCC##ttttttpp##DDDDDDEEEEEE
 44 .ssssssss..##cccc~~~~##-.ppppp-##-CCCCCC##ttttttpp##DDDDDDEEEEEE
 46 .ssssssss..##cccc~~~~-#-.ppppp-##-CCCCCC##ttttttpp##DDDDDDEEEEEE
 48 ##################~~~~...ppppp-##-CCCCCC##ttttttpp##DDDDDDEEEEEE
 50 ##################~~~~~#########################################
 52 .RRRRRRR...##oooooo~~~~~~#######################################
 54 .RRRRRRR...##ooooooo~~~~~~~...-##-.b...b....b...b.##ggggg.wwwwww
 56 .RRRRRRR...##ooooooo.~~~~~~~~~~~=~~~~~~~~~~~......##ggggg.wwwwww
 58 .RRRRRRR...##ooooooob..~~~~~~~~~=~~~~~~~~~~~~~~~~~~=ggggg.wwwwww
 60 .RRRRRRRddd##ooooooo....~~~~~~~~=~~~~~~~~~~~~~~~~~~~~~....wwwwww
 62 .RRRRRRRddd##oooPooo..........~~=~~~~~~~~~~~~~~~~~~~~~~...wwwwww
 64 .RRRRRRRddd##ooooooo...........==...............~~~~~~~~~.......
 66 ###############################==#################==~~~~~~......
 68 ####################################################.~~~~~~.....
 70 .rrrr#rrrrr##..rrrrrrppppp:::hhhhhhhh::::::::::::::::::~~~~.....
 72 .rrrr#rrrrr##..rrrrrrppppp:gghhhhhhhh:::::::sttfff::::::~~~~....
 74 .....#.....##..rrrrrrppppp:gghhhhhhhhttfffggg::::fff:::s~~~~~...
 76 .aaaa#aaaa.##..rrrrrr::::sfgghhHHHHhh:::::ggg:::::www::s:~~~~...
 78 .aaaa#aaaa.##..rrrrrr::::fs::hhHHHHhh::::ssgg::::wwwwggg:.~~~~..
 80 .aaaa#aaaa.##..::::::ssff::::hhHHHHhh:::::::::::::ww:ggg:.~~~~..
 82 #############..::::::ff:::::::::::::::::::::::::::::ssgg:..~~~~.
 84 #######s#####..::::fff:::::ss::wwww::::::::::::::::::::::..~~~~.
 86 .aaaa.sss..##..::ff:::s::::ssggwwww:::::::::s::::::::::tt..~~~~.
 88 .aaaa.sss..##..:t:s:ggs:::::gggfffff::::::ggs:::s:::::f::...~~~~
 90 .aaaa.sss..##..:::s:gggffffttggs::::fffttgggff:::::ffff::...~~~~
 92 ...........##..:::::ggg::::tt:ss:::::::ttggg:fffffff:::::...~~~~
 94 ...........--................................................~~~
```

Legend: `~` water, `=` bridge deck, `#` road, `-` sidewalk, `Z` plaza, `O` fountain basin (plaza) or Operations (industrial), `b` bench, `P` People (top left) or the pier (in the pond lot), `o` pond lot (park) or office (downtown), `c` cafe (riverside) or church (residential), `h` clubhouse lot, `H` clubhouse building, `t` tee box or the downtown tower, `g` green (links) or gas station (industrial), `f` fairway line, `s` bunker (links) or shop or school, `w` hole water hazard or warehouse, `:` golf ground, `r` range (left of the clubhouse) or rowhouse, `a` apartment, `p` parking, `d` diner, `k` scooter rack (hidden at this scale), digits mark cups. Department lots: `T` Technology, `E` Executive (downtown) or Embedded Banking (industrial), `F` Accounting (finance) or Financial Crimes (riverside, north of the plaza), `C` Credit (south block) or Compliance (north block), `M` Marketing, `D` Data, `R` Risk (the zoo).

The full resolution map (1 character per tile) prints from the check script with `--full`; the sim's own dump should match it tile for tile for water, roads, sidewalks and bridges.

## Lots

World rectangle `(x, y) w by h` as painted on the map, then the rotation. The canonical sizes in the file (`w`, `h`) are the unrotated ones, so rot 90 and 270 lots show swapped sides here. Department lot sizes follow the contract: `w = max(footprint.w, 10) + 2`, `h = footprint.h + 7`.

| id | kind | world rect | rot | faces |
|---|---|---|---|---|
| dept-tech | dept:tech | (67, 7) 13 by 13 | 0 | south, Ledger Street |
| dept-exec | dept:exec | (84, 6) 14 by 14 | 0 | south, Ledger Street |
| dept-finance | dept:finance | (67, 24) 13 by 12 | 270 | west, Thread Avenue |
| dept-credit | dept:credit | (67, 37) 12 by 13 | 0 | south, River Street |
| dept-compliance | dept:compliance | (84, 24) 12 by 13 | 180 | north, Ledger Street |
| dt-tower | tower, glass | (84, 38) 12 by 12 | 0 | south, River Street |
| dt-shop-1 | shop, coffee | (96, 24) 4 by 6 | 90 | east, East Street |
| dt-office | office, stone | (96, 31) 4 by 8 | 90 | east, East Street |
| dt-parking | parking | (96, 42) 4 by 8 | 0 | south, River Street |
| dept-fcc | dept:fcc | (49, 11) 12 by 13 | 0 | south, Cafe Lane |
| dept-marketing | dept:marketing | (104, 6) 13 by 12 | 270 | west, East Street |
| in-parking | parking | (118, 6) 10 by 6 | 180 | north, Harbor Street |
| dept-ops | dept:ops | (104, 20) 13 by 13 | 0 | south, Foundry Street |
| in-ware-1 | warehouse, sawtooth | (118, 21) 10 by 12 | 0 | south, Foundry Street |
| dept-data | dept:data | (104, 37) 12 by 13 | 0 | south, River Street |
| dept-embedded | dept:embedded | (116, 37) 12 by 13 | 0 | south, River Street |
| in-gas | gas | (104, 54) 10 by 6 | 180 | north, River Street |
| in-ware-2 | warehouse, barrel | (117, 54) 10 by 10 | 180 | north, River Street |
| cafe | cafe | (37, 12) 12 by 12 | 0 | south, Cafe Lane |
| rs-shop-1 | shop, books | (39, 6) 6 by 5 | 180 | north, Harbor Street |
| rs-shop-2 | shop, flowers | (49, 6) 6 by 5 | 180 | north, Harbor Street |
| rs-shop-3 | shop, records | (55, 6) 6 by 5 | 180 | north, Harbor Street |
| rs-parking | parking (subway) | (50, 44) 10 by 6 | 0 | south, River Street |
| ap-nw-1 | apartment, cream | (2, 6) 8 by 8 | 180 | north, Harbor Street |
| ap-nw-2 | apartment, salmon | (12, 6) 8 by 8 | 180 | north, Harbor Street |
| dept-people | dept:people | (2, 22) 12 by 12 | 0 | south, Orchard Street |
| rh-1 | rowhouse, brick | (14, 28) 8 by 6 | 0 | south, Orchard Street |
| rh-2 | rowhouse, brick | (2, 38) 10 by 4 | 180 | north, Orchard Street |
| rh-3 | rowhouse, stone | (12, 38) 10 by 4 | 180 | north, Orchard Street |
| school | school | (2, 42) 16 by 7 | 0 | south, Meadow Lane |
| church | church | (26, 40) 7 by 8 | 270 | west, West Street |
| dept-risk | dept:risk (zoo) | (2, 52) 14 by 14 | 0 | south, Links Road |
| rs-diner | diner | (16, 60) 6 by 6 | 0 | south, Links Road |
| pond | pond | (26, 53) 14 by 13 | 0 | south, Links Road |
| rh-4 | rowhouse, brick | (2, 70) 8 by 4 | 180 | north, Links Road |
| rh-5 | rowhouse, cream | (12, 70) 10 by 4 | 180 | north, Links Road |
| ap-s-1 | apartment, aqua | (2, 75) 8 by 8 | 0 | south, South Lane |
| ap-s-2 | apartment, cream | (12, 75) 8 by 8 | 0 | south, South Lane |
| ap-s-3 | apartment, brick | (2, 85) 8 by 8 | 180 | north, South Lane |
| shop-s | shop, deli | (12, 85) 6 by 6 | 180 | north, South Lane |
| clubhouse | clubhouse | (59, 70) 14 by 12 | 180 | north, Links Road |
| links-parking | parking (clubhouse) | (42, 70) 10 by 6 | 180 | north, Links Road |

42 lots: downtown 10 (Marketing counted with downtown), riverside 6, industrial 7, residential 16, park 1, links 2. Twelve department lots, one per id in `js/data.js`. Rotations used: 0 on 20 lots, 90 on 2, 180 on 17, 270 on 3. The twelve departments face south (9), north (1) and west (2): Accounting and Marketing face west, Compliance faces north, the rest face south. If the integrator wants more variety, Credit can turn to 90 (east onto Mint Street) without moving.

Filler lot shapes are deliberately varied: 4 tile deep rowhouse rows (two floors with stoops against a sidewalk), narrow 4 wide shop and office slivers on East Street (a thin downtown infill), a 16 by 7 school. The `style` strings are hints for `city.js` recipes (facade color or roof type), `seed` fixes the random details per lot.

## Plaza, cafe, pond, subway

- Plaza polygon x 48..61 by y 28..44 (edges), 13 by 16 tiles = 208 paved tiles. Fountain center tile (54, 35); basin tiles 53..55 by 34..36. Benches at (50, 31), (59, 31), (50, 40), (59, 40) facing the fountain. Scooter racks at (49, 29) and (60, 43). Lamps at the four corners as today.
- Subway: `tile (55, 42)`, footprint 54..55 by 41..42, enter row y 43 (both columns, plaza paving), stairs descending south, `rot 0`. This keeps the V6 formula `plaza.x + 7, bottom row - 1` with the plaza's west edge at 48.
- Spawn (52, 31), on paving, two tiles from the north-west bench.
- Cafe lot 12 by 12 at (37, 12), canonical: building 6 by 4 at local (1, 1), door tiles local (3, 4) and (4, 4), stub down local x 3 to the south edge, terrace paving local x 7..11 by y 5..10 with two tables at local (8.5, 6.5) and (8.5, 9.5) plus two at (10.5, 6.5) and (10.5, 9.5), seats west and east of each as today. The terrace faces the plaza across Cafe Lane.
- Pond lot 14 by 13 at (26, 53): ellipse center local (7, 6.5), radii 4.8 by 3.6 (today's pond). Pier tile (33, 62), `rot 0` (board runs north over the water, ladder on the east side). The shore tiles of the pond are the only shore and swim tiles on the map; the river is for looks and bridges.
- Clubhouse lot 14 by 12 at (59, 70), rot 180: the 6 by 4 building at world (63, 77) with the door on its north face at y 76, the porch row at y 76, the stub two wide north to Links Road's sidewalk at y 69, and the practice green in the yard's east half. `golf.clubhouse = { x: 63, y: 77, w: 6, h: 4, rot: 180 }` is the same building in world tiles.

## Golf

The area polygon is the south bank band x 30..114, y 70..94 with two notches on Links Road for the clubhouse parking (42..52 by 70..76) and the clubhouse lot (59..73 by 70..82). Both lots touch the course but do not overlap it. The range is the west end of the band, `(30, 70) 12 by 11, rot 0`: a ten tee line along its south edge hitting north toward a net on Links Road. The river intrudes into the band's north-east corner (x 110..114, y 70..73), which is intentional: hole 2 plays toward that bend.

Holes, straight line tee to cup, with the route (the fairway corridor follows `line`, width 5, greens radius 2.5):

| n | name | par | tee | cup | length | route |
|---|---|---|---|---|---|---|
| 1 | Opener | 3 | (75, 74) | (87, 76) | 12.2 | east from beside the clubhouse, bunkers short right and long left |
| 2 | Riverbend | 4 | (91, 72) | (109, 80) | 19.7 | east then a dogleg right around the river bend; pond on the inside of the turn at (99..107, 76..81) |
| 3 | The Long Turn | 5 | (111, 86) | (85, 91) | 26.5 | south along the river, then a long turn west along the south edge |
| 4 | Millpond | 4 | (79, 91) | (59, 89) | 20.1 | west along the bottom, a pond north of the landing zone at (62..70, 84..88) |
| 5 | Short Grass | 3 | (55, 91) | (42, 91) | 13.0 | straight west, two bunkers |
| 6 | Homeward | 5 | (32, 88) | (56, 75) | 27.3 | from the south-west corner north-east in three legs back to the clubhouse, green beside the clubhouse yard |

Par 24 for the round. Length limits from the contract: par 3 9..14, par 4 16..24, par 5 26..36. Two water hazards (holes 2 and 4). Twelve bunkers. The round walks a loop: the clubhouse door to hole 1's tee is about 10 tiles, hole 6's green touches the clubhouse lot's west edge, and every tee is within 7 tiles of the previous cup except hole 6's, which is 10.4 tiles from hole 5's cup (the walk past the fifth green to the corner tee).

## Scooter racks and benches

Ten racks, one or two per district: plaza (49, 29) and (60, 43); Cafe Lane sidewalk (47, 24); Thread Avenue at Ledger Street (66, 20); East Street at River Street (100, 48); Foundry Street (103, 33); West Street at Orchard Street (22, 34); the park gate on Links Road (25, 66); the clubhouse at the avenue bridge (66, 69); West Street at South Lane (22, 82). All stand on sidewalk or plaza tiles.

Extra benches (`seatsExtra`, all `kind 'bench'`): four on the plaza facing the fountain, four on the boardwalk at y 54 (x 70, 78, 88, 96) facing the river, two at the park (25, 58) and (40, 58) facing the pond. The cafe's eight stools and the pond lot's own benches come from the sim's lot recipes as today.

## Reachability

Every lot's door edge opens onto a road or sidewalk (the validator checks the two central tiles outside the edge). On foot from the spawn: the plaza opens onto Cafe Lane, Commerce Boulevard, Thread Avenue and River Street; downtown and the industrial district are across the avenue sidewalks; the residential district is reached over the west bridge (Harbor Street then West Street) and over the avenue bridge then Links Road; the links are entered from Links Road, which is reachable over the avenue bridge, the east bridge, or from West Street at the park. No route needs to cross water except on a bridge deck. Course tiles are enterable for the visitor, so every tee is reachable from Links Road across the rough.

## Reasoning and trade-offs

- **Why the river shape.** A plain diagonal would leave two triangles; the S shape gives four distinct banks: a short north shore for a quiet pocket, a long diagonal reach for the boulevard and the park, a straight east reach that downtown and the links share, and a final bend that the par 5 third hole wraps around.
- **Why the avenue ends at the clubhouse.** A four lane avenue slicing through the course would read wrong and would put road tiles inside the holes. Ending it on the clubhouse door gives the avenue a terminal view (the clubhouse across the bridge) and keeps the course in one piece.
- **Why Financial Crimes is riverside.** Downtown holds five department lots and the brief asks for office, tower and shop fillers too; the south-east block was the only place for them once Executive (14 by 14) and Technology (13 by 13) took the north blocks. Financial Crimes on Cafe Lane is still one street from the avenue and faces the plaza's back, and Marketing sits across East Street, so both "near downtown" lots are a short walk from Ledger Street.
- **Why Commerce Boulevard is where it is.** Running the diagonal through downtown would have cut every department block. Along the riverside it mirrors the river's diagonal reach, gives the plaza a canted west edge, and lands on Harbor Street at the north shore.
- **Lot rotation.** Three lots face west, one north and the rest south. The river bank and the lanes dictated most of this: lots on Harbor Street and Links Road's north side face north by necessity, and the two west facing department lots (Accounting, Marketing) are the ones that front the avenue and East Street.
- **Sizes that follow today's sim.** The cafe building, terrace and seats, the pond ellipse, the pier geometry, the 3 by 3 fountain basin, the subway footprint and enter row, and the clubhouse building are the same sizes as `js/sim.js` builds today so the modules keep working after the rasterizer swaps block math for lot rectangles.

## Validation

`validatePlan(PLAN)` checks: map size; lots inside the map; lot pairs not overlapping; lots off water, roads, plaza and the golf area (sidewalks count as road for everything but filler lots); each lot's door edge touching a road or sidewalk; one `dept:<id>` per department (from `TT.DEPARTMENTS` when present, else the embedded footprint table) with the canonical size; the cafe, clubhouse, pond, subway, plaza, fountain, spawn and pier present; the plaza at least 196 tiles; the fountain basin and the subway footprint and enter row inside the plaza with the subway on its south edge; the spawn on paving and clear of the basin and the subway; golf holes numbered 1..6 with pars 3, 4, 5, 4, 3, 5, tees, cups, lines and bunkers inside the area, greens off roads, water and lots, lengths within the par ranges, the clubhouse building inside the clubhouse lot, the range on plain course ground; bridges straight, 2 or 3 wide, crossing water with road or sidewalk beyond both ends; at least six racks (ten here) on sidewalk, plaza or grass and off lots; benches off water, roads, lots and the basin; road widths and kinds; district densities. With `TT.state` as the second argument it also runs the visitor BFS from the spawn to every department workTile and doorTile, the cafe seats, the pier tile, the clubhouse door, every tee, the subway enter row and every rack.

The check script used during design copies `js/cityplan.js` to an `.mjs`, runs `node --check`, imports it, prints the validation, the map and the counts.
