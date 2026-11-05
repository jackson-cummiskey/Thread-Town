# Thread Town 3D, version 9: scooters, and no parked cars

Adds to `docs/CONTRACT_V8.md` and earlier contracts; where they disagree, this file wins.

## What version 9 adds

1. **Scooters for the visitor.** Grab one at any rack, ride it around the city, hop off anywhere; it stays where you leave it.
2. **Scooters for agents.** Agents with a long commute ride a scooter from the nearest rack to their building and park it at the building's rack; short commutes stay on foot. Agents also ride back to leisure spots far away.
3. **Parked cars removed** everywhere (parking lots and avenues). Lots stay paved.

## Files

```
js/vehicles.js       scooter model (moved from city.js), scooter riding model (reuses the cart controller pattern)
js/city.js           remove cars; racks reference the vehicles scooter model
js/sim.js            racks as a sim resource (state.racks with slots), agent commute by scooter, scooter entities
js/player.js         scooter riding state for the visitor
js/render3d.js       scooter rendering for agents and the visitor, rack slots, prompts, HUD hint
js/aliens3d.js, js/animals3d.js   pose 'ride' (standing on a scooter, one foot back, hands forward)
js/ui.js, index.html, css/style.css   legend line for scooters
```

## Scooter entities (js/sim.js)

- `state.racks = [{ id, x, y, slots: 3, scooters: [scooterId | null, ...] }]` built from `plan.scooterRacks` (world position is the tile center; the rack rail lies east to west, scooters park south of it).
- `state.scooters = [{ id, x, y, yaw, rackId | null, rider: agentId | 'player' | null, parked: boolean }]`: three per rack at start, parked in the rack slots. A scooter that is dropped off-rack becomes a free scooter at that position (`rackId null, parked true`); the nearest rack within `2` tiles re-slots it when a rider parks there.
- `TT.sim.takeScooter(scooterId, riderId)`, `TT.sim.parkScooter(scooterId, x, y, yaw)` (slots into a rack if within 2 tiles and a slot is free, else free-parks), `TT.sim.nearestFreeScooter(x, y, maxDist)`, `TT.sim.nearestRack(x, y)`.

## Agents riding (js/sim.js)

- When an agent starts a commute (`startJob`) or a far leisure trip and the BFS path length is over `28` tiles and a free scooter exists within `10` tiles of its current tile: the agent first paths to that scooter (`state 'commute'`, `leg: 'toScooter'`), takes it (`agent.scooter = id`, `pose 'ride'`), then paths to the destination at `4.6` tiles/s (`leg: 'riding'`), parks it, and walks the rest (`leg: 'walk'`). Riding agents follow the same BFS paths (roads, sidewalks, paths, plaza, grass). Hover pause still freezes them. `talkUntil` still works (the agent stops on the scooter and waves).
- Which scooter: free-parked scooters (`rackId null`) before rack scooters, then the nearest. An agent never takes the last scooter left in a rack (scooters another agent has already reserved do not count as left), so every rack keeps one for the visitor. The visitor may take any scooter.
- Where it parks, the first of these that gives a ride of at least `8` tiles and a walk to the destination: the open rack nearest the destination within `6` tiles; the open rack nearest any of the last `10` tiles of the walking path within `6` tiles (the street rack by the building); for leisure trips (no stub mouth) the open rack nearest the destination within `12` tiles; else it free-parks at the stub mouth, or for leisure trips four tiles short of the destination on the walking path. If none works the agent walks.
- The sim exposes `agent.scooter` and `agent.leg` for the renderer.

## The visitor riding (js/player.js)

- Near a rack with a scooter, or a free scooter within `1.6`: prompt `E  Grab a scooter`. On E: `state 'scooter'`, `player.scooter = id`, the scooter position follows the rider. Controls: W and S throttle and brake, A and D steer (lean), max speed `7.5` on paths, sidewalks, plaza, parking and bridges, `5.5` on grass and fairway, `2` on sand, blocked by water, buildings, trees and lot edges (four-point test, radius `0.32`, sliding). Acceleration `9`, braking `14`, friction `3`. Camera: chase as usual. `E` hops off (`TT.sim.parkScooter` at the current position and yaw; if a rack is within 2 tiles it slots in). Jumping and interactions are off while riding except E. Prompt while riding: `E  Hop off`.
- Riding is allowed everywhere the visitor can walk except water, sand and course greens (`GR`: hop off at the fringe; the scooter stops at the green edge with the hint `No scooters on the green`).
- The scooter stays where you left it; `nearestFreeScooter` finds it later.

## Rendering (js/render3d.js, js/vehicles.js)

- `makeScooter(ctx)` moves to `vehicles.js` (kick scooter: deck, stem, handlebars, two wheels, a Thread aqua deck stripe, a small bell) with `animateScooter(scooter, speed, steer, dt)` (wheel spin, stem steer, a lean of up to `0.22` rad with steer times speed). City racks use it for parked scooters through `state.scooters`.
- One mesh per scooter (there are about 30), pooled; parked scooters stand at their rack or free spot; ridden scooters follow their rider each frame (agent `pos` or `player.scooter` position) with the rider's handle placed on the deck in pose `ride` (feet at deck height `0.12`, hands at the handlebar, which the animators approximate with the pose).
- Remove parked cars from `city.js` (and the bay lines stay).
- Prompts and the legend: `Scooter: W S ride, A D steer, E hop off`.

## Pose (animators)

`ride`: standing on the deck, one foot forward one back, slight knee bend, body leaning forward `0.15` rad, both arms forward and slightly down to the handlebar, head up; quadrupeds stand on hind legs with front paws on the bar; birds perch with wings on the bar. Reads `handle.leanZ` (roll) set by the renderer from the scooter lean.

## Verification

- sim: headless 300 s run: agents with long commutes take scooters (count the `riding` legs), park them at racks or stub mouths, no scooter lost (every scooter is either parked or has a rider at all times), racks never exceed 3 slots, agents still reach their workTile, hover pause and talk still freeze riders; short commutes stay on foot.
- player: grab a scooter at the plaza rack, ride along the avenue and over a bridge with scripted input, blocked by water and buildings, hop off, scooter persists, grab again; green edge rule.
- vehicles: scooter model builds; the riding model asserts max speeds by lie, braking, and no NaN over 5000 steps.
- renderer: `node --check`; every scooter has a mesh; cars absent (grep `car` placement in city.js).
- No em dashes. Sentence case.
