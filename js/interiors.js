/* Thread Town interiors: the twelve department rooms behind the front doors.
   Built per docs/CONTRACT_V5.md (section Interiors) and docs/INTERIORS_DESIGN.md.
   Rooms live far below the town: room i (department order) has its floor at world y -60 and is centered at
   x 200 + 24 i, z 0. buildInteriors(ctx) -> { group, rooms, update(dt, time, activeRoomId) };
   refreshBoards(rooms, deptStats, agentsByDept) repaints the stats boards and portrait walls.
   Canvas work happens only inside build and repaint functions and is guarded by typeof document, so the
   module imports headless.
   // CONTRACT: the v5 text calls origin the south-west floor corner and also defines the walkable rectangle as
   // origin to origin + (w, d). Those two statements only agree if origin is the minimum-coordinate corner,
   // which in world terms is the north-west corner (z = -4.5). interiors.js uses the minimum corner for origin,
   // so origin + (12, 9) is the south-east corner and the south wall (door side) is at v = 9. */
import * as THREE from 'three';
import {
  BRAND, mat, glass, glow, box, cyl, cone, sphere, dome, torus, plane, column, canvasTex, decal, pointLight, clamp, lerp,
} from './depts/common.js';

const TAU = Math.PI * 2;
const hasDoc = typeof document !== 'undefined';
export const ROOM_W = 12, ROOM_D = 9, WALL_H = 3.4, FLOOR_Y = -60, ROOM_X0 = 200, ROOM_PITCH = 24;
const LIGHT_I = 16, LIGHT_DIST = 9;
const KANIT = 'Kanit, Inter, sans-serif', INTER = 'Inter, sans-serif';

/* Shared colors (ART_DIRECTION values plus the brand). */
const C = {
  trim: '#F8F6F0', iron: '#2E3E50', wood: '#A5774E', darkWood: '#6B4A2B', deskTop: '#E8DCC0', brass: '#F6D463',
  bulb: '#FFF1C9', bulbGlow: '#FFE2A0', lamp: '#FFC97A', paper: '#E8E2D5', ink: '#0E1B2E', cork: '#D8B98A',
  water: '#6CC3CB', sand: '#E3D5B2', hedge: '#6FA860', stone: '#B9C4CC', lightStone: '#CBD3DA', plinth: '#CFC6B6',
  ceiling: '#132A42', daylight: '#DDEBF5', doorFill: '#0E2238', green: '#1F8A5B', navy: '#002D4F', aqua: '#75CCD0',
  salmon: '#E7706F', silver: '#E2E9EE', slate: '#3A4A5C', gold: '#C68B17', lilac: '#8E7BD0', purple: '#5D4E8E',
  teal: '#2E8B8E', plum: '#A85B8E', lime: '#8DBE2E', orange: '#C05E2C', straw: '#D9C58F', deepWater: '#58A3A8',
  stem: '#5B8E45', leaf: '#5FA55A', trunk: '#8A6446', smoke: '#F2F2F2', blue: '#004B91', body: '#3A4A5C',
};

/* Activity labels, mirroring the department modules' activityLabel exports (ctx.activityLabels may override). */
const ACTIVITY = {
  exec: 'Giving a speech at the podium', embedded: 'Patching partner connections', compliance: 'Stamping approvals',
  fcc: 'Watching from the tower', ops: 'Running the crane', data: 'Scanning the sky', credit: 'Spinning the vault wheel',
  finance: 'Watching the ticker', tech: 'Shipping code', risk: 'Walking the high wire', marketing: 'Shooting campaign hoops',
  people: 'Swinging with the team',
};

let fontsReady = false;
const BUILDS = [];
const imgCache = new Map();

/* ---------- small utilities ---------- */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed) {
  let a = hashStr(String(seed)) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const finite = v => (Number.isFinite(v) ? v : 0);
function shade(hex, f) { const c = new THREE.Color(hex); c.r = clamp(c.r * f, 0, 1); c.g = clamp(c.g * f, 0, 1); c.b = clamp(c.b * f, 0, 1); return '#' + c.getHexString(); }
function mix(a, b, t) { const c = new THREE.Color(a).lerp(new THREE.Color(b), t); return '#' + c.getHexString(); }

function rr(g, x, y, w, h, r) {
  if (typeof g.roundRect === 'function') { g.beginPath(); g.roundRect(x, y, w, h, r); return; }
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + q, y); g.lineTo(x + w - q, y); g.quadraticCurveTo(x + w, y, x + w, y + q);
  g.lineTo(x + w, y + h - q); g.quadraticCurveTo(x + w, y + h, x + w - q, y + h); g.lineTo(x + q, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - q); g.lineTo(x, y + q); g.quadraticCurveTo(x, y, x + q, y); g.closePath();
}
function measure(g, text) { const m = g.measureText(text); return m && Number.isFinite(m.width) ? m.width : text.length * 0.55 * parseInt(g.font, 10) || 0; }
function fitFont(g, text, weight, family, size, maxW, minSize) {
  let w;
  for (;;) { g.font = `${weight} ${size}px ${family}`; w = measure(g, text); if (w <= maxW || size <= minSize) break; size -= 2; }
  return { size, width: w };
}
function ellipsize(g, text, maxW) {
  if (measure(g, text) <= maxW) return text;
  let s = text;
  while (s.length > 1 && measure(g, s + '...') > maxW) s = s.slice(0, -1);
  return s + '...';
}

/* Texture record: { tex, repaint(drawFn?) }. Null when there is no document. */
function makeTex(w, h, draw, o = {}) {
  if (!hasDoc) return null;
  const t = canvasTex(w, h, draw);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  if (o.repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  const canvas = t.image;
  const g = canvas.getContext('2d');
  return {
    tex: t, canvas, draw,
    repaint(fn) { (fn || draw)(g, canvas.width, canvas.height); t.needsUpdate = true; },
  };
}
function labelTex(w, h, text, o = {}) {
  return makeTex(w, h, (g, cw, ch) => {
    g.clearRect(0, 0, cw, ch);
    if (o.bg) { g.fillStyle = o.bg; rr(g, 0, 0, cw, ch, o.radius || 0); g.fill(); }
    g.fillStyle = o.fg || '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitFont(g, text, o.weight || 600, o.family || KANIT, o.size || Math.round(ch * 0.6), cw * 0.9, 10);
    g.fillText(text, cw / 2, ch * 0.53);
  });
}
function loadImage(url, onReady) {
  if (typeof Image === 'undefined' || !url) return null;
  let e = imgCache.get(url);
  if (!e) {
    if (imgCache.size > 300) imgCache.clear();
    e = { img: new Image(), ready: false, waiters: new Set() };
    e.img.onload = () => { e.ready = true; const ws = Array.from(e.waiters); e.waiters.clear(); for (const f of ws) { try { f(); } catch (err) { /* repaint is best effort */ } } };
    e.img.onerror = () => { e.waiters.clear(); };
    e.img.src = url;
    imgCache.set(url, e);
  }
  if (e.ready) return e.img;
  if (onReady) e.waiters.add(onReady);
  return null;
}
function agentInfo(a) {
  if (!a) return { id: '', name: '', role: '' };
  const s = a.spec || a;
  return { id: String(a.id || s.id || s.name || ''), name: String(s.name || ''), role: String(s.role || '') };
}
function tube(parent, curve, r, material, seg = 16) {
  const geo = new THREE.TubeGeometry(curve, seg, r, 6, false);
  const m = new THREE.Mesh(geo, material); m.castShadow = false; m.receiveShadow = false; parent.add(m); return m;
}
function qcurve(ax, ay, az, cx, cy, cz, bx, by, bz) {
  return new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, ay, az), new THREE.Vector3(cx, cy, cz), new THREE.Vector3(bx, by, bz));
}
let triGeo = null;
function triangle() { if (!triGeo) { triGeo = new THREE.BufferGeometry(); triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0, -0.25, 0], 3)); triGeo.computeVertexNormals(); } return triGeo; }

/* ---------- board painters ---------- */
function drawStats(g, w, h, dept, s, label) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = C.navy; rr(g, 12, 12, w - 24, h - 24, 32); g.fill();
  g.strokeStyle = 'rgba(226,233,238,0.20)'; g.lineWidth = 2; rr(g, 13, 13, w - 26, h - 26, 31); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const f = fitFont(g, dept.name, 600, KANIT, 92, 980, 56);
  g.fillStyle = '#FFFFFF'; g.fillText(dept.name, 64, 128);
  g.fillStyle = dept.accent; g.fillRect(64, 150, f.width * 0.6, 8);
  const clean = s.runs > 0 ? Math.round(100 * (s.runs - s.fails) / s.runs) + '%' : 'n/a';
  const tiles = [['Agents', String(s.agents)], ['Runs this week', String(s.runs)], ['Clean rate', clean], ['Working now', String(s.active)]];
  for (let i = 0; i < 4; i++) {
    const x = i % 2 ? 592 : 64, y = i < 2 ? 184 : 372;
    g.fillStyle = 'rgba(255,255,255,0.07)'; rr(g, x, y, 464, 170, 20); g.fill();
    g.fillStyle = 'rgba(226,233,238,0.85)'; g.font = `500 34px ${INTER}`; g.fillText(tiles[i][0], x + 24, y + 52);
    let vx = x + 24;
    if (i === 3 && s.active > 0) { g.fillStyle = C.salmon; g.beginPath(); g.arc(vx + 12, y + 140 - 30, 12, 0, TAU); g.fill(); vx += 40; }
    g.fillStyle = '#FFFFFF'; g.font = `600 84px ${KANIT}`; g.fillText(tiles[i][1], vx, y + 140);
  }
  g.fillStyle = C.aqua; g.font = `500 30px ${INTER}`; g.fillText('Signature activity · ' + label, 64, 612);
}
function drawPlaque(g, w, h, name, accent) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,45,79,0.94)'; rr(g, 12, 12, w - 24, h - 24, 48); g.fill();
  g.strokeStyle = 'rgba(226,233,238,0.20)'; g.lineWidth = 2; rr(g, 15, 15, w - 30, h - 30, 45); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const f = fitFont(g, name, 600, KANIT, 150, 1000, 60);
  g.fillStyle = '#FFFFFF'; g.fillText(name, w / 2, 165);
  g.fillStyle = accent; g.fillRect(w / 2 - f.width * 0.3, 186, f.width * 0.6, 8);
  g.fillStyle = 'rgba(226,233,238,0.85)'; g.font = `500 84px ${INTER}`; g.fillText('Reception', w / 2, 268);
}
function drawPortrait(g, w, h, info, dept, img) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = C.trim; g.fillRect(0, 0, w, h);
  g.strokeStyle = C.silver; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28);
  g.globalAlpha = 0.18; g.fillStyle = dept.alien; g.beginPath(); g.arc(192, 212, 150, 0, TAU); g.fill(); g.globalAlpha = 1;
  if (img) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; try { g.drawImage(img, 48, 32, 288, 360); } catch (e) { img = null; } }
  if (!img) { g.fillStyle = dept.alien; g.beginPath(); g.arc(192, 180, 90, 0, TAU); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  fitFont(g, info.name, 600, KANIT, 44, 340, 22); g.fillStyle = C.navy; g.fillText(info.name, 192, 440);
  g.font = `500 26px ${INTER}`; g.fillStyle = C.body; g.fillText(ellipsize(g, info.role, 340), 192, 480);
  g.fillStyle = dept.accent; g.fillRect(0, 500, w, 6);
}
function drawHiring(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = C.silver; g.fillRect(0, 0, w, h);
  g.strokeStyle = C.navy; g.lineWidth = 6; if (g.setLineDash) g.setLineDash([18, 12]);
  g.beginPath(); g.arc(192, 200, 90, 0, TAU); g.stroke(); if (g.setLineDash) g.setLineDash([]);
  g.fillStyle = C.navy; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 96px ${KANIT}`; g.fillText('+', 192, 200);
  g.textBaseline = 'alphabetic'; g.font = `600 56px ${KANIT}`; g.fillText('Hiring', 192, 440);
  g.font = `500 26px ${INTER}`; g.fillStyle = C.body; g.fillText('Register an agent', 192, 480);
}
function drawExit(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = C.green; g.fillRect(0, 0, w, h);
  g.strokeStyle = C.trim; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#FFFFFF'; g.font = `600 64px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('EXIT', w / 2, 72);
}
function drawNotice(extra) {
  return (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = C.cork; g.fillRect(0, 0, w, h);
    const cards = [['Town hall Friday', 60, 50, 0.04, C.salmon], ['Golf league sign-up', 380, 40, -0.04, C.aqua], ['Clean desk week', 70, 230, -0.04, C.brass], ['Cafe menu', 390, 240, 0.04, C.navy]];
    if (extra) cards.push([extra, 230, 300, 0.03, C.lime]);
    for (const [text, x, y, rot, pin] of cards) {
      g.save(); g.translate(x + 90, y + 60); g.rotate(rot);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-86, -54, 180, 120);
      g.fillStyle = '#FFFFFF'; g.fillRect(-90, -60, 180, 120);
      g.fillStyle = C.navy; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitFont(g, text, 500, INTER, 26, 160, 14); g.fillText(text, 0, 6);
      g.fillStyle = pin; g.beginPath(); g.arc(0, -48, 8, 0, TAU); g.fill();
      g.restore();
    }
  };
}

/* ---------- shared textures and materials ---------- */
function makeShared() {
  const S = { T: {}, m: {} };
  const m = S.m;
  m.trim = mat(C.trim, { roughness: 0.8 }); m.iron = mat(C.iron, { roughness: 0.55, metalness: 0.2 });
  m.wood = mat(C.wood, { roughness: 0.8 }); m.darkWood = mat(C.darkWood, { roughness: 0.75 }); m.deskTop = mat(C.deskTop, { roughness: 0.7 });
  m.brass = mat(C.brass, { roughness: 0.3, metalness: 0.6 }); m.brassSoft = mat(C.brass, { roughness: 0.5 });
  m.paper = mat(C.paper, { roughness: 0.9 }); m.ink = mat(C.ink, { roughness: 0.7 }); m.cork = mat(C.cork, { roughness: 0.95 });
  m.water = mat(C.water, { roughness: 0.15, opacity: 0.6, transparent: true, emissive: '#0E4F58', emissiveIntensity: 0.2 });
  m.hedge = mat(C.hedge, { roughness: 0.9 }); m.stone = mat(C.stone, { roughness: 0.85 }); m.lightStone = mat(C.lightStone, { roughness: 0.85 });
  m.plinth = mat(C.plinth, { roughness: 0.9 }); m.navy = mat(C.navy, { roughness: 0.8 }); m.aqua = mat(C.aqua, { roughness: 0.7 });
  m.salmon = mat(C.salmon, { roughness: 0.8 }); m.silver = mat(C.silver, { roughness: 0.7 }); m.slate = mat(C.slate, { roughness: 0.85 });
  m.gold = mat(C.gold, { roughness: 0.4, metalness: 0.3 }); m.lilac = mat(C.lilac, { roughness: 0.7 }); m.purple = mat(C.purple, { roughness: 0.8 });
  m.teal = mat(C.teal, { roughness: 0.7 }); m.plum = mat(C.plum, { roughness: 0.7 }); m.lime = mat(C.lime, { roughness: 0.8 });
  m.orange = mat(C.orange, { roughness: 0.8 }); m.straw = mat(C.straw, { roughness: 1.0 }); m.stem = mat(C.stem, { roughness: 0.9 });
  m.leaf = mat(C.leaf, { roughness: 0.9, doubleSide: true }); m.trunk = mat(C.trunk, { roughness: 0.9 }); m.doorFill = mat(C.doorFill, { roughness: 0.95 });
  m.green = mat(C.green, { roughness: 0.8 }); m.blue = mat(C.blue, { roughness: 0.8 }); m.dais = mat('#4F3620', { roughness: 0.8 });
  m.smoke = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.smoke), transparent: true, opacity: 0.3, depthWrite: false });
  m.white = m.trim;
  S.T.hiring = makeTex(384, 512, drawHiring);
  S.T.exit = makeTex(256, 96, drawExit);
  S.T.notice = makeTex(640, 440, drawNotice(null));
  S.T.noticeMk = makeTex(640, 440, drawNotice('Brand check Thursday'));
  S.T.tLogo = labelTex(128, 128, 'T', { bg: '#FFFFFF', fg: C.navy, size: 100 });
  S.T.tLogoDark = labelTex(128, 128, 'T', { bg: C.iron, fg: '#FFFFFF', size: 100 });
  S.T.plug = makeTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = C.navy;
    rr(g, 24, 56, 80, 48, 12); g.fill(); rr(g, 38, 24, 14, 40, 6); g.fill(); rr(g, 76, 24, 14, 40, 6); g.fill(); g.fillRect(58, 100, 12, 20);
  });
  S.T.windows = new Map();
  return S;
}
function windowMaterial(S, key, emissive, blinds) {
  const k = key + '|' + emissive;
  if (S.T.windows.has(k)) return S.T.windows.get(k);
  let m;
  if (blinds) {
    const T = makeTex(280, 240, (g, w, h) => {
      g.fillStyle = C.daylight; g.fillRect(0, 0, w, h);
      g.fillStyle = blinds; g.globalAlpha = 0.7;
      for (let i = 0; i < 12; i++) g.fillRect(0, i * 20 + 4, w, 12);
      g.globalAlpha = 1;
    });
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#FFFFFF'), roughness: 0.6, map: T ? T.tex : null, emissive: new THREE.Color('#FFFFFF'), emissiveMap: T ? T.tex : null, emissiveIntensity: emissive });
  } else {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.daylight), roughness: 0.25, metalness: 0.05, emissive: new THREE.Color(C.daylight), emissiveIntensity: emissive });
  }
  m.userData.envMapIntensity = 0.6;
  S.T.windows.set(k, m);
  return m;
}

/* ---------- room build context ---------- */
function makeR(room, dept, theme, S, ctx) {
  const g = room.group;
  const wp = o => { o = o || {}; if (!o.parent) o.parent = g; return o; };
  const R = {
    g, dept, theme, room, S, ctx, m: S.m,
    obs(u0, v0, u1, v1) { room.obstacles.push({ x0: room.origin.x + u0, z0: room.origin.z + v0, x1: room.origin.x + u1, z1: room.origin.z + v1 }); },
    anim(fn) { room._.anim.push(fn); },
    ramp(material, lo, hi) { if (material) room._.ramps.push({ m: material, lo, hi }); return material; },
    stat(T) { if (T) room._.statics.push(T); return T; },
    box: (w, h, d, m, o) => box(w, h, d, m, wp(o)),
    cyl: (rt, rb, h, m, o) => cyl(rt, rb, h, m, wp(o)),
    cone: (r, h, m, o) => cone(r, h, m, wp(o)),
    sph: (r, m, o) => sphere(r, m, wp(o)),
    dome: (r, m, o) => dome(r, m, wp(o)),
    tor: (r, t, m, o) => torus(r, t, m, wp(o)),
    pl: (w, h, m, o) => plane(w, h, m, wp(o)),
    dec(w, h, T, o) { return decal(w, h, T ? T.tex : null, wp(o)); },
    grp(x, y, z, parent) { const q = new THREE.Group(); q.position.set(x || 0, y || 0, z || 0); (parent || g).add(q); return q; },
    tex: makeTex, label: labelTex,
    accent(opts) { return mat(dept.accent, Object.assign({ roughness: 0.8 }, opts || {})); },
    glow(hex, i) { return glow(hex, i); },
  };
  return R;
}

/* A framed window on the north wall centered at u, glowing daylight. */
function buildWindow(R, u, winMat, curtainOpacity) {
  const t = R.m.trim;
  R.pl(1.4, 1.2, winMat, { x: u, y: 2.0, z: 0.02 });
  R.box(0.08, 1.36, 0.06, t, { x: u - 0.74, y: 1.32, z: 0.03, castShadow: false });
  R.box(0.08, 1.36, 0.06, t, { x: u + 0.74, y: 1.32, z: 0.03, castShadow: false });
  R.box(1.56, 0.08, 0.06, t, { x: u, y: 2.6, z: 0.03, castShadow: false });
  R.box(1.56, 0.08, 0.18, t, { x: u, y: 1.32, z: 0.09, castShadow: false });
  R.box(0.06, 1.2, 0.05, t, { x: u, y: 1.4, z: 0.04, castShadow: false });
  R.box(1.4, 0.06, 0.05, t, { x: u, y: 1.97, z: 0.04, castShadow: false });
  if (curtainOpacity > 0) {
    const cm = R.accent({ opacity: curtainOpacity, roughness: 0.95, doubleSide: true });
    R.pl(0.5, 1.3, cm, { x: u - 0.95, y: 2.1, z: 0.07 });
    R.pl(0.5, 1.3, cm, { x: u + 0.95, y: 2.1, z: 0.07 });
  }
}

/* Water cooler at room-local (u, v); adds its obstacle. */
function buildCooler(R, u, v, glassMat) {
  R.box(0.4, 0.95, 0.4, R.m.trim, { x: u, y: 0, z: v, castShadow: false });
  const bottle = glassMat.clone(); bottle.color = new THREE.Color(mix(C.water, '#FFFFFF', 0.35)); bottle.emissiveIntensity = 0;
  R.cyl(0.14, 0.17, 0.45, bottle, { x: u, y: 0.95, z: v });
  R.cyl(0.04, 0.04, 0.18, R.m.trim, { x: u + 0.22, y: 0.5, z: v });
  R.box(0.2, 0.03, 0.1, R.m.iron, { x: u, y: 0.45, z: v + 0.22 });
  R.obs(u - 0.3, v - 0.3, u + 0.3, v + 0.3);
}
function buildPlantNW(R, u, v) {
  R.cyl(0.26, 0.2, 0.5, R.accent(), { x: u, y: 0, z: v });
  R.sph(0.32, R.m.hedge, { x: u, y: 0.8, z: v }); R.sph(0.26, R.m.hedge, { x: u, y: 1.2, z: v }); R.sph(0.18, R.m.hedge, { x: u, y: 1.5, z: v });
  const dots = [[0.22, 0.95, 0.2], [-0.2, 1.05, 0.18], [0.15, 1.3, -0.15], [-0.1, 1.55, 0.1]];
  for (const [dx, dy, dz] of dots) R.sph(0.035, R.m.salmon, { x: u + dx, y: dy, z: v + dz });
  R.obs(u - 0.3, v - 0.3, u + 0.3, v + 0.3);
}
function buildPlantSE(R, u, v) {
  R.cyl(0.26, 0.2, 0.5, R.accent(), { x: u, y: 0, z: v });
  R.cyl(0.04, 0.04, 1.1, R.m.trunk, { x: u, y: 0.5, z: v });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    const leaf = R.pl(0.5, 0.2, R.m.leaf, { x: u + Math.cos(a) * 0.22, y: 1.62, z: v + Math.sin(a) * 0.22 });
    leaf.rotation.set(-0.5, -a, 0.3);
  }
  R.obs(u - 0.3, v - 0.3, u + 0.3, v + 0.3);
}

/* The template every room shares (INTERIORS_DESIGN, Room template). */
function buildTemplate(R) {
  const { m, dept, theme, room } = R;
  const P = room._;
  const wallMat = mat(dept.wall, { roughness: 0.9 });
  const accent = R.accent();
  const trim = m.trim;
  const railMat = theme.pictureRail ? mat(theme.pictureRail, { roughness: 0.5 }) : trim;

  // 1 floor
  const floorMat = (theme.floor && theme.floor(R)) || mat(shade(dept.wall, 0.8), { roughness: 0.9 });
  const floor = R.pl(ROOM_W, ROOM_D, floorMat, { x: 6, y: 0, z: 4.5, rx: -Math.PI / 2, receiveShadow: true });
  floor.castShadow = false;

  // 2 walls (south wall in two pieces plus the lintel piece over the door)
  const wo = { castShadow: false, receiveShadow: true };
  R.box(0.2, WALL_H, 9.4, wallMat, Object.assign({ x: -0.1, y: 0, z: 4.5 }, wo));
  R.box(0.2, WALL_H, 9.4, wallMat, Object.assign({ x: 12.1, y: 0, z: 4.5 }, wo));
  R.box(12.4, WALL_H, 0.2, wallMat, Object.assign({ x: 6, y: 0, z: -0.1 }, wo));
  R.box(5.4, WALL_H, 0.2, wallMat, Object.assign({ x: 2.5, y: 0, z: 9.1 }, wo));
  R.box(5.4, WALL_H, 0.2, wallMat, Object.assign({ x: 9.5, y: 0, z: 9.1 }, wo));
  R.box(1.6, WALL_H - 2.2, 0.2, wallMat, Object.assign({ x: 6, y: 2.2, z: 9.1 }, wo));

  // 3 wainscot, chair rail, baseboard, picture rail
  const bands = [[0.9, 0.04, 0.02, accent, 0], [0.06, 0.06, 0.03, trim, 0.9], [0.1, 0.1, 0.05, trim, 0]];
  for (const [h, th, off, bm, y] of bands) {
    R.box(th, h, 9.0, bm, Object.assign({ x: off, y, z: 4.5 }, wo));
    R.box(th, h, 9.0, bm, Object.assign({ x: 12 - off, y, z: 4.5 }, wo));
    R.box(12.0, h, th, bm, Object.assign({ x: 6, y, z: off }, wo));
    R.box(5.2, h, th, bm, Object.assign({ x: 2.6, y, z: 9 - off }, wo));
    R.box(5.2, h, th, bm, Object.assign({ x: 9.4, y, z: 9 - off }, wo));
  }
  if (theme.neonTrim) {
    const neon = R.ramp(glow(theme.neonTrim, 0.8), 0.2, 0.8);
    R.box(0.04, 0.06, 12.0, neon, Object.assign({ x: 0.03, y: 3.3, z: 4.5 }, wo)); R.box(0.04, 0.06, 12.0, neon, Object.assign({ x: 11.97, y: 3.3, z: 4.5 }, wo));
    R.box(12.0, 0.06, 0.04, neon, Object.assign({ x: 6, y: 3.3, z: 0.03 }, wo)); R.box(12.0, 0.06, 0.04, neon, Object.assign({ x: 6, y: 3.3, z: 8.97 }, wo));
  } else {
    R.box(0.04, 0.04, 9.0, railMat, Object.assign({ x: 0.02, y: 3.0, z: 4.5 }, wo)); R.box(0.04, 0.04, 9.0, railMat, Object.assign({ x: 11.98, y: 3.0, z: 4.5 }, wo));
    R.box(12.0, 0.04, 0.04, railMat, Object.assign({ x: 6, y: 3.0, z: 0.02 }, wo)); R.box(12.0, 0.04, 0.04, railMat, Object.assign({ x: 6, y: 3.0, z: 8.98 }, wo));
  }

  // 4 ceiling and two flush fixtures
  const ceilColor = theme.ceiling || C.ceiling;
  room.ceilingColor = ceilColor;
  let ceilMat;
  if (theme.ceilingTex) {
    const T = theme.ceilingTex(R);
    if (T) {
      ceilMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#FFFFFF'), roughness: 1.0, map: T.tex, emissive: new THREE.Color('#FFFFFF'), emissiveMap: T.tex, emissiveIntensity: 0.1 });
      R.ramp(ceilMat, 0.05, 0.35);
    } else ceilMat = mat(ceilColor, { roughness: 1.0 });
  } else ceilMat = mat(ceilColor, { roughness: 1.0 });
  R.pl(ROOM_W, ROOM_D, ceilMat, { x: 6, y: WALL_H, z: 4.5, rx: Math.PI / 2 });
  const fixMat = R.ramp(glow(C.bulb, 0.15), 0.15, 0.8);
  P.fixtureMat = fixMat;
  for (const fx of [3.5, 8.5]) {
    R.box(1.5, 0.03, 0.5, trim, { x: fx, y: 3.31, z: 4.5, castShadow: false });
    R.box(1.4, 0.06, 0.4, fixMat, { x: fx, y: 3.34, z: 4.5, castShadow: false });
  }

  // 5 windows
  const win = theme.window || {};
  const winMat = windowMaterial(R.S, win.blinds ? 'b' + win.blinds : 'p', win.emissive === undefined ? 0.9 : win.emissive, win.blinds || null);
  const curtain = win.curtain === undefined ? 0.7 : win.curtain;
  for (const u of [2.5, 6.0, 9.5]) buildWindow(R, u, winMat, curtain);

  // 6 door frame, 7 opening fill, 8 exit sign
  R.box(0.12, 2.3, 0.16, trim, { x: 5.14, y: 0, z: 9.0, castShadow: false });
  R.box(0.12, 2.3, 0.16, trim, { x: 6.86, y: 0, z: 9.0, castShadow: false });
  R.box(1.84, 0.12, 0.16, trim, { x: 6, y: 2.2, z: 9.0, castShadow: false });
  R.box(1.8, 0.03, 0.5, m.plinth, { x: 6, y: 0, z: 8.75, castShadow: false });
  R.pl(1.6, 2.2, m.doorFill, { x: 6, y: 1.1, z: 9.0, ry: Math.PI });
  R.box(1.6, 0.03, 0.02, glow(C.aqua, 0.6), { x: 6, y: 0.02, z: 8.98, castShadow: false });
  R.box(0.6, 0.22, 0.06, m.iron, { x: 6, y: 2.34, z: 8.9, castShadow: false });
  R.dec(0.56, 0.18, R.S.T.exit, { x: 6, y: 2.45, z: 8.86, ry: Math.PI, emissive: 0.9 });

  // 9 exit zone (a record for the player, no geometry); 10 spawn is on the room record
  P.exitZone = { u0: 5.2, v0: 8.0, u1: 6.8, v1: 9.0 };

  // 11 reception desk and plaque
  R.box(2.4, 1.0, 0.7, accent, { x: 6, y: 0, z: 5.95, radius: 0.04 });
  R.box(2.6, 0.06, 0.9, m.deskTop, { x: 6, y: 1.0, z: 5.95 });
  R.cyl(0.02, 0.02, 2.4, m.brass, { x: 6, y: 0.18, z: 6.32, rz: Math.PI / 2 });
  R.cyl(0.06, 0.06, 0.05, m.brass, { x: 6.9, y: 1.06, z: 6.15 });
  R.cyl(0.04, 0.04, 0.1, m.iron, { x: 5.3, y: 1.06, z: 6.1 });
  R.cyl(0.08, 0.08, 0.1, m.plinth, { x: 5.0, y: 1.06, z: 5.75 });
  R.sph(0.1, m.hedge, { x: 5.0, y: 1.24, z: 5.75 });
  const plaqueT = R.stat(R.tex(1120, 300, (g, w, h) => drawPlaque(g, w, h, dept.name, dept.accent)));
  const plaque = R.dec(1.9, 0.5, plaqueT, { x: 6, y: 0.55, z: 6.32, emissive: 0.1 });
  R.ramp(plaque.material, 0.05, 0.3);
  R.obs(4.7, 5.5, 7.3, 6.4);

  // 12 stats board (west wall)
  const label = (R.ctx.activityLabels && R.ctx.activityLabels[dept.id]) || ACTIVITY[dept.id] || 'Working';
  P.stats = { agents: 0, runs: 0, fails: 0, active: 0 };
  P.boardKey = '';
  P.activityLabel = label;
  P.boardT = R.tex(1120, 640, (g, w, h) => drawStats(g, w, h, dept, P.stats, label));
  const board = R.dec(2.8, 1.6, P.boardT, { x: 0.03, y: 1.9, z: 4.5, ry: Math.PI / 2, emissive: 0.1 });
  R.ramp(board.material, 0.1, 0.35);
  R.box(0.06, 0.06, 2.92, trim, { x: 0.05, y: 2.7, z: 4.5, castShadow: false });
  R.box(0.06, 0.06, 2.92, trim, { x: 0.05, y: 1.04, z: 4.5, castShadow: false });
  R.box(0.06, 1.72, 0.06, trim, { x: 0.05, y: 1.04, z: 3.07, castShadow: false });
  R.box(0.06, 1.72, 0.06, trim, { x: 0.05, y: 1.04, z: 5.93, castShadow: false });
  R.box(0.25, 0.3, 2.8, accent, { x: 0.125, y: 0, z: 4.5 });
  R.obs(0, 3.1, 0.25, 5.9);
  P.boardInteractable = { kind: 'board', x: room.origin.x + 0.9, z: room.origin.z + 4.5, label: 'E  Read the board' };
  P.exitInteractable = { kind: 'exit', x: room.origin.x + 6, z: room.origin.z + 8.5, label: 'E  Go outside' };

  // 13 portrait wall: slots are built by setPortraits; the group lives here
  P.portraitGroup = new THREE.Group(); P.portraitGroup.name = 'portraits'; R.g.add(P.portraitGroup);
  P.slots = []; P.slotCount = 0;

  // 14 water cooler, 15 plants (positions may be overridden by the theme)
  const glassMat = glass('#AFD6E4'); P.glassMat = glassMat;
  const cp = theme.cooler || [11.3, 0.7];
  buildCooler(R, cp[0], cp[1], glassMat);
  buildPlantNW(R, 0.7, 0.7);
  const sp = theme.plantSE || [11.3, 8.3];
  buildPlantSE(R, sp[0], sp[1]);

  // 16 notice board
  const noticeT = theme.noticeExtra ? R.S.T.noticeMk : R.S.T.notice;
  R.dec(1.6, 1.1, noticeT, { x: 3.0, y: 1.9, z: 8.97, ry: Math.PI });
  R.box(1.7, 0.05, 0.04, m.wood, { x: 3.0, y: 2.45, z: 8.96, castShadow: false }); R.box(1.7, 0.05, 0.04, m.wood, { x: 3.0, y: 1.3, z: 8.96, castShadow: false });
  R.box(0.05, 1.2, 0.04, m.wood, { x: 2.175, y: 1.3, z: 8.96, castShadow: false }); R.box(0.05, 1.2, 0.04, m.wood, { x: 3.825, y: 1.3, z: 8.96, castShadow: false });

  // 17 lights (off until the room is active)
  const L = theme.lights || {};
  const lc = L.color || C.lamp, li = L.intensity || LIGHT_I;
  const lw = L.west || [3.5, 3.1, 4.5], le = L.east || [8.5, 3.1, 4.5];
  for (const p of [lw, le]) {
    const light = pointLight(lc, 0, LIGHT_DIST, { x: p[0], y: p[1], z: p[2], parent: R.g });
    light.visible = false; light.userData.base = li;
    room.lights.push(light);
  }
}

/* ---------- portrait wall ---------- */
function disposeSlot(slot) {
  if (slot.frame) slot.frame.parent.remove(slot.frame);
  if (slot.light) slot.light.parent.remove(slot.light);
  if (slot.lightGlow) slot.lightGlow.parent.remove(slot.lightGlow);
  if (slot.decal) { slot.decal.parent.remove(slot.decal); slot.decal.material.dispose(); }
  if (slot.T) slot.T.tex.dispose();
}
function layoutSlots(room, n) {
  const P = room._;
  for (const s of P.slots) disposeSlot(s);
  P.slots = []; P.slotCount = n;
  const grp = P.portraitGroup;
  const rows = n > 12 ? 2 : 1;
  const perRow = rows === 2 ? Math.ceil(n / 2) : n;
  const dark = mat(C.darkWood, { roughness: 0.75 });
  const brass = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  for (let k = 0; k < n; k++) {
    const row = rows === 2 ? (k < perRow ? 0 : 1) : 0;
    const idx = row === 0 ? k : k - perRow;
    const count = row === 0 ? perRow : n - perRow;
    let v, fw, fh, y;
    if (rows === 1 && n <= 6) { v = 1.2 + idx * 1.3; fw = 1.0; fh = 4 / 3; y = 1.9; }
    else { const pitch = 7.8 / count; v = 0.75 + pitch * (idx + 0.5); fw = Math.min(1.0, pitch - 0.1); fh = rows === 2 ? 0.7 : fw * 4 / 3; y = rows === 2 ? (row === 0 ? 1.55 : 2.9) : 1.9; }
    if (rows === 2) fw = Math.min(fw, fh * 0.75);
    const slot = { k, v, y, fw, fh, key: '', agentId: null, info: null, T: null };
    slot.frame = box(0.04, fh + 0.1, fw + 0.1, dark, { x: 11.97, y: y - fh / 2 - 0.05, z: v, parent: grp, castShadow: false });
    slot.decal = decal(fw * 0.9, fh * 0.9, P.hiringTex, { x: 11.92, y, z: v, ry: -Math.PI / 2, parent: grp, emissive: 0.15 });
    room._.ramps.push({ m: slot.decal.material, lo: 0.12, hi: 0.3 });
    if (rows === 1) {
      slot.light = box(0.12, 0.04, 0.4, brass, { x: 11.9, y: 2.65, z: v, parent: grp, castShadow: false });
      slot.lightGlow = box(0.1, 0.01, 0.36, P.pictureGlow, { x: 11.9, y: 2.64, z: v, parent: grp, castShadow: false });
    }
    P.slots.push(slot);
  }
}
function setSlotTexture(slot, T) {
  const m = slot.decal.material;
  if (m.map === T) return;
  m.map = T; m.emissiveMap = T; m.needsUpdate = true;
}
function paintSlot(room, slot, info, getAvatar, agent) {
  const dept = room._.dept;
  let url = '';
  try { url = (getAvatar && getAvatar(agent)) || ''; } catch (e) { url = ''; }
  const key = `${info.id}|${info.name}|${info.role}|${url ? 1 : 0}|${fontsReady ? 1 : 0}`;
  if (slot.key === key && slot.T) return;
  slot.key = key; slot.agentId = info.id; slot.info = info;
  if (!hasDoc) return;
  if (!slot.T) slot.T = makeTex(384, 512, (g, w, h) => drawPortrait(g, w, h, info, dept, null));
  const paint = img => slot.T.repaint((g, w, h) => drawPortrait(g, w, h, info, dept, img));
  let img = null;
  if (url) img = loadImage(url, () => { if (slot.agentId === info.id && slot.T) paint(loadImage(url)); });
  paint(img);
  setSlotTexture(slot, slot.T.tex);
}
function clearSlot(room, slot) {
  slot.key = ''; slot.agentId = null; slot.info = null;
  if (room._.hiringTex) setSlotTexture(slot, room._.hiringTex);
}
function setPortraits(room, agents, getAvatar) {
  const P = room._;
  const list = Array.isArray(agents) ? agents : [];
  const n = Math.max(6, list.length);
  if (n !== P.slotCount) layoutSlots(room, n);
  const inter = room.interactables;
  inter.length = 0;
  inter.push(P.boardInteractable);
  for (let k = 0; k < n; k++) {
    const slot = P.slots[k];
    const a = list[k];
    if (a) {
      const info = agentInfo(a);
      paintSlot(room, slot, info, getAvatar, a);
      inter.push({ kind: 'portrait', x: room.origin.x + 11.1, z: room.origin.z + slot.v, label: 'E  ' + info.name, agentId: info.id });
    } else clearSlot(room, slot);
  }
  inter.push(P.exitInteractable);
}

/* ---------- floor painters (1024 x 768, one tile = 85.33 px) ---------- */
const PX = 1024 / 12;
function floorMat(R, draw, roughness) {
  const T = R.tex(1024, 768, draw);
  if (!T) return null;
  return new THREE.MeshStandardMaterial({ color: new THREE.Color('#FFFFFF'), roughness, map: T.tex });
}
function easeIn(t) { return t * t; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeIO(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/* Simple chair: seat box on a post with a back on the given side ('n' or 's'). */
function chair(R, u, v, seatMat, postMat, backSide, size = 0.45) {
  R.cyl(0.04, 0.04, 0.45, postMat, { x: u, y: 0, z: v });
  R.box(size, 0.08, size, seatMat, { x: u, y: 0.45, z: v });
  const bz = backSide === 'n' ? v - size / 2 + 0.03 : v + size / 2 - 0.03;
  R.box(size, 0.5, 0.06, seatMat, { x: u, y: 0.53, z: bz });
}
function woodChair(R, u, v, backSide) {
  R.box(0.45, 0.45, 0.45, R.m.wood, { x: u, y: 0, z: v });
  const bz = backSide === 'n' ? v - 0.2 : v + 0.2;
  R.box(0.45, 0.45, 0.05, R.m.wood, { x: u, y: 0.45, z: bz });
}
function easel(R, u, v, legMat, boardW, boardH, boardMat, T, frameMat) {
  for (const du of [-boardW / 2 + 0.2, boardW / 2 - 0.2]) {
    const leg = R.cyl(0.03, 0.03, 1.9, legMat, { x: u + du, y: 0, z: v - 0.12 }); leg.rotation.x = 0.15;
  }
  const back = R.cyl(0.03, 0.03, 1.9, legMat, { x: u, y: 0, z: v + 0.15 }); back.rotation.x = -0.3;
  R.box(boardW - 0.2, 0.04, 0.04, legMat, { x: u, y: 0.5, z: v - 0.02 });
  R.box(boardW, boardH, 0.04, boardMat, { x: u, y: 0.55, z: v });
  if (frameMat) {
    R.box(boardW + 0.1, 0.05, 0.05, frameMat, { x: u, y: 0.55 + boardH, z: v }); R.box(boardW + 0.1, 0.05, 0.05, frameMat, { x: u, y: 0.5, z: v });
    R.box(0.05, boardH, 0.05, frameMat, { x: u - boardW / 2 - 0.025, y: 0.55, z: v }); R.box(0.05, boardH, 0.05, frameMat, { x: u + boardW / 2 + 0.025, y: 0.55, z: v });
  }
  return R.dec(boardW - 0.04, boardH - 0.04, T, { x: u, y: 0.55 + boardH / 2, z: v + 0.03, emissive: 0.08 });
}
function wallClockFace(g, w, h) {
  const cx = w / 2, cy = h / 2, r = w * 0.47;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.strokeStyle = C.navy; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r - 4, 0, TAU); g.stroke();
  g.fillStyle = C.navy; g.font = `600 ${Math.round(w * 0.13)}px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU - Math.PI / 2, long = i % 3 === 0;
    g.lineWidth = long ? 6 : 3; g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); g.lineTo(cx + Math.cos(a) * (r - (long ? 30 : 20)), cy + Math.sin(a) * (r - (long ? 30 : 20))); g.stroke();
  }
  g.fillText('12', cx, cy - r * 0.62); g.fillText('3', cx + r * 0.62, cy); g.fillText('6', cx, cy + r * 0.62); g.fillText('9', cx - r * 0.62, cy);
  const d = new Date(), hr = (d.getHours() % 12) / 12 + d.getMinutes() / 720, mn = d.getMinutes() / 60;
  g.lineCap = 'round';
  g.strokeStyle = C.navy; g.lineWidth = 8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(hr * TAU) * r * 0.5, cy - Math.cos(hr * TAU) * r * 0.5); g.stroke();
  g.strokeStyle = C.aqua; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(mn * TAU) * r * 0.74, cy - Math.cos(mn * TAU) * r * 0.74); g.stroke();
  g.fillStyle = C.navy; g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();
}
function minuteRepaint(R, T) {
  if (!T) return;
  let lastMin = -1;
  R.anim(() => { const mnow = Math.floor(Date.now() / 60000); if (mnow !== lastMin) { lastMin = mnow; T.repaint(); } });
}
function paperCard(g, w, h, title, lines, o = {}) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = o.bg || C.paper; g.fillRect(0, 0, w, h);
  g.fillStyle = C.navy; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `600 ${o.titleSize || 56}px ${KANIT}`; g.fillText(title, 32, (o.titleSize || 56) + 24);
  g.font = `500 ${o.lineSize || 30}px ${INTER}`;
  const y0 = (o.titleSize || 56) + 80, pitch = o.pitch || ((o.lineSize || 30) * 1.9);
  lines.forEach((ln, i) => {
    const y = y0 + i * pitch;
    if (o.rule) { g.fillStyle = o.rule; g.fillRect(32, y + 12, w - 64, 3); }
    g.fillStyle = C.navy; g.fillText(ln, o.indent || 32, y);
  });
}

/* ---------- themes ---------- */
const THEMES = {};

THEMES.exec = {
  floor(R) {
    return floorMat(R, (g, w, h) => {
      for (let i = 0; i < 12; i++) for (let j = 0; j < 9; j++) { g.fillStyle = (i + j) % 2 ? '#D3DBE2' : '#CAD3DB'; g.fillRect(i * PX, j * PX, PX + 1, PX + 1); }
      g.strokeStyle = '#B6C1CA'; g.lineWidth = 3;
      for (let i = 0; i <= 12; i++) { g.beginPath(); g.moveTo(i * PX, 0); g.lineTo(i * PX, h); g.stroke(); }
      for (let j = 0; j <= 9; j++) { g.beginPath(); g.moveTo(0, j * PX); g.lineTo(w, j * PX); g.stroke(); }
      g.strokeStyle = C.navy; g.lineWidth = 0.3 * PX; g.strokeRect(0.15 * PX, 0.15 * PX, w - 0.3 * PX, h - 0.3 * PX);
    }, 0.35);
  },
  props(R) {
    const m = R.m;
    // 1 council table and 2 chairs
    R.box(4.0, 0.08, 1.3, m.darkWood, { x: 6, y: 0.72, z: 2.3 });
    R.box(0.3, 0.72, 1.1, m.darkWood, { x: 4.4, y: 0, z: 2.3 }); R.box(0.3, 0.72, 1.1, m.darkWood, { x: 7.6, y: 0, z: 2.3 });
    R.pl(3.6, 0.4, m.navy, { x: 6, y: 0.805, z: 2.3, rx: -Math.PI / 2 });
    R.cyl(0.1, 0.1, 0.04, m.brassSoft, { x: 6, y: 0.8, z: 2.3 });
    for (const u of [4.8, 6.0, 7.2]) { chair(R, u, 1.2, m.navy, m.iron, 'n'); chair(R, u, 3.4, m.navy, m.iron, 's'); }
    R.obs(3.9, 0.9, 8.1, 3.7);
    // 3 podium
    R.box(0.6, 1.1, 0.5, m.darkWood, { x: 1.6, y: 0, z: 1.4 });
    const top = R.box(0.66, 0.06, 0.56, m.darkWood, { x: 1.6, y: 1.1, z: 1.4 }); top.rotation.x = 0.3;
    R.dec(0.3, 0.3, R.S.T.tLogo, { x: 1.6, y: 0.6, z: 1.66 });
    R.cyl(0.01, 0.01, 0.3, m.iron, { x: 1.85, y: 1.12, z: 1.3 });
    R.sph(0.05, R.ramp(glow(C.bulbGlow, 0.6), 0.1, 0.6), { x: 1.85, y: 1.44, z: 1.3 });
    R.obs(1.25, 1.1, 1.95, 1.7);
    // 4 flags
    const flags = [];
    for (const [u, col, dir] of [[0.5, m.navy, 1], [11.5, m.aqua, -1]]) {
      R.cyl(0.15, 0.15, 0.05, m.iron, { x: u, y: 0, z: 1.6 });
      R.cyl(0.03, 0.03, 2.4, m.trim, { x: u, y: 0.05, z: 1.6 });
      const pivot = R.grp(u, 2.3, 1.6);
      const f = plane(0.6, 0.4, mat(col === m.navy ? C.navy : C.aqua, { roughness: 0.9, doubleSide: true }), { x: dir * 0.3, y: -0.2, z: 0, parent: pivot });
      f.rotation.y = Math.PI / 2 * 0.5;
      flags.push(pivot);
      R.obs(u - 0.2, 1.4, u + 0.2, 1.8);
    }
    R.anim(t => { const rz = 0.05 * Math.sin(TAU * 0.5 * t); for (const f of flags) f.rotation.z = rz; });
    // 5 wall clock and charters
    R.cyl(0.35, 0.35, 0.06, m.trim, { x: 9.4, y: 2.37, z: 8.96, rx: Math.PI / 2 });
    const clockT = R.tex(256, 256, wallClockFace);
    R.dec(0.62, 0.62, clockT, { x: 9.4, y: 2.4, z: 8.92, ry: Math.PI });
    minuteRepaint(R, clockT);
    const charter = R.stat(R.tex(240, 320, (g, w, h) => {
      g.fillStyle = C.navy; g.fillRect(0, 0, w, h);
      g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      fitFont(g, 'Thread Town charter', 600, KANIT, 28, 210, 16); g.fillText('Thread Town charter', w / 2, 60);
      g.fillStyle = 'rgba(226,233,238,0.5)'; for (let i = 0; i < 6; i++) g.fillRect(30, 100 + i * 32, 180 - (i % 3) * 30, 10);
    }));
    for (const u of [8.3, 10.5]) { R.box(0.66, 0.86, 0.03, m.darkWood, { x: u, y: 1.57, z: 8.97, castShadow: false }); R.dec(0.6, 0.8, charter, { x: u, y: 2.0, z: 8.95, ry: Math.PI }); }
  },
};

THEMES.embedded = {
  floor(R) {
    return floorMat(R, (g, w, h) => {
      g.fillStyle = '#DCE9F5'; g.fillRect(0, 0, w, h);
      g.strokeStyle = C.aqua; g.lineWidth = 0.4 * PX; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(6 * PX, 8.9 * PX); g.lineTo(6 * PX, 6.5 * PX); g.stroke();
      g.beginPath(); g.moveTo(6 * PX, 5.45 * PX); g.lineTo(6 * PX, 4.6 * PX); g.lineTo(8 * PX, 4.6 * PX); g.lineTo(8 * PX, 0.4 * PX); g.stroke();
    }, 0.7);
  },
  lights: { west: [2.6, 3.1, 1.8] },
  props(R) {
    const m = R.m, P = R.room._;
    // 1 patch panel
    R.box(3.0, 1.2, 0.12, m.iron, { x: 8.0, y: 0.1, z: 0.12, castShadow: false });
    const portMat = R.ramp(glow(C.aqua, 0.6), 0.2, 0.6);
    const ports = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 12; c++) {
      const u = 8 - 11 * 0.12 + c * 0.24, y = r === 0 ? 0.95 : 0.55;
      R.sph(0.035, portMat, { x: u, y, z: 0.215, ws: 12, hs: 8 });
      ports.push({ u, y });
    }
    const curves = [];
    for (let c = 0; c < 12; c++) {
      const a = ports[c], b = ports[12 + ((c + 2) % 12)];
      const curve = qcurve(a.u, a.y, 0.22, (a.u + b.u) / 2, 0.55, 0.65, b.u, b.y, 0.22);
      tube(R.g, curve, 0.012, c % 2 ? m.salmon : m.aqua, 14);
      curves.push(curve);
    }
    const beadMat = R.ramp(glow('#FFFFFF', 1.0), 0.2, 1.0);
    const beads = [2, 6, 10].map((ci, i) => ({ curve: curves[ci], mesh: R.sph(0.045, beadMat, { ws: 10, hs: 8 }), phase: i * 0.6 }));
    const tmp = new THREE.Vector3();
    R.anim(t => { for (const b of beads) { const s = ((t + b.phase) / 1.8) % 1; b.curve.getPoint(s, tmp); b.mesh.position.copy(tmp); } });
    R.dec(0.8, 0.16, R.label(400, 80, 'Partner lines', { bg: C.navy, fg: '#FFFFFF', weight: 600, family: INTER, size: 44 }), { x: 8.0, y: 1.2, z: 0.19 });
    R.obs(6.4, 0, 9.6, 0.35);
    // 2 meeting pod
    R.cyl(0.6, 0.55, 0.74, m.trim, { x: 2.6, y: 0, z: 1.8 });
    R.tor(0.6, 0.03, m.aqua, { x: 2.6, y: 0.74, z: 1.8, rx: Math.PI / 2 });
    for (const a of [0.5, 2.6, 4.7]) { const u = 2.6 + Math.cos(a) * 0.95, v = 1.8 + Math.sin(a) * 0.95; R.cyl(0.03, 0.03, 0.3, m.iron, { x: u, y: 0, z: v }); R.cyl(0.16, 0.16, 0.15, m.navy, { x: u, y: 0.3, z: v }); }
    R.box(0.3, 0.02, 0.2, m.iron, { x: 2.5, y: 0.74, z: 1.7 });
    R.box(0.26, 0.005, 0.16, R.ramp(glow(C.aqua, 0.5), 0.1, 0.5), { x: 2.5, y: 0.76, z: 1.7 });
    R.obs(1.5, 0.7, 3.7, 2.9);
    // 3 partner plates
    for (let i = 0; i < 8; i++) {
      const u = 8.0 + i * 0.5;
      R.cyl(0.2, 0.2, 0.03, i % 2 ? m.aqua : m.trim, { x: u, y: 1.985, z: 8.97, rx: Math.PI / 2 });
      R.dec(0.26, 0.26, R.S.T.plug, { x: u, y: 2.0, z: 8.95, ry: Math.PI });
    }
    R.dec(2.0, 0.2, R.label(800, 80, 'Live connections', { bg: '#FFFFFF', fg: C.navy, weight: 600, family: INTER, size: 48 }), { x: 9.75, y: 2.35, z: 8.96, ry: Math.PI });
    // 4 pendant lamp
    R.cyl(0.01, 0.01, 1.1, m.iron, { x: 2.6, y: 2.3, z: 1.8 });
    const dish = R.dome(0.35, m.trim, { x: 2.6, y: 2.3, z: 1.8 }); dish.scale.y = 0.4; dish.rotation.x = Math.PI;
    R.sph(0.06, R.ramp(glow(C.bulbGlow, 0.7), 0.1, 0.7), { x: 2.6, y: 2.22, z: 1.8 });
    // 5 status strip
    const strip = glow(C.aqua, 0.8); P.stripMat = strip; P.blinkT = 0;
    R.box(3.0, 0.08, 0.04, strip, { x: 8.0, y: 1.3, z: 0.14, castShadow: false });
    const aquaC = new THREE.Color(C.aqua), salmonC = new THREE.Color(C.salmon);
    R.anim((t, dt) => { if (P.blinkT > 0) { P.blinkT -= dt; strip.emissive.copy(salmonC); strip.color.copy(salmonC); } else { strip.emissive.copy(aquaC); strip.color.copy(aquaC); } });
  },
};

THEMES.compliance = {
  floor(R) {
    return floorMat(R, (g, w, h) => {
      const rng = seeded('compliance-floor');
      const rows = Math.ceil(9 / 0.25);
      for (let j = 0; j < rows; j++) {
        const jit = 0.9 + rng() * 0.2;
        g.fillStyle = shade(C.darkWood, jit); g.fillRect(0, j * 0.25 * PX, w, 0.25 * PX + 1);
        g.fillStyle = '#4F3620'; g.fillRect(0, j * 0.25 * PX, w, 2);
        const seam = rng() * w; g.fillRect(seam, j * 0.25 * PX, 2, 0.25 * PX);
      }
      g.fillStyle = C.brass; g.fillRect(5.2 * PX, 2.9 * PX, 1.6 * PX, 6.0 * PX);
      g.fillStyle = C.navy; g.fillRect(5.28 * PX, 2.98 * PX, 1.44 * PX, 5.84 * PX);
    }, 0.6);
  },
  plantSE: [11.3, 7.4],
  props(R) {
    const m = R.m, P = R.room._;
    // 1 judge's bench
    R.box(3.2, 0.2, 1.4, m.dais, { x: 6, y: 0, z: 1.3 });
    R.box(2.6, 1.3, 0.9, m.darkWood, { x: 6, y: 0.2, z: 1.3, radius: 0.04 });
    R.box(2.8, 0.08, 1.0, m.deskTop, { x: 6, y: 1.5, z: 1.3 });
    column(0.1, 1.3, m.trim, { x: 4.8, y: 0.2, z: 1.7, parent: R.g }); column(0.1, 1.3, m.trim, { x: 7.2, y: 0.2, z: 1.7, parent: R.g });
    R.obs(4.3, 0.5, 7.7, 2.1);
    // 2 the stamp
    const stamp = R.grp(6.6, 1.58, 1.3);
    box(0.5, 0.25, 0.5, m.blue, { parent: stamp });
    cyl(0.08, 0.12, 0.45, m.darkWood, { y: 0.25, parent: stamp });
    torus(0.1, 0.02, m.brass, { y: 0.27, rx: Math.PI / 2, parent: stamp });
    R.box(0.5, 0.04, 0.4, m.iron, { x: 5.9, y: 1.58, z: 1.3 });
    R.pl(0.4, 0.3, m.paper, { x: 6.6, y: 1.585, z: 1.3, rx: -Math.PI / 2 });
    const approvedT = R.label(256, 128, 'APPROVED', { fg: C.blue, weight: 600, size: 44 });
    const approved = R.dec(0.4, 0.2, approvedT, { x: 6.6, y: 1.59, z: 1.3, rx: -Math.PI / 2, emissive: 0.3 });
    approved.material.transparent = true; approved.material.opacity = 0;
    R.anim(t => {
      const p = t % 6.4;
      let lift = 0, fade = 0;
      if (p < 0.6) lift = 0.3 * easeOut(p / 0.6);
      else if (p < 1.1) lift = 0.3;
      else if (p < 1.6) lift = 0.3 * (1 - easeIn((p - 1.1) / 0.5));
      if (p >= 1.6 && p < 3.1) fade = 1 - (p - 1.6) / 1.5;
      stamp.position.y = 1.58 + lift;
      approved.material.opacity = fade;
    });
    // 3 scales of justice
    R.cyl(0.04, 0.04, 0.7, m.brassSoft, { x: 5.3, y: 1.58, z: 1.1 });
    const beam = R.grp(5.3, 2.28, 1.1);
    box(0.7, 0.04, 0.04, m.brassSoft, { y: -0.02, parent: beam });
    for (const dx of [-0.33, 0.33]) { cyl(0.006, 0.006, 0.25, m.brassSoft, { x: dx, y: -0.25, parent: beam }); cyl(0.12, 0.12, 0.02, m.brassSoft, { x: dx, y: -0.27, parent: beam }); }
    R.anim(t => { beam.rotation.z = 0.06 * Math.sin(TAU * 0.25 * t); });
    // 4 law shelves
    const spineCols = [C.navy, C.blue, C.gold, C.paper, C.salmon].map(c => mat(c, { roughness: 0.85 }));
    const rng = seeded('law-shelves');
    for (const u of [8.6, 10.6]) {
      R.box(1.6, 2.4, 0.35, m.darkWood, { x: u, y: 0, z: 8.825 });
      for (let s = 0; s < 4; s++) {
        const y = 0.15 + s * 0.55;
        R.box(1.5, 0.03, 0.3, m.wood, { x: u, y, z: 8.825 });
        for (let k = 0; k < 10; k++) R.box(0.12, 0.32 * (0.97 + rng() * 0.06), 0.28, spineCols[(s * 3 + k * 7 + (u > 9 ? 1 : 0)) % 5], { x: u - 0.7 + k * 0.145, y: y + 0.03, z: 8.8, castShadow: false });
      }
      R.obs(u - 0.9, 8.4, u + 0.9, 9.0);
    }
    R.cyl(0.015, 0.015, 3.6, m.brassSoft, { x: 9.6, y: 2.3, z: 8.6, rz: Math.PI / 2 });
    // 5 approvals checklist
    const rows = ['Policy set graded', 'Exceptions logged', 'Limits reviewed', 'Marketing copy cleared', 'Training complete', 'Audit replies filed'];
    P.ticks = -1;
    P.checklistT = R.tex(480, 640, (g, w, h) => {
      g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
      g.fillStyle = C.navy; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = `600 56px ${KANIT}`; g.fillText('Approvals', 32, 80);
      g.font = `500 30px ${INTER}`;
      rows.forEach((r, i) => {
        const y = 140 + i * 78;
        g.strokeStyle = C.navy; g.lineWidth = 4; g.strokeRect(32, y, 40, 40);
        if (i < P.ticks) { g.strokeStyle = C.green; g.lineWidth = 6; g.beginPath(); g.moveTo(40, y + 20); g.lineTo(50, y + 32); g.lineTo(66, y + 8); g.stroke(); }
        g.fillStyle = C.navy; g.fillText(r, 92, y + 30);
      });
    });
    R.stat(P.checklistT);
    R.dec(1.2, 1.6, P.checklistT, { x: 4.25, y: 2.0, z: 0.03, emissive: 0.08 });
  },
};

THEMES.fcc = {
  ceiling: '#0E1B2E',
  floor(R) { return mat(C.slate, { roughness: 0.85 }); },
  window: { emissive: 0.7, blinds: C.trim },
  lights: { color: C.bulbGlow, intensity: 10 },
  props(R) {
    const m = R.m;
    // floor chalk outline
    const chalk = R.tex(640, 360, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 6; g.lineJoin = 'round';
      g.beginPath(); g.arc(120, 180, 50, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(170, 150); g.lineTo(420, 120); g.lineTo(560, 80); g.moveTo(420, 120); g.lineTo(600, 200); g.moveTo(170, 210); g.lineTo(400, 230); g.lineTo(540, 320); g.moveTo(400, 230); g.lineTo(600, 280); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = `600 36px ${KANIT}`; g.textAlign = 'left'; g.fillText('CASE 014', 40, 330);
    });
    const outline = R.grp(9.0, 0.012, 4.6); outline.rotation.y = 0.4;
    const od = decal(1.6, 0.9, chalk ? chalk.tex : null, { rx: -Math.PI / 2, parent: outline }); od.material.transparent = true; od.material.opacity = 0.35;
    // 1 evidence board
    const evidence = R.tex(800, 560, (g, w, h) => {
      g.fillStyle = C.cork; g.fillRect(0, 0, w, h);
      const pts = [[120, 110], [400, 90], [680, 120], [110, 290], [690, 290], [130, 460], [400, 470], [670, 450], [400, 280]];
      g.strokeStyle = C.salmon; g.lineWidth = 4;
      for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(400, 280); g.stroke(); }
      pts.forEach(([x, y], i) => {
        g.fillStyle = '#FFFFFF'; g.fillRect(x - 55, y - 65, 110, 130);
        if (i < 8) { g.fillStyle = C.salmon; g.beginPath(); g.arc(x, y - 15, 30, 0, TAU); g.fill(); g.fillStyle = '#B9C4CC'; g.fillRect(x - 45, y + 35, 90, 18); }
        else { g.fillStyle = C.navy; g.font = `600 72px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x, y); }
      });
      const notes = [['Follow the money', 230, 180], ['Shell co.', 560, 190], ['Wire 03:12', 240, 380], ['Ask Glorb', 560, 380]];
      for (const [tx, x, y] of notes) { g.save(); g.translate(x, y); g.rotate(0.05); g.fillStyle = C.brass; g.fillRect(-60, -40, 120, 80); g.fillStyle = C.navy; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, tx, 500, INTER, 20, 110, 12); g.fillText(tx, 0, 0); g.restore(); }
    });
    R.stat(evidence);
    easel(R, 3.2, 1.6, m.iron, 2.0, 1.4, m.cork, evidence, null);
    R.obs(2.1, 1.1, 4.3, 2.0);
    // 2 filing cabinets
    for (const u of [7.4, 8.0, 8.6]) {
      R.box(0.5, 1.3, 0.6, m.iron, { x: u, y: 0, z: 0.3 });
      for (let d = 0; d < 3; d++) {
        const open = u === 8.0 && d === 2 ? 0.25 : 0;
        R.box(0.44, 0.36, 0.02, m.slate, { x: u, y: 0.08 + d * 0.41, z: 0.61 + open, castShadow: false });
        R.box(0.1, 0.02, 0.03, m.brass, { x: u, y: 0.26 + d * 0.41, z: 0.63 + open });
        if (open) { R.box(0.44, 0.3, 0.25, m.iron, { x: u, y: 0.1 + d * 0.41, z: 0.47 }); R.pl(0.3, 0.25, m.paper, { x: u, y: 1.05, z: 0.5, rx: -1.3 }); }
      }
    }
    R.obs(7.1, 0, 8.9, 0.65);
    // 3 detective's desk
    R.box(1.6, 0.75, 0.8, m.darkWood, { x: 9.8, y: 0, z: 2.2 });
    R.cyl(0.015, 0.015, 0.5, m.brassSoft, { x: 10.3, y: 0.75, z: 2.0 });
    const shade1 = R.dome(0.16, R.ramp(glow(C.green, 0.7), 0.15, 0.7), { x: 10.3, y: 1.2, z: 2.0 }); shade1.rotation.x = Math.PI + 0.5;
    R.sph(0.04, R.ramp(glow(C.bulb, 0.8), 0.1, 0.8), { x: 10.3, y: 1.17, z: 2.03 });
    R.tor(0.1, 0.012, m.iron, { x: 9.4, y: 0.76, z: 2.1, rx: Math.PI / 2 });
    R.cyl(0.1, 0.1, 0.005, R.room._.glassMat, { x: 9.4, y: 0.755, z: 2.1 });
    R.cyl(0.015, 0.015, 0.2, m.iron, { x: 9.55, y: 0.76, z: 2.1, rz: -Math.PI / 2 });
    R.pl(0.5, 0.35, m.paper, { x: 9.9, y: 0.755, z: 2.3, rx: -Math.PI / 2 });
    R.cyl(0.05, 0.05, 0.1, m.trim, { x: 10.4, y: 0.75, z: 2.45 });
    woodChair(R, 9.8, 3.0, 's');
    R.obs(8.9, 1.7, 10.7, 3.3);
    // 4 ceiling searchlight
    R.box(0.2, 0.2, 0.2, m.iron, { x: 6, y: 3.2, z: 3.6 });
    const yaw = R.grp(6, 3.2, 3.6);
    const pitch = new THREE.Group(); pitch.rotation.x = 0.5; yaw.add(pitch);
    cyl(0.14, 0.14, 0.25, m.iron, { y: -0.25, parent: pitch });
    cyl(0.12, 0.12, 0.02, R.ramp(glow(C.bulb, 0.9), 0.1, 0.9), { y: -0.27, parent: pitch });
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.bulb), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = cone(0.7, 3.2, beamMat, { y: -3.2, parent: pitch, castShadow: false, receiveShadow: false });
    beam.rotation.x = Math.PI; beam.position.y = -1.6 - 0.27; beam.renderOrder = 5;
    R.anim((t, dt, ramp) => { yaw.rotation.y = 1.4 * Math.sin(TAU * 0.08 * t); beam.visible = ramp > 0.3; beamMat.opacity = 0.12 * ramp; });
    // 5 wall safe
    R.box(0.6, 0.6, 0.3, m.iron, { x: 9.0, y: 1.2, z: 8.85 });
    R.cyl(0.08, 0.08, 0.04, m.silver, { x: 9.0, y: 1.48, z: 8.68, rx: Math.PI / 2 });
    R.box(0.15, 0.03, 0.03, m.brass, { x: 9.2, y: 1.3, z: 8.68 });
    R.dec(0.5, 0.3, R.label(250, 150, 'FCC', { bg: C.salmon, fg: '#FFFFFF', size: 90, radius: 30 }), { x: 9.0, y: 2.2, z: 8.96, ry: Math.PI });
  },
};

THEMES.ops = {
  floor(R) {
    return floorMat(R, (g, w, h) => {
      g.fillStyle = C.plinth; g.fillRect(0, 0, w, h);
      const rng = seeded('ops-floor'); g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let i = 0; i < 400; i++) g.fillRect(rng() * w, rng() * h, 3, 3);
      g.save(); g.beginPath(); g.rect(0.3 * PX, 0.9 * PX, 11.4 * PX, 0.3 * PX); g.clip();
      for (let x = -1; x < 13; x += 0.4) { g.fillStyle = Math.round(x / 0.4) % 2 ? C.brass : C.iron; g.beginPath(); g.moveTo(x * PX, 0.9 * PX); g.lineTo((x + 0.2) * PX, 0.9 * PX); g.lineTo((x + 0.5) * PX, 1.2 * PX); g.lineTo((x + 0.3) * PX, 1.2 * PX); g.closePath(); g.fill(); }
      g.restore();
      g.fillStyle = C.navy; g.font = `600 ${Math.round(0.6 * PX)}px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('RECEIVING', 3.0 * PX, 4.0 * PX); g.fillText('DISPATCH', 9.0 * PX, 4.0 * PX);
      g.strokeStyle = C.trim; g.lineWidth = 6; if (g.setLineDash) g.setLineDash([30, 24]);
      g.beginPath(); g.moveTo(6 * PX, 6.6 * PX); g.lineTo(6 * PX, 2.4 * PX); g.stroke(); if (g.setLineDash) g.setLineDash([]);
    }, 0.95);
  },
  props(R) {
    const m = R.m, P = R.room._;
    // 1 pallet racks
    const rng = seeded('ops-racks');
    for (const [u0, u1] of [[1.0, 3.4], [8.6, 10.5]]) {
      const cu = (u0 + u1) / 2, wdt = u1 - u0;
      for (const px of [u0 + 0.04, u1 - 0.04]) for (const pz of [1.49, 2.01]) R.box(0.08, 2.6, 0.08, m.iron, { x: px, y: 0, z: pz });
      for (const y of [0.45, 1.3, 2.15]) {
        R.box(wdt, 0.05, 0.6, m.brassSoft, { x: cu, y, z: 1.75 });
        for (const k of [0, 1]) R.box(0.55, 0.55, 0.5, m.wood, { x: u0 + 0.4 + k * (wdt - 0.8) + (rng() - 0.5) * 0.1, y: y + 0.05, z: 1.75 });
      }
      R.cyl(0.25, 0.25, 0.5, m.green, { x: cu, y: 0.5, z: 1.75 });
      R.obs(u0 - 0.1, 1.35, u1 + 0.1, 2.15);
    }
    // 2 conveyor
    R.box(3.0, 0.1, 0.6, m.ink, { x: 6, y: 0.7, z: 1.6 });
    for (const lx of [4.6, 7.4]) for (const lz of [1.35, 1.85]) R.box(0.06, 0.7, 0.06, m.iron, { x: lx, y: 0, z: lz });
    for (const rx of [4.5, 7.5]) R.cyl(0.08, 0.08, 0.6, m.silver, { x: rx, y: 0.75, z: 1.6, rx: Math.PI / 2 });
    R.box(0.08, 0.6, 0.1, m.iron, { x: 5.65, y: 0.8, z: 1.6 }); R.box(0.08, 0.6, 0.1, m.iron, { x: 6.35, y: 0.8, z: 1.6 }); R.box(0.7, 0.08, 0.1, m.iron, { x: 6, y: 1.4, z: 1.6 });
    const scanMat = glow(C.salmon, 0.8); R.ramp(scanMat, 0.2, 0.8);
    const scanLine = R.box(0.6, 0.02, 0.02, scanMat, { x: 6, y: 1.35, z: 1.6, castShadow: false });
    const parcels = [0, 1, 2].map(i => { const p = R.grp(4.6 + i, 0.8, 1.6); box(0.35, 0.3, 0.35, m.wood, { parent: p }); box(0.36, 0.06, 0.36, m.salmon, { y: 0.12, parent: p }); return { g: p, u: 4.6 + i, wasWest: true }; });
    let flash = 0;
    const white = new THREE.Color('#FFFFFF'), salmonC = new THREE.Color(C.salmon);
    R.anim((t, dt) => {
      for (const p of parcels) {
        p.u += 0.4 * dt; if (p.u > 7.4) p.u -= 2.8;
        const west = p.u < 6; if (p.wasWest && !west) flash = 0.2; p.wasWest = west;
        p.g.position.x = p.u;
      }
      flash = Math.max(0, flash - dt);
      scanMat.emissive.copy(flash > 0 ? white : salmonC);
    });
    R.obs(4.4, 1.2, 7.6, 2.0);
    // 3 barrels and hand truck
    for (const [u, v] of [[0.8, 7.6], [1.45, 7.95]]) { R.cyl(0.3, 0.3, 0.8, m.green, { x: u, y: 0, z: v }); R.cyl(0.31, 0.31, 0.04, m.trim, { x: u, y: 0.25, z: v }); R.cyl(0.31, 0.31, 0.04, m.trim, { x: u, y: 0.55, z: v }); }
    const truck = R.grp(2.3, 0, 8.2);
    torus(0.14, 0.03, m.iron, { x: -0.22, y: 0.14, rx: 0, ry: Math.PI / 2, parent: truck }); torus(0.14, 0.03, m.iron, { x: 0.22, y: 0.14, ry: Math.PI / 2, parent: truck });
    box(0.5, 0.02, 0.3, m.iron, { y: 0.05, z: -0.1, parent: truck });
    for (const dx of [-0.2, 0.2]) { const rail = cyl(0.015, 0.015, 1.1, m.iron, { x: dx, y: 0.05, z: 0.05, parent: truck }); rail.rotation.x = -0.25; }
    box(0.4, 0.4, 0.3, m.wood, { y: 0.07, z: -0.08, parent: truck });
    R.obs(0.4, 7.2, 2.7, 8.6);
    // 4 signs and gear emblem
    const signOpts = { bg: C.green, fg: '#FFFFFF', size: 110 };
    R.dec(2.0, 0.4, R.stat(R.label(800, 160, 'Receiving', signOpts)), { x: 2.2, y: 3.1, z: 0.03 });
    R.dec(2.0, 0.4, R.stat(R.label(800, 160, 'Dispatch', signOpts)), { x: 9.8, y: 3.1, z: 0.03 });
    const gear = R.grp(6, 3.0, 0.08);
    torus(0.25, 0.07, m.green, { parent: gear });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; const tooth = box(0.1, 0.12, 0.1, m.green, { x: Math.cos(a) * 0.3, y: Math.sin(a) * 0.3 - 0.06, parent: gear }); tooth.rotation.z = a; }
    R.anim((t, dt) => { gear.rotation.z += (P.stats.active > 0 ? 1.0 : 0.3) * dt; });
    // 5 time clock
    R.box(0.3, 0.4, 0.12, m.iron, { x: 7.6, y: 1.3, z: 8.94 });
    const clockT = R.tex(240, 100, (g, w, h) => { g.fillStyle = C.ink; g.fillRect(0, 0, w, h); const d = new Date(); const s = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); g.fillStyle = C.aqua; g.font = `600 64px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, w / 2, h / 2 + 4); });
    R.dec(0.24, 0.1, clockT, { x: 7.6, y: 1.6, z: 8.87, ry: Math.PI, emissive: 0.8 });
    minuteRepaint(R, clockT);
    for (let i = 0; i < 6; i++) R.box(0.08, 0.2, 0.03, m.paper, { x: 8.1 + i * 0.1, y: 1.3, z: 8.95, castShadow: false });
    R.box(0.66, 0.03, 0.06, m.iron, { x: 8.35, y: 1.27, z: 8.94 });
  },
};

THEMES.data = {
  ceiling: '#0E1B2E',
  ceilingTex(R) {
    return R.tex(1024, 768, (g, w, h) => {
      g.fillStyle = '#0E1B2E'; g.fillRect(0, 0, w, h);
      const rng = seeded('data-ceiling'); g.fillStyle = '#FFFFFF';
      for (let i = 0; i < 80; i++) { g.beginPath(); g.arc(rng() * w, rng() * h, 1 + rng() * 1.5, 0, TAU); g.fill(); }
      g.strokeStyle = C.lilac; g.lineWidth = 6; g.globalAlpha = 0.6; g.beginPath(); g.arc(w * 0.5, h * 1.4, h * 0.95, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.globalAlpha = 1;
    });
  },
  floor(R) { return mat('#14283D', { roughness: 0.5 }); },
  window: { emissive: 0.6, curtain: 0.85 },
  lights: { color: '#C9BFEA', intensity: 12 },
  props(R) {
    const m = R.m;
    const starMap = R.tex(1200, 800, (g, w, h) => {
      g.fillStyle = C.navy; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(117,204,208,0.35)'; g.lineWidth = 2;
      for (let x = 0; x <= w; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y <= h; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      const rng = seeded('data-floor'); g.fillStyle = '#FFFFFF';
      for (let i = 0; i < 120; i++) { g.beginPath(); g.arc(rng() * w, rng() * h, 1.5 + rng() * 2.5, 0, TAU); g.fill(); }
      g.strokeStyle = C.lilac; g.lineWidth = 5; g.beginPath(); g.moveTo(60, 700); g.bezierCurveTo(300, 200, 800, 150, 1140, 600); g.stroke();
    });
    R.dec(6.0, 4.0, starMap, { x: 6, y: 0.012, z: 4.4, rx: -Math.PI / 2, emissive: 0.2 });
    // 1 dashboard screen
    for (const u of [4.9, 7.1]) R.box(0.08, 1.0, 0.08, m.iron, { x: u, y: 0, z: 1.3 });
    R.box(2.4, 1.3, 0.06, m.iron, { x: 6, y: 1.0, z: 1.3 });
    const dash = R.stat(R.tex(1150, 600, (g, w, h) => {
      g.fillStyle = C.navy; g.fillRect(0, 0, w, h);
      g.fillStyle = '#FFFFFF'; g.font = `600 64px ${KANIT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('Daily dashboards', 48, 92);
      const kpis = [['DDA', '1.8B'], ['COD', '640M'], ['NIM', '3.9']];
      kpis.forEach(([k, v], i) => { const x = 48 + i * 360; g.fillStyle = 'rgba(255,255,255,0.07)'; rr(g, x, 130, 330, 150, 20); g.fill(); g.fillStyle = 'rgba(226,233,238,0.85)'; g.font = `500 30px ${INTER}`; g.fillText(k, x + 24, 180); g.fillStyle = C.aqua; g.font = `600 72px ${KANIT}`; g.fillText(v, x + 24, 258); });
      g.strokeStyle = C.lilac; g.lineWidth = 4; g.beginPath(); g.moveTo(60, 540); g.lineTo(240, 480); g.lineTo(420, 500); g.lineTo(600, 400); g.lineTo(780, 420); g.lineTo(1080, 330); g.stroke();
    }));
    const dashDecal = R.dec(2.3, 1.2, dash, { x: 6, y: 1.65, z: 1.34, emissive: 0.7 }); R.ramp(dashDecal.material, 0.2, 0.7);
    const barMat = R.ramp(glow(C.aqua, 0.7), 0.2, 0.7);
    const bars = [0.25, 0.4, 0.3, 0.5, 0.42].map((hh, i) => { const g2 = R.grp(5.1 + i * 0.45, 1.1, 1.38); box(0.2, hh, 0.02, barMat, { parent: g2, castShadow: false }); return g2; });
    R.anim(t => { bars.forEach((b, i) => { b.scale.y = 1 + 0.08 * Math.sin(TAU * 0.2 * t + i * 0.9); }); });
    R.obs(4.7, 1.1, 7.3, 1.5);
    // 2 telescope
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const leg = R.cyl(0.025, 0.025, 1.2, m.iron, { x: 9.4 + Math.cos(a) * 0.18, y: 0, z: 1.9 + Math.sin(a) * 0.18 }); leg.rotation.x = Math.sin(a) * 0.3; leg.rotation.z = -Math.cos(a) * 0.3; }
    const scope = R.grp(9.4, 1.2, 1.9); scope.rotation.y = 0.6;
    const tubeM = cyl(0.12, 0.12, 1.6, m.iron, { y: -0.8, parent: scope }); tubeM.rotation.x = -0.9;
    const ring1 = cyl(0.13, 0.13, 0.04, m.silver, { y: -0.8, parent: scope }); ring1.rotation.x = -0.9; ring1.position.set(0, 0.62, -0.5);
    const finder = cyl(0.03, 0.03, 0.3, m.iron, { x: 0.14, y: -0.15, parent: scope }); finder.rotation.x = -0.9;
    sphere(0.04, R.ramp(glow(C.aqua, 0.4), 0.1, 0.4), { y: -0.63, z: 0.5, parent: scope });
    R.obs(8.9, 1.4, 9.9, 2.4);
    // 3 bar chart sculpture
    R.box(2.0, 0.06, 0.4, m.trim, { x: 2.4, y: 0, z: 1.6 });
    const cols = [m.purple, m.lilac, m.aqua, m.purple, m.lilac], hts = [0.6, 1.0, 0.8, 1.4, 1.2];
    const sculpt = hts.map((hh, i) => { const g2 = R.grp(1.6 + i * 0.4, 0.06, 1.6); box(0.3, hh, 0.3, cols[i], { parent: g2 }); return g2; });
    R.anim(t => { sculpt.forEach((b, i) => { b.scale.y = 1 + 0.1 * Math.sin(TAU * 0.2 * t + i * 0.3 * TAU * 0.2); }); });
    R.obs(1.3, 1.3, 3.5, 1.9);
    // 4 planet mobile
    R.cyl(0.006, 0.006, 0.5, m.iron, { x: 6, y: 2.9, z: 3.6 });
    const mobile = R.grp(6, 2.9, 3.6);
    sphere(0.05, m.iron, { parent: mobile });
    const planets = [[0.5, 0.18, m.lilac, -0.3], [0.8, 0.12, m.aqua, -0.15], [1.1, 0.09, m.salmon, -0.45]];
    planets.forEach(([rad, r, pm, dy], i) => {
      const a = i / 3 * TAU;
      const arm = cyl(0.004, 0.004, rad, m.iron, { parent: mobile }); arm.rotation.z = Math.PI / 2; arm.rotation.y = -a; arm.position.set(Math.cos(a) * rad / 2, 0, Math.sin(a) * rad / 2);
      cyl(0.004, 0.004, -dy, m.iron, { x: Math.cos(a) * rad, y: dy, z: Math.sin(a) * rad, parent: mobile });
      sphere(r, pm, { x: Math.cos(a) * rad, y: dy, z: Math.sin(a) * rad, parent: mobile });
      if (i === 2) { const ring = torus(0.14, 0.01, m.silver, { x: Math.cos(a) * rad, y: dy, z: Math.sin(a) * rad, parent: mobile }); ring.rotation.x = Math.PI / 2 + 0.3; }
    });
    R.anim((t, dt) => { mobile.rotation.y += 0.15 * dt; });
    // 5 globe
    R.cyl(0.1, 0.1, 0.9, m.darkWood, { x: 1.2, y: 0, z: 2.6 });
    R.tor(0.33, 0.015, m.brassSoft, { x: 1.2, y: 1.2, z: 2.6 });
    const globeT = R.tex(512, 256, (g, w, h) => {
      g.fillStyle = C.navy; g.fillRect(0, 0, w, h); g.fillStyle = C.aqua;
      const rng = seeded('globe');
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(rng() * w, 40 + rng() * (h - 80), 30 + rng() * 60, 20 + rng() * 40, rng(), 0, TAU); g.fill(); }
    });
    const globeMat = globeT ? new THREE.MeshStandardMaterial({ map: globeT.tex, roughness: 0.6 }) : m.navy;
    const globe = R.sph(0.3, globeMat, { x: 1.2, y: 1.2, z: 2.6 });
    R.anim((t, dt) => { globe.rotation.y += 0.25 * dt; });
    R.obs(0.9, 2.3, 1.5, 2.9);
  },
};

THEMES.credit = {
  pictureRail: C.brass,
  floor(R) {
    return floorMat(R, (g, w, h) => {
      g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
      const rng = seeded('marble'); g.strokeStyle = 'rgba(216,207,192,0.6)'; g.lineWidth = 6; g.lineCap = 'round';
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(rng() * w, rng() * h); g.bezierCurveTo(rng() * w, rng() * h, rng() * w, rng() * h, rng() * w, rng() * h); g.stroke(); }
      g.strokeStyle = C.gold; g.lineWidth = 4;
      for (let x = 0; x <= 12; x += 2) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, h); g.stroke(); }
      for (let y = 0.5; y <= 9; y += 2) { g.beginPath(); g.moveTo(0, y * PX); g.lineTo(w, y * PX); g.stroke(); }
      g.beginPath(); g.moveTo(6 * PX, 2.5 * PX); g.lineTo(8 * PX, 4.5 * PX); g.lineTo(6 * PX, 6.5 * PX); g.lineTo(4 * PX, 4.5 * PX); g.closePath(); g.stroke();
    }, 0.3);
  },
  props(R) {
    const m = R.m, P = R.room._, room = R.room;
    // 1 vault door
    R.cyl(0.62, 0.62, 0.22, m.iron, { x: 7.75, y: 1.19, z: 0.11, rx: Math.PI / 2 });
    const pivot = R.grp(7.21, 1.3, 0.25);
    const disc = cyl(0.54, 0.54, 0.18, m.gold, { x: 0.54, y: -0.09, parent: pivot }); disc.rotation.x = Math.PI / 2;
    const wheel = new THREE.Group(); wheel.position.set(0.54, 0, 0.12); pivot.add(wheel);
    torus(0.22, 0.03, m.trim, { parent: wheel });
    for (let i = 0; i < 3; i++) { const sp = box(0.44, 0.03, 0.03, m.trim, { y: -0.015, parent: wheel }); sp.rotation.z = i * Math.PI / 3; }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; sphere(0.04, m.trim, { x: 0.54 + Math.cos(a) * 0.47, y: Math.sin(a) * 0.47, z: 0.1, parent: pivot, ws: 10, hs: 8 }); }
    R.box(1.0, 1.0, 0.5, m.ink, { x: 7.75, y: 0.8, z: -0.25 });
    R.pl(0.9, 0.9, R.ramp(glow(C.brass, 0.6), 0.1, 0.6), { x: 7.75, y: 1.3, z: -0.45 });
    for (let i = 0; i < 6; i++) R.box(0.3, 0.1, 0.15, m.brass, { x: 7.42 + (i % 3) * 0.33, y: 0.85 + Math.floor(i / 3) * 0.1, z: -0.3 });
    let openT = 0, leftAt = -1e9, spin = 0;
    const doorAnchor = { x: room.origin.x + 7.75, z: room.origin.z + 0.6 };
    R.anim((t, dt) => {
      const pp = playerPos(R.ctx);
      let near;
      if (pp) near = Math.hypot(pp.x - doorAnchor.x, pp.z - doorAnchor.z) < 1.4;
      else near = (t % 8) < 4;
      if (near) leftAt = t;
      const want = near || t - leftAt < 2 ? 1 : 0;
      openT = clamp(openT + (want ? dt / 1.0 : -dt / 1.0), 0, 1);
      pivot.rotation.y = -1.3 * easeIO(openT);
      if (want && spin < 1) spin = Math.min(1, spin + dt / 1.2); else if (!want && spin > 0) spin = Math.max(0, spin - dt / 1.2);
      wheel.rotation.z = TAU * spin;
    });
    R.obs(7.1, 0, 8.4, 0.4);
    // 2 teller counter
    R.box(3.0, 1.1, 0.6, m.darkWood, { x: 2.6, y: 0, z: 1.7 });
    R.box(3.1, 0.06, 0.8, m.paper, { x: 2.6, y: 1.1, z: 1.7 });
    const paneMat = P.glassMat.clone(); paneMat.transparent = true; paneMat.opacity = 0.35;
    ['1', '2', '3'].forEach((n, i) => {
      const u = 1.6 + i;
      R.box(0.7, 0.04, 0.04, m.brass, { x: u, y: 1.16, z: 1.7 }); R.box(0.7, 0.04, 0.04, m.brass, { x: u, y: 1.92, z: 1.7 });
      R.box(0.04, 0.8, 0.04, m.brass, { x: u - 0.33, y: 1.16, z: 1.7 }); R.box(0.04, 0.8, 0.04, m.brass, { x: u + 0.33, y: 1.16, z: 1.7 });
      R.box(0.62, 0.6, 0.02, paneMat, { x: u, y: 1.32, z: 1.7, castShadow: false });
      R.dec(0.16, 0.16, R.label(64, 64, n, { bg: C.brass, fg: C.navy, size: 44, radius: 8 }), { x: u, y: 2.06, z: 1.73 });
    });
    const posts = [[1.6, 3.0], [2.6, 3.0], [3.6, 3.0], [3.6, 4.0]];
    for (const [u, v] of posts) { R.cyl(0.04, 0.04, 0.9, m.brass, { x: u, y: 0, z: v }); R.sph(0.06, m.brass, { x: u, y: 0.93, z: v, ws: 12, hs: 8 }); R.cyl(0.12, 0.12, 0.03, m.brass, { x: u, y: 0, z: v }); }
    for (let i = 0; i < 3; i++) { const a = posts[i], b = posts[i + 1]; tube(R.g, qcurve(a[0], 0.85, a[1], (a[0] + b[0]) / 2, 0.65, (a[1] + b[1]) / 2, b[0], 0.85, b[1]), 0.025, m.salmon, 12); }
    R.obs(1.0, 1.3, 4.2, 2.2); R.obs(1.4, 2.8, 3.8, 3.2); R.obs(3.4, 3.2, 3.8, 4.2);
    // 3 coin sculpture
    R.box(0.6, 0.5, 0.6, m.plinth, { x: 10.0, y: 0, z: 1.5 });
    for (let i = 0; i < 5; i++) R.cyl(0.25, 0.25, 0.06, m.brass, { x: 10.0 + (i % 2 ? 0.03 : -0.03), y: 0.5 + i * 0.06, z: 1.5 });
    const coin = R.grp(10.0, 1.15, 1.5);
    const cdisc = cyl(0.3, 0.3, 0.06, m.gold, { y: -0.03, parent: coin }); cdisc.rotation.x = Math.PI / 2;
    decal(0.4, 0.4, R.S.T.tLogo ? R.S.T.tLogo.tex : null, { z: 0.035, parent: coin }); decal(0.4, 0.4, R.S.T.tLogo ? R.S.T.tLogo.tex : null, { z: -0.035, ry: Math.PI, parent: coin });
    R.anim((t, dt) => { coin.rotation.y += 0.4 * dt; });
    R.obs(9.7, 1.2, 10.3, 1.8);
    // 4 ledger table
    R.box(1.4, 0.76, 0.8, m.darkWood, { x: 8.6, y: 0, z: 7.4 });
    R.cyl(0.08, 0.08, 0.03, m.brass, { x: 9.0, y: 0.76, z: 7.2 }); R.cyl(0.01, 0.01, 0.3, m.brass, { x: 9.0, y: 0.79, z: 7.2 });
    R.dome(0.14, R.ramp(glow(C.green, 0.6), 0.15, 0.6), { x: 9.0, y: 1.06, z: 7.2 });
    const l1 = R.pl(0.3, 0.4, m.paper, { x: 8.35, y: 0.78, z: 7.4, rx: -Math.PI / 2 }); l1.rotation.y = 0.15;
    const l2 = R.pl(0.3, 0.4, m.paper, { x: 8.65, y: 0.78, z: 7.4, rx: -Math.PI / 2 }); l2.rotation.y = -0.15;
    R.cyl(0.03, 0.03, 0.05, m.iron, { x: 8.1, y: 0.76, z: 7.2 });
    woodChair(R, 8.6, 6.6, 'n');
    R.obs(7.9, 6.3, 9.3, 7.8);
    // 5 night deposit and rate board
    R.box(0.5, 0.6, 0.2, m.brass, { x: 9.0, y: 0.8, z: 8.9 }); R.box(0.3, 0.04, 0.03, m.iron, { x: 9.0, y: 1.2, z: 8.78 });
    const rates = R.stat(R.tex(700, 400, (g, w, h) => paperCard(g, w, h, "Today's rates", ['Prime 7.50', 'Deposit 4.10', 'Card 18.99', 'Embedded 5.25'], { rule: C.gold })));
    R.dec(1.4, 0.8, rates, { x: 9.4, y: 2.2, z: 8.96, ry: Math.PI });
  },
};

THEMES.finance = {
  floor(R) {
    return floorMat(R, (g, w, h) => {
      g.fillStyle = '#CFE0E0'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(46,139,142,0.12)'; g.lineWidth = 2;
      for (let x = 0; x <= 12; x += 0.5) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, h); g.stroke(); }
      for (let y = 0; y <= 9; y += 0.5) { g.beginPath(); g.moveTo(0, y * PX); g.lineTo(w, y * PX); g.stroke(); }
      g.strokeStyle = '#B8CFCF'; g.lineWidth = 0.4 * PX; g.strokeRect(0.2 * PX, 0.2 * PX, w - 0.4 * PX, h - 0.4 * PX);
    }, 1.0);
  },
  props(R) {
    const m = R.m;
    // 1 ticker
    R.box(4.4, 0.5, 0.08, m.navy, { x: 6, y: 2.8, z: 0.06, castShadow: false });
    R.box(4.46, 0.03, 0.09, m.silver, { x: 6, y: 3.3, z: 0.06, castShadow: false }); R.box(4.46, 0.03, 0.09, m.silver, { x: 6, y: 2.77, z: 0.06, castShadow: false });
    const tickerText = 'THRD 42.10 up 1.2  ·  DDA 1.8B  ·  COD 640M  ·  NIM 3.9  ·  GL balanced  ·  Close 17:00  ·  ';
    const tickT = R.stat(R.tex(1024, 100, (g, w, h) => {
      g.fillStyle = C.navy; g.fillRect(0, 0, w, h);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      fitFont(g, tickerText, 600, KANIT, 56, w - 10, 20);
      const parts = tickerText.split('·');
      let x = 8;
      parts.forEach((p, i) => { g.fillStyle = i % 2 ? '#FFFFFF' : C.aqua; g.fillText(p, x, h / 2 + 2); x += measure(g, p); if (i < parts.length - 1) { g.fillStyle = C.silver; g.fillText('·', x, h / 2 + 2); x += measure(g, '·'); } });
    }, { repeat: true }));
    const tick = R.dec(4.3, 0.42, tickT, { x: 6, y: 3.05, z: 0.11, emissive: 0.85 }); R.ramp(tick.material, 0.3, 0.85);
    if (tickT) R.anim((t, dt) => { tickT.tex.offset.x = (tickT.tex.offset.x + 0.08 * dt) % 1; });
    // 2 workstations
    const candles = R.S.T.candles || (R.S.T.candles = R.tex(860, 500, (g, w, h) => {
      g.fillStyle = C.navy; g.fillRect(0, 0, w, h); const rng = seeded('candles'); let y = 300;
      for (let i = 0; i < 28; i++) { const o = y, c = clamp(o + (rng() - 0.5) * 80, 60, 440); const x = 20 + i * 30; g.fillStyle = c < o ? C.green : C.salmon; g.fillRect(x + 8, Math.min(o, c), 14, Math.abs(c - o) + 2); g.fillRect(x + 14, Math.min(o, c) - 15, 2, Math.abs(c - o) + 30); y = c; }
      g.strokeStyle = C.teal; g.lineWidth = 4; g.beginPath(); g.moveTo(20, 320); g.bezierCurveTo(300, 260, 500, 330, 840, 240); g.stroke();
    }));
    for (const u of [2.4, 9.6]) {
      R.box(1.6, 0.05, 0.7, m.deskTop, { x: u, y: 0.7, z: 1.8 });
      for (const dx of [-0.75, 0.75]) for (const dz of [-0.3, 0.3]) R.box(0.05, 0.7, 0.05, m.iron, { x: u + dx, y: 0, z: 1.8 + dz });
      R.cyl(0.03, 0.03, 0.15, m.iron, { x: u, y: 0.75, z: 1.6 });
      R.box(0.9, 0.55, 0.04, m.iron, { x: u, y: 0.9, z: 1.6 });
      R.dec(0.2, 0.2, R.S.T.tLogoDark, { x: u, y: 1.18, z: 1.57, ry: Math.PI });
      const face = R.dec(0.86, 0.5, candles, { x: u, y: 1.18, z: 1.63, emissive: 0.7 }); R.ramp(face.material, 0.2, 0.7);
      R.box(0.5, 0.02, 0.18, m.iron, { x: u, y: 0.75, z: 1.95 });
      R.box(0.12, 0.02, 0.18, m.silver, { x: u + 0.5, y: 0.75, z: 1.95 });
      const tape = R.pl(0.1, 0.2, m.paper, { x: u + 0.5, y: 0.87, z: 1.86 }); tape.rotation.x = -0.6;
      chair(R, u, 2.7, m.iron, m.iron, 's');
      R.obs(u - 0.9, 1.3, u + 0.9, 3.0);
    }
    // 3 piggy bank
    R.box(0.7, 0.5, 0.7, m.plinth, { x: 6, y: 0, z: 1.3 });
    const pig = R.sph(0.35, m.teal, { x: 6, y: 0.95, z: 1.3 }); pig.scale.set(1.2, 1, 1);
    for (const dx of [-0.2, 0.2]) for (const dz of [-0.15, 0.15]) R.cyl(0.06, 0.06, 0.15, m.teal, { x: 6 + dx, y: 0.5, z: 1.3 + dz });
    const snout = R.cyl(0.13, 0.13, 0.12, m.teal, { x: 6, y: 0.89, z: 1.68 }); snout.rotation.x = Math.PI / 2;
    for (const dx of [-0.15, 0.15]) R.cone(0.09, 0.15, m.teal, { x: 6 + dx, y: 1.22, z: 1.2 });
    R.box(0.22, 0.04, 0.04, m.iron, { x: 6, y: 1.29, z: 1.3 });
    const coin1 = R.cyl(0.06, 0.06, 0.012, m.brass, { x: 6, y: 1.8, z: 1.3 });
    const flashMat = glow(C.brass, 0); const flash1 = R.sph(0.08, flashMat, { x: 6, y: 1.32, z: 1.3, ws: 10, hs: 8 }); flash1.visible = false;
    R.anim(t => { const p = t % 4.0; if (p < 0.5) { coin1.visible = true; coin1.position.y = 1.31 + 0.5 - 2 * p * p; flash1.visible = false; } else { coin1.visible = false; flash1.visible = p < 0.7; flashMat.emissiveIntensity = Math.max(0, 1 - (p - 0.5) / 0.2); } });
    R.obs(5.6, 0.9, 6.4, 1.7);
    // 4 binder wall and calendar
    R.box(1.4, 2.0, 0.4, m.iron, { x: 9.4, y: 0, z: 8.8 });
    const bcols = [m.teal, m.navy, m.salmon];
    for (let s = 0; s < 4; s++) { const y = 0.1 + s * 0.48; R.box(1.3, 0.03, 0.36, m.silver, { x: 9.4, y, z: 8.8 }); for (let k = 0; k < 7; k++) { R.box(0.16, 0.36, 0.3, bcols[k % 3], { x: 8.84 + k * 0.185, y: y + 0.03, z: 8.78, castShadow: false }); R.box(0.1, 0.1, 0.01, m.trim, { x: 8.84 + k * 0.185, y: y + 0.18, z: 8.62, castShadow: false }); } }
    const calT = R.tex(360, 360, (g, w, h) => {
      const d = new Date(); const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay(); const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.fillStyle = C.teal; g.fillRect(0, 0, w, 60);
      g.fillStyle = '#FFFFFF'; g.font = `600 34px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(d.toLocaleString('en-US', { month: 'long' }), w / 2, 30);
      g.font = `500 22px ${INTER}`;
      for (let i = 0; i < days; i++) { const col = (first + i) % 7, row = Math.floor((first + i) / 7); const x = 25 + col * 47, y = 90 + row * 44; if (i + 1 === d.getDate()) { g.strokeStyle = C.salmon; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 18, 0, TAU); g.stroke(); } g.fillStyle = C.navy; g.fillText(String(i + 1), x, y); }
    });
    R.dec(0.6, 0.6, calT, { x: 7.8, y: 2.0, z: 8.96, ry: Math.PI });
    if (calT) { let lastDay = ''; R.anim(() => { const k = new Date().toDateString(); if (k !== lastDay) { lastDay = k; calT.repaint(); } }); }
    R.obs(8.6, 8.35, 10.2, 9.0);
    // 5 coin chute and abacus
    const chuteGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 12, 1, true, Math.PI, Math.PI);
    const chuteMat = R.room._.glassMat.clone(); chuteMat.transparent = true; chuteMat.opacity = 0.4; chuteMat.side = THREE.DoubleSide;
    const chute = new THREE.Mesh(chuteGeo, chuteMat); chute.position.set(8.4, 2.2, 0.28); chute.rotation.z = 0.2; chute.castShadow = false; R.g.add(chute);
    R.box(0.5, 0.08, 0.3, m.brass, { x: 8.4, y: 1.6, z: 0.3 });
    const coin2 = R.cyl(0.06, 0.06, 0.012, m.brass, { x: 8.4, y: 2.8, z: 0.28 }); coin2.rotation.x = Math.PI / 2; coin2.rotation.z = 0.2;
    const flash2 = R.sph(0.08, flashMat, { x: 8.4, y: 1.7, z: 0.3, ws: 10, hs: 8 }); flash2.visible = false;
    R.anim(t => { const p = (t + 2.0) % 4.0; if (p < 0.8) { coin2.visible = true; const s = p / 0.8; coin2.position.set(8.4 + 0.12 * (0.5 - s) * 2 * 0.5, 2.78 - 1.1 * s, 0.28); flash2.visible = false; } else { coin2.visible = false; flash2.visible = p < 1.0; } });
    R.box(0.6, 0.4, 0.04, m.darkWood, { x: 11.0, y: 1.7, z: 8.96 });
    R.box(0.6, 0.03, 0.05, m.darkWood, { x: 11.0, y: 2.1, z: 8.95 }); R.box(0.6, 0.03, 0.05, m.darkWood, { x: 11.0, y: 1.67, z: 8.95 });
    const rng = seeded('abacus');
    for (let r = 0; r < 7; r++) { const u = 10.76 + r * 0.08; R.cyl(0.006, 0.006, 0.36, m.brassSoft, { x: u, y: 1.72, z: 8.92 }); const up = Math.floor(rng() * 5); for (let b = 0; b < 10; b++) { const y = b < up ? 2.05 - b * 0.03 : 1.75 + (b - up) * 0.03; R.sph(0.02, b % 2 ? m.brassSoft : m.navy, { x: u, y, z: 8.92, ws: 8, hs: 6 }); } }
  },
};

THEMES.tech = {
  ceiling: '#0E1B2E',
  neonTrim: C.plum,
  window: { emissive: 0.6, blinds: C.iron, curtain: 0 },
  lights: { color: '#BFE9EC', intensity: 12 },
  floor(R) {
    return floorMat(R, (g, w, h) => {
      g.fillStyle = C.ink; g.fillRect(0, 0, w, h); g.strokeStyle = '#1A2B3F'; g.lineWidth = 2;
      for (let x = 0; x <= 12; x += 0.6) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, h); g.stroke(); }
      for (let y = 0; y <= 9; y += 0.6) { g.beginPath(); g.moveTo(0, y * PX); g.lineTo(w, y * PX); g.stroke(); }
    }, 0.6);
  },
  props(R) {
    const m = R.m;
    const stripMat = R.ramp(glow(C.aqua, 0.6), 0.15, 0.6);
    for (const v of [2.4, 2.9]) { R.pl(6.0, 0.06, stripMat, { x: 3.8, y: 0.012, z: v, rx: -Math.PI / 2 }); R.pl(3.4, 0.06, stripMat, { x: 9.3, y: 0.012, z: v, rx: -Math.PI / 2 }); }
    // 1 server racks
    const ledMats = [];
    for (let i = 0; i < 6; i++) ledMats.push(R.ramp(glow(C.aqua, 0.6), 0.1, 1.0));
    const redLed = R.ramp(glow(C.salmon, 0.6), 0.1, 0.8);
    let ledIndex = 0;
    for (const u of [1.2, 2.0, 2.8, 3.6, 8.8, 9.6]) {
      R.box(0.6, 2.0, 0.8, m.iron, { x: u, y: 0, z: 1.6 });
      R.box(0.56, 0.02, 0.76, m.silver, { x: u, y: 2.0, z: 1.6, castShadow: false });
      R.cyl(0.04, 0.04, 1.15, m.silver, { x: u, y: 2.0, z: 1.6 });
      for (let k = 0; k < 8; k++) { ledIndex++; R.box(0.44, 0.03, 0.02, ledIndex % 7 === 0 ? redLed : ledMats[(ledIndex * 5) % 6], { x: u, y: 0.3 + k * 0.2, z: 2.01, castShadow: false }); }
    }
    const ledPhase = [0, 1.3, 2.1, 0.7, 2.9, 1.7], ledHz = [1.2, 2.4, 1.6, 3.0, 2.0, 1.1];
    R.anim((t, dt, ramp) => { ledMats.forEach((lm, i) => { lm.emissiveIntensity = ramp * (0.6 + 0.4 * Math.sin(TAU * ledHz[i] * t + ledPhase[i])) * (Math.sin(TAU * ledHz[i] * 0.37 * t + i) > -0.6 ? 1 : 0.2); }); });
    R.obs(0.8, 1.1, 4.0, 2.1); R.obs(8.4, 1.1, 10.0, 2.1);
    // 2 standing desk
    R.box(1.6, 0.05, 0.7, m.deskTop, { x: 6, y: 1.0, z: 1.6 });
    for (const dx of [-0.7, 0.7]) { R.box(0.06, 1.0, 0.06, m.iron, { x: 6 + dx, y: 0, z: 1.6 }); R.box(0.3, 0.04, 0.6, m.iron, { x: 6 + dx, y: 0, z: 1.6 }); }
    const code = R.S.T.code || (R.S.T.code = R.tex(760, 460, (g, w, h) => {
      g.fillStyle = C.ink; g.fillRect(0, 0, w, h); const cols = [C.aqua, C.salmon, '#FFFFFF', C.plum]; const rng = seeded('code');
      g.font = `500 26px ${INTER}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      for (let i = 0; i < 16; i++) { const y = 34 + i * 27; const indent = 20 + Math.floor(rng() * 3) * 40; let x = indent; const n = 2 + Math.floor(rng() * 4); for (let k = 0; k < n; k++) { const wdt = 40 + rng() * 120; g.fillStyle = cols[Math.floor(rng() * 4)]; g.fillRect(x, y - 16, wdt, 18); x += wdt + 14; } }
    }, { repeat: true }));
    for (const dx of [-0.45, 0.45]) {
      R.box(0.8, 0.5, 0.04, m.iron, { x: 6 + dx, y: 1.2, z: 1.4 });
      R.dec(0.16, 0.16, R.S.T.tLogoDark, { x: 6 + dx, y: 1.45, z: 1.37, ry: Math.PI });
      const face = R.dec(0.76, 0.46, code, { x: 6 + dx, y: 1.45, z: 1.43, emissive: 0.7 }); R.ramp(face.material, 0.2, 0.7);
      R.cyl(0.03, 0.03, 0.2, m.iron, { x: 6 + dx, y: 1.05, z: 1.4 });
    }
    if (code) R.anim((t, dt) => { code.tex.offset.y = (code.tex.offset.y - 0.05 * dt + 1) % 1; });
    R.box(0.5, 0.03, 0.18, m.iron, { x: 5.9, y: 1.06, z: 1.75 });
    R.box(0.5, 0.015, 0.18, R.ramp(glow(C.plum, 0.5), 0.1, 0.5), { x: 5.9, y: 1.05, z: 1.75, castShadow: false });
    const armBase = R.grp(6.6, 1.05, 1.5);
    cyl(0.08, 0.08, 0.06, m.silver, { parent: armBase });
    const seg1 = new THREE.Group(); seg1.position.y = 0.06; armBase.add(seg1); box(0.04, 0.3, 0.04, m.iron, { parent: seg1 });
    const seg2 = new THREE.Group(); seg2.position.y = 0.3; seg1.add(seg2); box(0.04, 0.3, 0.04, m.iron, { parent: seg2 });
    sphere(0.03, R.ramp(glow(C.aqua, 0.8), 0.1, 0.8), { y: 0.3, parent: seg2, ws: 8, hs: 6 });
    const cube = R.box(0.06, 0.06, 0.06, m.plum, { x: 6.85, y: 1.05, z: 1.5 });
    R.anim(t => { const p = (t % 3.2) / 3.2; const s = Math.sin(p * TAU); seg1.rotation.z = -0.9 + 0.5 * s; seg2.rotation.z = 1.4 - 0.8 * Math.cos(p * TAU); armBase.rotation.y = p < 0.5 ? 0 : Math.PI * 0.6 * easeIO((p - 0.5) * 2); cube.position.x = 6.85 - (p > 0.5 ? 0.3 * easeIO((p - 0.5) * 2) : 0); });
    R.obs(5.1, 1.2, 6.9, 2.0);
    // 3 ceiling cable tray
    R.box(10.0, 0.06, 0.3, m.iron, { x: 6, y: 3.15, z: 2.4 });
    const cableCols = [m.aqua, m.salmon, m.silver];
    const targets = [1.2, 2.0, 2.8, 3.6, 8.8, 9.6, 5.55, 6.45, 1.6, 3.2, 8.4, 9.2];
    targets.forEach((u, i) => tube(R.g, qcurve(u, 3.15, 2.4, u + 0.2, 2.4, 2.0, u, i < 6 ? 2.0 : 1.3, 1.6), 0.01, cableCols[i % 3], 10));
    for (const u of [2.5, 9.5]) R.sph(0.04, R.ramp(glow(C.aqua, 0.4), 0.1, 0.4), { x: u, y: 3.1, z: 2.4, ws: 8, hs: 6 });
    // 4 neon sign
    const neonT = R.stat(R.tex(480, 240, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.font = `600 150px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = C.plum; g.shadowBlur = 18; g.strokeStyle = C.plum; g.lineWidth = 10; g.strokeText('</>', w / 2, h / 2); g.shadowBlur = 0;
      g.fillStyle = '#FFFFFF'; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeStyle = '#FFFFFF'; g.strokeText('</>', w / 2, h / 2); g.globalAlpha = 1;
    }));
    const neon = R.dec(1.2, 0.6, neonT, { x: 9.2, y: 2.2, z: 8.96, ry: Math.PI, emissive: 1.0 }); neon.material.transparent = true;
    R.dec(0.9, 0.2, R.stat(R.label(450, 100, 'Ship it', { fg: C.aqua, size: 70 })), { x: 9.2, y: 1.7, z: 8.96, ry: Math.PI, emissive: 0.8 }).material.transparent = true;
    // 5 cooling unit
    R.box(0.8, 1.6, 0.6, m.plinth, { x: 0.9, y: 0, z: 7.6 });
    R.cyl(0.3, 0.3, 0.04, m.iron, { x: 0.9, y: 0.8, z: 7.91, rx: Math.PI / 2 });
    const fan = R.grp(0.9, 0.8, 7.93);
    for (let i = 0; i < 5; i++) { const blade = box(0.08, 0.26, 0.01, m.silver, { y: 0, parent: fan }); blade.rotation.z = i / 5 * TAU; }
    R.anim((t, dt) => { fan.rotation.z += 6 * dt; });
    R.dec(0.3, 0.1, R.label(150, 50, '19 C', { bg: C.ink, fg: C.aqua, size: 36 }), { x: 0.9, y: 1.4, z: 7.91, emissive: 0.6 });
    const mist = [0, 1, 2, 3].map(i => R.sph(0.03, m.smoke, { x: 0.75 + i * 0.1, y: 0.8, z: 7.95, ws: 8, hs: 6 }));
    R.anim(t => { mist.forEach((s, i) => { const p = ((t + i * 0.5) % 2) / 2; s.position.z = 7.95 + 0.3 * p; s.position.y = 0.7 + 0.2 * p + 0.05 * i; s.visible = p < 0.9; }); });
    R.obs(0.4, 7.2, 1.4, 8.0);
  },
};

THEMES.risk = {
  ceilingTex(R) {
    return R.tex(1024, 768, (g, w, h) => {
      g.fillStyle = C.ceiling; g.fillRect(0, 0, w, h); const rng = seeded('straw-ceiling'); g.strokeStyle = 'rgba(217,197,143,0.1)'; g.lineWidth = 3;
      for (let i = 0; i < 160; i++) { const x = rng() * w, y = rng() * h, a = rng() * TAU, l = 30 + rng() * 60; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    });
  },
  floor(R) {
    return floorMat(R, (g, w, h) => {
      g.fillStyle = C.sand; g.fillRect(0, 0, w, h); const rng = seeded('risk-floor');
      g.fillStyle = '#D4C49C'; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(rng() * w, rng() * h, 20 + rng() * 40, 8 + rng() * 14, rng() * TAU, 0, TAU); g.fill(); }
      g.strokeStyle = C.straw; g.lineWidth = 3;
      for (let i = 0; i < 120; i++) { const near = rng() < 0.5; const x = near ? (9.2 + (rng() - 0.5) * 3) * PX : rng() * w, y = near ? (2.2 + rng() * 1.5) * PX : rng() * h, a = rng() * TAU, l = 20 + rng() * 40; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      g.strokeStyle = C.green; g.lineWidth = 10; for (let r = 0.5; r > 0.15; r -= 0.1) { g.beginPath(); g.arc(1.4 * PX, 7.0 * PX, r * PX, 0, TAU); g.stroke(); }
    }, 1.0);
  },
  props(R) {
    const m = R.m, P = R.room._;
    // ivy along the north picture rail
    for (let i = 0; i < 16; i++) { const leaf = R.pl(0.12, 0.08, R.m.leaf, { x: 0.5 + i * 0.72, y: 2.92 - (i % 2) * 0.06, z: 0.06 }); leaf.rotation.z = (i % 3 - 1) * 0.5; }
    R.cyl(0.03, 0.03, 11.6, m.stem, { x: 6, y: 2.98, z: 0.07, rz: Math.PI / 2 });
    const tank = P.glassMat.clone(); tank.transparent = true; tank.opacity = 0.25; tank.side = THREE.DoubleSide;
    // 1 aquarium
    R.box(2.4, 0.8, 0.7, m.darkWood, { x: 2.6, y: 0, z: 1.7 });
    R.box(2.3, 1.0, 0.6, m.water, { x: 2.6, y: 0.85, z: 1.7, castShadow: false });
    R.box(1.6, 0.6, 0.4, mat(C.deepWater, { roughness: 0.3, opacity: 0.3 }), { x: 2.6, y: 1.0, z: 1.7, castShadow: false });
    R.box(2.3, 0.08, 0.6, m.stone, { x: 2.6, y: 0.8, z: 1.7 });
    const rng = seeded('pebbles');
    for (let i = 0; i < 20; i++) R.sph(0.03, i % 4 ? m.lightStone : m.salmon, { x: 1.5 + rng() * 2.2, y: 0.9, z: 1.45 + rng() * 0.5, ws: 8, hs: 6 });
    for (const u of [1.7, 2.1, 3.1, 3.5]) R.cyl(0.015, 0.015, 0.7, m.stem, { x: u, y: 0.88, z: 1.6 + (u % 1) * 0.2 });
    R.box(0.2, 0.14, 0.14, m.darkWood, { x: 2.3, y: 0.88, z: 1.85 });
    R.box(0.18, 0.01, 0.12, R.ramp(glow(C.brass, 0.4), 0.1, 0.4), { x: 2.3, y: 1.02, z: 1.85, castShadow: false });
    R.box(2.4, 1.2, 0.7, tank, { x: 2.6, y: 0.8, z: 1.7, castShadow: false });
    const fishCols = [C.salmon, C.brass, C.aqua, C.trim, C.orange];
    const fish = fishCols.map((col, i) => { const fg = R.grp(2.6, 1.3, 1.7); const fm = mat(col, { roughness: 0.6 }); const body = sphere(0.05, fm, { parent: fg, ws: 10, hs: 8 }); body.scale.set(1.6, 1, 0.6); const tail = cone(0.04, 0.08, fm, { x: -0.1, y: -0.04, parent: fg, seg: 8 }); tail.rotation.z = Math.PI / 2; return { g: fg, tail, phase: i * 1.3, y: 1.05 + i * 0.1 }; });
    R.anim((t, dt) => {
      for (const f of fish) {
        const a = (0.35 * t) / 0.6 + f.phase;
        const x = 2.6 + 0.6 * Math.sin(a), z = 1.7 + 0.25 * Math.sin(2 * a);
        const dx = 0.6 * Math.cos(a), dz = 0.5 * Math.cos(2 * a);
        f.g.position.set(x, f.y + 0.03 * Math.sin(a * 1.7), z); f.g.rotation.y = Math.atan2(-dz, dx);
        f.tail.rotation.y = 0.5 * Math.sin(TAU * 1.5 * t + f.phase);
      }
    });
    const bubbles = [0, 1, 2, 3, 4, 5].map(i => { const b = R.sph(0.015, mat(C.trim, { roughness: 0.5, opacity: 0.6 }), { x: 2.3, y: 1.0, z: 1.85, ws: 6, hs: 5 }); return { b, phase: i * 0.37 }; });
    R.anim(t => { for (const bb of bubbles) { const p = ((t + bb.phase) % 2.2) / 2.2; bb.b.position.set(2.3 + 0.03 * Math.sin(p * 9 + bb.phase), 1.0 + 0.9 * p, 1.85); } });
    R.box(2.5, 0.08, 0.8, m.iron, { x: 2.6, y: 2.0, z: 1.7 });
    R.box(2.3, 0.02, 0.1, R.ramp(glow(C.aqua, 0.7), 0.1, 0.7), { x: 2.6, y: 1.98, z: 1.7, castShadow: false });
    R.dec(0.3, 0.1, R.label(150, 50, 'Feeding 8:00', { bg: '#FFFFFF', fg: C.navy, family: INTER, weight: 500, size: 26 }), { x: 3.5, y: 1.7, z: 2.06 });
    R.obs(1.3, 1.3, 3.9, 2.1);
    // 2 terrarium
    R.box(1.2, 0.8, 0.7, m.darkWood, { x: 9.2, y: 0, z: 1.7 });
    R.box(1.1, 0.06, 0.6, m.straw, { x: 9.2, y: 0.8, z: 1.7 });
    R.cyl(0.08, 0.08, 0.9, m.darkWood, { x: 9.2, y: 0.86, z: 1.5, rz: Math.PI / 2 });
    for (const dx of [-0.2, 0.1]) { R.cyl(0.012, 0.012, 0.05, m.trim, { x: 9.2 + dx, y: 0.94, z: 1.5 }); R.cone(0.04, 0.03, m.salmon, { x: 9.2 + dx, y: 0.99, z: 1.5 }); }
    R.cyl(0.12, 0.12, 0.03, m.water, { x: 9.55, y: 0.86, z: 1.85 });
    const tort = R.grp(8.9, 0.86, 1.85);
    const shell = dome(0.12, R.accent(), { parent: tort }); shell.scale.set(1, 0.6, 1.2);
    const head = sphere(0.04, mat(C.hedge, { roughness: 0.9 }), { x: 0.12, y: 0.04, parent: tort, ws: 8, hs: 6 });
    for (const dx of [-0.07, 0.07]) for (const dz of [-0.09, 0.09]) cyl(0.02, 0.02, 0.03, mat(C.hedge, { roughness: 0.9 }), { x: dx, z: dz, parent: tort, seg: 6 });
    R.anim(t => { const p = (t % 6) / 6; head.position.x = 0.06 + 0.08 * Math.max(0, Math.sin(p * TAU)); });
    R.cyl(0.08, 0.08, 0.1, m.iron, { x: 9.2, y: 1.75, z: 1.7 });
    R.sph(0.04, R.ramp(glow(C.lamp, 0.9), 0.1, 0.9), { x: 9.2, y: 1.72, z: 1.7, ws: 8, hs: 6 });
    const warm = R.pl(0.5, 0.5, R.ramp(glow(C.lamp, 0.3), 0.05, 0.3), { x: 9.2, y: 0.84, z: 1.7, rx: -Math.PI / 2 }); warm.material.transparent = true; warm.material.opacity = 0.5;
    R.dec(0.08, 0.3, R.label(40, 150, '31 C', { bg: '#FFFFFF', fg: C.navy, family: INTER, weight: 500, size: 16 }), { x: 9.7, y: 1.3, z: 2.06 });
    R.box(1.2, 0.9, 0.7, tank, { x: 9.2, y: 0.8, z: 1.7, castShadow: false });
    R.obs(8.5, 1.3, 9.9, 2.1);
    // 3 feeding charts
    const rows = ['Lion 7:00 meat', 'Flamingos 8:00 shrimp', 'Giraffe 9:00 acacia', 'Tortoise 10:00 greens', 'Fish 11:00 flakes'];
    const chartT = R.stat(R.tex(340, 460, (g, w, h) => {
      const hr = new Date().getHours();
      g.fillStyle = C.paper; g.fillRect(0, 0, w, h); g.fillStyle = C.navy; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = `600 40px ${KANIT}`; g.fillText('Feeding chart', 24, 64);
      g.font = `500 24px ${INTER}`;
      rows.forEach((r, i) => { const y = 130 + i * 62; g.fillStyle = C.navy; g.fillText(r, 60, y); if (hr >= 7 + i) { g.strokeStyle = C.orange; g.lineWidth = 4; g.beginPath(); g.moveTo(24, y - 10); g.lineTo(34, y); g.lineTo(50, y - 20); g.stroke(); } });
    }));
    minuteRepaint(R, chartT);
    for (const u of [8.0, 8.6, 9.2]) { R.box(0.4, 0.55, 0.02, m.wood, { x: u, y: 1.525, z: 8.97 }); R.box(0.12, 0.05, 0.04, m.brass, { x: u, y: 2.05, z: 8.96 }); R.dec(0.34, 0.46, chartT, { x: u, y: 1.78, z: 8.95, ry: Math.PI }); }
    const weekT = R.stat(R.tex(700, 450, (g, w, h) => {
      g.fillStyle = C.paper; g.fillRect(0, 0, w, h); g.fillStyle = C.navy; g.font = `600 44px ${KANIT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('Week 41', 30, 60);
      g.strokeStyle = C.navy; g.lineWidth = 2; const rng2 = seeded('week');
      for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { const x = 30 + c * 92, y = 90 + r * 68; g.strokeRect(x, y, 92, 68); const v = rng2(); if (v < 0.6) { g.strokeStyle = C.aqua; g.lineWidth = 5; g.beginPath(); g.moveTo(x + 28, y + 36); g.lineTo(x + 42, y + 50); g.lineTo(x + 66, y + 20); g.stroke(); } else if (v < 0.75) { g.strokeStyle = C.salmon; g.lineWidth = 5; g.beginPath(); g.moveTo(x + 30, y + 20); g.lineTo(x + 62, y + 48); g.moveTo(x + 62, y + 20); g.lineTo(x + 30, y + 48); g.stroke(); } g.strokeStyle = C.navy; g.lineWidth = 2; }
    }));
    R.dec(1.4, 0.9, weekT, { x: 8.6, y: 2.6, z: 8.96, ry: Math.PI });
    // 4 feed bins
    const lids = [m.salmon, m.brassSoft, m.aqua], names = ['MEAT', 'SHRIMP', 'GREENS'];
    [0.8, 1.5, 2.2].forEach((u, i) => {
      R.cyl(0.26, 0.26, 0.6, m.iron, { x: u, y: 0, z: 8.5 });
      if (i === 1) { const lid = R.cyl(0.28, 0.28, 0.05, lids[i], { x: u + 0.3, y: 0.6, z: 8.5 }); lid.rotation.z = 1.2; R.cyl(0.05, 0.05, 0.2, m.silver, { x: u, y: 0.55, z: 8.5, rz: 0.5 }); }
      else R.cyl(0.28, 0.28, 0.05, lids[i], { x: u, y: 0.6, z: 8.5 });
      R.dec(0.3, 0.1, R.label(150, 50, names[i], { fg: '#FFFFFF', family: INTER, weight: 600, size: 34 }), { x: u, y: 0.35, z: 8.24, ry: Math.PI });
    });
    R.cyl(0.15, 0.12, 0.25, m.silver, { x: 2.9, y: 0, z: 8.4 });
    R.obs(0.5, 8.2, 3.2, 8.8);
    // 5 keeper's bench with hay
    R.box(1.4, 0.08, 0.4, m.wood, { x: 6.0, y: 0.37, z: 1.4 });
    for (const dx of [-0.6, 0.6]) R.box(0.06, 0.37, 0.36, m.iron, { x: 6.0 + dx, y: 0, z: 1.4 });
    R.box(0.3, 0.08, 0.25, m.orange, { x: 5.6, y: 0.45, z: 1.4 });
    R.box(0.12, 0.25, 0.12, m.iron, { x: 6.4, y: 0.45, z: 1.4 }); R.box(0.08, 0.15, 0.13, R.ramp(glow(C.bulbGlow, 0.6), 0.1, 0.6), { x: 6.4, y: 0.5, z: 1.4, castShadow: false });
    R.box(0.8, 0.5, 0.5, m.straw, { x: 7.1, y: 0, z: 1.0 }); R.box(0.8, 0.25, 0.5, m.straw, { x: 7.1, y: 0.5, z: 1.0 });
    for (const dx of [-0.2, 0.2]) R.tor(0.26, 0.012, m.wood, { x: 7.1 + dx, y: 0.25, z: 1.0, ry: Math.PI / 2 });
    const fork = R.cyl(0.015, 0.015, 1.3, m.wood, { x: 7.6, y: 0, z: 0.3 }); fork.rotation.x = -0.2;
    for (const dx of [-0.05, 0, 0.05]) R.box(0.015, 0.2, 0.015, m.silver, { x: 7.6 + dx, y: 1.25, z: 0.05 });
    R.obs(5.2, 0.7, 7.6, 1.7);
  },
};

THEMES.marketing = {
  noticeExtra: true,
  lights: { east: [6.4, 2.1, 1.3] },
  floor(R) {
    return floorMat(R, (g, w, h) => {
      g.fillStyle = C.trim; g.fillRect(0, 0, w, h); g.strokeStyle = C.silver; g.lineWidth = 3;
      for (let x = 0; x <= 12; x += 0.3) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, h); g.stroke(); }
      g.strokeStyle = C.lime; g.lineWidth = 0.25 * PX; g.lineCap = 'round'; g.beginPath(); g.moveTo(6 * PX, 8.9 * PX); g.lineTo(5.0 * PX, 6.9 * PX); g.lineTo(3.0 * PX, 2.3 * PX); g.stroke();
      const rng = seeded('splats'); const cols = [C.salmon, C.aqua, C.lime, C.brass, C.navy]; g.globalAlpha = 0.9;
      for (let i = 0; i < 9; i++) { const cx = (i < 5 ? 1.5 : 3.0) * PX + (rng() - 0.5) * 1.2 * PX, cy = (i < 5 ? 7.5 : 2.0) * PX + (rng() - 0.5) * 1.2 * PX; g.fillStyle = cols[i % 5]; g.beginPath(); for (let k = 0; k <= 12; k++) { const a = k / 12 * TAU, rr2 = (0.1 + rng() * 0.2) * PX; const px = cx + Math.cos(a) * rr2, py = cy + Math.sin(a) * rr2; if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); } g.closePath(); g.fill(); }
      g.globalAlpha = 1;
    }, 0.8);
  },
  props(R) {
    const m = R.m;
    for (const v of [2.0, 4.0]) R.box(10, 0.04, 0.04, m.iron, { x: 6, y: 3.3, z: v, castShadow: false });
    const poster = R.stat(R.tex(480, 640, (g, w, h) => {
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.fillStyle = C.navy; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = `600 64px ${KANIT}`; g.fillText('Say hello', 40, 120); g.fillText('to Thread', 40, 190);
      g.strokeStyle = C.aqua; g.lineWidth = 22; g.lineCap = 'round'; g.beginPath(); g.moveTo(40, 420); g.bezierCurveTo(160, 280, 300, 560, 440, 380); g.stroke();
      g.fillStyle = C.salmon; g.beginPath(); g.arc(400, 520, 36, 0, TAU); g.fill();
    }));
    R.dec(1.2, 1.6, poster, { x: 7.75, y: 2.0, z: 0.03 });
    // 1 mood board
    const mood = R.stat(R.tex(1200, 720, (g, w, h) => {
      g.fillStyle = C.trim; g.fillRect(0, 0, w, h);
      const sw = [[C.navy, '#002D4F'], [C.aqua, '#75CCD0'], [C.salmon, '#E7706F'], [C.silver, '#E2E9EE'], [C.lime, '#8DBE2E']];
      sw.forEach(([c, label], i) => { g.fillStyle = c; g.fillRect(40 + i * 170, 40, 140, 140); g.fillStyle = C.navy; g.font = `500 24px ${INTER}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(label, 40 + i * 170, 210); });
      g.fillStyle = C.navy; g.font = `600 72px ${KANIT}`; g.fillText('Say hello to Thread', 40, 320);
      for (let i = 0; i < 3; i++) { g.save(); g.translate(150 + i * 260, 520); g.rotate(i % 2 ? 0.06 : -0.06); g.fillStyle = '#FFFFFF'; g.fillRect(-100, -120, 200, 240); g.fillStyle = C.lime; g.beginPath(); g.arc(0, -30, 55, 0, TAU); g.fill(); g.globalAlpha = 0.7; g.fillStyle = i % 2 ? C.salmon : C.aqua; g.fillRect(-70, -135, 140, 30); g.globalAlpha = 1; g.restore(); }
      ['Q4 launch', 'Partner kit', 'Cafe banner'].forEach((n, i) => { g.fillStyle = C.brass; g.fillRect(900, 40 + i * 110, 240, 90); g.fillStyle = C.navy; g.font = `500 28px ${INTER}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 1020, 85 + i * 110); });
      g.strokeStyle = C.navy; g.lineWidth = 4; if (g.setLineDash) g.setLineDash([16, 12]); g.strokeRect(900, 400, 240, 260); if (g.setLineDash) g.setLineDash([]);
      g.fillStyle = C.body; g.font = `500 28px ${INTER}`; g.fillText('next idea', 1020, 530);
    }));
    easel(R, 3.0, 1.6, m.wood, 3.0, 1.8, m.trim, mood, m.wood);
    R.obs(1.4, 1.1, 4.6, 2.0);
    // 2 camera
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const leg = R.cyl(0.02, 0.02, 1.3, m.iron, { x: 7.6 + Math.cos(a) * 0.2, y: 0, z: 3.0 + Math.sin(a) * 0.2 }); leg.rotation.x = Math.sin(a) * 0.3; leg.rotation.z = -Math.cos(a) * 0.3; }
    R.box(0.28, 0.2, 0.22, m.iron, { x: 7.6, y: 1.3, z: 3.0 });
    R.cyl(0.08, 0.08, 0.16, m.iron, { x: 7.6, y: 1.32, z: 2.81, rx: Math.PI / 2 });
    R.cyl(0.07, 0.07, 0.01, R.room._.glassMat, { x: 7.6, y: 1.335, z: 2.73, rx: Math.PI / 2 });
    const rec = R.ramp(glow(C.salmon, 0.8), 0.1, 0.8); R.sph(0.02, rec, { x: 7.7, y: 1.48, z: 2.9, ws: 8, hs: 6 });
    R.anim((t, dt, ramp) => { rec.emissiveIntensity = ramp * (Math.sin(TAU * t) > 0 ? 0.8 : 0.05); });
    R.box(0.1, 0.08, 0.06, m.iron, { x: 7.6, y: 1.5, z: 3.0 });
    R.obs(7.2, 2.6, 8.0, 3.4);
    // 3 backdrop and softbox
    R.cyl(0.08, 0.08, 2.6, m.iron, { x: 8.2, y: 2.82, z: 0.5, rz: Math.PI / 2 });
    for (const u of [6.9, 9.5]) R.cyl(0.025, 0.025, 2.9, m.iron, { x: u, y: 0, z: 0.5 });
    const paperMat = mat(C.salmon, { roughness: 0.95, doubleSide: true });
    R.pl(2.6, 2.3, paperMat, { x: 8.2, y: 1.7, z: 0.55 });
    const sweepGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.6, 16, 1, true, Math.PI, Math.PI / 2);
    const sweep = new THREE.Mesh(sweepGeo, paperMat); sweep.position.set(8.2, 0.55, 1.1); sweep.rotation.z = Math.PI / 2; sweep.castShadow = false; R.g.add(sweep);
    R.pl(2.6, 1.2, paperMat, { x: 8.2, y: 0.012, z: 1.7, rx: -Math.PI / 2 });
    R.cyl(0.025, 0.025, 1.9, m.iron, { x: 6.4, y: 0, z: 1.3 });
    const soft = R.grp(6.4, 1.85, 1.3); soft.rotation.set(0.3, 0.6, 0);
    box(0.5, 0.5, 0.3, m.iron, { y: -0.25, parent: soft });
    plane(0.46, 0.46, R.ramp(glow(C.bulb, 0.9), 0.15, 0.9), { z: 0.16, parent: soft });
    R.obs(6.8, 0.3, 9.6, 2.3); R.obs(6.1, 1.0, 6.7, 1.6);
    // 4 paint corner
    const cans = [[0.7, 7.5, m.salmon], [1.05, 7.75, m.aqua], [0.75, 8.05, m.lime], [1.2, 8.3, m.brassSoft]];
    for (const [u, v, cm] of cans) R.cyl(0.15, 0.15, 0.25, cm, { x: u, y: 0, z: v });
    R.box(0.03, 0.25, 0.03, m.wood, { x: 0.8, y: 0.2, z: 8.05, rz: 0.3 });
    R.pl(0.4, 0.25, m.silver, { x: 1.6, y: 0.01, z: 8.3, rx: -Math.PI / 2 });
    const ladder = R.grp(1.9, 0, 7.6);
    for (const side of [-1, 1]) { for (const dx of [-0.2, 0.2]) { const rail = cyl(0.02, 0.02, 1.6, m.trim, { x: dx, z: side * 0.05, parent: ladder }); rail.rotation.x = side * 0.3; rail.position.z = side * 0.25; } }
    for (let i = 0; i < 4; i++) box(0.4, 0.03, 0.03, m.trim, { y: 0.3 + i * 0.35, z: -0.45 + i * 0.1, parent: ladder });
    cyl(0.1, 0.1, 0.18, m.aqua, { y: 1.55, parent: ladder });
    R.obs(0.4, 7.2, 2.3, 8.6);
    // 5 balloons
    const bcols = [m.salmon, m.aqua, m.brassSoft, m.lime, m.trim];
    const balloons = bcols.map((bm, i) => { const len = 0.9 + 0.075 * i; const bg = R.grp(7.1, 1.06, 6.1); cyl(0.006, 0.006, len, m.iron, { parent: bg }); const b = sphere(0.16, bm, { y: len + 0.14, parent: bg, ws: 14, hs: 10 }); b.scale.y = 1.15; return { g: bg, phase: i * 1.1 }; });
    R.anim(t => { for (const b of balloons) { b.g.position.y = 1.06 + 0.08 * Math.sin(TAU * 0.6 * t + b.phase); b.g.rotation.z = 0.05 * Math.sin(TAU * 0.3 * t + b.phase); b.g.rotation.x = 0.05 * Math.cos(TAU * 0.25 * t + b.phase); } });
  },
};

THEMES.people = {
  cooler: [0.7, 2.2],
  floor(R) { return mat('#D9C5B0', { roughness: 1.0 }); },
  props(R) {
    const m = R.m;
    R.cyl(2.0, 2.0, 0.01, m.stone, { x: 3.4, y: 0.005, z: 3.0, seg: 48 });
    const ring = R.tor(2.0, 0.02, m.salmon, { x: 3.4, y: 0.016, z: 3.0, rx: Math.PI / 2 }); ring.scale.z = 0.4;
    R.dec(1.2, 0.6, R.stat(R.label(480, 240, 'Welcome', { bg: C.salmon, fg: '#FFFFFF', family: INTER, weight: 600, size: 110 })), { x: 6, y: 0.011, z: 8.3, rx: -Math.PI / 2 });
    const pennantCols = [C.salmon, C.aqua, C.brass, C.trim];
    for (let i = 0; i < 12; i++) { const pen = new THREE.Mesh(triangle(), mat(pennantCols[i % 4], { roughness: 0.9, doubleSide: true })); pen.position.set(7.5 + i * 0.36, 2.98 - 0.08 * Math.sin(i / 11 * Math.PI), 8.95); pen.castShadow = false; R.g.add(pen); }
    // 1 sofa
    R.box(2.2, 0.45, 0.9, m.salmon, { x: 3.4, y: 0, z: 1.9, radius: 0.08 });
    R.box(2.2, 0.5, 0.25, m.salmon, { x: 3.4, y: 0.45, z: 1.55, radius: 0.08 });
    R.box(0.2, 0.6, 0.9, m.salmon, { x: 2.4, y: 0, z: 1.9 }); R.box(0.2, 0.6, 0.9, m.salmon, { x: 4.4, y: 0, z: 1.9 });
    for (const u of [2.85, 3.4, 3.95]) { const c = R.box(0.5, 0.3, 0.15, m.silver, { x: u, y: 0.45, z: 1.75 }); c.rotation.x = -0.2; }
    const throwP = R.pl(0.6, 0.5, m.aqua, { x: 4.4, y: 0.61, z: 1.9, rx: -Math.PI / 2 });
    throwP.rotation.z = 0.2;
    R.obs(2.2, 1.4, 4.6, 2.4);
    // 2 coffee table and armchairs
    R.box(1.0, 0.4, 0.6, m.wood, { x: 3.4, y: 0, z: 3.1 });
    R.cyl(0.15, 0.12, 0.06, m.trim, { x: 3.2, y: 0.4, z: 3.1 });
    const fruit = [m.brassSoft, m.salmon, m.hedge, m.brassSoft, m.salmon];
    fruit.forEach((fm, i) => R.sph(0.05, fm, { x: 3.2 + Math.cos(i * 1.26) * 0.07, y: 0.48 + (i === 4 ? 0.06 : 0), z: 3.1 + Math.sin(i * 1.26) * 0.07, ws: 10, hs: 8 }));
    R.cyl(0.04, 0.04, 0.08, m.trim, { x: 3.65, y: 0.4, z: 2.95 }); R.cyl(0.04, 0.04, 0.08, m.aqua, { x: 3.75, y: 0.4, z: 3.2 });
    R.box(0.3, 0.05, 0.3, m.navy, { x: 3.65, y: 0.4, z: 3.3 });
    for (const u of [2.4, 4.4]) { R.box(0.75, 0.45, 0.75, m.aqua, { x: u, y: 0, z: 4.3, radius: 0.08 }); R.box(0.75, 0.45, 0.2, m.aqua, { x: u, y: 0.45, z: 4.5, radius: 0.08 }); }
    R.obs(2.8, 2.75, 4.0, 3.45); R.obs(2.0, 3.9, 2.8, 4.7); R.obs(4.0, 3.9, 4.8, 4.7);
    // 3 kitchenette
    R.box(2.4, 0.9, 0.6, m.trim, { x: 9.4, y: 0, z: 0.3 });
    R.box(2.5, 0.04, 0.65, m.deskTop, { x: 9.4, y: 0.9, z: 0.3 });
    R.box(0.4, 0.4, 0.35, mat(C.silver, { roughness: 0.5, metalness: 0.3 }), { x: 8.8, y: 0.94, z: 0.3 });
    R.sph(0.02, R.ramp(glow(C.salmon, 0.4), 0.1, 0.4), { x: 8.65, y: 1.25, z: 0.49, ws: 8, hs: 6 });
    const steam = [0, 1].map(i => R.sph(0.04, m.smoke, { x: 8.8, y: 1.4, z: 0.3, ws: 8, hs: 6 }));
    R.anim(t => { steam.forEach((s, i) => { const p = ((t + i * 1.5) % 3) / 3; s.position.y = 1.36 + 0.3 * p; s.position.x = 8.8 + 0.05 * Math.sin(p * 7 + i); s.visible = p < 0.8; }); });
    R.cyl(0.08, 0.1, 0.18, m.silver, { x: 9.3, y: 0.94, z: 0.3 });
    R.cyl(0.02, 0.02, 0.3, m.wood, { x: 9.7, y: 0.94, z: 0.3 });
    [m.navy, m.aqua, m.salmon, m.silver].forEach((mm, i) => R.cyl(0.05, 0.05, 0.1, mm, { x: 9.7 + Math.cos(i * 1.57) * 0.1, y: 1.08, z: 0.3 + Math.sin(i * 1.57) * 0.1 }));
    R.cyl(0.12, 0.1, 0.05, m.trim, { x: 10.3, y: 0.94, z: 0.3 });
    R.box(0.4, 0.02, 0.3, m.lightStone, { x: 10.3, y: 0.93, z: 0.3 }); R.cyl(0.015, 0.015, 0.25, m.silver, { x: 10.3, y: 0.94, z: 0.12 });
    for (const u of [8.6, 9.4, 10.2]) { R.cyl(0.03, 0.03, 0.55, m.iron, { x: u, y: 0, z: 1.1 }); R.cyl(0.16, 0.16, 0.1, m.navy, { x: u, y: 0.55, z: 1.1 }); }
    R.obs(8.1, 0, 10.7, 1.3);
    // 4 bookshelf with games
    R.box(1.2, 1.8, 0.35, m.wood, { x: 9.4, y: 0, z: 8.825 });
    const gcols = [m.navy, m.aqua, m.salmon, m.brassSoft];
    for (let s = 0; s < 4; s++) { const y = 0.1 + s * 0.43; R.box(1.1, 0.03, 0.3, m.darkWood, { x: 9.4, y, z: 8.825 }); if (s < 3) for (let k = 0; k < 2; k++) R.box(0.3, 0.08, 0.28, gcols[(s + k) % 4], { x: 9.1 + k * 0.6, y: y + 0.03 + (s % 2) * 0.08, z: 8.82 }); }
    R.cyl(0.04, 0.04, 0.04, m.darkWood, { x: 9.7, y: 1.42, z: 8.82 }); R.cyl(0.06, 0.04, 0.15, m.brass, { x: 9.7, y: 1.46, z: 8.82 });
    for (let i = 0; i < 3; i++) { R.box(0.2, 0.25, 0.02, m.darkWood, { x: 9.0 + i * 0.25, y: 1.42, z: 8.75 }); R.cyl(0.05, 0.05, 0.005, mat(R.dept.alien, { roughness: 0.8 }), { x: 9.0 + i * 0.25, y: 1.55, z: 8.735, rx: Math.PI / 2 }); }
    const bday = R.stat(R.tex(360, 360, (g, w, h) => { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.fillStyle = C.navy; g.font = `600 40px ${KANIT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Birthdays', w / 2, 40); g.strokeStyle = C.silver; g.lineWidth = 2; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) g.strokeRect(20 + c * 46, 80 + r * 52, 46, 52); g.fillStyle = C.salmon; for (const [c, r] of [[2, 1], [5, 2], [1, 4]]) { g.beginPath(); g.arc(43 + c * 46, 106 + r * 52, 14, 0, TAU); g.fill(); } }));
    R.dec(0.6, 0.6, bday, { x: 7.9, y: 2.0, z: 8.96, ry: Math.PI });
    R.obs(8.7, 8.4, 10.1, 9.0);
    // 5 hanging swing seat (the fabric reaches the cushion at y 0.5)
    const hook = R.grp(8.4, 3.4, 3.0);
    cyl(0.015, 0.015, 0.9, m.wood, { y: -0.95, parent: hook });
    const ringG = new THREE.Group(); ringG.position.y = -0.95; hook.add(ringG);
    torus(0.45, 0.03, m.wood, { rx: Math.PI / 2, parent: ringG });
    const fabricGeo = new THREE.ConeGeometry(0.45, 1.9, 20, 1, true);
    const fabric = new THREE.Mesh(fabricGeo, mat(C.silver, { roughness: 0.95, doubleSide: true })); fabric.rotation.x = Math.PI; fabric.position.y = -0.95; fabric.castShadow = false; ringG.add(fabric);
    cyl(0.3, 0.3, 0.08, m.aqua, { y: -1.95, parent: ringG });
    R.anim(t => { hook.rotation.z = 0.06 * Math.sin(TAU * 0.3 * t); hook.rotation.x = 0.04 * Math.sin(TAU * 0.3 * t + 1.2); ringG.rotation.y = 0.15 * Math.sin(TAU * 0.05 * t); });
    R.obs(7.9, 2.5, 8.9, 3.5);
  },
};

/* Player position in world x, z (ctx.getPlayerPos, else window.TT.player), or null. */
function playerPos(ctx) {
  try {
    if (ctx && typeof ctx.getPlayerPos === 'function') { const p = ctx.getPlayerPos(); if (p && Number.isFinite(p.x)) return { x: p.x, z: Number.isFinite(p.z) ? p.z : p.y }; }
    const TT = typeof window !== 'undefined' ? window.TT : null;
    const pl = TT && TT.player;
    if (pl && pl.pos && Number.isFinite(pl.pos.x)) return { x: pl.pos.x, z: pl.pos.y };
  } catch (e) { /* no player yet */ }
  return null;
}

/* ---------- rooms ---------- */
function buildRoom(dept, i, ctx, S) {
  const theme = THEMES[dept.id] || {};
  const cx = ROOM_X0 + i * ROOM_PITCH;
  const origin = { x: cx - ROOM_W / 2, z: -ROOM_D / 2 };
  const g = new THREE.Group(); g.name = 'room-' + dept.id; g.position.set(origin.x, FLOOR_Y, origin.z);
  const room = {
    id: dept.id, group: g, floorY: FLOOR_Y, origin, w: ROOM_W, d: ROOM_D,
    door: { x: cx, z: origin.z + ROOM_D }, spawn: { x: cx, z: origin.z + 7.8 },
    obstacles: [], interactables: [], lights: [],
    _: { dept, index: i, anim: [], ramps: [], statics: [], ramp: 0, hiringTex: S.T.hiring ? S.T.hiring.tex : null, pictureGlow: null, blinkT: 0, lastActive: 0 },
  };
  room._.pictureGlow = glow(C.bulbGlow, 0.5); room._.ramps.push({ m: room._.pictureGlow, lo: 0.1, hi: 0.5 });
  const R = makeR(room, dept, theme, S, ctx);
  buildTemplate(R);
  if (theme.props) theme.props(R);
  setPortraits(room, [], ctx.getAvatar);
  applyRamp(room, 0);
  g.visible = false;
  return room;
}

function applyRamp(room, ramp) {
  const P = room._;
  P.ramp = ramp;
  for (const l of room.lights) { l.intensity = l.userData.base * ramp; l.visible = ramp > 0.01; }
  for (const r of P.ramps) r.m.emissiveIntensity = r.lo + (r.hi - r.lo) * ramp;
}

function normalizeRooms(rooms) {
  if (!rooms) return null;
  if (rooms instanceof Map) return rooms;
  if (rooms.rooms instanceof Map) return rooms.rooms;
  if (Array.isArray(rooms)) return new Map(rooms.map(r => [r.id, r]));
  return new Map(Object.entries(rooms));
}
function statsById(deptStats) {
  const out = new Map();
  if (!deptStats) return out;
  const put = (k, s) => { if (k && s) out.set(String(k), s); };
  if (deptStats instanceof Map) { for (const [k, s] of deptStats) put(typeof k === 'object' ? k.id : k, s); }
  else if (Array.isArray(deptStats)) { for (const s of deptStats) put(s.dept && typeof s.dept === 'object' ? s.dept.id : (s.dept || s.id), s); }
  else if (typeof deptStats === 'object') { for (const k of Object.keys(deptStats)) put(k, deptStats[k]); }
  return out;
}
function agentsById(agentsByDept) {
  const out = new Map();
  if (!agentsByDept) return out;
  if (agentsByDept instanceof Map) { for (const [k, v] of agentsByDept) out.set(String(typeof k === 'object' ? k.id : k), v); }
  else if (typeof agentsByDept === 'object') { for (const k of Object.keys(agentsByDept)) out.set(k, agentsByDept[k]); }
  return out;
}
function groupAgents(state) {
  const out = new Map();
  if (!state || !Array.isArray(state.agents)) return out;
  const show = !(state.settings && state.settings.showDemo === false);
  for (const a of state.agents) {
    const spec = a.spec || a;
    if (!show && spec.demo) continue;
    const id = a.dept && typeof a.dept === 'object' ? a.dept.id : (a.dept || spec.dept);
    if (!id) continue;
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(a);
  }
  return out;
}

/* Repaints stats boards and portrait walls whose cache keys changed. */
export function refreshBoards(rooms, deptStats, agentsByDept) {
  const map = normalizeRooms(rooms);
  if (!map) return;
  const stats = statsById(deptStats);
  const agents = agentsById(agentsByDept);
  const build = BUILDS.find(b => b.rooms === map);
  if (build) { build.lastStats = deptStats; build.lastAgents = agentsByDept; }
  const getAvatar = build ? build.getAvatar : null;
  for (const room of map.values()) {
    const P = room._;
    if (!P) continue;
    const list = agents.get(room.id) || [];
    const s = stats.get(room.id) || {};
    const st = { agents: finite(s.agents !== undefined ? s.agents : list.length), runs: finite(s.runs), fails: finite(s.fails), active: finite(s.active) };
    if (st.active > P.lastActive) P.blinkT = 0.3;
    P.lastActive = st.active;
    P.stats.agents = st.agents; P.stats.runs = st.runs; P.stats.fails = st.fails; P.stats.active = st.active;
    const key = `${P.dept.name}|${st.agents}|${st.runs}|${st.fails}|${st.active}|${fontsReady ? 1 : 0}`;
    if (key !== P.boardKey) { P.boardKey = key; if (P.boardT) P.boardT.repaint(); }
    if (P.checklistT) {
      const clean = st.runs > 0 ? (st.runs - st.fails) / st.runs : 0;
      const ticks = clamp(Math.round(6 * clean), 0, 6);
      if (ticks !== P.ticks) { P.ticks = ticks; P.checklistT.repaint(); }
    }
    setPortraits(room, list, getAvatar);
  }
}

function onFontsReady() {
  fontsReady = true;
  for (const b of BUILDS) {
    for (const room of b.rooms.values()) for (const T of room._.statics) { try { T.repaint(); } catch (e) { /* best effort */ } }
    try { refreshBoards(b.rooms, b.lastStats, b.lastAgents); } catch (e) { /* best effort */ }
  }
}

/* Builds the twelve rooms. ctx = { THREE, state, deptById, depts, getAvatar, activityLabels?, getPlayerPos? }. */
export function buildInteriors(ctx) {
  ctx = ctx || {};
  const depts = ctx.depts || (typeof window !== 'undefined' && window.TT && window.TT.DEPARTMENTS) || [];
  const S = makeShared();
  const group = new THREE.Group(); group.name = 'interiors';
  const rooms = new Map();
  depts.forEach((dept, i) => {
    const room = buildRoom(dept, i, ctx, S);
    rooms.set(dept.id, room);
    group.add(room.group);
  });
  const build = { rooms, getAvatar: typeof ctx.getAvatar === 'function' ? ctx.getAvatar : null, lastStats: null, lastAgents: null };
  BUILDS.push(build);
  const initial = groupAgents(ctx.state);
  if (initial.size) refreshBoards(rooms, null, initial);
  if (hasDoc && document.fonts && document.fonts.load && !fontsReady) {
    Promise.all([document.fonts.load('600 92px Kanit'), document.fonts.load('500 34px Inter')]).then(onFontsReady, onFontsReady);
  }

  let last = null;
  function update(dt, time, activeRoomId) {
    dt = clamp(finite(dt), 0, 0.1); time = finite(time);
    const k = 1 - Math.exp(-dt * 8);
    for (const room of rooms.values()) {
      const P = room._;
      const active = room.id === activeRoomId;
      const target = active ? 1 : 0;
      let ramp = P.ramp + (target - P.ramp) * k;
      if (Math.abs(ramp - target) < 0.004) ramp = target;
      if (ramp !== P.ramp) applyRamp(room, ramp);
      room.group.visible = active || ramp > 0.01;
      if (room.group.visible) for (const fn of P.anim) fn(time, dt, ramp);
    }
    last = activeRoomId;
  }
  return { group, rooms, update, get activeRoomId() { return last; } };
}
