/* Compliance: courthouse, a six-column temple on a tall stylobate with a pediment, a blue flat roof and a brass scales emblem.
   Activity: stamp. Papers flow from the inbox (path side, east) under a press that slams on every work burst to the outbox (west).
   Built per docs/CONTRACT_V2.md (Department modules) and docs/CITY_DESIGN.md (## compliance). */
import * as THREE from 'three';
import {
  BRAND, mat, glass, glow, box, cyl, sphere, plane, gableRoof, column, canvasTex, decal, pointLight, rng, clamp,
} from './common.js';

export const id = 'compliance';
export const activityLabel = 'Stamping approvals';

const TAU = Math.PI * 2;
const hasDoc = typeof document !== 'undefined';
function tex(w, h, draw) { return hasDoc ? canvasTex(w, h, draw) : null; }
function ramp(night) { return clamp((night - 0.25) / 0.75, 0, 1); }

const C = { stone: '#CFC6B6', iron: '#2E3E50', brass: '#F6D463', split: '#0E2238', green: '#1F8A5B', paper: '#E8E2D5', wood: '#A5774E', lamp: '#FFE2A0' };

/* One framed window with a sill. face: 's' (+z), 'n' (-z), 'e' (+x), 'w' (-x). (x, y, z) is the window center on the wall plane. */
function win(parent, glassMat, frameMat, x, y, z, w, h, face) {
  const nx = face === 'e' ? 1 : face === 'w' ? -1 : 0;
  const nz = face === 's' ? 1 : face === 'n' ? -1 : 0;
  const side = nx !== 0;
  box(side ? 0.08 : w + 0.12, h + 0.12, side ? w + 0.12 : 0.08, frameMat, { x: x + nx * 0.04, y: y - h / 2 - 0.06, z: z + nz * 0.04, parent, castShadow: false });
  box(side ? 0.10 : w, h, side ? w : 0.10, glassMat, { x: x + nx * 0.06, y: y - h / 2, z: z + nz * 0.06, parent, castShadow: false });
  box(side ? 0.14 : w + 0.2, 0.06, side ? w + 0.2 : 0.14, frameMat, { x: x + nx * 0.07, y: y - h / 2 - 0.12, z: z + nz * 0.07, parent, castShadow: false });
}

function drawLabel(c2d, w, h, bg, fg, text, size = 0.6) {
  c2d.fillStyle = bg; c2d.fillRect(0, 0, w, h);
  c2d.fillStyle = fg; c2d.font = `bold ${Math.round(h * size)}px Kanit, Inter, sans-serif`;
  c2d.textAlign = 'center'; c2d.textBaseline = 'middle'; c2d.fillText(text, w / 2, h * 0.54);
}

export function buildBuilding(ctx) {
  const { b, dept } = ctx;
  const g = new THREE.Group();
  const stone = mat(C.stone, { roughness: 0.9 });
  const wall = mat(dept.wall, { roughness: 0.9 });
  const trim = mat(BRAND.white, { roughness: 0.8 });
  const roof = mat(dept.accent, { roughness: 0.78 });
  const doorMat = mat(dept.accent, { roughness: 0.6 });
  const split = mat(C.split, { roughness: 0.7 });
  const handle = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  const glassMat = glass('#AFD6E4');
  const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.brass), roughness: 0.5, emissive: new THREE.Color(C.brass), emissiveIntensity: 0 });
  brass.userData.envMapIntensity = 0.25;
  // CONTRACT: the door is recessed behind the column line (cella face z 4.9); door.x and doorPos are unchanged
  // and the three steps bridge the stylobate to the stub.
  const doorX = b.door.x - b.x + 1;   // local x of the door center (5)

  // 1. Plinth and steps (south edge 6.525)
  box(10, 0.14, 6, stone, { x: 5, y: 0, z: 3, parent: g });
  box(5.0, 0.14, 0.45, stone, { x: doorX, y: 0, z: 6.3, parent: g });
  box(5.0, 0.14, 0.45, stone, { x: doorX, y: 0.14, z: 6.1, parent: g });
  box(5.0, 0.14, 0.45, stone, { x: doorX, y: 0.28, z: 5.9, parent: g });
  // 2. Stylobate and 3. cella
  box(9.6, 0.5, 5.6, stone, { x: 5, y: 0.14, z: 3.0, parent: g });
  box(8.4, 3.4, 4.6, wall, { x: 5, y: 0.64, z: 2.6, radius: 0.05, parent: g });
  // 4. Six columns
  for (const cx of [1.3, 2.8, 4.3, 5.7, 7.2, 8.7]) column(0.2, 3.4, trim, { x: cx, y: 0.64, z: 5.3, parent: g });
  // 5. Entablature with a blue frieze band
  box(9.6, 0.45, 5.8, trim, { x: 5, y: 4.04, z: 3.0, parent: g });
  box(9.62, 0.14, 5.82, roof, { x: 5, y: 4.2, z: 3.0, parent: g, castShadow: false });
  // 6. Pediment. CONTRACT: gableRoof puts its ridge along x and its triangles at the x ends, so the pediment is
  // built with width and depth swapped and turned a quarter so the triangle faces the camera (+z).
  gableRoof(0.8, 9.6, 1.3, trim, { x: 5, y: 4.49, z: 5.6, ry: Math.PI / 2, parent: g });
  const tympTex = tex(512, 192, (c2d, w, h) => {
    c2d.clearRect(0, 0, w, h);
    c2d.strokeStyle = dept.accent; c2d.fillStyle = dept.accent; c2d.lineWidth = w * 0.02; c2d.lineCap = 'round';
    c2d.beginPath(); c2d.moveTo(w / 2, h * 0.12); c2d.lineTo(w / 2, h * 0.88); c2d.stroke();           // post
    c2d.beginPath(); c2d.moveTo(w * 0.2, h * 0.3); c2d.lineTo(w * 0.8, h * 0.3); c2d.stroke();           // beam
    c2d.fillRect(w * 0.36, h * 0.84, w * 0.28, h * 0.08);                                               // base
    for (const px of [0.2, 0.8]) {
      c2d.beginPath(); c2d.moveTo(w * px, h * 0.3); c2d.lineTo(w * (px - 0.1), h * 0.66); c2d.moveTo(w * px, h * 0.3); c2d.lineTo(w * (px + 0.1), h * 0.66); c2d.stroke();
      c2d.beginPath(); c2d.ellipse(w * px, h * 0.68, w * 0.12, h * 0.1, 0, 0, Math.PI); c2d.fill();
    }
  });
  if (tympTex) { const t = decal(2.4, 0.9, tympTex, { x: 5, y: 4.95, z: 6.01, parent: g }); t.material.transparent = true; }
  // 7. Flat roof with a white parapet lip (top 4.79)
  box(9.0, 0.3, 5.0, roof, { x: 5, y: 4.49, z: 2.6, parent: g });
  box(9.0, 0.1, 0.1, trim, { x: 5, y: 4.79, z: 0.15, parent: g, castShadow: false });
  box(9.0, 0.1, 0.1, trim, { x: 5, y: 4.79, z: 5.05, parent: g, castShadow: false });
  box(0.1, 0.1, 5.0, trim, { x: 0.55, y: 4.79, z: 2.6, parent: g, castShadow: false });
  box(0.1, 0.1, 5.0, trim, { x: 9.45, y: 4.79, z: 2.6, parent: g, castShadow: false });
  // 8. Brass scales emblem that rocks (top 5.8)
  cyl(0.05, 0.05, 1.0, brass, { x: 5, y: 4.79, z: 2.5, parent: g, castShadow: false });
  const beam = new THREE.Group(); beam.position.set(5, 5.75, 2.5); g.add(beam);
  box(1.2, 0.05, 0.05, brass, { y: -0.025, parent: beam, castShadow: false });
  for (const bx of [-0.55, 0.55]) {
    cyl(0.01, 0.01, 0.3, brass, { x: bx, y: -0.3, parent: beam, castShadow: false });
    cyl(0.2, 0.2, 0.03, brass, { x: bx, y: -0.33, parent: beam, castShadow: false });
  }
  // 9. Checklist plaque
  box(1.2, 1.6, 0.08, trim, { x: 1.6, y: 1.0, z: 4.95, parent: g, castShadow: false });
  const listTex = tex(176, 240, (c2d, w, h) => {
    c2d.fillStyle = BRAND.white; c2d.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const y = h * (0.12 + i * 0.22), s = w * 0.2;
      c2d.strokeStyle = BRAND.navy; c2d.lineWidth = w * 0.03; c2d.strokeRect(w * 0.1, y, s, s);
      c2d.fillStyle = BRAND.navy; c2d.fillRect(w * 0.42, y + s * 0.3, w * 0.48, s * 0.18); c2d.fillRect(w * 0.42, y + s * 0.62, w * 0.34, s * 0.18);
      c2d.strokeStyle = C.green; c2d.lineWidth = w * 0.045; c2d.lineCap = 'round';
      c2d.beginPath(); c2d.moveTo(w * 0.13, y + s * 0.5); c2d.lineTo(w * 0.19, y + s * 0.78); c2d.lineTo(w * 0.31, y + s * 0.18); c2d.stroke();
    }
  });
  if (listTex) decal(1.1, 1.5, listTex, { x: 1.6, y: 1.8, z: 5.0, emissive: 0.3, parent: g });
  // 10. Two stone lions
  for (const lx of [1.6, 8.4]) {
    box(0.4, 0.3, 0.5, stone, { x: lx, y: 0.64, z: 5.7, parent: g });
    sphere(0.22, stone, { x: lx, y: 1.16, z: 5.7, parent: g });
  }
  // 11. Bronze double door, plaque and windows
  box(1.8, 2.35, 0.06, trim, { x: doorX, y: 0.64, z: 4.90, parent: g, castShadow: false });
  box(1.6, 2.2, 0.08, doorMat, { x: doorX, y: 0.64, z: 4.92, parent: g, castShadow: false });
  box(0.03, 2.2, 0.1, split, { x: doorX, y: 0.64, z: 4.92, parent: g, castShadow: false });
  sphere(0.05, handle, { x: doorX - 0.12, y: 1.7, z: 5.0, parent: g, castShadow: false });
  sphere(0.05, handle, { x: doorX + 0.12, y: 1.7, z: 5.0, parent: g, castShadow: false });
  const nameTex = tex(256, 96, (c2d, w, h) => drawLabel(c2d, w, h, BRAND.navy, BRAND.white, 'Compliance', 0.5));
  if (nameTex) decal(0.8, 0.3, nameTex, { x: doorX, y: 3.1, z: 4.93, parent: g });
  for (const wx of [2.1, 7.9]) win(g, glassMat, trim, wx, 1.8, 4.9, 0.7, 1.6, 's');
  for (const z of [1.2, 2.6, 4.0]) {
    win(g, glassMat, trim, 0.8, 1.8, z, 0.7, 1.6, 'w');
    win(g, glassMat, trim, 9.2, 1.8, z, 0.7, 1.6, 'e');
  }
  const lights = [pointLight(C.lamp, 5, 4, { x: 2.0, y: 0.7, z: 5.5, parent: g }), pointLight(C.lamp, 5, 4, { x: 8.0, y: 0.7, z: 5.5, parent: g })];

  function update(dt, time, night) {
    const r = ramp(night || 0);
    brass.emissiveIntensity = 0.5 * r;
    beam.rotation.z = 0.08 * Math.sin(TAU * 0.25 * time);
  }
  return { group: g, glass: [glassMat], lights, update };
}

const PAPERS = 6, SPECKS = 6;
const BELT_Y = 0.78;
// The press is built around head x 2.0 and shifted east as a whole so the raised head (top 1.75) sits beside
// the alien's shoulder rather than in front of its face from the default camera (anchor x 1.7, alien to x 2.12).
const PRESS_X = 0.3;
const easeIn = t => t * t;
const easeOut = t => 1 - (1 - t) * (1 - t);

export function buildActivity(ctx) {
  const { dept } = ctx;
  const g = new THREE.Group();
  const rand = rng('compliance-stamp');
  const wood = mat(C.wood, { roughness: 0.8 });
  const iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  const accent = mat(dept.accent, { roughness: 0.6 });
  const paper = mat(C.paper, { roughness: 0.9, doubleSide: true });
  const salmon = mat(BRAND.salmon, { roughness: 0.7 });
  const trim = mat(BRAND.white, { roughness: 0.8 });
  const okMat = glow(C.green, 0.2);
  const lampMat = glow(C.lamp, 0.5);
  const speckMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.salmon), roughness: 0.7, transparent: true, opacity: 0 });

  // Everything from 1 to 6 lives in the press group (x offset PRESS_X); the counter sign stays in g.
  const press = new THREE.Group(); press.position.x = PRESS_X; g.add(press);
  // 1. Press bench (press x 0.6..3.4, station x 0.9..3.7, z 2.85..3.75) on iron legs
  box(2.8, 0.75, 0.9, wood, { x: 2.0, y: 0, z: 3.3, parent: press });
  for (const lx of [0.7, 3.3]) for (const lz of [2.9, 3.7]) box(0.1, 0.75, 0.1, iron, { x: lx, y: 0, z: lz, parent: press, castShadow: false });
  // 2. Frame (bounces 0.03 while the head holds)
  const frame = new THREE.Group(); press.add(frame);
  box(0.12, 1.4, 0.12, iron, { x: 1.3, y: 0.75, z: 3.3, parent: frame });
  box(0.12, 1.4, 0.12, iron, { x: 2.7, y: 0.75, z: 3.3, parent: frame });
  box(1.6, 0.12, 0.12, iron, { x: 2.0, y: 2.05, z: 3.3, parent: frame });
  sphere(0.08, lampMat, { x: 2.0, y: 2.22, z: 3.3, parent: frame, castShadow: false });
  // 3. Stamp head with its shaft and a mirrored APPROVED face underneath
  const head = new THREE.Group(); head.position.set(2.0, 1.4, 3.3); press.add(head);
  box(0.7, 0.35, 0.6, accent, { parent: head });
  cyl(0.06, 0.06, 0.65, iron, { y: 0.35, parent: head, castShadow: false });
  const approvedTex = tex(256, 128, (c2d, w, h) => drawLabel(c2d, w, h, '#FFFFFF', dept.accent, 'APPROVED', 0.42));
  if (approvedTex) { const a = decal(0.6, 0.5, approvedTex, { y: -0.002, rx: Math.PI / 2, parent: head }); a.scale.x = -1; }
  // 4. Lever hinged on a bracket at press (1.3, 1.3, 3.3) (station x 1.6, by the alien's hands), pointing toward the alien and down
  box(0.16, 0.16, 0.16, iron, { x: 1.3, y: 1.22, z: 3.3, parent: press, castShadow: false });
  const lever = new THREE.Group(); lever.position.set(1.3, 1.3, 3.3); press.add(lever);
  const rod = cyl(0.04, 0.04, 0.9, iron, { rx: Math.PI / 2, parent: lever, castShadow: false }); rod.position.set(0, 0, -0.45);
  sphere(0.1, salmon, { z: -0.9, parent: lever, castShadow: false });
  lever.rotation.x = -0.3;
  // 5. Belt, inbox with a paper stack, outbox with the OK lamp
  const beltTex = tex(256, 64, (c2d, w, h) => {
    c2d.fillStyle = C.iron; c2d.fillRect(0, 0, w, h);
    c2d.fillStyle = '#FFFFFF';
    for (let i = 0; i < 7; i++) c2d.fillRect(w * (i / 7) + w * 0.03, h * 0.1, w * 0.05, h * 0.8);
  });
  let beltMat;
  if (beltTex) { beltTex.wrapS = THREE.RepeatWrapping; beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.8 }); }
  else beltMat = iron;
  plane(2.8, 0.5, beltMat, { x: 2.0, y: 0.765, z: 3.3, rx: -Math.PI / 2, parent: press });
  // Inbox at press x 3.4 (station 3.4..4.0) so it stays inside the 4 by 4 station after the shift
  box(0.6, 0.12, 0.55, iron, { x: 3.4, y: 0.75, z: 3.3, parent: press, castShadow: false });
  for (let i = 0; i < 5; i++) plane(0.45, 0.35, paper, { x: 3.4, y: 0.875 + i * 0.012, z: 3.3, rx: -Math.PI / 2, parent: press });
  const outbox = box(0.6, 0.12, 0.55, accent, { x: 0.5, y: 0, z: 3.3, parent: press, castShadow: false });
  outbox.position.y = 0.81; outbox.rotation.z = 0.15;
  cyl(0.1, 0.1, 0.15, okMat, { x: 0.78, y: 0.86, z: 3.55, seg: 12, parent: press, castShadow: false });
  // 6. Six cycling papers (each with a hidden APPROVED mark) and six ink specks
  const stampTex = tex(128, 60, (c2d, w, h) => drawLabel(c2d, w, h, BRAND.salmon, '#FFFFFF', 'APPROVED', 0.5));
  const papers = [], marks = [];
  for (let i = 0; i < PAPERS; i++) {
    const p = plane(0.45, 0.35, paper, { parent: press });
    p.rotation.x = -Math.PI / 2; p.visible = false;
    const mk = stampTex ? decal(0.3, 0.14, stampTex, { z: 0.003, parent: p }) : plane(0.3, 0.14, salmon, { z: 0.003, parent: p });
    mk.rotation.z = -0.15; mk.visible = false;
    papers.push(p); marks.push(mk);
  }
  const specks = [], speckDir = new Float32Array(SPECKS * 2);
  for (let i = 0; i < SPECKS; i++) {
    const s = sphere(0.03, speckMat, { parent: press, castShadow: false, receiveShadow: false }); s.visible = false; specks.push(s);
    const a = i / SPECKS * TAU; speckDir[i * 2] = Math.cos(a); speckDir[i * 2 + 1] = Math.sin(a);
  }
  // 7. Counter sign on a post (repainted once per burst)
  cyl(0.03, 0.03, 1.2, iron, { x: 3.6, y: 0, z: 0.8, parent: g, castShadow: false });
  box(0.9, 0.5, 0.05, trim, { x: 3.6, y: 1.2, z: 0.8, parent: g, castShadow: false });
  let approved = 8 + Math.floor(rand() * 20);
  const counterTex = tex(360, 200, (c2d, w, h) => drawLabel(c2d, w, h, '#FFFFFF', BRAND.navy, 'Approved today: ' + approved, 0.3));
  if (counterTex) decal(0.86, 0.46, counterTex, { x: 3.6, y: 1.45, z: 0.83, parent: g });
  function repaintCounter() {
    if (!counterTex) return;
    const img = counterTex.image;
    drawLabel(img.getContext('2d'), img.width, img.height, '#FFFFFF', BRAND.navy, 'Approved today: ' + approved, 0.3);
    counterTex.needsUpdate = true;
  }

  let lastIdx = -1, slamAge = 99, headY = 1.4;
  function setPaperOnBelt(p, x) { p.position.set(x, BELT_Y, 3.3); p.rotation.z = 0; }
  function setPaperInStack(p, slot) { p.position.set(0.5, 0.88 + slot * 0.014, 3.3); p.rotation.z = 0.15; }
  function update(dt, time, phase) {
    const on = !!(phase && phase.working);
    let targetY = 1.4;
    if (on) {
      const t = phase.t;
      const n = Math.floor((t - 0.7) / 3.2);
      if (n !== lastIdx) {
        if (n > lastIdx) { slamAge = 0; approved++; repaintCounter(); }
        lastIdx = n;
      }
      const q = (t - 0.7) - n * 3.2;          // seconds since the last slam, 0..3.2
      // Head: slam 0.6 in 0.12 s, hold 0.15 s, rise over 0.4 s
      if (q < 0.12) targetY = 1.4 - 0.6 * easeIn(q / 0.12);
      else if (q < 0.27) targetY = 0.8;
      else if (q < 0.67) targetY = 0.8 + 0.6 * easeOut((q - 0.27) / 0.4);
      headY = targetY;
      frame.position.y = (q >= 0.12 && q < 0.27) ? 0.03 * Math.sin(TAU * 12 * q) : 0;
      // Belt scroll
      if (beltTex) beltTex.offset.x += 0.6 * dt;
      // Papers: active slam index a, group base for the stack
      const a = q < 2.4 ? n : n + 1;
      const base = Math.floor(a / PAPERS) * PAPERS;
      for (let i = 0; i < PAPERS; i++) {
        const m = base + i, p = papers[i], mk = marks[i];
        if (m < a) { p.visible = true; mk.visible = true; setPaperInStack(p, m - base); }
        else if (m > a) { p.visible = false; }
        else {
          p.visible = true;
          if (q >= 2.4) {                                 // sliding in from the inbox for the next slam
            const u = (q - 2.4) / 0.8; setPaperOnBelt(p, 3.1 - 1.1 * u); mk.visible = false;
          } else if (q < 0.3) {                           // under the head; the mark appears when the head bottoms
            setPaperOnBelt(p, 2.0); mk.visible = q >= 0.12;
          } else if (q < 1.0) {                           // slide to the outbox
            setPaperOnBelt(p, 2.0 - 1.2 * easeOut((q - 0.3) / 0.7)); mk.visible = true;
          } else if (q < 1.4) {                           // hop 0.25 and drop into the tray
            const u = (q - 1.0) / 0.4;
            p.position.set(0.8 - 0.3 * u, BELT_Y + 0.25 * Math.sin(Math.PI * u) + (0.88 + (m - base) * 0.014 - BELT_Y) * u, 3.3);
            p.rotation.z = 0.15 * u; mk.visible = true;
          } else { setPaperInStack(p, m - base); mk.visible = true; }
        }
      }
    } else {
      lastIdx = -1;
      headY += (1.4 - headY) * Math.min(1, dt * 5);
      frame.position.y = 0;
      for (let i = 0; i < PAPERS; i++) papers[i].visible = false;
    }
    head.position.y = headY;
    lever.rotation.x = -(0.3 + 0.7 * clamp((1.4 - headY) / 0.6, 0, 1));
    // Ink specks puff out 0.3 and fade over 0.4 s after the slam; OK lamp flashes for 0.5 s
    slamAge += dt;
    const puff = clamp(slamAge / 0.4, 0, 1);
    const showSpecks = on && slamAge >= 0.12 && puff < 1;
    speckMat.opacity = showSpecks ? 1 - puff : 0;
    for (let i = 0; i < SPECKS; i++) {
      const s = specks[i]; s.visible = showSpecks;
      if (showSpecks) s.position.set(2.0 + speckDir[i * 2] * 0.3 * puff, 0.82 + 0.15 * puff, 3.3 + speckDir[i * 2 + 1] * 0.3 * puff);
    }
    okMat.emissiveIntensity = (on && slamAge < 0.5) ? 1.0 : (on ? 0.3 : 0.2);
    lampMat.emissiveIntensity = on ? 0.7 : 0.5;
  }
  // The anchor stays at x 1.7; only the press moved (PRESS_X), so the lever tip (station x 1.6) is still at the hands.
  return { group: g, anchor: new THREE.Vector3(1.7, 0, 2.5), yaw: 0, pose: 'lever', enter: 'walk', label: activityLabel, update };
}
