/* Technology department: a low steel-framed glass box with an open colonnade over an ink server
   floor, plum neon trim, four roof dishes and a blinking mast, plus a standing multi-monitor
   workstation station where code glyphs stream up from the screens while a robot arm assembles
   a gadget.
   Follows docs/CONTRACT_V2.md (department modules) and docs/CITY_DESIGN.md (tech). */
import * as THREE from 'three';
import { BRAND, mat, glass, glow, box, cyl, sphere, dome, torus, plane, canvasTex, decal, pointLight, lerp, clamp, easeInOut, rng } from './common.js';

export const id = 'tech';
export const activityLabel = 'Shipping code';

const TAU = Math.PI * 2;
const IRON = '#2E3E50', PLINTH = '#CFC6B6', INK = '#0E1B2E', DESK = '#E8DCC0', GREEN = '#1F8A5B';
const hasDoc = () => typeof document !== 'undefined';
const ramp = night => clamp((night - 0.25) / 0.75, 0, 1);
/* A work burst is the frame where phase.t % 3.2 crosses 0.7 (the same window the typing pose uses). */
const burstIndex = t => (t < 0.7 ? -1 : Math.floor((t - 0.7) / 3.2));

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function palette(dept) {
  return {
    wall: mat(dept.wall, { roughness: 0.9 }),
    accent: mat(dept.accent, { roughness: 0.78 }),
    door: mat(dept.accent, { roughness: 0.6 }),
    trim: mat(BRAND.white, { roughness: 0.8 }),
    plinth: mat(PLINTH, { roughness: 0.9 }),
    iron: mat(IRON, { roughness: 0.55, metalness: 0.2 }),
    ink: mat(INK, { roughness: 0.9 }),
    silver: mat(BRAND.silver, { roughness: 0.5, metalness: 0.2 }),
    desk: mat(DESK, { roughness: 0.8 }),
    white: mat('#FFFFFF', { roughness: 0.6 }),
    aqua: mat(BRAND.aqua, { roughness: 0.5 }),
    salmon: mat(BRAND.salmon, { roughness: 0.7 }),
  };
}

function screenMaterial(tex, intensity) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#FFFFFF'), map: tex, roughness: 0.6, emissive: new THREE.Color('#FFFFFF'), emissiveMap: tex, emissiveIntensity: intensity });
  m.userData.envMapIntensity = 0.25;
  return m;
}
function drawCode(c, w, h, accent) {
  c.fillStyle = INK; c.fillRect(0, 0, w, h);
  const r = rng('tech-code');
  const rows = 22, lh = h / rows;
  c.font = '500 ' + Math.floor(lh * 0.7) + 'px Consolas, Menlo, monospace'; c.textBaseline = 'middle';
  const words = ['const', 'await', 'return', 'if', 'for', 'fn', 'let', 'import', 'export', 'map', 'post', 'ledger', 'batch', 'commit'];
  for (let i = 0; i < rows; i++) {
    let x = lh * 0.4 + Math.floor(r() * 3) * lh * 1.2;
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const wd = words[Math.floor(r() * words.length)];
      c.fillStyle = k === 0 ? accent : (r() < 0.5 ? BRAND.aqua : '#FFFFFF');
      c.fillText(wd, x, (i + 0.5) * lh);
      x += c.measureText(wd).width + lh * 0.5;
      if (x > w * 0.85) break;
    }
  }
}
function drawGlyph(ch) {
  return (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = BRAND.aqua; c.font = 'bold ' + Math.floor(h * 0.8) + 'px Consolas, Menlo, monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, w / 2, h / 2 + h * 0.05);
  };
}
function drawSign(accent) {
  return (c, w, h) => {
    c.fillStyle = INK; c.fillRect(0, 0, w, h);
    c.fillStyle = accent; c.font = 'bold ' + Math.floor(h * 0.7) + 'px Consolas, Menlo, monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('</>', w / 2, h / 2 + h * 0.04);
  };
}

/* ---------------------------------------------------------------- building ---------- */
export function buildBuilding(ctx) {
  const { dept } = ctx;
  const M = palette(dept);
  const g = new THREE.Group();
  const glassMat = glass();
  const lights = [];
  const seeded = rng('tech-leds');

  // 1. Plinth with an aqua-edged walkway to the door.
  box(11, 0.14, 6, M.plinth, { x: 5.5, z: 3, parent: g });
  box(0.06, 0.01, 0.6, M.aqua, { x: 4.1, y: 0.14, z: 5.7, parent: g, castShadow: false });
  box(0.06, 0.01, 0.6, M.aqua, { x: 5.9, y: 0.14, z: 5.7, parent: g, castShadow: false });

  // 2. Frame: floor slab (top 0.34), roof slab (top 4.39), steel columns and a white sill band.
  box(10.4, 0.2, 5.4, M.wall, { x: 5.5, y: 0.14, z: 3.0, parent: g });
  box(10.6, 0.25, 5.6, M.wall, { x: 5.5, y: 4.14, z: 3.0, parent: g });
  for (const cx of [0.5, 2.5, 4.5, 6.5, 8.5, 10.5]) {
    box(0.18, 4.0, 0.18, M.iron, { x: cx, y: 0.14, z: 0.36, parent: g });
    box(0.18, 4.0, 0.18, M.iron, { x: cx, y: 0.14, z: 5.64, parent: g });
  }
  for (const cz of [1.5, 2.5, 3.5, 4.5]) {
    box(0.18, 4.0, 0.18, M.iron, { x: 0.36, y: 0.14, z: cz, parent: g });
    box(0.18, 4.0, 0.18, M.iron, { x: 10.64, y: 0.14, z: cz, parent: g });
  }
  box(10.6, 0.12, 5.6, M.trim, { x: 5.5, y: 1.6, z: 3.0, parent: g });

  // 3. Curtain glass from the sill band to the roof slab; below the sill the faces are open.
  box(10.0, 2.4, 0.06, glassMat, { x: 5.5, y: 1.72, z: 5.68, parent: g, castShadow: false });
  box(10.0, 2.4, 0.06, glassMat, { x: 5.5, y: 1.72, z: 0.32, parent: g, castShadow: false });
  box(0.06, 2.4, 5.0, glassMat, { x: 0.32, y: 1.72, z: 3.0, parent: g, castShadow: false });
  box(0.06, 2.4, 5.0, glassMat, { x: 10.68, y: 1.72, z: 3.0, parent: g, castShadow: false });

  // 4. Interior seen through the colonnade: ink floor and eight server racks with blinking LEDs.
  plane(10.0, 5.0, M.ink, { x: 5.5, y: 0.345, z: 3.0, rx: -Math.PI / 2, parent: g, receiveShadow: true });
  const ledMats = [], ledFreq = [], ledPhase = [];
  for (let k = 0; k < 6; k++) { ledMats.push(glow(BRAND.aqua, 0.6)); ledFreq.push(1 + seeded() * 2); ledPhase.push(seeded() * TAU); }
  const ledSalmon = glow(BRAND.salmon, 0.6);
  const racks = [[1.5, 1.4], [3.0, 1.4], [4.5, 1.4], [6.0, 1.4], [1.0, 3.8], [7.0, 3.8], [8.5, 3.8], [9.5, 3.8]];
  let ledIndex = 0;
  for (const [rx, rz] of racks) {
    box(0.8, 1.2, 0.6, M.iron, { x: rx, y: 0.34, z: rz, parent: g });
    for (let s = 0; s < 4; s++) {
      const m = (ledIndex % 7 === 6) ? ledSalmon : ledMats[ledIndex % 6];
      box(0.6, 0.04, 0.02, m, { x: rx, y: 0.6 + s * 0.2, z: rz + 0.31, parent: g, castShadow: false });
      ledIndex++;
    }
  }

  // 5. Neon trim: two plum rings, one along the roof slab edge and one along the sill band.
  const neonMat = glow(dept.accent, 0.8);
  for (const ny of [4.39, 1.72]) {
    box(10.7, 0.08, 0.08, neonMat, { x: 5.5, y: ny, z: 0.19, parent: g, castShadow: false });
    box(10.7, 0.08, 0.08, neonMat, { x: 5.5, y: ny, z: 5.81, parent: g, castShadow: false });
    box(0.08, 0.08, 5.7, neonMat, { x: 0.19, y: ny, z: 3.0, parent: g, castShadow: false });
    box(0.08, 0.08, 5.7, neonMat, { x: 10.81, y: ny, z: 3.0, parent: g, castShadow: false });
  }

  // 6. Rooftop: four dishes, two HVAC units with spinning fans, a mast with a blinking tip.
  const dishes = [[1.5, 1.2, 0.4], [3.5, 1.0, 0.9], [7.5, 1.0, -0.9], [9.5, 1.2, -0.4]];
  for (const [dx, dz, yaw] of dishes) {
    const post = new THREE.Group(); post.position.set(dx, 4.39, dz); post.rotation.y = yaw; g.add(post);
    cyl(0.05, 0.05, 0.6, M.iron, { parent: post, castShadow: false, seg: 8 });
    const d = dome(0.5, M.silver, { y: 0.6, parent: post, rx: -1.0 });
    d.scale.y = 0.3;
  }
  const fans = [];
  for (const hz of [1.2, 3.8]) {
    box(1.2, 0.6, 1.0, M.plinth, { x: 5.5, y: 4.39, z: hz, parent: g });
    fans.push(cyl(0.35, 0.35, 0.05, M.iron, { x: 5.5, y: 4.99, z: hz, parent: g, castShadow: false, seg: 6 }));
  }
  cyl(0.03, 0.03, 1.6, M.trim, { x: 5.5, y: 4.39, z: 2.5, parent: g, castShadow: false, seg: 8 });
  const mastMat = glow(BRAND.salmon, 1.0);
  sphere(0.08, mastMat, { x: 5.5, y: 5.95, z: 2.5, parent: g, castShadow: false });

  // 7. Entrance: glass vestibule and sliding doors in plum frames, a glowing canopy, a '</>' sign.
  // CONTRACT: the brief centers the vestibule at x 5.5; it is centered on the door at x 5 here.
  box(2.0, 2.2, 0.6, glassMat, { x: 5, y: 0.34, z: 5.4, parent: g, castShadow: false });
  box(2.1, 0.1, 0.7, M.door, { x: 5, y: 2.54, z: 5.4, parent: g, castShadow: false });
  box(0.08, 2.3, 0.7, M.door, { x: 3.96, y: 0.34, z: 5.4, parent: g, castShadow: false });
  box(0.08, 2.3, 0.7, M.door, { x: 6.04, y: 0.34, z: 5.4, parent: g, castShadow: false });
  box(1.8, 2.2, 0.08, M.door, { x: 5, y: 0.14, z: 5.72, parent: g });
  box(1.6, 2.1, 0.06, glassMat, { x: 5, y: 0.19, z: 5.76, parent: g, castShadow: false });
  box(0.03, 2.1, 0.07, M.iron, { x: 5, y: 0.19, z: 5.76, parent: g, castShadow: false });
  const canopyMat = glow(dept.accent, 0.5);
  box(2.6, 0.12, 1.2, canopyMat, { x: 5, y: 2.4, z: 5.9, parent: g });
  cyl(0.04, 0.04, 2.4, M.iron, { x: 4.0, y: 0.14, z: 6.3, parent: g, castShadow: false, seg: 8 });
  cyl(0.04, 0.04, 2.4, M.iron, { x: 6.0, y: 0.14, z: 6.3, parent: g, castShadow: false, seg: 8 });
  if (hasDoc()) decal(1.2, 0.6, canvasTex(256, 128, drawSign(dept.accent)), { x: 8.8, y: 3.3, z: 5.75, parent: g, emissive: 0.5 });
  else box(1.2, 0.6, 0.04, M.ink, { x: 8.8, y: 3.0, z: 5.73, parent: g, castShadow: false });

  // 8. Bike rack: three upright hoops on the plinth.
  for (const bx of [0.8, 1.2, 1.6]) torus(0.3, 0.03, M.iron, { x: bx, y: 0.44, z: 5.85, parent: g, castShadow: false });

  // Night light: aqua spill from the colonnade onto the plinth.
  // CONTRACT: the intensity here is the base; the renderer scales it with night.
  lights.push(pointLight(BRAND.aqua, 5, 6, { x: 5.5, y: 2.0, z: 2.6, parent: g }));

  function update(dt, time, night, active) {
    const r = ramp(night || 0);
    neonMat.emissiveIntensity = 0.8 + 1.2 * r;
    canopyMat.emissiveIntensity = 0.5 + 0.7 * r;
    const boost = 1 + r;
    for (let k = 0; k < 6; k++) ledMats[k].emissiveIntensity = (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(TAU * ledFreq[k] * time + ledPhase[k]))) * boost;
    ledSalmon.emissiveIntensity = (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(TAU * 1.5 * time))) * boost;
    for (const f of fans) f.rotation.y += 6 * dt;
    mastMat.emissiveIntensity = Math.sin(TAU * time) > 0 ? 1.6 : 0.2;
  }
  return { group: g, glass: [glassMat], lights, update };
}

/* ---------------------------------------------------------------- activity ---------- */
const GLYPHS = ['{', '}', ';', '0', '1', '<', '>', '=', '/', '*', 'λ', '=>'];
const GLYPH_LIFE = 1.8;
/* Robot arm keyframes: time, yaw, shoulder, elbow, grip (yaw values are filled in at build). */
const ARM_KEYS = [
  [0.0, 'park', 0.3, -2.4, 0.1],
  [0.5, 'tray', -0.5, -1.2, 0.1],
  [0.9, 'tray', -0.6, -2.0, 0.04],
  [1.3, 'tray', -0.5, -1.2, 0.04],
  [2.1, 'gadget', -0.5, -1.2, 0.04],
  [2.5, 'gadget', -0.9, -1.6, 0.04],
  [2.8, 'gadget', -0.5, -1.2, 0.1],
  [3.2, 'park', 0.3, -2.4, 0.1],
];
const CYCLE = 3.2;
const PART_LIFT = 0.9, PART_SWING0 = 1.3, PART_SWING1 = 2.1, PART_PLACE = 2.5;

export function buildActivity(ctx) {
  const { dept } = ctx;
  const M = palette(dept);
  const g = new THREE.Group();
  const rand = rng('tech-workstation');

  // CONTRACT: the brief describes a seated station (anchor y 0.42, pose type), but 'type' is the
  // standing typing pose and the renderer does not lower the rig, so this is a standing desk:
  // anchor on the ground, desk top at 0.5, monitor tops at or below 1.0 (principle 6 standing rule).
  // 8. Floor mat, 1. standing desk at z 3.0 (anchor.z + 0.55) on two pedestals, keyboard and mug.
  plane(2.8, 1.6, M.ink, { x: 2.0, y: 0.01, z: 2.6, rx: -Math.PI / 2, parent: g, receiveShadow: true });
  box(2.2, 0.06, 0.7, M.desk, { x: 2.0, y: 0.5, z: 3.0, parent: g });
  box(0.5, 0.5, 0.6, M.iron, { x: 1.15, y: 0, z: 3.0, parent: g });
  box(0.5, 0.5, 0.6, M.iron, { x: 2.85, y: 0, z: 3.0, parent: g });
  box(0.7, 0.03, 0.22, M.iron, { x: 2.0, y: 0.56, z: 2.78, parent: g, castShadow: false });
  cyl(0.05, 0.05, 0.1, M.white, { x: 1.3, y: 0.56, z: 2.8, parent: g, castShadow: false, seg: 12 });

  // 2. Monitors facing -z toward the standing alien; the center top sits at 0.98 so the face shows.
  let codeTex = null, screenMat;
  if (hasDoc()) {
    codeTex = canvasTex(256, 512, (c, w, h) => drawCode(c, w, h, dept.accent));
    codeTex.wrapT = THREE.RepeatWrapping;
    screenMat = screenMaterial(codeTex, 0.8);
  } else {
    screenMat = glow(BRAND.aqua, 0.8);
  }
  const monitors = [[2.0, 0.8, 0.42, 0], [1.25, 0.7, 0.4, -0.35], [2.75, 0.7, 0.4, 0.35]];
  for (const [mx, mw, mh, yaw] of monitors) {
    const mon = new THREE.Group(); mon.position.set(mx, 0.56, 3.1); mon.rotation.y = yaw; g.add(mon);
    box(mw, mh, 0.04, M.iron, { parent: mon, castShadow: false });
    plane(mw - 0.06, mh - 0.06, screenMat, { y: mh / 2, z: -0.025, ry: Math.PI, parent: mon });
    box(0.12, 0.03, 0.01, M.trim, { y: mh / 2 + 0.08, z: 0.025, parent: mon, castShadow: false });
    box(0.03, 0.1, 0.01, M.trim, { y: mh / 2 - 0.02, z: 0.025, parent: mon, castShadow: false });
    cyl(0.04, 0.04, 0.06, M.iron, { y: -0.06, z: 0.0, parent: mon, castShadow: false, seg: 8 });
  }

  // 3. Floating glyph pool rising from the monitor tops.
  const glyphs = [], glyphMats = [];
  const glyphAge = new Float32Array(GLYPHS.length).fill(-1), glyphX = new Float32Array(GLYPHS.length), glyphPhase = new Float32Array(GLYPHS.length);
  for (let i = 0; i < GLYPHS.length; i++) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.aqua), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    if (hasDoc()) { m.map = canvasTex(64, 64, drawGlyph(GLYPHS[i])); m.color.set('#FFFFFF'); }
    const p = plane(0.3, 0.3, m, { parent: g }); p.visible = false; p.renderOrder = 5;
    glyphs.push(p); glyphMats.push(m);
  }

  // 4. Robot arm on the desk's east end: base yaw, shoulder and elbow pivots, two-finger gripper.
  const armBase = new THREE.Group(); armBase.position.set(3.0, 0.56, 3.0); g.add(armBase);
  cyl(0.15, 0.15, 0.1, M.iron, { parent: armBase, castShadow: false, seg: 16 });
  const shoulder = new THREE.Group(); shoulder.position.y = 0.22; armBase.add(shoulder);
  sphere(0.12, M.accent, { parent: shoulder, castShadow: false });
  const ledMat = glow(BRAND.salmon, 0.8);
  sphere(0.03, ledMat, { x: 0.1, y: 0.08, parent: shoulder, castShadow: false });
  box(0.08, 0.5, 0.08, M.iron, { parent: shoulder, castShadow: false });
  const elbow = new THREE.Group(); elbow.position.y = 0.5; shoulder.add(elbow);
  sphere(0.1, M.accent, { parent: elbow, castShadow: false });
  box(0.07, 0.45, 0.07, M.iron, { parent: elbow, castShadow: false });
  const grip = new THREE.Group(); grip.position.y = 0.45; elbow.add(grip);
  const fingerL = box(0.04, 0.15, 0.04, M.silver, { x: -0.05, parent: grip, castShadow: false });
  const fingerR = box(0.04, 0.15, 0.04, M.silver, { x: 0.05, parent: grip, castShadow: false });
  const yawTo = (tx, tz) => Math.atan2(-(tz - 3.0), tx - 3.0);
  const YAW = { park: 0.2, tray: yawTo(3.4, 2.75), gadget: yawTo(3.4, 2.5) };

  // 5. Side table with the gadget pad, a blank gadget body and three staged parts in a tray
  //    (lowered with the desk so the arm keyframes keep their reach).
  box(0.6, 0.56, 0.6, M.iron, { x: 3.4, y: 0, z: 2.5, parent: g });
  box(0.6, 0.04, 0.6, M.silver, { x: 3.4, y: 0.56, z: 2.5, parent: g, castShadow: false });
  box(0.5, 0.03, 0.2, M.iron, { x: 3.4, y: 0.6, z: 2.72, parent: g, castShadow: false });
  const GADGET_Y = 0.6;
  const gadget = new THREE.Group(); gadget.position.set(3.4, GADGET_Y, 2.5); g.add(gadget);
  const gadgetBody = box(0.35, 0.2, 0.25, M.silver, { parent: gadget, castShadow: false });
  const lens = cyl(0.08, 0.08, 0.05, M.aqua, { parent: gadget, castShadow: false, seg: 16 });
  const antenna = cyl(0.02, 0.02, 0.2, M.accent, { parent: gadget, castShadow: false, seg: 8 });
  const button = sphere(0.05, M.salmon, { parent: gadget, castShadow: false });
  const parts = [lens, antenna, button];
  // Positions are gadget-local: in the tray, and on the finished gadget.
  const TRAY = [[-0.15, 0.0, 0.22], [0.0, 0.0, 0.22], [0.15, 0.05, 0.22]];
  const SLOT = [[0.0, 0.08, 0.14], [0.1, 0.2, -0.05], [-0.1, 0.24, 0.0]];
  const SLOT_RX = [Math.PI / 2, 0, 0];
  function resetParts() {
    for (let i = 0; i < 3; i++) { parts[i].position.set(TRAY[i][0], TRAY[i][1], TRAY[i][2]); parts[i].rotation.set(i === 0 ? Math.PI / 2 : 0, 0, 0); parts[i].scale.setScalar(1); }
    gadget.scale.setScalar(1); gadget.rotation.y = 0; gadget.position.y = GADGET_Y;
  }
  resetParts();
  const sparkMat = glow('#FFFFFF', 1.0);
  const spark = sphere(0.1, sparkMat, { parent: gadget, castShadow: false }); spark.scale.setScalar(0.001);

  // 6. Office chair parked beside the desk's west end (seat top 0.42); the alien stands at the anchor.
  const CHAIR_X = 0.55, CHAIR_Z = 2.4;
  cyl(0.3, 0.3, 0.08, M.iron, { x: CHAIR_X, y: 0.34, z: CHAIR_Z, parent: g, castShadow: false, seg: 20 });
  box(0.5, 0.5, 0.06, M.iron, { x: CHAIR_X, y: 0.42, z: CHAIR_Z - 0.25, parent: g, castShadow: false });
  cyl(0.04, 0.04, 0.34, M.iron, { x: CHAIR_X, y: 0, z: CHAIR_Z, parent: g, castShadow: false, seg: 8 });
  for (let k = 0; k < 5; k++) {
    const a = k * TAU / 5;
    const spoke = box(0.32, 0.04, 0.06, M.iron, { x: CHAIR_X + Math.cos(a) * 0.16, y: 0.0, z: CHAIR_Z + Math.sin(a) * 0.16, parent: g, castShadow: false });
    spoke.rotation.y = -a;
  }

  // 7. Server tower with six LEDs and a cable to the desk.
  box(0.6, 1.6, 0.6, M.iron, { x: 0.5, y: 0, z: 1.0, parent: g });
  const srvA = glow(BRAND.aqua, 0.6), srvB = glow(BRAND.aqua, 0.6);
  for (let i = 0; i < 6; i++) box(0.08, 0.08, 0.02, i % 2 ? srvA : srvB, { x: 0.38 + (i % 2) * 0.24, y: 0.9 + Math.floor(i / 2) * 0.2, z: 1.31, parent: g, castShadow: false });
  const cable = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.6, 1.2, 1.3), new THREE.Vector3(0.9, 0.3, 2.0), new THREE.Vector3(1.15, 0.48, 2.7));
  const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cable, 10, 0.02, 6, false), M.iron);
  cableMesh.castShadow = false; g.add(cableMesh);

  // State. Colors are prebuilt so per-frame emissive swaps are copies, not string parses.
  const accentColor = new THREE.Color(dept.accent), whiteColor = new THREE.Color('#FFFFFF');
  const greenColor = new THREE.Color(GREEN), salmonColor = new THREE.Color(BRAND.salmon);
  const st = { lastBurst: -1, cycle: -1, placed: 0, spawnAcc: 0, flash: 0, spark: 1, ledFlash: 0, armYaw: YAW.park, a1: 0.3, a2: -2.4, grip: 0.1, celebrate: false, screenPlum: false, ledGreen: false };

  function spawnGlyph() {
    for (let i = 0; i < GLYPHS.length; i++) {
      if (glyphAge[i] >= 0) continue;
      glyphAge[i] = 0; glyphX[i] = 1.1 + rand() * 1.8; glyphPhase[i] = rand() * TAU;
      glyphs[i].visible = true;
      return;
    }
  }

  function armPose(t) {
    // Interpolate the keyframes with ease in-out between neighbours.
    let i = 0;
    while (i < ARM_KEYS.length - 2 && t > ARM_KEYS[i + 1][0]) i++;
    const k0 = ARM_KEYS[i], k1 = ARM_KEYS[i + 1];
    const s = easeInOut(clamp((t - k0[0]) / (k1[0] - k0[0]), 0, 1));
    st.armYaw = lerp(YAW[k0[1]], YAW[k1[1]], s);
    st.a1 = lerp(k0[2], k1[2], s);
    st.a2 = lerp(k0[3], k1[3], s);
    st.grip = lerp(k0[4], k1[4], s);
  }

  function update(dt, time, phase, alien, active) {
    // Bursts: each one starts (or restarts) an arm cycle and flashes the screens.
    if (active) {
      const bi = burstIndex(phase ? phase.t : 0);
      if (bi !== st.lastBurst) {
        st.lastBurst = bi;
        if (bi >= 0) {
          st.flash = 0.3; spawnGlyph(); spawnGlyph();
          if (st.cycle < 0 || st.cycle > CYCLE - 0.4) { st.cycle = 0; st.celebrate = st.placed >= 3; }
        }
      }
    } else {
      st.lastBurst = -1;
    }

    // Screens.
    if (codeTex) codeTex.offset.y -= (active ? 0.06 : 0.01) * dt;
    st.flash = Math.max(0, st.flash - dt);
    const plum = st.flash > 0;
    if (plum !== st.screenPlum) { st.screenPlum = plum; screenMat.emissive.copy(plum ? accentColor : whiteColor); }
    screenMat.emissiveIntensity = plum ? 1.2 : (active ? 0.8 + 0.2 * Math.sin(TAU * 0.5 * time) : 0.35 + 0.08 * Math.sin(TAU * 0.2 * time));

    // Glyph stream.
    if (active) { st.spawnAcc += dt; while (st.spawnAcc >= 0.15) { st.spawnAcc -= 0.15; spawnGlyph(); } } else st.spawnAcc = 0;
    for (let i = 0; i < GLYPHS.length; i++) {
      if (glyphAge[i] < 0) continue;
      glyphAge[i] += dt;
      const p = glyphAge[i] / GLYPH_LIFE;
      const gl = glyphs[i];
      if (p >= 1) { glyphAge[i] = -1; gl.visible = false; glyphMats[i].opacity = 0; continue; }
      gl.position.set(glyphX[i] + 0.1 * Math.sin(glyphPhase[i] + glyphAge[i] * 3), lerp(1.05, 2.35, p), 3.1);
      gl.rotation.y = glyphPhase[i] + glyphAge[i];
      let op = p < 0.15 ? p / 0.15 : (p > 0.75 ? (1 - p) / 0.25 : 1);
      if (!active) { op = Math.min(op, Math.max(0, glyphMats[i].opacity - dt / 0.5)); if (op <= 0.01) { glyphAge[i] = -1; gl.visible = false; } }
      glyphMats[i].opacity = op;
    }

    // Robot arm cycle.
    if (st.cycle >= 0) {
      const prev = st.cycle;
      st.cycle += dt;
      const t = st.cycle;
      const idx = Math.min(st.placed, 2);
      if (!st.celebrate) {
        armPose(Math.min(t, CYCLE));
        const part = parts[idx], tr = TRAY[idx], sl = SLOT[idx];
        if (t >= PART_LIFT && t < PART_PLACE) {
          const lift = 0.3 * easeInOut(clamp((t - PART_LIFT) / 0.4, 0, 1));
          const s = easeInOut(clamp((t - PART_SWING0) / (PART_SWING1 - PART_SWING0), 0, 1));
          const drop = easeInOut(clamp((t - PART_SWING1) / (PART_PLACE - PART_SWING1), 0, 1));
          part.position.set(lerp(tr[0], sl[0], s), lerp(tr[1], sl[1], s) + lift * (1 - drop), lerp(tr[2], sl[2], s));
          part.rotation.x = lerp(idx === 0 ? Math.PI / 2 : 0, SLOT_RX[idx], s);
        }
        if (prev < PART_PLACE && t >= PART_PLACE) {
          part.position.set(sl[0], sl[1], sl[2]); part.rotation.x = SLOT_RX[idx];
          st.placed++; st.spark = 0; st.ledFlash = 0.3;
        }
      } else {
        // Three parts placed: the arm parks while the gadget hops, spins once and shrinks away,
        // then a blank body returns with the parts back in the tray.
        const kp = 1 - Math.exp(-dt * 4);
        st.armYaw += (YAW.park - st.armYaw) * kp; st.a1 += (0.3 - st.a1) * kp; st.a2 += (-2.4 - st.a2) * kp; st.grip += (0.1 - st.grip) * kp;
        const c = clamp((t - 0.2) / 0.6, 0, 1);
        gadget.position.y = GADGET_Y + 0.3 * Math.sin(Math.PI * c);
        gadget.rotation.y = TAU * easeInOut(c);
        gadget.scale.setScalar(Math.max(0.001, 1 - clamp((t - 0.9) / 0.4, 0, 1)));
        if (t >= 1.4 && gadget.scale.x < 0.01) { st.placed = 0; st.celebrate = false; resetParts(); }
      }
      if (t >= CYCLE) st.cycle = -1;
    } else {
      // Parked: ease toward the folded pose.
      const k = 1 - Math.exp(-dt * 4);
      st.armYaw += (YAW.park - st.armYaw) * k; st.a1 += (0.3 - st.a1) * k; st.a2 += (-2.4 - st.a2) * k; st.grip += (0.1 - st.grip) * k;
    }
    armBase.rotation.y = st.armYaw;
    shoulder.rotation.z = st.a1;
    elbow.rotation.z = st.a2;
    fingerL.position.x = -st.grip * 0.5 - 0.02; fingerR.position.x = st.grip * 0.5 + 0.02;

    // Spark and status LED after a snap.
    st.spark = Math.min(1, st.spark + dt / 0.3);
    const idx2 = clamp(st.placed - 1, 0, 2);
    spark.position.set(SLOT[idx2][0], SLOT[idx2][1] + 0.05, SLOT[idx2][2]);
    spark.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * st.spark) * 1.5));
    st.ledFlash = Math.max(0, st.ledFlash - dt);
    const green = st.ledFlash > 0;
    if (green !== st.ledGreen) { st.ledGreen = green; ledMat.emissive.copy(green ? greenColor : salmonColor); }

    // Server LEDs: 2 to 4 Hz while working, 0.5 Hz idle (data centers never sleep).
    const f = active ? 3 : 0.5;
    srvA.emissiveIntensity = Math.sin(TAU * f * time) > 0 ? 1.0 : 0.3;
    srvB.emissiveIntensity = Math.sin(TAU * (active ? 2.3 : 0.5) * time + 1.7) > 0 ? 1.0 : 0.3;
  }

  return {
    group: g,
    anchor: new THREE.Vector3(2.0, 0, 2.45),
    yaw: 0,
    pose: 'type',
    enter: 'walk',
    label: activityLabel,
    update,
  };
}
