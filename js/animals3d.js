/* Thread Town 3D, version 3: low-poly animal characters.

   Builds a chibi animal (one rounded body volume, a big head, short limbs, white-sclera
   eyes) from the primitives in js/depts/common.js plus spheres, capsules and rounded boxes,
   and animates it from the simulation's agent state with the same pose names, handle shape,
   easing and yaw rules as js/aliens3d.js, so the renderer treats both kinds the same way.

   Public surface (docs/CONTRACT_V3.md section js/animals3d.js, docs/ZOO_DESIGN.md):
     ANIMAL_HEIGHT                      // typical standing height before the renderer's scale
     SPECIES                            // species ids in contract order
     ANIMAL_POSES                       // every pose animateAnimal understands (v2 list plus balance)
     speciesForName(name) -> id | null  // case-insensitive, plurals and synonyms allowed
     makeAnimalMesh(seed, colorHex, speciesId) -> AnimalHandle
     animateAnimal(handle, agent, time, dt, poseOverride)
     setAnimalOpacity(handle, alpha)
     disposeAnimal(handle)
   Extras used by the renderer:
     setAnimalNight(s)                  // 0 day .. 1 night, drives envMapIntensity like the aliens
     ANIMAL_MATERIALS                   // registry of every lit material this module made
     disposeAnimalCaches()

   Rigs (ZOO_DESIGN "Principles" 6). Three builds, one rig each:
     quadruped: group > rig > torso > [body, headGroup, armL, armR, tail], rig > [legL, legR]
                torso pivot at the hind hip line P = (0, hipY, hindZ); a negative torso.rotation.x
                rears the front up around the hips while the hind legs stay planted
     biped:     the alien rig (torso origin 0, arms and head in the torso, legs in the rig)
     bird:      the biped rig with wings for arms, cylinder legs and a beak on the head
   armL/armR are the front legs, wings or arms; legL/legR the hind legs. handL/handR are
   Object3D attach points at the paw, wing tip or hand. The head pivot sits at the neck base,
   so one rotation nods or turns the whole head (neck, muzzle, ears, beak included).

   Yaw ownership is the alien rule: the rig carries the animal's own facing (move direction,
   idle yaw, +z for wave); while agent.state is 'working' or whenever the renderer has set a
   non-zero group.rotation.y the rig eases to 0 so facing is never applied twice.

   v5 (docs/CONTRACT_V5.md section Animators, docs/GOLF_DESIGN.md): poses 'golfIdle' (address
   stance) and 'golf', driven by handle.golfPhase 0..1 (the renderer writes the player's swingT):
   bipeds use the alien table, quadrupeds rear onto their hind legs and swing with the front legs,
   birds swing with their wings.

   v6 (docs/CONTRACT_V6.md section Animators): pose 'slide' (the subway runner's duck): bipeds
   crouch to about 55 percent height, pitched back 0.3 rad, arms swept back, legs forward;
   quadrupeds belly-slide with the legs stretched fore and aft; birds tuck their wings.

   v9 (docs/CONTRACT_V9.md section Pose): pose 'ride' (standing on a scooter deck): bipeds stand
   one foot forward and one back with a slight knee bend, leaning forward 0.15 rad, both arms
   forward and a little down to the handlebar, head up; quadrupeds rear onto their hind legs with
   the front paws forward on the bar; birds perch with the wings forward on the bar. The rig rolls
   with handle.leanZ (radians, written by the renderer from the scooter lean), eased; other poses
   ease the roll to 0. The front limbs are solved per species toward the grips at vehicles.js
   SCOOTER.BAR (rideReach): pitch, splay and a length factor on the limb group (CH_ARM_LS, CH_ARM_RS,
   1 in every other pose).

   v10 (docs/CONTRACT_V10.md "Polish list", Walking), as js/aliens3d.js: the walk cycle is driven by
   handle.distance (world units traveled, written by the renderer) when finite, with the stride taken
   from each rig's own leg reach and swing so the planted paw, foot or toe never slides; without it
   the cycle falls back to the time-based cadence (capped at WALK_MAX_HZ, faster travel lengthens the
   swing). Pose 'idle' is 'stand' with fidgets (weight shift, look around; 'stand' fidgets too while
   agent.state is 'idle'). Pose 'turn' is turning in place, paced by handle.turnRate (rad/s, signed):
   quadrupeds paddle their legs, bipeds shuffle, birds step with the wings a little out.

   v11 (docs/CONTRACT_V11.md "Files: js/aliens3d.js, js/animals3d.js"), as js/aliens3d.js: pose
   'hover' (riding the hoverboard): bipeds take a skater's stance with the knees bent, one foot
   forward and one back, both arms out for balance; quadrupeds crouch on all fours with the legs
   splayed and the head up; birds stand with the wings spread. The torso leans into handle.leanZ
   on top of the rig roll and the head turns into the turn; while handle.airborne is true the
   rider crouches (a deeper squash, the legs tucked, the arms or wings higher), eased over about
   0.1 s. Pose 'boat' (driving a boat): seated as for 'sit', turned a little toward the stern with
   the right hand, paw or wing back on the tiller and the left one forward, looking ahead, a slow
   rock. Hats: handle.hat ('cap' | 'beanie' | 'crown' | 'cowboy' | 'visor' | null, or
   setAnimalHat(handle, hat)) wears a small hat on the head group, placed from the head's own
   bounds (the ears, trunk, jaw and beak excluded) at build time; the first non-null hat builds all
   five hats once (parts.hats) and later changes only toggle visibility, so nothing allocates
   after that build. HAT_KINDS lists the names. */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { box, cyl, cone, sphere, torus } from './depts/common.js';
// v9: the scooter grips (SCOOTER.BAR, SCOOTER.FEET) for the ride reach; a namespace import so a
// missing export falls back to the built-in numbers instead of failing module linking.
import * as VEHICLES from './vehicles.js';

export const ANIMAL_HEIGHT = 0.9;

export const SPECIES = [
  'lion', 'tiger', 'elephant', 'giraffe', 'zebra', 'hippo', 'bear', 'panda', 'fox', 'wolf', 'monkey',
  'penguin', 'flamingo', 'owl', 'falcon', 'otter', 'seal', 'tortoise', 'crocodile', 'kangaroo',
  'rabbit', 'frog', 'deer', 'koala',
];

export const ANIMAL_POSES = [
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

/* v10 walking and turning constants (the alien values). */
const WALK_MAX_HZ = 5;            // stride cycles per second at a sprint; faster travel lengthens the swing instead
const WALK_BOOST_MAX = 1.6;       // the most the leg swing grows when the distance outruns the cadence cap
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
  if (a.walkPhase > 4096) a.walkPhase -= 4096;
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
   side every 5.5 to 8 s, both offset by the handle's own phase so a crowd never moves in step. */
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

/* Shared palette (ZOO_DESIGN "Principles" 5). */
const DARK = '#2A1E1A', PINK = '#F2B8B5', TOOTH = '#F6F1E4', AMBER = '#E0A23A', BRASS = '#F6D463';

/* ------------------------------------------------------------------ */
/* Seeding helpers. Prefer the simulation's TT.hash and TT.rng; fall back to identical
   local copies so portraits and tests work without TT. */

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
function ttHash(str) {
  const TT = typeof window !== 'undefined' ? window.TT : null;
  return (TT && TT.hash ? TT.hash : fnv)(String(str));
}
function seededRng(seed) {
  const TT = typeof window !== 'undefined' ? window.TT : null;
  const rng = TT && TT.rng ? TT.rng : mulberry;
  return rng(ttHash(seed));
}
function normalizeHex(colorHex) {
  if (typeof colorHex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(colorHex)) return '#' + colorHex.replace('#', '').toUpperCase();
  const c = new THREE.Color(colorHex || '#75CCD0');
  return '#' + c.getHexString().toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Species name mapping (ZOO_DESIGN "Species name mapping"). */

const SYNONYMS = {
  lion: 'lion lions lioness lionesses leo simba nala mufasa',
  tiger: 'tiger tigers tigress tigresses tigger khan',
  elephant: 'elephant elephants ellie dumbo jumbo mammoth pachyderm trunk',
  giraffe: 'giraffe giraffes longneck',
  zebra: 'zebra zebras stripes',
  hippo: 'hippo hippos hippopotamus hippopotami hippopotamuses',
  bear: 'bear bears grizzly grizzlies kodiak polar teddy bruin cub cubs baloo paddington',
  panda: 'panda pandas pandabear po',
  fox: 'fox foxes foxy vixen vixens reynard kit kits swiper redpanda',
  wolf: 'wolf wolves wolfie lobo timberwolf coyote coyotes jackal jackals husky huskies dingo',
  monkey: 'monkey monkeys monkies ape apes chimp chimps chimpanzee gorilla gorillas macaque baboon baboons lemur lemurs orangutan capuchin marmoset gibbon kong abu george',
  penguin: 'penguin penguins pingu emperor pengu',
  flamingo: 'flamingo flamingos flamingoes flamin',
  owl: 'owl owls owlet hoot hooter hedwig barnowl snowy athena',
  falcon: 'falcon falcons hawk hawks kestrel peregrine eagle eagles osprey raptor raptors merlin harrier buzzard vulture condor kite kites',
  otter: 'otter otters seaotter',
  seal: 'seal seals sealion sealions walrus walruses pup',
  tortoise: 'tortoise tortoises turtle turtles terrapin terrapins shelly sheldon crush franklin',
  crocodile: 'crocodile crocodiles croc crocs gator gators alligator alligators caiman caimans snappy tock',
  kangaroo: 'kangaroo kangaroos roo roos joey joeys wallaby wallabies skippy',
  rabbit: 'rabbit rabbits bunny bunnies hare hares cottontail jackrabbit thumper peter roger lapin',
  frog: 'frog frogs froggy froggie toad toads kermit tadpole bullfrog treefrog',
  deer: 'deer deers stag stags doe does fawn fawns buck bucks elk moose reindeer caribou antelope antelopes gazelle gazelles impala bambi rudolph',
  koala: 'koala koalas koalabear dropbear',
};
const PAIRS = {
  'polar bear': 'bear', 'panda bear': 'panda', 'koala bear': 'koala', 'sea lion': 'seal', 'sea otter': 'otter',
  'red panda': 'fox', 'barn owl': 'owl', 'shere khan': 'tiger', 'tick tock': 'crocodile',
};
const wordMap = new Map();
for (const id of SPECIES) for (const w of SYNONYMS[id].split(' ')) if (w && !wordMap.has(w)) wordMap.set(w, id);
for (const id of SPECIES) wordMap.set(id, id);   // exact ids win over any synonym spelled the same

export function speciesForName(name) {
  if (name === null || name === undefined) return null;
  const words = String(name).toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return null;
  for (let i = 0; i + 1 < words.length; i++) {
    const pair = PAIRS[words[i] + ' ' + words[i + 1]];
    if (pair) return pair;
  }
  for (const w of words) {
    const hit = wordMap.get(w);
    if (hit) return hit;
  }
  for (const w of words) {
    if (w.length < 4) continue;
    for (const id of SPECIES) {
      if (id.length >= 3 && w.length <= id.length + 4 && w.startsWith(id)) return id;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Geometry caches. Spheres, boxes, cones, cylinders and toruses come from the common.js
   cache; capsules, lids, the ring and the monkey tail tube live here. Scale is always applied
   on the mesh, never on a shared geometry. */

const geoCache = new Map();
function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
function capsuleGeo(r, len) {
  return cachedGeo('capsule:' + r + ':' + len, () => new THREE.CapsuleGeometry(r, len, 8, 16));
}
function lidGeo(r) {
  return cachedGeo('lid:' + r, () => new THREE.SphereGeometry(r, 24, 16, 0, TAU, 0, Math.PI / 2));
}
function ringGeo() {
  return cachedGeo('ring', () => new THREE.RingGeometry(0.36, 0.44, 48));
}
function smallSphereGeo(r) {
  return cachedGeo('hi:' + r, () => new THREE.SphereGeometry(r, 12, 8));
}

/* ------------------------------------------------------------------ */
/* Shared materials. One lit material per hex; cloned only when a handle fades. */

export const ANIMAL_MATERIALS = [];
const matCache = new Map();

function registerStd(mat, envBase) {
  mat.userData.envBase = envBase;
  mat.userData.animalShared = true;
  mat.envMapIntensity = envBase;
  ANIMAL_MATERIALS.push(mat);
  return mat;
}
function cachedStd(key, make, envBase) {
  let m = matCache.get(key);
  if (!m) { m = registerStd(make(), envBase); matCache.set(key, m); }
  return m;
}
/* Body and accessory material: roughness 0.6, no metalness, envMapIntensity 0.25, shared per hex. */
function bodyMaterial(hex) {
  return cachedStd('body:' + hex, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.6, metalness: 0 }), 0.25);
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
    highlightMat.userData.animalShared = true;
  }
  return highlightMat;
}

/* ------------------------------------------------------------------ */
/* v11 hats, as js/aliens3d.js: shared Thread palette materials (registered so the night ramp and
   the fade clones apply), shared geometries keyed by the head radius rounded to 0.005. buildHats
   makes the five hats once as hidden groups under a head group at an anchor (x, y, z: the crown
   line in head space, r: the head's radius there, local +z forward). */
const HAT_COLORS = { navy: '#002D4F', aqua: '#75CCD0', salmon: '#E7706F', silver: '#E2E9EE', white: '#FFFFFF', gold: '#F6D463', sand: '#D9B57A' };
function hatMaterial(name) {
  return cachedStd('hat:' + name, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(HAT_COLORS[name] || HAT_COLORS.navy), roughness: name === 'gold' ? 0.35 : 0.65, metalness: name === 'gold' ? 0.5 : 0,
  }), 0.3);
}
function hatMesh(geo, mat) { const o = new THREE.Mesh(geo, mat); o.castShadow = true; o.receiveShadow = false; return o; }
function hatRound(v) { return Math.round(v * 200) / 200; }
function buildHats(parent, x, y, z, r) {
  r = hatRound(Math.max(0.06, r));
  const out = {};
  const add = (kind, g) => { g.name = 'hat-' + kind; g.visible = false; g.position.set(x, y, z); parent.add(g); out[kind] = g; return g; };
  const m = (geo, mat, px, py, pz, rx) => { const o = hatMesh(geo, mat); o.position.set(px, py, pz); if (rx) o.rotation.x = rx; return o; };
  const dome = (k, scale) => cachedGeo('hat:dome:' + k + ':' + r, () => new THREE.SphereGeometry(r * scale, 20, 10, 0, TAU, 0, Math.PI / 2));
  const halfDisc = (k, scale) => cachedGeo('hat:half:' + k + ':' + r, () => new THREE.CylinderGeometry(r * scale, r * scale, 0.02, 16, 1, false, -Math.PI / 2, Math.PI));
  const torus = (k, scale, tube) => cachedGeo('hat:torus:' + k + ':' + r, () => new THREE.TorusGeometry(r * scale, tube, 8, 20));
  const small = Math.min(1, r / 0.16);   // the trims scale down with a small head
  // the cap: a flattened navy dome, an aqua peak forward and a button on top
  { const g = new THREE.Group();
    const d = m(dome('cap', 1.08), hatMaterial('navy'), 0, -0.01, 0); d.scale.set(1, 0.62, 1); g.add(d);
    g.add(m(halfDisc('cap', 1.2), hatMaterial('aqua'), 0, 0.0, r * 0.2, 0.2));
    const b = m(cachedGeo('hat:button', () => new THREE.SphereGeometry(0.026, 10, 8)), hatMaterial('aqua'), 0, r * 1.08 * 0.62 - 0.012, 0); b.scale.setScalar(small); g.add(b);
    add('cap', g); }
  // the beanie: a salmon dome with a rolled silver brim and a white bobble
  { const g = new THREE.Group();
    const d = m(dome('beanie', 1.1), hatMaterial('salmon'), 0, -0.01, 0); d.scale.set(1, 0.9, 1); g.add(d);
    g.add(m(torus('beanie', 1.07, 0.035 * small), hatMaterial('silver'), 0, 0.0, 0, Math.PI / 2));
    const b = m(cachedGeo('hat:bobble', () => new THREE.SphereGeometry(0.05, 12, 8)), hatMaterial('white'), 0, r * 1.1 * 0.9 + 0.02 * small, 0); b.scale.setScalar(small); g.add(b);
    add('beanie', g); }
  // the crown: a gold ring with five points and a salmon jewel at the front
  { const g = new THREE.Group();
    g.add(m(cachedGeo('hat:crown:' + r, () => new THREE.CylinderGeometry(r * 0.94, r * 0.86, 0.16 * small, 12, 1, true)), hatMaterial('gold'), 0, 0.06 * small, 0));
    const point = cachedGeo('hat:point', () => new THREE.ConeGeometry(0.045, 0.1, 6));
    for (let i = 0; i < 5; i++) { const t = i * TAU / 5, p = m(point, hatMaterial('gold'), Math.sin(t) * r * 0.9, 0.18 * small, Math.cos(t) * r * 0.9); p.scale.setScalar(small); g.add(p); }
    const j = m(cachedGeo('hat:jewel', () => new THREE.SphereGeometry(0.03, 10, 8)), hatMaterial('salmon'), 0, 0.08 * small, r * 0.93); j.scale.setScalar(small); g.add(j);
    add('crown', g); }
  // the cowboy hat: a wide sand brim with a rolled rim, a tall crown and a navy band
  { const g = new THREE.Group();
    g.add(m(cachedGeo('hat:brim:' + r, () => new THREE.CylinderGeometry(r * 1.75, r * 1.75, 0.025, 20)), hatMaterial('sand'), 0, 0.0, 0));
    g.add(m(torus('cowboy', 1.72, 0.03 * small), hatMaterial('sand'), 0, 0.03 * small, 0, Math.PI / 2));
    g.add(m(cachedGeo('hat:cowboycrown:' + r, () => new THREE.CylinderGeometry(r * 0.76, r * 0.88, 0.26 * small, 14)), hatMaterial('sand'), 0, 0.14 * small, 0));
    g.add(m(cachedGeo('hat:band:' + r, () => new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.05 * small, 14, 1, true)), hatMaterial('navy'), 0, 0.05 * small, 0));
    add('cowboy', g); }
  // the Thread visor: an aqua half disc brim on a navy band, open on top, a salmon tab at the front
  { const g = new THREE.Group();
    g.add(m(halfDisc('visor', 1.45), hatMaterial('aqua'), 0, 0.0, r * 0.15, 0.2));
    g.add(m(torus('visor', 1.03, 0.03 * small), hatMaterial('navy'), 0, 0.03 * small, 0, Math.PI / 2));
    const t = m(cachedGeo('hat:tab', () => new THREE.BoxGeometry(0.12, 0.035, 0.02)), hatMaterial('salmon'), 0, 0.03 * small, r * 1.04); t.scale.setScalar(small); g.add(t);
    add('visor', g); }
  return out;
}
/* The hat anchor of a built head, in head group space: the bounds of the head's own meshes
   (parts.head when the recipe names it, else every mesh under the head group except the ears,
   the trunk, the jaw and the beak), then the crown line at 0.78 of the half height above the
   center and 0.62 of the half width as the radius. Build time only. */
const _hb = new THREE.Box3(), _hm = new THREE.Matrix4();
function headAnchor(handle) {
  const head = handle.headGroup, P = handle.parts;
  if (!head) return { x: 0, y: 0.5, z: 0, r: 0.12 };
  const skip = [P.trunk, P.jaw, P.beak].concat(P.ears || []).filter(Boolean);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const take = o => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _hm.identity();
    for (let p = o; p && p !== head; p = p.parent) { p.updateMatrix(); _hm.premultiply(p.matrix); }
    _hb.copy(o.geometry.boundingBox).applyMatrix4(_hm);
    minX = Math.min(minX, _hb.min.x); maxX = Math.max(maxX, _hb.max.x);
    minY = Math.min(minY, _hb.min.y); maxY = Math.max(maxY, _hb.max.y);
    minZ = Math.min(minZ, _hb.min.z); maxZ = Math.max(maxZ, _hb.max.z);
  };
  const walk = o => { if (skip.indexOf(o) >= 0) return; take(o); for (let i = 0; i < o.children.length; i++) walk(o.children[i]); };
  if (P.head && P.head.isMesh) take(P.head); else walk(head);
  if (!Number.isFinite(minX) || !Number.isFinite(maxY)) { walk(head); }
  if (!Number.isFinite(minX) || !Number.isFinite(maxY)) return { x: 0, y: 0.5, z: 0, r: 0.12 };
  const cy = (minY + maxY) / 2, hy = (maxY - minY) / 2, hx = (maxX - minX) / 2;
  return { x: (minX + maxX) / 2, y: cy + 0.78 * hy, z: (minZ + maxZ) / 2, r: Math.max(0.06, 0.62 * hx) };
}
/* setAnimalHat(handle, hat): wears one of HAT_KINDS (or none). The first hat builds all five on
   the head group; later calls only toggle visibility. */
export function setAnimalHat(handle, hat) {
  if (!handle || handle.disposed) return;
  let kind = null;
  for (let i = 0; i < HAT_KINDS.length; i++) if (HAT_KINDS[i] === hat) kind = hat;
  const a = handle.poseState, P = handle.parts;
  if (kind && !P.hats && handle.headGroup) P.hats = buildHats(handle.headGroup, a.hatX, a.hatY, a.hatZ, a.hatR);
  if (P.hats) for (let i = 0; i < HAT_KINDS.length; i++) P.hats[HAT_KINDS[i]].visible = HAT_KINDS[i] === kind;
  handle.hat = kind;
  a.hatShown = kind;
}

/* Day/night driver for the renderer: s is 0 by day and 1 at night. */
export function setAnimalNight(s) {
  s = Math.max(0, Math.min(1, s || 0));
  for (let i = 0; i < ANIMAL_MATERIALS.length; i++) {
    const m = ANIMAL_MATERIALS[i];
    m.envMapIntensity = m.userData.envBase * (1 - 0.6 * s);
  }
}

/* ------------------------------------------------------------------ */
/* Build helpers. Every group carries userData.origin, its pivot in character space (x right,
   y up, z toward the face, feet at y 0). Children are authored in character space and the
   helpers subtract the parent's origin, so recipes read like the design document. A "local"
   group (LG) has origin 0 so limb parts are authored relative to the pivot instead. */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _xAxis = new THREE.Vector3(1, 0, 0);

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
const _rtorsoP = new THREE.Vector3();
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
   are the ride targets; torsoPos the torso's base position. leanSteps (optional) lists extra torso
   pitch offsets to try in order when the arms fall short at the given lean: a rearing quadruped
   whose forelegs cannot reach the bar leans further onto it, the way a dog stands at a counter.
   Returns { lx, lz, ls, rx, rz, rs, lean } (lean is the pitch that was used) or null (the caller
   keeps its fixed fallback). */
const RIDE_HIT = 0.012;   // a hand this close to its grip (rig units) counts as on it
function rideReach(key, handle, armL, armR, handL, handR, armLY, armRY, rzL0, rzR0, torsoPos, lean, sy, sxz, rigY, leanSteps) {
  const sc = handle.group && Number.isFinite(handle.group.scale.y) && handle.group.scale.y > 0 ? handle.group.scale.y : 1;
  const ck = key + '|' + sc.toFixed(3);
  if (rideReachCache.has(ck)) return rideReachCache.get(ck);
  const gy = (RIDE_BAR.y - RIDE_FEET.y) / sc - rigY, gz = (RIDE_BAR.z - RIDE_FEET_Z) / sc, gx = RIDE_BAR.halfWidth / sc;
  const sideL = armL.position.x > 0 ? 1 : -1, sideR = armR.position.x < 0 ? -1 : 1;
  const steps = leanSteps && leanSteps.length ? leanSteps : [0];
  let out = null;
  for (let i = 0; i < steps.length; i++) {
    const ln = lean + steps[i];
    _re.set(ln, 0, 0); _rq.setFromEuler(_re); _rs.set(sxz, sy, sxz);
    _rtorso.compose(torsoPos, _rq, _rs);
    _rgoal.set(sideL * gx, gy, gz);
    const L = solveArmReach(handle.rig, handle.torso, _rtorso, armL, armLY, handL, rzL0, _rgoal);
    _rgoal.set(sideR * gx, gy, gz);
    const R = solveArmReach(handle.rig, handle.torso, _rtorso, armR, armRY, handR, rzR0, _rgoal);
    if (!L || !R) continue;
    if (!out || L.d + R.d < out.dL + out.dR) out = { lx: L.x, lz: L.z, ls: L.k, rx: R.x, rz: R.z, rs: R.k, dL: L.d, dR: R.d, lean: ln };
    if (L.d < RIDE_HIT && R.d < RIDE_HIT) break;
  }
  rideReachCache.set(ck, out);
  return out;
}
/* The extra forward pitches tried in order until the paws, hands or wing tips land on the grips:
   a rearing quadruped may lean a long way onto the bar, a biped or a bird hunches a little. */
const RIDE_Q_LEANS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
const RIDE_B_LEANS = [0, 0.1, 0.2, 0.3];

function origin(parent) { return parent.userData.origin || _v3.set(0, 0, 0); }
function put(parent, obj, x, y, z) {
  const o = origin(parent);
  obj.position.set(x - o.x, y - o.y, z - o.z);
  obj.castShadow = true;
  obj.receiveShadow = false;
  parent.add(obj);
  return obj;
}
function G(parent, x, y, z) {
  const g = new THREE.Group();
  g.userData.origin = new THREE.Vector3(x, y, z);
  const o = origin(parent);
  g.position.set(x - o.x, y - o.y, z - o.z);
  parent.add(g);
  return g;
}
function LG(parent, x, y, z) {
  const g = G(parent, x, y, z);
  g.userData.origin.set(0, 0, 0);
  return g;
}
function rot(obj, r) {
  if (r) { obj.rotation.x = r[0] || 0; obj.rotation.y = r[1] || 0; obj.rotation.z = r[2] || 0; }
  return obj;
}
/* S: sphere, center anchored, optional scale. */
function S(parent, r, m, x, y, z, sx, sy, sz) {
  const o = sphere(r, m, { receiveShadow: false });
  if (sx !== undefined) o.scale.set(sx, sy, sz);
  return put(parent, o, x, y, z);
}
/* Bx: rounded box, center anchored. */
function Bx(parent, w, h, d, radius, m, x, y, z, r) {
  const rad = Math.min(radius || 0.01, 0.45 * Math.min(w, h, d));
  const o = box(w, h, d, m, { radius: rad, receiveShadow: false });
  rot(o, r);
  return put(parent, o, x, y, z);
}
/* Cp: capsule (axis y), center anchored. */
function Cp(parent, r, len, m, x, y, z, rr) {
  const o = new THREE.Mesh(capsuleGeo(r, len), m);
  rot(o, rr);
  return put(parent, o, x, y, z);
}
/* Cy: cylinder, center anchored. */
function Cy(parent, rt, rb, h, m, x, y, z, r) {
  const o = cyl(rt, rb, h, m, { receiveShadow: false });
  rot(o, r);
  return put(parent, o, x, y, z);
}
/* To: torus, center anchored; r is a rotation triple, sc a scale triple. */
function To(parent, r, tube, m, x, y, z, rr, sc) {
  const o = torus(r, tube, m, { receiveShadow: false });
  rot(o, rr);
  if (sc) o.scale.set(sc[0], sc[1], sc[2]);
  return put(parent, o, x, y, z);
}
/* Cn: cone from a base point along a direction; returns the pivot group (origin at the base). */
function Cn(parent, r, h, m, bx, by, bz, dx, dy, dz) {
  const g = LG(parent, bx, by, bz);
  const o = cone(r, h, m, { receiveShadow: false });
  o.position.set(0, h / 2, 0);
  o.castShadow = true; o.receiveShadow = false;
  g.add(o);
  _v.set(dx, dy, dz).normalize();
  g.quaternion.setFromUnitVectors(_yAxis, _v);
  g.userData.mesh = o;
  return g;
}
/* Seg: capsule laid from A to B (character space of the parent). */
function Seg(parent, ax, ay, az, bx, by, bz, r, m) {
  _v.set(bx - ax, by - ay, bz - az);
  const L = _v.length();
  const o = new THREE.Mesh(capsuleGeo(r, Math.max(0.01, +(L - r).toFixed(3))), m);
  _v.normalize();
  o.quaternion.setFromUnitVectors(_yAxis, _v);
  return put(parent, o, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}
/* Pt: attach point. */
function Pt(parent, x, y, z) {
  const o = new THREE.Object3D();
  const or = origin(parent);
  o.position.set(x - or.x, y - or.y, z - or.z);
  parent.add(o);
  return o;
}
function scaleBase(o) { o.userData.bs = o.scale.clone(); return o; }

/* Eye kit E(r) (ZOO_DESIGN "Principles" 4): white sphere, pupil 0.55 r at 0.75 r along the
   outward normal, highlight bead on the pupil, lid half sphere hidden except during a blink.
   The outward normal leans toward +z so the camera always sees both whites. */
function Eye(b, x, y, z, r, pupilFrac) {
  const pf = pupilFrac || 0.55;
  const hc = b.headC;
  const eg = new THREE.Group();
  _v.set(x - hc.x, y - hc.y, z - hc.z);
  if (_v.lengthSq() < 1e-8) _v.set(0, 0, 1);
  _v.normalize().add(_v2.set(0, 0, 1.2)).normalize();
  eg.quaternion.setFromUnitVectors(_zAxis, _v);
  put(b.eyePivot, eg, x, y, z);
  const white = sphere(r, eyeWhiteMaterial(), { receiveShadow: false });
  white.name = 'eye';
  eg.add(white);
  const pr = +(r * pf).toFixed(4);
  const pupil = sphere(pr, pupilMaterial(), { receiveShadow: false });
  pupil.position.set(0, 0, 0.75 * r);
  pupil.name = 'pupil';
  pupil.userData.inward = -Math.sign(x);
  eg.add(pupil);
  const hi = new THREE.Mesh(smallSphereGeo(Math.max(0.011, +(0.2 * r).toFixed(3))), highlightMaterial());
  hi.position.set(-0.02, 0.022, 0.03).normalize().multiplyScalar(pr - 0.003);
  hi.castShadow = false; hi.receiveShadow = false; hi.name = 'highlight';
  pupil.add(hi);
  const lid = new THREE.Mesh(lidGeo(+(r + 0.005).toFixed(3)), b.headMat);
  lid.visible = false; lid.castShadow = true; lid.receiveShadow = false; lid.name = 'lid';
  eg.add(lid);
  b.parts.eyeGroups.push(eg); b.parts.eyes.push(white); b.parts.pupils.push(pupil); b.parts.lids.push(lid); b.parts.highlights.push(hi);
  return eg;
}
function Eyes(b, x, y, z, r, pupilFrac) { Eye(b, -x, y, z, r, pupilFrac); Eye(b, x, y, z, r, pupilFrac); }

/* Mouth: a small rounded box whose x is across the face and y up it (animated by scale). */
function Mouth(b, parent, w, h, d, m, x, y, z) {
  const o = Bx(parent, w, h, d, Math.min(w, h, d) * 0.4, m, x, y, z);
  o.name = 'mouth';
  b.parts.mouth = scaleBase(o);
  return o;
}
/* Ear pivot at the ear base; the ear mesh is authored locally above it. Base rotation goes on the
   group and is remembered so the animator can add flicks and droops. */
function EarPivot(b, parent, x, y, z, rx, rz) {
  const g = LG(parent, x, y, z);
  g.rotation.set(rx || 0, 0, rz || 0);
  g.userData.base = { x: rx || 0, z: rz || 0 };
  b.parts.ears.push(g);
  return g;
}
/* Tail pivot at the root; the tail is authored locally. */
function TailPivot(b, parent, x, y, z) {
  const g = LG(parent, x, y, z);
  b.parts.tail = g;
  return g;
}

/* Accessories. axis is the neck direction so the ring lies perpendicular to it; the hanging
   piece attaches at the ring's forward point and hangs straight down. */
function ringFrame(ax, ay, az) {
  const n = _v.set(ax, ay, az).normalize();
  const f = _v2.set(0, 0, 1).addScaledVector(n, -n.z);
  if (f.lengthSq() < 1e-4) f.set(0, -1, 0).addScaledVector(n, n.y);
  f.normalize();
  return { n, f };
}
function ringMesh(parent, r, tube, m, cx, cy, cz, n) {
  const o = torus(r, tube, m, { receiveShadow: false });
  o.quaternion.setFromUnitVectors(_zAxis, n);
  return put(parent, o, cx, cy, cz);
}
function Collar(b, parent, r, cx, cy, cz, ax, ay, az) {
  const { n, f } = ringFrame(ax, ay, az);
  ringMesh(parent, r, 0.03, b.accent, cx, cy, cz, n);
  S(parent, 0.03, bodyMaterial(BRASS), cx + r * f.x, cy + r * f.y - 0.04, cz + r * f.z);
}
function Bandana(b, parent, r, cx, cy, cz, ax, ay, az) {
  const { n, f } = ringFrame(ax, ay, az);
  ringMesh(parent, r, 0.025, b.accent, cx, cy, cz, n);
  const tilt = Math.atan2(-f.y, f.z) * 0.6;
  const o = Bx(parent, 0.18, 0.18, 0.02, 0.02, b.accent, cx + r * f.x, cy + r * f.y - 0.105, cz + r * f.z + 0.01, [tilt, 0, Math.PI / 4]);
  o.name = 'bandana';
  S(parent, 0.035, b.accent, cx - r * f.x, cy - r * f.y, cz - r * f.z);
}
function Scarf(b, parent, r, cx, cy, cz, ax, ay, az) {
  const { n, f } = ringFrame(ax, ay, az);
  ringMesh(parent, r, 0.045, b.accent, cx, cy, cz, n);
  const lx = 0.7 * f.x - 0.7, ly = 0.7 * f.y, lz = 0.7 * f.z;
  const g = LG(parent, cx + r * lx, cy + r * ly, cz + r * lz);
  Bx(g, 0.08, 0.24, 0.04, 0.015, b.accent, 0, -0.12 - 0.02, 0.0);
  g.name = 'scarfTail';
  b.parts.scarfTail = g;
}

/* Quadruped leg: pivot at the hip, capsule down, paw (or hoof) and hand attach point. */
function QLeg(b, parent, sign, legX, hipY, z, legR, m, o) {
  o = o || {};
  const g = LG(parent, sign * legX, hipY, z);
  g.userData.x0 = sign * legX;
  const len = Math.max(0.02, +(hipY - 2 * legR).toFixed(3));
  Cp(g, legR, len, m, 0, -hipY / 2, 0);
  if (o.darkLower) Cp(g, legR + 0.003, 0.10, bodyMaterial(o.darkLower), 0, -hipY + 0.12, 0);
  if (o.hoof) S(g, 0.05, bodyMaterial(o.hoof), 0, -hipY + 0.03, 0.01, 1, 0.5, 1);
  else {
    const paw = S(g, +(legR * 1.15).toFixed(3), o.pawMat || m, 0, -hipY + 0.6 * legR, 0.03, 1, 0.6, 1.3);
    if (o.nails) {
      for (let i = -1; i <= 1; i++) S(g, 0.025, bodyMaterial(o.nails), i * legR * 0.6, -hipY + 0.5 * legR, legR * 1.3 + 0.02);
    }
    g.userData.paw = paw;
  }
  if (o.rz) g.rotation.z = o.rz;
  g.userData.rz0 = o.rz || 0;
  const hand = Pt(g, 0, -hipY + 0.05, legR + 0.02);
  g.userData.hand = hand;
  return g;
}
/* Biped arm: pivot at the shoulder, capsule, hand sphere at the tip, attach point past it. */
function BArm(b, sign, px, py, pz, r, len, m, handMat, o) {
  o = o || {};
  const g = LG(b.torso, sign * px, py, pz);
  g.userData.x0 = sign * px;
  Cp(g, r, len, m, 0, -(len / 2 + r), 0);
  S(g, +(r * 1.1).toFixed(3), handMat || m, 0, -(len + 2 * r) + r * 0.6, 0);
  if (o.claws) for (let i = -1; i <= 1; i += (o.claws === 2 ? 2 : 1)) S(g, 0.015, bodyMaterial(DARK), i * r * 0.5, -(len + 2 * r) + 0.02, r * 0.9);
  if (o.toes) for (let i = -1; i <= 1; i++) S(g, 0.025, m, i * r * 0.7, -(len + 2 * r) + 0.02, r * 0.9);
  g.userData.rz0 = 0;
  g.userData.hand = Pt(g, 0, -(len + 2 * r), o.handZ || 0);
  return g;
}
/* Biped leg: pivot at the hip, short capsule and a foot. */
function BLeg(b, sign, px, py, pz, r, len, m, foot) {
  const g = LG(b.rig, sign * px, py, pz);
  g.userData.x0 = sign * px;
  g.userData.rz0 = 0;
  if (len > 0) Cp(g, r, len, m, 0, -(len / 2 + r) + r * 0.5, 0);
  foot(g, py);
  return g;
}
/* Bird wing: a thin sphere hanging from the shoulder pivot, tip tinted optionally. */
function Wing(b, sign, px, py, pz, wl, wd, m, tipMat) {
  const g = LG(b.torso, sign * px, py, pz);
  g.userData.x0 = sign * px;
  g.userData.rz0 = 0;
  S(g, 1, m, 0, -wl, 0, 0.05, wl, wd);
  if (tipMat) S(g, 1, tipMat, 0, -1.7 * wl, 0, 0.045, wl * 0.35, wd * 0.8);
  g.userData.hand = Pt(g, 0, -2 * wl, 0.02);
  return g;
}

/* Torus rings around an ellipsoid body (stripes): each ring is scaled to the body's local
   cross-section so it beds into the surface. */
function bodyRings(parent, m, cx, cy, cz, sx, sy, sz, zs, tube) {
  for (const z of zs) {
    const dz = (z - cz) / sz;
    const f = Math.sqrt(Math.max(0.1, 1 - dz * dz)) * 0.98;
    To(parent, 1, tube, m, cx, cy, z, null, [sx * f, sy * f, 1]);
  }
}

/* ------------------------------------------------------------------ */
/* Species recipes (ZOO_DESIGN "Species recipes"). Each returns the spec the animator needs. */

const RECIPES = {};

/* Quadruped standard body plus four legs. */
function qBody(b, o) {
  b.pivot(0, o.hipY, o.hindZ);
  const m = b.c(o.hex);
  b.parts.body = S(b.torso, 1, m, 0, o.cy, o.bz, o.sx, o.sy, o.sz);
  b.parts.body.name = 'body';
  if (o.belly) S(b.torso, o.belly[0], b.c(o.belly[1]), 0, o.belly[2], o.belly[3], o.belly[4], o.belly[5], o.belly[6]);
  qLegs(b, o, m);
  Object.assign(b.spec, { build: 'quadruped', hipY: o.hipY, legX: o.legX, bodyCy: o.cy, bodyBottom: o.cy - o.sy });
}
function qLegs(b, o, m) {
  const lo = { pawMat: o.pawMat, hoof: o.hoof, nails: o.nails, darkLower: o.darkLower };
  b.parts.armL = QLeg(b, b.torso, -1, o.legX, o.hipY, o.frontZ, o.legR, m, Object.assign({ rz: -(o.splay || 0) }, lo));
  b.parts.armR = QLeg(b, b.torso, 1, o.legX, o.hipY, o.frontZ, o.legR, m, Object.assign({ rz: o.splay || 0 }, lo));
  b.parts.legL = QLeg(b, b.rig, -1, o.legX, o.hipY, o.hindZ, o.legR, m, Object.assign({ rz: -(o.splay || 0) }, lo));
  b.parts.legR = QLeg(b, b.rig, 1, o.legX, o.hipY, o.hindZ, o.legR, m, Object.assign({ rz: o.splay || 0 }, lo));
  b.parts.handL = b.parts.armL.userData.hand; b.parts.handR = b.parts.armR.userData.hand;
  b.parts.armL.name = 'armL'; b.parts.armR.name = 'armR'; b.parts.legL.name = 'legL'; b.parts.legR.name = 'legR';
}
function headAt(b, nx, ny, nz, hx, hy, hz, hexHead) {
  b.head = G(b.torso, nx, ny, nz);
  b.head.name = 'head';
  b.headC = new THREE.Vector3(hx, hy, hz);
  b.headMat = b.c(hexHead);
  b.eyePivot = G(b.head, hx, hy, hz);
  b.eyePivot.name = 'eyes';
  b.spec.N = [nx, ny, nz];
}
function finishHead(b, mx, my, mz) {
  b.spec.M = [mx, my, mz];
  b.parts.mouthPoint = Pt(b.head, mx, my, mz);
}

RECIPES.lion = function (b) {
  const body = '#E0B36A', mane = '#A8632C', cream = '#F3DDB0';
  qBody(b, { hex: body, sx: 0.26, sy: 0.24, sz: 0.40, cy: 0.46, bz: -0.05, hipY: 0.40, legR: 0.07, legX: 0.14, frontZ: 0.22, hindZ: -0.30,
    belly: [0.16, cream, 0.34, 0.10, 1, 0.8, 0.5] });
  headAt(b, 0, 0.62, 0.22, 0, 0.72, 0.30, body);
  const mm = b.c(mane);
  b.parts.head = S(b.head, 0.24, b.headMat, 0, 0.72, 0.30);
  S(b.head, 0.27, mm, 0, 0.74, 0.20, 1, 1, 0.75);
  To(b.head, 0.24, 0.12, mm, 0, 0.72, 0.24);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.15, 0.86, 0.26, 0, 0);
    S(e, 0.06, b.headMat, 0, 0.06, 0); S(e, 0.035, b.c(PINK), 0, 0.06, 0.03);
  }
  S(b.head, 0.11, b.c(cream), 0, 0.66, 0.50, 1.2, 0.8, 0.9);
  S(b.head, 0.04, b.c(DARK), 0, 0.71, 0.58);
  Mouth(b, b.head, 0.08, 0.02, 0.02, mm, 0, 0.62, 0.57);
  Eyes(b, 0.10, 0.78, 0.49, 0.07);
  const t = TailPivot(b, b.torso, 0, 0.52, -0.42);
  Seg(t, 0, 0, 0, 0, 0.29, -0.20, 0.025, b.c(body));
  S(t, 0.05, mm, 0, 0.29, -0.20);
  Bandana(b, b.torso, 0.20, 0, 0.52, 0.34, 0, 0.55, 0.84);
  finishHead(b, 0, 0.63, 0.58);
  Object.assign(b.spec, { height: 1.01, seatY: 0.10, portraitScale: 0.95, sitHead: 0.25 });
};

RECIPES.tiger = function (b) {
  const body = '#E58A3C', stripe = '#2B2420', cream = '#F6E6CF';
  qBody(b, { hex: body, sx: 0.25, sy: 0.23, sz: 0.40, cy: 0.45, bz: -0.05, hipY: 0.40, legR: 0.07, legX: 0.14, frontZ: 0.22, hindZ: -0.30,
    belly: [0.15, cream, 0.34, 0.10, 1, 0.8, 0.5] });
  const sm = b.c(stripe);
  bodyRings(b.torso, sm, 0, 0.45, -0.05, 0.25, 0.23, 0.40, [-0.33, -0.19, -0.05, 0.09, 0.21], 0.025);
  headAt(b, 0, 0.60, 0.24, 0, 0.70, 0.32, body);
  b.parts.head = S(b.head, 0.21, b.headMat, 0, 0.70, 0.32);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.14, 0.82, 0.28, 0, 0);
    S(e, 0.06, b.headMat, 0, 0.06, 0); S(e, 0.035, b.c(PINK), 0, 0.06, 0.03);
    Bx(b.head, 0.04, 0.12, 0.02, 0.008, sm, s * 0.06, 0.86, 0.46, [0, 0, s * 0.3]);
  }
  S(b.head, 0.10, b.c(cream), 0, 0.64, 0.49, 1.25, 0.75, 0.9);
  S(b.head, 0.035, b.c('#E39AA0'), 0, 0.69, 0.56);
  Mouth(b, b.head, 0.08, 0.02, 0.02, sm, 0, 0.60, 0.55);
  Eyes(b, 0.09, 0.75, 0.48, 0.065);
  const t = TailPivot(b, b.torso, 0, 0.50, -0.42);
  Seg(t, 0, 0, 0, 0, 0.33, -0.14, 0.025, b.c(body));
  for (let i = 1; i <= 3; i++) To(t, 0.03, 0.012, sm, 0, 0.08 * i, -0.034 * i, [-0.4, 0, 0]);
  Collar(b, b.torso, 0.17, 0, 0.56, 0.24, 0, 0.55, 0.83);
  finishHead(b, 0, 0.61, 0.56);
  Object.assign(b.spec, { height: 0.94, seatY: 0.10, portraitScale: 1, sitHead: 0.25 });
};

RECIPES.elephant = function (b) {
  const body = '#9FA7B3', inner = '#C9B3B8';
  qBody(b, { hex: body, sx: 0.36, sy: 0.34, sz: 0.44, cy: 0.60, bz: -0.02, hipY: 0.46, legR: 0.10, legX: 0.20, frontZ: 0.24, hindZ: -0.26, nails: '#E8E4DC' });
  headAt(b, 0, 0.80, 0.26, 0, 0.96, 0.36, body);
  b.parts.head = S(b.head, 0.32, b.headMat, 0, 0.96, 0.36);
  // Ear pivots sit at x 0.26 with a 0.25 flare so the elephant stays within the quadruped width budget.
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.26, 0.98, 0.30, 0, 0);
    e.rotation.y = s * 0.25;
    S(e, 1, b.headMat, s * 0.05, 0, 0, 0.07, 0.28, 0.24);
    S(e, 1, b.c(inner), s * 0.08, 0, 0.03, 0.03, 0.20, 0.17);
  }
  // Trunk: three chained capsules hanging from the face, curling forward at the tip.
  const tr = LG(b.head, 0, 0.82, 0.64);
  Seg(tr, 0, 0, 0, 0, -0.22, 0.08, 0.075, b.headMat);
  Seg(tr, 0, -0.22, 0.08, 0, -0.42, 0.10, 0.06, b.headMat);
  Seg(tr, 0, -0.42, 0.10, 0, -0.54, 0.06, 0.05, b.headMat);
  S(tr, 0.05, b.c(inner), 0, -0.54, 0.06);
  b.parts.trunk = tr;
  for (const s of [-1, 1]) Cn(b.head, 0.035, 0.22, b.c(TOOTH), s * 0.15, 0.74, 0.58, 0, -0.35, 0.94);
  Eyes(b, 0.13, 1.02, 0.63, 0.06);
  const t = TailPivot(b, b.torso, 0, 0.70, -0.46);
  Seg(t, 0, 0, 0, 0, -0.28, -0.08, 0.02, b.c(body));
  S(t, 0.04, b.c('#5E4538'), 0, -0.28, -0.08);
  Collar(b, b.torso, 0.30, 0, 0.78, 0.26, 0, 0.6, 0.8);
  finishHead(b, 0, 0.80, 0.68);
  Object.assign(b.spec, { height: 1.28, seatY: 0.14, portraitScale: 0.75, sitHead: 0.5, trunk: true });
};

RECIPES.giraffe = function (b) {
  const body = '#E9B55C', patch = '#A5652A', cream = '#F6E3BC', mane = '#7A4A24', tip = '#5A3B22';
  qBody(b, { hex: body, sx: 0.22, sy: 0.22, sz: 0.34, cy: 0.70, bz: 0.0, hipY: 0.62, legR: 0.055, legX: 0.13, frontZ: 0.20, hindZ: -0.22 });
  headAt(b, 0, 0.80, 0.22, 0, 1.62, 0.46, body);
  Seg(b.head, 0, 0.80, 0.22, 0, 1.52, 0.42, 0.10, b.headMat);
  for (let i = 0; i < 6; i++) Bx(b.head, 0.03, 0.08, 0.07, 0.01, b.c(mane), 0, 0.90 + i * 0.12, 0.26 + i * 0.03 - 0.10, [-0.25, 0, 0]);
  b.parts.head = S(b.head, 0.15, b.headMat, 0, 1.62, 0.46, 1, 0.9, 1.3);
  S(b.head, 0.08, b.c(cream), 0, 1.56, 0.64, 1.1, 0.8, 1);
  for (const s of [-1, 1]) {
    S(b.head, 0.015, b.c(DARK), s * 0.03, 1.57, 0.71);
    Cy(b.head, 0.02, 0.02, 0.14, b.c(body), s * 0.06, 1.79, 0.42);
    S(b.head, 0.035, b.c(tip), s * 0.06, 1.865, 0.42);
    const e = EarPivot(b, b.head, s * 0.12, 1.66, 0.40, 0, s * 0.5);
    S(e, 1, b.headMat, 0, 0.08, 0, 0.05, 0.10, 0.12);
  }
  Eyes(b, 0.09, 1.66, 0.58, 0.055);
  const pm = b.c(patch);
  const r = b.rng;
  for (let i = 0; i < 7; i++) {
    const psi = Math.PI * 0.55 + r() * Math.PI * 0.9;
    const y = 0.70 + (r() - 0.5) * 0.26, z = (r() - 0.5) * 0.5;
    const f = Math.sqrt(Math.max(0.2, 1 - (z / 0.34) * (z / 0.34)));
    S(b.torso, 0.08, pm, Math.sin(psi) * 0.22 * f * 0.96, y, z, 1, 1, 0.3).lookAt(0, 0.70, z);
  }
  for (let i = 0; i < 3; i++) S(b.head, 0.05, pm, (i - 1) * 0.07, 1.0 + i * 0.16, 0.22 + i * 0.03, 1, 1, 0.4);
  const t = TailPivot(b, b.torso, 0, 0.76, -0.36);
  Seg(t, 0, 0, 0, 0, -0.38, -0.08, 0.018, b.c(body));
  S(t, 0.04, b.c(mane), 0, -0.38, -0.08);
  Collar(b, b.head, 0.12, 0, 1.30, 0.36, 0, 0.94, 0.28);
  finishHead(b, 0, 1.52, 0.68);
  Object.assign(b.spec, { height: 1.90, seatY: 0.12, portraitScale: 0.5, sitHead: 1.1, lookUpHead: -0.35, golfHead: 0.5 });
};

RECIPES.zebra = function (b) {
  const body = '#F3F1EC', dark = '#1E1E22', muzzle = '#4A4347';
  qBody(b, { hex: body, sx: 0.24, sy: 0.23, sz: 0.40, cy: 0.50, bz: -0.04, hipY: 0.44, legR: 0.06, legX: 0.13, frontZ: 0.22, hindZ: -0.28 });
  const dm = b.c(dark);
  bodyRings(b.torso, dm, 0, 0.50, -0.04, 0.24, 0.23, 0.40, [-0.36, -0.26, -0.16, -0.06, 0.04, 0.14], 0.022);
  for (const leg of [b.parts.armL, b.parts.armR, b.parts.legL, b.parts.legR]) {
    To(leg, 0.065, 0.015, dm, 0, -0.14, 0, [Math.PI / 2, 0, 0]);
    To(leg, 0.065, 0.015, dm, 0, -0.26, 0, [Math.PI / 2, 0, 0]);
  }
  headAt(b, 0, 0.62, 0.26, 0, 0.86, 0.44, body);
  Seg(b.head, 0, 0.62, 0.26, 0, 0.84, 0.40, 0.11, b.headMat);
  for (let i = 0; i < 3; i++) To(b.head, 0.12, 0.02, dm, 0, 0.66 + i * 0.07, 0.30 + i * 0.045, [-0.6, 0, 0]);
  Bx(b.head, 0.04, 0.10, 0.30, 0.012, dm, 0, 0.86, 0.32, [-0.7, 0, 0]);
  b.parts.head = S(b.head, 0.16, b.headMat, 0, 0.86, 0.44, 1, 0.9, 1.35);
  S(b.head, 0.09, b.c(muzzle), 0, 0.80, 0.62);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.09, 0.96, 0.38, 0, s * 0.15);
    Cn(e, 0.04, 0.10, b.headMat, 0, 0, 0, 0, 1, 0);
  }
  Eyes(b, 0.10, 0.90, 0.56, 0.06);
  const t = TailPivot(b, b.torso, 0, 0.54, -0.44);
  Seg(t, 0, 0, 0, 0, -0.30, -0.08, 0.02, b.headMat);
  S(t, 0.045, dm, 0, -0.30, -0.08);
  Bandana(b, b.torso, 0.13, 0, 0.62, 0.34, 0, 0.6, 0.8);
  finishHead(b, 0, 0.78, 0.70);
  Object.assign(b.spec, { height: 1.10, seatY: 0.11, portraitScale: 0.85, sitHead: 0.35 });
};

RECIPES.hippo = function (b) {
  const body = '#8E8FB0', pinkish = '#D8A6B8';
  qBody(b, { hex: body, sx: 0.34, sy: 0.28, sz: 0.44, cy: 0.40, bz: -0.04, hipY: 0.30, legR: 0.09, legX: 0.20, frontZ: 0.24, hindZ: -0.26,
    belly: [0.22, pinkish, 0.26, 0.10, 1, 0.6, 0.6] });
  headAt(b, 0, 0.52, 0.30, 0, 0.64, 0.36, body);
  b.parts.head = S(b.head, 0.22, b.headMat, 0, 0.64, 0.36);
  S(b.head, 0.24, b.headMat, 0, 0.52, 0.52, 1.15, 0.8, 1.2);
  for (const s of [-1, 1]) {
    S(b.head, 0.07, b.headMat, s * 0.12, 0.76, 0.46);
    const e = EarPivot(b, b.head, s * 0.16, 0.80, 0.36, 0, 0);
    S(e, 0.045, b.headMat, 0, 0.04, 0); S(e, 0.025, b.c(pinkish), 0, 0.04, 0.025);
    S(b.head, 0.03, b.c('#4B4A66'), s * 0.07, 0.62, 0.79);
    Bx(b.head, 0.04, 0.07, 0.03, 0.008, b.c(TOOTH), s * 0.10, 0.40, 0.72);
  }
  Bx(b.head, 0.30, 0.05, 0.06, 0.015, b.c(pinkish), 0, 0.36, 0.70);
  Mouth(b, b.head, 0.22, 0.02, 0.02, b.c('#4B4A66'), 0, 0.44, 0.78);
  Eyes(b, 0.12, 0.79, 0.50, 0.055);
  const t = TailPivot(b, b.torso, 0, 0.44, -0.48);
  Seg(t, 0, 0, 0, 0, -0.04, -0.09, 0.03, b.c(body));
  Scarf(b, b.torso, 0.26, 0, 0.56, 0.26, 0, 0.5, 0.86);
  finishHead(b, 0, 0.44, 0.76);
  Object.assign(b.spec, { height: 0.86, seatY: 0.08, portraitScale: 1, sitHead: 0.2, swimmer: true });
};

RECIPES.bear = function (b) {
  const body = '#7A5236', tan = '#C79A6B';
  const m = b.c(body);
  b.parts.body = S(b.torso, 1, m, 0, 0.52, 0, 0.32, 0.38, 0.30);
  S(b.torso, 0.17, b.c(tan), 0, 0.50, 0.28, 1, 1.2, 0.3);
  headAt(b, 0, 0.84, 0.02, 0, 0.98, 0.04, body);
  b.parts.head = S(b.head, 0.24, b.headMat, 0, 0.98, 0.04);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.17, 1.12, 0.0, 0, s * 0.2);
    S(e, 0.07, b.headMat, 0, 0.05, 0); S(e, 0.04, b.c(PINK), 0, 0.05, 0.03);
  }
  S(b.head, 0.11, b.c(tan), 0, 0.92, 0.24, 1.1, 0.85, 1);
  S(b.head, 0.045, b.c(DARK), 0, 0.96, 0.33);
  Mouth(b, b.head, 0.07, 0.02, 0.02, b.c(DARK), 0, 0.88, 0.32);
  Eyes(b, 0.09, 1.04, 0.21, 0.065);
  b.parts.armL = BArm(b, -1, 0.30, 0.78, 0.02, 0.08, 0.22, m, null, { claws: 3 });
  b.parts.armR = BArm(b, 1, 0.30, 0.78, 0.02, 0.08, 0.22, m, null, { claws: 3 });
  const foot = (g, py) => S(g, 0.10, m, 0, -py + 0.055, 0.04, 1, 0.55, 1.3);
  b.parts.legL = BLeg(b, -1, 0.14, 0.22, 0, 0.09, 0.06, m, foot);
  b.parts.legR = BLeg(b, 1, 0.14, 0.22, 0, 0.09, 0.06, m, foot);
  const t = TailPivot(b, b.torso, 0, 0.30, -0.26);
  S(t, 0.05, m, 0, 0, -0.04);
  Scarf(b, b.torso, 0.20, 0, 0.82, 0.02, 0, 1, 0);
  finishHead(b, 0, 0.89, 0.34);
  // restArmZ 0.12 keeps the hanging arms within the biped width budget.
  Object.assign(b.spec, { build: 'biped', height: 1.22, seatY: 0.17, portraitScale: 0.8, bodyCy: 0.52, bodyBottom: 0.14, restArmZ: 0.12 });
};

RECIPES.panda = function (b) {
  const white = '#F4F2EC', black = '#1E1E22';
  const wm = b.c(white), bm = b.c(black);
  b.parts.body = S(b.torso, 1, wm, 0, 0.44, 0, 0.30, 0.33, 0.28);
  S(b.torso, 1, bm, 0, 0.66, 0, 0.31, 0.12, 0.29);
  headAt(b, 0, 0.72, 0.02, 0, 0.84, 0.04, white);
  b.parts.head = S(b.head, 0.22, b.headMat, 0, 0.84, 0.04);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.16, 0.95, 0.0, 0, s * 0.15);
    S(e, 0.07, bm, 0, 0.05, 0);
    S(b.head, 0.075, bm, s * 0.09, 0.88, 0.20, 1, 1.3, 0.4).rotation.z = s * 0.4;
  }
  S(b.head, 0.035, bm, 0, 0.80, 0.25);
  Mouth(b, b.head, 0.06, 0.015, 0.02, bm, 0, 0.75, 0.24);
  Eyes(b, 0.09, 0.88, 0.235, 0.05);
  b.parts.armL = BArm(b, -1, 0.28, 0.66, 0.02, 0.075, 0.20, bm);
  b.parts.armR = BArm(b, 1, 0.28, 0.66, 0.02, 0.075, 0.20, bm);
  const foot = (g, py) => S(g, 0.09, bm, 0, -py + 0.05, 0.04, 1, 0.55, 1.3);
  b.parts.legL = BLeg(b, -1, 0.13, 0.20, 0, 0.085, 0.05, bm, foot);
  b.parts.legR = BLeg(b, 1, 0.13, 0.20, 0, 0.085, 0.05, bm, foot);
  Bandana(b, b.torso, 0.19, 0, 0.74, 0.14, 0, 1, 0.15);
  finishHead(b, 0, 0.76, 0.26);
  Object.assign(b.spec, { build: 'biped', height: 1.06, seatY: 0.14, portraitScale: 0.9, bodyCy: 0.44, bodyBottom: 0.11, restArmZ: 0.25 });
};

RECIPES.fox = function (b) {
  const body = '#E2742F', cream = '#F6EFE3', dark = '#2B2420';
  qBody(b, { hex: body, sx: 0.18, sy: 0.17, sz: 0.30, cy: 0.38, bz: -0.04, hipY: 0.32, legR: 0.045, legX: 0.10, frontZ: 0.16, hindZ: -0.22, darkLower: dark, pawMat: b.c(dark) });
  S(b.torso, 1, b.c(cream), 0, 0.40, 0.22, 0.10, 0.12, 0.06);
  headAt(b, 0, 0.50, 0.22, 0, 0.58, 0.28, body);
  b.parts.head = S(b.head, 0.15, b.headMat, 0, 0.58, 0.28);
  Cn(b.head, 0.07, 0.16, b.c(cream), 0, 0.54, 0.38, 0, 0, 1);
  S(b.head, 0.03, b.c(DARK), 0, 0.54, 0.55);
  Mouth(b, b.head, 0.05, 0.012, 0.02, b.c(DARK), 0, 0.50, 0.52);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.08, 0.68, 0.24, -0.15, s * 0.2);
    Cn(e, 0.05, 0.14, b.c(dark), 0, 0, -0.01, 0, 1, 0);
    Cn(e, 0.03, 0.09, b.c(PINK), 0, 0.01, 0.015, 0, 1, 0.05);
  }
  Eyes(b, 0.07, 0.62, 0.40, 0.05);
  const t = TailPivot(b, b.torso, 0, 0.40, -0.32);
  Seg(t, 0, 0, 0, 0, 0.16, -0.20, 0.07, b.c(body));
  S(t, 0.07, b.c(cream), 0, 0.17, -0.22);
  Collar(b, b.torso, 0.11, 0, 0.50, 0.24, 0, 0.5, 0.86);
  finishHead(b, 0, 0.52, 0.55);
  Object.assign(b.spec, { height: 0.84, seatY: 0.09, portraitScale: 1, sitHead: 0.3 });
};

RECIPES.wolf = function (b) {
  const body = '#8A8F9A', light = '#D6D9DF';
  qBody(b, { hex: body, sx: 0.22, sy: 0.20, sz: 0.36, cy: 0.42, bz: -0.04, hipY: 0.36, legR: 0.055, legX: 0.12, frontZ: 0.20, hindZ: -0.26,
    belly: [0.14, light, 0.30, 0.08, 1, 0.8, 0.5] });
  headAt(b, 0, 0.56, 0.26, 0, 0.64, 0.30, body);
  b.parts.head = S(b.head, 0.17, b.headMat, 0, 0.64, 0.30);
  Bx(b.head, 0.14, 0.11, 0.18, 0.04, b.c(light), 0, 0.56, 0.44);
  S(b.head, 0.035, b.c('#2B2420'), 0, 0.61, 0.56);
  Mouth(b, b.head, 0.08, 0.02, 0.02, b.c('#2B2420'), 0, 0.53, 0.54);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.09, 0.74, 0.26, -0.1, s * 0.15);
    Cn(e, 0.05, 0.13, b.headMat, 0, 0, 0, 0, 1, 0);
    Cn(e, 0.03, 0.08, b.c(PINK), 0, 0.01, 0.015, 0, 1, 0.08);
    Bx(b.head, 0.07, 0.02, 0.03, 0.006, b.headMat, s * 0.08, 0.745, 0.43, [-0.3, 0, 0]);
  }
  Eyes(b, 0.08, 0.68, 0.42, 0.055);
  const t = TailPivot(b, b.torso, 0, 0.44, -0.40);
  Seg(t, 0, 0, 0, 0, 0.14, -0.26, 0.055, b.c(body));
  S(t, 0.05, b.c(light), 0, 0.15, -0.28);
  Bandana(b, b.torso, 0.14, 0, 0.54, 0.30, 0, 0.5, 0.86);
  finishHead(b, 0, 0.54, 0.56);
  Object.assign(b.spec, { height: 0.93, seatY: 0.10, portraitScale: 1, sitHead: 0.3 });
};

RECIPES.monkey = function (b) {
  const body = '#8B5A3C', face = '#E9C9A3';
  const m = b.c(body), fm = b.c(face);
  b.parts.body = S(b.torso, 1, m, 0, 0.46, 0, 0.20, 0.24, 0.18);
  S(b.torso, 0.12, fm, 0, 0.44, 0.14, 1, 1.1, 0.3);
  headAt(b, 0, 0.66, 0.02, 0, 0.78, 0.02, body);
  b.parts.head = S(b.head, 0.17, b.headMat, 0, 0.78, 0.02);
  S(b.head, 0.12, fm, 0, 0.75, 0.11, 1.15, 1, 0.6);
  for (const s of [-1, 1]) {
    S(b.head, 0.012, b.c(DARK), s * 0.02, 0.73, 0.19);
    const e = EarPivot(b, b.head, s * 0.16, 0.80, 0.0, 0, 0);
    S(e, 0.06, fm, s * 0.03, 0, 0, 0.5, 1, 1);
  }
  Mouth(b, b.head, 0.08, 0.015, 0.02, b.c(DARK), 0, 0.69, 0.19);
  Eyes(b, 0.06, 0.80, 0.17, 0.05);
  b.parts.armL = BArm(b, -1, 0.19, 0.62, 0, 0.045, 0.30, m, fm);
  b.parts.armR = BArm(b, 1, 0.19, 0.62, 0, 0.045, 0.30, m, fm);
  const foot = (g, py) => Bx(g, 0.08, 0.04, 0.16, 0.015, fm, 0, -py + 0.02, 0.04);
  b.parts.legL = BLeg(b, -1, 0.09, 0.24, 0, 0.05, 0.12, m, foot);
  b.parts.legR = BLeg(b, 1, 0.09, 0.24, 0, 0.05, 0.12, m, foot);
  const t = TailPivot(b, b.torso, 0, 0.34, -0.14);
  const tube = cachedGeo('tube:monkey', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.14, -0.18), new THREE.Vector3(0, 0.08, -0.28), new THREE.Vector3(0, 0.26, -0.20),
  ]), 12, 0.025, 8, false));
  const tm = new THREE.Mesh(tube, m);
  tm.castShadow = true; tm.receiveShadow = false;
  t.add(tm);
  Collar(b, b.torso, 0.12, 0, 0.64, 0.02, 0, 1, 0);
  finishHead(b, 0, 0.70, 0.22);
  Object.assign(b.spec, { build: 'biped', height: 0.95, seatY: 0.25, portraitScale: 1, bodyCy: 0.46, bodyBottom: 0.22, restArmZ: 0.2, tailRock: true });
};

RECIPES.penguin = function (b) {
  const dark = '#1F2A3A', white = '#F6F6F2', orange = '#F2A33A';
  const dm = b.c(dark), wm = b.c(white), om = b.c(orange);
  b.parts.body = Cp(b.torso, 0.21, 0.16, dm, 0, 0.40, 0);
  S(b.torso, 1, wm, 0, 0.40, 0.11, 0.17, 0.30, 0.10);
  headAt(b, 0, 0.62, 0.02, 0, 0.72, 0.02, dark);
  b.parts.head = S(b.head, 0.16, b.headMat, 0, 0.72, 0.02);
  for (const s of [-1, 1]) S(b.head, 0.07, wm, s * 0.08, 0.74, 0.14, 1, 1.2, 0.3);
  const beak = Cn(b.head, 0.04, 0.12, om, 0, 0.70, 0.15, 0, 0, 1);
  b.parts.beak = beak;
  Eyes(b, 0.07, 0.77, 0.14, 0.05);
  b.parts.armL = Wing(b, -1, 0.20, 0.56, 0, 0.20, 0.10, dm);
  b.parts.armR = Wing(b, 1, 0.20, 0.56, 0, 0.20, 0.10, dm);
  const foot = (g, py) => Bx(g, 0.12, 0.04, 0.16, 0.02, om, 0, -py + 0.02, 0.06);
  b.parts.legL = BLeg(b, -1, 0.08, 0.10, 0, 0, 0, dm, foot);
  b.parts.legR = BLeg(b, 1, 0.08, 0.10, 0, 0, 0, dm, foot);
  const t = TailPivot(b, b.torso, 0, 0.22, -0.18);
  Cn(t, 0.05, 0.10, dm, 0, 0, 0, 0, -0.35, -0.94);
  Scarf(b, b.torso, 0.17, 0, 0.60, 0.02, 0, 1, 0);
  finishHead(b, 0, 0.69, 0.26);
  Object.assign(b.spec, { build: 'bird', height: 0.88, seatY: 0.14, portraitScale: 1, bodyCy: 0.40, bodyBottom: 0.11, restArmZ: 0.15, penguin: true });
};

RECIPES.flamingo = function (b) {
  const body = '#F58CA6', leg = '#F2A3B0', beakBase = '#F6D7C3', dark = '#1E1E22', tipc = '#E05A7A';
  const bm = b.c(body), lm = b.c(leg);
  b.parts.body = S(b.torso, 1, bm, 0, 0.74, -0.02, 0.16, 0.14, 0.22);
  for (let i = -1; i <= 1; i++) Cn(b.torso, 0.03, 0.10, b.c(tipc), 0, 0.78, -0.22, i * 0.3, 0.5, -0.8);
  headAt(b, 0, 0.84, 0.12, 0, 1.40, 0.24, body);
  Seg(b.head, 0, 0.84, 0.12, 0, 1.22, 0.24, 0.045, b.headMat);
  Seg(b.head, 0, 1.22, 0.24, 0, 1.38, 0.24, 0.04, b.headMat);
  b.parts.head = S(b.head, 0.10, b.headMat, 0, 1.40, 0.24);
  Cn(b.head, 0.035, 0.09, b.c(beakBase), 0, 1.37, 0.32, 0, -0.59, 0.81);
  Cn(b.head, 0.03, 0.08, b.c(dark), 0, 1.32, 0.39, 0, -0.9, 0.43);
  Eyes(b, 0.055, 1.42, 0.31, 0.035);
  b.parts.armL = Wing(b, -1, 0.15, 0.80, -0.02, 0.12, 0.18, bm, b.c(tipc));
  b.parts.armR = Wing(b, 1, 0.15, 0.80, -0.02, 0.12, 0.18, bm, b.c(tipc));
  const foot = (g, py) => {
    Cy(g, 0.015, 0.015, py - 0.02, lm, 0, -py / 2 + 0.01, 0);
    S(g, 0.025, lm, 0, -0.28, 0);
    Bx(g, 0.12, 0.02, 0.14, 0.008, lm, 0, -py + 0.01, 0.03);
  };
  b.parts.legL = BLeg(b, -1, 0.06, 0.62, -0.02, 0, 0, lm, foot);
  b.parts.legR = BLeg(b, 1, 0.06, 0.62, -0.02, 0, 0, lm, foot);
  Collar(b, b.head, 0.055, 0, 1.28, 0.24, 0, 1, 0);
  finishHead(b, 0, 1.30, 0.38);
  Object.assign(b.spec, { build: 'bird', height: 1.50, seatY: 0.50, portraitScale: 0.6, bodyCy: 0.74, bodyBottom: 0.60, restArmZ: 0.2, flamingo: true, sitLegFold: 1.5 });
};

RECIPES.owl = function (b) {
  const body = '#8C6A4B', light = '#D9C3A0', chev = '#6B4E35';
  const bm = b.c(body), lm = b.c(light);
  b.parts.body = S(b.torso, 1, bm, 0, 0.40, 0, 0.22, 0.26, 0.20);
  S(b.torso, 1, lm, 0, 0.38, 0.13, 0.15, 0.20, 0.08);
  for (let i = 0; i < 6; i++) Bx(b.torso, 0.05, 0.02, 0.01, 0.004, b.c(chev), (i % 2 ? 0.045 : -0.045), 0.30 + Math.floor(i / 2) * 0.06, 0.205);
  headAt(b, 0, 0.52, 0.02, 0, 0.60, 0.02, body);
  b.parts.head = S(b.head, 0.20, b.headMat, 0, 0.60, 0.02, 1.1, 0.9, 1);
  for (const s of [-1, 1]) {
    S(b.head, 0.11, lm, s * 0.09, 0.62, 0.15, 1, 1, 0.35);
    const e = EarPivot(b, b.head, s * 0.14, 0.74, 0.0, 0, s * 0.3);
    Cn(e, 0.04, 0.10, bm, 0, 0, 0, 0, 1, 0);
  }
  Eyes(b, 0.09, 0.62, 0.21, 0.085, 0.6);
  Cn(b.head, 0.03, 0.08, b.c(AMBER), 0, 0.57, 0.22, 0, -0.74, 0.68);
  b.parts.armL = Wing(b, -1, 0.22, 0.52, 0, 0.18, 0.14, bm);
  b.parts.armR = Wing(b, 1, 0.22, 0.52, 0, 0.18, 0.14, bm);
  const am = b.c(AMBER);
  const foot = (g, py) => { Bx(g, 0.08, 0.03, 0.10, 0.01, am, 0, -py + 0.015, 0.02); for (let i = -1; i <= 1; i++) S(g, 0.015, am, i * 0.025, -py + 0.015, 0.075); };
  b.parts.legL = BLeg(b, -1, 0.07, 0.12, 0, 0, 0, bm, foot);
  b.parts.legR = BLeg(b, 1, 0.07, 0.12, 0, 0, 0, bm, foot);
  Bandana(b, b.torso, 0.16, 0, 0.50, 0.06, 0, 1, 0.3);
  finishHead(b, 0, 0.54, 0.26);
  Object.assign(b.spec, { build: 'bird', height: 0.86, seatY: 0.17, portraitScale: 1, bodyCy: 0.40, bodyBottom: 0.14, restArmZ: 0.1, headTurn: 0.9, sitHead: 0.2 });
};

RECIPES.falcon = function (b) {
  const body = '#5C6B7A', belly = '#EEE6D4', mark = '#2B3440', tail = '#4A5866';
  const bm = b.c(body);
  b.parts.body = S(b.torso, 1, bm, 0, 0.42, 0, 0.16, 0.22, 0.18);
  S(b.torso, 1, b.c(belly), 0, 0.40, 0.10, 0.11, 0.17, 0.07);
  for (let i = 0; i < 4; i++) S(b.torso, 0.012, bm, (i % 2 ? 0.04 : -0.04), 0.33 + i * 0.045, 0.165);
  headAt(b, 0, 0.60, 0.02, 0, 0.70, 0.04, body);
  b.parts.head = S(b.head, 0.14, b.headMat, 0, 0.70, 0.04);
  for (const s of [-1, 1]) {
    Bx(b.head, 0.03, 0.10, 0.02, 0.006, b.c(mark), s * 0.08, 0.64, 0.14);
    To(b.head, 0.05, 0.01, b.c(AMBER), s * 0.065, 0.72, 0.145);
  }
  const beak = Cn(b.head, 0.035, 0.10, b.c(AMBER), 0, 0.69, 0.16, 0, -0.32, 0.95);
  S(b.head, 0.02, b.c(mark), 0, 0.655, 0.255);
  b.parts.beak = beak;
  Eyes(b, 0.065, 0.72, 0.15, 0.045);
  b.parts.armL = Wing(b, -1, 0.16, 0.56, 0, 0.26, 0.16, bm);
  b.parts.armR = Wing(b, 1, 0.16, 0.56, 0, 0.26, 0.16, bm);
  for (const w of [b.parts.armL, b.parts.armR]) for (let i = 0; i < 3; i++) Bx(w, 0.02, 0.10, 0.03, 0.006, b.c(tail), 0, -0.46 - i * 0.015, -0.06 + i * 0.05);
  const tf = Bx(b.torso, 0.16, 0.02, 0.22, 0.006, b.c(tail), 0, 0.26, -0.18, [0.4, 0, 0]);
  for (let i = 0; i < 3; i++) Bx(tf, 0.16, 0.022, 0.02, 0.004, b.c(belly), 0, 0.0, -0.08 + i * 0.06);
  const am = b.c(AMBER);
  const foot = (g, py) => { Cy(g, 0.02, 0.02, py, am, 0, -py / 2, 0); Bx(g, 0.08, 0.03, 0.10, 0.01, am, 0, -py + 0.015, 0.02); };
  b.parts.legL = BLeg(b, -1, 0.06, 0.12, 0.02, 0, 0, bm, foot);
  b.parts.legR = BLeg(b, 1, 0.06, 0.12, 0.02, 0, 0, bm, foot);
  Bandana(b, b.torso, 0.11, 0, 0.58, 0.04, 0, 1, 0.2);
  finishHead(b, 0, 0.66, 0.25);
  Object.assign(b.spec, { build: 'bird', height: 0.84, seatY: 0.23, portraitScale: 1, bodyCy: 0.42, bodyBottom: 0.20, restArmZ: 0.12, sitHead: 0.2 });
};

RECIPES.otter = function (b) {
  const body = '#6B4A33', tan = '#C9A77E';
  const m = b.c(body), tm = b.c(tan), dm = b.c(DARK);
  b.parts.body = Cp(b.torso, 0.17, 0.22, m, 0, 0.42, 0);
  S(b.torso, 1, tm, 0, 0.42, 0.10, 0.12, 0.22, 0.08);
  headAt(b, 0, 0.60, 0.03, 0, 0.70, 0.03, body);
  b.parts.head = S(b.head, 0.16, b.headMat, 0, 0.70, 0.03, 1.1, 0.9, 1);
  S(b.head, 0.09, tm, 0, 0.66, 0.16, 1.3, 0.7, 0.9);
  S(b.head, 0.035, dm, 0, 0.69, 0.24);
  for (const s of [-1, 1]) {
    Cy(b.head, 0.004, 0.004, 0.12, dm, s * 0.08, 0.66, 0.22, [0, 0, s * 1.3]);
    Cy(b.head, 0.004, 0.004, 0.12, dm, s * 0.08, 0.64, 0.22, [0, 0, s * 1.5]);
    const e = EarPivot(b, b.head, s * 0.14, 0.78, 0.0, 0, 0);
    S(e, 0.035, b.headMat, 0, 0.02, 0); S(e, 0.02, tm, 0, 0.02, 0.02);
  }
  Mouth(b, b.head, 0.06, 0.015, 0.02, dm, 0, 0.63, 0.23);
  Eyes(b, 0.07, 0.74, 0.15, 0.05);
  b.parts.armL = BArm(b, -1, 0.17, 0.56, 0.04, 0.045, 0.14, m, dm, { handZ: 0.02 });
  b.parts.armR = BArm(b, 1, 0.17, 0.56, 0.04, 0.045, 0.14, m, dm, { handZ: 0.02 });
  const foot = (g, py) => Bx(g, 0.11, 0.03, 0.14, 0.015, dm, 0, -py + 0.015, 0.04);
  b.parts.legL = BLeg(b, -1, 0.09, 0.18, 0, 0.055, 0.06, m, foot);
  b.parts.legR = BLeg(b, 1, 0.09, 0.18, 0, 0.055, 0.06, m, foot);
  const t = TailPivot(b, b.torso, 0, 0.18, -0.14);
  Seg(t, 0, 0, 0, 0, 0.11, -0.32, 0.055, m).scale.set(1, 1, 0.8);
  Scarf(b, b.torso, 0.13, 0, 0.60, 0.03, 0, 1, 0);
  finishHead(b, 0, 0.64, 0.25);
  Object.assign(b.spec, { build: 'biped', height: 0.84, seatY: 0.17, portraitScale: 1, bodyCy: 0.42, bodyBottom: 0.14, restArmZ: 0.3, swimmer: true, swimPitch: 0.5, tailWag: true });
};

RECIPES.seal = function (b) {
  const body = '#8E9AA8', light = '#D6DDE4', speck = '#6F7B89';
  b.pivot(0, 0.22, -0.30);
  const m = b.c(body), lm = b.c(light);
  b.parts.body = Cp(b.torso, 0.20, 0.40, m, 0, 0.28, -0.05, [Math.PI / 2 - 0.35, 0, 0]);
  Cp(b.torso, 0.17, 0.36, lm, 0, 0.22, -0.03, [Math.PI / 2 - 0.35, 0, 0]);
  const r = b.rng;
  for (let i = 0; i < 6; i++) S(b.torso, 0.035, b.c(speck), (r() - 0.5) * 0.24, 0.42 + (r() - 0.5) * 0.08, -0.30 + r() * 0.5, 1, 1, 0.3);
  headAt(b, 0, 0.46, 0.26, 0, 0.58, 0.36, body);
  b.parts.head = S(b.head, 0.17, b.headMat, 0, 0.58, 0.36);
  S(b.head, 0.08, lm, 0, 0.53, 0.50, 1.2, 0.7, 0.9);
  S(b.head, 0.035, b.c(DARK), 0, 0.57, 0.57);
  for (const s of [-1, 1]) {
    Cy(b.head, 0.004, 0.004, 0.12, b.c(DARK), s * 0.07, 0.53, 0.52, [0, 0, s * 1.3]);
    Cy(b.head, 0.004, 0.004, 0.12, b.c(DARK), s * 0.07, 0.51, 0.52, [0, 0, s * 1.5]);
  }
  Mouth(b, b.head, 0.06, 0.015, 0.02, b.c(DARK), 0, 0.50, 0.56);
  Eyes(b, 0.07, 0.63, 0.49, 0.065, 0.65);
  // Front flippers hang from shoulder pivots; hind flippers lie flat at the tail.
  const flipper = (sign, px, py, pz) => {
    const g = LG(b.torso, sign * px, py, pz);
    g.userData.x0 = sign * px; g.userData.rz0 = 0;
    Bx(g, 0.08, 0.03, 0.22, 0.015, m, 0, -0.02, -0.08, [0.3, 0, -sign * 0.6]);
    g.userData.hand = Pt(g, sign * 0.10, -0.08, -0.18);
    return g;
  };
  b.parts.armL = flipper(-1, 0.17, 0.22, 0.18);
  b.parts.armR = flipper(1, 0.17, 0.22, 0.18);
  const hind = (sign) => {
    const g = LG(b.rig, sign * 0.06, 0.08, -0.46);
    g.userData.x0 = sign * 0.06; g.userData.rz0 = 0;
    Bx(g, 0.10, 0.03, 0.22, 0.012, m, sign * 0.03, -0.06, -0.10, [0, sign * 0.4, 0]);
    return g;
  };
  b.parts.legL = hind(-1); b.parts.legR = hind(1);
  Collar(b, b.torso, 0.16, 0, 0.44, 0.26, 0, 0.6, 0.8);
  finishHead(b, 0, 0.51, 0.57);
  Object.assign(b.spec, { build: 'quadruped', height: 0.75, seatY: 0.03, portraitScale: 1, hipY: 0.22, legX: 0.06, bodyCy: 0.28, bodyBottom: 0.06,
    hump: true, swimmer: true, swimPitch: 0.1, sitTorso: -0.5, sitHead: -0.1, noFold: true, golfPitch: 0.8 });
};

RECIPES.tortoise = function (b) {
  const shell = '#5E7A3C', plate = '#7F9A4E', rim = '#A8933E', plastron = '#D6C27A', skin = '#8A9B5E';
  b.pivot(0, 0.26, -0.22);
  const sm = b.c(skin);
  // Shell dome: a half sphere standing on the plastron (a full sphere scaled 0.7 would reach below the feet).
  const shellDome = new THREE.Mesh(cachedGeo('dome:0.4', () => new THREE.SphereGeometry(0.40, 24, 12, 0, TAU, 0, Math.PI / 2)), b.c(shell));
  shellDome.scale.set(1, 0.70, 1.05);
  b.parts.body = put(b.torso, shellDome, 0, 0.24, -0.02);
  S(b.torso, 0.10, b.c(plate), 0, 0.52, -0.02, 1, 0.35, 1);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    S(b.torso, 0.09, b.c(plate), Math.cos(a) * 0.22, 0.44, -0.02 + Math.sin(a) * 0.23, 1, 0.4, 1);
  }
  To(b.torso, 0.40, 0.045, b.c(rim), 0, 0.24, -0.02, [Math.PI / 2, 0, 0], [1, 1.05, 1]);
  Cy(b.torso, 0.38, 0.38, 0.12, b.c(plastron), 0, 0.14, -0.02).scale.set(1, 1, 1.05);
  // Splay 0.3 keeps the feet inside the shell rim so the tortoise stays within the width budget.
  qLegs(b, { legX: 0.22, hipY: 0.26, frontZ: 0.26, hindZ: -0.22, legR: 0.07, splay: 0.3 }, sm);
  headAt(b, 0, 0.34, 0.36, 0, 0.62, 0.50, skin);
  Seg(b.head, 0, 0.34, 0.36, 0, 0.58, 0.48, 0.07, b.headMat);
  b.parts.head = S(b.head, 0.13, b.headMat, 0, 0.62, 0.50);
  S(b.head, 0.05, b.c(rim), 0, 0.57, 0.62, 1.2, 0.6, 1);
  Eyes(b, 0.06, 0.65, 0.60, 0.045);
  const t = TailPivot(b, b.torso, 0, 0.12, -0.40);
  Cn(t, 0.03, 0.10, sm, 0, 0, 0, 0, 0, -1);
  Bandana(b, b.head, 0.08, 0, 0.42, 0.42, 0, 0.64, 0.77);
  finishHead(b, 0, 0.56, 0.64);
  Object.assign(b.spec, { build: 'quadruped', height: 0.75, seatY: 0.05, portraitScale: 1, hipY: 0.26, legX: 0.22, bodyCy: 0.24, bodyBottom: 0.08,
    slow: true, sitHead: 0.2, sitTorso: -0.15, sitFold: -0.9, golfPitch: 0.63 });
};

RECIPES.crocodile = function (b) {
  const body = '#4E8A4A', belly = '#C9D59A', ridge = '#2F5F31';
  b.pivot(0, 0.30, -0.24);
  const m = b.c(body), bm = b.c(belly), rm = b.c(ridge);
  b.parts.body = Cp(b.torso, 0.16, 0.50, m, 0, 0.34, -0.10, [Math.PI / 2, 0, 0]);
  Cp(b.torso, 0.14, 0.50, bm, 0, 0.30, -0.10, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) Cn(b.torso, 0.035, 0.07, rm, s * 0.06, 0.48, -0.34 + i * 0.08, 0, 1, 0);
  const t = TailPivot(b, b.torso, 0, 0.30, -0.38);
  Seg(t, 0, 0, 0, 0, -0.02, -0.18, 0.12, m);
  Seg(t, 0, -0.02, -0.18, 0, -0.05, -0.34, 0.08, m);
  Seg(t, 0, -0.05, -0.34, 0, -0.08, -0.46, 0.04, m);
  for (let i = 0; i < 4; i++) Cn(t, 0.03, 0.06, rm, 0, 0.10 - i * 0.045, -0.06 - i * 0.10, 0, 1, 0);
  qLegs(b, { legX: 0.20, hipY: 0.30, frontZ: 0.24, hindZ: -0.24, legR: 0.07, splay: 0.35 }, m);
  headAt(b, 0, 0.42, 0.14, 0, 0.52, 0.22, body);
  b.parts.head = S(b.head, 0.15, b.headMat, 0, 0.52, 0.22);
  Bx(b.head, 0.24, 0.12, 0.40, 0.05, m, 0, 0.44, 0.44);
  const jaw = LG(b.head, 0, 0.34, 0.24);
  Bx(jaw, 0.24, 0.07, 0.40, 0.03, bm, 0, 0, 0.20);
  b.parts.jaw = jaw;
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) Cn(b.head, 0.02, 0.05, b.c(TOOTH), s * 0.11, 0.39, 0.30 + i * 0.06, 0, -1, 0);
  for (const s of [-1, 1]) {
    S(b.head, 0.07, m, s * 0.10, 0.66, 0.24);
    S(b.head, 0.025, b.c(DARK), s * 0.05, 0.52, 0.64);
  }
  Eyes(b, 0.10, 0.70, 0.28, 0.05);
  Collar(b, b.torso, 0.17, 0, 0.42, 0.14, 0, 0.5, 0.86);
  finishHead(b, 0, 0.38, 0.64);
  Object.assign(b.spec, { build: 'quadruped', height: 0.75, seatY: 0.07, portraitScale: 1, hipY: 0.30, legX: 0.20, bodyCy: 0.34, bodyBottom: 0.18,
    swimmer: true, swimPitch: 0.05, sitTorso: -0.5, sitHead: -0.1, jaw: true, golfPitch: 0.63 });
};

RECIPES.kangaroo = function (b) {
  const body = '#B8865A', light = '#E7CBA5', lip = '#A3734A';
  const m = b.c(body), lm = b.c(light);
  b.parts.body = S(b.torso, 1, m, 0, 0.62, -0.02, 0.22, 0.30, 0.20);
  S(b.torso, 0.16, lm, 0, 0.50, 0.12, 1, 0.9, 0.5);
  To(b.torso, 0.14, 0.02, b.c(lip), 0, 0.60, 0.20, [0.9, 0, 0]);
  S(b.torso, 0.07, m, 0, 0.60, 0.18);
  for (const s of [-1, 1]) {
    S(b.torso, 0.022, eyeWhiteMaterial(), s * 0.03, 0.62, 0.235);
    S(b.torso, 0.012, pupilMaterial(), s * 0.03, 0.62, 0.252);
  }
  headAt(b, 0, 0.90, 0.04, 0, 1.04, 0.06, body);
  b.parts.head = S(b.head, 0.16, b.headMat, 0, 1.04, 0.06, 1, 0.95, 1.2);
  S(b.head, 0.08, lm, 0, 0.98, 0.20, 1, 0.75, 1);
  S(b.head, 0.03, b.c(DARK), 0, 1.02, 0.27);
  Mouth(b, b.head, 0.05, 0.015, 0.02, b.c(DARK), 0, 0.95, 0.26);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.11, 1.14, 0.0, -0.1, s * 0.35);
    S(e, 1, b.headMat, 0, 0.12, 0, 0.05, 0.16, 0.08); S(e, 1, b.c(PINK), 0, 0.12, 0.03, 0.03, 0.12, 0.05);
  }
  Eyes(b, 0.07, 1.08, 0.20, 0.05);
  b.parts.armL = BArm(b, -1, 0.20, 0.80, 0.06, 0.04, 0.14, m);
  b.parts.armR = BArm(b, 1, 0.20, 0.80, 0.06, 0.04, 0.14, m);
  const foot = (g, py) => {
    S(g, 0.12, m, 0, -0.06, 0, 0.8, 1.2, 1);
    Cp(g, 0.05, 0.10, m, 0, -0.22, 0.04);
    Bx(g, 0.10, 0.05, 0.36, 0.02, m, 0, -py + 0.025, 0.12);
  };
  b.parts.legL = BLeg(b, -1, 0.17, 0.34, -0.02, 0, 0, m, foot);
  b.parts.legR = BLeg(b, 1, 0.17, 0.34, -0.02, 0, 0, m, foot);
  const t = TailPivot(b, b.torso, 0, 0.34, -0.20);
  Seg(t, 0, 0, 0, 0, -0.06, -0.28, 0.08, m);
  Seg(t, 0, -0.06, -0.28, 0, -0.29, -0.46, 0.05, m);
  Collar(b, b.torso, 0.13, 0, 0.90, 0.04, 0, 1, 0);
  finishHead(b, 0, 0.96, 0.28);
  Object.assign(b.spec, { build: 'biped', height: 1.38, seatY: 0.35, portraitScale: 0.7, bodyCy: 0.62, bodyBottom: 0.32, restArmX: -0.9, restArmZ: 0.15,
    hopper: true, hopH: 0.18, hopLeg: 0.7, kangaroo: true });
};

RECIPES.rabbit = function (b) {
  const body = '#D9D4CC', white = '#F3F1EC';
  const m = b.c(body), wm = b.c(white);
  b.parts.body = S(b.torso, 1, m, 0, 0.38, 0, 0.20, 0.24, 0.20);
  S(b.torso, 0.13, wm, 0, 0.36, 0.12, 1, 1.1, 0.3);
  headAt(b, 0, 0.56, 0.04, 0, 0.68, 0.04, body);
  b.parts.head = S(b.head, 0.17, b.headMat, 0, 0.68, 0.04);
  for (const s of [-1, 1]) {
    S(b.head, 0.07, wm, s * 0.09, 0.62, 0.16);
    Bx(b.head, 0.025, 0.05, 0.015, 0.005, b.c(TOOTH), s * 0.015, 0.59, 0.20);
    Cy(b.head, 0.004, 0.004, 0.12, b.c(DARK), s * 0.09, 0.63, 0.19, [0, 0, s * 1.3]);
    Cy(b.head, 0.004, 0.004, 0.12, b.c(DARK), s * 0.09, 0.61, 0.19, [0, 0, s * 1.5]);
    const e = EarPivot(b, b.head, s * 0.08, 0.84, 0.0, -0.1, s * 0.12);
    Cp(e, 0.04, 0.18, m, 0, 0.13, 0); Cp(e, 0.022, 0.14, b.c(PINK), 0, 0.13, 0.02);
  }
  S(b.head, 0.025, b.c('#E8A0A8'), 0, 0.66, 0.21);
  Mouth(b, b.head, 0.04, 0.012, 0.02, b.c(DARK), 0, 0.615, 0.21);
  Eyes(b, 0.075, 0.72, 0.17, 0.055);
  b.parts.armL = BArm(b, -1, 0.18, 0.50, 0.04, 0.04, 0.12, m);
  b.parts.armR = BArm(b, 1, 0.18, 0.50, 0.04, 0.04, 0.12, m);
  const foot = (g, py) => { S(g, 0.09, m, 0, -0.06, 0, 0.9, 1, 1.1); Bx(g, 0.09, 0.05, 0.22, 0.02, m, 0, -py + 0.025, 0.06); };
  b.parts.legL = BLeg(b, -1, 0.12, 0.20, 0, 0, 0, m, foot);
  b.parts.legR = BLeg(b, 1, 0.12, 0.20, 0, 0, 0, m, foot);
  const t = TailPivot(b, b.torso, 0, 0.28, -0.16);
  S(t, 0.07, wm, 0, 0, -0.04);
  Bandana(b, b.torso, 0.13, 0, 0.56, 0.10, 0, 1, 0.2);
  finishHead(b, 0, 0.61, 0.22);
  Object.assign(b.spec, { build: 'biped', height: 1.05, seatY: 0.17, portraitScale: 0.9, bodyCy: 0.38, bodyBottom: 0.14, restArmX: -0.6, restArmZ: 0.1, rabbit: true });
};

RECIPES.frog = function (b) {
  const body = '#5FAE4F', light = '#D9EBB0', spot = '#3F8F3A', line = '#2F5F31';
  const m = b.c(body), lm = b.c(light);
  b.parts.body = S(b.torso, 1, m, 0, 0.30, 0, 0.26, 0.22, 0.24);
  S(b.torso, 1, lm, 0, 0.26, 0.14, 0.18, 0.16, 0.08);
  const r = b.rng;
  for (let i = 0; i < 5; i++) {
    const psi = Math.PI * 0.6 + r() * Math.PI * 0.8, y = 0.30 + r() * 0.16;
    S(b.torso, 0.04, b.c(spot), Math.sin(psi) * 0.24, y, Math.cos(psi) * 0.22, 1, 1, 0.3).lookAt(0, 0.30, 0);
  }
  headAt(b, 0, 0.42, 0.04, 0, 0.52, 0.04, body);
  b.parts.head = S(b.head, 0.22, b.headMat, 0, 0.52, 0.04, 1.1, 0.75, 1);
  Eyes(b, 0.13, 0.66, 0.10, 0.09, 0.55);
  Mouth(b, b.head, 0.26, 0.02, 0.03, b.c(line), 0, 0.46, 0.24);
  const throat = S(b.head, 0.10, lm, 0, 0.40, 0.20, 1.4, 0.6, 0.8);
  b.parts.throat = scaleBase(throat);
  b.parts.armL = BArm(b, -1, 0.24, 0.36, 0.08, 0.04, 0.16, m, null, { toes: true });
  b.parts.armR = BArm(b, 1, 0.24, 0.36, 0.08, 0.04, 0.16, m, null, { toes: true });
  const foot = (g, py) => { S(g, 0.10, m, 0, -0.04, 0, 1, 0.8, 1.2); Bx(g, 0.10, 0.03, 0.22, 0.012, m, 0, -py + 0.015, 0.12); };
  b.parts.legL = BLeg(b, -1, 0.20, 0.16, -0.06, 0, 0, m, foot);
  b.parts.legR = BLeg(b, 1, 0.20, 0.16, -0.06, 0, 0, m, foot);
  Bandana(b, b.torso, 0.19, 0, 0.44, 0.08, 0, 1, 0.3);
  finishHead(b, 0, 0.46, 0.26);
  Object.assign(b.spec, { build: 'biped', height: 0.77, seatY: 0.11, portraitScale: 1, bodyCy: 0.30, bodyBottom: 0.08, restArmX: -0.5, restArmZ: 0.4,
    hopper: true, hopH: 0.10, hopLeg: 0.8, throat: true });
};

RECIPES.deer = function (b) {
  const body = '#B5804E', light = '#F2E3CF', hoof = '#3A2A24', antler = '#E8D8B8';
  qBody(b, { hex: body, sx: 0.20, sy: 0.20, sz: 0.34, cy: 0.60, bz: -0.02, hipY: 0.52, legR: 0.045, legX: 0.11, frontZ: 0.20, hindZ: -0.24, hoof,
    belly: [0.12, light, 0.48, 0.06, 1, 0.8, 0.6] });
  const r = b.rng;
  for (let i = 0; i < 6; i++) {
    const psi = Math.PI * 0.6 + r() * Math.PI * 0.8, z = -0.02 + (r() - 0.5) * 0.4;
    const f = Math.sqrt(Math.max(0.2, 1 - (z + 0.02) * (z + 0.02) / (0.34 * 0.34)));
    S(b.torso, 0.03, b.c(light), Math.sin(psi) * 0.20 * f, 0.60 + Math.cos(psi) * 0.20 * f, z, 1, 1, 0.3).lookAt(0, 0.60, z);
  }
  headAt(b, 0, 0.74, 0.22, 0, 1.02, 0.40, body);
  Seg(b.head, 0, 0.74, 0.22, 0, 0.98, 0.38, 0.08, b.headMat);
  b.parts.head = S(b.head, 0.14, b.headMat, 0, 1.02, 0.40, 1, 0.9, 1.25);
  S(b.head, 0.07, b.c(light), 0, 0.96, 0.56);
  S(b.head, 0.03, b.c(DARK), 0, 0.98, 0.62);
  const am = b.c(antler);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.11, 1.10, 0.34, 0, s * 0.6);
    S(e, 1, b.headMat, 0, 0.06, 0, 0.05, 0.12, 0.08); S(e, 1, b.c(PINK), 0, 0.06, 0.02, 0.03, 0.09, 0.05);
    Cn(b.head, 0.02, 0.26, am, s * 0.07, 1.14, 0.34, s * 0.39, 0.90, -0.2);
    Cn(b.head, 0.015, 0.12, am, s * 0.11, 1.23, 0.32, s * 0.64, 0.75, -0.15);
    Cn(b.head, 0.015, 0.12, am, s * 0.15, 1.32, 0.30, s * 0.64, 0.75, -0.15);
  }
  Eyes(b, 0.08, 1.04, 0.52, 0.05);
  const t = TailPivot(b, b.torso, 0, 0.68, -0.34);
  S(t, 0.05, b.c(body), 0, -0.02, -0.02, 0.8, 1.4, 0.6);
  S(t, 0.045, b.c(light), 0, -0.03, -0.03, 0.7, 1.3, 0.4);
  Collar(b, b.head, 0.10, 0, 0.88, 0.30, 0, 0.84, 0.54);
  finishHead(b, 0, 0.94, 0.62);
  Object.assign(b.spec, { height: 1.38, seatY: 0.12, portraitScale: 0.7, sitHead: 0.9 });
};

RECIPES.koala = function (b) {
  const body = '#8E9AA3', light = '#E6E8E9';
  const m = b.c(body), lm = b.c(light);
  b.parts.body = S(b.torso, 1, m, 0, 0.36, 0, 0.24, 0.26, 0.22);
  S(b.torso, 0.15, lm, 0, 0.34, 0.14, 1, 1.1, 0.3);
  headAt(b, 0, 0.54, 0.04, 0, 0.66, 0.04, body);
  b.parts.head = S(b.head, 0.20, b.headMat, 0, 0.66, 0.04, 1.15, 0.9, 1);
  for (const s of [-1, 1]) {
    const e = EarPivot(b, b.head, s * 0.18, 0.72, -0.02, 0, s * 0.1);
    S(e, 0.10, m, s * 0.04, 0.02, 0, 1, 1, 0.6); S(e, 0.06, lm, s * 0.04, 0.02, 0.03);
    for (let i = 0; i < 3; i++) S(e, 0.03, lm, s * (0.08 + i * 0.03), 0.10 - i * 0.05, 0.0);
  }
  Bx(b.head, 0.08, 0.12, 0.06, 0.03, b.c('#2A2F36'), 0, 0.64, 0.22);
  Mouth(b, b.head, 0.05, 0.015, 0.02, b.c('#2A2F36'), 0, 0.56, 0.22);
  Eyes(b, 0.09, 0.70, 0.19, 0.05);
  b.parts.armL = BArm(b, -1, 0.22, 0.48, 0.04, 0.05, 0.14, m, null, { claws: 2 });
  b.parts.armR = BArm(b, 1, 0.22, 0.48, 0.04, 0.05, 0.14, m, null, { claws: 2 });
  const foot = (g, py) => S(g, 0.07, m, 0, -py + 0.04, 0.03, 1, 0.55, 1.3);
  b.parts.legL = BLeg(b, -1, 0.11, 0.14, 0, 0.06, 0.04, m, foot);
  b.parts.legR = BLeg(b, 1, 0.11, 0.14, 0, 0.06, 0.04, m, foot);
  Bandana(b, b.torso, 0.17, 0, 0.52, 0.08, 0, 1, 0.3);
  finishHead(b, 0, 0.57, 0.24);
  Object.assign(b.spec, { build: 'biped', height: 0.86, seatY: 0.13, portraitScale: 1, bodyCy: 0.36, bodyBottom: 0.10, restArmZ: 0.35 });
};

/* ------------------------------------------------------------------ */
/* Pose channels (per handle Float32Arrays blended over 0.3 s). */

const CH_TORSO_Y = 0, CH_LEAN = 1, CH_SWAY_Z = 2, CH_SCALE_Y = 3, CH_SCALE_XZ = 4, CH_RIG_Y = 5, CH_PITCH = 6,
  CH_ARM_LX = 7, CH_ARM_RX = 8, CH_ARM_LZ = 9, CH_ARM_RZ = 10, CH_ARM_LY = 11, CH_ARM_RY = 12,
  CH_LEG_LX = 13, CH_LEG_RX = 14, CH_LEG_LZ = 15, CH_LEG_RZ = 16, CH_LEG_XOFF = 17,
  CH_HEAD_X = 18, CH_HEAD_Z = 19, CH_HEAD_Y = 20,
  CH_EYE_SCALE = 21, CH_EYE_PITCH = 22, CH_PUPIL_Y = 23, CH_PUPIL_X = 24,
  CH_MOUTH_SX = 25, CH_MOUTH_SY = 26,
  CH_TAIL_X = 27, CH_TAIL_Y = 28, CH_TAIL_Z = 29,
  CH_EAR_X = 30, CH_EAR_LZ = 31, CH_EAR_RZ = 32,
  CH_JAW = 33, CH_THROAT = 34, CH_TRUNK_X = 35, CH_SCARF_Z = 36,
  CH_TORSO_YAW = 37,   // v5: torso twist about y (golf)
  CH_ARM_LS = 38, CH_ARM_RS = 39;   // v9: arm length factor (ride reach), 1 at rest
const CH_COUNT = 40;
const BLEND_SECONDS = 0.3;
let nextUid = 1;

const SWIM_CENTER_Y = -0.12;
const DIVE_PITCH = 1.5;

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

/* Sit reach: the armR rotation that brings handR to the mouth point in the seated base pose,
   solved once per species by a coarse then fine grid search on the first built handle. */
const reachCache = new Map();
function solveSitReach(handle) {
  const s = handle.spec, P = handle.parts;
  if (reachCache.has(s.id)) return reachCache.get(s.id);
  const torso = handle.torso, head = handle.headGroup, arm = P.armR, hand = P.handR, mp = P.mouthPoint;
  const q = s.build === 'quadruped';
  torso.rotation.x = q ? (s.sitTorso !== undefined ? s.sitTorso : -0.35) : -0.04;
  head.rotation.x = s.sitHead !== undefined ? s.sitHead : (q ? 0.3 : 0);
  handle.group.updateMatrixWorld(true);
  mp.getWorldPosition(_v2);
  let best = { rx: -1.5, rz: 0, d: Infinity };
  const probe = (rx, rz) => {
    arm.rotation.x = rx; arm.rotation.z = rz;
    arm.updateMatrixWorld(true);
    hand.getWorldPosition(_v);
    const d = _v.distanceTo(_v2);
    if (d < best.d) best = { rx, rz, d };
  };
  for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) probe(-3.1 + i * 0.1, -1.6 + j * 0.1067);
  const c = best;
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) probe(c.rx + i * 0.016, c.rz + j * 0.016);
  arm.rotation.x = s.restArmX || 0; arm.rotation.z = s.restArmZ || 0;
  torso.rotation.x = 0; head.rotation.x = 0;
  handle.group.updateMatrixWorld(true);
  reachCache.set(s.id, best);
  return best;
}

/* ------------------------------------------------------------------ */

export function makeAnimalMesh(seed, colorHex, speciesId) {
  const hex = normalizeHex(colorHex);
  let species = typeof speciesId === 'string' && RECIPES[speciesId] ? speciesId : null;
  if (!species) species = SPECIES[ttHash(seed) % SPECIES.length];
  const rng = seededRng(seed);
  const idleYaw = (rng() - 0.5) * 0.6;

  const group = new THREE.Group();
  group.name = 'animal';
  const rig = new THREE.Group();
  rig.name = 'rig';
  rig.rotation.order = 'YXZ';
  rig.userData.origin = new THREE.Vector3(0, 0, 0);
  group.add(rig);
  const torso = G(rig, 0, 0, 0);
  torso.name = 'torso';

  const parts = {
    body: null, head: null, eyes: [], pupils: [], lids: [], highlights: [], eyeGroups: [], antennae: [],
    armL: null, armR: null, legL: null, legR: null, handL: null, handR: null, ring: null, seatY: 0,
    mouth: null, mouthPoint: null, tail: null, ears: [], jaw: null, throat: null, trunk: null, scarfTail: null, beak: null,
  };
  const spec = { id: species, build: 'biped', restArmX: 0, restArmZ: 0 };
  const b = {
    torso, rig, head: null, eyePivot: null, headC: null, headMat: null, parts, spec, rng,
    accent: bodyMaterial(hex),
    c: bodyMaterial,
    pivot(x, y, z) { torso.userData.origin.set(x, y, z); torso.position.set(x, y, z); spec.P = [x, y, z]; },
  };
  RECIPES[species](b);
  if (!spec.P) spec.P = [0, 0, 0];
  if (!parts.handL && parts.armL) parts.handL = parts.armL.userData.hand;
  if (!parts.handR && parts.armR) parts.handR = parts.armR.userData.hand;
  parts.handL.name = 'handL'; parts.handR.name = 'handR';
  parts.armL.name = 'armL'; parts.armR.name = 'armR'; parts.legL.name = 'legL'; parts.legR.name = 'legR';
  parts.seatY = spec.seatY;
  for (const a of [parts.armL, parts.armR]) { a.userData.y0 = a.position.y; a.rotation.x = spec.restArmX || 0; }
  parts.armL.rotation.z = -(spec.restArmZ || 0); parts.armR.rotation.z = spec.restArmZ || 0;

  /* Selection ring: flat on the ground, invisible until the renderer shows it. */
  const ring = new THREE.Mesh(ringGeo(), new THREE.MeshBasicMaterial({ color: 0x75CCD0, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  ring.visible = false;
  ring.castShadow = false; ring.receiveShadow = false;
  ring.name = 'ring';
  group.add(ring);
  parts.ring = ring;

  const cur = new Float32Array(CH_COUNT);
  const from = new Float32Array(CH_COUNT);
  const target = new Float32Array(CH_COUNT);
  cur[CH_SCALE_Y] = 1; cur[CH_SCALE_XZ] = 1; cur[CH_EYE_SCALE] = 1; cur[CH_MOUTH_SX] = 1; cur[CH_MOUTH_SY] = 1;
  cur[CH_ARM_LX] = spec.restArmX || 0; cur[CH_ARM_RX] = spec.restArmX || 0;
  cur[CH_ARM_LZ] = -(spec.restArmZ || 0); cur[CH_ARM_RZ] = spec.restArmZ || 0;
  cur[CH_ARM_LS] = 1; cur[CH_ARM_RS] = 1;
  from.set(cur);

  const poseState = {
    pose: '', prevPose: '',
    target, cur, from, blendT: BLEND_SECONDS,
    yaw: idleYaw, lookYaw: 0, lastLookAt: null, lookStart: -10, lookSign: 1,
    twitch: 0, lastCycle: 0, hopMin: 0, landT: -10, tapL: 0, tapR: 0, sip: 0,
    earPhase: rng() * 5, earNext: 3 + rng() * 2, earT: -10,
    seatY: spec.seatY, bodyCy: spec.bodyCy, hipY: spec.hipY || 0.2,
    restArmX: spec.restArmX || 0, restArmZ: spec.restArmZ || 0,
    rideRoll: 0,         // eased roll of the rig while riding (follows handle.leanZ)
    // v10: the walk cycle in stride cycles, the last handle.distance seen, the eased swing boost,
    // the turn shuffle phase and direction, the fidget phase, and the hip-to-ground leg reach
    walkPhase: 0, lastDist: NaN, walkBoost: 1, turnPhase: 0, turnSign: 1,
    fidgetPhase: ((idleYaw + 0.3) / 0.6) * TAU,
    legReach: Math.max(0.06, Number.isFinite(parts.legL.position.y) ? parts.legL.position.y : (spec.hipY || 0.2)),
    // v11: the eased airborne crouch (0..1) for pose 'hover', the hat worn and its anchor on the head group (set below)
    air: 0, hatShown: null, hatX: 0, hatY: 0.5, hatZ: 0, hatR: 0.12,
  };
  parts.hats = null;   // v11: { cap, beanie, crown, cowboy, visor } groups once a hat was worn

  const handle = {
    kind: 'animal', species, seed,
    uid: nextUid++,
    color: new THREE.Color(hex),
    group, rig, torso, headGroup: b.head, eyePivot: b.eyePivot,
    traits: { species, build: spec.build, idleYaw },
    parts, spec,
    poseState, anim: poseState,
    hat: null,           // v11: the hat worn ('cap' | 'beanie' | 'crown' | 'cowboy' | 'visor' | null); the animator applies a change
    airborne: false,     // v11: the renderer writes true while the hoverboard is in the air (pose 'hover' crouches)
    swingPhase: 0, sipPhase: null,
    golfPhase: 0,        // the renderer writes 0..1 while the player swings (pose 'golf'); 0 is the address
    leanZ: 0,            // the renderer writes the scooter lean (rad) while riding (pose 'ride')
    distance: null,      // v10: the renderer writes world units traveled (monotonic); null falls back to time
    turnRate: 0,         // v10: the renderer writes the body yaw rate (rad/s, signed) for pose 'turn'
    portraitScale: spec.portraitScale || 1,
    height: spec.height,
    opacity: 1, ownMaterials: null, disposed: false,
  };
  ring.material.userData.ownedBy = handle.uid;
  spec.reach = solveSitReach(handle);
  // v11: where a hat sits on this head (build time, from the head's own bounds)
  { const ha = headAnchor(handle); poseState.hatX = ha.x; poseState.hatY = ha.y; poseState.hatZ = ha.z; poseState.hatR = ha.r; spec.hat = ha; }
  // Rest pose for the un-animated portrait: arms at their rest angles plus any quadruped splay.
  parts.armL.rotation.set(spec.restArmX || 0, 0, parts.armL.userData.rz0 - (spec.restArmZ || 0));
  parts.armR.rotation.set(spec.restArmX || 0, 0, parts.armR.userData.rz0 + (spec.restArmZ || 0));
  rig.rotation.y = idleYaw;
  group.userData.kind = 'animal';
  group.userData.handle = handle;
  return handle;
}

/* ------------------------------------------------------------------ */
/* Pose resolution and targets. */

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
function followsMoveDir(pose) {
  return pose === 'walk' || pose === 'sit' || pose === 'swim' || pose === 'dive' || pose === 'climb' || pose === 'push' || pose === 'ride' || pose === 'turn' || pose === 'hover' || pose === 'boat';
}

/* Quadruped seated base: haunches down around the hind hips, hind legs folded forward. */
function qSitBase(T, s, a, torsoRx, fold, drop) {
  T[CH_RIG_Y] = -drop * a.seatY;
  T[CH_LEAN] = torsoRx;
  const f = s.noFold ? 0 : (s.sitFold !== undefined ? s.sitFold : fold);
  T[CH_LEG_LX] = f; T[CH_LEG_RX] = f;
  // Front legs counter the rear so the paws stay plumb under the raised chest.
  T[CH_ARM_LX] = -torsoRx * 0.8; T[CH_ARM_RX] = -torsoRx * 0.8;
}
function typingBursts(T, a, agent, dt, q) {
  const animT = agent.animT || 0;
  const cycle = animT % 3.2;
  const burst = cycle >= 0.7;
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
  T[CH_PUPIL_X] = 0.014;
  if (a.lastCycle < 0.7 && cycle >= 0.7) a.twitch = 1;
  a.lastCycle = cycle;
  a.twitch *= Math.exp(-dt / 0.12);
  if (q) { T[CH_EAR_LZ] = 0.3 * a.twitch; T[CH_EAR_RZ] = -0.3 * a.twitch; }
}

/* ------------------------------------------------------------------ */
/* Golf (docs/GOLF_DESIGN.md "Swing and HUD"). Keyframes on handle.golfPhase at GOLF_KEYS:
   address, halfway back, top of the backswing, impact, follow-through, finish. The tables are
   the alien ones (js/aliens3d.js): arm x mirrored because these rigs lift a limb forward with a
   negative rotation.x, z kept (positive swings a hand toward the character's right, where the
   backswing goes), head pitch positive downward. Bipeds use them directly, birds scale the wing
   values, quadrupeds rear up and use their own front-leg x row (see golfTargets).
   CONTRACT: as in aliens3d.js the magnitudes follow the contract's wording rather than the
   design table: the address hangs the hands lower (x 0.6, not 0.9, hands together low in
   front) and the finish lifts the arms overhead instead of sideways (hands high and left). */

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
const GOLF_MOUTH_SX = [1, 0.9, 0.8, 0.85, 1.1, 1.3];
/* Quadruped front legs, for a torso pitched up 1.05 rad about the hind hips: +1.05 hangs a leg
   straight down in the world, negative values raise it over the shoulders. Other pitches shift
   the row by (pitch - 1.05). The ball look (0..1) adds head pitch on top of the rearing counter. */
const GOLF_Q_ARM_LX = [0.95, 0.75, -1.2, 0.85, -0.6, -1.35];
const GOLF_Q_ARM_RX = [0.95, 0.8, -1.1, 0.85, -0.45, -1.45];
const GOLF_Q_LOOK = [1, 0.85, 0.7, 1, 0.3, 0];
const GOLF_Q_PITCH = 1.05;
const GOLF_FEET = 0.03;   // extra hip offset per side (CH_LEG_XOFF is negative for apart)

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

/* Address stance and swing for the three builds. golfIdle is the address (phase 0) with
   breathing; golf reads handle.golfPhase. Hind legs stay planted in every build. */
function golfTargets(T, a, handle, pose, time) {
  const s = handle.spec;
  const Q = s.build === 'quadruped', BD = s.build === 'bird';
  let phase = pose === 'golf' ? handle.golfPhase : 0;
  if (!(phase >= 0)) phase = 0; else if (phase > 1) phase = 1;
  golfSegment(phase, _golfSeg);
  const i = _golfSeg[0], t = _golfSeg[1];
  const yaw = gk(GOLF_TORSO_YAW, i, t);
  const armLX = gk(GOLF_ARM_LX, i, t), armLZ = gk(GOLF_ARM_LZ, i, t);
  const armRX = gk(GOLF_ARM_RX, i, t), armRZ = gk(GOLF_ARM_RZ, i, t);
  const headYaw = gk(GOLF_HEAD_YAW, i, t), headPitch = gk(GOLF_HEAD_PITCH, i, t);
  const legL = gk(GOLF_LEG_LX, i, t), legR = gk(GOLF_LEG_RX, i, t);
  const after = Math.max(0, (phase - 0.62) / 0.38);                 // 0 through impact, 1 at the finish
  const top = Math.max(0, 1 - Math.abs(phase - 0.5) / 0.25);        // 1 at the top of the backswing
  const impact = Math.max(0, 1 - Math.abs(phase - 0.62) / 0.12);    // 1 at impact

  // Face: eyes on the ball through impact, a squint through the downswing, a grin at the finish.
  T[CH_MOUTH_SX] = gk(GOLF_MOUTH_SX, i, t);
  T[CH_EYE_PITCH] = 0.12 * (1 - after);
  T[CH_PUPIL_Y] = -0.02 * (1 - after);
  if (phase >= 0.5 && phase < 0.7) T[CH_EYE_SCALE] = 0.94;
  else if (phase >= 0.8) T[CH_EYE_SCALE] = 1.05;
  T[CH_SCARF_Z] = 0.3 * yaw;

  if (Q) {
    /* Reared onto the hind legs: the torso pitches up about the hind hips (its local z is the
       spine, so the swing twist goes on rotation z), the front legs hold the club, the head
       counters the pitch and looks down at the ball. Tortoise, crocodile and seal stand lower. */
    const pitch = s.golfPitch || GOLF_Q_PITCH;
    const shift = pitch - GOLF_Q_PITCH;
    T[CH_LEAN] = -pitch;
    T[CH_SWAY_Z] = yaw;
    T[CH_ARM_LX] = gk(GOLF_Q_ARM_LX, i, t) + shift; T[CH_ARM_RX] = gk(GOLF_Q_ARM_RX, i, t) + shift;
    T[CH_ARM_LZ] = 0.8 * armLZ; T[CH_ARM_RZ] = 0.8 * armRZ;
    const hs = s.golfHead || 1;   // the giraffe keeps half so the neck does not whip
    T[CH_HEAD_X] = hs * (0.75 * pitch + 0.35 * gk(GOLF_Q_LOOK, i, t));
    T[CH_HEAD_Y] = hs * headYaw;
    T[CH_TAIL_Y] = -0.6 * yaw;
    T[CH_EAR_X] = -0.2 * top;
    if (s.trunk) T[CH_TRUNK_X] = 0.2 * Math.sin(TAU * 1.0 * time);
    if (s.jaw) T[CH_JAW] = 0.25 * impact;
  } else if (BD) {
    /* Wings as arms: folded forward around the grip at address, sweeping wider than arms. */
    T[CH_TORSO_YAW] = yaw;
    T[CH_LEAN] = 0.8 * gk(GOLF_LEAN, i, t);
    const lift = 0.5 * after;   // the finish lifts the wings nearly vertical
    T[CH_ARM_LX] = -0.7 + 0.7 * (armLX + 0.6) - lift; T[CH_ARM_RX] = -0.7 + 0.7 * (armRX + 0.6) - lift;
    T[CH_ARM_LZ] = 0.6 + 1.2 * (armLZ - 0.5); T[CH_ARM_RZ] = -0.6 + 1.2 * (armRZ + 0.5);
    T[CH_HEAD_Y] = headYaw;
    // The beak tracks the ball: pitched 0.5 down at address, 0.2 at impact, level by the finish.
    T[CH_HEAD_X] = phase < 0.62 ? 0.5 - 0.3 * phase / 0.62 : 0.2 * (1 - after);
    T[CH_TAIL_X] = 0.3 * top;
    if (s.penguin || s.id === 'owl') T[CH_RIG_Y] = 0.08 * impact;   // a little hop at impact
    if (s.flamingo) {
      T[CH_LEG_RX] = 1.5;                 // one leg up through the whole swing
      T[CH_SWAY_Z] = 0.15 * after;        // and a sway at the finish
    } else {
      T[CH_LEG_LX] = 0.5 * legL; T[CH_LEG_RX] = 0.5 * legR;
      T[CH_LEG_XOFF] = -0.02;
    }
  } else {
    /* Bipeds: the alien table, plus a weight shift in the legs and a tail that counters the twist. */
    T[CH_TORSO_YAW] = yaw;
    T[CH_LEAN] = gk(GOLF_LEAN, i, t);
    T[CH_TORSO_Y] = gk(GOLF_BOB, i, t);
    T[CH_ARM_LX] = armLX; T[CH_ARM_LZ] = armLZ;
    T[CH_ARM_RX] = armRX; T[CH_ARM_RZ] = armRZ;
    T[CH_HEAD_Y] = headYaw;
    T[CH_HEAD_X] = headPitch;
    T[CH_LEG_LX] = legL; T[CH_LEG_RX] = legR;
    // A tilted planted foot dips a little below y 0; lift the rig by the larger dip, as the walk does.
    T[CH_RIG_Y] = 0.16 * (1 - Math.cos(Math.max(Math.abs(legL), Math.abs(legR))));
    T[CH_LEG_XOFF] = -GOLF_FEET;
    T[CH_TAIL_Y] = -0.5 * yaw;
    T[CH_EAR_X] = -0.2 * top;
  }
  if (pose === 'golfIdle') {
    const br = 0.5 + 0.5 * Math.sin(TAU * 0.6 * time);
    T[CH_SCALE_Y] = 1 + 0.02 * br;
    T[CH_SCALE_XZ] = 1 - 0.008 * br;
  }
}

/* `time` must be the simulation clock, TT.state.time, as for the aliens. */
export function animateAnimal(handle, agent, time, dt, poseOverride) {
  if (!handle || handle.disposed || !agent) return;
  if (!(time >= 0)) {
    const TT = typeof window !== 'undefined' ? window.TT : null;
    time = TT && TT.state && TT.state.time > 0 ? TT.state.time : 0;
  }
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.05) dt = 0.05;
  const a = handle.poseState, P = handle.parts, T = a.target, s = handle.spec;
  const Q = s.build === 'quadruped', BI = s.build === 'biped', BD = s.build === 'bird';
  // v11: a hat change written on the handle, and the airborne crouch eased over about 0.1 s
  if (handle.hat !== a.hatShown) setAnimalHat(handle, handle.hat);
  a.air += ((handle.airborne ? 1 : 0) - a.air) * (1 - Math.exp(-12 * dt));
  if (!handle.airborne && a.air < 1e-4) a.air = 0;

  const state = agent.state || 'idle';
  const working = state === 'working';
  const pose = resolvePose(agent, poseOverride);
  if (pose !== a.pose) {
    a.from.set(a.cur);
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
  for (let i = 0; i < CH_COUNT; i++) T[i] = 0;
  T[CH_SCALE_Y] = 1; T[CH_SCALE_XZ] = 1; T[CH_EYE_SCALE] = 1; T[CH_MOUTH_SX] = 1; T[CH_MOUTH_SY] = 1;
  T[CH_ARM_LX] = a.restArmX; T[CH_ARM_RX] = a.restArmX; T[CH_ARM_LZ] = -a.restArmZ; T[CH_ARM_RZ] = a.restArmZ;
  T[CH_ARM_LS] = 1; T[CH_ARM_RS] = 1;

  let lookTarget = 0;
  let sipTarget = 0;
  const br = 0.5 + 0.5 * Math.sin(TAU * 0.6 * time);

  if (pose === 'walk') {
    /* Walk cycle (v10): the phase comes from the distance traveled when the renderer writes
       handle.distance (stride = foot travel of this rig's leg swing), else from a cadence of about
       3.5 strides per second scaled by speed (2 for the slow species). */
    const commute = state === 'commute';
    const speed = commute ? 2.6 : (agent.speed > 0 ? agent.speed : 1.6);
    const maxHz = s.slow ? 2 : WALK_MAX_HZ;
    const reach = a.legReach;
    let amp0;
    if (Q) amp0 = s.hump ? 0.2 : (s.slow ? 0.35 : 0.6);
    else if (BI) amp0 = s.hopper ? 0 : (commute ? 0.65 : 0.55);
    else amp0 = s.penguin ? 0.35 : (s.flamingo ? 0.45 : 0.5);
    // a hop covers about three leg lengths; every other gait plants a foot per half cycle
    const rigStride = BI && s.hopper ? 3 * reach : 4 * reach * Math.sin(amp0);
    const boost = advanceWalk(a, handle, dt, 3.5 * speed / 1.6, rigStride, maxHz);
    const p = a.walkPhase;
    const ss = Math.sin(TAU * p), cc = Math.cos(TAU * p), sw = strideWave(p);
    const bob = cc * cc;                       // highest with the feet together, lowest at the double support
    const rock = Math.sin(TAU * 2 * p);        // one rock per step
    if (Q) {
      if (s.hump) {
        T[CH_TORSO_Y] = 0.05 * bob;
        T[CH_LEAN] = 0.08 * rock;
        T[CH_ARM_LZ] = -0.3 * ss; T[CH_ARM_RZ] = 0.3 * ss;
        T[CH_LEG_LX] = 0.2 * boost * sw; T[CH_LEG_RX] = -0.2 * boost * sw;
        T[CH_HEAD_X] = -0.1 * rock;
      } else {
        const amp = amp0 * boost;
        T[CH_ARM_LX] = amp * sw; T[CH_LEG_RX] = amp * sw;
        T[CH_ARM_RX] = -amp * sw; T[CH_LEG_LX] = -amp * sw;
        T[CH_TORSO_Y] = 0.03 * bob;
        T[CH_HEAD_X] = 0.12 * rock + (s.slow ? 0.12 * Math.abs(ss) : 0);
        T[CH_TAIL_Y] = 0.3 * ss;
        T[CH_LEAN] = 0.04 + 0.05 * (boost - 1);
        // CONTRACT: the design lifts the rig by hipY (1 - cos legAmp); a quadruped paw never dips below
        // the ground when the leg swings, so a quarter of that keeps the planted legs on the road.
        T[CH_RIG_Y] = 0.25 * a.hipY * (1 - Math.cos(amp));
        if (s.trunk) T[CH_TRUNK_X] = 0.12 * ss;
      }
    } else if (BI) {
      if (s.hopper) {
        const h = Math.abs(ss);
        T[CH_RIG_Y] = s.hopH * h;
        T[CH_LEG_LX] = s.hopLeg * h; T[CH_LEG_RX] = s.hopLeg * h;
        T[CH_TAIL_X] = -0.15 + 0.3 * ss;
        T[CH_LEAN] = 0.08;
        T[CH_EAR_X] = -0.3;
      } else {
        const legAmp = amp0 * boost;
        T[CH_TORSO_Y] = 0.035 * bob;
        T[CH_LEAN] = (commute ? 0.12 : 0.08) + 0.06 * (boost - 1);
        T[CH_LEG_LX] = legAmp * sw; T[CH_LEG_RX] = -legAmp * sw;
        T[CH_RIG_Y] = 0.16 * (1 - Math.cos(legAmp));
        T[CH_ARM_LX] = -0.45 * boost * ss; T[CH_ARM_RX] = 0.45 * boost * ss;
        T[CH_TAIL_Y] = 0.2 * ss;
      }
    } else {
      const legAmp = amp0 * boost;
      T[CH_LEG_LX] = legAmp * sw; T[CH_LEG_RX] = -legAmp * sw;
      T[CH_SWAY_Z] = (s.penguin ? 0.18 : 0.12) * ss;
      T[CH_ARM_LZ] = -a.restArmZ - 0.25 * bob; T[CH_ARM_RZ] = a.restArmZ + 0.25 * bob;
      T[CH_HEAD_X] = (s.flamingo ? 0.08 : 0.1) * Math.abs(ss);
      T[CH_RIG_Y] = 0.16 * (1 - Math.cos(legAmp));
      T[CH_TORSO_Y] = 0.02 * bob;
    }
    T[CH_SCARF_Z] = 0.10 * Math.sin(TAU * 0.8 * time);
  } else if (pose === 'turn') {
    /* Turning in place (v10): paced by the turn rate. Quadrupeds paddle the legs in diagonal pairs
       with the tail swung into the turn, bipeds shuffle with the arms a little out, birds step with
       the wings out; every build leads with the head. */
    const sign = advanceTurn(a, handle, agent, dt);
    const step = Math.sin(TAU * a.turnPhase);
    T[CH_HEAD_Y] = 0.35 * sign;
    T[CH_HEAD_Z] = -0.04 * sign;
    T[CH_TORSO_Y] = 0.01 * Math.abs(step);
    if (Q) {
      T[CH_ARM_LX] = 0.25 * step; T[CH_ARM_RX] = -0.25 * step;
      T[CH_LEG_LX] = -0.25 * step; T[CH_LEG_RX] = 0.25 * step;
      T[CH_RIG_Y] = 0.25 * a.hipY * (1 - Math.cos(0.25));
      T[CH_TAIL_Y] = 0.3 * sign;
      T[CH_EAR_X] = -0.1;
    } else if (BI) {
      T[CH_LEG_LX] = 0.22 * step; T[CH_LEG_RX] = -0.22 * step;
      T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.22));
      T[CH_SWAY_Z] = 0.05 * sign;
      T[CH_LEAN] = 0.04;
      T[CH_ARM_LX] = 0.15 * step; T[CH_ARM_RX] = -0.15 * step;
      T[CH_ARM_LZ] = -a.restArmZ - 0.3; T[CH_ARM_RZ] = a.restArmZ + 0.3;
      T[CH_TAIL_Y] = 0.2 * sign;
    } else {
      T[CH_LEG_LX] = 0.2 * step; T[CH_LEG_RX] = -0.2 * step;
      T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.2));
      T[CH_SWAY_Z] = 0.06 * step;
      T[CH_ARM_LZ] = -a.restArmZ - 0.3; T[CH_ARM_RZ] = a.restArmZ + 0.3;
    }
  } else if (pose === 'work' || pose === 'type') {
    if (Q) {
      qSitBase(T, s, a, -0.3, -1.2, 0.6);
      T[CH_ARM_LX] = -1.2; T[CH_ARM_RX] = -1.2;
      T[CH_HEAD_X] = 0.15; T[CH_EAR_X] = -0.2;
    } else if (BI) {
      T[CH_ARM_LX] = -1.15; T[CH_ARM_RX] = -1.15; T[CH_ARM_LZ] = -0.05; T[CH_ARM_RZ] = 0.05;
      T[CH_LEAN] = 0.10;
    } else {
      T[CH_ARM_LX] = -1.2; T[CH_ARM_RX] = -1.2; T[CH_ARM_LZ] = -0.2; T[CH_ARM_RZ] = 0.2;
      T[CH_HEAD_X] = 0.2; T[CH_LEAN] = 0.08;
    }
    typingBursts(T, a, agent, dt, Q);
    if (pose === 'type') T[CH_HEAD_X] += Q ? 0.25 : (BI ? 0.18 : 0.25);
  } else if (pose === 'hop') {
    const yoff = agent.yoff || 0;
    T[CH_RIG_Y] = Math.max(0, yoff * -0.06);
    const hf = Math.min(1, Math.max(0, -yoff / 3));
    T[CH_EYE_SCALE] = 1.15;
    T[CH_MOUTH_SX] = 1.25;
    if (Q) {
      T[CH_ARM_LX] = 0.5 * hf; T[CH_ARM_RX] = 0.5 * hf;
      T[CH_LEG_LX] = -0.6 * hf; T[CH_LEG_RX] = -0.6 * hf;
      T[CH_EAR_X] = -0.3 * hf; T[CH_TAIL_X] = -0.4 * hf;
    } else if (BI) {
      T[CH_ARM_LX] = -2.4 * hf; T[CH_ARM_RX] = -2.4 * hf;
      if (s.rabbit) T[CH_EAR_X] = -0.3;
    } else {
      T[CH_ARM_LZ] = -1.2 * hf; T[CH_ARM_RZ] = 1.2 * hf;
    }
    if (s.jaw) T[CH_JAW] = 0.35 * hf;
    if (yoff < a.hopMin) a.hopMin = yoff;
    if (yoff > -0.02 && a.hopMin < -0.6) { a.landT = time; a.hopMin = 0; }
    const lt = time - a.landT;
    if (lt >= 0 && lt < 0.15) {
      const q = 1 - lt / 0.15;
      T[CH_SCALE_Y] = 1 - 0.06 * q;
      T[CH_SCALE_XZ] = 1 + 0.04 * q;
    }
  } else if (pose === 'slump') {
    T[CH_SWAY_Z] = 0.03 * Math.sin(TAU * 0.5 * time);
    T[CH_PUPIL_Y] = -0.03; T[CH_PUPIL_X] = -0.01;
    T[CH_MOUTH_SX] = 0.7; T[CH_MOUTH_SY] = 1.6;
    if (Q) {
      T[CH_HEAD_X] = 0.45; T[CH_EAR_LZ] = 0.8; T[CH_EAR_RZ] = -0.8; T[CH_TAIL_X] = 0.9;
      T[CH_SCALE_Y] = 0.92; T[CH_LEAN] = 0.1;
    } else if (BI) {
      T[CH_SCALE_Y] = 0.90; T[CH_LEAN] = 0.25;
      T[CH_ARM_LX] = s.kangaroo ? 0 : -0.30; T[CH_ARM_RX] = s.kangaroo ? 0 : -0.30;
      T[CH_ARM_LZ] = -0.02; T[CH_ARM_RZ] = 0.02;
      if (s.rabbit) T[CH_EAR_X] = 0.9;
      T[CH_HEAD_X] = 0.15;
    } else {
      T[CH_ARM_LZ] = -0.5; T[CH_ARM_RZ] = 0.5; T[CH_ARM_LX] = 0.3; T[CH_ARM_RX] = 0.3;
      T[CH_HEAD_X] = 0.4;
    }
  } else if (pose === 'wave') {
    const wv = Math.sin(TAU * 2 * time);
    T[CH_HEAD_Z] = 0.16;
    T[CH_MOUTH_SX] = 1.35;
    T[CH_EYE_SCALE] = 1.06;
    T[CH_SCALE_Y] = 1 + 0.015 * br;
    if (Q) {
      qSitBase(T, s, a, -0.45, -1.3, 0.5);
      T[CH_ARM_RX] = -2.4; T[CH_ARM_RZ] = 0.5 + 0.45 * wv;
    } else if (BI) {
      T[CH_ARM_RX] = -2.75; T[CH_ARM_RZ] = 0.55 + 0.45 * wv; T[CH_ARM_LX] = -0.15;
    } else {
      T[CH_ARM_RZ] = -(2.3 + 0.4 * wv); T[CH_ARM_RX] = 0;
      if (s.penguin) T[CH_RIG_Y] = 0.02 * Math.abs(wv);
    }
    if (s.jaw) T[CH_JAW] = 0.35;
  } else if (pose === 'sit') {
    T[CH_SCALE_Y] = 1 + 0.025 * br;
    T[CH_SCALE_XZ] = 1 - 0.01 * br;
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
    const sipNow = a.sip;
    const reach = s.reach;
    if (Q) {
      qSitBase(T, s, a, s.sitTorso !== undefined ? s.sitTorso : -0.35, -1.5, 1);
      T[CH_ARM_LX] = -(s.sitTorso !== undefined ? s.sitTorso : -0.35) * 0.8;
      T[CH_HEAD_X] = (s.sitHead !== undefined ? s.sitHead : 0.3) + 0.12 * sipNow;
      T[CH_ARM_RX] = reach.rx - 0.15 * sipNow; T[CH_ARM_RZ] = reach.rz;
      if (s.trunk) T[CH_TRUNK_X] = -0.5 - 0.3 * sipNow;
    } else if (BI) {
      T[CH_RIG_Y] = -a.seatY;
      T[CH_LEG_LX] = -1.35; T[CH_LEG_RX] = -1.35;
      T[CH_LEAN] = -0.04;
      T[CH_ARM_LX] = -0.55; T[CH_ARM_LZ] = -0.06;
      T[CH_HEAD_X] = 0.12 * sipNow;
      if (holdL) {
        T[CH_ARM_LX] = reach.rx - 0.15 * sipNow; T[CH_ARM_LZ] = -reach.rz;
        T[CH_ARM_RX] = -0.55; T[CH_ARM_RZ] = 0.06;
      } else {
        T[CH_ARM_RX] = reach.rx - 0.15 * sipNow; T[CH_ARM_RZ] = reach.rz;
      }
      if (s.kangaroo) T[CH_TAIL_X] = -0.3;
    } else {
      T[CH_RIG_Y] = -a.seatY;
      const fold = s.sitLegFold || -1.35;
      T[CH_LEG_LX] = fold; T[CH_LEG_RX] = fold;
      T[CH_HEAD_X] = (s.sitHead || 0) + 0.12 * sipNow;
      if (holdL) { T[CH_ARM_LX] = reach.rx - 0.15 * sipNow; T[CH_ARM_LZ] = -reach.rz; }
      else { T[CH_ARM_RX] = reach.rx - 0.15 * sipNow; T[CH_ARM_RZ] = reach.rz; }
    }
    T[CH_MOUTH_SY] = 1 + 0.5 * sipNow;
    T[CH_EAR_X] = -0.1;
  } else if (pose === 'swing') {
    const sw = handle.swingPhase || 0;
    T[CH_RIG_Y] = -a.seatY;
    T[CH_LEAN] = -0.06 - 0.18 * sw;
    T[CH_MOUTH_SX] = 1.3; T[CH_EYE_SCALE] = 1.05;
    if (Q) {
      T[CH_LEAN] = -0.35 - 0.06 - 0.18 * sw;
      T[CH_LEG_LX] = -1.5 - 0.6 * sw; T[CH_LEG_RX] = -1.5 - 0.6 * sw;
      T[CH_ARM_LX] = -2.3; T[CH_ARM_RX] = -2.3; T[CH_ARM_LZ] = -0.2; T[CH_ARM_RZ] = 0.2;
    } else if (BI) {
      T[CH_LEG_LX] = -1.35 - 0.6 * sw; T[CH_LEG_RX] = -1.35 - 0.6 * sw;
      T[CH_ARM_LX] = -2.3; T[CH_ARM_RX] = -2.3; T[CH_ARM_LZ] = -0.22; T[CH_ARM_RZ] = 0.22;
    } else {
      T[CH_LEG_LX] = -1.35 - 0.6 * sw; T[CH_LEG_RX] = -1.35 - 0.6 * sw;
      T[CH_ARM_LZ] = -2.0; T[CH_ARM_RZ] = 2.0;
    }
    T[CH_TAIL_X] = -0.3 * sw;
  } else if (pose === 'swim') {
    const kick = Math.sin(TAU * 3 * time);
    const ph = TAU * ((1.2 * time) % 1);
    T[CH_MOUTH_SX] = 1.15;
    if (Q) {
      const pitch = s.swimmer ? (s.swimPitch || 0.1) : 0.35;
      T[CH_PITCH] = -pitch;
      T[CH_RIG_Y] = (s.swimmer ? -0.05 : SWIM_CENTER_Y) - a.bodyCy * Math.cos(pitch) + 0.03 * Math.sin(TAU * 0.8 * time);
      if (s.jaw) {
        T[CH_ARM_LX] = 0.9; T[CH_ARM_RX] = 0.9; T[CH_LEG_LX] = -0.9; T[CH_LEG_RX] = -0.9;
        T[CH_TAIL_Y] = 0.5 * Math.sin(TAU * 2 * time);
      } else {
        T[CH_ARM_LX] = wrapPi(-ph); T[CH_ARM_RX] = wrapPi(-ph - Math.PI);
        T[CH_LEG_LX] = 0.5 * kick; T[CH_LEG_RX] = -0.5 * kick;
        T[CH_TAIL_Y] = (s.swimmer ? 0.4 : 0.15) * Math.sin(TAU * 2 * time);
      }
      T[CH_HEAD_X] = -0.4 + pitch;
    } else if (BI) {
      const pitch = s.swimPitch || 1.2;
      T[CH_PITCH] = pitch;
      T[CH_RIG_Y] = SWIM_CENTER_Y - a.bodyCy * Math.cos(pitch) + 0.03 * Math.sin(TAU * 0.8 * time);
      T[CH_LEG_LX] = 0.5 * kick; T[CH_LEG_RX] = -0.5 * kick;
      T[CH_ARM_LX] = wrapPi(-ph); T[CH_ARM_RX] = wrapPi(-ph - Math.PI);
      T[CH_ARM_LZ] = -(0.35 + 0.25 * Math.sin(ph)); T[CH_ARM_RZ] = 0.35 + 0.25 * Math.sin(ph + Math.PI);
      T[CH_HEAD_X] = -0.45;
      if (s.tailWag) T[CH_TAIL_Z] = 0.4 * Math.sin(TAU * 2 * time);
    } else {
      if (s.flamingo) {
        T[CH_RIG_Y] = -0.45;
        const c3 = time % 3;
        T[CH_HEAD_X] = c3 < 0.8 ? 0.5 * Math.sin(Math.PI * c3 / 0.8) : 0;
      } else {
        T[CH_PITCH] = -0.3;
        T[CH_RIG_Y] = -0.05 - a.bodyCy * Math.cos(0.3) + (a.bodyCy - (s.bodyBottom || 0)) + 0.02 * Math.sin(TAU * 0.8 * time);
        T[CH_HEAD_X] = 0.3;
      }
      T[CH_LEG_LX] = 0.5 * kick; T[CH_LEG_RX] = -0.5 * kick;
      T[CH_ARM_LZ] = -a.restArmZ - 0.3 * (0.5 + 0.5 * Math.sin(ph)); T[CH_ARM_RZ] = a.restArmZ + 0.3 * (0.5 + 0.5 * Math.sin(ph));
    }
  } else if (pose === 'dive') {
    const jt = agent.jumpT > 0 ? (agent.jumpT > 1 ? 1 : agent.jumpT) : 0;
    const pitch = DIVE_PITCH * smooth01(jt);
    T[CH_PITCH] = pitch;
    T[CH_RIG_Y] = a.bodyCy * (1 - Math.cos(pitch));
    T[CH_EYE_SCALE] = 1.1;
    T[CH_MOUTH_SX] = 0.8; T[CH_MOUTH_SY] = 1.5;
    if (Q) {
      T[CH_ARM_LX] = 0.8; T[CH_ARM_RX] = 0.8; T[CH_LEG_LX] = -0.9; T[CH_LEG_RX] = -0.9;
      T[CH_EAR_X] = 0.5; T[CH_TAIL_X] = 0.2;
    } else if (BI) {
      T[CH_ARM_LX] = -3.05; T[CH_ARM_RX] = -3.05; T[CH_ARM_LZ] = 0.08; T[CH_ARM_RZ] = -0.08;
      T[CH_EAR_X] = 0.5;
    } else {
      T[CH_ARM_LZ] = -0.4; T[CH_ARM_RZ] = 0.4; T[CH_ARM_LX] = 1.0; T[CH_ARM_RX] = 1.0;
      T[CH_LEG_LX] = 0.8; T[CH_LEG_RX] = 0.8;
    }
  } else if (pose === 'climb') {
    const c2 = Math.sin(TAU * 2 * time);
    T[CH_LEG_LX] = -0.45 + 0.45 * c2; T[CH_LEG_RX] = -0.45 - 0.45 * c2;
    T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.9));
    if (Q) {
      T[CH_LEAN] = -1.2;
      T[CH_ARM_LX] = -2.4 + 0.5 * c2; T[CH_ARM_RX] = -2.4 - 0.5 * c2;
      T[CH_HEAD_X] = 0.9; T[CH_RIG_Y] = 0;
      T[CH_TAIL_X] = 0.6;
    } else {
      T[CH_ARM_LX] = -2.4 + 0.5 * c2; T[CH_ARM_RX] = -2.4 - 0.5 * c2;
      T[CH_ARM_LZ] = -0.15; T[CH_ARM_RZ] = 0.15;
      T[CH_HEAD_X] = -0.25;
    }
  } else if (pose === 'throw') {
    const u = (time % 1.6) / 1.6;
    let armX, lean, eye;
    if (u < 0.45) { const k = smooth01(u / 0.45); armX = -1.0 - 2.0 * k; lean = -0.18 * k; eye = -0.12 * k; }
    else if (u < 0.6) { const k = smooth01((u - 0.45) / 0.15); armX = -3.0 + 1.7 * k; lean = -0.18 + 0.40 * k; eye = -0.12 + 0.12 * k; }
    else { const k = smooth01((u - 0.6) / 0.4); armX = -1.3 + 0.7 * k; lean = 0.22 - 0.12 * k; eye = 0; }
    T[CH_ARM_LX] = armX; T[CH_ARM_RX] = armX;
    T[CH_ARM_LZ] = -0.08; T[CH_ARM_RZ] = 0.08;
    T[CH_EYE_PITCH] = eye;
    T[CH_HEAD_X] = eye * 1.5;
    if (Q) {
      T[CH_LEAN] = -1.0 + lean;
      T[CH_HEAD_X] = 0.8 + eye * 1.5;
      T[CH_RIG_Y] = -0.3 * a.seatY;
      T[CH_LEG_LX] = -1.0; T[CH_LEG_RX] = -1.0;
    } else {
      T[CH_LEAN] = lean;
      T[CH_LEG_LX] = -0.12 * Math.max(0, lean) * 4; T[CH_LEG_RX] = 0.12 * Math.max(0, lean) * 4;
    }
  } else if (pose === 'lookUp') {
    T[CH_SCALE_Y] = 1 + 0.02 * br;
    T[CH_PUPIL_Y] = 0.015;
    T[CH_EYE_PITCH] = -0.1;
    if (Q) {
      T[CH_HEAD_X] = s.lookUpHead !== undefined ? s.lookUpHead : -0.45;
      T[CH_LEAN] = -0.1;
      T[CH_EAR_X] = -0.3;
      T[CH_ARM_LX] = 0.08; T[CH_ARM_RX] = 0.08;
    } else if (BI) {
      T[CH_LEAN] = -0.28; T[CH_HEAD_X] = -0.22;
      T[CH_ARM_RX] = -2.5; T[CH_ARM_RZ] = -0.5; T[CH_ARM_LX] = -0.1;
    } else {
      T[CH_HEAD_X] = -0.5;
      T[CH_ARM_RZ] = -1.4; T[CH_ARM_RX] = -0.8;
    }
  } else if (pose === 'cheer') {
    const bb = Math.abs(Math.sin(TAU * 2.5 * time));
    const sw = Math.sin(TAU * 3 * time);
    T[CH_RIG_Y] = 0.06 * bb;
    T[CH_MOUTH_SX] = 1.4; T[CH_MOUTH_SY] = 1.3;
    T[CH_EYE_SCALE] = 1.1;
    T[CH_SCALE_Y] = 1 + 0.03 * bb; T[CH_SCALE_XZ] = 1 - 0.012 * bb;
    if (Q) {
      T[CH_LEAN] = -0.9;
      T[CH_ARM_LX] = -2.9; T[CH_ARM_RX] = -2.9;
      T[CH_ARM_LZ] = -(0.3 + 0.15 * sw); T[CH_ARM_RZ] = 0.3 + 0.15 * sw;
      T[CH_HEAD_X] = 0.7;
      T[CH_LEG_LX] = -0.6; T[CH_LEG_RX] = -0.6;
      T[CH_RIG_Y] = -0.3 * a.seatY + 0.06 * bb;
      T[CH_EAR_X] = -0.3;
    } else if (BI) {
      T[CH_ARM_LX] = -2.9; T[CH_ARM_RX] = -2.9;
      T[CH_ARM_LZ] = -(0.3 + 0.15 * sw); T[CH_ARM_RZ] = 0.3 + 0.15 * sw;
      if (s.rabbit) T[CH_EAR_X] = -0.3;
    } else {
      T[CH_ARM_LZ] = -2.6 - 0.2 * sw; T[CH_ARM_RZ] = 2.6 + 0.2 * sw;
    }
    if (s.jaw) T[CH_JAW] = 0.35;
  } else if (pose === 'lever') {
    const rock = Math.sin(TAU * 0.8 * time);
    T[CH_ARM_LX] = -1.3 + 0.35 * rock; T[CH_ARM_RX] = -1.3 + 0.35 * rock;
    T[CH_ARM_LZ] = 0.05; T[CH_ARM_RZ] = -0.05;
    T[CH_MOUTH_SY] = 1.2;
    if (Q) {
      T[CH_LEAN] = -0.9 + 0.25 * rock;
      T[CH_LEG_LX] = 0.18 * rock; T[CH_LEG_RX] = 0.18 * rock;
      T[CH_HEAD_X] = 0.7;
      T[CH_RIG_Y] = -0.3 * a.seatY;
    } else {
      T[CH_LEAN] = 0.25 * rock;
      T[CH_LEG_LX] = 0.18 * rock; T[CH_LEG_RX] = -0.12 * rock;
    }
  } else if (pose === 'paint') {
    const sweep = Math.sin(TAU * 1.2 * time);
    T[CH_EYE_PITCH] = -0.08 * sweep;
    T[CH_TORSO_Y] = 0.01 * sweep;
    if (Q) {
      qSitBase(T, s, a, -0.5, -1.3, 0.5);
      T[CH_ARM_RX] = -1.6 + 0.6 * sweep; T[CH_ARM_RZ] = 0.05;
      T[CH_HEAD_X] = 0.3 - 0.15 * sweep;
    } else if (BI) {
      T[CH_ARM_RX] = -1.6 + 0.6 * sweep; T[CH_ARM_RZ] = 0.05; T[CH_ARM_LX] = -0.35;
      T[CH_HEAD_X] = -0.15 * sweep; T[CH_LEAN] = 0.05;
    } else {
      T[CH_ARM_RZ] = -1.2; T[CH_ARM_RX] = -0.6 + 0.6 * sweep;
      T[CH_HEAD_X] = -0.15 * sweep;
    }
  } else if (pose === 'push') {
    const st = Math.sin(TAU * 2.2 * time);
    T[CH_LEAN] = 0.30;
    T[CH_ARM_LX] = -1.4; T[CH_ARM_RX] = -1.4;
    T[CH_LEG_LX] = 0.5 * st; T[CH_LEG_RX] = -0.5 * st;
    T[CH_TORSO_Y] = 0.02 * Math.abs(st);
    T[CH_MOUTH_SX] = 0.85; T[CH_MOUTH_SY] = 1.3;
    if (Q) {
      T[CH_RIG_Y] = 0.25 * a.hipY * (1 - Math.cos(0.5));
      T[CH_HEAD_X] = 0.2;
    } else {
      T[CH_ARM_LZ] = -0.05; T[CH_ARM_RZ] = 0.05;
      T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.5));
      T[CH_HEAD_X] = -0.2;
    }
  } else if (pose === 'point') {
    T[CH_RIG_Y] = 0.02 * Math.abs(Math.sin(TAU * 2 * time));
    T[CH_MOUTH_SX] = 1.2; T[CH_EYE_SCALE] = 1.04;
    if (Q) {
      qSitBase(T, s, a, -0.45, -1.3, 0.5);
      T[CH_RIG_Y] += -0.5 * a.seatY;
      T[CH_ARM_RX] = -1.5; T[CH_ARM_RZ] = 0;
      T[CH_HEAD_X] = 0.3;
    } else if (BI) {
      T[CH_ARM_RX] = -1.5; T[CH_ARM_RZ] = 0; T[CH_ARM_LX] = -0.1;
      T[CH_HEAD_X] = -0.05;
    } else {
      T[CH_ARM_RZ] = -1.4; T[CH_ARM_RX] = -0.6;
      T[CH_HEAD_Z] = -0.05;
    }
  } else if (pose === 'balance') {
    const roll = 0.12 * Math.sin(TAU * 0.7 * time);
    T[CH_SWAY_Z] = roll;
    T[CH_HEAD_Z] = -0.5 * roll;
    T[CH_EYE_SCALE] = 1.05;
    T[CH_MOUTH_SX] = 0.8;
    T[CH_RIG_Y] = 0.01 * Math.abs(Math.sin(TAU * 2.2 * time));
    T[CH_EAR_X] = -0.2;
    if (Q) {
      // CONTRACT: the design lists hind legs rx 1.25 to stay plumb; they are rig children here, so 0 keeps them vertical.
      T[CH_LEAN] = -1.25;
      T[CH_ARM_LZ] = -1.35 - 0.35 * roll; T[CH_ARM_RZ] = 1.35 - 0.35 * roll;
      T[CH_ARM_LX] = -0.2; T[CH_ARM_RX] = -0.2;
      T[CH_TAIL_X] = 1.2;
      T[CH_HEAD_X] = 1.1;
      T[CH_LEG_XOFF] = Math.max(0, (s.legX || 0.1) - 0.08);
    } else if (BI) {
      T[CH_ARM_LZ] = -1.5 - 0.35 * roll; T[CH_ARM_RZ] = 1.5 - 0.35 * roll;
      T[CH_ARM_LX] = 0; T[CH_ARM_RX] = 0;
      T[CH_LEG_XOFF] = Math.max(0, Math.abs(P.legL.userData.x0) - 0.06);
      if (s.kangaroo) T[CH_TAIL_X] = -0.6;
      if (s.rabbit) T[CH_EAR_X] = -0.1;
    } else {
      T[CH_ARM_LZ] = -1.5 - 0.35 * roll; T[CH_ARM_RZ] = 1.5 - 0.35 * roll;
      T[CH_ARM_LX] = 0; T[CH_ARM_RX] = 0;
      T[CH_LEG_XOFF] = Math.max(0, Math.abs(P.legL.userData.x0) - 0.04);
    }
  } else if (pose === 'golf' || pose === 'golfIdle') {
    /* Golf: address stance, or the swing driven by handle.golfPhase (see golfTargets). */
    golfTargets(T, a, handle, pose, time);
  } else if (pose === 'slide') {
    /* Subway slide. Bipeds squash the torso to about 55 percent (scaled about the origin so the
       body bottom stays on the ground), pitch back 0.3 rad, sweep the arms back and throw the legs
       forward. Quadrupeds belly-slide: the rig drops by the body's ground clearance, the front legs
       stretch forward and the hind legs back, the chest lifts 0.3 rad about the hind hips. Birds
       tuck: the same crouch with the wings pulled flat against the body. */
    T[CH_EYE_SCALE] = 0.94;
    T[CH_EYE_PITCH] = -0.05;
    T[CH_MOUTH_SX] = 0.85; T[CH_MOUTH_SY] = 1.2;
    T[CH_EAR_X] = -0.45;
    if (Q) {
      // The torso scales about the hind hip line, so the squash lowers the back and raises the
      // belly toward the hips; the head pitches down by the chest lift so the snout stays level.
      // Low-slung species (tortoise, crocodile, seal: golfPitch below the standard) lift less so the
      // head stays under the standing height.
      const lift = 0.3 * (s.golfPitch ? s.golfPitch / GOLF_Q_PITCH : 1);
      T[CH_RIG_Y] = -0.9 * Math.max(0, s.bodyBottom || 0);
      T[CH_SCALE_Y] = 0.7; T[CH_SCALE_XZ] = 1.08;
      T[CH_LEAN] = -lift;
      T[CH_ARM_LX] = -1.45; T[CH_ARM_RX] = -1.45;
      T[CH_LEG_LX] = 1.45; T[CH_LEG_RX] = 1.45;
      T[CH_HEAD_X] = lift;
      T[CH_TAIL_X] = 0.6;   // lifts a hanging or trailing tail clear of the ground
      if (s.trunk) T[CH_TRUNK_X] = -0.6;
    } else if (BI) {
      T[CH_SCALE_Y] = 0.55; T[CH_SCALE_XZ] = 1.12;
      T[CH_LEAN] = -0.3;
      T[CH_TORSO_Y] = 0.04;   // the pitch is about the torso origin, so a small lift keeps the body bottom clear
      T[CH_ARM_LX] = 1.1; T[CH_ARM_RX] = 1.1;
      T[CH_ARM_LZ] = -0.35; T[CH_ARM_RZ] = 0.35;
      T[CH_LEG_LX] = -1.2; T[CH_LEG_RX] = -1.2;
      T[CH_HEAD_X] = 0.25;
      if (s.kangaroo) T[CH_TAIL_X] = 0.7;
    } else {
      T[CH_SCALE_Y] = 0.55; T[CH_SCALE_XZ] = 1.12;
      T[CH_LEAN] = -0.3;
      T[CH_TORSO_Y] = 0.04;
      T[CH_ARM_LX] = 0.6; T[CH_ARM_RX] = 0.6;
      T[CH_ARM_LZ] = -0.3 * a.restArmZ; T[CH_ARM_RZ] = 0.3 * a.restArmZ;
      T[CH_LEG_LX] = -1.2; T[CH_LEG_RX] = -1.2;
      T[CH_HEAD_X] = 0.2;
    }
  } else if (pose === 'ride') {
    /* Scooter. Bipeds: left foot forward, right foot back, a slight knee bend (a small squash),
       leaning forward 0.15 rad, both hands forward and a little down to the bar, head up.
       Quadrupeds rear onto the hind legs (0.15 short of upright, so they lean into the ride) with
       the front paws reaching forward to the bar, hind feet staggered, head lifted level, tail up.
       Birds perch with the feet staggered and both wings swung forward onto the bar. */
    const buzz = Math.sin(TAU * 9 * time);
    T[CH_TORSO_Y] = 0.004 * buzz;
    T[CH_EYE_SCALE] = 1.05;
    T[CH_MOUTH_SX] = 1.2;
    T[CH_EAR_X] = -0.3;
    if (Q) {
      const rear = -1.25 + 0.15;
      T[CH_LEAN] = rear;
      T[CH_ARM_LX] = -0.25; T[CH_ARM_RX] = -0.25;
      T[CH_ARM_LZ] = 0.05; T[CH_ARM_RZ] = -0.05;
      T[CH_LEG_LX] = -0.22; T[CH_LEG_RX] = 0.22;
      T[CH_RIG_Y] = -0.2 * a.seatY;
      T[CH_HEAD_X] = -rear - 0.1;
      T[CH_TAIL_X] = 0.8;
      if (s.trunk) T[CH_TRUNK_X] = -0.3;
    } else if (BI) {
      T[CH_LEAN] = 0.15;
      T[CH_LEG_LX] = -0.28; T[CH_LEG_RX] = 0.32;
      T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.32));
      T[CH_SCALE_Y] = 0.96; T[CH_SCALE_XZ] = 1.015;
      T[CH_ARM_LX] = -1.25; T[CH_ARM_RX] = -1.25;
      T[CH_ARM_LZ] = -0.08; T[CH_ARM_RZ] = 0.08;
      T[CH_HEAD_X] = -0.14;
      if (s.kangaroo) T[CH_TAIL_X] = 0.4;
      if (s.tailRock) T[CH_TAIL_Z] = 0.08 * buzz;
    } else {
      T[CH_LEAN] = 0.15;
      T[CH_LEG_LX] = -0.18; T[CH_LEG_RX] = 0.22;
      T[CH_RIG_Y] = 0.16 * (1 - Math.cos(0.22));
      T[CH_SCALE_Y] = 0.96; T[CH_SCALE_XZ] = 1.015;
      T[CH_ARM_LX] = -1.1; T[CH_ARM_RX] = -1.1;
      T[CH_ARM_LZ] = -0.5 * a.restArmZ; T[CH_ARM_RZ] = 0.5 * a.restArmZ;
      T[CH_HEAD_X] = -0.14;
    }
    // Paws, hands or wing tips on the grips: pitch, splay and length solved from this species'
    // shoulders in the build's ride stance (rideReach); the fixed angles above stay as the fallback.
    const Pv0 = s.P;
    _rtorsoP.set(Pv0[0], Pv0[1], Pv0[2]);
    // A rider whose arms fall short leans further onto the bar (rideReach's leanSteps); the head
    // then pitches back by the same amount so it stays level.
    const rr = rideReach('animal:' + s.id, handle, P.armL, P.armR, P.handL, P.handR, P.armL.userData.y0, P.armR.userData.y0,
      P.armL.userData.rz0 || 0, P.armR.userData.rz0 || 0, _rtorsoP, T[CH_LEAN], T[CH_SCALE_Y], T[CH_SCALE_XZ], T[CH_RIG_Y], Q ? RIDE_Q_LEANS : RIDE_B_LEANS);
    if (rr) {
      T[CH_ARM_LX] = rr.lx; T[CH_ARM_RX] = rr.rx;
      T[CH_ARM_LZ] = rr.lz; T[CH_ARM_RZ] = rr.rz;
      T[CH_ARM_LS] = rr.ls; T[CH_ARM_RS] = rr.rs;
      if (Number.isFinite(rr.lean) && rr.lean !== T[CH_LEAN]) { T[CH_HEAD_X] += T[CH_LEAN] - rr.lean; T[CH_LEAN] = rr.lean; }
    }
  } else if (pose === 'hover') {
    /* Hoverboard (v11). Bipeds: a skater's stance, knees bent (a squash with the rig lowered onto
       the swung feet), one foot forward and one back, the feet apart, both arms out for balance
       with a slow wobble. Quadrupeds: a crouch on all fours with every leg splayed, the head up and
       the tail out. Birds: the feet staggered and the wings spread. The torso leans into
       handle.leanZ on top of the rig roll, the head turns into the turn, the ears stream back.
       In the air (a.air eases toward handle.airborne) the rider crouches: a deeper squash, the
       legs tucked, the arms or wings higher, the head down a little. */
    const air = a.air, buzz = Math.sin(TAU * 7 * time), wob = Math.sin(TAU * 0.7 * time);
    const lean = Number.isFinite(handle.leanZ) ? Math.max(-0.5, Math.min(0.5, handle.leanZ)) : 0;
    T[CH_TORSO_Y] = 0.004 * buzz - 0.03 * air;
    T[CH_SWAY_Z] = (Q ? 0.3 : 0.5) * lean;
    T[CH_HEAD_Y] = 0.35 * lean;
    T[CH_HEAD_Z] = -0.25 * lean;
    T[CH_EAR_X] = -0.35 - 0.2 * air;
    T[CH_EYE_SCALE] = 1.06;
    T[CH_MOUTH_SX] = 1.25;
    if (Q) {
      T[CH_LEAN] = -0.08 - 0.12 * air;
      T[CH_SCALE_Y] = 0.94 - 0.06 * air; T[CH_SCALE_XZ] = 1.02;
      T[CH_RIG_Y] = -0.1 * a.hipY - 0.12 * a.hipY * air;
      T[CH_ARM_LX] = a.restArmX - 0.3 - 0.7 * air + 0.04 * wob; T[CH_ARM_RX] = a.restArmX - 0.3 - 0.7 * air - 0.04 * wob;
      T[CH_ARM_LZ] = -0.35 - 0.15 * air; T[CH_ARM_RZ] = 0.35 + 0.15 * air;
      T[CH_LEG_LX] = 0.3 + 0.6 * air; T[CH_LEG_RX] = 0.3 + 0.6 * air;
      T[CH_LEG_LZ] = -0.25; T[CH_LEG_RZ] = 0.25;
      T[CH_HEAD_X] = -0.3 - 0.1 * air;
      T[CH_TAIL_X] = 0.6 + 0.3 * air; T[CH_TAIL_Y] = 0.15 * wob;
      if (s.trunk) T[CH_TRUNK_X] = -0.4 - 0.3 * air;
    } else if (BI) {
      T[CH_LEAN] = 0.08 - 0.16 * air;
      T[CH_LEG_LX] = -0.38 - 0.5 * air; T[CH_LEG_RX] = 0.38 - 1.25 * air;
      T[CH_LEG_XOFF] = 0.05;
      T[CH_RIG_Y] = a.legReach * (1 - Math.cos(0.38)) - 0.02 * air;
      T[CH_SCALE_Y] = 0.9 - 0.08 * air; T[CH_SCALE_XZ] = 1.03 + 0.02 * air;
      T[CH_ARM_LX] = -0.25 - 0.3 * air + 0.05 * wob; T[CH_ARM_RX] = -0.25 - 0.3 * air - 0.05 * wob;
      T[CH_ARM_LZ] = -(a.restArmZ + 1.2 + 0.3 * air) + 0.06 * wob; T[CH_ARM_RZ] = a.restArmZ + 1.2 + 0.3 * air + 0.06 * wob;
      T[CH_HEAD_X] = -0.1 + 0.18 * air;
      if (s.kangaroo) T[CH_TAIL_X] = 0.3 + 0.3 * air;
      if (s.tailRock) T[CH_TAIL_Z] = 0.1 * wob;
    } else {
      T[CH_LEAN] = 0.08 - 0.14 * air;
      T[CH_LEG_LX] = -0.22 - 0.3 * air; T[CH_LEG_RX] = 0.22 - 0.8 * air;
      T[CH_RIG_Y] = a.legReach * (1 - Math.cos(0.22)) - 0.02 * air;
      T[CH_SCALE_Y] = 0.92 - 0.06 * air; T[CH_SCALE_XZ] = 1.03;
      T[CH_ARM_LX] = -0.1 - 0.2 * air; T[CH_ARM_RX] = -0.1 - 0.2 * air;
      T[CH_ARM_LZ] = -(a.restArmZ + 1.3 + 0.3 * air) + 0.08 * wob; T[CH_ARM_RZ] = a.restArmZ + 1.3 + 0.3 * air + 0.08 * wob;
      T[CH_HEAD_X] = -0.1 + 0.18 * air;
      if (s.flamingo) { T[CH_LEG_LX] = -0.2; T[CH_LEG_RX] = 0.2 - 0.6 * air; }
    }
  } else if (pose === 'boat') {
    /* Boat (v11): seated as for 'sit' at the stern, turned a little toward the tiller: the right
       hand, paw or wing back and out on the tiller, the left forward on the gunwale, looking ahead
       past the bow, a slow rock with the hull, the ears back. */
    const rock = Math.sin(TAU * 0.45 * time);
    T[CH_SCALE_Y] = 1 + 0.02 * br; T[CH_SCALE_XZ] = 1 - 0.008 * br;
    T[CH_SWAY_Z] = 0.03 * rock;
    T[CH_TORSO_YAW] = 0.22;
    T[CH_HEAD_Y] = -0.22;
    T[CH_EAR_X] = -0.2;
    T[CH_EYE_SCALE] = 1.03;
    T[CH_MOUTH_SX] = 1.15;
    if (Q) {
      const torsoRx = s.sitTorso !== undefined ? s.sitTorso : -0.35;
      qSitBase(T, s, a, torsoRx, -1.5, 1);
      T[CH_ARM_LX] = -torsoRx * 0.8 - 0.2;
      T[CH_ARM_RX] = 0.85; T[CH_ARM_RZ] = 0.3;
      T[CH_HEAD_X] = (s.sitHead !== undefined ? s.sitHead : 0.3) - 0.25;
      T[CH_TAIL_Y] = 0.2 * rock;
      if (s.trunk) T[CH_TRUNK_X] = -0.4;
    } else if (BI) {
      T[CH_RIG_Y] = -a.seatY;
      T[CH_LEG_LX] = -1.35; T[CH_LEG_RX] = -1.35;
      T[CH_LEAN] = -0.08;
      T[CH_ARM_RX] = 0.75; T[CH_ARM_RZ] = a.restArmZ + 0.4;
      T[CH_ARM_LX] = -0.35; T[CH_ARM_LZ] = -(a.restArmZ + 0.5);
      T[CH_HEAD_X] = -0.06;
      if (s.kangaroo) T[CH_TAIL_X] = -0.3;
      if (s.tailRock) T[CH_TAIL_Z] = 0.08 * rock;
    } else {
      T[CH_RIG_Y] = -a.seatY;
      const fold = s.sitLegFold || -1.35;
      T[CH_LEG_LX] = fold; T[CH_LEG_RX] = fold;
      T[CH_LEAN] = -0.06;
      T[CH_ARM_RX] = 0.7; T[CH_ARM_RZ] = a.restArmZ + 0.25;
      T[CH_ARM_LX] = -0.3; T[CH_ARM_LZ] = -(a.restArmZ + 0.35);
      T[CH_HEAD_X] = (s.sitHead || 0) - 0.06;
    }
  } else {
    /* Standing (and any unknown pose): breathing, blink, look around, species idle tics.
       v10: pose 'idle' (and 'stand' while the agent is idle) adds the fidgets: a slow weight shift
       with the torso and head leaning the other way, and a look to one side. */
    T[CH_SCALE_Y] = 1 + 0.03 * br;
    T[CH_SCALE_XZ] = 1 - 0.012 * br;
    if (pose === 'idle' || (pose === 'stand' && state === 'idle' && !agent.paused)) {
      const f = idleFidgets(a, time);
      const sh = f.shift;
      T[CH_SWAY_Z] = (Q ? 0.02 : 0.035) * sh;
      T[CH_HEAD_Z] = -0.03 * sh;
      T[CH_TORSO_Y] = -0.006 * Math.abs(sh);
      if (Q) { T[CH_ARM_LX] = a.restArmX + 0.04 * sh; T[CH_ARM_RX] = a.restArmX - 0.04 * sh; }
      else { T[CH_LEG_LX] = 0.05 * sh; T[CH_LEG_RX] = -0.05 * sh; }
      lookTarget = f.look;
      T[CH_EAR_X] = -0.15 * f.flick;
      T[CH_PUPIL_X] = 0.006 * f.look;
    }
    if (agent.lookAt !== a.lastLookAt) {
      a.lastLookAt = agent.lookAt;
      a.lookStart = time;
      a.lookSign = (Math.floor((agent.lookAt || 0) * 1000) & 1) ? 1 : -1;
    }
    const lk = time - a.lookStart;
    if (lk >= 0 && lk < 1.2) lookTarget = a.lookSign * (s.headTurn || 0.35);
    if (Q) {
      T[CH_TAIL_Y] = 0.25 * Math.sin(TAU * 0.5 * time + a.earPhase);
      // One ear flicks for 0.2 s every 3 to 5 s.
      if (time - a.earT > a.earNext) { a.earT = time; a.earNext = 3 + 2 * ((Math.sin(time * 7.3 + a.earPhase) + 1) / 2); }
      const et = time - a.earT;
      if (et >= 0 && et < 0.2) T[CH_EAR_RZ] = -0.4 * Math.sin(Math.PI * et / 0.2);
    } else if (BI) {
      if (s.tailRock) T[CH_TAIL_Z] = 0.1 * Math.sin(TAU * 0.6 * time);
      if (s.throat) T[CH_THROAT] = 0.5 + 0.5 * Math.sin(TAU * 1.2 * time);
    } else {
      T[CH_HEAD_Z] = 0.1 * Math.sin(TAU * 0.3 * time);
      if (s.flamingo) T[CH_LEG_RX] = 1.5;
      if (s.penguin) { const w = 0.08 * Math.sin(TAU * 0.8 * time); T[CH_ARM_LZ] = -a.restArmZ - w; T[CH_ARM_RZ] = a.restArmZ + w; }
    }
  }

  /* Blink */
  let blinkScale = 1, showLids = false;
  const bt = time - (agent.blinkAt || 0);
  if (bt >= 0 && bt < 0.14) {
    const u = bt / 0.14;
    const c = Math.sin(Math.PI * u);
    const e = c * c * (3 - 2 * c);
    blinkScale = 1 - 0.75 * e;
    showLids = c > 0.03;
  }

  /* Blend */
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
  const torso = handle.torso, Pv = s.P;
  torso.position.set(Pv[0], Pv[1] + cur[CH_TORSO_Y], Pv[2]);
  torso.rotation.x = cur[CH_LEAN];
  torso.rotation.y = cur[CH_TORSO_YAW];
  torso.rotation.z = cur[CH_SWAY_Z];
  torso.scale.set(cur[CH_SCALE_XZ], cur[CH_SCALE_Y], cur[CH_SCALE_XZ]);
  handle.rig.position.y = cur[CH_RIG_Y];
  handle.rig.rotation.x = cur[CH_PITCH];
  // Riding roll about the facing axis (the rig's local z, order YXZ), eased toward handle.leanZ
  // (v11: the hoverboard rolls the rider the same way).
  const lz = handle.leanZ;
  const rollTarget = (pose === 'ride' || pose === 'hover') && Number.isFinite(lz) ? Math.max(-0.5, Math.min(0.5, lz)) : 0;
  a.rideRoll += (rollTarget - a.rideRoll) * (1 - Math.exp(-10 * dt));
  if (rollTarget === 0 && Math.abs(a.rideRoll) < 1e-5) a.rideRoll = 0;
  handle.rig.rotation.z = a.rideRoll;

  const armL = P.armL, armR = P.armR, legL = P.legL, legR = P.legR;
  // rz0 is the authored splay (tortoise, crocodile); 0 for every other limb.
  armL.rotation.x = cur[CH_ARM_LX]; armL.rotation.z = armL.userData.rz0 + cur[CH_ARM_LZ]; armL.position.y = armL.userData.y0 + a.tapL;
  armR.rotation.x = cur[CH_ARM_RX]; armR.rotation.z = armR.userData.rz0 + cur[CH_ARM_RZ]; armR.position.y = armR.userData.y0 + a.tapR;
  armL.scale.y = cur[CH_ARM_LS]; armR.scale.y = cur[CH_ARM_RS];
  legL.rotation.x = cur[CH_LEG_LX]; legL.rotation.z = legL.userData.rz0 + cur[CH_LEG_LZ];
  legR.rotation.x = cur[CH_LEG_RX]; legR.rotation.z = legR.userData.rz0 + cur[CH_LEG_RZ];
  legL.position.x = legL.userData.x0 + cur[CH_LEG_XOFF];
  legR.position.x = legR.userData.x0 - cur[CH_LEG_XOFF];

  const head = handle.headGroup;
  head.rotation.x = cur[CH_HEAD_X];
  head.rotation.y = a.lookYaw + cur[CH_HEAD_Y];
  head.rotation.z = cur[CH_HEAD_Z];
  const ep = handle.eyePivot;
  ep.rotation.x = cur[CH_EYE_PITCH];
  ep.scale.setScalar(cur[CH_EYE_SCALE]);
  const egs = P.eyeGroups;
  for (let i = 0; i < egs.length; i++) {
    egs[i].scale.y = blinkScale;
    P.lids[i].visible = showLids;
    const pupil = P.pupils[i];
    pupil.position.y = cur[CH_PUPIL_Y];
    pupil.position.x = pupil.userData.inward * cur[CH_PUPIL_X];
  }
  const mouth = P.mouth;
  if (mouth) { const bs = mouth.userData.bs; mouth.scale.set(bs.x * cur[CH_MOUTH_SX], bs.y * cur[CH_MOUTH_SY], bs.z); }
  const tail = P.tail;
  if (tail) tail.rotation.set(cur[CH_TAIL_X], cur[CH_TAIL_Y], cur[CH_TAIL_Z]);
  const ears = P.ears;
  for (let i = 0; i < ears.length; i++) {
    const e = ears[i], base = e.userData.base;
    e.rotation.x = base.x + cur[CH_EAR_X];
    e.rotation.z = base.z + (e.position.x < 0 ? cur[CH_EAR_LZ] : cur[CH_EAR_RZ]);
  }
  if (P.jaw) P.jaw.rotation.x = cur[CH_JAW];
  if (P.throat) { const bs = P.throat.userData.bs, k = 1 + 0.25 * cur[CH_THROAT]; P.throat.scale.set(bs.x * k, bs.y * k, bs.z * k); }
  if (P.trunk) P.trunk.rotation.x = cur[CH_TRUNK_X];
  if (P.scarfTail) P.scarfTail.rotation.z = cur[CH_SCARF_Z];

  /* Rotation: alien rules. */
  let targetYaw;
  if (working || handle.group.rotation.y !== 0) targetYaw = 0;
  else if (pose === 'wave') targetYaw = 0;
  else if (followsMoveDir(pose)) {
    const md = agent.moveDir;
    if (md && (md.x !== 0 || md.z !== 0)) targetYaw = Math.atan2(md.x, md.z);
    else if (pose === 'walk') targetYaw = (agent.facing || 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
    else targetYaw = handle.traits.idleYaw;
  } else targetYaw = handle.traits.idleYaw;
  let d = targetYaw - a.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  a.yaw += d * (1 - Math.exp(-8 * dt));
  if (a.yaw > Math.PI) a.yaw -= TAU; else if (a.yaw < -Math.PI) a.yaw += TAU;
  handle.rig.rotation.y = a.yaw;

  const ring = P.ring;
  if (ring.visible) {
    const sc = ring.userData.selected ? 1.04 + 0.04 * Math.sin(TAU * 1.2 * time) : 1;
    ring.scale.set(sc, sc, 1);
  }
}

/* ------------------------------------------------------------------ */
/* Fade support, mirroring setAlienOpacity: shared materials are cloned for this handle the
   first time it fades (userData.ownedBy = handle.uid) so no other animal dims with it. Only
   materials this module owns are touched; props and the renderer's contact shadow are left alone. */

let _fadeHandle = null;
let _fadeAlpha = 1;

function ownMaterialFor(handle, src) {
  let own = handle.ownMaterials.get(src);
  if (!own) {
    own = src.clone();
    own.userData.envBase = src.userData.envBase;
    own.userData.animalShared = false;
    own.userData.ownedBy = handle.uid;
    own.userData.wasTransparent = src.transparent;
    own.userData.wasOpacity = src.opacity;
    if (src.isMeshStandardMaterial) {
      own.envMapIntensity = src.envMapIntensity;
      ANIMAL_MATERIALS.push(own);
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
  if (ud.animalShared && ud.ownedBy !== _fadeHandle.uid) {
    m = ownMaterialFor(_fadeHandle, m);
    obj.material = m;
  } else if (ud.ownedBy !== _fadeHandle.uid) {
    return;
  }
  const d = m.userData;
  if (d.wasTransparent === undefined) { d.wasTransparent = m.transparent; d.wasOpacity = m.opacity; }
  const fading = _fadeAlpha < 0.999;
  m.transparent = fading || d.wasTransparent;
  m.opacity = fading ? d.wasOpacity * _fadeAlpha : d.wasOpacity;
}

export function setAnimalOpacity(handle, alpha) {
  if (!handle || handle.disposed) return;
  alpha = alpha >= 0 ? (alpha > 1 ? 1 : alpha) : 0;
  if (!handle.ownMaterials) handle.ownMaterials = new Map();
  handle.opacity = alpha;
  _fadeHandle = handle;
  _fadeAlpha = alpha;
  handle.group.traverse(applyFade);
  _fadeHandle = null;
}

export function disposeAnimal(handle) {
  if (!handle || handle.disposed) return;
  handle.disposed = true;
  if (handle.group.parent) handle.group.parent.remove(handle.group);
  if (handle.parts.ring && handle.parts.ring.material) handle.parts.ring.material.dispose();
  if (handle.ownMaterials) {
    for (const m of handle.ownMaterials.values()) {
      const at = ANIMAL_MATERIALS.indexOf(m);
      if (at >= 0) ANIMAL_MATERIALS.splice(at, 1);
      m.dispose();
    }
    handle.ownMaterials = null;
  }
}

/* Drop the module's own caches (full teardown only). Geometries from common.js stay with its cache. */
export function disposeAnimalCaches() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  ANIMAL_MATERIALS.length = 0;
  reachCache.clear();
  if (highlightMat) { highlightMat.dispose(); highlightMat = null; }
}
