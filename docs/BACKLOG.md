# Thread Town backlog

Requests from Jackson that are agreed but not built yet, in the order we plan to do them. Each phase is tested by Jackson before the next one starts.

## Done

- **v9 scooters** (docs/CONTRACT_V9.md): scooters for the visitor and agents, parked cars removed.
- **Character picker contrast** (css/style.css) and **golf scoring terms** (js/player.js golfTerm).

## Built, awaiting Jackson's test: v10 realism and cleanup (docs/CONTRACT_V10.md, docs/WORLD_DESIGN.md)

Landed 2026-11-03: 192 by 144 map with a hill district and switchback, river valley, bluff downtown, lake with the marina; spline roads as meshes, splat blended ground, instanced forests and rocks; Thread National nine holes (pars 4 3 5 4 4 3 5 3 4, par 35, hole 6 the island par 3), markers and signs on every hole, full rounds only on the board; scooter feel fix (camera trail 0.36 units at full speed), rack rebalancing; quality toggle High / Balanced; night glow, haze, cascaded shadows.

Fixed during Jackson's test (2026-11-03): the walk to the ball on hole 6 went straight through the lake; it now follows the sim's path over the footbridge (player.js planWalkWay), and the same applies to every walk between shots and to the next tee.

Known cosmetic items to revisit: the skirt beyond the map is a flat lime green (as in v8); island cliff edges are stepped at the tile resolution; the far cascade's shadow bound snaps when the camera moves fast.

## Built 2026-11-03, awaiting Jackson's test: v11 (docs/CONTRACT_V11.md, docs/V11_DESIGN.md)

v11.1 hand fixes applied 2026-11-04 (Jackson to confirm):
- Bridges: the three v11 creek and channel bridges drew the path or road ribbon straight through the span (a second surface over or under the deck), the deck profile was smoothed so short arches sat up to 0.3 below the walker's height, and the deck's water floor defaulted to 0.04 when no water tile was found under the span (the raster marks it BRIDGE), clamping those decks to 0.46 end to end with a 0.3 shelf at each end. Fixed in roads.js: ribbons and markings stop at bridge tiles, no deck smoothing, no floor without water. Every deck now matches the walker height at mid span; ends within 0.09.
- Boats: launch 9, rowboat 6, reverse 3, quicker turning; pass under every bridge (boat mask no longer closes decks; plan bridges can set closedToBoats to block one).
- Hoverboard: Space while riding is an ollie (JUMP_VY 4.5, about 1.2 up, lands in under a second); the walk jump no longer eats the edge while hovering.
- Cost rule: a 16 to 20 agent run exhausts the 5-hour window by itself and spills into extra usage ($127 for v10, $126 for v11). Before any run, report the 5-hour position and the expected overflow; prefer hand fixes for small lists.

Original v11 scope (built):

- **Minimap** in the bottom-right corner in walk and scooter modes (M toggles): roads, water, course, buildings by department colour, the visitor's arrow with heading, agents as dots, a marker for the current target (prompt target, hole in play, rack). Rotates with the chase camera, north tick.
- **Subway chaser**: an inspector and a dog. On a stumble they appear close behind for a few seconds grabbing at the runner, then fall back; on a crash they catch the runner (grab and haul animation, the dog jumps up) before the game-over card; a short chase at the start of every run.
- **Coins and shop**: runner coins persist (leaderboard storage) and show in the header. A kiosk at the subway entrance and on the runner start screen sells a hoverboard (runner: one crash forgiven for 30 s; town: a rideable board that hovers 0.4 above the ground, crosses water, about 1.5x the scooter's speed with a boost key and drifts, carries momentum off edges with real airtime and a landing bounce, floaty (gravity about 0.4 of the walker's, a long glide with a slight lift while boosting, soft landing) so the ridge top, the bluff edge and the cliffs are launches; no racks, H summons it anywhere and H hops off, it trails the visitor on foot; kicker ramps on the bluff edge over the river and a lip on the ridge), coin magnet, jetpack, 2x multiplier, character colours and hats. Decided 2026-11-03: the hoverboard is a personal vehicle beside the scooters (which stay at racks). Open: other items to sell.
- **One waterway**: a creek from the pond south through the park and across the top of the links into the lake (2 to 3 tiles wide, about 25 tiles, a footbridge where the park path crosses and a cart bridge on the course; it becomes a hazard on the hole it crosses), and a short channel from the lake's east side out to the river under the links footbridge, so a boat goes pond, creek, lake, island, channel, river, marina. The creek is a slow zone; the pond keeps the pier and the swim area, which boats cannot enter. Plan, terrain and sim change (water raster, banks, hole reshaping, water rules).
- **Boats you can drive**: the marina and pier boats become rideable (a boat controller like the scooter's, on the lake and the river, slower turning, a wake; dock at the marina slips or the pier; E to board and to tie up). Agents stay on foot.
- Plus Jackson's fixes from testing v10.

## Built 2026-11-06: v12.1 and v13 (final touches before Jackson leaves on 2026-11-10)

- Orbit is the only overview camera (the free roam option is gone).
- Swim everywhere: wade in from any gentle bank, float at that body's surface, climb out on low banks; cliffs stay blocked.
- Bridges: longer gentler spans where the paths allow, arches only as tall as the boat clearance needs (1.05), no loose deck slab past a span; hole 6's tee follows the shore ground.
- v13 map (docs/CONTRACT_V13.md): the corner minimap opens into a labelled town map (Shift+M, the expand glyph, the phone Map button); tap sets a waypoint, the route follows the sim's paths and shows on both maps, the HUD gives distance and bearing, Go walks you there.
- Still humped: the creek mouth cart bridge and the marina footbridge (about 0.3 per tile) because their paths turn at the banks.

## Built 2026-11-10: v14, the founder's statue and the final sweep (docs/CONTRACT_V14.md)

- The founder's statue on the plaza (js/statue.js): a gold figure, a plaque, and a note opened with E.
- Sweep fixes: bridge decks are solid from every side and from below; cart bridges are plank decks; no sidewalks across the creek road bridge; the gap at the west end of the River Street bridge is closed; agents no longer cross railings; walkers, scooters and the hoverboard stand on the marina planks; the swimmer floats at each water body's own level and can swim under bridges; Go works from the island; modals no longer leak walk keys or exit walk mode on Esc; zoom out stops before the far plane; the ground past the map edge wears the grass texture; the island has a rock ring; js/legacy is deleted.
- By hand after the sweep: low road bridges wear a 0.22 slab so a boat's hull clears them, and the boat rider ducks under every deck.
- v14.1, the golf guide and the smooth cart (js/player.js auto-drive, js/render3d.js golf guide):
  - A round opens with "Press Tab and the cart drives you to tee 1"; a beacon stands over the next tee or the resting ball, the directions line gives its distance and bearing, and the minimap marks it.
  - Tab is the whole trip: it drives to the tee or beside the ball, the visitor steps out and walks to the stance (over the footbridge for a ball on the island). Tab also works on foot within 8 tiles of the parked cart.
  - The auto-drive rounds corners (pure pursuit along the whole route with a speed scaled lookahead), eases its speed with the turn ahead, brakes on a curve over the remaining route and turns to its parking heading instead of snapping.
  - The auto-drive keeps off the greens and never parks ahead of the ball on the line to the cup; a ball on a green gets the nearest spot off it.
- Known and left alone (each needs a redesign, not a patch):
  - The marina footbridge (channel-footbridge) still humps: 0.154 per quarter tile against a 0.12 target. Its span cannot grow without covering the marina shore tile.
  - Path ribbons meet the one and two wide decks off centre where a spline path turns at the bank.
  - Boat water where the ground stands above the water: 16 river tiles along the bluff wall, 28 around the island, 3 under the marina kicker.
  - Stepping onto a deck from the water's edge pops the body up to 1.1 in one frame; climbing out pops 0.7 to 1.2.
  - The hoverboard treats the world as one layer per tile: it cannot pass under a deck.
  - The directions pill truncates four digit distances on 360 to 375 px phones.
  - validatePlan has no checks for plan.statue.

## Built 2026-11-05: v12 phone (docs/CONTRACT_V12.md)

Touch layer (js/touch.js: joystick, buttons per mode, look drag, pinch, runner swipes), orbit camera and the Phone quality tier by default on coarse-pointer devices, phone layouts (collapsed header with a Menu button, 120 px minimap above the buttons). Laptop path verified identical. Checked in the browser pane at 375 by 812: no console errors, no horizontal scroll, buttons E, View, Map, Jump in walk mode.

## After that

- **Person avatar** with customization (skin, hair, outfit, glasses) as a third character type.
- **Live data**: wire real routines (Friday pipeline deck, fintech digest, Asana filers) to drive agent work.
- **Multiplayer** (deferred, see the multiplayer plan in memory): server, Entra ID login, presence, saves, free hosting.
