# Thread Town city design

The creative brief for version 2. docs/CONTRACT_V2.md wins over anything here, docs/CONTRACT.md fills in what v2 does not mention, and docs/ART_DIRECTION.md holds the palette, lighting and material values. Where the two design proposals disagreed, the choice below is the one that reads best at the fit distance (about 19 px per unit) and keeps every building silhouette and every activity motion unique. All distances are world units (1 tile = 1 unit), angles in radians, time in seconds, colors sRGB hex.

## Principles

1. Coordinates. Building local origin is the footprint's north-west corner at ground level, x east 0..w, z south 0..h, front face at z = h, door centered at local x = floor(w / 2) (exec 6, embedded 5, compliance 5, fcc 4, ops 5, data 4, credit 5, finance 4, tech 5, risk 3, marketing 5, people 4), 1.6 wide. Keep every part inside -0.6..w + 0.6 by -0.6..h + 0.6 and under 9 tall (risk may reach 13). Station local origin is the station's north-west corner, 4 by 4. Right-side stations have the stub path to the WEST and workTile at local (1.5, 3.5); left-side stations have the path to the EAST and workTile at local (2.5, 3.5). Anchors sit near the work tile so the 0.6 s ease from workPos is short. Yaw 0 faces +z (the camera side). Two doors are recessed inside the footprint (compliance behind its columns, people under its porch); door x and doorPos are unchanged and the steps bridge to the stub. Leave a // CONTRACT: comment in those two modules.
2. Silhouette and roof matrix, used once each: exec = saucer dome on a colonnaded drum with a clock; embedded = two wings bridged by three arches plus a roof dish; compliance = six-column temple with a pediment and a flat roof; fcc = striped block with an off-center square watchtower (pyramid cabin roof); ops = long sawtooth shed with a smokestack and water tank; data = octagon with a split hemisphere dome and a bar-chart sculpture; credit = heavy parapet block with stepped gold slabs, a standing coin and a round vault door; finance = the one slender tower with a ticker band and a pyramid cap; tech = low steel-and-glass box with neon trim and four roof dishes; risk = lighthouse cone cupola plus a lean-to cottage; marketing = gabled studio with a billboard on stilts and balloons; people = hip-roof house with a wraparound porch. No two buildings share a silhouette or a main roof type.
3. Motion matrix, primary motion used once each: exec bursts (confetti launch and fall), embedded races (light beads along cables), compliance slams (vertical stamp), fcc catches (oscillating searchlight sweep that ends in a net drop), ops lifts (crane boom swing and hook), data grows (chart bars rising while the telescope pans), credit swings (vault door opening after a wheel spin), finance pops (coins up a chute into a piggy bank), tech streams (glyphs rising from monitors while a robot arm assembles), risk spins (a full 360 beam rotation plus a seesaw tip), marketing arcs (basketball parabola), people pendulums (swing). Every prop is at least 1.2 units in its largest dimension and every primary motion at least 0.3 units or a clear light change.
4. Burst timing. A work burst is the frame where agent.animT % 3.2 crosses 0.7 (the same window the typing pose uses), so hands and props stay in sync. Cycles that need two beats (ops, credit) run 6.4 s.
5. Materials (ART_DIRECTION values). Walls dept.wall roughness 0.90; signature color dept.accent (roof 0.78, door 0.60); trim, frames, sills, mullions #F8F6F0; plinth and steps #CFC6B6; iron and metal legs #2E3E50 (roughness 0.55, metalness 0.2); wood #A5774E with dark wood #6B4A2B (posts #5E4538); stone #B9C4CC and light stone #CBD3DA; brass #F6D463 (door handles metalness 0.6, every other brass part metalness 0); bulb glass #FFF1C9 with emissive #FFE2A0, lamp light #FFC97A; paper #E8E2D5; desk top #E8DCC0; water #6CC3CB; sand #E3D5B2; hedge green #6FA860; ink #0E1B2E; glass tint #AFD6E4. These shared colors do not count as department extras. Each department may add at most two extra colors, listed under Building. One glass() material per building, transparent false, returned in glass. glow() for screens at 0.6 to 1.0. Shared materials by color, merged static geometry per material, no per-frame allocation.
6. Screen-facing rule. switchboard, ticker and workstation: the alien at yaw 0, the desk at local z = anchor.z + 0.55, the screen facing -z toward the alien, and the screen top no higher than 1.0 for a standing alien or 1.25 for a seated one so the camera (elevation 39.6 deg) sees the face over the screen. The screen backs toward the camera are slate with a small white T decal.
7. Lights. At most two PointLights per building, castShadow false, intensities written for r160 physical lights and multiplied by ramp = clamp((s - 0.25) / 0.75, 0, 1) from ART_DIRECTION. Twelve buildings plus the cafe and fountain exceed the 13-light budget, so the renderer enables department lights only for the building nearest the camera target plus the risk beacon (always on at night) and treats the rest as emissive only. Additive beams, chutes and ripple rings use depthWrite false and renderOrder 5.
8. Hover pause. Hovering any alien sets agent.paused: walking, commuting and swimming aliens stop on the spot (the sim pushes waitUntil and leisure timers forward by dt), face the camera and wave; seated and swimming aliens hold their pose and swimmers stop gliding; working aliens keep working so the Now line stays true. The renderer clears paused on pointer leave with a 0.25 s grace and on agent removal.
9. Canvas textures (tickers, code, scoreboards, counters) repaint at most once per burst; scrolling is UV offset only. Decals are created inside buildBuilding or buildActivity, never at module top level; Kanit and Inter are loaded with document.fonts.load and repainted once when they resolve.
10. Copy. Sentence case, no em dashes anywhere. activityLabel per department: exec 'Giving a speech at the podium', embedded 'Patching partner connections', compliance 'Stamping approvals', fcc 'Watching from the tower', ops 'Running the crane', data 'Scanning the sky', credit 'Spinning the vault wheel', finance 'Watching the ticker', tech 'Shipping code', risk 'Keeping the light', marketing 'Shooting campaign hoops', people 'Swinging with the team'.

## Cafe terrace

Block [1, 1]: building 6 by 4 at (bx + 4, by + 1), door tiles bx + 6 and bx + 7, one-wide stub at bx + 6. Keep the ART_DIRECTION cafe (cream #F6E7C8 walls, salmon roof, aqua door, striped awning, chalkboard, plaque 'Café' 3.2 x 0.9 at (C.x, 3.4, C.z)). Tables at world (bx + 9.5, by + 7.5), (bx + 12.5, by + 7.5), (bx + 9.5, by + 10.5), (bx + 12.5, by + 10.5), seats on the tiles west and east of each.

1. Paving: plane 6.0 x 5.0 at (bx + 11, 0.012, by + 9) rx -pi/2 with a canvasTex of 0.5 unit checker in #D3DBE2 and #CAD3DB, grout #B6C1CA, a 0.08 border #B6C1CA, so the terrace reads as a patio not grass.
2. Tables per ART_DIRECTION: pedestal cyl r 0.03 h 0.62 #2E3E50 on a base disc r 0.18 h 0.03, top cyl r 0.36 h 0.04 at y 0.62 #FBF8F1, umbrella pole r 0.02 to y 1.75, canopy cone r 0.85 h 0.32 base y 1.50 as two interleaved 4-segment meshes salmon and white, finial sphere r 0.04 #F6D463; the fixed stools at radius 0.5 are dropped (v2 seats are tiles). Umbrella poles yaw 0.2 alternately. Table-top props seeded per table: menu card plane 0.14 x 0.2 navy, sugar bowl cyl r 0.05 h 0.05 white, vase cyl r 0.03 h 0.12 aqua with one salmon flower sphere r 0.05.
3. Stools, one per seat (8): seat cyl r 0.16 h 0.05 top at y 0.45 BRAND.wood on a post cyl r 0.03 h 0.40 #2E3E50 with a base disc r 0.14 h 0.03, placed at (seat.x + 0.5, 0, seat.y + 0.5). The seated alien drops by handle.parts.seatY from y 0.45 and faces yaw = atan2(face.x - (seat.x + 0.5), face.y - (seat.y + 0.5)).
4. String lights: four posts cyl r 0.05 h 2.6 #2E3E50 at world (bx + 8.2, by + 6.4), (bx + 13.8, by + 6.4), (bx + 13.8, by + 11.6), (bx + 8.2, by + 11.6) boxing the terrace; four perimeter lines, each a TubeGeometry r 0.012 #2E3E50 on a QuadraticBezierCurve3 from post top y 2.55 sagging to 2.2 at the middle; 11 bulbs per line (sphere r 0.055 #FFF1C9, emissive #FFE2A0) at parameter i / 12 hanging 0.08 below the line, emissiveIntensity 0.1 + 1.6 x ramp, every third bulb tinted aqua at half intensity; no flicker. One PointLight #FFC97A intensity 10 x ramp distance 7 at (bx + 11, 2.2, by + 9) (counts toward the 13-light budget in place of one intersection lamp; the integrator decides).
5. Menu board: A-frame chalkboard box 0.5 x 0.7 x 0.04 #2E3E50 at (bx + 7.8, 0, by + 8.5) on the stub edge, canvasTex 'Ice cream 2 / Coffee 1' in white chalk.
6. Ice cream cart north of the tables at (bx + 11, 0, by + 6.0): box 1.2 x 0.9 x 0.6 #F8F6F0, salmon and white mini awning plane 1.3 x 0.5, two wheels torus r 0.18 tube 0.04 #2E3E50, a glass() dome r 0.25 on top with three scoop spheres r 0.1 in #F8D9E0, #8FD6C8, #F6E6B4.
7. Coffee counter at (bx + 13.6, 0, by + 9.0): box 1.0 x 0.9 x 0.5 #A5774E with a chrome espresso machine box 0.5 x 0.4 x 0.35 #E2E9EE (metalness 0.3), a glow(#E7706F, 0.4) power light, and a steam pair (two spheres r 0.05 #F2F2F2 opacity 0.5) rising 0.4 and fading every 3 s.
8. Planters along the south edge at z by + 12.4, x bx + 9.5, 11, 12.5: boxes 0.6 x 0.35 x 0.3 #6B4A2B with hedge RoundedBoxes 0.55 x 0.3 x 0.25 #6FA860 and 3 flower dots each.
9. Hand props (attachProp, parented to handle.parts.handR, scale 1.2): ice cream = cone r 0.1 h 0.26 #E8C07A with two scoops sphere r 0.11 at y 0.26 and 0.42 from ['#F8D9E0', '#8FD6C8', '#F6E6B4', '#E7706F'] seeded by handle.seed, a drip sphere r 0.03 on the lip; coffee = cup cyl r 0.09 h 0.16 white with a navy band decal 0.03 tall, handle torus r 0.05 tube 0.015, coffee disc r 0.08 #4A3222 at the rim, two steam spheres r 0.035 and 0.028 #F2F2F2 opacity 0.5 that rise 0.3 over 1.4 s and fade. Every 2.5 s the arm lifts for 0.6 s (handle.sipPhase 0 to 1 to 0, ease in-out); each lick shrinks the top scoop 4 percent (minimum 60 percent, reset on detach); each sip tilts the cup rx -0.4 and pauses the steam. Seated aliens blink and look around normally.

## Pond and park

Block [3, 1]: pond ellipse center (bx + 7, by + 7.5), radii 4.8 by 3.6 tiles. Water per ART_DIRECTION (#6CC3CB, opacity 0.82 breathing, emissive #0E4F58 at 0.12, ripple layer). Depth cue: a darker inner ellipse plane #58A3A8 opacity 0.35 at y 0.045 over the swimSpots region so the deep middle reads.

1. Floating rings: torus r 0.35 tube 0.11 salmon at (bx + 4.6, 0.08, by + 6.4) and torus r 0.35 tube 0.11 aqua with four white quadrant decal stripes at (bx + 9.6, 0.08, by + 8.6), lying flat; each bobs y 0.06 sin(2 pi 0.35 t + phase), rocks rx and rz 0.05, drifts on a 0.4 radius circle over 40 s and yaws 0.1 rad per s; each spawns a faint ripple (opacity 0.3) every 3 s so the pond is never static.
2. Ripple pool: 12 flat toruses r 0.3 tube 0.02 rx pi/2, MeshBasicMaterial white transparent additive depthWrite false, at y 0.06. animateLeisure assigns two per swimmer, alternating every 0.7 s, each expanding 0.3 to 1.1 units over 1.4 s while opacity goes 0.6 to 0, positioned at the swimmer's rendered position on spawn. A third ring stretched scale x 1.6 trails 0.3 behind the feet every 0.9 s at half opacity (kick wake).
3. Splash pool: 24 white spheres r 0.04 (MeshBasicMaterial #FFFFFF opacity 0.9). A burst launches 8 to 10 specks from the alien's position with velocity up 1.2 to 2.0 and radial 0.6 to 1.2 units per s, gravity 4, life 0.6 s, fading over the last 0.3 s, plus two ripple rings forced from scale 0.2 to 1.6 units over 0.8 s. A burst plays whenever time - agent.splash is between 0 and 0.9 (board landings, wading entries and ladder exits all set agent.splash).
4. Swim visuals: body pitched 1.2 rad by the swim pose, group center y -0.12 + 0.04 sin(2 pi 1.0 t), rotation.y = atan2(moveDir.x, moveDir.y), legs kicking 3 Hz, arms paddling; swimmers glide at 0.8 tiles per s per the sim. A swimmer paused by hover keeps the swim pose and stops gliding; its ripples keep fading.
5. Lily pads: 5 flat cyl r 0.2 h 0.02 #5B8E45 near the north shore with 2 flower spheres r 0.06 #F8D9E0. Reeds: 3 clusters of 5 cyl r 0.02 h 0.6 to 0.9 #5B8E45 with brown tip spheres r 0.04 #6B4A2B at the north-west, north-east and east shore tiles. Duck: body sphere r 0.12 #F8F6F0, head sphere r 0.07, beak cone r 0.03 #F6D463, drifting a slow figure eight at 0.3 units per s and leaving a ripple every 1.2 s.
6. Shore: three park benches per the contract facing the pond center, each with a bench seat; two lamps per ART_DIRECTION; a lifeguard stand at the east shore (bx + 12.3, 0, by + 8.0): chair box 0.6 x 0.5 x 0.6 #F8F6F0 on four legs h 1.4 #A5774E, a salmon umbrella cone r 0.6 h 0.3, a life ring torus r 0.25 tube 0.07 salmon with white quadrants hung on its side.

### Diving board

Follows state.pier from CONTRACT_V2: pierTile is the shore tile directly south of the pond center column (bx + 7), base = (bx + 7.5, pierTile.y + 0.5), boardStart = (bx + 7.5, pierTile.y - 1.5), boardEnd = (bx + 7.5, pierTile.y - 3.1), landing = (bx + 7.5, pierTile.y - 5.0), ladder = (bx + 8.5, pierTile.y - 0.5), height = 0.5. With this pond that is pierTile.y = by + 12, so the deck runs from z by + 12.5 north to by + 10.5 and the board tip is at by + 8.9; all numbers below are written in pier terms so the module reads them from state.pier.

1. Pier deck: 10 planks box 1.2 x 0.06 x 0.18 #A5774E laid along z with 0.02 gaps from base to boardStart (2.0 long), top surface at y pier.height (0.5), centered x bx + 7.5. Six posts cyl r 0.08 h 0.6 #5E4538 at x bx + 6.9 and bx + 8.1, z base, base - 1.0 and boardStart, running y 0 to 0.6 so the caps stand 0.1 above the deck. A mooring post cyl r 0.1 h 0.7 at the north-east deck corner with a rope torus r 0.12 tube 0.03 #A5774E. Deck dressing: a folded towel box 0.3 x 0.06 x 0.4 salmon and two flip-flops box 0.1 x 0.02 x 0.22 aqua.
2. Springboard: a stand box 0.5 x 0.3 x 0.4 #2E3E50 at boardStart with its top at y 0.5; the board box 0.5 x 0.06 x 1.6 #75CCD0 from boardStart to boardEnd at y 0.5 with a white tip box 0.5 x 0.07 x 0.2 #F8F6F0 at the north end, pivoted about x at the stand. The whole pier is 1.2 wide, the board 0.5 wide, as the contract states.
3. Ladder at pier.ladder (the deck's east edge, 0.5 south of boardStart): two rails cyl r 0.025 h 1.0 #E2E9EE metalness 0.2 at x bx + 8.35 and bx + 8.65 running y -0.3 to 0.7 with hooks curling over the deck edge, four rungs box 0.3 x 0.03 x 0.03 at y -0.2, 0.05, 0.3, 0.55.
4. Boarding: while agent.onBoard the renderer lifts the alien by pier.height; the sim glides it from base to boardEnd at 1.1 tiles per s in the walk pose. While the alien is over the board (z north of boardStart) the board tip flexes down 0.12 (pivot angle 0.075 rad, eased 0.2 s). During the 0.6 s bouncing phase the tip dips 0.12 twice and the alien bobs 0.08 in the stand pose.
5. Jump arc: the sim interpolates position linearly from boardEnd to landing over 1.1 s with agent.jumpT 0 to 1; animateLeisure adds pier.height + 1.4 sin(pi jumpT) of height, the dive pose pitches the body 0 to 1.5 rad with arms overhead and antennae swept back. The arc peaks 1.9 above the water about 0.95 north of the board tip.
6. Splash burst: on landing the sim sets agent.splash = time; for 0.9 s the splash pool plays at the alien's position (item 3 above) and the alien dips 0.25 below its swim depth for the first 0.3 s, easing back. The board tip springs up 0.06 and settles over 0.5 s.
7. Climbing out: in the leaving phase the swimmer glides to pier.ladder at 1.0 tiles per s; the climbing phase lasts 0.8 s with the climb pose (arms alternating 2 Hz), position easing from the ladder to pier.base while animateLeisure lifts the group from water level (-0.12) to pier.height with ease-out; the splash pool plays a half burst (4 specks, one ring) at the ladder foot; the alien then stands on pierTile dripping (3 drip spheres r 0.02 falling 0.4 over 1.5 s) before walking off. Waders use a random shore tile instead and splash on entry and exit.

## Plaza

Block [2, 1]: 14 by 14 paved, 3 by 3 fountain basin at bx + 6..8, by + 6..8, fountain deco at (bx + 7.5, by + 7.5).

1. Fountain for the 3 by 3 basin: outer cyl r 1.45 h 0.35 (32 seg) #B9C4CC with a lip torus r 1.45 tube 0.05 at y 0.35; water disc r 1.3 at y 0.30 in the water material at opacity 0.85; center column cyl r 0.18 h 0.9 #B9C4CC; upper bowl cyl r 0.55 h 0.1 at y 0.95 with a water disc r 0.5 at y 1.02; finial: a Thread T (box 0.35 x 0.08 x 0.08 on a post cyl r 0.03 h 0.5) in navy with an aqua sphere r 0.06 on top at y 1.7; jets: 8 spheres r 0.05 #DFF6F7 opacity 0.85 on 1.1 s parabolas from the bowl rim (r 0.5, y 1.05) up 0.7 and out to r 1.2 at y 0.3, phase i / 8; two additive ripple rings RingGeometry(0.30, 0.36, 48) scaling 1 to 2.8 and fading 0.4 to 0 over 1.6 s offset 0.8 s; mist: 6 white spheres r 0.08 opacity 0.15 drifting above the bowl. One PointLight #DFF6F7 intensity 4 x ramp distance 4 at the bowl at night (budget note in Principles 7).
2. Benches at (bx + 3.5, by + 4.5), (bx + 10.5, by + 4.5), (bx + 3.5, by + 9.5), (bx + 10.5, by + 9.5) facing the fountain, ART_DIRECTION geometry, each registering a bench seat. Lamps at the corners (bx + 1.5 or bx + 12.5, by + 1.5 or by + 12.5) with real PointLights (4 of the 13).
3. Paving upgrade in the ground canvas: a 2 unit wide aqua ring at radius 4 around the fountain at alpha 0.35 with a 0.12 white inner ring, and four radial threads 0.4 wide in aqua at alpha 0.25 from the ring to the plaza's mid-edges, so the plaza reads as the hub of the thread motif from the air.
4. Planters: cyl r 0.5 h 0.5 #CFC6B6 at (bx + 3.0, by + 2.0), (bx + 12.0, by + 2.0), (bx + 3.0, by + 13.0), (bx + 12.0, by + 13.0), each with a RoundedBox shrub 0.8 x 0.5 x 0.8 #6FA860 and 6 flower dots.
5. Welcome board at the south edge (bx + 7.5, 0, by + 13.6): two posts cyl r 0.06 h 2.2 #2E3E50, board plane 2.4 x 1.2 at y 1.6 facing +z, canvasTex navy with 'Thread Town' in Kanit 600 white, an aqua underline and 'Where our agents work' in Inter; emissive 0.3 at night.
6. Flag circle at the north edge: three flagpoles cyl r 0.03 h 3.0 #F8F6F0 at (bx + 7.5, by + 1.2), (bx + 6.3, by + 1.6), (bx + 8.7, by + 1.6) with flags plane 0.6 x 0.4 in navy, aqua, salmon rippling (rotation z 0.06 sin at 2 Hz plus scale x 0.95 to 1.0, per-flag phase).
7. Kiosk at (bx + 12.0, 0, by + 11.5): hexagonal newsstand cyl r 0.7 h 1.9 seg 6 #F8F6F0 with a cone roof r 0.85 h 0.5 salmon, a canvasTex poster band and a glow(#FFE2A0) interior at night. Food cart at (bx + 11.5, 0, by + 3.5): box 1.0 x 0.9 x 0.6 white, two wheels torus r 0.18 tube 0.05 #2E3E50, striped awning plane 1.2 x 0.6 salmon and white, 'Ice cream' decal (set dressing, no sim change).
8. Street clock at (bx + 2.0, 0, by + 12.0): post cyl r 0.08 h 2.6 #2E3E50 with a double-faced clock cyl r 0.35 h 0.12 white at y 2.6 and navy hands on wall-clock time. Hopscotch decal 0.8 x 2.4 in white chalk near (bx + 3, by + 11).
9. Pigeons: 5 spheres r 0.07 #B9C4CC with head r 0.04 and #F6D463 beak cones pecking near the benches (y bob 0.03 at 2 Hz, hop 0.1 every 1 to 3 s); they scatter (fly up 1.5 and 2 units outward over 1 s) when an alien walks within 0.8 and return after 6 s.
10. Town-wide touches (renderer): hover ring aqua #75CCD0, selected ring #9FE2E5 pulsing 1.2 Hz; clicking an alien or building eases the camera to it (focusOn) and the Reset view pill returns to the fit; Follow keeps the camera on an agent through commute, work, cafe visit and swim; 6 crosswalk decals (white 0.3 bars) at the four central intersections; 8 fire hydrants (cyl r 0.08 h 0.45 salmon, white cap) at seeded corners.

## exec: Executive

Town hall. Footprint 12 by 7, door at local x 6, station right (path west, workTile (1.5, 3.5)). Silhouette: the widest building, a low saucer dome on a colonnaded drum behind a six-column portico, with a clock on the drum. Top 7.1.

### Building

1. Plinth box 12.0 x 0.14 x 7.0 at (6, 0, 3.5) #CFC6B6.
2. Steps: three boxes 6.0, 5.4, 4.8 wide x 0.14 x 0.5 at z 7.35, 7.05, 6.75, y 0, 0.14, 0.28, #CFC6B6 (south edge at z 7.6, the margin limit).
3. Main hall box 11.4 x 3.2 x 6.4 radius 0.06 at (6, 0.14, 3.5) dept.wall #F3EFE6.
4. Portico: six columns (column helper) r 0.16 h 3.2 at x 3.0, 4.2, 5.4, 6.6, 7.8, 9.0, z 6.75, y 0.42 #F8F6F0; slab box 7.2 x 0.3 x 1.2 at (6, 3.6, 6.5) #F8F6F0; pediment gableRoof 7.2 wide, 1.2 deep, h 0.9 at (6, 3.9, 6.5) #F8F6F0 with a navy tympanum decal 2.0 x 0.6 (Thread T) at (6, 4.25, 7.11).
5. Cornice box 12.0 x 0.2 x 7.0 at (6, 3.34, 3.5) #F8F6F0.
6. Drum cyl r 2.6 h 1.0 at (6, 3.54, 3.2) dept.wall with 8 small columns r 0.08 h 1.0 on radius 2.5 #F8F6F0.
7. Dome r 2.6 scaled y 0.75 at (6, 4.54, 3.2) dept.accent #002D4F (top 6.49); lantern cyl r 0.4 h 0.5 #F8F6F0 at y 6.45 with a glow(#FFE2A0) core; finial sphere r 0.12 #F6D463 at y 7.0 (top 7.1).
8. Clock: cyl r 0.7 h 0.08 rx pi/2 on the drum's south face at (6, 4.3, 5.9), canvasTex 256 px white face, navy ticks and numerals, navy hour hand and aqua minute hand on wall-clock time (repaint once per minute).
9. Flagpole cyl r 0.03 h 2.2 at (10.8, 3.34, 0.8) #F8F6F0 with a flag plane 0.7 x 0.45 aqua that ripples (rotation z 0.05 sin at 2 Hz plus scale x 0.95 to 1.0); top 5.54.
10. Windows, one glass(): south face windowRow 2 x (0.6 x 0.9) at y 0.9 and 2 x (0.6 x 0.6) at y 2.3 on each flank (x0 0.9 and 10.0, spacing 1.1); north face 8 per row; east and west 5 per row at z 0.9..5.5; sills #F8F6F0.
11. Door: double 1.6 x 2.0 x 0.08 at (6, 0.42, 6.72) navy with a #0E2238 split line, #F6D463 handles and a #F8F6F0 frame 1.8 x 2.15. Two post lamps cyl r 0.04 h 1.4 #2E3E50 at (2.4, 0.42, 7.0) and (9.6, 0.42, 7.0) with #FFF1C9 bulbs r 0.09 (emissive #FFE2A0).
12. Two stone urns cyl r 0.28 h 0.5 #CFC6B6 at (1.2, 0.14, 6.6) and (10.8, 0.14, 6.6) with topiary spheres r 0.3 #6FA860.
Extras: #F6D463 brass finial (shared), #6FA860 topiary (shared); no department-specific extras.

### Activity

podium. Props: 1) Dais box 3.2 x 0.3 x 2.4 at (1.7, 0, 2.5) #CFC6B6 (x 0.1..3.3, z 1.3..3.7). 2) Podium box 0.8 x 1.0 x 0.5 at (1.5, 0.3, 3.2) navy with a slanted top box 0.9 x 0.06 x 0.6 rx -0.3 at y 1.3 and a white T decal 0.4 x 0.4 on the front (toward the camera). 3) Microphone cyl r 0.02 h 0.45 #2E3E50 at (1.5, 1.3, 3.15) tilted rx -0.35 toward the alien, head sphere r 0.07 #0E1B2E at y 1.72, LED sphere r 0.03 glow(#75CCD0). 4) Banner: poles cyl r 0.04 h 2.4 #2E3E50 at (0.3, 0.3, 0.8) and (2.9, 0.3, 0.8), plane 2.6 x 1.1 at (1.6, 2.0, 0.8) facing +z, canvasTex navy with an aqua stripe and 'Thread Town' in Kanit white. 5) Speakers box 0.4 x 0.65 x 0.35 #2E3E50 at (0.3, 0.3, 3.4) and (2.9, 0.3, 3.4) with a glow(#75CCD0, 0.3) disc r 0.12 each. 6) Confetti pool: 48 planes 0.09 x 0.13 MeshBasicMaterial DoubleSide in aqua, salmon, #F6D463, white, hidden when idle. 7) Applause sparkles: 10 glow(#FFFFFF) spheres r 0.05 on a ring r 1.6 around (1.6, 0.5, 2.5), opacity 0 when idle.
Anchor local (1.5, 0.3, 2.6) on the dais behind the podium. Yaw 0 (faces the camera over the podium top). Pose point. Enter walk.
Per frame while working: mic LED pulses 0.4 to 1.0 at 1 Hz; speaker discs scale 1.0 to 1.18 at 2 Hz; the point pose's extended arm swaps sides every burst (handle.pointSide = +1 or -1).
Per work burst: launch all 48 confetti from the banner top (y 2.5, x 0.3..2.9) with velocity up 1.2 and lateral plus or minus 0.6, gravity 2.0, spin 4 rad per s, life 2.2 s fading over the last 0.5 s (about 1.5 units of vertical travel); the 10 sparkles flash to opacity 0.9 and decay over 0.8 s while scaling 1 to 1.6.
Idle: confetti hidden, LED 0.1, sparkles 0, discs at scale 1.0.

### Night

Dome lantern glow 0 to 1.4 x ramp; clock face emissive 0.8 so it reads across town; the two post lamps carry the building's two PointLights #FFC97A intensity 6 x ramp distance 5; banner emissive 0.3; windows via the glass material; flag keeps rippling.

## embedded: Embedded Banking

Connector hub. Footprint 10 by 6, door at local x 5, station right (path west, workTile (1.5, 3.5)). Silhouette: two glass-fronted wings joined by three aqua thread arches over a glass atrium, with a dish on the east roof. Top 6.2.

### Building

1. Plinth box 10.0 x 0.14 x 6.0 at (5, 0, 3) #CFC6B6 with an aqua ground stripe plane 0.4 x 6.0 at y 0.15 running north to south under the atrium to the door (the thread continues as a decal onto the stub).
2. Wings: box 3.6 x 4.6 x 5.4 radius 0.08 at (1.9, 0.14, 3.0) and (8.1, 0.14, 3.0) dept.wall #EDE7D8; each wears a glass() curtain plane 3.2 x 3.8 on its south face at z 5.73 (y 0.5..4.3) behind a #F8F6F0 mullion grid of thin boxes 0.08 (3 verticals, 3 horizontals).
3. Atrium box 2.6 x 4.4 x 5.4 at (5, 0.14, 3.0) built from the same glass material with #F8F6F0 frame posts 0.08 at its four vertical edges and a #F8F6F0 floor band 2.6 x 0.12 x 5.4 at y 2.1; atrium roof box 2.6 x 0.2 x 5.4 at y 4.54 #F8F6F0.
4. Three thread arches: torus r 1.5 tube 0.09 standing in the xz plane (ry pi/2 about their own axis so the ring spans x), centers at (5, 4.6, 1.3), (5, 4.6, 3.0), (5, 4.6, 4.7) in aqua, salmon, aqua; the lower halves hide inside the atrium roof; arch tops at 6.1.
5. Pulse beads: one glow(#FFFFFF, 1.0) sphere r 0.12 per arch travelling angle 0 to pi over 1.8 s, staggered 0.6 s, west wing to east and back on the next pass.
6. Wing roofs: flat parapet boxes 3.8 x 0.25 x 5.6 at y 4.74 aqua (top 4.99).
7. Dish on the east wing: post cyl r 0.08 h 0.9 #2E3E50 at (8.4, 4.99, 2.0); dome r 0.75 scaled y 0.35 #F8F6F0 at y 5.9 tilted rx -0.9 with a glow(#75CCD0) feed sphere r 0.07 at the focus; yaws plus or minus 0.4 at 0.1 Hz (top 6.2).
8. Lettering plane 3.0 x 0.5 'Embedded' canvasTex navy on white at (1.9, 5.0, 5.6) facing +z; port emblem decal 1.2 x 1.2 (white circle, two aqua plugs joining) on the atrium front at (5, 3.2, 5.72).
9. Windows, one glass(): the curtains and atrium plus windowRow 3 x (0.7 x 0.9) per story at y 0.8 and 2.6 on each wing's north face and 2 per story on the outer flanks.
10. Door: glass double 1.6 x 2.0 at (5, 0.14, 5.72) with an aqua frame 1.8 x 2.15 x 0.08 and an aqua canopy plane 2.2 x 0.9 at y 2.3 projecting 0.6 south.
Extras: #DCE9F5 pale blue floor mat (station). Salmon arch and cables are brand.

### Activity

switchboard, screen based. Props: 1) Console box 2.6 x 0.75 x 0.7 at (1.5, 0, 3.0) navy; a port field slab 2.6 x 0.05 x 0.5 hinged at the console's back edge (z 3.3) and tilted rx -0.45 so it rises from y 0.75 to 1.0, carrying 12 glow(#75CCD0, 0.3) port discs r 0.07 in 2 rows of 6 at pitch 0.38; the face toward the alien uses glow() at 0.7 with a canvasTex map of 8 partner nodes (silver circles r 0.08 joined by faint lines); the console front toward the camera carries a 2.4 x 0.3 silver-on-navy partner names strip and a small white T. 2) Six cables: TubeGeometry r 0.035, 24 segments, CatmullRom through port (x_i, 1.0, 3.2), a side point (x_i < 1.5 ? -0.1 : 3.1, 1.7, 1.9) and a totem top, so they arc beside the alien, never over its head; materials alternate glow(#75CCD0, 0.4) and glow(#E7706F, 0.4), lengths about 3.4. 3) Partner totems: posts cyl r 0.08 h 1.6 #2E3E50 at (0.4, 0, 0.6), (1.5, 0, 0.3), (2.6, 0, 0.6) with a lamp box 0.3 x 0.3 x 0.3 glow(#75CCD0, 0.2) at y 1.6 and a canvasTex partner tile 0.5 x 0.35 white on the south face at y 1.1 (two cables per totem; total 1.9 tall). 4) Six pulse beads glow(#FFFFFF, 1.0) spheres r 0.08, one per cable (curve.getPointAt). 5) Status tower cyl r 0.1 h 1.3 #2E3E50 at (3.6, 0, 3.2) with three stacked rings torus r 0.12 tube 0.03 aqua, white, salmon. 6) Floor mat plane 2.8 x 1.4 #DCE9F5 at (1.5, 0.01, 2.4).
Anchor local (1.5, 0, 2.45); console at z 3.0 (anchor.z + 0.55), port field top 1.0 so the face shows over it. Yaw 0. Pose type. Enter walk.
Per frame while working: each bead runs its cable port to totem in 1.1 s, staggered 0.18 s, scaling 1 to 1.5 at the end; the destination totem lamp flashes to 1.0 and decays over 0.6 s (light visibly races 3.4 units); status rings chase at 3 Hz; the port field screen breathes 0.7 to 0.9.
Per work burst: one cable replugs: its port end eases to another free port over 0.5 s (update the curve points in place, rebuild its one 24-segment tube once), the old port dims to 0.3 and the new one flashes 1.0; a white spark sphere r 0.12 at the new port scales to 0 in 0.3 s.
Idle: beads parked at the ports, ports 0.25, totem lamps 0.2, rings 0.1, cables sway 0.04 at 0.5 Hz by rotating their group (no rebuild).

### Night

Arches get emissive aqua 0.9 x ramp (glow clones, 0 by day) so a neon thread crosses the roofline; beads 1.0 to 2.0; dish feed 1.5 and blinks 0.5 Hz; curtains and atrium lit via the glass material; one PointLight #75CCD0 intensity 4 x ramp distance 4 at (5, 3.0, 3.0) inside the atrium.

## compliance: Compliance

Courthouse. Footprint 10 by 6, door at local x 5, station left (path east, workTile (2.5, 3.5)). Silhouette: a six-column temple on a tall stylobate with a pediment, a blue flat roof and a brass scales emblem. Top 5.8.

### Building

1. Plinth box 10.0 x 0.14 x 6.0 at (5, 0, 3) #CFC6B6; three steps 5.0 x 0.14 x 0.45 at z 6.3, 6.1, 5.9 (y 0, 0.14, 0.28) #CFC6B6 (south edge 6.525).
2. Stylobate box 9.6 x 0.5 x 5.6 at (5, 0.14, 3.0) #CFC6B6.
3. Cella box 8.4 x 3.4 x 4.6 radius 0.05 at (5, 0.64, 2.6) dept.wall #E8E2D5 (front face z 4.9).
4. Six columns (column helper) r 0.2 h 3.4 at x 1.3, 2.8, 4.3, 5.7, 7.2, 8.7, z 5.3, y 0.64 #F8F6F0.
5. Entablature box 9.6 x 0.45 x 5.8 at (5, 4.04, 3.0) #F8F6F0 with a frieze band box 9.62 x 0.14 x 5.82 at y 4.2 dept.accent #004B91.
6. Pediment gableRoof 9.6 wide, 0.8 deep, h 1.3 at (5, 4.49, 5.6) #F8F6F0 (ridge along x, a triangle to the camera); tympanum decal 2.4 x 0.9 at (5, 4.95, 6.01) with a blue scales of justice canvasTex.
7. Flat roof box 9.0 x 0.3 x 5.0 at (5, 4.49, 2.6) dept.accent (top 4.79), with a #F8F6F0 parapet lip 0.1.
8. Scales emblem on the roof: post cyl r 0.05 h 1.0 at (5, 4.79, 2.5) #F6D463, beam box 1.2 x 0.05 x 0.05 at y 5.75, two pans cyl r 0.2 h 0.03 hung on 0.3 cables, rocking rz plus or minus 0.08 at 0.25 Hz (top 5.8).
9. Checklist plaque box 1.2 x 1.6 x 0.08 #F8F6F0 at (1.6, 1.0, 4.95) facing +z with a canvasTex of four navy check boxes and #1F8A5B ticks.
10. Two stone lions: sphere r 0.22 on box 0.4 x 0.3 x 0.5 #CFC6B6 at (1.6, 0.64, 5.7) and (8.4, 0.64, 5.7).
11. Door: bronze double 1.6 x 2.2 x 0.08 at (5, 0.64, 4.92) dept.accent with #F6D463 handles and a #F8F6F0 frame, recessed 1.1 behind the column line (// CONTRACT: door x and doorPos unchanged); plaque decal 0.8 x 0.3 'Compliance' above the door at y 3.1. Windows, one glass(): 0.7 x 1.6 at x 2.1 and 7.9, y 1.0 on the cella south face, 3 per side face at y 1.0.
Extras: #1F8A5B green (OK lamp, ticks). Paper #E8E2D5 is shared.

### Activity

stamp. The alien faces the camera; the press stands between them with its handle toward the alien, and papers flow from the inbox at the path side (east) to the outbox (west). Props: 1) Press bench box 2.8 x 0.75 x 0.9 at (2.0, 0, 3.3) #A5774E with #2E3E50 legs 0.1 x 0.75 x 0.1 at the corners. 2) Frame: pillars box 0.12 x 1.4 x 0.12 #2E3E50 at (1.3, 0.75, 3.3) and (2.7, 0.75, 3.3), crossbar 1.6 x 0.12 x 0.12 at y 2.05 (top 2.17). 3) Stamp head box 0.7 x 0.35 x 0.6 dept.accent at (2.0, 1.4, 3.3) with a shaft cyl r 0.06 h 0.3 to the crossbar and an APPROVED decal 0.6 x 0.5 mirrored white on its bottom face. 4) Handle: lever cyl r 0.04 h 0.9 #2E3E50 hinged on a bracket at (1.3, 1.3, 3.3), pointing toward the alien and down, angle 0.3 rad (up, tip at y 1.03, z 2.44) to 1.0 rad (down, tip y 0.54, z 2.81), knob sphere r 0.1 salmon. 5) Belt plane 2.8 x 0.5 at (2.0, 0.76, 3.3) #2E3E50 with a canvasTex of 7 white roller strips scrolling UV 0.6 per s while working; inbox tray box 0.6 x 0.12 x 0.55 #2E3E50 at (3.5, 0.75, 3.3) holding a stack of 5 paper planes 0.45 x 0.35 #E8E2D5; outbox tray box 0.6 x 0.12 x 0.55 dept.accent at (0.5, 0.75, 3.3) tilted rz 0.15 with a glow(#1F8A5B, 0.3) OK lamp cyl r 0.1 h 0.15 at its corner. 6) Six cycling papers 0.45 x 0.35 #E8E2D5, each with a hidden salmon APPROVED decal 0.3 x 0.14; six ink specks spheres r 0.03 salmon. 7) Counter sign box 0.9 x 0.5 x 0.05 on cyl r 0.03 h 1.2 at (3.6, 0, 0.8), canvasTex 'Approved today: N' navy on white.
Anchor local (1.7, 0, 2.5), hands at the lever tip. Yaw 0. Pose lever. Enter walk.
Per frame while working: belt scrolls; a 3.2 s paper cycle synced to the burst: a paper slides from the inbox (x 3.2) to under the head (x 2.0) over 0.8 s, waits for the slam, slides to the outbox (x 0.8) over 0.7 s, hops 0.25 and drops into the tray (stack grows to 6 then recycles).
Per work burst: the head slams 0.6 (y 1.4 to 0.8) in 0.12 s ease-in, holds 0.15 s while the frame bounces 0.03, rises over 0.4 s ease-out; the lever swings 0.3 to 1.0 rad with it, matching the lever pose rock; the APPROVED mark appears; 6 ink specks puff out 0.3 and fade over 0.4 s; the OK lamp flashes 1.0 for 0.5 s; the counter repaints once.
Idle: head up, lever up, belt still, papers parked in the inbox, lamp 0.2, counter frozen.

### Night

Two uplights, the building's two PointLights #FFE2A0 intensity 5 x ramp distance 4 at (2.0, 0.7, 5.5) and (8.0, 0.7, 5.5), so columns and pediment glow; scales emblem emissive 0.5 x ramp; checklist plaque emissive 0.3; windows via glass; a glow(#FFE2A0) work lamp sphere r 0.08 on the station crossbar at 0.6 x ramp so the press reads after dark.

## fcc: Financial Crimes

Detective agency with watchtower. Footprint 9 by 6, door at local x 4, station right (path west, workTile (1.5, 3.5)). Silhouette: a dark flat-roofed block wrapped in a salmon stripe with an off-center square watchtower, pyramid cabin roof, searchlight and radar. Top 8.9.

### Building

1. Plinth box 9.0 x 0.14 x 6.0 at (4.5, 0, 3) #CFC6B6.
2. Main block box 8.4 x 3.0 x 5.4 radius 0.06 at (4.5, 0.14, 3.0) dept.wall #EFE8DA; flat roof with parapet box 8.8 x 0.3 x 5.8 at y 3.14 #2E3E50 (dark so the stripe pops); #F8F6F0 parapet lip boxes 0.15 x 0.2 on the four edges at y 3.44.
3. Red stripe box 9.02 x 0.5 x 6.02 at y 2.3 dept.accent #E7706F wrapping every face (the signature band).
4. Watchtower: square shaft box 2.2 x 5.6 x 2.2 at (7.2, 0.14, 1.4) dept.wall with a salmon corner post box 0.15 x 5.6 x 0.15 on each vertical edge; lookout cabin box 2.8 x 1.4 x 2.8 at y 5.74 #2E3E50 overhanging 0.3, with glass() bands box 2.4 x 0.8 x 0.05 on each face at y 6.1 and #F8F6F0 corner posts 0.12; cabin roof cone r 2.0 h 0.9 seg 4 ry pi/4 at y 7.14 salmon (tip 8.04); antenna cyl r 0.02 h 0.86 to 8.9 with a glow(#E7706F) tip sphere r 0.07 blinking 1 Hz.
5. Searchlight on the cabin roof edge: yoke box 0.3 x 0.3 x 0.3 #2E3E50 at (7.2, 7.4, 2.6), lamp cyl r 0.25 h 0.4 #2E3E50 with a glow(#FFF1C9) lens, pivot ry; beam cone r 0.9 h 6.0 opening downward, MeshBasicMaterial #FFF1C9 opacity 0.18 additive depthWrite false renderOrder 5, visible at night or while active, sweeping yaw 1.1 sin(2 pi 0.12 t) with pitch -0.5.
6. Radar dish: post r 0.06 h 0.8 #2E3E50 at (1.4, 3.44, 1.0); dome r 0.6 scaled y 0.3 rx -1.1 silver #E2E9EE spinning ry 1.2 rad per s.
7. Magnifying glass sign over the door at (4.5, 3.6, 5.85): torus r 0.45 tube 0.06 #2E3E50 with a glass() disc and a handle cyl r 0.05 h 0.6 rz 0.8.
8. Door 1.6 x 2.0 x 0.08 at (4, 0.14, 5.72) salmon with a small barred window, #F8F6F0 frame and #F6D463 knob; an 'FCC' shield decal 0.9 x 0.5 white on salmon above at y 2.6 (the stripe passes behind it).
9. Windows, one glass(): three 0.6 x 0.8 at y 1.2 on the south face (x 1.2, 2.4, 6.0) with venetian-blind canvasTex decals; a case-board window 1.2 x 1.0 at (7.0, 1.3) showing pinned photos and red string; three per side face; rooftop vent cyl r 0.2 h 0.4 #2E3E50 at (3.0, 3.44, 1.5).
Extras: #D8B98A cork (evidence board), #1F8A5B green (locker glow).

### Activity

watchtower. A field tower in the station, a short twin of the building tower, so the detective is visible instead of hidden inside the building. Props: 1) Tower: four legs cyl r 0.08 h 2.4 #2E3E50 at (0.9, 0, 1.1), (2.3, 0, 1.1), (0.9, 0, 2.5), (2.3, 0, 2.5) with X braces box 0.06 x 2.0 x 0.06 rz plus or minus 0.6; platform box 2.0 x 0.15 x 2.0 at (1.6, 2.4, 1.8) #A5774E with a railing of 8 posts r 0.03 h 0.5 and a salmon top rail box 2.0 x 0.05 x 0.05; ladder on the south face at z 2.85 (two rails cyl r 0.03 h 2.4, 9 rungs box 0.5 x 0.04 x 0.04). 2) Searchlight on a yoke at the platform's north-west corner (0.8, 2.55, 1.0): lamp cyl r 0.2 h 0.35 #2E3E50 with a glow(#FFF1C9, 0.4) lens, beam cone r 0.7 h 4.5 additive opacity 0.15 pitched down 0.9, pivot ry. 3) Radar dish on a post at (2.4, 2.55, 1.0): dome r 0.45 scaled y 0.3 silver spinning 1.5 rad per s. 4) Binoculars: two cyl r 0.05 h 0.18 #2E3E50 joined, parented to alien.parts.handR while an alien is present. 5) Suspect cube box 0.5 x 0.5 x 0.5 glow(#E7706F, 0.8) with a white '!' decal, hidden when idle. 6) Net: wireframe dome r 0.6 MeshBasicMaterial #E2E9EE wireframe opacity 0.8, hidden at y 3.0. 7) Spot pool: disc plane r 0.9 additive #FFF1C9 opacity 0 to 0.35 at y 0.02 placed where the beam meets the ground: (0.8 + 2.0 sin yaw, 0.02, 1.0 + 2.0 cos yaw). 8) Evidence lockers box 1.0 x 1.2 x 0.6 #2E3E50 at (0.6, 0, 3.4) with three salmon drawer fronts. 9) Evidence board box 1.4 x 1.0 x 0.06 on two posts at (1.6, 1.2, 0.4) facing +z, canvasTex cork #D8B98A with three white cards and red string, visible between the tower legs.
Anchor local (1.6, 2.55, 1.8) on the platform. Yaw 0.3 (toward the town and roughly the camera). Pose lookUp. Enter inside (the alien walks to the building door, fades, reappears on the platform).
Per frame while working: searchlight yaw = 1.2 sin(2 pi 0.15 t), so the beam foot swings about 4 units across the station floor and the spot pool slides with it (opacity 0.10 by day, 0.35 x ramp at night); the dish spins 1.5 rad per s; the alien's group yaw = 0.3 + 0.5 x beam yaw so the lookUp pose follows the beam.
Per work burst: on every second burst the suspect cube appears at (3.4, 0.25, 0.3) and sneaks south to (3.4, 0.25, 3.5) over 3 s with a 0.1 hop at 2 Hz; when the beam yaw comes within 0.25 rad of the cube's bearing from the lamp, the cube flashes white, the net drops from y 3.0 to 0 over 0.35 s ease-in onto it, the cube squashes to scale (1.3, 0.5, 1.3) and both fade over 0.6 s; the lockers' top drawer glows glow(#1F8A5B) for 1 s and one evidence card flips to a salmon check (repaint once).
Idle: beam off by day (opacity 0), cube and net hidden, dish slows to 0.3 rad per s, spot pool 0.

### Night

Both searchlights turn on: beam opacity 0.18 (building) and 0.15 (station) x ramp, lenses 1.5; cabin glass lit via the glass material; antenna tip blinks 1 Hz; one PointLight #FFF1C9 intensity 5 x ramp distance 5 inside the cabin at (7.2, 6.4, 1.4); the red stripe gets emissive 0.25 x ramp so the band stays readable.

## ops: Operations

Depot. Footprint 11 by 6, door at local x 5, station left (path east, workTile (2.5, 3.5)). Silhouette: a long low shed with a four-tooth sawtooth roof, three roll-up doors, a smokestack at the west end and a water tank at the east. Top 6.3.

### Building

1. Concrete apron box 11.0 x 0.14 x 6.0 at (5.5, 0, 3) #CFC6B6; loading dock slab box 6.0 x 0.5 x 0.5 at (4.0, 0, 6.25) #CFC6B6 (south edge 6.5) with a hazard-stripe canvasTex (8 stripes #F6D463 and #2E3E50) on its south face.
2. Shed box 10.4 x 2.8 x 5.4 radius 0.04 at (5.5, 0.14, 3.0) dept.wall #ECE5D4 with 6 #F8F6F0 pilaster boxes 0.12 x 2.8 x 0.08 along the south face at pitch 1.7.
3. Sawtooth roof: four wedge units from gableRoofGeometry 2.6 wide (x), 5.6 deep, h 1.1 at x centers 1.3, 3.9, 6.5, 9.1, y 2.94, dept.accent #1F8A5B, each with its north slope replaced by a glass() clerestory plane 2.6 x 1.15 tilted rx -1.2; ridge tops at 4.04.
4. Three roll-up doors on the south face: box 1.6 x 1.8 x 0.08 at x 2.4 and 7.6 #2E3E50 with 7 horizontal #F8F6F0 slat lines (canvasTex), and the real door 1.6 x 2.0 at (5, 0.14, 5.72) dept.accent with a 'Receiving' decal 1.0 x 0.3 above; the east one is open 1.0 (shortened box at y 1.14 up) showing an ink #0E1B2E interior plane with two crates.
5. Gear emblem: torus r 0.55 tube 0.14 with 8 tooth boxes 0.18 x 0.18 x 0.14 #1F8A5B at (9.2, 3.0, 5.75) upright, rotating 0.3 rad per s (1.0 while active).
6. Smokestack cyl r 0.35 h 3.0 #2E3E50 at (1.0, 3.3, 1.0) with a #F8F6F0 band (top 6.3); smoke only while active (3 spheres per ART_DIRECTION).
7. Water tank: cyl r 0.9 h 1.2 #A5774E on four legs box 0.08 x 1.0 x 0.08 #2E3E50 at (9.4, 4.4, 1.2), cone cap r 1.0 h 0.5 dept.accent (top 6.1), 'OPS' white decal on the drum.
8. Pallet stacks: crates box 0.8 x 0.8 x 0.8 #A5774E at (0.6, 0.14, 5.4) and (0.6, 0.94, 5.4); barrels cyl r 0.3 h 0.8 dept.accent at (10.4, 0.14, 5.4) and (10.4, 0.14, 4.7); three bollards cyl r 0.1 h 0.6 #F6D463 at z 6.4, x 7.2, 8.5, 9.8.
9. Windows, one glass(): the four clerestories plus 4 small 0.6 x 0.6 at y 1.9 on the south face between the doors; sign band plane 3.0 x 0.5 'Operations depot' canvasTex on white at (5.5, 4.1, 5.5).
Extras: #0E1B2E ink (interiors, belt).

### Activity

crane. Props: 1) Crane: base cyl r 0.45 h 0.4 #2E3E50 at (1.0, 0, 2.0); mast cyl r 0.15 h 2.6 dept.accent at y 0.4; boom box 2.8 x 0.16 x 0.16 dept.accent pivoting at (1.0, 3.0, 2.0), resting along +x and tilted down 0.2; hook cable cyl r 0.02 scaled in y to 0.4 to 1.8 #2E3E50 from the boom tip; hook box 0.2 x 0.25 x 0.1 #F6D463; a glow(#E7706F) warning sphere r 0.09 on the mast top blinking 1 Hz while working. 2) Lever stand box 0.5 x 0.8 x 0.4 #2E3E50 at (2.5, 0, 3.1); lever cyl r 0.04 h 0.6 #2E3E50 hinged at y 0.8 with a salmon knob r 0.09, swinging rz plus or minus 0.5. 3) Pallet box 1.2 x 0.15 x 1.0 #A5774E at (1.0, 0, 0.6) with 3 crates box 0.45 x 0.45 x 0.45 #A5774E with white T decals, stacked 2 plus 1. 4) Conveyor box 2.6 x 0.35 x 0.6 #2E3E50 at (2.3, 0, 0.3) running east along the north edge toward the path, belt plane 2.6 x 0.5 #0E1B2E with 6 white roller strips scrolling 0.8 per s; a portal frame at the east end (two posts box 0.15 x 1.6 x 0.15 at (3.6, 0, 0.0) and (3.6, 0, 0.6) with a top beam) carrying a glow(#1F8A5B, 0.3) lamp. 5) Barrel pair cyl r 0.25 h 0.7 dept.accent at (3.6, 0, 2.2) and (3.3, 0, 2.6).
Anchor local (3.1, 0, 3.1). Yaw -pi/2 (faces west toward the crane with the lever in front of its hands; the alien's side is to the camera and the crane is the hero). Pose lever. Enter walk.
Per frame while working: a 6.4 s cycle (two bursts). Beat A: the boom yaws -0.9 about y over 1.0 s to hang over the pallet, the cable extends to 1.8 (0.8 s), the hook grabs a crate (crate reparents to the hook), the cable shortens to 0.6 lifting the crate 1.2, the boom yaws back over the conveyor over 1.0 s (tip travel about 2.5 units). Beat B: the cable lowers 0.5, the crate drops onto the belt, rides 2.2 east over 1.6 s, the portal lamp flashes 1.0, the crate shrinks to 0 in 0.3 s and respawns on the pallet. The lever swings +0.5 on lift and -0.5 on lower, matching the lever pose rock at 0.8 Hz; the belt scrolls while a crate rides.
Per work burst: starts beat A on odd bursts and beat B on even bursts; the warning lamp blinks.
Idle: boom parked along +x, hook up, belt still, lamp 0.2, crates stacked on the pallet.

### Night

Clerestory glass lit via the glass material; one PointLight #FFC97A intensity 6 x ramp distance 5 over the dock at (4.0, 3.2, 5.9); the open roll-up interior plane glows #FFD88A 0.6 x ramp; gear emblem emissive 0.3; the station portal lamp holds 0.6 x ramp when idle; the smokestack band gets a glow(#E7706F) aviation light blinking 0.5 Hz.

## data: Data & Analytics

Observatory. Footprint 9 by 6, door at local x 4, station right (path west, workTile (1.5, 3.5)). Silhouette: an octagonal drum under a purple hemisphere that splits open, a tall antenna, and a five-bar chart sculpture on the plinth. Top 6.34.

### Building

1. Plinth box 9.0 x 0.14 x 6.0 at (4.5, 0, 3) #CFC6B6.
2. Octagonal base cyl r 3.2 h 2.6 seg 8 ry pi/8 at (4.5, 0.14, 2.8) dept.wall #E9E3D6 (a flat face south); cornice cyl r 3.4 h 0.2 seg 8 at y 2.74 #F8F6F0.
3. Dome drum cyl r 2.8 h 0.6 seg 24 at y 2.94 #F8F6F0.
4. Split dome: two half shells (SphereGeometry 32 x 16, phiLength pi each, thetaLength pi/2) r 2.8 at y 3.54 dept.accent #5D4E8E; the halves slide apart along x by 0 to 0.9 revealing a glass() interior disc and the house telescope cyl r 0.25 h 2.2 #2E3E50 tilted rx -0.9 pointing up and south (top 6.34).
5. Antenna mast cyl r 0.03 h 1.6 at (6.9, 2.94, 1.2) #F8F6F0 with 3 cross rods and a glow(#8E7BD0) tip r 0.06 (top 4.6).
6. Bar-chart sculpture on the plinth west of the door: five boxes 0.5 x 0.5 footprint at x 0.6, 1.2, 1.8, 2.4, 3.0, z 5.0, heights 1.4, 2.2, 1.8, 3.0, 2.6 in dept.accent, #8E7BD0, #75CCD0, dept.accent, #8E7BD0 on a rail box 3.0 x 0.08 x 0.6 #F8F6F0; the bars breathe scale y 0.9 to 1.1 at 0.2 Hz, staggered.
7. Entrance porch box 2.0 x 2.2 x 1.0 at (4.5, 0.14, 5.5) dept.wall with a flat slab roof box 2.4 x 0.15 x 1.2 dept.accent at y 2.34; door 1.6 x 1.9 x 0.08 at (4, 0.14, 6.0) dept.accent with a round porthole, #F8F6F0 frame and #F6D463 knob; a rising line chart decal 1.0 x 0.6 above at y 2.1; steps 2.2 x 0.14 x 0.5 at z 6.25 #CFC6B6.
8. Windows, one glass(): 6 round portholes cyl r 0.35 h 0.06 rx pi/2 at y 1.6 around the octagon (two per visible face) with #F8F6F0 rim toruses r 0.36 tube 0.04; the dome interior disc.
9. Star map decal plane 1.4 x 1.0 at (7.0, 1.3, 5.95) facing +z: navy canvasTex with white dots and a lilac curve.
Extras: #8E7BD0 lilac (second bar color, antenna tip), #0E1B2E ink (billboard, shared).

### Activity

telescope. An observation deck in the station so the astronomer is visible at eye level. Props: 1) Deck: platform box 2.6 x 1.6 x 2.4 at (2.0, 0, 2.0) dept.wall with a #F8F6F0 cornice box 2.8 x 0.12 x 2.6 at y 1.6, a porthole decal on its south face, six stair steps box 0.5 x 0.1 x 0.3 climbing its west face, and a railing of 10 posts r 0.03 h 0.5 with a dept.accent top rail; deck top y 1.72. 2) Telescope: yoke cyl r 0.12 h 0.6 #2E3E50 at (2.0, 1.72, 2.1); pivot group at y 2.32 with rx -0.55 and a panning ry; tube cyl r 0.18 h 1.8 #F8F6F0 with a dept.accent band and a glass() lens disc at the far end; star lamp glow(#F6D463) sphere r 0.1 on the tip. 3) Billboard behind the deck: posts cyl r 0.05 h 2.6 #2E3E50 at (0.6, 0, 0.3) and (3.4, 0, 0.3); board box 3.0 x 1.6 x 0.1 at (2.0, 1.1, 0.3) #0E1B2E facing +z with a white grid canvasTex and the title 'Signals scanned'; six bar boxes 0.32 wide x 0.2 deep glow(#75CCD0, 0.7) in front of it at x 0.9 to 3.1 pitch 0.44, base y 1.78 (above the deck top so the camera sees them), heights 0.1 to 0.85 scaled in y from the base; a white tick sphere r 0.06 per bar. 4) Star speckles: 24 glow(#FFFFFF) spheres r 0.03 on a hemisphere r 1.4 above the telescope that twinkle opacity 0.2 to 0.9 while working. 5) Star trail sprite: plane 0.6 x 0.04 #F6D463 additive.
Anchor local (2.0, 1.72, 2.65) on the deck behind the eyepiece. Yaw 0 (faces the camera, looking up along the tube). Pose lookUp. Enter inside (the alien enters the building door, fades, reappears on the deck).
Per frame while working: the telescope pans ry -0.6 to +0.6 over 8 s (sine) and nods rx plus or minus 0.1 (tip travel about 1.6 units); the alien's group yaw = 0.7 x pan so it turns with the tube; the lens glow breathes 0.4 to 0.8; speckles twinkle; the building's dome halves slide open 0.9 over 1.5 s.
Per work burst: a capture: the lens flashes glow 1.2 for 0.3 s; the next billboard bar (left to right) grows 0.25 with ease-out over 0.5 s and its tick sphere pops at the top; when all six exceed 0.85 they drop to 0.1 and start over; the star trail streaks 2.0 across the board top in 0.5 s; the plinth sculpture bars pulse scale y 1.1 for 0.3 s.
Idle: telescope parks at ry 0, bars sink to 0.3 of their height over 20 s, lens 0.2, speckles off, the dome closes over 2 s (it stays open at night regardless).

### Night

Dome halves open at night even when idle (observing); interior disc lit via the glass material; one PointLight #8E7BD0 intensity 4 x ramp distance 5 at (4.5, 4.4, 2.8) in the dome gap; portholes lit via glass; billboard bars emissive 0.7 x (0.5 + 0.5 ramp); antenna tip 1.5 blinking 0.5 Hz; the sculpture's lilac bars get emissive 0.2 x ramp.

## credit: Credit

Classic bank with vault. Footprint 10 by 6, door at local x 5, station left (path east, workTile (2.5, 3.5)). Silhouette: a heavy rusticated block with a gold parapet band, stepped gold roof slabs and a standing coin, joined to a windowless vault block whose giant round door faces the camera. Top 6.4.

### Building

1. Plinth box 10.0 x 0.14 x 6.0 at (5, 0, 3) #CFC6B6; two broad steps 4.0 x 0.14 x 0.4 at z 6.2 and 5.95 (y 0, 0.14).
2. Banking hall box 6.8 x 3.6 x 5.6 radius 0.1 at (3.6, 0.14, 3.0) dept.wall #F0E9DB (x 0.2..7.0) with a rusticated base band box 6.9 x 1.0 x 5.7 at y 0.14 #CFC6B6.
3. Three engaged pilasters box 0.5 x 3.6 x 0.25 #F8F6F0 at x 0.7, 2.6, 6.4, z 5.8, with gold capitals box 0.6 x 0.15 x 0.3 dept.accent #C68B17; the door bay sits between x 2.6 and 6.4.
4. Parapet box 7.2 x 0.5 x 6.0 at (3.6, 3.74, 3.0) dept.accent with 8 dentil boxes 0.3 x 0.2 x 0.3 #F8F6F0 along the south edge; flat roof box 6.6 x 0.15 x 5.4 at y 4.24 #CFC6B6; stepped slab box 3.6 x 0.4 x 3.0 at (3.6, 4.39, 3.0) dept.accent.
5. Standing coin cyl r 0.8 h 0.15 rx pi/2 at (3.6, 5.6, 3.0) dept.accent with a glow(#F6D463, 0.2) rim torus r 0.8 tube 0.05 and a navy T circle decal on both faces, spinning ry 0.4 rad per s (edge-on flashes; top 6.4).
6. Vault block box 2.8 x 4.0 x 4.8 at (8.4, 0.14, 3.0) dept.wall (z 0.6..5.4) with gold corner bands box 0.15 x 4.0 x 0.15 and a gold cap box 3.0 x 0.2 x 5.0 at y 4.14.
7. Round vault door on the vault block's south face: ring cyl r 1.1 h 0.3 rx pi/2 #2E3E50 at (8.4, 1.8, 5.45); door disc cyl r 1.0 h 0.25 dept.accent hinged on its west edge (pivot group at (7.4, 1.8, 5.6), ry 0 closed to -1.4 open); spoke wheel torus r 0.42 tube 0.05 #F8F6F0 with 6 spokes cyl r 0.03 and 8 bolt spheres r 0.07 #F8F6F0 around the rim; behind it a lit recess box 1.8 x 1.8 x 1.0 glow(#F6D463, 0.6) with 6 gold bar boxes 0.4 x 0.15 x 0.2 #F6D463 (seen when the door is ajar).
8. Door: tall bronze double 1.6 x 2.4 x 0.08 at (5, 0.14, 5.8) dept.accent with a #0E2238 split line, #F6D463 handles and a glass() fanlight half disc r 0.8 above in a #F8F6F0 frame; sign band 2.2 x 0.35 'Credit' decal above the fanlight.
9. Windows, one glass(): two barred windows 0.9 x 1.6 at x 1.7 and 3.4, y 1.2 with 3 vertical #2E3E50 bars each; 3 per side face of the hall; none on the vault block. Two lanterns box 0.2 x 0.3 x 0.2 #2E3E50 with #FFF1C9 bulbs on the pilasters at x 2.6 and 6.4, y 2.4. Night deposit box 0.5 x 0.6 x 0.2 #2E3E50 at (1.3, 1.0, 5.85). Rooftop vent cyl r 0.5 h 0.4 #2E3E50 at (1.6, 4.39, 1.2).
Extras: #0E1B2E ink (vault interiors). Brass #F6D463 is shared.

### Activity

vault. An outdoor demonstration strongroom whose door swings open toward the camera. Props: 1) Strongroom box 3.0 x 2.6 x 1.4 at (1.9, 0, 0.9) dept.wall with gold corner bands 0.15 and a gold roof slab 3.2 x 0.2 x 1.6 at y 2.6. 2) Vault door on its south face: ring cyl r 1.05 h 0.3 rx pi/2 #2E3E50 at (1.9, 1.3, 1.65); door disc cyl r 1.0 h 0.25 dept.accent hinged on its WEST edge (pivot group at (0.85, 1.3, 1.65)) swinging ry 0 to +1.6 so the open door stands along z at x 0.85 and the opening faces the camera; spoke wheel torus r 0.42 tube 0.05 #2E3E50 with 4 spoke boxes 0.84 x 0.06 x 0.06 and a brass hub sphere r 0.1 (child of the door, spins about its axis); 8 bolt spheres r 0.07 #F6D463 around the rim; a dial decal 0.5 x 0.5 beside the wheel. 3) Interior: back plane #0E1B2E, shelf box 1.6 x 0.1 x 0.8 #2E3E50 at y 0.2, 9 gold bars box 0.4 x 0.15 x 0.2 glow(#F6D463, 0.3) in a 3 by 3 pyramid, 3 coin stacks cyl r 0.15 h 0.3 dept.accent. 4) Console wheel the alien spins: post cyl r 0.08 h 0.9 #2E3E50 at (2.5, 0, 2.4), wheel torus r 0.45 tube 0.06 dept.accent with 6 spokes in the xy plane at y 1.0 (prop 1.45 tall), spins about z. 5) Coin shower: 12 cyl r 0.08 h 0.03 #F6D463. 6) Floor plane 3.6 x 2.2 #CFC6B6 at (1.9, 0.01, 2.4) with a gold border decal. 7) Two brass stanchions cyl r 0.03 h 0.9 at (3.6, 0, 1.4) and (3.6, 0, 3.0) on the path side with a sagging salmon velvet rope (TubeGeometry r 0.03).
Anchor local (2.5, 0, 3.0), hands on the console wheel at z 2.4. Yaw pi (faces north into the wheel; the camera sees the alien's back and the huge door swinging open past it, which is the point). Pose lever. Enter walk.
Per frame while working: a 6.4 s cycle (two bursts). Beat A: the console wheel spins rz 4 turns over 2.0 s ease in-out while the lever pose rocks and the door wheel spins in sympathy; the 8 bolts pop out 0.1 in sequence 0.1 s apart; the door swings 0 to 1.6 over 1.4 s ease in-out (edge travel about 2.6 units); the bars' emissive rises 0.3 to 1.2; 12 coins hop out on small parabolas (up 0.5, out 0.4 to 0.9, 0.7 s) and fade. Beat B: the door swings shut over 1.2 s, the bolts retract with a white flash sphere r 0.15 at the hub, the console wheel spins back 2 turns, bars dim to 0.3.
Per work burst: odd bursts start beat A, even bursts start beat B.
Idle: door closed, wheels still, bars 0.2, coins hidden.

### Night

Standing coin rim glow 1.2 x ramp and keeps spinning; fanlight and barred windows via the glass material; the building vault door sits ajar 0.3 rad at night so a gold slot of light falls on the plinth, with one PointLight #F6D463 intensity 5 x ramp distance 4 inside its recess at (8.4, 1.8, 4.8); pilaster lanterns 0.8 x ramp; the station bars hold 0.5 x ramp even when idle so the vault reads from afar.

## finance: Accounting (id finance)

Ticker tower. Footprint 8 by 6, door at local x 4, station right (path west, workTile (1.5, 3.5)). Silhouette: the one slender tall building, a podium under a four-pier shaft wrapped by a scrolling navy ticker band, crowned by a stepped cornice, a pyramid cap and a spinning coin. Top 8.9.

### Building

1. Plinth box 8.0 x 0.14 x 6.0 at (4, 0, 3) #CFC6B6; entry step 3.2 x 0.14 x 0.5 at z 6.25.
2. Podium box 7.4 x 2.0 x 5.4 radius 0.06 at (4, 0.14, 3.0) dept.wall #EBE4D5 with a glass() shopfront plane 5.0 x 1.2 at y 0.6 on the south face and a #F8F6F0 parapet lip at y 2.14; podium roof slab 7.4 x 0.2 x 5.4 dept.accent #2E8B8E.
3. Tower shaft box 4.4 x 5.6 x 4.0 at (4, 2.14, 2.6) dept.wall (top 7.74) with 4 corner piers box 0.3 x 5.6 x 0.3 #F8F6F0.
4. Ticker band box 4.8 x 0.6 x 4.4 at y 4.3 wrapping the shaft, navy #002D4F, canvasTex 1024 x 128 of aqua and white ticker text ('THRD 42.10 up 1.2  DDA 1.8B  COD 640M  NIM 3.9') scrolling UV offset.x 0.08 per s, emissive 0.8.
5. Crown: stepped cornice boxes 4.8 x 0.3 x 4.4 at y 7.74 and 4.2 x 0.3 x 3.8 at y 8.04 #F8F6F0; pyramid cap cone r 2.6 h 0.56 seg 4 ry pi/4 at y 8.34 dept.accent (tip 8.9).
6. Rooftop coin cyl r 0.6 h 0.1 rx pi/2 at (4, 8.3, 3.6) #F6D463 standing on the cap's south slope with a navy T decal, spinning ry 0.6 rad per s (top 8.9).
7. Windows, one glass(): five floors of windowRow 3 x (0.5 x 0.7) at y 2.9, 3.9, 4.9, 5.9, 6.9 on the south and north faces (x0 3.25, spacing 0.75; the y 4.9 row sits above the band), 3 per side face per floor, plus the shopfront.
8. Door: glass double 1.6 x 1.9 at (4, 0.14, 5.72) with a teal frame 1.8 x 2.05 x 0.08 and a teal canopy plane 2.4 x 0.9 at y 2.1 projecting 0.6 south.
9. Piggy bank statue beside the entrance at (1.2, 0.74, 5.4): sphere r 0.5 scaled (1.2, 1, 1) dept.accent on a plinth box 1.0 x 0.6 x 1.0 #CFC6B6, four legs cyl r 0.08 h 0.2, snout cyl r 0.18 h 0.15, ear cones r 0.12, coin slot box 0.3 x 0.05 x 0.05 #2E3E50 (tells the story from the facade). Vent stacks cyl r 0.2 h 0.5 #2E3E50 on the podium roof at (0.8, 2.34, 1.0) and (7.2, 2.34, 1.0).
Extras: #1F8A5B green (up candles), #AFD6E4 chute (shared glass tint).

### Activity

ticker, screen based. Props: 1) Standing desk: top box 2.4 x 0.06 x 0.7 at (1.5, 0.5, 3.0) #E8DCC0 on two trestle legs box 0.08 x 0.5 x 0.6 #2E3E50; keyboard box 0.6 x 0.03 x 0.2 #2E3E50 at (1.5, 0.53, 2.75). 2) Monitors: three screens box 0.7 x 0.4 x 0.04 at x 0.75, 1.5, 2.25, y 0.55 to 0.95, z 3.1, facing -z, glow(#75CCD0, 0.8) with canvasTex candlestick charts (#1F8A5B up and salmon down bars); backs slate with a white T. 3) Ticker column box 0.4 x 1.6 x 0.04 navy at (2.95, 0.5, 3.1) at the desk's east end (beside the alien, not in front of its face) with a canvasTex column of white digits scrolling UV offset.y 0.1 per s, emissive 0.9, and a 4-digit balance decal at its top. 4) Coin chute: clear tube cyl r 0.14 h 1.5 MeshStandardMaterial #AFD6E4 opacity 0.35 transparent rising from the desk's east end at (2.6, 0.5, 2.5) to y 2.0, an elbow quarter torus r 0.4 turning north, then a straight cyl r 0.14 h 0.6 angled down to the slot. 5) Giant piggy bank: sphere r 0.65 scaled (1.25, 1, 1) salmon at (3.0, 0.75, 1.2) on a plinth box 1.4 x 0.3 x 1.4 #CFC6B6; snout cyl r 0.22 h 0.2 rx pi/2 on its south face, two ear cones r 0.14 h 0.2, four legs cyl r 0.1 h 0.3, curly tail torus r 0.1, white eyes r 0.08 with navy pupils facing +z, coin slot box 0.4 x 0.06 x 0.06 #2E3E50 at y 1.45 (prop 1.6 wide). 6) Coin pool: 10 cyl r 0.12 h 0.03 glow(#F6D463, 0.3), hidden idle. 7) Floor rug plane 2.8 x 1.4 navy at y 0.01 under the desk; a chart decal 1.0 x 0.6 (rising line) on a post at (0.4, 1.2, 0.8) repainted every 4 bursts.
Anchor local (1.5, 0, 2.45); desk at z 3.0, screen tops 0.95 so the face shows. Yaw 0. Pose type. Enter walk.
Per frame while working: candlestick textures scroll 0.05 per s, digits 0.1 per s; screen emissive 0.8 + 0.2 sin(2 pi 0.5 t); the pig breathes scale 1.0 to 1.02 at 0.4 Hz.
Per work burst: 3 coins pop from the keyboard (1.9, 0.55, 2.75) up the chute (y 0.5 to 2.0 over 0.6 s, spinning 10 rad per s, staggered 0.15 s), arc over the elbow 0.8 north and drop into the slot over 0.4 s (about 1.5 units up and 1.3 north); the pig squashes scale (1.08, 0.92, 1.08) recovering over 0.3 s, flashes glow(#E7706F) 0.3 and blinks; a white ding sphere r 0.08 pops at the slot; the balance decal adds 100 (repaint once).
Idle: screens dim to 0.4, digits slow to 0.03 per s, coins hidden, pig still.

### Night

Ticker band emissive 0.8 to 1.6 x ramp and keeps scrolling (the tower is the city's lit sign); rooftop coin glow(#F6D463) 1.0 x ramp; one PointLight #75CCD0 intensity 4 x ramp distance 5 at the crown (4, 8.0, 2.6) and one #FFE2A0 intensity 4 x ramp distance 4 at the shopfront (4, 1.4, 5.9); all five window floors lit via the glass material; station monitors hold 0.5 idle so the desk reads at night.

## tech: Technology

Server campus. Footprint 11 by 6, door at local x 5, station left (path east, workTile (2.5, 3.5)). Silhouette: a low steel-framed glass box with an open colonnade at ground level (so the server racks on the ink floor are visible without transparent glass), plum neon trim on two lines, four roof dishes, HVAC units and a blinking mast. Top 6.0.

### Building

1. Plinth box 11.0 x 0.14 x 6.0 at (5.5, 0, 3) #CFC6B6 with an aqua-edged walkway decal to the door.
2. Frame: floor slab box 10.4 x 0.2 x 5.4 at (5.5, 0.14, 3.0) dept.wall #E7E1D4; roof slab box 10.6 x 0.25 x 5.6 at y 4.14 dept.wall; 6 steel columns box 0.18 x 4.0 x 0.18 #2E3E50 per long face at x 0.5, 2.5, 4.5, 6.5, 8.5, 10.5 and 4 per short face; a #F8F6F0 sill band box 10.6 x 0.12 x 5.6 at y 1.6.
3. Glass: one glass() material on curtain panes box 10.0 x 2.4 x 0.06 on the south and north faces and 5.0 x 2.4 x 0.06 on the east and west, from y 1.6 to 4.0 (transparent false per ART_DIRECTION); below the sill the faces are open between the columns.
4. Interior seen through the colonnade: floor plane 10.0 x 5.0 #0E1B2E at y 0.34; 8 low server racks box 0.8 x 1.2 x 0.6 #2E3E50 at x 1.5, 3.0, 4.5, 6.0 (row z 1.4) and 1.0, 7.0, 8.5, 9.5 (row z 3.8), each with 4 LED strips box 0.6 x 0.04 x 0.02 glow(#75CCD0, 0.6) blinking in a seeded pattern (0.2 to 1.0, 1 to 3 Hz) with every 7th LED salmon.
5. Neon trim: box 10.7 x 0.08 x 5.7 ring glow(dept.accent #A85B8E, 0.8) along the roof slab edge at y 4.39 and a second along the sill band at y 1.72.
6. Rooftop: four dishes (dome r 0.5 scaled y 0.3 rx -1.0 silver #E2E9EE) on posts cyl r 0.05 h 0.6 at (1.5, 4.39, 1.2), (3.5, 4.39, 1.0), (7.5, 4.39, 1.0), (9.5, 4.39, 1.2) yawed 0.4, 0.9, -0.9, -0.4; two HVAC boxes 1.2 x 0.6 x 1.0 #CFC6B6 at (5.5, 4.39, 1.2) and (5.5, 4.39, 3.8) with fan discs cyl r 0.35 h 0.05 #2E3E50 spinning 6 rad per s; mast cyl r 0.03 h 1.6 at (5.5, 4.39, 2.5) #F8F6F0 with a glow(#E7706F) tip blinking 1 Hz (top 6.0).
7. Entrance: a glass vestibule box 2.0 x 2.2 x 0.6 at (5.5, 0.34, 5.4) in the glass material with a plum frame; sliding glass door pair 1.6 x 2.1 at (5, 0.14, 5.72) in a plum frame; canopy box 2.6 x 0.12 x 1.2 glow(#A85B8E, 0.5) at (5.5, 2.4, 5.9) on two thin posts; a '</>' plum canvasTex sign plane 1.2 x 0.6 at (8.8, 3.3, 5.75).
8. Bike rack: 3 toruses r 0.3 tube 0.03 #2E3E50 upright on the plinth at (1.2, 0.14, 5.6).
Extras: #0E1B2E ink (shared), #E8DCC0 desk top (shared); no department-specific extras beyond the accent.

### Activity

workstation, screen based, standing (the type pose is a standing pose and the renderer does not lower the rig, so the desk is a standing desk). Props: 1) Desk: top box 2.2 x 0.06 x 0.7 at (2.0, 0.5, 3.0) #E8DCC0 (surface 0.56) on #2E3E50 pedestals box 0.5 x 0.5 x 0.6 at each end; keyboard box 0.7 x 0.03 x 0.22 #2E3E50; mug cyl r 0.05 h 0.1 white. 2) Monitors: center box 0.8 x 0.42 x 0.04 at (2.0, 0.56, 3.1), left and right box 0.7 x 0.4 x 0.04 at x 1.25 and 2.75 angled ry plus or minus 0.35 toward the alien, all facing -z, glow(#75CCD0, 0.8) with canvasTex code lines (aqua, white, plum keywords) scrolling UV offset.y 0.06 per s; tops at 0.98 (center) and 0.96 (sides), under the 1.0 standing limit of principle 6; backs slate with a white T. 3) Floating glyphs: 12 planes 0.3 x 0.3 canvasTex single glyphs ('{', '}', ';', '0', '1', '<', '>', '=', '/', '*', 'λ', '=>') MeshBasicMaterial transparent in aqua, rising from the monitor tops (y 1.05) to y 2.35 over 1.8 s with 0.1 sway and ry spin 1 rad per s, recycling. 4) Robot arm at the desk's east end (3.0, 0.56, 3.0): base cyl r 0.15 h 0.1 #2E3E50, shoulder sphere r 0.12 dept.accent, upper arm box 0.08 x 0.5 x 0.08 pivot rz, elbow sphere r 0.1, forearm box 0.07 x 0.45 x 0.07 pivot rz, gripper two boxes 0.04 x 0.15 x 0.04 #E2E9EE, a glow(#E7706F) status LED r 0.03 on the shoulder (reach 1.0, prop 1.3). 5) Gadget pad box 0.6 x 0.04 x 0.6 at (3.4, 0.56, 2.5) on a side table box 0.6 x 0.56 x 0.6 #2E3E50 with a gadget body box 0.35 x 0.2 x 0.25 #E2E9EE and three staged parts (aqua lens cyl r 0.08, plum antenna cyl r 0.02 h 0.2, salmon button sphere r 0.05) in a tray. 6) Office chair parked beside the desk's west end, not under the anchor: seat cyl r 0.3 h 0.08 #2E3E50 at (0.55, 0.34, 2.4) (seat top 0.42), back box 0.5 x 0.5 x 0.06 at z 2.15, post and 5-star base. 7) Server tower box 0.6 x 1.6 x 0.6 #2E3E50 at (0.5, 0, 1.0) with 6 glow(#75CCD0) LEDs and a cable tube r 0.02 to the desk top (ends at (1.15, 0.48, 2.7)). 8) Floor mat plane 2.8 x 1.6 #0E1B2E at y 0.01.
Anchor local (2.0, 0, 2.45) standing on the ground; desk at z 3.0 (anchor.z + 0.55), center monitor top 0.98 so the face shows over the screen. Yaw 0. Pose type. Enter walk.
Per frame while working: code textures scroll; glyphs stream (one spawn per 0.15 s); monitor emissive 0.8 + 0.2 sin(2 pi 0.5 t); the robot arm runs a 3.2 s cycle synced to bursts: swings rz 0.6 to the tray (0.5 s), lowers and closes the gripper, lifts a part, swings back over the gadget and places it (part reparents to the gadget); server LEDs blink 2 to 4 Hz.
Per work burst: a compile: all three monitors flash plum 1.2 for 0.3 s and two extra glyphs spawn; the placed part snaps in with a white spark sphere r 0.1 and the status LED flashes glow(#1F8A5B) 0.3 s; after three parts the gadget hops 0.3, spins ry 2 pi in 0.6 s, fades, and a new blank body appears with the parts back in the tray.
Idle: screens dim to 0.35 with a slow screensaver pulse, glyphs fade out over 0.5 s, arm parks folded, server LEDs blink 0.5 Hz (data centers never sleep).

### Night

Both neon lines glow 0.8 to 2.0 x ramp framing the glass box; rack LEDs double; one PointLight #75CCD0 intensity 5 x ramp distance 6 at (5.5, 2.0, 2.6) so the colonnade spills aqua onto the plinth; canopy 1.2; mast tip blinks; curtain lit via the glass material; station monitors hold 0.5 idle.

## risk: Risk

Lighthouse and keeper cottage. Footprint 7 by 7, door at local x 3, station right (path west, workTile (1.5, 3.5)). The only building allowed above 9. Silhouette: a tapered white tower with three orange bands, a glazed lamp room under a cone cupola, a lean-to cottage, buoys in a puddle and a seesaw. Top 12.97.

### Building

1. Plinth box 7.0 x 0.14 x 7.0 at (3.5, 0, 3.5) #CFC6B6.
2. Rocky base cyl r 2.6 h 1.2 seg 10 flat shaded #B9C4CC at (4.2, 0.14, 2.6) with a lip torus r 2.6 tube 0.1 at y 1.34 and 5 boulder spheres r 0.4 to 0.6 scaled y 0.6 around its foot in #B9C4CC and #CBD3DA.
3. Shaft cyl rTop 1.1 rBottom 1.6 h 9.0 seg 24 at (4.2, 1.34, 2.6) dept.wall #EEE7D9 (top 10.34); three bands torus r 1.5, 1.36, 1.23 tube 0.18 at y 3.2, 5.8, 8.2 hugging the taper, dept.accent #C05E2C, each tilted rx 0.12 with alternating ry for a helical look.
4. Gallery cyl r 1.6 h 0.25 #2E3E50 at y 10.34 with a railing of 16 posts r 0.03 h 0.5 and a ring torus r 1.6 tube 0.03.
5. Lamp room: 8 glass() panes box 0.9 x 1.2 x 0.05 in an octagon r 1.1 from y 10.59 with #2E3E50 mullions; inside, a Fresnel drum cyl r 0.45 h 0.8 glow(#FFE2A0, 0.6) and two beam cones r 0.6 h 7 pointing opposite directions (MeshBasicMaterial #FFF1C9 opacity 0.15 additive depthWrite false renderOrder 5) rotating ry 0.5 rad per s together.
6. Cupola cone r 1.4 h 1.0 at y 11.79 dept.accent; finial sphere r 0.12 #2E3E50 at y 12.85 (top 12.97).
7. Keeper cottage box 2.6 x 2.0 x 2.4 radius 0.04 at (1.5, 0.14, 5.0) dept.wall with a lean-to roof box 3.0 x 0.12 x 2.8 dept.accent tilted rx 0.3 from y 2.9 at the north eave to 2.1 at the south; chimney box 0.35 x 0.8 x 0.35 #8A6F5E at (0.8, 2.6, 4.4); one glass() window 0.6 x 0.7 on its south face; a cottage door 1.0 x 1.7 dept.accent at x 1.5, z 6.2.
8. Department door: a covered passage box 1.8 x 2.0 x 1.2 at (3.0, 0.14, 6.4) joining cottage and tower, with the door 1.6 x 1.9 x 0.08 dept.accent at (3, 0.14, 7.0) on the front face, #F8F6F0 frame, #F6D463 knob.
9. Buoys: cones r 0.2 h 0.6 salmon and #F6D463 on float spheres r 0.25 at (6.3, 0.3, 5.8) and (6.4, 0.3, 4.8) bobbing 0.1 at 0.4 Hz in a puddle plane 1.8 x 2.2 #6CC3CB at y 0.16 at (6.1, 0, 5.4) over a sand ring #E3D5B2.
10. Dressing: life ring torus r 0.3 tube 0.08 salmon with white quadrants on the tower's south face at y 2.4; a bell cyl r 0.15 h 0.2 #F6D463 hanging from a post at (6.8, 0.14, 6.8); a warning diamond box 0.6 x 0.6 x 0.04 rz pi/4 with a '!' canvasTex on #F6D463 at (0.3, 0.9, 6.8); a seesaw plank box 1.8 x 0.08 x 0.3 #A5774E on a pivot box 0.3 x 0.4 x 0.3 #2E3E50 at (0.9, 0.14, 1.2) tipping rz plus or minus 0.25 at 0.3 Hz (balance).
Extras: none beyond shared stone, water, sand and bulb colors.

### Activity

lighthouse. A short twin tower in the station so the keeper is visible at eye level. Props: 1) Tower: stone base cyl r 1.4 h 0.6 seg 10 #B9C4CC at (1.8, 0, 2.0); shaft cyl rTop 0.75 rBottom 1.0 h 2.2 dept.wall at y 0.6 with one dept.accent band torus r 0.95 tube 0.14 at y 1.7; gallery cyl r 1.1 h 0.2 #2E3E50 at y 2.8 with 12 rail posts h 0.45 and a ring; lamp-room floor y 3.0; 6 glass() panes 0.7 x 1.0 in a hexagon r 0.8 with #2E3E50 mullions from y 3.0 to 4.0, open on the south side so the alien reads; cupola cone r 1.0 h 0.7 dept.accent at y 4.0 (top 4.7). 2) The lamp: Fresnel drum cyl r 0.3 h 0.6 glow(#FFE2A0, 0.5) on a pedestal at (1.8, 3.05, 1.7); a crank wheel torus r 0.3 tube 0.04 #2E3E50 with a #F6D463 knob on its south side at y 3.4 (the alien turns it); two beam cones r 0.5 h 5.0 additive #FFF1C9 opacity 0.14 pointing opposite directions, pivot ry. 3) Puddle: plane 2.0 x 1.4 #6CC3CB at (3.0, 0.02, 3.3) over a sand ring plane 2.4 x 1.8 #E3D5B2 at y 0.015, with three buoys (cone r 0.15 h 0.45 dept.accent with a white band on a float sphere r 0.2, glow(#E7706F) tip r 0.06) at (2.4, 0, 3.0), (3.1, 0, 3.6), (3.6, 0, 2.9) bobbing 0.12 and tilting 0.15 at 0.5 Hz with phase offsets. 4) Seesaw: fulcrum box 0.25 x 0.5 x 0.25 #2E3E50 at (0.8, 0, 3.4); plank box 1.6 x 0.06 x 0.25 #A5774E pivoting about z at y 0.5 with a 'R' ink cube 0.25 on the west end and a white 'reward' sphere r 0.14 on the east end that slide 0.15 when the plank tips. 5) Foghorn: two cones r 0.15 h 0.4 #2E3E50 on the base's east side; a white ring torus r 0.2 tube 0.03 additive for the blast. 6) Rope coil torus r 0.3 tube 0.1 #A5774E on the gallery; a rope fence of 4 posts cyl r 0.04 h 0.5 #A5774E with sagging rope tubes r 0.015 #2E3E50 along the puddle's south edge.
Anchor local (1.8, 3.0, 2.3) in the lamp room behind the crank (lamp at anchor.z - 0.6). Yaw pi (faces north into the lamp; the camera sees the keeper's back against the glowing lens through the open south side, a clear silhouette). Pose lever. Enter inside (the alien enters the tower door, fades, reappears in the station lamp room).
Per frame while working: the crank spins rz 1.5 rad per s with the lever pose rock; the beam pair rotates ry 0.8 rad per s (one sweep per 7.9 s) so both beams swing across the yard and path; the lamp glow pulses 0.5 to 1.2 on each pass toward the camera; each buoy tip flashes 1.0 when a beam's yaw comes within 0.3 rad of its bearing; the building's main beam doubles to 1.0 rad per s and its beams show at opacity 0.08 even by day.
Per work burst: the foghorn blows: the horns scale 1.0 to 1.15 for 0.3 s and the white ring expands 0.2 to 1.4 and fades in 0.8 s from the horn mouth; the seesaw tips to the other side over 0.6 s ease in-out (plank ends travel about 0.8) with the cube and sphere sliding and 5 white specks r 0.03 splashing at the lower end; the buoys bob higher (0.25) for one cycle.
Idle: station beams fade to 0 by day, crank still, seesaw settles level over 2 s, buoys keep bobbing (water is always alive), lamp 0.3.

### Night

The 13 tall lamp room is the town's beacon: Fresnel glow 1.2 to 2.5 x ramp, beams opacity 0.15 to 0.28 x ramp, always rotating 0.5 rad per s; one PointLight #FFE2A0 intensity 10 x ramp distance 8 at (4.2, 11.0, 2.6), the building's only light and the one dept light the renderer always enables; cottage window via the glass material; building buoy tips glow(#E7706F) 0.6 blinking 0.5 Hz alternating; the station lamp holds 0.6 x ramp and sweeps at 0.3 rad per s even when idle; the puddles get a white sheen plane at opacity 0.2.

## marketing: Marketing

Studio and billboard. Footprint 10 by 6, door at local x 5, station left (path east, workTile (2.5, 3.5)). Silhouette: a lime gabled studio with a striped canopy, a half-painted mural, a giant billboard on stilts above the roof and two balloon bunches. Top 6.8.

### Building

1. Plinth box 10.0 x 0.14 x 6.0 at (5, 0, 3) #CFC6B6.
2. Studio box 9.4 x 2.6 x 5.4 radius 0.06 at (5, 0.14, 3.0) dept.wall #F1EADC; gableRoof 10.0 wide, 6.0 deep, h 1.4 at (5, 2.74, 3.0) dept.accent #8DBE2E, ridge along x (top 4.14), with a glass() skylight plane 6.0 x 1.4 on the north slope and a #F8F6F0 ridge cap box 10.0 x 0.08 x 0.2.
3. Mural on the east third of the south face: decal 2.8 x 2.0 at (8.0, 1.3, 5.75), canvasTex diagonal blocks in lime, salmon, aqua and white with a roller stripe missing (half-painted look).
4. Striped canopy across the west two thirds: box 6.4 x 0.06 x 1.0 at (3.2, 2.2, 6.0) tilted rx 0.3, canvasTex 8 stripes alternating dept.accent and #FFFFFF, valance box 6.4 x 0.14 x 0.03; two posts r 0.04 at x 0.6 and 5.8.
5. Billboard on stilts: two posts box 0.2 x 3.6 x 0.2 #2E3E50 at (2.5, 2.74, 1.5) and (7.5, 2.74, 1.5) rising to 6.34; board box 5.4 x 2.4 x 0.12 at (5, 4.4, 1.5) facing +z in a #F8F6F0 frame with a canvasTex 1024 x 456 poster ('Say hello to Thread' navy headline in Kanit, aqua swoosh, salmon dot) whose paint fill is a clip rectangle 0 to 100 percent driven by the activity through ctx.b.billboardFill (both functions live in marketing.js); three spotlights cyl r 0.08 h 0.25 #2E3E50 on an arm above the board with glow(#FFF1C9, 0.3) lenses (top 6.8).
6. Balloons: a bunch of 7 spheres r 0.25 in salmon, aqua, #F6D463, dept.accent, white, salmon, aqua on strings cyl r 0.008 h 1.2 tied to the canopy post at (5.8, 2.2, 5.9), bobbing 0.12 at 0.6 Hz with per-balloon phase and 0.08 sway; a second bunch of 4 at (0.6, 2.2, 5.9).
7. Windows, one glass(): big shop window plane 3.4 x 1.4 at (2.6, 0.6, 5.73) in a dept.accent frame with a canvasTex of three poster cards behind; windowRow 2 x (0.7 x 0.8) at y 0.9 on the north face and flanks; the skylight.
8. Door 1.6 x 1.9 x 0.08 at (5, 0.14, 5.72) dept.accent with a round porthole, #F8F6F0 frame and #F6D463 knob; a sandwich board (two planes 0.5 x 0.7 leaning) at (6.4, 0.14, 6.3) canvasTex 'Open'.
9. Paint cans: 3 cyl r 0.2 h 0.3 in salmon, aqua, #F6D463 on the plinth at x 0.5, 0.9, 1.3, z 5.5 with a brush; a rooftop megaphone cone r 0.4 h 0.8 rz -1.2 salmon on a post at (9.0, 4.0, 2.4).
Extras: none beyond brand colors and shared brass.

### Activity

hoops. The hoop stands at the station's north edge so the ball arcs away from the camera and the net is seen face on. Props: 1) Half court plane 3.8 x 3.8 #CFC6B6 at (2.0, 0.01, 2.0) with painted lines canvasTex (key 1.6 x 1.8, free-throw arc r 0.9, three-point arc r 2.4) in dept.accent and white. 2) Hoop: pole cyl r 0.08 h 3.0 #2E3E50 at (2.0, 0, 0.5); backboard box 1.6 x 1.0 x 0.06 #F8F6F0 at y 2.1 facing +z with a dept.accent target square decal; rim torus r 0.3 tube 0.03 salmon at (2.0, 2.3, 0.85) rx pi/2; net: 8 cyl r 0.01 h 0.4 #FFFFFF hanging from the rim tapering (scale x 0.7 at the bottom). 3) Scoreboard box 1.4 x 0.7 x 0.1 navy at (2.0, 3.2, 0.5) above the backboard facing +z, canvasTex 'Goals 00 of 12' in aqua digits, glow 0.6. 4) Ball rack box 0.8 x 1.0 x 0.4 #2E3E50 at (3.5, 0, 3.3) holding 3 spare balls; the ball in play: sphere r 0.16 salmon with navy seam toruses (on palette; no orange). 5) Campaign easel: tripod of 3 cyl r 0.03 h 1.4 at (0.5, 0, 1.0) holding a board plane 0.9 x 1.1 facing +z whose canvasTex poster fills with color as goals land. 6) Cheer pennants: two planes 0.3 x 0.5 lime and salmon on a pole cyl r 0.03 h 1.6 at (3.6, 0, 0.5). 7) Confetti: 8 planes 0.09 x 0.13 in salmon, aqua, lime, hidden.
Anchor local (2.0, 0, 3.0) at the free-throw spot. Yaw pi (faces north toward the hoop; the camera sees the ball arc over the alien's head into the net). Pose throw. Enter walk.
Per frame while working: the throw pose cycles 1.6 s; at the release point (t 0.55) the ball spawns at the hands (2.0, 1.1, 2.6) and flies a parabola to the rim center (2.0, 2.3, 0.85): 1.75 north, apex y 3.0, 1.0 s; it drops through the net (strands flare scale x 1.4 for 0.3 s, rim bounces 0.03), falls to the floor, bounces twice (0.4 and 0.15) and rolls back toward the alien at 1.5 units per s before despawning in the hands. Every fourth throw rims out (hits the rim, bounces off 0.6 and rolls). Pennants flutter rz plus or minus 0.3 at 2 Hz.
Per work burst (two throws per window): each made basket increments the scoreboard (repaint once) with a glow flash 1.2, grows the easel poster clip and ctx.b.billboardFill by 1/12 each (the building update reads the shared value and repaints the billboard once per burst); at 12 the 8 confetti burst from the scoreboard (up 1.0, 1.5 s) and both fills wrap to 0.
Idle: ball sits on the rack, net still, scoreboard dims to 0.2 showing the last count, poster holds, pennants drift at 0.6 Hz.

### Night

Three billboard spotlights glow 1.5 x ramp with one PointLight #FFF1C9 intensity 6 x ramp distance 5 at (5, 6.6, 2.4) washing the board; the poster decal emissive 0.5 x ramp so the campaign stays legible; scoreboard 0.9; skylight and shop window via the glass material; balloons get a faint rim emissive 0.15; canopy stripes unchanged.

## people: People

Community house with porch and garden. Footprint 9 by 5, door at local x 4, station right (path west, workTile (1.5, 3.5)). Silhouette: a hip-roofed house with shed dormers, a wraparound porch with a swing, a picket fence and a flower garden. Top 4.02.

### Building

1. Plinth box 9.0 x 0.12 x 5.0 at (4.5, 0, 2.5) #CFC6B6 mostly hidden under a garden plane 9.0 x 1.2 #8DBF66 along the south edge at y 0.13 with flower dots.
2. House box 6.0 x 2.6 x 3.6 radius 0.06 at (4.5, 0.12, 1.9) dept.wall #EAE3D5 (z 0.1..3.7); hipRoof 7.0 wide, 4.6 deep, h 1.3, ridge 3.0 at (4.5, 2.72, 1.9) dept.accent #B9C4CC (top 4.02); two shed dormers box 0.9 x 0.8 x 0.8 at x 3.0 and 6.0, z 3.0, y 2.9 dept.wall with a tilted roof slab box 1.1 x 0.08 x 1.0 rx 0.35 and a glass() window 0.5 x 0.5 each; chimney box 0.4 x 1.0 x 0.4 #8A6F5E at (7.0, 3.1, 1.2) with a #5E4538 cap, smoke while active.
3. Wraparound porch: deck box 8.2 x 0.3 x 1.4 at (4.5, 0.12, 4.0) #A5774E with 10 groove boxes, side deck box 1.2 x 0.3 x 3.6 at (8.1, 0.12, 1.9); porch roof box 8.4 x 0.1 x 1.5 at y 2.5 #F8F6F0 on 6 posts cyl r 0.06 h 2.1 #F8F6F0 at x 0.6, 2.2, 3.4, 5.6, 6.8, 8.4, z 4.6; railing top rail box 8.2 x 0.05 x 0.05 at y 1.2 with 24 balusters r 0.02 h 0.8 #F8F6F0 (gap at the steps); two steps 1.8 x 0.15 x 0.4 at z 4.75 and 5.0 down to the stub.
4. Porch furniture: swing bench (two slats 1.2 x 0.06 x 0.4 and a back) on 2 chains cyl r 0.01 h 1.0 #2E3E50 from the porch roof at (2.0, 1.5, 4.0), swaying rx plus or minus 0.12 at 0.3 Hz; a rocking chair box 0.5 x 0.9 x 0.5 #A5774E at (7.0, 0.42, 4.1).
5. Door 1.6 x 1.9 x 0.08 at (4, 0.42, 3.7) dept.accent under the porch (// CONTRACT: door x and doorPos unchanged) with a glass() fanlight, #F8F6F0 frame, #F6D463 knob and a wreath torus r 0.25 tube 0.05 #6FA860 with 3 salmon berries; welcome mat plane 1.2 x 0.6 salmon; 'Welcome' canvasTex sign plane 1.6 x 0.4 on the porch fascia.
6. Windows, one glass(): two bay windows 1.1 x 1.0 at x 2.2 and 6.8, y 0.9 with flower boxes 0.9 x 0.18 x 0.22 #6B4A2B holding 4 flower dots; 2 upper windows 0.6 x 0.7 at y 2.0 on each side face; the dormers and fanlight.
7. Garden: picket fence of 24 slats box 0.08 x 0.5 x 0.03 #F8F6F0 on a rail along z 4.95 from x 0 to 3.2 and 5.8 to 9 with a gate; 12 flower spheres r 0.09 in salmon, #F6D463, aqua, white on #5B8E45 stems cyl r 0.015 h 0.25 in the garden strip; a round bed torus r 0.5 tube 0.08 #CFC6B6 with 6 flowers at (0.8, 0.13, 1.0); a birdhouse box 0.25 x 0.3 x 0.25 on a post h 1.6 at (0.6, 0.12, 2.6); a mailbox box 0.25 x 0.2 x 0.4 salmon on a post h 0.9 at (5.9, 0.12, 5.3).
Extras: #5B8E45 stem green (shared flower stem); nothing else beyond brand and shared colors.

### Activity

swings. Props: 1) Swing set: two A-frames, legs cyl r 0.06 h 2.7 salmon at (0.7, 0, 1.4) and (0.7, 0, 2.6) leaning rx plus or minus 0.3 to meet at the top, the same at x 3.1; top bar cyl r 0.06 h 2.6 rz pi/2 dept.accent at (1.9, 2.55, 2.0). 2) Two swings: chains cyl r 0.012 h 1.9 #2E3E50 (two per swing) from pivot groups at (1.3, 2.55, 2.0) and (2.5, 2.55, 2.0); seats box 0.5 x 0.05 x 0.25 #A5774E hanging at y 0.65; the alien rides the EAST swing (x 2.5), the west swing swings empty in counter phase at half amplitude. 3) Slide: ladder (two rails cyl r 0.03 h 1.3, 5 rungs) at (3.6, 0, 0.6), platform box 0.5 x 0.05 x 0.5 at y 1.3, bed box 0.5 x 0.04 x 1.8 aqua tilted rx 0.6 from (3.6, 1.3, 0.9) down to the ground at z 2.4 with #F8F6F0 side rails. 4) Sandbox frame box 1.0 x 0.2 x 1.0 #A5774E at (0.6, 0, 3.3) with a sand plane 0.9 x 0.9 #E3D5B2 at y 0.2, a bucket cyl r 0.1 h 0.14 salmon and a spade. 5) Flowers: 8 spheres r 0.09 on stems in salmon, #F6D463, aqua, white along the north edge at z 0.2; a shrub RoundedBox 0.6 x 0.4 x 0.5 #6FA860 at (3.5, 0, 3.6) (no trees on stations). 6) Butterflies: 4 pairs of wing planes 0.08 x 0.08 (salmon and #F6D463) on small lissajous paths over the flowers while working. 7) Sparkle: 3 glow(#FFFFFF) spheres r 0.04.
Anchor local (2.5, 0.65, 2.0), the east seat (the renderer lowers by seatY). Yaw 0 (faces +z, swinging toward and away from the camera so the arc reads in depth). Pose swing. Enter walk.
Per frame while working: the east pivot group rotates rx = A sin(2 pi 0.45 t) with A 0.85 (period 2.2 s; the seat travels a 3.2 unit arc 1.9 below the bar and rises 0.65 at each end, z 0.57 to 3.43); alien.group.position follows the seat (pivot plus 1.9 along the pivot's -y) and rotation.x matches the pivot angle; handle.swingPhase = 0.5 + 0.5 sin(2 pi 0.45 t) so the legs pump at the front of the arc; the empty swing counter-swings 0.4 rad; the slide bed flashes glow 0.15 when the swing hits its front peak; butterflies flutter; the sandbox bucket wobbles rz 0.1 at 1 Hz.
Per work burst: a push: A eases 0.85 to 1.0 for one period and back, the alien's cheer arm flick reads through swingPhase, 3 sparkles pop at the apex, 6 petal planes 0.08 drift off the shrub, the butterflies scatter up 0.5.
Idle: A decays to 0 over 4 s (exp(-t / 1.5)), the empty swing drifts 0.05 rad at 0.45 Hz, butterflies land (hidden), the alien is gone.

### Night

Porch string: 8 glow(#FFE2A0) bulbs r 0.05 under the fascia at 1.0 pitch, 0.1 to 1.6 x ramp; one PointLight #FFC97A intensity 6 x ramp distance 6 at the porch center (4.5, 2.2, 4.0), a warm welcome pool on the steps; windows and dormers via the glass material; the slide's aqua bed catches the porch light; fireflies: 6 glow(#F6D463) spheres r 0.03 drifting in the garden strip at night only (sine paths, 0.3 amplitude, 0.2 Hz); the swing top bar gets two glow caps so the playground reads.
