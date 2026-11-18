/**
 * In-memory Cache Service with TTL and eviction.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private hits = 0;
  private misses = 0;

  constructor(private defaultTtlMs: number = 30 * 60 * 1000) {
    // Periodic sweep every 5 minutes
    setInterval(() => this.sweepExpired(), 5 * 60 * 1000).unref();
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)).toFixed(2) : '0.00',
    };
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instances for different domains
export const metadataCache = new MemoryCacheService(60 * 60 * 1000); // 1 hour for anime metadata
export const tmdbCache = new MemoryCacheService(2 * 60 * 60 * 1000); // 2 hours for TMDB responses
export const searchCache = new MemoryCacheService(15 * 60 * 1000); // 15 minutes for search queries
