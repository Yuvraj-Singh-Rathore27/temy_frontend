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
  saveTexts: (records) =>
    run('texts', 'readwrite', (s) => {
      for (const record of records) s.put(record);
    }),
  deleteText: (id) => run('texts', 'readwrite', (s) => s.delete(id)),

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
    const all = await run('texts', 'readonly', (s) => s.index('byOwner').getAll(ownerId));
    return all
      .filter((r) => (!conversationId || r.conversationId === conversationId) && r.text.toLocaleLowerCase().includes(needle))
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  },
};
