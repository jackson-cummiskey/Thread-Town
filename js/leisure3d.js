/* Thread Town leisure visuals (CONTRACT_V2 "Leisure module"): cafe stools and string lights,
   terrace dressing, the pier with its springboard and ladder, floating rings, the ripple and
   splash pools, hand props (ice cream, coffee) and the per-agent leisure animation (sitting,
   boarding, diving, swimming, climbing out).

   Coordinates: everything in buildLeisure is built in WORLD tile units (sim x is world x, sim y
   is world z, one tile is one unit) because ctx.state already holds absolute positions.
   // CONTRACT: the returned group has an identity transform; the renderer adds it to the scene as is.
   Version 8 (docs/CONTRACT_V8.md "Everything on the terrain"): buildLeisure takes ctx.heightAt(x, z)
   (default flat 0) and stands the cafe stools, the string light posts, the terrace paving and
   dressing and the pond shore props (reeds, the lifeguard stand) at the terrain height under each
   one. The pond lot is a plateau at 0 by the terrain rules, so the pier, the water props and the
   swim offsets keep their absolute heights. The group's userData.placements lists every anchor.
   Per-frame code allocates nothing; module-scope scratch objects carry every temporary value.
   Version 10 (docs/CONTRACT_V10.md "Polish list", Interactions): createHighlightRing(opts) builds the
   soft highlight ring the renderer lays under the targeted interactable (a seat, a station, the
   pier, a rack, an agent to talk to): target(x, y, z, radius) aims it, clear() releases it, and
   update(dt, time) fades and breathes it, allocation free. */
import * as THREE from 'three';
import {
  BRAND, mat, glass, glow, box, cyl, cone, sphere, torus, plane, canvasTex, rng,
  lerp, clamp, easeInOut,
} from './depts/common.js';

/* ---------- tunables ---------- */
const PROP_SCALE = 1.2;          // hand props relative to the alien (contract: 1.0 to 1.3)
const RIPPLE_COUNT = 12;
const SPLASH_COUNT = 24;
const RIPPLE_Y = 0.06;
const WATER_Y = 0.045;
const BOARD_FLEX = 0.075;        // rad, tip down 0.12 over the 1.6 board
const SIP_PERIOD = 2.5, SIP_LEN = 0.6;
const STEAM_LEN = 1.4, STEAM_RISE = 0.3;
const CLIMB_LEN = 0.8;
const BOUNCE_LEN = 0.6;
/* Swim depth the group carries. The v2 swim pose already lowers the body center to about -0.12,
   so the group stays at water level and only the bob, dips and lifts move it.
   // CONTRACT: set SWIM_DEPTH to -0.12 if the integrator finds the swim pose does not lower the body. */
export const SWIM_DEPTH = 0.0;

/* ---------- colors from ART_DIRECTION and CITY_DESIGN ---------- */
const C = {
  iron: '#2E3E50', wood: '#A5774E', woodDark: '#6B4A2B', post: '#5E4538', trim: '#F8F6F0',
  bulb: '#FFF1C9', bulbGlow: '#FFE2A0', lampLight: '#FFC97A', hedge: '#6FA860', gold: '#F6D463',
  steam: '#F2F2F2', coffee: '#4A3222', cone: '#E8C07A', deep: '#58A3A8', lily: '#5B8E45',
  pave1: '#D3DBE2', pave2: '#CAD3DB', grout: '#B6C1CA', paveFlat: '#CFD7DE',
};
const SCOOPS = ['#F8D9E0', '#8FD6C8', '#F6E6B4', '#E7706F'];

/* ---------- small helpers ---------- */
function emissiveMat(hex, emissive, intensity, roughness = 0.35) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(emissive), emissiveIntensity: intensity, roughness });
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function localRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* Seeded random that prefers the shared TT.rng when it exists (Node tests may lack window). */
function seeded(seedStr) {
  if (typeof window !== 'undefined' && window.TT && window.TT.rng && window.TT.hash) return rng(seedStr);
  return localRng(hashStr(String(seedStr)));
}
const hasDocument = () => typeof document !== 'undefined' && !!document.createElement;
const easeOut = t => 1 - (1 - t) * (1 - t);
const finite = v => typeof v === 'number' && isFinite(v);

/* ---------- module state shared by buildLeisure, update and animateLeisure ---------- */
let pier = null;                 // state.pier copy (tile units) once built
let board = null;                // { pivot, loadAt, weight, bounceAt, springAt }
const ripples = {                // pool of flat toruses
  meshes: [], next: 0,
  t0: new Float32Array(RIPPLE_COUNT).fill(-100), dur: new Float32Array(RIPPLE_COUNT),
  s0: new Float32Array(RIPPLE_COUNT), s1: new Float32Array(RIPPLE_COUNT),
  a0: new Float32Array(RIPPLE_COUNT), sx: new Float32Array(RIPPLE_COUNT),
};
const specks = {                 // pool of white spheres
  meshes: [], next: 0,
  x: new Float32Array(SPLASH_COUNT), y: new Float32Array(SPLASH_COUNT), z: new Float32Array(SPLASH_COUNT),
  vx: new Float32Array(SPLASH_COUNT), vy: new Float32Array(SPLASH_COUNT), vz: new Float32Array(SPLASH_COUNT),
  life: new Float32Array(SPLASH_COUNT), max: new Float32Array(SPLASH_COUNT), grav: new Float32Array(SPLASH_COUNT),
};
let speckMat = null;
const tracked = [];              // handles seen by animateLeisure, swept by update for exit effects
let clock = 0;                   // last time seen by update or animateLeisure
let burstRng = localRng(0x5EED);

const scratch = { y: 0, lift: 0, boardLoad: false, dip: 0 };
const V1 = new THREE.Vector3();

/* ---------- pools ---------- */
function spawnRipple(x, z, s0, s1, dur, a0, sx, time) {
  if (!ripples.meshes.length) return;
  const i = ripples.next; ripples.next = (ripples.next + 1) % RIPPLE_COUNT;
  const m = ripples.meshes[i];
  m.position.x = x; m.position.z = z; m.visible = false;   // update reveals it at its start time
  ripples.t0[i] = time; ripples.dur[i] = dur; ripples.s0[i] = s0; ripples.s1[i] = s1; ripples.a0[i] = a0; ripples.sx[i] = sx;
  m.scale.set(s0 * sx, s0, 1); m.material.opacity = a0;
}
function spawnSpeck(x, y, z, vx, vy, vz, life, grav) {
  if (!specks.meshes.length) return;
  const i = specks.next; specks.next = (specks.next + 1) % SPLASH_COUNT;
  specks.x[i] = x; specks.y[i] = y; specks.z[i] = z; specks.vx[i] = vx; specks.vy[i] = vy; specks.vz[i] = vz;
  specks.life[i] = life; specks.max[i] = life; specks.grav[i] = grav;
  const m = specks.meshes[i]; m.position.set(x, y, z); m.visible = true;
}
/* A splash: count specks arcing out plus `rings` ripple rings forced 0.2 to 1.6 over 0.8 s. */
function burst(x, z, count, rings, time) {
  for (let i = 0; i < count; i++) {
    const a = burstRng() * Math.PI * 2;
    const rad = 0.6 + burstRng() * 0.6;
    spawnSpeck(x, RIPPLE_Y, z, Math.cos(a) * rad, 1.2 + burstRng() * 0.8, Math.sin(a) * rad, 0.6, 4);
  }
  for (let i = 0; i < rings; i++) spawnRipple(x, z, 0.2, 1.6, 0.8, 0.7, 1, time + i * 0.12);
}
function drips(x, z, time) {
  for (let i = 0; i < 3; i++) {
    const a = burstRng() * Math.PI * 2;
    spawnSpeck(x + Math.cos(a) * 0.12, pier ? pier.height + 0.3 : 0.5, z + Math.sin(a) * 0.12, 0, -0.27, 0, 1.5, 0);
  }
}
function updatePools(dt, time) {
  for (let i = 0; i < ripples.meshes.length; i++) {
    const m = ripples.meshes[i];
    const t = time - ripples.t0[i];
    if (t < 0) { m.visible = false; continue; }         // staggered rings wait for their start
    if (t >= ripples.dur[i]) { if (m.visible) m.visible = false; continue; }
    const u = t / ripples.dur[i];
    const s = lerp(ripples.s0[i], ripples.s1[i], easeOut(u));
    m.visible = true; m.scale.set(s * ripples.sx[i], s, 1); m.material.opacity = ripples.a0[i] * (1 - u);
  }
  for (let i = 0; i < specks.meshes.length; i++) {
    const m = specks.meshes[i];
    if (specks.life[i] <= 0) { if (m.visible) m.visible = false; continue; }
    specks.life[i] -= dt;
    specks.vy[i] -= specks.grav[i] * dt;
    specks.x[i] += specks.vx[i] * dt; specks.y[i] += specks.vy[i] * dt; specks.z[i] += specks.vz[i] * dt;
    if (specks.life[i] <= 0 || specks.y[i] < 0.02) { specks.life[i] = 0; m.visible = false; continue; }
    m.position.set(specks.x[i], specks.y[i], specks.z[i]);
    const fade = clamp(specks.life[i] / 0.3, 0, 1);
    m.scale.setScalar(0.7 + 0.3 * fade);
  }
  if (speckMat) speckMat.opacity = 0.9;
}

/* ---------- geometry builders ---------- */
function buildStools(state, g, hAt, placements) {
  const seatMat = mat(BRAND.wood, { roughness: 0.8 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  let n = 0;
  for (const s of state.seats || []) {
    if (s.kind !== 'cafe') continue;
    const x = s.x + 0.5, z = s.y + 0.5, y = hAt(x, z);   // v8: on the terrace plateau
    placements.push({ x, z, y, kind: 'stool' });
    cyl(0.14, 0.14, 0.03, iron, { x, y, z, parent: g, seg: 12 });
    cyl(0.03, 0.03, 0.40, iron, { x, y: y + 0.03, z, parent: g, seg: 8 });
    cyl(0.16, 0.16, 0.05, seatMat, { x, y: y + 0.40, z, parent: g, seg: 16 });
    n++;
  }
  return n;
}

/* The cafe block origin, recovered from the table decos (contract: tables at bx + 9.5 / 12.5, by + 7.5 / 10.5),
   else from the v7 cafe record (its lot origin is bx + 2, by + 1: the tables sit at lot 7.5 / 10.5, 6.5 / 9.5). */
function cafeOrigin(state) {
  let minX = Infinity, minY = Infinity, n = 0;
  for (const d of state.decos || []) {
    if (d.type !== 'table') continue;
    n++; if (d.x < minX) minX = d.x; if (d.y < minY) minY = d.y;
  }
  if (n >= 4) return { bx: Math.round(minX - 9.5), by: Math.round(minY - 7.5), ok: true };
  const cafe = state.cafe;
  if (cafe) {
    const lot = cafe.lot && isFinite(cafe.lot.x) && isFinite(cafe.lot.y) ? cafe.lot : cafe;
    if (isFinite(lot.x) && isFinite(lot.y)) return { bx: Math.round(lot.x - 2), by: Math.round(lot.y - 1), ok: true };
  }
  return { bx: 0, by: 0, ok: false };
}

function buildStringLights(bx, by, g, out, hAt) {
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const posts = [[bx + 8.2, by + 6.4], [bx + 13.8, by + 6.4], [bx + 13.8, by + 11.6], [bx + 8.2, by + 11.6]];
  // v8: each post stands at its own ground height (one height on the terrace plateau)
  const postY = posts.map(p => hAt(p[0], p[1]));
  posts.forEach((p, i) => { cyl(0.05, 0.05, 2.6, iron, { x: p[0], y: postY[i], z: p[1], parent: g, seg: 8 }); out.placements.push({ x: p[0], z: p[1], y: postY[i], kind: 'post' }); });
  const warm = emissiveMat(C.bulb, C.bulbGlow, 0.1);
  const aqua = emissiveMat(BRAND.aqua, BRAND.aqua, 0.05, 0.5);
  out.bulbMats.push(warm, aqua);
  const bulbGeo = new THREE.SphereGeometry(0.055, 10, 8);
  for (let i = 0; i < 4; i++) {
    const a = posts[i], b = posts[(i + 1) % 4], ya = postY[i], yb = postY[(i + 1) % 4];
    const A = new THREE.Vector3(a[0], ya + 2.55, a[1]), B = new THREE.Vector3(b[0], yb + 2.55, b[1]);
    const M = new THREE.Vector3((a[0] + b[0]) / 2, (ya + yb) / 2 + 1.85, (a[1] + b[1]) / 2); // sags to 2.2 at the middle
    const curve = new THREE.QuadraticBezierCurve3(A, M, B);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012, 6, false), iron);
    tube.castShadow = false; tube.receiveShadow = false; g.add(tube);
    for (let k = 1; k <= 11; k++) {
      curve.getPoint(k / 12, V1);
      const bulb = new THREE.Mesh(bulbGeo, (k % 3 === 0) ? aqua : warm);
      bulb.position.set(V1.x, V1.y - 0.08, V1.z);
      bulb.castShadow = false; bulb.receiveShadow = false;
      g.add(bulb);
    }
  }
  const light = new THREE.PointLight(new THREE.Color(C.lampLight), 0, 7, 2);
  light.position.set(bx + 11, hAt(bx + 11, by + 9) + 2.2, by + 9); light.castShadow = false; light.visible = false;
  out.lights.push(light);   // not added to the group; the integrator decides on the light budget
}

function buildTerraceDressing(bx, by, g, out, hAt) {
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const trim = mat(C.trim, { roughness: 0.9 });
  // v8: the terrace sits on the cafe lot's plateau; every piece reads the height under its own base
  const at = (x, z, kind) => { const y = hAt(x, z); out.placements.push({ x, z, y, kind }); return y; };
  // Paving: a checker canvas when a DOM exists, otherwise a flat stone plane
  let paveMat;
  if (hasDocument()) {
    const tex = canvasTex(384, 320, (ctx, w, h) => {
      ctx.fillStyle = C.grout; ctx.fillRect(0, 0, w, h);
      const px = 32; // 0.5 unit squares at 64 px per unit
      for (let yy = 0; yy < h / px; yy++) for (let xx = 0; xx < w / px; xx++) {
        ctx.fillStyle = ((xx + yy) % 2) ? C.pave1 : C.pave2;
        ctx.fillRect(xx * px + 1, yy * px + 1, px - 2, px - 2);
      }
      ctx.strokeStyle = C.grout; ctx.lineWidth = 5; ctx.strokeRect(2.5, 2.5, w - 5, h - 5);
    });
    paveMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  } else {
    paveMat = mat(C.paveFlat, { roughness: 0.95 });
  }
  plane(6.0, 5.0, paveMat, { x: bx + 11, y: at(bx + 11, by + 9, 'paving') + 0.012, z: by + 9, rx: -Math.PI / 2, parent: g, receiveShadow: true });

  // Menu board: A-frame chalkboard on the stub edge
  const menu = new THREE.Group(); menu.position.set(bx + 7.8, at(bx + 7.8, by + 8.5, 'menu'), by + 8.5); g.add(menu);
  let boardMat = iron;
  if (hasDocument()) {
    const tex = canvasTex(128, 180, (ctx, w, h) => {
      ctx.fillStyle = C.iron; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#F8F6F0'; ctx.font = '600 22px Kanit, Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Ice cream 2', w / 2, 70); ctx.fillText('Coffee 1', w / 2, 115);
    });
    boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  }
  const leafA = box(0.5, 0.7, 0.04, boardMat, { parent: menu });
  leafA.position.set(0, 0.35, 0.09); leafA.rotation.x = -0.25;
  const leafB = box(0.5, 0.7, 0.04, iron, { parent: menu });
  leafB.position.set(0, 0.35, -0.09); leafB.rotation.x = 0.25;

  // Ice cream cart north of the tables
  const cart = new THREE.Group(); cart.position.set(bx + 11, at(bx + 11, by + 6.0, 'icecart'), by + 6.0); g.add(cart);
  box(1.2, 0.9, 0.6, trim, { y: 0.18, parent: cart });
  const wheel = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  torus(0.18, 0.04, wheel, { x: -0.45, y: 0.18, z: 0.34, ry: 0, parent: cart });
  torus(0.18, 0.04, wheel, { x: 0.45, y: 0.18, z: 0.34, ry: 0, parent: cart });
  const awnS = mat(BRAND.salmon, { roughness: 0.85, doubleSide: true }), awnW = mat('#FFFFFF', { roughness: 0.85, doubleSide: true });
  for (let i = 0; i < 4; i++) {
    plane(0.325, 0.5, (i % 2) ? awnW : awnS, { x: -0.4875 + i * 0.325, y: 1.3, z: 0.25, rx: -Math.PI / 2 + 0.2, parent: cart });
  }
  cyl(0.02, 0.02, 1.25, iron, { x: -0.55, y: 1.08, z: 0.3, parent: cart, seg: 6 });
  cyl(0.02, 0.02, 1.25, iron, { x: 0.55, y: 1.08, z: 0.3, parent: cart, seg: 6 });
  const domeMat = glass(); domeMat.transparent = true; domeMat.opacity = 0.55;
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  d.position.set(0.2, 1.08, -0.05); d.castShadow = false; cart.add(d);
  for (let i = 0; i < 3; i++) sphere(0.1, mat(SCOOPS[i], { roughness: 0.9 }), { x: 0.2 + (i - 1) * 0.13, y: 1.14, z: -0.05 + (i === 1 ? -0.08 : 0.04), parent: cart });

  // Coffee counter with a steaming espresso machine
  const counter = new THREE.Group(); counter.position.set(bx + 13.6, at(bx + 13.6, by + 9.0, 'counter'), by + 9.0); g.add(counter);
  box(1.0, 0.9, 0.5, mat(C.wood, { roughness: 0.8 }), { parent: counter });
  box(0.5, 0.4, 0.35, mat(BRAND.silver, { roughness: 0.4, metalness: 0.3 }), { x: 0.1, y: 0.9, parent: counter });
  sphere(0.03, glow(BRAND.salmon, 0.4), { x: -0.1, y: 1.15, z: 0.18, parent: counter });
  const steamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.steam), transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
  const st1 = sphere(0.05, steamMat, { x: 0.05, y: 1.35, z: 0, parent: counter, castShadow: false });
  const st2 = sphere(0.05, steamMat, { x: 0.15, y: 1.35, z: -0.05, parent: counter, castShadow: false });
  out.counterSteam = { a: st1, b: st2, mat: steamMat, baseY: 1.35 };

  // Planters along the south edge
  const planter = mat(C.woodDark, { roughness: 0.85 }), hedge = mat(C.hedge, { roughness: 0.9 });
  const dots = [mat(BRAND.salmon, { roughness: 0.9 }), mat('#FFFFFF', { roughness: 0.9 }), mat(C.gold, { roughness: 0.9 })];
  for (const px of [bx + 9.5, bx + 11, bx + 12.5]) {
    const py = at(px, by + 12.4, 'planter');
    box(0.6, 0.35, 0.3, planter, { x: px, y: py, z: by + 12.4, parent: g });
    box(0.55, 0.3, 0.25, hedge, { x: px, y: py + 0.35, z: by + 12.4, radius: 0.08, parent: g });
    for (let i = 0; i < 3; i++) sphere(0.04, dots[i], { x: px - 0.16 + i * 0.16, y: py + 0.66, z: by + 12.4 + (i === 1 ? -0.06 : 0.05), parent: g, castShadow: false });
  }
}

/* The pond record the v7 sim publishes: state.pond, else the pond lot's record. Null on older sims. */
function pondRecord(state) {
  const good = p => p && p.center && isFinite(p.center.x) && isFinite(p.center.y) && p.rx > 0 && p.ry > 0;
  if (good(state.pond)) return state.pond;
  for (const l of state.lots || []) if (l && l.kind === 'pond' && good(l.pond)) return l.pond;
  return null;
}

/* Pond center and radii. In order: the sim's pond record (exact ellipse), the bounding box of the
   swim spots plus shore tiles (both pond only), the water tile list (pre v7 sims, where the pond was
   the only water; on the city map it also holds the river and the hole hazards, so it comes last),
   then pier-based fallbacks. */
function pondShape(state) {
  const spots = state.swimSpots || [];
  const rec = pondRecord(state);
  const shore = state.shoreTiles || [];
  const pondOnly = spots.length || shore.length ? spots.concat(shore) : [];
  const water = state.waterTiles || [];
  const src = rec ? [] : (pondOnly.length ? pondOnly : water);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of src) { if (t.x < minX) minX = t.x; if (t.x > maxX) maxX = t.x; if (t.y < minY) minY = t.y; if (t.y > maxY) maxY = t.y; }
  let cx, cz, rx, rz;
  if (rec) {
    cx = rec.center.x; cz = rec.center.y; rx = rec.rx; rz = rec.ry;
  } else if (src.length) {
    cx = (minX + maxX + 1) / 2; cz = (minY + maxY + 1) / 2;
    rx = Math.max(1.5, (maxX - minX + 1) / 2); rz = Math.max(1.2, (maxY - minY + 1) / 2);
    // shore tiles ring the water one tile out; swim spots alone sit one tile in
    if (shore.length) { rx -= 0.5; rz -= 0.5; } else if (!water.length || pondOnly.length) { rx += 1.5; rz += 1.5; }
  } else if (state.pier && state.pier.base) {
    cx = state.pier.base.x - 0.5; cz = state.pier.tile.y - 4.5; rx = 4.8; rz = 3.6;
  } else {
    cx = 0; cz = 0; rx = 4.8; rz = 3.6;
  }
  // deep region from the swim spots
  let dminX = Infinity, dmaxX = -Infinity, dminY = Infinity, dmaxY = -Infinity;
  for (const t of spots) { if (t.x < dminX) dminX = t.x; if (t.x > dmaxX) dmaxX = t.x; if (t.y < dminY) dminY = t.y; if (t.y > dmaxY) dmaxY = t.y; }
  const deep = spots.length
    ? { cx: (dminX + dmaxX + 1) / 2, cz: (dminY + dmaxY + 1) / 2, rx: (dmaxX - dminX + 1) / 2 + 0.3, rz: (dmaxY - dminY + 1) / 2 + 0.3 }
    : { cx, cz, rx: rx * 0.55, rz: rz * 0.55 };
  return { cx, cz, rx, rz, deep };
}

function nearestShore(state, x, z) {
  let best = null, bd = Infinity;
  for (const t of state.shoreTiles || []) {
    const dx = t.x + 0.5 - x, dz = t.y + 0.5 - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = t; }
  }
  return best ? { x: best.x + 0.5, z: best.y + 0.5 } : { x, z };
}

function buildPondDressing(state, pond, g, out, hAt) {
  // Depth cue over the deep middle
  const deepMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.deep), transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false });
  const deep = new THREE.Mesh(new THREE.CircleGeometry(1, 40), deepMat);
  deep.rotation.x = -Math.PI / 2; deep.position.set(pond.deep.cx, WATER_Y, pond.deep.cz);
  deep.scale.set(pond.deep.rx, pond.deep.rz, 1); deep.castShadow = false; deep.receiveShadow = false; deep.renderOrder = 4;
  g.add(deep);

  // Floating inflatable rings: salmon and aqua (with four white quadrant stripes)
  const ringS = torus(0.35, 0.11, mat(BRAND.salmon, { roughness: 0.6 }), { rx: Math.PI / 2, parent: g });
  const ringAGroup = new THREE.Group(); g.add(ringAGroup);
  torus(0.35, 0.11, mat(BRAND.aqua, { roughness: 0.6 }), { rx: Math.PI / 2, parent: ringAGroup });
  const stripe = mat('#FFFFFF', { roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const s = box(0.14, 0.23, 0.24, stripe, { parent: ringAGroup, castShadow: false });
    s.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35); s.rotation.y = -a;
  }
  out.floaters.push(
    { obj: ringS, cx: pond.cx - 2.4, cz: pond.cz - 1.1, phase: 0.0, lastRipple: -10 },
    { obj: ringAGroup, cx: pond.cx + 2.6, cz: pond.cz + 1.1, phase: 2.1, lastRipple: -1.5 },
  );

  // Lily pads near the north shore
  const lily = mat(C.lily, { roughness: 0.9 }), petal = mat(SCOOPS[0], { roughness: 0.9 });
  const lr = seeded('lilies');
  for (let i = 0; i < 5; i++) {
    const x = pond.cx - 2.0 + i * 1.0 + (lr() - 0.5) * 0.4, z = pond.cz - pond.rz * 0.72 + (lr() - 0.5) * 0.5;
    cyl(0.2, 0.2, 0.02, lily, { x, y: WATER_Y + 0.01, z, parent: g, seg: 12, castShadow: false });
    if (i === 1 || i === 3) sphere(0.06, petal, { x, y: WATER_Y + 0.08, z, parent: g, castShadow: false });
  }
  // Reeds at the north-west, north-east and east shore tiles
  const reed = mat(C.lily, { roughness: 0.9 }), tip = mat(C.woodDark, { roughness: 0.9 });
  const anchors = [[pond.cx - pond.rx * 0.75, pond.cz - pond.rz * 0.75], [pond.cx + pond.rx * 0.75, pond.cz - pond.rz * 0.75], [pond.cx + pond.rx * 1.05, pond.cz]];
  const rr = seeded('reeds');
  for (const a of anchors) {
    const p = nearestShore(state, a[0], a[1]);
    for (let i = 0; i < 5; i++) {
      const h = 0.6 + rr() * 0.3, x = p.x + (rr() - 0.5) * 0.5, z = p.z + (rr() - 0.5) * 0.5;
      const y = hAt(x, z);   // v8: the shore ring sits on the pond plateau
      cyl(0.02, 0.02, h, reed, { x, y, z, parent: g, seg: 5, castShadow: false });
      sphere(0.04, tip, { x, y: y + h, z, parent: g, castShadow: false });
    }
    out.placements.push({ x: p.x, z: p.z, y: hAt(p.x, p.z), kind: 'reeds' });
  }
  // Duck drifting a figure eight
  const duck = new THREE.Group(); g.add(duck);
  sphere(0.12, mat(C.trim, { roughness: 0.9 }), { y: 0.1, parent: duck });
  sphere(0.07, mat(C.trim, { roughness: 0.9 }), { y: 0.24, z: 0.1, parent: duck });
  cone(0.03, 0.08, mat(C.gold, { roughness: 0.8 }), { y: 0.2, z: 0.17, rx: Math.PI / 2, parent: duck, seg: 8 });
  out.duck = { obj: duck, cx: pond.deep.cx, cz: pond.deep.cz, ax: Math.min(1.6, pond.deep.rx * 0.8), az: Math.min(0.8, pond.deep.rz * 0.6), lastRipple: -10 };

  // Lifeguard stand at the east shore (v8: at the terrain height under it)
  const lgY = hAt(pond.cx + 5.3, pond.cz + 0.5);
  out.placements.push({ x: pond.cx + 5.3, z: pond.cz + 0.5, y: lgY, kind: 'lifeguard' });
  const lg = new THREE.Group(); lg.position.set(pond.cx + 5.3, lgY, pond.cz + 0.5); g.add(lg);
  const leg = mat(C.wood, { roughness: 0.8 });
  for (const sx of [-0.25, 0.25]) for (const sz of [-0.2, 0.2]) box(0.07, 1.4, 0.07, leg, { x: sx, y: 0, z: sz, parent: lg });
  box(0.6, 0.5, 0.6, mat(C.trim, { roughness: 0.9 }), { y: 1.4, parent: lg });
  cyl(0.02, 0.02, 0.9, mat(C.iron, { roughness: 0.55, metalness: 0.2 }), { x: 0.2, y: 1.9, parent: lg, seg: 6 });
  cone(0.6, 0.3, mat(BRAND.salmon, { roughness: 0.85, doubleSide: true }), { x: 0.2, y: 2.7, parent: lg, seg: 12 });
  const life = new THREE.Group(); life.position.set(-0.36, 0.9, 0); life.rotation.y = Math.PI / 2; lg.add(life);
  torus(0.25, 0.07, mat(BRAND.salmon, { roughness: 0.6 }), { parent: life });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const s = box(0.1, 0.16, 0.16, stripe, { parent: life, castShadow: false });
    s.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0); s.rotation.z = a;
  }
}

function buildPier(p, g) {
  const plank = mat(C.wood, { roughness: 0.8 });
  const postMat = mat(C.post, { roughness: 0.8 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const H = p.height;
  const x0 = p.base.x;
  const deckLen = p.base.y - p.boardStart.y;          // 2.0
  const planks = 10, pitch = deckLen / planks;         // 0.2 with 0.02 gaps
  for (let i = 0; i < planks; i++) {
    box(1.2, 0.06, pitch - 0.02, plank, { x: x0, y: H - 0.06, z: p.base.y - pitch * (i + 0.5), parent: g });
  }
  for (const z of [p.base.y, p.base.y - 1.0, p.boardStart.y]) {
    cyl(0.08, 0.08, 0.6, postMat, { x: x0 - 0.6, y: 0, z, parent: g, seg: 10 });
    cyl(0.08, 0.08, 0.6, postMat, { x: x0 + 0.6, y: 0, z, parent: g, seg: 10 });
  }
  // Mooring post with rope at the north-east deck corner
  cyl(0.1, 0.1, 0.7, postMat, { x: x0 + 0.5, y: H, z: p.boardStart.y + 0.15, parent: g, seg: 10 });
  torus(0.12, 0.03, plank, { x: x0 + 0.5, y: H + 0.5, z: p.boardStart.y + 0.15, rx: Math.PI / 2, parent: g, castShadow: false });
  // Deck dressing: folded towel and flip-flops
  box(0.3, 0.06, 0.4, mat(BRAND.salmon, { roughness: 0.95 }), { x: x0 - 0.35, y: H, z: p.base.y - 0.45, parent: g, castShadow: false });
  box(0.1, 0.02, 0.22, mat(BRAND.aqua, { roughness: 0.9 }), { x: x0 + 0.3, y: H, z: p.base.y - 0.3, parent: g, castShadow: false });
  box(0.1, 0.02, 0.22, mat(BRAND.aqua, { roughness: 0.9 }), { x: x0 + 0.44, y: H, z: p.base.y - 0.28, parent: g, castShadow: false });

  // Springboard: stand under the board root, board pivoted at the stand about x
  box(0.5, 0.3, 0.4, iron, { x: x0, y: H - 0.3, z: p.boardStart.y - 0.2, parent: g });
  const pivot = new THREE.Group(); pivot.position.set(x0, H, p.boardStart.y); g.add(pivot);
  const boardLen = p.boardStart.y - p.boardEnd.y;      // 1.6
  box(0.5, 0.06, boardLen, mat(BRAND.aqua, { roughness: 0.7 }), { y: 0, z: -boardLen / 2, parent: pivot });
  box(0.5, 0.07, 0.2, mat(C.trim, { roughness: 0.7 }), { y: 0, z: -boardLen + 0.1, parent: pivot });
  board = { pivot, loadAt: -10, weight: 0, bounceAt: -10, springAt: -10 };

  // Ladder: two rails with hooks over the deck edge, four rungs
  const rail = mat(BRAND.silver, { roughness: 0.4, metalness: 0.2 });
  for (const dx of [-0.15, 0.15]) {
    cyl(0.025, 0.025, 1.0, rail, { x: p.ladder.x + dx, y: -0.3, z: p.ladder.y, parent: g, seg: 8, castShadow: false });
    const hook = cyl(0.025, 0.025, 0.3, rail, { parent: g, castShadow: false });
    hook.position.set(p.ladder.x + dx - 0.15, 0.7, p.ladder.y); hook.rotation.z = Math.PI / 2;
  }
  for (const y of [-0.2, 0.05, 0.3, 0.55]) box(0.3, 0.03, 0.03, rail, { x: p.ladder.x, y, z: p.ladder.y, parent: g, castShadow: false });
}

function buildPools(g) {
  // A rebuild (second buildLeisure call) drops the old pool meshes so the fixed-size typed
  // arrays and the mesh lists stay in step.
  for (const m of ripples.meshes) { if (m.parent) m.parent.remove(m); m.material.dispose(); }
  for (const m of specks.meshes) { if (m.parent) m.parent.remove(m); }
  if (ripples.meshes.length) ripples.meshes[0].geometry.dispose();
  if (specks.meshes.length) specks.meshes[0].geometry.dispose();
  if (speckMat) speckMat.dispose();
  ripples.meshes.length = 0; ripples.next = 0; ripples.t0.fill(-100);
  specks.meshes.length = 0; specks.next = 0; specks.life.fill(0);
  const rippleGeo = new THREE.TorusGeometry(0.3, 0.02, 6, 32);
  for (let i = 0; i < RIPPLE_COUNT; i++) {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = Math.PI / 2; m.position.y = RIPPLE_Y; m.renderOrder = 5; m.visible = false;
    m.castShadow = false; m.receiveShadow = false;
    g.add(m); ripples.meshes.push(m);
  }
  speckMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const speckGeo = new THREE.SphereGeometry(0.04, 8, 6);
  for (let i = 0; i < SPLASH_COUNT; i++) {
    const m = new THREE.Mesh(speckGeo, speckMat);
    m.visible = false; m.renderOrder = 5; m.castShadow = false; m.receiveShadow = false;
    g.add(m); specks.meshes.push(m);
  }
}

/* ---------- buildLeisure ---------- */
export function buildLeisure(ctx) {
  const state = (ctx && ctx.state) || {};
  const group = new THREE.Group();
  group.name = 'leisure';
  // v8: the terrain height under a world point (flat 0 without a renderer height function)
  const rawH = ctx && typeof ctx.heightAt === 'function' ? ctx.heightAt : null;
  const hAt = rawH ? (x, z) => { const y = rawH(x, z); return finite(y) ? y : 0; } : () => 0;
  const out = { bulbMats: [], lights: [], floaters: [], counterSteam: null, duck: null, stools: 0, placements: [] };

  out.stools = buildStools(state, group, hAt, out.placements);
  const co = cafeOrigin(state);
  if (co.ok) {
    buildStringLights(co.bx, co.by, group, out, hAt);
    buildTerraceDressing(co.bx, co.by, group, out, hAt);
  }

  pier = null; board = null;
  if (state.pier && state.pier.base && state.pier.boardStart && state.pier.boardEnd && state.pier.ladder) {
    const p = state.pier;
    pier = {
      tile: { x: p.tile ? p.tile.x : Math.floor(p.base.x), y: p.tile ? p.tile.y : Math.floor(p.base.y) },
      base: { x: p.base.x, y: p.base.y }, boardStart: { x: p.boardStart.x, y: p.boardStart.y },
      boardEnd: { x: p.boardEnd.x, y: p.boardEnd.y }, landing: { x: p.landing ? p.landing.x : p.boardEnd.x, y: p.landing ? p.landing.y : p.boardEnd.y - 1.9 },
      ladder: { x: p.ladder.x, y: p.ladder.y }, height: finite(p.height) ? p.height : 0.5,
    };
    buildPier(pier, group);
  }
  const pond = pondShape(state);
  buildPondDressing(state, pond, group, out, hAt);
  buildPools(group);
  group.userData.placements = out.placements;

  const floaters = out.floaters, duck = out.duck, steam = out.counterSteam, bulbs = out.bulbMats, lights = out.lights;

  function update(dt, time, night) {
    if (!finite(dt) || dt < 0) dt = 0; if (dt > 0.1) dt = 0.1;
    if (!finite(time)) time = clock + dt;
    clock = time;
    const n = finite(night) ? clamp(night, 0, 1) : 0;
    const ramp = clamp((n - 0.25) / 0.75, 0, 1);
    if (bulbs.length) { bulbs[0].emissiveIntensity = 0.1 + 1.6 * ramp; bulbs[1].emissiveIntensity = 0.05 + 0.8 * ramp; }
    for (let i = 0; i < lights.length; i++) { lights[i].intensity = 10 * ramp; lights[i].visible = ramp > 0; }

    // Floating rings: bob, rock, drift on a 0.4 circle over 40 s, yaw 0.1 rad per s, faint ripple every 3 s
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i], o = f.obj;
      const da = time * Math.PI * 2 / 40 + f.phase;
      o.position.set(f.cx + Math.cos(da) * 0.4, 0.08 + 0.06 * Math.sin(Math.PI * 2 * 0.35 * time + f.phase), f.cz + Math.sin(da) * 0.4);
      const rock = 0.05 * Math.sin(time * 1.7 + f.phase);
      if (o.isGroup) { o.rotation.x = rock; o.rotation.z = 0.05 * Math.cos(time * 1.3 + f.phase); o.rotation.y = time * 0.1; }
      else { o.rotation.x = Math.PI / 2 + rock; o.rotation.z = time * 0.1; }
      if (time - f.lastRipple > 3) { f.lastRipple = time; spawnRipple(o.position.x, o.position.z, 0.4, 1.0, 1.6, 0.3, 1, time); }
    }
    // Duck on a slow figure eight
    if (duck) {
      const w = 0.19, t = time * w;
      const x = duck.cx + duck.ax * Math.sin(t), z = duck.cz + duck.az * Math.sin(2 * t);
      const vx = duck.ax * w * Math.cos(t), vz = duck.az * 2 * w * Math.cos(2 * t);
      duck.obj.position.set(x, WATER_Y + 0.02 * Math.sin(time * 2.2), z);
      if (vx * vx + vz * vz > 1e-6) duck.obj.rotation.y = Math.atan2(vx, vz);
      if (time - duck.lastRipple > 1.2) { duck.lastRipple = time; spawnRipple(x, z, 0.25, 0.7, 1.2, 0.25, 1, time); }
    }
    // Espresso steam: rises 0.4 and fades every 3 s
    if (steam) {
      const u = (time % 3) / 3;
      steam.a.position.y = steam.baseY + 0.4 * u; steam.b.position.y = steam.baseY + 0.4 * ((u + 0.5) % 1);
      steam.mat.opacity = 0.5 * (1 - u);
    }
    // Springboard flex: weight eased 0.2 s, bounce dips, landing spring
    if (board) {
      const loaded = time - board.loadAt < 0.12 ? 1 : 0;
      board.weight += (loaded - board.weight) * (1 - Math.exp(-dt / 0.2));
      let a = -BOARD_FLEX * board.weight;
      const bt = time - board.bounceAt;
      if (bt >= 0 && bt < BOUNCE_LEN) a = -BOARD_FLEX * Math.max(board.weight, Math.abs(Math.sin(Math.PI * bt / (BOUNCE_LEN / 2))));
      const st = time - board.springAt;
      if (st >= 0 && st < 0.5) a += BOARD_FLEX * 0.5 * (1 - st / 0.5) * Math.cos(Math.PI * 2 * st / 0.33);
      board.pivot.rotation.x = a;
    }
    updatePools(dt, time);
    sweepTracked(time);
  }

  return { group, update, lights, pier, stoolCount: out.stools };
}

/* ---------- v10: the soft highlight ring for the targeted interactable ----------
   A flat disc with a soft-edged ring painted on a canvas (radial alpha: clear inside, a bright band
   at 0.72 to 0.9 of the radius with blurred edges, clear outside) in the brand aqua, drawn additive
   without depth writes so it reads on paving, grass and water alike. Without a document (Node) the
   ring is a RingGeometry in the same material. The renderer owns placement:
     const hi = createHighlightRing({ color, opacity, y })
     scene.add(hi.mesh)
     hi.target(x, y, z, radius)   // every frame the target exists (y is the ground height there)
     hi.clear()                   // when nothing is targeted
     hi.update(dt, time)          // once per frame: fades in over 0.12 s, out over 0.2 s, breathes 6 percent
   hi.active is true while the ring is visible; hi.setColor(hex) retints it. */
export function createHighlightRing(opts) {
  const o = opts || {};
  const colorHex = typeof o.color === 'string' ? o.color : BRAND.aqua;
  const maxOpacity = finite(o.opacity) ? clamp(o.opacity, 0, 1) : 0.85;
  const lift = finite(o.y) ? o.y : 0.02;
  let map = null;
  if (hasDocument()) {
    map = canvasTex(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255, 255, 255, 0)');
      g.addColorStop(0.62, 'rgba(255, 255, 255, 0)');
      g.addColorStop(0.74, 'rgba(255, 255, 255, 0.55)');
      g.addColorStop(0.82, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.9, 'rgba(255, 255, 255, 0.45)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  }
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex), map, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const geometry = map ? new THREE.PlaneGeometry(2, 2) : new THREE.RingGeometry(0.74, 0.9, 48);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 6;
  mesh.visible = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'highlightRing';
  const st = { wanted: false, alpha: 0, radius: 1, tx: 0, ty: 0, tz: 0, placed: false };
  const ring = {
    mesh, active: false,
    target(x, y, z, radius) {
      if (!finite(x) || !finite(z)) return;
      st.tx = x; st.ty = finite(y) ? y : 0; st.tz = z;
      st.radius = finite(radius) && radius > 0.05 ? radius : 1;
      if (!st.wanted || !st.placed) { mesh.position.set(x, st.ty + lift, z); st.placed = true; }
      st.wanted = true;
    },
    clear() { st.wanted = false; },
    setColor(hex) { if (typeof hex === 'string') material.color.set(hex); },
    update(dt, time) {
      if (!finite(dt) || dt < 0) dt = 0; if (dt > 0.1) dt = 0.1;
      if (!finite(time)) time = clock;
      const goal = st.wanted ? 1 : 0;
      st.alpha += (goal - st.alpha) * (1 - Math.exp(-dt / (st.wanted ? 0.12 : 0.2)));
      if (goal === 0 && st.alpha < 0.01) st.alpha = 0;
      if (st.wanted) {
        // glide to a new target so a switch between two neighbours slides instead of jumping
        const k = 1 - Math.exp(-dt / 0.06);
        mesh.position.x += (st.tx - mesh.position.x) * k;
        mesh.position.y += (st.ty + lift - mesh.position.y) * k;
        mesh.position.z += (st.tz - mesh.position.z) * k;
      }
      const breathe = st.radius * (1 + 0.06 * Math.sin(Math.PI * 2 * 1.1 * time));
      mesh.scale.set(breathe, breathe, 1);
      material.opacity = maxOpacity * st.alpha * (0.85 + 0.15 * Math.sin(Math.PI * 2 * 1.1 * time));
      mesh.visible = st.alpha > 0;
      ring.active = mesh.visible;
    },
    dispose() { geometry.dispose(); material.dispose(); if (map) map.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
  return ring;
}

/* Handles that stopped being animated: waders splash as they step out, climbers drip on the deck. */
function sweepTracked(time) {
  for (let i = tracked.length - 1; i >= 0; i--) {
    const h = tracked[i], ls = h.leisureState;
    if (!ls || time - ls.lastSeen < 0.15) continue;
    if (ls.wadeLeaving) burst(ls.lastX, ls.lastZ, 5, 1, time);
    if (ls.phase === 'climbing' && pier) drips(pier.base.x, pier.base.y, time);
    ls.phase = ''; ls.wadeLeaving = false; ls.tracked = false; ls.splashAt = -1;
    tracked[i] = tracked[tracked.length - 1]; tracked.pop();
  }
}

/* ---------- props ---------- */
const propPool = { icecream: [], coffee: [] };

function makeIceCream(seedStr) {
  const g = new THREE.Group();
  const r = seeded('prop' + seedStr);
  const c1 = SCOOPS[Math.floor(r() * SCOOPS.length)];
  let c2 = SCOOPS[Math.floor(r() * SCOOPS.length)]; if (c2 === c1) c2 = SCOOPS[(SCOOPS.indexOf(c1) + 1) % SCOOPS.length];
  const k = cone(0.1, 0.26, mat(C.cone, { roughness: 0.9 }), { parent: g, castShadow: false, seg: 12 });
  k.rotation.x = Math.PI; k.position.y = 0.13;          // tip down, rim at y 0.26
  sphere(0.11, mat(c1, { roughness: 0.9 }), { y: 0.26, parent: g, castShadow: false });
  const top = sphere(0.11, mat(c2, { roughness: 0.9 }), { y: 0.42, parent: g, castShadow: false });
  sphere(0.03, mat(c1, { roughness: 0.9 }), { x: 0.07, y: 0.22, z: 0.05, parent: g, castShadow: false });
  g.scale.setScalar(PROP_SCALE);
  return { kind: 'icecream', group: g, top, cup: null, steam: null, steamMat: null, licks: 0 };
}
function makeCoffee() {
  const g = new THREE.Group();
  const cupG = new THREE.Group(); g.add(cupG);
  cyl(0.09, 0.09, 0.16, mat('#FFFFFF', { roughness: 0.6 }), { parent: cupG, castShadow: false, seg: 16 });
  cyl(0.092, 0.092, 0.03, mat(BRAND.navy, { roughness: 0.6 }), { y: 0.1, parent: cupG, castShadow: false, seg: 16 });
  cyl(0.08, 0.08, 0.01, mat(C.coffee, { roughness: 0.5 }), { y: 0.155, parent: cupG, castShadow: false, seg: 16 });
  torus(0.05, 0.015, mat('#FFFFFF', { roughness: 0.6 }), { x: 0.12, y: 0.08, parent: cupG, castShadow: false });
  const steamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.steam), transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
  const s1 = sphere(0.035, steamMat, { x: -0.02, y: 0.22, parent: g, castShadow: false });
  const s2 = sphere(0.028, steamMat, { x: 0.03, y: 0.3, z: 0.02, parent: g, castShadow: false });
  g.scale.setScalar(PROP_SCALE);
  return { kind: 'coffee', group: g, top: null, cup: cupG, steam: [s1, s2], steamMat, licks: 0 };
}

export function attachProp(handle, kind) {
  if (!handle || !handle.group) return null;
  if (kind !== 'icecream' && kind !== 'coffee') kind = 'coffee';
  if (handle.leisureProp) {
    if (handle.leisureProp.kind === kind) return handle.leisureProp.group;
    detachProp(handle);
  }
  const parent = (handle.parts && handle.parts.handR) || handle.group;
  let prop = propPool[kind].pop();
  if (!prop) prop = kind === 'icecream' ? makeIceCream(handle.seed) : makeCoffee();
  else if (kind === 'icecream') {
    // recolor from the pool for this alien's seed
    const r = seeded('prop' + handle.seed);
    const c1 = SCOOPS[Math.floor(r() * SCOOPS.length)];
    let c2 = SCOOPS[Math.floor(r() * SCOOPS.length)]; if (c2 === c1) c2 = SCOOPS[(SCOOPS.indexOf(c1) + 1) % SCOOPS.length];
    prop.top.material = mat(c2, { roughness: 0.9 });
    prop.group.children[1].material = mat(c1, { roughness: 0.9 });
  }
  prop.group.position.set(0, 0, 0); prop.group.rotation.set(0, 0, 0); prop.group.visible = true;
  if (prop.top) prop.top.scale.setScalar(1);
  if (prop.cup) prop.cup.rotation.set(0, 0, 0);
  if (prop.steamMat) prop.steamMat.opacity = 0.5;
  prop.licks = 0;
  parent.add(prop.group);
  handle.leisureProp = prop;
  handle.sipPhase = 0;
  return prop.group;
}

export function detachProp(handle) {
  if (!handle || !handle.leisureProp) return;
  const prop = handle.leisureProp;
  if (prop.group.parent) prop.group.parent.remove(prop.group);
  if (prop.top) prop.top.scale.setScalar(1);
  prop.licks = 0;
  propPool[prop.kind].push(prop);
  handle.leisureProp = null;
  handle.sipPhase = 0;
}

/* ---------- per-handle animation ---------- */
function stateFor(handle) {
  let ls = handle.leisureState;
  if (!ls) {
    ls = handle.leisureState = {
      phase: '', phaseStart: 0, lastSeen: -10, lastX: 0, lastZ: 0, tracked: false,
      splashAt: -1, lastRipple: -10, rippleSide: 0, lastWake: -10, wadeLeaving: false,
      sipCycle: -1, licked: false, steamT0: 0, sipYaw: 0,
    };
  }
  return ls;
}
function track(handle, ls) {
  if (ls.tracked) return;
  if (tracked.length < 256) { tracked.push(handle); ls.tracked = true; }
}
function moveDirZ(md) { return md ? (finite(md.z) ? md.z : (finite(md.y) ? md.y : 0)) : 0; }

/* Vertical offset for a swimmer from the sim fields (board, arc, splash dip, ladder).
   Returns a module-scope scratch object { y, boardLoad }. */
export function swimOffsets(handle, agent, time) {
  const L = agent.leisure || null;
  const phase = L ? (L.phase || '') : '';
  const H = pier ? pier.height : 0.5;
  const ls = handle && handle.leisureState;
  let y = SWIM_DEPTH;
  scratch.boardLoad = false;
  const jt = finite(agent.jumpT) ? agent.jumpT : 0;
  if (phase === 'diving' || (jt > 0 && jt < 1)) {
    // CONTRACT: the board height blends out over the arc so the alien reaches water level
    // at jumpT 1, and the last 15 percent eases into the 0.25 splash dip, so the landing
    // is continuous with the swimming phase instead of a 0.75 unit step.
    const k = clamp(jt, 0, 1);
    const plunge = clamp((k - 0.85) / 0.15, 0, 1);
    y = H * (1 - k) + 1.4 * Math.sin(Math.PI * k) - 0.25 * plunge * plunge;
  } else if (agent.onBoard || phase === 'boarding' || phase === 'bouncing') {
    y = H;
    if (phase === 'bouncing' && ls) {
      const bt = time - ls.phaseStart;
      if (bt >= 0 && bt < BOUNCE_LEN) y += 0.08 * Math.abs(Math.sin(Math.PI * bt / (BOUNCE_LEN / 2)));
    }
    if (pier && agent.pos && agent.pos.y < pier.boardStart.y + 0.05) scratch.boardLoad = true;
  } else if (phase === 'climbing') {
    const t = ls ? clamp((time - ls.phaseStart) / CLIMB_LEN, 0, 1) : 1;
    y = lerp(SWIM_DEPTH, H, easeOut(t));
  } else {
    y = SWIM_DEPTH + 0.04 * Math.sin(Math.PI * 2 * 1.0 * time + (ls ? ls.sipYaw : 0));
    const sp = finite(agent.splash) ? time - agent.splash : -1;
    if (sp >= 0 && sp < 0.3) y -= 0.25 * (1 - easeOut(sp / 0.3));
  }
  scratch.y = finite(y) ? y : 0;
  return scratch;
}

function onPhaseChange(handle, ls, agent, phase, time) {
  const L = agent.leisure;
  const g = handle.group;
  if (phase === 'bouncing' && board) board.bounceAt = time;
  if (phase === 'swimming') {
    const sp = finite(agent.splash) ? time - agent.splash : -1;
    // Wading entry without a sim splash: splash anyway so entering the water always reads
    if (!(sp >= 0 && sp < 0.9) && ls.phase !== 'diving') burst(g.position.x, g.position.z, 8, 2, time);
  }
  if (phase === 'climbing' && pier) burst(pier.ladder.x, pier.ladder.y, 4, 1, time);
  // Waders stepping out at the water edge splash there (the sim's wadingOut phase); the
  // sweep fallback below still covers a wader that leaves straight from 'leaving'.
  if (phase === 'wadingOut') burst(g.position.x, g.position.z, 5, 1, time);
  if (phase === 'leaving' && L && !L.dive) ls.wadeLeaving = true;
  if (phase !== 'leaving') ls.wadeLeaving = false;
}

function animateSeated(handle, agent, ls, time, dt) {
  const prop = handle.leisureProp;
  if (!prop) { handle.sipPhase = 0; return; }
  const cycleT = time % SIP_PERIOD;
  const cycle = Math.floor(time / SIP_PERIOD);
  let sip = 0;
  if (cycleT < SIP_LEN) {
    const u = cycleT / SIP_LEN;
    sip = easeInOut(1 - Math.abs(2 * u - 1));
    if (cycle !== ls.sipCycle && u > 0.45) {
      ls.sipCycle = cycle;
      if (prop.top) { const s = Math.max(0.6, prop.top.scale.x * 0.96); prop.top.scale.setScalar(s); prop.licks++; }
    }
  }
  handle.sipPhase = sip;
  if (prop.cup) prop.cup.rotation.x = -0.4 * sip;
  if (prop.steam) {
    if (sip < 0.05) ls.steamT0 += dt;              // steam pauses during a sip
    const u = (ls.steamT0 % STEAM_LEN) / STEAM_LEN;
    prop.steam[0].position.y = 0.22 + STEAM_RISE * u;
    prop.steam[1].position.y = 0.3 + STEAM_RISE * ((u + 0.5) % 1);
    prop.steamMat.opacity = 0.5 * (1 - u) * (1 - sip);
  }
}

function animateSwimmer(handle, agent, ls, time, dt) {
  const g = handle.group;
  const L = agent.leisure;
  const phase = L.phase || '';
  const off = swimOffsets(handle, agent, time);
  g.position.y = off.y;
  if (off.boardLoad && board) board.loadAt = time;

  // Splash burst once per agent.splash stamp
  const sp = finite(agent.splash) ? time - agent.splash : -1;
  if (sp >= 0 && sp < 0.9 && ls.splashAt !== agent.splash) {
    ls.splashAt = agent.splash;
    burst(g.position.x, g.position.z, 9, 2, time);
    if (board && L.dive && phase !== 'climbing') board.springAt = time;
  }

  // Orientation: along moveDir while in the water, toward the deck on the ladder, north on the board
  const md = agent.moveDir;
  const mx = md && finite(md.x) ? md.x : 0, mz = moveDirZ(md);
  if (phase === 'climbing') {
    g.rotation.y = pier ? Math.atan2(pier.base.x - pier.ladder.x, pier.base.y - pier.ladder.y) : g.rotation.y;
  } else if (phase === 'boarding' || phase === 'bouncing' || phase === 'diving') {
    g.rotation.y = Math.PI;      // facing north along the board
  } else if (mx * mx + mz * mz > 1e-6) {
    g.rotation.y = Math.atan2(mx, mz);
  }

  // Ripples while in the water and moving
  const inWater = phase === 'swimming' || phase === 'leaving';
  if (inWater && !agent.paused) {
    if (time - ls.lastRipple >= 0.7) {
      ls.lastRipple = time; ls.rippleSide ^= 1;
      spawnRipple(g.position.x, g.position.z, 0.3, 1.1, 1.4, 0.6, 1, time);
    }
    if (time - ls.lastWake >= 0.9) {
      ls.lastWake = time;
      const len = Math.sqrt(mx * mx + mz * mz) || 1;
      spawnRipple(g.position.x - (mx / len) * 0.3, g.position.z - (mz / len) * 0.3, 0.3, 1.1, 1.4, 0.3, 1.6, time);
    }
  }
}

export function animateLeisure(handle, agent, time, dt) {
  if (!handle || !handle.group || !agent) return;
  if (!finite(time)) time = clock;
  if (!finite(dt) || dt < 0) dt = 0; if (dt > 0.1) dt = 0.1;
  const L = agent.leisure;
  if (!L) { handle.sipPhase = 0; return; }
  const ls = stateFor(handle);
  track(handle, ls);
  ls.lastSeen = time; ls.lastX = handle.group.position.x; ls.lastZ = handle.group.position.z;
  const phase = L.phase || '';
  if (phase !== ls.phase) { onPhaseChange(handle, ls, agent, phase, time); ls.phase = phase; ls.phaseStart = time; }
  if (L.kind === 'swim') {
    handle.sipPhase = 0;
    animateSwimmer(handle, agent, ls, time, dt);
  } else if (phase === 'seated') {
    animateSeated(handle, agent, ls, time, dt);
  } else {
    handle.sipPhase = 0;
  }
}
