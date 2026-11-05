/* Thread National (CONTRACT_V10 "Thread National", geography from docs/WORLD_DESIGN.md).

   The ground paints the fairways, greens, sand and tees (the ground module reads the sim tiles),
   so buildGolf adds what stands on top: nine holes from the plan with a numbered flag and a cup
   on the terrain, green contour lines, two tee markers and a hole sign (number, name, par and
   the length in yards at ten yards per tile) on every hole, yardage plates at 100 and 150 yards
   on the par 4s and 5s, the cart paths as gravel ribbons along the plan's cartpath splines, the
   island green's sand collar, the entrance sign on the links road and the clubhouse sign (both
   reading the course name), the clubhouse porch dressing, the practice pin, the range mats,
   markers, net and shelter. It also owns the ball pool (mesh, trail) and the ball physics
   (strike, stepBall, lieAt, waterDrop).

   Coordinates: world tile units, sim x is world x and sim y is world z, one tile is one unit,
   a tile's center is (x + 0.5, y + 0.5). Local +z is south. Yaw convention matches the player:
   a facing yaw of a maps the local +z face to the world direction (sin a, 0, cos a), which is
   the plan's rotVec(rot, 0, 1) for a = rot degrees.

   Course objects: every entry in the returned `holes` array and the returned `range` is a
   "course" for stepBall and lieAt: it carries the state.golf record fields plus the plan's hole
   fields (name, tee.elev, collarR, island), `sim` (for `sim.at` and `sim.TILES`), `parkBounds`
   and `area` (the out test: outside the links polygon, or the rect when no polygon is known),
   `waterPolys` (the plan's river and lake and the hole's own hazards), `greenRx` and `greenRy`
   (the exact ellipse) and, for the range only, `net`. lieAt and stepBall also accept a bare
   state.golf hole record and fall back to window.TT.sim and to the record's own bounds, so the
   controller may pass either.

   Water (CONTRACT_V10 "Thread National"): lieAt returns 'water' inside the lake or the river
   (the plan polygons, so the island reads green, sand or rough even where the sim grid says
   water) and stepBall's water event carries `drop`, the point where the ball last crossed dry
   ground walking from the launch toward the splash, pulled back half a tile: for the island
   hole's tee shot that is the tee side shore. The controller places the ball there.

   Per-frame code (update, stepBall, strike) allocates nothing; module-scope scratch vectors and
   reused event objects carry every temporary value. stepBall's returned event object is reused
   on the next event, so read it immediately.

   Terrain (CONTRACT_V8 "Ball physics on slopes"): the renderer sets `course.terrain =
   { heightAt, slopeAt, normalAt }`. With it the ball rests on `heightAt + BALL_R`, rolls
   downhill along the gradient, creeps on slopes of 6 percent or more until it reaches flatter
   ground, and bounces about the surface normal. Without it every rule is the flat rule.
   buildGolf takes `ctx.heightAt(x, z)` (default flat) and stands every prop on the terrain, and
   `ctx.terrain` (optional) is attached to each course.

   v11 (docs/CONTRACT_V11.md "The waterway", docs/V11_DESIGN.md "The hole the creek crosses"):
   the creek runs down the right side of hole 9 (reshaped in the plan: the cup at (42, 100), 281
   yards) and the channel cuts across hole 5; both arrive as sim WA tiles, so lieAt already reads
   'water' on them and the drop lands on the tee side. Every course also carries `waterways`,
   the raster's waterway tile masks (ctx.raster, else sim.raster, else rasterizePlan(plan)), so
   lieAt answers 'water' on the creek and the channel even where only the polygon test used to
   run (a course without a sim in scope: the aim preview's landing lie, the hover readout), never
   on a bridge or deck tile over them. A sunk ball rests at the body's surface less 0.2
   (waterSurfaceAt: the waterway's level, -0.9 on the creek and the channel; the river and the
   lake from terrain.water when the renderer passes it, else the design levels -0.7 and -0.9;
   -0.3 where no body is known, the v10 value). The hole stories and the card lengths come from
   the plan (hole 9 reads 281 yards, the card total 2,268). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { BRAND, mat, box, cyl, sphere, dome, plane, canvasTex, clamp } from './depts/common.js';
import { splineSamples, rasterizePlan } from './cityplan.js';

export const COURSE_NAME = 'Thread National';
export const YARDS_PER_TILE = 10;
export const PLATE_YARDS = [100, 150];

/* ---------- physics constants (GOLF_DESIGN "Physics tuning") ---------- */
export const CLUBS = {
  driver: { maxSpeed: 20.5, elevation: 0.36, spread: 0.06 },
  iron: { maxSpeed: 14.5, elevation: 0.58, spread: 0.04 },
  putter: { maxSpeed: 7.5, elevation: 0, spread: 0.02 },
};
export const GRAVITY = 20;
export const BALL_R = 0.11;
const LIE_MOD = { tee: 1.0, fairway: 1.0, green: 1.0, path: 1.0, rough: 0.85, sand: 0.5, water: 1.0 };
const RESTITUTION = { tee: 0.42, fairway: 0.42, rough: 0.42, green: 0.30, sand: 0.10, path: 0.5, water: 0 };
const HRET = 0.62;                 // horizontal retention on a bounce
const ROLL_SWITCH = 1.2;           // below this post-bounce vertical speed the ball rolls
const ROLL_DECEL = { green: 3.0, fairway: 6.5, rough: 9.5, sand: 16, path: 5.0, tee: 6.5, water: 16 };
const REST_SPEED = 0.15;
const CUP_R = 0.22;
const CUP_SPEED = 3.2;
const LIP_DEFLECT = 0.6;
const MAX_SPEED = 30;
const MAX_DT = 0.05;
const SUB_DT = 1 / 120;            // the design tuned the constants at a high step rate
/* Slopes (TERRAIN_DESIGN "Ball on slopes"). */
const SLOPE_K = 0.9;               // gradient scale: the downhill pull is SLOPE_K * GRAVITY * grad
const REST_SLOPE = 0.06;           // a ball rests only where the slope magnitude is under this
const SLOPE_EPS = 0.0005;          // one predicate for rest and creep, safe against 0.05999..
const CREEP_MAX = 1.2;             // below this speed on a steep slope the resistance is capped
const CREEP_K = 0.35;              // the cap: this share of the downhill pull
const CREEP_TIMEOUT = 6;           // seconds in the creep regime after which a ball may rest anyway
const TRAIL_N = 12, TRAIL_LIFE = 0.45, TRAIL_EVERY = 0.03, TRAIL_MIN_SPEED = 4;
const POOL_MAX = 24;
const DROP_STEP = 0.25;            // the walk back from the splash toward the launch, in tiles
const DROP_MARGIN = 0.5;           // how far back from the water's edge the drop lands

/* Tile ids per CONTRACT_V5 (fallbacks when the sim does not expose them yet). */
const TILE_DEFAULT = { G: 0, P: 1, WA: 2, B: 3, T: 4, Z: 5, F: 6, FT: 8, FW: 9, GR: 10, SA: 11, TEE: 12 };

/* ---------- colors ---------- */
const C = {
  trim: '#F8F6F0', wood: '#A5774E', woodDark: '#6B4A2B', iron: '#2E3E50', cupDark: '#1E2A33',
  finial: '#F6D463', hedge: '#6FA860', mat: '#3F8A55', white: '#FFFFFF', paper: '#E8E2D5',
  gravel: '#B8AE9C', gravelEdge: '#9C927F', sand: '#E3D3A6', contour: '#4F8F45',
};

/* ---------- default layout (the map when the sim has not rasterized the plan) ---------- */
export const PARK_BOUNDS = { x0: 0, y0: 0, x1: 192, y1: 144 };

/* ---------- small helpers ---------- */
const hasDoc = () => typeof document !== 'undefined' && !!document.createElement;
const finite = v => typeof v === 'number' && isFinite(v);
const texOrNull = (w, h, draw) => (hasDoc() ? canvasTex(w, h, draw) : null);
const repaints = [];               // canvases repainted once web fonts resolve
const DEG = Math.PI / 180;

/* A canvas-backed standard material; falls back to a flat color without a DOM. */
function texMat(w, h, draw, fallbackHex, opts = {}) {
  const t = texOrNull(w, h, draw);
  if (!t) return mat(fallbackHex, { roughness: 0.9, doubleSide: !!opts.doubleSide });
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0, side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  m.userData.envMapIntensity = 0.25;
  repaints.push(() => { draw(t.image.getContext('2d'), w, h); t.needsUpdate = true; });
  return m;
}
/* A thin rod between two world points (pennant line, bag legs, crank). Center-anchored cylinder. */
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rd = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function rod(ax, ay, az, bx, by, bz, r, material, parent) {
  _ra.set(ax, ay, az); _rb.set(bx, by, bz); _rd.subVectors(_rb, _ra);
  const len = _rd.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), material);
  m.position.copy(_ra).addScaledVector(_rd, 0.5);
  _q.setFromUnitVectors(_up, _rd.normalize()); m.quaternion.copy(_q);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
/* Point in polygon ([[x, y], ...]) by the even-odd rule; allocation free. */
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inAnyPoly(px, py, polys) {
  if (!polys) return false;
  for (let i = 0; i < polys.length; i++) { const p = polys[i]; if (p && p.length >= 3 && pointInPoly(px, py, p)) return true; }
  return false;
}
function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
/* The plan's rotVec: the canonical offset (dx, dy) turned by rot degrees (90 east, 180 north). */
function rotVec(rot, dx, dy) {
  const a = (rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}
/* The point on a hole's polyline (tile coordinates, centers at + 0.5) `dist` tiles back from
   the cup end, with the unit direction toward the tee; null when the line is shorter. */
function pointBackFromCup(line, dist) {
  if (!Array.isArray(line) || line.length < 2) return null;
  let rem = dist;
  for (let i = line.length - 1; i > 0; i--) {
    const ax = line[i][0] + 0.5, az = line[i][1] + 0.5, bx = line[i - 1][0] + 0.5, bz = line[i - 1][1] + 0.5;
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg >= rem) {
      const u = seg > 0 ? rem / seg : 0;
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, dx: seg > 0 ? (bx - ax) / seg : 0, dz: seg > 0 ? (bz - az) / seg : 1 };
    }
    rem -= seg;
  }
  return null;
}
function polylineLength(line) {
  let l = 0;
  for (let i = 1; i < line.length; i++) l += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return l;
}

/* ---------- lie ---------- */
function tilesOf(sim) { return (sim && sim.TILES) ? sim.TILES : TILE_DEFAULT; }
function simOf(course) {
  if (course && course.sim) return course.sim;
  if (typeof window !== 'undefined' && window.TT && window.TT.sim) return window.TT.sim;
  if (typeof globalThis !== 'undefined' && globalThis.TT && globalThis.TT.sim) return globalThis.TT.sim;
  return null;
}
function planOf(ctx, sim) {
  if (ctx && ctx.plan && ctx.plan.golf) return ctx.plan;
  if (sim && sim.PLAN && sim.PLAN.golf) return sim.PLAN;
  const g = typeof globalThis !== 'undefined' ? globalThis.TT : null;
  if (g && g.PLAN && g.PLAN.golf) return g.PLAN;
  if (g && g.sim && g.sim.PLAN && g.sim.PLAN.golf) return g.sim.PLAN;
  return null;
}
/* ---------- terrain ---------- */
/* The terrain of a course, or null for the flat rules. */
function terrainOf(course) {
  const t = course && course.terrain;
  return (t && typeof t.heightAt === 'function') ? t : null;
}
function groundAt(terrain, x, z) {
  if (!terrain) return 0;
  const g = terrain.heightAt(x, z);
  return finite(g) ? g : 0;
}
/* readSlope fills _gx, _gz with the gradient (dh/dx, dh/dz) at a point. slopeAt may fill the
   passed scratch or return its own value; {x, z}, {x, y} and [dx, dz] shapes are all read. */
const _grad = { x: NaN, y: NaN, z: NaN };
let _gx = 0, _gz = 0;
function readSlope(terrain, x, z) {
  _gx = 0; _gz = 0;
  if (!terrain || typeof terrain.slopeAt !== 'function') return;
  _grad.x = NaN; _grad.y = NaN; _grad.z = NaN;
  const g = terrain.slopeAt(x, z, _grad) || _grad;
  let gx, gz;
  if (typeof g.length === 'number' && !finite(g.x)) { gx = g[0]; gz = g[1]; }
  else { gx = g.x; gz = finite(g.z) ? g.z : g.y; }
  if (finite(gx)) _gx = gx;
  if (finite(gz)) _gz = gz;
}
/* readNormal returns the unit surface normal at a point in _nrm (up on flat ground). */
const _nrm = new THREE.Vector3(0, 1, 0);
function readNormal(terrain, x, z) {
  _nrm.set(0, 1, 0);
  if (!terrain) return _nrm;
  if (typeof terrain.normalAt !== 'function') {
    readSlope(terrain, x, z);
    _nrm.set(-_gx, 1, -_gz).normalize();
    return _nrm;
  }
  _nrm.x = NaN; _nrm.y = NaN; _nrm.z = NaN;
  const n = terrain.normalAt(x, z, _nrm) || _nrm;
  let nx, ny, nz;
  if (typeof n.length === 'number' && !finite(n.x)) { nx = n[0]; ny = n[1]; nz = n[2]; }
  else { nx = n.x; ny = n.y; nz = n.z; }
  if (!finite(nx) || !finite(ny) || !finite(nz) || ny <= 0) { _nrm.set(0, 1, 0); return _nrm; }
  _nrm.set(nx, ny, nz);
  const l = _nrm.length();
  if (l < 1e-6) _nrm.set(0, 1, 0); else _nrm.multiplyScalar(1 / l);
  return _nrm;
}

/* lieAt(course, x, z): the lie under a world point.
   1. The hole's own island (hole 6): inside the green ellipse 'green', inside collarR 'sand',
      else 'rough' (the island fringe), whatever the sim grid says under it.
   2. Another hole's island reads 'rough'; the plan's water polygons (lake, river, the hole's
      own hazards) read 'water'.
   3. Then the sim tile: water, sand, the exact green ellipse (so a ball on the cup side of the
      green always reads green), the GR tile for the fringe, tee, fairway, paths, decks and
      bridges as 'path'. Everything else is rough. */
export function lieAt(course, x, z) {
  if (course && course.island && course.island.pts && pointInPoly(x, z, course.island.pts)) {
    const d = greenDist(course, x, z);
    if (d <= 1) return 'green';
    if (finite(course.collarR) && course.greenCenter && Math.hypot(x - course.greenCenter.x, z - course.greenCenter.y) <= course.collarR) return 'sand';
    return 'rough';
  }
  if (course && course.islands && inAnyPoly(x, z, course.islands)) return 'rough';
  if (course && course.waterPolys && inAnyPoly(x, z, course.waterPolys)) return 'water';
  const sim = simOf(course);
  const T = tilesOf(sim);
  const v = sim && sim.at ? sim.at(Math.floor(x), Math.floor(z)) : -1;
  const fw = T.FW === undefined ? TILE_DEFAULT.FW : T.FW, gr = T.GR === undefined ? TILE_DEFAULT.GR : T.GR;
  const sa = T.SA === undefined ? TILE_DEFAULT.SA : T.SA, tee = T.TEE === undefined ? TILE_DEFAULT.TEE : T.TEE;
  const wa = T.WA === undefined ? TILE_DEFAULT.WA : T.WA, p = T.P === undefined ? TILE_DEFAULT.P : T.P;
  if (v === wa) return 'water';
  // v11: the creek and the channel from the raster's waterway masks (the sim marks them WA too;
  // this covers a course with no sim in scope), never on a bridge or deck tile over the water
  if (course && course.waterways && v !== T.BR && v !== T.DK && waterwayLevelAt(course.waterways, x, z) !== null) return 'water';
  if (v === sa) return 'sand';
  if (course && course.greenCenter && greenDist(course, x, z) <= 1) return 'green';
  if (v === gr) return 'green';
  if (v === tee) return 'tee';
  if (v === fw) return 'fairway';
  if (v === p) return 'path';
  if (v >= 0 && (v === T.PT || v === T.CP || v === T.BR || v === T.DK || v === T.SW || v === T.CW)) return 'path';
  return 'rough';
}
/* v11: the surface level of the waterway under a world point from the course's waterway masks
   ([{ id, body, level, mask, cols, rows }]), or null off them. Allocation free. */
function waterwayLevelAt(ways, x, z) {
  const tx = Math.floor(x), tz = Math.floor(z);
  for (let i = 0; i < ways.length; i++) {
    const w = ways[i];
    if (!w || !w.mask || tx < 0 || tz < 0 || tx >= w.cols || tz >= w.rows) continue;
    if (w.mask[tz * w.cols + tx]) return w.level;
  }
  return null;
}
/* waterSurfaceAt(course, x, z): the surface height of the water body under a world point: a
   waterway's level first, then the plan's river and lake (course.waterBodies, [{ pts, surface }]),
   then the hole's own hazards at the lake level, else null. Allocation free. */
export function waterSurfaceAt(course, x, z) {
  if (!course) return null;
  if (course.waterways) { const l = waterwayLevelAt(course.waterways, x, z); if (l !== null) return l; }
  const bodies = course.waterBodies;
  if (bodies) for (let i = 0; i < bodies.length; i++) { const b = bodies[i]; if (b && b.pts && pointInPoly(x, z, b.pts)) return b.surface; }
  if (course.waterPolys && inAnyPoly(x, z, course.waterPolys)) return WATER_SURFACE_DEFAULT.lake;
  return null;
}
/* The design's water levels (docs/V11_DESIGN.md "Water levels") when the terrain gives none. */
const WATER_SURFACE_DEFAULT = { river: -0.7, lake: -0.9, pond: 0.04 };
const SUNK_DEPTH = 0.2;            // a sunk ball rests this far under the surface
/* Normalized ellipse distance to the green center (1 on the edge); Infinity without a green. */
function greenDist(course, x, z) {
  if (!course || !course.greenCenter) return Infinity;
  const rx = finite(course.greenRx) ? course.greenRx : course.greenR, ry = finite(course.greenRy) ? course.greenRy : course.greenR;
  if (!(rx > 0 && ry > 0)) return Infinity;
  const ex = (x - course.greenCenter.x) / rx, ez = (z - course.greenCenter.y) / ry;
  return ex * ex + ez * ez;
}

/* ---------- ball physics ---------- */
const EV_REST = { type: 'rest' };
const EV_HOLED = { type: 'holed' };
const EV_WATER = { type: 'water', x: 0, z: 0, drop: { x: 0, z: 0 } };
const EV_OUT = { type: 'out' };
const _dir = new THREE.Vector3();

function clubOf(c) {
  if (!c) return CLUBS.iron;
  if (typeof c === 'string') return CLUBS[c] || CLUBS.iron;
  return c;
}
/* strike(ball, { club, power, yaw, lie, rand?, course? }): sets the ball velocity for a shot. club is
   a key of CLUBS or a club object; power 0..1; yaw is the aim yaw (direction (sin yaw, cos yaw));
   lie is a lieAt result; rand (optional) is a 0..1 source for the yaw error, Math.random by default;
   course (optional) supplies the terrain so the ball leaves from the ground height (without it a
   resting ball keeps its height and stepBall settles it on the first step).
   The putter is a pure ground roll. strokes are the controller's. */
export function strike(ball, opts) {
  const club = clubOf(opts && opts.club);
  const power = clamp(finite(opts && opts.power) ? opts.power : 0, 0, 1);
  const yaw = finite(opts && opts.yaw) ? opts.yaw : 0;
  const lie = (opts && opts.lie) || 'fairway';
  const rand = (opts && typeof opts.rand === 'function') ? opts.rand : Math.random;
  const terrain = terrainOf(opts && opts.course);
  const lieMod = LIE_MOD[lie] === undefined ? 1 : LIE_MOD[lie];
  let speed = club.maxSpeed * (0.25 + 0.75 * power) * lieMod;
  if (!finite(speed)) speed = 0;
  speed = Math.min(speed, MAX_SPEED);
  const err = (rand() * 2 - 1) * club.spread * (0.4 + power);
  const a = yaw + err;
  const elev = club === CLUBS.putter ? 0 : (finite(club.elevation) ? club.elevation : 0);
  _dir.set(Math.sin(a), 0, Math.cos(a));
  ball.vel.set(_dir.x * speed * Math.cos(elev), speed * Math.sin(elev), _dir.z * speed * Math.cos(elev));
  if (terrain) ball.pos.y = groundAt(terrain, ball.pos.x, ball.pos.z) + BALL_R;
  else if (!finite(ball.pos.y) || ball.pos.y < BALL_R) ball.pos.y = BALL_R;
  ball.rolling = elev === 0;
  ball.resting = false;
  ball.holed = false;
  ball.landed = ball.rolling;
  ball.carry = 0;
  ball.lipOut = false;
  ball.hitNet = false;
  ball.inWater = false;
  ball.creepT = 0;
  ball.launch.copy(ball.pos);
  ball.club = club === CLUBS.driver ? 'driver' : club === CLUBS.putter ? 'putter' : club === CLUBS.iron ? 'iron' : (opts && opts.club) || 'iron';
  ball.trailTimer = 0;
  return ball;
}

function outBoundsOf(course) { return (course && (course.parkBounds || course.bounds)) || PARK_BOUNDS; }
function inBounds(b, x, z) { return x >= b.x0 && x < b.x1 && z >= b.y0 && z < b.y1; }
/* In play: inside the links polygon when the course carries one, else inside the rect. */
function inPlay(course, bounds, x, z) {
  if (!inBounds(bounds, x, z)) return false;
  const a = course && course.area;
  if (a && a.length >= 3) return pointInPoly(x, z, a);
  return true;
}

/* Reset a broken ball to its last rest, resting. */
function resetBall(ball, terrain) {
  if (!finite(ball.lastRest.x) || !finite(ball.lastRest.y) || !finite(ball.lastRest.z)) ball.lastRest.set(0, BALL_R, 0);
  ball.pos.copy(ball.lastRest); ball.pos.y = groundAt(terrain, ball.pos.x, ball.pos.z) + BALL_R;
  ball.vel.set(0, 0, 0);
  ball.rolling = false; ball.resting = true;
}

/* stepBall(ball, dt, course): integrates flight, bounce and roll in substeps of at most 1/120 s.
   Returns null, { type: 'rest' }, { type: 'holed' }, { type: 'water', x, z, drop: { x, z } } or
   { type: 'out' }. Sets ball.lipOut (cup deflection, the controller clears it), ball.hitNet
   (range net) and ball.drop (the water drop point) as flags, and ball.carry (distance from the
   strike point to the first landing) on the first contact. With course.terrain the ground is
   heightAt, a rolling ball feels the slope and bounces reflect about the surface normal;
   without it the ground is flat at 0. */
export function stepBall(ball, dt, course) {
  if (!ball || ball.resting) return null;
  if (!finite(dt) || dt <= 0) return null;
  dt = Math.min(dt, MAX_DT);
  const sim = simOf(course);
  const terrain = terrainOf(course);
  const cols = (sim && sim.COLS) || 192, rows = (sim && sim.ROWS) || 144;
  const bounds = outBoundsOf(course);
  const cup = course && course.cup;
  const net = course && course.net;
  const netBase = net && finite(net.y) ? net.y : 0;
  const pos = ball.pos, vel = ball.vel;
  if (!finite(pos.x) || !finite(pos.y) || !finite(pos.z) || !finite(vel.x) || !finite(vel.y) || !finite(vel.z)) { resetBall(ball, terrain); return EV_REST; }

  const n = Math.max(1, Math.ceil(dt / SUB_DT));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    // Speed clamp.
    const sp = vel.length();
    if (sp > MAX_SPEED) vel.multiplyScalar(MAX_SPEED / sp);

    if (!ball.rolling) {
      // Flight.
      vel.y -= GRAVITY * h;
      pos.addScaledVector(vel, h);
      // Range net: a ball that crosses the net plane below its top hits it and drops at its foot.
      // The net faces the tee line along (dx, dz): d is the distance past the net center plane.
      if (net && finite(net.dx)) {
        const rx = pos.x - net.cx, rz = pos.z - net.cz;
        const d = rx * net.dx + rz * net.dz, lat = Math.abs(rx * net.dz - rz * net.dx);
        const vd = vel.x * net.dx + vel.z * net.dz;
        if (vd > 0 && d >= net.hitD && pos.y < net.top + netBase && lat <= net.half + 0.5) {
          pos.x -= net.dx * (d - net.hitD); pos.z -= net.dz * (d - net.hitD);
          vel.set(-net.dx * 0.4, Math.min(vel.y, 0), -net.dz * 0.4);
          ball.hitNet = true;
          if (!ball.landed) { ball.landed = true; ball.carry = Math.hypot(pos.x - ball.launch.x, pos.z - ball.launch.z); }
        }
      }
      if (!inPlay(course, bounds, pos.x, pos.z)) { return outEvent(ball, cols, rows, terrain); }
      const g0 = groundAt(terrain, pos.x, pos.z);
      if (pos.y <= g0 + BALL_R) {
        pos.y = g0 + BALL_R;
        // Bounce about the surface normal: v' = HRET vt - e vn n with vt = v - vn n. On flat ground
        // n is up and this is the version 7 bounce. A ball under the surface but moving away from it
        // (a shot released from below a slope) is lifted and flies on.
        const nrm = readNormal(terrain, pos.x, pos.z);
        const vn = vel.x * nrm.x + vel.y * nrm.y + vel.z * nrm.z;
        if (vn < 0) {
          if (!ball.landed) { ball.landed = true; ball.carry = Math.hypot(pos.x - ball.launch.x, pos.z - ball.launch.z); }
          const lie = lieAt(course, pos.x, pos.z);
          if (lie === 'water') return waterEvent(ball, course);
          const rest = RESTITUTION[lie] === undefined ? 0.42 : RESTITUTION[lie];
          const tx = vel.x - vn * nrm.x, ty = vel.y - vn * nrm.y, tz = vel.z - vn * nrm.z;
          vel.x = HRET * tx - rest * vn * nrm.x;
          vel.y = HRET * ty - rest * vn * nrm.y;
          vel.z = HRET * tz - rest * vn * nrm.z;
          const up = vel.x * nrm.x + vel.y * nrm.y + vel.z * nrm.z;
          if (up < ROLL_SWITCH) { vel.y = 0; ball.rolling = true; ball.creepT = 0; }
        }
      }
    } else {
      // Rolling.
      pos.y = groundAt(terrain, pos.x, pos.z) + BALL_R;
      vel.y = 0;
      const lie = lieAt(course, pos.x, pos.z);
      if (lie === 'water') return waterEvent(ball, course);
      let decel = ROLL_DECEL[lie] === undefined ? 9.5 : ROLL_DECEL[lie];
      let steep = false;
      if (terrain) {
        // Gravity along the slope, then the creep regime: on a steep slope at low speed the
        // resistance is capped at a share of the downhill pull so the ball trickles to flatter ground.
        readSlope(terrain, pos.x, pos.z);
        const slope = Math.hypot(_gx, _gz);
        steep = slope >= REST_SLOPE - SLOPE_EPS;
        vel.x -= SLOPE_K * GRAVITY * _gx * h;
        vel.z -= SLOPE_K * GRAVITY * _gz * h;
        if (steep && Math.hypot(vel.x, vel.z) < CREEP_MAX) {
          decel = Math.min(decel, CREEP_K * SLOPE_K * GRAVITY * slope);
          ball.creepT = (finite(ball.creepT) ? ball.creepT : 0) + h;
        } else ball.creepT = 0;
      }
      let s = Math.hypot(vel.x, vel.z);
      if (s > 0) {
        const ns = Math.max(0, s - decel * h);
        vel.x *= ns / s; vel.z *= ns / s;
        s = ns;
      }
      pos.addScaledVector(vel, h);
      if (terrain) pos.y = groundAt(terrain, pos.x, pos.z) + BALL_R;
      if (!inPlay(course, bounds, pos.x, pos.z)) { return outEvent(ball, cols, rows, terrain); }
      // Cup capture or lip-out.
      if (cup) {
        const dx = pos.x - cup.x, dz = pos.z - cup.y;
        const d = Math.hypot(dx, dz);
        if (d < CUP_R) {
          if (s < CUP_SPEED) {
            pos.set(cup.x, groundAt(terrain, cup.x, cup.y) + BALL_R, cup.y);
            vel.set(0, 0, 0);
            ball.rolling = false; ball.resting = true; ball.holed = true;
            ball.lastRest.copy(pos);
            return EV_HOLED;
          }
          // Lip out: reflect off the far rim, keep 0.6 of the speed, leave the cup radius.
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          const dot = vel.x * nx + vel.z * nz;
          vel.x = (vel.x - 2 * dot * nx) * LIP_DEFLECT;
          vel.z = (vel.z - 2 * dot * nz) * LIP_DEFLECT;
          // Make sure the ball moves away from the cup center.
          if (vel.x * nx + vel.z * nz < 0) { vel.x = -vel.x; vel.z = -vel.z; }
          pos.x = cup.x + nx * (CUP_R + 0.01); pos.z = cup.y + nz * (CUP_R + 0.01);
          ball.lipOut = true;
        }
      }
      // Rest: slow, and on ground flatter than REST_SLOPE (or creeping for longer than the timeout).
      if (s < REST_SPEED && (!steep || ball.creepT > CREEP_TIMEOUT)) {
        vel.set(0, 0, 0);
        ball.resting = true;
        ball.creepT = 0;
        ball.lastRest.copy(pos);
        return EV_REST;
      }
    }
    if (!finite(pos.x) || !finite(pos.y) || !finite(pos.z) || !finite(vel.x) || !finite(vel.y) || !finite(vel.z)) { resetBall(ball, terrain); return EV_REST; }
  }
  // Keep the position on the map and above the ground.
  pos.x = clamp(pos.x, 0, cols); pos.z = clamp(pos.z, 0, rows); pos.y = clamp(pos.y, groundAt(terrain, pos.x, pos.z) + BALL_R, 80);
  return null;
}
/* waterDrop(course, lx, lz, ex, ez, out): the drop point for a ball launched at (lx, lz) that
   splashed at (ex, ez): walking from the launch toward the splash, the last dry point before the
   first water, pulled DROP_MARGIN back toward the launch while that stays dry. The launch itself
   is the answer when the ball went in at once. On the island hole a tee shot drops on the tee
   side shore and a shot from the island drops at the island's edge. Fills and returns `out`
   ({ x, z }; a fresh object when omitted). */
export function waterDrop(course, lx, lz, ex, ez, out) {
  out = out || { x: 0, z: 0 };
  if (!finite(lx) || !finite(lz)) { out.x = finite(ex) ? ex : 0; out.z = finite(ez) ? ez : 0; return out; }
  const dx = ex - lx, dz = ez - lz, L = Math.hypot(dx, dz);
  let gx = lx, gz = lz;
  if (L > 1e-6) {
    const n = Math.max(1, Math.ceil(L / DROP_STEP));
    for (let k = 1; k <= n; k++) {
      const px = lx + dx * k / n, pz = lz + dz * k / n;
      if (lieAt(course, px, pz) === 'water') break;
      gx = px; gz = pz;
    }
    const back = Math.min(DROP_MARGIN, Math.hypot(gx - lx, gz - lz));
    if (back > 0) {
      const bx = gx - dx / L * back, bz = gz - dz / L * back;
      if (lieAt(course, bx, bz) !== 'water') { gx = bx; gz = bz; }
    }
  }
  out.x = gx; out.z = gz;
  return out;
}
/* The water rule: the ball sinks to the body's surface less SUNK_DEPTH (v11; -0.3 where no body
   is known) and rests; inWater hides the mesh wherever the terrain puts the ground. The event and
   the ball carry the drop point on the shot side. */
function waterEvent(ball, course) {
  EV_WATER.x = ball.pos.x; EV_WATER.z = ball.pos.z;
  const lx = finite(ball.launch.x) ? ball.launch.x : ball.lastRest.x, lz = finite(ball.launch.z) ? ball.launch.z : ball.lastRest.z;
  waterDrop(course, lx, lz, ball.pos.x, ball.pos.z, EV_WATER.drop);
  if (!ball.drop) ball.drop = { x: 0, z: 0 };
  ball.drop.x = EV_WATER.drop.x; ball.drop.z = EV_WATER.drop.z;
  ball.vel.set(0, 0, 0);
  const surface = waterSurfaceAt(course, ball.pos.x, ball.pos.z);
  ball.pos.y = surface === null ? -0.3 : surface - SUNK_DEPTH;
  ball.rolling = false; ball.resting = true; ball.inWater = true; ball.creepT = 0;
  return EV_WATER;
}
function outEvent(ball, cols, rows, terrain) {
  ball.vel.set(0, 0, 0);
  ball.pos.x = clamp(ball.pos.x, 0, cols); ball.pos.z = clamp(ball.pos.z, 0, rows);
  ball.pos.y = groundAt(terrain, ball.pos.x, ball.pos.z) + BALL_R;
  ball.rolling = false; ball.resting = true; ball.creepT = 0;
  return EV_OUT;
}

/* ---------- course objects ---------- */
/* A hole course from the sim record (tee and cup centers, bounds, line, bunkers) and the plan's
   hole (name, par, tee.elev, collarR, island, hazards). Either may be missing. */
function makeHoleCourse(h, ph, i, sim, terrain, shared) {
  const c = Object.assign({}, h || {});
  c.terrain = terrain || c.terrain || null;
  c.n = finite(c.n) ? c.n : (ph && finite(ph.n) ? ph.n : i + 1);
  c.par = finite(c.par) ? c.par : (ph && finite(ph.par) ? ph.par : 3);
  c.name = typeof c.name === 'string' && c.name ? c.name : (ph && ph.name) || ('Hole ' + c.n);
  if (!c.tee || !finite(c.tee.x)) c.tee = ph ? { x: ph.tee.x + 1, y: ph.tee.y + 1 } : { x: 0, y: 0 };
  else c.tee = { x: c.tee.x, y: c.tee.y };
  c.tee.elev = ph && ph.tee && finite(ph.tee.elev) ? ph.tee.elev : (finite(c.elev) ? c.elev : 0);
  if (!c.cup || !finite(c.cup.x)) c.cup = ph ? { x: ph.cup.x + 0.5, y: ph.cup.y + 0.5 } : { x: c.tee.x + 10, y: c.tee.y };
  if (!c.greenCenter) c.greenCenter = { x: c.cup.x, y: c.cup.y };
  const pr = ph && finite(ph.greenR) ? ph.greenR : 2.5;
  if (!finite(c.greenR)) c.greenR = pr;
  if (!finite(c.greenRx)) c.greenRx = c.greenR;
  if (!finite(c.greenRy)) c.greenRy = c.greenR;
  c.collarR = ph && finite(ph.collarR) ? ph.collarR : (finite(c.collarR) ? c.collarR : null);
  c.island = ph && ph.island && Array.isArray(ph.island.pts) ? { pts: ph.island.pts.map(p => [p[0], p[1]]), height: finite(ph.island.height) ? ph.island.height : 0.6 } : (c.island && c.island.pts ? c.island : null);
  c.bridge = ph && ph.bridge ? ph.bridge : (c.bridge || null);
  c.story = ph && ph.story ? ph.story : (c.story || '');
  if (!Array.isArray(c.line) || !c.line.length) c.line = ph && Array.isArray(ph.line) ? ph.line.map(p => [p[0], p[1]]) : [[c.tee.x - 0.5, c.tee.y - 0.5], [c.cup.x - 0.5, c.cup.y - 0.5]];
  if (!finite(c.fairwayWidth)) c.fairwayWidth = ph && finite(ph.fairwayWidth) ? ph.fairwayWidth : 5;
  if (!Array.isArray(c.bunkers)) c.bunkers = ph && Array.isArray(ph.bunkers) ? ph.bunkers.map(b => ({ x: b.x + 0.5, y: b.y + 0.5, r: b.r })) : [];
  c.water = Array.isArray(c.water) ? c.water : [];
  // the plan's water polygons the ball can splash into: the river, the lake and this hole's hazards
  c.waterPolys = shared.waterPolys.slice();
  if (ph && Array.isArray(ph.water)) for (const w of ph.water) if (w && Array.isArray(w.pts)) c.waterPolys.push(w.pts);
  c.waterways = shared.waterways;       // v11: the creek and the channel tile masks
  c.waterBodies = shared.waterBodies;   // v11: the river and the lake with their surface levels
  c.islands = shared.islands.filter(p => !c.island || p !== c.island.pts);
  if (!c.bounds) {
    const b = polyBounds(c.line);
    const pad = c.fairwayWidth / 2 + 4;
    c.bounds = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + 1 + pad, y1: b.y1 + 1 + pad };
  }
  c.sim = sim;
  c.parkBounds = shared.parkBounds;
  c.area = shared.area;
  c.net = null;
  c.kind = 'hole';
  c.length = Math.hypot(c.cup.x - c.tee.x, c.cup.y - c.tee.y);
  // the card length is the design's: tee tile to cup tile (HOLE_LENGTHS), ten yards per tile
  c.lengthTiles = ph && ph.tee && ph.cup && finite(ph.tee.x) && finite(ph.cup.x) ? Math.hypot(ph.cup.x - ph.tee.x, ph.cup.y - ph.tee.y) : c.length;
  c.yards = Math.round(c.lengthTiles * YARDS_PER_TILE);
  return c;
}
/* The range course from the sim record (teeLine, bounds, dir, markers) or the plan's range lot
   (canonical frame: the tee line along the canonical south edge hitting canonical north). */
function makeRangeCourse(r, pr, sim, terrain, shared) {
  const c = Object.assign({}, r || {});
  let dir = c.dir && finite(c.dir.x) ? { x: c.dir.x, y: finite(c.dir.y) ? c.dir.y : c.dir.z } : null;
  if ((!Array.isArray(c.teeLine) || !c.teeLine.length) && pr && finite(pr.x)) {
    const rot = pr.rot || 0, swap = Math.abs(((rot % 180) + 180) % 180 - 90) < 1e-6;
    const bw = swap ? pr.h : pr.w, bh = swap ? pr.w : pr.h;
    const cx = pr.x + bw / 2, cy = pr.y + bh / 2;
    const toWorld = (lx, ly) => { const d = rotVec(rot, lx - pr.w / 2, ly - pr.h / 2); return { x: cx + d.x, y: cy + d.y }; };
    c.teeLine = [];
    for (let lx = 1; lx < pr.w - 1; lx++) c.teeLine.push(toWorld(lx + 0.5, pr.h - 0.5));
    c.bounds = { x0: pr.x, y0: pr.y, x1: pr.x + bw, y1: pr.y + bh };
    c.rot = rot;
    dir = rotVec(rot, 0, -1);
    c.markers = [4, 7].filter(m => m <= pr.h - 1);
  }
  if (!Array.isArray(c.teeLine) || !c.teeLine.length) c.teeLine = [{ x: 57.5, y: 97.5 }];
  if (!c.bounds) { const t = c.teeLine[0]; c.bounds = { x0: t.x - 6, y0: t.y - 1, x1: t.x + 6, y1: t.y + 9 }; }
  if (!dir) dir = { x: 0, y: -1 };
  const dl = Math.hypot(dir.x, dir.y) || 1;
  c.dir = { x: dir.x / dl, y: dir.y / dl };
  c.sim = sim;
  c.terrain = terrain || c.terrain || null;
  c.parkBounds = c.bounds;
  c.area = null;
  c.cup = null;
  c.kind = 'range';
  c.waterPolys = shared.waterPolys;
  c.waterways = shared.waterways;
  c.waterBodies = shared.waterBodies;
  c.islands = shared.islands;
  // the tee line center and the depth to the far edge of the lot along the hitting direction
  let tx = 0, tz = 0;
  for (const t of c.teeLine) { tx += t.x; tz += t.y; }
  tx /= c.teeLine.length; tz /= c.teeLine.length;
  c.teeCenter = { x: tx, y: tz };
  const b = c.bounds;
  const far = c.dir.y < -0.5 ? (tz - b.y0) : c.dir.y > 0.5 ? (b.y1 - tz) : c.dir.x > 0.5 ? (b.x1 - tx) : (tx - b.x0);
  c.depth = Math.max(2, far);
  if (!Array.isArray(c.markers) || !c.markers.length) c.markers = [4, 7].filter(m => m <= c.depth - 1);
  const span = Math.max(2, c.teeLine.length + 1);
  c.net = {
    cx: tx + c.dir.x * (c.depth - 0.15), cz: tz + c.dir.y * (c.depth - 0.15), dx: c.dir.x, dz: c.dir.y,
    half: span / 2, span, hitD: -0.15, top: 6.0, height: 6.2, y: 0,
  };
  return c;
}

/* ---------- props ---------- */
function flagCanvas(n) {
  return (ctx, w, h) => {
    ctx.fillStyle = BRAND.salmon; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '600 64px Kanit, Inter, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), w - 10, h / 2 + 2);
  };
}
/* Flag: pole, base, finial and a hinged cloth whose far columns wave in update. opts.y is the ground. */
function buildFlag(parent, x, z, n, opts = {}) {
  const g = new THREE.Group();
  g.position.set(x, finite(opts.y) ? opts.y : 0, z);
  const poleH = opts.poleH || 2.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, poleH, 10), mat(C.trim, { roughness: 0.8 }));
  pole.position.y = poleH / 2; pole.castShadow = true; pole.receiveShadow = true; g.add(pole);
  cyl(0.07, 0.07, 0.02, mat(C.iron, { roughness: 0.55, metalness: 0.2 }), { parent: g, seg: 16 });
  sphere(0.04, mat(C.finial, { roughness: 0.3, metalness: 0.6 }), { y: poleH + 0.04, parent: g, ws: 16, hs: 12 });
  const cw = opts.clothW || 0.55, ch = opts.clothH || 0.36;
  const geo = new THREE.PlaneGeometry(cw, ch, 6, 1);
  geo.translate(cw / 2, 0, 0);
  const material = n === null
    ? new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.aqua), roughness: 0.9, side: THREE.DoubleSide })
    : (() => {
      const t = texOrNull(128, 84, flagCanvas(n));
      if (!t) return new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.salmon), roughness: 0.9, side: THREE.DoubleSide });
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide });
      repaints.push(() => { flagCanvas(n)(t.image.getContext('2d'), 128, 84); t.needsUpdate = true; });
      return m;
    })();
  material.userData.envMapIntensity = 0.25;
  const cloth = new THREE.Mesh(geo, material);
  cloth.castShadow = false; cloth.receiveShadow = false;
  const hinge = new THREE.Group();
  hinge.position.y = poleH - ch / 2;
  hinge.add(cloth);
  g.add(hinge);
  parent.add(g);
  const pa = geo.getAttribute('position');
  const base = new Float32Array(pa.array);
  return { group: g, pole, hinge, cloth, geo, base, baseYaw: opts.baseYaw === undefined ? 0.9 : opts.baseYaw, n, x, z, y: g.position.y };
}
/* Cup: dark disc, white rim ring and a shallow open cylinder below the ground (y). */
function buildCup(parent, x, z, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const dark = mat(C.cupDark, { roughness: 0.95, doubleSide: true });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), dark);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012; disc.receiveShadow = true; g.add(disc);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.22, 24), mat(C.trim, { roughness: 0.8 }));
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.014; rim.receiveShadow = true; g.add(rim);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 24, 1, true), new THREE.MeshStandardMaterial({ color: new THREE.Color(C.cupDark), roughness: 0.95, side: THREE.BackSide }));
  wall.position.y = -0.03; g.add(wall);
  parent.add(g);
  return g;
}
/* Tee marker: a navy post with a Thread colored ball (aqua on one side of the tee, salmon on the other). */
function buildTeeMarker(parent, x, z, y = 0, hex = BRAND.aqua) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.name = 'tee-marker';
  cyl(0.03, 0.035, 0.12, mat(BRAND.navy, { roughness: 0.7 }), { parent: g, seg: 10 });
  sphere(0.1, mat(hex, { roughness: 0.55 }), { y: 0.21, parent: g, ws: 16, hs: 12 });
  parent.add(g);
  return g;
}
/* Hole sign: number and name on the first line, par and yards on the second, the tee elevation
   on a third when the tee is raised. The face (local +z) looks at (faceX, faceZ). */
function buildHoleSign(parent, x, z, hole, faceX, faceZ, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.name = 'hole-sign';
  g.rotation.y = Math.atan2(faceX - x, faceZ - z);
  box(0.06, 1.3, 0.06, mat(C.woodDark, { roughness: 0.8 }), { x: -0.38, parent: g });
  box(0.06, 1.3, 0.06, mat(C.woodDark, { roughness: 0.8 }), { x: 0.38, parent: g });
  box(1.0, 0.56, 0.04, mat(BRAND.navy, { roughness: 0.9 }), { y: 0.72, parent: g });
  box(1.0, 0.04, 0.045, mat(BRAND.salmon, { roughness: 0.9 }), { y: 0.73, parent: g });
  const line1 = 'Hole ' + hole.n + (hole.name ? ' · ' + hole.name : '');
  const line2 = 'Par ' + hole.par + ' · ' + hole.yards + ' yd';
  const line3 = hole.tee && finite(hole.tee.elev) && hole.tee.elev >= 0.3 ? 'Elevated tee +' + (Math.round(hole.tee.elev * 10) / 10) : '';
  const face = texMat(512, 288, (ctx, w, h) => {
    ctx.fillStyle = BRAND.navy; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 64px Kanit, Inter, sans-serif'; ctx.fillText(line1, w / 2, 70);
    ctx.fillStyle = BRAND.aqua; ctx.fillRect(w / 2 - 70, 118, 140, 5);
    ctx.fillStyle = BRAND.silver; ctx.font = '500 52px Inter, sans-serif'; ctx.fillText(line2, w / 2, 172);
    if (line3) { ctx.fillStyle = BRAND.aqua; ctx.font = '500 34px Inter, sans-serif'; ctx.fillText(line3, w / 2, 236); }
  }, BRAND.navy);
  plane(0.96, 0.52, face, { y: 1.0, z: 0.021, parent: g, receiveShadow: false });
  parent.add(g);
  g.userData.lines = [line1, line2, line3];
  return g;
}
/* Yardage plate: a low disc flush with the fairway, 150 in aqua and 100 in salmon, with the number on top. */
function buildYardagePlate(parent, x, z, yards, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.name = 'yardage-plate';
  const hex = yards >= 150 ? BRAND.aqua : BRAND.salmon;
  cyl(0.34, 0.36, 0.06, mat(hex, { roughness: 0.7 }), { parent: g, seg: 20 });
  const face = texMat(128, 128, (ctx, w, h) => {
    ctx.fillStyle = hex; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = yards >= 150 ? BRAND.navy : '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 56px Kanit, Inter, sans-serif'; ctx.fillText(String(yards), w / 2, h / 2 + 2);
  }, hex);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), face);
  top.rotation.x = -Math.PI / 2; top.position.y = 0.062; top.receiveShadow = true; g.add(top);
  parent.add(g);
  g.userData.yards = yards;
  return g;
}
function buildBallWasher(parent, x, z, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  cyl(0.04, 0.04, 0.8, iron, { parent: g, seg: 12 });
  cyl(0.12, 0.12, 0.28, mat(BRAND.salmon, { roughness: 0.6 }), { y: 0.76, parent: g, seg: 16 });
  cyl(0.13, 0.13, 0.03, mat(BRAND.silver, { roughness: 0.5, metalness: 0.2 }), { y: 1.04, parent: g, seg: 16 });
  rod(0.13, 0.9, 0, 0.23, 0.9, 0, 0.012, iron, g);
  rod(0.23, 0.9, 0, 0.23, 1.0, 0, 0.012, iron, g);
  plane(0.16, 0.26, mat(C.trim, { roughness: 0.95, doubleSide: true }), { y: 0.65, z: 0.1, parent: g, receiveShadow: false });
  parent.add(g);
  return g;
}
/* The art direction bench, facing yaw (local +z is the seat front), standing at ground y. */
function buildBench(parent, x, z, yaw, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const wood = mat(C.wood, { roughness: 0.8 }), iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  box(1.0, 0.06, 0.17, wood, { y: 0.42, z: 0.095, parent: g });
  box(1.0, 0.06, 0.17, wood, { y: 0.42, z: -0.095, parent: g });
  const back = box(1.0, 0.30, 0.05, wood, { y: 0.47, z: -0.16, parent: g });
  back.rotation.x = -0.15;
  box(0.06, 0.42, 0.34, iron, { x: -0.42, parent: g });
  box(0.06, 0.42, 0.34, iron, { x: 0.42, parent: g });
  parent.add(g);
  return g;
}
function buildPlanter(parent, x, z, y = 0) {
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.3, 0.5, 2, 0.06), mat(C.woodDark, { roughness: 0.8 }));
  base.position.set(x, y + 0.15, z); base.castShadow = true; base.receiveShadow = true; parent.add(base);
  dome(0.22, mat(C.hedge, { roughness: 0.9 }), { x, y: y + 0.3, z, parent });
}
/* Club heads shared by the bag stand (the renderer builds the player's prop with the same shapes). */
function clubHead(kind) {
  if (kind === 'driver') return new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.075, 0.07, 2, 0.02), mat(BRAND.navy, { roughness: 0.5, metalness: 0.2 }));
  if (kind === 'iron') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.015), mat(BRAND.silver, { roughness: 0.4, metalness: 0.2 })); m.rotation.y = 0.45; return m; }
  return new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.035), mat(BRAND.aqua, { roughness: 0.5, metalness: 0.2 }));
}
function buildBagStand(parent, x, z, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  for (let i = 0; i < 3; i++) {
    const a = i * 2 * Math.PI / 3;
    rod(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17, Math.cos(a) * 0.04, 0.9, Math.sin(a) * 0.04, 0.02, iron, g);
  }
  const bag = new THREE.Group(); bag.rotation.z = 0.2; bag.position.set(0.05, 0, 0);
  cyl(0.14, 0.14, 0.8, mat(BRAND.navy, { roughness: 0.9 }), { parent: bag, seg: 16 });
  cyl(0.145, 0.145, 0.08, mat(BRAND.salmon, { roughness: 0.9 }), { y: 0.51, parent: bag, seg: 16 });
  box(0.12, 0.16, 0.02, mat(BRAND.silver, { roughness: 0.6 }), { y: 0.25, z: 0.14, parent: bag });
  const shafts = ['driver', 'iron', 'putter'];
  for (let i = 0; i < 3; i++) {
    const sx = (i - 1) * 0.06;
    cyl(0.012, 0.012, 0.5, mat(BRAND.silver, { roughness: 0.4, metalness: 0.2 }), { x: sx, y: 0.78, z: (i - 1) * 0.03, parent: bag, seg: 8 });
    const head = clubHead(shafts[i]);
    head.position.set(sx, 1.3, (i - 1) * 0.03); head.castShadow = true; bag.add(head);
  }
  g.add(bag);
  parent.add(g);
  return g;
}
/* The scorecard board by the clubhouse door: the course name, the nine holes in two columns,
   the par and the length. yaw: the face (local +z). */
function buildScorecardBoard(parent, x, z, yaw, holes, name, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const dark = mat(C.woodDark, { roughness: 0.8 });
  box(0.06, 1.5, 0.06, dark, { x: -0.5, parent: g });
  box(0.06, 1.5, 0.06, dark, { x: 0.5, parent: g });
  box(1.3, 0.9, 0.04, mat(BRAND.navy, { roughness: 0.9 }), { y: 0.6, parent: g });
  let par = 0, yards = 0;
  for (const h of holes) { par += h.par; yards += h.yards; }
  const face = texMat(640, 448, (ctx, w, h) => {
    ctx.fillStyle = BRAND.navy; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 58px Kanit, Inter, sans-serif'; ctx.fillText(name, w / 2, 52);
    ctx.fillStyle = BRAND.aqua; ctx.fillRect(w / 2 - 80, 92, 160, 5);
    ctx.fillStyle = BRAND.silver; ctx.font = '500 30px Inter, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i < holes.length; i++) {
      const hh = holes[i], col = i < 5 ? 0 : 1, row = i < 5 ? i : i - 5;
      const cx = col === 0 ? 48 : 340, cy = 136 + row * 46;
      ctx.fillStyle = BRAND.silver; ctx.fillText(hh.n + '  ' + hh.name, cx, cy);
      ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'right'; ctx.fillText('Par ' + hh.par + '  ' + hh.yards, cx + 250, cy);
      ctx.textAlign = 'left';
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = '600 36px Inter, sans-serif';
    ctx.fillText('Par ' + par + ' · ' + yards.toLocaleString('en-US') + ' yd', w / 2, 400);
  }, BRAND.navy);
  plane(1.26, 0.86, face, { y: 1.05, z: 0.021, parent: g, receiveShadow: false });
  parent.add(g);
  return g;
}
/* Sign band with the course name: hangs on the clubhouse door face (local +z), yaw = the facing. */
function buildSignBand(parent, x, y, z, yaw, name) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; g.name = 'clubhouse-sign';
  box(2.8, 0.34, 0.04, mat(BRAND.navy, { roughness: 0.9 }), { y: -0.17, parent: g });
  box(2.0, 0.04, 0.045, mat(BRAND.aqua, { roughness: 0.9 }), { y: -0.17, parent: g });
  const face = texMat(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = BRAND.navy; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 84px Kanit, Inter, sans-serif'; ctx.fillText(name, w / 2, h / 2 + 4);
  }, BRAND.navy);
  plane(2.7, 0.3, face, { z: 0.021, parent: g, receiveShadow: false });
  parent.add(g);
  g.userData.text = name;
  return g;
}
/* The entrance sign on the links road: two stone posts, a navy board with the course name and
   the par line, a salmon rule. The face (local +z) looks along yaw. */
function buildEntranceSign(parent, x, z, yaw, name, holes, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; g.name = 'entrance-sign';
  const stone = mat('#9AA3A8', { roughness: 0.95 });
  box(0.36, 1.7, 0.36, stone, { x: -1.5, parent: g });
  box(0.36, 1.7, 0.36, stone, { x: 1.5, parent: g });
  box(0.42, 0.08, 0.42, mat(BRAND.navy, { roughness: 0.8 }), { x: -1.5, y: 1.7, parent: g });
  box(0.42, 0.08, 0.42, mat(BRAND.navy, { roughness: 0.8 }), { x: 1.5, y: 1.7, parent: g });
  box(2.7, 0.9, 0.08, mat(BRAND.navy, { roughness: 0.9 }), { y: 0.78, parent: g });
  box(2.7, 0.05, 0.09, mat(BRAND.salmon, { roughness: 0.9 }), { y: 1.62, parent: g });
  let par = 0;
  for (const h of holes) par += h.par;
  const line2 = holes.length + ' holes · Par ' + par;
  const face = texMat(1024, 352, (ctx, w, h) => {
    ctx.fillStyle = BRAND.navy; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 128px Kanit, Inter, sans-serif'; ctx.fillText(name, w / 2, 130);
    ctx.fillStyle = BRAND.aqua; ctx.fillRect(w / 2 - 110, 212, 220, 6);
    ctx.fillStyle = BRAND.silver; ctx.font = '500 62px Inter, sans-serif'; ctx.fillText(line2, w / 2, 286);
  }, BRAND.navy, { doubleSide: true });
  plane(2.6, 0.84, face, { y: 1.23, z: 0.045, parent: g, receiveShadow: false });
  plane(2.6, 0.84, face, { y: 1.23, z: -0.045, parent: g, receiveShadow: false, ry: Math.PI });
  parent.add(g);
  g.userData.text = name;
  g.userData.line2 = line2;
  return g;
}
function buildPennants(parent, ax, ay, az, bx, by, bz) {
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  rod(ax, ay, az, bx, by, bz, 0.01, iron, parent);
  const cols = [BRAND.salmon, BRAND.aqua, BRAND.silver];
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, 0, -0.12, 0], 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat(cols[i], { roughness: 0.9, doubleSide: true }));
    m.position.set(x, y - 0.005, z);
    m.rotation.y = Math.atan2(bz - az, bx - ax) + Math.PI / 2;
    m.castShadow = false; m.receiveShadow = false;
    parent.add(m);
  }
}
function stripeMat() {
  return texMat(512, 128, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#FFFFFF' : BRAND.aqua; ctx.fillRect(i * w / 8, 0, w / 8, h); }
  }, BRAND.aqua, { doubleSide: true });
}
function buildShelter(parent, x, z, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.45, 0.45]) cyl(0.03, 0.03, 2.2, iron, { x: sx, z: sz, parent: g, seg: 10 });
  const awn = plane(1.3, 1.0, stripeMat(), { y: 2.2, parent: g, castShadow: true, receiveShadow: false });
  awn.rotation.x = -Math.PI / 2 + 0.2;
  parent.add(g);
  return g;
}
function buildDistanceMarker(parent, x, z, label, yaw, y = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  box(0.06, 1.0, 0.06, mat(C.woodDark, { roughness: 0.8 }), { parent: g });
  box(0.8, 0.4, 0.04, mat(BRAND.navy, { roughness: 0.9 }), { y: 0.9, parent: g });
  const face = texMat(256, 128, (ctx, w, h) => {
    ctx.fillStyle = BRAND.navy; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 84px Kanit, Inter, sans-serif'; ctx.fillText(label, w / 2, h / 2 + 4);
  }, BRAND.navy);
  plane(0.76, 0.36, face, { y: 1.1, z: 0.021, parent: g, receiveShadow: false });
  parent.add(g);
  return g;
}
function buildRangeMat(parent, x, z, y = 0) {
  box(0.8, 0.02, 0.6, mat(C.mat, { roughness: 0.95 }), { x, y, z, parent, castShadow: false });
  cyl(0.03, 0.03, 0.03, mat(C.trim, { roughness: 0.8 }), { x, y: y + 0.02, z, parent, seg: 10, castShadow: false });
  const bx = x + 0.35, bz = z + 0.35;
  cyl(0.16, 0.16, 0.22, mat(C.iron, { roughness: 0.55, metalness: 0.2 }), { x: bx, y, z: bz, parent, seg: 16 });
  const white = mat(C.white, { roughness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, r = i ? 0.09 : 0;
    sphere(0.05, white, { x: bx + Math.cos(a) * r, y: y + 0.26, z: bz + Math.sin(a) * r, parent, ws: 12, hs: 8, castShadow: false });
  }
}
/* The range net stands at net.y (its ground height; stepBall raises net.top by the same amount)
   across the hitting direction; the yardage banner faces the tee line. */
function buildNet(parent, net, depthYards) {
  const g = new THREE.Group();
  g.position.set(net.cx, finite(net.y) ? net.y : 0, net.cz);
  g.rotation.y = Math.atan2(net.dx, net.dz);
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const span = net.span;
  const postXs = [-span / 2, -span / 6, span / 6, span / 2];
  for (const px of postXs) cyl(0.06, 0.06, net.height, iron, { x: px, parent: g, seg: 12 });
  const rail = cyl(0.03, 0.03, span, iron, { parent: g, seg: 10 });
  rail.rotation.z = Math.PI / 2; rail.position.set(0, net.height - 0.1, 0);
  const t = texOrNull(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(46, 62, 80, 0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0.75, 0); ctx.lineTo(0.75, h); ctx.moveTo(0, 0.75); ctx.lineTo(w, 0.75); ctx.stroke();
  });
  let nm;
  if (t) {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.round(span * 2.6), 11);
    nm = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true });
  } else nm = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.iron), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, net.top - 0.4), nm);
  mesh.position.set(0, (net.top - 0.4) / 2 + 0.4, 0);
  mesh.castShadow = false; mesh.receiveShadow = false;
  g.add(mesh);
  const label = String(depthYards);
  const banner = texMat(512, 192, (ctx, w, h) => {
    ctx.fillStyle = BRAND.navy; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 120px Kanit, Inter, sans-serif'; ctx.fillText(label, w / 2, h / 2 + 6);
  }, BRAND.navy, { doubleSide: true });
  const bn = plane(1.6, 0.6, banner, { y: net.height - 0.45, z: -0.02, parent: g, receiveShadow: false });
  bn.rotation.y = Math.PI;
  parent.add(g);
  return g;
}
/* Cart paths: gravel ribbons one tile wide along the plan's cartpath splines, at the terrain
   height plus a hair (the ground paints the base, roads.js may draw its own; ctx.cartPaths false
   skips these). Merged into one mesh. */
function buildCartPaths(parent, roads, hAt, width) {
  const geos = [];
  const hw = (width || 1) / 2 - 0.05;
  let length = 0;
  for (const r of roads) {
    const s = splineSamples(r.pts, 0.5);
    if (s.length < 2) continue;
    const pos = [], idx = [];
    for (let i = 0; i < s.length; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = -dz, nz = dx;
      const x = s[i][0], z = s[i][1];
      if (i) length += Math.hypot(x - s[i - 1][0], z - s[i - 1][1]);
      const yl = Math.max(hAt(x + nx * hw, z + nz * hw), -0.45) + 0.045, yr = Math.max(hAt(x - nx * hw, z - nz * hw), -0.45) + 0.045;
      pos.push(x + nx * hw, yl, z + nz * hw, x - nx * hw, yr, z - nz * hw);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  if (!geos.length) return { mesh: null, length: 0 };
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  const m = new THREE.Mesh(merged, mat(C.gravel, { roughness: 1.0, doubleSide: true }));
  m.name = 'cart-paths'; m.castShadow = false; m.receiveShadow = true;
  parent.add(m);
  return { mesh: m, length };
}
/* Green contours: two rings on every green hugging the terrain, one LineSegments for the course. */
function buildContours(parent, holes, hAt, islandY) {
  const pos = [];
  for (const h of holes) {
    for (const f of [0.45, 0.8]) {
      const n = 36;
      for (let i = 0; i < n; i++) {
        for (const k of [i, i + 1]) {
          const a = k / n * Math.PI * 2;
          const x = h.greenCenter.x + Math.cos(a) * h.greenRx * f, z = h.greenCenter.y + Math.sin(a) * h.greenRy * f;
          pos.push(x, islandY(h, x, z) + 0.025, z);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(C.contour), transparent: true, opacity: 0.55 }));
  m.name = 'green-contours';
  parent.add(m);
  return m;
}
/* The island's sand collar: a flat ring between the green and collarR at the island height. */
function buildCollar(parent, h, y) {
  const inner = Math.max(h.greenRx, h.greenRy) + 0.05;
  const outer = h.collarR;
  if (!(outer > inner)) return null;
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), mat(C.sand, { roughness: 1.0 }));
  m.rotation.x = -Math.PI / 2; m.position.set(h.greenCenter.x, y + 0.02, h.greenCenter.y);
  m.receiveShadow = true; m.castShadow = false; m.name = 'sand-collar';
  parent.add(m);
  return m;
}

/* ---------- balls ---------- */
const ballGeo = new THREE.SphereGeometry(BALL_R, 16, 12);
const trailGeo = new THREE.SphereGeometry(0.05, 8, 6);
function makeBall(group, id) {
  const mesh = new THREE.Mesh(ballGeo, mat(C.white, { roughness: 0.5 }));
  mesh.castShadow = true; mesh.receiveShadow = false; mesh.visible = false;
  group.add(mesh);
  const trail = [];
  for (let i = 0; i < TRAIL_N; i++) {
    const m = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.white), transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; m.castShadow = false; m.receiveShadow = false;
    group.add(m);
    trail.push({ mesh: m, age: TRAIL_LIFE, active: false });
  }
  return {
    id, mesh, trail, trailTimer: 0, trailNext: 0,
    pos: new THREE.Vector3(0, BALL_R, 0), vel: new THREE.Vector3(),
    launch: new THREE.Vector3(0, BALL_R, 0), lastRest: new THREE.Vector3(0, BALL_R, 0),
    rolling: false, resting: true, holed: false, landed: true, carry: 0, lipOut: false, hitNet: false,
    inWater: false, creepT: 0, drop: { x: 0, z: 0 },
    hole: null, strokes: 0, club: 'driver', active: false,
  };
}
/* The lowest ground under a footprint (half sizes hx, hz about x, z): the anchor for a prop wider
   than a point, so nothing sits under the terrain on a blend ring (TERRAIN_DESIGN "Placement rules"). */
function groundMin(hAt, x, z, hx, hz) {
  let y = hAt(x, z);
  if (hx > 0 || hz > 0) {
    y = Math.min(y, hAt(x - hx, z - hz), hAt(x + hx, z - hz), hAt(x - hx, z + hz), hAt(x + hx, z + hz));
  }
  return finite(y) ? y : 0;
}

/* ---------- build ---------- */
/* buildGolf({ THREE, state, sim, plan?, heightAt?, terrain?, cartPaths? }). heightAt(x, z) is the
   terrain height the renderer supplies (default flat 0): every flag, cup, marker, sign, plate,
   bench, mat and the net stand at it. terrain (optional, the renderer's { heightAt, slopeAt,
   normalAt }) is attached to every course as course.terrain. plan (optional) is the city plan;
   without it the sim's PLAN or window.TT.PLAN is read for the hole names, tee elevations, the
   island, the cart paths, the entrance sign and the course name. cartPaths: false skips the
   cart path ribbons (when roads.js draws them). */
export function buildGolf(ctx) {
  const state = (ctx && ctx.state) || {};
  const sim = (ctx && ctx.sim) || simOf(null);
  const plan = planOf(ctx, sim);
  const pg = plan && plan.golf ? plan.golf : null;
  const golfState = state.golf || {};
  const terrain = (ctx && ctx.terrain && typeof ctx.terrain.heightAt === 'function') ? ctx.terrain : null;
  const rawH = (ctx && typeof ctx.heightAt === 'function') ? ctx.heightAt : (terrain ? (x, z) => terrain.heightAt(x, z) : null);
  const hAt = rawH ? (x, z) => { const y = rawH(x, z); return finite(y) ? y : 0; } : () => 0;
  const group = new THREE.Group();
  group.name = 'golf';
  const name = (typeof golfState.name === 'string' && golfState.name) || (pg && typeof pg.name === 'string' && pg.name) || COURSE_NAME;

  // Shared course data: the links polygon, the park rect, the plan's water and the islands.
  const area = Array.isArray(golfState.area) && golfState.area.length >= 3 ? golfState.area.map(p => [p[0], p[1]])
    : (pg && pg.area && Array.isArray(pg.area.pts) ? pg.area.pts.map(p => [p[0], p[1]]) : null);
  let parkBounds = golfState.parkBounds && finite(golfState.parkBounds.x0) ? golfState.parkBounds : null;
  if (!parkBounds && area) {
    const b = polyBounds(area);
    const cols = (sim && sim.COLS) || (plan && plan.cols) || PARK_BOUNDS.x1, rows = (sim && sim.ROWS) || (plan && plan.rows) || PARK_BOUNDS.y1;
    parkBounds = { x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(cols, b.x1), y1: Math.min(rows, b.y1) };
  }
  if (!parkBounds) parkBounds = PARK_BOUNDS;
  const waterPolys = [];
  if (plan && Array.isArray(plan.water)) for (const w of plan.water) if (w && Array.isArray(w.pts) && w.pts.length >= 3) waterPolys.push(w.pts);
  const planHoles = pg && Array.isArray(pg.holes) ? pg.holes : [];
  const islands = [];
  for (const ph of planHoles) if (ph && ph.island && Array.isArray(ph.island.pts)) islands.push(ph.island.pts);
  // v11: the waterway masks from the raster (the renderer's ctx.raster, else the sim's, else the
  // plan rasterized here) and the river and lake surfaces (terrain.water, else the design levels)
  let raster = (ctx && ctx.raster) || (sim && sim.raster) || null;
  if (!raster && plan && Array.isArray(plan.waterways) && plan.waterways.length) { try { raster = rasterizePlan(plan); } catch (e) { raster = null; } }
  const waterways = [];
  if (raster && Array.isArray(raster.waterways)) for (const w of raster.waterways) if (w && w.mask) waterways.push({ id: w.id, body: w.body, level: finite(w.level) ? w.level : WATER_SURFACE_DEFAULT.lake, mask: w.mask, cols: raster.cols, rows: raster.rows });
  const terrainWater = terrain && Array.isArray(terrain.water) ? terrain.water : null;
  const waterBodies = [];
  if (plan && Array.isArray(plan.water)) for (const w of plan.water) {
    if (!w || !Array.isArray(w.pts) || w.pts.length < 3) continue;
    const tw = terrainWater ? terrainWater.find(t => t && t.id === w.id && finite(t.surface)) : null;
    const surface = tw ? tw.surface : (finite(WATER_SURFACE_DEFAULT[w.id]) ? WATER_SURFACE_DEFAULT[w.id] : (finite(WATER_SURFACE_DEFAULT[w.kind]) ? WATER_SURFACE_DEFAULT[w.kind] : WATER_SURFACE_DEFAULT.lake));
    waterBodies.push({ id: w.id, pts: w.pts, surface });
  }
  const shared = { area, parkBounds, waterPolys, islands, waterways, waterBodies };

  // Courses: the sim's hole records merged with the plan's holes by number.
  const srcHoles = Array.isArray(golfState.holes) && golfState.holes.length ? golfState.holes : planHoles.map(() => null);
  const holes = srcHoles.map((h, i) => {
    const n = h && finite(h.n) ? h.n : i + 1;
    const ph = planHoles.find(p => p && p.n === n) || planHoles[i] || null;
    const c = makeHoleCourse(h, ph, i, sim, terrain, shared);
    if (c.island) c.islands = islands.filter(p => p !== ph.island.pts);
    return c;
  });
  const range = makeRangeCourse(golfState.range, pg && pg.range, sim, terrain, shared);
  const clubhouse = Object.assign({}, state.clubhouse || golfState.clubhouse || {});
  if (!finite(clubhouse.x) && pg && pg.clubhouse) {
    const cb = pg.clubhouse, rot = cb.rot || 0, swap = Math.abs(((rot % 180) + 180) % 180 - 90) < 1e-6;
    Object.assign(clubhouse, { x: cb.x, y: cb.y, w: swap ? cb.h : cb.w, h: swap ? cb.w : cb.h, rot, kind: 'clubhouse', name: 'Clubhouse' });
  }
  if (!finite(clubhouse.x)) Object.assign(clubhouse, { x: 69, y: 102, w: 6, h: 4, rot: 180 });
  // the clubhouse frame: center, facing (the door face, local +z) and the canonical width and depth
  const cbRot = finite(clubhouse.rot) ? clubhouse.rot : 0;
  const cbSwap = Math.abs(((cbRot % 180) + 180) % 180 - 90) < 1e-6;
  const cbW = cbSwap ? clubhouse.h : clubhouse.w, cbD = cbSwap ? clubhouse.w : clubhouse.h;
  const cbC = { x: clubhouse.x + clubhouse.w / 2, y: clubhouse.y + clubhouse.h / 2 };
  const cbFacing = rotVec(cbRot, 0, 1);
  const cbYaw = Math.atan2(cbFacing.x, cbFacing.y);
  const cbLocal = (lx, lz) => { const d = rotVec(cbRot, lx, lz); return { x: cbC.x + d.x, z: cbC.y + d.y }; };
  if (!clubhouse.practiceGreen) {
    const pc = cbLocal(-cbW / 2 - 1.0, cbD / 2 + 6.5), pcup = cbLocal(-cbW / 2 - 0.5, cbD / 2 + 6.5);
    clubhouse.practiceGreen = { center: { x: pc.x, y: pc.z }, rx: 2.2, ry: 2.0, cup: { x: pcup.x, y: pcup.z } };
  }
  const islandY = (h, x, z) => (h.island ? Math.max(hAt(x, z), h.island.height) : hAt(x, z));

  const flags = [];
  const cups = [];
  const markers = [];
  const signs = [];
  const plates = [];
  const collars = [];
  // Holes: flag, cup, two tee markers, the hole sign, yardage plates, a bench and a ball washer.
  for (const h of holes) {
    const cupY = islandY(h, h.cup.x, h.cup.y);
    const f = buildFlag(group, h.cup.x, h.cup.y, h.n, { y: cupY });
    f.hole = h; h.flag = f; flags.push(f);
    h.cupMesh = buildCup(group, h.cup.x, h.cup.y, cupY); cups.push(h.cupMesh);
    h.cupY = cupY;
    if (h.island && finite(h.collarR)) { const c = buildCollar(group, h, cupY); if (c) collars.push(c); }
    // the line of play off the tee: toward the first polyline point past the tee, else the cup
    let dx = h.cup.x - h.tee.x, dz = h.cup.y - h.tee.y;
    if (h.line.length > 1) { const p = h.line[1]; const ex = p[0] + 0.5 - h.tee.x, ez = p[1] + 0.5 - h.tee.y; if (Math.hypot(ex, ez) > 1) { dx = ex; dz = ez; } }
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const px = -dz, pz = dx;
    const m1 = { x: h.tee.x + px * 0.75, z: h.tee.y + pz * 0.75 }, m2 = { x: h.tee.x - px * 0.75, z: h.tee.y - pz * 0.75 };
    h.markers = [m1, m2];
    markers.push(buildTeeMarker(group, m1.x, m1.z, hAt(m1.x, m1.z), BRAND.aqua));
    markers.push(buildTeeMarker(group, m2.x, m2.z, hAt(m2.x, m2.z), BRAND.salmon));
    const sx = h.tee.x - dx * 1.7 + px * 0.9, sz = h.tee.y - dz * 1.7 + pz * 0.9;
    h.sign = { x: sx, z: sz };
    const sign = buildHoleSign(group, sx, sz, h, h.tee.x, h.tee.y, groundMin(hAt, sx, sz, 0.5, 0.5));
    sign.userData.hole = h.n; signs.push(sign);
    const bx = h.tee.x - dx * 1.2 - px * 1.8, bz = h.tee.y - dz * 1.2 - pz * 1.8;
    buildBench(group, bx, bz, Math.atan2(dx, dz), groundMin(hAt, bx, bz, 0.5, 0.2));
    const wx = h.tee.x - dx * 1.7 - px * 0.9, wz = h.tee.y - dz * 1.7 - pz * 0.9;
    buildBallWasher(group, wx, wz, hAt(wx, wz));
    // yardage plates on the par 4s and 5s, just inside the left edge of the fairway
    h.plates = [];
    if (h.par >= 4) {
      const lineLen = polylineLength(h.line);
      for (const yd of PLATE_YARDS) {
        const tiles = yd / YARDS_PER_TILE;
        if (lineLen < tiles + 2) continue;
        const p = pointBackFromCup(h.line, tiles);
        if (!p) continue;
        const off = Math.max(0.6, h.fairwayWidth / 2 - 0.7);
        const qx = p.x + (-p.dz) * off, qz = p.z + p.dx * off;
        const plate = buildYardagePlate(group, qx, qz, yd, hAt(qx, qz));
        plate.userData.hole = h.n;
        plates.push(plate);
        h.plates.push({ yards: yd, x: qx, z: qz });
      }
    }
  }
  const contours = buildContours(group, holes, hAt, islandY);

  // Cart paths along the plan's cartpath splines.
  const cartRoads = plan && Array.isArray(plan.roads) ? plan.roads.filter(r => r && r.kind === 'cartpath' && Array.isArray(r.pts) && r.pts.length >= 2) : [];
  const cartPaths = (ctx && ctx.cartPaths === false) ? { mesh: null, length: 0 } : buildCartPaths(group, cartRoads, hAt, 1);
  cartPaths.roads = cartRoads.map(r => r.id);

  // Clubhouse porch dressing in the building's frame (local +x across the door face, +z out of the door).
  const signP = cbLocal(0, cbD / 2 + 0.18);
  const signY = hAt(signP.x, signP.z);
  const clubhouseSign = buildSignBand(group, signP.x, signY + 2.06, signP.z, cbYaw, name);
  const bagP = cbLocal(-cbW / 2 + 0.6, cbD / 2 + 1.0);
  buildBagStand(group, bagP.x, bagP.z, groundMin(hAt, bagP.x, bagP.z, 0.2, 0.2));
  const boardP = cbLocal(cbW / 2 - 0.8, cbD / 2 + 1.0);
  const boardY = groundMin(hAt, boardP.x, boardP.z, 0.6, 0.1);
  const scoreBoard = buildScorecardBoard(group, boardP.x, boardP.z, cbYaw, holes, name, boardY);
  for (const lx of [-cbW / 2 + 1.5, cbW / 2 - 1.5]) { const p = cbLocal(lx, cbD / 2 - 0.1); buildPlanter(group, p.x, p.z, groundMin(hAt, p.x, p.z, 0.25, 0.25)); }
  const washP = cbLocal(cbW / 2 - 1.5, cbD / 2 + 1.9);
  buildBallWasher(group, washP.x, washP.z, hAt(washP.x, washP.z));
  const benchP = cbLocal(cbW / 2 - 0.5, cbD / 2 + 2.1);
  buildBench(group, benchP.x, benchP.z, cbYaw, groundMin(hAt, benchP.x, benchP.z, 0.5, 0.2));
  const penA = cbLocal(-1.3, cbD / 2 + 0.21), penB = cbLocal(cbW / 2 - 1.1, cbD / 2 + 1.0);
  buildPennants(group, penA.x, signY + 2.04, penA.z, penB.x, boardY + 1.5, penB.z);
  // Practice green pin and cup, benches either side of the practice green.
  const pgn = clubhouse.practiceGreen;
  const practiceCourse = { kind: 'practice', name: 'Practice green', cup: pgn.cup, greenCenter: pgn.center, greenRx: pgn.rx, greenRy: pgn.ry, greenR: Math.max(pgn.rx, pgn.ry), sim, terrain, bounds: { x0: pgn.center.x - pgn.rx - 6, y0: pgn.center.y - pgn.ry - 6, x1: pgn.center.x + pgn.rx + 6, y1: pgn.center.y + pgn.ry + 6 }, parkBounds: null, area: null, net: null, waterPolys, islands, waterways, waterBodies };
  practiceCourse.parkBounds = practiceCourse.bounds;
  const pgY = hAt(pgn.cup.x, pgn.cup.y);
  const pin = buildFlag(group, pgn.cup.x, pgn.cup.y, null, { poleH: 1.2, clothW: 0.4, clothH: 0.26, y: pgY });
  pin.hole = practiceCourse; flags.push(pin);
  buildCup(group, pgn.cup.x, pgn.cup.y, pgY);
  practiceCourse.cupY = pgY;
  const pbE = { x: pgn.center.x + pgn.rx + 1.0, z: pgn.center.y }, pbW = { x: pgn.center.x - pgn.rx - 1.0, z: pgn.center.y };
  buildBench(group, pbE.x, pbE.z, -Math.PI / 2, groundMin(hAt, pbE.x, pbE.z, 0.2, 0.5));
  buildBench(group, pbW.x, pbW.z, Math.PI / 2, groundMin(hAt, pbW.x, pbW.z, 0.2, 0.5));

  // The entrance sign on the links road: the plan's point pushed off the road toward the links,
  // facing the road. Without a road nearby it stands at the point facing north.
  let entranceSign = null;
  {
    const es = pg && pg.entranceSign && finite(pg.entranceSign.x) ? pg.entranceSign : { x: 64, y: 93 };
    let ex = es.x + 0.5, ez = es.y + 0.5;
    let fx = 0, fz = -1;
    const roads = plan && Array.isArray(plan.roads) ? plan.roads.filter(r => r && r.kind !== 'cartpath' && Array.isArray(r.pts) && r.pts.length >= 2) : [];
    let best = null, bd = Infinity;
    for (const r of roads) {
      const s = splineSamples(r.pts, 0.5);
      for (let i = 0; i < s.length; i++) {
        const d = Math.hypot(s[i][0] - ex, s[i][1] - ez);
        if (d < bd) { bd = d; best = { s, i, r }; }
      }
    }
    if (best && bd < 6) {
      const s = best.s, i = best.i;
      const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      // the side of the road the links are on: toward the park rect center, else south
      const cx = (parkBounds.x0 + parkBounds.x1) / 2, cz = (parkBounds.y0 + parkBounds.y1) / 2;
      let nx = -tz, nz = tx;
      if ((cx - s[i][0]) * nx + (cz - s[i][1]) * nz < 0) { nx = -nx; nz = -nz; }
      const half = (finite(best.r.width) ? best.r.width : 2) / 2 + (best.r.sidewalks ? 1 : 0) + 1.4;
      ex = s[i][0] + nx * half; ez = s[i][1] + nz * half;
      fx = -nx; fz = -nz;
    }
    entranceSign = buildEntranceSign(group, ex, ez, Math.atan2(fx, fz), name, holes, groundMin(hAt, ex, ez, 1.6, 0.3));
    entranceSign.userData.pos = { x: ex, z: ez };
  }

  // Driving range: mats, markers, net, benches, washer, shelter (the range is a plateau).
  for (const t of range.teeLine) buildRangeMat(group, t.x, t.y, groundMin(hAt, t.x, t.y, 0.4, 0.3));
  const tc = range.teeCenter, rd = range.dir;
  const rangeYaw = Math.atan2(-rd.x, -rd.y);   // the markers face the tee line
  for (const m of range.markers) {
    const mx = tc.x + rd.x * m, mz = tc.y + rd.y * m;
    buildDistanceMarker(group, mx, mz, String(m * YARDS_PER_TILE), rangeYaw, groundMin(hAt, mx, mz, 0.4, 0.05));
  }
  range.net.y = groundMin(hAt, range.net.cx, range.net.cz, Math.abs(range.net.dz) * range.net.half, Math.abs(range.net.dx) * range.net.half);
  range.netGroup = buildNet(group, range.net, Math.round(range.depth * YARDS_PER_TILE));
  const side = { x: -rd.y, y: rd.x };
  const benchBack = { x: tc.x - rd.x * 1.1, y: tc.y - rd.y * 1.1 };
  for (const s of [-1, 1]) {
    const bx = benchBack.x + side.x * s * (range.net.half - 0.6), bz = benchBack.y + side.y * s * (range.net.half - 0.6);
    buildBench(group, bx, bz, Math.atan2(rd.x, rd.y), groundMin(hAt, bx, bz, 0.5, 0.2));
  }
  const wX = tc.x + side.x * (range.net.half + 0.2), wZ = tc.y + side.y * (range.net.half + 0.2);
  buildBallWasher(group, wX, wZ, hAt(wX, wZ));
  const shX = benchBack.x - side.x * (range.net.half - 1.4) - rd.x * 0.6, shZ = benchBack.y - side.y * (range.net.half - 1.4) - rd.y * 0.6;
  buildShelter(group, shX, shZ, groundMin(hAt, shX, shZ, 0.65, 0.5));

  // Ball pool.
  const balls = [];
  const ballPool = {
    balls,
    max: POOL_MAX,
    /* acquire(hole | null): a hidden, resting ball at (0, R, 0); recycles the oldest resting ball when full. */
    acquire(hole) {
      let b = balls.find(x => !x.active);
      if (!b) {
        if (balls.length < POOL_MAX) { b = makeBall(group, balls.length); balls.push(b); }
        else {
          b = balls.find(x => x.resting) || balls[0];
        }
      }
      b.active = true; b.mesh.visible = true;
      b.pos.set(0, BALL_R, 0); b.vel.set(0, 0, 0); b.launch.copy(b.pos); b.lastRest.copy(b.pos);
      b.rolling = false; b.resting = true; b.holed = false; b.landed = true; b.carry = 0; b.lipOut = false; b.hitNet = false;
      b.inWater = false; b.creepT = 0;
      b.hole = hole === undefined ? null : hole; b.strokes = 0; b.trailTimer = 0;
      for (const t of b.trail) { t.active = false; t.mesh.visible = false; }
      return b;
    },
    /* place(ball, x, z): put a ball at rest on the ground (terrain height plus BALL_R) at a world point (tee, drop). */
    place(ball, x, z) {
      ball.pos.set(x, hAt(x, z) + BALL_R, z); ball.vel.set(0, 0, 0); ball.lastRest.copy(ball.pos); ball.launch.copy(ball.pos);
      ball.rolling = false; ball.resting = true; ball.holed = false; ball.landed = true; ball.lipOut = false; ball.hitNet = false;
      ball.inWater = false; ball.creepT = 0;
      ball.mesh.visible = true; ball.mesh.position.copy(ball.pos);
      return ball;
    },
    release(ball) {
      if (!ball) return;
      ball.active = false; ball.mesh.visible = false; ball.resting = true; ball.vel.set(0, 0, 0);
      for (const t of ball.trail) { t.active = false; t.mesh.visible = false; }
    },
    releaseAll() { for (const b of balls) ballPool.release(b); },
  };
  // Prewarm two balls so the first tee shot allocates nothing.
  ballPool.release(ballPool.acquire(null)); ballPool.release(ballPool.acquire(null));

  // Repaint canvases once the web fonts resolve.
  if (hasDoc() && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(() => { for (const r of repaints) { try { r(); } catch (e) { /* a canvas may be gone */ } } }).catch(() => {});
  }

  /* update(dt, time): ball meshes and trails, flag waves, pin hide while putting. Allocation-free. */
  function update(dt, time) {
    if (!finite(dt)) dt = 0;
    dt = clamp(dt, 0, MAX_DT);
    if (!finite(time)) time = 0;
    // Balls.
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.active) continue;
      b.mesh.position.copy(b.pos);
      b.mesh.visible = !b.holed && !b.inWater && b.pos.y > hAt(b.pos.x, b.pos.z) - 0.2;
      // Trail emission while airborne and fast.
      const airborne = !b.rolling && !b.resting;
      const speed = b.vel.length();
      if (airborne && speed > TRAIL_MIN_SPEED) {
        b.trailTimer += dt;
        while (b.trailTimer >= TRAIL_EVERY) {
          b.trailTimer -= TRAIL_EVERY;
          const t = b.trail[b.trailNext]; b.trailNext = (b.trailNext + 1) % TRAIL_N;
          t.active = true; t.age = 0; t.mesh.visible = true; t.mesh.position.copy(b.pos);
        }
      } else b.trailTimer = 0;
      for (let k = 0; k < TRAIL_N; k++) {
        const t = b.trail[k];
        if (!t.active) continue;
        t.age += dt;
        if (t.age >= TRAIL_LIFE) { t.active = false; t.mesh.visible = false; continue; }
        const a = 1 - t.age / TRAIL_LIFE;
        t.mesh.material.opacity = 0.5 * a;
        t.mesh.scale.setScalar(0.5 + 0.5 * a);
      }
    }
    // Flags: cloth wave, sun-side yaw, pin hidden while a ball rolls near its cup.
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i];
      const pa = f.geo.getAttribute('position');
      const arr = pa.array, base = f.base;
      const cols = 7; // PlaneGeometry(w, h, 6, 1) has 7 columns and 2 rows
      for (let v = 0; v < pa.count; v++) {
        const col = v % cols;
        const u = col / (cols - 1);
        arr[v * 3 + 2] = base[v * 3 + 2] + 0.03 * u * Math.sin(4 * u - 3 * time + i * 0.7);
      }
      pa.needsUpdate = true;
      const targetYaw = f.baseYaw + 0.12 * Math.sin(0.7 * time + i);
      f.hinge.rotation.y += (targetYaw - f.hinge.rotation.y) * (1 - Math.exp(-dt * 3));
      let hide = false;
      if (f.hole && f.hole.cup) {
        for (let k = 0; k < balls.length; k++) {
          const b = balls[k];
          if (!b.active || b.resting || !b.rolling) continue;
          if (f.hole.kind === 'hole' && b.hole !== null && b.hole !== undefined && b.hole !== f.hole.n && b.hole !== f.hole) continue;
          const dx = b.pos.x - f.hole.cup.x, dz = b.pos.z - f.hole.cup.y;
          if (dx * dx + dz * dz < 2.5 * 2.5) { hide = true; break; }
        }
      }
      f.group.visible = !hide;
    }
  }

  let par = 0, yards = 0;
  for (const h of holes) { par += h.par; yards += h.yards; }
  const counts = { holes: holes.length, flags: holes.length, cups: cups.length, markers: markers.length, signs: signs.length, plates: plates.length, collars: collars.length, cartPaths: cartRoads.length, contours: holes.length * 2 };
  return {
    group, name, par, yards, holes, range, clubhouse, practiceCourse, flags, cups, markers, signs, plates, collars, contours,
    cartPaths, entranceSign, clubhouseSign, scoreBoard, counts, update, ballPool, parkBounds, area, heightAt: hAt, terrain,
    waterways, waterBodies, waterPolys, islands,   // v11: the whole build answers lieAt and waterSurfaceAt as a course too
  };
}
