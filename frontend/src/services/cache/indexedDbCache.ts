import type { CacheEntry } from './types';

const DB_NAME = '7anime_cache_v3';
const STORE_NAME = 'metadata';
const DB_VERSION = 1;

/**
 * L2 Browser Persistent Cache backed by IndexedDB.
 * Preserves structured metadata across tab closes and page reloads.
 * Degrades gracefully if IndexedDB is blocked or quota is exceeded.
 */
export class IndexedDbCache {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private isAvailable: boolean;
  public hits = 0;
  public failedWrites = 0;

  constructor() {
    this.isAvailable = typeof window !== 'undefined' && 'indexedDB' in window;
  }

  private async getDb(): Promise<IDBDatabase | null> {
    if (!this.isAvailable) return null;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('expiresAt', 'expiresAt', { unique: false });
          }
        };

        req.onsuccess = () => {
          resolve(req.result);
        };

        req.onerror = () => {
          console.warn('[IndexedDbCache] IndexedDB open error, operating in memory-only mode');
          resolve(null);
        };

        req.onblocked = () => {
          console.warn('[IndexedDbCache] IndexedDB blocked');
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async get<T>(key: string): Promise<{ entry: CacheEntry<T> | null; isStale: boolean }> {
    const db = await this.getDb();
    if (!db) return { entry: null, isStale: false };

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const record = req.result;
          if (!record || !record.entry) {
            resolve({ entry: null, isStale: false });
            return;
          }

          const entry = record.entry as CacheEntry<T>;
          const now = Date.now();

          if (now > entry.expiresAt) {
            const staleUntil = entry.staleUntil ?? entry.expiresAt;
            if (now <= staleUntil) {
              this.hits++;
              resolve({ entry, isStale: true });
              return;
            }

            // Purge expired record
            this.delete(key);
            resolve({ entry: null, isStale: false });
            return;
          }

          this.hits++;
          resolve({ entry, isStale: false });
        };

        req.onerror = () => {
          resolve({ entry: null, isStale: false });
        };
      } catch {
        resolve({ entry: null, isStale: false });
      }
    });
  }

  public async set<T>(key: string, entry: CacheEntry<T>): Promise<boolean> {
    const db = await this.getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const record = {
          key,
          entry,
          expiresAt: entry.expiresAt,
          tags: entry.tags || [],
        };

        const req = store.put(record);

        req.onsuccess = () => resolve(true);

        req.onerror = () => {
          this.failedWrites++;
          resolve(false);
        };

        tx.onabort = () => {
          this.failedWrites++;
          resolve(false);
        };
      } catch {
        this.failedWrites++;
        resolve(false);
      }
    });
  }

  public async delete(key: string): Promise<boolean> {
    const db = await this.getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async clear(): Promise<boolean> {
    const db = await this.getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async deleteByTag(tag: string): Promise<number> {
    const db = await this.getDb();
    if (!db) return 0;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        let deleted = 0;

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
          if (cursor) {
            const record = cursor.value;
            if (record.tags && Array.isArray(record.tags) && record.tags.includes(tag)) {
              cursor.delete();
              deleted++;
            }
            cursor.continue();
          } else {
            resolve(deleted);
          }
        };

        req.onerror = () => resolve(deleted);
      } catch {
        resolve(0);
      }
    });
  }

  public async deleteByPrefix(prefix: string): Promise<number> {
    const db = await this.getDb();
    if (!db) return 0;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        let deleted = 0;

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
          if (cursor) {
            if (String(cursor.key).startsWith(prefix)) {
              cursor.delete();
              deleted++;
            }
            cursor.continue();
          } else {
            resolve(deleted);
          }
        };

        req.onerror = () => resolve(deleted);
      } catch {
        resolve(0);
      }
    });
  }

  public async count(): Promise<number> {
    const db = await this.getDb();
    if (!db) return 0;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  }
}
