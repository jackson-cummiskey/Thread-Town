/* Thread Town: the founder's statue (v14).
   A very large golden figure on a navy pedestal at the north end of the plaza, facing the
   fountain: the founder at his desk, headset on, napkin tucked in, a wing on its way to his mouth
   and a heaped plate in front of him. A halo of stars turns above his head, because subtle was
   not the brief. The plaque on the pedestal names him; E in front of it opens the full note.

   buildStatue(ctx) -> { group, update(dt, time, night), frontPos, near(px, pz), open(), close(),
                         isOpen(), counts }
     ctx: { x, z, y, yaw }   the pedestal center on the ground (world units) and its facing
   The figure is built in local space facing +z and merged per material (six meshes plus the
   halo). The note is a small DOM card (#plaque-modal) owned by this module. */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const STATUE = {
  FOOT: 3,            // tiles per side the pedestal stands on
  PED_H: 2.05,        // pedestal height
  FIG: 1.45,          // the figure's scale on top of the pedestal
  REACH: 2.2,         // how near the front tile the plaque prompt shows
  HALO_SPIN: 0.6,     // rad per second
};

export const PLAQUE = {
  title: 'Our great founder',
  name: 'Jackson Cummiskey',
  line: 'Founder of Thread Town, 2026',
  note: [
    'In the autumn of 2026 he looked at a list of AI agents and asked a simple question: what if it were a town. Fourteen versions later there was a hill, a bluff, a river, a lake, a creek, twelve departments, a zoo for Risk, a subway, a fleet of scooters, a hoverboard, four boats and Thread National, nine holes, par 35.',
    'He wrote none of the code and all of the vision, usually with typos and always with confidence. He tested every version himself. He asked for the bridges to be fixed three times and was right every time.',
    'He wanted the board to see what every team was doing with AI, and he wanted it to be fun. Both are now true.',
    'He left Thread on 10 November 2026. The statue was his idea. So were the wings.',
  ],
};

const COL = {
  gold: 0xD9AE2F, bronze: 0x5A3A1E, sauce: 0xD9601A, white: 0xF4F1EA, black: 0x15181C,
  navy: 0x002D4F, silver: 0xE2E9EE, aqua: 0x75CCD0,
};

function material(hex, rough, metal, env) {
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
  m.userData.envMapIntensity = env;
  return m;
}

/* A deterministic generator so the hair, the wings and the drips are the same on every load. */
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/* An ellipsoid: a sphere of radius r scaled (sx, sy, sz), turned (rx, ry, rz), at (x, y, z). */
function blob(r, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, seg = 14) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4));
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  return g.applyMatrix4(_m);
}
function boxAt(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
  return g.applyMatrix4(_m);
}
/* A tapered limb from point a to point b. */
function limb(ax, ay, az, bx, by, bz, r0, r1, seg = 12) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  _p.copy(_b).sub(_a).normalize();
  _q.setFromUnitVectors(_up, _p);
  _m.compose(_p.copy(_a).add(_b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  return g.applyMatrix4(_m);
}
function cylAt(rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 20) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
  return g.applyMatrix4(_m);
}

function plaqueTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const draw = () => {
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#0B2740'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = '#D9AE2F'; g.lineWidth = 14; g.strokeRect(18, 18, 988, 476);
    g.lineWidth = 3; g.strokeRect(40, 40, 944, 432);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#D9AE2F'; g.font = '600 62px Kanit, Inter, Arial, sans-serif';
    g.fillText(PLAQUE.title, 512, 122);
    g.fillStyle = '#FFFFFF'; g.font = '700 104px Kanit, Inter, Arial, sans-serif';
    g.fillText(PLAQUE.name, 512, 250);
    g.fillStyle = '#75CCD0'; g.font = '500 46px Kanit, Inter, Arial, sans-serif';
    g.fillText(PLAQUE.line, 512, 362);
    g.fillStyle = '#E2E9EE'; g.font = '400 30px Inter, Arial, sans-serif';
    g.fillText('Press E to read of his works', 512, 432);
  }
  t.needsUpdate = true;
  };
  draw();
  // the brand font may load after the world is built: draw again when the fonts are in
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw, () => {}); } catch (e) { /* no font loading API */ }
  return t;
}

/* The note card: one DOM node, built on first use. */
function makeCard() {
  let el = null, open = false;
  function build() {
    if (el || typeof document === 'undefined' || !document.body) return;
    el = document.createElement('div');
    el.id = 'plaque-modal';
    el.setAttribute('aria-hidden', 'true');
    const card = document.createElement('div');
    card.className = 'card plaque-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'plaque-title');
    const kicker = document.createElement('p'); kicker.className = 'plaque-kicker'; kicker.textContent = PLAQUE.title;
    const h = document.createElement('h2'); h.id = 'plaque-title'; h.textContent = PLAQUE.name;
    const line = document.createElement('p'); line.className = 'plaque-line'; line.textContent = PLAQUE.line;
    card.appendChild(kicker); card.appendChild(h); card.appendChild(line);
    for (const t of PLAQUE.note) { const p = document.createElement('p'); p.className = 'plaque-note'; p.textContent = t; card.appendChild(p); }
    const actions = document.createElement('div'); actions.className = 'actions';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn primary'; btn.textContent = 'Salute and close';
    btn.addEventListener('click', () => api.close());
    actions.appendChild(btn); card.appendChild(actions);
    el.appendChild(card);
    el.addEventListener('click', ev => { if (ev.target === el) api.close(); });
    document.body.appendChild(el);
  }
  const api = {
    open() { build(); if (!el) return false; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); open = true; return true; },
    close() { if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); } open = false; },
    isOpen() { return open; },
  };
  return api;
}

export function buildStatue(ctx) {
  ctx = ctx || {};
  const group = new THREE.Group(); group.name = 'statue';
  const M = {
    gold: material(COL.gold, 0.22, 1.0, 1.25),
    bronze: material(COL.bronze, 0.45, 0.85, 0.8),
    sauce: material(COL.sauce, 0.32, 0.0, 0.45),
    white: material(COL.white, 0.6, 0.0, 0.35),
    black: material(COL.black, 0.5, 0.2, 0.4),
    navy: material(COL.navy, 0.7, 0.05, 0.3),
    silver: material(COL.silver, 0.75, 0.05, 0.3),
  };
  M.sauce.emissive = new THREE.Color(COL.sauce); M.sauce.emissiveIntensity = 0.12;
  M.gold.emissive = new THREE.Color(0x6A4A00); M.gold.emissiveIntensity = 0.18;
  const parts = { gold: [], bronze: [], sauce: [], white: [], black: [], navy: [], silver: [] };
  const R = lcg(20261110);
  const H = STATUE.PED_H;

  /* ---- pedestal (unscaled) ---- */
  parts.silver.push(boxAt(2.95, 0.35, 2.95, 0, 0.175, 0));
  parts.navy.push(boxAt(2.55, 1.5, 2.55, 0, 1.1, 0));
  parts.gold.push(boxAt(2.75, 0.2, 2.75, 0, 1.95, 0));
  parts.gold.push(boxAt(2.62, 0.08, 2.62, 0, 0.39, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.gold.push(blob(0.16, sx * 1.36, 2.14, sz * 1.36));   // corner orbs

  /* ---- the figure, in its own frame (y = 0 on the pedestal top), scaled by FIG ---- */
  const fig = { gold: [], bronze: [], sauce: [], white: [], black: [] };
  // torso and shoulders
  fig.gold.push(blob(1.0, 0, 1.0, -0.35, 1.38, 1.18, 0.98));
  fig.gold.push(blob(0.55, -1.0, 1.55, -0.3, 1.1, 0.9, 0.95));
  fig.gold.push(blob(0.55, 1.0, 1.55, -0.3, 1.1, 0.9, 0.95));
  // collar
  fig.gold.push(limb(-0.42, 2.0, 0.12, 0, 1.78, 0.42, 0.1, 0.08));
  fig.gold.push(limb(0.42, 2.0, 0.12, 0, 1.78, 0.42, 0.1, 0.08));
  // head, jowls, ears, nose
  fig.gold.push(blob(0.74, 0, 2.72, -0.2, 1.0, 1.06, 0.96, 0, 0, 0, 20));
  fig.gold.push(blob(0.56, 0, 2.3, -0.08, 1.32, 0.78, 1.0));
  fig.gold.push(blob(0.15, -0.74, 2.68, -0.22, 0.6, 1, 0.8));
  fig.gold.push(blob(0.15, 0.74, 2.68, -0.22, 0.6, 1, 0.8));
  fig.gold.push(blob(0.14, 0, 2.68, 0.5, 1, 0.9, 1));
  // heavy eyelids
  fig.gold.push(blob(0.13, -0.27, 2.86, 0.42, 1.1, 0.55, 0.7));
  fig.gold.push(blob(0.13, 0.27, 2.86, 0.42, 1.1, 0.55, 0.7));
  // eyes (half shut), brows, mustache, the open mouth
  fig.black.push(boxAt(0.2, 0.035, 0.05, -0.27, 2.8, 0.49));
  fig.black.push(boxAt(0.2, 0.035, 0.05, 0.27, 2.8, 0.49));
  fig.bronze.push(boxAt(0.3, 0.07, 0.08, -0.28, 3.0, 0.45, 0, 0, 0.12));
  fig.bronze.push(boxAt(0.3, 0.07, 0.08, 0.28, 3.0, 0.45, 0, 0, -0.12));
  fig.bronze.push(blob(0.17, -0.2, 2.5, 0.5, 1.7, 0.62, 0.7, 0, 0, 0.42));
  fig.bronze.push(blob(0.17, 0.2, 2.5, 0.5, 1.7, 0.62, 0.7, 0, 0, -0.42));
  fig.black.push(blob(0.19, 0.02, 2.36, 0.4, 1.1, 0.95, 0.7));
  // curly hair: a cap of small spheres over the top, the back and the sides
  for (let i = 0; i < 46; i++) {
    const az = R() * Math.PI * 2, el = 0.12 + R() * 1.25;          // el from the crown down
    const rx = Math.sin(el) * Math.cos(az), ry = Math.cos(el), rz = Math.sin(el) * Math.sin(az);
    if (rz > 0.42 && ry < 0.72) continue;                            // keep the face clear
    const r = 0.17 + R() * 0.1;
    fig.bronze.push(blob(r, rx * 0.74, 2.72 + ry * 0.8, -0.2 + rz * 0.72, 1, 1, 1, 0, 0, 0, 8));
  }
  for (let i = 0; i < 7; i++) fig.bronze.push(blob(0.2, -0.5 + i * 0.167 + (R() - 0.5) * 0.05, 3.38 + (R() - 0.5) * 0.08, 0.26, 1, 1, 1, 0, 0, 0, 8));   // the fringe
  // headset: the band, two cups, the boom and its mic
  const band = new THREE.TorusGeometry(0.8, 0.05, 8, 28, Math.PI);
  band.applyMatrix4(_m.compose(_p.set(0, 2.72, -0.2), _q.identity(), _s.set(1, 1.05, 1)));
  fig.black.push(band);
  fig.black.push(cylAt(0.22, 0.22, 0.14, -0.8, 2.66, -0.2, 0, 0, Math.PI / 2));
  fig.black.push(cylAt(0.22, 0.22, 0.14, 0.8, 2.66, -0.2, 0, 0, Math.PI / 2));
  fig.black.push(limb(0.8, 2.56, -0.12, 0.5, 2.24, 0.52, 0.03, 0.03, 8));
  fig.black.push(blob(0.1, 0.46, 2.22, 0.56, 1.25, 1, 1));
  // the right arm (the viewer's left) brings the wing to the mouth
  fig.gold.push(limb(-1.2, 1.6, -0.25, -1.5, 0.95, 0.42, 0.36, 0.3));
  fig.gold.push(limb(-1.5, 0.95, 0.42, -0.42, 2.22, 0.66, 0.3, 0.24));
  fig.gold.push(blob(0.33, -0.36, 2.26, 0.68, 1.1, 0.95, 0.9));
  for (let i = 0; i < 4; i++) fig.gold.push(limb(-0.4 + i * 0.1, 2.44, 0.78, -0.3 + i * 0.1, 2.34, 1.0, 0.075, 0.065, 8));   // fingers over the wing
  fig.sauce.push(blob(0.24, -0.06, 2.34, 0.82, 1.75, 0.9, 0.9, 0, 0.2, 0.25));                                             // the wing
  fig.sauce.push(blob(0.16, 0.24, 2.4, 0.84, 1.1, 0.9, 0.9));
  fig.white.push(blob(0.07, 0.42, 2.44, 0.86, 1.3, 1, 1, 0, 0, 0, 8));   // the bone end
  // the left arm (the viewer's right) held up, fingers spread and dripping
  fig.gold.push(limb(1.2, 1.6, -0.25, 1.62, 0.95, 0.45, 0.36, 0.3));
  fig.gold.push(limb(1.62, 0.95, 0.45, 1.5, 1.72, 0.95, 0.3, 0.24));
  fig.gold.push(blob(0.33, 1.5, 1.82, 0.98, 1.0, 1.05, 0.8));
  for (let i = 0; i < 4; i++) {
    const fx = 1.28 + i * 0.15, lean = (i - 1.5) * 0.09;
    fig.gold.push(limb(fx, 2.0, 1.0, fx + lean, 2.42, 1.04, 0.08, 0.065, 8));
    fig.sauce.push(blob(0.085, fx + lean, 2.44, 1.05, 1, 1.5, 1, 0, 0, 0, 8));
  }
  fig.gold.push(limb(1.24, 1.84, 1.0, 1.02, 2.02, 1.08, 0.08, 0.07, 8));   // the thumb
  // the napkin tucked into the collar
  fig.white.push(blob(0.6, 0, 1.36, 0.5, 1.0, 1.15, 0.3, -0.2, 0, 0));
  fig.white.push(blob(0.16, 0, 1.92, 0.5, 1.3, 0.8, 0.8));   // the knot at the collar
  // sauce: the forehead, both cheeks, the chin, the bib, the shirt, both hands, an elbow
  const drips = [
    [0.2, 3.18, 0.44, 0.07, 2.4], [0.18, 3.02, 0.5, 0.05, 2.0], [-0.34, 2.6, 0.48, 0.09, 1.6], [0.36, 2.52, 0.46, 0.08, 2.2],
    [-0.1, 2.12, 0.42, 0.08, 1.8], [0.12, 2.06, 0.42, 0.07, 2.6], [0.3, 2.2, 0.38, 0.06, 2.0], [-0.3, 2.2, 0.4, 0.06, 1.6],
    [0.02, 1.62, 0.6, 0.1, 1.5], [-0.14, 1.34, 0.58, 0.08, 1.9], [0.16, 1.2, 0.54, 0.07, 1.6],
    [-0.7, 1.32, 0.5, 0.09, 1.2], [0.62, 1.1, 0.56, 0.08, 1.4], [0.86, 1.5, 0.44, 0.07, 1.2], [-0.94, 1.02, 0.5, 0.06, 1.5],
    [-0.5, 2.1, 0.74, 0.1, 1.3], [-0.26, 2.04, 0.86, 0.06, 2.6], [1.5, 1.62, 1.1, 0.1, 1.4], [1.62, 1.5, 1.0, 0.06, 2.4],
    [-1.52, 0.86, 0.5, 0.07, 2.2],
  ];
  for (const d of drips) fig.sauce.push(blob(d[3], d[0], d[1], d[2], 1, d[4], 0.7, 0, 0, 0, 8));

  /* ---- the table things, in front of the figure (figure frame) ---- */
  fig.white.push(cylAt(1.02, 0.86, 0.1, 0, 0.05, 0.86, 0, 0, 0, 28));       // the plate
  for (let i = 0; i < 26; i++) {                                           // the heap of wings
    const az = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.74, layer = i < 12 ? 0 : i < 21 ? 1 : 2;
    const k = 1 - layer * 0.28;
    fig.sauce.push(blob(0.2, Math.cos(az) * rr * k, 0.2 + layer * 0.2 + R() * 0.05, 0.86 + Math.sin(az) * rr * k * 0.9, 1.6, 0.85, 0.9, R() * 0.5, R() * Math.PI, R() * 0.5, 10));
  }
  fig.black.push(cylAt(0.24, 0.2, 0.22, -1.22, 0.11, 1.0, 0, 0, 0, 16));     // the dip
  fig.white.push(cylAt(0.21, 0.21, 0.03, -1.22, 0.22, 1.0, 0, 0, 0, 16));
  fig.sauce.push(blob(0.07, -1.06, 0.2, 1.12, 1.4, 0.5, 1, 0, 0, 0, 8));

  // scale the figure onto the pedestal
  _m.compose(_p.set(0, H, -0.1), _q.identity(), _s.set(STATUE.FIG, STATUE.FIG, STATUE.FIG));
  for (const k of Object.keys(fig)) for (const g of fig[k]) parts[k].push(g.applyMatrix4(_m));

  let meshes = 0;
  for (const k of Object.keys(parts)) {
    if (!parts[k].length) continue;
    const clean = parts[k].map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
    const merged = BufferGeometryUtils.mergeGeometries(clean, false);
    for (const g of parts[k]) g.dispose();
    const mesh = new THREE.Mesh(merged, M[k]);
    mesh.name = 'statue:' + k; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); meshes++;
  }

  /* ---- the plaque on the pedestal's front face ---- */
  const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.5, metalness: 0.1 });
  plaqueMat.userData.envMapIntensity = 0.3;
  plaqueMat.emissive = new THREE.Color(0xffffff); plaqueMat.emissiveMap = plaqueMat.map; plaqueMat.emissiveIntensity = 0.12;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), plaqueMat);
  plaque.name = 'statue:plaque'; plaque.position.set(0, 1.1, 1.285);
  group.add(plaque); meshes++;

  /* ---- the halo: a ring of eight stars turning over the head ---- */
  const halo = new THREE.Group(); halo.name = 'statue:halo';
  const haloParts = [];
  const ring = new THREE.TorusGeometry(1.25, 0.045, 8, 40); ring.rotateX(Math.PI / 2); haloParts.push(ring);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const star = new THREE.OctahedronGeometry(0.2, 0);
    star.applyMatrix4(_m.compose(_p.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25), _q.setFromEuler(_e.set(0, a, Math.PI / 4)), _s.set(1, 1.5, 1)));
    haloParts.push(star);
  }
  const haloGeo = BufferGeometryUtils.mergeGeometries(haloParts.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }), false);
  const haloMesh = new THREE.Mesh(haloGeo, M.gold); haloMesh.castShadow = true;
  halo.add(haloMesh);
  halo.position.set(0, H + 3.75 * STATUE.FIG, -0.1 - 0.2 * STATUE.FIG);
  halo.rotation.z = 0.12;
  group.add(halo); meshes++;

  const x = Number.isFinite(ctx.x) ? ctx.x : 0, z = Number.isFinite(ctx.z) ? ctx.z : 0, y = Number.isFinite(ctx.y) ? ctx.y : 0;
  const yaw = Number.isFinite(ctx.yaw) ? ctx.yaw : 0;
  group.position.set(x, y, z); group.rotation.y = yaw;
  // the spot a reader stands on: two tiles in front of the pedestal center
  const frontPos = { x: x + Math.sin(yaw) * 2.0, y: z + Math.cos(yaw) * 2.0 };

  const card = makeCard();
  return {
    group, frontPos, counts: { meshes },
    near(px, pz) { return Math.hypot(px - frontPos.x, pz - frontPos.y) <= STATUE.REACH; },
    update(dt, time, night) {
      halo.rotation.y += STATUE.HALO_SPIN * dt;
      const n = night > 0 ? night : 0;
      M.gold.emissiveIntensity = 0.18 + 0.5 * n;      // he glows at night
      M.sauce.emissiveIntensity = 0.12 + 0.35 * n;
      plaqueMat.emissiveIntensity = 0.12 + 0.6 * n;
    },
    open() { return card.open(); },
    close() { card.close(); },
    isOpen() { return card.isOpen(); },
  };
}

export default buildStatue;
