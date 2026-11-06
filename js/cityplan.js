/* Thread Town city plan v3 (docs/CONTRACT_V10.md "The plan v3", geography in docs/WORLD_DESIGN.md).
   PLAN is plain data in tile units; validatePlan(plan, rasterized) checks it and rasterizePlan(plan)
   turns it into the logic grid the sim, the terrain and the city dressing share.

   Conventions used by every entry below:
   - Tile (x, y) covers world x..x+1, y..y+1; its center is (x + 0.5, y + 0.5). y grows south.
   - Polygons are lists of [x, y] corner points in tile edge coordinates. A tile belongs to a
     polygon when its center is inside.
   - Roads are Catmull-Rom splines through pts (two points give a straight line, three or more a
     curve). A tile is road when its center lies within width / 2 of the sampled curve, sidewalk
     when it lies within width / 2 + 1 and is not road. Kinds and widths: avenue 4 (median),
     boulevard 3, street 2, lane 2, path 1, switchback 2, cartpath 1.
   - Lots are given by their center (cx, cy, world units), canonical size (w, h: the door is on
     the canonical south face) and rot, any angle in degrees. rot turns the canonical frame about
     the lot center the way the sim's rotVec does: 90 puts the door on the east face, 180 north,
     270 west, and 35 is thirty five degrees from the first. x, y are the north-west tile of the
     axis-aligned bounding box (exact for 0, 90, 180 and 270) so readers of the old shape still work.
   - Bridges: a and b are the first and last deck tiles of a straight axis-aligned span; the tile
     just beyond each end must be road, sidewalk or path, and the span must cross water.
   - Districts carry a landform for terrain v2: { kind, center, radius or polygon, height }.

   This file is also evaluated by the classic sim script with its export keywords stripped, so it
   has no imports and no top level await. */

/* Department footprints, copied from js/data.js so this module has no dependency on the browser
   globals. validatePlan prefers globalThis.TT.DEPARTMENTS when it exists. */
export const DEPT_FOOTPRINTS = {
  exec: { w: 12, h: 7 }, embedded: { w: 10, h: 6 }, compliance: { w: 10, h: 6 }, fcc: { w: 9, h: 6 },
  ops: { w: 11, h: 6 }, data: { w: 9, h: 6 }, credit: { w: 10, h: 6 }, finance: { w: 8, h: 6 },
  tech: { w: 11, h: 6 }, risk: { w: 12, h: 7 }, marketing: { w: 10, h: 6 }, people: { w: 9, h: 5 },
};
/* Station side per department (js/data.js station), for the rasterized station rectangle. */
const DEPT_STATION_SIDE = {
  exec: 'right', embedded: 'right', compliance: 'left', fcc: 'right', ops: 'left', data: 'right',
  credit: 'left', finance: 'right', tech: 'left', risk: 'right', marketing: 'left', people: 'right',
};

/* Canonical department lot size: w = max(footprint.w, 10) + 2, h = footprint.h + 7. */
export function deptLotSize(fp) { return { w: Math.max(fp.w, 10) + 2, h: fp.h + 7 }; }

/* ---------- rotation (the sim's rotVec, generalized to any angle) ---------- */
const DEG = Math.PI / 180;
/* Rotates a canonical offset (dx, dy) from the lot center into the world. 90 turns canonical
   south (0, 1) into east (1, 0), 180 into north, 270 into west; any angle in between is allowed. */
export function rotVec(rot, dx, dy) {
  const r = ((rot % 360) + 360) % 360;
  if (r === 0) return { x: dx, y: dy };
  if (r === 90) return { x: dy, y: -dx };
  if (r === 180) return { x: -dx, y: -dy };
  if (r === 270) return { x: -dy, y: dx };
  const c = Math.cos(r * DEG), s = Math.sin(r * DEG);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/* Lot center in world units. Lots written with cx, cy use them; older lots (x, y of the world
   rect, rot in 90 degree steps) derive the center from the rect. */
export function lotCenter(lot) {
  if (Number.isFinite(lot.cx) && Number.isFinite(lot.cy)) return { x: lot.cx, y: lot.cy };
  const swap = lot.rot === 90 || lot.rot === 270;
  const W = swap ? lot.h : lot.w, H = swap ? lot.w : lot.h;
  return { x: lot.x + W / 2, y: lot.y + H / 2 };
}
/* Canonical continuous point (origin at the canonical north-west corner) to world. */
export function lotToWorld(lot, px, py) {
  const c = lotCenter(lot);
  const d = rotVec(lot.rot || 0, px - lot.w / 2, py - lot.h / 2);
  return { x: c.x + d.x, y: c.y + d.y };
}
/* World point back to the canonical frame. */
export function lotToLocal(lot, wx, wy) {
  const c = lotCenter(lot);
  const d = rotVec(-(lot.rot || 0), wx - c.x, wy - c.y);
  return { x: lot.w / 2 + d.x, y: lot.h / 2 + d.y };
}
/* The four world corners of a canonical rectangle (lx, ly, lw, lh) inside the lot, clockwise
   from the canonical north-west corner. */
export function lotRectCorners(lot, lx, ly, lw, lh) {
  return [[lx, ly], [lx + lw, ly], [lx + lw, ly + lh], [lx, ly + lh]].map(([px, py]) => { const p = lotToWorld(lot, px, py); return [p.x, p.y]; });
}
/* Tiles whose center lies inside the rotated canonical rectangle. */
export function lotRectTiles(lot, lx, ly, lw, lh) {
  const corners = lotRectCorners(lot, lx, ly, lw, lh);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of corners) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = [];
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
    const l = lotToLocal(lot, x + 0.5, y + 0.5);
    if (l.x >= lx && l.x < lx + lw && l.y >= ly && l.y < ly + lh) out.push({ x, y });
  }
  return out;
}
/* The world tile under a canonical tile's center. */
export function lotTile(lot, lx, ly) { const p = lotToWorld(lot, lx + 0.5, ly + 0.5); return { x: Math.floor(p.x), y: Math.floor(p.y) }; }

/* World rectangle of a lot: the axis-aligned bounding box of the rotated footprint in whole
   tiles (x, y, w, h; exact for 0, 90, 180 and 270), plus the center, the angle, the exact
   corners (clockwise from the canonical north-west corner) and the facing of the door. */
export function lotWorldRect(lot) {
  const c = lotCenter(lot);
  const rot = lot.rot || 0;
  const corners = lotRectCorners(Object.assign({}, lot, { cx: c.x, cy: c.y }), 0, 0, lot.w, lot.h);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of corners) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const eps = 1e-6;
  const bx = Math.floor(x0 + eps), by = Math.floor(y0 + eps), ex = Math.ceil(x1 - eps), ey = Math.ceil(y1 - eps);
  return { x: bx, y: by, w: ex - bx, h: ey - by, cx: c.x, cy: c.y, rot, corners, facing: rotVec(rot, 0, 1), aligned: rot % 90 === 0 };
}

/* The tiles just outside a lot's door edge (the canonical south edge after rotation), listed
   from the canonical west end to the east end, the two central ones (where the canonical stub
   leaves the lot), the edge's two world corners and the facing. Works for any angle. */
export function lotDoorEdge(lot) {
  const tiles = [], seen = new Set();
  for (let lx = 0; lx < lot.w; lx++) {
    const p = lotToWorld(lot, lx + 0.5, lot.h + 0.5);
    const t = { x: Math.floor(p.x), y: Math.floor(p.y) };
    const k = t.x + ',' + t.y;
    if (seen.has(k)) continue;
    seen.add(k); tiles.push(t);
  }
  const mid = Math.floor(tiles.length / 2);
  const corners = lotRectCorners(lot, 0, lot.h, lot.w, 0);
  return { tiles, center: [tiles[Math.max(0, mid - 1)], tiles[Math.min(tiles.length - 1, mid)]], corners: [corners[0], corners[1]], facing: rotVec(lot.rot || 0, 0, 1) };
}

/* ---------- lot builders (data helpers) ---------- */
function bboxNW(lot) { const r = lotWorldRect(lot); return { x: r.x, y: r.y }; }
/* A lot at any angle from its center. w, h are the canonical sizes. */
function lot(id, kind, cx, cy, w, h, rot, extra) {
  const l = Object.assign({ id, kind, cx, cy, w, h, rot: rot || 0 }, extra || {});
  Object.assign(l, bboxNW(l));
  return l;
}
function dept(id, cx, cy, rot) {
  const s = deptLotSize(DEPT_FOOTPRINTS[id]);
  return lot('dept-' + id, 'dept:' + id, cx, cy, s.w, s.h, rot);
}
function filler(id, kind, style, seed, cx, cy, w, h, rot) { return lot(id, kind, cx, cy, w, h, rot, { style, seed }); }

/* ---------- polygons, segments, splines ---------- */
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function distToLine(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, distToSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}
const tileInPoly = (x, y, pts) => pointInPoly(x + 0.5, y + 0.5, pts);
function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}
/* Separating axis test between two convex polygons (lot footprints). */
function polysOverlap(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const nx = q[1] - p[1], ny = p[0] - q[0];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const v of a) { const d = v[0] * nx + v[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const v of b) { const d = v[0] * nx + v[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
  }
  return true;
}

/* Catmull-Rom sampling of a control polyline (uniform, tension 0.5, ends clamped). Two points
   give the straight segment. step is the sample spacing in tiles. */
export function splineSamples(pts, step) {
  step = step || 0.25;
  if (!pts || pts.length < 2) return (pts || []).map(p => [p[0], p[1]]);
  const out = [];
  const P = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(segLen / step * 1.3));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1]]);
  return out;
}
/* Length of the sampled curve. */
export function splineLength(pts) {
  const s = splineSamples(pts, 0.5);
  let l = 0;
  for (let i = 1; i < s.length; i++) l += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return l;
}

/* A ribbon polygon of half width hw around a centerline (the river, the lake inlet). */
export function ribbon(center, hw) {
  const left = [], right = [];
  for (let i = 0; i < center.length; i++) {
    const p = center[i], a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const w = Array.isArray(hw) ? hw[i] : hw;
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  return left.concat(right.reverse());
}
/* A smooth blob polygon: an ellipse with a seeded wobble, for the lake and the island. */
export function blob(cx, cy, rx, ry, n, wobble, seed) {
  const pts = [];
  let s = (seed || 7) >>> 0;
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9E3779B9) >>> 0; return (s >>> 8) / 16777216; };
  const w = [];
  for (let i = 0; i < n; i++) w.push(1 + (rnd() - 0.5) * 2 * (wobble || 0));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const k = (w[(i + n - 1) % n] + 2 * w[i] + w[(i + 1) % n]) / 4;
    pts.push([Math.round((cx + Math.cos(a) * rx * k) * 10) / 10, Math.round((cy + Math.sin(a) * ry * k) * 10) / 10]);
  }
  return pts;
}

/* ---------- placement helpers along splines ---------- */
/* Point and unit direction at fraction t (0..1 of the length) of a spline. */
export function alongSpline(pts, t) {
  const s = splineSamples(pts, 0.25);
  let total = 0;
  const cum = [0];
  for (let i = 1; i < s.length; i++) { total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); cum.push(total); }
  const want = Math.max(0, Math.min(1, t)) * total;
  let i = 1;
  while (i < s.length - 1 && cum[i] < want) i++;
  const a = s[i - 1], b = s[i];
  const seg = cum[i] - cum[i - 1] || 1, u = (want - cum[i - 1]) / seg;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return { x: a[0] + dx * u, y: a[1] + dy * u, dx: dx / len, dy: dy / len };
}
/* The fraction of a spline's length nearest to a point. */
export function nearestT(pts, x, y) {
  const s = splineSamples(pts, 0.25);
  let total = 0, best = 0, bd = Infinity, bestAt = 0;
  for (let i = 0; i < s.length; i++) {
    if (i) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    const d = Math.hypot(s[i][0] - x, s[i][1] - y);
    if (d < bd) { bd = d; bestAt = total; }
  }
  best = total ? bestAt / total : 0;
  return best;
}
/* A lot beside a road near the road point (px, py), on the right (+1) or left (-1) of travel,
   its near edge `off` tiles from the centerline and its door facing the road. */
function lotAlong(id, kind, style, seed, pts, px, py, side, off, w, h, rotNudge) {
  const p = alongSpline(pts, nearestT(pts, px, py));
  const nx = -p.dy * side, ny = p.dx * side;          // right of travel is (-dy, dx) with y south
  const cx = p.x + nx * (off + h / 2), cy = p.y + ny * (off + h / 2);
  const rot = Math.round((((Math.atan2(-nx, -ny) / DEG) % 360) + 360) % 360 + (rotNudge || 0));
  return kind.startsWith('dept:')
    ? dept(kind.slice(5), Math.round(cx * 2) / 2, Math.round(cy * 2) / 2, rot)
    : filler(id, kind, style, seed, Math.round(cx * 2) / 2, Math.round(cy * 2) / 2, w, h, rot);
}
/* A polygon offset outward from a convex-ish shoreline, for the shoreline path. */
function offsetPoly(pts, d) {
  const n = pts.length, out = [];
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0] / n; cy += p[1] / n; }
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    let ex = b[0] - a[0], ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
    let nx = ey, ny = -ex;
    if ((p[0] - cx) * nx + (p[1] - cy) * ny < 0) { nx = -nx; ny = -ny; }
    out.push([Math.round((p[0] + nx * d) * 2) / 2, Math.round((p[1] + ny * d) * 2) / 2]);
  }
  return out;
}

/* ================= the geography (docs/WORLD_DESIGN.md) ================= */
export const COLS = 192, ROWS = 144;

/* The river: enters the north edge east of center, cuts south-west through the bluff gorge and
   the plaza reach, then runs south along the links to leave through the south edge. */
export const RIVER_CENTER = [[128, -6], [125, 6], [121, 18], [116, 30], [111, 40], [106, 50], [100, 60], [95, 70], [91, 80], [89, 90], [90, 100], [92, 112], [94, 126], [95, 138], [96, 150]];
export const RIVER_HALF_WIDTH = 4;
/* The lake in the south-west, its island (hole 6) and the shoreline path. */
export const LAKE = [[16, 108], [22, 105], [30, 104], [38, 105], [45, 107], [52, 109], [56, 112], [57.5, 116], [56.5, 122], [53, 126], [47, 130], [39, 132], [30, 132], [22, 129], [15.5, 124], [11.5, 118], [11, 112], [13, 109]];
export const ISLAND = blob(45.5, 118.5, 4.6, 4.2, 16, 0, 61);
export const LAKESHORE = offsetPoly(LAKE, 1.6);

/* Roads (splines). Widths follow the kind. */
const AVENUE = [[62, 0], [64, 14], [66, 30], [66, 48], [66, 84], [68, 92]];
const LINKS_ROAD = [[2, 96], [20, 95], [40, 94], [60, 93], [68, 93], [78, 92], [82, 92]];
const ORCHARD = [[63, 61], [48, 61], [36, 64], [28, 67], [26, 68], [2, 68]];
const SWITCHBACK = [[46, 62], [42, 58], [36, 54], [30, 51], [26, 49], [22, 47], [25, 44.5], [30, 43], [38, 41.5], [46, 40], [50, 38.5], [52, 36], [49.5, 33.5], [42, 32], [34, 31], [27, 30], [23, 28.5], [20.5, 26], [23, 23], [29, 22], [34, 21.5], [38, 22]];
const HARBOR_LANE = [[63, 14], [50, 12], [36, 10], [20, 10], [6, 12]];
const WEST_LANE = [[6, 12], [4, 30], [4, 50], [6, 68]];
const MEADOW_LANE = [[6, 68], [8, 84], [14, 95]];
const BLUFF_ROAD = [[68, 40], [84, 40], [96, 39], [104, 38]];
const RIVER_STREET = [[68, 77], [86, 77]];
const LEDGER = [[120, 38], [191, 38]];
const HARBOR_STREET = [[130, 12], [150, 12], [170, 12], [191, 12]];
const MINT = [[152, 2], [154, 12], [154, 38], [155, 52]];
const EAST_STREET = [[182, 2], [182, 12], [182, 36], [180, 50], [176, 62], [172, 77]];
const FOUNDRY = [[99, 77], [140, 77], [191, 77]];
const MILL_ROAD = [[104, 78], [106, 88], [104, 96], [103, 99]];
const RIVERSIDE_WALK = [[119.5, 44.5], [117.5, 50.5], [111.5, 58.5], [106.5, 66.5], [102.5, 72.5], [100.5, 76.5]];
const BLUFF_WALK = [[120.5, 40.5], [120.5, 44.5]];
const PARK_PATH = [[62.5, 76.5], [56.5, 73.5], [41, 73.5], [40.5, 80.5], [41.5, 90.5]];
const CART_LINK = [[79.5, 107.5], [81.5, 103.5], [83.5, 100.5]];
/* Cart paths keep one clear tile between them and every tee box (a path tile sharing a vertex
   with the box would pin that corner to the path's grade and the box could not be level; validatePlan
   checks it). The west loop passes tee 6 on its south side, the east loop tee 2 on its south side. */
/* v11: after hole 9's green the west loop runs down the creek's west bank and crosses the creek
   mouth on the cart bridge it shares with the lakeshore path (row 106), then follows the range's
   south edge to the clubhouse. */
const WEST_CART = [[72.5, 107.5], [78.5, 108.5], [80.5, 112.5], [85.5, 117.5], [84.5, 123.5], [80.5, 128.5], [75.5, 134.5], [66.5, 135.5], [64.5, 128.5], [64.5, 123.5], [61.5, 123.5], [58.5, 125.5], [57.5, 130.5], [55.5, 136.5], [50.5, 135.5], [30.5, 135.5], [12.5, 135.5], [10.5, 131.5], [9.5, 126.5], [3.5, 122.5], [2.5, 116.5], [2.5, 110.5], [6.5, 105.5], [12.5, 100.5], [24.5, 98.5], [38.5, 97.5], [45.5, 97.5], [46.5, 100.5], [46.5, 104.5], [46.5, 106.5], [47.5, 106.5], [51.5, 106.5], [52.5, 106.5], [54.5, 107.5], [63.5, 107.5], [72.5, 107.5]];
/* v11: the park path's south branch along the pond lot's south edge, over the creek footbridge to
   the avenue (three collinear points keep the row straight through the bridge). */
const CREEK_PATH = [[41.5, 89.5], [47.5, 89.5], [63.5, 89.5]];
const ISLAND_PATH = [[44.5, 135.5], [44.5, 131.5]];
const EAST_CART = [[97.5, 100.5], [103.5, 102.5], [112.5, 106.5], [124.5, 112.5], [138.5, 113.5], [145.5, 117.5], [156.5, 128.5], [158.5, 135.5], [140.5, 142.5], [118.5, 142.5], [113.5, 139.5], [111.5, 133.5], [110.5, 126.5], [111.5, 118.5], [104.5, 118.5], [102.5, 112.5], [100.5, 105.5], [97.5, 100.5]];

export const ROADS = [
  { id: 'thread-avenue', name: 'Thread Avenue', pts: AVENUE, width: 4, kind: 'avenue', sidewalks: true, purpose: 'the north to south spine on the west bank, from the hill foot past the plaza to Links Road' },
  { id: 'bluff-road', name: 'Bluff Road', pts: BLUFF_ROAD, width: 2, kind: 'street', sidewalks: true, purpose: 'from the avenue east to the high bridge; the cafe, Financial Crimes and Marketing front it' },
  { id: 'river-street', name: 'River Street', pts: RIVER_STREET, width: 2, kind: 'street', sidewalks: true, purpose: 'the plaza south edge to the low bridge' },
  { id: 'orchard-street', name: 'Orchard Street', pts: ORCHARD, width: 2, kind: 'street', sidewalks: true, purpose: 'the hill south flank: People, the zoo, the church, the foot of the switchback' },
  { id: 'ridge-road', name: 'Ridge Road', pts: SWITCHBACK, width: 2, kind: 'switchback', sidewalks: false, purpose: 'the switchback up the hill south-east face, three hairpins, residential lots stepping up' },
  { id: 'harbor-lane', name: 'Harbor Lane', pts: HARBOR_LANE, width: 2, kind: 'lane', sidewalks: false, purpose: 'the hill north foot from the avenue to the west edge' },
  { id: 'west-lane', name: 'West Lane', pts: WEST_LANE, width: 2, kind: 'lane', sidewalks: false, purpose: 'the hill west foot, Harbor Lane to Orchard Street' },
  { id: 'meadow-lane', name: 'Meadow Lane', pts: MEADOW_LANE, width: 2, kind: 'lane', sidewalks: false, purpose: 'Orchard Street down to Links Road past the school' },
  { id: 'links-road', name: 'Links Road', pts: LINKS_ROAD, width: 2, kind: 'street', sidewalks: true, purpose: 'the links north edge from the west edge to the river, the clubhouse and the park gate' },
  { id: 'ledger-street', name: 'Ledger Street', pts: LEDGER, width: 2, kind: 'street', sidewalks: true, purpose: 'downtown main street on the bluff, from the high bridge east' },
  { id: 'harbor-street', name: 'Harbor Street', pts: HARBOR_STREET, width: 2, kind: 'street', sidewalks: true, purpose: 'the bluff north street' },
  { id: 'mint-street', name: 'Mint Street', pts: MINT, width: 2, kind: 'street', sidewalks: true, purpose: 'downtown cross street' },
  { id: 'east-street', name: 'East Street', pts: EAST_STREET, width: 2, kind: 'street', sidewalks: true, purpose: 'the bluff east street, descending to the industrial flats' },
  { id: 'foundry-street', name: 'Foundry Street', pts: FOUNDRY, width: 2, kind: 'street', sidewalks: true, purpose: 'the industrial flats, from the low bridge east' },
  { id: 'mill-road', name: 'Mill Road', pts: MILL_ROAD, width: 2, kind: 'street', sidewalks: true, purpose: 'the east bank south from Foundry Street to the links gate' },
  { id: 'riverside-walk', name: 'Riverside walk', pts: RIVERSIDE_WALK, width: 1, kind: 'path', sidewalks: false, purpose: 'the east bank walk under the bluff wall, from the stairs to the low bridge' },
  { id: 'bluff-stairs', name: 'Bluff stairs', pts: BLUFF_WALK, width: 1, kind: 'path', sidewalks: false, purpose: 'the stairs from Ledger Street down the retaining wall to the riverside walk' },
  { id: 'park-path', name: 'Park path', pts: PARK_PATH, width: 1, kind: 'path', sidewalks: false, purpose: 'from the avenue through the park past the pond to Links Road' },
  { id: 'creek-path', name: 'Creek path', pts: CREEK_PATH, width: 1, kind: 'path', sidewalks: false, purpose: 'the park path south branch along the pond lot, over the creek footbridge to the avenue' },
  { id: 'lakeshore-path', name: 'Lakeshore path', pts: LAKESHORE.concat([LAKESHORE[0]]), width: 1, kind: 'path', sidewalks: false, purpose: 'the shoreline walk around the lake, past the marina and the island bridge' },
  { id: 'cart-link', name: 'Clubhouse cart link', pts: CART_LINK, width: 1, kind: 'cartpath', sidewalks: false, purpose: 'from the clubhouse to the links footbridge and the east bank loop' },
  { id: 'west-cart', name: 'West cart path', pts: WEST_CART, width: 1, kind: 'cartpath', sidewalks: false, purpose: 'the cart loop for holes 5 to 9 around the lake' },
  { id: 'island-path', name: 'Island spur', pts: ISLAND_PATH, width: 1, kind: 'cartpath', sidewalks: false, purpose: 'the spur from the cart loop to the island footbridge' },
  { id: 'east-cart', name: 'East cart path', pts: EAST_CART, width: 1, kind: 'cartpath', sidewalks: false, purpose: 'the cart loop for holes 1 to 4 on the east bank' },
];

/* The hill switchback legs (for lots stepping up the slope): road point, downhill normal. */
const HILL_LOTS = [
  lotAlong('hl-1', 'rowhouse', 'brick', 41, SWITCHBACK, 36, 54, -1, 1.7, 10, 5),    // leg 1, below the road (left of travel)
  lotAlong('hl-5', 'rowhouse', 'stone', 45, SWITCHBACK, 31, 22.5, -1, 1.7, 8, 5),   // leg 4, above the road at the ridge top
  lotAlong('hl-2', 'apartment', 'aqua', 42, SWITCHBACK, 36, 42, 1, 1.7, 8, 6),      // leg 2, below the road
  lotAlong('hl-3', 'rowhouse', 'stone', 43, SWITCHBACK, 36, 31.3, -1, 1.7, 10, 5),  // leg 3, below the road
  lotAlong('hl-4', 'rowhouse', 'cream', 44, SWITCHBACK, 31, 22.5, 1, 1.7, 10, 5),   // leg 4, below the road, near the top
];

const LOTS = [
  /* downtown on the bluff (north-east, +5): five departments and the towers */
  dept('exec', 131, 29, 0),                 // Executive, faces south onto Ledger Street, the bluff edge behind it
  dept('tech', 145.5, 29.5, 0),             // Technology, faces south onto Ledger Street
  dept('compliance', 162, 29.5, 0),         // Compliance, faces south onto Ledger Street across Mint Street
  dept('finance', 174, 29.5, 0),            // Accounting, faces south onto Ledger Street by East Street
  dept('credit', 131, 46.5, 180),           // Credit, faces north onto Ledger Street above the gorge
  filler('dt-tower-1', 'tower', 'glass', 11, 144, 46, 12, 12, 180),   // faces Ledger Street
  filler('dt-office-1', 'office', 'stone', 13, 162, 45, 10, 10, 180), // faces Ledger Street
  filler('dt-office-2', 'office', 'glass', 19, 174, 45, 10, 10, 180), // faces Ledger Street, East Street beside it
  filler('dt-shop-1', 'shop', 'coffee', 12, 140, 17, 6, 6, 180),      // faces Harbor Street
  filler('dt-shop-2', 'shop', 'barber', 15, 147, 17, 6, 6, 180),
  filler('dt-parking', 'parking', 'lot', 14, 170, 17, 10, 6, 180),    // faces Harbor Street
  filler('dt-tower-2', 'tower', 'stone', 16, 188, 29, 8, 8, 270),     // faces west onto East Street
  filler('dt-ap-1', 'apartment', 'cream', 17, 140, 6, 8, 8, 0),       // north side of Harbor Street
  filler('dt-ap-2', 'apartment', 'salmon', 18, 162, 6, 8, 8, 0),

  /* riverside, the plaza district (center, 0) and the north bank terrace */
  dept('fcc', 75.5, 30, 270),               // Financial Crimes, faces west onto Thread Avenue
  lotAlong('dept-marketing', 'dept:marketing', null, 0, BLUFF_ROAD, 91.5, 39.4, -1, 2.1, 12, 13),   // Marketing, turned to face Bluff Road toward the gorge
  lot('cafe', 'cafe', 76, 50, 12, 12, 0),   // the cafe north of the plaza, door and terrace toward the plaza, the avenue beside it
  filler('rs-shop-1', 'shop', 'books', 31, 86, 47, 6, 6, 180),        // Bluff Road, by the river bank
  filler('rs-shop-2', 'shop', 'flowers', 32, 93, 47, 6, 6, 180),
  filler('rs-parking', 'parking', 'lot', 34, 73, 82, 10, 6, 180),     // River Street, south of the plaza
  filler('rs-diner', 'diner', 'chrome', 48, 82, 82, 6, 6, 180),       // River Street, by the low bridge
  lot('pond', 'pond', 49, 81.5, 14, 13, 0), // the park pond lot, the pier on its south shore

  /* the hill district (north-west, ridge +9) */
  dept('people', 54, 53, 0),                // People, faces south onto Orchard Street at the hill foot
  dept('risk', 20, 77, 180),                // Risk, the zoo, faces north onto Orchard Street below the hill
  filler('church', 'church', 'stone', 47, 34, 74, 7, 8, 180),         // Orchard Street, steeple toward the hill
  filler('school', 'school', 'brick', 46, 24, 89, 16, 6, 0),          // faces south onto Links Road
  filler('hn-1', 'apartment', 'cream', 51, 40, 5, 8, 8, 0),           // Harbor Lane, the hill north foot
  filler('hn-2', 'rowhouse', 'stone', 52, 26, 6, 10, 5, 0),
  filler('hn-3', 'apartment', 'brick', 53, 54, 7, 8, 8, 0),
  filler('hw-1', 'rowhouse', 'cream', 54, 9.5, 40, 8, 5, 270),        // West Lane, faces west
  filler('ap-nw-1', 'apartment', 'salmon', 55, 57, 22, 8, 8, 90),     // the avenue, faces east
  filler('ap-nw-2', 'apartment', 'aqua', 56, 58, 32, 8, 8, 90),   // one tile east of the design's 57 so it shares no vertex with Ridge Road's hairpin behind it
  filler('rh-av', 'rowhouse', 'brick', 57, 58.5, 42, 10, 5, 90),
  ...HILL_LOTS,

  /* the industrial flats (east, 0) */
  dept('ops', 120.5, 68.5, 0),              // Operations, faces south onto Foundry Street
  dept('data', 134, 68.5, 0),               // Data, faces south onto Foundry Street
  filler('in-ware-1', 'warehouse', 'sawtooth', 22, 147, 69, 10, 12, 0),
  dept('embedded', 160, 68.5, 0),           // Embedded Banking, faces south onto Foundry Street
  filler('in-ware-4', 'warehouse', 'barrel', 26, 183, 69, 8, 12, 0),
  filler('in-gas', 'gas', 'canopy', 23, 118, 82, 10, 6, 180),         // faces north onto Foundry Street
  filler('in-ware-2', 'warehouse', 'barrel', 24, 134, 84, 10, 10, 180),
  filler('in-parking', 'parking', 'lot', 21, 150, 82, 10, 6, 180),
  filler('in-ware-3', 'warehouse', 'sawtooth', 25, 166, 84, 12, 10, 180),

  /* the links */
  lot('clubhouse', 'clubhouse', 72, 101, 14, 12, 180),   // Thread National clubhouse, faces north onto Links Road
];

/* The golf area: the whole south band on both banks, the lake included, with a notch for the
   clubhouse lot. */
const GOLF_AREA = [[2, 97], [64, 97], [64, 107], [79, 107], [79, 95], [86, 95], [96, 96], [98, 102], [190, 102], [190, 143], [2, 143]];

/* Straight-line hole length limits by par (tiles), CONTRACT_V10 "Thread National". */
export const HOLE_LENGTHS = { 3: [11, 16], 4: [22, 32], 5: [34, 46] };

const HOLES = [
  { n: 1, name: 'Flats', par: 4, tee: { x: 116, y: 104, elev: 0.4 }, cup: { x: 142, y: 110 },
    line: [[116, 104], [128, 106], [137, 109], [142, 110]], fairwayWidth: 7, greenR: 3,
    bunkers: [{ x: 138, y: 113, r: 1.5 }, { x: 145, y: 107, r: 1.3 }], water: [],
    story: 'A gentle opener east along the foot of the industrial flats; the tee sits 0.4 above a fairway that rolls down to a green guarded on the right by sand.' },
  { n: 2, name: 'Drop', par: 3, tee: { x: 148, y: 114, elev: 1.2 }, cup: { x: 160, y: 124 },
    line: [[148, 114], [160, 124]], fairwayWidth: 5, greenR: 2.5,
    bunkers: [{ x: 157, y: 127, r: 1.4 }, { x: 163, y: 121, r: 1.2 }], water: [],
    story: 'An elevated tee 1.2 above a green that sits in a hollow; two bunkers pinch the front.' },
  { n: 3, name: 'Riverward', par: 5, tee: { x: 162, y: 132, elev: 1.5 }, cup: { x: 122, y: 138 },
    line: [[162, 132], [150, 136], [136, 139], [122, 138]], fairwayWidth: 7, greenR: 3,
    bunkers: [{ x: 130, y: 135, r: 1.5 }, { x: 144, y: 134, r: 1.3 }, { x: 119, y: 135, r: 1.2 }], water: [],
    story: 'The downhill par 5 toward the river: from the highest tee on the course the fairway falls 2.5 over forty tiles to a green on the river bank.' },
  { n: 4, name: 'The Climb', par: 4, tee: { x: 114, y: 134, elev: 0 }, cup: { x: 108, y: 112 },
    line: [[114, 134], [112, 126], [109, 118], [108, 112]], fairwayWidth: 6, greenR: 2.5,
    bunkers: [{ x: 105, y: 115, r: 1.4 }, { x: 112, y: 110, r: 1.2 }], water: [],
    story: 'The uphill par 4 to a plateau green 1.2 above the fairway, beside the footbridge back to the clubhouse; the river waits long and left.' },
  { n: 5, name: 'Bankside', par: 4, tee: { x: 82, y: 110, elev: 0.8 }, cup: { x: 70, y: 131 },
    line: [[82, 110], [78, 118], [73, 126], [70, 131]], fairwayWidth: 6, greenR: 2.5,
    bunkers: [{ x: 74, y: 129, r: 1.3 }, { x: 66, y: 127, r: 1.2 }], water: [],
    story: 'Back on the west bank behind the clubhouse, a tee 0.8 up on the river bank plays down the strip between the river and the lake; the drive must carry the channel that cuts across the fairway on its way from the lake to the river, then the green sits between two bunkers.' },
  { n: 6, name: 'The Island', par: 3, tee: { x: 60, y: 119, elev: 0.2 }, cup: { x: 45, y: 118 },   // v12.1: a shore tee nearly flush (1.0 stood as a block beside the marina footbridge)
    line: [[60, 119], [45, 118]], fairwayWidth: 4, greenR: 2.6, collarR: 4.0,
    bunkers: [], water: [], island: { pts: ISLAND, height: 0.6 }, bridge: 'island-bridge',
    story: 'The par 3 over water: a tee 1.0 above the lake shore, eight tiles of carry to an island green with a sand collar, and a wooden footbridge from the south shore for the walk out. A ball in the lake drops on the tee side.' },
  { n: 7, name: 'Shoreline', par: 5, tee: { x: 54, y: 138, elev: 0.6 }, cup: { x: 14, y: 140 },
    line: [[54, 138], [40, 140], [26, 141], [14, 140]], fairwayWidth: 5, greenR: 2.5,
    bunkers: [{ x: 30, y: 137, r: 1.4 }, { x: 18, y: 137, r: 1.3 }], water: [],
    story: 'A long run west along the lake south shore on rolling ground between the water and the map edge; mounds on the lake side kick balls back toward the fairway.' },
  { n: 8, name: 'West Wind', par: 3, tee: { x: 5, y: 130, elev: 0.5 }, cup: { x: 6, y: 116 },
    line: [[5, 130], [6, 116]], fairwayWidth: 5, greenR: 2.5,
    bunkers: [{ x: 3, y: 120, r: 1.2 }, { x: 9, y: 119, r: 1.2 }], water: [],
    story: 'North along the lake west shore to a small green tucked between a bunker and the water.' },
  /* v11: the green moved two tiles east onto the creek's west bank (the creek runs 48..50, the
     green ends at 44), so a long or pushed approach is wet; the back bunker became a short-left
     one under the cart path, the bend bunker stays. 28.1 tiles, par 4 range 22..32. */
  { n: 9, name: 'Homeward', par: 4, tee: { x: 14, y: 102, elev: 0.3 }, cup: { x: 42, y: 100 },
    line: [[14, 102], [26, 99], [36, 100], [42, 100]], fairwayWidth: 6, greenR: 2.5,
    bunkers: [{ x: 35, y: 103, r: 1.3 }, { x: 38, y: 98, r: 1.1 }], water: [],
    story: 'The dogleg around the hill foot: the fairway bends right around a knoll below Links Road and climbs to a green on the bank of the creek, which runs down the right side to the lake; anything long or right is wet, a short cart ride from the clubhouse.' },
];

/* ================= v11: the waterway, docks, kickers, the kiosk (docs/V11_DESIGN.md) ================= */
/* Waterways are water splines like the roads: a tile is water when its center lies within
   width / 2 - 0.1 of the sampled curve (the margin keeps a straight run exactly `width` tiles
   wide). `level` is the rendered surface, `bed` the terrain bed, `bank` the bank width in tiles,
   `slow` the boat slow zone, `body` the renderer's water body (one surface per body). The creek is
   two reaches of one body (2 wide through the pond lot and the park, 3 wide on the links) at the
   lake level, with the weir at the pond mouth; the channel runs at the lake level too and meets
   the river over a 0.2 sill. */
const CREEK_PARK = [[51, 84.5], [51, 89.5], [51, 95.5]];
const CREEK_LINKS = [[50.5, 95.5], [49.5, 98.5], [49.5, 104.5], [49.5, 109.5]];
/* The channel ends one tile short of the river's west bank (x 89): its last mask column is x 88, so
   the channel-sill edge x = 89 is the only level step and no channel tile lies inside the river. */
const CHANNEL = [[55.5, 113.5], [58.5, 113.5], [64.5, 113.5], [70.5, 115.5], [76.5, 118.5], [81.5, 120.5], [86.5, 120.5], [88, 120.5]];
export const WATERWAYS = [
  { id: 'creek-park', name: 'The creek (park reach)', body: 'creek', pts: CREEK_PARK, width: 2, level: -0.9, bed: -1.3, bank: [2, 2], slow: true, from: 'pond', to: 'creek-links', purpose: 'from the pond mouth east of the pier down through the pond lot and the park, under the creek footbridge and Links Road' },
  { id: 'creek-links', name: 'The creek (links reach)', body: 'creek', pts: CREEK_LINKS, width: 3, level: -0.9, bed: -1.6, bank: [2, 2], slow: true, from: 'creek-park', to: 'lake', purpose: 'the creek widens below Links Road, runs down the right side of hole 9 and enters the lake north shore under the cart bridge' },
  { id: 'channel', name: 'The channel', body: 'channel', pts: CHANNEL, width: 3, level: -0.9, bed: -1.6, bank: [2, 2], slow: false, from: 'lake', to: 'river', purpose: 'from the lake east shore north of the marina, across hole 5 to the river below the links footbridge' },
];
/* Where water levels step: a lip across the waterway, `upper` and `lower` the two surfaces. */
export const WEIRS = [
  { id: 'pond-weir', x: 50, y: 84, axis: 'x', length: 2, upper: 0.04, lower: -0.9, purpose: 'the pond spills into the creek at its mouth, east of the pier' },
  { id: 'channel-sill', x: 89, y: 119, axis: 'y', length: 3, upper: -0.7, lower: -0.9, purpose: 'the river steps down into the channel at its mouth' },
];
/* Boat docks: the dock tile (a deck or bank tile), rot in the plan's facing convention (the open
   water is at rotVec(rot, 0, -1) from the tile: 0 north, 90 west, 180 south, 270 east) and yaw the
   moored boat's heading in the sim's convention (yaw 0 faces +z south, atan2(x, z)): the heading of
   the slip direction, so the bow points from the dock tile into the open water (rot 0 gives PI,
   not 0: a yaw of rot * DEG would point the bow into the dock). */
const dock = (id, x, y, rot, name) => { const d = rotVec(rot, 0, -1); return { id, x, y, rot, yaw: Math.atan2(d.x, d.y), name }; };
export const DOCKS = [
  dock('marina-1', 56, 115, 0, 'Marina slip 1'),
  dock('marina-2', 54, 115, 0, 'Marina slip 2'),
  dock('marina-3', 55, 115, 180, 'Marina slip 3'),
  dock('pier-east', 49, 85, 270, 'The pier foot, east side'),   // the lawn tile south of the pier tile; its east flank is the creek one row below the pond weir (the weir's plunge tile (50, 84) is half dry, the pond interior is the swim area)
  dock('pond-landing', 52, 86, 90, 'Pond landing at the creek mouth'),
  dock('river-landing', 112, 46, 90, 'Riverside landing under the bluff stairs'),
];
/* Kicker ramps: the foot tile (x, y) and rot, the board launching toward rotVec(rot, 0, -1); the
   lip is the next tile that way, the ramp is those two tiles. */
export const KICKERS = [
  { id: 'bluff-kicker', x: 122, y: 29, rot: 0, name: 'Bluff edge kicker', purpose: 'north along the plateau strip between the bluff wall and Executive, off the wall at row 26 into the gorge over the river' },
  { id: 'ridge-kicker', x: 43, y: 21, rot: 0, name: 'Ridge lip kicker', purpose: 'off the ridge crest east of the ridge top rack, down the hill north flank' },
  { id: 'marina-kicker', x: 60, y: 110, rot: 180, name: 'Lake shore kicker', purpose: 'south off the lake east shore north of the marina, beside the lakeside bench, out over the channel mouth; the run up comes south along x 60 over the cart path (the tiles west of here share corners with the lakeshore path, which the terrain never lifts)' },
];
/* The shop kiosk beside the subway entrance: a 1 by 1 booth on the plaza, its window facing the
   front tile at rotVec(rot, 0, 1) (rot 0: south). */
export const KIOSK = { x: 77, y: 72, rot: 0, name: 'Thread shop kiosk' };

export const PLAN = {
  version: 4,
  cols: COLS, rows: ROWS,
  spawn: { x: 73, y: 60 },
  water: [
    { id: 'river', kind: 'river', pts: ribbon(RIVER_CENTER, RIVER_HALF_WIDTH), center: RIVER_CENTER, halfWidth: RIVER_HALF_WIDTH, height: -1.4, bank: [4, 8] },
    { id: 'lake', kind: 'lake', pts: LAKE, height: -1.6, bank: [3, 6] },
  ],
  waterways: WATERWAYS,
  weirs: WEIRS,
  roads: ROADS,
  /* `arch` lifts a deck above the straight ramp between its ends at mid-span (a humped deck) so
     the boats clear it: the contract blocks a deck under 1.2 above the water. */
  bridges: [
    { id: 'bluff-bridge', name: 'Bluff bridge', a: [105, 38], b: [119, 38], width: 3, kind: 'high', purpose: 'Bluff Road to Ledger Street over the gorge, from the north bank terrace up to the bluff' },
    { id: 'river-bridge', name: 'River Street bridge', a: [86, 77], b: [98, 77], width: 2, kind: 'low', arch: 0.6, purpose: 'River Street to Foundry Street, a low deck just above the plaza reach, arched 0.6 so the launches pass' },
    { id: 'links-footbridge', name: 'Links footbridge', a: [84, 100], b: [96, 100], width: 2, kind: 'foot', arch: 1.0, purpose: 'the cart path and walkers between the two halves of Thread National, an arched deck the boats pass under' },
    { id: 'island-bridge', name: 'Island footbridge', a: [44, 123], b: [44, 130], width: 1, kind: 'foot', island: true, purpose: 'the wooden spur from the south shore to the hole 6 island' },
    { id: 'creek-footbridge', name: 'Creek footbridge', a: [48, 89], b: [53, 89], width: 1, kind: 'foot', arch: 0, waterway: 'creek-park', purpose: 'the creek path over the creek at the pond lot south edge' },
    { id: 'creek-road-bridge', name: 'Links Road creek bridge', a: [47, 93], b: [54, 93], width: 3, kind: 'low', arch: 0.3, waterway: 'creek-park', purpose: 'Links Road over the creek, a low stone deck humped 0.4; three rows (92..94) so the road step from rows 93..94 to 92..93 at x 50 is on the deck and no paving tile abuts the creek' },
    { id: 'creek-cart-bridge', name: 'Creek mouth cart bridge', a: [47, 106], b: [51, 106], width: 2, kind: 'cart', arch: 0.6, waterway: 'creek-links', purpose: 'the west cart path and the lakeshore path over the creek mouth, a humpbacked plank deck two planks wide (rows 105..106) so the cart fits on it like the links footbridge' },
    { id: 'channel-footbridge', name: 'Marina footbridge', a: [58, 112], b: [58, 117], width: 1, kind: 'foot', arch: 0.6, waterway: 'channel', purpose: 'the lakeshore path over the channel mouth beside the marina, a humpbacked plank deck' },
    { id: 'channel-cart-bridge', name: 'Channel cart bridge', a: [85, 117], b: [85, 121], width: 2, kind: 'cart', arch: 0.5, waterway: 'channel', purpose: 'the west cart path over the channel near the river bank, two planks wide (x 84..85) so the cart fits on it like the links footbridge' },
  ],
  docks: DOCKS,
  kickers: KICKERS,
  kiosk: KIOSK,
  plaza: { pts: [[71, 56], [83, 56], [86, 59], [86, 71], [83, 74], [71, 74], [68, 71], [68, 59]] },
  fountain: { x: 77, y: 65 },
  subway: { x: 80, y: 72, rot: 0 },
  districts: [
    { id: 'park', name: 'The park', pts: [[36, 70], [63, 70], [63, 92], [36, 92]], treeDensity: 0.4,
      landform: { kind: 'flats', center: [49, 81], radius: 14, height: 0.4 } },
    { id: 'downtown', name: 'The bluff', pts: [[130, 0], [192, 0], [192, 56], [126, 56], [120, 48], [118, 40], [118, 32], [123, 22], [127, 10]], treeDensity: 0.05,
      landform: { kind: 'bluff', polygon: [[130, 0], [192, 0], [192, 56], [126, 56], [120, 48], [118, 40], [118, 32], [123, 22], [127, 10]], height: 5, wall: [[127, 10], [123, 22], [118, 32], [118, 40], [120, 48], [126, 56]] } },
    { id: 'industrial', name: 'The flats', pts: [[100, 58], [126, 56], [192, 56], [192, 102], [98, 102], [96, 96], [88, 74]], treeDensity: 0.04,
      landform: { kind: 'flats', center: [150, 80], radius: 50, height: 0 } },
    { id: 'northbank', name: 'The north bank terrace', pts: [[62, 0], [104, 0], [114, 20], [108, 36], [104, 40], [62, 40]], treeDensity: 0.12,
      landform: { kind: 'hill', center: [84, 10], radius: 40, height: 3 } },
    { id: 'riverside', name: 'Riverside', pts: [[62, 40], [104, 40], [100, 58], [88, 74], [86, 96], [62, 96]], treeDensity: 0.14,
      landform: { kind: 'flats', center: [77, 66], radius: 24, height: 0 } },
    { id: 'residential', name: 'The hill', pts: [[0, 0], [62, 0], [62, 96], [0, 96]], treeDensity: 0.22,
      landform: { kind: 'hill', center: [33, 27], radius: 36, height: 9, ridge: [[18, 34], [33, 27], [46, 16]] } },
    { id: 'lake', name: 'The lake', pts: LAKE, treeDensity: 0,
      landform: { kind: 'lake', polygon: LAKE, height: -1.6 } },
    { id: 'links', name: 'Thread National', pts: GOLF_AREA, treeDensity: 0.12,
      landform: { kind: 'links', polygon: GOLF_AREA, height: 1.0, range: [-0.5, 2.5] } },
    { id: 'valley', name: 'The river valley', pts: ribbon(RIVER_CENTER, 11), treeDensity: 0.08,
      landform: { kind: 'valley', polygon: ribbon(RIVER_CENTER, 11), line: RIVER_CENTER, height: -1.4, bank: [4, 8] } },
  ],
  lots: LOTS,
  golf: {
    name: 'Thread National',
    area: { pts: GOLF_AREA },
    clubhouse: { x: 69, y: 102, w: 6, h: 4, rot: 180 },
    range: { x: 52, y: 97, w: 10, h: 8, rot: 180 },
    entranceSign: { x: 64, y: 93, rot: 0 },
    holes: HOLES,
  },
  scooterRacks: [
    { x: 72, y: 58, near: 'plaza' }, { x: 84, y: 72, near: 'plaza, subway' },
    { x: 83, y: 52, near: 'cafe' }, { x: 68, y: 33, near: 'fcc' }, { x: 99, y: 36, near: 'marketing' },
    { x: 128, y: 36, near: 'exec' }, { x: 137, y: 41, near: 'credit, tech' }, { x: 167, y: 36, near: 'compliance, finance' },
    { x: 149, y: 13, near: 'downtown north' }, { x: 117, y: 45, near: 'bluff stairs' },   // beside the riverside walk at the stairs foot (122,45 is on the wall's slope)
    { x: 127, y: 75, near: 'ops, data' }, { x: 152, y: 75, near: 'embedded' }, { x: 140, y: 79, near: 'industrial south' }, { x: 184, y: 79, near: 'industrial east' },
    { x: 46, y: 59, near: 'people' }, { x: 28, y: 69, near: 'risk zoo' }, { x: 40, y: 21, near: 'ridge top' }, { x: 16, y: 11, near: 'harbor lane' },   // the lane's level west reach (40,13 is on the hill's north flank)
    { x: 40, y: 89, near: 'park gate, pond' }, { x: 63, y: 95, near: 'clubhouse' }, { x: 63, y: 110, near: 'marina' },   // v11: moved off the channel mouth to the bank by the bench
    { x: 78, y: 78, near: 'river street, diner' }, { x: 101, y: 97, near: 'links east gate' }, { x: 110, y: 102, near: 'first tee' },
  ],
  pier: { x: 49, y: 84, rot: 0 },
  marina: { x: 58, y: 115, rot: 90, slips: 4, name: 'Lakeside marina' },
  stairs: [{ id: 'bluff-stairs', from: [120, 40], to: [120, 44], drop: 5 }],
  seatsExtra: [
    { x: 73, y: 62, face: { x: 77.5, y: 65.5 }, kind: 'bench' }, { x: 82, y: 62, face: { x: 77.5, y: 65.5 }, kind: 'bench' },
    { x: 73, y: 69, face: { x: 77.5, y: 65.5 }, kind: 'bench' }, { x: 82, y: 69, face: { x: 77.5, y: 65.5 }, kind: 'bench' },
    { x: 89, y: 60, face: { x: 95, y: 60.5 }, kind: 'bench' }, { x: 89, y: 70, face: { x: 94, y: 70.5 }, kind: 'bench' },
    { x: 121, y: 34, face: { x: 110, y: 34.5 }, kind: 'bench' }, { x: 121, y: 30, face: { x: 110, y: 30.5 }, kind: 'bench' },
    { x: 30, y: 103, face: { x: 30.5, y: 112 }, kind: 'bench' }, { x: 9, y: 109, face: { x: 20, y: 115 }, kind: 'bench' },   // the grass between the lakeshore path and the water, off hole 9's fairway
    { x: 61, y: 110, face: { x: 50, y: 114 }, kind: 'bench' }, { x: 37, y: 20, face: { x: 90, y: 60 }, kind: 'bench' },
  ],
  boardwalks: [
    { id: 'plaza-bank', pts: [[88, 58], [88, 73]], axis: 'y' },
    { id: 'lake-north', pts: [[24, 101], [36, 101]], axis: 'x' },
  ],
};

/* ---------- rasterization ---------- */
/* Marks used by the plan raster: the logic classes the sim, the terrain and the city dressing
   read. The first seven keep their v7 values; the rest are new in v10. */
export const MARK = {
  NONE: 0, WATER: 1, ROAD: 2, SIDEWALK: 3, BRIDGE: 4, PLAZA: 5, GOLF: 6,
  BUILDING: 7, STUB: 8, PARKING: 9, COURTYARD: 10, FAIRWAY: 11, GREEN: 12, TEE: 13, SAND: 14,
  PATH: 15, CARTPATH: 16, STATION: 17, DECK: 18, FEATURE: 19,
};
const M = MARK;
export const ROAD_KINDS = { avenue: 4, boulevard: 3, street: 2, lane: 2, path: 1, switchback: 2, cartpath: 1 };
const FILLER_KINDS = new Set(['apartment', 'shop', 'office', 'tower', 'diner', 'gas', 'warehouse', 'rowhouse', 'church', 'school', 'parking', 'courtyard']);
const FILLER_BUILDINGS = new Set(['apartment', 'shop', 'office', 'tower', 'diner', 'gas', 'warehouse', 'rowhouse', 'church', 'school']);
/* Marks a walker may cross (visitor rules: grass, paving, the course, decks, stubs, stations). */
export const WALKABLE_MARKS = new Set([M.NONE, M.ROAD, M.SIDEWALK, M.BRIDGE, M.PLAZA, M.GOLF, M.STUB, M.PARKING, M.COURTYARD, M.FAIRWAY, M.GREEN, M.TEE, M.SAND, M.PATH, M.CARTPATH, M.STATION, M.DECK]);
const isRoadish = v => v === M.ROAD || v === M.SIDEWALK || v === M.BRIDGE || v === M.PATH || v === M.CARTPATH;
const isStreet = v => v === M.ROAD || v === M.SIDEWALK || v === M.BRIDGE;

/* The canonical layout of a lot (the building rectangle, the door pair, the door tiles outside
   the door, the station and the work tile for departments), all in the lot's local frame. */
export function lotLayout(lot, plan) {
  const kind = lot.kind;
  if (kind.startsWith('dept:')) {
    const id = kind.slice(5);
    const fp = DEPT_FOOTPRINTS[id] || { w: 10, h: 6 };
    const fw = Math.min(12, fp.w), fh = Math.min(7, fp.h);
    const bx = 1 + Math.floor((lot.w - 2 - fw) / 2), by = 0;
    const door = { x: bx + Math.floor(fw / 2) - 1, y: by + fh - 1 };
    const side = DEPT_STATION_SIDE[id] === 'left' ? 'left' : 'right';
    const station = { x: side === 'right' ? door.x + 3 : door.x - 5, y: by + fh + 1, w: 4, h: 4, side };
    return { building: { x: bx, y: by, w: fw, h: fh }, door, doorTiles: [{ x: door.x, y: by + fh }, { x: door.x + 1, y: by + fh }], station, work: { x: station.x + 2, y: station.y + 2 }, stubFrom: { x: door.x, y: by + fh } };
  }
  if (kind === 'cafe') {
    return { building: { x: 0, y: 0, w: 6, h: 4 }, door: { x: 2, y: 3 }, doorTiles: [{ x: 2, y: 4 }, { x: 3, y: 4 }], terrace: { x: 6, y: 5, w: Math.min(6, lot.w - 6), h: Math.min(6, lot.h - 6) }, stubFrom: { x: 2, y: 4 } };
  }
  if (kind === 'clubhouse') {
    let bx = 4, by = 1;
    const spec = plan && plan.golf && plan.golf.clubhouse;
    if (spec && spec.rot === lot.rot) {
      const swap = spec.rot === 90 || spec.rot === 270;
      const ww = swap ? spec.h : spec.w, hh = swap ? spec.w : spec.h;
      const c = lotToLocal(lot, spec.x + ww / 2, spec.y + hh / 2);
      bx = Math.round(c.x - spec.w / 2); by = Math.round(c.y - spec.h / 2);
    }
    const door = { x: bx + 2, y: by + 3 };
    return { building: { x: bx, y: by, w: 6, h: 4 }, door, doorTiles: [{ x: bx + 2, y: by + 4 }, { x: bx + 3, y: by + 4 }], porch: { x: bx, y: by + 4, w: 6, h: 1 }, stubFrom: { x: bx + 2, y: by + 5 } };
  }
  if (FILLER_BUILDINGS.has(kind)) {
    const yard = lot.h >= 7 ? 2 : 0;
    const bw = lot.w, bh = lot.h - yard;
    const door = { x: Math.max(0, Math.floor(bw / 2) - 1), y: bh - 1 };
    return { building: { x: 0, y: 0, w: bw, h: bh }, door, doorTiles: [{ x: door.x, y: bh }, { x: Math.min(bw - 1, door.x + 1), y: bh }], yard, stubFrom: { x: door.x, y: bh } };
  }
  return { building: null, door: null, doorTiles: [], stubFrom: null };
}

/* Rasterizes the plan into a grid of MARK values in the order the sim paints (later marks win):
   water, roads and sidewalks, bridges, the plaza, lots (rotated footprints, stubs to the nearest
   road, stations), the course, the pond, the subway and fountain features, the pier and marina
   decks. Returns the grid with at(x, y), the per tile road index, and records for every lot
   (door tiles, stub, station, work tile), hole (tee and cup tiles), rack, and the pier, marina,
   subway and spawn, so validatePlan can run the reachability check without the sim. */
export function rasterizePlan(plan) {
  const cols = plan.cols, rows = plan.rows, N = cols * rows;
  const grid = new Uint8Array(N);
  const roadIdx = new Int16Array(N).fill(-1);
  const inMap = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const at = (x, y) => inMap(x, y) ? grid[y * cols + x] : M.NONE;
  const set = (x, y, v) => { if (inMap(x, y)) grid[y * cols + x] = v; };
  const eachInPoly = (pts, fn) => { const b = polyBounds(pts); for (let y = Math.max(0, b.y0 - 1); y <= Math.min(rows - 1, b.y1); y++) for (let x = Math.max(0, b.x0 - 1); x <= Math.min(cols - 1, b.x1); x++) if (tileInPoly(x, y, pts)) fn(x, y); };
  const waterPolys = (plan.water || []).map(w => w.pts);

  /* 1. water */
  for (const w of plan.water || []) eachInPoly(w.pts, (x, y) => set(x, y, M.WATER));
  /* 1b. waterways (v11): the creek and the channel, water splines stamped like the roads. The
     water layer is kept so the water under a bridge deck still counts for the boats. */
  const waterways = (plan.waterways || []).map(w => {
    const mask = waterwayMask(w, cols, rows);
    const tiles = new Set();
    for (let k = 0; k < N; k++) if (mask[k]) { grid[k] = M.WATER; tiles.add((k % cols) + ',' + Math.floor(k / cols)); }
    return { id: w.id, body: w.body || w.id, width: w.width, level: w.level, bed: w.bed, bank: w.bank, slow: !!w.slow, mask, tiles, samples: splineSamples(w.pts, 0.2) };
  });
  const waterwayAt = (x, y) => inMap(x, y) && waterways.some(w => w.mask[y * cols + x] === 1);
  const water = new Uint8Array(grid);
  const inWater = (x, y) => waterwayAt(x, y) || waterPolys.some(p => tileInPoly(x, y, p));

  /* 2. roads: the sampled spline stamps width / 2 (road) and width / 2 + 1 (sidewalk) around
     every sample; width 1 kinds stamp the tile under each sample and keep the line 4-connected. */
  const roads = (plan.roads || []).map((r, ri) => {
    const width = r.width || ROAD_KINDS[r.kind] || 2, hw = width / 2;
    const samples = splineSamples(r.pts, 0.2);
    const tiles = new Set();
    const mark = r.kind === 'cartpath' ? M.CARTPATH : r.kind === 'path' ? M.PATH : M.ROAD;
    if (width <= 1) {
      let px = -1, py = -1;
      for (const [sx, sy] of samples) {
        const x = Math.floor(sx), y = Math.floor(sy);
        if (px >= 0 && x !== px && y !== py) { const v = at(px, y); if (!isStreet(v)) { set(px, y, mark); roadIdx[y * cols + px] = ri; tiles.add(px + ',' + y); } }
        const v = at(x, y);
        if (!isStreet(v)) { set(x, y, mark); roadIdx[y * cols + x] = ri; tiles.add(x + ',' + y); }
        px = x; py = y;
      }
    } else {
      if (r.sidewalks) for (const [sx, sy] of samples) {
        const R = hw + 1;
        for (let y = Math.floor(sy - R); y <= Math.ceil(sy + R); y++) for (let x = Math.floor(sx - R); x <= Math.ceil(sx + R); x++) {
          if (!inMap(x, y)) continue;
          const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
          if (d > hw && d <= R) { const v = at(x, y); if (v === M.NONE || v === M.PATH || v === M.CARTPATH) set(x, y, M.SIDEWALK); }
        }
      }
      for (const [sx, sy] of samples) {
        for (let y = Math.floor(sy - hw); y <= Math.ceil(sy + hw); y++) for (let x = Math.floor(sx - hw); x <= Math.ceil(sx + hw); x++) {
          if (!inMap(x, y)) continue;
          if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) <= hw + 1e-9) { set(x, y, M.ROAD); roadIdx[y * cols + x] = ri; tiles.add(x + ',' + y); }
        }
      }
    }
    return { id: r.id, kind: r.kind, width, hw, samples, tiles, length: splineLength(r.pts) };
  });

  /* 3. bridges */
  const bridgeTiles = new Set();
  const bridges = [];   // v11: per bridge records { id, kind, arch, island, waterway, tiles } (boatWater reads them)
  for (const b of plan.bridges || []) {
    const [ax, ay] = b.a, [bx, by] = b.b;
    const offs = b.width >= 3 ? [-1, 0, 1] : b.width === 2 ? [-1, 0] : [0];
    const tiles = new Set();
    const stamp = (x, y) => { set(x, y, M.BRIDGE); bridgeTiles.add(x + ',' + y); tiles.add(x + ',' + y); };
    if (ax === bx) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (const o of offs) stamp(ax + o, y);
    else if (ay === by) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (const o of offs) stamp(x, ay + o);
    bridges.push({ id: b.id, kind: b.kind || 'low', arch: Number.isFinite(b.arch) ? b.arch : null, island: !!b.island, waterway: b.waterway || null, tiles });
  }

  /* 4. plaza */
  if (plan.plaza && plan.plaza.pts) eachInPoly(plan.plaza.pts, (x, y) => set(x, y, M.PLAZA));

  /* the base raster before lots and the course, for the overlap checks */
  const base = new Uint8Array(grid);
  const baseAt = (x, y) => inMap(x, y) ? base[y * cols + x] : M.NONE;

  /* 5. lots */
  const lotIdx = new Int16Array(N).fill(-1);
  const lotRecs = [];
  const bfsToRoad = (start, lotTiles) => {
    // the shortest 4-connected line from the door tile to the nearest street tile over tiles
    // that are not buildings or water (the lot's own grass, sidewalks, grass outside the lot)
    const seen = new Map(); const q = [start]; seen.set(start.x + ',' + start.y, null);
    let found = null;
    for (let i = 0; i < q.length && !found; i++) {
      const t = q[i];
      if (isStreet(at(t.x, t.y)) && !lotTiles.has(t.x + ',' + t.y)) { found = t; break; }
      if (i > 400) break;
      if (i > 0 && at(t.x, t.y) === M.BUILDING) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const x = t.x + dx, y = t.y + dy, k = x + ',' + y;
        if (!inMap(x, y) || seen.has(k)) continue;
        const v = at(x, y);
        if (v === M.WATER || v === M.FEATURE || v === M.PLAZA) continue;
        if (v === M.BUILDING && !lotTiles.has(k)) continue;
        seen.set(k, t); q.push({ x, y });
      }
    }
    if (!found) return null;
    const path = [];
    for (let t = found; t; t = seen.get(t.x + ',' + t.y)) path.push(t);
    return path.reverse();   // door tile first, the road tile last
  };
  for (const lot of plan.lots || []) {
    const L = lotLayout(lot, plan);
    const r = lotWorldRect(lot);
    const footTiles = lotRectTiles(lot, 0, 0, lot.w, lot.h);
    const footKeys = new Set(footTiles.map(t => t.x + ',' + t.y));
    const conflicts = [];
    for (const t of footTiles) {
      if (!inMap(t.x, t.y)) { conflicts.push({ x: t.x, y: t.y, what: 'map' }); continue; }
      const v = baseAt(t.x, t.y);
      // the creek mouth runs through the pond lot by design (v11), so the pond lot may hold waterway tiles
      if (v === M.WATER && !(lot.kind === 'pond' && waterwayAt(t.x, t.y))) conflicts.push({ x: t.x, y: t.y, what: 'water' });
      else if (v === M.ROAD) conflicts.push({ x: t.x, y: t.y, what: 'road' });
      else if (v === M.BRIDGE) conflicts.push({ x: t.x, y: t.y, what: 'bridge' });
      else if (v === M.PLAZA) conflicts.push({ x: t.x, y: t.y, what: 'plaza' });
      else if (v === M.PATH || v === M.CARTPATH) conflicts.push({ x: t.x, y: t.y, what: 'path' });
      else if (v === M.SIDEWALK && !FILLER_KINDS.has(lot.kind)) conflicts.push({ x: t.x, y: t.y, what: 'sidewalk' });
      if (lotIdx[t.y * cols + t.x] >= 0) conflicts.push({ x: t.x, y: t.y, what: 'lot ' + lotRecs[lotIdx[t.y * cols + t.x]].id });
    }
    const rec = { id: lot.id, kind: lot.kind, rect: r, cx: r.cx, cy: r.cy, rot: r.rot, corners: r.corners, w: lot.w, h: lot.h, tiles: footTiles, conflicts, local: L,
      footprint: null, doorTile: null, doorTile2: null, door: null, stub: [], stubLen: null, stubRoad: null, station: null, workTile: null, pondTiles: null };
    const idx = lotRecs.length;
    lotRecs.push(rec);
    for (const t of footTiles) if (inMap(t.x, t.y)) lotIdx[t.y * cols + t.x] = idx;
    if (lot.kind === 'parking') { for (const t of footTiles) set(t.x, t.y, M.PARKING); continue; }
    if (lot.kind === 'courtyard') { for (const t of footTiles) set(t.x, t.y, M.COURTYARD); continue; }
    if (lot.kind === 'pond') {
      // the pond ellipse (4.8 by 3.6 in the canonical frame) sits so the pier tile is the shore
      // tile at the end of the board; the board runs over the water the way the pier faces
      const pier = plan.pier;
      if (pier) {
        const prot = pier.rot || 0, dir = rotVec(prot, 0, -1);
        const swap = lot.rot === 90 || lot.rot === 270;
        const rx = swap ? 3.6 : 4.8, ry = swap ? 4.8 : 3.6;
        const along = dir.x ? rx : ry;
        const base0 = { x: pier.x + 0.5, y: pier.y + 0.5 };
        const center = { x: base0.x + dir.x * (along + 0.5), y: base0.y + dir.y * (along + 0.5) };
        const tiles = [];
        for (const t of footTiles) { const nx = (t.x + 0.5 - center.x) / rx, ny = (t.y + 0.5 - center.y) / ry; if (nx * nx + ny * ny <= 1 && at(t.x, t.y) === M.NONE) { set(t.x, t.y, M.WATER); tiles.push(t); } }
        rec.pondTiles = tiles; rec.pond = { center, rx, ry };
        for (let k = 1; k <= 3; k++) { const x = Math.floor(base0.x + dir.x * k), y = Math.floor(base0.y + dir.y * k); if (at(x, y) === M.WATER) set(x, y, M.DECK); }
      }
      continue;
    }
    if (!L.building) continue;
    const bTiles = lotRectTiles(lot, L.building.x, L.building.y, L.building.w, L.building.h);
    for (const t of bTiles) set(t.x, t.y, M.BUILDING);
    rec.footprint = { tiles: bTiles, corners: lotRectCorners(lot, L.building.x, L.building.y, L.building.w, L.building.h) };
    if (L.porch) for (const t of lotRectTiles(lot, L.porch.x, L.porch.y, L.porch.w, L.porch.h)) if (at(t.x, t.y) === M.NONE) set(t.x, t.y, M.STUB);
    if (L.station) {
      const sTiles = lotRectTiles(lot, L.station.x, L.station.y, L.station.w, L.station.h);
      for (const t of sTiles) if (at(t.x, t.y) === M.NONE || at(t.x, t.y) === M.GOLF) set(t.x, t.y, M.STATION);
      rec.station = { tiles: sTiles, corners: lotRectCorners(lot, L.station.x, L.station.y, L.station.w, L.station.h), side: L.station.side };
      rec.workTile = lotTile(lot, L.work.x - 0.5, L.work.y - 0.5);
      const wp = lotToWorld(lot, L.work.x, L.work.y); rec.workPos = { x: wp.x, y: wp.y };
    }
    rec.door = lotTile(lot, L.door.x, L.door.y);
    rec.doorTile = lotTile(lot, L.doorTiles[0].x, L.doorTiles[0].y);
    rec.doorTile2 = lotTile(lot, L.doorTiles[1].x, L.doorTiles[1].y);
    const dp = lotToWorld(lot, L.door.x + 1, L.door.y + 1.5); rec.doorPos = { x: dp.x, y: dp.y };
    // the stub: the shortest rasterized line from the door tile to the nearest street tile;
    // stubLen counts the tiles strictly between them (0 when the door tile touches the street)
    const start = lotTile(lot, L.stubFrom.x, L.stubFrom.y);
    const path = bfsToRoad(start, footKeys);
    if (path) {
      rec.stubRoad = path[path.length - 1];
      rec.stubLen = Math.max(0, path.length - 2);
      rec.stub = path.slice(0, -1);
      for (const t of rec.stub) { const v = at(t.x, t.y); if (v === M.NONE || v === M.GOLF || v === M.STATION) set(t.x, t.y, M.STUB); }
      rec.stubMouth = rec.stub.length ? rec.stub[rec.stub.length - 1] : start;
      // a door tile that rounding put on the building itself moves to the first walkable stub tile
      if (at(rec.doorTile.x, rec.doorTile.y) === M.BUILDING) { const w = rec.stub.find(t => at(t.x, t.y) !== M.BUILDING) || rec.stubRoad; rec.doorTile = { x: w.x, y: w.y }; }
      if (at(rec.doorTile2.x, rec.doorTile2.y) === M.BUILDING) rec.doorTile2 = { x: rec.doorTile.x, y: rec.doorTile.y };
    }
  }

  /* 6. the course: rough inside the area, the island, then per hole fairway, green, collar,
     tee, bunkers and hazard water; the range last. */
  const g = plan.golf;
  const holeRecs = [];
  let islandTiles = [];
  if (g && g.area) {
    const paintable = v => v === M.NONE || v === M.GOLF || v === M.FAIRWAY || v === M.GREEN || v === M.SAND || v === M.TEE;
    const setCourse = (x, y, v) => { if (inMap(x, y) && paintable(at(x, y))) { set(x, y, v); return true; } return false; };
    eachInPoly(g.area.pts, (x, y) => { if (at(x, y) === M.NONE) set(x, y, M.GOLF); });
    for (const h of g.holes || []) {
      if (h.island && h.island.pts) eachInPoly(h.island.pts, (x, y) => { if (at(x, y) === M.WATER || at(x, y) === M.NONE) { set(x, y, M.GOLF); islandTiles.push({ x, y }); } });
    }
    for (const h of g.holes || []) {
      const hw = (h.fairwayWidth || 5) / 2;
      const lb = polyBounds(h.line || [h.tee, h.cup].map(p => [p.x, p.y]));
      for (let y = Math.max(0, lb.y0 - 4); y <= Math.min(rows - 1, lb.y1 + 4); y++) for (let x = Math.max(0, lb.x0 - 4); x <= Math.min(cols - 1, lb.x1 + 4); x++) if (distToLine(x + 0.5, y + 0.5, h.line) <= hw) setCourse(x, y, M.FAIRWAY);
      const cr = h.greenR || 2.5, cupC = { x: h.cup.x + 0.5, y: h.cup.y + 0.5 };
      const collar = h.collarR || 0;
      for (let y = Math.floor(h.cup.y - collar - cr - 1); y <= Math.ceil(h.cup.y + collar + cr + 1); y++) for (let x = Math.floor(h.cup.x - collar - cr - 1); x <= Math.ceil(h.cup.x + collar + cr + 1); x++) {
        const d = Math.hypot(x + 0.5 - cupC.x, y + 0.5 - cupC.y);
        if (d <= cr) setCourse(x, y, M.GREEN); else if (collar && d <= collar) setCourse(x, y, M.SAND);
      }
      for (let y = h.tee.y; y <= h.tee.y + 1; y++) for (let x = h.tee.x; x <= h.tee.x + 1; x++) setCourse(x, y, M.TEE);
      for (const bk of h.bunkers || []) for (let y = Math.floor(bk.y - bk.r - 1); y <= Math.ceil(bk.y + bk.r + 1); y++) for (let x = Math.floor(bk.x - bk.r - 1); x <= Math.ceil(bk.x + bk.r + 1); x++) if (Math.hypot(x + 0.5 - (bk.x + 0.5), y + 0.5 - (bk.y + 0.5)) <= bk.r) setCourse(x, y, M.SAND);
      for (const w of h.water || []) eachInPoly(w.pts, (x, y) => setCourse(x, y, M.WATER));
      holeRecs.push({ n: h.n, par: h.par, name: h.name, teeTile: { x: h.tee.x, y: h.tee.y }, cupTile: { x: h.cup.x, y: h.cup.y }, length: Math.hypot(h.cup.x - h.tee.x, h.cup.y - h.tee.y), elev: h.tee.elev || 0, island: !!h.island });
    }
    if (g.range) {
      const rg = g.range, swap = rg.rot === 90 || rg.rot === 270;
      const ww = swap ? rg.h : rg.w, hh = swap ? rg.w : rg.h;
      const rl = { cx: rg.x + ww / 2, cy: rg.y + hh / 2, w: rg.w, h: rg.h, rot: rg.rot || 0 };
      for (const t of lotRectTiles(rl, 1, 0, rg.w - 2, rg.h - 1)) setCourse(t.x, t.y, M.FAIRWAY);
      for (const t of lotRectTiles(rl, 1, rg.h - 1, rg.w - 2, 1)) setCourse(t.x, t.y, M.TEE);
    }
  }

  /* 7. features: the subway footprint, the fountain basin, the marina deck */
  if (plan.subway) { const s = plan.subway; for (let y = s.y - 1; y <= s.y; y++) for (let x = s.x - 1; x <= s.x; x++) set(x, y, M.FEATURE); }
  if (plan.fountain) { const f = plan.fountain; for (let y = f.y - 1; y <= f.y + 1; y++) for (let x = f.x - 1; x <= f.x + 1; x++) set(x, y, M.FEATURE); }
  let marina = null;
  if (plan.marina) {
    const mr = plan.marina, dir = rotVec(mr.rot || 0, 0, -1);
    const deck = [];
    for (let k = 1; k <= 5; k++) { const x = mr.x + dir.x * k, y = mr.y + dir.y * k; if (at(x, y) === M.WATER) { set(x, y, M.DECK); deck.push({ x, y }); } }
    marina = { tile: { x: mr.x, y: mr.y }, rot: mr.rot || 0, dir, deck, slips: mr.slips || 4 };
  }

  /* 7b. v11: the shop kiosk (a feature tile on the plaza), the docks and the kickers as records */
  let kiosk = null;
  if (plan.kiosk) {
    const kk = plan.kiosk, f = rotVec(kk.rot || 0, 0, 1);
    set(kk.x, kk.y, M.FEATURE);
    kiosk = { tile: { x: kk.x, y: kk.y }, front: { x: kk.x + Math.round(f.x), y: kk.y + Math.round(f.y) }, rot: kk.rot || 0, yaw: (kk.rot || 0) * DEG };
  }
  const docks = (plan.docks || []).map(d => {
    const dir = rotVec(d.rot || 0, 0, -1), dx = Math.round(dir.x), dy = Math.round(dir.y);
    return { id: d.id, name: d.name || d.id, tile: { x: d.x, y: d.y }, slip: { x: d.x + dx, y: d.y + dy }, dir: { x: dx, y: dy }, rot: d.rot || 0, yaw: Math.atan2(dx, dy) };
  });
  const kickers = (plan.kickers || []).map(k => {
    const dir = rotVec(k.rot || 0, 0, -1), dx = Math.round(dir.x), dy = Math.round(dir.y);
    return { id: k.id, name: k.name || k.id, foot: { x: k.x, y: k.y }, lip: { x: k.x + dx, y: k.y + dy }, launch: { x: k.x + 2 * dx, y: k.y + 2 * dy }, dir: { x: dx, y: dy }, rot: k.rot || 0, yaw: (k.rot || 0) * DEG };
  });

  const racks = (plan.scooterRacks || []).map((k, i) => ({ id: 'rack' + i, x: k.x, y: k.y, near: k.near || '' }));
  const subway = plan.subway ? { tile: { x: plan.subway.x, y: plan.subway.y }, enter: [{ x: plan.subway.x - 1, y: plan.subway.y + 1 }, { x: plan.subway.x, y: plan.subway.y + 1 }] } : null;
  const pier = plan.pier ? { tile: { x: plan.pier.x, y: plan.pier.y }, rot: plan.pier.rot || 0 } : null;
  return { grid, base, cols, rows, at, baseAt, MARK: M, roadIdx, roads, bridgeTiles, bridges, lots: lotRecs, lotIdx, holes: holeRecs, islandTiles, racks, subway, pier, marina, spawn: plan.spawn, inWater,
    water, waterways, waterwayAt, kiosk, docks, kickers };
}

/* v11: the tile mask of a waterway (a water spline): a tile is water when its center lies within
   width / 2 - 0.1 of a sample of the curve (samples every 0.2 tiles), so a straight run on a tile
   center line is exactly `width` tiles wide. The terrain and the sim stamp the same mask. */
export function waterwayMask(w, cols, rows) {
  const mask = new Uint8Array(cols * rows);
  const r = Math.max(0.5, (w.width || 2) / 2 - 0.1);
  for (const [sx, sy] of splineSamples(w.pts, 0.2)) {
    for (let y = Math.floor(sy - r); y <= Math.ceil(sy + r); y++) for (let x = Math.floor(sx - r); x <= Math.ceil(sx + r); x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < r) mask[y * cols + x] = 1;
    }
  }
  return mask;
}

/* v11: the boat water (CONTRACT_V11 "Boats"): one byte per tile, 1 where a boat may float. The
   water layer of the raster (the river, the lake, the creek and the channel, counted under the
   bridge decks too) plus the pond, minus the island, the decks (the pier planks, the marina dock)
   and the pond swim area: the swim spots (pond tiles whose four neighbours are pond tiles, the
   sim's rule) plus their four neighbours. A dock's slip tile is always open. The water under a
   bridge deck that is not on the boat network (an `island` bridge, or any bridge without an
   `arch` other than a `high` one: a deck under 1.2 above the water blocks) is cleared from the mask
   after the BFS, so the sim, the player and the validator read the same blocked tiles while the
   reach still counts the water under it (the island ring is reached around the island bridge).
   Returns the mask, the swim spots, the excluded keys, the BFS start (the marina's first slip,
   else the first dock's), `reach`, the tiles the start reaches over 4-connected boat water, and
   `blocked`, the keys cleared under low decks. */
export function boatWater(R) {
  const cols = R.cols, rows = R.rows, N = cols * rows;
  const mask = new Uint8Array(R.water || N);
  const inMap = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const pond = (R.lots || []).find(l => l.kind === 'pond');
  const pondKeys = new Set();
  if (pond && pond.pondTiles) for (const t of pond.pondTiles) { pondKeys.add(t.x + ',' + t.y); mask[t.y * cols + t.x] = 1; }
  for (const t of R.islandTiles || []) mask[t.y * cols + t.x] = 0;
  for (let k = 0; k < N; k++) if (R.grid[k] === M.DECK) mask[k] = 0;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const swim = [];
  if (pond && pond.pondTiles) for (const t of pond.pondTiles) if (N4.every(([dx, dy]) => pondKeys.has((t.x + dx) + ',' + (t.y + dy)))) swim.push({ x: t.x, y: t.y });
  const excluded = new Set();
  for (const t of swim) { excluded.add(t.x + ',' + t.y); for (const [dx, dy] of N4) excluded.add((t.x + dx) + ',' + (t.y + dy)); }
  for (const k of excluded) { const [x, y] = k.split(',').map(Number); if (inMap(x, y)) mask[y * cols + x] = 0; }
  const docks = R.docks || [];
  for (const d of docks) { const s = d.slip; if (inMap(s.x, s.y) && ((R.water && R.water[s.y * cols + s.x]) || pondKeys.has(s.x + ',' + s.y))) mask[s.y * cols + s.x] = 1; }
  const first = docks.find(d => /^marina/.test(d.id)) || docks[0] || null;
  const start = first ? { x: first.slip.x, y: first.slip.y } : null;
  const reach = new Uint8Array(N);
  if (start && inMap(start.x, start.y) && mask[start.y * cols + start.x]) {
    const q = [start.x, start.y];
    reach[start.y * cols + start.x] = 1;
    for (let i = 0; i < q.length; i += 2) {
      const x = q[i], y = q[i + 1];
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const k = ny * cols + nx; if (reach[k] || !mask[k]) continue; reach[k] = 1; q.push(nx, ny); }
    }
  }
  const blocked = new Set();
  for (const b of R.bridges || []) {
    if (!b.closedToBoats) continue;   // v11.1: boats pass under every bridge unless the plan closes one
    for (const k of b.tiles) { const [x, y] = k.split(',').map(Number); if (inMap(x, y) && mask[y * cols + x]) { mask[y * cols + x] = 0; blocked.add(k); } }
  }
  return { mask, swim, excluded, start, reach, blocked, at: (x, y) => inMap(x, y) ? mask[y * cols + x] : 0, reaches: (x, y) => inMap(x, y) && reach[y * cols + x] === 1 };
}

/* ---------- validation ---------- */
/* Pars in order. The contract lists 4 3 5 4 3 4 5 3 4 and also makes hole 6 the par 3 over
   water; holes 5 and 6 swap pars so hole 6 is the island par 3 and the total stays 35. */
const PARS = [4, 3, 5, 4, 4, 3, 5, 3, 4];
const LANDFORM_KINDS = new Set(['hill', 'bluff', 'valley', 'lake', 'flats', 'links']);
const RACK_REACH = 14;   // every department door and attraction has a rack within this many tiles

export function validatePlan(plan, rasterized) {
  const issues = [];
  const add = s => issues.push(s);
  if (!plan || typeof plan !== 'object') return { ok: false, issues: ['plan missing'] };
  if (plan.cols !== 192 || plan.rows !== 144) add('map size must be 192 by 144, got ' + plan.cols + ' by ' + plan.rows);
  const cols = plan.cols || 0, rows = plan.rows || 0;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const R = (rasterized && rasterized.base && rasterized.lots) ? rasterized : rasterizePlan(plan);
  const waterPolys = (plan.water || []).map(w => w.pts);
  const inWater = (x, y) => (R.waterwayAt ? R.waterwayAt(x, y) : false) || waterPolys.some(p => tileInPoly(x, y, p));

  /* lots */
  const lots = plan.lots || [];
  const rects = lots.map(l => ({ lot: l, r: lotWorldRect(l) }));
  const seen = new Set();
  for (const { lot, r } of rects) {
    if (!lot.id || seen.has(lot.id)) add('lot id missing or duplicate: ' + lot.id);
    seen.add(lot.id);
    if (!Number.isFinite(lot.rot)) add('lot ' + lot.id + ' has rot ' + lot.rot);
    if (!(lot.w > 0 && lot.h > 0)) add('lot ' + lot.id + ' has an empty rectangle');
    for (const [x, y] of r.corners) if (x < -1e-6 || y < -1e-6 || x > cols + 1e-6 || y > rows + 1e-6) { add('lot ' + lot.id + ' leaves the map'); break; }
    const rec = R.lots.find(l => l.id === lot.id);
    if (rec) {
      const counts = {};
      for (const c of rec.conflicts) counts[c.what] = (counts[c.what] || 0) + 1;
      for (const k of Object.keys(counts)) add('lot ' + lot.id + ' overlaps ' + k + ' on ' + counts[k] + ' tile(s)');
      if (rec.doorTile) {
        if (rec.stubLen === null) add('lot ' + lot.id + ' door at ' + rec.doorTile.x + ',' + rec.doorTile.y + ' does not connect to a road');
        else if (rec.stubLen > 6) add('lot ' + lot.id + ' door is ' + rec.stubLen + ' walkable tiles from the nearest road (max 6)');
      }
    }
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (polysOverlap(rects[i].r.corners, rects[j].r.corners)) add('lots overlap: ' + rects[i].lot.id + ' and ' + rects[j].lot.id);
  }

  /* one department lot per id, canonical sizes */
  const deptIds = (globalThis.TT && globalThis.TT.DEPARTMENTS) ? globalThis.TT.DEPARTMENTS.map(d => d.id) : Object.keys(DEPT_FOOTPRINTS);
  for (const id of deptIds) { const n = lots.filter(l => l.kind === 'dept:' + id).length; if (n !== 1) add('department ' + id + ' has ' + n + ' lots'); }
  for (const l of lots) if (l.kind.startsWith('dept:') && !deptIds.includes(l.kind.slice(5))) add('unknown department lot ' + l.kind);
  for (const l of lots) if (l.kind.startsWith('dept:')) {
    const fp = DEPT_FOOTPRINTS[l.kind.slice(5)];
    if (fp) { const s = deptLotSize(fp); if (l.w !== s.w || l.h !== s.h) add('lot ' + l.id + ' canonical size should be ' + s.w + ' by ' + s.h); }
  }

  /* required features */
  const one = kind => lots.filter(l => l.kind === kind);
  if (one('cafe').length !== 1) add('exactly one cafe lot is required');
  if (one('clubhouse').length !== 1) add('exactly one clubhouse lot is required');
  if (one('pond').length !== 1) add('exactly one pond lot is required');
  for (const k of ['subway', 'fountain', 'spawn', 'pier', 'marina']) if (!plan[k]) add(k + ' missing');
  if (!plan.plaza || !plan.plaza.pts || plan.plaza.pts.length < 3) add('plaza missing');

  const inPlaza = (x, y) => !!(plan.plaza && plan.plaza.pts && tileInPoly(x, y, plan.plaza.pts));
  let plazaTiles = 0;
  if (plan.plaza && plan.plaza.pts) for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (inPlaza(x, y)) plazaTiles++;
  if (plazaTiles < 196) add('plaza has ' + plazaTiles + ' tiles, needs at least 196');
  if (plan.fountain) { const f = plan.fountain; for (let y = f.y - 1; y <= f.y + 1; y++) for (let x = f.x - 1; x <= f.x + 1; x++) if (!inPlaza(x, y)) add('fountain basin tile ' + x + ',' + y + ' is outside the plaza'); }
  if (plan.subway) {
    const s = plan.subway;
    for (let y = s.y - 1; y <= s.y; y++) for (let x = s.x - 1; x <= s.x; x++) if (!inPlaza(x, y)) add('subway footprint tile ' + x + ',' + y + ' is outside the plaza');
    for (let x = s.x - 1; x <= s.x; x++) if (!inPlaza(x, s.y + 1)) add('subway enter row tile ' + x + ',' + (s.y + 1) + ' is outside the plaza');
    if (inPlaza(s.x, s.y + 2) || inPlaza(s.x - 1, s.y + 2)) add('subway is not on the plaza south edge (row ' + (s.y + 2) + ' is still plaza)');
    if (plan.fountain && Math.abs(plan.fountain.x - s.x) <= 2 && Math.abs(plan.fountain.y - s.y) <= 2) add('subway footprint touches the fountain basin');
  }
  if (plan.spawn) {
    const s = plan.spawn;
    if (!inPlaza(s.x, s.y)) add('spawn ' + s.x + ',' + s.y + ' is not on the plaza');
    if (plan.fountain && Math.abs(plan.fountain.x - s.x) <= 1 && Math.abs(plan.fountain.y - s.y) <= 1) add('spawn is inside the fountain basin');
    if (plan.subway && s.x >= plan.subway.x - 1 && s.x <= plan.subway.x && s.y >= plan.subway.y - 1 && s.y <= plan.subway.y) add('spawn is inside the subway footprint');
  }
  for (const rec of R.lots) { let n = 0; for (const t of rec.tiles) if (inPlaza(t.x, t.y)) n++; if (n) add('lot ' + rec.id + ' overlaps the plaza polygon on ' + n + ' tile(s)'); }
  if (plan.pier) {
    const pond = one('pond')[0];
    if (pond) { const l = lotToLocal(pond, plan.pier.x + 0.5, plan.pier.y + 0.5); if (!(l.x >= 0 && l.x < pond.w && l.y >= 0 && l.y < pond.h)) add('pier is not inside the pond lot'); }
    const pv = R.baseAt(plan.pier.x, plan.pier.y);
    if (pv === M.WATER || pv === M.ROAD) add('pier tile stands on water or road');
  }
  if (plan.marina) {
    const mr = plan.marina;
    if (!inMap(mr.x, mr.y)) add('marina leaves the map');
    else if (inWater(mr.x, mr.y)) add('marina tile ' + mr.x + ',' + mr.y + ' is on water');
    else if (!R.marina || R.marina.deck.length < 2) add('marina dock does not reach the water');
  }

  /* roads: kinds, widths, not through lots or the plaza, not across water without a bridge */
  const lotAtTile = (x, y) => { const i = R.lotIdx[y * cols + x]; return i >= 0 ? R.lots[i] : null; };
  (plan.roads || []).forEach((r, ri) => {
    const width = r.width || ROAD_KINDS[r.kind];
    if (!ROAD_KINDS[r.kind]) add('road ' + r.id + ' has an unknown kind ' + r.kind);
    else if (width !== ROAD_KINDS[r.kind]) add('road ' + r.id + ' width must be ' + ROAD_KINDS[r.kind] + ' for kind ' + r.kind);
    if ((r.kind === 'lane' || r.kind === 'path' || r.kind === 'cartpath' || r.kind === 'switchback') && r.sidewalks) add(r.kind + ' ' + r.id + ' must not have sidewalks');
    if (!r.pts || r.pts.length < 2) { add('road ' + r.id + ' needs at least two points'); return; }
    if (!r.name) add('road ' + r.id + ' has no name');
    const rr = R.roads[ri];
    let inLot = null, inPlazaN = 0, onWater = 0;
    for (const k of rr.tiles) {
      const [x, y] = k.split(',').map(Number);
      const L = lotAtTile(x, y);
      if (L && !inLot) inLot = L.id + ' at ' + x + ',' + y;
      if (inPlaza(x, y)) inPlazaN++;
      if (inWater(x, y) && !R.bridgeTiles.has(k)) onWater++;
    }
    if (inLot) add('road ' + r.id + ' passes through lot ' + inLot);
    if (inPlazaN) add('road ' + r.id + ' passes through the plaza on ' + inPlazaN + ' tile(s)');
    if (onWater) add('road ' + r.id + ' crosses water without a bridge on ' + onWater + ' tile(s)');
  });
  const switchbacks = (plan.roads || []).filter(r => r.kind === 'switchback');
  if (!switchbacks.length) add('a switchback road is required in the hill district');
  for (const r of switchbacks) {
    // a hairpin: at a control point the road direction two points back and two points ahead
    // turn through more than about 117 degrees (the legs run back the way they came)
    const p = r.pts;
    let hairpins = 0;
    for (let i = 2; i + 2 < p.length; i++) {
      const ax = p[i][0] - p[i - 2][0], ay = p[i][1] - p[i - 2][1], bx = p[i + 2][0] - p[i][0], by = p[i + 2][1] - p[i][1];
      const dot = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
      if (dot < -0.45) { hairpins++; i += 2; }
    }
    if (hairpins < 3) add('switchback ' + r.id + ' has ' + hairpins + ' hairpins, needs at least three');
  }

  /* golf */
  const g = plan.golf;
  if (!g || !g.area || !g.holes) add('golf section missing');
  else {
    const inArea = (x, y) => tileInPoly(x, y, g.area.pts);
    if (g.holes.length !== 9) add('golf needs nine holes, has ' + g.holes.length);
    const pars = g.holes.map(h => h.par).join(',');
    if (pars !== PARS.join(',')) add('hole pars must be ' + PARS.join(',') + ' in order, got ' + pars);
    const hazardOk = (x, y, h) => h.island ? tileInPoly(x, y, h.island.pts) : !inWater(x, y);
    g.holes.forEach((h, i) => {
      const tag = 'hole ' + (h.n || i + 1);
      if (h.n !== i + 1) add(tag + ' is numbered out of order');
      if (!h.name) add(tag + ' has no name');
      if (!(h.tee.elev >= 0)) add(tag + ' tee.elev missing');
      if (!inArea(h.tee.x, h.tee.y) || !inArea(h.tee.x + 1, h.tee.y + 1)) add(tag + ' tee box is outside the golf area');
      if (!inArea(h.cup.x, h.cup.y)) add(tag + ' cup is outside the golf area');
      const len = Math.hypot(h.cup.x - h.tee.x, h.cup.y - h.tee.y);
      const lim = HOLE_LENGTHS[h.par];
      if (!lim) add(tag + ' has an unsupported par ' + h.par);
      else if (len < lim[0] || len > lim[1]) add(tag + ' length ' + len.toFixed(1) + ' is outside par ' + h.par + ' range ' + lim[0] + '..' + lim[1]);
      for (const p of h.line || []) if (!inArea(p[0], p[1])) add(tag + ' fairway line point ' + p.join(',') + ' is outside the golf area');
      if (!h.line || h.line.length < 2) add(tag + ' needs a fairway line');
      else {
        const f = h.line[0], l = h.line[h.line.length - 1];
        if (f[0] !== h.tee.x || f[1] !== h.tee.y) add(tag + ' fairway line must start at the tee');
        if (l[0] !== h.cup.x || l[1] !== h.cup.y) add(tag + ' fairway line must end at the cup');
      }
      for (let y = h.tee.y; y <= h.tee.y + 1; y++) for (let x = h.tee.x; x <= h.tee.x + 1; x++) {
        const v = R.baseAt(x, y);
        if (isRoadish(v)) add(tag + ' tee box overlaps a road at ' + x + ',' + y);
        if (v === M.WATER) add(tag + ' tee box is on water at ' + x + ',' + y);
        if (lotAtTile(x, y)) add(tag + ' tee box overlaps lot ' + lotAtTile(x, y).id);
      }
      const cr = h.greenR || 2.5;
      for (let y = Math.floor(h.cup.y - cr - 1); y <= Math.ceil(h.cup.y + cr + 1); y++) for (let x = Math.floor(h.cup.x - cr - 1); x <= Math.ceil(h.cup.x + cr + 1); x++) {
        if (Math.hypot(x + 0.5 - (h.cup.x + 0.5), y + 0.5 - (h.cup.y + 0.5)) > cr) continue;
        if (!inMap(x, y)) { add(tag + ' green leaves the map at ' + x + ',' + y); continue; }
        const v = R.baseAt(x, y);
        if (isRoadish(v)) add(tag + ' green overlaps a road at ' + x + ',' + y);
        if (!hazardOk(x, y, h)) add(tag + ' green ' + (h.island ? 'leaves the island' : 'overlaps water') + ' at ' + x + ',' + y);
        const L = lotAtTile(x, y);
        if (L) add(tag + ' green overlaps lot ' + L.id + ' at ' + x + ',' + y);
        if (!inArea(x, y)) add(tag + ' green leaves the golf area at ' + x + ',' + y);
      }
      for (const b of h.bunkers || []) if (!inArea(b.x, b.y)) add(tag + ' bunker at ' + b.x + ',' + b.y + ' is outside the golf area');
      for (const w of h.water || []) for (const p of w.pts) if (!inArea(p[0], p[1]) && !inArea(p[0] - 1, p[1] - 1)) add(tag + ' water hazard point ' + p.join(',') + ' is outside the golf area');
      for (const p of [h.tee, h.cup]) for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) if (!inArea(p.x + dx, p.y + dy)) add(tag + ' point ' + p.x + ',' + p.y + ' is within 2 tiles of the area edge');
      // the tee box must be level: a path or cart path tile touching the 2 by 2 box (an edge or a
      // corner) would pin a box vertex to the path's grade, so the terrain could not flatten it
      let touching = 0;
      for (let y = h.tee.y - 1; y <= h.tee.y + 2; y++) for (let x = h.tee.x - 1; x <= h.tee.x + 2; x++) {
        if (x >= h.tee.x && x <= h.tee.x + 1 && y >= h.tee.y && y <= h.tee.y + 1) continue;
        const v = R.at(x, y);
        if (v === M.PATH || v === M.CARTPATH) touching++;
      }
      if (touching) add(tag + ' tee box at ' + h.tee.x + ',' + h.tee.y + ' is touched by ' + touching + ' path or cart path tile(s); keep one clear tile around the box');
    });
    // hole 6: the island green, surrounded by water, with its footbridge
    const six = g.holes[5];
    if (!six || six.par !== 3 || !six.island || !six.island.pts) add('hole 6 must be the island par 3 with island.pts');
    else {
      const isl = six.island.pts;
      if (!tileInPoly(six.cup.x, six.cup.y, isl)) add('hole 6 cup is not on the island');
      const bridge = (plan.bridges || []).find(b => b.id === six.bridge);
      if (!bridge) add('hole 6 names no island bridge');
      let dry = 0, touchesBridge = false;
      const inIsl = (x, y) => tileInPoly(x, y, isl);
      for (const t of R.islandTiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = t.x + dx, y = t.y + dy;
        if (inIsl(x, y)) continue;
        const v = R.at(x, y);
        if (v === M.BRIDGE) touchesBridge = true;
        else if (v !== M.WATER) dry++;
      }
      if (dry) add('hole 6 island touches dry land on ' + dry + ' tile edge(s); it must be surrounded by water');
      if (!touchesBridge) add('hole 6 island has no footbridge or cart path reaching it');
      let carry = 0;
      for (const [sx, sy] of splineSamples([[six.tee.x + 1, six.tee.y + 1], [six.cup.x + 0.5, six.cup.y + 0.5]], 0.5)) if (R.at(Math.floor(sx), Math.floor(sy)) === M.WATER) carry += 0.5;
      if (carry < 4) add('hole 6 carry over water is only ' + carry + ' tiles');
    }
    const ch = one('clubhouse')[0];
    if (!g.clubhouse) add('golf.clubhouse missing');
    else if (ch) {
      const c = g.clubhouse;
      const cw = (c.rot === 90 || c.rot === 270) ? c.h : c.w, chh = (c.rot === 90 || c.rot === 270) ? c.w : c.h;
      for (const [px, py] of [[c.x, c.y], [c.x + cw, c.y + chh]]) { const l = lotToLocal(ch, px, py); if (l.x < -1e-6 || l.y < -1e-6 || l.x > ch.w + 1e-6 || l.y > ch.h + 1e-6) { add('golf.clubhouse building is not inside the clubhouse lot'); break; } }
      if (c.w !== 6 || c.h !== 4) add('golf.clubhouse must be 6 by 4');
      if (ch.rot !== c.rot) add('golf.clubhouse rot must match the clubhouse lot');
    }
    if (g.range) {
      const rg = g.range, swap = rg.rot === 90 || rg.rot === 270;
      const ww = swap ? rg.h : rg.w, hh = swap ? rg.w : rg.h;
      const rl = { cx: rg.x + ww / 2, cy: rg.y + hh / 2, w: rg.w, h: rg.h, rot: rg.rot || 0 };
      for (const t of lotRectTiles(rl, 0, 0, rg.w, rg.h)) {
        if (!inArea(t.x, t.y)) { add('range tile ' + t.x + ',' + t.y + ' is outside the golf area'); break; }
        if (R.baseAt(t.x, t.y) !== M.NONE || lotAtTile(t.x, t.y)) { add('range tile ' + t.x + ',' + t.y + ' is not plain golf ground'); break; }
      }
    }
    if (!g.name) add('golf.name (the course name) missing');
  }

  /* bridges */
  for (const b of plan.bridges || []) {
    const [ax, ay] = b.a, [bx, by] = b.b;
    const tag = 'bridge ' + (b.id || (ax + ',' + ay));
    if (ax !== bx && ay !== by) { add(tag + ' is not a straight axis-aligned span'); continue; }
    if (![1, 2, 3].includes(b.width)) add(tag + ' width must be 1, 2 or 3');
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    if (!dx && !dy) { add(tag + ' has zero length'); continue; }
    let water = 0, len = 0;
    for (let x = ax, y = ay; ; x += dx, y += dy) {
      len++;
      if (inWater(x, y)) water++;
      if (x === bx && y === by) break;
      if (len > 64) { add(tag + ' is too long'); break; }
    }
    if (!water) add(tag + ' does not cross water');
    const before = R.at(ax - dx, ay - dy), after = R.at(bx + dx, by + dy);
    const okEnd = v => isRoadish(v) || v === M.STUB;
    if (b.island) {
      const six = g && g.holes && g.holes[5];
      const onIsland = (x, y) => !!(six && six.island && tileInPoly(x, y, six.island.pts));
      const aIsl = onIsland(ax - dx, ay - dy), bIsl = onIsland(bx + dx, by + dy);
      if (!(aIsl || bIsl)) add(tag + ' does not reach the island');
      if (!((aIsl && okEnd(after)) || (bIsl && okEnd(before)))) add(tag + ' has no path at its shore end');
    } else {
      if (!okEnd(before)) add(tag + ' has no road at its a end (' + (ax - dx) + ',' + (ay - dy) + ')');
      if (!okEnd(after)) add(tag + ' has no road at its b end (' + (bx + dx) + ',' + (by + dy) + ')');
    }
  }
  const riverBridges = (plan.bridges || []).filter(b => !b.island && !b.waterway);
  if (riverBridges.length < 3) add('at least three river bridges are required');
  for (const k of ['high', 'low', 'foot']) if (!riverBridges.some(b => b.kind === k)) add('a ' + k + ' bridge is required');
  for (const b of plan.bridges || []) {
    if (!['high', 'low', 'foot', 'cart'].includes(b.kind)) add('bridge ' + b.id + ' has an unknown kind ' + b.kind);
    if (b.arch !== undefined && !(Number.isFinite(b.arch) && b.arch >= 0 && b.arch <= 1.5)) add('bridge ' + b.id + ' arch must be 0..1.5');
  }

  /* v11: waterways, their bridges, the docks and the water BFS, the kickers, the kiosk */
  for (const s of waterwayIssues(plan, R)) add(s);

  /* racks: count, footing, and one near every department and attraction */
  const racks = plan.scooterRacks || [];
  if (racks.length < 16) add('at least sixteen scooter racks are required, found ' + racks.length);
  for (const k of racks) {
    const v = R.at(k.x, k.y);
    if (!inMap(k.x, k.y)) add('rack ' + k.x + ',' + k.y + ' leaves the map');
    if (v === M.WATER || v === M.ROAD || v === M.BRIDGE || v === M.BUILDING || v === M.FEATURE || v === M.FAIRWAY || v === M.GREEN || v === M.TEE || v === M.SAND || v === M.PATH || v === M.CARTPATH) add('rack ' + k.x + ',' + k.y + ' stands on water, road, path or course');
    if (lotAtTile(k.x, k.y)) add('rack ' + k.x + ',' + k.y + ' stands on lot ' + lotAtTile(k.x, k.y).id);
  }
  const rackNear = (p, label) => { if (!p) return; let d = Infinity; for (const k of racks) d = Math.min(d, Math.hypot(k.x - p.x, k.y - p.y)); if (d > RACK_REACH) add('no rack within ' + RACK_REACH + ' tiles of ' + label + ' (nearest ' + d.toFixed(1) + ')'); };
  for (const rec of R.lots) if (rec.kind.startsWith('dept:') || rec.kind === 'cafe' || rec.kind === 'clubhouse') rackNear(rec.doorTile, rec.id + ' door');
  if (R.subway) rackNear(R.subway.enter[0], 'the subway');
  if (R.pier) rackNear(R.pier.tile, 'the pier');
  if (R.marina) rackNear(R.marina.tile, 'the marina');
  if (plan.fountain) rackNear(plan.fountain, 'the plaza fountain');
  if (g && g.holes && g.holes[0]) rackNear(g.holes[0].tee, 'the first tee');
  for (const s of plan.seatsExtra || []) {
    const v = R.at(s.x, s.y);
    if (v === M.WATER || v === M.ROAD || v === M.BRIDGE || v === M.BUILDING || v === M.FEATURE) add('bench ' + s.x + ',' + s.y + ' stands on water, road or a building');
    // agents never walk course tiles, so a seat there could not be reached
    if (v === M.FAIRWAY || v === M.GREEN || v === M.TEE || v === M.SAND) add('bench ' + s.x + ',' + s.y + ' stands on the course (fairway, green, tee or sand)');
    if (lotAtTile(s.x, s.y)) add('bench ' + s.x + ',' + s.y + ' stands on lot ' + lotAtTile(s.x, s.y).id);
    if (plan.fountain && Math.abs(plan.fountain.x - s.x) <= 1 && Math.abs(plan.fountain.y - s.y) <= 1) add('bench ' + s.x + ',' + s.y + ' is in the fountain basin');
  }

  /* districts and landforms */
  const kinds = new Set();
  for (const d of plan.districts || []) {
    if (!(d.treeDensity >= 0 && d.treeDensity <= 0.5)) add('district ' + d.id + ' treeDensity must be 0..0.5');
    const lf = d.landform;
    if (!lf || !LANDFORM_KINDS.has(lf.kind)) add('district ' + d.id + ' needs a landform with a kind from hill, bluff, valley, lake, flats, links');
    else {
      kinds.add(lf.kind);
      if (!(lf.center || lf.polygon)) add('district ' + d.id + ' landform needs a center or a polygon');
      if (lf.center && !(lf.radius > 0)) add('district ' + d.id + ' landform with a center needs a radius');
      if (!(Number.isFinite(lf.height) || Array.isArray(lf.height))) add('district ' + d.id + ' landform needs a height');
    }
  }
  for (const k of LANDFORM_KINDS) if (!kinds.has(k)) add('no district carries the ' + k + ' landform');

  /* reachability on the rasterized map */
  if (rasterized) {
    try { for (const s of reachabilityIssues(plan, rasterized, R)) add(s); }
    catch (e) { add('reachability check failed: ' + (e && e.message)); }
  }
  return { ok: issues.length === 0, issues };
}

/* v11 checks (CONTRACT_V11 "The waterway", "Boats", "The hoverboard", "Coins, the wallet and the
   shop"): waterways are 2 or 3 wide water splines whose ends join the bodies they name, they cut
   no road except under a bridge, every bridge that names a waterway spans it; docks stand on a
   dry tile (bank or deck) with open boat water on their water side and the water BFS from the
   marina reaches every slip; kickers stand on plain ground off roads, lots, decks and the course;
   the kiosk stands on the plaza clear of the fountain, the subway, the spawn and the racks with a
   walkable front tile. */
function waterwayIssues(plan, R) {
  const out = [];
  const add = s => out.push(s);
  const cols = plan.cols, rows = plan.rows;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const waterPolys = (plan.water || []).map(w => ({ id: w.id, pts: w.pts }));
  const lotAtTile = (x, y) => { const i = inMap(x, y) ? R.lotIdx[y * cols + x] : -1; return i >= 0 ? R.lots[i] : null; };
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const ways = plan.waterways || [];
  const recs = R.waterways || [];
  const pond = R.lots.find(l => l.kind === 'pond');
  const pondKeys = new Set(pond && pond.pondTiles ? pond.pondTiles.map(t => t.x + ',' + t.y) : []);
  const ids = new Set();
  ways.forEach((w, i) => {
    const tag = 'waterway ' + (w.id || i);
    const rec = recs[i];
    if (!w.id || ids.has(w.id)) add(tag + ' id missing or duplicate');
    ids.add(w.id);
    if (!w.pts || w.pts.length < 2) { add(tag + ' needs at least two points'); return; }
    if (!(w.width === 2 || w.width === 3)) add(tag + ' width must be 2 or 3');
    if (!Number.isFinite(w.level) || !Number.isFinite(w.bed) || !(w.bed < w.level)) add(tag + ' needs a bed below its level');
    if (!Array.isArray(w.bank) || w.bank.length !== 2) add(tag + ' needs a bank [min, max]');
    if (!rec || !rec.tiles.size) { add(tag + ' stamps no tiles'); return; }
    // the ends join what they name: a plan water body (the end tile inside its polygon or next
    // to one of its tiles, so a waterway can stop at a sill on the body's edge), the pond (next to
    // a pond tile) or another waterway (sharing or touching a tile)
    const ends = [[w.pts[0], w.from], [w.pts[w.pts.length - 1], w.to]];
    for (const [p, name] of ends) {
      const x = Math.floor(p[0]), y = Math.floor(p[1]);
      if (!name) continue;
      let ok = false;
      const body = waterPolys.find(b => b.id === name);
      if (body) ok = tileInPoly(x, y, body.pts) || N4.some(([dx, dy]) => tileInPoly(x + dx, y + dy, body.pts));
      else if (name === 'pond') ok = N4.some(([dx, dy]) => pondKeys.has((x + dx) + ',' + (y + dy))) || pondKeys.has(x + ',' + y);
      else { const o = recs.find(r => r.id === name); if (o) ok = o.tiles.has(x + ',' + y) || N4.some(([dx, dy]) => o.tiles.has((x + dx) + ',' + (y + dy))); else add(tag + ' names an unknown body ' + name); }
      if (!ok) add(tag + ' end ' + x + ',' + y + ' does not join ' + name);
    }
    // never through a building, the plaza, a lot other than the pond lot, or a deck
    let lot = null, plazaN = 0, buildingN = 0;
    for (const k of rec.tiles) {
      const [x, y] = k.split(',').map(Number);
      const L = lotAtTile(x, y);
      if (L && L.kind !== 'pond' && !lot) lot = L.id + ' at ' + k;
      if (plan.plaza && tileInPoly(x, y, plan.plaza.pts)) plazaN++;
      if (R.at(x, y) === M.BUILDING || R.at(x, y) === M.DECK) buildingN++;
    }
    if (lot) add(tag + ' runs through lot ' + lot);
    if (plazaN) add(tag + ' runs through the plaza on ' + plazaN + ' tile(s)');
    if (buildingN) add(tag + ' runs under a building or a deck on ' + buildingN + ' tile(s)');
  });
  // waterways do not cut roads except at their bridges: every road, path or cart path tile on a
  // waterway is a bridge deck tile
  (plan.roads || []).forEach((r, ri) => {
    const rr = R.roads[ri];
    if (!rr) return;
    let cut = 0, where = '';
    for (const k of rr.tiles) if (recs.some(w => w.tiles.has(k)) && !R.bridgeTiles.has(k)) { cut++; if (!where) where = k; }
    if (cut) add('road ' + r.id + ' is cut by a waterway without a bridge on ' + cut + ' tile(s), first at ' + where);
  });
  for (const b of plan.bridges || []) {
    if (!b.waterway) continue;
    const w = recs.find(x => x.id === b.waterway);
    if (!w) { add('bridge ' + b.id + ' names an unknown waterway ' + b.waterway); continue; }
    const [ax, ay] = b.a, [bx, by] = b.b;
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    let over = 0;
    for (let x = ax, y = ay, n = 0; n < 64; x += dx, y += dy, n++) { if (w.tiles.has(x + ',' + y)) over++; if (x === bx && y === by) break; }
    if (!over) add('bridge ' + b.id + ' does not span waterway ' + b.waterway);
    // the deck ends stand on dry ground beside the waterway
    for (const [x, y] of [[ax - dx, ay - dy], [bx + dx, by + dy]]) if (w.tiles.has(x + ',' + y)) add('bridge ' + b.id + ' end ' + x + ',' + y + ' is still on the waterway');
  }
  if (ways.length && !(plan.bridges || []).some(b => b.kind === 'cart' && b.waterway)) add('a cart bridge over a waterway is required');
  if (ways.length && !(plan.bridges || []).some(b => b.kind === 'foot' && b.waterway)) add('a footbridge over a waterway is required');

  /* docks and the water BFS */
  const docks = R.docks || [];
  const BW = boatWater(R);
  const dockIds = new Set(), slips = new Set();
  const dryDock = v => v !== M.WATER && v !== M.BUILDING && v !== M.ROAD && v !== M.BRIDGE && v !== M.FEATURE && v !== M.FAIRWAY && v !== M.GREEN && v !== M.TEE && v !== M.SAND;
  for (const d of docks) {
    const tag = 'dock ' + d.id;
    if (!d.id || dockIds.has(d.id)) add(tag + ' id missing or duplicate');
    dockIds.add(d.id);
    if (!inMap(d.tile.x, d.tile.y) || !inMap(d.slip.x, d.slip.y)) { add(tag + ' leaves the map'); continue; }
    const v = R.at(d.tile.x, d.tile.y);
    if (!dryDock(v)) add(tag + ' tile ' + d.tile.x + ',' + d.tile.y + ' is not a bank or deck tile');
    if (!BW.at(d.slip.x, d.slip.y)) add(tag + ' water side ' + d.slip.x + ',' + d.slip.y + ' is not open boat water');
    else if (!BW.reaches(d.slip.x, d.slip.y)) add(tag + ' slip ' + d.slip.x + ',' + d.slip.y + ' is not reached by boat from the marina');
    const sk = d.slip.x + ',' + d.slip.y;
    if (slips.has(sk)) add(tag + ' shares its slip tile with another dock');
    slips.add(sk);
  }
  if (plan.docks && docks.length < 6) add('six docks are required (three marina slips, the pier, the pond landing, the river landing), found ' + docks.length);
  if (plan.docks && docks.filter(d => /^marina/.test(d.id)).length !== 3) add('three marina slips are required');
  if (plan.docks && !BW.start) add('the water BFS has no start (a marina dock is required)');

  /* kickers */
  const kickers = R.kickers || [];
  const plain = v => v === M.NONE || v === M.GOLF || v === M.SIDEWALK;
  for (const k of kickers) {
    const tag = 'kicker ' + k.id;
    for (const [t, what] of [[k.foot, 'foot'], [k.lip, 'lip']]) {
      if (!inMap(t.x, t.y)) { add(tag + ' ' + what + ' leaves the map'); continue; }
      const v = R.at(t.x, t.y);
      if (!plain(v)) add(tag + ' ' + what + ' tile ' + t.x + ',' + t.y + ' is not plain ground (road, path, water, deck, course or building)');
      if (lotAtTile(t.x, t.y)) add(tag + ' ' + what + ' tile stands on lot ' + lotAtTile(t.x, t.y).id);
      if (plan.plaza && tileInPoly(t.x, t.y, plan.plaza.pts)) add(tag + ' ' + what + ' tile is on the plaza');
    }
    if (inMap(k.launch.x, k.launch.y) && (R.at(k.launch.x, k.launch.y) === M.BUILDING || R.at(k.launch.x, k.launch.y) === M.FEATURE)) add(tag + ' launches into a building');
  }
  if (plan.kickers && kickers.length !== 3) add('three kickers are required, found ' + kickers.length);

  /* the kiosk */
  const kiosk = R.kiosk;
  if (plan.kiosk && !kiosk) add('kiosk missing from the raster');
  if (kiosk) {
    const t = kiosk.tile, f = kiosk.front;
    const inPlaza = (x, y) => !!(plan.plaza && plan.plaza.pts && tileInPoly(x, y, plan.plaza.pts));
    if (!inPlaza(t.x, t.y)) add('kiosk ' + t.x + ',' + t.y + ' is not on the plaza');
    if (!inPlaza(f.x, f.y)) add('kiosk front tile ' + f.x + ',' + f.y + ' is not on the plaza');
    else if (R.at(f.x, f.y) !== M.PLAZA) add('kiosk front tile ' + f.x + ',' + f.y + ' is not clear plaza paving');
    if (plan.fountain && Math.abs(plan.fountain.x - t.x) <= 2 && Math.abs(plan.fountain.y - t.y) <= 2) add('kiosk touches the fountain basin');
    if (plan.subway) { const s = plan.subway; if (t.x >= s.x - 2 && t.x <= s.x + 1 && t.y >= s.y - 2 && t.y <= s.y + 1) add('kiosk overlaps the subway footprint or its enter row'); }
    if (plan.spawn && plan.spawn.x === t.x && plan.spawn.y === t.y) add('kiosk stands on the spawn');
    if ((plan.scooterRacks || []).some(k => Math.abs(k.x - t.x) <= 1 && Math.abs(k.y - t.y) <= 1)) add('kiosk touches a scooter rack');
    if ((plan.seatsExtra || []).some(s => s.x === t.x && s.y === t.y)) add('kiosk stands on a bench');
    if (plan.subway && Math.hypot(plan.subway.x - t.x, plan.subway.y - t.y) > 6) add('kiosk is more than 6 tiles from the subway entrance');
  }
  return out;
}

/* BFS from the spawn under visitor rules. `src` is TT.state (uses TT.sim.at and TT.sim.TILES),
   a rasterizePlan result (uses its grid and MARK), or any object with at(x, y) and TILES.
   Targets: every lot door, every department work tile, every tee and cup, the clubhouse door,
   the cafe seats, the subway enter row, the pier, the marina, every rack, every seatsExtra bench. */
function reachabilityIssues(plan, src, R) {
  const out = [];
  const TT = globalThis.TT;
  const cols = plan.cols, rows = plan.rows;
  let at, pass, targets = [];
  if (src && src.grid && src.MARK && src.lots) {
    at = src.at; pass = WALKABLE_MARKS;
    for (const l of src.lots) {
      if (l.doorTile) targets.push([l.doorTile, l.id + ' door']);
      if (l.workTile) targets.push([l.workTile, l.id + ' workTile']);
    }
    for (const h of src.holes) { targets.push([h.teeTile, 'hole ' + h.n + ' tee']); targets.push([h.cupTile, 'hole ' + h.n + ' cup']); }
    if (src.subway) targets.push([src.subway.enter[0], 'subway enter row']);
    if (src.pier) targets.push([src.pier.tile, 'pier tile']);
    if (src.marina) targets.push([src.marina.tile, 'marina']);
    for (const k of src.racks) targets.push([k, 'rack ' + k.id + ' (' + k.near + ')']);
    for (const s of plan.seatsExtra || []) targets.push([s, 'bench ' + s.x + ',' + s.y]);
    for (const d of src.docks || []) targets.push([d.tile, 'dock ' + d.id]);
    if (src.kiosk) targets.push([src.kiosk.front, 'kiosk front']);
  } else {
    const sim = (src && src.at) ? src : (TT && TT.sim);
    const state = (src && src.buildings) ? src : (TT && TT.state);
    if (!sim || !sim.at || !sim.TILES || !state) return ['reachability: no sim at() or state available'];
    const T = sim.TILES;
    at = sim.at;
    pass = new Set([T.G, T.P, T.Z, T.F, T.SW, T.CW, T.PK, T.BR, T.FW, T.GR, T.SA, T.TEE, T.CP, T.PT, T.DK].filter(v => v !== undefined));
    for (const b of state.buildings || []) {
      if (b.kind === 'dept') { targets.push([b.workTile, b.dept.id + ' workTile']); targets.push([b.doorTile, b.dept.id + ' doorTile']); }
      if (b.kind === 'clubhouse' || b.kind === 'cafe') targets.push([b.doorTile, b.kind + ' doorTile']);
    }
    for (const l of state.lots || []) if (l.doorTile) targets.push([l.doorTile, l.id + ' door']);
    for (const s of (state.seats || []).filter(s => s.kind === 'cafe')) targets.push([s, 'cafe seat']);
    if (state.pier) targets.push([state.pier.tile, 'pier tile']);
    if (state.marina) targets.push([state.marina.tile, 'marina']);
    if (state.golf) for (const h of state.golf.holes || []) { targets.push([{ x: Math.floor(h.tee.x), y: Math.floor(h.tee.y) }, 'hole ' + h.n + ' tee']); targets.push([{ x: Math.floor(h.cup.x), y: Math.floor(h.cup.y) }, 'hole ' + h.n + ' cup']); }
    if (state.subway) targets.push([{ x: state.subway.tile.x, y: state.subway.tile.y + 1 }, 'subway enter row']);
    for (const r of state.racks || []) targets.push([r, 'rack']);
    for (const s of plan.seatsExtra || []) targets.push([s, 'bench ' + s.x + ',' + s.y]);
    for (const d of state.docks || []) targets.push([d.tile || { x: d.x, y: d.y }, 'dock ' + d.id]);
    if (state.kiosk) targets.push([state.kiosk.front || { x: state.kiosk.tile.x, y: state.kiosk.tile.y + 1 }, 'kiosk front']);
  }
  const seen = new Uint8Array(cols * rows);
  const q = [];
  const sp = (src && src.spawn) || plan.spawn;
  const push = (x, y) => { if (x < 0 || y < 0 || x >= cols || y >= rows) return; const i = y * cols + x; if (seen[i]) return; if (!pass.has(at(x, y))) return; seen[i] = 1; q.push(x, y); };
  push(sp.x, sp.y);
  if (!q.length) return ['spawn ' + sp.x + ',' + sp.y + ' is not walkable'];
  for (let i = 0; i < q.length; i += 2) { const x = q[i], y = q[i + 1]; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  const reach = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && seen[y * cols + x] === 1;
  for (const [p, label] of targets) { if (!p) out.push(label + ' missing'); else if (!reach(p.x, p.y)) out.push(label + ' at ' + p.x + ',' + p.y + ' is not reachable from the spawn'); }
  return out;
}

/* An ASCII rendering of the raster (one character per tile, or per 2 by 2 cell with step 2). */
export function asciiPlan(R, step) {
  step = step || 1;
  const ch = { 0: '.', 1: '~', 2: '#', 3: '-', 4: '=', 5: 'Z', 6: ':', 7: 'B', 8: 'p', 9: 'k', 10: 'c', 11: 'f', 12: 'g', 13: 't', 14: 's', 15: 'w', 16: 'C', 17: 'S', 18: 'd', 19: 'X' };
  const lines = [];
  for (let y = 0; y < R.rows; y += step) {
    let s = String(y).padStart(3, ' ') + ' ';
    for (let x = 0; x < R.cols; x += step) s += ch[R.at(x, y)] || '?';
    lines.push(s);
  }
  return lines.join('\n');
}

export default PLAN;
