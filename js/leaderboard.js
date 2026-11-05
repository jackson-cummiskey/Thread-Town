/* Thread Town leaderboard (CONTRACT_V6 "Leaderboard", CONTRACT_V10 "Thread National").

   Public surface:
     createLeaderboard(storage) -> { record(game, entry), top(game, n = 10), all(), archived(), clear(game) }
     storage = { get(key), set(key, value) }; values are JSON-serializable objects (the renderer
     wraps localStorage). A missing storage, a throwing storage, or corrupt data all read as empty.

   Storage key threadtown.leaderboard.v1 holds { subway: [entry], golf: [entry], archive: { golf: [entry] } } with
     entry = { name, character: 'alien' | speciesId, score, detail, at: epoch ms }.
   subway: score is distance in meters (higher is better), detail = { coins, seconds }.
   golf:   score is total strokes for a completed nine-hole round at Thread National (lower is better),
           detail = { seconds, card: [9], toPar, holes: 9 }. Only entries whose detail.holes === 9 are
           accepted by record; a golf entry in storage without holes === 9 (the six-hole rounds of
           versions 7 to 9) is moved to archive.golf on the first load, kept there, and never shown.
   Ties break by earlier at. At most 50 entries per game are kept in storage; the archive keeps 200. */

export const LEADERBOARD_KEY = 'threadtown.leaderboard.v1';
export const LEADERBOARD_CAP = 50;
export const ARCHIVE_CAP = 200;
export const GOLF_HOLES = 9;
export const COURSE_NAME = 'Thread National';
export const GAME_LABELS = { subway: 'Subway', golf: COURSE_NAME + ' · ' + GOLF_HOLES + ' holes' };
const GAMES = ['subway', 'golf'];

function compareFor(game) {
  const sign = game === 'golf' ? 1 : -1;   // golf ascending, everything else descending
  return (a, b) => {
    if (a.score !== b.score) return sign * (a.score - b.score);
    return a.at - b.at;
  };
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/* Returns a clean copy of an entry or null when it cannot be a valid entry. */
function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const score = Number(raw.score);
  if (!Number.isFinite(score)) return null;
  const at = isFiniteNumber(raw.at) ? raw.at : Date.now();
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'Visitor';
  const character = typeof raw.character === 'string' && raw.character ? raw.character : 'alien';
  const detail = raw.detail && typeof raw.detail === 'object' ? copyPlain(raw.detail) : {};
  return { name, character, score, detail, at };
}

/* A golf entry counts as a full round only with detail.holes === GOLF_HOLES (a number, exactly). */
export function isFullRound(entry) {
  return !!(entry && entry.detail && typeof entry.detail === 'object' && entry.detail.holes === GOLF_HOLES);
}

function copyPlain(v) {
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return {}; }
}

function copyEntry(e) {
  return { name: e.name, character: e.character, score: e.score, detail: copyPlain(e.detail), at: e.at };
}

function emptyBoard() {
  const b = { archive: { golf: [] } };
  for (const g of GAMES) b[g] = [];
  return b;
}

export function createLeaderboard(storage) {
  const store = storage && typeof storage.get === 'function' && typeof storage.set === 'function'
    ? storage
    : { get() { return null; }, set() {} };

  /* Reads storage. Golf entries that are not full nine-hole rounds move to the archive; when any
     moved, the board is written back at once so the move happens on the first load only. */
  function load() {
    let raw = null;
    try { raw = store.get(LEADERBOARD_KEY); } catch (e) { raw = null; }
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { raw = null; }
    }
    const board = emptyBoard();
    if (!raw || typeof raw !== 'object') return board;
    const rawArchive = raw.archive && typeof raw.archive === 'object' && Array.isArray(raw.archive.golf) ? raw.archive.golf : [];
    for (const item of rawArchive) {
      const e = cleanEntry(item);
      if (e) board.archive.golf.push(e);
    }
    let moved = 0;
    for (const g of GAMES) {
      const list = Array.isArray(raw[g]) ? raw[g] : [];
      const clean = [];
      for (const item of list) {
        const e = cleanEntry(item);
        if (!e) continue;
        if (g === 'golf' && !isFullRound(e)) { board.archive.golf.push(e); moved++; continue; }
        clean.push(e);
      }
      clean.sort(compareFor(g));
      board[g] = clean.slice(0, LEADERBOARD_CAP);
    }
    board.archive.golf.sort((a, b) => a.at - b.at);
    if (board.archive.golf.length > ARCHIVE_CAP) board.archive.golf = board.archive.golf.slice(board.archive.golf.length - ARCHIVE_CAP);
    if (moved) save(board);
    return board;
  }

  function save(board) {
    const out = { archive: { golf: board.archive.golf.map(copyEntry) } };
    for (const g of GAMES) out[g] = board[g].map(copyEntry);
    try { store.set(LEADERBOARD_KEY, out); } catch (e) { /* storage unavailable */ }
  }

  function known(game) {
    return GAMES.includes(game);
  }

  /* Adds an entry and returns { rank, total } for it (1-based rank among everything recorded,
     total counted before the cap is applied, so a run past the cap still gets an honest rank).
     A golf entry must be a completed nine-hole round: detail.holes === 9, else it is refused. */
  function record(game, entry) {
    if (!known(game)) throw new Error('leaderboard: unknown game ' + String(game));
    const e = cleanEntry(entry);
    if (!e) throw new Error('leaderboard: entry needs a numeric score');
    if (game === 'golf' && !isFullRound(e)) throw new Error('leaderboard: golf records need a completed nine-hole round (detail.holes = ' + GOLF_HOLES + ')');
    const board = load();
    const list = board[game];
    list.push(e);
    list.sort(compareFor(game));
    const rank = list.indexOf(e) + 1;
    const total = list.length;
    board[game] = list.slice(0, LEADERBOARD_CAP);
    save(board);
    return { rank, total };
  }

  function top(game, n = 10) {
    if (!known(game)) return [];
    const count = Math.max(0, Math.floor(Number(n)) || 0);
    return load()[game].slice(0, count).map(copyEntry);
  }

  function all() {
    const board = load();
    const out = {};
    for (const g of GAMES) out[g] = board[g].map(copyEntry);
    return out;
  }

  /* The archived golf entries (older rounds that were not nine holes), oldest first. */
  function archived() {
    return { golf: load().archive.golf.map(copyEntry) };
  }

  /* clear('subway') empties one game; clear() with no game empties both. The archive stays. */
  function clear(game) {
    const board = load();
    if (game === undefined || game === null) {
      for (const g of GAMES) board[g] = [];
    } else if (known(game)) {
      board[game] = [];
    } else {
      return;
    }
    save(board);
  }

  return { record, top, all, archived, clear };
}
