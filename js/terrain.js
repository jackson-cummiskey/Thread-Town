/* Thread Town terrain v2 (docs/CONTRACT_V10.md "Terrain v2", geography in docs/WORLD_DESIGN.md).

   buildTerrain(ctx) -> { cols, rows, heights, heightAt, slopeAt, normalAt, lotHeight, slopeClassAt, retainingWalls, landformAt, water }
   ctx = { plan, state, sim, seed }. The plan (js/cityplan.js v3) is the source of every shape:
   districts with landforms, water bodies, spline roads, bridges, the plaza, rotated lots and the
   nine holes. TT.sim.terrainSeed is the default seed (20261020).

   Heights live on the vertex grid: vertex (i, j) for i in 0..cols, j in 0..rows at
   heights[j * (cols + 1) + i], in world units (1 tile = 1 unit, world z is plan y). heightAt is
   the bilinear blend of the four corners of the tile under the point, slopeAt the analytic
   gradient of that patch (out.x = dh/dx, out.z = dh/dz), normalAt the unit normal
   normalize(-dh/dx, 1, -dh/dz) and slopeClassAt the class of the gradient's magnitude:
   'flat' under 0.14, 'gentle' under 0.36, 'steep' under 0.70 (35 degrees), 'cliff' beyond.
   The samplers allocate nothing.

   Rules, in order (every one a pure function of the plan and the seed):
     1. relief: three octaves of seeded value noise (4.5 at 70 tiles, 1.4 at 20, 0.35 at 6)
        scaled by a landform mask and added to the landform targets of the districts (hill +9 at
        the ridge, bluff plateau +5 with its wall, valley floor, lake bed, flats, links rolling
        inside its range), blended in district order (the first district wins);
     2. water: river and lake bed vertices at the water heights, a shore floor 0.9 above the bed,
        banks climbing to the surround over 4 to 8 tiles (1.5 at the bluff wall), the island +0.6;
     3. plateaus: plaza and pond at 0, roads flattened along their splines (level cross-section,
        grade capped at 12 percent, 14 on the switchback), bridge decks between the bank roads
        (only the approach rows pin the field; the water stays under the deck and heightAt
        overlays the deck over the span),
        lots as plateaus over their rotated footprints (within the frontage step of the road the
        door's stub reaches) with a soft ring where the step is within 1.2 and a retaining wall
        where it is not, scooter rack tiles as level pads;
     4. course shaping inside the links: fairway profiles, mounds, elevated tees, contoured
        greens (the island green on its +0.6 island), bunker bowls, the range plateau;
     5. clamp to -2 .. 12 and relax neighbour steps over 1.6 (water edges, walls and banks excepted).

   Vertex classes: wet (1 river bed, 2 lake bed, 3 creek bed, 4 channel bed) and pinned (1 lot
   plateau, 2 plaza or pond, 3 road, 4 bridge deck, 5 shore floor, 6 sidewalk, 7 green and collar,
   8 island, 9 tee box, 10 rack pad, 11 dock pad, 12 kicker ramp).
   steep (1) marks vertices whose slope is designed (the bluff wall band and water banks) so the
   relax pass leaves them. A rule that skips pinned vertices never moves a vertex of a class it
   does not name. retainingWalls lists the lot edges where the final field steps more than 1.2.

   Version 11 (docs/CONTRACT_V11.md "The waterway", docs/V11_DESIGN.md):
     - the waterways (plan.waterways: the creek and the channel) join the waters of rule 2 with the
       tile mask of cityplan's waterwayMask, the bed at w.bed interpolated along the reach toward the
       next reach's bed when that is lower (the creek: -1.3 at the pond mouth down to -1.6 where the
       links reach starts, -1.6 to the lake), the shore floor at w.level + 0.2 and banks of w.bank
       tiles; inside the pond lot the creek's bank vertices climb from the shore floor to the lot
       plateau instead of taking it (the pier tile and the deck planks keep the plateau);
     - a bridge's `arch` is a cosine hump of that height at mid span, zero at the ends, in the
       approach row pinning and in heightAt and slopeAt over the span; every bridge with an arch is on
       the boat network, so the road samples over its span floor at the water surface + 1.2 - arch
       and the deck clears 1.2 over the water;
     - bank dock tiles (a dock whose tile is not a deck plank or the pier tile) are level pads at
       their slip's water surface + 0.3 (pinned 11), blended like rack pads;
     - kickers are shaped last, after the relax pass: the foot tile's back edge at the local ground,
       the edge shared with the lip tile +0.4, the lip's far edge +0.8 (pinned 12, steep);
     - terrain.water gains one record per waterway body ({ id: 'creek', surface: -0.9 } and the
       channel) after the plan's water records. */

import { lotWorldRect, lotRectTiles, lotRectCorners, lotToLocal, rasterizePlan, splineSamples, waterwayMask, ROAD_KINDS, MARK } from './cityplan.js';

export const DEFAULT_SEED = 20261020;

/* Slope classes by gradient magnitude (rise per tile). 0.70 is tan 35 degrees, the contract's
   rock outcrop threshold. */
export const SLOPE_CLASSES = { flat: 0.14, gentle: 0.36, steep: 0.70 };
export function classifySlope(mag) {
  if (!(mag >= 0)) return 'flat';
  if (mag < SLOPE_CLASSES.flat) return 'flat';
  if (mag < SLOPE_CLASSES.gentle) return 'gentle';
  if (mag < SLOPE_CLASSES.steep) return 'steep';
  return 'cliff';
}

/* Tuning, every number from the contract or the design. Read only. */
export const TERRAIN = {
  relief: { octaves: [[4.5, 70], [1.4, 20], [0.35, 6]], defaultMask: 0.12 },
  landform: {
    hill: { mask: 0.3, maskFade: 12, edge: 6, crest: 6 },   // noise fades out within maskFade tiles of the ridge; a flat crest of `crest` tiles
    bluff: { mask: 0.05, wallWidth: 1.5, slopeWidth: 6 },
    valley: { mask: 0.05, floor: -0.5, inner: 4 },
    lake: { mask: 0 },
    flats: { mask: 0.06, edge: 4 },
    links: { mask: 0, roll: 0.3, edge: 4 },
  },
  water: { shoreLift: 0.9, shoreR: 1.5, wallBankW: 1.5, wallNear: 3, bankNoiseWl: 30, maxBank: 9 },
  // v11: a waterway's shore floor sits this much above its surface; a boat needs this much deck
  // clearance over the water; a bank dock pad stands this much above its slip's surface
  waterway: { shoreLift: 0.2, clearance: 1.05, dockLift: 0.3 },   // v12.1: clearance 1.05 (a seated rider's head clears it) so short decks over low banks hump less
  kicker: { near: 0.4, far: 0.8 },   // the ramp's rise at the shared edge and at the lip's far edge over the foot's ground
  island: { height: 0.6 },
  plateau: { blend: 2 },
  road: { band: 1.5, cap: 0.12, switchbackCap: 0.14, highBridgeCap: 0.18, greenZone: 1.0, hairpinZone: 3.5, sampleStep: 0.5, window: 4, rounds: 12, extraRounds: 48, junctionGap: 0.02, passes: 4, junction: 1.0, blend: 2, switchbackBlend: 3, edgePad: 0.5 },
  lot: { frontageR: 1.5, frontageClamp: 0.25, frontageStep: 0.8, ring: 2.5, wallStep: 1.2, wallSample: 0.5, wallProbe: 0.75 },
  rack: { blend: 0.5 },   // the ring vertices around a rack pad move this fraction toward the pad where the step is under lot.wallStep
  course: {
    fade: 2, fairwayHw: 2.5, fairwayBand: 4.0, fairwayCap: 0.06, fairwayPasses: 6,
    moundStep: 6, moundAmp: [0.6, 0.9], moundR: 2.5, moundOffset: 4.0, moundMinLine: 3.95,
    teeBlend: 2.5, teeLanding: 10, greenR: 2.5, collar: 0.4, contourAmp: 0.12, contourWl: 4, contourCap: 0.12, apron: 2,
    bunkerDepth: 0.45, bunkerLip: 0.12, rangeBlend: 2,
  },
  clamp: { min: -2.0, max: 12, step: 1.6, relaxPasses: 8 },
};

/* ---------- small math ---------- */
const smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clampv = (v, a, b) => v < a ? a : v > b ? b : v;

function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
/* Seeded value noise in -1..1, sampled at integer vertex coordinates by the rules. */
function vnoise(x, z, wl, seed) {
  const u = x / wl, v = z / wl, i = Math.floor(u), j = Math.floor(v);
  const su = smooth(u - i), sv = smooth(v - j);
  const a = hash2(i, j, seed), b = hash2(i + 1, j, seed), c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
  return 2 * lerp(lerp(a, b, su), lerp(c, d, su), sv) - 1;
}

/* ---------- geometry (tile units) ---------- */
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
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function distToLine(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) { const v = distToSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); if (v < d) d = v; }
  return d;
}
function distToPolyEdge(px, py, pts) {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const v = distToSeg(px, py, pts[j][0], pts[j][1], pts[i][0], pts[i][1]); if (v < d) d = v; }
  return d;
}
/* Euclidean distance to a closed vertex rectangle { x0, y0, x1, y1 } (0 inside or on the edge). */
function distToRect(px, py, r) {
  const dx = px < r.x0 ? r.x0 - px : px > r.x1 ? px - r.x1 : 0;
  const dy = py < r.y0 ? r.y0 - py : py > r.y1 ? py - r.y1 : 0;
  return dx || dy ? Math.hypot(dx, dy) : 0;
}
function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}
/* Distance from a world point to a lot's rotated footprint (0 inside), in the lot's frame. */
function distToLot(lot, px, py) {
  const l = lotToLocal(lot, px, py);
  const dx = l.x < 0 ? -l.x : l.x > lot.w ? l.x - lot.w : 0;
  const dy = l.y < 0 ? -l.y : l.y > lot.h ? l.y - lot.h : 0;
  return dx || dy ? Math.hypot(dx, dy) : 0;
}

/* A profile along a polyline: samples about every `step` tiles (for a segment of length L,
   n = max(1, round(L / step)) equal steps; the first sample of a later segment is the previous
   segment's last). Spline roads pass their dense Catmull-Rom polyline. */
function makeProfile(pts, step) {
  step = step || 1;
  const samples = [], segs = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const ax = pts[k][0], ay = pts[k][1], bx = pts[k + 1][0], by = pts[k + 1][1];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-9 && k + 1 < pts.length - 1) continue;
    const n = Math.max(1, Math.round(L / step)), sp = L / n;
    const start = samples.length ? samples.length - 1 : 0;
    segs.push({ ax, ay, bx, by, L, n, start });
    for (let t = (samples.length ? 1 : 0); t <= n; t++) samples.push({ x: ax + (bx - ax) * t / n, y: ay + (by - ay) * t / n, spacing: t === 0 ? 0 : sp, v: 0, cap: 0, floor: -Infinity, zero: false, fixed: false, partners: null, links: null, road: -1 });
  }
  return { pts, samples, segs };
}
/* The profile height at a point: the samples interpolated by arc length at the point's
   projection onto the nearest segment. */
function profileAt(prof, px, py) {
  let best = null, bd = Infinity, bt = 0;
  for (const sg of prof.segs) {
    const dx = sg.bx - sg.ax, dy = sg.by - sg.ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - sg.ax) * dx + (py - sg.ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (sg.ax + dx * t), py - (sg.ay + dy * t));
    if (d < bd) { bd = d; best = sg; bt = t; }
  }
  const S = prof.samples;
  if (!best) return S.length ? S[0].v : 0;
  const u = best.start + bt * best.n, i0 = Math.min(S.length - 1, Math.floor(u)), i1 = Math.min(S.length - 1, i0 + 1);
  return lerp(S[i0].v, S[i1].v, u - i0);
}
function nearestSampleIndex(samples, px, py) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < samples.length; i++) { const s = samples[i]; const d = (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py); if (d < bd) { bd = d; best = i; } }
  return best;
}
/* Moving window (i - half .. i + half, shrinking at the ends) over v, written back into v;
   samples flagged zero keep their value but still count in their neighbours' means. */
function movingWindow(samples, half) {
  const src = samples.map(s => s.v);
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].zero || samples[i].pinV != null) continue;
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(samples.length - 1, i + half); k++) { sum += src[k]; n++; }
    samples[i].v = sum / n;
  }
}
/* One clamp pass holding each free sample within cap * spacing of its neighbour (the smaller of
   the two caps, or capOverride), then on its floor when useFloor is set. */
function clampPass(samples, forward, isFixed, capOverride, useFloor) {
  const n = samples.length;
  if (forward) {
    for (let i = 1; i < n; i++) {
      const s = samples[i]; if (isFixed(s)) continue;
      const p = samples[i - 1], lim = (capOverride !== undefined ? capOverride : Math.min(s.cap, p.cap)) * s.spacing;
      s.v = clampv(s.v, p.v - lim, p.v + lim);
      if (useFloor && s.v < s.floor) s.v = s.floor;
    }
  } else {
    for (let i = n - 2; i >= 0; i--) {
      const s = samples[i]; if (isFixed(s)) continue;
      const q = samples[i + 1], lim = (capOverride !== undefined ? capOverride : Math.min(s.cap, q.cap)) * q.spacing;
      s.v = clampv(s.v, q.v - lim, q.v + lim);
      if (useFloor && s.v < s.floor) s.v = s.floor;
    }
  }
}

/* ---------- the build ---------- */
export function buildTerrain(ctx) {
  ctx = ctx || {};
  const sim = ctx.sim || (typeof globalThis !== 'undefined' && globalThis.TT && globalThis.TT.sim) || null;
  const plan = ctx.plan || (sim && sim.PLAN) || (typeof globalThis !== 'undefined' && globalThis.TT && globalThis.TT.PLAN) || null;
  if (!plan) throw new Error('Thread Town terrain: a city plan is required (ctx.plan)');
  const state = ctx.state || (sim && sim.state) || null;
  let seed = ctx.seed;
  if (!(typeof seed === 'number' && isFinite(seed))) seed = (sim && typeof sim.terrainSeed === 'number') ? sim.terrainSeed : DEFAULT_SEED;
  seed = seed | 0;

  const cols = plan.cols, rows = plan.rows, W = cols + 1, HV = rows + 1, N = W * HV;
  const h = new Float64Array(N);
  const pinned = new Uint8Array(N);
  const wet = new Uint8Array(N);
  const steep = new Uint8Array(N);
  const idx = (i, j) => j * W + i;
  const inV = (i, j) => i >= 0 && j >= 0 && i <= cols && j <= rows;
  const T = TERRAIN;

  /* Bilinear read of the working field. */
  function fieldAt(x, z) {
    let fx = x > 0 ? (x < cols ? x : cols) : 0, fz = z > 0 ? (z < rows ? z : rows) : 0;
    let i = fx | 0, j = fz | 0; if (i >= cols) i = cols - 1; if (j >= rows) j = rows - 1;
    const tx = fx - i, tz = fz - j, k = j * W + i;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + W] * (1 - tx) + h[k + W + 1] * tx) * tz;
  }

  /* Distance (capped at maxR) from every vertex to the nearest vertex flagged in mask.
     Exact within maxR: offsets are scanned in increasing distance and the first hit wins.
     Vertices farther than maxR get maxR + 1. */
  function distField(mask, maxR) {
    const R = Math.ceil(maxR);
    const offs = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const d = Math.hypot(dx, dy); if (d <= maxR) offs.push({ dx, dy, d }); }
    offs.sort((a, b) => a.d - b.d || a.dy - b.dy || a.dx - b.dx);
    const out = new Float32Array(N).fill(maxR + 1);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      for (let o = 0; o < offs.length; o++) {
        const q = offs[o], x = i + q.dx, y = j + q.dy;
        if (x < 0 || y < 0 || x > cols || y > rows) continue;
        if (mask[y * W + x]) { out[j * W + i] = q.d; break; }
      }
    }
    return out;
  }
  /* Tile mask from polygons (tile centers inside). */
  function tileMask(polys) {
    const m = new Uint8Array(cols * rows);
    for (const pts of polys) {
      const b = polyBounds(pts);
      for (let y = Math.max(0, b.y0 - 1); y <= Math.min(rows - 1, b.y1); y++) for (let x = Math.max(0, b.x0 - 1); x <= Math.min(cols - 1, b.x1); x++) if (pointInPoly(x + 0.5, y + 0.5, pts)) m[y * cols + x] = 1;
    }
    return m;
  }
  /* Vertices whose surrounding in map tiles are all flagged (bed vertices). Map edge vertices
     count their in map tiles only, so a river that leaves the map keeps its bed to the edge. */
  function bedMask(tiles) {
    const m = new Uint8Array(N);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      let all = true, any = false;
      for (let dy = -1; dy <= 0 && all; dy++) for (let dx = -1; dx <= 0; dx++) {
        const x = i + dx, y = j + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        any = true;
        if (!tiles[y * cols + x]) { all = false; break; }
      }
      if (all && any) m[j * W + i] = 1;
    }
    return m;
  }
  /* Vertices touching any flagged tile (the corner vertices of the tiles). */
  function cornerMask(tiles) {
    const m = new Uint8Array(N);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (tiles[y * cols + x]) { m[idx(x, y)] = 1; m[idx(x + 1, y)] = 1; m[idx(x, y + 1)] = 1; m[idx(x + 1, y + 1)] = 1; }
    return m;
  }
  /* Signed distance to a polygon edge: negative inside. Inside, edges lying on the map border do
     not count (a district that reaches the map edge keeps its landform to the edge), and points
     on the border are nudged inward for the containment test. */
  const signedPolyDist = (px, py, pts) => {
    const qx = px + (px < cols / 2 ? 1e-4 : -1e-4), qy = py + (py < rows / 2 ? 1e-4 : -1e-4);
    if (!pointInPoly(qx, qy, pts)) return distToPolyEdge(px, py, pts);
    let d = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j], b = pts[i];
      if ((a[0] <= 0 && b[0] <= 0) || (a[0] >= cols && b[0] >= cols) || (a[1] <= 0 && b[1] <= 0) || (a[1] >= rows && b[1] >= rows)) continue;
      const v = distToSeg(px, py, a[0], a[1], b[0], b[1]); if (v < d) d = v;
    }
    return -(d === Infinity ? 0 : d);
  };
  /* Each vertex within reach of a point: fn(k, i, j, d). */
  const eachNear = (cx, cy, r, fn) => {
    for (let j = Math.max(0, Math.ceil(cy - r)); j <= Math.min(rows, Math.floor(cy + r)); j++) for (let i = Math.max(0, Math.ceil(cx - r)); i <= Math.min(cols, Math.floor(cx + r)); i++) {
      const d = Math.hypot(i - cx, j - cy); if (d < r) fn(idx(i, j), i, j, d);
    }
  };
  /* Mean of the field over a list of vertex indices. */
  const meanOf = keys => { let s = 0, n = 0; for (const k of keys) { s += h[k]; n++; } return n ? s / n : 0; };

  /* ---------- plan geometry ---------- */
  const raster = rasterizePlan(plan);
  const plazaPts = (plan.plaza && plan.plaza.pts) || (state && state.plaza && state.plaza.pts) || null;
  const plazaTiles = plazaPts ? tileMask([plazaPts]) : (state && state.plaza && Number.isFinite(state.plaza.x) ? tileMask([[[state.plaza.x, state.plaza.y], [state.plaza.x + state.plaza.w, state.plaza.y], [state.plaza.x + state.plaza.w, state.plaza.y + state.plaza.h], [state.plaza.x, state.plaza.y + state.plaza.h]]]) : null);
  const plazaVerts = plazaTiles ? cornerMask(plazaTiles) : null;
  /* Lots: the rotated footprint tiles, their corner vertices, the bounding vertex rectangle. */
  const lots = (plan.lots || []).map(l => {
    const r = lotWorldRect(l);
    const tiles = lotRectTiles(l, 0, 0, l.w, l.h).filter(t => t.x >= 0 && t.y >= 0 && t.x < cols && t.y < rows);
    const vset = new Set();
    for (const t of tiles) { vset.add(idx(t.x, t.y)); vset.add(idx(t.x + 1, t.y)); vset.add(idx(t.x, t.y + 1)); vset.add(idx(t.x + 1, t.y + 1)); }
    return { id: l.id, kind: l.kind, lot: l, x: r.x, y: r.y, w: r.w, h: r.h, cx: r.cx, cy: r.cy, rot: r.rot, corners: r.corners, tiles, verts: [...vset], rect: { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, group: -1 };
  });
  const pondLot = lots.find(l => l.kind === 'pond') || null;
  const waters = (plan.water || []).map(w => {
    const tiles = tileMask([w.pts]);
    const height = Number.isFinite(w.height) ? w.height : (w.kind === 'lake' ? -1.6 : -1.4);
    const bank = Array.isArray(w.bank) ? w.bank : [4, 8];
    return { id: w.id || w.kind || 'water', kind: w.kind || 'river', body: w.id || w.kind || 'water', pts: w.pts, tiles, height, bedEnd: height, bedAt: null, bank, shore: height + T.water.shoreLift, surface: Math.round((height + T.water.shoreLift - 0.2) * 1e6) / 1e6, waterway: false };
  });
  /* v11: the waterways (the creek's two reaches and the channel) are waters too, their tiles the
     mask the sim stamps. The bed is w.bed at the reach's start and slides to the next reach's bed
     when that is lower (non increasing from the pond to the lake), read by arc length along the
     spline; the shore floor is the surface + shoreLift (0.2), the banks w.bank tiles. */
  const waterwayPlans = plan.waterways || [];
  for (const w of waterwayPlans) {
    if (!w || !Array.isArray(w.pts) || w.pts.length < 2) continue;
    const tiles = waterwayMask(w, cols, rows);
    const level = Number.isFinite(w.level) ? w.level : -0.9;
    const bed0 = Number.isFinite(w.bed) ? w.bed : level - 0.4;
    const next = waterwayPlans.find(o => o && o.id === w.to);
    const bed1 = next && Number.isFinite(next.bed) && next.bed < bed0 ? next.bed : bed0;
    const samples = splineSamples(w.pts, 0.2);
    const arc = new Float64Array(samples.length);
    for (let i = 1; i < samples.length; i++) arc[i] = arc[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
    const length = arc[arc.length - 1] || 1;
    const bedAt = (x, y) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < samples.length; i++) { const d = (samples[i][0] - x) * (samples[i][0] - x) + (samples[i][1] - y) * (samples[i][1] - y); if (d < bd) { bd = d; best = i; } }
      return lerp(bed0, bed1, arc[best] / length);
    };
    waters.push({ id: w.id, kind: 'waterway', body: w.body || w.id, pts: w.pts, tiles, height: bed0, bedEnd: bed1, bedAt, bank: Array.isArray(w.bank) ? w.bank : [2, 2], shore: level + T.waterway.shoreLift, surface: level, waterway: true, slow: !!w.slow, length });
  }
  const waterTiles = new Uint8Array(cols * rows);
  for (const w of waters) for (let k = 0; k < cols * rows; k++) if (w.tiles[k]) waterTiles[k] = 1;
  /* The island (hole 6): its tiles leave the lake bed and stand at island.height. */
  const golf = plan.golf;
  const islandHoles = ((golf && golf.holes) || []).filter(hh => hh.island && hh.island.pts);
  const islandTiles = islandHoles.length ? tileMask(islandHoles.map(hh => hh.island.pts)) : null;
  if (islandTiles) {
    for (let k = 0; k < cols * rows; k++) if (islandTiles[k]) waterTiles[k] = 0;
    for (const w of waters) for (let k = 0; k < cols * rows; k++) if (islandTiles[k]) w.tiles[k] = 0;
  }
  const islandVerts = islandTiles ? cornerMask(islandTiles) : null;
  const islandHeight = islandHoles.length && Number.isFinite(islandHoles[0].island.height) ? islandHoles[0].island.height : T.island.height;

  /* Lot groups: lots whose footprints share a vertex share a plateau (one vertex, one height). */
  {
    const owner = new Int32Array(N).fill(-1);
    const parent = lots.map((_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    lots.forEach((l, li) => { for (const k of l.verts) { if (owner[k] >= 0 && find(owner[k]) !== find(li)) parent[find(li)] = find(owner[k]); owner[k] = li; } });
    lots.forEach((l, li) => { l.group = find(li); });
  }
  const groups = [];
  for (const l of lots) {
    let g = groups.find(x => x.root === l.group);
    if (!g) { g = { root: l.group, lots: [], zero: false, plateau: 0 }; groups.push(g); }
    g.lots.push(l); l.group = groups.indexOf(g);
  }
  for (const g of groups) g.zero = g.lots.some(l => l === pondLot || (plazaVerts ? l.verts.some(k => plazaVerts[k]) : false));
  /* Zero vertices: the plaza, the pond lot and every lot touching the plaza. */
  const zeroVert = new Uint8Array(N);
  if (plazaVerts) for (let k = 0; k < N; k++) if (plazaVerts[k]) zeroVert[k] = 1;
  for (const g of groups) if (g.zero) for (const l of g.lots) for (const k of l.verts) zeroVert[k] = 1;

  /* ========== 1. relief: landforms shaped by the districts ========== */
  const KIND_ID = { hill: 1, bluff: 2, valley: 3, lake: 4, flats: 5, links: 6 };
  const KIND_NAME = ['none', 'hill', 'bluff', 'valley', 'lake', 'flats', 'links'];
  const landformKind = new Uint8Array(N);   // the district kind that won the vertex (weight over 0.5)
  const wallLines = [], bluffPolys = [];
  {
    const noise = new Float64Array(N);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      let v = 0;
      T.relief.octaves.forEach(([amp, wl], o) => { v += amp * vnoise(i, j, wl, seed + o); });
      noise[idx(i, j)] = v;
    }
    const districts = (plan.districts || []).filter(d => d.landform && KIND_ID[d.landform.kind] && (d.landform.polygon || d.pts));
    for (const d of districts) if (d.landform.kind === 'bluff' && Array.isArray(d.landform.wall) && d.landform.wall.length > 1) { wallLines.push(d.landform.wall); bluffPolys.push(d.landform.polygon || d.pts); }
    /* Per district: the target height, the noise mask and a weight (0 outside its reach) at a vertex. */
    const evalDistrict = (d, i, j) => {
      const lf = d.landform, kind = lf.kind, poly = lf.polygon || d.pts;
      const LF = T.landform[kind];
      const sd = signedPolyDist(i, j, poly);
      const inside = sd <= 0, dIn = inside ? -sd : 0, dOut = inside ? 0 : sd;
      const height = Number.isFinite(lf.height) ? lf.height : 0;
      if (kind === 'hill') {
        const radius = lf.radius > 0 ? lf.radius : 30;
        let dc;
        if (Array.isArray(lf.ridge) && lf.ridge.length > 1) dc = distToLine(i, j, lf.ridge);
        else { const c = lf.center || [0, 0]; dc = Math.hypot(i - c[0], j - c[1]); }
        // a flat crest, then a cosine like fall to the radius; the noise mask scales with the
        // hill's height (a 3 high terrace carries a third of the 9 high hill's roughness)
        const crest = Math.min(LF.crest, radius * 0.5);
        const bump = dc >= radius ? 0 : height * (1 - smooth(Math.max(0, dc - crest) / (radius - crest)));
        return { target: bump, mask: LF.mask * Math.min(1, Math.abs(height) / 9) * smooth(dc / LF.maskFade), weight: inside ? smooth(dIn / LF.edge) : 0 };
      }
      if (kind === 'bluff') {
        // inside the plateau the target holds to the edge; outside it falls over the wall width
        // on the wall side and over the slope width elsewhere
        let w = 1;
        if (!inside) {
          const wall = Array.isArray(lf.wall) && lf.wall.length > 1 ? distToLine(i, j, lf.wall) : Infinity;
          const width = Math.abs(wall - dOut) < 0.75 ? LF.wallWidth : LF.slopeWidth;
          w = 1 - smooth(dOut / width);
        }
        return { target: height, mask: LF.mask, weight: w };
      }
      if (kind === 'valley') {
        const line = Array.isArray(lf.line) ? lf.line : null;
        const bank = Array.isArray(lf.bank) ? lf.bank : [4, 8];
        const dl = line ? distToLine(i, j, line) : (inside ? dIn : Infinity);
        const inner = Number.isFinite(lf.inner) ? lf.inner : LF.inner;
        const reach = inner + bank[1];
        const w = dl >= reach ? 0 : 1 - smooth((dl - inner) / (reach - inner));
        return { target: LF.floor, mask: LF.mask, weight: w };
      }
      if (kind === 'lake') {
        const bank = Array.isArray(lf.bank) ? lf.bank : [3, 6];
        const w = inside ? 1 : 1 - smooth(dOut / bank[1]);
        return { target: height, mask: LF.mask, weight: w };
      }
      if (kind === 'links') {
        const range = Array.isArray(lf.range) ? lf.range : [-0.5, 2.5];
        const target = clampv(height + LF.roll * noise[idx(i, j)], range[0], range[1]);
        return { target, mask: LF.mask, weight: inside ? smooth(dIn / LF.edge) : 0 };
      }
      return { target: height, mask: LF.mask, weight: inside ? smooth(dIn / LF.edge) : 0 };   // flats
    };
    const bounds = districts.map(d => polyBounds(d.landform.polygon || d.pts));
    const reaches = districts.map(d => { const k = d.landform.kind; return k === 'valley' ? 14 : k === 'bluff' ? T.landform.bluff.slopeWidth + 1 : k === 'lake' ? 8 : 1; });
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const k = idx(i, j);
      let target = 0, mask = T.relief.defaultMask, kindId = 0;
      // later districts first, so an earlier district (the plan's priority) overrides where it reaches
      for (let di = districts.length - 1; di >= 0; di--) {
        const b = bounds[di], reach = reaches[di];
        if (i < b.x0 - reach || i > b.x1 + reach || j < b.y0 - reach || j > b.y1 + reach) continue;
        const e = evalDistrict(districts[di], i, j);
        if (e.weight <= 0) continue;
        target = lerp(target, e.target, e.weight);
        mask = lerp(mask, e.mask, e.weight);
        if (e.weight >= 0.5) kindId = KIND_ID[districts[di].landform.kind];
      }
      h[k] = target + mask * noise[k];
      landformKind[k] = kindId;
    }
  }

  /* ========== 2. water: beds, shore floor, banks, the island ========== */
  const waterD = new Float32Array(N).fill(T.water.maxBank + 1);   // distance to the nearest bed vertex
  const waterShore = new Float32Array(N);                           // the shore height of that water
  const waterBed = new Float32Array(N);
  const waterBankLo = new Float32Array(N), waterBankHi = new Float32Array(N);
  const waterIsWay = new Uint8Array(N);                             // v11: the nearest water is a waterway
  const waterBankW = new Float32Array(N);                           // v11: the bank width drawn for the vertex
  const wallNear = new Uint8Array(N);                               // the bluff wall band (river side plus one tile)
  {
    for (const w of waters) {
      w.bed = bedMask(w.tiles);
      w.dist = distField(w.bed, T.water.maxBank);
      const wetId = w.waterway ? (w.body === 'creek' ? 3 : w.body === 'channel' ? 4 : 2) : (w.kind === 'lake' ? 2 : 1);
      for (let k = 0; k < N; k++) {
        if (w.bed[k]) {
          // v11: where two beds meet (the creek's reaches, the channel in the river) the lower one holds
          const v = w.bedAt ? w.bedAt(k % W, (k / W) | 0) : w.height;
          if (!wet[k] || v < h[k]) { h[k] = v; wet[k] = wetId; }
        }
        if (w.dist[k] < waterD[k]) { waterD[k] = w.dist[k]; waterShore[k] = w.shore; waterBed[k] = w.height; waterBankLo[k] = w.bank[0]; waterBankHi[k] = w.bank[1]; waterIsWay[k] = w.waterway ? 1 : 0; }
      }
    }
    // the bluff wall: banks beside it are the wall width and keep their designed slope; the band
    // is the river side of the wall line plus one tile onto the plateau (the rest of the plateau
    // is level ground, so a street along the edge sits on it)
    const plateauVert = new Uint8Array(N);
    if (bluffPolys.length) for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      for (const p of bluffPolys) if (pointInPoly(i, j, p) && distToPolyEdge(i, j, p) > 1.0) { plateauVert[idx(i, j)] = 1; break; }
    }
    if (wallLines.length) for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      let d = Infinity; for (const wl of wallLines) { const v = distToLine(i, j, wl); if (v < d) d = v; }
      if (d <= T.water.wallNear && !plateauVert[idx(i, j)]) { wallNear[idx(i, j)] = 1; steep[idx(i, j)] = 1; }
    }
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const k = idx(i, j);
      if (wet[k]) continue;
      if (islandVerts && islandVerts[k]) { h[k] = islandHeight; pinned[k] = 8; steep[k] = 1; continue; }
      if (plateauVert[k]) continue;   // the plateau holds to its wall; the wall band takes the drop
      const d = waterD[k];
      if (d > T.water.maxBank) continue;
      const bankW = wallNear[k] ? T.water.wallBankW : lerp(waterBankLo[k], waterBankHi[k], 0.5 + 0.5 * vnoise(i, j, T.water.bankNoiseWl, seed + 3));
      waterBankW[k] = bankW;
      if (d < 1 + bankW) {
        const shore = waterShore[k];
        h[k] = lerp(shore, Math.max(h[k], shore), smooth((d - 1) / bankW));
        steep[k] = 1;
        if (d <= T.water.shoreR) pinned[k] = 5;
      }
    }
  }

  /* ========== 3a. plaza and pond plateaus at 0 ========== */
  const setVerts = (keys, value, pin) => { for (const k of keys) { if (wet[k]) continue; h[k] = value; pinned[k] = (pin === 1 && pinned[k] === 2) ? 2 : pin; } };
  if (plazaVerts && plazaPts) {
    const keys = []; for (let k = 0; k < N; k++) if (plazaVerts[k]) keys.push(k);
    setVerts(keys, 0, 2);
    const b = polyBounds(plazaPts), R = Math.ceil(T.plateau.blend);
    for (let j = Math.max(0, b.y0 - R); j <= Math.min(rows, b.y1 + R); j++) for (let i = Math.max(0, b.x0 - R); i <= Math.min(cols, b.x1 + R); i++) {
      const k = idx(i, j); if (pinned[k] || wet[k]) continue;
      const d = distToPolyEdge(i, j, plazaPts); if (d >= T.plateau.blend || pointInPoly(i, j, plazaPts)) continue;
      h[k] = lerp(0, h[k], smooth(d / T.plateau.blend));
    }
  }
  if (pondLot) {
    // v11: the creek leaves the pond through the lot. Its bed vertices are wet (setVerts skips
    // them) and its bank vertices inside the lot climb from the shore floor to the plateau over the
    // bank width instead of taking it, so the mouth has banks like the park reach; the deck planks
    // keep the plateau at every corner, the pier tile at the corners it does not share with a
    // waterway tile (its creek side takes the bank, so the water beside it is not held at 0).
    const keep = new Uint8Array(N);
    {
      const deckTiles = new Uint8Array(cols * rows);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (raster.at(x, y) === MARK.DECK) deckTiles[y * cols + x] = 1;
      const cmDeck = cornerMask(deckTiles);
      let cmPier = null, cmWay = null;
      if (raster.pier && raster.pier.tile) {
        const pierTiles = new Uint8Array(cols * rows);
        pierTiles[raster.pier.tile.y * cols + raster.pier.tile.x] = 1;
        cmPier = cornerMask(pierTiles);
        const wayTiles = new Uint8Array(cols * rows);
        for (const w of waters) if (w.waterway) for (let k = 0; k < cols * rows; k++) if (w.tiles[k]) wayTiles[k] = 1;
        cmWay = cornerMask(wayTiles);
      }
      for (let k = 0; k < N; k++) keep[k] = (cmDeck[k] || (cmPier && cmPier[k] && !cmWay[k])) ? 1 : 0;
    }
    const flat = [];
    for (const k of pondLot.verts) {
      if (wet[k]) continue;
      const d = waterD[k], bw = waterBankW[k];
      if (waterIsWay[k] && !keep[k] && d < 1 + bw) {
        h[k] = lerp(waterShore[k], 0, smooth((d - 1) / bw));
        steep[k] = 1;
        pinned[k] = d <= T.water.shoreR ? 5 : 0;
        continue;
      }
      flat.push(k);
    }
    setVerts(flat, 0, 2);
    const r = pondLot.rect, R = Math.ceil(T.plateau.blend) + 1;
    for (let j = Math.max(0, r.y0 - R); j <= Math.min(rows, r.y1 + R); j++) for (let i = Math.max(0, r.x0 - R); i <= Math.min(cols, r.x1 + R); i++) {
      const k = idx(i, j); if (pinned[k] || wet[k] || (waterIsWay[k] && steep[k])) continue;
      const d = distToLot(pondLot.lot, i, j); if (d <= 0 || d >= T.plateau.blend) continue;
      h[k] = lerp(0, h[k], smooth(d / T.plateau.blend));
    }
  }

  /* ========== 3b. roads as a network along their splines ========== */
  const stairIds = new Set((plan.stairs || []).map(s => s.id));
  const roads = (plan.roads || []).map((r, ri) => {
    const width = r.width || ROAD_KINDS[r.kind] || 2, hw = width / 2;
    const poly = splineSamples(r.pts, 0.5);
    const prof = makeProfile(poly, T.road.sampleStep);
    for (const s of prof.samples) s.road = ri;
    const isStairs = stairIds.has(r.id);
    const stair = isStairs ? (plan.stairs || []).find(st => st.id === r.id) : null;
    const cap = isStairs ? Infinity : (r.kind === 'switchback' ? T.road.switchbackCap : T.road.cap);
    const blend = r.kind === 'switchback' ? T.road.switchbackBlend : T.road.blend;
    const sidewalks = !!r.sidewalks && width > 1;
    const edge = (sidewalks ? hw + 1 : hw) + T.road.edgePad;
    const reach = edge + blend;
    // distance from every vertex near the road to its centerline, stamped from the samples
    const dist = new Float32Array(N).fill(Infinity);
    const R = Math.ceil(reach + 1.5);
    for (const s of prof.samples) {
      for (let j = Math.max(0, Math.floor(s.y - R)); j <= Math.min(rows, Math.ceil(s.y + R)); j++) for (let i = Math.max(0, Math.floor(s.x - R)); i <= Math.min(cols, Math.ceil(s.x + R)); i++) {
        const d = Math.hypot(i - s.x, j - s.y), k = idx(i, j); if (d < dist[k]) dist[k] = d;
      }
    }
    const p0 = r.pts[0], pl = r.pts[r.pts.length - 1];
    const closed = r.pts.length > 2 && Math.hypot(p0[0] - pl[0], p0[1] - pl[1]) < 1e-6;
    // a switchback's hairpins (the direction two control points back against two ahead turns
    // through more than about 117 degrees): the road is level through each
    const hairpins = [];
    if (r.kind === 'switchback') {
      const p = r.pts;
      for (let i = 2; i + 2 < p.length; i++) {
        const ax = p[i][0] - p[i - 2][0], ay = p[i][1] - p[i - 2][1], bx = p[i + 2][0] - p[i][0], by = p[i + 2][1] - p[i][1];
        const dot = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
        if (dot < -0.45) { hairpins.push(p[i]); i += 2; }
      }
    }
    return { id: r.id, kind: r.kind, pts: poly, ctrl: r.pts, hw, width, band: hw + T.road.band, sidewalks, bounds: polyBounds(poly), prof, samples: prof.samples, cap, isStairs, stair, blend, edge, reach, dist, closed, hairpins, stairTop: null, stairBottom: null };
  });
  const roadOwner = new Int16Array(N).fill(-1);   // the road whose profile pinned each road or sidewalk vertex (the lot frontage reads it)
  /* v11: every bridge with an `arch` is on the boat network. The road samples over its span (the
     span's tiles plus one tile at each end) floor at the water surface + clearance - arch, so the
     deck, drawn arch above the ramp between its ends, clears the contract's 1.2 over the water
     and the road ramps up to it no faster than its cap. The surface is that of the water with
     the most tiles under the span. */
  const clearZones = [];
  for (const br of plan.bridges || []) {
    if (!Number.isFinite(br.arch)) continue;
    const [ax, ay] = br.a, [bx, by] = br.b, dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    if ((dx && dy) || (!dx && !dy)) continue;
    const offs = br.width >= 3 ? [-1, 0, 1] : br.width === 2 ? [-1, 0] : [0];
    let best = null, bn = 0;
    for (const w of waters) {
      let n = 0;
      for (let r = 0; r < Math.abs(bx - ax) + Math.abs(by - ay) + 1; r++) for (const o of offs) {
        const x = dx ? ax + dx * r : ax + o, y = dx ? ay + o : ay + dy * r;
        if (x >= 0 && y >= 0 && x < cols && y < rows && w.tiles[y * cols + x]) n++;
      }
      if (n > bn) { bn = n; best = w; }
    }
    if (!best) continue;
    const x0 = (dx ? Math.min(ax, bx) - 1 : ax + offs[0]), x1 = (dx ? Math.max(ax, bx) + 2 : ax + offs[offs.length - 1] + 1);
    const y0 = (dy ? Math.min(ay, by) - 1 : ay + offs[0]), y1 = (dy ? Math.max(ay, by) + 2 : ay + offs[offs.length - 1] + 1);
    clearZones.push({ id: br.id, x0, y0, x1, y1, arch: clampv(br.arch, 0, 1.5), floor: best.surface + T.waterway.clearance - br.arch + 0.02, surface: best.surface, water: best.id });
  }
  {
    const R = T.road;
    /* Green zones: samples within a green's collar plus greenZone of a cup are pinned (like zero
       pins, at a value) to the green's plateau, the mean of the field over the green disc before
       the roads, so a path crossing a green's disc is level with it (the green takes that height
       from the path's pinned vertices). Hairpin zones level at the mean of their samples. */
    const zones = ((golf && golf.holes) || []).map(hh => {
      const z = { x: hh.cup.x + 0.5, y: hh.cup.y + 0.5, r: (hh.greenR || T.course.greenR) + T.course.collar + R.greenZone, v: 0 };
      let s = 0, n = 0;
      eachNear(z.x, z.y, (hh.greenR || T.course.greenR) + 1e-9, k => { if (!wet[k]) { s += h[k]; n++; } });
      z.v = n ? s / n : 0;
      if (hh.island && Number.isFinite(hh.island.height)) z.v = hh.island.height;
      return z;
    });
    const levelZones = rd => {
      const acc = new Map();
      for (const s of rd.samples) if (s.flat) { const a = acc.get(s.flat) || { sum: 0, n: 0 }; a.sum += s.v; a.n++; acc.set(s.flat, a); }
      for (const s of rd.samples) if (s.flat) { const a = acc.get(s.flat); s.v = a.sum / a.n; }
    };
    for (const rd of roads) {
      for (const s of rd.samples) {
        s.flat = 0; s.loopEnd = false; s.pinV = null; s.linkFixed = false;
        for (const z of zones) if (Math.hypot(s.x - z.x, s.y - z.y) <= z.r) s.pinV = z.v;
        rd.hairpins.forEach((a, ai) => { if (Math.hypot(s.x - a[0], s.y - a[1]) <= R.hairpinZone) s.flat = 100 + ai; });
        // base: mean of the field over the non wet vertices within the band, ignoring bank and
        // wall vertices when level ground is in the band (a street along the bluff edge sits on the
        // plateau, not halfway down the wall); a zero vertex in the band pins the sample at 0
        let sum = 0, n = 0, ssum = 0, sn = 0, zero = false;
        for (let j = Math.max(0, Math.ceil(s.y - rd.band)); j <= Math.min(rows, Math.floor(s.y + rd.band)); j++) for (let i = Math.max(0, Math.ceil(s.x - rd.band)); i <= Math.min(cols, Math.floor(s.x + rd.band)); i++) {
          if (Math.hypot(i - s.x, j - s.y) > rd.band) continue;
          const k = idx(i, j);
          if (zeroVert[k]) zero = true;
          if (wet[k]) continue;
          if (steep[k]) { ssum += h[k]; sn++; } else { sum += h[k]; n++; }
        }
        s.v = zero ? 0 : s.pinV != null ? s.pinV : (n ? sum / n : sn ? ssum / sn : 0);
        s.zero = zero;
        s.cap = rd.cap;
        // a road beside water stays on the shore floor (never under the water plane) and ramps
        // down to it no faster than the cap, so the floor is always reachable; zero pins are exempt
        const k = idx(clampv(Math.round(s.x), 0, cols), clampv(Math.round(s.y), 0, rows));
        const dw = waterD[k];
        if (dw <= T.water.maxBank) s.floor = waterShore[k] - R.cap * Math.max(0, dw - (rd.hw + T.water.shoreR + 1.5));
        // v11: over a boat bridge's span the road floors at the deck clearance
        if (!rd.isStairs) for (const z of clearZones) if (s.x >= z.x0 && s.x <= z.x1 && s.y >= z.y0 && s.y <= z.y1 && z.floor > s.floor) s.floor = z.floor;
        // a path in the bluff wall band hugs the foot of the wall (the riverside walk), never the wall face
        if (rd.width <= 1 && !rd.isStairs && wallNear[k] && dw <= T.water.maxBank && s.pinV == null && !zero) s.v = Math.min(s.v, waterShore[k] + 0.2);
      }
      if (!rd.isStairs) movingWindow(rd.samples, R.window);
      for (const s of rd.samples) if (!s.zero && s.pinV == null && s.v < s.floor) s.v = s.floor;
      levelZones(rd);
      // a closed loop ends where it starts: its two end samples are partners and share one height
      if (rd.closed && rd.samples.length > 2) {
        const a = rd.samples[0], b = rd.samples[rd.samples.length - 1];
        (a.partners = a.partners || []).push(b); (b.partners = b.partners || []).push(a);
        a.loopEnd = b.loopEnd = true;
      }
    }
    // junctions: a sample within the other road's paved and sidewalk width plus 1 of its
    // centerline, partnered with that road's nearest sample (a path meeting a sidewalk joins the street)
    for (const rd of roads) for (const s of rd.samples) {
      for (const other of roads) {
        if (other === rd) continue;
        const reach = other.hw + (other.sidewalks ? 1 : 0) + R.junction;
        const b = other.bounds; if (s.x < b.x0 - reach - 1 || s.x > b.x1 + reach + 1 || s.y < b.y0 - reach - 1 || s.y > b.y1 + reach + 1) continue;
        if (distToLine(s.x, s.y, other.pts) <= reach) {
          if (!s.partners) s.partners = [];
          s.partners.push(other.samples[nearestSampleIndex(other.samples, s.x, s.y)]);
        }
      }
    }
    // stairs (plan.stairs): the top sample follows the street it leaves, the bottom sits `drop`
    // below it and the flight is straight between them; the path at the bottom takes that height
    for (const rd of roads) {
      if (!rd.isStairs) continue;
      const st = rd.stair, S = rd.samples;
      const from = st && Array.isArray(st.from) ? st.from : [S[0].x - 0.5, S[0].y - 0.5];
      const to = st && Array.isArray(st.to) ? st.to : [S[S.length - 1].x - 0.5, S[S.length - 1].y - 0.5];
      rd.stairTop = S[nearestSampleIndex(S, from[0] + 0.5, from[1] + 0.5)];
      rd.stairBottom = S[nearestSampleIndex(S, to[0] + 0.5, to[1] + 0.5)];
      rd.drop = st && Number.isFinite(st.drop) ? st.drop : 0;
    }
    const shapeStairs = rd => {
      const S = rd.samples, a = S.indexOf(rd.stairTop), b = S.indexOf(rd.stairBottom);
      if (a < 0 || b < 0 || a === b) return;
      // the flight never lands under the shore floor beside water; the from and to tiles are
      // level landings (samples within half a tile of each end), the flight is straight between
      rd.stairBottom.v = Math.max(rd.stairTop.v - rd.drop, rd.stairBottom.floor);
      const top = rd.stairTop, bot = rd.stairBottom;
      let lo = Math.min(a, b), hi = Math.max(a, b);
      const first = S[lo], last = S[hi];
      let l2 = lo, h2 = hi;
      while (l2 + 1 < h2 && Math.hypot(S[l2 + 1].x - first.x, S[l2 + 1].y - first.y) <= 0.75) l2++;
      while (h2 - 1 > l2 && Math.hypot(S[h2 - 1].x - last.x, S[h2 - 1].y - last.y) <= 0.75) h2--;
      for (let i = 0; i < S.length; i++) {
        const t = i <= l2 ? 0 : i >= h2 ? 1 : (i - l2) / (h2 - l2);
        S[i].v = lerp(first === top ? top.v : bot.v, last === bot ? bot.v : top.v, t);
      }
    };
    // bridge links: the road samples at the two ends of a span stay within cap * span of each other
    const bridgeLinks = [];
    for (const br of plan.bridges || []) {
      const [ax, ay] = br.a, [bx, by] = br.b, dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
      if ((dx && dy) || (!dx && !dy)) continue;
      const endSample = (tx, ty) => {
        let best = null, bd = Infinity;
        for (const rd of roads) { const d = distToLine(tx + 0.5, ty + 0.5, rd.pts); if (d <= rd.hw + 1 && d < bd) { bd = d; best = rd; } }
        return best ? best.samples[nearestSampleIndex(best.samples, tx + 0.5, ty + 0.5)] : null;
      };
      const sa = endSample(ax - dx, ay - dy), sb = endSample(bx + dx, by + dy);
      if (!sa || !sb || sa === sb) continue;
      // a high bridge may climb more steeply (the design's deck from the terrace to the bluff)
      const lim = (br.kind === 'high' ? R.highBridgeCap : R.cap) * (Math.abs(bx - ax) + Math.abs(by - ay) + 2);
      (sa.links = sa.links || []).push({ s: sb, lim }); (sb.links = sb.links || []).push({ s: sa, lim });
      bridgeLinks.push({ a: sa, b: sb, lim, zone: clearZones.find(z => z.id === br.id) || null });
    }
    // zero pins propagate across junctions both ways, swept until nothing changes
    for (let sweep = 0, changed = true; sweep < 8 && changed; sweep++) {
      changed = false;
      for (const rd of roads) for (const s of rd.samples) {
        if (!s.partners) continue;
        if (s.zero) { for (const p of s.partners) if (!p.zero) { p.zero = true; p.v = 0; changed = true; } }
        else if (s.partners.some(p => p.zero)) { s.zero = true; s.v = 0; changed = true; }
      }
    }
    const zeroFixed = s => s.zero || s.pinV != null || !!s.linkFixed;
    const zeroOrJunction = s => s.zero || s.pinV != null || !!s.linkFixed || !!s.partners;
    const zeroOrZone = s => s.zero || s.pinV != null || !!s.linkFixed || s.loopEnd || !!s.flat;
    const junctionGap = () => { let g = 0; for (const rd of roads) for (const s of rd.samples) if (s.partners) for (const p of s.partners) g = Math.max(g, Math.abs(s.v - p.v)); return g; };
    for (let round = 0; round < R.rounds + R.extraRounds; round++) {
      if (round >= R.rounds && junctionGap() <= R.junctionGap) break;
      for (const L of bridgeLinks) {
        // the lower approach ramps up to the span (a bridge never cuts into the higher bank); the
        // lifted sample stays fixed so the lift propagates along its road instead of relaxing away
        const ex = Math.abs(L.a.v - L.b.v) - L.lim; if (ex <= 0) continue;
        const lo = L.a.v < L.b.v ? L.a : L.b, hi = lo === L.a ? L.b : L.a;
        if (lo.zero || lo.pinV != null) hi.v -= ex; else { lo.v += ex; lo.linkFixed = true; }
      }
      // v11: a boat bridge's deck clears the water at mid span (the ramp between its ends plus
      // the arch); when the floors could not get it there (the ends are zero pinned to a plateau,
      // the creek path along the pond lot) both ends lift by the deficit and stay fixed, and the
      // samples within the ramp's reach lose their zero pin so the road climbs to them at its cap
      for (const L of bridgeLinks) {
        if (!L.zone) continue;
        const mid = (L.a.v + L.b.v) / 2 + L.zone.arch;
        const ex = L.zone.surface + T.waterway.clearance + 0.02 - mid;
        if (ex <= 1e-9) continue;
        for (const s of [L.a, L.b]) {
          const rd = roads[s.road], reach = ex / rd.cap + 1;
          for (const q of rd.samples) if (q.zero && Math.hypot(q.x - s.x, q.y - s.y) <= reach) q.zero = false;
          s.zero = false; s.v += ex; s.linkFixed = true;
        }
      }
      for (const rd of roads) {
        for (const s of rd.samples) {
          if (s.zero || s.pinV != null || !s.partners) continue;
          let sum = s.v; for (const p of s.partners) sum += p.v;
          s.v = sum / (1 + s.partners.length);
        }
        if (rd.isStairs) { shapeStairs(rd); continue; }
        for (let p = 0; p < R.passes; p++) clampPass(rd.samples, p % 2 === 0, p < 2 ? zeroOrJunction : zeroFixed, undefined, true);
        levelZones(rd);   // zones take the mean of their clamped samples, so they settle where the caps allow
      }
    }
    // consistency, in plan order: a road's junction samples with earlier roads take those roads'
    // profile at the sample point, its bridge links to earlier roads hold, and the rest of the road
    // conforms with its own cap; a last set of free passes makes the cap a guarantee
    // Stairs are authoritative for the path they land on whatever the plan order, and the pass
    // runs twice so a path earlier in the plan than its stairs reads the stairs' settled flight.
    const fixedHere = s => s.fixed;
    const leads = (p, ri) => p.road < ri || roads[p.road].isStairs;
    for (let pass = 0; pass < 2; pass++) for (let ri = 0; ri < roads.length; ri++) {
      const rd = roads[ri];
      if (rd.isStairs) {
        const top = rd.stairTop;
        if (top) {
          let sum = 0, n = 0;
          if (top.partners) for (const p of top.partners) if (!roads[p.road].isStairs) { sum += profileAt(roads[p.road].prof, top.x, top.y); n++; }
          if (n) top.v = sum / n;
        }
        shapeStairs(rd);
        for (const s of rd.samples) s.fixed = true;
        continue;
      }
      for (const s of rd.samples) {
        s.fixed = s.zero || s.pinV != null || !!s.linkFixed;
        if (s.fixed) continue;
        let sum = 0, n = 0;
        if (s.partners) for (const p of s.partners) if (leads(p, ri)) { sum += profileAt(roads[p.road].prof, s.x, s.y); n++; }
        if (n) { s.v = sum / n; s.fixed = true; }
        if (s.links) for (const L of s.links) if (L.s.road < ri) { s.v = clampv(s.v, L.s.v - L.lim, L.s.v + L.lim); s.fixed = true; }
      }
      // a loop's two ends meet (at the fixed one, or their mean)
      if (rd.closed && rd.samples.length > 2) {
        const a = rd.samples[0], b = rd.samples[rd.samples.length - 1];
        const v = a.fixed && !b.fixed ? a.v : b.fixed && !a.fixed ? b.v : (a.v + b.v) / 2;
        a.v = b.v = v; a.fixed = b.fixed = true;
      }
      // the junctions hold and the rest conforms; then each flat zone levels at the mean of its
      // fixed samples (a junction inside it) or of its clamped samples, where the caps allow,
      // and stays fixed while the road conforms again; a last set of passes with the junctions
      // free guards the cap where the plan leaves no feasible profile
      for (let p = 0; p < 8; p++) clampPass(rd.samples, p % 2 === 0, fixedHere, undefined, true);
      {
        const acc = new Map();
        for (const s of rd.samples) if (s.flat) { const a = acc.get(s.flat) || { sum: 0, n: 0, fsum: 0, fn: 0 }; a.sum += s.v; a.n++; if (s.fixed) { a.fsum += s.v; a.fn++; } acc.set(s.flat, a); }
        for (const s of rd.samples) if (s.flat) { const a = acc.get(s.flat); s.v = a.fn ? a.fsum / a.fn : a.sum / a.n; s.fixed = true; }
      }
      for (let p = 0; p < 8; p++) clampPass(rd.samples, p % 2 === 0, fixedHere, rd.cap, true);
      for (let p = 0; p < 4; p++) clampPass(rd.samples, p % 2 === 0, zeroOrZone, rd.cap, false);
    }

    // cross section, level: the raster's road, path and cart path tiles of this road pin their
    // vertices (3), its sidewalk tiles theirs (6). A vertex shared by two roads belongs to the road
    // whose centerline is nearest (a road vertex beats a sidewalk vertex, ties go to plan order).
    const owner = roadOwner, ownerD = new Float32Array(N).fill(Infinity), ownerPin = new Uint8Array(N);
    const isPaved = m => m === MARK.ROAD || m === MARK.PATH || m === MARK.CARTPATH;
    roads.forEach((rd, ri) => {
      const b = rd.bounds, pad = Math.ceil(rd.hw + 2);
      for (let y = Math.max(0, b.y0 - pad); y <= Math.min(rows - 1, b.y1 + pad); y++) for (let x = Math.max(0, b.x0 - pad); x <= Math.min(cols - 1, b.x1 + pad); x++) {
        const mark = raster.at(x, y);
        if (mark === MARK.WATER || mark === MARK.BRIDGE) continue;
        const ks = [idx(x, y), idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)];
        let dmin = Infinity; for (const k of ks) if (rd.dist[k] < dmin) dmin = rd.dist[k];
        let pin;
        if (isPaved(mark) && raster.roadIdx[y * cols + x] === ri) pin = 3;
        else if (rd.sidewalks && mark === MARK.SIDEWALK && dmin <= rd.hw + 1.5) pin = 6;
        else continue;
        for (const k of ks) {
          if (pinned[k] === 2 || pinned[k] === 4 || pinned[k] === 8) continue;
          if (wet[k] && pin !== 3) continue;
          const dv = rd.dist[k];
          if (owner[k] >= 0 && (ownerPin[k] < pin || (ownerPin[k] === pin && ownerD[k] <= dv))) continue;
          owner[k] = ri; ownerD[k] = dv; ownerPin[k] = pin;
        }
      }
    });
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const k = idx(i, j); if (owner[k] < 0) continue;
      h[k] = profileAt(roads[owner[k]].prof, i, j); pinned[k] = ownerPin[k]; wet[k] = 0;
    }
    // blend from the band edge outward, farther on the switchback so its cut reads as a bench
    for (const rd of roads) {
      if (rd.isStairs) continue;
      const b = rd.bounds, pad = Math.ceil(rd.reach);
      for (let j = Math.max(0, b.y0 - pad); j <= Math.min(rows, b.y1 + pad); j++) for (let i = Math.max(0, b.x0 - pad); i <= Math.min(cols, b.x1 + pad); i++) {
        const k = idx(i, j); if (pinned[k] || wet[k]) continue;
        const dl = rd.dist[k]; if (dl >= rd.reach) continue;
        const d = Math.max(0, dl - rd.edge);
        h[k] = lerp(profileAt(rd.prof, i, j), h[k], smooth(d / rd.blend));
      }
    }
  }

  /* ========== 3c. bridges ========== */
  const bridgeRecs = [], bridgeSpans = [];
  for (const br of plan.bridges || []) {
    const [ax, ay] = br.a, [bx, by] = br.b;
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    if ((dx && dy) || (!dx && !dy)) continue;
    // deck columns follow the raster: width 1 covers c, width 2 covers c - 1 .. c, width 3 covers c - 1 .. c + 1
    const offs = br.width >= 3 ? [-1, 0, 1] : br.width === 2 ? [-1, 0] : [0];
    const across = [offs[0], offs[offs.length - 1] + 1];
    const count = Math.abs(bx - ax) + Math.abs(by - ay) + 1;
    // vertex rows along the span: row 0 is the edge shared with the tile before a, row count the
    // edge shared with the tile after b; both keep that tile's height and the deck ramps between
    const rowVertex = (r, o) => dx ? idx(ax + dx * r + (dx < 0 ? 1 : 0), ay + o) : idx(ax + o, ay + dy * r + (dy < 0 ? 1 : 0));
    const rowMean = r => { let s = 0, n = 0; for (let o = across[0]; o <= across[1]; o++) { const x = dx ? ax + dx * r + (dx < 0 ? 1 : 0) : ax + o, y = dx ? ay + o : ay + dy * r + (dy < 0 ? 1 : 0); if (!inV(x, y)) continue; s += h[rowVertex(r, o)]; n++; } return n ? s / n : 0; };
    // an end's height is the profile of the road owning the tile beyond it (its own level cross
    // section), or the mean of the edge row where no road owns it (the island shore)
    const endHeight = (tx, ty, r) => { if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) { const ri = raster.roadIdx[ty * cols + tx]; if (ri >= 0 && roads[ri]) return profileAt(roads[ri].prof, tx + 0.5, ty + 0.5); } return rowMean(r); };
    const hA = endHeight(ax - dx, ay - dy, 0), hB = endHeight(bx + dx, by + dy, count);
    // v10 final: only the end rows and the rows over dry land take the deck ramp (the approaches);
    // a row with a bed vertex stays at the water, so the heightfield keeps the water under the
    // deck instead of a causeway at deck height, and a dry bank vertex under the deck is lowered
    // to the ramp so it never pokes through it. heightAt and slopeAt overlay the deck over the
    // span (bridgeSpans below), so walkers, the cart and the road ribbon still read the deck.
    const rowWet = r => { for (let o = across[0]; o <= across[1]; o++) { const x = dx ? ax + dx * r + (dx < 0 ? 1 : 0) : ax + o, y = dx ? ay + o : ay + dy * r + (dy < 0 ? 1 : 0); if (inV(x, y) && wet[idx(x, y)]) return true; } return false; };
    // v11: a row of shore or bank vertices (pinned 5, or within 1.5 of a bed vertex) beside a wet
    // row is the water's edge under the deck, not an approach: a narrow waterway (the creek, two
    // wide under Links Road) has only one wet vertex column, and raising its bank columns to the
    // ramp would cut the water plane and leave a hull inside the ground
    const rowShore = r => { for (let o = across[0]; o <= across[1]; o++) { const x = dx ? ax + dx * r + (dx < 0 ? 1 : 0) : ax + o, y = dx ? ay + o : ay + dy * r + (dy < 0 ? 1 : 0); if (!inV(x, y)) continue; const k = idx(x, y); if (pinned[k] === 5 || waterD[k] <= 1.5) return true; } return false; };
    // v11: the arch, a cosine hump of `arch` at mid span and zero at the ends, lifts the deck
    // above the straight ramp; the approach rows take it too, so the field meets the deck
    const archPlan = Number.isFinite(br.arch) ? clampv(br.arch, 0, 1.5) : 0;
    // v12.1: the hump is only as tall as the boats need. The plan's arch is the most a deck may
    // rise at mid span; when the ramp between the banks already clears the water (high banks,
    // the channel cart bridge) the arch shrinks toward zero, so decks are long gentle curves,
    // not humps. The floor set in the clear zone assumed the full arch, so this never loses clearance.
    const zone0 = clearZones.find(z => z.id === br.id) || null;
    const need = zone0 ? zone0.surface + T.waterway.clearance - lerp(hA, hB, 0.5) : 0;
    const arch = zone0 ? clampv(Math.min(archPlan, Math.max(0, need)), 0, 1.5) : archPlan;
    const hump = t => arch ? arch * 0.5 * (1 - Math.cos(2 * Math.PI * t)) : 0;
    for (let r = 0; r <= count; r++) {
      const v = lerp(hA, hB, r / count) + hump(r / count);
      const over = r > 0 && r < count && (rowWet(r) || rowWet(r - 1) || rowWet(r + 1) || rowShore(r));
      for (let o = across[0]; o <= across[1]; o++) {
        const x = dx ? ax + dx * r + (dx < 0 ? 1 : 0) : ax + o, y = dx ? ay + o : ay + dy * r + (dy < 0 ? 1 : 0);
        if (!inV(x, y)) continue;
        const kk = idx(x, y);
        if (over) { if (!wet[kk] && h[kk] > v) h[kk] = v; continue; }
        h[kk] = v; pinned[kk] = 4; wet[kk] = 0;
      }
    }
    const x0 = dx ? Math.min(ax, bx) : ax + offs[0], x1 = dx ? Math.max(ax, bx) + 1 : ax + offs[offs.length - 1] + 1;
    const y0 = dx ? ay + offs[0] : Math.min(ay, by), y1 = dx ? ay + offs[offs.length - 1] + 1 : Math.max(ay, by) + 1;
    bridgeSpans.push({ id: br.id, x0, x1, y0, y1, dx, dy, a: hA, b: hB, count, arch });
    // the clearance: the deck at mid span (the ramp between the ends plus the arch) less the
    // surface of the water under the span, where the boats pass; minOverWater is the least deck
    // height over any wet row, for information (the deck is lower toward the banks)
    const zone = clearZones.find(z => z.id === br.id) || null;
    let minOverWater = Infinity;
    if (zone) for (let r = 1; r < count; r++) if (rowWet(r)) minOverWater = Math.min(minOverWater, lerp(hA, hB, r / count) + hump(r / count) - zone.surface);
    bridgeRecs.push({ id: br.id, kind: br.kind || 'low', a: hA, b: hB, grade: Math.abs(hB - hA) / (count + 1), x0, x1, y0, y1, arch, boat: !!zone, surface: zone ? zone.surface : null, water: zone ? zone.water : null, clearance: zone ? lerp(hA, hB, 0.5) + arch - zone.surface : null, minOverWater: zone ? minOverWater : null });
  }

  /* ========== 3d. lots: plateaus over the rotated footprints ========== */
  const plateauById = new Map(), plateauByPos = new Map();
  {
    const L = T.lot;
    const rasterLots = new Map((raster.lots || []).map(rl => [rl.id, rl]));
    for (const g of groups) {
      const vset = new Set(); for (const l of g.lots) for (const k of l.verts) vset.add(k);
      const mean = meanOf(vset);
      // the frontage: the road and sidewalk vertices of the street the door's stub reaches, within
      // reach of the footprint, plus the corners of the stub's road tile (a door set back up to six
      // tiles from the street still meets it); another road touching the lot (a hairpin behind it)
      // is not the frontage and gets the retaining wall. A lot without a stub reads every road near it.
      let fmin = Infinity, fmax = -Infinity;
      const take = k => { if (h[k] < fmin) fmin = h[k]; if (h[k] > fmax) fmax = h[k]; };
      for (const l of g.lots) {
        const rl = rasterLots.get(l.id);
        const sr = rl && rl.stubRoad && rl.stubRoad.x >= 0 && rl.stubRoad.y >= 0 && rl.stubRoad.x < cols && rl.stubRoad.y < rows ? rl.stubRoad : null;
        const srKeys = sr ? [idx(sr.x, sr.y), idx(sr.x + 1, sr.y), idx(sr.x, sr.y + 1), idx(sr.x + 1, sr.y + 1)] : [];
        let front = -1;
        for (const k of srKeys) if (roadOwner[k] >= 0) { front = roadOwner[k]; break; }
        const r = l.rect, R = Math.ceil(L.frontageR) + 1;
        for (let j = Math.max(0, r.y0 - R); j <= Math.min(rows, r.y1 + R); j++) for (let i = Math.max(0, r.x0 - R); i <= Math.min(cols, r.x1 + R); i++) {
          const k = idx(i, j);
          if ((pinned[k] === 3 || pinned[k] === 6) && (front < 0 || roadOwner[k] === front) && distToLot(l.lot, i, j) <= L.frontageR) take(k);
        }
        for (const k of srKeys) if (pinned[k] === 3 || pinned[k] === 6) take(k);
      }
      let plateau;
      if (g.zero) plateau = 0;
      else if (fmin <= fmax) {
        const fmid = (fmin + fmax) / 2;
        plateau = fmid + clampv(mean - fmid, -L.frontageClamp, L.frontageClamp);
        // never more than the frontage step above or below any road or sidewalk vertex it meets
        if (fmax - fmin <= 2 * L.frontageStep) plateau = clampv(plateau, fmax - L.frontageStep, fmin + L.frontageStep);
      }
      else plateau = mean;
      plateau = clampv(plateau, T.clamp.min, T.clamp.max);
      g.plateau = plateau;
      // the footprint's vertices take the plateau; a vertex shared with a road tile or a deck keeps
      // the road (level across, graded along), which the frontage clamp keeps within the step;
      // v11: a waterway's bank vertices (the creek mouth through the pond lot) keep their slope
      for (const k of vset) { if (wet[k] || pinned[k] === 3 || pinned[k] === 4 || (waterIsWay[k] && steep[k])) continue; h[k] = plateau; pinned[k] = pinned[k] === 2 ? 2 : 1; }
      // the ring: a soft slope where the step is within the wall step, a retaining wall where it is not
      for (const l of g.lots) {
        const r = l.rect, R = Math.ceil(L.ring) + 1;
        for (let j = Math.max(0, r.y0 - R); j <= Math.min(rows, r.y1 + R); j++) for (let i = Math.max(0, r.x0 - R); i <= Math.min(cols, r.x1 + R); i++) {
          const k = idx(i, j); if (pinned[k] || wet[k] || (waterIsWay[k] && steep[k])) continue;
          const d = distToLot(l.lot, i, j); if (d <= 0 || d >= L.ring) continue;
          const step = plateau - h[k];
          if (Math.abs(step) <= L.wallStep) h[k] = lerp(plateau, h[k], smooth(d / L.ring));
        }
      }
      for (const l of g.lots) { plateauById.set(l.id, plateau); plateauByPos.set(l.x + ',' + l.y, plateau); }
    }
  }

  /* ========== 3e. scooter racks: a level pad on the rack tile ========== */
  /* The rack tile's free corners take the mean of its four corners and are pinned (10); corners a
     road, sidewalk, deck or plateau already holds keep that height (a rack on a sidewalk follows
     the street). The twelve vertices around the pad move halfway toward it where the step is under
     the wall step, so the pad reads as a small terrace, not a shelf. */
  {
    const B = T.rack.blend, S = T.lot.wallStep;
    for (const rk of plan.scooterRacks || []) {
      const x = rk.x, y = rk.y;
      if (!(Number.isInteger(x) && Number.isInteger(y)) || x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const corners = [idx(x, y), idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)];
      if (corners.some(k => wet[k])) continue;
      const pad = meanOf(corners);
      for (const k of corners) if (!pinned[k]) { h[k] = pad; pinned[k] = 10; }
      for (let j = Math.max(0, y - 1); j <= Math.min(rows, y + 2); j++) for (let i = Math.max(0, x - 1); i <= Math.min(cols, x + 2); i++) {
        const k = idx(i, j);
        if (pinned[k] || wet[k] || (i >= x && i <= x + 1 && j >= y && j <= y + 1)) continue;
        if (Math.abs(pad - h[k]) < S) h[k] = lerp(h[k], pad, B);
      }
    }
  }

  /* ========== 3f. docks (v11): a level pad on a bank dock tile ========== */
  /* A dock on a deck plank or the pier tile keeps the deck's height. A bank dock (the pond
     landing, the river landing) is a flat pad at its slip's water surface + dockLift (pinned 11),
     its ring blended like a rack pad's, so the plank platform sits just over the water. */
  const surfaceAtTile = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
    for (const w of waters) if (w.tiles[y * cols + x]) return w.surface;
    if (pondLot && pondLot.tiles.some(t => t.x === x && t.y === y)) return 0.04;
    return null;
  };
  const dockRecs = [];
  {
    const B = T.rack.blend, S = T.lot.wallStep;
    const pierTile = raster.pier && raster.pier.tile ? raster.pier.tile : null;
    for (const d of raster.docks || []) {
      const t = d.tile, s = d.slip;
      if (!t || !s || t.x < 0 || t.y < 0 || t.x >= cols || t.y >= rows) continue;
      const mark = raster.at(t.x, t.y);
      const onDeck = mark === MARK.DECK || (pierTile && pierTile.x === t.x && pierTile.y === t.y);
      const surface = surfaceAtTile(s.x, s.y);
      const corners = [idx(t.x, t.y), idx(t.x + 1, t.y), idx(t.x, t.y + 1), idx(t.x + 1, t.y + 1)];
      const rec = { id: d.id, tile: { x: t.x, y: t.y }, slip: { x: s.x, y: s.y }, surface, bank: !onDeck && surface !== null, height: null, corners };
      if (rec.bank) {
        const pad = surface + T.waterway.dockLift;
        for (const k of corners) if (!wet[k]) { h[k] = pad; pinned[k] = 11; }
        for (let j = Math.max(0, t.y - 1); j <= Math.min(rows, t.y + 2); j++) for (let i = Math.max(0, t.x - 1); i <= Math.min(cols, t.x + 2); i++) {
          const k = idx(i, j);
          if (pinned[k] || wet[k] || (i >= t.x && i <= t.x + 1 && j >= t.y && j <= t.y + 1)) continue;
          if (Math.abs(pad - h[k]) < S) h[k] = lerp(h[k], pad, B);
        }
        rec.height = pad;
      }
      dockRecs.push(rec);
    }
  }

  /* ========== 4. course shaping ========== */
  let debugMounds = [], courseHoles = [];
  if (golf && golf.holes && golf.holes.length) {
    const C = T.course;
    const area = golf.area ? golf.area.pts : null;
    const pinMask = new Uint8Array(N); for (let k = 0; k < N; k++) pinMask[k] = (pinned[k] && pinned[k] !== 8) ? 1 : 0;
    const dPin = distField(pinMask, C.fade);
    const fadeAt = k => smooth(dPin[k] / C.fade);
    const movable = k => !pinned[k] && !wet[k];
    const holes = golf.holes.map(hh => ({
      n: hh.n, line: hh.line, tee: { x: hh.tee.x + 1, y: hh.tee.y + 1 }, teeBox: { x0: hh.tee.x, y0: hh.tee.y, x1: hh.tee.x + 2, y1: hh.tee.y + 2 }, elev: Number.isFinite(hh.tee.elev) ? hh.tee.elev : 0,
      cup: { x: hh.cup.x + 0.5, y: hh.cup.y + 0.5 }, greenR: hh.greenR || C.greenR, collarR: hh.collarR || 0,
      bunkers: (hh.bunkers || []).map(b => ({ x: b.x + 0.5, y: b.y + 0.5, r: b.r })),
      water: (hh.water || []).map(w => w.pts),
      island: !!(hh.island && hh.island.pts), length: 0, profile: null, plateau: 0, teeHeight: 0,
    }));
    for (const ho of holes) { let s = 0; for (let i = 0; i + 1 < ho.line.length; i++) s += Math.hypot(ho.line[i + 1][0] - ho.line[i][0], ho.line[i + 1][1] - ho.line[i][1]); ho.length = s; }
    const range = golf.range ? (() => { const rg = golf.range, swap = rg.rot === 90 || rg.rot === 270; const w = swap ? rg.h : rg.w, hh = swap ? rg.w : rg.h; return { x0: rg.x, y0: rg.y, x1: rg.x + w, y1: rg.y + hh }; })() : null;
    const hazardPolys = holes.flatMap(ho => ho.water);
    const pointAt = (line, s) => {
      let acc = 0;
      for (let i = 0; i + 1 < line.length; i++) {
        const ax = line[i][0], ay = line[i][1], bx = line[i + 1][0], by = line[i + 1][1], L = Math.hypot(bx - ax, by - ay);
        if (s <= acc + L || i + 2 === line.length) { const t = L ? clampv((s - acc) / L, 0, 1) : 0; return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ux: L ? (bx - ax) / L : 1, uy: L ? (by - ay) / L : 0 }; }
        acc += L;
      }
      return { x: line[0][0], y: line[0][1], ux: 1, uy: 0 };
    };

    /* 4a. fairway profiles: a road like profile along the line, level across the inner corridor
       (the island hole keeps the lake between its tee and green) */
    for (const ho of holes) {
      if (ho.island) continue;
      const prof = makeProfile(ho.line, 1), samples = prof.samples;
      for (const s of samples) {
        let sum = 0, n = 0;
        eachNear(s.x, s.y, C.fairwayBand + 1e-9, (k) => { if (!wet[k]) { sum += h[k]; n++; } });
        s.v = n ? sum / n : 0; s.cap = C.fairwayCap;
      }
      movingWindow(samples, T.road.window);
      for (let p = 0; p < C.fairwayPasses * 2; p++) clampPass(samples, p % 2 === 0, () => false);
      ho.profile = prof;
      const b = polyBounds(ho.line), pad = Math.ceil(C.fairwayBand);
      for (let j = Math.max(0, b.y0 - pad); j <= Math.min(rows, b.y1 + pad); j++) for (let i = Math.max(0, b.x0 - pad); i <= Math.min(cols, b.x1 + pad); i++) {
        const k = idx(i, j); if (!movable(k)) continue;
        const dl = distToLine(i, j, ho.line); if (dl > C.fairwayBand) continue;
        const w = dl <= 1.5 ? 1 : 1 - smooth((dl - 1.5) / (C.fairwayBand - 1.5));
        const target = profileAt(prof, i, j);
        h[k] += (target - h[k]) * w * fadeAt(k);
      }
    }

    /* 4b. mounds along each line, alternating sides, placed where the course has room */
    const mounds = [];
    const moundOk = (c, ho) => {
      if (area && (!pointInPoly(c.x, c.y, area) || distToPolyEdge(c.x, c.y, area) < 1.0)) return false;
      if (distToLine(c.x, c.y, ho.line) < C.moundMinLine) return false;
      for (const o of holes) {
        if (o !== ho && distToLine(c.x, c.y, o.line) < 3.5) return false;
        if (Math.hypot(c.x - o.cup.x, c.y - o.cup.y) < o.greenR + o.collarR + 2.9) return false;
        if (Math.hypot(c.x - o.tee.x, c.y - o.tee.y) < 4.0) return false;
        for (const b of o.bunkers) if (Math.hypot(c.x - b.x, c.y - b.y) < b.r + 2.0) return false;
      }
      for (const poly of hazardPolys) if (pointInPoly(c.x, c.y, poly) || distToPolyEdge(c.x, c.y, poly) < 3.0) return false;
      for (let y = Math.max(0, Math.floor(c.y - 4)); y <= Math.min(rows - 1, Math.ceil(c.y + 4)); y++) for (let x = Math.max(0, Math.floor(c.x - 4)); x <= Math.min(cols - 1, Math.ceil(c.x + 4)); x++) {
        if ((waterTiles[y * cols + x] || (islandTiles && islandTiles[y * cols + x])) && Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < 3.5) return false;
      }
      for (const l of lots) if (distToLot(l.lot, c.x, c.y) < 3.0) return false;
      if (range && distToRect(c.x, c.y, range) < 3.0) return false;
      for (const m of mounds) if (Math.hypot(c.x - m.x, c.y - m.y) < 5.0) return false;
      const k = idx(clampv(Math.round(c.x), 0, cols), clampv(Math.round(c.y), 0, rows));
      if (pinned[k] || wet[k]) return false;
      return true;
    };
    for (const ho of holes) {
      if (ho.island) continue;
      const limit = ho.length - (ho.greenR + 3.5);
      for (let s = C.moundStep, k = 0; s <= limit; s += C.moundStep, k++) {
        const amp = Math.round((C.moundAmp[0] + (C.moundAmp[1] - C.moundAmp[0]) * (((7 * ho.n + 13 * k) * 0.6180339887) % 1)) * 100) / 100;
        const firstSide = k % 2 === 0 ? 1 : -1;
        let placed = null;
        for (const side of [firstSide, -firstSide]) {
          for (const ds of [0, 1.5, -1.5, 3, -3]) {
            const s2 = clampv(s + ds, 0, ho.length);
            const p = pointAt(ho.line, s2);
            const px = side > 0 ? -p.uy : p.uy, py = side > 0 ? p.ux : -p.ux;
            let off = C.moundOffset, c = { x: p.x + px * off, y: p.y + py * off };
            for (let step = 0; step < 12 && distToLine(c.x, c.y, ho.line) < C.moundMinLine; step++) { off += 0.25; c = { x: p.x + px * off, y: p.y + py * off }; }
            if (moundOk(c, ho)) { placed = { x: c.x, y: c.y, amp, hole: ho.n, k, s: s2, side: side > 0 ? 'right' : 'left' }; break; }
          }
          if (placed) break;
        }
        if (placed) mounds.push(placed);
      }
    }
    for (const m of mounds) eachNear(m.x, m.y, C.moundR, (k, i, j, d) => { if (movable(k)) h[k] += m.amp * 0.5 * (1 + Math.cos(Math.PI * d / C.moundR)) * fadeAt(k); });
    debugMounds = mounds;

    /* 4c. hazard surround lift, then the water hazards cut with banks (none in plan v3, kept for older plans) */
    if (hazardPolys.length) {
      const hzTiles = tileMask(hazardPolys), hzBed = bedMask(hzTiles);
      const hzD = distField(hzBed, 8);
      for (let k = 0; k < N; k++) {
        if (hzBed[k]) { if (pinned[k]) continue; h[k] = -0.6; wet[k] = 2; continue; }
        if (!movable(k)) continue;
        const d = hzD[k]; if (d >= 4) continue;
        const target = h[k] >= 0.3 ? lerp(0.3, h[k], smooth((d - 1) / 3)) : lerp(0.3, h[k], smooth((d - 1.5) / 2.5));
        h[k] += (target - h[k]) * fadeAt(k);
        if (d <= 1.5) pinned[k] = 5;
      }
    }

    /* 4d. greens: a plateau at the mean (the island green at the island height), a gentle contour
       that is flat around the cup, a collar and an apron. The contour's peak to peak inside the
       collar is capped so every green reads flat to 0.15. */
    const greenCorner = new Uint8Array(N);
    for (const ho of holes) {
      const c = ho.cup, gr = ho.greenR, cr = gr + C.collar, outer = cr + C.apron;
      const corners = [];
      for (let y = Math.floor(c.y - gr - 1); y <= Math.ceil(c.y + gr + 1); y++) for (let x = Math.floor(c.x - gr - 1); x <= Math.ceil(c.x + gr + 1); x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows || Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > gr) continue;
        for (const k of [idx(x, y), idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)]) if (!greenCorner[k]) { greenCorner[k] = 1; corners.push(k); }
      }
      // the shore floor rises to meet a green on a bank, and the island's own vertices carry its green
      const greenMovable = k => (!pinned[k] || pinned[k] === 5 || (ho.island && pinned[k] === 8)) && !wet[k];
      let sum = 0, n = 0, psum = 0, pn = 0;
      eachNear(c.x, c.y, gr + 1e-9, (k) => { sum += h[k]; n++; });
      for (const k of corners) if (pinned[k] >= 1 && pinned[k] <= 4) { psum += h[k]; pn++; }
      const p = ho.island ? islandHeight : (pn ? psum / pn : (n ? sum / n : h[idx(Math.round(c.x), Math.round(c.y))]));
      ho.plateau = p;
      const contourAt = (i, j, d) => C.contourAmp * vnoise(i, j, C.contourWl, seed + 2) * smooth((d - 1.0) / 1.5) * (1 - smooth((d - gr) / C.collar));
      let lo = Infinity, hi = -Infinity;
      eachNear(c.x, c.y, cr + 1e-9, (k, i, j, d) => { const v = contourAt(i, j, d); if (v < lo) lo = v; if (v > hi) hi = v; });
      const scale = hi - lo > C.contourCap ? C.contourCap / (hi - lo) : 1;
      const flush = pn > 0 || ho.island;
      eachNear(c.x, c.y, outer, (k, i, j, d) => {
        if (!greenMovable(k)) return;
        let target, w;
        if (d <= cr) { target = p + contourAt(i, j, d) * scale; w = 1; }
        else { target = p; w = 1 - smooth((d - cr) / C.apron); }
        h[k] += (target - h[k]) * w * (flush ? 1 : fadeAt(k));
      });
      eachNear(c.x, c.y, cr + 1e-9, (k) => { if (greenMovable(k)) pinned[k] = 7; });
      for (const k of corners) if (greenMovable(k)) pinned[k] = 7;
    }

    /* 4e. tee boxes: a flat box at the landing area's height plus the design's elevation, blended
       over teeBlend tiles (the island hole's landing is its green) */
    for (const ho of holes) {
      let landing;
      if (ho.island || !ho.profile) landing = ho.plateau;
      else { const s = Math.min(C.teeLanding, Math.max(0, ho.length - ho.greenR - 1)); const q = pointAt(ho.line, s); landing = profileAt(ho.profile, q.x, q.y); }
      const p = landing + ho.elev, r = ho.teeBox, R = Math.ceil(C.teeBlend);
      ho.teeHeight = p;
      for (let j = Math.max(0, r.y0 - R); j <= Math.min(rows, r.y1 + R); j++) for (let i = Math.max(0, r.x0 - R); i <= Math.min(cols, r.x1 + R); i++) {
        const k = idx(i, j); if (!movable(k)) continue;
        const d = distToRect(i, j, r); if (d >= C.teeBlend) continue;
        h[k] += (p - h[k]) * (1 - smooth(d / C.teeBlend));
      }
      for (let j = Math.max(0, r.y0); j <= Math.min(rows, r.y1); j++) for (let i = Math.max(0, r.x0); i <= Math.min(cols, r.x1); i++) { const k = idx(i, j); if (movable(k)) { h[k] = p; pinned[k] = 9; } }
    }

    /* 4f. bunkers: a levelled bowl 0.45 deep with a 0.12 lip on the far side from the tee. A
       greenside bowl never cuts a corner vertex of a green tile, but it fades against roads, lots
       and decks only (not the green's collar or a shore floor), and a bowl on a bank never goes
       under the shore floor. */
    const pinMaskB = new Uint8Array(N); for (let k = 0; k < N; k++) pinMaskB[k] = (pinned[k] && pinned[k] !== 7 && pinned[k] !== 5 && pinned[k] !== 8) ? 1 : 0;
    const dPinB = distField(pinMaskB, C.fade);
    const fadeB = k => smooth(dPinB[k] / C.fade);
    for (const ho of holes) for (const b of ho.bunkers) {
      let ux = b.x - ho.tee.x, uy = b.y - ho.tee.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      // the bowl is cut below the mean of its rim, so a bunker on a slope still reads as a hollow
      const r = b.r;
      let hc = 0; for (let a = 0; a < 8; a++) hc += fieldAt(b.x + Math.cos(a * Math.PI / 4) * (r + 0.5), b.y + Math.sin(a * Math.PI / 4) * (r + 0.5)); hc /= 8;
      eachNear(b.x, b.y, r + 1.0, (k, i, j, d) => {
        if (!(movable(k) || pinned[k] === 5) || greenCorner[k]) return;
        if (d <= r) {
          const level = lerp(h[k], hc, 1 - smooth(d / r));
          const bowl = C.bunkerDepth * (1 - smooth((d - 0.3 * r) / (0.7 * r)));
          let target = level - bowl;
          if (waterD[k] <= T.water.maxBank && target < waterShore[k] + 0.05) target = Math.max(Math.min(h[k], waterShore[k] + 0.05), waterShore[k] + 0.05);
          h[k] += (target - h[k]) * fadeB(k);
        } else if (pinned[k] !== 5) {
          const dot = d > 0 ? ((i - b.x) / d) * ux + ((j - b.y) / d) * uy : 0;
          h[k] += C.bunkerLip * Math.max(0, dot) * Math.sin(Math.PI * (d - r)) * fadeB(k);
        }
      });
    }

    /* 4g. the range: a plateau at its mean so the tee line and the net stand level */
    if (range) {
      let s = 0, n = 0;
      for (let j = Math.max(0, range.y0); j <= Math.min(rows, range.y1); j++) for (let i = Math.max(0, range.x0); i <= Math.min(cols, range.x1); i++) { s += h[idx(i, j)]; n++; }
      const p = n ? s / n : 0, R = Math.ceil(C.rangeBlend);
      for (let j = Math.max(0, range.y0 - R); j <= Math.min(rows, range.y1 + R); j++) for (let i = Math.max(0, range.x0 - R); i <= Math.min(cols, range.x1 + R); i++) {
        const k = idx(i, j); if (!movable(k)) continue;
        const d = distToRect(i, j, range); if (d >= C.rangeBlend) continue;
        h[k] += (p - h[k]) * (1 - smooth(d / C.rangeBlend)) * fadeAt(k);
      }
    }
    for (const ho of holes) ho.profile = null;
    courseHoles = holes;
  }

  /* ========== 5. clamp and relax ========== */
  {
    const K = T.clamp;
    for (let k = 0; k < N; k++) h[k] = clampv(h[k], K.min, K.max);
    // free: unpinned and sidewalk vertices; shore floor vertices only when the move raises them.
    // Fixed: plateaus (1, 2), roads (3), decks (4), greens (7), the island (8), tees (9), rack
    // pads (10), bed vertices. Pairs across a water edge, a bank or the bluff wall are designed
    // steps and stay.
    const freeTo = (k, up) => { const p = pinned[k]; return p === 0 || p === 6 || (p === 5 && up); };
    const relaxPair = (a, b) => {
      if (wet[a] || wet[b] || steep[a] || steep[b]) return 0;
      const diff = h[a] - h[b], ex = Math.abs(diff) - K.step;
      if (ex <= 0) return 0;
      const lo = diff > 0 ? b : a, hi = diff > 0 ? a : b;
      const fl = freeTo(lo, true), fh = freeTo(hi, false);
      if (fl && fh) { h[lo] += ex / 2; h[hi] -= ex / 2; }
      else if (fl) h[lo] += ex;
      else if (fh) h[hi] -= ex;
      else return 0;
      return 1;
    };
    for (let pass = 0; pass < K.relaxPasses; pass++) {
      let moved = 0;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const k = idx(i, j);
        if (i < cols) moved += relaxPair(k, k + 1);
        if (j < rows) moved += relaxPair(k, k + W);
      }
      if (!moved) break;
    }
  }

  /* ========== 6. kickers (v11): two tile ramps, shaped last ========== */
  /* The foot tile's back edge (away from the lip) stays at the local ground, the mean of that
     edge's two vertices; the edge the foot shares with the lip rises kicker.near (0.4) and the
     lip's far edge kicker.far (0.8) above it, a straight plank over the two tiles. The six
     vertices are pinned (12) and steep; the pass runs after the relax so nothing rounds the lip.
     A wet far vertex (a ramp launching straight over water) is left to the water, and a vertex a
     lot plateau, the plaza or the pond, a road or a bridge deck pinned (1 to 4) keeps its height:
     the ramp never cuts into a lot's lawn or a road (the plan keeps kickers off those tiles, so
     only a shared edge vertex can be pinned, and the back edge is at the ground anyway). */
  const kickerRecs = [];
  for (const kk of raster.kickers || []) {
    const f = kk.foot, l = kk.lip, dx = kk.dir.x, dy = kk.dir.y;
    if (!f || !l || (!dx && !dy) || !inV(f.x, f.y) || !inV(l.x + 1, l.y + 1)) continue;
    const edgeVerts = (t, ex, ey) => ex ? [idx(t.x + (ex > 0 ? 1 : 0), t.y), idx(t.x + (ex > 0 ? 1 : 0), t.y + 1)] : [idx(t.x, t.y + (ey > 0 ? 1 : 0)), idx(t.x + 1, t.y + (ey > 0 ? 1 : 0))];
    const back = edgeVerts(f, -dx, -dy), mid = edgeVerts(f, dx, dy), far = edgeVerts(l, dx, dy);
    const ground = meanOf(back);
    const place = (keys, v) => { for (const k of keys) { if (wet[k] || (pinned[k] >= 1 && pinned[k] <= 4)) continue; h[k] = v; pinned[k] = 12; steep[k] = 1; } };
    place(back, ground); place(mid, ground + T.kicker.near); place(far, ground + T.kicker.far);
    kickerRecs.push({ id: kk.id, foot: { x: f.x, y: f.y }, lip: { x: l.x, y: l.y }, dir: { x: dx, y: dy }, ground, back, mid, far });
  }

  /* v11: every dock's slip must float: the slip tile's center ground (the mean of its four
     corners, the bilinear value at the center) against its water surface, read after every pass
     so the verification can assert it. */
  for (const d of dockRecs) {
    const s = d.slip;
    const cs = [idx(s.x, s.y), idx(s.x + 1, s.y), idx(s.x, s.y + 1), idx(s.x + 1, s.y + 1)];
    d.slipCorners = cs;
    d.slipCenter = meanOf(cs);
    d.slipUnder = d.surface !== null && d.slipCenter < d.surface;
  }

  /* ========== the terrain record ========== */
  const heights = new Float32Array(N);
  for (let k = 0; k < N; k++) heights[k] = h[k];
  const HM = heights;

  /* v10 final: the bridge deck over a point (the ramp between the two end heights across the
     span's tiles), or -1 off every span. The heightfield under a deck stays at the water, so
     heightAt and slopeAt read the deck over the span: that is where walkers, the cart and the
     road ribbon stand. */
  const SPANS = bridgeSpans;
  function spanAt(x, z) {
    for (let i = 0; i < SPANS.length; i++) {
      const s = SPANS[i];
      if (x >= s.x0 && x <= s.x1 && z >= s.y0 && z <= s.y1) return i;
    }
    return -1;
  }
  /* v11: the deck's parameter along the span (0 at a's edge, 1 at b's) and its arch, a cosine
     hump of `arch` at mid span, zero at both ends. */
  function deckT(s, x, z) {
    const t = s.dx ? (s.dx > 0 ? x - s.x0 : s.x1 - x) : (s.dy > 0 ? z - s.y0 : s.y1 - z);
    return t / s.count;
  }
  function deckOf(s, x, z) {
    const t = deckT(s, x, z);
    return s.a + (s.b - s.a) * t + (s.arch ? s.arch * 0.5 * (1 - Math.cos(2 * Math.PI * t)) : 0);
  }
  function heightAt(x, z) {
    if (SPANS.length) { const si = spanAt(x, z); if (si >= 0) return deckOf(SPANS[si], x, z); }
    let fx = x > 0 ? (x < cols ? x : cols) : 0;
    let fz = z > 0 ? (z < rows ? z : rows) : 0;
    let i = fx | 0, j = fz | 0;
    if (i >= cols) i = cols - 1;
    if (j >= rows) j = rows - 1;
    const tx = fx - i, tz = fz - j, k = j * W + i;
    const h00 = HM[k], h10 = HM[k + 1], h01 = HM[k + W], h11 = HM[k + W + 1];
    return (h00 + (h10 - h00) * tx) * (1 - tz) + (h01 + (h11 - h01) * tx) * tz;
  }
  const scratchSlope = { x: 0, z: 0 };
  function slopeAt(x, z, out) {
    out = out || scratchSlope;
    if (SPANS.length) {
      const si = spanAt(x, z);
      if (si >= 0) {
        const s = SPANS[si];
        const g = (s.b - s.a) / s.count + (s.arch ? s.arch * Math.PI * Math.sin(2 * Math.PI * deckT(s, x, z)) / s.count : 0);
        out.x = s.dx * g; out.z = s.dy * g; return out;
      }
    }
    let fx = x > 0 ? (x < cols ? x : cols) : 0;
    let fz = z > 0 ? (z < rows ? z : rows) : 0;
    let i = fx | 0, j = fz | 0;
    if (i >= cols) i = cols - 1;
    if (j >= rows) j = rows - 1;
    const tx = fx - i, tz = fz - j, k = j * W + i;
    const h00 = HM[k], h10 = HM[k + 1], h01 = HM[k + W], h11 = HM[k + W + 1];
    out.x = (1 - tz) * (h10 - h00) + tz * (h11 - h01);
    out.z = (1 - tx) * (h01 - h00) + tx * (h11 - h10);
    return out;
  }
  const scratchNormal = { x: 0, y: 1, z: 0 };
  function normalAt(x, z, out) {
    out = out || scratchNormal;
    slopeAt(x, z, scratchSlope);
    const nx = -scratchSlope.x, nz = -scratchSlope.z;
    const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
    out.x = nx * inv; out.y = inv; out.z = nz * inv;
    return out;
  }
  /* The slope class under a point: 'flat', 'gentle', 'steep' or 'cliff' (over 35 degrees). */
  const slopeScratch = { x: 0, z: 0 };
  function slopeClassAt(x, z) {
    slopeAt(x, z, slopeScratch);
    return classifySlope(Math.sqrt(slopeScratch.x * slopeScratch.x + slopeScratch.z * slopeScratch.z));
  }
  /* The landform kind that shaped the vertex nearest a point: 'hill', 'bluff', 'valley', 'lake',
     'flats', 'links' or 'none'. */
  function landformAt(x, z) {
    const i = clampv(Math.round(x), 0, cols), j = clampv(Math.round(z), 0, rows);
    return KIND_NAME[landformKind[j * W + i]] || 'none';
  }
  /* The plateau of a lot: a plan lot, a state lot record or a building record (by id, by its lot
     record, by its bounding box origin, or by the lot containing its center). */
  function lotHeight(lot) {
    if (!lot) return 0;
    if (typeof lot === 'string') return plateauById.has(lot) ? plateauById.get(lot) : 0;
    if (lot.id !== undefined && plateauById.has(lot.id)) return plateauById.get(lot.id);
    if (lot.lot && lot.lot.id !== undefined && plateauById.has(lot.lot.id)) return plateauById.get(lot.lot.id);
    let cx, cy;
    if (lot.center && Number.isFinite(lot.center.x)) { cx = lot.center.x; cy = lot.center.y; }
    else if (Number.isFinite(lot.cx) && Number.isFinite(lot.cy)) { cx = lot.cx; cy = lot.cy; }
    else if (typeof lot.x === 'number' && typeof lot.y === 'number') {
      const key = lot.x + ',' + lot.y;
      if (plateauByPos.has(key)) return plateauByPos.get(key);
      cx = lot.x + (lot.w || 0) / 2; cy = lot.y + (lot.h || 0) / 2;
    }
    else return 0;
    for (const l of lots) { const p = lotToLocal(l.lot, cx, cy); if (p.x >= 0 && p.x <= l.lot.w && p.y >= 0 && p.y <= l.lot.h) return plateauById.get(l.id); }
    return heightAt(cx, cy);
  }

  /* Retaining walls: along every lot edge, sampled every wallSample tiles, the ground just
     outside (wallProbe out along the edge normal) against the plateau; runs where the step
     exceeds wallStep become segments { lot, kind, edge, a, b, normal, top, drop, maxDrop, side,
     length }. drop is positive where the lot stands above the surround ('above'), negative where
     the surround is higher ('below'). */
  const retainingWalls = [];
  {
    const L = T.lot;
    for (const l of lots) {
      if (l.kind === 'pond') continue;
      const top = plateauById.get(l.id);
      const cs = lotRectCorners(l.lot, 0, 0, l.lot.w, l.lot.h);
      for (let e = 0; e < 4; e++) {
        const a = cs[e], b = cs[(e + 1) % 4];
        const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
        if (len < 1e-6) continue;
        const nx = ey / len, ny = -ex / len;
        const n = Math.max(1, Math.round(len / L.wallSample));
        let run = null;
        const close = () => { if (run) { run.drop = run.sum / run.n; run.length = Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]); delete run.sum; delete run.n; if (run.length > 0.25) retainingWalls.push(run); run = null; } };
        for (let s = 0; s <= n; s++) {
          const t = s / n, px = a[0] + ex * t, py = a[1] + ey * t;
          const qx = px + nx * L.wallProbe, qy = py + ny * L.wallProbe;
          const outside = (qx < 0 || qy < 0 || qx > cols || qy > rows) ? top : heightAt(qx, qy);
          const step = top - outside;
          if (Math.abs(step) > L.wallStep && (!run || Math.sign(step) === run.sign)) {
            if (!run) run = { lot: l.id, kind: l.kind, edge: e, a: [px, py], b: [px, py], normal: [nx, ny], top, drop: 0, maxDrop: 0, side: step > 0 ? 'above' : 'below', sign: Math.sign(step), sum: 0, n: 0, length: 0 };
            run.b = [px, py]; run.sum += step; run.n++; if (Math.abs(step) > Math.abs(run.maxDrop)) run.maxDrop = step;
          } else { close(); if (Math.abs(step) > L.wallStep) { run = { lot: l.id, kind: l.kind, edge: e, a: [px, py], b: [px, py], normal: [nx, ny], top, drop: 0, maxDrop: step, side: step > 0 ? 'above' : 'below', sign: Math.sign(step), sum: step, n: 1, length: 0 }; } }
        }
        close();
      }
    }
    for (const wll of retainingWalls) delete wll.sign;
  }

  // ctx.debug (an object) receives the working classes for tests and tools; the record itself stays as the contract lists it
  if (ctx.debug && typeof ctx.debug === 'object') Object.assign(ctx.debug, { seed, pinned, wet, steep, groups, roads, bridges: bridgeRecs, mounds: debugMounds, plateauById, landformKind, holes: courseHoles, docks: dockRecs, kickers: kickerRecs, clearZones, waters });

  /* The water bodies as the terrain shaped them: the bed height, the shore floor (bed + 0.9, the
     lowest dry land) and the surface the renderer's water plane should sit at (bed + 0.7, so the
     shore floor stands 0.2 above the water and the island 1.5). v11: then one record per waterway
     body (the creek, the channel): the lowest bed of its reaches, the shore floor at the surface
     + 0.2, the surface at the plan's level, and the reach ids. */
  const water = waters.filter(w => !w.waterway).map(w => ({ id: w.id, kind: w.kind, bed: w.height, shore: w.shore, surface: Math.round((w.height + T.water.shoreLift - 0.2) * 1e6) / 1e6 }));
  {
    const bodies = new Map();
    for (const w of waters) {
      if (!w.waterway) continue;
      let b = bodies.get(w.body);
      if (!b) { b = { id: w.body, kind: w.body, bed: Infinity, shore: w.shore, surface: w.surface, waterways: [] }; bodies.set(w.body, b); }
      b.bed = Math.min(b.bed, w.height, w.bedEnd);
      b.waterways.push(w.id);
    }
    for (const b of bodies.values()) water.push(b);
  }

  return { cols, rows, heights, heightAt, slopeAt, normalAt, lotHeight, slopeClassAt, retainingWalls, landformAt, water };
}

export default buildTerrain;
