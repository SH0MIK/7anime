import { config } from '../../config/env.js';
import { MemoryCacheService } from './memory-cache.service.js';

export const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60; // 604,800 seconds (7 days)
export const NEGATIVE_CACHE_SECONDS = 24 * 60 * 60; // 24 hours for confirmed missing records

export interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
  source?: string;
  ttlSeconds: number;
}

/**
 * Global Shared Redis Cache Service:
 * - Shared across all users (single source of truth for public anime metadata).
 * - Tier 1: Upstash Redis over REST (Persistent, Distributed)
 * - Tier 2: In-Memory Cache (Zero-latency fallback when Redis is unconfigured or unreachable)
 * - In-flight request deduplication (cache stampede prevention).
 */
export class RedisCacheService {
  private memoryFallback: MemoryCacheService;
  private isConfigured: boolean;
  private restUrl?: string;
  private restToken?: string;
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  constructor() {
    this.restUrl = (config.upstashRedisRestUrl || '').replace(/^["']|["']$/g, '').trim();
    this.restToken = (config.upstashRedisRestToken || '').replace(/^["']|["']$/g, '').trim();
    this.isConfigured = Boolean(this.restUrl && this.restToken);
    this.memoryFallback = new MemoryCacheService(SEVEN_DAYS_SECONDS * 1000);
  }

  /**
   * Retrieves an item from Upstash Redis, falling back to local memory cache.
   */
  public async get<T>(key: string): Promise<T | null> {
    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`${this.restUrl}/get/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          if (json && json.result !== null && json.result !== undefined) {
            try {
              if (typeof json.result === 'string') {
                return JSON.parse(json.result) as T;
              }
              return json.result as T;
            } catch {
              return json.result as T;
            }
          }
          return null;
        }
      } catch (err) {
        console.warn(`[RedisCacheService] Redis GET failed for key "${key}", using memory fallback:`, (err as Error).message);
      }
    }

    // Fallback to local memory cache
    return this.memoryFallback.get<T>(key);
  }

  /**
   * Stores an item in Upstash Redis and local memory cache with TTL in seconds.
   * Default TTL is 7 days (604,800 seconds).
   */
  public async set<T>(key: string, value: T, ttlSeconds: number = SEVEN_DAYS_SECONDS): Promise<boolean> {
    // Always store in memory fallback
    this.memoryFallback.set(key, value, ttlSeconds * 1000);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const url = ttlSeconds > 0
          ? `${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}?ex=${ttlSeconds}`
          : `${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          return json?.result === 'OK';
        }
      } catch (err) {
        console.warn(`[RedisCacheService] Redis SET failed for key "${key}":`, (err as Error).message);
      }
    }

    return true;
  }

  /**
   * Cache-aside with In-Flight Request Deduplication (prevents cache stampede).
   */
  public async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = SEVEN_DAYS_SECONDS
  ): Promise<T> {
    // 1. Check existing cache
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // 2. Check if identical request is currently in-flight
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    // 3. Execute fetch and broadcast to concurrent callers
    const fetchPromise = (async (): Promise<T> => {
      try {
        const result = await fetchFn();
        if (result !== null && result !== undefined) {
          await this.set(key, result, ttlSeconds);
        }
        return result;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Deletes a key from Redis and local memory.
   */
  public async del(key: string): Promise<boolean> {
    this.memoryFallback.delete(key);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${this.restUrl}/del/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          return Boolean(json?.result && json.result > 0);
        }
      } catch (err) {
        console.warn(`[RedisCacheService] Redis DEL failed for key "${key}":`, (err as Error).message);
      }
    }

    return true;
  }

  /**
   * Alias for del(key) to conform with standard Cache / Map interface conventions
   * and prevent runtime TypeErrors if delete() is invoked.
   */
  public async delete(key: string): Promise<boolean> {
    return this.del(key);
  }

  /**
   * Checks if key exists in memory or Redis.
   */
  public async exists(key: string): Promise<boolean> {
    const memoryHit = this.memoryFallback.has(key);
    if (memoryHit) return true;

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${this.restUrl}/exists/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          return json?.result === 1;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Deletes all keys matching a given prefix from local memory and Redis.
   */
  public async delByPrefix(prefix: string): Promise<number> {
    const memoryDeleted = this.memoryFallback.deleteByPrefix(prefix);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        // Fetch keys matching prefix
        const keysRes = await fetch(`${this.restUrl}/keys/${encodeURIComponent(prefix + '*')}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (keysRes.ok) {
          const keysJson = (await keysRes.json()) as any;
          const matchingKeys = Array.isArray(keysJson?.result) ? keysJson.result : [];

          if (matchingKeys.length > 0) {
            // Delete matching keys in Redis
            const delController = new AbortController();
            const delTimeout = setTimeout(() => delController.abort(), 4000);
            await fetch(`${this.restUrl}/del/${matchingKeys.map((k: string) => encodeURIComponent(k)).join('/')}`, {
              headers: {
                Authorization: `Bearer ${this.restToken}`,
                Accept: 'application/json',
              },
              signal: delController.signal,
            });
            clearTimeout(delTimeout);
            return Math.max(memoryDeleted, matchingKeys.length);
          }
        }
      } catch (err) {
        console.warn(`[RedisCacheService] Redis delByPrefix failed for "${prefix}":`, (err as Error).message);
      }
    }

    return memoryDeleted;
  }

  /**
   * Health status of cache service.
   */
  public async getHealth(): Promise<{ redis: 'connected' | 'disconnected' | 'disabled'; memoryEntries: number }> {
    if (!this.isConfigured) {
      return { redis: 'disabled', memoryEntries: this.memoryFallback.getStats().size };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.restUrl}/ping`, {
        headers: { Authorization: `Bearer ${this.restToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = (await res.json()) as any;
        const isOk = json?.result === 'PONG' || json?.result === 'OK';
        return {
          redis: isOk ? 'connected' : 'disconnected',
          memoryEntries: this.memoryFallback.getStats().size,
        };
      }
      return { redis: 'disconnected', memoryEntries: this.memoryFallback.getStats().size };
    } catch {
      return { redis: 'disconnected', memoryEntries: this.memoryFallback.getStats().size };
    }
  }
}

export const redisCache = new RedisCacheService();
