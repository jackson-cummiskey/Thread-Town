/* Data: Data & Analytics. An octagonal observatory whose purple dome splits open, with a bar-chart sculpture
   on the plinth, and an observation deck station where the astronomer pans a telescope while a billboard
   chart fills up one capture at a time.
   Creative brief: docs/CITY_DESIGN.md "## data". Coordinates and return shapes: docs/CONTRACT_V2.md. */
import * as THREE from 'three';
import { mat, glass, glow, box, cyl, sphere, torus, plane, canvasTex, decal, pointLight, clamp, lerp } from './common.js';

export const id = 'data';
export const activityLabel = 'Scanning the sky';

const C = {
  trim: '#F8F6F0', plinth: '#CFC6B6', iron: '#2E3E50', brass: '#F6D463', lilac: '#8E7BD0', aqua: '#75CCD0',
  ink: '#0E1B2E', glassTint: '#AFD6E4', white: '#FFFFFF', navy: '#002D4F',
};
const TAU = Math.PI * 2;
const ramp = n => clamp((n - 0.25) / 0.75, 0, 1);
const hasDoc = () => typeof document !== 'undefined';
const IRON = { roughness: 0.55, metalness: 0.2 };

// CONTRACT: the activity update does not receive night, and the building must pulse its sculpture on a
// capture, so the two share these through module scope. There is exactly one data building per town.
let nightS = 0;
let pulseAt = -10;

function tex(w, h, draw) { return hasDoc() ? canvasTex(w, h, draw) : null; }
function sign(w, h, fallbackHex, draw, o) {
  const t = tex(256, Math.max(32, Math.round(256 * h / w)), draw);
  if (t) return decal(w, h, t, o);
  return plane(w, h, mat(fallbackHex), o);
}

function drawLineChart(c, cw, ch) {
  c.fillStyle = C.trim; c.fillRect(0, 0, cw, ch);
  c.strokeStyle = '#C9CFD6'; c.lineWidth = 2;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, i * ch / 4); c.lineTo(cw, i * ch / 4); c.stroke(); }
  c.strokeStyle = C.lilac; c.lineWidth = 8; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cw * 0.08, ch * 0.8); c.lineTo(cw * 0.3, ch * 0.62); c.lineTo(cw * 0.5, ch * 0.7); c.lineTo(cw * 0.72, ch * 0.4); c.lineTo(cw * 0.92, ch * 0.18); c.stroke();
}
function drawStarMap(c, cw, ch) {
  c.fillStyle = C.navy; c.fillRect(0, 0, cw, ch);
  c.fillStyle = C.white;
  for (let i = 0; i < 60; i++) { const x = (i * 97 + 13) % cw, y = (i * 61 + 7) % ch; c.beginPath(); c.arc(x, y, (i % 3) + 1.2, 0, TAU); c.fill(); }
  c.strokeStyle = C.lilac; c.lineWidth = 5;
  c.beginPath(); c.moveTo(0, ch * 0.75); c.quadraticCurveTo(cw * 0.5, ch * 0.05, cw, ch * 0.6); c.stroke();
}
function drawBillboard(c, cw, ch) {
  c.fillStyle = C.ink; c.fillRect(0, 0, cw, ch);
  c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 2;
  for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(0, ch * 0.25 + i * ch * 0.75 / 6); c.lineTo(cw, ch * 0.25 + i * ch * 0.75 / 6); c.stroke(); }
  for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * cw / 8, ch * 0.25); c.lineTo(i * cw / 8, ch); c.stroke(); }
  c.fillStyle = C.white; c.font = `600 ${Math.round(ch * 0.16)}px Kanit, Inter, sans-serif`;
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('Signals scanned', cw * 0.05, ch * 0.13);
}

export function buildBuilding(ctx) {
  const { b, dept } = ctx;
  const w = b.w, h = b.h;
  const g = new THREE.Group();
  const wall = mat(dept.wall, { roughness: 0.9 });
  const roofM = mat(dept.accent, { roughness: 0.78, doubleSide: true });
  const accentM = mat(dept.accent, { roughness: 0.78 });
  const doorM = mat(dept.accent, { roughness: 0.6 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const plinth = mat(C.plinth, { roughness: 0.9 });
  const iron = mat(C.iron, IRON);
  const knob = mat(C.brass, { roughness: 0.3, metalness: 0.6 });
  const aquaM = mat(C.aqua, { roughness: 0.6 });
  const glassMat = glass();
  const cx = w / 2, cz = 2.8;
  const doorX = b.door.x - b.x + 1;
  const R_OCT = 3.2, FLAT = R_OCT * Math.cos(Math.PI / 8);

  /* 1 to 3: plinth, octagon, cornice, dome drum */
  box(w, 0.14, h, plinth, { x: cx, y: 0, z: h / 2, parent: g });
  cyl(R_OCT, R_OCT, 2.6, wall, { x: cx, y: 0.14, z: cz, seg: 8, ry: Math.PI / 8, parent: g });
  cyl(3.4, 3.4, 0.2, trim, { x: cx, y: 2.74, z: cz, seg: 8, ry: Math.PI / 8, parent: g, castShadow: false });
  cyl(2.8, 2.8, 0.6, trim, { x: cx, y: 2.94, z: cz, seg: 24, parent: g });

  /* 4: split dome, interior glass disc and the house telescope */
  const westG = new THREE.SphereGeometry(2.8, 32, 16, -Math.PI / 2, Math.PI, 0, Math.PI / 2);
  const eastG = new THREE.SphereGeometry(2.8, 32, 16, Math.PI / 2, Math.PI, 0, Math.PI / 2);
  const westHalf = new THREE.Mesh(westG, roofM); westHalf.position.set(cx, 3.54, cz); westHalf.castShadow = true; westHalf.receiveShadow = true; g.add(westHalf);
  const eastHalf = new THREE.Mesh(eastG, roofM); eastHalf.position.set(cx, 3.54, cz); eastHalf.castShadow = true; eastHalf.receiveShadow = true; g.add(eastHalf);
  cyl(2.6, 2.6, 0.06, glassMat, { x: cx, y: 3.54, z: cz, seg: 32, parent: g, castShadow: false });
  const scope = new THREE.Group();
  scope.position.set(cx, 3.6, cz);
  scope.rotation.x = 0.9;
  g.add(scope);
  cyl(0.25, 0.25, 2.2, iron, { parent: scope });
  cyl(0.27, 0.27, 0.2, trim, { y: 1.6, parent: scope, castShadow: false });

  /* 5: antenna mast */
  cyl(0.03, 0.03, 1.6, trim, { x: 6.9, y: 2.94, z: 1.2, seg: 8, parent: g, castShadow: false });
  for (const ry of [3.5, 3.8, 4.1]) box(0.4, 0.02, 0.02, trim, { x: 6.9, y: ry, z: 1.2, parent: g, castShadow: false });
  const antMat = glow(C.lilac, 0.3);
  sphere(0.06, antMat, { x: 6.9, y: 4.56, z: 1.2, parent: g, castShadow: false });

  /* 6: bar-chart sculpture on the plinth west of the door. Shifted 0.6 south and 0.2 west of the brief so the
     bars clear the octagon's south-west face. */
  const lilacM = glow(C.lilac, 0);
  lilacM.roughness = 0.7;
  const sculptBars = [];
  const heights = [1.4, 2.2, 1.8, 3.0, 2.6];
  const mats = [accentM, lilacM, aquaM, accentM, lilacM];
  box(3.0, 0.08, 0.6, trim, { x: 1.6, y: 0.14, z: 5.6, parent: g, castShadow: false });
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Group();
    bar.position.set(0.4 + i * 0.6, 0.22, 5.6);
    box(0.5, heights[i], 0.5, mats[i], { parent: bar });
    g.add(bar);
    sculptBars.push(bar);
  }

  /* 7: entrance porch centered on the door (the brief centers it on the building; the contract fixes the door) */
  box(2.0, 2.6, 1.0, wall, { x: doorX, y: 0.14, z: 5.5, parent: g });
  box(2.4, 0.15, 1.2, accentM, { x: doorX, y: 2.74, z: 5.5, parent: g });
  box(1.8, 2.05, 0.06, trim, { x: doorX, y: 0.14, z: 5.98, parent: g, castShadow: false });
  box(1.6, 1.9, 0.08, doorM, { x: doorX, y: 0.14, z: 6.0, parent: g });
  torus(0.18, 0.03, trim, { x: doorX, y: 1.4, z: 6.05, parent: g, castShadow: false });
  cyl(0.16, 0.16, 0.03, glassMat, { x: doorX, y: 1.385, z: 6.05, rx: Math.PI / 2, parent: g, castShadow: false });
  sphere(0.05, knob, { x: doorX + 0.6, y: 1.05, z: 6.08, parent: g, castShadow: false });
  sign(1.0, 0.6, C.trim, drawLineChart, { x: doorX, y: 2.4, z: 6.02, parent: g });
  box(2.2, 0.14, 0.5, plinth, { x: doorX, y: 0, z: 6.25, parent: g });

  /* 8: portholes, two each on the south-west, east and west faces */
  function porthole(px, pz, ry) {
    const p = new THREE.Group();
    p.position.set(px, 1.6, pz);
    p.rotation.y = ry;
    torus(0.36, 0.04, trim, { parent: p, castShadow: false });
    cyl(0.35, 0.35, 0.06, glassMat, { y: -0.03, rx: Math.PI / 2, parent: p, castShadow: false });
    g.add(p);
  }
  const d45 = FLAT * Math.SQRT1_2, t45 = 0.6 * Math.SQRT1_2;
  porthole(cx - d45 + t45, cz + d45 + t45, -Math.PI / 4);
  porthole(cx - d45 - t45, cz + d45 - t45, -Math.PI / 4);
  porthole(cx + FLAT, cz - 0.6, Math.PI / 2);
  porthole(cx + FLAT, cz + 0.6, Math.PI / 2);
  porthole(cx - FLAT, cz - 0.6, -Math.PI / 2);
  porthole(cx - FLAT, cz + 0.6, -Math.PI / 2);

  /* 9: star map on the south-east face */
  const sm = sign(1.4, 1.0, C.navy, drawStarMap, { x: cx + (FLAT + 0.03) * Math.SQRT1_2, y: 1.3, z: cz + (FLAT + 0.03) * Math.SQRT1_2, parent: g });
  sm.rotation.y = Math.PI / 4;

  const lights = [pointLight(C.lilac, 4, 5, { x: cx, y: 4.4, z: cz, parent: g })];

  let open = 0;
  function update(dt, time, night, active) {
    const r = ramp(night);
    nightS = night;
    const target = active || r > 0.5 ? 0.9 : 0;
    open += clamp(target - open, -0.45 * dt, 0.6 * dt);
    westHalf.position.x = cx - open;
    eastHalf.position.x = cx + open;
    const pulse = clamp(1 - (time - pulseAt) / 0.3, 0, 1);
    for (let i = 0; i < 5; i++) {
      sculptBars[i].scale.y = 1 + 0.1 * Math.sin(TAU * 0.2 * time + i * 1.1) + 0.1 * pulse;
    }
    lilacM.emissiveIntensity = 0.2 * r;
    antMat.emissiveIntensity = r > 0.02 ? (Math.sin(TAU * 0.5 * time) > 0 ? 1.5 : 0.2) * r : 0.3;
  }

  return { group: g, glass: [glassMat], lights, update };
}

/* ---------------------------------------------------------------- activity: telescope */
const DECK_TOP = 1.72, BAR_BASE_Y = 1.78, BAR_MIN = 0.1, BAR_MAX = 1.0, BAR_FULL = 0.85, BAR_GROW = 0.25;
const TILT = -0.7;

export function buildActivity(ctx) {
  const { dept } = ctx;
  const g = new THREE.Group();
  const wall = mat(dept.wall, { roughness: 0.9 });
  const trim = mat(C.trim, { roughness: 0.8 });
  const accent = mat(dept.accent, { roughness: 0.6 });
  const iron = mat(C.iron, IRON);
  const glassy = mat(C.glassTint, { roughness: 0.2, metalness: 0.05 });
  const white = mat(C.white, { roughness: 0.5 });

  /* 1: deck, cornice, porthole, stairs, railing */
  box(2.6, 1.6, 2.4, wall, { x: 2.0, y: 0, z: 2.0, parent: g });
  box(2.8, 0.12, 2.6, trim, { x: 2.0, y: 1.6, z: 2.0, parent: g, castShadow: false });
  torus(0.3, 0.04, trim, { x: 2.0, y: 0.9, z: 3.22, parent: g, castShadow: false });
  cyl(0.28, 0.28, 0.04, glassy, { x: 2.0, y: 0.88, z: 3.22, rx: Math.PI / 2, parent: g, castShadow: false });
  for (let i = 0; i < 6; i++) box(0.5, 0.3 + i * 0.28, 0.3, wall, { x: 0.45, y: 0, z: 3.05 - i * 0.3, parent: g });
  const posts = [[0.75, 0.85], [1.4, 0.85], [2.0, 0.85], [2.6, 0.85], [3.25, 0.85], [3.25, 2.0], [3.25, 3.15], [2.0, 3.15], [0.75, 3.15], [0.75, 1.4]];
  for (const [px, pz] of posts) cyl(0.03, 0.03, 0.5, iron, { x: px, y: DECK_TOP, z: pz, seg: 8, parent: g, castShadow: false });
  box(2.5, 0.05, 0.05, accent, { x: 2.0, y: DECK_TOP + 0.5, z: 0.85, parent: g, castShadow: false });
  box(0.05, 0.05, 2.3, accent, { x: 3.25, y: DECK_TOP + 0.5, z: 2.0, parent: g, castShadow: false });
  box(2.5, 0.05, 0.05, accent, { x: 2.0, y: DECK_TOP + 0.5, z: 3.15, parent: g, castShadow: false });
  box(0.05, 0.05, 1.2, accent, { x: 0.75, y: DECK_TOP + 0.5, z: 1.45, parent: g, castShadow: false });

  /* 2: telescope on a yoke */
  cyl(0.12, 0.14, 0.6, iron, { x: 2.0, y: DECK_TOP, z: 2.1, parent: g });
  const pan = new THREE.Group();
  pan.position.set(2.0, DECK_TOP + 0.6, 2.1);
  g.add(pan);
  const tilt = new THREE.Group();
  tilt.rotation.x = TILT;
  pan.add(tilt);
  cyl(0.18, 0.18, 1.8, trim, { y: -0.5, parent: tilt });
  cyl(0.19, 0.19, 0.2, accent, { y: 0.7, parent: tilt, castShadow: false });
  cyl(0.19, 0.19, 0.04, glassy, { y: 1.3, parent: tilt, castShadow: false });
  const lensMat = glow(C.brass, 0.2);
  sphere(0.1, lensMat, { y: 1.4, parent: tilt, castShadow: false });

  /* 3: billboard with six growing bars */
  cyl(0.05, 0.05, 2.6, iron, { x: 0.6, y: 0, z: 0.3, seg: 10, parent: g });
  cyl(0.05, 0.05, 2.6, iron, { x: 3.4, y: 0, z: 0.3, seg: 10, parent: g });
  box(3.0, 1.6, 0.1, mat(C.ink, { roughness: 0.9 }), { x: 2.0, y: 1.1, z: 0.3, parent: g });
  sign(2.9, 1.5, C.ink, drawBillboard, { x: 2.0, y: 1.9, z: 0.36, parent: g });
  const barMat = glow(C.aqua, 0.7);
  const bars = [], ticks = [], barH = [];
  for (let i = 0; i < 6; i++) {
    const bar = new THREE.Group();
    bar.position.set(0.9 + i * 0.44, BAR_BASE_Y, 0.5);
    box(0.32, 1, 0.2, barMat, { parent: bar, castShadow: false });
    g.add(bar);
    bars.push(bar);
    barH.push(BAR_MIN + 0.12 * i);
    ticks.push(sphere(0.06, white, { x: 0.9 + i * 0.44, y: BAR_BASE_Y + barH[i], z: 0.5, parent: g, castShadow: false }));
  }

  /* 4: star speckles on a hemisphere above the telescope */
  const starMat = glow(C.white, 0.6);
  const stars = [];
  for (let i = 0; i < 24; i++) {
    const a = i * 2.399, el = 0.25 + 1.2 * ((i * 0.618) % 1);
    const s = sphere(0.045, starMat, { x: 2.0 + 1.4 * Math.cos(el) * Math.cos(a), y: 2.6 + 1.4 * Math.sin(el), z: 2.1 + 1.4 * Math.cos(el) * Math.sin(a), parent: g, castShadow: false, receiveShadow: false });
    s.visible = false;
    stars.push(s);
  }

  /* 5: star trail */
  const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.brass), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const trail = plane(0.6, 0.04, trailMat, { x: 1.0, y: 2.8, z: 0.4, parent: g });
  trail.renderOrder = 5;
  trail.visible = false;

  const anchor = new THREE.Vector3(2.0, DECK_TOP, 2.65);
  const YAW = 0;

  /* state */
  let lastBurst = -1, nextBar = 0, wasWorking = false;
  let flashT = -10, growT = -10, growIdx = -1, growFrom = 0, trailT = -10;
  let panV = 0, lensI = 0.2;

  function setBar(i, hgt) {
    bars[i].scale.y = hgt;
    ticks[i].position.y = BAR_BASE_Y + hgt;
  }

  function update(dt, time, phase, alien, active) {
    const k = 1 - Math.exp(-4 * dt);
    if (active && !wasWorking) lastBurst = -1;
    wasWorking = active;

    /* telescope pan and nod, the alien turns with the tube */
    if (active) {
      panV = 0.6 * Math.sin(TAU * phase.t / 8);
      tilt.rotation.x = TILT + 0.1 * Math.sin(TAU * phase.t / 3);
    } else {
      panV += (0 - panV) * k;
      tilt.rotation.x += (TILT - tilt.rotation.x) * k;
    }
    pan.rotation.y = panV;
    if (alien && alien.group) alien.group.rotation.y = YAW + 0.7 * panV;

    /* lens glow: breathe while working, flash on capture, dim when idle */
    const flash = clamp(1 - (time - flashT) / 0.3, 0, 1);
    const lensTarget = active ? 0.6 + 0.2 * Math.sin(TAU * 0.5 * time) : 0.2;
    lensI += (lensTarget - lensI) * k;
    lensMat.emissiveIntensity = Math.max(lensI, 1.2 * flash);

    /* speckles */
    for (let i = 0; i < 24; i++) {
      const s = stars[i];
      s.visible = active;
      if (active) { const tw = 0.55 + 0.45 * Math.sin(TAU * (0.6 + 0.1 * (i % 5)) * time + i); s.scale.set(tw, tw, tw); }
    }
    starMat.emissiveIntensity = active ? 0.8 : 0;

    /* work bursts: a capture */
    if (active) {
      const idx = Math.floor((phase.t - 0.7) / 3.2);
      if (idx >= 0 && idx !== lastBurst) {
        lastBurst = idx;
        flashT = time; trailT = time; pulseAt = time;
        let allFull = true;
        for (let i = 0; i < 6; i++) if (barH[i] < BAR_FULL) allFull = false;
        if (allFull) { for (let i = 0; i < 6; i++) { barH[i] = BAR_MIN; setBar(i, BAR_MIN); } nextBar = 0; }
        growIdx = nextBar; growFrom = barH[growIdx]; growT = time;
        barH[growIdx] = Math.min(BAR_MAX, growFrom + BAR_GROW);
        nextBar = (nextBar + 1) % 6;
      }
    }
    if (growIdx >= 0) {
      const u = clamp((time - growT) / 0.5, 0, 1);
      const e = 1 - (1 - u) * (1 - u);
      setBar(growIdx, lerp(growFrom, barH[growIdx], e));
      const pop = u < 1 ? 1 + 0.8 * Math.sin(Math.PI * u) : 1;
      ticks[growIdx].scale.set(pop, pop, pop);
      if (u >= 1) growIdx = -1;
    }
    if (!active) {
      /* bars sink toward 0.3 of their height over about 20 s */
      for (let i = 0; i < 6; i++) {
        if (i === growIdx) continue;
        const floor = Math.max(BAR_MIN, barH[i] * 0.3);
        const cur = bars[i].scale.y;
        if (cur > floor) setBar(i, Math.max(floor, cur - (barH[i] * 0.7) * dt / 20));
      }
    } else {
      for (let i = 0; i < 6; i++) if (i !== growIdx && bars[i].scale.y < barH[i]) setBar(i, Math.min(barH[i], bars[i].scale.y + dt * 2));
    }

    /* star trail across the board top */
    const tu = (time - trailT) / 0.5;
    if (tu >= 0 && tu < 1) {
      trail.visible = true;
      trail.position.x = lerp(0.8, 2.8, tu);
      trailMat.opacity = 0.9 * Math.sin(Math.PI * tu);
    } else {
      trail.visible = false;
    }
  }

  for (let i = 0; i < 6; i++) setBar(i, barH[i]);
  return { group: g, anchor, yaw: YAW, pose: 'lookUp', enter: 'inside', label: activityLabel, update };
}
