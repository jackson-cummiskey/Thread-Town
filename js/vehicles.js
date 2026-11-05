/* Thread Town vehicles (docs/CONTRACT_V8.md "Cart", docs/TERRAIN_DESIGN.md "Cart driving feel",
   docs/CONTRACT_V9.md "Rendering" and "The visitor riding").
   The golf cart model and the kick scooter (model, animation and a pure riding controller). The
   cart's driving model lives in js/player.js (stepCart, the contract's "Driving model in
   player.js"); this module only draws and animates the cart.

   makeCart(ctx) -> { group, parts: { wheels, seat, seats, bag, bags, headlights, taillights, roof, chassis }, animate(cart, speed, steer, dt) }
     ctx = { color? } (body color, default the brand white). The group is built in local space with
     the cart facing local +z, so the game's yaw (direction (sin yaw, cos yaw)) goes straight into
     group.rotation.y. The ground is y = 0 at the wheel contact; the caller sets group.position to
     (x, heightAt(x, z), z) and tilts the group with the terrain normal. The chassis child carries the
     body lean into turns; the wheels stay on the ground.
     animate's steer is the steer angle in radians with the sign player.js stores in cart.steer:
     positive toward local +x (the left side, since right of play is (-u.y, u.x)), and the heading
     yaw grows with it (yaw += v / wheelbase * tan(steer) * dt). A positive steer therefore turns
     the front wheels toward +x and rolls the body top toward +x, into the turn. render3d.syncCart
     passes player.cart.steer straight in.
   setNight(cart, n) drives the headlight and taillight emissive with the night ramp n in 0..1.
   CART holds the model's numbers (seat, wheel radius, wheelbase, lean) next to the contract's
     driving numbers for reference; player.js keeps its own copies for stepCart.

   Scooter (version 9):
   makeScooter(ctx) -> { group, lean, steerGroup, parts: { lean, deck, stripe, stem, handlebar, bell,
       wheels: [front, rear], kickstand }, wheelAngle, leanAngle, leanZ, animate(scooter, speed, steer, dt) }
     ctx = { color? } (frame and stem color, default Thread navy; the deck stripe is always Thread
     aqua). Built in local space facing +z with the wheel contact at y = 0, like the cart, so the
     game's yaw goes straight into group.rotation.y. The lean child rolls about the ground line
     (everything but the root leans); steerGroup turns the stem, the handlebars, the bell and the
     front wheel about the raked steering axis. parts.kickstand is visible by default; the renderer
     hides it while a scooter is ridden. Geometries are shared by every scooter, materials come from
     the depts/common mat() cache, so a pool of about 30 costs no extra uploads.
   animateScooter(scooter, speed, steer, dt): wheel spin (speed / WHEEL_R), stem steer (rotation.y
     = steer, clamped to STEER_VIS), and a lean of up to LEAN_MAX (0.22 rad) with steer times speed,
     eased at LEAN_RATE. steer uses the cart's sign (positive toward local +x, the yaw grows with it),
     and the lean rolls the top toward +x on a positive steer, into the turn. scooter.leanZ is the
     roll the renderer copies to the rider's handle.leanZ. Allocation free.
   createScooterController(opts) -> { drives: true, radius, numbers, step(s, input, dt), maxSpeedAt(x, z), fits(x, z) }
     The riding model, pure and allocation free per step, the same shape as the cart hook player.js
     reads (ctx.vehicles.createCartController). opts (or opts.env) may give:
       maxSpeedAt(x, z)  the max speed by the lie under the center (preferred; 0 blocks)
       at(tx, ty), TILES the sim grid, used for the default lie table (scooterSpeedForTile)
       fits(x, z)        the full collision test; default: the four corner points at radius 0.32
                         each on a tile whose max speed is above 0
       radius            default 0.32
     With none of them every point is open at 7.5.
     s is the riding record { x, z, yaw, speed, steer } (world x and z, yaw with heading
     (sin yaw, cos yaw), speed >= 0, steer the steer angle in radians with the cart sign). step adds
     s.bumped (true when this step hit something) and s.maxSpeed (the lie max under the center).
     input = { throttle 0..1, brake 0..1, steer -1..1 (positive toward local +x, the sign of the
     stored steer; player.js negates its right positive A and D input as it does for the cart),
     turn? (an in place yaw rate under 1 u/s), maxSpeed? (an extra cap), gradX?, gradZ?,
     boost? (a throttle response multiplier for this step; when absent the controller runs its
     own launch window) }.
     v10 feel (docs/CONTRACT_V10.md "Scooter feel"): acceleration 12 with a launch boost (times
     1.5 for 0.3 s once the throttle opens from under 0.5 u/s, re-armed when it is released),
     braking 16, friction 3, no reverse (S only brakes), bicycle steering on a 1.0 base
     (SCOOTER.STEER_BASE, the riding feel; the drawn wheelbase is SCOOTER.WHEELBASE) with the
     steer angle 0.9 rad at low speed falling to 0.45 at full speed (STEER_HIGH_CUT 0.5), eased in
     at 6 rad/s and back at 8, a slow pivot under 0.6 u/s so a stopped rider can turn, four point
     collision that slides along walls and scrubs the speed by what was lost.
     opts may override every number by name (js/player.js hands its SCOOTER_FEEL record this way,
     so the controller and its built in fallback ride alike): accel, brake, friction, topSpeed,
     grassSpeed, sandSpeed, launchBoost, launchLen, launchSpeed, steerMax, steerMin (or
     steerHighCut), steerRate, centerRate, steerBase (or wheelbase), pivotSpeed, pivotRate,
     slopeK; a missing or non finite field falls back to the SCOOTER table.
   scooterSpeedForTile(v, TILES): 7.5 on paths, sidewalks, crosswalks, plaza, parking and bridges,
     5.5 on grass, flowers, fairway and tees, 2 on sand, 0 on water, greens, buildings, trees, the
     fountain and off the map.
   SCOOTER holds the scooter numbers, plus the rider anchors in the scooter frame: SCOOTER.FEET
     { y: 0.12 deck height, front, back } (z of each foot, on the back half of the deck) and
     SCOOTER.BAR { y, z, halfWidth } (the grips, about 0.69 up and 0.45 ahead of the rider).
   The step path is allocation free with the default tile test: only small integers cross a call
   there (V8 boxes doubles handed to a call it does not inline); env callbacks given as maxSpeedAt
   or fits receive doubles and must not throw.

   Version 11 (docs/CONTRACT_V11.md "The hoverboard", "Boats"):
   makeHoverboard(ctx) -> { group, lean, parts: { lean, body, deck, tape, stripe, fins, nose, glowPlane,
       pods, sideLights, glowMat }, time, leanZ, pitch, dip, animate(board, speed, steer, airborne, dt) }
     ctx = { color? (the deck, default Thread navy; the shop's board colours go here), glow? (the
     underglow, default Thread aqua) }. Local +z forward, the deck's underside at y = 0: the caller
     puts group.position at (x, s.y, z) where s.y is the controller's hover height (the surface
     plus HOVER.HEIGHT) and sets group.rotation.y = s.yaw. The lean child carries the roll, the
     pitch and the landing dip. HOVER.FEET { y, front, back } are the rider's foot anchors (pose
     'hover': knees bent, arms out), like SCOOTER.FEET.
   animateHoverboard(board, speed, steer, airborne, dt): steer is the roll to ease toward in radians
     (the controller's s.lean, the scooter sign: positive steer rolls the top toward +x), clamped to
     HOVER.LEAN_MAX; the nose lifts with speed and more in the air; the underglow pulses and
     brightens with speed and airtime; board.dip (the renderer copies s.dip) sinks the deck after
     a landing and eases out. board.leanZ and board.pitch are what the rider's handle copies.
     Allocation free.
   createHoverController(opts) -> { drives: true, hovers: true, radius, numbers, step(s, input, dt), fits(x, z, y), surfaceAt(x, z), maxSpeedAt(x, z) }
     The riding model, pure and allocation free per step with the default tile test. opts (or
     opts.env) may give:
       surfaceAt(x, z)   the surface the board hovers over: the higher of the terrain and the water
                         (preferred; heightAt(x, z) is accepted as the same thing); absent: 0
       openAt(x, z, y)   true when a corner point may be there (buildings, trees, lot edges and the
                         map edge closed; y is the board height so a caller can open tree tops)
       at(tx, ty), TILES the sim grid for the default rule: every tile is open except B, T, FT
                         and off the map (water is open: the board rides it)
       fits(x, z, y)     the full four point test instead of the corner rule
       maxSpeedAt(x, z)  an extra cap by position (0 does not block, it only stops the thrust)
       cols, rows        the map size when at is absent (the map edge)
       radius            default 0.35
     and may override every number by name (height, topSpeed, boostSpeed, boostLen, boostRecharge,
     boostAccel, accel, brake, friction, gravity, lift, glide, maxFall, followRate, launchVy,
     softDrop, bounceK, bounceMax, landScrub, yawLow, yawHigh, gripLow, gripHigh, driftMax,
     airYaw, leanMax, leanK, leanRate, pivotSpeed); a missing or non finite field falls back to
     HOVER.
     s is the riding record { x, z, y, yaw, dir, speed, vy, airborne, ... } (world x and z, y the
     board's underside height, yaw the board's heading, dir the velocity heading which lags the yaw
     in a drift, speed >= 0 along dir, vy the vertical speed). step fills in: bumped (hit a wall
     this step), launched (left the ground this step), landed (touched down this step), bounce (the
     hard landing bounce this step), drop (the last landing's height), airTime, apex, boosting,
     boostLeft (s left in the current boost), boostCd (s until the boost is ready), boostCharge
     (0..1 for a HUD), drift (yaw - dir), lean (the roll in radians, the scooter sign), steer (the
     eased steer input), dip (the landing dip, eased out), maxSpeed, surface (the surface height
     under the center).
     input = { throttle 0..1, brake 0..1, steer -1..1 (positive toward local +x, the sign of the
     scooter's steer; player.js negates its right positive A and D input), boost (truthy while
     Shift is held; a fresh press starts a boost once it is charged), maxSpeed? }.
     Feel (the contract): hovers HOVER.HEIGHT 0.4 over the surface; max 11, boost 14 for 2 s with
     a 4 s recharge; acceleration 10, braking 12, friction 2.5 when coasting; drift: the yaw turns
     at 1.6 rad/s at rest rising to 2.6 at speed while the velocity heading follows the yaw with a
     grip that falls from 7 rad/s to 1.7, so a hard turn at speed slides (drift up to 0.7 rad,
     lean up to 0.35); airtime: the board leaves the ground when the surface drops faster than
     FOLLOW_RATE 6 per s (a ridge, a cliff, a kicker lip, which hands the board its climb rate as
     launch speed), keeps its velocity, falls at 0.4 of the walker's 20 less a glide that grows
     with speed (3.6 at full speed) and a lift of 1.5 per s while boosting, descent capped at 7;
     landing within 2 of drop is soft (a dip), over 2 bounces once; no damage ever. Four point
     collision at radius 0.35 slides along walls and scrubs the speed by what was lost.
   makeBoat(ctx, kind) -> { group, hull, kind, parts: { hull, seats, oars?, motor?, tiller?, wake: { ripples: [a, b], wash, mats } }, time, animate(boat, speed, dt, wakeOn) }
     kind 'rowboat' (a cream clinker rowboat with two thwarts and shipped oars) or 'launch' (a navy
     launch with a silver rail, a foredeck, a windscreen and an outboard with a tiller). ctx =
     { color? (the hull), trim? }. Local +z is the bow, the water line is y = 0: the caller puts
     group.position at (x, s.y, z) with s.y the controller's surface height and rotation.y = s.yaw.
     BOAT[kind].SEAT is the rider's seat anchor (pose 'boat', seated, one hand on the tiller at
     BOAT[kind].TILLER). The wake is pooled with the boat: two trailing ripple planes and a stern
     wash, children of the group, so nothing is allocated per frame.
   animateBoat(boat, speed, dt, wakeOn): the hull bobs and pitches with speed, the rowboat's oars
     stroke with speed, the launch's tiller follows boat.steer (radians); the wake planes recede
     behind the stern, widen and fade in a cycle driven by the speed, and fade out when the boat is
     slow or wakeOn is false (the creek slow zone). Allocation free.
   createBoatController(opts) -> { drives: true, floats: true, kind, radius, numbers, step(s, input, dt), canDock(s, dock), dockDistance(s, dock), fits(x, z), maxSpeedAt(x, z) }
     The boat model, pure and allocation free per step. opts (or opts.env): kind ('rowboat' or
     'launch', default 'launch'), waterAt(x, z) -> boolean (open boat water under a point;
     default: at(tx, ty) === TILES.WA), slowAt(x, z) -> boolean (the creek slow zone: max 3, no
     wake), blockedAt(x, z) -> boolean (the pond swim area plus one, the island, the pier planks),
     surfaceAt(x, z) (the water surface, for s.y; the hull eases between two levels at a weir over
     about 1.5 tiles), maxSpeedAt(x, z) (an extra cap), fits(x, z) (a full test), radius (0.5),
     and every number by name (topSpeed, reverse, accel, brake, capBrake, drag, dragQ, turnFast,
     turnSlow, slowSpeed, dockRange, weirEase, wakeSpeed, steerRate, scrubRate).
     s = { x, z, y, yaw, speed (signed: negative astern), steer }; step fills in bumped, slow,
     wake (true when a wake should show), maxSpeed, surface. input = { throttle -1..1 (W forward,
     S astern to 2 after braking at 4), steer -1..1 (positive toward local +x, the yaw grows with
     it, at TURN_FAST 1.1 rad/s at speed falling to TURN_SLOW 0.5 at a crawl), brake? 0..1 }.
     Momentum: a drag of 0.9 per s plus a little quadratic drag, so a launch coasts for seconds.
     canDock(s, dock): the dock is free (dock.boat is null or undefined) and the boat's center is
     within BOAT.DOCK_RANGE 2 of the slip's center (dock.slip { x, y } or the dock tile { x, y }).
   moorAt(s, dock): puts the boat in the slip (the slip center, the dock's yaw, stopped).
   nearestDock(s, docks, range?, freeOnly?): the nearest dock record within range (default
     BOAT.DOCK_RANGE) or null; no allocation.
   HOVER and BOAT hold the numbers.

   Conventions: one tile = one world unit, x east, z south, angles in radians. */
import * as THREE from 'three';
import { BRAND, mat, glow, box, cyl, torus, sphere, clamp } from './depts/common.js';

/* ---------- numbers (contract first, then the design's closing of the open ones) ---------- */
export const CART = {
  ACCEL: 6, BRAKE: 12, FRICTION: 2.5, TOP_SPEED: 8.5, REVERSE: 0.4,
  STEER_MAX: 0.55, STEER_HIGH_CUT: 0.6, STEER_RATE: 4, CENTER_RATE: 6, WHEELBASE: 1.4,
  RADIUS: 0.45, WHEEL_R: 0.22, SLOPE_K: 7, LEAN: 0.08, LEAN_RATE: 10,
  SEAT: { x: 0.24, y: 0.72, z: -0.15 },
};

const C = {
  white: '#F8F6F0', navy: BRAND.navy, aqua: BRAND.aqua, salmon: BRAND.salmon, silver: BRAND.silver,
  iron: '#2E3E50', chrome: '#D9DEE3', tyre: '#1F262D', glass: '#A9D8E6', seat: '#E2E9EE',
  headlight: '#FFF4D6', headlightGlow: '#FFE2A0', taillight: '#D9342B',
};

/* Cached materials (depts/common mat() caches by key, so every cart shares these). */
function cartMats(color) {
  return {
    body: mat(color, { roughness: 0.55 }),
    navy: mat(C.navy, { roughness: 0.7 }),
    seat: mat(C.seat, { roughness: 0.9 }),
    silver: mat(C.silver, { roughness: 0.6, metalness: 0.1 }),
    iron: mat(C.iron, { roughness: 0.55, metalness: 0.2 }),
    chrome: mat(C.chrome, { roughness: 0.4, metalness: 0.2 }),
    tyre: mat(C.tyre, { roughness: 0.95 }),
    glass: mat(C.glass, { roughness: 0.25, metalness: 0.1, opacity: 0.35 }),
    bagA: mat(C.salmon, { roughness: 0.7 }),
    bagB: mat(C.aqua, { roughness: 0.7 }),
  };
}

/* One wheel: a steer pivot at the hub (rotation.y follows the steer angle on the front axle) with a
   spin group inside (rotation.x follows the wheel angle, the axle lies along local x). */
function makeWheel(M, x, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, CART.WHEEL_R, z);
  const spin = new THREE.Group();
  pivot.add(spin);
  const tyre = cyl(CART.WHEEL_R, CART.WHEEL_R, 0.16, M.tyre, { rz: Math.PI / 2, seg: 18, parent: spin });
  tyre.position.set(0, 0, 0);
  const hub = cyl(0.12, 0.12, 0.17, M.chrome, { rz: Math.PI / 2, seg: 12, parent: spin });
  hub.position.set(0, 0, 0);
  const cap = cyl(0.05, 0.05, 0.19, M.navy, { rz: Math.PI / 2, seg: 10, parent: spin, castShadow: false });
  cap.position.set(0, 0, 0);
  pivot.userData.spin = spin;
  return pivot;
}

/* A golf bag on the rear rack: a tilted cylinder with a cap ring and three club heads above it. */
function makeBag(M, bodyMat, x) {
  const g = new THREE.Group();
  g.position.set(x, 0.42, -0.92);
  g.rotation.x = 0.32;
  cyl(0.11, 0.10, 0.78, bodyMat, { y: 0, seg: 14, parent: g });
  cyl(0.12, 0.12, 0.05, M.iron, { y: 0.74, seg: 14, parent: g });
  cyl(0.12, 0.12, 0.05, M.iron, { y: 0.18, seg: 14, parent: g, castShadow: false });
  const heads = [[-0.05, 0.98, 0.02], [0.03, 1.04, -0.04], [0.06, 0.94, 0.05]];
  for (const [hx, hy, hz] of heads) {
    cyl(0.012, 0.012, 0.3, M.chrome, { x: hx, y: 0.76, z: hz, seg: 6, parent: g, castShadow: false });
    sphere(0.035, M.iron, { x: hx, y: hy, z: hz, ws: 10, hs: 8, parent: g, castShadow: false });
  }
  return g;
}

export function makeCart(ctx) {
  ctx = ctx || {};
  const M = cartMats(ctx.color || C.white);
  const group = new THREE.Group();
  group.name = 'cart';

  /* Wheels on the ground, outside the lean. Order: front left, front right, rear left, rear right.
     Facing +z the left side is +x (right of play is (-u.y, u.x), as the design fixes it). */
  const halfTrack = 0.46, halfBase = CART.WHEELBASE / 2;
  const wheels = [
    makeWheel(M, halfTrack, halfBase), makeWheel(M, -halfTrack, halfBase),
    makeWheel(M, halfTrack, -halfBase), makeWheel(M, -halfTrack, -halfBase),
  ];
  wheels[0].userData.front = true; wheels[1].userData.front = true;
  for (const w of wheels) group.add(w);

  /* Chassis: everything that leans into a turn. */
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  group.add(chassis);

  // floor pan and sills
  box(1.0, 0.08, 1.72, M.silver, { y: 0.26, parent: chassis });
  box(0.98, 0.1, 1.6, M.iron, { y: 0.17, parent: chassis, castShadow: false });
  // front cowl with a navy bumper strip and a dash
  box(0.96, 0.34, 0.6, M.body, { y: 0.3, z: 0.55, radius: 0.06, parent: chassis });
  box(0.98, 0.06, 0.1, M.navy, { y: 0.3, z: 0.82, parent: chassis, castShadow: false });
  box(0.9, 0.16, 0.22, M.body, { y: 0.64, z: 0.4, radius: 0.04, parent: chassis });
  // rear body (seat base and fenders)
  box(0.96, 0.42, 0.78, M.body, { y: 0.3, z: -0.42, radius: 0.06, parent: chassis });
  box(0.98, 0.06, 0.1, M.navy, { y: 0.3, z: -0.84, parent: chassis, castShadow: false });
  // two seats: cushions and a shared back rest
  const seats = [];
  for (const sx of [CART.SEAT.x, -CART.SEAT.x]) {
    const s = new THREE.Group();
    s.position.set(sx, CART.SEAT.y, CART.SEAT.z);
    box(0.42, 0.12, 0.44, M.seat, { y: -0.12, radius: 0.03, parent: s });
    box(0.42, 0.42, 0.1, M.seat, { y: -0.08, z: -0.24, radius: 0.03, parent: s });
    chassis.add(s);
    seats.push(s);
  }
  box(0.96, 0.08, 0.14, M.body, { y: 0.98, z: -0.41, parent: chassis, castShadow: false });
  // steering column and wheel (driver on the left, local +x)
  const column = cyl(0.02, 0.02, 0.42, M.iron, { seg: 8, parent: chassis, castShadow: false });
  column.position.set(CART.SEAT.x, 0.78, 0.26); column.rotation.x = -0.75;
  torus(0.13, 0.018, M.navy, { x: CART.SEAT.x, y: 0.94, z: 0.12, rx: -0.75, parent: chassis, castShadow: false });
  // windshield
  box(0.9, 0.62, 0.03, M.glass, { y: 0.9, z: 0.5, parent: chassis, castShadow: false });
  // roof on four posts
  for (const px of [halfTrack, -halfTrack]) for (const pz of [0.62, -0.6]) {
    cyl(0.025, 0.025, 1.34, M.chrome, { x: px, y: 0.3, z: pz, seg: 8, parent: chassis, castShadow: false });
  }
  const roof = box(1.12, 0.08, 1.9, M.navy, { y: 1.62, z: 0.02, radius: 0.03, parent: chassis });
  box(1.0, 0.02, 1.78, M.seat, { y: 1.7, z: 0.02, parent: chassis, castShadow: false });
  // bag rack with two bags
  const bag = new THREE.Group();
  bag.name = 'bagRack';
  box(0.9, 0.04, 0.3, M.iron, { y: 0.5, z: -0.95, parent: bag, castShadow: false });
  box(0.9, 0.04, 0.03, M.iron, { y: 0.9, z: -1.08, parent: bag, castShadow: false });
  for (const px of [0.42, -0.42]) cyl(0.015, 0.015, 0.44, M.iron, { x: px, y: 0.5, z: -1.08, seg: 6, parent: bag, castShadow: false });
  const bags = [makeBag(M, M.bagA, 0.22), makeBag(M, M.bagB, -0.22)];
  for (const b of bags) bag.add(b);
  chassis.add(bag);
  // lights: fresh emissive materials per cart so setNight can drive them
  const headMat = glow(C.headlight, 0.15); headMat.emissive.set(C.headlightGlow); headMat.roughness = 0.4;
  const tailMat = glow(C.taillight, 0.3); tailMat.roughness = 0.4;
  const headlights = [], taillights = [];
  for (const sx of [0.32, -0.32]) {
    headlights.push(box(0.16, 0.1, 0.04, headMat, { x: sx, y: 0.4, z: 0.84, radius: 0.01, parent: chassis, castShadow: false }));
    taillights.push(box(0.14, 0.08, 0.04, tailMat, { x: sx, y: 0.46, z: -0.82, radius: 0.01, parent: chassis, castShadow: false }));
  }

  const cart = {
    group, chassis, roof,
    parts: { wheels, seat: seats[0], seats, bag, bags, headlights, taillights, roof, chassis, headMat, tailMat },
    wheelAngle: 0, lean: 0,
    animate(c, speed, steer, dt) { animateCart(c || cart, speed, steer, dt); },
  };
  setNight(cart, 0);
  return cart;
}

/* Spinning wheels, steering front wheels, body lean into the turn. speed in units per second,
   steer the steer angle in radians (positive turns toward local +x, matching player.js's
   yaw += v / wheelbase * tan(steer) * dt), dt in seconds. rotation.y = steer points the front
   wheels' rolling direction toward +x for a positive steer; rotation.z = -LEAN * steer * v / top
   tilts the body top toward +x on the same turn, so the cart rolls into every turn. */
function animateCart(cart, speed, steer, dt) {
  if (!(dt > 0)) dt = 0;
  if (!Number.isFinite(speed)) speed = 0;
  if (!Number.isFinite(steer)) steer = 0;
  let a = cart.wheelAngle + (speed / CART.WHEEL_R) * dt;
  if (a > Math.PI * 2) a -= Math.PI * 2; else if (a < -Math.PI * 2) a += Math.PI * 2;
  cart.wheelAngle = a;
  const wheels = cart.parts.wheels;
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    w.userData.spin.rotation.x = a;
    w.rotation.y = w.userData.front ? steer : 0;
  }
  const target = -CART.LEAN * steer * speed / CART.TOP_SPEED;
  const k = 1 - Math.exp(-CART.LEAN_RATE * dt);
  cart.lean += (target - cart.lean) * k;
  cart.chassis.rotation.z = cart.lean;
}

/* Night ramp n in 0..1: headlights come on with the lamps, taillights glow a little brighter. */
export function setNight(cart, n) {
  n = clamp(Number.isFinite(n) ? n : 0, 0, 1);
  cart.parts.headMat.emissiveIntensity = 0.15 + 2.2 * n;
  cart.parts.tailMat.emissiveIntensity = 0.3 + 1.2 * n;
}

/* =====================================================================================
   Scooter (docs/CONTRACT_V9.md): the kick scooter model, its animation and the riding model.
   ===================================================================================== */
/* v10 (CONTRACT_V10 "Scooter feel"): the riding numbers match js/player.js SCOOTER_FEEL, so the
   visitor's controller, its built in fallback, the agents' scooters and the renderer's rider
   steer visual (STEER_BASE, STEER_MAX) share one feel. */
export const SCOOTER = {
  ACCEL: 12, BRAKE: 16, FRICTION: 3,
  LAUNCH_BOOST: 1.5, LAUNCH_LEN: 0.3, LAUNCH_SPEED: 0.5,
  TOP_SPEED: 7.5, GRASS_SPEED: 5.5, SAND_SPEED: 2,
  RADIUS: 0.32, WHEELBASE: 0.84, STEER_BASE: 1.0, WHEEL_R: 0.075, DECK_Y: 0.12, RAKE: 0.16, STEM: 0.58,
  STEER_MAX: 0.9, STEER_MIN: 0.45, STEER_HIGH_CUT: 0.5, STEER_RATE: 6, CENTER_RATE: 8, STEER_VIS: 0.6,
  PIVOT_SPEED: 0.6, PIVOT_RATE: 2.2, TURN_SPEED: 1, SLOPE_K: 5, MAX_DT: 0.1,
  LEAN_MAX: 0.22, LEAN_K: 0.15, LEAN_RATE: 8,
};
/* Rider anchors in the scooter frame (local +z forward, y up): the feet on the deck, one forward
   one back, and the handlebar grips (the stem raked back from the front axle). The rider stands
   on the back half of the deck, about 0.45 behind the grips, so the stem and the bar clear the
   wide character bodies, and the bar (y about 0.69) sits below the riders' shoulders so the arms
   reach forward and slightly down (CONTRACT_V9 "Pose"). The animators solve the arms toward
   SCOOTER.BAR, so retuning these numbers moves the hands with the grips. */
SCOOTER.FEET = { y: SCOOTER.DECK_Y, front: 0.0, back: -0.26 };
SCOOTER.BAR = {
  y: SCOOTER.WHEEL_R + (0.04 + SCOOTER.STEM) * Math.cos(SCOOTER.RAKE),
  z: SCOOTER.WHEELBASE / 2 - (0.04 + SCOOTER.STEM) * Math.sin(SCOOTER.RAKE),
  halfWidth: 0.17,
};

const SC = { grip: '#2E3E50', tyre: C.tyre, hub: '#D9DEE3', bell: '#F6D463', iron: C.iron };

/* Shared scooter geometries, built on first use (local space, centered on the origin). */
let scooterGeo = null;
function scooterGeometries() {
  if (scooterGeo) return scooterGeo;
  const R = SCOOTER.WHEEL_R;
  const tyre = new THREE.CylinderGeometry(R, R, 0.034, 16); tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(R * 0.45, R * 0.45, 0.038, 10); hub.rotateZ(Math.PI / 2);
  const stem = new THREE.CylinderGeometry(0.017, 0.021, SCOOTER.STEM, 10); stem.translate(0, 0.04 + SCOOTER.STEM / 2, 0);
  const fork = new THREE.BoxGeometry(0.012, 0.12, 0.03); fork.translate(0, 0.06, 0);
  const crown = new THREE.BoxGeometry(0.07, 0.025, 0.04); crown.translate(0, 0.12, 0);
  const bar = new THREE.CylinderGeometry(0.013, 0.013, 0.42, 8); bar.rotateZ(Math.PI / 2); bar.translate(0, 0.04 + SCOOTER.STEM, 0);
  const collar = new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10); collar.translate(0, 0.04 + SCOOTER.STEM - 0.03, 0);
  const grip = new THREE.CylinderGeometry(0.019, 0.019, 0.09, 8); grip.rotateZ(Math.PI / 2);
  const bellCup = new THREE.SphereGeometry(0.024, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const bellPost = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6);
  // the deck runs from just behind the rear axle to just short of the front one
  const deckLen = SCOOTER.WHEELBASE - 0.08;
  const deck = new THREE.BoxGeometry(0.13, 0.03, deckLen);
  const tape = new THREE.BoxGeometry(0.11, 0.004, deckLen - 0.06);
  const stripe = new THREE.BoxGeometry(0.026, 0.005, deckLen - 0.1);
  const neck = new THREE.BoxGeometry(0.05, 0.05, 0.1);
  const fender = new THREE.BoxGeometry(0.06, 0.014, 0.15);
  const stand = new THREE.BoxGeometry(0.012, 0.012, 0.16);
  scooterGeo = { tyre, hub, stem, fork, crown, bar, collar, grip, bellCup, bellPost, deck, tape, stripe, neck, fender, stand };
  return scooterGeo;
}
function sMesh(geo, material, parent, x, y, z, cast) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = cast !== false; m.receiveShadow = true;
  parent.add(m);
  return m;
}
/* One scooter wheel: a pivot at the hub with a spin group inside (rotation.x is the wheel angle). */
function scooterWheel(G, M, parent, z) {
  const pivot = new THREE.Group();
  pivot.position.set(0, SCOOTER.WHEEL_R, z);
  const spinG = new THREE.Group();
  pivot.add(spinG);
  sMesh(G.tyre, M.tyre, spinG);
  sMesh(G.hub, M.hub, spinG, 0, 0, 0, false);
  pivot.userData.spin = spinG;
  parent.add(pivot);
  return pivot;
}

export function makeScooter(ctx) {
  ctx = ctx || {};
  const G = scooterGeometries();
  const M = {
    body: mat(ctx.color || BRAND.navy, { roughness: 0.5, metalness: 0.15 }),
    grip: mat(SC.grip, { roughness: 0.95 }),
    stripe: mat(BRAND.aqua, { roughness: 0.6 }),
    tyre: mat(SC.tyre, { roughness: 0.95 }),
    hub: mat(SC.hub, { roughness: 0.4, metalness: 0.2 }),
    iron: mat(SC.iron, { roughness: 0.55, metalness: 0.2 }),
    bell: mat(SC.bell, { roughness: 0.3, metalness: 0.6 }),
  };
  const group = new THREE.Group();
  group.name = 'scooter';
  const lean = new THREE.Group();
  lean.name = 'scooterLean';
  group.add(lean);

  const halfBase = SCOOTER.WHEELBASE / 2, deckY = SCOOTER.DECK_Y;
  // deck: the frame, the grip tape and the Thread aqua stripe down the middle, the neck to the head
  const deck = new THREE.Group();
  deck.name = 'deck';
  lean.add(deck);
  sMesh(G.deck, M.body, deck, 0, deckY - 0.019, -0.01);
  sMesh(G.tape, M.grip, deck, 0, deckY - 0.002, -0.01, false);
  const stripe = sMesh(G.stripe, M.stripe, deck, 0, deckY + 0.0005, -0.01, false);
  sMesh(G.neck, M.body, deck, 0, deckY - 0.01, halfBase - 0.06);
  // rear wheel and the rear fender brake over it
  const rear = scooterWheel(G, M, lean, -halfBase);
  const fender = sMesh(G.fender, M.body, deck, 0, SCOOTER.WHEEL_R * 2 + 0.012, -halfBase - 0.02);
  fender.rotation.x = -0.18;
  // kickstand on the left (+x) side, swung down to the ground
  const kickstand = new THREE.Group();
  kickstand.name = 'kickstand';
  kickstand.position.set(0.066, deckY - 0.03, -0.04);
  const leg = sMesh(G.stand, M.iron, kickstand, 0.03, -0.04, -0.06, false);
  leg.rotation.set(0.55, 0, -0.5);
  deck.add(kickstand);

  // steering: a pivot at the front axle raked back, the steer group turns about its local y
  const rakePivot = new THREE.Group();
  rakePivot.position.set(0, SCOOTER.WHEEL_R, halfBase);
  rakePivot.rotation.x = -SCOOTER.RAKE;
  lean.add(rakePivot);
  const steerGroup = new THREE.Group();
  steerGroup.name = 'stem';
  rakePivot.add(steerGroup);
  const frontSpin = new THREE.Group();
  const front = new THREE.Group();
  front.add(frontSpin);
  front.userData.spin = frontSpin;
  front.rotation.x = SCOOTER.RAKE;   // the tyre stays upright when the steer is 0
  sMesh(G.tyre, M.tyre, frontSpin);
  sMesh(G.hub, M.hub, frontSpin, 0, 0, 0, false);
  steerGroup.add(front);
  for (const sx of [-1, 1]) sMesh(G.fork, M.body, steerGroup, sx * 0.024, 0, 0, false);
  sMesh(G.crown, M.body, steerGroup, 0, 0, 0, false);
  sMesh(G.stem, M.body, steerGroup);
  sMesh(G.collar, M.iron, steerGroup, 0, 0, 0, false);
  const handlebar = new THREE.Group();
  handlebar.name = 'handlebar';
  steerGroup.add(handlebar);
  sMesh(G.bar, M.iron, handlebar, 0, 0, 0, false);
  const barY = 0.04 + SCOOTER.STEM;
  for (const sx of [-1, 1]) sMesh(G.grip, M.grip, handlebar, sx * SCOOTER.BAR.halfWidth, barY, 0, false);
  // a small brass bell by the left grip
  const bell = new THREE.Group();
  bell.name = 'bell';
  bell.position.set(0.1, barY + 0.012, 0);
  sMesh(G.bellPost, M.iron, bell, 0, 0, 0, false);
  sMesh(G.bellCup, M.bell, bell, 0, 0.008, 0, false);
  handlebar.add(bell);

  const scooter = {
    group, lean, steerGroup,
    parts: { lean, deck, stripe, stem: steerGroup, handlebar, bell, wheels: [front, rear], kickstand },
    wheelAngle: 0, leanAngle: 0, leanZ: 0,
    animate(s, speed, steer, dt) { animateScooter(s || scooter, speed, steer, dt); },
  };
  return scooter;
}

/* Wheel spin, stem steer and the lean into the turn (see the header). Allocation free. */
export function animateScooter(scooter, speed, steer, dt) {
  if (!scooter || !scooter.parts) return;
  if (!(dt > 0)) dt = 0;
  if (!Number.isFinite(speed)) speed = 0;
  if (!Number.isFinite(steer)) steer = 0;
  let a = (Number.isFinite(scooter.wheelAngle) ? scooter.wheelAngle : 0) + (speed / SCOOTER.WHEEL_R) * dt;
  a %= Math.PI * 2;
  scooter.wheelAngle = a;
  const wheels = scooter.parts.wheels;
  for (let i = 0; i < wheels.length; i++) wheels[i].userData.spin.rotation.x = a;
  scooter.steerGroup.rotation.y = clamp(steer, -SCOOTER.STEER_VIS, SCOOTER.STEER_VIS);
  const target = clamp(-SCOOTER.LEAN_K * steer * speed, -SCOOTER.LEAN_MAX, SCOOTER.LEAN_MAX);
  const k = 1 - Math.exp(-SCOOTER.LEAN_RATE * dt);
  let l = Number.isFinite(scooter.leanAngle) ? scooter.leanAngle : 0;
  l += (target - l) * k;
  l = clamp(l, -SCOOTER.LEAN_MAX, SCOOTER.LEAN_MAX);
  scooter.leanAngle = l;
  scooter.leanZ = l;
  scooter.lean.rotation.z = l;
}

/* ---------- the riding model ---------- */
const DEFAULT_TILES = { G: 0, P: 1, WA: 2, B: 3, T: 4, Z: 5, F: 6, FT: 8, FW: 9, GR: 10, SA: 11, TEE: 12, SW: 13, CW: 14, PK: 15, BR: 16, PT: 17, CP: 18, DK: 19 };

/* The max speed by the lie (docs/CONTRACT_V9.md "The visitor riding"). */
export function scooterSpeedForTile(v, TILES) {
  const T = TILES || DEFAULT_TILES;
  if (v === T.P || v === T.SW || v === T.CW || v === T.Z || v === T.PK || v === T.BR) return SCOOTER.TOP_SPEED;
  if (v === T.G || v === T.F || v === T.FW || v === T.TEE) return SCOOTER.GRASS_SPEED;
  if (v === T.SA) return SCOOTER.SAND_SPEED;
  return 0;
}

const fin = Number.isFinite;
const TAU = Math.PI * 2;

export function createScooterController(opts) {
  const env = (opts && opts.env) || opts || {};
  const N = SCOOTER;
  /* v10: the feel numbers come from opts by name (js/player.js SCOOTER_FEEL), each falling back
     to the SCOOTER table; a non finite or non positive value is ignored. */
  const num = (v, d) => (fin(v) && v > 0 ? v : d);
  /* The numbers copied into closure constants: a double read from the exported object and handed
     back across a call is boxed by V8, which allocates on every step. */
  const K_ACCEL = num(env.accel, N.ACCEL), K_BRAKE = num(env.brake, N.BRAKE), K_FRICTION = fin(env.friction) && env.friction >= 0 ? env.friction : N.FRICTION;
  const K_TOP_SPEED = num(env.topSpeed, N.TOP_SPEED);
  const K_GRASS_SPEED = num(env.grassSpeed, N.GRASS_SPEED), K_SAND_SPEED = num(env.sandSpeed, N.SAND_SPEED);
  const K_WHEELBASE = num(env.steerBase, num(env.wheelbase, N.STEER_BASE));
  const K_STEER_MAX = num(env.steerMax, N.STEER_MAX);
  // the high speed cut comes from steerHighCut, else from steerMin (the angle left at full speed)
  const K_STEER_HIGH_CUT = fin(env.steerHighCut) && env.steerHighCut >= 0 && env.steerHighCut < 1 ? env.steerHighCut
    : fin(env.steerMin) && env.steerMin > 0 && env.steerMin <= K_STEER_MAX ? 1 - env.steerMin / K_STEER_MAX : N.STEER_HIGH_CUT;
  const K_STEER_RATE = num(env.steerRate, N.STEER_RATE), K_CENTER_RATE = num(env.centerRate, N.CENTER_RATE);
  const K_PIVOT_SPEED = num(env.pivotSpeed, N.PIVOT_SPEED), K_PIVOT_RATE = num(env.pivotRate, N.PIVOT_RATE), K_TURN_SPEED = N.TURN_SPEED;
  const K_SLOPE_K = fin(env.slopeK) && env.slopeK >= 0 ? env.slopeK : N.SLOPE_K, K_MAX_DT = N.MAX_DT;
  const K_LAUNCH_BOOST = num(env.launchBoost, N.LAUNCH_BOOST), K_LAUNCH_LEN = fin(env.launchLen) && env.launchLen >= 0 ? env.launchLen : N.LAUNCH_LEN;
  const K_LAUNCH_SPEED = fin(env.launchSpeed) && env.launchSpeed >= 0 ? env.launchSpeed : N.LAUNCH_SPEED;
  /* The controller's own launch window (used when input.boost is absent): it opens when the
     throttle first comes on under LAUNCH_SPEED and re-arms once the throttle is released. */
  let launchArmed = true, launchLeft = 0;
  const R = fin(env.radius) && env.radius > 0 ? env.radius : N.RADIUS;
  const T = env.TILES || env.tiles || DEFAULT_TILES;
  const at = typeof env.at === 'function' ? env.at : null;
  const userMax = typeof env.maxSpeedAt === 'function' ? env.maxSpeedAt : null;
  const userFits = typeof env.fits === 'function' ? env.fits : null;

  /* No try blocks on the per step path (V8 boxes the doubles around them, which allocates); the
     env callbacks must not throw, and player.js already wraps a controller step in its own try. */
  function lieSpeed(v) {
    if (v === T.P || v === T.SW || v === T.CW || v === T.Z || v === T.PK || v === T.BR) return K_TOP_SPEED;
    if (v === T.G || v === T.F || v === T.FW || v === T.TEE) return K_GRASS_SPEED;
    if (v === T.SA) return K_SAND_SPEED;
    return 0;
  }
  function maxSpeedAt(x, z) {
    let v = K_TOP_SPEED;
    if (userMax) v = userMax(x, z);
    else if (at) v = lieSpeed(at(Math.floor(x) | 0, Math.floor(z) | 0));
    return fin(v) && v > 0 ? v : 0;
  }
  // the corner test stays boolean all the way down (no double crosses a call on this path)
  const lieOpen = v => v === T.P || v === T.SW || v === T.CW || v === T.Z || v === T.PK || v === T.BR
    || v === T.G || v === T.F || v === T.FW || v === T.TEE || v === T.SA;
  const pointOK = userMax ? (x, z) => userMax(x, z) > 0
    : at ? (x, z) => lieOpen(at(Math.floor(x) | 0, Math.floor(z) | 0))
    : () => true;
  function fits(x, z) {
    if (!fin(x) || !fin(z)) return false;
    if (userFits) return !!userFits(x, z);
    return pointOK(x - R, z - R) && pointOK(x + R, z - R) && pointOK(x - R, z + R) && pointOK(x + R, z + R);
  }
  /* The step path's tile test takes the corner tile indices as int32 (small integers cross a call
     untouched, doubles get boxed when V8 does not inline the call, and that allocates). */
  const tilesOnly = !userFits && !userMax && !!at;
  const cornersOpen = (ix0, iz0, ix1, iz1) => lieOpen(at(ix0, iz0)) && lieOpen(at(ix1, iz0)) && lieOpen(at(ix0, iz1)) && lieOpen(at(ix1, iz1));

  function step(s, input, dt) {
    if (!s) return s;
    if (!fin(s.x)) s.x = 0;
    if (!fin(s.z)) s.z = 0;
    if (!fin(s.yaw)) s.yaw = 0;
    if (!fin(s.speed) || s.speed < 0) s.speed = 0;
    if (!fin(s.steer)) s.steer = 0;
    s.bumped = false;
    if (!(dt > 0)) { s.maxSpeed = maxSpeedAt(s.x, s.z); return s; }
    if (dt > K_MAX_DT) dt = K_MAX_DT;
    const inp = input || null;
    const throttle = inp && fin(inp.throttle) ? Math.min(1, Math.max(0, inp.throttle)) : 0;
    const brake = inp && fin(inp.brake) ? Math.min(1, Math.max(0, inp.brake)) : 0;
    const steerIn = inp && fin(inp.steer) ? Math.min(1, Math.max(-1, inp.steer)) : 0;
    const turn = inp && fin(inp.turn) ? inp.turn : 0;

    // the lie max, written out here so no double crosses a call on the step path
    let maxV = K_TOP_SPEED;
    if (userMax) maxV = userMax(s.x, s.z);
    else if (at) {
      const tv = at(Math.floor(s.x) | 0, Math.floor(s.z) | 0);
      maxV = tv === T.P || tv === T.SW || tv === T.CW || tv === T.Z || tv === T.PK || tv === T.BR ? K_TOP_SPEED
        : tv === T.G || tv === T.F || tv === T.FW || tv === T.TEE ? K_GRASS_SPEED : tv === T.SA ? K_SAND_SPEED : 0;
    }
    if (!(maxV > 0) || !fin(maxV)) maxV = 0;
    if (inp && fin(inp.maxSpeed) && inp.maxSpeed >= 0 && inp.maxSpeed < maxV) maxV = inp.maxSpeed;
    s.maxSpeed = maxV;

    let hx = Math.sin(s.yaw), hz = Math.cos(s.yaw);
    let v = s.speed;
    if (inp && fin(inp.gradX) && fin(inp.gradZ)) v -= K_SLOPE_K * (inp.gradX * hx + inp.gradZ * hz) * dt;
    // v10: the launch boost, from the caller (input.boost) or the controller's own window
    let boost = 1;
    if (inp && fin(inp.boost) && inp.boost > 0) boost = inp.boost;
    else if (throttle > 0.05) {
      if (launchArmed) { if (v < K_LAUNCH_SPEED) launchLeft = K_LAUNCH_LEN; launchArmed = false; }
      if (launchLeft > 0) { boost = K_LAUNCH_BOOST; launchLeft -= dt; }
    } else { launchArmed = true; launchLeft = 0; }
    if (brake > 0.05) v = Math.max(0, v - K_BRAKE * brake * dt);
    else if (throttle > 0.05) { if (v < maxV) v = Math.min(maxV, v + K_ACCEL * boost * throttle * dt); }
    else if (v > 0) v = Math.max(0, v - K_FRICTION * dt);
    if (v > maxV) v = Math.max(maxV, v - K_BRAKE * dt);
    if (v < 0 || maxV <= 0) v = 0;

    // steering: the angle eases toward the input times a max that shrinks with speed
    const sMax = K_STEER_MAX * (1 - K_STEER_HIGH_CUT * Math.min(1, Math.max(0, v / K_TOP_SPEED)));
    const target = steerIn * sMax;
    const rate = Math.abs(target) > Math.abs(s.steer) ? K_STEER_RATE : K_CENTER_RATE;
    const dSteer = Math.min(rate * dt, Math.max(-rate * dt, target - s.steer));
    s.steer = Math.min(K_STEER_MAX, Math.max(-K_STEER_MAX, s.steer + dSteer));
    let yaw = s.yaw + v / K_WHEELBASE * Math.tan(s.steer) * dt;
    // a stopped rider walks the scooter round: a slow pivot that fades out by PIVOT_SPEED
    if (v < K_PIVOT_SPEED) yaw += steerIn * K_PIVOT_RATE * (1 - v / K_PIVOT_SPEED) * dt;
    if (turn !== 0 && v < K_TURN_SPEED) yaw += turn * dt;
    if (!fin(yaw)) yaw = s.yaw;
    yaw = (yaw + Math.PI) % TAU; if (yaw < 0) yaw += TAU;
    s.yaw = yaw - Math.PI;

    hx = Math.sin(s.yaw); hz = Math.cos(s.yaw);
    const px = s.x, pz = s.z;
    const nx = px + hx * v * dt, nz = pz + hz * v * dt;
    if (v > 0 && (nx !== px || nz !== pz)) {
      // corner tiles of the old and the new position, as int32
      const ax0 = Math.floor(px - R) | 0, ax1 = Math.floor(px + R) | 0, az0 = Math.floor(pz - R) | 0, az1 = Math.floor(pz + R) | 0;
      const bx0 = Math.floor(nx - R) | 0, bx1 = Math.floor(nx + R) | 0, bz0 = Math.floor(nz - R) | 0, bz1 = Math.floor(nz + R) | 0;
      if (tilesOnly ? fin(nx) && fin(nz) && cornersOpen(bx0, bz0, bx1, bz1) : fits(nx, nz)) { s.x = nx; s.z = nz; }
      else {
        // slide along the wall: keep the axis that fits, scrub the speed by what was lost
        s.bumped = true;
        let movedX = false;
        if (tilesOnly ? fin(nx) && cornersOpen(bx0, az0, bx1, az1) : fits(nx, pz)) { s.x = nx; movedX = true; }
        if (tilesOnly ? fin(nz) && (movedX ? cornersOpen(bx0, bz0, bx1, bz1) : cornersOpen(ax0, bz0, ax1, bz1)) : fits(s.x, nz)) s.z = nz;
        const wx = nx - px, wz = nz - pz, gx = s.x - px, gz = s.z - pz;
        const want = Math.sqrt(wx * wx + wz * wz), got = Math.sqrt(gx * gx + gz * gz);
        v *= want > 1e-9 ? Math.min(1, Math.max(0, got / want)) : 0;
        if (v < 0.05) v = 0;
      }
    }
    s.speed = fin(v) ? v : 0;
    if (!fin(s.x) || !fin(s.z)) { s.x = px; s.z = pz; s.speed = 0; }
    return s;
  }

  return { drives: true, radius: R, numbers: N, step, maxSpeedAt, fits };
}

/* =====================================================================================
   Version 11 (docs/CONTRACT_V11.md "The hoverboard"): the hoverboard model, its animation and
   the hover controller (hover, airtime, boost, drift). See the header for the shapes.
   ===================================================================================== */
export const HOVER = {
  HEIGHT: 0.4, TOP_SPEED: 11, BOOST_SPEED: 14, BOOST_LEN: 2, BOOST_RECHARGE: 4, BOOST_ACCEL: 1.4,
  ACCEL: 10, BRAKE: 12, FRICTION: 2.5, RADIUS: 0.35,
  WALK_GRAVITY: 20, GRAVITY_K: 0.4, LIFT: 1.5, GLIDE: 3.6, MAX_FALL: 7, FOLLOW_RATE: 6, LAUNCH_VY: 6,
  JUMP_VY: 4.5,   // v11.1: the ollie's upward speed (about 1.3 of height at 0.4 g)
  SOFT_DROP: 2, BOUNCE_K: 0.35, BOUNCE_MAX: 2.5, LAND_SCRUB: 0.85, DIP: 0.12, DIP_RATE: 6,
  YAW_LOW: 1.6, YAW_HIGH: 2.6, GRIP_LOW: 7, GRIP_HIGH: 1.7, DRIFT_MAX: 0.7, AIR_YAW: 1.2,
  LEAN_MAX: 0.35, LEAN_K: 0.5, LEAN_STEER: 0.25, LEAN_RATE: 8, PIVOT_SPEED: 0.6, MAX_DT: 0.1,
  PITCH_SPEED: 0.05, PITCH_AIR: 0.14, BOB: 0.02,
  DECK: { w: 0.52, h: 0.07, l: 1.15 },
};
/* Rider anchors in the board frame: the feet on the deck top, one forward one back. */
HOVER.FEET = { y: HOVER.DECK.h, front: 0.2, back: -0.22 };

const HV = { tape: '#D9DEE3', iron: C.iron, sand: '#E8DCC2' };

/* Shared hoverboard geometries (local space, built on first use). */
let hoverGeo = null;
function hoverGeometries() {
  if (hoverGeo) return hoverGeo;
  const D = HOVER.DECK;
  const tape = new THREE.BoxGeometry(D.w - 0.1, 0.008, D.l - 0.16);
  const stripe = new THREE.BoxGeometry(0.05, 0.005, D.l - 0.24);
  const fin = new THREE.BoxGeometry(0.035, 0.11, 0.2); fin.translate(0, 0.055, 0);
  const tailFin = new THREE.BoxGeometry(0.03, 0.15, 0.24); tailFin.translate(0, 0.075, 0);
  const glowPlane = new THREE.PlaneGeometry(D.w - 0.08, D.l - 0.18);
  const pod = new THREE.CylinderGeometry(0.075, 0.095, 0.08, 12); pod.translate(0, 0.04, 0);
  const side = new THREE.BoxGeometry(0.012, 0.02, D.l - 0.34);
  hoverGeo = { tape, stripe, fin, tailFin, glowPlane, pod, side };
  return hoverGeo;
}

export function makeHoverboard(ctx) {
  ctx = ctx || {};
  const G = hoverGeometries();
  const D = HOVER.DECK;
  const M = {
    deck: mat(ctx.color || BRAND.navy, { roughness: 0.45, metalness: 0.2 }),
    tape: mat(HV.tape, { roughness: 0.95 }),
    stripe: mat(ctx.glow || BRAND.aqua, { roughness: 0.6 }),
    iron: mat(HV.iron, { roughness: 0.55, metalness: 0.2 }),
  };
  // fresh emissive materials per board so the underglow can pulse on its own
  const glowMat = glow(ctx.glow || BRAND.aqua, 1.2);
  glowMat.transparent = true; glowMat.opacity = 0.55; glowMat.depthWrite = false; glowMat.side = THREE.DoubleSide;
  const podMat = glow(ctx.glow || BRAND.aqua, 1.0);

  const group = new THREE.Group();
  group.name = 'hoverboard';
  const lean = new THREE.Group();
  lean.name = 'hoverLean';
  group.add(lean);
  const body = new THREE.Group();
  body.name = 'hoverBody';
  lean.add(body);

  // the deck: a rounded slab with a silver grip tape top and an aqua stripe down the middle
  const deck = box(D.w, D.h, D.l, M.deck, { radius: 0.03, parent: body });
  const tape = sMesh(G.tape, M.tape, body, 0, D.h + 0.004, -0.02, false);
  const stripe = sMesh(G.stripe, M.stripe, body, 0, D.h + 0.011, -0.02, false);
  // the nose: a short aqua bumper
  const nose = box(0.3, 0.05, 0.08, M.stripe, { y: 0.01, z: D.l / 2 - 0.02, radius: 0.015, parent: body, castShadow: false });
  // fins: two swept side fins and a tail fin at the back
  const fins = [];
  for (const sx of [-1, 1]) {
    const f = sMesh(G.fin, M.stripe, body, sx * (D.w / 2 - 0.03), D.h, -D.l / 2 + 0.14, false);
    f.rotation.x = 0.35;
    fins.push(f);
  }
  const tail = sMesh(G.tailFin, M.deck, body, 0, D.h, -D.l / 2 + 0.16, false);
  tail.rotation.x = 0.3;
  fins.push(tail);
  // the underglow: a plane under the deck facing down, two thruster pods, and the side lights
  const glowPlane = new THREE.Mesh(G.glowPlane, glowMat);
  glowPlane.rotation.x = Math.PI / 2;
  glowPlane.position.set(0, -0.015, 0);
  glowPlane.castShadow = false; glowPlane.receiveShadow = false;
  body.add(glowPlane);
  const pods = [];
  for (const sx of [-1, 1]) {
    const p = sMesh(G.pod, podMat, body, sx * 0.14, -0.1, -0.12, false);
    pods.push(p);
  }
  const sideLights = [];
  for (const sx of [-1, 1]) sideLights.push(sMesh(G.side, podMat, body, sx * (D.w / 2 - 0.004), 0.02, 0, false));

  const board = {
    group, lean, body,
    parts: { lean, body, deck, tape, stripe, nose, fins, glowPlane, pods, sideLights, glowMat, podMat },
    time: 0, leanZ: 0, pitch: 0, dip: 0,
    animate(b, speed, steer, airborne, dt) { animateHoverboard(b || board, speed, steer, airborne, dt); },
  };
  return board;
}

/* The roll, the pitch, the landing dip and the underglow pulse (see the header). Allocation free. */
export function animateHoverboard(board, speed, steer, airborne, dt) {
  if (!board || !board.parts) return;
  if (!(dt > 0)) dt = 0;
  if (!fin(speed)) speed = 0;
  if (!fin(steer)) steer = 0;
  const N = HOVER;
  let t = (fin(board.time) ? board.time : 0) + dt;
  if (t > 1000) t -= 1000;
  board.time = t;
  const sp = Math.min(1.3, Math.max(0, Math.abs(speed) / N.TOP_SPEED));
  const k = 1 - Math.exp(-N.LEAN_RATE * dt);
  // roll toward the lean the controller hands over (the scooter sign)
  const leanTarget = clamp(steer, -N.LEAN_MAX, N.LEAN_MAX);
  let l = fin(board.leanZ) ? board.leanZ : 0;
  l += (leanTarget - l) * k;
  board.leanZ = l;
  // the nose lifts a little with speed and more in the air (negative rotation.x is nose up)
  const pitchTarget = airborne ? -N.PITCH_AIR - 0.03 * Math.sin(t * 2.1) : -N.PITCH_SPEED * Math.min(1, sp);
  let p = fin(board.pitch) ? board.pitch : 0;
  p += (pitchTarget - p) * k;
  board.pitch = p;
  // the landing dip eases out; an idle bob when slow on the ground
  let dip = fin(board.dip) ? board.dip : 0;
  dip -= dip * Math.min(1, N.DIP_RATE * dt);
  if (dip < 0.0005) dip = 0;
  board.dip = dip;
  const bob = airborne ? 0 : N.BOB * Math.sin(t * 3.1) * (1 - Math.min(1, sp));
  const lean = board.lean;
  lean.rotation.z = l;
  lean.rotation.x = p;
  lean.position.y = bob - dip;
  // the underglow pulses, brightens with speed and flares in the air
  const pulse = Math.sin(t * 11);
  const P = board.parts;
  P.glowMat.emissiveIntensity = 0.9 + 0.5 * sp + 0.25 * pulse + (airborne ? 0.4 : 0);
  P.glowMat.opacity = 0.4 + 0.3 * Math.min(1, sp) + 0.08 * pulse;
  P.podMat.emissiveIntensity = 0.8 + 0.6 * sp + 0.2 * pulse;
  const podScale = 1 + 0.3 * Math.min(1, sp) + 0.08 * pulse;
  for (let i = 0; i < P.pods.length; i++) P.pods[i].scale.y = podScale;
}

export function createHoverController(opts) {
  const env = (opts && opts.env) || opts || {};
  const N = HOVER;
  const num = (v, d) => (fin(v) && v > 0 ? v : d);
  const nonneg = (v, d) => (fin(v) && v >= 0 ? v : d);
  const fn = f => (typeof f === 'function' ? f : null);
  /* The numbers as closure constants (a double read from the exported object and handed across a
     call is boxed by V8, which allocates on every step). */
  const K_HEIGHT = nonneg(env.height, N.HEIGHT);
  const K_TOP = num(env.topSpeed, N.TOP_SPEED), K_BOOST_SPEED = num(env.boostSpeed, N.BOOST_SPEED);
  const K_BOOST_LEN = nonneg(env.boostLen, N.BOOST_LEN), K_BOOST_RECHARGE = nonneg(env.boostRecharge, N.BOOST_RECHARGE);
  const K_BOOST_ACCEL = num(env.boostAccel, N.BOOST_ACCEL);
  const K_ACCEL = num(env.accel, N.ACCEL), K_BRAKE = num(env.brake, N.BRAKE), K_FRICTION = nonneg(env.friction, N.FRICTION);
  const K_GRAVITY = nonneg(env.gravity, N.WALK_GRAVITY * N.GRAVITY_K);
  const K_LIFT = nonneg(env.lift, N.LIFT), K_GLIDE = nonneg(env.glide, N.GLIDE), K_MAX_FALL = num(env.maxFall, N.MAX_FALL);
  const K_FOLLOW = num(env.followRate, N.FOLLOW_RATE), K_LAUNCH_VY = nonneg(env.launchVy, N.LAUNCH_VY);
  const K_JUMP_VY = nonneg(env.jumpVy, N.JUMP_VY);
  const K_SOFT_DROP = nonneg(env.softDrop, N.SOFT_DROP), K_BOUNCE_K = nonneg(env.bounceK, N.BOUNCE_K), K_BOUNCE_MAX = nonneg(env.bounceMax, N.BOUNCE_MAX);
  const K_LAND_SCRUB = fin(env.landScrub) && env.landScrub >= 0 && env.landScrub <= 1 ? env.landScrub : N.LAND_SCRUB;
  const K_DIP = nonneg(env.dip, N.DIP), K_DIP_RATE = num(env.dipRate, N.DIP_RATE);
  const K_YAW_LOW = nonneg(env.yawLow, N.YAW_LOW), K_YAW_HIGH = nonneg(env.yawHigh, N.YAW_HIGH);
  const K_GRIP_LOW = num(env.gripLow, N.GRIP_LOW), K_GRIP_HIGH = num(env.gripHigh, N.GRIP_HIGH);
  const K_DRIFT_MAX = nonneg(env.driftMax, N.DRIFT_MAX), K_AIR_YAW = nonneg(env.airYaw, N.AIR_YAW);
  const K_LEAN_MAX = nonneg(env.leanMax, N.LEAN_MAX), K_LEAN_K = nonneg(env.leanK, N.LEAN_K), K_LEAN_STEER = nonneg(env.leanSteer, N.LEAN_STEER);
  const K_LEAN_RATE = num(env.leanRate, N.LEAN_RATE), K_PIVOT_SPEED = nonneg(env.pivotSpeed, N.PIVOT_SPEED);
  const K_MAX_DT = N.MAX_DT;
  const R = num(env.radius, N.RADIUS);
  const T = env.TILES || env.tiles || DEFAULT_TILES;
  const at = fn(env.at);
  const surfaceFn = fn(env.surfaceAt) || fn(env.heightAt);
  const userOpen = fn(env.openAt), userFits = fn(env.fits), userMax = fn(env.maxSpeedAt);
  const cols = num(env.cols, num(env.COLS, 0)), rows = num(env.rows, num(env.ROWS, 0));
  const bounded = !at && cols > 0 && rows > 0;

  /* No try blocks on the per step path; the env callbacks must not throw (player.js wraps a
     controller step in its own try). */
  const tileOpen = v => fin(v) && v >= 0 && v !== T.B && v !== T.T && v !== T.FT;
  const inBounds = (x, z) => !bounded || (x >= 0 && z >= 0 && x < cols && z < rows);
  function pointOK(x, z, y) {
    if (userOpen) return !!userOpen(x, z, y);
    if (at) return tileOpen(at(Math.floor(x) | 0, Math.floor(z) | 0));
    return inBounds(x, z);
  }
  function fits(x, z, y) {
    if (!fin(x) || !fin(z)) return false;
    if (userFits) return !!userFits(x, z, y);
    return pointOK(x - R, z - R, y) && pointOK(x + R, z - R, y) && pointOK(x - R, z + R, y) && pointOK(x + R, z + R, y);
  }
  // the default tile path takes the corner tiles as int32 so no double crosses a call
  const tilesOnly = !userFits && !userOpen && !!at;
  const cornersOpen = (ix0, iz0, ix1, iz1) => tileOpen(at(ix0, iz0)) && tileOpen(at(ix1, iz0)) && tileOpen(at(ix0, iz1)) && tileOpen(at(ix1, iz1));
  function surfaceAt(x, z) {
    if (!surfaceFn) return 0;
    const h = surfaceFn(x, z);
    return fin(h) ? h : 0;
  }
  function maxSpeedAt(x, z) {
    let v = K_TOP;
    if (userMax) { const u = userMax(x, z); if (fin(u) && u >= 0 && u < v) v = u; }
    return v;
  }
  const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

  function step(s, input, dt) {
    if (!s) return s;
    if (!fin(s.x)) s.x = 0;
    if (!fin(s.z)) s.z = 0;
    if (!fin(s.yaw)) s.yaw = 0;
    if (!fin(s.dir)) s.dir = s.yaw;
    if (!fin(s.speed) || s.speed < 0) s.speed = 0;
    if (!fin(s.vy)) s.vy = 0;
    if (!fin(s.steer)) s.steer = 0;
    if (!fin(s.lean)) s.lean = 0;
    if (!fin(s.dip) || s.dip < 0) s.dip = 0;
    if (!fin(s.boostLeft) || s.boostLeft < 0) s.boostLeft = 0;
    if (!fin(s.boostCd) || s.boostCd < 0) s.boostCd = 0;
    if (!fin(s.airTime) || s.airTime < 0) s.airTime = 0;
    if (!fin(s.apex)) s.apex = fin(s.y) ? s.y : 0;
    if (!fin(s.drop)) s.drop = 0;
    s.airborne = !!s.airborne; s.bounced = !!s.bounced; s.boostHeld = !!s.boostHeld;
    s.bumped = false; s.launched = false; s.landed = false; s.bounce = false;
    const h0 = surfaceAt(s.x, s.z);
    if (!fin(s.y)) { s.y = h0 + K_HEIGHT; s.airborne = false; }
    s.surface = h0;
    if (!(dt > 0)) { s.maxSpeed = maxSpeedAt(s.x, s.z); s.boosting = false; s.drift = wrap(s.yaw - s.dir); return s; }
    if (dt > K_MAX_DT) dt = K_MAX_DT;
    const inp = input || null;
    const throttle = inp && fin(inp.throttle) ? Math.min(1, Math.max(0, inp.throttle)) : 0;
    const brake = inp && fin(inp.brake) ? Math.min(1, Math.max(0, inp.brake)) : 0;
    const steerIn = inp && fin(inp.steer) ? Math.min(1, Math.max(-1, inp.steer)) : 0;
    const boostIn = !!(inp && inp.boost);
    const jumpIn = !!(inp && inp.jump);   // v11.1: Space pops the board (an ollie) from the ground

    /* The boost: a fresh press starts one when it is charged, it runs BOOST_LEN seconds or until
       the key lifts, then recharges for BOOST_RECHARGE seconds. */
    let boosting = false;
    if (boostIn) {
      if (s.boostLeft > 0) {
        boosting = true;
        s.boostLeft -= dt;
        if (s.boostLeft <= 0) { s.boostLeft = 0; s.boostCd = K_BOOST_RECHARGE; }
      } else if (!s.boostHeld && s.boostCd <= 0 && K_BOOST_LEN > 0) {
        s.boostLeft = K_BOOST_LEN;
        boosting = true;
      }
    } else if (s.boostLeft > 0) { s.boostLeft = 0; s.boostCd = K_BOOST_RECHARGE; }
    if (!boosting && s.boostCd > 0) { s.boostCd -= dt; if (s.boostCd < 0) s.boostCd = 0; }
    s.boostHeld = boostIn;
    s.boosting = boosting;
    s.boostCharge = s.boostLeft > 0 ? (K_BOOST_LEN > 0 ? s.boostLeft / K_BOOST_LEN : 0) : K_BOOST_RECHARGE > 0 ? 1 - s.boostCd / K_BOOST_RECHARGE : 1;

    // the cap: the boost top while boosting, else the top, then the caller's caps
    let maxV = boosting ? K_BOOST_SPEED : K_TOP;
    if (userMax) { const u = userMax(s.x, s.z); if (fin(u) && u >= 0 && u < maxV) maxV = u; }
    if (inp && fin(inp.maxSpeed) && inp.maxSpeed >= 0 && inp.maxSpeed < maxV) maxV = inp.maxSpeed;
    s.maxSpeed = maxV;

    // the speed along the velocity heading: thrust, brake and friction on the ground, held in the air
    let v = s.speed;
    const airborne = s.airborne;
    if (!airborne) {
      if (brake > 0.05) v = Math.max(0, v - K_BRAKE * brake * dt);
      else if (throttle > 0.05) { if (v < maxV) v = Math.min(maxV, v + K_ACCEL * (boosting ? K_BOOST_ACCEL : 1) * throttle * dt); }
      else if (v > 0) v = Math.max(0, v - K_FRICTION * dt);
      if (v > maxV) v = Math.max(maxV, v - K_BRAKE * dt);
    } else if (throttle > 0.05 && boosting && v < maxV) {
      // a boost in the air still pushes a little, the rest of the velocity holds
      v = Math.min(maxV, v + K_ACCEL * 0.25 * throttle * dt);
    }
    if (v < 0) v = 0;
    const sp = Math.min(1, v / K_TOP);

    // the heading: the board yaws with the steer, faster at speed; the velocity heading follows with a grip
    const yawRate = airborne ? K_AIR_YAW : K_YAW_LOW + (K_YAW_HIGH - K_YAW_LOW) * sp;
    let yaw = s.yaw + steerIn * yawRate * dt;
    if (!fin(yaw)) yaw = s.yaw;
    s.yaw = wrap(yaw);
    let dir = s.dir;
    if (!airborne) {
      if (v < K_PIVOT_SPEED) dir = s.yaw;
      else {
        const grip = K_GRIP_LOW + (K_GRIP_HIGH - K_GRIP_LOW) * sp;
        const d = wrap(s.yaw - dir);
        const g = grip * dt;
        dir = wrap(dir + Math.min(g, Math.max(-g, d)));
        const d2 = wrap(s.yaw - dir);
        if (d2 > K_DRIFT_MAX) dir = wrap(s.yaw - K_DRIFT_MAX);
        else if (d2 < -K_DRIFT_MAX) dir = wrap(s.yaw + K_DRIFT_MAX);
      }
    }
    if (!fin(dir)) dir = s.yaw;
    s.dir = dir;
    const drift = wrap(s.yaw - dir);
    s.drift = drift;
    // the eased steer and the lean (the scooter sign: a positive steer rolls the top toward +x)
    const kEase = 1 - Math.exp(-K_LEAN_RATE * dt);
    s.steer += (steerIn - s.steer) * kEase;
    const leanTarget = Math.min(K_LEAN_MAX, Math.max(-K_LEAN_MAX, -(K_LEAN_K * drift + K_LEAN_STEER * steerIn * sp)));
    s.lean += (leanTarget - s.lean) * kEase;

    // the move along the velocity heading with the four point slide
    const hx = Math.sin(dir), hz = Math.cos(dir);
    const px = s.x, pz = s.z;
    const nx = px + hx * v * dt, nz = pz + hz * v * dt;
    if (v > 0 && (nx !== px || nz !== pz)) {
      const ax0 = Math.floor(px - R) | 0, ax1 = Math.floor(px + R) | 0, az0 = Math.floor(pz - R) | 0, az1 = Math.floor(pz + R) | 0;
      const bx0 = Math.floor(nx - R) | 0, bx1 = Math.floor(nx + R) | 0, bz0 = Math.floor(nz - R) | 0, bz1 = Math.floor(nz + R) | 0;
      if (tilesOnly ? fin(nx) && fin(nz) && cornersOpen(bx0, bz0, bx1, bz1) : fits(nx, nz, s.y)) { s.x = nx; s.z = nz; }
      else {
        s.bumped = true;
        let movedX = false;
        if (tilesOnly ? fin(nx) && cornersOpen(bx0, az0, bx1, az1) : fits(nx, pz, s.y)) { s.x = nx; movedX = true; }
        if (tilesOnly ? fin(nz) && (movedX ? cornersOpen(bx0, bz0, bx1, bz1) : cornersOpen(ax0, bz0, ax1, bz1)) : fits(s.x, nz, s.y)) s.z = nz;
        const wx = nx - px, wz = nz - pz, gx = s.x - px, gz = s.z - pz;
        const want = Math.sqrt(wx * wx + wz * wz), got = Math.sqrt(gx * gx + gz * gz);
        v *= want > 1e-9 ? Math.min(1, Math.max(0, got / want)) : 0;
        if (v < 0.05) v = 0;
        // a bumped board on the ground points where it is going again a little faster
        if (!airborne && got > 1e-9) { s.dir = Math.atan2(gx, gz); s.drift = wrap(s.yaw - s.dir); }
      }
    }
    if (!fin(s.x) || !fin(s.z)) { s.x = px; s.z = pz; v = 0; }

    // the height: follow the surface on the ground, fly when it drops away, fall and land in the air
    const h = surfaceAt(s.x, s.z);
    s.surface = h;
    const target = h + K_HEIGHT;
    if (!s.airborne && jumpIn) {
      // the ollie: straight up at JUMP_VY, then the floaty fall and landing below
      s.airborne = true; s.launched = true; s.bounced = false; s.airTime = 0; s.apex = s.y;
      s.vy = K_JUMP_VY; s.jumps = (s.jumps | 0) + 1;
    }
    if (!s.airborne) {
      if (target >= s.y) {
        const climb = (target - s.y) / dt;
        s.vy = Math.min(K_LAUNCH_VY, climb);
        s.y = target;
      } else {
        const drop = s.y - target;
        if (drop <= K_FOLLOW * dt) { s.y = target; s.vy = -drop / dt; }
        else {
          // the ground fell away faster than the board can follow: airborne with its velocity
          s.airborne = true; s.launched = true; s.bounced = false;
          s.airTime = 0; s.apex = s.y;
          s.vy = Math.min(K_LAUNCH_VY, Math.max(-K_FOLLOW, s.vy));
          s.y += s.vy * dt;
          if (s.y > s.apex) s.apex = s.y;
          if (s.y <= target) { s.y = target; s.airborne = false; s.vy = 0; }
        }
      }
    } else {
      s.airTime += dt;
      let g = K_GRAVITY - K_GLIDE * sp * sp;
      if (boosting) g -= K_LIFT;
      s.vy -= g * dt;
      if (s.vy < -K_MAX_FALL) s.vy = -K_MAX_FALL;
      s.y += s.vy * dt;
      if (s.y > s.apex) s.apex = s.y;
      if (s.y <= target) {
        const dropH = s.apex - target;
        s.y = target; s.landed = true; s.drop = dropH;
        if (dropH > K_SOFT_DROP && !s.bounced && K_BOUNCE_K > 0) {
          // a hard landing: one bounce, the speed scrubbed, the second touch is soft
          s.bounced = true; s.bounce = true;
          s.vy = Math.min(K_BOUNCE_MAX, K_BOUNCE_K * Math.abs(s.vy));
          s.apex = s.y + s.vy * dt;
          s.y = s.apex;
          v *= K_LAND_SCRUB;
          s.dip = K_DIP;
        } else {
          s.airborne = false; s.bounced = false; s.vy = 0;
          s.dip = K_DIP * Math.min(1, 0.4 + dropH / (K_SOFT_DROP > 0 ? K_SOFT_DROP : 1));
          if (dropH > K_SOFT_DROP) v *= K_LAND_SCRUB;
        }
      }
    }
    if (!fin(s.y)) { s.y = target; s.vy = 0; s.airborne = false; }
    if (!fin(s.vy)) s.vy = 0;
    // the dip eases out
    s.dip -= s.dip * Math.min(1, K_DIP_RATE * dt);
    if (s.dip < 0.0005) s.dip = 0;
    s.speed = fin(v) ? v : 0;
    return s;
  }

  return { drives: true, hovers: true, radius: R, numbers: N, step, fits, surfaceAt, maxSpeedAt };
}

/* =====================================================================================
   Version 11 (docs/CONTRACT_V11.md "Boats"): the rowboat and the launch, the wake, the boat
   controller and the dock helpers. See the header for the shapes.
   ===================================================================================== */
export const BOAT = {
  REVERSE: 3, ACCEL: 4, BRAKE: 5, CAP_BRAKE: 8, DRAG: 0.9, DRAG_Q: 0.04, TURN_FAST: 1.2, TURN_SLOW: 0.5,   // v11.1: faster boats
  RADIUS: 0.5, SLOW_SPEED: 3, DOCK_RANGE: 2, WEIR_EASE: 1.5, WAKE_SPEED: 0.8, TILLER_VIS: 0.6,
  STEER_RATE: 5, SCRUB_RATE: 8, MAX_DT: 0.1, BOB_RATE: 6, WAKE_LEN: 4.5, WAKE_FADE: 4,
  rowboat: { TOP_SPEED: 6, LENGTH: 2.3, BEAM: 1.05, SEAT: { x: 0, y: 0.1, z: -0.45 }, TILLER: { x: 0.3, y: 0.3, z: -0.1 } },
  launch: { TOP_SPEED: 9, LENGTH: 3.0, BEAM: 1.3, SEAT: { x: 0, y: 0.14, z: -0.55 }, TILLER: { x: 0.12, y: 0.52, z: -0.95 } },
};

const BT = { cream: '#F3EFE6', wood: '#8A6A55', woodDark: '#5E4538', rail: '#D9DEE3', glass: '#A9D8E6', iron: C.iron, white: '#FFFFFF' };

/* Shared boat geometries by kind (local space, the bow at +z, the water line at y = 0). */
const boatGeo = { rowboat: null, launch: null };
function boatGeometries(kind) {
  if (boatGeo[kind]) return boatGeo[kind];
  const K = BOAT[kind], L = K.LENGTH, W = K.BEAM;
  const row = kind === 'rowboat';
  const depth = row ? 0.34 : 0.5, draft = row ? 0.14 : 0.2, bowLen = row ? 0.75 : 0.95, midLen = L - bowLen;
  const bottom = new THREE.BoxGeometry(W - 0.14, 0.08, midLen); bottom.translate(0, -draft, -bowLen / 2);
  const side = new THREE.BoxGeometry(0.06, depth, midLen); side.translate(0, depth / 2 - draft, -bowLen / 2);
  const bowSide = new THREE.BoxGeometry(0.06, depth, Math.sqrt(bowLen * bowLen + (W / 2) * (W / 2))); bowSide.translate(0, depth / 2 - draft, 0);
  const bowFloor = new THREE.BufferGeometry();
  // the bow floor: a triangle from the mid section's front edge to the stem
  const hw = (W - 0.14) / 2, zf = -0.0, zs = bowLen;
  const verts = new Float32Array([-hw, -draft, zf, hw, -draft, zf, 0, -draft, zs, -hw, -draft - 0.08, zf, 0, -draft - 0.08, zs, hw, -draft - 0.08, zf]);
  bowFloor.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  bowFloor.computeVertexNormals();
  const transom = new THREE.BoxGeometry(W - 0.1, depth, 0.06); transom.translate(0, depth / 2 - draft, -L + bowLen + 0.03);
  const gunwale = new THREE.BoxGeometry(0.09, 0.04, midLen + 0.02); gunwale.translate(0, depth - draft, -bowLen / 2);
  const thwart = new THREE.BoxGeometry(W - 0.2, 0.05, 0.22);
  const oar = new THREE.CylinderGeometry(0.018, 0.022, 2.0, 8); oar.translate(0, 1.0, 0);
  const blade = new THREE.BoxGeometry(0.1, 0.4, 0.02); blade.translate(0, 1.85, 0);
  const foredeck = new THREE.BoxGeometry(W - 0.1, 0.04, bowLen * 0.75); foredeck.translate(0, depth - draft - 0.02, bowLen * 0.5);
  const screen = new THREE.BoxGeometry(W - 0.4, 0.26, 0.025); screen.translate(0, 0.13, 0);
  const bench = new THREE.BoxGeometry(W - 0.4, 0.1, 0.42);
  const motor = new THREE.BoxGeometry(0.26, 0.36, 0.22); motor.translate(0, 0.18, 0);
  const motorLeg = new THREE.BoxGeometry(0.08, 0.5, 0.12); motorLeg.translate(0, -0.25, 0);
  const tillerArm = new THREE.CylinderGeometry(0.014, 0.014, 0.55, 8); tillerArm.translate(0, 0.275, 0);
  const stripe = new THREE.BoxGeometry(0.012, 0.07, midLen - 0.1); stripe.translate(0, depth - draft - 0.12, -bowLen / 2);
  const cleat = new THREE.BoxGeometry(0.12, 0.04, 0.04);
  const ripple = new THREE.PlaneGeometry(1.0, 0.7);
  const wash = new THREE.PlaneGeometry(1.0, 0.6);
  boatGeo[kind] = { bottom, side, bowSide, bowFloor, transom, gunwale, thwart, oar, blade, foredeck, screen, bench, motor, motorLeg, tillerArm, stripe, cleat, ripple, wash, depth, draft, bowLen, midLen };
  return boatGeo[kind];
}

/* A fresh translucent white material for a wake plane (its opacity animates per boat). */
function wakeMaterial(opacity) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(BT.white), roughness: 0.9, emissive: new THREE.Color(BT.white), emissiveIntensity: 0.25, transparent: true, opacity, depthWrite: false });
  return m;
}

export function makeBoat(ctx, kind) {
  ctx = ctx || {};
  kind = kind === 'rowboat' ? 'rowboat' : 'launch';
  const row = kind === 'rowboat';
  const G = boatGeometries(kind);
  const K = BOAT[kind], W = K.BEAM, L = K.LENGTH;
  const M = {
    hull: mat(ctx.color || (row ? BT.cream : BRAND.navy), { roughness: row ? 0.8 : 0.45, metalness: row ? 0 : 0.15 }),
    trim: mat(ctx.trim || (row ? BRAND.aqua : BT.rail), { roughness: 0.5, metalness: row ? 0 : 0.3 }),
    wood: mat(BT.wood, { roughness: 0.85 }),
    woodDark: mat(BT.woodDark, { roughness: 0.9 }),
    iron: mat(BT.iron, { roughness: 0.55, metalness: 0.2 }),
    glass: mat(BT.glass, { roughness: 0.25, metalness: 0.1, opacity: 0.4 }),
    stripe: mat(BRAND.salmon, { roughness: 0.6 }),
    seat: mat(BRAND.silver, { roughness: 0.9 }),
  };
  const group = new THREE.Group();
  group.name = kind;
  const hull = new THREE.Group();
  hull.name = 'hull';
  group.add(hull);

  // the hull: a flat bottom, two sides flared out a little, two bow boards meeting at the stem, a transom
  sMesh(G.bottom, row ? M.wood : M.hull, hull);
  const bowFloor = sMesh(G.bowFloor, row ? M.wood : M.hull, hull);
  bowFloor.material = (row ? M.wood : M.hull);
  const flare = row ? 0.16 : 0.1;
  for (const sx of [-1, 1]) {
    const side = sMesh(G.side, M.hull, hull, sx * (W / 2 - 0.03), 0, 0);
    side.rotation.z = -sx * flare;
    const half = Math.sqrt(G.bowLen * G.bowLen + (W / 2) * (W / 2)) / 2;
    const ang = Math.atan2(W / 2, G.bowLen);
    const bs = sMesh(G.bowSide, M.hull, hull, sx * (W / 4 - 0.015), 0, half * Math.cos(ang));
    bs.rotation.y = sx * ang;
    bs.rotation.z = -sx * flare;
    sMesh(G.gunwale, M.trim, hull, sx * (W / 2 - 0.03), 0, 0, false);
    if (!row) sMesh(G.stripe, M.stripe, hull, sx * (W / 2 + 0.01), 0, 0, false);
  }
  sMesh(G.transom, M.hull, hull);
  const parts = { hull, seats: [], wake: null };
  const seats = parts.seats;
  if (row) {
    // two thwarts and the stern seat, the oars shipped in their oarlocks
    for (const z of [0.25, -0.45]) seats.push(sMesh(G.thwart, M.woodDark, hull, 0, G.depth - G.draft - 0.12, z, false));
    seats.push(sMesh(G.thwart, M.woodDark, hull, 0, G.depth - G.draft - 0.12, -L + G.bowLen + 0.2, false));
    const oars = [];
    for (const sx of [-1, 1]) {
      const lock = new THREE.Group();
      lock.position.set(sx * (W / 2 - 0.02), G.depth - G.draft + 0.03, 0.0);
      hull.add(lock);
      const oar = new THREE.Group();
      oar.rotation.z = sx * 1.25;   // the handle inboard, the blade out over the water
      oar.rotation.x = 0.1;
      lock.add(oar);
      sMesh(G.oar, M.wood, oar, 0, -0.55, 0, false);
      sMesh(G.blade, M.woodDark, oar, 0, -0.55, 0, false);
      oar.userData.side = sx;
      oars.push(oar);
    }
    parts.oars = oars;
  } else {
    // a foredeck with a windscreen, a bench seat, a cleat, and an outboard with a tiller at the stern
    sMesh(G.foredeck, M.hull, hull, 0, 0, 0, false);
    const screen = sMesh(G.screen, M.glass, hull, 0, G.depth - G.draft, G.bowLen * 0.2, false);
    screen.rotation.x = -0.3;
    seats.push(sMesh(G.bench, M.seat, hull, 0, G.depth - G.draft - 0.3, K.SEAT.z, false));
    sMesh(G.cleat, M.trim, hull, 0, G.depth - G.draft + 0.02, G.bowLen * 0.6, false);
    const motor = new THREE.Group();
    motor.name = 'motor';
    motor.position.set(0, G.depth - G.draft - 0.05, -L + G.bowLen - 0.12);
    hull.add(motor);
    sMesh(G.motor, M.iron, motor, 0, 0, 0, false);
    sMesh(G.motorLeg, M.iron, motor, 0, 0, -0.02, false);
    const tiller = new THREE.Group();
    tiller.name = 'tiller';
    tiller.position.set(0, 0.3, 0.1);
    tiller.rotation.x = Math.PI / 2 - 0.25;   // the arm points forward over the bench, a little up
    motor.add(tiller);
    sMesh(G.tillerArm, M.iron, tiller, 0, 0, 0, false);
    parts.motor = motor;
    parts.tiller = tiller;
  }

  // the wake, pooled with the boat: two ripple planes and the stern wash behind the transom
  const wake = new THREE.Group();
  wake.name = 'wake';
  group.add(wake);
  const sternZ = -L + G.bowLen;
  const mats = [wakeMaterial(0), wakeMaterial(0), wakeMaterial(0)];
  const ripples = [];
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(G.ripple, mats[i]);
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, 0.015, sternZ - 0.6);
    r.castShadow = false; r.receiveShadow = false;
    wake.add(r);
    ripples.push(r);
  }
  const washMesh = new THREE.Mesh(G.wash, mats[2]);
  washMesh.rotation.x = -Math.PI / 2;
  washMesh.position.set(0, 0.02, sternZ - 0.25);
  washMesh.castShadow = false; washMesh.receiveShadow = false;
  wake.add(washMesh);
  parts.wake = { group: wake, ripples, wash: washMesh, mats, sternZ };

  const boat = {
    group, hull, kind, parts,
    time: 0, wakePhase: 0, wakeLevel: 0, steer: 0, pitch: 0, roll: 0, oarPhase: 0,
    animate(b, speed, dt, wakeOn) { animateBoat(b || boat, speed, dt, wakeOn); },
  };
  return boat;
}

/* The bob, the pitch with speed, the oars or the tiller, and the wake (see the header). Allocation free. */
export function animateBoat(boat, speed, dt, wakeOn) {
  if (!boat || !boat.parts) return;
  if (!(dt > 0)) dt = 0;
  if (!fin(speed)) speed = 0;
  const K = BOAT[boat.kind] || BOAT.launch;
  const top = K.TOP_SPEED;
  let t = (fin(boat.time) ? boat.time : 0) + dt;
  if (t > 1000) t -= 1000;
  boat.time = t;
  const av = Math.abs(speed);
  const sp = Math.min(1, av / top);
  const k = 1 - Math.exp(-BOAT.BOB_RATE * dt);
  // the hull: a slow bob at rest, the bow lifting with speed
  const pitchTarget = -(boat.kind === 'launch' ? 0.08 : 0.04) * sp + 0.012 * Math.sin(t * 1.3);
  const rollTarget = 0.02 * Math.sin(t * 0.9) - (fin(boat.steer) ? boat.steer : 0) * 0.08 * sp;
  boat.pitch = (fin(boat.pitch) ? boat.pitch : 0) + (pitchTarget - (fin(boat.pitch) ? boat.pitch : 0)) * k;
  boat.roll = (fin(boat.roll) ? boat.roll : 0) + (rollTarget - (fin(boat.roll) ? boat.roll : 0)) * k;
  boat.hull.rotation.x = boat.pitch;
  boat.hull.rotation.z = boat.roll;
  boat.hull.position.y = 0.01 * Math.sin(t * 1.7);
  const P = boat.parts;
  if (P.oars) {
    // the oars stroke with the speed and rest shipped when the boat stops
    const stroke = av > 0.2 ? 1.2 + 1.3 * sp : 0;
    boat.oarPhase = ((fin(boat.oarPhase) ? boat.oarPhase : 0) + stroke * dt) % TAU;
    const ph = boat.oarPhase;
    const sweep = av > 0.2 ? 0.45 * Math.sin(ph) : 0;
    const dipA = av > 0.2 ? 0.18 * Math.max(0, Math.cos(ph)) : 0;
    for (let i = 0; i < P.oars.length; i++) {
      const o = P.oars[i], sx = o.userData.side;
      o.rotation.y = sx * sweep;
      o.rotation.z = sx * (1.25 - dipA);
    }
  }
  if (P.tiller) {
    const st = clamp(fin(boat.steer) ? boat.steer : 0, -BOAT.TILLER_VIS, BOAT.TILLER_VIS);
    P.motor.rotation.y = -st;
  }
  // the wake: the ripples recede, widen and fade in a cycle driven by the speed; off in the slow zone
  const Wk = P.wake;
  if (Wk) {
    const on = wakeOn !== false && av > BOAT.WAKE_SPEED;
    const levelTarget = on ? Math.min(1, (av - BOAT.WAKE_SPEED) / (top * 0.5)) : 0;
    const kw = 1 - Math.exp(-BOAT.WAKE_FADE * dt);
    let lvl = (fin(boat.wakeLevel) ? boat.wakeLevel : 0);
    lvl += (levelTarget - lvl) * kw;
    boat.wakeLevel = lvl;
    boat.wakePhase = ((fin(boat.wakePhase) ? boat.wakePhase : 0) + (av / BOAT.WAKE_LEN) * dt) % 1;
    for (let i = 0; i < Wk.ripples.length; i++) {
      let ph = boat.wakePhase + i * 0.5; if (ph >= 1) ph -= 1;
      const r = Wk.ripples[i];
      r.position.z = Wk.sternZ - 0.5 - ph * BOAT.WAKE_LEN;
      r.scale.x = (0.7 + ph * 1.8) * (0.8 + 0.4 * sp);
      r.scale.y = 0.6 + ph * 0.7;
      Wk.mats[i].opacity = (1 - ph) * 0.45 * lvl;
    }
    Wk.wash.scale.x = 0.8 + 0.4 * sp;
    Wk.wash.scale.y = 0.8 + 0.5 * sp;
    Wk.mats[2].opacity = 0.55 * lvl;
    Wk.group.visible = lvl > 0.01;
  }
}

/* The distance from the boat's center to a dock's slip center (the dock tile when it has no slip). */
export function dockDistance(s, dock) {
  if (!s || !dock) return Infinity;
  const tile = dock.slip && fin(dock.slip.x) && fin(dock.slip.y) ? dock.slip : dock;
  if (!fin(tile.x) || !fin(tile.y)) return Infinity;
  const dx = tile.x + 0.5 - s.x, dz = tile.y + 0.5 - s.z;
  return Math.sqrt(dx * dx + dz * dz);
}
/* Moors the boat in the dock's slip: the slip center, the dock's yaw, stopped. */
export function moorAt(s, dock) {
  if (!s || !dock) return s;
  const tile = dock.slip && fin(dock.slip.x) && fin(dock.slip.y) ? dock.slip : dock;
  if (fin(tile.x) && fin(tile.y)) { s.x = tile.x + 0.5; s.z = tile.y + 0.5; }
  if (fin(dock.yaw)) s.yaw = dock.yaw;
  else if (fin(dock.rot)) s.yaw = dock.rot * Math.PI / 180;
  s.speed = 0; s.steer = 0; s.wake = false;
  return s;
}
/* The nearest dock within range (default BOAT.DOCK_RANGE), free ones only when freeOnly; null when none. */
export function nearestDock(s, docks, range, freeOnly) {
  if (!s || !docks) return null;
  const lim = fin(range) && range > 0 ? range : BOAT.DOCK_RANGE;
  let best = null, bestD = lim;
  for (let i = 0; i < docks.length; i++) {
    const d = docks[i];
    if (!d) continue;
    if (freeOnly && d.boat !== null && d.boat !== undefined) continue;
    const dist = dockDistance(s, d);
    if (dist <= bestD) { bestD = dist; best = d; }
  }
  return best;
}

export function createBoatController(opts) {
  const env = (opts && opts.env) || opts || {};
  const N = BOAT;
  const kind = env.kind === 'rowboat' ? 'rowboat' : 'launch';
  const KK = N[kind];
  const num = (v, d) => (fin(v) && v > 0 ? v : d);
  const nonneg = (v, d) => (fin(v) && v >= 0 ? v : d);
  const fn = f => (typeof f === 'function' ? f : null);
  const K_TOP = num(env.topSpeed, KK.TOP_SPEED), K_REVERSE = nonneg(env.reverse, N.REVERSE);
  const K_ACCEL = num(env.accel, N.ACCEL), K_BRAKE = num(env.brake, N.BRAKE), K_CAP_BRAKE = num(env.capBrake, N.CAP_BRAKE);
  const K_DRAG = nonneg(env.drag, N.DRAG), K_DRAG_Q = nonneg(env.dragQ, N.DRAG_Q), K_SCRUB = nonneg(env.scrubRate, N.SCRUB_RATE);
  const K_TURN_FAST = nonneg(env.turnFast, N.TURN_FAST), K_TURN_SLOW = nonneg(env.turnSlow, N.TURN_SLOW);
  const K_SLOW = num(env.slowSpeed, N.SLOW_SPEED), K_DOCK = num(env.dockRange, N.DOCK_RANGE);
  const K_WEIR = num(env.weirEase, N.WEIR_EASE), K_WAKE = nonneg(env.wakeSpeed, N.WAKE_SPEED);
  const K_STEER_RATE = num(env.steerRate, N.STEER_RATE), K_MAX_DT = N.MAX_DT;
  const R = num(env.radius, N.RADIUS);
  const T = env.TILES || env.tiles || DEFAULT_TILES;
  const at = fn(env.at);
  const userWater = fn(env.waterAt), userSlow = fn(env.slowAt), userBlocked = fn(env.blockedAt);
  const userFits = fn(env.fits), userMax = fn(env.maxSpeedAt), surfaceFn = fn(env.surfaceAt);

  function pointOK(x, z) {
    if (userBlocked && userBlocked(x, z)) return false;
    if (userWater) return !!userWater(x, z);
    if (at) return at(Math.floor(x) | 0, Math.floor(z) | 0) === T.WA;
    return true;
  }
  function fits(x, z) {
    if (!fin(x) || !fin(z)) return false;
    if (userFits) return !!userFits(x, z);
    return pointOK(x - R, z - R) && pointOK(x + R, z - R) && pointOK(x - R, z + R) && pointOK(x + R, z + R);
  }
  // the default tile path takes the corner tiles as int32 so no double crosses a call
  const tilesOnly = !userFits && !userWater && !userBlocked && !!at;
  const cornersOpen = (ix0, iz0, ix1, iz1) => at(ix0, iz0) === T.WA && at(ix1, iz0) === T.WA && at(ix0, iz1) === T.WA && at(ix1, iz1) === T.WA;
  function maxSpeedAt(x, z) {
    let v = K_TOP;
    if (userSlow && userSlow(x, z) && K_SLOW < v) v = K_SLOW;
    if (userMax) { const u = userMax(x, z); if (fin(u) && u >= 0 && u < v) v = u; }
    return v;
  }
  function canDock(s, dock) {
    if (!s || !dock) return false;
    if (dock.boat !== null && dock.boat !== undefined) return false;
    return dockDistance(s, dock) <= K_DOCK;
  }
  const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

  function step(s, input, dt) {
    if (!s) return s;
    if (!fin(s.x)) s.x = 0;
    if (!fin(s.z)) s.z = 0;
    if (!fin(s.yaw)) s.yaw = 0;
    if (!fin(s.speed)) s.speed = 0;
    if (!fin(s.steer)) s.steer = 0;
    s.bumped = false;
    const slow = !!(userSlow && userSlow(s.x, s.z));
    s.slow = slow;
    if (!(dt > 0)) { s.maxSpeed = maxSpeedAt(s.x, s.z); s.wake = false; return s; }
    if (dt > K_MAX_DT) dt = K_MAX_DT;
    const inp = input || null;
    const throttle = inp && fin(inp.throttle) ? Math.min(1, Math.max(-1, inp.throttle)) : 0;
    const brake = inp && fin(inp.brake) ? Math.min(1, Math.max(0, inp.brake)) : 0;
    const steerIn = inp && fin(inp.steer) ? Math.min(1, Math.max(-1, inp.steer)) : 0;

    let maxF = K_TOP;
    if (slow && K_SLOW < maxF) maxF = K_SLOW;
    if (userMax) { const u = userMax(s.x, s.z); if (fin(u) && u >= 0 && u < maxF) maxF = u; }
    if (inp && fin(inp.maxSpeed) && inp.maxSpeed >= 0 && inp.maxSpeed < maxF) maxF = inp.maxSpeed;
    s.maxSpeed = maxF;
    const maxR = Math.min(K_REVERSE, maxF);

    // the speed: ahead on W, braking then astern on S, else the drag (momentum)
    let v = s.speed;
    if (brake > 0.05) {
      v = v > 0 ? Math.max(0, v - K_BRAKE * brake * dt) : Math.min(0, v + K_BRAKE * brake * dt);
    } else if (throttle > 0.05) {
      if (v < 0) v = Math.min(0, v + K_BRAKE * throttle * dt);
      else if (v < maxF) v = Math.min(maxF, v + K_ACCEL * throttle * dt);
    } else if (throttle < -0.05) {
      const th = -throttle;
      if (v > 0) v = Math.max(0, v - K_BRAKE * th * dt);
      else if (v > -maxR) v = Math.max(-maxR, v - K_ACCEL * th * dt);
    } else if (v !== 0) {
      const d = (K_DRAG + K_DRAG_Q * Math.abs(v)) * dt;
      v = v > 0 ? Math.max(0, v - d) : Math.min(0, v + d);
    }
    // over the cap (entering the slow zone at speed): eased down at CAP_BRAKE, about 1.7 tiles from 6 to 3
    if (v > maxF) v = Math.max(maxF, v - K_CAP_BRAKE * dt);
    if (v < -maxR) v = Math.min(-maxR, v + K_CAP_BRAKE * dt);
    if (!fin(v)) v = 0;

    // the turn: a rate that rises with the speed, the yaw grows with a positive steer
    const sp = Math.min(1, Math.abs(v) / K_TOP);
    const rate = K_TURN_SLOW + (K_TURN_FAST - K_TURN_SLOW) * sp;
    let yaw = s.yaw + steerIn * rate * dt;
    if (!fin(yaw)) yaw = s.yaw;
    s.yaw = wrap(yaw);
    const ks = Math.min(1, K_STEER_RATE * dt);
    s.steer += (steerIn * N.TILLER_VIS - s.steer) * ks;

    // the move with the four point slide against the banks
    const hx = Math.sin(s.yaw), hz = Math.cos(s.yaw);
    const px = s.x, pz = s.z;
    const nx = px + hx * v * dt, nz = pz + hz * v * dt;
    if (v !== 0 && (nx !== px || nz !== pz)) {
      const ax0 = Math.floor(px - R) | 0, ax1 = Math.floor(px + R) | 0, az0 = Math.floor(pz - R) | 0, az1 = Math.floor(pz + R) | 0;
      const bx0 = Math.floor(nx - R) | 0, bx1 = Math.floor(nx + R) | 0, bz0 = Math.floor(nz - R) | 0, bz1 = Math.floor(nz + R) | 0;
      if (tilesOnly ? fin(nx) && fin(nz) && cornersOpen(bx0, bz0, bx1, bz1) : fits(nx, nz)) { s.x = nx; s.z = nz; }
      else {
        s.bumped = true;
        let movedX = false;
        if (tilesOnly ? fin(nx) && cornersOpen(bx0, az0, bx1, az1) : fits(nx, pz)) { s.x = nx; movedX = true; }
        if (tilesOnly ? fin(nz) && (movedX ? cornersOpen(bx0, bz0, bx1, bz1) : cornersOpen(ax0, bz0, ax1, bz1)) : fits(s.x, nz)) s.z = nz;
        const wx = nx - px, wz = nz - pz, gx = s.x - px, gz = s.z - pz;
        const want = Math.sqrt(wx * wx + wz * wz), got = Math.sqrt(gx * gx + gz * gz);
        /* The hull scrubs what it lost against the bank at SCRUB_RATE per second (not per step, so
           a boat nosing along a bank at an angle keeps its momentum for a moment); a dead stop
           into the bank stops it. */
        const kept = want > 1e-9 ? Math.min(1, Math.max(0, got / want)) : 0;
        v *= kept <= 1e-6 ? 0 : 1 - (1 - kept) * Math.min(1, K_SCRUB * dt);
        if (Math.abs(v) < 0.05) v = 0;
      }
    }
    if (!fin(s.x) || !fin(s.z)) { s.x = px; s.z = pz; v = 0; }
    s.speed = fin(v) ? v : 0;
    s.wake = !slow && Math.abs(s.speed) > K_WAKE;

    // the height: the water surface, eased between two levels over about WEIR_EASE tiles at a weir
    if (surfaceFn) {
      const h = surfaceFn(s.x, s.z);
      const target = fin(h) ? h : (fin(s.y) ? s.y : 0);
      s.surface = target;
      if (!fin(s.y)) s.y = target;
      else {
        const rate = Math.max(0.5, Math.abs(s.speed)) / K_WEIR;
        s.y += (target - s.y) * (1 - Math.exp(-rate * dt));
        if (Math.abs(target - s.y) < 0.002) s.y = target;
      }
    } else if (!fin(s.y)) s.y = 0;
    return s;
  }

  return { drives: true, floats: true, kind, radius: R, numbers: N, step, canDock, dockDistance, fits, maxSpeedAt };
}
