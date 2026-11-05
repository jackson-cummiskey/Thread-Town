/* People: hip-roofed community house with a wraparound porch and garden (building) and a swing set where
   the team swings (activity). Local coordinates per docs/CONTRACT_V2.md: the building origin is the footprint's
   north-west corner at ground level, x runs east 0..9, z runs south 0..5, the front face is z = 5.
   The station origin is its north-west corner, 4 by 4, with the stub path to the west (right-side station). */
import * as THREE from 'three';
import { mat, glass, glow, box, cyl, sphere, torus, plane, hipRoof, pointLight, lerp, clamp, canvasTex, decal } from './common.js';

export const id = 'people';
export const activityLabel = 'Swinging with the team';

const TAU = Math.PI * 2;
const C = {
  plinth: '#CFC6B6', iron: '#2E3E50', trim: '#F8F6F0', wood: '#A5774E', woodDark: '#6B4A2B', brass: '#F6D463',
  bulbGlow: '#FFE2A0', lampLight: '#FFC97A', grass: '#8DBF66', hedge: '#6FA860', stem: '#5B8E45', sand: '#E3D5B2',
  chimney: '#8A6F5E', chimneyCap: '#5E4538', smoke: '#F2F2F2', salmon: '#E7706F', aqua: '#75CCD0', white: '#FFFFFF', navy: '#002D4F',
};
const FLOWERS = [C.salmon, C.white, C.brass, C.aqua];
const ramp = s => clamp((s - 0.25) / 0.75, 0, 1);
const hasDoc = () => typeof document !== 'undefined';
function tex(w, h, draw) { return hasDoc() ? canvasTex(w, h, draw) : null; }
/* Framed window centered at (x, y, z) facing +z, rotated by ry about its center. */
function win(parent, glassMat, frameMat, x, y, z, w, h, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0;
  box(w + 0.12, h + 0.12, 0.08, frameMat, { y: -(h + 0.12) / 2, z: -0.02, parent: g, castShadow: false });
  box(w, h, 0.1, glassMat, { y: -h / 2, z: 0, parent: g, castShadow: false });
  parent.add(g);
  return g;
}
function flower(parent, x, z, i, y = 0, r = 0.09) {
  cyl(0.015, 0.015, 0.25, mat(C.stem, { roughness: 0.9 }), { x, y, z, seg: 4, parent, castShadow: false });
  return sphere(r, mat(FLOWERS[i % 4], { roughness: 0.7 }), { x, y: y + 0.27, z, parent, castShadow: false });
}

export function buildBuilding(ctx) {
  const { b, dept } = ctx;
  const group = new THREE.Group();
  const wall = mat(dept.wall, { roughness: 0.9 });
  const roof = mat(dept.accent, { roughness: 0.78 });
  const door = mat(dept.accent, { roughness: 0.6 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const plinth = mat(C.plinth, { roughness: 0.9 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const wood = mat(C.wood, { roughness: 0.8 });
  const woodDark = mat(C.woodDark, { roughness: 0.8 });
  const knob = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  const glassMat = glass();
  const doorX = b.door.x - b.x + 1; // 4 for this footprint

  // 1. Plinth with a garden strip along the south edge.
  box(9.0, 0.12, 5.0, plinth, { x: 4.5, y: 0, z: 2.5, parent: group });
  plane(9.0, 1.2, mat(C.grass, { roughness: 1.0 }), { x: 4.5, y: 0.13, z: 4.4, rx: -Math.PI / 2, parent: group });

  // 2. House, hip roof, two shed dormers, chimney.
  box(6.0, 2.6, 3.6, wall, { x: 4.5, y: 0.12, z: 1.9, radius: 0.06, parent: group });
  hipRoof(7.0, 4.6, 1.3, roof, { x: 4.5, y: 2.72, z: 1.9, ridge: 3.0, parent: group });
  for (const x of [3.0, 6.0]) {
    box(0.9, 0.8, 0.8, wall, { x, y: 2.9, z: 3.0, parent: group });
    box(1.1, 0.08, 1.0, roof, { x, y: 3.72, z: 3.0, rx: 0.35, parent: group });
    win(group, glassMat, trim, x, 3.55, 3.4, 0.5, 0.5, 0);
  }
  box(0.4, 1.0, 0.4, mat(C.chimney, { roughness: 0.95 }), { x: 7.0, y: 3.1, z: 1.2, parent: group });
  box(0.5, 0.08, 0.5, mat(C.chimneyCap, { roughness: 0.95 }), { x: 7.0, y: 4.1, z: 1.2, parent: group, castShadow: false });
  const smoke = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.smoke), transparent: true, opacity: 0.55, depthWrite: false });
    const s = sphere(0.12, m, { x: 7.0, y: 4.2, z: 1.2, parent: group, castShadow: false });
    s.visible = false; smoke.push(s);
  }

  // 3. Wraparound porch: deck with grooves, side deck, roof on posts, railing, steps.
  box(8.2, 0.3, 1.4, wood, { x: 4.5, y: 0.12, z: 4.0, parent: group });
  for (let i = 0; i < 10; i++) box(8.2, 0.01, 0.02, woodDark, { x: 4.5, y: 0.42, z: 3.37 + i * 0.14, parent: group, castShadow: false });
  box(1.2, 0.3, 3.6, wood, { x: 8.1, y: 0.12, z: 1.9, parent: group });
  box(8.4, 0.1, 1.5, trim, { x: 4.5, y: 2.5, z: 4.0, parent: group });
  box(8.4, 0.25, 0.05, trim, { x: 4.5, y: 2.28, z: 4.75, parent: group, castShadow: false });
  for (const x of [0.6, 2.2, 3.4, 5.6, 6.8, 8.4]) cyl(0.06, 0.06, 2.1, trim, { x, y: 0.42, z: 4.6, seg: 10, parent: group });
  for (const cx of [2.0, 7.0]) {
    box(3.2, 0.05, 0.05, trim, { x: cx, y: 1.2, z: 4.6, parent: group, castShadow: false });
    for (let i = 0; i < 12; i++) cyl(0.02, 0.02, 0.8, trim, { x: cx - 1.5 + i * 0.27, y: 0.42, z: 4.6, seg: 4, parent: group, castShadow: false });
  }
  box(1.8, 0.15, 0.4, plinth, { x: doorX, y: 0.27, z: 4.75, parent: group });
  box(1.8, 0.15, 0.4, plinth, { x: doorX, y: 0.12, z: 5.0, parent: group });
  // Porch string lights under the fascia.
  const bulbMat = glow(C.bulbGlow, 0.1);
  for (let i = 0; i < 8; i++) sphere(0.05, bulbMat, { x: 1.0 + i * 1.0, y: 2.2, z: 4.62, parent: group, castShadow: false });

  // 4. Porch furniture: swing bench on chains, rocking chair.
  const porchSwing = new THREE.Group(); porchSwing.position.set(2.0, 2.5, 4.0); group.add(porchSwing);
  for (const dx of [-0.55, 0.55]) cyl(0.01, 0.01, 1.6, iron, { x: dx, y: -1.6, seg: 4, parent: porchSwing, castShadow: false });
  box(1.2, 0.06, 0.4, wood, { y: -1.6, parent: porchSwing });
  box(1.2, 0.06, 0.4, wood, { y: -1.52, z: -0.02, parent: porchSwing, castShadow: false });
  const back = box(1.2, 0.4, 0.05, wood, { y: -1.52, z: -0.2, parent: porchSwing, castShadow: false }); back.rotation.x = -0.15;
  const rocker = new THREE.Group(); rocker.position.set(7.0, 0.42, 4.1); group.add(rocker);
  box(0.5, 0.08, 0.5, wood, { y: 0.3, parent: rocker });
  box(0.5, 0.6, 0.06, wood, { y: 0.38, z: -0.22, parent: rocker, castShadow: false });
  for (const dx of [-0.22, 0.22]) { box(0.04, 0.3, 0.04, wood, { x: dx, y: 0.02, z: 0.2, parent: rocker, castShadow: false }); box(0.04, 0.3, 0.04, wood, { x: dx, y: 0.02, z: -0.2, parent: rocker, castShadow: false }); box(0.04, 0.04, 0.6, woodDark, { x: dx, y: 0, parent: rocker, castShadow: false }); }

  // 5. Door under the porch with fanlight, frame, knob, wreath, mat and welcome sign.
  // CONTRACT: the door is recessed under the porch at local z 3.7; door.x and doorPos are unchanged and the steps bridge to the stub.
  box(1.8, 2.15, 0.06, trim, { x: doorX, y: 0.42, z: 3.69, parent: group, castShadow: false });
  box(1.6, 1.9, 0.08, door, { x: doorX, y: 0.42, z: 3.7, parent: group, castShadow: false });
  box(1.0, 0.2, 0.08, glassMat, { x: doorX, y: 2.34, z: 3.71, parent: group, castShadow: false });
  sphere(0.05, knob, { x: doorX + 0.55, y: 1.35, z: 3.78, parent: group, castShadow: false });
  torus(0.25, 0.05, mat(C.hedge, { roughness: 0.9 }), { x: doorX, y: 1.75, z: 3.78, parent: group, castShadow: false });
  for (let i = 0; i < 3; i++) sphere(0.04, mat(C.salmon, { roughness: 0.6 }), { x: doorX + 0.25 * Math.cos(i * 2.1), y: 1.75 + 0.25 * Math.sin(i * 2.1), z: 3.84, parent: group, castShadow: false });
  plane(1.2, 0.6, mat(C.salmon, { roughness: 0.9 }), { x: doorX, y: 0.425, z: 4.2, rx: -Math.PI / 2, parent: group });
  const welcomeTex = tex(512, 128, (g, w, h) => { g.fillStyle = C.trim; g.fillRect(0, 0, w, h); g.fillStyle = C.navy; g.font = '600 76px Kanit, Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Welcome', w / 2, h / 2 + 4); g.fillStyle = C.aqua; g.fillRect(w * 0.3, h * 0.84, w * 0.4, 8); });
  if (welcomeTex) group.add(decal(1.6, 0.4, welcomeTex, { x: doorX, y: 2.4, z: 4.78 }));

  // 6. Windows: two bay windows with flower boxes, upper windows on the flanks, dormers and fanlight above.
  for (const x of [2.2, 6.8]) {
    win(group, glassMat, trim, x, 1.9, 3.7, 1.1, 1.0, 0);
    box(0.9, 0.18, 0.22, woodDark, { x, y: 0.8, z: 3.82, parent: group, castShadow: false });
    for (let i = 0; i < 4; i++) sphere(0.06, mat(FLOWERS[i], { roughness: 0.7 }), { x: x - 0.3 + 0.2 * i, y: 1.02, z: 3.86, parent: group, castShadow: false });
  }
  win(group, glassMat, trim, 1.5, 2.35, 1.0, 0.6, 0.7, -Math.PI / 2);
  win(group, glassMat, trim, 1.5, 2.35, 2.8, 0.6, 0.7, -Math.PI / 2);
  win(group, glassMat, trim, 7.5, 2.35, 1.0, 0.6, 0.7, Math.PI / 2);
  win(group, glassMat, trim, 7.5, 2.35, 2.8, 0.6, 0.7, Math.PI / 2);

  // 7. Garden: picket fence with a gate, flowers, round bed, birdhouse, mailbox.
  for (const [x0, len] of [[0, 3.2], [5.8, 3.2]]) {
    box(len, 0.04, 0.03, trim, { x: x0 + len / 2, y: 0.33, z: 4.95, parent: group, castShadow: false });
    for (let i = 0; i < 12; i++) box(0.08, 0.5, 0.03, trim, { x: x0 + 0.12 + i * 0.27, y: 0.13, z: 4.95, parent: group, castShadow: false });
  }
  const gate = new THREE.Group(); gate.position.set(3.2, 0.13, 4.95); gate.rotation.y = 0.5; group.add(gate);
  for (let i = 0; i < 3; i++) box(0.08, 0.45, 0.03, trim, { x: 0.08 + i * 0.18, parent: gate, castShadow: false });
  box(0.45, 0.04, 0.03, trim, { x: 0.25, y: 0.2, parent: gate, castShadow: false });
  for (let i = 0; i < 12; i++) flower(group, i < 6 ? 0.35 + i * 0.5 : 6.05 + (i - 6) * 0.5, 4.72 + 0.1 * (i % 2), i, 0.13);
  torus(0.5, 0.08, plinth, { x: 0.8, y: 0.17, z: 1.0, rx: Math.PI / 2, parent: group });
  for (let i = 0; i < 6; i++) flower(group, 0.8 + 0.28 * Math.cos(i * 1.05), 1.0 + 0.28 * Math.sin(i * 1.05), i, 0.12);
  cyl(0.03, 0.03, 1.6, wood, { x: 0.6, y: 0.12, z: 2.6, seg: 6, parent: group });
  box(0.25, 0.3, 0.25, trim, { x: 0.6, y: 1.72, z: 2.6, parent: group, castShadow: false });
  box(0.32, 0.06, 0.32, roof, { x: 0.6, y: 2.02, z: 2.6, parent: group, castShadow: false });
  cyl(0.03, 0.03, 0.9, iron, { x: 5.9, y: 0.12, z: 5.3, seg: 6, parent: group });
  box(0.25, 0.2, 0.4, mat(C.salmon, { roughness: 0.6 }), { x: 5.9, y: 1.02, z: 5.3, parent: group, castShadow: false });

  // 8. Fireflies in the garden strip at night.
  const flyMat = glow(C.brass, 1.0);
  const flies = [];
  for (let i = 0; i < 6; i++) { const s = sphere(0.03, flyMat, { parent: group, castShadow: false }); s.visible = false; flies.push(s); }

  const light = pointLight(C.lampLight, 6, 6, { x: 4.5, y: 2.2, z: 4.0, parent: group });

  function update(dt, time, night, active) {
    const r = ramp(night || 0);
    const on = !!active;
    bulbMat.emissiveIntensity = 0.1 + 1.5 * r;
    porchSwing.rotation.x = 0.12 * Math.sin(TAU * 0.3 * time);
    rocker.rotation.x = 0.08 * Math.sin(TAU * 0.5 * time + 1.0);
    // Chimney smoke only while someone works.
    for (let i = 0; i < 3; i++) {
      const s = smoke[i];
      s.visible = on;
      if (!on) continue;
      const u = ((time / 2.2) + i / 3) % 1;
      s.position.set(7.0 + 0.1 * Math.sin(TAU * 0.5 * time + i), 4.2 + 1.3 * u, 1.2);
      s.scale.setScalar(1 + 1.67 * u);
      s.material.opacity = 0.55 * (1 - u);
    }
    // Fireflies drift on sine paths after dark.
    const fliesOn = r > 0.05;
    for (let i = 0; i < 6; i++) {
      const f = flies[i];
      f.visible = fliesOn;
      if (!fliesOn) continue;
      f.position.set(1.0 + i * 1.4 + 0.3 * Math.sin(TAU * 0.2 * time + i * 1.3), 0.5 + 0.3 * Math.sin(TAU * 0.17 * time + i * 2.0), 4.7 + 0.25 * Math.cos(TAU * 0.13 * time + i));
    }
    flyMat.emissiveIntensity = 0.6 + 0.6 * Math.sin(TAU * 0.5 * time);
  }
  return { group, glass: [glassMat], lights: [light], update };
}

export function buildActivity(ctx) {
  const { dept } = ctx;
  const group = new THREE.Group();
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const wood = mat(C.wood, { roughness: 0.8 });
  const salmon = mat(C.salmon, { roughness: 0.6 });
  const PIVOT_Y = 2.55, CHAIN = 1.9;

  // 1. Swing set: two A-frames and the top bar.
  for (const x of [0.7, 3.1]) for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(x, 0, 2.0 + s * 0.8); leg.rotation.x = -s * 0.3; group.add(leg);
    cyl(0.06, 0.06, 2.7, salmon, { seg: 10, parent: leg });
  }
  cyl(0.06, 0.06, 2.6, mat(dept.accent, { roughness: 0.6 }), { x: 1.9, y: PIVOT_Y - 1.3, z: 2.0, rz: Math.PI / 2, parent: group });
  const capMat = glow(C.bulbGlow, 0.2);
  sphere(0.08, capMat, { x: 0.58, y: PIVOT_Y, z: 2.0, parent: group, castShadow: false });
  sphere(0.08, capMat, { x: 3.22, y: PIVOT_Y, z: 2.0, parent: group, castShadow: false });

  // 2. Two swings: the alien rides the east one, the west one swings empty in counter phase.
  function swing(x) {
    const p = new THREE.Group(); p.position.set(x, PIVOT_Y, 2.0); group.add(p);
    for (const dx of [-0.2, 0.2]) cyl(0.012, 0.012, CHAIN, iron, { x: dx, y: -CHAIN, seg: 4, parent: p, castShadow: false });
    box(0.5, 0.05, 0.25, wood, { y: -CHAIN, parent: p });
    return p;
  }
  const westSwing = swing(1.3), eastSwing = swing(2.5);

  // 3. Slide: ladder, platform, aqua bed with side rails.
  for (const dx of [-0.2, 0.2]) cyl(0.03, 0.03, 1.3, iron, { x: 3.6 + dx, y: 0, z: 0.6, seg: 6, parent: group });
  for (let i = 0; i < 5; i++) box(0.46, 0.03, 0.03, iron, { x: 3.6, y: 0.25 + i * 0.25, z: 0.6, parent: group, castShadow: false });
  box(0.5, 0.05, 0.5, iron, { x: 3.6, y: 1.3, z: 0.75, parent: group });
  const bedMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.aqua), roughness: 0.4, emissive: new THREE.Color(C.aqua), emissiveIntensity: 0 });
  const bed = new THREE.Group(); bed.position.set(3.6, 1.3 - 0.9 * Math.sin(0.6), 0.9 + 0.9 * Math.cos(0.6)); bed.rotation.x = 0.6; group.add(bed);
  box(0.5, 0.04, 1.8, bedMat, { y: -0.02, parent: bed });
  box(0.04, 0.12, 1.8, trim, { x: -0.25, y: 0, parent: bed, castShadow: false });
  box(0.04, 0.12, 1.8, trim, { x: 0.25, y: 0, parent: bed, castShadow: false });

  // 4. Sandbox with a bucket and spade.
  box(1.0, 0.2, 1.0, wood, { x: 0.6, y: 0, z: 3.3, parent: group });
  plane(0.9, 0.9, mat(C.sand, { roughness: 1.0 }), { x: 0.6, y: 0.2, z: 3.3, rx: -Math.PI / 2, parent: group });
  const bucket = cyl(0.1, 0.08, 0.14, salmon, { x: 0.4, y: 0.2, z: 3.2, parent: group, castShadow: false });
  const spade = box(0.03, 0.3, 0.03, iron, { x: 0.8, y: 0.2, z: 3.45, parent: group, castShadow: false }); spade.rotation.z = 0.4;
  box(0.12, 0.1, 0.02, mat(C.aqua, { roughness: 0.6 }), { x: 0.8, y: 0.2, z: 3.45, parent: group, castShadow: false });

  // 5. Flowers along the north edge and a shrub.
  for (let i = 0; i < 8; i++) flower(group, 0.25 + i * 0.3, 0.2, i);
  box(0.6, 0.4, 0.5, mat(C.hedge, { roughness: 0.9 }), { x: 3.5, y: 0, z: 3.6, radius: 0.12, parent: group });

  // 6. Butterflies: wing pairs on lissajous paths over the flowers.
  const wingMats = [mat(C.salmon, { roughness: 0.8, doubleSide: true }), mat(C.brass, { roughness: 0.8, doubleSide: true })];
  const flies = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); group.add(g); g.visible = false;
    const l = plane(0.08, 0.08, wingMats[i % 2], { x: -0.04, parent: g }); l.rotation.x = -Math.PI / 2;
    const r = plane(0.08, 0.08, wingMats[i % 2], { x: 0.04, parent: g }); r.rotation.x = -Math.PI / 2;
    flies.push({ g, l, r, ph: i * 1.7, scatter: 0 });
  }

  // 7. Sparkles and petals.
  const sparkMat = glow(C.white, 1.0);
  const sparks = [];
  for (let i = 0; i < 3; i++) { const s = sphere(0.04, sparkMat, { parent: group, castShadow: false }); s.visible = false; sparks.push({ m: s, vx: 0, vy: 0, vz: 0, life: 0 }); }
  const petals = [];
  const petalMat = mat('#F8D9E0', { roughness: 0.8, doubleSide: true });
  for (let i = 0; i < 6; i++) { const p = plane(0.08, 0.08, petalMat, { parent: group }); p.visible = false; petals.push({ m: p, vx: 0, vy: 0, vz: 0, life: 0 }); }

  const st = { t: 0, A: 0, westA: 0.05, lastBurst: null, pushUntil: -1, lastSin: 0, flash: 0 };
  function burst() {
    st.pushUntil = st.t + 2.2;
    for (let i = 0; i < 3; i++) {
      const s = sparks[i];
      s.m.visible = true; s.m.position.set(2.5 + (i - 1) * 0.2, 1.3, 2.0 + CHAIN * Math.sin(st.A));
      s.vx = (i - 1) * 0.6; s.vy = 1.2; s.vz = (Math.random() - 0.5) * 0.6; s.life = 0.7;
    }
    for (let i = 0; i < 6; i++) {
      const p = petals[i];
      p.m.visible = true; p.m.position.set(3.5 + (Math.random() - 0.5) * 0.4, 0.45, 3.6 + (Math.random() - 0.5) * 0.3);
      p.vx = -0.4 - Math.random() * 0.4; p.vy = 0.3 + Math.random() * 0.3; p.vz = (Math.random() - 0.5) * 0.5; p.life = 1.6;
    }
    for (let i = 0; i < 4; i++) flies[i].scatter = 1;
  }
  function update(dt, time, phase, alien, active) {
    const working = !!(active && phase && phase.working);
    const t = phase ? phase.t : 0;
    st.t += dt;
    if (working) {
      const idx = Math.floor((t - 0.7) / 3.2);
      if (st.lastBurst !== null && idx > st.lastBurst) burst();
      st.lastBurst = idx;
    } else st.lastBurst = null;
    // Amplitude: 0.85 while working (1.0 for one period after a push), decaying exp(-t / 1.5) when idle.
    if (working) {
      const target = st.t < st.pushUntil ? 1.0 : 0.85;
      st.A += (target - st.A) * Math.min(1, dt * 2.5);
    } else st.A *= Math.exp(-dt / 1.5);
    const westTarget = working ? 0.4 : 0.05;
    st.westA += (westTarget - st.westA) * Math.min(1, dt * 1.5);
    const s = Math.sin(TAU * 0.45 * st.t);
    const a = st.A * s;
    eastSwing.rotation.x = a;
    westSwing.rotation.x = -st.westA * s;
    // The alien rides the east seat: pivot plus CHAIN along the pivot's -y, tilted with the chains.
    if (alien && alien.group) {
      alien.group.position.y += CHAIN * (1 - Math.cos(a));
      alien.group.position.z += -CHAIN * Math.sin(a);
      alien.group.rotation.x = a;
      alien.swingPhase = 0.5 + 0.5 * s;
    }
    // Slide bed flashes when the swing hits its front peak (sin crossing from rising to falling, toward +z means a < 0).
    if (working && st.lastSin < -0.98 && s > st.lastSin) st.flash = 0.15;
    st.lastSin = s;
    if (st.flash > 0) st.flash -= dt * 0.5;
    bedMat.emissiveIntensity = Math.max(0, st.flash);
    bucket.rotation.z = 0.1 * Math.sin(TAU * 1.0 * time);
    // Butterflies flutter over the flowers while working, land (hidden) when idle; scatter up after a push.
    for (let i = 0; i < 4; i++) {
      const f = flies[i];
      f.g.visible = working || f.scatter > 0.01;
      if (!f.g.visible) continue;
      f.scatter *= Math.exp(-dt / 0.8);
      f.g.position.set(0.4 + 1.1 * Math.sin(0.7 * time + f.ph) + 1.1, 0.6 + 0.15 * Math.sin(1.3 * time + f.ph) + 0.5 * f.scatter, 0.35 + 0.25 * Math.sin(1.1 * time + f.ph * 2));
      const w = 0.9 * Math.sin(TAU * 6 * time + f.ph);
      f.l.rotation.y = w; f.r.rotation.y = -w;
    }
    for (let i = 0; i < 3; i++) {
      const sp = sparks[i];
      if (!sp.m.visible) continue;
      sp.life -= dt; sp.vy -= 2 * dt;
      sp.m.position.x += sp.vx * dt; sp.m.position.y += sp.vy * dt; sp.m.position.z += sp.vz * dt;
      sp.m.scale.setScalar(Math.max(0.1, sp.life / 0.7) * 1.5);
      if (sp.life <= 0) sp.m.visible = false;
    }
    for (let i = 0; i < 6; i++) {
      const p = petals[i];
      if (!p.m.visible) continue;
      p.life -= dt; p.vy -= 0.4 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.rotation.x += 3 * dt; p.m.rotation.z += 2 * dt;
      if (p.life <= 0 || p.m.position.y < 0) p.m.visible = false;
    }
  }
  return { group, anchor: new THREE.Vector3(2.5, 0.65, 2.0), yaw: 0, pose: 'swing', enter: 'walk', label: activityLabel, update };
}
