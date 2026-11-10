/* Thread Town simulation, version 10: the plan v3 (js/cityplan.js, docs/CONTRACT_V10.md "The plan
   v3" and "Thread National", geography in docs/WORLD_DESIGN.md). The sim keeps the logic grid of
   tiles and everything that is not map layout from versions 2 to 9: pathfinding, the agent state
   machine, leisure behaviors (cafe, benches, swimming with a diving board), hover pause, the
   fake-run simulator, scooters and racks, stats and the event log. No rendering lives here; the
   3D renderer (js/render3d.js) reads TT.sim.state and calls TT.sim.tick(dt).

   One rasterizer. js/cityplan.js owns rasterizePlan and the lot helpers (rotVec, lotToWorld,
   lotTile, lotRectTiles, lotRectCorners, lotToLocal, lotWorldRect, lotLayout). The sim does not
   port them: it evaluates the module once and maps the MARK grid onto its own tile types, then
   adds what only the sim knows (crosswalks, the practice green, the pond water, trees and
   flowers, furniture). js/cityplan.js is an ES module and this file is a classic script, so the
   module reaches the sim one of these ways, tried in order: TT.cityplan set to the module
   namespace by a module before the sim is first used (the renderer may do
   `import * as cityplan from './cityplan.js'; TT.cityplan = cityplan; TT.PLAN = cityplan.PLAN`),
   TT.cityplanSource set to the module's source text (headless runs), a library passed as the
   second argument of TT.sim.init(plan, lib), or a synchronous same-origin fetch of
   js/cityplan.js whose export keywords are stripped before evaluation (the v7 path, now
   returning the whole namespace). The plan itself is TT.PLAN, the init argument, or the
   evaluated module's PLAN. TT.sim.PLAN, TT.sim.COLS, TT.sim.ROWS and TT.sim.cityplan resolve on
   first access.

   Tile types. MARK values map onto TILES: NONE and GOLF and STATION become G (rough is grass to
   the logic layer; the station rectangle lives on the building record), WATER WA, ROAD and STUB
   P, SIDEWALK SW, BRIDGE BR, PLAZA and COURTYARD Z, BUILDING B, PARKING PK, FAIRWAY FW, GREEN GR,
   TEE TEE, SAND SA, PATH PT, CARTPATH CP, DECK DK, FEATURE FT. CW (crosswalks), T (trees) and F
   (flowers) are painted by the sim. T is kept for forest cores only: a tree tile needs all eight
   neighbors to be plain grass before the tree pass, so paths through forests stay walkable.

   Lot frames. Lots are laid out in their canonical frame (north edge at the top, the building
   against the north side, the door on the south face, the 4 by 4 station in the yard on the
   station side) and rotated into the world by lot.rot, any angle in degrees, about the lot center
   (cx, cy): 90 puts the door on the east face, 180 north, 270 west. The footprint is the set of
   tiles whose center lies inside the rotated rectangle, the stub is the shortest rasterized line
   from the door tile to the nearest street tile, the station the rotated 4 by 4 with the tile
   under its center as workTile. Every record keeps its tile fields in world coordinates plus
   `rot`, `corners`, `lot` (the frame: bounding rect, canonical size, center, corners) and `local`
   (the same fields in the canonical frame, origin at the lot's canonical north-west tile) so the
   renderer can build modules in local space and rotate the group by rot about lot.center.

   State added by this version: state.roads (sampled splines), state.bridges, state.marina,
   state.stairs, state.golf with nine holes (hole 6 carries island, collarR and bridge), racks with
   `near`, agent trips with kind 'return' (rack rebalancing, CONTRACT_V10 "Scooter racks": a rack
   empty for more than RETURN.EMPTY_AFTER seconds pulls a free-parked scooter, or one from a rack
   holding at least two, within RETURN.REACH tiles; an idle agent walks to it, rides it back and
   slots it). Every v9 scooter rule still holds: a scooter is always parked or ridden, racks never
   exceed their slots, agents never take the last scooter of a rack.

   Version 11 (CONTRACT_V11 "The waterway", "Boats", "The hoverboard"; docs/V11_DESIGN.md). The
   creek and the channel arrive from the raster as WATER marks, so the tile grid needs no stamping;
   state.waterways keeps them as records ({ id, body, width, level, bed, slow, tiles }) with the
   slow zone flag, state.weirs the plan's weirs. Swim spots are pond tiles whose four neighbours
   are pond tiles (not any water: the creek mouth would otherwise add one), and the shore ring is
   grass next to pond tiles, so the creek mouth tiles are not shore. state.docks (from the raster's
   docks, each with a `boat` slot), state.boats (four at start: a launch and a rowboat at the
   marina, a rowboat at the pier, a launch at the river landing), state.kickers and state.kiosk are
   records; a one tile ring around every dock, kicker tile and the kiosk stays free of trees and
   flowers. The boat water (cityplan's boatWater on the same raster: the river, the lake, the creek,
   the channel and the pond outside the swim area, the island, the pier planks and the marina
   planks excluded, the water under every bridge deck counted) is shared with the validator;
   waterReachable(x, y) answers the BFS from the marina. Boats are moved by js/vehicles.js and
   js/player.js; the sim keeps the invariant that a boat is always docked, beached or ridden through
   takeBoat, dockBoat and beachBoat. Agents never ride boats or the hoverboard. */
(function () {
  const TT = window.TT;

  /* ---------- seeded helpers (shared by every module) ---------- */
  TT.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  TT.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- tile types (CONTRACT_V2 "Map v2", CONTRACT_V5 "Map v3", CONTRACT_V7, CONTRACT_V10) ---------- */
  const G = 0, P = 1, WA = 2, B = 3, T = 4, Z = 5, F = 6, FT = 8, FW = 9, GR = 10, SA = 11, TEE = 12;
  const SW = 13, CW = 14, PK = 15, BR = 16;
  // v10: packed gravel paths (parks, the riverside walk, the stairs), cart paths (the links) and
  // wooden decks (the marina dock)
  const PT = 17, CP = 18, DK = 19;
  const TILES = { G, P, WA, B, T, Z, F, FT, FW, GR, SA, TEE, SW, CW, PK, BR, PT, CP, DK };

  /* Leisure odds, exposed on TT.sim.LEISURE for tuning. Read at decision time. */
  const LEISURE = { CAFE: 0.22, SWIM: 0.14, BENCH: 0.14 };

  /* Scooter tuning (CONTRACT_V9), exposed on TT.sim.RIDE. MIN_PATH: a trip rides only when its
     BFS path is longer than this; REACH: a free scooter within this many tiles of the start;
     RACK_REACH: the destination rack radius (also around the last tiles of the walking path);
     RACK_FAR: the wider destination rack radius for trips without a stub mouth (leisure);
     SLOT_REACH: parkScooter re-slots within this radius; MIN_RIDE: a ride shorter than this many
     tiles is not worth the detour. */
  const RIDE = { MIN_PATH: 28, REACH: 10, RACK_REACH: 6, RACK_FAR: 12, SLOT_REACH: 2, SPEED: 4.6, MIN_RIDE: 8 };
  /* Rack rebalancing (CONTRACT_V10 "Scooter racks"), exposed on TT.sim.RETURN. EMPTY_AFTER: a rack
     empty for longer than this many seconds asks for a scooter back; REACH: the source scooter
     (free-parked, or in a rack holding at least two) is within this many tiles; COOLDOWN: seconds
     between two dispatches for the same rack; CHECK: seconds between rack checks. */
  const RETURN = { EMPTY_AFTER: 60, REACH: 40, COOLDOWN: 10, CHECK: 2 };
  const RACK_SLOTS = 3;
  const SLOT_YAW = Math.PI;          // parked in a slot, the front wheel points north at the rail
  /* World position of a rack slot: the rail runs east to west through the tile center, the three
     slots sit 0.45 apart just south of it. */
  function rackSlotPos(rack, i) { return { x: rack.x + 0.5 + (i - 1) * 0.45, y: rack.y + 0.5 + 0.3 }; }

  /* ---------- the plan and the cityplan library ---------- */
  let PLAN = null, LIB = null, COLS = 0, ROWS = 0, grid = null, parent = null, queue = null;
  let districtIdx = null, lotIdx = null, raster = null, bridgeAxis = null;

  function adoptPlan(plan) {
    if (!plan || !(plan.cols > 0) || !(plan.rows > 0)) throw new Error('Thread Town: a city plan with cols and rows is required');
    PLAN = plan; COLS = plan.cols; ROWS = plan.rows;
    grid = new Uint8Array(COLS * ROWS);
    parent = new Int32Array(COLS * ROWS);
    queue = new Int32Array(COLS * ROWS);
    TT.COLS = COLS; TT.ROWS = ROWS;
    return PLAN;
  }
  /* Strips the module syntax from the cityplan.js source and evaluates it, returning every
     exported binding (PLAN, rasterizePlan, the lot helpers, validatePlan, MARK, ...) as one
     namespace object. The module has no imports and no top level await by contract. */
  function evalPlanModule(src) {
    const names = [];
    const seen = new Set();
    const add = n => { if (n && !seen.has(n)) { seen.add(n); names.push(n); } };
    for (const line of src.match(/^export (?:const|let|var|function|class) [^\n]*/gm) || []) {
      const m = /^export (const|let|var|function|class) (.*)$/.exec(line);
      if (m[1] === 'function' || m[1] === 'class') { const n = /^([A-Za-z_$][\w$]*)/.exec(m[2]); if (n) add(n[1]); continue; }
      const re = /(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=(?!=)/g;
      let n;
      while ((n = re.exec(m[2]))) add(n[1]);
    }
    const body = src.replace(/^export default [^\n]*$/m, '').replace(/^export (const|let|var|function|class) /gm, '$1 ');
    return new Function(body + '\nreturn { ' + names.join(', ') + ' };')();
  }
  function fetchPlanSource() {
    if (typeof XMLHttpRequest === 'undefined') return null;
    try {
      const req = new XMLHttpRequest();
      req.open('GET', 'js/cityplan.js', false);
      req.send(null);
      if (req.status !== 200 && req.status !== 0) return null;
      return req.responseText || null;
    } catch (e) { return null; }
  }
  const isLib = o => !!(o && typeof o.rasterizePlan === 'function' && typeof o.lotRectTiles === 'function');
  function ensureLib(lib) {
    if (LIB) return LIB;
    if (isLib(lib)) LIB = lib;
    else if (isLib(TT.cityplan)) LIB = TT.cityplan;
    else if (typeof TT.cityplanSource === 'string') LIB = evalPlanModule(TT.cityplanSource);
    else { const src = fetchPlanSource(); if (src) LIB = evalPlanModule(src); }
    if (!isLib(LIB)) { LIB = null; throw new Error('Thread Town: the js/cityplan.js helpers are not available. Import the module and set TT.cityplan (and TT.PLAN) before TT.sim is used, set TT.cityplanSource to its source text, or pass it to TT.sim.init(plan, lib).'); }
    TT.cityplan = LIB;
    return LIB;
  }
  function ensurePlan(plan, lib) {
    if (PLAN) return PLAN;
    const p = plan || TT.PLAN || ensureLib(lib).PLAN;
    if (!p) throw new Error('Thread Town: no city plan. Import js/cityplan.js and set TT.PLAN before using TT.sim, or pass the plan to TT.sim.init(plan).');
    return adoptPlan(p);
  }
  if (TT.PLAN) adoptPlan(TT.PLAN);

  const at = (x, y) => (!grid || x < 0 || y < 0 || x >= COLS || y >= ROWS) ? -1 : grid[y * COLS + x];
  const set = (x, y, v) => { if (grid && x >= 0 && y >= 0 && x < COLS && y < ROWS) grid[y * COLS + x] = v; };
  // Agents walk on grass, paths, plaza paving, flowers, sidewalks, crosswalks, parking, bridge
  // decks, gravel paths, cart paths and the marina deck. They stay off the course: fairway, green,
  // sand and tee boxes are not walkable for them.
  const walkableType = v => v === G || v === P || v === Z || v === F || v === SW || v === CW || v === PK || v === BR || v === PT || v === CP || v === DK;
  const walkable = (x, y) => walkableType(at(x, y));
  const courseType = v => v === FW || v === GR || v === SA || v === TEE;
  const enterableType = v => walkableType(v) || courseType(v);

  const state = {
    buildings: [], trees: [], decos: [], lamps: [], waterTiles: [],
    hangouts: [], plazaTiles: [],
    seats: [], swimSpots: [], shoreTiles: [], pier: null, pond: null,
    golf: null, clubhouse: null, cafe: null, subway: null,
    lots: [], racks: [], scooters: [], spawn: null, plaza: null, boardwalks: [],
    // v10
    roads: [], bridges: [], marina: null, stairs: [],
    // v11
    waterways: [], weirs: [], docks: [], boats: [], kickers: [], kiosk: null,
    agents: [], events: [],
    selected: null, hover: null,
    settings: { lighting: 'auto', simulate: true, showDemo: true },
    time: 0,
  };
  TT.state = state;
  // Defined at load so modules that run before TT.sim.init() can look departments up.
  TT.deptById = Object.fromEntries(TT.DEPARTMENTS.map(d => [d.id, d]));

  /* ---------- geometry (tile units; a tile belongs to a polygon when its center is inside) ---------- */
  function pointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const tileInPoly = (x, y, pts) => pointInPoly(x + 0.5, y + 0.5, pts);
  function polyBounds(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
  }
  /* Calls fn(x, y) for every tile whose center is inside the polygon. */
  function eachTileInPoly(pts, fn) {
    const b = polyBounds(pts);
    for (let y = Math.max(0, b.y0 - 1); y <= Math.min(ROWS - 1, b.y1); y++) for (let x = Math.max(0, b.x0 - 1); x <= Math.min(COLS - 1, b.x1); x++) if (tileInPoly(x, y, pts)) fn(x, y);
  }
  /* The axis-aligned tile box of a tile list (w and h in tiles; empty lists give a zero box). */
  function tilesBox(tiles) {
    if (!tiles || !tiles.length) return { x: 0, y: 0, w: 0, h: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of tiles) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  const copyTiles = tiles => (tiles || []).map(t => ({ x: t.x, y: t.y }));
  const copyPts = pts => (pts || []).map(p => [p[0], p[1]]);

  /* ---------- lot frames and rotation (CONTRACT_V10 "The plan v3", any angle) ---------- */
  /* These delegate to the cityplan library so the sim and the plan agree tile for tile. */
  const rotVec = (rot, dx, dy) => ensureLib().rotVec(rot, dx, dy);
  const toWorld = (lot, px, py) => ensureLib().lotToWorld(lot, px, py);
  const toLocal = (lot, wx, wy) => ensureLib().lotToLocal(lot, wx, wy);
  const toTile = (lot, lx, ly) => ensureLib().lotTile(lot, lx, ly);
  const rectTiles = (lot, lx, ly, lw, lh) => ensureLib().lotRectTiles(lot, lx, ly, lw, lh);
  const rectCorners = (lot, lx, ly, lw, lh) => ensureLib().lotRectCorners(lot, lx, ly, lw, lh);
  /* The lot frame record every lot and building carries under `lot`: the bounding rect (x, y,
     w, h), the canonical size (cw, ch), rot, the center, the exact corners (clockwise from the
     canonical north-west corner), the door facing, and whether the lot is axis-aligned. */
  function frameRecord(lot, rec) {
    const r = rec.rect;
    return {
      id: lot.id, kind: lot.kind, x: r.x, y: r.y, w: r.w, h: r.h, cw: lot.w, ch: lot.h, rot: r.rot || 0,
      cx: r.cx, cy: r.cy, center: { x: r.cx, y: r.cy }, corners: copyPts(r.corners),
      facing: { x: r.facing.x, y: r.facing.y }, aligned: !!r.aligned, tiles: copyTiles(rec.tiles),
    };
  }

  /* ---------- map ---------- */
  // Tiles that must stay free of trees and flowers: within one tile of doors, stubs, stations,
  // seats, racks, the subway, the pier, the marina and the pond shore, plus the cafe terrace and
  // the back wall row of every building.
  let noTree = null, stubTiles = null;
  const protect = (x, y) => noTree.add(x + ',' + y);
  const protectRect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) protect(x, y); };
  const protectRing = (x0, y0, x1, y1) => protectRect(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  const protectTileRing = t => { if (t) protectRing(t.x, t.y, t.x, t.y); };
  const protectTiles = tiles => { for (const t of tiles || []) protectTileRing(t); };

  function buildMap() {
    const plan = PLAN, L = ensureLib();
    grid.fill(G);
    noTree = new Set();
    stubTiles = new Set();

    // 1. districts set tree density (first polygon containing the tile center wins, so the plan
    // order matters: the park before riverside, the valley last)
    districtIdx = new Int8Array(COLS * ROWS).fill(-1);
    (plan.districts || []).forEach((d, i) => { eachTileInPoly(d.pts, (x, y) => { if (districtIdx[y * COLS + x] < 0) districtIdx[y * COLS + x] = i; }); });

    // 2. the plan raster: water, spline roads and sidewalks, bridges, the plaza, rotated lots with
    // stubs and stations, the course with the island, the features and decks, mapped onto TILES
    const R = L.rasterizePlan(plan);
    if (R.cols !== COLS || R.rows !== ROWS) throw new Error('Thread Town: the raster is ' + R.cols + ' by ' + R.rows + ', the plan ' + COLS + ' by ' + ROWS);
    raster = R;
    const M = R.MARK;
    const markTile = new Uint8Array(64).fill(G);
    markTile[M.WATER] = WA; markTile[M.ROAD] = P; markTile[M.SIDEWALK] = SW; markTile[M.BRIDGE] = BR;
    markTile[M.PLAZA] = Z; markTile[M.GOLF] = G; markTile[M.BUILDING] = B; markTile[M.STUB] = P;
    markTile[M.PARKING] = PK; markTile[M.COURTYARD] = Z; markTile[M.FAIRWAY] = FW; markTile[M.GREEN] = GR;
    markTile[M.TEE] = TEE; markTile[M.SAND] = SA; markTile[M.PATH] = PT; markTile[M.CARTPATH] = CP;
    markTile[M.STATION] = G; markTile[M.DECK] = DK; markTile[M.FEATURE] = FT;
    for (let i = 0; i < COLS * ROWS; i++) grid[i] = markTile[R.grid[i]];
    lotIdx = Int16Array.from(R.lotIdx);

    // 3. roads and bridges on the state (sampled splines for the renderer and roads.js), then
    // crosswalks where streets meet
    state.roads = R.roads.map((r, i) => {
      const src = (plan.roads || [])[i] || {};
      const tiles = [];
      for (const k of r.tiles) { const [x, y] = k.split(',').map(Number); tiles.push({ x, y }); }
      return { id: r.id, name: src.name || r.id, kind: r.kind, width: r.width, sidewalks: !!src.sidewalks, purpose: src.purpose || '', pts: copyPts(src.pts), samples: copyPts(r.samples), length: r.length, tiles };
    });
    paintIntersectionCrosswalks(state.roads, R.roadIdx);
    state.bridges = (plan.bridges || []).map(b => {
      const [ax, ay] = b.a, [bx, by] = b.b;
      const offs = b.width >= 3 ? [-1, 0, 1] : b.width === 2 ? [-1, 0] : [0];
      const tiles = [];
      if (ax === bx) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (const o of offs) tiles.push({ x: ax + o, y });
      else if (ay === by) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (const o of offs) tiles.push({ x, y: ay + o });
      // v11: `arch` (the deck's hump at mid span) and `waterway` (the waterway the deck spans)
      return { id: b.id, name: b.name || b.id, kind: b.kind || 'low', width: b.width, island: !!b.island, a: [ax, ay], b: [bx, by], axis: ax === bx ? 'y' : 'x', tiles, arch: Number.isFinite(b.arch) ? b.arch : 0, waterway: b.waterway || null };
    });

    // v14: the span axis of every deck tile (1 along x, 2 along y, 0 off a deck): findPath lets
    // a walker on or off a deck along its span only, never sideways through the railing
    bridgeAxis = new Uint8Array(COLS * ROWS);
    for (const b of state.bridges) for (const t of b.tiles) if (t.x >= 0 && t.y >= 0 && t.x < COLS && t.y < ROWS) bridgeAxis[t.y * COLS + t.x] = b.axis === 'x' ? 1 : 2;

    // 4. lots in plan order (the raster's lot index matches): departments, the cafe, the
    // clubhouse, the pond, the fillers. Stub crosswalks are painted once every stub is known so
    // neighboring stubs share one crossing.
    const pendingStubs = [];
    (plan.lots || []).forEach((lot, i) => {
      const rec = R.lots[i];
      if (!rec || rec.id !== lot.id) throw new Error('Thread Town: raster lot ' + i + ' does not match plan lot ' + lot.id);
      if (lot.kind.startsWith('dept:')) {
        const d = TT.deptById[lot.kind.slice(5)];
        if (!d) throw new Error('Thread Town: the plan has a lot for an unknown department ' + lot.kind);
        buildDeptLot(d, lot, rec, pendingStubs);
      } else if (lot.kind === 'cafe') buildCafeLot(lot, rec, pendingStubs);
      else if (lot.kind === 'clubhouse') buildClubhouseLot(lot, rec, pendingStubs);
      else if (lot.kind === 'pond') buildPondLot(lot, rec, plan.pier);
      else buildFillerLot(lot, rec, pendingStubs);
    });
    for (const d of TT.DEPARTMENTS) if (!d.building) throw new Error('Thread Town: the plan has no lot for department ' + d.id);
    if (!state.pond) throw new Error('Thread Town: the plan has no pond lot');
    for (const s of pendingStubs) paintStubCrosswalk(s.end, s.dir);

    // 5. golf: nine holes, the range, the island (the raster painted the tiles)
    buildGolf(plan.golf, R);

    // 6. subway footprint and fountain basin (features in the raster), then the plaza tile list
    // and furniture
    {
      const s = plan.subway;
      state.subway = { tile: { x: s.x, y: s.y }, pos: { x: s.x + 0.5, y: s.y + 0.5 }, yaw: (s.rot || 0) * Math.PI / 180, rot: s.rot || 0 };
      protectRing(s.x - 1, s.y - 1, s.x, s.y + 1);
      const f = plan.fountain;
      const fountain = { x: f.x + 0.5, y: f.y + 0.5 };
      state.decos.push({ type: 'fountain', x: fountain.x, y: fountain.y });
      const plazaPts = plan.plaza.pts;
      let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
      eachTileInPoly(plazaPts, (x, y) => {
        px0 = Math.min(px0, x); py0 = Math.min(py0, y); px1 = Math.max(px1, x); py1 = Math.max(py1, y);
        if (at(x, y) === Z) state.plazaTiles.push({ x, y });
      });
      state.plaza = { x: px0, y: py0, w: px1 - px0 + 1, h: py1 - py0 + 1, pts: copyPts(plazaPts), fountain };
      // hangouts around the basin
      for (let y = f.y - 2; y <= f.y + 2; y++) for (let x = f.x - 2; x <= f.x + 2; x++) if (at(x, y) === Z) state.hangouts.push({ x, y, spot: 'plaza' });
      state.spawn = { x: plan.spawn.x, y: plan.spawn.y, pos: { x: plan.spawn.x + 0.5, y: plan.spawn.y + 0.5 } };
    }

    // 7. scooter racks, extra benches, boardwalk hangouts, the marina, the stairs
    for (const k of plan.scooterRacks || []) {
      const rack = { id: 'rack' + state.racks.length, x: k.x, y: k.y, pos: { x: k.x + 0.5, y: k.y + 0.5 }, near: k.near || '', slots: RACK_SLOTS, scooters: [], reserved: [], emptySince: null, returnBy: null, lastDispatch: -1e9 };
      for (let i = 0; i < RACK_SLOTS; i++) {
        const id = 'scooter' + state.scooters.length, p = rackSlotPos(rack, i);
        state.scooters.push({ id, x: p.x, y: p.y, yaw: SLOT_YAW, rackId: rack.id, rider: null, parked: true, reservedBy: null, v: state.scooters.length % 3 });
        rack.scooters.push(id); rack.reserved.push(null);
      }
      state.racks.push(rack);
      protectTileRing(k);
    }
    for (const s of plan.seatsExtra || []) {
      state.decos.push({ type: 'bench', x: s.x + 0.5, y: s.y + 0.5, face: { x: s.face.x, y: s.face.y } });
      addSeat(s.kind || 'bench', s.x, s.y, s.face);
    }
    for (const bw of plan.boardwalks || []) {
      const tiles = [];
      const pts = bw.pts;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= n; k++) {
          const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n);
          if (tiles.some(t => t.x === x && t.y === y)) continue;
          tiles.push({ x, y });
          if (walkable(x, y)) { state.hangouts.push({ x, y, spot: 'boardwalk' }); protect(x, y); }
        }
      }
      state.boardwalks.push({ id: bw.id, pts: copyPts(pts), axis: bw.axis || (pts.length > 1 && pts[0][0] === pts[1][0] ? 'y' : 'x'), tiles });
    }
    if (plan.marina && R.marina) {
      const mr = plan.marina, rm = R.marina;
      const deck = copyTiles(rm.deck);
      const last = deck.length ? deck[deck.length - 1] : rm.tile;
      state.marina = {
        tile: { x: rm.tile.x, y: rm.tile.y }, pos: { x: rm.tile.x + 0.5, y: rm.tile.y + 0.5 },
        rot: rm.rot, yaw: rm.rot * Math.PI / 180, dir: { x: rm.dir.x, y: rm.dir.y },
        deck, deckEnd: { x: last.x + 0.5, y: last.y + 0.5 }, slips: rm.slips, name: mr.name || 'Marina',
      };
      protectTileRing(rm.tile);
      protectTiles(deck);
      // the dock tiles and the shore tile are hangouts: a walk to the end of the dock
      for (const t of deck) if (walkable(t.x, t.y)) state.hangouts.push({ x: t.x, y: t.y, spot: 'marina' });
    }
    state.stairs = (plan.stairs || []).map(s => ({ id: s.id, from: { x: s.from[0], y: s.from[1] }, to: { x: s.to[0], y: s.to[1] }, drop: s.drop || 0 }));

    // 7b. v11: the waterways as the raster stamped them (their tiles are WA already), the weirs,
    // the docks with their boat slots and the four boats at start, the kickers, the kiosk, and
    // the boat water the visitor's boat and the validator share
    waterwayIdx = new Int8Array(COLS * ROWS).fill(-1);
    state.waterways = (R.waterways || []).map((w, i) => {
      const tiles = [];
      for (const k of w.tiles) {
        const [x, y] = k.split(',').map(Number);
        tiles.push({ x, y });
        if (waterwayIdx[y * COLS + x] < 0) waterwayIdx[y * COLS + x] = i;
      }
      return { id: w.id, body: w.body || w.id, width: w.width, level: w.level, bed: w.bed, slow: !!w.slow, tiles };
    });
    state.weirs = (plan.weirs || []).map(w => {
      // the lip runs `length` tiles along `axis` at the tile edge (x, y); the upper water (the
      // pond, or a plan water body like the river) lies on one side of the edge and `dir` points
      // the other way, down the step (the flow). A waterway may lie on both sides where it
      // enters the body, so the upper side is the one with more tiles of the upper body.
      const axis = w.axis === 'y' ? 'y' : 'x', len = w.length || 1;
      const upperAt = (x, y) => (lotAt(x, y) && lotAt(x, y).kind === 'pond' && at(x, y) === WA) || (plan.water || []).some(b => tileInPoly(x, y, b.pts));
      const side = (sx, sy) => { let n = 0; for (let i = 0; i < len; i++) { const x = axis === 'x' ? w.x + i : w.x + sx, y = axis === 'x' ? w.y + sy : w.y + i; if (upperAt(x, y)) n++; } return n; };
      const dir = axis === 'x' ? { x: 0, y: side(0, -1) >= side(0, 0) ? 1 : -1 } : { x: side(-1, 0) >= side(0, 0) ? 1 : -1, y: 0 };
      const tiles = [];
      for (let i = 0; i < len; i++) tiles.push(axis === 'x' ? { x: w.x + i, y: dir.y > 0 ? w.y : w.y - 1 } : { x: dir.x > 0 ? w.x : w.x - 1, y: w.y + i });
      return { id: w.id, x: w.x, y: w.y, axis, length: len, upper: w.upper, lower: w.lower, dir, yaw: Math.atan2(dir.x, dir.y), tiles, purpose: w.purpose || '' };
    });
    state.docks = (R.docks || []).map(d => {
      const rec = {
        id: d.id, name: d.name || d.id, x: d.tile.x, y: d.tile.y, tile: { x: d.tile.x, y: d.tile.y }, slip: { x: d.slip.x, y: d.slip.y },
        pos: { x: d.tile.x + 0.5, y: d.tile.y + 0.5 }, slipPos: { x: d.slip.x + 0.5, y: d.slip.y + 0.5 },
        dir: { x: d.dir.x, y: d.dir.y }, rot: d.rot, yaw: d.yaw, boat: null,
      };
      protectTileRing(rec.tile);
      return rec;
    });
    boatWater = (typeof L.boatWater === 'function') ? L.boatWater(R) : null;
    {
      // four boats at start, in docks; a plan without those docks moors them at its first docks
      const starts = BOATS_AT_START.filter(([id]) => dockById(id));
      const list = starts.length ? starts : state.docks.slice(0, 4).map((d, i) => [d.id, i % 2 ? 'rowboat' : 'launch']);
      for (const [dockId, kind] of list) {
        const d = dockById(dockId);
        if (!d || d.boat) continue;
        const id = 'boat' + state.boats.length;
        const b = { id, kind, name: (kind === 'launch' ? 'Launch ' : 'Rowboat ') + (state.boats.filter(o => o.kind === kind).length + 1), x: d.slipPos.x, y: d.slipPos.y, yaw: d.yaw, dockId: d.id, rider: null, parked: true, beached: false, bank: null, v: state.boats.length % 2 };
        state.boats.push(b);
        d.boat = id;
      }
    }
    kickerByTile = new Map();
    state.kickers = (R.kickers || []).map(k => {
      const rec = { id: k.id, name: k.name || k.id, foot: { x: k.foot.x, y: k.foot.y }, lip: { x: k.lip.x, y: k.lip.y }, launch: { x: k.launch.x, y: k.launch.y }, dir: { x: k.dir.x, y: k.dir.y }, rot: k.rot, yaw: k.yaw, pos: { x: k.foot.x + 0.5, y: k.foot.y + 0.5 }, tiles: [{ x: k.foot.x, y: k.foot.y }, { x: k.lip.x, y: k.lip.y }] };
      for (const t of rec.tiles) { protectTileRing(t); kickerByTile.set(t.x + ',' + t.y, rec); }
      return rec;
    });
    state.kiosk = null;
    if (R.kiosk) {
      const kk = R.kiosk;
      state.kiosk = { tile: { x: kk.tile.x, y: kk.tile.y }, front: { x: kk.front.x, y: kk.front.y }, pos: { x: kk.tile.x + 0.5, y: kk.tile.y + 0.5 }, frontPos: { x: kk.front.x + 0.5, y: kk.front.y + 0.5 }, rot: kk.rot, yaw: kk.yaw, name: (plan.kiosk && plan.kiosk.name) || 'Shop kiosk' };
      protectTileRing(state.kiosk.tile);
      protectTileRing(state.kiosk.front);
    }

    // plaza lamps at the corners, inset one tile, stepping inward off a rack or the basin
    {
      const pz = state.plaza;
      const rackAt = (x, y) => state.racks.some(r => r.x === x && r.y === y);
      for (const [cx, cy, dx] of [[pz.x + 1, pz.y + 1, 1], [pz.x + pz.w - 2, pz.y + 1, -1], [pz.x + 1, pz.y + pz.h - 2, 1], [pz.x + pz.w - 2, pz.y + pz.h - 2, -1]]) {
        let x = cx;
        while ((rackAt(x, cy) || at(x, cy) !== Z) && Math.abs(x - cx) < 4) x += dx;
        state.lamps.push({ x: x + 0.5, y: cy + 0.5 });
      }
    }

    // 8. swim spots (pond tiles whose four neighbors are pond tiles; v11: not any water, since the
    // creek mouth touches the pond) and shore tiles (grass next to pond water, so the creek mouth
    // tiles are not shore): the pond only. The river, the lake, the creek and the channel are for
    // looks, bridges, the marina, the boats and the island hole; hole water is a hazard.
    {
      const shore = new Set();
      const pondKeys = new Set(state.pond.tiles.map(t => t.x + ',' + t.y));
      for (const t of state.pond.tiles) {
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => pondKeys.has((t.x + dx) + ',' + (t.y + dy)))) state.swimSpots.push({ x: t.x, y: t.y });
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = t.x + dx, y = t.y + dy;
          if (at(x, y) !== G || shore.has(x + ',' + y)) continue;
          shore.add(x + ',' + y);
          state.shoreTiles.push({ x, y });
          protect(x, y);
          if (!(x === state.pier.tile.x && y === state.pier.tile.y)) state.hangouts.push({ x, y, spot: 'park' });
        }
        // the diagonal neighbors stay clear too, so the shore ring is one connected walk (the pond
        // lot grows trees, and the ring steps diagonally around the ellipse)
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (at(t.x + dx, t.y + dy) === G) protect(t.x + dx, t.y + dy);
      }
    }

    // seat tiles stay clear of trees and flowers
    for (const s of state.seats) protectTileRing(s);

    // 9. flowers and trees by district density: never on lots (the pond lot excepted: it is the
    // park itself), roads, sidewalks, paths, course tiles, water, plaza, decks, lamp tiles, or
    // within one tile of a door, stub, station, seat, rack, the subway, the marina or a course
    // tile. Trees are forest cores only: every one of the eight neighbors must be plain grass
    // before this pass, so no tree stands beside a road, a path, a deck or a building and the
    // walks through a forest stay open. The map border keeps a denser frame of trees.
    const r = TT.rng(1234567);
    const lampTiles = new Set(state.lamps.map(l => Math.floor(l.x) + ',' + Math.floor(l.y)));
    const holeWater = state.golf.holes.reduce((s, h) => { for (const t of h.water) s.add(t.x + ',' + t.y); return s; }, new Set());
    const nearCourse = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const v = at(x + dx, y + dy);
        if (courseType(v) || (v === WA && holeWater.has((x + dx) + ',' + (y + dy)))) return true;
      }
      return false;
    };
    const base = grid.slice();
    const baseAt = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS) ? G : base[y * COLS + x];
    const forestCore = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && baseAt(x + dx, y + dy) !== G) return false;
      return true;
    };
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (at(x, y) !== G) continue;
      const i = y * COLS + x;
      if (lotIdx[i] >= 0 && state.lots[lotIdx[i]].kind !== 'pond') continue;
      const key = x + ',' + y;
      if (noTree.has(key) || lampTiles.has(key)) continue;
      const d = districtIdx[i] >= 0 ? plan.districts[districtIdx[i]] : null;
      let p = d ? d.treeDensity : 0.10;
      const border = x <= 1 || y <= 1 || x >= COLS - 2 || y >= ROWS - 2;
      if (border) p = Math.max(p, 0.45);
      const pf = 0.03 + (d ? d.treeDensity : 0.10) * 0.15;
      const blocked = nearCourse(x, y);
      if (r() < p) { if (!blocked && forestCore(x, y)) { set(x, y, T); state.trees.push({ x, y, v: Math.floor(r() * 3) }); } else r(); }
      else if (r() < pf) { if (!blocked) set(x, y, F); }
    }

    // 10. water tiles for the renderer (v14: and the deck tiles that stand over water, the marina
    // planks, so the lake carries on under the dock instead of leaving a slot down to the bed)
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (at(x, y) === WA || (at(x, y) === DK && R.water && R.water[y * COLS + x] === 1)) state.waterTiles.push({ x, y });
  }

  /* Closest point on a segment and the intersection of two segments (or null). */
  function closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { x: ax + dx * t, y: ay + dy * t };
  }
  function segIntersect(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const qp = [c[0] - a[0], c[1] - a[1]];
    const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: a[0] + r[0] * t, y: a[1] + r[1] * t };
  }
  /* Thins a sampled spline to points at least `step` apart (the ends kept). */
  function thinSamples(samples, step) {
    const out = [];
    for (const p of samples) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= step) out.push(p); }
    const last = samples[samples.length - 1];
    if (last && out[out.length - 1] !== last) out.push(last);
    return out;
  }
  /* Junctions between street pairs (width 2 or more): a crossing of the sampled curves, or an
     end of one road within the two half widths plus one of the other (a T junction or a touch).
     Each carries a reach radius. Paths and cart paths have no sidewalks and get no crosswalks. */
  function roadJunctions(roads) {
    const out = [];
    const polys = roads.map(r => r.width >= 2 ? thinSamples(r.samples, 1) : null);
    for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
      const A = polys[i], Bp = polys[j];
      if (!A || !Bp || A.length < 2 || Bp.length < 2) continue;
      const reach = (roads[i].width + roads[j].width) / 2 + 2.5, touch = (roads[i].width + roads[j].width) / 2 + 1;
      for (let s = 0; s + 1 < A.length; s++) for (let t = 0; t + 1 < Bp.length; t++) {
        const p = segIntersect(A[s], A[s + 1], Bp[t], Bp[t + 1]);
        if (p) out.push({ x: p.x, y: p.y, r: reach });
      }
      // the ends of one road touching the other
      for (const [ends, other] of [[[A[0], A[A.length - 1]], Bp], [[Bp[0], Bp[Bp.length - 1]], A]]) for (const e of ends) {
        let best = Infinity, bp = null;
        for (let t = 0; t + 1 < other.length; t++) {
          const q = closestOnSeg(e[0], e[1], other[t][0], other[t][1], other[t + 1][0], other[t + 1][1]);
          const dist = Math.hypot(q.x - e[0], q.y - e[1]);
          if (dist < best) { best = dist; bp = { x: (q.x + e[0]) / 2, y: (q.y + e[1]) / 2 }; }
        }
        if (best <= touch) out.push({ x: bp.x, y: bp.y, r: reach });
      }
    }
    return out;
  }

  /* Crosswalks (CONTRACT_V7): one tile deep across each road where two roads meet. A run of road
     tiles in a column (or row) of at most four tiles, capped by sidewalk at both ends, with
     another road's paving beside one of the caps and a road junction within reach, is a sidewalk
     line crossing a road. A run next to a crosswalk already painted is skipped so a road end
     never gets two. roadIdx is the raster's per tile road index (-1 for none). */
  function paintIntersectionCrosswalks(roads, roadIdx) {
    const junctions = roadJunctions(roads);
    const nearJunction = (cx, cy) => junctions.some(j => Math.hypot(cx - j.x, cy - j.y) <= j.r);
    const paved = v => v === P || v === CW;
    const road = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS) ? -1 : roadIdx[y * COLS + x];
    const other = (x, y, ox, oy) => paved(at(ox, oy)) && road(ox, oy) !== road(x, y);
    for (let x = 0; x < COLS; x++) {
      let y = 0;
      while (y < ROWS) {
        if (at(x, y) !== P) { y++; continue; }
        let y1 = y; while (at(x, y1 + 1) === P) y1++;
        if (y1 - y + 1 <= 4 && at(x, y - 1) === SW && at(x, y1 + 1) === SW && nearJunction(x + 0.5, (y + y1 + 1) / 2)) {
          const perp = other(x, y, x - 1, y - 1) || other(x, y, x + 1, y - 1) || other(x, y1, x - 1, y1 + 1) || other(x, y1, x + 1, y1 + 1);
          let dup = false;
          for (let yy = y; yy <= y1; yy++) if (at(x - 1, yy) === CW || at(x + 1, yy) === CW) dup = true;
          if (perp && !dup) for (let yy = y; yy <= y1; yy++) set(x, yy, CW);
        }
        y = y1 + 1;
      }
    }
    for (let y = 0; y < ROWS; y++) {
      let x = 0;
      while (x < COLS) {
        if (at(x, y) !== P) { x++; continue; }
        let x1 = x; while (at(x1 + 1, y) === P) x1++;
        if (x1 - x + 1 <= 4 && at(x - 1, y) === SW && at(x1 + 1, y) === SW && nearJunction((x + x1 + 1) / 2, y + 0.5)) {
          const perp = other(x, y, x - 1, y - 1) || other(x, y, x - 1, y + 1) || other(x1, y, x1 + 1, y - 1) || other(x1, y, x1 + 1, y + 1);
          let dup = false;
          for (let xx = x; xx <= x1; xx++) if (at(xx, y - 1) === CW || at(xx, y + 1) === CW) dup = true;
          if (perp && !dup) for (let xx = x; xx <= x1; xx++) set(xx, y, CW);
        }
        x = x1 + 1;
      }
    }
  }

  /* A stub meeting a road: from the stub's mouth, past at most two sidewalk tiles, the road
     tiles in that line become a crosswalk one tile deep. The run stops at the first tile that is
     not street paving (another lot's stub included) and is skipped when a crosswalk already lies
     beside it, so neighboring stubs share one crossing. */
  function paintStubCrosswalk(end, dir) {
    if (!end || !dir || (!dir.x && !dir.y)) return;
    let x = end.x + dir.x, y = end.y + dir.y, guard = 0;
    while (at(x, y) === SW && guard++ < 2) { x += dir.x; y += dir.y; }
    const run = [];
    while ((at(x, y) === P || at(x, y) === CW) && !stubTiles.has(x + ',' + y) && run.length < 4) { run.push({ x, y }); x += dir.x; y += dir.y; }
    if (!run.length || at(x, y) === WA || at(x, y) === -1) return;
    const sx = dir.y !== 0 ? 1 : 0, sy = dir.x !== 0 ? 1 : 0;
    for (const t of run) if (at(t.x + sx, t.y + sy) === CW || at(t.x - sx, t.y - sy) === CW) return;
    for (const t of run) set(t.x, t.y, CW);
  }

  /* The stub of a raster lot record: the world tiles (door tile first, the road excluded), the
     mouth (the last stub tile, or the door tile when the door touches the street), the street
     tile it meets and the step toward it. Queues the crosswalk and protects the tiles. */
  function adoptStub(rec, pendingStubs) {
    const stub = copyTiles(rec.stub);
    const mouth = rec.stubMouth ? { x: rec.stubMouth.x, y: rec.stubMouth.y } : (rec.doorTile ? { x: rec.doorTile.x, y: rec.doorTile.y } : null);
    const road = rec.stubRoad ? { x: rec.stubRoad.x, y: rec.stubRoad.y } : null;
    const dir = (mouth && road) ? { x: Math.sign(road.x - mouth.x), y: Math.sign(road.y - mouth.y) } : null;
    for (const t of stub) { stubTiles.add(t.x + ',' + t.y); protectTileRing(t); }
    if (mouth && dir) pendingStubs.push({ end: mouth, dir });
    return { stub, mouth, road, dir, len: rec.stubLen };
  }
  /* The row just beyond a building's back (canonical north) wall stays clear of trees. */
  function protectBackWall(lot, bx, by, bw) { for (const t of rectTiles(lot, bx - 1, by - 1, bw + 2, 1)) protect(t.x, t.y); }
  const tileOr = (t, fallback) => t ? { x: t.x, y: t.y } : (fallback ? { x: fallback.x, y: fallback.y } : null);
  const posOf = p => p ? { x: p.x, y: p.y } : null;

  /* Department lot (canonical frame, from cityplan lotLayout): the footprint against the north
     side centered in the lot's inner width, the door pair at the footprint's center on its south
     row, the stub from the door tile to the nearest street, the 4 by 4 station one row below the
     footprint on the station side with a one tile gap to the stub, the work tile under the
     station's center. */
  function buildDeptLot(d, lot, rec, pendingStubs) {
    const Ly = rec.local;
    const bld0 = Ly.building, door = Ly.door, st = Ly.station;
    const foot = tilesBox(rec.footprint.tiles);
    const stBox = tilesBox(rec.station.tiles);
    const local = {
      x: bld0.x, y: bld0.y, w: bld0.w, h: bld0.h, door: { x: door.x, y: door.y }, door2: { x: door.x + 1, y: door.y },
      doorTile: { x: Ly.doorTiles[0].x, y: Ly.doorTiles[0].y }, doorTile2: { x: Ly.doorTiles[1].x, y: Ly.doorTiles[1].y },
      doorPos: { x: door.x + 1, y: door.y + 1.5 },
      station: { x: st.x, y: st.y, w: st.w, h: st.h, side: st.side },
      workTile: { x: Math.floor(Ly.work.x), y: Math.floor(Ly.work.y) }, workPos: { x: Ly.work.x, y: Ly.work.y },
      stub: { x: door.x, y: bld0.y + bld0.h, w: 2, h: lot.h - bld0.h },
    };
    const S = adoptStub(rec, pendingStubs);
    const rot = rec.rot || 0;
    const bld = {
      kind: 'dept', dept: d, x: foot.x, y: foot.y, w: foot.w, h: foot.h, rot,
      corners: copyPts(rec.footprint.corners), tiles: copyTiles(rec.footprint.tiles),
      door: tileOr(rec.door), door2: toTile(lot, door.x + 1, door.y),
      doorTile: tileOr(rec.doorTile), doorTile2: tileOr(rec.doorTile2, rec.doorTile),
      doorPos: posOf(rec.doorPos),
      station: { x: stBox.x, y: stBox.y, w: stBox.w, h: stBox.h, side: st.side, tiles: copyTiles(rec.station.tiles), corners: copyPts(rec.station.corners) },
      workTile: tileOr(rec.workTile),
      workPos: posOf(rec.workPos),
      facing: { x: rec.rect.facing.x, y: rec.rect.facing.y },
      // v9: the stub's last tile before the street and the side away from the stub, where riders
      // free-park when no rack is near; v10: the street tile the stub meets and its length
      stubMouth: S.mouth, stubSide: rotVec(rot, -1, 0), stubRoad: S.road, stubLen: S.len, stub: S.stub,
      lot: frameRecord(lot, rec), local,
      active: 0,
    };
    const lr = Object.assign(frameRecord(lot, rec), { building: bld, footprint: { x: foot.x, y: foot.y, w: foot.w, h: foot.h, tiles: copyTiles(rec.footprint.tiles), corners: copyPts(rec.footprint.corners) }, door: bld.door, door2: bld.door2, doorTile: bld.doorTile, doorTile2: bld.doorTile2, doorPos: bld.doorPos, stub: S.stub, stubMouth: S.mouth, stubRoad: S.road, stubLen: S.len, local, style: null, seed: 0 });
    state.lots.push(lr);
    protectTiles(bld.station.tiles);
    protectTileRing(bld.doorTile); protectTileRing(bld.doorTile2);
    protectBackWall(lot, bld0.x, bld0.y, bld0.w);
    state.buildings.push(bld);
    d.building = bld;
    return bld;
  }

  /* Cafe lot (canonical, needs at least 12 by 12): the 6 by 4 building against the north-west
     corner, the door pair at local (2, 3) and (3, 3), the stub from the door tiles, the terrace
     east of the building (local x 6..11, y 5..10) with four tables and eight stools, the free
     terrace tiles as cafe hangouts. */
  function buildCafeLot(lot, rec, pendingStubs) {
    const Ly = rec.local;
    const bld0 = Ly.building, door = Ly.door, terrace = Ly.terrace;
    const foot = tilesBox(rec.footprint.tiles);
    const terraceTiles = rectTiles(lot, terrace.x, terrace.y, terrace.w, terrace.h);
    const tb = tilesBox(terraceTiles);
    const S = adoptStub(rec, pendingStubs);
    const bld = {
      kind: 'cafe', name: 'Café', x: foot.x, y: foot.y, w: foot.w, h: foot.h, rot: rec.rot || 0,
      corners: copyPts(rec.footprint.corners), tiles: copyTiles(rec.footprint.tiles),
      door: tileOr(rec.door), door2: toTile(lot, door.x + 1, door.y),
      doorTile: tileOr(rec.doorTile), doorTile2: tileOr(rec.doorTile2, rec.doorTile),
      doorPos: posOf(rec.doorPos),
      terrace: { x: tb.x, y: tb.y, w: tb.w, h: tb.h, tiles: terraceTiles, corners: rectCorners(lot, terrace.x, terrace.y, terrace.w, terrace.h) },
      tables: [],
      facing: { x: rec.rect.facing.x, y: rec.rect.facing.y },
      stubMouth: S.mouth, stubRoad: S.road, stubLen: S.len, stub: S.stub,
      lot: frameRecord(lot, rec),
      local: { x: bld0.x, y: bld0.y, w: bld0.w, h: bld0.h, door: { x: door.x, y: door.y }, door2: { x: door.x + 1, y: door.y }, doorTile: { x: Ly.doorTiles[0].x, y: Ly.doorTiles[0].y }, doorTile2: { x: Ly.doorTiles[1].x, y: Ly.doorTiles[1].y }, doorPos: { x: door.x + 1, y: door.y + 1.5 }, terrace: { x: terrace.x, y: terrace.y, w: terrace.w, h: terrace.h }, stub: { x: door.x, y: bld0.y + bld0.h, w: 2, h: lot.h - bld0.h }, tables: [] },
      wall: '#F6E7C8', roof: '#E7706F', accent: '#75CCD0',
    };
    const lr = Object.assign(frameRecord(lot, rec), { building: bld, footprint: { x: foot.x, y: foot.y, w: foot.w, h: foot.h, tiles: copyTiles(rec.footprint.tiles), corners: copyPts(rec.footprint.corners) }, door: bld.door, door2: bld.door2, doorTile: bld.doorTile, doorTile2: bld.doorTile2, doorPos: bld.doorPos, stub: S.stub, stubMouth: S.mouth, stubRoad: S.road, stubLen: S.len, local: bld.local, style: null, seed: 0 });
    state.lots.push(lr);
    protectTileRing(bld.doorTile); protectTileRing(bld.doorTile2);
    protectBackWall(lot, bld0.x, bld0.y, bld0.w);
    // the whole terrace stays clear: paving, string-light posts, cart, counter, planter row
    protectTiles(terraceTiles);
    const tableTiles = new Set();
    for (const [tx, ty] of [[7, 6], [10, 6], [7, 9], [10, 9]]) {
      if (tx + 1 >= lot.w || ty >= lot.h) continue;
      const c = toWorld(lot, tx + 0.5, ty + 0.5);
      state.decos.push({ type: 'table', x: c.x, y: c.y });
      bld.tables.push({ x: c.x, y: c.y });
      bld.local.tables.push({ x: tx + 0.5, y: ty + 0.5 });
      const tt = toTile(lot, tx, ty);
      tableTiles.add(tt.x + ',' + tt.y); protect(tt.x, tt.y);
      const west = toTile(lot, tx - 1, ty), east = toTile(lot, tx + 1, ty);
      addSeat('cafe', west.x, west.y, c);
      addSeat('cafe', east.x, east.y, c);
    }
    // terrace tiles that are not tables or seats stay hangout targets as in v1
    const seatTiles = new Set(state.seats.filter(s => s.kind === 'cafe').map(s => s.x + ',' + s.y));
    for (const t of terraceTiles) {
      if (at(t.x, t.y) !== G || tableTiles.has(t.x + ',' + t.y) || seatTiles.has(t.x + ',' + t.y)) continue;
      state.hangouts.push({ x: t.x, y: t.y, spot: 'cafe' });
    }
    state.buildings.push(bld);
    state.cafe = bld;
    return bld;
  }

  /* Clubhouse lot (canonical 14 by 12 as today): the 6 by 4 building where plan.golf.clubhouse
     puts it (local (4, 1) in the plan), the door pair on its south row, a paved porch row, the
     stub to the street, the practice green west of the stub, two porch lamps (bulb only). Not a
     department: no station, no room. Version 8 (CONTRACT_V8 "Clubhouse start"): the record is
     the round start zone, so it carries doorTile, doorTile2 and doorPos exactly like a
     department record (world tiles after rotation); js/player.js reads them for the
     'E  Start a round' prompt. The cart spawns on the stub (rec.stub, world tiles). */
  function buildClubhouseLot(lot, rec, pendingStubs) {
    const Ly = rec.local;
    const bld0 = Ly.building, door = Ly.door, bx = bld0.x, by = bld0.y, bw = bld0.w, bh = bld0.h;
    const foot = tilesBox(rec.footprint.tiles);
    const porchTiles = rectTiles(lot, bx, by + bh, bw, 1);
    const pb = tilesBox(porchTiles);
    const green = { center: { x: bx - 1.0, y: by + 8.5 }, rx: 2.2, ry: 2.0, cup: { x: bx - 0.5, y: by + 8.5 } };
    const rot = rec.rot || 0;
    const swapR = rot === 90 || rot === 270;
    const S = adoptStub(rec, pendingStubs);
    const bld = {
      kind: 'clubhouse', name: 'Clubhouse', x: foot.x, y: foot.y, w: foot.w, h: foot.h, rot,
      corners: copyPts(rec.footprint.corners), tiles: copyTiles(rec.footprint.tiles),
      door: tileOr(rec.door), door2: toTile(lot, door.x + 1, door.y),
      doorTile: tileOr(rec.doorTile), doorTile2: tileOr(rec.doorTile2, rec.doorTile),
      doorPos: posOf(rec.doorPos),
      porch: { x: pb.x, y: pb.y, w: pb.w, h: pb.h, tiles: porchTiles, corners: rectCorners(lot, bx, by + bh, bw, 1) },
      facing: { x: rec.rect.facing.x, y: rec.rect.facing.y },
      stubMouth: S.mouth, stubRoad: S.road, stubLen: S.len, stub: S.stub,
      lot: frameRecord(lot, rec),
      local: { x: bx, y: by, w: bw, h: bh, door: { x: door.x, y: door.y }, door2: { x: door.x + 1, y: door.y }, doorTile: { x: Ly.doorTiles[0].x, y: Ly.doorTiles[0].y }, doorTile2: { x: Ly.doorTiles[1].x, y: Ly.doorTiles[1].y }, doorPos: { x: door.x + 1, y: door.y + 1.5 }, porch: { x: bx, y: by + bh, w: bw, h: 1 }, stub: { x: door.x, y: by + bh + 1, w: 2, h: lot.h - (by + bh + 1) }, practiceGreen: green },
      wall: '#F3EFE6', roof: '#75CCD0', accent: '#E7706F',
      practiceGreen: { center: toWorld(lot, green.center.x, green.center.y), rx: swapR ? green.ry : green.rx, ry: swapR ? green.rx : green.ry, rot, cup: toWorld(lot, green.cup.x, green.cup.y) },
    };
    const lr = Object.assign(frameRecord(lot, rec), { building: bld, footprint: { x: foot.x, y: foot.y, w: foot.w, h: foot.h, tiles: copyTiles(rec.footprint.tiles), corners: copyPts(rec.footprint.corners) }, door: bld.door, door2: bld.door2, doorTile: bld.doorTile, doorTile2: bld.doorTile2, doorPos: bld.doorPos, stub: S.stub, stubMouth: S.mouth, stubRoad: S.road, stubLen: S.len, local: bld.local, style: null, seed: 0 });
    state.lots.push(lr);
    // the porch is paving (the raster marks it as part of the stub)
    for (const t of porchTiles) if (at(t.x, t.y) === P || at(t.x, t.y) === G) set(t.x, t.y, Z);
    protectTileRing(bld.doorTile); protectTileRing(bld.doorTile2);
    protectBackWall(lot, bx, by, bw);
    // practice green: tiles of the lot whose center is inside the canonical ellipse, over rough only
    for (const t of rec.tiles) {
      const l = toLocal(lot, t.x + 0.5, t.y + 0.5);
      const nx = (l.x - green.center.x) / green.rx, ny = (l.y - green.center.y) / green.ry;
      if (nx * nx + ny * ny <= 1 && at(t.x, t.y) === G) set(t.x, t.y, GR);
    }
    // porch lamps: bulb only in the renderer (it lights the central crossings, plaza and park)
    for (const [lx, ly] of [[bx + 1.5, by + bh + 1.5], [bx + 4.5, by + bh + 1.5]]) { const p = toWorld(lot, lx, ly); state.lamps.push({ x: p.x, y: p.y, bulbOnly: true }); }
    state.buildings.push(bld);
    state.clubhouse = bld;
    return bld;
  }

  /* Filler lots. Parking is paved PK and courtyards Z over the whole footprint (the raster).
     Building fillers get a footprint across the lot's full width against the north side; lots at
     least seven deep keep a two row yard with the door pair and the stub, shallower ones put the
     door on the south edge (a stoop against the sidewalk). city.js dresses them from state.lots. */
  function buildFillerLot(lot, rec, pendingStubs) {
    const lr = Object.assign(frameRecord(lot, rec), { style: lot.style || null, seed: lot.seed || 0, footprint: null, door: null, door2: null, doorTile: null, doorTile2: null, doorPos: null, stub: [], stubMouth: null, stubRoad: null, stubLen: null, local: null });
    state.lots.push(lr);
    if (lot.kind === 'parking' || lot.kind === 'courtyard' || !rec.footprint) return lr;
    const Ly = rec.local;
    const bld0 = Ly.building, door = Ly.door, bw = bld0.w, bh = bld0.h, yard = Ly.yard || 0;
    const foot = tilesBox(rec.footprint.tiles);
    const S = adoptStub(rec, pendingStubs);
    lr.footprint = { x: foot.x, y: foot.y, w: foot.w, h: foot.h, tiles: copyTiles(rec.footprint.tiles), corners: copyPts(rec.footprint.corners) };
    lr.door = tileOr(rec.door); lr.door2 = toTile(lot, Math.min(bw - 1, door.x + 1), door.y);
    lr.doorTile = tileOr(rec.doorTile); lr.doorTile2 = tileOr(rec.doorTile2, rec.doorTile);
    lr.doorPos = posOf(rec.doorPos);
    lr.stub = S.stub; lr.stubMouth = S.mouth; lr.stubRoad = S.road; lr.stubLen = S.len;
    lr.local = { x: 0, y: 0, w: bw, h: bh, door: { x: door.x, y: door.y }, door2: { x: door.x + 1, y: door.y }, doorTile: { x: Ly.doorTiles[0].x, y: Ly.doorTiles[0].y }, doorTile2: { x: Ly.doorTiles[1].x, y: Ly.doorTiles[1].y }, doorPos: { x: door.x + 1, y: door.y + 1.5 }, stub: yard ? { x: door.x, y: bh, w: 2, h: yard } : null };
    if (yard) { protectTileRing(lr.doorTile); protectTileRing(lr.doorTile2); }
    protectBackWall(lot, 0, 0, bw);
    return lr;
  }

  /* The pond lot: the raster's ellipse (4.8 by 3.6 in the canonical frame) placed so the plan's
     pier tile is the shore tile at the end of the board, the pier record in today's shape, three
     benches and two lamps. The pond water stays water under the board (the pier is drawn over
     it), so swim spots and the landing keep their rules. */
  function buildPondLot(lot, rec, pierSpec) {
    const lr = Object.assign(frameRecord(lot, rec), { footprint: null, pond: null, pier: null, style: null, seed: 0, door: null, doorTile: null, doorTile2: null, doorPos: null, stub: [], local: null });
    state.lots.push(lr);
    const prot = pierSpec.rot || 0;
    const dir = rotVec(prot, 0, -1);                 // the board runs over the water this way
    const tiles = copyTiles(rec.pondTiles);
    for (const t of tiles) set(t.x, t.y, WA);
    const pondC = rec.pond || { center: { x: rec.cx, y: rec.cy }, rx: 4.8, ry: 3.6 };
    const center = { x: pondC.center.x, y: pondC.center.y };
    lr.pond = { center, rx: pondC.rx, ry: pondC.ry, tiles };
    const tileKeys = new Set(tiles.map(t => t.x + ',' + t.y));
    const shoreOf = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileKeys.has((x + dx) + ',' + (y + dy)));
    // the pond record on the state so the renderer sizes the pond dressing from the pond alone
    // (state.waterTiles also holds the river, the lake and the hole hazards)
    state.pond = lr.pond;
    const base = { x: pierSpec.x + 0.5, y: pierSpec.y + 0.5 };
    const pierTile = { x: pierSpec.x, y: pierSpec.y };
    const side = rotVec(prot, 1, 0);
    const pier = {
      tile: pierTile,
      base: { x: base.x, y: base.y },
      boardStart: { x: base.x + dir.x * 2.0, y: base.y + dir.y * 2.0 },
      boardEnd: { x: base.x + dir.x * 3.6, y: base.y + dir.y * 3.6 },
      landing: { x: base.x + dir.x * 5.5, y: base.y + dir.y * 5.5 },
      ladder: { x: base.x + side.x + dir.x, y: base.y + side.y + dir.y },
      height: 0.5,
      rot: prot, yaw: prot * Math.PI / 180, dir: { x: dir.x, y: dir.y },
    };
    // CONTRACT: the landing must be in the water; pull it back toward the pier until it is.
    let guard = 0;
    while (at(Math.floor(pier.landing.x), Math.floor(pier.landing.y)) !== WA && guard++ < 12) { pier.landing.x -= dir.x * 0.5; pier.landing.y -= dir.y * 0.5; }
    state.pier = pier;
    lr.pier = pier;
    protectRing(pierTile.x, pierTile.y, pierTile.x, pierTile.y);
    // a tree free walk from the pier to the lot's door edge (the lot keeps trees, see the tree pass)
    const lotKeys = new Set(rec.tiles.map(t => t.x + ',' + t.y));
    const f = rec.rect.facing;
    for (let x = pierTile.x, y = pierTile.y, g = 0; lotKeys.has(x + ',' + y) && g++ < 40; x += Math.round(f.x), y += Math.round(f.y)) protectTileRing({ x, y });
    // the lot's own benches on the north shore corners and the south-east, facing the pond
    for (const [lx, ly] of [[3.5, 1.5], [lot.w - 3.5, 1.5], [lot.w - 3.5, lot.h - 2.5]]) {
      const p = toWorld(lot, lx, ly);
      const tx = Math.floor(p.x), ty = Math.floor(p.y);
      if (at(tx, ty) !== G) continue;
      state.decos.push({ type: 'bench', x: p.x, y: p.y, face: { x: center.x, y: center.y } });
      addSeat('bench', tx, ty, center);
      // a tree free walk from the bench to the shore ring
      for (let x = tx, y = ty, guard = 0; at(x, y) === G && !shoreOf(x, y) && guard++ < 16;) { protect(x, y); if (Math.abs(center.x - (x + 0.5)) > Math.abs(center.y - (y + 0.5))) x += Math.sign(center.x - (x + 0.5)); else y += Math.sign(center.y - (y + 0.5)); }
    }
    for (const [lx, ly] of [[1.5, lot.h - 1.5], [lot.w - 1.5, 0.5]]) { const p = toWorld(lot, lx, ly); state.lamps.push({ x: p.x, y: p.y }); }
    return lr;
  }

  /* ---------- golf (CONTRACT_V10 "Thread National", nine holes from the plan) ---------- */
  /* The raster painted the course (rough, the island, fairways, greens, the sand collar, tees,
     bunkers, hazard water, the range). This builds state.golf in the record shape of version 5
     (plus line, fairwayWidth, bunkers, elev, story, and on the island hole island, collarR and
     bridge). parkBounds covers the whole area on both banks (upper edges exclusive). */
  function buildGolf(g, R) {
    const area = g.area.pts;
    const ab = polyBounds(area);
    const parkBounds = { x0: Math.max(0, ab.x0), y0: Math.max(0, ab.y0), x1: Math.min(COLS, ab.x1), y1: Math.min(ROWS, ab.y1) };
    const holes = [];
    for (const h of g.holes) {
      const hw = (h.fairwayWidth || 5) / 2;
      const cr = h.greenR || 2.5;
      const collar = h.collarR || 0;
      const cup = { x: h.cup.x + 0.5, y: h.cup.y + 0.5 };
      // the hole block: the fairway corridor, the green and its collar, the tee and the bunkers
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const grow = (x, y, rad) => { x0 = Math.min(x0, x - rad); y0 = Math.min(y0, y - rad); x1 = Math.max(x1, x + rad); y1 = Math.max(y1, y + rad); };
      for (const p of h.line || []) grow(p[0] + 0.5, p[1] + 0.5, hw);
      grow(cup.x, cup.y, cr + collar);
      grow(h.tee.x + 1, h.tee.y + 1, 1);
      for (const bk of h.bunkers || []) grow(bk.x + 0.5, bk.y + 0.5, bk.r);
      const water = [];
      for (const w of h.water || []) eachTileInPoly(w.pts, (x, y) => { if (at(x, y) === WA) { water.push({ x, y }); grow(x + 0.5, y + 0.5, 0.5); } });
      let island = null;
      if (h.island && h.island.pts) {
        const tiles = R.islandTiles.filter(t => tileInPoly(t.x, t.y, h.island.pts)).map(t => ({ x: t.x, y: t.y }));
        island = { pts: copyPts(h.island.pts), height: h.island.height || 0, tiles };
        for (const t of tiles) grow(t.x + 0.5, t.y + 0.5, 0.5);
      }
      const bounds = { x0: Math.max(parkBounds.x0, Math.floor(x0) - 2), y0: Math.max(parkBounds.y0, Math.floor(y0) - 2), x1: Math.min(parkBounds.x1, Math.ceil(x1) + 2), y1: Math.min(parkBounds.y1, Math.ceil(y1) + 2) };
      const tee = { x: h.tee.x + 1, y: h.tee.y + 1 };
      holes.push({
        n: h.n, name: h.name, par: h.par,
        tee, teeTile: { x: h.tee.x, y: h.tee.y }, cup, cupTile: { x: h.cup.x, y: h.cup.y }, greenCenter: { x: cup.x, y: cup.y },
        greenR: cr, greenRx: cr, greenRy: cr, collarR: collar,
        elev: h.tee.elev || 0, story: h.story || '',
        bounds, water,
        length: Math.round(Math.hypot(cup.x - tee.x, cup.y - tee.y) * 10) / 10,
        line: copyPts(h.line), fairwayWidth: h.fairwayWidth || 5,
        bunkers: (h.bunkers || []).map(bk => ({ x: bk.x + 0.5, y: bk.y + 0.5, r: bk.r })),
        island, bridge: h.bridge || null,
      });
    }

    // Driving range: canonical frame with the tee line along the south edge hitting north, open
    // fairway in front of it, one tile of rough on each side (the raster painted it).
    let range = null;
    if (g.range) {
      const rg = g.range, rot = rg.rot || 0, swap = rot === 90 || rot === 270;
      const ww = swap ? rg.h : rg.w, hh = swap ? rg.w : rg.h;
      const rl = { id: 'range', kind: 'range', cx: rg.x + ww / 2, cy: rg.y + hh / 2, w: rg.w, h: rg.h, rot };
      const teeLine = [];
      for (let lx = 1; lx < rg.w - 1; lx++) teeLine.push(toWorld(rl, lx + 0.5, rg.h - 0.5));
      const fairway = tilesBox(rectTiles(rl, 1, 0, rg.w - 2, rg.h - 1));
      const all = tilesBox(rectTiles(rl, 0, 0, rg.w, rg.h));
      const depth = rg.h - 1;
      const markers = [4, 7, 10].filter(m => m <= depth);
      range = {
        teeLine, bounds: { x0: all.x, y0: all.y, x1: all.x + all.w, y1: all.y + all.h },
        fairway: { x0: fairway.x, y0: fairway.y, x1: fairway.x + fairway.w, y1: fairway.y + fairway.h },
        markers, rot, dir: rotVec(rot, 0, -1),
        lot: { id: 'range', kind: 'range', x: all.x, y: all.y, w: all.w, h: all.h, cw: rg.w, ch: rg.h, rot, cx: rl.cx, cy: rl.cy, center: { x: rl.cx, y: rl.cy }, corners: rectCorners(rl, 0, 0, rg.w, rg.h), facing: rotVec(rot, 0, 1), aligned: rot % 90 === 0 },
      };
    }

    state.golf = {
      name: g.name || 'Thread National',
      holes, clubhouse: state.clubhouse, range,
      // the out-of-bounds test for hole play and the clamp for the walking phase (upper edges exclusive)
      parkBounds,
      area: copyPts(area),
      entranceSign: g.entranceSign ? { x: g.entranceSign.x, y: g.entranceSign.y, rot: g.entranceSign.rot || 0 } : null,
      par: holes.reduce((s, h) => s + h.par, 0),
    };
  }

  function addSeat(kind, x, y, face) {
    state.seats.push({ id: 'seat' + state.seats.length, kind, x, y, face: { x: face.x, y: face.y }, takenBy: null });
  }

  /* District id at a tile, or null; the lot record at a tile, or null. */
  function districtAt(x, y) {
    if (!districtIdx || x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    const i = districtIdx[y * COLS + x];
    return i >= 0 ? PLAN.districts[i].id : null;
  }
  function lotAt(x, y) {
    if (!lotIdx || x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    const i = lotIdx[y * COLS + x];
    return i >= 0 ? state.lots[i] : null;
  }

  /* ---------- pathfinding ---------- */
  function findPath(sx, sy, tx, ty) {
    if (!walkable(tx, ty)) return null;
    if (sx === tx && sy === ty) return [];
    parent.fill(-2);
    let qh = 0, qt = 0;
    const si = sy * COLS + sx, ti = ty * COLS + tx;
    parent[si] = -1; queue[qt++] = si;
    const dirs = [1, -1, COLS, -COLS];
    while (qh < qt) {
      const cur = queue[qh++];
      if (cur === ti) break;
      const cx = cur % COLS;
      for (const d of dirs) {
        const n = cur + d;
        if (n < 0 || n >= COLS * ROWS) continue;
        if ((d === 1 && cx === COLS - 1) || (d === -1 && cx === 0)) continue;
        if (parent[n] !== -2 || !walkableType(grid[n])) continue;
        // v14: a deck is entered and left along its span (a bank tile beside a deck is across a railing)
        if (bridgeAxis && bridgeAxis[cur] !== bridgeAxis[n]) { const ax = bridgeAxis[cur] || bridgeAxis[n]; if (ax === 1 ? (d === COLS || d === -COLS) : (d === 1 || d === -1)) continue; }
        parent[n] = cur; queue[qt++] = n;
      }
    }
    if (parent[ti] === -2) return null;
    const path = [];
    for (let i = ti; i !== si; i = parent[i]) path.push({ x: i % COLS, y: Math.floor(i / COLS) });
    return path.reverse();
  }

  /* ---------- agents ---------- */
  function now() { return state.time; }
  function tileOf(a) { return { x: Math.floor(a.pos.x), y: Math.floor(a.pos.y) }; }

  /* Writes the normalized step vector into agent.moveDir. Simulation y is world z. */
  function setMoveDir(a, dx, dy) {
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    a.moveDir.x = dx / d; a.moveDir.z = dy / d;
  }

  function makeAgent(spec) {
    const dept = TT.deptById[spec.dept] || TT.DEPARTMENTS[0];
    const a = {
      id: spec.id || ('a' + TT.hash(spec.name + spec.role + Math.random()).toString(36)),
      spec, dept,
      pos: { x: 0, y: 0 }, facing: 1, frame: 0, animT: 0, yoff: 0,
      state: 'idle', path: [], waitUntil: 0, job: null, bubble: null,
      history: [], blinkAt: 0, lookAt: 0,
      // v2: pose and leisure
      pose: 'stand', leisure: null, paused: false, lastLeisureAt: -1e9,
      onBoard: false, jumpT: 0, splash: -1,
      // v9: the ridden scooter id (or null), the trip leg ('toScooter', 'riding', 'walk' or null)
      // and the private trip record (destination, ride and walk paths, park spot)
      scooter: null, leg: null, trip: null,
      // CONTRACT: mesh and avatarURL are set by the renderer; moveDir starts facing the camera (+z).
      mesh: undefined, avatarURL: undefined,
      moveDir: { x: 0, z: 1 },
    };
    // spawn somewhere walkable in the plaza
    const r = TT.rng(TT.hash(a.id));
    a.speed = 1.25 + r() * 0.7; // each alien strolls at its own pace
    const spots = state.plazaTiles.filter(t => walkable(t.x, t.y));
    const s = spots[Math.floor(r() * spots.length)];
    // Assign into the existing pos object so a renderer holding a reference keeps tracking it.
    a.pos.x = s.x + 0.5; a.pos.y = s.y + 0.5;
    a.waitUntil = r() * 3;
    return a;
  }

  function seedHistory(a) {
    const r = TT.rng(TT.hash('hist' + a.id));
    const c = (a.spec.cadence || '').toLowerCase();
    let n;
    if (c.includes('hourly')) n = 40 + Math.floor(r() * 30);
    else if (c.includes('daily') || c.includes('nightly')) n = 5 + Math.floor(r() * 3);
    else if (c.includes('mon / wed')) n = 3;
    else if (c.includes('fridays') || c.includes('mondays')) n = 1;
    else if (c.includes('quarterly')) n = Math.floor(r() * 2);
    else n = 2 + Math.floor(r() * 8);
    const nowMs = Date.now();
    for (let i = 0; i < n; i++) {
      const pick = TT.TASKS[a.spec.anim] || TT.TASKS.write;
      const [task, result] = pick[Math.floor(r() * pick.length)];
      const ok = r() > 0.08;
      a.history.push({ at: nowMs - r() * 7 * 86400000, task, result: ok ? result : TT.FAIL_RESULTS[Math.floor(r() * TT.FAIL_RESULTS.length)], ok, ms: 20000 + r() * 400000 });
    }
    a.history.sort((p, q) => q.at - p.at);
  }

  function log(text, kind, agent) {
    state.events.unshift({ at: Date.now(), text, kind: kind || 'info', agentId: agent && agent.id });
    if (state.events.length > 80) state.events.pop();
  }
  TT.log = log;

  /* ---------- leisure helpers ---------- */
  /* Only the holder may free a seat: a seat reserved by the player (CONTRACT_V4) stays put
     when an agent is removed or sent to work. */
  function freeSeat(a) {
    const L = a.leisure;
    if (L && L.seat && L.seat.takenBy === a.id) L.seat.takenBy = null;
  }

  /* Seat reservation for the player (CONTRACT_V4 "Sim additions"). */
  function reserveSeat(seatId, holderId) {
    const seat = state.seats.find(s => s.id === seatId);
    if (!seat || seat.takenBy) return null;
    seat.takenBy = holderId;
    return seat;
  }
  function releaseSeat(seatId, holderId) {
    const seat = state.seats.find(s => s.id === seatId);
    if (seat && seat.takenBy === holderId) seat.takenBy = null;
  }
  /* True for ground the player may stand on: grass, paths, plaza paving, flowers, sidewalks,
     crosswalks, parking, bridge decks and the course tiles (fairway, green, sand, tee). Water and
     pier rules live in js/player.js. Accepts fractional coordinates. */
  function isEnterable(x, y) { return enterableType(at(Math.floor(x), Math.floor(y))); }

  function clearLeisure(a) {
    freeSeat(a);
    a.leisure = null;
    a.onBoard = false;
    a.jumpT = 0;
  }

  function isWorkaholic(a) { return (a.spec.cadence || '').toLowerCase().includes('hourly'); }

  function randomSwimSpot() { return state.swimSpots[Math.floor(Math.random() * state.swimSpots.length)]; }

  function nearestShoreTile(x, y) {
    let best = null, bd = Infinity;
    for (const s of state.shoreTiles) {
      const d = Math.hypot(s.x + 0.5 - x, s.y + 0.5 - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /* The water tile next to a shore tile, preferring the one nearest (x, y). Returns its
     center and the midpoint of the shared edge, both in tile units. */
  function waterNextTo(shore, x, y) {
    let best = null, bd = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = shore.x + dx, ny = shore.y + dy;
      if (at(nx, ny) !== WA) continue;
      const d = Math.hypot(nx + 0.5 - x, ny + 0.5 - y);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
    if (!best) best = { x: shore.x, y: shore.y };
    const cx = shore.x + 0.5, cy = shore.y + 0.5;
    const wx = best.x + 0.5, wy = best.y + 0.5;
    return { center: { x: wx, y: wy }, edge: { x: (cx + wx) / 2, y: (cy + wy) / 2 } };
  }

  /* Moves straight toward a point (tile units) ignoring the grid. Returns true on arrival. */
  function glideTo(a, dt, target, speed) {
    const dx = target.x - a.pos.x, dy = target.y - a.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    setMoveDir(a, dx, dy);
    if (Math.abs(dx) > 0.05) a.facing = dx > 0 ? 1 : -1;
    const step = speed * dt;
    if (d <= step) { a.pos.x = target.x; a.pos.y = target.y; return true; }
    a.pos.x += dx / d * step; a.pos.y += dy / d * step;
    return false;
  }

  /* Rolls for cafe, swim or bench when an idle agent finishes a wait. Returns true when
     a leisure trip was started (path set), false to wander as before. */
  function decideLeisure(a, t) {
    const L = TT.sim.LEISURE || LEISURE;
    const m = isWorkaholic(a) ? 0.5 : 1;
    const roll = Math.random();
    let kind = null;
    if (roll < L.CAFE * m) {
      if (t - a.lastLeisureAt > 20 && state.seats.some(s => s.kind === 'cafe' && !s.takenBy)) kind = 'cafe';
    } else if (roll < (L.CAFE + L.SWIM) * m) {
      if (state.swimSpots.length && state.pier) kind = 'swim';
    } else if (roll < (L.CAFE + L.SWIM + L.BENCH) * m) {
      if (state.seats.some(s => s.kind === 'bench' && !s.takenBy)) kind = 'bench';
    }
    if (!kind) return false;
    const s = tileOf(a);
    if (kind === 'swim') {
      const dive = Math.random() < 0.75;
      const target = dive ? state.pier.tile : state.shoreTiles[Math.floor(Math.random() * state.shoreTiles.length)];
      const p = findPath(s.x, s.y, target.x, target.y);
      if (!p) return false;
      a.leisure = { kind: 'swim', seat: null, until: 0, phase: 'going', spot: null, dive, shore: dive ? null : target, water: null, pendingJob: null, t0: 0 };
      a.path = p;
      planRide(a, s, target, p, null); // v9: a far trip rides
      return true;
    }
    const free = state.seats.filter(x => x.kind === kind && !x.takenBy);
    const seat = free[Math.floor(Math.random() * free.length)];
    const p = findPath(s.x, s.y, seat.x, seat.y);
    if (!p) return false;
    seat.takenBy = a.id;
    a.leisure = { kind: kind === 'bench' ? 'bench' : (Math.random() < 0.5 ? 'icecream' : 'coffee'), seat, until: 0, phase: 'going', spot: null, dive: false, t0: 0 };
    a.path = p;
    planRide(a, s, seat, p, null); // v9: a far trip rides
    return true;
  }

  function startSwimming(a, t) {
    const L = a.leisure;
    a.onBoard = false; a.jumpT = 0; a.splash = t;
    L.phase = 'swimming'; L.until = t + 14 + Math.random() * 16; L.spot = randomSwimSpot();
    a.pose = 'swim'; a.frame = 0;
  }

  /* Called when an idle agent with a pending leisure trip reaches the end of its path. */
  function arriveLeisure(a, t) {
    const L = a.leisure;
    a.state = 'leisure';
    if (L.kind === 'swim') {
      if (L.dive) {
        const pier = state.pier;
        a.pos.x = pier.base.x; a.pos.y = pier.base.y;
        L.phase = 'boarding'; a.onBoard = true; a.pose = 'walk';
      } else {
        // waders walk from the shore tile into the neighboring water tile before swimming,
        // so the swim pose never shows on grass
        const shore = L.shore || nearestShoreTile(a.pos.x, a.pos.y);
        L.water = waterNextTo(shore, a.pos.x, a.pos.y).center;
        L.phase = 'wading'; a.pose = 'walk';
      }
      return;
    }
    const seat = L.seat;
    a.pos.x = seat.x + 0.5; a.pos.y = seat.y + 0.5;
    L.phase = 'seated'; L.until = t + 12 + Math.random() * 14;
    a.pose = 'sit'; a.frame = 0;
    const dx = seat.face.x - a.pos.x, dy = seat.face.y - a.pos.y;
    setMoveDir(a, dx, dy);
    if (Math.abs(dx) > 0.05) a.facing = dx > 0 ? 1 : -1;
  }

  function endLeisure(a, t, pos) {
    clearLeisure(a);
    if (pos) { a.pos.x = pos.x; a.pos.y = pos.y; }
    a.lastLeisureAt = t;
    a.state = 'idle'; a.waitUntil = t + 0.5; a.path = [];
    a.pose = 'stand'; a.frame = 0;
  }

  /* ---------- scooters (CONTRACT_V9 "Scooter entities") ---------- */
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  function scooterById(id) { return id ? state.scooters.find(s => s.id === id) || null : null; }
  function rackById(id) { return id ? state.racks.find(r => r.id === id) || null : null; }
  function agentById(id) { return id ? state.agents.find(a => a.id === id) || null : null; }
  /* Pulls a scooter out of whatever rack slot holds it. */
  function unslot(sc) {
    for (const r of state.racks) { const i = r.scooters.indexOf(sc.id); if (i >= 0) r.scooters[i] = null; }
    sc.rackId = null;
  }

  /* Puts a scooter under a rider ('player' or an agent id). Returns the scooter, or null when it
     does not exist or someone else rides it. Taking a scooter an agent was walking to cancels that
     agent's claim (it walks instead). */
  function takeScooter(scooterId, riderId) {
    const sc = scooterById(scooterId);
    if (!sc || riderId === undefined || riderId === null) return null;
    if (sc.rider) return sc.rider === riderId ? sc : null;
    unslot(sc);
    sc.parked = false; sc.rider = riderId; sc.reservedBy = null;
    return sc;
  }

  /* The slot a rider may use in a rack: one it reserved, then an unclaimed one, then any empty
     one (the player may take a slot an agent claimed; that agent parks elsewhere). -1 if full. */
  function slotFor(rack, rider) {
    let open = -1, claimed = -1;
    for (let i = 0; i < rack.slots; i++) {
      if (rack.scooters[i]) continue;
      if (rider && rack.reserved[i] === rider) return i;
      if (!rack.reserved[i]) { if (open < 0) open = i; } else if (claimed < 0) claimed = i;
    }
    return open >= 0 ? open : claimed;
  }

  /* Parks a scooter at (x, y, yaw): it slots into the nearest rack within 2 tiles that has a free
     slot, else it free-parks right there (rackId null). Clears the rider (and agent.scooter for an
     agent rider). Returns the scooter, or null when it does not exist. */
  function parkScooter(scooterId, x, y, yaw) {
    const sc = scooterById(scooterId);
    if (!sc) return null;
    if (!finite(x) || !finite(y)) { x = sc.x; y = sc.y; }
    if (!finite(yaw)) yaw = finite(sc.yaw) ? sc.yaw : SLOT_YAW;
    const rider = sc.rider;
    unslot(sc);
    let rack = null, slot = -1;
    const near = state.racks.map(r => ({ r, d: Math.hypot(r.pos.x - x, r.pos.y - y) })).filter(o => o.d <= RIDE.SLOT_REACH).sort((p, q) => p.d - q.d);
    for (const o of near) { const i = slotFor(o.r, rider); if (i >= 0) { rack = o.r; slot = i; break; } }
    if (rack) {
      rack.scooters[slot] = sc.id;
      if (rack.reserved[slot]) rack.reserved[slot] = null;
      const p = rackSlotPos(rack, slot);
      sc.x = p.x; sc.y = p.y; sc.yaw = SLOT_YAW; sc.rackId = rack.id;
    } else {
      sc.x = x; sc.y = y; sc.yaw = yaw; sc.rackId = null;
    }
    sc.parked = true; sc.rider = null; sc.reservedBy = null;
    const a = rider && rider !== 'player' ? agentById(rider) : null;
    if (a && a.scooter === sc.id) a.scooter = null;
    return sc;
  }

  /* The nearest parked scooter nobody rides within maxDist (default unlimited) of (x, y), or null.
     Agents planning a ride also skip scooters another agent is walking to (opts.forAgent). */
  function nearestFreeScooter(x, y, maxDist, opts) {
    const lim = finite(maxDist) ? maxDist : Infinity;
    const who = opts && opts.forAgent;
    let best = null, bd = Infinity;
    for (const sc of state.scooters) {
      if (!sc.parked || sc.rider) continue;
      if (who && sc.reservedBy && sc.reservedBy !== who) continue;
      const d = Math.hypot(sc.x - x, sc.y - y);
      if (d <= lim && d < bd) { bd = d; best = sc; }
    }
    return best;
  }

  /* The nearest rack to (x, y) by its tile center, optionally within maxDist, or null. */
  function nearestRack(x, y, maxDist) {
    const lim = finite(maxDist) ? maxDist : Infinity;
    let best = null, bd = Infinity;
    for (const r of state.racks) { const d = Math.hypot(r.pos.x - x, r.pos.y - y); if (d <= lim && d < bd) { bd = d; best = r; } }
    return best;
  }

  /* A free-parking spot inside a tile: off center toward side first (when given), then the other
     spots of a three by three grid 0.3 apart, so scooters left on the same tile do not overlap and
     never leave the tile. */
  function freeSpot(tile, side, along, selfId) {
    const sx = side ? side.x : 0, sy = side ? side.y : 1;
    const ax = along ? along.x : (side ? -side.y : 1), ay = along ? along.y : (side ? side.x : 0);
    const cx = tile.x + 0.5, cy = tile.y + 0.5;
    let first = null;
    for (const s of side ? [0.3, 0, -0.3] : [0, 0.3, -0.3]) for (const k of [0, -0.3, 0.3]) {
      const x = cx + sx * s + ax * k, y = cy + sy * s + ay * k;
      if (!first) first = { x, y };
      if (!state.scooters.some(o => o.id !== selfId && o.parked && Math.hypot(o.x - x, o.y - y) < 0.25)) return { x, y };
    }
    return first;
  }

  /* ---------- boats (CONTRACT_V11 "Boats") and the hoverboard's sim parts ---------- */
  /* Boat tuning for js/vehicles.js and js/player.js, exposed on TT.sim.BOAT: top speeds by kind,
     reverse, acceleration, the turn rates at speed and at a crawl, the slow zone cap, the tie up
     reach, the hull radius and how far beachBoat looks for a bank. */
  const BOAT = { LAUNCH_MAX: 6, ROWBOAT_MAX: 4, REVERSE: 2, ACCEL: 3, TURN_FAST: 1.1, TURN_SLOW: 0.5, SLOW_MAX: 3, DOCK_REACH: 2, RADIUS: 0.5, BEACH_REACH: 12 };
  const BOATS_AT_START = [['marina-1', 'launch'], ['marina-2', 'rowboat'], ['pier-east', 'rowboat'], ['river-landing', 'launch']];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let waterwayIdx = null, boatWater = null, kickerByTile = null;
  function boatById(id) { return id ? state.boats.find(b => b.id === id) || null : null; }
  function dockById(id) { return id ? state.docks.find(d => d.id === id) || null : null; }
  /* The waterway record under a tile (fractional coordinates accepted), or null. */
  function waterwayAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!waterwayIdx || tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
    const i = waterwayIdx[ty * COLS + tx];
    return i >= 0 ? state.waterways[i] : null;
  }
  /* True in a boat slow zone (the creek). */
  function slowWaterAt(x, y) { const w = waterwayAt(x, y); return !!(w && w.slow); }
  /* True where a boat may float: the shared boat mask (water less the island, the planks and the
     pond swim area), or any water tile before the map is built. */
  function boatWaterAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    return boatWater ? boatWater.at(tx, ty) === 1 : at(tx, ty) === WA;
  }
  /* True when the boat water under (x, y) is reached from the marina by the water BFS. */
  function waterReachable(x, y) { return !!boatWater && boatWater.reaches(Math.floor(x), Math.floor(y)); }
  /* Frees the dock slot holding a boat. */
  function unmoor(b) {
    for (const d of state.docks) if (d.boat === b.id) d.boat = null;
    b.dockId = null;
  }
  /* Puts a boat under a rider ('player' or an id). Returns the boat, or null when it does not
     exist or someone else rides it. The boat leaves its dock or its beach. */
  function takeBoat(boatId, riderId) {
    const b = boatById(boatId);
    if (!b || riderId === undefined || riderId === null) return null;
    if (b.rider) return b.rider === riderId ? b : null;
    unmoor(b);
    b.parked = false; b.beached = false; b.bank = null; b.rider = riderId;
    return b;
  }
  /* The nearest dock to (x, y) by its slip center, within maxDist (default unlimited); a dock
     whose slip is farther than its tile is skipped (the point is on the far side of the deck, so
     the boat would be hauled through it). opts.free keeps only docks without a boat (or holding
     opts.forBoat). Null when none. The same rule as the player's pickDock. */
  function nearestDock(x, y, maxDist, opts) {
    const lim = finite(maxDist) ? maxDist : Infinity;
    const free = !!(opts && opts.free), forBoat = opts && opts.forBoat;
    let best = null, bd = Infinity;
    for (const d of state.docks) {
      if (free && d.boat && d.boat !== forBoat) continue;
      const dist = Math.hypot(d.slipPos.x - x, d.slipPos.y - y);
      if (dist > lim || dist >= bd) continue;
      if (dist > Math.hypot(d.pos.x - x, d.pos.y - y) + 1e-6) continue;
      bd = dist; best = d;
    }
    return best;
  }
  /* Ties a boat up: in the dock named, else the nearest free dock within BOAT.DOCK_REACH of the
     boat. The boat moves to the slip, takes the dock's yaw and loses its rider. Returns the boat,
     or null when the dock is missing or taken. */
  function dockBoat(boatId, dockId) {
    const b = boatById(boatId);
    if (!b) return null;
    const d = dockId ? dockById(dockId) : nearestDock(b.x, b.y, BOAT.DOCK_REACH, { free: true, forBoat: b.id });
    if (!d || (d.boat && d.boat !== b.id)) return null;
    unmoor(b);
    d.boat = b.id; b.dockId = d.id;
    b.x = d.slipPos.x; b.y = d.slipPos.y; b.yaw = d.yaw;
    b.parked = true; b.beached = false; b.bank = null; b.rider = null;
    return b;
  }
  /* The nearest boat water tile to (x, y) with a dry 4-neighbour (not water, not a bridge deck),
     within maxDist, and that neighbour: { water, dry }. Null when none. */
  function nearestBank(x, y, maxDist) {
    const cx = Math.floor(x), cy = Math.floor(y), R = Math.ceil(maxDist);
    let best = null, bd = Infinity;
    for (let ty = cy - R; ty <= cy + R; ty++) for (let tx = cx - R; tx <= cx + R; tx++) {
      if (!boatWaterAt(tx, ty)) continue;
      const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      if (d > maxDist || d >= bd) continue;
      let dry = null, dd = Infinity;
      for (const [dx, dy] of N4) {
        const nx = tx + dx, ny = ty + dy, v = at(nx, ny);
        if (v === -1 || v === WA || v === BR) continue;
        const e = Math.hypot(nx + 0.5 - x, ny + 0.5 - y);
        if (e < dd) { dd = e; dry = { x: nx, y: ny }; }
      }
      if (dry) { bd = d; best = { water: { x: tx, y: ty }, dry }; }
    }
    return best;
  }
  /* Beaches a boat where its rider hops off: it stays parked on the nearest bank side water tile
     to (x, y) (its own tile when that touches a bank), `bank` the dry tile beside it, and can be
     taken again. Returns the boat, or null when it does not exist. */
  function beachBoat(boatId, x, y, yaw) {
    const b = boatById(boatId);
    if (!b) return null;
    if (!finite(x) || !finite(y)) { x = b.x; y = b.y; }
    if (finite(yaw)) b.yaw = yaw;
    const bank = nearestBank(x, y, BOAT.BEACH_REACH);
    unmoor(b);
    if (bank) { b.x = bank.water.x + 0.5; b.y = bank.water.y + 0.5; b.bank = { x: bank.dry.x, y: bank.dry.y }; }
    else { b.x = x; b.y = y; b.bank = null; }
    b.parked = true; b.beached = true; b.rider = null;
    return b;
  }
  /* The nearest parked boat nobody rides within maxDist (default unlimited) of (x, y), or null. */
  function nearestFreeBoat(x, y, maxDist) {
    const lim = finite(maxDist) ? maxDist : Infinity;
    let best = null, bd = Infinity;
    for (const b of state.boats) {
      if (!b.parked || b.rider) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d <= lim && d < bd) { bd = d; best = b; }
    }
    return best;
  }
  /* The kicker whose foot or lip tile holds (x, y), or null (the scooter and the cart treat the
     two tiles as a low obstacle; the hoverboard launches off them). */
  function kickerAt(x, y) { return kickerByTile ? kickerByTile.get(Math.floor(x) + ',' + Math.floor(y)) || null : null; }
  /* True for ground the hoverboard rides: everything the visitor may stand on plus water outside
     the pond swim area (the swim spots and their ring). Buildings, trees, features and the map
     edge block it. */
  function isHoverable(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y), v = at(tx, ty);
    if (v === -1) return false;
    if (v === WA) return !(boatWater && boatWater.excluded.has(tx + ',' + ty));
    return enterableType(v);
  }

  /* ---------- agents riding (CONTRACT_V9 "Agents riding") ---------- */
  const yawOf = a => Math.atan2(a.moveDir.x, a.moveDir.z);

  /* Drops every claim the agent's trip holds (the scooter it was walking to, the rack slot it was
     riding to) and forgets the trip. A scooter the agent rides stays under it. */
  function releaseTrip(a) {
    const tr = a.trip;
    if (tr) {
      const sc = scooterById(tr.scooterId);
      if (sc && sc.reservedBy === a.id) sc.reservedBy = null;
      const rk = tr.park && rackById(tr.park.rackId);
      if (rk) for (let i = 0; i < rk.slots; i++) if (rk.reserved[i] === a.id) rk.reserved[i] = null;
    }
    a.trip = null; a.leg = null;
  }

  /* Parks the agent's scooter where it stands (a short trip, an interruption, removal). */
  function dropScooter(a) {
    if (!a.scooter) return;
    const sc = scooterById(a.scooter);
    if (sc && sc.rider === a.id) parkScooter(sc.id, a.pos.x, a.pos.y, yawOf(a));
    a.scooter = null;
  }

  /* Plans a ride for a trip from tile `start` to tile `dest` whose walking path is `path`. Rides
     when the path is longer than RIDE.MIN_PATH and the agent already rides a scooter or a free one
     is within RIDE.REACH (and reachable); free-parked scooters are taken before rack scooters, and
     never the last scooter left in a rack.
     The park spot is the first that works of: the open rack nearest the destination within
     RIDE.RACK_REACH, the open rack nearest the last 10 tiles of the walking path within
     RIDE.RACK_REACH, for trips without opts.mouth the open rack nearest the destination within
     RIDE.RACK_FAR, then opts.mouth (the stub mouth), else a tile four steps short of the
     destination on the walking path. On success sets agent.trip, agent.leg and
     agent.path and returns true; otherwise changes nothing and returns false. */
  function planRide(a, start, dest, path, opts) {
    if (!start || !dest || !path || path.length <= RIDE.MIN_PATH) return false;
    opts = opts || {};
    let sc = null, toPath = null;
    if (a.scooter) {
      sc = scooterById(a.scooter);
      if (!sc || sc.rider !== a.id) return false;
    } else {
      const sx = start.x + 0.5, sy = start.y + 0.5;
      // free-parked scooters first, so racks are the reserve rather than the source; an agent
      // never takes the last scooter in a rack (kept for the visitor)
      const rackLeft = s => { const r = s.rackId && rackById(s.rackId); return r ? r.scooters.filter(id => id && id !== s.id && !(scooterById(id) || {}).reservedBy).length : 1; };
      const cand = state.scooters
        .filter(s => s.parked && !s.rider && !(s.reservedBy && s.reservedBy !== a.id) && rackLeft(s) >= 1 && Math.hypot(s.x - sx, s.y - sy) <= RIDE.REACH)
        .sort((p, q) => ((p.rackId ? 1 : 0) - (q.rackId ? 1 : 0)) || (Math.hypot(p.x - sx, p.y - sy) - Math.hypot(q.x - sx, q.y - sy)));
      for (const s of cand.slice(0, 3)) {
        const tx = Math.floor(s.x), ty = Math.floor(s.y);
        const p = (tx === start.x && ty === start.y) ? [] : findPath(start.x, start.y, tx, ty);
        if (p) { sc = s; toPath = p; break; }
      }
      if (!sc) return false;
    }
    const rideFrom = a.scooter ? start : { x: Math.floor(sc.x), y: Math.floor(sc.y) };
    // the park spot candidates, best first: a rack by the destination, a rack by the end of the
    // walking path (the street rack by the building), for trips without a stub mouth a rack
    // within RIDE.RACK_FAR of the destination, then the stub mouth or a spot four tiles short
    const parks = [];
    const openRacks = state.racks.filter(r => walkable(r.x, r.y) && r.scooters.some((id, i) => !id && !r.reserved[i]));
    const rackPark = r => {
      if (!r || parks.some(p => p.rackId === r.id)) return;
      let slot = -1;
      for (let i = 0; i < r.slots; i++) if (!r.scooters[i] && !r.reserved[i]) { slot = i; break; }
      if (slot >= 0) parks.push({ tile: { x: r.x, y: r.y }, rackId: r.id, slot, side: null, along: null, pos: null, yaw: SLOT_YAW });
    };
    const nearest = (pts, lim) => {
      let best = null, bd = Infinity;
      for (const r of openRacks) for (const t of pts) {
        const d = Math.hypot(r.pos.x - t.x - 0.5, r.pos.y - t.y - 0.5);
        if (d <= lim && d < bd) { bd = d; best = r; }
      }
      return best;
    };
    rackPark(nearest([dest], RIDE.RACK_REACH));
    rackPark(nearest(path.slice(-10), RIDE.RACK_REACH));
    if (!opts.mouth) rackPark(nearest([dest], RIDE.RACK_FAR));
    if (opts.mouth && walkable(opts.mouth.x, opts.mouth.y)) {
      const f = opts.facing || null;
      parks.push({ tile: { x: opts.mouth.x, y: opts.mouth.y }, rackId: null, slot: -1, side: opts.side || null, along: f, pos: null, yaw: f ? Math.atan2(f.x, f.y) : null });
    }
    if (!opts.mouth) {
      const t = path[Math.max(0, path.length - 5)];
      parks.push({ tile: { x: t.x, y: t.y }, rackId: null, slot: -1, side: null, along: null, pos: null, yaw: null });
    }
    let park = null, ridePath = null, walkPath = null;
    for (const p of parks) {
      const rp = (rideFrom.x === p.tile.x && rideFrom.y === p.tile.y) ? [] : findPath(rideFrom.x, rideFrom.y, p.tile.x, p.tile.y);
      if (!rp || rp.length < RIDE.MIN_RIDE) continue;
      const wp = (p.tile.x === dest.x && p.tile.y === dest.y) ? [] : findPath(p.tile.x, p.tile.y, dest.x, dest.y);
      if (!wp) continue;
      park = p; ridePath = rp; walkPath = wp; break;
    }
    if (!park) return false;
    // commit: claim the scooter and the slot
    if (park.rackId) rackById(park.rackId).reserved[park.slot] = a.id;
    a.trip = { dest: { x: dest.x, y: dest.y }, scooterId: sc.id, ridePath, walkPath, park };
    if (a.scooter) { a.leg = 'riding'; a.path = ridePath; a.trip.ridePath = null; a.pose = 'ride'; }
    else { sc.reservedBy = a.id; a.leg = 'toScooter'; a.path = toPath; a.pose = 'walk'; }
    return true;
  }

  /* Gives up on the ride (the scooter was taken or moved): walk to the destination from here. */
  function walkInstead(a) {
    const dest = a.trip && a.trip.dest;
    releaseTrip(a);
    if (!dest) { a.path = []; return; }
    const t = tileOf(a);
    a.trip = { dest, scooterId: null, ridePath: null, walkPath: null, park: null };
    a.leg = 'walk';
    a.path = findPath(t.x, t.y, dest.x, dest.y) || [];
    a.pose = 'walk';
  }

  /* Advances a trip one frame: the walk to the scooter, the ride, the park, then the walk along
     agent.path. Returns true once the last walking path is done (the caller arrives). */
  function followTrip(a, dt, walkSpeed) {
    if (a.leg === 'toScooter') {
      a.pose = 'walk';
      if (stepAlong(a, dt, walkSpeed)) return false;
      const sc = scooterById(a.trip && a.trip.scooterId);
      if (!sc || sc.reservedBy !== a.id || !sc.parked || sc.rider || Math.hypot(sc.x - a.pos.x, sc.y - a.pos.y) > 1.5) { walkInstead(a); return false; }
      if (!glideTo(a, dt, sc, walkSpeed)) { a.animT += dt * (walkSpeed / 1.6); a.frame = 1 + Math.floor(a.animT / 0.14) % 4; return false; }
      takeScooter(sc.id, a.id);
      a.scooter = sc.id; a.leg = 'riding'; a.pose = 'ride';
      a.path = a.trip.ridePath || []; a.trip.ridePath = null;
      return false;
    }
    if (a.leg === 'riding') {
      const sc = scooterById(a.scooter);
      if (!sc || sc.rider !== a.id) { a.scooter = null; walkInstead(a); return false; }
      a.pose = 'ride';
      if (stepAlong(a, dt, RIDE.SPEED)) return false;
      const P = a.trip.park;
      if (!P.pos) {
        const rk = rackById(P.rackId);
        if (rk) {
          if (rk.scooters[P.slot]) { P.slot = slotFor(rk, a.id); }
          P.pos = P.slot >= 0 ? rackSlotPos(rk, P.slot) : freeSpot(P.tile, { x: 0, y: 1 }, { x: 1, y: 0 }, sc.id);
        } else P.pos = freeSpot(P.tile, P.side, P.along, sc.id);
      }
      if (!glideTo(a, dt, P.pos, RIDE.SPEED)) return false;
      parkScooter(sc.id, P.pos.x, P.pos.y, P.yaw === null ? yawOf(a) : P.yaw);
      a.scooter = null;
      const walk = a.trip.walkPath || [];
      const dest = a.trip.dest;
      releaseTrip(a);
      a.trip = { dest, scooterId: null, ridePath: null, walkPath: null, park: null };
      a.leg = 'walk'; a.pose = 'walk'; a.path = walk;
      return false;
    }
    if (a.path.length) { stepAlong(a, dt, walkSpeed); a.pose = 'walk'; if (a.path.length) return false; }
    return true;
  }

  /* A ridden scooter follows its agent rider every tick. */
  function syncScooter(a) {
    const sc = scooterById(a.scooter);
    if (!sc || sc.rider !== a.id) { a.scooter = null; return; }
    sc.x = a.pos.x; sc.y = a.pos.y; sc.yaw = yawOf(a);
  }

  /* ---------- rack rebalancing (CONTRACT_V10 "Scooter racks") ---------- */
  const rackCount = r => r.scooters.filter(Boolean).length;
  const onReturnTrip = a => !!(a.trip && a.trip.kind === 'return');
  /* Tracks how long each rack has been empty. */
  function updateRackClocks(t) {
    for (const r of state.racks) {
      if (rackCount(r)) { r.emptySince = null; continue; }
      if (r.emptySince === null || r.emptySince === undefined) r.emptySince = t;
    }
  }
  /* The scooter to bring back to an empty rack: the nearest free-parked scooter within
     RETURN.REACH (a rack over capacity is one with scooters left beside it), else a scooter from
     the nearest rack within RETURN.REACH that holds at least two unreserved ones, so that rack
     keeps one. Null when nothing qualifies. */
  function returnSource(rack) {
    const dist = (x, y) => Math.hypot(x - rack.pos.x, y - rack.pos.y);
    const free = state.scooters
      .filter(s => s.parked && !s.rider && !s.reservedBy && !s.rackId && dist(s.x, s.y) <= RETURN.REACH)
      .sort((p, q) => dist(p.x, p.y) - dist(q.x, q.y));
    if (free.length) return free[0];
    const spare = r => r.scooters.filter(id => id && !(scooterById(id) || {}).reservedBy);
    const racks = state.racks
      .filter(r => r !== rack && dist(r.pos.x, r.pos.y) <= RETURN.REACH && spare(r).length >= 2)
      .sort((p, q) => dist(p.pos.x, p.pos.y) - dist(q.pos.x, q.pos.y));
    for (const r of racks) { const id = spare(r)[0]; const sc = scooterById(id); if (sc) return sc; }
    return null;
  }
  /* Sends the nearest idle agent that can reach the source scooter and ride it to the rack on a
     'return' trip (leg 'toScooter' then 'riding'; the agent stays idle and parks it in the rack's
     reserved slot). Returns true when an agent was dispatched. */
  function dispatchReturn(rack, t) {
    const sc = returnSource(rack);
    if (!sc) return false;
    let slot = -1;
    for (let i = 0; i < rack.slots; i++) if (!rack.scooters[i] && !rack.reserved[i]) { slot = i; break; }
    if (slot < 0) return false;
    const st = { x: Math.floor(sc.x), y: Math.floor(sc.y) };
    if (!walkable(st.x, st.y) || !walkable(rack.x, rack.y)) return false;
    const idle = state.agents
      .filter(a => a.state === 'idle' && !a.leg && !a.trip && !a.leisure && !a.paused && !a.scooter)
      .sort((p, q) => Math.hypot(p.pos.x - sc.x, p.pos.y - sc.y) - Math.hypot(q.pos.x - sc.x, q.pos.y - sc.y));
    for (const a of idle.slice(0, 4)) {
      const from = tileOf(a);
      const toPath = (from.x === st.x && from.y === st.y) ? [] : findPath(from.x, from.y, st.x, st.y);
      if (!toPath) continue;
      const ridePath = findPath(st.x, st.y, rack.x, rack.y);
      if (!ridePath) continue;
      rack.reserved[slot] = a.id; sc.reservedBy = a.id;
      a.trip = { kind: 'return', dest: { x: rack.x, y: rack.y }, rackId: rack.id, scooterId: sc.id, ridePath, walkPath: [], park: { tile: { x: rack.x, y: rack.y }, rackId: rack.id, slot, side: null, along: null, pos: null, yaw: SLOT_YAW } };
      a.leg = 'toScooter'; a.path = toPath; a.pose = 'walk';
      rack.returnBy = a.id;
      log(`${a.spec.name} is bringing a scooter back to the ${rack.near || 'empty'} rack.`, 'info', a);
      return true;
    }
    return false;
  }
  /* Every RETURN.CHECK seconds: a rack empty for more than RETURN.EMPTY_AFTER seconds with no
     return trip under way gets one, at most once per RETURN.COOLDOWN seconds. */
  let rebalanceAt = 0;
  function rebalanceRacks(t) {
    for (const r of state.racks) {
      if (r.emptySince === null || r.emptySince === undefined || t - r.emptySince < RETURN.EMPTY_AFTER) continue;
      if (r.returnBy) {
        const a = agentById(r.returnBy);
        if (a && onReturnTrip(a) && a.trip.rackId === r.id) continue;
        r.returnBy = null;
      }
      if (t - r.lastDispatch < RETURN.COOLDOWN) continue;
      r.lastDispatch = t;
      dispatchReturn(r, t);
    }
  }
  /* The rack a finished return trip filled forgets its courier. */
  function finishReturn(a) {
    if (!onReturnTrip(a)) return;
    const r = rackById(a.trip.rackId);
    if (r && r.returnBy === a.id) r.returnBy = null;
  }

  /* ---------- jobs ---------- */
  function startJob(a, opts) {
    if (a.state === 'commute' || a.state === 'working') return;
    const L = a.state === 'leisure' && a.leisure && a.leisure.kind === 'swim' ? a.leisure : null;
    if (L && L.phase === 'diving') {
      // mid-air: let the dive land first, then start the commute from the water
      L.pendingJob = opts || {};
      return;
    }
    const r = Math.random;
    const pick = TT.TASKS[a.spec.anim] || TT.TASKS.write;
    const [task, result] = (opts && opts.task) ? [opts.task, opts.result || 'Done'] : pick[Math.floor(r() * pick.length)];
    const dur = (opts && opts.duration) || 10 + r() * 18;
    a.job = { task, result, ok: (opts && opts.ok !== undefined) ? opts.ok : r() > 0.1, duration: dur, start: null, end: null };
    a.bubble = null;
    const b = a.dept.building, wt = b.workTile;
    // v9: an idle trip in progress (a wander or a leisure ride) gives up its claims; a scooter
    // already under the agent stays under it for the commute or is parked here
    releaseTrip(a);
    let start = null;
    if (L && (L.phase === 'boarding' || L.phase === 'bouncing')) {
      // on the deck or the board: step back to the pier tile and walk from there
      const pier = state.pier;
      a.pos.x = pier.base.x; a.pos.y = pier.base.y;
      a.path = findPath(pier.tile.x, pier.tile.y, wt.x, wt.y) || [];
      start = { x: pier.tile.x, y: pier.tile.y };
    } else if (L) {
      // CONTRACT: swimmers glide to the nearest shore tile first, then walk the grid.
      const sh = nearestShoreTile(a.pos.x, a.pos.y);
      a.path = [{ x: sh.x, y: sh.y }, ...(findPath(sh.x, sh.y, wt.x, wt.y) || [])];
    } else {
      const t = tileOf(a);
      a.path = findPath(t.x, t.y, wt.x, wt.y) || [];
      start = t;
    }
    clearLeisure(a);
    a.state = 'commute';
    a.pose = 'walk';
    if (!planRide(a, start, wt, a.path, { mouth: b.stubMouth, side: b.stubSide, facing: b.facing }) && a.scooter) dropScooter(a);
    log(`${a.spec.name} is heading to ${a.dept.name}: ${task}`, 'start', a);
  }
  TT.startJob = startJob;

  function finishJob(a) {
    const j = a.job;
    const ok = j.ok;
    const result = ok ? j.result : TT.FAIL_RESULTS[Math.floor(Math.random() * TT.FAIL_RESULTS.length)];
    a.history.unshift({ at: Date.now(), task: j.task, result, ok, ms: j.duration * 1000 });
    a.dept.building.active = Math.max(0, a.dept.building.active - 1);
    a.state = ok ? 'report' : 'error';
    a.pose = ok ? 'hop' : 'slump';
    a.bubble = { text: result, until: now() + (ok ? 7 : 10), kind: ok ? 'ok' : 'error' };
    a.job = null;
    log(`${a.spec.name} (${a.dept.short}) ${ok ? 'finished' : 'hit a problem'}: ${result}`, ok ? 'done' : 'error', a);
  }

  function pickWanderTarget(a) {
    const r = Math.random();
    let t;
    if (r < 0.35) t = state.plazaTiles[Math.floor(Math.random() * state.plazaTiles.length)];
    else if (r < 0.65 && state.hangouts.length) t = state.hangouts[Math.floor(Math.random() * state.hangouts.length)];
    else {
      for (let i = 0; i < 20; i++) {
        const x = 2 + Math.floor(Math.random() * (COLS - 4)), y = 2 + Math.floor(Math.random() * (ROWS - 4));
        if (walkable(x, y)) { t = { x, y }; break; }
      }
    }
    if (!t || !walkable(t.x, t.y)) return;
    const s = tileOf(a);
    const p = findPath(s.x, s.y, t.x, t.y);
    if (p && p.length) a.path = p;
  }

  function stepAlong(a, dt, speed) {
    if (!a.path.length) return false;
    const n = a.path[0];
    const tx = n.x + 0.5, ty = n.y + 0.5;
    let dx = tx - a.pos.x, dy = ty - a.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;
    if (dist <= step) { a.pos.x = tx; a.pos.y = ty; a.path.shift(); }
    else { a.pos.x += dx / dist * step; a.pos.y += dy / dist * step; }
    setMoveDir(a, dx, dy);
    if (Math.abs(dx) > 0.05) a.facing = dx > 0 ? 1 : -1;
    // walk cycle speed follows movement speed so feet do not slide
    a.animT += dt * (speed / 1.6);
    a.frame = 1 + Math.floor(a.animT / 0.14) % 4;
    return true;
  }

  function standIdle(a, dt) {
    const t = now();
    if (t > a.blinkAt + 0.14) { a.frame = 0; if (t > a.blinkAt + 0.14 && Math.random() < dt * 0.4) a.blinkAt = t; }
    else a.frame = 7;
    if (t > a.lookAt) { if (Math.random() < 0.5) a.facing = -a.facing; a.lookAt = t + 2 + Math.random() * 5; }
  }

  function updateLeisure(a, dt, t) {
    const L = a.leisure;
    if (!L) { a.state = 'idle'; a.pose = 'stand'; return; }
    if (L.kind !== 'swim') {
      a.pose = 'sit'; a.frame = 0;
      if (t > L.until) endLeisure(a, t, null);
      return;
    }
    const pier = state.pier;
    if (a.paused) {
      // CONTRACT: hover pause freezes swimmers in place and pushes their timers forward.
      L.until += dt; L.t0 += dt;
      return;
    }
    switch (L.phase) {
      case 'wading':
        // walking from the shore tile center into the water tile center
        a.pose = 'walk';
        a.animT += dt * (1.0 / 1.6); a.frame = 1 + Math.floor(a.animT / 0.14) % 4;
        if (glideTo(a, dt, L.water, 1.0)) startSwimming(a, t);
        break;
      case 'boarding':
        a.pose = 'walk'; a.onBoard = true;
        a.animT += dt * (1.1 / 1.6); a.frame = 1 + Math.floor(a.animT / 0.14) % 4;
        if (glideTo(a, dt, pier.boardEnd, 1.1)) { L.phase = 'bouncing'; L.until = t + 0.6; a.pose = 'stand'; a.frame = 0; }
        break;
      case 'bouncing':
        a.pose = 'stand';
        if (t > L.until) { L.phase = 'diving'; L.t0 = t; a.jumpT = 0; a.pose = 'dive'; }
        break;
      case 'diving': {
        a.pose = 'dive';
        if (a.jumpT >= 1) {
          startSwimming(a, t);
          // a job requested mid-dive starts now that the alien is in the water
          if (L.pendingJob) { const job = L.pendingJob; L.pendingJob = null; startJob(a, job); }
          break;
        }
        const k = Math.min(1, (t - L.t0) / 1.1);
        a.jumpT = k;
        const b = pier.boardEnd, l = pier.landing;
        a.pos.x = b.x + (l.x - b.x) * k; a.pos.y = b.y + (l.y - b.y) * k;
        setMoveDir(a, l.x - b.x, l.y - b.y);
        break;
      }
      case 'swimming': {
        a.pose = 'swim';
        if (!L.spot) L.spot = randomSwimSpot();
        const c = { x: L.spot.x + 0.5, y: L.spot.y + 0.5 };
        if (Math.hypot(c.x - a.pos.x, c.y - a.pos.y) < 0.1) L.spot = randomSwimSpot();
        else glideTo(a, dt, c, 0.8);
        if (t > L.until) {
          L.phase = 'leaving';
          if (!L.dive) {
            L.shore = nearestShoreTile(a.pos.x, a.pos.y);
            L.water = waterNextTo(L.shore, a.pos.x, a.pos.y).edge;
          }
        }
        break;
      }
      case 'leaving': {
        a.pose = 'swim';
        if (L.dive) {
          if (glideTo(a, dt, pier.ladder, 1.0)) { L.phase = 'climbing'; L.t0 = t; L.until = t + 0.8; a.pose = 'climb'; }
        } else {
          // swim to the water edge of the shore tile, then step out as a walker
          if (glideTo(a, dt, L.water, 1.0)) { L.phase = 'wadingOut'; a.pose = 'walk'; }
        }
        break;
      }
      case 'wadingOut': {
        a.pose = 'walk';
        a.animT += dt * (1.0 / 1.6); a.frame = 1 + Math.floor(a.animT / 0.14) % 4;
        const c = { x: L.shore.x + 0.5, y: L.shore.y + 0.5 };
        if (glideTo(a, dt, c, 1.0)) endLeisure(a, t, c);
        break;
      }
      case 'climbing': {
        a.pose = 'climb';
        const k = Math.min(1, (t - L.t0) / 0.8);
        const e = k * k * (3 - 2 * k);
        const from = pier.ladder, to = pier.base;
        a.pos.x = from.x + (to.x - from.x) * e; a.pos.y = from.y + (to.y - from.y) * e;
        setMoveDir(a, to.x - from.x, to.y - from.y);
        if (k >= 1) endLeisure(a, t, pier.base);
        break;
      }
      default:
        // CONTRACT: an unknown phase (should not happen) ends the swim on the nearest shore.
        endLeisure(a, t, null);
    }
  }

  function updateAgent(a, dt) {
    const t = now();
    a.yoff = 0;
    switch (a.state) {
      case 'idle':
        if (a.paused) {
          // CONTRACT: hover pause. Stand still, wave, and push the wait forward.
          a.waitUntil += dt; a.lookAt += dt;
          a.pose = 'wave'; a.frame = 0;
          break;
        }
        if (a.path.length || a.leg) {
          // a wander, a leisure trip (which may ride a scooter part of the way) or a return trip
          if (followTrip(a, dt, a.speed)) {
            finishReturn(a);
            releaseTrip(a);
            if (a.leisure) arriveLeisure(a, t);
            else { a.waitUntil = t + 1.5 + Math.random() * 5; a.lookAt = t + 0.8; }
          }
        } else if (a.leisure && a.leisure.phase === 'going') {
          arriveLeisure(a, t);
        } else {
          standIdle(a, dt);
          a.pose = 'stand';
          if (t > a.waitUntil && !decideLeisure(a, t)) pickWanderTarget(a);
        }
        break;
      case 'commute':
        // hover pause and talk freeze riders too: they stop on the scooter and wave
        if (a.paused) { a.pose = 'wave'; a.frame = 0; break; }
        if (followTrip(a, dt, 2.6)) {
          a.pose = 'walk';
          const wp = a.dept.building.workPos;
          const dx = wp.x - a.pos.x, dy = wp.y - a.pos.y, d = Math.hypot(dx, dy);
          if (d > 0.05) {
            const s = Math.min(d, 2.6 * dt);
            a.pos.x += dx / d * s; a.pos.y += dy / d * s;
            setMoveDir(a, dx, dy);
            a.animT += dt; a.frame = 1 + Math.floor(a.animT / 0.14) % 4;
          } else {
            releaseTrip(a);
            a.pos.x = wp.x; a.pos.y = wp.y; a.facing = 1; a.frame = 5; a.state = 'working'; a.animT = 0;
            a.pose = 'work';
            a.job.start = t; a.job.end = t + a.job.duration; a.dept.building.active++;
          }
        }
        break;
      case 'working': {
        a.animT += dt;
        a.pose = 'work';
        // bursts of typing with short pauses to read the screen
        const cycle = a.animT % 3.2;
        a.frame = cycle < 0.7 ? 5 : 5 + Math.floor(a.animT / 0.12) % 2;
        if (t > a.job.end) finishJob(a);
        break;
      }
      case 'report': {
        // a happy little hop when the work lands
        const age = t - (a.bubble ? a.bubble.until - 7 : t);
        a.frame = 0; a.pose = 'hop';
        if (age < 1.2) a.yoff = -Math.abs(Math.sin(age * 9)) * 3 * (1 - age / 1.2);
        if (!a.bubble || t > a.bubble.until) { a.bubble = null; a.state = 'idle'; a.pose = 'stand'; a.waitUntil = t + 0.4; }
        break;
      }
      case 'error':
        a.frame = 8; a.pose = 'slump';
        if (!a.bubble || t > a.bubble.until) { a.bubble = null; a.state = 'idle'; a.pose = 'stand'; a.waitUntil = t + 0.4; }
        break;
      case 'leisure':
        updateLeisure(a, dt, t);
        break;
    }
  }

  /* ---------- simulator ---------- */
  let simAccum = 0;
  function simulate(dt) {
    if (!state.settings.simulate) return;
    simAccum += dt;
    if (simAccum < 1) return;
    simAccum = 0;
    const visible = state.agents.filter(a => state.settings.showDemo || !a.spec.demo);
    const busy = visible.filter(a => a.state === 'commute' || a.state === 'working').length;
    const target = Math.max(2, Math.round(visible.length * 0.3));
    if (busy < target && Math.random() < 0.45) {
      // agents bringing a scooter back to a rack finish that first when anyone else is free
      const idle = visible.filter(a => a.state === 'idle');
      const free = idle.filter(a => !onReturnTrip(a));
      const pool = free.length ? free : idle;
      if (pool.length) startJob(pool[Math.floor(Math.random() * pool.length)]);
    }
  }

  /* ---------- stats ---------- */
  function deptStats() {
    const weekAgo = Date.now() - 7 * 86400000;
    return TT.DEPARTMENTS.map(d => {
      const agents = state.agents.filter(a => a.dept === d && (state.settings.showDemo || !a.spec.demo));
      const runs = agents.reduce((s, a) => s + a.history.filter(h => h.at > weekAgo).length, 0);
      const fails = agents.reduce((s, a) => s + a.history.filter(h => h.at > weekAgo && !h.ok).length, 0);
      const active = agents.filter(a => a.state === 'working' || a.state === 'commute').length;
      return { dept: d, agents: agents.length, runs, fails, active };
    });
  }
  TT.deptStats = deptStats;

  function darkness() {
    const m = state.settings.lighting;
    if (m === 'day') return 0;
    if (m === 'night') return 0.62;
    const d = new Date(); const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 7.5 && h < 17.5) return 0;
    if (h >= 17.5 && h < 20) return (h - 17.5) / 2.5 * 0.62;
    if (h >= 5.5 && h < 7.5) return (1 - (h - 5.5) / 2) * 0.62;
    return 0.62;
  }
  TT.darkness = darkness;

  /* ---------- public API ---------- */
  let inited = false;
  TT.sim = {
    TILES,
    // CONTRACT_V8 "Terrain": the heightmap seed js/terrain.js reads (same seed, same heights)
    terrainSeed: 20261020,
    get PLAN() { return ensurePlan(); },
    get COLS() { ensurePlan(); return COLS; },
    get ROWS() { ensurePlan(); return ROWS; },
    // v10: the cityplan library (rasterizePlan, the lot helpers, validatePlan, MARK) and the
    // raster the map was built from (grid of MARK values, lot and hole records, roadIdx)
    get cityplan() { return ensureLib(); },
    get MARK() { return ensureLib().MARK; },
    get raster() { return raster; },
    LEISURE,
    state,
    /* init(plan, lib): plan defaults to TT.PLAN, lib (the cityplan module namespace) to
       TT.cityplan, TT.cityplanSource or a sync fetch of js/cityplan.js. Idempotent. */
    init(plan, lib) {
      if (inited) return;
      ensurePlan(plan, lib);
      ensureLib(lib);
      inited = true;
      buildMap();
      for (const spec of TT.SEED_AGENTS) { const a = makeAgent(spec); seedHistory(a); state.agents.push(a); }
      log('Thread Town is open. Agents are wandering until work comes in.', 'info');
    },
    tick(dt) {
      state.time += dt;
      simulate(dt);
      updateRackClocks(state.time);
      if (state.time >= rebalanceAt) { rebalanceAt = state.time + RETURN.CHECK; rebalanceRacks(state.time); }
      for (const a of state.agents) { updateAgent(a, dt); if (a.scooter) syncScooter(a); }
    },
    at,
    walkable,
    isEnterable,
    districtAt,
    lotAt,
    reserveSeat,
    releaseSeat,
    findPath,
    // v9 scooters
    RIDE,
    rackSlotPos,
    takeScooter,
    parkScooter,
    nearestFreeScooter,
    nearestRack,
    // v10 rack rebalancing
    RETURN,
    returnSource,
    dispatchReturn,
    // v11 boats, the waterway and the hoverboard's sim parts
    BOAT,
    get boatWater() { return boatWater; },
    boatById,
    dockById,
    takeBoat,
    dockBoat,
    beachBoat,
    nearestFreeBoat,
    nearestDock,
    nearestBank,
    waterReachable,
    boatWaterAt,
    waterwayAt,
    slowWaterAt,
    kickerAt,
    isHoverable,
    startJob,
    finishJob,
    addAgent(spec, opts) {
      TT.sim.init(); // idempotent; guarantees the map and plaza exist before spawning
      const a = makeAgent(spec);
      if (!opts || opts.seedHistory !== false) seedHistory(a);
      state.agents.push(a);
      log(`${spec.name} joined ${a.dept.name} as ${spec.role}.`, 'join', a);
      return a;
    },
    removeAgent(id) {
      const i = state.agents.findIndex(a => a.id === id);
      if (i >= 0) {
        const a = state.agents[i];
        if (a.state === 'working') a.dept.building.active = Math.max(0, a.dept.building.active - 1);
        clearLeisure(a);
        // v9: never lose a scooter: release the trip's claims and park a ridden one right here
        releaseTrip(a);
        dropScooter(a);
        state.agents.splice(i, 1);
        if (state.selected && state.selected.id === id) state.selected = null;
        if (state.hover && state.hover.id === id) state.hover = null;
      }
    },
    runNow(id) { TT.sim.init(); const a = state.agents.find(x => x.id === id); if (a) startJob(a); },
    deptStats,
    darkness,
    log,
  };
})();
