/* Executive: town hall with a saucer dome, a colonnaded drum, a clock and a six-column portico.
   Activity: podium. The agent gives a speech on a dais; confetti bursts from the banner on every work burst.
   Built per docs/CONTRACT_V2.md (Department modules) and docs/CITY_DESIGN.md (## exec). */
import * as THREE from 'three';
import {
  BRAND, mat, glass, glow, box, cyl, sphere, dome, plane, gableRoof, column, canvasTex, decal, pointLight, rng, clamp,
} from './common.js';

export const id = 'exec';
export const activityLabel = 'Giving a speech at the podium';

const TAU = Math.PI * 2;
const hasDoc = typeof document !== 'undefined';
function tex(w, h, draw) { return hasDoc ? canvasTex(w, h, draw) : null; }
function ramp(night) { return clamp((night - 0.25) / 0.75, 0, 1); }

/* Shared static colors (ART_DIRECTION values). */
const C = { stone: '#CFC6B6', iron: '#2E3E50', brass: '#F6D463', topiary: '#6FA860', split: '#0E2238', bulb: '#FFF1C9', bulbGlow: '#FFE2A0', lamp: '#FFC97A' };

/* One framed window with a sill. face: 's' (+z), 'n' (-z), 'e' (+x), 'w' (-x). (x, y, z) is the window center on the wall plane. */
function win(parent, glassMat, frameMat, sillMat, x, y, z, w, h, face) {
  const nx = face === 'e' ? 1 : face === 'w' ? -1 : 0;
  const nz = face === 's' ? 1 : face === 'n' ? -1 : 0;
  const side = nx !== 0;
  const fw = side ? 0.08 : w + 0.12, fd = side ? w + 0.12 : 0.08;
  const gw = side ? 0.10 : w, gd = side ? w : 0.10;
  box(fw, h + 0.12, fd, frameMat, { x: x + nx * 0.04, y: y - h / 2 - 0.06, z: z + nz * 0.04, parent, castShadow: false });
  box(gw, h, gd, glassMat, { x: x + nx * 0.06, y: y - h / 2, z: z + nz * 0.06, parent, castShadow: false });
  const sw = side ? 0.14 : w + 0.2, sd = side ? w + 0.2 : 0.14;
  box(sw, 0.06, sd, sillMat, { x: x + nx * 0.07, y: y - h / 2 - 0.12, z: z + nz * 0.07, parent, castShadow: false });
}

function drawClock(c2d, w, h) {
  const cx = w / 2, cy = h / 2, r = w * 0.48;
  c2d.clearRect(0, 0, w, h);
  c2d.fillStyle = '#FFFFFF'; c2d.beginPath(); c2d.arc(cx, cy, r, 0, TAU); c2d.fill();
  c2d.strokeStyle = BRAND.navy; c2d.lineWidth = w * 0.03; c2d.beginPath(); c2d.arc(cx, cy, r - w * 0.02, 0, TAU); c2d.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, len = i % 3 === 0 ? w * 0.09 : w * 0.05;
    c2d.lineWidth = i % 3 === 0 ? w * 0.03 : w * 0.015;
    c2d.beginPath();
    c2d.moveTo(cx + Math.cos(a) * (r - w * 0.06), cy + Math.sin(a) * (r - w * 0.06));
    c2d.lineTo(cx + Math.cos(a) * (r - w * 0.06 - len), cy + Math.sin(a) * (r - w * 0.06 - len));
    c2d.stroke();
  }
  c2d.fillStyle = BRAND.navy; c2d.font = `bold ${Math.round(w * 0.14)}px Kanit, Inter, sans-serif`;
  c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
  c2d.fillText('12', cx, cy - r * 0.62); c2d.fillText('3', cx + r * 0.62, cy); c2d.fillText('6', cx, cy + r * 0.62); c2d.fillText('9', cx - r * 0.62, cy);
  const d = new Date(); const hr = (d.getHours() % 12) / 12 + d.getMinutes() / 720, mn = d.getMinutes() / 60;
  c2d.lineCap = 'round';
  c2d.strokeStyle = BRAND.navy; c2d.lineWidth = w * 0.04; c2d.beginPath(); c2d.moveTo(cx, cy);
  c2d.lineTo(cx + Math.sin(hr * TAU) * r * 0.5, cy - Math.cos(hr * TAU) * r * 0.5); c2d.stroke();
  c2d.strokeStyle = BRAND.aqua; c2d.lineWidth = w * 0.03; c2d.beginPath(); c2d.moveTo(cx, cy);
  c2d.lineTo(cx + Math.sin(mn * TAU) * r * 0.74, cy - Math.cos(mn * TAU) * r * 0.74); c2d.stroke();
  c2d.fillStyle = BRAND.navy; c2d.beginPath(); c2d.arc(cx, cy, w * 0.035, 0, TAU); c2d.fill();
}

function drawT(c2d, w, h, bg, fg) {
  c2d.fillStyle = bg; c2d.fillRect(0, 0, w, h);
  c2d.fillStyle = fg; c2d.font = `bold ${Math.round(h * 0.78)}px Kanit, Inter, sans-serif`;
  c2d.textAlign = 'center'; c2d.textBaseline = 'middle'; c2d.fillText('T', w / 2, h * 0.54);
}

export function buildBuilding(ctx) {
  const { b, dept } = ctx;
  const w = b.w, h = b.h;
  const g = new THREE.Group();
  const stone = mat(C.stone, { roughness: 0.9 });
  const wall = mat(dept.wall, { roughness: 0.9 });
  const trim = mat(BRAND.white, { roughness: 0.8 });
  const roof = mat(dept.accent, { roughness: 0.78 });
  const doorMat = mat(dept.accent, { roughness: 0.6 });
  const split = mat(C.split, { roughness: 0.7 });
  const handle = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  const brass = mat(C.brass, { roughness: 0.5 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const topiary = mat(C.topiary, { roughness: 0.9 });
  const glassMat = glass('#AFD6E4');
  const lanternMat = glow(C.bulbGlow, 0);
  const bulbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.bulb), roughness: 0.35, emissive: new THREE.Color(C.bulbGlow), emissiveIntensity: 0.08 });
  bulbMat.userData.envMapIntensity = 0.6;
  const doorX = b.door.x - b.x + 1;   // local x of the door center (6)

  // 1. Plinth and 2. steps (south edge at z 7.6)
  box(w, 0.14, h, stone, { x: w / 2, y: 0, z: h / 2, parent: g });
  box(6.0, 0.14, 0.5, stone, { x: doorX, y: 0, z: 7.35, parent: g });
  box(5.4, 0.14, 0.5, stone, { x: doorX, y: 0.14, z: 7.05, parent: g });
  box(4.8, 0.14, 0.5, stone, { x: doorX, y: 0.28, z: 6.75, parent: g });
  // 3. Main hall
  box(11.4, 3.2, 6.4, wall, { x: 6, y: 0.14, z: 3.5, radius: 0.06, parent: g });
  // 4. Portico: six columns, slab, pediment with tympanum
  for (const cx of [3.0, 4.2, 5.4, 6.6, 7.8, 9.0]) column(0.16, 3.2, trim, { x: cx, y: 0.42, z: 6.75, parent: g });
  box(7.2, 0.3, 1.2, trim, { x: 6, y: 3.6, z: 6.5, parent: g });
  // CONTRACT: gableRoof puts its ridge along x and its triangles at the x ends, so the pediment is built with
  // width and depth swapped and turned a quarter so the triangle faces the camera (+z).
  gableRoof(1.2, 7.2, 0.9, trim, { x: 6, y: 3.9, z: 6.5, ry: Math.PI / 2, parent: g });
  const tympTex = tex(256, 80, (c2d, tw, th) => drawT(c2d, tw, th, BRAND.navy, BRAND.white));
  if (tympTex) decal(2.0, 0.6, tympTex, { x: 6, y: 4.25, z: 7.11, parent: g });
  else plane(2.0, 0.6, mat(BRAND.navy), { x: 6, y: 4.25, z: 7.11, parent: g });
  // 5. Cornice
  box(w, 0.2, h, trim, { x: 6, y: 3.34, z: 3.5, parent: g });
  // 6. Drum with eight small columns
  cyl(2.6, 2.6, 1.0, wall, { x: 6, y: 3.54, z: 3.2, seg: 40, parent: g });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    column(0.08, 1.0, trim, { x: 6 + Math.cos(a) * 2.5, y: 3.54, z: 3.2 + Math.sin(a) * 2.5, parent: g });
  }
  // 7. Dome, lantern, finial (top 7.12)
  const dm = dome(2.6, roof, { x: 6, y: 4.54, z: 3.2, parent: g }); dm.scale.y = 0.75;
  cyl(0.4, 0.4, 0.08, trim, { x: 6, y: 6.45, z: 3.2, parent: g });
  cyl(0.32, 0.32, 0.4, lanternMat, { x: 6, y: 6.5, z: 3.2, parent: g, castShadow: false });
  cyl(0.42, 0.4, 0.1, trim, { x: 6, y: 6.88, z: 3.2, parent: g });
  sphere(0.12, brass, { x: 6, y: 7.0, z: 3.2, parent: g });
  // 8. Clock on the drum's south face (repainted once per minute)
  const clockBody = cyl(0.7, 0.7, 0.08, trim, { rx: Math.PI / 2, parent: g });
  clockBody.position.set(6, 4.3, 5.9);
  const clockTex = tex(256, 256, drawClock);
  let clockMat = null;
  if (clockTex) {
    const face = decal(1.3, 1.3, clockTex, { x: 6, y: 4.3, z: 5.95, parent: g });
    face.material.transparent = true;
    clockMat = face.material;
  }
  // 9. Flagpole and rippling flag
  cyl(0.03, 0.03, 2.2, trim, { x: 10.8, y: 3.34, z: 0.8, parent: g, castShadow: false });
  const flagPivot = new THREE.Group(); flagPivot.position.set(10.8, 5.3, 0.8); g.add(flagPivot);
  const flagMat = mat(BRAND.aqua, { roughness: 0.9, doubleSide: true });
  plane(0.7, 0.45, flagMat, { x: 0.35, parent: flagPivot, castShadow: true });
  // 10. Windows (one glass material)
  for (const x0 of [0.9, 10.0]) for (let i = 0; i < 2; i++) {
    win(g, glassMat, trim, trim, x0 + i * 1.1, 1.35, 6.7, 0.6, 0.9, 's');
    win(g, glassMat, trim, trim, x0 + i * 1.1, 2.6, 6.7, 0.6, 0.6, 's');
  }
  for (let i = 0; i < 8; i++) {
    const x = 1.5 + i * (9 / 7);
    win(g, glassMat, trim, trim, x, 1.35, 0.3, 0.6, 0.9, 'n');
    win(g, glassMat, trim, trim, x, 2.6, 0.3, 0.6, 0.6, 'n');
  }
  for (let i = 0; i < 5; i++) {
    const z = 0.9 + i * 1.15;
    win(g, glassMat, trim, trim, 11.7, 1.35, z, 0.6, 0.9, 'e');
    win(g, glassMat, trim, trim, 11.7, 2.6, z, 0.6, 0.6, 'e');
    win(g, glassMat, trim, trim, 0.3, 1.35, z, 0.6, 0.9, 'w');
    win(g, glassMat, trim, trim, 0.3, 2.6, z, 0.6, 0.6, 'w');
  }
  // 11. Double door, frame, handles, post lamps
  box(1.8, 2.15, 0.06, trim, { x: doorX, y: 0.42, z: 6.70, parent: g, castShadow: false });
  box(1.6, 2.0, 0.08, doorMat, { x: doorX, y: 0.42, z: 6.72, parent: g, castShadow: false });
  box(0.03, 2.0, 0.1, split, { x: doorX, y: 0.42, z: 6.72, parent: g, castShadow: false });
  sphere(0.05, handle, { x: doorX - 0.12, y: 1.42, z: 6.8, parent: g, castShadow: false });
  sphere(0.05, handle, { x: doorX + 0.12, y: 1.42, z: 6.8, parent: g, castShadow: false });
  const lights = [];
  for (const lx of [2.4, 9.6]) {
    cyl(0.04, 0.04, 1.4, iron, { x: lx, y: 0.42, z: 7.0, parent: g, castShadow: false });
    sphere(0.09, bulbMat, { x: lx, y: 1.9, z: 7.0, parent: g, castShadow: false });
    lights.push(pointLight(C.lamp, 6, 5, { x: lx, y: 1.9, z: 7.0, parent: g }));
  }
  // 12. Stone urns with topiary
  for (const ux of [1.2, 10.8]) {
    cyl(0.28, 0.22, 0.5, stone, { x: ux, y: 0.14, z: 6.6, parent: g });
    sphere(0.3, topiary, { x: ux, y: 0.94, z: 6.6, parent: g });
  }

  let lastMinute = -1;
  function update(dt, time, night) {
    const r = ramp(night || 0);
    lanternMat.emissiveIntensity = 1.4 * r;
    bulbMat.emissiveIntensity = 0.08 + 2.4 * r;
    if (clockMat) {
      clockMat.emissiveIntensity = 0.8 * r;
      const m = Math.floor(Date.now() / 60000);
      if (m !== lastMinute) {
        lastMinute = m;
        const img = clockTex.image;
        drawClock(img.getContext('2d'), img.width, img.height);
        clockTex.needsUpdate = true;
      }
    }
    flagPivot.rotation.z = 0.05 * Math.sin(TAU * 2 * time);
    flagPivot.scale.x = 0.975 + 0.025 * Math.sin(TAU * 2 * time + 1.3);
  }
  return { group: g, glass: [glassMat], lights, update };
}

const CONFETTI = 48, SPARKS = 10;
const confettiColors = [BRAND.aqua, BRAND.salmon, '#F6D463', '#FFFFFF'];

export function buildActivity(ctx) {
  const g = new THREE.Group();
  const rand = rng('exec-podium');
  const stone = mat(C.stone, { roughness: 0.9 });
  const navy = mat(BRAND.navy, { roughness: 0.6 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const ink = mat(BRAND.ink, { roughness: 0.7 });
  const ledMat = glow(BRAND.aqua, 0.1);
  const discMat = glow(BRAND.aqua, 0.3);
  const sparkMat = glow('#FFFFFF', 1); sparkMat.transparent = true; sparkMat.opacity = 0;

  // 1. Dais (x 0.1..3.3, z 1.3..3.7)
  box(3.2, 0.3, 2.4, stone, { x: 1.7, y: 0, z: 2.5, parent: g });
  // 2. Podium. CONTRACT: the brief's 1.0 tall podium would hide a 0.9 unit alien from the camera,
  // so the podium is 0.6 tall (top 0.9) and the slanted top and the mic sit at that height.
  box(0.8, 0.6, 0.5, navy, { x: 1.5, y: 0.3, z: 3.2, parent: g });
  const top = box(0.9, 0.06, 0.6, navy, { x: 1.5, y: 0, z: 3.2, parent: g });
  top.position.y = 0.92; top.rotation.x = -0.3;
  const tTex = tex(128, 128, (c2d, tw, th) => drawT(c2d, tw, th, BRAND.navy, BRAND.white));
  if (tTex) decal(0.4, 0.4, tTex, { x: 1.5, y: 0.6, z: 3.46, parent: g });
  // 3. Microphone tilted toward the alien
  const mic = new THREE.Group(); mic.position.set(1.5, 0.9, 3.15); mic.rotation.x = -0.35; g.add(mic);
  cyl(0.02, 0.02, 0.45, iron, { parent: mic, castShadow: false });
  sphere(0.07, ink, { y: 0.47, parent: mic, castShadow: false });
  sphere(0.03, ledMat, { y: 0.47, z: -0.07, parent: mic, castShadow: false });
  // 4. Banner on two poles behind the dais
  for (const px of [0.3, 2.9]) cyl(0.04, 0.04, 2.7, iron, { x: px, y: 0, z: 0.8, parent: g, castShadow: false });
  const bannerTex = tex(512, 216, (c2d, tw, th) => {
    c2d.fillStyle = BRAND.navy; c2d.fillRect(0, 0, tw, th);
    c2d.fillStyle = BRAND.aqua; c2d.fillRect(0, th * 0.78, tw, th * 0.1);
    c2d.fillStyle = BRAND.white; c2d.font = `bold ${Math.round(th * 0.42)}px Kanit, Inter, sans-serif`;
    c2d.textAlign = 'center'; c2d.textBaseline = 'middle'; c2d.fillText('Thread Town', tw / 2, th * 0.42);
  });
  if (bannerTex) decal(2.6, 1.1, bannerTex, { x: 1.6, y: 2.0, z: 0.8, emissive: 0.2, parent: g });
  else plane(2.6, 1.1, navy, { x: 1.6, y: 2.0, z: 0.8, parent: g });
  // 5. Speakers with glowing discs
  const discs = [];
  for (const sx of [0.3, 2.9]) {
    box(0.4, 0.65, 0.35, iron, { x: sx, y: 0.3, z: 3.4, parent: g });
    const d = cyl(0.12, 0.12, 0.02, discMat, { rx: Math.PI / 2, parent: g, castShadow: false });
    d.position.set(sx, 0.65, 3.585); discs.push(d);
  }
  // 6. Confetti pool (hidden when idle)
  const confMats = confettiColors.map(c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), side: THREE.DoubleSide, transparent: true, opacity: 1 }));
  const confGeo = new THREE.PlaneGeometry(0.09, 0.13);
  const confetti = [];
  const cp = new Float32Array(CONFETTI * 3), cv = new Float32Array(CONFETTI * 3), cs = new Float32Array(CONFETTI * 2);
  for (let i = 0; i < CONFETTI; i++) {
    const m = new THREE.Mesh(confGeo, confMats[i % 4]); m.visible = false; m.castShadow = false; m.receiveShadow = false;
    g.add(m); confetti.push(m);
  }
  // 7. Applause sparkles on a ring
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) {
    const a = i / SPARKS * TAU;
    const s = sphere(0.05, sparkMat, { x: 1.6 + Math.cos(a) * 1.6, y: 0.5, z: 2.5 + Math.sin(a) * 1.6, parent: g, castShadow: false, receiveShadow: false });
    sparks.push(s);
  }

  let lastIdx = -1, confLife = -1, sparkAge = 99, side = 1;
  function launch() {
    for (let i = 0; i < CONFETTI; i++) {
      cp[i * 3] = 0.3 + rand() * 2.6; cp[i * 3 + 1] = 2.5; cp[i * 3 + 2] = 0.8;
      cv[i * 3] = (rand() - 0.5) * 1.2; cv[i * 3 + 1] = 1.0 + rand() * 0.4; cv[i * 3 + 2] = (rand() - 0.5) * 1.2;
      cs[i * 2] = (rand() < 0.5 ? -1 : 1) * 4; cs[i * 2 + 1] = (rand() - 0.5) * 8;
      const m = confetti[i]; m.visible = true; m.position.set(cp[i * 3], cp[i * 3 + 1], cp[i * 3 + 2]); m.rotation.set(rand() * TAU, rand() * TAU, 0);
    }
    confLife = 0;
    for (let i = 0; i < confMats.length; i++) confMats[i].opacity = 1;
  }
  function hideConfetti() {
    if (confLife < 0) return;
    confLife = -1;
    for (let i = 0; i < CONFETTI; i++) confetti[i].visible = false;
  }
  function update(dt, time, phase, alien) {
    const on = !!(phase && phase.working);
    if (on) {
      const idx = Math.floor((phase.t - 0.7) / 3.2);
      if (idx !== lastIdx) {
        if (idx > lastIdx) {
          launch(); sparkAge = 0; side = -side;
          if (alien) alien.pointSide = side;
        }
        lastIdx = idx;
      }
      ledMat.emissiveIntensity = 0.7 + 0.3 * Math.sin(TAU * time);
      const ds = 1.09 + 0.09 * Math.sin(TAU * 2 * time);
      discs[0].scale.set(ds, 1, ds); discs[1].scale.set(ds, 1, ds);
    } else {
      lastIdx = -1;
      ledMat.emissiveIntensity += (0.1 - ledMat.emissiveIntensity) * Math.min(1, dt * 6);
      discs[0].scale.set(1, 1, 1); discs[1].scale.set(1, 1, 1);
      hideConfetti();
      sparkAge = 99;
    }
    // Sparkles flash then decay over 0.8 s while scaling 1 to 1.6
    sparkAge += dt;
    const sk = clamp(1 - sparkAge / 0.8, 0, 1);
    sparkMat.opacity = on ? 0.9 * sk : Math.max(0, sparkMat.opacity - dt * 3);
    const ss = 1 + 0.6 * (1 - sk);
    for (let i = 0; i < SPARKS; i++) sparks[i].scale.setScalar(ss);
    // Confetti flight
    if (confLife >= 0) {
      confLife += dt;
      if (confLife > 2.2) { hideConfetti(); }
      else {
        const op = confLife > 1.7 ? (2.2 - confLife) / 0.5 : 1;
        for (let k = 0; k < confMats.length; k++) confMats[k].opacity = op;
        for (let i = 0; i < CONFETTI; i++) {
          cv[i * 3 + 1] -= 2.0 * dt;
          cp[i * 3] += cv[i * 3] * dt; cp[i * 3 + 1] += cv[i * 3 + 1] * dt; cp[i * 3 + 2] += cv[i * 3 + 2] * dt;
          if (cp[i * 3 + 1] < 0.02) { cp[i * 3 + 1] = 0.02; cv[i * 3 + 1] = 0; cv[i * 3] *= 0.9; cv[i * 3 + 2] *= 0.9; }
          const m = confetti[i];
          m.position.set(cp[i * 3], cp[i * 3 + 1], cp[i * 3 + 2]);
          m.rotation.x += cs[i * 2] * dt; m.rotation.y += cs[i * 2 + 1] * dt;
        }
      }
    }
  }
  return { group: g, anchor: new THREE.Vector3(1.5, 0.3, 2.6), yaw: 0, pose: 'point', enter: 'walk', label: activityLabel, update };
}
