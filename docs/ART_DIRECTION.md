# Thread Town 3D: art direction

This is the authoritative look bible for the Three.js r160 build of Thread Town. It merges three proposals (lighting-first, architecture-first, character-first) into one set of numbers. Where they disagreed, the choice below is the one that looks most polished and realistic on a boardroom screen at the fit distance (whole 62 x 40 map visible), and the same choice is carried through every section.

`docs/CONTRACT.md` wins over anything here. Every value below was checked against it. Where the contract leaves a choice open, this document closes it.

Direction in one sentence: a pastel toy town in warm late-afternoon sun, with soft long shadows, smooth rounded geometry, white trim, saturated accent roofs, and chunky one-piece aliens in exact team colors; at night a navy sky, amber windows and warm lamp pools.

Conventions: all distances are world units (1 tile = 1 unit), angles in radians unless marked deg, time in seconds, colors are sRGB hex. Pass every hex through `new THREE.Color(hex)` (r160 converts sRGB hex to linear automatically because `ColorManagement.enabled` is true by default) and set `texture.colorSpace = THREE.SRGBColorSpace` on every CanvasTexture used as a color map. Lighting intensities assume r160 defaults (physically correct lights) plus ACES tone mapping at exposure 1.05.

Why the old build looked pixelated, and what removes it: the 16 px canvas, nearest filtering and a 5 px bitmap font. The 3D build must have none of those: `antialias: true`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, `LinearMipmapLinearFilter` plus anisotropy on every CanvasTexture, smooth-segment geometry (spheres 24 x 16, cylinders 16 segments, `RoundedBoxGeometry` for walls), 4x-resolution sprite plaques with real web fonts, and HTML overlay text for small labels.

## Camera

- `PerspectiveCamera(28, aspect, 1, 600)`.
- Target: map center `(31, 0, 20)` exactly as the contract states (`COLS/2, 0, ROWS/2`). Do not lift the target.
- Default orbit (south-east, above): azimuth 0.55 rad measured from +z toward +x, polar 0.88 rad (elevation 39.6 deg). Direction from target to camera = `(sin 0.88 * sin 0.55, cos 0.88, sin 0.88 * cos 0.55)` = `(0.403, 0.637, 0.657)`. The asymmetric azimuth makes the south faces (doors, awnings) wider than the east faces so the facades dominate.
- Fit distance: never use a bounding sphere (it over-fits by about 40 percent). Take the 8 corners of the box x 0..62, y 0..6, z 0..40, place the camera at `target + dir * d`, look at the target, and binary-search d between 40 and 400 (24 iterations) until every corner projects inside NDC |x| <= 0.92 and |y| <= 0.92. Expect about 95 at 16:9 and about 140 at 4:3.
- Pixels per unit at the target = `viewportHeight / (2 * dist * tan(14 deg))`. At 16:9 fit that is about 19 px per unit at 900 px tall, 23 px at 1080p, 45 px at 4K. Every readable element below is sized to survive 19 px per unit.
- Recompute the fit on resize; keep the user's zoom ratio (current distance / old fit) across the recompute.
- `OrbitControls`: `enableDamping true`, `dampingFactor 0.08`, `rotateSpeed 0.6`, `zoomSpeed 0.8`, `panSpeed 0.7`, `screenSpacePanning false`, `minDistance 0.6 * fit`, `maxDistance 2.5 * fit`, `minPolarAngle 0.55`, `maxPolarAngle 1.15`, no azimuth limits, `mouseButtons` LEFT rotate, RIGHT pan, MIDDLE dolly. After each `controls.update()` clamp `controls.target.x` to [4, 58] and `controls.target.z` to [4, 36], `target.y` fixed at 0.
- Cinematic (`setCinematic(true)`): `autoRotate true`, `autoRotateSpeed 0.35` (one lap in about 170 s), and ease the distance toward `0.85 * fit` over 2.5 s with an exponential follow. `setCinematic(false)` only turns autoRotate off; it does not snap the distance back.
- Zoom checks: at 2x zoom (about 47 units) 1 unit is about 38 px, which is where window mullions, awning stripes, eye highlights and spots must hold up. Every small dimension below was chosen for that.
- Avatar camera (portraits): fov 30, position `(0, 0.62, 2.3)` looking at `(0, 0.55, 0)`, render target 96 x 120, alpha true, alien yawed 0.25 rad toward the camera. Lighting for the portrait scene: `HemisphereLight(#FFFFFF, #C9D4DC, 1.2)` plus `DirectionalLight(#FFF4E0, 1.9)` from `(1, 1.8, 2)`. Same renderer settings (ACES, exposure 1.05, SRGB output).

## Lighting and time of day

Renderer: `antialias true`, `toneMapping ACESFilmicToneMapping`, `toneMappingExposure 1.05`, `outputColorSpace SRGBColorSpace`, `shadowMap.enabled true`, `shadowMap.type PCFSoftShadowMap`, `setPixelRatio(Math.min(devicePixelRatio, 2))`.

Driver: `n = clamp(TT.sim.darkness() / 0.62, 0, 1)` (0 day, 1 full night). Smooth the displayed value per frame: `s += (n - s) * (1 - exp(-3 * dt))` so the day/night toggle fades over about 1 s instead of snapping. Every value below is piecewise-linear interpolated through three keyframes at s = 0 (day), 0.5 (dusk) and 1 (night). Interpolate colors with `Color.lerpColors` (linear RGB).

Sun: one `DirectionalLight`, `castShadow true`. Direction from the target toward the light = `(-0.45, 0.70, 0.55)` (unit length; from the south-west, elevation 44 deg). `position = target + dir * 120 = (-23, 84, 86)`, `light.target.position = (31, 0, 20)`. Shadows fall toward the north-east with length about 1.03 x height, so a 4.6 unit building drops a 4.7 unit shadow across the grass and the road on its north-east side where the south-east camera sees it, and the south face with the door stays in full light while the east face falls into gentle shade for form. Keep this direction fixed through dusk and night so shadows never swing during the lerp.

| Keyframe | Sun color | Sun intensity | Hemisphere sky | Hemisphere ground | Hemisphere intensity | Fill color | Fill intensity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Day (s = 0) | #FFF3DF | 2.5 | #CFE6F5 | #9DB07E | 1.0 | #DCE9F5 | 0.35 |
| Dusk (s = 0.5) | #FFC487 | 1.6 | #8E8FBF | #9B7A6E | 0.75 | #B9A2C4 | 0.20 |
| Night (s = 1) | #7E93C4 | 0.30 | #1C3058 | #0E1826 | 0.45 | #2E4A75 | 0.08 |

- Fill: a second `DirectionalLight` with `castShadow false`, direction from target toward the light `(0.60, 0.50, -0.62)` normalized (from the north-east). It lifts the shaded east and north faces so they read as form, not black. It is cheap (no shadow map).
- No `AmbientLight`. The hemisphere is the ambient.
- Day contrast check: a sunlit face receives about 2.5 * 0.70 + 1.0 = 2.75 of irradiance, a shaded face about 1.0 to 1.35 (hemisphere plus fill), a ratio near 1 to 2.3, which ACES renders as a soft readable shadow rather than a black hole.
- Environment: `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04).texture` as `scene.environment` (both from `three/addons`). r160 has no `scene.environmentIntensity`, so keep a registry of every `MeshStandardMaterial` and set `envMapIntensity` per material: 0.25 on walls, roofs, ground, trunks, canopies, alien bodies and wood; 0.60 on eyes, glass, water and lamp glass. At night multiply all of them by `1 - 0.6 * s`. The PMREM costs about 20 ms once at startup and one 256 px cube texture; if the board machine struggles, drop it and raise the hemisphere intensity to 1.15 by day.

Shadows: `shadow.mapSize 4096 x 4096` (fall back to 2048 if the first 3 s average under 45 fps). Orthographic shadow camera `left -44, right 44, top 44, bottom -44, near 20, far 240` (this covers the rotated map footprint plus roofs; tighten to the actual light-space bounds of the map for free extra sharpness once it works). `bias -0.0004`, `normalBias 0.03`. If acne shows on the ground or stripes on the roofs, raise `normalBias` to 0.05 before touching `bias`. PCFSoftShadowMap ignores `shadow.radius` in r160, so softness comes from the map resolution plus the hemisphere and fill. Ground, buildings, props and water receive; buildings, props, trees and aliens cast; tree canopies and alien bodies do not receive (per the contract).

Sky: `scene.background` is a 2 x 512 vertical gradient `CanvasTexture` (colorSpace SRGB) redrawn only when s changes by more than 0.01. Three stops (top, 55 percent, horizon):

| Keyframe | Top | Mid | Horizon |
| --- | --- | --- | --- |
| Day | #7FBCE8 | #A9D4EF | #E3EEF3 |
| Dusk | #3E5C8E | #B98BA0 | #E6B79E |
| Night | #04122B | #0B2347 | #1B3F6B |

The dusk horizon is the brand salmon tie-in, pulled toward peach (#E6B79E) so it does not read pink on a large screen.

Fog: `new THREE.Fog(horizonColor, 1.3 * fit, 3.0 * fit)`, color updated with the horizon stop each frame. At fit distance the far corner of the map is under 10 percent hazed, so the board view stays crisp; fog only softens the edge when zoomed out toward 2.5x. Set `material.fog = false` on all sprites so plaques stay sharp.

Night glow:
- Lamp `PointLight`: color #FFC97A, `distance 6`, `decay 2`, `castShadow false`, positioned at the bulb (y 1.95). Intensity `12 * ramp` where `ramp = clamp((s - 0.25) / 0.75, 0, 1)`; set `light.visible = ramp > 0`. Real PointLights on 13 lamps only: the 4 plaza lamps, the 1 park lamp, and the 8 intersection lamps at the two central crossings (c = 1, 2 and r = 0, 1 in the sim.js intersection loop). The other 16 lamps get the emissive bulb and the additive ground pool only (see Trees and props). Forward-rendering all 29 lights would compile 29 lights into every lit shader and miss 60 fps on an integrated GPU.
- Lamp bulb emissive #FFE2A0, `emissiveIntensity 0.08 + 2.4 * ramp`. Steady, no flicker.
- Lamp ground pool (all 29 lamps): a flat `CircleGeometry` radius 1.8 at y 0.015, `MeshBasicMaterial` with a 128 x 128 radial gradient CanvasTexture (#FFD27A alpha 1 at center to 0 at the edge), `transparent true`, `blending AdditiveBlending`, `depthWrite false`, `opacity 0.35 * ramp`.
- Window glass emissive #FFD88A. Per building: `idle = 1.3 * ramp`; `active = max(idle, 0.9)` when `building.active > 0`; ease the displayed value toward the target at `1 - exp(-6 * dt)` (about 0.4 s). One glass material per building (13 total) so the whole facade switches together.
- Antenna tips: emissive in the alien's seeded accent, `emissiveIntensity 0.35 + 1.0 * s`.
- Laptop screen: emissive #75CCD0, `emissiveIntensity 1.0 + 0.4 * sin(2 * pi * 0.5 * t)`.
- Stars: `THREE.Points`, 240 points on a dome of radius 300 above y 60, `size 1.6`, `sizeAttenuation false`, color #FFFFFF, `opacity max(0, s - 0.6) * 2.5`, `depthWrite false`. Optional; cheap.

## Palette

Brand anchors: Navy #002D4F, Aqua #75CCD0, Salmon #E7706F, Silver #E2E9EE. Department wall, accent and alien colors are exactly the values in `js/data.js`. Roofs use `dept.accent` as the contract requires, so the roofs match the utilization board swatches. The darker `dept.roof` values stay unused.

Sky and air: see the sky table under Lighting and time of day. Fog color always equals the horizon stop.

Ground:
- Grass base #8DBF66, mottle dark #7FAE5B, mottle light #98C476, speckles #85B467 and #9ECB78.
- Flower dots #E7706F, #FFFFFF, #F6D463, #75CCD0 with stem dot #5B8E45.
- Road fill #D9CBAE, curb line #C4B48F, sidewalk line #E8DEC8, fleck #CFBF9F.
- Plaza stone #D3DBE2 alternating #CAD3DB (one step below Silver), grout #B6C1CA, sparkle highlight #E4EAEF.
- Shoreline sand #E3D5B2 with a wet ring #D4C49C. Painted water under the pond plane #58B3B8.
- Off-map skirt #7FAE5B.

Water: surface #6CC3CB (Aqua pulled 6 percent darker so it does not glow in daylight), emissive #0E4F58 at 0.12, ripple highlights #FFFFFF.

Buildings: walls `dept.wall`; trim, fascia, window frames, mullions and sills #F8F6F0 (one trim white everywhere); plinth and door step #CFC6B6; roof `dept.accent`; door `dept.accent` with a #0E2238 split line and #F6D463 handles; awning stripes `dept.accent` and #FFFFFF; chimney #8A6F5E with cap #5E4538; sign band #002D4F. Cafe: walls #F6E7C8, roof #E7706F, door #75CCD0, awning #E7706F and #FFFFFF, chalkboard #2E3E50.

Glass: day tint #AFD6E4, emissive #FFD88A.

Nature: trunks #8A6446; deciduous v0 canopy #5FA55A with shade #4C8F4A; deciduous v1 canopy #6FAE52 with shade #5A9A48 (warmer); pine v2 #3F8A55 with lower tier #357A4A.

Props: stone #B9C4CC (fountain basin, column), light stone #CBD3DA; wood #A5774E with dark wood #6B4A2B; metal legs and lamp iron #2E3E50; bulb glass #FFF1C9 with emissive #FFE2A0; lamp light #FFC97A; table top #FBF8F1; umbrella #E7706F and #FFFFFF; desk top #E8DCC0; laptop #2E3E50; laptop screen #75CCD0; mug #FFFFFF; paper #E8E2D5; smoke #F2F2F2.

Aliens: body `dept.alien` exactly (no per-agent jitter, so a crew reads as one hue on the board screen); spots body color darkened 12 percent lightness (table below); eye white #FFFFFF; pupil #1B2A3A; highlight #FFFFFF; antenna tip accent from the seed `hsl((bodyHue + 150 + rng * 60) mod 360, 85 percent, 66 percent)`, the same formula as the legacy sprite so existing agents keep their accent; contact shadow rgba(0, 20, 40, 0.35).

UI: plaque #002D4F at 0.94 alpha, name #FFFFFF, count #E2E9EE at 85 percent, live dot #E7706F, underline `dept.accent`; name tag rgba(0, 45, 79, 0.92) with white text; bubble #FFFFFF with #002D4F text; error bubble #E7706F with white text; hover ring #75CCD0; selected ring #9FE2E5; building hover emissive #75CCD0 at 0.08 (aqua reads better on cream than white).

## Materials

All `MeshStandardMaterial`, `flatShading false`, `metalness 0` unless stated. One shared material per color; never one material per mesh. Register every material so `envMapIntensity` can be set globally (see Lighting).

| Surface | Color | Roughness | Metalness | Notes |
| --- | --- | --- | --- | --- |
| Walls | dept.wall, cafe #F6E7C8 | 0.90 | 0 | RoundedBoxGeometry, envMapIntensity 0.25 |
| Roofs | dept.accent, cafe #E7706F | 0.78 | 0 | custom hip BufferGeometry with per-face normals |
| Trim, fascia, frames, sills | #F8F6F0 | 0.80 | 0 | merged per building |
| Plinth, step | #CFC6B6 | 0.90 | 0 | |
| Door | dept.accent | 0.60 | 0 | slightly glossier paint |
| Door handles | #F6D463 | 0.30 | 0.6 | the only metallic brass |
| Glass | #AFD6E4 | 0.20 | 0.05 | emissive #FFD88A, envMapIntensity 0.6, transparent false, one material per building |
| Awning canvas | stripe CanvasTexture | 0.92 | 0 | side DoubleSide |
| Chimney | #8A6F5E | 0.95 | 0 | |
| Ground | 1984 x 1280 CanvasTexture | 1.0 | 0 | minFilter LinearMipmapLinearFilter, magFilter LinearFilter, anisotropy min(8, max), generateMipmaps true, colorSpace SRGB |
| Skirt plane | #7FAE5B | 1.0 | 0 | receiveShadow true |
| Water | #6CC3CB | 0.12 | 0 | transparent, opacity 0.82, emissive #0E4F58 at 0.12, depthWrite false, envMapIntensity 0.6 |
| Water ripple layer | alpha CanvasTexture | n/a | n/a | MeshBasicMaterial white, opacity 0.30, AdditiveBlending, depthWrite false |
| Tree canopy | per variety | 0.90 | 0 | InstancedMesh with instanceColor jitter of plus or minus 5 percent lightness |
| Trunk | #8A6446 | 0.95 | 0 | |
| Stone | #B9C4CC | 0.85 | 0 | |
| Wood | #A5774E, #6B4A2B | 0.80 | 0 | |
| Lamp iron, metal legs | #2E3E50 | 0.55 | 0.2 | |
| Bulb | #FFF1C9 | 0.35 | 0 | emissive #FFE2A0 |
| Laptop body | #2E3E50 | 0.50 | 0 | |
| Laptop screen | #0E1B2E | 0.30 | 0 | emissive #75CCD0 |
| Alien body, lids, antenna stalks | dept.alien | 0.60 | 0 | envMapIntensity 0.25; satin, not matte |
| Alien spots | body darkened 12 percent | 0.60 | 0 | |
| Eye white | #FFFFFF | 0.25 | 0 | envMapIntensity 0.6 |
| Pupil | #1B2A3A | 0.35 | 0 | |
| Eye highlight | #FFFFFF | n/a | n/a | MeshBasicMaterial (unlit) |
| Antenna tip | seeded accent | 0.40 | 0 | emissive accent, see Lighting |
| Contact shadow | radial CanvasTexture | n/a | n/a | MeshBasicMaterial, transparent, depthWrite false, polygonOffset true factor -1 |
| Selection ring | #75CCD0 or #9FE2E5 | n/a | n/a | MeshBasicMaterial transparent, depthWrite false |
| Lamp pool | radial CanvasTexture | n/a | n/a | MeshBasicMaterial AdditiveBlending, depthWrite false |
| Smoke | #F2F2F2 | n/a | n/a | MeshBasicMaterial transparent, depthWrite false |
| Sprites | 4x CanvasTexture | n/a | n/a | SpriteMaterial transparent, depthTest true, depthWrite false, fog false, renderOrder 10 |

Texture rules: every CanvasTexture gets `colorSpace SRGBColorSpace` (color maps only; alpha maps stay linear), `minFilter LinearMipmapLinearFilter`, `magFilter LinearFilter`, `generateMipmaps true`, `anisotropy Math.min(8, renderer.capabilities.getMaxAnisotropy())`, `wrapS` and `wrapT` ClampToEdge except the ripple texture (RepeatWrapping). `NearestFilter` is never used anywhere.

## Ground and roads

One `PlaneGeometry(62, 40)` rotated -90 deg about x, centered `(31, 0, 20)`, `receiveShadow true`, textured by a 1984 x 1280 canvas (32 px per tile) painted once at init. Paint with anti-aliased shapes (arcs, soft alpha), never hard 1 px squares; the goal is a soft watercolor read that mipmaps cleanly. Painting order: 1) base fill by tile type, 2) grass mottle, 3) per-tile detail, 4) borders and shorelines, 5) one final `ctx.filter = 'blur(0.7px)'` self-draw pass so no hard pixel edge survives.

- Grass (G, T, F and B footprints): fill #8DBF66, then two-octave value noise mottle between #7FAE5B and #98C476 (cells 16 px and 48 px, amplitude plus or minus 6 percent lightness) seeded from `TT.rng(TT.hash(x + ',' + y))` and blended 50 percent with the 4 neighbours so it varies gently rather than checkerboarding; 10 to 14 speckle circles radius 1.5 to 2.5 px in #85B467 or #9ECB78 at alpha 0.35; every 6th tile a soft 24 px radial patch 3 percent darker.
- Flowers (F): 4 to 5 dots radius 2.4 px from #E7706F, #FFFFFF, #F6D463, #75CCD0 with a 1.5 px #5B8E45 stem dot below each.
- Roads (P): fill #D9CBAE; on every edge bordering a non-road, non-plaza tile paint a 2.5 px curb line #C4B48F and a 2 px sidewalk line #E8DEC8 inset 5 px from the curb; 3 to 5 soft 2 x 1 px flecks in #CFBF9F at alpha 0.5; every 2 tiles along the road direction a 1 px seam of #C4B48F at alpha 0.10 (expansion joints). Roads are 2 tiles wide so the pair forms a 2-unit road with kerbs on both sides. The door stubs (2 wide from each door to the road, 1 wide for the cafe) use the same paint.
- Plaza (Z and FT): checker of #D3DBE2 and #CAD3DB by (x + y) parity, 1.2 px grout #B6C1CA on the top and left edges, a 1 px #E4EAEF highlight on the bottom and right, a 1.5 px #B6C1CA border around the whole 10 x 10 plaza, and a 6 px soft vignette 6 percent darker inside the 4 FT tiles so the basin sits in a shadowed ring.
- Water (WA): fill #58B3B8 as the fallback under the water plane; along every edge bordering non-water paint an 8 px sand band #E3D5B2 onto the neighbouring tile with a 3 px wet ring #D4C49C on the water side, feathered with a 5 px shadowBlur toward the water so the pond outline is not a staircase.
- Off-map skirt: `PlaneGeometry(300, 300)` at y -0.01, color #7FAE5B, `receiveShadow true`, so the map edge does not float in the sky.
- Grass irradiance check: ground normal is up, so by day grass receives about 2.5 * 0.70 + 1.0 = 2.75; ACES at exposure 1.05 maps #8DBF66 to a saturated but not blown green.

## Water

- Geometry: merge one `PlaneGeometry(1, 1)` per water tile with `BufferGeometryUtils.mergeGeometries` into a single mesh at y 0.04, rotated -90 deg about x, `receiveShadow true`.
- Material: see the Water row in Materials (color #6CC3CB, opacity 0.82, roughness 0.12, emissive #0E4F58 at 0.12, depthWrite false, envMapIntensity 0.6).
- Ripple layer: a second merged plane at y 0.05 with a 256 x 256 alpha CanvasTexture of 14 soft white arcs and blobs (alpha 0.12 to 0.35), `RepeatWrapping`, repeat 1 per 2 tiles, `MeshBasicMaterial` white, opacity 0.30, `AdditiveBlending`, `depthWrite false`. Animate `offset.x += 0.012 * dt`, `offset.y += 0.008 * dt`, and `rotation += 0.02 * dt`.
- Opacity breathing: water opacity 0.78 to 0.86 as `0.82 + 0.04 * sin(2 * pi * 0.25 * t)`.
- Fountain water: the basin disc and the upper bowl disc use the same water material at opacity 0.85 (see Trees and props).
- Shoreline: painted into the ground texture (see Ground and roads); there is no separate sand mesh.

## Buildings

Department building: footprint w 8, h 5 at `(building.x, building.y)`; group origin at world `(x, 0, y)`; center `C = (x + 4, 0, y + 2.5)`. The door center is world `door.x + 1 = x + 4 = C.x`, so the door is exactly centered on the south face (z = y + 5). Two stories of 1.45, wall top at 3.02, ridge at 4.44, plaque at 5.5.

1. Plinth: box 8.0 x 0.12 x 5.0 at `(C.x, 0.06, C.z)` in #CFC6B6.
2. Walls: `RoundedBoxGeometry(7.7, 2.9, 4.7, 3, 0.06)` centered `(C.x, 1.57, C.z)`. Wall faces sit at x = bx + 0.15 and bx + 7.85, z = by + 0.15 and by + 4.85, leaving a 0.15 ring of plinth and a 0.3 ring of grass around the building. `castShadow` and `receiveShadow` true.
3. Fascia: box 8.4 x 0.12 x 5.4 from y 3.02 to 3.14 in #F8F6F0 (0.35 overhang on every side).
4. Hip roof: non-indexed `BufferGeometry` with base corners at y 3.14 `(C.x plus or minus 4.2, C.z plus or minus 2.7)` and ridge points `(C.x - 1.5, 4.44, C.z)` and `(C.x + 1.5, 4.44, C.z)`: two trapezoid long slopes (2 triangles each) and two triangular end slopes, `computeVertexNormals` for crisp facets. Height 1.3, slope 25.7 deg. Color `dept.accent`. Do not use a scaled 4-segment cone: it gives a ridgeless pyramid that reads as a tent on an 8 x 5 footprint. Executive (slot [2,0]) gets roof height 1.6 (ridge y 4.74) plus a flagpole cylinder r 0.025 h 1.6 at the ridge center with a 0.5 x 0.3 x 0.02 flag in #75CCD0; this is the one deterministic variation.
5. Chimney: box 0.45 x 1.1 x 0.45 at `(C.x + 2.4, 3.65, C.z - 1.2)` in #8A6F5E (bottom buried in the north slope, top at 4.2), cap 0.55 x 0.1 x 0.55 at y 4.25 in #5E4538. Smoke only while `building.active > 0` (see Animation).
6. Windows: 32 per building. Glass 0.55 wide x 0.75 tall x 0.05 deep protruding 0.04 from the wall; frame 0.67 x 0.87 x 0.05 protruding 0.025; a horizontal mullion 0.55 x 0.04 x 0.02 at the glass center height; a sill 0.75 x 0.05 x 0.10 under each frame; frame, mullion and sill in #F8F6F0. Ground floor glass from y 0.62 to 1.37, upper floor from y 2.07 to 2.82. Bay pitch 1.4. South face: upper floor 5 bays at x offsets -2.8, -1.4, 0, 1.4, 2.8; ground floor 4 bays at -2.8, -1.4, 1.4, 2.8 (door in the middle). North face: 5 upper and 5 lower. East and west faces: 3 bays per story at z offsets -1.4, 0, 1.4. Merge all frames, mullions and sills into one geometry per building and all glass into one geometry per building, so windows cost 2 draw calls per building.
7. Door: double door box 1.3 x 1.35 x 0.08 in `dept.accent`, bottom at y 0.12, face 0.04 proud of the wall at z = by + 4.85; a #0E2238 split box 0.03 x 1.35 x 0.09 down the center; two handle spheres r 0.04 in #F6D463 at y 0.75 and x offsets plus or minus 0.12; a door frame box 1.5 x 1.47 x 0.05 in #F8F6F0 behind it. Step: box 1.9 x 0.10 x 0.6 at `(C.x, 0.05, by + 5.15)` in #CFC6B6, reaching onto the stub path.
8. Awning: canvas box 2.1 x 0.05 x 0.75 rotated 22 deg about x so the wall edge sits at y 1.72 and the outer edge at y 1.44, projecting 0.7 south of the wall; a valance box 2.1 x 0.12 x 0.02 hanging from the outer edge; two support rods cylinder r 0.02 from the outer corners back to the wall at y 1.1 in the accent shade. Stripe texture 512 x 128 with 8 vertical stripes alternating `dept.accent` and #FFFFFF.
9. Sign band: box 2.2 x 0.32 x 0.04 at y 2.0 on the south face (between the awning and the upper sills) in #002D4F with a 1.6 x 0.04 strip in `dept.accent` along its bottom edge. No text; the sprite carries the name. It gives the facade a second navy anchor at 2x zoom.
10. Plaque sprite anchored at `(C.x, ridge + 1.05, C.z)` = y 5.5 (5.8 for Executive). See Labels and overlays.
11. Hover: emissive #75CCD0 at `emissiveIntensity 0.08` on the wall and roof materials, eased over 0.12 s. Walls and roofs need one material clone per building for this (24 clones total), which is acceptable.

Per-department colors (all from `js/data.js`; trim is the one shared white; accent shade is the accent darkened 15 percent lightness in HSL and is used for the door split line, awning rods and the drip edge under the fascia; spots are the alien color darkened 12 percent):

| Department | Slot | Wall | Roof (accent) | Trim | Door | Accent shade | Alien body | Alien spots |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Executive | [2,0] | #F3EFE6 | #002D4F | #F8F6F0 | #002D4F | #0E2238 | #3B6E9E | #2A4F71 |
| Embedded Banking | [1,0] | #EDE7D8 | #75CCD0 | #F8F6F0 | #75CCD0 | #3FB4B9 | #75CCD0 | #47BBC0 |
| Compliance | [3,0] | #E8E2D5 | #004B91 | #F8F6F0 | #004B91 | #002345 | #4A8FE0 | #2370CA |
| Financial Crimes | [4,0] | #EFE8DA | #E7706F | #F8F6F0 | #E7706F | #DC2F2D | #E7706F | #DE3C3B |
| Operations | [0,0] | #ECE5D4 | #1F8A5B | #F8F6F0 | #1F8A5B | #114C32 | #34A872 | #267952 |
| Data & Analytics | [0,1] | #E9E3D6 | #5D4E8E | #F8F6F0 | #5D4E8E | #3D335D | #8E7BD0 | #674EC0 |
| Credit | [4,1] | #F0E9DB | #C68B17 | #F8F6F0 | #C68B17 | #815B0F | #E0A838 | #BD881D |
| Finance | [0,2] | #EBE4D5 | #2E8B8E | #F8F6F0 | #2E8B8E | #1B5254 | #3AA8AB | #2A7B7D |
| Technology | [1,2] | #E7E1D4 | #A85B8E | #F8F6F0 | #A85B8E | #773F64 | #C972AC | #B84692 |
| Risk | [2,2] | #EEE7D9 | #C05E2C | #F8F6F0 | #C05E2C | #82401E | #E07E42 | #C55F20 |
| Marketing | [3,2] | #F1EADC | #8DBE2E | #F8F6F0 | #8DBE2E | #5F801F | #9FCB3E | #7CA12B |
| People | [4,2] | #EAE3D5 | #B9C4CC | #F8F6F0 | #B9C4CC | #8D9FAC | #AEB9C2 | #8B9BA8 |

Executive's accent shade is hand-set to #0E2238 because navy cannot be darkened further and still read as a color. Awning stripes are always accent and #FFFFFF; the plaque underline is always the accent.

Cafe (footprint 5 x 3 at `(x, y)`, center `C = (x + 2.5, 0, y + 1.5)`, door center world `door.x + 0.5 = C.x`):
- Plinth 5.0 x 0.12 x 3.0 in #CFC6B6; walls `RoundedBoxGeometry(4.7, 1.5, 2.7, 3, 0.06)` in #F6E7C8 centered `(C.x, 0.87, C.z)`; fascia 5.4 x 0.10 x 3.4 from y 1.62 to 1.72 in #F8F6F0; hip roof base 5.4 x 3.4 at y 1.72, ridge 2.0 long at y 2.57 (height 0.85) in #E7706F.
- Single door 0.8 x 1.2 x 0.08 in #75CCD0, bottom at y 0.12, with #F6D463 handle r 0.035 and a #F8F6F0 frame 1.0 x 1.32 x 0.05.
- Two shop windows: glass 1.1 x 0.8 (frame 1.22 x 0.92), centered at x offsets plus or minus 1.5 from the door, glass y 0.45 to 1.25, with a flower box 0.9 x 0.18 x 0.22 in #6B4A2B under each carrying 4 flower dots r 0.06 from the flower palette.
- Full-width awning 4.9 x 0.05 x 0.8 sloping from y 1.4 at the wall to 1.1 at the outer edge, stripes #E7706F and #FFFFFF, valance 0.12.
- A chalkboard box 0.35 x 0.5 x 0.03 in #2E3E50 leaning against the wall 0.7 left of the door.
- Plaque sprite "Café" at `(C.x, 3.4, C.z)`, 3.2 x 0.9 units, Aqua underline, no count line.

## Trees and props

Trees (about 300, from `state.trees`): per tree `rng = TT.rng(TT.hash(x + ',' + y))`, scale `s = 0.85 + 0.30 * rng()` (border tiles x <= 1, y <= 1, x >= 60, y >= 38 use `1.0 + 0.3 * rng()`), yaw `rng() * 2 * pi`, position tile center `(x + 0.5, 0, y + 0.5)` plus jitter plus or minus 0.12 in x and z. Use `InstancedMesh` per part per variety (deciduous: trunk, sphere A, sphere B, sphere C; pine: trunk, cone 1, cone 2, cone 3; 8 instanced meshes total with the two deciduous varieties sharing meshes through `instanceColor`). `castShadow true`, `receiveShadow false`.
- Deciduous (v 0 and 1): trunk `CylinderGeometry(0.09, 0.13, 0.6, 12)` centered y 0.3 in #8A6446; canopy sphere A r 0.58 (16 x 12) at `(0, 1.0, 0)`, sphere B r 0.40 at `(0.32, 0.82, 0.22)`, sphere C r 0.38 at `(-0.28, 0.92, -0.26)`, sphere D r 0.30 at `(0, 1.42, 0)`. v0: A and D #5FA55A, B and C #4C8F4A. v1: A and D #6FAE52, B and C #5A9A48. Height about 1.72 before scale.
- Pine (v 2): trunk r 0.08 h 0.45 centered y 0.225; three cones (12 segments) r 0.55 h 0.70 base y 0.45, r 0.42 h 0.60 base y 0.95, r 0.28 h 0.55 base y 1.40 (tip 1.95). Lowest tier #357A4A, upper two #3F8A55.

Lamp posts (29, from `state.lamps`, placed at `(x, 0, y)` directly since lamp positions are already fractional centers): base cylinder r 0.10 h 0.08 at y 0.04; pole cylinder r 0.04 h 1.75 from y 0.08 to 1.83 (12 segments) in #2E3E50; lantern housing box 0.26 x 0.14 x 0.26 centered y 2.05; bulb sphere r 0.11 (16 x 12) at y 1.95 in #FFF1C9 with emissive #FFE2A0; finial cone r 0.12 h 0.12 at y 2.18. Ground pool disc on every lamp and a `PointLight` at y 1.95 on the 13 lamps listed under Lighting. Total height 2.24.

Benches (6, from decos of type bench, positioned at `(x, 0, y)` directly): seat as two slats 1.0 x 0.06 x 0.17 at y 0.42 with a 0.02 gap in #A5774E; back slat 1.0 x 0.30 x 0.05 at y 0.62 set back 0.16 and tilted 0.15 rad; two legs 0.06 x 0.42 x 0.34 in #2E3E50 at x offsets plus or minus 0.42. Plaza benches face the fountain (yaw toward the plaza center); park benches face the pond center `(o.x + 5, o.y + 5.5)`.

Cafe tables (3, from decos of type table at `(x, 0, y)`): pedestal cylinder r 0.03 h 0.62 in #2E3E50 on a base disc r 0.18 h 0.03; top cylinder r 0.36 h 0.04 at y 0.62 in #FBF8F1; two stools cylinder r 0.14 h 0.04 at y 0.38 on r 0.025 posts at radius 0.5 from the center; umbrella pole r 0.02 continues to y 1.75; canopy `ConeGeometry(0.85, 0.32, 8)` with its base at y 1.50, built as two interleaved 4-segment meshes (`thetaLength pi / 4` each) in #E7706F and #FFFFFF so the stripes are geometric and crisp; finial sphere r 0.04 in #F6D463. Canopy `side DoubleSide`.

Fountain (1): `state.decos` holds the fountain at `(o.x + 5, o.y + 6)`, a legacy pixel-art baseline offset. The 2 x 2 FT basin tiles are centered at `(o.x + 5, o.y + 5)`, so place the 3D fountain at `(deco.x, 0, deco.y - 1)` or aliens will walk through its rim. Basin: outer cylinder r 1.15 h 0.35 (32 segments) in #B9C4CC with a torus lip r 1.15 tube 0.05 at y 0.35; inner water disc r 1.0 at y 0.30 in the water material at opacity 0.85; center column r 0.15 h 0.75 in #B9C4CC; upper bowl cylinder r 0.45 h 0.10 at y 0.80 with a water disc r 0.40 at y 0.86; jet: 8 spheres r 0.045 in #DFF6F7 at opacity 0.85, each on a parabola from the bowl rim (radius 0.4, y 0.9) up 0.6 and out to radius 0.95 at y 0.3, cycle 1.1 s, phase i / 8; two ripple rings `RingGeometry(0.30, 0.36, 48)` white additive scaling 1 to 2.6 and fading 0.4 to 0 over 1.6 s, offset by 0.8 s.

Hedges (24): two `RoundedBoxGeometry(1.2, 0.42, 0.45, 2, 0.12)` in #6FA860 flanking each department door step at x offsets plus or minus 1.6 from the door center, z = by + 5.3. They frame the entry and hide the plinth-to-grass seam. Instance all 24 in one `InstancedMesh`.

Desk (pooled, one per department building, shown while that building's agent is working; position `(workPos.x, 0, workPos.y + 0.55)`, 0.55 south of the alien per the contract): top box 0.9 x 0.05 x 0.45 at y 0.50 in #E8DCC0; four legs 0.04 x 0.48 x 0.04 in #6B4A2B; laptop base 0.35 x 0.02 x 0.25 at y 0.53 in #2E3E50; screen 0.35 x 0.22 x 0.015 hinged at the back edge and tilted back 0.3 rad with its emissive aqua face toward +z (the camera); paper stack 0.2 x 0.03 x 0.26 in #E8E2D5; mug cylinder r 0.04 h 0.07 in #FFFFFF at the right corner.

Contact shadow (one per alien): `PlaneGeometry(0.64, 0.64)` at y 0.012 under the group, 64 x 64 radial gradient (rgba(0, 20, 40, 0.35) at center to 0 at the edge); scale x by 1.08 while walking and shrink to 0.85 at the top of a report hop.

## Aliens

Traits consume `TT.rng(TT.hash(seed))` in this order so the same agent always gets the same alien: shape from [blob, tall, squat, blob, pear], eyes from [1, 2, 2, 3], antennae from [0, 1, 2, 2], spotted = rng < 0.55, accent hue (see Palette), idle yaw = (rng - 0.5) * 0.6, then spot positions. Local +z is the face. Feet at y 0, body top at 0.9 (`ALIEN_HEIGHT`), antennae to about 1.15. Geometry: `SphereGeometry` 24 x 16 and `CapsuleGeometry` with 8 cap segments and 16 radial segments; scale on the mesh, never on a shared geometry, so shadow and raycast bounds stay correct.

Body shapes (dimensions, center y):
- Blob: sphere r 1 scaled `(0.34, 0.42, 0.32)` at y 0.47 (top 0.89, width 0.68). No separate head; `parts.head` is undefined.
- Tall: `CapsuleGeometry(0.24, 0.42)` at y 0.45 (top 0.90, width 0.48).
- Squat: sphere scaled `(0.40, 0.33, 0.37)` at y 0.44 (top 0.77, width 0.80).
- Pear: sphere scaled `(0.36, 0.34, 0.33)` at y 0.38 plus a head sphere r 0.25 at y 0.68 (top 0.93); `parts.head` points at the head sphere.
- Legs: two capsules r 0.07 length 0.08 at x plus or minus 0.13, center y 0.11 (overlapping the body bottom); feet spheres r 0.10 scaled `(1.0, 0.55, 1.15)` at y 0.05, z +0.03.
- Arms: capsules r 0.06 length 0.24 pivoted at the shoulder (a Group at x plus or minus (bodyHalfWidth - 0.02), y = 0.62 * bodyTop), hanging down with rest rotation z plus or minus 0.12 (slightly out).

Eyes: a pivot group on the body front at y 0.70 * bodyTop, sunk 0.02 into the surface. 2 eyes: whites r 0.10 at x plus or minus 0.13. 1 eye: r 0.14 centered. 3 eyes: r 0.085 at x plus or minus 0.16 plus a center eye raised 0.06. Pupil r 0.055 (1 eye 0.08, 3 eyes 0.045) at +0.075 z from the eye center (0.10 for the single eye); highlight sphere r 0.018 at pupil + `(-0.02, 0.022, 0.03)`, `MeshBasicMaterial` white. Lids: half spheres (phi length pi) r = eye r + 0.005 in the body color covering the top half of the eye, `visible false` except during a blink to avoid z-fighting.

Antennae: a Group pivoted at the top of the head (y = bodyTop - 0.02); 2 antennae at x plus or minus 0.10 tilted outward 0.25 rad and back 0.10 rad; 1 antenna centered. Stalk capsule r 0.025 length 0.20 (0.24 for a single antenna) in the body color; tip sphere r 0.05 in the seeded accent with emissive per Lighting.

Spots (spotted trait): 5 spheres r 0.05 scaled `(1, 1, 0.35)` placed on the body surface at seeded positions on the back and sides only (local z <= 0.1), in the spots color from the department table.

Selection ring (`parts.ring`): `RingGeometry(0.36, 0.44, 48)` at y 0.015 rotated -90 deg about x, `MeshBasicMaterial transparent`, `visible false` by default; hover #75CCD0 opacity 0.85; selected #9FE2E5 opacity 1.0 with scale pulsing 1.00 to 1.08 at 1.2 Hz.

Reading at fit (19 px per unit): body 9 to 15 px wide, eye whites 3.8 px dots, antenna tips 1.9 px bright dots, contact shadow 12 px. The team color and the eye dots are what read on the board screen; at 2x zoom (38 px per unit) pupils, highlights and spots all resolve. Individuality comes from silhouette (4 shapes), eye count, antenna count, spots and the accent tip; the body color is never jittered.

## Animation

All hot-path math uses module-scope scratch vectors; `animateAlien` allocates nothing per frame. The loop clamps dt to 0.05 as the contract requires.

Rotation: `targetYaw = atan2(moveDir.x, moveDir.z)` while moving; pi (face -z, toward the building) while working, as the contract requires; the seeded idle yaw about +z otherwise. `yaw += shortestDelta * (1 - exp(-8 * dt))`. Note for the integrator: the contract has the alien face -z while the desk sits at +z, so the alien has its back to the laptop. Follow the contract and turn the laptop screen to face +z so the aqua glow still reads from the camera; if you choose to face the alien +z while working instead, leave a `// CONTRACT:` comment.

Walk (idle with a path, speed 1.25 to 1.95; commute 2.6): `bobHz = min(10, 7 * speed / 1.6)`, `strideHz = bobHz / 2`; body y offset `0.035 * abs(sin(2 * pi * bobHz * t))`; legs rotation x plus or minus 0.55 * sin(2 * pi * strideHz * t) in opposite phase (0.65 on commute); arms rotation x minus or plus 0.45 * sin(same) with the constant z splay 0.12; body lean 0.08 rad forward (0.12 on commute); antennae rotation x = -0.20 - 0.12 * sin(2 * pi * strideHz * t - 0.6) (lag); contact shadow scale 1.0 + 0.08 * sin(2 * pi * bobHz * t).

Idle standing: breathing scale y = 1 + 0.03 * (0.5 + 0.5 * sin(2 * pi * 0.6 * t)), scale x and z = 1 - 0.012 * same (volume looks constant); antennae sway rotation z plus or minus 0.05 at 0.8 Hz with a 0.4 rad phase offset per antenna; blink while `time < agent.blinkAt + 0.14`: lids visible, close over 0.07 s and open over 0.07 s (ease in-out) with eye scale y toward 0.25 at the midpoint; head or eye-group turn: when `agent.lookAt` changes, ease the eye group yaw to plus or minus 0.35 rad over 0.6 s and back after 1.2 s.

Working: arms rotation x -1.15 (forward and down so hands land at y about 0.42, desk top 0.50), arm z 0.05; during bursts (`agent.animT % 3.2 >= 0.7`) alternate arms with y offset 0.04 * max(0, sin(2 * pi * 8 * animT)) on the left and the inverse on the right; in the pause window hold still and tilt the eye group 0.08 rad down; body lean 0.10 forward; antennae twitch: on the first frame where `animT % 3.2` crosses 0.7 set twitch = 1, antennae rotation x = -0.3 * twitch, `twitch *= exp(-dt / 0.12)`. Tool bubble swaps its 3 frames every 0.25 s. Laptop screen emissive 1.0 + 0.4 * sin(2 * pi * 0.5 * t).

Report: body y = `agent.yoff * -0.06` (max hop 0.18); eyes scale 1.15; arms rotation x = -2.4 * hopFraction where hopFraction = min(1, -yoff / 3) (arms up at the peak); antennae rotation x = +0.25 * hopFraction; landing squash when yoff returns to 0: scale y 0.94 and x, z 1.04 recovering over 0.15 s.

Error: body scale y 0.90, rotation x 0.25 forward, arms rotation x +0.30 with z 0.02 (hanging slightly forward), antennae rotation x +0.9 (drooping toward the face) and z plus or minus 0.3, pupils offset y -0.03 (looking down), slow sway rotation z plus or minus 0.03 at 0.5 Hz. Ease back over 0.4 s when the state leaves error.

World:
- Water ripple offset (0.012, 0.008) per second and rotation 0.02 rad per second; water opacity 0.82 plus or minus 0.04 at 0.25 Hz.
- Fountain jets 1.1 s arcs with 8 phases; basin disc scale 1.00 to 1.04 at 0.5 Hz; ripple rings 1.6 s cycle.
- Chimney smoke while `building.active > 0`: 3 spheres per chimney, cycle 2.2 s with phase i / 3, r 0.12 at the cap growing to 0.32, rising 1.3 units from the cap, sway x plus or minus 0.1 at 0.5 Hz, opacity 0.55 fading to 0, color #F2F2F2. Hide when inactive.
- Lamps and windows: no flicker. Day/night: all lerps use the smoothed s (rate 3 per second); the darkness schedule itself already ramps over 2 to 2.5 hours in auto mode.
- Camera cinematic: autoRotateSpeed 0.35; distance eases to 0.85 * fit over 2.5 s.
- Selected ring pulse 1.2 Hz; plaque live dot fades in over 0.4 s; overlay tags and bubbles fade in over 150 ms.
- Trees, umbrellas and benches are static (instanced trees cannot sway cheaply and the motion is not worth the cost).

## Labels and overlays

Department plaque (`Sprite`, `sizeAttenuation true`, `depthTest true`, `depthWrite false`, `renderOrder 10`, `material.fog false`): canvas 1120 x 300 (4x of a 280 x 75 design). Navy #002D4F rounded rectangle radius 48 px at 0.94 alpha filling the canvas inside a 12 px transparent margin, with a 2 px inner stroke rgba(226, 233, 238, 0.20); department name in Kanit 600 at 150 px white, centered, baseline at 165 px, auto-shrunk so the longest name fits 1000 px (Embedded Banking, Financial Crimes and Data & Analytics land near 128 px); accent underline 8 px tall and 60 percent of the text width, centered at y 190, in `dept.accent`; second line "N agents" (singular "1 agent") in Inter 500 at 84 px in #E2E9EE at 85 percent, baseline 268 px; when `building.active > 0` a Salmon #E7706F dot radius 14 px to the left of the count text with a 30 px gap.

Plaque size: base 4.5 x 1.2 world units (inside the contract's 3.5 to 4.5 range), anchored at `(C.x, ridge + 1.05, C.z)`. Each frame compute `pxPerUnit = viewportHeight / (2 * dist * tan(14 deg))` at the sprite's camera distance and set `scale = clamp(90 / (4.5 * pxPerUnit), 1.0, 1.3) * clamp(dist / fit, 0.6, 1.0)`. The first clamp keeps the plaque at least 90 px wide on narrow or 4:3 fits (never wider than 5.85 units, still inside the 8-wide footprint); the second shrinks it back as the camera zooms in so it never doubles. At the 16:9 fit on a 900 px stage the plaque is about 86 px wide with a 11.5 px name; at 1080p about 104 px with a 14 px name; on a 4K board screen about 200 px with a 27 px name.

Fonts: call `document.fonts.load('600 150px Kanit')` and `document.fonts.load('500 84px Inter')` before the first paint; paint with the fallback (Inter 700, then sans-serif) if they have not resolved, and repaint every plaque when they do. Repaint a plaque only when its cached string of name, count and active state changes.

Cafe plaque: 800 x 220 canvas, "Café" in Kanit 600 at 130 px, Aqua underline, no count line, world 3.2 x 0.9 at `(C.x, 3.4, C.z)`, same scale rule.

Tool bubble (`Sprite`): 3 frames at 192 x 192 px, white rounded square radius 40 px with a 16 px tail at the bottom center, icon drawn for `spec.anim` (write, build, stamp, mail, scan, compute) in Navy #002D4F with Aqua, Salmon and #F6D463 details, 12 px strokes with round caps. World size 0.9 units multiplied by `clamp(dist / fit, 0.5, 1.0)` so it stays a 16 to 18 px icon. Vertical position: `ALIEN_HEIGHT + 0.5 + tagWorld + 0.5 * spriteSize` where `tagWorld = 26 / pxPerUnit`, which stacks it above the HTML name tag with no overlap. Recompute every frame.

HTML overlay (`#overlay`, `pointer-events none`, `overflow hidden`): anchor projected from `(pos.x, ALIEN_HEIGHT + 0.5, pos.y)` each frame; elements use `transform: translate(-50%, -100%) translate(px, py)` with px and py rounded to whole CSS pixels so text stays crisp.
- `.tag`: Inter 11 px weight 600, letter-spacing 0.01 em, padding 3 px 8 px, border-radius 999 px, background rgba(0, 45, 79, 0.92), color #FFFFFF, box-shadow 0 1 px 2 px rgba(0, 0, 0, 0.2), white-space nowrap. Shown when hovered, selected or working.
- `.bubble`: Inter 12.5 px weight 500, line-height 1.3, padding 7 px 10 px, border-radius 10 px, background #FFFFFF, color #002D4F, max-width 220 px, box-shadow 0 4 px 14 px rgba(0, 45, 79, 0.18), an 8 px CSS triangle tail centered below, margin-bottom 6 px so it sits above the tag when both show. `.bubble.error`: background #E7706F, color #FFFFFF, tail matching.
- Fade in over 150 ms (opacity and translateY 4 px to 0). Hide when `projected.z > 1` or more than 40 px outside the viewport.
- Sentence case everywhere, no em dashes.

Side panel avatars: 96 x 120 renders as described under Camera; display at 48 px wide so the 2x render stays crisp.

## Performance budget

Target 60 fps on an integrated GPU at 1600 x 900, dpr up to 2.

- Draw calls: under 250 at the default view. Budget: ground 1, skirt 1, water 2, sky 0 (background), trees 8 instanced meshes, hedges 1, buildings about 10 each (plinth, walls, fascia, roof, chimney and cap merged, frames merged, glass merged, door group merged, awning, sign band) so about 130 for 13 buildings, lamps 29 x 3 (merge the iron parts per lamp, keep bulb and pool separate), benches 6, tables 3 x 6, fountain about 14, plaques 13, aliens about 14 parts x 15 agents (visible roster), desks and bubbles only while working.
- Triangles: under 600k. Sphere 24 x 16 is 768 triangles; a 15-agent roster at about 12 spheres each is about 140k; trees at 16 x 12 spheres instanced are about 300 x 4 x 384 = 460k, so drop tree spheres to 12 x 8 (192 triangles) if the budget is tight; they are small on screen.
- Lights: 1 directional with shadow, 1 directional fill, 1 hemisphere, 13 point lights (visible only when ramp > 0, so the daytime shader compiles with 0 active point lights if `light.visible` is toggled before the first render of the night). Never 29 point lights.
- Shadow map: 4096 x 4096 (64 MB depth), fallback 2048 (16 MB) if the first 3 s average under 45 fps. One shadow pass per frame; aliens and trees cast, which is the main shadow cost.
- Textures: ground 1984 x 1280 with mipmaps (about 13 MB), sky 2 x 512, 13 plaques 1120 x 300, 6 tool-bubble sets of 3 x 192 x 192, awning stripes 512 x 128 x 13, ripple 256 x 256, radial gradients 128 x 128 and 64 x 64, PMREM 256 px cube. Total under 40 MB.
- Materials: shared by color; 13 glass materials, 24 wall and roof clones for hover, everything else singletons. Material registry for envMapIntensity.
- Per-frame work: no allocations in `animateAlien`, the overlay projector or the light lerp; plaque repaint only on change; sky repaint only when s moves more than 0.01; point light re-pick never (fixed set of 13).
- Startup: ground paint under 150 ms, PMREM about 20 ms, plaques after fonts resolve.
- Pixel ratio `Math.min(devicePixelRatio, 2)`; on a 4K board screen at dpr 1 the MSAA default is enough.

## Do-not list

- Do not use `NearestFilter` on any texture, or any 1 px hard-edged square in the ground paint. The pixelated look is exactly what this build removes.
- Do not use `AmbientLight`; the hemisphere plus the fill light is the ambient.
- Do not give all 29 lamps a `PointLight`; 13 real lights plus pools on all 29.
- Do not use a bounding-sphere fit; project the 8 box corners.
- Do not lift or move the camera target off `(31, 0, 20)`.
- Do not build the hip roof from a scaled 4-segment cone; use the ridge BufferGeometry.
- Do not use `dept.roof` for roofs; roofs are `dept.accent` per the contract.
- Do not jitter the alien body color per agent; the team reads as one hue.
- Do not create one material per window or one material per alien part; share by color and merge per building.
- Do not put metalness above 0 on walls, roofs, ground, bodies, wood or stone; the only metallic surfaces are door handles (0.6), lamp iron and metal legs (0.2) and glass (0.05).
- Do not flicker lamps or windows.
- Do not let fog grey the far blocks at fit distance (near must stay at or above 1.3 * fit).
- Do not skip `texture.colorSpace = SRGBColorSpace` on color CanvasTextures; the ground and plaques go washed out without it.
- Do not paint plaques before `document.fonts` resolves without a repaint afterward.
- Do not set `fog true` on sprites.
- Do not place the fountain at the raw deco position; use `(deco.x, 0, deco.y - 1)`.
- Do not allocate `Vector3`, `Color` or arrays per frame in the hot path.
- Do not use em dashes anywhere, in code comments or UI copy. Headings are sentence case.
- Do not load any external image, font file or script beyond `three`, `three/addons/` and the Google Fonts already linked by the UI.
