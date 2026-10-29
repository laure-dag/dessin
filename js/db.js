// Stockage local (IndexedDB) : tout reste sur le téléphone.

const DB_NAME = 'carnet-dessin';
const DB_VERSION = 1;
const STORES = ['entries', 'progress', 'colors', 'palettes', 'swatches', 'flags', 'meta'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('day', 'day');
        db.createObjectStore('progress', { keyPath: 'day' });
        db.createObjectStore('colors', { keyPath: 'id' });
        db.createObjectStore('palettes', { keyPath: 'id' });
        db.createObjectStore('swatches', { keyPath: 'id' });
        db.createObjectStore('flags', { keyPath: 'url' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  const t = db.transaction(store, mode);
  const result = await fn(t.objectStore(store));
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return result;
}

export const db = {
  all: (store) => tx(store, 'readonly', (s) => promisify(s.getAll())),
  get: (store, key) => tx(store, 'readonly', (s) => promisify(s.get(key))),
  put: (store, value) => tx(store, 'readwrite', (s) => promisify(s.put(value))),
  delete: (store, key) => tx(store, 'readwrite', (s) => promisify(s.delete(key))),
  clear: (store) => tx(store, 'readwrite', (s) => promisify(s.clear())),
  byDay: (day) => tx('entries', 'readonly', (s) => promisify(s.index('day').getAll(day))),
  async getMeta(key, fallback = null) {
    const row = await this.get('meta', key);
    return row ? row.value : fallback;
  },
  setMeta: (key, value) => db.put('meta', { key, value }),
  STORES,
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Sauvegarde / restauration -------------------------------------------

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

const BLOB_FIELDS = ['photo', 'thumb'];

export async function exportAll() {
  const out = { app: 'carnet-dessin', version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const store of STORES) {
    const rows = await db.all(store);
    for (const row of rows) {
      for (const f of BLOB_FIELDS) {
        if (row[f] instanceof Blob) row[f] = await blobToDataURL(row[f]);
      }
    }
    out.stores[store] = rows;
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}

export async function importAll(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'carnet-dessin' || !data.stores) {
    throw new Error("Ce fichier n'est pas une sauvegarde du carnet.");
  }
  for (const store of STORES) {
    const rows = data.stores[store] || [];
    await db.clear(store);
    for (const row of rows) {
      for (const f of BLOB_FIELDS) {
        if (typeof row[f] === 'string' && row[f].startsWith('data:')) row[f] = await dataURLToBlob(row[f]);
      }
      await db.put(store, row);
    }
  }
}
