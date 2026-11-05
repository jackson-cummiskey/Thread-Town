/* Thread Town UI: roster, inspector, department board, ticker, add-agent form, board mode,
   the walk-mode button, avatar picker and HUD (CONTRACT_V4 "UI"), and the version 5 walk HUD pieces
   (CONTRACT_V5 "UI": #fade, #golf-hud, #golf-power, #golf-msg, #interior-hint), and the version 6 pieces
   (CONTRACT_V6 "UI" and "Leaderboard": #runner-hud and #runner-center under body.subway, the Leaderboard
   header button, #leaderboard-modal and the sidebar #leaderboard-section). Version 7 (CONTRACT_V7 "UI"): walk mode
   is chase only, V toggles near or far, and the center reticle is gone. The renderer owns what the HUDs
   show; ui.js only makes sure they are hidden again whenever walk mode ends. The leaderboard lists are
   rendered here from TT.leaderboard (assigned by the renderer) and refreshed through TT.onLeaderboardChange.
   Version 8 (CONTRACT_V8 "HUD" and "Leaderboard"): #golf-hud carries the round line, the Round row of the card
   (golf-card-1..6, golf-card-total), the to par line and the cart hint; the renderer writes them by id. The golf
   leaderboard tab shows To par and the card from detail = { seconds, card, toPar }.
   Version 10 (CONTRACT_V10 "Thread National"): the course is Thread National with nine holes. The HUD carries the
   course name (#golf-course), the card is rebuilt with nine holes and the Round row shows the running to par, the
   leaderboard tab reads 'Thread National · 9 holes' and the sidebar section is named after the course. The course
   name comes from TT.state.golf.name, then TT.PLAN.golf.name, then the constant.
   Version 11 (CONTRACT_V11 "Coins, the wallet and the shop"): the header coin counter (#coin-counter, #coin-count) reads
   TT.wallet.coins (the renderer assigns TT.wallet from js/wallet.js and TT.shop from js/shop.js) and pulses when the
   count grows; the renderer calls TT.onWalletChange() after every change, and the 400 ms pass also polls. The counter,
   the runner card's Shop button and the character picker's hat field (the owned hats) talk to TT.shop and TT.wallet;
   #shop-modal counts as an open modal for Tab and Esc. The #minimap slot is a walk-ui piece the renderer fills. */
(function () {
  const TT = window.TT;
  const $ = s => document.querySelector(s);
  const STORE = 'threadtown.customAgents.v1';
  const PLAYER_STORE = 'threadtown.player.v1';
  /* The 24 species ids from js/animals3d.js (CONTRACT_V3). ui.js is a classic script and cannot
     import the module, so the list is mirrored here. Labels are title case. */
  const SPECIES = ['lion', 'tiger', 'elephant', 'giraffe', 'zebra', 'hippo', 'bear', 'panda', 'fox', 'wolf', 'monkey',
    'penguin', 'flamingo', 'owl', 'falcon', 'otter', 'seal', 'tortoise', 'crocodile', 'kangaroo',
    'rabbit', 'frog', 'deer', 'koala'];
  const DEFAULT_COLOR = '#75CCD0';

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function ago(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  const STATE_LABEL = { idle: 'Wandering', commute: 'Heading to work', working: 'Working', report: 'Reporting', error: 'Needs a human', leisure: 'Taking a break' };
  const LEISURE_SHORT = { icecream: 'Café', coffee: 'Café', bench: 'Bench', swim: 'Swimming' };
  /* Short status for roster rows and lists: leisure kinds get their own label instead of Wandering. */
  function stateLabel(a) {
    if (a.state === 'leisure' && a.leisure) return LEISURE_SHORT[a.leisure.kind] || STATE_LABEL.leisure;
    return STATE_LABEL[a.state] || a.state;
  }
  /* The tooltip Now line (CONTRACT_V2 "UI additions"). */
  function nowLine(a) {
    if (a.state === 'working') {
      const label = a.dept && a.dept.building && a.dept.building.activityLabel;
      return 'Working: ' + esc(label || (a.job ? a.job.task : 'at the station'));
    }
    if (a.state === 'leisure' && a.leisure) {
      const k = a.leisure.kind;
      if (k === 'icecream') return 'Having ice cream at the café';
      if (k === 'coffee') return 'Having coffee at the café';
      if (k === 'bench') return 'Taking a break on a bench';
      if (k === 'swim') {
        if (a.onBoard) return 'On the diving board';
        if (a.jumpT > 0 && a.jumpT < 1) return 'Diving in';
        return 'Swimming in the pond';
      }
    }
    return a.job ? esc(a.job.task) : stateLabel(a);
  }

  /* Portraits come from the 3D renderer. It caches the data URL on the agent. */
  function avatarURL(a) {
    if (a.avatarURL) return a.avatarURL;
    // The mesh may not exist until the renderer's first frame; never let a portrait failure break a render pass.
    try { return TT.town.avatar(a) || ''; } catch (e) { return ''; }
  }
  // Cache-key fragment so rows re-render once a portrait becomes available.
  function avKey(a) { return a.avatarURL ? 'v' : ''; }
  /* Species for animal characters only (CONTRACT_V3 "UI"): the renderer exposes agent.mesh.kind and agent.mesh.species. */
  function speciesName(a) {
    const m = a && a.mesh;
    if (!m || m.kind !== 'animal' || !m.species) return '';
    const s = String(m.species);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function speciesLine(a) {
    const s = speciesName(a);
    return s ? `<div class="sub">Species: ${esc(s)}</div>` : '';
  }
  function avatarImg(a, size) {
    return `<img class="avatar" width="${size}" height="${size * 1.25}" src="${avatarURL(a)}" alt="">`;
  }

  /* ----- roster ----- */
  let lastRosterKey = '';
  function renderRoster() {
    const agents = TT.town.agents().filter(a => TT.town.settings.showDemo || !a.spec.demo);
    const key = agents.map(a => a.id + stateLabel(a) + avKey(a) + (TT.state.selected && TT.state.selected.id === a.id ? '*' : '')).join('|');
    if (key === lastRosterKey) return; lastRosterKey = key;
    const sorted = agents.slice().sort((p, q) => rank(p) - rank(q) || p.spec.name.localeCompare(q.spec.name));
    $('#roster').innerHTML = sorted.map(a => `
      <button class="row ${TT.state.selected && TT.state.selected.id === a.id ? 'sel' : ''}" data-id="${a.id}">
        ${avatarImg(a, 20)}
        <span class="who"><b>${esc(a.spec.name)}</b><small>${esc(a.spec.role)} · ${esc(a.dept.short)}</small></span>
        <span class="chip ${a.state}">${stateLabel(a)}</span>
      </button>`).join('');
    $('#roster-count').textContent = agents.length;
  }
  function rank(a) { return { working: 0, commute: 1, report: 2, error: 3, leisure: 4, idle: 5 }[a.state] || 5; }

  /* ----- hover tooltip ----- */
  function showTip(hover, ev) {
    const tip = $('#tip');
    if (!hover || !ev) { tip.hidden = true; return; }
    if (hover.kind === 'agent') {
      const a = hover.agent;
      tip.innerHTML = `<b>${esc(a.spec.name)}</b><div class="sub">${esc(a.spec.role)} · ${esc(a.dept.name)}</div>${speciesLine(a)}
        <div class="line"><span class="k">Task</span><span>${esc(a.spec.about || a.spec.role)}</span></div>
        <div class="line"><span class="k">Runs</span><span>${esc(a.spec.cadence || 'On request')}</span></div>
        <div class="line"><span class="k">Now</span><span>${nowLine(a)}</span></div>`;
    } else {
      const s = hover.dept ? TT.deptStats().find(x => x.dept === hover.dept) : null;
      if (!s) { tip.hidden = true; return; }
      tip.innerHTML = `<b>${esc(hover.dept.name)}</b><div class="sub">${s.agents} agents · ${s.runs} runs this week${s.active ? ` · ${s.active} working now` : ''}</div>`;
    }
    const host = $('#stage-host').getBoundingClientRect();
    tip.hidden = false;
    let x = ev.clientX - host.left + 16, y = ev.clientY - host.top + 16;
    if (x + tip.offsetWidth > host.width - 8) x = ev.clientX - host.left - tip.offsetWidth - 12;
    if (y + tip.offsetHeight > host.height - 8) y = ev.clientY - host.top - tip.offsetHeight - 12;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  /* ----- inspector ----- */
  let lastInspKey = '';
  function fmtDate(ms) { return new Date(ms).toLocaleDateString([], { month: 'short', year: 'numeric' }); }
  function renderInspector() {
    const sel = TT.state.selected;
    const board = document.body.classList.contains('board');
    const el = board ? $('#inspector-card') : $('#inspector-side');
    const other = board ? $('#inspector-side') : $('#inspector-card');
    const card = $('#insp-card');
    if (!sel) {
      if (lastInspKey !== 'none') {
        $('#inspector-side').innerHTML = `<div class="empty">Hover an alien for a quick look. Click one, or a building, for the full picture here.</div>`;
        $('#inspector-card').innerHTML = ''; card.classList.remove('open'); $('#btn-close-insp').hidden = true; lastInspKey = 'none';
      }
      return;
    }
    other.innerHTML = '';
    card.classList.toggle('open', board);
    $('#btn-close-insp').hidden = board;
    if (sel.kind === 'agent') {
      const a = sel.agent;
      const following = TT.town.following === a.id;
      // speciesName is in the key so the inspector re-renders once the mesh exists after the first frame
      const key = 'a' + a.id + stateLabel(a) + avKey(a) + speciesName(a) + a.history.length + (a.job ? a.job.task : '') + (board ? 'b' : 's') + (following ? 'f' : '');
      if (key === lastInspKey) return; lastInspKey = key;
      const weekAgo = Date.now() - 7 * 86400000;
      const week = a.history.filter(h => h.at > weekAgo);
      const okCount = a.history.filter(h => h.ok).length;
      const rate = a.history.length ? Math.round(okCount / a.history.length * 100) + '%' : 'n/a';
      const last = a.history[0];
      const since = a.spec.since || (a.spec.createdAt ? fmtDate(a.spec.createdAt) : 'Unknown');
      const current = a.job ? `<div class="task"><span class="dot live"></span><div><b>Working now</b><br>${esc(a.job.task)}</div></div>` : '';
      el.innerHTML = `
        <div class="insp-head">
          <img class="avatar big" src="${avatarURL(a)}" alt="">
          <div>
            <div class="eyebrow">${esc(a.dept.name)}</div>
            <h3>${esc(a.spec.name)}</h3>
            <div class="sub">${esc(a.spec.role)}</div>${speciesLine(a)}
          </div>
        </div>
        <p class="about">${esc(a.spec.about || '')}</p>
        <dl class="facts">
          <dt>Created by</dt><dd>${esc(a.spec.owner || 'Unknown')}</dd>
          <dt>Department</dt><dd>${esc(a.dept.name)}</dd>
          <dt>Set to run</dt><dd>${esc(a.spec.cadence || 'On request')}</dd>
          <dt>In the town since</dt><dd>${esc(since)}</dd>
          <dt>Status</dt><dd><span class="chip ${a.state}">${stateLabel(a)}</span></dd>
          <dt>Runs this week</dt><dd>${week.length} (${week.filter(h => !h.ok).length} needed a human)</dd>
          <dt>Runs all time</dt><dd>${a.history.length} · ${rate} clean</dd>
          <dt>Last run</dt><dd>${last ? `${ago(last.at)} · ${last.ok ? 'OK' : 'Needed a human'}` : 'Never'}</dd>
        </dl>
        ${current}
        <div class="actions">
          <button class="btn small" data-run="${a.id}" ${a.state === 'working' || a.state === 'commute' ? 'disabled' : ''}>Send to work</button>
          <button class="btn small ghost" data-focus-agent="${a.id}">Focus camera</button>
          <button class="btn small ghost" data-follow="${a.id}">${following ? 'Stop following' : 'Follow'}</button>
          ${a.spec.custom ? `<button class="btn small ghost" data-remove="${a.id}">Remove</button>` : ''}
        </div>
        <h4>Recent runs</h4>
        <ul class="history">
          ${a.history.slice(0, 8).map(h => `<li><span class="dot ${h.ok ? 'ok' : 'bad'}"></span><div><b>${esc(h.task)}</b><small>${esc(h.result)} · ${ago(h.at)}</small></div></li>`).join('') || '<li class="muted">No runs yet.</li>'}
        </ul>`;
    } else if (sel.kind === 'dept') {
      const d = sel.dept;
      const agents = TT.town.agents().filter(a => a.dept === d && (TT.town.settings.showDemo || !a.spec.demo));
      const key = 'd' + d.id + agents.map(a => a.id + stateLabel(a) + avKey(a)).join('') + (board ? 'b' : 's');
      if (key === lastInspKey) return; lastInspKey = key;
      const stat = TT.deptStats().find(s => s.dept === d);
      const activity = d.building && d.building.activityLabel;
      el.innerHTML = `
        <div class="insp-head">
          <span class="swatch" style="background:${d.accent}"></span>
          <div><div class="eyebrow">Department</div><h3>${esc(d.name)}</h3><div class="sub">${stat.agents} agents · ${stat.runs} runs this week</div></div>
        </div>
        ${activity ? `<p class="about">Signature activity: ${esc(activity)}</p>` : ''}
        <ul class="history">
          ${agents.map(a => `<li class="click" data-id="${a.id}">${avatarImg(a, 18)}<div><b>${esc(a.spec.name)}</b><small>${esc(a.spec.role)} · ${stateLabel(a)}</small></div></li>`).join('') || '<li class="muted">No agents yet. Add one with the button above.</li>'}
        </ul>
        <div class="actions">
          <button class="btn small" data-add-dept="${d.id}">Add an agent here</button>
          <button class="btn small ghost" data-focus-dept="${d.id}">Focus camera</button>
        </div>`;
    }
  }

  /* ----- department board ----- */
  let lastBoardKey = '';
  function renderBoard() {
    const stats = TT.deptStats().sort((p, q) => q.runs - p.runs || q.agents - p.agents);
    const key = stats.map(s => s.dept.id + s.runs + s.agents + s.active).join('|');
    if (key === lastBoardKey) return; lastBoardKey = key;
    const max = Math.max(1, ...stats.map(s => s.runs));
    const html = stats.map(s => `
      <li class="click" data-dept="${s.dept.id}">
        <span class="swatch" style="background:${s.dept.accent}"></span>
        <span class="name">${esc(s.dept.name)}</span>
        <span class="bar"><i style="width:${Math.round(s.runs / max * 100)}%;background:${s.dept.accent}"></i></span>
        <span class="num">${s.runs}</span>
        <span class="num dim">${s.agents}</span>
        <span class="live-dot ${s.active ? 'on' : ''}"></span>
      </li>`).join('');
    $('#board-list').innerHTML = html;
    $('#board-list-wide').innerHTML = html;
    const totals = stats.reduce((t, s) => ({ agents: t.agents + s.agents, runs: t.runs + s.runs, active: t.active + s.active, depts: t.depts + (s.agents ? 1 : 0) }), { agents: 0, runs: 0, active: 0, depts: 0 });
    $('#kpi-agents').textContent = totals.agents;
    $('#kpi-runs').textContent = totals.runs;
    $('#kpi-active').textContent = totals.active;
    $('#kpi-depts').textContent = `${totals.depts}/${stats.length}`;
  }

  /* ----- ticker ----- */
  let lastEvent = null;
  function renderTicker() {
    const ev = TT.town.events()[0];
    if (!ev || ev === lastEvent) return; lastEvent = ev;
    const t = new Date(ev.at);
    const el = $('#ticker');
    el.innerHTML = `<span class="dot ${ev.kind}"></span><time>${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>${esc(ev.text)}`;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    const feedHtml = TT.town.events().slice(0, 12).map(e => `<li><span class="dot ${e.kind}"></span><time>${new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>${esc(e.text)}</li>`).join('');
    $('#feed').innerHTML = feedHtml;
    $('#feed-wide').innerHTML = feedHtml;
  }

  function renderClock() {
    const d = new Date();
    $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dark = TT.darkness();
    $('#daypart').textContent = dark > 0.4 ? 'Night' : dark > 0.05 ? 'Dusk' : 'Day';
  }

  /* ----- add agent ----- */
  function openAdd(deptId) {
    const f = $('#add-form');
    f.reset();
    $('#f-dept').innerHTML = TT.DEPARTMENTS.map(d => `<option value="${d.id}" ${d.id === deptId ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
    $('#modal').classList.add('open');
    setTimeout(() => $('#f-name').focus(), 50);
    previewAlien();
  }
  function closeAdd() { $('#modal').classList.remove('open'); }
  function previewAlien() {
    const name = $('#f-name').value.trim() || 'New agent';
    const role = $('#f-role').value.trim() || 'Helper';
    const deptId = $('#f-dept').value || TT.DEPARTMENTS[0].id;
    $('#f-preview').src = TT.town.previewAvatar(name, role, deptId) || '';
  }
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { return []; }
  }
  function saveCustom(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) { /* ignore */ } }

  function submitAdd(ev) {
    ev.preventDefault();
    const spec = {
      id: 'c' + Date.now().toString(36),
      custom: true,
      createdAt: Date.now(),
      name: $('#f-name').value.trim(),
      role: $('#f-role').value.trim(),
      dept: $('#f-dept').value,
      owner: $('#f-owner').value.trim() || 'Unknown',
      cadence: $('#f-cadence').value.trim() || 'On request',
      about: $('#f-about').value.trim(),
      anim: $('#f-anim').value,
    };
    if (!spec.name || !spec.role) return;
    const a = TT.town.addAgent(spec, { seedHistory: false });
    const list = loadCustom(); list.push(spec); saveCustom(list);
    closeAdd();
    TT.town.select({ kind: 'agent', id: a.id, agent: a });
    lastRosterKey = ''; lastBoardKey = '';
  }

  /* ----- walk mode (CONTRACT_V4 "UI") ----- */
  function walkOn() {
    try { return !!(TT.town.walkMode && TT.town.walkMode()); } catch (e) { return false; }
  }
  /* Mirrors the renderer's walk state onto the page: body.walk drives the HUD, hides the
     camera hint, tooltip and Reset view pill (css), and relabels the header button. */
  function syncWalkUI(on) {
    if (on === undefined) on = walkOn();
    document.body.classList.toggle('walk', on);
    const btn = $('#btn-walk');
    if (btn) btn.textContent = on ? 'Exit walk mode' : 'Walk the town';
    if (!on) {
      const p = $('#walk-prompt'); if (p) p.hidden = true;
      hideWalkV5();
    }
  }
  /* CONTRACT_V5 "UI": the golf HUD, power meter, message banner and interior hint are shown only by the
     renderer while walking. When walk mode ends (button, Tab, Esc twice, board mode) they go back to hidden
     and the fade overlay is cleared so nothing lingers over the town view. */
  const WALK_V5_IDS = ['#golf-hud', '#golf-power', '#golf-msg', '#interior-hint',
    // version 8 round pieces inside #golf-hud, reset so the next walk starts on the practice layout
    '#golf-round-line', '#golf-cart-hint'];
  /* CONTRACT_V6 "UI": the runner pieces the renderer toggles. They are gated by body.subway in css, and
     are also put back to hidden when the game or walk mode ends so a stale card never shows on the next run. */
  const RUNNER_IDS = ['#runner-count', '#runner-over', '#runner-over-newbest', '#runner-over-rank', '#runner-power', '#runner-shield', '#runner-mult'];
  function hideWalkV5() {
    for (const id of WALK_V5_IDS) { const el = $(id); if (el && !el.hidden) el.hidden = true; }
    const fade = $('#fade');
    if (fade && fade.style.opacity !== '' && fade.style.opacity !== '0') fade.style.opacity = '0';
    syncSubwayUI(false);
  }
  /* The renderer reports game mode through TT.town.gameMode() ('subway' or null). body.subway shows the
     runner HUD and hides the walk legend; the renderer may also toggle the class itself, so a missing hook
     leaves the class alone while walking and only clears it when walk mode ends. */
  function subwayOn() {
    try { return !!(TT.town.gameMode && TT.town.gameMode() === 'subway'); } catch (e) { return false; }
  }
  function syncSubwayUI(on) {
    if (document.body.classList.contains('subway') !== on) document.body.classList.toggle('subway', on);
    if (!on) for (const id of RUNNER_IDS) { const el = $(id); if (el && !el.hidden) el.hidden = true; }
  }
  function loadPlayer() {
    try {
      const p = JSON.parse(localStorage.getItem(PLAYER_STORE) || 'null');
      if (!p || typeof p !== 'object') return null;
      if (p.kind !== 'alien' && p.kind !== 'animal') return null;
      return p;
    } catch (e) { return null; }
  }
  function savePlayer(p) { try { localStorage.setItem(PLAYER_STORE, JSON.stringify(p)); } catch (e) { /* ignore */ } }
  /* The player spec handed to the renderer (CONTRACT_V4 "The player object"). Version 11 adds hat: the equipped hat id
     from the wallet (or null), so the visitor wears it in town and in the runner. */
  function playerSpec(p) {
    return {
      name: (p.name || 'You').slice(0, 14),
      role: 'Visitor',
      kind: p.kind === 'animal' ? 'animal' : 'alien',
      species: p.kind === 'animal' ? (SPECIES.includes(p.species) ? p.species : SPECIES[0]) : null,
      color: /^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : DEFAULT_COLOR,
      hat: equippedHat(),
      demo: false,
    };
  }

  /* ----- wallet and shop (CONTRACT_V11 "Coins, the wallet and the shop") -----
     TT.wallet (js/wallet.js) and TT.shop (js/shop.js) are assigned by the renderer. Until then the counter reads 0
     and the shop buttons do nothing. */
  function walletApi() {
    const w = TT.wallet;
    return w && typeof w.owns === 'function' ? w : null;
  }
  function shopApi() {
    const s = TT.shop;
    return s && typeof s.open === 'function' ? s : null;
  }
  function walletCoins() {
    const w = walletApi(); if (!w) return 0;
    try { const n = Math.floor(Number(w.coins)); return Number.isFinite(n) && n > 0 ? n : 0; } catch (e) { return 0; }
  }
  function equippedHat() {
    const w = walletApi(); if (!w) return null;
    try { const eq = w.equipped; return eq && typeof eq.hat === 'string' && eq.hat ? eq.hat : null; } catch (e) { return null; }
  }
  /* The owned hats as { id, label } from the catalogue, for the picker. */
  function ownedHats() {
    const w = walletApi(); if (!w || !Array.isArray(w.catalogue)) return [];
    try { return w.catalogue.filter(i => i && i.slot === 'hat' && w.owns(i.id)).map(i => ({ id: i.id, label: i.label })); } catch (e) { return []; }
  }
  let lastCoins = -1;
  let coinPulseTimer = 0;
  /* Writes the header count; a growing count gets the pulse class for 0.6 s. The first paint never pulses. */
  function renderCoins() {
    const el = $('#coin-count'), btn = $('#coin-counter');
    if (!el) return;
    const n = walletCoins();
    if (n === lastCoins) return;
    const grew = lastCoins >= 0 && n > lastCoins;
    lastCoins = n;
    el.textContent = n.toLocaleString('en-US');
    if (btn) {
      btn.title = `${n.toLocaleString('en-US')} coin${n === 1 ? '' : 's'}. Open the shop`;
      if (grew) {
        btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
        clearTimeout(coinPulseTimer);
        coinPulseTimer = setTimeout(() => btn.classList.remove('pulse'), 650);
      }
    }
  }
  function openShop(context) {
    const s = shopApi(); if (!s) return;
    if (document.pointerLockElement && document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
    try { s.open(context); } catch (e) { console.warn('Thread Town: the shop failed to open', e); }
  }
  function closeShop() {
    const s = shopApi(); if (!s) return;
    try { s.close(); } catch (e) { /* ignore */ }
  }
  function shopOpen() {
    const el = $('#shop-modal');
    return !!(el && el.classList.contains('open'));
  }
  /* The hat field of the picker: hidden until a hat is owned, otherwise the owned hats plus No hat, the equipped one selected. */
  function fillHatField() {
    const field = $('#w-hat-field'), sel = $('#w-hat');
    if (!field || !sel) return;
    const hats = ownedHats();
    if (!hats.length) { field.hidden = true; sel.innerHTML = '<option value="">No hat</option>'; return; }
    const cur = equippedHat();
    sel.innerHTML = '<option value="">No hat</option>' + hats.map(h => `<option value="${esc(h.id)}" ${h.id === cur ? 'selected' : ''}>${esc(h.label)}</option>`).join('');
    field.hidden = false;
  }
  function applyHatField() {
    const w = walletApi(), sel = $('#w-hat');
    if (!w || !sel || $('#w-hat-field').hidden) return;
    try { w.equip('hat', sel.value || null); } catch (e) { /* ignore */ }
  }
  function enterWalk(p) {
    if (!TT.town.setWalkMode) return;
    if (document.body.classList.contains('board')) setBoard(false);
    // The renderer returns false when it refused (player failed to build, renderer missing).
    let ok = false;
    try { ok = !!TT.town.setWalkMode(true, playerSpec(p)); } catch (e) { ok = false; console.warn('Thread Town: setWalkMode failed', e); }
    syncWalkUI(ok);
    if (!ok && TT.log) { TT.log('Walk mode is unavailable.', 'error'); renderTicker(); }
  }
  function exitWalk() {
    if (TT.town.setWalkMode && walkOn()) TT.town.setWalkMode(false);
    syncWalkUI(false);
  }
  function toggleWalk() {
    if (walkOn()) { exitWalk(); return; }
    const p = loadPlayer();
    if (p) enterWalk(p); else openWalkModal();
  }
  function openWalkModal() {
    const p = loadPlayer() || { name: 'You', kind: 'alien', color: DEFAULT_COLOR, species: SPECIES[0] };
    $('#w-name').value = p.name || 'You';
    const kind = document.querySelector(`input[name="w-kind"][value="${p.kind === 'animal' ? 'animal' : 'alien'}"]`);
    if (kind) kind.checked = true;
    // one swatch per department, the alien body color of that team (data.js "alien")
    $('#w-colors').innerHTML = TT.DEPARTMENTS.map(d =>
      `<button type="button" class="swatch-btn" data-color="${d.alien}" title="${esc(d.name)}" aria-label="${esc(d.name)}" style="background:${d.alien}"></button>`).join('');
    selectSwatch(p.color || DEFAULT_COLOR);
    $('#w-species').innerHTML = SPECIES.map(s => `<option value="${s}" ${s === p.species ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('');
    syncWalkKind();
    fillHatField();
    $('#walk-modal').classList.add('open');
    setTimeout(() => $('#w-name').focus(), 50);
  }
  function closeWalkModal() { $('#walk-modal').classList.remove('open'); }
  function selectSwatch(color) {
    let found = false;
    for (const b of document.querySelectorAll('#w-colors .swatch-btn')) {
      const sel = b.dataset.color.toLowerCase() === String(color).toLowerCase();
      b.classList.toggle('sel', sel); found = found || sel;
    }
    if (!found) { const first = document.querySelector(`#w-colors .swatch-btn[data-color="${DEFAULT_COLOR}"]`); if (first) first.classList.add('sel'); }
  }
  function selectedKind() {
    const r = document.querySelector('input[name="w-kind"]:checked');
    return r && r.value === 'animal' ? 'animal' : 'alien';
  }
  function syncWalkKind() {
    const animal = selectedKind() === 'animal';
    $('#w-alien-fields').hidden = animal;
    $('#w-animal-fields').hidden = !animal;
  }
  function submitWalk(ev) {
    ev.preventDefault();
    const sel = document.querySelector('#w-colors .swatch-btn.sel');
    const p = {
      v: 1,
      name: $('#w-name').value.trim().slice(0, 14) || 'You',
      kind: selectedKind(),
      color: sel ? sel.dataset.color : DEFAULT_COLOR,
      species: $('#w-species').value || SPECIES[0],
    };
    savePlayer(p);
    applyHatField();
    closeWalkModal();
    enterWalk(p);
  }
  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  function anyModalOpen() {
    return ['#modal', '#walk-modal', '#leaderboard-modal', '#shop-modal'].some(id => { const el = $(id); return el && el.classList.contains('open'); });
  }

  /* ----- leaderboard (CONTRACT_V6 "Leaderboard" UI) -----
     TT.leaderboard = { top(game, n), all(), clear(game) } is assigned by the renderer once js/leaderboard.js
     is wired in; until then the lists show their empty copy. The renderer calls TT.onLeaderboardChange()
     after every record; ui.js re-renders both the modal (when open) and the sidebar section. */
  const LB_GAMES = ['subway', 'golf'];
  const COURSE_NAME = 'Thread National';
  const COURSE_HOLES = 9;
  /* The course name and hole count from the sim (state.golf), then the plan, then the version 10 constants. */
  function courseName() {
    const g = TT.state && TT.state.golf;
    if (g && typeof g.name === 'string' && g.name) return g.name;
    const p = TT.PLAN || (TT.sim && TT.sim.PLAN);
    if (p && p.golf && typeof p.golf.name === 'string' && p.golf.name) return p.golf.name;
    return COURSE_NAME;
  }
  function courseHoles() {
    const g = TT.state && TT.state.golf;
    return g && Array.isArray(g.holes) && g.holes.length ? g.holes.length : COURSE_HOLES;
  }
  const LB_COPY = {
    subway: { score: 'Distance', detail: 'Coins and time', empty: 'No runs yet. Take the subway from the plaza while walking.' },
    golf: { score: 'Strokes', detail: 'To par, card and time', empty: 'No rounds yet. Play a full nine-hole round from the ' + COURSE_NAME + ' clubhouse while walking.' },
  };
  let lbTab = 'subway';
  let lastLbKey = '';
  function lbApi() {
    const lb = TT.leaderboard;
    return lb && typeof lb.top === 'function' ? lb : null;
  }
  function lbTop(game, n) {
    const lb = lbApi(); if (!lb) return [];
    try { const r = lb.top(game, n); return Array.isArray(r) ? r : []; } catch (e) { return []; }
  }
  function lbCount(game) {
    const lb = lbApi(); if (!lb) return 0;
    try { const a = lb.all(); return a && Array.isArray(a[game]) ? a[game].length : 0; } catch (e) { return 0; }
  }
  function fmtSeconds(s) {
    s = Math.max(0, Math.round(Number(s) || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`;
  }
  function fmtScore(game, e) {
    const n = Number(e.score) || 0;
    return game === 'golf' ? String(n) : `${n.toLocaleString('en-US')} m`;
  }
  /* CONTRACT_V8 "Leaderboard": golf detail is { seconds, card: [6], toPar }. Older entries without toPar get it
     from the card and the course pars when both are known; otherwise To par stays blank. */
  function golfToPar(d) {
    if (d && isFinite(d.toPar)) return Number(d.toPar);
    const holes = TT.state && TT.state.golf && Array.isArray(TT.state.golf.holes) ? TT.state.golf.holes : null;
    if (!holes || !Array.isArray(d && d.card) || d.card.length !== holes.length) return null;
    let t = 0;
    for (let i = 0; i < holes.length; i++) {
      const s = Number(d.card[i]), p = holes[i] && Number(holes[i].par);
      if (!isFinite(s) || !isFinite(p)) return null;
      t += s - p;
    }
    return t;
  }
  function fmtToPar(n) {
    if (n == null || !isFinite(n)) return '';
    return n === 0 ? 'E' : n > 0 ? `+${n}` : String(n);
  }
  function golfCard(d) { return Array.isArray(d.card) ? d.card.map(x => Number(x) || 0).join(' ') : ''; }
  function fmtDetail(game, e) {
    const d = e.detail || {};
    if (game === 'golf') {
      return [fmtToPar(golfToPar(d)), golfCard(d), d.seconds != null ? fmtSeconds(d.seconds) : ''].filter(Boolean).join(' · ');
    }
    const coins = `${Number(d.coins) || 0} coins`;
    return d.seconds != null ? `${coins} · ${fmtSeconds(d.seconds)}` : coins;
  }
  /* The modal row for golf: To par in bold (salmon under par), then the card and the time. */
  function golfDetailHtml(e) {
    const d = e.detail || {};
    const tp = golfToPar(d);
    const parts = [];
    if (tp != null) parts.push(`<b class="lb-topar ${tp < 0 ? 't-under' : ''}">${esc(fmtToPar(tp))}</b>`);
    const card = golfCard(d);
    if (card) parts.push(`<span class="lb-card-line">${esc(card)}</span>`);
    if (d.seconds != null) parts.push(esc(fmtSeconds(d.seconds)));
    return parts.join(' · ');
  }
  function fmtLbDate(ms) {
    const d = new Date(Number(ms) || Date.now());
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  /* Tiny badge: an aqua circle with A for an alien, a salmon one with the species initial for an animal. */
  function lbBadge(e) {
    const c = String(e.character || 'alien');
    const animal = c !== 'alien';
    const label = animal ? c.charAt(0).toUpperCase() + c.slice(1) : 'Alien';
    return `<span class="lb-badge ${animal ? 'animal' : ''}" title="${esc(label)}">${esc(label.charAt(0))}</span>`;
  }
  function lbRowKey(game, list) {
    return game + ':' + list.map(e => `${e.name}|${e.character}|${e.score}|${e.at}`).join(';');
  }
  function renderLeaderboardSide() {
    const parts = LB_GAMES.map(g => ({ g, list: lbTop(g, 3) }));
    const key = 'side:' + parts.map(p => lbRowKey(p.g, p.list)).join('#');
    if (key === lastLbKey) return; lastLbKey = key;
    for (const { g, list } of parts) {
      const el = $('#lb-side-' + g); if (!el) continue;
      el.innerHTML = list.length ? list.map((e, i) => `
        <li><span class="lb-rank">${i + 1}</span>${lbBadge(e)}<b title="${esc(e.name || 'You')}">${esc(e.name || 'You')}</b><span class="lb-score" title="${esc(fmtDetail(g, e))}">${fmtScore(g, e)}${g === 'golf' && golfToPar(e.detail) != null ? ` <small>${esc(fmtToPar(golfToPar(e.detail)))}</small>` : ''}</span></li>`).join('')
        : `<li class="lb-empty">${g === 'golf' ? 'No rounds yet' : 'No runs yet'}</li>`;
    }
  }
  function renderLeaderboardModal() {
    const modal = $('#leaderboard-modal'); if (!modal || !modal.classList.contains('open')) return;
    const game = lbTab;
    for (const b of document.querySelectorAll('#leaderboard-modal .lb-tab')) {
      const sel = b.dataset.lbTab === game;
      b.classList.toggle('sel', sel); b.setAttribute('aria-selected', sel ? 'true' : 'false');
    }
    $('#lb-head-score').textContent = LB_COPY[game].score;
    $('#lb-head-detail').textContent = LB_COPY[game].detail;
    // the golf tab widens the detail column for To par and the card (css .lb-head.golf, .lb-list.golf)
    const head = document.querySelector('#leaderboard-modal .lb-head');
    if (head) head.classList.toggle('golf', game === 'golf');
    $('#lb-list').classList.toggle('golf', game === 'golf');
    const list = lbTop(game, 50);
    $('#lb-list').innerHTML = list.length ? list.map((e, i) => `
      <li>
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${lbBadge(e)}<b title="${esc(e.name || 'You')}">${esc(e.name || 'You')}</b></span>
        <span class="lb-score">${fmtScore(game, e)}</span>
        <span class="lb-detail" title="${esc(fmtDetail(game, e))}">${game === 'golf' ? golfDetailHtml(e) : esc(fmtDetail(game, e))}</span>
        <span class="lb-date">${esc(fmtLbDate(e.at))}</span>
      </li>`).join('') : `<li class="lb-empty">${esc(LB_COPY[game].empty)}</li>`;
    const clear = $('#lb-clear');
    clear.disabled = !lbApi() || list.length === 0;
    clear.textContent = game === 'golf' ? 'Clear rounds' : 'Clear subway';
  }
  /* The course name on the leaderboard tab ('Thread National · 9 holes'), the sidebar section, the modal lead
     and the HUD course line. Runs once at init, after the sim has the plan. */
  function applyCourseName() {
    const name = courseName(), n = courseHoles();
    const tab = document.querySelector('#leaderboard-modal .lb-tab[data-lb-tab="golf"]');
    if (tab) tab.textContent = name + ' · ' + n + ' holes';
    const side = document.querySelector('#leaderboard-section .lb-side-game h4[data-game="golf"]');
    if (side) side.textContent = name;
    const lead = $('#lb-lead');
    if (lead) lead.textContent = 'Best runs on the subway and the lowest nine-hole rounds at ' + name + ', by everyone who has walked this town.';
    const course = $('#golf-course');
    if (course) course.textContent = name;
    const btn = $('#btn-leaderboard');
    if (btn) btn.title = 'Subway and ' + name + ' records';
  }
  function renderLeaderboard() { lastLbKey = ''; renderLeaderboardSide(); renderLeaderboardModal(); }
  function openLeaderboard(game) {
    if (LB_GAMES.includes(game)) lbTab = game;
    $('#leaderboard-modal').classList.add('open');
    renderLeaderboardModal();
    const tab = document.querySelector(`#leaderboard-modal .lb-tab[data-lb-tab="${lbTab}"]`);
    if (tab) setTimeout(() => tab.focus(), 50);
  }
  function closeLeaderboard() { $('#leaderboard-modal').classList.remove('open'); }
  function clearLeaderboard() {
    const lb = lbApi(); if (!lb || typeof lb.clear !== 'function') return;
    const n = lbCount(lbTab);
    const what = lbTab === 'golf' ? courseName() + ' round' : 'subway run';
    if (!window.confirm(`Clear ${n} ${what}${n === 1 ? '' : 's'} from the leaderboard? This cannot be undone.`)) return;
    try { lb.clear(lbTab); } catch (e) { console.warn('Thread Town: leaderboard clear failed', e); }
    renderLeaderboard();
  }

  /* ----- board mode ----- */
  function setBoard(on) {
    // CONTRACT_V4: board mode exits walk mode first.
    if (on && walkOn()) exitWalk();
    document.body.classList.toggle('board', on);
    $('#btn-board').textContent = on ? 'Exit board mode' : 'Board mode';
    // Contract: setCinematic(true) on enter, false on exit. Mirror it on the header toggle so the two stay in step.
    $('#toggle-cinematic').checked = on;
    TT.town.setCinematic(on);
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  /* ----- wire up ----- */
  /* CONTRACT_V7 "Golf grows to six holes", CONTRACT_V10 "Thread National": the scorecard in index.html is a
     nine-hole placeholder; once the sim has rasterized the course the header, par row, You cells and Round cells
     are rebuilt from state.golf.holes so the card length and the pars follow the course (nine holes, par 35). The
     placeholder round line reads 'of 9' from the hole count. Runs once at init, before the renderer caches the cells. */
  function buildGolfCard() {
    const holes = TT.state && TT.state.golf && Array.isArray(TT.state.golf.holes) ? TT.state.golf.holes : [];
    const table = $('#golf-card');
    if (!holes.length || !table || !table.tHead || !table.tBodies[0]) return;
    const head = table.tHead.rows[0], parRow = table.tBodies[0].rows[0], youRow = table.tBodies[0].rows[1], roundRow = table.tBodies[0].rows[2];
    if (!head || !parRow || !youRow) return;
    const pars = holes.map(h => (h && isFinite(h.par) && h.par > 0 ? h.par : 3));
    const sum = pars.reduce((a, b) => a + b, 0);
    head.innerHTML = '<th>Hole</th>' + holes.map((h, i) => `<th>${isFinite(h.n) ? h.n : i + 1}</th>`).join('') + '<th>Total</th>';
    parRow.innerHTML = '<td>Par</td>' + pars.map(p => `<td>${p}</td>`).join('') + `<td>${sum}</td>`;
    youRow.innerHTML = '<td>You</td>' + holes.map((h, i) => `<td id="golf-c${i + 1}">·</td>`).join('') + '<td id="golf-total">·</td>';
    // CONTRACT_V8 "HUD": the round card cells the renderer writes during a round, with the running to par below
    if (roundRow) roundRow.innerHTML = '<td>Round</td>' + holes.map((h, i) => `<td id="golf-card-${i + 1}">·</td>`).join('') + '<td id="golf-card-total">·</td>';
    const rl = $('#golf-round-line');
    if (rl) rl.textContent = 'Round · Hole 1 of ' + holes.length + ' · Par ' + pars[0] + ' · Stroke 0';
    const title = $('#golf-title');
    if (title) title.textContent = 'Hole 1 · Par ' + pars[0] + ' · Stroke 0';
  }
  function init() {
    TT.sim.init(); // idempotent; makes sure the map exists before the renderer builds it
    buildGolfCard();
    applyCourseName();
    TT.town.init(document.getElementById('stage-host'));
    for (const spec of loadCustom()) TT.town.addAgent(spec, { seedHistory: false });

    TT.onSelect = (p) => {
      lastRosterKey = ''; lastInspKey = '';
      if (p && !document.body.classList.contains('board')) { renderInspector(); $('#inspector-section').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    };
    TT.onHover = showTip;

    document.addEventListener('click', ev => {
      const fa = ev.target.closest('[data-focus-agent]');
      if (fa) { TT.town.focusOn('agent', fa.dataset.focusAgent); return; }
      const fd = ev.target.closest('[data-focus-dept]');
      if (fd) { TT.town.focusOn('dept', fd.dataset.focusDept); return; }
      const fo = ev.target.closest('[data-follow]');
      if (fo) { TT.town.follow(TT.town.following === fo.dataset.follow ? null : fo.dataset.follow); lastInspKey = ''; renderInspector(); return; }
      if (ev.target.closest('#btn-reset-view')) { TT.town.resetView(); return; }
      const row = ev.target.closest('[data-id]');
      if (row) { const a = TT.town.agents().find(x => x.id === row.dataset.id); if (a) { TT.town.select({ kind: 'agent', id: a.id, agent: a }); lastRosterKey = ''; lastInspKey = ''; } return; }
      const dep = ev.target.closest('[data-dept]');
      if (dep) { const d = TT.deptById[dep.dataset.dept]; TT.town.select({ kind: 'dept', id: d.id, dept: d, building: d.building }); lastInspKey = ''; return; }
      const run = ev.target.closest('[data-run]');
      if (run) { TT.town.runNow(run.dataset.run); lastInspKey = ''; return; }
      const rm = ev.target.closest('[data-remove]');
      if (rm) { TT.town.removeAgent(rm.dataset.remove); saveCustom(loadCustom().filter(s => s.id !== rm.dataset.remove)); lastRosterKey = ''; lastInspKey = ''; lastBoardKey = ''; return; }
      const addDept = ev.target.closest('[data-add-dept]');
      if (addDept) { openAdd(addDept.dataset.addDept); return; }
      if (ev.target.closest('[data-close-insp]')) { TT.town.select(null); lastRosterKey = ''; lastInspKey = ''; return; }
    });

    $('#btn-add').addEventListener('click', () => openAdd());
    $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal' || ev.target.dataset.close !== undefined) closeAdd(); });
    $('#add-form').addEventListener('submit', submitAdd);
    $('#f-name').addEventListener('input', previewAlien);
    $('#f-role').addEventListener('input', previewAlien);
    $('#f-dept').addEventListener('change', previewAlien);
    $('#btn-board').addEventListener('click', () => setBoard(!document.body.classList.contains('board')));
    $('#btn-walk').addEventListener('click', toggleWalk);
    $('#walk-modal').addEventListener('click', ev => { if (ev.target.id === 'walk-modal' || ev.target.dataset.close !== undefined) closeWalkModal(); });
    $('#walk-form').addEventListener('submit', submitWalk);
    $('#w-colors').addEventListener('click', ev => { const b = ev.target.closest('.swatch-btn'); if (b) selectSwatch(b.dataset.color); });
    for (const r of document.querySelectorAll('input[name="w-kind"]')) r.addEventListener('change', syncWalkKind);
    $('#walk-change').addEventListener('click', ev => { ev.preventDefault(); openWalkModal(); });
    /* Leaderboard: header button, sidebar See all, tabs, Clear with confirm, close on backdrop or Close. */
    $('#btn-leaderboard').addEventListener('click', () => openLeaderboard());
    $('#btn-leaderboard-side').addEventListener('click', () => openLeaderboard());
    $('#leaderboard-modal').addEventListener('click', ev => {
      if (ev.target.id === 'leaderboard-modal' || ev.target.dataset.close !== undefined) { closeLeaderboard(); return; }
      const tab = ev.target.closest('.lb-tab');
      if (tab) { lbTab = LB_GAMES.includes(tab.dataset.lbTab) ? tab.dataset.lbTab : 'subway'; renderLeaderboardModal(); return; }
      if (ev.target.closest('#lb-clear')) clearLeaderboard();
    });
    TT.onLeaderboardChange = renderLeaderboard;
    renderLeaderboard();
    /* Wallet and shop: the header counter opens the shop, the runner card's Shop button opens it on Power-ups, and the
       renderer's TT.onWalletChange repaints the counter at once (the 400 ms pass catches anything else). */
    $('#coin-counter').addEventListener('click', () => openShop('header'));
    const runnerShop = $('#runner-shop');
    if (runnerShop) runnerShop.addEventListener('click', () => openShop('runner'));
    TT.onWalletChange = () => { renderCoins(); if ($('#walk-modal').classList.contains('open')) fillHatField(); };
    renderCoins();
    document.addEventListener('keydown', ev => {
      // Nothing here fires while typing in a field: the add-agent, avatar and leaderboard forms own their keys.
      if (isTyping(ev.target)) return;
      if (ev.key === 'Tab') {
        // Tab toggles walk mode when no modal is open and the subway runner is not up (the game owns the keys then)
        if (anyModalOpen() || document.body.classList.contains('subway')) return;
        ev.preventDefault();
        toggleWalk();
        return;
      }
      if (ev.key !== 'Escape') return;
      // While the pointer is locked, Esc only releases the lock (the browser does that); the
      // renderer handles a second Esc. Never exit board mode or reset the view from here then.
      if (document.pointerLockElement) return;
      closeAdd();
      if (shopOpen()) { closeShop(); return; }
      if ($('#leaderboard-modal').classList.contains('open')) { closeLeaderboard(); return; }
      if ($('#walk-modal').classList.contains('open')) { closeWalkModal(); return; }
      if (walkOn()) return; // the renderer exits walk mode (and quits the subway) and resets the view itself
      if (document.body.classList.contains('board')) setBoard(false);
      else TT.town.resetView();
    });
    document.addEventListener('pointerlockchange', () => syncWalkUI());
    $('#lighting').addEventListener('change', ev => { TT.town.settings.lighting = ev.target.value; });
    $('#toggle-sim').addEventListener('change', ev => { TT.town.settings.simulate = ev.target.checked; });
    $('#toggle-demo').addEventListener('change', ev => { TT.town.settings.showDemo = ev.target.checked; lastRosterKey = ''; lastBoardKey = ''; lastInspKey = ''; });
    $('#toggle-cinematic').addEventListener('change', ev => { TT.town.setCinematic(ev.target.checked); });
    const camSel = $('#camera-mode');
    if (camSel && TT.town.setCameraMode) {
      camSel.value = TT.town.cameraMode ? TT.town.cameraMode() : 'free';
      camSel.addEventListener('change', ev => { TT.town.setCameraMode(ev.target.value); });
    }

    /* The Reset view pill shows only when the camera has left the full-town framing. */
    function renderResetView() {
      const btn = $('#btn-reset-view');
      if (!btn) return;
      const hide = TT.town.isDefaultView();
      if (btn.hidden !== hide) btn.hidden = hide;
    }
    /* The renderer can leave walk mode on its own (Esc twice), so keep body.walk in step. */
    function renderWalk() {
      const on = walkOn();
      if (document.body.classList.contains('walk') !== on) syncWalkUI(on);
      // body.subway follows the renderer's game mode while walking (CONTRACT_V6 "UI")
      if (on && TT.town.gameMode) syncSubwayUI(subwayOn());
    }
    setInterval(() => { renderRoster(); renderInspector(); renderBoard(); renderTicker(); renderClock(); renderResetView(); renderWalk(); renderLeaderboardSide(); renderCoins(); }, 400);
    renderBoard(); renderClock();
    // Roster and inspector need portraits, which need one rendered frame. Defer them past the first rAF.
    requestAnimationFrame(() => requestAnimationFrame(() => { renderRoster(); renderInspector(); }));
  }

  /* If render3d.js or the three.js CDN never loads, TT.ready never resolves. Say so instead of sitting on a blank stage. */
  function readyOrTimeout() {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('renderer timeout')), 8000));
    return Promise.race([TT.ready, timeout]);
  }
  function showLoadFailure(err) {
    const el = $('#ticker');
    if (el) { el.innerHTML = '<span class="dot error"></span>The 3D renderer did not load. Check the network or the console.'; }
    console.error('Thread Town: the 3D renderer did not load.', err);
  }

  document.addEventListener('DOMContentLoaded', () => readyOrTimeout().then(init).catch(showLoadFailure));
})();
