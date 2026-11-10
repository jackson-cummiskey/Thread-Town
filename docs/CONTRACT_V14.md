# Thread Town 3D, version 14: the founder's statue and the final cleanup sweep

Adds to `docs/CONTRACT_V13.md` and earlier. This is the last version before the project changes hands (Jackson's final day at Thread is 10 November 2026), so the rule for every change is: the smallest safe fix. Nothing new is added by the sweep. A finding that needs a redesign is written down in the report, not attempted.

## Already built by hand (do not rebuild)

- `js/statue.js`: the founder's statue on the plan's `statue` tile (77, 59; a 3 by 3 feature block at the north end of the plaza, facing the fountain), wired in `js/render3d.js` (`buildFounderStatue`, `STATUE_PROMPT`, `plaqueOpen`, the Esc and E handling), a label on the town map, the `#plaque-modal` note card.

## The sweep list

Known cosmetic items, in priority order:

1. **Bridges.** Jackson has reported bridges as glitchy three times. For every plan bridge, sample the whole span and one tile past each end at quarter tile steps: the deck surface (a ray cast down onto the `roads:*` meshes) against the walker height (`terrain.heightAt + roads.surfaceLiftAt`) must agree within 0.05, no second road surface may lie within 0.6 above or below the deck, the step between neighbouring samples must stay under 0.12 per quarter tile, railings must follow the deck, piers must reach the bed, and the water plane must continue under the span. The two short footbridges over low banks (`creek-cart-bridge`, `channel-footbridge`) still rise about 0.3 per tile: lower their humps as far as the boat clearance (1.05) allows, or lengthen the approach ramps in the terrain, without moving their paths.
2. **The ground beyond the map edge** (`skirt` in render3d.js) is a flat lime green. Give it the ground's grass colour with a little noise and let the haze take it, so the map edge does not read as a hard line.
3. **The island's cliff edge** (hole 6) is stepped at the tile resolution; soften it (the ground splat, the terrain blend or a ring of rocks from nature.js).
4. **Street sign text** is mirrored on the back face of the signs in city.js.
5. **The far shadow bound** snaps when the camera moves quickly in the overview.
6. **The directions pill** (v13) may overlap the touch buttons or the prompt on a 375 px wide phone.

Then a hunt for anything broken, by play-through in a headless build (laptop path and touch path):

- Every prompt and every state: walk, run, jump, sit, the cafe, a station, an interior and back out, the pond dive and the pier, swimming in the pond, the lake, the river, the creek and the channel (wade in, swim under a bridge, climb out, no getting stuck, no walking on water), scooters, the hoverboard (summon, boost, ollie, a kicker, over water), boats (take, drive under every bridge, tie up, beach), the golf round with the cart and the island hole, the subway runner (start chase, stumble, catch, near misses, the shop), the wallet and shop, the minimap, the town map, a waypoint with Go, the founder's statue (prompt, the note opens and closes with E, Esc and the button, the visitor and agents never walk through the pedestal, the touch E button opens it).
- Agents: 600 s of simulation, everyone reaches work, scooters and boats invariants, nobody stuck against the statue's block.
- No console errors, no NaN, no allocation per frame in the hot loops, draw calls at the overview under 900, the Phone tier under the High tier.
- Dead code and leftovers: `js/legacy/` (delete it if nothing imports it), unused exports and stale comments are left alone unless they are wrong.
- No em dashes anywhere; sentence case; no real brand names.

## Verification

- `node --check` on every module; the import graph resolves.
- `validatePlan` zero issues.
- The headless render test passes on the laptop path and the touch path.
- Each fix is listed with the file, the line and the before and after measurement where there is one.
