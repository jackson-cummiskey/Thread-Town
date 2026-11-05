/* Thread Town city dressing, version 11 (docs/CONTRACT_V11.md "Files: js/golf.js, js/city.js" and
   docs/V11_DESIGN.md "Docks", "Kickers", "The kiosk", "Water levels"; docs/CONTRACT_V10.md
   "Files: js/city.js", docs/CONTRACT_V7.md "City dressing" and docs/CONTRACT_V9.md still apply;
   the geography in docs/WORLD_DESIGN.md as amended by docs/V11_DESIGN.md).
   Filler buildings on the plan's filler lots at any angle, street furniture sampled along the
   road splines (lamps, benches, bins, hydrants, mailboxes, bike racks, bus shelters, traffic
   lights and the road name signs at the crossings, manholes), the lakeshore and park path
   furniture, the boardwalks (with their decorative rowboats) and the marina with its finger slips,
   the retaining walls as low stone walls, the bluff parapet, the stairs from the bluff to the
   riverside walk, the Thread National entrance sign, the paved parking lots (no cars) and the
   scooter rack rails.
   v11: the boat docks from plan.docks (a cleat and a mooring post on a deck tile, a plank platform
   with posts to the bed on a bank tile), the three kicker ramps from plan.kickers (two tile plank
   ramps with rails and a Thread stripe), the shop kiosk at plan.kiosk (a navy booth, an aqua
   awning and roof, a silver counter, a salmon 'Shop' sign, a coin on the side, a bulb lit at
   night) and the two weir lips from plan.weirs (a navy stone sill with a white water tongue). The
   boats themselves are sim entities now (js/vehicles.js draws them), so the marina slips stand
   empty here. userData.docks, userData.kickers, userData.kiosk and userData.weirs describe what
   was built.
   What this module no longer draws: the painted road curbs, crosswalks and the bridges
   (js/roads.js owns the road meshes and every plan bridge, the creek and channel bridges among
   them), trees and shore rocks (js/nature.js owns trees and rocks), the pier (js/leisure3d.js),
   the median planters (the roads module's median), the moored boats (js/vehicles.js).
   Everything static is merged per material here (BufferGeometryUtils) so the whole city costs a
   few dozen draw calls; only the traffic light lenses and two flags stay as small animated meshes.

   buildCity(ctx) -> { group, update(dt, time, night), lights, glass }
     ctx = { THREE, state, plan, sim, rng, heightAt?, normalAt?, terrain?, waterLevel? }.
     The logic grid is the plan's own raster (cityplan rasterizePlan, the same raster the sim v10
     paints), so sidewalks, paths, decks and water are read from MARK values; the sim state gives
     the racks (state.racks). ctx.heightAt(x, z) is the terrain height (default flat 0);
     ctx.terrain (the buildTerrain record) supplies lotHeight(lot) for the lot plateaus and, when
     terrain v2 exports it, retainingWalls (segments with a, b and top, bottom heights; any of
     the shapes normalizeWalls accepts); without it the walls are derived from the lot plateaus
     against the ground outside each edge (more than 1.2 apart). ctx.waterLevel is the water
     surface height (a number or a function of x, z; default 0.04, today's water plane) for the
     boats and the dock. Every lot frame stands at its plateau (a stone skirt closes the gap
     where the ground at a corner lies below it), every piece of furniture, rack and lamp stands
     at the height under its base plus the ribbon lift there (ctx.surfaceLift(x, z) when the
     renderer passes the roads module's surfaceLiftAt, else the roads.js constants: 0.07 on a
     sidewalk tile, 0.03 on a road or bridge tile), the boardwalk decks follow the bank tile by
     tile, and group.userData.placements lists every anchor { x, z, y, kind } for the headless
     check; userData.lots, userData.marina, userData.walls, userData.crossings and
     userData.entranceSign describe what was built.
   buildScooter(ctx) -> Group, kept for older callers: js/vehicles.js makeScooter(ctx).group wrapped
     so it faces +x as the version 7 primitive set did.

   Conventions: one tile = one world unit, x east, z south, tile (x, y) covers x..x+1, y..y+1.
   Lots are built in their canonical frame (origin at the canonical north-west corner, the door on
   the local south face) and rotated by the exact lot.rot (any angle, clockwise seen from above)
   about the lot center, the rotation cityplan rotVec uses. */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, glass, gableRoofGeometry, clamp } from './depts/common.js';
import { PLAN as DEFAULT_PLAN, rasterizePlan, MARK, lotWorldRect, lotCenter, lotLayout, rotVec, splineSamples, ROAD_KINDS } from './cityplan.js';
import { makeScooter } from './vehicles.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const hasDoc = () => typeof document !== 'undefined' && document && typeof document.createElement === 'function';

/* ---------- palette (docs/ART_DIRECTION.md materials plus the city additions) ---------- */
const C = {
  trim: '#F8F6F0', iron: '#2E3E50', wood: '#A5774E', woodDark: '#6B4A2B', stone: '#B9C4CC', lightStone: '#CBD3DA',
  concrete: '#C9C4B8', plinth: '#CFC6B6', asphalt: '#5A5D62', membrane: '#8C8F94', gravel: '#B9B2A4',
  navy: '#002D4F', aqua: '#75CCD0', salmon: '#E7706F', silver: '#E2E9EE', blue: '#004B91', brass: '#F6D463',
  bulb: '#FFF1C9', bulbGlow: '#FFE2A0', lampLight: '#FFC97A', hedge: '#6FA860', leaf: '#5FA55A',
  tyre: '#1F262D', chrome: '#D9DEE3', rock: '#9AA3A8', rockDark: '#7E878C', slate: '#5B6B7C', ink: '#0E1B2E',
  brick: '#B8604A', brickDark: '#9C5241', cream: '#F3EFE6', sand: '#EDE2C8', tile: '#7A4B3A', hull: '#F3EFE6',
  panelGlass: '#5E7A8C', signGreen: '#2F6B4F', white: '#FFFFFF',
};
const WALLS = {
  apartment: { cream: ['#F3EFE6', '#EFE6D2'], salmon: ['#EDA9A3', '#E7948F'], aqua: ['#BFE3E4', '#A9D9DB'], brick: ['#B8604A', '#A8563F'] },
  rowhouse: { brick: ['#B8604A', '#9C5241', '#C9735B', '#A85A45'], stone: ['#C9CFD6', '#D7DBE0', '#BFC6CE', '#CDD3D9'], cream: ['#F3EFE6', '#EADFC8', '#F6E7C8', '#EFE6D2'] },
  shop: { coffee: '#F6E7C8', books: '#E8E2D5', flowers: '#EFE8DA', records: '#3A4A5C', deli: '#F0E9DB' },
  office: { stone: '#C9CFD6', glass: '#DCE3E8' },
};
const SHOP_SIGNS = {
  coffee: { text: 'Corner coffee', bg: C.navy, fg: C.aqua }, books: { text: 'Harbor books', bg: C.salmon, fg: C.white },
  flowers: { text: 'Mint flowers', bg: C.aqua, fg: C.navy }, records: { text: 'Riverside records', bg: C.ink, fg: C.salmon },
  deli: { text: 'Ledger deli', bg: C.cream, fg: C.navy }, bikes: { text: 'Spoke bikes', bg: C.navy, fg: C.white },
  barber: { text: 'Avenue barber', bg: C.white, fg: C.navy }, pharmacy: { text: 'Town pharmacy', bg: C.aqua, fg: C.white },
};
const FLAT = { cast: false, receive: false };
const ramp = s => clamp((s - 0.25) / 0.75, 0, 1);
/* The road ribbons' heights above the terrain (js/roads.js LIFT and SIDEWALK_LIFT), the
   fallback when the renderer passes no ctx.surfaceLift. */
const ROAD_LIFT = 0.03, SIDEWALK_LIFT = 0.07;
/* The outer edge of a sidewalk ribbon past the road's half width (js/roads.js: one tile plus the curb lip). */
const SIDEWALK_EDGE = 1.06;

/* ---------- seeded helpers (no dependency on window.TT) ---------- */
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seeded(seedStr) {
  let a = hash(String(seedStr)) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------- geometry helpers (fresh geometries, base anchored unless noted) ---------- */
function gBox(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x || 0, (y || 0) + h / 2, z || 0); return g; }
function gCyl(rt, rb, h, seg, x, y, z) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x || 0, (y || 0) + h / 2, z || 0); return g; }
function gCone(r, h, seg, x, y, z) { const g = new THREE.ConeGeometry(r, h, seg); g.translate(x || 0, (y || 0) + h / 2, z || 0); return g; }
function gSphere(r, x, y, z, ws, hs) { const g = new THREE.SphereGeometry(r, ws || 12, hs || 8); g.translate(x || 0, y || 0, z || 0); return g; }
function gDisc(r, x, y, z, seg) { const g = new THREE.CircleGeometry(r, seg || 20); g.rotateX(-Math.PI / 2); g.translate(x, y, z); return g; }
function gFlat(w, d, x, y, z) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x, y, z); return g; }
/* Rotate a geometry about the vertical axis through (px, pz). */
function spin(g, a, px, pz) { if (!a) return g; g.translate(-px, 0, -pz); g.rotateY(a); g.translate(px, 0, pz); return g; }
/* A right triangle prism along x: vertical face at z = 0 (facing -z), the slope falling toward +z over run, rise high. */
function sawtoothGeo(len, run, rise) {
  const hl = len / 2;
  const v = [[-hl, 0, 0], [hl, 0, 0], [hl, 0, run], [-hl, 0, run], [-hl, rise, 0], [hl, rise, 0]];
  const tri = [[0, 1, 5], [0, 5, 4], [4, 5, 2], [4, 2, 3], [1, 0, 3], [1, 3, 2], [0, 4, 3], [1, 2, 5]];
  const pos = [];
  for (const t of tri) for (const i of t) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/* Every merged geometry needs the same attribute set and indexing: position, normal, uv, non indexed. */
function normalize(g) {
  let n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.morphAttributes = {};
  return n;
}

/* ---------- merge buckets: one mesh per material and shadow flag pair ---------- */
class Buckets {
  constructor() { this.map = new Map(); }
  add(geo, material, o) {
    const cast = !o || o.cast !== false, receive = !o || o.receive !== false;
    const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let b = this.map.get(key);
    if (!b) { b = { material, cast, receive, list: [] }; this.map.set(key, b); }
    b.list.push(normalize(geo));
  }
  build(group) {
    let meshes = 0, parts = 0;
    for (const b of this.map.values()) {
      if (!b.list.length) continue;
      let merged = null;
      try { merged = BufferGeometryUtils.mergeGeometries(b.list, false); } catch (e) { merged = null; }
      for (const g of b.list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, b.material);
      m.castShadow = b.cast; m.receiveShadow = b.receive;
      m.userData.merged = true; m.userData.noMerge = true;
      group.add(m);
      meshes++; parts += b.list.length;
    }
    return { meshes, parts };
  }
}

/* ---------- sign atlas: every text face in the city shares one canvas and one material ---------- */
const ATLAS_ROW = 64, ATLAS_W = 1024;
class SignAtlas {
  constructor() { this.rows = []; this.material = null; this.fallback = mat(C.navy, { roughness: 0.8, doubleSide: true }); }
  /* Registers a text face; aspect is the face's width over height (at most 16). Returns the row. */
  add(text, bg, fg, aspect) { this.rows.push({ text, bg, fg, aspect: clamp(aspect, 1, 16) }); return this.rows.length - 1; }
  /* A plane of w by h facing +z, centered, with its uv on the row. */
  plane(row, w, h) {
    const g = new THREE.PlaneGeometry(w, h);
    const n = Math.max(1, this.rows.length), r = this.rows[row];
    const u1 = r.aspect / 16, v0 = 1 - (row + 1) / n, v1 = 1 - row / n;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u1, v0 + uv.getY(i) * (v1 - v0));
    return g;
  }
  finish() {
    if (!this.rows.length || !hasDoc()) return this.fallback;
    const n = this.rows.length;
    const c = document.createElement('canvas'); c.width = ATLAS_W; c.height = ATLAS_ROW * n;
    const g = c.getContext('2d');
    this.rows.forEach((r, i) => {
      const y = i * ATLAS_ROW, w = Math.round(ATLAS_W * r.aspect / 16);
      g.fillStyle = r.bg; g.fillRect(0, y, ATLAS_W, ATLAS_ROW);
      g.fillStyle = r.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 40; g.font = '600 ' + size + 'px Kanit, Inter, sans-serif';
      while (size > 14 && g.measureText(r.text).width > w - 16) { size -= 2; g.font = '600 ' + size + 'px Kanit, Inter, sans-serif'; }
      g.fillText(r.text, w / 2, y + ATLAS_ROW / 2 + 2);
      g.fillRect(8, y + ATLAS_ROW - 5, w - 16, 2);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, emissive: new THREE.Color('#FFFFFF'), emissiveMap: t, emissiveIntensity: 0, side: THREE.DoubleSide });
    m.userData.envMapIntensity = 0.25;
    this.material = m;
    return m;
  }
}

/* ---------- small shared materials ---------- */
const awningCache = new Map();
function awningMat(accent) {
  let m = awningCache.get(accent);
  if (m) return m;
  if (!hasDoc()) { m = mat(accent, { roughness: 0.92, doubleSide: true }); awningCache.set(accent, m); return m; }
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFFFFF' : accent; g.fillRect(i * 64, 0, 64, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, side: THREE.DoubleSide });
  m.userData.envMapIntensity = 0.25;
  awningCache.set(accent, m);
  return m;
}
function gradientTex(w, h, draw) {
  if (!hasDoc()) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
/* Ground shadow band under wall bases: alpha strongest at the wall (canvas bottom), fading outward. */
function shadowBandMat() {
  const t = gradientTex(4, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,20,40,0.5)'); gr.addColorStop(1, 'rgba(0,20,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  if (t) return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  return new THREE.MeshBasicMaterial({ color: new THREE.Color('#0A1A2A'), transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
}
function poolMaterial() {
  const t = gradientTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,210,122,1)'); gr.addColorStop(1, 'rgba(255,210,122,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD27A'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  if (t) m.map = t;
  return m;
}

/* ---------- tiles: the plan's raster (cityplan rasterizePlan), the logic grid the sim v10 paints ---------- */
/* at(x, y) returns a MARK value (NONE off the map). The classifiers are what the dressing asks:
   a sidewalk tile for street furniture, road for manholes, grass (plain ground or rough) for
   benches and verge lamps, water for the boats, decks for the marina. */
function makeTiles(ctx, plan) {
  const R = rasterizePlan(plan);
  const at = (x, y) => (x < 0 || y < 0 || x >= plan.cols || y >= plan.rows) ? MARK.NONE : R.at(x, y);
  return {
    R, at, cols: plan.cols, rows: plan.rows,
    isSidewalk: (x, y) => at(x, y) === MARK.SIDEWALK,
    isRoad: (x, y) => at(x, y) === MARK.ROAD,
    isWater: (x, y) => at(x, y) === MARK.WATER,
    isGrass: (x, y) => { const v = at(x, y); return v === MARK.NONE || v === MARK.GOLF; },
    isDeck: (x, y) => at(x, y) === MARK.DECK,
  };
}

/* ---------- faces of a box footprint, for windows, signs and shadow bands ---------- */
/* Returns the wall face's center, yaw and length. Local u runs along the face, local +z is outward. */
function faceOf(face, x0, z0, x1, z1) {
  if (face === 'S') return { cx: (x0 + x1) / 2, cz: z1, ry: 0, len: x1 - x0 };
  if (face === 'N') return { cx: (x0 + x1) / 2, cz: z0, ry: Math.PI, len: x1 - x0 };
  if (face === 'E') return { cx: x1, cz: (z0 + z1) / 2, ry: Math.PI / 2, len: z1 - z0 };
  return { cx: x0, cz: (z0 + z1) / 2, ry: -Math.PI / 2, len: z1 - z0 };
}
function faced(g, f) { g.rotateY(f.ry); g.translate(f.cx, 0, f.cz); return g; }

/* The per-lot build context: add() applies the lot frame, then drops the part in a bucket.
   v10: the frame is the exact rotation (any angle) about the lot center (cityplan lotCenter) at
   the lot's plateau: the terrain's lotHeight when the terrain record is given (what the renderer
   does for the departments), else the ground at the center. The exact corners of a rotated lot
   sample the terrain's blend ring, so they are never used to lift the frame; where a corner lies
   more than 0.15 below the plateau a stone skirt (the footprint, from below the lowest corner up
   to the floor) closes the gap under the building, counted in counts.skirts. A corner above the
   plateau is the terrain's own step, held by its retaining wall. */
function lotContext(B, lot, atlas, out, extra) {
  const r = lotWorldRect(lot);
  const w = lot.w, h = lot.h, rot = r.rot || 0;
  const cx = r.cx, cz = r.cy;
  const ly = out && typeof out.plateauOf === 'function' ? out.plateauOf(lot) : (out && typeof out.heightAt === 'function' ? out.heightAt(cx, cz) : 0);
  const cornerHeights = out && typeof out.heightAt === 'function' ? r.corners.map(([x, z]) => out.heightAt(x, z)) : [ly, ly, ly, ly];
  const lowest = Math.min.apply(null, cornerHeights);
  const skirt = Number.isFinite(lowest) && ly - lowest > 0.15 ? ly - lowest + 0.3 : 0;
  if (out && out.placements) out.placements.push({ x: cx, z: cz, y: ly, kind: 'lot:' + lot.id });
  if (out && out.lotRecords) out.lotRecords.push({ id: lot.id, kind: lot.kind, x: cx, z: cz, y: ly, rot, w, h, corners: r.corners, cornerHeights, skirt });
  const F = new THREE.Matrix4().makeTranslation(cx, ly, cz)
    .multiply(new THREE.Matrix4().makeRotationY(rot * DEG))
    .multiply(new THREE.Matrix4().makeTranslation(-w / 2, 0, -h / 2));
  if (skirt > 0) {
    B.add(gBox(w, skirt, h, w / 2, -skirt - 0.01, h / 2).applyMatrix4(F), mat(C.plinth, { roughness: 0.9 }));
    if (out && out.counts) out.counts.skirts++;
  }
  /* The yard depth in the canonical frame: the raster (cityplan lotLayout) keeps a two row yard
     with the door pair and the stub only on lots at least seven deep; shallower lots are building
     to the south edge with the door tile on the sidewalk. Recipes put the street wall at h - yard. */
  const L = lotLayout(lot, out && out.plan);
  const yard = extra && Number.isFinite(extra.yard) ? extra.yard : (L && Number.isFinite(L.yard) ? L.yard : (h >= 7 ? 2 : 0));
  const A = {
    B, lot, w, h, yard, F, atlas, out, r: seeded('lot:' + lot.id + ':' + (lot.seed || 0) + ':' + lot.style),
    trim: mat(C.trim, { roughness: 0.8 }), iron: mat(C.iron, { roughness: 0.55, metalness: 0.2 }), plinth: mat(C.plinth, { roughness: 0.9 }),
    glassMat: null,
    add(geo, m, o) { return B.add(geo.applyMatrix4(F), m, o); },
    /* World position of a local point, for the few dynamic meshes. */
    world(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(F); },
  };
  if (extra && extra.glass) { A.glassMat = glass(); out.glass.push(A.glassMat); }
  return A;
}

/* ---------- building parts ---------- */
/* Rows of framed windows on one face of the box x0..x1 by z0..z1. floors from y0, floorH each. */
function windows(A, face, x0, z0, x1, z1, y0, floors, floorH, o = {}) {
  const f = faceOf(face, x0, z0, x1, z1);
  const bay = o.bay || 1.2, ww = o.w || 0.6, wh = o.h || 0.7;
  const n = Math.max(1, Math.floor((f.len - 0.5) / bay));
  const span = (n - 1) * bay;
  const frame = o.frame || A.trim;
  for (let fl = 0; fl < floors; fl++) {
    const fy = y0 + fl * floorH + floorH * 0.55;
    for (let i = 0; i < n; i++) {
      const u = -span / 2 + i * bay;
      if (fl === 0 && o.doorU !== undefined && Math.abs(u - o.doorU) < bay * 0.8) continue;
      if (o.skip && o.skip(fl, i, n)) continue;
      A.add(faced(gBox(ww + 0.12, wh + 0.12, 0.05, u, fy - (wh + 0.12) / 2, 0.02), f), frame);
      A.add(faced(gBox(ww, wh, 0.05, u, fy - wh / 2, 0.035), f), A.glassMat);
    }
  }
}
/* A continuous glass band per floor on a face (offices and the tower), with spandrels between. */
function glassBands(A, face, x0, z0, x1, z1, y0, floors, floorH, o = {}) {
  const f = faceOf(face, x0, z0, x1, z1);
  const len = f.len - 0.3, gh = o.gh || floorH * 0.62;
  for (let fl = 0; fl < floors; fl++) {
    const y = y0 + fl * floorH;
    A.add(faced(gBox(len, gh, 0.05, 0, y + floorH * 0.22, 0.035), f), A.glassMat);
    if (o.spandrel) A.add(faced(gBox(len + 0.1, floorH * 0.2, 0.06, 0, y + 0.01, 0.03), f), o.spandrel);
    if (o.mullions) for (let u = -len / 2 + 1; u < len / 2; u += o.mullions) A.add(faced(gBox(0.05, gh, 0.07, u, y + floorH * 0.22, 0.045), f), A.trim);
  }
}
/* Dark decal strips at the wall bases on all four sides. */
function shadowBands(A, x0, z0, x1, z1, y) {
  const m = A.out.shadowMat, yy = (y || 0) + 0.012;
  // each strip stays inside the lot rectangle (0..w by 0..h)
  const depth = avail => clamp(Math.min(0.45, avail - 0.02), 0, 0.45);
  const strip = (len, face, d, ext) => {
    if (d <= 0.05) return null;
    const g = new THREE.PlaneGeometry(len + ext, d); g.rotateX(-Math.PI / 2);
    g.translate(0, 0, d / 2);
    return faced(g, face);
  };
  const dN = depth(z0), dS = depth(A.h - z1), dE = depth(A.w - x1), dW = depth(x0);
  const list = [
    strip(x1 - x0, faceOf('N', x0, z0, x1, z1), dN, Math.min(dE, dW)), strip(x1 - x0, faceOf('S', x0, z0, x1, z1), dS, Math.min(dE, dW)),
    strip(z1 - z0, faceOf('E', x0, z0, x1, z1), dE, Math.min(dN, dS)), strip(z1 - z0, faceOf('W', x0, z0, x1, z1), dW, Math.min(dN, dS)),
  ];
  for (const g of list) if (g) A.add(g.translate(0, yy, 0), m, FLAT);
}
/* Entrance on the south face at x = dx, wall face z = zf: door, frame, step, optional canopy. */
function entrance(A, dx, zf, o = {}) {
  const dw = o.double ? 1.4 : 0.9, dh = o.h || 1.1, doorMat = o.door || mat(C.navy, { roughness: 0.6 });
  A.add(gBox(dw + 0.16, dh + 0.1, 0.06, dx, 0.1, zf + 0.02), A.trim);
  A.add(gBox(dw, dh, 0.08, dx, 0.1, zf + 0.04), doorMat);
  if (o.double) A.add(gBox(0.03, dh, 0.09, dx, 0.1, zf + 0.045), mat('#0E2238', { roughness: 0.7 }));
  A.add(gSphere(0.035, dx + (o.double ? 0.15 : 0.3), 0.72, zf + 0.09), mat(C.brass, { roughness: 0.3, metalness: 0.6 }));
  if (o.double) A.add(gSphere(0.035, dx - 0.15, 0.72, zf + 0.09), mat(C.brass, { roughness: 0.3, metalness: 0.6 }));
  A.add(gBox(dw + 0.6, 0.1, 0.5, dx, 0, zf + 0.25), A.plinth);
  if (o.canopy) {
    A.add(gBox(dw + 0.8, 0.08, 0.7, dx, dh + 0.25, zf + 0.35), o.canopy === true ? A.trim : o.canopy);
    for (const s of [-1, 1]) A.add(gCyl(0.025, 0.025, 1.4, 6, dx + s * (dw / 2 + 0.3), 0, zf + 0.6), A.iron);
  }
  if (o.lamp) {
    A.add(gBox(0.1, 0.14, 0.1, dx + dw / 2 + 0.3, dh + 0.05, zf + 0.06), A.iron);
    A.add(gSphere(0.05, dx + dw / 2 + 0.3, dh + 0.12, zf + 0.12, 8, 6), A.out.bulbMat);
  }
}
/* Parapet walls and rooftop details on a flat roof over x0..x1 by z0..z1 at height y. */
function flatRoof(A, x0, z0, x1, z1, y, wallMat, o = {}) {
  const r = A.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  A.add(gBox(w + 0.1, 0.08, d + 0.1, cx, y - 0.04, cz), o.roof || mat(C.membrane, { roughness: 0.8 }));
  const ph = o.parapet === undefined ? 0.35 : o.parapet;
  if (ph > 0) {
    A.add(gBox(w + 0.1, ph, 0.14, cx, y, z0 + 0.07 - 0.05), wallMat);
    A.add(gBox(w + 0.1, ph, 0.14, cx, y, z1 - 0.07 + 0.05), wallMat);
    A.add(gBox(0.14, ph, d, x0 + 0.07 - 0.05, y, cz), wallMat);
    A.add(gBox(0.14, ph, d, x1 - 0.07 + 0.05, y, cz), wallMat);
    A.add(gBox(w + 0.2, 0.06, 0.24, cx, y + ph, z0 + 0.07), A.trim);
    A.add(gBox(w + 0.2, 0.06, 0.24, cx, y + ph, z1 - 0.07), A.trim);
    A.add(gBox(0.24, 0.06, d, x0 + 0.07, y + ph, cz), A.trim);
    A.add(gBox(0.24, 0.06, d, x1 - 0.07, y + ph, cz), A.trim);
  }
  const ac = o.ac === undefined ? 1 + Math.floor(r() * 2) : o.ac;
  for (let i = 0; i < ac; i++) {
    const ax = x0 + 0.8 + r() * Math.max(0.2, w - 1.6), az = z0 + 0.8 + r() * Math.max(0.2, d - 1.6);
    A.add(gBox(0.7, 0.45, 0.6, ax, y, az), mat(C.lightStone, { roughness: 0.85 }));
    A.add(gCyl(0.22, 0.22, 0.06, 12, ax, y + 0.45, az), A.iron);
  }
  if (o.tank) {
    const tx = x0 + w * 0.3, tz = z0 + d * 0.35;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) A.add(gBox(0.08, 0.7, 0.08, tx + sx * 0.4, y, tz + sz * 0.4), A.iron);
    A.add(gCyl(0.55, 0.55, 0.9, 14, tx, y + 0.7, tz), mat(C.wood, { roughness: 0.8 }));
    A.add(gCone(0.6, 0.3, 14, tx, y + 1.6, tz), A.iron);
  }
  if (o.vents) for (let i = 0; i < o.vents; i++) A.add(gCyl(0.08, 0.08, 0.3 + r() * 0.2, 8, x0 + 0.5 + r() * (w - 1), y, z0 + 0.5 + r() * (d - 1)), A.iron);
  if (o.skylight) A.add(gBox(1.2, 0.18, 0.8, cx, y, cz), A.glassMat);
  if (o.hatch) A.add(gBox(0.8, 0.5, 0.8, x1 - 1.0, y, z1 - 1.0), wallMat);
}
/* A sign face on the south wall: atlas text plane with a backing plate. */
function signFace(A, text, bg, fg, cx, y, zf, w, h, o = {}) {
  const row = A.atlas.add(text, bg, fg, w / h);
  A.out.signs.push({ A, row, w, h, cx, y, zf, ry: o.ry || 0 });
  A.add(gBox(w + 0.08, h + 0.08, 0.05, cx, y - h / 2 - 0.04, zf + 0.01), (bg === C.white ? mat(C.silver, { roughness: 0.7 }) : mat(C.navy, { roughness: 0.6 })));
}
/* Awning over the south face: striped canvas sloping out from the wall, with a valance. */
function awning(A, cx, zf, len, y, accent) {
  const g = new THREE.BoxGeometry(len, 0.04, 0.8); g.rotateX(0.38); g.translate(cx, y - 0.15, zf + 0.37);
  A.add(g, awningMat(accent));
  A.add(gBox(len, 0.12, 0.03, cx, y - 0.42, zf + 0.74), awningMat(accent));
  for (const s of [-1, 1]) { const rod = new THREE.BoxGeometry(0.03, 0.03, 0.8); rod.rotateX(-0.45); rod.translate(cx + s * (len / 2 - 0.05), y - 0.45, zf + 0.36); A.add(rod, A.iron); }
}
function hedgeRow(A, x0, x1, z, y) {
  const g = new THREE.BoxGeometry(x1 - x0, 0.4, 0.45); g.translate((x0 + x1) / 2, (y || 0) + 0.2, z);
  A.add(g, mat(C.hedge, { roughness: 0.9 }));
}

/* ---------- filler recipes (canonical frame: x 0..w east, z 0..h south, door on z = h - A.yard) ---------- */
/* The street wall face: `sub` inside the building rows' south edge (h - yard). Lots without a yard
   keep at least 0.3 so the face, the door and the step sit on the lot, against the sidewalk. */
function faceZ(A, sub) { return A.h - A.yard - (A.yard ? sub : Math.max(sub, 0.3)); }
function recipeApartment(A) {
  const { w, h, r } = A;
  const palette = WALLS.apartment[A.lot.style] || WALLS.apartment.cream;
  const wall = mat(pick(r, palette), { roughness: 0.9 });
  const base = mat(C.plinth, { roughness: 0.9 });
  const floors = 3 + Math.floor(r() * 3), fh = 1.0, gh = 1.25;
  const x0 = 0.4, x1 = w - 0.4, z0 = 0.4, z1 = faceZ(A, 0.2), cx = w / 2;
  const top = gh + (floors - 1) * fh;
  A.add(gBox(x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, cx, 0, (z0 + z1) / 2), A.plinth);
  A.add(gBox(x1 - x0, gh, z1 - z0, cx, 0.12, (z0 + z1) / 2), base);
  A.add(gBox(x1 - x0, top - gh + 0.12, z1 - z0, cx, gh, (z0 + z1) / 2), wall);
  A.add(gBox(x1 - x0 + 0.1, 0.08, z1 - z0 + 0.1, cx, gh + 0.08, (z0 + z1) / 2), A.trim);
  windows(A, 'S', x0, z0, x1, z1, 0.12, 1, gh, { doorU: 0, bay: 1.3, w: 0.7, h: 0.8 });
  const skipBalcony = (fl, i) => fl > 0 && (i % 2 === 1);
  windows(A, 'S', x0, z0, x1, z1 + 0.001, gh + 0.12, floors - 1, fh, { bay: 1.3, w: 0.7, h: 0.65, skip: (fl, i) => skipBalcony(fl + 1, i) });
  // balconies on every second bay of the upper floors
  const n = Math.max(1, Math.floor((x1 - x0 - 0.5) / 1.3)), span = (n - 1) * 1.3;
  for (let fl = 1; fl < floors; fl++) for (let i = 1; i < n; i += 2) {
    const bx = cx - span / 2 + i * 1.3, by = gh + 0.12 + (fl - 1) * fh;
    A.add(gBox(1.1, 0.08, 0.6, bx, by, z1 + 0.3), mat(C.lightStone, { roughness: 0.85 }));
    A.add(gBox(1.1, 0.04, 0.04, bx, by + 0.5, z1 + 0.58), A.iron);
    for (let k = 0; k < 6; k++) A.add(gBox(0.025, 0.5, 0.025, bx - 0.5 + k * 0.2, by + 0.04, z1 + 0.58), A.iron);
    A.add(gBox(1.0, 0.55, 0.06, bx, by + 0.45, z1 + 0.01), A.glassMat);
    A.add(gBox(0.9, 0.5, 0.08, bx, by + 0.02, z1 + 0.02), A.trim);
  }
  windows(A, 'N', x0, z0, x1, z1, 0.12, floors, fh, { bay: 1.3, w: 0.6, h: 0.65 });
  windows(A, 'E', x0, z0, x1, z1, 0.12, floors, fh, { bay: 1.3, w: 0.55, h: 0.65 });
  windows(A, 'W', x0, z0, x1, z1, 0.12, floors, fh, { bay: 1.3, w: 0.55, h: 0.65 });
  entrance(A, cx, z1, { double: true, canopy: true, lamp: true, door: mat(pick(r, [C.navy, C.aqua, C.salmon]), { roughness: 0.6 }) });
  flatRoof(A, x0, z0, x1, z1, top + 0.12, wall, { tank: r() < 0.5, vents: 2, hatch: true });
  hedgeRow(A, x0 + 0.1, cx - 1.2, z1 + 0.35, 0);
  hedgeRow(A, cx + 1.2, x1 - 0.1, z1 + 0.35, 0);
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
function recipeRowhouse(A) {
  const { w, h, r } = A;
  const palette = WALLS.rowhouse[A.lot.style] || WALLS.rowhouse.brick;
  const units = w >= 9 ? 4 : 3;
  // without a yard the three step stoop (1.03 deep past the face) ends on the lot's south edge
  const x0 = 0.3, x1 = w - 0.3, z0 = 0.3, z1 = A.yard ? faceZ(A, 0) : faceZ(A, 1.05), uw = (x1 - x0) / units;
  const gh = 1.3, fh = 1.1, top = gh + fh + 0.12;
  const roofMat = mat(pick(r, [C.slate, C.tile, C.membrane]), { roughness: 0.8 });
  for (let u = 0; u < units; u++) {
    const ux0 = x0 + u * uw, ux1 = ux0 + uw, ucx = (ux0 + ux1) / 2;
    const wall = mat(palette[(u + Math.floor(r() * 2)) % palette.length], { roughness: 0.9 });
    const stoopSide = u % 2 ? -1 : 1;
    const doorX = ucx + stoopSide * (uw / 2 - 0.55), bayX = ucx - stoopSide * (uw / 2 - 0.7);
    A.add(gBox(uw + 0.1, 0.12, z1 - z0 + 0.2, ucx, 0, (z0 + z1) / 2), A.plinth);
    A.add(gBox(uw - 0.04, top, z1 - z0, ucx, 0.12, (z0 + z1) / 2), wall);
    // bay window on the ground floor, one upper window above it, one above the door
    A.add(gBox(1.1, 1.25, 0.4, bayX, 0.12, z1 + 0.2), wall);
    A.add(gBox(1.2, 0.08, 0.5, bayX, 1.37, z1 + 0.25), A.trim);
    A.add(gBox(0.8, 0.8, 0.05, bayX, 0.42, z1 + 0.4), A.glassMat);
    A.add(gBox(0.92, 0.92, 0.04, bayX, 0.36, z1 + 0.39), A.trim);
    for (const s of [-1, 1]) { A.add(gBox(0.05, 0.6, 0.3, bayX + s * 0.55, 0.52, z1 + 0.2), A.glassMat); }
    for (const wx of [bayX, doorX]) {
      A.add(gBox(0.72, 0.82, 0.05, wx, gh + 0.12 + 0.2, z1 + 0.02), A.trim);
      A.add(gBox(0.6, 0.7, 0.05, wx, gh + 0.12 + 0.26, z1 + 0.035), A.glassMat);
    }
    // door with a stoop of three steps and a railing
    const doorMat = mat(pick(r, [C.navy, C.aqua, C.salmon]), { roughness: 0.6 });
    A.add(gBox(1.0, 1.15, 0.06, doorX, 0.32, z1 + 0.02), A.trim);
    A.add(gBox(0.86, 1.05, 0.08, doorX, 0.32, z1 + 0.04), doorMat);
    A.add(gSphere(0.03, doorX + 0.3, 0.95, z1 + 0.1), mat(C.brass, { roughness: 0.3, metalness: 0.6 }));
    A.add(gBox(0.86, 0.22, 0.05, doorX, 1.4, z1 + 0.03), A.glassMat);
    for (let s = 0; s < 3; s++) A.add(gBox(1.1, 0.12, 0.35, doorX, 0.2 - s * 0.1, z1 + 0.25 + s * 0.3), A.plinth);
    A.add(gBox(0.03, 0.75, 0.03, doorX + 0.5, 0.2, z1 + 0.15), A.iron);
    A.add(gBox(0.03, 0.03, 0.9, doorX + 0.5, 0.9, z1 + 0.55), A.iron);
    // cornice and roof per unit, a chimney on every second unit
    A.add(gBox(uw + 0.1, 0.12, z1 - z0 + 0.4, ucx, top + 0.12, (z0 + z1) / 2), A.trim);
    A.add(gBox(uw + 0.1, 0.08, z1 - z0 + 0.2, ucx, top + 0.24, (z0 + z1) / 2), roofMat);
    A.add(gBox(uw + 0.1, 0.3, 0.12, ucx, top + 0.24, z1 + 0.04), wall);
    if (u % 2 === 0) { A.add(gBox(0.4, 0.7, 0.4, ucx, top + 0.24, z0 + 0.6), mat('#8A6F5E', { roughness: 0.95 })); A.add(gBox(0.5, 0.08, 0.5, ucx, top + 0.94, z0 + 0.6), mat('#5E4538', { roughness: 0.95 })); }
    windows(A, 'N', ux0, z0, ux1, z1, 0.12, 2, 1.2, { bay: 1.1, w: 0.55, h: 0.65 });
  }
  windows(A, 'E', x0, z0, x1, z1, 0.12, 2, 1.2, { bay: 1.1, w: 0.5, h: 0.6 });
  windows(A, 'W', x0, z0, x1, z1, 0.12, 2, 1.2, { bay: 1.1, w: 0.5, h: 0.6 });
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
function recipeShop(A) {
  const { w, h, r } = A;
  const style = A.lot.style, sign = SHOP_SIGNS[style] || SHOP_SIGNS.coffee;
  const wall = mat(WALLS.shop[style] || C.cream, { roughness: 0.9 });
  const floors = w >= 6 && r() < 0.7 ? 2 : 1, gh = 1.5, fh = 1.0, extra = floors > 1 ? 0.25 : 0;
  const x0 = 0.3, x1 = w - 0.3, z0 = 0.3, z1 = faceZ(A, 0), cx = w / 2;
  const top = gh + extra + (floors - 1) * fh + 0.12;
  const accent = pick(r, [C.salmon, C.aqua, C.navy]);
  A.add(gBox(x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, cx, 0, (z0 + z1) / 2), A.plinth);
  A.add(gBox(x1 - x0, top, z1 - z0, cx, 0.12, (z0 + z1) / 2), wall);
  // big ground windows either side of the door
  const half = (x1 - x0) / 2;
  for (const s of [-1, 1]) {
    const wx = cx + s * (half / 2 + 0.3), ww = half - 1.0;
    A.add(gBox(ww + 0.12, 1.12, 0.05, wx, 0.3, z1 + 0.02), A.trim);
    A.add(gBox(ww, 1.0, 0.05, wx, 0.36, z1 + 0.035), A.glassMat);
    A.add(gBox(ww + 0.12, 0.3, 0.1, wx, 0.12, z1 + 0.02), mat(C.slate, { roughness: 0.8 }));
  }
  entrance(A, cx, z1, { h: 1.2, door: mat(accent, { roughness: 0.6 }) });
  awning(A, cx, z1, x1 - x0 - 0.3, gh - 0.15, accent);
  signFace(A, sign.text, sign.bg, sign.fg, cx, gh + 0.22, z1, Math.min(4.2, x1 - x0 - 0.6), 0.36);
  if (floors > 1) windows(A, 'S', x0, z0, x1, z1, gh + 0.12 + extra, 1, fh, { bay: 1.2, w: 0.6, h: 0.65 });
  windows(A, 'N', x0, z0, x1, z1, 0.12, floors, floors > 1 ? 1.2 : gh, { bay: 1.2, w: 0.55, h: 0.6 });
  windows(A, 'E', x0, z0, x1, z1, 0.12, floors, floors > 1 ? 1.2 : gh, { bay: 1.2, w: 0.55, h: 0.6 });
  windows(A, 'W', x0, z0, x1, z1, 0.12, floors, floors > 1 ? 1.2 : gh, { bay: 1.2, w: 0.55, h: 0.6 });
  flatRoof(A, x0, z0, x1, z1, top + 0.12, wall, { ac: 1, vents: 1 });
  // a sandwich board or a bike by the door, by style
  if (style === 'flowers') for (let i = 0; i < 4; i++) A.add(gSphere(0.1, x0 + 0.4 + i * 0.3, 0.3, z1 + 0.5), mat(pick(r, [C.salmon, C.aqua, C.navy]), { roughness: 0.6 }));
  if (style === 'coffee' || style === 'deli') { const sb = new THREE.BoxGeometry(0.4, 0.55, 0.05); sb.rotateX(-0.25); sb.translate(cx + 1.1, 0.3, z1 + 0.6); A.add(sb, mat(C.navy, { roughness: 0.6 })); }
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
function recipeOffice(A) {
  const { w, h, r } = A;
  const wall = mat(WALLS.office[A.lot.style] || WALLS.office.stone, { roughness: 0.9 });
  const spandrel = mat(C.navy, { roughness: 0.6 });
  const floors = 4 + Math.floor(r() * 4), fh = 1.0, gh = 1.4;
  const x0 = 0.3, x1 = w - 0.3, z0 = 0.3, z1 = faceZ(A, 0), cx = w / 2;
  const top = gh + (floors - 1) * fh + 0.12;
  A.add(gBox(x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, cx, 0, (z0 + z1) / 2), A.plinth);
  A.add(gBox(x1 - x0, top, z1 - z0, cx, 0.12, (z0 + z1) / 2), wall);
  // ground floor lobby glass, glass bands above
  for (const face of ['S', 'N', 'E', 'W']) {
    const f = faceOf(face, x0, z0, x1, z1);
    if (face === 'S') {
      for (const s of [-1, 1]) A.add(faced(gBox(f.len / 2 - 1.1, 1.0, 0.05, s * (f.len / 4 + 0.35), 0.32, 0.035), f), A.glassMat);
    } else A.add(faced(gBox(f.len - 0.6, 1.0, 0.05, 0, 0.35, 0.035), f), A.glassMat);
    glassBands(A, face, x0, z0, x1, z1, gh + 0.12, floors - 1, fh, { spandrel, mullions: 1.0 });
  }
  entrance(A, cx, z1, { double: true, h: 1.1, canopy: spandrel, door: mat(C.aqua, { roughness: 0.6 }) });
  signFace(A, 'Ledger and Mint', C.navy, C.silver, cx, gh + 0.18, z1, Math.min(3.6, x1 - x0 - 0.6), 0.28);
  flatRoof(A, x0, z0, x1, z1, top + 0.12, wall, { ac: 2, vents: 2, hatch: true, parapet: 0.45 });
  A.add(gCyl(0.03, 0.03, 1.6, 6, x1 - 0.6, top + 0.12, z0 + 0.6), A.iron);
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
function recipeTower(A) {
  const { w, h, r } = A;
  const wall = mat('#DCE3E8', { roughness: 0.8 });
  const spandrel = mat(C.navy, { roughness: 0.6 });
  const floors = 8 + Math.floor(r() * 7), fh = 1.0, gh = 1.6;
  const cx = w / 2;
  // three tiers with setbacks
  const tiers = [
    { x0: 0.5, x1: w - 0.5, z0: 0.5, z1: faceZ(A, 0.4), n: Math.min(floors, 4) },
    { x0: 1.3, x1: w - 1.3, z0: 1.0, z1: faceZ(A, 1.0), n: Math.min(Math.max(0, floors - 4), 5) },
    { x0: 2.2, x1: w - 2.2, z0: 1.6, z1: faceZ(A, 1.6), n: Math.max(0, floors - 9) },
  ];
  let y = 0.12;
  A.add(gBox(tiers[0].x1 - tiers[0].x0 + 0.3, 0.12, tiers[0].z1 - tiers[0].z0 + 0.3, cx, 0, (tiers[0].z0 + tiers[0].z1) / 2), A.plinth);
  tiers.forEach((t, ti) => {
    if (t.n <= 0) return;
    const fh0 = ti === 0 ? gh : fh;
    const hgt = (ti === 0 ? gh : 0) + (t.n - (ti === 0 ? 1 : 0)) * fh;
    A.add(gBox(t.x1 - t.x0, hgt, t.z1 - t.z0, cx, y, (t.z0 + t.z1) / 2), wall);
    for (const face of ['S', 'N', 'E', 'W']) {
      if (ti === 0) {
        const f = faceOf(face, t.x0, t.z0, t.x1, t.z1);
        if (face === 'S') { for (const s of [-1, 1]) A.add(faced(gBox(f.len / 2 - 1.3, 1.25, 0.05, s * (f.len / 4 + 0.4), y + 0.2, 0.035), f), A.glassMat); }
        else A.add(faced(gBox(f.len - 0.6, 1.2, 0.05, 0, y + 0.25, 0.035), f), A.glassMat);
        glassBands(A, face, t.x0, t.z0, t.x1, t.z1, y + gh, t.n - 1, fh, { spandrel, mullions: 1.5 });
      } else glassBands(A, face, t.x0, t.z0, t.x1, t.z1, y, t.n, fh, { spandrel, mullions: 1.5 });
    }
    flatRoof(A, t.x0, t.z0, t.x1, t.z1, y + hgt, wall, { ac: ti === 2 ? 2 : 1, tank: ti === tiers.length - 1 || tiers[ti + 1].n <= 0, vents: 2, parapet: 0.4 });
    y += hgt;
  });
  entrance(A, cx, tiers[0].z1, { double: true, h: 1.3, canopy: spandrel, door: mat(C.aqua, { roughness: 0.6 }) });
  signFace(A, 'Thread tower', C.navy, C.aqua, cx, gh + 0.18, tiers[0].z1, 3.6, 0.3);
  // antenna mast with a beacon the update blinks
  A.add(gCyl(0.05, 0.08, 2.4, 8, cx, y, h / 2 - 1), A.iron);
  A.add(gSphere(0.1, cx, y + 2.45, h / 2 - 1, 8, 6), A.out.beaconMat);
  // flag on the roof corner
  A.add(gCyl(0.025, 0.025, 1.6, 6, tiers[0].x0 + 0.5, y, tiers[0].z0 + 0.5), A.iron);
  A.out.flags.push({ pos: A.world(tiers[0].x0 + 0.5, y + 1.45, tiers[0].z0 + 0.5), color: C.navy, rot: (A.lot.rot || 0) * DEG, w: 0.6, h: 0.35 });
  hedgeRow(A, tiers[0].x0 + 0.2, cx - 1.4, tiers[0].z1 + 0.45, 0);
  hedgeRow(A, cx + 1.4, tiers[0].x1 - 0.2, tiers[0].z1 + 0.45, 0);
  shadowBands(A, tiers[0].x0 - 0.15, tiers[0].z0 - 0.15, tiers[0].x1 + 0.15, tiers[0].z1 + 0.15);
}
function recipeDiner(A) {
  const { w, h } = A;
  const wall = mat(C.trim, { roughness: 0.8 });
  const chrome = mat(C.chrome, { roughness: 0.4, metalness: 0.2 });
  const x0 = 0.3, x1 = w - 0.3, z0 = 0.4, z1 = faceZ(A, 0), cx = w / 2, cz = (z0 + z1) / 2, top = 1.6;
  A.add(gBox(x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, cx, 0, cz), A.plinth);
  A.add(gBox(x1 - x0, top, z1 - z0, cx, 0.12, cz), wall);
  // chrome bands at the base and the cornice, a salmon stripe
  A.add(gBox(x1 - x0 + 0.08, 0.25, z1 - z0 + 0.08, cx, 0.12, cz), chrome);
  A.add(gBox(x1 - x0 + 0.12, 0.2, z1 - z0 + 0.12, cx, top + 0.12, cz), chrome);
  A.add(gBox(x1 - x0 + 0.1, 0.12, z1 - z0 + 0.1, cx, top - 0.1, cz), mat(C.salmon, { roughness: 0.6 }));
  // wraparound windows
  for (const face of ['S', 'E', 'W', 'N']) {
    const f = faceOf(face, x0, z0, x1, z1);
    if (face === 'S') { for (const s of [-1, 1]) A.add(faced(gBox(f.len / 2 - 1.0, 0.8, 0.05, s * (f.len / 4 + 0.3), 0.55, 0.035), f), A.glassMat); }
    else A.add(faced(gBox(f.len - 0.6, 0.8, 0.05, 0, 0.55, 0.035), f), A.glassMat);
    A.add(faced(gBox(f.len - 0.2, 0.06, 0.08, 0, 1.38, 0.03), f), chrome);
  }
  entrance(A, cx, z1, { double: true, h: 1.2, door: mat(C.aqua, { roughness: 0.6 }) });
  // rooftop neon sign on a frame: atlas text plus a salmon neon tube around it
  const sy = top + 0.4;
  for (const s of [-1, 1]) A.add(gBox(0.06, 1.1, 0.06, cx + s * 1.6, top + 0.12, cz), A.iron);
  signFace(A, 'Diner', C.ink, C.salmon, cx, sy + 0.375, cz, 3.0, 0.7, {});
  const neon = A.out.neonMat;
  A.add(gBox(3.1, 0.04, 0.05, cx, sy + 0.73, cz + 0.05), neon);
  A.add(gBox(3.1, 0.04, 0.05, cx, sy + 0.02, cz + 0.05), neon);
  A.add(gBox(0.04, 0.75, 0.05, cx - 1.55, sy + 0.02, cz + 0.05), neon);
  A.add(gBox(0.04, 0.75, 0.05, cx + 1.55, sy + 0.02, cz + 0.05), neon);
  flatRoof(A, x0, z0, x1, z1, top + 0.32, wall, { ac: 1, vents: 2, parapet: 0 });
  // a couple of outdoor tables by the door
  for (const s of [-1, 1]) {
    A.add(gCyl(0.03, 0.03, 0.6, 6, cx + s * 1.9, 0, z1 + 0.8), A.iron);
    A.add(gCyl(0.3, 0.3, 0.04, 12, cx + s * 1.9, 0.6, z1 + 0.8), mat('#FBF8F1', { roughness: 0.7 }));
  }
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
function recipeGas(A) {
  const { w, h, r } = A;
  const kioskWall = mat(C.cream, { roughness: 0.9 });
  const navy = mat(C.navy, { roughness: 0.6 }), aqua = mat(C.aqua, { roughness: 0.6 });
  const cx = w / 2;
  // kiosk against the north side
  const kx0 = w - 3.6, kx1 = w - 0.4, kz0 = 0.4, kz1 = 2.6;
  A.add(gBox(kx1 - kx0 + 0.2, 0.12, kz1 - kz0 + 0.2, (kx0 + kx1) / 2, 0, (kz0 + kz1) / 2), A.plinth);
  A.add(gBox(kx1 - kx0, 1.5, kz1 - kz0, (kx0 + kx1) / 2, 0.12, (kz0 + kz1) / 2), kioskWall);
  const fS = faceOf('S', kx0, kz0, kx1, kz1);
  A.add(faced(gBox(1.4, 1.0, 0.05, -0.8, 0.35, 0.035), fS), A.glassMat);
  entrance(A, kx1 - 0.8, kz1, { h: 1.15, door: aqua });
  signFace(A, 'Fuel and snacks', C.navy, C.aqua, (kx0 + kx1) / 2, 1.55, kz1, 2.6, 0.3);
  flatRoof(A, kx0, kz0, kx1, kz1, 1.62, kioskWall, { ac: 1, parapet: 0.25 });
  shadowBands(A, kx0 - 0.1, kz0 - 0.1, kx1 + 0.1, kz1 + 0.1);
  // canopy on four columns over the pumps
  const px0 = 0.6, px1 = w - 4.2, pz0 = 0.5, pz1 = faceZ(A, 0.2), pcx = (px0 + px1) / 2, pcz = (pz0 + pz1) / 2;
  A.add(gFlat(px1 - px0, pz1 - pz0, pcx, 0.02, pcz), mat(C.asphalt, { roughness: 0.95 }), FLAT);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) A.add(gCyl(0.1, 0.1, 2.6, 10, pcx + sx * (px1 - px0) / 2 * 0.7, 0, pcz + sz * (pz1 - pz0) / 2 * 0.6), A.trim);
  A.add(gBox(px1 - px0, 0.3, pz1 - pz0, pcx, 2.6, pcz), navy);
  A.add(gBox(px1 - px0 + 0.04, 0.08, pz1 - pz0 + 0.04, pcx, 2.72, pcz), aqua);
  for (let i = 0; i < 6; i++) A.add(gBox(0.5, 0.06, 0.5, px0 + 0.6 + (i % 3) * ((px1 - px0 - 1.2) / 2), 2.54, pz0 + 0.6 + Math.floor(i / 3) * (pz1 - pz0 - 1.2)), A.out.bulbMat);
  // two pumps on a concrete island
  A.add(gBox(2.4, 0.14, 0.9, pcx, 0, pcz), A.plinth);
  for (const s of [-1, 1]) {
    A.add(gBox(0.5, 1.2, 0.4, pcx + s * 0.8, 0.14, pcz), mat(C.silver, { roughness: 0.7 }));
    A.add(gBox(0.36, 0.3, 0.03, pcx + s * 0.8, 0.9, pcz + 0.21), mat(C.ink, { roughness: 0.5 }));
    A.add(gBox(0.5, 0.1, 0.4, pcx + s * 0.8, 1.34, pcz), navy);
    A.add(gBox(0.08, 0.5, 0.08, pcx + s * 0.8 + 0.2, 0.5, pcz - 0.2), A.iron);
  }
  // pylon sign at the south-west corner of the lot
  A.add(gBox(0.3, 3.0, 0.3, 0.6, 0, faceZ(A, 0.5)), A.iron);
  signFace(A, 'Fuel', C.navy, C.white, 0.6, 3.6, faceZ(A, 0.35), 1.1, 0.6);
  signFace(A, '3.29  3.59', C.white, C.navy, 0.6, 3.0, faceZ(A, 0.35), 1.1, 0.4);
  if (r() < 0.6) A.add(gBox(0.6, 0.9, 0.5, kx0 - 0.5, 0, kz1 + 0.6), mat(C.slate, { roughness: 0.8 }));
}
function recipeWarehouse(A) {
  const { w, h, r } = A;
  const wall = mat(pick(r, ['#BFC4C8', '#AEB4B9', '#C9C4B8']), { roughness: 0.95 });
  const x0 = 0.3, x1 = w - 0.3, z0 = 0.3, z1 = faceZ(A, 0.4), cx = w / 2, cz = (z0 + z1) / 2, top = 2.4;
  A.add(gBox(x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, cx, 0, cz), A.plinth);
  A.add(gBox(x1 - x0, top, z1 - z0, cx, 0.12, cz), wall);
  // corrugation lines on the long faces
  for (const face of ['E', 'W']) { const f = faceOf(face, x0, z0, x1, z1); for (let u = -f.len / 2 + 0.5; u < f.len / 2; u += 0.5) A.add(faced(gBox(0.04, top - 0.3, 0.03, u, 0.25, 0.015), f), mat('#9FA5AA', { roughness: 0.95 })); }
  // high windows along the sides
  windows(A, 'E', x0, z0, x1, z1, 1.3, 1, 1.2, { bay: 1.4, w: 0.8, h: 0.5 });
  windows(A, 'W', x0, z0, x1, z1, 1.3, 1, 1.2, { bay: 1.4, w: 0.8, h: 0.5 });
  if (A.lot.style === 'barrel') {
    const len = x1 - x0, rad = (z1 - z0) / 2;
    const g = new THREE.CylinderGeometry(rad, rad, len, 18, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2); g.translate(cx, top + 0.12, cz);
    A.add(g, mat(C.silver, { roughness: 0.7 }));
    for (let i = 0; i < 3; i++) A.add(gBox(0.9, 0.15, 0.6, x0 + 1.5 + i * (len - 3) / 2, top + 0.12 + rad - 0.1, cz), A.glassMat);
  } else {
    const teeth = Math.max(2, Math.round((z1 - z0) / 2)), run = (z1 - z0) / teeth;
    for (let i = 0; i < teeth; i++) {
      const g = sawtoothGeo(x1 - x0, run, 0.9); g.translate(cx, top + 0.12, z0 + i * run);
      A.add(g, mat(C.membrane, { roughness: 0.8 }));
      A.add(gBox(x1 - x0 - 0.4, 0.7, 0.05, cx, top + 0.22, z0 + i * run - 0.03), A.glassMat);
    }
  }
  // loading dock: raised platform, two roll up doors, a person door, bollards
  const dz = z1 + 0.6;
  A.add(gBox(x1 - x0 - 1.0, 0.6, 1.2, cx, 0, dz), mat(C.concrete, { roughness: 0.95 }));
  for (const s of [-1, 1]) {
    A.add(gBox(1.8, 1.5, 0.08, cx + s * 1.6, 0.6, z1 + 0.03), mat(C.slate, { roughness: 0.8 }));
    for (let k = 0; k < 5; k++) A.add(gBox(1.8, 0.02, 0.1, cx + s * 1.6, 0.6 + 0.3 * k, z1 + 0.03), mat('#4A5868', { roughness: 0.8 }));
    A.add(gBox(0.4, 0.3, 0.3, cx + s * 1.6, 0.3, dz + 0.6), mat(C.tyre, { roughness: 0.95 }));
  }
  entrance(A, x1 - 1.2, z1, { h: 1.1, door: mat(C.navy, { roughness: 0.6 }) });
  for (const bx of [x0 + 0.3, x1 - 0.3]) A.add(gCyl(0.08, 0.08, 0.7, 8, bx, 0, dz + 0.8), mat(C.brass, { roughness: 0.3, metalness: 0.6 }));
  signFace(A, 'Foundry storage', C.navy, C.silver, cx, top - 0.1, z1, 3.2, 0.36);
  // yard clutter: pallets and a dumpster
  for (let i = 0; i < 3; i++) A.add(gBox(0.9, 0.12, 0.9, x0 + 0.8, 0.12 * i, z1 + 1.9 - i * 0.02), mat(C.wood, { roughness: 0.8 }));
  A.add(gBox(1.3, 0.9, 0.8, x1 - 1.0, 0, z1 + 1.9), mat('#3F8A55', { roughness: 0.8 }));
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
function recipeChurch(A) {
  const { w, h } = A;
  const wall = mat(pick(A.r, ['#D7DBE0', '#E3E0D6', '#CDD3D9']), { roughness: 0.9 });
  const roof = mat(C.slate, { roughness: 0.8 });
  const x0 = 1.0, x1 = w - 1.0, z0 = 0.5, z1 = faceZ(A, 0.2), cx = w / 2, cz = (z0 + z1) / 2, wallH = 2.6;
  A.add(gBox(x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, cx, 0, cz), A.plinth);
  A.add(gBox(x1 - x0, wallH, z1 - z0, cx, 0.12, cz), wall);
  // gable roof with the ridge along z
  const g = gableRoofGeometry(z1 - z0 + 0.4, x1 - x0 + 0.4, 1.6); g.rotateY(Math.PI / 2); g.translate(cx, wallH + 0.12, cz);
  A.add(g, roof);
  // tall arched windows along the sides, a rose window at the front
  for (const face of ['E', 'W']) {
    const f = faceOf(face, x0, z0, x1, z1);
    const n = Math.floor((f.len - 1) / 1.2), span = (n - 1) * 1.2;
    for (let i = 0; i < n; i++) {
      const u = -span / 2 + i * 1.2;
      A.add(faced(gBox(0.5, 1.3, 0.05, u, 0.8, 0.035), f), A.glassMat);
      const arc = new THREE.CylinderGeometry(0.25, 0.25, 0.05, 10, 1, false, 0, Math.PI); arc.rotateX(Math.PI / 2); arc.rotateZ(Math.PI / 2); arc.translate(u, 2.1, 0.035);
      A.add(faced(arc, f), A.glassMat);
      A.add(faced(gBox(0.62, 1.5, 0.04, u, 0.72, 0.02), f), A.trim);
    }
  }
  const rose = new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16); rose.rotateX(Math.PI / 2); rose.translate(cx, 2.0, z1 + 0.035);
  A.add(rose, A.glassMat);
  // steeple tower on the front with a pyramid spire and a cross
  const tx = cx, tz = z1 - 0.2, tw = 1.6, th = 4.2;
  A.add(gBox(tw, th, tw, tx, 0.12, tz), wall);
  A.add(gBox(tw + 0.2, 0.15, tw + 0.2, tx, th + 0.12, tz), A.trim);
  const spire = gCone(1.1, 1.8, 4, tx, th + 0.27, tz); spin(spire, Math.PI / 4, tx, tz);
  A.add(spire, roof);
  A.add(gBox(0.06, 0.6, 0.06, tx, th + 2.05, tz), mat(C.brass, { roughness: 0.3, metalness: 0.6 }));
  A.add(gBox(0.35, 0.06, 0.06, tx, th + 2.4, tz), mat(C.brass, { roughness: 0.3, metalness: 0.6 }));
  for (let i = 0; i < 4; i++) { const f = faceOf(['S', 'N', 'E', 'W'][i], tx - tw / 2, tz - tw / 2, tx + tw / 2, tz + tw / 2); A.add(faced(gBox(0.4, 0.8, 0.05, 0, th - 1.2, 0.035), f), A.glassMat); }
  entrance(A, cx, z1 + 0.6, { double: true, h: 1.5, door: mat(C.woodDark, { roughness: 0.8 }) });
  for (let s = 0; s < 3; s++) A.add(gBox(2.0, 0.1, 0.3, cx, 0.2 - s * 0.1, z1 + 0.95 + s * 0.3), A.plinth);
  signFace(A, 'Riverside chapel', C.navy, C.silver, cx, 2.0, z1 + 0.6, 1.3, 0.26);
  hedgeRow(A, x0 - 0.2, cx - 1.3, z1 + 0.5, 0);
  hedgeRow(A, cx + 1.3, x1 + 0.2, z1 + 0.5, 0);
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
function recipeSchool(A) {
  const { w, h } = A;
  const wall = mat(C.brick, { roughness: 0.9 }), band = mat(C.cream, { roughness: 0.9 });
  const x0 = 0.5, x1 = w - 0.5, z0 = 0.4, z1 = faceZ(A, 0.6), cx = w / 2, cz = (z0 + z1) / 2, fh = 1.15, top = 2 * fh + 0.12;
  A.add(gBox(x1 - x0 + 0.2, 0.12, z1 - z0 + 0.2, cx, 0, cz), A.plinth);
  A.add(gBox(x1 - x0, top, z1 - z0, cx, 0.12, cz), wall);
  A.add(gBox(x1 - x0 + 0.06, 0.16, z1 - z0 + 0.06, cx, fh + 0.1, cz), band);
  windows(A, 'S', x0, z0, x1, z1, 0.12, 2, fh, { bay: 1.1, w: 0.75, h: 0.7, doorU: 0 });
  windows(A, 'N', x0, z0, x1, z1, 0.12, 2, fh, { bay: 1.1, w: 0.75, h: 0.7 });
  windows(A, 'E', x0, z0, x1, z1, 0.12, 2, fh, { bay: 1.1, w: 0.6, h: 0.7 });
  windows(A, 'W', x0, z0, x1, z1, 0.12, 2, fh, { bay: 1.1, w: 0.6, h: 0.7 });
  // central entrance block with columns and a pediment
  A.add(gBox(3.2, top + 0.4, 0.9, cx, 0.12, z1 + 0.3), band);
  for (const s of [-1, 1]) A.add(gCyl(0.12, 0.14, top, 10, cx + s * 1.1, 0.12, z1 + 0.9), A.trim);
  A.add(gBox(3.4, 0.2, 1.4, cx, top + 0.12, z1 + 0.5), A.trim);
  const ped = gableRoofGeometry(3.4, 1.4, 0.6); ped.translate(cx, top + 0.32, z1 + 0.5); A.add(ped, band);
  entrance(A, cx, z1 + 0.75, { double: true, h: 1.3, door: mat(C.navy, { roughness: 0.6 }) });
  signFace(A, 'Riverside school', C.navy, C.silver, cx, top - 0.05, z1 + 0.75, 2.6, 0.34);
  flatRoof(A, x0, z0, x1, z1, top + 0.12, wall, { ac: 3, vents: 3, skylight: true });
  // flagpole in the yard, the flag is a dynamic mesh
  const fx = cx + 3.2, fz = z1 + 1.4;
  A.add(gCyl(0.18, 0.22, 0.15, 10, fx, 0, fz), A.plinth);
  A.add(gCyl(0.03, 0.04, 4.0, 8, fx, 0.15, fz), A.trim);
  A.add(gSphere(0.06, fx, 4.2, fz, 8, 6), mat(C.brass, { roughness: 0.3, metalness: 0.6 }));
  A.out.flags.push({ pos: A.world(fx, 3.85, fz), color: C.aqua, rot: (A.lot.rot || 0) * DEG, w: 0.9, h: 0.5 });
  // bike rack and benches by the door
  for (let i = 0; i < 4; i++) { const t = new THREE.TorusGeometry(0.22, 0.02, 6, 12, Math.PI); t.translate(cx - 3.0 + i * 0.5, 0.05, z1 + 1.3); A.add(t, A.iron); }
  for (const s of [-1, 1]) { A.add(gBox(1.0, 0.06, 0.4, cx + s * 2.0, 0.42, z1 + 1.0), mat(C.wood, { roughness: 0.8 })); A.add(gBox(0.06, 0.42, 0.34, cx + s * 2.0 - 0.4, 0, z1 + 1.0), A.iron); A.add(gBox(0.06, 0.42, 0.34, cx + s * 2.0 + 0.4, 0, z1 + 1.0), A.iron); }
  hedgeRow(A, x0, cx - 2.0, z1 + 0.35, 0);
  hedgeRow(A, cx + 2.0, x1, z1 + 0.35, 0);
  shadowBands(A, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
}
const RECIPES = {
  apartment: recipeApartment, rowhouse: recipeRowhouse, shop: recipeShop, office: recipeOffice, tower: recipeTower,
  diner: recipeDiner, gas: recipeGas, warehouse: recipeWarehouse, church: recipeChurch, school: recipeSchool,
};
export const STYLES = Object.keys(RECIPES);

/* ---------- shared materials and the scooter ---------- */
function placeParts(B, parts, x, z, yaw, y) {
  for (const [g, m] of parts) { g.rotateY(yaw); g.translate(x, y || 0, z); B.add(g, m); }
}
function sharedMats() {
  return {
    iron: mat(C.iron, { roughness: 0.55, metalness: 0.2 }),
    panelGlass: mat(C.panelGlass, { roughness: 0.3, metalness: 0.1 }),
  };
}
/* v9: the kick scooter lives in js/vehicles.js. This wrapper keeps the version 7 export: the
   vehicles model (built facing +z) turned a quarter so the Group faces +x. */
export function buildScooter(ctx) {
  const g = new THREE.Group();
  const s = makeScooter({ color: (ctx && ctx.color) || C.aqua });
  s.group.rotation.y = Math.PI / 2;
  g.add(s.group);
  g.userData.scooter = s;
  return g;
}

/* ---------- street furniture in local space: road along +x, +z away from the road ---------- */
function lampParts(M, out) {
  return [
    [gCyl(0.10, 0.10, 0.08, 12, 0, 0, 0), M.iron], [gCyl(0.04, 0.04, 1.75, 12, 0, 0.08, 0), M.iron],
    [gBox(0.26, 0.14, 0.26, 0, 1.98, 0), M.iron], [gCone(0.12, 0.12, 12, 0, 2.12, 0), M.iron],
    [gSphere(0.11, 0, 1.95, 0, 16, 12), out.bulbMat],
  ];
}
const FURNITURE = {
  hydrant: M => [[gCyl(0.09, 0.1, 0.5, 10, 0, 0, 0), M.salmon], [gSphere(0.1, 0, 0.52, 0, 10, 8), M.salmon], [gBox(0.3, 0.07, 0.08, 0, 0.3, 0), M.salmon], [gCyl(0.12, 0.12, 0.05, 10, 0, 0, 0), M.iron]],
  mailbox: M => [[gBox(0.1, 0.55, 0.1, 0, 0, 0), M.iron], [gBox(0.45, 0.3, 0.32, 0, 0.55, 0), M.navy], [new THREE.CylinderGeometry(0.16, 0.16, 0.45, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.85, 0), M.navy], [gBox(0.2, 0.03, 0.08, 0, 0.78, 0.17), M.aqua]],
  trash: M => [[gCyl(0.2, 0.17, 0.6, 12, 0, 0, 0), M.iron], [gCyl(0.22, 0.22, 0.06, 12, 0, 0.6, 0), M.slate], [gCyl(0.2, 0.2, 0.02, 12, 0, 0.3, 0), M.aqua]],
  news: M => [[gBox(0.35, 0.55, 0.3, 0, 0.25, 0), M.aqua], [gBox(0.1, 0.25, 0.1, 0, 0, 0), M.iron], [gBox(0.28, 0.25, 0.02, 0, 0.45, 0.15), M.panelGlass]],
  bikerack: M => { const p = []; for (let i = 0; i < 3; i++) { const t = new THREE.TorusGeometry(0.24, 0.025, 6, 12, Math.PI); t.translate(-0.45 + i * 0.45, 0.05, 0); p.push([t, M.iron]); } return p; },
  bollard: M => [[gCyl(0.07, 0.08, 0.75, 8, 0, 0, 0), M.iron], [gCyl(0.07, 0.07, 0.05, 8, 0, 0.75, 0), M.silver]],
  planter: M => [[gBox(0.7, 0.45, 1.3, 0, 0, 0), M.concrete], [gBox(0.6, 0.3, 1.2, 0, 0.3, 0), M.hedge], [gSphere(0.3, 0, 0.75, 0.25, 10, 8), M.hedge], [gSphere(0.26, 0, 0.72, -0.3, 10, 8), M.leaf]],
  manhole: M => [[gDisc(0.32, 0, 0.012, 0, 16), M.manhole]],
};
function busShelterParts(M, out) {
  const p = [];
  p.push([gBox(2.3, 0.1, 1.1, 0, 2.25, 0.05), M.navy]);
  p.push([gBox(2.4, 0.04, 1.2, 0, 2.35, 0.05), M.aqua]);
  for (const sx of [-1, 1]) { p.push([gBox(0.06, 2.25, 0.06, sx * 1.1, 0, 0.5), M.iron]); p.push([gBox(0.06, 2.25, 0.06, sx * 1.1, 0, -0.45), M.iron]); }
  p.push([gBox(2.2, 1.9, 0.04, 0, 0.3, 0.52), M.panelGlass]);
  p.push([gBox(0.04, 1.9, 0.9, -1.1, 0.3, 0.05), M.panelGlass]);
  p.push([gBox(1.6, 0.06, 0.4, 0, 0.45, 0.25), M.wood]);
  for (const sx of [-0.7, 0.7]) p.push([gBox(0.05, 0.45, 0.35, sx, 0, 0.25), M.iron]);
  p.push([gBox(0.5, 0.3, 0.03, 0.8, 1.0, 0.5), M.silver]);
  p.push([gSphere(0.08, 0.6, 2.2, 0.0, 8, 6), out.bulbMat]);
  return p;
}

/* ---------- benches and boats in local space (the bench faces +z, the boats lie along x) ---------- */
function benchParts(M) {
  const back = new THREE.BoxGeometry(1.0, 0.30, 0.05); back.rotateX(-0.15); back.translate(0, 0.62, -0.16);
  return [[gBox(1.0, 0.06, 0.17, 0, 0.42, 0.095), M.wood], [gBox(1.0, 0.06, 0.17, 0, 0.42, -0.095), M.wood], [back, M.wood], [gBox(0.06, 0.42, 0.34, -0.42, 0, 0), M.iron], [gBox(0.06, 0.42, 0.34, 0.42, 0, 0), M.iron]];
}
/* A moored rowboat: a flattened hull, two thwarts, a mooring rope rail. */
function rowboatParts(M) {
  const hull = new THREE.CylinderGeometry(0.5, 0.35, 0.3, 12); hull.scale(1.9, 1, 1); hull.translate(0, 0.1, 0);
  const inner = new THREE.CylinderGeometry(0.4, 0.3, 0.22, 12); inner.scale(1.85, 1, 1); inner.translate(0, 0.2, 0);
  return [[hull, M.hull], [inner, M.wood], [gBox(0.1, 0.05, 0.8, -0.35, 0.22, 0), M.woodDark], [gBox(0.1, 0.05, 0.7, 0.4, 0.22, 0), M.woodDark], [gBox(1.0, 0.03, 0.03, 0.1, 0.4, 0.45), M.wood]];
}
/* v11: the launches and the slip boats are sim entities drawn by js/vehicles.js; only the
   boardwalks keep a decorative rowboat or two. */

/* ---------- splines: stations along the curve, crossings between roads ---------- */
const roadWidth = rd => rd.width || ROAD_KINDS[rd.kind] || 2;
/* Straight pieces of the sampled curve with the unit direction and the right-of-travel normal
   (-dy, dx), the side a walker on the right sidewalk stands on. */
function splineSegments(pts, step) {
  const s = splineSamples(pts, step || 0.5);
  const segs = [];
  for (let i = 0; i + 1 < s.length; i++) {
    const ax = s[i][0], ay = s[i][1], bx = s[i + 1][0], by = s[i + 1][1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    const dx = (bx - ax) / len, dy = (by - ay) / len;
    segs.push({ ax, ay, bx, by, len, dx, dy, nx: -dy, ny: dx });
  }
  return segs;
}
/* Points every `every` tiles along the curve from `offset`: { x, y, dx, dy, nx, ny, dist }. */
function stations(pts, every, offset) {
  const out = [];
  let cum = 0, next = offset;
  for (const s of splineSegments(pts, 0.5)) {
    while (next <= cum + s.len + 1e-9) {
      const t = next - cum;
      out.push({ x: s.ax + s.dx * t, y: s.ay + s.dy * t, dx: s.dx, dy: s.dy, nx: s.nx, ny: s.ny, dist: next });
      next += every;
    }
    cum += s.len;
  }
  return out;
}
/* Crossings and T junctions between the sampled curves of roads wider than one tile: a piece of
   one road meeting a piece of the other within the other's half width plus one, at an angle (near
   parallel pieces are the same road's neighbour, not a crossing). One record per three tiles. */
function roadIntersections(roads) {
  const out = [];
  const near = (x, y) => out.find(p => Math.hypot(p.x - x, p.y - y) < 3);
  const segs = roads.map(r => splineSegments(r.pts, 1.0));
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    const A = roads[i], Bc = roads[j], hwA = roadWidth(A) / 2, hwB = roadWidth(Bc) / 2;
    const extS = hwB + 1, extT = hwA + 1;
    for (const s of segs[i]) for (const t of segs[j]) {
      if (Math.abs(s.ax - t.ax) > 8 || Math.abs(s.ay - t.ay) > 8) continue;
      const den = s.dx * t.dy - s.dy * t.dx;
      if (Math.abs(den) < 0.15) continue;
      const wx = t.ax - s.ax, wy = t.ay - s.ay;
      const u = (wx * t.dy - wy * t.dx) / den;   // along s
      const v = (wx * s.dy - wy * s.dx) / den;   // along t
      if (u < -extS || u > s.len + extS || v < -extT || v > t.len + extT) continue;
      const x = s.ax + s.dx * u, y = s.ay + s.dy * u;
      if (near(x, y)) continue;
      out.push({ x, y, A, B: Bc, hwA, hwB, dA: [s.dx, s.dy], nA: [s.nx, s.ny], dB: [t.dx, t.dy], nB: [t.nx, t.ny], avenue: A.kind === 'avenue' || Bc.kind === 'avenue' });
    }
  }
  return out;
}

/* ---------- retaining walls: the terrain's list, or edges derived from the lot plateaus ---------- */
const ptOf = p => Array.isArray(p) ? { x: p[0], y: p[1] } : (p && Number.isFinite(p.x)) ? { x: p.x, y: p.y } : null;
/* Accepts a terrain wall record in any of the shapes terrain v2 may use: { a, b } or { from, to }
   points (arrays or { x, y }), { x0, y0, x1, y1 }, or { pts } polylines; the heights from
   top/bottom, high/low, or base plus height/drop; missing heights are read off the ground.
   Terrain v2's own shape is read explicitly: `top` is the lot plateau and `drop` is signed
   (positive with side 'above', the lot standing over the surround, so the wall runs from the
   plateau down; negative with side 'below', the surround standing higher, so the wall rises
   from the plateau up to the outside ground). The visible height is the run's maxDrop when it
   is given (the mean drop would leave the wall short of the step's deepest point). The record's
   outward normal is kept so the wall body stands just outside the edge. */
function normalizeWalls(list) {
  const out = [];
  const heights = w => {
    let top = Number.isFinite(w.top) ? w.top : Number.isFinite(w.high) ? w.high : null;
    let bottom = Number.isFinite(w.bottom) ? w.bottom : Number.isFinite(w.low) ? w.low : null;
    const drop = Number.isFinite(w.maxDrop) && Math.abs(w.maxDrop) >= Math.abs(Number.isFinite(w.drop) ? w.drop : 0) ? w.maxDrop : (Number.isFinite(w.drop) ? w.drop : null);
    const span = Number.isFinite(w.height) ? w.height : drop !== null ? drop : Number.isFinite(w.h) ? w.h : null;
    const below = w.side === 'below' || (w.side !== 'above' && drop !== null && drop < 0);
    if (top === null && bottom !== null && span !== null) top = bottom + Math.abs(span);
    if (bottom === null && top !== null && span !== null) {
      if (below) { bottom = top; top = bottom + Math.abs(span); } else bottom = top - Math.abs(span);
    }
    if (top === null && bottom === null && Number.isFinite(w.base) && span !== null) { top = w.base + Math.max(0, span); bottom = w.base + Math.min(0, span); }
    return { top, bottom };
  };
  for (const w of list || []) {
    if (!w) continue;
    const hh = heights(w);
    let pts = null;
    if (Array.isArray(w.pts) && w.pts.length > 1) pts = w.pts.map(ptOf);
    else if (w.a && w.b) pts = [ptOf(w.a), ptOf(w.b)];
    else if (w.from && w.to) pts = [ptOf(w.from), ptOf(w.to)];
    else if ([w.x0, w.y0, w.x1, w.y1].every(Number.isFinite)) pts = [{ x: w.x0, y: w.y0 }, { x: w.x1, y: w.y1 }];
    else if (Array.isArray(w) && w.length === 2) pts = [ptOf(w[0]), ptOf(w[1])];
    if (!pts || pts.some(p => !p)) continue;
    const span = Number.isFinite(w.height) ? w.height : Number.isFinite(w.drop) ? w.drop : Number.isFinite(w.h) ? w.h : null;
    const normal = Array.isArray(w.normal) && w.normal.length === 2 && w.normal.every(Number.isFinite) ? [w.normal[0], w.normal[1]] : null;
    for (let i = 0; i + 1 < pts.length; i++) out.push({ a: pts[i], b: pts[i + 1], top: hh.top, bottom: hh.bottom, span, lot: w.lot || w.id || null, normal, side: w.side || null });
  }
  return out;
}
/* Walls along the lot footprints where the plateau is more than `step` above or below the ground
   just outside the edge (docs/CONTRACT_V10.md "Terrain v2": 1.2). The corners run clockwise, so
   the outward normal of an edge a to b is (dy, -dx). */
function deriveWalls(lots, plateauOf, hAt, step) {
  const out = [];
  for (const lot of lots) {
    if (lot.kind === 'pond') continue;
    const r = lotWorldRect(lot), plateau = plateauOf(lot);
    for (let e = 0; e < 4; e++) {
      const a = r.corners[e], b = r.corners[(e + 1) % 4];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1) continue;
      const dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L, nx = dy, ny = -dx;
      let run = null;
      const flush = (end) => {
        if (!run) return;
        const s0 = run.s0 - 0.5, s1 = Math.min(L, end + 0.5), ho = run.sum / run.n;
        out.push({ a: { x: a[0] + dx * s0, y: a[1] + dy * s0 }, b: { x: a[0] + dx * s1, y: a[1] + dy * s1 }, top: Math.max(plateau, ho), bottom: Math.min(plateau, ho), lot: lot.id, normal: [nx, ny], side: plateau > ho ? 'above' : 'below' });
        run = null;
      };
      let last = 0;
      for (let s = 0.5; s <= L; s += 1) {
        const ox = a[0] + dx * s + nx * 0.8, oy = a[1] + dy * s + ny * 0.8;
        const ho = hAt(ox, oy);
        if (Math.abs(plateau - ho) > step) { if (!run) run = { s0: s, sum: 0, n: 0 }; run.sum += ho; run.n++; }
        else flush(last);
        last = s;
      }
      flush(last);
    }
  }
  return out;
}

/* ---------- the city ---------- */
export function buildCity(ctx) {
  ctx = ctx || {};
  const plan = ctx.plan || DEFAULT_PLAN;
  const state = ctx.state || {};
  const terrain = ctx.terrain || null;
  const tiles = makeTiles(ctx, plan);
  const { at, R, isSidewalk, isRoad, isWater, isGrass, isDeck } = tiles;
  const cols = plan.cols, rows = plan.rows;
  const group = new THREE.Group();
  group.name = 'city';
  const B = new Buckets();
  const atlas = new SignAtlas();
  // v8: the terrain height under a world point (flat 0 without a renderer height function)
  const rawH = typeof ctx.heightAt === 'function' ? ctx.heightAt : (terrain && typeof terrain.heightAt === 'function' ? terrain.heightAt : null);
  const hAt = rawH ? (x, z) => { const y = rawH(x, z); return Number.isFinite(y) ? y : 0; } : () => 0;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const safeTile = (x, y) => x >= 1 && y >= 1 && x <= cols - 2 && y <= rows - 2;
  const key = (x, y) => x + ',' + y;
  // the water surface: a function or a number from the renderer, else today's plane at 0.04
  const waterY = typeof ctx.waterLevel === 'function' ? ctx.waterLevel : () => (Number.isFinite(ctx.waterLevel) ? ctx.waterLevel : 0.04);
  // the plateau of a lot: the terrain's record when it has one, else the ground at the lot center
  const plateauOf = lot => {
    if (terrain && typeof terrain.lotHeight === 'function') { const v = terrain.lotHeight(lot); if (Number.isFinite(v)) return v; }
    const c = lotCenter(lot);
    return hAt(c.x, c.y);
  };
  const placements = [];
  const counts = { buildings: 0, liftedLots: 0, skirts: 0, cars: 0, trees: 0, boats: 0, furniture: 0, benches: 0, lamps: 0, shelters: 0, manholes: 0, bollards: 0, trafficPoles: 0, streetSigns: 0, racks: 0, boardwalks: 0, walls: 0, parapets: 0, parapetGaps: 0, stairs: 0, marina: 0, signs: 0, docks: 0, deckDocks: 0, bankDocks: 0, kickers: 0, kiosk: 0, weirs: 0 };
  /* The ribbon surface above the terrain under a point (the roads module's surfaceLiftAt when
     the renderer passes it as ctx.surfaceLift, else the roads.js constants by raster tile; a
     stub mouth tile is at road height, the sidewalk slab drops flush there). */
  const stubMouths = new Set();
  for (const rec of R.lots || []) if (rec.stubMouth) stubMouths.add(key(rec.stubMouth.x, rec.stubMouth.y));
  const surfLift = typeof ctx.surfaceLift === 'function'
    ? (x, z) => { const v = ctx.surfaceLift(x, z); return Number.isFinite(v) ? v : 0; }
    : (x, z) => { const tx = Math.floor(x), tz = Math.floor(z); if (!inMap(tx, tz)) return 0; if (isSidewalk(tx, tz)) return stubMouths.has(key(tx, tz)) ? ROAD_LIFT : SIDEWALK_LIFT; const m = at(tx, tz); return m === MARK.ROAD || m === MARK.BRIDGE ? ROAD_LIFT : 0; };
  const out = {
    glass: [], signs: [], flags: [], heightAt: hAt, plateauOf, placements, lotRecords: [], counts, plan,
    shadowMat: shadowBandMat(),
    bulbMat: new THREE.MeshStandardMaterial({ color: new THREE.Color(C.bulb), roughness: 0.35, emissive: new THREE.Color(C.bulbGlow), emissiveIntensity: 0.08 }),
    poolMat: poolMaterial(),
    neonMat: new THREE.MeshStandardMaterial({ color: new THREE.Color(C.salmon), roughness: 0.5, emissive: new THREE.Color(C.salmon), emissiveIntensity: 1.2 }),
    beaconMat: new THREE.MeshStandardMaterial({ color: new THREE.Color('#FF4A3D'), roughness: 0.5, emissive: new THREE.Color('#FF4A3D'), emissiveIntensity: 0.6 }),
  };
  out.bulbMat.userData.envMapIntensity = 0.6; out.neonMat.userData.envMapIntensity = 0.25; out.beaconMat.userData.envMapIntensity = 0.25;
  const M = Object.assign(sharedMats(), {
    salmon: mat(C.salmon, { roughness: 0.6 }), navy: mat(C.navy, { roughness: 0.6 }), aqua: mat(C.aqua, { roughness: 0.6 }), silver: mat(C.silver, { roughness: 0.7 }),
    slate: mat(C.slate, { roughness: 0.8 }), concrete: mat(C.concrete, { roughness: 0.95 }), hedge: mat(C.hedge, { roughness: 0.9 }), leaf: mat(C.leaf, { roughness: 0.9 }),
    wood: mat(C.wood, { roughness: 0.8 }), woodDark: mat(C.woodDark, { roughness: 0.8 }), stone: mat(C.stone, { roughness: 0.85 }), rock: mat(C.rock, { roughness: 0.95 }),
    rockDark: mat(C.rockDark, { roughness: 0.95 }), manhole: mat('#4A4D52', { roughness: 0.9 }), hull: mat(C.hull, { roughness: 0.9 }), plinth: mat(C.plinth, { roughness: 0.9 }),
    trim: mat(C.trim, { roughness: 0.8 }), lightStone: mat(C.lightStone, { roughness: 0.85 }), wall: mat('#A9B0B5', { roughness: 0.95 }), cap: mat('#C4CBD0', { roughness: 0.9 }),
    // v11: the weir tongues and foam, the kiosk's coin
    white: mat(C.white, { roughness: 0.35 }), foam: mat(C.white, { roughness: 0.6, opacity: 0.85 }), brass: mat(C.brass, { roughness: 0.4, metalness: 0.35 }), rope: mat(C.sand, { roughness: 0.95 }),
  });
  const used = new Set();
  const claim = (x, y) => { const k = key(x, y); if (used.has(k)) return false; used.add(k); return true; };
  const lampPositions = [];
  /* Every free standing part stands on the terrain at its base plus the ribbon lift there (or at
     an explicit y for decks and boats); the anchor is recorded for the headless placement check. */
  const put = (parts, x, z, yaw, kind, dy, yExplicit) => {
    const y = (Number.isFinite(yExplicit) ? yExplicit : hAt(x, z) + surfLift(x, z)) + (dy || 0);
    placeParts(B, parts, x, z, yaw, y);
    placements.push({ x, z, y, kind: kind || 'part' });
    return y;
  };
  const lampAt = (x, z, yaw, y) => { const ly = put(lampParts(M, out), x, z, yaw || 0, 'lamp', 0, y); lampPositions.push({ x, y: z, h: ly }); counts.lamps++; return ly; };
  const benchAt = (x, z, fx, fz, y) => { put(benchParts(M), x, z, Math.atan2(fx, fz), 'bench', 0, y); counts.benches++; };
  /* A text board on the atlas facing the unit direction (fx, fz) at a world point. */
  const boardAt = (text, bg, fg, x, y, z, fx, fz, w, h) => {
    const row = atlas.add(text, bg, fg, w / h);
    const ry = Math.atan2(fx, fz);
    out.signs.push({ world: true, row, w, h, x: x + fx * 0.03, y, z: z + fz * 0.03, ry });
    const plate = gBox(w + 0.08, h + 0.08, 0.05, 0, -h / 2 - 0.04, 0); plate.rotateY(ry); plate.translate(x, y, z);
    B.add(plate, bg === C.white ? M.silver : M.navy);
    counts.signs++;
  };
  const yawFor = (dx, dy, side) => Math.atan2(-dy, dx) + (side < 0 ? Math.PI : 0);
  const tileOk = (x, y, test) => safeTile(x, y) && test(x, y);

  /* 1. Filler buildings on their lots at any angle, each on its plateau. */
  const lots = plan.lots || [];
  for (const lot of lots) {
    const fn = RECIPES[lot.kind];
    if (!fn) continue;
    const A = lotContext(B, lot, atlas, out, { glass: true });
    fn(A); counts.buildings++;
  }

  /* 2. Street furniture along the spline sidewalks. */
  const roads = (plan.roads || []).filter(rd => rd.pts && rd.pts.length > 1);
  const wideRoads = roads.filter(rd => roadWidth(rd) > 1);
  const crossings = roadIntersections(wideRoads);
  /* The road ribbons as lines (the stairs excepted): nearRoad(x, z, margin, maxDh) is true where
     a point lies within the paving (or the sidewalk) edge plus margin of any spline, at a road
     point no more than maxDh higher or lower (default any height; the bluff parapet passes a
     limit so the riverside walk five units below it does not count); the parapet and the
     entrance sign keep off them. */
  const stairIds = new Set((plan.stairs || []).map(s => s.id));
  const roadLines = roads.filter(rd => !stairIds.has(rd.id)).map(rd => {
    const segs = splineSegments(rd.pts, 0.5), hw = roadWidth(rd) / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of segs) { x0 = Math.min(x0, s.ax, s.bx); x1 = Math.max(x1, s.ax, s.bx); y0 = Math.min(y0, s.ay, s.by); y1 = Math.max(y1, s.ay, s.by); }
    return { id: rd.id, segs, clear: hw + (rd.sidewalks && hw >= 1 ? SIDEWALK_EDGE : 0), x0, y0, x1, y1 };
  });
  const nearRoad = (x, z, margin, maxDh) => {
    const h0 = Number.isFinite(maxDh) ? hAt(x, z) : null;
    for (const rl of roadLines) {
      const need = rl.clear + (margin || 0);
      if (x < rl.x0 - need || x > rl.x1 + need || z < rl.y0 - need || z > rl.y1 + need) continue;
      for (const s of rl.segs) {
        let t = ((x - s.ax) * s.dx + (z - s.ay) * s.dy); t = Math.max(0, Math.min(s.len, t));
        const qx = s.ax + s.dx * t, qz = s.ay + s.dy * t;
        if (Math.hypot(x - qx, z - qz) >= need) continue;
        if (h0 === null || Math.abs(hAt(qx, qz) - h0) <= maxDh) return true;
      }
    }
    return false;
  };
  const RIBBON_MARKS = new Set([MARK.ROAD, MARK.SIDEWALK, MARK.BRIDGE, MARK.PATH, MARK.CARTPATH]);
  const nearCrossing = (x, y, d) => crossings.some(c => Math.abs(c.x - x) < d && Math.abs(c.y - y) < d);
  const furnitureKinds = ['hydrant', 'trash', 'mailbox', 'news', 'bikerack', 'trash', 'hydrant'];
  // traffic lights on the avenue crossings and the road name signs first so they own the corners
  const lensGeos = [[], [], [], [], [], []];   // phase (0 avenue axis, 1 cross axis) by color (red, amber, green)
  for (const c of crossings) {
    let signDone = false;
    for (const sA of [1, -1]) for (const sB of [1, -1]) {
      const px = c.x + c.nA[0] * sA * (c.hwA + 0.5) + c.nB[0] * sB * (c.hwB + 0.5);
      const py = c.y + c.nA[1] * sA * (c.hwA + 0.5) + c.nB[1] * sB * (c.hwB + 0.5);
      const tx = Math.floor(px), ty = Math.floor(py);
      if (!tileOk(tx, ty, isSidewalk)) continue;
      const cx = px - c.nA[0] * sA * 0.3 - c.nB[0] * sB * 0.3, cz = py - c.nA[1] * sA * 0.3 - c.nB[1] * sB * 0.3;
      if (c.avenue) {
        if (!claim(tx, ty)) continue;
        // pole with two heads: one seen by traffic on road A, one by traffic on road B
        const hy = hAt(cx, cz) + surfLift(cx, cz);
        placements.push({ x: cx, z: cz, y: hy, kind: 'traffic' });
        B.add(gCyl(0.09, 0.09, 0.06, 10, cx, hy, cz), M.iron);
        B.add(gCyl(0.05, 0.05, 2.9, 10, cx, hy + 0.06, cz), M.iron); counts.trafficPoles++;
        const heads = [[c.nB[0] * sB, c.nB[1] * sB, c.A.kind === 'avenue' ? 0 : 1], [c.nA[0] * sA, c.nA[1] * sA, c.B.kind === 'avenue' ? 0 : 1]];
        for (const [fx, fz, phase] of heads) {
          const yaw = Math.atan2(fx, fz);
          const head = gBox(0.28, 0.78, 0.26, 0, 2.1, 0.2); head.rotateY(yaw); head.translate(cx, hy, cz); B.add(head, M.iron);
          const visor = gBox(0.3, 0.04, 0.12, 0, 2.86, 0.38); visor.rotateY(yaw); visor.translate(cx, hy, cz); B.add(visor, M.iron);
          for (let k = 0; k < 3; k++) {
            const lens = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10); lens.rotateX(Math.PI / 2); lens.translate(0, 2.74 - k * 0.24, 0.34); lens.rotateY(yaw); lens.translate(cx, hy, cz);
            lensGeos[phase * 3 + k].push(normalize(lens));
          }
        }
      }
      if (!signDone) { signDone = true; if (!c.avenue) claim(tx, ty); nameSign(c, cx, cz); }
    }
    // a crossing of lanes without sidewalks: the sign stands on the grass corner instead
    if (!signDone) for (const [sA, sB] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const px = c.x + c.nA[0] * sA * (c.hwA + 0.6) + c.nB[0] * sB * (c.hwB + 0.6);
      const py = c.y + c.nA[1] * sA * (c.hwA + 0.6) + c.nB[1] * sB * (c.hwB + 0.6);
      const tx = Math.floor(px), ty = Math.floor(py);
      if (!tileOk(tx, ty, isGrass) || !claim(tx, ty)) continue;
      signDone = true; nameSign(c, px, py); break;
    }
  }
  /* The road name blades on a post at a crossing corner. */
  function nameSign(c, sx, sz) {
    const sy = hAt(sx, sz) + surfLift(sx, sz);
    placements.push({ x: sx, z: sz, y: sy, kind: 'streetsign' });
    B.add(gCyl(0.03, 0.03, 2.5, 8, sx, sy, sz), M.iron); counts.streetSigns++;
    const blades = [[c.A, c.dA, 2.25], [c.B, c.dB, 2.05]];
    for (const [rd, d, y] of blades) {
      const name = rd.name || rd.id || 'Street';
      const row = atlas.add(name, C.signGreen, C.white, 4.5);
      out.signs.push({ world: true, row, w: 0.9, h: 0.2, x: sx + d[0] * 0.5, y: sy + y, z: sz + d[1] * 0.5, ry: Math.atan2(d[0], d[1]) + Math.PI / 2 });
    }
  }
  // along every road: lamps every 8 tiles on alternating sides, other furniture between them, bus
  // shelters on the avenue, manholes down the centerline; lanes and the switchback get verge lamps;
  // paths get park lamps and benches (facing the water where the path follows a shore)
  for (const rd of roads) {
    const hw = roadWidth(rd) / 2;
    const rr = seeded('road:' + rd.id);
    const st = stations(rd.pts, 1, 0.5);
    if (rd.sidewalks) {
      let shelterSide = 1;
      for (const p of st) {
        const k = Math.floor(p.dist);
        const phase = k % 8, lampSide = Math.floor(k / 8) % 2 ? 1 : -1;
        let kind = null, side = 0;
        if (phase === 4) { kind = 'lamp'; side = lampSide; }
        else if (phase === 0 && k > 0) { kind = pick(rr, furnitureKinds); side = -lampSide; }
        else if (rd.kind === 'avenue' && phase === 2 && Math.floor(k / 16) % 2 === 0 && k > 8) { kind = 'shelter'; side = shelterSide; shelterSide = -shelterSide; }
        if (!kind) continue;
        // the sidewalk center is hw + 0.5 from the centerline; the piece stands there, pulled
        // toward the curb by `curb` (a shelter sits back against the lots)
        const ox = p.x + p.nx * side * (hw + 0.5), oy = p.y + p.ny * side * (hw + 0.5);
        const tx = Math.floor(ox), ty = Math.floor(oy);
        if (!tileOk(tx, ty, isSidewalk) || nearCrossing(ox, oy, kind === 'shelter' ? 4 : 1.5) || !claim(tx, ty)) continue;
        const yaw = yawFor(p.dx, p.dy, side);
        const curb = kind === 'lamp' ? 0.3 : kind === 'shelter' ? -0.05 : kind === 'bikerack' ? -0.2 : 0.28;
        const wx = p.x + p.nx * side * (hw + 0.5 - curb), wz = p.y + p.ny * side * (hw + 0.5 - curb);
        if (kind === 'lamp') lampAt(wx, wz, yaw);
        else if (kind === 'shelter') { put(busShelterParts(M, out), wx, wz, yaw, 'shelter'); counts.shelters++; }
        else { put(FURNITURE[kind](M), wx, wz, yaw + (rr() - 0.5) * 0.2, kind); counts.furniture++; }
      }
      for (const p of st) {
        const k = Math.floor(p.dist);
        if (k % 9 !== 3) continue;
        const mx = p.x + p.nx * 0.6, mz = p.y + p.ny * 0.6;
        if (inMap(Math.floor(mx), Math.floor(mz)) && isRoad(Math.floor(mx), Math.floor(mz)) && !nearCrossing(mx, mz, 3)) {
          put(FURNITURE.manhole(M), mx, mz, 0, 'manhole', 0.015); counts.manholes++;   // 0.015 over the ribbon lift: on the asphalt
        }
      }
    } else if (rd.kind === 'lane' || rd.kind === 'switchback') {
      for (const p of st) {
        const k = Math.floor(p.dist);
        if (k % 12 !== 6) continue;
        const side = Math.floor(k / 12) % 2 ? -1 : 1;
        const ox = p.x + p.nx * side * (hw + 0.8), oy = p.y + p.ny * side * (hw + 0.8);
        const tx = Math.floor(ox), ty = Math.floor(oy);
        if (!tileOk(tx, ty, isGrass) || !claim(tx, ty)) continue;
        lampAt(ox, oy, yawFor(p.dx, p.dy, side));
      }
    } else if (rd.kind === 'path') {
      // which side of the path is the water, station by station (the lakeshore path, the park path
      // by the pond, the riverside walk under the bluff wall)
      const waterSide = p => {
        for (const side of [1, -1]) for (let d = 1; d <= 3; d++) {
          const x = Math.floor(p.x + p.nx * side * d), y = Math.floor(p.y + p.ny * side * d);
          if (inMap(x, y) && isWater(x, y)) return side;
        }
        return 0;
      };
      for (const p of st) {
        const k = Math.floor(p.dist);
        const ws = waterSide(p);
        let kind = null, side = 0, face = null;
        if (k % 12 === 6) { kind = 'lamp'; side = ws ? -ws : (Math.floor(k / 12) % 2 ? -1 : 1); }
        else if (k % 9 === 2) {
          if (ws) { kind = 'bench'; side = ws; face = [p.nx * ws, p.ny * ws]; }
          else if (k % 18 === 2) { kind = 'bench'; side = Math.floor(k / 18) % 2 ? -1 : 1; face = [-p.nx * side, -p.ny * side]; }
        }
        else if (k % 21 === 13) { kind = 'trash'; side = ws ? -ws : 1; }
        if (!kind) continue;
        const off = hw + (kind === 'lamp' ? 0.7 : 0.9);
        const ox = p.x + p.nx * side * off, oy = p.y + p.ny * side * off;
        const tx = Math.floor(ox), ty = Math.floor(oy);
        if (!tileOk(tx, ty, isGrass) || !claim(tx, ty)) continue;
        if (kind === 'lamp') lampAt(ox, oy, yawFor(p.dx, p.dy, side));
        else if (kind === 'bench') benchAt(ox, oy, face[0], face[1]);
        else { put(FURNITURE.trash(M), ox, oy, yawFor(p.dx, p.dy, side), 'trash'); counts.furniture++; }
      }
    }
  }
  // bollards along the plaza edges where they meet a road or sidewalk
  if (plan.plaza && plan.plaza.pts) {
    const pts = plan.plaza.pts;
    const inPlaza = (x, y) => pointInPoly(x + 0.5, y + 0.5, pts);
    let n = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!inPlaza(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = at(x + dx, y + dy);
        if (v !== MARK.SIDEWALK && v !== MARK.ROAD) continue;
        if (inPlaza(x + dx, y + dy)) continue;
        if ((n++) % 3 !== 0) continue;
        put(FURNITURE.bollard(M), x + 0.5 + dx * 0.38, y + 0.5 + dy * 0.38, 0, 'bollard'); counts.bollards++;
      }
    }
  }

  /* 3. Parking lots: paved and empty (v9: no parked cars). Each keeps its plateau anchor and a lamp. */
  for (const lot of lots) {
    if (lot.kind !== 'parking') continue;
    const A = lotContext(B, lot, atlas, out, null);   // records the lot's plateau anchor
    const c = A.world(lot.w / 2, 0, lot.h / 2);
    lampAt(c.x, c.z, (lot.rot || 0) * DEG, c.y);
  }

  /* 4. Boardwalks: a one tile deck along the plan's stretch (either axis) on the bank, the
     railing on the water side, lamps, benches facing the water, bollards at the ends and a few
     moored rowboats off the railing. The deck boards follow the bank tile by tile. */
  const boardRng = seeded('boardwalk');
  const stretches = (plan.boardwalks || []).filter(b => b.pts && b.pts.length > 1);
  const boardwalkKeys = [];
  for (const bw of stretches) {
    const [x0, y0] = bw.pts[0], [x1, y1] = bw.pts[bw.pts.length - 1];
    const axis = bw.axis || (y0 === y1 ? 'x' : 'y');
    const lo = axis === 'x' ? Math.min(x0, x1) : Math.min(y0, y1), hi = axis === 'x' ? Math.max(x0, x1) : Math.max(y0, y1);
    const fixed = axis === 'x' ? y0 : x0, c = fixed + 0.5;
    // world point from the along coordinate and the across offset from the deck center
    const P = (u, across) => axis === 'x' ? { x: u, z: c + across } : { x: c + across, z: u };
    const tileAt = (u, across) => axis === 'x' ? { x: Math.floor(u), y: Math.floor(c + across) } : { x: Math.floor(c + across), y: Math.floor(u) };
    // the water side: where the water tiles are, one to three tiles across the deck
    let score = 0;
    for (let u = lo; u <= hi; u++) for (let d = 1; d <= 3; d++) { const tp = tileAt(u + 0.5, d), tm = tileAt(u + 0.5, -d); if (inMap(tp.x, tp.y) && isWater(tp.x, tp.y)) score++; if (inMap(tm.x, tm.y) && isWater(tm.x, tm.y)) score--; }
    const ws = score >= 0 ? 1 : -1;
    counts.boardwalks++;
    for (let u = lo; u <= hi; u++) {
      const p = P(u + 0.5, 0), hy = hAt(p.x, p.z);
      B.add(gBox(1.0, 0.08, 1.0, p.x, hy, p.z), M.wood);
      for (const s of [0, 0.5]) { const q = P(u + s, 0); B.add(axis === 'x' ? gBox(0.02, 0.012, 1.0, q.x, hy + 0.08, q.z) : gBox(1.0, 0.012, 0.02, q.x, hy + 0.08, q.z), M.woodDark); }
      placements.push({ x: p.x, z: p.z, y: hy, kind: 'boardwalk' });
    }
    // railing on the water side: posts at their own height, rails sloping between them
    const railOff = ws * 0.45;
    const posts = [];
    for (let u = lo; u <= hi + 1; u += 2) posts.push(u);
    for (const u of posts) { const p = P(u, railOff); B.add(gBox(0.08, 0.95, 0.08, p.x, hAt(p.x, p.z) + 0.08, p.z), M.woodDark); }
    for (let i = 0; i + 1 < posts.length; i++) {
      const pa = P(posts[i], railOff), pb = P(posts[i + 1], railOff), ha = hAt(pa.x, pa.z), hb = hAt(pb.x, pb.z);
      const mid = P((posts[i] + posts[i + 1]) / 2, railOff), hm = (ha + hb) / 2, L = posts[i + 1] - posts[i];
      const tilt = Math.atan2(hb - ha, L);
      for (const [hgt, thick, m] of [[1.03, 0.06, M.wood], [0.57, 0.04, M.woodDark]]) {
        const g = new THREE.BoxGeometry(L + 0.1, thick, thick);
        if (axis === 'x') g.rotateZ(tilt); else { g.rotateY(Math.PI / 2); g.rotateX(-tilt); }
        g.translate(mid.x, hm + hgt, mid.z); B.add(g, m);
      }
    }
    // lamps every 8 tiles at the railing, benches between them facing the water
    for (let u = lo + 4; u < hi; u += 8) { const p = P(u + 0.5, railOff - ws * 0.3); lampAt(p.x, p.z, 0); }
    for (let u = lo + 8; u < hi - 2; u += 9) {
      const p = P(u + 0.5 + Math.floor(boardRng() * 2), -ws * 0.2);
      benchAt(p.x, p.z, axis === 'x' ? 0 : ws, axis === 'x' ? ws : 0);
    }
    // bollards at both ends of the deck
    for (const u of [lo + 0.3, hi + 0.7]) for (const a of [-0.25, 0.25]) { const p = P(u, a); put(FURNITURE.bollard(M), p.x, p.z, 0, 'bollard'); }
    // moored rowboats on the first water row past the bank
    for (let u = lo + 6; u < hi - 2; u += 11) {
      const p = P(u + 0.5, ws * 2.1), t = tileAt(u + 0.5, ws * 2.1);
      if (inMap(t.x, t.y) && isWater(t.x, t.y)) { put(rowboatParts(M), p.x, p.z, (axis === 'x' ? 0 : Math.PI / 2) + (boardRng() - 0.5) * 0.4, 'boat', 0.02, waterY(p.x, p.z)); counts.boats++; }
    }
    const mid = P((lo + hi + 1) / 2, 0); boardwalkKeys.push([mid.x, mid.z]);
  }

  /* 5. The marina: a plank dock from the shore tile over the water the way plan.marina faces,
     posts to the bed, finger slips alternating sides with a moored boat beside each, cleats, a
     lamp at the end, a life ring and the name board at the shore end. */
  let marinaRec = null;
  if (plan.marina && Number.isFinite(plan.marina.x) && Number.isFinite(plan.marina.y)) {
    const mr = plan.marina, dir = rotVec(mr.rot || 0, 0, -1), perp = { x: -dir.y, y: dir.x };
    let deck = (R && R.marina && R.marina.deck) ? R.marina.deck.map(t => ({ x: t.x, y: t.y })) : null;
    if (!deck) { deck = []; for (let k = 1; k <= 5; k++) { const x = mr.x + dir.x * k, y = mr.y + dir.y * k; if (inMap(x, y) && isWater(x, y)) deck.push({ x, y }); } }
    const n = Math.max(2, deck.length), slips = Math.max(1, Math.min(mr.slips || 4, n));
    const sx = mr.x + 0.5, sz = mr.y + 0.5;
    const at2 = (a, b) => ({ x: sx + dir.x * a + perp.x * b, z: sz + dir.y * a + perp.y * b });
    // the deck height: the water under the first deck tile (the shore tile is outside the lake
    // polygon, where the renderer's water level falls back to the ground) plus the freeboard,
    // never below the shore ground
    const d0 = deck.length ? { x: deck[0].x + 0.5, z: deck[0].y + 0.5 } : at2(1, 0);
    const shoreH = hAt(sx, sz), waterOverDeck = waterY(d0.x, d0.z), deckY = Math.max(shoreH, waterOverDeck + 0.35);
    const yawAlong = Math.atan2(-dir.y, dir.x);
    const Lp = n + 0.8;
    const pier = gBox(Lp, 0.1, 1.0, Lp / 2 - 0.3, 0, 0); pier.rotateY(yawAlong); pier.translate(sx, deckY, sz); B.add(pier, M.wood);
    // a short plank ramp from the shore where the deck stands more than 0.25 above it
    let ramp = 0;
    {
      const foot = at2(-1.5, 0), footH = hAt(foot.x, foot.z), rise = deckY - footH;
      if (rise > 0.25) {
        const run = 1.2, g = new THREE.BoxGeometry(Math.hypot(run, rise) + 0.1, 0.08, 1.0);
        g.rotateZ(Math.atan2(rise, run)); g.rotateY(yawAlong);
        const mid = at2(-0.9, 0); g.translate(mid.x, (footH + deckY) / 2 - 0.02, mid.z); B.add(g, M.wood);
        for (const s of [-0.45, 0.45]) { const q = at2(-1.4, s); B.add(gBox(0.08, Math.max(0.1, rise * 0.2 + 0.1), 0.08, q.x, footH - 0.05, q.z), M.woodDark); }
        ramp = rise;
      }
    }
    for (let a = 0; a < Lp - 0.3; a += 0.5) { const q = at2(a, 0); const g = gBox(0.02, 0.012, 1.0, 0, 0, 0); g.rotateY(yawAlong); g.translate(q.x, deckY + 0.1, q.z); B.add(g, M.woodDark); }
    for (let a = 0.75; a < Lp - 0.3; a += 1.5) for (const s of [-0.45, 0.45]) {
      const q = at2(a, s), bed = Math.min(hAt(q.x, q.z), waterY(q.x, q.z) - 0.6) - 0.3;
      B.add(gCyl(0.07, 0.08, deckY + 0.2 - bed, 8, q.x, bed, q.z), M.woodDark);
    }
    // v11: the slips stand empty; the boats are sim entities (state.boats) drawn by vehicles.js
    for (let i = 0; i < slips; i++) {
      const a = 1.5 + i * ((n - 1) / Math.max(1, slips - 1)), sgn = i % 2 ? -1 : 1;
      const fc = at2(a, sgn * 1.4);
      const finger = gBox(0.45, 0.08, 1.8, 0, 0, 0); finger.rotateY(yawAlong); finger.translate(fc.x, deckY - 0.02, fc.z); B.add(finger, M.wood);
      const fe = at2(a, sgn * 2.3), bed = Math.min(hAt(fe.x, fe.z), waterY(fe.x, fe.z) - 0.6) - 0.3;
      B.add(gCyl(0.06, 0.07, deckY + 0.1 - bed, 8, fe.x, bed, fe.z), M.woodDark);
      const cleat = at2(a + 0.3, sgn * 0.42); B.add(gBox(0.16, 0.06, 0.08, 0, 0, 0).rotateY(yawAlong).translate(cleat.x, deckY + 0.1, cleat.z), M.iron);
    }
    const end = at2(Lp - 0.6, 0.3); lampAt(end.x, end.z, yawAlong, deckY);
    // life ring and the name board on a post at the shore end, the board reading toward the land
    const post = at2(-0.4, 0.7), py = hAt(post.x, post.z);
    B.add(gCyl(0.04, 0.04, 1.9, 8, post.x, py, post.z), M.iron);
    const ring = new THREE.TorusGeometry(0.18, 0.04, 8, 16); ring.rotateY(yawAlong + Math.PI / 2); ring.translate(post.x, py + 1.0, post.z); B.add(ring, M.salmon);
    boardAt(mr.name || 'Marina', C.navy, C.aqua, post.x, py + 1.85, post.z, -dir.x, -dir.y, 1.5, 0.3);
    placements.push({ x: sx, z: sz, y: deckY, kind: 'marina' });
    marinaRec = { x: sx, z: sz, y: deckY, dir: { x: dir.x, z: dir.y }, rot: mr.rot || 0, deck, slips, length: Lp, shoreH, water: waterOverDeck, ramp };
    counts.marina = 1;
  }

  /* 5b. v11 docks (docs/V11_DESIGN.md "Docks"): one record per plan dock from the raster
     (R.docks: the dock tile, its slip tile and the facing toward the open water). A deck dock (the
     marina planks) is a cleat and a short mooring post on the slip edge of the plank at the
     marina's deck height. A bank dock (the pier's foot, the pond landing, the riverside landing)
     is a one tile plank platform at the tile's own ground (the terrain pins a bank dock flat at
     its water's surface plus 0.3), two posts to the bed on the water side, a skirt on the land
     side, a mooring post with a rope coil and a cleat. The record carries where a moored boat
     lies: the slip center at the water surface. */
  const dockRecords = [];
  const marinaDeckKeys = new Set(marinaRec && marinaRec.deck ? marinaRec.deck.map(t => key(t.x, t.y)) : []);
  for (const d of R.docks || []) {
    if (!d || !d.tile || !d.slip) continue;
    const t = d.tile, s = d.slip, dir = d.dir || { x: 0, y: -1 };
    if (!inMap(t.x, t.y)) continue;
    const cx = t.x + 0.5, cz = t.y + 0.5, sxw = s.x + 0.5, szw = s.y + 0.5;
    const yawAlong = Math.atan2(-dir.y, dir.x), px = -dir.y, pz = dir.x;   // local +x toward the water, +z across the edge
    const wY = inMap(s.x, s.y) ? waterY(sxw, szw) : waterY(cx, cz);
    const onDeck = isDeck(t.x, t.y) || marinaDeckKeys.has(key(t.x, t.y));
    used.add(key(t.x, t.y));
    let top;
    if (onDeck) {
      top = marinaDeckKeys.has(key(t.x, t.y)) && marinaRec ? marinaRec.y + 0.1 : hAt(cx, cz) + 0.1;
      // a cleat across the plank at the slip edge, a short post with a silver cap at the corner
      const cleat = gBox(0.08, 0.06, 0.18, 0, 0, 0); cleat.rotateY(yawAlong); cleat.translate(cx + dir.x * 0.38, top, cz + dir.y * 0.38); B.add(cleat, M.iron);
      const post = gCyl(0.05, 0.055, 0.55, 8, 0, 0, 0); post.rotateY(yawAlong); post.translate(cx + dir.x * 0.42 + px * 0.4, top - 0.12, cz + dir.y * 0.42 + pz * 0.4); B.add(post, M.woodDark);
      const capG = gCyl(0.06, 0.06, 0.03, 8, 0, 0, 0); capG.translate(cx + dir.x * 0.42 + px * 0.4, top + 0.43, cz + dir.y * 0.42 + pz * 0.4); B.add(capG, M.silver);
      counts.deckDocks++;
    } else {
      const ground = hAt(cx, cz);
      top = ground + 0.12;
      // the platform and its boards
      B.add(gBox(1.0, 0.1, 1.0, cx, ground + 0.02, cz), M.wood);
      for (const a of [-0.33, 0, 0.33]) { const g = gBox(0.02, 0.012, 1.0, 0, 0, 0); g.rotateY(yawAlong); g.translate(cx + dir.x * a, top, cz + dir.y * a); B.add(g, M.woodDark); }
      // two posts to the bed on the water side, a skirt on the land side
      const bed = Math.min(hAt(sxw, szw), wY - 0.6) - 0.3;
      for (const sgn of [-1, 1]) {
        const qx = cx + dir.x * 0.42 + px * sgn * 0.42, qz = cz + dir.y * 0.42 + pz * sgn * 0.42;
        B.add(gCyl(0.06, 0.07, top - 0.02 - bed, 8, qx, bed, qz), M.woodDark);
      }
      const skirt = gBox(0.08, 0.3, 1.0, 0, 0, 0); skirt.rotateY(yawAlong); skirt.translate(cx - dir.x * 0.46, ground - 0.2, cz - dir.y * 0.46); B.add(skirt, M.woodDark);
      // the mooring post with a rope coil and a cleat on the water edge
      const mx = cx + dir.x * 0.4 + px * 0.38, mz = cz + dir.y * 0.4 + pz * 0.38;
      B.add(gCyl(0.06, 0.065, 0.9, 8, mx, top - 0.02, mz), M.woodDark);
      const coil = new THREE.TorusGeometry(0.085, 0.025, 6, 12); coil.rotateX(Math.PI / 2); coil.translate(mx, top + 0.55, mz); B.add(coil, M.rope);
      const cleat = gBox(0.08, 0.06, 0.18, 0, 0, 0); cleat.rotateY(yawAlong); cleat.translate(cx + dir.x * 0.38 - px * 0.25, top, cz + dir.y * 0.38 - pz * 0.25); B.add(cleat, M.iron);
      counts.bankDocks++;
    }
    placements.push({ x: cx, z: cz, y: top, kind: 'dock' });
    dockRecords.push({ id: d.id, name: d.name || d.id, x: cx, z: cz, y: top, yaw: Number.isFinite(d.yaw) ? d.yaw : (d.rot || 0) * DEG, rot: d.rot || 0, kind: onDeck ? 'deck' : 'bank', tile: { x: t.x, y: t.y }, slip: { x: s.x, y: s.y }, dir: { x: dir.x, z: dir.y }, boatX: sxw, boatZ: szw, waterY: wY });
    counts.docks++;
  }

  /* 5c. v11 kicker ramps (docs/V11_DESIGN.md "Kickers"): a plank ramp one tile wide over the foot
     and lip tiles, rising from the foot tile's near edge at the local ground to 0.8 above it at the
     lip's far edge (the terrain shapes the ground under it the same way), two side rails on posts,
     a cheek board under the lip, an aqua Thread stripe down the middle and a salmon lip stripe. The
     record carries the launch frame for the hoverboard (the lip's far edge center and its top). */
  const kickerRecords = [];
  for (const k of R.kickers || []) {
    if (!k || !k.foot || !k.lip) continue;
    const dir = k.dir || { x: 0, y: -1 };
    if (!inMap(k.foot.x, k.foot.y) || !inMap(k.lip.x, k.lip.y)) continue;
    used.add(key(k.foot.x, k.foot.y)); used.add(key(k.lip.x, k.lip.y));
    const mx = (k.foot.x + k.lip.x) / 2 + 0.5, mz = (k.foot.y + k.lip.y) / 2 + 0.5;
    const yaw = Math.atan2(-dir.y, dir.x), px = -dir.y, pz = dir.x;
    const h0 = hAt(mx - dir.x * 0.98, mz - dir.y * 0.98);   // the ground at the foot's near edge
    const RISE = 0.8, RUN = 2.0, pitch = Math.atan2(RISE, RUN);
    const sloped = (len, h, w, s, lift, m) => {   // a box along the ramp at local along s (0 at the near edge, RUN at the lip) and lift above the deck plane
      const g = new THREE.BoxGeometry(len, h, w); g.rotateZ(pitch); g.rotateY(yaw);
      const u = s / RUN; g.translate(mx + dir.x * (s - RUN / 2), h0 + RISE * u + lift, mz + dir.y * (s - RUN / 2)); B.add(g, m);
    };
    sloped(RUN + 0.1, 0.06, 1.0, RUN / 2, 0.03, M.wood);                       // the deck
    sloped(RUN - 0.2, 0.012, 0.16, RUN / 2, 0.07, M.aqua);                     // the Thread stripe
    const lipStripe = gBox(0.06, 0.012, 0.9, 0, 0, 0); lipStripe.rotateY(yaw); lipStripe.translate(mx + dir.x * (RUN / 2 - 0.12), h0 + RISE - 0.05 + 0.07, mz + dir.y * (RUN / 2 - 0.12)); B.add(lipStripe, M.salmon);
    for (const sgn of [-1, 1]) {
      // the rail 0.5 above the deck and its three posts, the cheek board under the lip half
      const g = new THREE.BoxGeometry(RUN - 0.1, 0.05, 0.05); g.rotateZ(pitch); g.rotateY(yaw);
      g.translate(mx + px * sgn * 0.47, h0 + RISE / 2 + 0.55, mz + pz * sgn * 0.47); B.add(g, M.wood);
      for (const s of [0.25, 1.0, 1.8]) { const u = s / RUN; B.add(gBox(0.05, 0.5, 0.05, mx + dir.x * (s - RUN / 2) + px * sgn * 0.47, h0 + RISE * u + 0.04, mz + dir.y * (s - RUN / 2) + pz * sgn * 0.47), M.woodDark); }
      const cheek = gBox(0.9, RISE * 0.72, 0.05, 0, 0, 0); cheek.rotateY(yaw); cheek.translate(mx + dir.x * 0.52 + px * sgn * 0.5, h0 + 0.02, mz + dir.y * 0.52 + pz * sgn * 0.5); B.add(cheek, M.woodDark);
    }
    const lipX = mx + dir.x * (RUN / 2), lipZ = mz + dir.y * (RUN / 2);
    placements.push({ x: mx, z: mz, y: h0, kind: 'kicker' });
    kickerRecords.push({ id: k.id, name: k.name || k.id, x: mx, z: mz, y: h0, yaw, rot: k.rot || 0, dir: { x: dir.x, z: dir.y }, foot: { x: k.foot.x, y: k.foot.y }, lip: { x: k.lip.x, y: k.lip.y }, launch: k.launch ? { x: k.launch.x, y: k.launch.y } : null, lipX, lipZ, lipY: h0 + RISE + 0.06, rise: RISE, run: RUN });
    counts.kickers++;
  }

  /* 5d. v11 the shop kiosk (docs/V11_DESIGN.md "The kiosk"): a one tile booth on the plaza facing
     its front tile: a silver plinth, a navy body with a glass window and a silver counter, an aqua
     roof and a striped aqua awning over the window, a salmon 'Shop' sign over the window, a brass
     coin on one side, a bulb under the awning on the night ramp. */
  let kioskRec = null;
  if (R.kiosk && R.kiosk.tile && inMap(R.kiosk.tile.x, R.kiosk.tile.y)) {
    const kk = R.kiosk, t = kk.tile, f = rotVec(kk.rot || 0, 0, 1);
    const cx = t.x + 0.5, cz = t.y + 0.5, yaw = Math.atan2(f.x, f.y);
    used.add(key(t.x, t.y));
    const parts = [
      [gBox(1.0, 0.06, 1.0, 0, 0, 0), M.silver],                      // plinth
      [gBox(0.9, 1.9, 0.8, 0, 0.06, -0.05), M.navy],                  // body
      [gBox(0.7, 0.72, 0.03, 0, 1.06, 0.36), M.panelGlass],           // window
      [gBox(0.96, 0.06, 0.32, 0, 1.0, 0.46), M.silver],               // counter
      [gBox(0.92, 0.08, 0.02, 0, 0.9, 0.36), M.aqua],                 // counter band
      [gBox(1.08, 0.08, 1.0, 0, 1.96, -0.05), M.aqua],                // roof
      [gBox(1.12, 0.03, 1.04, 0, 2.04, -0.05), M.navy],               // roof trim
      [gBox(0.03, 0.03, 0.5, -0.47, 1.78, 0.62), M.iron],             // awning bars
      [gBox(0.03, 0.03, 0.5, 0.47, 1.78, 0.62), M.iron],
      [gCyl(0.14, 0.14, 0.03, 16, 0, 0, 0).rotateZ(Math.PI / 2).translate(0.47, 1.3, -0.05), M.brass],   // the coin on the east side
      [gCyl(0.09, 0.09, 0.012, 16, 0, 0, 0).rotateZ(Math.PI / 2).translate(0.49, 1.3, -0.05), M.navy],
      [gBox(0.02, 0.4, 0.34, -0.46, 1.1, -0.05), M.silver],           // a notice board on the west side
      [gSphere(0.06, 0, 1.74, 0.5, 10, 8), out.bulbMat],              // the bulb under the awning
    ];
    const awn = new THREE.BoxGeometry(1.0, 0.03, 0.58); awn.rotateX(0.38); awn.translate(0, 1.84, 0.6);
    parts.push([awn, awningMat(C.aqua)]);
    const y = put(parts, cx, cz, yaw, 'kiosk');
    boardAt('Shop', C.salmon, C.white, cx + f.x * 0.41, y + 1.68, cz + f.y * 0.41, f.x, f.y, 0.7, 0.22);
    kioskRec = { x: cx, z: cz, y, yaw, rot: kk.rot || 0, tile: { x: t.x, y: t.y }, front: kk.front ? { x: kk.front.x, y: kk.front.y } : null, frontX: kk.front ? kk.front.x + 0.5 : cx + f.x, frontZ: kk.front ? kk.front.y + 0.5 : cz + f.y, name: (plan.kiosk && plan.kiosk.name) || 'Shop kiosk' };
    counts.kiosk = 1;
  }

  /* 5e. v11 weirs (docs/V11_DESIGN.md "Water levels"): where two water levels meet, a navy stone
     sill along the tile edge from the lower level up to the upper one, a white water tongue
     spilling over it to the lower side and a foam line at its foot. The lower side is the side
     whose tile is a waterway outside the plan's river and lake polygons (the creek below the
     pond, the channel below the river); the fallback faces south for an x lip and west for a y lip. */
  const weirRecords = [];
  const waterPolys = (plan.water || []).filter(w => w && Array.isArray(w.pts) && w.pts.length >= 3).map(w => w.pts);
  const lowerSide = (tx, ty) => inMap(tx, ty) && typeof R.waterwayAt === 'function' && R.waterwayAt(tx, ty) && !waterPolys.some(p => pointInPoly(tx + 0.5, ty + 0.5, p));
  for (const w of plan.weirs || []) {
    if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) continue;
    const len = Math.max(1, w.length || 1), upper = Number.isFinite(w.upper) ? w.upper : 0.04, lower = Number.isFinite(w.lower) ? w.lower : -0.9;
    const drop = Math.max(0.05, upper - lower), alongX = w.axis !== 'y';
    let down;
    if (alongX) down = lowerSide(w.x, w.y) ? 1 : (lowerSide(w.x, w.y - 1) ? -1 : 1);
    else down = lowerSide(w.x, w.y) ? 1 : -1;
    const cx = alongX ? w.x + len / 2 : w.x, cz = alongX ? w.y : w.y + len / 2;
    const sillH = drop + 0.27, tongueL = Math.hypot(drop, 0.5), tilt = Math.atan2(drop, 0.5);
    if (alongX) {
      B.add(gBox(len, sillH, 0.3, cx, lower - 0.3, cz), M.navy);
      B.add(gBox(len + 0.06, 0.04, 0.36, cx, upper - 0.05, cz), M.silver);
      const tongue = new THREE.BoxGeometry(len - 0.1, 0.04, tongueL); tongue.rotateX(down * tilt); tongue.translate(cx, (upper + lower) / 2 - 0.01, cz + down * 0.3); B.add(tongue, M.white);
      B.add(gBox(len - 0.1, 0.05, 0.28, cx, lower - 0.01, cz + down * 0.72), M.foam);
    } else {
      B.add(gBox(0.3, sillH, len, cx, lower - 0.3, cz), M.navy);
      B.add(gBox(0.36, 0.04, len + 0.06, cx, upper - 0.05, cz), M.silver);
      const tongue = new THREE.BoxGeometry(tongueL, 0.04, len - 0.1); tongue.rotateZ(-down * tilt); tongue.translate(cx + down * 0.3, (upper + lower) / 2 - 0.01, cz); B.add(tongue, M.white);
      B.add(gBox(0.28, 0.05, len - 0.1, cx + down * 0.72, lower - 0.01, cz), M.foam);
    }
    placements.push({ x: cx, z: cz, y: upper, kind: 'weir' });
    weirRecords.push({ id: w.id, x: cx, z: cz, axis: alongX ? 'x' : 'y', length: len, upper, lower, down: alongX ? { x: 0, z: down } : { x: down, z: 0 } });
    counts.weirs++;
  }

  /* 6. Retaining walls as low stone walls: the terrain's list when it gives one, else the lot
     edges where the plateau stands more than 1.2 above or below the ground outside. */
  let walls = [];
  {
    const src = terrain && terrain.retainingWalls;
    const list = typeof src === 'function' ? src() : src;
    if (Array.isArray(list) && list.length) walls = normalizeWalls(list);
    if (!walls.length) walls = deriveWalls(lots, plateauOf, hAt, 1.2);
  }
  const wallRecords = [];
  for (const w of walls) {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (!(L > 0.2)) continue;
    const dx = (w.b.x - w.a.x) / L, dy = (w.b.y - w.a.y) / L;
    // the body (0.3 thick) stands just outside the edge along the record's outward normal
    const ox = w.normal ? w.normal[0] * 0.16 : 0, oz = w.normal ? w.normal[1] * 0.16 : 0;
    const mx = (w.a.x + w.b.x) / 2 + ox, mz = (w.a.y + w.b.y) / 2 + oz;
    let top = w.top, bottom = w.bottom;
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
      // no heights given: the ground on both sides of the line; a span alone stands on the lower side
      const h1 = hAt(mx - dy * 0.6, mz + dx * 0.6), h2 = hAt(mx + dy * 0.6, mz - dx * 0.6);
      bottom = Math.min(h1, h2);
      top = Number.isFinite(w.span) ? bottom + Math.abs(w.span) : Math.max(h1, h2);
    }
    if (top - bottom < 0.3) continue;
    const yaw = Math.atan2(-dy, dx), hgt = top - bottom + 0.32;
    const body = gBox(L, hgt, 0.3, 0, 0, 0); body.rotateY(yaw); body.translate(mx, bottom - 0.2, mz); B.add(body, M.wall);
    const cap = gBox(L + 0.06, 0.07, 0.42, 0, 0, 0); cap.rotateY(yaw); cap.translate(mx, top + 0.12, mz); B.add(cap, M.cap);
    // mortar courses every 0.45 along the visible height
    for (let y = bottom + 0.35; y < top; y += 0.45) { const line = gBox(L, 0.02, 0.33, 0, 0, 0); line.rotateY(yaw); line.translate(mx, y, mz); B.add(line, M.rockDark); }
    wallRecords.push({ a: [w.a.x, w.a.y], b: [w.b.x, w.b.y], top, bottom, lot: w.lot || null, side: w.side || null, normal: w.normal || null });
    placements.push({ x: mx, z: mz, y: bottom, kind: 'wall' });
    counts.walls++;
  }
  // the bluff parapet: a low stone wall half a tile inside the bluff landform's wall line, with
  // a gap wherever a piece would stand on a road, sidewalk, bridge or path tile or within half a
  // tile of a ribbon edge (Ledger Street leaving the bluff bridge, the foot of the stairs on the
  // riverside walk), so the way through stays open
  const parapetRec = { pieces: [], gaps: [] };
  for (const d of plan.districts || []) {
    const lf = d.landform;
    if (!lf || lf.kind !== 'bluff' || !Array.isArray(lf.wall) || lf.wall.length < 2) continue;
    const poly = lf.polygon || d.pts;
    for (let i = 0; i + 1 < lf.wall.length; i++) {
      const a = lf.wall[i], b = lf.wall[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
      let nx = dy, ny = -dx;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (poly && !pointInPoly(mx + nx, my + ny, poly)) { nx = -nx; ny = -ny; }
      const yaw = Math.atan2(-dy, dx);
      for (let s = 0; s < L; s += 2) {
        const len = Math.min(2, L - s) + 0.05, cx = a[0] + dx * (s + len / 2) + nx * 0.5, cz = a[1] + dy * (s + len / 2) + ny * 0.5;
        // the piece's interior sampled every half tile (its ends may touch a bridge tile's edge)
        let blocked = null;
        for (let t = -len / 2 + 0.1; t <= len / 2 - 0.1 + 1e-6 && !blocked; t += 0.5) {
          const px = cx + dx * t, pz = cz + dy * t, m = at(Math.floor(px), Math.floor(pz));
          if (RIBBON_MARKS.has(m)) blocked = 'tile ' + m; else if (nearRoad(px, pz, 0.5, 1.2)) blocked = 'ribbon';
        }
        if (blocked) { counts.parapetGaps++; parapetRec.gaps.push({ x: cx, z: cz, len, reason: blocked }); continue; }
        const y = hAt(cx, cz);
        const body = gBox(len, 0.6, 0.3, 0, 0, 0); body.rotateY(yaw); body.translate(cx, y - 0.15, cz); B.add(body, M.wall);
        const cap = gBox(len + 0.04, 0.06, 0.4, 0, 0, 0); cap.rotateY(yaw); cap.translate(cx, y + 0.45, cz); B.add(cap, M.cap);
        parapetRec.pieces.push({ x: cx, z: cz, y, len, yaw });
      }
      counts.parapets++;
    }
  }

  /* 7. Stairs from plan.stairs: stone treads from the top tile to the bottom tile at the ground's
     own heights (the terrain's drop), cheek walls and a handrail on both sides. */
  const stairKeys = [];
  for (const st of plan.stairs || []) {
    if (!st.from || !st.to) continue;
    let a = { x: st.from[0] + 0.5, y: st.from[1] + 0.5 }, b = { x: st.to[0] + 0.5, y: st.to[1] + 0.5 };
    const L0 = Math.hypot(b.x - a.x, b.y - a.y); if (L0 < 0.5) continue;
    let dx = (b.x - a.x) / L0, dy = (b.y - a.y) / L0;
    let hTop = hAt(a.x - dx * 0.5, a.y - dy * 0.5), hBot = hAt(b.x + dx * 0.5, b.y + dy * 0.5);
    if (hBot > hTop) { const t = a; a = b; b = t; dx = -dx; dy = -dy; const th = hTop; hTop = hBot; hBot = th; }
    const sx = a.x - dx * 0.5, sz = a.y - dy * 0.5, L = L0 + 1;   // the flight runs from the top tile's far edge to the bottom tile's far edge
    const drop = Math.max(0.1, hTop - hBot), steps = Math.max(4, Math.round(drop / 0.22)), tread = L / steps;
    const yaw = Math.atan2(-dy, dx), nx = -dy, ny = dx;
    for (let i = 0; i < steps; i++) {
      const topY = hTop - (i + 1) * drop / steps, s = (i + 0.5) * tread;
      const cx = sx + dx * s, cz = sz + dy * s;
      const g = gBox(tread + 0.02, 0.5, 0.9, 0, 0, 0); g.rotateY(yaw); g.translate(cx, topY - 0.5, cz); B.add(g, M.lightStone);
      const nose = gBox(0.04, 0.02, 0.9, tread / 2, 0, 0); nose.rotateY(yaw); nose.translate(cx, topY, cz); B.add(nose, M.cap);
    }
    const tilt = Math.atan2(-drop, L), mid = { x: sx + dx * L / 2, z: sz + dy * L / 2 }, midY = (hTop + hBot) / 2;
    for (const side of [-1, 1]) {
      const cheek = new THREE.BoxGeometry(L + 0.2, 0.7, 0.16); cheek.rotateZ(tilt); cheek.rotateY(yaw); cheek.translate(mid.x + nx * side * 0.53, midY - 0.1, mid.z + ny * side * 0.53); B.add(cheek, M.wall);
      const rail = new THREE.CylinderGeometry(0.025, 0.025, L + 0.2, 8); rail.rotateZ(Math.PI / 2); rail.rotateZ(tilt); rail.rotateY(yaw); rail.translate(mid.x + nx * side * 0.46, midY + 0.95, mid.z + ny * side * 0.46); B.add(rail, M.iron);
      for (let s = 0.3; s < L; s += 1.5) { const px = sx + dx * s + nx * side * 0.46, pz = sz + dy * s + ny * side * 0.46, py = hTop - drop * (s / L); B.add(gCyl(0.02, 0.02, 0.95, 6, px, py, pz), M.iron); }
    }
    placements.push({ x: sx, z: sz, y: hTop, kind: 'stairs' });
    stairKeys.push([b.x + dx * 0.5, b.y + dy * 0.5]);
    counts.stairs++;
  }

  /* 8. The Thread National entrance sign on the links road (golf.entranceSign). The plan point
     marks the spot along the road; the sign itself stands on the verge: from the plan point the
     nearest spot (across the road first, then a little along it) whose posts, board and hedges
     all land off road, sidewalk, path, bridge, water and lot tiles and off the ribbon edges.
     Moved across the road, the board turns to face back toward it. */
  let signAnchor = null;
  if (plan.golf && plan.golf.entranceSign) {
    const es = plan.golf.entranceSign;
    let f = rotVec(es.rot || 0, 0, 1), px = -f.y, pz = f.x;
    const x0 = es.x + 0.5, z0 = es.y + 0.5;
    const SIGN_BLOCK = new Set([MARK.ROAD, MARK.SIDEWALK, MARK.BRIDGE, MARK.PATH, MARK.CARTPATH, MARK.WATER, MARK.BUILDING, MARK.STUB, MARK.PARKING, MARK.STATION, MARK.DECK, MARK.FEATURE]);
    const signFree = (cx, cz) => {
      for (const s of [-1.75, -1.3, -0.6, 0, 0.6, 1.3, 1.75]) {
        const qx = cx + px * s, qz = cz + pz * s, tx = Math.floor(qx), tz = Math.floor(qz);
        if (!inMap(tx, tz) || SIGN_BLOCK.has(at(tx, tz)) || R.lotIdx[tz * cols + tx] >= 0 || nearRoad(qx, qz, 0.3)) return false;
      }
      return true;
    };
    let best = null;
    for (let dn = 0; dn <= 4; dn += 0.5) for (const sn of (dn ? [1, -1] : [1])) for (const dt of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
      const cx = x0 + f.x * dn * sn + px * dt, cz = z0 + f.y * dn * sn + pz * dt, score = dn + 0.5 * Math.abs(dt);
      if ((best && score >= best.score) || !signFree(cx, cz)) continue;
      best = { x: cx, z: cz, score, across: dn * sn };
    }
    const x = best ? best.x : x0, z = best ? best.z : z0, y = hAt(x, z);
    if (best && best.across > 0) { f = { x: -f.x, y: -f.y }; px = -f.y; pz = f.x; }   // moved along its facing: turn back toward the road
    for (const s of [-1.3, 1.3]) B.add(gBox(0.14, 2.0, 0.14, x + px * s, y, z + pz * s), M.woodDark);
    const board = gBox(3.0, 0.9, 0.08, 0, 1.05, 0); board.rotateY(Math.atan2(f.x, f.y)); board.translate(x, y, z); B.add(board, M.navy);
    boardAt(plan.golf.name || 'Thread National', C.navy, C.aqua, x + f.x * 0.05, y + 1.85, z + f.y * 0.05, f.x, f.y, 2.8, 0.42);
    boardAt('Nine holes, par 35', C.navy, C.silver, x + f.x * 0.05, y + 1.4, z + f.y * 0.05, f.x, f.y, 2.0, 0.22);
    for (const s of [-1.6, 1.6]) { const hx = x + px * s, hz = z + pz * s; B.add(gBox(0.6, 0.4, 0.45, hx, y, hz), M.hedge); }
    placements.push({ x, z, y, kind: 'entrance-sign' });
    signAnchor = { x, z, y, moved: !!best && (best.x !== x0 || best.z !== z0), from: { x: x0, z: z0 }, facing: { x: f.x, z: f.y } };
  }

  /* 9. Scooter rack rails (v9): the rail and its plinth only; the scooters are sim entities the
     renderer draws. The rail lies east to west at the tile center with the slots south of it. */
  const racks = (state.racks && state.racks.length ? state.racks : plan.scooterRacks) || [];
  const rackList = [];
  for (let i = 0; i < racks.length; i++) {
    const k = racks[i];
    if (!k) continue;
    const kx = k.pos && Number.isFinite(k.pos.x) ? k.pos.x : (Number.isFinite(k.x) ? k.x : 0) + 0.5;
    const kz = k.pos && Number.isFinite(k.pos.y) ? k.pos.y : (Number.isFinite(k.y) ? k.y : 0) + 0.5;
    const yaw = 0;
    const parts = [[gBox(1.5, 0.04, 0.04, 0, 0.45, 0), M.iron], [gCyl(0.03, 0.03, 0.47, 8, -0.7, 0, 0), M.iron], [gCyl(0.03, 0.03, 0.47, 8, 0.7, 0, 0), M.iron], [gBox(1.6, 0.03, 0.9, 0, 0, 0.3), M.plinth]];
    const ky = put(parts, kx, kz, yaw, 'rack'); counts.racks++;
    rackList.push({ id: k.id !== undefined ? k.id : i, x: kx, z: kz, y: ky, yaw });
  }

  /* 10. Lamp pools and point lights (a small subset, by the budget). */
  const lights = [];
  if (lampPositions.length) {
    for (const l of lampPositions) B.add(gDisc(1.8, l.x, (Number.isFinite(l.h) ? l.h : hAt(l.x, l.y)) + 0.015, l.y, 32), out.poolMat, FLAT);
    const keys = [];
    if (plan.fountain) keys.push([plan.fountain.x + 0.5, plan.fountain.y + 0.5]);
    for (const k of boardwalkKeys) keys.push(k);
    if (marinaRec) keys.push([marinaRec.x, marinaRec.z]);
    for (const k of stairKeys) keys.push(k);
    if (signAnchor) keys.push([signAnchor.x, signAnchor.z]);
    if (kioskRec) keys.push([kioskRec.x, kioskRec.z]);   // v11: the kiosk is lit at night like the plaza lamps
    const chosen = new Set();
    for (const [kx, ky] of keys) {
      let best = -1, bd = Infinity;
      lampPositions.forEach((l, i) => { if (chosen.has(i)) return; const d = Math.hypot(l.x - kx, l.y - ky); if (d < bd) { bd = d; best = i; } });
      if (best < 0 || lights.length >= 6) continue;
      chosen.add(best);
      const l = lampPositions[best];
      const pl = new THREE.PointLight(new THREE.Color(C.lampLight), 12, 7, 2);
      pl.position.set(l.x, (Number.isFinite(l.h) ? l.h : hAt(l.x, l.y)) + 1.95, l.y); pl.castShadow = false;
      group.add(pl); lights.push(pl);
    }
  }

  /* 11. Sign faces share the atlas material; build them after every text is registered. */
  const atlasMat = atlas.finish();
  for (const s of out.signs) {
    if (s.world) {
      const g = atlas.plane(s.row, s.w, s.h); g.rotateY(s.ry); g.translate(s.x, s.y, s.z);
      B.add(g, atlasMat, FLAT);
    } else {
      const g = atlas.plane(s.row, s.w, s.h); g.translate(s.cx, s.y, s.zf + 0.045);
      s.A.add(g, atlasMat, FLAT);
    }
  }

  /* 12. Merge everything static, then add the animated parts. */
  const stats = B.build(group);
  // traffic light lenses: one mesh per phase and color, animated through emissive intensity
  const lensMats = [];
  const lensColors = ['#FF4A3D', '#FFB347', '#5FD37A'];
  const lensMeshes = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(lensColors[i % 3]), roughness: 0.4, emissive: new THREE.Color(lensColors[i % 3]), emissiveIntensity: 0.12 });
    m.userData.envMapIntensity = 0.25;
    lensMats.push(m);
    if (!lensGeos[i].length) continue;
    const merged = BufferGeometryUtils.mergeGeometries(lensGeos[i], false);
    for (const g of lensGeos[i]) g.dispose();
    const mesh = new THREE.Mesh(merged, m); mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.noMerge = true;
    group.add(mesh); lensMeshes.push(mesh);
  }
  // flags: small double sided planes that wave in update
  const flagMeshes = [];
  for (const f of out.flags) {
    const g = new THREE.PlaneGeometry(f.w, f.h, 4, 1); g.translate(f.w / 2, 0, 0);
    const m = new THREE.Mesh(g, mat(f.color, { roughness: 0.9, doubleSide: true }));
    m.position.copy(f.pos); m.rotation.y = f.rot; m.castShadow = true; m.userData.noMerge = true; m.userData.baseRot = f.rot;
    group.add(m); flagMeshes.push(m);
  }
  group.userData.cityStats = { meshes: stats.meshes + lensMeshes.length + flagMeshes.length, mergedParts: stats.parts, lamps: lampPositions.length, lights: lights.length, crossings: crossings.length, lensMeshes: lensMeshes.length, flags: flagMeshes.length, counts };
  group.userData.placements = placements;   // every anchor { x, z, y, kind } for the headless terrain check
  group.userData.racks = rackList;          // v9: the rack rails { id, x, z, y, yaw } for the renderer's scooter slots
  group.userData.lots = out.lotRecords;     // v10: every built lot { id, kind, x, z, y, rot, corners, cornerHeights }
  group.userData.marina = marinaRec;        // v10: the dock { x, z, y, dir, rot, deck, slips, length } or null
  group.userData.walls = wallRecords;       // v10: the retaining walls drawn { a, b, top, bottom, lot, side, normal }
  group.userData.crossings = crossings.map(c => ({ x: c.x, y: c.y, roads: [c.A.id, c.B.id] }));
  group.userData.entranceSign = signAnchor; // v10: where the Thread National sign stands { x, z, y, moved, from, facing } or null
  group.userData.parapet = parapetRec;      // v10: the bluff parapet pieces built { x, z, y, len, yaw } and the gaps left { x, z, len, reason }
  group.userData.docks = dockRecords;       // v11: the docks { id, name, x, z, y, yaw, rot, kind, tile, slip, dir, boatX, boatZ, waterY }
  group.userData.kickers = kickerRecords;   // v11: the kicker ramps { id, name, x, z, y, yaw, rot, dir, foot, lip, launch, lipX, lipZ, lipY, rise, run }
  group.userData.kiosk = kioskRec;          // v11: the shop kiosk { x, z, y, yaw, rot, tile, front, frontX, frontZ, name } or null
  group.userData.weirs = weirRecords;       // v11: the weir lips { id, x, z, axis, length, upper, lower, down }

  /* Per frame: traffic lights cycle with the clock, bulbs and pools follow the night ramp, the
     flags wave, the tower beacon blinks. Allocation free. */
  const CYCLE = 16;
  function update(dt, time, night) {
    const rp = ramp(night || 0);
    out.bulbMat.emissiveIntensity = 0.08 + 2.4 * rp;
    out.poolMat.opacity = 0.35 * rp;
    if (atlasMat.emissiveMap) atlasMat.emissiveIntensity = 0.55 * rp;
    out.neonMat.emissiveIntensity = 1.0 + 1.2 * rp;
    out.beaconMat.emissiveIntensity = 0.3 + 1.6 * (0.5 + 0.5 * Math.sin(TAU * 0.6 * time));
    const t = ((time % CYCLE) + CYCLE) % CYCLE;
    // phase 0 (the avenue axis): green 0..6, amber 6..7.5; phase 1: green 8..14, amber 14..15.5
    const g0 = t < 6, a0 = t >= 6 && t < 7.5, g1 = t >= 8 && t < 14, a1 = t >= 14 && t < 15.5;
    const on = 2.6, off = 0.12;
    lensMats[0].emissiveIntensity = (!g0 && !a0) ? on : off; lensMats[1].emissiveIntensity = a0 ? on : off; lensMats[2].emissiveIntensity = g0 ? on : off;
    lensMats[3].emissiveIntensity = (!g1 && !a1) ? on : off; lensMats[4].emissiveIntensity = a1 ? on : off; lensMats[5].emissiveIntensity = g1 ? on : off;
    for (let i = 0; i < flagMeshes.length; i++) {
      const f = flagMeshes[i];
      f.rotation.y = f.userData.baseRot + 0.25 * Math.sin(TAU * 0.35 * time + i * 1.7);
      f.rotation.z = 0.06 * Math.sin(TAU * 0.8 * time + i);
    }
  }
  return { group, update, lights, glass: out.glass };
}

export default buildCity;
