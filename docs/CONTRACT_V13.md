# Thread Town 3D, version 13: the town map, waypoints and directions

Adds to `docs/CONTRACT_V12.md` and earlier; where they disagree, this file wins. No world changes.

## Goal, in Jackson's words

Open the mini map to see where things are, with labels. Add waypoints and directions on the mini map.

## Files

```
js/minimap.js       the full map mode (labels, pan and zoom), waypoints, the route; the corner minimap draws the route and the waypoint
js/render3d.js      wiring: open and close, the route from the sim's path finder, the HUD line, keys and the touch Map button
js/ui.js, index.html, css/style.css   the map overlay markup and styles (phone and laptop)
```

## The town map (js/minimap.js)

- `createMinimap` gains `openMap()`, `closeMap()`, `isOpen()`, `setWaypoint(x, z | null)`, `setRoute(points | null)`, `waypoint`, and `onWaypoint(cb)`.
- Opening: the corner minimap grows into a centred overlay (on laptops 80 percent of the view, on phones the full view) with a dark backdrop, a close button, and the title 'Thread Town'. Open from a small expand glyph on the corner minimap, a tap on the corner minimap, the `M` key held for 0.4 s or `Shift+M` (plain `M` still toggles the corner minimap), and the touch Map button opens it directly. Close with the button, Esc, a tap on the backdrop, or `M` again.
- Content: the base layer at 4 px per tile (the same painter as the corner map at higher resolution: water, roads, paths, course, buildings by department colour, bridges, plaza, the hill and bluff shaded by height), the visitor arrow, agents as dots, scooters and boats as ticks, racks, docks, kickers, the kiosk, the subway entrance, the pier and the marina as small icons.
- **Labels** (Kanit or the UI font, 12 px on phones, 13 px on laptops, navy on a silver pill): every department building by its name, Cafe, Clubhouse, Thread National and each hole's number at its tee, Subway, Pier, Marina, Pond, Lake, River, The creek, The channel, The hill, The bluff, Kiosk, Scooter racks (one label per rack cluster), Docks. Labels never overlap (a simple greedy placement that nudges a label up or down and drops it when it still collides at the current zoom).
- Pan by drag, zoom by wheel and pinch (2 to 8 px per tile), the visitor centred on open. Allocation free per frame while open (the labels are laid out once per zoom level).

## Waypoints and directions

- A tap or click on the open map sets the **waypoint** (a salmon pin with a pulse) at that tile, clearing the old one; a tap on the pin clears it. The pin shows on the corner minimap too, with the pulsing ring the minimap already uses for targets (the waypoint wins over the prompt target while it is set).
- The **route**: the renderer asks the sim for a path (`TT.sim.findPath`) from the visitor's tile to the waypoint tile, or to the nearest tile the sim walks within 6 when the waypoint is on a building, the water or the course green (the island hole walks over the footbridge, the same rule as the golf walk). The route is drawn as an aqua dotted line on both maps, recomputed when the visitor moves more than 2 tiles from the tile it was computed on, at most twice a second, allocation free in between.
- **Directions** on the HUD while a waypoint is set: a line under the prompt area reading 'Waypoint: 120 m, bear left' with a small arrow that turns with the heading (10 yards per tile, so 1 tile is 9 m; the bearing word is ahead, bear left, bear right, left, right, behind, from the angle between the heading and the next route point 3 tiles ahead). Reaching the waypoint (within 1.5 tiles) clears it with 'You are here'. On scooters, the hoverboard and boats the line still shows (boats route over the boat water; the hoverboard over the walkable tiles).
- A **Go** button on the open map beside the pin (and the `G` key while the map is open) starts the cart style auto walk along the route when the visitor is on foot: the visitor walks the route at run speed until the waypoint or any input, using the golf walk's waypoint follower (`planWalkWay` in player.js) exposed as `TT.player.walkRoute(points)`; riding states ignore Go.

## Verification

- minimap.js: a Node test with the canvas stub: the open map paints the base at 4 px per tile, lays out labels with no overlaps at zoom 4 (bounding boxes), a tap sets and clears the waypoint, setRoute draws the dotted line, 600 updates allocate nothing while open and closed.
- render3d: headless with isTouch false and true: Shift+M opens, Esc closes, a click sets a waypoint, the route comes from TT.sim.findPath, the HUD line reads the distance and the bearing word, reaching the waypoint clears it, Go walks the visitor along the route to the pin; the corner minimap shows the pin and the route.
- `node --check` everywhere; no em dashes; sentence case; the laptop and phone layouts both fit (380 px wide).
