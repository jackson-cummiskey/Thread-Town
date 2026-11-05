# Thread Town 3D, version 11: minimap, the chase, coins and the shop, hoverboard, boats, one waterway

Adds to `docs/CONTRACT_V10.md` and earlier contracts; where they disagree, this file wins. `docs/WORLD_DESIGN.md` stays the geographic truth and is amended by this version's design doc, `docs/V11_DESIGN.md`. Keep every existing feature working (walk and chase, interiors, stations, cafe, pond dive, subway, golf rounds with the cart, scooters, leaderboard, board mode, hover and click, agents, quality toggle).

## Goals, in Jackson's words

- A mini map in the corner so I can see where I am going.
- Subway runner: when you trip you see someone chasing you; when you actually die they catch you.
- Stuff to buy with the coins: hoverboards to ride and things like that. The hoverboard is driveable around town; I want to drive it off the top of the mountain. Floaty.
- Drive the boats. Connect the pond and the river so we can boat the whole thing.

## Files

```
js/cityplan.js      the creek (pond to lake), the channel (lake to river), boat docks, kicker ramps, creek bridges, the hole reshaped
js/terrain.js       creek and channel carved with banks; docks flat; kickers shaped
js/sim.js           water raster for the creek and channel; creek slow zone; state.docks; boat and hoverboard entities; the pond swim area boats cannot enter
js/vehicles.js      hoverboard model and controller (hover, airtime, boost, drift), boat model and controller (water only, wake), dock helpers
js/player.js        hoverboard state ('hover'), boat state ('boat'), H summon, E board and tie up, coins hooks
js/subway.js        the inspector and the dog (start chase, stumble chase, the catch), near-miss coins and streak, hoverboard power-up, coin and purchase hooks
js/wallet.js        new: coins and purchases persisted (localStorage 'threadtown.wallet.v1'), the shop catalogue, prices, owned items, equipped look
js/minimap.js       new: the corner map canvas (static base layer plus a per-frame overlay)
js/shop.js          new: the shop modal (DOM) used by the kiosk and the runner's start screen
js/render3d.js      integration: minimap and shop wiring, hoverboard and boat rendering, chaser handoff, kiosk prompt, hats and colours on the visitor
js/golf.js, js/city.js   the creek hazard and bridges; docks, kickers, the kiosk model
js/aliens3d.js, js/animals3d.js   poses 'hover' (knees bent, arms out), 'boat' (seated, one hand on the tiller); hats
js/ui.js, index.html, css/style.css   coin counter in the header, minimap slot, shop modal, legend lines
docs/V11_DESIGN.md  written by the design phase: the creek route, the channel, docks, kickers, the chaser, the shop catalogue
```

## The minimap (js/minimap.js)

```js
export function createMinimap(ctx) -> { el, update(view), setVisible(on), destroy() }
```
- A 200 by 200 px canvas (160 on narrow screens) in the bottom-right corner over the 3D view, rounded, navy frame, shown in walk, scooter, hover, boat and golf states; hidden in orbit, board mode, interiors and the subway. `M` toggles it (remembered in localStorage).
- Base layer painted once from the sim raster: water in aqua, roads in silver, paths in sand, the course in two greens, buildings as department-coloured blocks (filler buildings grey), bridges, the plaza. Overlay per frame: the visitor as a white arrow with heading, agents as department-coloured dots (animals for Risk), scooters as small ticks, the current target as a pulsing salmon ring: the prompt target when one is shown, the cup of the hole in play, the ball between shots, the rack a ride is heading to, the dock when boating.
- Rotates with the chase camera so up is the facing direction, with a north tick on the frame; scale 1 px per 0.2 tiles (a 40 tile window), the wheel over the map zooms between 0.1 and 0.5 tiles per px.
- No allocation per frame; the overlay draws at most once per frame and skips when hidden.

## The chase (js/subway.js)

- Two chasers: the **inspector** (a navy uniform, a cap, a grumpy face, the same rig style as the runner) and the **dog** (a small quadruped on a leash, from animals3d's quadruped pose set). They run behind the runner in the runner's lane, visible at the start of every run for the first 1.5 s (bursting out of the station behind), then drop back out of frame.
- **Stumble**: the runner clips a barrier side or a sign post today and slows; now the chasers burst back in for 2.5 s right behind the runner (0.8 units back), the inspector grabbing with both arms, the dog leaping; the runner looks back for 0.4 s; a second stumble within those 2.5 s is a catch.
- **Catch** (any crash): the run stops, the inspector grabs the runner by the collar and hauls, the dog jumps up and barks (a puff and a 'Woof' label), 1.2 s, then the game-over card. The camera swings to a side view for the catch. The card reads 'Caught at <distance>' instead of 'Crashed'.
- The chasers and the catch reuse pooled meshes, allocation free per frame, and fit the current draw budget.

## Coins, the wallet and the shop (js/wallet.js, js/shop.js, js/subway.js)

- Coins collected in the runner persist: `wallet.coins`, written at the end of every run and after every purchase (`threadtown.wallet.v1`). The header shows the coin count next to the leaderboard button with a short pulse when it grows.
- Near misses pay: 2 coins each, and every 5 in a row without a hit raises the run multiplier by 1 (max +3) until the next hit; the 'Close!' flash shows '+2'.
- The shop opens from the **kiosk** at the subway entrance on the plaza (prompt `E  Shop`) and from the runner's start screen (`Shop` button). Catalogue (prices tuned so a decent run of 1,500 m buys a consumable and a hoverboard takes three or four runs):
  - **Hoverboard** 1,200, one-time: unlocks the town hoverboard and the runner power-up (one crash forgiven within 30 s of activation; activates on `H` in the runner).
  - **Coin magnet** 150 (a run), **Jetpack** 250 (a run), **2x multiplier** 200 (a run): consumables used on the next run; the runner already has these power-ups as pickups, so the purchase starts the run with one active.
  - **Colours**: five board colours 100 each; **hats**: cap, beanie, crown, cowboy hat, Thread visor 300 each, worn by the visitor in town and in the runner. Equipped look stored in the wallet; the character picker shows the owned hats.
- `wallet` API: `coins`, `add(n)`, `spend(n) -> boolean`, `owns(id)`, `buy(id) -> boolean`, `equip(slot, id)`, `equipped`, `consume(id) -> boolean`, `catalogue`.

## The hoverboard (js/vehicles.js, js/player.js, js/sim.js)

- Owned once bought. `H` in walk mode summons it under the visitor anywhere outside interiors and the subway (a 0.3 s drop-in with a glow), `H` again hops off; on foot it trails the visitor at 1.5 units like a pet, hovering.
- Hovers 0.4 above the ground or the water surface: rides grass, sand, greens, paving, paths, decks, water (the lake, the river, the pond outside the swim area, the creek). Blocked by buildings, trees, lot edges and the map edge (four point test, radius 0.35, sliding).
- Feel: max 11 units per s on land and water, boost (`Shift`) to 14 for 2 s with a 4 s recharge, acceleration 10, braking 12, drift when steering hard at speed (the board yaws faster than the velocity turns, a lean of up to 0.35 rad). The chase camera uses the scooter's speed scaled spring with distance 4.5 to 6.
- **Airtime, floaty**: the board keeps its velocity when the ground drops away faster than it can follow (a ridge, the bluff edge, a cliff, a kicker); gravity 0.4 of the walker's, a slight lift of 1.5 per s while boosting in the air, a long glide; landing within 2 units of drop is soft (a dip of the board), a drop over 2 bounces once; no damage ever. Pose 'hover' while riding; the visitor crouches in the air and the arms go out.
- Kickers: three ramps in the plan (`kickers: [{ x, y, rot }]`): the bluff edge above the river, the ridge lip on the hill, the lake shore by the marina; small wooden ramps the board launches off (the scooter and the cart treat them as a low obstacle).
- Agents never ride it. Hover pause and the minimap treat the rider like a scooter rider.

## Boats (js/vehicles.js, js/player.js, js/sim.js, js/city.js)

- `state.docks = [{ id, x, y, yaw, boat: boatId | null }]` from `plan.docks`: the marina slips (three), the pier's east side, the pond's new landing at the creek mouth, a riverside landing under the bluff stairs. `state.boats`: four boats at start (two rowboats, two launches) in docks.
- Near a docked boat: prompt `E  Take the boat`. On E: `state 'boat'`, the visitor sits (pose 'boat'), the boat follows W S A D: max 6 units per s (launch) or 4 (rowboat), reverse 2, acceleration 3, turning 1.1 rad per s at speed falling to 0.5 at crawl, momentum and a wake (two trailing ripples and a stern wash, allocation free). Water only: blocked by banks (the four point test against WA tiles, radius 0.5), bridges pass overhead (the hull clears the low bridges; a bridge deck under 1.2 above the water blocks: none in the design), the island, the pier planks and the pond swim area (the swimSpots tiles plus one) are blocked. The creek is a slow zone (max 3, no wake).
- `E  Tie up` within 2 units of a free dock slots the boat there; `E  Hop off` elsewhere beaches the boat on the nearest bank tile (it stays there, `parked`, and can be taken again).
- The chase camera sits higher and farther (distance 7, height 3.2). Agents stay on foot.

## The waterway (js/cityplan.js, js/terrain.js, js/sim.js, js/golf.js, js/city.js)

- **The creek**: from the pond's south shore to the lake's north shore, 2 to 3 tiles wide, about 25 tiles, meandering (a water spline with width like the roads), with a footbridge where the park path crosses (`kind: 'foot'`) and a cart bridge on the course (`kind: 'cart'`). It crosses one hole as a hazard: the design picks the hole and reshapes it so the creek is in play (a carry or a dogleg), keeping the hole's par and length range; the course stays nine holes, par 35.
- **The channel**: from the lake's east side to the river, 3 tiles wide, under the links footbridge (the bridge spans it) or a new short bridge if the footbridge is elsewhere.
- Terrain: the creek bed at the pond level sloping to the lake level, banks over 2 tiles, the channel at the lake level; docks flat at their water's surface plus 0.3; kickers shaped as 2 tile ramps.
- Sim: water tiles for the creek and channel; `state.waterways` with the slow zone tiles; the pond's swim and shore rules unchanged (the creek mouth tiles are not shore tiles); agents and the visitor still reach everything (validatePlan BFS).
- Renderer: the water bodies merge (one surface level per body: the pond stays 0.04, the creek steps down to the lake, the channel at the lake level; where a creek meets a body of a different level the design places a small weir mesh so the surface step reads as intended).

## The near-miss decision

Jackson asked what the 'Close!' flash was; it stays, and now pays (see Coins). The camera punch halves.

## Verification

- cityplan: `validatePlan` zero issues with the creek, channel, docks, kickers; the BFS reaches every dock on foot and every dock by water (a water BFS from the marina reaches the pond landing, the island ring, the river landing).
- terrain: creek bed slopes monotonically pond to lake; docks flat; kickers shaped; deterministic.
- sim: 600 s run as v10; boats always docked, beached or ridden; the visitor's boat BFS matches the plan's.
- vehicles: hoverboard controller headless: reaches 11 and 14 on boost, launches off a synthetic cliff with a glide that lands farther than a 1.0 gravity fall by at least 2x, no NaN over 5000 steps; boat controller: blocked by banks, slow zone, docking within 2 units.
- player: H summons and dismisses; the board trails on foot; a scripted ride over the lake; a scripted boat trip from the marina through the channel, the lake, the creek to the pond landing and back; coins and hats persist across a wallet reload.
- subway: a scripted run with a stumble shows the chasers (positions logged), a crash plays the catch before the card; near-miss coins and the streak multiplier; the hoverboard power-up forgives one crash.
- wallet and shop: buy, spend, equip, consume, refuse when short; the catalogue prices; storage round trip.
- minimap: base layer painted from a raster; the overlay draws the visitor, agents and the target; allocation free update (a 600 frame count).
- renderer: `node --check`; headless build; draw calls at the overview under 900.
- No em dashes. Sentence case. No real brand names.
