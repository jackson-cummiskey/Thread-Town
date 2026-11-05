/* Thread Town wallet (CONTRACT_V11 "Coins, the wallet and the shop", docs/V11_DESIGN.md "The shop catalogue").

   Public surface:
     createWallet(storage) -> { coins, add(n), spend(n), owns(id), count(id), buy(id), equip(slot, id), equipped,
                                consume(id), catalogue, itemById(id), load(), save(), onChange }
     storage = { get(key), set(key, value) }; values are JSON-serializable objects (the renderer wraps localStorage
     with the same townStorage the leaderboard uses). A missing storage, a throwing storage, or corrupt data all read
     as an empty wallet: no coins, nothing owned, nothing equipped.

   Storage key threadtown.wallet.v1 holds
     { v: 1, coins, owned: [id], consumables: { id: count }, equipped: { board: id | null, hat: id | null } }.

   Rules:
     coins is a non negative integer; add(n) only grows it (n floored, negatives ignored) and spend(n) refuses when short.
     buy(id) refuses an unknown id, a one-time item already owned, or a short wallet; it returns true when the coins moved.
     Buying the hoverboard also grants board-navy (the default deck colour) and equips it when no board is equipped.
     Buying a looks item (slot board or hat) equips it straight away.
     consume(id) spends one held consumable (magnet, jetpack, multiplier) and returns true when one was held.
     equip(slot, id) refuses an unknown slot, an item not owned, or an item of another slot; equip(slot, null) clears the slot.
     The wallet writes storage after every change and calls onChange(wallet) when one is set. */

export const WALLET_KEY = 'threadtown.wallet.v1';
export const SLOTS = ['board', 'hat'];
export const TABS = [
  { id: 'rides', label: 'Rides' },
  { id: 'powerups', label: 'Power-ups' },
  { id: 'looks', label: 'Looks' },
];

/* Ids, prices, slots and labels are fixed in docs/V11_DESIGN.md so the wallet, the shop and the picker agree. */
export const CATALOGUE = Object.freeze([
  { id: 'hoverboard', label: 'Hoverboard', price: 1200, kind: 'one-time', slot: null, tab: 'rides',
    about: 'Ride it anywhere in town, off the ridge and over the lake. In the runner, H forgives one crash within 30 seconds.' },
  { id: 'magnet', label: 'Coin magnet', price: 150, kind: 'consumable', slot: null, tab: 'powerups',
    about: 'Your next run starts with the magnet active.' },
  { id: 'jetpack', label: 'Jetpack', price: 250, kind: 'consumable', slot: null, tab: 'powerups',
    about: 'Your next run starts with the jetpack active.' },
  { id: 'multiplier', label: '2x multiplier', price: 200, kind: 'consumable', slot: null, tab: 'powerups',
    about: 'Your next run starts with the 2x multiplier active.' },
  { id: 'board-navy', label: 'Navy board', price: 100, kind: 'one-time', slot: 'board', tab: 'looks', color: '#002D4F',
    about: 'The hoverboard deck in navy. Comes with the hoverboard.' },
  { id: 'board-aqua', label: 'Aqua board', price: 100, kind: 'one-time', slot: 'board', tab: 'looks', color: '#75CCD0',
    about: 'The hoverboard deck in aqua.' },
  { id: 'board-salmon', label: 'Salmon board', price: 100, kind: 'one-time', slot: 'board', tab: 'looks', color: '#E7706F',
    about: 'The hoverboard deck in salmon.' },
  { id: 'board-silver', label: 'Silver board', price: 100, kind: 'one-time', slot: 'board', tab: 'looks', color: '#E2E9EE',
    about: 'The hoverboard deck in silver.' },
  { id: 'board-sand', label: 'Sand board', price: 100, kind: 'one-time', slot: 'board', tab: 'looks', color: '#E8DCC2',
    about: 'The hoverboard deck in sand.' },
  { id: 'hat-cap', label: 'Cap', price: 300, kind: 'one-time', slot: 'hat', tab: 'looks',
    about: 'A navy cap, worn in town and in the runner.' },
  { id: 'hat-beanie', label: 'Beanie', price: 300, kind: 'one-time', slot: 'hat', tab: 'looks',
    about: 'A salmon beanie, worn in town and in the runner.' },
  { id: 'hat-crown', label: 'Crown', price: 300, kind: 'one-time', slot: 'hat', tab: 'looks',
    about: 'A small gold crown, worn in town and in the runner.' },
  { id: 'hat-cowboy', label: 'Cowboy hat', price: 300, kind: 'one-time', slot: 'hat', tab: 'looks',
    about: 'A sand cowboy hat, worn in town and in the runner.' },
  { id: 'hat-visor', label: 'Thread visor', price: 300, kind: 'one-time', slot: 'hat', tab: 'looks',
    about: 'An aqua visor with the Thread mark, worn in town and in the runner.' },
].map(Object.freeze));

const BY_ID = new Map(CATALOGUE.map(item => [item.id, item]));
const CONSUMABLE_IDS = CATALOGUE.filter(i => i.kind === 'consumable').map(i => i.id);

export function itemById(id) {
  return BY_ID.get(String(id)) || null;
}

function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function emptyWallet() {
  return { coins: 0, owned: new Set(), consumables: {}, equipped: { board: null, hat: null } };
}

export function createWallet(storage) {
  const store = storage && typeof storage.get === 'function' && typeof storage.set === 'function'
    ? storage
    : { get() { return null; }, set() {} };

  let w = emptyWallet();

  /* Reads storage into memory. Unknown ids, bad counts and an equipped item that is not owned are dropped. */
  function load() {
    let raw = null;
    try { raw = store.get(WALLET_KEY); } catch (e) { raw = null; }
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { raw = null; }
    }
    w = emptyWallet();
    if (!raw || typeof raw !== 'object') return api;
    w.coins = toCount(raw.coins);
    const owned = Array.isArray(raw.owned) ? raw.owned : [];
    for (const id of owned) {
      const item = itemById(id);
      if (item && item.kind === 'one-time') w.owned.add(item.id);
    }
    if (w.owned.has('hoverboard')) w.owned.add('board-navy');
    const cons = raw.consumables && typeof raw.consumables === 'object' ? raw.consumables : {};
    for (const id of CONSUMABLE_IDS) {
      const n = toCount(cons[id]);
      if (n) w.consumables[id] = n;
    }
    const eq = raw.equipped && typeof raw.equipped === 'object' ? raw.equipped : {};
    for (const slot of SLOTS) {
      const item = itemById(eq[slot]);
      w.equipped[slot] = item && item.slot === slot && w.owned.has(item.id) ? item.id : null;
    }
    if (!w.equipped.board && w.owned.has('board-navy')) w.equipped.board = 'board-navy';
    return api;
  }

  function snapshot() {
    return {
      v: 1,
      coins: w.coins,
      owned: Array.from(w.owned),
      consumables: Object.assign({}, w.consumables),
      equipped: { board: w.equipped.board, hat: w.equipped.hat },
    };
  }

  function save() {
    try { store.set(WALLET_KEY, snapshot()); } catch (e) { /* storage unavailable */ }
    return api;
  }

  function changed() {
    save();
    if (typeof api.onChange === 'function') {
      try { api.onChange(api); } catch (e) { /* a listener failure never breaks the wallet */ }
    }
  }

  function add(n) {
    const k = toCount(n);
    if (!k) return w.coins;
    w.coins += k;
    changed();
    return w.coins;
  }

  function spend(n) {
    const k = Math.floor(Number(n));
    if (!Number.isFinite(k) || k < 0) return false;
    if (k > w.coins) return false;
    if (k === 0) return true;
    w.coins -= k;
    changed();
    return true;
  }

  function count(id) {
    const item = itemById(id);
    if (!item) return 0;
    if (item.kind === 'consumable') return w.consumables[item.id] || 0;
    return w.owned.has(item.id) ? 1 : 0;
  }

  function owns(id) {
    return count(id) > 0;
  }

  /* Why a purchase would be refused, or null when it would go through. The shop shows the reason. */
  function refusal(id) {
    const item = itemById(id);
    if (!item) return 'unknown';
    if (item.kind === 'one-time' && w.owned.has(item.id)) return 'owned';
    if (item.price > w.coins) return 'short';
    return null;
  }

  function buy(id) {
    if (refusal(id)) return false;
    const item = itemById(id);
    w.coins -= item.price;
    if (item.kind === 'consumable') {
      w.consumables[item.id] = (w.consumables[item.id] || 0) + 1;
    } else {
      w.owned.add(item.id);
      if (item.id === 'hoverboard') {
        w.owned.add('board-navy');
        if (!w.equipped.board) w.equipped.board = 'board-navy';
      }
      if (item.slot) w.equipped[item.slot] = item.id;
    }
    changed();
    return true;
  }

  function equip(slot, id) {
    if (!SLOTS.includes(slot)) return false;
    if (id === null || id === undefined || id === '') {
      if (w.equipped[slot] === null) return true;
      w.equipped[slot] = null;
      changed();
      return true;
    }
    const item = itemById(id);
    if (!item || item.slot !== slot || !w.owned.has(item.id)) return false;
    if (w.equipped[slot] === item.id) return true;
    w.equipped[slot] = item.id;
    changed();
    return true;
  }

  function consume(id) {
    const item = itemById(id);
    if (!item || item.kind !== 'consumable') return false;
    const n = w.consumables[item.id] || 0;
    if (n <= 0) return false;
    if (n === 1) delete w.consumables[item.id]; else w.consumables[item.id] = n - 1;
    changed();
    return true;
  }

  const api = {
    get coins() { return w.coins; },
    get equipped() { return { board: w.equipped.board, hat: w.equipped.hat }; },
    get owned() { return Array.from(w.owned); },
    catalogue: CATALOGUE,
    itemById,
    add, spend, owns, count, buy, refusal, equip, consume, load, save,
    toJSON: snapshot,
    onChange: null,
  };
  load();
  return api;
}
