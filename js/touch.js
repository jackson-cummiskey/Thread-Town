/* Thread Town: the touch control layer (CONTRACT_V12 "Detection" and "The touch layer").

   createTouch(ctx) -> { el, read(out), active, setMode(mode, flags), vibrate(ms), destroy() }

   ctx = {
     mount,         the view the layer lives in (#stage-host by default): the DOM is appended here and the
                    pointer events are read here, so a touch on the WebGL canvas, on a pass-through HUD piece
                    or on the runner card all reach the layer and the canvas keeps its own click path
     isTouch,       optional; defaults to matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
     hybrid,        optional; defaults to matchMedia('(pointer: fine)').matches: a laptop with a touchscreen
                    shows the controls after the first touch and hides them again after a mouse move
     onToggleView,  optional, called when the View button is pressed (the toggleView edge is set as well)
     onQuit,        optional, called with 'golf' (the Quit button) or 'runner' (the Pause button); the quit
                    edge is set as well
     lookScale,     optional multiplier on the look deltas (1 by default: css pixels, the units the mouse delivers)
   }

   The layer is one element (#touch-layer) with the joystick ring (#touch-stick, 120 px, a 44 px knob) that
   appears where the thumb lands in the left third of the view, and the button column (#touch-buttons,
   56 px round buttons, Thread navy with aqua glyphs) in the lower right. setMode picks the buttons:
     walk    View, E, Jump, H (flags.hover === false hides it), Map
     ride    View, E, Boost (hold)
     hover   View, E, Boost (hold), Jump
     boat    View, E
     cart    View, E, Tab (drive to the ball)
     golf    View, Swing (hold to charge, release to strike: jump edge plus jumpHeld), Club (cycles 1, 2, 3), Quit
     runner  Pause (the quit edge; the runner has no pause state, the renderer maps it to the subway quit)
     none    nothing
   and writes --touch-stack (the height of the button block) on the mount so the css can keep the minimap
   above the buttons.

   Gestures on the view: in the left third a touch starts the joystick (fwd and side in -1..1, a 12 percent
   dead zone, run past 85 percent of the ring); anywhere else a drag is the look (lookDX, lookDY in css
   pixels, the units the mouse delivers today) and a second finger pinches zoom (wheel deltaY units, fingers
   apart zooms in). In runner mode the swipes (40 px within 250 ms) are one-frame edges swipeLeft, swipeRight,
   swipeUp, swipeDown; a tap (under 12 px, under 300 ms) is the tap edge in every mode.

   read(out) fills out with fwd, side, run, jump, jumpHeld, interact, hover, boost, drive, toggleView, map,
   club, quit, lookDX, lookDY, zoom, swipeLeft, swipeRight, swipeUp, swipeDown, tap and clears the edges
   and the accumulated deltas. It allocates nothing. club is 0, or 1, 2, 3 on the frame the Club button
   cycled to that club.

   preventDefault is only ever called on the mount (the view), on touchmove and gesturestart, so the page
   outside the view scrolls normally. The html element gets the class 'touch' while the controls are active;
   css/style.css does the rest. */

const RING = 120, RADIUS = RING / 2, DEAD = 0.12, RUN_AT = 0.85;
const SWIPE_PX = 40, SWIPE_MS = 250, TAP_PX = 12, TAP_MS = 300;
const ZOOM_PER_PX = 2.5;            // a 40 px pinch is one wheel notch (100 units)
const BTN = 56, GAP = 10, EDGE = 12, COLS = 2;
const PRESS_VIBRATE_MS = 8;

const BUTTONS = [
  { act: 'view', label: 'View', title: 'Near or far view (V)' },
  { act: 'interact', label: 'E', title: 'Interact (E)' },
  { act: 'jump', label: 'Jump', title: 'Jump or dive (Space)' },
  { act: 'hover', label: 'H', title: 'Hoverboard (H)' },
  { act: 'map', label: 'Map', title: 'Show or hide the map (M)' },
  { act: 'boost', label: 'Boost', title: 'Hold to boost (Shift)' },
  { act: 'drive', label: 'Tab', title: 'Drive to the ball (Tab)' },
  { act: 'swing', label: 'Swing', title: 'Hold to charge, release to swing (Space)' },
  { act: 'club', label: 'Club', title: 'Next club (1, 2, 3)' },
  { act: 'quit', label: 'Quit', title: 'Leave the course (X)' },
  { act: 'pause', label: 'Pause', title: 'Leave the run (E)' },
];
const MODES = {
  walk: ['view', 'interact', 'jump', 'hover', 'map'],
  ride: ['view', 'interact', 'boost'],
  hover: ['view', 'interact', 'boost', 'jump'],
  boat: ['view', 'interact'],
  cart: ['view', 'interact', 'drive'],
  golf: ['view', 'swing', 'club', 'quit'],
  runner: ['pause'],
  none: [],
};
const STICK_MODES = { walk: 1, ride: 1, hover: 1, boat: 1, cart: 1, golf: 1 };

function detectTouch() {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true;
  } catch (e) { /* no media queries here */ }
  try { return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0; } catch (e) { return false; }
}
function detectHybrid() {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches; } catch (e) { return false; }
}
function nowMs() {
  try { if (typeof performance !== 'undefined' && performance.now) return performance.now(); } catch (e) { /* fall through */ }
  return Date.now();
}
function stamp(ev) {
  const t = ev && ev.timeStamp;
  return typeof t === 'number' && isFinite(t) && t > 0 ? t : nowMs();
}
function tagOf(node) { return node && typeof node.tagName === 'string' ? node.tagName.toUpperCase() : ''; }
function isControl(node) { const t = tagOf(node); return t === 'BUTTON' || t === 'A' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'LABEL'; }
/* True when node is root or sits under it (no Node.contains, so a small DOM stub works). */
function within(node, root) {
  let n = node;
  for (let i = 0; n && i < 64; i++) { if (n === root) return true; n = n.parentNode; }
  return false;
}
function idOf(node) { return node && typeof node.id === 'string' ? node.id : ''; }

export function createTouch(ctx) {
  ctx = ctx || {};
  const doc = typeof document !== 'undefined' ? document : null;
  const mount = ctx.mount || (doc && doc.getElementById ? doc.getElementById('stage-host') : null) || null;
  const isTouch = ctx.isTouch !== undefined ? !!ctx.isTouch : detectTouch();
  const hybrid = ctx.hybrid !== undefined ? !!ctx.hybrid : detectHybrid();
  const lookScale = isFinite(ctx.lookScale) && ctx.lookScale > 0 ? ctx.lookScale : 1;

  /* The per-frame state read() copies out. Edges are cleared by read(); held flags live beside it. */
  const S = {
    fwd: 0, side: 0, run: false, jump: false, interact: false, hover: false, drive: false, toggleView: false, map: false,
    club: 0, quit: false, lookDX: 0, lookDY: 0, zoom: 0, swipeLeft: false, swipeRight: false, swipeUp: false, swipeDown: false, tap: false,
  };
  let heldJump = false, heldBoost = false, clubIdx = 0;
  const snapshot = {
    fwd: 0, side: 0, run: false, jump: false, jumpHeld: false, interact: false, hover: false, boost: false, drive: false, toggleView: false,
    map: false, club: 0, quit: false, lookDX: 0, lookDY: 0, zoom: 0, swipeLeft: false, swipeRight: false, swipeUp: false, swipeDown: false, tap: false,
  };

  let mode = 'none', active = false, destroyed = false;
  let W = 390, H = 600, rectL = 0, rectT = 0;
  const stick = { id: -1, cx: 0, cy: 0 };
  const look = { id: -1, x: 0, y: 0 };
  const pinch = { id: -1, x: 0, y: 0, dist: 0 };
  const tapRec = { id: -1, x0: 0, y0: 0, t0: 0, done: false };
  const btnRecs = [];     // { act, el, pid }

  /* ----- DOM ----- */
  let el = null, stickEl = null, knobEl = null, btnsEl = null;
  if (doc && typeof doc.createElement === 'function') {
    el = doc.createElement('div');
    el.id = 'touch-layer'; el.className = 'touch-layer'; el.setAttribute('data-mode', 'none'); el.setAttribute('aria-hidden', 'true');
    stickEl = doc.createElement('div'); stickEl.id = 'touch-stick'; stickEl.className = 'touch-stick'; stickEl.hidden = true;
    knobEl = doc.createElement('div'); knobEl.className = 'touch-knob';
    stickEl.appendChild(knobEl);
    btnsEl = doc.createElement('div'); btnsEl.id = 'touch-buttons'; btnsEl.className = 'touch-buttons';
    for (const b of BUTTONS) {
      const be = doc.createElement('button');
      be.type = 'button'; be.className = 'touch-btn touch-btn-' + b.act; be.setAttribute('data-act', b.act); be.title = b.title;
      be.textContent = b.label; be.hidden = true;
      btnsEl.appendChild(be);
      btnRecs.push({ act: b.act, el: be, pid: -1 });
    }
    el.appendChild(stickEl); el.appendChild(btnsEl);
    if (isTouch && mount && typeof mount.appendChild === 'function') mount.appendChild(el);
  }

  function setHtmlClass(on) {
    if (!doc || !doc.documentElement || !doc.documentElement.classList) return;
    const cl = doc.documentElement.classList;
    if (on) cl.add('touch'); else cl.remove('touch');
  }
  function setStackVar(px) {
    if (!mount || !mount.style) return;
    const v = px + 'px';
    if (typeof mount.style.setProperty === 'function') mount.style.setProperty('--touch-stack', v);
    else mount.style['--touch-stack'] = v;
  }

  /* ----- detection: the html class and `active` ----- */
  function activate() {
    if (active || destroyed || !isTouch) return;
    active = true;
    setHtmlClass(true);
  }
  function deactivate() {
    if (!active) return;
    active = false;
    setHtmlClass(false);
    releaseAll();
  }
  // a phone (no fine pointer) shows the controls at once; a hybrid laptop waits for the first touch
  if (isTouch && !hybrid) activate();

  /* ----- helpers ----- */
  function findBtn(node) {
    if (!btnsEl || !within(node, btnsEl)) return null;
    let n = node;
    for (let i = 0; n && n !== btnsEl && i < 8; i++) {
      for (let k = 0; k < btnRecs.length; k++) if (btnRecs[k].el === n) return btnRecs[k];
      n = n.parentNode;
    }
    return null;
  }
  /* The view: the mount itself, its WebGL canvas, the layer, and the runner's centre card (so a tap on
     'Tap to run' counts) but never a real control (the card's Shop button, the Change character link, the
     minimap canvas). */
  function isViewTarget(t) {
    if (!t || t === mount) return true;
    if (tagOf(t) === 'CANVAS' && t.parentNode === mount) return true;
    if (el && within(t, el)) return true;
    if (isControl(t)) return false;
    let n = t;
    for (let i = 0; n && n !== mount && i < 32; i++) {
      const id = idOf(n);
      if (id === 'runner-center' || id === 'runner-hud' || id === 'walk-prompt' || id === 'golf-msg') return true;
      if (id === 'minimap' || id === 'walk-hud' || id === 'insp-card') return false;
      n = n.parentNode;
    }
    return false;
  }
  function measure() {
    if (!mount || typeof mount.getBoundingClientRect !== 'function') { rectL = 0; rectT = 0; return; }
    const r = mount.getBoundingClientRect();
    rectL = r.left || 0; rectT = r.top || 0;
    if (r.width > 0) W = r.width;
    if (r.height > 0) H = r.height;
  }
  function closeMenu() {
    if (!doc || !doc.getElementById) return;
    const m = doc.getElementById('menu-toggle');
    if (m && m.checked) m.checked = false;
  }

  /* ----- the joystick ----- */
  function stickStart(id, x, y) {
    stick.id = id; stick.cx = x; stick.cy = y;
    S.fwd = 0; S.side = 0; S.run = false;
    if (stickEl) {
      stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px';
      stickEl.hidden = false; stickEl.classList.remove('run');
      if (knobEl) knobEl.style.transform = 'translate(-50%, -50%)';
    }
  }
  function stickMove(x, y) {
    const dx = x - stick.cx, dy = y - stick.cy;
    const dist = Math.hypot(dx, dy);
    const m = Math.min(dist, RADIUS) / RADIUS;
    let mag = 0;
    if (m > DEAD) mag = (m - DEAD) / (1 - DEAD);
    if (mag > 0 && dist > 0) { S.side = dx / dist * mag; S.fwd = -dy / dist * mag; }
    else { S.side = 0; S.fwd = 0; }
    S.run = m > RUN_AT;
    if (knobEl) {
      const kd = Math.min(dist, RADIUS), kx = dist > 0 ? dx / dist * kd : 0, ky = dist > 0 ? dy / dist * kd : 0;
      knobEl.style.transform = 'translate(-50%, -50%) translate(' + kx.toFixed(1) + 'px, ' + ky.toFixed(1) + 'px)';
    }
    if (stickEl) { if (S.run) stickEl.classList.add('run'); else stickEl.classList.remove('run'); }
  }
  function stickEnd() {
    stick.id = -1; S.fwd = 0; S.side = 0; S.run = false;
    if (stickEl) { stickEl.hidden = true; stickEl.classList.remove('run'); }
  }

  /* ----- the look drag and the pinch ----- */
  function lookStart(id, x, y) { look.id = id; look.x = x; look.y = y; }
  function pinchStart(id, x, y) { pinch.id = id; pinch.x = x; pinch.y = y; pinch.dist = Math.hypot(look.x - x, look.y - y); }
  function pinchUpdate() {
    const d = Math.hypot(look.x - pinch.x, look.y - pinch.y);
    S.zoom += (pinch.dist - d) * ZOOM_PER_PX;
    pinch.dist = d;
  }

  /* ----- taps and swipes ----- */
  function tapStart(id, x, y, t) { tapRec.id = id; tapRec.x0 = x; tapRec.y0 = y; tapRec.t0 = t; tapRec.done = false; }
  function classifySwipe(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) { if (dx > 0) S.swipeRight = true; else S.swipeLeft = true; }
    else { if (dy > 0) S.swipeDown = true; else S.swipeUp = true; }
    tapRec.done = true;
  }
  function tapMove(x, y, t) {
    if (tapRec.done || mode !== 'runner') return;
    const dx = x - tapRec.x0, dy = y - tapRec.y0;
    if (Math.hypot(dx, dy) >= SWIPE_PX) {
      if (t - tapRec.t0 <= SWIPE_MS) classifySwipe(dx, dy); else tapRec.done = true;
    }
  }
  function tapEnd(x, y, t) {
    const dx = x - tapRec.x0, dy = y - tapRec.y0, dist = Math.hypot(dx, dy), dt = t - tapRec.t0;
    if (!tapRec.done) {
      if (mode === 'runner' && dist >= SWIPE_PX && dt <= SWIPE_MS) classifySwipe(dx, dy);
      else if (dist < TAP_PX && dt < TAP_MS) S.tap = true;
    }
    tapRec.id = -1; tapRec.done = false;
  }

  /* ----- the buttons ----- */
  function act(name, down) {
    switch (name) {
      case 'view': if (down) { S.toggleView = true; if (typeof ctx.onToggleView === 'function') ctx.onToggleView(); } break;
      case 'interact': if (down) S.interact = true; break;
      case 'jump': case 'swing': if (down) S.jump = true; heldJump = down; break;
      case 'hover': if (down) S.hover = true; break;
      case 'map': if (down) S.map = true; break;
      case 'boost': heldBoost = down; break;
      case 'drive': if (down) S.drive = true; break;
      case 'club': if (down) { clubIdx = clubIdx % 3 + 1; S.club = clubIdx; } break;
      case 'quit': if (down) { S.quit = true; if (typeof ctx.onQuit === 'function') ctx.onQuit('golf'); } break;
      case 'pause': if (down) { S.quit = true; if (typeof ctx.onQuit === 'function') ctx.onQuit('runner'); } break;
      default: break;
    }
  }
  function btnDown(rec, ev) {
    if (rec.pid >= 0) return;
    rec.pid = ev.pointerId !== undefined ? ev.pointerId : 0;
    if (rec.el.classList) rec.el.classList.add('down');
    try { if (typeof rec.el.setPointerCapture === 'function' && ev.pointerId !== undefined) rec.el.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ }
    act(rec.act, true);
    vibrate(PRESS_VIBRATE_MS);
  }
  function btnUp(rec) {
    rec.pid = -1;
    if (rec.el.classList) rec.el.classList.remove('down');
    act(rec.act, false);
  }
  function releaseAll() {
    if (stick.id >= 0) stickEnd();
    look.id = -1; pinch.id = -1; tapRec.id = -1; tapRec.done = false;
    for (let k = 0; k < btnRecs.length; k++) if (btnRecs[k].pid >= 0) btnUp(btnRecs[k]);
    heldJump = false; heldBoost = false;
  }

  /* ----- pointer events on the mount ----- */
  function onDown(ev) {
    if (destroyed || !isTouch) return;
    const type = ev.pointerType || 'touch';
    if (type === 'mouse') { if (hybrid) deactivate(); return; }
    const rec = findBtn(ev.target);
    if (rec) { activate(); btnDown(rec, ev); return; }
    if (!isViewTarget(ev.target)) return;
    activate();
    closeMenu();
    const id = ev.pointerId !== undefined ? ev.pointerId : 0;
    measure();
    const x = (ev.clientX || 0) - rectL, y = (ev.clientY || 0) - rectT, t = stamp(ev);
    if (mode === 'none') return;
    if (tapRec.id < 0) tapStart(id, x, y, t);
    if (mode === 'runner') return;
    if (stick.id < 0 && STICK_MODES[mode] && x < W / 3) { stickStart(id, x, y); return; }
    if (look.id < 0) { lookStart(id, x, y); return; }
    if (pinch.id < 0) pinchStart(id, x, y);
  }
  function onMove(ev) {
    if (destroyed || !isTouch) return;
    const type = ev.pointerType || 'touch';
    if (type === 'mouse') { if (hybrid && active) deactivate(); return; }
    if (!active) return;
    const id = ev.pointerId !== undefined ? ev.pointerId : 0;
    const x = (ev.clientX || 0) - rectL, y = (ev.clientY || 0) - rectT;
    if (id === stick.id) { stickMove(x, y); return; }
    if (id === tapRec.id) tapMove(x, y, stamp(ev));
    if (id === look.id) {
      if (pinch.id >= 0) { look.x = x; look.y = y; pinchUpdate(); }
      else { S.lookDX += (x - look.x) * lookScale; S.lookDY += (y - look.y) * lookScale; look.x = x; look.y = y; }
      return;
    }
    if (id === pinch.id) { pinch.x = x; pinch.y = y; pinchUpdate(); }
  }
  function onUp(ev) {
    if (destroyed || !isTouch) return;
    const id = ev.pointerId !== undefined ? ev.pointerId : 0;
    for (let k = 0; k < btnRecs.length; k++) if (btnRecs[k].pid === id) { btnUp(btnRecs[k]); return; }
    if (!active) return;
    const x = (ev.clientX || 0) - rectL, y = (ev.clientY || 0) - rectT;
    if (id === tapRec.id) tapEnd(x, y, stamp(ev));
    if (id === stick.id) { stickEnd(); return; }
    if (id === look.id) {
      if (pinch.id >= 0) { look.id = pinch.id; look.x = pinch.x; look.y = pinch.y; pinch.id = -1; }
      else look.id = -1;
      return;
    }
    if (id === pinch.id) pinch.id = -1;
  }
  function onCancel(ev) { onUp(ev); }
  function onTouchStart(ev) {
    if (destroyed || !isTouch || active) return;
    if (isViewTarget(ev.target) || findBtn(ev.target)) activate();
  }
  function onTouchMove(ev) {
    if (!active || !ev.cancelable) return;
    if (isViewTarget(ev.target) || findBtn(ev.target)) ev.preventDefault();
  }
  function onGesture(ev) { if (active && ev.cancelable) ev.preventDefault(); }
  function onContext(ev) { if (active && findBtn(ev.target)) ev.preventDefault(); }
  function onBlur() { releaseAll(); }

  const bound = [];
  function listen(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    bound.push({ target, type, fn, opts });
  }
  if (isTouch && mount) {
    listen(mount, 'pointerdown', onDown);
    listen(mount, 'pointermove', onMove);
    listen(mount, 'pointerup', onUp);
    listen(mount, 'pointercancel', onCancel);
    listen(mount, 'touchstart', onTouchStart, { passive: true });
    listen(mount, 'touchmove', onTouchMove, { passive: false });
    listen(mount, 'gesturestart', onGesture, { passive: false });
    listen(mount, 'contextmenu', onContext);
    if (typeof window !== 'undefined') listen(window, 'blur', onBlur);
    if (mount.style) mount.style.touchAction = 'none';
  }

  /* ----- the API ----- */
  function setMode(next, flags) {
    const m = typeof next === 'string' && MODES[next] ? next : 'none';
    const list = MODES[m];
    const showHover = !(flags && flags.hover === false);
    let shown = 0;
    for (let k = 0; k < btnRecs.length; k++) {
      const rec = btnRecs[k];
      let on = list.indexOf(rec.act) >= 0;
      if (on && rec.act === 'hover' && !showHover) on = false;
      if (rec.el.hidden !== !on) rec.el.hidden = !on;
      if (on) shown++;
    }
    const rows = Math.ceil(shown / COLS);
    setStackVar(rows > 0 ? rows * BTN + (rows - 1) * GAP + EDGE : 0);
    if (m !== mode) {
      mode = m;
      if (el) el.setAttribute('data-mode', m);
      // the grid follows the mode's order (hover: E, Boost, Jump), not the build order of BUTTONS
      if (btnsEl) for (let k = 0; k < list.length; k++) { const rec = btnRecs.find(r => r.act === list[k]); if (rec && rec.el.parentNode === btnsEl) { btnsEl.removeChild(rec.el); btnsEl.appendChild(rec.el); } }
      releaseAll();
      S.fwd = 0; S.side = 0; S.run = false;
    }
    return mode;
  }
  function read(out) {
    const o = out || snapshot;
    o.fwd = S.fwd; o.side = S.side; o.run = S.run;
    o.jump = S.jump; o.jumpHeld = heldJump; o.interact = S.interact; o.hover = S.hover; o.boost = heldBoost; o.drive = S.drive;
    o.toggleView = S.toggleView; o.map = S.map; o.club = S.club; o.quit = S.quit;
    o.lookDX = S.lookDX; o.lookDY = S.lookDY; o.zoom = S.zoom;
    o.swipeLeft = S.swipeLeft; o.swipeRight = S.swipeRight; o.swipeUp = S.swipeUp; o.swipeDown = S.swipeDown; o.tap = S.tap;
    S.jump = S.interact = S.hover = S.drive = S.toggleView = S.map = S.quit = false; S.club = 0;
    S.lookDX = 0; S.lookDY = 0; S.zoom = 0;
    S.swipeLeft = S.swipeRight = S.swipeUp = S.swipeDown = S.tap = false;
    return o;
  }
  function vibrate(ms) {
    if (!active) return false;
    try { if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') return !!navigator.vibrate(Math.max(0, ms | 0)); } catch (e) { /* not allowed here */ }
    return false;
  }
  function destroy() {
    if (destroyed) return;
    releaseAll();
    for (const b of bound) { try { b.target.removeEventListener(b.type, b.fn, b.opts); } catch (e) { /* ignore */ } }
    bound.length = 0;
    if (el && el.parentNode && typeof el.parentNode.removeChild === 'function') el.parentNode.removeChild(el);
    setStackVar(0);
    deactivate();
    destroyed = true;
  }

  const api = { el, read, setMode, vibrate, destroy, mode: () => mode };
  Object.defineProperty(api, 'active', { get: () => active, enumerable: true });
  Object.defineProperty(api, 'isTouch', { get: () => isTouch, enumerable: true });
  return api;
}
