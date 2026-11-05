/* Procedural alien sprites. Every agent gets a unique alien seeded from its name
   (shape, eyes, antennae, spots). Body color comes from the agent's department so a
   team's agents read as one crew.

   Frames: 0 stand, 1-4 walk cycle, 5-6 typing at a desk, 7 blink, 8 slumped (error). */
(function () {
  const TT = window.TT;

  TT.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  TT.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function hexToHsl(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  const SPRITE_W = 16, SPRITE_H = 20;
  const FRAME_COUNT = 9;

  TT.makeAlien = function (seed, colorHex) {
    const r = TT.rng(TT.hash(seed));
    const base = hexToHsl(colorHex || '#75CCD0');
    const hue = base.h, sat = Math.max(18, Math.min(72, base.s)), lum = Math.max(42, Math.min(66, base.l));
    const shape = ['blob', 'tall', 'squat', 'blob', 'pear'][Math.floor(r() * 5)];
    const eyes = [1, 2, 2, 3][Math.floor(r() * 4)];
    const antennae = [0, 1, 2, 2][Math.floor(r() * 4)];
    const spotted = r() < 0.55;
    const accent = hsl((hue + 150 + Math.floor(r() * 60)) % 360, 85, 66);
    const body = hsl(hue, sat, lum), shade = hsl(hue, sat, lum - 16), light = hsl(hue, sat, Math.min(90, lum + 14));
    const ink = '#0e1b2e';

    let bw, bh;
    if (shape === 'blob') { bw = 10; bh = 11; }
    else if (shape === 'tall') { bw = 8; bh = 13; }
    else if (shape === 'pear') { bw = 10; bh = 12; }
    else { bw = 12; bh = 9; }
    const cx = 8;
    const spots = [];
    for (let i = 0; i < 4; i++) spots.push([Math.floor(r() * bw) - bw / 2, Math.floor(r() * bh)]);

    function inside(x, y, by, dx, dy) {
      let halfW = bw / 2;
      if (shape === 'pear') halfW = bw / 2 * (0.7 + 0.3 * ((y - by) / bh)); // narrower at the top
      const nx = (x + 0.5 - cx + (dx || 0)) / halfW;
      const ny = (y + 0.5 - (by + bh / 2) + (dy || 0)) / (bh / 2);
      if (shape === 'tall') {
        const ax = Math.abs(nx), ay = Math.abs(ny);
        if (ax > 1 || ay > 1) return false;
        return !(ax > 0.72 && ay > 0.72 && (ax - 0.72) + (ay - 0.72) > 0.36);
      }
      return nx * nx + ny * ny <= 1;
    }

    const frames = [];
    for (let f = 0; f < FRAME_COUNT; f++) {
      const c = document.createElement('canvas');
      c.width = SPRITE_W; c.height = SPRITE_H;
      const g = c.getContext('2d');
      const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };

      const walkPhase = f >= 1 && f <= 4 ? f - 1 : -1; // 0 L-step, 1 pass, 2 R-step, 3 pass
      const typing = f === 5 || f === 6;
      const blink = f === 7;
      const slump = f === 8;
      const bob = walkPhase === 1 || walkPhase === 3 ? -1 : slump ? 1 : 0;
      const bottom = 17 + bob;
      const by = bottom - bh;

      // legs: lifted leg shows only its lower pixel row
      const liftL = walkPhase === 0, liftR = walkPhase === 2;
      for (let i = 0; i < 2; i++) {
        if (!liftL) px(cx - 3 + i, 17, shade);
        px(cx - 3 + i, 18, shade);
        if (!liftR) px(cx + 1 + i, 17, shade);
        px(cx + 1 + i, 18, shade);
      }
      if (liftL) px(cx - 3, 16, shade);
      if (liftR) px(cx + 2, 16, shade);

      // body
      for (let y = by; y < bottom; y++) for (let x = 0; x < SPRITE_W; x++) {
        if (!inside(x, y, by)) continue;
        let col = body;
        if (!inside(x, y, by, -1, -1)) col = shade;
        else if (!inside(x, y, by, 1.5, 1.5)) col = light;
        px(x, y, col);
      }
      if (spotted) for (const [sx, sy] of spots) {
        const x = cx + sx, y = by + sy;
        if (inside(x, y, by) && inside(x, y, by, -1, -1)) px(x, y, shade);
      }

      // arms
      const ay = by + Math.floor(bh * 0.5);
      const armL = Math.floor(cx - bw / 2) - 1, armR = Math.ceil(cx + bw / 2);
      if (typing) {
        const up = f === 5 ? 0 : 1;
        // arms reach forward and down toward the desk, alternating
        px(armL, ay, shade); px(armL + 1, ay + 1, shade); px(armL + 2, ay + 2 + up, body);
        px(armR, ay, shade); px(armR - 1, ay + 1, shade); px(armR - 2, ay + 2 + (1 - up), body);
      } else if (slump) {
        for (let k = 0; k < 4; k++) { px(armL, ay + k, shade); px(armR, ay + k, shade); }
      } else {
        const swing = walkPhase === 0 ? 1 : walkPhase === 2 ? -1 : 0;
        for (let k = 0; k < 3; k++) {
          px(armL, ay + k + (k === 2 ? swing : 0), shade);
          px(armR, ay + k - (k === 2 ? swing : 0), shade);
        }
      }

      // eyes
      const ey = by + Math.floor(bh * 0.33);
      const eyeXs = eyes === 1 ? [cx - 1] : eyes === 2 ? [cx - 3, cx + 1] : [cx - 4, cx - 1, cx + 2];
      eyeXs.forEach((ex, i) => {
        const lift = eyes === 3 && i === 1 ? -1 : 0;
        const big = eyes === 1;
        const w = big ? 3 : 2, h = big ? 3 : 2;
        if (blink) { for (let xx = 0; xx < w; xx++) px(ex + xx, ey + lift + h - 1, ink); return; }
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px(ex + xx, ey + lift + yy, '#ffffff');
        // pupil: looks ahead when standing, down at the desk when typing, down and away when slumped
        let pxX = ex + w - 1, pxY = ey + lift + h - 1;
        if (typing) { pxX = ex + Math.floor(w / 2); pxY = ey + lift + h - 1; }
        if (slump) { pxX = ex; pxY = ey + lift + h - 1; }
        px(pxX, pxY, ink);
        if (big) px(pxX, pxY - 1, ink);
      });
      // mouth
      if (slump) { px(cx - 1, ey + 5, shade); px(cx, ey + 5, shade); px(cx - 2, ey + 6, shade); px(cx + 1, ey + 6, shade); }
      else { px(cx - 1, ey + 4, shade); px(cx, ey + 4, shade); if (typing) px(cx + 1, ey + 3, shade); }

      // antennae
      const antXs = antennae === 1 ? [cx] : antennae === 2 ? [cx - 3, cx + 2] : [];
      antXs.forEach((axx, i) => {
        const dir = i === 0 ? 1 : -1;
        let wig = 0;
        if (walkPhase === 0) wig = dir; else if (walkPhase === 2) wig = -dir;
        if (typing) wig = f === 5 ? 0 : dir;
        const droop = slump ? 2 : 0;
        px(axx, by - 1, shade); px(axx, by - 2 + droop, shade);
        px(axx + wig + (slump ? dir : 0), by - 3 + droop, shade);
        const tx = axx + wig + (slump ? dir * 2 : 0), ty = by - 5 + droop;
        px(tx, ty, accent); px(tx + 1, ty, accent); px(tx, ty + 1, accent); px(tx + 1, ty + 1, accent);
      });

      frames.push(c);
    }

    return {
      seed, hue, shape, eyes, antennae, body, accent, frames,
      w: SPRITE_W, h: SPRITE_H,
      draw(ctx, x, y, frame, flip) {
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(frames[frame] || frames[0], -SPRITE_W / 2, -SPRITE_H + 1);
        ctx.restore();
      },
      dataURL(frame) { return (frames[frame] || frames[0]).toDataURL(); },
    };
  };
})();
