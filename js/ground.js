/* Thread Town blended ground (docs/CONTRACT_V10.md "Blended ground").

   buildGround(ctx) -> { mesh, material, geometry, splat, update(dt, time, night), setNight(s), weightsAt(x, z, out), LAYERS }
   ctx = { plan, terrain, state, sim, THREE, hole, at, seed, maxAniso }
     plan     the city plan (roads as splines; only plan.roads and cols / rows are read here)
     terrain  { cols, rows, heights, heightAt, slopeAt, normalAt, slopeClassAt? } from js/terrain.js;
              slopeClassAt is used when present, else the class is derived from slopeAt
     state    the sim state (state.plaza is not needed; the tiles come from `at`)
     sim      TT.sim (TILES and at(x, y)); ctx.at(x, y) and ctx.TILES override it for tests
     THREE    the three module (falls back to globalThis.THREE)
     hole     the subway stairwell { x0, z0, x1, z1 } in world units, or null: the tiles under it are
              replaced by flat quads at the plaza height with the well cut out, exactly as render3d
              did in v8 and v9 (heightfieldGeometry)
     seed     integer for the procedural textures and the mottle (default 20261102)
     maxAniso renderer.capabilities.getMaxAnisotropy() (default 1)

   The mesh is the v9 heightfield: one vertex per tile corner at terrain.heights, uv u = x / cols,
   v = 1 - z / rows, computed normals, the stairwell patch, castShadow and receiveShadow on, named
   'ground'. The material is a MeshStandardMaterial whose onBeforeCompile blends eight procedural
   layers (grass, dry grass, dirt, rock, sand, fairway with mown stripes, green with fine stripes,
   paving) by a splat map painted at SPLAT_PX = 4 pixels per tile and box blurred twice (radius 2)
   so no tile edge survives; the layer textures are sampled in world space (xz) so they never
   stretch on slopes; a per pixel tint (also blurred) darkens parking, cliffs and river beds.

   Weights per tile type (sim TILES): G grass; T forest floor (grass and dirt); F grass; B lot yard
   (grass and a little dirt); Z, FT, SW paving; PK paving tinted asphalt dark; FW and TEE fairway;
   GR green; SA sand; PT and CP (when the sim defines them) dirt (gravel under the roads.js ribbon).
   Roads are NOT painted: a P or CW tile under a plan spline takes the weights of the nearest tile
   that is not a road or water, so the ground under the roads.js ribbon continues the bank. A P tile
   no spline covers (a lot stub, a parking aisle) is painted as paving so it stays visible even if
   nothing draws it. Water, bridge and deck tiles (WA, BR, DK) are painted as the bank: a sand beach
   (or a stone embankment next to paving) within 1.5 tiles of land and a dark river bed beyond; the
   water meshes stay in render3d. The terrain's slope class overrides the tile: steep adds rock,
   cliff is dark rock, sun facing gentle slopes turn grass to dry grass (sun from render3d's
   SUN_DIR, south-west).

   Night: today's painter applies no tint; render3d's registry scales the ground's envMapIntensity
   (0.25) by 1 - 0.6 night. setNight(s) does that here and fades the mowing stripes (they are a sun
   angle effect), so render3d must not reg() this material; update(dt, time, night) calls setNight.

   Tests (tests_tmp): paintSplat and heightfieldGeometry are exported so a headless run can check
   the splat covers the map, the weights sum to 1 with no NaN, steep tiles are rock weighted, the
   injected GLSL is well formed and the vertex count is (cols + 1) * (rows + 1) plus the patch. */

import { splineSamples, ROAD_KINDS } from './cityplan.js';

export const SPLAT_PX = 4;
export const LAYERS = ['grass', 'dry', 'dirt', 'rock', 'sand', 'fairway', 'green', 'paving'];
export const L = { GRASS: 0, DRY: 1, DIRT: 2, ROCK: 3, SAND: 4, FAIRWAY: 5, GREEN: 6, PAVING: 7 };
export const DEFAULT_SEED = 20261102;

/* Tuning, read only. slope thresholds are tangents (rise over run): gentle from 8 degrees, steep
   from 30, cliff from 40 (the contract's outcrops start at 35, inside the steep ramp). */
export const GROUND = {
  splatPx: SPLAT_PX, blurRadius: 1, blurPasses: 2, texSize: 256,
  // natural class edges are warped by this many tiles with 3 tile noise before the blur
  warp: { amp: 0.35, wl: 3 },
  slope: { gentle: 0.14, steep: 0.58, cliff: 0.84 },
  rock: { steepK: 0.85, cliffK: 1.0, cliffTint: 0.62 },
  dry: { max: 0.7, mottle: 0.3, mottleWl: 7 },
  bank: { beachR: 1.5, beachSand: 0.65, bedTint: 0.72 },
  tint: { parking: 0.44, stub: 0.80, sidewalk: 1.0 },
  stripes: { fairwayPeriod: 2.0, fairwayAmp: 0.06, greenPeriod: 0.5, greenAmp: 0.05, dir: [0.7071, 0.7071] },
  // world units per texture repeat, per layer
  repeat: [4, 4, 3, 5, 3, 4, 2, 2],
  roughness: [1.0, 1.0, 0.95, 0.9, 0.9, 1.0, 1.0, 0.8],
  envMapIntensity: 0.25,
  sunXZ: [-0.6332, 0.7740],   // render3d SUN_DIR (-0.45, 0.70, 0.55) projected on xz and normalized
};

/* ---------- small math ---------- */
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (a, b, t) => { t = clamp01((t - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash3(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/* Periodic value noise: the lattice wraps every `period` cells so a texture tiles seamlessly. */
function vnoise(x, y, seed, period) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (a, b) => hash3(period ? ((a % period) + period) % period : a, period ? ((b % period) + period) % period : b, seed);
  const a = w(ix, iy), b = w(ix + 1, iy), c = w(ix, iy + 1), d = w(ix + 1, iy + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(x, y, seed, period, octaves) {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let o = 0; o < octaves; o++) { v += amp * vnoise(x * f, y * f, seed + o * 101, period * f); sum += amp; amp *= 0.5; f *= 2; }
  return v / sum;
}
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- the splat map ---------- */
/* Which tiles a plan spline covers (the sim's own rule: a tile center within width / 2 of a sample). */
function roadCoverMask(plan, cols, rows) {
  const m = new Uint8Array(cols * rows);
  const roads = (plan && plan.roads) || [];
  for (const r of roads) {
    if (!r || !r.pts || r.pts.length < 2) continue;
    const width = r.width || ROAD_KINDS[r.kind] || 2, hw = width / 2 + 0.05;
    const R = Math.ceil(hw) + 1;
    for (const s of splineSamples(r.pts, 0.2)) {
      const sx = s[0], sy = s[1];
      for (let y = Math.max(0, Math.floor(sy - R)); y <= Math.min(rows - 1, Math.ceil(sy + R)); y++) {
        for (let x = Math.max(0, Math.floor(sx - R)); x <= Math.min(cols - 1, Math.ceil(sx + R)); x++) {
          if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) <= hw) m[y * cols + x] = 1;
        }
      }
    }
  }
  return m;
}

/* Tile classes for the painter. */
const TC = { GRASS: 0, FOREST: 1, YARD: 2, PAVING: 3, PARKING: 4, SIDEWALK: 5, FAIRWAY: 6, GREEN: 7, SAND: 8, GRAVEL: 9, STUB: 10, ROADFILL: 11, WATER: 12 };

/* Base weights (8 layers) and tint for a tile class, before neighbours and slope. */
function classWeights(tc, out) {
  out.fill(0);
  let tint = 1;
  switch (tc) {
    case TC.GRASS: out[L.GRASS] = 1; break;
    case TC.FOREST: out[L.GRASS] = 0.65; out[L.DIRT] = 0.35; break;
    case TC.YARD: out[L.GRASS] = 0.8; out[L.DIRT] = 0.2; break;
    case TC.PAVING: out[L.PAVING] = 1; break;
    case TC.SIDEWALK: out[L.PAVING] = 1; tint = GROUND.tint.sidewalk; break;
    case TC.PARKING: out[L.PAVING] = 1; tint = GROUND.tint.parking; break;
    case TC.STUB: out[L.PAVING] = 1; tint = GROUND.tint.stub; break;
    case TC.FAIRWAY: out[L.FAIRWAY] = 1; break;
    case TC.GREEN: out[L.GREEN] = 1; break;
    case TC.SAND: out[L.SAND] = 1; break;
    case TC.GRAVEL: out[L.DIRT] = 1; break;
    default: out[L.GRASS] = 1; break;
  }
  return tint;
}

/* Maps the sim tile value at (x, y) to a painter class. */
function makeClassifier(TL, at, cover, cols, rows) {
  const has = k => typeof TL[k] === 'number';
  return function tileClass(x, y) {
    const v = at(x, y);
    if (v === TL.G || v === TL.F) return TC.GRASS;
    if (v === TL.T) return TC.FOREST;
    if (v === TL.B) return TC.YARD;
    if (v === TL.Z || v === TL.FT) return TC.PAVING;
    if (v === TL.SW) return TC.SIDEWALK;
    if (v === TL.PK) return TC.PARKING;
    if (v === TL.FW || v === TL.TEE) return TC.FAIRWAY;
    if (v === TL.GR) return TC.GREEN;
    if (v === TL.SA) return TC.SAND;
    if (v === TL.WA || v === TL.BR) return TC.WATER;
    if (has('DK') && v === TL.DK) return TC.WATER;
    if ((has('PT') && v === TL.PT) || (has('CP') && v === TL.CP)) return TC.GRAVEL;
    if (v === TL.CW) return TC.ROADFILL;
    if (v === TL.P) return cover[y * cols + x] ? TC.ROADFILL : TC.STUB;
    return TC.GRASS;
  };
}

/* Paints the splat: returns the blurred weights (w * h * 8, planar by layer), the tint (w * h * 3)
   and the RGBA8 arrays for the three textures, plus per tile data for the nature module. */
export function paintSplat(ctx) {
  const plan = ctx.plan, terrain = ctx.terrain;
  const cols = (plan && plan.cols) || (terrain && terrain.cols), rows = (plan && plan.rows) || (terrain && terrain.rows);
  if (!(cols > 0 && rows > 0)) throw new Error('Thread Town ground: cols and rows are required');
  const sim = ctx.sim || (globalThis.TT && globalThis.TT.sim) || null;
  const TL = ctx.TILES || (sim && sim.TILES) || (ctx.state && ctx.state.TILES);
  if (!TL) throw new Error('Thread Town ground: the sim TILES are required');
  const atRaw = ctx.at || (sim && sim.at);
  if (typeof atRaw !== 'function') throw new Error('Thread Town ground: a tile accessor is required (ctx.at or sim.at)');
  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? -1 : atRaw(x, y);
  const seed = (typeof ctx.seed === 'number' && isFinite(ctx.seed)) ? ctx.seed | 0 : DEFAULT_SEED;
  const PXT = GROUND.splatPx, W = cols * PXT, H = rows * PXT, NP = W * H, NL = LAYERS.length;

  // 1) tile classes and road cover
  const cover = roadCoverMask(plan, cols, rows);
  const tileClass = makeClassifier(TL, at, cover, cols, rows);
  const cls = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cls[y * cols + x] = tileClass(x, y);
  const isLand = c => c !== TC.WATER && c !== TC.ROADFILL;

  // 2) per tile base weights; fill tiles (water, bridges, decks, spline roads) borrow the nearest land tile
  const tileW = new Float32Array(cols * rows * NL), tileTint = new Float32Array(cols * rows).fill(1);
  const src = new Int32Array(cols * rows).fill(-1), dist = new Int16Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  let qh = 0, qt = 0;
  for (let k = 0; k < cols * rows; k++) if (isLand(cls[k])) { src[k] = k; dist[k] = 0; queue[qt++] = k; }
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  while (qh < qt) {
    const k = queue[qh++], x = k % cols, y = (k - x) / cols;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nk = ny * cols + nx;
      if (dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1; src[nk] = src[k]; queue[qt++] = nk;
    }
  }
  const tmp = new Float32Array(NL);
  // land tiles first (fill tiles borrow from them, whatever the scan order)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const k = y * cols + x, c = cls[k], o = k * NL;
    if (isLand(c)) {
      tileTint[k] = classWeights(c, tmp);
      // dirt at the worn edges: grass beside a lane, a stub or a gravel path
      if (c === TC.GRASS || c === TC.YARD) {
        let worn = 0;
        for (const [dx, dy] of N8.slice(0, 4)) {
          const nc = x + dx < 0 || y + dy < 0 || x + dx >= cols || y + dy >= rows ? -1 : cls[(y + dy) * cols + x + dx];
          if (nc === TC.GRAVEL) worn = Math.max(worn, 0.4);
          else if (nc === TC.STUB || nc === TC.ROADFILL) worn = Math.max(worn, 0.22);
        }
        if (worn > 0) { const g = tmp[L.GRASS]; tmp[L.GRASS] = g * (1 - worn); tmp[L.DIRT] += g * worn; }
      }
      for (let i = 0; i < NL; i++) tileW[o + i] = tmp[i];
    }
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const k = y * cols + x, c = cls[k], o = k * NL;
    if (isLand(c)) continue;
    const hasSrc = src[k] >= 0, sk = hasSrc ? src[k] : k, sc = hasSrc ? cls[sk] : TC.GRASS;
    const so = sk * NL;
    if (c === TC.ROADFILL) {
      // the ground under a road ribbon continues its bank
      if (hasSrc) { for (let i = 0; i < NL; i++) tileW[o + i] = tileW[so + i]; tileTint[k] = tileTint[sk]; }
      else { tileTint[k] = classWeights(TC.GRASS, tmp); for (let i = 0; i < NL; i++) tileW[o + i] = tmp[i]; }
      continue;
    }
    // water, bridge and deck tiles: the bank
    const d = dist[k] >= 0 ? dist[k] : 99;
    const paved = sc === TC.PAVING || sc === TC.SIDEWALK || sc === TC.PARKING || sc === TC.STUB;
    if (d <= GROUND.bank.beachR) {
      if (paved) { tmp.fill(0); tmp[L.ROCK] = 0.6; tmp[L.PAVING] = 0.4; tileTint[k] = 0.9; }
      else {
        const s = GROUND.bank.beachSand;
        for (let i = 0; i < NL; i++) tmp[i] = tileW[so + i] * (1 - s);
        tmp[L.SAND] += s; tileTint[k] = 1;
      }
    } else { tmp.fill(0); tmp[L.DIRT] = 0.45; tmp[L.SAND] = 0.25; tmp[L.ROCK] = 0.3; tileTint[k] = GROUND.bank.bedTint; }
    for (let i = 0; i < NL; i++) tileW[o + i] = tmp[i];
  }

  // 3) per splat pixel: the tile's weights, the slope override and the mottle
  const weights = new Float32Array(NP * NL), tint = new Float32Array(NP * 3);
  const slopeTile = new Float32Array(cols * rows), rockTile = new Float32Array(cols * rows);
  const hasClass = terrain && typeof terrain.slopeClassAt === 'function';
  const hasSlope = terrain && typeof terrain.slopeAt === 'function';
  const sl = { x: 0, z: 0 };
  const sunX = GROUND.sunXZ[0], sunZ = GROUND.sunXZ[1];
  const S = GROUND.slope;
  // natural classes may trade places across a warped edge; paving, stubs and parking keep straight edges
  const natural = c => c === TC.GRASS || c === TC.FOREST || c === TC.YARD || c === TC.FAIRWAY || c === TC.GREEN || c === TC.SAND || c === TC.GRAVEL || c === TC.WATER;
  const WA_ = GROUND.warp.amp, WL_ = GROUND.warp.wl;
  for (let py = 0; py < H; py++) {
    const ty = Math.floor(py / PXT), wz = (py + 0.5) / PXT;
    for (let px = 0; px < W; px++) {
      const tx = Math.floor(px / PXT), wx = (px + 0.5) / PXT;
      let k = ty * cols + tx;
      const p = py * W + px;
      if (natural(cls[k])) {
        const ox = (fbm(wx / WL_, wz / WL_, seed + 31, 0, 2) - 0.5) * 2 * WA_, oz = (fbm(wx / WL_ + 37.1, wz / WL_ + 11.7, seed + 41, 0, 2) - 0.5) * 2 * WA_;
        const kx = Math.min(cols - 1, Math.max(0, Math.floor(wx + ox))), kz = Math.min(rows - 1, Math.max(0, Math.floor(wz + oz)));
        const k2 = kz * cols + kx;
        if (natural(cls[k2])) k = k2;
      }
      const o = k * NL;
      for (let i = 0; i < NL; i++) tmp[i] = tileW[o + i];
      let t = tileTint[k];
      // slope: magnitude and facing
      let s = 0, fx = 0, fz = 0;
      if (hasSlope) { terrain.slopeAt(wx, wz, sl); s = Math.hypot(sl.x, sl.z); if (s > 1e-6) { fx = -sl.x / s; fz = -sl.z / s; } }
      if (!isFinite(s)) s = 0;
      let rockK = 0, dark = 0;
      if (hasClass) {
        const c = terrain.slopeClassAt(wx, wz);
        if (c === 'steep') rockK = GROUND.rock.steepK;
        else if (c === 'cliff') { rockK = GROUND.rock.cliffK; dark = 1; }
      } else {
        rockK = smooth(S.steep * 0.8, S.steep, s) * GROUND.rock.steepK + smooth(S.cliff * 0.9, S.cliff, s) * (GROUND.rock.cliffK - GROUND.rock.steepK);
        dark = smooth(S.cliff * 0.9, S.cliff * 1.1, s);
      }
      // sun facing gentle slopes: grass dries out
      const gentle = hasClass ? (terrain.slopeClassAt(wx, wz) === 'gentle' ? 1 : 0) : smooth(S.gentle, S.gentle * 2, s) * (1 - smooth(S.steep * 0.8, S.steep, s));
      const facing = clamp01(fx * sunX + fz * sunZ);
      const mott = fbm(wx / GROUND.dry.mottleWl, wz / GROUND.dry.mottleWl, seed + 7, 0, 2);
      const dryK = clamp01(gentle * facing * GROUND.dry.max + GROUND.dry.mottle * smooth(0.58, 0.8, mott));
      if (dryK > 0 && tmp[L.GRASS] > 0) { const g = tmp[L.GRASS]; tmp[L.GRASS] = g * (1 - dryK); tmp[L.DRY] += g * dryK; }
      if (rockK > 0) {
        for (let i = 0; i < NL; i++) tmp[i] *= 1 - rockK;
        tmp[L.ROCK] += rockK;
        t *= 1 - dark * (1 - GROUND.rock.cliffTint);
      }
      // normalize (every class sums to 1 already; this guards the arithmetic)
      let sum = 0; for (let i = 0; i < NL; i++) sum += tmp[i];
      if (!(sum > 0)) { tmp.fill(0); tmp[L.GRASS] = 1; sum = 1; }
      for (let i = 0; i < NL; i++) weights[p * NL + i] = tmp[i] / sum;
      tint[p * 3] = t; tint[p * 3 + 1] = t; tint[p * 3 + 2] = t;
      if (px % PXT === PXT >> 1 && py % PXT === PXT >> 1) { const kk = ty * cols + tx; slopeTile[kk] = s; rockTile[kk] = tmp[L.ROCK] / sum; }
    }
  }

  // 4) blur: separable box, radius r, two passes (interleaved channels)
  boxBlur(weights, W, H, NL, GROUND.blurRadius, GROUND.blurPasses);
  boxBlur(tint, W, H, 3, GROUND.blurRadius, GROUND.blurPasses);
  // renormalize after the blur (a box blur of unit sums keeps the sum, this removes drift)
  for (let p = 0; p < NP; p++) {
    let sum = 0; for (let i = 0; i < NL; i++) sum += weights[p * NL + i];
    const inv = sum > 0 ? 1 / sum : 0;
    for (let i = 0; i < NL; i++) weights[p * NL + i] *= inv;
    if (!(sum > 0)) weights[p * NL + L.GRASS] = 1;
  }

  // 5) quantize into RGBA8: A holds layers 0..3, B layers 4..7, T the tint
  const dataA = new Uint8Array(NP * 4), dataB = new Uint8Array(NP * 4), dataT = new Uint8Array(NP * 4);
  for (let p = 0; p < NP; p++) {
    const o = p * NL, q = p * 4;
    for (let i = 0; i < 4; i++) { dataA[q + i] = Math.round(clamp01(weights[o + i]) * 255); dataB[q + i] = Math.round(clamp01(weights[o + 4 + i]) * 255); }
    dataT[q] = Math.round(clamp01(tint[p * 3]) * 255); dataT[q + 1] = Math.round(clamp01(tint[p * 3 + 1]) * 255); dataT[q + 2] = Math.round(clamp01(tint[p * 3 + 2]) * 255); dataT[q + 3] = 255;
  }
  return { cols, rows, w: W, h: H, px: PXT, layers: NL, weights, tint, dataA, dataB, dataT, classes: cls, roadCover: cover, slopeTile, rockTile };
}

/* In place separable box blur over interleaved channels, clamped at the edges. */
function boxBlur(a, W, H, C, r, passes) {
  const line = new Float32Array(Math.max(W, H) * C);
  for (let pass = 0; pass < passes; pass++) {
    // rows
    for (let y = 0; y < H; y++) {
      const base = y * W * C;
      for (let i = 0; i < W * C; i++) line[i] = a[base + i];
      for (let c = 0; c < C; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += line[Math.min(W - 1, Math.max(0, k)) * C + c];
        for (let x = 0; x < W; x++) {
          a[base + x * C + c] = sum / (2 * r + 1);
          const outI = Math.max(0, x - r), inI = Math.min(W - 1, x + r + 1);
          sum += line[inI * C + c] - line[outI * C + c];
        }
      }
    }
    // columns
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) for (let c = 0; c < C; c++) line[y * C + c] = a[(y * W + x) * C + c];
      for (let c = 0; c < C; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += line[Math.min(H - 1, Math.max(0, k)) * C + c];
        for (let y = 0; y < H; y++) {
          a[(y * W + x) * C + c] = sum / (2 * r + 1);
          const outI = Math.max(0, y - r), inI = Math.min(H - 1, y + r + 1);
          sum += line[inI * C + c] - line[outI * C + c];
        }
      }
    }
  }
}

/* ---------- procedural layer textures (pixel arrays, no image files, no DOM) ---------- */
/* Each painter fills an RGBA8 array of size n by n that tiles seamlessly (periodic noise). */
function paintLayer(i, n, seed) {
  const data = new Uint8Array(n * n * 4);
  const put = (p, r, g, b) => { data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = 255; };
  const mixc = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
  const noiseAt = (x, y, cells, oct, s) => fbm(x / n * cells, y / n * cells, seed + s, cells, oct);
  const speck = (x, y, s) => hash3(x, y, seed + s);
  const setc = (p, c, k) => put(p, Math.round(clamp01(c[0] * k / 255) * 255), Math.round(clamp01(c[1] * k / 255) * 255), Math.round(clamp01(c[2] * k / 255) * 255));
  const name = LAYERS[i];
  const pebbles = (count, rmin, rmax, dark, light, s) => {
    for (let q = 0; q < count; q++) {
      const cx = hash3(q, 1, seed + s) * n, cy = hash3(q, 2, seed + s) * n, rr = rmin + hash3(q, 3, seed + s) * (rmax - rmin), lit = hash3(q, 4, seed + s) < 0.35;
      for (let y = Math.floor(cy - rr - 1); y <= cy + rr + 1; y++) for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
        const d = Math.hypot(x - cx, y - cy); if (d > rr) continue;
        const p = (((y % n) + n) % n) * n + (((x % n) + n) % n), c = lit ? light : dark, k = 0.75 + 0.25 * (1 - d / rr);
        setc(p, c, k);
      }
    }
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = y * n + x;
    if (name === 'grass') {
      const t = noiseAt(x, y, 8, 4, 1), f = speck(x, y, 2);
      let c = mixc(hexRgb('#7FAE5B'), hexRgb('#98C476'), t);
      if (f < 0.10) c = mixc(c, hexRgb('#5E8C44'), 0.45); else if (f > 0.93) c = mixc(c, hexRgb('#B2D68E'), 0.4);
      setc(p, c, 1);
    } else if (name === 'dry') {
      const t = noiseAt(x, y, 8, 4, 3), f = speck(x, y, 4);
      let c = mixc(hexRgb('#B5A862'), hexRgb('#D2C47E'), t);
      if (f < 0.12) c = mixc(c, hexRgb('#8E8448'), 0.5); else if (f > 0.94) c = mixc(c, hexRgb('#E6DA9C'), 0.45);
      setc(p, c, 1);
    } else if (name === 'dirt') {
      const t = noiseAt(x, y, 6, 4, 5), f = speck(x, y, 6);
      let c = mixc(hexRgb('#8A6E4D'), hexRgb('#A88D66'), t);
      if (f < 0.06) c = mixc(c, hexRgb('#6B5339'), 0.5);
      setc(p, c, 1);
    } else if (name === 'rock') {
      const t = noiseAt(x, y, 5, 5, 7), ridge = Math.abs(noiseAt(x, y, 10, 3, 8) - 0.5) * 2;
      let c = mixc(hexRgb('#777B80'), hexRgb('#A6AAAE'), t);
      c = mixc(c, hexRgb('#4E5257'), (1 - smooth(0.02, 0.09, ridge)) * 0.6);   // cracks where the folded noise crosses zero
      setc(p, c, 1);
    } else if (name === 'sand') {
      const t = noiseAt(x, y, 8, 3, 9), f = speck(x, y, 10);
      let c = mixc(hexRgb('#E5D6AC'), hexRgb('#F0E5C3'), t);
      if (f < 0.12) c = mixc(c, hexRgb('#C9B48A'), 0.45); else if (f > 0.95) c = mixc(c, hexRgb('#FFFBEF'), 0.6);
      setc(p, c, 1);
    } else if (name === 'fairway') {
      const t = noiseAt(x, y, 16, 3, 11), f = speck(x, y, 12);
      let c = mixc(hexRgb('#76B658'), hexRgb('#82C262'), t);
      if (f > 0.9) c = mixc(c, hexRgb('#9ACD79'), 0.35);
      setc(p, c, 1);
    } else if (name === 'green') {
      const t = noiseAt(x, y, 32, 2, 13);
      setc(p, mixc(hexRgb('#93CC72'), hexRgb('#9DD57C'), t), 1);
    } else {
      // paving: a two by two checker of plaza stones per repeat (one stone per tile) with grout
      const cell = n / 2, cx = x % cell, cy = y % cell, ix = Math.floor(x / cell), iy = Math.floor(y / cell);
      const grout = cx < 2 || cy < 2, light = (ix + iy) % 2 === 0;
      const t = noiseAt(x, y, 4, 3, 15);
      let c = grout ? hexRgb('#B6C1CA') : mixc(hexRgb(light ? '#D3DBE2' : '#CAD3DB'), hexRgb(light ? '#DFE6EC' : '#D5DDE4'), t);
      if (!grout && (cx === cell - 1 || cy === cell - 1)) c = hexRgb('#E4EAEF');
      setc(p, c, 1);
    }
  }
  if (name === 'dirt') pebbles(70, 1.5, 4, hexRgb('#6E5A42'), hexRgb('#B9A48A'), 20);
  if (name === 'rock') pebbles(24, 2, 6, hexRgb('#5A5E63'), hexRgb('#B4B8BC'), 21);
  if (name === 'sand') pebbles(16, 1, 2, hexRgb('#C6B08A'), hexRgb('#FFFFFF'), 22);
  return data;
}

function makeDataTexture(THREE, data, w, h, o) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = o.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = o.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = !!o.mips;
  t.anisotropy = o.aniso || 1;
  t.flipY = !!o.flipY;
  t.needsUpdate = true;
  return t;
}

/* ---------- the heightfield (render3d v8 heightfieldGeometry, moved here unchanged) ---------- */
export function heightfieldGeometry(THREE, terrain, cols, rows, hole) {
  const W = cols + 1;
  const H = terrain && terrain.heights && terrain.heights.length === W * (rows + 1) ? terrain.heights : null;
  const hAt = (x, z) => { if (!terrain || typeof terrain.heightAt !== 'function') return 0; const h = terrain.heightAt(x, z); return isFinite(h) ? h : 0; };
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const h = H ? H[j * W + i] : hAt(i, j);
    pos.push(i, isFinite(h) ? h : 0, j); uv.push(i / cols, 1 - j / rows);
  }
  // tiles that overlap the stairwell opening are left out of the grid and covered by the flat patch below
  let sx0 = Infinity, sx1 = -Infinity, sz0 = Infinity, sz1 = -Infinity;
  const skip = (x, z) => !!hole && x + 1 > hole.x0 && x < hole.x1 && z + 1 > hole.z0 && z < hole.z1;
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    if (skip(x, z)) { sx0 = Math.min(sx0, x); sx1 = Math.max(sx1, x + 1); sz0 = Math.min(sz0, z); sz1 = Math.max(sz1, z + 1); continue; }
    const a = z * W + x, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, d, b, a, c, d);
  }
  let patchVerts = 0;
  if (hole && isFinite(sx0)) {
    // the plaza is a plateau, so the four corners of the skipped block share one height
    const y = (hAt(sx0, sz0) + hAt(sx1, sz0) + hAt(sx0, sz1) + hAt(sx1, sz1)) / 4;
    const rects = [[sx0, sz0, sx1, hole.z0], [sx0, hole.z1, sx1, sz1], [sx0, hole.z0, hole.x0, hole.z1], [hole.x1, hole.z0, sx1, hole.z1]];
    for (const [ax, az, bx, bz] of rects) {
      if (bx - ax < 1e-6 || bz - az < 1e-6) continue;
      const base = pos.length / 3;
      for (const [x, z] of [[ax, az], [bx, az], [bx, bz], [ax, bz]]) { pos.push(x, y, z); uv.push(x / cols, 1 - z / rows); patchVerts++; }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // a vertex no triangle references (the corner under the stairwell) keeps an up normal, not zero
  const nrm = g.attributes.normal;
  for (let k = 0; k < nrm.count; k++) if (nrm.getX(k) === 0 && nrm.getY(k) === 0 && nrm.getZ(k) === 0) nrm.setXYZ(k, 0, 1, 0);
  g.computeBoundingSphere();
  g.userData.patchVerts = patchVerts;
  return g;
}

/* ---------- the shader ---------- */
export const GLSL = {
  vertexPars: '\nvarying vec3 vGroundPos;\n',
  vertexMain: '\n#include <begin_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n',
  fragmentPars: [
    '',
    'varying vec3 vGroundPos;',
    'uniform sampler2D uSplatA; uniform sampler2D uSplatB; uniform sampler2D uTint;',
    'uniform sampler2D uGrass; uniform sampler2D uDry; uniform sampler2D uDirt; uniform sampler2D uRock;',
    'uniform sampler2D uSand; uniform sampler2D uFairway; uniform sampler2D uGreen; uniform sampler2D uPaving;',
    'uniform vec2 uSplatScale; uniform vec4 uRepeatA; uniform vec4 uRepeatB; uniform vec4 uRoughA; uniform vec4 uRoughB;',
    'uniform vec2 uStripeDir; uniform vec4 uStripes; uniform float uNight;',
    'vec4 ttGroundWeightsA; vec4 ttGroundWeightsB;',
    'void ttGroundWeights() {',
    '  vec2 su = vGroundPos.xz * uSplatScale;',
    '  vec4 a = texture2D(uSplatA, su); vec4 b = texture2D(uSplatB, su);',
    '  float s = dot(a, vec4(1.0)) + dot(b, vec4(1.0));',
    '  float inv = 1.0 / max(s, 1e-4);',
    '  ttGroundWeightsA = a * inv; ttGroundWeightsB = b * inv;',
    '}',
    'float ttStripe(vec2 p, vec2 dir, float period) { return clamp(sin(dot(p, dir) * 6.2831853 / period) * 3.0, -1.0, 1.0); }',
    '',
  ].join('\n'),
  fragmentMap: [
    '',
    'ttGroundWeights();',
    'vec2 gp = vGroundPos.xz;',
    'vec3 gc = vec3(0.0);',
    'gc += ttGroundWeightsA.x * texture2D(uGrass, gp / uRepeatA.x).rgb;',
    'gc += ttGroundWeightsA.y * texture2D(uDry, gp / uRepeatA.y).rgb;',
    'gc += ttGroundWeightsA.z * texture2D(uDirt, gp / uRepeatA.z).rgb;',
    'gc += ttGroundWeightsA.w * texture2D(uRock, gp / uRepeatA.w).rgb;',
    'gc += ttGroundWeightsB.x * texture2D(uSand, gp / uRepeatB.x).rgb;',
    'float stripeFade = 1.0 - 0.6 * uNight;',
    'vec2 sdir2 = vec2(-uStripeDir.y, uStripeDir.x);',
    'gc += ttGroundWeightsB.y * texture2D(uFairway, gp / uRepeatB.y).rgb * (1.0 + uStripes.y * stripeFade * ttStripe(gp, uStripeDir, uStripes.x));',
    'gc += ttGroundWeightsB.z * texture2D(uGreen, gp / uRepeatB.z).rgb * (1.0 + uStripes.w * stripeFade * ttStripe(gp, sdir2, uStripes.z));',
    'gc += ttGroundWeightsB.w * texture2D(uPaving, gp / uRepeatB.w).rgb;',
    'vec2 tu = vGroundPos.xz * uSplatScale;',
    'gc *= texture2D(uTint, tu).rgb;',
    'diffuseColor.rgb *= gc;',
    '',
  ].join('\n'),
  fragmentRoughness: [
    '',
    'float roughnessFactor = roughness * (dot(ttGroundWeightsA, uRoughA) + dot(ttGroundWeightsB, uRoughB));',
    '',
  ].join('\n'),
};

/* Rewrites a MeshStandardMaterial shader (three's onBeforeCompile argument) for the blend. */
export function injectGroundShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = GLSL.vertexPars + shader.vertexShader.replace('#include <begin_vertex>', GLSL.vertexMain);
  shader.fragmentShader = GLSL.fragmentPars + shader.fragmentShader
    .replace('#include <map_fragment>', GLSL.fragmentMap)
    .replace('#include <roughnessmap_fragment>', GLSL.fragmentRoughness);
  return shader;
}

/* ---------- build ---------- */
export function buildGround(ctx) {
  ctx = ctx || {};
  const THREE = ctx.THREE || globalThis.THREE;
  if (!THREE) throw new Error('Thread Town ground: ctx.THREE is required');
  const plan = ctx.plan || (ctx.sim && ctx.sim.PLAN) || (globalThis.TT && globalThis.TT.PLAN) || null;
  const terrain = ctx.terrain || null;
  const cols = (plan && plan.cols) || (terrain && terrain.cols), rows = (plan && plan.rows) || (terrain && terrain.rows);
  const seed = (typeof ctx.seed === 'number' && isFinite(ctx.seed)) ? ctx.seed | 0 : DEFAULT_SEED;
  const aniso = Math.max(1, Math.min(8, ctx.maxAniso || 1));

  const splat = paintSplat({ plan, terrain, state: ctx.state, sim: ctx.sim, at: ctx.at, TILES: ctx.TILES, seed });
  const texA = makeDataTexture(THREE, splat.dataA, splat.w, splat.h, { srgb: false, repeat: false, mips: true, aniso, flipY: false });
  const texB = makeDataTexture(THREE, splat.dataB, splat.w, splat.h, { srgb: false, repeat: false, mips: true, aniso, flipY: false });
  const texT = makeDataTexture(THREE, splat.dataT, splat.w, splat.h, { srgb: true, repeat: false, mips: true, aniso, flipY: false });
  const n = GROUND.texSize;
  const layerTex = LAYERS.map((name, i) => makeDataTexture(THREE, paintLayer(i, n, seed + i * 17), n, n, { srgb: true, repeat: true, mips: true, aniso, flipY: false }));

  const R = GROUND.repeat, RG = GROUND.roughness, ST = GROUND.stripes;
  const uniforms = {
    uSplatA: { value: texA }, uSplatB: { value: texB }, uTint: { value: texT },
    uGrass: { value: layerTex[0] }, uDry: { value: layerTex[1] }, uDirt: { value: layerTex[2] }, uRock: { value: layerTex[3] },
    uSand: { value: layerTex[4] }, uFairway: { value: layerTex[5] }, uGreen: { value: layerTex[6] }, uPaving: { value: layerTex[7] },
    uSplatScale: { value: new THREE.Vector2(1 / cols, 1 / rows) },
    uRepeatA: { value: new THREE.Vector4(R[0], R[1], R[2], R[3]) }, uRepeatB: { value: new THREE.Vector4(R[4], R[5], R[6], R[7]) },
    uRoughA: { value: new THREE.Vector4(RG[0], RG[1], RG[2], RG[3]) }, uRoughB: { value: new THREE.Vector4(RG[4], RG[5], RG[6], RG[7]) },
    uStripeDir: { value: new THREE.Vector2(ST.dir[0], ST.dir[1]) },
    uStripes: { value: new THREE.Vector4(ST.fairwayPeriod, ST.fairwayAmp, ST.greenPeriod, ST.greenAmp) },
    uNight: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0 });
  material.envMapIntensity = GROUND.envMapIntensity;
  material.userData.envMapIntensity = GROUND.envMapIntensity;
  material.userData.groundUniforms = uniforms;
  material.onBeforeCompile = shader => { injectGroundShader(shader, uniforms); };
  material.customProgramCacheKey = () => 'thread-town-ground-1';
  material.name = 'ground';

  const hole = ctx.hole || ctx.subwayHole || null;
  const geometry = heightfieldGeometry(THREE, terrain, cols, rows, hole);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ground';
  mesh.receiveShadow = true; mesh.castShadow = true;

  let night = 0;
  function setNight(s) {
    s = typeof s === 'number' && isFinite(s) ? clamp01(s) : 0;
    night = s;
    uniforms.uNight.value = s;
    material.envMapIntensity = GROUND.envMapIntensity * (1 - 0.6 * s);
  }
  function update(dt, time, n) { if (typeof n === 'number') setNight(n); }
  /* Blend weights at a world point (bilinear over the splat), for the nature module. */
  function weightsAt(x, z, out) {
    out = out || new Float32Array(LAYERS.length);
    const fx = Math.min(splat.w - 1, Math.max(0, x * splat.px - 0.5)), fz = Math.min(splat.h - 1, Math.max(0, z * splat.px - 0.5));
    const i = Math.min(splat.w - 2, Math.floor(fx)), j = Math.min(splat.h - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
    const NL = LAYERS.length, w = splat.weights;
    for (let l = 0; l < NL; l++) {
      const a = w[(j * splat.w + i) * NL + l], b = w[(j * splat.w + i + 1) * NL + l], c = w[((j + 1) * splat.w + i) * NL + l], d = w[((j + 1) * splat.w + i + 1) * NL + l];
      out[l] = (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    }
    return out;
  }
  function dispose() { geometry.dispose(); material.dispose(); texA.dispose(); texB.dispose(); texT.dispose(); for (const t of layerTex) t.dispose(); }

  return {
    mesh, material, geometry, uniforms, splat, textures: { splatA: texA, splatB: texB, tint: texT, layers: layerTex },
    update, setNight, weightsAt, dispose, LAYERS, get night() { return night; },
  };
}

export default buildGround;
