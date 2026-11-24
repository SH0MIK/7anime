import { MemoryLruCache } from './memoryLruCache';
import { IndexedDbCache } from './indexedDbCache';
import type {
  CacheEntry,
  CacheSetOptions,
  CacheFetchOptions,
  CacheMetrics,
} from './types';

export const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours SWR window
export const DEFAULT_NEGATIVE_TTL_MS = 60 * 1000; // 60 seconds for 404 / null
const CACHE_VERSION = 3;

/**
 * Global Centralized Multi-Layer Intelligent Cache Manager.
 * Orchestrates L1 (Memory LRU) and L2 (IndexedDB Persistent) caching
 * with Stale-While-Revalidate, In-Flight Deduplication, Negative Caching,
 * and Tag/Prefix Invalidation.
 */
export class CacheManager {
  private static instance: CacheManager;
  private l1: MemoryLruCache;
  private l2: IndexedDbCache;

  private totalReads = 0;
  private revalidations = 0;
  private listeners = new Set<(stats: CacheMetrics) => void>();

  constructor() {
    this.l1 = new MemoryLruCache(600, 30 * 1024 * 1024); // 600 entries, ~30 MB max
    this.l2 = new IndexedDbCache();
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Retrieves an item from L1 (Memory) or L2 (IndexedDB).
   * Automatically promotes warm L2 hits into L1 for zero-latency subsequent access.
   */
  public async get<T>(key: string): Promise<T | null> {
    this.totalReads++;

    // 1. Check L1 Memory
    const l1Result = this.l1.get<T>(key);
    if (l1Result.entry) {
      this.l1.hits++;
      this.notifyStats();
      return l1Result.entry.value;
    }

    // 2. Check L2 IndexedDB
    const l2Result = await this.l2.get<T>(key);
    if (l2Result.entry) {
      // Promote warm entry into L1
      this.l1.set(key, l2Result.entry);
      this.notifyStats();
      return l2Result.entry.value;
    }

    this.l1.misses++;
    this.notifyStats();
    return null;
  }

  /**
   * Stores an item into L1 and L2 caches with configurable TTL and tags.
   */
  public async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const now = Date.now();
    const isNegative = value === null || value === undefined;
    const ttl = isNegative
      ? options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS
      : options.ttlMs ?? DEFAULT_TTL_MS;

    const staleTtl = options.staleTtlMs ?? (isNegative ? 0 : DEFAULT_STALE_TTL_MS);

    const entry: CacheEntry<T> = {
      value,
      cachedAt: now,
      expiresAt: now + ttl,
      staleUntil: now + ttl + staleTtl,
      tags: options.tags,
      version: CACHE_VERSION,
    };

    // Always store in L1
    this.l1.set(key, entry);

    // Store in L2 unless explicitly skipped or negative
    if (!options.skipL2 && !isNegative) {
      void this.l2.set(key, entry);
    }
  }

  /**
   * Deletes a key from all cache tiers.
   */
  public async delete(key: string): Promise<void> {
    this.l1.delete(key);
    await this.l2.delete(key);
  }

  /**
   * Checks if an active (non-expired) entry exists in L1 or L2.
   */
  public async has(key: string): Promise<boolean> {
    if (this.l1.has(key)) return true;
    const l2Res = await this.l2.get(key);
    return l2Res.entry !== null;
  }

  /**
   * Clears all cache tiers.
   */
  public async clear(): Promise<void> {
    this.l1.clear();
    await this.l2.clear();
    this.notifyStats();
  }

  /**
   * Cache-Aside fetch with In-Flight Deduplication and Stale-While-Revalidate (SWR).
   * - Cache-First: Returns valid cache without making network requests.
   * - Deduplication: Concurrent calls share a single executing Promise.
   * - SWR: Returns stale data immediately while executing background revalidation.
   * - Negative Caching: Cooldown suppression for empty/failed fetches.
   */
  public async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheFetchOptions = {}
  ): Promise<T> {
    this.totalReads++;

    if (!options.forceRefresh) {
      // 1. Check L1 Memory Cache
      const l1Result = this.l1.get<T>(key);
      if (l1Result.entry) {
        if (!l1Result.isStale) {
          // Fresh hit
          this.l1.hits++;
          this.notifyStats();
          return l1Result.entry.value;
        }

        // Stale hit: Return immediately and kick off background revalidation
        this.l1.hits++;
        this.triggerBackgroundRevalidate(key, fetchFn, options);
        if (options.onStaleHit) options.onStaleHit(l1Result.entry.value);
        this.notifyStats();
        return l1Result.entry.value;
      }

      // 2. Check L2 IndexedDB Cache
      const l2Result = await this.l2.get<T>(key);
      if (l2Result.entry) {
        // Promote to L1
        this.l1.set(key, l2Result.entry);

        if (!l2Result.isStale) {
          this.notifyStats();
          return l2Result.entry.value;
        }

        // Stale hit in L2: Return immediately and kick off background revalidation
        this.triggerBackgroundRevalidate(key, fetchFn, options);
        if (options.onStaleHit) options.onStaleHit(l2Result.entry.value);
        this.notifyStats();
        return l2Result.entry.value;
      }
    }

    // 3. Cache Miss: Check In-Flight Deduplication
    const inFlight = this.l1.getInFlight<T>(key);
    if (inFlight) {
      return inFlight;
    }

    this.l1.misses++;
    this.notifyStats();

    // 4. Execute Fetch
    const fetchPromise = (async (): Promise<T> => {
      try {
        const result = await fetchFn();
        await this.set(key, result, options);
        return result;
      } finally {
        this.l1.deleteInFlight(key);
      }
    })();

    this.l1.setInFlight(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Triggers a single background revalidation without duplicating in-flight promises.
   */
  private triggerBackgroundRevalidate<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheSetOptions
  ): void {
    if (this.l1.getInFlight(key)) return;

    this.revalidations++;
    const promise = (async () => {
      try {
        const fresh = await fetchFn();
        await this.set(key, fresh, options);
        this.notifyStats();
      } catch (err) {
        console.warn(`[CacheManager] Background revalidation failed for "${key}":`, err);
      } finally {
        this.l1.deleteInFlight(key);
      }
    })();

    this.l1.setInFlight(key, promise);
  }

  /**
   * Invalidates all cache entries across L1 and L2 matching a given tag.
   * e.g. invalidateByTag('anime:154587') clears detail, artwork, and episodes for that anime.
   */
  public async invalidateByTag(tag: string): Promise<number> {
    let purged = 0;

    // Purge L1 entries
    for (const key of this.l1.getKeys()) {
      const entry = this.l1.getEntry(key);
      if (entry?.tags && entry.tags.includes(tag)) {
        this.l1.delete(key);
        purged++;
      }
    }

    // Purge L2 entries
    const l2Purged = await this.l2.deleteByTag(tag);
    purged += l2Purged;

    this.notifyStats();
    return purged;
  }

  /**
   * Invalidates all cache entries starting with a specific prefix.
   * e.g. invalidateByPrefix('anime:search:') clears all search result caches.
   */
  public async invalidateByPrefix(prefix: string): Promise<number> {
    let purged = 0;

    // Purge L1
    for (const key of this.l1.getKeys()) {
      if (key.startsWith(prefix)) {
        this.l1.delete(key);
        purged++;
      }
    }

    // Purge L2
    const l2Purged = await this.l2.deleteByPrefix(prefix);
    purged += l2Purged;

    this.notifyStats();
    return purged;
  }

  /**
   * Compiles live operational cache metrics.
   */
  public getCacheStats(): CacheMetrics {
    const totalHits = this.l1.hits + this.l2.hits;
    const totalRequests = totalHits + this.l1.misses;
    const hitRatio = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;

    return {
      totalReads: this.totalReads,
      hitsL1: this.l1.hits,
      hitsL2: this.l2.hits,
      misses: this.l1.misses,
      revalidations: this.revalidations,
      deduplications: this.l1.deduplications,
      evictions: this.l1.evictions,
      failedWrites: this.l2.failedWrites,
      hitRatio: parseFloat(hitRatio.toFixed(1)),
      bytesEstimate: this.l1.sizeBytes,
      entryCountL1: this.l1.size,
      entryCountL2: 0, // Computed asynchronously when requested
    };
  }

  /**
   * Asynchronously gathers detailed L2 counts.
   */
  public async getDetailedStats(): Promise<CacheMetrics> {
    const stats = this.getCacheStats();
    stats.entryCountL2 = await this.l2.count();
    return stats;
  }

  public subscribeToStats(listener: (stats: CacheMetrics) => void): () => void {
    this.listeners.add(listener);
    listener(this.getCacheStats());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyStats(): void {
    if (this.listeners.size === 0) return;
    const stats = this.getCacheStats();
    for (const l of this.listeners) {
      try {
        l(stats);
      } catch {}
    }
  }
}

export const cacheManager = CacheManager.getInstance();
