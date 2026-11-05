/* Thread Town roads as meshes (docs/CONTRACT_V10.md "Roads as meshes", geography in
   docs/WORLD_DESIGN.md).

   buildRoads(ctx) -> { group, update(dt, time, night) }
   ctx = {
     plan,                    the city plan (js/cityplan.js PLAN when missing)
     terrain: { heightAt },   the terrain record (js/terrain.js); only heightAt is read
     state, sim,              optional, read only (the sim's tiles stay the logic layer)
     raster,                  optional: a rasterizePlan(plan) result (built here when missing)
     THREE, mat, canvasTex,   optional helpers (js/depts/common.js); THREE is imported here anyway
     seed,                    optional, unused (the roads are a pure function of the plan)
   }

   Every road spline is resampled by arc length every 0.5 tile and swept with 2D profiles
   (lateral offset, height above the ground) into one geometry per material:
     - the ribbon: asphalt for avenue, boulevard, street, lane and switchback; packed gravel for
       path and cartpath; at the terrain height plus 0.03;
     - curbs and sidewalk ribbons where sidewalks is true (a low visual lip: the slab top sits
       SIDEWALK_LIFT = 0.07 above the terrain, exported so js/city.js stands its furniture on
       it), cut where they would cross another road's paving or water, and dropped flush with
       the road across every lot stub mouth;
     - the avenue median: a stone kerb, a grass top and a planter every two tiles, cut at
       junctions and stub crossings;
     - lane markings as a canvas textured strip (dashed center or lane lines, edge lines), cut
       at junctions and crossings;
     - crosswalks: zebra quads across each road arm at every junction (continuing the other
       road's sidewalk) and across the street at every lot stub mouth;
     - junction fillets: one filled polygon per junction (the arm edges joined by rounded
       corners) so the ribbons meet without gaps;
     - bridges: a deck ribbon that meets the road ribbons edge to edge (each end trimmed to the
       nearest ribbon end on the deck's line; with no ribbon there, the island shore, the deck
       keeps one extra tile), parapets or railings, piers over the water standing on the plan's
       water bed (stone with arches for high, concrete for low, wooden piles for foot);
     - guard rails on the switchback's hairpins and on drops.
   Roads listed in plan.stairs get no ribbon (city.js builds the stairs).

   Everything merges per material (under 25 meshes). update() only drives the night glow of
   the markings and allocates nothing. Mesh counts and the junction, crossing and bridge
   records are on group.userData.roadStats for the headless test. The result also carries
   surfaceLiftAt(x, z): how far the ribbon surface under a point stands above the terrain
   (SIDEWALK_LIFT on a sidewalk tile, LIFT on a road tile and across a stub mouth, LIFT plus
   DECK_LIFT on a bridge tile, 0 elsewhere) for whoever stands furniture or characters on the
   ribbons. */

import * as THREE from 'three';
import { PLAN as DEFAULT_PLAN, splineSamples, ROAD_KINDS, rasterizePlan, MARK } from './cityplan.js';

const TAU = Math.PI * 2;
const STEP = 0.5;            // sample spacing along every spline (tiles)
const LIFT = 0.03;           // ribbons above the terrain (the contract's 0.03)
const MARK_LIFT = 0.045;     // lane markings above the ribbon
const ZEBRA_LIFT = 0.05;     // crosswalk quads above the ribbon
const CURB_H = 0.04;         // sidewalk height above the road surface: a visual lip, so furniture and walkers at terrain height plus SIDEWALK_LIFT stand on the slab
const CURB_W = 0.2;          // the curb lip width
const SIDEWALK_W = 1.0;      // one tile, as the raster stamps it
export const SIDEWALK_LIFT = LIFT + CURB_H;   // the sidewalk slab top above the terrain (0.07)
export const ROAD_LIFT = LIFT;
const DECK_LIFT = 0.04;      // bridge decks above the ribbon height (the deck is level across its width while the ribbon follows the terrain per vertex, so the lip must beat that lateral difference): an angled ribbon end cannot z-fight the deck edge
const MEDIAN_HW = 0.32;
const PLANTER_EVERY = 2;
const JUNCTION_FILLET = 0.5; // arm edge points sit this far beyond the other road's paving
const XWALK_DEPTH = 1.0;     // a crosswalk is one tile deep along the road
const ASPHALT_KINDS = new Set(['avenue', 'boulevard', 'street', 'lane', 'switchback']);

/* The palette (ART_DIRECTION "Ground and roads" for the warm town paving, realism for the rest). */
export const ROAD_PALETTE = {
  asphalt: '#8C8B88', gravel: '#CBBE9F', curb: '#C9C3B5', sidewalk: '#D8D5CC',
  medianKerb: '#B9C4CC', median: '#6FA860', planter: '#8A8378', bush: '#4C8F4A',
  concrete: '#C9C4B8', stone: '#B9C4CC', stoneDark: '#9AA3A8', iron: '#2E3E50', steel: '#A7AEB4',
  wood: '#A5774E', woodDark: '#6B4A2B', marking: '#F4F1E8',
};

/* ---------- small math ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ramp = s => clamp((s - 0.25) / 0.75, 0, 1);
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1 };
}

/* ---------- a spline resampled by arc length ---------- */
/* samples[i] = { x, y, s, tx, ty, nx, ny, k }: plan coordinates (y is world z), the arc length,
   the unit tangent, the lateral unit normal (the tangent turned a quarter turn) and the
   curvature (turn angle per tile, signed). */
function resample(pts, step) {
  const fine = splineSamples(pts, 0.1);
  if (fine.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < fine.length; i++) cum.push(cum[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const L = cum[cum.length - 1];
  if (!(L > 0.5)) return null;
  const n = Math.max(2, Math.round(L / step));
  const S = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = L * k / n;
    while (j < fine.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j], u = seg > 1e-9 ? clamp((s - cum[j]) / seg, 0, 1) : 0;
    S.push({ x: fine[j][0] + (fine[j + 1][0] - fine[j][0]) * u, y: fine[j][1] + (fine[j + 1][1] - fine[j][1]) * u, s, tx: 1, ty: 0, nx: 0, ny: 1, k: 0 });
  }
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const l = Math.hypot(tx, ty);
    if (l > 1e-9) { tx /= l; ty /= l; } else { tx = 1; ty = 0; }
    S[i].tx = tx; S[i].ty = ty; S[i].nx = -ty; S[i].ny = tx;
  }
  for (let i = 1; i + 1 < S.length; i++) {
    const a = S[i - 1], b = S[i + 1];
    const cross = a.tx * b.ty - a.ty * b.tx, dot = a.tx * b.tx + a.ty * b.ty;
    S[i].k = Math.atan2(cross, dot) / Math.max(1e-6, b.s - a.s);
  }
  return { samples: S, length: L };
}
/* Index of the sample nearest an arc length. */
function indexAt(S, s) { return clamp(Math.round(s / STEP), 0, S.length - 1); }
/* The nearest sample of a road to a point, with the distance, or null beyond maxD. */
function nearestSample(R, x, y, maxD) {
  const b = R.bounds;
  if (x < b.x0 - maxD || x > b.x1 + maxD || y < b.y0 - maxD || y > b.y1 + maxD) return null;
  let best = -1, bd = maxD * maxD;
  const S = R.samples;
  for (let i = 0; i < S.length; i++) { const dx = S[i].x - x, dy = S[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
  return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
}

/* ---------- geometry sink: one indexed geometry per material ---------- */
class Sink {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.n = 0; this.parts = 0; }
  vertex(x, y, z, u, v) { this.pos.push(x, y, z); this.uv.push(u, v); return this.n++; }
  /* A triangle wound so its normal agrees with the wanted direction (nx, ny, nz). */
  tri(a, b, c, nx, ny, nz) {
    const P = this.pos;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a, b, c, d, nx, ny, nz) { this.tri(a, b, c, nx, ny, nz); this.tri(a, c, d, nx, ny, nz); }
  /* A fan over a polygon of vertex indices (star shaped from the first). */
  fan(ids, nx, ny, nz) { for (let i = 1; i + 1 < ids.length; i++) this.tri(ids[0], ids[i], ids[i + 1], nx, ny, nz); }
  /* Appends a THREE geometry transformed by a Matrix4. */
  addGeometry(geo, m) {
    const p = geo.attributes.position, uv = geo.attributes.uv;
    const base = this.n, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)); if (m) v.applyMatrix4(m);
      this.vertex(v.x, v.y, v.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geo.index) { const ix = geo.index; for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i)); }
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.parts++;
  }
  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(new Uint32Array(this.idx), 1) : new THREE.Uint16BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/* A profile: [{ d, h }] lateral offset and height above the ground; a point repeated twice
   makes a hard edge (no strip between the copies). Closed rectangle with hard edges. */
function rectProfile(d0, d1, h0, h1) {
  const a = { d: d0, h: h0 }, b = { d: d0, h: h1 }, c = { d: d1, h: h1 }, d = { d: d1, h: h0 };
  return [a, b, b, c, c, d, d, a];
}
const same = (p, q) => p.d === q.d && p.h === q.h;

/* Sweeps a profile along samples i0..i1 of S on one side (+1 or -1 mirrors d). ground(x, z, i)
   gives the base height of every vertex; v runs along the arc length, u across the profile.
   caps closes the run ends (an open profile is closed down to the ground first). */
function sweep(sink, S, i0, i1, profile, side, ground, opts) {
  if (i1 - i0 < 1) return;
  const P = profile.length, base = sink.n;
  const uScale = opts && opts.uScale !== undefined ? opts.uScale : 0;
  for (let i = i0; i <= i1; i++) {
    const s = S[i];
    for (let j = 0; j < P; j++) {
      const d = profile[j].d * side, x = s.x + s.nx * d, z = s.y + s.ny * d;
      sink.vertex(x, ground(x, z, i) + profile[j].h, z, uScale ? d * uScale : j / Math.max(1, P - 1), s.s);
    }
  }
  for (let i = i0; i < i1; i++) {
    const a0 = base + (i - i0) * P, a1 = a0 + P, s = S[i];
    for (let j = 0; j + 1 < P; j++) {
      const p = profile[j], q = profile[j + 1];
      if (same(p, q)) continue;
      const nd = -(q.h - p.h) * side, nh = q.d - p.d;
      sink.quad(a0 + j, a0 + j + 1, a1 + j + 1, a1 + j, s.nx * nd, nh, s.ny * nd);
    }
  }
  sink.parts++;
  if (opts && opts.caps) {
    const closed = same(profile[0], profile[P - 1]);
    for (const [i, dir] of [[i0, -1], [i1, 1]]) {
      const s = S[i], ids = [];
      const pts = closed ? profile.slice(0, P - 1) : profile.concat([{ d: profile[P - 1].d, h: LIFT - 0.02 }, { d: profile[0].d, h: LIFT - 0.02 }]);
      for (const p of pts) { const d = p.d * side, x = s.x + s.nx * d, z = s.y + s.ny * d; ids.push(sink.vertex(x, ground(x, z, i) + p.h, z, 0, 0)); }
      sink.fan(ids, s.tx * dir, 0, s.ty * dir);
    }
  }
}
/* Contiguous runs of true in mask (indices i0..i1 inclusive, at least minLen samples). */
function runsOf(mask, minLen) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= mask.length; i++) {
    const on = i < mask.length && mask[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) { if (i - start >= (minLen || 2)) out.push([start, i - 1]); start = -1; }
  }
  return out;
}

/* ---------- textures ---------- */
function makeCanvasTex(ctx, w, h, draw) {
  if (typeof ctx.canvasTex === 'function') { try { return ctx.canvasTex(w, h, draw); } catch (e) { return null; } }
  if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return null;
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (!g) return null;
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  } catch (e) { return null; }
}
function repeatTex(t) { if (t) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; } return t; }
/* A transparent material carrying a canvas texture as its color and night glow. */
function decalMat(tex, fallbackHex, opacity) {
  const m = tex
    ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, emissive: new THREE.Color('#FFFFFF'), emissiveMap: tex, emissiveIntensity: 0 })
    : new THREE.MeshStandardMaterial({ color: new THREE.Color(fallbackHex), roughness: 0.55, transparent: true, opacity: opacity === undefined ? 0.7 : opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, emissive: new THREE.Color(fallbackHex), emissiveIntensity: 0 });
  m.userData.envMapIntensity = 0.15;
  return m;
}

/* ---------- the build ---------- */
export function buildRoads(ctx) {
  ctx = ctx || {};
  const plan = ctx.plan || DEFAULT_PLAN;
  const terrain = ctx.terrain || null;
  const rawH = terrain && typeof terrain.heightAt === 'function' ? (x, z) => terrain.heightAt(x, z) : (typeof ctx.heightAt === 'function' ? ctx.heightAt : null);
  const H = rawH ? (x, z) => { const v = rawH(x, z); return Number.isFinite(v) ? v : 0; } : () => 0;
  const PAL = Object.assign({}, ROAD_PALETTE, ctx.palette || {});
  const cols = plan.cols, rows = plan.rows;
  const group = new THREE.Group();
  group.name = 'roads';

  /* materials: ctx.mat (the shared cache) when given, else a local cache of the same shape */
  const localMats = new Map();
  const mk = (hex, o) => {
    o = o || {};
    if (typeof ctx.mat === 'function') return ctx.mat(hex, o);
    const key = hex + '|' + JSON.stringify(o);
    let m = localMats.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: o.roughness === undefined ? 0.85 : o.roughness, metalness: o.metalness || 0, flatShading: !!o.flat });
    m.userData.envMapIntensity = o.envMapIntensity === undefined ? 0.25 : o.envMapIntensity;
    localMats.set(key, m);
    return m;
  };
  const markStreetTex = repeatTex(makeCanvasTex(ctx, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(244,241,232,0.78)';
    g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);      // edge lines
    g.fillRect(w / 2 - 3, 18, 6, 60);                        // the dashed center, one dash per tile
  }));
  const markAvenueTex = repeatTex(makeCanvasTex(ctx, 256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(244,241,232,0.78)';
    g.fillRect(6, 0, 4, h); g.fillRect(w - 10, 0, 4, h);     // edge lines
    g.fillRect(w / 4 - 3, 18, 6, 60); g.fillRect(3 * w / 4 - 3, 18, 6, 60);   // lane lines one tile off the median
  }));
  const zebraTex = repeatTex(makeCanvasTex(ctx, 128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.86)';
    g.fillRect(8, 2, 48, h - 4); g.fillRect(72, 2, 48, h - 4);   // two bars per tile across the road
  }));
  const plankTex = repeatTex(makeCanvasTex(ctx, 128, 128, (g, w, h) => {
    g.fillStyle = PAL.wood; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,230,200,0.08)' : 'rgba(60,35,20,0.10)'; g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(60,40,25,0.6)'; g.fillRect(0, i * 32, w, 2);
    }
    g.fillStyle = 'rgba(60,40,25,0.25)';
    for (let i = 0; i < 10; i++) g.fillRect(((i * 37) % w), 0, 1, h);
  }));
  const MATS = {
    asphalt: mk(PAL.asphalt, { roughness: 0.95 }), gravel: mk(PAL.gravel, { roughness: 0.98 }),
    curb: mk(PAL.curb, { roughness: 0.9 }), sidewalk: mk(PAL.sidewalk, { roughness: 0.92 }),
    medianKerb: mk(PAL.medianKerb, { roughness: 0.85 }), median: mk(PAL.median, { roughness: 0.95 }),
    planter: mk(PAL.planter, { roughness: 0.9 }), bush: mk(PAL.bush, { roughness: 0.95, flat: true }),
    concrete: mk(PAL.concrete, { roughness: 0.95 }), stone: mk(PAL.stone, { roughness: 0.85 }), stoneDark: mk(PAL.stoneDark, { roughness: 0.9 }),
    iron: mk(PAL.iron, { roughness: 0.55, metalness: 0.2 }), steel: mk(PAL.steel, { roughness: 0.45, metalness: 0.35 }),
    wood: mk(PAL.wood, { roughness: 0.8 }), woodDark: mk(PAL.woodDark, { roughness: 0.8 }),
    markStreet: decalMat(markStreetTex, PAL.marking, 0.0), markAvenue: decalMat(markAvenueTex, PAL.marking, 0.0),
    zebra: decalMat(zebraTex, '#FFFFFF', 0.8),
    plank: plankTex ? (() => { const m = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.85 }); m.userData.envMapIntensity = 0.2; return m; })() : mk(PAL.wood, { roughness: 0.85 }),
  };
  const sinks = {};
  for (const k of Object.keys(MATS)) sinks[k] = new Sink();
  const SHADOW = { asphalt: [false, true], gravel: [false, true], curb: [false, true], sidewalk: [false, true], medianKerb: [true, true], median: [false, true], markStreet: [false, false], markAvenue: [false, false], zebra: [false, false], plank: [false, true] };

  /* water (the river and the lake, the island excepted): the plan's height is the bed; the
     surface comes from the terrain's water record when it has one (bed + 0.7 otherwise), and
     the deck guard and the piers read surface and bed respectively */
  const terrainWater = terrain && Array.isArray(terrain.water) ? terrain.water : [];
  const waters = (plan.water || []).map(w => {
    const rec = terrainWater.find(t => t && t.id === w.id);
    const bed = Number.isFinite(w.height) ? w.height : 0.04;
    const surface = rec && Number.isFinite(rec.surface) ? rec.surface : (Number.isFinite(w.height) ? bed + 0.7 : 0.04);
    return { id: w.id, pts: w.pts, b: polyBounds(w.pts), bed, surface, height: surface };
  });
  const islands = ((plan.golf && plan.golf.holes) || []).filter(h => h.island && h.island.pts).map(h => ({ pts: h.island.pts, b: polyBounds(h.island.pts) }));
  const inPolyB = (x, y, P) => x >= P.b.x0 && x <= P.b.x1 && y >= P.b.y0 && y <= P.b.y1 && pointInPoly(x, y, P.pts);
  const waterAt = (x, y) => { for (const w of waters) if (inPolyB(x, y, w)) { for (const isl of islands) if (inPolyB(x, y, isl)) return null; return w; } return null; };
  const inWater = (x, y) => !!waterAt(x, y);

  /* ---------- 1. roads: resampled splines ---------- */
  const stairIds = new Set((plan.stairs || []).map(s => s.id));
  const roads = [];
  (plan.roads || []).forEach((r, ri) => {
    if (!r.pts || r.pts.length < 2) return;
    const rs = resample(r.pts, STEP);
    if (!rs) return;
    const width = r.width || ROAD_KINDS[r.kind] || 2;
    const kind = ROAD_KINDS[r.kind] ? r.kind : (width >= 2 ? 'street' : 'path');
    const b = polyBounds(rs.samples.map(s => [s.x, s.y]));
    roads.push({ id: r.id, name: r.name || r.id, ri, kind, width, hw: width / 2, sidewalks: !!r.sidewalks && width >= 2, samples: rs.samples, length: rs.length, bounds: b, stairs: stairIds.has(r.id), street: width >= 2 });
  });
  const streets = roads.filter(r => r.street);
  const ground = (x, z) => H(x, z) + LIFT;

  /* ---------- 2. junctions between streets ---------- */
  /* Pairwise first: the closest sample pair of two roads within their half widths plus 0.6,
     clustered along the first road so a road crossing another twice gives two junctions. Each
     road's arc length at the other's centerline is the projection of the other's sample onto its
     tangent (a road ending at another's edge projects beyond its own end). */
  const pairwise = [];
  for (let i = 0; i < streets.length; i++) for (let j = i + 1; j < streets.length; j++) {
    const A = streets[i], B = streets[j], lim = A.hw + B.hw + 0.6;
    const ba = A.bounds, bb = B.bounds;
    if (ba.x1 + lim < bb.x0 || bb.x1 + lim < ba.x0 || ba.y1 + lim < bb.y0 || bb.y1 + lim < ba.y0) continue;
    const cands = [];
    for (let ia = 0; ia < A.samples.length; ia++) {
      const a = A.samples[ia];
      if (a.x < bb.x0 - lim || a.x > bb.x1 + lim || a.y < bb.y0 - lim || a.y > bb.y1 + lim) continue;
      for (let ib = 0; ib < B.samples.length; ib++) {
        const b = B.samples[ib], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < lim) cands.push({ ia, ib, d });
      }
    }
    if (!cands.length) continue;
    cands.sort((p, q) => p.ia - q.ia || p.ib - q.ib);
    let cluster = [];
    const flush = () => {
      if (!cluster.length) return;
      let best = cluster[0];
      for (const c of cluster) if (c.d < best.d) best = c;
      const a = A.samples[best.ia], b = B.samples[best.ib];
      const sA = a.s + (b.x - a.x) * a.tx + (b.y - a.y) * a.ty, sB = b.s + (a.x - b.x) * b.tx + (a.y - b.y) * b.ty;
      pairwise.push({ A, B, sA, sB, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      cluster = [];
    };
    for (const c of cands) {
      if (cluster.length && (c.ia - cluster[cluster.length - 1].ia > 8 || Math.abs(c.ib - cluster[cluster.length - 1].ib) > 12)) flush();
      cluster.push(c);
    }
    flush();
  }
  /* Merge the pairs that share a spot (three or more roads meeting) into one junction with one
     entry per road, then the arms: a road passes through (two arms) or ends there (one arm). The
     other roads' widest paving sets where an arm's crosswalk and fillet edge sit; a crosswalk
     continues another road's sidewalk, so it needs one of them to have sidewalks. */
  const junctions = [];
  for (const P of pairwise) {
    let J = junctions.find(j => Math.hypot(j.x - P.x, j.y - P.y) < 3.0 && (j.entries.some(e => e.R === P.A) || j.entries.some(e => e.R === P.B)));
    if (!J) { J = { x: P.x, y: P.y, n: 0, entries: [], arms: [], crosswalks: [] }; junctions.push(J); }
    J.x = (J.x * J.n + P.x) / (J.n + 1); J.y = (J.y * J.n + P.y) / (J.n + 1); J.n++;
    for (const [R, s] of [[P.A, P.sA], [P.B, P.sB]]) {
      const e = J.entries.find(x => x.R === R);
      if (e) { e.s = (e.s * e.n + s) / (e.n + 1); e.n++; } else J.entries.push({ R, s, n: 1 });
    }
  }
  for (const J of junctions) {
    J.A = J.entries[0].R; J.B = J.entries[1].R;
    for (const e of J.entries) {
      const others = J.entries.filter(o => o !== e);
      const otherHw = Math.max(...others.map(o => o.R.hw)), otherSidewalks = others.some(o => o.R.sidewalks);
      const reach = otherHw + 1.0;
      if (e.s > reach) J.arms.push({ R: e.R, s: e.s, dir: -1, otherHw, otherSidewalks });
      if (e.R.length - e.s > reach) J.arms.push({ R: e.R, s: e.s, dir: 1, otherHw, otherSidewalks });
    }
  }

  /* per sample masks: where a road's sidewalks, median and markings are cut by other roads */
  const otherNear = (R, x, y, pad) => {
    for (const O of streets) { if (O === R) continue; const n = nearestSample(O, x, y, O.hw + pad); if (n) return O; }
    return null;
  };

  /* ---------- 3. crosswalks: junction arms and stub mouths ---------- */
  const crosswalks = [];   // { R, s, x, y, tx, ty, kind }
  const hasCrosswalkNear = (R, s, gap) => crosswalks.some(c => c.R === R && Math.abs(c.s - s) < gap);
  for (const J of junctions) for (const arm of J.arms) {
    if (!arm.otherSidewalks) continue;              // the zebra continues the other road's sidewalk
    let s = arm.s + arm.dir * (arm.otherHw + 0.1 + XWALK_DEPTH / 2);
    if (s < -0.6 || s > arm.R.length + 0.6) continue;
    s = clamp(s, XWALK_DEPTH / 2, arm.R.length - XWALK_DEPTH / 2);   // a road ending at the other's edge gets its zebra in its first tile
    if (hasCrosswalkNear(arm.R, s, 2.2)) continue;
    const p = arm.R.samples[indexAt(arm.R.samples, s)];
    const c = { R: arm.R, s, x: p.x, y: p.y, tx: p.tx, ty: p.ty, kind: 'junction' };
    crosswalks.push(c); J.crosswalks.push(c);
  }
  const raster = ctx.raster && ctx.raster.lots ? ctx.raster : rasterizePlan(plan);
  let stubCrossings = 0;
  // every stub mouth drops the sidewalk flush with the road on its side (stubGaps); the zebra
  // across the street is skipped where another crosswalk already lies within two tiles
  const stubGaps = [], stubMouthTiles = new Set();
  for (const rec of raster.lots || []) {
    if (!rec.stubMouth || !rec.stubRoad) continue;
    const mx = rec.stubMouth.x + 0.5, my = rec.stubMouth.y + 0.5;
    stubMouthTiles.add(rec.stubMouth.x + ',' + rec.stubMouth.y);
    let best = null;
    for (const O of streets) { const n = nearestSample(O, mx, my, O.hw + 2.2); if (n && (!best || n.d < best.n.d)) best = { O, n }; }
    if (!best) continue;
    const O = best.O, p = O.samples[best.n.i];
    // the side of the road the stub mouth lies on (+1 along the sample normal)
    const side = ((mx - p.x) * p.nx + (my - p.y) * p.ny) >= 0 ? 1 : -1;
    stubGaps.push({ R: O, s: p.s, side, lot: rec.id });
    if (hasCrosswalkNear(O, p.s, 2.0)) continue;
    if (p.s < XWALK_DEPTH / 2 || p.s > O.length - XWALK_DEPTH / 2) continue;
    crosswalks.push({ R: O, s: p.s, x: p.x, y: p.y, tx: p.tx, ty: p.ty, kind: 'stub', lot: rec.id, side });
    stubCrossings++;
  }

  /* ---------- 4. ribbons, curbs, sidewalks, medians, markings, guard rails ---------- */
  let planters = 0, guardRuns = 0, ribbons = 0;
  for (const R of roads) {
    if (R.stairs) continue;
    const S = R.samples, n = S.length, hw = R.hw;
    const surface = ASPHALT_KINDS.has(R.kind) ? sinks.asphalt : sinks.gravel;
    const ribbonProfile = hw >= 1 ? [{ d: -hw, h: 0 }, { d: 0, h: 0 }, { d: hw, h: 0 }] : [{ d: -hw, h: 0 }, { d: hw, h: 0 }];
    // v11.1: the ribbon stops at a bridge deck. A spline that crosses a waterway (Links Road, the
    // creek path, the cart paths) used to sweep straight through the span, leaving a second
    // surface over or under the deck; the samples on bridge tiles are skipped, so the deck is the
    // only surface there and the ribbon runs meet it a tile short of each end.
    const offDeck = new Array(n).fill(true);
    for (let i = 0; i < n; i++) { const tx = Math.floor(S[i].x), tz = Math.floor(S[i].y); if (tx >= 0 && tz >= 0 && tx < cols && tz < rows && raster.at(tx, tz) === MARK.BRIDGE) offDeck[i] = false; }
    for (const [i0, i1] of runsOf(offDeck, 2)) { sweep(surface, S, i0, i1, ribbonProfile, 1, ground); ribbons++; }
    if (!R.street) continue;

    // masks along the road: a sample is cut where another street's paving or a crossing lies
    const cutMark = new Array(n).fill(false);   // markings and the median
    for (let i = 0; i < n; i++) if (otherNear(R, S[i].x, S[i].y, 1.3)) cutMark[i] = true;
    for (const c of crosswalks) if (c.R === R) { const i0 = indexAt(S, c.s - 1.0), i1 = indexAt(S, c.s + 1.0); for (let i = i0; i <= i1; i++) cutMark[i] = true; }
    // v11.1: no markings over a deck either (the ribbon stops at the deck now, see offDeck)
    for (let i = 0; i < n; i++) if (!offDeck[i]) cutMark[i] = true;
    const keepMark = cutMark.map(v => !v);

    // sidewalks and curbs per side, cut across other roads' paving and over water, and dropped
    // flush with the road (a dropped kerb slab at the ribbon height) across each stub mouth
    if (R.sidewalks) {
      for (const side of [1, -1]) {
        const keep = new Array(n).fill(false), flush = new Array(n).fill(false);
        for (let i = 0; i < n; i++) {
          const s = S[i], d = side * (hw + SIDEWALK_W / 2), qx = s.x + s.nx * d, qy = s.y + s.ny * d;
          if (qx < 0 || qy < 0 || qx > cols || qy > rows) continue;
          if (inWater(qx, qy)) continue;
          if (otherNear(R, qx, qy, 0.0)) continue;   // cut exactly across the other road's paving, so two sidewalks meet at the corner
          if (stubGaps.some(c => c.R === R && c.side === side && Math.abs(c.s - s.s) <= XWALK_DEPTH / 2 + 0.05)) { flush[i] = true; continue; }
          keep[i] = true;
        }
        for (const [i0, i1] of runsOf(keep, 3)) {
          sweep(sinks.curb, S, i0, i1, [{ d: hw, h: 0 }, { d: hw, h: CURB_H }, { d: hw, h: CURB_H }, { d: hw + CURB_W, h: CURB_H }], side, ground, { caps: true });
          sweep(sinks.sidewalk, S, i0, i1, [{ d: hw + CURB_W, h: CURB_H }, { d: hw + SIDEWALK_W, h: CURB_H }, { d: hw + SIDEWALK_W, h: CURB_H }, { d: hw + SIDEWALK_W + 0.06, h: 0.01 }], side, ground, { caps: true });
        }
        for (const [i0, i1] of runsOf(flush, 2)) sweep(sinks.sidewalk, S, i0, i1, [{ d: hw, h: 0 }, { d: hw + SIDEWALK_W + 0.06, h: 0 }], side, ground);
      }
    }

    // the avenue median: kerb, grass, planters
    if (R.kind === 'avenue') {
      for (const [i0, i1] of runsOf(keepMark, 4)) {
        sweep(sinks.medianKerb, S, i0, i1, rectProfile(-MEDIAN_HW, MEDIAN_HW, 0, 0.2), 1, ground, { caps: true });
        sweep(sinks.median, S, i0, i1, [{ d: -MEDIAN_HW + 0.06, h: 0.21 }, { d: MEDIAN_HW - 0.06, h: 0.21 }], 1, ground);
        const first = Math.ceil((S[i0].s + 1) / PLANTER_EVERY) * PLANTER_EVERY;
        for (let s = first; s <= S[i1].s - 1; s += PLANTER_EVERY) {
          const p = S[indexAt(S, s)], y = ground(p.x, p.y) + 0.2, yaw = Math.atan2(p.tx, p.ty);
          const m = new THREE.Matrix4().makeTranslation(p.x, y, p.y).multiply(new THREE.Matrix4().makeRotationY(yaw));
          sinks.planter.addGeometry(new THREE.BoxGeometry(0.5, 0.34, 0.5).translate(0, 0.17, 0), m);
          sinks.bush.addGeometry(new THREE.IcosahedronGeometry(0.3, 1).scale(1, 0.8, 1).translate(0, 0.5, 0), m);
          planters++;
        }
      }
    }

    // lane markings: a textured strip the width of the road
    {
      const sink = R.kind === 'avenue' ? sinks.markAvenue : sinks.markStreet;
      const gm = (x, z) => H(x, z) + MARK_LIFT;
      for (const [i0, i1] of runsOf(keepMark, 3)) sweep(sink, S, i0, i1, [{ d: -hw, h: 0 }, { d: 0, h: 0 }, { d: hw, h: 0 }], 1, gm);
    }

    // guard rails: the switchback's hairpins on the outer side and any drop beside the road
    if (R.kind === 'switchback') {
      for (const side of [1, -1]) {
        const want = new Array(n).fill(false);
        for (let i = 0; i < n; i++) {
          const s = S[i];
          const outer = s.k > 0 ? -1 : 1;
          const hairpin = Math.abs(s.k) > 0.18 && side === outer;
          const d = side * (hw + 1.1), drop = H(s.x, s.y) - H(s.x + s.nx * d, s.y + s.ny * d);
          if (hairpin || drop > 0.6) want[i] = true;
        }
        const grown = want.slice();
        for (let i = 0; i < n; i++) if (want[i]) for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) grown[k] = true;
        for (const [i0, i1] of runsOf(grown, 6)) {
          guardRuns++;
          sweep(sinks.steel, S, i0, i1, rectProfile(hw + 0.36, hw + 0.42, 0.55, 0.78), side, ground, { caps: true });
          for (let i = i0; i <= i1; i += 4) {
            const s = S[i], d = side * (hw + 0.47), x = s.x + s.nx * d, z = s.y + s.ny * d;
            const m = new THREE.Matrix4().makeTranslation(x, ground(x, z), z).multiply(new THREE.Matrix4().makeRotationY(Math.atan2(s.tx, s.ty)));
            sinks.iron.addGeometry(new THREE.BoxGeometry(0.1, 0.8, 0.1).translate(0, 0.4, 0), m);
          }
        }
      }
    }
  }

  /* ---------- 5. junction fillets: one polygon per junction ---------- */
  let fillets = 0;
  for (const J of junctions) {
    const cx0 = J.x, cy0 = J.y;
    const arms = [];
    for (const arm of J.arms) {
      const s = arm.s + arm.dir * (arm.otherHw + JUNCTION_FILLET);
      const p = arm.R.samples[indexAt(arm.R.samples, clamp(s, 0, arm.R.length))];
      const ux = p.x - cx0, uy = p.y - cy0, ul = Math.hypot(ux, uy) || 1;
      arms.push({ x: p.x, y: p.y, ux: ux / ul, uy: uy / ul, tx: p.tx, ty: p.ty, nx: p.nx, ny: p.ny, hw: arm.R.hw, ang: Math.atan2(uy, ux) });
    }
    if (arms.length < 2) continue;
    arms.sort((a, b) => a.ang - b.ang);
    const poly = [];
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i], b = arms[(i + 1) % arms.length];
      // a's edge point on the counterclockwise side, b's on the clockwise side
      const aside = (a.ux * a.ny - a.uy * a.nx) > 0 ? 1 : -1;
      const bside = (b.ux * b.ny - b.uy * b.nx) > 0 ? -1 : 1;
      const Ea = [a.x + a.nx * aside * a.hw, a.y + a.ny * aside * a.hw];
      const Eb = [b.x + b.nx * bside * b.hw, b.y + b.ny * bside * b.hw];
      poly.push(Ea);
      // a rounded corner between the two edge lines when the arms are not collinear
      let turn = b.ang - a.ang; if (turn < 0) turn += TAU;
      if (turn > 0.45 && turn < TAU - 0.45) {
        const den = a.tx * b.ty - a.ty * b.tx;
        if (Math.abs(den) > 1e-6) {
          const wx = Eb[0] - Ea[0], wy = Eb[1] - Ea[1];
          const u = (wx * b.ty - wy * b.tx) / den;
          const Cx = Ea[0] + a.tx * u, Cy = Ea[1] + a.ty * u;
          if (Math.hypot(Cx - cx0, Cy - cy0) < 12) {
            for (let k = 1; k < 5; k++) {
              const t = k / 5, m = 1 - t;
              poly.push([m * m * Ea[0] + 2 * m * t * Cx + t * t * Eb[0], m * m * Ea[1] + 2 * m * t * Cy + t * t * Eb[1]]);
            }
          }
        }
      }
      poly.push(Eb);
    }
    let mx = 0, my = 0; for (const p of poly) { mx += p[0] / poly.length; my += p[1] / poly.length; }
    const center = sinks.asphalt.vertex(mx, ground(mx, my), my, 0, 0);
    const ids = [center];
    for (const p of poly) ids.push(sinks.asphalt.vertex(p[0], ground(p[0], p[1]), p[1], 0, 0));
    for (let i = 1; i < ids.length; i++) sinks.asphalt.tri(center, ids[i], ids[i === ids.length - 1 ? 1 : i + 1], 0, 1, 0);
    sinks.asphalt.parts++;
    fillets++;
  }

  /* ---------- 6. crosswalk quads ---------- */
  for (const c of crosswalks) {
    const hw = c.R.hw, d = XWALK_DEPTH / 2;
    const ids = [];
    for (const [a, l] of [[-d, -hw], [d, -hw], [d, hw], [-d, hw]]) {
      const x = c.x + c.tx * a - c.ty * l, z = c.y + c.ty * a + c.tx * l;
      ids.push(sinks.zebra.vertex(x, H(x, z) + ZEBRA_LIFT, z, l + hw, (a + d) / XWALK_DEPTH));
    }
    sinks.zebra.fan(ids, 0, 1, 0);
    sinks.zebra.parts++;
  }

  /* ---------- 7. bridges ---------- */
  const bridges = [];
  let piers = 0, arches = 0;
  for (const b of plan.bridges || []) {
    const [ax, ay] = b.a, [bx, by] = b.b;
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    if ((dx && dy) || (!dx && !dy)) continue;
    const width = clamp(b.width || 2, 1, 3), hw = width / 2;
    // width 2 covers c - 1 .. c, width 3 and 1 center on c + 0.5
    const lateral = width === 2 ? 0 : 0.5;
    const c = dx ? ay + lateral : ax + lateral;
    // the deck may reach one tile before a and one tile after b; each end is trimmed to the
    // nearest road ribbon end on the deck's line inside that tile, so the slabs meet edge to
    // edge instead of overlapping (two materials at one height); with no ribbon there (the
    // island shore) the deck keeps its extra tile
    const lo0 = (dx ? Math.min(ax, bx) : Math.min(ay, by)) - 1, hi0 = (dx ? Math.max(ax, bx) : Math.max(ay, by)) + 2;
    const ribbonEnd = (u0, u1, pickMax) => {
      let best = null;
      for (const R of roads) {
        if (R.stairs) continue;
        for (const e of [R.samples[0], R.samples[R.samples.length - 1]]) {
          const along = dx ? e.x : e.y, across = dx ? e.y : e.x;
          if (Math.abs(across - c) > hw + 0.6 || along < u0 - 1e-6 || along > u1 + 1e-6) continue;
          if (best === null || (pickMax ? along > best : along < best)) best = along;
        }
      }
      return best;
    };
    const loEnd = ribbonEnd(lo0 - 0.5, lo0 + 1.5, true), hiEnd = ribbonEnd(hi0 - 1.5, hi0 + 0.5, false);
    const lo = loEnd !== null ? loEnd : lo0, hi = hiEnd !== null ? hiEnd : hi0;
    if (hi - lo < 1.5) continue;
    const pts = dx ? [[lo, c], [hi, c]] : [[c, lo], [c, hi]];
    const rs = resample(pts, STEP);
    if (!rs) continue;
    const S = rs.samples;
    // the deck profile: the terrain's bridge ramp (it meets the ribbon ends at their own height),
    // guarded so it never dips within 0.35 of the water surface it crosses
    let waterTop = -Infinity;
    for (const s of S) { const w = waterAt(s.x, s.y); if (w) waterTop = Math.max(waterTop, w.surface); }
    // v11.1: no water found under the samples (the raster marks the span BRIDGE, not WATER, on the
    // v11 creek and channel bridges) means no floor: the old 0.04 fallback clamped those decks to
    // 0.46 end to end, a shelf 0.3 above the path at both ends. The terrain already clears the water.
    if (!Number.isFinite(waterTop)) waterTop = -Infinity;
    const deckY = S.map(s => Math.max(H(s.x, s.y), waterTop + 0.35) + LIFT + DECK_LIFT);
    // v11.1: no smoothing. The terrain's bridge overlay (ramp plus arch) is already smooth and it
    // is what walkers, riders and the camera read; a smoothed slab flattened short arches by up
    // to 0.3, leaving the visitor floating above the channel cart bridge and sunk in the creek ones.
    const sm = deckY;
    const deck = (x, z, i) => sm[i];
    const kind = b.kind === 'high' || b.kind === 'low' || b.kind === 'foot' ? b.kind : (width >= 3 ? 'high' : 'low');
    const n = S.length;
    const yawOf = s => Math.atan2(s.tx, s.ty);
    const rec = { id: b.id, kind, width, deckMin: Math.min(...sm), deckMax: Math.max(...sm), waterTop, piers: 0, length: rs.length, lo, hi };
    if (kind === 'foot') {
      sweep(sinks.plank, S, 0, n - 1, [{ d: -hw, h: 0 }, { d: hw, h: 0 }], 1, deck, { uScale: 1 });
      for (const side of [1, -1]) {
        sweep(sinks.woodDark, S, 0, n - 1, rectProfile(hw - 0.12, hw, -0.26, 0.02), side, deck, { caps: true });
        sweep(sinks.wood, S, 0, n - 1, rectProfile(hw - 0.1, hw - 0.04, 0.9, 0.98), side, deck, { caps: true });
        sweep(sinks.wood, S, 0, n - 1, rectProfile(hw - 0.09, hw - 0.05, 0.48, 0.53), side, deck, { caps: true });
        for (let i = 0; i < n; i += 3) {
          const s = S[i], d = side * (hw - 0.07), x = s.x + s.nx * d, z = s.y + s.ny * d;
          sinks.woodDark.addGeometry(new THREE.BoxGeometry(0.08, 0.98, 0.08).translate(0, 0.49, 0), new THREE.Matrix4().makeTranslation(x, sm[i], z).multiply(new THREE.Matrix4().makeRotationY(yawOf(s))));
        }
      }
    } else {
      sweep(sinks.concrete, S, 0, n - 1, [{ d: -hw, h: 0 }, { d: 0, h: 0 }, { d: hw, h: 0 }], 1, deck);
      sweep(sinks.concrete, S, 0, n - 1, [{ d: -hw, h: 0 }, { d: -hw, h: -0.5 }, { d: -hw, h: -0.5 }, { d: hw, h: -0.5 }, { d: hw, h: -0.5 }, { d: hw, h: 0 }], 1, deck);
      for (const side of [1, -1]) {
        if (kind === 'high') {
          sweep(sinks.stone, S, 0, n - 1, rectProfile(hw - 0.2, hw, 0, 0.95), side, deck, { caps: true });
          sweep(sinks.stoneDark, S, 0, n - 1, rectProfile(hw - 0.24, hw + 0.04, 0.95, 1.03), side, deck, { caps: true });
        } else {
          sweep(sinks.curb, S, 0, n - 1, rectProfile(hw - 0.2, hw, 0, 0.18), side, deck, { caps: true });
          sweep(sinks.iron, S, 0, n - 1, rectProfile(hw - 0.12, hw - 0.06, 0.98, 1.04), side, deck, { caps: true });
          sweep(sinks.iron, S, 0, n - 1, rectProfile(hw - 0.11, hw - 0.07, 0.56, 0.6), side, deck, { caps: true });
          for (let i = 0; i < n; i += 3) {
            const s = S[i], d = side * (hw - 0.09), x = s.x + s.nx * d, z = s.y + s.ny * d;
            sinks.iron.addGeometry(new THREE.BoxGeometry(0.07, 0.98, 0.07).translate(0, 0.49, 0), new THREE.Matrix4().makeTranslation(x, sm[i] + 0.18, z).multiply(new THREE.Matrix4().makeRotationY(yawOf(s))));
          }
        }
      }
    }
    // piers where the span is over water, every 3.5 tiles from two tiles in; they stand on the
    // plan's water bed (or lower ground), not on whatever the heightfield holds under the deck
    const pierAt = [];
    for (let s = 2.0; s < rs.length - 1.5; s += 3.5) {
      const i = indexAt(S, s), p = S[i], w = waterAt(p.x, p.y);
      if (!w) continue;
      pierAt.push(i);
      const bed = Math.min(H(p.x, p.y), w.bed) - 0.4, top = sm[i] - (kind === 'foot' ? 0.26 : 0.5), hgt = Math.max(0.3, top - bed);
      const yaw = yawOf(p);
      for (const side of [1, -1]) {
        const d = side * Math.max(0.2, hw - (kind === 'foot' ? 0.2 : 0.45)), x = p.x + p.nx * d, z = p.y + p.ny * d;
        const m = new THREE.Matrix4().makeTranslation(x, bed, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
        if (kind === 'foot') sinks.woodDark.addGeometry(new THREE.CylinderGeometry(0.11, 0.13, hgt, 8).translate(0, hgt / 2, 0), m);
        else if (kind === 'high') sinks.stone.addGeometry(new THREE.BoxGeometry(0.7, hgt, 1.1).translate(0, hgt / 2, 0), m);
        else sinks.concrete.addGeometry(new THREE.CylinderGeometry(0.3, 0.36, hgt, 10).translate(0, hgt / 2, 0), m);
      }
      const beamM = new THREE.Matrix4().makeTranslation(p.x, top - 0.3, p.y).multiply(new THREE.Matrix4().makeRotationY(yaw));
      if (kind === 'foot') sinks.woodDark.addGeometry(new THREE.BoxGeometry(Math.max(0.6, width - 0.2), 0.14, 0.14).translate(0, 0.07, 0), beamM);
      else sinks[kind === 'high' ? 'stone' : 'concrete'].addGeometry(new THREE.BoxGeometry(width + 0.1, 0.3, 0.7).translate(0, 0.15, 0), beamM);
      piers++; rec.piers++;
    }
    // stone arches between the high bridge's piers
    if (kind === 'high') for (let k = 0; k + 1 < pierAt.length; k++) {
      const a = S[pierAt[k]], c = S[pierAt[k + 1]];
      const gap = Math.hypot(c.x - a.x, c.y - a.y), r = gap / 2;
      const mx = (a.x + c.x) / 2, mz = (a.y + c.y) / 2, top = Math.min(sm[pierAt[k]], sm[pierAt[k + 1]]) - 0.55;
      const torus = new THREE.TorusGeometry(r, 0.18, 8, 24, Math.PI);
      const m = new THREE.Matrix4().makeTranslation(mx, top - r, mz).multiply(new THREE.Matrix4().makeRotationY(yawOf(a) + Math.PI / 2));
      sinks.stoneDark.addGeometry(torus, m);
      arches++;
    }
    bridges.push(rec);
  }

  /* ---------- 8. meshes ---------- */
  const meshes = [];
  let vertices = 0, triangles = 0;
  for (const k of Object.keys(sinks)) {
    const g = sinks[k].build();
    if (!g) continue;
    const m = new THREE.Mesh(g, MATS[k]);
    const sh = SHADOW[k] || [true, true];
    m.castShadow = sh[0]; m.receiveShadow = sh[1];
    m.name = 'roads:' + k;
    m.userData.merged = true; m.userData.noMerge = true;
    group.add(m); meshes.push(m);
    vertices += g.attributes.position.count; triangles += g.index.count / 3;
  }
  group.userData.roadStats = {
    meshes: meshes.length, ribbons, roads: roads.length, streets: streets.length, junctions: junctions.length, fillets,
    crosswalks: crosswalks.length, stubCrossings, planters, guardRuns, bridges: bridges.length, piers, arches, vertices, triangles,
    bridgeRecords: bridges,
    junctionRecords: junctions.map(J => ({ a: J.A.id, b: J.B.id, roads: J.entries.map(e => e.R.id), x: J.x, y: J.y, arms: J.arms.length, crosswalks: J.crosswalks.length })),
    crosswalkRecords: crosswalks.map(c => ({ road: c.R.id, s: c.s, x: c.x, y: c.y, kind: c.kind, lot: c.lot || null })),
    textured: !!(markStreetTex && zebraTex),
  };

  /* The ribbon surface above the terrain under a world point, by raster tile: the sidewalk slab
     top on a sidewalk tile (the road height on a stub mouth tile, where the slab drops flush),
     the ribbon lift on a road or bridge tile, nothing elsewhere. city.js stands furniture on it
     (its own fallback follows the same rule) and the renderer can place walkers on sidewalk
     tiles with it. */
  function surfaceLiftAt(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!(tx >= 0 && tz >= 0 && tx < cols && tz < rows)) return 0;
    const m = raster.at(tx, tz);
    if (m === MARK.SIDEWALK) return stubMouthTiles.has(tx + ',' + tz) ? LIFT : SIDEWALK_LIFT;
    if (m === MARK.ROAD) return LIFT;
    if (m === MARK.BRIDGE) return LIFT + DECK_LIFT;   // the deck stands DECK_LIFT over the ribbon height
    return 0;
  }

  /* Per frame: the markings and zebras glow faintly at night (retroreflective paint). Nothing
     else moves, and nothing allocates. */
  const glow = [MATS.markStreet, MATS.markAvenue, MATS.zebra];
  function update(dt, time, night) {
    const r = ramp(night || 0) * 0.35;
    for (let i = 0; i < glow.length; i++) glow[i].emissiveIntensity = r;
  }
  return { group, update, meshes, stats: group.userData.roadStats, surfaceLiftAt };
}

export default buildRoads;
