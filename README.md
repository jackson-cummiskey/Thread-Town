# Thread Town

A low-poly 3D city where every Thread Bank AI agent is an alien. Each department has its own recognizable building and a signature work activity: Executive gives speeches at a town hall podium, Embedded Banking patches partner connections at a glowing switchboard, Compliance runs a stamp press at the courthouse, Financial Crimes scans from a watchtower, Operations drives a depot crane, Data pans a telescope on an observatory, Credit spins open a bank vault, Accounting works a ticker desk that feeds a piggy bank, Technology codes at a three-monitor workstation, Risk walks a high wire over its own zoo, Marketing shoots hoops under a billboard, and People ride the swings. Risk is special: its lot is a zoo with fenced enclosures and resident animals, and its agents are rendered as animals (the species comes from the agent name, so Otter, Falcon, and Tortoise look like themselves). Off duty, agents stroll, sit at the café with ice cream or coffee, rest on benches, and jump off the diving board into the pond. Buildings grow with the number of agents a department has, and the side panel ranks teams by runs this week.

## Run it

```bash
node serve.js
```

Then open http://localhost:4173. No build step. The five three.js files the page loads (version 0.160.0, MIT) are vendored under `vendor/three`, so the page works from any static host, including GitHub Pages, and without internet once the fonts are cached. `npm install` is only needed for the headless tests, which import the full package from `node_modules`.

Play it hosted: https://jackson-cummiskey.github.io/Thread-Town/ (GitHub Pages, served from the `main` branch). Progress, coins and the leaderboards live in each player's own browser.

## Controls

- Golf: the three par-3 holes are in the bottom row. In walk mode, stand at a tee and press E. Aim with your look direction, hold Space to charge the power meter and release to swing (it ping-pongs, so timing matters), clubs switch automatically (driver, iron, putter on the green) or with 1, 2, 3, and X leaves. The driving range next to the clubhouse takes unlimited balls.
- Thread Metro: the subway entrance on the south edge of the plaza. In walk mode, step up to the stairs and press E. Three lanes, A and D (or arrows) switch lanes, W or Space jumps, S ducks, and you speed up over time. Coins, Magnet, Shield, 2x, and Jet power-ups. R runs again, E climbs back out to the plaza.
- Buildings: walk into any department door to go inside (fade), read the stats board and the portrait wall, walk back to the door to leave.
- Chase view: V switches between first person and a third-person chase camera (mouse orbits around you, wheel sets the distance).
- Leaderboard (header button, and the sidebar card): best subway runs and lowest golf rounds, saved in the browser for now; the town also has scoreboards at the clubhouse and the subway entrance.

- Walk the town (header button, or Tab): become a visitor in first person. Pick your character once (a Thread-colored alien or any of the 24 animals). WASD or arrows move, mouse looks (click to capture the mouse, Esc releases, Esc again exits), Shift runs, Space jumps or dives from the board, E interacts, V switches between first and third person. Walk up to an agent and press E to talk (it stops, waves, and tells you what it is doing), grab an ice cream or coffee at the café and sit on a stool or bench, walk into the pond to swim, climb out by the ladder, or step onto any department station when nobody is working there to try the activity yourself (walk the high wire, shoot hoops, ride the swings, spin the vault).

- Camera modes (header switch). Free roam (default): left-drag slides over the ground, right-drag looks around from where you are, the wheel flies forward, WASD or arrows glide, Q and E turn, R and F change height, Shift speeds up. Orbit: the classic orbit around the point you are looking at.
- Hover an alien: it stops, turns to you, and waves while a quick card shows its name, task, schedule, and what it is doing now.
- Click an alien or a building: the camera flies to it and the side panel shows the full record (creator, department, schedule, runs, history). Use Follow to keep the camera on an agent, and Reset view (bottom left, or Escape) to return to the whole town. Double-click empty ground also resets.
- Lighting follows the clock (dusk and night bring lamps, lit windows, the lighthouse beam), or force Day or Night in the header.
- Board mode hides the controls, enlarges the town, shows the leaderboard and live feed in a side column, and turns on a slow cinematic orbit. Escape exits.
- Add an agent: the alien is generated from the name and takes its department color. Agents added through the form are saved in the browser only for now.

## Files

- `index.html` page shell, header controls, side panel, add-agent form, import map for Three.js
- `css/style.css` chrome styling with Thread brand tokens, overlay tags and bubbles
- `js/data.js` departments (map slot, footprint, station side, activity id, wall, accent and alien colors), seed roster, fake task library. Edit this to change the cast.
- `js/sim.js` map generation, pathfinding, agent state machine (work, wander, café, bench, swim, dive), hover pause, fake-run simulator, stats, events. No rendering.
- `js/aliens3d.js` procedural 3D alien characters and the pose system (walk, type, sit, swim, dive, swing, throw, lever, wave, balance, and more)
- `js/player.js` the walk-mode visitor: smoothed movement, collision, swimming and diving, interactions, interiors, the golf controller, first person and chase camera
- `js/interiors.js` the twelve department rooms with live stats boards and portrait walls
- `js/golf.js` the course props, ball physics, and scoring; `js/subway.js` the Thread Metro endless runner; `js/leaderboard.js` the records store
- `js/animals3d.js` 24 low-poly animal species with the same handle shape and poses as the aliens, used by departments that set `characters: 'animals'` in data.js (Risk today); `speciesForName` maps agent names to species
- `js/depts/common.js` shared 3D helpers for buildings and props
- `js/depts/<id>.js` one module per department: its building and its work activity
- `js/leisure3d.js` café stools and string lights, pier, diving board, ladder, floating rings, ripples and splashes, ice cream and coffee props
- `js/render3d.js` Three.js world: camera, lighting and day/night, ground, buildings, trees, props, agents, overlays, picking, camera focus and follow, static-mesh merging
- `js/ui.js` roster, inspector, utilization board, ticker, tooltip, add-agent form, board mode
- `docs/CONTRACT.md`, `docs/CONTRACT_V2.md` the interface contracts between modules
- `docs/ART_DIRECTION.md` the art bible; `docs/CITY_DESIGN.md` the per-department building and activity spec; `docs/ZOO_DESIGN.md` the species recipes and zoo layout; `docs/CONTRACT_V3.md` the animal character contract; `docs/CONTRACT_V4.md` the walk-mode contract
- `serve.js` tiny static server for local preview

## Tuning knobs

- `render3d.js`: `VIEW_POLAR`, `VIEW_AZIMUTH`, `FIT_MARGIN` (default camera), `ALIEN_SCALE` (character size). `TT.town._debug` in the browser console exposes camera, controls, renderer, scene, and merge statistics.
- `sim.js`: `TT.sim.LEISURE` (café, swim, bench odds).
- Headless testing: `TT.town.tick(seconds)` advances the world without animation frames.

## Status

Draft 6: unique buildings, signature activities, leisure, free-roam and chase cameras, the Risk zoo with animal agents, walk mode with interiors, golf, the subway runner, and a leaderboard. Still fake agent data; `serve.js` also accepts POST /snap for saving test frames. Live wiring (routines checking in and out) and a shared page where teammates can register agents come next.
