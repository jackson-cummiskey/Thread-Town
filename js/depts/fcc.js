/* FCC: Financial Crimes. A detective agency wrapped in a salmon stripe with an off-center watchtower,
   and a field tower station where the detective sweeps a searchlight and nets a sneaking suspect.
   Creative brief: docs/CITY_DESIGN.md "## fcc". Coordinates and return shapes: docs/CONTRACT_V2.md. */
import * as THREE from 'three';
import { mat, glass, glow, box, cyl, cone, sphere, dome, torus, plane, windowRow, canvasTex, decal, pointLight, clamp, lerp } from './common.js';

export const id = 'fcc';
export const activityLabel = 'Watching from the tower';

const C = {
  trim: '#F8F6F0', plinth: '#CFC6B6', iron: '#2E3E50', wood: '#A5774E', brass: '#F6D463',
  bulb: '#FFF1C9', cork: '#D8B98A', green: '#1F8A5B', silver: '#E2E9EE', ink: '#0E1B2E', white: '#FFFFFF',
};
const TAU = Math.PI * 2;
const ramp = n => clamp((n - 0.25) / 0.75, 0, 1);
const hasDoc = () => typeof document !== 'undefined';
const IRON = { roughness: 0.55, metalness: 0.2 };

// CONTRACT: the activity update does not receive night, so the building update shares the night value
// through module scope. There is exactly one fcc building per town, so this is safe.
let nightS = 0;

/* Canvas texture only when a DOM exists (the Node import test has none). */
function tex(w, h, draw) { return hasDoc() ? canvasTex(w, h, draw) : null; }
function sign(w, h, fallbackHex, draw, o) {
  const t = tex(256, Math.round(256 * h / w), draw);
  if (t) return decal(w, h, t, o);
  return plane(w, h, mat(fallbackHex), o);
}
function additive(hex, opacity) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

/* A searchlight: a yaw pivot holding a lamp body that points along local +z, pitched down by pitchDown,
   with a lens disc and an additive beam cone opening away from the lens. */
function makeSearchlight(lampR, lampH, beamR, beamH, pitchDown, lensI, beamO) {
  const pivot = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.x = pitchDown - Math.PI / 2;
  pivot.add(tilt);
  cyl(lampR * 0.85, lampR, lampH, mat(C.iron, IRON), { y: -lampH, parent: tilt });
  const lens = glow(C.bulb, lensI);
  cyl(lampR * 0.9, lampR * 0.9, 0.04, lens, { y: -lampH - 0.04, parent: tilt, castShadow: false });
  const beamMat = additive(C.bulb, beamO);
  const beam = cone(beamR, beamH, beamMat, { y: -lampH - beamH, parent: tilt, castShadow: false, receiveShadow: false });
  beam.renderOrder = 5;
  return { pivot, lens, beamMat, beam };
}

function drawBlinds(ctx, w, h) {
  ctx.fillStyle = '#AFD6E4'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#F8F6F0';
  for (let y = 6; y < h; y += 18) ctx.fillRect(0, y, w, 7);
  ctx.fillStyle = '#C9CFD6';
  for (let y = 13; y < h; y += 18) ctx.fillRect(0, y, w, 3);
}

/* Cork board with pinned cards and red string. checks = number of cards already marked with a salmon check. */
function drawCaseBoard(ctx, w, h, checks) {
  ctx.fillStyle = C.cork; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % w, (i * 53) % h, 6, 3);
  const cards = [[0.12, 0.18], [0.55, 0.12], [0.35, 0.58]];
  const cw = w * 0.3, ch = h * 0.3;
  cards.forEach((c, i) => {
    const x = c[0] * w, y = c[1] * h;
    ctx.fillStyle = '#F8F6F0'; ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = '#C9CFD6';
    ctx.fillRect(x + 8, y + ch * 0.35, cw - 16, 4);
    ctx.fillRect(x + 8, y + ch * 0.6, cw * 0.6, 4);
    ctx.fillStyle = '#E7706F'; ctx.beginPath(); ctx.arc(x + cw / 2, y + 6, 5, 0, TAU); ctx.fill();
    if (i < checks) {
      ctx.strokeStyle = '#E7706F'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + cw * 0.2, y + ch * 0.55); ctx.lineTo(x + cw * 0.42, y + ch * 0.8); ctx.lineTo(x + cw * 0.82, y + ch * 0.25); ctx.stroke();
    }
  });
  ctx.strokeStyle = '#D23B3B'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cards[0][0] * w + cw / 2, cards[0][1] * h + 6);
  ctx.lineTo(cards[1][0] * w + cw / 2, cards[1][1] * h + 6);
  ctx.lineTo(cards[2][0] * w + cw / 2, cards[2][1] * h + 6);
  ctx.lineTo(cards[0][0] * w + cw / 2, cards[0][1] * h + 6);
  ctx.stroke();
}

export function buildBuilding(ctx) {
  const { b, dept } = ctx;
  const w = b.w, h = b.h;
  const g = new THREE.Group();
  const wall = mat(dept.wall, { roughness: 0.9 });
  const roofM = mat(dept.accent, { roughness: 0.78 });
  const doorM = mat(dept.accent, { roughness: 0.6 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const plinth = mat(C.plinth, { roughness: 0.9 });
  const iron = mat(C.iron, IRON);
  const knob = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  const silver = mat(C.silver, { roughness: 0.5, doubleSide: true });
  const glassMat = glass();
  const cx = w / 2, cz = h / 2;
  const doorX = b.door.x - b.x + 1;

  /* 1 and 2: plinth, main block, flat roof with parapet and lip */
  box(w, 0.14, h, plinth, { x: cx, y: 0, z: cz, parent: g });
  box(8.4, 3.0, 5.4, wall, { x: cx, y: 0.14, z: cz, radius: 0.06, parent: g });
  box(8.8, 0.3, 5.8, iron, { x: cx, y: 3.14, z: cz, parent: g });
  box(8.8, 0.2, 0.15, trim, { x: cx, y: 3.44, z: cz - 2.825, parent: g, castShadow: false });
  box(8.8, 0.2, 0.15, trim, { x: cx, y: 3.44, z: cz + 2.825, parent: g, castShadow: false });
  box(0.15, 0.2, 5.8, trim, { x: cx - 4.325, y: 3.44, z: cz, parent: g, castShadow: false });
  box(0.15, 0.2, 5.8, trim, { x: cx + 4.325, y: 3.44, z: cz, parent: g, castShadow: false });

  /* 3: the signature stripe, emissive at night */
  const stripeMat = glow(dept.accent, 0);
  stripeMat.roughness = 0.78;
  box(9.02, 0.5, 6.02, stripeMat, { x: cx, y: 2.3, z: cz, parent: g, castShadow: false });

  /* 4: watchtower */
  const tx = 7.2, tz = 1.4;
  box(2.2, 5.6, 2.2, wall, { x: tx, y: 0.14, z: tz, parent: g });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(0.15, 5.6, 0.15, roofM, { x: tx + sx * 1.1, y: 0.14, z: tz + sz * 1.1, parent: g, castShadow: false });
    box(0.12, 1.4, 0.12, trim, { x: tx + sx * 1.36, y: 5.74, z: tz + sz * 1.36, parent: g, castShadow: false });
  }
  box(2.8, 1.4, 2.8, iron, { x: tx, y: 5.74, z: tz, parent: g });
  box(2.4, 0.8, 0.05, glassMat, { x: tx, y: 6.1, z: tz + 1.425, parent: g, castShadow: false });
  box(2.4, 0.8, 0.05, glassMat, { x: tx, y: 6.1, z: tz - 1.425, parent: g, castShadow: false });
  box(0.05, 0.8, 2.4, glassMat, { x: tx + 1.425, y: 6.1, z: tz, parent: g, castShadow: false });
  box(0.05, 0.8, 2.4, glassMat, { x: tx - 1.425, y: 6.1, z: tz, parent: g, castShadow: false });
  cone(2.0, 0.9, roofM, { x: tx, y: 7.14, z: tz, seg: 4, ry: Math.PI / 4, parent: g });
  cyl(0.02, 0.02, 0.86, trim, { x: tx, y: 8.04, z: tz, seg: 8, parent: g, castShadow: false });
  const tipMat = glow(dept.accent, 1);
  sphere(0.07, tipMat, { x: tx, y: 8.9, z: tz, parent: g, castShadow: false });

  /* 5: searchlight on the cabin roof edge. The beam is 4.0 long, r 0.6, pitch 1.0, sweep 0.7 (the brief says
     6.0 long, r 0.9, pitch 0.5, sweep 1.1) so its sweep stays inside the footprint margin. */
  box(0.3, 0.3, 0.3, iron, { x: tx, y: 7.26, z: tz + 1.2, parent: g, castShadow: false });
  const sl = makeSearchlight(0.25, 0.4, 0.6, 4.0, 1.0, 0.2, 0);
  sl.pivot.position.set(tx, 7.75, tz + 1.2);
  g.add(sl.pivot);

  /* 6: radar dish */
  cyl(0.06, 0.06, 0.8, iron, { x: 1.4, y: 3.44, z: 1.0, seg: 10, parent: g, castShadow: false });
  const spin = new THREE.Group();
  spin.position.set(1.4, 4.24, 1.0);
  g.add(spin);
  const dish = dome(0.6, silver, { parent: spin, castShadow: false });
  dish.scale.y = 0.3;
  dish.rotation.x = -1.1;

  /* 7: magnifying glass sign over the door */
  const mag = new THREE.Group();
  mag.position.set(cx, 3.6, 5.85);
  g.add(mag);
  torus(0.45, 0.06, iron, { parent: mag, castShadow: false });
  cyl(0.42, 0.42, 0.03, glassMat, { y: -0.015, rx: Math.PI / 2, parent: mag, castShadow: false });
  const handle = new THREE.Group();
  handle.position.set(0.45 * 0.72, -0.45 * 0.70, 0);
  handle.rotation.z = Math.PI + 0.8;
  mag.add(handle);
  cyl(0.05, 0.05, 0.6, iron, { seg: 10, parent: handle, castShadow: false });

  /* 8: door with a barred window, frame, knob and the FCC shield */
  box(1.8, 2.15, 0.06, trim, { x: doorX, y: 0.14, z: 5.70, parent: g, castShadow: false });
  box(1.6, 2.0, 0.08, doorM, { x: doorX, y: 0.14, z: 5.72, parent: g });
  box(0.5, 0.4, 0.04, glassMat, { x: doorX, y: 1.4, z: 5.78, parent: g, castShadow: false });
  box(0.03, 0.4, 0.05, iron, { x: doorX - 0.1, y: 1.4, z: 5.78, parent: g, castShadow: false });
  box(0.03, 0.4, 0.05, iron, { x: doorX + 0.1, y: 1.4, z: 5.78, parent: g, castShadow: false });
  sphere(0.05, knob, { x: doorX + 0.6, y: 1.15, z: 5.8, parent: g, castShadow: false });
  sign(0.9, 0.5, dept.accent, (c, cw, ch) => {
    c.fillStyle = dept.accent; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#FFFFFF'; c.beginPath();
    c.moveTo(cw * 0.5, ch * 0.08); c.lineTo(cw * 0.78, ch * 0.2); c.lineTo(cw * 0.74, ch * 0.62); c.lineTo(cw * 0.5, ch * 0.92);
    c.lineTo(cw * 0.26, ch * 0.62); c.lineTo(cw * 0.22, ch * 0.2); c.closePath(); c.fill();
    c.fillStyle = dept.accent; c.font = `bold ${Math.round(ch * 0.34)}px Kanit, Inter, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FCC', cw * 0.5, ch * 0.5);
  }, { x: doorX, y: 2.85, z: 6.03, parent: g });

  /* 9: windows (one glass material), the case board, the roof vent */
  for (const wx of [1.2, 2.4, 6.0]) {
    box(0.72, 0.92, 0.08, trim, { x: wx, y: 1.14, z: 5.70, parent: g, castShadow: false });
    box(0.6, 0.8, 0.1, glassMat, { x: wx, y: 1.2, z: 5.72, parent: g, castShadow: false });
    sign(0.56, 0.42, '#AFD6E4', drawBlinds, { x: wx, y: 1.77, z: 5.78, parent: g });
  }
  box(1.32, 1.12, 0.08, trim, { x: 7.0, y: 0.74, z: 5.70, parent: g, castShadow: false });
  sign(1.2, 1.0, C.cork, (c, cw, ch) => drawCaseBoard(c, cw, ch, 0), { x: 7.0, y: 1.3, z: 5.75, parent: g });
  const west = windowRow(3, 0.6, 0.8, 1.2, glassMat, { x0: 1.2, y: 1.2, ry: -Math.PI / 2 });
  west.position.x = 0.28; g.add(west);
  const east = windowRow(3, 0.6, 0.8, -0.9, glassMat, { x0: -3.0, y: 1.2, ry: Math.PI / 2 });
  east.position.x = 8.72; g.add(east);
  cyl(0.2, 0.2, 0.4, iron, { x: 3.0, y: 3.44, z: 1.5, seg: 12, parent: g, castShadow: false });

  const lights = [pointLight(C.bulb, 5, 5, { x: tx, y: 6.4, z: tz, parent: g })];

  function update(dt, time, night, active) {
    const r = ramp(night);
    nightS = night;
    const k = 1 - Math.exp(-6 * dt);
    stripeMat.emissiveIntensity = 0.25 * r;
    tipMat.emissiveIntensity = (Math.sin(TAU * time) > 0 ? 1.6 : 0.15) * (0.4 + 0.6 * r);
    sl.pivot.rotation.y = 0.7 * Math.sin(TAU * 0.12 * time);
    const on = active || r > 0.02;
    const beamTarget = active ? Math.max(0.18 * r, 0.12) : 0.18 * r;
    sl.beamMat.opacity += (beamTarget - sl.beamMat.opacity) * k;
    sl.beam.visible = sl.beamMat.opacity > 0.005;
    sl.lens.emissiveIntensity += ((on ? 1.5 : 0.2) - sl.lens.emissiveIntensity) * k;
    spin.rotation.y += 1.2 * dt;
  }

  return { group: g, glass: [glassMat], lights, update };
}

/* ---------------------------------------------------------------- activity: watchtower */
const CUBE_START_Z = 0.3, CUBE_END_Z = 3.5, CUBE_X = 3.4, LAMP_X = 0.8, LAMP_Z = 1.0, SPOT_D = 2.0;
const _handPos = new THREE.Vector3();

export function buildActivity(ctx) {
  const { dept } = ctx;
  const g = new THREE.Group();
  const iron = mat(C.iron, IRON);
  const wood = mat(C.wood, { roughness: 0.8 });
  const accent = mat(dept.accent, { roughness: 0.6 });
  const silver = mat(C.silver, { roughness: 0.5, doubleSide: true });

  /* 1: tower legs, braces, platform, railing, ladder */
  const legs = [[0.9, 1.1], [2.3, 1.1], [0.9, 2.5], [2.3, 2.5]];
  for (const [lx, lz] of legs) cyl(0.08, 0.08, 2.4, iron, { x: lx, y: 0, z: lz, seg: 10, parent: g });
  for (const s of [-1, 1]) {
    box(0.06, 2.0, 0.06, iron, { x: 1.6, y: 0.2, z: 1.1, rz: s * 0.6, parent: g, castShadow: false });
    box(0.06, 2.0, 0.06, iron, { x: 1.6, y: 0.2, z: 2.5, rz: s * 0.6, parent: g, castShadow: false });
    box(0.06, 2.0, 0.06, iron, { x: 0.9, y: 0.2, z: 1.8, rx: s * 0.6, parent: g, castShadow: false });
    box(0.06, 2.0, 0.06, iron, { x: 2.3, y: 0.2, z: 1.8, rx: s * 0.6, parent: g, castShadow: false });
  }
  box(2.0, 0.15, 2.0, wood, { x: 1.6, y: 2.4, z: 1.8, parent: g });
  const railY = 2.55;
  for (const [px, pz] of [[0.65, 0.85], [1.6, 0.85], [2.55, 0.85], [0.65, 1.8], [2.55, 1.8], [0.65, 2.75], [1.6, 2.75], [2.55, 2.75]]) {
    cyl(0.03, 0.03, 0.5, iron, { x: px, y: railY, z: pz, seg: 8, parent: g, castShadow: false });
  }
  box(2.0, 0.05, 0.05, accent, { x: 1.6, y: railY + 0.5, z: 0.85, parent: g, castShadow: false });
  box(2.0, 0.05, 0.05, accent, { x: 1.6, y: railY + 0.5, z: 2.75, parent: g, castShadow: false });
  box(0.05, 0.05, 2.0, accent, { x: 0.65, y: railY + 0.5, z: 1.8, parent: g, castShadow: false });
  box(0.05, 0.05, 2.0, accent, { x: 2.55, y: railY + 0.5, z: 1.8, parent: g, castShadow: false });
  cyl(0.03, 0.03, 2.4, iron, { x: 1.35, y: 0, z: 2.85, seg: 8, parent: g, castShadow: false });
  cyl(0.03, 0.03, 2.4, iron, { x: 1.85, y: 0, z: 2.85, seg: 8, parent: g, castShadow: false });
  for (let i = 0; i < 9; i++) box(0.5, 0.04, 0.04, iron, { x: 1.6, y: 0.2 + i * 0.26, z: 2.85, parent: g, castShadow: false });

  /* 2: searchlight on a yoke at the platform's north-west corner */
  box(0.3, 0.3, 0.3, iron, { x: LAMP_X, y: railY, z: LAMP_Z, parent: g, castShadow: false });
  const sl = makeSearchlight(0.2, 0.35, 0.7, 4.5, 0.9, 0.4, 0);
  sl.pivot.position.set(LAMP_X, 3.0, LAMP_Z);
  g.add(sl.pivot);

  /* 3: radar dish */
  cyl(0.05, 0.05, 0.5, iron, { x: 2.4, y: railY, z: 1.0, seg: 8, parent: g, castShadow: false });
  const spin = new THREE.Group();
  spin.position.set(2.4, railY + 0.5, 1.0);
  g.add(spin);
  const dish = dome(0.45, silver, { parent: spin, castShadow: false });
  dish.scale.y = 0.3;
  dish.rotation.x = -1.1;

  /* 4: binoculars. They stay in the station group and follow the alien's right hand each frame, so the
     alien fade (setAlienOpacity walks the alien group and mutates materials it does not own) never
     touches the shared iron material, and the binoculars do not inherit the alien group scale.
     Scaled 1.3 to keep the size they had when they lived inside the alien group. */
  const binoc = new THREE.Group();
  cyl(0.05, 0.05, 0.18, iron, { x: -0.055, rx: Math.PI / 2, seg: 10, parent: binoc, castShadow: false });
  cyl(0.05, 0.05, 0.18, iron, { x: 0.055, rx: Math.PI / 2, seg: 10, parent: binoc, castShadow: false });
  box(0.16, 0.04, 0.06, iron, { y: -0.02, parent: binoc, castShadow: false });
  binoc.scale.setScalar(1.3);
  binoc.visible = false;
  g.add(binoc);

  /* 5: suspect cube */
  const cubeMat = glow(dept.accent, 0.8);
  cubeMat.transparent = true;
  const cube = new THREE.Group();
  box(0.5, 0.5, 0.5, cubeMat, { y: -0.25, parent: cube });
  const bang = sign(0.3, 0.3, C.white, (c, cw, ch) => {
    c.clearRect(0, 0, cw, ch);
    c.fillStyle = '#FFFFFF'; c.font = `bold ${Math.round(ch * 0.9)}px Kanit, Inter, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', cw * 0.5, ch * 0.55);
  }, { z: 0.26, parent: cube });
  if (bang.material.map) bang.material.transparent = true;
  cube.visible = false;
  g.add(cube);

  /* 6: net */
  const netMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.silver), wireframe: true, transparent: true, opacity: 0.8 });
  const net = dome(0.6, netMat, { x: CUBE_X, y: 3.0, z: 2.0, castShadow: false, receiveShadow: false });
  net.visible = false;
  g.add(net);

  /* 7: spot pool where the beam meets the ground */
  const poolMat = additive(C.bulb, 0);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(LAMP_X, 0.02, LAMP_Z + SPOT_D);
  pool.renderOrder = 5;
  g.add(pool);

  /* 8: evidence lockers */
  box(1.0, 1.2, 0.6, iron, { x: 0.6, y: 0, z: 3.4, parent: g });
  const drawerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dept.accent), roughness: 0.6, emissive: new THREE.Color(C.green), emissiveIntensity: 0 });
  box(0.8, 0.3, 0.04, accent, { x: 0.6, y: 0.15, z: 3.71, parent: g, castShadow: false });
  box(0.8, 0.3, 0.04, accent, { x: 0.6, y: 0.55, z: 3.71, parent: g, castShadow: false });
  box(0.8, 0.3, 0.04, drawerMat, { x: 0.6, y: 0.95, z: 3.71, parent: g, castShadow: false });

  /* 9: evidence board between the tower legs */
  cyl(0.04, 0.04, 1.2, iron, { x: 1.0, y: 0, z: 0.4, seg: 8, parent: g, castShadow: false });
  cyl(0.04, 0.04, 1.2, iron, { x: 2.2, y: 0, z: 0.4, seg: 8, parent: g, castShadow: false });
  box(1.4, 1.0, 0.06, iron, { x: 1.6, y: 1.2, z: 0.4, parent: g, castShadow: false });
  let checks = 0;
  const boardTex = tex(256, 184, (c, cw, ch) => drawCaseBoard(c, cw, ch, 0));
  const board = boardTex ? decal(1.3, 0.9, boardTex, { x: 1.6, y: 1.7, z: 0.44, parent: g }) : plane(1.3, 0.9, mat(C.cork), { x: 1.6, y: 1.7, z: 0.44, parent: g });
  function flipCard() {
    checks = (checks % 3) + 1;
    if (!boardTex) return;
    const cv = boardTex.image;
    drawCaseBoard(cv.getContext('2d'), cv.width, cv.height, checks);
    boardTex.needsUpdate = true;
  }

  const anchor = new THREE.Vector3(1.6, 2.55, 1.8);
  const YAW = 0.3;

  /* state */
  let lastBurst = -1, burstCount = 0;
  let cubeOn = false, cubeT = 0, caught = false, catchT = 0;
  let drawerT = -10, wasWorking = false, dishSpeed = 0.3, beamYaw = 0;

  function resetCube() {
    cubeOn = false; caught = false; cube.visible = false; net.visible = false;
    cube.scale.set(1, 1, 1); cubeMat.opacity = 1; cubeMat.emissive.set(dept.accent); netMat.opacity = 0.8;
    net.position.y = 3.0;
  }

  function update(dt, time, phase, alien, active) {
    const r = ramp(nightS);
    const k = 1 - Math.exp(-6 * dt);
    if (active && !wasWorking) { lastBurst = -1; }
    wasWorking = active;

    /* searchlight and spot pool */
    if (active) {
      beamYaw = 1.2 * Math.sin(TAU * 0.15 * phase.t);
    } else {
      beamYaw += (0 - beamYaw) * k * 0.5;
    }
    sl.pivot.rotation.y = beamYaw;
    const beamTarget = active ? Math.max(0.15 * r, 0.10) : 0.15 * r;
    sl.beamMat.opacity += (beamTarget - sl.beamMat.opacity) * k;
    sl.beam.visible = sl.beamMat.opacity > 0.005;
    sl.lens.emissiveIntensity += ((active || r > 0.02 ? 1.5 : 0.4) - sl.lens.emissiveIntensity) * k;
    pool.position.set(LAMP_X + SPOT_D * Math.sin(beamYaw), 0.02, LAMP_Z + SPOT_D * Math.cos(beamYaw));
    poolMat.opacity += ((active ? 0.10 + 0.25 * r : 0) - poolMat.opacity) * k;
    pool.visible = poolMat.opacity > 0.005;

    /* dish */
    dishSpeed += ((active ? 1.5 : 0.3) - dishSpeed) * k;
    spin.rotation.y += dishSpeed * dt;

    /* the alien follows the beam (set before the hand is read so the binoculars sit on this frame's hand) */
    if (alien && alien.group) alien.group.rotation.y = YAW + 0.5 * beamYaw;

    /* binoculars follow the right hand when a hand attach point exists (position copied into station space) */
    const handR = alien && alien.parts ? alien.parts.handR : null;
    if (handR) {
      handR.getWorldPosition(_handPos);
      g.worldToLocal(_handPos);
      binoc.position.copy(_handPos);
      binoc.rotation.y = alien.group ? alien.group.rotation.y : 0;
      binoc.visible = true;
    } else {
      binoc.visible = false;
    }

    /* work bursts: every second burst sends a suspect sneaking across the yard */
    if (active) {
      const idx = Math.floor((phase.t - 0.7) / 3.2);
      if (idx >= 0 && idx !== lastBurst) {
        lastBurst = idx; burstCount++;
        if (burstCount % 2 === 1 && !cubeOn) { resetCube(); cubeOn = true; cubeT = 0; cube.visible = true; }
      }
    }

    if (cubeOn) {
      if (!caught) {
        cubeT += dt;
        const u = clamp(cubeT / 3.0, 0, 1);
        cube.position.set(CUBE_X, 0.25 + 0.1 * Math.abs(Math.sin(TAU * 2 * cubeT)), lerp(CUBE_START_Z, CUBE_END_Z, u));
        cube.rotation.y = 0.15 * Math.sin(TAU * 2 * cubeT);
        const bearing = Math.atan2(cube.position.x - LAMP_X, cube.position.z - LAMP_Z);
        if (active && Math.abs(beamYaw - bearing) < 0.25 && u > 0.1) {
          caught = true; catchT = 0;
          cubeMat.emissive.set(C.white);
          net.visible = true; net.position.set(cube.position.x, 3.0, cube.position.z); netMat.opacity = 0.8;
          drawerT = time;
          flipCard();
        } else if (u >= 1 || !active) {
          resetCube();
        }
      } else {
        catchT += dt;
        const fall = clamp(catchT / 0.35, 0, 1);
        net.position.y = 3.0 * (1 - fall * fall);
        if (fall >= 1) {
          const f = clamp((catchT - 0.35) / 0.6, 0, 1);
          cube.scale.set(lerp(1, 1.3, f), lerp(1, 0.5, f), lerp(1, 1.3, f));
          cube.position.y = 0.25 * cube.scale.y;
          cubeMat.opacity = 1 - f;
          netMat.opacity = 0.8 * (1 - f);
          net.scale.set(1, lerp(1, 0.6, f), 1);
          if (f >= 1) { resetCube(); net.scale.set(1, 1, 1); }
        }
      }
    }

    /* locker top drawer glows green for a second after a catch */
    const since = time - drawerT;
    drawerMat.emissiveIntensity = since >= 0 && since < 1 ? 1.2 * (1 - since) : 0;
  }

  return { group: g, anchor, yaw: YAW, pose: 'lookUp', enter: 'inside', label: activityLabel, update };
}
