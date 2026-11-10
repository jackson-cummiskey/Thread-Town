/* Thread Town 3D, version 5: the Three.js world renderer. Owns the scene, camera, lights, ground,
   the twelve department buildings and their work stations, the cafe and the clubhouse, leisure
   props, the department interiors, the golf park dressing, agents, overlays, picking, camera focus
   and follow, and the frame loop, and defines TT.town.
   Built against docs/CONTRACT_V5.md "Renderer integration" (course tile paint, interiors and golf
   built after the world and stepped each frame, the #fade overlay, the inside look, chase camera
   input and the 0.35 s view blend, station anchorPos and the walk-out, the club prop, the aim line,
   the golf HUD), docs/CONTRACT_V4.md (walk mode: the 'walk' camera mode, pointer lock input, the
   per-frame player sync, prompts and the talk pause), docs/CONTRACT_V3.md (animal characters per
   department, per-record animate, setOpacity and dispose slots, portraitScale), docs/CONTRACT_V2.md
   (sections "Renderer integration"), docs/CONTRACT.md for everything later versions do not mention,
   docs/CITY_DESIGN.md, docs/ART_DIRECTION.md, docs/GOLF_DESIGN.md and docs/INTERIORS_DESIGN.md.
   Version 12 (docs/CONTRACT_V12.md "Detection", "Wiring"): the touch layer (js/touch.js) on a mount
   over the view, its read merged into the walk feed and the subway feed, orbit camera and the Phone
   quality tier by default on touch devices, no pointer lock on touch, a 12 px tap slop for picks, the
   120 px minimap, vibration on a landing, a catch and holing out. Nothing changes off touch.
   Version 6 (docs/CONTRACT_V6.md "Renderer integration" and "Leaderboard", docs/SUBWAY_DESIGN.md):
   the subway entrance on the plaza (a stairwell cut through the ground plane, railings, globe lamps,
   the THREAD METRO sign, the mosaic band), the game mode switch (the runner's own scene and camera
   replace the town behind a fade while the town keeps simulating), the game key routing and the
   runner HUD writes, the leaderboard (TT.leaderboard over a localStorage wrapper, subway runs on
   gameover, golf rounds on 'done') and the two scoreboard signs.
   Version 7 (docs/CONTRACT_V7.md "Renderer"): the city. The plan (js/cityplan.js) is handed to the sim
   as TT.PLAN before the map size is read; the ground painter paints sidewalks, crosswalks (zebra bars
   along the road direction), parking bays, bridge decks, lane markings from the plan's roads (dashed
   lane lines for width 3 and 4, the avenue median with planters) and curbs where paving meets a
   sidewalk; department, cafe and clubhouse groups build in their lot's canonical frame and turn by
   b.rot about the lot center (worldAnchor, the station yaw, the scale pivot and the sign follow);
   js/city.js dresses the city after the world (its glass and lights follow the night like the
   departments); lamps, trees, decos, the pier, the subway and the golf course come from the sim state
   and the plan, never from block math. Walk mode is third person only: the chase camera is the only
   walk camera, there is no step bounce, no reticle and no eye-level camera branch, and V (through
   the player) toggles the chase distance.
   Version 8 (docs/CONTRACT_V8.md "Everything on the terrain", "The round and the cart", "HUD",
   "Leaderboard"; docs/TERRAIN_DESIGN.md "Placement rules"): the terrain is built right after the sim
   (js/terrain.js, seed TT.sim.terrainSeed) and before the world; the ground is a heightfield mesh
   with computed normals that casts and receives shadows, with a skirt that follows the edge
   heights outward; every placement adds terrain.heightAt (trees also tilt a little with the
   normal, department, cafe and clubhouse groups sit at their lot plateau, stations and worldAnchor
   are lifted with them, signs follow, characters and the player stand on heightAt with their
   contact shadows tilted to the normal, the free and orbit cameras stay 1.6 above the terrain and
   the walk camera 0.6); city.js, leisure3d.js and golf.js receive ctx.heightAt (golf.js also the
   terrain for the ball physics); the golf cart (js/vehicles.js) is drawn from player.cart each frame
   at terrain height with pitch and roll from the normal, wheels and steering animated, headlights
   on at night, and the player's handle rides in the seat while state is 'cart'; the round HUD
   (round line, round card row, to par, clock, cart line) is written from player.golf and a finished
   round (player.golf.roundResult) is recorded once on the leaderboard with its to par, card and
   time; practice is never recorded. Tab is the cart's auto-drive edge.
   Version 9 (docs/CONTRACT_V9.md "Rendering"): scooters, and no parked cars. city.js no longer
   builds parked cars or rack scooters; the renderer keeps one pooled makeScooter mesh per entry in
   state.scooters (frame color by the record's variant v), placed each frame at terrain height with
   pitch and roll from the normal: parked scooters at their rack slot or free spot (a re-slot within
   a couple of tiles glides there), ridden ones under their rider (an agent's rendered position
   while agent.scooter is set, player.scooter for the visitor) with animateScooter spinning the
   wheels, turning the stem and leaning into turns. The rider's handle stands on the deck (deck
   height 0.12 plus the terrain) in pose 'ride' with handle.leanZ from the scooter lean; a riding
   agent's body keeps the scooter heading, also while it waves. The kickstand shows only while
   parked, and far scooters drop their small parts and shadows. A scooter ridden by an agent that
   is not drawn (a demo agent while demo agents are hidden) is hidden with its rider. createPlayer receives the vehicles
   module, so ctx.vehicles.createScooterController is the visitor's riding model.
   Version 10 (docs/CONTRACT_V10.md "Polish list", "Blended ground", "Roads as meshes", "Nature";
   docs/WORLD_DESIGN.md): the 192 by 144 plan v3. The cityplan module namespace is handed to the sim
   as TT.cityplan beside TT.PLAN. The painted ground texture is gone: js/ground.js builds the splat
   blended heightfield, js/roads.js the road ribbons, curbs, markings, crosswalks and bridges, and
   js/nature.js the forests, rocks, tufts and reeds (the old tree, road, curb, crosswalk and bridge
   painters are removed). Lots turn by any angle: rotOff is the general rotation about the lot
   center, so department, cafe and clubhouse groups, their stations, pivots and signs follow the
   exact degrees. Water planes sit at terrain.water[].surface per body (river, lake, pond). The sun
   is the near shadow cascade with a camera-derived, texel-snapped bound and a second far light
   covers the whole map softly; the Quality control in the header (High or Balanced) halves the
   near map and drops the far cascade, the building base AO decals and the golf extras. ACES
   exposure 1.0 with a warm day and a cool night grade in the key light colors; the haze follows
   the camera distance. Characters get handle.distance from their movement (foot plant), the
   visitor the 'turn' pose while turning in place and 'idle' fidgets; the targeted interactable
   gets a highlight ring and the prompt pill fades in. Golf: a shaped swing phase (backswing pause,
   follow-through), the ball streak, landing puff and long trail, the dotted carry arc, flag
   shadows and birds over the links. Emissive window patterns per building at night.
   Version 11 (docs/CONTRACT_V11.md, docs/V11_DESIGN.md): the wallet (js/wallet.js over townStorage,
   TT.wallet) and the shop modal (js/shop.js, TT.shop) are created here; the kiosk on the plaza
   prompts 'E  Shop' within 1.5 of its front tile and the runner's start card opens the shop too.
   The runner is wired with the chaser factory (an uncached character build for the inspector),
   onRunEnd (the run's coins into the wallet), the purchased consumables (one per run) and the
   hoverboard ownership; H is the runner's power-up edge and the HUD shows the catch ('Caught at'),
   the near-miss pay, the multiplier and the hoverboard pill. The minimap (js/minimap.js) mounts on
   the #minimap slot and is updated every frame with the visitor, the chase yaw and the current
   target; M toggles it. The hoverboard (makeHoverboard) is drawn from player.board (trailing,
   riding with the drop-in glow, hidden when away) with the rider standing on the deck in pose
   'hover' (handle.leanZ and handle.airborne); the boats (makeBoat, one per state.boats entry,
   hull boards merged) stand in their docks, lie beached or carry the visitor in pose 'boat' with
   the wake animated. The water bodies gain the creek and the channel (surface -0.9 from
   terrain.water, their tiles from the raster) so the water plane, the docks and the player's
   water level agree. Hats and the board colour come from wallet.equipped. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as ALIENS from './aliens3d.js';
import * as ANIMALS from './animals3d.js';
import { buildLeisure, attachProp, detachProp, animateLeisure, createHighlightRing } from './leisure3d.js';
import { createPlayer } from './player.js';
import { buildInteriors, refreshBoards } from './interiors.js';
import * as GOLF from './golf.js';
import * as SUBWAY from './subway.js';
import * as LEADERBOARD from './leaderboard.js';
import * as CITYPLAN from './cityplan.js';
import { buildCity } from './city.js';
import { buildTerrain } from './terrain.js';
import { buildGround as buildGroundLayer, heightfieldGeometry as plainHeightfield } from './ground.js';
import { buildRoads } from './roads.js';
import { buildNature } from './nature.js';
import * as VEHICLES from './vehicles.js';
import { createWallet, itemById as walletItemById } from './wallet.js';
import { createShop } from './shop.js';
import { createMinimap } from './minimap.js';
import { buildStatue } from './statue.js';
import * as TOUCH from './touch.js';
import * as exec from './depts/exec.js';
import * as embedded from './depts/embedded.js';
import * as compliance from './depts/compliance.js';
import * as fcc from './depts/fcc.js';
import * as ops from './depts/ops.js';
import * as dataDept from './depts/data.js';
import * as credit from './depts/credit.js';
import * as finance from './depts/finance.js';
import * as tech from './depts/tech.js';
import * as risk from './depts/risk.js';
import * as marketing from './depts/marketing.js';
import * as people from './depts/people.js';

const DEPT_MODULES = { exec, embedded, compliance, fcc, ops, data: dataDept, credit, finance, tech, risk, marketing, people };

// CONTRACT: the aliens3d names are read through a namespace import so that an optional
// export missing from the sibling module degrades gracefully instead of failing module linking.
const { makeAlienMesh, animateAlien, ALIEN_HEIGHT } = ALIENS;
/* Aliens are scaled up from the art-bible proportions so they read from the whole-town view. */
const ALIEN_SCALE = 1.3;
const HEAD_Y = ALIEN_HEIGHT * ALIEN_SCALE;
const disposeAlien = typeof ALIENS.disposeAlien === 'function' ? ALIENS.disposeAlien
  : function (h) { if (h && h.group && h.group.parent) h.group.parent.remove(h.group); };
const makeAlienPortraitScene = typeof ALIENS.makeAlienPortraitScene === 'function' ? ALIENS.makeAlienPortraitScene : null;
const setAlienNight = typeof ALIENS.setAlienNight === 'function' ? ALIENS.setAlienNight : null;
const setAlienOpacity = typeof ALIENS.setAlienOpacity === 'function' ? ALIENS.setAlienOpacity : function () {};
/* CONTRACT_V3 "Renderer integration": animal characters for departments with characters === 'animals'.
   Read through the namespace so a missing export degrades to aliens instead of breaking module linking. */
const makeAnimalMesh = typeof ANIMALS.makeAnimalMesh === 'function' ? ANIMALS.makeAnimalMesh : null;
const animateAnimal = typeof ANIMALS.animateAnimal === 'function' ? ANIMALS.animateAnimal : function () {};
const setAnimalOpacity = typeof ANIMALS.setAnimalOpacity === 'function' ? ANIMALS.setAnimalOpacity : function () {};
const disposeAnimal = typeof ANIMALS.disposeAnimal === 'function' ? ANIMALS.disposeAnimal
  : function (h) { if (h && h.group && h.group.parent) h.group.parent.remove(h.group); };
const speciesForName = typeof ANIMALS.speciesForName === 'function' ? ANIMALS.speciesForName : function () { return null; };
const ANIMAL_SPECIES = Array.isArray(ANIMALS.SPECIES) ? ANIMALS.SPECIES : [];
// Night driver for animal materials, the counterpart of setAlienNight (animals3d scales envMapIntensity itself).
const setAnimalNight = typeof ANIMALS.setAnimalNight === 'function' ? ANIMALS.setAnimalNight : null;

const TT = window.TT;
/* v7: the sim is a classic script and the plan an ES module, so the renderer hands the plan over
   before the map size is read (TT.sim.COLS resolves the plan on first access). v10: the sim also
   rasterizes through the cityplan helpers, so the module namespace goes over as TT.cityplan. */
if (!TT.cityplan) TT.cityplan = CITYPLAN;
if (!TT.PLAN) TT.PLAN = CITYPLAN.PLAN;
/* Map size comes from the simulation (v10: 192 by 144 from the plan). */
const COLS = TT.sim.COLS, ROWS = TT.sim.ROWS;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function lerpAngle(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }

const NAVY = '#002D4F', AQUA = '#75CCD0', SALMON = '#E7706F', SILVER = '#E2E9EE';
const TARGET = new THREE.Vector3(COLS / 2, 0, ROWS / 2);
/* Default view: polar angle from vertical and azimuth from +z (south). A higher camera fills the frame with the map. */
const VIEW_POLAR = 0.78, VIEW_AZIMUTH = 0.42;
const DEFAULT_DIR = new THREE.Vector3(Math.sin(VIEW_POLAR) * Math.sin(VIEW_AZIMUTH), Math.cos(VIEW_POLAR), Math.sin(VIEW_POLAR) * Math.cos(VIEW_AZIMUTH));
const FIT_MARGIN = 0.985;
const FIT_TARGET = new THREE.Vector3().copy(TARGET);   // view target after centering the projected map in the frame
const SUN_DIR = new THREE.Vector3(-0.45, 0.70, 0.55).normalize();
const FILL_DIR = new THREE.Vector3(0.60, 0.50, -0.62).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const BENCH_SEAT_Y = 0.42, STOOL_SEAT_Y = 0.45;
/* Camera focus distances as fractions of the fit distance (CONTRACT_V2 "Camera"). */
const FOCUS_AGENT = 0.32, FOCUS_DEPT = 0.42, MIN_ZOOM = 0.3, MAX_ZOOM = 2.5;

/* ---------- day/night keyframes (day, dusk, night) ---------- */
const col3 = (a, b, c) => [new THREE.Color(a), new THREE.Color(b), new THREE.Color(c)];
/* v10: ACES at exposure 1.0 by day; the grade lives in the key light colors (a slightly warmer
   sun and sky by day, a cooler blue cast at night) since the renderer has no post pass. */
const KF = {
  sunColor: col3('#FFF0D2', '#FFC487', '#7389C0'), sunI: [2.5, 1.6, 0.30],
  hemiSky: col3('#D3E6F2', '#8E8FBF', '#182C58'), hemiGround: col3('#A3B27C', '#9B7A6E', '#0C1628'), hemiI: [1.0, 0.75, 0.45],
  fillColor: col3('#E2E9F2', '#B9A2C4', '#2A467A'), fillI: [0.35, 0.20, 0.08],
  skyTop: col3('#7FBCE8', '#3E5C8E', '#04122B'), skyMid: col3('#ABD4EC', '#B98BA0', '#0B2347'), skyHor: col3('#E8EEEE', '#E6B79E', '#1B3F6B'),
  exposure: [1.0, 0.98, 0.9],
};
function kf(arr, s) { return s < 0.5 ? lerp(arr[0], arr[1], s * 2) : lerp(arr[1], arr[2], (s - 0.5) * 2); }
function kfc(out, arr, s) { return s < 0.5 ? out.lerpColors(arr[0], arr[1], s * 2) : out.lerpColors(arr[1], arr[2], (s - 0.5) * 2); }

/* ---------- module state ---------- */
let container = null, renderer = null, scene = null, camera = null, controls = null, overlay = null, canvasEl = null;
let fitCam = null, fitDistance = 100, viewW = 1, viewH = 1, maxAniso = 1;
let sun = null, fill = null, hemi = null, fog = null;
let skyCanvas = null, skyCtx = null, skyTex = null, lastSkyS = -1;
let nightS = 0, lastEnvS = -1, envFailed = false;
let waterMat = null, waterMesh = null, rippleTex = null, fountainWaterMat = null;
let stars = null, starsMat = null;
let bulbMat = null, poolMat = null, poolMesh = null;
const lampLights = [];
let fountain = null;
let leisure = null;            // { group, update, lights } from leisure3d
let statue = null;             // v14: the founder's statue { group, update, near, frontPos, open, close, isOpen } from statue.js
let city = null;               // v7: { group, update, lights, lightBase, glass } from city.js
/* v10: the blended ground (js/ground.js), the road ribbons (js/roads.js), the nature layer
   (js/nature.js), the interaction highlight ring, the water bodies and the quality mode. */
let ground = null;             // buildGround result: { mesh, material, update, setNight, weightsAt }
let roads = null;              // buildRoads result: { group, update, meshes, stats }
let nature = null;             // buildNature result: { group, update, counts, drawCalls }
let hiRing = null;             // createHighlightRing result: { mesh, target, clear, update }
let waterBodies = [];          // [{ id, kind, surface, pts | center, halfWidth }] from the plan and terrain.water
let sunFar = null;             // the far shadow cascade: a second directional light over the whole map
const SHADOW_RES = { high: { near: 4096, far: 2048 }, balanced: { near: 2048, far: 0 }, phone: { near: 1024, far: 0 } };
const SUN_SPLIT_NEAR = 0.62;   // the near light's share of the sun intensity when the far cascade is on
const QUALITY_KEY = 'threadtown.quality.v1';
let quality = 'high';          // 'high' | 'balanced' | 'phone' (TT.town.setQuality, the header select; v12 adds phone)
const shadowFit = { cx: NaN, cz: NaN, r: 0 };   // the near cascade's last bound (re-fit when the focus moves)
let aoGroup = null;            // the building base ambient occlusion decals (one merged mesh)
let flagShadowMesh = null;     // the flag pole shadows (one merged mesh)
let birds = null;              // { mesh, n, active, t, dur, from, to, next, phase }
let ballStreak = null, ballTrail = null, puffs = null;   // golf extras (ballStreak mesh, trail line, puff sprite pool)
const trailPts = [];           // the long trail's recent ball positions
const BALL_TRAIL_N = 48;
const prevBallAir = new WeakMap();   // ball record -> was airborne last frame (the landing puff edge)
const promptFade = { shown: false, hideAt: -1, armed: false };   // the prompt pill fade state
let closeUntil = -1;           // v10 subway: the 'Close!' pulse end time (hud.nearMiss)
/* v8 (CONTRACT_V8 "Terrain"): the heightmap from js/terrain.js, built after the sim and before the
   world. Every placement reads it through hAt (bilinear height) and the characters, trees and the
   cart through its normal. A failed build falls back to a flat field so the town still renders. */
let terrain = null;            // { cols, rows, heights, heightAt, slopeAt, normalAt, lotHeight }
let cartRec = null;            // v8: the makeCart result drawn from player.cart, built on first use
const cartN = new THREE.Vector3(0, 1, 0);   // the cart's eased terrain normal (10 per second)
const CART_SEAT_TOP = VEHICLES.CART && VEHICLES.CART.SEAT ? VEHICLES.CART.SEAT.y - 0.12 : 0.6;   // the seat cushion center in the cart frame
const CART_TILT_RATE = 10;
/* v9: the scooters (VEHICLES.SCOOTER numbers, with fallbacks so a missing export degrades). */
const SCOOT_N = VEHICLES.SCOOTER || {};
const SCOOT_DECK = isFinite(SCOOT_N.DECK_Y) ? SCOOT_N.DECK_Y : 0.12;          // feet on the deck
// the agents' steer visual inverts the controller's bicycle model, so it uses the steering base
const SCOOT_WB = isFinite(SCOOT_N.STEER_BASE) ? SCOOT_N.STEER_BASE : isFinite(SCOOT_N.WHEELBASE) ? SCOOT_N.WHEELBASE : 0.64;
const SCOOT_STEM = isFinite(SCOOT_N.STEM) ? SCOOT_N.STEM : 0.58;
const SCOOT_STEER_MAX = isFinite(SCOOT_N.STEER_MAX) ? SCOOT_N.STEER_MAX : 0.5;
// the body stands between the two feet (SCOOTER.FEET front and back z), on the back half of the deck
const SCOOT_FEET_Z = SCOOT_N.FEET && isFinite(SCOOT_N.FEET.front) && isFinite(SCOOT_N.FEET.back) ? (SCOOT_N.FEET.front + SCOOT_N.FEET.back) / 2 : -0.13;
const SCOOT_COLORS = [NAVY, SALMON, SILVER];   // frame color by state.scooters[i].v (navy, salmon, silver)
const SCOOT_NEAR = 35, SCOOT_FAR = 110;   // full detail and shadows inside NEAR, the bare frame past FAR
const SCOOT_GLIDE = 2.5;                  // a parked scooter whose spot moved less than this glides there
const scooterRecs = new Map();            // scooter id -> { m, id, v, x, z, yaw, n, lod, sets, placed, ridden }
const scooterPool = [];                   // recs whose scooter left state.scooters, reused by variant
let scooterStamp = 0;                    // v14: one stamp per syncScooters pass, written on the recs it placed (rec.seen)
let cinematic = false;
let fontsReady = false;
let rafId = 0, lastTs = 0;
let growClock = 0.5;           // "Buildings grow with the team" sampling clock (0.5 s); starts due so the first frame samples

const matRegistry = [];
const matCache = new Map();
const seenMats = new Set();
const buildingRecs = [];       // dept and cafe records, see buildDept and buildCafe
const deptRecById = new Map(); // dept id -> building record
const buildingGroupList = [];  // department groups (and station groups) for picking
const agentRecs = new Map();   // id -> agent record, see makeAgentRec
let agentGroupList = [];
let agentStamp = 0;            // v14: one stamp per syncAgents pass, written on the recs it drew (rec.seen)
let shadowMat = null;

/* camera animation and follow */
let camAnim = null;            // { t0, dur, fromT, toT, fromD, toD, fromDir, toDir }
let camClock = 0;
let followId = null;

/* walk mode (CONTRACT_V4): the player object from js/player.js and its rendered character */
let player = null;             // createPlayer(ctx) result, also TT.player
let playerRec = null;          // { handle, shadow, animate, setOpacity, dispose, propKind, specKey, station, ... }
let walkOn = false;
let prevCamMode = 'orbit';     // camera mode to restore when walk mode ends (v12.1: orbit only; the free camera code stays but is never selected)
let pointerLocked = false;
let savedFov = 28, savedNear = 1;
const WALK_FOV = 68, WALK_NEAR = 0.08;

/* version 5 (CONTRACT_V5 "Renderer integration"): interiors, golf, the inside look, the view blend */
let interiors = null;          // buildInteriors result: { group, rooms, update }
let golf = null;               // buildGolf result: { group, holes, range, update, ballPool, ... }
let insideRoom = null;         // the Room the renderer currently shows the visitor inside, or null
const insideBg = new THREE.Color();
let stationFade = 0;           // overlay opacity for the 0.3 s fade of an enter 'inside' station
let avatarsOk = false;         // portraits may be rendered on demand for the room portrait walls
const VIEW_BLEND = 0.35;       // seconds the camera eases between poses on a view change
const camFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3(), t0: 0, on: false };
let camKey = '';               // 'chase' | 'ball': which pose the walk camera showed last frame
const INSIDE_FOG_NEAR = 10, INSIDE_FOG_FAR = 40;
const INSIDE_SUN = 0.06, INSIDE_HEMI = 0.3, INSIDE_FILL = 0.1;
const STATION_FADE = 0.3;
const CLUB_LEN = { driver: 1.05, iron: 0.9, putter: 0.78 };
const AIM_N = 36, AIM_MAX = 18;   // v10: dots along the carry arc
const clubProps = {};          // club kind -> Group (built once, re-parented to handL)
let aimLine = null, aimRing = null, golfFlash = null, flashUntil = -1;

/* version 6 (CONTRACT_V6 "Renderer integration", "Leaderboard"): the subway runner and the leaderboard */
const createSubwayGame = typeof SUBWAY.createSubwayGame === 'function' ? SUBWAY.createSubwayGame : null;
const createLeaderboard = typeof LEADERBOARD.createLeaderboard === 'function' ? LEADERBOARD.createLeaderboard : null;
let subway = null;             // createSubwayGame result, built on the first entry
let gameMode = null;           // 'subway' while the runner owns the view, else null
let subwayPhase = null;        // null | 'out' | 'in': the overlay fade around a scene switch
let subwayPhaseT0 = 0, subwayFade = 0, subwayPending = null;   // pending 'enter' | 'leave', applied when the 'out' fade completes
let subwayRunT = 0, subwayDeadT = 0, subwayGoT = -1, subwayRank = null, subwayLastState = '';
let subwayGroup = null;        // the entrance geometry (static, merged)
let subExt = null;             // headless input from TT.town.setSubwayInput (edges consumed after one frame)
let runnerCh = null;           // the runner character handed to the game: { key, handle, dispose }
const runnerAnimators = new WeakMap();   // handle -> animateAlien or animateAnimal
let leaderboard = null;        // createLeaderboard result
const scoreboards = [];        // scoreboard sign records, see makeScoreboard
let scoreboardFonts = null;
let golfRank = null, golfDoneSeen = false;
const SUB = { left: false, right: false, jump: false, duck: false, restart: false, quit: false, hover: false };   // game keys (v11: hover, H)
// v12: the swipes and the tap go through to the game as they are (js/subway.js maps them)
const subInput = { left: false, right: false, jump: false, duck: false, restart: false, quit: false, hover: false, swipeLeft: false, swipeRight: false, swipeUp: false, swipeDown: false, tap: false };
const SUBWAY_PROMPT = { text: 'Take the subway', key: 'E', full: 'E  Take the subway' };
const SUBWAY_FADE = 0.35;      // seconds for each half of the fade around the scene switch
const PLAYER_RADIUS = 0.28;    // js/player.js RADIUS: the visitor's collision square
const MOUTH_HW = 0.65, MOUTH_N = -0.78, MOUTH_S = 0.82;   // the stairwell opening, relative to the footprint center
const PU_LABEL = { magnet: 'Magnet', double: 'Double coins', jet: 'Jet', shield: 'Shield' };
/* The localStorage wrapper shared by the game (threadtown.subway.v1) and the leaderboard
   (threadtown.leaderboard.v1): plain objects in, JSON in storage, null when anything fails. */
const townStorage = {
  get(key) {
    try { const raw = window.localStorage.getItem(key); return raw === null || raw === undefined ? null : JSON.parse(raw); } catch (e) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  },
};
/* The raw string storage the minimap remembers its toggle and zoom in (getItem and setItem). */
const rawStorage = {
  getItem(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
  setItem(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } },
};

/* ---------- version 11 (CONTRACT_V11 "Renderer integration") ---------- */
let wallet = null;             // createWallet(townStorage), also TT.wallet
let shop = null;               // createShop result, also TT.shop
let minimap = null;            // createMinimap result on the #minimap slot
let minimapMount = null;       // the #minimap slot (hidden attribute toggled with the view)
let hoverRec = null;           // { m, color }: the makeHoverboard mesh drawn from player.board
const boatRecs = new Map();    // boat id -> { m, id, kind, small, far }: one makeBoat mesh per state.boats entry
let boatStamp = 0;             // v14: one stamp per syncBoats pass, written on the recs it placed (rec.seen)
let boatsSynced = -1;          // frameNo of the last syncBoats, so the rider and the boat agree within a frame
let frameNo = 0;
let waterwayIdx = null;        // tile -> waterBodies index + 1 for the creek and channel tiles, 0 elsewhere
const chaserChs = [];          // the runner's chaser characters (kept for the session)
const KIOSK_PROMPT = { text: 'Shop', key: 'E', full: 'E  Shop' };
const KIOSK_REACH = 1.5;
const STATUE_PROMPT = { text: 'Read the plaque', key: 'E', full: 'E  Read the plaque' };   // v14
const _kf = { x: 0, y: 0 };    // kioskFrontPos scratch
const mmView = { x: 0, z: 0, yaw: Math.PI, target: null, mode: 'walk', time: 0 };   // the minimap view, reused
const mmTarget = { x: 0, z: 0 };
/* ---------- version 13 (CONTRACT_V13 "Waypoints and directions") ----------
   The waypoint the open map sets (through minimap.onWaypoint), the route the sim's path finder
   gives (tile centres plus the waypoint itself, reused records) and the HUD line under the prompt
   pill (#walk-waypoint, built here when index.html has none). Every call into the minimap's v13
   API (openMap, closeMap, isOpen, setWaypoint, setRoute, onWaypoint) is guarded so a map without
   it never throws. */
const WP = { x: 0, z: 0, set: false };                 // the waypoint (world x, z), set while a pin is down
const ROUTE_PTS = [];                                  // the route: { x, z } records reused between recomputes (the pool is never truncated)
const ROUTE_OUT = [];                                  // the live view of ROUTE_PTS (the first routeN records) handed to the minimap
let routeN = 0;                                        // how many of ROUTE_PTS are live
let routeTileX = -1, routeTileZ = -1, routeAt = -Infinity, routeOk = false, routeBoat = false;
let routeToPin = false;                                // the route's last point is the pin itself (its last leg crosses land alone)
let routeEndX = -1, routeEndZ = -1;                    // the tile a route that stops short of the pin ends on (kept across recomputes)
const ROUTE_MIN_GAP = 0.5;                             // at most twice a second
const ROUTE_MOVE = 2;                                  // recomputed once the visitor is this far (tiles) from the computed tile
const ROUTE_NEAR = 6;                                  // the nearest tile the sim walks within this of the waypoint
const WP_REACH = 1.5;                                  // within this many tiles the waypoint clears with 'You are here'
const WP_AHEAD = 3;                                    // the bearing reads the route point this many tiles ahead
const M_PER_TILE = 9;                                  // 10 yards per tile
const WP_HERE_LEN = 2.0;                               // 'You are here' stays this long (seconds)
const M_HOLD = 0.4;                                    // M held this long opens the map
const WP_HUD_ID = 'walk-waypoint';
let wpEl = null, wpTextEl = null, wpArrowEl = null;    // the HUD line, its text span and its arrow
const wpState = { text: '', deg: 9999, hidden: true, hereUntil: -1, m: -1, word: '', line: '' };   // m, word, line: the last directions line and what it was built from
let mapOpenFlag = false;                               // our own view of the map (the minimap's isOpen wins when it exists)
let mHoldAt = -1, mHoldOpened = false;                 // the M key held (wall clock ms), and whether the hold opened the map
let boatParent = null, boatQueue = null;               // the boat route BFS scratch (allocated on first use)
const _rt = { x: 0, z: 0 };                            // nearest tile scratch
const HOVER_N = VEHICLES.HOVER || {};
const HOVER_FEET_Y = HOVER_N.FEET && isFinite(HOVER_N.FEET.y) ? HOVER_N.FEET.y : 0.07;   // the rider's feet on the deck top
const BOAT_N = VEHICLES.BOAT || {};
const BOAT_SEAT_DEF = { x: 0, y: 0.12, z: -0.5 };
const BOAT_DUCK = 0.48;   // v14: how far the rider sinks into the hull under a bridge deck
let boatDuck = 0;
const BOAT_FAR = 110;          // beyond this the boats drop their oars, motor and tiller
let subwayHoverUsed = false;   // the runner's hoverboard power-up seen active this run (the H hint hides)
let closePay = 0;              // the near-miss pay shown on the 'Close!' flash
let runnerHoverEl = null;      // the hoverboard pill in the runner HUD (built on first use; false when it cannot be)
let runnerTitleEl = null;      // the summary card's title (h3), resolved on first use

/* ---------- version 12 (CONTRACT_V12 "Detection", "Wiring") ----------
   The touch layer (js/touch.js) is read through a namespace import so a missing export degrades to
   no touch controls. isTouch is evaluated once (a test may force it through TT.isTouch before this
   module loads); touchLive says whether the controls are up right now: at once on a coarse pointer,
   on a laptop with a touchscreen only after the first touchstart on the view and off again after a
   mouse move. The html 'touch' class follows touchLive. Nothing below changes when isTouch is false. */
const createTouch = typeof TOUCH.createTouch === 'function' ? TOUCH.createTouch : null;
const touchForced = typeof TT.isTouch === 'boolean' ? TT.isTouch : null;
const touchCoarse = touchForced !== null ? touchForced : (() => {
  try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !!window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
})();
const isTouch = touchForced !== null ? touchForced : (touchCoarse || (() => {
  try { return typeof navigator !== 'undefined' && (navigator.maxTouchPoints | 0) > 0; } catch (e) { return false; }
})());
TT.isTouch = isTouch;
let touch = null;              // createTouch result: { el, read(out), active, setMode(mode), vibrate(ms), destroy() }
let touchMount = null;         // the mount div over the view the layer lives on
let touchLive = false;         // the controls are up (see above)
let touchKey = '';             // the last mode handed to touch.setMode (plus the hoverboard ownership)
const TOUCH_MODE_OPTS = { hover: false, hoverOwned: false };   // the flags handed to touch.setMode (hover: the H button shows)
/* The preallocated read target: touch.read(TOUCH_IN) fills it every frame and clears its edges. */
const TOUCH_IN = { fwd: 0, side: 0, run: false, jump: false, jumpHeld: false, interact: false, hover: false, boost: false, drive: false, toggleView: false, map: false, club: false, quit: false,
  lookDX: 0, lookDY: 0, zoom: 0, swipeLeft: false, swipeRight: false, swipeUp: false, swipeDown: false, tap: false };
const TOUCH_SLOP = 12, CLICK_SLOP = 4;   // a tap picks within 12 px, a mouse click within 4
let lastPointerType = 'mouse';
let rippleMesh = null;         // the water ripple mesh (off on the Phone tier)
const natureFull = new Map();  // InstancedMesh -> { count, matrix, color }: the full nature layer, restored when the tier goes back up
const PHONE_DENSITY = { 'trees-': 0.55, reeds: 0.55, logs: 0.55, 'grass-tufts': 0.3, 'flower-beds': 0.3, 'flower-blooms': 0.3 };
const PHONE_FOG = 0.85;        // the fog band a little nearer on the Phone tier
const PHONE_PIXEL_RATIO = 1.5;
/* The vibration edges: the visitor's hop landing, the hoverboard landing, holing out, the catch. */
const buzzState = { pose: '', hoverAir: false, golfPhase: '', subState: '' };

// scratch
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s3 = new THREE.Vector3();
const _box = new THREE.Box3();
const _q2 = new THREE.Quaternion(), _n = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3(), _ax = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/* ---------- terrain access (v8) ---------- */
const flatTerrain = {
  cols: COLS, rows: ROWS, heights: null,
  heightAt() { return 0; },
  slopeAt(x, z, out) { out = out || { x: 0, z: 0 }; out.x = 0; out.z = 0; return out; },
  normalAt(x, z, out) { out = out || { x: 0, y: 1, z: 0 }; out.x = 0; out.y = 1; out.z = 0; return out; },
  lotHeight() { return 0; },
  // v10 (terrain v2 surface): the slope class, the landform, the retaining walls and the water bodies
  slopeClassAt() { return 'flat'; },
  landformAt() { return 'none'; },
  retainingWalls: [],
  water: [],
};
/* Builds the heightmap for the plan the sim rasterized (seed TT.sim.terrainSeed, default 20261020). */
function buildTerrainField() {
  try {
    const seed = isFinite(TT.sim.terrainSeed) ? TT.sim.terrainSeed : undefined;
    terrain = buildTerrain({ plan: TT.sim.PLAN, state: TT.state, sim: TT.sim, seed });
    if (!terrain || typeof terrain.heightAt !== 'function') terrain = flatTerrain;
  } catch (e) { console.error('Thread Town: terrain failed to build; the town stays flat', e); terrain = flatTerrain; }
  return terrain;
}
/* The ground height under a world point (0 before the terrain exists or when it fails). */
function hAt(x, z) {
  if (!terrain) return 0;
  const h = terrain.heightAt(x, z);
  return isFinite(h) ? h : 0;
}
/* v10 final: how far the road ribbon or sidewalk slab under a point stands above the terrain
   (roads.js surfaceLiftAt: 0.07 on a sidewalk tile, 0.03 on a road or stub mouth tile, 0.07 on
   a bridge deck, 0.03 on a path or cart path tile (v14), 0 elsewhere), so walkers stand on the
   slab instead of inside it. */
function liftAt(x, z) {
  const d = dockLiftAt(x, z);
  if (!roads || typeof roads.surfaceLiftAt !== 'function') return d;
  const v = roads.surfaceLiftAt(x, z);
  return isFinite(v) && v > d ? v : d;
}
/* v14: the marina dock's planks (city.js: from 0.3 behind the shore tile's centre to the dock's
   end, one tile wide, the top 0.1 over the record's y) stand over the lake bed and the bank, so
   a walker on them stands on the plank top, not on the bed under the water. How far that top is
   above the terrain under a point; 0 off the dock. */
function dockLiftAt(x, z) {
  const m = city && city.group ? city.group.userData.marina : null;
  if (!m || !m.dir || !isFinite(m.y) || !isFinite(m.length)) return 0;
  const dx = x - m.x, dz = z - m.z, a = dx * m.dir.x + dz * m.dir.z, b = dx * m.dir.z - dz * m.dir.x;
  if (a < -0.3 || a > m.length - 0.3 || b < -0.5 || b > 0.5) return 0;
  const d = m.y + 0.1 - hAt(x, z);
  return d > 0 ? d : 0;
}
/* The unit normal under a world point into out (a Vector3), up when there is no terrain. */
function nAt(x, z, out) {
  out.set(0, 1, 0);
  if (!terrain || typeof terrain.normalAt !== 'function') return out;
  terrain.normalAt(x, z, out);
  if (!isFinite(out.x) || !isFinite(out.y) || !isFinite(out.z) || out.lengthSq() < 1e-9) out.set(0, 1, 0);
  return out;
}
/* The plateau of a building record's lot (the renderer lifts the whole group by it). */
function lotY(b) {
  if (!terrain || typeof terrain.lotHeight !== 'function') return 0;
  let h = 0;
  try { h = terrain.lotHeight(b); } catch (e) { h = 0; }
  if (!isFinite(h)) h = b && isFinite(b.x) && isFinite(b.y) ? hAt(b.x + (b.w || 0) / 2, b.y + (b.h || 0) / 2) : 0;
  return h;
}
/* A quaternion tilting the up axis toward the normal n by a fraction k, capped at cap radians;
   identity when the surface is level. */
function tiltQuat(out, n, k, cap) {
  _t.set(n.x * k, 1 - k + n.y * k, n.z * k).normalize();
  const ang = Math.acos(clamp(_t.y, -1, 1));
  if (ang < 1e-5) return out.identity();
  _ax.crossVectors(UP, _t).normalize();
  return out.setFromAxisAngle(_ax, Math.min(ang, cap === undefined ? Math.PI : cap));
}

/* ---------- small helpers ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function roundRectPath(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' + Math.round(lerp(A[1], B[1], t)) + ',' + Math.round(lerp(A[2], B[2], t)) + ')';
}
function makeTex(cv, opts) {
  const o = opts || {};
  const t = new THREE.CanvasTexture(cv);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.anisotropy = Math.min(8, maxAniso);
  t.wrapS = t.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return t;
}
function radialTex(size, rgba) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return makeTex(c, { srgb: false });
}
function reg(mat, env) { mat.envMapIntensity = env; matRegistry.push({ mat, env }); seenMats.add(mat); return mat; }
/* Registers every MeshStandardMaterial under a group once so the night pass can scale envMapIntensity.
   Dept and leisure modules store their intended value in material.userData.envMapIntensity. */
function registerGroupMaterials(group) {
  group.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m || !m.isMeshStandardMaterial || seenMats.has(m)) continue;
      const e = m.userData && m.userData.envMapIntensity !== undefined ? m.userData.envMapIntensity : 0.25;
      reg(m, e);
    }
  });
  lastEnvS = -1;
}
function std(color, roughness, metalness, env, side) {
  const key = color + '|' + roughness + '|' + (metalness || 0) + '|' + (side || 0);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: metalness || 0 });
    if (side !== undefined) m.side = side;
    reg(m, env === undefined ? 0.25 : env);
    matCache.set(key, m);
  }
  return m;
}
function geoBox(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function geoCyl(rt, rb, h, seg, x, y, z) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return g; }
function geoSphere(r, ws, hs, x, y, z) { const g = new THREE.SphereGeometry(r, ws, hs); g.translate(x, y, z); return g; }
function merge(list) { const g = BufferGeometryUtils.mergeGeometries(list, false); for (const s of list) s.dispose(); return g; }
function mesh(geo, mat, parent, cast, receive) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast !== false; m.receiveShadow = receive !== false;
  if (parent) parent.add(m);
  return m;
}
function tileRng(x, y) { return TT.rng(TT.hash(x + ',' + y)); }
function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

/* ---------- lot frames (CONTRACT_V7 "Lots and rotation", CONTRACT_V10 "The plan v3") ----------
   Every lot is laid out in its canonical frame (origin at the canonical north-west tile, the door on
   the south face) and turned into the world by rot, any number of degrees clockwise seen from above,
   about the lot center. rotOff is cityplan's rotVec on a (dx, dz) offset: 90 turns canonical south
   (0, 1) into east (1, 0), 180 into north, 270 into west, and any angle in between is the general
   rotation (dx cos + dz sin, -dx sin + dz cos). A three.js rotation.y of rot degrees is the same
   map, so a group built in the canonical frame needs rotation.y = rot * DEG and its position set
   to the world point of its canonical origin. */
function rotOff(rot, dx, dz) {
  const r = ((rot % 360) + 360) % 360;
  if (r === 0) return { x: dx, z: dz };
  if (r === 90) return { x: dz, z: -dx };
  if (r === 180) return { x: -dx, z: -dz };
  if (r === 270) return { x: -dz, z: dx };
  const c = Math.cos(r * DEG), s = Math.sin(r * DEG);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}
/* The world center of a building record: the mean of its exact footprint corners (v10 records at
   any angle), else the center of its bounding box. */
function recCenter(b, out) {
  const v = out || { x: 0, y: 0 };
  const c = b && b.corners;
  if (Array.isArray(c) && c.length === 4 && isFinite(c[0][0])) {
    v.x = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4; v.y = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
  } else { v.x = b.x + (b.w || 0) / 2; v.y = b.y + (b.h || 0) / 2; }
  return v;
}
/* World point of a canonical lot-local point (lx, lz) of a building record's lot. Records without a
   lot frame (an older sim) are already in world tiles, so the point is returned as is. */
function lotPoint(b, lx, lz, out) {
  const v = out || new THREE.Vector3();
  const lot = b.lot;
  if (!lot || !lot.center) return v.set(lx, 0, lz);
  const o = rotOff(lot.rot || 0, lx - lot.cw / 2, lz - lot.ch / 2);
  return v.set(lot.center.x + o.x, 0, lot.center.y + o.z);
}
/* The record a building module builds from: the canonical-frame fields (x, y, w, h, door, station,
   workPos and friends from b.local) over the world record, so offsets such as door.x - x + 1 are the
   canonical ones and the module builds exactly as it does for an unrotated lot. */
function canonicalRecord(b) {
  if (!b.local) return b;
  return Object.assign({}, b, b.local, { rot: 0 });
}
/* Canonical lot-local tile of a world tile (the inverse of the sim's toTile), for lot-aligned paint. */
function lotLocalTile(lot, x, y) {
  const rot = lot.rot || 0;
  const o = rotOff(-rot, x + 0.5 - lot.center.x, y + 0.5 - lot.center.y);
  return { x: Math.floor(lot.cw / 2 + o.x), y: Math.floor(lot.ch / 2 + o.z) };
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function distToLine(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, distToSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

/* ---------- shared materials ---------- */
let M = null;
function buildMaterials() {
  M = {
    trim: std('#F8F6F0', 0.80), plinth: std('#CFC6B6', 0.90), brass: std('#F6D463', 0.30, 0.6),
    navy: std(NAVY, 0.70), split: std('#0E2238', 0.70),
    stone: std('#B9C4CC', 0.85), lightStone: std('#CBD3DA', 0.85), wood: std('#A5774E', 0.80), darkWood: std('#6B4A2B', 0.80),
    iron: std('#2E3E50', 0.55, 0.2), tableTop: std('#FBF8F1', 0.70),
    cream: std('#F6E7C8', 0.90), salmonRoof: std(SALMON, 0.78), aquaDoor: std(AQUA, 0.60), skirt: std('#93AB71', 1.0),   // v14: the mean of the ground along the map edge
    chalk: std('#2E3E50', 0.80), flowerBox: std('#6B4A2B', 0.85),
    umbrellaS: std(SALMON, 0.85, 0, 0.25, THREE.DoubleSide), umbrellaW: std('#FFFFFF', 0.85, 0, 0.25, THREE.DoubleSide),
    jet: new THREE.MeshStandardMaterial({ color: '#DFF6F7', roughness: 0.2, transparent: true, opacity: 0.85 }),
    ringFx: new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  reg(M.jet, 0.6);
  bulbMat = reg(new THREE.MeshStandardMaterial({ color: '#FFF1C9', roughness: 0.35, emissive: '#FFE2A0', emissiveIntensity: 0.08 }), 0.6);
  waterMat = reg(new THREE.MeshStandardMaterial({ color: '#6CC3CB', roughness: 0.12, transparent: true, opacity: 0.82, emissive: '#0E4F58', emissiveIntensity: 0.12, depthWrite: false }), 0.6);
  fountainWaterMat = waterMat.clone(); fountainWaterMat.opacity = 0.85; reg(fountainWaterMat, 0.6);
  poolMat = new THREE.MeshBasicMaterial({ map: radialTex(128, 'rgba(255,210,122,1)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  shadowMat = new THREE.MeshBasicMaterial({ map: radialTex(64, 'rgba(0,20,40,0.35)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
}
function makeGlassMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#AFD6E4', roughness: 0.20, metalness: 0.05, emissive: '#FFD88A', emissiveIntensity: 0 });
  reg(m, 0.6); return m;
}
const awningCache = new Map();
function awningMat(accent) {
  let m = awningCache.get(accent);
  if (m) return m;
  const c = makeCanvas(512, 128), g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFFFFF' : accent; g.fillRect(i * 64, 0, 64, 128); }
  m = new THREE.MeshStandardMaterial({ map: makeTex(c), roughness: 0.92, side: THREE.DoubleSide });
  reg(m, 0.25); awningCache.set(accent, m); return m;
}

/* ---------- camera fit ---------- */
/* v10: the fit box spans the terrain range (the lake at -1.6 to the hill crest at +9 plus roofs). */
const FIT_CORNERS = [];
for (const x of [0, COLS]) for (const y of [-1.6, 11.0]) for (const z of [0, ROWS]) FIT_CORNERS.push(new THREE.Vector3(x, y, z));
const _fitRight = new THREE.Vector3(), _fitFwd = new THREE.Vector3();
/* Finds the camera distance that fits every map corner inside FIT_MARGIN of the frame, then shifts the
   ground target so the projected map is centered (a diagonal view otherwise leaves the far side empty).
   Writes the centered target into outTarget and returns the distance. */
function computeFit(aspect, outTarget) {
  fitCam.aspect = aspect; fitCam.updateProjectionMatrix();
  const target = outTarget.copy(TARGET);
  let dist = 100;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 30, hi = 500;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      fitCam.position.copy(target).addScaledVector(DEFAULT_DIR, mid);
      fitCam.lookAt(target); fitCam.updateMatrixWorld();
      let ok = true;
      for (const c of FIT_CORNERS) { _v.copy(c).project(fitCam); if (Math.abs(_v.x) > FIT_MARGIN || Math.abs(_v.y) > FIT_MARGIN) { ok = false; break; } }
      if (ok) hi = mid; else lo = mid;
    }
    dist = hi;
    fitCam.position.copy(target).addScaledVector(DEFAULT_DIR, dist);
    fitCam.lookAt(target); fitCam.updateMatrixWorld();
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const c of FIT_CORNERS) { _v.copy(c).project(fitCam); minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x); minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    if (Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002) break;
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(fitCam.fov / 2)), halfW = halfH * aspect;
    _fitRight.setFromMatrixColumn(fitCam.matrixWorld, 0); _fitRight.y = 0; _fitRight.normalize();
    _fitFwd.set(-DEFAULT_DIR.x, 0, -DEFAULT_DIR.z).normalize();
    // a screen-up shift of s is matched on the ground by s / cos(polar) along the horizontal view direction
    target.addScaledVector(_fitRight, cx * halfW).addScaledVector(_fitFwd, cy * halfH / Math.cos(VIEW_POLAR));
    target.y = 0;
  }
  return dist;
}

function resize() {
  if (!renderer) return;
  const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
  viewW = w; viewH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const oldFit = fitDistance;
  const untouched = controls.target.distanceToSquared(FIT_TARGET) < 1e-4;
  fitDistance = computeFit(camera.aspect, FIT_TARGET);
  const ratio = clamp(camera.position.distanceTo(controls.target) / oldFit, MIN_ZOOM, MAX_ZOOM);
  _v.subVectors(camera.position, controls.target).setLength(ratio * fitDistance);
  if (untouched) controls.target.copy(FIT_TARGET);   // the user has not panned, so keep the map centered
  camera.position.copy(controls.target).add(_v);
  applyZoomLimits();
  applyFog();
  if (subway) subway.resize(w, h);   // v6: the runner camera follows the stage size
}
/* v10: distance haze tuned to the bigger map. The fog band follows the camera's distance to its
   target: at the overview it starts just past the map so the far districts soften, and down on
   the ground (walking, riding) it starts about 80 units out so the far hills and the bluff
   recede into the sky color. Inside a room the room's own fog stays. */
function applyFog() {
  if (!fog || insideRoom || !camera || !controls) return;
  const D = Math.max(85, camera.position.distanceTo(controls.target)) * (quality === 'phone' ? PHONE_FOG : 1);   // v12: a little nearer on the Phone tier
  const near = 0.95 * D, far = 2.4 * D;
  if (Math.abs(fog.near - near) > 0.5 || Math.abs(fog.far - far) > 0.5) { fog.near = near; fog.far = far; }
}

function clampTarget() {
  if (camMode === 'free' || camMode === 'walk') return;
  const t = controls.target;
  const ox = t.x, oy = t.y, oz = t.z;
  t.x = clamp(t.x, 1, COLS - 1); t.z = clamp(t.z, 1, ROWS - 1); t.y = 0;
  camera.position.x += t.x - ox; camera.position.y += t.y - oy; camera.position.z += t.z - oz;
  // v8: the orbit camera stays 1.6 above the terrain under it
  const floor = hAt(camera.position.x, camera.position.z) + 1.6;
  if (camera.position.y < floor) camera.position.y = floor;
}

/* ---------- camera focus, follow, reset (CONTRACT_V2 "Camera") ---------- */
function startCamAnim(toTarget, toDist, dur, toDir) {
  const fromDir = _v.subVectors(camera.position, controls.target);
  const fromD = fromDir.length() || fitDistance;
  fromDir.normalize();
  camAnim = {
    t0: camClock, dur,
    fromT: controls.target.clone(), toT: toTarget.clone(),
    fromD, toD: toDist,
    fromDir: fromDir.clone(), toDir: toDir ? toDir.clone() : null,
  };
}
function agentRenderedPos(id, out) {
  const rec = agentRecs.get(id);
  if (rec) { out.set(rec.handle.group.position.x, 0, rec.handle.group.position.z); return true; }
  const a = TT.state.agents.find(x => x.id === id);
  if (a) { out.set(a.pos.x, 0, a.pos.y); return true; }
  return false;
}
function focusOn(kind, id) {
  if (!controls) return false;
  if (kind === 'agent') {
    if (!agentRenderedPos(id, _v2)) return false;
    startCamAnim(_v2, FOCUS_AGENT * fitDistance, 1.1, null);
    return true;
  }
  const rec = deptRecById.get(id);
  if (!rec) return false;
  const b = rec.b;
  // the target sits a little past the footprint center toward the door side (v7: any street)
  const fx = b.facing ? b.facing.x : 0, fz = b.facing ? b.facing.y : 1;
  _v2.set(b.x + b.w / 2 + fx * 1.5, 0, b.y + b.h / 2 + fz * 1.5);
  startCamAnim(_v2, FOCUS_DEPT * fitDistance, 1.1, null);
  return true;
}
function follow(id) {
  followId = id || null;
  if (followId && !TT.state.agents.some(a => a.id === followId)) followId = null;
  return followId;
}
/* The cinematic camera (board mode) orbits a little closer than the fit, so "default" follows it. */
function homeDistance() { return cinematic ? 0.85 * fitDistance : fitDistance; }
function resetView() {
  if (!controls) return;
  // In walk mode the player owns the camera; setWalkMode(false) calls resetView after restoring the mode.
  if (camMode === 'walk') return;
  followId = null;
  startCamAnim(FIT_TARGET, homeDistance(), 1.2, cinematic ? null : DEFAULT_DIR);
}
function isDefaultView() {
  if (!controls) return true;
  const d = camera.position.distanceTo(controls.target);
  const home = homeDistance();
  return Math.abs(d - home) <= 0.02 * home && controls.target.distanceTo(FIT_TARGET) <= 0.5;
}
function stepCamera(dt) {
  camClock += dt;
  // Walk mode: the player places the camera every frame; focus, follow and the cinematic orbit are off.
  if (camMode === 'walk') { camAnim = null; if (controls) controls.autoRotate = false; return; }
  if (camAnim) {
    const A = camAnim;
    const k = easeInOut(clamp((camClock - A.t0) / A.dur, 0, 1));
    controls.target.lerpVectors(A.fromT, A.toT, k);
    const d = lerp(A.fromD, A.toD, k);
    if (A.toDir) _v.lerpVectors(A.fromDir, A.toDir, k).normalize(); else _v.copy(A.fromDir);
    camera.position.copy(controls.target).addScaledVector(_v, d);
    if (k >= 1) camAnim = null;
  } else if (followId) {
    if (!agentRenderedPos(followId, _v2)) followId = null;
    else {
      const f = 1 - Math.exp(-dt * 6);
      _v.subVectors(_v2, controls.target).multiplyScalar(f);
      controls.target.add(_v); camera.position.add(_v);
    }
  }
  // Cinematic auto-rotate pauses while a focus animation runs and resumes afterward.
  controls.autoRotate = cinematic && !camAnim;
}

/* ---------- lights, sky, fog, environment ---------- */
function buildLights() {
  hemi = new THREE.HemisphereLight(KF.hemiSky[0], KF.hemiGround[0], KF.hemiI[0]);
  hemi.position.set(COLS / 2, 50, ROWS / 2);
  scene.add(hemi);

  // v10: the sun is the near shadow cascade (a camera-derived bound, sharp) and sunFar the far
  // one (the whole map, a smaller map spread over it so it reads soft); both share the direction
  // and the color and split the intensity, so a shadow inside the near bound is fully dark and one
  // beyond it keeps the far light's softer share. Balanced drops the far cascade.
  const res = SHADOW_RES[quality] || SHADOW_RES.high;
  sun = new THREE.DirectionalLight(KF.sunColor[0], KF.sunI[0]);
  sun.position.copy(TARGET).addScaledVector(SUN_DIR, 160);
  sun.target.position.copy(TARGET);
  sun.castShadow = true;
  sun.shadow.mapSize.set(res.near, res.near);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  sunFar = new THREE.DirectionalLight(KF.sunColor[0], 0);
  sunFar.position.copy(sun.position);
  sunFar.target.position.copy(TARGET);
  sunFar.castShadow = res.far > 0;
  sunFar.shadow.mapSize.set(res.far || 1024, res.far || 1024);
  sunFar.shadow.bias = -0.0006; sunFar.shadow.normalBias = 0.06;
  scene.add(sunFar); scene.add(sunFar.target);
  fitShadowBounds(sunFar, -1, COLS + 1, -1, ROWS + 1, -3, 24, 3);
  updateShadows(true);

  fill = new THREE.DirectionalLight(KF.fillColor[0], KF.fillI[0]);
  fill.position.copy(TARGET).addScaledVector(FILL_DIR, 100);
  fill.target.position.copy(TARGET);
  scene.add(fill); scene.add(fill.target);

  // sky gradient background
  skyCanvas = makeCanvas(2, 512); skyCtx = skyCanvas.getContext('2d');
  skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.minFilter = THREE.LinearFilter; skyTex.magFilter = THREE.LinearFilter; skyTex.generateMipmaps = false;
  scene.background = skyTex;
  fog = new THREE.Fog(KF.skyHor[0].getHex(), 1.3 * fitDistance, 3.0 * fitDistance);
  scene.fog = fog;
  applyFog();

  // environment reflections
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();
  } catch (e) { envFailed = true; KF.hemiI[0] = 1.15; }

  // stars
  const n = 240, pos = new Float32Array(n * 3), r = TT.rng(424242);
  const starR = Math.max(220, 3.2 * Math.max(COLS, ROWS));
  for (let i = 0; i < n; i++) {
    const az = r() * TAU, el = 0.25 + r() * 1.3;
    pos[i * 3] = TARGET.x + Math.cos(el) * Math.sin(az) * starR;
    pos[i * 3 + 1] = Math.sin(el) * starR + 20;
    pos[i * 3 + 2] = TARGET.z + Math.cos(el) * Math.cos(az) * starR;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starsMat = new THREE.PointsMaterial({ color: '#FFFFFF', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  stars = new THREE.Points(sg, starsMat); stars.visible = false; stars.frustumCulled = false;
  scene.add(stars);
}

/* Fits a directional light's orthographic shadow camera to the world box x0..x1, y0..y1, z0..z1
   (tight light-space bounds plus pad), with the bounds snapped to shadow texels so a moving
   bound does not make the shadow edges swim. */
const _inv = new THREE.Matrix4();
function fitShadowBounds(light, x0, x1, z0, z1, y0, y1, pad) {
  _m4.lookAt(light.position, light.target.position, UP); _m4.setPosition(light.position);
  _inv.copy(_m4).invert();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
    _v.set(x, y, z).applyMatrix4(_inv);
    minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x); minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
    minZ = Math.min(minZ, _v.z); maxZ = Math.max(maxZ, _v.z);
  }
  const c = light.shadow.camera, size = Math.max(1, light.shadow.mapSize.x);
  const w = maxX - minX + 2 * pad, h = maxY - minY + 2 * pad, texel = Math.max(w, h) / size;
  const left = Math.floor((minX - pad) / texel) * texel, bottom = Math.floor((minY - pad) / texel) * texel;
  c.left = left; c.right = left + Math.ceil(w / texel) * texel; c.bottom = bottom; c.top = bottom + Math.ceil(h / texel) * texel;
  c.near = Math.max(1, -maxZ - pad); c.far = -minZ + pad;
  c.updateProjectionMatrix();
}
/* v10: the near cascade follows the visitor. While walking its bound is a square about the
   visitor whose half width grows with the camera distance, clamped to the map, quantized so the
   fit only moves in steps. At the overview it covers the whole map (the far cascade then adds
   nothing new); on the ground it spends the map on the surroundings. force refits regardless
   of the quantized state. */
const _focus = new THREE.Vector3();
function updateShadows(force) {
  if (!sun || !camera) return;
  if (walkOn && player && player.pos) _focus.set(player.pos.x, hAt(player.pos.x, player.pos.y), player.pos.y);
  else if (controls) _focus.copy(controls.target);
  else _focus.copy(TARGET);
  const d = camera.position.distanceTo(_focus);
  const maxR = Math.hypot(COLS, ROWS) / 2 + 4;
  // v14: in the overview the bound stays on the whole map (a bound that followed the orbit target was
  // refit on every frame of a pan, and each refit changed the texel size where the map edge clamped it)
  const orbit = !(walkOn && player && player.pos);
  let r = orbit ? maxR : clamp(0.8 * d + 14, 26, maxR);
  r = Math.ceil(r / 8) * 8;
  const cx = orbit ? Math.round(COLS / 4) * 2 : Math.round(_focus.x / 2) * 2, cz = orbit ? Math.round(ROWS / 4) * 2 : Math.round(_focus.z / 2) * 2;
  if (!force && cx === shadowFit.cx && cz === shadowFit.cz && r === shadowFit.r) return;
  shadowFit.cx = cx; shadowFit.cz = cz; shadowFit.r = r;
  const x0 = Math.max(-1, cx - r), x1 = Math.min(COLS + 1, cx + r), z0 = Math.max(-1, cz - r), z1 = Math.min(ROWS + 1, cz + r);
  fitShadowBounds(sun, x0, x1, z0, z1, -3, 24, 2);
}
/* The quality mode (CONTRACT_V10 "Performance budget"): High keeps the near cascade at 4096 with
   the far cascade, the building base AO decals and the golf extras (streak, puff, birds);
   Balanced halves the near map and drops the rest. The choice persists in townStorage. */
function setQuality(mode) {
  mode = mode === 'balanced' || mode === 'phone' ? mode : 'high';
  const changed = mode !== quality;
  quality = mode;
  const res = SHADOW_RES[quality];
  if (sun) {
    if (sun.shadow.mapSize.x !== res.near) {
      sun.shadow.mapSize.set(res.near, res.near);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    updateShadows(true);
  }
  if (sunFar) {
    const on = res.far > 0;
    if (on && sunFar.shadow.mapSize.x !== res.far) { sunFar.shadow.mapSize.set(res.far, res.far); if (sunFar.shadow.map) { sunFar.shadow.map.dispose(); sunFar.shadow.map = null; } }
    sunFar.castShadow = on;
    if (on) fitShadowBounds(sunFar, -1, COLS + 1, -1, ROWS + 1, -3, 24, 3);
  }
  if (aoGroup) aoGroup.visible = quality === 'high';
  if (birds && quality !== 'high') { birds.active = false; birds.mesh.visible = false; }
  if (ballStreak && quality !== 'high') ballStreak.visible = false;
  // v12 (CONTRACT_V12 "Wiring"): the Phone tier thins the nature layer, drops the water ripples,
  // caps the pixel ratio at 1.5 and pulls the fog in (applyFog reads the tier)
  applyNatureDensity(quality === 'phone');
  if (rippleMesh) rippleMesh.visible = quality !== 'phone';
  applyPixelRatio();
  if (camera && controls) applyFog();
  lastEnvS = -1;
  if (changed) townStorage.set(QUALITY_KEY, quality);
  const sel = typeof document !== 'undefined' && document.getElementById ? document.getElementById('quality-mode') : null;
  if (sel && sel.value !== quality) sel.value = quality;
  return quality;
}
const QUALITY_OPTIONS = [['high', 'High'], ['balanced', 'Balanced'], ['phone', 'Phone']];
const QUALITY_TITLE = 'High: full shadows, the far cascade and the extras. Balanced: lighter shadows for integrated graphics. Phone: the lightest tier for a phone';
/* v12: the renderer's pixel ratio, capped at 2 (1.5 on the Phone tier); a change resizes the buffer. */
function applyPixelRatio() {
  if (!renderer || typeof renderer.setPixelRatio !== 'function') return;
  const dpr = (typeof window !== 'undefined' && isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
  const want = Math.min(dpr, quality === 'phone' ? PHONE_PIXEL_RATIO : 2);
  const have = typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : NaN;
  if (have === want) return;
  renderer.setPixelRatio(want);
  if (viewW > 1 && viewH > 1) renderer.setSize(viewW, viewH, false);
}
/* v12: the Phone tier keeps 55 percent of the trees (the forest cores, the sim's own trees, always
   stay), reeds and logs, and 30 percent of the tufts, beds and blooms; rocks stay. Each instanced
   mesh keeps its full matrices in natureFull so the tier can go back up; the kept instances are
   compacted to the front and count is lowered, so the draw calls stay and the instances drop. */
function phoneDensityFor(name) {
  for (const k in PHONE_DENSITY) { if (name === k || (k.endsWith('-') && name.startsWith(k))) return PHONE_DENSITY[k]; }
  return 1;
}
function applyNatureDensity(reduce) {
  if (!nature || !nature.group || !Array.isArray(nature.group.children)) return;
  let cores = null;
  if (reduce) {
    cores = new Set();
    for (const t of (TT.state && TT.state.trees) || []) if (t && isFinite(t.x) && isFinite(t.y)) cores.add((t.x | 0) + ',' + (t.y | 0));
  }
  for (const im of nature.group.children) {
    if (!im || !im.isInstancedMesh || !im.instanceMatrix) continue;
    const frac = phoneDensityFor(im.name || '');
    if (frac >= 1) continue;
    let rec = natureFull.get(im);
    if (!rec) { rec = { count: im.count, matrix: im.instanceMatrix.array.slice(0), color: im.instanceColor ? im.instanceColor.array.slice(0) : null }; natureFull.set(im, rec); }
    if (!reduce) {
      if (im.count === rec.count) continue;
      im.instanceMatrix.array.set(rec.matrix); im.instanceMatrix.needsUpdate = true;
      if (rec.color && im.instanceColor) { im.instanceColor.array.set(rec.color); im.instanceColor.needsUpdate = true; }
      im.count = rec.count;
      continue;
    }
    const n = rec.count, M = rec.matrix, want = Math.ceil(n * frac);
    const keep = [];
    const isCore = new Uint8Array(n);
    if (cores && im.name && im.name.startsWith('trees-')) {
      for (let i = 0; i < n; i++) { if (cores.has(Math.floor(M[i * 16 + 12]) + ',' + Math.floor(M[i * 16 + 14]))) { isCore[i] = 1; keep.push(i); } }
    }
    const rest = n - keep.length, wantRest = Math.max(0, want - keep.length);
    const fr = rest > 0 ? wantRest / rest : 0;
    // the rest thinned evenly by a golden ratio stride (deterministic, no clumps)
    for (let i = 0, j = 0; i < n; i++) { if (isCore[i]) continue; if (((j * 0.6180339887498949) % 1) < fr) keep.push(i); j++; }
    keep.sort((a, b) => a - b);
    if (keep.length === im.count && keep.length === n) continue;
    const A = im.instanceMatrix.array, C = rec.color && im.instanceColor ? im.instanceColor.array : null;
    for (let j = 0; j < keep.length; j++) {
      const i = keep[j];
      for (let k = 0; k < 16; k++) A[j * 16 + k] = M[i * 16 + k];
      if (C) { C[j * 3] = rec.color[i * 3]; C[j * 3 + 1] = rec.color[i * 3 + 1]; C[j * 3 + 2] = rec.color[i * 3 + 2]; }
    }
    im.count = keep.length;
    im.instanceMatrix.needsUpdate = true;
    if (C) im.instanceColor.needsUpdate = true;
  }
}
/* The instances the nature layer draws right now, by mesh name (tests and the console). */
function natureInstanceCounts() {
  const out = {};
  if (!nature || !nature.group) return out;
  for (const im of nature.group.children) if (im && im.isInstancedMesh) out[im.name || 'nature'] = im.count;
  return out;
}
/* The header control: a Quality select beside the Camera select, built here so index.html and
   ui.js stay untouched; the choice stored from an earlier session is applied first. v12: the select
   shows High, Balanced, Phone; Phone is the default on a touch device; a select already in the
   markup (the phone menu) is filled and wired here too. */
function installQualityControl() {
  const stored = townStorage.get(QUALITY_KEY);
  if (stored === 'balanced' || stored === 'high' || stored === 'phone') quality = stored;
  else if (touchCoarse) quality = 'phone';   // a coarse primary pointer (a phone); a touchscreen laptop keeps the laptop tier
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  let sel = document.getElementById ? document.getElementById('quality-mode') : null;
  if (sel) {
    if (sel.dataset && sel.dataset.ttWired === '1') return;
    const have = sel.options ? Array.from(sel.options).map(o => o.value) : [];
    if (QUALITY_OPTIONS.some(([v]) => !have.includes(v))) {
      sel.innerHTML = '';
      for (const [v, t] of QUALITY_OPTIONS) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
    }
    if (!sel.title) sel.title = QUALITY_TITLE;
    sel.value = quality;
    if (sel.dataset) sel.dataset.ttWired = '1';
    sel.addEventListener('change', ev => setQuality(ev.target.value));
    return;
  }
  const host = document.querySelector('header .controls');
  if (!host) return;
  const label = document.createElement('label');
  label.appendChild(document.createTextNode('Quality '));
  sel = document.createElement('select');
  sel.id = 'quality-mode'; sel.title = QUALITY_TITLE;
  for (const [v, t] of QUALITY_OPTIONS) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
  sel.value = quality;
  if (sel.dataset) sel.dataset.ttWired = '1';
  label.appendChild(sel);
  const anchor = document.getElementById('btn-add');
  if (anchor && anchor.parentNode === host) host.insertBefore(label, anchor); else host.appendChild(label);
  sel.addEventListener('change', ev => setQuality(ev.target.value));
}

function paintSky(s) {
  const g = skyCtx;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#' + kfc(_c, KF.skyTop, s).getHexString());
  gr.addColorStop(0.55, '#' + kfc(_c, KF.skyMid, s).getHexString());
  gr.addColorStop(1, '#' + kfc(_c, KF.skyHor, s).getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
  skyTex.needsUpdate = true;
  lastSkyS = s;
}

/* A flat, upward-facing quad set covering x0..x1 by z0..z1 at height y, with an optional rectangular
   hole (the subway stairwell, v6) and uvs from uvFn(x, z) -> [u, v]. The ground plane used to be one
   PlaneGeometry; this keeps its mapping (u = x / COLS, v = 1 - z / ROWS) while leaving the well open. */
function flatGeometry(x0, z0, x1, z1, y, hole, uvFn) {
  const rects = [];
  if (hole && hole.x0 > x0 && hole.x1 < x1 && hole.z0 > z0 && hole.z1 < z1) {
    rects.push([x0, z0, x1, hole.z0], [x0, hole.z1, x1, z1], [x0, hole.z0, hole.x0, hole.z1], [hole.x1, hole.z0, x1, hole.z1]);
  } else rects.push([x0, z0, x1, z1]);
  const pos = [], nrm = [], uv = [], idx = [];
  for (const [ax, az, bx, bz] of rects) {
    const base = pos.length / 3;
    for (const [x, z] of [[ax, az], [bx, az], [bx, bz], [ax, bz]]) {
      pos.push(x, y, z); nrm.push(0, 1, 0);
      const t = uvFn ? uvFn(x, z) : [0, 0];
      uv.push(t[0], t[1]);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/* The skirt: a ring from the map's edge vertices (at their heights) out to a square five map
   widths wide, dropping 3 below the edge, so the horizon continues the terrain instead of cutting it. */
function skirtGeometry() {
  const S = 5 * Math.max(COLS, ROWS), sx = COLS / 2, sz = ROWS / 2, DROP = 3;
  const X0 = sx - S / 2, X1 = sx + S / 2, Z0 = sz - S / 2, Z1 = sz + S / 2;
  const pos = [], idx = [];
  const add = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  // a quad from four vertex indices in ring order, wound so its face points up
  const quad = (a, b, c, d) => {
    const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2];
    const ny = (cx - ax) * (bz - az) - (cz - az) * (bx - ax);   // y of (b - a) x (c - a)
    if (ny >= 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  const strip = (n, inner, outer) => {
    const I = [], O = [];
    for (let k = 0; k <= n; k++) { const p = inner(k), q = outer(k); I.push(add(p[0], p[1], p[2])); O.push(add(q[0], q[1], q[2])); }
    for (let k = 0; k < n; k++) quad(I[k], I[k + 1], O[k + 1], O[k]);
  };
  strip(COLS, i => [i, hAt(i, 0), 0], i => [i, hAt(i, 0) - DROP, Z0]);
  strip(COLS, i => [i, hAt(i, ROWS), ROWS], i => [i, hAt(i, ROWS) - DROP, Z1]);
  strip(ROWS, j => [0, hAt(0, j), j], j => [X0, hAt(0, j) - DROP, j]);
  strip(ROWS, j => [COLS, hAt(COLS, j), j], j => [X1, hAt(COLS, j) - DROP, j]);
  for (const [cx, cz, ox, oz] of [[0, 0, X0, Z0], [COLS, 0, X1, Z0], [0, ROWS, X0, Z1], [COLS, ROWS, X1, Z1]]) {
    const h = hAt(cx, cz) - DROP;
    quad(add(cx, hAt(cx, cz), cz), add(cx, h, oz), add(ox, h, oz), add(ox, h, cz));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Uniform up normals: the long tilted quads otherwise shade as visible bands radiating from the map.
  const nrm = new Float32Array(pos.length);
  for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  // v14: world space uvs (x, z over the grass layer's repeat), the way the ground samples its layers
  const uv = new Float32Array(pos.length / 3 * 2);
  for (let k = 0, u = 0; k < pos.length; k += 3, u += 2) { uv[u] = pos[k] / SKIRT_REPEAT; uv[u + 1] = pos[k + 2] / SKIRT_REPEAT; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/* v14: the skirt wears the ground's own grass layer under a colour that brings the product to the
   material's colour (the mean of the ground along the map edge), so the edge reads as more grass with
   the same grain and not as a line. Without the blended ground the flat colour stays. */
const SKIRT_REPEAT = 4;   // world units per repeat of the grass layer (js/ground.js GROUND.repeat[0])
function textureSkirt(mat) {
  const tex = ground && ground.textures && ground.textures.layers ? ground.textures.layers[0] : null;
  const data = tex && tex.image ? tex.image.data : null;
  if (!data || !data.length || mat.map) return;
  const lin = new Float32Array(256);
  for (let v = 0; v < 256; v++) { const c = v / 255; lin[v] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += lin[data[i]]; g += lin[data[i + 1]]; b += lin[data[i + 2]]; }
  const n = data.length / 4;
  if (!(r > 0 && g > 0 && b > 0)) return;
  mat.color.setRGB(mat.color.r * n / r, mat.color.g * n / g, mat.color.b * n / b);
  mat.map = tex; mat.needsUpdate = true;
}
/* ---------- ground (v10: js/ground.js) ----------
   The painted tile texture, the lane markings, curbs, crosswalk zebras, bridge planks and the
   tree instancing of versions 5 to 9 are gone. The ground is the splat blended heightfield from
   js/ground.js (grass, dry grass, dirt, rock, sand, fairway, green and paving weighted per tile
   with the terrain's slope class on top), the roads are js/roads.js ribbons and the trees,
   rocks, tufts and reeds come from js/nature.js. The skirt below keeps the horizon. */
function buildGround() {
  const hole = subwayHole();
  try {
    ground = buildGroundLayer({ plan: TT.sim.PLAN, terrain: terrain || flatTerrain, state: TT.state, sim: TT.sim, THREE, hole, maxAniso });
    if (!ground || !ground.mesh) throw new Error('no ground mesh');
  } catch (e) {
    console.error('Thread Town: the blended ground failed to build; a plain heightfield stands in', e);
    ground = null;
    const geo = plainHeightfield(THREE, terrain || flatTerrain, COLS, ROWS, hole);
    const plain = new THREE.Mesh(geo, M.skirt);
    plain.name = 'ground'; plain.receiveShadow = true; plain.castShadow = true;
    scene.add(plain);
  }
  if (ground) {
    // the material scales its own envMapIntensity in setNight, so it is not registered twice
    seenMats.add(ground.material);
    scene.add(ground.mesh);
    ground.setNight(nightS);
  }
  if (ground) textureSkirt(M.skirt);
  const skirt = new THREE.Mesh(skirtGeometry(), M.skirt);
  skirt.name = 'skirt';
  // No shadows on the skirt: the far cascade draws long streaks across it at grazing angles.
  skirt.receiveShadow = false; skirt.castShadow = false;
  scene.add(skirt);
}

/* ---------- water (v10: one plane per body height) ----------
   The sim's water tiles are the river, the lake, the park pond and the course hazards; each body
   has its own surface height from terrain.water (river bed -1.4 with the surface at -0.7, lake
   -1.6 and -0.9; the pond lot is a plateau at 0 with its plane at 0.04 as before). A tile is
   classified by the plan's water records: inside the lake polygon, within the river ribbon, on
   the pond lot, else just above the terrain under it. One merged mesh carries every tile at its
   body's height (plus one ripple mesh), so the water costs two draw calls. */
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function collectWaterBodies() {
  waterBodies = [];
  waterwayIdx = null;
  const plan = TT.sim.PLAN, tw = (terrain && Array.isArray(terrain.water)) ? terrain.water : [];
  // the plan's bodies (the lake polygon, the river ribbon) are read first so the waterway index
  // below can leave them their own tiles; they are pushed after the waterways to keep the order
  const list = (plan && Array.isArray(plan.water)) ? plan.water : [];
  const planBodies = [];
  for (const w of list) {
    if (!w) continue;
    const rec = tw.find(t => t && t.id === w.id) || null;
    const kind = w.kind || (w.pts ? 'lake' : 'river');
    const surface = rec && isFinite(rec.surface) ? rec.surface : (kind === 'lake' ? -0.9 : kind === 'river' ? -0.7 : 0.04);
    planBodies.push({ id: w.id, kind, surface, pts: Array.isArray(w.pts) && w.pts.length >= 3 ? w.pts : null, center: Array.isArray(w.center) ? w.center : null, halfWidth: isFinite(w.halfWidth) ? w.halfWidth : 4, waterway: false, tiles: 0 });
  }
  // a tile whose center lies inside a plan body (the polygon, or the ribbon proper without the
  // margin waterBodyAt allows) stays that body's: the channel stamp reaches past the sill into
  // the river ribbon, and the river keeps one surface (-0.7) up to the sill at x = 89
  const claimedByPlan = (x, y) => {
    const cx = x + 0.5, cy = y + 0.5;
    for (const b of planBodies) {
      if (b.pts && pointInPoly(cx, cy, b.pts)) return true;
      if (b.center && distToLine(cx, cy, b.center) <= b.halfWidth) return true;
    }
    return false;
  };
  // v11 (V11_DESIGN "The creek", "The channel"): the waterways first, one body per waterway body
  // id (creek, channel) with its tiles from the raster (the stamped tiles, the ones under bridge
  // decks included) in a tile index that waterBodyAt tests before any polygon, since the creek
  // mouth lies inside the pond lot and the channel inside the lake polygon's reach; the surface
  // comes from terrain.water by body id (-0.9), else the plan's level
  const R = TT.sim.raster;
  const ways = R && Array.isArray(R.waterways) ? R.waterways : [];
  if (ways.length) {
    waterwayIdx = new Uint8Array(COLS * ROWS);
    const byBody = new Map();
    for (const w of ways) {
      if (!w) continue;
      const bodyId = w.body || w.id;
      let b = byBody.get(bodyId);
      if (!b) {
        const rec = tw.find(t => t && t.id === bodyId) || null;
        const surface = rec && isFinite(rec.surface) ? rec.surface : (isFinite(w.level) ? w.level : -0.9);
        b = { id: bodyId, kind: bodyId, surface, pts: null, center: null, halfWidth: 0, waterway: true, tiles: 0 };
        byBody.set(bodyId, b); waterBodies.push(b);
      }
      const idx = waterBodies.indexOf(b) + 1;
      const tiles = w.tiles;
      if (tiles && typeof tiles.forEach === 'function') {
        tiles.forEach(k => {
          const s = String(k), c = s.indexOf(',');
          const x = +s.slice(0, c), y = +s.slice(c + 1);
          if (x >= 0 && y >= 0 && x < COLS && y < ROWS && !claimedByPlan(x, y)) { waterwayIdx[y * COLS + x] = idx; b.tiles++; }
        });
      } else if (w.mask && w.mask.length === COLS * ROWS) {
        for (let i = 0; i < w.mask.length; i++) if (w.mask[i] && !claimedByPlan(i % COLS, (i / COLS) | 0)) { waterwayIdx[i] = idx; b.tiles++; }
      }
    }
  }
  for (const b of planBodies) waterBodies.push(b);
}
/* The water body under a world point, or null: a creek or channel tile first, then the lake
   polygon, then the river ribbon. */
function waterBodyAt(x, z) {
  if (waterwayIdx) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (tx >= 0 && tz >= 0 && tx < COLS && tz < ROWS) { const i = waterwayIdx[tz * COLS + tx]; if (i) return waterBodies[i - 1]; }
  }
  for (const b of waterBodies) if (b.pts && pointInPoly(x, z, b.pts)) return b;
  for (const b of waterBodies) if (b.center && distToLine(x, z, b.center) <= b.halfWidth + 3) return b;
  return null;
}
/* The water surface height at a world point: the body's surface, 0.04 on the pond lot, else a
   little above the terrain (a hazard the plan does not list). city.js reads it for the boats. */
function waterLevelAt(x, z) {
  const b = waterBodyAt(x, z);
  if (b) return b.surface;
  const lot = typeof TT.sim.lotAt === 'function' ? TT.sim.lotAt(Math.floor(x), Math.floor(z)) : null;
  if (lot && lot.kind === 'pond') return 0.04;
  return hAt(x, z) + 0.3;
}
function buildWater() {
  const tiles = TT.state.waterTiles.slice();
  if (!tiles.length) return;
  collectWaterBodies();
  // v10 final: the terrain keeps the water under every bridge deck (no causeway), so the plane
  // also covers the bridge tiles whose ground lies under a water body's surface
  const HF = terrain && terrain.heights && isFinite(terrain.cols) ? terrain.heights : null;
  for (const b of TT.state.bridges || []) for (const t of b.tiles || []) {
    const body = waterBodyAt(t.x + 0.5, t.y + 0.5);
    if (!body) continue;
    let low = !HF;
    if (HF) { const W = terrain.cols + 1; for (const [i, j] of [[t.x, t.y], [t.x + 1, t.y], [t.x, t.y + 1], [t.x + 1, t.y + 1]]) if (HF[j * W + i] < body.surface) low = true; }
    if (low) tiles.push({ x: t.x, y: t.y });
  }
  const mk = lift => {
    const list = tiles.map(t => {
      const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2);
      p.translate(t.x + 0.5, waterLevelAt(t.x + 0.5, t.y + 0.5) + lift, t.y + 0.5);
      return p;
    });
    const g = merge(list);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
    return g;
  };
  waterMesh = new THREE.Mesh(mk(0), waterMat);
  waterMesh.name = 'water';
  waterMesh.receiveShadow = true; waterMesh.castShadow = false;
  scene.add(waterMesh);

  const c = makeCanvas(256, 256), g = c.getContext('2d');
  const r = TT.rng(777);
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = 0.12 + r() * 0.23;
    g.strokeStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; g.lineWidth = 3 + r() * 4;
    g.beginPath();
    const cx = r() * 256, cy = r() * 256, rad = 14 + r() * 40, st = r() * TAU;
    if (r() < 0.6) g.arc(cx, cy, rad, st, st + 0.6 + r() * 1.2); else g.ellipse(cx, cy, 6 + r() * 10, 3 + r() * 5, r() * TAU, 0, TAU);
    g.stroke();
  }
  rippleTex = makeTex(c, { srgb: false, repeat: true });
  rippleTex.center.set(0.5, 0.5);
  const rippleMat = new THREE.MeshBasicMaterial({ map: rippleTex, color: '#FFFFFF', transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false });
  const ripple = new THREE.Mesh(mk(0.012), rippleMat);
  ripple.name = 'ripples';
  ripple.castShadow = false; ripple.receiveShadow = false;
  ripple.visible = quality !== 'phone';   // v12: off on the Phone tier
  rippleMesh = ripple;
  scene.add(ripple);
}

/* ---------- roads (v10: js/roads.js) ---------- */
/* A canvas texture painter for roads.js (its markings, zebras and planks) through the shared
   makeTex settings (sRGB, mipmaps, anisotropy). */
function canvasTexFor(w, h, draw) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  return makeTex(c);
}
function buildRoadMeshes() {
  try {
    roads = buildRoads({ plan: TT.sim.PLAN, terrain: terrain || flatTerrain, state: TT.state, sim: TT.sim, raster: TT.sim.raster, THREE, canvasTex: canvasTexFor });
  } catch (e) { console.error('Thread Town: the roads failed to build', e); roads = null; return; }
  if (!roads || !roads.group) { roads = null; return; }
  registerGroupMaterials(roads.group);
  scene.add(roads.group);
}

/* ---------- nature (v10: js/nature.js) ----------
   Forests, clusters, street trees, rocks, tufts, flower beds, reeds and logs as instanced meshes
   (the sim's trees stay the collision layer and are drawn as the forest cores). */
function buildNatureLayer() {
  try {
    const seed = isFinite(TT.sim.terrainSeed) ? TT.sim.terrainSeed : undefined;
    nature = buildNature({ plan: TT.sim.PLAN, terrain: terrain || flatTerrain, state: TT.state, sim: TT.sim, seed, THREE });
  } catch (e) { console.error('Thread Town: the nature layer failed to build', e); nature = null; return; }
  if (!nature || !nature.group) { nature = null; return; }
  registerGroupMaterials(nature.group);
  scene.add(nature.group);
  applyNatureDensity(quality === 'phone');   // v12: the Phone tier thins the layer from the start
}

/* ---------- building base ambient occlusion decals (v10 "General") ----------
   A soft dark band on the ground around every department, cafe and clubhouse footprint (the
   exact rotated corners), darkest against the wall and clear 0.9 out, mitred at the corners so
   the strips meet without overlap. One merged mesh; hidden on Balanced. */
function buildAoDecals() {
  const geoms = [];
  const W = 0.9;
  for (const rec of buildingRecs) {
    const b = rec.b;
    let corners = Array.isArray(b.corners) && b.corners.length === 4 ? b.corners : null;
    if (!corners) corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    // outward normals per edge (the corners run clockwise seen from above, so the outward side is the left of the travel direction in x, z)
    const n = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], c = corners[(i + 1) % 4];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz) || 1;
      n.push([-dz / L, dx / L]);
    }
    // the mean corner decides the sign: the normal must point away from the center
    const cx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4, cz = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], mx = (a[0] + corners[(i + 1) % 4][0]) / 2 - cx, mz = (a[1] + corners[(i + 1) % 4][1]) / 2 - cz;
      if (n[i][0] * mx + n[i][1] * mz < 0) { n[i][0] = -n[i][0]; n[i][1] = -n[i][1]; }
    }
    const plateau = isFinite(rec.plateau) ? rec.plateau : hAt(cx, cz);
    for (let i = 0; i < 4; i++) {
      const a = corners[i], c = corners[(i + 1) % 4], ni = n[i], np = n[(i + 3) % 4], nn = n[(i + 1) % 4];
      // mitred outer corners: offset by both adjacent normals
      const oa = [a[0] + (ni[0] + np[0]) * W, a[1] + (ni[1] + np[1]) * W];
      const oc = [c[0] + (ni[0] + nn[0]) * W, c[1] + (ni[1] + nn[1]) * W];
      const g = new THREE.BufferGeometry();
      const ya = plateau + 0.02, yoa = Math.max(hAt(oa[0], oa[1]), plateau - 0.6) + 0.02, yoc = Math.max(hAt(oc[0], oc[1]), plateau - 0.6) + 0.02;
      g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], ya, a[1], c[0], ya, c[1], oc[0], yoc, oc[1], oa[0], yoa, oa[1]], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      geoms.push(g);
    }
  }
  if (!geoms.length) return;
  const cv = makeCanvas(64, 4), g2 = cv.getContext('2d');
  const gr = g2.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(0,20,40,0.55)'); gr.addColorStop(0.35, 'rgba(0,20,40,0.22)'); gr.addColorStop(1, 'rgba(0,20,40,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 64, 4);
  const tex = makeTex(cv, { srgb: false });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.fog = true;
  aoGroup = new THREE.Group(); aoGroup.name = 'ao-decals';
  const m = new THREE.Mesh(merge(geoms), mat);
  m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; m.userData.noMerge = true;
  aoGroup.add(m);
  aoGroup.visible = quality === 'high';
  scene.add(aoGroup);
}

/* ---------- buildings ---------- */
function hipRoofGeo(cx, cz, hw, hd, y0, y1, rl) {
  const v = [];
  const P = (x, y, z) => v.push(x, y, z);
  // south slope
  P(cx - hw, y0, cz + hd); P(cx + hw, y0, cz + hd); P(cx + rl, y1, cz);
  P(cx - hw, y0, cz + hd); P(cx + rl, y1, cz); P(cx - rl, y1, cz);
  // north slope
  P(cx + hw, y0, cz - hd); P(cx - hw, y0, cz - hd); P(cx - rl, y1, cz);
  P(cx + hw, y0, cz - hd); P(cx - rl, y1, cz); P(cx + rl, y1, cz);
  // east end
  P(cx + hw, y0, cz + hd); P(cx + hw, y0, cz - hd); P(cx + rl, y1, cz);
  // west end
  P(cx - hw, y0, cz - hd); P(cx - hw, y0, cz + hd); P(cx - rl, y1, cz);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/* A box on a wall face. face: S, N, E, W. u runs along the wall, n is the outward offset. */
function faceBox(face, cx, cz, wallZS, wallZN, wallXE, wallXW, u, y, n, w, h, d) {
  if (face === 'S') return geoBox(w, h, d, cx + u, y, wallZS + n);
  if (face === 'N') return geoBox(w, h, d, cx - u, y, wallZN - n);
  if (face === 'E') return geoBox(d, h, w, wallXE + n, y, cz + u);
  return geoBox(d, h, w, wallXW - n, y, cz - u);
}

function makeWindows(parent, cx, cz, wallZS, wallZN, wallXE, wallXW, glassMat, spec) {
  // spec: [{ face, u, cy, gw, gh }]
  const trim = [], glass = [];
  for (const w of spec) {
    const gw = w.gw || 0.55, gh = w.gh || 0.75, fw = gw + 0.12, fh = gh + 0.12;
    const fb = (u, y, n, bw, bh, bd) => faceBox(w.face, cx, cz, wallZS, wallZN, wallXE, wallXW, u, y, n, bw, bh, bd);
    glass.push(fb(w.u, w.cy, 0.015, gw, gh, 0.05));
    trim.push(fb(w.u, w.cy, 0.0, fw, fh, 0.05));
    trim.push(fb(w.u, w.cy, 0.05, gw, 0.04, 0.02));
    trim.push(fb(w.u, w.cy - fh / 2 - 0.025, 0.03, fw + 0.08, 0.05, 0.10));
  }
  mesh(merge(trim), M.trim, parent);
  mesh(merge(glass), glassMat, parent);
}

function makeAwning(parent, cx, wallZ, width, yWall, yOuter, depth, mat, shadeMat) {
  const drop = yWall - yOuter, zExt = Math.sqrt(Math.max(0.01, depth * depth - drop * drop));
  const canvasMesh = mesh(new THREE.BoxGeometry(width, 0.05, depth), mat, parent);
  canvasMesh.position.set(cx, (yWall + yOuter) / 2, wallZ + zExt / 2);
  canvasMesh.rotation.x = Math.asin(drop / depth);
  const valance = mesh(new THREE.BoxGeometry(width, 0.12, 0.02), mat, parent);
  valance.position.set(cx, yOuter - 0.06, wallZ + zExt);
  if (shadeMat) {
    const rodLen = Math.hypot(yOuter - 1.1, zExt);
    for (const sx of [-1, 1]) {
      const rod = mesh(new THREE.CylinderGeometry(0.02, 0.02, rodLen, 8), shadeMat, parent, true, false);
      rod.position.set(cx + sx * (width / 2 - 0.05), (yOuter + 1.1) / 2, wallZ + zExt / 2);
      rod.rotation.x = Math.atan2(zExt, yOuter - 1.1);
    }
  }
}

function makePlaque(text, accent, wide, big) {
  const cw = big ? 1120 : 800, ch = big ? 300 : 220;
  const cv = makeCanvas(cw, ch), ctx = cv.getContext('2d');
  const tex = makeTex(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
  mat.fog = false;
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 10;
  return { sprite, mat, tex, canvas: cv, ctx, text, accent, count: -1, active: null, fonts: null, baseW: wide ? 4.5 : 3.2, baseH: wide ? 1.2 : 0.9, big };
}

function paintPlaque(sign, count, active) {
  const g = sign.ctx, cw = sign.canvas.width, ch = sign.canvas.height;
  g.clearRect(0, 0, cw, ch);
  g.fillStyle = 'rgba(0,45,79,0.94)'; roundRectPath(g, 12, 12, cw - 24, ch - 24, 48); g.fill();
  g.strokeStyle = 'rgba(226,233,238,0.20)'; g.lineWidth = 2; roundRectPath(g, 15, 15, cw - 30, ch - 30, 45); g.stroke();
  const maxW = sign.big ? 1000 : 700;
  let size = sign.big ? 150 : 130;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let tw;
  for (;;) {
    g.font = '600 ' + size + 'px Kanit, Inter, sans-serif';
    tw = g.measureText(sign.text).width;
    if (tw <= maxW || size <= 60) break;
    size -= 4;
  }
  const nameBase = sign.big ? 165 : 150;
  g.fillStyle = '#FFFFFF'; g.fillText(sign.text, cw / 2, nameBase);
  g.fillStyle = sign.accent; g.fillRect(cw / 2 - tw * 0.3, nameBase + 21, tw * 0.6, 8);
  if (sign.big) {
    const label = count === 1 ? '1 agent' : count + ' agents';
    g.font = '500 84px Inter, sans-serif'; g.textAlign = 'left';
    const lw = g.measureText(label).width;
    const total = lw + (active ? 58 : 0);
    const x0 = cw / 2 - total / 2;
    if (active) { g.fillStyle = SALMON; g.beginPath(); g.arc(x0 + 14, 268 - 30, 14, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(226,233,238,0.85)'; g.fillText(label, x0 + (active ? 58 : 0), 268);
  }
  sign.tex.needsUpdate = true;
}

/* Re-measures the building's bounding box and parks the sign one unit above its top (CONTRACT_V2). */
function measureSign(rec) {
  rec.group.updateMatrixWorld(true);
  _box.setFromObject(rec.group);
  const top = isFinite(_box.max.y) ? _box.max.y : 6;
  rec.sign.sprite.position.y = top + 1.0;
  rec.measuredScale = rec.scale;
}

/* A department building from its dept module: the building group at (b.x, 0, b.y), the activity
   group at (station.x, 0, station.y), the sign sprite above the measured roof, and the record the
   per-frame code drives (glass, lights, scale, phase, worker). */
/* ---------- static merge pass ----------
   Department modules build hundreds of small meshes (window frames, panes, columns, railings). The
   module's update functions are probed for a few simulated seconds to find the parts that actually
   move, change visibility or swap materials; every other mesh is merged per material into one draw
   call. Materials stay shared, so material-level animation (lit glass, glowing screens) keeps working. */
function probeFakeAlien() {
  const g = new THREE.Group();
  const parts = { handR: new THREE.Object3D(), handL: new THREE.Object3D(), body: new THREE.Object3D(), head: new THREE.Object3D(), ring: new THREE.Object3D() };
  g.add(parts.handR, parts.handL, parts.body, parts.head, parts.ring);
  parts.handR.position.set(0.3, 0.6, 0.1); parts.handL.position.set(-0.3, 0.6, 0.1); parts.head.position.y = 0.9;
  return { group: g, parts, swingPhase: 0, sipPhase: 0, poseState: {} };
}
/* The snapshot: every mesh's world matrix, visibility and material, plus every object's local
   matrix (v10: so a mesh that only moves with a rigid ancestor can be told from one that moves
   itself). The map's .locals holds the object matrices. */
function snapshotMeshes(root) {
  const map = new Map();
  const locals = new Map();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    locals.set(o, o.matrix.toArray());
    if (o.isMesh && !o.isInstancedMesh) map.set(o, { m: o.matrixWorld.toArray(), v: o.visible, mat: o.material });
  });
  map.locals = locals;
  return map;
}
function matrixMoved(a, elements) {
  if (!a) return true;
  for (let i = 0; i < 16; i++) if (Math.abs(elements[i] - a[i]) > 1e-5) return true;
  return false;
}
function changedSince(root, before) {
  const dyn = new Set();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const s = before.get(o);
    if (!s || s.v !== o.visible || s.mat !== o.material) { dyn.add(o); return; }
    if (matrixMoved(s.m, o.matrixWorld.elements)) dyn.add(o);
  });
  return dyn;
}
/* v10 (CONTRACT_V10 "Performance budget"): dynamic meshes that did not move on their own (their
   local matrix, visibility and material held) but ride on a moving ancestor (a zoo animal, a
   crane arm, a swinging sign) are merged per material under that ancestor, so a rig of a dozen
   boxes costs one draw call and still moves as a unit. Meshes whose own transform, visibility
   or material changed stay as they are. Returns the merge counts. */
function mergeMovers(root, before, dyn) {
  const locals = before.locals;
  if (!locals) return { before: 0, after: 0 };
  const buckets = new Map();
  root.updateMatrixWorld(true);
  for (const o of dyn) {
    if (!o.isMesh || o.isInstancedMesh || hiddenInTree(o, root)) continue;
    if (Array.isArray(o.material) || o.userData.noMerge || o.renderOrder !== 0 || o.morphTargetInfluences) continue;
    const s = before.get(o);
    if (!s || s.v !== o.visible || s.mat !== o.material) continue;
    if (matrixMoved(locals.get(o), o.matrix.elements)) continue;
    let mover = null;
    for (let p = o.parent; p && p !== root; p = p.parent) { if (matrixMoved(locals.get(p), p.matrix.elements)) { mover = p; break; } }
    if (!mover) continue;
    const g = o.geometry;
    if (!g || !g.attributes.position) continue;
    const key = mover.uuid + '|' + o.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (g.index ? 'i' : 'n') + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
    let bk = buckets.get(key);
    if (!bk) { bk = { mover, material: o.material, meshes: [] }; buckets.set(key, bk); }
    bk.meshes.push(o);
  }
  let nBefore = 0, nAfter = 0;
  for (const bk of buckets.values()) {
    if (bk.meshes.length < 2) continue;
    _inv.copy(bk.mover.matrixWorld).invert();
    const geoms = bk.meshes.map(o => o.geometry.clone().applyMatrix4(_m4.multiplyMatrices(_inv, o.matrixWorld)));
    let merged = null;
    try { merged = BufferGeometryUtils.mergeGeometries(geoms, false); } catch (e) { merged = null; }
    for (const g of geoms) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, bk.material);
    m.castShadow = bk.meshes[0].castShadow; m.receiveShadow = bk.meshes[0].receiveShadow;
    m.userData.merged = true;
    bk.mover.add(m);
    for (const o of bk.meshes) if (o.parent) o.parent.remove(o);
    nBefore += bk.meshes.length; nAfter += 1;
  }
  return { before: nBefore, after: nAfter };
}
/* True when the object or any ancestor up to root is hidden: a hidden group's children keep their own
   visible flag, and a merge would otherwise lift them into a visible mesh at the root. */
function hiddenInTree(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return true;
  return false;
}
function mergeStatic(root, dyn) {
  const buckets = new Map();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || dyn.has(o) || hiddenInTree(o, root)) return;
    if (Array.isArray(o.material) || o.userData.noMerge || o.renderOrder !== 0 || o.morphTargetInfluences) return;
    const g = o.geometry;
    if (!g || !g.attributes.position) return;
    const key = o.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (g.index ? 'i' : 'n') + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
    let bk = buckets.get(key);
    if (!bk) { bk = { material: o.material, meshes: [] }; buckets.set(key, bk); }
    bk.meshes.push(o);
  });
  let before = 0, after = 0;
  // v10: the merged geometry lives in the root's local space (the root used to sit at the origin;
  // the fountain and the small buildings are merged in place)
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  for (const bk of buckets.values()) {
    if (bk.meshes.length < 2) continue;
    const geoms = bk.meshes.map(o => o.geometry.clone().applyMatrix4(rel.multiplyMatrices(rootInv, o.matrixWorld)));
    let merged = null;
    try { merged = BufferGeometryUtils.mergeGeometries(geoms, false); } catch (e) { merged = null; }
    for (const g of geoms) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, bk.material);
    m.castShadow = bk.meshes[0].castShadow; m.receiveShadow = bk.meshes[0].receiveShadow;
    m.userData.merged = true;
    root.add(m);
    for (const o of bk.meshes) if (o.parent) o.parent.remove(o);
    before += bk.meshes.length; after += 1;
  }
  return { before, after };
}
/* Probe a building's update, then merge. The group must still sit at the origin (local space). */
/* The static merge plus the mover merge (v10), summed. */
function mergeAll(root, snap) {
  const dyn = changedSince(root, snap);
  const a = mergeStatic(root, dyn);
  const b = mergeMovers(root, snap, dyn);
  return { before: a.before + b.before, after: a.after + b.after };
}
function mergeBuilding(built) {
  try {
    const snap = snapshotMeshes(built.group);
    if (built.update) for (let i = 0; i < 90; i++) built.update(1 / 30, 1000 + i * 0.23, i % 2 ? 0.85 : 0.0, i >= 45);
    return mergeAll(built.group, snap);
  } catch (e) { console.warn('Thread Town: merge skipped for a building', e); return { before: 0, after: 0 }; }
}
/* Probe an activity idle and working (with a fake alien), then merge. */
function mergeActivity(act) {
  try {
    const fake = probeFakeAlien();
    const snap = snapshotMeshes(act.group);
    for (let i = 0; i < 150; i++) {
      const working = i >= 30 && i < 120;
      act.update(1 / 30, 2000 + i * 0.17, { working, t: ((i - 30) % 90) / 30 * 5 }, working ? fake : null, working);
    }
    return mergeAll(act.group, snap);
  } catch (e) { console.warn('Thread Town: merge skipped for an activity', e); return { before: 0, after: 0 }; }
}
/* v10: the leisure dressing (terrace, pier, pond props) merges the same way after a probe of its update. */
function mergeLeisureProps() {
  if (!leisure || !leisure.group) return;
  try {
    const snap = snapshotMeshes(leisure.group);
    for (let i = 0; i < 90; i++) leisure.update(1 / 30, 4000 + i * 0.21, i % 2 ? 0.85 : 0.0);
    const s = mergeAll(leisure.group, snap);
    mergeStats.before += s.before; mergeStats.after += s.after;
  } catch (e) { console.warn('Thread Town: merge skipped for the leisure props', e); }
}
let mergeStats = { before: 0, after: 0 };
/* v10 (CONTRACT_V10 "Performance budget"): far proxies. A department building or station keeps
   its animated rig (a zoo of moving animals, a crane, a swing set) for the camera's surroundings;
   farther than BUILDING_FAR it is a few pixels, so the live group hides and a proxy shows: one
   merged mesh per material of everything under the group at its rest pose, built while the group
   still sits at the origin. Materials stay shared, so the glass glow and the screens keep working
   on the proxy. The proxy mirrors the group's transform (the buildings scale with the team).
   The swap is decided from the view rather than the camera's own distance: on the ground (walk
   mode) by the camera's distance to the building with BUILDING_FAR and BUILDING_NEAR; in orbit
   by the zoom (the pure overview, the camera farther than OVERVIEW_FAR of the fit from its
   target, shows every proxy) or by the orbit target's distance to the building with thresholds
   above the department focus distance (FOCUS_DEPT x fitDistance), so focusOn('dept'), the
   sidebar focus and a click always land on the live rig with its lights. */
const BUILDING_FAR = 100, BUILDING_NEAR = 88;
const OVERVIEW_FAR = 0.6, OVERVIEW_NEAR = 0.55;   // camera to target distance over the fit distance
const ORBIT_FAR_MIN = 0.5, ORBIT_HYST = 12;          // orbit: far past max(BUILDING_FAR, 0.5 x fit) from the target
/* Plain materials (no maps, opaque, no glow) are baked into vertex colors under one shared
   material per proxy, so a building with forty colors costs a few draw calls when far; glass,
   screens and decals keep their own materials so the night glow still reads. Any material with
   a non black emissive counts as glow whatever its intensity now: the department glass
   (depts/common glass(), emissive at intensity 0 by day) and the lamps are driven at night, and
   a baked copy would never light up. */
let proxyMat = null;
function isPlainMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.transparent || m.map || m.emissiveMap || m.alphaMap || m.vertexColors) return false;
  if (m.opacity !== undefined && m.opacity < 1) return false;
  if (m.side !== THREE.FrontSide) return false;
  if (m.emissive && (m.emissive.r > 0.001 || m.emissive.g > 0.001 || m.emissive.b > 0.001)) return false;
  return true;
}
/* keep: materials that must stay their own on the proxy whatever they look like (the building's
   glass list, whose emissive the renderer drives). */
function makeProxy(root, keep) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  if (!proxyMat) proxyMat = reg(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8, metalness: 0, vertexColors: true }), 0.25);
  const buckets = new Map();
  const keepList = Array.isArray(keep) ? keep : null;
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || hiddenInTree(o, root) || !o.visible) return;
    if (Array.isArray(o.material) || o.renderOrder !== 0 || o.morphTargetInfluences) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || !g.attributes.normal) return;
    const plain = !(keepList && keepList.includes(o.material)) && isPlainMaterial(o.material);
    const key = (plain ? 'plain' : o.material.uuid) + '|' + (plain ? 'pn' : Object.keys(g.attributes).sort().join(',')) + '|' + (g.index ? 'i' : 'n') + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
    let bk = buckets.get(key);
    if (!bk) { bk = { material: plain ? proxyMat : o.material, plain, meshes: [] }; buckets.set(key, bk); }
    bk.meshes.push(o);
  });
  const proxy = new THREE.Group();
  proxy.name = 'proxy'; proxy.visible = false;
  for (const bk of buckets.values()) {
    const geoms = bk.meshes.map(o => {
      let g = o.geometry.clone().applyMatrix4(_m4.multiplyMatrices(_inv, o.matrixWorld));
      if (bk.plain) {
        // position, normal and a baked color only, so every plain piece merges whatever uvs it had
        const n = g.attributes.position.count, col = new Float32Array(n * 3), c = o.material.color;
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        const slim = new THREE.BufferGeometry();
        slim.setAttribute('position', g.attributes.position);
        slim.setAttribute('normal', g.attributes.normal);
        slim.setAttribute('color', new THREE.BufferAttribute(col, 3));
        if (g.index) slim.setIndex(g.index);
        g = slim;
      }
      return g;
    });
    let merged = null;
    try { merged = BufferGeometryUtils.mergeGeometries(geoms, false); } catch (e) { merged = null; }
    for (const g of geoms) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, bk.material);
    m.castShadow = bk.meshes[0].castShadow; m.receiveShadow = bk.meshes[0].receiveShadow;
    m.userData.noMerge = true;
    proxy.add(m);
  }
  return proxy.children.length ? proxy : null;
}
function syncProxy(proxy, group) {
  if (!proxy) return;
  proxy.position.copy(group.position); proxy.quaternion.copy(group.quaternion); proxy.scale.copy(group.scale);
}

function buildDept(b) {
  const d = b.dept;
  const mod = DEPT_MODULES[d.id];
  if (!mod) { console.warn('Thread Town: no dept module for', d.id); return null; }
  // CONTRACT_V7: the module builds in the lot's canonical frame (door on the south face) from the
  // record's local fields; the groups then turn by b.rot about the lot center, which is the same as
  // turning them about the footprint center since both centers rotate together.
  const bl = canonicalRecord(b);
  const rot = b.rot || 0, ry = rot * DEG;
  const ctx = { THREE, b: bl, dept: d, design: '' };
  const built = mod.buildBuilding(ctx);
  const group = built.group;
  { const s = mergeBuilding(built); mergeStats.before += s.before; mergeStats.after += s.after; }
  const proxy = makeProxy(group, built.glass || null);   // v10: the far stand-in, built at the origin; the glass stays its own
  // the world point of the canonical footprint's north-west corner, and the rotation; v8: the
  // whole lot is a plateau, so the building, the station and the anchor are lifted by its height
  const plateau = lotY(b);
  const origin = lotPoint(b, bl.x, bl.y);
  origin.y = plateau;
  group.rotation.y = ry;
  group.position.copy(origin);
  const lights = built.lights || [];
  for (const l of lights) if (!l.parent) group.add(l);
  registerGroupMaterials(group);
  scene.add(group);

  const act = mod.buildActivity(ctx);
  { const s = mergeActivity(act); mergeStats.before += s.before; mergeStats.after += s.after; }
  const actProxy = makeProxy(act.group, act.glass || null);
  const sOrigin = lotPoint(b, bl.station.x, bl.station.y);
  sOrigin.y = plateau;
  act.group.rotation.y = ry;
  act.group.position.copy(sOrigin);
  registerGroupMaterials(act.group);
  scene.add(act.group);
  if (proxy) { syncProxy(proxy, group); scene.add(proxy); }
  if (actProxy) { syncProxy(actProxy, act.group); scene.add(actProxy); }
  // the anchor and the station yaw turn with the group
  const ao = rotOff(rot, act.anchor.x, act.anchor.z);
  const worldAnchor = new THREE.Vector3(sOrigin.x + ao.x, act.anchor.y + plateau, sOrigin.z + ao.z);
  const yaw = wrapAngle((act.yaw || 0) + ry);
  // the scale pivot: the door foot (door pair center on the south wall) in the rotated frame
  const pv = rotOff(rot, bl.door.x - bl.x + 1, bl.h);
  const label = act.label || mod.activityLabel;
  b.activityLabel = label;

  const rec = {
    b, group, isCafe: false, update: built.update, glassMats: built.glass || [], lights, lightBase: lights.map(l => l.intensity),
    sign: null, hoverT: 0, glowT: 0, scale: 1, scaleTarget: 1, measuredScale: 1,
    rot, origin, pivot: new THREE.Vector3(pv.x, 0, pv.z), plateau,
    activity: act, worldAnchor, yaw, pose: act.pose || 'work', enter: act.enter === 'inside' ? 'inside' : 'walk', label,
    phase: { working: false, t: 0 }, phaseAt: 0, worker: null, nextSlot: 0,
    proxy, actProxy, far: false,   // v10: the far stand-ins and whether they are showing
  };
  group.userData.pick = { kind: 'dept', rec };
  act.group.userData.pick = { kind: 'dept', rec };
  if (proxy) { proxy.userData.pick = group.userData.pick; buildingGroupList.push(proxy); }
  if (actProxy) { actProxy.userData.pick = group.userData.pick; buildingGroupList.push(actProxy); }

  rec.sign = makePlaque(d.name, d.accent, true, true);
  rec.sign.sprite.position.set(b.x + b.w / 2, 8 + plateau, b.y + b.h / 2);
  scene.add(rec.sign.sprite);
  measureSign(rec);

  buildingRecs.push(rec); deptRecById.set(d.id, rec);
  buildingGroupList.push(group, act.group);
  return rec;
}

/* The cafe stays a generic building (not a department); leisure3d dresses the terrace. The v5
   clubhouse (CONTRACT_V5 "Map v3") is the same small building in its own colors; golf.js dresses
   its porch. Both records carry isCafe so the per-frame building code treats them as generic. */
function buildCafe(b) {
  return buildSmallBuilding(b, { wall: M.cream, roof: M.salmonRoof, door: M.aquaDoor, awning: SALMON, name: b.name || 'Café', accent: AQUA, chalk: true });
}
function buildClubhouse(b) {
  const wall = std(b.wall || '#F3EFE6', 0.90), roof = std(b.roof || AQUA, 0.78);
  return buildSmallBuilding(b, { wall, roof, door: M.navy, awning: b.accent || SALMON, name: b.name || 'Clubhouse', accent: b.accent || SALMON, chalk: false });
}
function buildSmallBuilding(b, style) {
  // v7: built in the lot's canonical frame (b.local) and turned by b.rot about the lot center
  const L = b.local || b;
  const bx = L.x, bz = L.y, W = L.w, H = L.h;
  const cx = bx + W / 2, cz = bz + H / 2;
  const wallZS = bz + H - 0.15, wallZN = bz + 0.15, wallXE = bx + W - 0.15, wallXW = bx + 0.15;
  const group = new THREE.Group();
  const glassMat = makeGlassMat();
  const rec = { b, group, isCafe: true, update: null, glassMats: [glassMat], lights: [], lightBase: [], sign: null, hoverT: 0, glowT: 0, scale: 1, scaleTarget: 1, measuredScale: 1, activity: null };

  mesh(geoBox(W, 0.12, H, cx, 0.06, cz), M.plinth, group);
  const walls = mesh(new RoundedBoxGeometry(W - 0.3, 1.5, H - 0.3, 3, 0.06), style.wall, group); walls.position.set(cx, 0.87, cz);
  mesh(geoBox(W + 0.4, 0.10, H + 0.4, cx, 1.67, cz), M.trim, group);
  const hw = W / 2 + 0.2, hd = H / 2 + 0.2;
  mesh(hipRoofGeo(cx, cz, hw, hd, 1.72, 2.57, Math.max(0.5, hw - hd)), style.roof, group);

  // two-tile door centered on door.x + 1
  const dx = L.door.x + 1;
  mesh(geoBox(1.3, 1.25, 0.08, dx, 0.745, wallZS), style.door, group);
  mesh(geoBox(0.03, 1.25, 0.09, dx, 0.745, wallZS), M.split, group, false, false);
  for (const sx of [-0.12, 0.12]) mesh(geoSphere(0.035, 12, 8, dx + sx, 0.68, wallZS + 0.06), M.brass, group, false, false);
  mesh(geoBox(1.5, 1.37, 0.05, dx, 0.805, wallZS - 0.02), M.trim, group);
  mesh(geoBox(1.9, 0.10, 0.6, dx, 0.05, bz + H + 0.15), M.plinth, group);
  const wu = W / 2 - 1.2;
  makeWindows(group, cx, cz, wallZS, wallZN, wallXE, wallXW, glassMat, [
    { face: 'S', u: -wu, cy: 0.85, gw: 1.1, gh: 0.8 }, { face: 'S', u: wu, cy: 0.85, gw: 1.1, gh: 0.8 },
    { face: 'E', u: -0.8, cy: 0.85, gw: 0.7, gh: 0.7 }, { face: 'E', u: 0.8, cy: 0.85, gw: 0.7, gh: 0.7 },
    { face: 'W', u: -0.8, cy: 0.85, gw: 0.7, gh: 0.7 }, { face: 'W', u: 0.8, cy: 0.85, gw: 0.7, gh: 0.7 },
  ]);
  const flowerCols = [SALMON, '#FFFFFF', '#F6D463', AQUA];
  for (const u of [-wu, wu]) {
    mesh(geoBox(0.9, 0.18, 0.22, cx + u, 0.36, wallZS + 0.11), M.flowerBox, group);
    for (let i = 0; i < 4; i++) mesh(geoSphere(0.06, 10, 7, cx + u - 0.33 + i * 0.22, 0.48, wallZS + 0.11), std(flowerCols[i], 0.8), group, false, false);
  }
  makeAwning(group, cx, wallZS, W - 0.1, 1.4, 1.1, 0.8, awningMat(style.awning), null);
  if (style.chalk) {
    const chalk = mesh(new THREE.BoxGeometry(0.35, 0.5, 0.03), M.chalk, group);
    chalk.position.set(dx - 1.2, 0.37, wallZS + 0.1); chalk.rotation.x = 0.15;
  }

  rec.sign = makePlaque(style.name, style.accent, false, false);
  rec.sign.sprite.position.set(cx, 3.4, cz);
  group.add(rec.sign.sprite);

  // v10: the small buildings are static apart from their glass (material level), so they merge per material
  { const s = mergeStatic(group, new Set()); mergeStats.before += s.before; mergeStats.after += s.after; }
  if (b.local) { group.rotation.y = (b.rot || 0) * DEG; lotPoint(b, 0, 0, group.position); }
  // v8: the lot is a plateau; the whole group (sign included) sits at its height
  rec.plateau = lotY(b);
  group.position.y = rec.plateau;
  scene.add(group);
  buildingRecs.push(rec);
  return rec;
}

function buildBuildings() {
  for (const b of TT.state.buildings) {
    if (b.kind === 'dept') buildDept(b);
    else if (b.kind === 'clubhouse') buildClubhouse(b);
    else buildCafe(b);
  }
}

/* ---------- version 5: interiors and golf (CONTRACT_V5 "Renderer integration") ---------- */
function activityLabels() {
  const out = {};
  for (const id in DEPT_MODULES) { const m = DEPT_MODULES[id]; if (m && typeof m.activityLabel === 'string') out[id] = m.activityLabel; }
  return out;
}
/* The twelve rooms live far below the town (y -60, x 200 + 24 i); only the active room is lit and visible. */
function buildInteriorRooms() {
  try {
    interiors = buildInteriors({
      THREE, state: TT.state, deptById: TT.deptById, depts: TT.DEPARTMENTS,
      // portraits: an avatar already rendered for the roster, or rendered on demand once the first frames are out
      getAvatar: a => (a && a.avatarURL) || (avatarsOk && a && TT.town ? TT.town.avatar(a) : ''),
      activityLabels: activityLabels(),
      getPlayerPos: () => (walkOn && player ? player.pos : null),
    });
  } catch (e) { console.error('Thread Town: interiors failed to build', e); interiors = null; return; }
  if (!interiors || !interiors.group) { interiors = null; return; }
  registerGroupMaterials(interiors.group);
  scene.add(interiors.group);
}
/* Flags, cups, markers, fences, the porch dressing, the range net and the ball pool on top of the painted tiles. */
function buildGolfCourse() {
  try {
    // v8: every prop stands at the terrain height and the ball physics read course.terrain
    // v10: the plan goes in, roads.js draws the cart path ribbons (cartPaths false)
    // v11: the raster's waterway masks (the creek and the channel read as water in lieAt and waterSurfaceAt)
    golf = GOLF.buildGolf({ THREE, state: TT.state, sim: TT.sim, plan: TT.sim.PLAN, heightAt: hAt, terrain: terrain || flatTerrain, cartPaths: false, raster: TT.sim.raster || undefined });
  } catch (e) { console.error('Thread Town: golf failed to build', e); golf = null; return; }
  if (!golf || !golf.group) { golf = null; return; }
  // v10: city.js builds the Thread National entrance sign from golf.entranceSign, so the course's own copy comes out
  if (city && golf.entranceSign && golf.entranceSign.parent) golf.entranceSign.parent.remove(golf.entranceSign);
  try { fitGolfToPlan(); } catch (e) { console.warn('Thread Town: golf plan fit skipped', e); }
  mergeGolfProps();
  registerGroupMaterials(golf.group);
  scene.add(golf.group);
}
/* v7 (CONTRACT_V7 "Performance"): the course props (tee markers, mats, benches, signs, the net, the
   clubhouse dressing) merge per material after a probe of golf.update, like the buildings. The flags
   stay their own meshes (a whole flag group hides while a ball rolls near its cup) and so do the
   balls and trails (hidden until used, so the merge pass skips them anyway). */
function mergeGolfProps() {
  try {
    const snap = snapshotMeshes(golf.group);
    for (let i = 0; i < 90; i++) golf.update(1 / 30, 3000 + i * 0.23);
    const dyn = changedSince(golf.group, snap);
    for (const f of golf.flags || []) {
      if (!f || !f.group) continue;
      // v10: the flag's static parts (pole, base, number plate) merge inside the flag group so the
      // whole flag still hides as one; the cloth (its vertices wave) and the hinge stay live
      const live = new Set();
      f.group.traverse(o => { if (o.isMesh && (o === f.cloth || (f.hinge && hiddenInTree(o, f.hinge) === false && o.parent === f.hinge))) live.add(o); });
      try { const s = mergeStatic(f.group, live); mergeStats.before += s.before; mergeStats.after += s.after; } catch (e) { /* the flag keeps its parts */ }
      f.group.traverse(o => { if (o.isMesh) { dyn.add(o); o.userData.noMerge = true; } });
    }
    const s = mergeStatic(golf.group, dyn);
    const s2 = mergeMovers(golf.group, snap, dyn);   // v10: the flag poles and cloth hinges keep their rigs
    mergeStats.before += s.before + s2.before; mergeStats.after += s.after + s2.after;
  } catch (e) { console.warn('Thread Town: merge skipped for the golf course', e); }
}
/* v7: the plan's park bounds replace the course module's constant on the course and every hole
   (the out of bounds test), and dressing that lies entirely outside the links area is hidden.
   v10: golf.js lays the clubhouse dressing out in the clubhouse's own rotated frame (any angle),
   so nothing is re-parented or turned here any more. */
function fitGolfToPlan() {
  const gs = TT.state.golf;
  if (!gs || !golf) return;
  const pb = gs.parkBounds;
  if (!pb) return;
  golf.parkBounds = pb;
  for (const h of golf.holes || []) if (h && h.kind === 'hole') h.parkBounds = pb;
  for (const o of golf.group.children.slice()) {
    if (!o.visible || o.isLight) continue;
    o.updateMatrixWorld(true);
    _box.setFromObject(o);
    if (_box.isEmpty()) continue;
    // hide the whole subtree: the merge pass reads each mesh's own flag, so a hidden group with
    // visible children would otherwise come back as merged meshes
    if (_box.max.x < pb.x0 - 3 || _box.min.x > pb.x1 + 3 || _box.max.z < pb.y0 - 3 || _box.min.z > pb.y1 + 3) o.traverse(c => { c.visible = false; });
  }
}
/* Repaints the room boards from the live roster and stats; cheap when nothing changed (interiors caches keys). */
function refreshInteriorBoards() {
  if (!interiors) return;
  const st = TT.state, show = st.settings.showDemo;
  const byDept = new Map();
  for (const a of st.agents) {
    if (!show && a.spec.demo) continue;
    const id = a.dept && a.dept.id;
    if (!id) continue;
    let list = byDept.get(id);
    if (!list) { list = []; byDept.set(id, list); }
    list.push(a);
  }
  let stats = null;
  try { stats = TT.sim.deptStats(); } catch (e) { stats = null; }
  try { refreshBoards(interiors.rooms, stats, byDept); } catch (e) { console.warn('Thread Town: refreshBoards failed', e); }
}

function countAgents(dept) {
  const st = TT.state; let n = 0;
  for (const a of st.agents) if (a.dept === dept && (st.settings.showDemo || !a.spec.demo)) n++;
  return n;
}

function updateBuildings(dt, time) {
  const camDist = camera.position.distanceTo(controls.target);
  const hov = TT.state.hover;
  const ramp = clamp((nightS - 0.25) / 0.75, 0, 1);
  const idle = 1.3 * ramp;
  // "Buildings grow with the team": sample the visible agent count every 0.5 s.
  growClock += dt;
  const sample = growClock >= 0.5;
  if (sample) growClock = 0;
  // v5: the room boards follow the same roster sample (portrait keys include avatar presence, so a
  // portrait rendered for the roster since the last sample repaints that slot).
  if (sample) refreshInteriorBoards();
  // v6: the metro sign and the scoreboards repaint once the fonts arrive
  if (sample && scoreboardFonts !== fontsReady) { scoreboardFonts = fontsReady; refreshSigns(true); }
  // Light budget (CITY_DESIGN Principles 7): department point lights only for the building
  // nearest the camera target plus the risk beacon; the rest glow through emissive glass only.
  let nearest = null, nd = Infinity;
  for (const rec of buildingRecs) {
    if (rec.isCafe) continue;
    const b = rec.b, d = Math.hypot(b.x + b.w / 2 - controls.target.x, b.y + b.h / 2 - controls.target.z);
    if (d < nd) { nd = d; nearest = rec; }
  }
  for (const rec of buildingRecs) {
    const b = rec.b;
    const sg = rec.sign;
    if (!rec.isCafe) {
      const count = countAgents(b.dept), active = b.active > 0;
      if (count !== sg.count || active !== sg.active || fontsReady !== sg.fonts) {
        sg.count = count; sg.active = active; sg.fonts = fontsReady;
        paintPlaque(sg, count, active);
      }
      if (sample) rec.scaleTarget = clamp(0.78 + 0.10 * count, 0.78, 1.30);
      // uniform scale about the door foot so the building stays on its lot (v7: the pivot is the
      // door foot in the rotated frame, so origin + (1 - s) * pivot keeps that world point fixed)
      const s = rec.scale + (rec.scaleTarget - rec.scale) * (1 - Math.exp(-dt * 3));
      if (Math.abs(s - rec.scale) > 1e-6) {
        rec.scale = s;
        rec.group.scale.setScalar(s);
        rec.group.position.copy(rec.origin).addScaledVector(rec.pivot, 1 - s);
        if (Math.abs(s - rec.measuredScale) > 0.002) measureSign(rec);
      }
      // building module update: night and active drive its own effects
      if (rec.update) rec.update(dt, time, nightS, active);
      // v10: far from the view the live group and its station hide behind their proxies (see
      // BUILDING_FAR): on the ground by the camera's distance, in orbit by the zoom or by the
      // orbit target's distance, with thresholds above the department focus distance
      if (rec.proxy || rec.actProxy) {
        const c = recCenter(b, _pt2);
        let far;
        if (walkOn) {
          const dc = Math.hypot(c.x - camera.position.x, c.y - camera.position.z);
          far = rec.far ? dc > BUILDING_NEAR : dc > BUILDING_FAR;
        } else {
          const dc = Math.hypot(c.x - controls.target.x, c.y - controls.target.z);
          const farT = Math.max(BUILDING_FAR, ORBIT_FAR_MIN * fitDistance), zoom = camDist / fitDistance;
          far = rec.far ? (zoom > OVERVIEW_NEAR || dc > farT - ORBIT_HYST) : (zoom > OVERVIEW_FAR || dc > farT);
        }
        if (far !== rec.far) {
          rec.far = far;
          if (rec.proxy) { rec.group.visible = !far; rec.proxy.visible = far; }
          if (rec.actProxy) { rec.activity.group.visible = !far; rec.actProxy.visible = far; }
        }
        if (far && rec.proxy) syncProxy(rec.proxy, rec.group);
      }
      // point lights follow the night ramp; visibility follows the budget
      const on = rec === nearest || b.dept.id === 'risk';
      for (let i = 0; i < rec.lights.length; i++) {
        const l = rec.lights[i];
        l.intensity = rec.lightBase[i] * ramp;
        l.visible = on && ramp > 0;
      }
    } else if (sg && sg.fonts !== fontsReady) { sg.fonts = fontsReady; paintPlaque(sg, 0, false); }
    // glass: idle night glow, warm when anyone works, a touch brighter on hover
    const want = (hov && hov.kind === 'dept' && hov.building === b) ? 1 : 0;
    rec.hoverT += (want - rec.hoverT) * (1 - Math.exp(-dt / 0.12));
    const glowWant = (b.active > 0) ? Math.max(idle, 0.9) : idle;
    rec.glowT += (glowWant - rec.glowT) * (1 - Math.exp(-6 * dt));
    const gi = rec.glowT + 0.35 * rec.hoverT;
    // v10: an emissive window pattern per building at night: each glass material (a window
    // group) holds its own lit level that steps every several seconds, so the facades differ
    const key = rec.isCafe ? (b.kind || 'cafe') + '|' + b.x + ',' + b.y : b.dept.id;
    for (let k = 0; k < rec.glassMats.length; k++) rec.glassMats[k].emissiveIntensity = gi * windowLevel(rec.glassMats[k], key, k, time, dt, ramp);
    // plaque scale
    const sp = sg.sprite;
    sp.getWorldPosition(_v);
    const dist = _v.distanceTo(camera.position);
    const ppu = viewH / (2 * dist * Math.tan(14 * DEG));
    const f = clamp(90 / (sg.baseW * ppu), 1.0, 1.3) * clamp(camDist / fitDistance, 0.6, 1.0) * (1 + 0.06 * rec.hoverT);
    sp.scale.set(sg.baseW * f, sg.baseH * f, 1);
  }
  // v7: the city dressing's glass glows with the idle night ramp like the departments' and its few
  // point lights follow the same ramp
  if (city) {
    for (let k = 0; k < city.glass.length; k++) city.glass[k].emissiveIntensity = idle * windowLevel(city.glass[k], 'city', k, time, dt, ramp);
    for (let i = 0; i < city.lights.length; i++) {
      const l = city.lights[i];
      l.intensity = city.lightBase[i] * ramp;
      l.visible = ramp > 0;
    }
  }
}

/* Activities run every frame: with the handle of the alien at the station, or null. */
function updateActivities(dt, time) {
  for (const rec of buildingRecs) {
    if (rec.isCafe || !rec.activity) continue;
    rec.phase.t = time - rec.phaseAt;
    const w = rec.worker;
    let handle = null;
    // CONTRACT_V4: the player marks a station with worker 'player' and lends its own handle once it has walked in.
    if (w === 'player') handle = (playerRec && playerRec.station === rec && playerRec.atStation) ? playerRec.handle : null;
    else if (w && w.work && w.work.atStation) handle = w.handle;
    rec.activity.update(dt, time, rec.phase, handle, rec.phase.working);
  }
}

/* ---------- v10: emissive window patterns ----------
   Every glass material carries a lit level in its userData: a stepped value (0.3, 0.65 or 1)
   drawn from the building key, the material index and the current slot (slots of 7 to 19 s
   per material), eased over 0.8 s, so at night each facade shows its own pattern of lit and
   dark window groups. By day (ramp 0) the level is 1 so the working glow is unchanged. */
function windowLevel(mat, key, k, time, dt, ramp) {
  if (ramp <= 0) return 1;
  let W = mat.userData.win;
  if (!W) {
    const r = TT.rng(TT.hash('win|' + key + '|' + k));
    W = mat.userData.win = { period: 7 + 12 * r(), phase: 40 * r(), slot: -1, level: 1, target: 1, key: key + '|' + k };
  }
  const slot = Math.floor((time + W.phase) / W.period);
  if (slot !== W.slot) {
    W.slot = slot;
    const v = TT.rng(TT.hash(W.key + '|' + slot))();
    W.target = v < 0.3 ? 0.3 : v < 0.6 ? 0.65 : 1;
  }
  W.level += (W.target - W.level) * (dt > 0 ? 1 - Math.exp(-dt / 0.8) : 1);
  return lerp(1, W.level, ramp);
}

/* ---------- v10: the interaction highlight ring (CONTRACT_V10 "Interactions") ----------
   A soft aqua ring on the ground under the interactable behind player.prompt: the seat, the
   agent, the station, the door, the scooter, the tee, the ball, the cart, the ladder or the
   subway mouth. player.js keeps its own pick private, so the target is resolved here from the
   prompt text and the nearest candidate of that kind. */
function ensureHighlightRing() {
  if (hiRing) return hiRing;
  try { hiRing = createHighlightRing({ color: AQUA }); } catch (e) { console.warn('Thread Town: the highlight ring failed to build', e); hiRing = null; return null; }
  if (hiRing && hiRing.mesh) scene.add(hiRing.mesh);
  return hiRing;
}
const _pt = { x: 0, z: 0, r: 0.8, ok: false, y: NaN };   // y: the ring height when not the terrain (a boat on the water)
const _pt2 = { x: 0, y: 0 };   // recCenter scratch
/* The per frame prompt target path allocates nothing: the candidate list for nearestOf sits in
   _nf.list while the hoisted accessors below read it, the hit is written into _pt, and the prompt
   text is matched with startsWith (a regex literal makes a new object each evaluation). */
const _nf = { list: null };
function nearestOf(px, pz, maxD, n, getX, getZ) {
  let bd = maxD, bi = -1;
  for (let i = 0; i < n; i++) { const x = getX(i), z = getZ(i); if (!isFinite(x) || !isFinite(z)) continue; const d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; bi = i; } }
  return bi;
}
function ptSet(x, z, r, y) { _pt.x = x; _pt.z = z; _pt.r = r; _pt.y = isFinite(y) ? y : NaN; _pt.ok = isFinite(x) && isFinite(z); return _pt; }
/* v11 accessors: a free boat (parked, no rider), a free dock (no boat) by its tile center, a rack. */
function boatFreeX(i) { const b = _nf.list[i]; return !b || b.rider || b.parked === false ? NaN : b.x; }
function boatY(i) { const b = _nf.list[i]; return b ? b.y : NaN; }
function dockPosX(d) { return d.pos && isFinite(d.pos.x) ? d.pos.x : (isFinite(d.x) ? d.x + 0.5 : NaN); }
function dockPosZ(d) { return d.pos && isFinite(d.pos.y) ? d.pos.y : (isFinite(d.y) ? d.y + 0.5 : NaN); }
function dockFreeX(i) { const d = _nf.list[i]; return !d || d.boat ? NaN : dockPosX(d); }
function dockFreeZ(i) { const d = _nf.list[i]; return d ? dockPosZ(d) : NaN; }
function rackPosX(i) { const r = _nf.list[i]; return !r ? NaN : (r.pos && isFinite(r.pos.x) ? r.pos.x : r.x + 0.5); }
function rackPosZ(i) { const r = _nf.list[i]; return !r ? NaN : (r.pos && isFinite(r.pos.y) ? r.pos.y : r.y + 0.5); }
/* The kiosk's front tile center (state.kiosk.frontPos, else front + 0.5), or null. */
function kioskFrontPos() {
  const k = TT.state && TT.state.kiosk;
  if (!k) return null;
  if (k.frontPos && isFinite(k.frontPos.x) && isFinite(k.frontPos.y)) return k.frontPos;
  if (k.front && isFinite(k.front.x) && isFinite(k.front.y)) { _kf.x = k.front.x + 0.5; _kf.y = k.front.y + 0.5; return _kf; }
  return null;
}
function seatFreeX(i) { const s = _nf.list[i]; return s.takenBy ? NaN : s.x + 0.5; }
function seatZ(i) { return _nf.list[i].y + 0.5; }
function doorX(i) { const d = _nf.list[i].doorPos; return d ? d.x : NaN; }
function doorZ(i) { const d = _nf.list[i].doorPos; return d ? d.y : NaN; }
function scooterFreeX(i) { const s = _nf.list[i]; return s.rider ? NaN : s.x; }
function scooterZ(i) { return _nf.list[i].y; }
function teeX(i) { const t = _nf.list[i].tee; return t ? t.x + 0.5 : NaN; }
function teeZ(i) { const t = _nf.list[i].tee; return t ? t.y + 0.5 : NaN; }
function promptTarget(p, text) {
  _pt.ok = false;
  if (!text) return _pt;
  const px = p.pos.x, pz = p.pos.y, st = TT.state;
  if (text.startsWith('Sit down')) {
    const seats = _nf.list = st.seats || EMPTY_LIST;
    const i = nearestOf(px, pz, 2.6, seats.length, seatFreeX, seatZ);
    return i >= 0 ? ptSet(seats[i].x + 0.5, seats[i].y + 0.5, 0.8) : _pt;
  }
  if (text.startsWith('Stand up')) { const s = p.leisure && p.leisure.seat; return s ? ptSet(s.x + 0.5, s.y + 0.5, 0.8) : _pt; }
  if (text.startsWith('Talk to ')) {
    // the agents straight from the record map, no snapshot array
    let bd = 2.6, bx = NaN, bz = NaN;
    for (const rec of agentRecs.values()) {
      const gp = rec.handle.group.position;
      const d = Math.hypot(gp.x - px, gp.z - pz);
      if (d < bd) { bd = d; bx = gp.x; bz = gp.z; }
    }
    return isFinite(bx) ? ptSet(bx, bz, 0.8) : _pt;
  }
  if (text.startsWith('Visit ')) {
    const bs = _nf.list = st.buildings || EMPTY_LIST;
    const i = nearestOf(px, pz, 3.2, bs.length, doorX, doorZ);
    return i >= 0 ? ptSet(bs[i].doorPos.x, bs[i].doorPos.y, 0.9) : _pt;
  }
  if (text.startsWith('Grab a scooter')) {
    const sc = _nf.list = st.scooters || EMPTY_LIST;
    const i = nearestOf(px, pz, 2.6, sc.length, scooterFreeX, scooterZ);
    return i >= 0 ? ptSet(sc[i].x, sc[i].y, 0.7) : _pt;
  }
  if (text.startsWith('Grab a coffee') || text.startsWith('Grab an ice cream') || text.startsWith('Put it back')) {
    const bs = st.buildings || EMPTY_LIST;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.kind === 'cafe') return b.doorPos ? ptSet(b.doorPos.x, b.doorPos.y, 0.9) : _pt;
    }
    return _pt;
  }
  if (text.startsWith('Get in the cart')) { const c = p.cart; return c ? ptSet(c.x, c.z, 1.3) : _pt; }
  if (text.startsWith('Play the ball')) { const b = p.golf && p.golf.ball; return b && b.pos ? ptSet(b.pos.x, b.pos.z, 0.5) : _pt; }
  if (text.startsWith('Tee off') || text.startsWith('Practice hole') || text.startsWith('Play holes in order')) {
    const hs = _nf.list = golfHoles();
    const i = nearestOf(px, pz, 4, hs.length, teeX, teeZ);
    return i >= 0 ? ptSet(hs[i].tee.x + 0.5, hs[i].tee.y + 0.5, 1.0) : _pt;
  }
  if (text.startsWith('Start a round')) { const cb = st.clubhouse; return cb && cb.doorPos ? ptSet(cb.doorPos.x, cb.doorPos.y, 1.0) : _pt; }
  if (text.startsWith('Climb out')) { const pier = st.pier; return pier && pier.ladder ? ptSet(pier.ladder.x, pier.ladder.y, 0.7) : _pt; }
  if (text.startsWith('Take the subway')) {
    // the subway mouth without the subwayRect record: the enter zone is the tile row south of the 2 by 2
    const s = st.subway;
    return s && s.tile && isFinite(s.tile.x) && isFinite(s.tile.y) ? ptSet(s.tile.x, s.tile.y + 1 - 0.2, 1.2) : _pt;
  }
  // v11: a free boat (the ring floats on the water), a free dock within the tie up reach, the kiosk front
  if (text.startsWith('Take the boat')) {
    const bs = _nf.list = st.boats || EMPTY_LIST;
    const i = nearestOf(px, pz, 3.0, bs.length, boatFreeX, boatY);
    return i >= 0 ? ptSet(bs[i].x, bs[i].y, 1.3, waterLevelAt(bs[i].x, bs[i].y) + 0.02) : _pt;
  }
  if (text.startsWith('Tie up')) {
    const ds = _nf.list = st.docks || EMPTY_LIST;
    const i = nearestOf(px, pz, 3.2, ds.length, dockFreeX, dockFreeZ);
    return i >= 0 ? ptSet(dockPosX(ds[i]), dockPosZ(ds[i]), 0.9) : _pt;
  }
  if (text === 'Shop') { const f = kioskFrontPos(); return f ? ptSet(f.x, f.y, 0.9) : _pt; }
  if (text === 'Read the plaque') return statue ? ptSet(statue.frontPos.x, statue.frontPos.y, 1.1) : _pt;   // v14
  // a station: the prompt is the activity label, or 'Try: ' plus the label
  for (const rec of buildingRecs) {
    if (rec.isCafe || !rec.worldAnchor || !rec.label) continue;
    if (text !== rec.label && !(text.length === rec.label.length + 5 && text.startsWith('Try: ') && text.endsWith(rec.label))) continue;
    const A = rec.worldAnchor;
    if (Math.hypot(A.x - px, A.z - pz) <= 3.5) return ptSet(A.x, A.z, 1.6);
  }
  return _pt;
}
/* Per frame while walking: the ring follows the prompt's target (or clears). */
function updateHighlightRing(p) {
  if (!hiRing) return;
  const text = p && p.prompt && !p.interior ? (p.prompt.text || '') : '';
  const t = promptTarget(p, text);
  if (t.ok) hiRing.target(t.x, isFinite(t.y) ? t.y : hAt(t.x, t.z), t.z, t.r);
  else hiRing.clear();
}

/* ---------- v10: golf extras (CONTRACT_V10 "Golf") ----------
   The swing phase handed to the animators is shaped from player.golf.swingT (linear in player.js):
   a quick backswing, a short pause at the top, the downswing to impact at the same instant
   player.js strikes (IMPACT_T 0.62 maps to the animator's impact key 0.62) and an eased
   follow-through to the finish. The ball gets a streak at speed, a landing puff and a long trail
   line; the aim shows the carry arc as dots; flag poles get a shadow decal; birds cross the links. */
function golfPhaseShaped(t) {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  if (t < 0.34) { const k = t / 0.34; return 0.5 * (1 - Math.pow(1 - k, 2.2)); }           // backswing, easing out at the top
  if (t < 0.50) return 0.5 + 0.02 * (t - 0.34) / 0.16;                                     // the pause at the top
  if (t < 0.62) { const k = (t - 0.50) / 0.12; return 0.52 + 0.10 * k * k; }               // the downswing accelerates into impact
  const k = (t - 0.62) / 0.38;
  return 0.62 + 0.38 * (1 - Math.pow(1 - k, 1.8));                                         // follow-through to the finish
}
function ensureGolfExtras() {
  if (ballStreak) return;
  const sm = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  sm.fog = false;
  ballStreak = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), sm);
  ballStreak.visible = false; ballStreak.castShadow = false; ballStreak.receiveShadow = false; ballStreak.frustumCulled = false;
  scene.add(ballStreak);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BALL_TRAIL_N * 3), 3));
  tg.setDrawRange(0, 0);
  const tm = new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.45, depthWrite: false });
  tm.fog = false;
  ballTrail = new THREE.Line(tg, tm);
  ballTrail.visible = false; ballTrail.frustumCulled = false; ballTrail.renderOrder = 8;
  scene.add(ballTrail);
  puffs = [];
  const ptex = radialTex(64, 'rgba(226,214,180,0.9)');
  for (let i = 0; i < 6; i++) {
    const m = new THREE.SpriteMaterial({ map: ptex, transparent: true, opacity: 0, depthWrite: false });
    m.fog = false;
    const s = new THREE.Sprite(m);
    s.visible = false; s.renderOrder = 8;
    scene.add(s);
    puffs.push({ s, m, t: 1, life: 0.55, dx: 0, dz: 0 });
  }
}
function spawnPuff(x, y, z) {
  ensureGolfExtras();
  let n = 0;
  for (const p of puffs) {
    if (p.t < p.life) continue;
    p.t = 0; p.dx = (n ? Math.cos(n * 2.1) : 0) * 0.35; p.dz = (n ? Math.sin(n * 2.1) : 0) * 0.35;
    p.s.position.set(x + p.dx * 0.3, y + 0.08, z + p.dz * 0.3); p.s.visible = true;
    if (++n >= 4) break;
  }
}
/* The ball effects for the player's ball (and the trail reset on a new strike). */
function updateBallFx(G, dt) {
  const b = G && G.ball && G.ball.pos && G.ball.vel ? G.ball : null;
  const extras = quality === 'high';
  if (puffs) for (const p of puffs) {
    if (p.t >= p.life) { if (p.s.visible) p.s.visible = false; continue; }
    p.t += dt;
    const k = clamp(p.t / p.life, 0, 1);
    p.s.position.x += p.dx * dt * 2; p.s.position.z += p.dz * dt * 2; p.s.position.y += 0.25 * dt;
    const sc = 0.3 + 1.1 * k;
    p.s.scale.set(sc, sc * 0.7, 1); p.m.opacity = 0.55 * (1 - k) * (1 - k);
  }
  if (!b) {
    if (ballStreak) ballStreak.visible = false;
    if (ballTrail && ballTrail.visible) { ballTrail.material.opacity -= dt; if (ballTrail.material.opacity <= 0) { ballTrail.visible = false; trailPts.length = 0; } }
    return;
  }
  ensureGolfExtras();
  const airborne = !b.rolling && !b.resting && !b.holed && !b.inWater;
  const speed = b.vel.length();
  const was = prevBallAir.get(b) === true;
  if (was && !airborne && !b.inWater && !b.holed && extras) spawnPuff(b.pos.x, hAt(b.pos.x, b.pos.z), b.pos.z);
  prevBallAir.set(b, airborne);
  // the streak: a short additive cylinder along the velocity, longer with speed
  if (extras && airborne && speed > 7) {
    const len = clamp(speed * 0.05, 0.3, 1.4);
    _v.copy(b.vel).normalize();
    ballStreak.position.copy(b.pos).addScaledVector(_v, -len / 2);
    ballStreak.quaternion.setFromUnitVectors(UP, _v);
    ballStreak.scale.set(0.045, len, 0.045);
    ballStreak.material.opacity = 0.18 + 0.22 * clamp((speed - 7) / 20, 0, 1);
    ballStreak.visible = true;
  } else ballStreak.visible = false;
  // the long trail: the last BALL_TRAIL_N positions sampled while airborne, fading once it lands
  if (airborne) {
    const last = trailPts.length ? trailPts[trailPts.length - 1] : null;
    if (!last || Math.hypot(last.x - b.pos.x, last.y - b.pos.y, last.z - b.pos.z) > 0.25) {
      if (trailPts.length >= BALL_TRAIL_N) trailPts.shift();
      trailPts.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z });
    }
    const pos = ballTrail.geometry.attributes.position;
    for (let i = 0; i < trailPts.length; i++) pos.setXYZ(i, trailPts[i].x, trailPts[i].y, trailPts[i].z);
    pos.needsUpdate = true;
    ballTrail.geometry.setDrawRange(0, trailPts.length);
    ballTrail.material.opacity = 0.45;
    ballTrail.visible = trailPts.length >= 2;
  } else if (ballTrail.visible) {
    ballTrail.material.opacity -= dt * 0.6;
    if (ballTrail.material.opacity <= 0) { ballTrail.visible = false; trailPts.length = 0; }
  }
}
/* Flag pole shadows: a tapered dark strip on the ground from every cup along the sun's ground
   direction, the pole height over the sun's elevation long, following the terrain in four steps.
   One merged mesh (the thin poles do not survive the shadow map's resolution). */
function buildFlagShadows() {
  if (!golf || !Array.isArray(golf.flags) || !golf.flags.length) return;
  const horiz = Math.hypot(SUN_DIR.x, SUN_DIR.z) || 1e-6;
  const L = 2.2 * horiz / Math.max(0.2, SUN_DIR.y);
  const dx = -SUN_DIR.x / horiz, dz = -SUN_DIR.z / horiz;
  const nx = -dz, nz = dx;
  const geoms = [];
  for (const f of golf.flags) {
    if (!f || !isFinite(f.x) || !isFinite(f.z)) continue;
    const pos = [], uv = [], idx = [];
    const STEPS = 4;
    for (let s = 0; s <= STEPS; s++) {
      const k = s / STEPS, px = f.x + dx * L * k, pz = f.z + dz * L * k, w = 0.06 * (1 - 0.5 * k);
      const y = hAt(px, pz) + 0.012;
      pos.push(px - nx * w, y, pz - nz * w, px + nx * w, y, pz + nz * w);
      uv.push(k, 0, k, 1);
      if (s) { const b = (s - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    geoms.push(g);
  }
  if (!geoms.length) return;
  const mat = new THREE.MeshBasicMaterial({ color: '#0A1E30', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  flagShadowMesh = new THREE.Mesh(merge(geoms), mat);
  flagShadowMesh.name = 'flag-shadows'; flagShadowMesh.castShadow = false; flagShadowMesh.receiveShadow = false; flagShadowMesh.renderOrder = 2;
  flagShadowMesh.userData.noMerge = true;
  scene.add(flagShadowMesh);
}
/* Birds: a small flock of seven V shapes (one instanced mesh) that crosses the links every 25
   to 55 s at a height above the hill, flapping, in a loose line; off on Balanced. */
function buildBirds() {
  const gs = TT.state && TT.state.golf;
  const pb = gs && gs.parkBounds;
  if (!pb) return;
  const n = 7;
  const pos = [0, 0, 0, -0.42, 0.14, 0.12, -0.38, 0.0, -0.08, 0, 0, 0, 0.42, 0.14, 0.12, 0.38, 0.0, -0.08];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#1B2D40', side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'birds'; mesh.visible = false; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  scene.add(mesh);
  const r = TT.rng(9173);
  birds = { mesh, n, active: false, t: 0, dur: 1, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, next: 12 + 20 * r(), y: 16, phase: [], rng: r, pb };
  for (let i = 0; i < n; i++) birds.phase.push(r() * TAU);
}
function updateBirds(dt, time) {
  if (!birds) return;
  const B = birds;
  if (!B.active) {
    if (quality !== 'high') return;
    B.next -= dt;
    if (B.next > 0) return;
    const r = B.rng, pb = B.pb;
    const westToEast = r() < 0.5;
    const z0 = pb.y0 + (pb.y1 - pb.y0) * (0.2 + 0.6 * r()), z1 = pb.y0 + (pb.y1 - pb.y0) * (0.2 + 0.6 * r());
    B.from.x = westToEast ? pb.x0 - 12 : pb.x1 + 12; B.from.z = z0;
    B.to.x = westToEast ? pb.x1 + 12 : pb.x0 - 12; B.to.z = z1;
    B.y = 14 + 4 * r();
    B.dur = Math.hypot(B.to.x - B.from.x, B.to.z - B.from.z) / 6.5;
    B.t = 0; B.active = true; B.mesh.visible = true;
  }
  B.t += dt;
  const k = B.t / B.dur;
  if (k >= 1) { B.active = false; B.mesh.visible = false; B.next = 25 + 30 * B.rng(); return; }
  const hx = B.to.x - B.from.x, hz = B.to.z - B.from.z, hl = Math.hypot(hx, hz) || 1;
  const ux = hx / hl, uz = hz / hl, yaw = Math.atan2(ux, uz);
  for (let i = 0; i < B.n; i++) {
    // a loose V behind the leader: alternating sides, farther back each pair
    const row = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
    const back = row * 1.6, out = row * 1.1 * side;
    const x = B.from.x + hx * k - ux * back - uz * out, z = B.from.z + hz * k - uz * back + ux * out;
    const flap = Math.sin(time * 9 + B.phase[i]);
    _v.set(x, B.y + 0.4 * Math.sin(time * 1.3 + B.phase[i]), z);
    _q.setFromAxisAngle(UP, yaw);
    _s3.set(1, 0.25 + 0.75 * Math.abs(flap), 1);
    _m4.compose(_v, _q, _s3);
    B.mesh.setMatrixAt(i, _m4);
  }
  B.mesh.instanceMatrix.needsUpdate = true;
}

/* ---------- lamps ---------- */
/* Real PointLights only where they matter (ART_DIRECTION light budget): the plaza corners and the
   first park (pond lot) lamp. The rest glow through emissive bulbs; the street lamps along the
   sidewalks belong to city.js, which carries its own small set of point lights (v7). */
let parkLampUsed = false;
function isKeyLamp(l) {
  const sim = TT.sim, pz = TT.state.plaza;
  if (l.bulbOnly) return false;   // v5: the clubhouse porch lamps glow through their bulbs only
  if (pz && l.x >= pz.x && l.x <= pz.x + pz.w && l.y >= pz.y && l.y <= pz.y + pz.h) return true;
  const lot = typeof sim.lotAt === 'function' ? sim.lotAt(Math.floor(l.x), Math.floor(l.y)) : null;
  if (lot && lot.kind === 'pond') {
    if (parkLampUsed) return false;
    parkLampUsed = true; return true;
  }
  return false;
}
function buildLamps() {
  const lamps = TT.state.lamps;
  if (!lamps.length) return;
  const iron = [], bulbs = [], pools = [], placed = [];
  for (const l of lamps) {
    const h = hAt(l.x, l.y);   // v8: every lamp stands on the terrain at its base
    placed.push({ x: l.x, z: l.y, y: h });
    iron.push(geoCyl(0.10, 0.10, 0.08, 12, l.x, h + 0.04, l.y));
    iron.push(geoCyl(0.04, 0.04, 1.75, 12, l.x, h + 0.955, l.y));
    iron.push(geoBox(0.26, 0.14, 0.26, l.x, h + 2.05, l.y));
    iron.push(new THREE.ConeGeometry(0.12, 0.12, 12).translate(l.x, h + 2.18, l.y));
    bulbs.push(geoSphere(0.11, 16, 12, l.x, h + 1.95, l.y));
    const pool = new THREE.CircleGeometry(1.8, 32); pool.rotateX(-Math.PI / 2); pool.translate(l.x, h + 0.015, l.y); pools.push(pool);
    if (isKeyLamp(l)) {
      const pl = new THREE.PointLight('#FFC97A', 0, 6, 2);
      pl.position.set(l.x, h + 1.95, l.y); pl.castShadow = false; pl.visible = false;
      scene.add(pl); lampLights.push(pl);
    }
  }
  const lampMesh = mesh(merge(iron), M.iron, scene);
  lampMesh.name = 'lamps'; lampMesh.userData.placements = placed;
  mesh(merge(bulbs), bulbMat, scene, false, false);
  poolMesh = mesh(merge(pools), poolMat, scene, false, false); poolMesh.visible = false;
}

/* ---------- benches, tables, fountain ---------- */
function seatAtTile(x, y) {
  const seats = TT.state.seats || [];
  for (const s of seats) if (s.x === x && s.y === y) return s;
  return null;
}
/* v10: the benches and tables are static, so every bench and table merges per material into
   scene-level meshes (two for the benches, eight for the tables) instead of a group each. */
function buildDecos() {
  const pz = TT.state.plaza;
  let tableIdx = 0;
  const bucket = new Map();   // material -> { geoms, cast, receive }
  const put = (geo, mat, x, y, z, yaw, cast, receive) => {
    geo.rotateY(yaw || 0); geo.translate(x, y, z);
    let bk = bucket.get(mat);
    if (!bk) { bk = { geoms: [], cast: cast !== false, receive: receive !== false }; bucket.set(mat, bk); }
    bk.geoms.push(geo);
  };
  for (const dco of TT.state.decos) {
    if (dco.type === 'bench') {
      const y = hAt(dco.x, dco.y);   // v8: on the terrain
      // face the seat's face point (fountain or pond), falling back to the plaza center
      const seat = seatAtTile(Math.floor(dco.x), Math.floor(dco.y));
      const tx = seat ? seat.face.x : (pz ? pz.x + pz.w / 2 : dco.x), tz = seat ? seat.face.y : (pz ? pz.y + pz.h / 2 : dco.y + 1);
      const yaw = Math.atan2(tx - dco.x, tz - dco.y);
      const wood = [geoBox(1.0, 0.06, 0.17, 0, 0.42, 0.095), geoBox(1.0, 0.06, 0.17, 0, 0.42, -0.095)];
      const back = new THREE.BoxGeometry(1.0, 0.30, 0.05); back.rotateX(-0.15); back.translate(0, 0.62, -0.16); wood.push(back);
      put(merge(wood), M.wood, dco.x, y, dco.y, yaw);
      put(merge([geoBox(0.06, 0.42, 0.34, -0.42, 0.21, 0), geoBox(0.06, 0.42, 0.34, 0.42, 0.21, 0)]), M.iron, dco.x, y, dco.y, yaw);
    } else if (dco.type === 'table') {
      const y = hAt(dco.x, dco.y), x = dco.x, z = dco.y;
      put(merge([geoCyl(0.18, 0.18, 0.03, 16, 0, 0.015, 0), geoCyl(0.03, 0.03, 0.62, 10, 0, 0.31, 0),
        geoCyl(0.02, 0.02, 1.13, 8, 0, 1.185, 0)]), M.iron, x, y, z, 0);
      put(geoCyl(0.36, 0.36, 0.04, 24, 0, 0.62, 0), M.tableTop, x, y, z, 0);
      // table-top props: menu card, sugar bowl, vase with one salmon flower
      const card = new THREE.BoxGeometry(0.14, 0.2, 0.01); card.rotateY(0.5); card.translate(-0.12, 0.74, 0.1);
      put(card, M.navy, x, y, z, 0, false, false);
      put(geoCyl(0.05, 0.05, 0.05, 12, 0.14, 0.665, -0.08), M.tableTop, x, y, z, 0, false, false);
      put(geoCyl(0.03, 0.03, 0.12, 10, 0.05, 0.70, 0.18), M.aquaDoor, x, y, z, 0, false, false);
      put(geoSphere(0.05, 10, 7, 0.05, 0.80, 0.18), std(SALMON, 0.8), x, y, z, 0, false, false);
      const sal = [], whi = [];
      for (let k = 0; k < 4; k++) {
        sal.push(new THREE.ConeGeometry(0.85, 0.32, 2, 1, true, k * Math.PI / 2, Math.PI / 4).translate(0, 1.66, 0));
        whi.push(new THREE.ConeGeometry(0.85, 0.32, 2, 1, true, k * Math.PI / 2 + Math.PI / 4, Math.PI / 4).translate(0, 1.66, 0));
      }
      const canopyYaw = (tableIdx++ % 2 ? 0.2 : -0.2);
      put(merge(sal), M.umbrellaS, x, y, z, canopyYaw, true, false); put(merge(whi), M.umbrellaW, x, y, z, canopyYaw, true, false);
      put(geoSphere(0.04, 10, 7, 0, 1.84, 0), M.brass, x, y, z, 0, false, false);
    } else if (dco.type === 'fountain') {
      // v2: the deco sits at the center of the 3 by 3 basin; the fountain is scaled up to fill it.
      // v8: the plaza is a plateau at 0, so hAt is 0 here; read it anyway so the rule is one rule.
      const g = new THREE.Group(); g.position.set(dco.x, hAt(dco.x, dco.y), dco.y); g.scale.setScalar(1.25);
      mesh(geoCyl(1.15, 1.15, 0.35, 32, 0, 0.175, 0), M.stone, g);
      const lip = new THREE.TorusGeometry(1.15, 0.05, 10, 48); lip.rotateX(Math.PI / 2); lip.translate(0, 0.35, 0); mesh(lip, M.lightStone, g);
      const basin = new THREE.CircleGeometry(1.0, 40); basin.rotateX(-Math.PI / 2);
      const basinWater = mesh(basin, fountainWaterMat, g, false, true); basinWater.position.y = 0.30;
      mesh(geoCyl(0.15, 0.15, 0.75, 16, 0, 0.375, 0), M.stone, g);
      mesh(geoCyl(0.45, 0.40, 0.10, 24, 0, 0.80, 0), M.stone, g);
      const bowl = new THREE.CircleGeometry(0.40, 32); bowl.rotateX(-Math.PI / 2);
      const bowlWater = mesh(bowl, fountainWaterMat, g, false, false); bowlWater.position.y = 0.86;
      // finial: a Thread T in navy with an aqua sphere on top
      mesh(geoCyl(0.03, 0.03, 0.45, 10, 0, 1.08, 0), M.navy, g, false, false);
      mesh(geoBox(0.3, 0.07, 0.07, 0, 1.32, 0), M.navy, g, false, false);
      mesh(geoSphere(0.06, 14, 10, 0, 1.40, 0), M.aquaDoor, g, false, false);
      const jets = [], jetGeo = new THREE.SphereGeometry(0.045, 10, 7);
      for (let i = 0; i < 8; i++) { const j = new THREE.Mesh(jetGeo, M.jet); j.castShadow = false; j.receiveShadow = false; g.add(j); jets.push(j); }
      const rings = [], ringGeo = new THREE.RingGeometry(0.30, 0.36, 48); ringGeo.rotateX(-Math.PI / 2);
      for (let i = 0; i < 2; i++) { const m = M.ringFx.clone(); const rm = new THREE.Mesh(ringGeo, m); rm.position.y = 0.31; rm.castShadow = false; rm.receiveShadow = false; g.add(rm); rings.push({ mesh: rm, mat: m }); }
      // v10: the basin, column and finial merge per material; the jets, rings and the basin water stay live
      const dyn = new Set(jets); dyn.add(basinWater); for (const r of rings) dyn.add(r.mesh);
      { const s = mergeStatic(g, dyn); mergeStats.before += s.before; mergeStats.after += s.after; }
      scene.add(g);
      fountain = { group: g, basinWater, jets, rings };
    }
  }
  for (const [mat, bk] of bucket) {
    const m = mesh(merge(bk.geoms), mat, scene, bk.cast, bk.receive);
    m.name = 'decos';
  }
}

function updateFountain(time) {
  if (!fountain) return;
  fountain.basinWater.scale.setScalar(1.02 + 0.02 * Math.sin(TAU * 0.5 * time));
  for (let i = 0; i < 8; i++) {
    const p = (time / 1.1 + i / 8) % 1, ang = i / 8 * TAU;
    const rad = 0.4 + 0.55 * p, y = 0.9 - 0.6 * p + 3.2 * p * (1 - p);
    fountain.jets[i].position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
  }
  for (let i = 0; i < 2; i++) {
    const p = ((time + i * 0.8) / 1.6) % 1, r = fountain.rings[i];
    r.mesh.scale.setScalar(1 + 1.6 * p); r.mat.opacity = 0.4 * (1 - p);
  }
}

/* ---------- leisure (cafe terrace, pier, pond dressing) ---------- */
/* v7: leisure3d sizes the pond from state.pond (the sim's pond record: center and radii), so the
   state goes through as is; state.waterTiles stays the full water list for the water mesh. */
function buildLeisureProps() {
  try {
    // v8: leisure3d places the terrace, the stools and the pond shore props at ctx.heightAt
    leisure = buildLeisure({ THREE, state: TT.state, heightAt: hAt, normalAt: (x, z, out) => nAt(x, z, out || new THREE.Vector3()) });
  } catch (e) { console.error('Thread Town: leisure3d failed to build', e); leisure = null; return; }
  if (!leisure || !leisure.group) { leisure = null; return; }
  mergeLeisureProps();   // v10: one draw call per material for the static props
  registerGroupMaterials(leisure.group);
  scene.add(leisure.group);
  // CITY_DESIGN Cafe 4: the terrace light counts toward the light budget; it is included.
  for (const l of leisure.lights || []) { if (!l.parent) scene.add(l); }
}

/* ---------- v7: the city dressing (CONTRACT_V7 "City dressing") ----------
   js/city.js builds the filler buildings, street furniture, river dressing, bridges and the scooter
   rack rails from the plan and the sim state (v9: no parked cars; the scooters themselves are the
   renderer's pooled meshes, see syncScooters), merged per material, so the whole group costs
   about a hundred draw calls and arrives merged (its meshes carry userData.noMerge). Its glass and
   point lights are driven with the night ramp in updateBuildings; update animates the traffic lights
   and flags from stepWorld. */
function buildCityDressing() {
  try {
    // v8: filler lots sit at their plateau and every piece of furniture and rack at ctx.heightAt
    // v10: the terrain record (lot plateaus, retaining walls) and the water surface per body (boats)
    city = buildCity({ THREE, state: TT.state, plan: TT.sim.PLAN, sim: TT.sim, rng: TT.rng, heightAt: hAt, normalAt: (x, z, out) => nAt(x, z, out || new THREE.Vector3()), terrain: terrain || flatTerrain, waterLevel: waterLevelAt, surfaceLift: roads ? roads.surfaceLiftAt : undefined });
  } catch (e) { console.error('Thread Town: city dressing failed to build', e); city = null; return; }
  if (!city || !city.group) { city = null; return; }
  city.lights = city.lights || []; city.glass = city.glass || [];
  city.lightBase = city.lights.map(l => l.intensity);
  for (const l of city.lights) { l.visible = false; if (!l.parent) city.group.add(l); }
  registerGroupMaterials(city.group);
  scene.add(city.group);
  buildFounderStatue();
}
/* v14: the founder's statue on the plan's statue tile, on the plaza ground, facing its rot (0 = south). */
function buildFounderStatue() {
  const sp = TT.sim.PLAN && TT.sim.PLAN.statue;
  if (!sp || statue) return;
  try {
    const cx = sp.x + 0.5, cz = sp.y + 0.5;
    statue = buildStatue({ x: cx, z: cz, y: hAt(cx, cz) + liftAt(cx, cz), yaw: (sp.rot || 0) * Math.PI / 180 });
    registerGroupMaterials(statue.group);
    scene.add(statue.group);
  } catch (e) { console.error('Thread Town: the statue failed to build', e); statue = null; }
}
function plaqueOpen() { return !!(statue && statue.isOpen()); }
function statueCanOpen() {
  if (!statue || !walkOn || !player || !player.active || gameMode || subwayPhase || insideRoom) return false;
  const p = player;
  return p.state === 'idle' && !p.fade && !p.interior && !p.exiting;
}
function syncStatueWalk(p) {
  if (subwayPhase || !statueCanOpen() || !statue.near(p.pos.x, p.pos.y)) return;
  if (p.prompt !== SUBWAY_PROMPT && p.prompt !== KIOSK_PROMPT) p.prompt = STATUE_PROMPT;
}
function openPlaque() {
  if (!statue) return;
  try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* no lock to release */ }
  clearWalkKeys();
  statue.open();
}
/* The overview draw-call estimate: every visible renderable object under the scene (the active
   interior room and the runner scene excluded). Not part of the contract; for tuning. */
function countDrawables() {
  let n = 0;
  scene.updateMatrixWorld(true);
  scene.traverseVisible(o => { if (o.isMesh || o.isSprite || o.isLine || o.isPoints) n++; });
  return n;
}

/* ---------- agents ---------- */
function makeOverlayEl(cls) {
  const el = document.createElement('div');
  el.className = cls;
  el.style.position = 'absolute'; el.style.left = '0'; el.style.top = '0';
  el.style.opacity = '0'; el.style.visibility = 'hidden'; el.style.transition = 'opacity .15s';
  el.style.willChange = 'transform';
  overlay.appendChild(el);
  return el;
}

/* Builds the character for a department: an animal when dept.characters === 'animals', else an
   alien. Returns the handle plus the three per-kind functions the rest of the renderer calls
   through the record (rec.animate, rec.setOpacity, rec.dispose), so nothing downstream cares
   which kind it is. Both handles share one shape (group, parts, poseState, swingPhase, sipPhase). */
function isAnimalDept(dept) { return !!(dept && dept.characters === 'animals'); }
function makeCharacter(dept, seed, name) {
  const colorHex = dept.alien || dept.accent;
  if (isAnimalDept(dept) && makeAnimalMesh) {
    try {
      const handle = makeAnimalMesh(seed, colorHex, speciesForName(name || ''));
      if (handle && handle.group) return { handle, animate: animateAnimal, setOpacity: setAnimalOpacity, dispose: disposeAnimal };
    } catch (e) { console.warn('Thread Town: animal character failed to build, using an alien', e); }
  }
  const handle = makeAlienMesh(seed, colorHex, {});
  return { handle, animate: animateAlien, setOpacity: setAlienOpacity, dispose: disposeAlien };
}

function makeAgentRec(a) {
  const dept = a.dept || TT.DEPARTMENTS[0];
  const ch = makeCharacter(dept, a.spec.name + '|' + a.spec.role, a.spec.name);
  const handle = ch.handle;
  handle.group.userData.pick = { kind: 'agent', agent: a };
  handle.group.scale.setScalar(ALIEN_SCALE);
  // Own material per alien: setAlienOpacity writes opacity onto every material under the group,
  // so a shared shadowMat would fade every contact shadow in town with one alien.
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.64), shadowMat.clone());
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; shadow.castShadow = false; shadow.receiveShadow = false;
  handle.group.add(shadow);
  scene.add(handle.group);
  a.mesh = handle;
  if (!a.moveDir) a.moveDir = { x: 0, z: 1 };
  const rec = { agent: a, handle, shadow, tag: makeOverlayEl('tag'), bubble: makeOverlayEl('bubble'),
    bubbleText: null, bubbleKind: null, tagOn: false, bubbleOn: false, lastX: a.pos.x, lastZ: a.pos.y, tx: -1e9, ty: -1e9, bx: -1e9, by: -1e9,
    work: null, propKind: null, faded: false, seen: 0,
    // v10: the rendered group's last x and z (the foot plant distance clock, see syncAgents)
    gx: NaN, gz: NaN,
    // per-kind function slots (CONTRACT_V3): animateAlien or animateAnimal and so on
    animate: ch.animate, setOpacity: ch.setOpacity, dispose: ch.dispose };
  rec.tag.textContent = a.spec.name;
  agentRecs.set(a.id, rec);
  agentGroupList = Array.from(agentRecs.values(), r => r.handle.group);
  return rec;
}

function removeAgentRec(rec) {
  if (rec.work) endWork(rec, TT.state.time);
  if (rec.propKind) { detachProp(rec.handle); rec.propKind = null; }
  if (rec.tag.parentNode) rec.tag.parentNode.removeChild(rec.tag);
  if (rec.bubble.parentNode) rec.bubble.parentNode.removeChild(rec.bubble);
  rec.shadow.geometry.dispose();
  rec.shadow.material.dispose();
  scene.remove(rec.handle.group);
  rec.dispose(rec.handle);
  if (rec.agent.mesh === rec.handle) rec.agent.mesh = null;
  rec.agent.paused = false;
  if (followId === rec.agent.id) followId = null;
  agentRecs.delete(rec.agent.id);
  agentGroupList = Array.from(agentRecs.values(), r => r.handle.group);
}

const _setTip = (o) => { if (o.isMesh && o.material && o.material.emissive) o.material.emissiveIntensity = 0.35 + 1.0 * nightS; };

function showEl(rec, which, on, px, py) {
  const el = rec[which];
  const wasOn = which === 'tag' ? rec.tagOn : rec.bubbleOn;
  if (on) {
    const rx = Math.round(px), ry = Math.round(py);
    const kx = which === 'tag' ? 'tx' : 'bx', ky = which === 'tag' ? 'ty' : 'by';
    if (rec[kx] !== rx || rec[ky] !== ry) { rec[kx] = rx; rec[ky] = ry; el.style.transform = 'translate(-50%, -100%) translate(' + rx + 'px, ' + ry + 'px)'; }
    if (!wasOn) { el.style.visibility = 'visible'; el.style.opacity = '1'; }
  } else if (wasOn) { el.style.opacity = '0'; el.style.visibility = 'hidden'; }
  if (which === 'tag') rec.tagOn = on; else rec.bubbleOn = on;
}

function setFade(rec, alpha) {
  const a = clamp(alpha, 0, 1);
  if (a >= 1 && !rec.faded) return;
  rec.setOpacity(rec.handle, a);
  rec.faded = a < 1;
}

/* ---------- working flow (CONTRACT_V2 "Working flow") ---------- */
function beginWork(rec, a, time) {
  const br = deptRecById.get(a.dept.id) || null;
  const w = { br, mode: 'enter', t0: time, station: false, atStation: false, slot: 0 };
  if (br && br.activity && !br.worker) {
    br.worker = rec; w.station = true;
    br.phase.working = true; br.phaseAt = time;
  } else {
    // the station is taken (or there is no module): stand beside the work tile right away
    w.mode = 'at';
    if (br) w.slot = br.nextSlot++ % 3;
  }
  rec.work = w;
}
function beginExit(rec, time) {
  const w = rec.work;
  if (!w) return;
  if (!w.station) { endWork(rec, time); return; }
  w.mode = 'exit'; w.t0 = time;
  // Start the walk back from where the agent is actually rendered: an activity (the Risk high
  // wire for one) may have moved the handle away from the anchor while it owned the agent.
  const g = rec.handle.group;
  w.fx = g.position.x; w.fy = g.position.y; w.fz = g.position.z;
  g.rotation.z = 0;
  if (w.br.worker === rec) { w.br.phase.working = false; w.br.phaseAt = time; }
}
function endWork(rec, time) {
  const w = rec.work;
  if (!w) return;
  if (w.station && w.br && w.br.worker === rec) {
    w.br.worker = null;
    if (w.br.phase.working) { w.br.phase.working = false; w.br.phaseAt = time; }
  }
  const g = rec.handle.group;
  g.rotation.set(0, 0, 0); g.position.y = hAt(g.position.x, g.position.z);
  setFade(rec, 1);
  rec.work = null;
}
/* Positions a working (or leaving) alien and returns the pose override for this frame. */
function renderWork(rec, a, time) {
  const w = rec.work, g = rec.handle.group;
  const wp = a.dept.building.workPos;
  if (!w.station) {
    // the station is taken: stand beside the work tile in the v1 typing pose, facing the building
    const sx = (w.slot === 1 ? -0.7 : w.slot === 2 ? 0.7 : 0);
    const px = wp.x + sx, pz = wp.y + (w.slot ? 0.4 : 0);
    g.position.set(px, hAt(px, pz), pz);
    g.rotation.set(0, Math.PI, 0);
    return 'work';
  }
  const br = w.br, A = br.worldAnchor, dp = a.dept.building.doorPos;
  const el = time - w.t0;
  g.rotation.x = 0;
  // v8: the walks start and end on the terrain; the anchor already carries the lot plateau
  const wpY = hAt(wp.x, wp.y);
  if (w.mode === 'enter') {
    if (br.enter === 'walk') {
      const k = easeInOut(clamp(el / 0.6, 0, 1));
      g.position.set(lerp(wp.x, A.x, k), lerp(wpY, A.y, k), lerp(wp.y, A.z, k));
      const travel = Math.hypot(A.x - wp.x, A.z - wp.y) > 0.05 ? Math.atan2(A.x - wp.x, A.z - wp.y) : br.yaw;
      g.rotation.y = lerpAngle(travel, br.yaw, k);
      w.atStation = k >= 0.85;
      if (el >= 0.6) { w.mode = 'at'; return br.pose; }
      return k < 0.85 ? 'walk' : br.pose;
    }
    // inside: walk to the door, fade out, reappear at the anchor, fade in
    if (el < 0.8) {
      const k = easeInOut(el / 0.8);
      const px = lerp(wp.x, dp.x, k), pz = lerp(wp.y, dp.y, k);
      g.position.set(px, hAt(px, pz), pz);
      g.rotation.y = Math.atan2(dp.x - wp.x, dp.y - wp.y);
      setFade(rec, 1);
      return 'walk';
    }
    if (el < 1.2) {
      g.position.set(dp.x, hAt(dp.x, dp.y), dp.y);
      setFade(rec, 1 - (el - 0.8) / 0.4);
      return 'stand';
    }
    g.position.copy(A); g.rotation.y = br.yaw; w.atStation = true;
    if (el < 1.6) { setFade(rec, (el - 1.2) / 0.4); return br.pose; }
    setFade(rec, 1); w.mode = 'at';
    return br.pose;
  }
  if (w.mode === 'at') {
    g.position.copy(A); g.rotation.y = br.yaw; w.atStation = true;
    return br.pose;
  }
  // exit: reverse the entrance. The sim already has the agent reporting at workPos.
  if (a.state === 'commute' || a.state === 'working' || (a.state === 'idle' && a.path && a.path.length)) { endWork(rec, time); return undefined; }
  if (br.enter === 'walk') {
    const k = easeInOut(clamp(el / 0.6, 0, 1));
    // from the position captured in beginExit (not the anchor), so nothing teleports
    const fx = w.fx !== undefined ? w.fx : A.x, fy = w.fy !== undefined ? w.fy : A.y, fz = w.fz !== undefined ? w.fz : A.z;
    g.position.set(lerp(fx, wp.x, k), lerp(fy, wpY, k), lerp(fz, wp.y, k));
    const back = Math.hypot(wp.x - fx, wp.y - fz) > 0.05 ? Math.atan2(wp.x - fx, wp.y - fz) : br.yaw;
    g.rotation.y = back;
    // The agent is in report or error here, so aliens3d reads moveDir when the group yaw is 0;
    // write the travel direction so the rig and the group agree instead of sliding sideways.
    a.moveDir.x = Math.sin(back); a.moveDir.z = Math.cos(back);
    w.atStation = k < 0.15;
    if (el >= 0.6) { endWork(rec, time); return undefined; }
    return 'walk';
  }
  if (el < 0.4) { g.position.copy(A); g.rotation.y = br.yaw; w.atStation = true; setFade(rec, 1 - el / 0.4); return br.pose; }
  w.atStation = false;
  if (el < 0.8) { g.position.set(dp.x, hAt(dp.x, dp.y), dp.y); g.rotation.y = 0; setFade(rec, (el - 0.4) / 0.4); return 'stand'; }
  if (el < 1.6) {
    setFade(rec, 1);
    const k = easeInOut((el - 0.8) / 0.8);
    const px = lerp(dp.x, wp.x, k), pz = lerp(dp.y, wp.y, k);
    g.position.set(px, hAt(px, pz), pz);
    const back = Math.atan2(wp.x - dp.x, wp.y - dp.y);
    g.rotation.y = back;
    a.moveDir.x = Math.sin(back); a.moveDir.z = Math.cos(back);
    return 'walk';
  }
  endWork(rec, time);
  return undefined;
}

/* Places an idle or leisure character from its agent-shaped fields and returns 'swim', 'seated' or
   null. Swimmers get x and z from pos (animateLeisure owns height and heading), seated characters
   sit on the seat facing seat.face, everyone else stands on the ground at pos with the group yaw
   cleared so the rig follows moveDir. Shared by agents and the player (CONTRACT_V4 "Per-frame sync"). */
function placeCharacter(g, a, L) {
  if (L && L.kind === 'swim') {
    g.position.x = a.pos.x; g.position.z = a.pos.y; g.rotation.x = 0;
    return 'swim';
  }
  if (L && L.phase === 'seated' && L.seat) {
    const seat = L.seat, cx = seat.x + 0.5, cz = seat.y + 0.5;
    // CONTRACT: the sit pose already lowers the rig by parts.seatY, so the group sits on the seat surface.
    // v8: the seat itself stands on the terrain.
    g.position.set(cx, hAt(cx, cz) + (seat.kind === 'bench' ? BENCH_SEAT_Y : STOOL_SEAT_Y), cz);
    g.rotation.set(0, Math.atan2(seat.face.x - cx, seat.face.y - cz), 0);
    return 'seated';
  }
  g.position.set(a.pos.x, hAt(a.pos.x, a.pos.y) + liftAt(a.pos.x, a.pos.y), a.pos.y);   // v8: on the terrain; v10 final: plus the ribbon or slab under the feet
  g.rotation.set(0, 0, 0);
  return null;
}
/* v8: a contact shadow lies on the terrain under its character and tilts with the normal. The
   agents' shadows are children of their (yawed) groups, so the normal is turned into the group
   frame first; the player's shadow is a scene child. */
function placeShadow(shadow, g, groundY, local) {
  nAt(g.position.x, g.position.z, _n);
  if (local) {
    _n.applyAxisAngle(UP, -g.rotation.y);
    shadow.quaternion.setFromUnitVectors(Z_AXIS, _n);
    shadow.position.y = (groundY + 0.012 - Math.max(groundY, g.position.y)) / ALIEN_SCALE;
  } else {
    shadow.quaternion.setFromUnitVectors(Z_AXIS, _n);
    shadow.position.set(g.position.x, groundY + 0.012, g.position.z);
  }
}

/* v10 (CONTRACT_V10 "Performance budget"): far characters. Past AGENT_FAR from the camera (a
   few pixels tall) a character's rig hides and it is drawn as an instanced body and head in its
   team color, so the roster at the overview costs two draw calls instead of a few hundred.
   Hovered and selected agents and the one the visitor talks to keep their rig. Picking, tags
   and bubbles read the group, which keeps its transform while hidden. */
const AGENT_FAR = 140;
const farAgent = { body: null, head: null, cap: 0, count: 0 };
function ensureFarAgents(n) {
  if (farAgent.cap >= n) return;
  const cap = Math.max(24, Math.ceil(n * 1.5));
  for (const k of ['body', 'head']) if (farAgent[k]) { scene.remove(farAgent[k]); farAgent[k].dispose(); farAgent[k] = null; }
  const bodyGeo = new THREE.CapsuleGeometry(0.24, 0.40, 3, 8); bodyGeo.translate(0, 0.46, 0);
  const headGeo = new THREE.SphereGeometry(0.25, 8, 6); headGeo.translate(0, 0.98, 0);
  const mat = reg(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.7 }), 0.25);
  for (const [k, geo] of [['body', bodyGeo], ['head', headGeo]]) {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    im.name = 'far-agents'; im.userData.noMerge = true;
    scene.add(im);
    farAgent[k] = im;
  }
  farAgent.cap = cap;
}
function pushFarAgent(rec, a) {
  const g = rec.handle.group;
  g.updateMatrix();
  const k = farAgent.count++;
  _c.set((a.dept && (a.dept.alien || a.dept.accent)) || AQUA);
  farAgent.body.setMatrixAt(k, g.matrix); farAgent.body.setColorAt(k, _c);
  farAgent.head.setMatrixAt(k, g.matrix); farAgent.head.setColorAt(k, _c);
}
const FAR_AGENT_KEYS = ['body', 'head'];
function finishFarAgents() {
  for (let i = 0; i < FAR_AGENT_KEYS.length; i++) {
    const im = farAgent[FAR_AGENT_KEYS[i]];
    if (!im) continue;
    im.count = farAgent.count; im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.visible = farAgent.count > 0;
  }
}

/* v10: the foot plant distance clock (handle.distance, the animators' walk cycle) advances by
   the rendered group's xz travel since last frame; the first frame after a build or a respawn
   starts the clock, and a jump over TELEPORT_JUMP in one frame (a fade and reappear, a respawn,
   a room entry) advances nothing. rec.gx and rec.gz hold the last rendered position. */
const TELEPORT_JUMP = 3;
function advanceDistance(h, rec, x, z) {
  if (!isFinite(h.distance)) h.distance = 0;
  if (isFinite(rec.gx) && isFinite(rec.gz) && isFinite(x) && isFinite(z)) {
    const d = Math.hypot(x - rec.gx, z - rec.gz);
    if (d < TELEPORT_JUMP) h.distance += d;
  }
  rec.gx = x; rec.gz = z;
}

function syncAgents(dt, time) {
  const st = TT.state, show = st.settings.showDemo;
  const sel = st.selected, hov = st.hover;
  const stamp = ++agentStamp;
  farAgent.count = 0;
  ensureFarAgents(st.agents.length);
  const camP = camera ? camera.position : null;

  for (const a of st.agents) {
    const vis = show || !a.spec.demo;
    if (!vis) { const r0 = agentRecs.get(a.id); if (r0) removeAgentRec(r0); continue; }
    let rec = agentRecs.get(a.id);
    if (!rec) rec = makeAgentRec(a);
    rec.seen = stamp;
    const h = rec.handle, g = h.group;
    const isSel = !!(sel && sel.kind === 'agent' && sel.id === a.id), isHov = !!(hov && hov.kind === 'agent' && hov.id === a.id);
    // Hover pause: set on the hovered agent only; every other agent is cleared. CONTRACT_V4 adds the
    // talk pause: an agent the player spoke to stays paused (waving) until talkUntil passes.
    a.paused = isHov || (a.talkUntil !== undefined && a.talkUntil > time);

    // movement direction fallback (sim.tick normally sets it)
    const mx = a.pos.x - rec.lastX, mz = a.pos.y - rec.lastZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-4) { if (!a.moveDir) a.moveDir = { x: 0, z: 1 }; a.moveDir.x = mx / ml; a.moveDir.z = mz / ml; }
    rec.lastX = a.pos.x; rec.lastZ = a.pos.y;

    const L = a.state === 'leisure' ? a.leisure : null;
    let pose;
    let swimming = false, seated = false;

    // working flow
    if (a.state === 'working') {
      if (!rec.work || rec.work.mode === 'exit') { if (rec.work) endWork(rec, time); beginWork(rec, a, time); }
      pose = renderWork(rec, a, time);
    } else {
      if (rec.work && rec.work.mode !== 'exit') beginExit(rec, time);
      if (rec.work) pose = renderWork(rec, a, time);
    }

    if (!rec.work) {
      // swimmers and divers: x and z from the sim, height and heading from animateLeisure;
      // seated agents sit on the seat; everyone else stands on the ground at pos
      const where = placeCharacter(g, a, L);
      swimming = where === 'swim'; seated = where === 'seated';
      if (seated) {
        if (L.kind === 'icecream' || L.kind === 'coffee') {
          if (rec.propKind !== L.kind) { attachProp(h, L.kind); rec.propKind = L.kind; }
        } else if (rec.propKind) { detachProp(h); rec.propKind = null; }
      } else if (!swimming && a.paused && a.pose === 'wave') {
        // A waving agent faces the camera, or the player while it is talking to them (CONTRACT_V4 "Talk pause").
        const talking = walkOn && player && a.talkUntil !== undefined && a.talkUntil > time;
        const tx = talking ? player.pos.x : camera.position.x, tz = talking ? player.pos.y : camera.position.z;
        g.rotation.y = Math.atan2(tx - g.position.x, tz - g.position.z);
      }
      if (!seated && rec.propKind) { detachProp(h); rec.propKind = null; }
    } else if (rec.propKind) { detachProp(h); rec.propKind = null; }

    // v9: a riding agent stands on its scooter's deck (also while paused and waving)
    const rideSc = !rec.work && !swimming && !seated && a.scooter ? scooterById(a.scooter) : null;
    if (rideSc && rideSc.rider === a.id) placeAgentRider(rec, a, ml, dt);
    else { if (rec.riding) endAgentRide(rec); h.leanZ = 0; }

    // v10 (CONTRACT_V10 "Walking"): the walk cycle is tied to the distance the rendered body
    // travels, taken from the group after placement (the sim position, plus the station walk-in
    // and walk-out and the door walk, which move the group while a.pos stays at the work tile),
    // so the feet plant everywhere; a jump over TELEPORT_JUMP in one frame is a teleport
    advanceDistance(h, rec, g.position.x, g.position.z);

    // per-kind animate (alien or animal); the balance pose and every other activity pose pass straight through
    rec.animate(h, a, time, dt, pose);
    if (L) animateLeisure(h, a, time, dt);

    // contact shadow stays on the ground under the alien
    const walking = a.state === 'commute' || (a.state === 'idle' && a.path && a.path.length > 0);
    const hop = a.yoff ? clamp(-a.yoff / 3, 0, 1) : 0;
    const sh = 1 - 0.15 * hop;
    rec.shadow.visible = !swimming;
    rec.shadow.scale.set((walking ? 1.08 : 1) * sh, sh, 1);
    if (rec.shadow.visible) placeShadow(rec.shadow, g, hAt(g.position.x, g.position.z) + liftAt(g.position.x, g.position.z), true);

    // selection ring
    const ring = h.parts && h.parts.ring;
    if (ring) {
      ring.visible = isSel || isHov;
      // aliens3d.animateAlien owns the selected pulse; it reads ring.userData.selected each frame.
      ring.userData.selected = isSel;
      if (ring.visible) {
        ring.material.color.set(isSel ? '#9FE2E5' : AQUA);
        ring.material.opacity = isSel ? 1.0 : 0.85;
      } else ring.scale.set(1, 1, 1);
    }
    // antenna tips glow at night (aliens3d owns this when it exports setAlienNight)
    if (!setAlienNight && h.parts && h.parts.antennae) for (const an of h.parts.antennae) an.traverse(_setTip);
    // v10: far from the camera the rig hides and the character joins the instanced bodies
    const talking = a.talkUntil !== undefined && a.talkUntil > time;
    const far = !!camP && !isSel && !isHov && !talking && !swimming && g.position.distanceToSquared(camP) > AGENT_FAR * AGENT_FAR;
    if (far !== rec.far) { rec.far = far; g.visible = !far; }
    if (far) pushFarAgent(rec, a);
  }
  finishFarAgents();
  // deleting from a Map during for-of iteration is safe, so no snapshot copy is needed
  for (const rec of agentRecs.values()) if (rec.seen !== stamp) removeAgentRec(rec);
}

/* HTML tags and bubbles project from the rendered group position, so they follow swings, rooftops and dives. */
function updateOverlays() {
  const st = TT.state, sel = st.selected, hov = st.hover;
  // v5: inside a room every outdoor tag and bubble is hidden (the agents keep simulating outside)
  // v6: the same while the runner owns the view, so plaza tags and bubbles never float over the game
  if (insideRoom || gameMode) { for (const rec of agentRecs.values()) { showEl(rec, 'tag', false, 0, 0); showEl(rec, 'bubble', false, 0, 0); } return; }
  for (const rec of agentRecs.values()) {
    const a = rec.agent, g = rec.handle.group;
    const isSel = !!(sel && sel.kind === 'agent' && sel.id === a.id), isHov = !!(hov && hov.kind === 'agent' && hov.id === a.id);
    const working = a.state === 'working';
    _v.set(g.position.x, g.position.y + HEAD_Y + 0.5, g.position.z).project(camera);
    const px = (_v.x * 0.5 + 0.5) * viewW, py = (-_v.y * 0.5 + 0.5) * viewH;
    const onScreen = _v.z <= 1 && px > -40 && px < viewW + 40 && py > -40 && py < viewH + 40;
    const tagWanted = onScreen && (isSel || isHov || working);
    showEl(rec, 'tag', tagWanted, px, py);
    const bub = a.bubble;
    if (bub && onScreen) {
      if (rec.bubbleText !== bub.text || rec.bubbleKind !== bub.kind) {
        rec.bubbleText = bub.text; rec.bubbleKind = bub.kind;
        rec.bubble.textContent = bub.text;
        rec.bubble.className = bub.kind === 'error' ? 'bubble error' : 'bubble';
      }
      showEl(rec, 'bubble', true, px, py - (tagWanted ? 26 : 2));
    } else showEl(rec, 'bubble', false, 0, 0);
  }
}

/* ---------- walk mode: the player (CONTRACT_V4 "Renderer integration") ----------
   js/player.js owns movement, collision, the state machine and the camera pose; this section owns
   the rendered character (handle, contact shadow, held prop, station use), the input feed, the
   camera hand-off and the HUD elements (#walk-hud, #walk-prompt) by id. v7: third person only. */
const WALK_KEY_MAP = { w: 'fwd', ArrowUp: 'fwd', s: 'back', ArrowDown: 'back', a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right' };
/* v5 adds: jumpHeld (Space held, the golf charge), zoom (wheel deltaY, chase view), club1 2 3 and quit (X) edges. */
/* v8 adds: drive (Tab), the cart's auto-drive edge. */
/* v11 adds: hover (H, the hoverboard summon or hop off edge) and boost (Shift held, the same key as run). */
const WALK = { fwd: false, back: false, left: false, right: false, run: false, jump: false, jumpHeld: false, interact: false, view: false, lookDX: 0, lookDY: 0, zoom: 0, club1: false, club2: false, club3: false, quit: false, drive: false, hover: false };
const walkInput = { fwd: 0, side: 0, run: false, jump: false, jumpHeld: false, interact: false, lookDX: 0, lookDY: 0, toggleView: false, zoom: 0, club1: false, club2: false, club3: false, quit: false, drive: false, hover: false, boost: false };
let extInput = null;           // headless input from TT.town.setWalkInput (edges consumed after one frame)
const hudEls = { hud: null, prompt: null };
let promptKey = '';
/* v5 HUD element cache (by id) and the last written values, so a steady frame touches no DOM. */
const v5Els = {};
const hudState = { title: '', club: '', cells: ['', '', '', ''], best: '', balls: '', dim: null, powerW: -1, hot: null, band: null, msg: '', hint: '', fade: -1,
  // v8: the round line, the round card row, the running to par and its class, the round clock, the cart line
  roundLine: '', rcells: [], toPar: '', toParCls: null, rtime: '', cart: '' };
function v5El(id) {
  let el = v5Els[id];
  if (el === undefined) { el = document.getElementById(id) || null; v5Els[id] = el; }
  return el;
}
function setHidden(el, hidden) { if (el && el.hidden !== hidden) el.hidden = hidden; }
function setText(el, key, text) { if (el && hudState[key] !== text) { hudState[key] = text; el.textContent = text; } }

function playerSpecKey(spec) {
  return [spec.kind || 'alien', spec.species || '', spec.color || AQUA, spec.name || 'You'].join('|');
}
/* The species id a visitor spec resolves to (the same chain buildPlayerHandle uses), or 'alien'. */
function playerCharacterId(spec) {
  if (!spec || spec.kind !== 'animal' || !makeAnimalMesh) return 'alien';
  return spec.species || speciesForName(spec.name || '') || (ANIMAL_SPECIES.length ? ANIMAL_SPECIES[0] : null) || 'alien';
}
/* The visitor's character from the agent factories: an alien or an animal by spec.kind, with the
   per-kind animate, setOpacity and dispose slots. Shared by the walk-mode body and the subway runner
   (v6), so the runner is the same character the visitor walks around as. */
function makeCharacterForSpec(spec) {
  const seed = 'player|' + (spec.name || 'You') + '|' + (spec.species || '');
  const color = spec.color || AQUA;
  let ch = null;
  if (spec.kind === 'animal' && makeAnimalMesh) {
    try {
      const species = spec.species || speciesForName(spec.name || '') || (ANIMAL_SPECIES.length ? ANIMAL_SPECIES[0] : null);
      const handle = makeAnimalMesh(seed, color, species);
      if (handle && handle.group) ch = { handle, animate: animateAnimal, setOpacity: setAnimalOpacity, dispose: disposeAnimal };
    } catch (e) { console.warn('Thread Town: player animal failed to build, using an alien', e); }
  }
  if (!ch) {
    const handle = makeAlienMesh(seed, color, {});
    ch = { handle, animate: animateAlien, setOpacity: setAlienOpacity, dispose: disposeAlien };
  }
  return ch;
}
/* Builds the player's character with the agent factories: an alien or an animal by spec.kind, at
   ALIEN_SCALE, with a standalone contact shadow (a scene child, so hiding the body keeps the shadow). */
function buildPlayerHandle(spec) {
  const ch = makeCharacterForSpec(spec);
  const h = ch.handle;
  h.group.scale.setScalar(ALIEN_SCALE);
  h.group.userData.player = true;
  if (h.parts && h.parts.ring) h.parts.ring.visible = false;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.64), shadowMat.clone());
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; shadow.castShadow = false; shadow.receiveShadow = false;
  shadow.scale.setScalar(ALIEN_SCALE);
  return {
    handle: h, shadow, animate: ch.animate, setOpacity: ch.setOpacity, dispose: ch.dispose,
    propKind: null, specKey: playerSpecKey(spec), inScene: false,
    station: null, stationT0: 0, atStation: false, from: new THREE.Vector3(),
    // v5: the rendered position handed to player.anchorPos at a station, the club in hand, the last stroke count
    anchor: new THREE.Vector3(), clubProp: null, clubKind: null, lastStrokes: 0,
    // v10: the last rendered position (the foot plant distance clock) and the last body yaw (the turn rate)
    gx: NaN, gz: NaN, lastYaw: NaN,
  };
}
function disposePlayerRec() {
  if (!playerRec) return;
  leaveStation(TT.state.time);
  setClubProp(null);
  if (playerRec.propKind) { detachProp(playerRec.handle); playerRec.propKind = null; }
  setPlayerInScene(false);
  playerRec.shadow.geometry.dispose(); playerRec.shadow.material.dispose();
  playerRec.dispose(playerRec.handle);
  playerRec = null;
}
function setPlayerInScene(on) {
  if (!playerRec || playerRec.inScene === on) return;
  if (on) { scene.add(playerRec.handle.group); scene.add(playerRec.shadow); }
  else { scene.remove(playerRec.handle.group); scene.remove(playerRec.shadow); }
  playerRec.inScene = on;
}
/* Makes sure the character matches the spec, rebuilding it when kind, species, color or name changed. */
function ensurePlayerRec(spec) {
  const key = playerSpecKey(spec);
  if (playerRec && playerRec.specKey === key) return playerRec;
  const wasIn = playerRec ? playerRec.inScene : false;
  disposePlayerRec();
  playerRec = buildPlayerHandle(spec);
  if (wasIn) setPlayerInScene(true);
  if (player) player.mesh = playerRec.handle;
  return playerRec;
}

/* Station use: the player marks the station busy (rec.worker = 'player') so agents stand beside it,
   walks in over 0.6 s like a working agent (or fades and teleports when enter === 'inside'), then
   the activity runs with the player's handle from updateActivities. The camera follows the rendered
   body through player.anchorPos (CONTRACT_V5 "Stations"), written every frame while at a station. */
function enterStation(br, time) {
  const pr = playerRec;
  if (!br || !br.activity) return;
  // player.js claims rec.worker = 'player' itself (and refuses a taken station); the renderer owns the phase.
  if (!br.worker) br.worker = 'player';
  if (br.worker === 'player') { br.phase.working = true; br.phaseAt = time; }
  pr.station = br; pr.stationT0 = time; pr.atStation = false;
  // walk in from where the body was rendered last frame (player.pos is already at the anchor)
  const g = pr.handle.group;
  pr.from.set(g.position.x, g.position.y, g.position.z);
  pr.anchor.copy(pr.from);
  stationFade = 0;
}
function leaveStation(time) {
  const pr = playerRec;
  if (!pr || !pr.station) return;
  const br = pr.station;
  if (br.worker === 'player') br.worker = null;
  // player.js may have cleared worker already; reset the phase unless an agent has since taken the station
  if (br.phase.working && (br.worker === null || br.worker === 'player')) { br.phase.working = false; br.phaseAt = time; }
  pr.station = null; pr.atStation = false; stationFade = 0;
  const g = pr.handle.group;
  g.rotation.set(0, 0, 0); g.position.y = 0;
}
/* Positions the player at its station and returns the pose override; mirrors renderWork for a walk-in.
   pr.anchor is where the body was rendered (the walk-in point, or where the activity left it last
   frame, since the high wire moves the handle after this sync); player.anchorPos points at it. */
function renderPlayerStation(time) {
  const pr = playerRec, br = pr.station, A = br.worldAnchor, g = pr.handle.group;
  const el = time - pr.stationT0;
  g.rotation.x = 0; g.rotation.z = 0;
  if (br.enter === 'inside') {
    // CONTRACT_V5: a 0.3 s fade at the door, then the handle appears at the anchor and fades back in
    if (el < STATION_FADE) {
      const f = pr.from;
      g.position.copy(f);
      g.rotation.y = Math.hypot(A.x - f.x, A.z - f.z) > 0.05 ? Math.atan2(A.x - f.x, A.z - f.z) : br.yaw;
      pr.atStation = false; stationFade = clamp(el / STATION_FADE, 0, 1);
      pr.anchor.copy(f);
      return 'stand';
    }
    stationFade = el < 2 * STATION_FADE ? clamp(1 - (el - STATION_FADE) / STATION_FADE, 0, 1) : 0;
    if (pr.atStation) pr.anchor.copy(g.position); else pr.anchor.copy(A);
    g.position.copy(A); g.rotation.y = br.yaw; pr.atStation = true;
    return br.pose;
  }
  if (el >= 0.6) {
    if (pr.atStation) pr.anchor.copy(g.position); else pr.anchor.copy(A);
    g.position.copy(A); g.rotation.y = br.yaw; pr.atStation = true;
    return br.pose;
  }
  const k = easeInOut(clamp(el / 0.6, 0, 1));
  const f = pr.from;
  g.position.set(lerp(f.x, A.x, k), lerp(f.y, A.y, k), lerp(f.z, A.z, k));
  const travel = Math.hypot(A.x - f.x, A.z - f.z) > 0.05 ? Math.atan2(A.x - f.x, A.z - f.z) : br.yaw;
  g.rotation.y = lerpAngle(travel, br.yaw, k);
  pr.atStation = k >= 0.85;
  pr.anchor.copy(g.position);
  return k < 0.85 ? 'walk' : br.pose;
}

/* Feeds one frame of input to the player: keys plus any headless input, edges consumed once.
   v12: the touch layer's read (readTouch) merges the same way as extInput: fwd and side added and
   clamped, edges ORed, look deltas and zoom added, hover, boost, drive, club, quit and map mapped
   to their walk keys (the Club button cycles club1, club2, club3 from the club in hand). */
function feedPlayerInput() {
  const ext = extInput;
  const tin = readTouch();
  let fwd = (WALK.fwd ? 1 : 0) - (WALK.back ? 1 : 0);
  let side = (WALK.right ? 1 : 0) - (WALK.left ? 1 : 0);
  if (ext) { fwd = clamp(fwd + (ext.fwd || 0), -1, 1); side = clamp(side + (ext.side || 0), -1, 1); }
  if (tin) { fwd = clamp(fwd + (isFinite(tin.fwd) ? tin.fwd : 0), -1, 1); side = clamp(side + (isFinite(tin.side) ? tin.side : 0), -1, 1); }
  walkInput.fwd = fwd; walkInput.side = side;
  walkInput.run = WALK.run || !!(ext && ext.run) || !!(tin && tin.run);
  walkInput.jump = WALK.jump || !!(ext && ext.jump) || !!(tin && tin.jump);
  walkInput.jumpHeld = WALK.jumpHeld || !!(ext && ext.jumpHeld) || !!(tin && tin.jumpHeld);
  walkInput.interact = WALK.interact || !!(ext && ext.interact) || !!(tin && tin.interact);
  // v6: the subway prompt belongs to the renderer, so the interact edge is consumed here before the
  // player sees it; the whole feed is muted while the overlay fades around the scene switch
  if (walkInput.interact && subwayCanEnter() && inSubwayZone(player.pos.x, player.pos.y)) { walkInput.interact = false; requestSubway(TT.state.time); }
  // v11: the kiosk prompt belongs to the renderer too: E in front of the kiosk opens the shop
  if (walkInput.interact && kioskCanOpen() && nearKiosk(player.pos.x, player.pos.y)) { walkInput.interact = false; openShopFrom('kiosk'); }
  // v14: and E in front of the founder's statue opens the plaque note
  if (walkInput.interact && player.prompt === STATUE_PROMPT && statueCanOpen() && statue.near(player.pos.x, player.pos.y)) { walkInput.interact = false; openPlaque(); }
  walkInput.hover = WALK.hover || !!(ext && ext.hover) || !!(tin && tin.hover);                      // v11: H, the hoverboard edge
  walkInput.boost = WALK.run || !!(ext && (ext.boost || ext.run)) || !!(tin && tin.boost);          // v11: Shift held boosts while riding; v12: the Boost button
  if (ext && ext.map && minimap) minimap.toggle();                                                   // v11: the headless M toggles the corner map
  if (tin && tin.map) { if (mapOpenNow()) closeMap(); else if (!openMap() && minimap) minimap.toggle(); }   // v13: the touch Map button opens the town map
  if (ext && ext.openMap) openMap();                                                                  // v13: headless open and close
  if (ext && ext.closeMap) closeMap();
  if (ext && ext.go) goRoute();                                                                      // v13: headless Go
  // v11: while the shop modal is up the keys belong to it (ui.js treats it as an open modal); v13: the open map too
  if (subwayPhase || shopOpen() || mapOpenNow() || plaqueOpen()) { walkInput.fwd = 0; walkInput.side = 0; walkInput.run = false; walkInput.jump = false; walkInput.jumpHeld = false; walkInput.interact = false; walkInput.hover = false; walkInput.boost = false; }
  walkInput.toggleView = WALK.view || !!(ext && ext.toggleView) || !!(tin && tin.toggleView);
  walkInput.lookDX = WALK.lookDX + (ext && isFinite(ext.lookDX) ? ext.lookDX : 0) + (tin && isFinite(tin.lookDX) ? tin.lookDX : 0);
  walkInput.lookDY = WALK.lookDY + (ext && isFinite(ext.lookDY) ? ext.lookDY : 0) + (tin && isFinite(tin.lookDY) ? tin.lookDY : 0);
  // the wheel sets the chase distance (v7: the chase camera is the only walk view); v12: the pinch too
  walkInput.zoom = WALK.zoom + (ext && isFinite(ext.zoom) ? ext.zoom : 0) + (tin && isFinite(tin.zoom) ? tin.zoom : 0);
  walkInput.club1 = WALK.club1 || !!(ext && ext.club1);
  walkInput.club2 = WALK.club2 || !!(ext && ext.club2);
  walkInput.club3 = WALK.club3 || !!(ext && ext.club3);
  if (tin && tin.club) {
    // the Club button cycles driver, iron, putter from the club in hand
    const cur = player.golf && player.golf.club;
    if (cur === 'driver') walkInput.club2 = true; else if (cur === 'iron') walkInput.club3 = true; else walkInput.club1 = true;
  }
  walkInput.quit = WALK.quit || !!(ext && ext.quit) || !!(tin && tin.quit);
  walkInput.drive = WALK.drive || !!(ext && (ext.drive || ext.tab)) || !!(tin && tin.drive);   // v8: Tab, the cart auto-drive; v12: the Tab button
  player.setInput(walkInput);
  WALK.jump = WALK.interact = WALK.view = WALK.club1 = WALK.club2 = WALK.club3 = WALK.quit = WALK.drive = WALK.hover = false; WALK.lookDX = WALK.lookDY = WALK.zoom = 0;
  if (ext) { ext.jump = ext.interact = ext.toggleView = ext.club1 = ext.club2 = ext.club3 = ext.quit = ext.drive = ext.tab = ext.hover = ext.map = ext.openMap = ext.closeMap = ext.go = false; ext.lookDX = ext.lookDY = ext.zoom = 0; }
}

/* ---------- v12: the touch layer (CONTRACT_V12 "The touch layer", "Wiring") ----------
   Built on a mount div over the view once isTouch is true and js/touch.js exports createTouch; every
   call into it is guarded so a missing or failing export never stops the frame. readTouch returns
   TOUCH_IN filled by touch.read while the controls are live, else null (and TOUCH_IN cleared), so
   the walk feed and the subway feed can merge it like extInput. */
function clearTouchIn() {
  const t = TOUCH_IN;
  t.fwd = t.side = t.lookDX = t.lookDY = t.zoom = 0;
  t.run = t.jump = t.jumpHeld = t.interact = t.hover = t.boost = t.drive = t.toggleView = t.map = t.club = t.quit = false;
  t.swipeLeft = t.swipeRight = t.swipeUp = t.swipeDown = t.tap = false;
}
function readTouch() {
  if (!touch || !touchLive || typeof touch.read !== 'function') { clearTouchIn(); return null; }
  try { touch.read(TOUCH_IN); } catch (e) { clearTouchIn(); return null; }
  return TOUCH_IN;
}
function buildTouchLayer() {
  if (!isTouch || !createTouch || !container || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  // the mount is the stage host (the div over the view): the layer appends its own #touch-layer there
  // and writes --touch-stack on the mount, which css reads on #minimap (a sibling, so the host it is)
  touchMount = container;
  try {
    touch = createTouch({
      mount: touchMount, isTouch,
      onToggleView: () => { if (camMode === 'walk' && !gameMode) WALK.view = true; },
      onQuit: () => { if (gameMode === 'subway') SUB.quit = true; else if (camMode === 'walk') WALK.quit = true; },
    }) || null;
  } catch (e) { console.warn('Thread Town: the touch layer failed to build', e); touch = null; }
  if (touch && touch.el && !touch.el.parentNode && touchMount.appendChild) { try { touchMount.appendChild(touch.el); } catch (e) { /* the layer mounts itself */ } }
  if (!touch) touchMount = null;
  setTouchLive(touchCoarse);
}
/* The controls go live (the html 'touch' class, the 120 px minimap, the mode) or hide again. */
function setTouchLive(on) {
  on = !!on && isTouch;
  if (on === touchLive) return;
  touchLive = on;
  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
    try { document.documentElement.classList.toggle('touch', on); } catch (e) { /* ignore */ }
  }
  applyTouchLayout();
  if (subway && typeof subway.setTouch === 'function') { try { subway.setTouch(on); } catch (e) { /* ignore */ } }
  if (controls) { applyControlsTouches(); applyCameraMode(); }   // the touch mapping and the camera hint read touchLive
  syncTouchMode();
}
/* OrbitControls' touch mapping: one finger orbits and two fingers pinch while the controls are live
   (a coarse pointer, or a touchscreen laptop after its first touch); the v11 mapping otherwise. */
function applyControlsTouches() {
  if (!controls) return;
  controls.touches = (touchLive || touchCoarse)
    ? { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    : { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
}
/* The minimap is 120 px on touch (the slot's inline size; the canvases fill it). */
function applyTouchLayout() {
  if (!isTouch || !minimapMount || !minimapMount.style) return;
  const px = touchLive ? '120px' : '';
  if (minimapMount.style.width !== px) { minimapMount.style.width = px; minimapMount.style.height = px; }
}
/* The mode the layer shows buttons for: the player state while walking, 'runner' in the subway,
   'none' outside walk mode, behind the shop modal and while the overlay fades around a scene switch. */
function touchModeNow() {
  if (!touchLive || !walkOn || !player) return 'none';
  if (gameMode === 'subway') return 'runner';
  if (subwayPhase || shopOpen() || mapOpenNow() || plaqueOpen()) return 'none';   // v13: the open town map takes the view like the shop
  const s = player.state;
  return s === 'hover' ? 'hover' : s === 'scooter' ? 'ride' : s === 'boat' ? 'boat' : s === 'golf' ? 'golf' : s === 'cart' ? 'cart' : 'walk';
}
function syncTouchMode() {
  if (!touch || typeof touch.setMode !== 'function') return;
  const mode = touchModeNow();
  const owned = !!(wallet && typeof wallet.owns === 'function' && wallet.owns('hoverboard'));
  const key = mode + (owned ? '+h' : '');
  if (key === touchKey) return;
  touchKey = key;
  TOUCH_MODE_OPTS.hover = owned; TOUCH_MODE_OPTS.hoverOwned = owned;
  try { touch.setMode(mode, TOUCH_MODE_OPTS); } catch (e) { /* the layer keeps its last mode */ }
}
/* navigator.vibrate through the layer (a landing, a catch, holing out); nothing without the controls. */
function buzz(ms) {
  if (!touch || !touchLive || typeof touch.vibrate !== 'function') return;
  try { touch.vibrate(ms); } catch (e) { /* ignore */ }
}
/* The walk-side vibration edges, after the player stepped this frame. */
function syncBuzz(p) {
  const pose = p.pose || '';
  if (buzzState.pose === 'hop' && pose !== 'hop') buzz(25);
  buzzState.pose = pose;
  const air = !!(p.state === 'hover' && p.hover && p.hover.airborne);
  if (buzzState.hoverAir && !air && p.state === 'hover') buzz(35);
  buzzState.hoverAir = air;
  const phase = p.golf && p.state === 'golf' ? (p.golf.phase || '') : '';
  if (phase === 'holed' && buzzState.golfPhase !== 'holed') buzz(60);
  buzzState.golfPhase = phase;
}
function clearWalkKeys() {
  WALK.fwd = WALK.back = WALK.left = WALK.right = WALK.run = WALK.jumpHeld = false;
  WALK.jump = WALK.interact = WALK.view = WALK.club1 = WALK.club2 = WALK.club3 = WALK.quit = WALK.drive = WALK.hover = false; WALK.lookDX = WALK.lookDY = WALK.zoom = 0;
}

/* ---------- golf props (CONTRACT_V5 "Golf", GOLF_DESIGN "Props") ----------
   The club hangs from handL with local -y along the shaft from the hand; the head sits at the far
   end, 0.02 toward +z. Materials are the club's own (setOpacity writes onto everything under the
   group, so the shared cache must not be touched). */
function makeClubProp(kind) {
  const g = new THREE.Group(); g.name = 'club-' + kind;
  const L = CLUB_LEN[kind] || CLUB_LEN.iron;
  const silver = reg(new THREE.MeshStandardMaterial({ color: SILVER, roughness: 0.35, metalness: 0.6 }), 0.6);
  const navy = reg(new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.6, metalness: 0.2 }), 0.25);
  const shaft = mesh(new THREE.CylinderGeometry(0.012, 0.014, L, 8), silver, g, true, false); shaft.position.y = -L / 2;
  const grip = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.11, 8), navy, g, false, false); grip.position.y = -0.055;
  let head;
  if (kind === 'driver') head = mesh(new RoundedBoxGeometry(0.11, 0.075, 0.07, 2, 0.02), navy, g, true, false);
  else if (kind === 'putter') head = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.035), reg(new THREE.MeshStandardMaterial({ color: AQUA, roughness: 0.5, metalness: 0.2 }), 0.25), g, true, false);
  else { head = mesh(new THREE.BoxGeometry(0.09, 0.07, 0.015), reg(new THREE.MeshStandardMaterial({ color: SILVER, roughness: 0.35, metalness: 0.6 }), 0.6), g, true, false); head.rotation.y = 0.45; }
  head.position.set(0, -L + 0.03, 0.02);
  return g;
}
/* Puts the club of the given kind (or none) in the player's left hand. */
function setClubProp(kind) {
  const pr = playerRec;
  if (!pr || pr.clubKind === kind) return;
  if (pr.clubProp && pr.clubProp.parent) pr.clubProp.parent.remove(pr.clubProp);
  pr.clubProp = null; pr.clubKind = null;
  if (!kind) return;
  let prop = clubProps[kind];
  if (!prop) { prop = makeClubProp(kind); clubProps[kind] = prop; }
  const parent = (pr.handle.parts && pr.handle.parts.handL) || pr.handle.group;
  parent.add(prop);
  pr.clubProp = prop; pr.clubKind = kind;
}
/* v10: the aim shows the carry arc as a dotted curve (points along the predicted flight from the
   club's launch speed and elevation at the previewed or live power, under GOLF.GRAVITY, until it
   meets the ground), the landing ring where the arc lands, and the impact flash. A putt has no
   arc, so its dots run along the ground for the aim length. */
function ensureGolfFx() {
  if (aimLine) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_N * 3), 3));
  const pm = new THREE.PointsMaterial({ color: AQUA, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  pm.fog = false;
  aimLine = new THREE.Points(geo, pm);
  aimLine.renderOrder = 9; aimLine.frustumCulled = false; aimLine.visible = false;
  scene.add(aimLine);
  const rg = new THREE.RingGeometry(0.14, 0.2, 24); rg.rotateX(-Math.PI / 2);
  const rm = new THREE.MeshBasicMaterial({ color: AQUA, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  rm.fog = false;
  aimRing = new THREE.Mesh(rg, rm);
  aimRing.renderOrder = 9; aimRing.visible = false; aimRing.castShadow = false; aimRing.receiveShadow = false;
  scene.add(aimRing);
  golfFlash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9, depthWrite: false }));
  golfFlash.visible = false; golfFlash.castShadow = false; golfFlash.receiveShadow = false;
  scene.add(golfFlash);
}
function updateGolfFx(time) {
  const p = player;
  const g = walkOn && p && p.state === 'golf' ? p.golf : null;
  const ball = g && g.ball && g.ball.pos ? g.ball : null;
  const show = !!(ball && (g.phase === 'aim' || g.phase === 'charging'));
  if (golfFlash && golfFlash.visible && time > flashUntil) golfFlash.visible = false;
  if (!show) { if (aimLine) { aimLine.visible = false; aimRing.visible = false; } return; }
  ensureGolfFx();
  const yaw = isFinite(g.aimYaw) ? g.aimYaw : 0, sx = Math.sin(yaw), sz = Math.cos(yaw);
  const bx = isFinite(ball.pos.x) ? ball.pos.x : p.pos.x, bz = isFinite(ball.pos.z) ? ball.pos.z : p.pos.y;
  const by = isFinite(ball.pos.y) ? ball.pos.y : hAt(bx, bz);
  const pos = aimLine.geometry.attributes.position;
  const club = (GOLF.CLUBS && GOLF.CLUBS[g.club]) || null;
  const power = clamp(g.phase === 'charging' ? (isFinite(g.power) ? g.power : 0) : (isFinite(g.aimPower) ? g.aimPower : 0.7), 0, 1);
  const elev = club && isFinite(club.elevation) ? club.elevation : 0;
  const speed = club && isFinite(club.maxSpeed) ? club.maxSpeed * (0.25 + 0.75 * power) : 0;
  let lx = bx, lz = bz, on = false;
  if (club && speed > 0 && elev > 0) {
    // the carry: integrate the ballistic arc until it meets the ground (no drag, so a hair long)
    const gr = isFinite(GOLF.GRAVITY) ? GOLF.GRAVITY : 20;
    const vh = speed * Math.cos(elev), vy = speed * Math.sin(elev);
    let t = 0, tEnd = -1;
    const step = 0.02;
    for (let k = 0; k < 600; k++) {
      t += step;
      const d = vh * t, y = by + vy * t - 0.5 * gr * t * t;
      const px = bx + sx * d, pz = bz + sz * d;
      if (y <= hAt(px, pz) + 0.05 && t > 0.1) { tEnd = t; break; }
    }
    if (tEnd < 0) tEnd = 2 * vy / gr;
    for (let i = 0; i < AIM_N; i++) {
      const tt = tEnd * i / (AIM_N - 1), d = vh * tt;
      const px = bx + sx * d, pz = bz + sz * d;
      const y = Math.max(by + vy * tt - 0.5 * gr * tt * tt, hAt(px, pz) + 0.03);
      pos.setXYZ(i, px, y, pz);
    }
    const dl = vh * tEnd;
    lx = bx + sx * dl; lz = bz + sz * dl;
    on = dl > 0.05;
  } else {
    // a putt rolls: dots along the ground for the aim length
    const len = clamp(isFinite(g.aimLen) ? g.aimLen : 0, 0, AIM_MAX);
    for (let i = 0; i < AIM_N; i++) {
      const d = i / (AIM_N - 1) * len, px = bx + sx * d, pz = bz + sz * d;
      pos.setXYZ(i, px, hAt(px, pz) + 0.03, pz);
    }
    lx = bx + sx * len; lz = bz + sz * len;
    on = len > 0.05;
  }
  pos.needsUpdate = true;
  aimLine.geometry.computeBoundingSphere();
  aimLine.visible = on; aimRing.visible = on;
  aimRing.position.set(lx, hAt(lx, lz) + 0.03, lz);
}
/* A 0.04 s white flash at the ball when a swing strikes it (strokes rise while swinging or in flight). */
function noteStrike(g, time) {
  const pr = playerRec;
  const strokes = g ? (g.strokes | 0) : 0;
  if (!g) { pr.lastStrokes = 0; return; }
  if (strokes > pr.lastStrokes && (g.phase === 'swinging' || g.phase === 'flight') && g.ball && g.ball.pos) {
    ensureGolfFx();
    golfFlash.position.copy(g.ball.pos); golfFlash.visible = true; flashUntil = time + 0.04;
  }
  pr.lastStrokes = strokes;
}

/* Per-frame sync (after TT.sim.tick, before rendering): step the player, place and animate its
   character the way agents are placed, then hand the camera to player.cameraPose. */
/* v8: the player's ground outdoors is the terrain under its feet. player.floorY (the room floor
   inside) carries it so the chase camera, the body and the shadow share one height; at a station
   and during the walk-out the heights in play are absolute already (the anchor and the lerp to
   the ground), so floorY is 0 there. The walk-out target is lifted to the terrain each frame. */
function syncPlayerGround(p) {
  if (p.interior) return;
  const E = p.exiting;
  if (E && E.to && isFinite(E.to.x) && isFinite(E.to.z)) E.to.y = hAt(E.to.x, E.to.z);
  p.floorY = (p.state === 'station' || E) ? 0 : hAt(p.pos.x, p.pos.y);
  // v14: on foot or on a scooter on the marina dock the chase camera follows the plank top, not the lake bed
  if (!E && (p.state === 'idle' || p.state === 'route' || p.state === 'scooter')) p.floorY += dockLiftAt(p.pos.x, p.pos.y);
}
function syncPlayer(dt, time) {
  if (!walkOn || !player || !playerRec) return;
  const p = player;
  feedPlayerInput();
  syncPlayerGround(p);
  p.update(dt, time);
  syncPlayerGround(p);
  syncCart(dt);
  syncBoats(dt);          // v11: the boats before the rider, so the seat is where the hull is this frame
  syncHoverboard(p, dt);  // v11: the board before the rider, so the lean the body takes is this frame's
  if (touch) syncBuzz(p); // v12: the landing and holing out vibrations
  const pr = playerRec, h = pr.handle, g = h.group;
  const L = p.state === 'leisure' ? p.leisure : null;
  const G = p.state === 'golf' ? p.golf : null;
  const floorY = isFinite(p.floorY) ? p.floorY : 0;
  const inCart = p.state === 'cart' && !!p.cart && !!cartRec && cartRec.group.visible;
  // v9: the visitor's scooter (player.scooter is the riding record, its id the state.scooters id)
  const ride = p.state === 'scooter' && p.scooter && typeof p.scooter === 'object' ? p.scooter : null;
  const rideRec = ride ? scooterRecs.get(ride.id) || null : null;
  // v11: the hoverboard ride record and the boat the visitor sits in (its pooled mesh)
  const hov = p.state === 'hover' && p.hover && typeof p.hover === 'object' ? p.hover : null;
  const boatRec = p.state === 'boat' && p.boat && typeof p.boat === 'object' ? boatRecs.get(p.boat.id) || null : null;
  const inBoat = !!boatRec;
  let pose, swimming = false, seated = false;

  // station use: enter and leave follow player.station
  const want = p.state === 'station' ? (p.station || null) : null;
  if (want !== pr.station) { leaveStation(time); if (want) enterStation(want, time); }
  if (pr.station) {
    pose = renderPlayerStation(time);
    p.anchorPos = pr.anchor;
    h.turnRate = 0;
  } else {
    p.anchorPos = null;
    const where = placeCharacter(g, p, L);
    swimming = where === 'swim'; seated = where === 'seated';
    // idle on the pier planks (the land half of the pier tile, or right after the climb): stand at
    // deck height. deckY excludes the hop lift, which the animator already applies through yoff.
    // Inside a room the floor is the room's floorY (v5).
    // v10 final: the ribbon or slab lift outdoors; v14: deckY is the plank top itself, and outdoors the
    // body stands on the terrain plus the lift (floorY also carries the marina dock for the camera)
    if (where === null) g.position.y = p.interior ? floorY : (p.deckY > 0 ? p.deckY : hAt(p.pos.x, p.pos.y) + liftAt(p.pos.x, p.pos.y));
    // the station walk-out (v5): the body eases from the anchor height down to the ground
    const E = p.exiting;
    if (E && E.from && E.to && isFinite(E.t)) {
      const k = clamp(E.t, 0, 1), e = k * k * (3 - 2 * k);   // the same smoothstep player.js uses for x and z
      g.position.y = lerp(isFinite(E.from.y) ? E.from.y : 0, isFinite(E.to.y) ? E.to.y : 0, e);
    }
    // walking and standing: the rig faces bodyYaw (the movement direction, the stance yaw while golfing)
    if (!L) { const by = isFinite(p.bodyYaw) ? p.bodyYaw : p.yaw; if (isFinite(by)) g.rotation.y = by; }
    // v10 (CONTRACT_V10 "Walking"): turning in place (player.turn while the chase camera has
    // rotated the character) plays the 'turn' shuffle paced by the body yaw rate; a standing
    // idle visitor plays 'idle' so the fidgets run
    const standing = where === null && !L && !G && !inCart && !ride && !hov && !inBoat && !p.exiting && p.pose === 'stand';
    const by = isFinite(p.bodyYaw) ? p.bodyYaw : (isFinite(p.yaw) ? p.yaw : 0);
    let turnRate = 0;
    if (standing && p.turn) {
      const dy = isFinite(pr.lastYaw) && dt > 0 ? wrapAngle(by - pr.lastYaw) / dt : 0;
      turnRate = Math.abs(dy) > 0.6 ? dy : (p.turn.dir || 1) * 5.5;
      pose = 'turn';
    } else if (standing && p.state === 'idle') pose = 'idle';
    h.turnRate = turnRate;
    pr.lastYaw = by;
    // v8: in the cart the handle sits on the driver's cushion and turns, pitches and leans with it
    if (inCart) {
      const seat = VEHICLES.CART.SEAT || { x: 0.24, z: -0.15 };
      _v.set(seat.x, CART_SEAT_TOP, seat.z);
      cartRec.chassis.localToWorld(_v);
      g.position.copy(_v);
      cartRec.chassis.getWorldQuaternion(g.quaternion);
    }
    // v9: on a scooter the handle stands on the deck (deck height plus the terrain), facing its heading
    if (ride) placePlayerRider(g, ride, p);
    // v11: on the hoverboard the body stands on the deck at the board's world height and heading
    if (hov) placePlayerOnBoard(g, hov, p);
    // v11: in a boat the body sits on the hull's seat and takes the hull's pitch and roll
    if (inBoat) placePlayerInBoat(g, boatRec);
  }
  // v10: the foot plant distance from the rendered body's travel (the visitor's own movement
  // plus the station walk-in, which moves the group while player.pos sits at the anchor)
  advanceDistance(h, pr, g.position.x, g.position.z);
  h.leanZ = ride && rideRec && !pr.station && isFinite(rideRec.m.leanZ) ? rideRec.m.leanZ
    : hov && hoverRec && isFinite(hoverRec.m.leanZ) ? hoverRec.m.leanZ : 0;
  h.airborne = !!(hov && hov.airborne);   // v11: the crouch in the air (pose 'hover')
  h.hat = hatKindOf(p.look || (wallet ? wallet.equipped : null), p.spec);   // v11: the equipped hat

  // held prop: attach and detach when held changes (a seated cafe treat counts as held); never while golfing
  let held = G ? null : (p.held || null);
  if (!held && !G && seated && L && (L.kind === 'icecream' || L.kind === 'coffee')) held = L.kind;
  if (held !== pr.propKind) {
    if (held) attachProp(h, held); else detachProp(h);
    pr.propKind = held;
  }
  // golf (v5): the club in the left hand and the swing phase for the animators
  setClubProp(G ? (G.club || 'driver') : null);
  // v10: the swing phase is shaped (backswing pause, follow-through) around player.js's impact instant
  h.golfPhase = G && isFinite(G.swingT) ? golfPhaseShaped(clamp(G.swingT, 0, 1)) : 0;
  noteStrike(G, time);

  pr.animate(h, p, time, dt, pose);
  if (L) animateLeisure(h, p, time, dt);
  // v14: the swimmer floats at its own water (animateLeisure writes the pond's level, 0)
  if (swimming && L && !p.interior && (L.phase === 'wading' || L.phase === 'swimming' || L.phase === 'leaving')) {
    const wa = TT.sim.at(Math.floor(p.pos.x), Math.floor(p.pos.y)) === TT.sim.TILES.WA;
    const lvl = waterLevelAt(p.pos.x, p.pos.y) - 0.04;
    if (wa) g.position.y += Math.min(Math.max(floorY, lvl), lvl + 0.2);
    else if (L.phase === 'swimming') g.position.y += (isFinite(L.surface) ? L.surface - 0.04 : lvl);   // under a bridge deck: the level of the water the swimmer came from
    else g.position.y = floorY + liftAt(p.pos.x, p.pos.y);              // wading on the bank: on the ground
  }
  if (h.parts && h.parts.ring) h.parts.ring.visible = false;

  // v6: the subway prompt in the enter zone, the walk-in down the stairs, and the golf round record
  // (v8: the round summary is read from player.golf in every player state)
  syncSubwayWalk(p, time);
  syncKioskWalk(p);           // v11: 'E  Shop' in front of the kiosk
  syncStatueWalk(p);          // v14: 'E  Read the plaque' in front of the founder's statue
  noteGolfRound(p.golf || null);

  // contact shadow under the character, squashed a little while hopping, off while swimming, in
  // the cart, in a boat or hovering over water (v11)
  const hop = p.yoff ? clamp(-p.yoff / 3, 0, 1) : 0;
  const sh = ALIEN_SCALE * (1 - 0.15 * hop);
  const groundY = p.interior ? floorY : (p.deckY > 0 ? p.deckY : hAt(g.position.x, g.position.z) + liftAt(g.position.x, g.position.z));
  const overWater = !!hov && isFinite(hov.surface) && isFinite(hov.ground) && hov.surface > hov.ground + 0.02;
  pr.shadow.visible = !swimming && !inCart && !inBoat && !overWater && g.position.y - groundY < 2.0;
  if (pr.shadow.visible) {
    if (p.interior) { pr.shadow.quaternion.setFromUnitVectors(Z_AXIS, UP); pr.shadow.position.set(g.position.x, groundY + 0.012, g.position.z); }
    else placeShadow(pr.shadow, g, groundY, false);
  }
  pr.shadow.scale.set((p.pose === 'walk' ? 1.08 : 1) * sh, sh, 1);

  applyInteriorLook(p.interior || null);
  updateGolfFx(time);
  updateBallFx(G, dt);        // v10: the streak, the landing puff and the long trail
  updateHighlightRing(p);     // v10: the ring under the targeted interactable
  placeWalkCamera(time);
  updateWalkHud();
}
/* The walk camera: player.cameraPose picks the pose by state (the chase orbit, the only walk view
   since v7, or the ball camera during a golf flight; stations and interiors go through anchorPos
   and floorY inside the player). The renderer adds the 0.35 s ease when the ball camera hands back
   and applies the player's mild FOV ease (player.fov, 68 walking to 71 running). */
function placeWalkCamera(time) {
  const p = player;
  const key = (p.state === 'golf' && p.followBall) ? 'ball' : 'chase';
  if (key !== camKey) {
    // blend from the pose shown last frame, except into the ball camera (its spring starts from the
    // current pose) and across a fade (a teleport hides behind the overlay)
    if (camKey && key !== 'ball' && !p.fade) { camFrom.pos.copy(camera.position); camFrom.target.copy(controls.target); camFrom.t0 = time; camFrom.on = true; }
    else camFrom.on = false;
    camKey = key;
  }
  p.cameraPose(camera.position, controls.target);
  const cp = camera.position, ct = controls.target;
  if (!isFinite(cp.x) || !isFinite(cp.y) || !isFinite(cp.z) || !isFinite(ct.x) || !isFinite(ct.y) || !isFinite(ct.z)) {
    const fy = isFinite(p.floorY) ? p.floorY : 0;
    cp.set(p.pos.x, fy + 1.35, p.pos.y); ct.set(p.pos.x, fy + 1.35, p.pos.y - 1);
  }
  if (camFrom.on) {
    const k = (time - camFrom.t0) / VIEW_BLEND;
    if (!(k < 1)) camFrom.on = false;
    else {
      const e = easeInOut(clamp(k, 0, 1));
      cp.lerpVectors(camFrom.pos, cp, e); ct.lerpVectors(camFrom.target, ct, e);
    }
  }
  // v8: the safety net behind the chase camera's collision march (CONTRACT_V8 puts the terrain stop
  // in the march itself, through the terrain createPlayer receives); whatever the march did, the
  // walk camera never dips under the terrain (cam.y >= heightAt + 0.6)
  if (!p.interior) { const floor = hAt(cp.x, cp.z) + 0.6; if (cp.y < floor) cp.y = floor; }
  if (ct.distanceToSquared(cp) < 1e-8) ct.z -= 1;
  camera.lookAt(ct);
  const fov = isFinite(p.fov) ? p.fov : (isFinite(p.fovTarget) ? p.fovTarget : WALK_FOV);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
/* ---------- v8: the golf cart (CONTRACT_V8 "Cart", TERRAIN_DESIGN "Placement rules") ----------
   js/player.js owns the driving model and the record (player.cart = { x, z, y, yaw, speed, steer,
   occupied, auto }); the renderer draws it: the makeCart model built on first use, placed at the
   terrain height under its center, yawed by the record, pitched and rolled by the terrain normal
   (eased at 10 per second), wheels spinning and steering through cart.animate, headlights with
   the night ramp. The group hides when no cart exists (abandoned round, walk mode off). */
function ensureCart() {
  if (cartRec) return cartRec;
  if (typeof VEHICLES.makeCart !== 'function') return null;
  try { cartRec = VEHICLES.makeCart({}); } catch (e) { console.warn('Thread Town: the cart failed to build', e); cartRec = null; return null; }
  if (!cartRec || !cartRec.group) { cartRec = null; return null; }
  cartRec.group.visible = false;
  cartRec.group.userData.cart = true;
  if (!cartRec.chassis) cartRec.chassis = cartRec.group;
  registerGroupMaterials(cartRec.group);
  scene.add(cartRec.group);
  return cartRec;
}
function syncCart(dt) {
  const c = walkOn && player ? player.cart : null;
  if (!c) { if (cartRec) cartRec.group.visible = false; return; }
  const cr = ensureCart();
  if (!cr) return;
  const g = cr.group;
  const x = isFinite(c.x) ? c.x : 0, z = isFinite(c.z) ? c.z : 0, yaw = isFinite(c.yaw) ? c.yaw : 0;
  g.visible = true;
  g.position.set(x, hAt(x, z), z);
  // pitch and roll from the terrain normal, eased
  nAt(x, z, _n);
  const k = dt > 0 ? 1 - Math.exp(-CART_TILT_RATE * dt) : 1;
  cartN.lerp(_n, k);
  if (cartN.lengthSq() < 1e-9) cartN.set(0, 1, 0); else cartN.normalize();
  _q.setFromAxisAngle(UP, yaw);
  _q2.setFromUnitVectors(UP, cartN);
  g.quaternion.multiplyQuaternions(_q2, _q);
  // one steer convention for the record and the model: player.cart.steer is stored in the vehicles.js
  // sign (positive toward local +x, the left; player.js negates the A/D input, D right gives a
  // negative angle), so the angle goes to the front wheels and the chassis lean unchanged
  if (typeof cr.animate === 'function') cr.animate(cr, isFinite(c.speed) ? c.speed : 0, isFinite(c.steer) ? c.steer : 0, dt);
  if (typeof VEHICLES.setNight === 'function') VEHICLES.setNight(cr, clamp((nightS - 0.25) / 0.75, 0, 1));
  g.updateMatrixWorld(true);
}

/* ---------- v9: scooters (CONTRACT_V9 "Rendering") ----------
   js/sim.js owns the entities (state.scooters = [{ id, x, y, yaw, rackId, rider, parked, v }],
   world x and z in x and y, yaw with heading (sin yaw, cos yaw)); js/player.js owns the visitor's
   riding record (player.scooter = { id, x, z, y, yaw, speed, steer, lean, hint }). The renderer
   keeps one makeScooter mesh per entry, pooled: parked scooters stand at their spot, ridden ones
   follow the rider each frame, and the rider's handle stands on the deck in pose 'ride'. */
function scooterById(id) {
  const list = TT.state && TT.state.scooters;
  if (!id || !Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
  return null;
}
/* An agent on its scooter: the body eases toward the travel direction (the rig's own rate), its
   speed and an equivalent steer angle (the bicycle model, yaw rate * wheelbase / speed) feed the
   scooter, and the group carries the heading so the rig, which eases to 0 under a turned group,
   never turns the body off the deck (the wave pause included). */
function placeAgentRider(rec, a, ml, dt) {
  const h = rec.handle, g = h.group;
  let rigYaw = h.rig && isFinite(h.rig.rotation.y) ? h.rig.rotation.y : 0;
  if (!rec.riding) {
    rec.riding = true;
    // start from the body's rendered heading so the character never snaps, and hand the rig's
    // yaw to the group (the rig would otherwise ease to 0 under the turned group, a visible swing)
    const by = g.rotation.y + rigYaw;
    rec.rideYaw = isFinite(by) ? wrapAngle(by) : 0; rec.rideV = 0; rec.rideSteer = 0;
    setRigYaw(h, 0); rigYaw = 0;
  }
  const prev = rec.rideYaw;
  const md = a.moveDir;
  if (!a.paused && ml > 1e-4 && md && (md.x !== 0 || md.z !== 0) && dt > 0) {
    rec.rideYaw = wrapAngle(lerpAngle(prev, Math.atan2(md.x, md.z), 1 - Math.exp(-8 * dt)));
  }
  if (!isFinite(rec.rideYaw)) rec.rideYaw = isFinite(prev) ? prev : 0;
  const k = dt > 0 ? 1 - Math.exp(-10 * dt) : 0;
  const vT = a.paused || !(dt > 0) ? 0 : clamp(ml / dt, 0, 9);
  rec.rideV += (vT - rec.rideV) * k;
  if (!isFinite(rec.rideV)) rec.rideV = 0;
  const yawRate = dt > 0 ? wrapAngle(rec.rideYaw - prev) / dt : 0;
  const sT = rec.rideV > 0.3 ? clamp(Math.atan(yawRate * SCOOT_WB / rec.rideV), -SCOOT_STEER_MAX, SCOOT_STEER_MAX) : 0;
  rec.rideSteer += ((isFinite(sT) ? sT : 0) - rec.rideSteer) * k;
  if (!isFinite(rec.rideSteer)) rec.rideSteer = 0;
  // the scooter sits under the agent's position; the body stands between the feet on the deck
  const x = a.pos.x, z = a.pos.y, yaw = rec.rideYaw;
  rec.rideX = x; rec.rideZ = z;
  g.position.set(x + Math.sin(yaw) * SCOOT_FEET_Z, hAt(x, z) + SCOOT_DECK, z + Math.cos(yaw) * SCOOT_FEET_Z);
  let gy = wrapAngle(yaw - rigYaw);
  if (gy === 0) gy = 1e-6;   // a group yaw of exactly 0 would hand the facing back to moveDir
  g.rotation.set(0, gy, 0);
  const sr = scooterRecs.get(a.scooter);
  h.leanZ = sr && isFinite(sr.m.leanZ) ? sr.m.leanZ : 0;
}
/* The animators keep the rig's facing in poseState.yaw (eased, wrapped to -PI..PI); setting both
   moves the facing between the rig and the group without a swing. */
function setRigYaw(h, yaw) {
  const y = isFinite(yaw) ? wrapAngle(yaw) : 0;
  if (h.poseState && typeof h.poseState.yaw === 'number') h.poseState.yaw = y;
  if (h.rig) h.rig.rotation.y = y;
}
/* A ride ended: the body keeps its heading, the rig takes it back from the group. */
function endAgentRide(rec) {
  rec.riding = false;
  const g = rec.handle.group;
  if (isFinite(rec.rideYaw)) setRigYaw(rec.handle, rec.rideYaw - g.rotation.y);
}
/* The visitor on its scooter: the record's position and heading, the feet on the deck. */
function placePlayerRider(g, s, p) {
  const x = isFinite(s.x) ? s.x : p.pos.x, z = isFinite(s.z) ? s.z : p.pos.y;
  const yaw = isFinite(s.yaw) ? s.yaw : (isFinite(p.bodyYaw) ? p.bodyYaw : 0);
  g.position.set(x + Math.sin(yaw) * SCOOT_FEET_Z, hAt(x, z) + dockLiftAt(x, z) + SCOOT_DECK, z + Math.cos(yaw) * SCOOT_FEET_Z);
  g.rotation.set(0, yaw, 0);
}
/* The detail levels of one scooter: everything near, the deck, stem, bar and tyres in the middle
   distance (no shadows), the deck and stem far away. Falls back to everything if the parts differ. */
function scooterLodSets(m) {
  const all = [];
  m.group.traverse(o => { if (o.isMesh) all.push(o); });
  const casters = all.filter(o => o.castShadow);
  const P = m.parts || {};
  const first = o => (o && o.children ? o.children.find(c => c.isMesh) : null) || null;
  const deck = first(P.deck), bar = first(P.handlebar);
  let stem = null;
  if (P.stem && P.stem.children) for (const o of P.stem.children) {
    const gp = o.isMesh && o.geometry && o.geometry.parameters;
    if (gp && gp.height === SCOOT_STEM) stem = o;
  }
  const tyres = (P.wheels || []).map(w => first(w && w.userData ? w.userData.spin : null));
  const mid = [deck, stem, bar].concat(tyres).filter(o => o && o.isMesh);
  const far = [deck, stem].filter(o => o && o.isMesh);
  const ok = mid.length >= 3 && far.length === 2;
  return { all, casters, mid: new Set(ok ? mid : all), far: new Set(ok ? far : all) };
}
function setScooterLod(rec, level) {
  if (rec.lod === level) return;
  rec.lod = level;
  const S = rec.sets;
  for (const o of S.all) o.visible = level === 0 || (level === 1 ? S.mid.has(o) : S.far.has(o));
  for (const o of S.casters) o.castShadow = level === 0;
}
/* v10 (CONTRACT_V10 "Performance budget": instanced scooters, far scooters simplified): past
   SCOOT_FAR a scooter's own meshes hide and its deck and stem are drawn as two instanced
   meshes shared by every far scooter (colored per variant through instanceColor), so seventy
   parked scooters at the overview cost two draw calls. The rig is taken from the first pooled
   scooter at rest: each far part's geometry relative to the scooter group. */
const farScoot = { parts: null, cap: 0, count: 0, colors: [] };   // parts: [{ im, geo, mat }], colors[v]: [Color per part]
function buildFarScooterRig(rec) {
  const g = rec.m.group;
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  const parts = [];
  for (const o of rec.sets.far) {
    const geo = o.geometry.clone().applyMatrix4(_m4.multiplyMatrices(_inv, o.matrixWorld));
    const src = o.material;
    const mat = reg(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: isFinite(src.roughness) ? src.roughness : 0.6, metalness: isFinite(src.metalness) ? src.metalness : 0 }), isFinite(src.envMapIntensity) ? src.envMapIntensity : 0.25);
    parts.push({ im: null, geo, mat });
  }
  farScoot.parts = parts;
}
function ensureFarScooters(n) {
  if (!farScoot.parts) return false;
  if (farScoot.cap >= n) return true;
  const cap = Math.max(32, Math.ceil(n * 1.25));
  for (const p of farScoot.parts) {
    if (p.im) { scene.remove(p.im); p.im.dispose(); }
    const im = new THREE.InstancedMesh(p.geo, p.mat, cap);
    im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    im.name = 'far-scooters'; im.userData.noMerge = true;
    scene.add(im);
    p.im = im;
  }
  farScoot.cap = cap;
  return true;
}
function farScooterColors(rec) {
  let cols = farScoot.colors[rec.v];
  if (!cols) {
    cols = Array.from(rec.sets.far, o => (o.material && o.material.color ? o.material.color.clone() : new THREE.Color(SCOOT_COLORS[rec.v] || NAVY)));
    farScoot.colors[rec.v] = cols;
  }
  return cols;
}
/* Writes one far scooter instance from its group transform. */
function pushFarScooter(rec) {
  const g = rec.m.group;
  g.updateMatrix();
  const cols = farScooterColors(rec);
  const k = farScoot.count++;
  for (let i = 0; i < farScoot.parts.length; i++) {
    const im = farScoot.parts[i].im;
    im.setMatrixAt(k, g.matrix);
    im.setColorAt(k, cols[i] || cols[0]);
  }
}
function finishFarScooters() {
  if (!farScoot.parts) return;
  for (const p of farScoot.parts) {
    if (!p.im) continue;
    p.im.count = farScoot.count;
    p.im.instanceMatrix.needsUpdate = true;
    if (p.im.instanceColor) p.im.instanceColor.needsUpdate = true;
    p.im.visible = farScoot.count > 0;
  }
}
function makeScooterRec(v) {
  if (typeof VEHICLES.makeScooter !== 'function') return null;
  let m = null;
  try { m = VEHICLES.makeScooter({ color: SCOOT_COLORS[v] || NAVY }); } catch (e) { console.warn('Thread Town: a scooter failed to build', e); return null; }
  if (!m || !m.group || !m.parts) return null;
  m.group.userData.scooter = true;
  registerGroupMaterials(m.group);
  const rec = { m, id: null, v, x: 0, z: 0, yaw: 0, n: new THREE.Vector3(0, 1, 0), lod: -1, sets: scooterLodSets(m), placed: false, ridden: false, seen: 0 };
  if (!farScoot.parts) { try { buildFarScooterRig(rec); } catch (e) { console.warn('Thread Town: the far scooter rig failed to build', e); farScoot.parts = null; } }
  return rec;
}
/* A rec for a scooter id: the pooled one of the same variant, else a new mesh. */
function acquireScooterRec(s) {
  const v = Math.abs(Math.floor(isFinite(s.v) ? s.v : 0)) % SCOOT_COLORS.length;
  let i = scooterPool.findIndex(r => r.v === v), rec = null;
  if (i >= 0) rec = scooterPool.splice(i, 1)[0];
  else rec = makeScooterRec(v);
  if (!rec) return null;
  rec.id = s.id; rec.placed = false; rec.ridden = false; rec.lod = -1;
  rec.m.wheelAngle = 0; rec.m.leanAngle = 0; rec.m.leanZ = 0;
  rec.m.group.visible = true;
  if (!rec.m.group.parent) scene.add(rec.m.group);
  scooterRecs.set(s.id, rec);
  return rec;
}
function releaseScooterRec(rec) {
  scooterRecs.delete(rec.id);
  rec.id = null; rec.m.group.visible = false;
  if (rec.m.group.parent) rec.m.group.parent.remove(rec.m.group);
  scooterPool.push(rec);
}
/* Per frame, after the agents: every scooter at its spot or under its rider. */
const EMPTY_LIST = [];
function syncScooters(dt) {
  const list = TT.state && Array.isArray(TT.state.scooters) ? TT.state.scooters : EMPTY_LIST;
  const pS = walkOn && player && player.state === 'scooter' && player.scooter && typeof player.scooter === 'object' ? player.scooter : null;
  const kT = dt > 0 ? 1 - Math.exp(-CART_TILT_RATE * dt) : 1;
  const cam = camera ? camera.position : null;
  const stamp = ++scooterStamp;
  farScoot.count = 0;
  const farOk = !!farScoot.parts && ensureFarScooters(list.length);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s || !s.id) continue;
    const rec = scooterRecs.get(s.id) || acquireScooterRec(s);
    if (!rec || rec.seen === stamp) continue;   // no mesh, or a second entry with the same id
    rec.seen = stamp;
    const m = rec.m, g = m.group;
    let x = s.x, z = s.y, yaw = s.yaw, speed = 0, steer = 0, ridden = !!s.rider, follow = false;
    if (pS && pS.id === s.id) {
      x = pS.x; z = pS.z; yaw = pS.yaw; speed = pS.speed; steer = pS.steer; ridden = true; follow = true;
    } else if (s.rider && s.rider !== 'player') {
      const ar = agentRecs.get(s.rider);
      if (ar && ar.riding && ar.agent.scooter === s.id) {
        x = ar.rideX; z = ar.rideZ; yaw = ar.rideYaw; speed = ar.rideV; steer = ar.rideSteer; follow = true;
      } else if (!ar) {
        // the rider is not drawn (a hidden demo agent): its scooter is hidden with it rather than
        // sliding riderless; it shows again when the rider is drawn or parks it (placed is reset so
        // it snaps to that spot instead of gliding from where it vanished)
        if (g.visible) g.visible = false;
        rec.placed = false; rec.ridden = true;
        continue;
      }
    }
    if (!g.visible) g.visible = true;
    if (!isFinite(x) || !isFinite(z)) { x = rec.placed ? rec.x : 0; z = rec.placed ? rec.z : 0; }
    if (!isFinite(yaw)) yaw = rec.placed ? rec.yaw : 0;
    if (!isFinite(speed)) speed = 0;
    if (!isFinite(steer)) steer = 0;
    // parked: a short move (a re-slot into the rack) glides, a long one snaps
    if (!follow && !ridden && rec.placed && dt > 0) {
      const d = Math.hypot(x - rec.x, z - rec.z);
      if (d < SCOOT_GLIDE && (d > 1e-4 || Math.abs(wrapAngle(yaw - rec.yaw)) > 1e-4)) {
        const k = 1 - Math.exp(-10 * dt);
        const nx = rec.x + (x - rec.x) * k, nz = rec.z + (z - rec.z) * k;
        speed = Math.hypot(nx - rec.x, nz - rec.z) / dt;
        x = nx; z = nz; yaw = lerpAngle(rec.yaw, yaw, k);
      }
    }
    rec.x = x; rec.z = z; rec.yaw = wrapAngle(yaw); rec.placed = true; rec.ridden = ridden;
    g.position.set(x, hAt(x, z) + dockLiftAt(x, z), z);   // v14: on the marina dock's planks
    // pitch and roll from the terrain normal, eased like the cart's
    nAt(x, z, _n);
    rec.n.lerp(_n, kT);
    if (rec.n.lengthSq() < 1e-9) rec.n.set(0, 1, 0); else rec.n.normalize();
    _q.setFromAxisAngle(UP, rec.yaw);
    _q2.setFromUnitVectors(UP, rec.n);
    g.quaternion.multiplyQuaternions(_q2, _q);
    // wheel spin, stem steer and the lean (steer in the cart sign, positive toward local +x)
    if (typeof VEHICLES.animateScooter === 'function') VEHICLES.animateScooter(m, speed, steer, dt);
    else if (typeof m.animate === 'function') m.animate(m, speed, steer, dt);
    if (m.parts.kickstand) m.parts.kickstand.visible = !ridden;
    // detail by camera distance (the rider's own scooter always full)
    let level = 0;
    if (cam && !(pS && pS.id === s.id)) {
      const d2 = (cam.x - x) * (cam.x - x) + (cam.y - g.position.y) * (cam.y - g.position.y) + (cam.z - z) * (cam.z - z);
      level = d2 > SCOOT_FAR * SCOOT_FAR ? 2 : d2 > SCOOT_NEAR * SCOOT_NEAR ? 1 : 0;
    }
    setScooterLod(rec, level);
    // v10: a far scooter hides its own meshes and joins the instanced deck and stem
    if (level === 2 && farOk) { g.visible = false; pushFarScooter(rec); }
  }
  finishFarScooters();
  for (const rec of scooterRecs.values()) if (rec.seen !== stamp) releaseScooterRec(rec);
}
/* Headless counts for the checks: scooters in the sim, meshes drawn for them, parked cars in the scene. */
function scooterCounts() {
  const list = TT.state && Array.isArray(TT.state.scooters) ? TT.state.scooters : EMPTY_LIST;
  // meshed: a pooled mesh in the scene (shown, or hidden with a rider that is not drawn); hidden: the latter
  let meshed = 0, ridden = 0, hidden = 0, cars = 0;
  for (const s of list) { const r = s && scooterRecs.get(s.id); if (r && r.m.group.parent === scene) { meshed++; if (r.ridden) ridden++; if (!r.m.group.visible) hidden++; } }
  if (scene) scene.traverse(o => { if (o.userData && o.userData.car && !o.userData.cart) cars++; });
  const cs = city && city.group && city.group.userData.cityStats;
  return { scooters: list.length, meshed, ridden, hidden, pooled: scooterPool.length, cars, cityCars: cs && cs.counts ? cs.counts.cars | 0 : 0 };
}

/* ---------- v11: the wallet and the shop (CONTRACT_V11 "Coins, the wallet and the shop") ----------
   The wallet persists under threadtown.wallet.v1 through townStorage; ui.js reads TT.wallet for
   the header counter and the picker's hats and assigns TT.onWalletChange, which every change
   calls. The shop modal opens from the kiosk (openShopFrom('kiosk')), the header counter and the
   runner card (ui.js); after a purchase or an equip the look is re-applied here. */
function buildWalletAndShop() {
  try { wallet = createWallet(townStorage); } catch (e) { console.warn('Thread Town: the wallet failed to build', e); wallet = null; }
  if (!wallet) return;
  TT.wallet = wallet;
  wallet.onChange = () => {
    applyLook();
    if (typeof TT.onWalletChange === 'function') { try { TT.onWalletChange(); } catch (e) { console.warn('Thread Town: onWalletChange failed', e); } }
  };
  if (typeof document === 'undefined') return;
  try { shop = createShop({ wallet, onChange: () => applyLook() }); } catch (e) { console.warn('Thread Town: the shop failed to build', e); shop = null; }
  if (shop) TT.shop = shop;
}
function shopOpen() { return !!(shop && typeof shop.isOpen === 'function' && shop.isOpen()); }
/* Opens the shop from the town: the pointer lock goes first so the modal takes the mouse. */
function openShopFrom(context) {
  if (!shop) return false;
  releaseLock(); clearWalkKeys();
  try { shop.open(context); } catch (e) { console.warn('Thread Town: the shop failed to open', e); return false; }
  return true;
}
/* The hat kind the animators wear ('cap', 'beanie', 'crown', 'cowboy', 'visor') from an equipped
   record (wallet.equipped or player.look, ids 'hat-cap' and so on) or the player spec's hat; null for none. */
function hatKindOf(look, spec) {
  let id = look && typeof look.hat === 'string' && look.hat ? look.hat : (spec && typeof spec.hat === 'string' && spec.hat ? spec.hat : null);
  if (!id) return null;
  if (id.startsWith('hat-')) id = id.slice(4);
  const kinds = Array.isArray(ALIENS.HAT_KINDS) ? ALIENS.HAT_KINDS : (Array.isArray(ANIMALS.HAT_KINDS) ? ANIMALS.HAT_KINDS : null);
  return !kinds || kinds.indexOf(id) >= 0 ? id : null;
}
/* After a wallet change: the runner wears the hat (the visitor's handle is written every frame
   from player.look, the hoverboard colour is checked every frame in ensureHoverboard). */
function applyLook() {
  if (runnerCh && runnerCh.handle) runnerCh.handle.hat = hatKindOf(wallet ? wallet.equipped : null, player ? player.spec : null);
}
/* The kiosk (V11_DESIGN "The kiosk"): 'E  Shop' within 1.5 of the front tile while idle on foot. */
function nearKiosk(px, pz) {
  const f = kioskFrontPos();
  return !!f && Math.hypot(f.x - px, f.y - pz) <= KIOSK_REACH;
}
function kioskCanOpen() {
  if (!shop || !walkOn || !player || !player.active || gameMode || subwayPhase || insideRoom) return false;
  const p = player;
  return p.state === 'idle' && !p.fade && !p.interior && !p.exiting;
}
function syncKioskWalk(p) {
  if (subwayPhase || !kioskCanOpen() || !nearKiosk(p.pos.x, p.pos.y)) return;
  if (p.prompt !== SUBWAY_PROMPT) p.prompt = KIOSK_PROMPT;
}

/* ---------- v11: the hoverboard (CONTRACT_V11 "The hoverboard") ----------
   js/player.js owns the board record (player.board = { x, z, y, yaw, state, dropT, glow, bob }
   while the wallet owns the hoverboard) and the ride (player.hover); the renderer keeps one
   makeHoverboard mesh in the equipped deck colour, places it from the record every frame
   (trailing behind the walker, riding under the visitor, hidden while away), animates the lean,
   the pitch, the landing dip and the underglow, and flares the glow through the 0.3 s drop-in. */
function hoverColorHex() {
  const id = wallet && wallet.equipped ? wallet.equipped.board : null;
  const it = id ? walletItemById(id) : null;
  return it && typeof it.color === 'string' ? it.color : NAVY;
}
function ensureHoverboard() {
  const hex = hoverColorHex();
  if (hoverRec && hoverRec.color === hex) return hoverRec;
  if (typeof VEHICLES.makeHoverboard !== 'function') return null;
  // a colour change rebuilds the board: its deck material comes from the shared cache, so it is never recoloured in place
  if (hoverRec) { scene.remove(hoverRec.m.group); hoverRec = null; }
  let m = null;
  try { m = VEHICLES.makeHoverboard({ color: hex }); } catch (e) { console.warn('Thread Town: the hoverboard failed to build', e); return null; }
  if (!m || !m.group || !m.parts) return null;
  m.group.userData.hoverboard = true;
  registerGroupMaterials(m.group);
  m.group.visible = false;
  scene.add(m.group);
  hoverRec = { m, color: hex };
  return hoverRec;
}
function syncHoverboard(p, dt) {
  const B = walkOn && p ? p.board : null;
  if (!B || B.state === 'away' || !isFinite(B.x) || !isFinite(B.z) || !isFinite(B.y)) { if (hoverRec) hoverRec.m.group.visible = false; return; }
  const rec = ensureHoverboard();
  if (!rec) return;
  const m = rec.m, g = m.group;
  g.visible = true;
  g.position.set(B.x, B.y, B.z);
  g.rotation.set(0, isFinite(B.yaw) ? B.yaw : 0, 0);
  const H = B.state === 'riding' && p.hover && typeof p.hover === 'object' ? p.hover : null;
  if (H && isFinite(H.dip)) m.dip = H.dip;
  const speed = H && isFinite(H.speed) ? H.speed : 0, lean = H && isFinite(H.lean) ? H.lean : 0;
  if (typeof VEHICLES.animateHoverboard === 'function') VEHICLES.animateHoverboard(m, speed, lean, !!(H && H.airborne), dt);
  else if (typeof m.animate === 'function') m.animate(m, speed, lean, !!(H && H.airborne), dt);
  // the drop-in glow (board.glow 1 to 0 over the first 0.3 s of a ride) flares the underglow and the pods
  const glow = B.state === 'riding' && isFinite(B.glow) ? clamp(B.glow, 0, 1) : 0;
  if (glow > 0 && m.parts.glowMat) {
    m.parts.glowMat.emissiveIntensity += 2.0 * glow;
    m.parts.glowMat.opacity = Math.min(1, m.parts.glowMat.opacity + 0.4 * glow);
    if (m.parts.podMat) m.parts.podMat.emissiveIntensity += 1.5 * glow;
  }
  g.updateMatrixWorld(true);
}
/* The visitor on the board: the feet on the deck top at the ride's world height, facing its heading. */
function placePlayerOnBoard(g, hov, p) {
  const x = isFinite(hov.x) ? hov.x : p.pos.x, z = isFinite(hov.z) ? hov.z : p.pos.y;
  const y = isFinite(hov.y) ? hov.y : hAt(x, z) + 0.4;
  g.position.set(x, y + HOVER_FEET_Y, z);
  g.rotation.set(0, isFinite(hov.yaw) ? hov.yaw : (isFinite(p.bodyYaw) ? p.bodyYaw : 0), 0);
}

/* ---------- v11: the boats (CONTRACT_V11 "Boats") ----------
   js/sim.js owns the entities (state.boats = [{ id, kind, x, y, yaw, dockId, rider, parked,
   beached }], world x and z in x and y); js/player.js the visitor's ride (player.boat = { id,
   kind, x, z, y, yaw, speed, steer, wake }). The renderer keeps one makeBoat mesh per entry (the
   hull's boards merged per material; the oars, the motor and the wake stay live), places it on
   the water surface of its body, moored with the bow into the open water (the heading from the
   dock's tile to its slip, since the sim's dock yaw is the plan's facing), beached where it
   lies, or under the visitor with the hull pitching and the wake trailing; the rider sits on the
   kind's seat anchor in pose 'boat'. Far boats drop their small parts. */
function dockRecById(id) {
  const list = TT.state && TT.state.docks;
  if (!id || !Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
  return null;
}
/* A moored boat's heading in the renderer's convention (yaw 0 faces +z): from the dock tile toward its slip. */
function boatHeading(b) {
  const dockId = b.dockId !== undefined && b.dockId !== null ? b.dockId : (b.dock !== undefined && b.dock !== null ? b.dock : null);
  if (dockId) {
    const d = dockRecById(dockId);
    if (d) {
      const tx = dockPosX(d), tz = dockPosZ(d);
      const sx = d.slipPos && isFinite(d.slipPos.x) ? d.slipPos.x : (d.slip && isFinite(d.slip.x) ? d.slip.x + 0.5 : NaN);
      const sz = d.slipPos && isFinite(d.slipPos.y) ? d.slipPos.y : (d.slip && isFinite(d.slip.y) ? d.slip.y + 0.5 : NaN);
      const dx = sx - tx, dz = sz - tz;
      if (isFinite(dx) && isFinite(dz) && Math.hypot(dx, dz) > 1e-6) return Math.atan2(dx, dz);
    }
  }
  return isFinite(b.yaw) ? b.yaw : 0;
}
function makeBoatRec(b) {
  if (typeof VEHICLES.makeBoat !== 'function') return null;
  const kind = b.kind === 'rowboat' ? 'rowboat' : 'launch';
  let m = null;
  try { m = VEHICLES.makeBoat({}, kind); } catch (e) { console.warn('Thread Town: a boat failed to build', e); return null; }
  if (!m || !m.group || !m.hull) return null;
  m.group.userData.boat = true;
  // the hull's static boards merge per material; the oars, the motor with its tiller and the wake stay live
  const dyn = new Set();
  const P = m.parts || {};
  for (const o of (P.oars || [])) if (o && o.traverse) o.traverse(c => { if (c.isMesh) dyn.add(c); });
  if (P.motor && P.motor.traverse) P.motor.traverse(c => { if (c.isMesh) dyn.add(c); });
  try { const s = mergeStatic(m.hull, dyn); mergeStats.before += s.before; mergeStats.after += s.after; } catch (e) { /* the boat keeps its parts */ }
  registerGroupMaterials(m.group);
  const small = [];
  for (const o of dyn) small.push(o);
  const rec = { m, id: b.id, kind, small, far: false, seen: 0 };
  m.group.visible = true;
  scene.add(m.group);
  boatRecs.set(b.id, rec);
  return rec;
}
function releaseBoatRec(rec) {
  boatRecs.delete(rec.id);
  if (rec.m.group.parent) rec.m.group.parent.remove(rec.m.group);
}
/* Per frame (once; the first caller of a frame wins): every boat at its mooring, its beach or under the visitor. */
function syncBoats(dt) {
  if (boatsSynced === frameNo) return;
  boatsSynced = frameNo;
  const list = TT.state && Array.isArray(TT.state.boats) ? TT.state.boats : EMPTY_LIST;
  const p = walkOn ? player : null;
  const pB = p && p.state === 'boat' && p.boat && typeof p.boat === 'object' ? p.boat : null;
  const cam = camera ? camera.position : null;
  const stamp = ++boatStamp;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b || !b.id) continue;
    const kind = b.kind === 'rowboat' ? 'rowboat' : 'launch';
    let rec = boatRecs.get(b.id);
    if (rec && rec.seen === stamp) continue;   // a second entry with the same id
    if (rec && rec.kind !== kind) { releaseBoatRec(rec); rec = null; }
    if (!rec) rec = makeBoatRec(b);
    if (!rec) continue;
    rec.seen = stamp;
    const m = rec.m, g = m.group;
    const ridden = !!(pB && pB.id === b.id);
    let x = b.x, z = b.y, yaw, speed = 0, steer = 0, wake = false, y = NaN;
    if (ridden) { x = pB.x; z = pB.z; yaw = pB.yaw; speed = pB.speed; steer = pB.steer; wake = !!pB.wake; y = pB.y; }
    else yaw = boatHeading(b);
    if (!isFinite(x) || !isFinite(z)) { if (g.visible) g.visible = false; continue; }
    if (!isFinite(y)) y = waterLevelAt(x, z);
    if (!g.visible) g.visible = true;
    g.position.set(x, y, z);
    g.rotation.set(0, isFinite(yaw) ? yaw : 0, 0);
    m.steer = isFinite(steer) ? steer : 0;
    if (typeof VEHICLES.animateBoat === 'function') VEHICLES.animateBoat(m, isFinite(speed) ? speed : 0, dt, wake);
    else if (typeof m.animate === 'function') m.animate(m, isFinite(speed) ? speed : 0, dt, wake);
    const far = !!cam && !ridden && cam.distanceToSquared(g.position) > BOAT_FAR * BOAT_FAR;
    if (far !== rec.far) { rec.far = far; for (const o of rec.small) o.visible = !far; }
    g.updateMatrixWorld(true);
  }
  for (const rec of boatRecs.values()) if (rec.seen !== stamp) releaseBoatRec(rec);
}
/* The visitor in a boat: on the kind's seat anchor in the hull frame, turning, pitching and rolling with it. */
function placePlayerInBoat(g, rec) {
  const K = BOAT_N[rec.kind] || null;
  const seat = K && K.SEAT ? K.SEAT : BOAT_SEAT_DEF;
  _v.set(isFinite(seat.x) ? seat.x : 0, isFinite(seat.y) ? seat.y : 0.12, isFinite(seat.z) ? seat.z : -0.5);
  rec.m.hull.localToWorld(_v);
  g.position.copy(_v);
  rec.m.hull.getWorldQuaternion(g.quaternion);
  // v14: duck under a bridge deck (the rider's head stands 0.4 above the deck's underside)
  const S = TT.sim, BR = S && S.TILES ? S.TILES.BR : undefined;
  let under = 0;
  if (S && typeof S.at === 'function' && BR !== undefined) {
    const x = g.position.x, z = g.position.z;
    if (S.at(Math.floor(x), Math.floor(z)) === BR || S.at(Math.floor(x + 0.9), Math.floor(z)) === BR || S.at(Math.floor(x - 0.9), Math.floor(z)) === BR
      || S.at(Math.floor(x), Math.floor(z + 0.9)) === BR || S.at(Math.floor(x), Math.floor(z - 0.9)) === BR) under = 1;
  }
  boatDuck += (under - boatDuck) * 0.2;
  if (boatDuck > 0.001) g.position.y -= boatDuck * BOAT_DUCK;
}
/* Headless counts for the checks. */
function boatCounts() {
  const list = TT.state && Array.isArray(TT.state.boats) ? TT.state.boats : EMPTY_LIST;
  let meshed = 0, shown = 0;
  for (const b of list) { const r = b && boatRecs.get(b.id); if (r && r.m.group.parent === scene) { meshed++; if (r.m.group.visible) shown++; } }
  return { boats: list.length, meshed, shown, hoverboard: !!(hoverRec && hoverRec.m.group.visible) };
}

/* ---------- v11: the minimap (CONTRACT_V11 "The minimap") ----------
   js/minimap.js paints the base once and the overlay per frame; the renderer mounts it on the
   #minimap slot (the module's own frame fills the slot), feeds the visitor, the chase yaw and the
   target every frame, hides it outside walk mode (orbit, board mode, interiors, the subway) and
   toggles it on M. The target: the prompt's target when a prompt shows, else the cup of the hole
   in play, the ball between shots, the nearest rack while riding, the nearest free dock in a boat. */
function buildMinimap() {
  if (typeof createMinimap !== 'function' || typeof document === 'undefined') return;
  minimapMount = (document.getElementById && document.getElementById('minimap')) || null;
  try {
    minimap = createMinimap({ sim: TT.sim, state: TT.state, depts: TT.DEPARTMENTS, mount: minimapMount || undefined, storage: rawStorage, keys: false,
      onGo: () => goRoute(),                                   // v13: the Go button on the open map
      onOpen: open => { mapOpenFlag = !!open; if (open) { clearWalkKeys(); if (pointerLocked) releaseLock(); } if (touch) syncTouchMode(); },   // v13: the map opened or closed itself (a corner tap, its close button, the backdrop)
      onWaypoint: (x, z) => onWaypointSet(x, z) });            // v13: a ctx hook too, for a map that takes it there
  } catch (e) { console.warn('Thread Town: the minimap failed to build', e); minimap = null; return; }
  if (!minimap) return;
  // v13: the map tells us the waypoint it sets or clears (null clears); a map without the hook keeps the pin to itself
  if (typeof minimap.onWaypoint === 'function') { try { minimap.onWaypoint((x, z) => onWaypointSet(x, z)); } catch (e) { /* ignore */ } }
  // the module brings its own corner frame; inside the slot the slot is the frame, so the module's fills it
  const st = minimap.el && minimap.el.style;
  if (minimapMount && st) {
    st.position = 'absolute'; st.inset = '0'; st.right = '0'; st.bottom = '0'; st.width = '100%'; st.height = '100%';
    st.border = 'none'; st.boxShadow = 'none'; st.borderRadius = '14px'; st.boxSizing = 'border-box';
  }
  if (minimap.overlay && minimap.overlay.style) { minimap.overlay.style.width = '100%'; minimap.overlay.style.height = '100%'; }
  if (minimapMount) minimapMount.hidden = true;
  applyTouchLayout();   // v12: 120 px on touch
}
function minimapMode(p) {
  if (!p || !walkOn || gameMode || subwayPhase || cinematic || insideRoom || p.interior) return 'hidden';
  const s = p.state;
  return s === 'scooter' ? 'scooter' : s === 'hover' ? 'hover' : s === 'boat' ? 'boat' : s === 'golf' ? 'golf' : s === 'cart' ? 'cart' : 'walk';
}
function minimapTarget(p) {
  if (_pt.ok) { mmTarget.x = _pt.x; mmTarget.z = _pt.z; return mmTarget; }
  const st = TT.state, px = p.pos.x, pz = p.pos.y, s = p.state, G = p.golf;
  if (G && G.mode !== 'range') {
    // the ball between shots (it rests somewhere on the course), else the cup of the hole in play
    const b = G.ball;
    if (s !== 'golf' && b && b.pos && isFinite(b.pos.x) && isFinite(b.pos.z)) { mmTarget.x = b.pos.x; mmTarget.z = b.pos.z; return mmTarget; }
    const h = golfHoles()[(G.hole | 0) - 1];
    const c = h && h.cup;
    if (c) {
      const cx = Array.isArray(c) ? c[0] : c.x, cz = Array.isArray(c) ? c[1] : c.y;
      if (isFinite(cx) && isFinite(cz)) { mmTarget.x = Number.isInteger(cx) ? cx + 0.5 : cx; mmTarget.z = Number.isInteger(cz) ? cz + 0.5 : cz; return mmTarget; }
    }
  }
  if (s === 'scooter') {
    const racks = _nf.list = st.racks || EMPTY_LIST;
    const i = nearestOf(px, pz, Infinity, racks.length, rackPosX, rackPosZ);
    if (i >= 0) { mmTarget.x = rackPosX(i); mmTarget.z = rackPosZ(i); return mmTarget; }
  }
  if (s === 'boat') {
    const ds = _nf.list = st.docks || EMPTY_LIST;
    const i = nearestOf(px, pz, Infinity, ds.length, dockFreeX, dockFreeZ);
    if (i >= 0) { mmTarget.x = dockPosX(ds[i]); mmTarget.z = dockPosZ(ds[i]); return mmTarget; }
  }
  return null;
}
function updateMinimap(time) {
  if (!minimap) return;
  const p = walkOn ? player : null;
  const mode = minimapMode(p);
  const show = mode !== 'hidden' && minimap.visible !== false;
  if (minimapMount && minimapMount.hidden !== !show) minimapMount.hidden = !show;
  mmView.mode = mode;
  if (mode !== 'hidden') {
    mmView.x = p.pos.x; mmView.z = p.pos.y;
    mmView.yaw = isFinite(p.orbitYaw) ? p.orbitYaw : Math.PI;
    // v13: the waypoint wins over the prompt target while it is set
    if (WP.set) { mmTarget.x = WP.x; mmTarget.z = WP.z; mmView.target = mmTarget; } else mmView.target = minimapTarget(p);
    mmView.time = time;
    updateRoute(p, time);        // v13: the route and the HUD directions
  } else { mmView.target = null; updateWaypointHud(null, time); }
  try { minimap.update(mmView); } catch (e) { /* a drawing failure never stops the frame */ }
}

/* ---------- v13: the town map, waypoints and directions (CONTRACT_V13) ----------
   The open and close paths (Shift+M, M held 0.4 s, the touch Map button, Esc, the close button
   and the backdrop through the minimap's own handlers, M again), the waypoint the map reports,
   the route from TT.sim.findPath (boats: a BFS of our own over TT.sim.boatWaterAt), the HUD line
   and Go. */
function nowMs() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
function mapOpenNow() {
  if (minimap && typeof minimap.isOpen === 'function') { try { return !!minimap.isOpen(); } catch (e) { return mapOpenFlag; } }
  return mapOpenFlag;
}
/* Opens the town map; false when the minimap has no openMap (nothing changes then). */
function openMap() {
  if (!minimap || !walkOn || gameMode || subwayPhase) return false;
  if (typeof minimap.openMap !== 'function') return false;
  try { minimap.openMap(); } catch (e) { return false; }
  mapOpenFlag = true;
  if (pointerLocked) releaseLock();
  clearWalkKeys();
  if (touch) syncTouchMode();
  return true;
}
function closeMap() {
  const was = mapOpenNow();
  if (minimap && typeof minimap.closeMap === 'function') { try { minimap.closeMap(); } catch (e) { /* ignore */ } }
  mapOpenFlag = false;
  if (was) { clearWalkKeys(); if (touch) syncTouchMode(); }
  return was;
}
function toggleMap() { return mapOpenNow() ? (closeMap(), false) : openMap(); }
/* The M key: held M_HOLD seconds opens the map (checked each frame on the wall clock). */
function stepMHold() {
  if (mHoldAt < 0 || mHoldOpened) return;
  if (nowMs() - mHoldAt >= M_HOLD * 1000) { mHoldOpened = true; if (!mapOpenNow()) openMap(); }
}
/* The waypoint the map reports: (x, z), ({ x, z }) or null to clear. Sets the pin on the corner map too. */
function onWaypointSet(x, z) {
  if (x && typeof x === 'object') { z = isFinite(x.z) ? x.z : x.y; x = x.x; }
  if (x === null || x === undefined || !isFinite(x) || !isFinite(z)) { clearWaypoint(false); return; }
  WP.x = +x; WP.z = +z; WP.set = true;
  routeOk = false; routeAt = -Infinity; routeN = 0; routeToPin = false; routeEndX = -1; routeEndZ = -1;
  wpState.hereUntil = -1;
}
/* Sets the waypoint from our side (the headless path) and tells the map. */
function setWaypoint(x, z) {
  if (x === null || x === undefined) { clearWaypoint(true); return false; }
  onWaypointSet(x, z);
  if (minimap && typeof minimap.setWaypoint === 'function') { try { minimap.setWaypoint(WP.x, WP.z); } catch (e) { /* ignore */ } }
  return WP.set;
}
function clearWaypoint(tellMap) {
  WP.set = false; routeOk = false; routeN = 0; routeAt = -Infinity; routeToPin = false; routeEndX = -1; routeEndZ = -1;
  ROUTE_OUT.length = 0;
  if (minimap) {
    if (tellMap !== false && typeof minimap.setWaypoint === 'function') { try { minimap.setWaypoint(null); } catch (e) { /* ignore */ } }
    if (typeof minimap.setRoute === 'function') { try { minimap.setRoute(null); } catch (e) { /* ignore */ } }
  }
}
function pushRoutePt(x, z) {
  let r = ROUTE_PTS[routeN];
  if (!r) { r = { x: 0, z: 0 }; ROUTE_PTS[routeN] = r; }
  r.x = x; r.z = z; routeN++;
}
/* The nearest tile within ROUTE_NEAR of (tx, tz) that ok(x, y) accepts (rings outward, the tile itself first); null when none. */
function nearestOkTile(tx, tz, ok) {
  if (ok(tx, tz)) { _rt.x = tx; _rt.z = tz; return _rt; }
  for (let r = 1; r <= ROUTE_NEAR; r++) {
    let bx = -1, bz = -1, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = tx + dx, cz = tz + dz;
      if (!ok(cx, cz)) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bx = cx; bz = cz; }
    }
    if (bx >= 0) { _rt.x = bx; _rt.z = bz; return _rt; }
  }
  return null;
}
const simWalkableAt = (x, y) => { const S = TT.sim; return !!(S && typeof S.walkable === 'function' && x >= 0 && y >= 0 && x < S.COLS && y < S.ROWS && S.walkable(x, y)); };
const boatWaterTile = (x, y) => { const S = TT.sim; return !!(S && typeof S.boatWaterAt === 'function' && x >= 0 && y >= 0 && x < S.COLS && y < S.ROWS && S.boatWaterAt(x + 0.5, y + 0.5)); };
/* A plain BFS over the boat water from (sx, sz) to (tx, tz); writes the tiles into ROUTE_PTS (centres). */
function boatRoute(sx, sz, tx, tz) {
  const S = TT.sim, COLS = S.COLS | 0, ROWS = S.ROWS | 0, N = COLS * ROWS;
  if (!boatParent || boatParent.length !== N) { boatParent = new Int32Array(N); boatQueue = new Int32Array(N); }
  const parent = boatParent, queue = boatQueue;
  parent.fill(-2);
  const si = sz * COLS + sx, ti = tz * COLS + tx;
  if (si === ti) return true;
  let qh = 0, qt = 0;
  parent[si] = -1; queue[qt++] = si;
  let found = false;
  while (qh < qt) {
    const cur = queue[qh++];
    if (cur === ti) { found = true; break; }
    const cx = cur % COLS, cy = (cur - cx) / COLS;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = ny * COLS + nx;
      if (parent[n] !== -2 || !boatWaterTile(nx, ny)) continue;
      parent[n] = cur; queue[qt++] = n;
    }
  }
  if (!found) return false;
  // the chain runs backwards from the target; reverse it in place once written
  const start = routeN;
  for (let i = ti; i !== si && i >= 0; i = parent[i]) pushRoutePt((i % COLS) + 0.5, Math.floor(i / COLS) + 0.5);
  for (let a = start, b = routeN - 1; a < b; a++, b--) { const pa = ROUTE_PTS[a], pb = ROUTE_PTS[b]; const x = pa.x, z = pa.z; pa.x = pb.x; pa.z = pb.z; pb.x = x; pb.z = z; }
  return true;
}
/* Land tiles, the golf walk's rule (player.js land): the straight last leg to the pin may cross these alone. */
const landTileAt = (x, y) => {
  const S = TT.sim, T = S && S.TILES;
  if (!T || typeof S.at !== 'function' || x < 0 || y < 0 || x >= S.COLS || y >= S.ROWS) return false;
  const v = S.at(x, y);
  return v === T.G || v === T.P || v === T.Z || v === T.F || v === T.FW || v === T.GR || v === T.SA || v === T.TEE
    || v === T.SW || v === T.CW || v === T.PK || v === T.BR || v === T.PT || v === T.CP || v === T.DK;
};
/* True when every tile the segment crosses is land (a grid walk, the same rule as player.js
   straightWalkOK, so a corner cut through a water or building tile never slips between samples). */
function straightLegOK(x0, z0, x1, z1) {
  let tx = Math.floor(x0), tz = Math.floor(z0);
  if (!landTileAt(tx, tz)) return false;
  const dx = x1 - x0, dz = z1 - z0;
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tDx = dx !== 0 ? 1 / Math.abs(dx) : Infinity, tDz = dz !== 0 ? 1 / Math.abs(dz) : Infinity;
  let tMaxX = dx !== 0 ? (sx > 0 ? tx + 1 - x0 : x0 - tx) * tDx : Infinity;
  let tMaxZ = dz !== 0 ? (sz > 0 ? tz + 1 - z0 : z0 - tz) * tDz : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    if (Math.min(tMaxX, tMaxZ) >= 1) break;      // the next grid line is at or past the end
    if (tMaxX === tMaxZ) {                        // exactly through a corner: both neighbours and the diagonal
      if (!landTileAt(tx + sx, tz) || !landTileAt(tx, tz + sz)) return false;
      tx += sx; tz += sz; tMaxX += tDx; tMaxZ += tDz;
    } else if (tMaxX < tMaxZ) { tx += sx; tMaxX += tDx; }
    else { tz += sz; tMaxZ += tDz; }
    if (!landTileAt(tx, tz)) return false;
  }
  return landTileAt(Math.floor(x1), Math.floor(z1));
}
/* Recomputes the route from the visitor's tile to the waypoint tile (or the nearest tile the sim
   walks within ROUTE_NEAR: a building, the water, a green) and hands it to the minimap. The pin
   itself is the last point only when its tile is one the sim walks, or when the straight leg from
   the route's last tile to the pin crosses land alone (planWalkWay's rule: the island hole takes
   the footbridge onto the green); otherwise the route ends at the nearest walkable tile and that
   tile counts as the waypoint (a pin deep inside a building, out on the water). */
function computeRoute(p, time) {
  const S = TT.sim;
  routeN = 0; routeOk = false; routeToPin = false;
  routeTileX = Math.floor(p.pos.x); routeTileZ = Math.floor(p.pos.y); routeAt = time;
  const boat = p.state === 'boat';
  if (boat !== routeBoat) { routeEndX = -1; routeEndZ = -1; }   // the candidate tiles change with the ride
  routeBoat = boat;
  if (!S) return false;
  const tx = Math.floor(WP.x), tz = Math.floor(WP.z);
  if (routeBoat) {
    const s = nearestOkTile(routeTileX, routeTileZ, boatWaterTile);
    const sx = s ? s.x : -1, sz = s ? s.z : -1;
    const t = nearestOkTile(tx, tz, boatWaterTile);
    if (s && t) { const ttx = t.x, ttz = t.z; routeOk = boatRoute(sx, sz, ttx, ttz); routeToPin = ttx === tx && ttz === tz; }
  } else if (typeof S.findPath === 'function') {
    // v14: the path starts on a tile joined to the town's walkable area, with a clear straight leg from the visitor
    const spn = TT.state.spawn, px0 = p.pos.x, pz0 = p.pos.y, vtx = routeTileX, vtz = routeTileZ;
    const s = nearestOkTile(routeTileX, routeTileZ, (x, y) => simWalkableAt(x, y) && ((x === vtx && y === vtz) || straightLegOK(px0, pz0, x + 0.5, y + 0.5)) && (!spn || (x === spn.x && y === spn.y) || !!S.findPath(x, y, spn.x, spn.y)));
    const sx = s ? s.x : -1, sz = s ? s.z : -1;
    let path = null, toPin = false;
    if (s) {
      // the waypoint tile first
      if (simWalkableAt(tx, tz)) { path = S.findPath(sx, sz, tx, tz); toPin = !!path; }
      // then the end tile an earlier recompute settled on (so the end never hops between recomputes)
      if (!path && routeEndX >= 0 && simWalkableAt(routeEndX, routeEndZ)) path = S.findPath(sx, sz, routeEndX, routeEndZ);
      // then rings of nearer tiles the sim walks: pass 0 only those with a clear straight leg onto the
      // pin, pass 1 any of them (the route then stops there); the shortest path wins within a ring
      for (let pass = 0; !path && pass < 2; pass++) {
        for (let r = 1; !path && r <= ROUTE_NEAR; r++) {
          let best = null;
          for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const cx = tx + dx, cz = tz + dz;
            if (!simWalkableAt(cx, cz)) continue;
            if (pass === 0 && !straightLegOK(cx + 0.5, cz + 0.5, WP.x, WP.z)) continue;
            const q = S.findPath(sx, sz, cx, cz);
            if (q && (!best || q.length < best.length)) best = q;
          }
          path = best;
        }
        if (path) toPin = pass === 0;
      }
    }
    if (path) {
      if (s && (sx !== routeTileX || sz !== routeTileZ)) pushRoutePt(sx + 0.5, sz + 0.5);   // v14: the lead in to the start tile
      for (let i = 0; i < path.length; i++) pushRoutePt(path[i].x + 0.5, path[i].y + 0.5);
      routeOk = true; routeToPin = toPin;
    }
  }
  if (routeOk) {
    if (routeToPin) { pushRoutePt(WP.x, WP.z); routeEndX = -1; routeEndZ = -1; }   // the last leg to the pin itself
    else if (routeN > 0) { routeEndX = Math.floor(ROUTE_PTS[routeN - 1].x); routeEndZ = Math.floor(ROUTE_PTS[routeN - 1].z); }
  }
  if (minimap && typeof minimap.setRoute === 'function') {
    try {
      if (routeOk) {
        ROUTE_OUT.length = routeN;
        for (let i = 0; i < routeN; i++) ROUTE_OUT[i] = ROUTE_PTS[i];
        minimap.setRoute(ROUTE_OUT);
      } else { ROUTE_OUT.length = 0; minimap.setRoute(null); }
    } catch (e) { /* ignore */ }
  }
  return routeOk;
}
/* Per frame while the map shows: reach test, the recompute rule, the HUD line. */
function updateRoute(p, time) {
  if (!WP.set) { updateWaypointHud(p, time); return; }
  const dx = WP.x - p.pos.x, dz = WP.z - p.pos.y, dist = Math.hypot(dx, dz);
  let reached = dist <= WP_REACH;
  // a route that stops short of the pin: reaching its end counts as reaching the waypoint
  if (!reached && routeOk && !routeToPin && routeN > 0) {
    const e = ROUTE_PTS[routeN - 1];
    reached = Math.hypot(e.x - p.pos.x, e.z - p.pos.y) <= WP_REACH;
  }
  if (reached) {
    clearWaypoint(true);
    wpState.hereUntil = time + WP_HERE_LEN;
    updateWaypointHud(p, time);
    return;
  }
  const boat = p.state === 'boat';
  const moved = Math.hypot(p.pos.x - (routeTileX + 0.5), p.pos.y - (routeTileZ + 0.5));
  const stale = !routeOk || moved > ROUTE_MOVE || boat !== routeBoat;   // a failed search is retried at the same rate
  if (stale && time - routeAt >= ROUTE_MIN_GAP) computeRoute(p, time);
  updateWaypointHud(p, time);
}
/* The bearing word from the angle (radians, positive to the left) between the heading and the next point. */
function bearingWord(a) {
  const d = Math.abs(a) * 180 / Math.PI;
  if (d < 20) return 'ahead';
  if (d < 60) return a > 0 ? 'bear left' : 'bear right';
  if (d < 125) return a > 0 ? 'left' : 'right';
  return 'behind';
}
/* The HUD line under the prompt pill. index.html may ship #walk-waypoint; otherwise it is built
   next to #walk-prompt (inline styles only when the stylesheet gives it none). */
function ensureWpEl() {
  if (wpEl) return wpEl;
  if (typeof document === 'undefined' || !document.createElement) return null;
  let el = document.getElementById ? document.getElementById(WP_HUD_ID) : null;
  if (!el) {
    el = document.createElement('div');
    el.id = WP_HUD_ID; el.className = 'walk-ui';
    el.hidden = true;
    const host = hudEl('prompt') && hudEl('prompt').parentNode ? hudEl('prompt').parentNode : (container || document.body);
    if (host && host.appendChild) { try { host.appendChild(el); } catch (e) { /* ignore */ } }
  }
  if (el.setAttribute) { el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-label', 'Directions'); }
  el.innerHTML = '<svg class="wp-arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1 L12 8 L8.3 7.2 L8.3 13 L5.7 13 L5.7 7.2 L2 8 Z" fill="' + AQUA + '"/></svg><span class="wp-text"></span>';
  wpArrowEl = el.querySelector ? el.querySelector('.wp-arrow') : null;
  wpTextEl = el.querySelector ? el.querySelector('.wp-text') : null;
  if (wpTextEl === null && el.firstChild) wpTextEl = el.lastChild;
  // no stylesheet rule yet: a pill like the prompt's, just above it
  let styled = false;
  try { styled = typeof getComputedStyle === 'function' && getComputedStyle(el).position === 'absolute'; } catch (e) { styled = false; }
  if (!styled && el.style) {
    const s = el.style;
    s.position = 'absolute'; s.zIndex = '6'; s.left = '50%'; s.bottom = '108px'; s.transform = 'translateX(-50%)';
    s.background = 'rgba(0,45,79,0.92)'; s.border = '1px solid rgba(226,233,238,0.25)'; s.borderRadius = '999px';
    s.padding = '6px 14px 6px 10px'; s.fontSize = '13px'; s.color = SILVER; s.whiteSpace = 'nowrap';
    s.alignItems = 'center'; s.gap = '8px'; s.pointerEvents = 'none'; s.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';
    s.maxWidth = 'calc(100% - 32px)';
    if (wpArrowEl && wpArrowEl.style) { wpArrowEl.style.transition = 'transform .12s linear'; wpArrowEl.style.flex = '0 0 auto'; }
  }
  wpEl = el;
  return el;
}
/* Writes the line: 'Waypoint: 120 m, bear left' with the arrow turned by the bearing, 'You are
   here' for WP_HERE_LEN after reaching it, hidden otherwise. A steady frame touches no DOM. */
function updateWaypointHud(p, time) {
  let text = '', deg = 0, show = false;
  if (p && WP.set && walkOn) {
    const dx = WP.x - p.pos.x, dz = WP.z - p.pos.y;
    let dist = Math.hypot(dx, dz);
    // the distance along the route when there is one (tile centres), else as the crow flies
    if (routeOk && routeN > 1) {
      let along = 0, px = p.pos.x, pz = p.pos.y;
      for (let i = 0; i < routeN; i++) { const r = ROUTE_PTS[i]; along += Math.hypot(r.x - px, r.z - pz); px = r.x; pz = r.z; }
      if (along > dist) dist = along;
    }
    // the point WP_AHEAD tiles ahead along the route (the waypoint itself without one)
    let ax = WP.x, az = WP.z;
    if (routeOk && routeN > 0) {
      let i = 0;
      // skip route points already behind the visitor (within a tile and a bit)
      while (i < routeN - 1 && Math.hypot(ROUTE_PTS[i].x - p.pos.x, ROUTE_PTS[i].z - p.pos.y) < 1.2) i++;
      const j = Math.min(routeN - 1, i + WP_AHEAD - 1);
      ax = ROUTE_PTS[j].x; az = ROUTE_PTS[j].z;
    }
    const heading = isFinite(p.yaw) ? p.yaw : Math.PI;
    let a = Math.atan2(ax - p.pos.x, az - p.pos.y) - heading;
    a = Math.atan2(Math.sin(a), Math.cos(a));    // wrapped to (-pi, pi]
    const m = Math.max(1, Math.round(dist * M_PER_TILE));
    const word = bearingWord(a);
    // v14: the line is rebuilt only when the metres or the bearing word change, not on every frame
    if (m !== wpState.m || word !== wpState.word) { wpState.m = m; wpState.word = word; wpState.line = 'Waypoint: ' + m + ' m, ' + word; }
    text = wpState.line;
    deg = Math.round(-a * 180 / Math.PI / 5) * 5;   // left turns counterclockwise on screen
    show = true;
  } else if (wpState.hereUntil >= 0 && walkOn) {
    if (time < wpState.hereUntil) { text = 'You are here'; deg = 0; show = true; }
    else wpState.hereUntil = -1;
  }
  const el = show || !wpState.hidden ? ensureWpEl() : null;
  if (!el) return;
  if (wpState.hidden !== !show) {
    wpState.hidden = !show; el.hidden = !show;
    if (el.style) el.style.display = show ? 'flex' : 'none';
  }
  if (!show) return;
  if (wpState.text !== text) { wpState.text = text; if (wpTextEl) wpTextEl.textContent = text; else el.textContent = text; }
  if (wpState.deg !== deg) { wpState.deg = deg; if (wpArrowEl && wpArrowEl.style) wpArrowEl.style.transform = 'rotate(' + deg + 'deg)'; }
}
/* Go: the auto walk along the route (TT.player.walkRoute) when the visitor is on foot; riding
   states ignore it. The map closes so the visitor can watch the walk. */
function goRoute() {
  if (!walkOn || !player || !WP.set) return false;
  if (player.state !== 'idle' || typeof player.walkRoute !== 'function') return false;
  const time = TT.state ? TT.state.time : 0;
  if (!routeOk) computeRoute(player, time);
  if (!routeOk) return false;
  const pts = new Array(routeN);
  for (let i = 0; i < routeN; i++) pts[i] = { x: ROUTE_PTS[i].x, z: ROUTE_PTS[i].z };
  let ok = false;
  try { ok = !!player.walkRoute(pts); } catch (e) { ok = false; }
  if (ok) closeMap();
  return ok;
}

/* The inside look (CONTRACT_V5 "Visitor fades and interiors"): sky and fog take the room's ceiling
   color, the fog closes in, the sun, hemisphere and fill dim so the room's own lights read; the
   sun shadow camera is untouched. Outdoors everything is restored. The switch happens while the
   overlay is fully opaque, so nothing pops. */
function applyInteriorLook(room) {
  if (room === insideRoom) return;
  insideRoom = room;
  if (room) {
    insideBg.set(room.ceilingColor || '#132A42');
    scene.background = insideBg;
    if (fog) { fog.color.copy(insideBg); fog.near = INSIDE_FOG_NEAR; fog.far = INSIDE_FOG_FAR; }
  } else {
    scene.background = skyTex;
    applyFog();   // v10: the haze band for the camera's distance
  }
}

/* HUD writes: ui.js creates the elements; the renderer fills and toggles them each frame. */
function hudEl(which) {
  let el = hudEls[which];
  if (!el) { el = document.getElementById('walk-' + which); hudEls[which] = el; }
  return el;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function updateWalkHud() {
  const prompt = walkOn && player ? (player.prompt || null) : null;
  const pe = hudEl('prompt');
  if (pe) {
    let text = prompt ? (prompt.text || '') : '';
    // GOLF_DESIGN "Scorecard": the last round shows under the hole 1 tee prompt for the session
    // (v8: the round's hole 1 tee reads 'Tee off (round)', practice 'Practice hole 1')
    const lc = prompt && player.lastCard;
    const hole1 = /^Practice hole 1\b/.test(text) || (/^Tee off \(round\)/.test(text) && player.golf && (player.golf.hole | 0) === 1);
    if (lc && isFinite(lc.total) && hole1) text += ' · Last round: ' + lc.total + ' (par ' + (isFinite(lc.par) ? lc.par : coursePar()) + ')';
    // v8: a prompt with key '' (a plain line such as 'Play holes in order') renders without the kbd
    const pk = prompt ? (prompt.key === undefined || prompt.key === null ? 'E' : String(prompt.key)) : '';
    const key = prompt ? pk + '|' + text : '';
    if (key !== promptKey) {
      promptKey = key;
      if (prompt) pe.innerHTML = (pk ? '<kbd>' + escapeHtml(pk) + '</kbd> ' : '') + escapeHtml(text);
    }
    // v10 (CONTRACT_V10 "Interactions"): the pill fades in over 0.18 s when a prompt appears and
    // out when it goes; a text change while shown swaps at once
    const now = TT.state ? TT.state.time : 0;
    if (prompt) {
      if (!promptFade.shown) {
        promptFade.shown = true; promptFade.hideAt = -1; promptFade.armed = true;
        if (pe.style) { pe.style.transition = 'opacity .18s ease'; pe.style.opacity = '0'; }
        pe.hidden = false;
      } else if (promptFade.armed) { promptFade.armed = false; if (pe.style) pe.style.opacity = '1'; }
    } else if (promptFade.shown) {
      promptFade.shown = false; promptFade.armed = false; promptFade.hideAt = now + 0.18;
      if (pe.style) pe.style.opacity = '0';
    } else if (promptFade.hideAt >= 0 && now >= promptFade.hideAt) { promptFade.hideAt = -1; pe.hidden = true; }
  }
  updateGolfHud();
  updateInteriorHint();
  updateFadeOverlay();
}
function capitalize(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function termClass(strokes, par) {
  const over = strokes - par;
  return over <= -1 ? 't-under' : over === 0 ? 't-par' : over === 1 ? 't-bogey' : 't-worse';
}
/* v7 (CONTRACT_V7 "Golf grows to six holes"): the scorecard follows the live hole list, state.golf.holes
   (pars 3 4 5 4 3 5). index.html ships a three column placeholder; the table is rebuilt once per
   hole count so the header, the par row and the You cells match the course. */
let golfCardCols = -1;
function golfHoles() { const gs = TT.state && TT.state.golf; return gs && Array.isArray(gs.holes) ? gs.holes : []; }
function holePar(h) { return h && isFinite(h.par) && h.par > 0 ? h.par : 3; }
function coursePar() { let s = 0; for (const h of golfHoles()) s += holePar(h); return s; }
function ensureGolfCard(holes) {
  const n = holes.length;
  if (n === golfCardCols || !n) return;
  golfCardCols = n;
  const table = v5El('golf-card');
  if (!table || !table.tHead || !table.tBodies || !table.tBodies[0]) return;
  const head = table.tHead.rows[0], body = table.tBodies[0], parRow = body.rows[0], youRow = body.rows[1];
  if (!head || !parRow || !youRow) return;
  let sum = 0;
  const pars = holes.map(h => { const p = holePar(h); sum += p; return p; });
  head.innerHTML = '<th>Hole</th>' + holes.map((h, i) => '<th>' + (isFinite(h.n) ? h.n : i + 1) + '</th>').join('') + '<th>Total</th>';
  parRow.innerHTML = '<td>Par</td>' + pars.map(p => '<td>' + p + '</td>').join('') + '<td>' + sum + '</td>';
  youRow.innerHTML = '<td>You</td>' + holes.map((h, i) => '<td id="golf-c' + (i + 1) + '">·</td>').join('') + '<td id="golf-total">·</td>';
  for (let i = 0; i < n; i++) v5Els['golf-c' + (i + 1)] = youRow.cells[i + 1] || null;
  v5Els['golf-total'] = youRow.cells[n + 1] || null;
  hudState.cells = [];
  // v8: the Round row (index.html, css shows it instead of You while a round is on)
  const roundRow = body.rows[2];
  if (roundRow) {
    roundRow.innerHTML = '<td>Round</td>' + holes.map((h, i) => '<td id="golf-card-' + (i + 1) + '">·</td>').join('') + '<td id="golf-card-total">·</td>';
    for (let i = 0; i < n; i++) v5Els['golf-card-' + (i + 1)] = roundRow.cells[i + 1] || null;
    v5Els['golf-card-total'] = roundRow.cells[n + 1] || null;
  }
  hudState.rcells = [];
}
/* Writes one card row (the practice You row or the round Round row) from golf.card; returns the
   running strokes and the to par over the played holes. */
function writeCardRow(g, holes, cellPrefix, totalId, cache) {
  const n = holes.length;
  let total = 0, any = false, diff = 0;
  for (let i = 0; i < n; i++) {
    const s = g.card ? g.card[i] : null, has = typeof s === 'number' && isFinite(s);
    if (has) { total += s; any = true; diff += s - holePar(holes[i]); }
    const cls = (has ? termClass(s, holePar(holes[i])) : '') + (g.hole === i + 1 ? ' cur' : '');
    const key = (has ? String(s) : '·') + '|' + cls;
    const el = v5El(cellPrefix + (i + 1));
    if (el && cache[i] !== key) { cache[i] = key; el.textContent = has ? String(s) : '·'; el.className = cls.trim(); }
  }
  const tkey = any ? String(total) : '·', tot = v5El(totalId);
  if (tot && cache[n] !== tkey) { cache[n] = tkey; tot.textContent = tkey; }
  return { total, any, diff };
}
/* 'Tab  Drive to ball', 'E  Get in the cart', 'E  Back to the clubhouse · X  Done' or 'Driving' as kbd markup. */
function cartHintHtml(s) {
  return String(s).split(' · ').map(part => {
    const m = /^(\S+)  (.+)$/.exec(part);
    return m ? '<kbd>' + escapeHtml(m[1]) + '</kbd> ' + escapeHtml(m[2]) : escapeHtml(part);
  }).join(' · ');
}
function fmtClock(secs) {
  const s = Math.max(0, Math.floor(isFinite(secs) ? secs : 0));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
/* #golf-hud (title, club, scorecard or range lines), #golf-power (the charge meter), #golf-msg.
   v8 (CONTRACT_V8 "HUD"): player.golf stays set for the whole round in every player state, so the
   card shows between shots and in the cart; a round writes #golf-round-line ('Round · Hole 2 of 6 ·
   Par 4 · Stroke 1'), the Round card row, the running to par and the clock (css swaps the practice
   title and You row for them) and the cart line (#golf-cart-hint) from golf.cartHint. Practice
   keeps the version 7 single hole card. */
function updateGolfHud() {
  const hud = v5El('golf-hud'), pw = v5El('golf-power'), msg = v5El('golf-msg');
  const g = walkOn && player && player.golf ? player.golf : null;
  if (!g) { setHidden(hud, true); setHidden(pw, true); setHidden(msg, true); return; }
  setHidden(hud, false);
  const range = g.mode === 'range', round = g.mode === 'round';
  const holes = golfHoles();
  const n = holes.length;
  const par = isFinite(g.par) && g.par > 0 ? g.par : holePar(holes[(g.hole | 0) - 1]);
  const rl = v5El('golf-round-line');
  setHidden(rl, !round);
  // v10: the hole count from the round record when it carries one (nine for Thread National)
  const nHoles = isFinite(g.holes) && g.holes > 0 ? g.holes : n;
  if (round) setText(rl, 'roundLine', 'Round · Hole ' + (g.hole | 0) + ' of ' + nHoles + ' · Par ' + par + ' · Stroke ' + (g.strokes | 0));
  setText(v5El('golf-title'), 'title', range
    ? 'Driving range · Shot ' + (g.ballsHit | 0)
    : 'Hole ' + (g.hole | 0) + ' · Par ' + par + ' · Stroke ' + (g.strokes | 0));
  setText(v5El('golf-club'), 'club', capitalize(g.club));
  setHidden(v5El('golf-card'), range); setHidden(v5El('golf-range'), !range);
  if (range) {
    setText(v5El('golf-best'), 'best', 'Best carry: ' + Math.round(isFinite(g.bestCarry) ? g.bestCarry : 0) + ' tiles');
    setText(v5El('golf-balls'), 'balls', 'Balls hit: ' + (g.ballsHit | 0));
  } else {
    ensureGolfCard(holes);
    if (round) {
      const r = writeCardRow(g, holes, 'golf-card-', 'golf-card-total', hudState.rcells);
      // the running to par over the holes played so far: E for even, else signed
      const tp = !r.any ? 'E' : r.diff === 0 ? 'E' : (r.diff > 0 ? '+' : '') + r.diff;
      const tpEl = v5El('golf-to-par');
      if (tpEl && hudState.toPar !== tp) { hudState.toPar = tp; tpEl.textContent = tp; }
      const cls = r.diff < 0 ? 't-under' : r.diff > 0 ? 't-worse' : '';
      if (tpEl && hudState.toParCls !== cls) { hudState.toParCls = cls; tpEl.className = cls; }
      // the clock runs from the round start (golf.roundT0, the same state.time clock the player
      // steps with) while the round is on; 'done' shows the final time finishRound recorded
      const now = TT.state ? TT.state.time : NaN;
      const live = g.phase !== 'done' && isFinite(g.roundT0) && g.roundT0 >= 0 && isFinite(now) ? Math.max(0, now - g.roundT0) : NaN;
      const secs = isFinite(live) ? live : (isFinite(g.roundSeconds) ? g.roundSeconds : 0);
      setText(v5El('golf-round-time'), 'rtime', fmtClock(secs));
    } else writeCardRow(g, holes, 'golf-c', 'golf-total', hudState.cells);
  }
  // the cart line (round only; null otherwise)
  const ch = g.cartHint ? String(g.cartHint) : '';
  const cartEl = v5El('golf-cart-hint');
  setHidden(cartEl, !ch);
  if (cartEl && ch && hudState.cart !== ch) { hudState.cart = ch; cartEl.innerHTML = cartHintHtml(ch); }
  // the meter: live power while charging, the 0.7 preview at half opacity while aiming, hidden otherwise
  const aiming = g.phase === 'aim', charging = g.phase === 'charging';
  setHidden(pw, !(aiming || charging));
  if (pw && (aiming || charging)) {
    if (hudState.dim !== aiming) { hudState.dim = aiming; pw.classList.toggle('dim', aiming); }
    const v = clamp(aiming ? (isFinite(g.aimPower) ? g.aimPower : 0.7) : (isFinite(g.power) ? g.power : 0), 0, 1);
    const w = Math.round(v * 1000) / 10, bar = v5El('golf-bar');
    if (bar && hudState.powerW !== w) { hudState.powerW = w; bar.style.width = w + '%'; }
    const hot = charging && v > 0.9;
    if (bar && hudState.hot !== hot) { hudState.hot = hot; bar.classList.toggle('hot', hot); }
    const bandOn = g.club === 'driver', band = v5El('golf-band');
    if (band && hudState.band !== bandOn) { hudState.band = bandOn; band.hidden = !bandOn; }
  }
  // the banner; v8: 'done' is the round summary (its keys sit on the cart line), 'finished' the
  // practice hole holed (E plays it again, X leaves)
  const m = g.message ? String(g.message) : '', done = g.phase === 'done', finished = g.phase === 'finished';
  // v6: the round summary carries the leaderboard rank of the finished round
  const rank = done && round && golfRank && isFinite(golfRank.rank) ? ' · Rank ' + golfRank.rank + ' of ' + golfRank.total : '';
  const mkey = m + rank + (finished ? '|finished' : done ? '|done' : '');
  if (msg && hudState.msg !== mkey) {
    hudState.msg = mkey;
    msg.innerHTML = escapeHtml(m + rank) + (finished ? '<small><kbd>E</kbd> Play again <kbd>X</kbd> Leave</small>' : '');
  }
  setHidden(msg, !m);
}
function updateInteriorHint() {
  const el = v5El('interior-hint');
  if (!el) return;
  const room = walkOn && player ? player.interior : null;
  if (!room) { setHidden(el, true); return; }
  const d = room.id ? deptFor(room.id) : null;
  setText(el, 'hint', 'Inside ' + (d && d.name ? d.name : 'the building') + '. Walk to the door to leave');
  setHidden(el, false);
}
/* #fade: the navy overlay follows player.fade / fadeT, or the inside-station fade, whichever is darker. */
function updateFadeOverlay() {
  const el = v5El('fade');
  if (!el) return;
  let a = 0;
  if (walkOn && player) {
    if (player.fade && isFinite(player.fadeT)) a = clamp(player.fadeT, 0, 1);
    a = Math.max(a, clamp(stationFade, 0, 1));
    a = Math.max(a, clamp(subwayFade, 0, 1));   // v6: the fade around the subway scene switch
  }
  const v = Math.round(a * 100) / 100;
  if (hudState.fade !== v) { hudState.fade = v; el.style.opacity = String(v); }
}
function resetV5Hud() {
  hudState.title = ''; hudState.club = ''; hudState.cells[0] = hudState.cells[1] = hudState.cells[2] = hudState.cells[3] = '';
  hudState.best = ''; hudState.balls = ''; hudState.dim = null; hudState.powerW = -1; hudState.hot = null; hudState.band = null;
  hudState.msg = ''; hudState.hint = ''; hudState.fade = -1;
  hudState.roundLine = ''; hudState.rcells = []; hudState.toPar = ''; hudState.toParCls = null; hudState.rtime = ''; hudState.cart = '';
  for (const id of ['golf-hud', 'golf-power', 'golf-msg', 'interior-hint', 'golf-round-line', 'golf-cart-hint']) setHidden(v5El(id), true);
  const fade = v5El('fade');
  if (fade) fade.style.opacity = '0';
  resetRunnerHud();
  golfRank = null; golfDoneSeen = false;
}
function setHudVisible(on) {
  const he = hudEl('hud');
  if (he) he.hidden = !on;
  const pe = hudEl('prompt');
  if (pe && !on) { pe.hidden = true; promptKey = ''; promptFade.shown = false; promptFade.armed = false; promptFade.hideAt = -1; if (pe.style) pe.style.opacity = ''; }
  if (!on) resetV5Hud();
  if (!on) { if (hoverRec) hoverRec.m.group.visible = false; if (minimapMount) minimapMount.hidden = true; }   // v11
  if (!on) {   // v13: the map closes, the waypoint and the HUD line go with walk mode (v14: and the plaque note)
    if (statue && statue.isOpen()) statue.close();
    closeMap(); clearWaypoint(true); wpState.hereUntil = -1; mHoldAt = -1; mHoldOpened = false;
    if (wpEl) { wpState.hidden = true; wpEl.hidden = true; if (wpEl.style) wpEl.style.display = 'none'; }
  }
  if (document.body) document.body.classList.toggle('walk', on);
}

function requestLock() {
  if (touchLive) return;   // v12: no pointer lock on touch, the look drag replaces it
  if (!canvasEl || pointerLocked || !canvasEl.requestPointerLock) return;
  try { const r = canvasEl.requestPointerLock(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { /* not allowed here */ }
}
function releaseLock() {
  if (document.pointerLockElement && document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
}

/* TT.town.setWalkMode: enter stores the camera mode and hands the scene to the player; exit restores it. */
function setWalkMode(on, spec) {
  on = !!on;
  if (on) {
    if (!player || !renderer) return false;
    if (spec && typeof spec === 'object') player.spec = Object.assign(player.spec || {}, spec);
    const useSpec = player.spec || { name: 'You', role: 'Visitor', kind: 'alien', species: null, color: AQUA, demo: false };
    if (walkOn) { ensurePlayerRec(useSpec); setPlayerInScene(true); return true; }
    // board cinematic off, hover and camera animations cleared, controls handed over
    if (cinematic) { cinematic = false; if (controls) controls.autoRotate = false; }
    if (TT.state.hover) { applyHoverPause(TT.state.hover, null); TT.state.hover = null; if (TT.onHover) TT.onHover(null, null); }
    if (canvasEl) canvasEl.style.cursor = 'default';
    camAnim = null; followId = null;
    prevCamMode = camMode === 'walk' ? prevCamMode : camMode;
    camMode = 'walk';
    applyCameraMode();
    savedFov = camera.fov; savedNear = camera.near;
    camera.fov = WALK_FOV; camera.near = WALK_NEAR; camera.updateProjectionMatrix();
    ensurePlayerRec(useSpec);
    clearWalkKeys(); extInput = null;
    camKey = ''; camFrom.on = false; stationFade = 0;
    player.enter();
    player.mesh = playerRec.handle;
    setPlayerInScene(true);
    walkOn = true;
    syncPlayer(0.001, TT.state.time);
    setHudVisible(true);
    if (touch) syncTouchMode();   // v12: the walk buttons at once
    return true;
  }
  if (!walkOn) return false;
  // v6: leaving walk mode from inside the runner ends the game at once (no fade)
  if (gameMode === 'subway' || subwayPhase) endSubwayNow();
  walkOn = false;
  releaseLock();
  clearWalkKeys(); extInput = null;
  leaveStation(TT.state.time);
  try { player.exit(); } catch (e) { console.warn('Thread Town: player.exit failed', e); }
  if (playerRec) {
    setClubProp(null);
    playerRec.handle.golfPhase = 0;
    if (playerRec.propKind) { detachProp(playerRec.handle); playerRec.propKind = null; }
    playerRec.handle.group.visible = true;
    setPlayerInScene(false);
  }
  // v5: back outdoors, the aim line and flash off, the overlay clear; v10: the ring and the ball effects too
  applyInteriorLook(null);
  if (aimLine) { aimLine.visible = false; aimRing.visible = false; }
  if (golfFlash) golfFlash.visible = false;
  if (hiRing) hiRing.clear();
  if (ballStreak) ballStreak.visible = false;
  if (ballTrail) { ballTrail.visible = false; trailPts.length = 0; }
  player.anchorPos = null;
  camKey = ''; camFrom.on = false; stationFade = 0;
  setHudVisible(false);
  camera.fov = savedFov; camera.near = savedNear; camera.updateProjectionMatrix();
  camMode = 'orbit';   // v12.1: the overview is always the orbit camera
  applyCameraMode();
  camAnim = null; followId = null;
  // the camera is at eye level where the walk ended; float back to the overview from there
  if (controls) { controls.target.y = 0; if (camMode === 'free') { clampCameraPos(); syncFreeTarget(); } controls.update(); }
  resetView();
  if (touch) syncTouchMode();   // v12: the buttons go with walk mode
  return true;
}

/* ---------- version 6: the subway entrance, the runner and the leaderboard ----------
   (CONTRACT_V6 "Renderer integration" and "Leaderboard", docs/SUBWAY_DESIGN.md.)
   The entrance is static geometry on the plaza footprint from state.subway: the ground plane is cut
   open over the stairwell (flatGeometry), the well below holds seven steps down to a landing lit by
   the platform glow, a stone curb and a mosaic band ring the mouth, green railings with globe lamps
   run along both sides, a THREAD METRO sign hangs from a post at the south-east corner and the subway
   scoreboard stands beside it. The game lives in its own scene (js/subway.js) and is built on the
   first entry with the visitor's character factory and animator; in game mode the frame loop steps
   it instead of the player and renders its scene and camera while the town keeps simulating. */
function subwayRect() {
  const s = TT.state.subway;
  if (!s || !s.tile || !isFinite(s.tile.x) || !isFinite(s.tile.y)) return null;
  // the 2 by 2 footprint is tile.x - 1 .. tile.x + 1 by tile.y - 1 .. tile.y + 1; the enter zone is the tile row south of it
  const cx = s.tile.x, cz = s.tile.y;
  return { cx, cz, x0: cx - 1, x1: cx + 1, z0: cz - 1, z1: cz + 1 };
}
/* The stairwell opening cut through the ground plane, in world units. */
function subwayHole() {
  const r = subwayRect();
  if (!r) return null;
  return { x0: r.cx - MOUTH_HW, x1: r.cx + MOUTH_HW, z0: r.cz + MOUTH_N, z1: r.cz + MOUTH_S };
}
function isSubwayTile(x, y) {
  const r = subwayRect();
  return !!r && x >= r.x0 && x < r.x1 && y >= r.z0 && y < r.z1;
}
/* A canvas-textured plane with the texture as emissive map too, so it reads at night. */
function makeDecal(w, h, tex, parent, x, y, z, ry) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.3 });
  reg(m, 0.25);
  const d = mesh(new THREE.PlaneGeometry(w, h), m, parent, false, false);
  d.position.set(x, y, z);
  if (ry) d.rotation.y = ry;
  return d;
}
function mosaicTexture() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#D7DEE4'; g.fillRect(0, 0, 64, 64);
  const r = TT.rng(606), cols = [AQUA, AQUA, AQUA, AQUA, AQUA, NAVY, NAVY, '#FFFFFF', '#FFFFFF', SALMON];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.fillRect(i * 16 + 1.5, j * 16 + 1.5, 13, 13);
  }
  return makeTex(c, { repeat: true });
}
let metroSign = null;          // { canvas, ctx, tex, fonts }
function paintMetroSign(sign) {
  const g = sign.ctx, cw = sign.canvas.width, ch = sign.canvas.height;
  g.clearRect(0, 0, cw, ch);
  g.fillStyle = NAVY; g.fillRect(0, 0, cw, ch);
  g.fillStyle = AQUA; g.fillRect(0, ch - 10, cw, 10);
  g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(62, 60, 42, 0, TAU); g.fill();
  g.fillStyle = NAVY; g.font = '600 58px Kanit, Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 62, 63);
  let size = 66, tw;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  for (;;) { g.font = '600 ' + size + 'px Kanit, Inter, sans-serif'; tw = g.measureText('THREAD METRO').width; if (tw <= cw - 140 || size <= 30) break; size -= 2; }
  g.fillStyle = '#FFFFFF'; g.fillText('THREAD METRO', 122, 84);
  sign.tex.needsUpdate = true;
  sign.fonts = fontsReady;
}
function buildSubwayEntrance() {
  const r = subwayRect();
  if (!r) return;
  const { cx, cz } = r;
  const g = new THREE.Group();
  const dark = std('#1B2530', 0.95), tread = M.lightStone, curb = std('#CBD3DA', 0.9), green = std('#2F6E52', 0.55, 0.25);
  const glowMat = reg(new THREE.MeshStandardMaterial({ color: '#FFE2A0', roughness: 0.6, emissive: '#FFD98A', emissiveIntensity: 0.9 }), 0.25);
  const hw = MOUTH_HW, zn = cz + MOUTH_N, zs = cz + MOUTH_S, depth = 1.5, zc = (zn + zs) / 2;
  // the well below the ground: floor, side and north walls, the platform glow on the north wall
  mesh(geoBox(2 * hw + 0.3, 0.06, zs - zn + 0.3, cx, -depth - 0.03, zc), dark, g, false, true);
  mesh(geoBox(0.12, depth + 0.02, zs - zn + 0.24, cx - hw - 0.06, -depth / 2, zc - 0.06), dark, g, false, true);
  mesh(geoBox(0.12, depth + 0.02, zs - zn + 0.24, cx + hw + 0.06, -depth / 2, zc - 0.06), dark, g, false, true);
  mesh(geoBox(2 * hw + 0.24, depth + 0.02, 0.12, cx, -depth / 2, zn - 0.06), dark, g, false, true);
  mesh(geoBox(2 * hw - 0.1, 0.5, 0.02, cx, -depth + 0.3, zn + 0.012), glowMat, g, false, false);
  // seven steps down from the south lip (run 0.2, rise 0.2), iron nosings, then the landing
  const STEPS = 7, run = 0.2, rise = 0.2;
  const steps = [], nosing = [];
  for (let i = 0; i < STEPS; i++) {
    const top = -rise * (i + 1);
    steps.push(geoBox(2 * hw, top + depth, run, cx, (top - depth) / 2, zs - run * (i + 0.5)));
    nosing.push(geoBox(2 * hw, 0.02, 0.03, cx, top + 0.01, zs - run * i - 0.015));
  }
  const landN = zs - run * STEPS;
  steps.push(geoBox(2 * hw, depth - rise * STEPS, landN - zn, cx, (-rise * STEPS - depth) / 2, (zn + landN) / 2));
  mesh(merge(steps), tread, g, false, true);
  mesh(merge(nosing), M.iron, g, false, false);
  // the curb around the mouth (west, north, east) and the mosaic band over the rest of the footprint
  mesh(merge([
    geoBox(0.12, 0.1, zs - zn + 0.24, cx - hw - 0.06, 0.05, zc - 0.06),
    geoBox(0.12, 0.1, zs - zn + 0.24, cx + hw + 0.06, 0.05, zc - 0.06),
    geoBox(2 * hw + 0.24, 0.1, 0.12, cx, 0.05, zn - 0.06),
  ]), curb, g, true, true);
  const mosaicMat = reg(new THREE.MeshStandardMaterial({ map: mosaicTexture(), roughness: 0.55 }), 0.25);
  const band = mesh(flatGeometry(cx - 1, cz - 1, cx + 1, cz + 1, 0.012, { x0: cx - hw - 0.12, x1: cx + hw + 0.12, z0: zn - 0.12, z1: zs }, (x, z) => [x * 1.25, z * 1.25]), mosaicMat, g, false, true);
  band.userData.noMerge = true;
  // green railings along both sides and across the north end, globe lamps on the two south posts
  const rail = [], posts = [];
  const rx = hw + 0.2, rzN = zn - 0.12, rzS = zs + 0.08, rzc = (rzN + rzS) / 2, rl = rzS - rzN;
  for (const s of [-1, 1]) {
    rail.push(geoBox(0.05, 0.05, rl, cx + s * rx, 0.98, rzc), geoBox(0.04, 0.04, rl, cx + s * rx, 0.52, rzc));
    posts.push(geoCyl(0.03, 0.03, 1.0, 10, cx + s * rx, 0.5, rzN + 0.03), geoCyl(0.03, 0.03, 1.0, 10, cx + s * rx, 0.5, cz));
    posts.push(geoCyl(0.032, 0.032, 1.3, 10, cx + s * rx, 0.65, rzS - 0.03), geoCyl(0.05, 0.05, 0.04, 10, cx + s * rx, 1.32, rzS - 0.03));
  }
  rail.push(geoBox(2 * rx + 0.05, 0.05, 0.05, cx, 0.98, rzN), geoBox(2 * rx + 0.04, 0.04, 0.04, cx, 0.52, rzN));
  mesh(merge(rail.concat(posts)), green, g, true, false);
  mesh(merge([geoSphere(0.1, 16, 12, cx - rx, 1.44, rzS - 0.03), geoSphere(0.1, 16, 12, cx + rx, 1.44, rzS - 0.03)]), bulbMat, g, false, false);
  // the THREAD METRO sign on a post at the south-east corner, a decal on each face
  const px = cx + 0.96, pz = cz + 0.9;
  mesh(geoCyl(0.035, 0.035, 2.15, 10, px, 1.075, pz), green, g, true, false);
  mesh(geoBox(1.3, 0.38, 0.05, cx + 0.36, 1.98, pz), M.navy, g, true, false);
  const sc = makeCanvas(512, 132), stex = makeTex(sc);
  metroSign = { canvas: sc, ctx: sc.getContext('2d'), tex: stex, fonts: null };
  paintMetroSign(metroSign);
  makeDecal(1.24, 0.32, stex, g, cx + 0.36, 1.98, pz + 0.027, 0);
  makeDecal(1.24, 0.32, stex, g, cx + 0.36, 1.98, pz - 0.027, Math.PI);
  mergeStatic(g, new Set());
  registerGroupMaterials(g);
  // v8: the plaza is a plateau at 0, and the ground patch under the mouth sits at the same height
  g.position.y = hAt(cx, cz);
  scene.add(g);
  subwayGroup = g;
}

/* ---------- scoreboard signs (CONTRACT_V6 "Leaderboard": in the town) ----------
   A navy panel on an iron post with a canvas decal in Kanit: the top five of one game, repainted
   when the records change (and once the fonts arrive). The subway board stands beside the entrance,
   the golf board at the clubhouse porch. */
function makeScoreboard(game, title, x, z, yaw) {
  const g = new THREE.Group(); g.position.set(x, hAt(x, z), z); g.rotation.y = yaw || 0;   // v8: on the terrain
  g.name = 'scoreboard-' + game;
  mesh(geoCyl(0.03, 0.03, 1.85, 10, 0, 0.925, 0), M.iron, g, true, false);
  mesh(geoBox(0.9, 1.1, 0.05, 0, 1.35, 0), M.navy, g, true, false);
  const cv = makeCanvas(384, 480), tex = makeTex(cv);
  makeDecal(0.84, 1.04, tex, g, 0, 1.35, 0.027, 0);
  mergeStatic(g, new Set());
  registerGroupMaterials(g);
  scene.add(g);
  const rec = { game, title, group: g, canvas: cv, ctx: cv.getContext('2d'), tex, key: null };
  scoreboards.push(rec);
  return rec;
}
function paintScoreboard(rec, entries) {
  const g = rec.ctx, cw = rec.canvas.width, ch = rec.canvas.height;
  g.clearRect(0, 0, cw, ch);
  g.fillStyle = NAVY; g.fillRect(0, 0, cw, ch);
  g.strokeStyle = 'rgba(226,233,238,0.25)'; g.lineWidth = 3; g.strokeRect(8, 8, cw - 16, ch - 16);
  g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let size = 40;
  for (;;) { g.font = '600 ' + size + 'px Kanit, Inter, sans-serif'; if (g.measureText(rec.title).width <= cw - 48 || size <= 24) break; size -= 2; }
  g.fillText(rec.title, cw / 2, 62);
  g.fillStyle = AQUA; g.fillRect(cw / 2 - 60, 76, 120, 6);
  g.fillStyle = 'rgba(226,233,238,0.8)'; g.font = '500 20px Inter, sans-serif'; g.fillText('Top five', cw / 2, 112);
  if (!entries.length) {
    g.fillStyle = 'rgba(226,233,238,0.85)'; g.font = '500 24px Inter, sans-serif';
    g.fillText(rec.game === 'golf' ? 'No rounds yet' : 'No runs yet', cw / 2, 260);
  } else {
    for (let i = 0; i < entries.length && i < 5; i++) {
      const e = entries[i], y = 170 + i * 62;
      g.textAlign = 'left'; g.fillStyle = AQUA; g.font = '600 30px Kanit, Inter, sans-serif'; g.fillText(String(i + 1), 28, y);
      const score = rec.game === 'golf' ? String(Math.round(e.score)) : Math.round(e.score).toLocaleString('en-US') + ' m';
      g.textAlign = 'right'; g.fillStyle = '#FFFFFF'; g.fillText(score, cw - 28, y);
      const sw = g.measureText(score).width;
      g.textAlign = 'left'; g.font = '600 26px Inter, sans-serif';
      let name = String(e.name || 'Visitor');
      const maxW = cw - 28 - sw - 16 - 72;
      while (name.length > 1 && g.measureText(name).width > maxW) name = name.slice(0, -1);
      g.fillText(name, 72, y);
    }
    g.textAlign = 'center';
  }
  rec.tex.needsUpdate = true;
}
function buildScoreboards() {
  const r = subwayRect();
  if (r) makeScoreboard('subway', 'Thread Metro records', r.cx + 1.55, r.cz + 0.25, 0);
  const cb = TT.state.clubhouse;
  if (cb && isFinite(cb.x) && isFinite(cb.y)) {
    // beside the porch at the building's west corner in the canonical frame, turned with the lot
    // (v7; v10: any angle about the exact footprint center, the canonical size from the local record)
    const rot = cb.rot || 0;
    const cw = cb.local && isFinite(cb.local.w) ? cb.local.w : cb.w, ch = cb.local && isFinite(cb.local.h) ? cb.local.h : cb.h;
    const c = recCenter(cb);
    const o = rotOff(rot, -cw / 2 - 0.9, ch / 2 + 0.5);
    makeScoreboard('golf', 'Clubhouse records', c.x + o.x, c.y + o.z, rot * DEG);
  }
  refreshSigns(true);
}
/* Repaints the metro sign and the scoreboards whose top five changed (or everything when force). */
function refreshSigns(force) {
  if (metroSign && (force || metroSign.fonts !== fontsReady)) paintMetroSign(metroSign);
  for (const rec of scoreboards) {
    let entries = [];
    if (leaderboard) { try { entries = leaderboard.top(rec.game, 5) || []; } catch (e) { entries = []; } }
    const key = (fontsReady ? 'f|' : 'n|') + entries.map(e => e.name + ':' + e.score).join('|');
    if (!force && key === rec.key) continue;
    rec.key = key;
    paintScoreboard(rec, entries);
  }
}

/* ---------- leaderboard (CONTRACT_V6 "Leaderboard") ----------
   TT.leaderboard exposes top, all and clear to ui.js (plus record for tests); every record and clear
   repaints the scoreboards and calls TT.onLeaderboardChange so the modal and the sidebar refresh. */
function buildLeaderboard() {
  if (!createLeaderboard) return;
  try { leaderboard = createLeaderboard(townStorage); } catch (e) { console.warn('Thread Town: the leaderboard failed to build', e); leaderboard = null; return; }
  TT.leaderboard = {
    top(game, n) { return leaderboard.top(game, n === undefined ? 10 : n); },
    all() { return leaderboard.all(); },
    record(game, entry) { return recordScore(game, entry); },
    clear(game) { leaderboard.clear(game); leaderboardChanged(); },
  };
}
function leaderboardChanged() {
  refreshSigns(false);
  if (typeof TT.onLeaderboardChange === 'function') {
    try { TT.onLeaderboardChange(); } catch (e) { console.warn('Thread Town: onLeaderboardChange failed', e); }
  }
}
/* Records one result and returns { rank, total } (or null when the leaderboard is unavailable). */
function recordScore(game, entry) {
  if (!leaderboard) return null;
  let res = null;
  try { res = leaderboard.record(game, entry); } catch (e) { console.warn('Thread Town: leaderboard record failed', e); return null; }
  leaderboardChanged();
  return res;
}
/* v8 (CONTRACT_V8 "Round end", "Leaderboard"): a completed round is recorded once when
   player.golf.roundResult appears (written by player.js when the last hole is holed): score is the
   total strokes, detail { seconds, card, toPar }. Practice (mode 'hole') and an abandoned round
   never carry a roundResult, so they are never recorded. golfDoneSeen holds the recorded result
   object so the same round is not written twice. v10 (CONTRACT_V10 "Thread National"): only a
   complete nine-hole round is recorded; detail carries holes 9, the par, the term and the course
   name, which the leaderboard requires (it rejects anything without holes === 9). */
function noteGolfRound(G) {
  const rr = G && G.mode === 'round' && G.roundResult && typeof G.roundResult === 'object' ? G.roundResult : null;
  if (rr) {
    if (golfDoneSeen === rr) return;
    golfDoneSeen = rr;
    const card = Array.isArray(rr.card) ? rr.card.map(v => (typeof v === 'number' && isFinite(v) ? v : 0)) : [];
    const holes = isFinite(rr.holes) ? rr.holes : card.length;
    if (holes !== 9 || rr.complete === false) { golfRank = null; return; }
    let total = 0;
    for (const v of card) total += v;
    if (isFinite(rr.strokes) && rr.strokes > 0) total = rr.strokes;
    const toPar = isFinite(rr.toPar) ? rr.toPar : total - coursePar();
    const spec = (player && player.spec) || {};
    const secs = isFinite(rr.seconds) ? Math.max(0, rr.seconds) : (isFinite(G.roundSeconds) ? Math.max(0, G.roundSeconds) : 0);
    const detail = { seconds: Math.round(secs * 10) / 10, card, toPar, holes: 9, par: isFinite(rr.par) ? rr.par : coursePar() };
    if (typeof rr.term === 'string') detail.term = rr.term;
    detail.course = typeof rr.course === 'string' && rr.course ? rr.course : courseName();
    golfRank = recordScore('golf', { name: spec.name || 'Visitor', character: playerCharacterId(spec), score: total, detail });
  } else if (golfDoneSeen) { golfDoneSeen = false; golfRank = null; }
}
/* The course name: the sim's record, the plan, else Thread National. */
function courseName() {
  const gs = TT.state && TT.state.golf;
  if (gs && typeof gs.name === 'string' && gs.name) return gs.name;
  const pg = TT.sim && TT.sim.PLAN && TT.sim.PLAN.golf;
  return (pg && typeof pg.name === 'string' && pg.name) || 'Thread National';
}

/* ---------- the runner: character handoff and game mode ---------- */
/* ctx.makeCharacter for the game: the visitor's own character (alien or animal) from the same
   factory as the walk-mode body; reused across restarts while the spec key holds. The game scales
   the group to ALIEN_SCALE itself and calls handle.setOpacity for the invulnerability flicker. */
function makeRunnerCharacter(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const key = playerSpecKey(s);
  if (runnerCh && runnerCh.key === key && !runnerCh.handle.disposed) { runnerCh.handle.hat = hatKindOf(wallet ? wallet.equipped : null, s); return runnerCh.handle; }
  if (runnerCh) { try { runnerCh.dispose(runnerCh.handle); } catch (e) { /* already gone */ } runnerCh = null; }
  const ch = makeCharacterForSpec(s);
  const h = ch.handle;
  if (h.parts && h.parts.ring) h.parts.ring.visible = false;
  h.setOpacity = alpha => ch.setOpacity(h, alpha);
  h.hat = hatKindOf(wallet ? wallet.equipped : null, s);   // v11: the runner wears the equipped hat
  runnerAnimators.set(h, ch.animate);
  runnerCh = { key, handle: h, dispose: ch.dispose };
  return h;
}
/* v11 ctx.makeChaser for the game: an uncached build (the inspector), so the runner's own cached
   slot never disposes it; the animator is resolved per handle like the runner's. */
function makeChaserCharacter(spec) {
  const ch = makeCharacterForSpec(spec && typeof spec === 'object' ? spec : {});
  const h = ch.handle;
  if (h.parts && h.parts.ring) h.parts.ring.visible = false;
  h.setOpacity = alpha => ch.setOpacity(h, alpha);
  runnerAnimators.set(h, ch.animate);
  chaserChs.push(ch);
  return h;
}
/* ctx.animate for the game: the animator that matches the handle (animateAlien or animateAnimal). */
function animateRunnerCharacter(handle, agent, time, dt, pose) {
  const fn = (handle && runnerAnimators.get(handle)) || animateAlien;
  fn(handle, agent, time, dt, pose);
}
/* v11: the purchased consumables a run starts with. The runner has one power-up slot, so one
   purchase is used per run: the jetpack first, then the 2x multiplier, then the magnet. */
function runConsumables() {
  const out = { magnet: false, jetpack: false, multiplier: false };
  if (!wallet) return out;
  try {
    if (wallet.consume('jetpack')) out.jetpack = true;
    else if (wallet.consume('multiplier')) out.multiplier = true;
    else if (wallet.consume('magnet')) out.magnet = true;
  } catch (e) { /* the run starts plain */ }
  return out;
}
/* v11: the run's coins (near-miss pay included) into the wallet, once per run at the catch or a quit. */
function onRunEnd(ev) {
  if (!wallet || !ev) return;
  const n = Math.floor(isFinite(ev.coins) ? ev.coins : 0);
  if (n > 0) wallet.add(n);
}
function ensureSubwayGame() {
  if (subway || !createSubwayGame) return subway;
  try {
    subway = createSubwayGame({
      THREE, makeCharacter: makeRunnerCharacter, animate: animateRunnerCharacter, storage: townStorage,
      // v11: the chasers, the coins into the wallet, the purchased power-ups and the hoverboard ownership
      makeChaser: makeChaserCharacter, animateChaser: animateRunnerCharacter,
      onRunEnd, consumables: runConsumables, hoverboardOwned: () => !!(wallet && wallet.owns('hoverboard')),
      isTouch: touchLive,   // v12: the 'Tap to run' lines
    });
  } catch (e) { console.error('Thread Town: the subway runner failed to build', e); subway = null; }
  if (subway) subway.resize(viewW, viewH);
  if (subway && typeof subway.setTouch === 'function') { try { subway.setTouch(touchLive); } catch (e) { /* ignore */ } }
  return subway;
}
/* The visitor may take the subway while walking and idle outdoors, with no fade or game under way. */
function subwayCanEnter() {
  if (!walkOn || !player || !player.active || gameMode || subwayPhase || insideRoom) return false;
  if (!(subway || createSubwayGame) || !subwayRect()) return false;
  const p = player;
  return p.state === 'idle' && !p.fade && !p.interior && !p.exiting;
}
/* True when every corner of the visitor's radius square rests in the enter zone (the tile row south of the footprint). */
function inSubwayZone(px, pz) {
  const r = subwayRect();
  if (!r) return false;
  const R = PLAYER_RADIUS;
  return px - R >= r.x0 && px + R <= r.x1 && pz - R >= r.z1 && pz + R <= r.z1 + 1;
}
/* Walking down the stairs: pressed against the footprint's south edge (the FT tiles stop the body
   there), heading north with a movement key down. */
function walkingIntoSubway(p) {
  const r = subwayRect();
  if (!r) return false;
  const R = PLAYER_RADIUS;
  if (!(p.pos.x - R >= r.x0 + 0.1 && p.pos.x + R <= r.x1 - 0.1)) return false;
  const gap = p.pos.y - R - r.z1;
  if (gap > 0.08 || gap < -0.05) return false;
  const pressing = Math.abs(walkInput.fwd) > 0.05 || Math.abs(walkInput.side) > 0.05;
  return pressing && !!p.moveDir && p.moveDir.z < -0.6;
}
function requestSubway(time) {
  if (!subwayCanEnter()) return false;
  beginSubwayFade('enter', time);
  return true;
}
/* Per-frame walk-mode hook (after player.update): the prompt in the enter zone and the stair walk-in. */
function syncSubwayWalk(p, time) {
  if (subwayPhase) { p.prompt = null; return; }   // no prompt while the overlay fades around the switch
  if (!subwayCanEnter()) return;
  if (!inSubwayZone(p.pos.x, p.pos.y)) return;
  p.prompt = SUBWAY_PROMPT;
  if (walkingIntoSubway(p)) requestSubway(time);
}
function beginSubwayFade(pending, time) {
  subwayPhase = 'out'; subwayPhaseT0 = time; subwayPending = pending; subwayFade = 0;
}
/* The overlay fade around a scene switch: 'out' to full navy, the switch, then 'in'. */
function stepSubwayFade(time) {
  if (!subwayPhase) return;
  const k = clamp((time - subwayPhaseT0) / SUBWAY_FADE, 0, 1);
  if (subwayPhase === 'out') {
    subwayFade = k;
    if (k >= 1) {
      const pending = subwayPending; subwayPending = null;
      if (pending === 'enter') enterSubwayNow();
      else if (pending === 'leave') leaveSubwayNow(time);
      subwayPhase = 'in'; subwayPhaseT0 = time; subwayFade = 1;
    }
  } else {
    subwayFade = 1 - k;
    if (k >= 1) { subwayPhase = null; subwayFade = 0; }
  }
}
/* Behind the overlay: the game starts from the visitor's spec and takes the view. */
function enterSubwayNow() {
  const game = ensureSubwayGame();
  if (!game || !player) return false;
  releaseLock(); clearWalkKeys(); clearSubKeys();
  resetRunnerHud();
  try { game.start(player.spec || {}); } catch (e) { console.error('Thread Town: the subway runner failed to start', e); return false; }
  game.resize(viewW, viewH);
  gameMode = 'subway';
  subwayRunT = 0; subwayDeadT = 0; subwayGoT = -1; subwayRank = null; subwayLastState = '';
  subwayHoverUsed = false; closePay = 0;
  if (document.body) document.body.classList.add('subway');
  return true;
}
/* Behind the overlay: back to the town at the foot of the stairs (the enter zone, centered on the
   stairwell), facing north, walk mode still on; the camera snaps to the new pose without a blend. */
function leaveSubwayNow(time) {
  gameMode = null;
  if (document.body) document.body.classList.remove('subway');
  resetRunnerHud();
  clearSubKeys(); clearWalkKeys();
  if (walkOn && player) {
    const r = subwayRect();
    player.enter(r ? { x: r.cx, y: r.z1 + 0.5, yaw: Math.PI } : undefined);
    if (playerRec) player.mesh = playerRec.handle;
    camKey = ''; camFrom.on = false; stationFade = 0; promptKey = '';
    syncPlayer(0.001, time);
  }
}
/* Walk mode ending from inside the runner: a quit is pushed through the game so a running run is
   credited, then everything is cleared at once (no fade; player.exit follows in setWalkMode). */
function endSubwayNow() {
  if (subway && gameMode === 'subway') {
    try { subway.setInput({ quit: true }); subway.update(1 / 60, TT.state.time); } catch (e) { /* the game is already gone */ }
  }
  gameMode = null; subwayPhase = null; subwayPending = null; subwayFade = 0;
  if (document.body) document.body.classList.remove('subway');
  resetRunnerHud();
  clearSubKeys();
}
/* Game keys: A D Left Right lanes, W Space Up jump, S Down Ctrl duck (held), R restart, E Esc quit,
   v11: H the hoverboard power-up. */
function subwayKey(k, ev, down) {
  const rep = !!ev.repeat;
  switch (k) {
    case 'a': case 'ArrowLeft': if (down && !rep) SUB.left = true; return true;
    case 'd': case 'ArrowRight': if (down && !rep) SUB.right = true; return true;
    case 'w': case ' ': case 'ArrowUp': if (down && !rep) SUB.jump = true; return true;
    case 's': case 'ArrowDown': case 'Control': SUB.duck = down; return true;
    case 'r': if (down && !rep) SUB.restart = true; return true;
    case 'e': case 'Escape': if (down && !rep) SUB.quit = true; return true;
    case 'h': if (down && !rep) SUB.hover = true; return true;
    default: return false;
  }
}
function clearSubKeys() { SUB.left = SUB.right = SUB.jump = SUB.duck = SUB.restart = SUB.quit = SUB.hover = false; }
/* One game frame: keys plus headless edges to the game, the update, the record on gameover, the
   fade on quit, the HUD. Input is muted while the overlay fades out toward the town. */
function stepSubway(dt, time) {
  const game = subway;
  if (!game) { gameMode = null; return; }
  const ext = subExt, mute = subwayPhase === 'out';
  // v11: the shop opens from the card through ui.js (not openShopFrom), so a held duck is
  // dropped here while the modal is up and no edge queued before it opened reaches the game
  const shopUp = shopOpen();
  if (shopUp) clearSubKeys();
  // v12: the touch layer's swipes and tap (and its Pause, the quit) go through as they are
  const tin = readTouch();
  const tOk = !!tin && !mute && !shopUp;
  subInput.left = !mute && (SUB.left || !!(ext && ext.left));
  subInput.right = !mute && (SUB.right || !!(ext && ext.right));
  subInput.jump = !mute && (SUB.jump || !!(ext && ext.jump));
  subInput.duck = !mute && (SUB.duck || !!(ext && ext.duck));
  subInput.restart = !mute && (SUB.restart || !!(ext && ext.restart));
  subInput.quit = !mute && (SUB.quit || !!(ext && ext.quit) || (tOk && !!tin.quit));
  subInput.hover = !mute && (SUB.hover || !!(ext && ext.hover));   // v11
  subInput.swipeLeft = tOk && !!tin.swipeLeft;
  subInput.swipeRight = tOk && !!tin.swipeRight;
  subInput.swipeUp = tOk && !!tin.swipeUp;
  subInput.swipeDown = tOk && !!tin.swipeDown;
  subInput.tap = tOk && !!tin.tap;
  game.setInput(subInput);
  SUB.left = SUB.right = SUB.jump = SUB.restart = SUB.quit = SUB.hover = false;
  if (ext) ext.left = ext.right = ext.jump = ext.restart = ext.quit = ext.hover = false;
  let ev = null;
  try { ev = game.update(dt, time); } catch (e) { console.error('Thread Town: subway update failed', e); ev = { type: 'quit' }; }
  const h = game.hud();
  if (h.state !== subwayLastState) {
    if (h.state === 'ready') { subwayRunT = 0; subwayDeadT = 0; subwayRank = null; subwayGoT = -1; }
    else if (h.state === 'running') subwayGoT = time;
    else if (h.state === 'dead') subwayDeadT = 0;
    else if (h.state === 'caught') buzz(120);   // v12: the catch
    subwayLastState = h.state;
  }
  if (h.state === 'running') subwayRunT += dt;
  else if (h.state === 'dead') subwayDeadT += dt;
  if (ev && ev.type === 'gameover') {
    const spec = (player && player.spec) || {};
    subwayRank = recordScore('subway', {
      name: spec.name || 'Visitor', character: playerCharacterId(spec), score: ev.distance,
      detail: { coins: ev.coins, seconds: Math.round(subwayRunT * 10) / 10 },
    });
  } else if (ev && ev.type === 'quit') {
    if (subwayPhase !== 'out') beginSubwayFade('leave', time);
  }
  writeRunnerHud(h, time);
  updateFadeOverlay();
}

/* ---------- runner HUD writes (SUBWAY_DESIGN "HUD and summary") ----------
   #runner-hud and #runner-center are in index.html; css shows them under body.subway. Text and
   attributes are written only when a value changes. */
const rEls = {};
let runnerSlotEls = null;
const RSTATE_INIT = { dist: '', coins: '', best: '', bestNew: null, power: null, kind: '', barW: -1, shield: null, mult: null, warn: -2, flash: false, gold: null, count: '', go: null, over: null, odist: '', ocoins: '', obest: '', olife: '', newbest: null, rank: '', rankHide: null,
  // v11: the multiplier chip text, the hoverboard pill and its text, the card title
  multText: '', hover: null, hoverText: '', title: '',
  // v12: the 'Tap to run' lines (the start screen and the card) on touch
  tapStart: '', tapCard: '' };
let runnerTapEls = null;       // v12: { start, card } built on first use (false when they cannot be)
/* v12: the 'Tap to run' line under the countdown (#runner-tap in #runner-center) and in the card's key row
   (.runner-tap in .runner-keys); index.html stays as it is, the elements are built here on first use. */
function ensureRunnerTapEls() {
  if (runnerTapEls !== null) return runnerTapEls;
  runnerTapEls = false;
  if (typeof document === 'undefined' || !document.createElement) return runnerTapEls;
  const out = { start: null, card: null };
  const center = rEl('runner-center'), count = rEl('runner-count');
  if (center && center.appendChild) {
    const el = document.createElement('div');
    el.id = 'runner-tap'; el.className = 'runner-tap'; el.hidden = true; el.textContent = 'Tap to run';
    try { if (count && count.parentNode === center && center.insertBefore) center.insertBefore(el, count.nextSibling || null); else center.appendChild(el); out.start = el; } catch (e) { out.start = null; }
  }
  const over = rEl('runner-over');
  let keys = null;
  if (over && typeof over.querySelector === 'function') { try { keys = over.querySelector('.runner-keys'); } catch (e) { keys = null; } }
  if (keys && keys.appendChild) {
    const el = document.createElement('span');
    el.className = 'runner-tap'; el.hidden = true; el.textContent = 'Tap to run';
    try { keys.appendChild(el); out.card = el; } catch (e) { out.card = null; }
  }
  if (out.start) rEls['runner-tap'] = out.start;
  runnerTapEls = (out.start || out.card) ? out : false;
  return runnerTapEls;
}
function writeTapLines(h) {
  const line = typeof h.tapLine === 'string' ? h.tapLine : '';
  if (!line && !rState.tapStart && !rState.tapCard) return;
  const els = ensureRunnerTapEls();
  if (!els) return;
  const start = h.state === 'ready' ? line : '', card = h.state === 'dead' ? line : '';
  if (els.start && rState.tapStart !== start) { rState.tapStart = start; els.start.textContent = start || 'Tap to run'; els.start.hidden = !start; }
  if (els.card && rState.tapCard !== card) { rState.tapCard = card; els.card.textContent = card || 'Tap to run'; els.card.hidden = !card; }
}
const rState = Object.assign({}, RSTATE_INIT);
function rEl(id) {
  let el = rEls[id];
  if (el === undefined) { el = document.getElementById(id) || null; rEls[id] = el; }
  return el;
}
/* v11: the hoverboard pill beside the shield pill (index.html stays as it is; the pill is built here on first use). */
function ensureRunnerHoverEl() {
  if (runnerHoverEl !== null) return runnerHoverEl;
  runnerHoverEl = false;
  if (typeof document === 'undefined' || !document.createElement) return runnerHoverEl;
  const shield = rEl('runner-shield');
  if (!shield || !shield.parentNode || !shield.parentNode.insertBefore) return runnerHoverEl;
  const el = document.createElement('div');
  el.id = 'runner-hover'; el.className = 'runner-pill outline'; el.hidden = true; el.textContent = 'Hoverboard';
  shield.parentNode.insertBefore(el, shield.nextSibling || null);
  rEls['runner-hover'] = el;
  runnerHoverEl = el;
  return el;
}
/* v11: the summary card's title ('Game over', or 'Caught at <distance>' after a catch). */
function runnerTitle() {
  if (runnerTitleEl === null) {
    runnerTitleEl = false;
    if (typeof document !== 'undefined' && document.querySelector) { try { runnerTitleEl = document.querySelector('#runner-over .runner-card-head h3') || false; } catch (e) { runnerTitleEl = false; } }
  }
  return runnerTitleEl || null;
}
function runnerSlots() {
  if (!runnerSlotEls) runnerSlotEls = Array.from(document.querySelectorAll('#runner-warn .runner-slot'));
  return runnerSlotEls;
}
function rText(id, key, text) { const el = rEl(id); if (el && rState[key] !== text) { rState[key] = text; el.textContent = text; } }
function rHide(id, key, hidden) { const el = rEl(id); if (el && rState[key] !== hidden) { rState[key] = hidden; el.hidden = hidden; } }
function rClass(id, cls, on) { const el = rEl(id); if (el) el.classList.toggle(cls, on); }
function fmtMeters(n) { return (Math.round(isFinite(n) ? n : 0) || 0).toLocaleString('en-US') + ' m'; }
function writeRunnerHud(h, time) {
  rText('runner-dist', 'dist', fmtMeters(h.distance));
  rText('runner-coins', 'coins', String(h.coins | 0));
  if (h.coinPulse > 0) { const el = rEl('runner-coins'); if (el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } }
  // v11: the gold disc shows the 2x pickup (hud.double); the chip reads the run multiplier, the
  // pickup plus the near-miss streak bonus (hud.multiplier, hud.streakBonus)
  const gold = !!h.double;
  if (rState.gold !== gold) { rState.gold = gold; rClass('runner-coin-disc', 'gold', gold); }
  const nb = !!h.newBest && h.state === 'running';
  rText('runner-best', 'best', nb ? 'New best' : 'Best ' + fmtMeters(h.best));
  if (rState.bestNew !== nb) { rState.bestNew = nb; rClass('runner-best', 'new', nb); }
  const pu = h.powerUp;
  rHide('runner-power', 'power', !pu);
  if (pu) {
    rText('runner-power-kind', 'kind', PU_LABEL[pu.kind] || capitalize(pu.kind));
    const w = Math.round(clamp(pu.duration > 0 ? pu.remaining / pu.duration : 0, 0, 1) * 100);
    if (rState.barW !== w) { rState.barW = w; const b = rEl('runner-power-bar'); if (b) b.style.width = w + '%'; }
  }
  rHide('runner-shield', 'shield', !h.shield);
  const mult = isFinite(h.multiplier) ? h.multiplier : 1, bonus = h.streakBonus | 0;
  rHide('runner-mult', 'mult', !(mult > 1));
  if (mult > 1) rText('runner-mult', 'multText', mult + 'x' + (bonus > 0 ? ' streak' : ''));
  // v11: the hoverboard pill: the time left while active, the H hint while owned and unused
  const hb = h.hoverboard, hoverOn = !!(hb && hb.active);
  if (hoverOn) subwayHoverUsed = true;
  let htext = '';
  if (hoverOn) htext = 'Hoverboard ' + Math.max(1, Math.ceil(isFinite(hb.remaining) ? hb.remaining : 0)) + ' s';
  else if (h.hoverboardOwned && !subwayHoverUsed && h.state === 'running') htext = 'H  Hoverboard';
  if (ensureRunnerHoverEl()) { rHide('runner-hover', 'hover', !htext); if (htext) rText('runner-hover', 'hoverText', htext); }
  const warn = h.warning === null || h.warning === undefined ? -2 : (h.warning | 0);
  if (rState.warn !== warn) { rState.warn = warn; const slots = runnerSlots(); for (let i = 0; i < slots.length; i++) slots[i].classList.toggle('on', i === warn + 1); }
  const flash = !!h.hitFlash || !!h.hoverPop;   // v11: a forgiven crash flashes too
  if (rState.flash !== flash) { rState.flash = flash; rClass('runner-flash', 'hit', flash); }
  // countdown digits (each re-triggers the css scale-in), then "Go" for half a second
  const ce = rEl('runner-count');
  let count = '', go = false;
  // v10: a near miss (hud.nearMiss counts them this frame) flashes 'Close!' in the Go slot for 0.45 s;
  // v11: with its pay ('Close! +2'); nothing shows through the catch
  if (h.state === 'running' && h.nearMiss > 0) { closeUntil = time + 0.45; closePay = h.nearMissCoins | 0; }
  if (h.state === 'ready') count = String(Math.max(1, h.countdown | 0));
  else if (h.state === 'running' && subwayGoT >= 0 && time - subwayGoT < 0.5) { count = 'Go'; go = true; }
  else if (h.state === 'running' && time < closeUntil) { count = closePay > 0 ? 'Close! +' + closePay : 'Close!'; go = true; }
  if (rState.count !== count) {
    rState.count = count;
    if (ce) { ce.textContent = count; ce.hidden = !count; if (count) { ce.style.animation = 'none'; void ce.offsetWidth; ce.style.animation = ''; } }
  }
  if (rState.go !== go) { rState.go = go; if (ce) ce.classList.toggle('go', go); }
  // the summary card once the catch has played (the game holds 'caught' for 1.2 s before 'dead'),
  // with the rank of the recorded run; v11: it reads 'Caught at <distance>' after a catch
  const over = h.state === 'dead';
  rHide('runner-over', 'over', !over);
  if (over) {
    const title = h.caught ? 'Caught at ' + fmtMeters(h.distance) : 'Game over';
    const te = runnerTitle();
    if (te && rState.title !== title) { rState.title = title; te.textContent = title; }
    rText('runner-over-dist', 'odist', fmtMeters(h.distance));
    rText('runner-over-coins', 'ocoins', String(h.coins | 0));
    rText('runner-over-best', 'obest', fmtMeters(h.best));
    rText('runner-over-life', 'olife', fmtMeters(h.lifetime));
    rHide('runner-over-newbest', 'newbest', !h.newBest);
    const rk = subwayRank && isFinite(subwayRank.rank) ? 'Rank ' + subwayRank.rank + ' of ' + subwayRank.total : '';
    rText('runner-over-rank', 'rank', rk);
    rHide('runner-over-rank', 'rankHide', !rk);
  }
  writeTapLines(h);   // v12
}
/* Hides every runner piece and drops the caches so the next run starts clean. */
function resetRunnerHud() {
  if (typeof document === 'undefined') return;
  for (const id of ['runner-count', 'runner-over', 'runner-over-newbest', 'runner-over-rank', 'runner-power', 'runner-shield', 'runner-mult', 'runner-hover']) { const el = rEls[id] || (id === 'runner-hover' ? null : rEl(id)); if (el && !el.hidden) el.hidden = true; }
  if (runnerTapEls) { for (const k of ['start', 'card']) { const el = runnerTapEls[k]; if (el && !el.hidden) el.hidden = true; } }   // v12
  rClass('runner-flash', 'hit', false); rClass('runner-coins', 'pulse', false); rClass('runner-best', 'new', false);
  rClass('runner-count', 'go', false); rClass('runner-coin-disc', 'gold', false);
  for (const s of runnerSlots()) s.classList.remove('on');
  Object.assign(rState, RSTATE_INIT);
}

/* ---------- picking ---------- */
function findPick(obj) { while (obj) { if (obj.userData && obj.userData.pick) return obj.userData.pick; obj = obj.parent; } return null; }
function pickAt(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  let hits = agentGroupList.length ? _ray.intersectObjects(agentGroupList, true) : [];
  for (const hit of hits) { const p = findPick(hit.object); if (p && p.kind === 'agent') return { kind: 'agent', id: p.agent.id, agent: p.agent }; }
  hits = buildingGroupList.length ? _ray.intersectObjects(buildingGroupList, true) : [];
  for (const hit of hits) {
    // additive beams, ripple rings and other see-through effects do not count as the building
    const m = hit.object.material;
    if (m && m.transparent && m.depthWrite === false) continue;
    const p = findPick(hit.object);
    if (p && p.kind === 'dept') { const b = p.rec.b; return { kind: 'dept', id: b.dept.id, dept: b.dept, building: b }; }
  }
  return null;
}
/* v12: a finger is wider than an agent at the overview (about 3 px across on a 390 px phone), so a tap
   that misses tries a ring of offsets out to the 12 px slop and takes the first hit, an agent before a
   building. Only taps use it; a mouse click keeps the exact v11 path. */
const TAP_RING = [[0, -6], [6, 0], [0, 6], [-6, 0], [4, -4], [4, 4], [-4, 4], [-4, -4], [0, -12], [12, 0], [0, 12], [-12, 0], [8, -8], [8, 8], [-8, 8], [-8, -8]];
function pickNear(clientX, clientY) {
  let p = pickAt(clientX, clientY);
  if (p && p.kind === 'agent') return p;
  let dept = p;
  for (let i = 0; i < TAP_RING.length; i++) {
    const q = pickAt(clientX + TAP_RING[i][0], clientY + TAP_RING[i][1]);
    if (q && q.kind === 'agent') return q;
    if (q && !dept) dept = q;
  }
  return dept;
}
let downX = 0, downY = 0, pointerDown = false;
/* Hover pause is applied the moment the hover changes (not only on the next render) so the
   simulation freezes the alien right away, including when stepped headlessly with tick(). */
function applyHoverPause(prev, next) {
  if (prev && prev.kind === 'agent' && prev.agent) prev.agent.paused = false;
  if (next && next.kind === 'agent' && next.agent) next.agent.paused = true;
}
function bindPointer() {
  // Pointer Lock (CONTRACT_V4 "Input"): locked while walking after a click on the canvas; Esc releases it.
  document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvasEl; });
  document.addEventListener('pointerlockerror', () => { pointerLocked = false; });
  // v12: a laptop with a touchscreen shows the controls after the first touch on the view and hides
  // them again after a mouse move; a coarse pointer keeps them (nothing here runs when isTouch is false)
  if (isTouch) {
    canvasEl.addEventListener('touchstart', () => { if (!touchLive) setTouchLive(true); }, { passive: true });
    if (touchMount && touchMount !== container && touchMount.addEventListener) touchMount.addEventListener('touchstart', () => { if (!touchLive) setTouchLive(true); }, { passive: true });
    else if (container && container.addEventListener) container.addEventListener('touchstart', () => { if (!touchLive) setTouchLive(true); }, { passive: true });
  }
  canvasEl.addEventListener('pointermove', ev => {
    if (isTouch && touchLive && !touchCoarse && ev.pointerType === 'mouse' && !ev.buttons) setTouchLive(false);   // v12
    if (camMode === 'walk') {
      // mouse look: movementX/Y while locked, right-drag deltas otherwise; no hover picking
      if (pointerLocked) { WALK.lookDX += ev.movementX || 0; WALK.lookDY += ev.movementY || 0; }
      else if (pointerDown && FREE.btn === 2) { WALK.lookDX += ev.clientX - FREE.lastX; WALK.lookDY += ev.clientY - FREE.lastY; }
      FREE.lastX = ev.clientX; FREE.lastY = ev.clientY;
      return;
    }
    if (pointerDown && Math.hypot(ev.clientX - downX, ev.clientY - downY) > 4) {
      if (TT.state.hover) { applyHoverPause(TT.state.hover, null); TT.state.hover = null; if (TT.onHover) TT.onHover(null, ev); }
      if (camMode === 'free' && (FREE.btn === 0 || FREE.btn === 2)) {
        const dx = ev.clientX - FREE.lastX, dy = ev.clientY - FREE.lastY;
        FREE.lastX = ev.clientX; FREE.lastY = ev.clientY;
        if (followId) followId = null;
        camAnim = null;
        if (FREE.btn === 2) lookFree(dx, dy); else panFree(dx, dy);
      }
      return;
    }
    FREE.lastX = ev.clientX; FREE.lastY = ev.clientY;
    const p = pickAt(ev.clientX, ev.clientY);
    applyHoverPause(TT.state.hover, p);
    TT.state.hover = p;
    canvasEl.style.cursor = p ? 'pointer' : 'default';
    if (TT.onHover) TT.onHover(p, ev);
  });
  canvasEl.addEventListener('pointerdown', ev => {
    pointerDown = true; downX = ev.clientX; downY = ev.clientY;
    lastPointerType = ev.pointerType || 'mouse';   // v12: a tap picks with a wider slop
    FREE.btn = ev.button; FREE.lastX = ev.clientX; FREE.lastY = ev.clientY;
    if ((camMode === 'free' || camMode === 'walk') && ev.pointerType === 'mouse') { try { canvasEl.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic events have no active pointer */ } }
  });
  canvasEl.addEventListener('pointerup', ev => { pointerDown = false; FREE.btn = -1; try { canvasEl.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ } });
  canvasEl.addEventListener('wheel', ev => {
    if (camMode === 'walk') {
      // CONTRACT_V5 "Chase camera input": the wheel sets the chase orbit distance
      ev.preventDefault();
      if (gameMode) return;   // v6: the runner has no wheel input
      if (player && isFinite(ev.deltaY)) WALK.zoom += ev.deltaY;
      return;
    }
    if (camMode !== 'free') return;
    ev.preventDefault();
    if (followId) followId = null;
    camAnim = null;
    dollyFree(ev.deltaY);
  }, { passive: false });
  canvasEl.addEventListener('pointerleave', ev => { pointerDown = false; applyHoverPause(TT.state.hover, null); TT.state.hover = null; canvasEl.style.cursor = 'default'; if (TT.onHover) TT.onHover(null, ev); });
  canvasEl.addEventListener('click', ev => {
    // v12: no pointer lock on touch (requestLock also refuses while the controls are live)
    const tapped = lastPointerType === 'touch' || (ev.pointerType === 'touch');
    if (camMode === 'walk') { if (!pointerLocked && !gameMode && !tapped) requestLock(); return; }   // v6: no pointer lock in the runner
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > (tapped ? TOUCH_SLOP : CLICK_SLOP)) return;   // v12: a tap picks within 12 px
    const p = tapped ? pickNear(ev.clientX, ev.clientY) : pickAt(ev.clientX, ev.clientY);   // v12: a tap gets a finger-sized hit ring
    TT.state.selected = p;
    if (TT.onSelect) TT.onSelect(p);
    if (p) focusOn(p.kind, p.id);
  });
  canvasEl.addEventListener('dblclick', ev => {
    if (camMode === 'walk') return;
    if (!pickAt(ev.clientX, ev.clientY)) resetView();
  });
  canvasEl.addEventListener('contextmenu', ev => ev.preventDefault());
}

/* ---------- day and night ---------- */
function updateLighting(dt, time) {
  const n = clamp(TT.sim.darkness() / 0.62, 0, 1);
  nightS += (n - nightS) * (1 - Math.exp(-3 * dt));
  const s = nightS;
  // v10: the two cascades share the sun; the far light carries its share only while it casts
  const farOn = !!(sunFar && sunFar.castShadow);
  const sunI = kf(KF.sunI, s);
  kfc(sun.color, KF.sunColor, s); sun.intensity = sunI * (farOn ? SUN_SPLIT_NEAR : 1);
  if (sunFar) { sunFar.color.copy(sun.color); sunFar.intensity = farOn ? sunI * (1 - SUN_SPLIT_NEAR) : 0; sunFar.visible = farOn; }
  kfc(hemi.color, KF.hemiSky, s); kfc(hemi.groundColor, KF.hemiGround, s); hemi.intensity = kf(KF.hemiI, s);
  kfc(fill.color, KF.fillColor, s); fill.intensity = kf(KF.fillI, s);
  if (Math.abs(s - lastSkyS) > 0.01) paintSky(s);
  if (insideRoom) {
    // v5: inside a room the fog keeps the ceiling color and the outdoor lights step back so the
    // room's own point lights carry it (the shadow camera is untouched)
    fog.color.copy(insideBg);
    sun.intensity *= INSIDE_SUN; hemi.intensity *= INSIDE_HEMI; fill.intensity *= INSIDE_FILL;
    if (sunFar) sunFar.intensity *= INSIDE_SUN;
  } else kfc(fog.color, KF.skyHor, s);
  renderer.toneMappingExposure = kf(KF.exposure, s);
  if (ground) ground.update(dt, time, s);   // v10: the stripes fade and the ground's own envMapIntensity scales

  const ramp = clamp((s - 0.25) / 0.75, 0, 1);
  bulbMat.emissiveIntensity = 0.08 + 2.4 * ramp;
  poolMat.opacity = 0.35 * ramp; if (poolMesh) poolMesh.visible = ramp > 0;
  for (const pl of lampLights) { pl.intensity = 18 * ramp; pl.visible = ramp > 0; }
  if (setAlienNight) setAlienNight(s);
  if (setAnimalNight) setAnimalNight(s);
  const so = Math.max(0, s - 0.6) * 2.5;
  starsMat.opacity = so; stars.visible = so > 0;
  if (Math.abs(s - lastEnvS) > 0.005) {
    lastEnvS = s;
    const k = 1 - 0.6 * s;
    for (const e of matRegistry) e.mat.envMapIntensity = e.env * k;
  }
  if (waterMat) waterMat.opacity = 0.82 + 0.04 * Math.sin(TAU * 0.25 * time);
  if (rippleTex) { rippleTex.offset.x += 0.012 * dt; rippleTex.offset.y += 0.008 * dt; rippleTex.rotation += 0.02 * dt; }
}

/* ---------- frame ---------- */
/* ---------- camera modes ----------
   'free': the camera is a drone. Right-drag looks around from where you are, left-drag slides over the
   ground, the wheel flies forward, WASD glide, Q and E turn, R and F change height. OrbitControls stays
   attached (disabled) so focus, follow, reset, and the cinematic orbit keep using controls.target, which
   is re-derived every frame as the ground point the camera looks at.
   'orbit': the classic OrbitControls behavior around the view target. */
let camMode = 'orbit';   // v12.1: orbit is the only overview camera (Jackson: the free roam camera is not needed)
const FREE = { btn: -1, lastX: 0, lastY: 0 };
const _fwd = new THREE.Vector3(), _rgt = new THREE.Vector3();
function applyZoomLimits() {
  if (!controls) return;
  const free = camMode === 'free';
  controls.minDistance = free ? 0.5 : MIN_ZOOM * fitDistance;
  // v14: never past the far plane less the map diagonal, so zooming out cannot clip the town away (the fit caps at 500)
  controls.maxDistance = free ? 4000 : Math.min(MAX_ZOOM * fitDistance, camera.far - Math.hypot(COLS, ROWS));
}
function applyCameraMode() {
  if (!controls) return;
  const free = camMode === 'free', walk = camMode === 'walk';
  // 'walk' (CONTRACT_V4): OrbitControls disabled, the free-roam pointer handlers skipped, the player owns the camera.
  controls.enabled = !free && !walk;
  controls.enableDamping = !free && !walk;
  controls.minPolarAngle = free ? 0.15 : 0.55;
  controls.maxPolarAngle = free ? 1.5 : 1.15;
  applyZoomLimits();
  const hint = document.getElementById('cam-hint');
  if (hint) hint.textContent = touchLive
    ? (walk ? 'Joystick to move · Drag to look · Buttons on the right' : 'Drag to orbit · Pinch to zoom · Tap an agent or a building')   // v12
    : walk
      ? 'WASD move · Mouse to look · Shift run or boost · Space jump, dive or swing · E interact · H hoverboard · M map · V near or far · Wheel zoom · 1 2 3 clubs · Tab cart auto-drive · X leave golf · Esc exit'
      : free
        ? 'Drag to move · Right-drag to look around · Scroll to fly · WASD glide · Q E turn · R F height'
        : 'Drag to move · Right-drag to orbit · Scroll to zoom · WASD glide · Q E turn';
}
function setCameraMode(mode) {
  // While walking, remember the choice for when walk mode ends instead of switching under the player.
  if (camMode === 'walk') { prevCamMode = 'orbit'; return; }
  camMode = 'orbit';   // v12.1: 'free' is no longer offered; any request lands on orbit
  applyCameraMode();
  if (controls) { syncFreeTarget(); controls.update(); }
}
/* Point controls.target at the ground along the view direction (or 60 units ahead when looking up). */
function syncFreeTarget() {
  _fwd.subVectors(controls.target, camera.position);
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, -0.6, 0.8);
  _fwd.normalize();
  let d = 60;
  if (_fwd.y < -0.02) d = clamp(-camera.position.y / _fwd.y, 1, 600);
  controls.target.copy(camera.position).addScaledVector(_fwd, d);
}
function clampCameraPos() {
  const p = camera.position;
  // Generous box: the default overview camera sits far south of the map, so only stop real runaways.
  // v8: at least 1.6 above the terrain under the camera
  const nx = clamp(p.x, -60, COLS + 60), nz = clamp(p.z, -60, ROWS + 110), ny = clamp(p.y, hAt(nx, nz) + 1.6, 240);
  if (nx !== p.x || nz !== p.z || ny !== p.y) { controls.target.x += nx - p.x; controls.target.z += nz - p.z; controls.target.y += ny - p.y; p.set(nx, ny, nz); }
}
/* Rotate the view about the camera's own position (free mode look). */
function lookFree(dx, dy) {
  _fwd.subVectors(controls.target, camera.position).normalize();
  let yaw = Math.atan2(_fwd.x, _fwd.z), pitch = Math.asin(clamp(_fwd.y, -1, 1));
  yaw -= dx * 0.0042;
  pitch = clamp(pitch - dy * 0.0032, -1.45, -0.06);
  const cp = Math.cos(pitch);
  _fwd.set(cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw));
  controls.target.copy(camera.position).addScaledVector(_fwd, 10);
  syncFreeTarget();
}
/* Slide the camera over the ground so the map follows the cursor (free mode pan). */
function panFree(dx, dy) {
  _fwd.subVectors(controls.target, camera.position); _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) return;
  _fwd.normalize();
  _rgt.crossVectors(_fwd, UP).normalize();
  const k = 2 * camera.position.y * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, viewH);
  _v.set(0, 0, 0).addScaledVector(_rgt, dx * k).addScaledVector(_fwd, dy * k * 1.5);
  camera.position.add(_v); controls.target.add(_v);
  clampCameraPos();
}
/* Fly forward or back along the view direction (free mode wheel). */
function dollyFree(deltaY) {
  _fwd.subVectors(controls.target, camera.position).normalize();
  const step = -Math.sign(deltaY) * Math.min(Math.abs(deltaY), 120) * 0.02 * Math.max(2.5, camera.position.y * 0.14);
  camera.position.addScaledVector(_fwd, step);
  const floor = hAt(camera.position.x, camera.position.z) + 1.6;
  if (camera.position.y < floor) camera.position.y = floor;
  clampCameraPos();
  syncFreeTarget();
}

/* ---------- keyboard camera ---------- */
const keyState = Object.create(null);
let keysBound = false;
function typingInField() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
const UI_MODAL_IDS = ['modal', 'walk-modal', 'leaderboard-modal'];
function uiModalOpen() {
  if (typeof document.getElementById !== 'function') return false;
  for (let i = 0; i < UI_MODAL_IDS.length; i++) {
    const el = document.getElementById(UI_MODAL_IDS[i]);
    if (el && el.classList && el.classList.contains('open')) return true;
  }
  return false;
}
function bindKeys() {
  if (keysBound) return; keysBound = true;
  // v8: ui.js toggles walk mode on Tab (a document listener). While a cart exists, Tab is the cart's
  // auto-drive edge instead, so it is taken in the capture phase before ui.js sees it.
  window.addEventListener('keydown', ev => {
    // v11: Esc closes the shop here, before ui.js's document listener and the bubble listener
    // below see it, so the same press never also exits walk mode or quits the runner
    if (ev.key === 'Escape' && shopOpen()) {
      try { shop.close(); } catch (e) { /* the modal is already gone */ }
      ev.preventDefault();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation(); else ev.stopPropagation();
      return;
    }
    // v14: and the plaque note
    if (ev.key === 'Escape' && plaqueOpen()) {
      statue.close();
      ev.preventDefault();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation(); else ev.stopPropagation();
      return;
    }
    // v13: Esc closes the open town map the same way (ui.js and the walk keys never see the press)
    if (ev.key === 'Escape' && mapOpenNow()) {
      closeMap();
      ev.preventDefault();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation(); else ev.stopPropagation();
      return;
    }
    if (ev.key !== 'Tab' || camMode !== 'walk' || gameMode || subwayPhase || !player || !player.cart) return;
    if (typingInField() || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (!ev.repeat) WALK.drive = true;
    ev.preventDefault();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation(); else ev.stopPropagation();
  }, true);
  window.addEventListener('keydown', ev => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    // v14: the plaque note owns the keys wherever the focus sits (a header select reached with Tab included); E or Enter closes it
    if (plaqueOpen()) { clearWalkKeys(); if ((k === 'e' || k === 'Enter') && !ev.repeat) { statue.close(); ev.preventDefault(); } return; }
    if (typingInField()) return;
    // v11: the shop modal owns the keys wherever it opened from (the kiosk, the header, the
    // runner card); Esc closed it in the capture listener above, nothing else reaches the game
    if (shopOpen()) { clearSubKeys(); clearWalkKeys(); return; }
    // v14: the page's own modals (add agent, the picker, the leaderboard) own the keys too; ui.js closes them on Esc
    if (uiModalOpen()) { clearWalkKeys(); return; }
    // v13: the open town map owns the keys: G goes, M closes, the walk keys stay muted
    if (mapOpenNow()) {
      clearWalkKeys();
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (k === 'g' && !ev.repeat) { goRoute(); ev.preventDefault(); return; }
      if (k === 'm' && !ev.repeat) { closeMap(); mHoldAt = -1; mHoldOpened = true; ev.preventDefault(); return; }
      return;
    }
    // v6: the runner owns the keys in game mode (Ctrl is the duck key there, so the modifier guard comes after)
    if (gameMode === 'subway') { if (subwayKey(k, ev, true)) ev.preventDefault(); return; }
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (camMode === 'walk') {
      // Walk mode keys (CONTRACT_V4 "Input"): movement held, Space E V as edges, Esc releases the
      // pointer lock first and exits walk mode when the pointer is already free.
      if (shopOpen()) { clearWalkKeys(); return; }   // v11: the shop modal owns the keys (ui.js closes it on Esc)
      WALK.run = ev.shiftKey;
      if (subwayPhase) { ev.preventDefault(); return; }   // v6: nothing moves while the overlay fades around the scene switch
      if (k === 'Escape') { if (pointerLocked) releaseLock(); else setWalkMode(false); return; }
      // v11: H summons or dismisses the hoverboard; M toggles the corner minimap (on the key up, v13:
      // held M_HOLD it opens the town map instead, and Shift+M opens it at once)
      if (k === 'h') { if (!ev.repeat) WALK.hover = true; ev.preventDefault(); return; }
      if (k === 'm') {
        if (!ev.repeat) {
          if (ev.shiftKey) { openMap(); mHoldAt = -1; mHoldOpened = true; }
          else { mHoldAt = nowMs(); mHoldOpened = false; }
        }
        ev.preventDefault(); return;
      }
      if (k in WALK_KEY_MAP) { WALK[WALK_KEY_MAP[k]] = true; ev.preventDefault(); return; }
      // Space: the jump or dive edge plus the held state for the golf charge (CONTRACT_V5 "Golf controller")
      if (k === ' ') { if (!ev.repeat) WALK.jump = true; WALK.jumpHeld = true; ev.preventDefault(); return; }
      if (k === 'e') { if (!ev.repeat) WALK.interact = true; ev.preventDefault(); return; }
      if (k === 'v') { if (!ev.repeat) WALK.view = true; ev.preventDefault(); return; }
      // v8: Tab auto-drives the cart (to the ball, the next tee or the clubhouse); never leaves the canvas
      if (k === 'Tab') { if (!ev.repeat) WALK.drive = true; ev.preventDefault(); return; }
      // golf: 1 2 3 pick the club, X leaves
      if (k === '1') { if (!ev.repeat) WALK.club1 = true; ev.preventDefault(); return; }
      if (k === '2') { if (!ev.repeat) WALK.club2 = true; ev.preventDefault(); return; }
      if (k === '3') { if (!ev.repeat) WALK.club3 = true; ev.preventDefault(); return; }
      if (k === 'x') { if (!ev.repeat) WALK.quit = true; ev.preventDefault(); return; }
      return;
    }
    keyState.fast = ev.shiftKey;
    if (k in KEY_MAP) { keyState[KEY_MAP[k]] = true; ev.preventDefault(); }
  });
  window.addEventListener('keyup', ev => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    keyState.fast = ev.shiftKey;
    WALK.run = ev.shiftKey;
    if (k === ' ') WALK.jumpHeld = false;
    if (k in KEY_MAP) keyState[KEY_MAP[k]] = false;
    if (k in WALK_KEY_MAP) WALK[WALK_KEY_MAP[k]] = false;
    // v13: a short M press toggles the corner minimap; a hold that opened the map (or a Shift+M) does not
    if (k === 'm') {
      if (mHoldAt >= 0 && !mHoldOpened && nowMs() - mHoldAt < M_HOLD * 1000) { if (camMode === 'walk' && !mapOpenNow() && !shopOpen() && minimap && !typingInField()) minimap.toggle(); }
      mHoldAt = -1; mHoldOpened = false;
    }
    subwayKey(k, ev, false);   // v6: releases the held duck
  });
  window.addEventListener('blur', () => { for (const k in keyState) keyState[k] = false; clearWalkKeys(); clearSubKeys(); });
}
const KEY_MAP = { w: 'fwd', ArrowUp: 'fwd', s: 'back', ArrowDown: 'back', a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right', q: 'rotL', e: 'rotR', r: 'up', f: 'down' };
const _kFwd = new THREE.Vector3(), _kRight = new THREE.Vector3();
function stepKeys(dt) {
  const fwd = (keyState.fwd ? 1 : 0) - (keyState.back ? 1 : 0);
  const side = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
  const rot = (keyState.rotR ? 1 : 0) - (keyState.rotL ? 1 : 0);
  const lift = (keyState.up ? 1 : 0) - (keyState.down ? 1 : 0);
  if (!fwd && !side && !rot && !lift) return;
  const boost = keyState.fast ? 2.6 : 1;
  // Any manual move ends follow mode and a running focus animation, like dragging does.
  if (followId) followId = null;
  camAnim = null;
  const dist = camera.position.distanceTo(controls.target);
  if (fwd || side) {
    _kFwd.subVectors(controls.target, camera.position); _kFwd.y = 0; _kFwd.normalize();
    _kRight.crossVectors(_kFwd, UP).normalize();
    const speed = Math.max(4, dist * 0.25) * dt * boost;
    _v.set(0, 0, 0).addScaledVector(_kFwd, fwd * speed).addScaledVector(_kRight, side * speed);
    controls.target.add(_v); camera.position.add(_v);
  }
  if (lift && camMode === 'free') {
    const dy = lift * Math.max(2, camera.position.y * 0.3) * dt * boost;
    camera.position.y += dy; controls.target.y += dy;
    clampCameraPos();
  }
  if (rot) {
    const ang = rot * 1.1 * dt;
    if (camMode === 'free') {
      // turn in place: rotate the view direction about the camera's own position
      _fwd.subVectors(controls.target, camera.position);
      const c = Math.cos(ang), s = Math.sin(ang);
      const x = _fwd.x * c - _fwd.z * s, z = _fwd.x * s + _fwd.z * c;
      _fwd.x = x; _fwd.z = z;
      controls.target.copy(camera.position).add(_fwd);
    } else {
      _v.subVectors(camera.position, controls.target);
      const c = Math.cos(ang), s = Math.sin(ang);
      const x = _v.x * c - _v.z * s, z = _v.x * s + _v.z * c;
      _v.x = x; _v.z = z;
      camera.position.copy(controls.target).add(_v);
      camera.lookAt(controls.target);
    }
  }
}

function stepWorld(dt) {
  const walk = camMode === 'walk';
  const time = TT.state.time;
  frameNo++;
  if (walk) {
    // CONTRACT_V4: the player steps first and places the camera; controls.update is skipped.
    // v6: in game mode the runner steps instead and the town only simulates underneath.
    stepSubwayFade(time);
    if (gameMode === 'subway') { stepSubway(dt, time); syncCart(dt); }
    else syncPlayer(dt, time);
  } else {
    syncCart(dt);   // v8: hides the cart once walk mode is off
    stepKeys(dt);
    stepCamera(dt);
    if (camMode === 'free') { clampCameraPos(); syncFreeTarget(); }
    controls.update();
    clampTarget();
    if (cinematic && !camAnim && !followId) {
      const d = camera.position.distanceTo(controls.target), want = 0.85 * fitDistance;
      const nd = d + (want - d) * (1 - Math.exp(-dt * 1.6));
      _v.subVectors(camera.position, controls.target).setLength(nd);
      camera.position.copy(controls.target).add(_v);
    }
  }
  camera.updateMatrixWorld();
  applyFog();
  updateShadows(false);   // v10: the near cascade follows the view focus
  updateLighting(dt, time);
  updateBuildings(dt, time);
  updateFountain(time);
  if (leisure) leisure.update(dt, time, nightS);
  if (city) city.update(dt, time, nightS);   // v7: traffic lights, flags, bulbs
  if (roads) roads.update(dt, time, nightS);   // v10: the markings glow a little at night
  if (nature) nature.update(dt, time);         // v10: the canopy, tuft and reed sway
  if (statue) statue.update(dt, time, nightS); // v14: the halo turns, the gold glows at night
  syncAgents(dt, time);
  syncScooters(dt);   // v9: after the agents, so ridden scooters sit under this frame's riders
  syncBoats(dt);      // v11: the moored and beached boats in every camera mode (the ridden one was synced with the player)
  updateActivities(dt, time);
  // v5: only the active room is lit (and visible once the others have gone dark); golf animates
  // the flags, the ball meshes and their trails
  if (interiors) interiors.update(dt, time, insideRoom ? insideRoom.id : null);
  if (golf) golf.update(dt, time);
  updateBirds(dt, time);
  if (hiRing) hiRing.update(dt, time);
  updateOverlays();
  stepMHold();           // v13: M held opens the town map
  updateMinimap(time);   // v11: after the player and the prompt target of this frame; v13: the route and the HUD line
  if (touch) syncTouchMode();   // v12: the layer's buttons follow the player state
}
/* v6: in game mode the runner's own scene and camera replace the town. */
function renderFrame() {
  if (gameMode === 'subway' && subway) renderer.render(subway.scene, subway.camera);
  else renderer.render(scene, camera);
}
function frame(ts) {
  rafId = requestAnimationFrame(frame);
  const dt = lastTs ? clamp((ts - lastTs) / 1000, 0.001, 0.05) : 1 / 60;
  lastTs = ts;
  TT.sim.tick(dt);
  stepWorld(dt);
  renderFrame();
}

/* ---------- avatars (independent of the main scene) ---------- */
let avatarR = null, avatarScene = null, avatarCam = null, avatarMount = null;
function ensureAvatarRenderer() {
  if (avatarR) return;
  avatarR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  avatarR.setPixelRatio(1); avatarR.setSize(96, 120, false);
  avatarR.outputColorSpace = THREE.SRGBColorSpace;
  avatarR.toneMapping = THREE.ACESFilmicToneMapping; avatarR.toneMappingExposure = 1.05;
  avatarR.setClearColor(0x000000, 0);
  if (makeAlienPortraitScene) {
    try {
      const p = makeAlienPortraitScene();
      if (p && p.isScene) avatarScene = p;
      else if (p && p.scene) { avatarScene = p.scene; avatarCam = p.camera || null; avatarMount = p.mount || p.holder || p.anchor || null; }
    } catch (e) { avatarScene = null; }
  }
  if (!avatarScene) {
    // CONTRACT: fallback portrait scene per the art bible when aliens3d does not provide one.
    avatarScene = new THREE.Scene();
    avatarScene.add(new THREE.HemisphereLight('#FFFFFF', '#C9D4DC', 1.2));
    const dl = new THREE.DirectionalLight('#FFF4E0', 1.9); dl.position.set(1, 1.8, 2); avatarScene.add(dl);
  }
  if (!avatarCam) {
    avatarCam = new THREE.PerspectiveCamera(30, 96 / 120, 0.1, 50);
    avatarCam.position.set(0, 0.62, 2.3); avatarCam.lookAt(0, 0.55, 0);
  }
  avatarCam.aspect = 96 / 120; avatarCam.updateProjectionMatrix();
}
/* Renders one portrait of the department's character kind. The portrait scene frames an alien
   0.9 tall; animals supply handle.portraitScale (default 1) so tall species still fit the frame. */
function renderPortrait(seed, dept, name) {
  ensureAvatarRenderer();
  const ch = makeCharacter(dept, seed, name);
  const h = ch.handle;
  h.group.rotation.y = 0.25;
  const ps = (typeof h.portraitScale === 'number' && isFinite(h.portraitScale) && h.portraitScale > 0) ? h.portraitScale : 1;
  h.group.scale.setScalar(ps);
  const parent = avatarMount || avatarScene;
  parent.add(h.group);
  avatarR.render(avatarScene, avatarCam);
  let url = '';
  try { url = avatarR.domElement.toDataURL('image/png'); } catch (e) { url = ''; }
  parent.remove(h.group);
  ch.dispose(h);
  return url;
}
function deptFor(id) {
  return (TT.deptById && TT.deptById[id]) || TT.DEPARTMENTS.find(d => d.id === id) || TT.DEPARTMENTS[0];
}

/* The player is created once the world exists (CONTRACT_V4): js/player.js gets the sim, the state and
   accessors for the building records and agent handles; the renderer keeps the handle and the HUD. */
function createPlayerObject() {
  if (player || typeof createPlayer !== 'function') return;
  try {
    player = createPlayer({
      THREE, TT, sim: TT.sim, state: TT.state, deptById: TT.deptById,
      getRecs: () => buildingRecs,
      getAgentHandle: id => (agentRecs.get(id) || {}).handle || null,
      log: TT.log,
      // v5: the rooms for the door zones and the room collision, the golf physics and the built course
      getRooms: () => (interiors ? interiors.rooms : null),
      getInteriors: () => interiors,
      golf: { strike: GOLF.strike, stepBall: GOLF.stepBall, lieAt: GOLF.lieAt, CLUBS: GOLF.CLUBS },
      getGolf: () => golf,
      // v8: the terrain for the cart's height and slope force, the cart model module as the optional controller
      // v9: the same module carries createScooterController, the visitor's scooter riding model
      terrain: terrain || flatTerrain,
      vehicles: VEHICLES,
      // v11: the wallet (the hoverboard is owned through it), the water level per body (the creek
      // and the channel included) and whether the runner owns the visitor
      getWallet: () => wallet,
      waterLevelAt,
      inSubway: () => gameMode === 'subway' || !!subwayPhase,
    });
    TT.player = player;
  } catch (e) { console.error('Thread Town: the player failed to build; walk mode is unavailable', e); player = null; }
}

/* ---------- init ---------- */
function init(host) {
  if (renderer) return;
  container = host;
  if (TT.sim && typeof TT.sim.init === 'function' && (!TT.state || !TT.state.buildings || !TT.state.buildings.length)) TT.sim.init();
  TT.deptStats = TT.sim.deptStats; TT.darkness = TT.sim.darkness;
  // v8: the terrain right after the sim, before anything is placed
  buildTerrainField();
  // v11: the wallet and the shop before the world (the player, the runner and ui.js read them)
  buildWalletAndShop();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;   // v10: exposure 1.0 by day
  maxAniso = renderer.capabilities.getMaxAnisotropy();
  canvasEl = renderer.domElement;
  // css/style.css owns the stacking order inside #stage-host (canvas 1, #overlay 3, #ticker and #insp-card 6, #tip 7); no inline z-index here.
  canvasEl.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;border-radius:10px;';
  overlay = document.createElement('div'); overlay.id = 'overlay';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  container.insertBefore(overlay, container.firstChild);
  container.insertBefore(canvasEl, overlay);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 1, 800);
  fitCam = new THREE.PerspectiveCamera(28, 1, 1, 800);
  const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
  viewW = w; viewH = h;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fitDistance = computeFit(camera.aspect, FIT_TARGET);
  camera.position.copy(FIT_TARGET).addScaledVector(DEFAULT_DIR, fitDistance);
  camera.lookAt(FIT_TARGET);

  controls = new OrbitControls(camera, canvasEl);
  controls.target.copy(FIT_TARGET);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.8; controls.panSpeed = 0.7;
  controls.screenSpacePanning = false;
  // CONTRACT: the zoom floor is 0.3x the fit distance (v1 said 0.6x) so focusOn can reach 0.32x for agents.
  applyZoomLimits();
  controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.15;
  // City-builder feel: left-drag pans across the town, right-drag rotates, the wheel zooms toward the cursor.
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  // v12 (CONTRACT_V12 "Wiring"): a coarse pointer device (a phone) starts in orbit mode, one finger
  // orbits and a pinch zooms; the free camera stays available from the header. A touchscreen laptop
  // keeps the v11 camera and only takes the touch mapping while the controls are live (applyControlsTouches).
  if (touchCoarse) camMode = 'orbit';
  applyControlsTouches();
  controls.zoomToCursor = true;
  controls.panSpeed = 1.0;
  controls.autoRotateSpeed = 0.35;
  controls.update();
  bindKeys();
  applyCameraMode();

  buildMaterials();
  // v10: the stored quality mode decides the shadow maps the lights start with; v12: Phone by default on touch
  installQualityControl();
  applyPixelRatio();
  buildLights();
  nightS = clamp(TT.sim.darkness() / 0.62, 0, 1);
  paintSky(nightS);
  buildGround();
  buildWater();
  // v10: the road ribbons, curbs, markings, crosswalks and bridges before anything stands on them
  buildRoadMeshes();
  buildBuildings();
  buildAoDecals();
  buildLamps();
  buildDecos();
  buildLeisureProps();
  // v7: the city dressing after the world (filler buildings, street furniture, racks; v9: no cars; v10: no bridges or rocks)
  buildCityDressing();
  // v10: forests, rocks, tufts and reeds once every lot, rack and seat is known
  buildNatureLayer();
  // v5: rooms and the golf park after the world, before the player (its ctx reads them lazily)
  buildInteriorRooms();
  buildGolfCourse();
  buildFlagShadows();
  buildBirds();
  // v6: the leaderboard, the subway entrance and the two scoreboard signs (the game itself is built on the first entry)
  buildLeaderboard();
  buildSubwayEntrance();
  buildScoreboards();
  createPlayerObject();
  ensureHighlightRing();
  buildMinimap();   // v11: the corner map on the #minimap slot
  updateShadows(true);
  // portraits for the room walls may be rendered on demand once the first frames are out
  setTimeout(() => { avatarsOk = true; growClock = 0.5; }, 1500);

  resize();
  renderer.setSize(w, h, false);
  new ResizeObserver(() => resize()).observe(container);
  buildTouchLayer();   // v12: the touch controls on a mount over the view (touch devices only)
  bindPointer();

  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('600 150px Kanit'), document.fonts.load('500 84px Inter')])
      .then(() => { fontsReady = true; }, () => { fontsReady = true; });
  } else fontsReady = true;

  lastTs = 0;
  rafId = requestAnimationFrame(frame);
}

/* ---------- public API ---------- */
TT.town = {
  init,
  tick(seconds) {
    const step = 1 / 30;
    let acc = 0;
    while (acc < seconds - 1e-9) { TT.sim.tick(step); if (renderer) stepWorld(step); acc += step; }
    if (renderer) renderFrame();
  },
  agents() { return TT.state.agents; },
  events() { return TT.state.events; },
  get settings() { return TT.state.settings; },
  select(p) { TT.state.selected = p; },
  startJob(agent, opts) { return TT.sim.startJob(agent, opts); },
  runNow(id) { return TT.sim.runNow(id); },
  addAgent(spec, opts) { return TT.sim.addAgent(spec, opts); },
  removeAgent(id) {
    const rec = agentRecs.get(id);
    if (rec) removeAgentRec(rec);
    if (followId === id) followId = null;
    return TT.sim.removeAgent(id);
  },
  avatar(agent) {
    if (!agent) return '';
    if (agent.avatarURL) return agent.avatarURL;
    const dept = agent.dept || deptFor(agent.spec && agent.spec.dept);
    agent.avatarURL = renderPortrait(agent.spec.name + '|' + agent.spec.role, dept, agent.spec.name);
    return agent.avatarURL;
  },
  /* Called by the add-agent form as the department changes; Risk shows an animal preview (CONTRACT_V3). */
  previewAvatar(name, role, deptId) {
    const dept = deptFor(deptId);
    return renderPortrait((name || '') + '|' + (role || ''), dept, name || '');
  },
  setCinematic(on) {
    // Board mode exits walk mode first (CONTRACT_V4).
    if (on && walkOn) setWalkMode(false);
    cinematic = !!on;
    if (controls) controls.autoRotate = cinematic && !camAnim;
  },
  setCameraMode(mode) { setCameraMode(mode); },
  cameraMode() { return camMode; },
  /* Walk mode (CONTRACT_V4 "Renderer integration") */
  setWalkMode(on, spec) { return setWalkMode(on, spec); },
  walkMode() { return walkOn; },
  /* Headless input for tests: { fwd, side, run, jump, jumpHeld, interact, lookDX, lookDY, toggleView, zoom, club1, club2, club3, quit, hover, boost, map };
     edges (jump, interact, toggleView, club1 2 3, quit, hover, map) and deltas (lookDX, lookDY, zoom) are consumed after one frame. */
  setWalkInput(input) { extInput = input && typeof input === 'object' ? Object.assign({}, input) : null; },
  get player() { return player; },
  /* v6 (CONTRACT_V6 "Renderer integration"): 'subway' while the runner owns the view, else null. */
  gameMode() { return gameMode; },
  /* Headless runner input for tests: { left, right, jump, duck, restart, quit, hover }; edges are consumed after one frame, duck is held. */
  setSubwayInput(input) { subExt = input && typeof input === 'object' ? Object.assign({}, input) : null; },
  /* v11: the wallet, the shop and the minimap, and the shop opened from the town (the kiosk's path). */
  get wallet() { return wallet; },
  get shop() { return shop; },
  get minimap() { return minimap; },
  openShop(context) { return openShopFrom(context || 'kiosk'); },
  /* v13 (CONTRACT_V13 "Waypoints and directions"): the town map, the waypoint, the route and Go. */
  openMap() { return openMap(); },
  closeMap() { return closeMap(); },
  mapOpen() { return mapOpenNow(); },
  plaqueOpen() { return plaqueOpen(); },   // v14
  get statue() { return statue; },
  setWaypoint(x, z) { return setWaypoint(x, z); },
  get waypoint() { return WP.set ? { x: WP.x, z: WP.z } : null; },
  get route() { const out = new Array(routeOk ? routeN : 0); for (let i = 0; i < out.length; i++) out[i] = { x: ROUTE_PTS[i].x, z: ROUTE_PTS[i].z }; return out; },
  go() { return goRoute(); },
  waypointHudId: WP_HUD_ID,
  waterLevelAt(x, z) { return waterLevelAt(x, z); },
  /* Camera (CONTRACT_V2 "Camera") */
  focusOn(kind, id) { return focusOn(kind, id); },
  follow(id) { return follow(id); },
  resetView() { resetView(); },
  isDefaultView() { return isDefaultView(); },
  /* The id being followed, or null (extra, for the UI's Follow button label). */
  get following() { return followId; },
  resize,
  /* v8: the terrain record (heightAt, slopeAt, normalAt, lotHeight) once the world is built. */
  get terrain() { return terrain; },
  /* v10 (CONTRACT_V10 "Performance budget"): the quality mode, 'high', 'balanced' or (v12) 'phone'. */
  setQuality(mode) { return setQuality(mode); },
  quality() { return quality; },
  /* v12 (CONTRACT_V12): the touch detection, whether the controls are live, and the layer itself. */
  isTouch() { return isTouch; },
  touchActive() { return touchLive; },
  get touch() { return touch; },
  /* Debug handle for tuning from the console. Not part of the contract. */
  get _debug() { return { camera, controls, renderer, scene, fitDistance, mergeStats, container, buildingRecs, agentRecs, leisure, camAnim, followId, player, playerRec, walkOn, camMode, pointerLocked, interiors, golf, insideRoom, camKey, subway, gameMode, subwayPhase, leaderboard, scoreboards, subwayGroup, city, terrain, cart: cartRec, drawables: countDrawables, scooters: scooterRecs, scooterCounts, ground, roads, nature, hiRing, waterBodies, sun, sunFar, aoGroup, birds, quality, flagShadowMesh,
    // v11
    wallet, shop, minimap, minimapMount, hoverRec, boatRecs, boatCounts, waterwayIdx, chaserChs, promptTarget: _pt, mmView, kioskPrompt: KIOSK_PROMPT, runnerState: rState,
    // v12
    isTouch, touchLive, touchCoarse, touch, touchMount, touchIn: TOUCH_IN, touchKey, rippleMesh, natureCounts: natureInstanceCounts, natureFull, fog, walkInput, subInput, lastPointerType,
    // v13
    waypoint: WP, routePts: ROUTE_PTS, routeOut: ROUTE_OUT, routeN, routeOk, routeAt, routeBoat, routeToPin, routeEnd: { x: routeEndX, z: routeEndZ }, routeTile: { x: routeTileX, z: routeTileZ }, mapOpen: mapOpenNow(), wpEl, wpState, wpHudId: WP_HUD_ID, mHoldAt, mHoldOpened }; },
};
if (TT.sim) { TT.deptStats = TT.sim.deptStats; TT.darkness = TT.sim.darkness; }
if (typeof TT._readyResolve === 'function') TT._readyResolve();
