/* Thread Town: the corner minimap (CONTRACT_V11 "The minimap").

   createMinimap(ctx) -> { el, update(view), setVisible(on), toggle(), visible, scale, destroy() }

   ctx = {
     sim,       TT.sim (COLS, ROWS, at, TILES); the base layer is painted once from its tile grid
     state,     TT.state (buildings, lots, agents, scooters, settings)
     depts,     TT.DEPARTMENTS (accent colours; falls back to window.TT.DEPARTMENTS)
     mount,     the #minimap div the frame is appended to (optional; the caller may append `el`)
     storage,   a localStorage like object (getItem, setItem); defaults to window.localStorage
     onToggle,  optional (on) hook called when M flips the map
     keys,      false to leave the M key to the caller (toggle() stays available)
   }
   view = {
     x, z,      the visitor's world position (z is the sim's y)
     yaw,       the chase camera yaw: 0 faces +z (south), Math.PI faces north; the map rotates so
                this direction is up
     target,    { x, z } or null: the prompt target, the cup of the hole in play, the ball between
                shots, the rack a ride is heading to, the dock when boating; drawn as a pulsing
                salmon ring. The caller reuses one object; the map never keeps a reference.
     mode,      'walk', 'scooter', 'hover', 'boat', 'golf' or 'cart' show the map; anything else
                (orbit, board, interior, subway) hides it for the frame. Omitted means shown.
     time,      optional seconds for the ring pulse (defaults to performance.now())
   }

   Two canvases: a base painted once from the raster (water aqua, roads silver, paths sand, the
   course in two greens, bridges and decks, the plaza, buildings as department blocks, fillers
   grey) and an overlay repainted at most once per frame: the whole base image drawn rotated
   about the visitor and clipped to the rounded frame, then the visitor's white arrow, agents as
   department dots, scooters as ticks, the target ring and the north tick on the frame.

   Scale: 0.2 tiles per px (a 40 tile window at 200 px); the wheel over the map zooms between
   0.1 and 0.5. 200 px, 160 under 980 px wide (css/style.css's #minimap breakpoint; a mount
   with a measurable width sets the size instead). M toggles (remembered under
   'threadtown.minimap.v1' together with the zoom). update() allocates nothing: the transforms
   and the pulse are scalars on a preallocated record and no closure is created per frame. */

const NAVY = '#002D4F', AQUA = '#75CCD0', SALMON = '#E7706F', SILVER = '#E2E9EE';
const STORAGE_KEY = 'threadtown.minimap.v1';
const SIZE_WIDE = 200, SIZE_NARROW = 160, NARROW_BELOW = 980;   // the breakpoint matches css/style.css (#minimap at max-width 980px)
const SCALE_DEFAULT = 0.2, SCALE_MIN = 0.1, SCALE_MAX = 0.5;
const BASE_PX = 6;              // base layer pixels per tile (zoom never upsamples past 1.7x)
const CORNER = 18;              // the frame's corner radius in css px
const SHOWN_MODES = { walk: 1, scooter: 1, hover: 1, boat: 1, golf: 1, cart: 1 };

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

/* Paints the whole raster once at BASE_PX per tile. Every tile class the sim knows gets its
   colour; building records paint over the B tiles in their department colour. */
function paintBase(g, sim, state, cols, rows) {
  const T = sim.TILES || {};
  const byType = new Array(32).fill(COLOUR.G);
  for (const k in COLOUR) if (T[k] !== undefined) byType[T[k]] = COLOUR[k];
  g.fillStyle = COLOUR.G;
  g.fillRect(0, 0, cols * BASE_PX, rows * BASE_PX);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = sim.at(x, y);
      const c = byType[t] || COLOUR.G;
      if (c === COLOUR.G) continue;
      g.fillStyle = c;
      g.fillRect(x * BASE_PX, y * BASE_PX, BASE_PX, BASE_PX);
    }
  }
  const paintTiles = (tiles, colour) => {
    if (!tiles) return;
    g.fillStyle = colour;
    for (const t of tiles) g.fillRect(t.x * BASE_PX, t.y * BASE_PX, BASE_PX, BASE_PX);
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
}

export function createMinimap(ctx) {
  ctx = ctx || {};
  const sim = ctx.sim || (typeof window !== 'undefined' && window.TT ? window.TT.sim : null);
  const state = ctx.state || (sim && sim.state) || {};
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  const win = ctx.window || (typeof window !== 'undefined' ? window : null);
  if (!sim || !doc) throw new Error('Thread Town: createMinimap needs ctx.sim and a document');
  const cols = sim.COLS | 0, rows = sim.ROWS | 0;
  let storage = ctx.storage;
  if (storage === undefined) { try { storage = win && win.localStorage ? win.localStorage : null; } catch (e) { storage = null; } }

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
  const narrow = !!(win && isFinite(win.innerWidth) && win.innerWidth < NARROW_BELOW);
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
  const overlay = canvasOf(doc, size * dpr, size * dpr);
  const os = overlay.style || {};
  os.width = size + 'px'; os.height = size + 'px'; os.display = 'block';
  el.appendChild(overlay);
  if (ctx.mount && ctx.mount.appendChild) ctx.mount.appendChild(el);

  /* the base layer, painted once */
  const base = canvasOf(doc, Math.max(1, cols * BASE_PX), Math.max(1, rows * BASE_PX));
  const bg = base.getContext('2d');
  paintBase(bg, sim, state, cols, rows);
  const g = overlay.getContext('2d');

  /* per frame scratch, allocated once */
  const F = {
    cx: size * dpr / 2, cy: size * dpr / 2, r: size * dpr / 2, px: size * dpr,
    k: 0, rot: 0, c: 1, s: 0,       // px per tile, the rotation and its cos and sin
    vx: 0, vz: 0,                   // the visitor
    shownMode: true, drawn: false, hidden: false,
    lastT: -1, nAgents: 0,
    font: Math.round(9 * dpr) + 'px sans-serif',
  };
  const agents = () => state.agents;
  const EMPTY = [];

  function applyVisibility() {
    const show = visible && F.shownMode;
    if (F.hidden !== !show) { F.hidden = !show; st.display = show ? 'block' : 'none'; }
  }
  applyVisibility();

  /* map (tile) point to overlay px, written into out.x and out.y; no allocation */
  const PT = { x: 0, y: 0 };
  function project(mx, mz) {
    const dx = (mx - F.vx) * F.k, dz = (mz - F.vz) * F.k;
    PT.x = F.cx + dx * F.c - dz * F.s;
    PT.y = F.cy + dx * F.s + dz * F.c;
    return PT;
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

  function update(view) {
    if (!view) return;
    const mode = view.mode;
    F.shownMode = !mode || SHOWN_MODES[mode] === 1;
    applyVisibility();
    if (F.hidden) { F.drawn = false; return; }
    const t = isFinite(view.time) ? view.time : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    F.vx = isFinite(view.x) ? view.x : F.vx;
    F.vz = isFinite(view.z) ? view.z : F.vz;
    const yaw = isFinite(view.yaw) ? view.yaw : 0;
    // facing (sin yaw, cos yaw) in map space must point up (0, -1) on screen: rotate the map by
    // -(pi / 2) - atan2(cos yaw, sin yaw), which simplifies to yaw - pi
    F.rot = yaw - Math.PI;
    F.c = Math.cos(F.rot); F.s = Math.sin(F.rot);
    F.k = dpr / scale;

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

    // scooters as ticks along their yaw
    const sc = state.scooters || EMPTY;
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.5 * dpr; g.lineCap = 'round';
    for (let i = 0; i < sc.length; i++) {
      const s = sc[i];
      if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
      const p = project(s.x, s.y);
      const px = p.x, py = p.y;
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
      const p = project(a.pos.x, a.pos.y);
      const px = p.x, py = p.y;
      if (px < -8 || py < -8 || px > F.px + 8 || py > F.px + 8) continue;
      g.fillStyle = a.dept && a.dept.accent ? a.dept.accent : NAVY;
      g.beginPath(); g.arc(px, py, dotR, 0, 6.283185307179586); g.fill();
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 0.8 * dpr; g.stroke();
      nAgents++;
    }

    // the target: a pulsing salmon ring
    const tg = view.target;
    if (tg && isFinite(tg.x) && isFinite(tg.z)) {
      const p = project(tg.x, tg.z);
      let px = p.x, py = p.y;
      // keep an off map target on the rim so it still points the way
      const ddx = px - F.cx, ddy = py - F.cy, dd = Math.hypot(ddx, ddy), rim = F.r - 9 * dpr;
      if (dd > rim) { px = F.cx + ddx / dd * rim; py = F.cy + ddy / dd * rim; }
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
      const rr = (4 + 2.5 * pulse) * dpr;
      g.strokeStyle = SALMON; g.lineWidth = (1.6 + 0.6 * pulse) * dpr;
      g.beginPath(); g.arc(px, py, rr, 0, 6.283185307179586); g.stroke();
      g.fillStyle = SALMON;
      g.beginPath(); g.arc(px, py, 1.4 * dpr, 0, 6.283185307179586); g.fill();
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

    F.drawn = true; F.lastT = t; F.nAgents = nAgents;
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

  /* the wheel over the map zooms; M toggles */
  const onWheel = e => {
    if (e.preventDefault) e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
    if (!dir) return;
    scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * Math.pow(1.12, dir)));
    save();
  };
  const onKey = e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'm' && e.key !== 'M') return;
    const tgt = e.target;
    const tag = tgt && tgt.tagName ? String(tgt.tagName).toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (tgt && tgt.isContentEditable)) return;
    toggle();
  };
  if (el.addEventListener) el.addEventListener('wheel', onWheel, { passive: false });
  if (ctx.keys !== false && win && win.addEventListener) win.addEventListener('keydown', onKey);

  function destroy() {
    if (el.removeEventListener) el.removeEventListener('wheel', onWheel);
    if (ctx.keys !== false && win && win.removeEventListener) win.removeEventListener('keydown', onKey);
    if (el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el);
  }

  return {
    el, update, setVisible, toggle, destroy,
    get visible() { return visible; },
    get scale() { return scale; },
    set scale(v) { if (isFinite(v)) { scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, +v)); save(); } },
    get size() { return size; },
    base, overlay,
  };
}

export default createMinimap;
