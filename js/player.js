/* Thread Town walk mode: the player character, version 2 (docs/CONTRACT_V5.md "Player v2" on top
   of docs/CONTRACT_V4.md "The player object" and "js/player.js"). Movement and collision on the
   sim grid, swimming and diving off the pier, the ladder climb, hops, seats, the cafe counter,
   department stations with a camera that follows the handle and an eased walk-out, talking to
   agents, building visits, department interiors behind every front door, the golf controller,
   prompt computation and the chase camera pose.

   Version 7 (docs/CONTRACT_V7.md "Player"): third person only. view is always 'chase', the V key
   (input.toggleView) switches the chase distance between the near (4.2) and far (6.5) presets,
   movement is camera relative, the spawn comes from state.spawn (the plan's plaza tile), golf
   uses holes.length everywhere, and every lot field (doorTile, doorTile2, doorPos, workTile,
   workPos, station) is read from the sim records in world tile coordinates after rotation, so
   nothing here assumes a door stub runs south or a station sits south of its building. The
   walkable tiles gain the city tiles SW, CW, PK and BR when the sim defines them.

   The player is shaped like an agent so animateAlien / animateAnimal, animateLeisure and
   swimOffsets read it unchanged: state, pose, leisure, moveDir, speed, animT, yoff, onBoard,
   jumpT, splash, blinkAt, lookAt, paused. Coordinates are sim tile units: pos.x is world x,
   pos.y is world z, one tile is one unit, yaw 0 faces +z (south), yaw Math.PI faces north.

   Fields read by the renderer: view (always 'chase'), yaw (the body yaw), bodyYaw (what the rig
   should face in every case), targetYaw, orbitYaw, orbitPitch, orbitDist, fovTarget, fov (a mild
   ease when running), anchorPos (written by the renderer while at a station), exiting, interior,
   floorY, fade, fadeT, golf, followBall, lastCard ({ card, total, par, seconds, complete }).
   golf.roundT0 and golf.roundSeconds time a round from the first charge on hole 1 to 'done' for
   the v6 leaderboard. See debugState() for the compact snapshot.

   Version 8 (docs/CONTRACT_V8.md "The round and the cart", docs/TERRAIN_DESIGN.md "Cart driving
   feel"): the round and the cart.
   - The clubhouse door zone (state.clubhouse doorTile, doorTile2) prompts 'E  Start a round'. A
     round is golf.mode 'round' with golf.round = { startedAt, card, strokes }: holes 1 to the last in
     order, the card on golf.card, the per-hole strokes on golf.strokes and the running total on
     golf.round.strokes. Tees prompt 'E  Tee off (round)' for the current hole only; the others
     read 'Play holes in order' (prompt key ''). Outside a round a tee prompts 'E  Practice hole
     <n>' (mode 'hole', one hole, never recorded; 'E  Play again' replays it).
   - golf.phase outside the swing phases: 'between' (the next tee is active), 'ready' (the ball
     rests in play after a long shot; 'E  Play the ball' within 1.6 of it, or auto-walk when it
     lies within 5), 'done' (the round summary) and 'finished' (practice hole holed). player.golf
     stays set for the whole round, in every player state, so the HUD can draw the card from it:
     mode, hole, par, strokes, card, club, cartHint, message, round, roundResult.
   - golf.roundResult is written once when the last hole is holed (the renderer records it; v10
     adds holes, par, term, course); player.lastCard mirrors it. Abandoning (X twice within 4 s)
     and practice write nothing.
   - The cart: player.cart = { x, z, y, yaw, speed, steer, occupied, auto } (y is the terrain
     height under it when ctx.terrain is given). state 'cart' while seated: W S throttle and
     brake (input.fwd), A D steer (input.side, positive right), E out, Tab (input.drive or
     input.tab) auto-drives to the ball, the next tee's park spot or the clubhouse. On foot 'E  Get
     in the cart' within 1.2 of it. The driving model lives here (bicycle model, speeds by tile,
     four point test at radius 0.45, the links region: the golf area polygon plus the clubhouse lot
     and the links parking lot); ctx.vehicles.createCartController is an optional step hook
     reserved for a future module (js/vehicles.js holds the cart model only and does not export
     it; see makeCartController); when supplied its output is validated and otherwise ignored.
   - After the last hole: 'Round: <total> (<to par>). <term>', then 'E  Back to the clubhouse' (the cart
     fetches the player if needed, drives home and parks on the clubhouse stub) or 'X  Done'.

   Version 9 (docs/CONTRACT_V9.md "The visitor riding"): scooters.
   - On foot near a rack holding a scooter, or a free scooter within 1.6 (state.scooters with no
     rider): 'E  Grab a scooter'. E calls TT.sim.takeScooter(id, 'player') and enters state
     'scooter' (pose 'ride'). player.scooter = { id, x, z, y, yaw, speed, steer, lean, hint } while
     riding, null on foot; the sim record (state.scooters, x and y) follows the rider every frame.
     steer uses the cart's sign (positive toward local +x, the left, the yaw grows with it) and lean
     is the roll the renderer gives the deck (the cart chassis sign: -k * steer * speed, at most
     0.22 rad). y is the terrain height under the scooter when ctx.terrain is given; the body
     stands on the deck at heightOffset 0.12.
   - W and S throttle and brake (no reverse), A and D steer. Max speed by the
     tile under the center: 7.5 on paths, sidewalks, crosswalks, plaza, parking and bridges, 5.5 on
     grass, flowers, fairway and tees, 2 on sand. Water, buildings, trees, fences (FT) and the map
     edge block (four point test, radius 0.32, sliding along walls). Greens (GR) block too and
     raise the hint 'No scooters on the green' for a second. Acceleration 12, braking 16, friction 3
     (the v10 feel below; v9 shipped 9 and 14).
   - ctx.vehicles.createScooterController(opts) is the step hook (the cart controller pattern):
     step(scooter, input, dt) with input = { throttle, brake, steer, turn, maxSpeed, fwd, side,
     gradX, gradZ } (steer positive left), given this module's lie table (maxSpeedAt) and collision
     (fits) so both models block and slow alike. Its output is validated per frame (finite fields,
     speed within the lie, no teleport, the four point test); a step that fails three times is
     dropped for the built in model (stepScooterOwn), which mirrors it.
   - 'E  Hop off' calls TT.sim.parkScooter(id, x, z, yaw) (the sim slots it into a rack within 2
     tiles) and stands the visitor beside it. Jump, Tab, X and every other interaction are off
     while riding; the chase camera follows and settles behind the heading like the cart's.

   Version 10 (docs/CONTRACT_V10.md "Thread National", "Polish list: Scooter feel, Walking"):
   - The round plays every hole of state.golf.holes (nine on the v3 plan) and golf.roundResult is
     written once, when the last hole is holed: { strokes, toPar, par, seconds, card, holes,
     played, complete, term, course }; the renderer records it with detail.holes = roundResult.holes
     (9). Practice, the range and an abandoned round never write it. golf.toPar and golf.played
     carry the running to par and the holes holed for the nine-hole card; roundTerm and golfTerm
     are exported. A hole is picked up at HOLE_CAP (14) strokes so a round always ends.
   - Scooter feel: SCOOTER_FEEL (exported) holds the riding numbers handed to
     ctx.vehicles.createScooterController and used by the built in model: throttle response 12
     with a launch boost (times 1.5 for 0.3 s from rest), braking 16, steering 0.9 rad at low
     speed falling to 0.45 at full speed, a 1.0 steer base. The chase camera scales with the
     riding speed: spring 10 to 16, distance 4.2 to 5.2, look-ahead 0.4 to 1.6 along the heading,
     and the orbit yaw eases toward the heading faster while riding (3.5 to 6 per second).
   - Walking: the walk cycle (animT) advances by the distance actually covered (one unit per 1.6
     units of travel), so blocked or slowed steps plant the feet; player.walkDist accumulates it.
     A standing character turns in place when the chase camera looks more than 0.6 rad away from
     where it faces: player.turn = { dir, t, from, to } while turning (t 0 to 1), else null.
   - Tiles: the sim's PT (path), CP (cart path) and DK (deck) tiles are walkable and rideable; the
     cart may use cart path tiles beyond the links polygon and its Tab auto-drive prefers them
     (tile costs 1 on paths and paving, 3 on grass; the straight line still wins when clear).

   Version 11 (docs/CONTRACT_V11.md "The hoverboard", "Boats"): the hoverboard and the boats.
   - The hoverboard is owned through ctx.wallet (owns('hoverboard')). H (input.hover, an edge)
     summons it under the visitor on foot or in the water, outside interiors, the subway and the
     golf, cart and scooter states: a 0.3 s drop-in (player.board.dropT, board.glow 1 to 0), then
     state 'hover' (pose 'hover'). H again hops off: the visitor stands on the tile under the board
     (the nearest land tile when it floats over water) and the board trails 1.5 units behind the
     walker like a pet. player.board = { x, z, y, yaw, state: 'trailing' | 'riding' | 'away',
     dropT, glow, bob } whenever the board is owned (null otherwise); 'away' while the visitor is
     inside, in the subway, golfing, in the cart or on a scooter.
   - player.hover = { x, z, y, yaw, speed, steer, lean, airborne, boostT, chargeT, vx, vz, vy,
     ground, surface, dip, boosting, hint, controller } while riding, null on foot. y is the world
     height of the board (0.4 above the surface under it: the terrain, a bridge deck, the pier
     planks or the water level), ground the terrain under it; the renderer stands the body on the
     board at ground + heightOffset (heightOffset = y - ground + HOVER_DECK). The feel is
     HOVER_FEEL (exported): 11 u/s, Shift boosts to 14 for 2 s with a 4 s recharge, acceleration
     10, braking 12, drift (the board yaws faster than the velocity turns, a lean up to 0.35 rad),
     airtime with gravity 0.4 of the walker's (8 u/s²), a lift of 1.5 u/s² while boosting in the
     air, a soft landing within 2 units of drop, one bounce over it, no damage. Water (the lake,
     the river, the creek, the channel, the pond outside the swim ring), paths, decks, grass,
     sand and greens are open; buildings, trees, fences, the swim ring and the map edge block
     (four point test, radius 0.35, sliding). The kickers (state.kickers, the raster or the plan)
     launch the board when it leaves a lip tile in the ramp's direction; the scooter and the cart
     treat the two kicker tiles as a low obstacle. ctx.vehicles.createHoverController(opts) is the
     optional step hook (the scooter pattern: validated per frame, dropped for the built in model
     after three failures). The chase camera uses the scooter's speed scaled spring with distance
     4.5 to 6 and settles behind the heading while the mouse is quiet.
   - Boats: on foot within 1.8 of a free boat (state.boats, docked or beached, no rider) the prompt
     reads 'E  Take the boat'. E calls TT.sim.takeBoat(id, 'player') and enters state 'boat' (pose
     'boat'): player.boat = { id, kind, x, z, y, yaw, speed, steer, max, slow, wake, hint,
     controller }. W S throttle and reverse, A D the rudder: BOAT_FEEL (exported): 6 u/s for a
     launch, 4 for a rowboat, reverse 2, acceleration 3, turning 1.1 rad/s at speed falling to
     0.5 at a crawl, momentum, the creek a slow zone (max 3, wake 0). Water only: the boat mask
     from cityplan boatWater(TT.sim.raster) (the water under every bridge deck counts; the island,
     the decks and the pond swim ring block; the island footbridge's tiles close too, its deck
     being 0.3 over the lake), else WA tiles off the pier planks; four point test at radius 0.5,
     sliding. 'E  Tie up' goes by the slip center only (a dock whose slip lies beyond its tile is
     on the far side of its deck and is skipped). ctx.vehicles.createBoatController(opts) is the optional step hook.
     'E  Tie up' within 2 of a free dock (state.docks, boat null) slots the boat in its slip
     (TT.sim.dockBoat(id, dockId)) and stands the visitor on the dock tile; 'E  Hop off' elsewhere
     beaches the boat where it floats (TT.sim.beachBoat(id, x, y, yaw), parked, free to take again)
     and puts the visitor on the nearest bank tile within 3 (else the hint 'Closer to the shore').
     The chase camera sits at distance 7 and 3.2 above the deck.
   - Water levels: ctx.waterLevelAt(x, z) (the renderer's lookup) when given, else the sim's
     waterways (state.waterways or TT.sim.raster.waterways, their level), the pond lot (0.04) and
     the plan's water polygons with the terrain's surface records (lake -0.9, river -0.7).
   - player.look is the wallet's equipped record ({ board, hat }) for the renderer, null without a
     wallet. Input: input.hover (H, an edge), input.boost (Shift held; input.run also counts).

   No DOM access here (the renderer owns the HUD). update() allocates nothing in steady state:
   every temporary lives in a module-scope scratch object, the leisure, exiting and golf records
   are reused, and strings are only built on events (prompts are cached per target).
   // CONTRACT: TT.onSelect is reached through ctx.TT, ctx.onSelect or globalThis.TT (the ctx
   // listed in the contract carries TT.state but not TT itself).
   // CONTRACT: rooms reach the player through ctx.getRooms() (a Map<deptId, Room> or an object
   // keyed by dept id), ctx.getInteriors().rooms, ctx.rooms or player.setRooms(map); the v5 text
   // names the Room shape but not the accessor. The golf module comes in as ctx.golf
   // ({ strike, stepBall, lieAt, CLUBS }) and the built course through ctx.getGolf().
   // CONTRACT: Space held is read from input.jumpHeld when the renderer supplies it; with only the
   // jump edge (the v4 feed) a tap starts the charge and a second tap releases the swing. */
import * as THREE from 'three';

/* ---------- tunables (CONTRACT_V4 unless noted) ---------- */
const RADIUS = 0.28;
const SPEED_WALK = 3.0, SPEED_RUN = 5.2, SPEED_SWIM = 1.6, SPEED_PIER = 2.4;
const ACCEL = 18, DECEL = 24;                 // v5: units per second squared
const REACH = 1.7, DOOR_REACH = 1.9, LADDER_REACH = 0.9;
const DIVE_LEN = 1.1, CLIMB_LEN = 0.8, HOP_LEN = 0.55;
const LOOK_SENS = 0.0022;
const LOOK_TAU = 0.045;                       // v5: look easing time constant
const TALK_LEN = 6, BUBBLE_LEN = 5.5;
const WADE_OUT = 0.5;                 // half a tile of 'leaving' after the center reaches land
const WADE_DROP = 1.2;                // v12.1: the most a bank may stand above the water to wade in or climb out
const BOARD_END_SLACK = 0.2;          // dive allowed while z <= boardEnd.y + this
const PIER_HALF_W = 0.6, PIER_NORTH_SLACK = 0.15, PIER_SOUTH_SLACK = 0.5;
/* Heights the renderer gives the body; mirrored here so the camera eye follows it.
   render3d seats: bench 0.42, stool 0.45; the sit pose drops the rig by seatY (0.18) times
   ALIEN_SCALE (1.3); the hop pose lifts the rig by yoff * -0.06 times ALIEN_SCALE. */
const SEAT_Y_BENCH = 0.42, SEAT_Y_STOOL = 0.45, SEAT_DROP = 0.18 * 1.3, HOP_UNIT = 0.06 * 1.3;
const SWIM_DEPTH = 0.0;               // leisure3d SWIM_DEPTH
const MAX_BUBBLES = 8;

/* v7: a mild chase FOV ease while running (the first-person FOV change is gone) */
const FOV_WALK = 68, FOV_RUN = 71, FOV_LEN = 0.25;
/* v5: chase camera; v7: V toggles the distance between the near and far presets */
const ORBIT_PITCH_MIN = 0.12, ORBIT_PITCH_MAX = 1.05, ORBIT_PITCH_DEF = 0.42;
const DIST_NEAR = 4.2, DIST_FAR = 6.5;
const ORBIT_DIST_DEF = DIST_NEAR, ORBIT_DIST_MIN = 2.5, ORBIT_DIST_MAX = 7, ZOOM_RATE = 0.0035;
const CAM_SPRING = 10, CAM_STEP = 0.25, CAM_MIN = 1.2, CHASE_HEAD = 1.1, CHASE_LOOK_FWD = 0.4, CAM_GROUND = 0.6;
/* v10 (CONTRACT_V10 "Scooter feel"): the chase camera scales with the riding speed (the share of
   the vehicle's top speed): spring 10 at rest to 16 at full speed, distance plus 1.0 (4.2 to 5.2
   on the near preset), look-ahead 0.4 to 1.6 in front of the rider along the heading. */
const CAM_SPRING_FAST = 16, CAM_DIST_FAST = 1.0, CHASE_LOOK_FAST = 1.6;
const FACE_RATE = 10, ALIGN_DELAY = 1.5, ALIGN_RATE = 0.8;
/* v10 "Walking": the walk cycle is a distance clock (one animT unit per STRIDE units of travel,
   the scale the animators were tuned at), and a standing character turns in place once the chase
   camera looks more than TURN_THRESH rad away from where it faces, at TURN_RATE rad/s. */
const STRIDE = 1.6, TURN_THRESH = 0.6, TURN_RATE = 5.5, TURN_DONE = 0.04;
/* v5: stations and interiors */
const WALKOUT_LEN = 0.6, FADE_LEN = 0.35, EXIT_ZONE_HW = 0.8, EXIT_ZONE_D = 1.0, WALL_INSET = 0.15, CEIL_H = 3.3, FURNITURE_H = 1.5;
/* v5: golf (docs/GOLF_DESIGN.md "Swing and HUD") */
const GOLF_REACH = 1.6, CHARGE_LEN = 1.1, SWING_LEN = 0.35, IMPACT_T = 0.62, STANCE = 0.45, BEHIND_BALL = 0.6;
const GOLF_WALK = 5.2, REST_HOLD = 0.4, HOLED_HOLD = 2.5, MSG_LEN = 2.5, LIP_LEN = 0.9, AIM_POWER = 0.7, AIM_RATE = 12;
const DRIVER_RANGE = 9, FLIGHT_MAX = 14, SUB_DT = 0.05, GRAV = 20, AIM_CAP = 18, ARRIVE = 0.05;
const BALL_CAM_DIST = 3.5, BALL_CAM_ELEV = 0.35, BALL_CAM_SPRING = 6, BALL_R = 0.11;
const CLUB_NAMES = ['driver', 'iron', 'putter'];
const DEFAULT_CLUBS = {
  driver: { maxSpeed: 20.5, elevation: 0.36, spread: 0.06 },
  iron: { maxSpeed: 14.5, elevation: 0.58, spread: 0.04 },
  putter: { maxSpeed: 7.5, elevation: 0, spread: 0.02 },
};
const ROLL_DECEL = { green: 3.0, fairway: 6.5, rough: 9.5, sand: 16, path: 5.0, tee: 6.5, water: 9.5 };
/* v8: the cart (CONTRACT_V8 "Cart", TERRAIN_DESIGN "Cart driving feel") */
const CART_R = 0.45, CART_WHEELBASE = 1.4, CART_TOP = 8.5, CART_ROUGH = 6, CART_SAND = 3.5;
const CART_ACCEL = 6, CART_BRAKE = 12, CART_FRICTION = 2.5, CART_REVERSE = 0.4, CART_SLOPE = 7;
const STEER_MAX = 0.55, STEER_HIGH = 0.6, STEER_IN = 4, STEER_BACK = 6;
const SEAT_REACH = 1.2, EXIT_SIDE = 1.0, STOP_SHORT = 1.5, WP_REACH = 0.6, STOP_AT = 0.3, PATH_STEP = 0.5, PASSED_D = 1.2;
const PARK_BACK = 2.2, PARK_SIDE = 1.6, PARK_BACK2 = 3.0, PARK_INSET = 0.6;
const AUTO_TURN = 1.5, AUTO_SLOW = 2.0, AUTO_SLOW_ERR = 0.35, STUCK_LEN = 0.8, MAX_REPLANS = 2, BACK_LEN = 0.6, ROUTE_R = 0.7, LOOKAHEAD = 1.5;
/* The auto-drive brakes to a standstill and pivots in place when the heading error passes
   AUTO_PIVOT_ERR (at AUTO_SLOW the turning radius, 1.4 / tan 0.55, is about 2.3, wider than a
   short last leg, so a cart that only slowed would orbit its target forever); AUTO_MAX_T caps one
   auto-drive as a safety net. */
const AUTO_PIVOT_ERR = 0.9, AUTO_MAX_T = 40;
const CART_SEAT_Y = 0.5, CART_CAM_ALIGN = 2.5, CART_CAM_QUIET = 0.8;
const BOUNDARY_LEN = 1.0, ABANDON_WINDOW = 4, READY_WALK = 5, CLUB_REACH = 1.3;
/* v10 (CONTRACT_V10 "Thread National"): a hole is picked up and scored HOLE_CAP at that many
   strokes, so a round (and the headless round test) always ends; the course name for the record. */
const HOLE_CAP = 14, COURSE_NAME = 'Thread National';
/* Tile costs for the cart's auto-drive planner: cart path and paving 1, grass 3. */
const ROUTE_COST_PATH = 1, ROUTE_COST_GRASS = 3;
/* v9: the scooter (CONTRACT_V9 "The visitor riding") */
/* v10 (CONTRACT_V10 "Scooter feel"): the riding numbers in one exported record, handed to
   js/vehicles.js createScooterController as its opts (every field by name, plus feel and numbers
   as the whole record) so the controller and the built in fallback model (stepScooterOwn) ride
   alike; js/sim.js may import it for the agents' scooters. Throttle response 12 with a launch
   boost (accel times launchBoost for launchLen seconds after the throttle opens from rest),
   braking 16, friction 3, steering steerMax 0.9 rad at low speed falling to steerMin 0.45 at
   full speed (steerHighCut 0.5), eased in at steerRate 6 rad/s and back at centerRate 8, a steer
   base of 1.0 (the yaw rate is speed / steerBase * tan(steer): a 2.1 tile turning radius at full
   speed and 0.8 at walking pace; the drawn wheelbase stays the model's), the slow pivot under
   pivotSpeed 0.6 u/s at pivotRate 2.2 rad/s, slope force 5, the lean as v9. */
export const SCOOTER_FEEL = Object.freeze({
  accel: 12, brake: 16, friction: 3, launchBoost: 1.5, launchLen: 0.3, launchSpeed: 0.5,
  topSpeed: 7.5, grassSpeed: 5.5, sandSpeed: 2,
  steerMax: 0.9, steerMin: 0.45, steerHighCut: 0.5, steerRate: 6, centerRate: 8, steerBase: 1.0,
  pivotSpeed: 0.6, pivotRate: 2.2, slopeK: 5, leanMax: 0.22, leanK: 0.15, leanRate: 8, radius: 0.32,
});
const SCOOT_R = SCOOTER_FEEL.radius, SCOOT_FAST = SCOOTER_FEEL.topSpeed, SCOOT_GRASS = SCOOTER_FEEL.grassSpeed, SCOOT_SAND = SCOOTER_FEEL.sandSpeed, SCOOT_SLOPE = SCOOTER_FEEL.slopeK;
const SCOOT_ACCEL = SCOOTER_FEEL.accel, SCOOT_BRAKE = SCOOTER_FEEL.brake, SCOOT_FRICTION = SCOOTER_FEEL.friction, SCOOT_WB = SCOOTER_FEEL.steerBase;
const SCOOT_LAUNCH_BOOST = SCOOTER_FEEL.launchBoost, SCOOT_LAUNCH_LEN = SCOOTER_FEEL.launchLen, SCOOT_LAUNCH_V = SCOOTER_FEEL.launchSpeed;
const SCOOT_STEER_MAX = SCOOTER_FEEL.steerMax, SCOOT_STEER_HIGH = SCOOTER_FEEL.steerHighCut, SCOOT_STEER_IN = SCOOTER_FEEL.steerRate, SCOOT_STEER_BACK = SCOOTER_FEEL.centerRate;
const SCOOT_PIVOT_V = SCOOTER_FEEL.pivotSpeed, SCOOT_PIVOT_RATE = SCOOTER_FEEL.pivotRate, SCOOT_LEAN_MAX = SCOOTER_FEEL.leanMax, SCOOT_LEAN_K = SCOOTER_FEEL.leanK, SCOOT_LEAN_RATE = SCOOTER_FEEL.leanRate;
const SCOOT_REACH = 1.6, SCOOT_DECK = 0.12, SCOOT_HINT_LEN = 1.0, SCOOT_OFF_SIDE = 0.6;
/* The orbit yaw eases toward the heading (an exponential ease, per second) at 3.5 at rest rising
   to 6 at full speed, once the mouse has been quiet for SCOOT_CAM_QUIET s. */
const SCOOT_CAM_ALIGN = 3.5, SCOOT_CAM_ALIGN_FAST = 6, SCOOT_CAM_QUIET = 0.5;
const GREEN_HINT = 'No scooters on the green';
/* v11 (CONTRACT_V11 "The hoverboard"): the riding numbers in one exported record, handed to
   js/vehicles.js createHoverController as its opts and used by the built in model (stepHoverOwn).
   gravity is 0.4 of the walker's 20 (the hop and the golf ball share GRAV); followDown is how fast
   the grounded board can drop with the ground before it is left in the air. */
export const HOVER_FEEL = Object.freeze({
  topSpeed: 11, boostSpeed: 14, boostLen: 2, boostRecharge: 4, accel: 10, brake: 12, friction: 2.5, airDrag: 0.3,
  hoverHeight: 0.4, radius: 0.35, gravity: 8, lift: 1.5, softDrop: 2, bounceK: 0.2, bounceMax: 2.5, followDown: 5,
  yawRateLow: 2.6, yawRateHigh: 1.5, yawRateAir: 1.1, grip: 5, steerRate: 8, leanMax: 0.35, leanK: 0.05, leanRate: 8,
  kickK: 0.42, kickMinSpeed: 2, dropIn: 0.3, dropHeight: 1.5, trailDist: 1.5, trailRate: 5, bobAmp: 0.05,
});
const HOVER_TOP = HOVER_FEEL.topSpeed, HOVER_BOOST = HOVER_FEEL.boostSpeed, HOVER_BOOST_LEN = HOVER_FEEL.boostLen, HOVER_RECHARGE = HOVER_FEEL.boostRecharge;
const HOVER_ACCEL = HOVER_FEEL.accel, HOVER_BRAKE = HOVER_FEEL.brake, HOVER_FRICTION = HOVER_FEEL.friction, HOVER_AIR_DRAG = HOVER_FEEL.airDrag;
const HOVER_H = HOVER_FEEL.hoverHeight, HOVER_R = HOVER_FEEL.radius, HOVER_G = HOVER_FEEL.gravity, HOVER_LIFT = HOVER_FEEL.lift;
const HOVER_SOFT = HOVER_FEEL.softDrop, HOVER_BOUNCE_K = HOVER_FEEL.bounceK, HOVER_BOUNCE_MAX = HOVER_FEEL.bounceMax, HOVER_FOLLOW = HOVER_FEEL.followDown;
const HOVER_YAW_LOW = HOVER_FEEL.yawRateLow, HOVER_YAW_HIGH = HOVER_FEEL.yawRateHigh, HOVER_YAW_AIR = HOVER_FEEL.yawRateAir, HOVER_GRIP = HOVER_FEEL.grip;
const HOVER_STEER_RATE = HOVER_FEEL.steerRate, HOVER_LEAN_MAX = HOVER_FEEL.leanMax, HOVER_LEAN_K = HOVER_FEEL.leanK, HOVER_LEAN_RATE = HOVER_FEEL.leanRate;
const HOVER_KICK = HOVER_FEEL.kickK, HOVER_KICK_MIN = HOVER_FEEL.kickMinSpeed, HOVER_DROP_IN = HOVER_FEEL.dropIn, HOVER_DROP_H = HOVER_FEEL.dropHeight;
const HOVER_TRAIL = HOVER_FEEL.trailDist, HOVER_TRAIL_RATE = HOVER_FEEL.trailRate, HOVER_BOB = HOVER_FEEL.bobAmp;
const HOVER_DECK = 0.1, HOVER_CAM_NEAR = 4.5, HOVER_CAM_FAR = 6, HOVER_DIP_LEN = 0.35, HOVER_HINT_LEN = 1.0;
const HOVER_JUMP_VY = 4.5;   // v11.1: Space while riding pops the board (an ollie)
const HOVER_ID = 'hoverboard';
/* v11 (CONTRACT_V11 "Boats"): the boat numbers (createBoatController opts, the built in model). */
export const BOAT_FEEL = Object.freeze({
  launchSpeed: 9, rowboatSpeed: 6, slowSpeed: 3, reverseSpeed: 3, accel: 4, drag: 1.2, turnLow: 0.5, turnHigh: 1.2, rudderRate: 4,   // v11.1: faster boats
  radius: 0.5, seatHeight: 0.3, heightRate: 1.2, takeReach: 1.8, dockReach: 2, bankReach: 3,
});
const BOAT_LAUNCH = BOAT_FEEL.launchSpeed, BOAT_ROW = BOAT_FEEL.rowboatSpeed, BOAT_SLOW = BOAT_FEEL.slowSpeed, BOAT_REV = BOAT_FEEL.reverseSpeed;
const BOAT_ACCEL = BOAT_FEEL.accel, BOAT_DRAG = BOAT_FEEL.drag, BOAT_TURN_LOW = BOAT_FEEL.turnLow, BOAT_TURN_HIGH = BOAT_FEEL.turnHigh, BOAT_RUDDER = BOAT_FEEL.rudderRate;
/* The corner points sit a hair inside the 0.5 radius: at a tile center the exact corners land on
   the tile boundaries and read the neighbours, so a boat in a one tile slip would always touch
   its dock. */
const BOAT_R = BOAT_FEEL.radius - 1e-3, BOAT_SEAT = BOAT_FEEL.seatHeight, BOAT_Y_RATE = BOAT_FEEL.heightRate;
const BOAT_REACH = BOAT_FEEL.takeReach, DOCK_REACH = BOAT_FEEL.dockReach, BANK_REACH = BOAT_FEEL.bankReach;
const BOAT_CAM_DIST = 7, BOAT_CAM_HEIGHT = 3.2, BOAT_HINT_LEN = 1.2;
const BANK_HINT = 'Closer to the shore';
const POND_LEVEL = 0.04, LAKE_LEVEL = -0.9, RIVER_LEVEL = -0.7, WATERWAY_LEVEL = -0.9;

/* What E (or Space) does this frame. */
const ACT_NONE = 0, ACT_TALK = 1, ACT_GRAB = 2, ACT_SIT = 3, ACT_CLIMB = 4, ACT_STATION = 5,
  ACT_DOOR = 6, ACT_STANDUP = 7, ACT_LEAVE = 8, ACT_DIVE = 9,
  ACT_TEE = 10, ACT_RANGE = 11, ACT_AGAIN = 12, ACT_EXIT_ROOM = 13, ACT_BOARD = 14, ACT_PORTRAIT = 15,
  ACT_START_ROUND = 16, ACT_TEE_ROUND = 17, ACT_PLAY_BALL = 18, ACT_CART_IN = 19, ACT_CART_OUT = 20, ACT_HOME = 21,
  ACT_SCOOT_ON = 22, ACT_SCOOT_OFF = 23,
  ACT_HOVER_OFF = 24, ACT_BOAT_ON = 25, ACT_BOAT_TIE = 26, ACT_BOAT_OFF = 27;   // v11

/* ---------- module-scope scratch (update is allocation-free) ---------- */
const S = {
  fx: 0, fz: 1,              // forward on the ground
  rx: -1, rz: 0,             // right on the ground
  dx: 0, dz: 0,              // desired velocity
  bx: 0, by: 0, bz: 0,       // where the body stands this frame (feet, world)
  act: ACT_NONE, agent: null, seat: null, rec: null, bld: null, item: null, hole: -1, d: Infinity,
};
const BOUNDS = { x0: 0, y0: 0, x1: 1, y1: 1 };
const ZONE = { x0: 0, z0: 0, x1: 0, z1: 0, cx: 0, cz: 0 };
const GRAD = { x: 0, y: 0, z: 0 };            // v8: the terrain gradient under the cart
const SPOT = { x: 0, z: 0, yaw: 0, ok: false }; // v8: a park or exit spot
const CTL_IN = { throttle: 0, brake: 0, steer: 0, turn: 0, maxSpeed: 0, gradX: 0, gradZ: 0 };
const SCOOT_IN = { throttle: 0, brake: 0, steer: 0, turn: 0, maxSpeed: 0, fwd: 0, side: 0, gradX: 0, gradZ: 0, boost: 1 }; // v9; v10 adds boost (the launch multiplier on the throttle response)
const SPICK = { s: null, d: Infinity };      // v9: the scooter the grab prompt points at
/* v11: the hover and boat controller inputs, the boat and the dock a prompt points at */
const HOVER_IN = { throttle: 0, brake: 0, steer: 0, fwd: 0, side: 0, boost: false, boosting: false, maxSpeed: 0, surfaceY: 0, groundY: 0, gradX: 0, gradZ: 0 };
const BOAT_IN = { throttle: 0, brake: 0, steer: 0, fwd: 0, side: 0, maxSpeed: 0, reverseSpeed: 0, slow: false, surfaceY: 0 };
const BPICK = { b: null, d: Infinity };
const DPICK = { d: null, dist: Infinity };
const promptObj = { text: '', key: 'E', full: '' };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - (1 - t) * (1 - t);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const isGerund = s => /^[A-Za-z]+ing\b/.test(s);
const wrap = a => (a > Math.PI || a < -Math.PI) ? Math.atan2(Math.sin(a), Math.cos(a)) : a;
const circleHitsRect = (cx, cz, x0, z0, x1, z1, r) => {
  const qx = clamp(cx, x0, x1), qz = clamp(cz, z0, z1), dx = cx - qx, dz = cz - qz;
  return dx * dx + dz * dz < r * r;
};
export function golfTerm(strokes, par) {
  const over = strokes - par;
  const UNDER = { '-1': 'Birdie', '-2': 'Eagle', '-3': 'Albatross', '-4': 'Condor' };
  if (strokes === 1) return over <= -2 ? 'Hole in one (' + UNDER[Math.max(-4, over)].toLowerCase() + ')' : 'Hole in one';
  if (over <= -1) return UNDER[Math.max(-4, over)];
  if (over === 0) return 'Par';
  if (over === 1) return 'Bogey';
  if (over === 2) return 'Double bogey';
  if (over === 3) return 'Triple bogey';
  return over + ' over';
}
export function roundTerm(total, par) {
  if (total === par) return 'Even par';
  return total < par ? (par - total) + ' under par' : (total - par) + ' over par';
}
const toParText = d => (d === 0 ? 'E' : d > 0 ? '+' + d : String(d));
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inRect = (px, pz, r) => px >= r.x && px <= r.x + r.w && pz >= r.y && pz <= r.y + r.h;
function distToRect(px, pz, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dz = Math.max(r.y - pz, 0, pz - (r.y + r.h));
  return Math.hypot(dx, dz);
}

export function createPlayer(ctx) {
  const sim = ctx.sim;
  const state = ctx.state || sim.state;
  const T = sim.TILES || { G: 0, P: 1, WA: 2, B: 3, T: 4, Z: 5, F: 6, FT: 8 };
  const FW = finite(T.FW) ? T.FW : 9, GR = finite(T.GR) ? T.GR : 10, SA = finite(T.SA) ? T.SA : 11, TEE = finite(T.TEE) ? T.TEE : 12;
  // v7 city tiles (sidewalk, crosswalk, parking, bridge deck); -2 when the sim predates them so they never match
  const SW = finite(T.SW) ? T.SW : -2, CW = finite(T.CW) ? T.CW : -2, PK = finite(T.PK) ? T.PK : -2, BR = finite(T.BR) ? T.BR : -2;
  // v10 tiles (path, cart path, deck); -2 when the sim predates them so they never match
  const PT = finite(T.PT) ? T.PT : -2, CP = finite(T.CP) ? T.CP : -2, DK = finite(T.DK) ? T.DK : -2;
  const COLS = finite(sim.COLS) ? sim.COLS : 82, ROWS = finite(sim.ROWS) ? sim.ROWS : 68;
  const at = sim.at;
  const getRecs = typeof ctx.getRecs === 'function' ? ctx.getRecs : () => null;
  const log = typeof ctx.log === 'function' ? ctx.log : null;
  const deptById = ctx.deptById || null;
  const golfMod = ctx.golf && typeof ctx.golf.strike === 'function' && typeof ctx.golf.stepBall === 'function' ? ctx.golf : null;
  const CLUBS = (golfMod && golfMod.CLUBS) || DEFAULT_CLUBS;
  const getGolf = typeof ctx.getGolf === 'function' ? ctx.getGolf : () => null;
  // v8: the terrain (heightAt, slopeAt) for the cart's height and the slope force; optional
  const terrain = ctx.terrain && (typeof ctx.terrain.heightAt === 'function' || typeof ctx.terrain.slopeAt === 'function') ? ctx.terrain : null;
  let roomsOverride = null;
  function rooms() {
    if (roomsOverride) return roomsOverride;
    if (typeof ctx.getRooms === 'function') return ctx.getRooms() || null;
    if (typeof ctx.getInteriors === 'function') { const I = ctx.getInteriors(); return (I && I.rooms) || null; }
    return ctx.rooms || null;
  }
  function roomFor(b) {
    const R = rooms();
    if (!R || !b || !b.dept) return null;
    if (typeof R.get === 'function') return R.get(b.dept.id) || null;
    return R[b.dept.id] || null;
  }

  const tt = () => ctx.TT || (typeof globalThis !== 'undefined' ? globalThis.TT : null) || null;

  /* Reused leisure records (agent vocabulary, see CONTRACT_V2). */
  const SWIM_L = { kind: 'swim', seat: null, phase: 'wading', spot: null, dive: false, until: Infinity, t0: 0, surface: NaN };   // surface: the water level under the swimmer (v12.1)
  const SEAT_L = { kind: 'bench', seat: null, phase: 'seated', spot: null, dive: false, until: Infinity, t0: 0 };
  /* Reused station walk-out record (v5): the renderer eases the group from from to to over t 0..1. */
  const EXITING = { from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, t: 0 };
  /* Reused golf record (v5). */
  const GOLF = {
    mode: 'hole', hole: 1, ball: null, club: 'driver', phase: 'aim', power: 0, strokes: 0, card: [],   // card length follows holes.length
    message: null, messageUntil: 0, swingT: 0, aimYaw: 0, aimPower: AIM_POWER, aimLen: 0, carry: -1, bestCarry: 0, ballsHit: 0, par: 3, lie: 'tee',
    roundT0: -1, roundSeconds: 0,   // the round clock: from the first charge on hole 1 to 'done' (CONTRACT_V6 leaderboard detail)
    // v8: the round (mode 'round'): round = ROUND while one is on, cartHint the HUD cart line,
    // roundResult (see finishRound) written once when the last hole is holed
    round: null, cartHint: null, roundResult: null,
    // v10: the running to par over the holed entries, the holes holed, the hole count and the
    // course name (the nine-hole card and the HUD header)
    toPar: 0, played: 0, holes: 0, course: COURSE_NAME,
  };
  const ROUND = { startedAt: 0, card: GOLF.card, strokes: 0 };
  /* v10: the turn in place record (player.turn while one runs) and the chase camera's ideal pose
     this frame (what the spring pulls toward; debugState reports it for the ride measurement). */
  const TURN = { dir: 1, t: 0, from: 0, to: 0 };
  const CAM_IDEAL = { x: 0, y: 0, z: 0, spring: CAM_SPRING, dist: ORBIT_DIST_DEF, look: CHASE_LOOK_FWD, k: 0 };
  /* v8: the cart record the renderer draws (player.cart while one exists). auto is the running
     auto-drive or null. */
  const CART = { x: 0, z: 0, y: 0, yaw: Math.PI, speed: 0, steer: 0, occupied: false, auto: null, controller: null };
  /* v9: the scooter record the renderer draws while the visitor rides (player.scooter). */
  const SCOOT = { id: null, x: 0, z: 0, y: 0, yaw: Math.PI, speed: 0, steer: 0, lean: 0, hint: null, controller: null };
  const STRIKE_OPTS = { club: 'driver', power: 0, yaw: 0, lie: 'tee' };
  const EV_REST = { type: 'rest' };
  /* Fallback ball when the course has no pool: the same fields golf.js strike / stepBall touch (launch, carry, holed, landed, lipOut, hitNet). */
  const ownBall = { mesh: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), launch: new THREE.Vector3(), rolling: false, resting: true, lastRest: new THREE.Vector3(), hole: null, strokes: 0, inUse: false, holed: false, landed: true, carry: 0, lipOut: false, hitNet: false, trailTimer: 0 };

  const player = {
    active: false,
    spec: { name: 'You', role: 'Visitor', kind: 'alien', species: null, color: '#75CCD0', demo: false },
    id: 'player',
    pos: { x: 0, y: 0 }, moveDir: { x: 0, z: 1 }, facing: 1, speed: 0, animT: 0, yoff: 0, blinkAt: 0, lookAt: 0, paused: false,
    state: 'idle', pose: 'stand', leisure: null, onBoard: false, jumpT: 0, splash: -1,
    held: null,
    view: 'chase', yaw: Math.PI, bodyYaw: Math.PI,   // v7: chase only
    targetYaw: Math.PI,
    orbitYaw: Math.PI, orbitPitch: ORBIT_PITCH_DEF, orbitDist: ORBIT_DIST_DEF,
    fovTarget: FOV_WALK, fov: FOV_WALK,
    station: null, talkingTo: null, prompt: null, mesh: null,
    heightOffset: 0,          // body height the renderer gives the player this frame (deck, dive arc, seat, station anchor)
    onDeck: false,            // standing on the pier planks or the springboard (over water or on the pier tile)
    deckY: 0,                 // plank height under an idle player (pier.height on the land half of the pier tile, else 0); the renderer lifts the idle body by it
    anchorPos: null,          // v5: the handle's rendered position while at a station, written by the renderer each frame
    exiting: null,            // v5: { from, to, t } during the 0.6 s station walk-out
    interior: null,           // v5: the Room the visitor is inside, or null
    floorY: 0,                // v5: ground height for the camera (room.floorY inside, 0 outdoors)
    fade: null, fadeT: 0,     // v5: 'out' | 'in' | null and the overlay opacity 0..1
    golf: null,               // v5: the golf record while state === 'golf'; v8: also for the whole round
    followBall: null,         // v5: the ball the camera follows during flight
    lastCard: null,           // v5: { card, total, par } of the last round left or finished this session
    cart: null,               // v8: the cart record while a cart exists on the links
    scooter: null,            // v9: { id, x, z, y, yaw, speed, steer, lean, hint } while riding
    turn: null,               // v10: { dir, t, from, to } while turning in place, else null
    walkDist: 0,              // v10: distance walked on foot this session (the foot plant clock)
    hover: null,              // v11: the hoverboard ride record while state === 'hover'
    board: null,              // v11: the owned board { x, z, y, yaw, state, dropT, glow, bob }, null when not owned
    boat: null,               // v11: the boat record while state === 'boat'
    look: null,               // v11: the wallet's equipped look ({ board, hat }) for the renderer
  };

  /* internal */
  const vel = { x: 0, z: 0 };
  const inp = { fwd: 0, side: 0, run: false, jump: false, jumpHeld: false, heldKnown: false, interact: false, lookDX: 0, lookDY: 0, toggleView: false, zoom: 0, club: null, quit: false, drive: false, hover: false, boost: false };
  /* v11: the hoverboard and the boat records the renderer draws (player.hover, player.board, player.boat). */
  const HOVER = { x: 0, z: 0, y: 0, yaw: Math.PI, speed: 0, steer: 0, lean: 0, airborne: false, boostT: 0, chargeT: 0, vx: 0, vz: 0, vy: 0, ground: 0, surface: 0, dip: 0, boosting: false, hint: null, controller: null, apex: 0, bounced: false, kickArmed: false, dipT: -Infinity,
    // the js/vehicles.js controller's own fields on the same record (dir is the velocity heading, drift yaw - dir)
    dir: Math.PI, drift: 0, boostLeft: 0, boostCd: 0, boostCharge: 1, airTime: 0, drop: 0, launched: false, landed: false, bounce: false, bumped: false, maxSpeed: 0, kicks: 0 };
  const BOARD = { x: 0, z: 0, y: 0, yaw: Math.PI, state: 'trailing', dropT: -Infinity, glow: 0, bob: 0 };
  const BOAT = { id: null, kind: 'rowboat', x: 0, z: 0, y: 0, yaw: 0, speed: 0, steer: 0, max: BOAT_ROW, slow: false, wake: 0, hint: null, controller: null, rec: null };
  let clock = 0;
  let hopT0 = -1;
  let phaseT0 = 0;                            // start of the current dive or climb
  const from = { x: 0, z: 0 };                // dive or climb start, wade-out crossing point
  let nextTreat = 'icecream';
  let cafe = null;
  const bubbles = [];                         // {agent, bubble} greetings this module set
  const talked = [];                          // every agent given a talkUntil since the last exit, so exit clears all their pauses
  let talkAgent = null;
  // prompt string caches so a steady prompt allocates nothing
  let talkFor = null, talkText = '';
  let stationFor = null, stationText = '';
  let doorFor = null, doorText = '';
  let itemFor = null, itemText = '';
  const teeText = [];
  // v5 smoothing and chase camera
  let orbitYawT = Math.PI, orbitPitchT = ORBIT_PITCH_DEF;
  let wYaw = Math.PI, wOrbitYaw = Math.PI, wOrbitPitch = ORBIT_PITCH_DEF;   // the angles as this module last wrote them
  let lastMouseT = -Infinity, moveT0 = -1;
  const cam = { x: 0, y: 2, z: 0, snap: true };      // chase camera, sprung
  const bcam = { x: 0, y: 2, z: 0, snap: true };     // ball camera, sprung
  // v5 stations
  let exitT0 = 0, exitH = 0;
  // v5 interiors
  let fadeT0 = 0, fadeKind = null, pendingRoom = null, pendingBld = null, interiorBld = null;
  const outsidePos = { x: 0, z: 0 };
  let doorArmed = true, exitArmed = false;
  // v5 golf
  const shotFrom = { x: 0, z: 0 }, prevPos = { x: 0, z: 0 }, walkTarget = { x: 0, z: 0 };
  // v10 fix: waypoints (tile centers) for the walk to the ball when the straight line would cross
  // water or a building (the island hole: the walk takes the footbridge, not the lake)
  const walkWay = [];
  // v13 (CONTRACT_V13 "Waypoints and directions"): the map route the visitor auto walks (state 'route');
  // the same walkWay and walkTarget follower as the golf walk, at run speed, until the end or any input
  const ROUTE = { active: false, t0: 0, left: 0, x: 0, z: 0 };
  let chargeT0 = 0, swingT0 = 0, flightT0 = 0, restAt = -1, holdNext = 'walk', holedT0 = 0, walkT0 = 0;
  let struck = false, airborne = false, clubOverride = false, swingToggle = false, charYaw = 0;
  // v8 round and cart
  let clubhouse = null;                       // the clubhouse building record (state.clubhouse)
  let abandonAskedAt = -Infinity;             // the first X of the abandon question
  let boundaryT = -Infinity;                  // the last push against the links boundary
  let regionPts = null; const regionRects = []; let regionBuilt = false;
  let cartCtl = null, cartCtlStrikes = 0;     // the optional ctx.vehicles step hook and its failed validations
  let bfsParent = null, bfsQueue = null;      // the auto-drive tile search, allocated on first use
  const teeHint = [];                         // 'Tab  Drive to tee <n>' per hole
  // v9 scooter
  let scootCtl = null, scootCtlTried = false, scootCtlStrikes = 0;   // the ctx.vehicles step hook
  let greenT = -Infinity;                     // the last push against a green
  let scootRec = null;                        // the sim record of the ridden scooter (state.scooters)
  let launchUntil = -Infinity, launchArmed = true;   // v10: the launch boost window and its re-arm on throttle release
  // v10: the cart planner's cost search (allocated on first use, see planRoute)
  let bfsCost = null, bfsDone = null, bfsHeap = null, heapN = 0;
  // v11: the hoverboard and the boats
  let hoverCtl = null, hoverCtlTried = false, hoverCtlStrikes = 0;   // ctx.vehicles.createHoverController
  let boatCtl = null, boatCtlStrikes = 0;                            // ctx.vehicles.createBoatController, one per boat kind (boatCtls)
  const boatCtls = { launch: undefined, rowboat: undefined };
  const slowAtPoint = (x, z) => inSlowZone(Math.floor(x), Math.floor(z));
  let hoverHintT = -Infinity, boatHintT = -Infinity;                 // the last blocked summon, the last failed hop off
  let swimRing = null, boatMask = null, waterMapsBuilt = false;      // the pond swim ring keys, the boat water mask
  let wwLevels = null, wwSlow = null, waterBodies = null;            // waterway tile levels, the slow zone keys, the plan's water polygons
  let kickerList = null, kickerTiles = null;                         // { foot, lip, launch, dx, dz } per kicker and the two tiles' keys
  const waterLevelFn = typeof ctx.waterLevelAt === 'function' ? ctx.waterLevelAt : null;
  const inSubwayFn = typeof ctx.inSubway === 'function' ? ctx.inSubway : null;

  /* ---------- tiles ---------- */
  const land = v => v === T.G || v === T.P || v === T.Z || v === T.F || v === FW || v === GR || v === SA || v === TEE
    || v === SW || v === CW || v === PK || v === BR || v === PT || v === CP || v === DK;
  // v10: paved or packed tiles (the cart planner's cheap tiles, the scooter's fast lie)
  const paved = v => v === T.P || v === T.Z || v === SW || v === CW || v === PK || v === BR || v === PT || v === CP || v === DK;
  const blocked = v => !(land(v) || v === T.WA);          // B, T, FT, off map
  function inPierRect(px, pz) {
    const pier = state.pier;
    if (!pier) return false;
    return Math.abs(px - pier.base.x) <= PIER_HALF_W && pz >= pier.boardEnd.y - PIER_NORTH_SLACK && pz <= pier.base.y + PIER_SOUTH_SLACK;
  }
  /* A radius point may rest here. mayWater: water tiles are open (the player is in the water
     or stands on a shore tile). swim: the player is in the water, which closes the pier
     rectangle; for walkers that rectangle carries the deck over the water. */
  function pointOK(px, pz, mayWater, swim) {
    const v = at(Math.floor(px), Math.floor(pz));
    if (swim && v === BR && underDeck(Math.floor(px), Math.floor(pz))) return mayWater;   // v14: under a deck
    if (land(v)) return !swim || !cliffFromWater(px, pz);   // v12.1: no climbing out up a cliff
    if (v === T.WA) return inPierRect(px, pz) ? !swim : mayWater;
    return false;
  }
  function fits(x, z, mayWater, swim) {
    return pointOK(x - RADIUS, z - RADIUS, mayWater, swim) && pointOK(x + RADIUS, z - RADIUS, mayWater, swim)
      && pointOK(x - RADIUS, z + RADIUS, mayWater, swim) && pointOK(x + RADIUS, z + RADIUS, mayWater, swim);
  }
  /* How many radius points rest where they may not. Normally 0; it goes above 0 for a frame or two
     when the land and water rules flip (wading in beside the deck, surfacing next to it) while a
     point is still over the pier rectangle. Moves that do not raise the count stay allowed, so
     the player can always walk out of such a spot instead of freezing there. */
  function badCount(x, z, mayWater, swim) {
    return (pointOK(x - RADIUS, z - RADIUS, mayWater, swim) ? 0 : 1) + (pointOK(x + RADIUS, z - RADIUS, mayWater, swim) ? 0 : 1)
      + (pointOK(x - RADIUS, z + RADIUS, mayWater, swim) ? 0 : 1) + (pointOK(x + RADIUS, z + RADIUS, mayWater, swim) ? 0 : 1);
  }
  const waterAt = (px, pz) => at(Math.floor(px), Math.floor(pz)) === T.WA && !inPierRect(px, pz);
  // v14: the water under a bridge deck (a bridge tile on the boat mask) is open to a swimmer, who passes under the deck.
  // Only in the swimming phase: a wader or a swimmer climbing out (wading, leaving) keeps the deck as land, as before.
  const underDeck = (tx, tz) => { if (SWIM_L.phase !== 'swimming' || player.leisure !== SWIM_L || at(tx, tz) !== BR) return false; if (!waterMapsBuilt) buildWaterMaps(); return !!boatMask && boatMask[tz * COLS + tx] === 1; };
  function anyPointWater(x, z) {
    return waterAt(x - RADIUS, z - RADIUS) || waterAt(x + RADIUS, z - RADIUS) || waterAt(x - RADIUS, z + RADIUS) || waterAt(x + RADIUS, z + RADIUS);
  }
  /* Wade in points. CONTRACT_V7: swimming stays in the pond, so when the sim publishes
     state.shoreTiles (pond shore only; the river and the hole hazards are not in it) a tile is a
     shore tile only when it is listed there. The neighbor test stays as the fallback for sims
     without the list. The lookup set is built once per list and never per frame. */
  let shoreSet = null, shoreSetN = -1, shoreSetList = null;
  const SHORE_KEY = 4096;
  function shoreListed(tx, tz) {
    const list = state.shoreTiles;
    if (!list || !list.length) return null;
    if (shoreSet === null || shoreSetList !== list || shoreSetN !== list.length) {
      shoreSet = new Set();
      for (let i = 0; i < list.length; i++) shoreSet.add(list[i].x * SHORE_KEY + list[i].y);
      shoreSetList = list; shoreSetN = list.length;
    }
    return shoreSet.has(tx * SHORE_KEY + tz);
  }
  function isShoreTile(tx, tz) {
    const v = at(tx, tz);
    if (!land(v)) return false;
    const listed = shoreListed(tx, tz);
    if (listed === true) return true;
    // v12.1: swim everywhere. Any bank tile beside water is a wade-in point when the step from the
    // tile to the water surface is a gentle one (under WADE_DROP); cliffs, bridge decks and the
    // marina decks are not (the pier keeps its own rules). The pond list above still marks the
    // pond's shore for the agents.
    if (v === BR || v === DK) return false;
    if (inPierRect(tx + 0.5, tz + 0.5)) return false;
    let wx = -1, wz = -1;
    if (at(tx + 1, tz) === T.WA) { wx = tx + 1; wz = tz; }
    else if (at(tx - 1, tz) === T.WA) { wx = tx - 1; wz = tz; }
    else if (at(tx, tz + 1) === T.WA) { wx = tx; wz = tz + 1; }
    else if (at(tx, tz - 1) === T.WA) { wx = tx; wz = tz - 1; }
    if (wx < 0) return false;
    const drop = cartHeight(tx + 0.5, tz + 0.5) - waterLevel(wx + 0.5, wz + 0.5);
    return drop <= WADE_DROP && drop >= -0.6;
  }
  /* v12.1: a land point a swimmer may not climb onto, the bank standing more than WADE_DROP above
     the water the swimmer is in (the gorge walls under the bluff, the island's rock collar). */
  function cliffFromWater(px, pz) {
    const s = SWIM_L.surface;
    return finite(s) && cartHeight(Math.floor(px) + 0.5, Math.floor(pz) + 0.5) - s > WADE_DROP;   // v14: the tile centre, the height the wade in rule uses
  }
  /* Interior collision: the room rectangle inset by the radius and the furniture AABBs. */
  function roomOK(room, x, z) {
    const o = room.origin;
    if (!o) return true;
    if (x < o.x + RADIUS || x > o.x + room.w - RADIUS || z < o.z + RADIUS || z > o.z + room.d - RADIUS) return false;
    const obs = room.obstacles;
    if (obs) for (let i = 0; i < obs.length; i++) {
      const b = obs[i];
      if (x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS) return false;
    }
    return true;
  }
  /* The exit zone of the active room into ZONE: the 'exit' interactable's rectangle (1.6 by 1.0),
     else 1.0 inside the door toward the spawn. */
  function exitZone(room) {
    let cx = NaN, cz = NaN;
    const items = room.interactables;
    if (items) for (let i = 0; i < items.length; i++) { const it = items[i]; if (it && it.kind === 'exit') { cx = it.x; cz = it.z; break; } }
    if (!finite(cx) || !finite(cz)) {
      const d = room.door, sp = room.spawn;
      if (!d) { ZONE.x0 = ZONE.x1 = ZONE.z0 = ZONE.z1 = ZONE.cx = ZONE.cz = NaN; return false; }
      const sgn = sp && finite(sp.z) && sp.z < d.z ? -1 : 1;
      cx = d.x; cz = d.z + sgn * EXIT_ZONE_D * 0.5;
    }
    ZONE.cx = cx; ZONE.cz = cz;
    ZONE.x0 = cx - EXIT_ZONE_HW; ZONE.x1 = cx + EXIT_ZONE_HW; ZONE.z0 = cz - EXIT_ZONE_D * 0.5; ZONE.z1 = cz + EXIT_ZONE_D * 0.5;
    return true;
  }
  const inZone = (x, z) => x >= ZONE.x0 && x <= ZONE.x1 && z >= ZONE.z0 && z <= ZONE.z1;

  /* ---------- small state helpers ---------- */
  const swimL = () => (player.state === 'leisure' && player.leisure && player.leisure.kind === 'swim') ? player.leisure : null;
  const inWater = () => { const L = swimL(); return !!L && (L.phase === 'wading' || L.phase === 'swimming' || L.phase === 'leaving'); };
  const seated = () => player.state === 'leisure' && player.leisure && player.leisure.phase === 'seated';
  const atStation = () => player.state === 'station' && !!player.station;
  const golfing = () => player.state === 'golf' && player.golf === GOLF;
  const inRound = () => player.golf === GOLF && GOLF.mode === 'round';      // v8: a round is on, in any player state
  const inCart = () => player.state === 'cart' && player.cart === CART && CART.occupied;
  const riding = () => player.state === 'scooter' && player.scooter === SCOOT;   // v9
  const hovering = () => player.state === 'hover' && player.hover === HOVER;      // v11
  const boating = () => player.state === 'boat' && player.boat === BOAT;          // v11
  const fadingOut = () => player.fade === 'out';
  const routing = () => player.state === 'route' && player.route === ROUTE;      // v13: the auto walk along a map route
  const movable = () => { const L = swimL(); return !seated() && !atStation() && !player.exiting && !golfing() && !inCart() && !riding() && !hovering() && !boating() && !routing() && !fadingOut() && !(L && (L.phase === 'diving' || L.phase === 'climbing')); };

  function setMoveDir(dx, dz) {
    const d = Math.hypot(dx, dz);
    if (!(d > 1e-6)) return;
    player.moveDir.x = dx / d; player.moveDir.z = dz / d;
    if (Math.abs(dx) > 0.05) player.facing = dx > 0 ? 1 : -1;
  }
  function forwardOf(yaw) { S.fx = Math.sin(yaw); S.fz = Math.cos(yaw); S.rx = -Math.cos(yaw); S.rz = Math.sin(yaw); }
  /* Sets the body yaw and the orbit at once (the eased values and their targets). */
  function setLookYaw(yaw) {
    yaw = finite(yaw) ? wrap(yaw) : Math.PI;
    player.yaw = yaw; player.targetYaw = yaw; player.bodyYaw = yaw;
    player.orbitYaw = yaw; orbitYawT = yaw;
    cam.snap = true;
  }

  /* v12.1: the swimmer's height over the ground under it: the water surface less the bed, so the
     body floats at the surface of whatever it is in (the pond bed is at 0, the lake's at -1.6). */
  function swimFloat() {
    const s = finite(SWIM_L.surface) ? SWIM_L.surface : waterLevel(player.pos.x, player.pos.y);
    const g = cartHeight(player.pos.x, player.pos.y);
    if (underDeck(Math.floor(player.pos.x), Math.floor(player.pos.y))) return s - g + SWIM_DEPTH;   // v14: under a deck, at the water
    return Math.max(SWIM_DEPTH, s - g + SWIM_DEPTH);
  }
  function beginSwimPhase(phase, time) {
    SWIM_L.phase = phase; SWIM_L.t0 = time;
    player.state = 'leisure'; player.leisure = SWIM_L;
  }
  function startSwimming(time) {
    beginSwimPhase('swimming', time);
    player.onBoard = false; player.jumpT = 0; player.splash = time; player.pose = 'swim';
    player.onDeck = false;
  }
  function endSwim() {
    player.state = 'idle'; player.leisure = null; player.onBoard = false; player.jumpT = 0; player.pose = 'stand'; player.onDeck = false; player.deckY = 0;
  }

  function reserveSeat(seat) {
    if (typeof sim.reserveSeat === 'function') return sim.reserveSeat(seat.id, 'player');
    // CONTRACT: fallback for a sim without the v4 helpers; same semantics
    if (seat.takenBy) return null;
    seat.takenBy = 'player';
    return seat;
  }
  function releaseSeat() {
    const L = player.leisure;
    const seat = L && L.seat;
    if (!seat) return;
    if (typeof sim.releaseSeat === 'function') sim.releaseSeat(seat.id, 'player');
    else if (seat.takenBy === 'player') seat.takenBy = null;
  }
  function standUp() {
    if (player.scooter === SCOOT) hopOff(clock);      // v9: every state change that stands the visitor up parks the scooter first
    if (hovering()) hopOffBoard(clock);               // v11: and steps off the hoverboard
    if (boating()) leaveBoat(clock, false);           // v11: and beaches a ridden boat
    if (!seated()) return;
    releaseSeat();
    player.state = 'idle'; player.leisure = null; player.pose = 'stand';
    SEAT_L.seat = null;
  }
  function sitDown(seat, time) {
    if (!reserveSeat(seat)) return false;
    SEAT_L.seat = seat; SEAT_L.phase = 'seated'; SEAT_L.until = Infinity; SEAT_L.t0 = time;
    if (seat.kind === 'cafe') {
      SEAT_L.kind = player.held || 'icecream';
      player.held = SEAT_L.kind;       // the renderer attaches the prop from held, so the treat shows while seated
    } else SEAT_L.kind = 'bench';
    player.state = 'leisure'; player.leisure = SEAT_L; player.pose = 'sit';
    player.pos.x = seat.x + 0.5; player.pos.y = seat.y + 0.5;
    setMoveDir(seat.face.x - player.pos.x, seat.face.y - player.pos.y);
    player.yaw = Math.atan2(player.moveDir.x, player.moveDir.z); player.targetYaw = player.yaw; player.bodyYaw = player.yaw;
    vel.x = 0; vel.z = 0;
    player.onDeck = false; player.onBoard = false;
    return true;
  }

  /* ---------- stations (v5: the walk-out) ---------- */
  function leaveStation(time, instant) {
    const rec = player.station;
    if (!rec) { if (player.state === 'station' && !player.exiting) player.state = 'idle'; return; }
    if (rec.worker === 'player') rec.worker = null;
    if (rec.phase && rec.phase.working) { rec.phase.working = false; rec.phaseAt = time; }
    player.station = null;
    // back on the ground beside the station (the anchor may be a rooftop or a platform)
    const wp = rec.b && rec.b.workPos;
    let tx = player.pos.x, tz = player.pos.y;
    if (wp && fits(wp.x, wp.y, false)) { tx = wp.x; tz = wp.y; }
    else if (!fits(tx, tz, false)) { findFreeSpot(tx, tz); tx = player.pos.x; tz = player.pos.y; }
    vel.x = 0; vel.z = 0;
    const A = player.anchorPos;
    const useA = !instant && !!A && finite(A.x) && finite(A.y) && finite(A.z);
    const fx = useA ? A.x : player.pos.x, fy = useA ? A.y : (finite(player.heightOffset) ? player.heightOffset : 0), fz = useA ? A.z : player.pos.y;
    if (instant) {
      player.state = 'idle'; player.pose = 'stand'; player.heightOffset = 0; player.exiting = null; exitH = 0;
      player.pos.x = tx; player.pos.y = tz;
      return;
    }
    EXITING.from.x = fx; EXITING.from.y = fy; EXITING.from.z = fz;
    EXITING.to.x = tx; EXITING.to.y = 0; EXITING.to.z = tz;
    EXITING.t = 0; exitT0 = time; exitH = fy;
    player.exiting = EXITING; player.state = 'station'; player.pose = 'walk';
    player.pos.x = fx; player.pos.y = fz; player.heightOffset = fy;
    if (Math.hypot(tx - fx, tz - fz) > 0.05) {
      setMoveDir(tx - fx, tz - fz);
      player.yaw = Math.atan2(tx - fx, tz - fz); player.targetYaw = player.yaw; player.bodyYaw = player.yaw;
    }
  }
  function updateExiting(dt, time) {
    const E = EXITING;
    const k = clamp((time - exitT0) / WALKOUT_LEN, 0, 1), e = smooth(k);
    E.t = k;
    const px0 = player.pos.x, pz0 = player.pos.y;
    player.pos.x = lerp(E.from.x, E.to.x, e); player.pos.y = lerp(E.from.z, E.to.z, e);
    exitH = lerp(E.from.y, E.to.y, e);
    const len = Math.hypot(E.to.x - E.from.x, E.to.z - E.from.z);
    player.speed = len / WALKOUT_LEN; player.pose = 'walk'; advanceWalk(px0, pz0);
    vel.x = 0; vel.z = 0;
    if (k >= 1) {
      player.exiting = null; player.state = 'idle'; player.pose = 'stand'; player.speed = 0; exitH = 0;
      player.pos.x = E.to.x; player.pos.y = E.to.z;
    }
  }
  function useStation(rec, time) {
    if (!rec || rec.worker || !rec.activity) return false;
    standUp();
    rec.worker = 'player';
    if (rec.phase) { rec.phase.working = true; rec.phaseAt = time; }
    player.state = 'station'; player.station = rec; player.pose = rec.pose || 'work'; player.exiting = null;
    const A = rec.worldAnchor;
    if (A) { player.pos.x = A.x; player.pos.y = A.z; player.heightOffset = finite(A.y) ? A.y : 0; }
    if (finite(rec.yaw)) { setLookYaw(rec.yaw); setMoveDir(Math.sin(rec.yaw), Math.cos(rec.yaw)); }
    vel.x = 0; vel.z = 0; player.onDeck = false; player.onBoard = false;
    return true;
  }

  /* ---------- talk ---------- */
  function nowLine(a) {
    if (a.state === 'working') {
      const lbl = a.dept && a.dept.building && a.dept.building.activityLabel;
      return 'Right now I\'m ' + (lbl ? String(lbl).toLowerCase() : 'working') + '.';
    }
    if (a.state === 'leisure' && a.leisure) {
      const k = a.leisure.kind;
      if (k === 'icecream') return 'Having ice cream at the café.';
      if (k === 'coffee') return 'Having coffee at the café.';
      if (k === 'bench') return 'Taking a break on a bench.';
      if (k === 'swim') return 'Swimming.';
    }
    if (a.state === 'commute') return 'Heading to work.';
    return 'Just taking a stroll.';
  }
  function talkTo(a, time) {
    const name = a.spec ? a.spec.name : a.id, role = a.spec ? a.spec.role : '';
    const greeting = 'Hi, I\'m ' + name + ', the ' + role + '. ' + nowLine(a);
    player.talkingTo = a.id; talkAgent = a;
    a.talkUntil = time + TALK_LEN;
    if (talked.indexOf(a) < 0) {
      if (talked.length >= MAX_BUBBLES) { const old = talked.shift(); if (old.talkUntil > time) old.talkUntil = time; }
      talked.push(a);
    }
    const bubble = { text: greeting, until: time + BUBBLE_LEN, kind: 'ok' };
    a.bubble = bubble;
    if (bubbles.length >= MAX_BUBBLES) bubbles.shift();
    bubbles.push({ agent: a, bubble });
    select({ kind: 'agent', id: a.id, agent: a });
  }
  function select(p) {
    state.selected = p;
    const TT = tt();
    if (TT && TT.state && TT.state !== state) TT.state.selected = p;
    const cb = typeof ctx.onSelect === 'function' ? ctx.onSelect : (TT && typeof TT.onSelect === 'function' ? TT.onSelect : null);
    if (cb) cb(p);
  }
  /* The sim only clears report and error bubbles; greetings are ours to clear. The force sweep
     (exit) also ends the talk pause of every agent spoken to, not only the last one. */
  function sweepBubbles(time, force) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const e = bubbles[i];
      if (e.agent.bubble !== e.bubble) { bubbles.splice(i, 1); continue; }
      if (force || time > e.bubble.until) { e.agent.bubble = null; bubbles.splice(i, 1); }
    }
    for (let i = talked.length - 1; i >= 0; i--) {
      const a = talked[i];
      if (force) { a.talkUntil = 0; talked.splice(i, 1); }
      else if (!(a.talkUntil > time)) talked.splice(i, 1);
    }
    if (talkAgent && (force || !(talkAgent.talkUntil > time))) {
      if (force) talkAgent.talkUntil = 0;
      talkAgent = null; player.talkingTo = null;
    }
  }

  /* ---------- spawn ---------- */
  function findFreeSpot(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let r = 0; r <= 12; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const tx = cx + dx, tz = cz + dz;
        if (fits(tx + 0.5, tz + 0.5, false) && !isShoreTile(tx, tz)) { player.pos.x = tx + 0.5; player.pos.y = tz + 0.5; return true; }
      }
    }
    player.pos.x = clamp(x, RADIUS, COLS - RADIUS); player.pos.y = clamp(z, RADIUS, ROWS - RADIUS);
    return false;
  }
  function findCafe() {
    if (state.cafe) return state.cafe;
    const bs = state.buildings || [];
    for (let i = 0; i < bs.length; i++) if (bs[i].kind === 'cafe') return bs[i];
    return null;
  }

  /* ---------- interiors (v5) ---------- */
  /* Department buildings with a door zone: the renderer's building records first, else the sim's. */
  function deptBuilding(i) {
    const recs = getRecs();
    if (recs && recs.length) { const r = recs[i]; return r && !r.isCafe && r.b && r.b.kind === 'dept' ? r.b : null; }
    const bs = state.buildings || [];
    const b = bs[i];
    return b && b.kind === 'dept' ? b : null;
  }
  function deptBuildingCount() { const recs = getRecs(); return recs && recs.length ? recs.length : (state.buildings || []).length; }
  function doorZoneHit(b, px, pz) {
    const d1 = b.doorTile, d2 = b.doorTile2 || d1;
    if (!d1 || !finite(d1.x) || !finite(d1.y)) return false;
    const x0 = Math.min(d1.x, d2.x), x1 = Math.max(d1.x, d2.x) + 1, z0 = Math.min(d1.y, d2.y), z1 = Math.max(d1.y, d2.y) + 1;
    return circleHitsRect(px, pz, x0, z0, x1, z1, RADIUS);
  }
  function buildingForRoom(room) {
    const n = deptBuildingCount();
    for (let i = 0; i < n; i++) { const b = deptBuilding(i); if (b && b.dept && b.dept.id === room.id) return b; }
    return null;
  }
  /* Door-zone detection while outdoors: any overlap requests the room (armed again once clear). */
  function checkDoorZones(time) {
    const px = player.pos.x, pz = player.pos.y;
    const n = deptBuildingCount();
    let hit = null;
    for (let i = 0; i < n; i++) {
      const b = deptBuilding(i);
      if (b && doorZoneHit(b, px, pz)) { hit = b; break; }
    }
    if (!hit) { doorArmed = true; return; }
    if (!doorArmed) return;
    const room = roomFor(hit);
    if (room) requestEnter(room, hit, time);
  }
  function requestEnter(room, bld, time) {
    if (!room || player.fade || player.interior) return false;
    if (player.scooter === SCOOT) hopOff(time);       // v9
    if (hovering()) hopOffBoard(time);                // v11: the board waits outside
    pendingRoom = room; pendingBld = bld || buildingForRoom(room);
    fadeKind = 'enter'; player.fade = 'out'; player.fadeT = 0; fadeT0 = time;
    outsidePos.x = player.pos.x; outsidePos.z = player.pos.y;
    vel.x = 0; vel.z = 0; player.speed = 0; player.pose = 'stand'; hopT0 = -1;
    return true;
  }
  function requestExit(time) {
    if (!player.interior || player.fade) return false;
    fadeKind = 'exit'; player.fade = 'out'; player.fadeT = 0; fadeT0 = time;
    vel.x = 0; vel.z = 0; player.speed = 0; player.pose = 'stand'; hopT0 = -1;
    return true;
  }
  function placeInside(room) {
    const sp = room.spawn || room.door || { x: room.origin ? room.origin.x + room.w / 2 : 0, z: room.origin ? room.origin.z + room.d / 2 : 0 };
    player.interior = room; interiorBld = pendingBld; player.floorY = finite(room.floorY) ? room.floorY : 0;
    player.pos.x = sp.x; player.pos.y = sp.z;
    if (!roomOK(room, player.pos.x, player.pos.y) && room.origin) { player.pos.x = room.origin.x + room.w / 2; player.pos.y = room.origin.z + room.d / 2; }
    endSwim(); player.onDeck = false; player.onBoard = false; player.deckY = 0; player.heightOffset = 0;
    setLookYaw(Math.PI); player.orbitPitch = ORBIT_PITCH_DEF; orbitPitchT = ORBIT_PITCH_DEF;
    setMoveDir(0, -1);
    exitArmed = false; doorArmed = false;
    if (log) log('Inside ' + (room.id && deptById && deptById[room.id] ? deptById[room.id].name : (room.id || 'the building')) + '.', 'info');
  }
  function placeOutside() {
    const b = interiorBld, dp = b && b.doorPos;
    player.interior = null; player.floorY = 0; interiorBld = null; pendingRoom = null; pendingBld = null;
    if (dp && finite(dp.x) && finite(dp.y)) { player.pos.x = dp.x; player.pos.y = dp.y; }
    else { player.pos.x = outsidePos.x; player.pos.y = outsidePos.z; }
    if (!fits(player.pos.x, player.pos.y, false)) findFreeSpot(player.pos.x, player.pos.y);
    // face away from the building: the record's facing (v7, the rotated lot's door side), else from the
    // footprint center through doorPos (the door pair is off center on most footprints, so this is a
    // fallback for records without facing; doorPos alone gives no direction)
    let ox = 0, oz = 1;
    const fc = b && b.facing;
    if (fc && finite(fc.x) && finite(fc.y) && Math.hypot(fc.x, fc.y) > 1e-6) { ox = fc.x; oz = fc.y; }
    else if (dp && b && finite(b.x) && finite(b.y) && finite(b.w) && finite(b.h)) { ox = dp.x - (b.x + b.w / 2); oz = dp.y - (b.y + b.h / 2); }
    if (!(Math.hypot(ox, oz) > 1e-6)) { ox = 0; oz = 1; }
    setLookYaw(Math.atan2(ox, oz)); player.orbitPitch = ORBIT_PITCH_DEF; orbitPitchT = ORBIT_PITCH_DEF;
    setMoveDir(ox, oz);
    doorArmed = false; exitArmed = false;
  }
  function updateFade(time) {
    if (!player.fade) return;
    const k = clamp((time - fadeT0) / FADE_LEN, 0, 1);
    if (player.fade === 'out') {
      player.fadeT = k;
      if (k >= 1) {
        if (fadeKind === 'enter' && pendingRoom) placeInside(pendingRoom);
        else if (fadeKind === 'exit') placeOutside();
        player.fade = 'in'; player.fadeT = 1; fadeT0 = time;
      }
    } else {
      player.fadeT = 1 - k;
      if (k >= 1) { player.fade = null; player.fadeT = 0; fadeKind = null; }
    }
  }

  /* ---------- golf (v5) ---------- */
  const courseOf = () => getGolf();
  const golfData = () => state.golf || null;
  function holeAt(n) { const g = golfData(); return g && g.holes ? g.holes[n - 1] || null : null; }
  function holeCount() { const g = golfData(); return g && g.holes ? g.holes.length : 0; }
  function holesPar() { let p = 0; const n = holeCount(); for (let i = 1; i <= n; i++) { const h = holeAt(i); p += h && finite(h.par) ? h.par : 3; } return p; }
  function courseName() { const g = golfData(); return g && typeof g.name === 'string' && g.name ? g.name : COURSE_NAME; }
  /* v10: the running to par over the holed entries and the count of holes holed (the HUD card). */
  function updateToPar() {
    let tp = 0, n = 0;
    for (let i = 0; i < GOLF.card.length; i++) {
      const s = GOLF.card[i];
      if (!finite(s)) continue;
      const h = holeAt(i + 1);
      tp += s - (h && finite(h.par) ? h.par : 3); n += 1;
    }
    GOLF.toPar = tp; GOLF.played = n; GOLF.holes = GOLF.card.length;
  }
  function acquireBall(course) {
    let b = null;
    const pool = course && course.ballPool;
    if (pool) {
      if (typeof pool.acquire === 'function') b = pool.acquire();
      else if (typeof pool.get === 'function') b = pool.get();
      else if (Array.isArray(pool)) { for (let i = 0; i < pool.length; i++) if (pool[i] && !pool[i].inUse) { b = pool[i]; break; } }
    }
    if (!b && course && typeof course.acquireBall === 'function') b = course.acquireBall();
    if (!b || !b.pos || !b.vel) b = ownBall;
    b.inUse = true;
    if (b.mesh) b.mesh.visible = true;
    return b;
  }
  function releaseBall(course, b) {
    if (!b) return;
    const pool = course && course.ballPool;
    if (pool && typeof pool.release === 'function') pool.release(b);
    else if (course && typeof course.releaseBall === 'function') course.releaseBall(b);
    b.inUse = false; b.hole = null;
    if (b.mesh) b.mesh.visible = false;
  }
  function placeBall(b, x, z) {
    const c = courseOf(), pool = c && c.ballPool;
    if (pool && typeof pool.place === 'function' && b.mesh && b.launch) { pool.place(b, x, z); return; }
    b.pos.set(x, BALL_R, z); b.vel.set(0, 0, 0);
    b.rolling = false; b.resting = true;
    b.holed = false; b.landed = true; b.lipOut = false; b.hitNet = false;
    if (b.lastRest) b.lastRest.copy(b.pos);
    if (b.launch) b.launch.copy(b.pos);
    if (b.mesh) { b.mesh.visible = true; if (b.mesh.position) b.mesh.position.copy(b.pos); }
  }
  /* The golf.js course object for the current play: the per-hole course (cup, green ellipse, sim, park
     bounds) in hole mode, the range in range mode; the whole build result when neither exists. */
  function stepCourse() {
    const c = courseOf();
    if (!c) return c;
    if (GOLF.mode === 'range') return c.range || c;
    const hs = c.holes;
    return (Array.isArray(hs) && hs[GOLF.hole - 1]) || c;
  }
  function lieNow(b) {
    const c = stepCourse();
    if (golfMod && typeof golfMod.lieAt === 'function') {
      const l = golfMod.lieAt(c, b.pos.x, b.pos.z);
      if (typeof l === 'string') return l;
    }
    const v = at(Math.floor(b.pos.x), Math.floor(b.pos.z));
    return v === GR ? 'green' : v === FW ? 'fairway' : v === SA ? 'sand' : v === TEE ? 'tee' : v === T.WA ? 'water' : v === T.P ? 'path' : 'rough';
  }
  /* Bounds for the walking phase and the aim line: the union of the hole bounds (else the whole map), the range bounds in range mode. */
  function golfBounds() {
    const g = golfData();
    if (GOLF.mode === 'range' && g && g.range && g.range.bounds) {
      const b = g.range.bounds; BOUNDS.x0 = b.x0; BOUNDS.y0 = b.y0; BOUNDS.x1 = b.x1; BOUNDS.y1 = b.y1; return BOUNDS;
    }
    if (g && g.parkBounds) { const b = g.parkBounds; BOUNDS.x0 = b.x0; BOUNDS.y0 = b.y0; BOUNDS.x1 = b.x1; BOUNDS.y1 = b.y1; return BOUNDS; }
    if (g && g.holes && g.holes.length && g.holes[0].bounds) {
      BOUNDS.x0 = Infinity; BOUNDS.y0 = Infinity; BOUNDS.x1 = -Infinity; BOUNDS.y1 = -Infinity;
      for (let i = 0; i < g.holes.length; i++) {
        const b = g.holes[i].bounds; if (!b) continue;
        if (b.x0 < BOUNDS.x0) BOUNDS.x0 = b.x0; if (b.y0 < BOUNDS.y0) BOUNDS.y0 = b.y0; if (b.x1 > BOUNDS.x1) BOUNDS.x1 = b.x1; if (b.y1 > BOUNDS.y1) BOUNDS.y1 = b.y1;
      }
      if (finite(BOUNDS.x0) && finite(BOUNDS.x1) && finite(BOUNDS.y0) && finite(BOUNDS.y1)) return BOUNDS;
    }
    BOUNDS.x0 = 0; BOUNDS.y0 = 0; BOUNDS.x1 = COLS; BOUNDS.y1 = ROWS;
    return BOUNDS;
  }
  function clampToBounds() {
    const b = golfBounds();
    player.pos.x = clamp(player.pos.x, b.x0 + RADIUS, b.x1 - RADIUS);
    player.pos.y = clamp(player.pos.y, b.y0 + RADIUS, b.y1 - RADIUS);
  }
  function setMessage(text, len) { GOLF.message = text; GOLF.messageUntil = clock + (finite(len) ? len : MSG_LEN); }
  function autoClub() {
    const b = GOLF.ball;
    GOLF.lie = lieNow(b);
    if (GOLF.mode === 'range') { GOLF.club = 'driver'; return; }
    const H = holeAt(GOLF.hole);
    if (GOLF.lie === 'green') GOLF.club = 'putter';
    else if (H && H.cup && Math.hypot(H.cup.x - b.pos.x, H.cup.y - b.pos.z) > DRIVER_RANGE) GOLF.club = 'driver';
    else GOLF.club = 'iron';
  }
  /* Carry estimate for the aim line (docs/GOLF_DESIGN.md "Aim line length"). */
  function estimateCarry(p) {
    const c = CLUBS[GOLF.club] || DEFAULT_CLUBS[GOLF.club] || DEFAULT_CLUBS.iron;
    const lie = GOLF.lie;
    const lieMod = lie === 'sand' ? 0.5 : lie === 'rough' ? 0.85 : 1.0;
    const maxSpeed = finite(c.maxSpeed) ? c.maxSpeed : 14.5, elev = finite(c.elevation) ? c.elevation : 0.5;
    const speed = maxSpeed * (0.25 + 0.75 * clamp(p, 0, 1)) * lieMod;
    let est;
    if (GOLF.club === 'putter' || elev <= 1e-6) est = speed * speed / (2 * (ROLL_DECEL[lie] || ROLL_DECEL.rough));
    else est = speed * speed * Math.sin(2 * elev) / GRAV * (lie === 'rough' ? 1.15 : 1.3);
    return clamp(finite(est) ? est : 0, 0, AIM_CAP);
  }
  function aimAt(x, z) {
    const b = GOLF.ball;
    const yaw = Math.atan2(x - b.pos.x, z - b.pos.z);
    if (!finite(yaw)) return;
    setLookYaw(yaw);
  }
  function enterAim(time, aimCup) {
    GOLF.phase = 'aim'; GOLF.swingT = 0; GOLF.power = 0; struck = false; airborne = false; swingToggle = false; restAt = -1;
    player.followBall = null; bcam.snap = true;
    if (!clubOverride) autoClub(); else GOLF.lie = lieNow(GOLF.ball);
    if (aimCup && GOLF.mode !== 'range') { const H = holeAt(GOLF.hole); if (H && H.cup) aimAt(H.cup.x, H.cup.y); }
    const ay = player.orbitYaw;
    GOLF.aimYaw = finite(ay) ? ay : Math.PI;
    GOLF.aimLen = estimateCarry(AIM_POWER);
  }
  function beginWalkTo(x, z, time) {
    walkTarget.x = x; walkTarget.z = z;
    const b = golfBounds();
    walkTarget.x = clamp(walkTarget.x, b.x0 + RADIUS, b.x1 - RADIUS); walkTarget.z = clamp(walkTarget.z, b.y0 + RADIUS, b.y1 - RADIUS);
    GOLF.phase = 'walking'; walkT0 = time; player.followBall = null; bcam.snap = true;
    player.pose = 'walk'; player.speed = GOLF_WALK;
    planWalkWay(player.pos.x, player.pos.y, walkTarget.x, walkTarget.z);
  }
  /* True when every tile under the segment is land (sampled every quarter tile). */
  function straightWalkOK(x0, z0, x1, z1) {
    // v13: every tile the segment crosses (a grid walk), so a corner cut through a water or building
    // tile never slips between samples (the quarter tile sampling let the island Go walk clip the lake)
    let tx = Math.floor(x0), tz = Math.floor(z0);
    if (!land(at(tx, tz))) return false;
    const dx = x1 - x0, dz = z1 - z0;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tDx = dx !== 0 ? 1 / Math.abs(dx) : Infinity, tDz = dz !== 0 ? 1 / Math.abs(dz) : Infinity;
    let tMaxX = dx !== 0 ? (sx > 0 ? tx + 1 - x0 : x0 - tx) * tDx : Infinity;
    let tMaxZ = dz !== 0 ? (sz > 0 ? tz + 1 - z0 : z0 - tz) * tDz : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      if (Math.min(tMaxX, tMaxZ) >= 1) break;      // the next grid line is at or past the end
      if (tMaxX === tMaxZ) {                        // exactly through a corner: both neighbours and the diagonal
        if (!land(at(tx + sx, tz)) || !land(at(tx, tz + sz))) return false;
        tx += sx; tz += sz; tMaxX += tDx; tMaxZ += tDz;
      } else if (tMaxX < tMaxZ) { tx += sx; tMaxX += tDx; }
      else { tz += sz; tMaxZ += tDz; }
      if (!land(at(tx, tz))) return false;
    }
    return land(at(Math.floor(x1), Math.floor(z1)));
  }
  /* Fills walkWay with the sim's BFS path (tile centers, the target tile left off) when the straight
     walk is not clear. A target tile the sim does not path to (a green, sand) is swapped for the
     nearest tile within three that it does; the final leg to the exact target stays straight. */
  function planWalkWay(x0, z0, x1, z1) {
    walkWay.length = 0;
    if (straightWalkOK(x0, z0, x1, z1) || !sim || typeof sim.findPath !== 'function') return;
    let sx = Math.floor(x0), sz = Math.floor(z0), lead = false;
    const tx = Math.floor(x1), tz = Math.floor(z1);
    const ok = typeof sim.walkable === 'function' ? sim.walkable : null;
    // v14: a start tile the sim does not walk (a tee box, the fairway, a green) is swapped for the nearest
    // one it does that has a clear straight walk from here and joins the town's walkable area
    if (ok && !ok(sx, sz)) {
      const spn = state.spawn, ox = sx, oz = sz;
      search: for (let r = 1; r <= 10; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = ox + dx, cz = oz + dz;
        if (!ok(cx, cz) || !straightWalkOK(x0, z0, cx + 0.5, cz + 0.5)) continue;
        if (spn && finite(spn.x) && finite(spn.y) && !(cx === spn.x && cz === spn.y) && !sim.findPath(cx, cz, spn.x, spn.y)) continue;
        sx = cx; sz = cz; lead = true; break search;
      }
    }
    let path = sim.findPath(sx, sz, tx, tz), viaTile = !!path;
    // greens, sand and tee boxes are not agent tiles: path to the nearest tile the sim walks that
    // has a clear straight walk onto the target (the island: the north end of the footbridge)
    for (let r = 1; !path && r <= 10; r++) {
      let best = null, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = tx + dx, cz = tz + dz;
        if (ok && !ok(cx, cz)) continue;
        if (!straightWalkOK(cx + 0.5, cz + 0.5, x1, z1)) continue;
        const p = sim.findPath(sx, sz, cx, cz);
        if (p && p.length < bd) { bd = p.length; best = p; }
      }
      path = best;
    }
    if (!path) return;
    if (lead) walkWay.push({ x: sx + 0.5, z: sz + 0.5 });   // v14: the lead in to the start tile
    for (let i = 0; i < path.length; i++) walkWay.push({ x: path[i].x + 0.5, z: path[i].y + 0.5 });
    if (viaTile && path.length) walkWay.pop();   // the target tile itself: the last leg goes to the exact spot (v14: never the lead in)
  }
  /* Drops leading waypoints the walker can already reach in a straight line (string pulling). */
  function trimWalkWay(px, pz) {
    while (walkWay.length > 1 && straightWalkOK(px, pz, walkWay[1].x, walkWay[1].z)) walkWay.shift();
    if (walkWay.length === 1 && straightWalkOK(px, pz, walkTarget.x, walkTarget.z)) walkWay.shift();
  }

  /* ---------- v13: the map route (CONTRACT_V13 "Waypoints and directions") ----------
     walkRoute(points): points are { x, z } world positions (tile centres from the sim's path finder,
     the last one the waypoint itself). Only a visitor standing on foot (state 'idle', not fading,
     not inside a room) takes it; riding states ignore it. The follower is the golf walk's
     (walkWay, walkTarget, trimWalkWay) at SPEED_RUN; any movement, jump, interact, hover or quit
     input ends it, as does reaching the last point. Returns true when the walk started. */
  function walkRoute(points) {
    if (!player.active || player.state !== 'idle' || player.fade || player.exiting || player.interior) return false;
    if (!Array.isArray(points) || !points.length) return false;
    walkWay.length = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p) continue;
      const x = finite(p.x) ? p.x : NaN, z = finite(p.z) ? p.z : (finite(p.y) ? p.y : NaN);
      if (!finite(x) || !finite(z)) continue;
      walkWay.push({ x, z });
    }
    if (!walkWay.length) return false;
    const last = walkWay.pop();
    walkTarget.x = clamp(last.x, RADIUS, COLS - RADIUS); walkTarget.z = clamp(last.z, RADIUS, ROWS - RADIUS);
    ROUTE.active = true; ROUTE.t0 = clock; ROUTE.left = walkWay.length + 1; ROUTE.x = walkTarget.x; ROUTE.z = walkTarget.z;
    player.route = ROUTE; player.state = 'route';
    player.pose = 'walk'; player.speed = SPEED_RUN; player.turn = null; player.onDeck = false; player.onBoard = false;
    vel.x = 0; vel.z = 0; hopT0 = -1; moveT0 = clock;
    return true;
  }
  function stopRoute() {
    if (!routing()) return false;
    walkWay.length = 0;
    ROUTE.active = false; ROUTE.left = 0;
    player.route = null; player.state = 'idle';
    player.pose = 'stand'; player.speed = 0; vel.x = 0; vel.z = 0; moveT0 = -1;
    return true;
  }
  function updateRoute(dt, time) {
    trimWalkWay(player.pos.x, player.pos.y);
    const way = walkWay.length ? walkWay[0] : walkTarget;
    const dx = way.x - player.pos.x, dz = way.z - player.pos.y, dl = Math.hypot(dx, dz);
    const stepLen = SPEED_RUN * dt;
    const x0 = player.pos.x, z0 = player.pos.y;
    if (walkWay.length && dl <= Math.max(ARRIVE, stepLen)) {
      player.pos.x = way.x; player.pos.y = way.z; walkWay.shift();
      setMoveDir(dx, dz);
    } else if (dl <= Math.max(ARRIVE, stepLen)) {
      player.pos.x = walkTarget.x; player.pos.y = walkTarget.z;
      advanceWalk(x0, z0);
      stopRoute();
      return;
    } else {
      player.pos.x += dx / dl * stepLen; player.pos.y += dz / dl * stepLen;
      setMoveDir(dx, dz);
    }
    player.pos.x = clamp(player.pos.x, RADIUS, COLS - RADIUS);
    player.pos.y = clamp(player.pos.y, RADIUS, ROWS - RADIUS);
    if (!finite(player.pos.x)) player.pos.x = x0; if (!finite(player.pos.y)) player.pos.y = z0;
    ROUTE.left = walkWay.length + 1;
    advanceWalk(x0, z0);
    // the body turns toward the leg at the walk's rate; the chase camera settles behind after the align delay
    const sp = Math.hypot(player.pos.x - x0, player.pos.y - z0) / Math.max(dt, 1e-6);
    player.speed = finite(sp) ? sp : SPEED_RUN;
    vel.x = (player.pos.x - x0) / Math.max(dt, 1e-6); vel.z = (player.pos.y - z0) / Math.max(dt, 1e-6);
    if (dl > 1e-6) {
      const tgt = Math.atan2(dx, dz), d = wrap(tgt - player.yaw), mx = FACE_RATE * dt;
      player.yaw = wrap(player.yaw + clamp(d, -mx, mx));
    }
    player.targetYaw = player.yaw; player.bodyYaw = player.yaw; player.turn = null;
    if (clock - ROUTE.t0 > ALIGN_DELAY && clock - lastMouseT > ALIGN_DELAY) {
      const d = wrap(player.yaw - orbitYawT), mx = ALIGN_RATE * dt, st = clamp(d, -mx, mx);
      orbitYawT = wrap(orbitYawT + st);
      player.orbitYaw = wrap(player.orbitYaw + st);
    }
    player.pose = 'walk';
  }
  function beginWalkToBall(time) {
    const b = GOLF.ball;
    let hx = b.pos.x - prevPos.x, hz = b.pos.z - prevPos.z;
    const hl = Math.hypot(hx, hz);
    if (hl > 1e-6) { hx /= hl; hz /= hl; } else { hx = Math.sin(GOLF.aimYaw); hz = Math.cos(GOLF.aimYaw); }
    beginWalkTo(b.pos.x - BEHIND_BALL * hx, b.pos.z - BEHIND_BALL * hz, time);
  }
  function teeStance(H) {
    // the stance point beside the tee for the aim at the cup (so the auto-walk ends in position)
    const a = Math.atan2(H.cup.x - H.tee.x, H.cup.y - H.tee.y);
    S.dx = H.tee.x + STANCE * Math.cos(a); S.dz = H.tee.y - STANCE * Math.sin(a);
  }
  function setupHole(n) {
    const H = holeAt(n);
    if (!H) return false;
    GOLF.hole = n; GOLF.strokes = 0; GOLF.par = finite(H.par) ? H.par : 3;
    const b = GOLF.ball;
    placeBall(b, H.tee.x, H.tee.y); b.hole = n; b.strokes = 0;
    return true;
  }
  function resetCard() {
    GOLF.card.length = Math.max(1, holeCount());      // one entry per hole in state.golf.holes
    for (let i = 0; i < GOLF.card.length; i++) GOLF.card[i] = null;
    updateToPar();
  }
  /* Enters the golf state for a practice hole ('hole'), the range ('range') or a hole of the
     running round ('round': the round fields, the card and the clock are kept). */
  function enterGolf(mode, n, time) {
    const course = courseOf();
    standUp(); endSwim();
    const g = GOLF;
    g.mode = mode; g.ball = acquireBall(course); g.message = null; g.messageUntil = 0; g.carry = -1; g.bestCarry = 0; g.ballsHit = 0;
    if (mode !== 'round') { g.roundT0 = -1; g.roundSeconds = 0; g.round = null; g.cartHint = null; g.roundResult = null; resetCard(); }
    clubOverride = false;
    player.state = 'golf'; player.golf = g; player.leisure = null; player.onDeck = false; player.onBoard = false; player.held = null;
    player.exiting = null; player.heightOffset = 0; vel.x = 0; vel.z = 0; hopT0 = -1;
    prevPos.x = player.pos.x; prevPos.z = player.pos.y;
    if (mode === 'range') {
      const gd = golfData(), line = gd && gd.range && gd.range.teeLine;
      let bx = player.pos.x, bz = player.pos.y, bd = Infinity;
      if (line) for (let i = 0; i < line.length; i++) { const p = line[i]; const d = Math.hypot(p.x - player.pos.x, p.y - player.pos.y); if (d < bd) { bd = d; bx = p.x; bz = p.y; } }
      placeBall(g.ball, bx, bz); g.ball.hole = null; g.hole = 0; g.strokes = 0; g.par = 0;
      setLookYaw(Math.PI);
      enterAim(time, false); g.club = 'driver';
    } else {
      if (!setupHole(n)) { leaveGolf(time); return false; }
      enterAim(time, true);
    }
    charYaw = wrap(player.orbitYaw - Math.PI / 2);
    player.bodyYaw = charYaw;
    if (log) log(mode === 'range' ? 'Hitting balls at the range.' : (mode === 'round' ? 'Hole ' + n + ' of the round.' : 'Practice on hole ' + n + '.'), 'info');
    return true;
  }
  /* v8: the completed round into player.lastCard (session memory for the HUD; the leaderboard
     reads golf.roundResult). */
  function recordCard() {
    let total = 0;
    for (let i = 0; i < GOLF.card.length; i++) total += GOLF.card[i] || 0;
    const secs = GOLF.roundSeconds, par = holesPar();
    player.lastCard = { card: GOLF.card.slice(), total, par, toPar: total - par, holes: GOLF.card.length, seconds: finite(secs) ? secs : 0, complete: true, term: roundTerm(total, par), course: courseName() };
  }
  /* Out of the golf state onto the feet, at the current spot. The round record (player.golf) is
     kept while a round is on; practice and the range clear it. */
  function standDown() {
    const g = GOLF;
    g.power = 0; g.swingT = 0; struck = false; airborne = false; swingToggle = false; restAt = -1;
    player.followBall = null; bcam.snap = true;
    player.state = 'idle'; player.pose = 'stand'; player.speed = 0; vel.x = 0; vel.z = 0;
    player.bodyYaw = player.yaw;
    if (!fits(player.pos.x, player.pos.y, false)) findFreeSpot(player.pos.x, player.pos.y);
    if (!inRound()) { player.golf = null; g.cartHint = null; }
  }
  function leaveGolf(time) {
    releaseBall(courseOf(), GOLF.ball);
    GOLF.ball = null; GOLF.message = null; GOLF.phase = 'aim';
    standDown();
  }
  function doStrike(time) {
    const g = GOLF, b = g.ball;
    g.lie = lieNow(b);
    STRIKE_OPTS.club = g.club; STRIKE_OPTS.power = clamp(g.power, 0, 1); STRIKE_OPTS.yaw = g.aimYaw; STRIKE_OPTS.lie = g.lie;
    shotFrom.x = b.pos.x; shotFrom.z = b.pos.z;
    prevPos.x = player.pos.x; prevPos.z = player.pos.y;
    b.resting = false;
    golfMod.strike(b, STRIKE_OPTS);
    if (!finite(b.vel.x) || !finite(b.vel.y) || !finite(b.vel.z)) b.vel.set(0, 0, 0);
    g.strokes += 1; b.strokes = g.strokes; struck = true; clubOverride = false; g.carry = -1; airborne = false;
    if (g.mode === 'round') ROUND.strokes += 1;
  }
  /* v8: after a shot comes to rest in a round the player walks to a nearby ball as before, but a
     long one leaves the player on foot in phase 'ready' (the cart drives there on Tab, or walk). */
  function afterShot(time) {
    const b = GOLF.ball;
    if (GOLF.mode === 'round' && Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.y) > READY_WALK) {
      GOLF.phase = 'ready';
      standDown();
      return;
    }
    beginWalkToBall(time);
  }
  function trackCarry() {
    const g = GOLF, b = g.ball;
    if (g.carry >= 0) return;
    if (b.pos.y > BALL_R + 0.1) airborne = true;
    else if (airborne || b.rolling) g.carry = Math.hypot(b.pos.x - shotFrom.x, b.pos.z - shotFrom.z);
  }
  function carryTiles() { const c = GOLF.carry >= 0 ? GOLF.carry : Math.hypot(GOLF.ball.pos.x - shotFrom.x, GOLF.ball.pos.z - shotFrom.z); return Math.round(c); }
  function rangeShotDone(prefix, time) {
    const g = GOLF, n = carryTiles();
    g.ballsHit += 1; if (n > g.bestCarry) g.bestCarry = n;
    setMessage(prefix + n + ' tiles.');
    restAt = time + REST_HOLD; holdNext = 'range';
  }
  /* v10: the hole is picked up at HOLE_CAP strokes and scored the cap (the holed flow follows). */
  function pickUp(time) {
    const g = GOLF, b = g.ball;
    g.strokes = HOLE_CAP; b.strokes = g.strokes;
    g.card[g.hole - 1] = g.strokes; updateToPar();
    setMessage('Hole ' + g.hole + ': picked up at ' + HOLE_CAP + ' (par ' + g.par + ').', HOLED_HOLD);
    g.phase = 'holed'; holedT0 = time;
    b.vel.set(0, 0, 0); b.rolling = false; b.resting = true;
    player.followBall = null; bcam.snap = true;
  }
  /* v10: a water shot drops at the event's drop point (golf.js waterDrop: the last dry ground on
     the shot side, so the island hole's tee shot drops on the tee side shore), else at the last
     rest; out of bounds replays from the last rest. */
  function penalty(text, time, drop) {
    const g = GOLF, b = g.ball;
    g.strokes += 1; b.strokes = g.strokes;
    if (g.mode === 'round') ROUND.strokes += 1;
    if (g.strokes >= HOLE_CAP) { pickUp(time); return; }
    setMessage(text);
    const lr = drop && finite(drop.x) && finite(drop.z) ? drop : (b.lastRest && finite(b.lastRest.x) ? b.lastRest : b.pos);
    placeBall(b, lr.x, lr.z);
    player.followBall = null; bcam.snap = true;
    afterShot(time);
  }
  function handleBallEvent(ev, time) {
    const g = GOLF, b = g.ball, type = ev.type;
    if (type === 'lipout' || type === 'lip') { setMessage('Lip out.', LIP_LEN); return; }
    if (g.carry < 0) g.carry = Math.hypot(b.pos.x - shotFrom.x, b.pos.z - shotFrom.z);
    if (g.mode === 'range') {
      if (type === 'out') rangeShotDone('Over the net. Carry ', time);
      else if (type === 'net') rangeShotDone('Into the net. Carry ', time);
      else rangeShotDone('Carry ', time);
      b.vel.set(0, 0, 0); b.rolling = false; b.resting = true;
      return;
    }
    if (type === 'holed') {
      g.card[g.hole - 1] = g.strokes; updateToPar();
      setMessage('Hole ' + g.hole + ': ' + g.strokes + ' (par ' + g.par + '). ' + golfTerm(g.strokes, g.par), HOLED_HOLD);
      g.phase = 'holed'; holedT0 = time;
      b.vel.set(0, 0, 0); b.rolling = false; b.resting = true;
      return;
    }
    // v10: the cap (a penalty counts toward it inside penalty)
    if (g.strokes >= HOLE_CAP && type !== 'water' && type !== 'out') { pickUp(time); return; }
    if (type === 'water') { penalty('Splash. Penalty stroke.', time, ev.drop || b.drop || null); return; }
    if (type === 'out') { penalty('Out of bounds. Penalty stroke.', time); return; }
    // rest (or anything unknown): hold the ball camera, then walk to the ball
    b.resting = true; b.rolling = false;
    if (b.lastRest) b.lastRest.copy(b.pos);
    restAt = time + REST_HOLD; holdNext = 'walk';
  }
  /* After the holed hold. Practice: the one hole is finished ('E  Play again' replays it). Round:
     the ball goes away, the next tee becomes active ('between') or the round ends after the last. */
  function nextHoleOrDone(time) {
    const g = GOLF;
    if (g.mode !== 'round') {
      g.phase = 'finished';
      setMessage('Hole ' + g.hole + ': ' + g.strokes + ' (par ' + g.par + '). ' + golfTerm(g.strokes, g.par), Infinity);
      player.pose = 'stand'; player.speed = 0;
      return;
    }
    releaseBall(courseOf(), g.ball); g.ball = null;
    if (g.hole < holeCount()) {
      const H = holeAt(g.hole + 1);
      g.hole += 1; g.strokes = 0; g.par = H && finite(H.par) ? H.par : 3; g.lie = 'tee'; g.club = 'driver';
      g.message = null; g.phase = 'between';
      standDown();
      if (log) log('Hole ' + g.hole + ' is up next.', 'info');
      return;
    }
    finishRound(time);
  }
  /* Practice: play the same hole again. */
  function playAgain(time) {
    const g = GOLF;
    g.card[g.hole - 1] = null; updateToPar();
    g.message = null; clubOverride = false; g.roundT0 = -1; g.roundSeconds = 0;
    if (!setupHole(g.hole)) { leaveGolf(time); return; }
    teeStance(holeAt(g.hole));
    beginWalkTo(S.dx, S.dz, time);
  }
  const swingHeld = () => inp.heldKnown ? inp.jumpHeld : swingToggle;
  function updateGolf(dt, time) {
    const g = GOLF, b = g.ball;
    if (inp.jump) { inp.jump = false; if (!inp.heldKnown) swingToggle = !swingToggle; }
    if (!b || !golfMod) { if (inRound()) abandonRound(time); else leaveGolf(time); return; }
    if (inp.club) {
      if (g.phase === 'aim' || g.phase === 'charging') { g.club = inp.club; clubOverride = true; }
      inp.club = null;
    }
    const aimYaw = player.orbitYaw;
    g.aimYaw = finite(aimYaw) ? aimYaw : Math.PI;
    if (g.message && g.phase !== 'done' && g.phase !== 'finished' && time > g.messageUntil) g.message = null;
    player.yoff = 0; player.heightOffset = 0;

    switch (g.phase) {
      case 'aim':
      case 'charging': {
        // the stance beside the ball, right handed: the target on the left, the ball in front of the feet
        const sx = b.pos.x + STANCE * Math.cos(g.aimYaw), sz = b.pos.z - STANCE * Math.sin(g.aimYaw);
        const k = 1 - Math.exp(-dt * AIM_RATE);
        player.pos.x += (sx - player.pos.x) * k; player.pos.y += (sz - player.pos.y) * k;
        const cy = wrap(g.aimYaw - Math.PI / 2);
        charYaw = wrap(charYaw + wrap(cy - charYaw) * k);
        player.pose = 'golfIdle'; player.speed = 0; vel.x = 0; vel.z = 0;
        if (g.phase === 'aim') {
          g.power = 0;
          if (swingHeld()) { g.phase = 'charging'; chargeT0 = time; if (g.mode === 'hole' && g.roundT0 < 0) g.roundT0 = time; }
        } else {
          const u = ((time - chargeT0) / CHARGE_LEN) % 2;
          g.power = clamp(1 - Math.abs(u - 1), 0, 1);
          if (!swingHeld()) { g.phase = 'swinging'; swingT0 = time; g.swingT = 0; struck = false; swingToggle = false; player.pose = 'golf'; }
        }
        g.aimLen = estimateCarry(g.phase === 'charging' ? g.power : AIM_POWER);
        break;
      }
      case 'swinging': {
        g.swingT = clamp((time - swingT0) / SWING_LEN, 0, 1);
        player.pose = 'golf'; player.speed = 0;
        if (!struck && g.swingT >= IMPACT_T) doStrike(time);
        if (struck && g.swingT < 1) {
          // the ball is already flying while the follow-through finishes
          let rem = dt, ev = null;
          while (rem > 1e-9 && !ev) { const h = Math.min(rem, SUB_DT); ev = golfMod.stepBall(b, h, stepCourse()); rem -= h; }
          trackCarry();
          if (ev) { g.phase = 'flight'; flightT0 = time; player.followBall = b; handleBallEvent(ev, time); }
        }
        if (g.swingT >= 1) {
          if (!struck) doStrike(time);
          if (g.phase === 'swinging') { g.phase = 'flight'; flightT0 = time; player.followBall = b; }
        }
        break;
      }
      case 'flight': {
        player.pose = 'golfIdle'; player.speed = 0;
        if (restAt < 0) {
          let rem = dt, ev = null;
          while (rem > 1e-9 && !ev) { const h = Math.min(rem, SUB_DT); ev = golfMod.stepBall(b, h, stepCourse()); rem -= h; }
          trackCarry();
          if (!ev && (time - flightT0 > FLIGHT_MAX || b.resting)) ev = EV_REST;
          if (ev) handleBallEvent(ev, time);
        } else if (time >= restAt) {
          restAt = -1;
          if (holdNext === 'range') { const gd = golfData(), line = gd && gd.range && gd.range.teeLine; let bx = shotFrom.x, bz = shotFrom.z; if (line && line.length) { let bd = Infinity; for (let i = 0; i < line.length; i++) { const p = line[i]; const d = Math.hypot(p.x - shotFrom.x, p.y - shotFrom.z); if (d < bd) { bd = d; bx = p.x; bz = p.y; } } } placeBall(b, bx, bz); enterAim(time, false); }
          else afterShot(time);
        }
        if (!golfing()) return;      // afterShot may have left the golf state ('ready')
        break;
      }
      case 'walking': {
        trimWalkWay(player.pos.x, player.pos.y);
        const way = walkWay.length ? walkWay[0] : walkTarget;
        const dx = way.x - player.pos.x, dz = way.z - player.pos.y, dl = Math.hypot(dx, dz);
        const stepLen = GOLF_WALK * dt;
        if (walkWay.length && dl <= Math.max(ARRIVE, stepLen)) {
          // reached a waypoint: keep walking toward the next one
          player.pos.x = way.x; player.pos.y = way.z; walkWay.shift();
          setMoveDir(dx, dz); player.pose = 'walk'; player.speed = GOLF_WALK;
        } else if (dl <= Math.max(ARRIVE, stepLen)) {
          player.pos.x = walkTarget.x; player.pos.y = walkTarget.z;
          const quiet = lastMouseT < walkT0;
          enterAim(time, quiet);
          charYaw = wrap(player.orbitYaw - Math.PI / 2);
          player.speed = 0; player.pose = 'golfIdle';
        } else {
          player.pos.x += dx / dl * stepLen; player.pos.y += dz / dl * stepLen;
          setMoveDir(dx, dz);
          charYaw = Math.atan2(dx, dz);
          player.pose = 'walk'; player.speed = GOLF_WALK; player.animT += stepLen / STRIDE; player.walkDist += stepLen;
        }
        clampToBounds();
        break;
      }
      case 'holed': {
        player.pose = 'golfIdle'; player.speed = 0;
        if (time - holedT0 >= HOLED_HOLD) { nextHoleOrDone(time); if (!golfing()) return; }
        break;
      }
      case 'finished':
      case 'done':
      default: {
        player.pose = 'stand'; player.speed = 0;
        break;
      }
    }
    if (g.phase !== 'walking') { player.moveDir.x = Math.sin(charYaw); player.moveDir.z = Math.cos(charYaw); }
    player.yaw = charYaw; player.targetYaw = charYaw;
    player.bodyYaw = charYaw;
    if (!finite(g.power)) g.power = 0;
    if (!finite(g.swingT)) g.swingT = 0;
    if (!finite(g.aimLen)) g.aimLen = 0;
    if (!finite(charYaw)) charYaw = 0;
    if (!finite(b.pos.x) || !finite(b.pos.y) || !finite(b.pos.z)) {
      const lr = b.lastRest;
      placeBall(b, lr && finite(lr.x) ? lr.x : player.pos.x, lr && finite(lr.z) ? lr.z : player.pos.y);
    }
  }

  /* ---------- the links region and the cart (v8) ---------- */
  const clubhouseRec = () => clubhouse || state.clubhouse || (state.golf && state.golf.clubhouse) || null;
  function rectGap(a, b) {
    const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), dz = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
    return Math.hypot(dx, dz);
  }
  /* The region the cart may use: the golf area polygon (state.golf.area, the plan's points) plus
     the clubhouse lot and the links parking lot (the parking lot nearest the clubhouse lot, the
     plan's 'links-parking'). Built once from the sim state. */
  function buildRegion() {
    regionBuilt = true; regionRects.length = 0;
    const g = golfData();
    regionPts = g && Array.isArray(g.area) && g.area.length >= 3 ? g.area : null;
    const ch = clubhouseRec();
    const chLot = ch && ch.lot && finite(ch.lot.x) && finite(ch.lot.w) ? ch.lot : null;
    if (chLot) regionRects.push(chLot);
    const lots = state.lots || [];
    let best = null, bd = 12;
    for (let i = 0; i < lots.length; i++) {
      const l = lots[i];
      if (!l || l.kind !== 'parking' || !finite(l.x) || !finite(l.w)) continue;
      const d = chLot ? rectGap(l, chLot) : Infinity;
      const named = typeof l.id === 'string' && l.id.indexOf('links') >= 0;
      if (named && !(best && typeof best.id === 'string' && best.id.indexOf('links') >= 0)) { best = l; bd = -1; continue; }
      if (bd >= 0 && d < bd) { bd = d; best = l; }
    }
    if (best) regionRects.push(best);
  }
  function inRegion(px, pz) {
    if (!regionBuilt) buildRegion();
    for (let i = 0; i < regionRects.length; i++) if (inRect(px, pz, regionRects[i])) return true;
    if (regionPts) return pointInPoly(px, pz, regionPts);
    return regionRects.length === 0;
  }
  /* The cart's four point test at radius 0.45: land tiles (B, T, FT, water and the map edge
     block) inside the region. cartOutside tells a boundary push from a tile collision. At a
     radius of 0.5 or more (the route planner's ROUTE_R) the square is wider than a tile, so the
     center and the edge midpoints are tested too; four corners alone would step over a single
     tree tile under the middle and the planner would route through it. */
  // v10: a cart path tile is open to the cart wherever it runs (the spur to the island footbridge)
  /* v10 review: a one tile foot bridge (WORLD_DESIGN 'island-bridge': the walk out to the hole 6
     island is on foot) is closed to the cart, so the planner never routes over its deck and a
     goal beyond it fails at once instead of after the replans. The links footbridge is 2 wide. */
  let narrowBridgeTiles = null;
  function narrowBridgeAt(tx, tz) {
    if (!narrowBridgeTiles) {
      narrowBridgeTiles = new Set();
      const bs = state.bridges || [];
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (!b || !Array.isArray(b.tiles) || !(b.island || !(b.width >= 2))) continue;
        for (let k = 0; k < b.tiles.length; k++) { const t = b.tiles[k]; if (t && finite(t.x) && finite(t.y)) narrowBridgeTiles.add(t.y * COLS + t.x); }
      }
    }
    return narrowBridgeTiles.has(tz * COLS + tx);
  }
  const cartPointOK = (px, pz) => {
    const tx = Math.floor(px), tz = Math.floor(pz), v = at(tx, tz);
    return land(v) && (v === CP || inRegion(px, pz)) && !(v === BR && narrowBridgeAt(tx, tz)) && !kickerTileAt(tx, tz);   // v11: a kicker is a low obstacle
  };
  /* The island hole whose island holds (x, z): the hole's island polygon, else its raster tiles. */
  function islandHoleAt(x, z) {
    const g = golfData();
    const holes = g && g.holes;
    if (!holes) return null;
    const tx = Math.floor(x), tz = Math.floor(z);
    for (let i = 0; i < holes.length; i++) {
      const H = holes[i], isl = H && H.island;
      if (!isl) continue;
      if (Array.isArray(isl.pts) && isl.pts.length >= 3 && pointInPoly(x, z, isl.pts)) return H;
      const tiles = isl.tiles;
      if (Array.isArray(tiles)) for (let k = 0; k < tiles.length; k++) if (tiles[k] && tiles[k].x === tx && tiles[k].y === tz) return H;
    }
    return null;
  }
  /* The cart's stop at the shore foot of an island hole's bridge: the first non bridge land tile
     past the bridge end farther from the cup (the cart path spur's end), facing the bridge. */
  function islandBridgeFoot(H, out) {
    out.ok = false;
    const bs = state.bridges || [];
    let b = null;
    for (let i = 0; i < bs.length; i++) { const r = bs[i]; if (r && r.a && r.b && ((H.bridge && r.id === H.bridge) || (!H.bridge && r.island))) { b = r; break; } }
    if (!b) return out;
    const cx = H.cup ? H.cup.x : H.tee.x, cz = H.cup ? H.cup.y : H.tee.y;
    const da = Math.hypot(b.a[0] + 0.5 - cx, b.a[1] + 0.5 - cz), db = Math.hypot(b.b[0] + 0.5 - cx, b.b[1] + 0.5 - cz);
    const far = da >= db ? b.a : b.b, near = da >= db ? b.b : b.a;
    const dx = Math.sign(far[0] - near[0]), dz = Math.sign(far[1] - near[1]);
    if (dx === 0 && dz === 0) return out;
    for (let k = 1; k <= 8; k++) {
      const tx = far[0] + dx * k, tz = far[1] + dz * k, v = at(tx, tz);
      if (v === BR) continue;
      if (!land(v)) break;
      const x = tx + 0.5, z = tz + 0.5;
      if (cartFits(x, z)) { out.x = x; out.z = z; out.yaw = Math.atan2(-dx, -dz); out.ok = true; return out; }
    }
    return out;
  }
  /* The drive to the bridge foot (kind 'foot': stop there, the visitor walks the bridge). */
  function driveToBridgeFoot(H) {
    islandBridgeFoot(H, SPOT);
    if (!SPOT.ok) { setMessage('No cart route, walk from here'); return false; }
    if (!startAuto('foot', SPOT.x, SPOT.z, SPOT.yaw)) return false;
    setMessage('Walk over the footbridge');
    return true;
  }
  function cartFitsR(x, z, r) {
    if (!(cartPointOK(x - r, z - r) && cartPointOK(x + r, z - r) && cartPointOK(x - r, z + r) && cartPointOK(x + r, z + r))) return false;
    if (r < 0.5) return true;
    return cartPointOK(x, z) && cartPointOK(x - r, z) && cartPointOK(x + r, z) && cartPointOK(x, z - r) && cartPointOK(x, z + r);
  }
  const cartFits = (x, z) => cartFitsR(x, z, CART_R);
  const regionOrPath = (px, pz) => inRegion(px, pz) || at(Math.floor(px), Math.floor(pz)) === CP;
  function cartOutside(x, z) {
    return !regionOrPath(x - CART_R, z - CART_R) || !regionOrPath(x + CART_R, z - CART_R) || !regionOrPath(x - CART_R, z + CART_R) || !regionOrPath(x + CART_R, z + CART_R);
  }
  /* Max speed by the tile under the cart center: 8.5 on paths, paving and course grass, 6 on rough, 3.5 on sand, 0 on water. */
  function cartMaxAt(x, z) {
    const v = at(Math.floor(x), Math.floor(z));
    if (!land(v)) return 0;
    if (v === SA) return CART_SAND;
    if (v === T.G || v === T.F) return CART_ROUGH;
    return CART_TOP;
  }
  /* The terrain gradient under a point into GRAD (x, z). ctx.terrain.slopeAt(x, z, out) may fill
     out as { x, z } or { x, y }, or return its own object or pair; all are read. */
  function gradAt(x, z) {
    GRAD.x = 0; GRAD.y = 0; GRAD.z = 0;
    if (!terrain || typeof terrain.slopeAt !== 'function') return;
    let r = null;
    try { r = terrain.slopeAt(x, z, GRAD); } catch (e) { GRAD.x = 0; GRAD.z = 0; return; }
    let gx = GRAD.x, gz = finite(GRAD.z) && GRAD.z !== 0 ? GRAD.z : GRAD.y;
    if (r && r !== GRAD && typeof r === 'object') {
      if (finite(r.x)) gx = r.x; else if (finite(r[0])) gx = r[0];
      if (finite(r.z)) gz = r.z; else if (finite(r.y)) gz = r.y; else if (finite(r[1])) gz = r[1];
    }
    GRAD.x = finite(gx) ? gx : 0; GRAD.z = finite(gz) ? gz : 0;
  }
  function cartHeight(x, z) {
    if (!terrain || typeof terrain.heightAt !== 'function') return 0;
    let h = 0;
    try { h = terrain.heightAt(x, z); } catch (e) { h = 0; }
    return finite(h) ? h : 0;
  }
  /* ctx.vehicles.createCartController is an optional hook reserved for a future module
     (js/vehicles.js holds the cart model only and does not export it, so this returns null
     today). It gets the cart context once and the result is kept on player.cart.controller for
     the renderer. When it opts in with
     drives: true and step(cart, input, dt) (input = CTL_IN: throttle, brake, steer, turn, maxSpeed,
     gradX, gradZ) that step drives the cart record, validated per frame (finite fields, no
     teleport, the four point test); a step that fails three times is dropped for the built in
     model below, which is the driving model otherwise. */
  function makeCartController() {
    const V = ctx.vehicles;
    if (!V || typeof V.createCartController !== 'function') return null;
    try {
      const c = V.createCartController({ sim, state, terrain, at, TILES: T, radius: CART_R, wheelbase: CART_WHEELBASE, fits: cartFits, maxSpeedAt: cartMaxAt, inRegion, cart: CART });
      return c && typeof c === 'object' ? c : null;
    } catch (e) { return null; }
  }
  /* One frame of the driving model (TERRAIN_DESIGN "Cart driving feel"): throttle -1..1 (W and S:
     brake while rolling forward, reverse at 0.4 of the max once stopped), steerIn -1..1 (A and D,
     positive right), turn an in-place yaw rate the auto-drive uses under 1 u/s (a driver gets 0).
     The stored steer angle c.steer follows js/vehicles.js (positive toward local +x, the left, so
     the front wheels and the chassis lean of the cart model read it directly): steerIn is negated
     here and the yaw grows with the steer angle, the sign js/vehicles.js animate expects.
     Bicycle model, wheelbase 1.4, the steer angle eased at 4 rad/s in and 6 back, slope force
     -7 dot(grad, heading), four point collision that slides along walls and stops at water. */
  function stepCart(c, throttle, steerIn, turn, dt) {
    const x0 = c.x, z0 = c.z, y0 = c.yaw, v0 = c.speed, s0 = c.steer;
    steerIn = finite(steerIn) ? -steerIn : 0;
    const maxV = cartMaxAt(c.x, c.z);
    gradAt(c.x, c.z);
    let hx = Math.sin(c.yaw), hz = Math.cos(c.yaw);
    if (cartCtl && cartCtl.drives === true && typeof cartCtl.step === 'function' && cartCtlStrikes < 3) {
      CTL_IN.throttle = Math.max(0, throttle); CTL_IN.brake = Math.max(0, -throttle); CTL_IN.steer = steerIn; CTL_IN.turn = turn;
      CTL_IN.maxSpeed = maxV; CTL_IN.gradX = GRAD.x; CTL_IN.gradZ = GRAD.z;
      let ok = false;
      try {
        cartCtl.step(c, CTL_IN, dt);
        ok = finite(c.x) && finite(c.z) && finite(c.yaw) && finite(c.speed) && finite(c.steer)
          && Math.hypot(c.x - x0, c.z - z0) <= CART_TOP * dt + 0.05 && Math.abs(c.speed) <= CART_TOP + 0.5 && cartFits(c.x, c.z);
      } catch (e) { ok = false; }
      if (ok) { c.yaw = wrap(c.yaw); return; }
      cartCtlStrikes += 1; c.x = x0; c.z = z0; c.yaw = y0; c.speed = v0; c.steer = s0;
    }
    // v11 final: the reverse and forward tests read the speed before the slope term, so a cart at
    // rest on a mild uphill is not read as reversing (and clamped to zero every frame) when the
    // driver or the auto-drive throttles forward
    const v0s = c.speed;
    let v = c.speed;
    v += -CART_SLOPE * (GRAD.x * hx + GRAD.z * hz) * dt;
    if (throttle > 0.05) {
      if (v0s < -0.01) v = Math.min(0, v + CART_BRAKE * dt);
      else if (v < maxV) v = Math.min(maxV, v + CART_ACCEL * throttle * dt);
    } else if (throttle < -0.05) {
      if (v0s > 0.05) v = Math.max(0, v - CART_BRAKE * dt);
      else { const rv = -CART_REVERSE * maxV; if (v > rv) v = Math.max(rv, v + CART_ACCEL * throttle * dt); }
    } else if (v > 0) v = Math.max(0, v - CART_FRICTION * dt);
    else if (v < 0) v = Math.min(0, v + CART_FRICTION * dt);
    if (v > maxV) v = Math.max(maxV, v - CART_BRAKE * dt);
    if (v < -CART_REVERSE * maxV) v = Math.min(-CART_REVERSE * maxV, v + CART_BRAKE * dt);
    if (maxV <= 0) v = 0;
    const sMax = STEER_MAX * (1 - STEER_HIGH * clamp(Math.abs(v) / CART_TOP, 0, 1));
    const target = clamp(steerIn, -1, 1) * sMax;
    const rate = Math.abs(target) > Math.abs(c.steer) ? STEER_IN : STEER_BACK;
    c.steer = clamp(c.steer + clamp(target - c.steer, -rate * dt, rate * dt), -STEER_MAX, STEER_MAX);
    let yaw = c.yaw + v / CART_WHEELBASE * Math.tan(c.steer) * dt;
    if (turn !== 0 && Math.abs(v) < 1.0) yaw += turn * dt;
    c.yaw = wrap(finite(yaw) ? yaw : y0);
    hx = Math.sin(c.yaw); hz = Math.cos(c.yaw);
    const nx = c.x + hx * v * dt, nz = c.z + hz * v * dt;
    if (cartFits(nx, nz)) { c.x = nx; c.z = nz; }
    else {
      // slide along the wall: keep the component that fits, and scrub the speed by what was lost
      const px = c.x, pz = c.z;
      if (cartFits(nx, c.z)) c.x = nx;
      if (cartFits(c.x, nz)) c.z = nz;
      if (cartOutside(nx, nz)) boundaryT = clock;
      const want = Math.hypot(nx - px, nz - pz), got = Math.hypot(c.x - px, c.z - pz);
      v *= want > 1e-9 ? clamp(got / want, 0, 1) : 0;
      if (Math.abs(v) < 0.05) v = 0;
    }
    c.speed = finite(v) ? v : 0;
    if (!finite(c.x) || !finite(c.z)) { c.x = x0; c.z = z0; c.speed = 0; }
    if (!finite(c.steer)) c.steer = 0;
  }
  /* ---- auto-drive (Tab): a straight line when clear, else a tile route string pulled ----
     Routes are planned with a 0.7 margin first (ROUTE_R, so the cart's turn-in transient never
     clips a tree beside a one tile corridor) and with the bare 0.45 radius when no wide route
     exists; the segments touching the start and the goal always use the bare radius. */
  function lineClear(ax, az, bx, bz, r) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / PATH_STEP));
    for (let i = 1; i <= n; i++) { const t = i / n; if (!cartFitsR(ax + (bx - ax) * t, az + (bz - az) * t, r)) return false; }
    return true;
  }
  /* v10: the planner's tile cost (paths and paving cheap, grass dear) and whether a straight
     segment stays on cheap tiles (the tiles under its two ends excepted), which decides whether
     the string pull may take it when the route rides the cart paths. */
  const tileCost = (tx, tz) => (paved(at(tx, tz)) ? ROUTE_COST_PATH : ROUTE_COST_GRASS);
  function lineCheap(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / PATH_STEP));
    const sx = Math.floor(ax), sz = Math.floor(az), ex = Math.floor(bx), ez = Math.floor(bz);
    for (let i = 1; i < n; i++) {
      const t = i / n, tx = Math.floor(ax + (bx - ax) * t), tz = Math.floor(az + (bz - az) * t);
      if ((tx === sx && tz === sz) || (tx === ex && tz === ez)) continue;
      if (tileCost(tx, tz) !== ROUTE_COST_PATH) return false;
    }
    return true;
  }
  /* A binary heap of tile indices keyed by bfsCost (the planner's open set). */
  function heapPush(i) {
    let n = heapN++;
    bfsHeap[n] = i;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (bfsCost[bfsHeap[p]] <= bfsCost[bfsHeap[n]]) break;
      const t = bfsHeap[p]; bfsHeap[p] = bfsHeap[n]; bfsHeap[n] = t; n = p;
    }
  }
  function heapPop() {
    const top = bfsHeap[0], last = bfsHeap[--heapN];
    if (heapN > 0) {
      bfsHeap[0] = last;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1;
        let m = n;
        if (l < heapN && bfsCost[bfsHeap[l]] < bfsCost[bfsHeap[m]]) m = l;
        if (r < heapN && bfsCost[bfsHeap[r]] < bfsCost[bfsHeap[m]]) m = r;
        if (m === n) break;
        const t = bfsHeap[m]; bfsHeap[m] = bfsHeap[n]; bfsHeap[n] = t; n = m;
      }
    }
    return top;
  }
  function planRoute(c, tx, tz, out, r) {
    out.length = 0;
    if (lineClear(c.x, c.z, tx, tz, r) || (r === CART_R && lineClear(c.x, c.z, tx, tz, CART_R))) { out.push({ x: tx, z: tz }); return out; }
    if (!bfsParent) { bfsParent = new Int32Array(COLS * ROWS); bfsQueue = new Int32Array(COLS * ROWS); bfsCost = new Int32Array(COLS * ROWS); bfsDone = new Uint8Array(COLS * ROWS); bfsHeap = new Int32Array(COLS * ROWS * 4); }
    const sx = Math.floor(c.x), sz = Math.floor(c.z), gx = Math.floor(tx), gz = Math.floor(tz);
    if (sx < 0 || sz < 0 || sx >= COLS || sz >= ROWS || gx < 0 || gz < 0 || gx >= COLS || gz >= ROWS) return null;
    const si = sz * COLS + sx, gi = gz * COLS + gx;
    // v10 (CONTRACT_V10 "Thread National"): a shortest path over tile costs (cart path and paving
    // 1, grass 3) so the drive follows the cart path network where one leads toward the goal and
    // cuts across the grass where none does; a tile is tested for the cart's fit on first touch
    bfsParent.fill(-2); bfsCost.fill(0x7fffffff); bfsDone.fill(0);
    heapN = 0;
    bfsParent[si] = -1; bfsCost[si] = 0; heapPush(si);
    while (heapN > 0) {
      const cur = heapPop();
      if (bfsDone[cur]) continue;
      bfsDone[cur] = 1;
      if (cur === gi) break;
      const cx = cur % COLS, cz = (cur - cx) / COLS;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || nz < 0 || nx >= COLS || nz >= ROWS) continue;
        const ni = nz * COLS + nx;
        if (bfsDone[ni]) continue;
        const nc = bfsCost[cur] + tileCost(nx, nz);
        if (nc >= bfsCost[ni]) continue;
        if (bfsParent[ni] === -2 && !(ni === gi ? cartFits(nx + 0.5, nz + 0.5) : cartFitsR(nx + 0.5, nz + 0.5, r))) { bfsDone[ni] = 1; continue; }
        bfsCost[ni] = nc; bfsParent[ni] = cur; heapPush(ni);
      }
    }
    if (bfsParent[gi] === -2 || !bfsDone[gi]) return null;
    const pts = [];
    for (let i = gi; i !== si && i >= 0; i = bfsParent[i]) { const x = i % COLS; pts.push({ x: x + 0.5, z: (i - x) / COLS + 0.5 }); }
    pts.reverse();
    if (pts.length) pts[pts.length - 1] = { x: tx, z: tz }; else pts.push({ x: tx, z: tz });
    // the string pull straightens the tile route; when the route rides the paths (three or more
    // cheap tiles) a shortcut is taken only while its line stays on cheap tiles
    let cheap = 0;
    for (let k = 0; k < pts.length; k++) if (tileCost(Math.floor(pts[k].x), Math.floor(pts[k].z)) === ROUTE_COST_PATH) cheap += 1;
    const keep = cheap >= 3;
    let ax = c.x, az = c.z, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !(lineClear(ax, az, pts[j].x, pts[j].z, (i === 0 || j === pts.length - 1) ? CART_R : r) && (!keep || lineCheap(ax, az, pts[j].x, pts[j].z)))) j--;
      out.push(pts[j]); ax = pts[j].x; az = pts[j].z; i = j + 1;
    }
    return out;
  }
  function routeTo(c, tx, tz, out) {
    return planRoute(c, tx, tz, out, ROUTE_R) || planRoute(c, tx, tz, out, CART_R);
  }
  /* A stop point 1.5 short of (bx, bz) along the line from the cart, else around it. The first
     pass wants the planner's clearance (ROUTE_R) so the spot is one the route can reach (a ball
     beside a tree or a bank gets a spot on its open side); the second takes any spot the cart
     fits in. */
  function stopShort(c, bx, bz, out) {
    let dx = bx - c.x, dz = bz - c.z, d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 0; dz = 1; d = 1; }
    out.ok = false;
    for (let pass = 0; pass < 2; pass++) {
      const r = pass === 0 ? ROUTE_R : CART_R;
      const cand = (x, z) => { if (cartFitsR(x, z, r)) { out.x = x; out.z = z; out.ok = true; return true; } return false; };
      if (cand(bx - dx / d * STOP_SHORT, bz - dz / d * STOP_SHORT)) return out;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (cand(bx + Math.sin(a) * STOP_SHORT, bz + Math.cos(a) * STOP_SHORT)) return out; }
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (cand(bx + Math.sin(a) * 2.5, bz + Math.cos(a) * 2.5)) return out; }
    }
    return out;
  }
  function lotClear(x, z) {
    const lots = state.lots || [];
    for (let i = 0; i < lots.length; i++) { const l = lots[i]; if (l && finite(l.x) && finite(l.w) && distToRect(x, z, l) < PARK_INSET) return false; }
    return true;
  }
  const regionInset = (x, z) => inRegion(x - PARK_INSET, z - PARK_INSET) && inRegion(x + PARK_INSET, z - PARK_INSET) && inRegion(x - PARK_INSET, z + PARK_INSET) && inRegion(x + PARK_INSET, z + PARK_INSET);
  /* The park spot of a tee (TERRAIN_DESIGN): 2.2 behind the tee point along the first segment,
     1.6 to the right of play, else the left, else 3.0 straight behind; on G or FW, 0.6 inside the
     region and 0.6 from any lot. The heading faces the line. */
  function parkSpot(H, out) {
    const tx = H.tee.x, tz = H.tee.y;
    let ux = 0, uz = -1;
    const line = H.line;
    if (line && line.length >= 2 && line[0] && line[1]) { ux = line[1][0] - line[0][0]; uz = line[1][1] - line[0][1]; }
    else if (H.cup) { ux = H.cup.x - tx; uz = H.cup.y - tz; }
    const ul = Math.hypot(ux, uz);
    if (ul > 1e-6) { ux /= ul; uz /= ul; } else { ux = 0; uz = -1; }
    const rx = -uz, rz = ux;
    out.yaw = Math.atan2(ux, uz); out.ok = false;
    const bx = tx - ux * PARK_BACK, bz = tz - uz * PARK_BACK;
    const test = (x, z) => {
      const v = at(Math.floor(x), Math.floor(z));
      if (!(v === T.G || v === FW) || !cartFits(x, z) || !regionInset(x, z) || !lotClear(x, z)) return false;
      out.x = x; out.z = z; out.ok = true; return true;
    };
    if (test(bx + rx * PARK_SIDE, bz + rz * PARK_SIDE)) return out;
    if (test(bx - rx * PARK_SIDE, bz - rz * PARK_SIDE)) return out;
    if (test(tx - ux * PARK_BACK2, tz - uz * PARK_BACK2)) return out;
    for (let r = 2.5; r <= 5; r += 0.5) for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, x = tx + Math.sin(a) * r, z = tz + Math.cos(a) * r;
      if (cartFits(x, z) && regionInset(x, z)) { out.x = x; out.z = z; out.ok = true; return out; }
    }
    return out;
  }
  /* The clubhouse spot: the center of the clubhouse stub, heading out of the lot (the plan's (66, 73), yaw pi). */
  function homeSpot(out) {
    const ch = clubhouseRec();
    const lots = state.lots || [];
    let rec = null;
    for (let i = 0; i < lots.length; i++) if (lots[i] && lots[i].kind === 'clubhouse') { rec = lots[i]; break; }
    let fx = 0, fz = 1;
    const fc = ch && ch.facing;
    if (fc && finite(fc.x) && finite(fc.y) && Math.hypot(fc.x, fc.y) > 1e-6) { fx = fc.x; fz = fc.y; }
    out.yaw = Math.atan2(fx, fz); out.ok = false;
    const stub = rec && rec.stub;
    if (stub && stub.length) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < stub.length; i++) { const t = stub[i]; if (t.x < x0) x0 = t.x; if (t.x + 1 > x1) x1 = t.x + 1; if (t.y < z0) z0 = t.y; if (t.y + 1 > z1) z1 = t.y + 1; }
      out.x = (x0 + x1) / 2; out.z = (z0 + z1) / 2;
      if (cartFits(out.x, out.z)) { out.ok = true; return out; }
    }
    const dp = ch && ch.doorPos;
    if (dp && finite(dp.x) && finite(dp.y)) for (let d = 2.5; d <= 6; d += 0.5) { const x = dp.x + fx * d, z = dp.y + fz * d; if (cartFits(x, z)) { out.x = x; out.z = z; out.ok = true; return out; } }
    return out;
  }
  function startAuto(kind, tx, tz, faceYaw) {
    const c = CART;
    const wps = routeTo(c, tx, tz, []);
    if (!wps) { setMessage('No cart route, walk from here'); return false; }
    c.auto = { kind, wps, i: 0, sx: c.x, sz: c.z, tx, tz, faceYaw, stuckT: -1, backUntil: -1, replans: 0, gx: player.pos.x, gz: player.pos.y, t: 0 };
    return true;
  }
  function replanAuto(c) {
    const A = c.auto;
    if (A.kind === 'fetch') { stopShort(c, player.pos.x, player.pos.y, SPOT); if (SPOT.ok) { A.tx = SPOT.x; A.tz = SPOT.z; } }
    const wps = routeTo(c, A.tx, A.tz, []);
    if (!wps) { c.auto = null; c.speed = 0; setMessage('No cart route, walk from here'); return false; }
    A.wps = wps; A.i = 0; A.sx = c.x; A.sz = c.z; A.stuckT = -1; A.backUntil = -1; A.replans += 1;
    return true;
  }
  function arriveAuto(c, time) {
    const A = c.auto;
    c.auto = null; c.speed = 0; c.steer = 0;
    if (A.kind === 'ball' && GOLF.ball) c.yaw = wrap(Math.atan2(GOLF.ball.pos.x - c.x, GOLF.ball.pos.z - c.z));
    else if (finite(A.faceYaw)) c.yaw = wrap(A.faceYaw);
    if (A.kind === 'fetch') { enterCart(time); startHome(time); }
    else if (A.kind === 'home') { exitCart(time); endRound(true); if (log) log('Back at the clubhouse.', 'info'); }
    else if (A.kind === 'foot') setMessage('Walk over the footbridge');
  }
  function autoStep(c, dt, time) {
    const A = c.auto;
    A.t = (finite(A.t) ? A.t : 0) + dt;
    if (A.t > AUTO_MAX_T) { c.auto = null; c.speed = 0; c.steer = 0; setMessage('The cart gave up, walk from here'); return; }
    if (A.kind === 'fetch' && Math.hypot(player.pos.x - A.gx, player.pos.y - A.gz) > 1.0) { A.gx = player.pos.x; A.gz = player.pos.y; if (!replanAuto(c)) return; }
    if (A.backUntil >= 0) {
      // backing off an obstacle before the new route
      if (time < A.backUntil) { stepCart(c, -1, 0, 0, dt); return; }
      A.backUntil = -1; c.speed = 0;
      replanAuto(c);
      return;
    }
    for (let guard = 0; guard < 8; guard++) {
      const wp = A.wps[A.i], last = A.i >= A.wps.length - 1;
      const dx = wp.x - c.x, dz = wp.z - c.z, d = Math.hypot(dx, dz);
      const errWp = wrap(Math.atan2(dx, dz) - c.yaw);
      if (!last && (d <= WP_REACH || (d < PASSED_D && Math.cos(errWp) < 0))) { A.i += 1; A.sx = wp.x; A.sz = wp.z; continue; }
      if (last && (d <= STOP_AT || (d <= STOP_AT + 0.3 && Math.abs(c.speed) < 0.3) || (d < PASSED_D && Math.cos(errWp) < 0 && Math.abs(c.speed) < 1.5))) { arriveAuto(c, time); return; }
      // pure pursuit along the segment: aim at the point LOOKAHEAD past the closest point on it
      const ex = wp.x - A.sx, ez = wp.z - A.sz, el2 = ex * ex + ez * ez;
      let ax = wp.x, az = wp.z;
      if (el2 > 1e-6) {
        const el = Math.sqrt(el2);
        const t = clamp(((c.x - A.sx) * ex + (c.z - A.sz) * ez) / el2 + LOOKAHEAD / el, 0, 1);
        ax = A.sx + ex * t; az = A.sz + ez * t;
      }
      const err = wrap(Math.atan2(ax - c.x, az - c.z) - c.yaw);
      const maxV = cartMaxAt(c.x, c.z);
      let targetV = maxV;
      if (Math.abs(err) > AUTO_SLOW_ERR) targetV = Math.min(targetV, AUTO_SLOW);
      // the target is beside or behind: stop and pivot in place (the turn below needs speed under 1)
      if (Math.abs(err) > AUTO_PIVOT_ERR) targetV = 0;
      if (last && d - STOP_AT < c.speed * c.speed / (2 * CART_BRAKE) + 0.3) targetV = 0;
      let throttle = 0;
      if (c.speed < targetV - 0.1) throttle = 1; else if (c.speed > targetV + 0.1) throttle = -1;
      if (throttle < 0 && c.speed <= 0.05) { throttle = 0; c.speed = 0; }
      const steerIn = clamp(-err / 0.3, -1, 1);
      const turn = (Math.abs(c.speed) < 1.0 && Math.abs(err) > 0.3) ? clamp(err * 2, -1, 1) * AUTO_TURN : 0;
      const x0 = c.x, z0 = c.z;
      stepCart(c, throttle, steerIn, turn, dt);
      // stuck against something while facing the line: back up, route again, then give up
      if (throttle > 0 && Math.abs(err) <= 0.3 && Math.hypot(c.x - x0, c.z - z0) < 0.3 * dt) {
        if (A.stuckT < 0) A.stuckT = time;
        else if (time - A.stuckT > STUCK_LEN) {
          if (A.replans >= MAX_REPLANS) { c.auto = null; c.speed = 0; setMessage('No cart route, walk from here'); return; }
          A.backUntil = time + BACK_LEN; A.stuckT = -1; c.speed = 0;
        }
      } else A.stuckT = -1;
      return;
    }
  }
  /* ---- the cart in the world ---- */
  function spawnCart() {
    const c = CART;
    homeSpot(SPOT);
    if (SPOT.ok) { c.x = SPOT.x; c.z = SPOT.z; c.yaw = SPOT.yaw; }
    else { c.x = player.pos.x; c.z = player.pos.y; c.yaw = player.yaw; }
    c.speed = 0; c.steer = 0; c.auto = null; c.occupied = false; c.y = cartHeight(c.x, c.z);
    if (cartCtl === null && !c.controller) { cartCtl = makeCartController(); c.controller = cartCtl; }
    player.cart = c;
  }
  function removeCart() { CART.auto = null; CART.occupied = false; CART.speed = 0; CART.steer = 0; player.cart = null; }
  function enterCart(time) {
    const c = CART;
    if (player.cart !== c) return false;
    standUp(); endSwim();
    c.occupied = true;
    player.state = 'cart'; player.pose = 'sit'; player.leisure = null; player.onDeck = false; player.onBoard = false; player.held = null;
    player.exiting = null; player.heightOffset = 0; vel.x = 0; vel.z = 0; hopT0 = -1; player.speed = 0;
    player.pos.x = c.x; player.pos.y = c.z;
    setLookYaw(c.yaw); setMoveDir(Math.sin(c.yaw), Math.cos(c.yaw));
    player.orbitPitch = ORBIT_PITCH_DEF; orbitPitchT = ORBIT_PITCH_DEF;
    doorArmed = false;
    if (c.auto && c.auto.kind === 'fetch') { c.auto = null; startHome(time); }
    return true;
  }
  /* Out to the left side at 1.0 (else the right, else behind); the cart stays where it is. */
  function exitCart(time) {
    const c = CART;
    c.auto = null; c.occupied = false; c.speed = 0; c.steer = 0;
    const hx = Math.sin(c.yaw), hz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
    let x = c.x + lx * EXIT_SIDE, z = c.z + lz * EXIT_SIDE;
    if (!fits(x, z, false)) { x = c.x - lx * EXIT_SIDE; z = c.z - lz * EXIT_SIDE; }
    if (!fits(x, z, false)) { x = c.x - hx * EXIT_SIDE; z = c.z - hz * EXIT_SIDE; }
    if (!fits(x, z, false)) { x = c.x; z = c.z; }
    player.pos.x = x; player.pos.y = z;
    player.state = 'idle'; player.pose = 'stand'; player.speed = 0; vel.x = 0; vel.z = 0; player.heightOffset = 0;
    player.yaw = c.yaw; player.targetYaw = c.yaw; player.bodyYaw = c.yaw;
    setMoveDir(hx, hz);
    if (!fits(x, z, false)) findFreeSpot(x, z);
    doorArmed = false;
  }
  /* Per frame while a cart exists: the auto-drive, else the driver's input, and the seat. */
  function updateCart(dt, time) {
    const c = CART;
    const seatedIn = inCart();
    if (c.auto) autoStep(c, dt, time);
    else if (seatedIn) stepCart(c, inp.fwd, inp.side, 0, dt);
    c.y = cartHeight(c.x, c.z);
    if (!inCart()) return;         // the arrival may have stepped out
    player.pos.x = c.x; player.pos.y = c.z;
    player.yaw = c.yaw; player.targetYaw = c.yaw; player.bodyYaw = c.yaw;
    player.moveDir.x = Math.sin(c.yaw); player.moveDir.z = Math.cos(c.yaw);
    if (Math.abs(player.moveDir.x) > 0.05) player.facing = player.moveDir.x > 0 ? 1 : -1;
    player.pose = 'sit'; player.speed = Math.abs(c.speed); vel.x = 0; vel.z = 0; player.yoff = 0;
    player.animT += dt;
    if (clock - lastMouseT > CART_CAM_QUIET) {
      const d = wrap(c.yaw - orbitYawT), mx = CART_CAM_ALIGN * dt, st = clamp(d, -mx, mx);
      orbitYawT = wrap(orbitYawT + st); player.orbitYaw = wrap(player.orbitYaw + st);
    }
  }
  function startHome(time) {
    homeSpot(SPOT);
    if (!SPOT.ok) return false;
    return startAuto('home', SPOT.x, SPOT.z, SPOT.yaw);
  }
  /* Tab in the cart: to the ball (phase 'ready'; to the island bridge foot when the ball lies on
     the island), the next tee's park spot ('between') or the clubhouse ('done'); Tab while
     auto-driving cancels it. The drive follows routeTo waypoints by
     pure pursuit, brakes to pivot in place when the target is beside or behind it, backs off and
     replans when stuck, and gives up after AUTO_MAX_T seconds. */
  function startAutoDrive(time) {
    const c = CART;
    if (!inCart()) return;
    if (c.auto) { c.auto = null; return; }
    if (!inRound()) return;
    const g = GOLF;
    if (g.phase === 'ready' && g.ball) {
      // v10 review: a ball on the island hole's island is reached on foot over the footbridge
      const HI = islandHoleAt(g.ball.pos.x, g.ball.pos.z);
      if (HI) { driveToBridgeFoot(HI); return; }
      stopShort(c, g.ball.pos.x, g.ball.pos.z, SPOT);
      if (!SPOT.ok) { setMessage('No cart route, walk from here'); return; }
      startAuto('ball', SPOT.x, SPOT.z, NaN);
    } else if (g.phase === 'between') {
      const H = holeAt(g.hole);
      if (!H || !H.tee) return;
      parkSpot(H, SPOT);
      if (!SPOT.ok) { setMessage('No cart route, walk from here'); return; }
      startAuto('tee', SPOT.x, SPOT.z, SPOT.yaw);
    } else if (g.phase === 'done') startHome(time);
  }

  /* ---------- the scooter (v9) ---------- */
  /* Rideable tiles: everything the visitor walks on except greens (GR has its own hint); water,
     buildings, trees, fences and the map edge block. */
  const scootTileOK = v => land(v) && v !== GR;
  const scootPointOK = (px, pz) => { const tx = Math.floor(px), tz = Math.floor(pz); return scootTileOK(at(tx, tz)) && !kickerTileAt(tx, tz); };   // v11: kickers block
  const scootPointGreen = (px, pz) => at(Math.floor(px), Math.floor(pz)) === GR;
  function scootBad(x, z) {
    return (scootPointOK(x - SCOOT_R, z - SCOOT_R) ? 0 : 1) + (scootPointOK(x + SCOOT_R, z - SCOOT_R) ? 0 : 1)
      + (scootPointOK(x - SCOOT_R, z + SCOOT_R) ? 0 : 1) + (scootPointOK(x + SCOOT_R, z + SCOOT_R) ? 0 : 1);
  }
  const scootFits = (x, z) => scootBad(x, z) === 0;
  function scootTouchesGreen(x, z) {
    return scootPointGreen(x - SCOOT_R, z - SCOOT_R) || scootPointGreen(x + SCOOT_R, z - SCOOT_R)
      || scootPointGreen(x - SCOOT_R, z + SCOOT_R) || scootPointGreen(x + SCOOT_R, z + SCOOT_R);
  }
  /* Max speed by the tile under the center: 7.5 paved, 5.5 grass and course grass, 2 sand, 0 blocked. */
  function scootMaxAt(x, z) {
    const v = at(Math.floor(x), Math.floor(z));
    if (!scootTileOK(v)) return 0;
    if (v === SA) return SCOOT_SAND;
    if (v === T.G || v === T.F || v === FW || v === TEE) return SCOOT_GRASS;
    return SCOOT_FAST;      // P, Z, SW, CW, PK, BR
  }
  const scooterList = () => state.scooters || [];
  function scooterById(id) {
    const list = scooterList();
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  const rackList = () => state.racks || [];
  /* A rack's world position: pos when given, else the tile center of integer x, y (CONTRACT_V9). */
  function rackX(r) { if (r.pos && finite(r.pos.x)) return r.pos.x; return Number.isInteger(r.x) ? r.x + 0.5 : r.x; }
  function rackZ(r) { if (r.pos && finite(r.pos.y)) return r.pos.y; return Number.isInteger(r.y) ? r.y + 0.5 : r.y; }
  const scootFree = s => !!s && (s.rider === null || s.rider === undefined) && finite(s.x) && finite(s.y);
  /* The scooter the grab prompt points at into SPICK: the nearest free scooter within 1.6, or the
     nearest one slotted in a rack whose center is within 1.6. */
  function pickScooter(px, pz) {
    SPICK.s = null; SPICK.d = Infinity;
    const list = scooterList();
    if (!list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!scootFree(s)) continue;
      const d = Math.hypot(s.x - px, s.y - pz);
      if (d <= SCOOT_REACH && d < SPICK.d) { SPICK.s = s; SPICK.d = d; }
    }
    const racks = rackList();
    for (let i = 0; i < racks.length; i++) {
      const r = racks[i];
      if (!r || !Array.isArray(r.scooters)) continue;
      const rd = Math.hypot(rackX(r) - px, rackZ(r) - pz);
      if (!(rd <= SCOOT_REACH) || !(rd < SPICK.d)) continue;
      let best = null, bd = Infinity;
      for (let k = 0; k < r.scooters.length; k++) {
        const id = r.scooters[k];
        if (id === null || id === undefined) continue;
        const s = scooterById(id);
        if (!scootFree(s)) continue;
        const d = Math.hypot(s.x - px, s.y - pz);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) { SPICK.s = best; SPICK.d = rd; }
    }
    return !!SPICK.s;
  }
  const simFn = name => (typeof sim[name] === 'function' ? sim[name] : (tt() && tt().sim && typeof tt().sim[name] === 'function' ? tt().sim[name] : null));
  /* TT.sim.takeScooter, else the same effect on the record (a sim that predates v9 scooters). */
  function simTake(s) {
    const fn = simFn('takeScooter');
    if (fn) {
      let r;
      try { r = fn(s.id, 'player'); } catch (e) { return false; }
      if (r === false || r === null) return false;
      if (s.rider !== undefined && s.rider !== null && s.rider !== 'player') return false;
      if (s.rider !== 'player') s.rider = 'player';
      return true;
    }
    if (!scootFree(s)) return false;
    const racks = rackList();
    for (let i = 0; i < racks.length; i++) {
      const r = racks[i];
      if (!r || !Array.isArray(r.scooters)) continue;
      for (let k = 0; k < r.scooters.length; k++) if (r.scooters[k] === s.id) r.scooters[k] = null;
    }
    s.rider = 'player'; s.parked = false; s.rackId = null;
    return true;
  }
  /* TT.sim.parkScooter(id, x, y, yaw), else free-park the record where it stands. */
  function simPark(s, x, z, yaw) {
    const fn = simFn('parkScooter');
    if (fn) {
      try { fn(s.id, x, z, yaw); } catch (e) { /* fall through to the record */ }
      if (s.rider === 'player') { s.rider = null; s.parked = true; s.x = x; s.y = z; s.yaw = yaw; if (s.rackId === undefined) s.rackId = null; }
      return;
    }
    s.rider = null; s.parked = true; s.x = x; s.y = z; s.yaw = yaw; s.rackId = null;
  }
  /* ctx.vehicles.createScooterController(opts): the optional step hook, made once on first ride. */
  function makeScooterController() {
    scootCtlTried = true;
    const V = ctx.vehicles;
    if (!V || typeof V.createScooterController !== 'function') return null;
    try {
      // v10: every SCOOTER_FEEL number by name (plus the record as feel and numbers), so the
      // controller rides with the same throttle, brake, steering and launch boost as the built in model
      const c = V.createScooterController({
        sim, state, terrain, at, TILES: T, radius: SCOOT_R, wheelbase: SCOOT_WB, steerBase: SCOOT_WB, fits: scootFitsRel, maxSpeedAt: scootMaxAt, scooter: SCOOT,
        feel: SCOOTER_FEEL, numbers: SCOOTER_FEEL,
        accel: SCOOT_ACCEL, brake: SCOOT_BRAKE, friction: SCOOT_FRICTION, topSpeed: SCOOT_FAST, grassSpeed: SCOOT_GRASS, sandSpeed: SCOOT_SAND,
        launchBoost: SCOOT_LAUNCH_BOOST, launchLen: SCOOT_LAUNCH_LEN, launchSpeed: SCOOT_LAUNCH_V,
        steerMax: SCOOT_STEER_MAX, steerMin: SCOOTER_FEEL.steerMin, steerHighCut: SCOOT_STEER_HIGH, steerRate: SCOOT_STEER_IN, centerRate: SCOOT_STEER_BACK,
        pivotSpeed: SCOOT_PIVOT_V, pivotRate: SCOOT_PIVOT_RATE, slopeK: SCOOT_SLOPE, leanMax: SCOOT_LEAN_MAX, leanK: SCOOT_LEAN_K, leanRate: SCOOT_LEAN_RATE,
      });
      return c && typeof c === 'object' && typeof c.step === 'function' ? c : null;
    } catch (e) { return null; }
  }
  /* The built in riding model (js/vehicles.js createScooterController, mirrored): throttle -1..1
     (W accelerates, S only brakes, no reverse), steerIn -1..1 positive left (the cart sign), the
     slope force, a bicycle model on the SCOOTER_FEEL steer base, the steer angle eased in at
     steerRate and back at centerRate, a slow pivot under pivotSpeed so a stopped rider can turn
     the bars. v10: boost multiplies the throttle response (the launch boost from rest). Writes
     speed, steer and yaw; the caller moves. */
  function stepScooterOwn(s, throttle, steerIn, maxV, dt, boost) {
    let v = s.speed;
    const accel = SCOOT_ACCEL * (finite(boost) && boost > 0 ? boost : 1);
    v -= SCOOT_SLOPE * (GRAD.x * Math.sin(s.yaw) + GRAD.z * Math.cos(s.yaw)) * dt;
    if (throttle < -0.05) v = Math.max(0, v - SCOOT_BRAKE * -throttle * dt);
    else if (throttle > 0.05) { if (v < maxV) v = Math.min(maxV, v + accel * throttle * dt); }
    else if (v > 0) v = Math.max(0, v - SCOOT_FRICTION * dt);
    if (v > maxV) v = Math.max(maxV, v - SCOOT_BRAKE * dt);
    if (v < 0 || maxV <= 0) v = 0;
    const sMax = SCOOT_STEER_MAX * (1 - SCOOT_STEER_HIGH * clamp(v / SCOOT_FAST, 0, 1));
    const target = clamp(steerIn, -1, 1) * sMax;
    const rate = Math.abs(target) > Math.abs(s.steer) ? SCOOT_STEER_IN : SCOOT_STEER_BACK;
    s.steer = clamp(s.steer + clamp(target - s.steer, -rate * dt, rate * dt), -SCOOT_STEER_MAX, SCOOT_STEER_MAX);
    let yaw = s.yaw + v / SCOOT_WB * Math.tan(s.steer) * dt;
    if (v < SCOOT_PIVOT_V) yaw += clamp(steerIn, -1, 1) * SCOOT_PIVOT_RATE * (1 - v / SCOOT_PIVOT_V) * dt;
    s.yaw = wrap(finite(yaw) ? yaw : s.yaw);
    s.speed = finite(v) ? v : 0;
  }
  /* The lean the renderer gives the deck: eased toward -0.15 * steer * speed, at most 0.22 rad
     (the js/vehicles.js animateScooter rule, so player.scooter.lean matches the drawn roll). */
  function easeLean(s, dt) {
    const target = clamp(-SCOOT_LEAN_K * s.steer * s.speed, -SCOOT_LEAN_MAX, SCOOT_LEAN_MAX);
    const k = 1 - Math.exp(-SCOOT_LEAN_RATE * dt);
    const l = (finite(s.lean) ? s.lean : 0) + (target - (finite(s.lean) ? s.lean : 0)) * k;
    s.lean = finite(l) ? clamp(l, -SCOOT_LEAN_MAX, SCOOT_LEAN_MAX) : 0;
  }
  /* The collision rule both models share: a spot is open when it leaves no more radius points
     misplaced than the start of this step (0 normally), so a spot that started half blocked (a
     tight rack slot) can always be left. scootBad0 is set before each step. */
  let scootBad0 = 0;
  const scootFitsRel = (x, z) => finite(x) && finite(z) && scootBad(x, z) <= scootBad0;
  /* One frame: the controller (validated) or the built in model; the scooter moves by the four
     point test from where it was, sliding along walls and scrubbing the speed by what was lost.
     A push into a green (a blocked move, or a bump, with a radius point on GR just ahead) raises
     the green hint. */
  function stepScooter(s, fwd, side, dt) {
    const x0 = s.x, z0 = s.z, y0 = s.yaw, v0 = s.speed, st0 = s.steer;
    const steerIn = finite(side) ? -side : 0;
    const throttle = finite(fwd) ? fwd : 0;
    const maxV = scootMaxAt(x0, z0);
    scootBad0 = scootBad(x0, z0);
    gradAt(x0, z0);
    // v10: the launch boost window opens when the throttle opens from (near) rest and re-arms once
    // it is released; both models get the multiplier (the controller as input.boost)
    if (throttle > 0.05) { if (launchArmed && v0 < SCOOT_LAUNCH_V) launchUntil = clock + SCOOT_LAUNCH_LEN; launchArmed = false; }
    else launchArmed = true;
    const boost = throttle > 0.05 && clock < launchUntil ? SCOOT_LAUNCH_BOOST : 1;
    let done = false, bumped = false;
    if (scootCtl && scootCtlStrikes < 3) {
      SCOOT_IN.throttle = Math.max(0, throttle); SCOOT_IN.brake = Math.max(0, -throttle); SCOOT_IN.steer = steerIn; SCOOT_IN.turn = 0;
      SCOOT_IN.maxSpeed = maxV; SCOOT_IN.fwd = throttle; SCOOT_IN.side = finite(side) ? side : 0; SCOOT_IN.gradX = GRAD.x; SCOOT_IN.gradZ = GRAD.z; SCOOT_IN.boost = boost;
      let ok = false;
      try {
        s.bumped = false;
        const r = scootCtl.step(s, SCOOT_IN, dt);
        if (r && r !== s && typeof r === 'object') {
          if (finite(r.x)) s.x = r.x; if (finite(r.z)) s.z = r.z; if (finite(r.yaw)) s.yaw = r.yaw;
          if (finite(r.speed)) s.speed = r.speed; if (finite(r.steer)) s.steer = r.steer;
          if (r.bumped) s.bumped = true;
        }
        ok = finite(s.x) && finite(s.z) && finite(s.yaw) && finite(s.speed) && finite(s.steer) && s.speed >= -0.01
          && Math.hypot(s.x - x0, s.z - z0) <= SCOOT_FAST * dt + 0.05 && s.speed <= Math.max(maxV, v0) + 0.5
          && scootFitsRel(s.x, s.z);
      } catch (e) { ok = false; }
      if (ok) { done = true; bumped = !!s.bumped; }
      else { scootCtlStrikes += 1; s.x = x0; s.z = z0; s.yaw = y0; s.speed = v0; s.steer = st0; }
    }
    if (!done) {
      stepScooterOwn(s, throttle, steerIn, maxV, dt, boost);
      const v = s.speed, nx = x0 + Math.sin(s.yaw) * v * dt, nz = z0 + Math.cos(s.yaw) * v * dt;
      if (v > 0 && !scootFitsRel(nx, nz)) {
        bumped = true;
        if (scootFitsRel(nx, z0)) s.x = nx;
        if (scootFitsRel(s.x, nz)) s.z = nz;
        const want = Math.hypot(nx - x0, nz - z0), got = Math.hypot(s.x - x0, s.z - z0);
        let w = v * (want > 1e-9 ? clamp(got / want, 0, 1) : 0);
        if (w < 0.05) w = 0;
        s.speed = w;
      } else if (v > 0) { s.x = nx; s.z = nz; }
    }
    if (bumped || (throttle > 0.05 && s.speed < 0.05)) {
      const hx = Math.sin(s.yaw), hz = Math.cos(s.yaw);
      if (scootTouchesGreen(x0 + hx * 0.1, z0 + hz * 0.1)) greenT = clock;
    }
    // the lie caps the speed whatever proposed it (eased down at the braking rate)
    if (s.speed > maxV) s.speed = Math.max(maxV, Math.min(s.speed, v0 - SCOOT_BRAKE * dt));
    if (!(s.speed > 0) || maxV <= 0) s.speed = 0;
    s.yaw = wrap(finite(s.yaw) ? s.yaw : y0);
    s.x = clamp(s.x, SCOOT_R, COLS - SCOOT_R); s.z = clamp(s.z, SCOOT_R, ROWS - SCOOT_R);
    if (!finite(s.x) || !finite(s.z)) { s.x = x0; s.z = z0; s.speed = 0; }
    if (!finite(s.steer)) s.steer = 0;
    easeLean(s, dt);
  }
  /* E on a scooter: take it from the sim and stand on the deck at its spot (or stay put when the
     slot is too tight for the 0.32 square). */
  function grabScooter(s, time) {
    if (!s || riding() || inCart() || golfing() || player.interior || boating()) return false;
    if (!simTake(s)) return false;
    standUp(); endSwim();
    if (!scootCtlTried) { scootCtl = makeScooterController(); SCOOT.controller = scootCtl; }
    scootRec = s;
    const R = SCOOT;
    R.id = s.id; R.speed = 0; R.steer = 0; R.lean = 0; R.hint = null;
    R.yaw = finite(s.yaw) ? wrap(s.yaw) : player.yaw;
    if (scootFits(s.x, s.y)) { R.x = s.x; R.z = s.y; }
    else if (scootFits(player.pos.x, player.pos.y)) { R.x = player.pos.x; R.z = player.pos.y; }
    else { R.x = s.x; R.z = s.y; }
    R.y = cartHeight(R.x, R.z);
    s.x = R.x; s.y = R.z; s.yaw = R.yaw;
    player.scooter = R; player.state = 'scooter'; player.pose = 'ride';
    player.leisure = null; player.onDeck = false; player.onBoard = false; player.held = null; player.exiting = null;
    player.heightOffset = SCOOT_DECK; vel.x = 0; vel.z = 0; hopT0 = -1; player.speed = 0;
    player.pos.x = R.x; player.pos.y = R.z;
    setLookYaw(R.yaw); setMoveDir(Math.sin(R.yaw), Math.cos(R.yaw));
    player.orbitPitch = ORBIT_PITCH_DEF; orbitPitchT = ORBIT_PITCH_DEF;
    greenT = -Infinity; doorArmed = false;
    if (log) log('On a scooter. W S ride, A D steer, E hop off.', 'info');
    return true;
  }
  /* E while riding: park the scooter where it stands (the sim slots it into a rack within 2) and
     step off to the left side (else the right, behind, or the scooter's own spot). */
  function hopOff(time) {
    if (player.scooter !== SCOOT) return;
    const R = SCOOT, s = scootRec || scooterById(R.id);
    const x = R.x, z = R.z, yaw = R.yaw;
    if (s) simPark(s, x, z, yaw);
    R.speed = 0; R.steer = 0; R.lean = 0; R.hint = null;
    player.scooter = null; scootRec = null;
    const hx = Math.sin(yaw), hz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    let px = x + lx * SCOOT_OFF_SIDE, pz = z + lz * SCOOT_OFF_SIDE;
    if (!fits(px, pz, false)) { px = x - lx * SCOOT_OFF_SIDE; pz = z - lz * SCOOT_OFF_SIDE; }
    if (!fits(px, pz, false)) { px = x - hx * SCOOT_OFF_SIDE; pz = z - hz * SCOOT_OFF_SIDE; }
    if (!fits(px, pz, false)) { px = x; pz = z; }
    player.pos.x = px; player.pos.y = pz;
    player.state = 'idle'; player.pose = 'stand'; player.speed = 0; vel.x = 0; vel.z = 0; player.heightOffset = 0;
    player.yaw = yaw; player.targetYaw = yaw; player.bodyYaw = yaw;
    setMoveDir(hx, hz);
    if (!fits(px, pz, false)) findFreeSpot(px, pz);
    doorArmed = false; greenT = -Infinity;
  }
  /* Per frame while riding: the step, the sim record follows, the body stands on the deck, and the
     orbit settles behind the heading while the mouse is quiet. */
  function updateScooter(dt, time) {
    const R = SCOOT;
    stepScooter(R, inp.fwd, inp.side, dt);
    R.y = cartHeight(R.x, R.z);
    R.hint = time - greenT < SCOOT_HINT_LEN ? GREEN_HINT : null;
    const s = scootRec;
    if (s) { s.x = R.x; s.y = R.z; s.yaw = R.yaw; s.rider = 'player'; s.parked = false; }
    player.pos.x = R.x; player.pos.y = R.z;
    player.yaw = R.yaw; player.targetYaw = R.yaw; player.bodyYaw = R.yaw;
    player.moveDir.x = Math.sin(R.yaw); player.moveDir.z = Math.cos(R.yaw);
    if (Math.abs(player.moveDir.x) > 0.05) player.facing = player.moveDir.x > 0 ? 1 : -1;
    player.pose = 'ride'; player.speed = Math.abs(R.speed); vel.x = 0; vel.z = 0; player.yoff = 0;
    player.animT += dt * (0.5 + Math.abs(R.speed) / 3);
    // v10: the orbit eases toward the heading faster the faster the ride (3.5 to 6 per second)
    if (clock - lastMouseT > SCOOT_CAM_QUIET && Math.abs(R.speed) > 0.3) {
      const kf = clamp(Math.abs(R.speed) / SCOOT_FAST, 0, 1);
      const d = wrap(R.yaw - orbitYawT), st = d * (1 - Math.exp(-dt * lerp(SCOOT_CAM_ALIGN, SCOOT_CAM_ALIGN_FAST, kf)));
      orbitYawT = wrap(orbitYawT + st); player.orbitYaw = wrap(player.orbitYaw + st);
    }
  }

  /* ---------- water levels, the swim ring and the kickers (v11) ---------- */
  const tileKey = (tx, tz) => tz * COLS + tx;
  /* The sim's raster (TT.sim.raster) and the cityplan library (TT.sim.cityplan) when the sim has them. */
  function simRaster() { let r = null; try { r = sim.raster || null; } catch (e) { r = null; } if (!r) { const T0 = tt(); try { r = T0 && T0.sim && T0.sim.raster ? T0.sim.raster : null; } catch (e) { r = null; } } return r; }
  function simLib() { let l = null; try { l = sim.cityplan || null; } catch (e) { l = null; } if (!l) { const T0 = tt(); l = (T0 && T0.cityplan) || null; } return l; }
  /* Built once on first use: the waterway levels and the slow zone per tile (state.waterways, else
     the raster's), the plan's water polygons with the terrain's surface records, the pond swim ring
     (the boat exclusion keys from cityplan boatWater, else the swim spots plus their neighbours)
     and the boat mask (boatWater's mask, null when the library or the raster is missing). */
  function buildWaterMaps() {
    waterMapsBuilt = true;
    wwLevels = new Map(); wwSlow = new Set();
    const ws = Array.isArray(state.waterways) && state.waterways.length ? state.waterways : null;
    const R = simRaster();
    if (ws) {
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i]; if (!w) continue;
        const lvl = finite(w.level) ? w.level : WATERWAY_LEVEL;
        const tiles = w.tiles;
        if (Array.isArray(tiles)) for (let k = 0; k < tiles.length; k++) { const t = tiles[k]; if (!t) continue; const key = tileKey(t.x, t.y); wwLevels.set(key, lvl); if (w.slow) wwSlow.add(key); }
        else if (tiles && typeof tiles.forEach === 'function') tiles.forEach(s => { const c = String(s).split(','); const key = tileKey(+c[0], +c[1]); wwLevels.set(key, lvl); if (w.slow) wwSlow.add(key); });
      }
    } else if (R && Array.isArray(R.waterways)) {
      for (let i = 0; i < R.waterways.length; i++) {
        const w = R.waterways[i]; if (!w) continue;
        const lvl = finite(w.level) ? w.level : WATERWAY_LEVEL;
        if (w.mask) { for (let k = 0; k < w.mask.length; k++) if (w.mask[k]) { wwLevels.set(k, lvl); if (w.slow) wwSlow.add(k); } }
        else if (w.tiles && typeof w.tiles.forEach === 'function') w.tiles.forEach(s => { const c = String(s).split(','); const key = tileKey(+c[0], +c[1]); wwLevels.set(key, lvl); if (w.slow) wwSlow.add(key); });
      }
    }
    waterBodies = [];
    let plan = null; try { plan = sim.PLAN || null; } catch (e) { plan = null; }
    const tw = terrain && Array.isArray(terrain.water) ? terrain.water : null;
    if (plan && Array.isArray(plan.water)) for (let i = 0; i < plan.water.length; i++) {
      const w = plan.water[i];
      if (!w || !Array.isArray(w.pts) || w.pts.length < 3) continue;
      const rec = tw ? tw.find(t => t && t.id === w.id) : null;
      const kind = w.kind || 'river';
      const surface = rec && finite(rec.surface) ? rec.surface : (kind === 'lake' ? LAKE_LEVEL : RIVER_LEVEL);
      waterBodies.push({ id: w.id, kind, pts: w.pts, surface });
    }
    swimRing = new Set(); boatMask = null;
    const lib = simLib();
    let BW = null;
    if (R && lib && typeof lib.boatWater === 'function') { try { BW = lib.boatWater(R); } catch (e) { BW = null; } }
    if (BW && BW.mask && BW.mask.length === COLS * ROWS) {
      boatMask = new Uint8Array(BW.mask);
      if (BW.excluded && typeof BW.excluded.forEach === 'function') BW.excluded.forEach(s => { const c = String(s).split(','); swimRing.add(tileKey(+c[0], +c[1])); });
      closeLowDecks(boatMask, plan);
    } else {
      const sp = state.swimSpots || [];
      for (let i = 0; i < sp.length; i++) { const t = sp[i]; if (!t) continue; swimRing.add(tileKey(t.x, t.y)); swimRing.add(tileKey(t.x + 1, t.y)); swimRing.add(tileKey(t.x - 1, t.y)); swimRing.add(tileKey(t.x, t.y + 1)); swimRing.add(tileKey(t.x, t.y - 1)); }
    }
  }
  /* v11 review: the boat mask closes under every island footbridge (V11_DESIGN 'island-bridge': its
     deck sits 0.3 over the lake, under the contract's 1.2 clearance, and the boat controller treats
     its tiles as a bank), so the hull never passes through the planks. The island bridges come from
     state.bridges (island: true, tiles), else the plan's a..b spans. The other bridges stay open as
     the plan's boatWater has them (the design's boat BFS routes under them). */
  function closeLowDecks(mask, plan) {
    return;   // v11.1: boats pass under every bridge (Jackson's call); the island deck is open too
    // eslint-disable-next-line no-unreachable
    const close = (tx, tz) => { if (tx >= 0 && tz >= 0 && tx < COLS && tz < ROWS) mask[tileKey(tx, tz)] = 0; };
    const sb = Array.isArray(state.bridges) && state.bridges.length ? state.bridges : null;
    if (sb) {
      for (let i = 0; i < sb.length; i++) {
        const b = sb[i]; if (!b || !b.island) continue;
        if (Array.isArray(b.tiles)) for (let k = 0; k < b.tiles.length; k++) { const t = b.tiles[k]; if (t) close(t.x, t.y); }
        else if (b.a && b.b) spanTiles(b, close);
      }
    } else if (plan && Array.isArray(plan.bridges)) {
      for (let i = 0; i < plan.bridges.length; i++) { const b = plan.bridges[i]; if (b && b.island && b.a && b.b) spanTiles(b, close); }
    }
  }
  /* Every tile of a plan bridge's a..b span (width across the axis), through fn(tx, tz). */
  function spanTiles(b, fn) {
    const ax = Math.min(b.a[0], b.b[0]), bx = Math.max(b.a[0], b.b[0]), az = Math.min(b.a[1], b.b[1]), bz = Math.max(b.a[1], b.b[1]);
    const w = Math.max(1, b.width | 0), half = Math.floor((w - 1) / 2);
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      if (ax === bx) for (let o = -half; o < w - half; o++) fn(x + o, z);
      else for (let o = -half; o < w - half; o++) fn(x, z + o);
    }
  }
  const inSwimRing = (tx, tz) => { if (!waterMapsBuilt) buildWaterMaps(); return swimRing.has(tileKey(tx, tz)); };
  const inSlowZone = (tx, tz) => { if (!waterMapsBuilt) buildWaterMaps(); return wwSlow.has(tileKey(tx, tz)); };
  /* The water surface height under a point: the renderer's lookup when given, else the waterway
     tile levels, the pond lot (0.04), the plan's polygons, else a little above the ground. */
  function waterLevel(x, z) {
    if (waterLevelFn) { let v = NaN; try { v = waterLevelFn(x, z); } catch (e) { v = NaN; } if (finite(v)) return v; }
    if (!waterMapsBuilt) buildWaterMaps();
    const tx = Math.floor(x), tz = Math.floor(z);
    const lvl = wwLevels.get(tileKey(tx, tz));
    if (finite(lvl)) return lvl;
    if (typeof sim.lotAt === 'function') { let lot = null; try { lot = sim.lotAt(tx, tz); } catch (e) { lot = null; } if (lot && lot.kind === 'pond') return POND_LEVEL; }
    // the polygons are tested at the tile center (the raster's rule), so a point at the edge of a
    // water tile reads its body's level instead of a step up at the shoreline
    const cx = tx + 0.5, cz = tz + 0.5;
    for (let i = 0; i < waterBodies.length; i++) { const b = waterBodies[i]; if (pointInPoly(cx, cz, b.pts) || pointInPoly(x, z, b.pts)) return b.surface; }
    return cartHeight(x, z) + 0.3;
  }
  /* v14: the marina dock's plank top by city.js's rule: the shore tile's ground, or the water under
     the first deck tile plus 0.35 when that is higher, plus the 0.1 plank. The deck tiles' own
     terrain is the lake bed, under the water. */
  let dockTopY = NaN;
  function dockTop() {
    if (finite(dockTopY)) return dockTopY;
    const m = state.marina;
    if (!m || !m.pos || !m.deck || !m.deck.length || !terrain || typeof terrain.heightAt !== 'function') return -Infinity;
    const top = Math.max(cartHeight(m.pos.x, m.pos.y), waterLevel(m.deck[0].x + 0.5, m.deck[0].y + 0.5) + 0.35) + 0.1;
    if (finite(top)) dockTopY = top;
    return finite(top) ? top : -Infinity;
  }
  /* The surface a hovering board rides over: the terrain (bridge decks and the shaped ground come
     from heightAt), the pier planks and the marina dock over the water, else the water level over
     a water tile. */
  function surfaceAt(x, z) {
    const g = cartHeight(x, z);
    const v = at(Math.floor(x), Math.floor(z));
    if (v === DK) { const d = dockTop(); return d > g ? d : g; }   // v14: the marina dock's planks stand over the lake bed, like the pier's
    if (v !== T.WA) return g;
    if (inPierRect(x, z)) { const pier = state.pier; return Math.max(g, pier && finite(pier.height) ? pier.height : 0.5); }
    const w = waterLevel(x, z);
    return finite(w) && w > g ? w : g;
  }
  /* The kickers: state.kickers (the sim), else the raster's, else the plan's (foot, rot). */
  function buildKickers() {
    kickerList = []; kickerTiles = new Set();
    let src = Array.isArray(state.kickers) && state.kickers.length ? state.kickers : null;
    const R = simRaster();
    if (!src && R && Array.isArray(R.kickers)) src = R.kickers;
    if (!src) { let plan = null; try { plan = sim.PLAN || null; } catch (e) { plan = null; } if (plan && Array.isArray(plan.kickers)) src = plan.kickers; }
    if (!src) return;
    for (let i = 0; i < src.length; i++) {
      const k = src[i]; if (!k) continue;
      const foot = k.foot || (finite(k.x) && finite(k.y) ? { x: k.x, y: k.y } : null);
      if (!foot) continue;
      let dx, dz;
      if (k.dir && finite(k.dir.x)) { dx = k.dir.x; dz = k.dir.y; }
      else { const rot = finite(k.rot) ? k.rot : 0; dx = rot === 90 ? -1 : rot === 270 ? 1 : 0; dz = rot === 0 ? -1 : rot === 180 ? 1 : 0; }   // the plan's facing: 0 north, 90 west, 180 south, 270 east
      const lip = k.lip || { x: foot.x + dx, y: foot.y + dz };
      kickerList.push({ id: k.id || ('kicker' + i), foot: { x: foot.x, y: foot.y }, lip: { x: lip.x, y: lip.y }, dx, dz });
      kickerTiles.add(tileKey(foot.x, foot.y)); kickerTiles.add(tileKey(lip.x, lip.y));
    }
  }
  function kickerTileAt(tx, tz) { if (!kickerTiles) buildKickers(); return kickerTiles.has(tileKey(tx, tz)); }
  function kickerLipAt(tx, tz) {
    if (!kickerList) buildKickers();
    for (let i = 0; i < kickerList.length; i++) { const k = kickerList[i]; if (k.lip.x === tx && k.lip.y === tz) return k; }
    return null;
  }

  /* ---------- the hoverboard (v11) ---------- */
  /* The wallet: ctx.wallet, ctx.getWallet(), else TT.wallet. */
  function walletOf() {
    if (ctx.wallet && typeof ctx.wallet === 'object') return ctx.wallet;
    if (typeof ctx.getWallet === 'function') { const w = ctx.getWallet(); if (w && typeof w === 'object') return w; }
    const T0 = tt();
    return T0 && T0.wallet && typeof T0.wallet === 'object' ? T0.wallet : null;
  }
  function lookOf() { const w = walletOf(); return w && w.equipped && typeof w.equipped === 'object' ? w.equipped : null; }
  function boardOwned() {
    const w = walletOf();
    if (!w) return false;
    if (typeof w.owns === 'function') { try { return !!w.owns(HOVER_ID); } catch (e) { return false; } }
    const o = w.owned;
    if (o && typeof o.has === 'function') return o.has(HOVER_ID);
    if (Array.isArray(o)) return o.indexOf(HOVER_ID) >= 0;
    return !!(o && o[HOVER_ID]);
  }
  /* The hoverboard rides every tile the visitor may walk and every water tile off the pond's swim
     ring; buildings, trees, fences and the map edge block. */
  function hoverPointOK(px, pz) {
    const tx = Math.floor(px), tz = Math.floor(pz), v = at(tx, tz);
    if (land(v)) return true;
    if (v === T.WA) return !inSwimRing(tx, tz);
    return false;
  }
  function hoverBad(x, z) {
    return (hoverPointOK(x - HOVER_R, z - HOVER_R) ? 0 : 1) + (hoverPointOK(x + HOVER_R, z - HOVER_R) ? 0 : 1)
      + (hoverPointOK(x - HOVER_R, z + HOVER_R) ? 0 : 1) + (hoverPointOK(x + HOVER_R, z + HOVER_R) ? 0 : 1);
  }
  let hoverBad0 = 0;
  const hoverFits = (x, z) => finite(x) && finite(z) && hoverBad(x, z) === 0;
  const hoverFitsRel = (x, z) => finite(x) && finite(z) && hoverBad(x, z) <= hoverBad0;
  const hoverMaxAt = (x, z) => (hoverPointOK(x, z) ? HOVER_TOP : 0);
  /* The subway: ctx.inSubway() when the renderer gives it (the runner owns the visitor then). */
  const inSubway = () => { if (!inSubwayFn) return false; try { return !!inSubwayFn(); } catch (e) { return false; } };
  /* ctx.vehicles.createHoverController(opts): the optional step hook, made once on first ride. */
  function makeHoverController() {
    hoverCtlTried = true;
    const V = ctx.vehicles;
    if (!V || typeof V.createHoverController !== 'function') return null;
    try {
      if (!kickerList) buildKickers();
      // the contract numbers by the controller's names (height, topSpeed, boostSpeed, boostLen,
      // boostRecharge, accel, brake, friction, gravity, lift, softDrop, leanMax); the rest is its own
      const c = V.createHoverController({
        sim, state, terrain, at, TILES: T, cols: COLS, rows: ROWS, radius: HOVER_R, fits: hoverFitsRel, surfaceAt, heightAt: surfaceAt, groundAt: cartHeight, waterLevelAt: waterLevel,
        kickers: kickerList, hover: HOVER, feel: HOVER_FEEL, numbers: HOVER_FEEL,
        height: HOVER_H, topSpeed: HOVER_TOP, boostSpeed: HOVER_BOOST, boostLen: HOVER_BOOST_LEN, boostRecharge: HOVER_RECHARGE, accel: HOVER_ACCEL, brake: HOVER_BRAKE, friction: HOVER_FRICTION,
        gravity: HOVER_G, lift: HOVER_LIFT, softDrop: HOVER_SOFT, leanMax: HOVER_LEAN_MAX,
      });
      return c && typeof c === 'object' && typeof c.step === 'function' ? c : null;
    } catch (e) { return null; }
  }
  /* The built in riding model (js/vehicles.js createHoverController, mirrored): the boost clock,
     the velocity vector (throttle and braking along the heading, a lateral slip that bleeds off at
     the grip rate so a hard turn drifts), the yaw rate (fast at low speed, slower at full speed,
     slower again in the air), the lean, the move with the four point test, then the vertical:
     grounded the board follows the surface down at most followDown per second and is left in the
     air past that (a ridge, a cliff, a kicker lip); airborne it falls at 0.4 g with a little lift
     while boosting, lands soft within 2 units of drop and bounces once over it. */
  function stepHoverOwn(h, throttle, steerIn, boostHeld, dt, jump) {
    // the boost clock
    if (boostHeld && h.boostT <= 0 && h.chargeT <= 0 && !h.boosting) { h.boostT = HOVER_BOOST_LEN; h.boosting = true; }
    if (h.boostT > 0) { h.boostT = Math.max(0, h.boostT - dt); if (h.boostT <= 0) { h.chargeT = HOVER_RECHARGE; h.boosting = false; } }
    else { h.boosting = false; if (h.chargeT > 0) h.chargeT = Math.max(0, h.chargeT - dt); }
    const maxV = h.boosting ? HOVER_BOOST : HOVER_TOP;
    const hx = Math.sin(h.yaw), hz = Math.cos(h.yaw), lx = Math.cos(h.yaw), lz = -Math.sin(h.yaw);
    let f = h.vx * hx + h.vz * hz, l = h.vx * lx + h.vz * lz;
    if (!h.airborne && jump) {   // v11.1: the ollie in the built in model
      h.airborne = true; h.launched = true; h.vy = HOVER_JUMP_VY; h.apex = h.y; h.bounced = false; h.airTime = 0;
    }
    if (!h.airborne) {
      if (throttle > 0.05) { if (f < maxV) f = Math.min(maxV, f + HOVER_ACCEL * throttle * dt); }
      else if (throttle < -0.05) { if (f > 0) f = Math.max(0, f - HOVER_BRAKE * -throttle * dt); else f = Math.max(-2, f + HOVER_ACCEL * throttle * 0.4 * dt); }
      else if (f > 0) f = Math.max(0, f - HOVER_FRICTION * dt);
      else if (f < 0) f = Math.min(0, f + HOVER_FRICTION * dt);
      if (f > maxV) f = Math.max(maxV, f - HOVER_BRAKE * dt);
      l *= Math.exp(-HOVER_GRIP * dt);
      if (Math.abs(l) < 0.01) l = 0;
    } else {
      const k = Math.exp(-HOVER_AIR_DRAG * dt);
      f *= k; l *= k;
    }
    // steering: the stored steer eases toward the input, the yaw turns with it
    h.steer += clamp(clamp(steerIn, -1, 1) - h.steer, -HOVER_STEER_RATE * dt, HOVER_STEER_RATE * dt);
    const sp0 = Math.hypot(f, l);
    const rate = h.airborne ? HOVER_YAW_AIR : lerp(HOVER_YAW_LOW, HOVER_YAW_HIGH, clamp(sp0 / HOVER_BOOST, 0, 1));
    h.yaw = wrap(h.yaw + h.steer * rate * dt);
    const nhx = Math.sin(h.yaw), nhz = Math.cos(h.yaw), nlx = Math.cos(h.yaw), nlz = -Math.sin(h.yaw);
    // the velocity keeps its world direction while the heading turns (the drift); on the ground the
    // slip is re-expressed in the new frame so the grip pulls it back toward the heading
    let vx = h.vx, vz = h.vz;
    if (!h.airborne || sp0 > 0) { vx = hx * f + lx * l; vz = hz * f + lz * l; }
    const fn = vx * nhx + vz * nhz, ln = vx * nlx + vz * nlz;
    h.vx = nhx * fn + nlx * ln; h.vz = nhz * fn + nlz * ln;
    const leanT = clamp(-HOVER_LEAN_K * h.steer * Math.hypot(h.vx, h.vz), -HOVER_LEAN_MAX, HOVER_LEAN_MAX);
    h.lean += (leanT - h.lean) * (1 - Math.exp(-HOVER_LEAN_RATE * dt));
    // the move
    const x0 = h.x, z0 = h.z;
    const nx = x0 + h.vx * dt, nz = z0 + h.vz * dt;
    if (hoverFitsRel(nx, nz)) { h.x = nx; h.z = nz; }
    else {
      if (hoverFitsRel(nx, z0)) h.x = nx; else h.vx = 0;
      if (hoverFitsRel(h.x, nz)) h.z = nz; else h.vz = 0;
    }
    h.x = clamp(h.x, HOVER_R, COLS - HOVER_R); h.z = clamp(h.z, HOVER_R, ROWS - HOVER_R);
    if (h.x !== nx && Math.abs(h.x - x0) < 1e-9) h.vx = 0;
    if (h.z !== nz && Math.abs(h.z - z0) < 1e-9) h.vz = 0;
    // the vertical
    h.ground = cartHeight(h.x, h.z); h.surface = surfaceAt(h.x, h.z);
    const target = h.surface + HOVER_H;
    if (!h.airborne) {
      if (target >= h.y) h.y = target;
      else if (target >= h.y - HOVER_FOLLOW * dt) h.y = target;
      else { h.y -= HOVER_FOLLOW * dt; h.airborne = true; h.vy = -HOVER_FOLLOW * 0.5; h.apex = h.y; h.bounced = false; }
    } else {
      h.vy -= HOVER_G * dt;
      if (h.boosting && boostHeld) h.vy += HOVER_LIFT * dt;
      h.y += h.vy * dt;
      if (h.y > h.apex) h.apex = h.y;
      if (h.y <= target) {
        const drop = h.apex - target;
        h.y = target;
        if (drop > HOVER_SOFT && !h.bounced) { h.vy = Math.min(HOVER_BOUNCE_MAX, drop * HOVER_BOUNCE_K); h.bounced = true; h.apex = h.y; h.dip = 1; h.dipT = clock; }
        else { h.airborne = false; h.vy = 0; h.bounced = false; if (drop > 0.3) { h.dip = clamp(drop / HOVER_SOFT, 0.3, 1); h.dipT = clock; } }
      }
    }
    h.speed = Math.hypot(h.vx, h.vz);
    if (!finite(h.x) || !finite(h.z)) { h.x = x0; h.z = z0; h.vx = 0; h.vz = 0; h.speed = 0; }
    if (!finite(h.y)) h.y = target;
    if (!finite(h.vy)) h.vy = 0;
    if (!finite(h.yaw)) h.yaw = Math.PI;
    if (!finite(h.steer)) h.steer = 0;
    if (!finite(h.lean)) h.lean = 0;
  }
  /* The kickers, after either model: riding onto a lip tile in the ramp's direction arms the launch;
     leaving the lip fires it (vy at least kickK times the speed, airborne). The terrain's shaped
     lip gives the controller its own climb rate too; this makes the launch read on a flat lip. */
  function applyKicker(h) {
    const lip = kickerLipAt(Math.floor(h.x), Math.floor(h.z));
    const speed = Math.hypot(h.vx, h.vz);
    if (lip) {
      if (!h.airborne && speed >= HOVER_KICK_MIN && (h.vx * lip.dx + h.vz * lip.dz) > 0.3 * speed) h.kickArmed = true;
      else if (h.airborne) h.kickArmed = false;
    } else if (h.kickArmed) {
      h.kickArmed = false;
      if (speed >= HOVER_KICK_MIN) { h.airborne = true; h.launched = true; h.vy = Math.max(finite(h.vy) ? h.vy : 0, speed * HOVER_KICK); h.apex = h.y; h.bounced = false; h.airTime = 0; h.kicks += 1; }
    }
  }
  /* One frame: the controller (validated) or the built in model, then the kickers. The controller
     keeps its own fields on the record (dir, boostLeft, boostCd); the contract's vx, vz, boostT and
     chargeT are derived from them after its step, and the built in model keeps dir in step. */
  function stepHover(h, fwd, side, boostHeld, dt, jump) {
    const x0 = h.x, z0 = h.z, y0 = h.y, yaw0 = h.yaw, vx0 = h.vx, vz0 = h.vz, vy0 = h.vy, st0 = h.steer, air0 = h.airborne, bt0 = h.boostT, ct0 = h.chargeT;
    const steerIn = finite(side) ? -side : 0, throttle = finite(fwd) ? fwd : 0;
    hoverBad0 = hoverBad(x0, z0);
    let done = false;
    if (hoverCtl && hoverCtlStrikes < 3) {
      gradAt(x0, z0);
      HOVER_IN.throttle = Math.max(0, throttle); HOVER_IN.brake = Math.max(0, -throttle); HOVER_IN.steer = steerIn; HOVER_IN.fwd = throttle; HOVER_IN.side = finite(side) ? side : 0;
      HOVER_IN.jump = !!jump;   // v11.1: the ollie edge
      HOVER_IN.boost = !!boostHeld; HOVER_IN.boosting = h.boosting; HOVER_IN.maxSpeed = HOVER_BOOST; HOVER_IN.surfaceY = surfaceAt(x0, z0); HOVER_IN.groundY = cartHeight(x0, z0); HOVER_IN.gradX = GRAD.x; HOVER_IN.gradZ = GRAD.z;
      let ok = false;
      try {
        const r = hoverCtl.step(h, HOVER_IN, dt);
        if (r && r !== h && typeof r === 'object') {
          if (finite(r.x)) h.x = r.x; if (finite(r.z)) h.z = r.z; if (finite(r.y)) h.y = r.y; if (finite(r.yaw)) h.yaw = r.yaw;
          if (finite(r.speed)) h.speed = r.speed; if (finite(r.steer)) h.steer = r.steer; if (finite(r.lean)) h.lean = r.lean;
          if (finite(r.vx)) h.vx = r.vx; if (finite(r.vz)) h.vz = r.vz; if (finite(r.vy)) h.vy = r.vy;
          if (typeof r.airborne === 'boolean') h.airborne = r.airborne;
          if (finite(r.boostT)) h.boostT = r.boostT; if (finite(r.chargeT)) h.chargeT = r.chargeT;
        }
        ok = finite(h.x) && finite(h.z) && finite(h.y) && finite(h.yaw) && finite(h.speed) && finite(h.steer) && finite(h.lean) && finite(h.vx) && finite(h.vz) && finite(h.vy)
          && finite(h.boostT) && finite(h.chargeT) && h.speed >= -0.01 && h.speed <= HOVER_BOOST + 0.5 && Math.abs(h.lean) <= HOVER_LEAN_MAX + 0.01
          && Math.hypot(h.x - x0, h.z - z0) <= HOVER_BOOST * dt + 0.05 && (Math.abs(h.y - y0) <= 30 * dt + 0.05 || Math.abs(h.y - (surfaceAt(h.x, h.z) + HOVER_H)) <= 0.05) && hoverFitsRel(h.x, h.z);   // v14: a step up onto a deck or a ledge lands on the surface, it is not a teleport
      } catch (e) { ok = false; }
      if (ok) {
        done = true;
        h.ground = cartHeight(h.x, h.z); h.surface = surfaceAt(h.x, h.z);
        const dir = finite(h.dir) ? h.dir : h.yaw;
        h.vx = Math.sin(dir) * h.speed; h.vz = Math.cos(dir) * h.speed;
        if (finite(h.boostLeft)) h.boostT = h.boostLeft; if (finite(h.boostCd)) h.chargeT = h.boostCd;
        h.boosting = !!h.boosting;
        if (!h.airborne && h.y < h.surface + HOVER_H - 0.3) h.y = h.surface + HOVER_H;
        if (h.landed && finite(h.drop) && h.drop > 0.3) h.dipT = clock;
      } else {
        hoverCtlStrikes += 1;
        h.x = x0; h.z = z0; h.y = y0; h.yaw = yaw0; h.vx = vx0; h.vz = vz0; h.vy = vy0; h.steer = st0; h.airborne = air0; h.boostT = bt0; h.chargeT = ct0;
      }
    }
    if (!done) {
      stepHoverOwn(h, throttle, steerIn, !!boostHeld, dt, jump);
      if (h.speed > 0.1) h.dir = Math.atan2(h.vx, h.vz);
      h.boostLeft = h.boostT; h.boostCd = h.chargeT; h.boostCharge = h.boostT > 0 ? h.boostT / HOVER_BOOST_LEN : 1 - h.chargeT / HOVER_RECHARGE;
    }
    applyKicker(h);
    h.drift = wrap(h.yaw - (finite(h.dir) ? h.dir : h.yaw));
    if (!done) { if (clock - h.dipT > HOVER_DIP_LEN) h.dip = 0; else h.dip = h.dip * (1 - (clock - h.dipT) / HOVER_DIP_LEN); }
    h.yaw = wrap(h.yaw);
  }
  /* H on foot or in the water: the board drops in under the visitor (0.3 s, a glow) and the ride
     starts. Refused inside, in the subway, in the golf, cart and scooter states, at a station or
     seated (the hint 'No board here' shows for a second when it is owned). */
  function summonBoard(time) {
    if (!boardOwned()) return false;
    if (player.interior || player.fade || inSubway() || golfing() || inCart() || riding() || atStation() || seated() || player.exiting) { hoverHintT = time; return false; }
    const L = swimL();
    if (L && (L.phase === 'diving' || L.phase === 'climbing')) { hoverHintT = time; return false; }
    if (!hoverCtlTried) { hoverCtl = makeHoverController(); HOVER.controller = hoverCtl; }
    if (!kickerList) buildKickers();
    const h = HOVER;
    h.x = player.pos.x; h.z = player.pos.y;      // a tight spot (a wall beside the walker) is left by the relative fit rule
    // v14: the board (0.35) is wider than the walker (0.28): pull it inside the walker's own tile when a corner hangs into a blocked one
    if (hoverBad(h.x, h.z) > 0 && hoverPointOK(h.x, h.z)) {
      const tx0 = Math.floor(h.x), tz0 = Math.floor(h.z), e0 = HOVER_R + 1e-3;
      const cx0 = clamp(h.x, tx0 + e0, tx0 + 1 - e0), cz0 = clamp(h.z, tz0 + e0, tz0 + 1 - e0);
      if (hoverBad(cx0, h.z) === 0) h.x = cx0; else if (hoverBad(h.x, cz0) === 0) h.z = cz0; else { h.x = cx0; h.z = cz0; }
    }
    h.yaw = finite(player.yaw) ? wrap(player.yaw) : Math.PI;
    h.vx = 0; h.vz = 0; h.vy = 0; h.speed = 0; h.steer = 0; h.lean = 0; h.airborne = false; h.bounced = false; h.kickArmed = false; h.dip = 0; h.dipT = -Infinity;
    h.boostT = 0; h.chargeT = 0; h.boosting = false; h.hint = null;
    h.dir = h.yaw; h.drift = 0; h.boostLeft = 0; h.boostCd = 0; h.boostCharge = 1; h.airTime = 0; h.drop = 0; h.launched = false; h.landed = false; h.bounce = false; h.bumped = false;
    h.ground = cartHeight(h.x, h.z); h.surface = surfaceAt(h.x, h.z); h.y = h.surface + HOVER_H; h.apex = h.y;
    endSwim();
    BOARD.state = 'riding'; BOARD.dropT = time; BOARD.glow = 1; BOARD.x = h.x; BOARD.z = h.z; BOARD.y = h.y + HOVER_DROP_H; BOARD.yaw = h.yaw;
    player.hover = h; player.state = 'hover'; player.pose = 'hover';
    player.leisure = null; player.onDeck = false; player.onBoard = false; player.held = null; player.exiting = null; player.jumpT = 0;
    player.heightOffset = HOVER_DECK; vel.x = 0; vel.z = 0; hopT0 = -1; player.speed = 0; player.turn = null;
    setLookYaw(h.yaw); setMoveDir(Math.sin(h.yaw), Math.cos(h.yaw));
    player.orbitPitch = ORBIT_PITCH_DEF; orbitPitchT = ORBIT_PITCH_DEF;
    doorArmed = false;
    if (log) log('On the hoverboard. W S ride, A D steer, Shift boost, H hop off.', 'info');
    return true;
  }
  /* H while riding: the visitor steps onto the tile under the board (the nearest land tile when
     the board floats over water) and the board trails from there. */
  function hopOffBoard(time) {
    if (player.hover !== HOVER) return;
    const h = HOVER;
    let px = h.x, pz = h.z;
    const tx = Math.floor(px), tz = Math.floor(pz);
    const onLand = land(at(tx, tz)) || (at(tx, tz) === T.WA && inPierRect(px, pz));
    if (!onLand || !fits(px, pz, false)) {
      // the nearest land tile (ring search up to 12, as findFreeSpot): the shore is never far on this map
      let best = false;
      for (let r = 0; r <= 12 && !best; r++) {
        for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = tx + dx, cz = tz + dz;
          if (!land(at(cx, cz)) || !fits(cx + 0.5, cz + 0.5, false) || isShoreTile(cx, cz) || kickerTileAt(cx, cz)) continue;
          px = cx + 0.5; pz = cz + 0.5; best = true; break;
        }
      }
      if (!best) { px = h.x; pz = h.z; }
    }
    BOARD.state = 'trailing'; BOARD.x = h.x; BOARD.z = h.z; BOARD.y = h.y; BOARD.yaw = h.yaw; BOARD.glow = 0;
    player.hover = null;
    player.pos.x = px; player.pos.y = pz;
    player.state = 'idle'; player.pose = 'stand'; player.speed = 0; vel.x = 0; vel.z = 0; player.heightOffset = 0;
    player.yaw = h.yaw; player.targetYaw = h.yaw; player.bodyYaw = h.yaw;
    setMoveDir(Math.sin(h.yaw), Math.cos(h.yaw));
    if (!fits(px, pz, false)) findFreeSpot(px, pz);
    doorArmed = false;
    h.speed = 0; h.vx = 0; h.vz = 0; h.vy = 0; h.airborne = false; h.boosting = false;
  }
  /* Per frame while riding: the step, the body on the board, the orbit behind the heading. */
  function updateHover(dt, time) {
    const h = HOVER;
    const jump = !!inp.jump; inp.jump = false;   // v11.1: Space is the ollie while riding (consumed here, never the walk jump)
    stepHover(h, inp.fwd, inp.side, inp.boost || inp.run, dt, jump);
    h.hint = null;
    const k = clamp((time - BOARD.dropT) / HOVER_DROP_IN, 0, 1);
    BOARD.state = 'riding'; BOARD.x = h.x; BOARD.z = h.z; BOARD.yaw = h.yaw; BOARD.glow = 1 - k; BOARD.bob = 0;
    BOARD.y = h.y + HOVER_DROP_H * (1 - easeOut(k));
    player.pos.x = h.x; player.pos.y = h.z;
    player.yaw = h.yaw; player.targetYaw = h.yaw; player.bodyYaw = h.yaw;
    player.moveDir.x = Math.sin(h.yaw); player.moveDir.z = Math.cos(h.yaw);
    if (Math.abs(player.moveDir.x) > 0.05) player.facing = player.moveDir.x > 0 ? 1 : -1;
    player.pose = 'hover'; player.speed = h.speed; vel.x = 0; vel.z = 0; player.yoff = 0;
    player.animT += dt * (0.5 + h.speed / 4);
    if (clock - lastMouseT > SCOOT_CAM_QUIET && h.speed > 0.3) {
      const kf = clamp(h.speed / HOVER_BOOST, 0, 1);
      const d = wrap(h.yaw - orbitYawT), st = d * (1 - Math.exp(-dt * lerp(SCOOT_CAM_ALIGN, SCOOT_CAM_ALIGN_FAST, kf)));
      orbitYawT = wrap(orbitYawT + st); player.orbitYaw = wrap(player.orbitYaw + st);
    }
  }
  /* Per frame on foot: the owned board trails 1.5 behind the walker (an exponential ease toward
     the spot behind the facing, hovering 0.4 over the surface with a slow bob), or stays away
     while the visitor is inside, in the subway, golfing, in the cart or on a scooter. */
  function updateBoard(dt, time) {
    if (!boardOwned()) { player.board = null; return; }
    player.board = BOARD;
    if (hovering()) return;
    const away = player.interior || player.fade || inSubway() || golfing() || inCart() || riding() || atStation() || boating();
    if (away) { BOARD.state = 'away'; BOARD.glow = 0; return; }
    if (BOARD.state !== 'trailing') {
      // back from away or a fresh wallet: it appears behind the visitor
      BOARD.state = 'trailing'; BOARD.x = player.pos.x - player.moveDir.x * HOVER_TRAIL; BOARD.z = player.pos.y - player.moveDir.z * HOVER_TRAIL;
      if (!hoverFits(BOARD.x, BOARD.z)) { BOARD.x = player.pos.x; BOARD.z = player.pos.y; }
      BOARD.y = surfaceAt(BOARD.x, BOARD.z) + HOVER_H; BOARD.yaw = player.yaw; BOARD.glow = 0;
    }
    const tx = player.pos.x - player.moveDir.x * HOVER_TRAIL, tz = player.pos.y - player.moveDir.z * HOVER_TRAIL;
    const k = 1 - Math.exp(-HOVER_TRAIL_RATE * dt);
    let nx = BOARD.x + (tx - BOARD.x) * k, nz = BOARD.z + (tz - BOARD.z) * k;
    if (!hoverFits(nx, nz)) { if (hoverFits(nx, BOARD.z)) nz = BOARD.z; else if (hoverFits(BOARD.x, nz)) nx = BOARD.x; else { nx = BOARD.x; nz = BOARD.z; } }
    // never more than 4 behind (a teleport out of a room, a dive): it catches up
    if (Math.hypot(nx - player.pos.x, nz - player.pos.y) > 4) { nx = tx; nz = tz; if (!hoverFits(nx, nz)) { nx = player.pos.x; nz = player.pos.y; } }
    BOARD.x = finite(nx) ? nx : player.pos.x; BOARD.z = finite(nz) ? nz : player.pos.y;
    BOARD.bob = HOVER_BOB * Math.sin(time * 2.2);
    const ty = surfaceAt(BOARD.x, BOARD.z) + HOVER_H + BOARD.bob;
    BOARD.y += (ty - BOARD.y) * (1 - Math.exp(-6 * dt));
    if (!finite(BOARD.y)) BOARD.y = ty;
    const dx = player.pos.x - BOARD.x, dz = player.pos.y - BOARD.z;
    if (Math.hypot(dx, dz) > 0.3) { const want = Math.atan2(dx, dz); BOARD.yaw = wrap(BOARD.yaw + wrap(want - BOARD.yaw) * (1 - Math.exp(-4 * dt))); }
    BOARD.glow = 0;
  }
  /* H: the summon or the hop off. */
  function toggleBoard(time) {
    if (hovering()) { hopOffBoard(time); return; }
    summonBoard(time);
  }

  /* ---------- the boats (v11) ---------- */
  const boatList = () => state.boats || [];
  const dockList = () => state.docks || [];
  function boatById(id) { const list = boatList(); for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function dockById(id) { const list = dockList(); for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  /* A record's world position: integers name a tile (its center), fractions are points. */
  const recX = r => (r.pos && finite(r.pos.x) ? r.pos.x : Number.isInteger(r.x) ? r.x + 0.5 : r.x);
  const recY = r => (r.pos && finite(r.pos.y) ? r.pos.y : Number.isInteger(r.y) ? r.y + 0.5 : r.y);
  const dockTileX = d => (d.tile && finite(d.tile.x) ? d.tile.x + 0.5 : recX(d));
  const dockTileZ = d => (d.tile && finite(d.tile.y) ? d.tile.y + 0.5 : recY(d));
  function dockSlipX(d) { if (d.slipPos && finite(d.slipPos.x)) return d.slipPos.x; if (d.slip && finite(d.slip.x)) return d.slip.x + 0.5; const yaw = finite(d.yaw) ? d.yaw : 0; return dockTileX(d) + Math.sin(yaw); }
  function dockSlipZ(d) { if (d.slipPos && finite(d.slipPos.y)) return d.slipPos.y; if (d.slip && finite(d.slip.y)) return d.slip.y + 0.5; const yaw = finite(d.yaw) ? d.yaw : 0; return dockTileZ(d) + Math.cos(yaw); }
  /* A moored boat's heading in this module's convention (yaw 0 faces +z, south): the bow points
     from the dock tile into the slip, whatever the plan's rot based yaw says (rot 0 is north there). */
  function dockHeading(d) {
    const dx = dockSlipX(d) - dockTileX(d), dz = dockSlipZ(d) - dockTileZ(d);
    if (Math.hypot(dx, dz) < 1e-6) return finite(d.yaw) ? d.yaw : 0;
    return Math.atan2(dx, dz);
  }
  const boatDockId = b => (b.dockId !== undefined && b.dockId !== null ? b.dockId : (b.dock !== undefined && b.dock !== null ? b.dock : null));
  const boatFree = b => !!b && (b.rider === null || b.rider === undefined) && finite(recX(b)) && finite(recY(b));
  const boatTop = b => (b && b.kind === 'launch' ? BOAT_LAUNCH : BOAT_ROW);
  /* The boat the prompt points at into BPICK: the nearest free boat within 1.8 (TT.sim.nearestFreeBoat when the sim has it). */
  function pickBoat(px, pz) {
    BPICK.b = null; BPICK.d = Infinity;
    const list = boatList();
    if (!list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!boatFree(b)) continue;
      const d = Math.hypot(recX(b) - px, recY(b) - pz);
      if (d <= BOAT_REACH && d < BPICK.d) { BPICK.b = b; BPICK.d = d; }
    }
    return !!BPICK.b;
  }
  /* The free dock within reach of the boat into DPICK: the slip center within 2 (v11 review: the
     tile center never counts, and a dock whose slip is farther than its tile is on the other side
     of its deck, so a boat on the lake side of the marina deck is not tied up through the planks). */
  function pickDock(px, pz) {
    DPICK.d = null; DPICK.dist = Infinity;
    const list = dockList();
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!d || (d.boat !== null && d.boat !== undefined)) continue;
      const dist = Math.hypot(dockSlipX(d) - px, dockSlipZ(d) - pz);
      if (dist > DOCK_REACH || dist >= DPICK.dist) continue;
      if (dist > Math.hypot(dockTileX(d) - px, dockTileZ(d) - pz) + 1e-6) continue;
      DPICK.d = d; DPICK.dist = dist;
    }
    return !!DPICK.d;
  }
  /* The boat water: boatWater's mask when the library and the raster exist, else WA tiles off the
     pier planks and the swim ring. */
  function boatPointOK(px, pz) {
    const tx = Math.floor(px), tz = Math.floor(pz);
    if (tx < 0 || tz < 0 || tx >= COLS || tz >= ROWS) return false;
    if (!waterMapsBuilt) buildWaterMaps();
    if (boatMask) return boatMask[tileKey(tx, tz)] === 1;
    return at(tx, tz) === T.WA && !inPierRect(px, pz) && !inSwimRing(tx, tz);
  }
  function boatBad(x, z) {
    return (boatPointOK(x - BOAT_R, z - BOAT_R) ? 0 : 1) + (boatPointOK(x + BOAT_R, z - BOAT_R) ? 0 : 1)
      + (boatPointOK(x - BOAT_R, z + BOAT_R) ? 0 : 1) + (boatPointOK(x + BOAT_R, z + BOAT_R) ? 0 : 1);
  }
  let boatBad0 = 0;
  const boatFits = (x, z) => finite(x) && finite(z) && boatBad(x, z) === 0;
  const boatFitsRel = (x, z) => finite(x) && finite(z) && boatBad(x, z) <= boatBad0;
  function boatMaxAt(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!boatPointOK(x, z)) return 0;
    return inSlowZone(tx, tz) ? Math.min(BOAT_SLOW, BOAT.max) : BOAT.max;
  }
  /* ctx.vehicles.createBoatController(opts), one per boat kind (its top speed is the kind's), made
     once on the first ride of that kind. The contract numbers go by the controller's names. */
  function makeBoatController(kind) {
    if (boatCtls[kind] !== undefined) return boatCtls[kind];
    boatCtls[kind] = null;
    const V = ctx.vehicles;
    if (!V || typeof V.createBoatController !== 'function') return null;
    try {
      const c = V.createBoatController({
        sim, state, terrain, at, TILES: T, kind, radius: BOAT_R, fits: boatFitsRel, waterAt: boatPointOK, maxSpeedAt: boatMaxAt, surfaceAt: waterLevel, waterLevelAt: waterLevel, slowAt: slowAtPoint,
        boat: BOAT, feel: BOAT_FEEL, numbers: BOAT_FEEL,
        topSpeed: kind === 'launch' ? BOAT_LAUNCH : BOAT_ROW, reverse: BOAT_REV, accel: BOAT_ACCEL, turnFast: BOAT_TURN_HIGH, turnSlow: BOAT_TURN_LOW, slowSpeed: BOAT_SLOW, dockRange: DOCK_REACH,
      });
      boatCtls[kind] = c && typeof c === 'object' && typeof c.step === 'function' ? c : null;
    } catch (e) { boatCtls[kind] = null; }
    return boatCtls[kind];
  }
  /* The built in boat model: throttle -1..1 (W ahead to the kind's max, S astern to 2), the rudder
     eased toward the input, the turn rate 0.5 at a crawl to 1.1 at speed (none standing still),
     drag toward a stop, the four point test on the boat water, the hull easing to the surface
     (a weir step is taken over about 1.5 tiles). */
  function stepBoatOwn(b, throttle, steerIn, maxV, dt) {
    let v = b.speed;
    if (throttle > 0.05) { if (v < maxV) v = Math.min(maxV, v + BOAT_ACCEL * throttle * dt); }
    else if (throttle < -0.05) { if (v > -BOAT_REV) v = Math.max(-BOAT_REV, v + BOAT_ACCEL * throttle * dt); }
    else if (v > 0) v = Math.max(0, v - BOAT_DRAG * dt);
    else if (v < 0) v = Math.min(0, v + BOAT_DRAG * dt);
    if (v > maxV) v = Math.max(maxV, v - BOAT_ACCEL * dt);
    if (maxV <= 0) v = 0;
    b.steer += clamp(clamp(steerIn, -1, 1) - b.steer, -BOAT_RUDDER * dt, BOAT_RUDDER * dt);
    // the turn rate rises with the speed (0.5 at a standstill or a crawl, 1.1 at the kind's top), the
    // yaw grows with a positive steer; astern the rudder works the other way
    const rate = lerp(BOAT_TURN_LOW, BOAT_TURN_HIGH, clamp(Math.abs(v) / b.max, 0, 1));
    b.yaw = wrap(b.yaw + b.steer * rate * (v < -0.05 ? -1 : 1) * dt);
    const hx = Math.sin(b.yaw), hz = Math.cos(b.yaw);
    const x0 = b.x, z0 = b.z, nx = x0 + hx * v * dt, nz = z0 + hz * v * dt;
    if (boatFitsRel(nx, nz)) { b.x = nx; b.z = nz; }
    else {
      if (boatFitsRel(nx, z0)) b.x = nx;
      if (boatFitsRel(b.x, nz)) b.z = nz;
      const want = Math.hypot(nx - x0, nz - z0), got = Math.hypot(b.x - x0, b.z - z0);
      v *= want > 1e-9 ? clamp(got / want, 0, 1) : 0;
      if (Math.abs(v) < 0.05) v = 0;
    }
    b.x = clamp(b.x, BOAT_R, COLS - BOAT_R); b.z = clamp(b.z, BOAT_R, ROWS - BOAT_R);
    b.speed = finite(v) ? v : 0;
    const ty = waterLevel(b.x, b.z);
    const yr = Math.max(BOAT_Y_RATE, Math.abs(b.speed) * 0.7) * dt;
    b.y += clamp(ty - b.y, -yr, yr);
    if (!finite(b.y)) b.y = ty;
    if (!finite(b.x) || !finite(b.z)) { b.x = x0; b.z = z0; b.speed = 0; }
    if (!finite(b.steer)) b.steer = 0;
    if (!finite(b.yaw)) b.yaw = 0;
  }
  function stepBoat(b, fwd, side, dt) {
    const x0 = b.x, z0 = b.z, y0 = b.y, yaw0 = b.yaw, v0 = b.speed, st0 = b.steer;
    const steerIn = finite(side) ? -side : 0, throttle = finite(fwd) ? fwd : 0;
    boatBad0 = boatBad(x0, z0);
    b.slow = inSlowZone(Math.floor(x0), Math.floor(z0));
    const maxV = boatMaxAt(x0, z0);
    let done = false;
    if (boatCtl && boatCtlStrikes < 3) {
      // the controller takes a signed throttle (S brakes, then goes astern) and the scooter steer sign
      BOAT_IN.throttle = throttle; BOAT_IN.brake = 0; BOAT_IN.steer = steerIn; BOAT_IN.fwd = throttle; BOAT_IN.side = finite(side) ? side : 0;
      BOAT_IN.maxSpeed = maxV; BOAT_IN.reverseSpeed = BOAT_REV; BOAT_IN.slow = b.slow; BOAT_IN.surfaceY = waterLevel(x0, z0);
      let ok = false;
      try {
        const r = boatCtl.step(b, BOAT_IN, dt);
        if (r && r !== b && typeof r === 'object') {
          if (finite(r.x)) b.x = r.x; if (finite(r.z)) b.z = r.z; if (finite(r.y)) b.y = r.y; if (finite(r.yaw)) b.yaw = r.yaw;
          if (finite(r.speed)) b.speed = r.speed; if (finite(r.steer)) b.steer = r.steer;
        }
        ok = finite(b.x) && finite(b.z) && finite(b.y) && finite(b.yaw) && finite(b.speed) && finite(b.steer)
          && b.speed <= Math.max(maxV, v0) + 0.5 && b.speed >= -BOAT_REV - 0.5
          && Math.hypot(b.x - x0, b.z - z0) <= BOAT_LAUNCH * dt + 0.05 && boatFitsRel(b.x, b.z);
      } catch (e) { ok = false; }
      if (ok) done = true;
      else { boatCtlStrikes += 1; b.x = x0; b.z = z0; b.y = y0; b.yaw = yaw0; b.speed = v0; b.steer = st0; }
    }
    if (!done) stepBoatOwn(b, throttle, steerIn, maxV, dt);
    if (b.speed > maxV) b.speed = Math.max(maxV, Math.min(b.speed, v0 - BOAT_ACCEL * dt));
    b.yaw = wrap(b.yaw);
    b.wake = b.slow ? 0 : clamp(Math.abs(b.speed) / BOAT_LAUNCH, 0, 1);
  }
  /* TT.sim.takeBoat(id, 'player'), else the same effect on the records. */
  function simTakeBoat(b) {
    const fn = simFn('takeBoat');
    if (fn) {
      let r;
      try { r = fn(b.id, 'player'); } catch (e) { return false; }
      if (r === false || r === null) return false;
      if (b.rider !== undefined && b.rider !== null && b.rider !== 'player') return false;
    }
    else if (!boatFree(b)) return false;
    b.rider = 'player'; b.parked = false;
    const docks = dockList();
    for (let i = 0; i < docks.length; i++) if (docks[i] && docks[i].boat === b.id) docks[i].boat = null;
    if (b.dock !== undefined) b.dock = null;
    if (b.dockId !== undefined) b.dockId = null;
    if (b.beached !== undefined) b.beached = false;
    return true;
  }
  /* TT.sim.dockBoat(id, dockId), else the same effect on the records; the moored heading is the
     dock's geometry (the bow into the slip) in every case. */
  function simDockBoat(b, d, yaw) {
    const fn = simFn('dockBoat');
    if (fn) { try { fn(b.id, d.id); } catch (e) { /* the records below */ } }
    b.rider = null; b.parked = true; b.x = dockSlipX(d); b.y = dockSlipZ(d); b.yaw = yaw;
    if (b.dock !== undefined) b.dock = d.id;
    b.dockId = d.id;
    if (b.beached !== undefined) b.beached = false;
    d.boat = b.id;
  }
  /* TT.sim.beachBoat(id, x, y, yaw) (the sim may slide the boat to the bank side tile and name the
     dry tile beside it as b.bank), else the records: parked where it floats. */
  function simBeachBoat(b, x, z, yaw) {
    const fn = simFn('beachBoat');
    if (fn) { try { fn(b.id, x, z, yaw); } catch (e) { b.x = x; b.y = z; } }
    else { b.x = x; b.y = z; }
    b.rider = null; b.parked = true; b.yaw = yaw;
    if (b.dock !== undefined) b.dock = null;
    if (b.dockId !== undefined) b.dockId = null;
    if (!finite(b.x) || !finite(b.y)) { b.x = x; b.y = z; }
  }
  /* E near a free boat: take it from the sim and sit in it where it floats. */
  function takeBoat(b, time) {
    if (!b || boating() || riding() || inCart() || golfing() || player.interior || hovering()) return false;
    const dk = dockById(boatDockId(b));          // before the take: the sim unmoors the record
    if (!simTakeBoat(b)) return false;
    standUp(); endSwim();
    const R = BOAT;
    R.id = b.id; R.kind = b.kind === 'launch' ? 'launch' : 'rowboat'; R.max = boatTop(b); R.rec = b;
    boatCtl = makeBoatController(R.kind); R.controller = boatCtl; boatCtlStrikes = 0;
    R.x = recX(b); R.z = recY(b);
    R.yaw = dk ? dockHeading(dk) : (finite(b.yaw) ? wrap(b.yaw) : player.yaw);   // moored: the bow into the slip
    if (!boatFits(R.x, R.z) && boatFits(Math.floor(R.x) + 0.5, Math.floor(R.z) + 0.5)) { R.x = Math.floor(R.x) + 0.5; R.z = Math.floor(R.z) + 0.5; }
    R.y = waterLevel(R.x, R.z); R.speed = 0; R.steer = 0; R.wake = 0; R.hint = null; R.slow = inSlowZone(Math.floor(R.x), Math.floor(R.z));
    b.x = R.x; b.y = R.z; b.yaw = R.yaw;
    player.boat = R; player.state = 'boat'; player.pose = 'boat';
    player.leisure = null; player.onDeck = false; player.onBoard = false; player.held = null; player.exiting = null;
    player.heightOffset = BOAT_SEAT; vel.x = 0; vel.z = 0; hopT0 = -1; player.speed = 0; player.turn = null;
    player.pos.x = R.x; player.pos.y = R.z;
    setLookYaw(R.yaw); setMoveDir(Math.sin(R.yaw), Math.cos(R.yaw));
    player.orbitPitch = BOAT_PITCH; orbitPitchT = BOAT_PITCH;     // the camera 3.2 above the deck at distance 7
    doorArmed = false; boatHintT = -Infinity;
    if (log) log('In the ' + R.kind + '. W S ahead and astern, A D steer, E tie up or hop off.', 'info');
    return true;
  }
  /* The visitor out of the boat onto (px, pz). */
  function standOnBank(px, pz, yaw) {
    const R = BOAT;
    player.boat = null; R.rec = null; R.speed = 0; R.steer = 0; R.wake = 0; R.hint = null;
    player.pos.x = px; player.pos.y = pz;
    player.state = 'idle'; player.pose = 'stand'; player.speed = 0; vel.x = 0; vel.z = 0; player.heightOffset = 0;
    player.yaw = yaw; player.targetYaw = yaw; player.bodyYaw = yaw;
    setMoveDir(Math.sin(yaw), Math.cos(yaw));
    if (!fits(px, pz, false)) findFreeSpot(px, pz);
    doorArmed = false;
  }
  /* 'E  Tie up': the boat into the dock's slip, the visitor on the dock tile facing the land. */
  function tieUp(d, time) {
    if (!boating() || !d) return false;
    const R = BOAT, b = R.rec || boatById(R.id);
    const yaw = dockHeading(d);
    if (b) simDockBoat(b, d, yaw); else d.boat = R.id;
    R.x = dockSlipX(d); R.z = dockSlipZ(d); R.yaw = yaw;
    standOnBank(dockTileX(d), dockTileZ(d), wrap(yaw + Math.PI));
    if (log) log('Tied up at ' + (d.name || d.id) + '.', 'info');
    return true;
  }
  /* 'E  Hop off': the boat beaches where it floats and the visitor steps onto the nearest bank tile
     within 3 (a land tile the walker fits on); none near raises the hint instead. */
  function leaveBoat(time, strict) {
    if (!boating()) return false;
    const R = BOAT, b = R.rec || boatById(R.id);
    const bx = R.x, bz = R.z, tx = Math.floor(bx), tz = Math.floor(bz);
    let px = NaN, pz = NaN, bd = Infinity;
    const reach = strict === false ? 12 : BANK_REACH;
    for (let r = 1; r <= reach; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = tx + dx, cz = tz + dz;
        if (!land(at(cx, cz)) || !fits(cx + 0.5, cz + 0.5, false) || kickerTileAt(cx, cz)) continue;
        const d = Math.hypot(cx + 0.5 - bx, cz + 0.5 - bz);
        if (d < bd) { bd = d; px = cx + 0.5; pz = cz + 0.5; }
      }
      if (finite(px) && bd <= reach) break;
    }
    if (!finite(px) || bd > reach + 0.8) {
      if (strict === false) { px = bx; pz = bz; }
      else { boatHintT = time; return false; }
    }
    if (b) {
      simBeachBoat(b, bx, bz, R.yaw);
      R.x = recX(b); R.z = recY(b);     // the sim may have slid it to the bank side tile
      // the sim's dry tile beside the boat when it names one and the walker fits there
      const bk = b.bank;
      if (bk && finite(bk.x) && finite(bk.y) && land(at(bk.x, bk.y)) && fits(bk.x + 0.5, bk.y + 0.5, false)) { px = bk.x + 0.5; pz = bk.y + 0.5; }
    }
    standOnBank(px, pz, Math.atan2(px - bx, pz - bz));
    if (log) log('Ashore. The ' + R.kind + ' waits here.', 'info');
    return true;
  }
  /* Per frame while boating: the step, the sim record follows, the seat, the orbit behind. */
  function updateBoat(dt, time) {
    const R = BOAT;
    stepBoat(R, inp.fwd, inp.side, dt);
    R.hint = time - boatHintT < BOAT_HINT_LEN ? BANK_HINT : null;
    const b = R.rec;
    if (b) { b.x = R.x; b.y = R.z; b.yaw = R.yaw; b.rider = 'player'; b.parked = false; }
    player.pos.x = R.x; player.pos.y = R.z;
    player.yaw = R.yaw; player.targetYaw = R.yaw; player.bodyYaw = R.yaw;
    player.moveDir.x = Math.sin(R.yaw); player.moveDir.z = Math.cos(R.yaw);
    if (Math.abs(player.moveDir.x) > 0.05) player.facing = player.moveDir.x > 0 ? 1 : -1;
    player.pose = 'boat'; player.speed = Math.abs(R.speed); vel.x = 0; vel.z = 0; player.yoff = 0;
    player.animT += dt;
    if (clock - lastMouseT > CART_CAM_QUIET && Math.abs(R.speed) > 0.2) {
      const d = wrap(R.yaw - orbitYawT), mx = CART_CAM_ALIGN * dt, st = clamp(d, -mx, mx);
      orbitYawT = wrap(orbitYawT + st); player.orbitYaw = wrap(player.orbitYaw + st);
    }
  }

  /* ---------- the round (v8) ---------- */
  function startRound(time) {
    const g = GOLF;
    if (!holeCount()) return false;
    standUp(); endSwim();
    if (golfing()) leaveGolf(time);
    g.mode = 'round'; g.round = ROUND; ROUND.startedAt = time; ROUND.strokes = 0; resetCard(); ROUND.card = g.card;
    const H = holeAt(1);
    g.hole = 1; g.strokes = 0; g.par = H && finite(H.par) ? H.par : 3; g.lie = 'tee'; g.club = 'driver';
    g.phase = 'between'; g.message = null; g.messageUntil = 0; g.roundT0 = time; g.roundSeconds = 0; g.roundResult = null; g.ball = null; g.carry = -1;
    g.cartHint = null; clubOverride = false; abandonAskedAt = -Infinity;
    player.golf = g; player.held = null;
    spawnCart(); enterCart(time);
    if (log) log('A round of ' + holeCount() + ' holes at ' + courseName() + '. Drive to the first tee.', 'info');
    return true;
  }
  /* 'E  Play the ball': back into the golf state at the resting ball (phase 'ready'). */
  function playBall(time) {
    const g = GOLF;
    if (!inRound() || g.phase !== 'ready' || !g.ball) return;
    standUp(); endSwim();
    player.state = 'golf'; player.pose = 'golfIdle'; player.leisure = null; player.onDeck = false; player.onBoard = false; player.held = null;
    player.exiting = null; player.heightOffset = 0; vel.x = 0; vel.z = 0; hopT0 = -1;
    prevPos.x = player.pos.x; prevPos.z = player.pos.y;
    enterAim(time, true);
    charYaw = wrap(player.orbitYaw - Math.PI / 2); player.bodyYaw = charYaw;
  }
  /* v10: the round record, written once per round when the last hole is holed (startRound clears
     it). holes is the card length (9 on the v3 plan) and complete says every hole was holed; the
     renderer records it on the leaderboard with detail.holes = roundResult.holes. */
  function finishRound(time) {
    const g = GOLF;
    if (g.roundResult) { g.phase = 'done'; return; }
    let total = 0, filled = 0;
    for (let i = 0; i < g.card.length; i++) { const s = g.card[i]; if (finite(s)) { total += s; filled += 1; } }
    const par = holesPar(), toPar = total - par, n = g.card.length;
    const secs = Math.max(0, time - ROUND.startedAt);
    g.phase = 'done'; g.roundSeconds = finite(secs) ? secs : 0;
    updateToPar();
    const term = roundTerm(total, par);
    g.roundResult = { strokes: total, toPar, par, seconds: g.roundSeconds, card: g.card.slice(), holes: n, played: filled, complete: filled === n, term, course: courseName() };
    recordCard();
    setMessage('Round: ' + total + ' (' + toParText(toPar) + '). ' + term, Infinity);
    standDown();
    if (log) log('Round complete: ' + total + ' (' + toParText(toPar) + ').', 'done');
  }
  /* The round record goes away (the result stays on GOLF.roundResult); the cart stays parked unless told otherwise. */
  function endRound(keepCart) {
    const g = GOLF;
    g.mode = 'hole'; g.round = null; g.cartHint = null; g.message = null; g.phase = 'aim';
    if (g.ball) { releaseBall(courseOf(), g.ball); g.ball = null; }
    if (player.state === 'golf') standDown();
    player.golf = null;
    abandonAskedAt = -Infinity;
    if (!keepCart) { if (inCart()) exitCart(clock); removeCart(); }
  }
  function abandonRound(time) {
    CART.auto = null;
    endRound(false);
    if (log) log('Round abandoned.', 'info');
  }
  /* X during a round: the summary's 'X  Done', else ask once, then abandon (nothing recorded). */
  function roundQuit(time) {
    if (GOLF.phase === 'done') { endRound(true); return; }
    if (time - abandonAskedAt <= ABANDON_WINDOW) { abandonRound(time); return; }
    abandonAskedAt = time;
    setMessage('X again to abandon the round', ABANDON_WINDOW);
  }
  /* 'E  Back to the clubhouse': drive home from the seat, or the cart fetches the player first. */
  function goHome(time) {
    if (!inRound() || GOLF.phase !== 'done') return;
    if (player.cart !== CART) { endRound(true); return; }
    if (inCart()) { if (!startHome(time)) endRound(true); return; }
    if (CART.auto) return;
    if (Math.hypot(CART.x - player.pos.x, CART.z - player.pos.y) <= SEAT_REACH + 0.5) { enterCart(time); if (!CART.auto && !startHome(time)) endRound(true); return; }
    const HI = islandHoleAt(player.pos.x, player.pos.y);    // v10 review: the cart waits at the bridge foot
    if (HI) { driveToBridgeFoot(HI); return; }
    stopShort(CART, player.pos.x, player.pos.y, SPOT);
    if (!SPOT.ok || !startAuto('fetch', SPOT.x, SPOT.z, NaN)) setMessage('No cart route, walk from here');
  }
  function teeHintFor(n) { if (!teeHint[n]) teeHint[n] = 'Tab  Drive to tee ' + n; return teeHint[n]; }
  /* golf.cartHint, the HUD cart line. */
  function updateHints() {
    const g = GOLF;
    if (!inRound()) { g.cartHint = null; return; }
    const have = player.cart === CART;
    if (g.phase === 'done') g.cartHint = have ? 'E  Back to the clubhouse · X  Done' : 'X  Done';
    else if (!have) g.cartHint = null;
    else if (CART.auto) g.cartHint = 'Driving';
    else if (inCart()) g.cartHint = g.phase === 'ready' ? (g.ball && islandHoleAt(g.ball.pos.x, g.ball.pos.z) ? 'Tab  Drive to the footbridge' : 'Tab  Drive to ball') : g.phase === 'between' ? teeHintFor(g.hole) : 'E  Get out';
    else g.cartHint = 'E  Get in the cart';
  }

  /* ---------- API ---------- */
  function enter(spawn) {
    exitInner(clock, false);
    player.active = true;
    cafe = findCafe();
    clubhouse = state.clubhouse || (state.golf && state.golf.clubhouse) || null;   // v8: the round start zone
    regionBuilt = false;
    let sx, sz, yaw = Math.PI;
    const sp = state.spawn;
    if (spawn && finite(spawn.x) && finite(spawn.y)) { sx = spawn.x; sz = spawn.y; if (finite(spawn.yaw)) yaw = spawn.yaw; }
    else if (sp && finite(sp.x) && finite(sp.y)) {
      // v7: the plan's spawn tile (integers name a tile; a fractional spawn is already a point)
      sx = Number.isInteger(sp.x) ? sp.x + 0.5 : sp.x; sz = Number.isInteger(sp.y) ? sp.y + 0.5 : sp.y;
      if (finite(sp.yaw)) yaw = sp.yaw;
    }
    else if (state.plaza && finite(state.plaza.x) && finite(state.plaza.w)) { sx = state.plaza.x + state.plaza.w / 2; sz = state.plaza.y + state.plaza.h / 2; }
    else { sx = COLS / 2; sz = ROWS / 2; }
    player.pos.x = sx; player.pos.y = sz;
    if (!fits(sx, sz, false)) findFreeSpot(sx, sz);
    setLookYaw(yaw);
    player.orbitPitch = ORBIT_PITCH_DEF; orbitPitchT = ORBIT_PITCH_DEF; player.orbitDist = ORBIT_DIST_DEF;
    setMoveDir(Math.sin(yaw), Math.cos(yaw));
    player.pose = 'stand'; player.state = 'idle';
    player.prompt = null;
    doorArmed = false;              // armed once the spawn is clear of every door zone
    if (log) log('You are walking the town.', 'info');
  }
  function exitInner(time, deactivate) {
    if (player.scooter === SCOOT) hopOff(time);       // v9: the scooter stays parked where the visitor left walk mode
    if (hovering()) hopOffBoard(time);                // v11: off the board; a ridden boat beaches where it floats
    if (boating()) leaveBoat(time, false);
    if (routing()) stopRoute();                       // v13: the map route ends with walk mode
    BOARD.state = 'away'; BOARD.glow = 0;
    standUp();
    if (inRound()) endRound(false); else if (golfing()) leaveGolf(time);
    if (inCart()) exitCart(time);
    removeCart(); abandonAskedAt = -Infinity; boundaryT = -Infinity;
    GOLF.mode = 'hole'; GOLF.round = null; GOLF.cartHint = null;
    leaveStation(time, true);
    if (player.state === 'station') player.state = 'idle';
    endSwim();
    sweepBubbles(time, true);
    player.held = null; player.talkingTo = null; player.prompt = null;
    player.yoff = 0; player.speed = 0; player.heightOffset = 0;
    player.exiting = null; exitH = 0;
    player.interior = null; player.floorY = 0; player.fade = null; player.fadeT = 0; fadeKind = null; pendingRoom = null; pendingBld = null; interiorBld = null;
    player.golf = null; player.followBall = null; player.anchorPos = null;
    player.turn = null; launchUntil = -Infinity; launchArmed = true;     // v10
    player.fovTarget = FOV_WALK; player.fov = FOV_WALK; cam.snap = true; bcam.snap = true;
    vel.x = 0; vel.z = 0; hopT0 = -1; moveT0 = -1;
    inp.fwd = 0; inp.side = 0; inp.run = false; inp.jump = false; inp.jumpHeld = false; inp.heldKnown = false; inp.interact = false; inp.lookDX = 0; inp.lookDY = 0; inp.toggleView = false; inp.zoom = 0; inp.club = null; inp.quit = false; inp.drive = false;
    inp.hover = false; inp.boost = false; hoverHintT = -Infinity; boatHintT = -Infinity;   // v11
    swingToggle = false; clubOverride = false;
    S.act = ACT_NONE; S.agent = null; S.seat = null; S.rec = null; S.bld = null; S.item = null; S.hole = -1;
    if (deactivate) player.active = false;
  }
  function exit() { exitInner(clock, true); }

  function setInput(input) {
    if (!input) return;
    inp.fwd = finite(input.fwd) ? clamp(input.fwd, -1, 1) : 0;
    inp.side = finite(input.side) ? clamp(input.side, -1, 1) : 0;
    inp.run = !!input.run;
    if (input.jump) inp.jump = true;
    if (typeof input.jumpHeld === 'boolean') { inp.heldKnown = true; inp.jumpHeld = input.jumpHeld; }
    if (input.interact) inp.interact = true;
    if (input.toggleView) inp.toggleView = true;
    inp.lookDX += finite(input.lookDX) ? input.lookDX : 0;
    inp.lookDY += finite(input.lookDY) ? input.lookDY : 0;
    inp.zoom += finite(input.zoom) ? input.zoom : 0;
    if (input.club1) inp.club = 'driver';
    if (input.club2) inp.club = 'iron';
    if (input.club3) inp.club = 'putter';
    if (typeof input.club === 'string' && CLUB_NAMES.indexOf(input.club) >= 0) inp.club = input.club;
    if (input.quit) inp.quit = true;
    if (input.drive || input.tab) inp.drive = true;      // v8: Tab, the cart auto-drive edge
    if (input.hover) inp.hover = true;                   // v11: H, the hoverboard summon edge
    inp.boost = !!input.boost;                           // v11: Shift held (input.run counts too while riding)
  }
  function setRooms(map) { roomsOverride = map || null; }

  /* Body height for this frame (what the renderer's leisure path will give the group). */
  function computeHeight(time) {
    const pier = state.pier, H = pier ? pier.height : 0.5;
    let y = 0;
    if (player.exiting) y = exitH;
    else if (atStation()) y = player.heightOffset;
    else if (golfing()) y = 0;
    else if (inCart()) y = CART_SEAT_Y - SEAT_DROP;        // v8: the cart seat (the renderer adds the terrain under the cart)
    else if (riding()) y = SCOOT_DECK;                     // v9: feet on the scooter deck
    else if (hovering()) y = HOVER.y - HOVER.ground + HOVER_DECK;   // v11: feet on the board (world y less the terrain under it)
    else if (boating()) y = BOAT.y - cartHeight(BOAT.x, BOAT.z) + BOAT_SEAT;   // v11: seated in the hull on the water
    else if (seated()) y = (player.leisure.seat && player.leisure.seat.kind === 'bench' ? SEAT_Y_BENCH : SEAT_Y_STOOL) - SEAT_DROP;
    else {
      const L = swimL();
      if (L) {
        if (L.phase === 'diving') {
          const k = clamp(player.jumpT, 0, 1), plunge = clamp((k - 0.85) / 0.15, 0, 1);
          y = H * (1 - k) + 1.4 * Math.sin(Math.PI * k) - 0.25 * plunge * plunge;
        } else if (L.phase === 'boarding' || L.phase === 'bouncing') y = H;
        else if (L.phase === 'climbing') y = lerp(swimFloat(), H, easeOut(clamp((time - phaseT0) / CLIMB_LEN, 0, 1)));
        else {
          y = swimFloat();   // v12.1: at the surface of whatever water this is
          const sp = finite(player.splash) ? time - player.splash : -1;
          if (sp >= 0 && sp < 0.3) y -= 0.25 * (1 - easeOut(sp / 0.3));
        }
      } else if (player.onDeck && !player.interior) y = H;      // idle on the plank half of the pier tile (land under the deck)
      if (player.yoff < 0) y += -player.yoff * HOP_UNIT;
    }
    player.heightOffset = finite(y) ? y : 0;
    player.deckY = (player.state === 'idle' && player.onDeck && !player.interior) ? H : 0;
  }

  /* ---------- prompt and interactables ---------- */
  function setPrompt(key, text) {
    if (promptObj.key !== key || promptObj.text !== text) { promptObj.key = key; promptObj.text = text; promptObj.full = key + '  ' + text; }
    player.prompt = promptObj;
  }
  function itemLabel(it) {
    if (it.kind === 'exit') return 'Go outside';
    if (itemFor !== it) {
      itemFor = it;
      const lbl = typeof it.label === 'string' ? it.label : '';
      itemText = lbl.indexOf('E  ') === 0 ? lbl.slice(3) : (lbl || (it.kind === 'board' ? 'Read the board' : 'Look'));
    }
    return itemText;
  }
  function computePrompt(time) {
    S.act = ACT_NONE; S.agent = null; S.seat = null; S.rec = null; S.bld = null; S.item = null; S.hole = -1; S.d = Infinity;
    const px = player.pos.x, pz = player.pos.y;
    const L = swimL();
    if (player.fade === 'out' || player.exiting) { player.prompt = null; return; }
    // v8: in the cart
    if (inCart()) {
      if (time - boundaryT < BOUNDARY_LEN) { setPrompt('', 'The cart stays on the links'); return; }
      if (inRound() && GOLF.phase === 'done') { S.act = ACT_HOME; setPrompt('E', 'Back to the clubhouse'); return; }
      S.act = ACT_CART_OUT; setPrompt('E', 'Get out'); return;
    }
    // v9: on the scooter only E works (hop off); a push against a green shows the hint instead
    if (riding()) {
      S.act = ACT_SCOOT_OFF;
      if (time - greenT < SCOOT_HINT_LEN) setPrompt('', GREEN_HINT); else setPrompt('E', 'Hop off');
      return;
    }
    // v11: on the hoverboard H hops off (E does nothing); in a boat E ties up at a free dock within 2, else hops off
    if (hovering()) { S.act = ACT_HOVER_OFF; setPrompt('H', 'Hop off'); return; }
    if (boating()) {
      if (time - boatHintT < BOAT_HINT_LEN) { S.act = ACT_BOAT_OFF; setPrompt('', BANK_HINT); return; }
      if (pickDock(px, pz)) { S.act = ACT_BOAT_TIE; S.d = DPICK.dist; setPrompt('E', 'Tie up'); return; }
      S.act = ACT_BOAT_OFF; setPrompt('E', 'Hop off'); return;
    }
    if (golfing()) {
      if (GOLF.phase === 'finished') { S.act = ACT_AGAIN; setPrompt('E', 'Play again'); return; }
      player.prompt = null; return;
    }
    if (seated()) { S.act = ACT_STANDUP; setPrompt('E', 'Stand up'); return; }
    if (atStation()) { S.act = ACT_LEAVE; setPrompt('E', 'Leave'); return; }
    if (L && (L.phase === 'diving' || L.phase === 'climbing')) { player.prompt = null; return; }

    // inside a room: the exit zone, the stats board, the portraits
    if (player.interior) {
      const room = player.interior, items = room.interactables;
      let best = null, bd = REACH, bact = ACT_NONE;
      if (exitZone(room)) { const d = Math.hypot(ZONE.cx - px, ZONE.cz - pz); if (d <= bd) { bd = d; best = null; bact = ACT_EXIT_ROOM; } }
      if (items) for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || (it.kind !== 'board' && it.kind !== 'portrait')) continue;
        const d = Math.hypot(it.x - px, it.z - pz);
        if (d <= bd) { bd = d; best = it; bact = it.kind === 'board' ? ACT_BOARD : ACT_PORTRAIT; }
      }
      if (bact === ACT_EXIT_ROOM) { S.act = bact; S.d = bd; setPrompt('E', 'Go outside'); return; }
      if (best) { S.act = bact; S.item = best; S.d = bd; setPrompt('E', itemLabel(best)); return; }
      player.prompt = null; return;
    }

    const pier = state.pier;
    if (pier && player.onBoard && L && L.phase === 'boarding' && pz <= pier.boardEnd.y + BOARD_END_SLACK) {
      S.act = ACT_DIVE; setPrompt('Space', 'Dive'); return;
    }
    const wet = inWater();

    // CONTRACT: the ladder (reach 0.9) is checked before agents (reach 1.7) while swimming. Agents
    // hang out beside the pier, and with the listed order a bystander on the shore would hide
    // "Climb out" and keep the player in the water; the talk prompt still wins everywhere else.
    if (pier && L && (L.phase === 'swimming' || L.phase === 'leaving') && Math.hypot(pier.ladder.x - px, pier.ladder.y - pz) <= LADDER_REACH) {
      S.act = ACT_CLIMB; setPrompt('E', 'Climb out'); return;
    }
    // v8: the round summary, the ball in play, the parked cart
    if (!wet && inRound()) {
      if (GOLF.phase === 'done') { S.act = ACT_HOME; setPrompt('E', 'Back to the clubhouse'); return; }
      const b = GOLF.ball;
      if (GOLF.phase === 'ready' && b && Math.hypot(b.pos.x - px, b.pos.z - pz) <= GOLF_REACH) { S.act = ACT_PLAY_BALL; setPrompt('E', 'Play the ball'); return; }
    }
    if (!wet && player.cart === CART && !CART.auto && Math.hypot(CART.x - px, CART.z - pz) <= SEAT_REACH) { S.act = ACT_CART_IN; setPrompt('E', 'Get in the cart'); return; }
    // v11: a free boat (docked or beached) within 1.8, before the agents hanging out on the deck
    if (!wet && !player.interior && pickBoat(px, pz)) { S.act = ACT_BOAT_ON; S.d = BPICK.d; setPrompt('E', 'Take the boat'); return; }
    // v11: a refused summon (inside, seated, at a station) shows why for a second
    if (time - hoverHintT < HOVER_HINT_LEN) { setPrompt('', 'No board here'); return; }

    // 1. the nearest visible agent
    const agents = state.agents || [];
    const show = !state.settings || state.settings.showDemo;
    let best = null, bd = REACH;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a || !a.pos || (!show && a.spec && a.spec.demo)) continue;
      const d = Math.hypot(a.pos.x - px, a.pos.y - pz);
      if (d <= bd) { bd = d; best = a; }
    }
    if (best) {
      S.act = ACT_TALK; S.agent = best; S.d = bd;
      if (talkFor !== best) { talkFor = best; talkText = 'Talk to ' + (best.spec ? best.spec.name : best.id); }
      setPrompt('E', talkText); return;
    }
    // 1b. v9: a scooter in a rack nearby or a free one within 1.6
    if (!wet && !player.onDeck && pickScooter(px, pz)) {
      S.act = ACT_SCOOT_ON; S.d = SPICK.d; setPrompt('E', 'Grab a scooter'); return;
    }
    // 2. the cafe counter
    if (!wet && cafe && cafe.doorPos && Math.hypot(cafe.doorPos.x - px, cafe.doorPos.y - pz) <= REACH) {
      S.act = ACT_GRAB;
      setPrompt('E', player.held ? 'Put it back' : (nextTreat === 'coffee' ? 'Grab a coffee' : 'Grab an ice cream')); return;
    }
    // 3. a free seat
    if (!wet) {
      const seats = state.seats || [];
      let bs = null; bd = REACH;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        if (s.takenBy) continue;
        const d = Math.hypot(s.x + 0.5 - px, s.y + 0.5 - pz);
        if (d <= bd) { bd = d; bs = s; }
      }
      if (bs) { S.act = ACT_SIT; S.seat = bs; S.d = bd; setPrompt('E', 'Sit down'); return; }
    }
    // 4. the ladder while swimming
    if (pier && L && (L.phase === 'swimming' || L.phase === 'leaving') && Math.hypot(pier.ladder.x - px, pier.ladder.y - pz) <= LADDER_REACH) {
      S.act = ACT_CLIMB; setPrompt('E', 'Climb out'); return;
    }
    // 4b. golf: a tee box or the range tee line (v5)
    if (!wet && golfMod) {
      const gd = golfData();
      if (gd) {
        let bh = -1; bd = GOLF_REACH;
        const holes = gd.holes || [];
        for (let i = 0; i < holes.length; i++) {
          const h = holes[i];
          if (!h || !h.tee) continue;
          const d = Math.hypot(h.tee.x - px, h.tee.y - pz);
          if (d <= bd) { bd = d; bh = i; }
        }
        if (bh >= 0) {
          const h = holes[bh], hn = finite(h.n) ? h.n : bh + 1;
          if (inRound()) {
            // v8: only the current hole's tee is live during a round
            if (GOLF.phase === 'between' && hn === GOLF.hole) { S.act = ACT_TEE_ROUND; S.hole = bh; S.d = bd; setPrompt('E', 'Tee off (round)'); return; }
            if (hn !== GOLF.hole) { setPrompt('', 'Play holes in order'); return; }
            player.prompt = null; return;
          }
          S.act = ACT_TEE; S.hole = bh; S.d = bd;
          if (!teeText[bh]) teeText[bh] = 'Practice hole ' + hn;
          setPrompt('E', teeText[bh]); return;
        }
        const line = !inRound() && gd.range && gd.range.teeLine;
        if (line) {
          let hit = false; bd = GOLF_REACH;
          for (let i = 0; i < line.length; i++) { const p = line[i]; const d = Math.hypot(p.x - px, p.y - pz); if (d <= bd) { bd = d; hit = true; } }
          if (hit) { S.act = ACT_RANGE; S.d = bd; setPrompt('E', 'Hit some balls'); return; }
        }
      }
    }
    // 4c. v8: the clubhouse door zone starts a round
    if (!wet && golfMod && !inRound() && clubhouse && holeCount() > 0) {
      const dp = clubhouse.doorPos;
      if (doorZoneHit(clubhouse, px, pz) || (dp && finite(dp.x) && finite(dp.y) && Math.hypot(dp.x - px, dp.y - pz) <= CLUB_REACH)) {
        S.act = ACT_START_ROUND; setPrompt('E', 'Start a round'); return;
      }
    }
    // 5. a department station with nobody working
    if (!wet) {
      const recs = getRecs() || [];
      let br = null; bd = REACH;
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (!r || r.isCafe || !r.activity || r.worker || !r.b || !r.b.station) continue;
        const st = r.b.station;
        const d = Math.hypot(st.x + st.w / 2 - px, st.y + st.h / 2 - pz);
        if (d <= bd) { bd = d; br = r; }
      }
      if (br) {
        S.act = ACT_STATION; S.rec = br; S.d = bd;
        if (stationFor !== br) {
          stationFor = br;
          const lbl = String(br.label || (br.b.activityLabel) || 'Try the station');
          stationText = isGerund(lbl) ? 'Try: ' + lbl : lbl;
        }
        setPrompt('E', stationText); return;
      }
    }
    // 6. a department door
    if (!wet) {
      const bs = state.buildings || [];
      let bb = null; bd = DOOR_REACH;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (!b || b.kind !== 'dept' || !b.doorPos) continue;
        const d = Math.hypot(b.doorPos.x - px, b.doorPos.y - pz);
        if (d <= bd) { bd = d; bb = b; }
      }
      if (bb) {
        S.act = ACT_DOOR; S.bld = bb; S.d = bd;
        if (doorFor !== bb) { doorFor = bb; doorText = 'Visit ' + (bb.dept ? bb.dept.name : (bb.name || 'the building')); }
        setPrompt('E', doorText); return;
      }
    }
    player.prompt = null;
  }

  function selectRoomDept(room) {
    const b = interiorBld || buildingForRoom(room);
    const dept = (b && b.dept) || (deptById && room.id ? deptById[room.id] : null) || null;
    select({ kind: 'dept', id: dept ? dept.id : (room.id || 'room'), dept, building: b || null });
  }
  function doInteract(time) {
    switch (S.act) {
      case ACT_STANDUP: standUp(); break;
      case ACT_LEAVE: leaveStation(time, false); break;
      case ACT_TALK: if (S.agent) talkTo(S.agent, time); break;
      case ACT_GRAB:
        if (player.held) player.held = null;
        else { player.held = nextTreat; nextTreat = nextTreat === 'icecream' ? 'coffee' : 'icecream'; }
        break;
      case ACT_SIT: if (S.seat) sitDown(S.seat, time); break;
      case ACT_CLIMB: {
        beginSwimPhase('climbing', time); phaseT0 = time;
        from.x = player.pos.x; from.z = player.pos.y;
        player.pose = 'climb'; vel.x = 0; vel.z = 0;
        const pier = state.pier;
        if (pier) setMoveDir(pier.base.x - from.x, pier.base.y - from.z);
        break;
      }
      case ACT_STATION: if (S.rec) useStation(S.rec, time); break;
      case ACT_DOOR:
        if (S.bld) select({ kind: 'dept', id: S.bld.dept ? S.bld.dept.id : S.bld.name, dept: S.bld.dept || null, building: S.bld });
        break;
      case ACT_TEE: if (S.hole >= 0) enterGolf('hole', S.hole + 1, time); break;
      case ACT_RANGE: enterGolf('range', 0, time); break;
      case ACT_AGAIN: if (golfing()) playAgain(time); break;
      // v8
      case ACT_START_ROUND: startRound(time); break;
      case ACT_TEE_ROUND: if (S.hole >= 0 && inRound() && GOLF.phase === 'between') enterGolf('round', S.hole + 1, time); break;
      case ACT_PLAY_BALL: playBall(time); break;
      case ACT_CART_IN: enterCart(time); break;
      case ACT_CART_OUT: if (inCart()) exitCart(time); break;
      case ACT_HOME: goHome(time); break;
      // v9
      case ACT_SCOOT_ON: if (SPICK.s) grabScooter(SPICK.s, time); break;
      case ACT_SCOOT_OFF: if (riding()) hopOff(time); break;
      // v11
      case ACT_HOVER_OFF: break;                 // H hops off the board, E is inert while riding it
      case ACT_BOAT_ON: if (BPICK.b) takeBoat(BPICK.b, time); break;
      case ACT_BOAT_TIE: if (DPICK.d) tieUp(DPICK.d, time); break;
      case ACT_BOAT_OFF: if (boating()) leaveBoat(time, true); break;
      case ACT_EXIT_ROOM: requestExit(time); break;
      case ACT_BOARD: if (player.interior) selectRoomDept(player.interior); break;
      case ACT_PORTRAIT: {
        const it = S.item;
        if (!it) break;
        const agents = state.agents || [];
        let a = null;
        for (let i = 0; i < agents.length; i++) if (agents[i] && agents[i].id === it.agentId) { a = agents[i]; break; }
        if (a) select({ kind: 'agent', id: a.id, agent: a });
        else if (player.interior) selectRoomDept(player.interior);
        break;
      }
      default: break;
    }
  }
  function doJump(time) {
    const L = swimL();
    if (S.act === ACT_DIVE && L && L.phase === 'boarding') {
      const pier = state.pier;
      beginSwimPhase('diving', time); phaseT0 = time;
      from.x = player.pos.x; from.z = player.pos.y;
      player.jumpT = 0; player.pose = 'dive'; player.onBoard = true;
      vel.x = 0; vel.z = 0;
      if (pier) setMoveDir(pier.landing.x - from.x, pier.landing.y - from.z);
      return;
    }
    if (inWater() || seated() || atStation() || player.exiting || fadingOut() || (L && (L.phase === 'diving' || L.phase === 'climbing'))) return;
    if (hopT0 < 0) hopT0 = time;
  }

  /* ---------- look and cameras (v5, chase only since v7) ---------- */
  /* V: the chase distance jumps to the other preset (near 4.2 or far 6.5), whichever is farther
     from the current distance, so a wheel-zoomed camera still lands on a preset. */
  function toggleDistance() {
    const d = finite(player.orbitDist) ? player.orbitDist : ORBIT_DIST_DEF;
    player.orbitDist = Math.abs(d - DIST_NEAR) <= Math.abs(d - DIST_FAR) ? DIST_FAR : DIST_NEAR;
  }
  function applyLook(dt) {
    const dx = inp.lookDX, dy = inp.lookDY;
    inp.lookDX = 0; inp.lookDY = 0;
    if (dx !== 0 || dy !== 0) lastMouseT = clock;
    player.view = 'chase';
    // an angle written from outside since the last frame (the renderer, a test) becomes its own target
    if (player.yaw !== wYaw && finite(player.yaw)) player.targetYaw = wrap(player.yaw);
    if (player.orbitYaw !== wOrbitYaw && finite(player.orbitYaw)) { orbitYawT = wrap(player.orbitYaw); cam.snap = true; }
    if (player.orbitPitch !== wOrbitPitch && finite(player.orbitPitch)) { orbitPitchT = clamp(player.orbitPitch, ORBIT_PITCH_MIN, ORBIT_PITCH_MAX); cam.snap = true; }
    const k = dt > 0 ? 1 - Math.exp(-dt / LOOK_TAU) : 1;
    orbitYawT = wrap(orbitYawT - dx * LOOK_SENS);
    orbitPitchT = clamp(orbitPitchT + dy * LOOK_SENS, ORBIT_PITCH_MIN, ORBIT_PITCH_MAX);
    let oy = player.orbitYaw + wrap(orbitYawT - player.orbitYaw) * k;
    oy = wrap(oy);
    player.orbitYaw = finite(oy) ? oy : orbitYawT;
    const op = player.orbitPitch + (orbitPitchT - player.orbitPitch) * k;
    player.orbitPitch = finite(op) ? clamp(op, ORBIT_PITCH_MIN, ORBIT_PITCH_MAX) : ORBIT_PITCH_DEF;
    player.targetYaw = finite(player.targetYaw) ? wrap(player.targetYaw) : player.yaw;
    if (inp.zoom !== 0) {
      player.orbitDist = clamp(player.orbitDist + inp.zoom * ZOOM_RATE, ORBIT_DIST_MIN, ORBIT_DIST_MAX);
      inp.zoom = 0;
    }
    if (!finite(player.orbitDist)) player.orbitDist = ORBIT_DIST_DEF;
  }
  /* Where the body stands this frame (feet, world). At a station it is the rendered handle. */
  function bodyPoint() {
    const A = player.anchorPos;
    if (atStation() && A && finite(A.x) && finite(A.y) && finite(A.z)) { S.bx = A.x; S.by = A.y; S.bz = A.z; return; }
    S.bx = player.pos.x; S.by = (finite(player.floorY) ? player.floorY : 0) + (finite(player.heightOffset) ? player.heightOffset : 0); S.bz = player.pos.y;
  }
  function camBlocked(px, py, pz) {
    const r = player.interior;
    if (r && r.origin) {
      const o = r.origin;
      if (px < o.x + WALL_INSET || px > o.x + r.w - WALL_INSET || pz < o.z + WALL_INSET || pz > o.z + r.d - WALL_INSET) return true;
      const fy = finite(r.floorY) ? r.floorY : 0;
      if (py > fy + CEIL_H) return true;
      const obs = r.obstacles;
      if (obs && py < fy + FURNITURE_H) for (let i = 0; i < obs.length; i++) {
        const b = obs[i];
        if (px > b.x0 - 0.1 && px < b.x1 + 0.1 && pz > b.z0 - 0.1 && pz < b.z1 + 0.1) return true;
      }
      return false;
    }
    // outdoors the march also stops below the terrain (CONTRACT_V8: cam.y >= heightAt + 0.6); v11: and below the water surface
    if (terrain && typeof terrain.heightAt === 'function' && py < surfaceAt(px, pz) + CAM_GROUND) return true;
    return blocked(at(Math.floor(px), Math.floor(pz)));
  }
  /* March from (hx, hy, hz) along the unit direction up to maxD in CAM_STEP steps; the distance
     before the first blocked sample (walls, furniture, building and tree tiles, and outdoors the
     terrain less CAM_GROUND), at least CAM_MIN. */
  function marchClear(hx, hy, hz, dx, dy, dz, maxD) {
    let blockedAt = -1;
    for (let d = CAM_STEP; d < maxD; d += CAM_STEP) {
      if (camBlocked(hx + dx * d, hy + dy * d, hz + dz * d)) { blockedAt = d; break; }
    }
    if (blockedAt < 0 && camBlocked(hx + dx * maxD, hy + dy * maxD, hz + dz * maxD)) blockedAt = maxD;
    const dist = blockedAt < 0 ? maxD : blockedAt - CAM_STEP;
    return clamp(dist, Math.min(CAM_MIN, maxD), maxD);
  }
  /* v10: the riding share of the top speed (the scooter's 7.5, the cart's 8.5); 0 on foot. The
     chase camera's spring, distance and look-ahead scale with it. */
  function rideK() {
    if (riding()) return clamp(Math.abs(SCOOT.speed) / SCOOT_FAST, 0, 1);
    if (inCart()) return clamp(Math.abs(CART.speed) / CART_TOP, 0, 1);
    if (hovering()) return clamp(HOVER.speed / HOVER_BOOST, 0, 1);          // v11
    if (boating()) return clamp(Math.abs(BOAT.speed) / BOAT_LAUNCH, 0, 1);   // v11
    return 0;
  }
  /* v11: the boat camera sits 3.2 above the water line at distance 7: the pitch that gives that
     height from the head point (the seat plus the chase head), the orbit pitch when steeper. */
  const BOAT_PITCH = clamp(Math.asin(clamp((BOAT_CAM_HEIGHT - BOAT_SEAT - CHASE_HEAD) / BOAT_CAM_DIST, 0, 1)), ORBIT_PITCH_MIN, ORBIT_PITCH_MAX);
  function updateChaseCam(dt) {
    bodyPoint();
    const hx = S.bx, hy = S.by + CHASE_HEAD, hz = S.bz;
    const kf = rideK();
    const spring = lerp(CAM_SPRING, CAM_SPRING_FAST, kf);
    // v11: the hoverboard's distance runs 4.5 to 6 with the speed, the boat's sits at 7
    const wantDist = hovering() ? lerp(HOVER_CAM_NEAR, HOVER_CAM_FAR, kf) : boating() ? BOAT_CAM_DIST : player.orbitDist + CAM_DIST_FAST * kf;
    const pitch = boating() ? Math.max(player.orbitPitch, BOAT_PITCH) : player.orbitPitch;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let dx = -Math.sin(player.orbitYaw) * cp, dy = sp, dz = -Math.cos(player.orbitYaw) * cp;
    let dist = marchClear(hx, hy, hz, dx, dy, dz, wantDist);
    if (dist <= CAM_MIN + 1e-6 && camBlocked(hx + dx * dist, hy + dy * dist, hz + dz * dist)) {
      // blocked before the minimum distance (the back is against a wall): go steep over the head instead
      const cp2 = Math.cos(ORBIT_PITCH_MAX), sp2 = Math.sin(ORBIT_PITCH_MAX);
      dx = -Math.sin(player.orbitYaw) * cp2; dy = sp2; dz = -Math.cos(player.orbitYaw) * cp2;
      dist = marchClear(hx, hy, hz, dx, dy, dz, wantDist);
    }
    const ix = hx + dx * dist, iy = hy + dy * dist, iz = hz + dz * dist;
    CAM_IDEAL.x = ix; CAM_IDEAL.y = iy; CAM_IDEAL.z = iz; CAM_IDEAL.spring = spring; CAM_IDEAL.dist = wantDist; CAM_IDEAL.look = lerp(CHASE_LOOK_FWD, CHASE_LOOK_FAST, kf); CAM_IDEAL.k = kf;
    if (cam.snap || !finite(cam.x) || !finite(cam.y) || !finite(cam.z)) { cam.x = ix; cam.y = iy; cam.z = iz; cam.snap = false; }
    else {
      const k = 1 - Math.exp(-dt * spring);
      cam.x += (ix - cam.x) * k; cam.y += (iy - cam.y) * k; cam.z += (iz - cam.z) * k;
    }
    // the sprung position never sits behind a wall
    const vx = cam.x - hx, vy = cam.y - hy, vz = cam.z - hz, vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (vl > CAM_MIN + 1e-6) {
      const d2 = marchClear(hx, hy, hz, vx / vl, vy / vl, vz / vl, vl);
      if (d2 < vl - 1e-6) { cam.x = hx + vx / vl * d2; cam.y = hy + vy / vl * d2; cam.z = hz + vz / vl * d2; }
    }
    if (!finite(cam.x) || !finite(cam.y) || !finite(cam.z)) { cam.x = ix; cam.y = iy; cam.z = iz; }
  }
  function updateBallCam(dt) {
    const b = player.followBall;
    if (!b || !b.pos) { bcam.snap = true; return; }
    const vx = b.vel ? b.vel.x : 0, vz = b.vel ? b.vel.z : 0, hl = Math.hypot(vx, vz);
    let hx, hz;
    if (hl > 0.5) { hx = vx / hl; hz = vz / hl; } else { hx = Math.sin(GOLF.aimYaw); hz = Math.cos(GOLF.aimYaw); }
    const ce = Math.cos(BALL_CAM_ELEV), se = Math.sin(BALL_CAM_ELEV);
    const ix = b.pos.x - hx * BALL_CAM_DIST * ce, iy = b.pos.y + BALL_CAM_DIST * se, iz = b.pos.z - hz * BALL_CAM_DIST * ce;
    if (bcam.snap || !finite(bcam.x) || !finite(bcam.y) || !finite(bcam.z)) {
      // the spring starts from the chase camera's current pose
      if (cam.snap) updateChaseCam(0);
      bcam.x = cam.x; bcam.y = cam.y; bcam.z = cam.z;
      bcam.snap = false;
    } else {
      const k = 1 - Math.exp(-dt * BALL_CAM_SPRING);
      bcam.x += (ix - bcam.x) * k; bcam.y += (iy - bcam.y) * k; bcam.z += (iz - bcam.z) * k;
    }
    if (!finite(bcam.x) || !finite(bcam.y) || !finite(bcam.z)) { bcam.x = ix; bcam.y = iy; bcam.z = iz; }
  }
  /* A mild FOV ease while running (68 walking, 71 running); the renderer reads fovTarget and fov. */
  function updateFov(dt, moving) {
    const wet = inWater(), sp = player.speed;
    const want = (!wet && inp.run && moving && sp > SPEED_WALK + 0.2 && movable()) ? FOV_RUN : FOV_WALK;
    player.fovTarget = want;
    const step = (FOV_RUN - FOV_WALK) / FOV_LEN * dt;
    player.fov = finite(player.fov) ? player.fov + clamp(want - player.fov, -step, step) : want;
  }

  /* ---------- per frame ---------- */
  function update(dt, time) {
    if (!finite(dt) || dt < 0) dt = 0; if (dt > 0.1) dt = 0.1;
    if (finite(time)) clock = time; else { clock += dt; time = clock; }
    sweepBubbles(time, false);
    if (!player.active) { inp.jump = false; inp.interact = false; inp.toggleView = false; inp.lookDX = 0; inp.lookDY = 0; inp.zoom = 0; inp.club = null; inp.quit = false; inp.hover = false; return; }

    // look and the distance preset; movement is relative to the orbit (camera) yaw
    if (inp.toggleView) { toggleDistance(); inp.toggleView = false; }
    applyLook(dt);
    if (!golfing()) player.bodyYaw = player.yaw;
    updateFade(time);
    forwardOf(player.orbitYaw);     // after the fade: a placement (inside or outside) re-aims the orbit this frame

    const pier = state.pier;
    const moving = Math.abs(inp.fwd) > 0.05 || Math.abs(inp.side) > 0.05;
    player.yoff = 0;

    // movement keys stand you up
    if (seated() && moving) standUp();
    // v13: any input ends the auto walk along the map route (the edges then act as usual this frame)
    if (routing() && (moving || inp.jump || inp.interact || inp.hover || inp.quit || inp.drive || inp.toggleView)) stopRoute();

    // interactions: the prompt is computed before the edges fire so E acts on what the HUD showed
    computePrompt(time);
    if (inp.interact) { if (!fadingOut()) doInteract(time); inp.interact = false; if (inp.jump) computePrompt(time); }
    // v11: H summons the hoverboard or hops off it (an edge; nothing in the other vehicles)
    if (inp.hover) { inp.hover = false; if (!fadingOut() && !boating()) toggleBoard(time); if (inp.jump) computePrompt(time); }
    // v11.1: while hovering the jump edge is left for updateHover (the ollie)
    if (inp.jump && !golfing() && !hovering()) { if (!inCart() && !riding() && !boating()) doJump(time); inp.jump = false; }
    // v8: X during a round asks, then abandons (or ends the summary); X in practice or the range leaves
    // v9: X and Tab do nothing while riding
    if (inp.quit) { inp.quit = false; if (!riding() && !hovering() && !boating()) { if (inRound()) roundQuit(time); else if (golfing()) leaveGolf(time); } }
    if (inp.drive) { inp.drive = false; if (inCart()) startAutoDrive(time); }
    if (!golfing()) inp.club = null;
    if (player.cart === CART) updateCart(dt, time);
    if (riding()) updateScooter(dt, time);
    if (hovering()) updateHover(dt, time);        // v11
    if (boating()) updateBoat(dt, time);          // v11

    let L = swimL();
    if (golfing()) {
      updateGolf(dt, time);
    } else if (inCart()) {
      player.yoff = 0;             // the seat; updateCart moved the body with the cart
    } else if (riding()) {
      player.yoff = 0;             // v9: the deck; updateScooter moved the body with the scooter
    } else if (hovering() || boating()) {
      player.yoff = 0;             // v11: the board or the boat moved the body
    } else if (player.exiting) {
      updateExiting(dt, time);
    } else if (fadingOut()) {
      player.speed = 0; vel.x = 0; vel.z = 0; player.pose = inWater() ? 'swim' : 'stand';
    } else if (L && L.phase === 'diving') {
      // the agent dive: jumpT 0 to 1 over 1.1 s, straight from the board to the landing
      if (player.jumpT >= 1) {
        startSwimming(time);
        if (pier) { player.pos.x = pier.landing.x; player.pos.y = pier.landing.y; }
      } else {
        const k = Math.min(1, (time - phaseT0) / DIVE_LEN);
        player.jumpT = k;
        if (pier) { player.pos.x = lerp(from.x, pier.landing.x, k); player.pos.y = lerp(from.z, pier.landing.y, k); }
        player.pose = 'dive';
      }
      player.speed = 0;
    } else if (L && L.phase === 'climbing') {
      const k = Math.min(1, (time - phaseT0) / CLIMB_LEN), e = smooth(k);
      if (pier) { player.pos.x = lerp(from.x, pier.base.x, e); player.pos.y = lerp(from.z, pier.base.y, e); }
      player.pose = 'climb'; player.speed = 0;
      // pier.base is the south edge of the planks, so the climb ends standing on the deck at pier.height
      if (k >= 1) { endSwim(); if (pier) { player.pos.x = pier.base.x; player.pos.y = pier.base.y; player.onDeck = true; } }
    } else if (atStation()) {
      player.pose = player.station.pose || 'work';
      player.speed = 0; vel.x = 0; vel.z = 0;
      player.animT += dt;
    } else if (seated()) {
      player.pose = 'sit'; player.speed = 0; vel.x = 0; vel.z = 0;
    } else if (routing()) {
      updateRoute(dt, time);        // v13: the auto walk along the map route
    } else if (player.interior) {
      // inside a room: the room rectangle and the furniture are the collision world
      const room = player.interior;
      const top = inp.run ? SPEED_RUN : SPEED_WALK;
      integrateVelocity(top, dt, moving);
      const x0 = player.pos.x, z0 = player.pos.y;
      const nx = x0 + vel.x * dt;
      if (roomOK(room, nx, z0)) player.pos.x = nx; else vel.x = 0;
      const nz = z0 + vel.z * dt;
      if (roomOK(room, player.pos.x, nz)) player.pos.y = nz; else vel.z = 0;
      if (room.origin) { player.pos.x = clamp(player.pos.x, room.origin.x + RADIUS, room.origin.x + room.w - RADIUS); player.pos.y = clamp(player.pos.y, room.origin.z + RADIUS, room.origin.z + room.d - RADIUS); }
      if (!finite(player.pos.x)) player.pos.x = x0; if (!finite(player.pos.y)) player.pos.y = z0;
      const sp = Math.hypot(vel.x, vel.z);
      player.speed = sp;
      if (sp > 0.05) setMoveDir(vel.x, vel.z);
      advanceWalk(x0, z0);
      faceMovement(dt, sp, moving);
      hopAndPose(time, sp, false);
      // the exit zone fires on the center point once it has been left since the spawn
      if (exitZone(room)) {
        const inside = inZone(player.pos.x, player.pos.y);
        if (!inside) exitArmed = true;
        else if (exitArmed && !player.fade) requestExit(time);
      }
    } else {
      // free movement: walk, run, pier, wade, swim
      const wet = inWater();
      // v12.1: the body's level, pond or lake or river or creek (v14: held under a deck, where the lookup can miss the water body)
      if (wet && !underDeck(Math.floor(player.pos.x), Math.floor(player.pos.y))) SWIM_L.surface = waterLevel(player.pos.x, player.pos.y);
      const top = wet ? SPEED_SWIM : player.onDeck ? SPEED_PIER : (inp.run ? SPEED_RUN : SPEED_WALK);
      integrateVelocity(top, dt, moving);

      const x0 = player.pos.x, z0 = player.pos.y;
      // water is open to a swimmer, from a shore tile, and off the sides of the deck proper (the
      // springboard stays fenced so holding forward stops at the dive spot instead of walking off the end)
      const mayWater = wet || isShoreTile(Math.floor(x0), Math.floor(z0)) || (player.onDeck && !player.onBoard);
      // a move is allowed when it leaves no more radius points misplaced than the current spot has (0 normally)
      const bad0 = badCount(x0, z0, mayWater, wet);
      let nx = x0 + vel.x * dt, nz = z0;
      if (badCount(nx, nz, mayWater, wet) <= bad0) player.pos.x = nx; else vel.x = 0;
      nz = z0 + vel.z * dt;
      if (badCount(player.pos.x, nz, mayWater, wet) <= bad0) player.pos.y = nz; else vel.z = 0;
      player.pos.x = clamp(player.pos.x, RADIUS, COLS - RADIUS);
      player.pos.y = clamp(player.pos.y, RADIUS, ROWS - RADIUS);
      if (!finite(player.pos.x)) player.pos.x = x0; if (!finite(player.pos.y)) player.pos.y = z0;

      const px = player.pos.x, pz = player.pos.y;
      const centerTile = (wet && underDeck(Math.floor(px), Math.floor(pz))) ? T.WA : at(Math.floor(px), Math.floor(pz));   // v14: under a deck the swimmer is in the water
      const sp = Math.hypot(vel.x, vel.z);
      player.speed = sp;
      if (sp > 0.05) setMoveDir(vel.x, vel.z);
      advanceWalk(x0, z0);
      faceMovement(dt, sp, moving);

      // the planks run from boardEnd to pier.base (the center of the land pier tile), so the north
      // half of that tile is deck too. A center over the planks is on the deck, whatever the
      // radius points touch: the deck wins over wading at its edge.
      const onPlanks = !!pier && inPierRect(px, pz) && (centerTile === T.WA || pz <= pier.base.y);
      const centerOpenWater = centerTile === T.WA && !onPlanks;

      // water state machine
      L = swimL();
      if (!L) {
        if (!onPlanks && anyPointWater(px, pz)) { beginSwimPhase('wading', time); SWIM_L.dive = false; player.onDeck = false; player.onBoard = false; L = SWIM_L; }
      }
      if (L && L.phase === 'wading') {
        if (centerOpenWater) startSwimming(time);
        else if (onPlanks || !anyPointWater(px, pz)) endSwim();
      } else if (L && L.phase === 'swimming') {
        if (centerTile !== T.WA) { beginSwimPhase('leaving', time); SWIM_L.dive = false; from.x = px; from.z = pz; }
      } else if (L && L.phase === 'leaving') {
        if (centerOpenWater) beginSwimPhase('swimming', time);
        else if (onPlanks || Math.hypot(px - from.x, pz - from.z) >= WADE_OUT || (!moving && !anyPointWater(px, pz))) endSwim();
      }
      L = swimL();

      // the pier deck and the springboard: the player stands at pier.height on the planks but stays
      // idle over the land half (that half needs no swim path in the renderer).
      if (!inWater()) {
        if (onPlanks && centerTile === T.WA) {
          if (!L) { beginSwimPhase('boarding', time); SWIM_L.dive = true; }
          player.onDeck = true;
          player.onBoard = pz < pier.boardStart.y;
        } else if (onPlanks) {
          if (L) endSwim();
          player.onDeck = true; player.onBoard = false;
        } else if (player.onDeck) {
          // stepped off the planks: into the water (a splash, no idle frame over water) or onto the land
          if (centerOpenWater) { startSwimming(time); SWIM_L.dive = false; } else endSwim();
        }
      }

      hopAndPose(time, sp, true);

      // a department door zone underfoot takes the visitor inside (v5)
      if (player.state === 'idle' && !player.fade && hopT0 < 0) checkDoorZones(time);
      else if (player.state !== 'idle') doorArmed = false;
    }

    // idle blinks and glances in the sim's units (seconds of state.time)
    if (time > player.blinkAt + 0.14 && Math.random() < dt * 0.4) player.blinkAt = time;
    if (time > player.lookAt) player.lookAt = time + 2 + Math.random() * 5;

    updateBoard(dt, time);          // v11: the owned board trails, rides or stays away
    player.look = lookOf();         // v11: the wallet's equipped record for the renderer
    updateFov(dt, moving);
    computeHeight(time);
    updateChaseCam(dt);
    if (golfing() && player.followBall) updateBallCam(dt); else bcam.snap = true;
    if (player.golf === GOLF && !golfing() && GOLF.message && GOLF.phase !== 'done' && time > GOLF.messageUntil) GOLF.message = null;
    // the round clock on the HUD runs while the round is on; finishRound writes the final time
    if (inRound() && GOLF.phase !== 'done') { const rs = time - ROUND.startedAt; GOLF.roundSeconds = finite(rs) ? Math.max(0, rs) : 0; }
    updateHints();
    computePrompt(time);

    if (!finite(player.pos.x) || !finite(player.pos.y)) { if (player.interior && player.interior.origin) { player.pos.x = player.interior.origin.x + player.interior.w / 2; player.pos.y = player.interior.origin.z + player.interior.d / 2; } else findFreeSpot(COLS / 2, ROWS / 2); }
    if (!finite(player.yoff)) player.yoff = 0;
    if (!finite(player.jumpT)) player.jumpT = 0;
    if (!finite(player.animT)) player.animT = 0;
    if (!finite(player.yaw)) { player.yaw = Math.PI; player.targetYaw = Math.PI; }
    if (!finite(player.bodyYaw)) player.bodyYaw = player.yaw;
    if (!finite(player.orbitYaw)) { player.orbitYaw = player.yaw; orbitYawT = player.yaw; }
    if (!finite(player.orbitPitch)) { player.orbitPitch = ORBIT_PITCH_DEF; orbitPitchT = ORBIT_PITCH_DEF; }
    if (!finite(player.fadeT)) player.fadeT = 0;
    if (!finite(player.floorY)) player.floorY = 0;
    if (!finite(player.speed)) player.speed = 0;
    if (!finite(player.walkDist)) player.walkDist = 0;
    // v10: a turn in place only runs standing on foot (idle, or wading idle in the water)
    if (player.turn && (player.speed > 0.05 || !(player.state === 'idle' || inWater()))) player.turn = null;
    wYaw = player.yaw; wOrbitYaw = player.orbitYaw; wOrbitPitch = player.orbitPitch;
  }
  /* Accelerates toward the wanted velocity (input times top speed) at 18 u/s² and decelerates at 24. */
  function integrateVelocity(top, dt, moving) {
    let dx = inp.fwd * S.fx + inp.side * S.rx, dz = inp.fwd * S.fz + inp.side * S.rz;
    const dl = Math.hypot(dx, dz);
    if (dl > 1) { dx /= dl; dz /= dl; }
    S.dx = dx * top; S.dz = dz * top;
    const ex = S.dx - vel.x, ez = S.dz - vel.z, el = Math.hypot(ex, ez);
    if (el > 1e-9) {
      const wantMag = Math.hypot(S.dx, S.dz), curMag = Math.hypot(vel.x, vel.z);
      const rate = wantMag > curMag + 1e-6 ? ACCEL : DECEL;
      const stepLen = Math.min(el, rate * dt);
      vel.x += ex / el * stepLen; vel.z += ez / el * stepLen;
    }
    if (!moving && Math.abs(vel.x) < 0.06 && Math.abs(vel.z) < 0.06) { vel.x = 0; vel.z = 0; }
    if (!finite(vel.x) || !finite(vel.z)) { vel.x = 0; vel.z = 0; }
  }
  /* v10 "Walking": the walk cycle is a distance clock. animT advances by the ground covered since
     the start of the frame over STRIDE (one cycle unit per 1.6 units, the scale the animators were
     tuned at with dt times speed), so a blocked or slowed step plants the feet where they are
     instead of sliding them; walkDist accumulates the same distance. */
  function advanceWalk(x0, z0) {
    const d = Math.hypot(player.pos.x - x0, player.pos.y - z0);
    if (!(d > 1e-6) || !finite(d)) return;
    player.animT += d / STRIDE; player.walkDist += d;
  }
  /* v10: standing still, the body turns in place toward where the chase camera looks once the two
     differ by more than TURN_THRESH rad (the camera has rotated the character): player.turn is
     { dir, t, from, to } for the animators while it runs (t 0 to 1 along the turn, retargeted
     while the camera keeps moving) and null otherwise; the turn ends within TURN_DONE. */
  function updateTurn(dt) {
    const oy = player.orbitYaw;
    if (!finite(oy)) { player.turn = null; return; }
    let d = wrap(oy - player.yaw);
    if (player.turn !== TURN) {
      if (Math.abs(d) <= TURN_THRESH) return;
      TURN.dir = d > 0 ? 1 : -1; TURN.from = player.yaw; TURN.to = oy; TURN.t = 0;
      player.turn = TURN;
    }
    TURN.to = oy;
    const mx = TURN_RATE * dt;
    player.yaw = wrap(player.yaw + clamp(d, -mx, mx));
    d = wrap(oy - player.yaw);
    const span = Math.abs(wrap(TURN.to - TURN.from));
    TURN.t = span > 1e-6 ? clamp(1 - Math.abs(d) / span, 0, 1) : 1;
    setMoveDir(Math.sin(player.yaw), Math.cos(player.yaw));
    if (Math.abs(d) <= TURN_DONE) { player.yaw = wrap(oy); player.turn = null; }
  }
  /* The body turns toward its movement at 10 rad/s and keeps its facing when idle (v10: unless the
     chase camera has turned more than 0.6 rad away, then it turns in place); the orbit settles
     behind after 1.5 s of moving without mouse input. */
  function faceMovement(dt, sp, moving) {
    if (sp > 0.05) {
      const tgt = Math.atan2(vel.x, vel.z);
      const d = wrap(tgt - player.yaw), mx = FACE_RATE * dt;
      player.yaw = wrap(player.yaw + clamp(d, -mx, mx));
      player.turn = null;
    } else if (!moving && hopT0 < 0) updateTurn(dt);
    else player.turn = null;
    player.targetYaw = player.yaw; player.bodyYaw = player.yaw;
    if (moving) {
      if (moveT0 < 0) moveT0 = clock;
      if (clock - moveT0 > ALIGN_DELAY && clock - lastMouseT > ALIGN_DELAY) {
        const d = wrap(player.yaw - orbitYawT), mx = ALIGN_RATE * dt, st = clamp(d, -mx, mx);
        orbitYawT = wrap(orbitYawT + st);
        player.orbitYaw = wrap(player.orbitYaw + st);
      }
    } else moveT0 = -1;
  }
  function hopAndPose(time, sp, outdoors) {
    if (hopT0 >= 0) {
      const u = (time - hopT0) / HOP_LEN;
      if (u >= 1 || u < 0) hopT0 = -1;
      else player.yoff = -3 * Math.sin(Math.PI * u);
    }
    const L = outdoors ? swimL() : null;
    if (L && (L.phase === 'swimming')) player.pose = 'swim';
    else if (L && (L.phase === 'wading' || L.phase === 'leaving')) player.pose = sp > 0.15 ? 'walk' : 'stand';
    else if (hopT0 >= 0) player.pose = 'hop';
    else player.pose = sp > 0.15 ? 'walk' : 'stand';
  }

  /* ---------- camera ---------- */
  function cameraPose(outPos, outTarget) {
    const b = player.followBall;
    if (golfing() && b && b.pos && finite(b.pos.x) && finite(b.pos.z)) {
      if (bcam.snap) updateBallCam(0);
      outPos.x = bcam.x; outPos.y = bcam.y; outPos.z = bcam.z;
      outTarget.x = b.pos.x; outTarget.y = (finite(b.pos.y) ? b.pos.y : BALL_R) + 0.2; outTarget.z = b.pos.z;
      if (!finite(outPos.x) || !finite(outPos.y) || !finite(outPos.z)) { outPos.x = b.pos.x; outPos.y = 2; outPos.z = b.pos.z + BALL_CAM_DIST; }
      return outPos;
    }
    // the chase camera (the only walk camera since v7)
    bodyPoint();
    const hx = S.bx, hy = S.by + CHASE_HEAD, hz = S.bz;
    if (cam.snap) updateChaseCam(0);
    outPos.x = cam.x; outPos.y = cam.y; outPos.z = cam.z;
    const oy = finite(player.orbitYaw) ? player.orbitYaw : Math.PI;
    // v10: the look point blends from 0.4 along the orbit yaw on foot to 1.6 along the heading at
    // full riding speed (the camera looks down the road ahead of the rider)
    const kf = rideK(), hy2 = finite(player.yaw) ? player.yaw : oy;
    const lx = Math.sin(oy) * CHASE_LOOK_FWD * (1 - kf) + Math.sin(hy2) * CHASE_LOOK_FAST * kf;
    const lz = Math.cos(oy) * CHASE_LOOK_FWD * (1 - kf) + Math.cos(hy2) * CHASE_LOOK_FAST * kf;
    outTarget.x = hx + lx; outTarget.y = hy; outTarget.z = hz + lz;
    if (!finite(outPos.x) || !finite(outPos.y) || !finite(outPos.z)) { outPos.x = hx; outPos.y = hy + 2; outPos.z = hz + ORBIT_DIST_DEF; }
    return outPos;
  }

  /* ---------- debugging and tests ---------- */
  function interactables() {
    const out = [];
    const px = player.pos.x, pz = player.pos.y;
    if (player.interior) {
      const room = player.interior;
      if (exitZone(room)) { const d = Math.hypot(ZONE.cx - px, ZONE.cz - pz); out.push({ kind: 'exit', d, inZone: inZone(px, pz), armed: exitArmed }); }
      for (const it of (room.interactables || [])) {
        if (!it || it.kind === 'exit') continue;
        const d = Math.hypot(it.x - px, it.z - pz);
        if (d <= REACH) out.push({ kind: it.kind, label: it.label, agentId: it.agentId, d });
      }
      out.sort((p, q) => p.d - q.d);
      return out;
    }
    const show = !state.settings || state.settings.showDemo;
    for (const a of (state.agents || [])) {
      if (!a || !a.pos || (!show && a.spec && a.spec.demo)) continue;
      const d = Math.hypot(a.pos.x - px, a.pos.y - pz);
      if (d <= REACH) out.push({ kind: 'agent', id: a.id, name: a.spec && a.spec.name, d });
    }
    if (cafe && cafe.doorPos) { const d = Math.hypot(cafe.doorPos.x - px, cafe.doorPos.y - pz); if (d <= REACH) out.push({ kind: 'cafe', d }); }
    for (const s of (state.seats || [])) { const d = Math.hypot(s.x + 0.5 - px, s.y + 0.5 - pz); if (d <= REACH) out.push({ kind: 'seat', id: s.id, seatKind: s.kind, takenBy: s.takenBy, d }); }
    if (state.pier) { const d = Math.hypot(state.pier.ladder.x - px, state.pier.ladder.y - pz); if (d <= LADDER_REACH) out.push({ kind: 'ladder', d }); }
    for (const r of (getRecs() || [])) {
      if (!r || r.isCafe || !r.activity || !r.b || !r.b.station) continue;
      const st = r.b.station, d = Math.hypot(st.x + st.w / 2 - px, st.y + st.h / 2 - pz);
      if (d <= REACH) out.push({ kind: 'station', id: r.b.dept && r.b.dept.id, label: r.label, worker: r.worker, d });
    }
    for (const b of (state.buildings || [])) {
      if (!b || b.kind !== 'dept' || !b.doorPos) continue;
      const d = Math.hypot(b.doorPos.x - px, b.doorPos.y - pz);
      if (d <= DOOR_REACH) out.push({ kind: 'door', id: b.dept && b.dept.id, d, zone: doorZoneHit(b, px, pz), room: !!roomFor(b) });
    }
    const gd = golfData();
    if (gd && golfMod) {
      (gd.holes || []).forEach((h, i) => { if (!h || !h.tee) return; const d = Math.hypot(h.tee.x - px, h.tee.y - pz); if (d <= GOLF_REACH) out.push({ kind: 'tee', hole: finite(h.n) ? h.n : i + 1, par: h.par, d }); });
      if (gd.range && gd.range.teeLine) { let bd = Infinity; for (const p of gd.range.teeLine) bd = Math.min(bd, Math.hypot(p.x - px, p.y - pz)); if (bd <= GOLF_REACH) out.push({ kind: 'range', d: bd }); }
    }
    // v8
    const ch = clubhouseRec();
    if (ch && ch.doorPos) { const d = Math.hypot(ch.doorPos.x - px, ch.doorPos.y - pz); if (d <= DOOR_REACH) out.push({ kind: 'clubhouse', d, zone: doorZoneHit(ch, px, pz) }); }
    if (player.cart === CART) { const d = Math.hypot(CART.x - px, CART.z - pz); if (d <= SEAT_REACH + 1) out.push({ kind: 'cart', d, occupied: CART.occupied, auto: CART.auto ? CART.auto.kind : null }); }
    if (inRound() && GOLF.ball && GOLF.phase === 'ready') { const d = Math.hypot(GOLF.ball.pos.x - px, GOLF.ball.pos.z - pz); if (d <= GOLF_REACH + 1) out.push({ kind: 'ball', d }); }
    // v9
    for (const s of scooterList()) { if (!s || !finite(s.x) || !finite(s.y)) continue; const d = Math.hypot(s.x - px, s.y - pz); if (d <= SCOOT_REACH + 1) out.push({ kind: 'scooter', id: s.id, rackId: s.rackId === undefined ? null : s.rackId, rider: s.rider === undefined ? null : s.rider, parked: !!s.parked, d }); }
    for (const r of rackList()) { if (!r) continue; const d = Math.hypot(rackX(r) - px, rackZ(r) - pz); if (d <= SCOOT_REACH + 1) out.push({ kind: 'rack', id: r.id, scooters: Array.isArray(r.scooters) ? r.scooters.slice() : null, d }); }
    // v11
    for (const b of boatList()) { if (!b || !finite(recX(b)) || !finite(recY(b))) continue; const d = Math.hypot(recX(b) - px, recY(b) - pz); if (d <= BOAT_REACH + 1) out.push({ kind: 'boat', id: b.id, boatKind: b.kind, rider: b.rider === undefined ? null : b.rider, dock: b.dock === undefined ? null : b.dock, parked: !!b.parked, d }); }
    for (const dk of dockList()) { if (!dk) continue; const d = Math.hypot(dockTileX(dk) - px, dockTileZ(dk) - pz); if (d <= DOCK_REACH + 1) out.push({ kind: 'dock', id: dk.id, boat: dk.boat === undefined ? null : dk.boat, d }); }
    out.sort((p, q) => p.d - q.d);
    return out;
  }
  function debugState() {
    const L = player.leisure, g = player.golf;
    return {
      active: player.active, x: player.pos.x, z: player.pos.y, yaw: player.yaw, bodyYaw: player.bodyYaw, view: player.view,
      targetYaw: player.targetYaw, orbitYaw: player.orbitYaw, orbitPitch: player.orbitPitch, orbitDist: player.orbitDist,
      fovTarget: player.fovTarget, fov: player.fov,
      state: player.state, pose: player.pose, speed: player.speed, animT: player.animT, yoff: player.yoff,
      leisure: L ? { kind: L.kind, phase: L.phase, seat: L.seat ? L.seat.id : null, dive: L.dive } : null,
      onBoard: player.onBoard, onDeck: player.onDeck, jumpT: player.jumpT, splash: player.splash, held: player.held,
      station: player.station ? (player.station.b && player.station.b.dept ? player.station.b.dept.id : 'station') : null,
      exiting: player.exiting ? { t: player.exiting.t, fromX: player.exiting.from.x, fromY: player.exiting.from.y, fromZ: player.exiting.from.z, toX: player.exiting.to.x, toZ: player.exiting.to.z } : null,
      interior: player.interior ? (player.interior.id || 'room') : null, floorY: player.floorY, fade: player.fade, fadeT: player.fadeT,
      golf: g ? { mode: g.mode, hole: g.hole, club: g.club, phase: g.phase, power: g.power, strokes: g.strokes, card: g.card.slice(), message: g.message, swingT: g.swingT, aimYaw: g.aimYaw, aimLen: g.aimLen, carry: g.carry, bestCarry: g.bestCarry, ballsHit: g.ballsHit, lie: g.lie, roundT0: g.roundT0, roundSeconds: g.roundSeconds, ball: g.ball ? { x: g.ball.pos.x, y: g.ball.pos.y, z: g.ball.pos.z } : null,
        par: g.par, cartHint: g.cartHint, round: g.round ? { startedAt: g.round.startedAt, strokes: g.round.strokes } : null, roundResult: g.roundResult } : null,
      cart: player.cart ? { x: player.cart.x, z: player.cart.z, y: player.cart.y, yaw: player.cart.yaw, speed: player.cart.speed, steer: player.cart.steer, occupied: player.cart.occupied, auto: player.cart.auto ? player.cart.auto.kind : null } : null,
      scooter: player.scooter ? { id: player.scooter.id, x: player.scooter.x, z: player.scooter.z, y: player.scooter.y, yaw: player.scooter.yaw, speed: player.scooter.speed, steer: player.scooter.steer, lean: player.scooter.lean, hint: player.scooter.hint, controller: !!scootCtl && scootCtlStrikes < 3 } : null,
      // v11
      hover: player.hover ? { x: HOVER.x, z: HOVER.z, y: HOVER.y, yaw: HOVER.yaw, speed: HOVER.speed, steer: HOVER.steer, lean: HOVER.lean, airborne: HOVER.airborne, boostT: HOVER.boostT, chargeT: HOVER.chargeT, vy: HOVER.vy, ground: HOVER.ground, surface: HOVER.surface, boosting: HOVER.boosting, dip: HOVER.dip, drift: HOVER.drift, kicks: HOVER.kicks, controller: !!hoverCtl && hoverCtlStrikes < 3 } : null,
      board: player.board ? { x: BOARD.x, z: BOARD.z, y: BOARD.y, yaw: BOARD.yaw, state: BOARD.state, glow: BOARD.glow } : null,
      boat: player.boat ? { id: BOAT.id, kind: BOAT.kind, x: BOAT.x, z: BOAT.z, y: BOAT.y, yaw: BOAT.yaw, speed: BOAT.speed, steer: BOAT.steer, max: BOAT.max, slow: BOAT.slow, wake: BOAT.wake, hint: BOAT.hint, controller: !!boatCtl && boatCtlStrikes < 3, strikes: boatCtlStrikes } : null,
      hoverStrikes: hoverCtlStrikes,
      look: player.look ? { board: player.look.board === undefined ? null : player.look.board, hat: player.look.hat === undefined ? null : player.look.hat } : null,
      followBall: !!player.followBall, lastCard: player.lastCard,
      // v13
      route: player.route ? { active: ROUTE.active, left: ROUTE.left, x: ROUTE.x, z: ROUTE.z, t0: ROUTE.t0 } : null,
      talkingTo: player.talkingTo, prompt: player.prompt ? { text: player.prompt.text, key: player.prompt.key, full: player.prompt.full } : null,
      heightOffset: player.heightOffset, deckY: player.deckY, moveDir: { x: player.moveDir.x, z: player.moveDir.z }, vel: { x: vel.x, z: vel.z },
      cam: { x: cam.x, y: cam.y, z: cam.z }, doorArmed, exitArmed,
      // v10
      camIdeal: { x: CAM_IDEAL.x, y: CAM_IDEAL.y, z: CAM_IDEAL.z }, camSpring: CAM_IDEAL.spring, camDist: CAM_IDEAL.dist, lookAhead: CAM_IDEAL.look, rideK: CAM_IDEAL.k,
      turn: player.turn ? { dir: player.turn.dir, t: player.turn.t, from: player.turn.from, to: player.turn.to } : null, walkDist: player.walkDist,
      toPar: g ? g.toPar : null, played: g ? g.played : null, launch: clock < launchUntil,
    };
  }

  player.enter = enter;
  player.exit = exit;
  player.setInput = setInput;
  player.update = update;
  player.cameraPose = cameraPose;
  player.interactables = interactables;
  player.debugState = debugState;
  player.enterInterior = (room, bld) => requestEnter(room, bld || null, clock);
  player.exitInterior = () => requestExit(clock);
  player.setRooms = setRooms;
  // v10: the term helpers and the feel record reachable through TT.player without an import
  player.golfTerm = golfTerm;
  player.roundTerm = roundTerm;
  player.scooterFeel = SCOOTER_FEEL;
  // v11: the hoverboard and boat feel records, the summon for the HUD's button, the water lookup for tests
  player.hoverFeel = HOVER_FEEL;
  player.boatFeel = BOAT_FEEL;
  player.toggleBoard = () => toggleBoard(clock);
  player.surfaceAt = surfaceAt;
  player.waterLevelAt = waterLevel;
  // v13: the map route auto walk (CONTRACT_V13 "Waypoints and directions"); riding states return false
  player.walkRoute = walkRoute;
  player.stopRoute = stopRoute;
  player.route = null;
  return player;
}

export default createPlayer;
