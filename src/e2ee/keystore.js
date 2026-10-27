/**
 * Local, per-browser storage for end-to-end encryption (IndexedDB):
 * - devices:  this browser's key pair per account (the private key is a
 *             non-extractable CryptoKey: usable, never readable)
 * - liveKeys: message keys of my running live locations (to keep updating after a reload)
 * - texts:    decrypted message text, so search works on this device
 * Nothing here ever leaves the browser.
 */
const DB_NAME = 'temu-e2ee';
const VERSION = 2;
let dbPromise = null;
let pendingOpen = null; // an open request still in progress (possibly creating the database)

/**
 * Leaving the page (reload, navigation, back/forward cache): abort an unfinished
 * database creation and close the connection. Otherwise a frozen page can keep
 * the next page from opening the database at all.
 */
function release() {
  try {
    pendingOpen?.transaction?.abort();
  } catch {
    // nothing in progress
  }
  pendingOpen = null;
  const closing = dbPromise;
  dbPromise = null;
  closing?.then((db) => db.close()).catch(() => {});
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', release);
  document.addEventListener('freeze', release);
}

/**
 * Open the database. If a page reload interrupted its creation, the browser can
 * keep a new open request waiting; give up after a few seconds and try once more.
 */
function open() {
  dbPromise ??= openOnce()
    .catch(() => openOnce())
    .catch((error) => {
      dbPromise = null; // let a later call try again
      throw error;
    });
  return dbPromise;
}

function openOnce(timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('The browser storage did not open in time'));
    }, timeoutMs);
    const request = indexedDB.open(DB_NAME, VERSION);
    pendingOpen = request;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('devices')) db.createObjectStore('devices', { keyPath: 'userId' });
      if (!db.objectStoreNames.contains('liveKeys')) db.createObjectStore('liveKeys', { keyPath: 'messageId' });
      if (!db.objectStoreNames.contains('texts')) {
        const texts = db.createObjectStore('texts', { keyPath: 'id' });
        texts.createIndex('byOwner', 'ownerId');
      }
      // v2: encrypted GIFs I sent (their keys stay on this device), for "Recent GIFs".
      if (!db.objectStoreNames.contains('gifs')) {
        const gifs = db.createObjectStore('gifs', { keyPath: 'attachmentId' });
        gifs.createIndex('byOwner', 'ownerId');
      }
    };
    request.onsuccess = () => {
      if (pendingOpen === request) pendingOpen = null;
      const db = request.result;
      if (settled) return db.close(); // too late: a retry is already under way
      clearTimeout(timer);
      // Another tab upgrading the database: step aside instead of blocking it.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
  });
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    // A request's result can legitimately be undefined (key not found): return that, not the request.
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const keystore = {
  available: () => typeof indexedDB !== 'undefined',

  getDevice: (userId) => run('devices', 'readonly', (s) => s.get(userId)),
  saveDevice: (record) => run('devices', 'readwrite', (s) => s.put(record)),
  deleteDevice: (userId) => run('devices', 'readwrite', (s) => s.delete(userId)),

  getLiveKey: async (messageId) => (await run('liveKeys', 'readonly', (s) => s.get(messageId)))?.key ?? null,
  saveLiveKey: (messageId, key) => run('liveKeys', 'readwrite', (s) => s.put({ messageId, key })),
  deleteLiveKey: (messageId) => run('liveKeys', 'readwrite', (s) => s.delete(messageId)),

  /** Remember decrypted text for on-device search (per signed-in account). */
  saveTexts: async (records) => {
    await run('texts', 'readwrite', (s) => {
      for (const record of records) s.put(record);
    });
    changeTexts({ save: records });
  },
  deleteText: async (id) => {
    await run('texts', 'readwrite', (s) => s.delete(id));
    changeTexts({ remove: id });
  },
  /** Start loading the texts for search (e.g. while the user is still typing). */
  warmTexts: (ownerId) => textsFor(ownerId).catch(() => {}),

  saveGif: (record) => run('gifs', 'readwrite', (s) => s.put(record)),
  /** Newest first, one per file. */
  recentGifs: async (ownerId, limit = 30) => {
    const all = await run('gifs', 'readonly', (s) => s.index('byOwner').getAll(ownerId));
    const seen = new Set();
    return all
      .sort((a, b) => b.attachmentId - a.attachmentId)
      .filter((g) => !seen.has(g.key) && seen.add(g.key))
      .slice(0, limit);
  },

  /** Messages of `ownerId` whose text contains `query` (case-insensitive), newest first. */
  searchTexts: async (ownerId, query, { conversationId, limit = 50 } = {}) => {
    const needle = query.toLocaleLowerCase();
    const matches = [];
    for (const { record, lower } of (await textsFor(ownerId)).values()) {
      if ((!conversationId || record.conversationId === conversationId) && lower.includes(needle)) matches.push(record);
    }
    return matches.sort((a, b) => b.id - a.id).slice(0, limit);
  },
};

/**
 * Reading every saved text from IndexedDB takes about a second per 100,000 texts (counting
 * them takes half that), so a search keeps them in memory (lower-cased) for a while: typing
 * a few searches in a row reads the database once. Every change made here or in another tab
 * (BroadcastChannel) is applied to the copy; changes arriving while it loads are applied after.
 */
const TEXT_CACHE_MS = 2 * 60_000;
let textCache = null; // { ownerId, rows: Map<id, { record, lower }>, timer }
let textLoad = null; // { ownerId, promise, pending: [change] } while the texts are being read
const textChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('temu-e2ee-texts') : null;
if (textChannel) textChannel.onmessage = (event) => applyTextChange(event.data);

const cacheRow = (record) => ({ record, lower: record.text.toLocaleLowerCase() });

function dropTextCache() {
  clearTimeout(textCache?.timer);
  textCache = null;
}

/** `change`: { save: [record] } or { remove: id }. */
function applyTextChange(change) {
  textLoad?.pending.push(change);
  if (!textCache) return;
  for (const record of change.save ?? []) if (record.ownerId === textCache.ownerId) textCache.rows.set(record.id, cacheRow(record));
  if (change.remove != null) textCache.rows.delete(change.remove);
}

function changeTexts(change) {
  applyTextChange(change);
  textChannel?.postMessage(change);
}

async function textsFor(ownerId) {
  if (textCache?.ownerId !== ownerId) {
    if (textLoad?.ownerId !== ownerId) {
      const load = { ownerId, pending: [] };
      load.promise = run('texts', 'readonly', (s) => s.index('byOwner').getAll(ownerId))
        .then((all) => {
          if (textLoad === load) textLoad = null; // before replaying, so the replay isn't queued again
          dropTextCache();
          textCache = { ownerId, rows: new Map(all.map((record) => [record.id, cacheRow(record)])), timer: null };
          for (const change of load.pending) applyTextChange(change);
        })
        .finally(() => {
          if (textLoad === load) textLoad = null;
        });
      textLoad = load;
    }
    await textLoad.promise;
  }
  if (textCache?.ownerId !== ownerId) return new Map(); // another account signed in meanwhile
  clearTimeout(textCache.timer);
  textCache.timer = setTimeout(dropTextCache, TEXT_CACHE_MS);
  return textCache.rows;
}
