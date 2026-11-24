import type { CacheEntry, CacheMetrics } from './types';

/**
 * L1 In-Memory LRU Cache with byte estimation, expiration sweeping,
 * and in-flight request deduplication.
 */
export class MemoryLruCache {
  private map = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private maxEntries: number;
  private maxSizeBytes: number;
  private currentSizeBytes = 0;

  // Local metric counters
  public hits = 0;
  public misses = 0;
  public evictions = 0;
  public deduplications = 0;

  constructor(maxEntries = 500, maxSizeBytes = 25 * 1024 * 1024) {
    this.maxEntries = maxEntries;
    this.maxSizeBytes = maxSizeBytes;

    // Periodic sweep every 5 minutes in browser environment
    if (typeof window !== 'undefined') {
      window.setInterval(() => this.sweepExpired(), 5 * 60 * 1000);
    }
  }

  public get<T>(key: string): { entry: CacheEntry<T> | null; isStale: boolean } {
    const entry = this.map.get(key);
    if (!entry) {
      return { entry: null, isStale: false };
    }

    const now = Date.now();

    // Check expiration
    if (now > entry.expiresAt) {
      // Check if it's within the stale-while-revalidate window
      const staleUntil = entry.staleUntil ?? entry.expiresAt;
      if (now <= staleUntil) {
        // Return stale entry for instant rendering while background refresh executes
        return { entry: entry as CacheEntry<T>, isStale: true };
      }

      // Completely expired; remove and report miss
      this.delete(key);
      return { entry: null, isStale: false };
    }

    // Refresh LRU ordering: re-insert key so it moves to end of Map iterator
    this.map.delete(key);
    this.map.set(key, entry);

    return { entry: entry as CacheEntry<T>, isStale: false };
  }

  public set<T>(key: string, entry: CacheEntry<T>): void {
    // Delete existing to update size calculation and order
    if (this.map.has(key)) {
      this.delete(key);
    }

    const estimatedBytes = entry.sizeBytes ?? this.estimateSize(entry.value);
    entry.sizeBytes = estimatedBytes;

    // Ensure capacity
    while (
      (this.map.size >= this.maxEntries ||
        (this.currentSizeBytes + estimatedBytes > this.maxSizeBytes && this.map.size > 0)) &&
      this.map.size > 0
    ) {
      this.evictOldest();
    }

    this.map.set(key, entry);
    this.currentSizeBytes += estimatedBytes;
  }

  public delete(key: string): boolean {
    const entry = this.map.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.sizeBytes ?? 0;
      if (this.currentSizeBytes < 0) this.currentSizeBytes = 0;
      return this.map.delete(key);
    }
    return false;
  }

  public has(key: string): boolean {
    const res = this.get(key);
    return res.entry !== null;
  }

  public clear(): void {
    this.map.clear();
    this.inFlight.clear();
    this.currentSizeBytes = 0;
  }

  public getInFlight<T>(key: string): Promise<T> | null {
    const existing = this.inFlight.get(key);
    if (existing) {
      this.deduplications++;
      return existing as Promise<T>;
    }
    return null;
  }

  public setInFlight<T>(key: string, promise: Promise<T>): void {
    this.inFlight.set(key, promise);
  }

  public deleteInFlight(key: string): void {
    this.inFlight.delete(key);
  }

  public getKeys(): string[] {
    return Array.from(this.map.keys());
  }

  public getEntry(key: string): CacheEntry<any> | undefined {
    return this.map.get(key);
  }

  public get size(): number {
    return this.map.size;
  }

  public get sizeBytes(): number {
    return this.currentSizeBytes;
  }

  private evictOldest(): void {
    const firstKey = this.map.keys().next().value;
    if (firstKey !== undefined) {
      this.delete(firstKey);
      this.evictions++;
    }
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      const staleUntil = entry.staleUntil ?? entry.expiresAt;
      if (now > staleUntil) {
        this.delete(key);
      }
    }
  }

  private estimateSize(value: any): number {
    try {
      if (value === null || value === undefined) return 8;
      if (typeof value === 'boolean') return 4;
      if (typeof value === 'number') return 8;
      if (typeof value === 'string') return value.length * 2;
      return JSON.stringify(value).length * 2;
    } catch {
      return 512;
    }
  }
}
