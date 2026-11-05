/* Thread Town subway runner (CONTRACT_V6 "The game module", numbers from docs/SUBWAY_DESIGN.md).

   An endless runner in its own scene: three lanes, the world scrolls toward the runner at a
   speed that climbs from 9 to 24 units per second, obstacles come from a seeded pattern
   generator working in rows of 6 units, coins and power-ups are pooled, and the runner is the
   visitor's own town character driven through ctx.makeCharacter and ctx.animate.

   Public surface:
     createSubwayGame(ctx) -> { scene, camera, group, start, setInput, update, hud, resize, dispose, setTouch, _debug }
     ctx = { THREE, makeCharacter(spec) -> handle, animate(handle, agent, time, dt, poseOverride), storage: { get, set } }

   Coordinates: the runner stays at z 0 and faces -z (the track scrolls toward +z). A thing at
   track distance s (units from the start of the run) sits at world z = traveled - s. Lanes are
   -1, 0, 1 at x -1.6, 0, 1.6. One unit is 1.5 m on the distance readout.

   Allocation: everything is built in the first start (pools, the fake agent, the row ring, the
   hud object, scratch vectors). update, hud and the per-frame helpers allocate nothing; the
   returned event objects are reused, so read them at once. _debug.rowsAhead() is test-only and
   does allocate.

   v10 (docs/CONTRACT_V10.md "Polish list", Subway): the tunnel fixtures trail light streaks whose
   length and brightness grow with speed (one shared geometry rewritten in place, one mesh per
   tunnel slot); a vignette quad rides on the camera (darker with speed, salmon on a hit, closing
   in on death); trains carry a lit cab face, headlight beams, tail lights, roof vents, door seams
   and lit window strips; coins spin with the speed and glint through instanceColor as their face
   sweeps past the camera; a near miss (a solid obstacle passing within 1.3 units, or one cleared
   by a jump or a slide) punches the passed obstacle's scale, the camera FOV, a nudge away and the
   vignette for 0.35 s and counts in hud.nearMiss. The runner's walk cycle is distance driven
   (handle.distance = track units traveled). All per frame allocation free.

   v11 (docs/CONTRACT_V11.md "The chase", "Coins", "The hoverboard"):
   - The chase: two pooled chasers behind the runner, the inspector (the runner's own rig style
     through ctx.makeChaser at 1.05 of the runner's scale, a navy coat with silver buttons, a salmon
     tie and silver cuffs, a cap and grumpy brows) and the dog (a small quadruped built here from the
     common primitives, silver grey with a navy collar and an aqua tag, 0.45 of the inspector's
     height, on a navy leash). They burst out of the station for the first 1.5 s
     of every run, then drop back out of frame. A stumble (the runner clips a barrier side or a sign
     post: a sideways swipe into the obstacle, or an arrival with less than CLIP_W of overlap) slows
     the runner and brings the chasers in at 0.8 behind for 2.5 s, the inspector grabbing with both
     arms, the dog leaping, the runner looking back for 0.4 s; a second stumble inside those 2.5 s is
     a catch. Any crash is a catch: state 'caught' for 1.2 s (the inspector grabs the collar and
     hauls, the dog jumps and barks with a puff and a 'Woof' label, the camera swings to a side
     view), then state 'dead' and the gameover event (evOver.caught true; the card reads 'Caught at').
   - Near misses pay NEAR_PAY coins each (hud.nearMissCoins this frame, for the '+2' on the 'Close!'
     flash); every 5 in a row without a hit or a stumble raise the run multiplier by 1 (max +3)
     until the next hit; the camera punch is halved.
   - The hoverboard power-up: when hud.hoverboardOwned is true (the caller writes it), the hover
     input ('H') activates the board for 30 s, once per run; it forgives one crash and is consumed by
     it. The board rides under the runner with an aqua glow.
   - Hooks: start(spec, seed, opts) with opts.consumables { magnet, jetpack, multiplier } starting
     the run with those power-ups active, opts.hoverboardOwned, opts.onRunEnd({ distance, coins,
     nearMisses, caught }) called once per run at the catch or a quit; ctx carries the same fields
     as defaults. hud gains chase, chaseT, stumble, caught, coinsEarned, nearMissCoins,
     nearMissStreak, streakBonus, nearMissTotal, double, hoverboard { active, until, remaining },
     hoverboardOwned. All of it allocation free per frame.
   v12 (docs/CONTRACT_V12.md "Runner"): touch input. setInput also takes the one-frame swipe edges
     swipeLeft, swipeRight (lanes), swipeUp (jump), swipeDown (a slide: the duck is held for
     SWIPE_DUCK seconds, or the fast fall in the air) and tap (the hoverboard power-up while running
     when owned; on the game-over card a tap runs again). ctx.isTouch (or setTouch(on)) turns the
     'Tap to run' line on: hud.tapLine reads 'Tap to run' on the start screen and the game-over card,
     '' otherwise and off touch. The chaser and everything else unchanged. */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, glow, box, cyl, cone, sphere, torus, plane, canvasTex, decal, pointLight, lerp, clamp, easeInOut } from './depts/common.js';

/* ---------- constants (CONTRACT_V6 and SUBWAY_DESIGN) ---------- */
const LANE_X = [-1.6, 0, 1.6];
const SEG = 24, SLOTS = 8, ROW = 6, FIRST_ROW = 36, AHEAD = 150, BEHIND = 12;
const SPEED0 = 9, SPEED_RATE = 0.35, SPEED_MAX = 24, READY_SCROLL = 3, READY_T = 2.4;
const JUMP_V = 7.5, GRAV = 22, FAST_GRAV = 66, LANE_T = 0.18, SLIDE_MIN = 0.7, SLIDE_RELEASE = 0.08, JUMP_BUFFER = 0.10;
const SWIPE_DUCK = 0.25;      // v12: a swipe down holds the duck this long (a full slide, SLIDE_MIN then the release)
const TAP_LINE = 'Tap to run';
const RUNNER_HW = 0.25, STAND_H = 1.1, SLIDE_H = 0.55;
const APEX = JUMP_V * JUMP_V / (2 * GRAV);   // 1.278
const DUR = { magnet: 8, shield: 25, double: 12, jet: 6 };
const JET_H = 3.2, ROOF_H = 2.0;
const STORE_KEY = 'threadtown.subway.v1';
const TAU = Math.PI * 2;
const COIN_COUNT = 180;
const ROW_SLOTS = 32;
const TIER_HARD = [0, 1, 2, 2];

const NAVY = '#002D4F', AQUA = '#75CCD0', SALMON = '#E7706F', SILVER = '#E2E9EE', WHITE = '#F8F6F0', IRON = '#2E3E50', GOLD = '#F6D463';

/* Same generator as js/aliens3d.js so a seed replays. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Pattern table (SUBWAY_DESIGN "Pattern generator"). Lanes read left, center, right. */
const PATTERNS = [
  { id: 'P01', tier: 1, w: 3, rows: ['B..'] },
  { id: 'P02', tier: 1, w: 3, rows: ['.B.'] },
  { id: 'P03', tier: 1, w: 2, rows: ['S..'] },
  { id: 'P04', tier: 1, w: 2, rows: ['.S.'] },
  { id: 'P05', tier: 1, w: 2, rows: ['T..', 'T..'] },
  { id: 'P06', tier: 1, w: 1, rows: ['.T.', '.T.'] },
  { id: 'P07', tier: 1, w: 1, rows: ['B.S'] },
  { id: 'P08', tier: 2, w: 3, rows: ['BB.'] },
  { id: 'P09', tier: 2, w: 3, rows: ['B.B'] },
  { id: 'P10', tier: 2, w: 2, rows: ['SB.'] },
  { id: 'P11', tier: 2, w: 1, rows: ['SS.'] },
  { id: 'P12', tier: 2, w: 2, rows: ['T.T', 'T.T'], coinCenter: true },
  { id: 'P13', tier: 2, w: 2, rows: ['R..', 'L..', 'L..', 'L..'] },
  { id: 'P14', tier: 2, w: 2, rows: ['T..', 'TB.'] },
  { id: 'P15', tier: 2, w: 1, rows: ['.R.', '.L.', '.L.', '.L.'] },
  { id: 'P16', tier: 3, w: 2, rows: ['BSB'] },
  { id: 'P17', tier: 3, w: 2, rows: ['SBS'] },
  { id: 'P18', tier: 3, w: 2, rows: ['TS.', 'T..'] },
  { id: 'P19', tier: 3, w: 1, rows: ['RT.', 'LT.', 'L..', 'L..'] },
  { id: 'P20', tier: 3, w: 1, rows: ['L.L', 'LSL', 'L.L'] },
  { id: 'P21', tier: 3, w: 2, rows: ['B..', 'BB.', '.B.'], gauntlet: true },
  { id: 'P22', tier: 3, w: 2, rows: ['.S.', 'B.B', '.B.'], gauntlet: true },
  { id: 'P23', tier: 3, w: 1, rows: ['BB.', '...', '..B'] },
];
const KIND_OF = { B: 'barrier', S: 'sign', T: 'train', L: 'train', R: 'ramp' };
const isHardKind = k => k === 'barrier' || k === 'train' || k === 'ramp' || k === 'oncoming';

/* ---------- module scratch (never reallocated) ---------- */
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'XYZ');
const _blocked = [false, false, false];   // shield bounce scratch
/* v10 polish numbers */
const STREAK_Y = 5.0, STREAK_MAX = 3.6;          // streak quads just under the fixtures; longest trail at full speed
const WHOOSH_LEN = 0.35, WHOOSH_RANGE = 1.3;      // near-miss effect length (s) and the pass distance beyond touching
const VIG_HIT_LEN = 0.35;
const FIXTURE_Z = [-3, -9, -15, -21];
/* v11 numbers */
const CHASE_START_LEN = 1.5, CHASE_STUMBLE_LEN = 2.5, CHASE_GAP = 0.8, CATCH_LEN = 1.2, LOOK_BACK_LEN = 0.4;
const CHASE_FAR = 7.5;                 // the gap at which the chasers are out of frame and hidden
const CHASE_NEAR_START = 1.6;          // the start chase's closest gap
const CATCH_GAP = 0.55;                // the inspector's gap while holding the collar
const CATCH_DROP = 0.2;                // a runner caught in the air drops to the ground over this (s)
const RUNNER_SCALE = 1.3;              // the runner's rig scale in the tunnel
const INSP_SCALE = 1.05;               // the inspector at 1.05 of the runner's scale (V11_DESIGN "The chaser look")
const DOG_HEIGHT = 0.45;               // the dog's height as a share of the inspector's
const CLIP_W = 0.25;                   // an arrival overlapping an obstacle by less than this is a side clip
const STUMBLE_SLOW = 0.4, STUMBLE_RECOVER = 0.7, STUMBLE_WOBBLE = 0.5;
const NEAR_PAY = 2, STREAK_STEP = 5, STREAK_BONUS_MAX = 3;
const HOVER_LEN = 30, HOVER_LIFT = 0.12, HOVER_POP = 0.3;
const WOOF_LEN = 0.5, PUFF_LEN = 0.4;
const DOG_STRIDE = 0.55;               // track units per leg cycle
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/* Textures are canvas paintings; without a document (Node tests) the maps stay null. */
const hasDoc = () => typeof document !== 'undefined' && document && typeof document.createElement === 'function';
function tex(w, h, draw) {
  if (!hasDoc()) return null;
  const t = canvasTex(w, h, draw);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function repeatTex(t, rx, ry) {
  if (!t) return t;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  return t;
}
/* Repaint a canvas texture once Kanit resolves (the plaques do the same). */
function whenFonts(t, draw) {
  if (!t || !hasDoc() || !document.fonts || typeof document.fonts.load !== 'function') return;
  try {
    Promise.all([document.fonts.load('600 72px Kanit'), document.fonts.load('500 28px Inter')]).then(() => {
      const c = t.image; if (!c) return;
      draw(c.getContext('2d'), c.width, c.height); t.needsUpdate = true;
    }).catch(() => {});
  } catch (e) { /* no font API */ }
}

/* ---------- painting recipes ---------- */
function paintBrick(ctx, w, h) {
  ctx.fillStyle = '#5B4B46'; ctx.fillRect(0, 0, w, h);
  const cols = ['#7A4E3E', '#86574A', '#6F463A', '#8C5C4C'];
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) ? 32 : 0;
    for (let col = 0; col < 5; col++) {
      let x0 = col * 64 - off; const y0 = row * 32;
      if (x0 >= w) continue;
      ctx.globalAlpha = 0.92; ctx.fillStyle = cols[(row * 7 + col * 3) % 4];
      ctx.fillRect(x0 + 2, y0 + 2, 60, 28);
      if (x0 < 0) ctx.fillRect(x0 + 2 + w, y0 + 2, 60, 28);   // wrap the partial brick
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      for (let d = 0; d < 6; d++) { const r = 1 + Math.random(); ctx.beginPath(); ctx.arc(x0 + 4 + Math.random() * 56, y0 + 4 + Math.random() * 24, r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'; ctx.fillRect(x0 + 2, y0 + 2, 60, 1);
    }
  }
  ctx.filter = 'blur(0.5px)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.filter = 'none';
}
function paintGrit(ctx, w, h) {
  ctx.fillStyle = '#4E4F55'; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = (i & 1) ? '#5C5D63' : '#3F4046';
    ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.filter = 'blur(0.6px)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.filter = 'none';
}
function paintWindows(ctx, w, h) {
  ctx.fillStyle = '#10324F'; ctx.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
    ctx.fillStyle = Math.random() < 0.55 ? '#FFD88A' : '#1E466B';
    ctx.fillRect(3 + c * 16, 1 + r * 16, 10, 14);
  }
}
function posterPainter(title) {
  return (ctx, w, h) => {
    ctx.fillStyle = NAVY; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = AQUA; ctx.fillRect(0, h - 24, w, 24);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '600 72px Kanit, sans-serif'; ctx.fillText(title, w / 2, h * 0.42);
    ctx.fillStyle = SILVER; ctx.font = '500 28px Inter, sans-serif'; ctx.fillText('Running since 2026', w / 2, h * 0.72);
  };
}
function signPainter(text) {
  return (ctx, w, h) => {
    ctx.fillStyle = NAVY; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = AQUA; ctx.fillRect(0, h - 34, w, 10);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '600 54px Kanit, sans-serif'; ctx.fillText(text, w / 2, h * 0.44);
  };
}
function paintStripes(ctx, w, h) {
  ctx.fillStyle = SILVER; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = SALMON;
  for (let x = -h; x < w + h; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h, 0); ctx.lineTo(x + h, 0); ctx.closePath(); ctx.fill();
  }
}
function trainWindowPainter(body) {
  return (ctx, w, h) => {
    ctx.fillStyle = body; ctx.fillRect(0, 0, w, h);
    for (let x = 16; x + 80 <= w; x += 112) {
      ctx.fillStyle = SILVER; ctx.fillRect(x - 4, 30, 88, 68);
      ctx.fillStyle = '#0E2238'; ctx.fillRect(x, 34, 80, 60);
    }
  };
}
function paintChevrons(ctx, w, h) {
  ctx.fillStyle = SILVER; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = SALMON;
  for (let i = 0; i < 6; i++) {
    const y = 60 + i * 160;
    ctx.beginPath(); ctx.moveTo(24, y + 80); ctx.lineTo(w / 2, y); ctx.lineTo(w - 24, y + 80); ctx.lineTo(w - 24, y + 120); ctx.lineTo(w / 2, y + 40); ctx.lineTo(24, y + 120); ctx.closePath(); ctx.fill();
  }
}
function paintDouble(ctx, w, h) {
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = GOLD; ctx.font = '700 84px Kanit, sans-serif'; ctx.fillText('2x', w / 2, h / 2 + 4);
}
function paintShadow(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0, 20, 40, 0.35)'); g.addColorStop(1, 'rgba(0, 20, 40, 0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function paintSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3E5C8E'); g.addColorStop(0.55, '#B98BA0'); g.addColorStop(1, '#E6B79E');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
/* v10: the vignette, clear in the middle and dark toward the corners (the material tints it). */
function paintVignette(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.72);
  g.addColorStop(0, 'rgba(255, 255, 255, 0)');
  g.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)');
  g.addColorStop(0.75, 'rgba(255, 255, 255, 0.62)');
  g.addColorStop(1, 'rgba(255, 255, 255, 1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
/* v10: a light streak, bright at the fixture end (v 0) fading out along its trail (v 1), soft at the sides. */
function paintStreak(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const s = ctx.createLinearGradient(0, 0, w, 0);
  s.addColorStop(0, 'rgba(255, 255, 255, 0)'); s.addColorStop(0.3, 'rgba(255, 255, 255, 1)');
  s.addColorStop(0.7, 'rgba(255, 255, 255, 1)'); s.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = s; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

/* v11: the dog's 'Woof' label, salmon on a clear canvas. */
function paintWoof(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = SALMON; ctx.font = '700 44px Kanit, sans-serif'; ctx.fillText('Woof', w / 2, h / 2 + 2);
}

/* ---------- geometry helpers ---------- */
function geoBox(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function geoSphere(r, x, y, z) { const g = new THREE.SphereGeometry(r, 12, 8); g.translate(x, y, z); return g; }
function merged(list) { const g = BufferGeometryUtils.mergeGeometries(list, false); for (const l of list) l.dispose(); return g; }
/* v10: one streak quad per fixture of every slot (SLOTS * 4 quads) in one geometry, one draw call;
   setStreakSlot rewrites a slot's four quads in place each frame (world z from the slot's scroll). */
function streakGeometry() {
  const n = SLOTS * FIXTURE_Z.length;
  const pos = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), idx = [];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], o * 2);
  }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.Float32BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, STREAK_Y, 0), 1e4);
  return g;
}
/* Slot i's quads at the slot's world z offset; len 0 collapses them (open-air slots, no fixtures). */
function setStreakSlot(geo, i, zOff, len, hw) {
  const a = geo.getAttribute('position').array;
  for (let j = 0; j < FIXTURE_Z.length; j++) {
    const zf = zOff + FIXTURE_Z[j], o = (i * FIXTURE_Z.length + j) * 12;
    const z0 = len > 0 ? zf - 0.15 : zf, z1 = zf + len;
    a[o] = -hw; a[o + 1] = STREAK_Y; a[o + 2] = z0;
    a[o + 3] = hw; a[o + 4] = STREAK_Y; a[o + 5] = z0;
    a[o + 6] = hw; a[o + 7] = STREAK_Y; a[o + 8] = z1;
    a[o + 9] = -hw; a[o + 10] = STREAK_Y; a[o + 11] = z1;
  }
}
function rampGeometry() {
  const A = [-0.65, 0, 0], B = [0.65, 0, 0], C = [-0.65, 0, -4], D = [0.65, 0, -4], E = [-0.65, 2, -4], F = [0.65, 2, -4];
  const tri = [[A, B, F], [A, F, E], [C, E, D], [E, F, D], [A, C, B], [B, C, D], [A, E, C], [B, D, F]];
  const pos = [];
  for (const t of tri) for (const p of t) pos.push(p[0], p[1], p[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function createSubwayGame(ctx) {
  const storage = ctx && ctx.storage ? ctx.storage : { get() { return null; }, set() {} };
  const makeCharacter = ctx && ctx.makeCharacter ? ctx.makeCharacter : () => ({ group: new THREE.Group(), parts: {} });
  const animate = ctx && ctx.animate ? ctx.animate : () => {};
  /* v11: the inspector is built once through ctx.makeChaser (an uncached build; the renderer's runner
     factory keeps one cached handle and would dispose the inspector when the runner is rebuilt) and
     animated through ctx.animateChaser; both fall back to the runner's own. */
  const makeChaser = ctx && ctx.makeChaser ? ctx.makeChaser : makeCharacter;
  const animateChaser = ctx && ctx.animateChaser ? ctx.animateChaser : animate;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 220);
  const group = new THREE.Group();
  scene.add(group);

  /* ---------- live state (one object, numbers reset in start) ---------- */
  const S = {
    built: false, disposed: false, runCount: 0, seed: 0,
    state: 'ready', tReady: 0, tRun: 0, v: SPEED0, traveled: 0, units: 0, time: 0,
    lane: 0, x: 0, x0: 0, xt: 0, laneT: 1, laneDur: LANE_T, laneFrom: 0, switching: false,
    h: 0, vy: 0, airborne: false, fastFall: false, groundY: 0, onRoof: false, onRamp: false,
    sliding: false, slideT: 0, duckHeld: false, duckRelT: 0, duckQueued: false, jumpBuf: -1, boxH: STAND_H,
    shield: false, shieldT: 0, shieldPopT: -1, invulnT: 0, flicker: false,
    puKind: null, puT: 0, puDur: 1, lastPuKind: null, jetFly: false, jetCoinS: 0,
    coins: 0, distance: 0, storedBest: 0, storedLife: 0, storedCoins: 0, best: 0, lifetime: 0, newBest: false,
    cx: 0, shakeT: -1, deathT: 0, fov: 70, w: 0,
    warning: null, coinPulse: 0, hitFlash: false, deadFrame: false, poolWarned: false,
    lastHit: '', lastHitS: 0, spec: null, handle: null,
    // v10: near-miss effect clock and side, the frame's near-miss count, the vignette hit clock,
    // the streak length last written, the coin spin angle, the oncoming gap last frame
    whooshT: -1, whooshSide: 1, nearMiss: 0, vigHitT: -1, streakLen: -1, spin: 0, oncGap: 1,
    // v11: the chase ('none' | 'start' | 'stumble' | 'catch'), its clock, the chasers' gap behind the
    // runner and the last frame's gap, the inspector's and the dog's own run distances (walk cycles),
    // the stumble clock (-1 none), the obstacle last stumbled on, the slow factor, the look back clock,
    // the catch clock and the camera side, the bark clocks and count
    chase: 'none', chaseT: 0, gap: CHASE_FAR, gapPrev: CHASE_FAR, inspDist: 0, dogDist: 0, xPrev: 0,
    stumbleT: -1, stumbleObj: null, stumbleSide: 1, slowK: 0, stumbled: false, lookBackT: -1,
    caught: false, catchT: 0, catchSide: 1, woofT: -1, puffT: -1, woofN: 0,
    // v11 review: the runner's height at the catch and the ground it drops to (a crash in the air)
    catchH0: 0, catchGround: 0,
    // v11: near-miss pay this frame, the run's near-miss count and pay, the streak and its bonus
    nearPay: 0, nearTotal: 0, nearCoins: 0, nearStreak: 0, streakBonus: 0,
    // v11: the hoverboard power-up: active, time left, the activation clock, the pop clock (-1 none),
    // activations this run, forgiven this frame
    hoverOn: false, hoverT: 0, hoverUntil: 0, hoverPopT: -1, hoverUses: 0, hoverPop: false,
    ended: false,
    // v12: touch (the 'Tap to run' line) and the swipe-down duck hold left (seconds)
    touch: !!(ctx && ctx.isTouch), swipeDuckT: 0,
  };
  const input = { left: false, right: false, jump: false, duck: false, restart: false, quit: false, hover: false };
  const hudObj = {
    state: 'ready', distance: 0, coins: 0, best: 0, lifetime: 0, speed: 0, powerUp: null, shield: false, multiplier: 1, countdown: 3, warning: null, coinPulse: 0, hitFlash: false, newBest: false, nearMiss: 0,
    // v11
    chase: 'none', chaseT: 0, stumble: false, caught: false, coinsEarned: 0, nearMissCoins: 0, nearMissStreak: 0, streakBonus: 0, nearMissTotal: 0, double: false,
    hoverboard: { active: false, until: 0, remaining: 0 }, hoverboardOwned: false, hoverPop: false,
    // v12
    tapLine: '',
  };
  const hudPower = { kind: null, remaining: 0, duration: 1 };
  const evQuit = { type: 'quit' };
  const evOver = { type: 'gameover', distance: 0, coins: 0, best: 0, lifetime: 0, nearMisses: 0, caught: false };
  const evEnd = { distance: 0, coins: 0, nearMisses: 0, caught: false };   // v11: the onRunEnd payload, reused
  const fake = { state: 'idle', pose: 'stand', animT: 0, speed: SPEED0, moveDir: { x: 0, z: 1 }, yoff: 0, facing: 1, blinkAt: 0, paused: false, jumpT: 0, lookAt: 0 };
  const inspAgent = { state: 'idle', pose: 'walk', animT: 0, speed: SPEED0, moveDir: { x: 0, z: 1 }, yoff: 0, facing: 1, blinkAt: 0, paused: false, jumpT: 0, lookAt: 0 };
  /* v11 run options: ctx defaults, overridden per run by start(spec, seed, opts). */
  const runOpts = { onRunEnd: null, magnet: false, jetpack: false, multiplier: false, hoverboardOwned: false };
  let rng = mulberry32(1), envRng = mulberry32(2);

  /* ---------- pools and dressing (filled by build) ---------- */
  const slots = [];        // { k, open, tunnel: Group, air: Group, endCap: Mesh, skyPos: Float32BufferAttribute, skySeed }
  const lights = [];       // 6 point lights
  const barriers = [], signs = [], trains = [], ramps = [], powerUps = [];
  const coins = [];        // COIN_COUNT entries
  const rows = [];         // ROW_SLOTS entries, a ring ordered by s
  const rowRing = { head: 0, count: 0 };
  const gen = { nextS: FIRST_ROW, patRows: 0, pendingN: 0, pendingI: 0, emptyNeeded: 0, nextPuS: 0, nextOncS: Infinity, lastRow: null, blockUntil: [0, 0, 0] };
  const pending = [];      // 4 row templates { lanes, trainLen, kinds, pattern, gauntlet, coinCenter, roof }
  const onc = { active: false, lane: 0, sFront: 0, tToHit: 0, mesh: null, light: null, heads: null };
  const fx = {};           // shield, ringPivot, ring, pack, flames, shadow, warn, coinMesh, coinMat, goldMat, hemi, sun, popMat
  /* v11: the chasers and the hoverboard (pooled, built once, hidden when out of the chase) */
  const CH = { insp: null, dog: null, leash: null, puff: null, woof: null, board: null, halo: null, glow: null };
  const env = { lastOpen: 0, nextOpen: 0 };
  let coinCursor = 0;
  const T = {};            // textures and shared materials

  /* ---------- rows ---------- */
  function makeRow() { return { s: 0, lanes: [null, null, null], hard: [false, false, false], trainLen: [0, 0, 0], roof: [false, false, false], tier: 1, pattern: '', used: false, coinLane: -2 }; }
  function rowAt(i) { return rows[(rowRing.head + i) % ROW_SLOTS]; }
  function clearRow(r) { r.s = 0; r.tier = 1; r.pattern = ''; r.used = false; r.coinLane = -2; for (let l = 0; l < 3; l++) { r.lanes[l] = null; r.hard[l] = false; r.trainLen[l] = 0; r.roof[l] = false; } }

  /* ---------- storage ---------- */
  function num(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function readStore() {
    let raw = null;
    try { raw = storage.get(STORE_KEY); } catch (e) { raw = null; }
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    if (!raw || typeof raw !== 'object') raw = null;
    S.storedBest = raw ? num(raw.best) : 0;
    S.storedLife = raw ? num(raw.lifetime) : 0;
    S.storedCoins = raw ? num(raw.coins) : 0;
  }
  function writeStore() {
    S.best = Math.max(S.storedBest, S.distance);
    S.lifetime = S.storedLife + S.distance;
    try { storage.set(STORE_KEY, { best: S.best, lifetime: S.lifetime, coins: S.storedCoins + S.coins }); } catch (e) { /* storage unavailable */ }
  }

  /* ================================================================ */
  /* Build (first start only)                                          */
  /* ================================================================ */
  function build() {
    S.built = true;
    /* Textures */
    T.brick = repeatTex(tex(256, 256, paintBrick), 12, 1.2);
    T.grit = repeatTex(tex(256, 256, paintGrit), 3, 10);
    T.windows = repeatTex(tex(64, 128, paintWindows), 1, 2);
    T.posters = ['Thread Metro', 'Mind the gap', 'Next stop: Thread Town'].map(t => { const p = posterPainter(t); const x = tex(512, 320, p); whenFonts(x, p); return x; });
    T.signs = ['Mind the gap', 'Stand clear', 'Low clearance'].map(t => { const p = signPainter(t); const x = tex(384, 192, p); whenFonts(x, p); return x; });
    T.stripe = tex(256, 64, paintStripes);
    T.chevron = tex(256, 1024, paintChevrons);
    T.double = tex(128, 128, paintDouble); whenFonts(T.double, paintDouble);
    T.shadow = tex(64, 64, paintShadow);
    T.sky = tex(2, 512, paintSky);
    T.vignette = tex(256, 256, paintVignette);
    T.streak = tex(64, 64, paintStreak);
    const bodyCols = [AQUA, SILVER, NAVY];
    T.trainWin = [];
    T.trainGeo = {};

    /* Shared materials */
    T.ballast = mat('#4E4F55', { roughness: 1 }); if (T.grit) T.ballast.map = T.grit;
    T.brickMat = mat('#FFFFFF', { roughness: 0.95 }); if (T.brick) T.brickMat.map = T.brick;
    T.archMat = T.brickMat.clone(); T.archMat.side = THREE.BackSide;
    T.fixture = glow('#FFF1C9', 1.6);
    T.pilaster = mat('#4A3B38', { roughness: 0.95 });
    T.iron = mat('#5A6068', { roughness: 0.55, metalness: 0.2 });
    T.sleeper = mat('#6B5A48', { roughness: 0.9 });
    T.rail = mat('#8C8F94', { roughness: 0.45, metalness: 0.3 });
    T.endCap = mat('#15181E', { roughness: 1 });
    T.concrete = mat('#B9BFC6', { roughness: 0.9 });
    T.ledge = mat('#C9CFD6', { roughness: 0.9 });
    T.skyline = new THREE.MeshBasicMaterial({ map: T.windows || null, color: new THREE.Color('#FFFFFF') });
    T.salmon = mat(SALMON, { roughness: 0.6 });
    T.stone = mat('#B9BFC6');
    T.navy = mat(NAVY, { roughness: 0.6 });
    T.stripeM = mat(SALMON);
    T.roof = mat('#B9BFC6');
    T.ironDark = mat(IRON, { roughness: 0.6 });
    T.white = mat(WHITE, { roughness: 0.4 });
    T.silverMetal = mat(SILVER, { roughness: 0.4, metalness: 0.3 });
    T.bodies = bodyCols.map(c => mat(c, { roughness: 0.5 }));
    T.shieldMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(AQUA), transparent: true, opacity: 0.55, roughness: 0.2, emissive: new THREE.Color(AQUA), emissiveIntensity: 0.4 });
    T.shieldFx = T.shieldMat.clone(); T.shieldFx.opacity = 0.22; T.shieldFx.depthWrite = false;
    T.popMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(AQUA), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    T.warnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(SALMON), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    T.shadowMat = new THREE.MeshBasicMaterial({ map: T.shadow || null, transparent: true, depthWrite: false, opacity: 0.35, color: new THREE.Color(T.shadow ? '#FFFFFF' : '#001428') });
    /* v10: streaks, vignette, train trim */
    T.streakMat = new THREE.MeshBasicMaterial({ map: T.streak || null, color: new THREE.Color('#FFE2A0'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    T.streakGeo = streakGeometry();
    fx.streaks = new THREE.Mesh(T.streakGeo, T.streakMat); fx.streaks.frustumCulled = false; fx.streaks.renderOrder = 3;
    fx.streaks.castShadow = false; fx.streaks.receiveShadow = false; group.add(fx.streaks);
    T.vigMat = new THREE.MeshBasicMaterial({ map: T.vignette || null, color: new THREE.Color('#06111E'), transparent: true, opacity: 0.4, depthTest: false, depthWrite: false });
    T.winFallback = mat('#10324F', { roughness: 0.6 });
    T.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFF1C9'), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    T.beamMatOnc = T.beamMat.clone(); T.beamMatOnc.opacity = 0.3;
    T.tailMat = glow(SALMON, 1.4);

    /* Scene light and air */
    if (T.sky) { scene.background = T.sky; } else { scene.background = new THREE.Color('#B98BA0'); }
    /* v10: the vignette rides in front of the camera (the camera joins the scene so its child renders) */
    scene.add(camera);
    fx.vigBase = new THREE.Color('#06111E'); fx.vigHit = new THREE.Color(SALMON);
    fx.vignette = new THREE.Mesh(T.vignette ? new THREE.PlaneGeometry(1, 1) : new THREE.RingGeometry(0.42, 1.2, 40), T.vigMat);
    fx.vignette.position.set(0, 0, -0.5); fx.vignette.renderOrder = 1000; fx.vignette.frustumCulled = false;
    fx.vignette.castShadow = false; fx.vignette.receiveShadow = false;
    fx.vignette.scale.set(1.05 * camera.aspect, 1.05, 1);
    camera.add(fx.vignette);
    scene.fog = new THREE.Fog(new THREE.Color('#15181E'), 30, 120);
    fx.hemi = new THREE.HemisphereLight(new THREE.Color('#6B7686'), new THREE.Color('#22262C'), 0.7);
    scene.add(fx.hemi);
    fx.sun = new THREE.DirectionalLight(new THREE.Color('#FFD9B0'), 1.6 * 0.25);
    fx.sun.position.set(-0.45, 0.70, 0.55).multiplyScalar(40); fx.sun.castShadow = false;
    scene.add(fx.sun);
    for (let i = 0; i < 6; i++) { const l = pointLight('#FFE2A0', 10, 9, { y: 4.9 }); group.add(l); lights.push(l); }
    fx.hemiSkyT = new THREE.Color('#6B7686'); fx.hemiSkyO = new THREE.Color('#CFE6F5');
    fx.hemiGndT = new THREE.Color('#22262C'); fx.hemiGndO = new THREE.Color('#6E6A72');
    fx.fogT = new THREE.Color('#15181E'); fx.fogO = new THREE.Color('#E6B79E');

    /* Shared track geometries */
    const sleepers = [];
    for (let l = 0; l < 3; l++) for (let i = 0; i < 30; i++) sleepers.push(geoBox(1.2, 0.08, 0.24, LANE_X[l], 0.04, -0.4 - i * 0.8));
    T.sleeperGeo = merged(sleepers);
    const railsG = [];
    for (let l = 0; l < 3; l++) { railsG.push(geoBox(0.06, 0.08, SEG, LANE_X[l] - 0.45, 0.12, -12)); railsG.push(geoBox(0.06, 0.08, SEG, LANE_X[l] + 0.45, 0.12, -12)); }
    T.railGeo = merged(railsG);
    const fixtures = [], pilasters = [];
    for (const z of [-3, -9, -15, -21]) {
      fixtures.push(geoBox(0.9, 0.08, 0.25, 0, 5.05 + 0.04, z));
      pilasters.push(geoBox(0.5, 2.4, 0.3, -3.55, 1.2, z)); pilasters.push(geoBox(0.5, 2.4, 0.3, 3.55, 1.2, z));
    }
    T.fixtureGeo = merged(fixtures); T.pilasterGeo = merged(pilasters);
    const pipes = [];
    for (const x of [-3.45, 3.45]) { const g = new THREE.CylinderGeometry(0.06, 0.06, SEG, 10); g.rotateX(Math.PI / 2); g.translate(x, 2.0, -12); pipes.push(g); }
    T.pipeGeo = merged(pipes);
    const gantry = [];
    for (const z of [-6, -18]) { gantry.push(geoBox(0.3, 5.2, 0.3, -3.8, 2.6, z)); gantry.push(geoBox(0.3, 5.2, 0.3, 3.8, 2.6, z)); gantry.push(geoBox(8.0, 0.2, 0.2, 0, 5.3, z)); }
    T.gantryGeo = merged(gantry);
    T.ledgeGeo = merged([geoBox(2.0, 0.3, SEG, -5.0, 0.15, -12), geoBox(2.0, 0.3, SEG, 5.0, 0.15, -12)]);
    /* Arch: CylinderGeometry theta from pi/2 over pi puts the half tube on local -z; rotation.x = pi/2 maps that to +y, so the arc rises above the floor (checked in the build, no extra pi needed). */
    T.archGeo = new THREE.CylinderGeometry(3.6, 3.6, SEG, 32, 1, true, Math.PI / 2, Math.PI);
    T.unitBox = new THREE.BoxGeometry(1, 1, 1);

    for (let i = 0; i < SLOTS; i++) slots.push(buildSlot(i));

    /* Obstacle pools */
    for (let i = 0; i < 40; i++) barriers.push(buildBarrier(i));
    for (let i = 0; i < 24; i++) signs.push(buildSign(i));
    for (let i = 0; i < 10; i++) trains.push(buildTrain(i, i < 5 ? 12 : 18, T.bodies[i % 3], bodyCols[i % 3], false));
    for (let i = 0; i < 8; i++) ramps.push(buildRamp(i));
    const o = buildTrain(10, 18, T.navy, NAVY, true);
    onc.mesh = o.mesh; onc.light = o.light; onc.heads = o.heads; onc.headMat = o.headMat;
    /* Coins */
    const cg = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20); cg.rotateX(Math.PI / 2);
    fx.coinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(AQUA), emissive: new THREE.Color(AQUA), emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.2 });
    fx.goldMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(GOLD), emissive: new THREE.Color(GOLD), emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.2 });
    fx.coinMesh = new THREE.InstancedMesh(cg, fx.coinMat, COIN_COUNT);
    fx.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fx.coinMesh.frustumCulled = false;
    /* v10: per-coin brightness for the glint */
    fx.coinMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COIN_COUNT * 3).fill(1), 3);
    fx.coinMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(fx.coinMesh);
    for (let i = 0; i < COIN_COUNT; i++) { coins.push({ mode: 0, s: 0, x: 0, y: 0, wx: 0, wy: 0, wz: 0, t: 0 }); hideCoin(i); }
    fx.coinMesh.instanceMatrix.needsUpdate = true;
    /* Power-ups */
    const kinds = ['magnet', 'shield', 'double', 'jet'];
    for (let i = 0; i < 8; i++) powerUps.push(buildPowerUp(kinds[i >> 1]));
    /* Effects */
    fx.shield = sphere(0.85, T.shieldFx, { castShadow: false, receiveShadow: false }); fx.shield.visible = false; group.add(fx.shield);
    fx.ringPivot = new THREE.Group(); fx.ringPivot.rotation.x = Math.PI / 2 + 0.25; fx.ringPivot.visible = false; group.add(fx.ringPivot);
    fx.ring = torus(0.55, 0.03, glow(SALMON, 1.2), { castShadow: false, receiveShadow: false }); fx.ringPivot.add(fx.ring);
    fx.pack = buildPack(); fx.pack.visible = false;
    fx.shadow = plane(0.64, 0.64, T.shadowMat, { rx: -Math.PI / 2, y: 0.012, receiveShadow: false }); group.add(fx.shadow);
    fx.warn = plane(1.2, 40, T.warnMat, { rx: -Math.PI / 2, y: 0.02, z: -20, receiveShadow: false }); fx.warn.visible = false; group.add(fx.warn);
    /* Rows */
    for (let i = 0; i < ROW_SLOTS; i++) rows.push(makeRow());
    for (let i = 0; i < 4; i++) pending.push({ lanes: [null, null, null], trainLen: [0, 0, 0], roof: [false, false, false], pattern: '', gauntlet: false, coinCenter: false });
    /* v11: the chasers, their effects and the hoverboard */
    T.woof = tex(128, 64, paintWoof); whenFonts(T.woof, paintWoof);
    T.woofMat = new THREE.MeshBasicMaterial({ map: T.woof || null, color: new THREE.Color(T.woof ? '#FFFFFF' : SALMON), transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
    T.puffMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(WHITE), transparent: true, opacity: 0.7, depthWrite: false });
    T.leashMat = T.navy;                                     // the leash is a navy line (V11_DESIGN "The chaser look")
    T.coat = mat('#B9C4CC', { roughness: 0.9 });             // the dog's silver grey coat
    T.coatDark = mat('#6E7B86', { roughness: 0.9 });         // its ears, paws, nose and jaw, a darker grey
    T.cream = mat(SILVER, { roughness: 0.9 });               // the belly in the brand silver
    T.brow = mat('#1A2633', { roughness: 0.8 });
    T.tie = mat(SALMON, { roughness: 0.7 });                 // the inspector's salmon tie
    T.tag = mat(AQUA, { roughness: 0.5, metalness: 0.2 });   // the dog's aqua tag
    T.boardMat = mat(SILVER, { roughness: 0.35, metalness: 0.25 });
    T.boardGlow = glow(AQUA, 1.8);
    T.haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(AQUA), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    CH.insp = buildInspector();
    CH.dog = buildDog(CH.insp.height);
    T.leashGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6); T.leashGeo.translate(0, 0.5, 0);
    CH.leash = new THREE.Mesh(T.leashGeo, T.leashMat); CH.leash.castShadow = false; CH.leash.receiveShadow = false; CH.leash.visible = false; group.add(CH.leash);
    CH.puff = sphere(0.08, T.puffMat, { castShadow: false, receiveShadow: false }); CH.puff.visible = false; group.add(CH.puff);
    CH.woof = plane(0.6, 0.3, T.woofMat); CH.woof.visible = false; CH.woof.renderOrder = 4; group.add(CH.woof);
    CH.board = buildBoard(); CH.board.visible = false; group.add(CH.board);
    CH.halo = plane(1.0, 1.5, T.haloMat, { rx: -Math.PI / 2, y: 0.02, receiveShadow: false }); CH.halo.visible = false; CH.halo.renderOrder = 2; group.add(CH.halo);
  }

  function buildSlot(i) {
    const tunnel = new THREE.Group(), air = new THREE.Group();
    group.add(tunnel); group.add(air);
    /* Tunnel */
    plane(7.2, SEG, T.ballast, { rx: -Math.PI / 2, y: 0, z: -12, parent: tunnel, receiveShadow: false });
    box(0.4, 2.4, SEG, T.brickMat, { x: -3.8, y: 0, z: -12, parent: tunnel });
    box(0.4, 2.4, SEG, T.brickMat, { x: 3.8, y: 0, z: -12, parent: tunnel });
    const arch = new THREE.Mesh(T.archGeo, T.archMat); arch.rotation.x = Math.PI / 2; arch.scale.set(1, 1, 0.78); arch.position.set(0, 2.4, -12); tunnel.add(arch);
    tunnel.add(new THREE.Mesh(T.fixtureGeo, T.fixture));
    tunnel.add(new THREE.Mesh(T.pilasterGeo, T.pilaster));
    tunnel.add(new THREE.Mesh(T.pipeGeo, T.iron));
    tunnel.add(new THREE.Mesh(T.sleeperGeo, T.sleeper));
    tunnel.add(new THREE.Mesh(T.railGeo, T.rail));
    decal(1.6, 1.0, T.posters[i % 3], { x: -3.58, y: 1.6, z: -12, ry: Math.PI / 2, emissive: 0.15, parent: tunnel });
    const endCap = plane(7.6, 5.4, T.endCap, { x: 0, y: 2.7, z: -24, parent: tunnel }); endCap.visible = false;
    /* Open air */
    plane(7.2, SEG, T.ballast, { rx: -Math.PI / 2, y: 0, z: -12, parent: air, receiveShadow: false });
    box(0.4, 1.0, SEG, T.concrete, { x: -3.8, y: 0, z: -12, parent: air });
    box(0.4, 1.0, SEG, T.concrete, { x: 3.8, y: 0, z: -12, parent: air });
    air.add(new THREE.Mesh(T.ledgeGeo, T.ledge));
    const skyGeos = [];
    for (let j = 0; j < 20; j++) skyGeos.push(new THREE.BoxGeometry(1, 1, 1));
    const skyGeo = merged(skyGeos);
    const sky = new THREE.Mesh(skyGeo, T.skyline); sky.frustumCulled = false; air.add(sky);
    air.add(new THREE.Mesh(T.gantryGeo, T.iron));
    air.add(new THREE.Mesh(T.sleeperGeo, T.sleeper));
    air.add(new THREE.Mesh(T.railGeo, T.rail));
    air.visible = false;
    return { k: i, open: false, tunnel, air, endCap, skyGeo, skyPos: skyGeo.getAttribute('position'), skyBase: T.unitBox.getAttribute('position') };
  }
  /* Rewrite the slot's skyline in place from the slot's own rng (no reallocation). */
  function paintSkyline(slot) {
    const r = mulberry32((S.seed ^ Math.imul(slot.k, 977)) >>> 0);
    const base = slot.skyBase.array, out = slot.skyPos.array;
    for (let j = 0; j < 20; j++) {
      const side = j < 10 ? -1 : 1, jj = j % 10;
      const w = 2 + 2 * r(), h = 4 + 7 * r(), d = 2, x = side * (9 + 6 * r()), z = -1.2 - 2.4 * jj;
      for (let vtx = 0; vtx < 24; vtx++) {
        const o = (j * 24 + vtx) * 3;
        out[o] = base[vtx * 3] * w + x; out[o + 1] = base[vtx * 3 + 1] * h + h / 2; out[o + 2] = base[vtx * 3 + 2] * d + z;
      }
    }
    slot.skyPos.needsUpdate = true;
  }
  function buildBarrier(i) {
    const g = new THREE.Group(); g.visible = false; group.add(g);
    box(1.3, 0.12, 0.45, T.stone, { parent: g });
    box(1.2, 0.78, 0.35, T.salmon, { y: 0.12, radius: 0.04, parent: g });
    decal(1.16, 0.3, T.stripe, { y: 0.62, z: 0.18, parent: g });
    return { kind: 'barrier', lane: 0, s0: 0, s1: 0, y0: 0, y1: 0.9, hw: 0.6, active: false, mesh: g, idx: i, whooshT: -1 };
  }
  function buildSign(i) {
    const g = new THREE.Group(); g.visible = false; group.add(g);
    box(1.3, 0.7, 0.08, T.navy, { y: 1.1, radius: 0.03, parent: g });
    decal(1.2, 0.6, T.signs[i % 3], { y: 1.45, z: 0.05, parent: g });
    const rods = new THREE.Group(); g.add(rods);
    cyl(0.03, 0.03, 3.2, T.iron, { x: -0.5, y: 1.8, seg: 8, parent: rods });
    cyl(0.03, 0.03, 3.2, T.iron, { x: 0.5, y: 1.8, seg: 8, parent: rods });
    const posts = new THREE.Group(); g.add(posts);
    cyl(0.04, 0.04, 1.8, T.iron, { x: -0.8, seg: 8, parent: posts });
    cyl(0.04, 0.04, 1.8, T.iron, { x: 0.8, seg: 8, parent: posts });
    box(1.7, 0.1, 0.1, T.iron, { y: 1.8, parent: posts });
    return { kind: 'sign', lane: 0, s0: 0, s1: 0, y0: 1.1, y1: 1.8, hw: 0.65, active: false, mesh: g, rods, posts, idx: i, whooshT: -1 };
  }
  /* v10: the merged trim geometries of a train of length L, built once per length and shared. */
  function trainGeoFor(L) {
    let tg = T.trainGeo[L];
    if (tg) return tg;
    const roof = [geoBox(1.3, 0.08, L, 0, 2.04, 0)];
    for (let z = -L / 2 + 1.5; z < L / 2 - 1; z += 3) roof.push(geoBox(0.5, 0.1, 0.9, 0, 2.13, z));
    const iron = [
      geoBox(1.2, 0.3, 1.6, 0, 0.2, L / 2 - 1.2), geoBox(1.2, 0.3, 1.6, 0, 0.2, -(L / 2 - 1.2)),
      geoBox(1.3, 0.12, 0.12, 0, 0.5, L / 2 + 0.04), geoBox(1.3, 0.12, 0.12, 0, 0.5, -(L / 2 + 0.04)),
      geoBox(0.16, 0.16, 0.3, 0, 0.45, L / 2 + 0.12), geoBox(0.16, 0.16, 0.3, 0, 0.45, -(L / 2 + 0.12)),
    ];
    // door seams ride in the bogie geometry (one iron draw) and the lit cab face in the headlight geometry
    for (const dz of [-L / 4, L / 4]) for (const x of [-0.71, 0.71]) for (const e of [-0.45, 0.45]) iron.push(geoBox(0.02, 1.3, 0.04, x, 0.85, dz + e));
    const beamL = new THREE.ConeGeometry(0.42, 2.4, 12, 1, true); beamL.rotateX(-Math.PI / 2); beamL.translate(-0.45, 1.2, L / 2 + 1.2);
    const beamR = new THREE.ConeGeometry(0.42, 2.4, 12, 1, true); beamR.rotateX(-Math.PI / 2); beamR.translate(0.45, 1.2, L / 2 + 1.2);
    const cab = () => geoBox(1.2, 0.6, 0.06, 0, 1.55, L / 2 + 0.01);
    tg = {
      roof: merged(roof), iron: merged(iron),
      heads: merged([geoSphere(0.08, -0.45, 1.2, L / 2 + 0.02), geoSphere(0.08, 0.45, 1.2, L / 2 + 0.02), cab()]),
      headsBig: merged([geoSphere(0.11, -0.45, 1.2, L / 2 + 0.02), geoSphere(0.11, 0.45, 1.2, L / 2 + 0.02), cab()]),
      beams: merged([beamL, beamR]),
      tails: merged([geoSphere(0.06, -0.45, 1.2, -(L / 2 + 0.02)), geoSphere(0.06, 0.45, 1.2, -(L / 2 + 0.02))]),
    };
    T.trainGeo[L] = tg;
    return tg;
  }
  function trim(parent, geo, material) {
    const m = new THREE.Mesh(geo, material); m.castShadow = false; m.receiveShadow = false; parent.add(m); return m;
  }
  /* v10 train: rounded body, roof with vents, bogies with bumpers, couplers and door seams, the
     brand stripe, lit window strips both sides (a flat navy strip without a document), a lit cab
     face with two headlights and their beams toward the runner, and tail lights at the far end.
     Nine draw calls per train, as before the polish. */
  function buildTrain(i, L, bodyMat, bodyHex, oncoming) {
    const g = new THREE.Group(); g.visible = false; group.add(g);
    const tg = trainGeoFor(L);
    const winTex = repeatTex(tex(1024, 128, trainWindowPainter(bodyHex)), L / 8, 1); T.trainWin.push(winTex);
    box(1.4, 1.9, L, bodyMat, { y: 0.1, radius: 0.12, parent: g });
    trim(g, tg.roof, T.roof);
    trim(g, tg.iron, T.iron);
    if (winTex) {
      decal(L, 0.5, winTex, { x: 0.71, y: 1.3, ry: Math.PI / 2, emissive: 0.3, parent: g });
      decal(L, 0.5, winTex, { x: -0.71, y: 1.3, ry: -Math.PI / 2, emissive: 0.3, parent: g });
    } else {
      plane(L, 0.5, T.winFallback, { x: 0.71, y: 1.3, ry: Math.PI / 2, parent: g });
      plane(L, 0.5, T.winFallback, { x: -0.71, y: 1.3, ry: -Math.PI / 2, parent: g });
    }
    box(1.42, 0.08, L, T.stripeM, { y: 1.0, parent: g });
    const headMat = glow('#FFF1C9', oncoming ? 3 : 1.2);
    const heads = trim(g, oncoming ? tg.headsBig : tg.heads, headMat);
    const beams = trim(g, tg.beams, oncoming ? T.beamMatOnc : T.beamMat); beams.renderOrder = 2;
    trim(g, tg.tails, T.tailMat);
    let light = null;
    if (oncoming) light = pointLight('#FFF1C9', 20, 14, { y: 1.2, z: L / 2 + 0.1, parent: g });
    return { kind: 'train', lane: 0, s0: 0, s1: 0, y0: 0, y1: ROOF_H, hw: 0.7, active: false, mesh: g, len: L, hasRamp: false, idx: i, heads, headMat, beams, light, whooshT: -1 };
  }
  function buildRamp(i) {
    const g = new THREE.Group(); g.visible = false; group.add(g);
    const wedge = new THREE.Mesh(i === 0 ? (T.rampGeo = rampGeometry()) : T.rampGeo, T.concrete); g.add(wedge);
    /* The slope normal is (0, 2, 1) normalized; a +z facing plane turned rx = -atan2(4, 2) matches it (the design's -atan(2 / 4) would face mostly +z). */
    decal(1.2, 4.4, T.chevron, { rx: -Math.atan2(4, 2), y: 1.0 + 0.009, z: -2 + 0.0045, parent: g });
    return { kind: 'ramp', lane: 0, s0: 0, s1: 0, y0: 0, y1: 2, hw: 0.65, active: false, mesh: g, idx: i, whooshT: -1 };
  }
  function buildPack() {
    const g = new THREE.Group();
    box(0.32, 0.5, 0.3, T.silverMetal, { y: -0.25, radius: 0.08, parent: g, castShadow: false });
    const flames = [];
    for (const x of [-0.08, 0.08]) {
      const n = cone(0.08, 0.14, T.iron, { x, y: -0.39, parent: g, castShadow: false }); n.rotation.x = Math.PI;
      const f = cone(0.07, 0.2, glow(SALMON, 1.5), { x, y: -0.59, parent: g, castShadow: false }); f.rotation.x = Math.PI; flames.push(f);
    }
    g.userData.flames = flames;
    return g;
  }
  function buildPowerUp(kind) {
    const g = new THREE.Group(); g.visible = false; group.add(g);
    const cube = box(0.5, 0.5, 0.5, T.white, { y: -0.25, radius: 0.12, parent: g, castShadow: false });
    if (kind === 'magnet') {
      const tg = new THREE.TorusGeometry(0.16, 0.05, 10, 24, Math.PI);
      const horse = new THREE.Mesh(tg, T.salmon); horse.position.set(0, 0.02, 0.27); g.add(horse);
      box(0.1, 0.08, 0.1, mat(SILVER), { x: -0.16, y: -0.06, z: 0.22, parent: g, castShadow: false });
      box(0.1, 0.08, 0.1, mat(SILVER), { x: 0.16, y: -0.06, z: 0.22, parent: g, castShadow: false });
    } else if (kind === 'shield') {
      sphere(0.28, T.shieldMat, { parent: g, castShadow: false });
    } else if (kind === 'double') {
      decal(0.42, 0.42, T.double, { z: 0.26, parent: g });
    } else {
      const p = buildPack(); p.position.set(0, 0.25, 0); g.add(p);
    }
    return { kind, active: false, s: 0, lane: 0, y: 0.9, mesh: g, cube, popping: false, popT: 0 };
  }

  /* ---------- v11: the chasers and the hoverboard ---------- */
  /* The inspector: the runner's own rig style (ctx.makeCharacter, an alien in navy), a cap with a
     salmon band and a silver badge on the head top, two grumpy brows over the eyes. The cap sits on
     the rig's measured top (the alien shapes vary), in the head group so it turns with the head. */
  function buildInspector() {
    const h = makeChaser({ name: 'Inspector', color: NAVY, kind: 'alien' });
    const g = h.group || new THREE.Group();
    g.rotation.order = 'YXZ'; g.rotation.set(0, 0, 0); g.scale.setScalar(1);
    g.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(g);            // build time only
    const top = Number.isFinite(box3.max.y) ? box3.max.y : 0.9;
    const parts = h.parts || {};
    /* v11 review: the uniform coat's trim (V11_DESIGN "The chaser look"): two rows of silver buttons
       down the front, a salmon tie under the neck, silver cuffs at the wrists. The body's front is
       measured on the unrotated rig at build time (the alien shapes vary) as an ellipsoid in the
       torso frame, so each button sits on the surface at its own height. */
    const torso = h.torso || (parts.body && parts.body.parent) || g;
    if (parts.body && torso.isObject3D) {
      const bb = new THREE.Box3().setFromObject(parts.body);
      torso.getWorldPosition(_v);
      if (Number.isFinite(bb.max.y) && Number.isFinite(bb.max.z)) {
        const cy = (bb.max.y + bb.min.y) / 2 - _v.y, cz = (bb.max.z + bb.min.z) / 2 - _v.z, cx = (bb.max.x + bb.min.x) / 2 - _v.x;
        const ry = Math.max(1e-3, (bb.max.y - bb.min.y) / 2), rz = Math.max(1e-3, (bb.max.z - bb.min.z) / 2);
        const frontZ = y => cz + rz * Math.sqrt(Math.max(0, 1 - Math.pow((y - cy) / ry, 2)));
        for (let i = 0; i < 3; i++) {
          const y = cy + ry * (0.28 - 0.26 * i);
          for (const sx of [-1, 1]) sphere(0.018, T.silverMetal, { x: cx + sx * 0.05, y, z: frontZ(y) + 0.008, parent: torso, castShadow: false, ws: 10, hs: 6 });
        }
        const tieTop = cy + ry * 0.72, tieLen = ry * 0.5;
        const tie = box(0.038, tieLen, 0.012, T.tie, { x: cx, y: tieTop - tieLen, z: frontZ(tieTop - tieLen * 0.5) + 0.004, parent: torso, castShadow: false });
        tie.rotation.x = Math.atan2(frontZ(tieTop) - frontZ(tieTop - tieLen), tieLen) * 0.5;
      }
    }
    for (const hand of [parts.handL, parts.handR]) if (hand && hand.isObject3D) cyl(0.052, 0.052, 0.03, T.silverMetal, { y: 0.012, parent: hand, seg: 12, castShadow: false });
    g.rotation.set(0, Math.PI, 0);
    g.updateMatrixWorld(true);
    const headG = h.headGroup || (parts.head && parts.head.parent) || g;
    headG.getWorldPosition(_v);
    const ly = top - _v.y;                                     // the rig top in head group units
    const cap = new THREE.Group(); cap.position.set(0, ly - 0.03, 0); headG.add(cap);
    cyl(0.2, 0.215, 0.07, T.navy, { parent: cap, seg: 20 });
    cyl(0.205, 0.205, 0.022, T.salmon, { parent: cap, seg: 20, castShadow: false });
    box(0.26, 0.016, 0.15, T.navy, { y: 0.0, z: 0.2, parent: cap, castShadow: false });
    sphere(0.025, T.silverMetal, { y: 0.045, z: 0.2, parent: cap, castShadow: false });
    const ep = h.parts && h.parts.eyePivot ? h.parts.eyePivot.position : null;
    const bx = 0.07, by = ep ? ep.y + 0.085 : ly - 0.2, bz = ep ? ep.z + 0.02 : 0.18;
    const browL = box(0.09, 0.024, 0.02, T.brow, { x: -bx, y: by, z: bz, parent: headG, castShadow: false }); browL.rotation.z = -0.35;
    const browR = box(0.09, 0.024, 0.02, T.brow, { x: bx, y: by, z: bz, parent: headG, castShadow: false }); browR.rotation.z = 0.35;
    g.scale.setScalar(RUNNER_SCALE * INSP_SCALE); g.visible = false;   // 1.05 of the runner's scale
    group.add(g);
    if (parts.ring) parts.ring.visible = false;   // the alien floor ring, hidden as the renderer hides the player's
    return { handle: h, group: g, cap, armL: parts.armL || null, armR: parts.armR || null, handL: parts.handL || parts.armL || null, headG, height: top * RUNNER_SCALE * INSP_SCALE };
  }
  /* The dog: a small quadruped in the animals3d layout (group > rig > torso > [body, head, front
     legs, tail], rig > hind legs), a silver grey coat, a silver belly, a navy collar with an aqua
     tag, a jaw pivot for the bark, DOG_HEIGHT of the inspector's height. Built from the common
     primitives; about 24 draws, pooled. */
  function buildDog(inspHeight) {
    const g = new THREE.Group(), rig = new THREE.Group(), torso = new THREE.Group();
    g.add(rig); rig.add(torso);
    const DOG_TOP = 0.51;   // the head's top in the dog's own units (head at 0.40, radius 0.11)
    g.scale.setScalar(Number.isFinite(inspHeight) && inspHeight > 0 ? DOG_HEIGHT * inspHeight / DOG_TOP : 1);
    const body = sphere(1, T.coat, { y: 0.30, parent: torso }); body.scale.set(0.16, 0.13, 0.25);
    const belly = sphere(1, T.cream, { y: 0.25, z: 0.02, parent: torso, castShadow: false }); belly.scale.set(0.12, 0.08, 0.19);
    const leg = (parent, x, z) => {
      const p = new THREE.Group(); p.position.set(x, 0.28, z); parent.add(p);
      cyl(0.035, 0.035, 0.26, T.coat, { y: -0.26, parent: p, seg: 8 });
      sphere(0.042, T.coatDark, { y: -0.26, z: 0.02, parent: p, castShadow: false });
      return p;
    };
    const legs = [leg(torso, -0.09, 0.16), leg(torso, 0.09, 0.16), leg(rig, -0.09, -0.16), leg(rig, 0.09, -0.16)];
    const head = new THREE.Group(); head.position.set(0, 0.40, 0.24); torso.add(head);
    sphere(0.11, T.coat, { parent: head });
    box(0.1, 0.07, 0.1, T.coat, { y: -0.065, z: 0.12, parent: head, castShadow: false });
    const nose = sphere(0.025, T.coatDark, { y: 0.0, z: 0.185, parent: head, castShadow: false });
    const jaw = new THREE.Group(); jaw.position.set(0, -0.05, 0.08); head.add(jaw);
    box(0.08, 0.02, 0.09, T.coatDark, { y: -0.02, z: 0.04, parent: jaw, castShadow: false });
    for (const sx of [-1, 1]) {
      const ear = box(0.05, 0.1, 0.03, T.coatDark, { x: sx * 0.09, y: 0.02, z: 0.0, parent: head, castShadow: false }); ear.rotation.z = sx * 0.45;
      sphere(0.022, T.brow, { x: sx * 0.05, y: 0.03, z: 0.095, parent: head, castShadow: false });
    }
    const collar = torus(0.1, 0.02, T.navy, { y: 0.335, z: 0.17, rx: Math.PI / 2 - 0.3, castShadow: false, parent: torso });
    sphere(0.02, T.tag, { y: 0.24, z: 0.22, parent: torso, castShadow: false });
    const tail = new THREE.Group(); tail.position.set(0, 0.34, -0.25); torso.add(tail);
    const tailMesh = cyl(0.015, 0.025, 0.16, T.coat, { parent: tail, seg: 8, castShadow: false }); tailMesh.rotation.x = 0.7; tailMesh.position.set(0, 0.06, -0.05);
    g.visible = false;
    group.add(g);
    return { group: g, rig, torso, head, jaw, nose, legs, collar, tail };
  }
  /* The hoverboard: a rounded silver deck with a navy nose stripe, an aqua glow strip underneath. */
  function buildBoard() {
    const g = new THREE.Group();
    box(0.5, 0.06, 1.0, T.boardMat, { y: 0.06, radius: 0.025, parent: g, castShadow: false });
    box(0.46, 0.012, 0.3, T.navy, { y: 0.12, z: -0.3, parent: g, castShadow: false });
    box(0.4, 0.025, 0.9, T.boardGlow, { y: 0.035, parent: g, castShadow: false, receiveShadow: false });
    return g;
  }

  /* ================================================================ */
  /* Pools                                                             */
  /* ================================================================ */
  function acquire(pool) { for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i]; return null; }
  function freeTrains(len) { let n = 0; for (let i = 0; i < trains.length; i++) if (!trains[i].active && trains[i].len === len) n++; return n; }
  function acquireTrain(len) { for (let i = 0; i < trains.length; i++) if (!trains[i].active && trains[i].len === len) return trains[i]; return null; }
  function release(o) { o.active = false; o.mesh.visible = false; o.whooshT = -1; o.mesh.scale.set(1, 1, 1); if (o.kind === 'train') o.hasRamp = false; }
  function releaseAll() {
    for (const b of barriers) release(b); for (const s of signs) release(s); for (const t of trains) release(t); for (const r of ramps) release(r);
    for (const p of powerUps) { p.active = false; p.popping = false; p.mesh.visible = false; p.mesh.scale.setScalar(1); p.cube.material = T.white; }
    for (let i = 0; i < COIN_COUNT; i++) { coins[i].mode = 0; hideCoin(i); }
    fx.coinMesh.instanceMatrix.needsUpdate = true;
    onc.active = false; onc.mesh.visible = false;
  }
  function poolWarn(name) { if (!S.poolWarned) { S.poolWarned = true; if (typeof console !== 'undefined') console.warn('subway: ' + name + ' pool exhausted, row left empty'); } }

  function hideCoin(i) { _s.set(0, 0, 0); _v.set(0, -5, 0); _q.identity(); _m.compose(_v, _q, _s); fx.coinMesh.setMatrixAt(i, _m); }
  function allocCoin(s, lane, y) {
    for (let n = 0; n < COIN_COUNT; n++) {
      const i = (coinCursor + n) % COIN_COUNT;
      const c = coins[i];
      if (c.mode === 0) { coinCursor = i + 1; c.mode = 1; c.s = s; c.x = LANE_X[lane + 1]; c.y = y; c.t = 0; return c; }
    }
    return null;
  }
  function coinRow(s, lane, count, y) { for (let i = 0; i < count; i++) allocCoin(s + i * 1.5, lane, y); }
  const ARC_Y = [0.6, 1.05, 1.4, 1.55, 1.4, 1.05, 0.6];
  function coinArc(s, lane) { for (let i = 0; i < 7; i++) allocCoin(s - 3 + i, lane, ARC_Y[i]); }

  /* ================================================================ */
  /* Segments and lighting                                             */
  /* ================================================================ */
  function isOpenK(k) {
    if (k < 3) return false;
    while (env.nextOpen < k) { env.lastOpen = env.nextOpen; env.nextOpen = env.lastOpen + 4 + Math.floor(envRng() * 3); }
    return k === env.nextOpen;
  }
  function assignSlot(slot, k) {
    slot.k = k; slot.open = isOpenK(k);
    slot.tunnel.visible = !slot.open; slot.air.visible = slot.open;
    if (slot.open) paintSkyline(slot);
  }
  function resetSegments() {
    env.lastOpen = 0; env.nextOpen = 4 + Math.floor(envRng() * 3);
    for (let i = 0; i < SLOTS; i++) assignSlot(slots[i], i);
  }
  function slotForS(s) { const k = Math.floor(s / SEG); const slot = slots[((k % SLOTS) + SLOTS) % SLOTS]; return slot.k === k ? slot : null; }
  function openAt(s) { const slot = slotForS(s); return slot ? slot.open : false; }
  function updateSegments(dt) {
    let maxK = -1, maxSlot = null;
    for (let i = 0; i < SLOTS; i++) {
      const slot = slots[i];
      if (S.traveled - SEG * slot.k > 34) assignSlot(slot, slot.k + SLOTS);
      const z = S.traveled - SEG * slot.k;
      slot.tunnel.position.z = z; slot.air.position.z = z;
      slot.endCap.visible = false;
      if (slot.k > maxK) { maxK = slot.k; maxSlot = slot; }
    }
    if (maxSlot) maxSlot.endCap.visible = true;
    /* Light pool on the nearest fixtures. */
    const s0 = 3 + 6 * Math.ceil((S.traveled - 6 - 3) / 6);
    for (let i = 0; i < 6; i++) {
      const s = s0 + 6 * i, l = lights[i];
      l.visible = !openAt(s);
      l.position.z = S.traveled - s;
    }
    /* Air blend */
    const inOpen = openAt(S.traveled) ? 1 : 0;
    S.w += (inOpen - S.w) * (1 - Math.exp(-2.5 * dt));
    const w = S.w;
    fx.hemi.color.lerpColors(fx.hemiSkyT, fx.hemiSkyO, w);
    fx.hemi.groundColor.lerpColors(fx.hemiGndT, fx.hemiGndO, w);
    fx.hemi.intensity = lerp(0.7, 1.0, w);
    fx.sun.intensity = 1.6 * (0.25 + 0.75 * w);
    scene.fog.color.lerpColors(fx.fogT, fx.fogO, w);
    scene.fog.near = lerp(30, 60, w); scene.fog.far = lerp(120, 160, w);
    /* v10: the fixtures' streaks lengthen and brighten with speed (one geometry for every slot, its
       quads rewritten in place each frame from the slots' scroll; open-air slots collapse theirs) */
    const sf = speedFactor();
    const len = 0.2 + STREAK_MAX * sf * sf, hw = 0.45 + 0.15 * sf;
    S.streakLen = len;
    for (let i = 0; i < SLOTS; i++) { const slot = slots[i]; setStreakSlot(T.streakGeo, i, slot.tunnel.position.z, slot.open ? 0 : len, hw); }
    T.streakGeo.getAttribute('position').needsUpdate = true;
    T.streakMat.opacity = (0.06 + 0.46 * sf) * (1 - 0.7 * w);
    T.fixture.emissiveIntensity = 1.6 + 1.2 * sf;
  }
  /* 0 at the ready scroll, about 0.17 at the first running speed, 1 at full speed. */
  function speedFactor() { return clamp((S.v - 6) / (SPEED_MAX - 6), 0, 1); }

  /* ================================================================ */
  /* Generator                                                         */
  /* ================================================================ */
  function tierAt(s) {
    if (gen.patRows < 3) return 1;
    const vp = Math.min(SPEED_MAX, S.v + SPEED_RATE * (s - S.traveled) / Math.max(S.v, 1));
    return vp < 13 ? 1 : vp < 18 ? 2 : 3;
  }
  function hardCount(lanes) { let n = 0; for (let l = 0; l < 3; l++) if (isHardKind(lanes[l]) || (onc.active && l === onc.lane + 1)) n++; return n; }
  function laneHard(lanes, l) { return isHardKind(lanes[l]) || (onc.active && l === onc.lane + 1); }
  function reachable(prevLanes, lanes) {
    for (let f = 0; f < 3; f++) {
      if (laneHard(prevLanes, f)) continue;
      for (let g = Math.max(0, f - 1); g <= Math.min(2, f + 1); g++) if (!laneHard(lanes, g)) return true;
    }
    return false;
  }
  const EMPTY_LANES = [null, null, null];
  /* Expand a pattern (optionally mirrored) into the pending templates and validate it against the row stream. */
  function expand(p, mirror, tier, s) {
    const n = p.rows.length;
    for (let i = 0; i < n; i++) {
      const t = pending[i], str = p.rows[i];
      t.pattern = p.id; t.gauntlet = !!p.gauntlet; t.coinCenter = !!p.coinCenter && i === 0;
      for (let l = 0; l < 3; l++) {
        const ch = str[mirror ? 2 - l : l];
        t.lanes[l] = ch === '.' ? null : KIND_OF[ch];
        t.trainLen[l] = 0; t.roof[l] = false;
      }
    }
    /* Train starts and roof flags (a train starts where its lane was not a train in the row before). */
    for (let l = 0; l < 3; l++) {
      for (let i = 0; i < n; i++) {
        const t = pending[i], k = t.lanes[l];
        if (k === 'train') {
          const prevK = i > 0 ? pending[i - 1].lanes[l] : null;
          if (prevK !== 'train') {
            let len = 0; for (let j = i; j < n && pending[j].lanes[l] === 'train'; j++) len++;
            t.trainLen[l] = len * ROW;
            const withRamp = prevK === 'ramp';
            for (let j = i; j < i + len; j++) pending[j].roof[l] = withRamp;
          }
        }
      }
    }
    /* The pools must be able to supply every train the pattern needs. */
    let need12 = 0, need18 = 0;
    for (let i = 0; i < n; i++) for (let l = 0; l < 3; l++) { if (pending[i].trainLen[l] === 12) need12++; else if (pending[i].trainLen[l] === 18) need18++; }
    if ((need12 && need12 > freeTrains(12)) || (need18 && need18 > freeTrains(18))) return false;
    /* Validate */
    let prev = gen.lastRow ? gen.lastRow.lanes : EMPTY_LANES;
    for (let i = 0; i < n; i++) {
      const t = pending[i], si = s + i * ROW;
      if (hardCount(t.lanes) > TIER_HARD[tier]) return false;
      if (onc.active && t.lanes[onc.lane + 1] !== null) return false;
      for (let l = 0; l < 3; l++) {
        if (isHardKind(t.lanes[l]) && gen.blockUntil[l] > si) return false;
        const a = prev[l], b = t.lanes[l];
        if (isHardKind(a) && isHardKind(b)) {
          const same = (a === 'train' && b === 'train') || (a === 'ramp' && b === 'train');
          if (!same && !(a === 'barrier' && b === 'barrier' && tier === 3)) return false;
        }
      }
      if (!reachable(prev, t.lanes)) return false;
      prev = t.lanes;
    }
    return true;
  }
  function drawPattern(tier) {
    let total = 0;
    for (const p of PATTERNS) if (p.tier <= tier) total += p.w;
    let r = rng() * total;
    for (const p of PATTERNS) { if (p.tier > tier) continue; r -= p.w; if (r <= 0) return p; }
    return PATTERNS[0];
  }
  function copyTemplate(row, t) {
    for (let l = 0; l < 3; l++) { row.lanes[l] = t.lanes[l]; row.hard[l] = isHardKind(t.lanes[l]); row.trainLen[l] = t.trainLen[l]; row.roof[l] = t.roof[l]; }
    row.pattern = t.pattern; row.coinLane = t.coinCenter ? 0 : -2;
  }
  function genRow() {
    const s = gen.nextS; gen.nextS += ROW;
    /* Take a row slot (recycle the oldest when full). */
    if (rowRing.count === ROW_SLOTS) { rowRing.head = (rowRing.head + 1) % ROW_SLOTS; rowRing.count--; }
    const row = rowAt(rowRing.count); rowRing.count++;
    clearRow(row); row.s = s; row.used = true;
    const tier = tierAt(s); row.tier = tier;
    let wrote = false;
    if (gen.pendingI < gen.pendingN) {
      copyTemplate(row, pending[gen.pendingI++]);
      wrote = true;
      if (gen.pendingI >= gen.pendingN) gen.emptyNeeded = tier === 1 ? 2 : 1;
    } else if (gen.emptyNeeded > 0) {
      gen.emptyNeeded--;
    } else {
      for (let tries = 0; tries < 8; tries++) {
        const p = drawPattern(tier);
        const mirror = rng() < 0.5;
        if (expand(p, mirror, tier, s)) {
          gen.pendingN = p.rows.length; gen.pendingI = 1;
          copyTemplate(row, pending[0]);
          wrote = true;
          if (gen.pendingI >= gen.pendingN) gen.emptyNeeded = tier === 1 ? 2 : 1;
          break;
        }
      }
    }
    if (wrote) gen.patRows++;
    /* Oncoming lane: hard while it lives. */
    if (onc.active) row.hard[onc.lane + 1] = true;
    /* Materialize */
    for (let l = 0; l < 3; l++) {
      const k = row.lanes[l];
      if (k === 'barrier') {
        const b = acquire(barriers);
        if (!b) { row.lanes[l] = null; row.hard[l] = false; poolWarn('barrier'); continue; }
        b.active = true; b.lane = l - 1; b.s0 = s - 0.18; b.s1 = s + 0.18; b.mesh.visible = true; b.mesh.position.x = LANE_X[l];
      } else if (k === 'sign') {
        const g = acquire(signs);
        if (!g) { row.lanes[l] = null; poolWarn('sign'); continue; }
        g.active = true; g.lane = l - 1; g.s0 = s - 0.04; g.s1 = s + 0.04; g.mesh.visible = true; g.mesh.position.x = LANE_X[l];
        const open = openAt(s); g.rods.visible = !open; g.posts.visible = open;
      } else if (k === 'train' && row.trainLen[l] > 0) {
        const t = acquireTrain(row.trainLen[l]);
        if (!t) { row.lanes[l] = null; row.hard[l] = false; row.trainLen[l] = 0; poolWarn('train'); continue; }
        t.active = true; t.lane = l - 1; t.s0 = s; t.s1 = s + t.len; t.hasRamp = row.roof[l]; t.mesh.visible = true; t.mesh.position.x = LANE_X[l];
        gen.blockUntil[l] = s + t.len + 12;
        if (t.hasRamp && rng() < 0.8) coinRow(s + 1, l - 1, 8, 2.6);
      } else if (k === 'ramp') {
        const r = acquire(ramps);
        if (!r) { row.lanes[l] = null; row.hard[l] = false; poolWarn('ramp'); continue; }
        r.active = true; r.lane = l - 1; r.s0 = s + 1.8; r.s1 = s + 5.8; r.mesh.visible = true; r.mesh.position.x = LANE_X[l];
      }
    }
    /* Coins for the previous row now that this one is known. */
    if (gen.lastRow) placeCoins(gen.lastRow, row);
    /* Power-up */
    if (s >= gen.nextPuS) {
      spawnPowerUp(row, gen.lastRow);
      gen.nextPuS = s + 90 + 60 * rng();
    }
    /* Oncoming cadence */
    if (tier >= 2) {
      if (gen.nextOncS === Infinity) gen.nextOncS = s + oncInterval(tier);
      else if (s >= gen.nextOncS && !onc.active && gen.pendingI >= gen.pendingN) { if (spawnOncoming()) gen.nextOncS = s + oncInterval(tier); }
    }
    gen.lastRow = row;
  }
  function clearOncMarks() { for (let i = 0; i < rowRing.count; i++) { const r = rowAt(i); r.hard[onc.lane + 1] = isHardKind(r.lanes[onc.lane + 1]); } }
  function oncInterval(tier) { return tier === 3 ? 150 + 120 * rng() : 240 + 180 * rng(); }
  function placeCoins(row, next) {
    if (row.coinLane === 0 && row.lanes[1] === null) { coinRow(row.s, 0, 8, 0.6); row.coinLane = -2; return; }
    if (rng() >= 0.65) return;
    let barrierLane = -2, freeN = 0;
    for (let l = 0; l < 3; l++) {
      if (onc.active && l === onc.lane + 1) continue;
      if (row.lanes[l] === 'barrier' && next.lanes[l] === null) barrierLane = l - 1;
      if (row.lanes[l] === null && next.lanes[l] === null) freeN++;
    }
    if (barrierLane !== -2 && rng() < 0.5) { coinArc(row.s, barrierLane); return; }
    if (freeN === 0) return;
    let pick = Math.floor(rng() * freeN), lane = -2;
    for (let l = 0; l < 3; l++) {
      if (onc.active && l === onc.lane + 1) continue;
      if (row.lanes[l] === null && next.lanes[l] === null) { if (pick === 0) { lane = l - 1; break; } pick--; }
    }
    if (lane === -2) return;
    const count = 5 + Math.floor(rng() * 6);
    for (let i = 0; i < count; i++) { const cs = row.s + 0.75 + i * 1.5; if (cs > row.s + 12) break; allocCoin(cs, lane, 0.6); }
  }
  function spawnPowerUp(row, prevRow) {
    let n = 0;
    for (let l = 0; l < 3; l++) if (puLaneOk(row, prevRow, l)) n++;
    if (n === 0) return;
    let kind;
    do { kind = ['magnet', 'shield', 'double', 'jet'][Math.floor(rng() * 4)]; } while (kind === S.lastPuKind);
    S.lastPuKind = kind;
    let pick = Math.floor(rng() * n), lane = 0;
    for (let l = 0; l < 3; l++) if (puLaneOk(row, prevRow, l)) { if (pick === 0) { lane = l; break; } pick--; }
    let p = null;
    for (const q of powerUps) if (q.kind === kind && !q.active) { p = q; break; }
    if (!p) return;
    p.active = true; p.popping = false; p.s = row.s + 3; p.lane = lane - 1;
    p.y = row.lanes[lane] === 'train' && row.roof[lane] ? 2.9 : 0.9;
    p.mesh.visible = true; p.mesh.scale.setScalar(1); p.cube.material = T.white; p.mesh.position.x = LANE_X[lane];
  }
  function puLaneOk(row, prevRow, l) {
    if (onc.active && l === onc.lane + 1) return false;
    if (row.lanes[l] === 'train' && row.roof[l] && row.trainLen[l] === 0) return true;   // a reachable roof, not the first roof row
    if (row.hard[l]) return false;
    if (prevRow && prevRow.hard[l] && prevRow.lanes[l] !== 'train') return false;
    return true;
  }
  function spawnOncoming() {
    /* Lane choice: no train or ramp ahead within 100 units, never the only free lane of any row in the window, chain reachable. */
    let n = 0; const ok0 = oncLaneOk(0), ok1 = oncLaneOk(1), ok2 = oncLaneOk(2);
    if (ok0) n++; if (ok1) n++; if (ok2) n++;
    if (n === 0) return false;
    let pick = Math.floor(rng() * n);
    const lane = ok0 && pick-- === 0 ? 0 : ok1 && pick-- === 0 ? 1 : 2;
    onc.active = true; onc.lane = lane - 1; onc.sFront = S.traveled + 90; onc.tToHit = 0;
    onc.mesh.visible = true; onc.mesh.position.x = LANE_X[lane];
    for (let i = 0; i < rowRing.count; i++) { const r = rowAt(i); if (r.s >= S.traveled) r.hard[lane] = true; }
    return true;
  }
  function oncLaneOk(l) {
    let prevFree = -1;
    for (let i = 0; i < rowRing.count; i++) {
      const r = rowAt(i);
      if (r.s < S.traveled - ROW) continue;
      if (r.lanes[l] === 'train' || r.lanes[l] === 'ramp') return false;
      let free = 0, anyReach = false;
      for (let g = 0; g < 3; g++) {
        if (g === l || r.hard[g]) continue;
        free++;
        if (prevFree === -1 || Math.abs(g - prevFree) <= 1) anyReach = true;
      }
      if (free === 0) return false;
      if (!anyReach) return false;
      /* Remember any free lane that keeps the chain open (the nearest to the previous). */
      let best = -1;
      for (let g = 0; g < 3; g++) if (g !== l && !r.hard[g] && (prevFree === -1 || Math.abs(g - prevFree) <= 1)) { if (best === -1 || Math.abs(g - 1) < Math.abs(best - 1)) best = g; }
      prevFree = best;
    }
    return true;
  }
  function fillRows() {
    while (gen.nextS < S.traveled + AHEAD) genRow();
    while (rowRing.count > 0 && rowAt(0).s < S.traveled - BEHIND) { rowRing.head = (rowRing.head + 1) % ROW_SLOTS; rowRing.count--; }
  }
  function rowContaining(s) {
    for (let i = 0; i < rowRing.count; i++) { const r = rowAt(i); if (s >= r.s && s < r.s + ROW) return r; }
    return null;
  }
  function recycleObstacles() {
    const lim = S.traveled - BEHIND;
    for (const b of barriers) if (b.active && b.s1 < lim) release(b);
    for (const g of signs) if (g.active && g.s1 < lim) release(g);
    for (const t of trains) if (t.active && t.s1 < lim) release(t);
    for (const r of ramps) if (r.active && r.s1 < lim) release(r);
    for (const p of powerUps) if (p.active && !p.popping && p.s < lim) { p.active = false; p.mesh.visible = false; }
  }

  /* ================================================================ */
  /* Runner                                                            */
  /* ================================================================ */
  function buildRunner(spec) {
    if (S.handle && S.handle.group) { S.handle.group.remove(fx.pack); group.remove(S.handle.group); }
    S.spec = spec;
    const h = makeCharacter(spec);
    S.handle = h;
    const g = h.group;
    g.scale.setScalar(RUNNER_SCALE);
    g.rotation.order = 'YXZ';
    g.rotation.set(0, Math.PI, 0);
    g.position.set(0, 0, 0);
    g.visible = true;
    /* The group is turned rotation.y = pi, so local -z is world +z: the back, toward the camera. */
    fx.pack.position.set(0, 0.75 / 1.3, -0.32 / 1.3); fx.pack.scale.setScalar(1 / 1.3);
    g.add(fx.pack);
    group.add(g);
  }
  function setRunnerVisible(on) {
    if (S.handle && typeof S.handle.setOpacity === 'function') S.handle.setOpacity(on ? 1 : 0.4);
    else if (S.handle) S.handle.group.visible = on;
  }

  function startJump() { S.vy = JUMP_V; S.airborne = true; S.fastFall = false; S.onRoof = false; S.onRamp = false; endSlide(); S.jumpBuf = -1; }
  function startSlide() { S.sliding = true; S.slideT = 0; S.boxH = SLIDE_H; S.duckRelT = -1; }
  function endSlide() { S.sliding = false; S.boxH = STAND_H; }

  function stepRunner(dt, scroll) {
    S.xPrev = S.x;   // v11: the stumble test reads last frame's x
    /* Lane inputs */
    if (input.left || input.right) {
      const target = clamp(S.lane + (input.right ? 1 : 0) - (input.left ? 1 : 0), -1, 1);
      if (target !== S.lane) { S.laneFrom = S.lane; S.lane = target; S.x0 = S.x; S.xt = LANE_X[target + 1]; S.laneT = 0; S.laneDur = LANE_T; S.switching = true; }
    }
    if (S.switching) {
      S.laneT += dt;
      const k = Math.min(1, S.laneT / S.laneDur);
      S.x = S.x0 + (S.xt - S.x0) * easeInOut(k);
      if (k >= 1) { S.switching = false; S.x = S.xt; }
    }
    /* Duck and jump inputs */
    S.duckHeld = !!input.duck;
    if (input.jump) {
      if (S.jetFly) { /* jet ignores jumps */ }
      else if (!S.airborne) startJump();
      else S.jumpBuf = JUMP_BUFFER;
    }
    if (S.jumpBuf > 0) S.jumpBuf -= dt;
    if (S.duckHeld && !S.jetFly) {
      if (S.airborne) S.fastFall = true;
      else if (!S.sliding) startSlide();
    }
    if (S.sliding) {
      S.slideT += dt;
      if (!S.duckHeld && S.slideT >= SLIDE_MIN) {
        if (S.duckRelT < 0) S.duckRelT = 0; else S.duckRelT += dt;
        if (S.duckRelT >= SLIDE_RELEASE) endSlide();
      } else S.duckRelT = -1;
    }
    /* Ground under the runner: ramps then roofs. */
    let gy = 0, rampHit = false;
    S.onRamp = false;
    for (const r of ramps) {
      if (!r.active) continue;
      if (Math.abs(S.x - LANE_X[r.lane + 1]) >= r.hw + RUNNER_HW) continue;
      /* The slope plateaus at roof height for one unit past its end so a fast frame cannot drop the
         runner into the 0.2 unit gap before the train face. */
      if (S.traveled < r.s0 || S.traveled > r.s1 + 1) continue;
      const ry = ROOF_H * clamp((S.traveled - r.s0) / 4, 0, 1);
      if (ry > gy) { gy = ry; S.onRamp = true; }
      /* Only a lane switch into the ramp halfway up is a hit; a runner in the ramp lane lands on the slope. */
      if (ry - S.h > 0.4 && S.switching && S.laneFrom !== r.lane && !S.jetFly) rampHit = true;
    }
    let roofTrain = null;
    if (S.h >= ROOF_H - 0.15 || gy >= ROOF_H - 0.15) {
      for (const tr of trains) {
        if (!tr.active) continue;
        if (Math.abs(S.x - LANE_X[tr.lane + 1]) >= tr.hw + RUNNER_HW) continue;
        if (S.traveled < tr.s0 - RUNNER_HW || S.traveled > tr.s1 + RUNNER_HW) continue;
        if (S.h >= ROOF_H - 0.15 || gy >= ROOF_H - 0.15) { gy = Math.max(gy, ROOF_H); roofTrain = tr; }
      }
    }
    S.groundY = gy;
    /* Vertical motion */
    if (S.jetFly) {
      S.h += (JET_H - S.h) * (1 - Math.exp(-10 * dt));
      if (S.h > JET_H) S.h = JET_H;
      S.airborne = false; S.vy = 0;
    } else if (S.airborne) {
      const g = S.fastFall ? FAST_GRAV : GRAV;
      S.h += S.vy * dt - 0.5 * g * dt * dt;
      S.vy -= g * dt;
      if (S.h <= gy && (S.vy <= 0 || S.onRamp)) {
        S.h = gy; S.vy = 0; S.airborne = false;
        const wasFast = S.fastFall; S.fastFall = false;
        if (S.jumpBuf > 0) startJump();
        else if (S.duckHeld || wasFast) startSlide();
      }
    } else {
      if (gy > S.h + 1e-6) {
        if (rampHit) { /* handled as a hit below */ } else S.h = gy;
      } else if (S.h - gy > 0.05) { S.airborne = true; S.vy = 0; S.fastFall = false; }
      else S.h = gy;
    }
    S.onRoof = roofTrain !== null && !S.airborne;
    if (rampHit) hit('ramp', null);
    return roofTrain;
  }

  function zOverlap(s0, s1, extra) { return (S.traveled - s0 > -RUNNER_HW) && (S.traveled - extra - s1 < RUNNER_HW); }
  function xOverlap(lane, hw) { return Math.abs(S.x - LANE_X[lane + 1]) < hw + RUNNER_HW; }
  function collide(scroll, dt, roofTrain) {
    if (S.state !== 'running') return;
    if (S.invulnT > 0) return;
    if (S.jetFly && S.h >= 2.2) return;
    const top = S.h + S.boxH;
    if (S.stumbleObj && (!S.stumbleObj.active || S.stumbleObj.s1 < S.traveled - 1)) S.stumbleObj = null;
    for (const b of barriers) {
      if (!b.active || b === S.stumbleObj || !xOverlap(b.lane, b.hw) || !zOverlap(b.s0, b.s1, scroll)) continue;
      if (S.h < 0.6) { if (isClip(b)) stumble('barrier', b); else hit('barrier', b); return; }
    }
    for (const g of signs) {
      if (!g.active || g === S.stumbleObj || !xOverlap(g.lane, g.hw) || !zOverlap(g.s0, g.s1, scroll)) continue;
      if (top > g.y0 - 0.02 && S.h < g.y1) { if (isClip(g)) stumble('sign', g); else hit('sign', g); return; }
    }
    for (const tr of trains) {
      if (!tr.active || tr === roofTrain || !xOverlap(tr.lane, tr.hw) || !zOverlap(tr.s0, tr.s1, scroll)) continue;
      if (S.h < ROOF_H - 0.05) { hit('train', tr); return; }
    }
    if (onc.active && xOverlap(onc.lane, 0.7) && zOverlap(onc.sFront, onc.sFront + 18, scroll + 8 * dt) && S.h < ROOF_H) { hit('oncoming', null); }
  }
  /* v11: a barrier or a sign contact is a side clip (a stumble, not a crash) when the runner had no
     x overlap with it last frame (a sideways swipe into its side or post) or arrives overlapping it by
     less than CLIP_W (the edge of the box on the edge of the obstacle). */
  function isClip(o) {
    const lx = LANE_X[o.lane + 1], touch = o.hw + RUNNER_HW;
    const dx = Math.abs(S.x - lx), dxPrev = Math.abs(S.xPrev - lx);
    return dxPrev >= touch - 1e-3 || dx >= touch - CLIP_W;
  }
  /* Ease the runner to a lane over dur seconds (the shield bounce, the stumble push, the forgiven crash). */
  function bounceTo(target, dur) {
    if (target === S.lane && !S.switching && Math.abs(S.x - LANE_X[target + 1]) < 1e-3) return;
    S.laneFrom = S.switching ? S.laneFrom : S.lane; S.lane = target; S.x0 = S.x; S.xt = LANE_X[target + 1]; S.laneT = 0; S.laneDur = dur; S.switching = true;
  }
  /* The nearest lane clear of anything solid within the next 6 units (the row under the runner may
     not hold the obstacle just hit, a train face sits in the next row, so the live pools are read too). */
  function freeLane() {
    if (S.switching) return S.laneFrom;
    const row = rowContaining(S.traveled);
    for (let l = 0; l < 3; l++) _blocked[l] = (row ? row.hard[l] : false) || (onc.active && l === onc.lane + 1);
    for (const tr of trains) if (tr.active && tr.s0 < S.traveled + 6 && tr.s1 > S.traveled - RUNNER_HW) _blocked[tr.lane + 1] = true;
    for (const r of ramps) if (r.active && r.s0 < S.traveled + 6 && r.s1 > S.traveled - RUNNER_HW) _blocked[r.lane + 1] = true;
    let bestD = 9, target = S.lane;
    for (let l = 0; l < 3; l++) {
      if (_blocked[l]) continue;
      const d = Math.abs(l - 1 - S.lane);
      if (d < bestD) { bestD = d; target = l - 1; }
    }
    return target;
  }
  /* A stumble: the runner slows (STUMBLE_SLOW, recovering over STUMBLE_RECOVER), is pushed to the
     lane beside the obstacle, looks back for LOOK_BACK_LEN, and the chasers close in for
     CHASE_STUMBLE_LEN at CHASE_GAP behind; a second stumble while they are there is a catch. */
  function stumble(kind, obj) {
    if (S.state !== 'running' || S.invulnT > 0) return;
    if (S.chase === 'stumble') { hit(kind, obj); return; }
    const lx = LANE_X[obj.lane + 1];
    S.stumbleObj = obj; S.stumbleT = 0; S.stumbled = true; S.stumbleSide = S.x < lx ? -1 : 1;
    S.slowK = STUMBLE_SLOW; S.lookBackT = 0; S.lastHit = kind; S.lastHitS = obj.s0;
    S.nearStreak = 0; S.streakBonus = 0;
    S.shakeT = 0.3;   // the tail of the shake only: a graze, not a crash
    bounceTo(clamp(obj.lane + S.stumbleSide, -1, 1), 0.25);
    S.chase = 'stumble'; S.chaseT = 0;
  }
  function hit(kind, obj) {
    if (S.state !== 'running' || S.invulnT > 0) return;
    S.shakeT = 0; S.hitFlash = true; S.lastHit = kind; S.lastHitS = obj ? obj.s0 : (kind === 'oncoming' ? onc.sFront : S.traveled);
    S.nearStreak = 0; S.streakBonus = 0;   // v11: a hit ends the near-miss streak
    if (S.shield) {
      S.shield = false; S.shieldT = 0; S.shieldPopT = 0; S.invulnT = 0.6;
      if (kind === 'train' || kind === 'oncoming' || kind === 'ramp') bounceTo(freeLane(), 0.3);
      return;
    }
    /* v11: the active hoverboard forgives one crash and is consumed by it */
    if (S.hoverOn) {
      S.hoverOn = false; S.hoverT = 0; S.hoverPopT = 0; S.hoverPop = true; S.invulnT = 0.6;
      bounceTo(freeLane(), 0.3);
      return;
    }
    die();
  }
  /* v11: every crash is a catch. The run stops here (the distance and the store are final, the
     onRunEnd hook fires), the chasers hold the runner for CATCH_LEN, then the state turns 'dead'
     and the gameover event goes out (render3d shows the card then). */
  function die() {
    S.state = 'caught'; S.caught = true; S.catchT = 0; S.catchSide = S.x > 0.01 ? -1 : 1;
    S.chase = 'catch'; S.chaseT = 0; S.woofT = -1; S.puffT = -1; S.woofN = 0;
    S.jetFly = false; S.puKind = null; S.warning = null; S.hoverOn = false; S.hoverT = 0;
    S.switching = false; S.airborne = false; S.vy = 0; S.sliding = false; S.lookBackT = -1;
    /* v11 review: a crash in the air (a jump into a train face or a sign) lands the runner where the
       chasers stand (the roof, the ramp's slope, else the floor) over CATCH_DROP in the catch branch */
    S.catchH0 = S.h; S.catchGround = S.onRoof ? ROOF_H : (S.onRamp ? S.groundY : 0);
    endSlide();
    finishRun(true);
    evOver.distance = S.distance; evOver.coins = S.coins; evOver.best = S.best; evOver.lifetime = S.lifetime; evOver.nearMisses = S.nearTotal; evOver.caught = true;
  }
  /* The run's final numbers, the store and the onRunEnd hook (once per run: the catch or a quit). */
  function finishRun(caught) {
    S.distance = Math.round(S.units * 1.5);
    S.newBest = S.distance > S.storedBest;
    writeStore();
    if (S.ended) return;
    S.ended = true;
    if (typeof runOpts.onRunEnd === 'function') {
      evEnd.distance = S.distance; evEnd.coins = S.coins; evEnd.nearMisses = S.nearTotal; evEnd.caught = caught;
      try { runOpts.onRunEnd(evEnd); } catch (e) { if (typeof console !== 'undefined') console.warn('subway: onRunEnd failed', e); }
    }
  }

  /* ================================================================ */
  /* Pickups                                                           */
  /* ================================================================ */
  function applyPowerUp(kind) {
    if (kind === 'shield') { S.shield = true; S.shieldT = DUR.shield; return; }
    if (S.puKind === 'jet' && kind !== 'jet' && S.jetFly) { S.jetFly = false; S.airborne = true; S.vy = 0; }
    S.puKind = kind; S.puT = DUR[kind]; S.puDur = DUR[kind];
    if (kind === 'jet') { S.jetFly = true; S.airborne = false; S.vy = 0; endSlide(); S.jetCoinS = S.traveled + 40; }
  }
  function stepPowerUps(dt, scroll) {
    const t = S.time;
    const ty = S.h + 0.55;
    for (const p of powerUps) {
      if (!p.active) continue;
      const z = S.traveled - p.s;
      p.mesh.position.z = z;
      if (p.popping) {
        p.popT += dt;
        const k = Math.min(1, p.popT / 0.2);
        p.mesh.scale.setScalar(1 + 0.6 * k);
        if (k >= 1) { p.active = false; p.popping = false; p.mesh.visible = false; p.mesh.scale.setScalar(1); p.cube.material = T.white; }
        continue;
      }
      p.mesh.position.y = p.y + 0.1 * Math.sin(TAU * 1.5 * t);
      p.mesh.rotation.y = 2 * t;
      if (S.state === 'running' && Math.abs(p.mesh.position.x - S.x) < 0.6 && Math.abs(z) < 0.6 && Math.abs(p.mesh.position.y - ty) < 0.9) {
        applyPowerUp(p.kind);
        p.popping = true; p.popT = 0; p.cube.material = T.popMat;
      }
    }
    if (S.state === 'running') {
      if (S.puKind) {
        S.puT -= dt;
        if (S.puKind === 'jet' && S.jetFly && S.puT <= 0.5) { S.jetFly = false; S.airborne = true; S.vy = 0; }
        if (S.puT <= 0) { S.puT = 0; S.puKind = null; }
      }
      if (S.shield) { S.shieldT -= dt; if (S.shieldT <= 0) { S.shield = false; S.shieldT = 0; } }
      if (S.jetFly && S.traveled + 40 >= S.jetCoinS) { coinRowPitch(S.jetCoinS, Math.floor(rng() * 3) - 1, 10, 3.8, 1.2); S.jetCoinS += 12; }
    }
    if (S.shieldPopT >= 0) { S.shieldPopT += dt; if (S.shieldPopT > 0.25) S.shieldPopT = -1; }
    if (S.invulnT > 0) { S.invulnT -= dt; if (S.invulnT <= 0) { S.invulnT = 0; setRunnerVisible(true); S.flicker = false; } }
    fx.coinMesh.material = S.puKind === 'double' ? fx.goldMat : fx.coinMat;
  }
  function coinRowPitch(s, lane, count, y, pitch) { for (let i = 0; i < count; i++) allocCoin(s + i * pitch, lane, y); }
  function stepCoins(dt, scroll) {
    const ty = S.h + 0.55;
    const magnet = S.state === 'running' && S.puKind === 'magnet';
    const mult = runMultiplier();
    const running = S.state === 'running';
    /* v10: coins spin faster with the speed (an accumulated angle, so a speed change never jumps them)
       and glint as their face sweeps past the camera: a brightness pulse through instanceColor. */
    S.spin += (3 + 0.12 * S.v) * dt; if (S.spin > 4096) S.spin -= 4096;
    const colors = fx.coinMesh.instanceColor, ca = colors.array;
    let dirty = false;
    for (let i = 0; i < COIN_COUNT; i++) {
      const c = coins[i];
      if (c.mode === 0) continue;
      dirty = true;
      let scale = 1;
      if (c.mode === 1) {
        c.wx = c.x; c.wy = c.y; c.wz = S.traveled - c.s;
        if (c.wz > BEHIND) { c.mode = 0; hideCoin(i); continue; }
        if (running) {
          const dx = Math.abs(c.wx - S.x), dz = Math.abs(c.wz), dy = Math.abs(c.wy - ty);
          if (dx < 0.5 && dz < 0.5 && dy < 0.7) { c.mode = 3; c.t = 0; S.coins += mult; S.coinPulse++; }
          else if (magnet && dx < 3.0 && dz < 3.0 && dy < 1.6) c.mode = 2;
        }
      } else if (c.mode === 2) {
        c.wz += scroll;
        const dx = S.x - c.wx, dy = ty - c.wy, dz = -c.wz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 0.3 || !running) { c.mode = 3; c.t = 0; if (running) { S.coins += mult; S.coinPulse++; } }
        else { const k = Math.min(1, 14 * dt / d); c.wx += dx * k; c.wy += dy * k; c.wz += dz * k; }
      } else if (c.mode === 3) {
        c.t += dt; scale = Math.max(0, 1 - c.t / 0.15);
        if (c.t >= 0.15) { c.mode = 0; hideCoin(i); continue; }
      }
      const ang = S.spin + 0.4 * i;
      const f = Math.cos(ang), g2 = f * f, g4 = g2 * g2, g8 = g4 * g4;
      const glint = 1 + 1.6 * g8;
      ca[i * 3] = glint; ca[i * 3 + 1] = glint; ca[i * 3 + 2] = 0.9 + 0.1 * glint;
      const sc = scale * (1 + 0.06 * g8);
      _v.set(c.wx, c.wy, c.wz); _e.set(0, ang, 0); _q.setFromEuler(_e); _s.set(sc, sc, sc);
      _m.compose(_v, _q, _s); fx.coinMesh.setMatrixAt(i, _m);
    }
    if (dirty) { fx.coinMesh.instanceMatrix.needsUpdate = true; colors.needsUpdate = true; }
  }

  /* ================================================================ */
  /* v10: near misses                                                  */
  /* ================================================================ */
  /* A solid obstacle whose near face crossed the runner this frame without a hit, passing within
     WHOOSH_RANGE beside the runner, or cleared in the runner's own lane by a jump (barrier) or a
     slide (sign), starts a whoosh: the obstacle's scale punches, the camera punches (placeCamera) and
     hud.nearMiss counts it. */
  function checkPass(pool, prev) {
    for (const o of pool) {
      if (!o.active || o.whooshT >= 0 || !(prev < o.s0 && S.traveled >= o.s0)) continue;
      const lx = LANE_X[o.lane + 1], dx = Math.abs(S.x - lx), touch = o.hw + RUNNER_HW;
      let near = false;
      if (dx >= touch - 1e-3) near = dx < touch + WHOOSH_RANGE;
      else if (o.kind === 'barrier') near = S.h >= 0.6;
      else if (o.kind === 'sign') near = S.h + S.boxH <= o.y0 - 0.02;
      if (!near) continue;
      o.whooshT = 0;
      S.whooshT = 0; S.whooshSide = S.x < lx ? -1 : 1; scoreNearMiss();
    }
  }
  /* v11: the run multiplier: the double power-up plus the near-miss streak bonus. */
  function runMultiplier() { return (S.puKind === 'double' ? 2 : 1) + S.streakBonus; }
  /* v11: a near miss counts, pays NEAR_PAY coins and feeds the streak: every STREAK_STEP in a row
     without a hit or a stumble raise the bonus by 1 up to STREAK_BONUS_MAX. */
  function scoreNearMiss() {
    S.nearMiss++; S.nearTotal++;
    S.coins += NEAR_PAY; S.nearCoins += NEAR_PAY; S.nearPay += NEAR_PAY; S.coinPulse++;
    S.nearStreak++;
    if (S.nearStreak % STREAK_STEP === 0 && S.streakBonus < STREAK_BONUS_MAX) S.streakBonus++;
  }
  function whooshPool(pool, dt) {
    for (const o of pool) {
      if (o.whooshT < 0) continue;
      o.whooshT += dt;
      const k = Math.min(1, o.whooshT / 0.3);
      const sc = 1 + 0.14 * Math.sin(Math.PI * k);
      o.mesh.scale.set(sc, sc, o.kind === 'train' ? 1 : sc);
      if (k >= 1) { o.whooshT = -1; o.mesh.scale.set(1, 1, 1); }
    }
  }
  function stepNearMiss(dt, prev) {
    if (S.state === 'running' && S.invulnT <= 0) {
      checkPass(barriers, prev); checkPass(signs, prev); checkPass(trains, prev); checkPass(ramps, prev);
      /* The oncoming train's front sweeps past the runner's plane in a lane beside it. */
      const gap = onc.active ? onc.sFront - S.traveled : 1;
      if (onc.active && S.oncGap > 0 && gap <= 0 && Math.abs(S.x - LANE_X[onc.lane + 1]) >= 0.7 + RUNNER_HW - 1e-3) {
        S.whooshT = 0; S.whooshSide = S.x < LANE_X[onc.lane + 1] ? -1 : 1; scoreNearMiss();
      }
      S.oncGap = gap;
    } else S.oncGap = onc.active ? onc.sFront - S.traveled : 1;
    whooshPool(barriers, dt); whooshPool(signs, dt); whooshPool(trains, dt); whooshPool(ramps, dt);
    if (S.whooshT >= 0) { S.whooshT += dt; if (S.whooshT > WHOOSH_LEN) S.whooshT = -1; }
  }

  /* ================================================================ */
  /* Oncoming train                                                    */
  /* ================================================================ */
  function stepOncoming(dt) {
    S.warning = null;
    fx.warn.visible = false;
    if (!onc.active) return;
    if (S.state === 'running') onc.sFront -= 8 * dt;
    if (S.traveled - onc.sFront > 30) { onc.active = false; onc.mesh.visible = false; clearOncMarks(); return; }
    onc.tToHit = (onc.sFront - S.traveled) / (S.v + 8);
    onc.mesh.position.z = S.traveled - (onc.sFront + 9);
    const warn = onc.tToHit > 0 && onc.tToHit <= 1.5 && S.state === 'running';
    const t = S.time;
    if (warn) {
      const f = 0.5 + 0.5 * Math.sin(TAU * 6 * t);
      onc.headMat.emissiveIntensity = 1 + 3 * f;
      onc.light.intensity = 20 + 40 * f;
      fx.warn.visible = Math.sin(TAU * 4 * t) > 0;
      fx.warn.position.x = LANE_X[onc.lane + 1];
      S.warning = onc.lane;
    } else { onc.headMat.emissiveIntensity = 3; onc.light.intensity = 20; }
  }

  /* ================================================================ */
  /* Visuals: obstacles, runner, camera                               */
  /* ================================================================ */
  function placeObstacles() {
    for (const b of barriers) if (b.active) b.mesh.position.z = S.traveled - (b.s0 + 0.18);
    for (const g of signs) if (g.active) g.mesh.position.z = S.traveled - (g.s0 + 0.04);
    for (const tr of trains) if (tr.active) tr.mesh.position.z = S.traveled - (tr.s0 + tr.len / 2);
    for (const r of ramps) if (r.active) r.mesh.position.z = S.traveled - r.s0;
  }
  function animateRunner(dt) {
    const h = S.handle; if (!h) return;
    const t = S.time;
    fake.animT += dt;
    if (t > fake.blinkAt + 0.2) fake.blinkAt = t + 2 + 4 * envRng();
    const ha = Math.max(0, S.h - (S.onRoof ? ROOF_H : (S.onRamp ? S.groundY : 0)));
    const hf = clamp(ha / APEX, 0, 1);
    let pose;
    if (S.state === 'ready') pose = 'stand';
    else if (S.state === 'dead') pose = 'slump';
    else if (S.state === 'caught') pose = 'stand';
    else if (S.jetFly || S.airborne) pose = 'hop';
    else if (S.sliding) pose = 'slide';
    else pose = 'walk';
    fake.pose = pose; fake.speed = S.v;
    const liftF = (S.jetFly || S.airborne) ? hf : 0;
    fake.yoff = (S.jetFly || S.airborne) ? -3 * (S.jetFly ? 1 : hf) : 0;
    const g = h.group;
    /* v11: the hoverboard lifts the feet onto its deck; the catch hauls the runner back and tips it */
    const hover = S.hoverOn && !S.jetFly && !S.airborne ? HOVER_LIFT + 0.02 * Math.sin(TAU * 1.2 * t) : 0;
    const haul = S.caught ? easeInOut(clamp(S.catchT / CATCH_LEN, 0, 1)) : 0;
    g.position.set(S.x, S.h + hover - 0.234 * (S.jetFly ? 1 : liftF), 0.35 * haul);
    const lean = S.state === 'running' ? 0.04 + 0.08 * clamp((S.v - 9) / 15, 0, 1) : 0;
    g.rotation.x = lean - 0.3 * haul + (S.caught && S.state === 'caught' ? 0.05 * Math.sin(TAU * 4 * S.catchT) : 0);
    /* v11: the stumble wobble, a roll away from the obstacle that settles over STUMBLE_WOBBLE */
    g.rotation.z = S.stumbleT >= 0 && S.stumbleT < STUMBLE_WOBBLE ? 0.22 * S.stumbleSide * Math.sin(Math.PI * S.stumbleT / STUMBLE_WOBBLE) : 0;
    h.distance = S.traveled;   // v10: the walk cycle follows the track so the feet plant on the sleepers
    animate(h, fake, t, dt);
    /* v11: the look back after a stumble (the head yaws toward the chasers for LOOK_BACK_LEN) */
    const headG = h.headGroup || (h.parts && h.parts.head ? h.parts.head.parent : null);
    if (headG && S.lookBackT >= 0 && S.lookBackT < LOOK_BACK_LEN) headG.rotation.y = -S.stumbleSide * 1.2 * Math.sin(Math.PI * S.lookBackT / LOOK_BACK_LEN);
    /* Effects around the runner */
    fx.shadow.position.set(S.x, (S.onRoof ? ROOF_H : 0) + 0.012, 0);
    const sf = 1 - 0.5 * hf; fx.shadow.scale.set(sf, sf, 1);
    T.shadowMat.opacity = 0.35 * (1 - 0.6 * clamp(S.h / JET_H, 0, 1));
    const shieldOn = S.shield || S.shieldPopT >= 0;
    fx.shield.visible = shieldOn;
    if (shieldOn) {
      fx.shield.position.set(S.x, S.h + 0.65, 0);
      if (S.shieldPopT >= 0) { const k = S.shieldPopT / 0.25; fx.shield.scale.setScalar(1 + 0.8 * k); T.shieldFx.opacity = 0.22 * (1 - k); }
      else { fx.shield.scale.setScalar(1); T.shieldFx.opacity = 0.22 + 0.06 * Math.sin(TAU * t); }
    }
    fx.ringPivot.visible = S.puKind === 'magnet';
    if (fx.ringPivot.visible) { fx.ringPivot.position.set(S.x, S.h + 0.6, 0); fx.ring.rotation.z = 4 * t; }
    fx.pack.visible = S.puKind === 'jet';
    if (fx.pack.visible) { const fl = fx.pack.userData.flames; const sy = 0.8 + 0.4 * Math.abs(Math.sin(TAU * 20 * t)); fl[0].scale.y = sy; fl[1].scale.y = sy; }
    if (S.invulnT > 0) { const on = Math.floor(t * 20) % 2 === 0; if (on !== !S.flicker) { S.flicker = !on; setRunnerVisible(on); } }
    /* v11: the hoverboard under the runner (an aqua halo on the ground), popping when it forgives a crash */
    const boardOn = S.hoverOn || S.hoverPopT >= 0;
    CH.board.visible = boardOn; CH.halo.visible = boardOn;
    if (boardOn) {
      const popK = S.hoverPopT >= 0 ? Math.min(1, S.hoverPopT / HOVER_POP) : 0;
      const by = S.h + (S.jetFly || S.airborne ? 0.1 : 0) + 0.02 * Math.sin(TAU * 1.2 * t);
      CH.board.position.set(S.x, by, 0);
      CH.board.rotation.x = lean;
      CH.board.rotation.z = S.switching ? -0.2 * Math.sign(S.xt - S.x0) * Math.sin(Math.PI * Math.min(1, S.laneT / S.laneDur)) : 0;
      CH.board.scale.setScalar(1 + 0.8 * popK);
      T.boardGlow.emissiveIntensity = 1.8 + 0.6 * Math.sin(TAU * 2 * t) + 3 * popK;
      CH.halo.position.set(S.x, (S.onRoof ? ROOF_H : 0) + 0.02, 0);
      T.haloMat.opacity = (0.28 + 0.08 * Math.sin(TAU * 2 * t)) * (1 - popK);
    }
  }

  /* ================================================================ */
  /* v11: the chase                                                    */
  /* ================================================================ */
  /* Clocks and the chasers' gap. The gap eases toward the chase's target (CHASE_NEAR_START for the
     start chase, CHASE_GAP for the stumble chase, CATCH_GAP for the catch, CHASE_FAR otherwise, where
     the chasers hide); the chasers' own run distances advance by the scroll minus the gap change so
     their feet plant like the runner's. */
  function stepChase(dt, scroll) {
    if (S.stumbleT >= 0) { S.stumbleT += dt; if (S.stumbleT > CHASE_STUMBLE_LEN) S.stumbleT = -1; }
    if (S.lookBackT >= 0) { S.lookBackT += dt; if (S.lookBackT >= LOOK_BACK_LEN) S.lookBackT = -1; }
    if (S.slowK > 0) { S.slowK *= Math.exp(-dt / STUMBLE_RECOVER); if (S.slowK < 0.01) S.slowK = 0; }
    if (S.state === 'running' && (S.chase === 'start' || S.chase === 'stumble')) {
      S.chaseT += dt;
      if (S.chaseT >= (S.chase === 'start' ? CHASE_START_LEN : CHASE_STUMBLE_LEN)) { S.chase = 'none'; S.chaseT = 0; }
    }
    let target = CHASE_FAR, rate = 4;
    if (S.chase === 'start') { const near = S.chaseT < CHASE_START_LEN - 0.5; target = near ? CHASE_NEAR_START : CHASE_FAR; rate = near ? 9 : 4; }
    else if (S.chase === 'stumble') { const near = S.chaseT < CHASE_STUMBLE_LEN - 0.4; target = near ? CHASE_GAP : CHASE_FAR; rate = near ? 12 : 4; }
    else if (S.chase === 'catch') { target = CATCH_GAP; rate = 14; }
    S.gapPrev = S.gap;
    S.gap += (target - S.gap) * (1 - Math.exp(-rate * dt));
    if (Math.abs(S.gap - target) < 0.005) S.gap = target;
    const adv = Math.max(0, scroll - (S.gap - S.gapPrev));
    S.inspDist += adv; S.dogDist += adv;
    /* the dog barks twice during the catch */
    if (S.state === 'caught') {
      if (S.woofN === 0 && S.catchT >= 0.25) { S.woofN = 1; S.woofT = 0; S.puffT = 0; }
      else if (S.woofN === 1 && S.catchT >= 0.8) { S.woofN = 2; S.woofT = 0; S.puffT = 0; }
    }
    if (S.woofT >= 0) { S.woofT += dt; if (S.woofT > WOOF_LEN) S.woofT = -1; }
    if (S.puffT >= 0) { S.puffT += dt; if (S.puffT > PUFF_LEN) S.puffT = -1; }
    placeChasers(dt);
  }
  /* The chasers' meshes: the inspector in the runner's lane at the gap (grabbing with both arms in
     the stumble chase, holding the collar and hauling in the catch), the dog beside it on the open
     side (leaping in the stumble chase, jumping up and barking in the catch), the leash from the
     inspector's hand to the collar, the puff and the 'Woof' label off the dog's nose. */
  function placeChasers(dt) {
    const vis = S.gap < CHASE_FAR - 0.05;
    const insp = CH.insp, dg = CH.dog;
    insp.group.visible = vis; dg.group.visible = vis; CH.leash.visible = vis;
    if (!vis) { CH.puff.visible = false; CH.woof.visible = false; return; }
    const t = S.time;
    const gy = S.onRoof ? ROOF_H : 0;
    const haul = S.caught ? easeInOut(clamp(S.catchT / CATCH_LEN, 0, 1)) : 0;
    const catching = S.caught;
    /* the inspector */
    const ig = insp.group;
    const ix = S.caught ? S.x : ig.position.x + (S.x - ig.position.x) * (1 - Math.exp(-7 * dt));
    ig.position.set(ix, gy, S.gap + 0.35 * haul);
    ig.rotation.x = catching ? -0.25 * haul : 0.06 + 0.06 * clamp((S.v - 9) / 15, 0, 1);
    inspAgent.pose = catching ? 'stand' : 'walk'; inspAgent.speed = S.v; inspAgent.animT += dt;
    if (t > inspAgent.blinkAt + 0.2) inspAgent.blinkAt = t + 3.7;   // a fixed cadence: the env rng stays the segment schedule's
    insp.handle.distance = S.inspDist;
    animateChaser(insp.handle, inspAgent, t, dt);
    if ((S.chase === 'stumble' || catching) && insp.armL && insp.armR) {
      const reach = catching ? -1.5 + 0.08 * Math.sin(TAU * 4 * S.catchT) : -1.3 + 0.25 * Math.sin(TAU * 3 * t);
      insp.armL.rotation.x = reach; insp.armR.rotation.x = catching ? reach : reach + 0.2 * Math.cos(TAU * 3 * t);
      insp.armL.rotation.z = -0.12; insp.armR.rotation.z = 0.12;
    }
    /* the dog */
    const dside = S.x > 0 ? -1 : 1;
    dg.group.position.set(ix + 0.55 * dside, gy, S.gap + 0.3 + 0.35 * haul);
    dg.group.rotation.y = Math.PI;
    const p = S.dogDist / DOG_STRIDE, sw = Math.sin(TAU * p);
    const amp = 0.7 * clamp(S.v / 9, 0.3, 1.2);
    const leap = S.chase === 'stumble' ? Math.max(0, Math.sin(TAU * S.chaseT / 0.7)) : 0;
    const jump = catching ? 0.6 + 0.4 * Math.abs(Math.sin(TAU * 1.6 * S.catchT)) : 0;
    dg.rig.position.y = 0.32 * leap + 0.36 * jump;
    dg.rig.rotation.x = -0.6 * leap - 0.85 * jump;
    const run = 1 - Math.max(leap, jump);
    const paddle = 0.5 * Math.sin(TAU * 6 * t);
    dg.legs[0].rotation.x = amp * sw * run - 0.9 * leap + (paddle - 0.6) * jump;
    dg.legs[1].rotation.x = -amp * sw * run - 0.9 * leap + (-paddle - 0.6) * jump;
    dg.legs[2].rotation.x = -amp * sw * run + 0.8 * leap + 0.5 * jump;
    dg.legs[3].rotation.x = amp * sw * run + 0.8 * leap + 0.5 * jump;
    dg.tail.rotation.y = (catching ? 0.8 : 0.6) * Math.sin(TAU * (catching ? 8 : 5) * t);
    const woofK = S.woofT >= 0 ? Math.sin(Math.PI * Math.min(1, S.woofT / WOOF_LEN)) : 0;
    dg.head.rotation.x = (catching ? -0.35 : 0.1 * Math.sin(TAU * 2 * p)) - 0.25 * woofK;
    dg.jaw.rotation.x = 0.55 * woofK;
    dg.torso.rotation.z = 0.08 * sw * run;
    /* the leash: the inspector's hand to the collar */
    if (insp.handL) insp.handL.getWorldPosition(_a); else _a.set(ix - 0.3, gy + 0.7, ig.position.z);
    dg.collar.getWorldPosition(_b);
    _b.sub(_a);
    const len = _b.length();
    if (len > 1e-4) { _b.multiplyScalar(1 / len); CH.leash.quaternion.setFromUnitVectors(_up, _b); }
    CH.leash.position.copy(_a); CH.leash.scale.set(1, Math.max(1e-3, len), 1);
    /* the bark: a puff off the nose and the 'Woof' label rising toward the camera */
    dg.nose.getWorldPosition(_a);
    CH.puff.visible = S.puffT >= 0;
    if (CH.puff.visible) {
      const k = Math.min(1, S.puffT / PUFF_LEN);
      CH.puff.position.set(_a.x, _a.y + 0.04 + 0.1 * k, _a.z - 0.1 - 0.25 * k);
      CH.puff.scale.setScalar(0.6 + 2.2 * k);
      T.puffMat.opacity = 0.7 * (1 - k);
    }
    CH.woof.visible = S.woofT >= 0;
    if (CH.woof.visible) {
      const k = Math.min(1, S.woofT / WOOF_LEN);
      CH.woof.position.set(_a.x, _a.y + 0.3 + 0.35 * k, _a.z - 0.1);
      CH.woof.scale.setScalar(0.8 + 0.4 * k);
      T.woofMat.opacity = 1 - k * k;
      CH.woof.lookAt(camera.position);
    }
  }
  function placeCamera(dt) {
    S.cx += (S.x - S.cx) * (1 - Math.exp(-8 * dt));
    let zoff = 4.5, lookY = 1.0;
    if (S.state === 'dead') { const k = easeInOut(Math.min(1, S.deathT / 1.0)); zoff = lerp(4.5, 6.0, k); lookY = lerp(1.0, 0.8, k); }
    let sx = 0, sy = 0;
    if (S.shakeT >= 0) {
      const st = S.shakeT;
      sx = 0.12 * Math.sin(TAU * 28 * st) * Math.exp(-st / 0.18);
      sy = 0.07 * Math.sin(TAU * 31 * st) * Math.exp(-st / 0.18);
      S.shakeT += dt; if (S.shakeT > 0.6) S.shakeT = -1;
    }
    const hh = 0.35 * S.h;
    /* v10: a near miss punches the FOV, nudges and rolls the camera away from the passed obstacle
       (v11: the punch halved) */
    const punch = S.whooshT >= 0 ? Math.sin(Math.PI * Math.min(1, S.whooshT / WHOOSH_LEN)) : 0;
    let px = S.cx + sx + 0.05 * S.whooshSide * punch, py = 2.2 + hh + sy, pz = zoff;
    let lx = S.cx, ly = lookY + hh, lz = -3;
    /* v11: the catch swings the camera to a side view over 0.5 s and holds it through 'dead',
       drifting out a little so the slumped runner and the chasers fill the frame */
    if (S.caught) {
      const k = easeInOut(Math.min(1, S.catchT / 0.5));
      const far = S.state === 'dead' ? easeInOut(Math.min(1, S.deathT / 1.2)) : 0;
      px = lerp(px, S.x + (3.4 + 1.0 * far) * S.catchSide, k);
      py = lerp(py, 1.5 + 0.3 * far + 0.35 * S.h, k);
      pz = lerp(pz, 1.2, k);
      lx = lerp(lx, S.x, k); ly = lerp(ly, 0.8 + 0.35 * S.h, k); lz = lerp(lz, 0.5, k);
    }
    camera.position.set(px, py, pz);
    _v.set(lx, ly, lz);
    camera.lookAt(_v);
    if (punch > 0) camera.rotateZ(-0.0125 * S.whooshSide * punch);
    const fov = 70 + 8 * clamp((S.v - 9) / 15, 0, 1) + 3 * punch;
    if (Math.abs(fov - S.fov) > 0.05) { S.fov = fov; camera.fov = fov; camera.updateProjectionMatrix(); }
    /* v10 vignette: deeper with speed and on a near miss, salmon on a hit, closing in on death */
    if (S.hitFlash) S.vigHitT = 0;
    let hitK = 0;
    if (S.vigHitT >= 0) { hitK = 1 - S.vigHitT / VIG_HIT_LEN; S.vigHitT += dt; if (S.vigHitT > VIG_HIT_LEN) S.vigHitT = -1; }
    const dead = S.state === 'dead' ? easeInOut(Math.min(1, S.deathT / 1.2)) : 0;
    T.vigMat.color.lerpColors(fx.vigBase, fx.vigHit, hitK);
    T.vigMat.opacity = clamp(0.38 + 0.3 * speedFactor() + 0.1 * punch + 0.35 * hitK + 0.4 * dead, 0, 0.95);
  }

  /* ================================================================ */
  /* Run control                                                       */
  /* ================================================================ */
  function resetRun() {
    S.state = 'ready'; S.tReady = 0; S.tRun = 0; S.v = SPEED0; S.traveled = 0; S.units = 0;
    S.lane = 0; S.x = 0; S.x0 = 0; S.xt = 0; S.laneT = 1; S.laneFrom = 0; S.switching = false;
    S.h = 0; S.vy = 0; S.airborne = false; S.fastFall = false; S.groundY = 0; S.onRoof = false; S.onRamp = false;
    S.sliding = false; S.slideT = 0; S.duckHeld = false; S.duckRelT = -1; S.jumpBuf = -1; S.boxH = STAND_H;
    S.shield = false; S.shieldT = 0; S.shieldPopT = -1; S.invulnT = 0; S.flicker = false;
    S.puKind = null; S.puT = 0; S.puDur = 1; S.lastPuKind = null; S.jetFly = false; S.jetCoinS = 0;
    S.coins = 0; S.distance = 0; S.newBest = false; S.best = S.storedBest; S.lifetime = S.storedLife;
    S.cx = 0; S.shakeT = -1; S.deathT = 0; S.w = 0;
    S.warning = null; S.coinPulse = 0; S.hitFlash = false; S.deadFrame = false; S.poolWarned = false;
    S.whooshT = -1; S.whooshSide = 1; S.nearMiss = 0; S.vigHitT = -1; S.streakLen = -1; S.spin = 0; S.oncGap = 1;
    /* v11 */
    S.chase = 'none'; S.chaseT = 0; S.gap = CHASE_FAR; S.gapPrev = CHASE_FAR; S.inspDist = 0; S.dogDist = 0; S.xPrev = 0;
    S.stumbleT = -1; S.stumbleObj = null; S.stumbleSide = 1; S.slowK = 0; S.stumbled = false; S.lookBackT = -1;
    S.caught = false; S.catchT = 0; S.catchSide = 1; S.woofT = -1; S.puffT = -1; S.woofN = 0; S.catchH0 = 0; S.catchGround = 0;
    S.nearPay = 0; S.nearTotal = 0; S.nearCoins = 0; S.nearStreak = 0; S.streakBonus = 0;
    S.hoverOn = false; S.hoverT = 0; S.hoverUntil = 0; S.hoverPopT = -1; S.hoverUses = 0; S.hoverPop = false;
    S.ended = false;
    S.swipeDuckT = 0;   // v12
    CH.insp.group.visible = CH.dog.group.visible = CH.leash.visible = CH.puff.visible = CH.woof.visible = CH.board.visible = CH.halo.visible = false;
    CH.insp.group.position.set(0, 0, CHASE_FAR); CH.insp.handle.distance = 0;
    if (CH.insp.handle.poseState) CH.insp.handle.poseState.lastDist = NaN;
    inspAgent.pose = 'walk'; inspAgent.animT = 0; inspAgent.speed = SPEED0; inspAgent.blinkAt = 0;
    if (S.handle) { S.handle.distance = 0; if (S.handle.poseState) S.handle.poseState.lastDist = NaN; }
    input.left = input.right = input.jump = input.duck = input.restart = input.quit = input.hover = false;
    fake.pose = 'stand'; fake.animT = 0; fake.speed = SPEED0; fake.yoff = 0; fake.blinkAt = 0;
    releaseAll();
    rowRing.head = 0; rowRing.count = 0;
    gen.nextS = FIRST_ROW; gen.patRows = 0; gen.pendingN = 0; gen.pendingI = 0; gen.emptyNeeded = 0; gen.lastRow = null;
    gen.blockUntil[0] = gen.blockUntil[1] = gen.blockUntil[2] = 0;
    gen.nextPuS = 120 + 60 * rng(); gen.nextOncS = Infinity;
    coinCursor = 0;
    resetSegments();
    fillRows();
    setRunnerVisible(true);
    S.fov = 0;
  }
  /* v11: the run options. A value may be a boolean or a function returning one (read at start);
     consumables may come as { magnet, jetpack, multiplier } or as ctx.consumables. */
  function optFlag(v) { if (typeof v === 'function') { try { return !!v(); } catch (e) { return false; } } return !!v; }
  function readRunOpts(opts) {
    const base = ctx || {};
    const o = opts && typeof opts === 'object' ? opts : null;
    const cons = (o && o.consumables) || base.consumables || null;
    const c = typeof cons === 'function' ? (function () { try { return cons(); } catch (e) { return null; } })() : cons;
    runOpts.onRunEnd = (o && typeof o.onRunEnd === 'function') ? o.onRunEnd : (typeof base.onRunEnd === 'function' ? base.onRunEnd : null);
    runOpts.magnet = !!(c && optFlag(c.magnet));
    runOpts.jetpack = !!(c && (optFlag(c.jetpack) || optFlag(c.jet)));
    runOpts.multiplier = !!(c && (optFlag(c.multiplier) || optFlag(c.double)));
    runOpts.hoverboardOwned = o && o.hoverboardOwned !== undefined ? optFlag(o.hoverboardOwned) : optFlag(base.hoverboardOwned);
    if (o && o.hoverboardOwned !== undefined) hudObj.hoverboardOwned = runOpts.hoverboardOwned;
    else if (base.hoverboardOwned !== undefined) hudObj.hoverboardOwned = runOpts.hoverboardOwned;
  }
  function start(spec, seed, opts) {
    if (S.disposed) return;
    if (!S.built) build();
    S.runCount++;
    if (seed !== undefined && seed !== null && Number.isFinite(Number(seed))) { S.seedBase = Number(seed) >>> 0; S.seedFixed = true; S.seed = S.seedBase; }
    else if (S.seedFixed) S.seed = (S.seedBase + Math.imul(S.runCount - 1, 7919)) >>> 0;
    else S.seed = ((Date.now() & 0x7fffffff) ^ Math.imul(S.runCount, 2654435761)) >>> 0;
    rng = mulberry32(S.seed); envRng = mulberry32((S.seed ^ 0x9E3779B9) >>> 0);
    readStore();
    buildRunner(spec === undefined ? S.spec : spec);
    resetRun();
    readRunOpts(opts);
    /* v11: purchased consumables start the run active (their timers tick once the run is running) */
    if (runOpts.magnet) applyPowerUp('magnet');
    if (runOpts.multiplier) applyPowerUp('double');
    if (runOpts.jetpack) applyPowerUp('jet');
    debug.seed = S.seed;
  }
  function creditQuit() { finishRun(false); }
  function clearEdges() { input.left = input.right = input.jump = input.restart = input.quit = input.hover = false; }

  function update(dt, time) {
    if (S.disposed || !S.built) return null;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    S.time = Number.isFinite(time) ? time : S.time + dt;
    S.coinPulse = 0; S.hitFlash = false; S.nearMiss = 0; S.nearPay = 0; S.stumbled = false; S.hoverPop = false;
    if (S.swipeDuckT > 0) { S.swipeDuckT -= dt; if (S.swipeDuckT <= 0) S.swipeDuckT = 0; }   // v12: the swipe-down duck hold runs out
    const prevTraveled = S.traveled;
    if (input.quit) {
      if (S.state === 'running') creditQuit();
      clearEdges(); input.duck = false;
      return evQuit;
    }
    let scroll = 0, roofTrain = null;
    if (S.state === 'ready') {
      S.tReady += dt;
      scroll = READY_SCROLL * dt; S.traveled += scroll;
      if (S.tReady >= READY_T) { S.state = 'running'; S.tRun = 0; S.chase = 'start'; S.chaseT = 0; }   // v11: the chasers burst out behind
      clearEdges();
    } else if (S.state === 'running') {
      S.v = Math.min(SPEED_MAX, SPEED0 + SPEED_RATE * S.tRun) * (1 - S.slowK);   // v11: a stumble slows, recovering
      S.tRun += dt;
      scroll = S.v * dt; S.traveled += scroll; S.units += scroll;
      /* v11: the hoverboard power-up, once per run when owned, 30 s, consumed by the crash it forgives */
      if (input.hover && !S.hoverOn && S.hoverUses < 1 && (hudObj.hoverboardOwned || runOpts.hoverboardOwned)) {
        S.hoverOn = true; S.hoverT = HOVER_LEN; S.hoverUntil = S.time + HOVER_LEN; S.hoverUses++;
      }
      if (S.hoverOn) { S.hoverT -= dt; if (S.hoverT <= 0) { S.hoverOn = false; S.hoverT = 0; } }
      fillRows();
      recycleObstacles();
      roofTrain = stepRunner(dt, scroll);
      if (S.state === 'running') collide(scroll, dt, roofTrain);
      S.distance = Math.round(S.units * 1.5);
      clearEdges();
    } else if (S.state === 'caught') {
      /* v11: the catch, the run stopping under the inspector's grip, then 'dead' and the event */
      S.catchT += dt;
      S.v *= Math.exp(-10 * dt); if (S.v < 0.05) S.v = 0;
      scroll = S.v * dt; S.traveled += scroll;
      S.h = S.catchT < CATCH_DROP ? lerp(S.catchH0, S.catchGround, easeInOut(S.catchT / CATCH_DROP)) : S.catchGround;
      if (S.catchT >= CATCH_LEN) { S.state = 'dead'; S.deathT = 0; S.deadFrame = true; }
      clearEdges();
    } else {
      S.deathT += dt;
      S.v *= Math.exp(-8 * dt); if (S.v < 0.05) S.v = 0;
      scroll = S.v * dt; S.traveled += scroll;
      if (input.restart) { clearEdges(); start(S.spec); return null; }
      clearEdges();
    }
    if (S.hoverPopT >= 0) { S.hoverPopT += dt; if (S.hoverPopT > HOVER_POP) S.hoverPopT = -1; }
    stepPowerUps(dt, scroll);
    stepCoins(dt, scroll);
    stepOncoming(dt);
    stepNearMiss(dt, prevTraveled);
    updateSegments(dt);
    placeObstacles();
    animateRunner(dt);
    stepChase(dt, scroll);
    placeCamera(dt);
    if (S.deadFrame) { S.deadFrame = false; return evOver; }
    return null;
  }

  function setInput(i) {
    if (!i) return;
    if (i.left) input.left = true;
    if (i.right) input.right = true;
    if (i.jump) input.jump = true;
    if (i.restart) input.restart = true;
    if (i.quit) input.quit = true;
    if (i.hover) input.hover = true;   // v11: the hoverboard power-up edge ('H')
    /* v12: the swipes (one-frame edges from the touch layer) and the tap */
    if (i.swipeLeft) input.left = true;
    if (i.swipeRight) input.right = true;
    if (i.swipeUp) input.jump = true;
    if (i.swipeDown) S.swipeDuckT = SWIPE_DUCK;
    if (i.tap) {
      if (S.state === 'dead') input.restart = true;          // the card: tap to run again
      else if (S.state === 'running') input.hover = true;    // the hoverboard power-up (when owned; the game checks)
    }
    input.duck = !!i.duck || S.swipeDuckT > 0;
  }
  /* v12: the 'Tap to run' line follows the caller's touch state (a laptop touchscreen may change it). */
  function setTouch(on) { S.touch = !!on; }
  function hud() {
    hudObj.state = S.state;
    hudObj.distance = S.distance;
    hudObj.coins = S.coins;
    hudObj.best = S.state === 'dead' ? S.best : Math.max(S.storedBest, S.distance);
    hudObj.lifetime = S.state === 'dead' ? S.lifetime : S.storedLife + S.distance;
    hudObj.speed = S.v;
    if (S.puKind) { hudPower.kind = S.puKind; hudPower.remaining = S.puT; hudPower.duration = S.puDur; hudObj.powerUp = hudPower; } else hudObj.powerUp = null;
    hudObj.shield = S.shield;
    hudObj.multiplier = runMultiplier();
    hudObj.double = S.puKind === 'double';
    hudObj.countdown = S.state === 'ready' ? Math.max(1, Math.ceil((READY_T - S.tReady) / 0.8)) : 0;
    hudObj.warning = S.warning;
    hudObj.coinPulse = S.coinPulse;
    hudObj.hitFlash = S.hitFlash;
    hudObj.newBest = S.caught ? S.newBest : S.distance > S.storedBest && S.storedBest > 0;
    hudObj.nearMiss = S.nearMiss;
    /* v11 */
    hudObj.chase = S.chase; hudObj.chaseT = S.caught ? S.catchT : S.chaseT;
    hudObj.stumble = S.stumbled; hudObj.caught = S.caught;
    hudObj.coinsEarned = S.coins;
    hudObj.nearMissCoins = S.nearPay; hudObj.nearMissStreak = S.nearStreak; hudObj.streakBonus = S.streakBonus; hudObj.nearMissTotal = S.nearTotal;
    hudObj.hoverboard.active = S.hoverOn; hudObj.hoverboard.until = S.hoverOn ? S.hoverUntil : 0; hudObj.hoverboard.remaining = S.hoverOn ? S.hoverT : 0;
    hudObj.hoverPop = S.hoverPop;
    /* v12: the 'Tap to run' line on the start screen (the countdown) and the game-over card, on touch only */
    hudObj.tapLine = S.touch && (S.state === 'ready' || S.state === 'dead') ? TAP_LINE : '';
    return hudObj;
  }
  function resize(w, h) {
    if (w > 0 && h > 0) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (fx.vignette) fx.vignette.scale.set(1.05 * camera.aspect, 1.05, 1);
  }
  function dispose() {
    if (S.disposed) return;
    S.disposed = true;
    for (const k of ['sleeperGeo', 'railGeo', 'fixtureGeo', 'pilasterGeo', 'pipeGeo', 'gantryGeo', 'ledgeGeo', 'archGeo', 'unitBox', 'rampGeo', 'streakGeo', 'leashGeo']) if (T[k]) T[k].dispose();
    for (const slot of slots) slot.skyGeo.dispose();
    if (T.trainGeo) for (const L in T.trainGeo) for (const k in T.trainGeo[L]) T.trainGeo[L][k].dispose();
    if (fx.vignette) fx.vignette.geometry.dispose();
    for (const k of ['brick', 'grit', 'windows', 'stripe', 'chevron', 'double', 'shadow', 'sky', 'vignette', 'streak', 'woof']) if (T[k]) T[k].dispose();
    if (CH.insp && CH.insp.group) group.remove(CH.insp.group);
    for (const arr of [T.posters || [], T.signs || [], T.trainWin || []]) for (const t of arr) if (t) t.dispose();
    if (fx.coinMesh) { fx.coinMesh.geometry.dispose(); fx.coinMesh.dispose(); }
    if (S.handle && S.handle.group) group.remove(S.handle.group);
    scene.clear();
  }

  /* ---------- debug (test only; allocates) ---------- */
  const debug = {
    seed: 0,
    rowsAhead() {
      const out = [];
      for (let i = 0; i < rowRing.count; i++) {
        const r = rowAt(i);
        const e = { s: r.s, lanes: r.lanes.slice(), hard: r.hard.slice(), tier: r.tier, pattern: r.pattern, roof: r.roof.slice() };
        if (onc.active && r.s + ROW > onc.sFront && r.s < onc.sFront + 18) { e.lanes[onc.lane + 1] = 'oncoming'; e.hard[onc.lane + 1] = true; }
        if (onc.active) { e.hard[onc.lane + 1] = true; e.oncomingLane = onc.lane; }
        out.push(e);
      }
      if (onc.active) {
        const lanes = [null, null, null], hard = [false, false, false];
        lanes[onc.lane + 1] = 'oncoming'; hard[onc.lane + 1] = true;
        out.push({ s: onc.sFront, lanes, hard, tier: 0, pattern: 'oncoming', oncoming: true, lane: onc.lane, sFront: onc.sFront, tToHit: onc.tToHit });
      }
      out.sort((a, b) => a.s - b.s);
      return out;
    },
    rowCount() { return rowRing.count; },
    row(i) { return rowAt(i); },
    state: S, input, onc, pools: { barriers, signs, trains, ramps, powerUps, coins }, gen,
    allocCoin, applyPowerUp, acquireTrain, LANE_X,
    // v11: the chasers and the board (meshes), the run options, the stumble and the near-miss scorer
    chasers: CH, runOpts, stumble, scoreNearMiss, hit, camera,
  };

  return { scene, camera, group, start, setInput, update, hud, resize, dispose, setTouch, _debug: debug };
}
