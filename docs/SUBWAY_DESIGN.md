# Thread Metro runner

Numeric spec for the endless runner in `docs/CONTRACT_V6.md` (section "The game module"). The contract wins where this file disagrees; where the contract leaves a number open, this file closes it. Everything here is buildable from `js/depts/common.js` (`mat`, `glow`, `box`, `cyl`, `cone`, `sphere`, `torus`, `plane`, `canvasTex`, `decal`, `pointLight`, `lerp`, `clamp`, `easeInOut`) plus three.js primitives and `BufferGeometryUtils.mergeGeometries`; no external assets.

Conventions. World units: one unit is the town's tile (the runner is the town character at `ALIEN_SCALE` 1.3, so it stands about 1.17 tall). One unit is 1.5 m for the distance readout. The runner stays at `z = 0` and the world scrolls toward `+z`; a thing at track distance `s` (units from the start of the run) sits at world `z = traveled - s`, so everything ahead has negative z. Lanes are indexed `-1, 0, 1` (left, center, right) at `x = -1.6, 0, 1.6`. The runner group has `rotation.y = Math.PI` so its face (local `+z`) points down the track toward `-z`; the camera sits at positive z behind it. `dt` is clamped to 0.05 before any physics. Colors are sRGB hex through `new THREE.Color(hex)`; every CanvasTexture used as a color map gets `colorSpace SRGBColorSpace`, `LinearMipmapLinearFilter`, anisotropy 8, as `canvasTex` already does. Brand: navy `#002D4F`, aqua `#75CCD0`, salmon `#E7706F`, silver `#E2E9EE`; trim white `#F8F6F0`, iron `#2E3E50`.

Game states: `ready` (countdown), `running`, `dead`. Inputs: `left`, `right`, `jump`, `restart`, `quit` are edges (true for the one `setInput` call), `duck` is held. `update(dt, time)` returns `null`, `{ type: 'quit' }` on quit in any state, or `{ type: 'gameover', distance, coins, best, lifetime }` once on the frame the run ends.

## Feel

Speed curve.
- `v = min(24, 9 + 0.35 * tRun)` where `tRun` counts seconds in `running` only. The cap lands at 42.9 s and about 707 units (1,061 m) into the run.
- In `ready` the world scrolls at 3 units/s, distance does not accrue, no obstacle is nearer than 36 units.
- In `dead` the scroll decays `v *= exp(-8 * dt)` and stops under 0.05.
- Distance in meters `= round(unitsTraveled * 1.5)`; `unitsTraveled` accrues `v * dt` while running (jet, slide and air time included).

Lanes.
- Lane targets x `-1.6, 0, 1.6`. A `left` or `right` edge changes `lane` by one, clamped to `-1 .. 1`; a press into a wall does nothing.
- The visual x eases from the x at the press (`x0`) to the target over `0.18` s with `easeInOut`: `x = x0 + (xt - x0) * easeInOut(min(1, (t - t0) / 0.18))`. A press during a switch retargets to the next lane and restarts the ease from the current x, so a double tap crosses two lanes in about 0.3 s. The collision box always uses the eased x, so a late switch can clip a train side.
- Lanes switch while airborne, sliding, on a roof and under jet.

Jump.
- Press on the ground (or on a roof) sets `vy = 7.5`; gravity `22`. Apex `7.5^2 / 44 = 1.278` at 0.341 s; airtime 0.682 s on flat ground. The arc covers 6.1 units at v 9, 8.9 at v 13, 12.3 at v 18, 16.4 at v 24.
- Feet are above 0.6 (the barrier clearance height) from t 0.093 to 0.589, a 0.496 s window, so a barrier is cleared by any press made 0.09 to 0.49 s before reaching it; the window in units is 4.5 at v 9 and 11.9 at v 24.
- Holding adds nothing. A press while airborne is buffered for 0.10 s and fires on landing if still fresh. A press while sliding ends the slide and jumps.
- `duck` pressed while airborne is a fast fall: gravity becomes 66 until landing, then the slide starts on landing.
- Landing: `y` is clamped to the ground height under the runner (0, a ramp surface, or 2.0 on a train roof); walking off a roof end drops with gravity 22 and no jump arc (pose `hop` on the way down).

Slide.
- `duck` edge (or hold) on the ground starts a slide: pose `slide`, collision box height `0.55`, minimum `0.7` s; while `duck` stays held the slide continues until release, so the contract's 0.7 s is the floor, not the cap. 0.08 s after release the box is standing again (the pose blend takes 0.3 s but the box switches at once).
- A slide started on a train roof keeps running on the roof.

Camera (own `PerspectiveCamera`, near 0.1, far 220).
- Position `(cx, 2.2 + 0.35 * h, 4.5)`, look at `(cx, 1.0 + 0.35 * h, -3)` where `h` is the runner's feet height (so jumps lift the view a third of the way) and `cx` follows the runner x with `cx += (x - cx) * (1 - exp(-8 * dt))`.
- FOV `70 + 8 * clamp((v - 9) / 15, 0, 1)`; updated with `updateProjectionMatrix` only when it changes by more than 0.05 deg.
- Shake on any hit (shield pop or death): for 0.6 s add `0.12 * sin(2 pi 28 t) * exp(-t / 0.18)` to x and `0.07 * sin(2 pi 31 t) * exp(-t / 0.18)` to y.
- Death pull-back: over 1.0 s the z offset eases 4.5 to 6.0 and the look height to 0.8 so the slumped runner fills the frame.
- `resize(w, h)` sets the aspect; the camera is never the town camera.

Countdown (`ready`).
- Lasts 2.4 s: `countdown = ceil((2.4 - tReady) / 0.8)` gives 3, 2, 1 in `hud()`. At 2.4 s the state becomes `running`, `tRun = 0`, and `countdown` reads 0; the HUD shows "Go" for 0.5 s on its own.
- During `ready` the runner holds pose `stand`; inputs are ignored except `quit`.

Runner animation plan (what the game writes each frame before `ctx.animate(handle, fakeAgent, time, dt)`).
- `fakeAgent = { state: 'idle', pose: 'walk', animT: 0, speed: 9, moveDir: { x: 0, z: 1 }, yoff: 0, facing: 1, blinkAt: 0 }`, one object allocated at `start`. `animT += dt`; `blinkAt = time + 2 + 4 * rng()` whenever `time > blinkAt + 0.2` so the runner blinks.
- Pose by state: `ready` `stand`; running on a surface `walk` with `speed = v` (the alien animator caps the bob at 10 Hz, stride 5 Hz, for any speed over 2.3, so the leg cycle is constant and the sense of speed comes from the world, the lean and the FOV); airborne, falling or jet `hop`; sliding `slide`; `dead` `slump`.
- `yoff` for `hop`: the animators lift the rig by `0.06 * -yoff` alien units (0.078 world at scale 1.3) and raise the arms fully at `yoff = -3`. Write `yoff = -3 * clamp(h / 1.278, 0, 1)` and place the group at `group.position.y = h - 0.234 * clamp(h / 1.278, 0, 1)` so the feet land exactly at the physics height `h` (at the apex: group 1.044, rig lift 0.234, feet 1.278). Under jet `h = 3.2`, `yoff = -3`, group y 2.966. The landing squash fires by itself when `yoff` returns toward 0 from below -0.6.
- Group: `scale 1.3`, `rotation.order 'YXZ'`, `rotation.y = Math.PI`, `rotation.x = 0.04 + 0.08 * clamp((v - 9) / 15, 0, 1)` (forward run lean in the group's own frame; 0 in `ready` and `dead`).
- Contact shadow: `plane(0.64, 0.64)` at y 0.012 under the group's x and z (not parented to the group's y), radial 64 x 64 CanvasTexture rgba(0, 20, 40, 0.35) to 0, `MeshBasicMaterial transparent, depthWrite false`; scale `1 - 0.5 * clamp(h / 1.278, 0, 1)` and opacity `0.35 * (1 - 0.6 * clamp(h / 3.2, 0, 1))`; it sits on the roof (y 2.012) while roof running.

## Track segments

Layout. Segments are 24 units long. Segment `k` covers track distance `24k .. 24k + 24`. There are 8 slots; slot `i` holds segment `k` with `k mod 8 = i`, its group at world `z = traveled - 24k`, local z 0 at the near end and -24 at the far end (local `z = -(s - 24k)`). Keep 6 full segments ahead of the runner (`24k + 24 > traveled + 144` triggers nothing new; a slot is reassigned to `k + 8` when `traveled - 24k > 34`, that is when its near end is 10 units behind the runner). Each slot owns one tunnel dressing and one open-air dressing (two groups built once); exactly one is visible per slot. Segments 0 to 2 are always tunnel (the start is under the plaza). Open-air segments come every 4th to 6th segment: `nextOpen = lastOpen + 4 + floor(rng() * 3)` from the run seed, first evaluated with `lastOpen = 0`.

Scene lighting (the game scene has no shadow map; `renderer.shadowMap` stays as the town set it but nothing here casts or receives).
- `HemisphereLight` eased between tunnel `(#6B7686 sky, #22262C ground, 0.7)` and open `(#CFE6F5, #6E6A72, 1.0)` by `w += (inOpen - w) * (1 - exp(-2.5 * dt))`, where `inOpen` is 1 when the segment under the runner (track distance `traveled`) is open-air.
- `DirectionalLight(#FFD9B0, 1.6)` from direction `(-0.45, 0.70, 0.55)` (same as the town sun), `castShadow false`, intensity scaled by `0.25 + 0.75 * w`.
- 6 pooled tunnel `PointLight(#FFE2A0, 10, 9, decay 2)`: they sit on the 6 nearest ceiling fixtures whose track distance is in `traveled - 6 .. traveled + 36` (fixtures every 6 units, see item 4); fixtures beyond are emissive only. In open-air segments the lights that would land there are set `visible false`.
- `scene.background`: a 2 x 512 vertical gradient CanvasTexture, fixed dusk: top `#3E5C8E`, 55 percent `#B98BA0`, bottom `#E6B79E`.
- `scene.fog = new THREE.Fog(color, near, far)` eased with the same `w`: tunnel `#15181E`, near 30, far 120; open `#E6B79E`, near 60, far 160. Color via `Color.lerpColors`, near and far via `lerp`.

Tunnel dressing, per slot (local coordinates; z from 0 to -24, center z -12). Materials are shared across slots through `mat` (cached by key).
1. Ballast floor: `plane(7.2, 24, ballastMat, { rx: -pi/2, y: 0, z: -12, receiveShadow: false })`. `ballastMat = mat('#4E4F55', { roughness: 1 })` with a 256 x 256 grit CanvasTexture (fill `#4E4F55`, 900 dots r 1 to 2.5 px in `#5C5D63` and `#3F4046` at alpha 0.6, then `ctx.filter = 'blur(0.6px)'` self-draw), `RepeatWrapping`, repeat `(3, 10)`. Build the grit texture once and assign it as `map` on that one material.
2. Walls: two `box(0.4, 2.4, 24, brickMat, { x: ±3.8, y: 0, z: -12 })` (inner faces at x ±3.6). `brickMat = mat('#FFFFFF', { roughness: 0.95 })` with the brick texture as `map`, repeat `(12, 1.2)` (the 256 px canvas is 2 x 2 units).
3. Arch ceiling: `new THREE.CylinderGeometry(3.6, 3.6, 24, 32, 1, true, Math.PI / 2, Math.PI)`, mesh `rotation.x = Math.PI / 2`, `scale.y 0.78` applied on the mesh (apex at 2.4 + 2.81 = 5.21), position `(0, 2.4, -12)`, material the brick material cloned with `side: THREE.BackSide` (one shared clone, cached under its own key). If the half arc renders below the floor, add pi to the theta start. Verify once in the build and leave a comment.
4. Ceiling fixtures, 4 per segment at local z -3, -9, -15, -21: `box(0.9, 0.08, 0.25, fixtureMat, { x: 0, y: 5.05, z })` with `fixtureMat = glow('#FFF1C9', 1.6)`; merge the 4 into one geometry per slot. The pooled point lights sit at `(0, 4.9, z)` of the fixture they own.
5. Pilasters, 8 per segment at local z -3, -9, -15, -21 on both walls: `box(0.5, 2.4, 0.3, mat('#4A3B38', { roughness: 0.95 }), { x: ±3.55, y: 0, z })`; merged into one geometry per slot.
6. Wall pipes: `cyl(0.06, 0.06, 24, mat('#5A6068', { roughness: 0.55, metalness: 0.2 }), { seg: 10 })` rotated `rx = pi/2` at `(±3.45, 2.0, -12)`; both merged into one geometry.
7. Sleepers, 30 per lane per segment (pitch 0.8, first at local z -0.4): `BoxGeometry(1.2, 0.08, 0.24)` translated to `(laneX, 0.04, z)`; the 90 boxes merged into one geometry per slot in `mat('#6B5A48', { roughness: 0.9 })`. 1,080 triangles.
8. Rails, 2 per lane: `BoxGeometry(0.06, 0.08, 24)` at `(laneX ± 0.45, 0.12, -12)`; 6 merged into one geometry in `mat('#8C8F94', { roughness: 0.45, metalness: 0.3 })`.
9. Poster: `decal(1.6, 1.0, posterTex[k mod 3], { x: -3.58, y: 1.6, z: -12, ry: pi/2, emissive: 0.15 })` on the left wall. Three 512 x 320 CanvasTextures painted once: navy `#002D4F` fill, a 24 px aqua band at the bottom, Kanit 600 72 px white text "Thread Metro", "Mind the gap", "Next stop: Thread Town", with a 28 px Inter 500 silver sub line "Running since 2026". Fonts through `document.fonts.load` with a repaint when they resolve, as the plaques do; skip painting text when `document` is undefined (Node tests).
10. End cap: `plane(7.6, 5.4, mat('#15181E', { roughness: 1 }), { x: 0, y: 2.7, z: -24 })`, `visible` only on the slot that currently holds the farthest segment, so the tunnel never shows sky through its far opening.
Draw calls per tunnel slot: 10.

Open-air dressing, per slot.
1. Ballast floor as item 1 above.
2. Retaining walls: `box(0.4, 1.0, 24, concreteMat, { x: ±3.8, y: 0, z: -12 })`, `concreteMat = mat('#B9BFC6', { roughness: 0.9 })`.
3. Side ledges: `box(2.0, 0.3, 24, mat('#C9CFD6', { roughness: 0.9 }), { x: ±5.0, y: 0, z: -12 })`; both merged into one geometry.
4. Skyline, 10 buildings per side: for `j` in 0..9, width `2 + 2 * rng()`, height `4 + 7 * rng()`, depth 2, at `x = ±(9 + 6 * rng())`, `z = -1.2 - 2.4 * j`; boxes merged into one geometry per slot with `skylineMat = new THREE.MeshBasicMaterial({ map: windowTex, color: '#FFFFFF' })`; `windowTex` is a 64 x 128 CanvasTexture: fill `#10324F`, 4 columns by 8 rows of 10 x 14 px windows at a 16 px pitch, each lit `#FFD88A` with probability 0.55 else `#1E466B`, `RepeatWrapping`, repeat `(1, 2)`. The skyline rng is the slot's own `mulberry32(seed ^ (k * 977))` so a recycled slot gets a fresh skyline; buildings are rebuilt by writing the merged position attribute in place (`needsUpdate`), never reallocated.
5. Catenary gantries at local z -6 and -18: two `box(0.3, 5.2, 0.3, ironMat, { x: ±3.8 })` and a `box(8.0, 0.2, 0.2, ironMat, { y: 5.2 })`, `ironMat = mat('#5A6068', { roughness: 0.55, metalness: 0.2 })`; all 6 pieces merged.
6. Sleepers and rails as tunnel items 7 and 8 (the same merged geometries, separate meshes).
Draw calls per open slot: 7.

Brick texture canvas recipe (256 x 256 px, 2 x 2 units, painted once).
1. Fill mortar `#5B4B46`.
2. 8 rows at a 32 px pitch; each row 4 bricks at a 64 px pitch, odd rows offset by 32 px (wrap the partial brick to the other edge so the tile repeats cleanly). Brick rect 60 x 28 px inset 2 px from the cell.
3. Brick color by `(row * 7 + col * 3) mod 4` from `#7A4E3E, #86574A, #6F463A, #8C5C4C`, alpha 0.92; then 6 speckle dots r 1 to 2 px per brick in rgba(0, 0, 0, 0.12) and a 1 px highlight line rgba(255, 255, 255, 0.07) along the top edge of each brick.
4. Finish with `ctx.filter = 'blur(0.5px)'` and draw the canvas onto itself, then clear the filter.
5. `RepeatWrapping` on both axes, SRGB, mipmaps, anisotropy 8.

Pooling counts (allocated in `start` the first time, reused after).

| Pool | Count | Notes |
| --- | --- | --- |
| Segment slots | 8 | each with a tunnel group and an open group |
| Tunnel point lights | 6 | repositioned every frame |
| Barriers | 24 | |
| Signs | 16 | panel plus bracket |
| Parked trains | 6 | 3 of length 12, 3 of length 18 |
| Ramps | 6 | one per train at most |
| Oncoming train | 1 | plus one headlight PointLight |
| Coins | 1 InstancedMesh, 180 instances | hidden instances scaled to 0 |
| Power-ups | 8 | 2 per kind |
| Effects | 1 shield sphere, 1 magnet ring, 1 jet pack, 1 contact shadow | |

Draw calls at the default view: track at most 80, obstacles about 60, coins 1, power-ups up to 24, runner about 14, effects 4: under 200.

## Obstacles

Every obstacle has a pool entry `{ kind, lane, s0, s1, y0, y1, active, mesh }` and an AABB in world units: x `laneX ± hw`, y `y0 .. y1`, z `(traveled - s1) .. (traveled - s0)`. The runner box is x `x ± 0.25`, y `h .. h + 1.1` (standing) or `h .. h + 0.55` (sliding), z `-0.25 .. 0.25`. Collision is swept: the obstacle's z range is extended by the distance scrolled this frame (`v * dt`) so a 20 fps frame cannot step over a 0.36 deep barrier. Test order each frame: ground height (ramps, roofs), then hits. A hit with a shield pops it (see Pickups); without, `state = 'dead'`.

Barrier (low, jump over).
- Look: `box(1.2, 0.78, 0.35, barrierMat, { y: 0.12, radius: 0.04 })` in salmon `#E7706F` on a base `box(1.3, 0.12, 0.45, mat('#B9BFC6'))`; a stripe decal `decal(1.16, 0.3, stripeTex, { y: 0.62, z: 0.18 })` on the near face, `stripeTex` 256 x 64 diagonal stripes 32 px wide alternating `#E2E9EE` and `#E7706F` at 45 deg. Total height 0.9.
- AABB: hw 0.6, y 0 .. 0.9, depth 0.36 (`s0 = s - 0.18, s1 = s + 0.18`).
- Dodge: jump (hit only when the runner's `h <= 0.6` while boxes overlap), or change lane, or jet.
- Spawn: pattern rows only (see Pattern generator); never in a lane that holds a train in that row, never under a sign.

Sign (overhead, duck under).
- Look: panel `box(1.3, 0.7, 0.08, navyMat, { y: 1.1, radius: 0.03 })` with `decal(1.2, 0.6, signTex[i mod 3], { y: 1.45, z: 0.05 })` on the near face, `signTex` 384 x 192 CanvasTextures: navy fill, Kanit 600 54 px white "Mind the gap", "Stand clear", "Low clearance" over a 10 px aqua rule. Bracket: in a tunnel two rods `cyl(0.03, 0.03, 3.2, ironMat, { x: ±0.5, y: 1.8, seg: 8 })` up to the arch; in open air two posts `cyl(0.04, 0.04, 1.8, ironMat, { x: ±0.8, seg: 8 })` and a crossbar `box(1.7, 0.1, 0.1, ironMat, { y: 1.8 })`. Posts and rods are decoration with no AABB. Both brackets exist on the pooled mesh; the sign shows one by the segment type at its `s`.
- AABB: hw 0.65, y 1.1 .. 1.8, depth 0.08 plus the runner's 0.5 (`s0 = s - 0.04, s1 = s + 0.04`).
- Dodge: slide (box top 0.55 under 1.1), change lane, or jet (feet 3.2 over 1.8). A jump never clears it (feet would need 1.8).
- Spawn: pattern rows only; never over a train or a ramp.

Parked train (lane filler, length 12 or 18).
- Look (built per length, body geometry cached per length): body `box(1.4, 1.9, L, bodyMat, { y: 0.1, radius: 0.12 })`, `bodyMat` from `#75CCD0`, `#E2E9EE`, `#002D4F` by pool index mod 3 (roughness 0.5); roof `box(1.3, 0.08, L, mat('#B9BFC6'), { y: 2.0 })` so the roof top is at 2.08 (ground height for roof running is 2.0 plus the sleeper allowance, use `2.0`); window band `decal(L, 0.5, trainWindowTex, { x: ±0.71, y: 1.3, ry: ±pi/2 })` on both sides, texture 1024 x 128: body-colored fill, windows 80 x 60 px navy `#0E2238` with 4 px silver frames at a 112 px pitch, `RepeatWrapping`, repeat `(L / 8, 1)`; two bogies `box(1.2, 0.3, 1.6, ironMat, { y: 0.05, z: ±(L / 2 - 1.2) })`; near-end headlights two `sphere(0.08, glow('#FFF1C9', 0.8), { x: ±0.45, y: 1.2, z: L / 2 + 0.02 })`; a salmon stripe `box(1.42, 0.08, L, mat('#E7706F'), { y: 1.0 })`. Merge roof, bogies and stripe into the body's draw where materials allow; about 4 draws per train.
- AABB: hw 0.7, y 0 .. 2.0, `s0 = s, s1 = s + L` (its near face is at `s`).
- Dodge: change lane before its near face; ride its roof from a ramp (ground height 2.0 while the runner's lane and z are inside `s0 .. s1`); jet. Contact anywhere on the body (front face, or a side during a lane switch) is a hit.
- Roof running: on the roof the runner walks, jumps (same arc) and slides; a lane change to a lane without a roof at that z drops the runner (gravity 22, pose `hop`); a lane change onto another train roof at the same height continues; running off the far end drops 2.0 in 0.43 s, covering 3.9 units at v 9 and 10.2 at v 24, so the lane stays free for 2 rows after a train ends. Coins on a roof sit at y 2.6.
- Spawn: pattern rows; lengths 12 (2 rows) or 18 (3 rows). The train's rows count as its lane's hard rows for the row rules.

Ramp (in front of some trains).
- Look: a wedge `BufferGeometry` from six vertices `(±0.65, 0, 0)`, `(±0.65, 0, -4)`, `(±0.65, 2.0, -4)` in local z (low end toward the runner): slope quad, back quad, bottom quad, two side triangles, `computeVertexNormals`; material `mat('#B9BFC6', { roughness: 0.9 })`; a chevron decal `decal(1.2, 4.4, chevronTex, { rx: -atan(2 / 4), y: 1.0 + 0.01, z: -2 })` on the slope: 256 x 1024 canvas with 6 salmon chevrons on silver.
- Ground height: when the runner's lane equals the ramp lane and `s_r = traveled` is inside `s .. s + 4`, `groundY = 2.0 * (s_r - s) / 4`; the ramp's high end is at `s + 4 = trainS - 0.2` (the ramp sits 0.2 in front of the train's near face). The runner on the ramp keeps `h = groundY` when grounded; a jump from the ramp starts from the current `h`.
- No AABB: a runner in the ramp lane is always carried up. A runner switching into the ramp lane halfway up (x overlap and `h < groundY - 0.4`) is a hit (bumping the ramp's side); between 0 and 0.4 below, snap up.
- Spawn: only in the row directly before a train, in that train's lane; 40 percent of tier 2 trains, 60 percent of tier 3 trains, never at tier 1.

Oncoming train (moving).
- Look: the length-18 parked train mesh pattern reused (its own pooled mesh) with a `#002D4F` body, headlights `glow('#FFF1C9', 3)` at r 0.11 and one `pointLight('#FFF1C9', 20, 14, { y: 1.2, z: L / 2 + 0.1 })` parented to it.
- Motion: it has its own track position `sFront` that decreases by `8 * dt` (so its closing speed is `v + 8`); it spawns with `sFront = traveled + 90` and is retired when `traveled - sFront > 30` (fully behind the camera). Only one exists at a time.
- AABB: hw 0.7, y 0 .. 2.0, `s0 = sFront, s1 = sFront + 18` (moving each frame).
- Warning: `tToHit = (sFront - traveled) / (v + 8)`. While `0 < tToHit <= 1.5`: the headlight emissive flashes 1 to 4 at 6 Hz, the point light intensity 20 to 60 with it, the lane's warning plane (one pooled `plane(1.2, 40)` in `MeshBasicMaterial('#E7706F', additive, opacity 0.22)` at y 0.02 in the lane, z from -40 to 0) blinks at 4 Hz, and `hud().warning = lane` so the HUD blinks that lane's chevron (see HUD). Before that `warning` is `null`.
- Dodge: change lane; jet passes over it. It cannot be roof-run.
- Spawn: by the generator as an event, tier 2 every 240 to 420 units, tier 3 every 150 to 270 units, never at tier 1; its lane is chosen from lanes with no train or ramp in rows `traveled .. traveled + 100`; while it lives, its lane counts as a hard lane for every row the generator creates, so at most one other lane can hold a hard obstacle and one lane is always free.

## Pickups and power-ups

Coins.
- Look: `CylinderGeometry(0.22, 0.22, 0.06, 20)` with `geometry.rotateX(pi / 2)` so the disc faces the runner; one `InstancedMesh` of 180 with `coinMat = new THREE.MeshStandardMaterial({ color: '#75CCD0', emissive: '#75CCD0', emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.2 })`; while `double` is active the mesh's material is swapped for `goldMat` (`#F6D463`, emissive `#F6D463` 0.45). Instance `i` spins `rotation.y = 3 * time + 0.4 * i` (compose with `Matrix4.compose` from a module-scope quaternion and vector, no allocation). Hidden instances are scaled to 0.
- Rows: 5 to 10 coins (`5 + floor(rng() * 6)`) in one lane at a 1.5 pitch, center y 0.6 (2.6 on a roof, 3.8 under jet). A jump arc over a barrier at `s`: 7 coins at `s - 3, -2, -1, 0, +1, +2, +3` with centers y 0.6, 1.05, 1.4, 1.55, 1.4, 1.05, 0.6.
- Collection: a coin is taken when `|coinX - x| < 0.5`, `|coinZ| < 0.5` and `|coinY - (h + 0.55)| < 0.7`, or when magnet is active and `|coinX - x| < 3.0`, `|coinZ| < 3.0` and `|coinY - (h + 0.55)| < 1.6`: then it flies toward `(x, h + 0.55, 0)` at 14 units/s and is taken on arrival within 0.3. Value 1, or 2 under `double`. Taken coins shrink to 0 over 0.15 s (instance scale), then free their slot. `hud().coinPulse` is set to the frame's collection count so the HUD can bump the counter.
- Cadence: each generated row gets a coin row with probability 0.65 in a lane that is free of hard obstacles for that row and the next; over a barrier in the chosen lane the row becomes the jump arc with probability 0.5; a ramp train gets a roof row of 8 at y 2.6 with probability 0.8 starting 1 unit past its near face; under jet a row of 10 at y 3.8 spawns every 12 units 40 units ahead in a random lane for the jet's duration.

Power-ups (one pickup mesh per kind, 2 pooled per kind).
- Common base: `box(0.5, 0.5, 0.5, mat('#F8F6F0', { roughness: 0.4 }), { radius: 0.12 })` floating with center y `0.9 + 0.1 * sin(2 pi 1.5 t)`, `rotation.y = 2 t`; pickup when `|px - x| < 0.6`, `|pz| < 0.6` and `|py - (h + 0.55)| < 0.9` (magnet does not attract power-ups). A pickup pops: scale 1 to 1.6 and the base material swapped to an additive aqua clone for 0.2 s, then hidden.
- `magnet`: a salmon horseshoe on the cube's near face: `torus(0.16, 0.05, mat('#E7706F'), { rx: 0 })` with `thetaLength pi` (use `new THREE.TorusGeometry(0.16, 0.05, 10, 24, Math.PI)` rotated so the opening faces down) plus two `box(0.1, 0.08, 0.1, mat('#E2E9EE'))` tips. Effect 8 s: collect radius 3.0 (reaches both neighbor lanes). Runner effect: a `torus(0.55, 0.03, glow('#E7706F', 1.2), { rx: pi / 2 })` at y 0.6 around the runner spinning `rotation.z = 4 t` (in its own frame, the ring tilts 0.25 rad so the spin reads).
- `shield`: an aqua `sphere(0.28, shieldPickMat)` with `shieldPickMat = new THREE.MeshStandardMaterial({ color: '#75CCD0', transparent: true, opacity: 0.55, roughness: 0.2, emissive: '#75CCD0', emissiveIntensity: 0.4 })` over the cube. Effect: until the next hit, at most 25 s. Runner effect: `sphere(0.85, shieldMat, { y: 0.65 })` around the runner, `shieldMat` as above at opacity `0.22 + 0.06 * sin(2 pi t)`, `depthWrite false`. On a hit the sphere scales 1 to 1.8 and fades to 0 over 0.25 s and the runner is invulnerable for 0.6 s (runner opacity toggles 1 and 0.4 at 10 Hz through `setGroupOpacity`). Barrier and sign hits pass through. A train or oncoming hit bounces the runner: if the contact came during a lane switch the lane target returns to the lane it came from, otherwise the lane target becomes the nearest lane with no hard obstacle at that row (one always exists); the ease runs 0.3 s under the invulnerability.
- `double`: the cube carries `decal(0.42, 0.42, doubleTex)` on its near face, 128 x 128 canvas: navy fill, "2x" in Kanit 700 84 px gold `#F6D463`. Effect 12 s: coin value 2, coins render gold, `hud().multiplier = 2`.
- `jet`: a silver `box(0.32, 0.5, 0.3, mat('#E2E9EE', { roughness: 0.4, metalness: 0.3 }), { radius: 0.08 })` with two `cone(0.08, 0.14, ironMat)` nozzles underneath and a salmon flame `cone(0.07, 0.2, glow('#E7706F', 1.5))` under each. Effect 6 s: `h` eases to 3.2 over 0.4 s (`h += (3.2 - h) * (1 - exp(-10 dt))`, then clamped), obstacle hits are ignored while `h >= 2.2`, lanes still switch, pose `hop` with `yoff = -3`; the last 0.5 s descend with gravity 22 (no input) onto the ground height under the runner (a roof if a train is there; a train front hit on the way down is a normal hit). Runner effect: the same pack mesh at `(0, 0.75, 0.32)` in the runner group's local frame (the group faces -z world, so local +z is the runner's back) with the flames flickering `scale.y 0.8 + 0.4 * abs(sin(2 pi 20 t))`.
- Rules: one timed power-up at a time (picking another timed kind replaces the running one and its remaining time); shield stacks with any of them. `hud().powerUp = { kind, remaining }` for the timed one, `hud().shield` for the shield. Durations are in run seconds and pause in `dead`.
- Spawn cadence: the first power-up at `s = 120 + 60 * rng()`, then every `90 + 60 * rng()` units (90 to 150), kind chosen uniformly but never the same kind twice running; lane: one free of hard obstacles in that row and the row before; center y 0.9, or 2.9 on a roof row if the chosen lane is a roof at that `s` (allowed only for ramp trains).

## Pattern generator

Rows. The generator works in rows of 6 units at track distances `s = 36 + 6 n` (the first 36 units are empty). It keeps `rowsAhead` filled to `traveled + 150` (25 rows) and recycles entries older than `traveled - 12`. A row is `{ s, lanes: [l, c, r], hard: [bool x 3], tier, pattern }` where each lane holds `null`, `'barrier'`, `'sign'`, `'train'` (a train row), `'ramp'` or `'oncoming'` (written in by the moving train as it passes, for `_debug.rowsAhead()` only). `game._debug.rowsAhead()` returns the live array sorted by `s` with the oncoming's current rows merged in and `sFront`, `tToHit` on the oncoming entries, so a test can script dodges from it.

Seed. `start(spec, seed)`: `seed` optional (tests pass one); otherwise `seed = ((Date.now() & 0x7fffffff) ^ (runCount * 2654435761)) >>> 0`. The generator rng is a local mulberry32 (the same code as `js/aliens3d.js`), not `Math.random`, so a seed replays. Pattern choices, mirrors, coin rows, power-ups and open-air spacing all draw from this one stream in a fixed order per row.

Difficulty tiers by the predicted speed at the row, `vp = min(24, v + 0.35 * (s - traveled) / max(v, 1))`:

| Tier | vp | Hard lanes per row | Empty rows between patterns | Consecutive pattern rows | Trains | Ramps | Oncoming |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | under 13 | at most 1 | at least 2 (12 units) | 1 (trains excepted) | length 12 | none | none |
| 2 | 13 to under 18 | at most 2 | at least 1 | 1 (trains excepted) | 12 or 18 | 40 percent | every 240 to 420 units |
| 3 | 18 and up | at most 2 | at least 1 after a group | up to 3 (a gauntlet), then 1 empty | 12 or 18 | 60 percent | every 150 to 270 units |

The first 3 pattern rows of every run are tier 1 whatever the speed.

Hard rules (checked after every row is written; a violating draw is redrawn, at most 8 tries, then the row is left empty).
1. Never three hard lanes in one row (`barrier`, `train`, `ramp`, `oncoming` are hard; `sign` is soft).
2. A lane never holds a barrier and a sign in the same row, and a sign never sits in a train or ramp lane.
3. Reachability: for consecutive rows N and N+1 there must be a free (non-hard) lane `f` in N and `g` in N+1 with `|f - g| <= 1`; at tier 3, consecutive pattern rows inside a gauntlet must share the same free lane (a row of 6 units lasts 0.25 s at v 24, a two-lane crossing takes 0.36 s).
4. Same-lane hard obstacles in consecutive rows are allowed only at tier 3 (one jump clears two barriers 6 units apart only above v 12.1, and with a comfortable margin above 18) and only for barriers; a train is never followed in its lane by a hard obstacle within 2 rows (12 units of drop room).
5. The oncoming lane counts as hard in every row created while it lives, and no train or ramp is placed in its lane within `traveled .. traveled + 100` when it spawns.
6. A ramp row is immediately followed by its train rows in the same lane; the ramp counts as hard in its row.

Pattern table. Lanes read left, center, right; `.` free, `B` barrier, `S` sign, `T` train 12 (2 rows), `L` train 18 (3 rows), `R` ramp row followed by a train 18 in that lane (4 rows), each multi-row pattern lists its rows in order. Every pattern is mirrored left to right with probability 0.5 when drawn. Weights are relative within the tier; a tier may draw any pattern of a lower tier.

| Id | Tier | Weight | Rows |
| --- | --- | --- | --- |
| P01 | 1 | 3 | `B . .` |
| P02 | 1 | 3 | `. B .` |
| P03 | 1 | 2 | `S . .` |
| P04 | 1 | 2 | `. S .` |
| P05 | 1 | 2 | `T . .` then `T . .` |
| P06 | 1 | 1 | `. T .` then `. T .` |
| P07 | 1 | 1 | `B . S` |
| P08 | 2 | 3 | `B B .` |
| P09 | 2 | 3 | `B . B` |
| P10 | 2 | 2 | `S B .` |
| P11 | 2 | 1 | `S S .` |
| P12 | 2 | 2 | `T . T` then `T . T` (coin row in the center) |
| P13 | 2 | 2 | `R . .` then `L . .` x 3 |
| P14 | 2 | 2 | `T . .` then `T B .` |
| P15 | 2 | 1 | `. R .` then `. L .` x 3 |
| P16 | 3 | 2 | `B S B` |
| P17 | 3 | 2 | `S B S` |
| P18 | 3 | 2 | `T S .` then `T . .` |
| P19 | 3 | 1 | `R T .` then `L T .`, `L . .`, `L . .` |
| P20 | 3 | 1 | `L . L` then `L S L`, `L . L` |
| P21 | 3 | 2 | gauntlet `B . .`, `B B .`, `. B .` (right lane free throughout) |
| P22 | 3 | 2 | gauntlet `. S .`, `B . B`, `. B .` with the center sign row first (slide then stay center, then step out) |
| P23 | 3 | 1 | `B B .` then `. . B` after one empty row (forces a two-lane crossing with 12 units of room) |

Minimum gaps in units: between any two pattern groups, 12 at tier 1, 6 at tier 2 and 3 (0 inside a gauntlet); after a train's last row its lane stays free for 12; the first obstacle of a run is at `s = 36`; after a death and restart the pattern stream restarts from the new seed. Coin rows never sit inside a barrier's or sign's own row in the same lane except as the jump arc; a coin row never crosses a train body.

Spawn and recycle timing. Obstacles are materialized from rows when `s < traveled + 150` and returned to the pool when `s1 < traveled - 12`. Pool exhaustion (more than 24 barriers in 150 units cannot happen under the row rules; 16 signs and 6 trains likewise) is still guarded: a row that cannot get a mesh is written as empty and a console warning is emitted once per run.

## HUD and summary

`hud()` returns `{ state, distance, coins, best, lifetime, speed, powerUp, shield, multiplier, countdown, warning, coinPulse, hitFlash, newBest }`; the renderer writes DOM text only when a value changes (compare the previous string).

`#runner-hud` (inside `#stage-host`, shown under `body.subway`, `pointer-events none`, padding 18 px, Kanit for numbers, Inter for labels, no em dashes, sentence case).
- Top left `#runner-dist`: the distance, Kanit 600 30 px white with `text-shadow 0 1px 3px rgba(0, 45, 79, 0.6)`, formatted `n.toLocaleString('en-US') + ' m'` (so "1,234 m"); label "Distance" above it in Inter 500 11 px silver at 85 percent, letter-spacing 0.04 em.
- Top center `#runner-coins`: an aqua disc 14 px (a CSS circle `#75CCD0` with a 2 px `#F8F6F0` ring; gold `#F6D463` while `multiplier` is 2) followed by the coin count in Kanit 600 24 px white; on `coinPulse > 0` the counter scales 1.2 to 1.0 over 120 ms.
- Top right `#runner-best`: "Best 2,310 m" in Inter 500 13 px silver; when `newBest` is true during a run, "New best" in salmon replaces the label with a 0.3 s fade.
- Under the distance, `#runner-power`: a pill 180 x 26 px, navy at 0.85, radius 13 px, with the kind label ("Magnet", "Double coins", "Jet") in Inter 600 12 px white on the left and a 90 x 6 px aqua bar on the right whose width is `remaining / duration`; hidden when `powerUp` is null. Below it `#runner-shield`: a pill "Shield" with a 1.5 px aqua border and no fill, hidden when `shield` is false. Below that `#runner-mult`: a gold "2x" chip, hidden unless `multiplier` is 2.
- Bottom, `#runner-warn`: three lane slots 80 x 44 px centered in a row at 14 percent from the bottom; the slot for `warning` shows a salmon chevron (CSS triangle 28 px wide, pointing down) over the word "Train" in Inter 700 12 px white, blinking at 4 Hz (`opacity` 1 and 0.25); the others are empty.
- `#runner-flash`: a full-stage overlay, `background rgba(231, 112, 111, 0.35)`, opacity set to 1 on `hitFlash` and faded to 0 over 0.4 s with a CSS transition.
- Speed is not shown; `hud().speed` is for `_debug` and tests.

`#runner-center` (centered over the stage, `pointer-events none` except on the summary card).
- Countdown: one number at a time in Kanit 700 120 px white with `text-shadow 0 4px 18px rgba(0, 45, 79, 0.7)`; each digit scales 1.3 to 1.0 and fades in over the first 0.25 s of its 0.8 s step; "Go" in Kanit 700 72 px aqua for 0.5 s after the state becomes `running`.
- Game over card (shown 0.8 s after death): 320 px wide, navy at 0.94, radius 14 px, padding 20 px 24 px, silver 1 px inner border at 0.2.
  - Title "Game over" Kanit 600 28 px white; a salmon "New best" badge (Inter 700 11 px, pill) to its right when the run set a new best.
  - Four rows, label Inter 500 13 px silver at 85 percent left, value Kanit 600 20 px white right: "Distance" `1,234 m`, "Coins" `57`, "Best" `2,310 m`, "Lifetime" `12,480 m`.
  - Buttons line in Inter 600 13 px white with key caps (a 20 px square, silver border, radius 4 px): `R  Run again` and `E  Back to town`, 24 px apart.
  - Card enters with opacity 0 to 1 and translateY 8 px to 0 over 200 ms.
- Walk legend addition (in the existing legend, `js/ui.js`): `Subway: A D lanes, W jump, S duck`.

## Scoring and storage

- `distance = round(unitsTraveled * 1.5)` in meters; `unitsTraveled` accrues `v * dt` while `running`. Monotonic: it never decreases, and the countdown and death scroll do not count.
- `coins` for the run counts collected coins at their value (1, or 2 under double).
- `best = max(storedBest, distance)` evaluated at the end of the run; `newBest = distance > storedBest` and `storedBest` is read once at `start`.
- `lifetime = storedLifetime + distance`, `coinsLifetime = storedCoins + coins`.
- When the run ends by death: write storage, return `{ type: 'gameover', distance, coins, best, lifetime }` once; `hud()` keeps reporting the final numbers in `dead`.
- When the run ends by quit while `running`: credit the partial run the same way (storage written), return `{ type: 'quit' }`; the summary is not shown. Quit in `ready` or `dead` writes nothing new.
- Storage key `threadtown.subway.v1`, value `{ best, lifetime, coins }` passed to `ctx.storage.set` as a plain object (the renderer's storage wrapper does the JSON; a `Map` works for tests). On read, each field is coerced with `Number` and replaced by 0 when not finite or negative; a missing record reads as `{ best: 0, lifetime: 0, coins: 0 }`.
- `restart` (in `dead`) calls the same path as `start(spec)` with the next `runCount`, so the stored best read at the previous start is refreshed and the pattern stream reseeds.
- No allocation after `start`: pools, the fake agent, the row array (preallocated to 32 entries, reused in place), scratch vectors and the `hud()` object are created once; `hud()` mutates and returns the same object.
