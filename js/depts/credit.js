/* Credit department: a classic bank with a rusticated hall, a gold parapet, a standing coin and a
   windowless vault block, plus a demonstration strongroom station whose round door swings open
   toward the camera after the alien spins the console wheel.
   Follows docs/CONTRACT_V2.md (department modules) and docs/CITY_DESIGN.md (credit). */
import * as THREE from 'three';
import { BRAND, mat, glass, glow, box, cyl, sphere, torus, plane, windowRow, canvasTex, decal, pointLight, lerp, clamp, easeInOut, rng } from './common.js';

export const id = 'credit';
export const activityLabel = 'Spinning the vault wheel';

const TAU = Math.PI * 2;
const GOLD = '#F6D463', IRON = '#2E3E50', PLINTH = '#CFC6B6', INK = '#0E1B2E', BULB = '#FFF1C9', SPLIT = '#0E2238';
const hasDoc = () => typeof document !== 'undefined';
const ramp = night => clamp((night - 0.25) / 0.75, 0, 1);
/* A work burst is the frame where phase.t % 3.2 crosses 0.7 (the same window the typing pose uses). */
const burstIndex = t => (t < 0.7 ? -1 : Math.floor((t - 0.7) / 3.2));

function palette(dept) {
  return {
    wall: mat(dept.wall, { roughness: 0.9 }),
    roof: mat(dept.accent, { roughness: 0.78 }),
    door: mat(dept.accent, { roughness: 0.6 }),
    trim: mat(BRAND.white, { roughness: 0.8 }),
    plinth: mat(PLINTH, { roughness: 0.9 }),
    iron: mat(IRON, { roughness: 0.55, metalness: 0.2 }),
    brass: mat(GOLD, { roughness: 0.3 }),
    handle: mat(GOLD, { roughness: 0.3, metalness: 0.6 }),
    ink: mat(INK, { roughness: 0.9 }),
    navy: mat(BRAND.navy, { roughness: 0.8 }),
    salmon: mat(BRAND.salmon, { roughness: 0.8 }),
    split: mat(SPLIT, { roughness: 0.8 }),
  };
}

function drawCoinFace(c, w, h) {
  c.fillStyle = BRAND.navy; c.fillRect(0, 0, w, h);
  c.fillStyle = GOLD; c.font = 'bold ' + Math.floor(h * 0.72) + 'px Kanit, Inter, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('T', w / 2, h / 2 + h * 0.04);
}
function drawSign(c, w, h) {
  c.fillStyle = BRAND.navy; c.fillRect(0, 0, w, h);
  c.fillStyle = GOLD; c.font = '600 ' + Math.floor(h * 0.62) + 'px Kanit, Inter, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Credit', w / 2, h / 2 + h * 0.04);
}
function drawDial(c, w, h) {
  c.fillStyle = IRON; c.fillRect(0, 0, w, h);
  c.fillStyle = BRAND.white; c.beginPath(); c.arc(w / 2, h / 2, w * 0.42, 0, TAU); c.fill();
  c.strokeStyle = IRON; c.lineWidth = w * 0.03;
  for (let i = 0; i < 24; i++) {
    const a = i * TAU / 24, r0 = w * (i % 6 === 0 ? 0.3 : 0.36), r1 = w * 0.4;
    c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0); c.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1); c.stroke();
  }
  c.fillStyle = BRAND.salmon; c.beginPath(); c.moveTo(w / 2, h * 0.14); c.lineTo(w * 0.46, h * 0.26); c.lineTo(w * 0.54, h * 0.26); c.fill();
}

/* A spoked wheel lying in the xy plane (axis along z), centered on the returned group. */
function spokeWheel(r, tube, diameters, ringMat, spokeMat, hubMat, parent) {
  const w = new THREE.Group();
  torus(r, tube, ringMat, { parent: w });
  for (let i = 0; i < diameters; i++) cyl(tube * 0.6, tube * 0.6, r * 2, spokeMat, { y: -r, rz: Math.PI * i / diameters, parent: w, castShadow: false, seg: 8 });
  if (hubMat) sphere(0.1, hubMat, { parent: w });
  parent.add(w);
  return w;
}

/* ---------------------------------------------------------------- building ---------- */
export function buildBuilding(ctx) {
  const { dept } = ctx;
  const M = palette(dept);
  const g = new THREE.Group();
  const glassMat = glass();
  const lights = [];

  // 1. Plinth and two broad steps.
  box(10, 0.14, 6, M.plinth, { x: 5, z: 3, parent: g });
  box(4, 0.14, 0.4, M.plinth, { x: 5, y: 0, z: 6.2, parent: g });
  box(4, 0.14, 0.4, M.plinth, { x: 5, y: 0.14, z: 5.95, parent: g });

  // 2. Banking hall (x 0.2..7.0, z 0.2..5.8) with a rusticated base band.
  box(6.8, 3.6, 5.6, M.wall, { x: 3.6, y: 0.14, z: 3, radius: 0.1, parent: g });
  box(6.9, 1.0, 5.7, M.plinth, { x: 3.6, y: 0.14, z: 3, parent: g });

  // 3. Three engaged pilasters with gold capitals; the door bay sits between x 2.6 and 6.4.
  for (const px of [0.7, 2.6, 6.4]) {
    box(0.5, 3.6, 0.25, M.trim, { x: px, y: 0.14, z: 5.8, parent: g });
    box(0.6, 0.15, 0.3, M.roof, { x: px, y: 3.59, z: 5.8, parent: g, castShadow: false });
  }

  // 4. Parapet with dentils, flat roof and the stepped gold slab.
  box(7.2, 0.5, 6.0, M.roof, { x: 3.6, y: 3.74, z: 3, parent: g });
  for (let i = 0; i < 8; i++) box(0.3, 0.2, 0.3, M.trim, { x: 0.55 + i * 0.87, y: 3.9, z: 6.05, parent: g, castShadow: false });
  box(6.6, 0.15, 5.4, M.plinth, { x: 3.6, y: 4.24, z: 3, parent: g });
  box(3.6, 0.4, 3.0, M.roof, { x: 3.6, y: 4.39, z: 3, parent: g });

  // 5. Standing coin (center y 5.6, top 6.4) spinning about y, with a glowing rim.
  const coin = new THREE.Group(); coin.position.set(3.6, 5.6, 3.0); g.add(coin);
  cyl(0.8, 0.8, 0.15, M.roof, { y: -0.075, rx: Math.PI / 2, parent: coin });
  const rimMat = glow(GOLD, 0.2);
  torus(0.8, 0.05, rimMat, { parent: coin, castShadow: false });
  if (hasDoc()) {
    const tex = canvasTex(256, 256, drawCoinFace);
    decal(1.1, 1.1, tex, { z: 0.08, parent: coin });
    decal(1.1, 1.1, tex, { z: -0.08, ry: Math.PI, parent: coin });
  }
  box(0.6, 0.1, 0.4, M.iron, { x: 3.6, y: 4.79, z: 3.0, parent: g, castShadow: false });

  // 6. Vault block (x 7.0..9.8, z 0.6..5.4) with gold corner bands and cap.
  box(2.8, 4.0, 4.8, M.wall, { x: 8.4, y: 0.14, z: 3.0, parent: g });
  for (const [cx, cz] of [[7.0, 0.6], [9.8, 0.6], [7.0, 5.4], [9.8, 5.4]]) box(0.15, 4.0, 0.15, M.roof, { x: cx, y: 0.14, z: cz, parent: g, castShadow: false });
  box(3.0, 0.2, 5.0, M.roof, { x: 8.4, y: 4.14, z: 3.0, parent: g });

  // 7. Round vault door on the vault block's south face. The lit recess is a glowing disc proud
  //    of the wall with a 3-2-1 stack of gold bars in front of it, seen through the ring when the
  //    door is ajar. The ring is a torus (so it has a hole) rather than a solid drum.
  const recessMat = glow(GOLD, 0.6);
  cyl(0.9, 0.9, 0.04, recessMat, { x: 8.4, y: 1.78, z: 5.42, rx: Math.PI / 2, parent: g, castShadow: false });
  const barRows = [[-0.45, 0, 0.45], [-0.225, 0.225], [0]];
  barRows.forEach((row, ri) => row.forEach(dx => box(0.4, 0.15, 0.2, M.brass, { x: 8.4 + dx, y: 1.25 + ri * 0.15, z: 5.54, parent: g, castShadow: false })));
  torus(1.0, 0.14, M.iron, { x: 8.4, y: 1.8, z: 5.55, parent: g });
  const vaultPivot = new THREE.Group(); vaultPivot.position.set(7.4, 1.8, 5.6); g.add(vaultPivot);
  cyl(1.0, 1.0, 0.25, M.door, { x: 1.0, y: -0.125, z: 0.225, rx: Math.PI / 2, parent: vaultPivot });
  const vaultWheel = spokeWheel(0.42, 0.05, 3, M.trim, M.trim, M.handle, vaultPivot);
  vaultWheel.position.set(1.0, 0, 0.38);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    sphere(0.07, M.trim, { x: 1.0 + Math.cos(a) * 0.86, y: Math.sin(a) * 0.86, z: 0.36, parent: vaultPivot, castShadow: false });
  }

  // 8. Entrance: tall bronze double door, split line, brass handles, fanlight, sign band.
  box(1.6, 2.4, 0.08, M.door, { x: 5, y: 0.14, z: 5.84, parent: g });
  box(0.03, 2.4, 0.09, M.split, { x: 5, y: 0.14, z: 5.84, parent: g, castShadow: false });
  sphere(0.05, M.handle, { x: 4.88, y: 1.3, z: 5.9, parent: g, castShadow: false });
  sphere(0.05, M.handle, { x: 5.12, y: 1.3, z: 5.9, parent: g, castShadow: false });
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24, 0, Math.PI), glassMat);
  fan.position.set(5, 2.54, 5.86); fan.receiveShadow = true; g.add(fan);
  const fanFrame = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 8, 24, Math.PI), M.trim);
  fanFrame.position.set(5, 2.54, 5.88); g.add(fanFrame);
  box(2.2, 0.35, 0.06, M.navy, { x: 5, y: 3.32, z: 5.84, parent: g, castShadow: false });
  if (hasDoc()) decal(2.1, 0.3, canvasTex(512, 96, drawSign), { x: 5, y: 3.495, z: 5.875, parent: g, emissive: 0.15 });

  // 9. Windows (one glass material): two barred windows on the south face, three on the west face
  //    and three on the north face. The east face is covered by the vault block, so it has none.
  for (const wx of [1.7, 3.4]) {
    windowRow(1, 0.9, 1.6, 0, glassMat, { x0: wx, y: 1.2, z: 5.84, parent: g });
    for (const bx of [-0.225, 0, 0.225]) box(0.04, 1.6, 0.04, M.iron, { x: wx + bx, y: 1.2, z: 5.93, parent: g, castShadow: false });
  }
  const west = windowRow(3, 0.9, 1.6, 1.6, glassMat, { x0: 1.4, y: 1.2, parent: g });
  west.rotation.y = -Math.PI / 2; west.position.set(0.2, 0, 0);
  const north = windowRow(3, 0.9, 1.6, 2.1, glassMat, { x0: 1.5, y: 1.2, parent: g });
  north.rotation.y = Math.PI; north.position.set(7.2, 0, 0.2);
  // Lanterns on the door-bay pilasters, night deposit box (kept below the barred window), roof vent.
  const lanternMat = glow(BULB, 0.08);
  for (const lx of [2.6, 6.4]) {
    box(0.2, 0.3, 0.2, M.iron, { x: lx, y: 2.4, z: 5.98, parent: g, castShadow: false });
    sphere(0.07, lanternMat, { x: lx, y: 2.32, z: 5.98, parent: g, castShadow: false });
  }
  box(0.5, 0.6, 0.2, M.iron, { x: 1.3, y: 0.45, z: 5.88, parent: g, castShadow: false });
  cyl(0.5, 0.5, 0.4, M.iron, { x: 1.6, y: 4.39, z: 1.2, parent: g });

  // Night light: gold spill from the ajar vault door onto the plinth.
  // CONTRACT: the intensity here is the base; the renderer scales it with night.
  lights.push(pointLight(GOLD, 5, 4, { x: 8.4, y: 1.6, z: 5.9, parent: g }));

  let ajar = 0;
  function update(dt, time, night, active) {
    const r = ramp(night || 0);
    coin.rotation.y += 0.4 * dt;
    rimMat.emissiveIntensity = 0.2 + 1.2 * r;
    lanternMat.emissiveIntensity = 0.08 + 0.8 * r;
    recessMat.emissiveIntensity = 0.4 + 0.8 * r;
    const target = 0.3 * r + (active ? 0.2 : 0);
    ajar += (target - ajar) * (1 - Math.exp(-dt * 2));
    vaultPivot.rotation.y = -ajar;
    vaultWheel.rotation.z = ajar * 3;
  }
  return { group: g, glass: [glassMat], lights, update };
}

/* ---------------------------------------------------------------- activity ---------- */
const COINS = 12;

export function buildActivity(ctx) {
  const { dept } = ctx;
  const M = palette(dept);
  const g = new THREE.Group();
  const rand = rng('credit-vault');

  // 1. Strongroom (x 0.4..3.4, z 0.2..1.6, 2.6 tall) built from slabs so the front has a round opening.
  box(3.0, 2.6, 0.2, M.wall, { x: 1.9, y: 0, z: 0.3, parent: g });
  box(0.2, 2.6, 1.0, M.wall, { x: 0.5, y: 0, z: 0.9, parent: g });
  box(0.2, 2.6, 1.0, M.wall, { x: 3.3, y: 0, z: 0.9, parent: g });
  box(0.6, 2.6, 0.2, M.wall, { x: 0.7, y: 0, z: 1.5, parent: g });
  box(0.6, 2.6, 0.2, M.wall, { x: 3.1, y: 0, z: 1.5, parent: g });
  box(1.8, 0.4, 0.2, M.wall, { x: 1.9, y: 2.2, z: 1.5, parent: g });
  box(1.8, 0.4, 0.2, M.wall, { x: 1.9, y: 0, z: 1.5, parent: g });
  for (const [cx, cz] of [[0.4, 0.2], [3.4, 0.2], [0.4, 1.6], [3.4, 1.6]]) box(0.15, 2.6, 0.15, M.roof, { x: cx, y: 0, z: cz, parent: g, castShadow: false });
  box(3.2, 0.2, 1.6, M.roof, { x: 1.9, y: 2.6, z: 0.9, parent: g });
  // Door frame: a flat ring plate covering the square opening's corners (x 1.0..2.8, y 0.4..2.2)
  // plus a torus bevel.
  const ringPlate = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.3, 40), M.iron);
  ringPlate.position.set(1.9, 1.3, 1.61); g.add(ringPlate);
  torus(1.0, 0.14, M.iron, { x: 1.9, y: 1.3, z: 1.66, parent: g });

  // 3. Interior: ink back and floor, a shelf, nine glowing gold bars and three coin stacks.
  plane(2.6, 2.6, M.ink, { x: 1.9, y: 1.3, z: 0.41, parent: g });
  plane(2.6, 1.0, M.ink, { x: 1.9, y: 0.01, z: 0.9, rx: -Math.PI / 2, parent: g });
  box(1.6, 0.1, 0.8, M.iron, { x: 1.9, y: 0.6, z: 0.9, parent: g });
  const barMat = glow(GOLD, 0.2);
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 3; i++) {
    box(0.4, 0.15, 0.2, barMat, { x: 1.9 + (i - 1) * 0.45 + (layer % 2) * 0.1, y: 0.7 + layer * 0.15, z: 0.72, parent: g, castShadow: false });
  }
  for (const sx of [1.35, 1.9, 2.45]) cyl(0.15, 0.15, 0.3, M.door, { x: sx, y: 0.7, z: 1.12, parent: g, castShadow: false, seg: 16 });

  // 2. Vault door hinged on its WEST edge. Pivot at (0.85, 1.3, 1.65); rotation.y runs 0 (closed)
  //    to -1.6 (open), which swings the disc toward +z so the open door stands along z at x 0.85
  //    and the opening faces the camera.
  // CONTRACT: the design brief wrote +1.6; a positive yaw would swing the door north into the
  //    strongroom, so the sign is negative here, matching the building's own vault door.
  const pivot = new THREE.Group(); pivot.position.set(0.85, 1.3, 1.65); g.add(pivot);
  cyl(1.0, 1.0, 0.25, M.door, { x: 1.05, y: -0.125, z: 0.3, rx: Math.PI / 2, parent: pivot });
  const doorWheel = spokeWheel(0.42, 0.05, 2, M.iron, M.iron, M.handle, pivot);
  doorWheel.position.set(1.05, 0, 0.47);
  const bolts = [];
  for (let i = 0; i < 8; i++) bolts.push(sphere(0.07, M.brass, { parent: pivot, castShadow: false }));
  if (hasDoc()) decal(0.5, 0.5, canvasTex(128, 128, drawDial), { x: 1.05 + 0.55, y: 0.35, z: 0.43, parent: pivot });
  const flashMat = glow('#FFFFFF', 1.0);
  const flash = sphere(0.15, flashMat, { x: 1.05, y: 0, z: 0.5, parent: pivot, castShadow: false });
  flash.scale.setScalar(0.001);

  // 4. Console wheel the alien spins (post at (2.5, 0, 2.4), wheel center y 1.0, axis along z).
  cyl(0.08, 0.08, 0.9, M.iron, { x: 2.5, y: 0, z: 2.4, parent: g, seg: 12 });
  const consoleWheel = spokeWheel(0.45, 0.06, 3, M.door, M.door, M.handle, g);
  consoleWheel.position.set(2.5, 1.0, 2.4);

  // 5. Coin shower pool.
  const coins = [], coinDx = [], coinDz = [], coinOut = [], coinSpin = [];
  for (let i = 0; i < COINS; i++) {
    const c = cyl(0.08, 0.08, 0.03, M.brass, { parent: g, castShadow: false, seg: 12 });
    c.visible = false; coins.push(c);
    const a = (rand() - 0.5) * 1.4;
    coinDx.push(Math.sin(a)); coinDz.push(Math.cos(a)); coinOut.push(0.4 + rand() * 0.5); coinSpin.push(4 + rand() * 6);
  }

  // 6. Floor with a gold border, 7. brass stanchions with a sagging salmon rope on the path side.
  plane(3.6, 2.2, M.plinth, { x: 1.9, y: 0.01, z: 2.4, rx: -Math.PI / 2, parent: g, receiveShadow: true });
  box(3.6, 0.02, 0.06, M.brass, { x: 1.9, y: 0.01, z: 1.33, parent: g, castShadow: false });
  box(3.6, 0.02, 0.06, M.brass, { x: 1.9, y: 0.01, z: 3.47, parent: g, castShadow: false });
  box(0.06, 0.02, 2.2, M.brass, { x: 0.13, y: 0.01, z: 2.4, parent: g, castShadow: false });
  box(0.06, 0.02, 2.2, M.brass, { x: 3.67, y: 0.01, z: 2.4, parent: g, castShadow: false });
  for (const sz of [1.4, 3.0]) {
    cyl(0.12, 0.12, 0.04, M.brass, { x: 3.6, y: 0, z: sz, parent: g, castShadow: false, seg: 12 });
    cyl(0.03, 0.03, 0.9, M.brass, { x: 3.6, y: 0.04, z: sz, parent: g, castShadow: false, seg: 8 });
    sphere(0.06, M.brass, { x: 3.6, y: 0.97, z: sz, parent: g, castShadow: false });
  }
  const ropeCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(3.6, 0.88, 1.4), new THREE.Vector3(3.6, 0.5, 2.2), new THREE.Vector3(3.6, 0.88, 3.0));
  const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 12, 0.03, 6, false), M.salmon);
  rope.castShadow = true; g.add(rope);

  // State: a 6.4 s cycle in two beats. Beat A opens the vault, beat B shuts it.
  const st = { lastBurst: -1, beat: 'none', bt: 0, nextA: true, door: 0, doorStart: 0, bars: 0.2, barsStart: 0.2, consoleA: 0, consoleBase: 0 };
  const boltOut = new Float32Array(8);

  function startBeat(name) {
    st.beat = name; st.bt = 0;
    st.doorStart = st.door; st.barsStart = st.bars; st.consoleBase = st.consoleA;
  }

  function update(dt, time, phase, alien, active) {
    if (active) {
      const bi = burstIndex(phase ? phase.t : 0);
      if (bi !== st.lastBurst) {
        st.lastBurst = bi;
        if (bi >= 0) { startBeat(st.nextA ? 'A' : 'B'); st.nextA = !st.nextA; }
      }
    } else {
      st.lastBurst = -1; st.nextA = true;
      // Nobody at the station: close up if the door was left open, then idle.
      if (st.beat === 'A' && st.bt > 2.4) startBeat('B');
      if (st.beat === 'none' && st.door > 0.01) startBeat('B');
    }
    st.bt += dt;
    const bt = st.bt;
    let flashS = 0;
    if (st.beat === 'A') {
      const s = easeInOut(clamp(bt / 2.0, 0, 1));
      st.consoleA = st.consoleBase + 4 * TAU * s;
      st.door = lerp(st.doorStart, 1.6, easeInOut(clamp((bt - 0.6) / 1.4, 0, 1)));
      for (let i = 0; i < 8; i++) boltOut[i] = 0.1 * clamp((bt - 0.1 * i) / 0.1, 0, 1);
      st.bars = lerp(st.barsStart, 1.2, clamp(bt / 2.0, 0, 1));
      for (let i = 0; i < COINS; i++) {
        const p = (bt - (1.5 + 0.05 * i)) / 0.7;
        const c = coins[i];
        if (p < 0 || p > 1) { c.visible = false; continue; }
        c.visible = true;
        const d = coinOut[i] * p;
        c.position.set(1.9 + coinDx[i] * d, 0.8 + 0.5 * Math.sin(Math.PI * p) - 0.75 * p, 1.75 + coinDz[i] * d);
        c.rotation.x = coinSpin[i] * p; c.rotation.z = coinSpin[i] * 0.6 * p;
        c.scale.setScalar(p > 0.75 ? Math.max(0.001, (1 - p) / 0.25) : 1);
      }
    } else if (st.beat === 'B') {
      const s = easeInOut(clamp(bt / 1.2, 0, 1));
      st.door = st.doorStart * (1 - s);
      st.consoleA = st.consoleBase - 2 * TAU * s;
      for (let i = 0; i < 8; i++) boltOut[i] = 0.1 * (1 - clamp((bt - 1.2 - 0.1 * i) / 0.1, 0, 1));
      const f = clamp((bt - 1.2) / 0.3, 0, 1);
      flashS = Math.sin(Math.PI * f);
      st.bars = lerp(st.barsStart, active ? 0.3 : 0.2, clamp(bt / 1.2, 0, 1));
      for (let i = 0; i < COINS; i++) coins[i].visible = false;
      if (bt > 2.4 && !active) st.beat = 'none';
    } else {
      st.door += (0 - st.door) * (1 - Math.exp(-dt * 3));
      st.bars += (0.2 - st.bars) * (1 - Math.exp(-dt * 2));
      for (let i = 0; i < 8; i++) boltOut[i] = 0;
      for (let i = 0; i < COINS; i++) coins[i].visible = false;
    }
    pivot.rotation.y = -st.door;
    consoleWheel.rotation.z = st.consoleA;
    doorWheel.rotation.z = st.consoleA * 0.5;
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, rr = 0.9 + boltOut[i];
      bolts[i].position.set(1.05 + Math.cos(a) * rr, Math.sin(a) * rr, 0.3);
    }
    flash.scale.setScalar(Math.max(0.001, flashS));
    barMat.emissiveIntensity = st.bars;
    // The alien keeps the lever pose from animateAlien; nothing on the handle needs driving here.
  }

  return {
    group: g,
    anchor: new THREE.Vector3(2.5, 0, 3.0),
    yaw: Math.PI,
    pose: 'lever',
    enter: 'walk',
    label: activityLabel,
    update,
  };
}
