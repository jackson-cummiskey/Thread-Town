/* Marketing: gabled studio with a billboard on stilts (building) and a half court where the team shoots
   campaign hoops (activity). Local coordinates per docs/CONTRACT_V2.md: the building origin is the footprint's
   north-west corner at ground level, x runs east 0..10, z runs south 0..6, the front face is z = 6.
   The station origin is its north-west corner, 4 by 4, with the stub path to the east (left-side station).
   The activity writes ctx.b.billboardFill (0..1) and the building repaints its poster from it once per basket. */
import * as THREE from 'three';
import { mat, glass, glow, box, cyl, cone, sphere, torus, plane, gableRoof, pointLight, lerp, clamp, canvasTex, decal } from './common.js';

export const id = 'marketing';
export const activityLabel = 'Shooting campaign hoops';

const TAU = Math.PI * 2;
const C = {
  plinth: '#CFC6B6', iron: '#2E3E50', trim: '#F8F6F0', brass: '#F6D463', bulb: '#FFF1C9', paper: '#E8E2D5',
  navy: '#002D4F', aqua: '#75CCD0', salmon: '#E7706F', white: '#FFFFFF', silver: '#E2E9EE', ink: '#0E1B2E',
};
const ramp = s => clamp((s - 0.25) / 0.75, 0, 1);
const hasDoc = () => typeof document !== 'undefined';
function tex(w, h, draw) { return hasDoc() ? canvasTex(w, h, draw) : null; }
function repaint(t, draw) { if (!t) return; const c = t.image; draw(c.getContext('2d'), c.width, c.height); t.needsUpdate = true; }
function loadFonts(cb) { if (hasDoc() && document.fonts && document.fonts.load) document.fonts.load('600 40px Kanit').then(cb).catch(() => {}); }
/* Framed window centered at (x, y, z) facing +z, rotated by ry about its center. */
function win(parent, glassMat, frameMat, x, y, z, w, h, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0;
  box(w + 0.12, h + 0.12, 0.08, frameMat, { y: -(h + 0.12) / 2, z: -0.02, parent: g, castShadow: false });
  box(w, h, 0.1, glassMat, { y: -h / 2, z: 0, parent: g, castShadow: false });
  parent.add(g);
  return g;
}
/* The campaign poster: paper with a faint sketch, painted up to fill (0..1) from the left. */
function paintPoster(g, w, h, fill, accent) {
  g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
  g.fillStyle = '#D9D1C2'; g.font = `600 ${Math.round(h * 0.3)}px Kanit, Inter, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText('Say hello to Thread', w * 0.06, h * 0.42);
  if (fill > 0) {
    g.save(); g.beginPath(); g.rect(0, 0, w * fill, h); g.clip();
    g.fillStyle = C.white; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.aqua; g.lineWidth = h * 0.13; g.lineCap = 'round'; g.beginPath();
    g.moveTo(-w * 0.05, h * 0.8); g.quadraticCurveTo(w * 0.5, h * 1.08, w * 1.05, h * 0.58); g.stroke();
    g.fillStyle = C.salmon; g.beginPath(); g.arc(w * 0.86, h * 0.3, h * 0.15, 0, TAU); g.fill();
    g.fillStyle = accent; g.fillRect(w * 0.06, h * 0.64, w * 0.3, h * 0.05);
    g.fillStyle = C.navy; g.fillText('Say hello to Thread', w * 0.06, h * 0.42);
    g.restore();
    if (fill < 1) { g.fillStyle = C.plinth; g.fillRect(w * fill - h * 0.012, 0, h * 0.024, h); }
  }
}
function paintScore(g, w, h, goals) {
  g.fillStyle = C.navy; g.fillRect(0, 0, w, h);
  g.fillStyle = C.silver; g.font = `500 ${Math.round(h * 0.22)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Goals', w / 2, h * 0.2);
  g.fillStyle = C.aqua; g.font = `700 ${Math.round(h * 0.5)}px Kanit, Inter, sans-serif`;
  g.fillText(`${String(goals).padStart(2, '0')} of 12`, w / 2, h * 0.62);
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
  const knob = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  const glassMat = glass();
  const doorX = b.door.x - b.x + 1; // 5 for this footprint
  if (b.billboardFill === undefined) b.billboardFill = 0;

  // 1. Plinth.
  box(10.0, 0.14, 6.0, plinth, { x: 5, y: 0, z: 3, parent: group });

  // 2. Studio with a lime gable roof, skylight on the north slope, ridge cap.
  box(9.4, 2.6, 5.4, wall, { x: 5, y: 0.14, z: 3.0, radius: 0.06, parent: group });
  gableRoof(10.0, 6.0, 1.4, roof, { x: 5, y: 2.74, z: 3.0, parent: group });
  const slope = Math.atan(1.4 / 3.0);
  const sky = plane(6.0, 1.4, glassMat, { x: 5, y: 2.74 + 0.7 + 0.03 * Math.cos(slope), z: 1.5 - 0.03 * Math.sin(slope), parent: group });
  sky.rotation.x = -Math.PI / 2 - slope;
  box(10.0, 0.08, 0.2, trim, { x: 5, y: 4.10, z: 3.0, parent: group, castShadow: false });

  // 3. Half-painted mural on the east third of the south face.
  const muralTex = tex(512, 366, (g, w, h) => {
    g.fillStyle = dept.wall; g.fillRect(0, 0, w, h);
    const cols = [dept.accent, C.salmon, C.aqua, C.white, dept.accent, C.salmon];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[i]; g.beginPath();
      const x0 = -80 + i * 110; g.moveTo(x0, h); g.lineTo(x0 + 110, h); g.lineTo(x0 + 240, 0); g.lineTo(x0 + 130, 0); g.closePath(); g.fill();
    }
    g.fillStyle = dept.wall; g.fillRect(w * 0.62, 0, w * 0.14, h); // the roller stripe still missing
    g.fillStyle = C.navy; g.fillRect(w * 0.1, h * 0.72, w * 0.45, h * 0.1);
  });
  if (muralTex) group.add(decal(2.8, 2.0, muralTex, { x: 8.0, y: 1.3, z: 5.75 }));
  else plane(2.8, 2.0, mat(C.salmon), { x: 8.0, y: 1.3, z: 5.75, parent: group });

  // 4. Striped canopy across the west two thirds.
  const stripeTex = tex(256, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? C.white : dept.accent; g.fillRect((i * w) / 8, 0, w / 8 + 1, h); } });
  const canopyMat = stripeTex ? new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.92, side: THREE.DoubleSide }) : mat(dept.accent, { roughness: 0.92 });
  box(6.4, 0.06, 1.0, canopyMat, { x: 3.2, y: 2.2, z: 6.0, rx: 0.3, parent: group });
  box(6.4, 0.14, 0.03, canopyMat, { x: 3.2, y: 1.92, z: 6.48, parent: group, castShadow: false });
  cyl(0.04, 0.04, 2.05, iron, { x: 0.6, y: 0.14, z: 6.45, seg: 8, parent: group });
  cyl(0.04, 0.04, 2.05, iron, { x: 5.8, y: 0.14, z: 6.45, seg: 8, parent: group });

  // 5. Billboard on stilts with the campaign poster and three spotlights.
  box(0.2, 3.6, 0.2, iron, { x: 2.5, y: 2.74, z: 1.5, parent: group });
  box(0.2, 3.6, 0.2, iron, { x: 7.5, y: 2.74, z: 1.5, parent: group });
  box(5.4, 2.4, 0.12, trim, { x: 5, y: 4.4, z: 1.5, parent: group });
  const posterTex = tex(1024, 456, (g, w, h) => paintPoster(g, w, h, b.billboardFill, dept.accent));
  let poster = null;
  if (posterTex) { poster = decal(5.2, 2.2, posterTex, { x: 5, y: 5.6, z: 1.57 }); group.add(poster); }
  else plane(5.2, 2.2, mat(C.paper), { x: 5, y: 5.6, z: 1.57, parent: group });
  loadFonts(() => repaint(posterTex, (g, w, h) => paintPoster(g, w, h, b.billboardFill, dept.accent)));
  box(5.0, 0.06, 0.06, iron, { x: 5, y: 6.85, z: 1.9, parent: group, castShadow: false });
  const lensMat = glow(C.bulb, 0.3);
  for (const x of [3.3, 5.0, 6.7]) {
    box(0.06, 0.06, 0.4, iron, { x, y: 6.85, z: 1.7, parent: group, castShadow: false });
    const lamp = cyl(0.08, 0.08, 0.25, iron, { x, y: 6.88, z: 1.95, parent: group, castShadow: false });
    lamp.rotation.x = -0.9;
    sphere(0.06, lensMat, { x, y: 6.9, z: 1.8, parent: group, castShadow: false });
  }

  // 6. Balloon bunches on the canopy posts.
  const balloonCols = [C.salmon, C.aqua, C.brass, dept.accent, C.white];
  const balloonMats = balloonCols.map(c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.4, emissive: new THREE.Color(c), emissiveIntensity: 0 }));
  const stringMat = mat(C.iron, { roughness: 0.9 });
  const balloons = [];
  function bunch(x0, z0, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, rr = n > 4 ? 0.34 : 0.26;
      const bx = x0 + rr * Math.cos(a), bz = z0 + rr * 0.6 * Math.sin(a), by = 2.2 + 1.2 + 0.15 * Math.sin(i * 1.7);
      const g = new THREE.Group(); g.position.set(bx, by, bz); group.add(g);
      sphere(0.25, balloonMats[i % 5], { parent: g, castShadow: false });
      cyl(0.008, 0.008, by - 2.2, stringMat, { y: -(by - 2.2), seg: 4, parent: g, castShadow: false });
      balloons.push({ g, x: bx, y: by, z: bz, ph: i * 1.1 + x0 });
    }
  }
  bunch(5.8, 5.9, 7); bunch(0.6, 5.9, 4);

  // 7. Windows: shop window in an accent frame, small windows north and on the flanks, the skylight.
  box(3.6, 1.6, 0.06, mat(dept.accent, { roughness: 0.6 }), { x: 2.6, y: 0.5, z: 5.70, parent: group, castShadow: false });
  box(3.4, 1.4, 0.1, glassMat, { x: 2.6, y: 0.6, z: 5.73, parent: group, castShadow: false });
  win(group, glassMat, trim, 3.3, 1.3, 0.3, 0.7, 0.8, Math.PI);
  win(group, glassMat, trim, 6.7, 1.3, 0.3, 0.7, 0.8, Math.PI);
  win(group, glassMat, trim, 0.3, 1.3, 1.8, 0.7, 0.8, -Math.PI / 2);
  win(group, glassMat, trim, 0.3, 1.3, 4.0, 0.7, 0.8, -Math.PI / 2);
  win(group, glassMat, trim, 9.7, 1.3, 1.8, 0.7, 0.8, Math.PI / 2);
  win(group, glassMat, trim, 9.7, 1.3, 4.0, 0.7, 0.8, Math.PI / 2);

  // 8. Door with a porthole, frame and knob; sandwich board by the door.
  box(1.8, 2.05, 0.06, trim, { x: doorX, y: 0.14, z: 5.70, parent: group, castShadow: false });
  box(1.6, 1.9, 0.08, door, { x: doorX, y: 0.14, z: 5.72, parent: group, castShadow: false });
  cyl(0.2, 0.2, 0.1, glassMat, { x: doorX, y: 1.35, z: 5.78, rx: Math.PI / 2, parent: group, castShadow: false });
  sphere(0.05, knob, { x: doorX + 0.55, y: 1.05, z: 5.8, parent: group, castShadow: false });
  const openTex = tex(128, 180, (g, w, h) => { g.fillStyle = C.white; g.fillRect(0, 0, w, h); g.fillStyle = C.navy; g.font = '600 44px Kanit, Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Open', w / 2, h / 2); g.fillStyle = dept.accent; g.fillRect(24, h * 0.7, w - 48, 8); });
  for (const s of [-1, 1]) {
    const p = openTex ? decal(0.5, 0.7, openTex, { x: 6.4, y: 0.49, z: 6.3 + s * 0.1 }) : plane(0.5, 0.7, mat(C.white), { x: 6.4, y: 0.49, z: 6.3 + s * 0.1 });
    p.rotation.x = -s * 0.3; p.rotation.y = s < 0 ? Math.PI : 0; group.add(p);
  }

  // 9. Paint cans with a brush and a rooftop megaphone.
  [C.salmon, C.aqua, C.brass].forEach((c, i) => cyl(0.2, 0.2, 0.3, mat(c, { roughness: 0.6 }), { x: 0.5 + 0.4 * i, y: 0.14, z: 5.5, parent: group }));
  const brush = box(0.05, 0.5, 0.05, mat('#A5774E', { roughness: 0.8 }), { x: 1.35, y: 0.3, z: 5.45, parent: group, castShadow: false });
  brush.rotation.z = -0.5;
  cyl(0.04, 0.04, 0.8, iron, { x: 9.0, y: 3.6, z: 2.4, seg: 8, parent: group });
  cone(0.4, 0.8, mat(C.salmon, { roughness: 0.6 }), { x: 9.3, y: 4.3, z: 2.4, rz: -1.2, parent: group });

  const light = pointLight(C.bulb, 6, 5, { x: 5, y: 6.6, z: 2.4, parent: group });

  const st = { paintedFill: b.billboardFill };
  function update(dt, time, night, active) {
    const r = ramp(night || 0);
    lensMat.emissiveIntensity = 0.3 + 1.2 * r;
    if (poster) poster.material.emissiveIntensity = 0.5 * r;
    for (let i = 0; i < 5; i++) balloonMats[i].emissiveIntensity = 0.15 * r;
    for (let i = 0; i < balloons.length; i++) {
      const o = balloons[i];
      o.g.position.y = o.y + 0.12 * Math.sin(TAU * 0.6 * time + o.ph);
      o.g.position.x = o.x + 0.08 * Math.sin(TAU * 0.3 * time + o.ph * 0.7);
      o.g.position.z = o.z + 0.05 * Math.cos(TAU * 0.25 * time + o.ph);
    }
    // The poster repaints when the activity reports a new fill (at most once per basket).
    if (b.billboardFill !== st.paintedFill) {
      st.paintedFill = b.billboardFill;
      repaint(posterTex, (g, w, h) => paintPoster(g, w, h, st.paintedFill, dept.accent));
    }
  }
  return { group, glass: [glassMat], lights: [light], update };
}

export function buildActivity(ctx) {
  const { b, dept } = ctx;
  const group = new THREE.Group();
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const salmon = mat(C.salmon, { roughness: 0.6 });
  if (b.billboardFill === undefined) b.billboardFill = 0;

  // 1. Half court with painted lines.
  const courtTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = C.plinth; g.fillRect(0, 0, w, h);
    const u = w / 3.8; g.lineWidth = 6; g.strokeStyle = C.white;
    g.strokeRect(w / 2 - 0.8 * u, 0, 1.6 * u, 1.8 * u);
    g.beginPath(); g.arc(w / 2, 1.8 * u, 0.9 * u, 0, Math.PI); g.stroke();
    g.strokeStyle = dept.accent; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, 0.35 * u, 2.4 * u, 0.15, Math.PI - 0.15); g.stroke();
    g.fillStyle = dept.accent; g.globalAlpha = 0.35; g.fillRect(w / 2 - 0.8 * u, 0, 1.6 * u, 1.8 * u); g.globalAlpha = 1;
  });
  const courtMat = courtTex ? new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.9 }) : mat(C.plinth, { roughness: 0.9 });
  plane(3.8, 3.8, courtMat, { x: 2.0, y: 0.01, z: 2.0, rx: -Math.PI / 2, parent: group });

  // 2. Hoop: pole, backboard with a target square, rim, net.
  cyl(0.08, 0.08, 3.0, iron, { x: 2.0, y: 0, z: 0.5, parent: group });
  box(0.1, 0.35, 0.1, iron, { x: 2.0, y: 2.95, z: 0.5, parent: group, castShadow: false });
  box(1.6, 1.0, 0.06, trim, { x: 2.0, y: 2.1, z: 0.55, parent: group });
  const tgt = mat(dept.accent, { roughness: 0.6 });
  box(0.5, 0.04, 0.02, tgt, { x: 2.0, y: 2.3, z: 0.59, parent: group, castShadow: false });
  box(0.5, 0.04, 0.02, tgt, { x: 2.0, y: 2.66, z: 0.59, parent: group, castShadow: false });
  box(0.04, 0.4, 0.02, tgt, { x: 1.77, y: 2.3, z: 0.59, parent: group, castShadow: false });
  box(0.04, 0.4, 0.02, tgt, { x: 2.23, y: 2.3, z: 0.59, parent: group, castShadow: false });
  const rim = new THREE.Group(); rim.position.set(2.0, 2.3, 0.85); group.add(rim);
  torus(0.3, 0.03, salmon, { rx: Math.PI / 2, parent: rim, castShadow: false });
  box(0.1, 0.04, 0.3, salmon, { y: -0.02, z: -0.15, parent: rim, castShadow: false });
  const net = new THREE.Group(); rim.add(net);
  const netMat = mat(C.white, { roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const s = cyl(0.01, 0.01, 0.4, netMat, { x: 0.27 * Math.cos(a), y: -0.4, z: 0.27 * Math.sin(a), seg: 4, parent: net, castShadow: false });
    s.rotation.z = 0.2 * Math.cos(a); s.rotation.x = -0.2 * Math.sin(a);
  }

  // 3. Scoreboard above the backboard.
  box(1.4, 0.7, 0.1, mat(C.navy, { roughness: 0.7 }), { x: 2.0, y: 3.2, z: 0.5, parent: group });
  const scoreTex = tex(512, 256, (g, w, h) => paintScore(g, w, h, 0));
  let score = null;
  if (scoreTex) { score = decal(1.3, 0.6, scoreTex, { x: 2.0, y: 3.55, z: 0.56, emissive: 0.6 }); group.add(score); }
  else { score = plane(1.3, 0.6, glow(C.aqua, 0.6), { x: 2.0, y: 3.55, z: 0.56, parent: group }); }
  loadFonts(() => repaint(scoreTex, (g, w, h) => paintScore(g, w, h, st.goals)));

  // 4. Ball rack with three spares, and the ball in play.
  box(0.8, 1.0, 0.4, iron, { x: 3.5, y: 0, z: 3.3, parent: group });
  for (let i = 0; i < 3; i++) sphere(0.16, salmon, { x: 3.26 + 0.24 * i, y: 1.16, z: 3.3, parent: group });
  const ball = new THREE.Group(); group.add(ball);
  sphere(0.16, salmon, { parent: ball });
  const seam = mat(C.navy, { roughness: 0.6 });
  torus(0.16, 0.012, seam, { parent: ball, castShadow: false });
  torus(0.16, 0.012, seam, { ry: Math.PI / 2, parent: ball, castShadow: false });
  const RACK = { x: 3.5, y: 1.16, z: 3.0 };
  ball.position.set(RACK.x, RACK.y, RACK.z);

  // 5. Campaign easel whose poster fills as goals land.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    const leg = cyl(0.03, 0.03, 1.4, mat('#A5774E', { roughness: 0.8 }), { x: 0.5 + 0.22 * Math.sin(a), y: 0, z: 1.0 + 0.22 * Math.cos(a), seg: 6, parent: group });
    leg.rotation.x = 0.16 * Math.cos(a); leg.rotation.z = -0.16 * Math.sin(a);
  }
  const easelTex = tex(256, 312, (g, w, h) => paintPoster(g, w, h, 0, dept.accent));
  let easel = null;
  if (easelTex) { easel = decal(0.9, 1.1, easelTex, { x: 0.5, y: 0.95, z: 1.12 }); easel.rotation.x = -0.12; group.add(easel); }
  else plane(0.9, 1.1, mat(C.paper), { x: 0.5, y: 0.95, z: 1.12, parent: group });

  // 6. Cheer pennants.
  cyl(0.03, 0.03, 1.6, iron, { x: 3.6, y: 0, z: 0.5, seg: 6, parent: group });
  const pennants = [];
  const penMats = [mat(dept.accent, { roughness: 0.8, doubleSide: true }), mat(C.salmon, { roughness: 0.8, doubleSide: true })];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group(); g.position.set(3.6, 1.5 - 0.5 * i, 0.5); group.add(g);
    plane(0.3, 0.5, penMats[i], { x: 0.17, y: -0.25, parent: g });
    pennants.push(g);
  }

  // 7. Confetti pool.
  const confMats = [salmon, mat(C.aqua, { roughness: 0.8, doubleSide: true }), mat(dept.accent, { roughness: 0.8, doubleSide: true })];
  const confetti = [];
  for (let i = 0; i < 8; i++) {
    const p = plane(0.09, 0.13, confMats[i % 3], { parent: group });
    p.visible = false;
    confetti.push({ m: p, vx: 0, vy: 0, vz: 0, life: 0 });
  }

  const START = { x: 2.0, y: 1.1, z: 2.6 }, RIMC = { x: 2.0, y: 2.3, z: 0.85 }, HAND_Z = 2.6;
  const G = 6.0;
  const st = {
    goals: 0, throws: 0, lastThrow: null, state: 'rack', t: 0, miss: false, vx: 0, vy: 0, vz: 0, bounce: 0,
    flare: 0, rimBounce: 0, flash: 0, confettiT: 9, penPhase: 0,
  };
  function launch() {
    st.throws++; st.miss = st.throws % 4 === 0;
    st.state = 'fly'; st.t = 0;
    ball.visible = true; ball.position.set(START.x, START.y, START.z);
  }
  function scored() {
    st.goals++;
    st.flash = 1.2;
    repaint(scoreTex, (g, w, h) => paintScore(g, w, h, st.goals));
    const fill = st.goals / 12;
    repaint(easelTex, (g, w, h) => paintPoster(g, w, h, fill, dept.accent));
    b.billboardFill = fill;
    if (st.goals >= 12) {
      st.goals = 0; b.billboardFill = 0;
      repaint(easelTex, (g, w, h) => paintPoster(g, w, h, 0, dept.accent));
      for (let i = 0; i < 8; i++) {
        const c = confetti[i];
        c.m.visible = true; c.m.position.set(1.4 + 0.17 * i, 3.9, 0.6);
        c.vx = (Math.random() - 0.5) * 1.2; c.vy = 1.0 + Math.random() * 0.8; c.vz = 0.3 + Math.random() * 0.6; c.life = 1.5;
      }
    }
  }
  function update(dt, time, phase, alien, active) {
    const working = !!(active && phase && phase.working);
    const t = phase ? phase.t : 0;
    // Throw cycle 1.6 s, release at 0.55: launch when the ball is back in the hands.
    if (working) {
      const idx = Math.floor((t - 0.55) / 1.6);
      if (st.lastThrow !== null && idx > st.lastThrow && st.state === 'hand') launch();
      st.lastThrow = idx;
      if (st.state === 'rack') { st.state = 'hand'; ball.visible = false; }
    } else {
      st.lastThrow = null;
      if (st.state !== 'rack') { st.state = 'rack'; ball.visible = true; ball.position.set(RACK.x, RACK.y, RACK.z); }
    }
    // Ball flight, net drop, bounces and the roll back.
    if (st.state === 'fly') {
      st.t += dt;
      const u = Math.min(1, st.t / 1.0);
      ball.position.x = START.x;
      ball.position.z = lerp(START.z, RIMC.z, u);
      ball.position.y = lerp(START.y, RIMC.y, u) + 4 * 1.3 * u * (1 - u);
      ball.rotation.x -= 6 * dt;
      if (u >= 1) {
        if (st.miss) { st.state = 'fall'; st.vy = Math.sqrt(2 * G * 0.6); st.vz = 1.2; st.vx = (Math.random() - 0.5) * 0.6; st.bounce = 0; st.rimBounce = 0.03; }
        else { st.state = 'net'; st.t = 0; st.flare = 0.3; st.rimBounce = 0.03; scored(); }
      }
    } else if (st.state === 'net') {
      st.t += dt;
      const u = Math.min(1, st.t / 0.3);
      ball.position.y = lerp(RIMC.y, RIMC.y - 0.45, u);
      if (u >= 1) { st.state = 'fall'; st.vy = -1.5; st.vz = 0.6; st.vx = 0; st.bounce = 0; }
    } else if (st.state === 'fall') {
      st.vy -= G * dt;
      ball.position.x += st.vx * dt; ball.position.y += st.vy * dt; ball.position.z += st.vz * dt;
      ball.rotation.x += 4 * dt;
      if (ball.position.y <= 0.16) {
        ball.position.y = 0.16;
        st.bounce++;
        if (st.bounce === 1) st.vy = Math.sqrt(2 * G * 0.4);
        else if (st.bounce === 2) st.vy = Math.sqrt(2 * G * 0.15);
        else { st.state = 'roll'; st.vy = 0; }
        st.vx *= 0.6;
      }
    } else if (st.state === 'roll') {
      ball.position.z += 1.5 * dt;
      ball.position.x += (START.x - ball.position.x) * Math.min(1, dt * 2);
      ball.rotation.x += 1.5 / 0.16 * dt;
      if (ball.position.z >= HAND_Z) { st.state = 'hand'; ball.visible = false; }
    } else if (st.state === 'hand') {
      ball.visible = false;
    }
    if (ball.position.y < 0.16 && st.state !== 'hand') ball.position.y = 0.16;
    // Net flare, rim bounce, scoreboard flash.
    if (st.flare > 0) { st.flare -= dt; const k = 1 + 0.4 * clamp(st.flare / 0.3, 0, 1); net.scale.set(k, 1, k); } else net.scale.set(1, 1, 1);
    if (st.rimBounce > 0) { st.rimBounce -= dt * 0.1; rim.position.y = 2.3 - st.rimBounce * Math.abs(Math.sin(time * 30)); } else rim.position.y = 2.3;
    const scoreTarget = working ? 0.6 : 0.2;
    if (st.flash > 0) st.flash -= dt * 1.5;
    score.material.emissiveIntensity = Math.max(scoreTarget, st.flash > 0 ? 0.6 + st.flash : 0);
    // Pennants flutter at 2 Hz while working and drift at 0.6 Hz when idle.
    st.penPhase += dt * TAU * (working ? 2.0 : 0.6);
    pennants[0].rotation.z = 0.3 * Math.sin(st.penPhase);
    pennants[1].rotation.z = 0.3 * Math.sin(st.penPhase + 1.3);
    // Confetti.
    for (let i = 0; i < 8; i++) {
      const c = confetti[i];
      if (!c.m.visible) continue;
      c.life -= dt; c.vy -= 2.0 * dt;
      c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
      c.m.rotation.x += 4 * dt; c.m.rotation.y += 3 * dt;
      if (c.life <= 0 || c.m.position.y < 0) c.m.visible = false;
    }
  }
  return { group, anchor: new THREE.Vector3(2.0, 0, 3.0), yaw: Math.PI, pose: 'throw', enter: 'walk', label: activityLabel, update };
}
