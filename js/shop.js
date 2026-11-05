/* Thread Town shop (CONTRACT_V11 "Coins, the wallet and the shop").

   Public surface:
     createShop({ wallet, onChange, doc }) -> { open(context), close(), isOpen(), setTab(id), render(), el }
       wallet: the object from js/wallet.js createWallet.
       onChange(wallet, event): called after a purchase, an equip or a clear; event = { kind: 'buy' | 'equip', id }.
       doc: the document to use (defaults to window.document).
     open(context): context is 'kiosk' (the plaza kiosk, the default), 'runner' (the runner's start screen, opens on
       Power-ups) or 'header' (the coin counter). close() hides it. el is the modal root.

   The modal is the #shop-modal markup in index.html (the leaderboard modal pattern: a fixed backdrop, .card inside,
   .open on the root shows it, a click on the backdrop or a [data-close] closes it). When the markup is missing the
   shop builds the same markup under document.body so it also works in a bare page.

   Tabs: Rides (the hoverboard), Power-ups (the consumables, with the count held), Looks (board colours and hats).
   Each row shows the label, a line about it, the price, and one action: Buy, Equip, Equipped, Owned, or
   'Short by n' when the wallet cannot afford it. A refused purchase shakes the row and writes the reason to the note. */

import { TABS, SLOTS } from './wallet.js';

const CONTEXT_COPY = {
  kiosk: { title: 'Thread shop', lead: 'Spend the coins you collected on the subway. The hoverboard rides anywhere in town, power-ups go on your next run, looks stay on.' },
  runner: { title: 'Before you run', lead: 'Start the next run with a power-up, or save up for the hoverboard.' },
  header: { title: 'Thread shop', lead: 'Coins come from the subway runner. Spend them here, or at the kiosk on the plaza.' },
};
const SLOT_LABEL = { board: 'Board colour', hat: 'Hat' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

function buildMarkup(doc) {
  const root = doc.createElement('div');
  root.id = 'shop-modal';
  root.innerHTML = `
    <div class="card shop-card" role="dialog" aria-labelledby="shop-title">
      <div class="shop-head">
        <div>
          <h2 id="shop-title">Thread shop</h2>
          <p class="lead" id="shop-lead"></p>
        </div>
        <div class="shop-balance" title="Your coins"><span class="coin-disc"></span><b id="shop-coins">0</b></div>
      </div>
      <div class="shop-tabs" role="tablist" id="shop-tabs"></div>
      <ul class="shop-list" id="shop-list"></ul>
      <div class="shop-note" id="shop-note" hidden></div>
      <div class="actions">
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-close>Close</button>
      </div>
    </div>`;
  return root;
}

export function createShop(opts) {
  const o = opts || {};
  const wallet = o.wallet;
  if (!wallet || typeof wallet.buy !== 'function') throw new Error('shop: a wallet from createWallet is required');
  const doc = o.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('shop: a document is required');
  const onChange = typeof o.onChange === 'function' ? o.onChange : null;

  let el = doc.getElementById('shop-modal');
  if (!el) { el = buildMarkup(doc); doc.body.appendChild(el); }
  const $ = s => el.querySelector(s);
  const tabsEl = $('#shop-tabs'), listEl = $('#shop-list'), noteEl = $('#shop-note');
  const coinsEl = $('#shop-coins'), leadEl = $('#shop-lead'), titleEl = $('#shop-title');

  let tab = 'rides';
  let context = 'kiosk';
  let noteTimer = 0;

  function items(tabId) {
    return wallet.catalogue.filter(i => i.tab === tabId);
  }

  function renderTabs() {
    if (!tabsEl) return;
    tabsEl.innerHTML = TABS.map(t => {
      const held = t.id === 'powerups' ? items('powerups').reduce((n, i) => n + wallet.count(i.id), 0) : 0;
      return `<button type="button" class="shop-tab ${t.id === tab ? 'sel' : ''}" data-shop-tab="${t.id}" role="tab" aria-selected="${t.id === tab ? 'true' : 'false'}">${esc(t.label)}${held ? ` <span class="shop-held">${held}</span>` : ''}</button>`;
    }).join('');
  }

  /* One row per item. The state decides the action and the badge:
       consumable: Buy, plus 'x n held' when some are held
       one-time, not owned: Buy, or Short by n (disabled)
       one-time, owned, no slot: Owned
       one-time, owned, slot: Equipped (disabled) or Equip */
  function rowHtml(item) {
    const owned = wallet.owns(item.id);
    const held = item.kind === 'consumable' ? wallet.count(item.id) : 0;
    const equipped = item.slot ? wallet.equipped[item.slot] === item.id : false;
    const short = Math.max(0, item.price - wallet.coins);
    let action = '';
    let badge = '';
    if (item.kind === 'consumable') {
      action = short
        ? `<button type="button" class="btn small shop-act short" data-shop-buy="${item.id}" disabled>Short by ${fmt(short)}</button>`
        : `<button type="button" class="btn small primary shop-act" data-shop-buy="${item.id}">Buy</button>`;
      if (held) badge = `<span class="shop-badge held">${held} held</span>`;
    } else if (!owned) {
      action = short
        ? `<button type="button" class="btn small shop-act short" data-shop-buy="${item.id}" disabled>Short by ${fmt(short)}</button>`
        : `<button type="button" class="btn small primary shop-act" data-shop-buy="${item.id}">Buy</button>`;
    } else if (!item.slot) {
      badge = '<span class="shop-badge owned">Owned</span>';
      action = '<button type="button" class="btn small ghost shop-act" disabled>Owned</button>';
    } else if (equipped) {
      badge = '<span class="shop-badge equipped">Equipped</span>';
      action = `<button type="button" class="btn small ghost shop-act" data-shop-unequip="${item.slot}">Take off</button>`;
    } else {
      badge = '<span class="shop-badge owned">Owned</span>';
      action = `<button type="button" class="btn small shop-act" data-shop-equip="${item.id}">Equip</button>`;
    }
    const swatch = item.color ? `<span class="shop-swatch" style="background:${esc(item.color)}"></span>` : '';
    const slotLine = item.slot ? `<span class="shop-slot">${esc(SLOT_LABEL[item.slot] || item.slot)}</span>` : '';
    const kindLine = item.kind === 'consumable' ? '<span class="shop-slot">One run</span>' : '';
    return `
      <li class="shop-item ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" data-shop-item="${item.id}">
        <div class="shop-icon ${esc(item.id)}">${swatch}</div>
        <div class="shop-body">
          <div class="shop-name"><b>${esc(item.label)}</b>${badge}${slotLine}${kindLine}</div>
          <div class="shop-about">${esc(item.about || '')}</div>
        </div>
        <div class="shop-price"><span class="coin-disc"></span>${fmt(item.price)}</div>
        <div class="shop-action">${action}</div>
      </li>`;
  }

  function render() {
    if (coinsEl) coinsEl.textContent = fmt(wallet.coins);
    renderTabs();
    if (listEl) {
      const list = items(tab);
      listEl.innerHTML = list.map(rowHtml).join('') || '<li class="shop-empty">Nothing here yet.</li>';
      listEl.className = 'shop-list ' + tab;
    }
  }

  function note(text, kind) {
    if (!noteEl) return;
    clearTimeout(noteTimer);
    if (!text) { noteEl.hidden = true; noteEl.textContent = ''; return; }
    noteEl.textContent = text;
    noteEl.className = 'shop-note ' + (kind || '');
    noteEl.hidden = false;
    noteTimer = setTimeout(() => { noteEl.hidden = true; }, 3200);
  }

  function shake(id) {
    const row = listEl && listEl.querySelector(`[data-shop-item="${id}"]`);
    if (!row) return;
    row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
  }

  function changed(kind, id) {
    render();
    if (onChange) { try { onChange(wallet, { kind, id }); } catch (e) { /* listener failure never breaks the shop */ } }
  }

  function tryBuy(id) {
    const item = wallet.itemById(id);
    if (!item) return false;
    const why = wallet.refusal(id);
    if (why === 'owned') { note('You already own the ' + item.label.toLowerCase() + '.', 'warn'); shake(id); return false; }
    if (why === 'short') { note('Short by ' + fmt(item.price - wallet.coins) + ' coins for the ' + item.label.toLowerCase() + '. Coins come from the subway runner.', 'warn'); shake(id); return false; }
    if (!wallet.buy(id)) { note('That purchase did not go through.', 'warn'); shake(id); return false; }
    const what = item.kind === 'consumable' ? item.label + ' ready for your next run.' : item.slot ? item.label + ' bought and equipped.' : item.label + ' is yours.';
    note(what, 'ok');
    changed('buy', id);
    return true;
  }

  function tryEquip(id) {
    const item = wallet.itemById(id);
    if (!item || !item.slot) return false;
    if (!wallet.equip(item.slot, id)) { note('You do not own the ' + item.label.toLowerCase() + ' yet.', 'warn'); shake(id); return false; }
    changed('equip', id);
    return true;
  }

  function tryUnequip(slot) {
    if (!SLOTS.includes(slot)) return false;
    if (!wallet.equip(slot, null)) return false;
    changed('equip', null);
    return true;
  }

  function setTab(id) {
    tab = TABS.some(t => t.id === id) ? id : 'rides';
    render();
    return tab;
  }

  function open(ctx) {
    context = CONTEXT_COPY[ctx] ? ctx : 'kiosk';
    const copy = CONTEXT_COPY[context];
    if (titleEl) titleEl.textContent = copy.title;
    if (leadEl) leadEl.textContent = copy.lead;
    if (context === 'runner') tab = 'powerups';
    else if (!wallet.owns('hoverboard')) tab = 'rides';
    note('');
    render();
    el.classList.add('open');
    el.dataset.context = context;
    const first = el.querySelector('.shop-tab.sel');
    if (first && typeof first.focus === 'function') setTimeout(() => first.focus(), 50);
  }

  function close() {
    el.classList.remove('open');
    note('');
  }

  function isOpen() {
    return el.classList.contains('open');
  }

  el.addEventListener('click', ev => {
    const t = ev.target;
    if (t === el || (t.dataset && t.dataset.close !== undefined)) { close(); return; }
    const tabBtn = t.closest && t.closest('[data-shop-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.shopTab); return; }
    const buy = t.closest && t.closest('[data-shop-buy]');
    if (buy) { tryBuy(buy.dataset.shopBuy); return; }
    const eq = t.closest && t.closest('[data-shop-equip]');
    if (eq) { tryEquip(eq.dataset.shopEquip); return; }
    const un = t.closest && t.closest('[data-shop-unequip]');
    if (un) { tryUnequip(un.dataset.shopUnequip); return; }
  });

  render();
  return { open, close, isOpen, setTab, render, buy: tryBuy, equip: tryEquip, el, get context() { return context; }, get tab() { return tab; } };
}
