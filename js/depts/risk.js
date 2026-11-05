/* Risk: the Thread Zoo (building) and a high-wire balance act (activity), per docs/CONTRACT_V3.md and
   docs/ZOO_DESIGN.md. Local coordinates per docs/CONTRACT_V2.md: the building origin is the footprint's
   north-west corner at ground level, x runs east 0..12, z runs south 0..7, the front face is z = 7 with the
   door centered at local x 6. The station origin is its north-west corner, 4 by 4, with the stub path to the
   west (right-side station); the wire runs from the near post (0.5, 3.5) to the far post (3.5, 0.5). */
import * as THREE from 'three';
import { BRAND, mat, glass, glow, box, cyl, cone, sphere, dome, torus, plane, hipRoof, pointLight, lerp, clamp, easeInOut, canvasTex, decal } from './common.js';
import { makeAnimalMesh, animateAnimal } from '../animals3d.js';
import * as animals from '../animals3d.js';

export const id = 'risk';
export const activityLabel = 'Walking the high wire';

const TAU = Math.PI * 2;
const C = {
  stone: '#B9C4CC', stoneLight: '#CBD3DA', cave: '#9EA9B3', plinth: '#CFC6B6', iron: '#2E3E50', trim: '#F8F6F0',
  wood: '#A5774E', woodDark: '#6B4A2B', brass: '#F6D463', bulb: '#FFF1C9', bulbGlow: '#FFE2A0', lampLight: '#FFC97A',
  path: '#D9CBAE', pathEdge: '#C4B48F', sand: '#E3D5B2', savanna: '#D9C58F', grassTall: '#B9C46A', water: '#6CC3CB',
  waterDeep: '#58A3A8', waterEm: '#0E4F58', reed: '#5B8E45', bark: '#8A6446', canopy: '#5FA55A', canopyTop: '#4C8F4A',
  termite: '#C98D5C', flower: '#F8D9E0', navy: '#002D4F', aqua: '#75CCD0', salmon: '#E7706F', silver: '#E2E9EE',
  ink: '#0E1B2E', white: '#FFFFFF',
};
const ramp = s => clamp((s - 0.25) / 0.75, 0, 1);
const hasDoc = () => typeof document !== 'undefined';
function tex(w, h, draw) { return hasDoc() ? canvasTex(w, h, draw) : null; }

/* The building's update stores the night value here; the activity reads it (no night value reaches stations). */
let nightS = 0;

/* Module-scope scratch, so the per-frame paths allocate nothing. */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0);
const DIR = new THREE.Vector3(1, 0, -1).normalize();      // along the wire, near post to far post
const PERP = new THREE.Vector3(1, 0, 1).normalize();      // across the wire
const WIRE_LEN = 3.0 * Math.SQRT2;                         // 4.243

/* Tiny deterministic generator for seeded dressing positions (no dependency on window.TT). */
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ---------- canvas labels ---------- */
function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function paintLabel(g, W, H, text, px, weight, underline) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = C.navy; roundRectPath(g, 0, 0, W, H, Math.max(6, Math.round(H / 6))); g.fill();
  g.strokeStyle = 'rgba(226, 233, 238, 0.2)'; g.lineWidth = 2; roundRectPath(g, 3, 3, W - 6, H - 6, Math.max(4, Math.round(H / 7))); g.stroke();
  g.fillStyle = C.white; g.font = `${weight} ${px}px Kanit, Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + (underline ? -H * 0.06 : px * 0.04));
  if (underline) { const tw = g.measureText(text).width; g.fillStyle = C.aqua; g.fillRect(W / 2 - tw * 0.3, H * 0.8, tw * 0.6, 8); }
}
/* Label decal with a font-ready repaint. Returns the mesh or a plain navy plane when there is no document. */
function labelDecal(w, h, text, px, weight, underline, o) {
  const t = tex(Math.round(w * 320), Math.round(h * 320), (g, W, H) => paintLabel(g, W, H, text, px, weight, underline));
  if (!t) return plane(w, h, mat(C.navy, { roughness: 0.8 }), o);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { const c = t.image; paintLabel(c.getContext('2d'), c.width, c.height, text, px, weight, underline); t.needsUpdate = true; });
  }
  return decal(w, h, t, o);
}
function stripeMat(accentHex, doubleSide) {
  const t = tex(192, 32, (g, W, H) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? C.white : accentHex; g.fillRect(i * W / 6, 0, W / 6 + 1, H); } });
  if (!t) return mat(accentHex, { roughness: 0.8, doubleSide });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
}
function pathMat(w, h) {
  const t = tex(256, Math.round(256 * h / w), (g, W, H) => {
    g.fillStyle = C.path; g.fillRect(0, 0, W, H);
    g.strokeStyle = C.pathEdge; g.lineWidth = Math.max(4, Math.round(0.06 / w * W * 2)); g.strokeRect(0, 0, W, H);
  });
  if (!t) return mat(C.path, { roughness: 0.95 });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

/* ---------- shared builders ---------- */
/* A fence line from (ax, az) to (bx, bz): posts every `spacing` and one rail box per entry in railYs. */
function fenceLine(parent, postMat, railMat, ax, az, bx, bz, spacing, postR, postH, railYs, railT, skipEnds) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.01) return;
  const n = Math.max(1, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    if (skipEnds && (i === 0 || i === n)) continue;
    const k = i / n;
    cyl(postR, postR, postH, postMat, { x: ax + (bx - ax) * k, y: 0, z: az + (bz - az) * k, seg: 8, parent, castShadow: false });
  }
  const alongX = Math.abs(bx - ax) >= Math.abs(bz - az);
  for (const y of railYs) {
    const r = alongX ? box(len, 0.05, railT, railMat, { parent, castShadow: false }) : box(railT, 0.05, len, railMat, { parent, castShadow: false });
    r.position.set((ax + bx) / 2, y + 0.025, (az + bz) / 2);
  }
}
/* A cylinder between two points (ropes, guy lines). */
function rope(parent, material, r, ax, ay, az, bx, by, bz) {
  _a.set(ax, ay, az); _b.set(bx, by, bz); _d.subVectors(_b, _a);
  const len = _d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), material);
  m.position.copy(_a).addScaledVector(_d, 0.5);
  m.quaternion.setFromUnitVectors(Y_AXIS, _d.normalize());
  m.castShadow = false; m.receiveShadow = false;
  parent.add(m);
  return m;
}
/* Framed window centered at (x, y, z) facing +z, rotated by ry about its center. */
function win(parent, glassMat, frameMat, x, y, z, w, h, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0;
  box(w + 0.12, h + 0.12, 0.08, frameMat, { y: -(h + 0.12) / 2, z: -0.02, parent: g, castShadow: false });
  box(w, h, 0.1, glassMat, { y: -h / 2, z: 0, parent: g, castShadow: false });
  parent.add(g);
  return g;
}
/* ART_DIRECTION bench, base at (x, 0, z), yaw about y. */
function bench(parent, x, z, yaw) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
  const slat = mat(C.wood, { roughness: 0.8 }), leg = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  box(1.0, 0.06, 0.17, slat, { y: 0.42, z: 0.095, parent: g });
  box(1.0, 0.06, 0.17, slat, { y: 0.42, z: -0.095, parent: g });
  const back = box(1.0, 0.30, 0.05, slat, { y: 0.62, z: -0.16, parent: g, castShadow: false }); back.rotation.x = -0.15;
  box(0.06, 0.42, 0.34, leg, { x: -0.42, parent: g }); box(0.06, 0.42, 0.34, leg, { x: 0.42, parent: g });
  parent.add(g);
  return g;
}
/* Lantern: plate, bulb and cap. Returns the bulb's glow material. */
function lantern(parent, x, y, z, bulbR) {
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const s = bulbR / 0.09;
  box(0.26 * s, 0.04, 0.26 * s, iron, { x, y, z, parent, castShadow: false });
  const bulbMat = glow(C.bulb, 0.08); bulbMat.emissive.set(C.bulbGlow);
  sphere(bulbR, bulbMat, { x, y: y + 0.04 + bulbR * 1.1, z, parent, castShadow: false });
  cone(0.16 * s, 0.12, iron, { x, y: y + 0.04 + bulbR * 2.1, z, seg: 4, parent, castShadow: false }).rotation.y = Math.PI / 4;
  return bulbMat;
}
function fakeAgent(pose) {
  return { state: 'idle', pose, path: [], animT: 0, speed: 0, yoff: 0, jumpT: 0, blinkAt: 0, lookAt: 0, moveDir: { x: 0, z: 1 }, paused: false };
}
/* A decorative resident: an animal handle flagged as scenery, never an agent. */
function resident(seed, species, hex, scale, x, y, z, yaw, pose) {
  const h = makeAnimalMesh(seed, hex, species);
  const g = h.group;
  g.scale.setScalar(scale); g.position.set(x, y, z); g.rotation.y = yaw;
  g.userData.resident = true; g.userData.kind = 'resident'; delete g.userData.handle;
  if (h.parts && h.parts.ring) h.parts.ring.visible = false;
  const head = h.parts && h.parts.head ? h.parts.head.parent : null;   // the head pivot (neck base)
  return { h, g, head, agent: fakeAgent(pose), nextLook: 0 };
}
/* Shared resident upkeep: clock, blink schedule, look-around bumps. */
function tickResident(r, dt, time) {
  const a = r.agent;
  a.animT += dt;
  if (a.blinkAt < time - 0.2) a.blinkAt = time + 2.5 + 3 * Math.random();
  if (time > r.nextLook) { a.lookAt = time; r.nextLook = time + 4 + 3 * Math.random(); }
}
function fadeHandle(h, alpha) {
  if (typeof animals.setAnimalOpacity === 'function') animals.setAnimalOpacity(h, alpha);
  else h.group.visible = alpha > 0.05;
}

/* ================================================================== building ================================================================== */
export function buildBuilding(ctx) {
  const { dept } = ctx;
  const group = new THREE.Group();
  const accentHex = dept.accent;
  const wall = mat(dept.wall, { roughness: 0.9 });
  const accent = mat(accentHex, { roughness: 0.78 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const plinth = mat(C.plinth, { roughness: 0.9 });
  const stone = mat(C.stone, { roughness: 0.9 });
  const stoneLight = mat(C.stoneLight, { roughness: 0.9 });
  const rock = mat(C.stone, { roughness: 0.9, flat: true });
  const rockLight = mat(C.stoneLight, { roughness: 0.9, flat: true });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const wood = mat(C.wood, { roughness: 0.8 });
  const woodDark = mat(C.woodDark, { roughness: 0.85 });
  const post = mat(BRAND.woodDark, { roughness: 0.85 });
  const rail = mat(BRAND.wood, { roughness: 0.8 });
  const knob = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  const reed = mat(C.reed, { roughness: 0.9 });
  const glassMat = glass();

  // 1. Perimeter fence with corner posts (the south face leaves x 4..8 open for the entrance).
  fenceLine(group, post, rail, 0, 0, 12, 0, 1.0, 0.05, 0.9, [0.35, 0.70], 0.04, true);
  fenceLine(group, post, rail, 0, 7, 4, 7, 1.0, 0.05, 0.9, [0.35, 0.70], 0.04, true);
  fenceLine(group, post, rail, 8, 7, 12, 7, 1.0, 0.05, 0.9, [0.35, 0.70], 0.04, true);
  fenceLine(group, post, rail, 0, 0, 0, 7, 1.0, 0.05, 0.9, [0.35, 0.70], 0.04, true);
  fenceLine(group, post, rail, 12, 0, 12, 7, 1.0, 0.05, 0.9, [0.35, 0.70], 0.04, true);
  for (const [x, z] of [[0, 0], [12, 0], [0, 7], [12, 7], [4, 7], [8, 7]]) {
    cyl(0.05, 0.05, 1.0, post, { x, y: 0, z, seg: 8, parent: group, castShadow: false });
    sphere(0.06, post, { x, y: 1.02, z, parent: group, castShadow: false });
  }

  // 2. Entrance arch: pillars on plinths, a half torus top, keystone, ZOO sign, lanterns, open gate halves.
  for (const x of [4.7, 7.3]) {
    box(0.7, 0.12, 0.7, plinth, { x, y: 0, z: 6.75, parent: group });
    box(0.5, 2.6, 0.5, stone, { x, y: 0, z: 6.75, parent: group });
  }
  const archTop = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.14, 12, 24, Math.PI), stone);
  archTop.position.set(6, 2.6, 6.75); archTop.castShadow = true; archTop.receiveShadow = true; group.add(archTop);
  box(0.3, 0.3, 0.3, stoneLight, { x: 6, y: 3.74, z: 6.75, parent: group, castShadow: false });
  const sign = labelDecal(1.6, 0.6, 'ZOO', 140, 700, true, { x: 6, y: 3.25, z: 6.95 });
  group.add(sign);
  const archBulbs = [lantern(group, 4.7, 2.6, 6.75, 0.09), lantern(group, 7.3, 2.6, 6.75, 0.09)];
  const lights = [pointLight(C.lampLight, 8, 6, { x: 4.7, y: 2.72, z: 6.75, parent: group }), pointLight(C.lampLight, 8, 6, { x: 7.3, y: 2.72, z: 6.75, parent: group })];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(6 - s * 1.05, 0.3, 6.75); hinge.rotation.y = s * 1.2; group.add(hinge);
    box(1.0, 0.8, 0.05, rail, { x: s * 0.5, parent: hinge, castShadow: false });
    for (let i = 0; i < 4; i++) box(0.04, 0.9, 0.07, post, { x: s * (0.12 + i * 0.25), y: -0.05, parent: hinge, castShadow: false });
  }

  // 3. Paths: main path from the arch north to the cross path.
  plane(1.6, 2.8, pathMat(1.6, 2.8), { x: 6, y: 0.012, z: 5.6, rx: -Math.PI / 2, parent: group });
  plane(11.0, 0.9, pathMat(11.0, 0.9), { x: 6, y: 0.012, z: 4.5, rx: -Math.PI / 2, parent: group });

  // 4. Ticket booth just inside the arch, east of the path.
  box(1.2, 1.5, 1.0, wall, { x: 8.6, y: 0, z: 6.0, radius: 0.04, parent: group });
  win(group, glassMat, trim, 8.6, 1.2, 6.51, 0.7, 0.5, 0);
  box(1.3, 0.06, 0.25, wood, { x: 8.6, y: 0.78, z: 6.55, parent: group, castShadow: false });
  const awning = box(1.5, 0.05, 0.7, stripeMat(accentHex, false), { x: 8.6, y: 1.55, z: 6.35, parent: group, castShadow: false }); awning.rotation.x = 0.25;
  box(1.5, 0.1, 0.02, accent, { x: 8.6, y: 1.4, z: 6.68, parent: group, castShadow: false });
  group.add(labelDecal(0.9, 0.22, 'Tickets', 44, 600, false, { x: 8.6, y: 1.3, z: 6.52 }));
  hipRoof(1.5, 1.3, 0.4, accent, { x: 8.6, y: 1.5, z: 6.0, ridge: 0.6, parent: group });

  // 5. Low fences: a viewing fence along z 3.9 with three gaps, two dividers, and a sign at each gap.
  for (const [x0, x1] of [[0.4, 1.6], [2.8, 5.4], [6.6, 9.2], [10.4, 11.6]]) fenceLine(group, post, rail, x0, 3.9, x1, 3.9, 0.8, 0.04, 0.55, [0.45], 0.03, false);
  fenceLine(group, post, rail, 4.15, 0.4, 4.15, 3.6, 0.8, 0.04, 0.55, [0.45], 0.03, false);
  fenceLine(group, post, rail, 7.85, 0.4, 7.85, 3.6, 0.8, 0.04, 0.55, [0.45], 0.03, false);
  const penNames = ['Lions', 'Flamingos', 'Giraffes'];
  [2.2, 6.0, 9.8].forEach((x, i) => {
    cyl(0.03, 0.03, 0.7, post, { x: x - 0.6, y: 0, z: 3.9, seg: 6, parent: group, castShadow: false });
    box(0.5, 0.22, 0.02, rail, { x: x - 0.6, y: 0.7, z: 3.9, parent: group, castShadow: false });
    group.add(labelDecal(0.46, 0.18, penNames[i], 28, 600, false, { x: x - 0.6, y: 0.81, z: 3.915 }));
  });

  // 6. Rocky pen (west): sand, boulders, the lion's slab, a cave with a dark opening, a dead tree.
  plane(3.6, 3.2, mat(C.sand, { roughness: 0.95 }), { x: 2.2, y: 0.012, z: 2.0, rx: -Math.PI / 2, parent: group });
  const boulders = [[1.2, 1.4, 0.55, 0.65, rock], [2.6, 0.9, 0.45, 1, rockLight], [3.3, 1.6, 0.6, 1, rock], [0.9, 2.9, 0.35, 1, rockLight], [3.5, 3.0, 0.4, 1, rock]];
  for (const [x, z, r, sy, m] of boulders) sphere(r, m, { x, y: r * sy - 0.1, z, ws: 10, hs: 7, parent: group }).scale.y = sy;
  box(1.4, 0.3, 1.0, stoneLight, { x: 1.9, y: 0, z: 2.5, radius: 0.08, parent: group });
  dome(0.9, mat(C.cave, { roughness: 0.95 }), { x: 3.1, y: 0, z: 2.9, parent: group }).scale.y = 0.75;
  const opening = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16, 0, Math.PI), mat(C.ink, { roughness: 1 }));
  opening.position.set(3.1, 0.02, 3.68); opening.castShadow = false; group.add(opening);
  cyl(0.05, 0.05, 0.9, woodDark, { x: 0.7, y: 0, z: 0.9, seg: 6, parent: group });
  cyl(0.03, 0.03, 0.4, woodDark, { x: 0.78, y: 0.72, z: 0.9, rz: -0.9, seg: 5, parent: group, castShadow: false });
  cyl(0.03, 0.03, 0.4, woodDark, { x: 0.62, y: 0.6, z: 0.9, rz: 0.9, seg: 5, parent: group, castShadow: false });

  // 7. Water pen (middle-north): pool over a sand ring, reeds, a log, lily pads, ripple rings, a night sheen.
  plane(3.4, 3.0, mat(C.sand, { roughness: 0.95 }), { x: 6.0, y: 0.015, z: 2.0, rx: -Math.PI / 2, parent: group });
  const poolMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.water), roughness: 0.15, transparent: true, opacity: 0.8, emissive: new THREE.Color(C.waterEm), emissiveIntensity: 0.12, depthWrite: false });
  plane(3.0, 2.6, poolMat, { x: 6.0, y: 0.03, z: 2.0, rx: -Math.PI / 2, parent: group });
  const deepMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.waterDeep), roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  plane(1.8, 1.4, deepMat, { x: 6.0, y: 0.035, z: 2.0, rx: -Math.PI / 2, parent: group });
  const sheenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.white), transparent: true, opacity: 0, depthWrite: false });
  plane(2.6, 2.2, sheenMat, { x: 6.0, y: 0.045, z: 2.0, rx: -Math.PI / 2, parent: group });
  for (const [cx, cz] of [[4.6, 0.8], [7.4, 3.2]]) for (let i = 0; i < 5; i++) {
    const a = i * 1.26, rr = 0.12 + 0.05 * (i % 2), h = 0.6 + 0.075 * i;
    const x = cx + rr * Math.cos(a), z = cz + rr * Math.sin(a);
    cyl(0.02, 0.02, h, reed, { x, y: 0, z, seg: 5, parent: group, castShadow: false });
    sphere(0.04, woodDark, { x, y: h + 0.02, z, parent: group, castShadow: false }).scale.y = 1.8;
  }
  const log = new THREE.Group(); log.position.set(5.0, 0.26, 3.1); log.rotation.y = 0.4; group.add(log);
  cyl(0.14, 0.14, 1.4, woodDark, { rz: Math.PI / 2, parent: log }).position.y = 0;
  for (const s of [-1, 1]) cyl(0.12, 0.12, 0.02, wood, { x: s * 0.7, rz: Math.PI / 2, parent: log, castShadow: false }).position.y = 0;
  for (const [x, z] of [[6.9, 1.0], [5.2, 1.4]]) cyl(0.18, 0.18, 0.02, reed, { x, y: 0.04, z, seg: 12, parent: group, castShadow: false });
  sphere(0.05, mat(C.flower, { roughness: 0.7 }), { x: 6.9, y: 0.1, z: 1.0, parent: group, castShadow: false });
  const rippleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.white), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const ripples = [];
  for (let i = 0; i < 4; i++) {
    const m = torus(0.3, 0.015, rippleMat.clone(), { x: 6.0, y: 0.05, z: 2.0, rx: Math.PI / 2, parent: group, castShadow: false });
    m.visible = false; ripples.push({ m, t: 9 });
  }
  function ripple(x, z) {
    let best = ripples[0];
    for (const r of ripples) if (r.t > best.t) best = r;
    best.m.visible = true; best.m.position.x = x; best.m.position.z = z; best.t = 0;
  }

  // 8. Savanna pen (east): dry ground, acacia, swaying grass, termite mound, water trough.
  plane(3.6, 3.2, mat(C.savanna, { roughness: 0.95 }), { x: 9.8, y: 0.012, z: 2.0, rx: -Math.PI / 2, parent: group });
  cyl(0.10, 0.10, 1.6, mat(C.bark, { roughness: 0.9 }), { x: 10.4, y: 0, z: 1.2, seg: 8, parent: group });
  cyl(0.05, 0.05, 0.6, mat(C.bark, { roughness: 0.9 }), { x: 10.62, y: 1.4, z: 1.2, rz: -0.9, seg: 6, parent: group, castShadow: false });
  cyl(0.05, 0.05, 0.6, mat(C.bark, { roughness: 0.9 }), { x: 10.18, y: 1.4, z: 1.2, rz: 0.9, seg: 6, parent: group, castShadow: false });
  cyl(1.3, 0.9, 0.35, mat(C.canopy, { roughness: 0.9 }), { x: 10.4, y: 1.9, z: 1.2, seg: 10, parent: group });
  cyl(0.9, 0.6, 0.25, mat(C.canopyTop, { roughness: 0.9 }), { x: 10.4, y: 2.25, z: 1.2, seg: 10, parent: group });
  const grassMat = mat(C.grassTall, { roughness: 0.9 });
  const rnd = lcg(7);
  const tufts = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group(); g.position.set(8.3 + rnd() * 3.0, 0, 0.6 + rnd() * 2.8); group.add(g);
    for (let j = 0; j < 4; j++) cone(0.04, 0.35 + 0.05 * j, grassMat, { x: (j - 1.5) * 0.05, z: (j % 2) * 0.05 - 0.025, seg: 5, parent: g, castShadow: false });
    tufts.push({ g, ph: rnd() * TAU });
  }
  cone(0.25, 0.6, mat(C.termite, { roughness: 0.95 }), { x: 8.8, y: 0, z: 2.9, seg: 8, parent: group });
  box(0.8, 0.3, 0.4, wood, { x: 8.6, y: 0, z: 1.0, parent: group });
  plane(0.7, 0.3, poolMat, { x: 8.6, y: 0.26, z: 1.0, rx: -Math.PI / 2, parent: group });

  // 9. Keeper hut at the south-west: walls in dept.wall, hip roof in dept.accent (v2 wall and roof rule), accent door.
  // CONTRACT: v3 reads "a hip roof in dept.wall and an accent door"; walls take dept.wall and the roof dept.accent per v2.
  box(2.2, 1.7, 1.6, wall, { x: 1.8, y: 0, z: 5.5, radius: 0.04, parent: group });
  box(2.7, 0.08, 2.1, trim, { x: 1.8, y: 1.66, z: 5.5, parent: group, castShadow: false });
  hipRoof(2.7, 2.1, 0.6, accent, { x: 1.8, y: 1.7, z: 5.5, ridge: 1.0, parent: group });
  box(0.84, 1.3, 0.04, trim, { x: 1.8, y: 0, z: 6.31, parent: group, castShadow: false });
  box(0.7, 1.2, 0.06, mat(accentHex, { roughness: 0.6 }), { x: 1.8, y: 0, z: 6.33, parent: group, castShadow: false });
  sphere(0.03, knob, { x: 2.05, y: 0.65, z: 6.38, parent: group, castShadow: false });
  win(group, glassMat, trim, 2.93, 1.05, 5.5, 0.6, 0.5, Math.PI / 2);
  box(0.6, 0.4, 0.4, mat(C.savanna, { roughness: 1 }), { x: 0.6, y: 0, z: 6.0, radius: 0.04, parent: group });
  cyl(0.12, 0.10, 0.18, iron, { x: 2.9, y: 0, z: 6.3, seg: 12, parent: group, castShadow: false });
  const broom = cyl(0.015, 0.015, 1.1, wood, { x: 0.72, y: 0.02, z: 6.32, seg: 5, parent: group, castShadow: false }); broom.rotation.z = 0.2;
  box(0.16, 0.2, 0.06, mat(C.savanna, { roughness: 1 }), { x: 0.6, y: 0, z: 6.33, parent: group, castShadow: false });

  // 10. Benches facing the pens and a litter bin.
  bench(group, 4.3, 5.15, Math.PI); bench(group, 7.4, 5.15, Math.PI);
  cyl(0.16, 0.16, 0.5, iron, { x: 5.1, y: 0, z: 5.4, seg: 12, parent: group });

  // 11. Popcorn cart.
  const cart = new THREE.Group(); cart.position.set(10.0, 0, 5.4); group.add(cart);
  box(0.9, 0.8, 0.6, trim, { y: 0.2, parent: cart });
  for (const s of [-1, 1]) torus(0.18, 0.04, iron, { x: s * 0.3, y: 0.18, z: 0.34, parent: cart, castShadow: false });
  cyl(0.02, 0.02, 0.6, iron, { x: -0.6, y: 0.5, rz: Math.PI / 2, parent: cart, castShadow: false });
  box(0.7, 0.45, 0.5, glassMat, { y: 1.0, parent: cart, castShadow: false });
  const popMat = mat(C.brass, { roughness: 0.8 });
  for (let i = 0; i < 11; i++) sphere(0.055, i < 8 ? popMat : trim, { x: -0.25 + (i % 4) * 0.16, y: 1.06 + Math.floor(i / 4) * 0.1, z: -0.15 + (i % 3) * 0.14, parent: cart, castShadow: false });
  const miniAwning = plane(1.0, 0.5, stripeMat(accentHex, true), { y: 1.5, z: 0.1, parent: cart }); miniAwning.rotation.x = -Math.PI / 2 + 0.3;
  cart.add(labelDecal(0.6, 0.16, 'Popcorn', 28, 600, false, { y: 0.75, z: 0.31 }));

  // 12. Yard lamp post (emissive only, the arch lanterns hold the light budget).
  cyl(0.04, 0.04, 1.75, iron, { x: 10.8, y: 0, z: 6.3, seg: 8, parent: group });
  const lampBulb = lantern(group, 10.8, 1.75, 6.3, 0.11);

  // 13. Residents: a sleeping lion, two flamingos, a shuffling tortoise, a giraffe reaching for the acacia.
  const lion = resident('zoo-lion-0', 'lion', accentHex, 1.3, 1.9, 0.30, 2.5, 0.4, 'sit');
  const flam = [resident('zoo-flamingo-1', 'flamingo', accentHex, 1.3, 5.6, 0, 1.6, 0.3, 'stand'), resident('zoo-flamingo-2', 'flamingo', accentHex, 1.3, 6.6, 0, 2.3, -0.6, 'stand')];
  const tort = resident('zoo-tortoise-3', 'tortoise', accentHex, 1.3, 2.6, 0, 6.3, Math.PI / 2, 'walk');
  const gir = resident('zoo-giraffe-4', 'giraffe', accentHex, 1.3, 9.2, 0, 1.6, 0.25, 'stand');
  const residents = [lion, flam[0], flam[1], tort, gir];
  for (const r of residents) group.add(r.g);
  const bubbleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.trim), roughness: 0.6, transparent: true, opacity: 0.7 });
  const bubbles = [];
  for (let i = 0; i < 3; i++) bubbles.push(sphere(0.03 + 0.01 * i, bubbleMat, { parent: group, castShadow: false }));
  const flamState = [{ ph: 0, dipped: false }, { ph: 2.0, dipped: false }];
  const tortSt = { mode: 'walk', dir: 1, x: 2.6, wait: 0, yawFrom: Math.PI / 2, yawTo: Math.PI / 2 };

  function update(dt, time, night, active) {
    const r = ramp(night || 0);
    nightS = night || 0;
    // Night: lantern bulbs, sign, yard lamp, pool sheen (lights and glass are driven by the renderer).
    archBulbs[0].emissiveIntensity = archBulbs[1].emissiveIntensity = 0.08 + 2.4 * r;
    lampBulb.emissiveIntensity = 0.08 + 2.4 * r;
    if (sign.material.emissiveMap) sign.material.emissiveIntensity = 0.35 * r;
    sheenMat.opacity = 0.15 * r;
    // Savanna grass sways.
    for (let i = 0; i < 8; i++) tufts[i].g.rotation.z = 0.08 * Math.sin(TAU * 0.5 * time + tufts[i].ph);
    // Lion: asleep on the slab, eyes shut, head down, sleep bubbles.
    tickResident(lion, dt, time);
    lion.agent.blinkAt = time - 0.07;
    animateAnimal(lion.h, lion.agent, time, dt, 'sit');
    if (lion.head) lion.head.rotation.x += 0.35;
    for (let i = 0; i < 3; i++) {
      const u = ((time / 2.0) + i * 0.35) % 1;   // rising from the nose, staggered 0.7 s, looping
      bubbles[i].position.set(2.2 + 0.08 * i + 0.1 * u, 1.15 + 0.5 * u, 3.2 + 0.05 * i);
      bubbles[i].scale.setScalar(0.6 + 0.6 * u);
    }
    // Flamingos: head dips every 4 s with a ripple at the bottom of the dip; tucked heads after dark.
    for (let i = 0; i < 2; i++) {
      const f = flam[i], fs = flamState[i];
      tickResident(f, dt, time);
      animateAnimal(f.h, f.agent, time, dt, 'stand');
      let dip = 0;
      if (r > 0.5) { dip = 0.9; fs.dipped = true; }
      else {
        const u = (time + fs.ph) % 4;
        if (u < 0.6) { dip = 1.1 * easeInOut(u / 0.6); fs.dipped = false; }
        else if (u < 1.4) { dip = 1.1; if (!fs.dipped) { fs.dipped = true; ripple(f.g.position.x + 0.55 * Math.sin(f.g.rotation.y), f.g.position.z + 0.55 * Math.cos(f.g.rotation.y)); } }
        else if (u < 2.0) dip = 1.1 * (1 - easeInOut((u - 1.4) / 0.6));
      }
      if (f.head) f.head.rotation.x += dip;
    }
    for (let i = 0; i < 4; i++) {
      const rp = ripples[i];
      if (!rp.m.visible) continue;
      rp.t += dt;
      const u = Math.min(1, rp.t / 1.6);
      rp.m.scale.setScalar(lerp(1, 3.33, u)); rp.m.material.opacity = 0.6 * (1 - u);
      if (u >= 1) rp.m.visible = false;
    }
    // Tortoise: shuffles between x 2.6 and 3.8 by the hut, pausing and turning at each end (half speed at night).
    tickResident(tort, dt, time);
    const ts = tortSt, speed = 0.12 * (r > 0.5 ? 0.5 : 1);
    if (ts.mode === 'walk') {
      ts.x += ts.dir * speed * dt;
      if (ts.x >= 3.8 || ts.x <= 2.6) { ts.x = clamp(ts.x, 2.6, 3.8); ts.mode = 'pause'; ts.wait = 2.0; }
    } else if (ts.mode === 'pause') {
      ts.wait -= dt;
      if (ts.wait <= 0) { ts.mode = 'turn'; ts.wait = 1.0; ts.dir = -ts.dir; ts.yawFrom = tort.g.rotation.y; ts.yawTo = ts.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    } else {
      ts.wait -= dt;
      tort.g.rotation.y = lerp(ts.yawFrom, ts.yawTo, easeInOut(clamp(1 - ts.wait, 0, 1)));
      if (ts.wait <= 0) { ts.mode = 'walk'; tort.g.rotation.y = ts.yawTo; }
    }
    tort.g.position.x = ts.x;
    tort.agent.moveDir.x = ts.dir; tort.agent.moveDir.z = 0;
    tort.agent.speed = ts.mode === 'walk' ? speed : 0;
    animateAnimal(tort.h, tort.agent, time, dt, ts.mode === 'walk' ? 'walk' : 'stand');
    // Giraffe: slow head sway, reaches up into the acacia every 7 s.
    tickResident(gir, dt, time);
    animateAnimal(gir.h, gir.agent, time, dt, 'stand');
    if (gir.head) {
      gir.head.rotation.y += 0.3 * Math.sin(TAU * 0.08 * time);
      const u = time % 7;
      let reach = 0;
      if (u < 1.2) reach = easeInOut(u / 1.2);
      else if (u < 2.7) reach = 1;
      else if (u < 3.9) reach = 1 - easeInOut((u - 2.7) / 1.2);
      gir.head.rotation.x += -0.4 * reach;
    }
  }
  return { group, glass: [glassMat], lights, update };
}

/* ================================================================== activity ================================================================== */
export function buildActivity(ctx) {
  const { dept } = ctx;
  const group = new THREE.Group();
  const accentHex = dept.accent;
  const accent = mat(accentHex, { roughness: 0.6 });
  const postMat = mat(BRAND.woodDark, { roughness: 0.85 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const wood = mat(C.wood, { roughness: 0.8 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const stone = mat(C.stone, { roughness: 0.9 });
  const ropeMat = mat(BRAND.wood, { roughness: 0.9 });
  const brass = mat(C.brass, { roughness: 0.4, metalness: 0.3 });
  const NEAR = { x: 0.5, z: 3.5 }, FAR = { x: 3.5, z: 0.5 }, POST_H = 3.2, TOP = 3.28;

  // 1. Posts with accent bands, base discs and guy ropes.
  for (const p of [NEAR, FAR]) {
    cyl(0.18, 0.18, 0.06, stone, { x: p.x, y: 0, z: p.z, seg: 16, parent: group });
    cyl(0.09, 0.09, POST_H, postMat, { x: p.x, y: 0, z: p.z, seg: 12, parent: group });
    for (const y of [1.0, 2.0, 3.0]) torus(0.10, 0.02, accent, { x: p.x, y, z: p.z, rx: Math.PI / 2, parent: group, castShadow: false });
  }
  // CONTRACT: pegs sit 0.4 to 0.5 out (not 0.6) so ropes and pegs stay inside the 4 by 4 station.
  for (const [px, pz, gx, gz] of [[0.5, 3.5, 0.12, 3.88], [0.5, 3.5, 0.5, 3.9], [3.5, 0.5, 3.88, 0.12], [3.5, 0.5, 3.5, 0.1]]) {
    rope(group, ropeMat, 0.012, px, POST_H, pz, gx, 0.04, gz);
    box(0.06, 0.08, 0.06, iron, { x: gx, y: 0, z: gz, parent: group, castShadow: false });
  }

  // 2. Platforms: deck, edge trim on the outer sides, railing on the side without the ladder, corner posts on the ladder side.
  function platform(p, outX, outZ, ladderSide) {
    box(0.9, 0.08, 0.9, wood, { x: p.x, y: POST_H, z: p.z, radius: 0.02, parent: group });
    box(0.9, 0.04, 0.04, trim, { x: p.x, y: TOP, z: p.z + outZ * 0.43, parent: group, castShadow: false });
    box(0.04, 0.04, 0.9, trim, { x: p.x + outX * 0.43, y: TOP, z: p.z, parent: group, castShadow: false });
    const railX = ladderSide !== 'x';   // railing along the x-parallel outer side unless the ladder is there
    for (let i = 0; i < 3; i++) {
      const k = (i - 1) * 0.4;
      if (railX) cyl(0.025, 0.025, 0.45, iron, { x: p.x + k, y: TOP, z: p.z + outZ * 0.4, seg: 6, parent: group, castShadow: false });
      else cyl(0.025, 0.025, 0.45, iron, { x: p.x + outX * 0.4, y: TOP, z: p.z + k, seg: 6, parent: group, castShadow: false });
    }
    if (railX) box(0.84, 0.03, 0.03, iron, { x: p.x, y: TOP + 0.45, z: p.z + outZ * 0.4, parent: group, castShadow: false });
    else box(0.03, 0.03, 0.84, iron, { x: p.x + outX * 0.4, y: TOP + 0.45, z: p.z, parent: group, castShadow: false });
    // Corner posts on the ladder side so the deck still reads as railed.
    cyl(0.025, 0.025, 0.45, iron, { x: p.x + outX * 0.4, y: TOP, z: p.z + outZ * 0.4, seg: 6, parent: group, castShadow: false });
  }
  platform(NEAR, -1, 1, 'x');   // near: outer sides west and south; ladder on the south (x-parallel) side
  platform(FAR, 1, -1, 'z');    // far: outer sides east and north; ladder on the east (z-parallel) side
  const PERCH = { x: 3.9, y: TOP + 0.45 + 0.05, z: 0.1 };
  sphere(0.06, brass, { x: PERCH.x, y: PERCH.y, z: PERCH.z, parent: group, castShadow: false });

  // 3. Ladders: near post south face, far post east face.
  for (const x of [0.35, 0.65]) { cyl(0.025, 0.025, 3.3, iron, { x, y: 0, z: 3.66, seg: 6, parent: group, castShadow: false }); box(0.03, 0.03, 0.2, iron, { x, y: 3.29, z: 3.58, parent: group, castShadow: false }); }
  for (let i = 0; i < 10; i++) box(0.30, 0.03, 0.03, iron, { x: 0.5, y: 0.3 + i * 0.3, z: 3.66, parent: group, castShadow: false });
  for (const z of [0.35, 0.65]) { cyl(0.025, 0.025, 3.3, iron, { x: 3.66, y: 0, z, seg: 6, parent: group, castShadow: false }); box(0.2, 0.03, 0.03, iron, { x: 3.58, y: 3.29, z, parent: group, castShadow: false }); }
  for (let i = 0; i < 10; i++) box(0.03, 0.03, 0.30, iron, { x: 3.66, y: 0.3 + i * 0.3, z: 0.5, parent: group, castShadow: false });

  // 4. Wire with two turnbuckles.
  const wireMat = mat(C.iron, { roughness: 0.5, metalness: 0.3 });
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, WIRE_LEN, 8), wireMat);
  wire.position.set(2.0, 3.24, 2.0); wire.quaternion.setFromUnitVectors(Y_AXIS, DIR); wire.castShadow = false; group.add(wire);
  const buckleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.stone), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(C.white), emissiveIntensity: 0 });
  for (const s of [0.3, WIRE_LEN - 0.3]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), buckleMat);
    b.position.set(NEAR.x + DIR.x * s, 3.24, NEAR.z + DIR.z * s); b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), DIR); b.castShadow = false; group.add(b);
  }

  // 5. Safety net 1.2 above the ground, two pieces so the south-west ladder bay stays open.
  const netMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.trim), wireframe: true, transparent: true, opacity: 0.45, depthWrite: false });
  const netBody = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.trim), transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  const netParts = [];
  for (const [w, d, sx, sz, cx, cz] of [[3.0, 2.2, 10, 7, 2.3, 1.3], [2.0, 1.0, 7, 3, 2.8, 2.9]]) {
    const g = new THREE.PlaneGeometry(w, d, sx, sz);
    const a = new THREE.Mesh(g, netMat); a.position.set(cx, 1.2, cz); a.rotation.x = -Math.PI / 2; a.castShadow = false; group.add(a);
    const b = new THREE.Mesh(g, netBody); b.position.set(cx, 1.195, cz); b.rotation.x = -Math.PI / 2; b.castShadow = false; group.add(b);
    netParts.push(a, b);
  }
  for (const p of [NEAR, FAR]) sphere(0.03, iron, { x: p.x, y: 1.2, z: p.z, parent: group, castShadow: false });
  for (const [x, z] of [[3.8, 3.4], [0.8, 0.2]]) cyl(0.03, 0.03, 1.25, iron, { x, y: 0, z, seg: 6, parent: group, castShadow: false });
  for (const [ax, az, bx, bz] of [[3.8, 2.4, 3.8, 3.4], [1.8, 3.4, 3.8, 3.4], [0.8, 2.4, 0.8, 0.2], [3.8, 0.2, 0.8, 0.2]]) rope(group, ropeMat, 0.01, ax, 1.2, az, bx, 1.24, bz);

  // 6. Balance pole with accent caps, a grip band and two rest chocks on the near platform.
  const pole = new THREE.Group(); group.add(pole);
  cyl(0.02, 0.02, 1.5, trim, { rz: Math.PI / 2, seg: 8, parent: pole, castShadow: false }).position.y = 0;
  const capMat = glow(accentHex, 0); capMat.roughness = 0.6;
  sphere(0.045, capMat, { x: -0.75, parent: pole, castShadow: false }); sphere(0.045, capMat, { x: 0.75, parent: pole, castShadow: false });
  torus(0.025, 0.012, accent, { ry: Math.PI / 2, parent: pole, castShadow: false });
  // Rest: on the near platform, axis along the wire, shifted 0.25 toward the wire so both caps stay inside the station.
  const poleRestPos = new THREE.Vector3(NEAR.x + DIR.x * 0.25, TOP + 0.06, NEAR.z + DIR.z * 0.25);
  const poleRestQ = new THREE.Quaternion().setFromUnitVectors(X_AXIS, DIR);
  pole.position.copy(poleRestPos); pole.quaternion.copy(poleRestQ);
  for (const s of [-0.05, 0.55]) box(0.06, 0.04, 0.12, wood, { x: NEAR.x + DIR.x * s, y: TOP, z: NEAR.z + DIR.z * s, parent: group, castShadow: false }).rotation.y = Math.PI / 4;
  const poleFrom = new THREE.Vector3(), poleFromQ = new THREE.Quaternion();

  // 7. Confetti and sparkle pools for the platform arrivals.
  const confettiHex = [C.salmon, C.aqua, C.brass, C.trim];
  const confetti = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(confettiHex[i % 4]), roughness: 0.8, side: THREE.DoubleSide, transparent: true });
    const p = plane(0.07, 0.11, m, { x: 2, y: 0.5, z: 2, parent: group }); p.visible = false;   // parked inside the station while pooled
    confetti.push({ m: p, vx: 0, vy: 0, vz: 0, life: 0, floor: 0 });
  }
  const sparks = [];
  for (let i = 0; i < 6; i++) {
    const s = sphere(0.045, glow(C.bulb, 1.2), { x: 2, y: 0.5, z: 2, parent: group, castShadow: false }); s.visible = false; s.material.transparent = true;
    sparks.push({ m: s, life: 0, y0: 0 });
  }
  let confettiNext = 0, sparkNext = 0;
  function burst(px, pz) {
    for (let i = 0; i < 12; i++) {
      const c = confetti[confettiNext]; confettiNext = (confettiNext + 1) % 24;
      const a = Math.random() * TAU, rad = 0.4 + 0.5 * Math.random();
      c.m.visible = true; c.m.position.set(px, TOP + 0.6, pz);
      c.vx = Math.cos(a) * rad; c.vz = Math.sin(a) * rad; c.vy = 1.0 + 0.8 * Math.random(); c.life = 1.2; c.floor = TOP;
      c.m.rotation.set(Math.random() * TAU, 0, Math.random() * TAU); c.m.material.opacity = 1;
    }
    for (let i = 0; i < 3; i++) {
      const s = sparks[sparkNext]; sparkNext = (sparkNext + 1) % 6;
      s.m.visible = true; s.m.position.set(px + (i - 1) * 0.25, TOP + 0.5, pz + (i - 1) * 0.1); s.life = 0.6; s.y0 = TOP + 0.5; s.m.material.opacity = 1;
    }
  }

  // 8. Night dressing: a lantern on each post and seven string bulbs under the wire.
  const lanternBulbs = [];
  for (const p of [NEAR, FAR]) {
    const bx = p.x + DIR.x * (p === NEAR ? 0.14 : -0.14), bz = p.z + DIR.z * (p === NEAR ? 0.14 : -0.14);
    const br = box(0.04, 0.04, 0.24, iron, { x: bx, y: 2.68, z: bz, parent: group, castShadow: false }); br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), DIR);
    const lx = p.x + DIR.x * (p === NEAR ? 0.26 : -0.26), lz = p.z + DIR.z * (p === NEAR ? 0.26 : -0.26);
    box(0.16, 0.12, 0.16, iron, { x: lx, y: 2.56, z: lz, parent: group, castShadow: false });
    const bm = glow(C.bulb, 0.08); bm.emissive.set(C.bulbGlow);
    sphere(0.07, bm, { x: lx, y: 2.62, z: lz, parent: group, castShadow: false });
    lanternBulbs.push(bm);
  }
  const stringWarm = glow(C.bulb, 0.05); stringWarm.emissive.set(C.bulbGlow);
  const stringAqua = glow(C.aqua, 0.05);
  for (let i = 1; i <= 7; i++) {
    const s = (i / 8) * WIRE_LEN;
    sphere(0.03, i % 2 ? stringWarm : stringAqua, { x: NEAR.x + DIR.x * s, y: 3.24 - 0.06, z: NEAR.z + DIR.z * s, parent: group, castShadow: false });
  }

  // 9. The perch owl: resident bird on the far platform's cap while nobody is on the wire.
  const owl = resident('wire-owl', 'owl', accentHex, 0.8, PERCH.x, PERCH.y + 0.06, PERCH.z, -Math.PI / 4, 'stand');
  group.add(owl.g);
  const owlSt = { alpha: 1, target: 1, headTarget: 0, headCur: 0, nextTurn: 0, leftAt: -10 };

  const YAW0 = 3 * Math.PI / 4;
  const st = { t0: null, seg: 0, crossings: 0, yawK: 0, hasWalker: false, poleT: 1, glintT: 0, netSway: 0 };

  function update(dt, time, phase, alien, active) {
    const working = !!(active && phase && phase.working);
    const r = ramp(nightS);
    // The activity owns the walker only while the run is live; during the ease back the renderer owns yaw and position.
    const walker = working && alien && alien.group ? alien : null;
    const t = phase ? phase.t : 0;

    // Walker arrival and departure bookkeeping.
    if (walker && !st.hasWalker) { st.hasWalker = true; st.t0 = t; st.seg = 0; st.crossings = 0; st.yawK = 0; owlSt.target = 0; }
    if (!walker && st.hasWalker) {
      st.hasWalker = false; st.t0 = null; owlSt.leftAt = time;
      poleFrom.copy(pole.position); poleFromQ.copy(pole.quaternion); st.poleT = 0;
    }

    let s = 0, mid = 0, pe = 0;
    if (walker) {
      const u = ((t - st.t0) % 9 + 9) % 9;
      let seg = 0;
      if (u < 0.9) { seg = 0; s = 0; }
      else if (u < 4.5) { seg = 1; pe = 0.5 - 0.5 * Math.cos(Math.PI * (u - 0.9) / 3.6); s = WIRE_LEN * pe; mid = Math.sin(Math.PI * pe); }
      else if (u < 5.4) { seg = 2; s = WIRE_LEN; }
      else { seg = 3; pe = 0.5 - 0.5 * Math.cos(Math.PI * (u - 5.4) / 3.6); s = WIRE_LEN * (1 - pe); mid = Math.sin(Math.PI * pe); }
      if (seg !== st.seg) {
        if (seg === 1 || seg === 3) st.crossings++;
        if (seg === 2) burst(FAR.x, FAR.z);
        if (seg === 0 && st.seg === 3) burst(NEAR.x, NEAR.z);
        st.seg = seg;
      }
      // Wobble: lateral drift, roll and a sag, all peaking mid-wire; every third crossing is a near-stumble.
      const amp = (st.crossings > 0 && st.crossings % 3 === 0) ? 1.6 : 1.0;
      const lat = 0.10 * amp * mid * Math.sin(TAU * 0.7 * time + 0.8);
      const roll = 0.10 * amp * mid * Math.sin(TAU * 0.7 * time);
      const g = walker.group;
      g.position.x += s * DIR.x + lat * PERP.x;
      g.position.z += s * DIR.z + lat * PERP.z;
      g.position.y += -0.08 * mid + 0.02 * mid * Math.abs(Math.sin(TAU * 2.2 * time));
      g.rotation.z = roll;
      // Yaw: face the far post on the way out, the near post on the way back (0.4 s eased turn on the platforms).
      const yawTarget = (seg === 2 || seg === 3) ? 1 : 0;
      st.yawK += (yawTarget - st.yawK) * Math.min(1, dt * 8);
      g.rotation.y = YAW0 - Math.PI * st.yawK;
      // Pole in both hands: midpoint of the hand attach points, length along the hand-to-hand line.
      const parts = walker.parts;
      if (parts && parts.handL && parts.handR) {
        group.updateWorldMatrix(true, false);
        parts.handL.getWorldPosition(_a); parts.handR.getWorldPosition(_b);
        group.worldToLocal(_a); group.worldToLocal(_b);
        _d.subVectors(_b, _a);
        pole.position.copy(_a).addScaledVector(_d, 0.5);
        if (_d.lengthSq() > 1e-6) pole.quaternion.setFromUnitVectors(X_AXIS, _d.normalize());
      } else {
        pole.position.copy(g.position); pole.position.y += 0.9;
      }
      st.poleT = 1;
    } else if (st.poleT < 1) {
      // The pole eases back to its chocks on the near platform.
      st.poleT = Math.min(1, st.poleT + dt / 0.5);
      const k = easeInOut(st.poleT);
      pole.position.lerpVectors(poleFrom, poleRestPos, k);
      pole.quaternion.slerpQuaternions(poleFromQ, poleRestQ, k);
    }

    // Net sway while someone is on the wire.
    const swayTarget = walker && mid > 0 ? 1 : 0;
    st.netSway += (swayTarget - st.netSway) * Math.min(1, dt * 3);
    const sw = st.netSway * Math.sin(TAU * 0.4 * time);
    for (let i = 0; i < 4; i++) { const n = netParts[i]; n.scale.y = 1 + 0.004 * sw; n.position.y = (i % 2 ? 1.195 : 1.2) + 0.01 * sw; }

    // Confetti and sparkles.
    for (let i = 0; i < 24; i++) {
      const c = confetti[i];
      if (!c.m.visible) continue;
      c.life -= dt; c.vy -= 3.0 * dt;
      c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
      c.m.rotation.x += 4 * dt; c.m.rotation.z += 3 * dt;
      c.m.material.opacity = clamp(c.life / 0.4, 0, 1);
      if (c.life <= 0 || c.m.position.y < c.floor) c.m.visible = false;
    }
    for (let i = 0; i < 6; i++) {
      const sp = sparks[i];
      if (!sp.m.visible) continue;
      sp.life -= dt;
      const u = 1 - clamp(sp.life / 0.6, 0, 1);
      sp.m.position.y = sp.y0 + 0.5 * u; sp.m.material.opacity = 1 - u;
      if (sp.life <= 0) sp.m.visible = false;
    }

    // Owl: fades out when a walker arrives, back in 1.5 s after the walker leaves; turns its head toward the path.
    if (!walker && time - owlSt.leftAt > 1.5) owlSt.target = 1;
    if (owlSt.alpha !== owlSt.target) {
      const rate = owlSt.target < owlSt.alpha ? dt / 0.5 : dt / 0.8;
      owlSt.alpha = owlSt.target < owlSt.alpha ? Math.max(owlSt.target, owlSt.alpha - rate) : Math.min(owlSt.target, owlSt.alpha + rate);
      fadeHandle(owl.h, owlSt.alpha);
    }
    owl.g.visible = owlSt.alpha > 0.01;
    if (owl.g.visible) {
      tickResident(owl, dt, time);
      animateAnimal(owl.h, owl.agent, time, dt, 'stand');
      if (time > owlSt.nextTurn) { owlSt.nextTurn = time + 3 + 2 * Math.random(); owlSt.headTarget = owlSt.headTarget > 0.1 ? -0.2 : 0.7; }
      owlSt.headCur += (owlSt.headTarget - owlSt.headCur) * Math.min(1, dt * 4);
      if (owl.head) owl.head.rotation.y += owlSt.headCur;
    }

    // Turnbuckle glint by day: a 0.2 s flash every 6 s. Night: lanterns, string bulbs and pole caps glow.
    st.glintT = time % 6;
    buckleMat.emissiveIntensity = (r < 0.5 && st.glintT < 0.2) ? 0.3 : 0;
    lanternBulbs[0].emissiveIntensity = lanternBulbs[1].emissiveIntensity = 0.08 + 2.0 * r;
    stringWarm.emissiveIntensity = 0.05 + 1.4 * r;
    stringAqua.emissiveIntensity = 0.5 * (0.05 + 1.4 * r);
    capMat.emissiveIntensity = 0.3 * r;
  }
  return { group, anchor: new THREE.Vector3(NEAR.x, TOP, NEAR.z), yaw: YAW0, pose: 'balance', enter: 'walk', label: activityLabel, update };
}
