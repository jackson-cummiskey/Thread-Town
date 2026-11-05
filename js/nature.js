/* Thread Town nature (docs/CONTRACT_V10.md "Nature"; placement rules from docs/WORLD_DESIGN.md
   "Nature by district"). Replaces the renderer's single tree look (render3d.js buildTrees) and the
   shore rocks of city.js with instanced forests, rocks, grass tufts, flower beds, reeds and a few
   fallen logs, all placed by district rules on the terrain.

   buildNature(ctx) -> { group, update(dt, time), counts, byDistrict, placements, drawCalls, dispose }
     ctx = { plan, terrain, state, sim?, seed?, THREE? }
       plan      js/cityplan.js PLAN (v3)
       terrain   { heightAt, normalAt, slopeAt, slopeClassAt? } from js/terrain.js; slopeClassAt is
                 optional (the class is derived from slopeAt when it is missing); no terrain at all
                 means a flat field
       state     the sim state (trees, seats, racks, buildings, lamps, hangouts, shoreTiles)
       sim       TT.sim (at, TILES); defaults to globalThis.TT.sim; the plan raster
                 (rasterizePlan) is always read as well, so paths, cart paths, decks, stubs and
                 stations stay clear even with a sim that does not paint them yet
       seed      the placement seed (default TT.sim.terrainSeed or 20261020)
       THREE     the three.js namespace (default: this module's import)

   Four instanced tree types (round broadleaf, tall broadleaf, pine, cypress), each a trunk mesh
   and a canopy mesh with per instance scale, hue and a slight tilt toward the terrain normal.
   Forests on the hill flanks and along the lake, clusters in the parks and along the links,
   street trees along the avenue (sampled along the spline at the sidewalk edge) and along Ledger,
   Harbor and Foundry Street; boulders and cliff rocks on steep and cliff tiles and the ridge
   outcrops; grass tufts and flower beds in the parks and yards; reeds on the lake and pond edges
   and the river banks; a few fallen logs below the links footbridge and in the forests.

   Never on roads, sidewalks, bridges, lots (the pond lot is the park and keeps its trees), course
   tiles, water, the plaza, racks, seats, stations, the subway, the pier, the marina deck, within
   one tile of a lot door, or on the island. Colliders also keep clear of the road ribbons
   themselves (js/roads.js sweeps them along the splines, wider than the raster tiles): a trunk
   stays its radius off the paving or sidewalk edge, a rock or log its footprint radius plus the
   verge where the lane lamps stand. The sim's trees list (its T tiles) is the forest core and
   the collision layer; nature draws those trees (nudged inside their tile away from a ribbon
   edge when needed) and adds its own only on free grass.

   Fifteen instanced meshes in all (under the 60 draw call budget). The wind sway runs in the
   vertex shader (onBeforeCompile) so update(dt, time) only writes one uniform and allocates
   nothing. Deterministic: the same plan, terrain and seed give the same placement. */
import * as THREE_NS from 'three';
import { PLAN as DEFAULT_PLAN, rasterizePlan, MARK, splineSamples, LAKE, ROAD_KINDS } from './cityplan.js';

let THREE = THREE_NS;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const DEFAULT_SEED = 20261020;
const TRUNK_SINK = 0.3;                 // trunks reach into the ground so a tilted tree shows no gap at its foot
const TREE_TILT = 0.35, TREE_TILT_CAP = 8 * DEG;
const TRUNK_R = 0.15;                   // a trunk's reach past its center when it is tested against the road ribbons
const ROCK_VERGE = 0.9;                 // rocks and logs keep this much more off a ribbon edge (the lane verge lamps stand there)
const SIDEWALK_EDGE = 1.06;             // the sidewalk ribbon's outer edge past the half width (js/roads.js: one tile plus the curb lip)

/* Tuning: densities per district (trees per free grass tile, before clustering) and the special
   lines from the design. Read only. */
export const NATURE = {
  density: { residential: 0.22, northbank: 0.12, downtown: 0, valley: 0.04, riverside: 0.14, park: 0.4, industrial: 0.04, lake: 0, links: 0.12, none: 0.08 },
  tufts: { residential: 0.25, northbank: 0.25, downtown: 0.05, valley: 0.3, riverside: 0.15, park: 0.35, industrial: 0.08, lake: 0, links: 0.3, none: 0.15 },
  border: 0.5,                 // forest frame on the two outer tile rings (not on the bluff)
  cluster: { wl: 9, floor: 0.35 },
  hill: { highTypes: 5, ridgeRockR: 2.5, ridgeRockP: 0.2 },
  waterLine: { min: 1, max: 3, valley: 0.22, northbank: 0.35, links: 0.3 },
  linksEdge: { south: 0.45, westShore: 0.35 },
  rocks: { cliff: 0.6, steep: 0.12, valleyCliff: 0.75, valleySteep: 0.3 },
  reeds: { lake: 0.55, pond: 0.6, river: 0.3, other: 0.3 },
  beds: { plazaEdge: 0.7, yard: 0.12, park: 0.06 },
  street: {
    avenue: { every: 4, type: 'round' },
    'ledger-street': { every: 5, type: 'tall' }, 'harbor-street': { every: 5, type: 'tall' },
    'foundry-street': { every: 7, type: 'pine' },
  },
  logs: 7,
  slope: { gentle: 0.12, steep: 0.40, cliff: 0.70 },   // gradient magnitudes when the terrain has no slopeClassAt
};

/* ---------- seeded helpers ---------- */
function mix32(a) {
  a = (a ^ (a >>> 16)) >>> 0; a = Math.imul(a, 0x7FEB352D) >>> 0;
  a = (a ^ (a >>> 15)) >>> 0; a = Math.imul(a, 0x846CA68B) >>> 0;
  return (a ^ (a >>> 16)) >>> 0;
}
function hashAt(seed, x, y, salt) {
  return mix32((seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519)) >>> 0);
}
function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = t => t * t * (3 - 2 * t);
/* Two dimensional value noise in 0..1 with wavelength wl tiles. */
function vnoise(x, y, wl, seed) {
  const fx = x / wl, fy = y / wl, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = smooth(fx - ix), ty = smooth(fy - iy);
  const v = (i, j) => hashAt(seed, i, j, 77) / 4294967296;
  const a = v(ix, iy), b = v(ix + 1, iy), c = v(ix, iy + 1), d = v(ix + 1, iy + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- geometry ---------- */
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
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function distToLine(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, distToSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}
function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}

/* Merges geometries into one non indexed geometry with positions and normals only. */
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < n.length; i++) nor.push(n[i]);
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
const sphere = (r, x, y, z, sx, sy, sz, ws, hs) => { const g = new THREE.SphereGeometry(r, ws || 12, hs || 9); g.scale(sx || 1, sy || 1, sz || 1); g.translate(x, y, z); return g; };
const cone = (r, h, y, seg) => { const g = new THREE.ConeGeometry(r, h, seg || 10); g.translate(0, y, 0); return g; };
const cyl = (rt, rb, h, y, seg) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg || 9); g.translate(0, y, 0); return g; };
/* Jitters a geometry's vertices by up to k (seeded), for rocks. */
function jitter(g, k, seed) {
  const r = rngFrom(seed);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ',' + p.getZ(i).toFixed(4);
    let o = seen.get(key);
    if (!o) { o = [(r() - 0.5) * k, (r() - 0.5) * k, (r() - 0.5) * k]; seen.set(key, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.computeVertexNormals();
  return g;
}
/* A grass tuft: five thin blades fanning out from the base. */
function tuftGeometry() {
  const pos = [], nor = [];
  const blade = (ang, h, lean) => {
    const w = 0.035;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const bx = -dz * w, bz = dx * w;
    const tx = dx * lean * h, tz = dz * lean * h;
    pos.push(bx, 0, bz, -bx, 0, -bz, tx, h, tz);
    nor.push(0, 0.3, 1, 0, 0.3, 1, 0, 0.3, 1);
  };
  for (let i = 0; i < 5; i++) blade(i / 5 * TAU + 0.4, 0.26 + (i % 3) * 0.07, 0.35 + (i % 2) * 0.2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
/* A reed bundle: six leaning stalks, three with a cattail head. */
function reedGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.6 + (i % 4) * 0.11, ang = i / 6 * TAU, lean = 0.12 + (i % 3) * 0.05;
    const s = new THREE.CylinderGeometry(0.012, 0.022, h, 5);
    s.translate(0, h / 2, 0);
    s.rotateZ(lean); s.rotateY(ang);
    s.translate(Math.cos(ang) * 0.06, 0, Math.sin(ang) * 0.06);
    parts.push(s);
    if (i % 2 === 0) {
      const head = new THREE.CylinderGeometry(0.03, 0.03, 0.13, 6);
      head.translate(0, h - 0.1, 0);
      head.rotateZ(lean); head.rotateY(ang);
      head.translate(Math.cos(ang) * 0.06, 0, Math.sin(ang) * 0.06);
      parts.push(head);
    }
  }
  return mergeGeos(parts);
}
/* A fallen log lying along local x with two branch stubs. */
function logGeometry() {
  const body = new THREE.CylinderGeometry(0.14, 0.17, 1.5, 9);
  body.rotateZ(Math.PI / 2); body.translate(0, 0.15, 0);
  const b1 = new THREE.CylinderGeometry(0.04, 0.06, 0.35, 6); b1.translate(0, 0.17, 0); b1.rotateZ(-0.6); b1.translate(0.35, 0.2, 0.05);
  const b2 = new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6); b2.translate(0, 0.15, 0); b2.rotateX(1.1); b2.translate(-0.4, 0.22, 0);
  return mergeGeos([body, b1, b2]);
}

/* ---------- the tree types ---------- */
/* Each type: trunk geometry, merged canopy geometry, canopy base colors, canopy height (for the
   sway weight) and the scale range. The lot of the canopy is in local units; the instance scale
   sets the size. */
function treeTypes() {
  const sink = TRUNK_SINK;
  return {
    round: {
      trunk: cyl(0.09, 0.13, 0.7 + sink, 0.35 - sink / 2, 10),
      canopy: mergeGeos([sphere(0.6, 0, 1.08, 0, 1, 0.92, 1, 14, 10), sphere(0.42, 0.34, 0.9, 0.24), sphere(0.4, -0.3, 0.98, -0.28), sphere(0.32, 0, 1.52, 0, 1, 1, 1, 10, 8)]),
      colors: ['#5FA55A', '#6FAE52', '#68B35E', '#79B85C'], top: 1.9, scale: [0.85, 1.2], sway: 0.05,
    },
    tall: {
      trunk: cyl(0.08, 0.12, 1.3 + sink, 0.65 - sink / 2, 10),
      canopy: mergeGeos([sphere(0.5, 0, 1.75, 0, 1, 1.55, 1, 14, 10), sphere(0.36, 0.27, 1.5, 0.22, 1, 1.3, 1), sphere(0.34, -0.25, 1.62, -0.22, 1, 1.25, 1), sphere(0.28, 0.05, 2.45, 0, 1, 1, 1, 10, 8)]),
      colors: ['#4C8F4A', '#5A9A48', '#4F9552', '#5CA050'], top: 2.7, scale: [0.9, 1.25], sway: 0.06,
    },
    pine: {
      trunk: cyl(0.07, 0.1, 0.7 + sink, 0.35 - sink / 2, 9),
      canopy: mergeGeos([cone(0.62, 0.85, 0.95, 11), cone(0.48, 0.75, 1.45, 11), cone(0.32, 0.65, 1.95, 10)]),
      colors: ['#357A4A', '#3F8A55', '#2F7044', '#3A8250'], top: 2.3, scale: [0.85, 1.3], sway: 0.035,
    },
    cypress: {
      trunk: cyl(0.06, 0.08, 0.45 + sink, 0.225 - sink / 2, 8),
      canopy: mergeGeos([cone(0.3, 2.3, 1.55, 10), sphere(0.3, 0, 0.55, 0, 1, 0.8, 1, 10, 8)]),
      colors: ['#2F6B46', '#3A7A50', '#2A6440', '#3E8056'], top: 2.7, scale: [0.9, 1.35], sway: 0.04,
    },
  };
}

/* ---------- materials with the wind sway ---------- */
/* The sway is a vertex shader displacement that grows with the local height (position.y over
   top) and takes its phase from the instance's world position, so neighbours never move in
   lockstep. uTime is the one uniform update writes. */
function swayMaterial(opts, uTime, key) {
  const { amp: ampV, top: topV, speed: speedV, ...matOpts } = opts;
  const m = new THREE.MeshStandardMaterial(matOpts);
  m.userData.envMapIntensity = 0.25;
  if (!key) return m;
  const amp = ampV.toFixed(4), top = topV.toFixed(3), speed = speedV.toFixed(3);
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      '{\n' +
      '#ifdef USE_INSTANCING\n' +
      '  vec2 swayP = vec2(instanceMatrix[3].x, instanceMatrix[3].z);\n' +
      '#else\n' +
      '  vec2 swayP = vec2(0.0);\n' +
      '#endif\n' +
      '  float swayW = clamp(position.y / ' + top + ', 0.0, 1.0); swayW *= swayW;\n' +
      '  float swayPh = uTime * ' + speed + ' + swayP.x * 0.37 + swayP.y * 0.23;\n' +
      '  transformed.x += (sin(swayPh) + 0.35 * sin(swayPh * 2.3 + 0.7)) * ' + amp + ' * swayW;\n' +
      '  transformed.z += cos(swayPh * 0.8 + 1.3) * ' + amp + ' * 0.6 * swayW;\n' +
      '}\n');
  };
  m.customProgramCacheKey = () => 'nature-sway-' + key;
  return m;
}

/* ---------- the build ---------- */
export function buildNature(ctx) {
  ctx = ctx || {};
  THREE = ctx.THREE || THREE_NS;
  const TTg = typeof globalThis !== 'undefined' ? globalThis.TT : null;
  const sim = ctx.sim || (TTg && TTg.sim) || null;
  const plan = ctx.plan || (sim && sim.PLAN) || DEFAULT_PLAN;
  const state = ctx.state || (sim && sim.state) || {};
  const terrain = ctx.terrain || null;
  let seed = ctx.seed;
  if (!(typeof seed === 'number' && isFinite(seed))) seed = (sim && typeof sim.terrainSeed === 'number') ? sim.terrainSeed : DEFAULT_SEED;
  seed = seed | 0;
  const cols = plan.cols, rows = plan.rows, N = cols * rows;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

  /* terrain samplers (flat without a terrain) */
  const hAt = terrain && typeof terrain.heightAt === 'function' ? (x, z) => { const h = terrain.heightAt(x, z); return Number.isFinite(h) ? h : 0; } : () => 0;
  const nScratch = { x: 0, y: 1, z: 0 }, sScratch = { x: 0, z: 0 };
  const nAt = terrain && typeof terrain.normalAt === 'function' ? (x, z) => { const n = terrain.normalAt(x, z, nScratch) || nScratch; if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z)) { n.x = 0; n.y = 1; n.z = 0; } return n; } : () => nScratch;
  const gradAt = terrain && typeof terrain.slopeAt === 'function' ? (x, z) => { const s = terrain.slopeAt(x, z, sScratch) || sScratch; const g = Math.hypot(s.x, s.z); return Number.isFinite(g) ? g : 0; } : () => 0;
  const classAt = terrain && typeof terrain.slopeClassAt === 'function' ? (x, z) => terrain.slopeClassAt(x, z) || 'flat' : (x, z) => {
    const g = gradAt(x, z), S = NATURE.slope;
    return g < S.gentle ? 'flat' : g < S.steep ? 'gentle' : g < S.cliff ? 'steep' : 'cliff';
  };

  /* the sim grid and the plan raster */
  const TL = (sim && sim.TILES) || { G: 0, P: 1, WA: 2, B: 3, T: 4, Z: 5, F: 6, FT: 8, FW: 9, GR: 10, SA: 11, TEE: 12, SW: 13, CW: 14, PK: 15, BR: 16, PT: 17, CP: 18, DK: 19 };
  const simAt = sim && typeof sim.at === 'function' ? sim.at : null;
  const R = rasterizePlan(plan);
  const MK = MARK;

  /* ---- the block map ----
     1 blocked for everything, 2 blocked for colliders (trees, rocks, logs), 8 lot tile (a yard),
     16 a lot other than the pond (no tree at all, the sim's included), 32 a sim tree stands
     here, 64 water. */
  const flag = new Uint8Array(N);
  const F_ALL = 1, F_COL = 2, F_LOT = 8, F_YARD = 16, F_TREE = 32, F_WATER = 64;
  const add = (x, y, f) => { if (inMap(x, y)) flag[y * cols + x] |= f; };
  const addRing = (x, y, f, r) => { r = r === undefined ? 1 : r; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) add(x + dx, y + dy, f); };
  const has = (x, y, f) => !inMap(x, y) || (flag[y * cols + x] & f) !== 0;

  // v10 sim tiles PT (path), CP (cart path) and DK (deck) are blocked too when the sim has them
  const blockedSimTile = v => v === TL.WA || v === TL.P || v === TL.SW || v === TL.CW || v === TL.PK || v === TL.BR || v === TL.Z || v === TL.FT || v === TL.B || v === TL.FW || v === TL.GR || v === TL.SA || v === TL.TEE || (TL.PT !== undefined && (v === TL.PT || v === TL.CP || v === TL.DK));
  const courseSimTile = v => v === TL.FW || v === TL.GR || v === TL.SA || v === TL.TEE;
  const blockedMark = m => m === MK.WATER || m === MK.ROAD || m === MK.SIDEWALK || m === MK.BRIDGE || m === MK.PLAZA || m === MK.BUILDING || m === MK.STUB || m === MK.PARKING || m === MK.COURTYARD || m === MK.FAIRWAY || m === MK.GREEN || m === MK.TEE || m === MK.SAND || m === MK.PATH || m === MK.CARTPATH || m === MK.STATION || m === MK.DECK || m === MK.FEATURE;
  const courseMark = m => m === MK.FAIRWAY || m === MK.GREEN || m === MK.TEE || m === MK.SAND;
  const water = new Uint8Array(N);   // 1 river or other, 2 lake, 3 pond
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    const v = simAt ? simAt(x, y) : -1, m = R.at(x, y);
    const wet = v === TL.WA || m === MK.WATER;
    if (wet) {
      flag[i] |= F_ALL | F_WATER;
      const li = R.lotIdx[i];
      water[i] = (li >= 0 && R.lots[li].kind === 'pond') ? 3 : pointInPoly(x + 0.5, y + 0.5, LAKE) ? 2 : 1;
    }
    if (blockedSimTile(v) || blockedMark(m)) flag[i] |= F_ALL;
    if (v === TL.T) flag[i] |= F_TREE;
    if (R.lotIdx[i] >= 0) { flag[i] |= F_LOT; if (R.lots[R.lotIdx[i]].kind !== 'pond') flag[i] |= F_COL | F_YARD; }
    // the running sim's own lot claim too, so nature agrees with whichever sim rasterized the lots
    if (sim && typeof sim.lotAt === 'function') { const sl = sim.lotAt(x, y); if (sl) { flag[i] |= F_LOT; if (sl.kind !== 'pond') flag[i] |= F_COL | F_YARD; } }
  }
  // one tile margin for colliders around course tiles, bridges and paths (the trunks stay off the edges)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = simAt ? simAt(x, y) : -1, m = R.at(x, y);
    if (courseSimTile(v) || courseMark(m) || m === MK.BRIDGE || v === TL.BR || m === MK.DECK || (TL.DK !== undefined && v === TL.DK)) addRing(x, y, F_COL);
  }
  // rings around racks, seats, stations, doors, the subway, the pier, the marina, the spawn, lamps
  for (const k of plan.scooterRacks || []) addRing(k.x, k.y, F_ALL);
  for (const s of state.racks || []) addRing(s.x, s.y, F_ALL);
  for (const s of state.seats || []) addRing(s.x, s.y, F_ALL);
  for (const s of plan.seatsExtra || []) addRing(s.x, s.y, F_ALL);
  for (const rec of R.lots) {
    if (rec.station) for (const t of rec.station.tiles) addRing(t.x, t.y, F_ALL);
    if (rec.doorTile) addRing(rec.doorTile.x, rec.doorTile.y, F_ALL);
    if (rec.doorTile2) addRing(rec.doorTile2.x, rec.doorTile2.y, F_ALL);
    for (const t of rec.stub || []) add(t.x, t.y, F_ALL);
  }
  for (const b of state.buildings || []) {
    if (b.station) for (let y = b.station.y - 1; y <= b.station.y + (b.station.h || 4); y++) for (let x = b.station.x - 1; x <= b.station.x + (b.station.w || 4); x++) add(x, y, F_ALL);
    if (b.doorTile) addRing(b.doorTile.x, b.doorTile.y, F_ALL);
    if (b.doorTile2) addRing(b.doorTile2.x, b.doorTile2.y, F_ALL);
    if (b.terrace) for (let y = b.terrace.y; y < b.terrace.y + b.terrace.h; y++) for (let x = b.terrace.x; x < b.terrace.x + b.terrace.w; x++) add(x, y, F_ALL);
  }
  if (plan.subway) addRing(plan.subway.x, plan.subway.y, F_ALL, 2);
  if (plan.pier) addRing(plan.pier.x, plan.pier.y, F_ALL);
  if (plan.marina) addRing(plan.marina.x, plan.marina.y, F_ALL);
  if (R.marina) for (const t of R.marina.deck) addRing(t.x, t.y, F_ALL);
  if (plan.spawn) addRing(plan.spawn.x, plan.spawn.y, F_ALL);
  if (plan.fountain) addRing(plan.fountain.x, plan.fountain.y, F_ALL, 2);
  for (const l of state.lamps || []) add(Math.floor(l.x), Math.floor(l.y), F_ALL);
  for (const h of state.hangouts || []) add(h.x, h.y, F_COL);
  for (const t of state.shoreTiles || []) add(t.x, t.y, F_COL);
  for (const h of R.holes) { addRing(h.teeTile.x, h.teeTile.y, F_ALL, 2); addRing(h.cupTile.x, h.cupTile.y, F_ALL, 2); }
  for (const t of R.islandTiles) add(t.x, t.y, F_ALL);
  if (plan.golf) for (const h of plan.golf.holes || []) if (h.island && h.island.pts) { const b = polyBounds(h.island.pts); for (let y = b.y0 - 1; y <= b.y1; y++) for (let x = b.x0 - 1; x <= b.x1; x++) if (pointInPoly(x + 0.5, y + 0.5, h.island.pts)) add(x, y, F_ALL); }
  for (const s of plan.stairs || []) { const [ax, ay] = s.from, [bx, by] = s.to; for (let y = Math.min(ay, by) - 1; y <= Math.max(ay, by) + 1; y++) for (let x = Math.min(ax, bx) - 1; x <= Math.max(ax, bx) + 1; x++) add(x, y, F_ALL); }

  /* ---- the road ribbons as lines: a collider must keep its reach off the paving (or the
     sidewalk) edge, measured against the sampled spline, not the raster tiles ---- */
  const stairIds = new Set((plan.stairs || []).map(s => s.id));
  const roadLines = (plan.roads || []).filter(r => r && r.pts && r.pts.length > 1 && !stairIds.has(r.id)).map(r => {
    const pts = splineSamples(r.pts, 0.5), hw = (r.width || ROAD_KINDS[r.kind] || 2) / 2;
    return { id: r.id, pts, b: polyBounds(pts), edge: hw + (r.sidewalks && hw >= 1 ? SIDEWALK_EDGE : 0) };
  });
  const roadClear = (x, z, reach) => {
    for (const rl of roadLines) {
      const need = rl.edge + reach;
      if (x < rl.b.x0 - need || x > rl.b.x1 + need || z < rl.b.y0 - need || z > rl.b.y1 + need) continue;
      if (distToLine(x, z, rl.pts) < need) return false;
    }
    return true;
  };

  /* ---- districts (plan order, the first polygon containing the tile center wins) ---- */
  const districts = plan.districts || [];
  const dIdx = new Int8Array(N).fill(-1);
  districts.forEach((d, di) => {
    const b = polyBounds(d.pts);
    for (let y = Math.max(0, b.y0); y <= Math.min(rows - 1, b.y1); y++) for (let x = Math.max(0, b.x0); x <= Math.min(cols - 1, b.x1); x++) {
      const i = y * cols + x;
      if (dIdx[i] < 0 && pointInPoly(x + 0.5, y + 0.5, d.pts)) dIdx[i] = di;
    }
  });
  const dId = i => dIdx[i] >= 0 ? districts[dIdx[i]].id : 'none';
  const hill = districts.find(d => d.id === 'residential');
  const hillC = hill && hill.landform && hill.landform.center ? hill.landform.center : [33, 27];
  const ridge = hill && hill.landform && hill.landform.ridge ? hill.landform.ridge : null;

  /* ---- distance to water (4-connected steps, capped at 6) and the kind of the nearest water ---- */
  const dWater = new Uint8Array(N).fill(7), wKind = new Uint8Array(N);
  {
    const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (flag[i] & F_WATER) { dWater[i] = 0; wKind[i] = water[i]; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], d = dWater[i];
      if (d >= 6) continue;
      const x = i % cols, y = (i / cols) | 0;
      const step = (nx, ny) => { if (!inMap(nx, ny)) return; const j = ny * cols + nx; if (dWater[j] > d + 1) { dWater[j] = d + 1; wKind[j] = wKind[i]; q[qt++] = j; } };
      step(x + 1, y); step(x - 1, y); step(x, y + 1); step(x, y - 1);
    }
  }

  /* ---- collection ---- */
  const streetSkips = {};
  const items = { round: [], tall: [], pine: [], cypress: [], boulder: [], cliff: [], tuft: [], bed: [], bloom: [], reed: [], log: [] };
  const counts = {};
  const byDistrict = {};
  const placements = [];
  const occ = new Uint8Array(N);   // a collider placed by this module
  const record = (kind, x, z, y, extra) => {
    const tx = Math.floor(x), ty = Math.floor(z);
    counts[kind] = (counts[kind] || 0) + 1;
    const d = inMap(tx, ty) ? dId(ty * cols + tx) : 'none';
    const bd = byDistrict[d] || (byDistrict[d] = {});
    bd[kind] = (bd[kind] || 0) + 1;
    placements.push({ x, z, y, kind, tx, ty });
    const it = Object.assign({ x, z, y, tx, ty }, extra);
    items[kind].push(it);
    return it;
  };
  /* A tree on tile (x, y): the trunk stands inside its tile (jitter 0.24) on the terrain, with
     a yaw and a size. A trunk that would stand on a ribbon's edge is nudged inside its tile away
     from the road when `keep` is set (the sim's collision trees must be drawn), else dropped. */
  const NUDGES = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3]];
  const treeAt = (type, x, y, r, keep) => {
    const jx = (r() - 0.5) * 0.24, jz = (r() - 0.5) * 0.24;
    let wx = x + 0.5 + jx, wz = y + 0.5 + jz;
    if (!roadClear(wx, wz, TRUNK_R)) {
      let found = false;
      if (keep) for (const [ox, oz] of NUDGES) { const cx = x + 0.5 + ox, cz = y + 0.5 + oz; if (roadClear(cx, cz, TRUNK_R)) { wx = cx; wz = cz; found = true; break; } }
      if (!found) { counts.roadSkipped = (counts.roadSkipped || 0) + 1; if (!keep) return false; }
    }
    const T = TYPES[type];
    const s = T.scale[0] + (T.scale[1] - T.scale[0]) * r();
    record(type, wx, wz, hAt(wx, wz), { yaw: r() * TAU, s, ci: Math.floor(r() * T.colors.length), dl: (r() - 0.5) * 0.12, dh: (r() - 0.5) * 0.04 });
    occ[y * cols + x] = 1;
    return true;
  };
  const TYPES = treeTypes();
  const rngAt = (x, y, salt) => rngFrom(hashAt(seed, x, y, salt));
  const freeFor = (x, y, f) => inMap(x, y) && (flag[y * cols + x] & f) === 0;
  const colliderFree = (x, y) => freeFor(x, y, F_ALL | F_COL | F_TREE) && !occ[y * cols + x];

  /* 1. the sim's trees (forest cores): the type by variant and district, skipped where the plan
     raster forbids a tree (paths, decks, features the sim may not paint yet). */
  let simSkipped = 0;
  for (const t of state.trees || []) {
    if (!inMap(t.x, t.y)) continue;
    const i = t.y * cols + t.x;
    if ((flag[i] & (F_ALL | F_YARD)) || occ[i]) { simSkipped++; continue; }
    const d = dId(i), h = hAt(t.x + 0.5, t.y + 0.5);
    let type;
    if (t.v === 2) type = 'pine';
    else if (d === 'valley') type = 'cypress';
    else if (d === 'links') type = t.v === 1 ? 'cypress' : 'pine';
    else if (d === 'residential' && h > NATURE.hill.highTypes) type = 'tall';
    else type = t.v === 1 ? 'tall' : 'round';
    treeAt(type, t.x, t.y, rngAt(t.x, t.y, 11), true);
    flag[i] |= F_TREE;
  }

  /* 2. forests, clusters and tree lines by district rule. */
  const pickType = (r, mix) => { let u = r(); for (const [type, w] of mix) { u -= w; if (u <= 0) return type; } return mix[mix.length - 1][0]; };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (!colliderFree(x, y)) continue;
    const d = dId(i);
    const cx = x + 0.5, cz = y + 0.5;
    const sc = classAt(cx, cz);
    if (sc === 'cliff') continue;
    const h = hAt(cx, cz);
    const cn = vnoise(x, y, NATURE.cluster.wl, seed);
    const k = Math.max(0, (cn - NATURE.cluster.floor) / (1 - NATURE.cluster.floor));
    const clusterMul = 0.2 + 1.5 * k * k;
    let p = (NATURE.density[d] !== undefined ? NATURE.density[d] : NATURE.density.none) * clusterMul;
    let mix = [['round', 0.6], ['tall', 0.25], ['pine', 0.15]];
    const dw = dWater[i];
    if (d === 'residential') {
      const dx = cx - hillC[0], dz = cz - hillC[1], len = Math.hypot(dx, dz) || 1;
      const nw = Math.max(0, (-dx - dz) / len / Math.SQRT2);
      p = NATURE.density.residential * (0.15 + 0.85 * nw) * clusterMul;
      mix = h > NATURE.hill.highTypes ? [['pine', 0.55], ['tall', 0.45]] : [['round', 0.6], ['tall', 0.25], ['pine', 0.15]];
    } else if (d === 'northbank') {
      mix = [['round', 0.75], ['tall', 0.25]];
      if (dw >= NATURE.waterLine.min && dw <= NATURE.waterLine.max) p = Math.max(p, NATURE.waterLine.northbank);
    } else if (d === 'valley') {
      mix = [['cypress', 0.85], ['round', 0.15]];
      if (dw >= NATURE.waterLine.min && dw <= NATURE.waterLine.max) p = Math.max(p, NATURE.waterLine.valley);
    } else if (d === 'riverside') {
      mix = [['round', 0.6], ['tall', 0.4]];
    } else if (d === 'park') {
      p = NATURE.density.park * (0.6 + 0.6 * k);
      mix = [['round', 0.85], ['tall', 0.15]];
    } else if (d === 'industrial') {
      mix = [['pine', 0.8], ['tall', 0.2]];
    } else if (d === 'links') {
      mix = [['pine', 0.5], ['cypress', 0.5]];
      if (y >= rows - 5) p = Math.max(p, NATURE.linksEdge.south);
      if (x <= 10 && y >= 100 && y <= 136) p = Math.max(p, NATURE.linksEdge.westShore);
      if (dw >= NATURE.waterLine.min && dw <= NATURE.waterLine.max && wKind[i] !== 2) { p = Math.max(p, NATURE.waterLine.links); mix = [['cypress', 0.6], ['tall', 0.4]]; }
    } else if (d === 'downtown') {
      p = 0;
    }
    const border = x <= 1 || y <= 1 || x >= cols - 2 || y >= rows - 2;
    if (border && d !== 'downtown') { p = Math.max(p, NATURE.border); mix = [['pine', 0.5], ['tall', 0.5]]; }
    if (sc === 'steep') p *= 0.6;
    if (p <= 0) continue;
    const r = rngAt(x, y, 23);
    if (r() < p) treeAt(pickType(r, mix), x, y, r);
  }

  /* 3. street trees: sampled along the road splines, offset to the outer sidewalk edge (the
     verge just past the sidewalk, half a tile further when the first spot is paved), one every
     few tiles alternating sides. */
  for (const road of plan.roads || []) {
    const rule = NATURE.street[road.kind] || NATURE.street[road.id];
    if (!rule || !road.pts || road.pts.length < 2) continue;
    const width = road.width || 2, edge = width / 2 + (road.sidewalks ? 1 : 0);
    const samples = splineSamples(road.pts, 0.25);
    const skips = streetSkips[road.id] = { placed: 0, paved: 0, lot: 0, tree: 0, taken: 0 };
    let acc = 0, next = rule.every / 2, side = 1, n = 0, retry = 0;
    for (let si = 1; si < samples.length; si++) {
      const a = samples[si - 1], b = samples[si];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      acc += seg;
      if (acc < next) continue;
      next += rule.every;
      const dx = (b[0] - a[0]) / (seg || 1), dz = (b[1] - a[1]) / (seg || 1);
      let px = 0, pz = 0, tx = -1, ty = -1, ok = false;
      for (const extra of [0.5, 1.0]) {
        px = b[0] - dz * (edge + extra) * side; pz = b[1] + dx * (edge + extra) * side;
        tx = Math.floor(px); ty = Math.floor(pz);
        if (colliderFree(tx, ty) && roadClear(px, pz, TRUNK_R)) { ok = true; break; }
      }
      side = -side;
      if (!ok) {
        const f = inMap(tx, ty) ? flag[ty * cols + tx] : F_ALL;
        if (f & F_ALL) skips.paved++; else if (f & F_COL) skips.lot++; else if (f & F_TREE) skips.tree++; else skips.taken++;
        // a blocked spot (a stub, a rack ring, a crossing, a lot frontage) moves the slot 1.5 tiles on, twice at most
        if (retry < 2) { retry++; next = acc + 1.5; side = -side; }
        else retry = 0;
        continue;
      }
      retry = 0;
      skips.placed++;
      const r = rngAt(tx, ty, 31 + n++);
      const T = TYPES[rule.type];
      const s = T.scale[0] + (T.scale[1] - T.scale[0]) * 0.4 * r() + 0.1;
      record(rule.type, px, pz, hAt(px, pz), { yaw: r() * TAU, s, ci: Math.floor(r() * T.colors.length), dl: (r() - 0.5) * 0.08, dh: (r() - 0.5) * 0.03, street: true });
      occ[ty * cols + tx] = 1;
      counts.streetTrees = (counts.streetTrees || 0) + 1;
    }
  }

  /* 4. rocks: cliff rocks on cliff tiles, boulders on steep tiles (more in the gorge) and along
     the hill ridge. */
  const ridgeBox = ridge ? polyBounds(ridge) : null;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!colliderFree(x, y)) continue;
    const i = y * cols + x, d = dId(i);
    const cx = x + 0.5, cz = y + 0.5;
    const sc = classAt(cx, cz);
    let pc = 0, pb = 0;
    if (sc === 'cliff') pc = d === 'valley' ? NATURE.rocks.valleyCliff : NATURE.rocks.cliff;
    else if (sc === 'steep') pb = d === 'valley' ? NATURE.rocks.valleySteep : NATURE.rocks.steep;
    if (ridge && d === 'residential' && x >= ridgeBox.x0 - 3 && x <= ridgeBox.x1 + 3 && y >= ridgeBox.y0 - 3 && y <= ridgeBox.y1 + 3 && distToLine(cx, cz, ridge) <= NATURE.hill.ridgeRockR) pb = Math.max(pb, NATURE.hill.ridgeRockP);
    if (pc <= 0 && pb <= 0) continue;
    const r = rngAt(x, y, 41);
    const u = r();
    const kind = u < pc ? 'cliff' : u < pc + pb ? 'boulder' : null;
    if (!kind) continue;
    const wx = cx + (r() - 0.5) * 0.4, wz = cz + (r() - 0.5) * 0.4;
    const yaw = r() * TAU, sx = 1 + r() * (kind === 'cliff' ? 1.2 : 0.8), sy = 0.6 + r() * 0.5, sz = 1 + r() * (kind === 'cliff' ? 0.9 : 0.6), dl = (r() - 0.5) * 0.16, dark = r() < 0.45;
    // the footprint radius (the base geometry's radius scaled) must clear the ribbons and the verge
    const reach = (kind === 'cliff' ? 0.75 : 0.5) * Math.max(sx, sz) + ROCK_VERGE;
    if (!roadClear(wx, wz, reach)) { counts.roadSkipped = (counts.roadSkipped || 0) + 1; continue; }
    record(kind, wx, wz, hAt(wx, wz), { yaw, sx, sy, sz, dl, dark });
    occ[i] = 1;
  }

  /* 5. grass tufts and flower beds: parks, yards, the plaza edges. */
  const isPlazaTile = (x, y) => inMap(x, y) && ((simAt && simAt(x, y) === TL.Z) || R.at(x, y) === MK.PLAZA);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (!freeFor(x, y, F_ALL)) continue;
    const d = dId(i);
    const yard = (flag[i] & F_YARD) !== 0;
    if (yard && d === 'industrial') continue;   // nothing in the flats' yards
    const cx = x + 0.5, cz = y + 0.5;
    const r = rngAt(x, y, 53);
    let pt = NATURE.tufts[d] !== undefined ? NATURE.tufts[d] : NATURE.tufts.none;
    if (yard) pt = Math.max(pt, 0.3);
    if (r() < pt) {
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const wx = cx + (r() - 0.5) * 0.8, wz = cz + (r() - 0.5) * 0.8;
        record('tuft', wx, wz, hAt(wx, wz), { yaw: r() * TAU, s: 0.7 + r() * 0.7, dl: (r() - 0.5) * 0.14, dh: (r() - 0.5) * 0.05 });
      }
    }
    if (occ[i] || (flag[i] & F_TREE)) continue;   // no bed under a tree or a rock
    let pbed = 0;
    const plazaEdge = isPlazaTile(x + 1, y) || isPlazaTile(x - 1, y) || isPlazaTile(x, y + 1) || isPlazaTile(x, y - 1);
    if (plazaEdge) pbed = NATURE.beds.plazaEdge;
    else if (yard && (d === 'residential' || d === 'riverside' || d === 'northbank' || d === 'downtown')) pbed = NATURE.beds.yard;
    else if (d === 'park') pbed = NATURE.beds.park;
    if (pbed > 0 && r() < pbed) {
      const wx = cx + (r() - 0.5) * 0.3, wz = cz + (r() - 0.5) * 0.3;
      const base = hAt(wx, wz);
      record('bed', wx, wz, base, { yaw: r() * TAU, s: 0.8 + r() * 0.5, dl: (r() - 0.5) * 0.1 });
      const nb = 5 + Math.floor(r() * 3);
      for (let k = 0; k < nb; k++) {
        const ang = r() * TAU, rad = r() * 0.3;
        const bx = wx + Math.cos(ang) * rad, bz = wz + Math.sin(ang) * rad;
        const lift = 0.2 * Math.sqrt(Math.max(0, 1 - (rad / 0.42) * (rad / 0.42)));
        record('bloom', bx, bz, base + lift + 0.02, { ci: Math.floor(r() * 4), s: 0.8 + r() * 0.5 });
      }
    }
  }

  /* 6. reeds on the land tile at the water's edge, leaning out over the water. */
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (dWater[i] !== 1 || !freeFor(x, y, F_ALL)) continue;
    const wk = wKind[i];
    const p = wk === 2 ? NATURE.reeds.lake : wk === 3 ? NATURE.reeds.pond : wk === 1 && dId(i) === 'valley' ? NATURE.reeds.river : NATURE.reeds.other;
    const r = rngAt(x, y, 67);
    if (r() >= p) continue;
    // the direction to the water: the average of the wet 4-neighbours
    let dx = 0, dz = 0;
    if (has(x + 1, y, F_WATER) && inMap(x + 1, y)) dx += 1; if (has(x - 1, y, F_WATER) && inMap(x - 1, y)) dx -= 1;
    if (has(x, y + 1, F_WATER) && inMap(x, y + 1)) dz += 1; if (has(x, y - 1, F_WATER) && inMap(x, y - 1)) dz -= 1;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const along = (r() - 0.5) * 0.6, out = 0.25 + r() * 0.2;
      const wx = clamp(x + 0.5 + dx * out - dz * along, x + 0.03, x + 0.97), wz = clamp(y + 0.5 + dz * out + dx * along, y + 0.03, y + 0.97);
      record('reed', wx, wz, hAt(wx, wz), { yaw: r() * TAU, s: 0.8 + r() * 0.5, dl: (r() - 0.5) * 0.16, dh: (r() - 0.5) * 0.06 });
    }
  }

  /* 7. a few fallen logs: below the links footbridge on the banks, then in the hill forest and
     along the links south edge. */
  {
    const rl = rngFrom(mix32(seed ^ 0x51ED));
    const foot = (plan.bridges || []).find(b => b.id === 'links-footbridge') || null;
    const spots = [];
    const pick = (cands, n) => { for (let k = 0; k < n && cands.length; k++) { const j = Math.floor(rl() * cands.length); spots.push(cands.splice(j, 1)[0]); } };
    if (foot) {
      const cx0 = Math.min(foot.a[0], foot.b[0]) - 3, cx1 = Math.max(foot.a[0], foot.b[0]) + 3, cy0 = foot.a[1] + 1, cy1 = foot.a[1] + 10;
      const c = [];
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (colliderFree(x, y) && dWater[y * cols + x] >= 1 && dWater[y * cols + x] <= 3) c.push({ x, y });
      pick(c, 3);
    }
    const forest = [];
    for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++) {
      const i = y * cols + x;
      if (!colliderFree(x, y)) continue;
      const d = dId(i);
      // a free tile with at least three tree tiles around it
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inMap(x + dx, y + dy) && (flag[(y + dy) * cols + x + dx] & F_TREE)) near++;
      if (near >= 3 && (d === 'residential' || d === 'links')) forest.push({ x, y, d });
    }
    pick(forest.filter(f => f.d === 'residential'), 2);
    pick(forest.filter(f => f.d === 'links'), Math.max(0, NATURE.logs - spots.length));
    for (const s of spots) {
      const wx = s.x + 0.5 + (rl() - 0.5) * 0.2, wz = s.y + 0.5 + (rl() - 0.5) * 0.2;
      if (!roadClear(wx, wz, 1.0 + ROCK_VERGE)) { counts.roadSkipped = (counts.roadSkipped || 0) + 1; continue; }
      record('log', wx, wz, hAt(wx, wz), { yaw: rl() * TAU, s: 0.8 + rl() * 0.4, dl: (rl() - 0.5) * 0.12 });
      occ[s.y * cols + s.x] = 1;
    }
  }

  /* ---- the meshes ---- */
  const group = new THREE.Group();
  group.name = 'nature';
  const uTime = { value: 0 };
  const geos = [], mats = [];
  const keepG = g => { geos.push(g); return g; };
  const keepM = m => { mats.push(m); return m; };
  const M = {
    bark: keepM(swayMaterial({ color: '#8A6446', roughness: 0.95 }, uTime, null)),
    barkDark: keepM(swayMaterial({ color: '#6B4A32', roughness: 0.95 }, uTime, null)),
    rock: keepM(swayMaterial({ color: '#FFFFFF', roughness: 0.95 }, uTime, null)),
    tuft: keepM(swayMaterial({ color: '#FFFFFF', roughness: 0.9, side: THREE.DoubleSide, amp: 0.08, top: 0.35, speed: 2.2 }, uTime, 'tuft')),
    bed: keepM(swayMaterial({ color: '#FFFFFF', roughness: 0.9 }, uTime, null)),
    bloom: keepM(swayMaterial({ color: '#FFFFFF', roughness: 0.7, amp: 0.02, top: 0.1, speed: 2.0 }, uTime, 'bloom')),
    reed: keepM(swayMaterial({ color: '#FFFFFF', roughness: 0.85, amp: 0.1, top: 0.9, speed: 1.9 }, uTime, 'reed')),
    log: keepM(swayMaterial({ color: '#FFFFFF', roughness: 0.9 }, uTime, null)),
  };
  for (const [name, T] of Object.entries(TYPES)) M['canopy_' + name] = keepM(swayMaterial({ color: '#FFFFFF', roughness: 0.9, amp: T.sway, top: T.top, speed: 1.4 }, uTime, name));

  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _c = new THREE.Color(), _ax = new THREE.Vector3(), _t = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  /* A quaternion tilting the up axis toward the normal n by a fraction k, capped at cap radians. */
  const tiltQuat = (out, n, k, cap) => {
    _t.set(n.x * k, 1 - k + n.y * k, n.z * k).normalize();
    const ang = Math.acos(clamp(_t.y, -1, 1));
    if (ang < 1e-5) return out.identity();
    _ax.crossVectors(UP, _t).normalize();
    return out.setFromAxisAngle(_ax, Math.min(ang, cap === undefined ? Math.PI : cap));
  };
  let drawCalls = 0;
  const makeInst = (geo, mat, list, fill, opts) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(keepG(geo), mat, list.length);
    // the solid pieces (trunks, canopies, rocks, logs) cast and receive the cascade shadows;
    // the tufts, beds, blooms and reeds stay cheap and receive none
    im.castShadow = !!(opts && opts.shadow); im.receiveShadow = !!(opts && opts.shadow); im.frustumCulled = false;
    im.name = opts && opts.name ? opts.name : 'nature';
    im.userData.noMerge = true;
    let colored = false;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      fill(it);
      _m.compose(_v, _q, _s);
      im.setMatrixAt(i, _m);
      if (opts && opts.color) { opts.color(it); im.setColorAt(i, _c); colored = true; }
    }
    im.instanceMatrix.needsUpdate = true;
    if (colored && im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
    drawCalls++;
    return im;
  };
  const treeFill = (it, tiltK, cap) => {
    _v.set(it.x, it.y, it.z);
    _q.setFromAxisAngle(UP, it.yaw);
    tiltQuat(_q2, nAt(it.x, it.z), tiltK, cap);
    _q.premultiply(_q2);
    _s.set(it.s, it.s, it.s);
  };
  for (const [name, T] of Object.entries(TYPES)) {
    const list = items[name];
    makeInst(T.trunk, name === 'pine' || name === 'cypress' ? M.barkDark : M.bark, list, it => treeFill(it, TREE_TILT, TREE_TILT_CAP), { shadow: true, name: 'trees-' + name + '-trunk' });
    makeInst(T.canopy, M['canopy_' + name], list, it => treeFill(it, TREE_TILT, TREE_TILT_CAP), { shadow: true, name: 'trees-' + name + '-canopy', color: it => { _c.set(T.colors[it.ci]); _c.offsetHSL(it.dh, 0, it.dl); } });
  }
  const rockFill = (it, tiltK, cap, sink) => {
    _v.set(it.x, it.y - sink, it.z);
    _q.setFromAxisAngle(UP, it.yaw);
    tiltQuat(_q2, nAt(it.x, it.z), tiltK, cap);
    _q.premultiply(_q2);
    _s.set(it.sx, it.sy, it.sz);
  };
  const rockColor = it => { _c.set(it.dark ? '#7E878C' : '#9AA3A8'); _c.offsetHSL(0, 0, it.dl); };
  makeInst(jitter(new THREE.IcosahedronGeometry(0.42, 1), 0.14, seed ^ 11), M.rock, items.boulder, it => rockFill(it, 0.3, 20 * DEG, 0.12), { shadow: true, name: 'rocks-boulders', color: rockColor });
  makeInst(jitter(new THREE.DodecahedronGeometry(0.6, 0), 0.2, seed ^ 13), M.rock, items.cliff, it => rockFill(it, 1, 70 * DEG, 0.2), { shadow: true, name: 'rocks-cliff', color: rockColor });
  makeInst(tuftGeometry(), M.tuft, items.tuft, it => { _v.set(it.x, it.y, it.z); _q.setFromAxisAngle(UP, it.yaw); _s.set(it.s, it.s, it.s); }, { name: 'grass-tufts', color: it => { _c.set('#7FB55A'); _c.offsetHSL(it.dh, 0, it.dl); } });
  makeInst(sphere(0.42, 0, 0, 0, 1, 0.5, 0.85, 12, 8), M.bed, items.bed, it => { _v.set(it.x, it.y, it.z); _q.setFromAxisAngle(UP, it.yaw); _s.set(it.s, it.s, it.s); }, { name: 'flower-beds', color: it => { _c.set('#4F9245'); _c.offsetHSL(0, 0, it.dl); } });
  const BLOOM = ['#E7706F', '#FFFFFF', '#F6D463', '#75CCD0'];
  makeInst(sphere(0.065, 0, 0, 0, 1, 1, 1, 6, 5), M.bloom, items.bloom, it => { _v.set(it.x, it.y, it.z); _q.identity(); _s.set(it.s, it.s, it.s); }, { name: 'flower-blooms', color: it => { _c.set(BLOOM[it.ci]); } });
  makeInst(reedGeometry(), M.reed, items.reed, it => { _v.set(it.x, it.y, it.z); _q.setFromAxisAngle(UP, it.yaw); _s.set(it.s, it.s, it.s); }, { name: 'reeds', color: it => { _c.set('#8FA75A'); _c.offsetHSL(it.dh, 0, it.dl); } });
  makeInst(logGeometry(), M.log, items.log, it => { _v.set(it.x, it.y, it.z); _q.setFromAxisAngle(UP, it.yaw); tiltQuat(_q2, nAt(it.x, it.z), 1, 30 * DEG); _q.premultiply(_q2); _s.set(it.s, it.s, it.s); }, { shadow: true, name: 'logs', color: it => { _c.set('#7A5A3C'); _c.offsetHSL(0, 0, it.dl); } });

  counts.simTreesSkipped = simSkipped;
  // ctx.debug (an object) receives the working maps for tests and tools
  if (ctx.debug && typeof ctx.debug === 'object') Object.assign(ctx.debug, { flag, dIdx, dWater, wKind, occ, streetSkips, items });
  group.userData.placements = placements;
  group.userData.counts = counts;
  group.userData.byDistrict = byDistrict;
  group.userData.drawCalls = drawCalls;

  let clock = 0;
  function update(dt, time) {
    if (typeof time === 'number' && isFinite(time)) clock = time;
    else clock += (typeof dt === 'number' && isFinite(dt)) ? dt : 0;
    uTime.value = clock;
  }
  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const o of group.children) if (o.isInstancedMesh) o.dispose();
    group.clear();
  }
  return { group, update, counts, byDistrict, placements, drawCalls, dispose };
}

export default buildNature;
