/* Ops: Operations. A long depot with a four-tooth sawtooth roof, smokestack and water tank, and a yard
   station where the agent works a lever to run a crane that lifts crates from a pallet onto a conveyor.
   Creative brief: docs/CITY_DESIGN.md "## ops". Coordinates and return shapes: docs/CONTRACT_V2.md. */
import * as THREE from 'three';
import { mat, glass, glow, box, cyl, cone, sphere, torus, plane, canvasTex, decal, pointLight, clamp, lerp, easeInOut } from './common.js';

export const id = 'ops';
export const activityLabel = 'Running the crane';

const C = {
  trim: '#F8F6F0', plinth: '#CFC6B6', iron: '#2E3E50', wood: '#A5774E', brass: '#F6D463',
  bulb: '#FFF1C9', ink: '#0E1B2E', glassLit: '#FFD88A', salmon: '#E7706F', green: '#1F8A5B', smoke: '#F2F2F2', white: '#FFFFFF',
};
const TAU = Math.PI * 2;
const ramp = n => clamp((n - 0.25) / 0.75, 0, 1);
const hasDoc = () => typeof document !== 'undefined';
const IRON = { roughness: 0.55, metalness: 0.2 };

// CONTRACT: the activity update does not receive night, so the building update shares the night value
// through module scope. There is exactly one ops building per town, so this is safe.
let nightS = 0;

function tex(w, h, draw) { return hasDoc() ? canvasTex(w, h, draw) : null; }
function sign(w, h, fallbackHex, draw, o) {
  const t = tex(256, Math.max(32, Math.round(256 * h / w)), draw);
  if (t) return decal(w, h, t, o);
  return plane(w, h, mat(fallbackHex), o);
}
function label(text, bg, fg) {
  return (c, cw, ch) => {
    c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
    c.fillStyle = fg; c.font = `600 ${Math.round(ch * 0.62)}px Kanit, Inter, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch * 0.54);
  };
}

/* A sawtooth tooth, ridge running north to south, gentle accent slope to the west and a steep glass face to
   the east. Returns two geometries centered on the tooth's x center and z center: solid (slope and end caps)
   and glass (the steep face). */
function toothGeometries(width, depth, h, ridgeFromEast) {
  const hw = width / 2, hd = depth / 2, rx = hw - ridgeFromEast;
  const A = [-hw, 0, -hd], B = [-hw, 0, hd], R1 = [rx, h, -hd], R2 = [rx, h, hd], E1 = [hw, 0, -hd], E2 = [hw, 0, hd];
  const tri = (list) => { const pos = []; for (const t of list) for (const v of t) pos.push(...v); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g; };
  const solid = tri([[A, B, R2], [A, R2, R1], [B, E2, R2], [A, R1, E1]]);
  const glassG = tri([[R1, R2, E2], [R1, E2, E1]]);
  return { solid, glassG };
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
  const wood = mat(C.wood, { roughness: 0.8 });
  const brass = mat(C.brass, { roughness: 0.3 });
  const glassMat = glass();
  const cx = w / 2, cz = h / 2;
  const doorX = b.door.x - b.x + 1;

  /* 1: apron and loading dock with hazard stripes */
  box(w, 0.14, h, plinth, { x: cx, y: 0, z: cz, parent: g });
  box(6.0, 0.5, 0.5, plinth, { x: 4.0, y: 0, z: 6.25, parent: g });
  sign(6.0, 0.5, C.brass, (c, cw, ch) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? C.iron : C.brass; c.fillRect(i * cw / 8, 0, cw / 8 + 1, ch); }
  }, { x: 4.0, y: 0.25, z: 6.51, parent: g });

  /* 2: shed with pilasters flanking the doors */
  box(10.4, 2.8, 5.4, wall, { x: cx, y: 0.14, z: cz, radius: 0.04, parent: g });
  for (const px of [1.5, 3.3, 4.1, 5.9, 6.7, 8.5]) box(0.12, 2.8, 0.08, trim, { x: px, y: 0.14, z: 5.74, parent: g, castShadow: false });

  /* 3: sawtooth roof, four teeth with glass clerestories facing east */
  const tooth = toothGeometries(2.6, 5.6, 1.1, 0.4);
  for (const tx of [1.3, 3.9, 6.5, 9.1]) {
    const s = new THREE.Mesh(tooth.solid, roofM); s.position.set(tx, 2.94, cz); s.castShadow = true; s.receiveShadow = true; g.add(s);
    const c = new THREE.Mesh(tooth.glassG, glassMat); c.position.set(tx, 2.94, cz); c.castShadow = false; c.receiveShadow = true; g.add(c);
  }

  /* 4: roll-up doors and the receiving door */
  const slats = (c, cw, ch) => {
    c.fillStyle = C.iron; c.fillRect(0, 0, cw, ch);
    c.fillStyle = C.trim; for (let i = 0; i < 7; i++) c.fillRect(0, Math.round((i + 0.5) * ch / 7) - 2, cw, 4);
  };
  box(1.6, 1.8, 0.08, iron, { x: 2.4, y: 0.14, z: 5.72, parent: g });
  sign(1.5, 1.7, C.iron, slats, { x: 2.4, y: 1.04, z: 5.77, parent: g });
  box(1.6, 0.8, 0.08, iron, { x: 7.6, y: 1.14, z: 5.72, parent: g });
  sign(1.5, 0.7, C.iron, slats, { x: 7.6, y: 1.54, z: 5.77, parent: g });
  const interiorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.ink), roughness: 0.9, emissive: new THREE.Color(C.glassLit), emissiveIntensity: 0 });
  plane(1.6, 1.0, interiorMat, { x: 7.6, y: 0.64, z: 5.71, parent: g });
  box(0.35, 0.35, 0.1, wood, { x: 7.3, y: 0.14, z: 5.72, parent: g, castShadow: false });
  box(0.3, 0.3, 0.1, wood, { x: 7.85, y: 0.14, z: 5.72, parent: g, castShadow: false });
  box(1.8, 2.15, 0.06, trim, { x: doorX, y: 0.14, z: 5.70, parent: g, castShadow: false });
  box(1.6, 2.0, 0.08, doorM, { x: doorX, y: 0.14, z: 5.72, parent: g });
  box(0.02, 2.0, 0.09, mat('#0E2238'), { x: doorX, y: 0.14, z: 5.72, parent: g, castShadow: false });
  sphere(0.05, mat(C.brass, { roughness: 0.3, metalness: 0.6 }), { x: doorX - 0.12, y: 1.1, z: 5.8, parent: g, castShadow: false });
  sphere(0.05, mat(C.brass, { roughness: 0.3, metalness: 0.6 }), { x: doorX + 0.12, y: 1.1, z: 5.8, parent: g, castShadow: false });
  sign(1.0, 0.3, C.trim, label('Receiving', C.trim, '#002D4F'), { x: doorX, y: 2.45, z: 5.75, parent: g });

  /* 5: gear emblem on the east gable end */
  const gearMat = glow(dept.accent, 0);
  gearMat.roughness = 0.6;
  const gear = new THREE.Group();
  gear.position.set(9.2, 3.0, 5.92);
  g.add(gear);
  torus(0.55, 0.14, gearMat, { parent: gear, castShadow: false });
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    box(0.18, 0.18, 0.14, gearMat, { x: Math.cos(a) * 0.68, y: Math.sin(a) * 0.68 - 0.09, rz: a, parent: gear, castShadow: false });
  }

  /* 6: smokestack with band, aviation light and smoke */
  cyl(0.35, 0.35, 3.0, iron, { x: 1.0, y: 3.3, z: 1.0, parent: g });
  cyl(0.37, 0.37, 0.25, trim, { x: 1.0, y: 5.6, z: 1.0, parent: g, castShadow: false });
  const aviMat = glow(C.salmon, 0);
  sphere(0.08, aviMat, { x: 1.0, y: 6.38, z: 1.0, parent: g, castShadow: false });
  const puffs = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.smoke), transparent: true, opacity: 0, depthWrite: false });
    const p = sphere(0.22, m, { x: 1.0, y: 6.4, z: 1.0, parent: g, castShadow: false, receiveShadow: false });
    p.visible = false;
    puffs.push({ mesh: p, mat: m });
  }

  /* 7: water tank */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, 1.0, 0.08, iron, { x: 9.4 + sx * 0.55, y: 3.4, z: 1.2 + sz * 0.55, parent: g, castShadow: false });
  cyl(0.9, 0.9, 1.2, wood, { x: 9.4, y: 4.4, z: 1.2, parent: g });
  cone(1.0, 0.5, roofM, { x: 9.4, y: 5.6, z: 1.2, parent: g });
  sign(0.8, 0.4, C.wood, label('OPS', C.wood, C.white), { x: 9.4, y: 5.0, z: 2.16, parent: g });

  /* 8: crates, barrels and bollards. The spec's crate and barrel spots fall inside the shed, so they sit
     on the grass just beside it, within the margin. */
  box(0.8, 0.8, 0.8, wood, { x: -0.2, y: 0, z: 4.6, parent: g });
  box(0.8, 0.8, 0.8, wood, { x: -0.2, y: 0.8, z: 4.6, parent: g });
  cyl(0.3, 0.3, 0.8, roofM, { x: 11.1, y: 0, z: 4.7, parent: g });
  cyl(0.3, 0.3, 0.8, roofM, { x: 11.1, y: 0, z: 5.4, parent: g });
  for (const bx of [7.2, 8.5, 9.8]) cyl(0.1, 0.1, 0.6, brass, { x: bx, y: 0, z: 6.4, seg: 10, parent: g, castShadow: false });

  /* 9: small windows and the rooftop sign band */
  for (const wx of [0.9, 3.7, 6.3]) {
    box(0.72, 0.72, 0.08, trim, { x: wx, y: 1.84, z: 5.70, parent: g, castShadow: false });
    box(0.6, 0.6, 0.1, glassMat, { x: wx, y: 1.9, z: 5.72, parent: g, castShadow: false });
  }
  cyl(0.03, 0.03, 0.65, iron, { x: 4.1, y: 3.6, z: 5.5, seg: 8, parent: g, castShadow: false });
  cyl(0.03, 0.03, 0.65, iron, { x: 6.9, y: 3.6, z: 5.5, seg: 8, parent: g, castShadow: false });
  sign(3.0, 0.5, C.trim, label('Operations depot', C.trim, '#002D4F'), { x: cx, y: 4.3, z: 5.52, parent: g });

  const lights = [pointLight('#FFC97A', 6, 5, { x: 4.0, y: 3.2, z: 5.9, parent: g })];

  let gearSpeed = 0.3;
  function update(dt, time, night, active) {
    const r = ramp(night);
    nightS = night;
    const k = 1 - Math.exp(-4 * dt);
    gearSpeed += ((active ? 1.0 : 0.3) - gearSpeed) * k;
    gear.rotation.z -= gearSpeed * dt;
    gearMat.emissiveIntensity = 0.3 * r;
    interiorMat.emissiveIntensity = 0.6 * r;
    aviMat.emissiveIntensity = r > 0.02 && Math.sin(TAU * 0.5 * time) > 0 ? 1.6 * r : 0;
    for (let i = 0; i < 3; i++) {
      const p = puffs[i];
      if (!active && p.mat.opacity < 0.01) { p.mesh.visible = false; continue; }
      p.mesh.visible = true;
      const u = (time * 0.45 + i / 3) % 1;
      p.mesh.position.set(1.0 + 0.25 * Math.sin(TAU * u + i), 6.4 + 1.3 * u, 1.0 + 0.1 * Math.cos(TAU * u));
      const sc = 0.7 + 1.1 * u;
      p.mesh.scale.set(sc, sc, sc);
      const target = active ? 0.55 * (1 - u) : 0;
      p.mat.opacity += (target - p.mat.opacity) * (active ? 1 : k);
    }
  }

  return { group: g, glass: [glassMat], lights, update };
}

/* ---------------------------------------------------------------- activity: crane */
const BASE_X = 1.4, BASE_Z = 2.6, BOOM_LEN = 2.0, BOOM_TILT = 0.2;
const BOOM_R = BOOM_LEN * Math.cos(BOOM_TILT), TIP_Y = 3.0 - BOOM_LEN * Math.sin(BOOM_TILT);
const PALLET_X = 0.6, PALLET_Z = 0.85, STACK_TOP_Y = 0.6;
const BELT_Y = 0.35, BELT_X0 = 1.88, BELT_X1 = 3.75, BELT_Z = 0.7;
const YAW_PALLET = Math.atan2(BASE_Z - PALLET_Z, PALLET_X - BASE_X);
const YAW_BELT = Math.atan2(BASE_Z - BELT_Z, BELT_X0 - BASE_X);
const CABLE_UP = 0.4, CRATE = 0.45, HOOK_H = 0.25;
const CABLE_GRAB = TIP_Y - HOOK_H - CRATE / 2 - (STACK_TOP_Y + CRATE / 2);
const CABLE_BELT = TIP_Y - HOOK_H - CRATE / 2 - (BELT_Y + CRATE / 2);
const CYCLE = 6.4;
const seg = (c, a, b) => clamp((c - a) / (b - a), 0, 1);

export function buildActivity(ctx) {
  const { dept } = ctx;
  const g = new THREE.Group();
  const iron = mat(C.iron, IRON);
  const accent = mat(dept.accent, { roughness: 0.6 });
  const wood = mat(C.wood, { roughness: 0.8 });
  const brass = mat(C.brass, { roughness: 0.3 });

  /* 1: crane base, mast, boom, cable, hook, warning lamp */
  cyl(0.45, 0.5, 0.4, iron, { x: BASE_X, y: 0, z: BASE_Z, parent: g });
  cyl(0.15, 0.15, 2.6, accent, { x: BASE_X, y: 0.4, z: BASE_Z, seg: 12, parent: g });
  const pivot = new THREE.Group();
  pivot.position.set(BASE_X, 3.0, BASE_Z);
  g.add(pivot);
  const tiltG = new THREE.Group();
  tiltG.rotation.z = -BOOM_TILT;
  pivot.add(tiltG);
  box(BOOM_LEN, 0.16, 0.16, accent, { x: BOOM_LEN / 2, y: -0.08, parent: tiltG });
  box(0.5, 0.3, 0.3, iron, { x: -0.3, y: -0.15, parent: tiltG });
  const hang = new THREE.Group();
  g.add(hang);
  const cable = cyl(0.02, 0.02, 1, iron, { y: -0.5, seg: 6, parent: hang, castShadow: false });
  const hook = new THREE.Group();
  hang.add(hook);
  box(0.2, HOOK_H, 0.1, brass, { y: -HOOK_H, parent: hook, castShadow: false });
  const warnMat = glow(C.salmon, 0);
  sphere(0.09, warnMat, { x: BASE_X, y: 3.1, z: BASE_Z, parent: g, castShadow: false });

  /* 2: lever stand */
  box(0.5, 0.8, 0.4, iron, { x: 2.5, y: 0, z: 3.1, parent: g });
  const lever = new THREE.Group();
  lever.position.set(2.5, 0.8, 3.1);
  g.add(lever);
  cyl(0.04, 0.04, 0.6, iron, { seg: 8, parent: lever, castShadow: false });
  sphere(0.09, accent, { y: 0.6, parent: lever, castShadow: false });

  /* 3: pallet and crates */
  box(1.2, 0.15, 1.0, wood, { x: PALLET_X, y: 0, z: PALLET_Z, parent: g });
  const crateT = (c, cw, ch) => {
    c.fillStyle = C.wood; c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#6B4A2B'; c.fillRect(0, 0, cw, 6); c.fillRect(0, ch - 6, cw, 6); c.fillRect(0, 0, 6, ch); c.fillRect(cw - 6, 0, 6, ch);
    c.fillStyle = C.white; c.fillRect(cw * 0.3, ch * 0.28, cw * 0.4, ch * 0.12); c.fillRect(cw * 0.44, ch * 0.28, cw * 0.12, ch * 0.46);
  };
  function crate(parent) {
    const cg = new THREE.Group();
    box(CRATE, CRATE, CRATE, wood, { y: -CRATE / 2, parent: cg });
    sign(0.36, 0.36, C.wood, crateT, { z: CRATE / 2 + 0.005, parent: cg });
    parent.add(cg);
    return cg;
  }
  const fixedA = crate(g); fixedA.position.set(PALLET_X - 0.25, 0.15 + CRATE / 2, PALLET_Z);
  const fixedB = crate(g); fixedB.position.set(PALLET_X + 0.25, 0.15 + CRATE / 2, PALLET_Z);
  const mover = crate(g);
  const HOME = new THREE.Vector3(PALLET_X, STACK_TOP_Y + CRATE / 2, PALLET_Z);
  mover.position.copy(HOME);

  /* 4: conveyor with a scrolling belt and a portal lamp at the east end */
  box(2.2, 0.35, 0.6, iron, { x: 2.7, y: 0, z: BELT_Z, parent: g });
  const beltTex = tex(256, 64, (c, cw, ch) => {
    c.fillStyle = C.ink; c.fillRect(0, 0, cw, ch);
    c.fillStyle = C.white; for (let i = 0; i < 6; i++) c.fillRect(Math.round(i * cw / 6), 0, 5, ch);
  });
  let beltMat;
  if (beltTex) { beltTex.wrapS = THREE.RepeatWrapping; beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }); }
  else beltMat = mat(C.ink, { roughness: 0.9 });
  plane(2.2, 0.5, beltMat, { x: 2.7, y: 0.36, z: BELT_Z, rx: -Math.PI / 2, parent: g });
  box(0.15, 1.6, 0.15, iron, { x: BELT_X1, y: 0, z: BELT_Z - 0.35, parent: g, castShadow: false });
  box(0.15, 1.6, 0.15, iron, { x: BELT_X1, y: 0, z: BELT_Z + 0.35, parent: g, castShadow: false });
  box(0.15, 0.12, 0.85, iron, { x: BELT_X1, y: 1.6, z: BELT_Z, parent: g, castShadow: false });
  const lampMat = glow(C.green, 0.3);
  sphere(0.1, lampMat, { x: BELT_X1, y: 1.5, z: BELT_Z, parent: g, castShadow: false });

  /* 5: barrels */
  cyl(0.25, 0.25, 0.7, accent, { x: 3.6, y: 0, z: 1.8, seg: 16, parent: g });
  cyl(0.25, 0.25, 0.7, accent, { x: 3.25, y: 0, z: 2.15, seg: 16, parent: g });

  const anchor = new THREE.Vector3(3.1, 0, 3.1);
  const YAW = -Math.PI / 2;

  /* state, eased toward the timeline so idle settles smoothly */
  let yaw = 0, len = CABLE_UP, leverT = 0, wasWorking = false, lampI = 0.3;
  let carried = false, riding = false;

  function placeHang() {
    pivot.rotation.y = yaw;
    hang.position.set(BASE_X + BOOM_R * Math.cos(yaw), TIP_Y, BASE_Z - BOOM_R * Math.sin(yaw));
    cable.scale.y = len;
    cable.position.y = -len / 2;
    hook.position.y = -len;
  }

  function update(dt, time, phase, alien, active) {
    const r = ramp(nightS);
    const k = 1 - Math.exp(-5 * dt);
    if (active && !wasWorking) { carried = false; riding = false; }
    wasWorking = active;

    let yawT = 0, lenT = CABLE_UP, leverTarget = 0, lampT = 0.2 + 0.4 * r, beltSpeed = 0;
    let moverScale = 1;
    if (active) {
      const c = phase.t % CYCLE;
      if (c < 1.0) { yawT = YAW_PALLET * easeInOut(seg(c, 0, 1.0)); carried = false; riding = false; }
      else if (c < 1.8) { yawT = YAW_PALLET; lenT = lerp(CABLE_UP, CABLE_GRAB, easeInOut(seg(c, 1.0, 1.8))); leverTarget = -0.5; }
      else if (c < 2.0) { yawT = YAW_PALLET; lenT = CABLE_GRAB; if (c > 1.9) carried = true; }
      else if (c < 2.6) { yawT = YAW_PALLET; lenT = lerp(CABLE_GRAB, CABLE_UP, easeInOut(seg(c, 2.0, 2.6))); carried = true; leverTarget = 0.5; }
      else if (c < 3.2) { yawT = lerp(YAW_PALLET, YAW_BELT, easeInOut(seg(c, 2.6, 3.2))); carried = true; }
      else if (c < 3.7) { yawT = YAW_BELT; lenT = lerp(CABLE_UP, CABLE_BELT, easeInOut(seg(c, 3.2, 3.7))); carried = true; leverTarget = -0.5; }
      else if (c < 5.3) {
        if (carried) { carried = false; riding = true; }
        lenT = lerp(CABLE_BELT, CABLE_UP, easeInOut(seg(c, 3.7, 4.3)));
        if (c < 4.3) leverTarget = 0.5;
        yawT = lerp(YAW_BELT, 0, easeInOut(seg(c, 4.3, 5.3)));
        const u = seg(c, 3.7, 5.3);
        mover.position.set(lerp(BELT_X0, BELT_X1, u), BELT_Y + CRATE / 2, BELT_Z);
        beltSpeed = 0.8;
        if (u > 0.85) lampT = 1.0;
      }
      else if (c < 5.6) { riding = true; moverScale = 1 - seg(c, 5.3, 5.6); mover.position.set(BELT_X1, BELT_Y + CRATE / 2 * moverScale, BELT_Z); lampT = 1.0; }
      else { riding = false; carried = false; }
      warnMat.emissiveIntensity = Math.sin(TAU * time) > 0 ? 1.5 : 0.1;
    } else {
      riding = false; carried = false;
      warnMat.emissiveIntensity = 0;
    }

    yaw += (yawT - yaw) * (active ? 1 : k);
    len += (lenT - len) * (active ? 1 : k);
    placeHang();

    leverT += (leverTarget - leverT) * (1 - Math.exp(-8 * dt));
    lever.rotation.z = leverT;

    if (carried) {
      mover.position.set(hang.position.x, TIP_Y - len - HOOK_H - CRATE / 2, hang.position.z);
      mover.scale.set(1, 1, 1);
    } else if (riding) {
      mover.scale.set(moverScale, moverScale, moverScale);
      mover.visible = moverScale > 0.01;
    } else {
      mover.visible = true;
      mover.scale.set(1, 1, 1);
      if (active) mover.position.copy(HOME);
      else mover.position.lerp(HOME, k);
    }

    if (beltTex && beltSpeed > 0) beltTex.offset.x -= beltSpeed * dt / 2.2;
    lampI += (lampT - lampI) * (1 - Math.exp(-8 * dt));
    lampMat.emissiveIntensity = lampI;

    if (alien && alien.group) alien.group.rotation.y = YAW;
  }

  placeHang();
  return { group: g, anchor, yaw: YAW, pose: 'lever', enter: 'walk', label: activityLabel, update };
}
