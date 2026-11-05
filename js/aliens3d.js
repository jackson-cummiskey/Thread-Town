/* Thread Town 3D: smooth alien characters (pose system v2).

   Builds a rounded low-poly alien from spheres, capsules and rounded boxes and
   animates it from the simulation's agent state. Traits (shape, eye count,
   antennae, spots, accent hue, idle yaw) are seeded with TT.hash and TT.rng in
   the same order as the legacy pixel sprite so an agent keeps its look.

   Public surface (docs/CONTRACT.md section js/aliens3d.js, docs/CONTRACT_V2.md section Aliens v2):
     ALIEN_HEIGHT
     ALIEN_POSES                 // every pose name animateAlien understands
     makeAlienMesh(seed, colorHex, opts) -> AlienHandle
     animateAlien(handle, agent, time, dt, poseOverride)
     setAlienOpacity(handle, alpha)
     disposeAlien(handle)
   Extras used by the renderer:
     makeAlienPortraitScene() -> { scene, camera }
     setAlienNight(s)            // 0 day .. 1 night, drives tip glow and envMapIntensity
     ALIEN_MATERIALS             // registry of every MeshStandardMaterial this module made
     disposeAlienCaches()

   v2 handle additions: parts.handL, parts.handR (prop attach points at the hand tips),
   parts.seatY (body drop for the sit pose), poseState (all per-alien animation state;
   handle.anim is an alias kept for v1 callers), sipPhase and swingPhase (inputs written
   by leisure3d and the dept activities).

   v5 (docs/CONTRACT_V5.md section Animators): poses 'golfIdle' (address stance) and 'golf',
   driven by handle.golfPhase 0..1 (written by the renderer from the player's swingT): 0 to 0.5
   backswing, 0.5 to 0.62 downswing to impact, then follow-through to the finish at 1.

   v6 (docs/CONTRACT_V6.md section Animators): pose 'slide' (the subway runner's duck): body
   lowered to about 55 percent height, pitched back 0.3 rad, arms swept back, legs forward.

   v9 (docs/CONTRACT_V9.md section Pose): pose 'ride' (standing on a scooter deck): one foot
   forward and one back, a slight knee bend, body leaning forward 0.15 rad, both arms forward and
   a little down to the handlebar, head up. The rig rolls with handle.leanZ (radians, written by
   the renderer from the scooter lean), eased so it never snaps; other poses ease the roll to 0.
   The arms are solved per body shape toward the grips at vehicles.js SCOOTER.BAR (rideReach):
   pitch, splay and a length factor on the arm group (CH_ARM_LS, CH_ARM_RS, 1 in every other pose).

   v10 (docs/CONTRACT_V10.md "Polish list", Walking): the walk cycle is driven by handle.distance
   (world units traveled, written by the renderer each frame) when it is a finite number, so the
   planted foot moves back at ground speed and never slides; the stride is the foot travel of the
   rig's own leg swing (4 * leg reach * sin(amplitude), times the group scale). Without a distance
   the cycle falls back to the time-based cadence. The cadence is capped at WALK_MAX_HZ strides per
   second; faster travel lengthens the swing instead. Pose 'idle' is 'stand' with fidgets (a slow
   weight shift and a look around); 'stand' fidgets too while agent.state is 'idle'. Pose 'turn'
   is turning in place: small alternating foot shuffles paced by handle.turnRate (rad/s, signed,
   written by the renderer when the chase camera turns the character), head leading the turn.

   v11 (docs/CONTRACT_V11.md "Files: js/aliens3d.js, js/animals3d.js"): pose 'hover' (riding the
   hoverboard): a skater's stance with the knees bent (a squash and a lowered rig), one foot
   forward and one back, both arms out for balance, the torso leaning into handle.leanZ on top of
   the rig roll, the head turned into the turn, antennae streaming back; while handle.airborne is
   true the rider crouches (a deeper squash, both knees pulled up, the arms higher) and the crouch
   eases in and out over about 0.1 s. Pose 'boat' (driving a boat): seated as for 'sit', turned a
   little toward the stern with the right hand back on the tiller and the left hand forward on the
   gunwale, looking ahead, a slow rock. Hats: handle.hat ('cap' | 'beanie' | 'crown' | 'cowboy' |
   'visor' | null, or setAlienHat(handle, hat)) wears a small hat on the head group, sized to the
   body shape; the first non-null hat builds all five hats once (parts.hats) and every later change
   only toggles visibility, so nothing allocates after that build. HAT_KINDS lists the names.

   Yaw ownership: the rig inside the group carries the alien's own facing (move direction,
   idle yaw, +z for wave). While agent.state is 'working' the renderer owns yaw and sets
   group.rotation.y itself, so the rig eases to 0 and never fights it. The same happens
   whenever the renderer has set a non-zero group.rotation.y (seated or swimming aliens
   oriented by render3d or leisure3d), so facing is never applied twice. */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// v9: the scooter grips (SCOOTER.BAR, SCOOTER.FEET) for the ride reach; a namespace import so a
// missing export falls back to the built-in numbers instead of failing module linking.
import * as VEHICLES from './vehicles.js';

export const ALIEN_HEIGHT = 0.9;

export const ALIEN_POSES = [
  'stand', 'walk', 'work', 'type', 'hop', 'slump', 'wave', 'sit', 'swing', 'swim', 'dive', 'climb',
  'throw', 'lookUp', 'cheer', 'lever', 'paint', 'push', 'point', 'balance',
  'golf', 'golfIdle',
  'slide',
  'ride',
  'idle', 'turn',
  'hover', 'boat',
];

/* v11: the hats the shop sells, worn on the head group (docs/V11_DESIGN.md "The shop catalogue"). */
export const HAT_KINDS = ['cap', 'beanie', 'crown', 'cowboy', 'visor'];

const TAU = Math.PI * 2;

/* v10 walking and turning constants. */
const WALK_MAX_HZ = 5;            // stride cycles per second at a sprint; faster travel lengthens the swing instead
const WALK_BOOST_MAX = 1.6;       // the most the leg swing grows when the distance outruns the cadence cap
const ALIEN_LEG_REACH = 0.19;     // hip pivot to the foot's ground contact (rig units)
const TURN_STEP_RAD = Math.PI / 3;   // one shuffle cycle (both feet) per 60 degrees of turn
const TURN_MAX_HZ = 4, TURN_IDLE_HZ = 2.5;

/* Advances a.walkPhase (stride cycles) from handle.distance when the renderer writes it (world units
   traveled: a planted foot then moves back exactly as fast as the ground, so it never slides), else
   from the time-based cadence. The phase advance is capped at maxHz strides per second; when the
   distance outruns it the returned boost (eased, 1 to WALK_BOOST_MAX) lengthens the swing instead.
   rigStride is the foot travel of one full cycle in rig units; the group scale turns it into world
   units. A jump of more than four strides in one frame is a teleport and advances nothing. */
function advanceWalk(a, handle, dt, cadenceHz, rigStride, maxHz) {
  const cap = (maxHz || WALK_MAX_HZ) * dt;
  const dist = handle.distance;
  let boost = 1;
  if (Number.isFinite(dist)) {
    const g = handle.group;
    const sc = g && Number.isFinite(g.scale.y) && g.scale.y > 0 ? g.scale.y : 1;
    const stride = Math.max(1e-3, rigStride * sc);
    if (!Number.isFinite(a.lastDist)) a.lastDist = dist;
    let dd = dist - a.lastDist;
    a.lastDist = dist;
    if (!(dd > 0) || dd > 4 * stride) dd = 0;
    let adv = dd / stride;
    if (adv > cap) { boost = Math.min(WALK_BOOST_MAX, adv / cap); adv = cap; }
    a.walkPhase += adv;
  } else {
    a.lastDist = NaN;
    let adv = (cadenceHz > 0 ? cadenceHz : 1) * dt;
    if (adv > cap) adv = cap;
    a.walkPhase += adv;
  }
  if (a.walkPhase > 4096) a.walkPhase -= 4096;   // keeps the sine argument small
  a.walkBoost += (boost - a.walkBoost) * (1 - Math.exp(-6 * dt));
  return a.walkBoost;
}

/* The leg swing over one stride cycle: a triangle wave with rounded peaks (-1..1), so the planted
   foot moves back at a nearly constant speed through its stance instead of a sine's ebb and surge. */
const STRIDE_K = 0.99, STRIDE_NORM = 1 / Math.asin(STRIDE_K);
function strideWave(p) { return Math.asin(STRIDE_K * Math.sin(TAU * p)) * STRIDE_NORM; }

/* Turn-in-place pacing: the shuffle phase advances with the turn rate (one cycle per TURN_STEP_RAD),
   or at TURN_IDLE_HZ when no rate is known; the sign of the last known rate is remembered. */
function advanceTurn(a, handle, agent, dt) {
  let rate = handle.turnRate;
  if (!Number.isFinite(rate)) rate = Number.isFinite(agent.turnRate) ? agent.turnRate : 0;
  if (rate > 1e-3) a.turnSign = 1; else if (rate < -1e-3) a.turnSign = -1;
  const hz = Math.abs(rate) > 1e-3 ? Math.min(TURN_MAX_HZ, Math.abs(rate) / TURN_STEP_RAD) : TURN_IDLE_HZ;
  a.turnPhase += hz * dt;
  if (a.turnPhase > 4096) a.turnPhase -= 4096;
  return a.turnSign;
}

/* Idle fidgets: a slow weight shift that dwells at each side (period about 7 s) and a look to one
   side every 5.5 to 8 s, both offset by the handle's own phase so a crowd never moves in step.
   Writes the shift (-1..1) and returns the head look target (0 when not looking). */
const _fid = { shift: 0, look: 0, flick: 0 };
function idleFidgets(a, time) {
  const fp = a.fidgetPhase;
  const ws = Math.sin(TAU * time / 7 + fp);
  _fid.shift = ws * ws * ws;
  const period = 5.5 + 2.5 * (fp / TAU);
  const tt = time + fp;
  const cyc = Math.floor(tt / period);
  const u = tt / period - cyc;
  _fid.look = u < 0.28 ? ((cyc & 1) ? 0.5 : -0.5) : 0;
  _fid.flick = u < 0.12 ? Math.sin(Math.PI * u / 0.12) : 0;
  return _fid;
}

/* ------------------------------------------------------------------ */
/* Seeding helpers. Prefer the simulation's TT.hash and TT.rng; fall back
   to identical local copies so portraits and tests work without TT. */

function fnv(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededRng(seed) {
  const TT = typeof window !== 'undefined' ? window.TT : null;
  const hash = TT && TT.hash ? TT.hash : fnv;
  const rng = TT && TT.rng ? TT.rng : mulberry;
  return rng(hash(String(seed)));
}

/* Same rounding as the legacy sprite so the accent hue formula lands on the
   same value for existing agents. */
function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function normalizeHex(colorHex) {
  if (typeof colorHex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(colorHex)) {
    return '#' + colorHex.replace('#', '').toUpperCase();
  }
  const c = new THREE.Color(colorHex || '#75CCD0');
  return '#' + c.getHexString().toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Shared geometry cache. Sizes are keyed so aliens of the same shape share
   buffers. Scale is always applied on the mesh, never on a shared geometry. */

const geoCache = new Map();
function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
function sphereGeo(r, ws, hs, thetaLength) {
  ws = ws || 24; hs = hs || 16;
  const key = 'sphere:' + r + ':' + ws + ':' + hs + ':' + (thetaLength || 'full');
  return cachedGeo(key, () => thetaLength
    ? new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, thetaLength)
    : new THREE.SphereGeometry(r, ws, hs));
}
function capsuleGeo(r, len) {
  return cachedGeo('capsule:' + r + ':' + len, () => new THREE.CapsuleGeometry(r, len, 8, 16));
}
function roundedBoxGeo(w, h, d, seg, radius) {
  return cachedGeo('rbox:' + w + ':' + h + ':' + d + ':' + seg + ':' + radius,
    () => new RoundedBoxGeometry(w, h, d, seg, radius));
}
function ringGeo() {
  return cachedGeo('ring', () => new THREE.RingGeometry(0.36, 0.44, 48));
}

/* ------------------------------------------------------------------ */
/* Shared materials. One material per color; cloned only when the color differs.
   setAlienOpacity gives an alien private clones the first time it fades, so one
   fading alien never dims the others that share its color. */

export const ALIEN_MATERIALS = [];
const matCache = new Map();

function registerStd(mat, envBase) {
  mat.userData.envBase = envBase;
  mat.userData.alienShared = true;
  mat.envMapIntensity = envBase;
  ALIEN_MATERIALS.push(mat);
  return mat;
}
function cachedStd(key, make, envBase) {
  let m = matCache.get(key);
  if (!m) { m = registerStd(make(), envBase); matCache.set(key, m); }
  return m;
}
function bodyMaterial(hex) {
  return cachedStd('body:' + hex, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex), roughness: 0.6, metalness: 0,
  }), 0.25);
}
function spotMaterial(hex) {
  return cachedStd('spot:' + hex, () => {
    const hsl = hexToHsl(hex);
    const c = new THREE.Color().setHSL(hsl.h / 360, hsl.s / 100, Math.max(0, hsl.l - 12) / 100, THREE.SRGBColorSpace);
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0 });
  }, 0.25);
}
function tipMaterial(hue) {
  return cachedStd('tip:' + hue, () => {
    const c = new THREE.Color().setHSL(hue / 360, 0.85, 0.66, THREE.SRGBColorSpace);
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0, emissive: c.clone(), emissiveIntensity: 0.35 });
    m.userData.isTip = true;
    return m;
  }, 0.25);
}
function eyeWhiteMaterial() {
  return cachedStd('eyewhite', () => new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.25, metalness: 0 }), 0.6);
}
function pupilMaterial() {
  return cachedStd('pupil', () => new THREE.MeshStandardMaterial({ color: 0x1B2A3A, roughness: 0.35, metalness: 0 }), 0.25);
}
let highlightMat = null;
function highlightMaterial() {
  if (!highlightMat) {
    highlightMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    highlightMat.userData.alienShared = true;
  }
  return highlightMat;
}

/* ------------------------------------------------------------------ */
/* v11 hats. Shared materials in the Thread palette (registered like the body materials, so the
   night ramp and the fade clones apply), shared geometries keyed by the head radius rounded to
   0.005 so heads of near equal size share buffers. buildHats makes the five hats once as hidden
   groups under a head group at an anchor (x, y, z: the crown line of the head in head space, r: the
   head's radius there, local +z forward) and returns { cap, beanie, crown, cowboy, visor }. */
const HAT_COLORS = { navy: '#002D4F', aqua: '#75CCD0', salmon: '#E7706F', silver: '#E2E9EE', white: '#FFFFFF', gold: '#F6D463', sand: '#D9B57A' };
function hatMaterial(name) {
  return cachedStd('hat:' + name, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(HAT_COLORS[name] || HAT_COLORS.navy), roughness: name === 'gold' ? 0.35 : 0.65, metalness: name === 'gold' ? 0.5 : 0,
  }), 0.3);
}
function hatRound(v) { return Math.round(v * 200) / 200; }
function buildHats(parent, x, y, z, r, castShadow) {
  r = hatRound(Math.max(0.08, r));
  const out = {};
  const add = (kind, g) => { g.name = 'hat-' + kind; g.visible = false; g.position.set(x, y, z); parent.add(g); out[kind] = g; return g; };
  const m = (geo, mat, px, py, pz, rx) => { const o = mesh(geo, mat, castShadow); o.position.set(px, py, pz); if (rx) o.rotation.x = rx; return o; };
  const dome = (k, scale) => cachedGeo('hat:dome:' + k + ':' + r, () => new THREE.SphereGeometry(r * scale, 20, 10, 0, TAU, 0, Math.PI / 2));
  const halfDisc = (k, scale) => cachedGeo('hat:half:' + k + ':' + r, () => new THREE.CylinderGeometry(r * scale, r * scale, 0.02, 16, 1, false, -Math.PI / 2, Math.PI));
  const torus = (k, scale, tube) => cachedGeo('hat:torus:' + k + ':' + r, () => new THREE.TorusGeometry(r * scale, tube, 8, 20));
  // the cap: a flattened navy dome, an aqua peak forward and a button on top
  { const g = new THREE.Group();
    const d = m(dome('cap', 1.08), hatMaterial('navy'), 0, -0.01, 0); d.scale.set(1, 0.62, 1); g.add(d);
    g.add(m(halfDisc('cap', 1.2), hatMaterial('aqua'), 0, 0.0, r * 0.2, 0.2));
    g.add(m(cachedGeo('hat:button', () => new THREE.SphereGeometry(0.026, 10, 8)), hatMaterial('aqua'), 0, r * 1.08 * 0.62 - 0.012, 0));
    add('cap', g); }
  // the beanie: a salmon dome with a rolled silver brim and a white bobble
  { const g = new THREE.Group();
    const d = m(dome('beanie', 1.1), hatMaterial('salmon'), 0, -0.01, 0); d.scale.set(1, 0.9, 1); g.add(d);
    g.add(m(torus('beanie', 1.07, 0.035), hatMaterial('silver'), 0, 0.0, 0, Math.PI / 2));
    g.add(m(cachedGeo('hat:bobble', () => new THREE.SphereGeometry(0.05, 12, 8)), hatMaterial('white'), 0, r * 1.1 * 0.9 + 0.02, 0));
    add('beanie', g); }
  // the crown: a gold ring with five points and a salmon jewel at the front
  { const g = new THREE.Group();
    g.add(m(cachedGeo('hat:crown:' + r, () => new THREE.CylinderGeometry(r * 0.94, r * 0.86, 0.16, 12, 1, true)), hatMaterial('gold'), 0, 0.06, 0));
    const point = cachedGeo('hat:point', () => new THREE.ConeGeometry(0.045, 0.1, 6));
    for (let i = 0; i < 5; i++) { const t = i * TAU / 5; g.add(m(point, hatMaterial('gold'), Math.sin(t) * r * 0.9, 0.18, Math.cos(t) * r * 0.9)); }
    g.add(m(cachedGeo('hat:jewel', () => new THREE.SphereGeometry(0.03, 10, 8)), hatMaterial('salmon'), 0, 0.08, r * 0.93));
    add('crown', g); }
  // the cowboy hat: a wide sand brim with a rolled rim, a tall crown and a navy band
  { const g = new THREE.Group();
    g.add(m(cachedGeo('hat:brim:' + r, () => new THREE.CylinderGeometry(r * 1.75, r * 1.75, 0.025, 20)), hatMaterial('sand'), 0, 0.0, 0));
    g.add(m(torus('cowboy', 1.72, 0.03), hatMaterial('sand'), 0, 0.03, 0, Math.PI / 2));
    g.add(m(cachedGeo('hat:cowboycrown:' + r, () => new THREE.CylinderGeometry(r * 0.76, r * 0.88, 0.26, 14)), hatMaterial('sand'), 0, 0.14, 0));
    g.add(m(cachedGeo('hat:band:' + r, () => new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.05, 14, 1, true)), hatMaterial('navy'), 0, 0.05, 0));
    add('cowboy', g); }
  // the Thread visor: an aqua half disc brim on a navy band, open on top, a salmon tab at the front
  { const g = new THREE.Group();
    g.add(m(halfDisc('visor', 1.45), hatMaterial('aqua'), 0, 0.0, r * 0.15, 0.2));
    g.add(m(torus('visor', 1.03, 0.03), hatMaterial('navy'), 0, 0.03, 0, Math.PI / 2));
    g.add(m(cachedGeo('hat:tab', () => new THREE.BoxGeometry(0.12, 0.035, 0.02)), hatMaterial('salmon'), 0, 0.03, r * 1.04));
    add('visor', g); }
  return out;
}
/* The crown line of a body profile: the height where the horizontal radius is 0.62 of the full
   radius, and that radius (the brim sits there, the dome covers the top). */
function hatAnchor(def) {
  const f = 0.62, k = Math.sqrt(1 - f * f);
  if (def.kind === 'capsule') return { y: def.cy + def.half + k * def.R, r: def.R * f };
  return { y: def.cy + k * def.ry, r: def.rx * f };
}
/* setAlienHat(handle, hat): wears one of HAT_KINDS (or none). The first hat builds all five on
   the head group; later calls only toggle visibility. */
export function setAlienHat(handle, hat) {
  if (!handle || handle.disposed) return;
  let kind = null;
  for (let i = 0; i < HAT_KINDS.length; i++) if (HAT_KINDS[i] === hat) kind = hat;
  const a = handle.poseState, P = handle.parts;
  if (kind && !P.hats) P.hats = buildHats(handle.headGroup, 0, a.hatY, 0, a.hatR, handle.castShadow !== false);
  if (P.hats) for (let i = 0; i < HAT_KINDS.length; i++) P.hats[HAT_KINDS[i]].visible = HAT_KINDS[i] === kind;
  handle.hat = kind;
  a.hatShown = kind;
}

/* Day/night driver for the renderer: s is 0 by day and 1 at night. */
export function setAlienNight(s) {
  s = Math.max(0, Math.min(1, s || 0));
  for (let i = 0; i < ALIEN_MATERIALS.length; i++) {
    const m = ALIEN_MATERIALS[i];
    m.envMapIntensity = m.userData.envBase * (1 - 0.6 * s);
    if (m.userData.isTip) m.emissiveIntensity = 0.35 + 1.0 * s;
  }
}

/* ------------------------------------------------------------------ */
/* Body profiles. Dimensions from docs/ART_DIRECTION.md, section Aliens. */

const SHAPES = {
  blob:  { kind: 'ellipsoid', cy: 0.47, rx: 0.34, ry: 0.42, rz: 0.32, top: 0.89, bottom: 0.05 },
  tall:  { kind: 'capsule',   cy: 0.45, R: 0.24, half: 0.21, rx: 0.24, ry: 0.45, rz: 0.24, top: 0.90, bottom: 0.00 },
  squat: { kind: 'ellipsoid', cy: 0.44, rx: 0.40, ry: 0.33, rz: 0.37, top: 0.77, bottom: 0.11 },
  pear:  { kind: 'ellipsoid', cy: 0.38, rx: 0.36, ry: 0.34, rz: 0.33, top: 0.93, bottom: 0.04,
           head: { kind: 'ellipsoid', cy: 0.68, rx: 0.25, ry: 0.25, rz: 0.25, top: 0.93 } },
};

/* Horizontal radius factor (0..1) of a profile at height y. */
function radiusFactor(def, y) {
  if (def.kind === 'capsule') {
    const d = Math.abs(y - def.cy);
    if (d <= def.half) return 1;
    const u = (d - def.half) / def.R;
    return Math.sqrt(Math.max(0, 1 - u * u));
  }
  const u = (y - def.cy) / def.ry;
  return Math.sqrt(Math.max(0, 1 - u * u));
}
/* Front surface z at (x, y), or 0 when (x, y) is outside the profile. */
function surfaceZ(def, x, y) {
  const f = radiusFactor(def, y);
  const rx = def.rx * f, rz = def.rz * f;
  if (rx <= 1e-6 || Math.abs(x) >= rx) return 0;
  const u = x / rx;
  return rz * Math.sqrt(1 - u * u);
}
/* Surface point at height y in horizontal direction (hx, hz); writes pos and normal. */
function surfacePoint(def, y, hx, hz, pos, nrm) {
  const f = radiusFactor(def, y);
  pos.set(def.rx * f * hx, y, def.rz * f * hz);
  if (def.kind === 'capsule') {
    const d = y - def.cy;
    if (Math.abs(d) <= def.half) nrm.set(hx, 0, hz).normalize();
    else nrm.set(pos.x, d - Math.sign(d) * def.half, pos.z).normalize();
  } else {
    nrm.set(pos.x / (def.rx * def.rx), (y - def.cy) / (def.ry * def.ry), pos.z / (def.rz * def.rz)).normalize();
  }
}

/* Module-scope scratch objects. Nothing below allocates per frame. */
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

/* v9 ride reach (docs/CONTRACT_V9.md "Rendering": hands at the handlebar). The renderer stands the
   rider's group on the deck (SCOOTER.FEET.y), between the feet (the mean of FEET front and back z),
   at its character scale, with the rig facing along the scooter. A grip at SCOOTER.BAR is therefore
   ((+-halfWidth), BAR.y - FEET.y, BAR.z - feetZ) / scale in the group frame, minus the rig drop.
   Each rig's arms are solved toward those grips from its own shoulders: pitch, splay and a length
   factor (scale y of the arm group, which reads as a bent elbow; 1 when the arm reaches as built).
   The numbers come from vehicles.js so a retuned bar moves the hands with it; the fallbacks match
   vehicles.js when an export is missing. */
const RIDE_SC = VEHICLES.SCOOTER || {};
const RIDE_BAR = RIDE_SC.BAR && Number.isFinite(RIDE_SC.BAR.y) && Number.isFinite(RIDE_SC.BAR.z) && Number.isFinite(RIDE_SC.BAR.halfWidth)
  ? RIDE_SC.BAR : { y: 0.687, z: 0.321, halfWidth: 0.17 };
const RIDE_FEET = RIDE_SC.FEET && Number.isFinite(RIDE_SC.FEET.y) && Number.isFinite(RIDE_SC.FEET.front) && Number.isFinite(RIDE_SC.FEET.back)
  ? RIDE_SC.FEET : { y: 0.12, front: 0.0, back: -0.26 };
const RIDE_FEET_Z = (RIDE_FEET.front + RIDE_FEET.back) / 2;
const RIDE_K_MIN = 0.3, RIDE_K_MAX = 1.25;   // the arm length factor range (0.3 keeps a hand shape on long arms)
const rideReachCache = new Map();
const _rm = new THREE.Matrix4(), _rpre = new THREE.Matrix4(), _rtorso = new THREE.Matrix4();
const _rq = new THREE.Quaternion(), _re = new THREE.Euler(), _rs = new THREE.Vector3();
const _rp = new THREE.Vector3(), _rtip = new THREE.Vector3(), _rgoal = new THREE.Vector3(), _rpost = new THREE.Vector3();
const RIDE_TORSO0 = new THREE.Vector3(0, 0, 0);   // the alien torso pivot sits at the rig origin
function localMatrix(o, out) { return out.compose(o.position, o.quaternion, o.scale); }

/* One arm: { x, z, k } (rotation x, rotation z on top of rz0, length factor) that brings the hand
   to the goal (rig frame) with the torso at torsoM, by a coarse then fine grid on the two angles
   and a sweep of the length, three rounds. Null when the hand does not hang under the arm or the
   arm is not inside the rig. */
function solveArmReach(rig, torso, torsoM, arm, armY, hand, rz0, goal) {
  const chain = [];
  let o = arm.parent;
  for (; o && o !== rig; o = o.parent) chain.push(o);
  if (o !== rig) return null;
  _rpre.identity();
  for (let i = chain.length - 1; i >= 0; i--) _rpre.multiply(chain[i] === torso ? torsoM : localMatrix(chain[i], _rm));
  _rpost.copy(hand.position);
  for (o = hand.parent; o && o !== arm; o = o.parent) _rpost.applyMatrix4(localMatrix(o, _rm));
  if (o !== arm) return null;
  _rp.set(arm.position.x, armY, arm.position.z);
  const order = arm.rotation.order;
  const dist = (rx, rz, k) => {
    _re.set(rx, 0, rz0 + rz, order); _rq.setFromEuler(_re);
    _rs.set(1, k, 1);
    _rm.compose(_rp, _rq, _rs);
    _rtip.copy(_rpost).applyMatrix4(_rm).applyMatrix4(_rpre);
    return _rtip.distanceTo(goal);
  };
  const best = { x: -1.2, z: 0, k: 1, d: Infinity };
  const tryAt = (rx, rz, k) => { const d = dist(rx, rz, k); if (d < best.d) { best.x = rx; best.z = rz; best.k = k; best.d = d; } };
  for (let i = 0; i <= 41; i++) for (let j = 0; j <= 30; j++) tryAt(-3.1 + i * 0.1, -1.5 + j * 0.1, 1);
  for (let round = 0; round < 3; round++) {
    const k = best.k;
    let cx = best.x, cz = best.z;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) tryAt(cx + i * 0.04, cz + j * 0.04, k);
    cx = best.x; cz = best.z;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) tryAt(cx + i * 0.008, cz + j * 0.008, k);
    for (let kk = RIDE_K_MIN; kk <= RIDE_K_MAX + 1e-9; kk += 0.01) tryAt(best.x, best.z, kk);
  }
  return Number.isFinite(best.d) ? best : null;
}

/* Both arms of a rig for the ride pose, cached by rig kind and character scale. lean, sy, sxz, rigY
   are the ride targets; torsoPos the torso's base position. Returns { lx, lz, ls, rx, rz, rs } or
   null (the caller keeps its fixed fallback). */
function rideReach(key, handle, armL, armR, handL, handR, armLY, armRY, rzL0, rzR0, torsoPos, lean, sy, sxz, rigY) {
  const sc = handle.group && Number.isFinite(handle.group.scale.y) && handle.group.scale.y > 0 ? handle.group.scale.y : 1;
  const ck = key + '|' + sc.toFixed(3);
  if (rideReachCache.has(ck)) return rideReachCache.get(ck);
  _re.set(lean, 0, 0); _rq.setFromEuler(_re); _rs.set(sxz, sy, sxz);
  _rtorso.compose(torsoPos, _rq, _rs);
  const gy = (RIDE_BAR.y - RIDE_FEET.y) / sc - rigY, gz = (RIDE_BAR.z - RIDE_FEET_Z) / sc, gx = RIDE_BAR.halfWidth / sc;
  const sideL = armL.position.x > 0 ? 1 : -1, sideR = armR.position.x < 0 ? -1 : 1;
  _rgoal.set(sideL * gx, gy, gz);
  const L = solveArmReach(handle.rig, handle.torso, _rtorso, armL, armLY, handL, rzL0, _rgoal);
  _rgoal.set(sideR * gx, gy, gz);
  const R = solveArmReach(handle.rig, handle.torso, _rtorso, armR, armRY, handR, rzR0, _rgoal);
  const out = L && R ? { lx: L.x, lz: L.z, ls: L.k, rx: R.x, rz: R.z, rs: R.k, dL: L.d, dR: R.d } : null;
  rideReachCache.set(ck, out);
  return out;
}

/* Pose channel indices for the per-handle Float32Arrays. */
const CH_TORSO_Y = 0, CH_LEAN = 1, CH_SCALE_Y = 2, CH_SCALE_XZ = 3,
  CH_ARM_LX = 4, CH_ARM_RX = 5, CH_ARM_LZ = 6, CH_ARM_RZ = 7, CH_ARM_LY = 8, CH_ARM_RY = 9,
  CH_LEG_LX = 10, CH_LEG_RX = 11, CH_ANT_X = 12, CH_ANT_Z0 = 13, CH_ANT_Z1 = 14,
  CH_EYE_SCALE = 15, CH_EYE_PITCH = 16, CH_PUPIL_Y = 17, CH_RIG_Y = 18, CH_SWAY_Z = 19,
  CH_MOUTH_SX = 20, CH_MOUTH_SY = 21, CH_PUPIL_X = 22,
  CH_HEAD_X = 23, CH_HEAD_Z = 24, CH_PITCH = 25,
  CH_TORSO_YAW = 26, CH_HEAD_Y = 27, CH_LEG_XOFF = 28,   // v5: torso twist, head turn, feet apart (golf)
  CH_ARM_LS = 29, CH_ARM_RS = 30;                        // v9: arm length factor (ride reach), 1 at rest
const CH_COUNT = 31;
const BLEND_SECONDS = 0.3;
let nextUid = 1;

/* Arm geometry shared by every alien: shoulder pivot, capsule r 0.06 length 0.24, tip at -0.36. */
const ARM_REST_Z = 0.12;
const HAND_Y = -0.34;
/* Hip pivots sit at x +-LEG_X; the golf stance pushes them outward through CH_LEG_XOFF. */
const LEG_X = 0.13;

/* Swim depth from the contract: body center at y about -0.12 while pitched 1.2 rad. */
const SWIM_PITCH = 1.2;
const SWIM_CENTER_Y = -0.12;
const DIVE_PITCH = 1.5;

function mesh(geo, mat, castShadow) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = castShadow;
  m.receiveShadow = false;
  return m;
}

function smooth01(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}
function wrapPi(x) {
  x = x % TAU;
  if (x > Math.PI) x -= TAU; else if (x < -Math.PI) x += TAU;
  return x;
}

/* ------------------------------------------------------------------ */

export function makeAlienMesh(seed, colorHex, opts = {}) {
  const castShadow = opts.castShadow !== false;
  const hex = normalizeHex(colorHex);
  const r = seededRng(seed);

  // Trait order matters: shape, eyes, antennae, spotted, accent hue, idle yaw, spots.
  const shape = ['blob', 'tall', 'squat', 'blob', 'pear'][Math.floor(r() * 5)];
  const eyes = [1, 2, 2, 3][Math.floor(r() * 4)];
  const antennae = [0, 1, 2, 2][Math.floor(r() * 4)];
  const spotted = r() < 0.55;
  const baseHsl = hexToHsl(hex);
  const accentHue = (baseHsl.h + 150 + Math.floor(r() * 60)) % 360;
  const idleYaw = (r() - 0.5) * 0.6;

  const def = SHAPES[shape];
  const faceDef = def.head || def;
  const bodyTop = def.top;

  const bodyMat = bodyMaterial(hex);
  const spotMat = spotMaterial(hex);
  const tipMat = tipMaterial(accentHue);
  const whiteMat = eyeWhiteMaterial();
  const pupilMat = pupilMaterial();
  const hiMat = highlightMaterial();

  const group = new THREE.Group();
  group.name = 'alien';
  const rig = new THREE.Group();     // yaw, pitch (swim and dive), report hop, seat drop
  rig.name = 'rig';
  rig.rotation.order = 'YXZ';        // pitch about the alien's own x axis, then yaw
  const torso = new THREE.Group();   // bob, lean, breath; legs stay outside
  torso.name = 'torso';
  group.add(rig);
  rig.add(torso);

  /* Body */
  let body;
  if (def.kind === 'capsule') {
    body = mesh(capsuleGeo(def.R, def.half * 2), bodyMat, castShadow);
    body.position.y = def.cy;
  } else {
    body = mesh(sphereGeo(1, 24, 16), bodyMat, castShadow);
    body.scale.set(def.rx, def.ry, def.rz);
    body.position.y = def.cy;
  }
  body.name = 'body';
  torso.add(body);

  /* Head group: pivot for the slow look-around and the pose head tilts.
     For the pear it carries the head sphere; for the others it carries the face. */
  // CONTRACT: the bible gives no head pivot for single-volume bodies; the pivot sits
  // 0.08 below the eye line so a yaw turns the face without shearing the body.
  const eyeY = 0.70 * bodyTop;
  const headPivotY = def.head ? 0.56 : eyeY - 0.08;
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  headGroup.position.y = headPivotY;
  torso.add(headGroup);

  let head;
  if (def.head) {
    head = mesh(sphereGeo(1, 24, 16), bodyMat, castShadow);
    head.scale.set(def.head.rx, def.head.ry, def.head.rz);
    head.position.y = def.head.cy - headPivotY;
    head.name = 'headSphere';
    headGroup.add(head);
  }

  /* Eyes */
  const eyePivot = new THREE.Group();
  eyePivot.name = 'eyes';
  const pivotZ = surfaceZ(faceDef, 0, eyeY) - 0.02;
  eyePivot.position.set(0, eyeY - headPivotY, pivotZ);
  headGroup.add(eyePivot);

  let eyeR, pupilR, pupilZ;
  const eyeXs = [], eyeDys = [];
  if (eyes === 1) { eyeR = 0.14; pupilR = 0.08; pupilZ = 0.10; eyeXs.push(0); eyeDys.push(0); }
  else if (eyes === 2) { eyeR = 0.10; pupilR = 0.055; pupilZ = 0.075; eyeXs.push(-0.13, 0.13); eyeDys.push(0, 0); }
  else { eyeR = 0.085; pupilR = 0.045; pupilZ = 0.075; eyeXs.push(-0.16, 0, 0.16); eyeDys.push(0, 0.06, 0); }

  const eyeGroups = [], eyeMeshes = [], pupils = [], lids = [], highlights = [];
  // CONTRACT: the bible offsets the highlight from the eye center by (-0.02, 0.022, 0.03);
  // the bead is placed on the pupil surface in that direction instead so it never sinks
  // into the white when the pupil shifts.
  _v.set(-0.02, 0.022, 0.03).normalize();
  for (let i = 0; i < eyes; i++) {
    const ex = eyeXs[i], dy = eyeDys[i];
    const ez = surfaceZ(faceDef, ex, eyeY + dy) - 0.02 - pivotZ;
    const eg = new THREE.Group();
    eg.position.set(ex, dy, ez);
    eyePivot.add(eg);
    eyeGroups.push(eg);

    const white = mesh(sphereGeo(eyeR), whiteMat, castShadow);
    white.name = 'eye';
    eg.add(white);
    eyeMeshes.push(white);

    const pupil = mesh(sphereGeo(pupilR), pupilMat, castShadow);
    pupil.position.set(0, 0, pupilZ);
    pupil.userData.baseY = 0;
    pupil.userData.inward = -Math.sign(ex);   // direction toward the face center; 0 for a middle eye
    pupil.name = 'pupil';
    eg.add(pupil);
    pupils.push(pupil);

    const hi = mesh(sphereGeo(0.018, 12, 8), hiMat, false);
    hi.position.copy(_v).multiplyScalar(pupilR - 0.004);
    hi.name = 'highlight';
    pupil.add(hi);
    highlights.push(hi);

    const lid = mesh(sphereGeo(eyeR + 0.005, 24, 16, Math.PI / 2), bodyMat, castShadow);
    lid.visible = false;
    lid.name = 'lid';
    eg.add(lid);
    lids.push(lid);
  }

  /* Mouth: a small rounded box in the darker body shade, bedded into the face.
     Its local x is across the face and local y is up the face, so the animator
     scales it per state (narrow and tall when slumped, taller while typing). */
  const mouthY = eyeY - 0.12;
  const mouth = mesh(roundedBoxGeo(0.10, 0.024, 0.03, 2, 0.011), spotMat, castShadow);
  surfacePoint(faceDef, mouthY, 0, 1, _v, _n);
  _v.addScaledVector(_n, -0.008);
  mouth.position.set(_v.x, _v.y - headPivotY, _v.z);
  _q.setFromUnitVectors(_zAxis, _n);
  mouth.quaternion.copy(_q);
  mouth.name = 'mouth';
  headGroup.add(mouth);

  /* Antennae */
  const antennaGroups = [], antennaTips = [], antBaseX = [], antBaseZ = [];
  const antPivotY = bodyTop - 0.02;
  const stalkLen = antennae === 1 ? 0.24 : 0.20;
  for (let i = 0; i < antennae; i++) {
    const g = new THREE.Group();
    const side = antennae === 1 ? 0 : (i === 0 ? -1 : 1);
    g.position.set(side * 0.10, antPivotY - headPivotY, 0);
    const bx = -0.10, bz = -side * 0.25;   // tilted back 0.10 and outward 0.25
    antBaseX.push(bx); antBaseZ.push(bz);
    g.rotation.set(bx, 0, bz);
    g.name = 'antenna';

    const stalk = mesh(capsuleGeo(0.025, stalkLen), bodyMat, castShadow);
    stalk.position.y = stalkLen / 2 + 0.025;
    stalk.name = 'stalk';
    g.add(stalk);

    const tip = mesh(sphereGeo(0.05, 16, 12), tipMat, castShadow);
    tip.position.y = stalkLen + 0.05 - 0.01;
    tip.name = 'tip';
    g.add(tip);
    antennaTips.push(tip);

    headGroup.add(g);
    antennaGroups.push(g);
  }

  /* Arms: shoulder pivots on the body side at 0.62 of the body top. Each carries a
     hand attach point (Object3D) at the capsule tip where props are parented. */
  const shoulderY = 0.62 * bodyTop;
  const shoulderX = Math.max(0.16, def.rx * radiusFactor(def, shoulderY) - 0.02);
  function makeArm(sign) {
    const g = new THREE.Group();
    g.position.set(sign * shoulderX, shoulderY, 0);
    g.rotation.z = sign * ARM_REST_Z;
    g.name = sign < 0 ? 'armL' : 'armR';
    const cap = mesh(capsuleGeo(0.06, 0.24), bodyMat, castShadow);
    cap.position.y = -0.18;
    g.add(cap);
    const hand = new THREE.Object3D();
    hand.position.y = HAND_Y;
    hand.name = sign < 0 ? 'handL' : 'handR';
    g.add(hand);
    torso.add(g);
    return { arm: g, hand };
  }
  const left = makeArm(-1), right = makeArm(1);
  const armL = left.arm, armR = right.arm, handL = left.hand, handR = right.hand;

  /* Legs: hip pivots at y 0.19 so rotation x swings the whole leg and foot.
     The foot ellipsoid rests with its underside exactly at y 0 (center 0.055, half
     height 0.055). While walking the swing tilts it below the ground, so the animator
     lifts the rig by the swing dip (see CH_RIG_Y in the walk branch). */
  const hipY = 0.19;
  function makeLeg(sign) {
    const g = new THREE.Group();
    g.position.set(sign * LEG_X, hipY, 0);
    g.name = sign < 0 ? 'legL' : 'legR';
    const cap = mesh(capsuleGeo(0.07, 0.08), bodyMat, castShadow);
    cap.position.y = 0.11 - hipY;
    g.add(cap);
    const foot = mesh(sphereGeo(0.10, 16, 12), bodyMat, castShadow);
    foot.scale.set(1.0, 0.55, 1.10);
    foot.position.set(0, 0.055 - hipY, 0.03);
    g.add(foot);
    rig.add(g);
    return g;
  }
  const legL = makeLeg(-1), legR = makeLeg(1);

  /* Spots: five flattened spheres on the back and sides of the lower body. */
  const spots = [];
  if (spotted) {
    for (let i = 0; i < 5; i++) {
      const y = def.cy + (r() - 0.5) * 1.3 * def.ry;
      const psi = Math.PI / 2 + 0.2 + r() * (Math.PI - 0.4);   // z stays at or below about -0.2 of the radius
      surfacePoint(def, y, Math.sin(psi), Math.cos(psi), _v, _n);
      _v.addScaledVector(_n, -0.006);
      const spot = mesh(sphereGeo(0.05, 16, 12), spotMat, castShadow);
      spot.position.copy(_v);
      _q.setFromUnitVectors(_zAxis, _n);
      spot.quaternion.copy(_q);
      spot.scale.set(1, 1, 0.35);
      spot.name = 'spot';
      torso.add(spot);
      spots.push(spot);
    }
  }

  /* Selection ring: flat on the ground, invisible until the renderer shows it. */
  const ring = new THREE.Mesh(ringGeo(), new THREE.MeshBasicMaterial({
    color: 0x75CCD0, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  ring.visible = false;
  ring.castShadow = false;
  ring.receiveShadow = false;
  ring.name = 'ring';
  // The ring material is private to this alien; mark it as owned once the uid exists (below).
  group.add(ring);

  /* Seat drop: with the legs swung forward the body is the lowest part, so the drop
     that lands the bottom on a seat surface at y 0 is the body's own bottom plus a
     little cushion sink. Alien local units; the renderer's group scale (ALIEN_SCALE)
     turns it into world units. */
  // CONTRACT: the v2 contract suggests about 0.18 * ALIEN_SCALE; that would sink these
  // bodies into the seat because their bottoms already sit near the ground, so the drop
  // follows the shape (0.03 to 0.14) and is exposed as parts.seatY as required.
  const seatY = def.bottom + 0.03;

  const cur = new Float32Array(CH_COUNT);
  const from = new Float32Array(CH_COUNT);
  const target = new Float32Array(CH_COUNT);
  // Rest pose so the first frame does not blend from zeros.
  cur[CH_SCALE_Y] = 1; cur[CH_SCALE_XZ] = 1; cur[CH_EYE_SCALE] = 1;
  cur[CH_ARM_LZ] = -ARM_REST_Z; cur[CH_ARM_RZ] = ARM_REST_Z;
  cur[CH_MOUTH_SX] = 1; cur[CH_MOUTH_SY] = 1;
  cur[CH_ARM_LS] = 1; cur[CH_ARM_RS] = 1;
  from.set(cur);

  const poseState = {
    pose: '', prevPose: '',
    target, cur, from, blendT: BLEND_SECONDS, key: -1,
    yaw: idleYaw, lookYaw: 0, lastLookAt: null, lookStart: -10, lookSign: 1,
    twitch: 0, lastCycle: 0, hopMin: 0, landT: -10, tapL: 0, tapR: 0, sip: 0,
    golfAnt: 0,          // last frame's golf torso twist, so the antennae lag it by one frame
    rideRoll: 0,         // eased roll of the rig while riding (follows handle.leanZ)
    // v10: the walk cycle in stride cycles, the last handle.distance seen, the eased swing boost,
    // the turn shuffle phase and direction, and the fidget phase (from the seeded idle yaw)
    walkPhase: 0, lastDist: NaN, walkBoost: 1, turnPhase: 0, turnSign: 1,
    fidgetPhase: ((idleYaw + 0.3) / 0.6) * TAU,
    shoulderY, antBaseX, antBaseZ, bodyCy: def.cy, seatY,
    // v11: the eased airborne crouch (0..1) for pose 'hover', the hat worn and its anchor on the head group
    air: 0, hatShown: null, hatY: hatAnchor(faceDef).y - headPivotY, hatR: hatAnchor(faceDef).r,
  };

  const handle = {
    group, rig, torso, headGroup,
    seed,
    uid: nextUid++,
    castShadow,
    traits: { shape, eyes, antennae, spotted, idleYaw, accentHue },
    parts: {
      body, head, eyes: eyeMeshes, pupils, lids, highlights, eyeGroups, eyePivot,
      antennae: antennaGroups, antennaTips, armL, armR, legL, legR, ring, spots, mouth,
      handL, handR, seatY,
      hats: null,        // v11: { cap, beanie, crown, cowboy, visor } groups once a hat was worn
    },
    hat: null,           // v11: the hat worn ('cap' | 'beanie' | 'crown' | 'cowboy' | 'visor' | null); the animator applies a change
    airborne: false,     // v11: the renderer writes true while the hoverboard is in the air (pose 'hover' crouches)
    color: new THREE.Color(hex),
    accent: tipMat.color,
    materials: { body: bodyMat, spots: spotMat, tip: tipMat },
    poseState,
    anim: poseState,
    sipPhase: null,      // leisure3d writes 0..1 (1 = hand at the mouth); null lets the sit pose run its own 2.5 s cycle
    swingPhase: 0,       // the swings activity writes -1..1 (forward positive)
    golfPhase: 0,        // the renderer writes 0..1 while the player swings (pose 'golf'); 0 is the address
    leanZ: 0,            // the renderer writes the scooter lean (rad) while riding (pose 'ride')
    distance: null,      // v10: the renderer writes world units traveled (monotonic); null falls back to time
    turnRate: 0,         // v10: the renderer writes the body yaw rate (rad/s, signed) for pose 'turn'
    opacity: 1,
    ownMaterials: null,  // Map of shared material to this alien's private clone, created on the first fade
    disposed: false,
  };
  ring.material.userData.ownedBy = handle.uid;
  rig.rotation.y = idleYaw;
  group.userData.kind = 'alien';
  group.userData.handle = handle;
  return handle;
}

/* ------------------------------------------------------------------ */
/* Pose resolution: an explicit override wins, then the sim's agent.pose, then the
   v1 state mapping for sims that do not set a pose. */

function resolvePose(agent, poseOverride) {
  if (typeof poseOverride === 'string' && poseOverride) return poseOverride;
  if (typeof agent.pose === 'string' && agent.pose) return agent.pose;
  const state = agent.state || 'idle';
  if (state === 'commute' || (state === 'idle' && agent.path && agent.path.length)) return 'walk';
  if (state === 'working') return 'work';
  if (state === 'report') return 'hop';
  if (state === 'error') return 'slump';
  return 'stand';
}

/* Poses whose facing follows agent.moveDir. */
function followsMoveDir(pose) {
  return pose === 'walk' || pose === 'sit' || pose === 'swim' || pose === 'dive' || pose === 'climb' || pose === 'push' || pose === 'ride' || pose === 'turn' || pose === 'hover' || pose === 'boat';
}

/* Working style typing targets shared by work and type. */
function typingTargets(T, a, agent, dt) {
  const animT = agent.animT || 0;
  const cycle = animT % 3.2;
  const burst = cycle >= 0.7;
  T[CH_ARM_LX] = -1.15; T[CH_ARM_RX] = -1.15;
  T[CH_ARM_LZ] = -0.05; T[CH_ARM_RZ] = 0.05;
  T[CH_LEAN] = 0.10;
  // Pupils converge toward the desk and the mouth opens a little, as the legacy sprite did while typing.
  T[CH_PUPIL_X] = 0.014;
  if (burst) {
    const s8 = Math.sin(TAU * 8 * animT);
    T[CH_ARM_LY] = 0.04 * Math.max(0, s8);
    T[CH_ARM_RY] = 0.04 * Math.max(0, -s8);
    T[CH_EYE_PITCH] = 0.05;
    T[CH_MOUTH_SY] = 1.4;
  } else {
    T[CH_EYE_PITCH] = 0.13;
    T[CH_MOUTH_SY] = 1.15;
  }
  if (a.lastCycle < 0.7 && cycle >= 0.7) a.twitch = 1;
  a.lastCycle = cycle;
  a.twitch *= Math.exp(-dt / 0.12);
  T[CH_ANT_X] = -0.3 * a.twitch;
}

/* Seated base shared by sit and swing: legs forward, body dropped by seatY, arms in the lap. */
function seatedTargets(T, a) {
  T[CH_RIG_Y] = -a.seatY;
  T[CH_LEG_LX] = -1.35; T[CH_LEG_RX] = -1.35;
  T[CH_LEAN] = -0.04;
  T[CH_ARM_LX] = -0.55; T[CH_ARM_RX] = -0.55;
  T[CH_ARM_LZ] = -0.06; T[CH_ARM_RZ] = 0.06;
}

/* ------------------------------------------------------------------ */
/* Golf (docs/GOLF_DESIGN.md "Swing and HUD", alien table). Keyframes on handle.golfPhase at
   GOLF_KEYS: address, halfway back, top of the backswing, impact, follow-through, finish.
   The rig lifts an arm forward with a negative rotation.x, so the design's arm x values are
   mirrored; the z columns keep the design's direction (positive swings a hand toward the
   character's right, where the backswing goes; the target is on the left). Head pitch is
   positive downward here, so the design's -0.35 "looking at the ball" becomes +0.35.
   CONTRACT: the magnitudes are retuned against the contract's wording rather than copied from
   the design table: the address hangs the hands lower (x 0.6, not 0.9, so both hands sit
   together low in front of the leaned torso) and the finish lifts the arms overhead instead
   of sideways (x -2.75 with a small z, so the hands end high and left of the twisted chest). */

const GOLF_KEYS = [0, 0.25, 0.5, 0.62, 0.8, 1.0];
const GOLF_TORSO_YAW = [0, 0.55, 0.95, -0.1, -0.9, -1.1];
const GOLF_LEAN = [0.25, 0.22, 0.20, 0.28, 0.15, 0.05];
const GOLF_ARM_LX = [-0.6, -0.5, -2.9, -0.7, -1.9, -2.75];
const GOLF_ARM_LZ = [0.5, 1.3, 0.6, 0.5, -0.6, -0.35];
const GOLF_ARM_RX = [-0.6, -0.4, -2.75, -0.7, -1.7, -2.85];
const GOLF_ARM_RZ = [-0.5, 0.3, -0.25, -0.5, -1.1, -0.25];
const GOLF_HEAD_YAW = [0, 0.1, 0.15, 0, -0.6, -0.8];
const GOLF_HEAD_PITCH = [0.35, 0.3, 0.25, 0.35, 0.05, -0.1];
const GOLF_BOB = [0, 0, -0.02, 0, 0.01, 0.03];
const GOLF_LEG_LX = [0.1, 0.1, 0.1, 0.05, -0.15, -0.3];
const GOLF_LEG_RX = [-0.1, 0, 0.25, -0.1, -0.1, -0.1];
const GOLF_ANT_X = [0, -0.1, -0.3, 0, 0.05, 0.1];
const GOLF_MOUTH_SX = [1, 0.9, 0.8, 0.85, 1.1, 1.3];
const GOLF_FEET = 0.03;   // extra hip offset per side: the address stance stands about 0.32 wide

/* Segment lookup for a phase 0..1: writes the segment index and its eased parameter into out
   (a two-slot scratch array), allocation free. The downswing (0.5 to 0.62) eases in so the club
   accelerates into impact; the follow-through settles into the finish with a smoothstep.
   CONTRACT: GOLF_DESIGN bends the second half with k = 0.5 + 0.5 u^0.6, which puts the impact
   keyframe at phase 0.55 while the player strikes the ball at swingT 0.62; the lookup here stays
   linear in phase so the impact frame lands on the strike, and the speed-up lives inside the
   downswing segment instead. */
const _golfSeg = [0, 0];
function golfSegment(phase, out) {
  let i = 0;
  while (i < GOLF_KEYS.length - 2 && phase >= GOLF_KEYS[i + 1]) i++;
  let t = (phase - GOLF_KEYS[i]) / (GOLF_KEYS[i + 1] - GOLF_KEYS[i]);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  if (i === 0) t = t * t;                         // ease away from the still address
  else if (i === 1) t = 1 - (1 - t) * (1 - t);    // decelerate into the top
  else if (i === 2) t = t * t;                    // whip down into impact
  else if (i === 4) t = smooth01(t);              // settle into the finish
  out[0] = i; out[1] = t;
}
function gk(row, i, t) { return row[i] + (row[i + 1] - row[i]) * t; }

/* Address stance and swing. golfIdle is the address (phase 0) with breathing; golf reads
   handle.golfPhase. The torso twist, the head turn and the feet width use the v5 channels. */
function golfTargets(T, a, handle, pose, time) {
  let phase = pose === 'golf' ? handle.golfPhase : 0;
  if (!(phase >= 0)) phase = 0; else if (phase > 1) phase = 1;
  golfSegment(phase, _golfSeg);
  const i = _golfSeg[0], t = _golfSeg[1];
  const yaw = gk(GOLF_TORSO_YAW, i, t);
  T[CH_TORSO_YAW] = yaw;
  T[CH_LEAN] = gk(GOLF_LEAN, i, t);
  T[CH_TORSO_Y] = gk(GOLF_BOB, i, t);
  T[CH_ARM_LX] = gk(GOLF_ARM_LX, i, t); T[CH_ARM_LZ] = gk(GOLF_ARM_LZ, i, t);
  T[CH_ARM_RX] = gk(GOLF_ARM_RX, i, t); T[CH_ARM_RZ] = gk(GOLF_ARM_RZ, i, t);
  T[CH_HEAD_Y] = gk(GOLF_HEAD_YAW, i, t);
  T[CH_HEAD_X] = gk(GOLF_HEAD_PITCH, i, t);
  const legL = gk(GOLF_LEG_LX, i, t), legR = gk(GOLF_LEG_RX, i, t);
  T[CH_LEG_LX] = legL; T[CH_LEG_RX] = legR;
  // A tilted planted foot dips a little below y 0; lift the rig by the larger dip, as the walk does.
  T[CH_RIG_Y] = 0.16 * (1 - Math.cos(Math.max(Math.abs(legL), Math.abs(legR))));
  T[CH_LEG_XOFF] = GOLF_FEET;
  T[CH_ANT_X] = gk(GOLF_ANT_X, i, t);
  // Antennae swing with the twist at 0.4 of its yaw, one frame behind (rotation z tilts them sideways).
  T[CH_ANT_Z0] = 0.4 * a.golfAnt; T[CH_ANT_Z1] = 0.4 * a.golfAnt;
  a.golfAnt = yaw;
  T[CH_MOUTH_SX] = gk(GOLF_MOUTH_SX, i, t);
  // Eyes on the ball through impact, then up toward the target.
  T[CH_EYE_PITCH] = 0.12 * (1 - Math.max(0, (phase - 0.62) / 0.38));
  T[CH_PUPIL_Y] = -0.02 * (1 - Math.max(0, (phase - 0.62) / 0.38));
  if (phase >= 0.5 && phase < 0.7) T[CH_EYE_SCALE] = 0.94;   // squint through the downswing
  else if (phase >= 0.8) T[CH_EYE_SCALE] = 1.05;
  if (pose === 'golfIdle') {
    const br = 0.5 + 0.5 * Math.sin(TAU * 0.6 * time);
    T[CH_SCALE_Y] = 1 + 0.02 * br;
    T[CH_SCALE_XZ] = 1 - 0.008 * br;
  }
}

/* ------------------------------------------------------------------ */

/* `time` must be the simulation clock, TT.state.time (seconds since load, advanced by
   TT.sim.tick). agent.blinkAt and agent.lookAt are written by sim.js in those units, so
   passing performance.now or a rAF timestamp would mean the aliens never blink or look.
   When the renderer omits `time`, the simulation clock is read from window.TT.
   `poseOverride` (string or undefined) wins over agent.pose. */
export function animateAlien(handle, agent, time, dt, poseOverride) {
  if (!handle || handle.disposed || !agent) return;
  if (!(time >= 0)) {
    const TT = typeof window !== 'undefined' ? window.TT : null;
    time = TT && TT.state && TT.state.time > 0 ? TT.state.time : 0;
  }
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.05) dt = 0.05;
  const a = handle.poseState, P = handle.parts, T = a.target, traits = handle.traits;
  // v11: a hat change written on the handle, and the airborne crouch eased over about 0.1 s
  if (handle.hat !== a.hatShown) setAlienHat(handle, handle.hat);
  a.air += ((handle.airborne ? 1 : 0) - a.air) * (1 - Math.exp(-12 * dt));
  if (!handle.airborne && a.air < 1e-4) a.air = 0;

  const state = agent.state || 'idle';
  const working = state === 'working';
  const pose = resolvePose(agent, poseOverride);
  if (pose !== a.pose) {
    a.from.set(a.cur);
    // Arm pitch may have wound through several turns while swimming; blend from the nearest turn.
    a.from[CH_ARM_LX] = wrapPi(a.from[CH_ARM_LX]);
    a.from[CH_ARM_RX] = wrapPi(a.from[CH_ARM_RX]);
    a.blendT = 0;
    a.prevPose = a.pose;
    a.pose = pose;
    if (pose === 'hop') a.hopMin = 0;
    // The swing starts from the address it was already holding, and a 0.3 s blend would smear a
    // 0.35 s swing, so golfIdle to golf switches without blending (the reverse eases as usual).
    if (pose === 'golf' && a.prevPose === 'golfIdle') a.blendT = BLEND_SECONDS;
  }

  /* Rest pose */
  T[CH_TORSO_Y] = 0; T[CH_LEAN] = 0; T[CH_SCALE_Y] = 1; T[CH_SCALE_XZ] = 1;
  T[CH_ARM_LX] = 0; T[CH_ARM_RX] = 0; T[CH_ARM_LZ] = -ARM_REST_Z; T[CH_ARM_RZ] = ARM_REST_Z; T[CH_ARM_LY] = 0; T[CH_ARM_RY] = 0;
  T[CH_LEG_LX] = 0; T[CH_LEG_RX] = 0; T[CH_ANT_X] = 0; T[CH_ANT_Z0] = 0; T[CH_ANT_Z1] = 0;
  T[CH_EYE_SCALE] = 1; T[CH_EYE_PITCH] = 0; T[CH_PUPIL_Y] = 0; T[CH_RIG_Y] = 0; T[CH_SWAY_Z] = 0;
  T[CH_MOUTH_SX] = 1; T[CH_MOUTH_SY] = 1; T[CH_PUPIL_X] = 0;
  T[CH_HEAD_X] = 0; T[CH_HEAD_Z] = 0; T[CH_PITCH] = 0;
  T[CH_TORSO_YAW] = 0; T[CH_HEAD_Y] = 0; T[CH_LEG_XOFF] = 0;
  T[CH_ARM_LS] = 1; T[CH_ARM_RS] = 1;

  let lookTarget = 0;
  let sipTarget = 0;

  if (pose === 'walk') {
    /* Walk cycle (v10): the phase comes from the distance traveled when the renderer writes
       handle.distance, else from a cadence of about 3.5 strides per second scaled by speed. Legs and
       arms swing in opposite phase, the torso is highest with the feet together, antennae lag. */
    const commute = state === 'commute';
    const speed = commute ? 2.6 : (agent.speed > 0 ? agent.speed : 1.6);
    const legAmp0 = commute ? 0.65 : 0.55;
    const boost = advanceWalk(a, handle, dt, 3.5 * speed / 1.6, 4 * ALIEN_LEG_REACH * Math.sin(legAmp0), WALK_MAX_HZ);
    const legAmp = legAmp0 * boost;
    const p = a.walkPhase;
    const ss = Math.sin(TAU * p), cc = Math.cos(TAU * p), sw = strideWave(p);
    T[CH_TORSO_Y] = 0.035 * cc * cc;
    T[CH_LEAN] = (commute ? 0.12 : 0.08) + 0.06 * (boost - 1);
    T[CH_LEG_LX] = legAmp * sw;
    T[CH_LEG_RX] = -legAmp * sw;
    // Lift the whole rig by the swing dip so the tilted foot never passes below y 0
    // (the foot's underside sits at y 0 at rest; the hip-to-foot drop is about 0.14).
    T[CH_RIG_Y] = 0.16 * (1 - Math.cos(legAmp));
    T[CH_ARM_LX] = -0.45 * boost * ss;
    T[CH_ARM_RX] = 0.45 * boost * ss;
    T[CH_ANT_X] = -0.20 - 0.12 * Math.sin(TAU * p - 0.1);
  } else if (pose === 'turn') {
    /* Turning in place (v10): small alternating foot shuffles paced by the turn rate, a lean into
       the turn, the head leading it and the arms a little out for balance. */
    const sign = advanceTurn(a, handle, agent, dt);
    const step = Math.sin(TAU * a.turnPhase);
    T[CH_LEG_LX] = 0.22 * step; T[CH_LEG_RX] = -0.22 * step;
    T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.22));
    T[CH_TORSO_Y] = 0.012 * Math.abs(step);
    T[CH_SWAY_Z] = 0.05 * sign;
    T[CH_LEAN] = 0.04;
    T[CH_HEAD_Y] = 0.35 * sign;
    T[CH_HEAD_Z] = -0.04 * sign;
    T[CH_ARM_LX] = 0.15 * step; T[CH_ARM_RX] = -0.15 * step;
    T[CH_ARM_LZ] = -0.35; T[CH_ARM_RZ] = 0.35;
    T[CH_ANT_X] = -0.1;
    T[CH_ANT_Z0] = 0.15 * sign; T[CH_ANT_Z1] = 0.15 * sign;
    T[CH_PUPIL_X] = 0.008 * sign;
  } else if (pose === 'work') {
    /* Working: arms forward and down to the desk, typing bursts outside the pause window. */
    typingTargets(T, a, agent, dt);
  } else if (pose === 'type') {
    /* Typing at a screen: the work pose with the head tilted down toward a screen at y 0.8. */
    typingTargets(T, a, agent, dt);
    T[CH_HEAD_X] = 0.18;
  } else if (pose === 'hop') {
    /* Report: hop from the simulation's yoff, arms up at the peak, eyes wide, squash on landing. */
    const yoff = agent.yoff || 0;
    T[CH_RIG_Y] = Math.max(0, yoff * -0.06);
    const hf = Math.min(1, Math.max(0, -yoff / 3));
    T[CH_EYE_SCALE] = 1.15;
    T[CH_MOUTH_SX] = 1.25;
    T[CH_ARM_LX] = -2.4 * hf; T[CH_ARM_RX] = -2.4 * hf;
    T[CH_ANT_X] = 0.25 * hf;
    if (yoff < a.hopMin) a.hopMin = yoff;
    if (yoff > -0.02 && a.hopMin < -0.6) { a.landT = time; a.hopMin = 0; }
    const lt = time - a.landT;
    if (lt >= 0 && lt < 0.15) {
      const q = 1 - lt / 0.15;
      T[CH_SCALE_Y] = 1 - 0.06 * q;
      T[CH_SCALE_XZ] = 1 + 0.04 * q;
    }
  } else if (pose === 'slump') {
    /* Error slump. Arms hang slightly forward of the leaned torso, antennae droop toward the face. */
    // CONTRACT: the bible lists the slump arms at rotation x +0.30; with the torso leaned
    // forward 0.25 that swings the hands behind the hips, so -0.30 is used to let them hang
    // in front of the body as the legacy sprite drew them.
    T[CH_SCALE_Y] = 0.90;
    T[CH_LEAN] = 0.25;
    T[CH_ARM_LX] = -0.30; T[CH_ARM_RX] = -0.30;
    T[CH_ARM_LZ] = -0.02; T[CH_ARM_RZ] = 0.02;
    T[CH_ANT_X] = 0.9;
    T[CH_ANT_Z0] = 0.3; T[CH_ANT_Z1] = -0.3;
    // Pupils look down and away, mouth narrows into a small dismayed "o" (legacy frown).
    T[CH_PUPIL_Y] = -0.03;
    T[CH_PUPIL_X] = -0.01;
    T[CH_MOUTH_SX] = 0.7; T[CH_MOUTH_SY] = 1.6;
    T[CH_SWAY_Z] = 0.03 * Math.sin(TAU * 0.5 * time);
  } else if (pose === 'wave') {
    /* Hover greeting: right arm up and waving at 2 Hz, head tilted, a smile. Faces +z (see yaw). */
    const wv = Math.sin(TAU * 2 * time);
    T[CH_ARM_RX] = -2.75;
    T[CH_ARM_RZ] = 0.55 + 0.45 * wv;
    T[CH_ARM_LX] = -0.15;
    T[CH_HEAD_Z] = 0.16;
    T[CH_MOUTH_SX] = 1.35;
    T[CH_EYE_SCALE] = 1.06;
    T[CH_ANT_Z0] = 0.08 * wv; T[CH_ANT_Z1] = 0.08 * wv;
    T[CH_SCALE_Y] = 1 + 0.015 * (0.5 + 0.5 * Math.sin(TAU * 0.6 * time));
  } else if (pose === 'sit') {
    /* Seated leisure: legs forward, body dropped by seatY, arms resting. The prop hand rises to
       the mouth: leisure3d drives handle.sipPhase (0..1), else a 2.5 s cycle with a 0.6 s sip. */
    seatedTargets(T, a);
    const br = 0.5 + 0.5 * Math.sin(TAU * 0.6 * time);
    T[CH_SCALE_Y] = 1 + 0.025 * br;
    T[CH_SCALE_XZ] = 1 - 0.01 * br;
    T[CH_ANT_Z0] = 0.05 * Math.sin(TAU * 0.8 * time);
    T[CH_ANT_Z1] = -0.05 * Math.sin(TAU * 0.8 * time + 0.4);
    let holdR = P.handR.children.length > 0;
    const holdL = !holdR && P.handL.children.length > 0;
    const sp = handle.sipPhase;
    if (typeof sp === 'number' && sp >= 0) {
      sipTarget = sp > 1 ? 1 : sp;
      if (!holdL) holdR = true;
    } else if (holdR || holdL) {
      const c = time % 2.5;
      sipTarget = c < 0.6 ? Math.sin(Math.PI * c / 0.6) : 0;
    }
    // Shoulder at the body side, mouth 0.12 below the eye line: pitch -1.75 and roll inward 0.65
    // put the hand tip at the mouth.
    const sipNow = a.sip;
    if (holdR) {
      T[CH_ARM_RX] = -0.55 - 1.2 * sipNow;
      T[CH_ARM_RZ] = 0.06 - 0.65 * sipNow;
    } else if (holdL) {
      T[CH_ARM_LX] = -0.55 - 1.2 * sipNow;
      T[CH_ARM_LZ] = -0.06 + 0.65 * sipNow;
    }
    T[CH_HEAD_X] = 0.12 * sipNow;
    T[CH_MOUTH_SY] = 1 + 0.5 * sipNow;
  } else if (pose === 'swing') {
    /* On the swing: seated, hands up on the chains, legs pumping with the activity's swingPhase. */
    seatedTargets(T, a);
    const sw = handle.swingPhase || 0;
    T[CH_LEG_LX] = -1.35 - 0.6 * sw;
    T[CH_LEG_RX] = -1.35 - 0.6 * sw;
    T[CH_LEAN] = -0.06 - 0.18 * sw;
    T[CH_ARM_LX] = -2.3; T[CH_ARM_RX] = -2.3;
    T[CH_ARM_LZ] = -0.22; T[CH_ARM_RZ] = 0.22;
    T[CH_ANT_X] = -0.35 * sw;
    T[CH_MOUTH_SX] = 1.3;
    T[CH_EYE_SCALE] = 1.05;
  } else if (pose === 'swim') {
    /* Swimming: pitched forward 1.2 rad with the body center at y about -0.12, legs kicking at
       3 Hz, arms paddling in circles, a slight bob. */
    T[CH_PITCH] = SWIM_PITCH;
    T[CH_RIG_Y] = SWIM_CENTER_Y - a.bodyCy * Math.cos(SWIM_PITCH) + 0.03 * Math.sin(TAU * 0.8 * time);
    const kick = Math.sin(TAU * 3 * time);
    T[CH_LEG_LX] = 0.5 * kick;
    T[CH_LEG_RX] = -0.5 * kick;
    const ph = TAU * ((1.2 * time) % 1);
    T[CH_ARM_LX] = wrapPi(-ph);
    T[CH_ARM_RX] = wrapPi(-ph - Math.PI);
    T[CH_ARM_LZ] = -(0.35 + 0.25 * Math.sin(ph));
    T[CH_ARM_RZ] = 0.35 + 0.25 * Math.sin(ph + Math.PI);
    T[CH_HEAD_X] = -0.45;
    T[CH_ANT_X] = -0.35;
    T[CH_MOUTH_SX] = 1.15;
  } else if (pose === 'dive') {
    /* Off the diving board: arms straight overhead, legs together, body pitching from 0 to 1.5 rad
       as agent.jumpT runs 0 to 1, antennae swept back. Pitched about the body center so the arc
       the renderer adds stays smooth. */
    const jt = agent.jumpT > 0 ? (agent.jumpT > 1 ? 1 : agent.jumpT) : 0;
    const pitch = DIVE_PITCH * smooth01(jt);
    T[CH_PITCH] = pitch;
    T[CH_RIG_Y] = a.bodyCy * (1 - Math.cos(pitch));
    T[CH_ARM_LX] = -3.05; T[CH_ARM_RX] = -3.05;
    T[CH_ARM_LZ] = 0.08; T[CH_ARM_RZ] = -0.08;
    T[CH_LEG_LX] = 0; T[CH_LEG_RX] = 0;
    T[CH_ANT_X] = -0.7;
    T[CH_EYE_SCALE] = 1.1;
    T[CH_MOUTH_SX] = 0.8; T[CH_MOUTH_SY] = 1.5;
  } else if (pose === 'climb') {
    /* Ladder: arms reaching up alternately at 2 Hz, legs stepping, body upright. */
    const c2 = Math.sin(TAU * 2 * time);
    T[CH_ARM_LX] = -2.4 + 0.5 * c2;
    T[CH_ARM_RX] = -2.4 - 0.5 * c2;
    T[CH_ARM_LZ] = -0.15; T[CH_ARM_RZ] = 0.15;
    T[CH_LEG_LX] = -0.45 + 0.45 * c2;
    T[CH_LEG_RX] = -0.45 - 0.45 * c2;
    T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.9));
    T[CH_HEAD_X] = -0.25;
    T[CH_ANT_X] = -0.15;
  } else if (pose === 'throw') {
    /* Two handed overhead throw, 1.6 s cycle: wind up, release, follow through, recover. */
    const u = (time % 1.6) / 1.6;
    let armX, lean, eye;
    if (u < 0.45) {
      const k = smooth01(u / 0.45);
      armX = -1.0 - 2.0 * k; lean = -0.18 * k; eye = -0.12 * k;
    } else if (u < 0.6) {
      const k = smooth01((u - 0.45) / 0.15);
      armX = -3.0 + 1.7 * k; lean = -0.18 + 0.40 * k; eye = -0.12 + 0.12 * k;
    } else if (u < 1.0) {
      const k = smooth01((u - 0.6) / 0.4);
      armX = -1.3 + 0.7 * k; lean = 0.22 - 0.12 * k; eye = 0;
    } else {
      const k = smooth01((u - 1.0) / 0.6);
      armX = -0.6 - 0.4 * k; lean = 0.10 - 0.10 * k; eye = 0;
    }
    T[CH_ARM_LX] = armX; T[CH_ARM_RX] = armX;
    T[CH_ARM_LZ] = -0.08; T[CH_ARM_RZ] = 0.08;
    T[CH_LEAN] = lean;
    T[CH_EYE_PITCH] = eye;
    T[CH_HEAD_X] = eye * 1.5;
    T[CH_LEG_LX] = -0.12 * Math.max(0, lean) * 4; T[CH_LEG_RX] = 0.12 * Math.max(0, lean) * 4;
    T[CH_ANT_X] = -0.5 * Math.max(0, lean);
  } else if (pose === 'lookUp') {
    /* Scanning the sky: head and body tilted back 0.5 rad in total, the right hand shading the eyes. */
    T[CH_LEAN] = -0.28;
    T[CH_HEAD_X] = -0.22;
    T[CH_ARM_RX] = -2.5;
    T[CH_ARM_RZ] = -0.5;
    T[CH_ARM_LX] = -0.1;
    T[CH_EYE_PITCH] = -0.1;
    T[CH_PUPIL_Y] = 0.015;
    T[CH_ANT_X] = -0.3;
    T[CH_SCALE_Y] = 1 + 0.02 * (0.5 + 0.5 * Math.sin(TAU * 0.6 * time));
  } else if (pose === 'cheer') {
    /* Both arms up, small bounces, wide smile. */
    const b = Math.abs(Math.sin(TAU * 2.5 * time));
    const sw = Math.sin(TAU * 3 * time);
    T[CH_RIG_Y] = 0.06 * b;
    T[CH_ARM_LX] = -2.9; T[CH_ARM_RX] = -2.9;
    T[CH_ARM_LZ] = -(0.3 + 0.15 * sw); T[CH_ARM_RZ] = 0.3 + 0.15 * sw;
    T[CH_MOUTH_SX] = 1.4; T[CH_MOUTH_SY] = 1.3;
    T[CH_EYE_SCALE] = 1.1;
    T[CH_ANT_X] = 0.2 * b;
    T[CH_SCALE_Y] = 1 + 0.03 * b; T[CH_SCALE_XZ] = 1 - 0.012 * b;
  } else if (pose === 'lever') {
    /* Two hands forward gripping a lever, body rocking back and forth at 0.8 Hz. */
    const rock = Math.sin(TAU * 0.8 * time);
    T[CH_LEAN] = 0.25 * rock;
    T[CH_ARM_LX] = -1.3 + 0.35 * rock; T[CH_ARM_RX] = -1.3 + 0.35 * rock;
    T[CH_ARM_LZ] = 0.05; T[CH_ARM_RZ] = -0.05;
    T[CH_LEG_LX] = 0.18 * rock; T[CH_LEG_RX] = -0.12 * rock;
    T[CH_ANT_X] = -0.25 * rock;
    T[CH_MOUTH_SY] = 1.2;
  } else if (pose === 'paint') {
    /* Painting: the right arm sweeps up and down at 1.2 Hz with the brush point at the hand. */
    const sweep = Math.sin(TAU * 1.2 * time);
    T[CH_ARM_RX] = -1.6 + 0.6 * sweep;
    T[CH_ARM_RZ] = 0.05;
    T[CH_ARM_LX] = -0.35;
    T[CH_HEAD_X] = -0.15 * sweep;
    T[CH_EYE_PITCH] = -0.08 * sweep;
    T[CH_LEAN] = 0.05;
    T[CH_TORSO_Y] = 0.01 * sweep;
    T[CH_ANT_Z0] = 0.05 * sweep; T[CH_ANT_Z1] = -0.05 * sweep;
  } else if (pose === 'push') {
    /* Pushing: leaning into it, arms forward, legs stepping in place. */
    const st = Math.sin(TAU * 2.2 * time);
    T[CH_LEAN] = 0.30;
    T[CH_ARM_LX] = -1.4; T[CH_ARM_RX] = -1.4;
    T[CH_ARM_LZ] = -0.05; T[CH_ARM_RZ] = 0.05;
    T[CH_LEG_LX] = 0.5 * st; T[CH_LEG_RX] = -0.5 * st;
    T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.5));
    T[CH_TORSO_Y] = 0.02 * Math.abs(st);
    T[CH_HEAD_X] = -0.2;
    T[CH_ANT_X] = -0.3;
    T[CH_MOUTH_SX] = 0.85; T[CH_MOUTH_SY] = 1.3;
  } else if (pose === 'point') {
    /* Pointing forward with the right arm, a slight bounce. */
    T[CH_ARM_RX] = -1.5;
    T[CH_ARM_RZ] = 0;
    T[CH_ARM_LX] = -0.1;
    T[CH_RIG_Y] = 0.02 * Math.abs(Math.sin(TAU * 2 * time));
    T[CH_HEAD_X] = -0.05;
    T[CH_MOUTH_SX] = 1.2;
    T[CH_EYE_SCALE] = 1.04;
  } else if (pose === 'balance') {
    /* High wire: feet together, both arms straight out to the sides, the body swaying slowly
       (roll 0.12 rad at 0.7 Hz) with the arms and head counter-tilting to stay level, antennae tense. */
    const roll = 0.12 * Math.sin(TAU * 0.7 * time);
    T[CH_SWAY_Z] = roll;
    T[CH_LEG_LX] = 0; T[CH_LEG_RX] = 0;
    // Arm roll of about a quarter turn points the capsules sideways; the arms are children of the
    // torso, so subtracting the roll (and a little more) tips them against the sway.
    T[CH_ARM_LX] = 0; T[CH_ARM_RX] = 0;
    T[CH_ARM_LZ] = -1.52 - 1.6 * roll;
    T[CH_ARM_RZ] = 1.52 - 1.6 * roll;
    T[CH_HEAD_Z] = -0.6 * roll;
    T[CH_ANT_X] = -0.35;
    T[CH_ANT_Z0] = 0.05; T[CH_ANT_Z1] = -0.05;
    T[CH_EYE_SCALE] = 1.08;
    T[CH_EYE_PITCH] = 0.08;
    T[CH_MOUTH_SX] = 0.8; T[CH_MOUTH_SY] = 1.2;
    T[CH_LEAN] = 0.03;
  } else if (pose === 'golf' || pose === 'golfIdle') {
    /* Golf: address stance, or the swing driven by handle.golfPhase (see golfTargets). */
    golfTargets(T, a, handle, pose, time);
  } else if (pose === 'slide') {
    /* Subway slide: the torso squashes to about 55 percent height (scaled about its origin, so the
       body bottom stays on the ground), pitched back 0.3 rad, arms swept back and a little out,
       legs thrown forward, antennae streaming back, head tipped forward to keep the eyes ahead. */
    T[CH_SCALE_Y] = 0.55;
    T[CH_SCALE_XZ] = 1.12;
    T[CH_LEAN] = -0.3;
    T[CH_TORSO_Y] = 0.04;   // the pitch is about the torso origin, so a small lift keeps the body bottom clear of the ground
    T[CH_ARM_LX] = 1.1; T[CH_ARM_RX] = 1.1;
    T[CH_ARM_LZ] = -0.35; T[CH_ARM_RZ] = 0.35;
    T[CH_LEG_LX] = -1.2; T[CH_LEG_RX] = -1.2;
    T[CH_HEAD_X] = 0.25;
    T[CH_ANT_X] = -0.75;
    T[CH_EYE_SCALE] = 0.94;
    T[CH_EYE_PITCH] = -0.05;
    T[CH_MOUTH_SX] = 0.85; T[CH_MOUTH_SY] = 1.2;
  } else if (pose === 'ride') {
    /* Scooter: left foot forward on the deck, right foot back, a slight knee bend (a small squash),
       leaning forward 0.15 rad, both hands forward and a little down to the bar, head up against
       the lean, antennae streaming back with a faint deck buzz. */
    const buzz = Math.sin(TAU * 9 * time);
    T[CH_LEAN] = 0.15;
    T[CH_LEG_LX] = -0.28; T[CH_LEG_RX] = 0.32;
    T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.32));
    T[CH_SCALE_Y] = 0.96; T[CH_SCALE_XZ] = 1.015;
    T[CH_TORSO_Y] = 0.004 * buzz;
    // Hands on the grips: pitch, splay and length solved from this shape's shoulders (rideReach).
    const rr = rideReach('alien:' + traits.shape, handle, P.armL, P.armR, P.handL, P.handR, a.shoulderY, a.shoulderY,
      0, 0, RIDE_TORSO0, T[CH_LEAN], T[CH_SCALE_Y], T[CH_SCALE_XZ], T[CH_RIG_Y]);
    if (rr) {
      T[CH_ARM_LX] = rr.lx; T[CH_ARM_RX] = rr.rx;
      T[CH_ARM_LZ] = rr.lz; T[CH_ARM_RZ] = rr.rz;
      T[CH_ARM_LS] = rr.ls; T[CH_ARM_RS] = rr.rs;
    } else {
      T[CH_ARM_LX] = -1.25; T[CH_ARM_RX] = -1.25;
      T[CH_ARM_LZ] = -0.08; T[CH_ARM_RZ] = 0.08;
    }
    T[CH_HEAD_X] = -0.14;
    T[CH_ANT_X] = -0.4 - 0.05 * buzz;
    T[CH_EYE_SCALE] = 1.05;
    T[CH_MOUTH_SX] = 1.25;
  } else if (pose === 'hover') {
    /* Hoverboard (v11): a skater's stance, knees bent (a squash with the rig lowered onto the
       swung feet), one foot forward and one back, the feet a little apart, both arms out for
       balance with a slow balancing wobble, the torso leaning into handle.leanZ on top of the rig
       roll and the head turned into the turn, antennae streaming back with the board buzz. In the
       air (a.air eases toward handle.airborne) the rider crouches: a deeper squash, both knees
       pulled up, the arms higher, the head down a little. */
    const air = a.air, buzz = Math.sin(TAU * 7 * time), wob = Math.sin(TAU * 0.7 * time);
    const lean = Number.isFinite(handle.leanZ) ? Math.max(-0.5, Math.min(0.5, handle.leanZ)) : 0;
    T[CH_LEAN] = 0.08 - 0.16 * air;
    T[CH_SWAY_Z] = 0.5 * lean;
    T[CH_LEG_LX] = -0.38 - 0.5 * air; T[CH_LEG_RX] = 0.38 - 1.25 * air;
    T[CH_LEG_XOFF] = 0.06;
    T[CH_RIG_Y] = 0.19 * (1 - Math.cos(0.38)) - 0.02 * air;
    T[CH_SCALE_Y] = 0.9 - 0.08 * air; T[CH_SCALE_XZ] = 1.03 + 0.02 * air;
    T[CH_TORSO_Y] = 0.004 * buzz - 0.03 * air;
    T[CH_ARM_LX] = -0.25 - 0.3 * air + 0.05 * wob; T[CH_ARM_RX] = -0.25 - 0.3 * air - 0.05 * wob;
    T[CH_ARM_LZ] = -(1.35 + 0.3 * air) + 0.06 * wob; T[CH_ARM_RZ] = 1.35 + 0.3 * air + 0.06 * wob;
    T[CH_HEAD_X] = -0.1 + 0.18 * air;
    T[CH_HEAD_Y] = 0.35 * lean;
    T[CH_HEAD_Z] = -0.25 * lean;
    T[CH_ANT_X] = -0.45 - 0.2 * air - 0.04 * buzz;
    T[CH_EYE_SCALE] = 1.06;
    T[CH_MOUTH_SX] = 1.3;
  } else if (pose === 'boat') {
    /* Boat (v11): seated as for 'sit' at the stern, turned a little toward the tiller, the right
       arm back and out with the hand on the tiller, the left arm forward resting on the gunwale,
       looking ahead past the bow, a slow rock with the hull, antennae trailing. */
    seatedTargets(T, a);
    const rock = Math.sin(TAU * 0.45 * time), br = 0.5 + 0.5 * Math.sin(TAU * 0.6 * time);
    T[CH_SCALE_Y] = 1 + 0.02 * br; T[CH_SCALE_XZ] = 1 - 0.008 * br;
    T[CH_LEAN] = -0.08;
    T[CH_SWAY_Z] = 0.03 * rock;
    T[CH_TORSO_YAW] = 0.22;
    T[CH_ARM_RX] = 0.75; T[CH_ARM_RZ] = 0.42;
    T[CH_ARM_LX] = -0.35; T[CH_ARM_LZ] = -0.55;
    T[CH_HEAD_X] = -0.06; T[CH_HEAD_Y] = -0.22;
    T[CH_ANT_X] = -0.25 - 0.03 * rock;
    T[CH_ANT_Z0] = 0.04 * rock; T[CH_ANT_Z1] = -0.04 * rock;
    T[CH_EYE_SCALE] = 1.03;
    T[CH_MOUTH_SX] = 1.15;
  } else {
    /* Standing (and any unknown pose): breathing, antenna sway, occasional slow look around.
       v10: pose 'idle' (and 'stand' while the agent is idle) adds the fidgets: a slow weight shift
       from foot to foot with the torso and head leaning the other way, and a look to one side. */
    const br = 0.5 + 0.5 * Math.sin(TAU * 0.6 * time);
    T[CH_SCALE_Y] = 1 + 0.03 * br;
    T[CH_SCALE_XZ] = 1 - 0.012 * br;
    T[CH_ANT_Z0] = 0.05 * Math.sin(TAU * 0.8 * time);
    T[CH_ANT_Z1] = -0.05 * Math.sin(TAU * 0.8 * time + 0.4);
    if (pose === 'idle' || (pose === 'stand' && state === 'idle' && !agent.paused)) {
      const f = idleFidgets(a, time);
      const s = f.shift;
      T[CH_SWAY_Z] = 0.035 * s;
      T[CH_LEG_LX] = 0.05 * s; T[CH_LEG_RX] = -0.05 * s;
      T[CH_HEAD_Z] = -0.03 * s;
      T[CH_TORSO_Y] = -0.006 * Math.abs(s);
      T[CH_ARM_LZ] -= 0.03 * s; T[CH_ARM_RZ] -= 0.03 * s;
      lookTarget = f.look;
      T[CH_ANT_X] = -0.12 * f.flick;
      T[CH_PUPIL_X] = 0.006 * f.look;
    }
    if (agent.lookAt !== a.lastLookAt) {
      a.lastLookAt = agent.lookAt;
      a.lookStart = time;
      a.lookSign = (Math.floor((agent.lookAt || 0) * 1000) & 1) ? 1 : -1;
    }
    const lk = time - a.lookStart;
    if (lk >= 0 && lk < 1.2) lookTarget = a.lookSign * 0.35;
  }

  /* Blink: lids close and the eye squashes toward 0.25 at the midpoint. */
  let blinkScale = 1, showLids = false;
  const bt = time - (agent.blinkAt || 0);
  if (bt >= 0 && bt < 0.14) {
    const u = bt / 0.14;
    const c = Math.sin(Math.PI * u);
    const e = c * c * (3 - 2 * c);
    blinkScale = 1 - 0.75 * e;
    showLids = c > 0.03;
  }

  /* Blend from the pose held at the last pose change so nothing snaps. */
  a.blendT += dt;
  let w = a.blendT / BLEND_SECONDS;
  if (w > 1) w = 1;
  w = w * w * (3 - 2 * w);
  const cur = a.cur, from = a.from;
  for (let i = 0; i < CH_COUNT; i++) cur[i] = from[i] + (T[i] - from[i]) * w;

  const kFast = 1 - Math.exp(-40 * dt);
  a.tapL += (cur[CH_ARM_LY] - a.tapL) * kFast;
  a.tapR += (cur[CH_ARM_RY] - a.tapR) * kFast;
  a.lookYaw += (lookTarget - a.lookYaw) * (1 - Math.exp(-5 * dt));
  a.sip += (sipTarget - a.sip) * (1 - Math.exp(-12 * dt));

  /* Apply */
  const torso = handle.torso;
  torso.position.y = cur[CH_TORSO_Y];
  torso.rotation.x = cur[CH_LEAN];
  torso.rotation.y = cur[CH_TORSO_YAW];
  torso.rotation.z = cur[CH_SWAY_Z];
  torso.scale.set(cur[CH_SCALE_XZ], cur[CH_SCALE_Y], cur[CH_SCALE_XZ]);
  handle.rig.position.y = cur[CH_RIG_Y];
  handle.rig.rotation.x = cur[CH_PITCH];
  // Riding roll about the facing axis (the rig's local z), eased toward handle.leanZ (v11: the
  // hoverboard rolls the rider the same way).
  const lz = handle.leanZ;
  const rollTarget = (pose === 'ride' || pose === 'hover') && Number.isFinite(lz) ? Math.max(-0.5, Math.min(0.5, lz)) : 0;
  a.rideRoll += (rollTarget - a.rideRoll) * (1 - Math.exp(-10 * dt));
  if (rollTarget === 0 && Math.abs(a.rideRoll) < 1e-5) a.rideRoll = 0;
  handle.rig.rotation.z = a.rideRoll;

  P.armL.rotation.x = cur[CH_ARM_LX]; P.armL.rotation.z = cur[CH_ARM_LZ]; P.armL.position.y = a.shoulderY + a.tapL;
  P.armR.rotation.x = cur[CH_ARM_RX]; P.armR.rotation.z = cur[CH_ARM_RZ]; P.armR.position.y = a.shoulderY + a.tapR;
  P.armL.scale.y = cur[CH_ARM_LS]; P.armR.scale.y = cur[CH_ARM_RS];
  P.legL.rotation.x = cur[CH_LEG_LX];
  P.legR.rotation.x = cur[CH_LEG_RX];
  P.legL.position.x = -LEG_X - cur[CH_LEG_XOFF];
  P.legR.position.x = LEG_X + cur[CH_LEG_XOFF];

  const ants = P.antennae;
  for (let i = 0; i < ants.length; i++) {
    const g = ants[i];
    g.rotation.x = a.antBaseX[i] + cur[CH_ANT_X];
    g.rotation.z = a.antBaseZ[i] + (i === 0 ? cur[CH_ANT_Z0] : cur[CH_ANT_Z1]);
  }

  handle.headGroup.rotation.x = cur[CH_HEAD_X];
  handle.headGroup.rotation.y = a.lookYaw + cur[CH_HEAD_Y];
  handle.headGroup.rotation.z = cur[CH_HEAD_Z];
  P.eyePivot.rotation.x = cur[CH_EYE_PITCH];
  P.eyePivot.scale.setScalar(cur[CH_EYE_SCALE]);
  const egs = P.eyeGroups;
  for (let i = 0; i < egs.length; i++) {
    egs[i].scale.y = blinkScale;
    P.lids[i].visible = showLids;
    const pupil = P.pupils[i];
    pupil.position.y = pupil.userData.baseY + cur[CH_PUPIL_Y];
    pupil.position.x = pupil.userData.inward * cur[CH_PUPIL_X];
  }
  if (P.mouth) P.mouth.scale.set(cur[CH_MOUTH_SX], cur[CH_MOUTH_SY], 1);

  /* Rotation. The renderer owns yaw while working (it sets group.rotation.y), and whenever it
     has turned the group itself; the rig then eases to 0 so facing is never applied twice.
     Otherwise: wave faces +z, moving and seated poses face agent.moveDir, the rest hold the
     seeded idle yaw toward the camera side. */
  let targetYaw;
  if (working || handle.group.rotation.y !== 0) {
    targetYaw = 0;
  } else if (pose === 'wave') {
    targetYaw = 0;
  } else if (followsMoveDir(pose)) {
    const md = agent.moveDir;
    if (md && (md.x !== 0 || md.z !== 0)) targetYaw = Math.atan2(md.x, md.z);
    else if (pose === 'walk') targetYaw = (agent.facing || 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
    else targetYaw = traits.idleYaw;
  } else {
    targetYaw = traits.idleYaw;
  }
  let d = targetYaw - a.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  a.yaw += d * (1 - Math.exp(-8 * dt));
  if (a.yaw > Math.PI) a.yaw -= TAU; else if (a.yaw < -Math.PI) a.yaw += TAU;
  handle.rig.rotation.y = a.yaw;

  /* Selected ring pulse (the renderer sets ring.visible, ring.material.color and ring.userData.selected). */
  const ring = P.ring;
  if (ring.visible) {
    const s = ring.userData.selected ? 1.04 + 0.04 * Math.sin(TAU * 1.2 * time) : 1;
    ring.scale.set(s, s, 1);
  }
}

/* ------------------------------------------------------------------ */
/* Fade support. Lit materials are shared between aliens of one color, so the first fade
   gives this alien private clones (registered in ALIEN_MATERIALS so night still drives
   them). Only materials this module owns are touched: the shared alien materials (cloned
   on first fade) and materials marked ownedBy this handle (clones and the ring). Anything
   else under the group (the renderer's contact shadow, attached props) is left alone.
   Each owned material remembers its original transparent flag and opacity so alpha 1
   restores them instead of forcing transparent false and opacity 1. */

let _fadeHandle = null;
let _fadeAlpha = 1;

function ownMaterialFor(handle, src) {
  let own = handle.ownMaterials.get(src);
  if (!own) {
    own = src.clone();
    own.userData.envBase = src.userData.envBase;
    own.userData.isTip = src.userData.isTip;
    own.userData.alienShared = false;
    own.userData.ownedBy = handle.uid;
    own.userData.wasTransparent = src.transparent;
    own.userData.wasOpacity = src.opacity;
    if (src.isMeshStandardMaterial) {
      own.envMapIntensity = src.envMapIntensity;
      ALIEN_MATERIALS.push(own);
    }
    handle.ownMaterials.set(src, own);
  }
  return own;
}

function applyFade(obj) {
  if (!obj.isMesh || !obj.material) return;
  let m = obj.material;
  const ud = m.userData;
  if (!ud) return;
  if (ud.alienShared && ud.ownedBy !== _fadeHandle.uid) {
    m = ownMaterialFor(_fadeHandle, m);
    obj.material = m;
  } else if (ud.ownedBy !== _fadeHandle.uid) {
    return;   // not ours (contact shadow, prop, anything the renderer added)
  }
  const d = m.userData;
  if (d.wasTransparent === undefined) { d.wasTransparent = m.transparent; d.wasOpacity = m.opacity; }
  const fading = _fadeAlpha < 0.999;
  m.transparent = fading || d.wasTransparent;
  m.opacity = fading ? d.wasOpacity * _fadeAlpha : d.wasOpacity;
}

export function setAlienOpacity(handle, alpha) {
  if (!handle || handle.disposed) return;
  alpha = alpha >= 0 ? (alpha > 1 ? 1 : alpha) : 0;
  if (!handle.ownMaterials) handle.ownMaterials = new Map();
  handle.opacity = alpha;
  _fadeHandle = handle;
  _fadeAlpha = alpha;
  handle.group.traverse(applyFade);
  _fadeHandle = null;
}


export function disposeAlien(handle) {
  if (!handle || handle.disposed) return;
  handle.disposed = true;
  if (handle.group.parent) handle.group.parent.remove(handle.group);
  // Geometries and lit materials are shared through the module caches; only the ring material
  // and any fade clones are per alien.
  if (handle.parts.ring && handle.parts.ring.material) handle.parts.ring.material.dispose();
  if (handle.ownMaterials) {
    for (const m of handle.ownMaterials.values()) {
      const at = ALIEN_MATERIALS.indexOf(m);
      if (at >= 0) ALIEN_MATERIALS.splice(at, 1);
      m.dispose();
    }
    handle.ownMaterials = null;
  }
}

/* Drop every cached geometry and material (full teardown only; live aliens would lose their buffers). */
export function disposeAlienCaches() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  ALIEN_MATERIALS.length = 0;
  if (highlightMat) { highlightMat.dispose(); highlightMat = null; }
}

/* ------------------------------------------------------------------ */
/* Portrait scene for side-panel avatars: 96 x 120 frame, transparent background,
   camera at eye level looking slightly down, alien standing at the origin. */

export function makeAlienPortraitScene() {
  const scene = new THREE.Scene();
  scene.background = null;

  // CONTRACT: art bible places the camera at z 2.3; pulled back to 2.5 so two-antenna pear aliens
  // (tips near y 1.24) are not clipped at the top of the 120 px frame. Body fills about
  // 70 percent of the height, antennae included about 90 percent.
  const camera = new THREE.PerspectiveCamera(30, 96 / 120, 0.1, 20);
  camera.position.set(0, 0.64, 2.5);
  camera.lookAt(0, 0.58, 0);

  const hemi = new THREE.HemisphereLight(0xFFFFFF, 0xC9D4DC, 1.2);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xFFF4E0, 1.9);
  keyLight.position.set(1, 1.8, 2);
  keyLight.target.position.set(0, 0.45, 0);
  scene.add(keyLight);
  scene.add(keyLight.target);

  const fill = new THREE.DirectionalLight(0xDCE9F5, 0.6);
  fill.position.set(-1.6, 0.9, 1.2);
  fill.target.position.set(0, 0.45, 0);
  scene.add(fill);
  scene.add(fill.target);

  const rim = new THREE.DirectionalLight(0xFFFFFF, 0.8);
  rim.position.set(-0.4, 1.6, -2.0);
  rim.target.position.set(0, 0.45, 0);
  scene.add(rim);
  scene.add(rim.target);

  return { scene, camera };
}
