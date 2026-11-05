# Thread Town 3D, version 3: animal characters and the Risk zoo

Adds to `docs/CONTRACT_V2.md` and `docs/CONTRACT.md`; where they disagree, this file wins. Everything not mentioned here stays as it is.

## What version 3 adds

1. **Animal characters.** A department can declare `characters: 'animals'` in `js/data.js`. Its agents are rendered as low-poly animals instead of aliens. The species comes from the agent's name when the name is an animal word (`Otter`, `Falcon`, `Tortoise`, `Fox`...), otherwise from the name's seed. Animals support every pose the aliens do (walk, stand, sit at the café with a prop, swim, dive, climb, wave, hop, slump, and every work pose) so the simulation, leisure, hover pause, picking, overlays, and avatars work unchanged.
2. **The Risk zoo.** Risk's lot becomes a zoo: entrance arch, ticket booth, fenced enclosures with a few resident animals, and a high-wire balance act as the department's work activity. Risk is the first `animals` department; others can opt in later by setting the flag.
3. **A `balance` pose** for both character kinds (used by the high wire).

## data.js

- Risk: `footprint: {w: 12, h: 7}`, `station: 'right'`, `activity: 'tightrope'`, `characters: 'animals'`. Every other department keeps its current values and has no `characters` field (defaults to aliens).
- Add three demo Risk agents so the zoo has residents from the start (names are animal words so the species mapping shows): `Otter` (role `Liquidity Watcher`, cadence `Daily 6:30am`, about `Watches intraday liquidity and flags shortfalls early.`, anim `compute`), `Falcon` (role `Market Risk Scout`, cadence `Hourly`, about `Scans rate moves and reprices the risk dashboards.`, anim `scan`), `Tortoise` (role `Model Validator`, cadence `Mondays`, about `Re-tests the models against last week's actuals.`, anim `write`). All with `demo: true`, `owner: 'Demo'`, `since: 'Demo'`, dept `risk`.

## js/animals3d.js (new ES module)

```js
import * as THREE from 'three';
export const SPECIES = [...];                      // at least 16 ids, see below
export function speciesForName(name) -> speciesId | null   // case-insensitive match on the name, plural and common synonyms allowed
export function makeAnimalMesh(seed, colorHex, speciesId) -> AnimalHandle
export function animateAnimal(handle, agent, time, dt, poseOverride)
export function setAnimalOpacity(handle, alpha)
export function disposeAnimal(handle)
export const ANIMAL_HEIGHT = 0.9;                  // typical standing height before ALIEN_SCALE, like the aliens
```

`AnimalHandle` has the SAME shape as the alien handle so the renderer can treat both the same way:

```js
{
  kind: 'animal', species, seed, color: THREE.Color,
  group: THREE.Group,          // feet at y = 0, facing +z at rotation.y = 0
  traits: { species, build: 'quadruped' | 'biped' | 'bird' },
  parts: { body, head, eyes: [Mesh], pupils: [Mesh], lids: [Mesh], antennae: [], armL, armR, legL, legR, handL, handR, ring, seatY },
  poseState: {...}, swingPhase: 0, sipPhase: 0,
}
```

- `armL`/`armR` are the front legs (quadrupeds), wings (birds), or arms (bipeds); `legL`/`legR` the hind legs. `handL`/`handR` are `Object3D` attach points at the front paw, wing tip, or hand so café props attach exactly as for aliens; for quadrupeds `handR` sits near the mouth when seated so the ice cream reads as being eaten. `seatY` is the body drop for the `sit` pose. `ring` is the flat hover and selection ring on the ground, invisible by default, same size as the alien ring.
- Species (ids): `lion, tiger, elephant, giraffe, zebra, hippo, bear, panda, fox, wolf, monkey, penguin, flamingo, owl, falcon, otter, seal, tortoise, crocodile, kangaroo, rabbit, frog, deer, koala`. Each is built from the helpers in `js/depts/common.js` plus spheres, capsules, and rounded boxes, with a clear silhouette signature (trunk and ears, long neck and ossicones, mane, stripes as dark bands, shell, beak and flippers, wings, long ears, antlers, pouch). Heights between 0.75 and 1.5 units before scale; the giraffe may reach 1.9. Natural species colors; the department color (`colorHex`) appears on a collar, bandana, or scarf so the team still reads. Eyes are the same friendly white-sclera style as the aliens. Share geometries across animals of the same species (module cache) and only clone materials when colors differ.
- `animateAnimal` implements every pose in the v2 list plus `balance` (see below), with quadruped equivalents: `walk` is a four-leg trot with head bob, `sit` is haunches down with front legs straight (or a biped sit), `swim` is body low with paddling legs, `dive` arcs with legs tucked, `climb` alternates front paws, `wave` raises one front paw (or wing) toward +z, `work`, `type`, `lever`, `push`, `point`, `paint`, `throw`, `cheer`, `lookUp`, `swing`, `hop`, `slump` all have readable animal versions. Birds flap a little while walking. Pose state lives on the handle (`handle.poseState`); the per-frame path is allocation-free; everything eases so nothing snaps; rotation rules match the aliens (face `moveDir` while moving, the renderer owns yaw while working, `wave` faces +z).
- `setAnimalOpacity` mirrors `setAlienOpacity` (sets `transparent` and `opacity` on every material of this handle without affecting shared materials of other animals: clone a material the first time it is faded, as aliens3d does with `ownedBy`).
- Avatars: the renderer's existing portrait scene frames an alien 0.9 tall; `makeAnimalMesh` returns `handle.portraitScale` (a number, default 1) the renderer multiplies into the portrait so tall species still fit the 96 by 120 frame.

## js/aliens3d.js addition

Add the `balance` pose: feet together, both arms straight out to the sides, slow sway of the body (roll 0.12 rad at 0.7 Hz) with the arms counter-tilting, antennae tense. Nothing else changes.

## js/depts/risk.js (rewrite)

Risk becomes the Thread Zoo. `id` stays `'risk'`. `activityLabel = 'Walking the high wire'`.

- **Building** (`buildBuilding`, local space per v2, footprint 12 by 7, front at z = 7): a perimeter fence (posts every 1.0 unit with two rails, `BRAND.woodDark`) around the lot with a grand entrance arch on the south face centered on the door (two stone pillars, a curved top with a `ZOO` sign drawn on a canvas decal in Kanit, flanking lanterns), a small ticket booth with a striped awning in `dept.accent` just inside, three enclosures separated by low fences: a rocky pen (boulders, a small cave) on the west, a water pen (a shallow pool using a translucent aqua plane, reeds, a log) in the middle-north, and a savanna pen (an acacia-style flat-top tree, tall grass tufts) on the east; a keeper's hut with a hip roof in `dept.wall` and an accent door; benches; a popcorn or ice cream cart. Three to five **resident animals** built with `makeAnimalMesh` from `../animals3d.js` (for example a sleeping lion on the rocks, two flamingos in the pool, a tortoise by the hut, a giraffe whose head rises above the east fence), scaled 1.3 like agents, each with a gentle idle animation in `update` (breathing via `animateAnimal` with a fake agent in `stand`, flamingo head dips, tortoise shuffle). Residents are decoration: not pickable as agents, no overlay tags. Return one `glass()` material for the hut and booth windows, and lanterns as `lights` (at most two).
- **Activity** (`buildActivity`, station local space 4 by 4): two tall posts (3.2 units) at opposite corners of the station with a taut wire between them (a thin cylinder), small platforms with ladders at each post top, a safety net (a translucent wireframe-looking grid plane) 1.2 units above the ground spanning the station, and a balance pole prop. `anchor` is the top of the near platform (the one nearest the stub path), `yaw` faces along the wire, `pose: 'balance'`, `enter: 'walk'` (the renderer walks the agent to the anchor; the activity then owns the agent's position along the wire). `update` while working: move the alien or animal along the wire from platform to platform and back over a 9 s round trip with a wobble (roll plus a tiny lateral offset peaking mid-wire), hold the balance pole in both hands (position it at the hands each frame), and show a small flag of confetti or a cheer sparkle at each platform arrival. When not working the pole rests on the near platform and a resident bird perches on the far post. Night: lantern glow along the wire posts.

Imports allowed in `risk.js`: `./common.js`, `../animals3d.js`, `three`, `three/addons/`.

## Renderer integration (js/render3d.js)

- Import `animals3d.js`. When creating an agent's character, if `agent.dept.characters === 'animals'`, use `makeAnimalMesh(seed, dept.alien || dept.accent, speciesForName(agent.spec.name))` and `animateAnimal`, `setAnimalOpacity`, `disposeAnimal`; otherwise the alien functions. Store `rec.animate`, `rec.setOpacity`, `rec.dispose` per record so the rest of the renderer calls them without caring about the kind. Everything downstream (leisure props, hover pause, ring, overlays, picking via `group.userData.pick`, contact shadow, scale) stays the same.
- Avatars: `avatar(agent)` and `previewAvatar(name, role, deptId)` build the right kind for the department and apply `handle.portraitScale`.
- The `balance` pose is passed through like any other activity pose.
- `TT.town.previewAvatar` is called by the add-agent form as the department changes, so switching the department to Risk should show the animal preview.

## UI

- Tooltip and inspector show `Species: <name>` under the role for animal characters (the renderer exposes `agent.mesh.species`). Add a `species` line only when `agent.mesh && agent.mesh.kind === 'animal'`.
- No other UI changes.

## Verification each module must do

- Syntax via `node --check` on `.mjs` copies; Node import tests as in v2 (stub `window.TT`, rewrite `three` imports to `node_modules`, guard any `document` use inside build functions).
- `animals3d`: build every species, run every pose for 300 frames with a fake agent, assert no NaN in any part, that `handR` exists and sits within 0.5 units of the head when seated, that `setAnimalOpacity(0.5)` touches every material of that handle and no material of another handle.
- `risk.js`: build the building and the activity with a fake ctx, run `update` idle and working with a fake handle (`{ group: new THREE.Group(), parts: { handL: new THREE.Object3D(), handR: new THREE.Object3D(), body: new THREE.Object3D() } }`) for 300 frames each, assert the handle group travels at least 2 units along the wire while working and returns, and that residents exist.
- No em dashes anywhere. Sentence case.
