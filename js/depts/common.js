/* Shared 3D helpers for department buildings, activities, and leisure props.
   Every helper that takes {x, y, z} anchors the shape at its BASE (y is the bottom), except sphere()
   and torus() which anchor at their center. One tile = one world unit. Local +z is south (toward the camera). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const BRAND = {
  navy: '#002D4F', aqua: '#75CCD0', salmon: '#E7706F', silver: '#E2E9EE', blue: '#004B91',
  white: '#F8F6F0', cream: '#F3EFE6', stone: '#C9CFD6', slate: '#3A4A5C', wood: '#8A6A55', woodDark: '#5E4538',
  brass: '#C9A14A', grass: '#8DBF66', glass: '#A9D8E6', glassLit: '#FFD88A', ink: '#0E1B2E',
};

/* ---------- materials (cached by key) ---------- */
const matCache = new Map();
export function mat(hex, opts = {}) {
  const key = hex + '|' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: opts.roughness === undefined ? 0.85 : opts.roughness,
    metalness: opts.metalness || 0,
    emissive: new THREE.Color(opts.emissive || '#000000'),
    emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
    transparent: !!opts.transparent || (opts.opacity !== undefined && opts.opacity < 1),
    opacity: opts.opacity === undefined ? 1 : opts.opacity,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: !!opts.flat,
  });
  m.userData.envMapIntensity = opts.envMapIntensity === undefined ? 0.25 : opts.envMapIntensity;
  matCache.set(key, m);
  return m;
}
/* A fresh (uncached) glass material whose emissive the renderer drives for lit windows. One per building. */
export function glass(hex = BRAND.glass) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.25, metalness: 0.1, emissive: new THREE.Color(BRAND.glassLit), emissiveIntensity: 0 });
  m.userData.envMapIntensity = 0.6;
  return m;
}
/* A fresh emissive material for lamps, screens, neon. Caller drives emissiveIntensity. */
export function glow(hex, intensity = 1) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.6, emissive: new THREE.Color(hex), emissiveIntensity: intensity });
}

/* ---------- geometry cache ---------- */
const geoCache = new Map();
function cached(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }

function place(mesh, o = {}) {
  if (o.rx) mesh.rotation.x = o.rx; if (o.ry) mesh.rotation.y = o.ry; if (o.rz) mesh.rotation.z = o.rz;
  mesh.castShadow = o.castShadow === undefined ? true : o.castShadow;
  mesh.receiveShadow = o.receiveShadow === undefined ? true : o.receiveShadow;
  if (o.parent) o.parent.add(mesh);
  return mesh;
}

/* box(w, h, d, material, {x, y, z, radius, parent}) base-anchored: center at (x, y + h/2, z). radius > 0 rounds the edges. */
export function box(w, h, d, material, o = {}) {
  const r = o.radius || 0;
  const g = r > 0 ? cached(`rb|${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r)) : cached(`b|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, (o.y || 0) + h / 2, o.z || 0);
  return place(m, o);
}
/* cyl(rTop, rBottom, h, material, {x, y, z, seg}) base-anchored. */
export function cyl(rTop, rBottom, h, material, o = {}) {
  const seg = o.seg || 24;
  const g = cached(`c|${rTop}|${rBottom}|${h}|${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, (o.y || 0) + h / 2, o.z || 0);
  return place(m, o);
}
/* cone(r, h, material, {x, y, z, seg}) base-anchored. seg 4 gives a pyramid (rotate ry = Math.PI / 4 to align with the axes). */
export function cone(r, h, material, o = {}) {
  const seg = o.seg || 24;
  const g = cached(`k|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, (o.y || 0) + h / 2, o.z || 0);
  return place(m, o);
}
/* sphere(r, material, {x, y, z}) CENTER-anchored. */
export function sphere(r, material, o = {}) {
  const ws = o.ws || 24, hs = o.hs || 16;
  const g = cached(`s|${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  return place(m, o);
}
/* dome(r, material, {x, y, z}) base-anchored half sphere (flat side down). */
export function dome(r, material, o = {}) {
  const g = cached(`d|${r}`, () => new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  return place(m, o);
}
/* torus(r, tube, material, {x, y, z, rx}) CENTER-anchored. Default lies flat (ring on the ground) when rx = Math.PI / 2. */
export function torus(r, tube, material, o = {}) {
  const g = cached(`t|${r}|${tube}`, () => new THREE.TorusGeometry(r, tube, 12, 32));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  return place(m, o);
}
/* plane(w, h, material, {x, y, z, rx, ry, rz}) CENTER-anchored flat quad. Default faces +z; use rx = -Math.PI / 2 for a floor. */
export function plane(w, h, material, o = {}) {
  const g = cached(`p|${w}|${h}`, () => new THREE.PlaneGeometry(w, h));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  return place(m, Object.assign({ castShadow: false }, o));
}

/* ---------- roofs (base-anchored at y; footprint w by d centered on x, z) ---------- */
export function hipRoofGeometry(w, d, h, ridgeLen) {
  const hw = w / 2, hd = d / 2, hr = Math.min(ridgeLen, w) / 2;
  const v = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],   // 0..3 eaves
    [-hr, h, 0], [hr, h, 0],                                   // 4, 5 ridge
  ];
  const tri = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [2, 1, 5], [0, 3, 4], [0, 1, 2], [0, 2, 3]];
  const pos = [];
  for (const t of tri) for (const i of t) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export function hipRoof(w, d, h, material, o = {}) {
  const ridge = o.ridge === undefined ? Math.max(0.5, w - d) : o.ridge;
  const g = cached(`hr|${w}|${d}|${h}|${ridge}`, () => hipRoofGeometry(w, d, h, ridge));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  return place(m, o);
}
export function gableRoofGeometry(w, d, h) {
  const hw = w / 2, hd = d / 2;
  const v = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, h, 0], [hw, h, 0]];
  const tri = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [2, 1, 5], [0, 3, 4], [0, 1, 2], [0, 2, 3]];
  const pos = [];
  for (const t of tri) for (const i of t) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export function gableRoof(w, d, h, material, o = {}) {
  const g = cached(`gr|${w}|${d}|${h}`, () => gableRoofGeometry(w, d, h));
  const m = new THREE.Mesh(g, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  return place(m, o);
}

/* ---------- compound helpers ---------- */
/* A row of framed windows on a wall. Windows lie in the plane z = o.z (use ry for other faces), centered on x0 .. x0 + (count-1)*spacing. */
export function windowRow(count, w, h, spacing, glassMat, o = {}) {
  const g = new THREE.Group();
  const frame = mat(o.frame || BRAND.slate, { roughness: 0.7 });
  for (let i = 0; i < count; i++) {
    const x = (o.x0 || 0) + i * spacing;
    box(w + 0.12, h + 0.12, 0.08, frame, { x, y: (o.y || 0) - 0.06, z: 0, parent: g, castShadow: false });
    box(w, h, 0.10, glassMat, { x, y: o.y || 0, z: 0.02, parent: g, castShadow: false });
  }
  g.position.set(0, 0, o.z || 0);
  if (o.ry) g.rotation.y = o.ry;
  if (o.parent) o.parent.add(g);
  return g;
}
/* Simple column (shaft + capital), base-anchored. */
export function column(r, h, material, o = {}) {
  const g = new THREE.Group();
  cyl(r, r * 1.1, h - 0.2, material, { y: 0, parent: g });
  box(r * 2.6, 0.2, r * 2.6, material, { y: h - 0.2, parent: g });
  box(r * 2.4, 0.12, r * 2.4, material, { y: 0, parent: g });
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.parent) o.parent.add(g);
  return g;
}
/* Canvas texture helper: draw(ctx, w, h) paints; returns a THREE.CanvasTexture in sRGB. */
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/* A flat decal (billboard, screen, poster) showing a canvas texture. CENTER-anchored, faces +z by default. */
export function decal(w, h, texture, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveMap: texture, emissiveIntensity: o.emissive || 0 });
  const mesh = plane(w, h, m, o);
  return mesh;
}
export function pointLight(hex, intensity, distance, o = {}) {
  const l = new THREE.PointLight(new THREE.Color(hex), intensity, distance, 2);
  l.position.set(o.x || 0, o.y || 0, o.z || 0);
  l.castShadow = false;
  if (o.parent) o.parent.add(l);
  return l;
}
export function rng(seedStr) { return window.TT.rng(window.TT.hash(String(seedStr))); }
export function tileCenter(tx, ty) { return new THREE.Vector3(tx + 0.5, 0, ty + 0.5); }
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/* Set opacity on every mesh in a group (used for fade in/out). */
export function setGroupOpacity(group, alpha) {
  group.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (alpha < 1) { m.transparent = true; } m.opacity = alpha; }
  });
}
