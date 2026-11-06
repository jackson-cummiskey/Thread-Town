/* Thread Town: the corner minimap (CONTRACT_V11 "The minimap") and, since version 13, the town
   map: the full map overlay with labels, pan and zoom, waypoints and the route (CONTRACT_V13
   "The town map", "Waypoints and directions").

   createMinimap(ctx) -> {
     el, update(view), setVisible(on), toggle(), visible, scale, destroy(),
     openMap(), closeMap(), isOpen(), setWaypoint(x, z | null), setRoute(points | null),
     waypoint, onWaypoint(cb), zoom, mapEl, mapCanvas, labelBoxes()
   }

   ctx = {
     sim,       TT.sim (COLS, ROWS, at, TILES, PLAN); the base layers are painted once from its tile grid
     state,     TT.state (buildings, lots, agents, scooters, boats, racks, docks, kickers, kiosk,
                subway, pier, marina, pond, golf, waterways, settings)
     depts,     TT.DEPARTMENTS (accent colours; falls back to window.TT.DEPARTMENTS)
     terrain,   optional: the terrain record (heightAt) for the height shading; without it the
                plan's district landforms shade the hill and the bluff
     mount,     the #minimap div the frame is appended to (optional; the caller may append `el`)
     mapMount,  the overlay host: defaults to the #map-modal element of the document, else a div
                appended to document.body
     storage,   a localStorage like object (getItem, setItem); defaults to window.localStorage
     onToggle,  optional (on) hook called when M flips the corner map
     onOpen,    optional (open) hook called when the town map opens or closes
     onGo,      optional hook called by the Go button beside the pin and the G key while open
     keys,      false to leave the M key to the caller (toggle() stays available; Esc and G while
                the map is open are always handled here, in the capture phase)
   }
   view = {
     x, z,      the visitor's world position (z is the sim's y)
     yaw,       the chase camera yaw: 0 faces +z (south), Math.PI faces north; the corner map
                rotates so this direction is up; the town map keeps north up and turns the arrow
     target,    { x, z } or null: the prompt target, the cup of the hole in play, the ball between
                shots, the rack a ride is heading to, the dock when boating; drawn as a pulsing
                salmon ring. The caller reuses one object; the map never keeps a reference. The
                waypoint wins over the target while it is set.
     mode,      'walk', 'scooter', 'hover', 'boat', 'golf' or 'cart' show the corner map; anything
                else (orbit, board, interior, subway) hides it for the frame. Omitted means shown.
                The open town map draws in every mode.
     time,      optional seconds for the ring pulse (defaults to performance.now())
   }

   The corner map: two canvases, a base painted once from the raster at 6 px per tile (water
   aqua, roads silver, paths sand, the course in two greens, bridges and decks, the plaza,
   buildings as department blocks, fillers grey, the hill and the bluff lightened by height) and
   an overlay repainted at most once per frame: the whole base image drawn rotated about the
   visitor and clipped to the rounded frame, the route as an aqua dotted line, the visitor's
   white arrow, agents as department dots, scooters as ticks, the waypoint pin or the target ring,
   the north tick and the expand glyph on the frame. Scale: 0.2 tiles per px (a 40 tile window at
   200 px); the wheel over the map zooms between 0.1 and 0.5. 200 px, 160 under 980 px wide (a
   mount with a measurable width sets the size instead). M toggles (remembered under
   'threadtown.minimap.v1' together with the zoom). A tap on the corner map (or its expand glyph)
   opens the town map.

   The town map (openMap): the #map-modal overlay (a dark backdrop, the card with the title
   'Thread Town', a close button, the map canvas and the Go button). The base is painted once at
   4 px per tile by the same painter, drawn north up at `zoom` css px per tile (2 to 8, wheel and
   pinch, 4 on open) centred on the visitor on open and panned by drag. Labels (12 px on phones,
   13 px on laptops, navy on a silver pill) are placed greedily, nudged up or down and dropped
   when they still collide, once per quarter px per tile of zoom; the layout lives in typed
   arrays so a frame allocates nothing. A tap sets the waypoint (a pulsing salmon pin), a tap on
   the pin clears it; onWaypoint(cb) hears both. setRoute(points) keeps the caller's array of
   { x, y } tiles and draws it dotted in aqua on both maps. Esc, the close button, the backdrop
   and M close it. update() allocates nothing open or closed. */

const NAVY = '#002D4F', AQUA = '#75CCD0', SALMON = '#E7706F', SILVER = '#E2E9EE';
const STORAGE_KEY = 'threadtown.minimap.v1';
const SIZE_WIDE = 200, SIZE_NARROW = 160, NARROW_BELOW = 980;   // the breakpoint matches css/style.css (#minimap at max-width 980px)
const PHONE_BELOW = 640;        // css/style.css's phone breakpoint: 12 px labels, the overlay fills the view
const SCALE_DEFAULT = 0.2, SCALE_MIN = 0.1, SCALE_MAX = 0.5;
const BASE_PX = 6;              // corner base layer pixels per tile (zoom never upsamples past 1.7x)
const MAP_PX = 4;               // the town map's base layer pixels per tile
const ZOOM_MIN = 2, ZOOM_MAX = 8, ZOOM_DEFAULT = 4;   // town map css px per tile
const ZOOM_QUANTUM = 0.25;      // the labels are laid out once per quarter px per tile
const CORNER = 18;              // the frame's corner radius in css px
const TAP_PX = 8, TAP_MS = 600; // a pointer that moves less than this and lifts within this is a tap
const PIN_HIT = 18;             // css px around the pin that clear it
const SHOWN_MODES = { walk: 1, scooter: 1, hover: 1, boat: 1, golf: 1, cart: 1 };
const TAU = 6.283185307179586;
const LABEL_FONT = "600 %dpx Kanit, Inter, system-ui, sans-serif";
const EMPTY = [];

/* Tile colours by TILES value, filled in from the sim's table at creation. */
const COLOUR = {
  G: '#79A861',   // grass
  P: SILVER,      // roads
  WA: AQUA,       // water
  B: '#9AA5AD',   // buildings before the records colour them (fillers stay grey)
  T: '#4F8A3F',   // forest cores
  Z: '#CBD5DC',   // plaza and courtyards
  F: '#8DB46E',   // flowers
  FT: '#2A4F70',  // features (the subway mouth, the fountain basin)
  FW: '#5FA84E',  // fairway
  GR: '#A6DB78',  // green
  SA: '#E9D9A6',  // sand
  TEE: '#A6DB78', // tee boxes read as the green
  SW: '#EEF3F6',  // sidewalks
  CW: '#F4F7F9',  // crosswalks
  PK: '#C3CDD5',  // parking
  BR: '#B08A58',  // bridges
  PT: '#D9C8A0',  // gravel paths
  CP: '#CDBB8E',  // cart paths
  DK: '#A67C4E',  // decks
};
const FILLER = '#9AA5AD', CAFE = SALMON, CLUBHOUSE = '#1E3C5E';

function canvasOf(doc, w, h) {
  const c = doc.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyCentroid(pts) {
  let x = 0, y = 0;
  if (!pts || !pts.length) return { x: 0, y: 0 };
  for (let i = 0; i < pts.length; i++) { x += pts[i][0]; y += pts[i][1]; }
  return { x: x / pts.length, y: y / pts.length };
}
function tilesCentroid(tiles) {
  let x = 0, y = 0, n = 0;
  for (let i = 0; i < (tiles ? tiles.length : 0); i++) { const t = tiles[i]; if (t && isFinite(t.x) && isFinite(t.y)) { x += t.x + 0.5; y += t.y + 0.5; n++; } }
  return n ? { x: x / n, y: y / n } : null;
}
/* Distance from a point to a polygon's edge (tile units). */
function distToPolyEdge(px, py, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}

/* A height function from the plan's district landforms, used when no terrain record is given:
   the hill rises to its height over its radius, the bluff is a plateau inside its polygon with a
   short fade at the wall, flats sit at their height, the lake and the valley stay at zero. */
function districtHeight(plan) {
  const ds = (plan && plan.districts) || [];
  return function (x, y) {
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      if (!d || !d.pts || !pointInPoly(x, y, d.pts)) continue;
      const lf = d.landform || {};
      const h = isFinite(lf.height) ? lf.height : 0;
      if (lf.kind === 'hill') {
        const c = lf.center || [0, 0], r = lf.radius || 1;
        const dd = Math.hypot(x - c[0], y - c[1]) / r;
        const f = dd >= 1 ? 0 : (1 - dd) * (1 - dd) * (3 - 2 * (1 - dd));   // smooth rise
        return h * f;
      }
      if (lf.kind === 'bluff') {
        const poly = lf.polygon || d.pts;
        const e = distToPolyEdge(x, y, poly);
        return h * Math.min(1, e / 1.5);
      }
      if (lf.kind === 'flats') return h;
      return 0;
    }
    return 0;
  };
}

/* The ground height per tile, sampled once at the tile centres (water tiles read 0). */
function heightField(sim, cols, rows, heightAt) {
  const H = new Float32Array(cols * rows);
  if (typeof heightAt !== 'function') return H;
  const T = sim.TILES || {};
  const WATER = T.WA !== undefined ? T.WA : 2;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (sim.at(x, y) === WATER) continue;
    let h = 0;
    try { h = heightAt(x + 0.5, y + 0.5); } catch (e) { h = 0; }
    H[y * cols + x] = isFinite(h) ? h : 0;
  }
  return H;
}

/* Paints the whole raster once at `px` per tile. Every tile class the sim knows gets its
   colour; building records paint over the B tiles in their department colour; the ground above
   0.3 is lightened by height (the hill and the bluff), water never. */
function paintBase(g, sim, state, cols, rows, px, H) {
  const T = sim.TILES || {};
  const byType = new Array(32).fill(COLOUR.G);
  for (const k in COLOUR) if (T[k] !== undefined) byType[T[k]] = COLOUR[k];
  g.fillStyle = COLOUR.G;
  g.fillRect(0, 0, cols * px, rows * px);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = sim.at(x, y);
      const c = byType[t] || COLOUR.G;
      if (c === COLOUR.G) continue;
      g.fillStyle = c;
      g.fillRect(x * px, y * px, px, px);
    }
  }
  const paintTiles = (tiles, colour) => {
    if (!tiles) return;
    g.fillStyle = colour;
    for (const t of tiles) g.fillRect(t.x * px, t.y * px, px, px);
  };
  // filler lots first (grey), then the named buildings on top
  for (const lot of state.lots || []) {
    if (!lot || !lot.footprint || !lot.footprint.tiles) continue;
    if (lot.kind && (lot.kind.startsWith('dept:') || lot.kind === 'cafe' || lot.kind === 'clubhouse' || lot.kind === 'pond')) continue;
    paintTiles(lot.footprint.tiles, FILLER);
  }
  for (const b of state.buildings || []) {
    if (!b || !b.tiles) continue;
    const colour = b.kind === 'dept' && b.dept ? (b.dept.accent || NAVY) : b.kind === 'cafe' ? CAFE : b.kind === 'clubhouse' ? CLUBHOUSE : FILLER;
    paintTiles(b.tiles, colour);
  }
  // the height shading: eight steps of white over the ground, more the higher it stands
  if (H && H.length === cols * rows) {
    const steps = 8, top = 9;
    for (let s = 1; s <= steps; s++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.06 + 0.3 * (s - 1) / (steps - 1)).toFixed(3) + ')';
      const lo = 0.3 + (top - 0.3) * (s - 1) / steps, hi = s === steps ? Infinity : 0.3 + (top - 0.3) * s / steps;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const h = H[y * cols + x];
          if (!(h >= lo && h < hi)) continue;
          g.fillRect(x * px, y * px, px, px);
        }
      }
    }
  }
}

/* A rounded rectangle path (the stub may lack roundRect). */
function rrect(g, x, y, w, h, r) {
  if (r > w / 2) r = w / 2;
  if (r > h / 2) r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

/* The label list (CONTRACT_V13 "Labels"): every department building, the cafe, the clubhouse,
   Thread National, the holes at their tees, the subway, the pier, the marina, the pond, the lake,
   the river, the creek, the channel, the hill, the bluff, the kiosk, the rack clusters and the
   dock clusters. Lower `prio` wins a spot first. kind 0 is a pill, 1 a hole number. */
function buildLabels(sim, state, plan) {
  const out = [];
  const add = (text, x, z, prio, kind) => { if (text && isFinite(x) && isFinite(z)) out.push({ text: String(text), x, z, prio, kind: kind || 0 }); };
  for (const b of state.buildings || []) {
    if (!b) continue;
    const c = tilesCentroid(b.tiles) || (isFinite(b.x) ? { x: b.x + (b.w || 1) / 2, y: b.y + (b.h || 1) / 2 } : null);
    if (!c) continue;
    if (b.kind === 'dept' && b.dept) add(b.dept.name, c.x, c.y, 0);
    else if (b.kind === 'cafe') add('Cafe', c.x, c.y, 0);
    else if (b.kind === 'clubhouse') add('Clubhouse', c.x, c.y, 0);
  }
  const golf = state.golf;
  if (golf) {
    const sign = golf.entranceSign;
    const c = sign && isFinite(sign.x) ? { x: sign.x + 0.5, y: sign.y + 2.5 } : polyCentroid(golf.area || []);
    add('Thread National', c.x, c.y, 0);
    for (const h of golf.holes || []) if (h && h.tee) add(h.n, h.tee.x, h.tee.y, 2, 1);
  }
  if (state.subway && state.subway.pos) add('Subway', state.subway.pos.x, state.subway.pos.y, 1);
  if (state.pier && state.pier.base) add('Pier', state.pier.base.x, state.pier.base.y, 1);
  if (state.marina && state.marina.pos) add('Marina', state.marina.pos.x, state.marina.pos.y, 1);
  if (state.kiosk && state.kiosk.pos) add('Kiosk', state.kiosk.pos.x, state.kiosk.pos.y, 2);
  if (state.pond && state.pond.center) add('Pond', state.pond.center.x, state.pond.center.y, 1);
  for (const w of (plan && plan.water) || []) {
    if (!w) continue;
    if (w.kind === 'lake' || w.id === 'lake') { const c = polyCentroid(w.pts); add('Lake', c.x, c.y, 1); }
    else if (w.kind === 'river' || w.id === 'river') {
      const cl = w.center;
      if (cl && cl.length) { const m = cl[Math.floor(cl.length / 2)]; add('River', m[0], m[1], 1); }
      else { const c = polyCentroid(w.pts); add('River', c.x, c.y, 1); }
    }
  }
  const bodies = {};
  for (const w of state.waterways || []) {
    if (!w || !w.tiles) continue;
    const body = w.body || w.id;
    (bodies[body] = bodies[body] || []).push(...w.tiles);
  }
  for (const body in bodies) {
    const c = tilesCentroid(bodies[body]);
    if (!c) continue;
    if (body === 'creek') add('The creek', c.x, c.y, 1);
    else if (body === 'channel') add('The channel', c.x, c.y, 1);
    else add(body.charAt(0).toUpperCase() + body.slice(1), c.x, c.y, 2);
  }
  let hill = null, bluff = null;
  for (const d of (plan && plan.districts) || []) {
    const lf = d && d.landform;
    if (!lf) continue;
    if (lf.kind === 'hill' && (!hill || (lf.height || 0) > (hill.landform.height || 0))) hill = d;
    if (lf.kind === 'bluff' && !bluff) bluff = d;
  }
  if (hill) { const c = hill.landform.center ? { x: hill.landform.center[0], y: hill.landform.center[1] } : polyCentroid(hill.pts); add('The hill', c.x, c.y, 1); }
  if (bluff) { const c = polyCentroid(bluff.landform.polygon || bluff.pts); add('The bluff', c.x, c.y, 1); }
  // rack clusters (within 10 tiles) and dock clusters (within 6 tiles): one label each
  const clusters = (items, reach) => {
    const groups = [];
    for (const it of items) {
      if (!it) continue;
      const x = isFinite(it.x) ? it.x + 0.5 : (it.pos ? it.pos.x : NaN), y = isFinite(it.y) ? it.y + 0.5 : (it.pos ? it.pos.y : NaN);
      if (!isFinite(x) || !isFinite(y)) continue;
      let g = null;
      for (const c of groups) if (Math.hypot(c.x / c.n - x, c.y / c.n - y) <= reach) { g = c; break; }
      if (g) { g.x += x; g.y += y; g.n++; } else groups.push({ x, y, n: 1 });
    }
    return groups.map(c => ({ x: c.x / c.n, y: c.y / c.n, n: c.n }));
  };
  // v13.1: no rack labels; with 24 racks even wide clusters littered the map, and the rack icon marks each one
  for (const c of clusters(state.docks || [], 6)) add(c.n > 1 ? 'Docks' : 'Dock', c.x, c.y, 3);
  out.sort((a, b) => a.prio - b.prio);
  return out;
}

export function createMinimap(ctx) {
  ctx = ctx || {};
  const sim = ctx.sim || (typeof window !== 'undefined' && window.TT ? window.TT.sim : null);
  const state = ctx.state || (sim && sim.state) || {};
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  const win = ctx.window || (typeof window !== 'undefined' ? window : null);
  if (!sim || !doc) throw new Error('Thread Town: createMinimap needs ctx.sim and a document');
  const cols = sim.COLS | 0, rows = sim.ROWS | 0;
  let plan = null;
  try { plan = sim.PLAN || null; } catch (e) { plan = null; }
  let storage = ctx.storage;
  if (storage === undefined) { try { storage = win && win.localStorage ? win.localStorage : null; } catch (e) { storage = null; } }
  const heightAt = ctx.terrain && typeof ctx.terrain.heightAt === 'function' ? (x, y) => ctx.terrain.heightAt(x, y) : districtHeight(plan);

  /* persisted: visible and the zoom */
  let visible = true, scale = SCALE_DEFAULT;
  try {
    const raw = storage && storage.getItem ? storage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.visible === 'boolean') visible = s.visible;
      if (s && isFinite(s.scale)) scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, +s.scale));
    }
  } catch (e) { /* storage is a convenience */ }
  function save() {
    try { if (storage && storage.setItem) storage.setItem(STORAGE_KEY, JSON.stringify({ visible, scale })); } catch (e) { /* ignore */ }
  }

  /* the frame */
  const innerW = win && isFinite(win.innerWidth) ? win.innerWidth : 1280;
  const narrow = innerW < NARROW_BELOW;
  const phone = ctx.phone === true || (ctx.phone !== false && innerW <= PHONE_BELOW);
  // the backing canvas matches the slot it fills: the mount's laid-out width when the slot is
  // displayed (clamped to the two sizes), else the breakpoint; a slot still hidden measures 0
  const mountW = ctx.mount && isFinite(ctx.mount.clientWidth) ? ctx.mount.clientWidth : 0;
  const size = mountW > 0 ? Math.round(Math.min(SIZE_WIDE, Math.max(SIZE_NARROW, mountW))) : (narrow ? SIZE_NARROW : SIZE_WIDE);
  const dpr = win && isFinite(win.devicePixelRatio) ? Math.min(2, Math.max(1, win.devicePixelRatio)) : 1;
  const el = doc.createElement('div');
  el.className = 'minimap-frame';
  el.setAttribute && el.setAttribute('aria-label', 'Minimap');
  const st = el.style || {};
  st.position = 'absolute'; st.right = '16px'; st.bottom = '16px';
  st.width = size + 'px'; st.height = size + 'px';
  st.borderRadius = CORNER + 'px'; st.border = '3px solid ' + NAVY; st.boxSizing = 'content-box';
  st.background = NAVY; st.overflow = 'hidden'; st.zIndex = '6'; st.pointerEvents = 'auto';
  st.boxShadow = '0 6px 18px rgba(0, 45, 79, 0.35)';
  st.cursor = 'pointer';
  const overlay = canvasOf(doc, size * dpr, size * dpr);
  const os = overlay.style || {};
  os.width = size + 'px'; os.height = size + 'px'; os.display = 'block';
  el.appendChild(overlay);
  if (ctx.mount && ctx.mount.appendChild) ctx.mount.appendChild(el);

  /* the corner base layer, painted once */
  const base = canvasOf(doc, Math.max(1, cols * BASE_PX), Math.max(1, rows * BASE_PX));
  const bg = base.getContext('2d');
  const heights = heightField(sim, cols, rows, heightAt);   // shared by both base paints
  paintBase(bg, sim, state, cols, rows, BASE_PX, heights);
  const g = overlay.getContext('2d');

  /* per frame scratch, allocated once */
  const F = {
    cx: size * dpr / 2, cy: size * dpr / 2, r: size * dpr / 2, px: size * dpr,
    k: 0, rot: 0, c: 1, s: 0,       // px per tile, the rotation and its cos and sin
    vx: 0, vz: 0, yaw: Math.PI,     // the visitor
    shownMode: true, drawn: false, hidden: false,
    lastT: -1, nAgents: 0, t: 0,
    font: Math.round(9 * dpr) + 'px sans-serif',
  };
  const agents = () => state.agents;
  const DASH_CORNER = [2 * dpr, 4 * dpr], DASH_MAP = [3 * dpr, 5 * dpr], DASH_NONE = [];

  /* the waypoint (one reused record, null while unset) and the route (the caller's array) */
  const WP = { x: 0, z: 0, tx: 0, tz: 0 };
  let wpSet = false;
  let route = null;
  let wpCb = null;

  function applyVisibility() {
    const show = visible && F.shownMode;
    if (F.hidden !== !show) { F.hidden = !show; st.display = show ? 'block' : 'none'; }
  }
  applyVisibility();

  /* map (tile) point to corner overlay px, written into PV[0] and PV[1] (a typed array, so the
     store never boxes a double whatever the JIT's state) */
  const PV = new Float64Array(2);
  function project(mx, mz) {
    const dx = (mx - F.vx) * F.k, dz = (mz - F.vz) * F.k;
    PV[0] = F.cx + dx * F.c - dz * F.s;
    PV[1] = F.cy + dx * F.s + dz * F.c;
  }

  function roundedClip() {
    const r = CORNER * dpr, w = F.px, h = F.px;
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(w - r, 0); g.arcTo(w, 0, w, r, r);
    g.lineTo(w, h - r); g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h); g.arcTo(0, h, 0, h - r, r);
    g.lineTo(0, r); g.arcTo(0, 0, r, 0, r);
    g.closePath();
  }

  /* the salmon pin with its pulse, at device px (x, y) with the base at the point */
  function drawPin(c, x, y, s, pulse) {
    const rr = (4 + 2.5 * pulse) * s;
    c.strokeStyle = SALMON; c.lineWidth = (1.6 + 0.6 * pulse) * s;
    c.beginPath(); c.arc(x, y, rr, 0, TAU); c.stroke();
    c.fillStyle = SALMON; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.1 * s; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 4.2 * s, y - 7 * s);
    c.arc(x, y - 9 * s, 4.6 * s, Math.PI * 0.85, Math.PI * 0.15, false);
    c.lineTo(x, y);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#FFFFFF';
    c.beginPath(); c.arc(x, y - 9 * s, 1.8 * s, 0, TAU); c.fill();
  }

  /* the route on the corner map: an aqua dotted line through the projected tile centres */
  function drawCornerRoute() {
    if (!route || route.length < 2) return;
    g.strokeStyle = AQUA; g.lineWidth = 2 * dpr; g.lineCap = 'round'; g.lineJoin = 'round';
    g.setLineDash(DASH_CORNER);
    g.beginPath();
    for (let i = 0; i < route.length; i++) {
      const p = route[i];
      if (!p) continue;
      const pz = isFinite(p.y) ? p.y : p.z;
      project(p.x + 0.5, pz + 0.5);
      if (i === 0) g.moveTo(PV[0], PV[1]); else g.lineTo(PV[0], PV[1]);
    }
    g.stroke();
    g.setLineDash(DASH_NONE);
  }

  function updateCorner(view) {
    const t = F.t;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = NAVY;
    g.fillRect(0, 0, F.px, F.px);
    g.save();
    roundedClip();
    g.clip();
    // the base image rotated about the visitor: screen = C + R * (map - visitor) * k
    const bk = F.k / BASE_PX;
    g.setTransform(F.c * bk, F.s * bk, -F.s * bk, F.c * bk, F.cx - (F.c * F.vx - F.s * F.vz) * F.k, F.cy - (F.s * F.vx + F.c * F.vz) * F.k);
    g.imageSmoothingEnabled = true;
    g.drawImage(base, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);

    drawCornerRoute();

    // scooters as ticks along their yaw
    const sc = state.scooters || EMPTY;
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.5 * dpr; g.lineCap = 'round';
    for (let i = 0; i < sc.length; i++) {
      const s = sc[i];
      if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
      project(s.x, s.y);
      const px = PV[0], py = PV[1];
      if (px < -8 || py < -8 || px > F.px + 8 || py > F.px + 8) continue;
      const yw = isFinite(s.yaw) ? s.yaw : 0;
      // the tick runs along the scooter's facing (sin yaw, cos yaw) rotated into the frame
      const fx = Math.sin(yw), fz = Math.cos(yw);
      const ex = fx * F.c - fz * F.s, ey = fx * F.s + fz * F.c;
      const half = 2.2 * dpr;
      g.beginPath(); g.moveTo(px - ex * half, py - ey * half); g.lineTo(px + ex * half, py + ey * half); g.stroke();
    }

    // agents as department dots (Risk's animals keep the department colour)
    const ag = agents() || EMPTY;
    const showDemo = !state.settings || state.settings.showDemo !== false;
    const dotR = 2.4 * dpr;
    let nAgents = 0;
    for (let i = 0; i < ag.length; i++) {
      const a = ag[i];
      if (!a || !a.pos) continue;
      if (!showDemo && a.spec && a.spec.demo) continue;
      project(a.pos.x, a.pos.y);
      const px = PV[0], py = PV[1];
      if (px < -8 || py < -8 || px > F.px + 8 || py > F.px + 8) continue;
      g.fillStyle = a.dept && a.dept.accent ? a.dept.accent : NAVY;
      g.beginPath(); g.arc(px, py, dotR, 0, TAU); g.fill();
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 0.8 * dpr; g.stroke();
      nAgents++;
    }

    // the waypoint pin wins over the target ring; an off map point stays on the rim
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
    const tg = view.target;
    if (wpSet || (tg && isFinite(tg.x) && isFinite(tg.z))) {
      if (wpSet) project(WP.x, WP.z); else project(tg.x, tg.z);
      let px = PV[0], py = PV[1];
      const ddx = px - F.cx, ddy = py - F.cy, dd = Math.hypot(ddx, ddy), rim = F.r - 9 * dpr;
      if (dd > rim) { px = F.cx + ddx / dd * rim; py = F.cy + ddy / dd * rim; }
      if (wpSet) drawPin(g, px, py, dpr, pulse);
      else {
        const rr = (4 + 2.5 * pulse) * dpr;
        g.strokeStyle = SALMON; g.lineWidth = (1.6 + 0.6 * pulse) * dpr;
        g.beginPath(); g.arc(px, py, rr, 0, TAU); g.stroke();
        g.fillStyle = SALMON;
        g.beginPath(); g.arc(px, py, 1.4 * dpr, 0, TAU); g.fill();
      }
    }

    // the visitor: a white arrow pointing up (the facing)
    const ar = 6 * dpr;
    g.fillStyle = '#FFFFFF'; g.strokeStyle = NAVY; g.lineWidth = 1.2 * dpr; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(F.cx, F.cy - ar);
    g.lineTo(F.cx + ar * 0.72, F.cy + ar * 0.8);
    g.lineTo(F.cx, F.cy + ar * 0.35);
    g.lineTo(F.cx - ar * 0.72, F.cy + ar * 0.8);
    g.closePath(); g.fill(); g.stroke();
    g.restore();

    // the north tick on the frame: north is (0, -1) in map space, rotated into the frame
    const nx = F.s, ny = -F.c;           // R * (0, -1)
    const tr = F.r - 2 * dpr;
    g.strokeStyle = SALMON; g.lineWidth = 3 * dpr; g.lineCap = 'round';
    g.beginPath(); g.moveTo(F.cx + nx * (tr - 7 * dpr), F.cy + ny * (tr - 7 * dpr)); g.lineTo(F.cx + nx * tr, F.cy + ny * tr); g.stroke();
    g.fillStyle = '#FFFFFF';
    g.font = F.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', F.cx + nx * (tr - 13 * dpr), F.cy + ny * (tr - 13 * dpr));

    // the expand glyph, top right: a small navy disc with two arrow corners
    const gx = F.px - 13 * dpr, gy = 13 * dpr, gr = 9 * dpr;
    g.fillStyle = 'rgba(0,45,79,0.82)';
    g.beginPath(); g.arc(gx, gy, gr, 0, TAU); g.fill();
    g.strokeStyle = AQUA; g.lineWidth = 1.4 * dpr; g.lineCap = 'round'; g.lineJoin = 'round';
    const a4 = 4 * dpr, a2 = 1.5 * dpr;
    g.beginPath();
    g.moveTo(gx + a2, gy - a4); g.lineTo(gx + a4, gy - a4); g.lineTo(gx + a4, gy - a2);
    g.moveTo(gx - a2, gy + a4); g.lineTo(gx - a4, gy + a4); g.lineTo(gx - a4, gy + a2);
    g.moveTo(gx + a4, gy - a4); g.lineTo(gx - a4, gy + a4);
    g.stroke();

    F.drawn = true; F.lastT = t; F.nAgents = nAgents;
  }

  /* ---------- the town map (CONTRACT_V13 "The town map") ---------- */
  const mk = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  let modal = ctx.mapMount || (doc.getElementById ? doc.getElementById('map-modal') : null) || null;
  let ownModal = false;
  if (!modal) {
    modal = mk('div'); modal.id = 'map-modal'; ownModal = true;
    if (doc.body && doc.body.appendChild) doc.body.appendChild(modal);
  }
  modal.setAttribute && modal.setAttribute('aria-hidden', 'true');
  const card = mk('div', 'map-card');
  card.setAttribute && card.setAttribute('role', 'dialog');
  card.setAttribute && card.setAttribute('aria-labelledby', 'map-title');
  const head = mk('div', 'map-head');
  const title = mk('h2', 'map-title', 'Thread Town'); title.id = 'map-title';
  const hint = mk('span', 'map-hint', 'Tap the map to set a waypoint, tap the pin to clear it. Drag to pan, scroll or pinch to zoom.'); hint.id = 'map-hint';
  const closeBtn = mk('button', 'map-close', '×'); closeBtn.id = 'map-close';
  closeBtn.setAttribute && closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute && closeBtn.setAttribute('aria-label', 'Close the map');
  head.appendChild(title); head.appendChild(hint); head.appendChild(closeBtn);
  const body = mk('div', 'map-body'); body.id = 'map-body';
  const mapCanvas = canvasOf(doc, 1, 1); mapCanvas.id = 'map-canvas';
  const goBtn = mk('button', 'map-go btn primary', 'Go'); goBtn.id = 'map-go';
  goBtn.setAttribute && goBtn.setAttribute('type', 'button');
  goBtn.setAttribute && goBtn.setAttribute('title', 'Walk to the waypoint (G)');
  goBtn.hidden = true;
  body.appendChild(mapCanvas); body.appendChild(goBtn);
  card.appendChild(head); card.appendChild(body);
  modal.appendChild(card);
  const mg = mapCanvas.getContext('2d');

  const labelPx = phone ? 12 : 13;
  const labelFont = LABEL_FONT.replace('%d', String(Math.round(labelPx * dpr)));
  const holeFont = LABEL_FONT.replace('%d', String(Math.round((labelPx - 1) * dpr)));
  const PAD_X = 6 * dpr, PAD_Y = 3 * dpr, GAP = 2 * dpr, LIFT = 5 * dpr;

  /* the labels: texts and anchors once, the boxes in typed arrays laid out per zoom level */
  const labels = buildLabels(sim, state, plan);
  const nL = labels.length;
  const LT = new Array(nL), LX = new Float64Array(nL), LZ = new Float64Array(nL), LK = new Uint8Array(nL);
  const LW = new Float64Array(nL), LH = new Float64Array(nL);      // the pill size in device px
  const BX = new Float64Array(nL), BY = new Float64Array(nL);      // the box top left in map px (tile origin) at the laid out zoom
  const SHOWN = new Uint8Array(nL);
  {
    for (let i = 0; i < nL; i++) {
      const l = labels[i];
      LT[i] = l.text; LX[i] = l.x; LZ[i] = l.z; LK[i] = l.kind;
      let w = l.text.length * labelPx * 0.58 * dpr;
      try {
        mg.font = l.kind === 1 ? holeFont : labelFont;
        const m = mg.measureText(l.text);
        if (m && isFinite(m.width) && m.width > 0) w = m.width;
      } catch (e) { /* the stub may not measure */ }
      const fh = (l.kind === 1 ? labelPx - 1 : labelPx) * dpr;
      LW[i] = w + (l.kind === 1 ? 2 * PAD_Y + 2 * dpr : 2 * PAD_X);
      LH[i] = fh + 2 * PAD_Y;
      if (l.kind === 1 && LW[i] < LH[i]) LW[i] = LH[i];
    }
  }

  /* the open map's state */
  const M = {
    open: false, zoom: ZOOM_DEFAULT, cx: cols / 2, cz: rows / 2,
    w: 0, h: 0, pw: 1, ph: 1,            // css px and device px of the canvas
    layoutKey: -1,                       // the zoom quantum the labels were laid out for
    // pointers: two slots for the drag and the pinch
    n: 0, id0: -1, id1: -1, x0: 0, y0: 0, x1: 0, y1: 0, sx: 0, sy: 0, down: 0, moved: false, dist0: 0, zoom0: ZOOM_DEFAULT,
    goX: -1e9, goY: -1e9, goShown: false,
  };
  let mapBase = null, painted = false;

  function paintMapBase() {
    if (painted) return;
    mapBase = canvasOf(doc, Math.max(1, cols * MAP_PX), Math.max(1, rows * MAP_PX));
    paintBase(mapBase.getContext('2d'), sim, state, cols, rows, MAP_PX, heights);
    painted = true;
  }

  function clampCentre() {
    if (M.cx < 0) M.cx = 0; else if (M.cx > cols) M.cx = cols;
    if (M.cz < 0) M.cz = 0; else if (M.cz > rows) M.cz = rows;
  }
  function setZoom(z) {
    if (!isFinite(z)) return;
    M.zoom = z < ZOOM_MIN ? ZOOM_MIN : z > ZOOM_MAX ? ZOOM_MAX : z;
  }

  /* the greedy placement: in priority order, a label sits above its anchor, then one to three
     rows up or down (up first), and is dropped when every slot collides with a placed label */
  function layoutLabels() {
    const k = M.zoom * dpr;
    for (let i = 0; i < nL; i++) {
      const w = LW[i], h = LH[i];
      const px = LX[i] * k, pz = LZ[i] * k;
      const x = px - w / 2, y0 = pz - h - LIFT;
      SHOWN[i] = 0;
      for (let s = 0; s < 7; s++) {
        const row = (s + 1) >> 1;                      // 0, 1, 1, 2, 2, 3, 3
        const dy = s === 0 ? 0 : (s & 1 ? -row : row) * (h + GAP);
        const y = y0 + dy;
        let hit = false;
        for (let j = 0; j < i; j++) {
          if (!SHOWN[j]) continue;
          if (x < BX[j] + LW[j] + GAP && BX[j] < x + w + GAP && y < BY[j] + LH[j] + GAP && BY[j] < y + h + GAP) { hit = true; break; }
        }
        if (!hit) { BX[i] = x; BY[i] = y; SHOWN[i] = 1; break; }
      }
    }
  }
  function ensureLayout() {
    const key = Math.round(M.zoom / ZOOM_QUANTUM);
    if (key === M.layoutKey) return;
    M.layoutKey = key;
    layoutLabels();
  }

  function sizeMap() {
    let w = isFinite(body.clientWidth) ? body.clientWidth : 0, h = isFinite(body.clientHeight) ? body.clientHeight : 0;
    if (!(w > 0) || !(h > 0)) {
      const iw = win && isFinite(win.innerWidth) ? win.innerWidth : 1000, ih = win && isFinite(win.innerHeight) ? win.innerHeight : 700;
      w = Math.round(phone ? iw : iw * 0.8); h = Math.round((phone ? ih : ih * 0.8) - 52);
      if (!(w > 0)) w = 800; if (!(h > 0)) h = 560;
    }
    if (w === M.w && h === M.h) return;
    M.w = w; M.h = h; M.pw = Math.max(1, Math.round(w * dpr)); M.ph = Math.max(1, Math.round(h * dpr));
    mapCanvas.width = M.pw; mapCanvas.height = M.ph;
    const cs = mapCanvas.style || {};
    cs.width = w + 'px'; cs.height = h + 'px';
  }

  /* a small icon at device px (x, y); kind: 0 rack, 1 dock, 2 kicker, 3 kiosk, 4 subway, 5 pier, 6 marina */
  function drawIcon(c, x, y, kind, s) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (kind === 0) {
      // a rack: a navy rail with three ticks
      c.strokeStyle = NAVY; c.lineWidth = 1.4 * s;
      c.beginPath(); c.moveTo(x - 4 * s, y - 1.5 * s); c.lineTo(x + 4 * s, y - 1.5 * s);
      c.moveTo(x - 2.5 * s, y - 1.5 * s); c.lineTo(x - 2.5 * s, y + 2.5 * s);
      c.moveTo(x, y - 1.5 * s); c.lineTo(x, y + 2.5 * s);
      c.moveTo(x + 2.5 * s, y - 1.5 * s); c.lineTo(x + 2.5 * s, y + 2.5 * s);
      c.stroke();
    } else if (kind === 1) {
      // a dock: a plank with a navy edge
      c.fillStyle = COLOUR.DK; c.strokeStyle = NAVY; c.lineWidth = 1 * s;
      c.beginPath(); c.rect(x - 4 * s, y - 2 * s, 8 * s, 4 * s); c.fill(); c.stroke();
    } else if (kind === 2) {
      // a kicker: a salmon wedge
      c.fillStyle = SALMON; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1 * s;
      c.beginPath(); c.moveTo(x - 4 * s, y + 3 * s); c.lineTo(x + 4 * s, y + 3 * s); c.lineTo(x + 4 * s, y - 3 * s); c.closePath(); c.fill(); c.stroke();
    } else if (kind === 3) {
      // the kiosk: a salmon booth with a white awning line
      c.fillStyle = SALMON; c.strokeStyle = NAVY; c.lineWidth = 1 * s;
      c.beginPath(); c.rect(x - 3.5 * s, y - 3.5 * s, 7 * s, 7 * s); c.fill(); c.stroke();
      c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.4 * s;
      c.beginPath(); c.moveTo(x - 3.5 * s, y - 1.5 * s); c.lineTo(x + 3.5 * s, y - 1.5 * s); c.stroke();
    } else if (kind === 4) {
      // the subway: a navy disc with a white S
      c.fillStyle = NAVY; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.2 * s;
      c.beginPath(); c.arc(x, y, 6 * s, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#FFFFFF'; c.font = holeFont; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('S', x, y + 0.5 * s);
    } else if (kind === 5) {
      // the pier: a plank reaching into the water
      c.strokeStyle = COLOUR.DK; c.lineWidth = 3 * s;
      c.beginPath(); c.moveTo(x, y - 4 * s); c.lineTo(x, y + 4 * s); c.stroke();
      c.strokeStyle = NAVY; c.lineWidth = 1 * s;
      c.beginPath(); c.moveTo(x - 2 * s, y + 4 * s); c.lineTo(x + 2 * s, y + 4 * s); c.stroke();
    } else if (kind === 6) {
      // the marina: an anchor, a ring over a stem and a curved fluke
      c.strokeStyle = NAVY; c.lineWidth = 1.5 * s; c.fillStyle = '#FFFFFF';
      c.beginPath(); c.arc(x, y, 6.5 * s, 0, TAU); c.fill(); c.stroke();
      c.beginPath(); c.arc(x, y - 3.5 * s, 1.3 * s, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(x, y - 2.2 * s); c.lineTo(x, y + 4 * s); c.moveTo(x - 2.5 * s, y - 0.5 * s); c.lineTo(x + 2.5 * s, y - 0.5 * s); c.stroke();
      c.beginPath(); c.arc(x, y + 0.5 * s, 3.5 * s, Math.PI * 0.15, Math.PI * 0.85, false); c.stroke();
    }
  }

  function drawMap(view) {
    const k = M.zoom * dpr;
    const offX = M.pw / 2 - M.cx * k, offZ = M.ph / 2 - M.cz * k;
    const c = mg;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0B2A45';
    c.fillRect(0, 0, M.pw, M.ph);
    // the base at k px per tile, north up
    const bk = k / MAP_PX;
    c.setTransform(bk, 0, 0, bk, offX, offZ);
    c.imageSmoothingEnabled = M.zoom < MAP_PX;
    c.drawImage(mapBase, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    // the map's edge
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1 * dpr;
    c.strokeRect(offX, offZ, cols * k, rows * k);

    // the route: an aqua dotted line through the tile centres
    if (route && route.length >= 2) {
      c.strokeStyle = AQUA; c.lineWidth = 2.5 * dpr; c.lineCap = 'round'; c.lineJoin = 'round';
      c.setLineDash(DASH_MAP);
      c.beginPath();
      for (let i = 0; i < route.length; i++) {
        const p = route[i];
        if (!p) continue;
        const pz = isFinite(p.y) ? p.y : p.z;
        const x = offX + (p.x + 0.5) * k, y = offZ + (pz + 0.5) * k;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      c.setLineDash(DASH_NONE);
    }

    // icons: racks, docks, kickers, the kiosk, the subway, the pier, the marina
    const s = dpr;
    const racks = state.racks || EMPTY;
    for (let i = 0; i < racks.length; i++) { const r = racks[i]; if (r && r.pos) drawIcon(c, offX + r.pos.x * k, offZ + r.pos.y * k, 0, s); }
    const docks = state.docks || EMPTY;
    for (let i = 0; i < docks.length; i++) { const d = docks[i]; if (d && d.pos) drawIcon(c, offX + d.pos.x * k, offZ + d.pos.y * k, 1, s); }
    const kickers = state.kickers || EMPTY;
    for (let i = 0; i < kickers.length; i++) { const kk = kickers[i]; if (kk && kk.pos) drawIcon(c, offX + kk.pos.x * k, offZ + kk.pos.y * k, 2, s); }
    if (state.kiosk && state.kiosk.pos) drawIcon(c, offX + state.kiosk.pos.x * k, offZ + state.kiosk.pos.y * k, 3, s);
    if (state.subway && state.subway.pos) drawIcon(c, offX + state.subway.pos.x * k, offZ + state.subway.pos.y * k, 4, s);
    if (state.pier && state.pier.base) drawIcon(c, offX + state.pier.base.x * k, offZ + state.pier.base.y * k, 5, s);
    if (state.marina && state.marina.pos) drawIcon(c, offX + state.marina.pos.x * k, offZ + state.marina.pos.y * k, 6, s);

    // scooters and boats as ticks along their yaw (the facing is (sin yaw, cos yaw) in map space)
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.5 * dpr; c.lineCap = 'round';
    const sc = state.scooters || EMPTY;
    for (let i = 0; i < sc.length; i++) {
      const v = sc[i];
      if (!v || !isFinite(v.x) || !isFinite(v.y)) continue;
      const x = offX + v.x * k, y = offZ + v.y * k;
      if (x < -8 || y < -8 || x > M.pw + 8 || y > M.ph + 8) continue;
      const yw = isFinite(v.yaw) ? v.yaw : 0, ex = Math.sin(yw), ey = Math.cos(yw), half = 2.2 * dpr;
      c.beginPath(); c.moveTo(x - ex * half, y - ey * half); c.lineTo(x + ex * half, y + ey * half); c.stroke();
    }
    c.strokeStyle = NAVY; c.lineWidth = 2.2 * dpr;
    const bo = state.boats || EMPTY;
    for (let i = 0; i < bo.length; i++) {
      const v = bo[i];
      if (!v || !isFinite(v.x) || !isFinite(v.y)) continue;
      const x = offX + v.x * k, y = offZ + v.y * k;
      if (x < -8 || y < -8 || x > M.pw + 8 || y > M.ph + 8) continue;
      const yw = isFinite(v.yaw) ? v.yaw : 0, ex = Math.sin(yw), ey = Math.cos(yw), half = 3.2 * dpr;
      c.beginPath(); c.moveTo(x - ex * half, y - ey * half); c.lineTo(x + ex * half, y + ey * half); c.stroke();
    }

    // agents as department dots
    const ag = agents() || EMPTY;
    const showDemo = !state.settings || state.settings.showDemo !== false;
    const dotR = 2.6 * dpr;
    for (let i = 0; i < ag.length; i++) {
      const a = ag[i];
      if (!a || !a.pos) continue;
      if (!showDemo && a.spec && a.spec.demo) continue;
      const x = offX + a.pos.x * k, y = offZ + a.pos.y * k;
      if (x < -8 || y < -8 || x > M.pw + 8 || y > M.ph + 8) continue;
      c.fillStyle = a.dept && a.dept.accent ? a.dept.accent : NAVY;
      c.beginPath(); c.arc(x, y, dotR, 0, TAU); c.fill();
      c.strokeStyle = '#FFFFFF'; c.lineWidth = 0.8 * dpr; c.stroke();
    }

    // the labels at their laid out boxes
    ensureLayout();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < nL; i++) {
      if (!SHOWN[i]) continue;
      const x = offX + BX[i], y = offZ + BY[i], w = LW[i], h = LH[i];
      if (x + w < 0 || y + h < 0 || x > M.pw || y > M.ph) continue;
      c.fillStyle = SILVER; c.strokeStyle = 'rgba(0,45,79,0.55)'; c.lineWidth = 1 * dpr;
      rrect(c, x, y, w, h, LK[i] === 1 ? h / 2 : 5 * dpr);
      c.fill(); c.stroke();
      c.fillStyle = NAVY; c.font = LK[i] === 1 ? holeFont : labelFont;
      c.fillText(LT[i], x + w / 2, y + h / 2 + 0.5 * dpr);
    }

    // the prompt target ring when no waypoint is set, then the pin
    const pulse = 0.5 + 0.5 * Math.sin(F.t * 5.0);
    const tg = view.target;
    if (!wpSet && tg && isFinite(tg.x) && isFinite(tg.z)) {
      const x = offX + tg.x * k, y = offZ + tg.z * k;
      c.strokeStyle = SALMON; c.lineWidth = (1.6 + 0.6 * pulse) * dpr;
      c.beginPath(); c.arc(x, y, (4 + 2.5 * pulse) * dpr, 0, TAU); c.stroke();
    }
    if (wpSet) {
      const x = offX + WP.x * k, y = offZ + WP.z * k;
      drawPin(c, x, y, dpr * 1.25, pulse);
      // the Go button beside the pin (css px), only moved when its rounded place changes
      const gx = Math.round(x / dpr + 14), gy = Math.round(y / dpr - 30);
      const on = x >= 0 && y >= 0 && x <= M.pw && y <= M.ph;
      if (on !== M.goShown) { M.goShown = on; goBtn.hidden = !on; }
      if (on && (gx !== M.goX || gy !== M.goY)) {
        M.goX = gx; M.goY = gy;
        const gs = goBtn.style || {};
        gs.left = gx + 'px'; gs.top = gy + 'px';
      }
    } else if (M.goShown) { M.goShown = false; goBtn.hidden = true; }

    // the visitor: a white arrow turned to the facing (north up, so the arrow rotates by pi - yaw)
    const vx = offX + F.vx * k, vy = offZ + F.vz * k;
    const ar = 7 * dpr;
    c.save();
    c.translate(vx, vy);
    c.rotate(Math.PI - F.yaw);
    c.fillStyle = '#FFFFFF'; c.strokeStyle = NAVY; c.lineWidth = 1.3 * dpr; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(0, -ar); c.lineTo(ar * 0.72, ar * 0.8); c.lineTo(0, ar * 0.35); c.lineTo(-ar * 0.72, ar * 0.8);
    c.closePath(); c.fill(); c.stroke();
    c.restore();

    // the north mark, top left
    c.fillStyle = 'rgba(0,45,79,0.82)';
    c.beginPath(); c.arc(16 * dpr, 16 * dpr, 11 * dpr, 0, TAU); c.fill();
    c.strokeStyle = SALMON; c.lineWidth = 2.5 * dpr; c.lineCap = 'round';
    c.beginPath(); c.moveTo(16 * dpr, 24 * dpr); c.lineTo(16 * dpr, 10 * dpr); c.stroke();
    c.fillStyle = '#FFFFFF'; c.font = holeFont; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', 16 * dpr, 17 * dpr);
  }

  function update(view) {
    if (!view) return;
    const mode = view.mode;
    F.shownMode = !mode || SHOWN_MODES[mode] === 1;
    applyVisibility();
    F.t = isFinite(view.time) ? view.time : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    F.vx = isFinite(view.x) ? view.x : F.vx;
    F.vz = isFinite(view.z) ? view.z : F.vz;
    F.yaw = isFinite(view.yaw) ? view.yaw : F.yaw;
    // facing (sin yaw, cos yaw) in map space must point up (0, -1) on screen: rotate the map by
    // -(pi / 2) - atan2(cos yaw, sin yaw), which simplifies to yaw - pi
    F.rot = F.yaw - Math.PI;
    F.c = Math.cos(F.rot); F.s = Math.sin(F.rot);
    F.k = dpr / scale;
    if (F.hidden) F.drawn = false; else updateCorner(view);
    if (M.open) drawMap(view);
  }

  function setVisible(on) {
    on = !!on;
    if (on === visible) { applyVisibility(); return; }
    visible = on;
    applyVisibility();
    save();
    if (typeof ctx.onToggle === 'function') ctx.onToggle(visible);
  }
  function toggle() { setVisible(!visible); return visible; }

  /* ---------- open and close ---------- */
  function openMap() {
    if (M.open) return;
    paintMapBase();
    try { if (doc.pointerLockElement && typeof doc.exitPointerLock === 'function') doc.exitPointerLock(); } catch (e) { /* no lock */ }
    if (modal.classList && modal.classList.add) modal.classList.add('open');
    modal.setAttribute && modal.setAttribute('aria-hidden', 'false');
    M.open = true;
    sizeMap();
    M.zoom = ZOOM_DEFAULT;
    M.cx = F.vx; M.cz = F.vz; clampCentre();
    M.layoutKey = -1; ensureLayout();
    M.n = 0; M.id0 = -1; M.id1 = -1; M.down = 0;
    M.goX = -1e9; M.goY = -1e9;
    if (typeof ctx.onOpen === 'function') ctx.onOpen(true);
  }
  function closeMap() {
    if (!M.open) return;
    M.open = false;
    if (modal.classList && modal.classList.remove) modal.classList.remove('open');
    modal.setAttribute && modal.setAttribute('aria-hidden', 'true');
    if (M.goShown) { M.goShown = false; goBtn.hidden = true; }
    M.n = 0; M.id0 = -1; M.id1 = -1; M.down = 0;
    if (typeof ctx.onOpen === 'function') ctx.onOpen(false);
  }
  const isOpen = () => M.open;

  /* ---------- the waypoint and the route ---------- */
  function setWaypoint(x, z) {
    if (x === null || x === undefined || !isFinite(x) || !isFinite(z)) { wpSet = false; return null; }
    const tx = Math.floor(x), tz = Math.floor(z);
    WP.tx = tx; WP.tz = tz; WP.x = tx + 0.5; WP.z = tz + 0.5;
    wpSet = true;
    return WP;
  }
  function setRoute(points) { route = Array.isArray(points) && points.length ? points : null; }
  function onWaypoint(cb) { wpCb = typeof cb === 'function' ? cb : null; }
  function fireWaypoint() { if (wpCb) { try { wpCb(wpSet ? WP : null); } catch (e) { /* the hook's error is its own */ } } }

  /* a tap at css px (x, y) on the open map: the pin clears, anywhere else sets */
  function tapMap(x, y) {
    if (!M.open) return;
    if (wpSet) {
      const px = M.w / 2 + (WP.x - M.cx) * M.zoom, py = M.h / 2 + (WP.z - M.cz) * M.zoom;
      // the pin stands above its base: the hit area covers the head and the base
      if (Math.hypot(x - px, y - (py - 8)) <= PIN_HIT) { setWaypoint(null); fireWaypoint(); return; }
    }
    const mx = M.cx + (x - M.w / 2) / M.zoom, mz = M.cz + (y - M.h / 2) / M.zoom;
    if (mx < 0 || mz < 0 || mx >= cols || mz >= rows) return;
    setWaypoint(mx, mz);
    fireWaypoint();
  }

  /* ---------- input ---------- */
  const EP = { x: 0, y: 0 };   // the event point scratch (input only, never per frame)
  const evPoint = (e, target) => {
    const r = target && typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
    EP.x = (isFinite(e.clientX) ? e.clientX : 0) - (r ? r.left : 0);
    EP.y = (isFinite(e.clientY) ? e.clientY : 0) - (r ? r.top : 0);
    return EP;
  };
  const pid = e => (isFinite(e.pointerId) ? e.pointerId : 1);
  const onMapDown = e => {
    if (e.preventDefault) e.preventDefault();
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    const p = evPoint(e, mapCanvas), id = pid(e);
    if (M.n === 0) { M.id0 = id; M.x0 = p.x; M.y0 = p.y; M.sx = p.x; M.sy = p.y; M.n = 1; M.moved = false; M.down = e.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
    else if (M.n === 1 && id !== M.id0) { M.id1 = id; M.x1 = p.x; M.y1 = p.y; M.n = 2; M.moved = true; M.dist0 = Math.max(1, Math.hypot(M.x1 - M.x0, M.y1 - M.y0)); M.zoom0 = M.zoom; }
    try { if (mapCanvas.setPointerCapture) mapCanvas.setPointerCapture(id); } catch (err) { /* synthetic */ }
  };
  const onMapMove = e => {
    if (M.n === 0) return;
    const p = evPoint(e, mapCanvas), id = pid(e);
    if (M.n === 1 && id === M.id0) {
      const dx = p.x - M.x0, dy = p.y - M.y0;
      if (!M.moved && Math.hypot(p.x - M.sx, p.y - M.sy) > TAP_PX) M.moved = true;
      if (M.moved) { M.cx -= dx / M.zoom; M.cz -= dy / M.zoom; clampCentre(); }
      M.x0 = p.x; M.y0 = p.y;
    } else if (M.n === 2) {
      if (id === M.id0) { M.x0 = p.x; M.y0 = p.y; } else if (id === M.id1) { M.x1 = p.x; M.y1 = p.y; } else return;
      const d = Math.max(1, Math.hypot(M.x1 - M.x0, M.y1 - M.y0));
      setZoom(M.zoom0 * d / M.dist0);
    }
    if (e.preventDefault) e.preventDefault();
  };
  const onMapUp = e => {
    if (M.n === 0) return;
    const id = pid(e), p = evPoint(e, mapCanvas);
    if (M.n === 1 && id === M.id0) {
      const now = e.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const quick = !(now - M.down > TAP_MS);
      M.n = 0; M.id0 = -1;
      if (!M.moved && quick && e.type !== 'pointercancel') tapMap(p.x, p.y);
    } else if (M.n === 2) {
      // one finger lifts: the other keeps panning from where it is, no tap can follow
      if (id === M.id0) { M.id0 = M.id1; M.x0 = M.x1; M.y0 = M.y1; }
      M.id1 = -1; M.n = 1; M.moved = true;
    } else return;
    try { if (mapCanvas.releasePointerCapture) mapCanvas.releasePointerCapture(id); } catch (err) { /* synthetic */ }
  };
  const onMapWheel = e => {
    if (e.preventDefault) e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : e.deltaY < 0 ? 1 : 0;
    if (!dir) return;
    const p = evPoint(e, mapCanvas);
    // the tile under the cursor stays put
    const mx = M.cx + (p.x - M.w / 2) / M.zoom, mz = M.cz + (p.y - M.h / 2) / M.zoom;
    setZoom(M.zoom * Math.pow(1.15, dir));
    M.cx = mx - (p.x - M.w / 2) / M.zoom; M.cz = mz - (p.y - M.h / 2) / M.zoom;
    clampCentre();
  };
  const onBackdrop = e => { if (e.target === modal) closeMap(); };
  const onClose = () => closeMap();
  const onGo = e => { if (e && e.preventDefault) e.preventDefault(); if (typeof ctx.onGo === 'function') ctx.onGo(); };
  const onResize = () => { if (M.open) sizeMap(); };

  /* the corner map: the wheel zooms, a tap opens the town map */
  const C = { down: false, x: 0, y: 0, moved: false, t: 0 };
  const onWheel = e => {
    if (e.preventDefault) e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
    if (!dir) return;
    scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * Math.pow(1.12, dir)));
    save();
  };
  const onCornerDown = e => {
    const p = evPoint(e, overlay);
    C.down = true; C.moved = false; C.x = p.x; C.y = p.y;
    C.t = e.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
  };
  const onCornerMove = e => {
    if (!C.down) return;
    const p = evPoint(e, overlay);
    if (Math.hypot(p.x - C.x, p.y - C.y) > TAP_PX) C.moved = true;
  };
  const onCornerUp = e => {
    if (!C.down) return;
    C.down = false;
    const now = e.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!C.moved && !(now - C.t > TAP_MS) && e.type !== 'pointercancel') openMap();
  };
  const typing = tgt => {
    const tag = tgt && tgt.tagName ? String(tgt.tagName).toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(tgt && tgt.isContentEditable);
  };
  /* M toggles the corner map, Shift+M the town map (when the caller leaves the keys to the module) */
  const onKey = e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'm' && e.key !== 'M') return;
    if (typing(e.target)) return;
    if (e.shiftKey || M.open) { if (M.open) closeMap(); else openMap(); return; }
    toggle();
  };
  /* while the town map is open Esc closes it and G is Go; captured before anyone else sees them */
  const onKeyCapture = e => {
    if (!M.open || typing(e.target)) return;
    if (e.key === 'Escape') { closeMap(); }
    else if (e.key === 'g' || e.key === 'G') { if (!e.repeat) onGo(null); }
    else return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else if (e.stopPropagation) e.stopPropagation();
  };
  const listen = (t, n, f, o) => { if (t && t.addEventListener) t.addEventListener(n, f, o); };
  const unlisten = (t, n, f, o) => { if (t && t.removeEventListener) t.removeEventListener(n, f, o); };
  listen(el, 'wheel', onWheel, { passive: false });
  listen(overlay, 'pointerdown', onCornerDown); listen(overlay, 'pointermove', onCornerMove);
  listen(overlay, 'pointerup', onCornerUp); listen(overlay, 'pointercancel', onCornerUp);
  listen(mapCanvas, 'pointerdown', onMapDown); listen(mapCanvas, 'pointermove', onMapMove);
  listen(mapCanvas, 'pointerup', onMapUp); listen(mapCanvas, 'pointercancel', onMapUp);
  listen(mapCanvas, 'wheel', onMapWheel, { passive: false });
  listen(modal, 'click', onBackdrop);
  listen(closeBtn, 'click', onClose);
  listen(goBtn, 'click', onGo);
  listen(win, 'resize', onResize);
  if (ctx.keys !== false) listen(win, 'keydown', onKey);
  listen(win, 'keydown', onKeyCapture, true);

  function destroy() {
    closeMap();
    unlisten(el, 'wheel', onWheel);
    unlisten(overlay, 'pointerdown', onCornerDown); unlisten(overlay, 'pointermove', onCornerMove);
    unlisten(overlay, 'pointerup', onCornerUp); unlisten(overlay, 'pointercancel', onCornerUp);
    unlisten(mapCanvas, 'pointerdown', onMapDown); unlisten(mapCanvas, 'pointermove', onMapMove);
    unlisten(mapCanvas, 'pointerup', onMapUp); unlisten(mapCanvas, 'pointercancel', onMapUp);
    unlisten(mapCanvas, 'wheel', onMapWheel);
    unlisten(modal, 'click', onBackdrop);
    unlisten(closeBtn, 'click', onClose);
    unlisten(goBtn, 'click', onGo);
    unlisten(win, 'resize', onResize);
    if (ctx.keys !== false) unlisten(win, 'keydown', onKey);
    unlisten(win, 'keydown', onKeyCapture, true);
    if (el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el);
    if (card.parentNode && card.parentNode.removeChild) card.parentNode.removeChild(card);
    if (ownModal && modal.parentNode && modal.parentNode.removeChild) modal.parentNode.removeChild(modal);
  }

  /* the laid out label boxes in map px at the current zoom (for tests; allocates) */
  function labelBoxes() {
    ensureLayout();
    const out = [];
    for (let i = 0; i < nL; i++) if (SHOWN[i]) out.push({ text: LT[i], x: BX[i], y: BY[i], w: LW[i], h: LH[i] });
    return out;
  }

  return {
    el, update, setVisible, toggle, destroy,
    openMap, closeMap, isOpen, setWaypoint, setRoute, onWaypoint, labelBoxes,
    get visible() { return visible; },
    get scale() { return scale; },
    set scale(v) { if (isFinite(v)) { scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, +v)); save(); } },
    get size() { return size; },
    get waypoint() { return wpSet ? WP : null; },
    get route() { return route; },
    get zoom() { return M.zoom; },
    set zoom(v) { setZoom(+v); },
    get centre() { return M; },
    get labelCount() { return nL; },
    get mapEl() { return modal; },
    get phone() { return phone; },
    mapCanvas, base, overlay,
    get mapBase() { return mapBase; },
    tap: tapMap,
  };
}

export default createMinimap;
