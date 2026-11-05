# Thread Town 3D, version 12: playable on a phone

Adds to `docs/CONTRACT_V11.md` and earlier; where they disagree, this file wins. No world changes. Laptops keep exactly today's controls and look; everything here appears only on touch screens or under the Phone quality tier.

## Goal, in Jackson's words

The hosted link (https://jackson-cummiskey.github.io/Thread-Town/) opens on a phone and shows the town, but nothing that needs keys works. Make it playable on a phone: walk, ride, hoverboard, boats, golf, the runner, the shop.

## Files

```
js/touch.js         new: the touch control layer (joystick, buttons, look drag, swipes), DOM plus a per-frame read()
js/render3d.js      wiring: merge touch input into the walk feed and the subway feed, orbit camera by default on touch, the Phone quality tier, HUD placement
js/subway.js        swipe input (lane left, lane right, jump, slide) and a tap for the hoverboard power-up
js/ui.js, index.html, css/style.css   touch markup and styles, layouts at 390 px wide in portrait and landscape, the quality select gains Phone
```

## Detection

`isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0` evaluated once; a `touch` class on `<html>` drives the CSS. A laptop with a touchscreen shows the controls only after the first touch event (`touchstart` on the view) and hides them again after a mouse move, so a mouse user never sees them.

## The touch layer (js/touch.js)

```js
export function createTouch(ctx) -> { el, read(out), active, setMode(mode), vibrate(ms), destroy() }
```
- `ctx = { mount, isTouch, onToggleView, onQuit }`. `setMode('walk' | 'ride' | 'hover' | 'boat' | 'golf' | 'cart' | 'runner' | 'none')` shows the right buttons; the renderer calls it when the player state changes.
- **Joystick** (left third of the screen, appears where the thumb lands, 120 px ring, 44 px knob, dead zone 12 percent): `fwd` and `side` in -1..1; past 85 percent of the ring `run` is true.
- **Look drag** (the rest of the screen outside buttons): `lookDX`, `lookDY` in the same units the mouse delivers today (pixels times the renderer's sensitivity), two-finger pinch sets `zoom`.
- **Buttons** (right side, 56 px, Thread navy with aqua glyphs, 60 percent opacity, press feedback): walk: `E` (interact), `Jump`, `H` (hoverboard when owned), `Map`; ride and hover: `E`, `Boost` (hold), `Jump` (hover only); boat: `E`; cart: `E`, `Tab` (drive); golf: `Swing` (hold to charge, release to strike, drives `jumpHeld`), `Club` (cycles club1, club2, club3), `Quit`; runner: nothing but `Pause` and the hoverboard tap, swipes do the rest. A `View` button toggles chase and overview where the keyboard uses V today.
- **Swipes** on the runner (anywhere, 40 px threshold, 250 ms): left, right, up, down, exposed as one-frame edges `swipeLeft`, `swipeRight`, `swipeUp`, `swipeDown`; a tap is `tap`.
- `read(out)` fills a preallocated object with: `fwd, side, run, jump, jumpHeld, interact, hover, boost, drive, toggleView, map, club, quit, lookDX, lookDY, zoom, swipeLeft, swipeRight, swipeUp, swipeDown, tap` and clears the edges; allocation free.
- `vibrate(ms)` wraps `navigator.vibrate` when present (landing, a catch, holing out).
- No `preventDefault` on the page except inside the view, so the header, modals and the shop scroll normally. The controls never cover the HUD, the prompt pill or the minimap (the minimap moves above the right buttons on touch).

## Wiring (js/render3d.js)

- `feedPlayerInput` merges `touch.read(TOUCH)` the same way it merges `extInput` (fwd and side added and clamped, edges ORed, lookDX and lookDY added, zoom added, `hover`, `boost`, `drive`, `club`, `quit`, `map` mapped to their walk keys). The subway feed takes the swipes and the tap.
- On touch devices the camera starts in **orbit** mode (OrbitControls handles one finger orbit and pinch zoom), not the free camera; the free camera stays available from the header.
- Tapping an agent or a building picks it (today's click path, with a 12 px slop so a tap does not become a drag).
- Walk mode on touch: no pointer lock request; the look drag replaces it.
- `setQuality('phone')`: shadow map 1024, no far cascade, no AO decals, no birds, no streak, nature density 55 percent (trees keep the forest cores), tufts and flowers 30 percent, pixel ratio capped at 1.5, fog a little nearer, the water ripple mesh off. Picked by default on touch devices (saved like the other tiers); the header select shows High, Balanced, Phone.
- Phone layout: the header collapses to the logo, the coin count, the leaderboard and a menu button that opens the rest (picker, quality, legend); the HUD cards scale to 13 px type; the minimap is 120 px; the shop and leaderboard modals fit 390 px wide and scroll; landscape puts the joystick and buttons in the lower corners with the HUD along the top.

## Runner (js/subway.js)

- Swipe left and right change lanes, up jumps, down slides; a tap activates the hoverboard power-up when owned. The start screen and the game-over card have a 'Tap to run' line on touch. The chaser and everything else unchanged.

## Verification

- touch.js: a Node test with a DOM stub drives synthetic pointer events: joystick values, run past 85 percent, button edges fire once, hold drives jumpHeld, swipes classified at the thresholds, read() allocation free over 600 frames.
- render3d: headless build with isTouch forced: orbit mode by default, setQuality('phone') reduces the draw calls and instance counts (report the numbers against High), the walk feed takes joystick fwd and interact, the subway feed takes a swipe; no change at all when isTouch is false (draw calls and input identical to v11.1).
- CSS: no horizontal scroll at 390 px wide, controls do not overlap the HUD, prompt or minimap (bounding boxes checked in the browser pass).
- `node --check` everywhere; no em dashes; sentence case.
