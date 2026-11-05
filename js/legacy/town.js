/* Thread Town world: map generation, pathfinding, agent state machine,
   fake-run simulator, and the canvas renderer. */
(function () {
  const TT = window.TT;

  const TILE = 16, COLS = 62, ROWS = 40;
  const W = COLS * TILE, H = ROWS * TILE;
  const G = 0, P = 1, WA = 2, B = 3, T = 4, Z = 5, F = 6, FT = 8;
  const PITCH = 12, ORG = 2;
  const blockOrigin = (c, r) => ({ x: ORG + c * PITCH, y: ORG + r * PITCH });

  const grid = new Uint8Array(COLS * ROWS);
  const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS) ? -1 : grid[y * COLS + x];
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) grid[y * COLS + x] = v; };
  const walkable = v => v === G || v === P || v === Z || v === F;

  const state = {
    buildings: [], trees: [], decos: [], lamps: [], waterTiles: [],
    hangouts: [], plazaTiles: [],
    agents: [], events: [],
    selected: null, hover: null,
    settings: { lighting: 'auto', simulate: true, showDemo: true },
    time: 0,
  };
  TT.state = state;
  TT.TILE = TILE; TT.COLS = COLS; TT.ROWS = ROWS;

  /* ---------- map ---------- */
  function buildMap() {
    grid.fill(G);
    const deptById = {};
    for (const d of TT.DEPARTMENTS) deptById[d.id] = d;
    TT.deptById = deptById;

    // roads: 2 wide, between blocks
    for (let c = 0; c < 4; c++) { const x = 12 + c * PITCH; for (let y = 1; y < ROWS - 2; y++) { set(x, y, P); set(x + 1, y, P); } }
    for (let r = 0; r < 3; r++) { const y = 12 + r * PITCH; for (let x = 1; x < COLS - 1; x++) { set(x, y, P); set(x + 1, y, P); } }

    // department buildings
    for (const d of TT.DEPARTMENTS) {
      const o = blockOrigin(d.slot[0], d.slot[1]);
      const bld = { kind: 'dept', dept: d, x: o.x + 1, y: o.y + 1, w: 8, h: 5,
        door: { x: o.x + 4, y: o.y + 5 }, workTile: { x: o.x + 4, y: o.y + 6 }, workPos: { x: o.x + 5, y: o.y + 6.7 },
        active: 0, block: o };
      for (let y = bld.y; y < bld.y + bld.h; y++) for (let x = bld.x; x < bld.x + bld.w; x++) set(x, y, B);
      for (let y = o.y + 6; y <= o.y + 9; y++) { set(o.x + 4, y, P); set(o.x + 5, y, P); }
      state.buildings.push(bld);
      d.building = bld;
    }

    // plaza
    {
      const o = blockOrigin(2, 1);
      for (let y = o.y; y < o.y + 10; y++) for (let x = o.x; x < o.x + 10; x++) { set(x, y, Z); state.plazaTiles.push({ x, y }); }
      for (let y = o.y + 4; y <= o.y + 5; y++) for (let x = o.x + 4; x <= o.x + 5; x++) set(x, y, FT);
      state.decos.push({ type: 'fountain', x: o.x + 5, y: o.y + 6 });
      state.lamps.push({ x: o.x + 1.5, y: o.y + 1.5 }, { x: o.x + 8.5, y: o.y + 1.5 }, { x: o.x + 1.5, y: o.y + 8.5 }, { x: o.x + 8.5, y: o.y + 8.5 });
      for (let i = 0; i < 4; i++) state.decos.push({ type: 'bench', x: o.x + 2 + (i % 2) * 6 + 0.5, y: o.y + 3 + Math.floor(i / 2) * 4 + 0.5 });
      state.plaza = { x: o.x, y: o.y, w: 10, h: 10 };
    }

    // cafe
    {
      const o = blockOrigin(1, 1);
      const bld = { kind: 'cafe', name: 'Café', x: o.x + 2, y: o.y + 1, w: 5, h: 3, door: { x: o.x + 4, y: o.y + 3 }, block: o,
        wall: '#F6E7C8', roof: '#E7706F', accent: '#75CCD0' };
      for (let y = bld.y; y < bld.y + bld.h; y++) for (let x = bld.x; x < bld.x + bld.w; x++) set(x, y, B);
      for (let y = o.y + 4; y <= o.y + 9; y++) set(o.x + 4, y, P);
      state.buildings.push(bld);
      state.decos.push({ type: 'table', x: o.x + 7.5, y: o.y + 2.5 }, { type: 'table', x: o.x + 8.5, y: o.y + 5.5 }, { type: 'table', x: o.x + 1.5, y: o.y + 6.5 });
      for (let y = o.y + 1; y <= o.y + 8; y++) for (let x = o.x + 6; x <= o.x + 9; x++) if (at(x, y) === G) state.hangouts.push({ x, y, spot: 'cafe' });
      state.cafe = bld;
    }

    // park with pond
    {
      const o = blockOrigin(3, 1);
      const pcx = o.x + 5, pcy = o.y + 5.5;
      for (let y = o.y; y < o.y + 10; y++) for (let x = o.x; x < o.x + 10; x++) {
        const nx = (x + 0.5 - pcx) / 3.4, ny = (y + 0.5 - pcy) / 2.5;
        if (nx * nx + ny * ny <= 1) set(x, y, WA);
      }
      for (let y = o.y; y < o.y + 10; y++) for (let x = o.x; x < o.x + 10; x++) {
        if (at(x, y) !== G) continue;
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === WA);
        if (nearWater) state.hangouts.push({ x, y, spot: 'park' });
      }
      state.decos.push({ type: 'bench', x: o.x + 1.5, y: o.y + 8.5 }, { type: 'bench', x: o.x + 8.5, y: o.y + 1.5 });
      state.lamps.push({ x: o.x + 8.5, y: o.y + 8.5 });
    }

    // lamps at road intersections
    for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) {
      const rx = 12 + c * PITCH, ry = 12 + r * PITCH;
      state.lamps.push({ x: rx - 0.5, y: ry - 0.5 });
      state.lamps.push({ x: rx + 2.5, y: ry + 2.5 });
    }

    // trees and flowers
    const r = TT.rng(1234567);
    const nearStub = (x, y) => {
      for (const b of state.buildings) {
        const o = b.block;
        if (x >= o.x + 2 && x <= o.x + 7 && y >= o.y + 6 && y <= o.y + 10 && b.kind === 'dept') return true;
        if (b.kind === 'cafe' && x >= o.x + 3 && x <= o.x + 5 && y >= o.y + 4) return true;
      }
      return false;
    };
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (at(x, y) !== G) continue;
      const border = x <= 1 || y <= 1 || x >= COLS - 2 || y >= ROWS - 2;
      const inPark = x >= 38 && x < 48 && y >= 14 && y < 24;
      const aboveBuilding = state.buildings.some(b => y === b.y - 1 && x >= b.x - 1 && x <= b.x + b.w);
      if (aboveBuilding) continue;
      const nearLamp = state.lamps.some(l => Math.floor(l.x) === x && Math.floor(l.y) === y);
      if (nearLamp) continue;
      let p = border ? 0.42 : inPark ? 0.22 : 0.11;
      if (nearStub(x, y)) p = 0.02;
      if (r() < p) { set(x, y, T); state.trees.push({ x, y, v: Math.floor(r() * 3) }); }
      else if (r() < 0.08) set(x, y, F);
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (at(x, y) === WA) state.waterTiles.push({ x, y });
  }

  /* ---------- pathfinding ---------- */
  const parent = new Int32Array(COLS * ROWS);
  const queue = new Int32Array(COLS * ROWS);
  function findPath(sx, sy, tx, ty) {
    if (!walkable(at(tx, ty))) return null;
    if (sx === tx && sy === ty) return [];
    parent.fill(-2);
    let qh = 0, qt = 0;
    const si = sy * COLS + sx, ti = ty * COLS + tx;
    parent[si] = -1; queue[qt++] = si;
    const dirs = [1, -1, COLS, -COLS];
    while (qh < qt) {
      const cur = queue[qh++];
      if (cur === ti) break;
      const cx = cur % COLS;
      for (const d of dirs) {
        const n = cur + d;
        if (n < 0 || n >= COLS * ROWS) continue;
        if ((d === 1 && cx === COLS - 1) || (d === -1 && cx === 0)) continue;
        if (parent[n] !== -2 || !walkable(grid[n])) continue;
        parent[n] = cur; queue[qt++] = n;
      }
    }
    if (parent[ti] === -2) return null;
    const path = [];
    for (let i = ti; i !== si; i = parent[i]) path.push({ x: i % COLS, y: Math.floor(i / COLS) });
    return path.reverse();
  }

  /* ---------- agents ---------- */
  function now() { return state.time; }
  function tileOf(a) { return { x: Math.floor(a.pos.x), y: Math.floor(a.pos.y) }; }

  function makeAgent(spec) {
    const dept = TT.deptById[spec.dept] || TT.DEPARTMENTS[0];
    const a = {
      id: spec.id || ('a' + TT.hash(spec.name + spec.role + Math.random()).toString(36)),
      spec, dept,
      alien: TT.makeAlien(spec.name + '|' + spec.role, dept.alien || dept.accent),
      pos: { x: 0, y: 0 }, facing: 1, frame: 0, animT: 0, yoff: 0,
      state: 'idle', path: [], waitUntil: 0, job: null, bubble: null,
      history: [], blinkAt: 0, lookAt: 0,
    };
    // spawn somewhere walkable in the plaza
    const r = TT.rng(TT.hash(a.id));
    a.speed = 1.25 + r() * 0.7; // each alien strolls at its own pace
    const spots = state.plazaTiles.filter(t => walkable(at(t.x, t.y)));
    const s = spots[Math.floor(r() * spots.length)];
    a.pos = { x: s.x + 0.5, y: s.y + 0.5 };
    a.waitUntil = r() * 3;
    return a;
  }

  function seedHistory(a) {
    const r = TT.rng(TT.hash('hist' + a.id));
    const c = (a.spec.cadence || '').toLowerCase();
    let n;
    if (c.includes('hourly')) n = 40 + Math.floor(r() * 30);
    else if (c.includes('daily') || c.includes('nightly')) n = 5 + Math.floor(r() * 3);
    else if (c.includes('mon / wed')) n = 3;
    else if (c.includes('fridays') || c.includes('mondays')) n = 1;
    else if (c.includes('quarterly')) n = Math.floor(r() * 2);
    else n = 2 + Math.floor(r() * 8);
    const nowMs = Date.now();
    for (let i = 0; i < n; i++) {
      const pick = TT.TASKS[a.spec.anim] || TT.TASKS.write;
      const [task, result] = pick[Math.floor(r() * pick.length)];
      const ok = r() > 0.08;
      a.history.push({ at: nowMs - r() * 7 * 86400000, task, result: ok ? result : TT.FAIL_RESULTS[Math.floor(r() * TT.FAIL_RESULTS.length)], ok, ms: 20000 + r() * 400000 });
    }
    a.history.sort((p, q) => q.at - p.at);
  }

  function log(text, kind, agent) {
    state.events.unshift({ at: Date.now(), text, kind: kind || 'info', agentId: agent && agent.id });
    if (state.events.length > 80) state.events.pop();
  }
  TT.log = log;

  function startJob(a, opts) {
    if (a.state === 'commute' || a.state === 'working') return;
    const r = Math.random;
    const pick = TT.TASKS[a.spec.anim] || TT.TASKS.write;
    const [task, result] = (opts && opts.task) ? [opts.task, opts.result || 'Done'] : pick[Math.floor(r() * pick.length)];
    const dur = (opts && opts.duration) || 10 + r() * 18;
    a.job = { task, result, ok: (opts && opts.ok !== undefined) ? opts.ok : r() > 0.1, duration: dur, start: null, end: null };
    a.bubble = null;
    const t = tileOf(a), wt = a.dept.building.workTile;
    a.path = findPath(t.x, t.y, wt.x, wt.y) || [];
    a.state = 'commute';
    log(`${a.spec.name} is heading to ${a.dept.name}: ${task}`, 'start', a);
  }
  TT.startJob = startJob;

  function finishJob(a) {
    const j = a.job;
    const ok = j.ok;
    const result = ok ? j.result : TT.FAIL_RESULTS[Math.floor(Math.random() * TT.FAIL_RESULTS.length)];
    a.history.unshift({ at: Date.now(), task: j.task, result, ok, ms: j.duration * 1000 });
    a.dept.building.active = Math.max(0, a.dept.building.active - 1);
    a.state = ok ? 'report' : 'error';
    a.bubble = { text: result, until: now() + (ok ? 7 : 10), kind: ok ? 'ok' : 'error' };
    a.job = null;
    log(`${a.spec.name} (${a.dept.short}) ${ok ? 'finished' : 'hit a problem'}: ${result}`, ok ? 'done' : 'error', a);
  }

  function pickWanderTarget(a) {
    const r = Math.random();
    let t;
    if (r < 0.35) t = state.plazaTiles[Math.floor(Math.random() * state.plazaTiles.length)];
    else if (r < 0.65 && state.hangouts.length) t = state.hangouts[Math.floor(Math.random() * state.hangouts.length)];
    else {
      for (let i = 0; i < 20; i++) {
        const x = 2 + Math.floor(Math.random() * (COLS - 4)), y = 2 + Math.floor(Math.random() * (ROWS - 4));
        if (walkable(at(x, y))) { t = { x, y }; break; }
      }
    }
    if (!t || !walkable(at(t.x, t.y))) return;
    const s = tileOf(a);
    const p = findPath(s.x, s.y, t.x, t.y);
    if (p && p.length) a.path = p;
  }

  function stepAlong(a, dt, speed) {
    if (!a.path.length) return false;
    const n = a.path[0];
    const tx = n.x + 0.5, ty = n.y + 0.5;
    let dx = tx - a.pos.x, dy = ty - a.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;
    if (dist <= step) { a.pos.x = tx; a.pos.y = ty; a.path.shift(); }
    else { a.pos.x += dx / dist * step; a.pos.y += dy / dist * step; }
    if (Math.abs(dx) > 0.05) a.facing = dx > 0 ? 1 : -1;
    // walk cycle speed follows movement speed so feet do not slide
    a.animT += dt * (speed / 1.6);
    a.frame = 1 + Math.floor(a.animT / 0.14) % 4;
    return true;
  }

  function standIdle(a, dt) {
    const t = now();
    if (t > a.blinkAt + 0.14) { a.frame = 0; if (t > a.blinkAt + 0.14 && Math.random() < dt * 0.4) a.blinkAt = t; }
    else a.frame = 7;
    if (t > a.lookAt) { if (Math.random() < 0.5) a.facing = -a.facing; a.lookAt = t + 2 + Math.random() * 5; }
  }

  function updateAgent(a, dt) {
    const t = now();
    a.yoff = 0;
    switch (a.state) {
      case 'idle':
        if (a.path.length) { stepAlong(a, dt, a.speed); if (!a.path.length) { a.waitUntil = t + 1.5 + Math.random() * 5; a.lookAt = t + 0.8; } }
        else { standIdle(a, dt); if (t > a.waitUntil) pickWanderTarget(a); }
        break;
      case 'commute':
        if (!stepAlong(a, dt, 2.6)) {
          const wp = a.dept.building.workPos;
          const dx = wp.x - a.pos.x, dy = wp.y - a.pos.y, d = Math.hypot(dx, dy);
          if (d > 0.05) { const s = Math.min(d, 2.6 * dt); a.pos.x += dx / d * s; a.pos.y += dy / d * s; a.animT += dt; a.frame = 1 + Math.floor(a.animT / 0.14) % 4; }
          else {
            a.pos = { x: wp.x, y: wp.y }; a.facing = 1; a.frame = 5; a.state = 'working'; a.animT = 0;
            a.job.start = t; a.job.end = t + a.job.duration; a.dept.building.active++;
          }
        }
        break;
      case 'working': {
        a.animT += dt;
        // bursts of typing with short pauses to read the screen
        const cycle = a.animT % 3.2;
        a.frame = cycle < 0.7 ? 5 : 5 + Math.floor(a.animT / 0.12) % 2;
        if (t > a.job.end) finishJob(a);
        break;
      }
      case 'report': {
        // a happy little hop when the work lands
        const age = t - (a.bubble ? a.bubble.until - 7 : t);
        a.frame = 0;
        if (age < 1.2) a.yoff = -Math.abs(Math.sin(age * 9)) * 3 * (1 - age / 1.2);
        if (!a.bubble || t > a.bubble.until) { a.bubble = null; a.state = 'idle'; a.waitUntil = t + 0.4; }
        break;
      }
      case 'error':
        a.frame = 8;
        if (!a.bubble || t > a.bubble.until) { a.bubble = null; a.state = 'idle'; a.waitUntil = t + 0.4; }
        break;
    }
  }

  /* ---------- simulator ---------- */
  let simAccum = 0;
  function simulate(dt) {
    if (!state.settings.simulate) return;
    simAccum += dt;
    if (simAccum < 1) return;
    simAccum = 0;
    const visible = state.agents.filter(a => state.settings.showDemo || !a.spec.demo);
    const busy = visible.filter(a => a.state === 'commute' || a.state === 'working').length;
    const target = Math.max(2, Math.round(visible.length * 0.3));
    if (busy < target && Math.random() < 0.45) {
      const idle = visible.filter(a => a.state === 'idle');
      if (idle.length) startJob(idle[Math.floor(Math.random() * idle.length)]);
    }
  }

  /* ---------- stats ---------- */
  TT.deptStats = function () {
    const weekAgo = Date.now() - 7 * 86400000;
    return TT.DEPARTMENTS.map(d => {
      const agents = state.agents.filter(a => a.dept === d && (state.settings.showDemo || !a.spec.demo));
      const runs = agents.reduce((s, a) => s + a.history.filter(h => h.at > weekAgo).length, 0);
      const fails = agents.reduce((s, a) => s + a.history.filter(h => h.at > weekAgo && !h.ok).length, 0);
      const active = agents.filter(a => a.state === 'working' || a.state === 'commute').length;
      return { dept: d, agents: agents.length, runs, fails, active };
    });
  };

  /* ---------- rendering ---------- */
  let canvas, ctx, S = 2, ground = null, groundS = 0;
  const hashXY = (x, y) => TT.hash(x + ',' + y);

  function renderGround() {
    ground = document.createElement('canvas');
    ground.width = W * S; ground.height = H * S;
    const g = ground.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.scale(S, S);
    const grass = ['#7FB15C', '#76A955', '#86B964'];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = at(x, y), px = x * TILE, py = y * TILE;
      const r = TT.rng(hashXY(x, y));
      if (v === G || v === T || v === F || v === B) {
        g.fillStyle = grass[Math.floor(r() * 3)]; g.fillRect(px, py, TILE, TILE);
        for (let i = 0; i < 5; i++) { g.fillStyle = r() < 0.5 ? '#6E9F4E' : '#90C46C'; g.fillRect(px + Math.floor(r() * 16), py + Math.floor(r() * 16), 1, 1); }
        if (v === F) {
          const cols = ['#E7706F', '#FFFFFF', '#F6D463', '#75CCD0'];
          for (let i = 0; i < 3; i++) { const fx = px + 2 + Math.floor(r() * 12), fy = py + 2 + Math.floor(r() * 12); g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(fx, fy, 2, 2); g.fillStyle = '#5B8E45'; g.fillRect(fx, fy + 2, 1, 1); }
        }
      } else if (v === P) {
        g.fillStyle = '#D8C7A1'; g.fillRect(px, py, TILE, TILE);
        for (let i = 0; i < 4; i++) { g.fillStyle = r() < 0.5 ? '#CDBB93' : '#E2D3B0'; g.fillRect(px + Math.floor(r() * 16), py + Math.floor(r() * 16), 2, 1); }
        g.fillStyle = '#BEAB84';
        if (at(x, y - 1) !== P && at(x, y - 1) !== Z) g.fillRect(px, py, TILE, 1);
        if (at(x, y + 1) !== P && at(x, y + 1) !== Z) g.fillRect(px, py + TILE - 1, TILE, 1);
        if (at(x - 1, y) !== P && at(x - 1, y) !== Z) g.fillRect(px, py, 1, TILE);
        if (at(x + 1, y) !== P && at(x + 1, y) !== Z) g.fillRect(px + TILE - 1, py, 1, TILE);
      } else if (v === Z || v === FT) {
        g.fillStyle = (x + y) % 2 ? '#D3DAE0' : '#C9D1D8'; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#BCC5CD'; g.fillRect(px, py, TILE, 1); g.fillRect(px, py, 1, TILE);
      } else if (v === WA) {
        g.fillStyle = '#75CCD0'; g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#5FB9BE';
        for (let i = 0; i < 3; i++) g.fillRect(px + Math.floor(r() * 12), py + Math.floor(r() * 16), 4, 1);
        g.fillStyle = '#E6D9B5';
        if (at(x, y - 1) !== WA) g.fillRect(px, py, TILE, 2);
        if (at(x, y + 1) !== WA) g.fillRect(px, py + TILE - 2, TILE, 2);
        if (at(x - 1, y) !== WA) g.fillRect(px, py, 2, TILE);
        if (at(x + 1, y) !== WA) g.fillRect(px + TILE - 2, py, 2, TILE);
      }
    }
    groundS = S;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  const FONT = '5px "Press Start 2P", monospace';
  const FONT_SM = '4px "Press Start 2P", monospace';

  function drawTree(t) {
    const px = t.x * TILE, py = t.y * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px + 3, py + 13, 10, 3);
    ctx.fillStyle = '#6B4A2B'; ctx.fillRect(px + 7, py + 9, 3, 6);
    const cols = [['#3E7F3C', '#52A04A', '#6CBA5E'], ['#376F3A', '#4A9346', '#63AE58'], ['#45873D', '#5AA74E', '#74C166']][t.v];
    ctx.fillStyle = cols[0]; ctx.fillRect(px + 2, py + 3, 12, 8); ctx.fillRect(px + 4, py + 1, 8, 2); ctx.fillRect(px + 3, py + 11, 10, 1);
    ctx.fillStyle = cols[1]; ctx.fillRect(px + 3, py + 3, 9, 6); ctx.fillRect(px + 5, py + 1, 5, 2);
    ctx.fillStyle = cols[2]; ctx.fillRect(px + 4, py + 3, 4, 3); ctx.fillRect(px + 6, py + 1, 2, 2);
  }

  function drawBuilding(b, dark) {
    const x0 = b.x * TILE, y0 = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    const wall = b.kind === 'dept' ? b.dept.wall : b.wall;
    const accent = b.kind === 'dept' ? b.dept.accent : b.accent;
    // Roof carries the team color so the map matches the utilization board swatches.
    const roof = b.kind === 'dept' ? accent : b.roof;
    const roofH = b.kind === 'dept' ? 26 : 16;
    const wallTop = y0 + roofH;
    const working = b.active > 0;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x0 + 3, y0 + h - 2, w, 4);
    // walls
    ctx.fillStyle = wall; ctx.fillRect(x0, wallTop, w, h - roofH);
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(x0, y0 + h - 3, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; for (let yy = wallTop + 6; yy < y0 + h - 3; yy += 6) ctx.fillRect(x0, yy, w, 1);
    // roof
    ctx.fillStyle = roof; ctx.fillRect(x0 - 3, y0 + 4, w + 6, roofH - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0 - 3, y0 + 4, w + 6, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let yy = y0 + 9; yy < wallTop; yy += 5) ctx.fillRect(x0 - 3, yy, w + 6, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 - 3, wallTop - 2, w + 6, 2);
    // chimney
    if (b.kind === 'dept') { ctx.fillStyle = '#8A6A55'; ctx.fillRect(x0 + w - 16, y0, 6, 10); ctx.fillStyle = '#5E4538'; ctx.fillRect(x0 + w - 17, y0, 8, 2); }

    // door
    const dx = b.door.x * TILE, dy = y0 + h;
    const doorW = b.kind === 'dept' ? 2 * TILE : TILE;
    ctx.fillStyle = accent; ctx.fillRect(dx, dy - 20, doorW, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(dx, dy - 20, doorW, 2); ctx.fillRect(dx + doorW / 2 - 1, dy - 20, 2, 20);
    ctx.fillStyle = '#F6D463'; ctx.fillRect(dx + doorW / 2 - 4, dy - 10, 1, 1); ctx.fillRect(dx + doorW / 2 + 3, dy - 10, 1, 1);
    // awning
    ctx.fillStyle = accent; ctx.fillRect(dx - 4, dy - 24, doorW + 8, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < doorW + 8; i += 6) ctx.fillRect(dx - 4 + i, dy - 24, 3, 3);

    // windows
    const lit = working || dark > 0.35;
    const winCol = working ? '#FFE58A' : dark > 0.35 ? (b.kind === 'dept' ? '#F2D27A' : '#FFE58A') : '#A9D8E6';
    const wins = [];
    const n = Math.floor((w - 12) / 22);
    for (let i = 0; i < n; i++) { const wx = x0 + 8 + i * 22 + ((w - 12) - n * 22) / 2; wins.push([wx, wallTop + 6, 10, 10]); }
    if (b.kind === 'dept') {
      wins.push([dx - 22, dy - 18, 8, 8], [dx + doorW + 14, dy - 18, 8, 8]);
    }
    for (const [wx, wy, ww, wh] of wins) {
      ctx.fillStyle = '#2A3F5A'; ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
      ctx.fillStyle = winCol; ctx.fillRect(wx, wy, ww, wh);
      if (!lit) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(wx + 1, wy + 1, 3, 3); }
      ctx.fillStyle = '#2A3F5A'; ctx.fillRect(wx + ww / 2 - 0.5, wy, 1, wh); ctx.fillRect(wx, wy + wh / 2 - 0.5, ww, 1);
    }
    b._wins = wins; b._winCol = winCol;

    // sign
    const label = b.kind === 'dept' ? b.dept.name : b.name;
    ctx.font = FONT;
    const tw = ctx.measureText(label).width;
    const sw = tw + 10, sx = x0 + w / 2 - sw / 2, sy = y0 - 6;
    ctx.fillStyle = '#002D4F'; roundRect(ctx, sx, sy, sw, 11, 2); ctx.fill();
    ctx.fillStyle = accent; ctx.fillRect(sx, sy + 10, sw, 1);
    ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(label, sx + 5, sy + 6);

    // utilization pill
    if (b.kind === 'dept') {
      const agents = state.agents.filter(a => a.dept === b.dept && (state.settings.showDemo || !a.spec.demo)).length;
      const txt = agents === 1 ? '1 AGENT' : `${agents} AGENTS`;
      ctx.font = FONT_SM;
      const pw = ctx.measureText(txt).width + 8;
      const pxx = x0 - 2, pyy = y0 + 8;
      ctx.fillStyle = agents ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)'; roundRect(ctx, pxx, pyy, pw, 8, 2); ctx.fill();
      ctx.fillStyle = agents ? '#002D4F' : '#6B7A8A'; ctx.fillText(txt, pxx + 4, pyy + 4.5);
      if (working) { ctx.fillStyle = '#E7706F'; ctx.fillRect(pxx + pw - 3, pyy - 1, 3, 3); }
    }

    // smoke when working
    if (working && b.kind === 'dept') {
      const t = state.time;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.6 + i * 0.33) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`;
        const sxp = x0 + w - 13 + Math.sin((t + i) * 2) * 2, syp = y0 - 2 - ph * 14;
        ctx.fillRect(sxp, syp, 3 + ph * 3, 3 + ph * 3);
      }
    }
  }

  function drawDeco(d) {
    const px = d.x * TILE, py = d.y * TILE;
    if (d.type === 'fountain') {
      const cx = px, cy = py - 16;
      ctx.fillStyle = '#9AA7B3'; ctx.fillRect(cx - 16, cy - 16, 32, 32);
      ctx.fillStyle = '#75CCD0'; ctx.fillRect(cx - 13, cy - 13, 26, 26);
      ctx.fillStyle = '#B4C0CB'; ctx.fillRect(cx - 4, cy - 4, 8, 8);
      const t = state.time;
      for (let i = 0; i < 6; i++) {
        const ph = (t * 1.2 + i / 6) % 1, ang = i / 6 * Math.PI * 2;
        ctx.fillStyle = `rgba(255,255,255,${0.9 - ph * 0.8})`;
        ctx.fillRect(cx + Math.cos(ang) * ph * 10 - 1, cy - 8 + ph * 12 - (1 - ph) * 8, 2, 2);
      }
    } else if (d.type === 'bench') {
      ctx.fillStyle = '#7A5636'; ctx.fillRect(px - 6, py - 4, 12, 3); ctx.fillRect(px - 6, py - 8, 12, 2);
      ctx.fillStyle = '#4E3522'; ctx.fillRect(px - 5, py - 1, 2, 2); ctx.fillRect(px + 3, py - 1, 2, 2);
    } else if (d.type === 'table') {
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(px - 7, py - 1, 14, 3);
      ctx.fillStyle = '#8A6A55'; ctx.fillRect(px - 1, py - 14, 2, 14);
      ctx.fillStyle = '#E7706F'; ctx.fillRect(px - 8, py - 16, 16, 3); ctx.fillRect(px - 6, py - 18, 12, 2);
      ctx.fillStyle = '#FFFFFF'; for (let i = -8; i < 8; i += 4) ctx.fillRect(px + i, py - 16, 2, 3);
      ctx.fillStyle = '#C9B38F'; ctx.fillRect(px - 5, py - 6, 10, 3);
    }
  }

  function drawLamp(l, dark) {
    const px = l.x * TILE, py = l.y * TILE;
    ctx.fillStyle = '#3A4A5C'; ctx.fillRect(px - 1, py - 18, 2, 18); ctx.fillRect(px - 3, py - 1, 6, 2);
    ctx.fillStyle = dark > 0.3 ? '#FFE58A' : '#DDE6EC'; ctx.fillRect(px - 3, py - 22, 6, 5);
    ctx.fillStyle = '#3A4A5C'; ctx.fillRect(px - 4, py - 23, 8, 1);
  }

  /* Desk sits in front of the alien (closer to the camera) so the alien stands behind it. */
  function drawDesk(a) {
    const px = a.pos.x * TILE, py = a.pos.y * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(px - 9, py + 6, 18, 2);
    ctx.fillStyle = '#8A6A55'; ctx.fillRect(px - 9, py - 1, 18, 5);
    ctx.fillStyle = '#A5826A'; ctx.fillRect(px - 9, py - 1, 18, 1);
    ctx.fillStyle = '#6B4A2B'; ctx.fillRect(px - 8, py + 4, 2, 3); ctx.fillRect(px + 6, py + 4, 2, 3);
    ctx.fillStyle = '#3A4A5C'; ctx.fillRect(px - 4, py - 7, 8, 6);
    const blink = Math.floor(state.time * 4) % 2;
    ctx.fillStyle = '#75CCD0'; ctx.fillRect(px - 3, py - 6, 6, 4);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(px - 2, py - 5, 2 + blink, 1); ctx.fillRect(px - 2, py - 3, 3, 1);
    ctx.fillStyle = '#E8E2D5'; ctx.fillRect(px + 5, py, 3, 3); ctx.fillStyle = '#75CCD0'; ctx.fillRect(px - 8, py, 2, 2);
  }

  function drawToolBubble(a) {
    const px = a.pos.x * TILE, py = a.pos.y * TILE - a.alien.h - 4;
    const t = state.time + TT.hash(a.id) % 100;
    ctx.fillStyle = '#FFFFFF'; roundRect(ctx, px - 10, py - 14, 20, 14, 3); ctx.fill();
    ctx.fillRect(px - 2, py - 1, 4, 3);
    const kind = a.spec.anim;
    if (kind === 'write') {
      ctx.fillStyle = '#F6D463'; ctx.fillRect(px - 6 + Math.sin(t * 6) * 2, py - 9, 7, 2);
      ctx.fillStyle = '#E7706F'; ctx.fillRect(px + 1 + Math.sin(t * 6) * 2, py - 9, 2, 2);
      ctx.fillStyle = '#002D4F'; const dots = Math.floor(t * 3) % 4; for (let i = 0; i < dots; i++) ctx.fillRect(px - 6 + i * 4, py - 4, 2, 2);
    } else if (kind === 'build') {
      ctx.save(); ctx.translate(px, py - 5); ctx.rotate(Math.sin(t * 8) * 0.8 - 0.4);
      ctx.fillStyle = '#8A6A55'; ctx.fillRect(-1, -2, 2, 8); ctx.fillStyle = '#6B7A8A'; ctx.fillRect(-4, -5, 8, 3); ctx.restore();
      if (Math.sin(t * 8) > 0.8) { ctx.fillStyle = '#F6D463'; ctx.fillRect(px + 4, py - 4, 2, 2); ctx.fillRect(px - 6, py - 3, 2, 2); }
    } else if (kind === 'stamp') {
      const dn = Math.max(0, Math.sin(t * 5)) * 4;
      ctx.fillStyle = '#E8E2D5'; ctx.fillRect(px - 7, py - 4, 14, 2);
      ctx.fillStyle = '#002D4F'; ctx.fillRect(px - 3, py - 12 + dn, 6, 3); ctx.fillRect(px - 1, py - 15 + dn, 2, 3);
      if (dn > 3.5) { ctx.fillStyle = '#1F8A5B'; ctx.fillRect(px - 2, py - 5, 4, 1); }
    } else if (kind === 'mail') {
      const up = (t * 1.5) % 1;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(px - 6, py - 10 - up * 3, 12, 8);
      ctx.fillStyle = '#75CCD0'; ctx.fillRect(px - 6, py - 10 - up * 3, 12, 8);
      ctx.fillStyle = '#002D4F'; ctx.fillRect(px - 6, py - 10 - up * 3, 12, 1); ctx.fillRect(px - 1, py - 6 - up * 3, 2, 1); ctx.fillRect(px - 3, py - 7 - up * 3, 2, 1); ctx.fillRect(px + 1, py - 7 - up * 3, 2, 1);
    } else if (kind === 'scan') {
      ctx.fillStyle = '#E8E2D5'; ctx.fillRect(px - 5, py - 12, 10, 10);
      ctx.fillStyle = '#B9C4CC'; for (let i = 0; i < 3; i++) ctx.fillRect(px - 3, py - 10 + i * 3, 6, 1);
      const sy = py - 12 + ((t * 1.3) % 1) * 10;
      ctx.fillStyle = '#75CCD0'; ctx.fillRect(px - 7, sy, 14, 1);
    } else {
      for (let i = 0; i < 4; i++) {
        const hgt = 2 + (Math.sin(t * 3 + i) * 0.5 + 0.5) * 7;
        ctx.fillStyle = ['#002D4F', '#75CCD0', '#004B91', '#E7706F'][i]; ctx.fillRect(px - 7 + i * 4, py - 3 - hgt, 3, hgt);
      }
    }
  }

  function wrapText(text, maxChars) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
      else cur += ' ' + w;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines.slice(0, 3);
  }

  function drawSpeech(a) {
    const b = a.bubble;
    const px = a.pos.x * TILE, py = a.pos.y * TILE - a.alien.h - 6;
    ctx.font = FONT;
    const lines = wrapText(b.text, 24);
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
    const w = tw + 10, h = lines.length * 7 + 6;
    let bx = px - w / 2; bx = Math.max(2, Math.min(W - w - 2, bx));
    const by = py - h;
    ctx.fillStyle = b.kind === 'error' ? '#E7706F' : '#FFFFFF'; roundRect(ctx, bx, by, w, h, 3); ctx.fill();
    ctx.fillRect(px - 2, py - 1, 4, 3);
    ctx.fillStyle = b.kind === 'error' ? '#FFFFFF' : '#002D4F'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + 5, by + 3 + i * 7));
    if (b.kind === 'error') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(bx + w - 2, by - 3, 1, 1); }
  }

  function drawNameTag(a, strong) {
    const px = a.pos.x * TILE, py = a.pos.y * TILE + 3;
    ctx.font = FONT_SM;
    const txt = `${a.spec.name}`;
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = strong ? '#002D4F' : 'rgba(0,45,79,0.75)'; roundRect(ctx, px - tw / 2 - 3, py, tw + 6, 7, 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(txt, px - tw / 2, py + 1.5);
  }

  function darkness() {
    const m = state.settings.lighting;
    if (m === 'day') return 0;
    if (m === 'night') return 0.62;
    const d = new Date(); const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 7.5 && h < 17.5) return 0;
    if (h >= 17.5 && h < 20) return (h - 17.5) / 2.5 * 0.62;
    if (h >= 5.5 && h < 7.5) return (1 - (h - 5.5) / 2) * 0.62;
    return 0.62;
  }
  TT.darkness = darkness;

  function render() {
    const dark = darkness();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (!ground || groundS !== S) renderGround();
    ctx.drawImage(ground, 0, 0, W, H);

    // water shimmer
    const t = state.time;
    for (const wt of state.waterTiles) {
      const ph = (t * 0.5 + (wt.x * 7 + wt.y * 13) % 10 / 10) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.35 * Math.sin(ph * Math.PI)})`;
      ctx.fillRect(wt.x * TILE + 3 + ph * 6, wt.y * TILE + 4 + ((wt.x + wt.y) % 3) * 4, 5, 1);
    }

    // y-sorted scene
    const items = [];
    for (const b of state.buildings) items.push({ y: (b.y + b.h) * TILE - 8, draw: () => drawBuilding(b, dark) });
    for (const tr of state.trees) items.push({ y: (tr.y + 1) * TILE - 1, draw: () => drawTree(tr) });
    for (const d of state.decos) items.push({ y: d.y * TILE, draw: () => drawDeco(d) });
    for (const l of state.lamps) items.push({ y: l.y * TILE, draw: () => drawLamp(l, dark) });
    for (const a of state.agents) {
      if (!state.settings.showDemo && a.spec.demo) continue;
      items.push({ y: a.pos.y * TILE, draw: () => {
        const px = a.pos.x * TILE, py = a.pos.y * TILE;
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(px - 5, py - 1, 10, 2);
        a.alien.draw(ctx, px, py + (a.yoff || 0), a.frame, a.facing < 0);
        if (a.state === 'working') drawDesk(a);
        if (state.selected && state.selected.id === a.id) { ctx.strokeStyle = '#75CCD0'; ctx.lineWidth = 1; roundRect(ctx, px - 10, py - a.alien.h - 2, 20, a.alien.h + 5, 3); ctx.stroke(); }
      } });
    }
    items.sort((p, q) => p.y - q.y);
    for (const it of items) it.draw();

    // overlays above everything
    for (const a of state.agents) {
      if (!state.settings.showDemo && a.spec.demo) continue;
      if (a.state === 'working') drawToolBubble(a);
      if (a.bubble) drawSpeech(a);
      const sel = state.selected && state.selected.id === a.id, hov = state.hover && state.hover.id === a.id;
      if (sel || hov || a.state === 'working') drawNameTag(a, sel);
    }

    // night
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(2,16,40,${dark})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (const l of state.lamps) {
        const px = l.x * TILE, py = l.y * TILE - 20;
        const gr = ctx.createRadialGradient(px, py, 2, px, py, 34);
        gr.addColorStop(0, `rgba(255,214,120,${0.45 * dark})`); gr.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = gr; ctx.fillRect(px - 34, py - 34, 68, 68);
      }
      for (const b of state.buildings) {
        if (!b._wins) continue;
        for (const [wx, wy, ww, wh] of b._wins) {
          const cx = wx + ww / 2, cy = wy + wh / 2;
          const gr = ctx.createRadialGradient(cx, cy, 1, cx, cy, 16);
          const a = b.active > 0 ? 0.55 : 0.28;
          gr.addColorStop(0, `rgba(255,220,130,${a * dark})`); gr.addColorStop(1, 'rgba(255,220,130,0)');
          ctx.fillStyle = gr; ctx.fillRect(cx - 16, cy - 16, 32, 32);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (dark > 0.4) {
        const r = TT.rng(99);
        ctx.fillStyle = `rgba(255,255,255,${(dark - 0.4) * 2.5})`;
        for (let i = 0; i < 40; i++) { const sx = r() * W, sy = r() * 30; if (Math.sin(t * 2 + i) > -0.2) ctx.fillRect(sx, sy, 1, 1); }
      }
    }

    // hovered building outline
    if (state.hover && state.hover.kind === 'dept') {
      const b = state.hover.building;
      ctx.strokeStyle = '#75CCD0'; ctx.lineWidth = 1; roundRect(ctx, b.x * TILE - 4, b.y * TILE - 8, b.w * TILE + 8, b.h * TILE + 10, 3); ctx.stroke();
    }
  }

  /* ---------- loop ---------- */
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    state.time += dt;
    simulate(dt);
    for (const a of state.agents) updateAgent(a, dt);
    render();
    requestAnimationFrame(frame);
  }

  function resize() {
    const host = canvas.parentElement;
    const cw = host.clientWidth, ch = host.clientHeight;
    const k = Math.min(cw / W, ch / H);
    canvas.style.width = Math.floor(W * k) + 'px';
    canvas.style.height = Math.floor(H * k) + 'px';
    const exact = k * (window.devicePixelRatio || 1);
    S = Math.max(2, Math.min(4, Math.round(exact)));
    canvas.width = W * S; canvas.height = H * S;
    // Nearest-neighbor only when the scale is a clean integer; otherwise smooth the downscale.
    canvas.style.imageRendering = Math.abs(exact - S) < 0.05 ? 'pixelated' : 'auto';
  }

  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    const lx = (ev.clientX - rect.left) / rect.width * W, ly = (ev.clientY - rect.top) / rect.height * H;
    let best = null, bd = 1e9;
    for (const a of state.agents) {
      if (!state.settings.showDemo && a.spec.demo) continue;
      const px = a.pos.x * TILE, py = a.pos.y * TILE;
      if (lx > px - 9 && lx < px + 9 && ly > py - a.alien.h - 2 && ly < py + 3) {
        const d = Math.abs(lx - px); if (d < bd) { bd = d; best = { kind: 'agent', id: a.id, agent: a }; }
      }
    }
    if (best) return best;
    const tx = Math.floor(lx / TILE), ty = Math.floor(ly / TILE);
    for (const b of state.buildings) if (b.kind === 'dept' && tx >= b.x && tx < b.x + b.w && ty >= b.y - 1 && ty < b.y + b.h) return { kind: 'dept', id: b.dept.id, building: b, dept: b.dept };
    return null;
  }

  /* ---------- public API ---------- */
  TT.town = {
    W, H,
    init(cv) {
      canvas = cv; ctx = canvas.getContext('2d');
      buildMap();
      for (const spec of TT.SEED_AGENTS) { const a = makeAgent(spec); seedHistory(a); state.agents.push(a); }
      resize();
      window.addEventListener('resize', resize);
      new ResizeObserver(resize).observe(canvas.parentElement);
      canvas.addEventListener('mousemove', ev => {
        state.hover = pick(ev); canvas.style.cursor = state.hover ? 'pointer' : 'default';
        if (TT.onHover) TT.onHover(state.hover, ev);
      });
      canvas.addEventListener('mouseleave', () => { state.hover = null; if (TT.onHover) TT.onHover(null); });
      canvas.addEventListener('click', ev => {
        const p = pick(ev);
        state.selected = p;
        if (TT.onSelect) TT.onSelect(p);
      });
      log('Thread Town is open. Agents are wandering until work comes in.', 'info');
      const start = () => requestAnimationFrame(frame);
      if (document.fonts && document.fonts.load) document.fonts.load(FONT).then(start, start); else start();
    },
    addAgent(spec, opts) {
      const a = makeAgent(spec);
      if (!opts || opts.seedHistory !== false) seedHistory(a);
      state.agents.push(a);
      log(`${spec.name} joined ${a.dept.name} as ${spec.role}.`, 'join', a);
      return a;
    },
    removeAgent(id) {
      const i = state.agents.findIndex(a => a.id === id);
      if (i >= 0) { const a = state.agents[i]; if (a.state === 'working') a.dept.building.active--; state.agents.splice(i, 1); if (state.selected && state.selected.id === id) state.selected = null; }
    },
    select(p) { state.selected = p; },
    agents: () => state.agents,
    events: () => state.events,
    settings: state.settings,
    startJob,
    runNow(id) { const a = state.agents.find(x => x.id === id); if (a) startJob(a); },
    /* Advance the world by `seconds` without waiting for animation frames (testing, hidden tabs). */
    tick(seconds) {
      const step = 1 / 30;
      for (let t = 0; t < seconds; t += step) { state.time += step; simulate(step); for (const a of state.agents) updateAgent(a, step); }
      render();
    },
  };
})();
