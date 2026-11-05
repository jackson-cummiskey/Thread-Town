/* Embedded Banking: connector hub, two glass-fronted wings joined by three thread arches over a glass atrium.
   Activity: switchboard (screen based). Light beads race along cables from the console ports to partner totems;
   one cable replugs on every work burst.
   Built per docs/CONTRACT_V2.md (Department modules) and docs/CITY_DESIGN.md (## embedded). */
import * as THREE from 'three';
import {
  BRAND, mat, glass, glow, box, cyl, sphere, dome, torus, plane, canvasTex, decal, pointLight, clamp, easeInOut,
} from './common.js';

export const id = 'embedded';
export const activityLabel = 'Patching partner connections';

const TAU = Math.PI * 2;
const hasDoc = typeof document !== 'undefined';
function tex(w, h, draw) { return hasDoc ? canvasTex(w, h, draw) : null; }
function ramp(night) { return clamp((night - 0.25) / 0.75, 0, 1); }

const C = { stone: '#CFC6B6', iron: '#2E3E50', mat: '#DCE9F5', silver: BRAND.silver };

/* One framed window with a sill. face: 's' (+z), 'n' (-z), 'e' (+x), 'w' (-x). (x, y, z) is the window center on the wall plane. */
function win(parent, glassMat, frameMat, x, y, z, w, h, face) {
  const nx = face === 'e' ? 1 : face === 'w' ? -1 : 0;
  const nz = face === 's' ? 1 : face === 'n' ? -1 : 0;
  const side = nx !== 0;
  box(side ? 0.08 : w + 0.12, h + 0.12, side ? w + 0.12 : 0.08, frameMat, { x: x + nx * 0.04, y: y - h / 2 - 0.06, z: z + nz * 0.04, parent, castShadow: false });
  box(side ? 0.10 : w, h, side ? w : 0.10, glassMat, { x: x + nx * 0.06, y: y - h / 2, z: z + nz * 0.06, parent, castShadow: false });
  box(side ? 0.14 : w + 0.2, 0.06, side ? w + 0.2 : 0.14, frameMat, { x: x + nx * 0.07, y: y - h / 2 - 0.12, z: z + nz * 0.07, parent, castShadow: false });
}

function drawLabel(c2d, w, h, bg, fg, text) {
  c2d.fillStyle = bg; c2d.fillRect(0, 0, w, h);
  c2d.fillStyle = fg; c2d.font = `bold ${Math.round(h * 0.6)}px Kanit, Inter, sans-serif`;
  c2d.textAlign = 'center'; c2d.textBaseline = 'middle'; c2d.fillText(text, w / 2, h * 0.54);
}

export function buildBuilding(ctx) {
  const { dept } = ctx;
  const g = new THREE.Group();
  const stone = mat(C.stone, { roughness: 0.9 });
  const wall = mat(dept.wall, { roughness: 0.9 });
  const trim = mat(BRAND.white, { roughness: 0.8 });
  const aquaRoof = mat(dept.accent, { roughness: 0.78 });
  const aquaDoor = mat(dept.accent, { roughness: 0.6 });
  const aquaCanvas = mat(dept.accent, { roughness: 0.92, doubleSide: true });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const glassMat = glass('#AFD6E4');
  // Arches are neon at night: fresh glow materials that sit at 0 by day.
  const archAqua = glow(BRAND.aqua, 0), archSalmon = glow(BRAND.salmon, 0);
  const beadMat = glow('#FFFFFF', 1.0);
  const feedMat = glow(BRAND.aqua, 0.8);

  // 1. Plinth with the aqua thread stripe running north to south under the atrium
  box(10, 0.14, 6, stone, { x: 5, y: 0, z: 3, parent: g });
  plane(0.4, 6.0, aquaRoof, { x: 5, y: 0.15, z: 3, rx: -Math.PI / 2, parent: g });
  // 2. Two wings with glass curtains and white mullion grids
  for (const wx of [1.9, 8.1]) {
    box(3.6, 4.6, 5.4, wall, { x: wx, y: 0.14, z: 3.0, radius: 0.08, parent: g });
    plane(3.2, 3.8, glassMat, { x: wx, y: 2.4, z: 5.73, parent: g });
    for (const dx of [-0.8, 0, 0.8]) box(0.08, 3.8, 0.06, trim, { x: wx + dx, y: 0.5, z: 5.76, parent: g, castShadow: false });
    for (const hy of [1.45, 2.4, 3.35]) box(3.2, 0.08, 0.06, trim, { x: wx, y: hy - 0.04, z: 5.76, parent: g, castShadow: false });
    // 6. Wing parapets
    box(3.8, 0.25, 5.6, aquaRoof, { x: wx, y: 4.74, z: 3.0, parent: g });
  }
  // 3. Glass atrium with frame posts, floor band and roof
  box(2.6, 4.4, 5.4, glassMat, { x: 5, y: 0.14, z: 3.0, parent: g });
  for (const px of [3.7, 6.3]) for (const pz of [0.3, 5.7]) box(0.08, 4.4, 0.08, trim, { x: px, y: 0.14, z: pz, parent: g, castShadow: false });
  box(2.64, 0.12, 5.44, trim, { x: 5, y: 2.1, z: 3.0, parent: g, castShadow: false });
  box(2.6, 0.2, 5.4, trim, { x: 5, y: 4.54, z: 3.0, parent: g });
  // 4. Three thread arches (torus in the xy plane spans x) and 5. pulse beads
  const archZ = [1.3, 3.0, 4.7];
  const beads = [];
  archZ.forEach((z, k) => {
    torus(1.5, 0.09, k === 1 ? archSalmon : archAqua, { x: 5, y: 4.6, z, parent: g });
    beads.push(sphere(0.12, beadMat, { x: 3.5, y: 4.6, z, parent: g, castShadow: false }));
  });
  // 7. Dish on the east wing
  cyl(0.08, 0.08, 0.9, iron, { x: 8.4, y: 4.99, z: 2.0, parent: g, castShadow: false });
  const dishYaw = new THREE.Group(); dishYaw.position.set(8.4, 5.89, 2.0); g.add(dishYaw);
  const dishTilt = new THREE.Group(); dishTilt.rotation.x = -0.9; dishYaw.add(dishTilt);
  const dish = dome(0.75, trim, { parent: dishTilt }); dish.scale.y = 0.35;
  sphere(0.07, feedMat, { y: 0.35, parent: dishTilt, castShadow: false });
  // 8. Lettering and port emblem
  const letterTex = tex(512, 86, (c2d, w, h) => drawLabel(c2d, w, h, BRAND.white, BRAND.navy, 'Embedded'));
  if (letterTex) decal(3.0, 0.5, letterTex, { x: 1.9, y: 5.25, z: 5.6, parent: g });
  else plane(3.0, 0.5, trim, { x: 1.9, y: 5.25, z: 5.6, parent: g });
  const emblemTex = tex(256, 256, (c2d, w, h) => {
    c2d.clearRect(0, 0, w, h);
    c2d.fillStyle = '#FFFFFF'; c2d.beginPath(); c2d.arc(w / 2, h / 2, w * 0.46, 0, TAU); c2d.fill();
    c2d.strokeStyle = BRAND.aqua; c2d.lineWidth = w * 0.07; c2d.lineCap = 'round';
    c2d.beginPath(); c2d.moveTo(w * 0.2, h * 0.5); c2d.lineTo(w * 0.42, h * 0.5); c2d.stroke();
    c2d.beginPath(); c2d.moveTo(w * 0.58, h * 0.5); c2d.lineTo(w * 0.8, h * 0.5); c2d.stroke();
    c2d.fillStyle = BRAND.aqua;
    c2d.fillRect(w * 0.38, h * 0.36, w * 0.1, h * 0.28); c2d.fillRect(w * 0.52, h * 0.36, w * 0.1, h * 0.28);
    c2d.fillStyle = BRAND.navy; c2d.fillRect(w * 0.47, h * 0.42, w * 0.06, h * 0.16);
  });
  if (emblemTex) { const e = decal(1.2, 1.2, emblemTex, { x: 5, y: 3.2, z: 5.72, parent: g }); e.material.transparent = true; }
  // 9. Windows on the wings' north faces and outer flanks (same glass material)
  for (const wx of [1.9, 8.1]) for (const dx of [-1.0, 0, 1.0]) {
    win(g, glassMat, trim, wx + dx, 1.25, 0.3, 0.7, 0.9, 'n');
    win(g, glassMat, trim, wx + dx, 3.05, 0.3, 0.7, 0.9, 'n');
  }
  for (const z of [2.0, 3.8]) {
    win(g, glassMat, trim, 0.1, 1.25, z, 0.7, 0.9, 'w'); win(g, glassMat, trim, 0.1, 3.05, z, 0.7, 0.9, 'w');
    win(g, glassMat, trim, 9.9, 1.25, z, 0.7, 0.9, 'e'); win(g, glassMat, trim, 9.9, 3.05, z, 0.7, 0.9, 'e');
  }
  // 10. Glass double door with an aqua frame and canopy
  box(1.8, 2.15, 0.08, aquaDoor, { x: 5, y: 0.14, z: 5.70, parent: g, castShadow: false });
  box(1.6, 2.0, 0.08, glassMat, { x: 5, y: 0.14, z: 5.72, parent: g, castShadow: false });
  box(0.04, 2.0, 0.1, trim, { x: 5, y: 0.14, z: 5.72, parent: g, castShadow: false });
  plane(2.2, 0.9, aquaCanvas, { x: 5, y: 2.3, z: 6.0, rx: -Math.PI / 2, parent: g, castShadow: true });
  const lights = [pointLight(BRAND.aqua, 4, 4, { x: 5, y: 3.0, z: 3.0, parent: g })];

  function update(dt, time, night) {
    const r = ramp(night || 0);
    archAqua.emissiveIntensity = 0.9 * r; archSalmon.emissiveIntensity = 0.9 * r;
    beadMat.emissiveIntensity = 1.0 + 1.0 * r;
    feedMat.emissiveIntensity = r > 0 ? (Math.sin(TAU * 0.5 * time) > 0 ? 1.5 * r + 0.8 * (1 - r) : 0.4) : 0.8;
    for (let k = 0; k < 3; k++) {
      const tt = time + 0.6 * k;
      const pass = Math.floor(tt / 1.8), u = (tt / 1.8) - pass;
      const th = (pass % 2 === 0) ? Math.PI * (1 - u) : Math.PI * u;
      beads[k].position.set(5 + 1.5 * Math.cos(th), 4.6 + 1.5 * Math.sin(th), archZ[k]);
    }
    dishYaw.rotation.y = 0.4 * Math.sin(TAU * 0.1 * time);
  }
  return { group: g, glass: [glassMat], lights, update };
}

const PORTS = 12, CABLES = 6;
const totemTops = [[0.4, 1.9, 0.6], [1.5, 1.9, 0.3], [2.6, 1.9, 0.6]];
const _p = new THREE.Vector3();

export function buildActivity(ctx) {
  const g = new THREE.Group();
  const navy = mat(BRAND.navy, { roughness: 0.6 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const matFloor = mat(C.mat, { roughness: 0.95 });
  const white = mat(BRAND.white, { roughness: 0.8 });

  // 6. Floor mat
  plane(2.8, 1.4, matFloor, { x: 1.5, y: 0.01, z: 2.4, rx: -Math.PI / 2, parent: g });
  // 1. Console (desk between the alien and the camera, z 2.65..3.35)
  box(2.6, 0.75, 0.7, navy, { x: 1.5, y: 0, z: 3.0, parent: g });
  const stripTex = tex(512, 64, (c2d, w, h) => {
    c2d.fillStyle = BRAND.navy; c2d.fillRect(0, 0, w, h);
    c2d.fillStyle = '#FFFFFF'; c2d.font = `bold ${Math.round(h * 0.7)}px Kanit, Inter, sans-serif`;
    c2d.textAlign = 'left'; c2d.textBaseline = 'middle'; c2d.fillText('T', w * 0.03, h * 0.54);
    c2d.fillStyle = C.silver; c2d.font = `${Math.round(h * 0.42)}px Inter, Kanit, sans-serif`;
    c2d.fillText('Pay   Cards   Ledger   Payouts   Wallet', w * 0.12, h * 0.54);
  });
  if (stripTex) decal(2.4, 0.3, stripTex, { x: 1.5, y: 0.45, z: 3.36, emissive: 0.15, parent: g });
  // Port field: a slab resting on the console's alien-side edge and rising toward the camera (far edge y 0.98),
  // so its top face tilts toward the alien and shows the partner node map.
  const field = new THREE.Group(); field.position.set(1.5, 0.76, 2.82); field.rotation.x = -0.45; g.add(field);
  box(2.6, 0.05, 0.5, navy, { z: 0.25, parent: field });
  const nodesTex = tex(512, 96, (c2d, w, h) => {
    c2d.fillStyle = '#0B2A47'; c2d.fillRect(0, 0, w, h);
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push([w * (0.08 + i * 0.12), h * (i % 2 ? 0.3 : 0.7)]);
    c2d.strokeStyle = 'rgba(226,233,238,0.35)'; c2d.lineWidth = 2;
    for (let i = 0; i < 7; i++) { c2d.beginPath(); c2d.moveTo(pts[i][0], pts[i][1]); c2d.lineTo(pts[i + 1][0], pts[i + 1][1]); c2d.stroke(); }
    c2d.fillStyle = C.silver;
    for (const p of pts) { c2d.beginPath(); c2d.arc(p[0], p[1], h * 0.085, 0, TAU); c2d.fill(); }
  });
  let screenMat;
  if (nodesTex) { const s = decal(2.5, 0.45, nodesTex, { y: 0.052, z: 0.25, rx: -Math.PI / 2, emissive: 0.7, parent: field }); screenMat = s.material; }
  else { screenMat = glow(BRAND.aqua, 0.7); plane(2.5, 0.45, screenMat, { y: 0.052, z: 0.25, rx: -Math.PI / 2, parent: field }); }
  const portMats = [], portPos = [];
  field.updateMatrix();
  for (let i = 0; i < PORTS; i++) {
    const col = i % 6, row = Math.floor(i / 6);
    const lx = -0.95 + col * 0.38, lz = row === 0 ? 0.12 : 0.36;
    const pm = glow(BRAND.aqua, 0.25); portMats.push(pm);
    cyl(0.07, 0.07, 0.02, pm, { x: lx, y: 0.05, z: lz, seg: 12, parent: field, castShadow: false });
    portPos.push(new THREE.Vector3(lx, 0.07, lz).applyMatrix4(field.matrix));
  }
  // 3. Partner totems with lamps and tiles
  const lampMats = [];
  const tileNames = ['Pay', 'Cards', 'Ledger'];
  totemTops.forEach((tt, k) => {
    cyl(0.08, 0.08, 1.6, iron, { x: tt[0], y: 0, z: tt[2], parent: g, castShadow: false });
    const lm = glow(BRAND.aqua, 0.2); lampMats.push(lm);
    box(0.3, 0.3, 0.3, lm, { x: tt[0], y: 1.6, z: tt[2], parent: g, castShadow: false });
    const tt2 = tex(128, 90, (c2d, w, h) => {
      drawLabel(c2d, w, h, '#FFFFFF', BRAND.navy, tileNames[k]);
      c2d.fillStyle = BRAND.aqua; c2d.beginPath(); c2d.arc(w * 0.12, h * 0.2, w * 0.06, 0, TAU); c2d.fill();
    });
    if (tt2) decal(0.5, 0.35, tt2, { x: tt[0], y: 1.1, z: tt[2] + 0.09, parent: g });
    else plane(0.5, 0.35, white, { x: tt[0], y: 1.1, z: tt[2] + 0.09, parent: g });
  });
  // 2. Six cables and 4. six pulse beads
  const cableGroup = new THREE.Group(); g.add(cableGroup);
  const cableMats = [glow(BRAND.aqua, 0.4), glow(BRAND.salmon, 0.4)];
  const used = [0, 2, 4, 7, 9, 11];
  const curves = [], tubes = [], beads = [], beadPrev = new Float32Array(CABLES);
  const beadMat = glow('#FFFFFF', 1.0);
  function sideFor(x) { return x < 1.5 ? -0.1 : 3.1; }
  function makeTube(curve) { return new THREE.TubeGeometry(curve, 24, 0.035, 6, false); }
  for (let j = 0; j < CABLES; j++) {
    const p0 = portPos[used[j]].clone();
    const tt = totemTops[Math.floor(j / 2)];
    const curve = new THREE.CatmullRomCurve3([p0, new THREE.Vector3(sideFor(p0.x), 1.7, 1.9), new THREE.Vector3(tt[0], tt[1], tt[2])], false, 'catmullrom', 0.5);
    curves.push(curve);
    const tube = new THREE.Mesh(makeTube(curve), cableMats[j % 2]); tube.castShadow = false; tube.receiveShadow = false;
    cableGroup.add(tube); tubes.push(tube);
    beads.push(sphere(0.08, beadMat, { x: p0.x, y: p0.y, z: p0.z, parent: g, castShadow: false }));
  }
  // 5. Status tower with three chasing rings
  cyl(0.1, 0.1, 1.3, iron, { x: 3.6, y: 0, z: 3.2, parent: g, castShadow: false });
  const ringMats = [glow(BRAND.aqua, 0.1), glow('#FFFFFF', 0.1), glow(BRAND.salmon, 0.1)];
  ringMats.forEach((rm, k) => torus(0.12, 0.03, rm, { x: 3.6, y: 0.95 + 0.15 * k, z: 3.2, rx: Math.PI / 2, parent: g, castShadow: false }));
  // Replug spark
  const sparkMat = glow('#FFFFFF', 1.5);
  const spark = sphere(0.12, sparkMat, { parent: g, castShadow: false }); spark.visible = false;

  const lampFlash = new Float32Array(3), portFlash = new Float32Array(PORTS);
  let lastIdx = -1, bursts = 0, sparkAge = 99;
  const replug = { cable: -1, from: 0, to: 0, t: 0, done: true };
  function startReplug() {
    const k = bursts % CABLES;
    let cand = (k * 5 + bursts * 7) % PORTS;
    for (let n = 0; n < PORTS; n++) { if (used.indexOf(cand) < 0) break; cand = (cand + 1) % PORTS; }
    if (used.indexOf(cand) >= 0) return;
    replug.cable = k; replug.from = used[k]; replug.to = cand; replug.t = 0; replug.done = false;
    used[k] = -1;   // the old port is free while the plug is in the air
  }
  function stepReplug(dt) {
    if (replug.done) return;
    replug.t += dt;
    const e = easeInOut(clamp(replug.t / 0.5, 0, 1));
    const curve = curves[replug.cable], p0 = curve.points[0];
    p0.lerpVectors(portPos[replug.from], portPos[replug.to], e);
    curve.points[1].x = sideFor(p0.x);
    if (replug.t >= 0.5) {
      replug.done = true;
      used[replug.cable] = replug.to;
      curve.updateArcLengths();
      const tube = tubes[replug.cable];
      tube.geometry.dispose(); tube.geometry = makeTube(curve);
      portFlash[replug.to] = 1.0;
      spark.visible = true; spark.position.copy(portPos[replug.to]); spark.scale.setScalar(1); sparkAge = 0;
    }
  }
  function update(dt, time, phase, alien) {
    const on = !!(phase && phase.working);
    if (on) {
      const idx = Math.floor((phase.t - 0.7) / 3.2);
      if (idx !== lastIdx) {
        if (idx > lastIdx) { bursts++; if (replug.done) startReplug(); }
        lastIdx = idx;
      }
    } else {
      lastIdx = -1;
    }
    stepReplug(dt);
    // Beads: race port to totem over 1.1 s, staggered 0.18 s, swelling at the end; park at the ports when idle
    for (let j = 0; j < CABLES; j++) {
      const bead = beads[j], curve = curves[j];
      if (on) {
        const tt = (time - 0.18 * j) / 1.1;
        const u = tt - Math.floor(tt);
        if (u < beadPrev[j]) lampFlash[Math.floor(j / 2)] = 1.0;
        beadPrev[j] = u;
        curve.getPointAt(u, _p); bead.position.copy(_p);
        const sw = clamp((u - 0.75) / 0.25, 0, 1);
        bead.scale.setScalar(1 + 0.5 * sw);
      } else {
        beadPrev[j] = 0;
        bead.position.lerp(curve.points[0], Math.min(1, dt * 6));
        bead.scale.setScalar(1 + (bead.scale.x - 1) * Math.max(0, 1 - dt * 6));
      }
    }
    // Totem lamps flash on arrival and decay over 0.6 s
    for (let k = 0; k < 3; k++) {
      lampFlash[k] = Math.max(0, lampFlash[k] - dt / 0.6);
      lampMats[k].emissiveIntensity = Math.max(on ? 0.3 : 0.2, lampFlash[k]);
    }
    // Ports: plugged 0.6 while working, unplugged 0.3, idle 0.25; new port flashes 1.0
    for (let i = 0; i < PORTS; i++) {
      portFlash[i] = Math.max(0, portFlash[i] - dt / 0.6);
      const base = on ? (used.indexOf(i) >= 0 ? 0.6 : 0.3) : 0.25;
      portMats[i].emissiveIntensity = Math.max(base, 0.3 + 0.7 * portFlash[i]);
    }
    // Spark shrinks to nothing in 0.3 s
    if (spark.visible) {
      sparkAge += dt;
      const s = clamp(1 - sparkAge / 0.3, 0, 1);
      spark.scale.setScalar(Math.max(0.001, s));
      if (s <= 0) spark.visible = false;
    }
    // Status rings chase at 3 Hz; screen breathes 0.7 to 0.9; cables sway only when idle
    for (let k = 0; k < 3; k++) {
      ringMats[k].emissiveIntensity = on ? 0.2 + 0.8 * Math.max(0, Math.sin(TAU * 3 * time - k * TAU / 3)) : 0.1;
    }
    screenMat.emissiveIntensity = on ? 0.8 + 0.1 * Math.sin(TAU * 0.5 * time) : 0.4;
    const swayTarget = on ? 0 : 0.04 * Math.sin(TAU * 0.5 * time);
    cableGroup.rotation.z += (swayTarget - cableGroup.rotation.z) * Math.min(1, dt * 4);
  }
  return { group: g, anchor: new THREE.Vector3(1.5, 0, 2.45), yaw: 0, pose: 'type', enter: 'walk', label: activityLabel, update };
}
