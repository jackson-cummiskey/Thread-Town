# Thread Town zoo design

The creative brief for version 3: low-poly animal characters and the Risk zoo. `docs/CONTRACT_V3.md` wins over anything here, `docs/CONTRACT_V2.md` and `docs/CONTRACT.md` fill in what v3 does not mention, and `docs/ART_DIRECTION.md` holds the palette, lighting and material values. All distances are world units (1 tile = 1 unit), angles in radians, time in seconds, colors sRGB hex. Character dimensions are LOCAL units before the renderer's 1.3 scale (`ALIEN_SCALE` in `js/render3d.js`), exactly as the aliens are authored: feet at y 0, facing +z at `rotation.y = 0`.

## Principles

1. Same family as the aliens. An animal is a chibi: one big rounded body volume, a head that is 40 to 55 percent of the body height, short limbs, white-sclera eyes with dark pupils and a white highlight bead, a tiny mouth. Spheres 24 x 16, capsules 8 cap segments by 16 radial, `RoundedBoxGeometry` with 3 segments. No flat shading except the boulders in the zoo. Every mesh casts shadows, nothing on the character receives them, the ring and highlights cast none.
2. Heights. Standing height before scale is 0.75 to 1.5 (the giraffe may reach 1.9). Width 0.45 to 0.75 for bipeds and birds; quadrupeds may run 0.9 to 1.3 long nose to tail but stay under 0.6 wide so two can pass on a 2 wide road. `ANIMAL_HEIGHT = 0.9` is the typical height the renderer uses for tags and the portrait frame; `handle.portraitScale = min(1, 0.95 / height)` rounded to 0.05 so tall species fit the 96 by 120 portrait.
3. One department-color accessory per animal, in `colorHex` (the renderer passes `dept.alien || dept.accent`, so Risk agents wear `#E07E42` and the zoo residents built with `dept.accent` wear `#C05E2C`). Three shapes, chosen per species below:
   - Collar `C(r, y, z, rx)`: torus r, tube 0.03, centered (0, y, z), rotated rx so it rings the neck, plus a brass tag sphere r 0.03 `#F6D463` hanging 0.04 below the front of the ring.
   - Bandana `B(r, y, z, rx)`: the same torus with tube 0.025 plus a rounded box 0.18 x 0.18 x 0.02 (radius 0.02) rotated rz pi / 4 whose top corner is tucked into the ring at the front so a triangle hangs on the chest, and a knot sphere r 0.035 at the back.
   - Scarf `S(r, y, z, rx)`: torus tube 0.045 plus a hanging tail box 0.08 x 0.24 x 0.04 (radius 0.015) from the front-left of the ring; the tail swings rz 0.10 sin(2 pi 0.8 t) while walking.
   Accessory material: `MeshStandardMaterial` roughness 0.6, no metalness, shared per hex through the module cache.
4. Eye kit `E(r)` at a position (x, y, z) relative to the head pivot: white sphere r (roughness 0.25, envMapIntensity 0.6), pupil sphere 0.55 r at +0.75 r along the eye's outward normal (toward +z for a front-facing eye) in `#1B2A3A`, highlight sphere 0.2 r (`MeshBasicMaterial` white) on the pupil surface in direction (-0.02, 0.022, 0.03), lid half sphere r + 0.005 in the head color, hidden except during a blink. Default r 0.07; prey and birds get bigger eyes (0.08 to 0.09), predators 0.05 to 0.07. Eyes always sit on the front hemisphere of the head so the +z camera sees both whites. `parts.eyes`, `parts.pupils`, `parts.lids` list them; `parts.antennae` is an empty array.
5. Natural colors only on the body (listed per species), the department color only on the accessory. Nose and claw dark `#2A1E1A`, inner ear pink `#F2B8B5`, teeth and tusks `#F6F1E4`, beak and bird feet amber `#E0A23A`. Body materials roughness 0.6, metalness 0, envMapIntensity 0.25, shared per hex, registered in `ANIMAL_MATERIALS` so the renderer can drive `envMapIntensity` by night the way it does for aliens. `setAnimalOpacity` clones a shared material the first time a handle fades (`userData.ownedBy = handle.uid`), exactly as `aliens3d.js` does.
6. Rigs. Three builds, one rig each, so every pose is written once per build:
   - Quadruped: `group > rig > torso > [body, headGroup, armL, armR, tail]` and `rig > [legL, legR]`. The torso pivot is the hind hip line `P = (0, hipY, hindZ)`; all torso children are authored in character space and the builder subtracts P. `torso.rotation.x` negative rears the front up around the hips (sit, wave, cheer, lever, balance, climb); hind legs stay planted. Front legs are `armL` and `armR` with the pivot at (±legX, hipY, frontZ); hind legs at (±legX, hipY, hindZ). Leg: capsule r = legR, length hipY - 2 legR, centered (0, -hipY / 2, 0) under its pivot; paw sphere 1.15 legR scaled (1, 0.6, 1.3) at (0, -hipY + 0.6 legR, 0.03); `hand` Object3D at (0, -hipY + 0.05, legR + 0.02), so in character space the hands sit at (±legX, 0.05, frontZ + legR + 0.02). Quadruped shorthand in the recipes: `Q body (rx, ry, rz) at cy, hip hipY, legR, legX, front frontZ, hind hindZ`.
   - Biped: the alien rig: `rig > torso (origin 0) > [body, headGroup, armL, armR, tail]`, `rig > [legL, legR]`. Arm: pivot (±sx, sy, sz), capsule(r, len) centered (0, -(len / 2 + r), 0), hand sphere 1.1 r at the tip, `hand` Object3D at (0, -(len + 2 r), 0). Leg: pivot (±lx, hipY, lz), capsule, foot.
   - Bird: biped rig with wings for arms: wing = sphere scaled (0.05, wl, wd) centered (0, -wl, 0) under the pivot, `hand` at the wing tip (0, -2 wl, 0.02); legs are thin cylinders with a flat foot box; a beak group on the head.
   The head pivot (`headGroup`) sits at the neck base N given per species; eyes, muzzle, ears, beak, horns and the neck itself are children of it, so one rotation nods or turns the whole head. `parts.head` is the main head sphere, `parts.body` the main body mesh.
7. Pose state lives on `handle.poseState` as a Float32Array of channels blended over 0.3 s (same scheme as `aliens3d.js`: `from`, `cur`, `target`, smoothstep weight), plus per-handle scratch for twitch, sip, look and hop. Module-scope scratch vectors only; nothing allocates per frame. Yaw rules are the alien rules: face `moveDir` while walking, swimming, diving, climbing, pushing; `wave` faces +z; the renderer owns yaw while working or whenever it has set `group.rotation.y`.
8. Selection ring: `RingGeometry(0.36, 0.44, 48)` at y 0.015, rotated -pi / 2 about x, `MeshBasicMaterial #75CCD0` transparent opacity 0.85 depthWrite false, hidden by default, material owned by the handle. Same size as the alien ring so hover and selection read the same.
9. `seatY` is the body drop for `sit` in local units (the renderer multiplies by its group scale): for bipeds and birds it is the body's lowest point plus 0.03 (the alien rule); for quadrupeds it is the drop that puts the folded hind legs on the seat, listed per species (0.03 to 0.14).
10. Handle shape (from the contract): `{ kind: 'animal', species, seed, color, group, traits: { species, build }, parts: { body, head, eyes, pupils, lids, antennae: [], armL, armR, legL, legR, handL, handR, ring, seatY }, poseState, swingPhase: 0, sipPhase: null, portraitScale }`. `group.userData.kind = 'animal'`, `group.userData.handle = handle`. Geometries are cached per species in a module map; materials per hex.
11. Sentence case, no em dashes, no external assets. Everything is primitives from `js/depts/common.js` plus `SphereGeometry`, `CapsuleGeometry`, `RoundedBoxGeometry`, `TubeGeometry`.

## Species recipes

Positions are character space (x right, y up, z toward the face), feet at y 0. `M` is the mouth point used by `sit` to bring the prop paw, wing or hand to the mouth. Every recipe ends with where `handL` and `handR` sit at rest, `seatY`, and `portraitScale`.

### Lion

Quadruped, height 1.01 (mane top). Colors: body `#E0B36A`, mane and tail tuft `#A8632C`, muzzle and belly `#F3DDB0`.
`Q body (0.26, 0.24, 0.40) at 0.46, hip 0.40, legR 0.07, legX 0.14, front 0.22, hind -0.30`.
1. Body sphere scaled (0.26, 0.24, 0.40) at (0, 0.46, -0.05); belly flattened sphere r 0.16 scaled (1, 0.8, 0.5) `#F3DDB0` at (0, 0.34, 0.10).
2. Neck base N (0, 0.62, 0.22). Head sphere r 0.24 at (0, 0.72, 0.30).
3. Mane: sphere r 0.27 scaled (1, 1, 0.75) `#A8632C` at (0, 0.74, 0.20) behind the face, plus a torus r 0.24 tube 0.12 `#A8632C` at (0, 0.72, 0.24) facing +z (no rotation) framing the face.
4. Ears: 2 spheres r 0.06 body color at (±0.15, 0.92, 0.26) with inner spheres r 0.035 pink at z +0.03.
5. Muzzle sphere r 0.11 scaled (1.2, 0.8, 0.9) `#F3DDB0` at (0, 0.66, 0.50); nose sphere r 0.04 `#2A1E1A` at (0, 0.71, 0.58); mouth rounded box 0.08 x 0.02 x 0.02 `#A8632C` at (0, 0.62, 0.57). M = (0, 0.63, 0.58).
6. Eyes E(0.07) at (±0.10, 0.78, 0.49).
7. Tail capsule r 0.025 length 0.35 from (0, 0.52, -0.42) rotated rx -0.6 (back and up); tuft sphere r 0.05 `#A8632C` at its tip.
8. Accessory: bandana B(0.20, 0.52, 0.34, 0.5) under the mane on the chest.
Hands: (±0.14, 0.05, 0.31). Sit reach: head pitch 0.25, armR x -2.0, z -0.55. seatY 0.10. portraitScale 0.95.

### Tiger

Quadruped, height 0.94 (ear tips). Colors: body `#E58A3C`, stripes `#2B2420`, belly and muzzle `#F6E6CF`, nose `#E39AA0`.
`Q body (0.25, 0.23, 0.40) at 0.45, hip 0.40, legR 0.07, legX 0.14, front 0.22, hind -0.30`.
1. Body sphere at (0, 0.45, -0.05); belly flattened sphere r 0.15 scaled (1, 0.8, 0.5) at (0, 0.34, 0.10).
2. N (0, 0.60, 0.24). Head sphere r 0.21 at (0, 0.70, 0.32).
3. Ears: spheres r 0.06 at (±0.14, 0.88, 0.28), inner pink r 0.035.
4. Muzzle sphere r 0.10 scaled (1.25, 0.75, 0.9) `#F6E6CF` at (0, 0.64, 0.49); nose sphere r 0.035 `#E39AA0` at (0, 0.69, 0.56); mouth box 0.08 x 0.02 x 0.02 `#2B2420` at (0, 0.60, 0.55). M = (0, 0.61, 0.56).
5. Eyes E(0.065) at (±0.09, 0.75, 0.48).
6. Stripes: 5 toruses r 0.26 tube 0.025 `#2B2420` at z -0.28, -0.14, 0.00, 0.14, 0.26 around the body (centered (0, 0.45, z), no rotation, scaled (0.95, 0.90, 1) so they bed into the surface), 2 forehead boxes 0.04 x 0.12 x 0.02 at (±0.06, 0.86, 0.46) rz ±0.3, 3 tail rings torus r 0.03 tube 0.012.
7. Tail capsule r 0.025 length 0.36 from (0, 0.50, -0.42) rx -0.4.
8. Accessory: collar C(0.17, 0.56, 0.24, 0.4).
Hands: (±0.14, 0.05, 0.31). Sit reach: head pitch 0.25, armR x -2.0, z -0.55. seatY 0.10. portraitScale 1.

### Elephant

Quadruped, height 1.28 (head top). Colors: body `#9FA7B3`, ear inner and trunk tip `#C9B3B8`, toenails `#E8E4DC`.
`Q body (0.36, 0.34, 0.44) at 0.60, hip 0.46, legR 0.10, legX 0.20, front 0.24, hind -0.26`.
1. Body sphere at (0, 0.60, -0.02).
2. N (0, 0.80, 0.26). Head sphere r 0.32 at (0, 0.96, 0.36).
3. Ears: pivots at (±0.26, 0.98, 0.30) rotated ry ±0.25 so they flare; each holds a sphere scaled (0.07, 0.28, 0.24) at local x ±0.05 (world x about ±0.31) and an inner flattened sphere scaled (0.03, 0.20, 0.17) pink at local x ±0.08 (world x about ±0.34) facing forward. The ears end inside the body plus legs so the elephant stays within the quadruped width budget.
4. Trunk: three capsules chained down the face: r 0.075 length 0.16 from (0, 0.82, 0.64) rx 0.35; r 0.06 length 0.16 from its end (about (0, 0.60, 0.72)) rx 0.15; r 0.05 length 0.14 from (0, 0.40, 0.74) rx -0.35 so the tip curls forward to about (0, 0.26, 0.70). Tip sphere r 0.05 `#C9B3B8`. The trunk is a child of the head pivot; `walk` swings it rx ±0.12.
5. Tusks: 2 cones r 0.035 h 0.22 `#F6F1E4` at (±0.15, 0.74, 0.58) rotated rx 1.2 (pointing forward and down).
6. Eyes E(0.06) at (±0.13, 1.02, 0.63).
7. Tail capsule r 0.02 length 0.30 from (0, 0.70, -0.46) rx 0.2 with a tuft sphere r 0.04 `#5E4538`.
8. Toenails: 3 small spheres r 0.025 `#E8E4DC` on the front of each paw.
9. Accessory: collar C(0.30, 0.78, 0.26, 0.4) in the fold between head and body.
Hands: (±0.20, 0.05, 0.36). Sit reach: head pitch 0.5 (head center drops to about (0, 0.78, 0.52)), armR x -1.3, z -0.5; the trunk also curls to the mouth. seatY 0.14. portraitScale 0.75.

### Giraffe

Quadruped, height 1.90 (ossicone tips). Colors: body `#E9B55C`, patches `#A5652A`, belly and muzzle `#F6E3BC`, mane and tail tuft `#7A4A24`, ossicone tips `#5A3B22`.
`Q body (0.22, 0.22, 0.34) at 0.70, hip 0.62, legR 0.055, legX 0.13, front 0.20, hind -0.22`.
1. Body sphere at (0, 0.70, 0.0).
2. N (0, 0.80, 0.22). Neck capsule r 0.10 length 0.70 centered 0.45 above N along a line tilted rx -0.25 (leaning forward), top at about (0, 1.50, 0.40). Mane: 6 boxes 0.03 x 0.08 x 0.07 `#7A4A24` along the back of the neck every 0.12.
3. Head sphere r 0.15 scaled (1, 0.9, 1.3) at (0, 1.62, 0.46); muzzle sphere r 0.08 scaled (1.1, 0.8, 1) `#F6E3BC` at (0, 1.56, 0.64); nostrils 2 spheres r 0.015 `#2A1E1A`. M = (0, 1.52, 0.68).
4. Ossicones: 2 cylinders r 0.02 h 0.14 at (±0.06, 1.74, 0.42) with tip spheres r 0.035 `#5A3B22` (tips at 1.90).
5. Ears: spheres scaled (0.05, 0.10, 0.12) at (±0.15, 1.68, 0.40) rz ±0.5.
6. Eyes E(0.055) at (±0.09, 1.66, 0.58), long lashes optional as 2 tiny dark boxes.
7. Patches: 7 flattened spheres r 0.08 scaled (1, 1, 0.3) `#A5652A` bedded on the body (seeded, back and sides only) and 3 r 0.05 on the neck.
8. Tail capsule r 0.018 length 0.40 from (0, 0.76, -0.36) rx 0.1 with tuft sphere r 0.04.
9. Accessory: collar C(0.12, 1.30, 0.34, -0.25) matching the neck tilt.
Hands: (±0.13, 0.05, 0.275). Sit: the neck pitches forward 1.1 (head drops to about (0, 0.98, 1.02)) and armR rises x -1.6, z -0.4 so the hoof meets the muzzle within 0.5 of the head center; `lookUp` uses the neck (-0.35) rather than the head. seatY 0.12. portraitScale 0.50.

### Zebra

Quadruped, height 1.10 (ear tips). Colors: body `#F3F1EC`, stripes, mane and tail tuft `#1E1E22`, muzzle `#4A4347`.
`Q body (0.24, 0.23, 0.40) at 0.50, hip 0.44, legR 0.06, legX 0.13, front 0.22, hind -0.28`.
1. Body sphere at (0, 0.50, -0.04).
2. N (0, 0.62, 0.26). Neck capsule r 0.11 length 0.22 tilted rx -0.6 to the head sphere r 0.16 scaled (1, 0.9, 1.35) at (0, 0.86, 0.44).
3. Muzzle sphere r 0.09 `#4A4347` at (0, 0.80, 0.62). M = (0, 0.78, 0.70).
4. Ears cones r 0.04 h 0.10 at (±0.09, 1.00, 0.38).
5. Mane box 0.04 x 0.10 x 0.30 `#1E1E22` on top of the neck from N to the head.
6. Stripes: 6 toruses r 0.25 tube 0.022 `#1E1E22` at z -0.32 to 0.18 step 0.10 around the body (scaled (0.96, 0.92, 1)), 3 toruses r 0.12 tube 0.02 around the neck, 2 toruses r 0.065 tube 0.015 on each leg at -0.14 and -0.26 below the pivot.
7. Eyes E(0.06) at (±0.10, 0.90, 0.56).
8. Tail capsule r 0.02 length 0.32 from (0, 0.54, -0.44) rx 0.1 with tuft sphere r 0.045.
9. Accessory: bandana B(0.13, 0.62, 0.34, -0.5).
Hands: (±0.13, 0.05, 0.30). Sit reach: head pitch 0.35, armR x -1.9, z -0.5. seatY 0.11. portraitScale 0.85.

### Hippo

Quadruped, height 0.86. Colors: body `#8E8FB0`, belly, muzzle and ear inner `#D8A6B8`, nostrils `#4B4A66`.
`Q body (0.34, 0.28, 0.44) at 0.40, hip 0.30, legR 0.09, legX 0.20, front 0.24, hind -0.26`.
1. Body sphere at (0, 0.40, -0.04); belly flattened sphere r 0.22 scaled (1, 0.6, 0.6) `#D8A6B8` at (0, 0.26, 0.10).
2. N (0, 0.52, 0.30). Cranium sphere r 0.22 at (0, 0.64, 0.36); muzzle sphere r 0.24 scaled (1.15, 0.8, 1.2) at (0, 0.52, 0.52).
3. Eye bumps: spheres r 0.07 body color at (±0.12, 0.76, 0.46) with eyes E(0.055) at (±0.12, 0.79, 0.50).
4. Ears spheres r 0.045 at (±0.16, 0.84, 0.36), inner pink.
5. Nostrils 2 spheres r 0.03 `#4B4A66` at (±0.07, 0.62, 0.79); lower lip box 0.30 x 0.05 x 0.06 `#D8A6B8` at (0, 0.36, 0.70); 2 teeth boxes 0.04 x 0.07 x 0.03 `#F6F1E4` at (±0.10, 0.40, 0.72). M = (0, 0.44, 0.76).
6. Tail stub capsule r 0.03 length 0.10 at (0, 0.44, -0.48).
7. Accessory: scarf S(0.26, 0.56, 0.26, 0.35).
Hands: (±0.20, 0.05, 0.35). Sit reach: head pitch 0.2, armR x -1.6, z -0.5. seatY 0.08. portraitScale 1.

### Bear

Biped, height 1.22. Colors: body `#7A5236`, muzzle and belly `#C79A6B`.
1. Body sphere scaled (0.32, 0.38, 0.30) at (0, 0.52, 0) (bottom 0.14, top 0.90); belly flattened sphere r 0.17 scaled (1, 1.2, 0.3) `#C79A6B` at (0, 0.50, 0.28).
2. N (0, 0.84, 0.02). Head sphere r 0.24 at (0, 0.98, 0.04).
3. Ears spheres r 0.07 at (±0.17, 1.17, 0.0), inner r 0.04 pink at z +0.03.
4. Muzzle sphere r 0.11 scaled (1.1, 0.85, 1) `#C79A6B` at (0, 0.92, 0.24); nose sphere r 0.045 `#2A1E1A` at (0, 0.96, 0.33); mouth box 0.07 x 0.02 x 0.02 at (0, 0.88, 0.32). M = (0, 0.89, 0.34).
5. Eyes E(0.065) at (±0.09, 1.04, 0.21).
6. Arms: pivot (±0.30, 0.78, 0.02), capsule r 0.08 length 0.22, rest rz ±0.12 (hanging close to the body for the width budget), hand at (0, -0.38, 0) with 3 claw spheres r 0.015.
7. Legs: pivot (±0.14, 0.22, 0), capsule r 0.09 length 0.06; paw sphere r 0.10 scaled (1, 0.55, 1.3) at y 0.055, z 0.04.
8. Tail puff sphere r 0.05 at (0, 0.30, -0.30).
9. Accessory: scarf S(0.20, 0.82, 0.02, 0).
Hands at rest: (±0.35, 0.40, 0.02). seatY 0.17. portraitScale 0.80.

### Panda

Biped, height 1.06. Colors: body and head `#F4F2EC`, limbs, ears, eye patches and shoulder band `#1E1E22`.
1. Body sphere scaled (0.30, 0.33, 0.28) at (0, 0.44, 0) (bottom 0.11); shoulder band sphere scaled (0.31, 0.12, 0.29) `#1E1E22` at (0, 0.66, 0).
2. N (0, 0.72, 0.02). Head sphere r 0.22 at (0, 0.84, 0.04).
3. Ears spheres r 0.07 `#1E1E22` at (±0.16, 1.00, 0.0).
4. Eye patches: spheres r 0.075 scaled (1, 1.3, 0.4) `#1E1E22` at (±0.09, 0.88, 0.20) rz ±0.4; eyes E(0.05) at (±0.09, 0.88, 0.235).
5. Nose sphere r 0.035 `#1E1E22` at (0, 0.80, 0.25); mouth box 0.06 x 0.015 x 0.02 at (0, 0.75, 0.24). M = (0, 0.76, 0.26).
6. Arms: pivot (±0.28, 0.66, 0.02), capsule r 0.075 length 0.20 `#1E1E22`, rest rz ±0.25, hand at (0, -0.35, 0).
7. Legs: pivot (±0.13, 0.20, 0), capsule r 0.085 length 0.05 `#1E1E22`, paw sphere r 0.09 scaled (1, 0.55, 1.3).
8. Accessory: bandana B(0.19, 0.74, 0.16, 0.6).
Hands at rest: (±0.31, 0.32, 0.02). seatY 0.14. portraitScale 0.90.

### Fox

Quadruped, height 0.84 (ear tips). Colors: body `#E2742F`, chest, muzzle and tail tip `#F6EFE3`, lower legs and ear backs `#2B2420`.
`Q body (0.18, 0.17, 0.30) at 0.38, hip 0.32, legR 0.045, legX 0.10, front 0.16, hind -0.22`.
1. Body sphere at (0, 0.38, -0.04); chest bib sphere scaled (0.10, 0.12, 0.06) `#F6EFE3` at (0, 0.40, 0.26). Lower half of each leg capsule tinted dark: a second capsule r 0.048 length 0.10 `#2B2420` over the lower part.
2. N (0, 0.50, 0.22). Head sphere r 0.15 at (0, 0.58, 0.28).
3. Muzzle cone r 0.07 h 0.16 rotated rx pi / 2 (tip toward +z) base at (0, 0.54, 0.38) `#F6EFE3`; nose sphere r 0.03 `#2A1E1A` at the tip (0, 0.54, 0.55). M = (0, 0.52, 0.55).
4. Ears cones r 0.05 h 0.14 at (±0.08, 0.70, 0.24) (tips 0.84), inner pink flattened cones r 0.03 h 0.09 at z +0.015, backs dark.
5. Eyes E(0.05) at (±0.07, 0.62, 0.40).
6. Tail capsule r 0.07 length 0.26 from (0, 0.40, -0.32) rotated rx -0.9 (up and back); tip sphere r 0.07 `#F6EFE3`.
7. Accessory: collar C(0.11, 0.50, 0.24, 0.3).
Hands: (±0.10, 0.05, 0.225). Sit reach: head pitch 0.3, armR x -2.1, z -0.5. seatY 0.09. portraitScale 1.

### Wolf

Quadruped, height 0.93 (ear tips). Colors: body `#8A8F9A`, belly, muzzle and tail tip `#D6D9DF`, nose `#2B2420`.
`Q body (0.22, 0.20, 0.36) at 0.42, hip 0.36, legR 0.055, legX 0.12, front 0.20, hind -0.26`.
1. Body sphere at (0, 0.42, -0.04); belly flattened sphere r 0.14 scaled (1, 0.8, 0.5) at (0, 0.30, 0.08).
2. N (0, 0.56, 0.26). Head sphere r 0.17 at (0, 0.64, 0.30).
3. Muzzle rounded box 0.14 x 0.11 x 0.18 (radius 0.04) `#D6D9DF` at (0, 0.56, 0.44); nose sphere r 0.035 at (0, 0.61, 0.56); mouth box 0.08 x 0.02 x 0.02 at (0, 0.53, 0.54). M = (0, 0.54, 0.56).
4. Ears cones r 0.05 h 0.13 at (±0.09, 0.78, 0.26), inner pink.
5. Eyes E(0.055) at (±0.08, 0.68, 0.42); brow ridges 2 boxes 0.07 x 0.02 x 0.03 body color above them.
6. Tail capsule r 0.055 length 0.30 from (0, 0.44, -0.40) rx -0.5, tip sphere r 0.05 `#D6D9DF`.
7. Accessory: bandana B(0.14, 0.54, 0.30, 0.3).
Hands: (±0.12, 0.05, 0.275). Sit reach: head pitch 0.3, armR x -2.0, z -0.5. seatY 0.10. portraitScale 1.

### Monkey

Biped, height 0.95. Colors: body `#8B5A3C`, face, ears, belly, hands and feet `#E9C9A3`.
1. Body sphere scaled (0.20, 0.24, 0.18) at (0, 0.46, 0) (bottom 0.22); belly flattened sphere r 0.12 scaled (1, 1.1, 0.3) at (0, 0.44, 0.16).
2. N (0, 0.66, 0.02). Head sphere r 0.17 at (0, 0.78, 0.02).
3. Face sphere r 0.12 scaled (1.15, 1, 0.6) `#E9C9A3` at (0, 0.75, 0.13); nostrils 2 spheres r 0.012 at (±0.02, 0.73, 0.21); mouth box 0.08 x 0.015 x 0.02 at (0, 0.69, 0.20). M = (0, 0.70, 0.22).
4. Ears spheres r 0.06 scaled (0.5, 1, 1) `#E9C9A3` at (±0.19, 0.80, 0.0).
5. Eyes E(0.05) at (±0.06, 0.80, 0.19).
6. Arms: pivot (±0.19, 0.62, 0), capsule r 0.045 length 0.30, rest rz ±0.2, hand sphere r 0.05 `#E9C9A3`, hand at (0, -0.42, 0).
7. Legs: pivot (±0.09, 0.24, 0), capsule r 0.05 length 0.12, foot box 0.08 x 0.04 x 0.16 (radius 0.015) `#E9C9A3`.
8. Tail: `TubeGeometry` r 0.025, 12 segments, on a CatmullRom through (0, 0.34, -0.14), (0, 0.20, -0.32), (0, 0.42, -0.42), (0, 0.60, -0.34) (a curl); `stand` rocks it rz ±0.1 at 0.6 Hz.
9. Accessory: collar C(0.12, 0.64, 0.02, 0).
Hands at rest: (±0.21, 0.20, 0). seatY 0.25. portraitScale 1.

### Penguin

Bird, height 0.88. Colors: back, head and wings `#1F2A3A`, belly and cheek patches `#F6F6F2`, beak and feet `#F2A33A`.
1. Body capsule r 0.21 length 0.16 at center (0, 0.40, 0) (bottom 0.11, top 0.69); belly flattened sphere scaled (0.17, 0.30, 0.10) `#F6F6F2` at (0, 0.40, 0.14).
2. N (0, 0.62, 0.02). Head sphere r 0.16 at (0, 0.72, 0.02).
3. Cheek patches: 2 flattened spheres r 0.07 scaled (1, 1.2, 0.3) `#F6F6F2` at (±0.08, 0.74, 0.14).
4. Beak cone r 0.04 h 0.12 `#F2A33A` rotated rx pi / 2, base at (0, 0.70, 0.15) (tip at z 0.27). M = (0, 0.69, 0.26).
5. Eyes E(0.05) at (±0.07, 0.77, 0.14).
6. Wings: pivot (±0.20, 0.56, 0), sphere scaled (0.05, 0.20, 0.10) centered (0, -0.20, 0), rest rz ±0.15, hand at (0, -0.40, 0.03).
7. Feet: pivots (±0.08, 0.10, 0.0); each a rounded box 0.12 x 0.04 x 0.16 (radius 0.02) `#F2A33A` with its top at y 0.04, centered z +0.06.
8. Tail cone r 0.05 h 0.10 at (0, 0.22, -0.20) rx -1.2.
9. Accessory: scarf S(0.17, 0.60, 0.02, 0).
Hands at rest: (±0.23, 0.17, 0.03). seatY 0.14. portraitScale 1.

### Flamingo

Bird, height 1.50. Colors: body `#F58CA6`, legs and beak base `#F6D7C3` to `#F2A3B0`, beak tip `#1E1E22`, wing tips `#E05A7A`.
1. Legs: pivots (±0.06, 0.62, -0.02); each a cylinder r 0.015 h 0.62 `#F2A3B0` with a knee sphere r 0.025 at 0.28 below the pivot and a foot box 0.12 x 0.02 x 0.14 at y 0. `stand` tucks legR (rotation x 1.5, foot hidden under the body) and stands on legL; `walk` uses both.
2. Body sphere scaled (0.16, 0.14, 0.22) at (0, 0.74, -0.02) (bottom 0.60); tail: 3 cones r 0.03 h 0.10 `#E05A7A` at (0, 0.78, -0.24) fanned rx -0.9, rz ±0.3.
3. N (0, 0.84, 0.12). Lower neck capsule r 0.045 length 0.30 tilted rx -0.3 (top about (0, 1.22, 0.24)); upper neck capsule r 0.04 length 0.14 vertical from there.
4. Head sphere r 0.10 at (0, 1.40, 0.24) (top 1.50).
5. Beak: cone r 0.035 h 0.09 `#F6D7C3` base at (0, 1.37, 0.32) rotated rx 2.2 (forward and down), then a black cone r 0.03 h 0.08 continuing from its tip bent further down (rx 2.7). M = (0, 1.30, 0.38).
6. Eyes E(0.035) at (±0.055, 1.42, 0.31).
7. Wings: pivot (±0.15, 0.80, -0.02), sphere scaled (0.04, 0.12, 0.18) centered (0, -0.12, 0), rest rz ±0.2, tip tinted `#E05A7A` (a second smaller sphere), hand at (0, -0.24, 0.02).
8. Accessory: collar C(0.055, 1.28, 0.26, 0) ringing the neck where the upper capsule starts.
Hands at rest: (±0.18, 0.56, 0). seatY 0.50 (legs fold rotation x 1.5 so the body rests on the seat). portraitScale 0.60.

### Owl

Bird, height 0.86 (ear tufts). Colors: body `#8C6A4B`, facial discs and belly `#D9C3A0`, belly chevrons `#6B4E35`, beak and feet `#E0A23A`.
1. Body sphere scaled (0.22, 0.26, 0.20) at (0, 0.40, 0) (bottom 0.14); belly flattened sphere scaled (0.15, 0.20, 0.08) `#D9C3A0` at (0, 0.38, 0.17) with 6 chevron boxes 0.05 x 0.02 x 0.01 `#6B4E35` in two columns.
2. N (0, 0.52, 0.02). Head sphere r 0.20 scaled (1.1, 0.9, 1) at (0, 0.60, 0.02) (top 0.78).
3. Facial discs: 2 flattened spheres r 0.11 scaled (1, 1, 0.35) `#D9C3A0` at (±0.09, 0.62, 0.18).
4. Eyes E(0.085) at (±0.09, 0.62, 0.21), pupils r 0.05.
5. Beak cone r 0.03 h 0.08 `#E0A23A` base at (0, 0.57, 0.22) rotated rx 2.4. M = (0, 0.54, 0.26).
6. Ear tufts: cones r 0.04 h 0.10 at (±0.14, 0.76, 0.0) rz ±0.3 (tips 0.86).
7. Wings: pivot (±0.22, 0.52, 0), sphere scaled (0.05, 0.18, 0.14) centered (0, -0.18, 0), rest rz ±0.1, hand at (0, -0.36, 0.03).
8. Feet: pivots (±0.07, 0.12, 0.0); box 0.08 x 0.03 x 0.10 `#E0A23A` at y 0 with 3 toe spheres r 0.015.
9. Accessory: bandana B(0.16, 0.50, 0.15, 0.7).
Hands at rest: (±0.24, 0.16, 0.03). seatY 0.17. portraitScale 1. Head turn range ±0.9 on `lookAt` (the owl signature).

### Falcon

Bird, height 0.84. Colors: back, head and wings `#5C6B7A`, belly `#EEE6D4` with speckles `#5C6B7A`, moustache marks `#2B3440`, beak, eye rings and feet `#E0A23A`, tail `#4A5866`.
1. Body sphere scaled (0.16, 0.22, 0.18) at (0, 0.42, 0) (bottom 0.20); belly flattened sphere scaled (0.11, 0.17, 0.07) `#EEE6D4` at (0, 0.40, 0.14) with 4 speckle spheres r 0.012.
2. N (0, 0.60, 0.02). Head sphere r 0.14 at (0, 0.70, 0.04).
3. Moustache marks: 2 boxes 0.03 x 0.10 x 0.02 `#2B3440` at (±0.08, 0.64, 0.14).
4. Beak cone r 0.035 h 0.10 `#E0A23A` base at (0, 0.69, 0.16) rotated rx 1.9, hook tip sphere r 0.02 `#2B3440`. M = (0, 0.66, 0.25).
5. Eyes E(0.045) at (±0.065, 0.72, 0.15) with eye-ring toruses r 0.05 tube 0.01 `#E0A23A`.
6. Wings: pivot (±0.16, 0.56, 0), sphere scaled (0.05, 0.26, 0.16) centered (0, -0.26, 0), rest rz ±0.12, hand at (0, -0.52, 0.02); 3 primary feather boxes 0.02 x 0.10 x 0.03 at the tip.
7. Tail fan box 0.16 x 0.02 x 0.22 `#4A5866` at (0, 0.26, -0.18) rx 0.4 with 3 light bars.
8. Legs: pivots (±0.06, 0.12, 0.02); cylinder r 0.02 h 0.12 `#E0A23A` with talon box 0.08 x 0.03 x 0.10 at y 0.
9. Accessory: bandana B(0.11, 0.58, 0.04, 0.4).
Hands at rest: (±0.19, 0.04, 0.02). seatY 0.23. portraitScale 1.

### Otter

Biped, height 0.84. Colors: body `#6B4A33`, muzzle, belly and ear inner `#C9A77E`, nose, paws and feet `#2A1E1A`.
1. Body capsule r 0.17 length 0.22 at center (0, 0.42, 0) (bottom 0.14); belly flattened sphere scaled (0.12, 0.22, 0.08) `#C9A77E` at (0, 0.42, 0.13).
2. N (0, 0.60, 0.03). Head sphere r 0.16 scaled (1.1, 0.9, 1) at (0, 0.70, 0.03).
3. Muzzle sphere r 0.09 scaled (1.3, 0.7, 0.9) `#C9A77E` at (0, 0.66, 0.16); nose sphere r 0.035 at (0, 0.69, 0.24); whiskers 4 cylinders r 0.004 h 0.12 at (±0.08, 0.66, 0.22) rz ±1.3; mouth box 0.06 x 0.015 x 0.02 at (0, 0.63, 0.23). M = (0, 0.64, 0.25).
4. Ears spheres r 0.035 at (±0.14, 0.80, 0.0).
5. Eyes E(0.05) at (±0.07, 0.74, 0.15).
6. Arms: pivot (±0.17, 0.56, 0.04), capsule r 0.045 length 0.14, rest rz ±0.3, paw sphere r 0.045 `#2A1E1A`, hand at (0, -0.24, 0.02).
7. Legs: pivot (±0.09, 0.18, 0), capsule r 0.055 length 0.06; webbed foot rounded box 0.11 x 0.03 x 0.14 (radius 0.015) `#2A1E1A` at y 0.
8. Tail capsule r 0.055 length 0.34 from (0, 0.18, -0.14) rotated rx -1.25 (lying back along the ground, tip up), scaled (1, 1, 0.8).
9. Accessory: scarf S(0.13, 0.60, 0.03, 0).
Hands at rest: (±0.18, 0.32, 0.06). seatY 0.17. portraitScale 1. Natural swimmer: `swim` pitch 0.5 instead of 1.2, tail wags rz ±0.4 at 2 Hz.

### Seal

Quadruped build (flippers), height 0.73. Colors: body `#8E9AA8`, belly and muzzle `#D6DDE4`, speckles `#6F7B89`, nose `#2A1E1A`.
1. Body capsule r 0.20 length 0.40 centered (0, 0.28, -0.05) rotated rx (pi / 2 - 0.35) so the front end rises (bottom 0.06 at the rear); 6 speckle spheres r 0.035 scaled (1, 1, 0.3) on the back; belly: a second capsule r 0.17 length 0.36 `#D6DDE4` offset -0.06 in y.
2. N (0, 0.46, 0.26). Head sphere r 0.17 at (0, 0.56, 0.36).
3. Muzzle sphere r 0.08 scaled (1.2, 0.7, 0.9) `#D6DDE4` at (0, 0.52, 0.50); nose sphere r 0.035 at (0, 0.56, 0.57); 4 whiskers r 0.004 h 0.12. M = (0, 0.50, 0.57).
4. Eyes E(0.065) at (±0.07, 0.61, 0.49) (big and dark: pupil 0.65 r).
5. Front flippers (armL, armR): pivots (±0.17, 0.22, 0.18); rounded box 0.08 x 0.03 x 0.22 (radius 0.015) centered (0, -0.02, -0.08) under the pivot, rotated rz ∓0.6, rx 0.3; hand at (0, -0.02, -0.20).
6. Hind flippers (legL, legR): pivots (±0.06, 0.08, -0.46); rounded box 0.10 x 0.03 x 0.22 lying flat, splayed ry ±0.4.
7. Accessory: collar C(0.16, 0.44, 0.26, 0.5).
Hands at rest: (±0.17, 0.20, -0.02). Sit: body pitch -0.5 (sits up tall), head center about (0, 0.74, 0.30), armR rotates rz -1.6, rx -0.8 so the flipper tip reaches M. seatY 0.03. portraitScale 1. `walk` is a hump along: torso bob 0.05 at bobHz with flippers paddling rz ±0.3; `swim` pitch 0.1 with hind flippers kicking.

### Tortoise

Quadruped, height 0.75. Colors: shell `#5E7A3C`, plates `#7F9A4E`, shell rim `#A8933E`, plastron `#D6C27A`, skin `#8A9B5E`.
`Q body (dome) hip 0.26, legR 0.07, legX 0.22, front 0.26, hind -0.22` (legs splayed rz ±0.3 at rest so the feet stay inside the shell rim, feet spheres r 0.065 scaled (1, 0.6, 1)).
1. Shell dome r 0.40 scaled (1, 0.70, 1.05) at (0, 0.24, -0.02) (top 0.52); plates: 1 flattened sphere r 0.10 scaled (1, 0.35, 1) `#7F9A4E` at (0, 0.52, -0.02) and 6 r 0.09 at radius 0.22, y 0.44, every pi / 3.
2. Shell rim torus r 0.40 tube 0.045 `#A8933E` at (0, 0.24, -0.02) rx pi / 2, scaled (1, 1.05, 1).
3. Plastron cylinder r 0.38 h 0.12 `#D6C27A` at (0, 0.14, -0.02) scaled (1, 1, 1.05).
4. N (0, 0.34, 0.36). Neck capsule r 0.07 length 0.16 tilted rx -1.0 (forward and up); head sphere r 0.13 at (0, 0.62, 0.50) (top 0.75).
5. Beak: a flattened sphere r 0.05 scaled (1.2, 0.6, 1) `#A8933E` at (0, 0.57, 0.62). M = (0, 0.56, 0.64).
6. Eyes E(0.045) at (±0.06, 0.65, 0.60).
7. Tail cone r 0.03 h 0.10 at (0, 0.12, -0.40) rotated rx -pi / 2 (pointing -z).
8. Accessory: bandana B(0.08, 0.42, 0.42, 0.8) at the neck base.
Hands: (±0.22, 0.05, 0.35). Sit: legs fold flat, head lowers 0.2, armR x -1.4, z -0.8 so the front foot reaches up toward M. seatY 0.05. portraitScale 1. `walk` is slow: leg amplitude 0.35, bobHz capped at 4, head bobs 0.06 forward each stride; `hop` lifts the whole shell with legs tucked.

### Crocodile

Quadruped, height 0.75 (eye bumps). Colors: body `#4E8A4A`, belly and jaw `#C9D59A`, ridges `#2F5F31`, teeth `#F6F1E4`.
`Q body (capsule) hip 0.30, legR 0.07, legX 0.20, front 0.24, hind -0.24` (legs splayed rz ±0.35, feet spheres r 0.075 scaled (1.1, 0.5, 1.3)).
1. Body capsule r 0.16 length 0.50 centered (0, 0.34, -0.10) rotated rx pi / 2 (along z); belly capsule r 0.14 length 0.50 `#C9D59A` at y 0.30.
2. Back ridges: 8 cones r 0.035 h 0.07 `#2F5F31` in two rows at x ±0.06, z -0.34 to 0.14 step 0.08, base y 0.49.
3. Tail: three capsules tapering r 0.12, 0.08, 0.04 (lengths 0.18, 0.18, 0.16) from (0, 0.30, -0.38) to about (0, 0.22, -0.84) with 4 ridge cones; `walk` sways it ry ±0.3 at strideHz, `swim` ±0.5 at 2 Hz.
4. N (0, 0.42, 0.14). Cranium sphere r 0.15 at (0, 0.52, 0.22); snout rounded box 0.24 x 0.12 x 0.40 (radius 0.05) at (0, 0.44, 0.44) (nose at z 0.64); jaw rounded box 0.24 x 0.07 x 0.40 `#C9D59A` at (0, 0.34, 0.44) pivoted at its back edge (z 0.24) so it opens rx 0.35 in `cheer`, `hop` and `wave`.
5. Teeth: 6 cones r 0.02 h 0.05 `#F6F1E4` along each side of the snout's lower edge, pointing down.
6. Eye bumps spheres r 0.07 body color at (±0.10, 0.66, 0.24); eyes E(0.05) at (±0.10, 0.70, 0.28). Nostrils 2 spheres r 0.025 at (±0.05, 0.52, 0.64). M = (0, 0.38, 0.64).
7. Accessory: collar C(0.17, 0.42, 0.14, 0.3).
Hands: (±0.20, 0.05, 0.33). Sit: torso pitch -0.5 (sits up), armR x -1.5, z -0.6. seatY 0.07. portraitScale 1. Natural swimmer: `swim` pitch 0.05, body at y -0.05, legs tucked, tail drives.

### Kangaroo

Biped, height 1.38 (ear tips). Colors: body `#B8865A`, belly, pouch and muzzle `#E7CBA5`, pouch lip `#A3734A`.
1. Body sphere scaled (0.22, 0.30, 0.20) at (0, 0.62, -0.02) (bottom 0.32); pouch flattened sphere r 0.16 scaled (1, 0.9, 0.5) `#E7CBA5` at (0, 0.50, 0.16) with lip torus r 0.14 tube 0.02 `#A3734A` at (0, 0.60, 0.22) rx 0.9; joey head sphere r 0.07 body color peeking at (0, 0.60, 0.20) with two eyes E(0.022) at (±0.03, 0.62, 0.26).
2. N (0, 0.90, 0.04). Head sphere r 0.16 scaled (1, 0.95, 1.2) at (0, 1.04, 0.06).
3. Muzzle sphere r 0.08 scaled (1, 0.75, 1) `#E7CBA5` at (0, 0.98, 0.20); nose sphere r 0.03 at (0, 1.02, 0.27); mouth box 0.05 x 0.015 x 0.02 at (0, 0.95, 0.26). M = (0, 0.96, 0.28).
4. Ears spheres scaled (0.05, 0.16, 0.08) at (±0.11, 1.22, 0.0) rz ±0.35 (tips 1.38), inner pink.
5. Eyes E(0.05) at (±0.07, 1.08, 0.20).
6. Arms: pivot (±0.20, 0.80, 0.06), capsule r 0.04 length 0.14, rest rx -0.9 rz ±0.15 (held up in front), hand at (0, -0.22, 0).
7. Legs: pivots (±0.17, 0.34, -0.02); thigh sphere r 0.12 scaled (0.8, 1.2, 1) centered (0, -0.06, 0), shin capsule r 0.05 length 0.10 at (0, -0.22, 0.04), foot rounded box 0.10 x 0.05 x 0.36 (radius 0.02) at y 0 centered z +0.12 (long feet forward).
8. Tail: capsule r 0.08 length 0.30 from (0, 0.34, -0.20) rx -1.15 then capsule r 0.05 length 0.22 continuing to the ground at about (0, 0.03, -0.66); the tail tip stays on the ground in `stand` (tripod) and lifts in `walk` (the kangaroo hops: see Pose mapping).
9. Accessory: collar C(0.13, 0.90, 0.04, 0).
Hands at rest: (±0.22, 0.72, 0.24). seatY 0.35. portraitScale 0.70.

### Rabbit

Biped, height 1.05 (ear tips). Colors: body `#D9D4CC`, belly, cheeks and tail `#F3F1EC`, nose `#E8A0A8`.
1. Body sphere scaled (0.20, 0.24, 0.20) at (0, 0.38, 0) (bottom 0.14); belly flattened sphere r 0.13 scaled (1, 1.1, 0.3) at (0, 0.36, 0.17).
2. N (0, 0.56, 0.04). Head sphere r 0.17 at (0, 0.68, 0.04).
3. Cheeks spheres r 0.07 `#F3F1EC` at (±0.09, 0.62, 0.16); nose sphere r 0.025 `#E8A0A8` at (0, 0.66, 0.21); teeth 2 boxes 0.025 x 0.05 x 0.015 `#F6F1E4` at (±0.015, 0.59, 0.20); 4 whiskers r 0.004 h 0.12. M = (0, 0.61, 0.22).
4. Eyes E(0.055) at (±0.075, 0.72, 0.17).
5. Ears: 2 capsules r 0.04 length 0.18 pivoted at (±0.08, 0.84, 0.0), rz ±0.12, rx -0.1 (tips about 1.05), inner flattened capsules pink at z +0.02; `slump` drops them rx 0.9; `hop` and `cheer` raise them rx -0.3.
6. Arms: pivot (±0.18, 0.50, 0.04), capsule r 0.04 length 0.12, rest rx -0.6, hand at (0, -0.20, 0).
7. Legs: pivots (±0.12, 0.20, 0); haunch sphere r 0.09 scaled (0.9, 1, 1.1) at (0, -0.06, 0), foot rounded box 0.09 x 0.05 x 0.22 (radius 0.02) at y 0 centered z +0.06.
8. Tail puff sphere r 0.07 `#F3F1EC` at (0, 0.28, -0.20).
9. Accessory: bandana B(0.13, 0.56, 0.12, 0.6).
Hands at rest: (±0.18, 0.39, 0.15). seatY 0.17. portraitScale 0.90.

### Frog

Biped, height 0.77 (eye tops). Colors: body `#5FAE4F`, belly and throat `#D9EBB0`, spots `#3F8F3A`, mouth line `#2F5F31`.
1. Body sphere scaled (0.26, 0.22, 0.24) at (0, 0.30, 0) (bottom 0.08); belly flattened sphere scaled (0.18, 0.16, 0.08) `#D9EBB0` at (0, 0.26, 0.20); 5 spot spheres r 0.04 scaled (1, 1, 0.3) `#3F8F3A` on the back.
2. N (0, 0.42, 0.04). Head sphere r 0.22 scaled (1.1, 0.75, 1) at (0, 0.52, 0.04).
3. Eyes E(0.09) on top of the head at (±0.13, 0.68, 0.08), pupils r 0.05.
4. Mouth: rounded box 0.26 x 0.02 x 0.03 `#2F5F31` at (0, 0.46, 0.24), scaled x 1.3 in `wave` and `cheer` (smile). M = (0, 0.46, 0.26).
5. Throat sac sphere r 0.10 scaled (1.4, 0.6, 0.8) `#D9EBB0` at (0, 0.40, 0.22); `stand` pulses its scale 1.0 to 1.25 at 1.2 Hz.
6. Arms: pivot (±0.24, 0.36, 0.08), capsule r 0.04 length 0.16, rest rx -0.5 rz ±0.4, 3 toe spheres r 0.025 at the tip, hand at (0, -0.24, 0).
7. Legs: pivots (±0.20, 0.16, -0.06); thigh sphere r 0.10 scaled (1, 0.8, 1.2) at (0, -0.04, 0), foot rounded box 0.10 x 0.03 x 0.22 (radius 0.02) at y 0 centered z +0.12.
8. Accessory: bandana B(0.19, 0.44, 0.16, 0.6).
Hands at rest: (±0.33, 0.16, 0.20). seatY 0.11. portraitScale 1. `walk` is a series of small hops: rigY 0.10 |sin(2 pi strideHz t)| with legs extending rx 0.8 at the peak.

### Deer

Quadruped, height 1.38 (antler tips). Colors: body `#B5804E`, belly, muzzle, tail underside and spots `#F2E3CF`, hooves `#3A2A24`, antlers `#E8D8B8`.
`Q body (0.20, 0.20, 0.34) at 0.60, hip 0.52, legR 0.045, legX 0.11, front 0.20, hind -0.24`.
1. Body sphere at (0, 0.60, -0.02); belly flattened sphere r 0.12 scaled (1, 0.8, 0.6) at (0, 0.48, 0.06); 6 fawn spots r 0.03 scaled (1, 1, 0.3) `#F2E3CF` on the back.
2. Hooves: a dark sphere r 0.05 scaled (1, 0.5, 1) `#3A2A24` at the bottom of each leg replaces the paw.
3. N (0, 0.74, 0.22). Neck capsule r 0.08 length 0.24 tilted rx -0.5; head sphere r 0.14 scaled (1, 0.9, 1.25) at (0, 1.02, 0.40).
4. Muzzle sphere r 0.07 `#F2E3CF` at (0, 0.96, 0.56); nose sphere r 0.03 `#2A1E1A` at (0, 0.98, 0.62). M = (0, 0.94, 0.62).
5. Ears spheres scaled (0.05, 0.12, 0.08) at (±0.13, 1.12, 0.34) rz ±0.6, inner pink.
6. Antlers: per side a beam cylinder r 0.02 h 0.26 at (±0.07, 1.14, 0.34) rotated rz ±0.4, rx -0.2, with 2 tines cylinder r 0.015 h 0.12 branching outward at 0.10 and 0.20 up the beam (rz ±0.7); tips about y 1.38.
7. Eyes E(0.05) at (±0.08, 1.04, 0.52).
8. Tail sphere r 0.05 scaled (0.8, 1.4, 0.6) at (0, 0.68, -0.36), white underside (second flattened sphere).
9. Accessory: collar C(0.10, 0.88, 0.30, -0.5).
Hands: (±0.11, 0.05, 0.265). Sit: neck pitches forward 0.9 (head to about (0, 0.80, 0.70)), armR x -1.7, z -0.4. seatY 0.12. portraitScale 0.70.

### Koala

Biped, height 0.86 (ear tops). Colors: body `#8E9AA3`, belly, ear inner and ear tufts `#E6E8E9`, nose `#2A2F36`.
1. Body sphere scaled (0.24, 0.26, 0.22) at (0, 0.36, 0) (bottom 0.10); belly flattened sphere r 0.15 scaled (1, 1.1, 0.3) `#E6E8E9` at (0, 0.34, 0.19).
2. N (0, 0.54, 0.04). Head sphere r 0.20 scaled (1.15, 0.9, 1) at (0, 0.66, 0.04).
3. Ears: spheres r 0.10 scaled (1, 1, 0.6) at (±0.22, 0.74, -0.02) with inner spheres r 0.06 `#E6E8E9` at z +0.03 and 3 tuft spheres r 0.03 `#E6E8E9` on each rim.
4. Nose rounded box 0.08 x 0.12 x 0.06 (radius 0.03) `#2A2F36` at (0, 0.64, 0.23); mouth box 0.05 x 0.015 x 0.02 at (0, 0.56, 0.22). M = (0, 0.57, 0.24).
5. Eyes E(0.05) at (±0.09, 0.70, 0.19).
6. Arms: pivot (±0.22, 0.48, 0.04), capsule r 0.05 length 0.14, rest rz ±0.35, hand at (0, -0.24, 0) with 2 claw spheres r 0.015.
7. Legs: pivot (±0.11, 0.14, 0), capsule r 0.06 length 0.04, foot sphere r 0.07 scaled (1, 0.55, 1.3).
8. Accessory: bandana B(0.17, 0.52, 0.14, 0.6).
Hands at rest: (±0.30, 0.25, 0.04). seatY 0.13. portraitScale 1.

## Pose mapping

Every pose in the v2 list plus `balance`, for the three builds: Q (quadruped), B (biped), Bird. Shared conventions: `bobHz = min(10, 7 speed / 1.6)` with speed 2.6 on commute and `agent.speed` or 1.6 otherwise; `strideHz = bobHz / 2`; `c2 = sin(2 pi 2 t)`; bursts are the frames where `agent.animT % 3.2` crosses 0.7; blink uses `agent.blinkAt` for 0.14 s with lids shown past the 3 percent mark exactly as the aliens; look-around on `agent.lookAt` change turns the head ±0.35 for 1.2 s (owl ±0.9). Channels blend over 0.3 s so nothing snaps. B values are the alien values from `aliens3d.js` unless listed. Leg amplitudes are rotation x in radians; `rigY` lifts the whole rig so swinging feet never pass below y 0: `rigY = hipY (1 - cos legAmp)` for Q, the alien 0.16 (1 - cos legAmp) for B and Bird.

1. `stand`. All: breathing torso scale y 1 + 0.03 br, x and z 1 - 0.012 br with br = 0.5 + 0.5 sin(2 pi 0.6 t); blink; look-around. Q: tail sway ry ±0.25 at 0.5 Hz; one ear flicks rz 0.4 for 0.2 s every 3 to 5 s (seeded phase). B: arms at rest; the kangaroo's tail tip rests on the ground. Bird: head tilt rz ±0.1 at 0.3 Hz; flamingo on one leg (legR rx 1.5); penguin flippers waggle rz ±0.08 at 0.8 Hz; frog throat pulses.
2. `walk`. Q: trot, diagonal pairs in phase (armL with legR): armL rx 0.6 s, legR rx 0.6 s, armR and legL -0.6 s where s = sin(2 pi strideHz t); torso bob 0.03 |sin(2 pi bobHz t)|; head nod rx 0.12 sin(2 pi bobHz t); tail wag ry ±0.3 at strideHz; lean 0.04. Tortoise amplitude 0.35 and bobHz capped at 4; seal humps (torso bob 0.05, flippers rz ±0.3); crocodile sways its tail ry ±0.3. B: alien walk (legs ±0.55, arms ∓0.45, bob 0.035, lean 0.08; commute 0.65 and 0.12). Kangaroo hops instead: rigY 0.18 |sin(2 pi strideHz t)|, both legs together rx 0.7 at the peak, tail rx swinging ±0.3, arms held; frog small hops rigY 0.10. Bird: waddle, legs ±0.5 (penguin ±0.35) with roll rz ±0.12 (penguin ±0.18) at strideHz, wings flap rz ±0.25 at bobHz (the "birds flap a little" rule), head bob rx 0.1 per stride; flamingo legs ±0.45 and neck bob rx 0.08.
3. `work`. Q: sits back (torso rx -0.3, rigY -0.6 seatY, hind legs folded rx -1.2) and taps with both front paws: armL and armR rx -1.2 reaching forward; during bursts alternate paw lift y 0.04 max(0, ±sin(2 pi 8 animT)); head down rx 0.15; ears forward; tail still; one twitch of the ears (rz 0.3 decaying exp(-dt / 0.12)) at each burst. B: alien typing targets (arms -1.15, lean 0.10, bursts). Bird: wings forward rx -1.2 tapping, head down rx 0.2.
4. `type`. `work` plus head down toward a screen at y 0.8: Q rx 0.25, B 0.18, Bird 0.25.
5. `hop` (report). All: rigY = max(0, -0.06 yoff), eyes scale 1.15, landing squash scale y 0.94 and x, z 1.04 over 0.15 s when yoff returns to 0 after a hop deeper than 0.6. Q: at the peak (hf = min(1, -yoff / 3)) front legs tuck rx 0.5 hf, hind legs rx -0.6 hf, ears up, tail up rx -0.4 hf. B: alien (arms -2.4 hf). Bird: wings out rz ∓(1.2 hf), crocodile jaw opens 0.35 hf.
6. `slump` (error). Q: head down rx 0.45, ears droop (rz ±0.8 on the ear pivots), tail down rx 0.9, torso scale y 0.92, lean 0.1, pupils y -0.03, sway rz 0.03 sin(2 pi 0.5 t). B: alien (scale y 0.9, lean 0.25, arms -0.3, pupils down, sway); rabbit ears rx 0.9, kangaroo arms hang rx 0. Bird: wings droop rz ±0.5 and rx 0.3, head down rx 0.4, same sway.
7. `wave`. Faces +z. Q: sits back (torso rx -0.45, hind legs rx -1.3, rigY -0.5 seatY) and lifts the right front paw: armR rx -2.4, rz 0.5 + 0.45 sin(2 pi 2 t); head tilt rz 0.16; mouth scale x 1.35. B: alien (armR -2.75, rz 0.55 + 0.45 wv, head tilt 0.16). Bird: right wing up rz -(2.3 + 0.4 sin(2 pi 2 t)) with the tip above the head, head tilt rz 0.16, penguin bounces rigY 0.02.
8. `sit`. Q: haunches down: rigY -seatY, torso rx -0.35, hind legs folded rx -1.5, left front leg straight (rx 0); the right front leg rises toward M using the per-species sit reach (`armR rx A, rz Z`, plus the listed head pitch) so `handR` ends within 0.3 of M and within 0.5 of the head center with no prop; when a prop is held (`handR.children.length > 0`) or `handle.sipPhase` is set, the paw bobs toward M by a further 0.15 rad on the sip cycle (2.5 s period, 0.6 s sip, the alien timing) and the head tilts down 0.12 sip, mouth scale y 1 + 0.5 sip. Breathing as in `stand`. B: alien seated targets (legs -1.35, rigY -seatY, arms -0.55 rz ±0.06; the holding arm rises rx -0.55 - 1.2 sip, rz ∓(0.06 + 0.65 sip)). Bird: penguin and owl drop to seatY with feet forward; flamingo folds both legs rx 1.5 and drops 0.50; the holding wing rises rz -1.0, rx -1.3 so the tip meets the beak; falcon and owl tilt the head 0.2.
9. `swing`. Sit base, legs pump: Q hind legs rx -1.5 - 0.6 sw, front legs up on the chains rx -2.3, lean -0.06 - 0.18 sw; B alien (legs -1.35 - 0.6 sw, arms -2.3 rz ±0.22); Bird wings up rz ∓2.0 gripping, legs pump. `sw = handle.swingPhase`.
10. `swim`. Q: doggy paddle, rig pitch 0.35 (nose up), rigY so the body center sits at y -0.12 plus bob 0.03 sin(2 pi 0.8 t), front legs circle rx = -ph wrapped (ph = 2 pi frac(1.2 t)) with armR half a turn behind, hind legs kick ±0.5 at 3 Hz, head up rx -0.4, tail trails. Natural swimmers (otter, seal, hippo, crocodile): pitch 0.1 or less, body at y -0.05, tail wags ry ±0.4 at 2 Hz, legs tucked (crocodile) or paddling. B: alien swim (pitch 1.2, center y -0.12, kick 3 Hz, arms circling at 1.2 Hz). Bird: floats upright: pitch 0.3, rigY so the body bottom sits at -0.05, legs paddle ±0.5 at 3 Hz, wings paddle rz ±0.3 at 1.2 Hz; flamingo wades: legs under water, rigY -0.45, neck dips rx 0.5 every 3 s.
11. `dive`. jt = clamp(agent.jumpT); pitch = 1.5 smooth01(jt) about the body center (rigY = bodyCy (1 - cos pitch)). Q: legs tucked (front rx 0.8, hind rx -0.9), ears back, tail straight. B: alien (arms overhead -3.05, legs together, mouth small). Bird: wings swept back rz ±0.4, rx 1.0, legs back rx 0.8, beak first.
12. `climb`. B: alien (arms -2.4 ± 0.5 c2, legs -0.45 ± 0.45 c2 at 2 Hz, head -0.25). Q: stands up against the ladder: torso rx -1.2 (body near vertical), front paws alternate rx -2.4 ± 0.5 c2 reaching up, hind legs step rx -0.45 ± 0.45 c2, head up -0.3. Bird: wings reach alternately (same values), legs step, flamingo neck straight.
13. `throw`. 1.6 s cycle with the alien keyframes (wind up 0.45, release to 0.6, follow through to 1.0): Q rears (torso rx -1.0) and swings both front legs over: armX from -1.0 to -3.0 to -1.3; B alien values; Bird wings instead of arms, same angles.
14. `lookUp`. Q: neck or head rx -0.45, torso lean -0.1, ears up, tail still (no shading paw; a quadruped on three legs would tip). B: alien (lean -0.28, head -0.22, armR shading rx -2.5 rz -0.5). Bird: head back rx -0.5, beak up, right wing shading rz -1.4, rx -0.8.
15. `cheer`. b = |sin(2 pi 2.5 t)|, sw = sin(2 pi 3 t). Q: rears (torso rx -0.9), front legs up rx -2.9, rz ∓(0.3 + 0.15 sw), rigY 0.06 b, mouth scale x 1.4, crocodile jaw open 0.35. B: alien (arms -2.9, bounce 0.06 b, scale y 1 + 0.03 b). Bird: wings up rz ∓2.6 flapping ±0.2 at 3 Hz, bounce 0.06 b.
16. `lever`. rock = sin(2 pi 0.8 t). Q: rears (torso rx -0.9 + 0.25 rock) and grips with both front paws rx -1.3 + 0.35 rock, hind legs brace rx 0.18 rock. B: alien (lean 0.25 rock, arms -1.3 + 0.35 rock). Bird: wings forward gripping rx -1.3 + 0.35 rock, lean 0.25 rock.
17. `paint`. sweep = sin(2 pi 1.2 t). Q: sits back (torso rx -0.5, hind legs rx -1.3) and sweeps armR rx -1.6 + 0.6 sweep, head follows rx -0.15 sweep. B: alien values. Bird: right wing sweeps rz -1.2, rx -0.6 + 0.6 sweep.
18. `push`. st = sin(2 pi 2.2 t). Q: lean 0.30, front legs forward rx -1.4, all legs step ±0.5 st, head down 0.2, rigY as walk. B: alien values. Bird: lean 0.3, wings forward rx -1.4, waddle legs ±0.5 st.
19. `point`. Q: sits back and points armR rx -1.5, rz 0, bounce rigY 0.02 |sin(2 pi 2 t)|. B: alien. Bird: wing points rz -1.4, rx -0.6, head tilt rz -0.05.
20. `balance` (new, matches the alien addition: feet together, both arms straight out to the sides, slow sway roll 0.12 at 0.7 Hz with the arms counter-tilting, antennae tense). roll = 0.12 sin(2 pi 0.7 t), applied as torso rz; head counter-rolls rz -0.5 roll. B: legs together (leg groups eased to x ±0.06), legs rx 0, armL rz -1.5 - 0.35 roll, armR rz 1.5 - 0.35 roll (both arms horizontal, tipping against the lean), arms rx 0, eyes scale 1.05, mouth small; kangaroo tail straight back rx -0.6 for balance; rabbit ears straight up. Q: stands on the hind legs: torso rx -1.25 (body near vertical about the hind hips), hind legs rx 1.25 so they stay plumb, front legs out to the sides rz ∓1.35 and rx -0.2 with the same -0.35 roll counter-tilt, tail straight out behind rx 1.2 (a counterweight), head level (neck rx compensates), ears up. Bird: wings spread straight out rz ∓1.5 (same counter-tilt), legs together, flamingo on both legs, penguin flippers out, head level. Aliens: antennae rx -0.35 with no sway. All builds: tiny step shuffle rigY 0.01 |sin(2 pi 2.2 t)|.

## Zoo building

Lot 12 by 7, local x 0..12 east, z 0..7 south, front at z 7, door centered at local x 6 (tiles door.x and door.x + 1, local x 5..7); the stub path runs south from z 7 at local x 5..7. Station right: local x 8..12, z 8..12 (south-east of the lot, east of the stub). Keep every part inside -0.6..12.6 by -0.6..7.6 and under 9 tall (the zoo tops out at 4.1). Shared colors per `docs/ART_DIRECTION.md`; two extras: dry savanna ground `#D9C58F` and tall grass `#B9C46A`. Walls `dept.wall #EEE7D9`, signature `dept.accent #C05E2C`. One `glass()` for the booth and hut windows, returned in `glass`. Two `PointLight`s (the arch lanterns) returned in `lights`. The building `update(dt, time, night, active)` stores `night` in a module-scope `nightS` that the activity reads, since no night value reaches stations.

Layout. North strip z 0.4..3.6 holds the three pens side by side: rocky pen x 0.4..4.0, water pen x 4.3..7.7, savanna pen x 8.0..11.6. A low viewing fence runs along z 3.9 from x 0.4 to 11.6 and two low divider fences at x 4.15 and x 7.85 from z 0.4 to 3.6. South strip z 4.3..6.6 is the visitor yard: path, booth, hut, benches, cart, lanterns.

1. Perimeter fence: posts cylinder r 0.05 h 0.9 `BRAND.woodDark #5E4538` every 1.0 unit along z 0 (x 0..12), z 7 (x 0..4 and 8..12, leaving the entrance), x 0 and x 12 (z 0..7); two rails box 0.04 x 0.05 spanning post to post at y 0.35 and 0.70, `BRAND.wood #8A6A55`. Corner posts h 1.0 with a cap sphere r 0.06.
2. Entrance arch on the south face: stone pillars box 0.5 x 2.6 x 0.5 `#B9C4CC` at (4.7, 0, 6.75) and (7.3, 0, 6.75) on plinths box 0.7 x 0.12 x 0.7 `#CFC6B6`; curved top `TorusGeometry(1.3, 0.14, 12, 24, pi)` `#B9C4CC` centered (6, 2.6, 6.75) standing in the xy plane (no rotation; the arc runs from +x over the top to -x), apex 4.04. Keystone box 0.3 x 0.3 x 0.3 `#CBD3DA` at the apex. ZOO sign: decal plane 1.6 x 0.6 at (6, 3.25, 6.95) facing +z; canvas 512 x 192, navy `#002D4F` rounded rectangle (radius 32 px) with a 2 px `#E2E9EE` inner stroke at 20 percent, `ZOO` in Kanit 700 at 140 px white centered (fallback Inter 700 when fonts are not ready, repaint once on `document.fonts.ready`), an aqua `#75CCD0` underline 8 px tall and 60 percent of the text width; emissive 0.35 x ramp at night. Guard the decal with `typeof document !== 'undefined'`; without a document use a plain navy plane. Lanterns on the pillar tops: housing box 0.26 x 0.14 x 0.26 `#2E3E50` at y 2.6, bulb sphere r 0.09 `#FFF1C9` emissive `#FFE2A0` at y 2.72, finial cone r 0.12 h 0.12 at y 2.74; these two bulbs are the building's `PointLight`s, `#FFC97A` intensity 8, distance 6, at (4.7, 2.72, 6.75) and (7.3, 2.72, 6.75) (the renderer scales them with night). Open gate halves: box 1.0 x 0.8 x 0.05 `#8A6A55` hinged on each pillar's inner face, swung inward ry ±1.2.
3. Paths: main path plane 1.6 x 2.8 at (6, 0.012, 5.6) rx -pi / 2 `#D9CBAE` from the arch north to z 4.2; cross path plane 11.0 x 0.9 at (6, 0.012, 4.5) `#D9CBAE`; both with a 0.06 border line `#C4B48F` painted into a small canvasTex (or a plain color when no document).
4. Ticket booth just inside the arch, east of the path: body box 1.2 x 1.5 x 1.0 (radius 0.04) `dept.wall` at (8.6, 0, 6.0); glass window 0.7 x 0.5 at y 0.95 on the south face in a `#F8F6F0` frame (glass material); counter box 1.3 x 0.06 x 0.25 `#8A6A55` at (8.6, 0.78, 6.55); striped awning box 1.5 x 0.05 x 0.7 at (8.6, 1.55, 6.35) rx 0.25 with a 6-stripe canvasTex alternating `dept.accent` and `#FFFFFF` (plain accent when no document), valance box 1.5 x 0.1 x 0.02; `Tickets` decal 0.9 x 0.22 navy band with white Inter text at (8.6, 1.3, 6.52); hipRoof(1.5, 1.3, 0.4) `dept.accent` at (8.6, 1.5, 6.0). Top 1.9.
5. Low fences (viewing and dividers): posts cylinder r 0.04 h 0.55 `#5E4538` every 0.8 with one rail box 0.03 x 0.04 at y 0.45 `#8A6A55`; the viewing fence has three 1.2 wide gaps centered on each pen (x 2.2, 6.0, 9.8) with a pen sign at each gap: post cylinder r 0.03 h 0.7 and a board box 0.5 x 0.22 x 0.02 `#8A6A55` at y 0.7 with a decal reading `Lions`, `Flamingos`, `Giraffes` in Inter 600 white on navy.
6. Rocky pen (west): sand floor plane 3.6 x 3.2 `#E3D5B2` at (2.2, 0.012, 2.0) rx -pi / 2. Boulders: spheres (ws 10, hs 7, `flat: true`) r 0.55 scaled y 0.65 `#B9C4CC` at (1.2, 0.0, 1.4); r 0.45 `#CBD3DA` at (2.6, 0, 0.9); r 0.6 `#B9C4CC` at (3.3, 0, 1.6); r 0.35 at (0.9, 0, 2.9); r 0.4 at (3.5, 0, 3.0); each sunk 0.1 into the ground. Flat slab: rounded box 1.4 x 0.3 x 1.0 (radius 0.08) `#CBD3DA` at (1.9, 0, 2.5) (top 0.30), the lion's bed. Cave: dome r 0.9 scaled (1, 0.75, 1) `#9EA9B3` at (3.1, 0, 2.9) with an opening: half-disc plane r 0.35 `#0E1B2E` on its south face at (3.1, 0.3, 3.78) facing +z. A small dead tree: cylinder r 0.05 h 0.9 `#6B4A2B` at (0.7, 0, 0.9) with two branch cylinders r 0.03 h 0.4 rz ±0.9.
7. Water pen (middle-north): sand ring plane 3.4 x 3.0 `#E3D5B2` at (6.0, 0.015, 2.0); pool plane 3.0 x 2.6 at (6.0, 0.03, 2.0) rx -pi / 2, material `#6CC3CB` roughness 0.15, opacity 0.80 transparent, emissive `#0E4F58` at 0.12, depthWrite false; a darker inner plane 1.8 x 1.4 `#58A3A8` opacity 0.35 at y 0.035. Reeds: two clusters of 5 cylinders r 0.02 h 0.6 to 0.9 `#5B8E45` with tip spheres r 0.04 `#6B4A2B` at (4.6, 0, 0.8) and (7.4, 0, 3.2). Log: cylinder r 0.14 h 1.4 `#6B4A2B` lying rz pi / 2 at (5.0, 0.12, 3.1) ry 0.4 with two cut-end discs `#A5774E`. Two lily pads cylinder r 0.18 h 0.02 `#5B8E45` at (6.9, 0.04, 1.0) and (5.2, 0.04, 1.4) with one flower sphere r 0.05 `#F8D9E0`. Two ripple rings (torus r 0.3 tube 0.015 white additive) that expand 0.3 to 1.0 and fade over 1.6 s under each flamingo every 3 s.
8. Savanna pen (east): dry ground plane 3.6 x 3.2 `#D9C58F` at (9.8, 0.012, 2.0). Acacia: trunk cylinder r 0.10 h 1.6 `#8A6446` at (10.4, 0, 1.2) with two branch cylinders r 0.05 h 0.6 at y 1.4 rz ±0.9; flat-top canopy cylinder rTop 1.3 rBottom 0.9 h 0.35 seg 10 `#5FA55A` at y 1.9 plus cylinder rTop 0.9 rBottom 0.6 h 0.25 `#4C8F4A` at y 2.25 (top 2.5); canopy stays inside x 11.7 and z 2.5. Tall grass: 8 clusters of 4 cones r 0.04 h 0.35 to 0.5 `#B9C46A` at seeded positions inside the pen, swaying rz 0.08 sin(2 pi 0.5 t + phase). Termite mound cone r 0.25 h 0.6 `#C98D5C` at (8.8, 0, 2.9). Water trough box 0.8 x 0.3 x 0.4 `#8A6A55` at (8.6, 0, 1.0) with a water plane inside at y 0.26.
9. Keeper hut at the south-west: walls rounded box 2.2 x 1.7 x 1.6 (radius 0.04) `dept.wall` at (1.8, 0, 5.5); hip roof hipRoof(2.7, 2.1, 0.6) `dept.accent` at (1.8, 1.7, 5.5) with a `#F8F6F0` fascia box 2.7 x 0.08 x 2.1 at y 1.66 (top 2.3). `// CONTRACT:` the v3 text reads "a hip roof in dept.wall and an accent door"; walls take dept.wall and the roof dept.accent per the v2 wall and roof rule. Door box 0.7 x 1.2 x 0.06 `dept.accent` at (1.8, 0, 6.33) with a `#F8F6F0` frame 0.84 x 1.3 x 0.04 and a knob sphere r 0.03 `#F6D463`; one glass window 0.6 x 0.5 at y 0.8 on the east face (x 2.93, z 5.5) in a `#F8F6F0` frame; a hay bale rounded box 0.6 x 0.4 x 0.4 `#D9C58F` at (0.6, 0, 6.0); a feed bucket cylinder r 0.12 h 0.18 `#2E3E50` at (2.9, 0, 6.3); a broom leaning on the wall.
10. Benches: two per the ART_DIRECTION bench (slats 1.0 x 0.06 x 0.17 `#A5774E` at y 0.42, back slat tilted 0.15, legs `#2E3E50`) at (4.3, 0, 5.15) and (7.4, 0, 5.15), yaw pi (facing north toward the pens). A litter bin cylinder r 0.16 h 0.5 `#2E3E50` at (5.1, 0, 5.4).
11. Popcorn cart at (10.0, 0, 5.4): body box 0.9 x 0.8 x 0.6 `#F8F6F0` on two wheels torus r 0.18 tube 0.04 `#2E3E50` at x ±0.3 (rx 0), a handle bar cylinder r 0.02 h 0.6 `#2E3E50`; glass case box 0.7 x 0.45 x 0.5 (glass material) on top at y 0.8 holding 8 popcorn spheres r 0.055 `#F6D463` and 3 `#F8F6F0`; mini awning plane 1.0 x 0.5 at y 1.45 rx 0.3 striped `dept.accent` and white; a `Popcorn` decal 0.6 x 0.16 navy on the front. Top 1.6.
12. Lamp post at (10.8, 0, 6.3): ART_DIRECTION lamp (pole r 0.04 h 1.75 `#2E3E50`, housing, bulb r 0.11 emissive `#FFE2A0`), emissive only, no PointLight (the two arch lanterns hold the budget).
13. Residents (five), each `makeAnimalMesh('zoo-' + species + '-' + i, dept.accent, species)` with `group.scale.setScalar(1.3)`, `group.userData.kind = 'resident'`, `delete group.userData.handle`, ring hidden, added to the building group (hovering one brightens the zoo like any building part; none is an agent). Each has a fake agent `{ state: 'idle', pose, path: [], animT: 0, speed: 0, yoff: 0, jumpT: 0, blinkAt: 0, lookAt: 0, moveDir: { x: 0, z: 1 }, paused: false }` driven by `animateAnimal` in `update`, with `blinkAt = time + 2.5 + 3 rng()` rescheduled when passed and `lookAt` bumped every 4 to 7 s:
    - Lion asleep on the slab: position (1.9, 0.30, 2.5), yaw 0.4, pose `sit`; eyes held shut by setting `blinkAt = time - 0.07` every frame (the blink midpoint); head pitched a further 0.35 down after `animateAnimal`; three sleep bubbles, spheres r 0.03 to 0.05 `#F8F6F0` opacity 0.7, rising 0.5 over 2.0 s from the nose, staggered 0.7 s, looping.
    - Two flamingos in the pool at (5.6, 0, 1.6) yaw 0.3 and (6.6, 0, 2.3) yaw -0.6, pose `stand` (one leg tucked); head dip every 4.0 s (phases 0 and 2.0 s): neck rx eases to 1.1 over 0.6 s, holds 0.8 s, eases back over 0.6 s, with a ripple ring spawned at the beak when the dip bottoms out.
    - Tortoise by the hut: shuffles between (2.6, 0, 6.3) and (3.8, 0, 6.3) at 0.12 units per second with pose `walk` and `moveDir` set along x, pausing 2 s and turning over 1.0 s at each end (yaw eased between pi / 2 and -pi / 2).
    - Giraffe in the savanna at (9.2, 0, 1.6) yaw 0.25, pose `stand`; head sways ry 0.3 sin(2 pi 0.08 t); every 7 s it reaches up to the acacia (neck rx -0.4 over 1.2 s, holds 1.5 s with a chew: mouth scale y 1 + 0.4 |sin(2 pi 2 t)|, back over 1.2 s). Its head (2.47 world units) rises above the east fence.
    Residents are decoration: not pickable as agents, no overlay tags, no `species` line.
14. Night. Arch lantern bulbs emissive 0.08 + 2.4 ramp and their two PointLights by the renderer; ZOO sign emissive 0.35 ramp; booth and hut windows through the glass material (idle 1.3 ramp); yard lamp bulb emissive 0.08 + 2.4 ramp; pool gets a white sheen plane 2.6 x 2.2 opacity 0.15 ramp at y 0.045; the flamingos stop dipping and tuck the head (neck rx 0.9 held) when ramp > 0.5; the lion sleeps regardless; the tortoise keeps shuffling at half speed. `ramp = clamp((night - 0.25) / 0.75, 0, 1)`.

## High-wire activity

Station local 4 by 4, origin at its north-west corner, stub path to the west (right-side station), workTile at local (1.5, 3.5). `activityLabel = 'Walking the high wire'`. Pose `balance`, enter `walk`. Posts stand at opposite corners so the wire runs south-west to north-east; from the default south-east camera that diagonal is perpendicular to the view, so the wire reads as a horizontal line and the walker is seen side-on.

1. Posts: near post (nearest the stub and the work tile) cylinder r 0.09 h 3.2 `#5E4538` at (0.5, 0, 3.5); far post at (3.5, 0, 0.5). Each has three `dept.accent` bands torus r 0.10 tube 0.02 at y 1.0, 2.0, 3.0 and a base disc cylinder r 0.18 h 0.06 `#B9C4CC`. Guy ropes: 2 cylinders r 0.012 `#8A6A55` from each post top to the ground 0.6 outward on the two sides away from the wire (near post toward (0.1, 0, 3.9) and (0.5, 0, 3.95); far post toward (3.9, 0, 0.1) and (3.5, 0, 0.05)), with peg boxes 0.06 x 0.08 x 0.06.
2. Platforms: rounded box 0.9 x 0.08 x 0.9 (radius 0.02) `#A5774E` centered on each post top at y 3.2 (top surface 3.28), with a `#F8F6F0` edge trim box 0.9 x 0.04 x 0.04 on the two outer sides and a short railing (3 posts cylinder r 0.025 h 0.45 `#2E3E50` and a top rail) on the two sides facing away from the wire; a cap sphere r 0.06 `#F6D463` on the outermost rail post of the far platform, at about (3.85, 3.75, 0.15), is the bird's perch.
3. Ladders: near post, south face (toward the camera): rails cylinder r 0.025 h 3.3 `#2E3E50` at x 0.35 and 0.65, z 0.66, from y 0 to 3.3 with the top 0.1 curling over the platform edge; rungs box 0.30 x 0.03 x 0.03 every 0.30 from y 0.30 to 3.00. Far post, east face: the same at z 0.35 and 0.65, x 3.66.
4. Wire: cylinder r 0.015 `#2E3E50` (roughness 0.5, metalness 0.3) from (0.5, 3.24, 3.5) to (3.5, 3.24, 0.5): length 3.0 sqrt 2 = 4.243, centered (2.0, 3.24, 2.0), oriented with `quaternion.setFromUnitVectors(yAxis, dir)` where `dir = normalize(1, 0, -1)`. Two tension turnbuckles box 0.05 x 0.05 x 0.14 `#B9C4CC` 0.3 in from each end. Walking surface y 3.24 plus the character's own feet at y 0 of its group, so the group rides at y 3.28 (platform top) and dips to 3.20 mid-wire (see item 9).
5. Net: a wireframe grid 1.2 above the ground. Two `PlaneGeometry` pieces so the ladder bay stays open: A 3.0 x 2.2 with 10 x 7 segments centered (2.3, 1.2, 1.3) rx -pi / 2 (x 0.8..3.8, z 0.2..2.4) and B 2.0 x 1.0 with 7 x 3 segments centered (2.8, 1.2, 2.9) (x 1.8..3.8, z 2.4..3.4); `MeshBasicMaterial #F8F6F0 wireframe true transparent opacity 0.45 depthWrite false`, castShadow false. A second pair of plain planes (same sizes) in `MeshStandardMaterial #F8F6F0 opacity 0.08` under them gives the mesh a faint body. The net is tied to the two posts at y 1.2 (small knot spheres r 0.03) and to two net poles cylinder r 0.03 h 1.25 `#2E3E50` at (3.8, 0, 3.4) and (0.8, 0, 0.2); 4 tie ropes cylinder r 0.01 run from the net corners to the poles. The south-west bay (x 0.2..1.8, z 2.4..3.8) stays open: the renderer eases the agent from workPos (1.5, 0, 3.5) up to the anchor and that line passes through the bay, never through the net. Sway: the net planes scale y 1 ± 0.004 and shift y ±0.01 at 0.4 Hz while someone is on the wire.
6. Balance pole: cylinder r 0.02 length 1.5 `#F8F6F0` with end spheres r 0.045 `dept.accent` and a grip band torus r 0.025 tube 0.012 `dept.accent` at the middle. Rest position on the near platform: centered (0.5, 3.34, 3.5), axis along the wire direction (rotation.y = -pi / 4 with the cylinder first rotated rz pi / 2 so its length runs along local x), resting on two small chocks.
7. Anchor and yaw: `anchor = (0.5, 3.28, 3.5)` (top of the near platform), `yaw = 3 pi / 4` (atan2(1, -1): facing along the wire toward the far post), `pose: 'balance'`, `enter: 'walk'`, `label: activityLabel`.
8. Round trip (9.0 s, repeating while `phase.working`), with `u = phase.t mod 9`:
   - 0.0 to 0.9: pause on the near platform. At u 0 (and every 9 s) the arrival burst plays here, except on the very first cycle.
   - 0.9 to 4.5: cross to the far platform (3.6 s): `p = (u - 0.9) / 3.6`, `pe = 0.5 - 0.5 cos(pi p)` (slow start and stop), position along the wire `s = 4.243 pe`.
   - 4.5 to 5.4: pause on the far platform; arrival burst at u 4.5; yaw turns from 3 pi / 4 to -pi / 4 over 0.4 s (shortest arc, eased).
   - 5.4 to 9.0: cross back: `p = (u - 5.4) / 3.6`, `pe` as above, `s = 4.243 (1 - pe)`; yaw turns back to 3 pi / 4 during the near-platform pause.
   Offsets written to the character each frame after the renderer has placed it at the anchor: `group.position.x += s dir.x`, `group.position.z += s dir.z` with `dir = (0.7071, 0, -0.7071)`; the group travels 4.243 units and returns, satisfying the 2 unit test.
9. Wobble while on the wire (0 < pe < 1): mid = sin(pi pe) peaks mid-wire.
   - Lateral offset along `perp = (0.7071, 0, 0.7071)`: `0.10 mid sin(2 pi 0.7 t + 0.8)`.
   - Roll: `group.rotation.z += 0.10 mid sin(2 pi 0.7 t)` on top of the pose's own 0.12 roll (up to 0.22 total mid-wire; rotation order XYZ makes rotation.z a roll about the walker's own forward axis after the yaw).
   - Height: `group.position.y += -0.08 mid` (the wire gives a little) `+ 0.02 |sin(2 pi 2.2 t)|` (foot shuffle at the pose's shuffle rate).
   - Every third crossing (count crossings on the handle) the lateral and roll amplitudes are 1.6x: a near-stumble; the pole dips with it.
   - On the platforms the offsets ease to 0 over 0.3 s; while paused the walker breathes (the pose does this).
10. Pole in hand: each frame while a character is at the station, `handL.getWorldPosition(a)`, `handR.getWorldPosition(b)` into module scratch vectors, convert both with `group.worldToLocal` (the station group), set the pole position to the midpoint and its quaternion with `setFromUnitVectors(xAxis, normalize(b - a))` (the pole's length runs along its local x). For quadrupeds and birds in `balance` the hands are the spread front paws or wing tips, so the pole lies across the chest; for bipeds and aliens it sits at the horizontal arms. When the character leaves, the pole eases back to its rest transform over 0.5 s (lerp position, slerp quaternion).
11. Arrival burst at each platform: 12 confetti planes 0.07 x 0.11 (`MeshStandardMaterial` doubleSide, colors `#E7706F`, `#75CCD0`, `#F6D463`, `#F8F6F0` cycling) launched from the platform center 0.6 above its top with velocity up 1.0 to 1.8 and radial 0.4 to 0.9, gravity 3.0, spin rx 4 and rz 3 rad per s, life 1.2 s, fading over the last 0.4 s and hidden below the platform top; plus 3 cheer sparkles sphere r 0.045 `glow('#FFF1C9', 1.2)` rising 0.5 over 0.6 s and fading. Pooled (24 confetti, 6 sparkles), spawned by overwriting the oldest, never allocated.
12. Idle (`alien` is null): the pole rests on the near platform; the perch bird, `makeAnimalMesh('wire-owl', dept.accent, 'owl')` at scale 0.8, sits on the far platform's cap (about (3.85, 3.75, 0.15)) with a fake agent in `stand`, turning its head ±0.7 toward the path every 3 to 5 s and blinking; it fades out over 0.5 s (`setAnimalOpacity`) when a walker arrives (`alien` becomes non-null) and fades back in over 0.8 s starting 1.5 s after the walker leaves. Confetti pool hidden, net still, wire turnbuckles catch a glint: emissive flash 0.3 for 0.2 s every 6 s by day.
13. Night: lantern on each post at y 2.7 on a bracket box 0.04 x 0.04 x 0.24 `#2E3E50` pointing toward the wire: housing box 0.16 x 0.12 x 0.16 `#2E3E50`, bulb sphere r 0.07 `#FFF1C9` emissive `#FFE2A0` at 0.08 + 2.0 ramp; 7 string bulbs sphere r 0.03 `#FFF1C9` hung 0.06 below the wire at parameters i / 8, emissive 0.05 + 1.4 ramp (every other one tinted `#75CCD0` at half); the pole's accent caps emissive 0.3 ramp. No `PointLight` in the station (the activity return has no `lights` field); `ramp` comes from the module-scope `nightS` written by the building's `update`.
14. Resident bird and pole are children of the station group; the walker is the renderer's handle and is only offset, never reparented.

## Species name mapping

`speciesForName(name)` normalizes: lowercase, replace every non-letter with a space, split into words. Match order: (1) any whole word equal to a species id, its plural (`s`, `es`, `ves` for wolf, `ies` for bunny), or a synonym below; (2) any word of at least 4 letters that starts with a species id of at least 3 letters and is at most 4 letters longer than it (so `Foxy`, `Owlbert`, `Bearnard`, `Otterly` match; `Fo` or `Be` do not); (3) otherwise `null`, and `makeAnimalMesh(seed, color, null)` picks `SPECIES[hash(seed) % SPECIES.length]`. The first matching word wins; synonyms are checked after exact ids so `Panda Bear` is a panda, not a bear.

| species | names, plurals and synonyms |
| --- | --- |
| lion | lion, lions, lioness, lionesses, leo, simba, nala, mufasa |
| tiger | tiger, tigers, tigress, tigresses, tigger, shere khan (word `khan`) |
| elephant | elephant, elephants, ellie, dumbo, jumbo, mammoth, pachyderm, trunk |
| giraffe | giraffe, giraffes, longneck |
| zebra | zebra, zebras, stripes |
| hippo | hippo, hippos, hippopotamus, hippopotami, hippopotamuses |
| bear | bear, bears, grizzly, grizzlies, kodiak, polar (as in polar bear), teddy, bruin, cub, cubs, baloo, paddington |
| panda | panda, pandas, pandabear (the pair `panda bear` resolves to panda by rule order), po |
| fox | fox, foxes, foxy, vixen, vixens, reynard, kit, kits, swiper, redpanda (red panda, closest silhouette) |
| wolf | wolf, wolves, wolfie, lobo, timberwolf, coyote, coyotes, jackal, jackals, husky, huskies, dingo |
| monkey | monkey, monkeys, monkies, ape, apes, chimp, chimps, chimpanzee, gorilla, gorillas, macaque, baboon, baboons, lemur, lemurs, orangutan, capuchin, marmoset, gibbon, kong, abu, george |
| penguin | penguin, penguins, pingu, emperor, pengu |
| flamingo | flamingo, flamingos, flamingoes, flamin |
| owl | owl, owls, owlet, hoot, hooter, hedwig, barnowl, snowy, athena |
| falcon | falcon, falcons, hawk, hawks, kestrel, peregrine, eagle, eagles, osprey, raptor, raptors, merlin, harrier, buzzard, vulture, condor, kite, kites |
| otter | otter, otters, seaotter |
| seal | seal, seals, sealion, sealions, sea lion (word `lion` after `sea` resolves to seal: check the pair before single words), walrus, walruses, pup |
| tortoise | tortoise, tortoises, turtle, turtles, terrapin, terrapins, shelly, sheldon, crush, franklin |
| crocodile | crocodile, crocodiles, croc, crocs, gator, gators, alligator, alligators, caiman, caimans, snappy, tick tock (word `tock`) |
| kangaroo | kangaroo, kangaroos, roo, roos, joey, joeys, wallaby, wallabies, skippy |
| rabbit | rabbit, rabbits, bunny, bunnies, hare, hares, cottontail, jackrabbit, thumper, peter, roger, lapin |
| frog | frog, frogs, froggy, froggie, toad, toads, kermit, tadpole, bullfrog, treefrog |
| deer | deer, deers, stag, stags, doe, does, fawn, fawns, buck, bucks, elk, moose, reindeer, caribou, antelope, antelopes, gazelle, gazelles, impala, bambi, rudolph |
| koala | koala, koalas, koalabear (the pair `koala bear` resolves to koala), dropbear |

Two-word checks run before single words: `polar bear`, `panda bear`, `koala bear`, `sea lion`, `sea otter`, `red panda`, `barn owl`, `shere khan`, `tick tock`. Species order in `SPECIES` is the contract list: lion, tiger, elephant, giraffe, zebra, hippo, bear, panda, fox, wolf, monkey, penguin, flamingo, owl, falcon, otter, seal, tortoise, crocodile, kangaroo, rabbit, frog, deer, koala. The Risk demo agents `Otter`, `Falcon` and `Tortoise` resolve directly; `TT.town.previewAvatar(name, role, 'risk')` runs the same function so the add-agent form shows the species as the name is typed.
