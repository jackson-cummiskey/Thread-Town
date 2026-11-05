/* Accounting department (id finance): the one slender tower, a podium under a four-pier shaft wrapped by a
   scrolling navy ticker band and crowned by a pyramid cap and a spinning coin, plus a
   screen-based ticker desk station where coins pop up a chute into a giant piggy bank.
   Follows docs/CONTRACT_V2.md (department modules) and docs/CITY_DESIGN.md (finance). */
import * as THREE from 'three';
import { BRAND, mat, glass, glow, box, cyl, cone, sphere, torus, plane, windowRow, canvasTex, decal, pointLight, lerp, clamp, easeInOut, rng } from './common.js';

export const id = 'finance';
export const activityLabel = 'Watching the ticker';

const TAU = Math.PI * 2;
const GOLD = '#F6D463', IRON = '#2E3E50', PLINTH = '#CFC6B6', INK = '#0E1B2E', DESK = '#E8DCC0', GREEN = '#1F8A5B', CHUTE = '#AFD6E4';
const hasDoc = () => typeof document !== 'undefined';
const ramp = night => clamp((night - 0.25) / 0.75, 0, 1);
/* A work burst is the frame where phase.t % 3.2 crosses 0.7 (the same window the typing pose uses). */
const burstIndex = t => (t < 0.7 ? -1 : Math.floor((t - 0.7) / 3.2));

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function palette(dept) {
  return {
    wall: mat(dept.wall, { roughness: 0.9 }),
    roof: mat(dept.accent, { roughness: 0.78 }),
    door: mat(dept.accent, { roughness: 0.6 }),
    trim: mat(BRAND.white, { roughness: 0.8 }),
    plinth: mat(PLINTH, { roughness: 0.9 }),
    iron: mat(IRON, { roughness: 0.55, metalness: 0.2 }),
    brass: mat(GOLD, { roughness: 0.3 }),
    ink: mat(INK, { roughness: 0.9 }),
    navy: mat(BRAND.navy, { roughness: 0.8 }),
    desk: mat(DESK, { roughness: 0.8 }),
    white: mat('#FFFFFF', { roughness: 0.6 }),
  };
}

/* Textured emissive surface (ticker band, screens): color map and emissive map share one texture. */
function screenMaterial(tex, intensity) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#FFFFFF'), map: tex, roughness: 0.6, emissive: new THREE.Color('#FFFFFF'), emissiveMap: tex, emissiveIntensity: intensity });
  m.userData.envMapIntensity = 0.25;
  return m;
}
function drawTicker(c, w, h) {
  c.fillStyle = BRAND.navy; c.fillRect(0, 0, w, h);
  c.font = '600 ' + Math.floor(h * 0.56) + 'px Kanit, Inter, sans-serif'; c.textBaseline = 'middle';
  const parts = [['THRD 42.10', BRAND.aqua], ['up 1.2', '#FFFFFF'], ['DDA 1.8B', BRAND.aqua], ['COD 640M', '#FFFFFF'], ['NIM 3.9', BRAND.aqua]];
  let x = h * 0.4;
  for (const [t, col] of parts) { c.fillStyle = col; c.fillText(t, x, h / 2); x += c.measureText(t).width + h * 0.7; }
}
function drawCoinFace(c, w, h) {
  c.fillStyle = BRAND.navy; c.fillRect(0, 0, w, h);
  c.fillStyle = GOLD; c.font = 'bold ' + Math.floor(h * 0.72) + 'px Kanit, Inter, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('T', w / 2, h / 2 + h * 0.04);
}
function drawCandles(c, w, h) {
  c.fillStyle = INK; c.fillRect(0, 0, w, h);
  const r = rng('finance-candles');
  let y = h * 0.6;
  const n = 24, cw = w / n;
  for (let i = 0; i < n; i++) {
    const open = y, close = clamp(y + (r() - 0.45) * h * 0.18, h * 0.1, h * 0.9);
    const up = close < open;
    c.fillStyle = up ? GREEN : BRAND.salmon;
    const top = Math.min(open, close), bot = Math.max(open, close);
    c.fillRect(i * cw + cw * 0.25, top, cw * 0.5, Math.max(2, bot - top));
    c.fillRect(i * cw + cw * 0.47, top - h * 0.04, cw * 0.06, bot - top + h * 0.08);
    y = close;
  }
  c.strokeStyle = BRAND.aqua; c.lineWidth = 2; c.beginPath(); c.moveTo(0, h * 0.5);
  for (let i = 0; i <= n; i++) c.lineTo(i * cw, h * 0.5 - Math.sin(i * 0.5) * h * 0.08 - i * h * 0.006);
  c.stroke();
}
function drawDigits(c, w, h) {
  c.fillStyle = BRAND.navy; c.fillRect(0, 0, w, h);
  const r = rng('finance-digits');
  c.fillStyle = '#FFFFFF'; c.font = '600 ' + Math.floor(w * 0.34) + 'px Kanit, Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const rows = 16;
  for (let i = 0; i < rows; i++) {
    c.fillStyle = i % 4 === 0 ? BRAND.aqua : '#FFFFFF';
    c.fillText(String(Math.floor(r() * 900 + 100)) + '.' + String(Math.floor(r() * 10)), w / 2, (i + 0.5) * h / rows);
  }
}
function drawBalance(c, w, h, value) {
  c.fillStyle = BRAND.navy; c.fillRect(0, 0, w, h);
  c.fillStyle = GOLD; c.font = 'bold ' + Math.floor(h * 0.62) + 'px Kanit, Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(value), w / 2, h / 2 + h * 0.04);
}
function drawChart(c, w, h, r) {
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#D5DCE2'; c.lineWidth = 1;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
  c.strokeStyle = GREEN; c.lineWidth = Math.max(3, h * 0.04); c.lineJoin = 'round'; c.beginPath();
  let y = h * 0.8;
  for (let i = 0; i <= 8; i++) { const x = i * w / 8; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); y = clamp(y - h * 0.08 + (r() - 0.5) * h * 0.12, h * 0.1, h * 0.9); }
  c.stroke();
}

/* ---------------------------------------------------------------- building ---------- */
export function buildBuilding(ctx) {
  const { dept } = ctx;
  const M = palette(dept);
  const g = new THREE.Group();
  const glassMat = glass();
  const lights = [];

  // 1. Plinth and entry step.
  box(8, 0.14, 6, M.plinth, { x: 4, z: 3, parent: g });
  box(3.2, 0.14, 0.5, M.plinth, { x: 4, y: 0, z: 6.25, parent: g });

  // 2. Podium (x 0.3..7.7, z 0.3..5.7) with a glass shopfront, white lip and teal roof slab.
  box(7.4, 2.0, 5.4, M.wall, { x: 4, y: 0.14, z: 3.0, radius: 0.06, parent: g });
  // Shopfront glass either side of the door (x 1.5..3.1 and 4.9..6.5) so the door frame stays visible.
  plane(1.6, 1.2, glassMat, { x: 2.3, y: 1.2, z: 5.72, parent: g, receiveShadow: true });
  plane(1.6, 1.2, glassMat, { x: 5.7, y: 1.2, z: 5.72, parent: g, receiveShadow: true });
  box(5.2, 0.08, 0.06, M.trim, { x: 4, y: 1.8, z: 5.72, parent: g, castShadow: false });
  box(5.2, 0.08, 0.06, M.trim, { x: 4, y: 0.52, z: 5.72, parent: g, castShadow: false });
  box(7.6, 0.12, 5.6, M.trim, { x: 4, y: 2.14, z: 3.0, parent: g });
  box(7.4, 0.2, 5.4, M.roof, { x: 4, y: 2.26, z: 3.0, parent: g });

  // 3. Tower shaft (x 1.8..6.2, z 0.6..4.6, top 7.74) with four white corner piers.
  box(4.4, 5.6, 4.0, M.wall, { x: 4, y: 2.14, z: 2.6, parent: g });
  for (const [px, pz] of [[1.8, 0.6], [6.2, 0.6], [1.8, 4.6], [6.2, 4.6]]) box(0.3, 5.6, 0.3, M.trim, { x: px, y: 2.14, z: pz, parent: g });

  // 4. Ticker band wrapping the shaft at y 4.3..4.9: navy with scrolling aqua and white text.
  let tickerTex = null;
  let tickerMat;
  if (hasDoc()) {
    tickerTex = canvasTex(1024, 128, drawTicker);
    tickerTex.wrapS = THREE.RepeatWrapping;
    tickerMat = screenMaterial(tickerTex, 0.8);
  } else {
    tickerMat = glow(BRAND.navy, 0.8);
  }
  box(4.8, 0.6, 4.4, [tickerMat, tickerMat, M.navy, M.navy, tickerMat, tickerMat], { x: 4, y: 4.3, z: 2.6, parent: g });

  // 5. Crown: stepped cornice and a four-sided pyramid cap (tip 8.9).
  box(4.8, 0.3, 4.4, M.trim, { x: 4, y: 7.74, z: 2.6, parent: g });
  box(4.2, 0.3, 3.8, M.trim, { x: 4, y: 8.04, z: 2.6, parent: g });
  cone(2.6, 0.56, M.roof, { x: 4, y: 8.34, z: 2.6, seg: 4, ry: Math.PI / 4, parent: g });

  // 6. Rooftop coin on the crown's south ledge, spinning about y.
  const coin = new THREE.Group(); coin.position.set(4, 8.3, 3.9); g.add(coin);
  const coinMat = glow(GOLD, 0);
  cyl(0.6, 0.6, 0.1, coinMat, { y: -0.05, rx: Math.PI / 2, parent: coin });
  if (hasDoc()) {
    const tex = canvasTex(128, 128, drawCoinFace);
    decal(0.82, 0.82, tex, { z: 0.052, parent: coin });
    decal(0.82, 0.82, tex, { z: -0.052, ry: Math.PI, parent: coin });
  }

  // 7. Windows (one glass material): five floors on the south and north faces, three per side
  //    face per floor. Rows are spaced so none overlaps the ticker band.
  // CONTRACT: the brief's rows at y 3.9 and 4.9 collide with the band at 4.3..4.9; rows sit at
  //    y 2.5, 3.4, 5.1, 6.0 and 6.9 instead so the band keeps a clear line around the shaft.
  const floors = [2.5, 3.4, 5.1, 6.0, 6.9];
  for (const fy of floors) {
    windowRow(3, 0.5, 0.7, 0.75, glassMat, { x0: 3.25, y: fy, z: 4.62, parent: g });
    const n = windowRow(3, 0.5, 0.7, 0.75, glassMat, { x0: -4.75, y: fy, parent: g });
    n.rotation.y = Math.PI; n.position.set(0, 0, 0.58);
    const e = windowRow(3, 0.5, 0.7, 0.75, glassMat, { x0: -3.35, y: fy, parent: g });
    e.rotation.y = Math.PI / 2; e.position.set(6.22, 0, 0);
    const w = windowRow(3, 0.5, 0.7, 0.75, glassMat, { x0: 1.85, y: fy, parent: g });
    w.rotation.y = -Math.PI / 2; w.position.set(1.78, 0, 0);
  }

  // 8. Door: glass double door in a teal frame under a teal canopy.
  box(1.8, 2.05, 0.08, M.door, { x: 4, y: 0.14, z: 5.69, parent: g });
  box(1.6, 1.9, 0.06, glassMat, { x: 4, y: 0.21, z: 5.73, parent: g, castShadow: false });
  box(0.03, 1.9, 0.07, M.iron, { x: 4, y: 0.21, z: 5.73, parent: g, castShadow: false });
  box(2.4, 0.06, 0.9, M.door, { x: 4, y: 2.0, z: 6.15, parent: g });

  // 9. Piggy bank statue beside the entrance, tucked against the podium's south face so it stays
  //    inside the footprint margin, and two vent stacks on the podium roof.
  const statue = new THREE.Group(); statue.position.set(1.1, 0.14, 5.95); g.add(statue);
  box(1.0, 0.6, 0.7, M.plinth, { parent: statue });
  const sPig = sphere(0.5, M.door, { y: 1.15, parent: statue }); sPig.scale.set(1.2, 1, 1);
  cyl(0.18, 0.18, 0.15, M.door, { y: 1.075, z: 0.52, rx: Math.PI / 2, parent: statue, castShadow: false, seg: 16 });
  for (const ex of [-0.2, 0.2]) cone(0.12, 0.15, M.door, { x: ex, y: 1.55, z: -0.1, parent: statue, castShadow: false, seg: 12 });
  for (const [lx, lz] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]]) cyl(0.08, 0.08, 0.2, M.door, { x: lx, y: 0.6, z: lz, parent: statue, castShadow: false, seg: 10 });
  box(0.3, 0.05, 0.05, M.iron, { y: 1.63, parent: statue, castShadow: false });
  cyl(0.2, 0.2, 0.5, M.iron, { x: 0.8, y: 2.46, z: 1.0, parent: g, seg: 12 });
  cyl(0.2, 0.2, 0.5, M.iron, { x: 7.2, y: 2.46, z: 1.0, parent: g, seg: 12 });

  // Night lights: aqua at the crown, warm at the shopfront.
  // CONTRACT: intensities are the day base; the renderer scales them with night.
  lights.push(pointLight(BRAND.aqua, 4, 5, { x: 4, y: 8.0, z: 2.6, parent: g }));
  lights.push(pointLight('#FFE2A0', 4, 4, { x: 4, y: 1.4, z: 5.9, parent: g }));

  function update(dt, time, night, active) {
    const r = ramp(night || 0);
    if (tickerTex) tickerTex.offset.x += 0.08 * dt;
    tickerMat.emissiveIntensity = 0.8 + 0.8 * r;
    coin.rotation.y += 0.6 * dt;
    coinMat.emissiveIntensity = 1.0 * r;
  }
  return { group: g, glass: [glassMat], lights, update };
}

/* ---------------------------------------------------------------- activity ---------- */
const COIN_POOL = 10;
/* Coin path through the chute: keyboard, chute foot, chute top, elbow exit, pig slot. */
const PATH = [
  [1.9, 0.6, 2.75, 0.0],
  [2.6, 0.62, 2.5, 0.15],
  [2.6, 2.0, 2.5, 0.75],
  [2.6, 2.4, 2.1, 0.9],
  [3.0, 1.75, 1.3, 1.3],
];
const PATH_T = 1.3;

function coinAt(t, out) {
  for (let i = 0; i < PATH.length - 1; i++) {
    const p0 = PATH[i], p1 = PATH[i + 1];
    if (t <= p1[3]) {
      const s = (t - p0[3]) / (p1[3] - p0[3]);
      out.set(lerp(p0[0], p1[0], s), lerp(p0[1], p1[1], s), lerp(p0[2], p1[2], s));
      if (i === 3) out.y += 0.15 * Math.sin(Math.PI * s);
      return out;
    }
  }
  const e = PATH[PATH.length - 1];
  return out.set(e[0], e[1], e[2]);
}

export function buildActivity(ctx) {
  const { dept } = ctx;
  const M = palette(dept);
  const g = new THREE.Group();
  const rand = rng('finance-ticker');

  // 1. Standing desk at z 3.0 (anchor.z + 0.55) with trestle legs and a keyboard.
  box(2.4, 0.06, 0.7, M.desk, { x: 1.5, y: 0.5, z: 3.0, parent: g });
  box(0.08, 0.5, 0.6, M.iron, { x: 0.5, y: 0, z: 3.0, parent: g });
  box(0.08, 0.5, 0.6, M.iron, { x: 2.5, y: 0, z: 3.0, parent: g });
  box(0.6, 0.03, 0.2, M.iron, { x: 1.5, y: 0.56, z: 2.75, parent: g, castShadow: false });

  // 2. Three monitors facing -z (toward the alien), tops at 0.96 so the face shows over them.
  let candleTex = null, screenMat;
  if (hasDoc()) {
    candleTex = canvasTex(512, 256, drawCandles);
    candleTex.wrapS = THREE.RepeatWrapping;
    screenMat = screenMaterial(candleTex, 0.8);
  } else {
    screenMat = glow(BRAND.aqua, 0.8);
  }
  for (const mx of [0.75, 1.5, 2.25]) {
    box(0.7, 0.4, 0.04, M.iron, { x: mx, y: 0.56, z: 3.1, parent: g, castShadow: false });
    plane(0.64, 0.34, screenMat, { x: mx, y: 0.76, z: 3.075, ry: Math.PI, parent: g });
    box(0.12, 0.03, 0.01, M.trim, { x: mx, y: 0.86, z: 3.125, parent: g, castShadow: false });
    box(0.03, 0.1, 0.01, M.trim, { x: mx, y: 0.76, z: 3.125, parent: g, castShadow: false });
  }

  // 3. Ticker column at the desk's east end with scrolling digits and a balance readout on top.
  box(0.4, 1.6, 0.04, M.navy, { x: 2.95, y: 0.5, z: 3.1, parent: g });
  let digitsTex = null, digitsMat, balTex = null, balCanvas = null, balCtx = null;
  if (hasDoc()) {
    digitsTex = canvasTex(128, 1024, drawDigits);
    digitsTex.wrapT = THREE.RepeatWrapping;
    digitsMat = screenMaterial(digitsTex, 0.9);
    plane(0.36, 1.3, digitsMat, { x: 2.95, y: 1.2, z: 3.125, parent: g });
    plane(0.36, 1.3, digitsMat, { x: 2.95, y: 1.2, z: 3.075, ry: Math.PI, parent: g });
    balCanvas = document.createElement('canvas'); balCanvas.width = 128; balCanvas.height = 64;
    balCtx = balCanvas.getContext('2d');
    balTex = new THREE.CanvasTexture(balCanvas); balTex.colorSpace = THREE.SRGBColorSpace; balTex.anisotropy = 8;
    plane(0.36, 0.18, screenMaterial(balTex, 1.0), { x: 2.95, y: 1.98, z: 3.125, parent: g });
  } else {
    digitsMat = glow(BRAND.aqua, 0.9);
    plane(0.36, 1.3, digitsMat, { x: 2.95, y: 1.2, z: 3.125, parent: g });
  }

  // 4. Coin chute: a clear tube rising from the desk's east end, a quarter-torus elbow turning
  //    north and a straight run angled down to the pig's slot.
  const chuteMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(CHUTE), transparent: true, opacity: 0.35, roughness: 0.3, depthWrite: false });
  chuteMat.userData.envMapIntensity = 0.6;
  const tube = cyl(0.14, 0.14, 1.5, chuteMat, { x: 2.6, y: 0.5, z: 2.5, parent: g, castShadow: false, seg: 16 }); tube.renderOrder = 5;
  const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 8, 12, Math.PI / 2), chuteMat);
  elbow.position.set(2.6, 2.0, 2.1); elbow.rotation.y = -Math.PI / 2; elbow.renderOrder = 5; g.add(elbow);
  _a.set(2.6, 2.4, 2.1); _b.set(3.0, 1.75, 1.3);
  const runLen = _a.distanceTo(_b);
  const run = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, runLen, 16), chuteMat);
  run.position.lerpVectors(_a, _b, 0.5);
  run.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize());
  run.renderOrder = 5; g.add(run);

  // 5. Giant piggy bank on a plinth (prop about 1.6 wide), facing the camera.
  box(1.4, 0.3, 1.4, M.plinth, { x: 3.0, y: 0, z: 1.2, parent: g });
  const pig = new THREE.Group(); pig.position.set(3.0, 0.95, 1.2); g.add(pig);
  const pigMat = glow(BRAND.salmon, 0);
  const body = sphere(0.65, pigMat, { parent: pig }); body.scale.set(1.25, 1, 1);
  cyl(0.22, 0.22, 0.2, pigMat, { y: -0.1, z: 0.7, rx: Math.PI / 2, parent: pig, castShadow: false, seg: 16 });
  sphere(0.03, M.navy, { x: -0.08, y: 0, z: 0.81, parent: pig, castShadow: false });
  sphere(0.03, M.navy, { x: 0.08, y: 0, z: 0.81, parent: pig, castShadow: false });
  for (const ex of [-0.3, 0.3]) { const ear = cone(0.14, 0.2, pigMat, { x: ex, y: 0.52, z: -0.1, parent: pig, castShadow: false, seg: 12 }); ear.rotation.z = ex > 0 ? -0.3 : 0.3; }
  for (const [lx, lz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) cyl(0.1, 0.1, 0.3, pigMat, { x: lx, y: -0.65, z: lz, parent: pig, castShadow: false, seg: 10 });
  torus(0.1, 0.03, pigMat, { y: 0.1, z: -0.84, parent: pig, castShadow: false });
  const eyes = new THREE.Group(); pig.add(eyes);
  for (const ex of [-0.22, 0.22]) {
    sphere(0.08, M.white, { x: ex, y: 0.2, z: 0.6, parent: eyes, castShadow: false });
    sphere(0.04, M.navy, { x: ex, y: 0.2, z: 0.67, parent: eyes, castShadow: false });
  }
  box(0.4, 0.06, 0.06, M.iron, { y: 0.62, parent: pig, castShadow: false });
  const dingMat = glow('#FFFFFF', 1.0);
  const ding = sphere(0.08, dingMat, { x: 3.0, y: 1.72, z: 1.2, parent: g, castShadow: false });
  ding.scale.setScalar(0.001);

  // 6. Coin pool, hidden while idle.
  const coinGlow = glow(GOLD, 0.3);
  const coins = [];
  for (let i = 0; i < COIN_POOL; i++) { const c = cyl(0.12, 0.12, 0.03, coinGlow, { parent: g, castShadow: false, seg: 12 }); c.visible = false; coins.push(c); }
  const coinStart = new Float32Array(COIN_POOL).fill(-1);

  // 7. Navy rug under the desk and a rising-line chart on a post (repainted every four bursts).
  plane(2.8, 1.4, M.navy, { x: 1.5, y: 0.01, z: 2.9, rx: -Math.PI / 2, parent: g, receiveShadow: true });
  cyl(0.04, 0.04, 1.2, M.iron, { x: 0.6, y: 0, z: 0.8, parent: g, castShadow: false, seg: 8 });
  let chartTex = null, chartCtx = null;
  if (hasDoc()) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    chartCtx = cv.getContext('2d');
    drawChart(chartCtx, 256, 160, rand);
    chartTex = new THREE.CanvasTexture(cv); chartTex.colorSpace = THREE.SRGBColorSpace; chartTex.anisotropy = 8;
    const board = decal(1.0, 0.6, chartTex, { x: 0.6, y: 1.2, z: 0.83, parent: g });
    board.castShadow = true;
  } else {
    box(1.0, 0.6, 0.04, M.trim, { x: 0.6, y: 0.9, z: 0.8, parent: g });
  }

  // State.
  const st = { lastBurst: -1, bursts: 0, balance: 4200, squash: 1, blink: 1, flash: 0, ding: 1, nextCoin: 0, balDirty: true };

  function repaintBalance() {
    if (!balCtx) return;
    drawBalance(balCtx, 128, 64, st.balance);
    balTex.needsUpdate = true;
  }
  repaintBalance();

  function onBurst(time) {
    st.bursts++;
    st.balance += 100; repaintBalance();
    for (let k = 0; k < 3; k++) {
      const i = st.nextCoin; st.nextCoin = (st.nextCoin + 1) % COIN_POOL;
      coinStart[i] = time + 0.15 * k;
    }
    if (chartCtx && st.bursts % 4 === 0) { drawChart(chartCtx, 256, 160, rand); chartTex.needsUpdate = true; }
  }

  function update(dt, time, phase, alien, active) {
    if (active) {
      const bi = burstIndex(phase ? phase.t : 0);
      if (bi !== st.lastBurst) { st.lastBurst = bi; if (bi >= 0) onBurst(time); }
    } else {
      st.lastBurst = -1;
    }
    // Screens and digits: lively while working, dim and slow while idle.
    if (candleTex) candleTex.offset.x += (active ? 0.05 : 0.01) * dt;
    if (digitsTex) digitsTex.offset.y -= (active ? 0.1 : 0.03) * dt;
    screenMat.emissiveIntensity = active ? 0.8 + 0.2 * Math.sin(TAU * 0.5 * time) : 0.4;
    digitsMat.emissiveIntensity = active ? 0.9 : 0.45;

    // Coins up the chute and into the slot.
    for (let i = 0; i < COIN_POOL; i++) {
      const c = coins[i];
      if (coinStart[i] < 0) { c.visible = false; continue; }
      const t = time - coinStart[i];
      if (t < 0) { c.visible = false; continue; }
      if (t >= PATH_T) {
        coinStart[i] = -1; c.visible = false;
        st.squash = 0; st.blink = 0; st.flash = 0.3; st.ding = 0;
        continue;
      }
      c.visible = true;
      coinAt(t, c.position);
      c.rotation.y = 10 * t; c.rotation.x = 0.4;
    }

    // Pig: breathing while working, squash and blink on each deposit, salmon flash decaying.
    st.squash = Math.min(1, st.squash + dt / 0.3);
    st.blink = Math.min(1, st.blink + dt / 0.15);
    st.ding = Math.min(1, st.ding + dt / 0.35);
    st.flash = Math.max(0, st.flash - dt);
    const breath = active ? 1 + 0.01 + 0.01 * Math.sin(TAU * 0.4 * time) : 1;
    const sq = 1 - easeInOut(st.squash);
    pig.scale.set(breath * (1 + 0.08 * sq), breath * (1 - 0.08 * sq), breath * (1 + 0.08 * sq));
    eyes.scale.y = st.blink < 1 ? 0.1 + 0.9 * Math.abs(st.blink * 2 - 1) : 1;
    pigMat.emissiveIntensity = st.flash;
    ding.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * st.ding) * 1.6));
  }

  return {
    group: g,
    anchor: new THREE.Vector3(1.5, 0, 2.45),
    yaw: 0,
    pose: 'type',
    enter: 'walk',
    label: activityLabel,
    update,
  };
}
